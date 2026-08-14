import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import {
	bindInstallation,
	createOAuthState,
	createSession,
	upsertIdentity,
} from "#/access";
import { reconcileInstallations } from "#/github";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

test("public PWA assets and streams are isolated", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		for (const [path, type] of [
			["/", "text/html; charset=utf-8"],
			["/app.css", "text/css"],
			["/app.js", "text/javascript"],
			["/manifest.webmanifest", "application/manifest+json"],
			["/icon.svg", "image/svg+xml"],
			["/icon-adaptive.svg", "image/svg+xml"],
		]) {
			const response = await app.fetch(new Request(`http://local${path}`));
			expect(response.headers.get("content-type")).toBe(type);
			expect(response.headers.get("cache-control")).toBeNull();
		}
		const manifest = (await (
			await app.fetch(new Request("http://local/manifest.webmanifest"))
		).json()) as {
			icons: Array<{ src: string; sizes: string; purpose: string }>;
		};
		expect(manifest.icons).toEqual([
			{
				src: "/icon-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icon-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any",
			},
			{
				src: "/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		]);
		const shell = await (await app.fetch(new Request("http://local/"))).text();
		expect(shell).toContain(
			'<link rel="icon" href="/icon-adaptive.svg" type="image/svg+xml">',
		);
		expect(shell).toContain(
			'<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">',
		);
		expect(shell).toContain(
			'<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
		);
		for (const path of [
			"/favicon-32.png",
			"/apple-touch-icon.png",
			"/icon-192.png",
			"/icon-512.png",
			"/icon-maskable-512.png",
		])
			expect(
				(await app.fetch(new Request(`http://local${path}`))).headers.get(
					"content-type",
				),
			).toBe("image/png");
		const sourceIcon = await (
			await app.fetch(new Request("http://local/icon.svg"))
		).text();
		expect(sourceIcon).toContain("OpenMoji");
		expect(sourceIcon).toContain("CC BY-SA 4.0");
		const adaptiveIcon = await (
			await app.fetch(new Request("http://local/icon-adaptive.svg"))
		).text();
		expect(adaptiveIcon).toContain("prefers-color-scheme:dark");
		expect(adaptiveIcon).toContain("#f59e0b");
		expect(adaptiveIcon).toContain("#38bdf8");
		const worker = await (
			await app.fetch(new Request("http://local/sw.js"))
		).text();
		expect(worker).toContain("/icon-adaptive.svg");
		expect(worker).toContain("/apple-touch-icon.png");
		expect(worker).toContain("/icon-maskable-512.png");
		expect(worker).toContain("PATHS.has(u.pathname)");
		expect(worker).not.toContain('"/api/');
		expect(worker).not.toContain('"/events');
		expect(worker).not.toContain('"/webhooks/');
		expect(
			(await app.fetch(new Request("http://local/sw.js"))).headers.get(
				"cache-control",
			),
		).toContain("no-cache");
		expect(shell).toContain("/app.js?v=4");
		const javascript = await (
			await app.fetch(new Request("http://local/app.js"))
		).text();
		expect(javascript).toContain("showDirectoryPicker");
		expect(javascript).toContain("Provider reconciliation is stale.");
		expect(
			(await app.fetch(new Request("http://local/api/snapshot"))).status,
		).toBe(401);
		expect((await app.fetch(new Request("http://local/events"))).status).toBe(
			401,
		);
		expect(
			(
				await app.fetch(
					new Request("http://local/api/installations/12/repair", {
						method: "POST",
					}),
				)
			).status,
		).toBe(404);
	}));

test("GitHub webhook route rejects invalid HMAC and durably deduplicates valid delivery", () =>
	withDatabase(async (db) => {
		const app = createApp(db, { ...testConfig, githubWebhookSecret: "secret" });
		const body = JSON.stringify({
			installation: { id: 9, account: { login: "cubanx" } },
			repository: { id: 2 },
		});
		const request = (signature: string) =>
			new Request("http://local/webhooks/github", {
				method: "POST",
				headers: {
					"x-github-delivery": "quality-hmac",
					"x-github-event": "ping",
					"x-hub-signature-256": signature,
				},
				body,
			});
		expect((await app.fetch(request("sha256=invalid"))).status).toBe(401);
		const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
		expect((await app.fetch(request(signature))).status).toBe(202);
		await new Promise<void>((resolve) => queueMicrotask(resolve));
		await app.drain();
		expect((await app.fetch(request(signature))).status).toBe(202);
		expect(
			await db.inboxDeliveries.countDocuments({ deliveryId: "quality-hmac" }),
		).toBe(1);
	}));

test("dashboard shell uses compact OpenSpec disclosure and an accessible PR section name", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		const javascript = await (
			await app.fetch(new Request("http://local/app.js"))
		).text();
		expect(javascript).toContain("<details");
		expect(javascript).toContain("<summary");
		expect(javascript).toContain(
			'<img class="brand-icon" src="/icon-adaptive.svg" alt="">',
		);
		expect(javascript).toContain("Open tasks");
		expect(javascript).toContain('aria-label="Pull requests"');
		expect(javascript).not.toContain("Your open pull requests");
		expect(javascript).not.toContain("Pull requests needing attention");
		expect(javascript).toContain('id="pr-search"');
		expect(javascript).toContain('class="pr-controls"');
		expect(javascript).toContain('aria-live="polite"');
		expect(javascript).toContain("Clear");
		expect(javascript).toContain('event.key === "/"');
		expect(javascript).toContain('event.key === "Escape"');
		expect(javascript).toContain("workflow_failures");
		expect(javascript).not.toContain("failed_jobs");
		expect(javascript).not.toContain("failed_steps");
		const css = await (
			await app.fetch(new Request("http://local/app.css"))
		).text();
		expect(css).toContain("position: sticky");
		expect(css).toContain("flex-wrap: wrap");
	}));

