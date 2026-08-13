import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { openDatabase } from "../src/db";
import { LOCAL_DEMO_USER, createOAuthState } from "../src/access";
import { reconcileInstallations } from "../src/github";
import { createApp } from "../src/server";

const config = { port: 0, hostname: undefined, databasePath: ":memory:", localDemo: false };
const privateKey = async () => {
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
};
test("public PWA assets are available but authenticated snapshot and stream are isolated", async () => {
  const db = openDatabase(); const app = createApp(db, config);
  expect((await app.fetch(new Request("http://local/manifest.webmanifest"))).headers.get("content-type")).toContain("application/manifest");
  expect((await app.fetch(new Request("http://local/sw.js"))).headers.get("cache-control")).toContain("no-cache");
  expect(await (await app.fetch(new Request("http://local/sw.js"))).text()).toContain("skipWaiting");
  expect((await app.fetch(new Request("http://local/api/snapshot"))).status).toBe(401);
  expect((await app.fetch(new Request("http://local/events"))).status).toBe(401);
  const page = await (await app.fetch(new Request("http://local/"))).text();
  expect(page).toContain("Command center");
  expect(page).toContain("/app.js?v=4");
  const script = await (await app.fetch(new Request("http://local/app.js"))).text();
  expect(script).toContain("showDirectoryPicker");
  expect(script).toContain("getDirectoryHandle('openspec')");
  expect(script).toContain("getDirectoryHandle('.git')");
  expect(script).toContain("source_ref");
  expect(script).toContain("workflow_state");
  expect(script).toContain("bot_review_state");
  expect(script).toContain("deployment.state");
  expect(script).toContain("deployment.target_url");
  expect(script).toContain(">Logs<");
  expect(script).toContain("type=\"checkbox\"");
  expect(script).toContain("draft");
  expect(script).not.toContain("<h2>OpenSpec</h2>");
});

test("local demo serves the seeded snapshot and stream without a session", async () => {
  const db = openDatabase();
  const app = createApp(db, { ...config, localDemo: true, hostname: "127.0.0.1" });
  const snapshot = await app.fetch(new Request("http://local/api/snapshot"));
  expect(snapshot.status).toBe(200);
  const data = await snapshot.json();
  expect(data.pullRequests[0].author_login).toBe(LOCAL_DEMO_USER.login);
  expect(data.pullRequests[0].url).toBe("https://github.com/cubanx/dev-command-center/pull/1");
  expect(data.pullRequests[0].bot_review_state).toBe("in_progress");
  expect(JSON.parse(data.pullRequests[0].open_spec.active_group).tasks.length).toBeGreaterThan(1);
  const events = await app.fetch(new Request("http://local/events"));
  expect(events.status).toBe(200);
  await events.body?.cancel();
});

test("runtime exposes no Railway webhook or mapping routes", async () => {
  const db = openDatabase();
  const app = createApp(db, { ...config, localDemo: true, hostname: "127.0.0.1" });
  const response = await app.fetch(new Request("http://local/webhooks/railway/example", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "deep-space-nine", serviceId: "defiant", environmentId: "bajoran-sector" })
  }));
  expect(response.status).toBe(404);
  expect((await app.fetch(new Request("http://local/api/railway/connections"))).status).toBe(404);
});

test("GitHub callback binds only a verified installation", async () => {
  const db = openDatabase();
  const app = createApp(db, { ...config, githubClientId: "client", githubClientSecret: "secret" });
  const state = createOAuthState(db);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input) === "https://github.com/login/oauth/access_token" ? Response.json({ access_token: "token" }) : Response.json({ id: 1702, login: "kira" });
  try {
    expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}`))).status).toBe(302);
    expect(db.query("SELECT installation_id FROM user_installations").all()).toEqual([]);
  } finally { globalThis.fetch = originalFetch; }
});

test("GitHub callback verifies the requested installation on a later page", async () => {
  const db = openDatabase(), app = createApp(db, { ...config, githubClientId: "client", githubClientSecret: "secret", githubAppId: "1", githubAppPrivateKey: await privateKey() }), state = createOAuthState(db), originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => { const url = String(input); if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "token" }); if (url.endsWith("/user")) return Response.json({ id: 1703, login: "garak" }); if (url.includes("page=2")) { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token"); return Response.json({ installations: [{ id: 99, account: { login: "Crisp-Inc" } }] }); } if (url.includes("access_tokens")) return Response.json({ token: "installation-token" }); if (url.endsWith("/installation")) { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer installation-token"); return Response.json({ account: { login: "Crisp-Inc" } }); } if (url.includes("installation/repositories")) { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer installation-token"); return Response.json({ repositories: [] }); } return Response.json({ installations: [{ id: 1, account: { login: "cubanx" } }] }, { headers: { link: '<https://api.github.com/user/installations?per_page=100&page=2>; rel="next"' } }); };
  try { expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=99`))).status).toBe(302); expect(db.query("SELECT installation_id FROM user_installations").all()).toEqual([{ installation_id: "99" }]); await app.bootstrap; } finally { globalThis.fetch = originalFetch; }
});

