import { expect, test } from "vitest";
import { bindInstallation } from "#/access";
import { initializeDatabase } from "#/db";
import { acceptGitHubDelivery, drainInbox } from "#/events";
import { withDatabase } from "./mongo-support";

const payload = (title: string, updated_at: string) =>
	JSON.stringify({
		action: "opened",
		installation: { id: 42, account: { login: "cubanx" } },
		repository: { id: 301, full_name: "ds9/ops-console" },
		pull_request: {
			number: 7,
			title,
			state: "open",
			user: { login: "sisko" },
			head: { ref: "feature/defiant", sha: "a".repeat(40) },
			base: { ref: "main" },
			updated_at,
		},
	});

test("webhook projection writes one shared PR document and ignores stale replay", () =>
	withDatabase(async (db) => {
		await initializeDatabase(db);
		await bindInstallation(db, "1701", "42", "cubanx");
		expect(
			await acceptGitHubDelivery(db, "newer", "pull_request", payload("new", "2026-09-13T12:00:00Z")),
		).toMatchObject({ kind: "accepted" });
		await drainInbox(db);
		expect(await db.pullRequests.findOne({ _id: "301:7" })).toMatchObject({ title: "new", repositoryId: "301" });
		expect(
			await acceptGitHubDelivery(db, "older", "pull_request", payload("old", "2026-09-13T11:00:00Z")),
		).toMatchObject({ kind: "accepted" });
		await drainInbox(db);
		expect(await db.pullRequests.findOne({ _id: "301:7" })).toMatchObject({ title: "new" });
	}));

test("webhook processing records a start timestamp and clears payload on completion", async () => {
	await withDatabase(async (db) => {
		await initializeDatabase(db);
		await bindInstallation(db, "1701", "42", "cubanx");
		const body = JSON.stringify({
			ref: "refs/heads/main",
			after: "b".repeat(40),
			installation: { id: 42, account: { login: "cubanx" } },
			repository: { id: 301, full_name: "ds9/ops-console" },
			commits: [{ modified: ["openspec/changes/warp-drive/tasks.md"] }],
		});
		expect(await acceptGitHubDelivery(db, "processing-start", "push", body)).toMatchObject({ kind: "accepted" });
		let release!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		let fetchStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			fetchStarted = resolve;
		});
		const drain = drainInbox(db, async () => {
			const row = await db.inboxDeliveries.findOne({ _id: "github:processing-start" });
			expect(row?.processingStartedAt).toBeInstanceOf(Date);
			expect(row?.payload).toBeDefined();
			fetchStarted();
			await blocked;
			return "# Tasks\n";
		});
		await started;
		release();
		await drain;
		const row = await db.inboxDeliveries.findOne({ _id: "github:processing-start" });
		expect(row).toMatchObject({ status: "done", processedAt: expect.any(Date) });
		expect(row?.processingStartedAt).toBeInstanceOf(Date);
		expect(row?.payload).toBeUndefined();
	});
});

test("stale installation state rejects webhook projection without reactivation", () =>
	withDatabase(async (db) => {
		await initializeDatabase(db);
		await bindInstallation(db, "1701", "42", "cubanx");
		await db.installations.updateOne({ _id: "42" }, { $set: { active: false, suspended: true } });
		await acceptGitHubDelivery(db, "suspended", "pull_request", payload("should stay absent", "2026-09-13T12:00:00Z"));
		await drainInbox(db);
		expect(await db.pullRequests.countDocuments({ repositoryId: "301" })).toBe(0);
		expect(await db.installations.findOne({ _id: "42" })).toMatchObject({ active: false, suspended: true });
	}));

test("deployment projection keeps terminal status and stable public identity", () =>
	withDatabase(async (db) => {
		await initializeDatabase(db);
		await bindInstallation(db, "1701", "42", "cubanx");
		const delivery = (deliveryId: string, state: string, created_at: string) =>
			acceptGitHubDelivery(
				db,
				deliveryId,
				"deployment_status",
				JSON.stringify({
					installation: { id: 42, account: { login: "cubanx" } },
					repository: { id: 301, full_name: "ds9/ops-console" },
					deployment: { id: 7, environment: "production", ref: "main", sha: "a".repeat(40) },
					deployment_status: { id: state === "success" ? 101 : 100, state, created_at },
				}),
			);
		await delivery("deployment-success", "success", "2026-09-13T12:00:00Z");
		await drainInbox(db);
		await delivery("deployment-stale", "pending", "2026-09-13T11:00:00Z");
		await drainInbox(db);
		expect(await db.deployments.findOne({ _id: "301:7" })).toMatchObject({
			id: "7",
			state: "success",
			status_id: "101",
		});
	}));