test("local demo serves snapshot and SSE without a session and exposes no Railway routes", () =>
	withDatabase(async (db) => {
		const app = createApp(db, {
			...testConfig,
			localDemo: true,
			hostname: "127.0.0.1",
		});
		expect(
			(await (await app.fetch(new Request("http://local/api/snapshot"))).json())
				.pullRequests,
		).toHaveLength(1);
		const stream = await app.fetch(new Request("http://local/events"));
		expect(stream.status).toBe(200);
		await stream.body?.cancel();
		expect(
			(
				await app.fetch(
					new Request("http://local/webhooks/railway/example", {
						method: "POST",
					}),
				)
			).status,
		).toBe(404);
	}));

test("OAuth callback preserves zero bindings and production origin/readiness gates", () =>
	withDatabase(async (db) => {
		const app = createApp(db, {
			...testConfig,
			production: true,
			publicUrl: "https://command-center.up.railway.app",
			oauthCallbackUrl:
				"https://command-center.up.railway.app/auth/github/callback",
			githubClientId: "client",
			githubClientSecret: "secret",
		});
		expect(
			(
				await app.fetch(
					new Request("http://local/auth/github", {
						headers: {
							"x-forwarded-proto": "http",
							"x-forwarded-host": "command-center.up.railway.app",
						},
					}),
				)
			).status,
		).toBe(400);
		const state = await createOAuthState(db);
		const original = globalThis.fetch;
		globalThis.fetch = async (input) =>
			String(input).includes("access_token")
				? Response.json({ access_token: "token" })
				: Response.json({ id: 9, login: "kira" });
		try {
			expect(
				(
					await app.fetch(
						new Request(
							`http://local/auth/github/callback?code=code&state=${state}`,
							{
								headers: {
									"x-forwarded-proto": "https",
									"x-forwarded-host": "command-center.up.railway.app",
								},
							},
						),
					)
				).status,
			).toBe(302);
			expect(
				(await db.users.findOne({ _id: "9" }))?.installations,
			).toHaveLength(0);
		} finally {
			globalThis.fetch = original;
		}
		expect((await app.fetch(new Request("http://local/health"))).status).toBe(
			200,
		);
		await db.client.close();
		expect((await app.fetch(new Request("http://local/ready"))).status).toBe(
			503,
		);
	}));

