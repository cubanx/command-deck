import { expect, test } from "vitest";
import { bindInstallation, dashboardForUser, upsertIdentity } from "#/access";
import {
	RECENT_MERGED_PULL_REQUEST_CAP,
	retainRecentMergedPullRequests,
} from "#/db";
import { shouldApplyDeploymentStatus } from "#/deployment-status";
import { acceptGitHubDelivery, drainInbox } from "#/events";
import { bootstrapInstallation } from "#/github";
import { withDatabase } from "./mongo-support";

const sha = (letter: string) => letter.repeat(40);
const mergedPullRequest = (
	number: number,
	head = sha("a"),
	merge = sha("b"),
) => ({
	action: "closed",
	installation: { id: 1, account: { login: "cubanx" } },
	repository: { id: 2, full_name: "ds9/ops" },
	pull_request: {
		number,
		title: "Hold the wormhole",
		html_url: `https://github.com/ds9/ops/pull/${number}`,
		state: "closed",
		merged: true,
		merged_at: "2030-01-02T00:00:00Z",
		merge_commit_sha: merge,
		head: { sha: head },
		user: { login: "sisko" },
	},
});

const deployment = (id: number, deploymentSha = sha("a")) => ({
	installation: { id: 1, account: { login: "cubanx" } },
	repository: { id: 2, full_name: "ds9/ops" },
	deployment: { id, sha: deploymentSha, created_at: "2030-01-02T00:00:00Z" },
	deployment_status: {
		id,
		state: "success",
		created_at: "2030-01-02T00:00:00Z",
	},
});

test("exact SHA deployment correlation works in either event order", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		await acceptGitHubDelivery(
			db,
			"deployment-first",
			"deployment_status",
			JSON.stringify(deployment(7)),
		);
		await acceptGitHubDelivery(
			db,
			"merge-after-deployment",
			"pull_request",
			JSON.stringify(mergedPullRequest(42)),
		);
		await acceptGitHubDelivery(
			db,
			"merge-first",
			"pull_request",
			JSON.stringify(mergedPullRequest(43, sha("c"), sha("e"))),
		);
		await acceptGitHubDelivery(
			db,
			"deployment-after-merge",
			"deployment_status",
			JSON.stringify(deployment(8, sha("b"))),
		);
		await acceptGitHubDelivery(
			db,
			"open-pr",
			"pull_request",
			JSON.stringify({
				action: "opened",
				installation: { id: 1, account: { login: "cubanx" } },
				repository: { id: 2, full_name: "ds9/ops" },
				pull_request: {
					number: 44,
					title: "Keep the promenade open",
					html_url: "https://github.com/ds9/ops/pull/44",
					state: "open",
					user: { login: "sisko" },
					head: { sha: sha("f") },
				},
			}),
		);
		await acceptGitHubDelivery(
			db,
			"deployment-after-open",
			"deployment_status",
			JSON.stringify(deployment(9, sha("f"))),
		);
		await drainInbox(db);
		const rows =
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.deployments ?? [];
		expect(rows.find((item) => item.id === "7")).toMatchObject({
			pull_request_number: 42,
			pull_request_title: "Hold the wormhole",
			pull_request_url: "https://github.com/ds9/ops/pull/42",
		});
		expect(rows.find((item) => item.id === "8")).toMatchObject({
			pull_request_number: 42,
		});
		expect(rows.find((item) => item.id === "9")).toMatchObject({
			pull_request_number: 44,
			pull_request_title: "Keep the promenade open",
		});
	}));

test("merged evidence fails closed, expires, caps, and leaves uncorrelated deployments blank", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const invalid = {
			...mergedPullRequest(42),
			pull_request: {
				...mergedPullRequest(42).pull_request,
				merge_commit_sha: undefined,
			},
		};
		const unmerged = {
			...mergedPullRequest(41),
			pull_request: { ...mergedPullRequest(41).pull_request, merged: false },
		};
		await acceptGitHubDelivery(
			db,
			"invalid-merge",
			"pull_request",
			JSON.stringify(invalid),
		);
		await acceptGitHubDelivery(
			db,
			"unmerged",
			"pull_request",
			JSON.stringify(unmerged),
		);
		await acceptGitHubDelivery(
			db,
			"uncorrelated",
			"deployment_status",
			JSON.stringify(deployment(7, sha("d"))),
		);
		await drainInbox(db);
		const repository = (await db.users.findOne({ _id: "u" }))?.installations[0]
			?.repositories[0];
		expect(repository?.recentMergedPullRequests).toBeUndefined();
		expect(repository?.deployments[0]).not.toHaveProperty(
			"pull_request_number",
		);
		const now = Date.parse("2030-01-03T00:00:00Z");
		const retained = retainRecentMergedPullRequests(
			Array.from(
				{ length: RECENT_MERGED_PULL_REQUEST_CAP + 1 },
				(_, number) => ({
					number,
					title: "Defiant",
					url: "https://github.com/ds9/ops/pull/1",
					head_sha: sha("a"),
					merge_sha: sha("b"),
					merged_at: new Date(now - number * 1_000).toISOString(),
				}),
			).concat({
				number: 999,
				title: "Expired",
				url: "https://github.com/ds9/ops/pull/999",
				head_sha: sha("a"),
				merge_sha: sha("b"),
				merged_at: "2030-01-01T00:00:00Z",
			}),
			now,
		);
		expect(retained).toHaveLength(RECENT_MERGED_PULL_REQUEST_CAP);
		expect(retained.some((item) => item.number === 999)).toBe(false);
	}));

