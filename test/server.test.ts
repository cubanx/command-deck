import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { createApp } from "../src/server";

const config = { port: 0, databasePath: ":memory:" };
test("public PWA assets are available but authenticated snapshot and stream are isolated", async () => {
  const db = openDatabase(); const app = createApp(db, config);
  expect((await app.fetch(new Request("http://local/manifest.webmanifest"))).headers.get("content-type")).toContain("application/manifest");
  expect((await app.fetch(new Request("http://local/sw.js"))).headers.get("cache-control")).toContain("no-cache");
  expect((await app.fetch(new Request("http://local/api/snapshot"))).status).toBe(401);
  expect((await app.fetch(new Request("http://local/events"))).status).toBe(401);
  expect(await (await app.fetch(new Request("http://local/"))).text()).toContain("Command center");
});
