import { expect, test, vi } from "vitest";
import { bindInstallation, createSession, upsertIdentity } from "#/access";
import { acceptGitHubDelivery } from "#/events";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

test("a durable title edit refreshes its card before unrelated inbox work finishes", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await bindInstallation(db, "1701", "42", "cubanx");
		const app = createApp(db, testConfig, undefined, { reconcilePullRequest: async () => ({ kind: "unchanged" }) });
		const session = await createSession(db, "1701");
		const stream = await app.fetch(
			new Request("http://local/events", { headers: { cookie: `dcc_session=${session.token}` } }),
		);
		const reader = stream.body?.getReader();
		if (!reader) throw new Error("missing event stream");
		await reader.read();
		await app.drain();
		await acceptGitHubDelivery(
			db,
			"title",
			"pull_request",
			JSON.stringify({
				action: "edited",
				installation: { id: 42, account: { login: "cubanx" } },
				repository: { id: 301, full_name: "ds9/defiant" },
				pull_request: {
					number: 7,
					title: "Shields restored",
					state: "open",
					user: { login: "sisko" },
					updated_at: "2030-01-01T00:00:00Z",
				},
			}),
		);
		await acceptGitHubDelivery(
			db,
			"waiting",
			"pull_request",
			JSON.stringify({
				installation: { id: 999 },
				repository: { id: 999 },
				pull_request: { number: 9, state: "open" },
			}),
		);
		let release!: () => void, started!: () => void;
		const blocked = new Promise<void>((resolve) => {
			release = resolve;
		});
		const waiting = new Promise<void>((resolve) => {
			started = resolve;
		});
		const update = db.inboxDeliveries.updateOne.bind(db.inboxDeliveries);
		const spy = vi.spyOn(db.inboxDeliveries, "updateOne").mockImplementation(async (...args) => {
			if (args[0]._id === "github:waiting" && "$set" in args[1] && args[1].$set?.status === "pending_verification") {
				started();
				await blocked;
			}
			return update(...args);
		});
		const draining = app.drain();
		try {
			await waiting;
			expect((await db.pullRequests.findOne({ _id: "301:7" }))?.title).toBe("Shields restored");
			const frame = await Promise.race([reader.read(), new Promise<undefined>((resolve) => setTimeout(resolve, 250))]);
			expect(frame ? new TextDecoder().decode(frame.value) : "").toContain("event: refresh");
		} finally {
			await db.inboxDeliveries.deleteOne({ _id: "github:waiting" });
			release();
			await draining;
			spy.mockRestore();
			await reader.cancel();
			await app.stop();
		}
	}));