test.each(["pending", "in_progress"])(
	"terminal deployment status does not regress to newer %s",
	(state) => {
		expect(
			shouldApplyDeploymentStatus(
				{
					status_id: "101",
					state,
					status_created_at: "2030-01-02T00:00:00Z",
				},
				{
					status_id: "100",
					state: "success",
					status_created_at: "2030-01-01T00:00:00Z",
					updated_at: "2030-01-01T00:00:00Z",
				},
			),
		).toBe(false);
	},
);

test("newest deployment status survives unordered bootstrap and a stale webhook", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const createdAt = "2030-01-02T00:00:00Z";
		await bootstrapInstallation(
			db,
			"1",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.includes("/pulls?")) return Response.json([]);
				if (value.includes("/7/statuses"))
					return Response.json([
						{ id: 100, state: "in_progress", created_at: createdAt },
						{ id: 101, state: "success", created_at: createdAt },
					]);
				if (value.includes("/deployments?"))
					return Response.json([
						{
							id: 7,
							environment: "production",
							created_at: "2030-01-01T00:00:00Z",
						},
					]);
				return Response.json([]);
			},
			"app-jwt",
		);
		expect(
			(await dashboardForUser(db, "u", new Date("2030-01-03"))).deployments[0],
		).toMatchObject({
			id: "7",
			state: "success",
			status_id: "101",
			status_created_at: createdAt,
		});

		await acceptGitHubDelivery(
			db,
			"stale",
			"deployment_status",
			JSON.stringify({
				installation: { id: 1, account: { login: "cubanx" } },
				repository: { id: 2, full_name: "ds9/ops" },
				deployment: { id: 7 },
				deployment_status: {
					id: 100,
					state: "in_progress",
					created_at: createdAt,
				},
			}),
		);
		await drainInbox(db);
		expect(
			(await dashboardForUser(db, "u", new Date("2030-01-03"))).deployments[0],
		).toMatchObject({ state: "success", status_id: "101" });
	}));

test("deployment events remain installation-scoped", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const body = JSON.stringify({
			installation: { id: 1, account: { login: "cubanx" } },
			repository: { id: 2, full_name: "ds9/ops" },
			deployment: {
				id: 7,
				environment: "production",
				ref: "main",
				sha: "a".repeat(40),
				created_at: new Date().toISOString(),
			},
			deployment_status: {
				state: "success",
				created_at: new Date().toISOString(),
			},
		});
		await acceptGitHubDelivery(db, "deployment", "deployment_status", body);
		await drainInbox(db);
		expect((await dashboardForUser(db, "u")).deployments).toHaveLength(1);
	}));

test("deployment status is monotonic, bounded, and retains safe links", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const delivery = (
			deliveryId: string,
			id: number,
			updated: string,
			state = "success",
		) =>
			acceptGitHubDelivery(
				db,
				deliveryId,
				"deployment_status",
				JSON.stringify({
					installation: { id: 1, account: { login: "cubanx" } },
					repository: { id: 2, full_name: "ds9/ops" },
					deployment: { id, created_at: updated },
					deployment_status: {
						state,
						created_at: updated,
						target_url: "https://example.test/deploy",
						log_url: "https://example.test/log",
					},
				}),
			);
		await delivery("new", 7, "2030-01-02T00:00:00Z");
		await delivery("old", 7, "2030-01-01T00:00:00Z", "failure");
		for (let id = 8; id < 29; id++)
			await delivery(
				String(id),
				id,
				`2030-01-03T00:00:${String(id).padStart(2, "0")}Z`,
			);
		await drainInbox(db);
		const deployments =
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.deployments ?? [];
		expect(deployments).toHaveLength(20);
		expect(deployments.find((item) => item.id === "7")).toBeUndefined();
		expect(
			(await dashboardForUser(db, "u", new Date("2030-01-04"))).deployments[0],
		).toMatchObject({
			target_url: "https://example.test/deploy",
			log_url: "https://example.test/log",
		});
	}));
