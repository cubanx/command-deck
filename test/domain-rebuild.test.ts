import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { bindInstallation, createSession, dashboardForUser, upsertIdentity } from "#/access";
import { bootstrapInstallation } from "#/github";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

const head = "a".repeat(40),
	merge = "b".repeat(40),
	current = "c".repeat(40);
const closedPull = {
	number: 143,
	title: "Restore the Defiant",
	state: "closed",
	merged: true,
	merged_at: "2020-01-03T00:00:00Z",
	merge_commit_sha: merge,
	head: { sha: head, ref: "ops/restore-defiant" },
	user: { login: "sisko" },
	body: "## OpenSpecs\n- restore-defiant",
	html_url: "https://github.com/ds9/ops/pull/143",
};

test("clean start rebuilds old obligations and restores preferences before automatic signed-event refresh", () =>
	withDatabase(async (db) => {
		expect(await db.users.countDocuments({})).toBe(0);
		expect(await db.pullRequests.countDocuments({})).toBe(0);
		await upsertIdentity(db, "1701", "sisko");
		await bindInstallation(db, "1701", "42", "cubanx");
		const pages: string[] = [];
		const result = await bootstrapInstallation(
			db,
			"42",
			"fictional-token",
			async (input) => {
				const url = new URL(String(input));
				if (url.pathname.includes("/app/installations/")) return Response.json({ account: { login: "cubanx" } });
				if (url.pathname === "/installation/repositories")
					return Response.json({ repositories: [{ id: 301, full_name: "ds9/ops", default_branch: "main" }] });
				if (url.pathname.endsWith("/pulls") && url.searchParams.get("state") === "closed") {
					pages.push(url.searchParams.get("page") ?? "1");
					return url.searchParams.get("page") === "2"
						? Response.json([closedPull])
						: Response.json([], {
								headers: {
									link: '<https://api.github.com/repositories/301/pulls?state=closed&per_page=100&page=2>; rel="next"',
								},
							});
				}
				if (url.pathname.endsWith("/pulls"))
					return Response.json([{ number: 7, title: "Inspect shields", state: "open", user: { login: "sisko" } }]);
				if (url.pathname.endsWith("/graphql"))
					return Response.json({
						data: {
							repository: {
								pullRequest: {
									state: "MERGED",
									merged: true,
									isDraft: false,
									title: closedPull.title,
									body: closedPull.body,
									url: closedPull.html_url,
									createdAt: "2020-01-01T00:00:00Z",
									updatedAt: "2020-01-03T00:00:00Z",
									mergedAt: closedPull.merged_at,
									headRefName: "ops/restore-defiant",
									headRefOid: head,
									baseRefName: "main",
									mergeCommit: { oid: merge },
									author: { login: "sisko" },
									mergeable: "MERGEABLE",
									reviewDecision: null,
									labels: { nodes: [], pageInfo: { hasNextPage: false } },
									reviewRequests: { totalCount: 0 },
									reviews: { nodes: [], pageInfo: { hasNextPage: false } },
									reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
									statusCheckRollup: { contexts: { nodes: [], pageInfo: { hasNextPage: false } } },
								},
							},
						},
					});
				if (url.pathname.endsWith("/repos/ds9/ops")) return Response.json({ default_branch: "main" });
				if (url.pathname.includes("/commits/main"))
					return Response.json({ sha: current, commit: { committer: { date: "2026-09-13T00:00:00Z" } } });
				if (url.pathname.includes("/git/trees/"))
					return Response.json({
						truncated: false,
						tree: [{ type: "blob", path: "openspec/changes/restore-defiant/tasks.md" }],
					});
				if (url.pathname.includes("actions/runs")) return Response.json({ workflow_runs: [] });
				if (
					url.pathname.endsWith("/deployments") ||
					url.pathname.endsWith("/rulesets") ||
					url.pathname.includes("/branches/")
				)
					return Response.json([]);
				throw new Error(`unexpected fictional rebuild request ${url.pathname}`);
			},
			"fictional-app-jwt",
			async () => "## 1. Repair\n- [x] Restore shields\n## 2. Observe [post-merge]\n- [ ] Verify shields",
		);
		expect(result.kind).toBe("changed");
		expect(pages).toEqual(["1", "2"]);
		expect(await db.pullRequests.findOne({ _id: "301:143" })).toMatchObject({
			number: 143,
			state: "closed",
			retention_candidate: true,
			post_merge_source_commit: current,
		});
		expect((await dashboardForUser(db, "1701")).pullRequests).toEqual(
			expect.arrayContaining([expect.objectContaining({ number: 143 }), expect.objectContaining({ number: 7 })]),
		);
		const config = { ...testConfig, githubWebhookSecret: "fictional-defiant-secret" };
		const dependencies = { reconcilePullRequest: async () => ({ kind: "unchanged" as const }) };
		let app = createApp(db, config, undefined, dependencies);
		let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
		try {
			const first = await createSession(db, "1701");
			const preferences = { repositoryIds: ["301"], sort: { mode: "updated", direction: "desc" } };
			const saved = await app.fetch(
				new Request("http://local/api/preferences", {
					method: "PATCH",
					headers: { cookie: `dcc_session=${first.token}`, "content-type": "application/json" },
					body: JSON.stringify(preferences),
				}),
			);
			expect(saved.status).toBe(200);
			await app.drain();
			await app.stop();
			app = createApp(db, config, undefined, dependencies);
			const second = await createSession(db, "1701");
			const headers = { cookie: `dcc_session=${second.token}` };
			const snapshot = await (await app.fetch(new Request("http://local/api/snapshot", { headers }))).json();
			expect(snapshot.preferences).toMatchObject(preferences);
			expect(snapshot.pullRequests).toEqual(expect.arrayContaining([expect.objectContaining({ number: 143 })]));
			await app.drain();
			const stream = await app.fetch(new Request("http://local/events", { headers }));
			reader = stream.body?.getReader();
			if (!reader) throw new Error("missing live stream");
			await reader.read();
			const body = JSON.stringify({
				action: "edited",
				installation: { id: 42, account: { login: "cubanx" } },
				repository: { id: 301, full_name: "ds9/ops" },
				pull_request: {
					number: 7,
					title: "Shields online",
					state: "open",
					user: { login: "sisko" },
					updated_at: "2030-01-01T00:00:00Z",
				},
			});
			const response = await app.fetch(
				new Request("http://local/webhooks/github", {
					method: "POST",
					body,
					headers: {
						"x-github-event": "pull_request",
						"x-github-delivery": "defiant-rebuilt",
						"x-hub-signature-256": `sha256=${createHmac("sha256", config.githubWebhookSecret).update(body).digest("hex")}`,
					},
				}),
			);
			expect(response.status).toBe(202);
			// Observe automatic scheduling; do not manually drain to trigger the refresh.
			const frame = await Promise.race([reader.read(), new Promise<undefined>((resolve) => setTimeout(resolve, 2000))]);
			expect(frame ? new TextDecoder().decode(frame.value) : "").toContain("event: refresh");
			const refreshed = await (await app.fetch(new Request("http://local/api/snapshot", { headers }))).json();
			expect(refreshed.pullRequests).toEqual(
				expect.arrayContaining([expect.objectContaining({ number: 7, title: "Shields online" })]),
			);
			await app.drain();
			const receipt = await db.inboxDeliveries.findOne({ _id: "github:defiant-rebuilt" });
			expect(receipt).toMatchObject({
				status: "done",
				processingStartedAt: expect.any(Date),
				processedAt: expect.any(Date),
			});
			expect(receipt?.payload).toBeUndefined();
		} finally {
			await reader?.cancel();
			await app.drain();
			await app.stop();
		}
	}));
