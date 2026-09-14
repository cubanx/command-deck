import { expect, test } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import { reconcilePullRequest } from "#/github";
import { projectOpenSpec } from "#/openspec";
import { withDatabase } from "./mongo-support";

test.each([false, true])("merged PRs retain merge evidence when later fetch fails=%s", (failLater) =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await db.repositories.insertOne({
			_id: "2",
			repositoryId: "2",
			full_name: "ds9/ops",
			installationIds: ["9"],
			updatedAt: new Date(),
		});
		const mergeSha = "c".repeat(40);
		const defaultSha = "d".repeat(40);
		const connection = { nodes: [], pageInfo: { hasNextPage: false } };
		let failMerge = false,
			finishDefault = false;
		const reconcile = () =>
			reconcilePullRequest(db, {
				installationId: "9",
				repositoryId: "2",
				number: 143,
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
										isDraft: false,
										createdAt: "2026-08-20T12:00:00Z",
										updatedAt: "2026-08-24T12:00:00Z",
										title: "Retain the follow-up",
										body: "## OpenSpecs\n- retain-follow-up",
										url: "https://github.com/ds9/ops/pull/143",
										headRefName: "feature/retain-follow-up",
										headRefOid: "a".repeat(40),
										baseRefName: "main",
										mergeCommit: { oid: mergeSha },
										mergedAt: "2026-08-25T12:00:00Z",
										author: { login: "sisko" },
										mergeable: "MERGEABLE",
										reviewDecision: null,
										labels: connection,
										reviewRequests: { totalCount: 0 },
										reviews: connection,
										reviewThreads: connection,
										statusCheckRollup: { contexts: connection },
									},
								},
							},
						});
					if (value.includes("actions/runs")) return Response.json({ workflow_runs: [] });
					if (value.endsWith("/repos/ds9/ops")) return Response.json({ default_branch: "main" });
					if (value.includes("/commits/main")) return Response.json({ sha: defaultSha });
					throw new Error(`unexpected evidence request ${value}`);
				},
				fetchTasks: async ({ sha }) => {
					if (failMerge && sha === mergeSha) throw new Error("Defiant evidence unavailable");
					if (finishDefault && sha !== mergeSha) return "## Current progress [post-merge]\n- [x] Original obligation";
					return sha === mergeSha
						? "## Merge evidence [post-merge]\n- [ ] Original obligation"
						: "## Current progress [post-merge]\n- [x] Original obligation\n- [ ] Follow-up obligation";
				},
			});
		const result = await reconcile();
		expect(result.kind).toBe("changed");
		const stored = await db.pullRequests.findOne({ repositoryId: "2", number: 143 });
		expect(stored).toMatchObject({
			post_merge_source_commit: defaultSha,
			merged_source_commit: mergeSha,
		});
		expect(stored?.merged_open_specs).toMatchObject([{ source_commit: mergeSha, completed: 0, total: 1 }]);
		expect(stored?.open_specs).toMatchObject([{ source_commit: defaultSha, completed: 1, total: 2 }]);
		if (failLater) {
			failMerge = true;
			finishDefault = true;
			await reconcile();
			expect((await db.pullRequests.findOne({ _id: "2:143" }))?.merged_open_specs).toEqual(stored?.merged_open_specs);
		}
		await projectOpenSpec(db, {
			installationId: "9",
			accountLogin: "cubanx",
			repositoryId: "2",
			path: "openspec/changes/retain-follow-up/tasks.md",
			sha: "e".repeat(40),
			sourceRef: "main",
			content: "## New default progress [post-merge]\n- [ ] Follow-up obligation",
		});
		const refreshed = await db.pullRequests.findOne({ repositoryId: "2", number: 143 });
		expect(refreshed?.merged_open_specs).toMatchObject([{ source_commit: mergeSha, completed: 0, total: 1 }]);
		expect(refreshed).toMatchObject({ post_merge_source_commit: "e".repeat(40) });
	}),
);
