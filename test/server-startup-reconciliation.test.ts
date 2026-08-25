import { expect, test } from "vitest";
import { bindInstallation, createSession, upsertIdentity } from "#/access";
import { mutateUser } from "#/db";
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

test("startup repair refreshes bound users only after repairing missed close and open projections", async () =>
	withDatabase(async (db) => {
		for (const [id, installationId] of [
			["u", "9"],
			["shared", "9"],
			["foreign", "10"],
		] as const) {
			await upsertIdentity(db, id, id);
			await bindInstallation(db, id, installationId, "cubanx");
			await mutateUser(db, id, (user) => {
				user.installations[0]!.repositories = [
					{
						repositoryId: "2",
						full_name: "ds9/ops",
						openSpecs: [],
						deployments: [],
						pullRequests: [
							{
								number: 7,
								title: "Missed close",
								author_login: id,
								state: "open",
								draft: false,
								mergeable: "unknown",
							},
						],
					},
				];
			});
		}
		let finished: (() => void) | undefined;
		const reconciled = new Promise<void>((resolve) => {
			finished = resolve;
		});
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fixture" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async (...args: any[]) => {
					await Promise.all(
						["u", "shared"].map((id) =>
							mutateUser(db, id, (user) => {
								const pullRequests =
									user.installations[0]!.repositories[0]!.pullRequests;
								pullRequests.splice(0, pullRequests.length, {
									number: 8,
									title: "Missed open",
									author_login: id,
									state: "open",
									draft: false,
									mergeable: "unknown",
								});
							}),
						),
					);
					await args[6]?.({
						installationId: "9",
						result: { kind: "changed", body: [{ id: 2 }] },
					});
					finished?.();
					return [];
				},
			},
		);
		const streamFor = async (id: string) => {
			const session = await createSession(db, id);
			const stream = await app.fetch(
				new Request("http://local/events", {
					headers: { cookie: `dcc_session=${session.token}` },
				}),
			);
			const reader = stream.body?.getReader();
			if (!reader) throw new Error("event stream body missing");
			await reader.read();
			return reader;
		};
		const primary = await streamFor("u");
		const shared = await streamFor("shared");
		const foreign = await streamFor("foreign");
		try {
			await app.drain();
			await reconciled;
			for (const reader of [primary, shared])
				expect(new TextDecoder().decode((await reader.read()).value)).toContain(
					"event: refresh",
				);
			expect(
				(await db.users.findOne({ _id: "u" }))?.installations[0]
					?.repositories[0]?.pullRequests,
			).toMatchObject([{ number: 8, title: "Missed open" }]);
			const noRefresh = await Promise.race([
				foreign.read(),
				new Promise<undefined>((resolve) => setTimeout(resolve, 25)),
			]);
			expect(noRefresh).toBeUndefined();
		} finally {
			await Promise.all([primary.cancel(), shared.cancel(), foreign.cancel()]);
			app.stop();
		}
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