test("GitHub callback redirects before its durable binding bootstrap finishes", async () => {
  const db = openDatabase(), app = createApp(db, { ...config, githubClientId: "client", githubClientSecret: "secret", githubAppId: "1", githubAppPrivateKey: await privateKey() }), state = createOAuthState(db), originalFetch = globalThis.fetch;
  let releaseRepositories!: () => void, repositoriesStarted!: () => void;
  const repositoriesPending = new Promise<void>((resolve) => { repositoriesStarted = resolve; });
  globalThis.fetch = async (input, init) => { const url = String(input); if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "oauth-token" }); if (url.endsWith("/user")) return Response.json({ id: 1704, login: "kira" }); if (url.includes("user/installations")) return Response.json({ installations: [{ id: 100, account: { login: "Crisp-Inc" } }] }); if (url.includes("access_tokens")) return Response.json({ token: "installation-token" }); if (url.endsWith("/installation")) { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer installation-token"); return Response.json({ account: { login: "Crisp-Inc" } }); } if (url.includes("installation/repositories")) { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer installation-token"); repositoriesStarted(); return new Promise<Response>((resolve) => { releaseRepositories = () => resolve(Response.json({ repositories: [{ id: 7, full_name: "Crisp-Inc/defiant" }] })); }); } if (url.includes("/pulls")) { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer installation-token"); return Response.json([{ number: 3, title: "Hold the line", html_url: "https://github.com/Crisp-Inc/defiant/pull/3", user: { login: "kira" }, state: "open", updated_at: "2026-08-13T00:00:00.000Z" }]); } return Response.json([]); };
  try {
    const response = await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=100`));
    expect(response.status).toBe(302);
    expect(db.query("SELECT installation_id FROM user_installations").all()).toEqual([{ installation_id: "100" }]);
    await repositoriesPending;
    expect(db.query("SELECT count(*) AS count FROM repositories").get()).toEqual({ count: 0 });
    releaseRepositories();
    await app.bootstrap;
    expect(db.query("SELECT full_name FROM repositories").all()).toEqual([{ full_name: "Crisp-Inc/defiant" }]);
    expect(db.query("SELECT title FROM pull_requests").all()).toEqual([{ title: "Hold the line" }]);
  } finally { globalThis.fetch = originalFetch; }
});

test("GitHub callback retains a binding when background bootstrap is unavailable", async () => {
  const db = openDatabase(), app = createApp(db, { ...config, githubClientId: "client", githubClientSecret: "secret", githubAppId: "1", githubAppPrivateKey: await privateKey() }), state = createOAuthState(db), originalFetch = globalThis.fetch, originalError = console.error, errors: string[] = [];
  let bootstrapAvailable = false;
  console.error = (...values: unknown[]) => { errors.push(values.join(" ")); };
  globalThis.fetch = async (input) => { const url = String(input); if (url === "https://github.com/login/oauth/access_token") return Response.json({ access_token: "oauth-token" }); if (url.endsWith("/user")) return Response.json({ id: 1705, login: "odo" }); if (url.includes("user/installations")) return Response.json({ installations: [{ id: 101, account: { login: "cubanx" } }] }); if (url.includes("access_tokens")) return Response.json({ token: "installation-token" }); if (url.endsWith("/installation")) return bootstrapAvailable ? Response.json({ account: { login: "cubanx" } }) : new Response("unavailable", { status: 503 }); if (url.includes("installation/repositories")) return Response.json({ repositories: [{ id: 8, full_name: "cubanx/terok-nor" }] }); if (url.includes("/pulls")) return Response.json([{ number: 9, title: "Constable's report", html_url: "https://github.com/cubanx/terok-nor/pull/9", user: { login: "odo" }, state: "open", updated_at: "2026-08-13T00:00:00.000Z" }]); return Response.json([]); };
  try {
    expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=101`))).status).toBe(302);
    await app.bootstrap;
    expect(db.query("SELECT installation_id FROM user_installations").all()).toEqual([{ installation_id: "101" }]);
    expect(db.query("SELECT count(*) AS count FROM repositories").get()).toEqual({ count: 0 });
    expect(db.query("SELECT count(*) AS count FROM pull_requests").get()).toEqual({ count: 0 });
    expect(db.query("SELECT count(*) AS count FROM github_deployments").get()).toEqual({ count: 0 });
    expect(errors).toEqual(["GitHub callback bootstrap failed: GitHub installation verification failed"]);
    bootstrapAvailable = true;
    await reconcileInstallations(db, async () => "recovered-token");
    expect(db.query("SELECT full_name FROM repositories").all()).toEqual([{ full_name: "cubanx/terok-nor" }]);
    expect(db.query("SELECT title FROM pull_requests").all()).toEqual([{ title: "Constable's report" }]);
  } finally { console.error = originalError; globalThis.fetch = originalFetch; }
});

