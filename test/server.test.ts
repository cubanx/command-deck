import { createHmac } from "node:crypto";
import { expect, test, vi } from "vitest";
import { bindInstallation, createOAuthState, createSession, upsertIdentity } from "#/access";
import { loadConfig } from "#/config";
import { mutateUser } from "#/db";
import { reconcileInstallations } from "#/github";
import { advanceMergeIntent, mergeIntentFor } from "#/merge";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

const fetchTarget: {
	fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
} = globalThis;

const seedMergePullRequest = async (db: Parameters<typeof mutateUser>[0]) => {
	await upsertIdentity(db, "u", "kira");
	await bindInstallation(db, "u", "12", "cubanx");
	await mutateUser(db, "u", (user) => {
		const installation = user.installations[0]!;
		installation.permissions = { pull_requests: "write" };
		installation.repositories = [
			{
				repositoryId: "42",
				full_name: "Crisp-Inc/dev-command-center",
				openSpecs: [],
				deployments: [],
				pullRequests: [
					{
						number: 8,
						title: "Hold the line",
						author_login: "kira",
						state: "open",
						draft: false,
						labels: ["openspec-not-required"],
						head_sha: "a".repeat(40),
						mergeable: "clean",
					},
				],
			},
		];
	});
};

const mergeTarget = new URLSearchParams({
	installationId: "12",
	repositoryId: "42",
	number: "8",
	headSha: "a".repeat(40),
}).toString();

test("public shell assets and streams are isolated without a service worker", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		for (const [path, type, cacheControl] of [
			["/", "text/html; charset=utf-8", "no-cache"],
			["/configuration", "text/html; charset=utf-8", "no-cache"],
			["/app.css", "text/css", "no-cache"],
			["/app.js", "text/javascript", "no-cache"],
			["/manifest.webmanifest", "application/manifest+json", null],
			["/icon.svg", "image/svg+xml", null],
			["/icon-adaptive.svg", "image/svg+xml", null],
			["/avatar-fixture.svg", "image/svg+xml", null],
		]) {
			const response = await app.fetch(new Request(`http://local${path}`));
			expect(response.headers.get("content-type")).toBe(type);
			expect(response.headers.get("cache-control")).toBe(cacheControl);
		}
		const shell = await (await app.fetch(new Request("http://local/"))).text();
		expect(shell).toContain("<title>Command Deck.ai</title>");
		expect(shell).toContain('<link rel="icon" href="/icon-adaptive.svg" type="image/svg+xml">');
		expect(shell).toContain('<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">');
		expect(shell).toContain('rel="manifest" href="/manifest.webmanifest"');
		expect(shell).toContain("apple-touch-icon");
		for (const path of [
			"/favicon-32.png",
			"/apple-touch-icon.png",
			"/icon-192.png",
			"/icon-512.png",
			"/icon-maskable-512.png",
		])
			expect((await app.fetch(new Request(`http://local${path}`))).headers.get("content-type")).toBe("image/png");
		const sourceIcon = await (await app.fetch(new Request("http://local/icon.svg"))).text();
		expect(sourceIcon).toContain("OpenMoji");
		expect(sourceIcon).toContain("CC BY-SA 4.0");
		const adaptiveIcon = await (await app.fetch(new Request("http://local/icon-adaptive.svg"))).text();
		expect(adaptiveIcon).toContain("prefers-color-scheme:dark");
		expect(adaptiveIcon).toContain("#f59e0b");
		expect(adaptiveIcon).toContain("#38bdf8");
		const worker = await (await app.fetch(new Request("http://local/sw.js"))).text();
		expect(worker).toContain("self.skipWaiting()");
		expect(worker).toMatch(/caches\s*\.keys\(\)/);
		expect(worker).toContain("caches.delete(cache)");
		expect(worker).toContain("self.registration.unregister()");
		expect(worker).toContain("client.navigate(client.url)");
		expect(worker).not.toContain("const CACHE");
		expect(worker).not.toContain("const ASSETS");
		expect(worker).not.toContain('addEventListener("fetch"');
		expect((await app.fetch(new Request("http://local/sw.js"))).headers.get("cache-control")).toContain("no-cache");
		expect(shell).toContain('href="/app.css"');
		expect(shell).toContain('src="/app.js"');
		expect(shell).not.toContain("?v=");
		const javascript = await (await app.fetch(new Request("http://local/app.js"))).text();
		expect(javascript).not.toContain("serviceWorker?.register");
		const css = await (await app.fetch(new Request("http://local/app.css"))).text();
		expect(css).toContain("width: min(420px, 100%)");
		expect(css).toContain("padding: 10px 12px");
		expect(css).toContain("font-size: 16px");
		expect(css).toContain(".brand h1 {\n\twhite-space: nowrap;");
		expect(css).toContain(
			"header {\n\tdisplay: grid;\n\tgrid-template-columns: max-content minmax(0, 1fr) max-content;",
		);
		expect(css).toContain("justify-self: center;");
		expect(css).toContain("margin-left: 0;");
		expect(css).toContain("@media (max-width: 760px) {\n\theader {\n\t\tdisplay: flex;");
		expect(javascript).toContain("showDirectoryPicker");
		expect(javascript).toContain("Provider reconciliation is stale.");
		expect((await app.fetch(new Request("http://local/api/snapshot"))).status).toBe(401);
		expect((await app.fetch(new Request("http://local/events"))).status).toBe(401);
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
		expect(await db.inboxDeliveries.countDocuments({ deliveryId: "quality-hmac" })).toBe(1);
	}));

test("GitHub webhook route rejects correctly signed malformed JSON without an inbox row", () =>
	withDatabase(async (db) => {
		const app = createApp(db, { ...testConfig, githubWebhookSecret: "secret" });
		const body = "{";
		const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
		expect(
			(
				await app.fetch(
					new Request("http://local/webhooks/github", {
						method: "POST",
						headers: {
							"x-github-delivery": "bad-json",
							"x-github-event": "ping",
							"x-hub-signature-256": signature,
						},
						body,
					}),
				)
			).status,
		).toBe(400);
		expect(await db.inboxDeliveries.countDocuments({})).toBe(0);
	}));

