import { expect, test } from "bun:test";
import { createOAuthState } from "../src/access";
import { bindInstallation, upsertIdentity } from "../src/access";
import { createApp } from "../src/server";
import { reconcileInstallations } from "../src/github";
import { withDatabase, testConfig } from "./mongo-support";

test("public PWA assets and streams are isolated", () => withDatabase(async (db) => {
  const app = createApp(db, testConfig);
  expect((await app.fetch(new Request("http://local/manifest.webmanifest"))).status).toBe(200); expect((await app.fetch(new Request("http://local/sw.js"))).headers.get("cache-control")).toContain("no-cache"); expect(await (await app.fetch(new Request("http://local/"))).text()).toContain("/app.js?v=4"); const javascript = await (await app.fetch(new Request("http://local/app.js"))).text(); expect(javascript).toContain("showDirectoryPicker"); expect(javascript).toContain("Provider reconciliation is stale.");
  expect((await app.fetch(new Request("http://local/api/snapshot"))).status).toBe(401); expect((await app.fetch(new Request("http://local/events"))).status).toBe(401);
}));

test("local demo serves snapshot and SSE without a session and exposes no Railway routes", () => withDatabase(async (db) => {
  const app = createApp(db, { ...testConfig, localDemo: true, hostname: "127.0.0.1" });
  expect((await (await app.fetch(new Request("http://local/api/snapshot"))).json()).pullRequests).toHaveLength(1); const stream = await app.fetch(new Request("http://local/events")); expect(stream.status).toBe(200); await stream.body?.cancel();
  expect((await app.fetch(new Request("http://local/webhooks/railway/example", { method: "POST" }))).status).toBe(404);
}));

test("OAuth callback preserves zero bindings and production origin/readiness gates", () => withDatabase(async (db) => {
  const app = createApp(db, { ...testConfig, production: true, publicUrl: "https://command-center.up.railway.app", oauthCallbackUrl: "https://command-center.up.railway.app/auth/github/callback", githubClientId: "client", githubClientSecret: "secret" });
  expect((await app.fetch(new Request("http://local/auth/github", { headers: { "x-forwarded-proto": "http", "x-forwarded-host": "command-center.up.railway.app" } }))).status).toBe(400);
  const state = await createOAuthState(db); const original = globalThis.fetch; globalThis.fetch = async (input) => String(input).includes("access_token") ? Response.json({ access_token: "token" }) : Response.json({ id: 9, login: "kira" });
  try { expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}`, { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "command-center.up.railway.app" } }))).status).toBe(302); expect((await db.users.findOne({ _id: "9" }))?.installations).toHaveLength(0); } finally { globalThis.fetch = original; }
  expect((await app.fetch(new Request("http://local/health"))).status).toBe(200); await db.client.close(); expect((await app.fetch(new Request("http://local/ready"))).status).toBe(503);
}));

test("public shell and health survive failed initialization while readiness reports 503", () => withDatabase(async (db) => {
  await db.client.close(); const app = createApp(db, testConfig);
  expect((await app.fetch(new Request("http://local/health"))).status).toBe(200);
  expect((await app.fetch(new Request("http://local/"))).status).toBe(200);
  expect((await app.fetch(new Request("http://local/ready"))).status).toBe(503);
}));

test("failed initialization drain resolves with one sanitized diagnostic", () => withDatabase(async (db) => {
  await db.client.close(); const original = console.error, logs: unknown[][] = []; console.error = (...args: unknown[]) => { logs.push(args); };
  try { await createApp(db, testConfig).drain(); expect(logs).toEqual([["webhook drain failed", "Client must be connected before running operations"]]); } finally { console.error = original; }
}));

test("OAuth binds only the verified installation account and never persists its access token", () => withDatabase(async (db) => {
  const app = createApp(db, { ...testConfig, githubClientId: "client", githubClientSecret: "secret" }), original = globalThis.fetch; let account = "Crisp-Inc";
  globalThis.fetch = async (input) => String(input).includes("access_token") ? Response.json({ access_token: "oauth-token" }) : String(input).includes("user/installations") ? Response.json({ installations: [{ id: 12, account: { login: account } }] }) : Response.json({ id: 9, login: "kira" });
  try { for (const next of ["Crisp-Inc", "cubanx"]) { account = next; const state = await createOAuthState(db); expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`))).status).toBe(302); } const user = await db.users.findOne({ _id: "9" }); expect(user?.installations).toMatchObject([{ installationId: "12", accountLogin: "cubanx" }]); expect(JSON.stringify(user)).not.toContain("oauth-token"); } finally { globalThis.fetch = original; }
}));