test("signed webhooks ignore missing or unapproved installation accounts before persistence", async () => {
  const db = openDatabase(), app = createApp(db, { ...config, githubWebhookSecret: "secret" });
  for (const [delivery, login] of [["missing", undefined], ["bad", "ferengi"]] as const) { const body = JSON.stringify({ installation: { id: 9, ...(login ? { account: { login } } : {}) } }), signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`; expect((await app.fetch(new Request("http://local/webhooks/github", { method: "POST", headers: { "x-github-delivery": delivery, "x-github-event": "push", "x-hub-signature-256": signature }, body }))).status).toBe(202); }
  expect(db.query("SELECT count(*) AS count FROM inbox_deliveries").get()).toEqual({ count: 0 });
});

test("startup drain recovers pending OpenSpec push deliveries", async () => {
  const db = openDatabase();
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  db.query("INSERT INTO installations (id) VALUES ('9')").run();
  db.query("INSERT INTO inbox_deliveries (provider,delivery_id,payload,event_name) VALUES ('github','push',?,'push')").run(JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2 }, ref: "refs/heads/ops/defiant", after: "a".repeat(40), commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }] }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("access_tokens") ? Response.json({ token: "installation-token" }) : new Response("- [ ] Launch Defiant");
  try {
    const app = createApp(db, { ...config, githubAppId: "1", githubAppPrivateKey: pem });
    await app.drain();
    expect(db.query("SELECT change_name FROM openspec_progress").get()!.change_name).toBe("defiant");
    expect(db.query("SELECT status,payload FROM inbox_deliveries WHERE delivery_id='push'").get()).toMatchObject({ status: "done", payload: null });
  } finally { globalThis.fetch = originalFetch; }
});

test("production trusts only the matching Railway forwarded origin and keeps liveness separate from readiness", async () => {
  const db = openDatabase();
  const app = createApp(db, { ...config, production: true, publicUrl: "https://command-center.up.railway.app", oauthCallbackUrl: "https://command-center.up.railway.app/auth/github/callback", secureCookies: true, githubClientId: "client" });
  expect((await app.fetch(new Request("http://local/auth/github", { headers: { "x-forwarded-proto": "http", "x-forwarded-host": "command-center.up.railway.app" } }))).status).toBe(400);
  const response = await app.fetch(new Request("http://local/auth/github", { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "command-center.up.railway.app" } }));
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toContain("redirect_uri=https%3A%2F%2Fcommand-center.up.railway.app%2Fauth%2Fgithub%2Fcallback");
  expect((await app.fetch(new Request("http://local/health"))).status).toBe(200);
  db.close();
  expect((await app.fetch(new Request("http://local/ready"))).status).toBe(503);
});