test("lifecycle webhook reconciliation refreshes affected SSE streams", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await mutateUser(db, "u", (user) => {
			user.installations[0]!.repositories = [
				{
					repositoryId: "2",
					full_name: "ds9/ops",
					openSpecs: [],
					deployments: [],
					pullRequests: [
						{
							number: 7,
							title: "Hold the wormhole",
							author_login: "sisko",
							state: "open",
							draft: false,
							head_sha: "a".repeat(40),
							mergeable: "unknown",
						},
					],
				},
			];
		});
		const calls: number[] = [];
		const app = createApp(db, { ...testConfig, githubWebhookSecret: "secret" }, undefined, {
			reconcilePullRequest: async (_db, target) => {
				calls.push(target.number);
				return { kind: "unchanged" };
			},
		});
		const session = await createSession(db, "u");
		const stream = await app.fetch(
			new Request("http://local/events", {
				headers: { cookie: `dcc_session=${session.token}` },
			}),
		);
		const reader = stream.body?.getReader();
		if (!reader) throw new Error("event stream body missing");
		await reader.read();
		const body = JSON.stringify({
			installation: { id: 9, account: { login: "cubanx" } },
			repository: { id: 2 },
			pull_request: { number: 7 },
			review: { state: "approved" },
		});
		const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
		expect(
			await app.fetch(
				new Request("http://local/webhooks/github", {
					method: "POST",
					headers: {
						"x-github-delivery": "targeted-refresh",
						"x-github-event": "pull_request_review",
						"x-hub-signature-256": signature,
					},
					body,
				}),
			),
		).toMatchObject({ status: 202 });
		await app.drain();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(calls).toEqual([7]);
		expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: refresh");
		expect(
			await app.fetch(
				new Request("http://local/webhooks/github", {
					method: "POST",
					headers: {
						"x-github-delivery": "targeted-refresh-noop",
						"x-github-event": "pull_request_review",
						"x-hub-signature-256": signature,
					},
					body,
				}),
			),
		).toMatchObject({ status: 202 });
		await app.drain();
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(
			await Promise.race([reader.read(), new Promise<undefined>((resolve) => setTimeout(resolve, 25))]),
		).toBeUndefined();
		await reader.cancel();
		app.stop?.();
	}));

test("installation repair refreshes only bound streams after a changed bootstrap", () =>
	withDatabase(async (db) => {
		for (const [id, installationId] of [
			["u", "9"],
			["shared", "9"],
			["foreign", "10"],
		] as const) {
			await upsertIdentity(db, id, id);
			await bindInstallation(db, id, installationId, "cubanx");
		}
		let outcome: "changed" | "unchanged" | "error" = "changed";
		const app = createApp(db, testConfig, undefined, {
			reconcileInstallations: async () => [],
			bootstrapInstallation: async (database, installationId) => {
				if (outcome === "error")
					return {
						kind: "error",
						stale: true,
						message: "reconciliation failed",
					};
				if (outcome === "changed")
					await mutateUser(database, "u", (user) => {
						user.installations.find((item) => item.installationId === installationId)!.repositories = [
							{
								repositoryId: "2",
								full_name: "ds9/ops",
								pullRequests: [],
								openSpecs: [],
								deployments: [],
							},
						];
					});
				return outcome === "changed" ? { kind: "changed", body: [{ id: 2 }] } : { kind: "unchanged" };
			},
		});
		const stream = async (id: string) => {
			const session = await createSession(db, id);
			const response = await app.fetch(
				new Request("http://local/events", {
					headers: { cookie: `dcc_session=${session.token}` },
				}),
			);
			const reader = response.body?.getReader();
			if (!reader) throw new Error("event stream body missing");
			await reader.read();
			return { reader, session };
		};
		const primary = await stream("u"),
			shared = await stream("shared"),
			foreign = await stream("foreign");
		const repair = () =>
			app.fetch(
				new Request("http://local/api/installations/9/repair", {
					method: "POST",
					headers: { cookie: `dcc_session=${primary.session.token}` },
				}),
			);
		const none = (reader: ReadableStreamDefaultReader<Uint8Array>) =>
			Promise.race([reader.read(), new Promise<undefined>((resolve) => setTimeout(resolve, 25))]);
		try {
			expect((await repair()).status).toBe(200);
			expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories).toHaveLength(1);
			for (const item of [primary, shared])
				expect(new TextDecoder().decode((await item.reader.read()).value)).toContain("event: refresh");
			outcome = "unchanged";
			await repair();
			expect(await none(primary.reader)).toBeUndefined();
			expect(await none(shared.reader)).toBeUndefined();
			outcome = "error";
			const failed = await repair();
			expect(failed.status).toBe(200);
			expect(await none(primary.reader)).toBeUndefined();
			expect(await none(shared.reader)).toBeUndefined();
			expect(await none(foreign.reader)).toBeUndefined();
			expect(await failed.text()).toContain("reconciliation failed");
		} finally {
			await Promise.all([primary.reader.cancel(), shared.reader.cancel(), foreign.reader.cancel()]);
			app.stop();
		}
	}));

