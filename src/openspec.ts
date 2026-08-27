import type { Db } from "#/db";
import { mutateUser } from "#/db";
import { approvedInstallationAccount, sameLogin } from "#/installations";
import { activeOpenSpecGroup } from "#/openspec-tasks";

export { type OpenSpecGate, openSpecGate } from "#/openspec-gate";

export const changedTaskPaths = (paths: string[]) =>
	paths.filter((path) => /^openspec\/changes\/[^/]+\/tasks\.md$/.test(path));

const openSpecSlug = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export type OpenSpecDeclaration = {
	state: "absent" | "empty" | "declared" | "invalid";
	slugs: string[];
};

export function parseOpenSpecDeclaration(body: unknown): OpenSpecDeclaration {
	if (typeof body !== "string") return { state: "absent", slugs: [] };
	const lines = body.split(/\r?\n/);
	const headings = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^##\s+OpenSpecs\s*$/.test(line));
	if (!headings.length) return { state: "absent", slugs: [] };
	if (headings.length !== 1) return { state: "invalid", slugs: [] };
	const slugs: string[] = [];
	for (let index = headings[0]!.index + 1; index < lines.length; index++) {
		const line = lines[index]!;
		if (/^#{1,6}(?:\s|$)/.test(line)) break;
		if (!line.trim()) continue;
		const bullet = line.match(/^\s*[-*+]\s+(?:`([A-Za-z0-9][A-Za-z0-9._-]*)`|([A-Za-z0-9][A-Za-z0-9._-]*))\s*$/);
		const slug = bullet?.[1] ?? bullet?.[2];
		if (!slug || !openSpecSlug.test(slug) || slugs.includes(slug)) return { state: "invalid", slugs: [] };
		slugs.push(slug);
	}
	return slugs.length ? { state: "declared", slugs: slugs.sort() } : { state: "empty", slugs: [] };
}

export const detectedOpenSpecSlugs = (paths: ReadonlyArray<string>) =>
	[
		...new Set(
			paths
				.map((path) => path.match(/^openspec\/changes\/([^/]+)\//)?.[1])
				.filter((slug): slug is string => Boolean(slug && slug !== "archive" && openSpecSlug.test(slug))),
		),
	].sort();

export function parseTasks(content: string) {
	const groups: Array<{
		title: string;
		tasks: Array<{ completed: boolean; text: string }>;
	}> = [];
	let title = "Tasks";
	for (const line of content.split(/\r?\n/)) {
		const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
		if (heading) {
			title = heading[1];
			continue;
		}
		const task = line.match(/^\s*- \[([ xX])\]\s+(.+?)\s*$/);
		if (!task) continue;
		let group = groups.at(-1);
		if (!group || group.title !== title) {
			group = { title, tasks: [] };
			groups.push(group);
		}
		group.tasks.push({
			completed: task[1].toLowerCase() === "x",
			text: task[2],
		});
	}
	const tasks = groups.flatMap((group) => group.tasks);
	const activeGroup = activeOpenSpecGroup(groups);
	return {
		completed: tasks.filter((task) => task.completed).length,
		total: tasks.length,
		preMergeReady: !activeGroup,
		activeGroup,
	};
}
export async function projectOpenSpec(
	db: Db,
	input: {
		installationId: string;
		accountLogin: string;
		repositoryId: string;
		path: string;
		changeName?: string;
		content?: string;
		deleted?: boolean;
		sha: string;
		sourceRef?: string;
	},
) {
	const changeName = input.changeName ?? input.path.split("/")[2];
	if (!changeName) throw new Error("invalid OpenSpec tasks path");
	if (input.deleted) {
		const users = await db.users
			.find({ "installations.installationId": input.installationId }, { projection: { _id: 1 } })
			.toArray();
		let changed = false;
		await Promise.all(
			users.map((user) =>
				mutateUser(db, user._id, (aggregate) => {
					const installation = aggregate.installations.find((item) => item.installationId === input.installationId);
					if (
						!installation ||
						!approvedInstallationAccount(installation.accountLogin) ||
						!sameLogin(installation.accountLogin, input.accountLogin)
					)
						return;
					const repository = installation.repositories.find((item) => item.repositoryId === input.repositoryId);
					if (repository) {
						const before = repository.openSpecs.length;
						repository.openSpecs = repository.openSpecs.filter((item) => item.change_name !== changeName);
						changed ||= repository.openSpecs.length !== before;
					}
				}),
			),
		);
		return { changed, completed: false };
	}
	const progress = parseTasks(input.content ?? "");
	const users = await db.users
		.find({ "installations.installationId": input.installationId }, { projection: { _id: 1 } })
		.toArray();
	let changed = false,
		completed = false;
	await Promise.all(
		users.map((user) =>
			mutateUser(db, user._id, (aggregate) => {
				const installation = aggregate.installations.find((item) => item.installationId === input.installationId);
				if (
					!installation ||
					!approvedInstallationAccount(installation.accountLogin) ||
					!sameLogin(installation.accountLogin, input.accountLogin)
				)
					return;
				const repository = installation.repositories.find((item) => item.repositoryId === input.repositoryId);
				if (!repository) return;
				const index = repository.openSpecs.findIndex((item) => item.change_name === changeName),
					previous = index >= 0 ? repository.openSpecs[index] : undefined;
				completed ||=
					progress.total > 0 &&
					progress.completed === progress.total &&
					(!previous || Number(previous.completed) < Number(previous.total));
				const next = {
					change_name: changeName,
					completed: progress.completed,
					total: progress.total,
					pre_merge_ready: progress.preMergeReady,
					source_commit: input.sha,
					...(input.sourceRef ? { source_ref: input.sourceRef } : {}),
					active_group: progress.activeGroup ? JSON.stringify(progress.activeGroup) : null,
					updated_at: new Date().toISOString(),
				};
				changed ||=
					!previous ||
					(["completed", "total", "pre_merge_ready", "source_commit", "source_ref", "active_group"] as const).some(
						(key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
					);
				if (index >= 0) repository.openSpecs[index] = next;
				else repository.openSpecs.push(next);
			}),
		),
	);
	return { changed, completed };
}
