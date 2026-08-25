import { expect, test } from "vitest";
import { acceptGitHubDelivery } from "#/events";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

test("starts one non-blocking broad repair after the inbox drain", async () =>
	withDatabase(async (db) => {
		let calls = 0;
		const app = createApp(
			db,
			{
				...testConfig,
				githubAppId: "1",
				githubAppPrivateKey: "fixture",
			},
			{
				inspect: async () => ({}),
				merge: async () => ({}),
			},
			{
				reconcileInstallations: async (...args: any[]) => {
					calls++;
					const rows = [
						{
							installationId: "9",
							result:
								calls === 2
									? {
											kind: "error" as const,
											stale: true as const,
											message: "safe failure",
										}
									: { kind: "unchanged" as const },
						},
					];
					for (const row of rows) await args[6]?.(row);
					return rows;
				},
			},
		);
		await app.drain();
		expect(calls).toBe(1);
		expect((await app.fetch(new Request("http://local/ready"))).status).toBe(
			200,
		);
		await app.drain();
		expect(calls).toBe(1);
		for (let count = 0; count < 5; count++) await Promise.resolve();
		expect(await db.reconciliationRuns.find({}).toArray()).toEqual([
			expect.objectContaining({
				installationId: "9",
				trigger: "startup",
				unchangedPrCount: 1,
			}),
		]);
		await app.reconcile();
		expect(await db.reconciliationRuns.find({}).toArray()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					trigger: "manual",
					failureCount: 1,
					outcome: "failure",
				}),
			]),
		);
		app.stop();
	}));

test("startup reconciliation records only aggregate repaired delivery telemetry", async () =>
	withDatabase(async (db) => {
		await acceptGitHubDelivery(
			db,
			"repairable",
			"pull_request",
			JSON.stringify({
				installation: { id: 9 },
				repository: { id: 2 },
			}),
		);
		const app = createApp(
			db,
			{
				...testConfig,
				githubAppId: "1",
				githubAppPrivateKey: "fixture",
			},
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async (...args: any[]) => {
					await args[6]?.({
						installationId: "9",
						result: { kind: "changed", body: [{ id: 2 }] },
					});
					return [];
				},
			},
		);
		await app.drain();
		await new Promise((resolve) => setTimeout(resolve, 25));
		const run = await db.reconciliationRuns.findOne({ trigger: "startup" });
		expect(run).toMatchObject({
			repairedDeliveryCount: 1,
			unresolvedDeliveryCount: 0,
		});
		expect(JSON.stringify(run)).not.toContain("repairable");
		expect(
			(await db.inboxDeliveries.findOne({ _id: "github:repairable" }))
				?.resolvedBy,
		).toBe("reconciliation");
		app.stop();
	}));