test("changed repairs refresh every bound stream after persistence and suppress no-op, ignored, and failed refreshes", () =>
	withDatabase(async (db) => {
		for (const [id, login, installationId] of [
			["u", "sisko", "9"],
			["shared", "bashir", "9"],
			["foreign", "garak", "10"],
		] as const) {
			await upsertIdentity(db, id, login);
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
								title: "Hold the wormhole",
								author_login: login,
								state: "open",
								draft: false,
								mergeable: "unknown",
							},
						],
					},
				];
			});
		}
		let outcome: "changed" | "openspec" | "closed" | "unchanged" | "error" = "changed";
		const app = createApp(db, { ...testConfig, githubWebhookSecret: "secret" }, undefined, {
			reconcilePullRequest: async (database, target) => {
				if (outcome === "error")
					return {
						kind: "error",
						stale: true,
						message: "provider unavailable",
					};
				if (outcome === "changed" || outcome === "openspec" || outcome === "closed")
					await Promise.all(
						["u", "shared"].map((id) =>
							mutateUser(database, id, (user) => {
								const pullRequests = user.installations[0]!.repositories[0]!.pullRequests;
								if (outcome === "closed") pullRequests.splice(0);
								else if (outcome === "openspec")
									user.installations[0]!.repositories[0]!.openSpecs.push({
										change_name: "repair-wolf-359",
										completed: 0,
										total: 1,
										pre_merge_ready: false,
										source_commit: "a".repeat(40),
										active_group: null,
										updated_at: "2030-01-01T00:00:00Z",
									});
								else pullRequests[0]!.title = "Repair the wormhole";
							}),
						),
					);
				return outcome === "changed" || outcome === "openspec" || outcome === "closed"
					? { kind: "changed", body: { number: target.number } }
					: { kind: "unchanged" };
			},
		});
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
			return { reader, session };
		};
		const primary = await streamFor("u");
		const shared = await streamFor("shared");
		const foreign = await streamFor("foreign");
		const repair = () =>
			app.fetch(
				new Request("http://local/api/reconcile/pull-request", {
					method: "POST",
					headers: {
						cookie: `dcc_session=${primary.session.token}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						installationId: "9",
						repositoryId: "2",
						number: 7,
					}),
				}),
			);
		try {
			expect((await repair()).status).toBe(200);
			expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.pullRequests[0]?.title).toBe(
				"Repair the wormhole",
			);
			for (const stream of [primary, shared])
				expect(new TextDecoder().decode((await stream.reader.read()).value)).toContain("event: refresh");
			const openSpec = await streamFor("u");
			outcome = "openspec";
			expect((await repair()).status).toBe(200);
			expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.openSpecs).toMatchObject([
				{ change_name: "repair-wolf-359" },
			]);
			expect(new TextDecoder().decode((await openSpec.reader.read()).value)).toContain("event: refresh");
			expect(new TextDecoder().decode((await primary.reader.read()).value)).toContain("event: refresh");
			await openSpec.reader.cancel();
			outcome = "unchanged";
			expect((await repair()).status).toBe(200);
			const ignored = JSON.stringify({
				installation: { id: 9, account: { login: "cubanx" } },
				repository: { id: 2 },
			});
			const signature = `sha256=${createHmac("sha256", "secret").update(ignored).digest("hex")}`;
			expect(
				(
					await app.fetch(
						new Request("http://local/webhooks/github", {
							method: "POST",
							headers: {
								"x-github-delivery": "ignored-refresh",
								"x-github-event": "ping",
								"x-hub-signature-256": signature,
							},
							body: ignored,
						}),
					)
				).status,
			).toBe(202);
			await app.drain();
			const noEvent = (reader: ReadableStreamDefaultReader<Uint8Array>) =>
				Promise.race([reader.read(), new Promise<undefined>((resolve) => setTimeout(resolve, 25))]);
			expect(await noEvent(primary.reader)).toBeUndefined();
			outcome = "error";
			expect((await repair()).status).toBe(502);
			expect(await noEvent(foreign.reader)).toBeUndefined();
		} finally {
			await Promise.all([primary.reader.cancel(), shared.reader.cancel(), foreign.reader.cancel()]);
			app.stop();
		}
	}));

test("dashboard shell uses compact OpenSpec disclosure and an accessible PR section name", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		const javascript = await (await app.fetch(new Request("http://local/app.js"))).text();
		expect(javascript).toContain("<details");
		expect(javascript).toContain("<summary");
		expect(javascript).toContain('<img class="brand-icon" src="/icon-adaptive.svg" alt="">');
		expect(javascript).toContain("<h1>Command Deck.ai</h1>");
		expect(javascript).toContain("Open tasks");
		expect(javascript).toContain('aria-label="Pull requests"');
		expect(javascript).not.toContain("Your open pull requests");
		expect(javascript).not.toContain("Pull requests needing attention");
		expect(javascript).toContain('id="pr-search"');
		expect(javascript).toContain('class="pr-controls"');
		expect(javascript).toContain('class="control-group search-results"');
		expect(javascript).toContain('class="control-group filters"');
		expect(javascript).toContain('class="control-group sorting"');
		expect(javascript).toContain('<fieldset class="repository-filter"><legend>Repositories</legend>');
		expect(javascript).not.toContain('<details class="repository-filter"');
		expect(javascript).not.toContain("repository-search");
		expect(javascript).not.toContain("repositoryQuery");
		expect(javascript).toContain('aria-live="polite"');
		expect(javascript).toContain("Clear");
		expect(javascript).toContain('event.key === "/"');
		expect(javascript).toContain('event.key === "Escape"');
		expect(javascript).toContain('id="pr-sort"');
		expect(javascript).not.toContain('aria-describedby="codex-activity-status"');
		expect(javascript).toContain('id="pr-direction"');
		expect(javascript).toContain("Lifecycle stage");
		expect(javascript).toContain("Needs attention");
		expect(javascript).toContain("Opened");
		expect(javascript).toContain("Closest to merge");
		expect(javascript).not.toContain("Codex activity (unavailable)");
		expect(javascript).not.toContain("codex-activity-status");
		expect(javascript).toContain("${repositoryGroup}${filterGroup}${sortingGroup}${searchGroup}");
		expect(javascript).toContain("PR lifecycle. Current stage:");
		expect(javascript).toContain("lifecycle-rail");
		expect(javascript).toContain("data-status-detail");
		expect(javascript).toContain("pointerenter");
		expect(javascript).toContain("data-status-detail-close");
		expect(javascript).toContain("dcc-pr-sort");
		expect(javascript).toContain("sort: view.sort");
		expect(javascript).not.toContain("/api/codex-activity");
		expect(javascript).toContain("workflow_failures");
		expect(javascript).not.toContain("failed_jobs");
		expect(javascript).not.toContain("failed_steps");
		const css = await (await app.fetch(new Request("http://local/app.css"))).text();
		expect(css).toContain("position: sticky");
		expect(css).toContain("flex-wrap: wrap");
		expect(css).toContain(".lifecycle-pill.complete");
		expect(css).toContain(".lifecycle-pill.current");
		expect(css).toContain(".lifecycle-pill.upcoming");
		expect(css).toContain("display: inline-flex");
		expect(css).toContain("--lifecycle-complete: #15803d");
		expect(css).toContain("--lifecycle-current: #1d4ed8");
		expect(css).toContain("--warning: #92400e");
		expect(css).toContain("--lifecycle-complete: #86efac");
		expect(css).toContain("--lifecycle-current: #93c5fd");
		expect(css).toContain("--warning: #fcd34d");
		expect(css).toContain("color: var(--lifecycle-complete)");
		expect(css).toContain("color: var(--lifecycle-current)");
		expect(css).toContain("color: var(--warning)");
		expect(css).toContain(".pr-lifecycle {\n\tdisplay: flex;\n\tflex-direction: column;");
		expect(css).toContain(".pr-lifecycle-title {\n\tmargin: 0;\n\tpadding: 0 4px;");
		expect(css).toContain(".pr-statuses + .muted {\n\tmargin-top: 8px;");
		expect(css).toContain(".control-group");
		expect(css).not.toContain(".sorting #codex-activity-status");
		expect(css).toContain(".repository-options {\n\tdisplay: flex;\n\tflex-wrap: wrap;");
		expect(javascript).toContain('class="stack"');
		expect(javascript).toContain('<article class="card"><div class="pr-card-header">');
		expect(css).toContain(".stack > :not(.card) + :not(.card)");
		expect(css).toContain(".stack > article.card + article.card");
		expect(css).toContain(':root[data-appearance="dark"] .openspec');
		expect(css).toContain(':root[data-appearance="dark"] {');
		expect(css).toContain(".openspec a");
		await app.drain();
	}));

test("avatar navigation opens one dedicated configuration page", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		await app.drain();
		const javascript = await (await app.fetch(new Request("http://local/app.js"))).text();
		const css = await (await app.fetch(new Request("http://local/app.css"))).text();
		expect(javascript).toContain('class="avatar-menu"');
		expect(javascript).toContain('class="brand brand-home" href="/"');
		expect(javascript).toContain('aria-label="User menu"');
		expect(javascript).toContain('class="avatar-menu-caret" aria-hidden="true">▾</span>');
		expect(javascript).toContain('class="appearance-menu"');
		expect(javascript).toContain('class="appearance-check"');
		expect(javascript).toContain("✓");
		expect(javascript).toContain('src="/avatar-fixture.svg"');
		expect(javascript).toContain('href="/configuration"');
		expect(javascript).toContain("⚙ Configuration");
		expect(javascript).toContain('"menu-appearance"');
		expect(javascript).toContain('id="configuration-title"');
		expect(javascript).toContain("globalThis.location?.pathname");
		expect(javascript).toContain('event.key === "Escape"');
		expect(javascript).toContain('addEventListener("focusout"');
		expect(javascript).toContain("avatarMenu.open = false");
		expect(javascript).not.toContain('href="#configuration"');
		expect(javascript).not.toContain("Connect local checkout");
		expect(javascript).toContain("Enable notifications");
		expect(javascript).not.toContain('appearanceChoicesMarkup("appearance")');
		expect(css).toContain("width: min(220px");
		expect(css).toContain(".avatar-menu-caret");
		expect(css).toContain(".avatar-menu-caret {\n\tfont-size: 1rem;");
		expect(css).toContain(".appearance-menu label");
		expect(css).toContain(".configuration-link");
		expect(css).toContain("text-decoration: none");
		expect(css).toContain(".brand-home");
		expect(css).toContain("header,\n.brand {");
		expect(css).toContain("align-items: flex-start");
		expect(css).toContain("flex-wrap: nowrap");
		expect(javascript).toContain("value[0].toUpperCase()");
		expect(javascript).toContain("Reconcile PR");
		expect(javascript).toContain("Reconcile all PRs");
		expect(javascript).toContain("Reconcile installation");
		expect(javascript).toContain("localStorage");
		expect(javascript).toContain("matchMedia");
		expect(javascript).toContain("indexedDB");
		expect(javascript).toContain("queryPermission");
		expect(javascript).toContain("requestPermission");
		expect(javascript).toContain("Connect organization root");
		expect(javascript).toContain("Permission required");
		expect(javascript).toContain("<caption>${caption}</caption>");
		expect(javascript).toContain(
			'<thead><tr><th scope="col">Repository</th><th scope="col">Account</th><th scope="col">State</th><th scope="col">Action</th></tr></thead>',
		);
		expect(javascript).toContain("localeCompare(right.repository.full_name");
		expect(javascript).toContain('sensitivity: "accent"');
		expect(javascript).toContain('state === "Resolved"');
		expect(javascript.indexOf('checkoutTableMarkup("Unresolved"')).toBeLessThan(
			javascript.indexOf('checkoutTableMarkup("Resolved"'),
		);
		expect(javascript).toContain("No unresolved checkouts.");
		expect(javascript).toContain("No resolved checkouts.");
		expect(javascript).toContain('class="pr-card-header"');
		expect(javascript).not.toContain('type="button" disabled');
		expect(css).toContain(".pr-card-header h3 {\n\tmargin: 0;");
		expect(css).toContain("--link: #7dd3fc");
		expect(javascript).not.toContain("/api/checkouts");
		expect(javascript).not.toContain("/api/local-evidence");
		expect(javascript).not.toContain("response.json().catch");
		expect(css).toContain('[data-appearance="dark"]');
		expect(css).toContain("color-scheme");
		expect(css).toContain("--page-bg:");
		expect(css).toContain("--surface:");
		expect(css).toContain("--surface-muted:");
		expect(css).toContain("--text:");
		expect(css).toContain("--muted:");
		expect(css).toContain("--border:");
		expect(css).toContain("--link:");
		expect(css).toContain("background: var(--page-bg)");
		expect(css).toContain("color: var(--text)");
		expect(css).toContain(".avatar-menu");
		expect(css).toContain(".user-avatar");
	}));

test("reconcile route requires an authenticated user with an approved bound installation", () =>
	withDatabase(async (db) => {
		const app = createApp(db, testConfig);
		const request = (headers?: HeadersInit) =>
			app.fetch(new Request("http://local/api/reconcile", { method: "POST", headers }));
		expect((await request()).status).toBe(401);
		await upsertIdentity(db, "u", "kira");
		const session = await createSession(db, "u");
		expect((await request({ cookie: `dcc_session=${session.token}` })).status).toBe(404);
		await bindInstallation(db, "u", "12", "external");
		expect((await request({ cookie: `dcc_session=${session.token}` })).status).toBe(404);
	}));

test("manual PR reconciliation is scoped to known open PRs and all-known repair stays targeted", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "kira");
		await upsertIdentity(db, "foreign", "garak");
		await bindInstallation(db, "u", "12", "cubanx");
		await bindInstallation(db, "foreign", "13", "cubanx");
		await mutateUser(db, "u", (user) => {
			user.installations[0]!.repositories = [
				{
					repositoryId: "42",
					full_name: "cubanx/defiant",
					openSpecs: [],
					deployments: [],
					pullRequests: [
						{
							number: 7,
							title: "Repair the Defiant",
							author_login: "kira",
							state: "open",
							draft: false,
							mergeable: "unknown",
						},
					],
				},
			];
		});
		const calls: Array<{
			installationId: string;
			repositoryId: string;
			number: number;
		}> = [];
		let fail = false;
		const app = createApp(db, testConfig, undefined, {
			reconcilePullRequest: async (_db, target) => {
				calls.push(target);
				return fail ? { kind: "error", message: "repair failed", stale: true } : { kind: "unchanged" };
			},
		});
		const session = await createSession(db, "u");
		const post = (path: string, body?: unknown) =>
			app.fetch(
				new Request(`http://local${path}`, {
					method: "POST",
					headers: {
						cookie: `dcc_session=${session.token}`,
						...(body === undefined ? {} : { "content-type": "application/json" }),
					},
					body: body === undefined ? undefined : JSON.stringify(body),
				}),
			);
		expect(
			(
				await post("/api/reconcile/pull-request", {
					installationId: "12",
					repositoryId: "42",
					number: 7,
				})
			).status,
		).toBe(200);
		expect(await (await post("/api/reconcile/pull-requests")).json()).toEqual({
			status: "success",
			count: 1,
			successfulCount: 1,
			failedCount: 0,
			estimatedProviderRequests: 4,
		});
		expect(
			calls.map(({ installationId, repositoryId, number }) => ({
				installationId,
				repositoryId,
				number,
			})),
		).toEqual([
			{ installationId: "12", repositoryId: "42", number: 7 },
			{ installationId: "12", repositoryId: "42", number: 7 },
		]);
		fail = true;
		const partial = await post("/api/reconcile/pull-requests");
		expect(partial.status).toBe(502);
		expect(await partial.json()).toEqual({
			status: "partial_failure",
			count: 1,
			successfulCount: 0,
			failedCount: 1,
			estimatedProviderRequests: 4,
		});
		expect(
			(
				await post("/api/reconcile/pull-request", {
					installationId: "13",
					repositoryId: "42",
					number: 7,
				})
			).status,
		).toBe(404);
		expect(
			(
				await post("/api/reconcile/pull-request", {
					installationId: "12",
					repositoryId: "42",
					number: 99,
				})
			).status,
		).toBe(404);
	}));

