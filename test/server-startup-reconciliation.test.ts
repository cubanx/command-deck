import { generateKeyPairSync } from "node:crypto";
import { expect, test, vi } from "vitest";
import { bindInstallation, createSession, upsertIdentity } from "#/access";
import { upsertPullRequest } from "#/db";
import { acceptGitHubDelivery } from "#/events";
import { auditReconciliationRun, createApp, serverError } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

async function seedRepository(
	db: Parameters<typeof upsertPullRequest>[0],
	userId: string,
	installationId: string,
	pullRequests: Array<Record<string, unknown>>,
) {
	await db.repositories.updateOne(
		{ _id: "2" },
		{ $set: { repositoryId: "2", full_name: "ds9/ops", installationIds: [installationId], updatedAt: new Date() } },
		{ upsert: true },
	);
	await db.pullRequests.deleteMany({ repositoryId: "2" });
	await Promise.all(
		pullRequests.map((pullRequest) =>
			upsertPullRequest(db, {
				repositoryId: "2",
				number: Number(pullRequest.number),
				author_login: userId,
				...pullRequest,
			}),
		),
	);
}

test("weekday repair includes retained merged work without closed unrelated history", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "sisko", "sisko");
		await bindInstallation(db, "sisko", "9", "cubanx");
		await seedRepository(db, "sisko", "9", [
			{ number: 7, state: "open" },
			{ number: 8, state: "closed", merged: true, retention_candidate: true },
			{ number: 9, state: "closed" },
		]);
		const calls: number[] = [];
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2030-01-02T15:00:00Z"));
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fictional" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async () => [],
				reconcilePullRequest: async (_db, target) => {
					calls.push(target.number);
					return { kind: "unchanged" };
				},
			},
		);
		try {
			await vi.waitFor(() => expect([...calls].sort()).toEqual([7, 8]), { timeout: 2000 });
		} finally {
			await app.stop();
			vi.useRealTimers();
		}
	}));

test("targeted failures retain operation for frozen and primitive throws and recover", () =>
	withDatabase(async (db) => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const failures = [
			Object.freeze(Object.assign(new Error("Garak secret"), { name: "MongoNetworkError", code: 91, status: 503 })),
			"Garak secret",
		];
		const app = createApp(db, { ...testConfig, localDemo: true }, undefined, {
			reconcilePullRequest: async () => {
				if (failures.length) throw failures.shift();
				return { kind: "unchanged" };
			},
		});
		try {
			const snapshot = await (await app.fetch(new Request("http://local/api/snapshot"))).json();
			const pr = snapshot.pullRequests.find((item: { state: string }) => item.state === "open");
			const repair = () =>
				app.fetch(
					new Request("http://local/api/reconcile/pull-request", {
						method: "POST",
						body: JSON.stringify({
							installationId: String(pr.installation_id),
							repositoryId: String(pr.repository_id),
							number: Number(pr.number),
						}),
					}),
				);
			expect((await repair()).status).toBe(502);
			expect((await repair()).status).toBe(502);
			expect((await repair()).status).toBe(200);
			expect(log.mock.calls).toHaveLength(2);
			expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({
				failureClass: "network",
				code: 91,
				status: 503,
			});
			for (const [line] of log.mock.calls)
				expect(JSON.parse(line)).toMatchObject({
					installationId: String(pr.installation_id),
					operation: "targeted_provider",
				});
			expect(JSON.stringify(log.mock.calls)).not.toContain("Garak secret");
		} finally {
			await app.stop();
			log.mockRestore();
		}
	}));

test("unexpected broad failures are logged once and a later run recovers", () =>
	withDatabase(async (db) => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		let fail = true;
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fictional" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async () => {
					if (fail) throw new Error("Garak secret");
					return [];
				},
			},
		);
		try {
			expect(await app.reconcile()).toBe("failed");
			fail = false;
			expect(await app.reconcile()).toBe("success");
			expect(log.mock.calls).toHaveLength(1);
			expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ installationId: "unknown", category: "broad" });
			expect(JSON.stringify(log.mock.calls)).not.toContain("Garak secret");
		} finally {
			await app.stop();
			log.mockRestore();
		}
	}));

