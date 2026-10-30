import { expect, test } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import { type Db, upsertPullRequest } from "#/db";
import { acceptGitHubDelivery, drainInbox } from "#/events";
import { reconcilePullRequest } from "#/github";
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

test.each(["OPEN", "CLOSED", "NEW_HEAD"])("late %s repair preserves newer webhook projection", (state) =>
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
					return Response.json({
						data: {
							repository: {
								pullRequest: {
									state: state === "NEW_HEAD" ? "OPEN" : state,
									author: { login: "kira" },
									headRefOid: sha,
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
				throw new Error("Unexpected fixture route");
			},
		});
		const pullRequests = await db.pullRequests.find({ repositoryId: "2" }).toArray();
		expect(pullRequests).toMatchObject([
			state === "NEW_HEAD"
				? { number: 7, state: "open", head_sha: "b".repeat(40) }
				: { number: 7, state: "closed", merged: true, retention_candidate: true },
		]);
	}),
);
