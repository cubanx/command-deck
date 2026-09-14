import type { Db } from "#/db";
import { patchPullRequest } from "#/db";
import { approvedInstallationAccount, sameLogin } from "#/installations";
import { activeOpenSpecGroups } from "#/openspec-tasks";

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
	const activeGroups = activeOpenSpecGroups(groups);
	const incompleteGroups = groups.filter((group) => group.tasks.some((task) => !task.completed)).slice(0, 2);
	return {
		completed: tasks.filter((task) => task.completed).length,
		total: tasks.length,
		preMergeReady: !activeGroups.length,
		postMergeIncomplete: groups.some(
			(group) => group.title.includes("[post-merge]") && group.tasks.some((task) => !task.completed),
		),
		activeGroup: activeGroups[0] ?? null,
		activeGroups,
		incompleteGroups,
	};
}
const openSpecProjection = (
	changeName: string,
	progress: ReturnType<typeof parseTasks>,
	input: { content?: string; sha: string; sourceRef?: string },
	fullName?: string,
) => ({
	change_name: changeName,
	completed: progress.completed,
	total: progress.total,
	pre_merge_ready: progress.preMergeReady,
	source_commit: input.sha,
	...(input.sourceRef ? { source_ref: input.sourceRef } : {}),
	...(fullName
		? { source_url: `https://github.com/${fullName}/blob/${input.sha}/openspec/changes/${changeName}/tasks.md` }
		: {}),
	active_group: progress.activeGroup,
	active_groups: progress.activeGroups,
	incomplete_groups: progress.incompleteGroups,
	updated_at: new Date().toISOString(),
});
type OpenSpecProjectionInput = {
	installationId: string;
	accountLogin: string;
	repositoryId: string;
	path: string;
	changeName?: string;
	content?: string;
	deleted?: boolean;
	sha: string;
	sourceRef?: string;
};

const authorizedOpenSpecInstallation = async (db: Db, input: OpenSpecProjectionInput) => {
	const installation = await db.installations.findOne(
		{ _id: input.installationId },
		{ projection: { accountLogin: 1, active: 1, suspended: 1 } },
	);
	return Boolean(
		installation &&
			approvedInstallationAccount(installation.accountLogin) &&
			sameLogin(installation.accountLogin, input.accountLogin) &&
			installation.active !== false &&
			installation.suspended !== true,
	);
};

const removeOpenSpecEvidence = async (db: Db, input: OpenSpecProjectionInput, changeName: string) => {
	let changed = false;
	for (const target of await db.pullRequests
		.find({ repositoryId: input.repositoryId, "open_specs.change_name": changeName })
		.toArray()) {
		const owned =
			Array.isArray(target.open_specs) &&
			target.open_specs.some((item) => {
				const evidence = item as Record<string, unknown>;
				return (
					evidence.change_name === changeName &&
					((input.sourceRef && evidence.source_ref === input.sourceRef) || evidence.source_commit === input.sha)
				);
			});
		if (!owned) continue;
		const specs = Array.isArray(target.open_specs)
			? target.open_specs.filter((item) => (item as Record<string, unknown>).change_name !== changeName)
			: [];
		changed =
			(await patchPullRequest(db, target._id, { open_specs: specs }, [], {
				revision: target.revision,
				head_sha: target.head_sha,
				source_commit: target.source_commit,
			})) || changed;
	}
	return { changed, completed: false };
};

const findOpenSpecOwner = async (db: Db, input: OpenSpecProjectionInput, changeName: string) => {
	const candidates = (
		await db.pullRequests
			.find({
				repositoryId: input.repositoryId,
				$or: [
					{ head_sha: input.sha },
					...(input.sourceRef ? [{ head_ref: input.sourceRef }] : []),
					{ "open_specs.change_name": changeName },
				],
			})
			.toArray()
	).filter((candidate) => {
		if (candidate.head_sha === input.sha || (input.sourceRef && candidate.head_ref === input.sourceRef)) return true;
		return (
			Array.isArray(candidate.open_specs) &&
			candidate.open_specs.some((item) => {
				const evidence = item as Record<string, unknown>;
				return (
					evidence.change_name === changeName &&
					((input.sourceRef && evidence.source_ref === input.sourceRef) || evidence.source_commit === input.sha)
				);
			})
		);
	});
	const unique = [...new Map(candidates.map((item) => [item._id, item])).values()];
	return unique.length === 1 ? unique[0] : undefined;
};

export async function projectOpenSpec(db: Db, input: OpenSpecProjectionInput) {
	const changeName = input.changeName ?? input.path.split("/")[2];
	if (!changeName) throw new Error("invalid OpenSpec tasks path");
	if (!(await authorizedOpenSpecInstallation(db, input))) return { changed: false, completed: false };
	if (input.deleted) return removeOpenSpecEvidence(db, input, changeName);
	const progress = parseTasks(input.content ?? "");
	const repository = await db.repositories.findOne(
		{ repositoryId: input.repositoryId },
		{ projection: { full_name: 1 } },
	);
	const target = await findOpenSpecOwner(db, input, changeName);
	if (!target) return { changed: false, completed: false };
	const previous = Array.isArray(target.open_specs)
		? (target.open_specs as Record<string, unknown>[]).find((item) => item.change_name === changeName)
		: undefined;
	const evidence = {
		...openSpecProjection(changeName, progress, input, repository?.full_name),
		updated_at: previous?.updated_at ?? new Date().toISOString(),
	};
	const specs = Array.isArray(target.open_specs)
		? target.open_specs.filter((item) => (item as Record<string, unknown>).change_name !== changeName)
		: [];
	specs.push(evidence);
	const changed = await patchPullRequest(
		db,
		target._id,
		{
			open_specs: specs,
			...(target.merged === true || target.retention_candidate === true
				? {
						post_merge_source_commit: input.sha,
						...(input.sourceRef ? { post_merge_source_ref: input.sourceRef } : {}),
					}
				: {}),
		},
		[],
		{
			revision: target.revision,
			head_sha: target.head_sha,
			source_commit: target.source_commit,
		},
	);
	return {
		changed,
		completed:
			progress.total > 0 &&
			progress.completed === progress.total &&
			(!previous || Number(previous.completed ?? 0) < Number(previous.total ?? 0)),
	};
}