test("manual reconciliation scopes work to the signed-in user, refreshes, and sanitizes failures", () =>
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		await upsertIdentity(db, "u", "kira");
		await upsertIdentity(db, "foreign", "garak");
		await bindInstallation(db, "u", "12", "cubanx");
		await bindInstallation(db, "foreign", "13", "cubanx");
		const session = await createSession(db, "u");
		const app = createApp(db, {
			...testConfig,
			githubAppId: "1",
			githubAppPrivateKey: pem,
		});
		const original = globalThis.fetch;
		const originalError = console.error,
			logs: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		const tokenIds: string[] = [];
		let releaseIdentity: (() => void) | undefined,
			fail = false;
		const started = new Promise<void>((resolve) => {
			fetchTarget.fetch = async (input) => {
				const url = String(input);
				if (url.includes("access_tokens")) {
					tokenIds.push(url.match(/installations\/(\d+)/)?.[1] ?? "");
					return Response.json({ token: "installation-token" });
				}
				if (url.includes("/app/installations/")) {
					if (fail) return Response.json({ account: { login: "cubanx" } });
					return new Promise((release) => {
						releaseIdentity = () => release(Response.json({ account: { login: "cubanx" } }));
						resolve();
					});
				}
				if (url.endsWith("/repos/cubanx/defiant")) return Response.json({ default_branch: "main" });
				if (url.includes("/rules/branches/")) return Response.json([]);
				if (url.includes("/branches/main/protection")) return Response.json({}, { status: 404 });
				if (url.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "cubanx/defiant" }],
					});
				if (url.includes("/pulls/1/files"))
					return Response.json([{ filename: "openspec/changes/repair-defiant/tasks.md" }]);
				if (url.includes("/pulls?"))
					return Response.json([
						{
							number: 1,
							title: "Repair the defiant",
							user: { login: "kira" },
							state: "open",
							head: { sha: "a".repeat(40) },
							body: "## OpenSpecs\n- repair-defiant",
						},
					]);
				if (url.includes("/deployments")) return Response.json([]);
				if (url.includes("contents/openspec/changes/repair-defiant/tasks.md")) {
					if (fail)
						return Response.json(
							{
								message: "OpenSpec artifact denied",
								documentation_url: "https://docs.github.com/rest",
								token: "fixture-token-value",
								raw_body_fixture: "fixture-raw-body-value",
							},
							{
								status: 500,
								headers: { "x-fixture-secret": "fixture-header-value" },
							},
						);
					return new Response("## 1. Repair the defiant");
				}
				throw new Error(`unexpected ${url}`);
			};
		});
		try {
			const request = () =>
				app.fetch(
					new Request("http://local/api/reconcile", {
						method: "POST",
						headers: { cookie: `dcc_session=${session.token}` },
					}),
				);
			const events = await app.fetch(
				new Request("http://local/events", {
					headers: { cookie: `dcc_session=${session.token}` },
				}),
			);
			const reader = events.body?.getReader();
			if (!reader) throw new Error("event stream body missing");
			await reader.read();
			const first = request();
			await started;
			expect(await (await request()).json()).toEqual({ status: "running" });
			releaseIdentity?.();
			const successfulResponse = await first;
			expect(await successfulResponse.json()).toEqual({ status: "success" });
			expect(tokenIds).toEqual(["12"]);
			const successfulUser = await db.users.findOne({ _id: "u" });
			if (!successfulUser) throw new Error("test user missing");
			const successfulInstallation = successfulUser.installations[0];
			if (!successfulInstallation) throw new Error("test installation missing");
			const successfulEvidence = successfulInstallation.reconciliationEvidence?.at(-1);
			expect(successfulEvidence).toMatchObject({
				outcome: "success",
				operation: "reconciliation",
			});
			const foreignUser = await db.users.findOne({ _id: "foreign" });
			if (!foreignUser) throw new Error("foreign test user missing");
			const foreignInstallation = foreignUser.installations[0];
			if (!foreignInstallation) throw new Error("foreign test installation missing");
			expect(foreignInstallation.reconciliationEvidence).toBeUndefined();
			const refresh = await reader.read();
			expect(new TextDecoder().decode(refresh.value)).toContain("event: refresh");
			await reader.cancel();
			fail = true;
			const failed = await request();
			expect(failed.status).toBe(502);
			const body = await failed.text();
			expect(JSON.parse(body)).toEqual({ status: "failed" });
			expect(body).not.toContain("fixture-token-value");
			const reconciliationLog = logs.find((log) => log[0] === "installation reconciliation failed");
			expect(reconciliationLog).toEqual([
				"installation reconciliation failed",
				"12",
				"openspec",
				"ReadResult",
				"GitHub OpenSpec artifact fetch failed",
			]);
			const failedUser = await db.users.findOne({ _id: "u" });
			if (!failedUser) throw new Error("test user missing");
			const failedInstallation = failedUser.installations[0];
			if (!failedInstallation) throw new Error("test installation missing");
			const failedEvidence = failedInstallation.reconciliationEvidence?.at(-1);
			expect(failedEvidence).toMatchObject({
				outcome: "failure",
				operation: "openspec",
				summary: "GitHub OpenSpec artifact fetch failed",
			});
			expect(JSON.stringify(failedEvidence)).not.toContain("fixture-token-value");
			expect(JSON.stringify(failedEvidence)).not.toContain("fixture-header-value");
			const failedForeignUser = await db.users.findOne({ _id: "foreign" });
			if (!failedForeignUser) throw new Error("foreign test user missing");
			const failedForeignInstallation = failedForeignUser.installations[0];
			if (!failedForeignInstallation) throw new Error("foreign test installation missing");
			expect(failedForeignInstallation.reconciliationEvidence).toBeUndefined();
			const logged = JSON.stringify(logs);
			expect(logged).not.toContain("fixture-token-value");
			expect(logged).not.toContain("fixture-raw-body-value");
			expect(logged).not.toContain("fixture-header-value");
			expect(logged).not.toContain("raw provider diagnostic");
		} finally {
			globalThis.fetch = original;
			console.error = originalError;
		}
	}));

