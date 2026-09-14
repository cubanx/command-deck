import { expect, test, vi } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import { acceptGitHubDelivery, drainInbox } from "#/events";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

test("startup finishes interrupted effects and an expired receipt can replay without rewriting the PR", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await bindInstallation(db, "1701", "42", "cubanx");
		const body = JSON.stringify({
			action: "edited",
			installation: { id: 42, account: { login: "cubanx" } },
			repository: { id: 301, full_name: "ds9/ops" },
			pull_request: {
				number: 7,
				title: "Defiant restored",
				state: "open",
				user: { login: "sisko" },
				updated_at: "2030-01-01T00:00:00Z",
			},
		});
		await acceptGitHubDelivery(db, "interrupted", "pull_request", body);
		const update = db.inboxDeliveries.updateOne.bind(db.inboxDeliveries);
		const failure = vi.spyOn(db.inboxDeliveries, "updateOne").mockImplementation(async (...args) => {
			if (!Array.isArray(args[1]) && args[1].$set?.status === "done")
				throw new Error("fictional interrupted receipt write");
			return update(...args);
		});
		try {
			await expect(
				drainInbox(db, undefined, undefined, async () => {
					throw new Error("fictional process stopped");
				}),
			).rejects.toThrow("fictional process stopped");
		} finally {
			failure.mockRestore();
		}
		const projected = await db.pullRequests.findOne({ _id: "301:7" });
		expect(projected?.title).toBe("Defiant restored");
		expect(await db.inboxDeliveries.findOne({ _id: "github:interrupted" })).toMatchObject({
			attempts: 1,
			payload: body,
			nextAttemptAt: expect.any(Date),
		});
		const app = createApp(db, testConfig, undefined, { reconcilePullRequest: async () => ({ kind: "unchanged" }) });
		const startupDrain = app.drain(); // The same drain invoked by the server entrypoint on startup.
		try {
			// Startup drains pending receipts; no manual reconciliation call.
			await expect
				.poll(async () => (await db.inboxDeliveries.findOne({ _id: "github:interrupted" }))?.status, { timeout: 4000 })
				.toBe("done");
			await startupDrain;
			expect(await db.pullRequests.findOne({ _id: "301:7" })).toEqual(projected);
			// Native TTL selection/deletion is tested separately; model its resulting absence here.
			await db.inboxDeliveries.deleteOne({ _id: "github:interrupted" });
			expect(await acceptGitHubDelivery(db, "interrupted", "pull_request", body)).toMatchObject({ kind: "accepted" });
			await app.drain();
			expect(await db.pullRequests.findOne({ _id: "301:7" })).toEqual(projected);
			expect(await db.inboxDeliveries.findOne({ _id: "github:interrupted" })).toMatchObject({ status: "done" });
		} finally {
			await startupDrain;
			await app.drain();
			await app.stop();
		}
	}));
