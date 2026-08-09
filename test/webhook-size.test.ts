import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp } from "../src/server";
import { openDatabase } from "../src/db";

test("webhooks reject oversized bodies before inbox persistence", async () => {
  const db = openDatabase(); const app = createApp(db, { port: 0, databasePath: ":memory:", githubWebhookSecret: "secret" });
  const response = await app.fetch(new Request("http://local/webhooks/github", { method: "POST", headers: { "content-length": "1000001" }, body: "x" }));
  expect(response.status).toBe(413);
  expect(db.query("SELECT count(*) AS count FROM inbox_deliveries").get()!.count).toBe(0);
});

test("GitHub signatures use the exact UTF-8 bytes across stream chunks", async () => {
  const db = openDatabase(); const app = createApp(db, { port: 0, databasePath: ":memory:", githubWebhookSecret: "secret" });
  const body = JSON.stringify({ installation: { id: 9 }, repository: { id: 2, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Café on the Promenade", user: { login: "sisko" }, state: "open" } });
  const bytes = new TextEncoder().encode(body), marker = new TextEncoder().encode("é"), split = bytes.findIndex((_, index) => bytes[index] === marker[0] && bytes[index + 1] === marker[1]) + 1;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close(); } });
  const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  const response = await app.fetch(new Request("http://local/webhooks/github", { method: "POST", headers: { "x-github-delivery": "utf8", "x-github-event": "pull_request", "x-hub-signature-256": signature }, body: stream, duplex: "half" } as RequestInit));
  expect(response.status).toBe(202);
  await app.drain();
  expect(db.query("SELECT title FROM pull_requests").get()!.title).toBe("Café on the Promenade");
});