test("a timed-out reconciliation releases its lock", () =>
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const app = createApp(db, {
			...testConfig,
			githubAppId: "1",
			githubAppPrivateKey: pem,
		});
		const original = globalThis.fetch;
		fetchTarget.fetch = async (url, init) => {
			init?.signal?.throwIfAborted();
			return String(url).includes("access_tokens")
				? Response.json({ token: "installation-token" })
				: String(url).includes("/app/installations/")
					? Response.json({ account: { login: "cubanx" } })
					: Response.json({ repositories: [] });
		};
		const timeout = vi
			.spyOn(AbortSignal, "timeout")
			.mockReturnValue(AbortSignal.abort(new DOMException("timed out", "TimeoutError")));
		try {
			expect(await app.reconcile()).toBe("failed");
			timeout.mockRestore();
			expect(await app.reconcile()).toBe("success");
		} finally {
			timeout.mockRestore();
			globalThis.fetch = original;
		}
	}));

test("merge start and confirmation bind the session, origin, exact node ID, and refresh failures", () =>
	withDatabase(async (db) => {
		await seedMergePullRequest(db);
		const session = await createSession(db, "u");
		const provider = {
			inspect: async () => ({
				pullRequestId: "PR_kwDOA",
				state: "open",
				draft: false,
				head_sha: "a".repeat(40),
				mergeable: "clean",
				workflow_state: "success",
				checks_state: "success",
				review_state: "approved",
				merge_method: "MERGE",
				protection: "clear",
			}),
			merge: async (_intent: unknown, variables: Record<string, string>) => {
				expect(variables).toEqual({
					pullRequestId: "PR_kwDOA",
					expectedHeadOid: "a".repeat(40),
					mergeMethod: "MERGE",
				});
				return { merged: true };
			},
		};
		const app = createApp(db, { ...testConfig, githubClientId: "client" }, provider);
		const post = (path: string, body = mergeTarget, headers: HeadersInit = {}) =>
			app.fetch(
				new Request(`http://local${path}`, {
					method: "POST",
					headers: {
						cookie: `dcc_session=${session.token}`,
						"content-type": "application/x-www-form-urlencoded",
						...headers,
					},
					body,
				}),
			);
		const start = await post("/api/merge/start");
		expect(start.status).toBe(302);
		const token = new URL(start.headers.get("location") ?? "").searchParams.get("state");
		expect(token).toBeTruthy();
		expect(await mergeIntentFor(db, token!)).toMatchObject({
			fullName: "Crisp-Inc/dev-command-center",
			pullRequestTitle: "Hold the line",
		});
		expect(JSON.stringify(await db.mergeIntents.findOne({}))).not.toContain(session.token);
		await advanceMergeIntent(db, token!, "started", "authorized", undefined, {
			pullRequestId: "PR_kwDOA",
		});
		const events = await app.fetch(
			new Request("http://local/events", {
				headers: { cookie: `dcc_session=${session.token}` },
			}),
		);
		const reader = events.body?.getReader();
		if (!reader) throw new Error("event stream body missing");
		await reader.read();
		expect(
			await (await post("/api/merge/confirm", new URLSearchParams({ confirmation: token! }).toString())).json(),
		).toEqual({ status: "success" });
		expect(new TextDecoder().decode((await reader.read()).value)).toContain("event: refresh");
		await reader.cancel();
		expect((await post("/api/merge/confirm", new URLSearchParams({ confirmation: token! }).toString())).status).toBe(
			409,
		);
		const production = createApp(
			db,
			{
				...testConfig,
				production: true,
				publicUrl: "https://command-center.example",
				githubClientId: "client",
			},
			provider,
		);
		expect(
			(
				await production.fetch(
					new Request("http://local/api/merge/start", {
						method: "POST",
						headers: {
							cookie: `dcc_session=${session.token}`,
							"content-type": "application/x-www-form-urlencoded",
						},
						body: mergeTarget,
					}),
				)
			).status,
		).toBe(400);
	}));