test("public shell and health survive failed initialization while readiness reports 503", () =>
	withDatabase(async (db) => {
		await db.client.close();
		const app = createApp(db, testConfig);
		expect((await app.fetch(new Request("http://local/health"))).status).toBe(
			200,
		);
		expect((await app.fetch(new Request("http://local/"))).status).toBe(200);
		expect((await app.fetch(new Request("http://local/ready"))).status).toBe(
			503,
		);
	}));

test("failed initialization drain resolves with one sanitized diagnostic", () =>
	withDatabase(async (db) => {
		await db.client.close();
		const original = console.error,
			logs: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		try {
			await createApp(db, testConfig).drain();
			expect(logs).toEqual([
				[
					"webhook drain failed",
					"Client must be connected before running operations",
				],
			]);
		} finally {
			console.error = original;
		}
	}));

test("OAuth binds only the verified installation account and never persists its access token", () =>
	withDatabase(async (db) => {
		const app = createApp(db, {
				...testConfig,
				githubClientId: "client",
				githubClientSecret: "secret",
			}),
			original = globalThis.fetch;
		let account = "Crisp-Inc";
		globalThis.fetch = async (input) =>
			String(input).includes("access_token")
				? Response.json({ access_token: "oauth-token" })
				: String(input).includes("user/installations")
					? Response.json({
							installations: [{ id: 12, account: { login: account } }],
						})
					: Response.json({ id: 9, login: "kira" });
		try {
			for (const next of ["Crisp-Inc", "cubanx"]) {
				account = next;
				const state = await createOAuthState(db);
				expect(
					(
						await app.fetch(
							new Request(
								`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`,
							),
						)
					).status,
				).toBe(302);
			}
			const user = await db.users.findOne({ _id: "9" });
			expect(user?.installations).toMatchObject([
				{ installationId: "12", accountLogin: "cubanx" },
			]);
			expect(JSON.stringify(user)).not.toContain("oauth-token");
		} finally {
			globalThis.fetch = original;
		}
	}));

test("OAuth rejects an unverified installation without binding it", () =>
	withDatabase(async (db) => {
		const app = createApp(db, {
				...testConfig,
				githubClientId: "client",
				githubClientSecret: "secret",
			}),
			original = globalThis.fetch;
		globalThis.fetch = async (input) =>
			String(input).includes("access_token")
				? Response.json({ access_token: "oauth-token" })
				: String(input).includes("user/installations")
					? Response.json({
							installations: [{ id: 99, account: { login: "Crisp-Inc" } }],
						})
					: Response.json({ id: 9, login: "kira" });
		try {
			const state = await createOAuthState(db);
			expect(
				(
					await app.fetch(
						new Request(
							`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`,
						),
					)
				).status,
			).toBe(403);
			expect(
				(await db.users.findOne({ _id: "9" }))?.installations,
			).toHaveLength(0);
		} finally {
			globalThis.fetch = original;
		}
	}));

test("OAuth installation pagination rejects unsafe and looping next links without forwarding its token", () =>
	withDatabase(async (db) => {
		for (const link of [
			'<https://evil.example/page>; rel="next"',
			'<https://api.github.com/user/installations?per_page=100>; rel="next"',
		]) {
			const app = createApp(db, {
					...testConfig,
					githubClientId: "client",
					githubClientSecret: "secret",
				}),
				original = globalThis.fetch;
			const calls: string[] = [];
			globalThis.fetch = async (input) => {
				const url = String(input);
				calls.push(url);
				if (url.includes("access_token"))
					return Response.json({ access_token: "oauth-token" });
				if (url.endsWith("/user"))
					return Response.json({ id: 9, login: "kira" });
				if (url.includes("user/installations"))
					return Response.json({ installations: [] }, { headers: { link } });
				throw new Error(`unexpected ${url}`);
			};
			try {
				const state = await createOAuthState(db);
				expect(
					(
						await app.fetch(
							new Request(
								`http://local/auth/github/callback?code=x&state=${state}&installation_id=12`,
							),
						)
					).status,
				).toBe(502);
				expect(calls.some((call) => call.includes("evil.example"))).toBe(false);
			} finally {
				globalThis.fetch = original;
			}
		}
	}));

