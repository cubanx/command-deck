import { expect, test } from "vitest";
import { createSession, upsertIdentity } from "#/access";
import {
	advanceMergeIntent,
	authorizeBeforeInstallation,
	confirmExactMerge,
	createMergeIntent,
	mergeEligibility,
	mergeIntentFor,
	mergeIntentHash,
	mergeResult,
} from "#/merge";
import { createApp, defaultMergeProvider } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

const eligible = {
	state: "open",
	draft: false,
	head_sha: "a".repeat(40),
	mergeable: "clean",
	workflow_state: "success",
	checks_state: "success",
	review_state: "approved",
	open_spec: { completed: 2, total: 2 },
	merge_method: "MERGE",
	protection: "clear",
};
const fetchTarget: {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} = globalThis;

const privateKey = async () => {
	const { privateKey } = await crypto.subtle.generateKey(
		{
			name: "RSASSA-PKCS1-v1_5",
			modulusLength: 2048,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: "SHA-256",
		},
		true,
		["sign", "verify"],
	);
	return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
		await crypto.subtle.exportKey("pkcs8", privateKey),
	)
		.toString("base64")
		.match(/.{1,64}/g)
		?.join("\n")}\n-----END PRIVATE KEY-----`;
};

test("merge eligibility fails closed for every mutable gate", () => {
	expect(mergeEligibility(eligible)).toEqual({ ok: true });
	for (const [key, value] of [
		["state", "closed"],
		["draft", true],
		["head_sha", ""],
		["mergeable", "unknown"],
		["workflow_state", "failure"],
		["checks_state", "pending"],
		["review_state", "changes_requested"],
		["open_spec", { completed: 1, total: 2 }],
		["merge_method", "SQUASH"],
		["protection", "unknown"],
	] as const)
		expect(mergeEligibility({ ...eligible, [key]: value })).toMatchObject({
			ok: false,
		});
});

test("merge intents are opaque and outcomes remain sanitized", () => {
	expect(mergeIntentHash("quark-intent")).not.toContain("quark-intent");
	expect(mergeResult({ merged: true })).toBe("success");
	expect(mergeResult({ errors: [{ type: "HEAD_OID_OUTDATED" }] })).toBe(
		"stale",
	);
	expect(mergeResult({ errors: [{ type: "FORBIDDEN" }] })).toBe("permission");
	expect(mergeResult({ errors: [{ type: "MERGE_CONFLICT" }] })).toBe(
		"conflict",
	);
	expect(mergeResult({ errors: [{ type: "anything" }] })).toBe("blocked");
});

test("merge intent is hashed, expires, and advances only once", () =>
	withDatabase(async (db) => {
		const token = await createMergeIntent(
			db,
			{
				userId: "sisko",
				sessionId: "session",
				installationId: "9",
				repositoryId: "42",
				fullName: "Crisp-Inc/dev-command-center",
				pullRequestNumber: 7,
				pullRequestTitle: "Defend the wormhole",
				headSha: "a".repeat(40),
			},
			new Date("2030-01-01"),
		);
		expect((await db.mergeIntents.findOne({}))?._id).toBe(
			mergeIntentHash(token),
		);
		expect(
			await advanceMergeIntent(
				db,
				token,
				"started",
				"authorized",
				new Date("2030-01-01T00:01:00Z"),
			),
		).toMatchObject({ userId: "sisko", stage: "started" });
		expect(
			await advanceMergeIntent(
				db,
				token,
				"started",
				"authorized",
				new Date("2030-01-01T00:01:00Z"),
			),
		).toBeNull();
	}));

test("role proof happens before installation authority and exact-head merge reads twice", async () => {
	const calls: string[] = [];
	expect(
		await authorizeBeforeInstallation({
			fetcher: async () => {
				calls.push("role");
				return Response.json({ permission: "write" });
			},
			userToken: "not-persisted",
			login: "sisko",
			fullName: "Crisp-Inc/dev-command-center",
			installationToken: async () => {
				calls.push("installation");
				return "installation-token";
			},
		}),
	).toBe("installation-token");
	expect(calls).toEqual(["role", "installation"]);
	let deniedInstallationCalls = 0;
	expect(
		await authorizeBeforeInstallation({
			fetcher: async (input) => {
				expect(String(input)).toBe(
					"https://api.github.com/repos/Crisp-Inc/dev-command-center/collaborators/garak/permission",
				);
				return Response.json({ permission: "read" });
			},
			userToken: "request-local-only",
			login: "garak",
			fullName: "Crisp-Inc/dev-command-center",
			installationToken: async () => {
				deniedInstallationCalls++;
				return "must-not-mint";
			},
		}),
	).toBeNull();
	expect(deniedInstallationCalls).toBe(0);
	let reads = 0;
	let variables: Record<string, string> | undefined;
	expect(
		await confirmExactMerge({
			intent: { pullRequestId: "PR_7", headSha: "a".repeat(40) },
			inspect: async () => {
				reads++;
				return { ...eligible, head_sha: "a".repeat(40) };
			},
			merge: async (input) => {
				variables = input;
				return { merged: true };
			},
		}),
	).toBe("success");
	expect(reads).toBe(2);
	expect(variables).toEqual({
		pullRequestId: "PR_7",
		expectedHeadOid: "a".repeat(40),
		mergeMethod: "MERGE",
	});
});

test("default merge provider reads every gate and fails closed without policy evidence", async () => {
	const original = globalThis.fetch;
	const calls: string[] = [];
	fetchTarget.fetch = async (input) => {
		const url = String(input);
		calls.push(url);
		if (url.includes("access_tokens")) return Response.json({ token: "iat" });
		if (url.endsWith("/pulls/8"))
			return Response.json({
				node_id: "PR_8",
				state: "open",
				draft: false,
				head: { sha: "a".repeat(40) },
				base: { ref: "main" },
				mergeable: true,
			});
		if (url.endsWith("/check-runs"))
			return Response.json({ check_runs: [{ conclusion: "success" }] });
		if (url.endsWith("/reviews")) return Response.json([{ state: "APPROVED" }]);
		if (url.includes("/rules/branches/")) return Response.json([]);
		if (url.includes("/protection")) return new Response(null, { status: 403 });
		return Response.json({ allow_merge_commit: true });
	};
	try {
		const provider = defaultMergeProvider({
			...testConfig,
			githubAppId: "1",
			githubAppPrivateKey: await privateKey(),
		});
		if (!provider) throw new Error("provider missing");
		const inspected = await provider.inspect({
			_id: "intent",
			userId: "sisko",
			sessionId: "session",
			installationId: "12",
			repositoryId: "42",
			fullName: "Crisp-Inc/dev-command-center",
			pullRequestNumber: 8,
			pullRequestTitle: "Hold the line",
			headSha: "a".repeat(40),
			stage: "authorized",
			expiresAt: new Date(),
		});
		expect(inspected).toMatchObject({
			pullRequestId: "PR_8",
			protection: "unknown",
		});
		expect(calls.join("\n")).toContain("/rules/branches/main");
	} finally {
		fetchTarget.fetch = original;
	}
});

test("default merge provider permits only explicit clear policy evidence", async () => {
	const original = globalThis.fetch;
	let protectionStatus = 404;
	fetchTarget.fetch = async (input) => {
		const url = String(input);
		if (url.includes("access_tokens")) return Response.json({ token: "iat" });
		if (url.endsWith("/pulls/8"))
			return Response.json({
				node_id: "PR_8",
				state: "open",
				draft: false,
				head: { sha: "a".repeat(40) },
				base: { ref: "main" },
				mergeable: true,
			});
		if (url.includes("actions/runs"))
			return Response.json({ workflow_runs: [] });
		if (url.endsWith("/check-runs")) return Response.json({ check_runs: [] });
		if (url.endsWith("/reviews")) return Response.json([]);
		if (url.includes("/rules/branches/")) return Response.json([]);
		if (url.includes("/protection"))
			return protectionStatus === 200
				? Response.json({
						required_status_checks: { contexts: [] },
						required_pull_request_reviews: null,
					})
				: new Response(null, { status: protectionStatus });
		return Response.json({ allow_merge_commit: true });
	};
	try {
		const provider = defaultMergeProvider({
			...testConfig,
			githubAppId: "1",
			githubAppPrivateKey: await privateKey(),
		});
		if (!provider) throw new Error("provider missing");
		const inspected = await provider.inspect({
			_id: "intent",
			userId: "sisko",
			sessionId: "session",
			installationId: "12",
			repositoryId: "42",
			fullName: "Crisp-Inc/dev-command-center",
			pullRequestNumber: 8,
			pullRequestTitle: "Hold the line",
			headSha: "a".repeat(40),
			stage: "authorized",
			expiresAt: new Date(),
		});
		expect(mergeEligibility(inspected)).toEqual({ ok: true });
		protectionStatus = 200;
		expect(
			mergeEligibility(
				await provider.inspect({
					_id: "intent",
					userId: "sisko",
					sessionId: "session",
					installationId: "12",
					repositoryId: "42",
					fullName: "Crisp-Inc/dev-command-center",
					pullRequestNumber: 8,
					pullRequestTitle: "Hold the line",
					headSha: "a".repeat(40),
					stage: "authorized",
					expiresAt: new Date(),
				}),
			),
		).toEqual({ ok: true });
		protectionStatus = 403;
		expect(
			mergeEligibility(
				await provider.inspect({
					_id: "intent",
					userId: "sisko",
					sessionId: "session",
					installationId: "12",
					repositoryId: "42",
					fullName: "Crisp-Inc/dev-command-center",
					pullRequestNumber: 8,
					pullRequestTitle: "Hold the line",
					headSha: "a".repeat(40),
					stage: "authorized",
					expiresAt: new Date(),
				}),
			),
		).toMatchObject({ ok: false });
	} finally {
		fetchTarget.fetch = original;
	}
});

test("exact-head confirmation refuses changed or indeterminate state and sanitizes provider outcomes", async () => {
	let mutationCalls = 0;
	expect(
		await confirmExactMerge({
			intent: { pullRequestId: "PR_8", headSha: "a".repeat(40) },
			inspect: async () => ({ ...eligible, head_sha: "b".repeat(40) }),
			merge: async () => {
				mutationCalls++;
				return { merged: true };
			},
		}),
	).toBe("stale");
	expect(mutationCalls).toBe(0);
	for (const [type, result] of [
		["MERGE_CONFLICT", "conflict"],
		["FORBIDDEN", "permission"],
	] as const)
		expect(
			await confirmExactMerge({
				intent: { pullRequestId: "PR_8", headSha: "a".repeat(40) },
				inspect: async () => eligible,
				merge: async () => ({ errors: [{ type }] }),
			}),
		).toBe(result);
});

test("merge callback binds its hashed session before role or installation authority", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "sisko", "sisko");
		const owner = await createSession(db, "sisko");
		const other = await createSession(db, "sisko");
		const state = await createMergeIntent(db, {
			userId: "sisko",
			sessionId: mergeIntentHash(owner.token),
			installationId: "12",
			repositoryId: "42",
			fullName: "Crisp-Inc/dev-command-center",
			pullRequestNumber: 8,
			pullRequestTitle: "Hold the line",
			headSha: "a".repeat(40),
		});
		const app = createApp(db, {
			...testConfig,
			githubClientId: "client",
			githubClientSecret: "secret",
			githubAppId: "1",
			githubAppPrivateKey: await privateKey(),
		});
		const original = globalThis.fetch;
		let calls = 0;
		fetchTarget.fetch = async (input) => {
			calls++;
			return String(input).includes("access_token")
				? Response.json({ access_token: "oauth-token" })
				: Response.json({ id: "other-github-user", login: "sisko" });
		};
		try {
			const callback = (cookie?: string) =>
				app.fetch(
					new Request(
						`http://local/auth/github/callback?code=x&state=${state}`,
						{
							headers: cookie ? { cookie } : {},
						},
					),
				);
			expect((await callback()).status).toBe(403);
			expect((await callback(`dcc_session=${other.token}`)).status).toBe(403);
			expect(calls).toBe(0);
			expect((await callback(`dcc_session=${owner.token}`)).status).toBe(403);
			expect(calls).toBe(2);
			expect(JSON.stringify(await db.mergeIntents.findOne({}))).not.toContain(
				"oauth-token",
			);
			expect(await mergeIntentFor(db, state)).toMatchObject({
				stage: "started",
			});
		} finally {
			fetchTarget.fetch = original;
		}
	}));