test("merge confirmation refuses removed bindings and incomplete OpenSpec without mutation", () =>
	withDatabase(async (db) => {
		await seedMergePullRequest(db);
		const session = await createSession(db, "u");
		let mutations = 0;
		const provider = {
			inspect: async () => ({
				pullRequestId: "PR_kwDOA",
				state: "open",
				draft: false,
				head_sha: "a".repeat(40),
				mergeable: "clean",
				workflow_state: "success",
				checks_state: "success",
				review_state: "approved",
				merge_method: "MERGE",
				protection: "clear",
			}),
			merge: async () => {
				mutations++;
				return { merged: true };
			},
		};
		const app = createApp(db, { ...testConfig, githubClientId: "client" }, provider);
		const post = (confirmation: string) =>
			app.fetch(
				new Request("http://local/api/merge/confirm", {
					method: "POST",
					headers: {
						cookie: `dcc_session=${session.token}`,
						"content-type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({ confirmation }).toString(),
				}),
			);
		const start = async () => {
			const response = await app.fetch(
				new Request("http://local/api/merge/start", {
					method: "POST",
					headers: {
						cookie: `dcc_session=${session.token}`,
						"content-type": "application/x-www-form-urlencoded",
					},
					body: mergeTarget,
				}),
			);
			const state = new URL(response.headers.get("location") ?? "").searchParams.get("state");
			if (!state) throw new Error("merge state missing");
			await advanceMergeIntent(db, state, "started", "authorized", undefined, {
				pullRequestId: "PR_kwDOA",
			});
			return state;
		};
		const removed = await start();
		await mutateUser(db, "u", (user) => {
			user.installations = [];
		});
		expect((await post(removed)).status).toBe(409);
		expect(mutations).toBe(0);
		await seedMergePullRequest(db);
		const incomplete = await start();
		await mutateUser(db, "u", (user) => {
			const repository = user.installations[0]?.repositories[0];
			if (!repository) throw new Error("merge repository missing");
			const pullRequest = repository.pullRequests[0];
			if (!pullRequest) throw new Error("merge pull request missing");
			pullRequest.labels = [];
			pullRequest.open_spec_declaration = "declared";
			const openSpecs = [
				{
					change_name: "ready-to-merge",
					completed: 2,
					total: 2,
					source_commit: "a".repeat(40),
				},
				{
					change_name: "hold-the-line",
					completed: 1,
					total: 2,
					source_commit: "a".repeat(40),
				},
			];
			pullRequest.open_specs = openSpecs;
			pullRequest.open_spec = openSpecs[0];
		});
		expect((await post(incomplete)).status).toBe(409);
		expect(mutations).toBe(0);
	}));

test("local demo serves snapshot and SSE without a session and exposes no Railway routes", () =>
	withDatabase(async (db) => {
		const app = createApp(db, {
			...testConfig,
			localDemo: true,
			hostname: "127.0.0.1",
		});
		const snapshot = await (await app.fetch(new Request("http://local/api/snapshot"))).json();
		expect(snapshot.pullRequests).toHaveLength(19);
		expect(snapshot.repositories[0]?.account_login).toBe("cubanx");
		expect(snapshot.notifications[0]?.body).toBe("Restore the Defiant launch checklist needs attention.");
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
			oauthCallbackUrl: "https://command-center.up.railway.app/auth/github/callback",
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
		fetchTarget.fetch = async (input) =>
			String(input).includes("access_token")
				? Response.json({ access_token: "token" })
				: Response.json({ id: 9, login: "kira" });
		try {
			expect(
				(
					await app.fetch(
						new Request(`http://local/auth/github/callback?code=code&state=${state}`, {
							headers: {
								"x-forwarded-proto": "https",
								"x-forwarded-host": "command-center.up.railway.app",
							},
						}),
					)
				).status,
			).toBe(302);
			expect((await db.users.findOne({ _id: "9" }))?.installations).toHaveLength(0);
		} finally {
			globalThis.fetch = original;
		}
		expect((await app.fetch(new Request("http://local/health"))).status).toBe(200);
		await db.client.close();
		expect((await app.fetch(new Request("http://local/ready"))).status).toBe(503);
	}));

test("local OAuth sends its loopback callback and permits its HTTP session cookie", () =>
	withDatabase(async (db) => {
		const app = createApp(
			db,
			loadConfig({
				PUBLIC_URL: "http://127.0.0.1:3000",
				GITHUB_CLIENT_ID: "client",
				GITHUB_CLIENT_SECRET: "secret",
			}),
		);
		const begin = await app.fetch(new Request("http://127.0.0.1:3000/auth/github"));
		expect(begin.headers.get("location")).toContain(
			"redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fauth%2Fgithub%2Fcallback",
		);
		const state = new URL(begin.headers.get("location") ?? "").searchParams.get("state");
		const original = globalThis.fetch;
		fetchTarget.fetch = async (input) =>
			String(input).includes("access_token")
				? Response.json({ access_token: "token" })
				: Response.json({ id: 9, login: "kira" });
		try {
			const callback = await app.fetch(
				new Request(`http://127.0.0.1:3000/auth/github/callback?code=code&state=${state}`),
			);
			expect(callback.headers.get("location")).toBe("http://127.0.0.1:3000");
			expect(callback.headers.get("set-cookie")).not.toContain(" Secure;");
		} finally {
			globalThis.fetch = original;
		}
	}));

test("public shell and health survive failed initialization while readiness reports 503", () =>
	withDatabase(async (db) => {
		await db.client.close();
		const app = createApp(db, testConfig);
		expect((await app.fetch(new Request("http://local/health"))).status).toBe(200);
		expect((await app.fetch(new Request("http://local/"))).status).toBe(200);
		expect((await app.fetch(new Request("http://local/ready"))).status).toBe(503);
	}));

test("failed initialization drain retains the full webhook diagnostic", () =>
	withDatabase(async (db) => {
		const original = console.error,
			originalCreateIndex = db.users.createIndex,
			diagnostic = `webhook diagnostic ${"qapla".repeat(50)}`,
			logs: unknown[][] = [];
		db.users.createIndex = async () => {
			throw new Error(diagnostic);
		};
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		try {
			await createApp(db, testConfig).drain();
			expect(logs).toEqual([["webhook drain failed", diagnostic]]);
		} finally {
			console.error = original;
			db.users.createIndex = originalCreateIndex;
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
		fetchTarget.fetch = async (input) =>
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
							new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`),
						)
					).status,
				).toBe(302);
			}
			const user = await db.users.findOne({ _id: "9" });
			expect(user?.installations).toMatchObject([{ installationId: "12", accountLogin: "cubanx" }]);
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
		fetchTarget.fetch = async (input) =>
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
				(await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`)))
					.status,
			).toBe(403);
			expect((await db.users.findOne({ _id: "9" }))?.installations).toHaveLength(0);
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
			fetchTarget.fetch = async (input) => {
				const url = String(input);
				calls.push(url);
				if (url.includes("access_token")) return Response.json({ access_token: "oauth-token" });
				if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
				if (url.includes("user/installations")) return Response.json({ installations: [] }, { headers: { link } });
				throw new Error(`unexpected ${url}`);
			};
			try {
				const state = await createOAuthState(db);
				expect(
					(await app.fetch(new Request(`http://local/auth/github/callback?code=x&state=${state}&installation_id=12`)))
						.status,
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

test("repair persists a sanitized stale failure when its installation token request throws", () =>
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		await upsertIdentity(db, "u", "kira");
		await bindInstallation(db, "u", "12", "cubanx");
		const session = await createSession(db, "u");
		const app = createApp(db, {
			...testConfig,
			githubAppId: "1",
			githubAppPrivateKey: pem,
		});
		const original = globalThis.fetch;
		fetchTarget.fetch = async () => {
			throw new Error("raw repair provider diagnostic");
		};
		try {
			const response = await app.fetch(
				new Request("http://local/api/installations/12/repair", {
					method: "POST",
					headers: { cookie: `dcc_session=${session.token}` },
				}),
			);
			expect(response.status).toBe(200);
			const body = await response.text();
			expect(body).not.toContain("raw repair provider diagnostic");
			const installation = (await db.users.findOne({ _id: "u" }))?.installations[0];
			expect(installation).toMatchObject({
				lastSyncError: "reconciliation failed",
			});
			expect(installation?.reconciliationEvidence?.at(-1)).toMatchObject({
				outcome: "failure",
				operation: "reconciliation",
			});
			expect(JSON.stringify(installation)).not.toContain("raw repair provider diagnostic");
		} finally {
			globalThis.fetch = original;
		}
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
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
		let identityRequested: ((release: () => void) => void) | undefined;
		const waitForIdentityRequest = new Promise<() => void>((resolve) => {
			identityRequested = resolve;
		});
		let done: (() => void) | undefined;
		const bootstrapped = new Promise<void>((resolve) => {
			done = resolve;
		});
		fetchTarget.fetch = async (input) => {
			const url = String(input);
			if (url.includes("access_token")) return Response.json({ access_token: "oauth-token" });
			if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
			if (url.includes("user/installations"))
				return Response.json({
					installations: [{ id: 12, account: { login: "Crisp-Inc" } }],
				});
			if (url.includes("access_tokens")) return Response.json({ token: "installation-token" });
			if (url.includes("/app/installations/"))
				return new Promise((resolve) => {
					identityRequested?.(() => resolve(Response.json({ account: { login: "Crisp-Inc" } })));
				});
			if (url.endsWith("/repos/Crisp-Inc/defiant")) return Response.json({ default_branch: "main" });
			if (url.includes("/rules/branches/main")) return Response.json([]);
			if (url.includes("/branches/main/protection")) return new Response(null, { status: 404 });
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
				(await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`)))
					.status,
			).toBe(302);
			expect((await db.users.findOne({ _id: "9" }))?.installations).toMatchObject([
				{ installationId: "12", accountLogin: "Crisp-Inc", repositories: [] },
			]);
			const releaseIdentity = await waitForIdentityRequest;
			releaseIdentity();
			await bootstrapped;
			let projected = false;
			const deadline = Date.now() + 2000;
			while (!projected && Date.now() < deadline) {
				const user = await db.users.findOne({ _id: "9" });
				projected = Boolean(user?.installations[0]?.repositories[0]?.pullRequests?.length);
				if (!projected) await new Promise((resolve) => setTimeout(resolve, 10));
			}
			expect(projected).toBe(true);
			expect((await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories[0]?.pullRequests).toMatchObject([
				{ number: 1, author_login: "kira" },
			]);
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
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
		await upsertIdentity(db, "9", "kira");
		const existingSession = await createSession(db, "9");
		const existingStream = await app.fetch(
			new Request("http://local/events", {
				headers: { cookie: `dcc_session=${existingSession.token}` },
			}),
		);
		const existingReader = existingStream.body?.getReader();
		if (!existingReader) throw new Error("event stream body missing");
		await existingReader.read();
		const original = globalThis.fetch,
			originalError = console.error,
			logs: unknown[][] = [];
		let fail = true;
		const originalReplace = db.users.replaceOne.bind(db.users) as (
			...args: Parameters<typeof db.users.replaceOne>
		) => ReturnType<typeof db.users.replaceOne>;
		const users = db.users as {
			replaceOne: (...args: Parameters<typeof db.users.replaceOne>) => ReturnType<typeof db.users.replaceOne>;
		};
		let rejectPersistence = false;
		const unhandled: unknown[] = [];
		const onUnhandledRejection = (reason: unknown) => unhandled.push(reason);
		users.replaceOne = async (...args: Parameters<typeof db.users.replaceOne>) => {
			if (rejectPersistence) throw new Error("persistence diagnostic");
			return originalReplace(...args);
		};
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		process.on("unhandledRejection", onUnhandledRejection);
		fetchTarget.fetch = async (input) => {
			const url = String(input);
			if (url.includes("access_token")) return Response.json({ access_token: "oauth-token" });
			if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
			if (url.includes("user/installations"))
				return Response.json({
					installations: [{ id: 12, account: { login: "Crisp-Inc" } }],
				});
			if (url.includes("access_tokens")) return Response.json({ token: "installation-token" });
			if (url.includes("/app/installations/")) {
				if (fail) {
					rejectPersistence = true;
					return new Response("github diagnostic", { status: 401 });
				}
				return Response.json({ account: { login: "Crisp-Inc" } });
			}
			if (url.endsWith("/repos/Crisp-Inc/defiant")) return Response.json({ default_branch: "main" });
			if (url.includes("/rules/branches/main")) return Response.json([]);
			if (url.includes("/branches/main/protection")) return new Response(null, { status: 404 });
			if (url.includes("installation/repositories"))
				return Response.json({
					repositories: [{ id: 2, full_name: "Crisp-Inc/defiant" }],
				});
			if (url.includes("/pulls") || url.includes("/deployments")) return Response.json([]);
			throw new Error(`unexpected GitHub request ${url}`);
		};
		try {
			const state = await createOAuthState(db);
			expect(
				(await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`)))
					.status,
			).toBe(302);
			expect(new TextDecoder().decode((await existingReader.read()).value)).toContain("event: refresh");
			for (let attempts = 0; !logs.length && attempts < 50; attempts++)
				await new Promise((resolve) => setTimeout(resolve));
			expect((await db.users.findOne({ _id: "9" }))?.installations[0]).toMatchObject({
				installationId: "12",
				accountLogin: "Crisp-Inc",
				repositories: [],
			});
			const failedInstallation = (await db.users.findOne({ _id: "9" }))?.installations[0];
			expect(failedInstallation).not.toHaveProperty("lastSyncError");
			expect(failedInstallation?.reconciliationEvidence).toBeUndefined();
			expect(JSON.stringify(failedInstallation)).not.toContain("github diagnostic");
			expect(logs).toMatchObject([
				[
					"installation bootstrap persistence failed",
					"12",
					"installation_identity",
					"Error",
					"GitHub request failed (401)",
				],
				["installation bootstrap failed", "12", "installation_identity", "ReadResult", "GitHub request failed (401)"],
			]);
			await new Promise((resolve) => setTimeout(resolve));
			expect(unhandled).toEqual([]);
			expect(JSON.stringify(logs)).not.toContain("persistence diagnostic");
			fail = false;
			users.replaceOne = originalReplace;
			await reconcileInstallations(
				db,
				async () => ({
					token: "installation-token",
					appJwt: "app-jwt",
				}),
				globalThis.fetch,
			);
			expect((await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories).toMatchObject([
				{ repositoryId: "2", full_name: "Crisp-Inc/defiant" },
			]);
		} finally {
			globalThis.fetch = original;
			console.error = originalError;
			process.off("unhandledRejection", onUnhandledRejection);
			users.replaceOne = originalReplace;
			await existingReader.cancel();
			app.stop();
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		const original = globalThis.fetch;
		fetchTarget.fetch = async (input) =>
			String(input).includes("access_tokens") ? Response.json({ token: "installation" }) : new Response("- [x] Launch");
		try {
			const app = createApp(db, {
				...testConfig,
				githubAppId: "1",
				githubAppPrivateKey: pem,
			});
			await app.drain();
			expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.openSpecs).toHaveLength(1);
			expect((await db.inboxDeliveries.findOne({ _id: "github:push" }))?.payload).toBeUndefined();
		} finally {
			globalThis.fetch = original;
		}
	}));