test("repair permits legacy and canonical bindings but rejects unapproved ones", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "kira");
		const session = await createSession(db, "u");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations.push({
			installationId: "12",
			boundAt: new Date(),
			repositories: [],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const app = createApp(db, testConfig),
			request = () =>
				new Request("http://local/api/installations/12/repair", {
					method: "POST",
					headers: { cookie: `dcc_session=${session.token}` },
				});
		expect((await app.fetch(request())).status).toBe(503);
		const current = await db.users.findOne({ _id: "u" });
		if (!current?.installations[0]) throw new Error("test binding missing");
		current.installations[0].accountLogin = "CUBANX";
		await db.users.replaceOne({ _id: "u" }, current);
		expect((await app.fetch(request())).status).toBe(503);
		current.installations[0].accountLogin = "external";
		await db.users.replaceOne({ _id: "u" }, current);
		expect((await app.fetch(request())).status).toBe(404);
	}));

test("OAuth binding redirects before its background bootstrap projects the allowed installation", () =>
	withDatabase(async (db) => {
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
			await crypto.subtle.exportKey("pkcs8", privateKey),
		)
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		const app = createApp(db, {
			...testConfig,
			githubClientId: "client",
			githubClientSecret: "secret",
			githubAppId: "1",
			githubAppPrivateKey: pem,
		});
		const original = globalThis.fetch;
		let releaseIdentity: (() => void) | undefined;
		let done: (() => void) | undefined;
		const bootstrapped = new Promise<void>((resolve) => {
			done = resolve;
		});
		globalThis.fetch = async (input) => {
			const url = String(input);
			if (url.includes("access_token"))
				return Response.json({ access_token: "oauth-token" });
			if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
			if (url.includes("user/installations"))
				return Response.json({
					installations: [{ id: 12, account: { login: "Crisp-Inc" } }],
				});
			if (url.includes("access_tokens"))
				return Response.json({ token: "installation-token" });
			if (url.endsWith("/installation"))
				return new Promise((resolve) => {
					releaseIdentity = () =>
						resolve(Response.json({ account: { login: "Crisp-Inc" } }));
				});
			if (url.includes("installation/repositories"))
				return Response.json({
					repositories: [{ id: 2, full_name: "Crisp-Inc/defiant" }],
				});
			if (url.includes("/pulls"))
				return Response.json([
					{
						number: 1,
						title: "Repair the defiant",
						user: { login: "kira" },
						state: "open",
						updated_at: "2030-01-01T00:00:00Z",
					},
				]);
			if (url.includes("/deployments")) {
				done?.();
				return Response.json([]);
			}
			throw new Error(`unexpected GitHub request ${url}`);
		};
		try {
			const state = await createOAuthState(db);
			expect(
				(
					await app.fetch(
						new Request(
							`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`,
						),
					)
				).status,
			).toBe(302);
			expect(
				(await db.users.findOne({ _id: "9" }))?.installations,
			).toMatchObject([
				{ installationId: "12", accountLogin: "Crisp-Inc", repositories: [] },
			]);
			await new Promise((resolve) => setTimeout(resolve));
			releaseIdentity?.();
			await bootstrapped;
			let projected = false;
			const deadline = Date.now() + 2000;
			while (!projected && Date.now() < deadline) {
				const user = await db.users.findOne({ _id: "9" });
				projected = Boolean(
					user?.installations[0]?.repositories[0]?.pullRequests?.length,
				);
				if (!projected) await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(projected).toBe(true);
			expect(
				(await db.users.findOne({ _id: "9" }))?.installations[0]
					?.repositories[0]?.pullRequests,
			).toMatchObject([{ number: 1, author_login: "kira" }]);
		} finally {
			globalThis.fetch = original;
		}
	}));

