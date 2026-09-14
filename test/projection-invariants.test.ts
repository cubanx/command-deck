import { expect, test } from "vitest";
import { bindInstallation, dashboardForUser, upsertIdentity } from "#/access";
import { type Db, upsertPullRequest } from "#/db";
import { acceptGitHubDelivery, drainInbox } from "#/events";
import { reconcilePullRequest } from "#/github";
import { projectOpenSpec } from "#/openspec";
import { withDatabase } from "./mongo-support";

async function seedPr(db: Db, pr: Record<string, unknown>) {
	await db.repositories.updateOne(
		{ _id: "2" },
		{ $set: { repositoryId: "2", full_name: "ds9/ops", installationIds: ["1"], updatedAt: new Date() } },
		{ upsert: true },
	);
	await upsertPullRequest(db, { repositoryId: "2", number: 7, ...pr });
}

test("provider identity mutations are idempotent", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "kira");
		await bindInstallation(db, "u", "1", "cubanx");
		const body = JSON.stringify({
			installation: { id: 1, account: { login: "cubanx" } },
			repository: { id: 2, full_name: "ds9/ops" },
			pull_request: {
				number: 7,
				title: "Defend",
				user: { login: "kira" },
				state: "open",
			},
		});
		await acceptGitHubDelivery(db, "a", "pull_request", body);
		await acceptGitHubDelivery(db, "b", "pull_request", body);
		await drainInbox(db);
		expect(await db.pullRequests.find({ repositoryId: "2" }).toArray()).toHaveLength(1);
	}));

test.each(["OPEN", "CLOSED", "NEW_HEAD"])("late %s repair preserves newer webhook and task projection", (state) =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "kira");
		await bindInstallation(db, "u", "1", "cubanx");
		const sha = "a".repeat(40);
		await seedPr(db, {
			number: 7,
			author_login: "kira",
			state: "open",
			head_sha: sha,
			updated_at: "2026-09-09T12:00:00Z",
		});
		const connection = { nodes: [], pageInfo: { hasNextPage: false } };
		await reconcilePullRequest(db, {
			installationId: "1",
			repositoryId: "2",
			number: 7,
			token: "fictional",
			fetcher: async (url) => {
				if (String(url).endsWith("/graphql")) {
					await acceptGitHubDelivery(
						db,
						"defiant-merged",
						"pull_request",
						JSON.stringify({
							action: state === "NEW_HEAD" ? "synchronize" : "closed",
							installation: { id: 1, account: { login: "cubanx" } },
							repository: { id: 2, full_name: "ds9/ops" },
							pull_request: {
								number: 7,
								state: state === "NEW_HEAD" ? "open" : "closed",
								merged: state !== "NEW_HEAD",
								title: "Defiant follow-up",
								user: { login: "kira" },
								head: { sha: state === "NEW_HEAD" ? "b".repeat(40) : sha, ref: "defiant" },
								updated_at: "2026-09-09T12:00:00Z",
							},
						}),
					);
					await drainInbox(db);
					await projectOpenSpec(db, {
						installationId: "1",
						accountLogin: "cubanx",
						repositoryId: "2",
						path: "openspec/changes/defiant/tasks.md",
						sha: "b".repeat(40),
						sourceRef: "defiant",
						content: "## Observe [post-merge]\n- [ ] Observe Defiant",
					});
					return Response.json({
						data: {
							repository: {
								pullRequest: {
									state: state === "NEW_HEAD" ? "OPEN" : state,
									author: { login: "kira" },
									headRefOid: sha,
									body: "## OpenSpecs\n- defiant",
									updatedAt: "2026-09-09T12:00:00Z",
									labels: connection,
									reviews: connection,
									reviewThreads: connection,
									reviewRequests: { totalCount: 0 },
									statusCheckRollup: null,
								},
							},
						},
					});
				}
				if (String(url).includes("actions/runs")) return Response.json({ workflow_runs: [] });
				if (String(url).includes("/files"))
					return Response.json([{ filename: "openspec/changes/defiant/tasks.md", status: "modified" }]);
				throw new Error("Unexpected fixture route");
			},
			fetchTasks: async () => "## Observe [post-merge]\n- [x] Observe Defiant",
		});
		const pullRequests = await db.pullRequests.find({ repositoryId: "2" }).toArray();
		const openSpecs = (pullRequests[0]?.open_specs ?? []) as Record<string, unknown>[];
		expect(pullRequests).toMatchObject([
			state === "NEW_HEAD"
				? { number: 7, state: "open", head_sha: "b".repeat(40) }
				: { number: 7, state: "closed", merged: true, retention_candidate: true },
		]);
		expect(openSpecs).toMatchObject([
			{ change_name: "defiant", completed: 0, total: 1, source_commit: "b".repeat(40) },
		]);
	}),
);