test("webhook task fetch logs safe GitHub diagnostics", () =>
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
			_id: "github:failed-push",
			provider: "github",
			deliveryId: "failed-push",
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
		const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey))
			.toString("base64")
			.match(/.{1,64}/g)
			?.join("\n")}\n-----END PRIVATE KEY-----`;
		const originalFetch = globalThis.fetch,
			originalError = console.error,
			logs: unknown[][] = [];
		fetchTarget.fetch = async (input) =>
			String(input).includes("access_tokens")
				? Response.json({ token: "installation" })
				: Response.json(
						{
							message: "Resource not accessible by integration",
							documentation_url: "https://docs.github.com/rest",
							errors: [
								{
									resource: "Repository",
									field: "contents",
									code: "forbidden",
									value: "must-not-log",
								},
							],
							secret: "must-not-log",
						},
						{ status: 403 },
					);
		console.error = (...args: unknown[]) => logs.push(args);
		try {
			const app = createApp(db, {
				...testConfig,
				githubAppId: "1",
				githubAppPrivateKey: pem,
			});
			await app.drain();
		} finally {
			globalThis.fetch = originalFetch;
			console.error = originalError;
		}
		expect(logs).toContainEqual([
			"GitHub request failed",
			JSON.stringify({
				operation: "webhook OpenSpec task fetch",
				status: 403,
				target:
					"https://api.github.com/repositories/2/contents/openspec/changes/defiant/tasks.md?ref=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				diagnostic: {
					message: "Resource not accessible by integration",
					documentationUrl: "https://docs.github.com/rest",
					errors: [{ resource: "Repository", field: "contents", code: "forbidden" }],
				},
			}),
		]);
		expect(JSON.stringify(logs)).not.toContain("must-not-log");
	}));
