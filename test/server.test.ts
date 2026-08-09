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