test("sanitizes unhandled Bun request errors", async () => {
	const originalError = console.error,
		logs: unknown[][] = [];
	console.error = (...args: unknown[]) => logs.push(args);
	try {
		const response = serverError(Object.assign(new Error("token=must-not-escape"), { name: "RequestFailure" }));
		expect(response.status).toBe(500);
		expect(await response.text()).toBe("Internal server error");
	} finally {
		console.error = originalError;
	}
	expect(logs).toEqual([["server request failed", "RequestFailure"]]);
	expect(JSON.stringify(logs)).not.toContain("must-not-escape");
});

test("keeps provider outcomes independent from server audit persistence", async () => {
	const originalError = console.error,
		logs: unknown[][] = [];
	console.error = (...args: unknown[]) => logs.push(args);
	try {
		await auditReconciliationRun(
			{
				reconciliationRuns: {
					insertOne: async () =>
						Promise.reject(Object.assign(new Error("token=must-not-escape"), { name: "AuditWriteFailure" })),
				},
			} as never,
			{ installationId: "9" } as never,
		);
	} finally {
		console.error = originalError;
	}
	expect(logs.map(([line]) => JSON.parse(String(line)))).toEqual([
		expect.objectContaining({ installationId: "9", operation: "reconciliation_audit", category: "bookkeeping" }),
	]);
	expect(JSON.stringify(logs)).not.toContain("must-not-escape");
});

test("starts one non-blocking broad repair after the inbox drain", async () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "startup", "sisko");
		await bindInstallation(db, "startup", "9", "cubanx");
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
					for (const row of rows) await args[6]?.({ ...row, startedAt: new Date() });
					return rows;
				},
			},
		);
		await app.drain();
		await vi.waitFor(() => expect(calls).toBe(1), { timeout: 2_000 });
		expect((await app.fetch(new Request("http://local/ready"))).status).toBe(200);
		await app.drain();
		expect(calls).toBe(1);
		for (let count = 0; count < 5; count++) await Promise.resolve();
		await vi.waitFor(
			async () =>
				expect(await db.reconciliationRuns.find({}).toArray()).toEqual([
					expect.objectContaining({
						installationId: "9",
						trigger: "startup",
						unchangedPrCount: 0,
					}),
				]),
			{ timeout: 2_000 },
		);
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
		await app.stop();
	}));

