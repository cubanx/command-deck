import { expect, test } from "bun:test";
import { createApp } from "../src/server";
import { openDatabase } from "../src/db";

test("webhooks reject oversized bodies before inbox persistence", async () => {
  const db = openDatabase(); const app = createApp(db, { port: 0, databasePath: ":memory:", githubWebhookSecret: "secret" });
  const response = await app.fetch(new Request("http://local/webhooks/github", { method: "POST", headers: { "content-length": "1000001" }, body: "x" }));
  expect(response.status).toBe(413);
  expect(db.query("SELECT count(*) AS count FROM inbox_deliveries").get()!.count).toBe(0);
});
