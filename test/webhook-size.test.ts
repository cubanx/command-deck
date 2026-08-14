import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { bindInstallation, upsertIdentity } from "../src/access";
import { createApp } from "../src/server";
import { withDatabase, testConfig } from "./mongo-support";

test("webhooks reject oversized bodies before persistence", () => withDatabase(async (db) => {
  const app = createApp(db, { ...testConfig, githubWebhookSecret: "secret" });
  expect((await app.fetch(new Request("http://local/webhooks/github", { method: "POST", headers: { "content-length": "1000001" }, body: "x" }))).status).toBe(413);
  expect(await db.inboxDeliveries.countDocuments()).toBe(0);
}));

test("webhook HMAC uses exact UTF-8 bytes across stream chunks", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx");
  const payload = JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Café", user: { login: "sisko" }, state: "open" } });
  const bytes = Buffer.from(payload), split = bytes.indexOf(0xc3) + 1;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(bytes.subarray(0, split)); controller.enqueue(bytes.subarray(split)); controller.close(); } });
  const signature = `sha256=${createHmac("sha256", "secret").update(bytes).digest("hex")}`;
  const app = createApp(db, { ...testConfig, githubWebhookSecret: "secret" });
  expect((await app.fetch(new Request("http://local/webhooks/github", { method: "POST", headers: { "x-github-delivery": "utf8", "x-github-event": "pull_request", "x-hub-signature-256": signature }, body }))).status).toBe(202);
  expect((await db.inboxDeliveries.findOne({ _id: "github:utf8" }))?.payload).toBe(payload);
  await app.drain();
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.pullRequests[0]?.title).toBe("Café");
}));