test.each([false, true])("late merged evidence cannot undo newer completion=%s", (newerComplete) =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "kira");
		await bindInstallation(db, "u", "1", "cubanx");
		await seedPr(db, {
			number: 7,
			author_login: "kira",
			state: "closed",
			merged: true,
			retention_candidate: true,
			post_merge_obligations: ["defiant", "bajor", "wormhole"],
		});
		await upsertIdentity(db, "alias", "kira");
		await bindInstallation(db, "alias", "1", "cubanx");

		const connection = { nodes: [], pageInfo: { hasNextPage: false } };
		const repair = (sha: string, complete: boolean, beforeTasks?: () => Promise<unknown>) => {
			let advanced = false;
			return reconcilePullRequest(db, {
				installationId: "1",
				repositoryId: "2",
				number: 7,
				token: "fictional",
				fetcher: async (url) => {
					const value = String(url);
					if (value.endsWith("/graphql"))
						return Response.json({
							data: {
								repository: {
									pullRequest: {
										state: "MERGED",
										merged: true,
										author: { login: "kira" },
										headRefOid: "c".repeat(40),
										body: "## OpenSpecs\n- defiant\n- bajor",
										baseRefName: "main",
										labels: connection,
										reviews: connection,
										reviewThreads: connection,
										reviewRequests: { totalCount: 0 },
										statusCheckRollup: null,
									},
								},
							},
						});
					if (value.includes("actions/runs")) return Response.json({ workflow_runs: [] });
					if (value.endsWith("/repos/ds9/ops")) return Response.json({ default_branch: "main" });
					if (value.endsWith("/commits/main")) return Response.json({ sha });
					throw new Error("Unexpected fixture route");
				},
				fetchTasks: async (task) => {
					expect(task.sha).toBe(sha);
					if (!advanced && beforeTasks) {
						advanced = true;
						await beforeTasks();
					}
					return `## ${task.path.includes("wormhole") ? "Build" : "Observe [post-merge]"}\n- [${complete ? "x" : " "}] Observe Defiant`;
				},
			});
		};
		const newerSha = "b".repeat(40);
		await repair("a".repeat(40), !newerComplete, () => repair(newerSha, newerComplete));
		for (const userId of ["u", "alias"]) {
			const pullRequests = (await dashboardForUser(db, userId)).pullRequests;
			const openSpecs = (pullRequests[0]?.open_specs ?? []) as Record<string, unknown>[];
			expect(pullRequests).toHaveLength(newerComplete ? 0 : 1);
			if (!newerComplete)
				expect(pullRequests[0]).toMatchObject({
					post_merge_source_commit: newerSha,
					post_merge_obligations: ["bajor", "defiant", "wormhole"],
				});
			expect(openSpecs).toHaveLength(newerComplete ? 0 : 3);
			for (const spec of openSpecs)
				expect(spec).toMatchObject({ source_commit: newerSha, completed: newerComplete ? 1 : 0 });
		}
	}),
);

test.each([false, true])("broad open-list snapshots preserve concurrent merged completion=%s", (complete) =>
	withDatabase(async (db) => {
		const { bootstrapInstallation } = await import("#/github");
		await upsertIdentity(db, "u", "kira");
		await bindInstallation(db, "u", "1", "cubanx");
		await seedPr(db, { number: 7, author_login: "kira", state: "open", head_sha: "a".repeat(40) });
		await bootstrapInstallation(
			db,
			"1",
			"fictional",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/")) return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({ repositories: [{ id: 2, full_name: "ds9/ops" }] });
				if (value.includes("/pulls?") && new URL(value).searchParams.get("state") === "open") {
					if (complete) await db.pullRequests.deleteOne({ _id: "2:7" });
					else
						await upsertPullRequest(db, {
							repositoryId: "2",
							number: 7,
							author_login: "kira",
							state: "closed",
							merged: true,
							retention_candidate: true,
							head_ref: "defiant",
						});
					await projectOpenSpec(db, {
						installationId: "1",
						accountLogin: "cubanx",
						repositoryId: "2",
						path: "openspec/changes/defiant/tasks.md",
						sha: "b".repeat(40),
						sourceRef: "defiant",
						content: "## Observe [post-merge]\n- [ ] Observe Defiant",
					});
					return Response.json([{ number: 7, user: { login: "kira" }, state: "open", head: { sha: "a".repeat(40) } }]);
				}
				return Response.json([]);
			},
			"app-jwt",
		);
		const pullRequests = await db.pullRequests.find({ repositoryId: "2" }).toArray();
		const openSpecs = (pullRequests[0]?.open_specs ?? []) as Record<string, unknown>[];
		expect(pullRequests).toHaveLength(complete ? 0 : 1);
		if (!complete) expect(pullRequests[0]).toMatchObject({ state: "closed", merged: true });
		if (complete) expect(openSpecs).toEqual([]);
		else expect(openSpecs).toMatchObject([{ change_name: "defiant", source_commit: "b".repeat(40) }]);
	}),
);