test("queues the startup-wide repair behind an active scoped reconciliation", async () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		let releaseScoped!: () => void;
		let scopedStarted!: () => void;
		let startupCompleted!: () => void;
		const scoped = new Promise<void>((resolve) => (releaseScoped = resolve));
		const started = new Promise<void>((resolve) => (scopedStarted = resolve));
		const completed = new Promise<void>((resolve) => (startupCompleted = resolve));
		const calls: Array<string[] | undefined> = [];
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fixture" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async (...args: any[]) => {
					calls.push(args[3]);
					if (calls.length === 1) {
						scopedStarted();
						await scoped;
					}
					await args[6]?.({
						installationId: "9",
						startedAt: new Date(),
						result: { kind: "unchanged" },
					});
					if (calls.length === 2) startupCompleted();
					return [];
				},
			},
		);
		try {
			const session = await createSession(db, "u");
			const manual = app.fetch(
				new Request("http://local/api/reconcile", {
					method: "POST",
					headers: {
						cookie: `dcc_session=${session.token}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ installationId: "9" }),
				}),
			);
			await started;
			await app.drain();
			expect(calls).toEqual([["9"]]);
			releaseScoped();
			expect((await manual).status).toBe(200);
			await completed;
			expect(calls).toEqual([["9"], undefined]);
			expect(await db.reconciliationRuns.find({}, { projection: { _id: 0, trigger: 1 } }).toArray()).toEqual([
				{ trigger: "manual" },
				{ trigger: "startup" },
			]);
		} finally {
			await app.stop();
		}
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
			if (id !== "foreign")
				await seedRepository(db, id, installationId, [
					{ number: 7, title: "Missed close", state: "open", draft: false, mergeable: "unknown" },
				]);
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
							seedRepository(db, id, "9", [
								{ number: 8, title: "Missed open", state: "open", draft: false, mergeable: "unknown" },
							]),
						),
					);
					await args[6]?.({
						installationId: "9",
						startedAt: new Date(),
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
				expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: refresh");
			expect(await db.pullRequests.findOne({ _id: "2:8" })).toMatchObject({ number: 8, title: "Missed open" });
			const noRefresh = await Promise.race([
				foreign.read(),
				new Promise<undefined>((resolve) => setTimeout(resolve, 25)),
			]);
			expect(noRefresh).toBeUndefined();
		} finally {
			await Promise.all([primary.cancel(), shared.cancel(), foreign.cancel()]);
			await app.stop();
		}
	}));

test("broad reconciliation refreshes each changed installation before a later failure", async () =>
	withDatabase(async (db) => {
		for (const [id, login] of [
			["9", "sisko"],
			["10", "kira"],
		] as const) {
			await upsertIdentity(db, `user-${id}`, login);
			await bindInstallation(db, `user-${id}`, id, "cubanx");
		}
		for (const [id, installationId] of [
			["changed", "9"],
			["unchanged", "10"],
		] as const) {
			await upsertIdentity(db, id, id);
			await bindInstallation(db, id, installationId, "cubanx");
		}
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fixture" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async (...args: any[]) => {
					await args[6]?.({
						installationId: "9",
						startedAt: new Date(),
						result: { kind: "changed", body: [] },
					});
					await args[6]?.({
						installationId: "10",
						startedAt: new Date(),
						result: {
							kind: "error",
							stale: true,
							message: "safe failure",
						},
					});
					throw new Error("safe failure");
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
		const changed = await streamFor("changed");
		const unchanged = await streamFor("unchanged");
		try {
			expect(await app.reconcile()).toBe("failed");
			expect(new TextDecoder().decode((await changed.read()).value)).toContain("event: refresh");
			expect(
				await Promise.race([unchanged.read(), new Promise<undefined>((resolve) => setTimeout(resolve, 25))]),
			).toBeUndefined();
		} finally {
			await Promise.all([changed.cancel(), unchanged.cancel()]);
			await app.stop();
		}
	}));

test("broad reconciliation persists direct counts, duration, and installation-scoped pending deliveries", async () =>
	withDatabase(async (db) => {
		for (const [id, login] of [
			["9", "sisko"],
			["10", "kira"],
		] as const) {
			await upsertIdentity(db, `user-${id}`, login);
			await bindInstallation(db, `user-${id}`, id, "cubanx");
		}
		for (const [deliveryId, payload] of [
			["a", { installation: { id: 9 } }],
			["b", { installation: { id: 10 } }],
			["missing", {}],
		] as const)
			await acceptGitHubDelivery(db, deliveryId, "push", JSON.stringify(payload));
		await db.inboxDeliveries.insertOne({
			_id: "github:bad",
			provider: "github",
			deliveryId: "bad",
			status: "pending_verification",
			eventName: "push",
			payload: "not-json",
			receivedAt: new Date(),
			attempts: 0,
		});
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fixture" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async (...args: any[]) => {
					for (const installationId of ["9", "10"])
						await args[6]?.({
							installationId,
							startedAt: new Date(),
							result: {
								kind: "changed",
								body: [],
								prCount: 2,
								changedPrCount: 1,
								unchangedPrCount: 1,
							},
						});
					return [];
				},
			},
		);
		try {
			expect(await app.reconcile()).toBe("success");
			const runs = await db.reconciliationRuns.find({ trigger: "manual" }).sort({ installationId: 1 }).toArray();
			expect(runs).toHaveLength(2);
			for (const run of runs) {
				expect(run).toMatchObject({
					prCount: 2,
					changedPrCount: 1,
					unchangedPrCount: 1,
					unresolvedDeliveryCount: 1,
				});
				expect(run.durationMs).toBe(run.completedAt.getTime() - run.startedAt.getTime());
				expect(run.changedPrCount + run.unchangedPrCount).toBe(run.prCount);
			}
		} finally {
			await app.stop();
		}
	}));

test("broad reconciliation records each installation's own elapsed duration", async () =>
	withDatabase(async (db) => {
		for (const [id, login] of [
			["9", "sisko"],
			["10", "kira"],
		] as const) {
			await upsertIdentity(db, `user-${id}`, login);
			await bindInstallation(db, `user-${id}`, id, "cubanx");
		}
		const now = Date.now();
		const app = createApp(
			db,
			{ ...testConfig, githubAppId: "1", githubAppPrivateKey: "fixture" },
			{ inspect: async () => ({}), merge: async () => ({}) },
			{
				reconcileInstallations: async (...args: any[]) => {
					await new Promise((resolve) => setTimeout(resolve, 50));
					await args[6]?.({
						installationId: "9",
						startedAt: new Date(now - 60_000),
						result: { kind: "unchanged" },
					});
					await args[6]?.({
						installationId: "10",
						startedAt: new Date(now - 1_000),
						result: { kind: "unchanged" },
					});
					return [];
				},
			},
		);
		try {
			expect(await app.reconcile()).toBe("success");
			const runs = await db.reconciliationRuns.find({}).sort({ installationId: 1 }).toArray();
			expect(runs).toHaveLength(2);
			const first = runs.find((run) => run.installationId === "9");
			const second = runs.find((run) => run.installationId === "10");
			if (!first || !second) throw new Error("reconciliation runs missing");
			for (const run of runs) expect(run.durationMs).toBe(run.completedAt.getTime() - run.startedAt.getTime());
			expect(second.durationMs).toBeGreaterThan(0);
			expect(first.durationMs).toBeGreaterThan(0);
		} finally {
			await app.stop();
		}
	}));

test("webhook drain recovers after an unreadable thrown payload", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const find = vi.spyOn(db.inboxDeliveries, "find");
		try {
			await app.drain();
			find.mockImplementationOnce(() => {
				throw new Proxy(
					{},
					{
						get() {
							throw new Error("Garak secret");
						},
					},
				);
			});
			await app.drain();
			expect(log.mock.calls).toHaveLength(1);
			expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({ operation: "webhook_drain", failureClass: "unknown" });
			await app.drain();
			expect(log.mock.calls).toHaveLength(1);
			expect(JSON.stringify(log.mock.calls)).not.toContain("Garak secret");
		} finally {
			find.mockRestore();
			log.mockRestore();
			await app.stop();
		}
	}));

test("targeted persistence reports safe details once through the real server reporter", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "Kira", "kira");
		await bindInstallation(db, "Kira", "9", "cubanx");
		await seedRepository(db, "Kira", "9", [{ number: 7, state: "open", title: "Repair Defiant" }]);
		const session = await createSession(db, "Kira");
		const { privateKey } = generateKeyPairSync("rsa", {
			modulusLength: 2048,
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
			publicKeyEncoding: { type: "spki", format: "pem" },
		});
		const app = createApp(db, { ...testConfig, githubAppId: "1", githubAppPrivateKey: privateKey });
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			if (String(input).endsWith("/access_tokens")) return Response.json({ token: "fictional" });
			if (String(input) === "https://api.github.com/graphql") throw new Error("Garak secret");
			throw new Error("Unexpected fixture request");
		});
		const write = vi.spyOn(db.pullRequests, "replaceOne");
		try {
			await app.fetch(new Request("http://local/ready"));
			write.mockRejectedValueOnce(
				Object.freeze(
					Object.assign(new Error("Garak secret"), {
						name: "MongoServerError",
						code: 112,
						status: 503,
						diagnostic: { password: "Garak secret" },
					}),
				),
			);
			const response = await app.fetch(
				new Request("http://local/api/reconcile/pull-request", {
					method: "POST",
					headers: { cookie: `dcc_session=${session.token}` },
					body: JSON.stringify({ installationId: "9", repositoryId: "2", number: 7 }),
				}),
			);
			expect(response.status).toBe(502);
			const diagnostics = log.mock.calls.map(([line]) => JSON.parse(String(line)));
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						operation: "targeted_provider",
						failureClass: "database",
						code: 112,
						status: 503,
						target: "repositories/2/pulls/7",
					}),
				]),
			);
			expect(JSON.stringify(log.mock.calls)).not.toContain("Garak secret");
		} finally {
			write.mockRestore();
			fetcher.mockRestore();
			log.mockRestore();
			await app.stop();
		}
	}));