test("failed OAuth bootstrap keeps the binding durable for scheduled reconciliation", () =>
	withDatabase(async (db) => {
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
			await crypto.subtle.exportKey("pkcs8", privateKey),
		)
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		const app = createApp(db, {
			...testConfig,
			githubClientId: "client",
			githubClientSecret: "secret",
			githubAppId: "1",
			githubAppPrivateKey: pem,
		});
		const original = globalThis.fetch,
			originalError = console.error,
			logs: unknown[][] = [];
		let fail = true;
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		globalThis.fetch = async (input) => {
			const url = String(input);
			if (url.includes("access_token"))
				return Response.json({ access_token: "oauth-token" });
			if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
			if (url.includes("user/installations"))
				return Response.json({
					installations: [{ id: 12, account: { login: "Crisp-Inc" } }],
				});
			if (url.includes("access_tokens"))
				return Response.json({ token: "installation-token" });
			if (url.endsWith("/installation"))
				return fail
					? new Response("github diagnostic", { status: 401 })
					: Response.json({ account: { login: "Crisp-Inc" } });
			if (url.includes("installation/repositories"))
				return Response.json({
					repositories: [{ id: 2, full_name: "Crisp-Inc/defiant" }],
				});
			if (url.includes("/pulls") || url.includes("/deployments"))
				return Response.json([]);
			throw new Error(`unexpected GitHub request ${url}`);
		};
		try {
			const state = await createOAuthState(db);
			expect(
				(
					await app.fetch(
						new Request(
							`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`,
						),
					)
				).status,
			).toBe(302);
			for (let attempts = 0; !logs.length && attempts < 50; attempts++)
				await new Promise((resolve) => setTimeout(resolve));
			expect(
				(await db.users.findOne({ _id: "9" }))?.installations[0],
			).toMatchObject({
				installationId: "12",
				accountLogin: "Crisp-Inc",
				repositories: [],
			});
			expect(logs).toEqual([
				["installation bootstrap failed", "GitHub request failed (401)"],
			]);
			fail = false;
			await reconcileInstallations(
				db,
				async () => "installation-token",
				globalThis.fetch,
			);
			expect(
				(await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories,
			).toMatchObject([{ repositoryId: "2", full_name: "Crisp-Inc/defiant" }]);
		} finally {
			globalThis.fetch = original;
			console.error = originalError;
		}
	}));

test("startup drain projects a pending OpenSpec push and clears the inbox payload", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		await db.inboxDeliveries.insertOne({
			_id: "github:push",
			provider: "github",
			deliveryId: "push",
			eventName: "push",
			payload: JSON.stringify({
				installation: { id: 9, account: { login: "cubanx" } },
				repository: { id: 2 },
				ref: "refs/heads/main",
				after: "a".repeat(40),
				commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }],
			}),
			status: "pending",
			attempts: 0,
			receivedAt: new Date(),
		});
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(
			await crypto.subtle.exportKey("pkcs8", privateKey),
		)
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		const original = globalThis.fetch;
		globalThis.fetch = async (input) =>
			String(input).includes("access_tokens")
				? Response.json({ token: "installation" })
				: new Response("- [x] Launch");
		try {
			const app = createApp(db, {
				...testConfig,
				githubAppId: "1",
				githubAppPrivateKey: pem,
			});
			await app.drain();
			expect(
				(await db.users.findOne({ _id: "u" }))?.installations[0]
					?.repositories[0]?.openSpecs,
			).toHaveLength(1);
			expect(
				(await db.inboxDeliveries.findOne({ _id: "github:push" }))?.payload,
			).toBeUndefined();
		} finally {
			globalThis.fetch = original;
		}
	}));
