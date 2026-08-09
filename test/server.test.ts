import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { LOCAL_DEMO_USER } from "../src/access";
import { createApp } from "../src/server";

const config = { port: 0, hostname: undefined, databasePath: ":memory:", localDemo: false };
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
  expect(script).toContain("verification_state");
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

test("startup drain recovers pending OpenSpec push deliveries", async () => {
  const db = openDatabase();
  const { privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", privateKey)).toString("base64").match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  db.query("INSERT INTO installations (id) VALUES ('9')").run();
  db.query("INSERT INTO inbox_deliveries (provider,delivery_id,payload,event_name) VALUES ('github','push',?,'push')").run(JSON.stringify({ installation: { id: 9 }, repository: { id: 2 }, ref: "refs/heads/ops/defiant", after: "a".repeat(40), commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }] }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("access_tokens") ? Response.json({ token: "installation-token" }) : new Response("- [ ] Launch Defiant");
  try {
    const app = createApp(db, { ...config, githubAppId: "1", githubAppPrivateKey: pem });
    await app.drain();
    expect(db.query("SELECT change_name FROM openspec_progress").get()!.change_name).toBe("defiant");
    expect(db.query("SELECT status,payload FROM inbox_deliveries WHERE delivery_id='push'").get()).toMatchObject({ status: "done", payload: null });
  } finally { globalThis.fetch = originalFetch; }
});