test("OAuth rejects an unverified installation without binding it", () => withDatabase(async (db) => {
  const app = createApp(db, { ...testConfig, githubClientId: "client", githubClientSecret: "secret" }), original = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("access_token") ? Response.json({ access_token: "oauth-token" }) : String(input).includes("user/installations") ? Response.json({ installations: [{ id: 99, account: { login: "Crisp-Inc" } }] }) : Response.json({ id: 9, login: "kira" });
  try { const state = await createOAuthState(db); expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`))).status).toBe(403); expect((await db.users.findOne({ _id: "9" }))?.installations).toHaveLength(0); } finally { globalThis.fetch = original; }
}));

test("OAuth binding redirects before its background bootstrap projects the allowed installation", () => withDatabase(async (db) => {
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  const app = createApp(db, { ...testConfig, githubClientId: "client", githubClientSecret: "secret", githubAppId: "1", githubAppPrivateKey: pem });
  const original = globalThis.fetch; let releaseIdentity: (() => void) | undefined; let done: (() => void) | undefined;
  const bootstrapped = new Promise<void>((resolve) => { done = resolve; });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("access_token")) return Response.json({ access_token: "oauth-token" });
    if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
    if (url.includes("user/installations")) return Response.json({ installations: [{ id: 12, account: { login: "Crisp-Inc" } }] });
    if (url.includes("access_tokens")) return Response.json({ token: "installation-token" });
    if (url.endsWith("/installation")) return new Promise((resolve) => { releaseIdentity = () => resolve(Response.json({ account: { login: "Crisp-Inc" } })); });
    if (url.includes("installation/repositories")) return Response.json({ repositories: [{ id: 2, full_name: "Crisp-Inc/defiant" }] });
    if (url.includes("/pulls")) return Response.json([{ number: 1, title: "Repair the defiant", user: { login: "kira" }, state: "open", updated_at: "2030-01-01T00:00:00Z" }]);
    if (url.includes("/deployments")) { done!(); return Response.json([]); }
    throw new Error(`unexpected GitHub request ${url}`);
  };
  try {
    const state = await createOAuthState(db);
    expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`))).status).toBe(302);
    expect((await db.users.findOne({ _id: "9" }))?.installations).toMatchObject([{ installationId: "12", accountLogin: "Crisp-Inc", repositories: [] }]);
    await new Promise((resolve) => setTimeout(resolve)); releaseIdentity!(); await bootstrapped;
    let projected = false; const deadline = Date.now() + 2000;
    while (!projected && Date.now() < deadline) { const user = await db.users.findOne({ _id: "9" }); projected = Boolean(user?.installations[0]?.repositories[0]?.pullRequests?.length); if (!projected) await new Promise((resolve) => setTimeout(resolve, 10)); }
    expect(projected).toBe(true);
    expect((await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories[0]?.pullRequests).toMatchObject([{ number: 1, author_login: "kira" }]);
  } finally { globalThis.fetch = original; }
}));

test("failed OAuth bootstrap keeps the binding durable for scheduled reconciliation", () => withDatabase(async (db) => {
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  const app = createApp(db, { ...testConfig, githubClientId: "client", githubClientSecret: "secret", githubAppId: "1", githubAppPrivateKey: pem });
  const original = globalThis.fetch, originalError = console.error, logs: unknown[][] = []; let fail = true;
  console.error = (...args: unknown[]) => { logs.push(args); };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("access_token")) return Response.json({ access_token: "oauth-token" });
    if (url.endsWith("/user")) return Response.json({ id: 9, login: "kira" });
    if (url.includes("user/installations")) return Response.json({ installations: [{ id: 12, account: { login: "Crisp-Inc" } }] });
    if (url.includes("access_tokens")) return Response.json({ token: "installation-token" });
    if (url.endsWith("/installation")) return fail ? new Response("github diagnostic", { status: 401 }) : Response.json({ account: { login: "Crisp-Inc" } });
    if (url.includes("installation/repositories")) return Response.json({ repositories: [{ id: 2, full_name: "Crisp-Inc/defiant" }] });
    if (url.includes("/pulls") || url.includes("/deployments")) return Response.json([]);
    throw new Error(`unexpected GitHub request ${url}`);
  };
  try {
    const state = await createOAuthState(db);
    expect((await app.fetch(new Request(`http://local/auth/github/callback?code=code&state=${state}&installation_id=12`))).status).toBe(302);
    await new Promise((resolve) => setTimeout(resolve));
    expect((await db.users.findOne({ _id: "9" }))?.installations[0]).toMatchObject({ installationId: "12", accountLogin: "Crisp-Inc", repositories: [] });
    expect(logs).toEqual([["installation bootstrap failed", "GitHub request failed (401)"]]);
    fail = false;
    await reconcileInstallations(db, async () => "installation-token", globalThis.fetch);
    expect((await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories).toMatchObject([{ repositoryId: "2", full_name: "Crisp-Inc/defiant" }]);
  } finally { globalThis.fetch = original; console.error = originalError; }
}));

test("startup drain projects a pending OpenSpec push and clears the inbox payload", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx"); const user = await db.users.findOne({ _id: "u" }); user!.installations[0]!.repositories.push({ repositoryId: "2", full_name: "ds9/ops", pullRequests: [], openSpecs: [], deployments: [] }); await db.users.replaceOne({ _id: "u" }, user!);
  await db.inboxDeliveries.insertOne({ _id: "github:push", provider: "github", deliveryId: "push", eventName: "push", payload: JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2 }, ref: "refs/heads/main", after: "a".repeat(40), commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }] }), status: "pending", attempts: 0, receivedAt: new Date() });
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]); const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  const original = globalThis.fetch; globalThis.fetch = async (input) => String(input).includes("access_tokens") ? Response.json({ token: "installation" }) : new Response("- [x] Launch");
  try { const app = createApp(db, { ...testConfig, githubAppId: "1", githubAppPrivateKey: pem }); await app.drain(); expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.openSpecs).toHaveLength(1); expect((await db.inboxDeliveries.findOne({ _id: "github:push" }))?.payload).toBeUndefined(); } finally { globalThis.fetch = original; }
}));
