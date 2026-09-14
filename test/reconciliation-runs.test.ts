import { expect, test } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import { beginReconciliationRun, finishReconciliationRun, reconciliationRunsForUser } from "#/reconciliation-runs";
import { withDatabase } from "./mongo-support";

test("reconciliation records an unfinished run, completes once, and scopes reads to active bindings", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await upsertIdentity(db, "1702", "kira");
		await bindInstallation(db, "1701", "42", "cubanx");
		const id = await beginReconciliationRun(db, { installationId: "42", trigger: "manual" });
		const active = (await reconciliationRunsForUser(db, "1701"))[0];
		expect(active).toMatchObject({ _id: id, status: "running" });
		expect(active?.completedAt).toBeUndefined();
		expect(await reconciliationRunsForUser(db, "1702")).toEqual([]);
		await finishReconciliationRun(db, id, { outcome: "partial_failure", failureCount: 1, providerRequestCount: 3 });
		const completed = (await reconciliationRunsForUser(db, "1701"))[0];
		expect(completed).toMatchObject({
			status: "completed",
			outcome: "partial_failure",
			failureCount: 1,
			providerRequestCount: 3,
		});
		expect(completed?.completedAt).toBeInstanceOf(Date);
		await finishReconciliationRun(db, id, { outcome: "success", failureCount: 0 });
		expect((await reconciliationRunsForUser(db, "1701"))[0]).toEqual(completed);
		await db.installations.updateOne({ _id: "42" }, { $set: { suspended: true } });
		expect(await reconciliationRunsForUser(db, "1701")).toEqual([]);
	}));

test("run summaries discard unknown payload fields and native TTL preserves unfinished runs", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await bindInstallation(db, "1701", "42", "cubanx");
		const old = new Date(Date.now() - 73 * 60 * 60_000);
		const activeId = await beginReconciliationRun(db, { installationId: "42", trigger: "startup" }, old);
		const doneId = await beginReconciliationRun(db, { installationId: "42", trigger: "startup" }, old);
		const summary = {
			outcome: "failure" as const,
			failureCount: 1,
			payload: "fictional-secret-must-not-persist",
			message: "fictional-secret-must-not-persist",
		};
		await finishReconciliationRun(db, doneId, summary, old);
		expect(JSON.stringify(await reconciliationRunsForUser(db, "1701"))).not.toContain("fictional-secret");
		await expect
			.poll(async () => db.reconciliationRuns.countDocuments({ completedAt: { $exists: true } }), { timeout: 10000 })
			.toBe(0);
		expect(await reconciliationRunsForUser(db, "1701")).toMatchObject([{ _id: activeId, status: "running" }]);
	}));
