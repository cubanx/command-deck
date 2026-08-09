import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { openDatabase } from "../src/db";
import { acceptGitHubDelivery, drainInbox, githubSignatureValid } from "../src/events";

const body = JSON.stringify({ installation: { id: 9 }, repository: { id: 2, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Keep station online", html_url: "x", user: { login: "sisko" }, state: "open", updated_at: "2026-01-01" } });
const sign = (value: string) => `sha256=${createHmac("sha256", "secret").update(value).digest("hex")}`;

test("GitHub verifies raw HMAC, dedupes, projects supported events, and clears processed payload", async () => {
  const db = openDatabase();
  expect(githubSignatureValid(body, sign(body), "secret")).toBeTrue();
  expect(githubSignatureValid(body, sign(body), "wrong")).toBeFalse();
  expect(acceptGitHubDelivery(db, "d1", "pull_request", body)).toBeTrue();
  expect(acceptGitHubDelivery(db, "d1", "pull_request", body)).toBeFalse();
  await drainInbox(db);
  expect(db.query("SELECT title FROM pull_requests").get()!.title).toBe("Keep station online");
  expect(db.query("SELECT payload FROM inbox_deliveries").get()!.payload).toBeNull();
});

test("unknown events are ignored and a restart drain processes retained pending rows", async () => {
  const db = openDatabase();
  acceptGitHubDelivery(db, "ignored", "fork", "{}");
  acceptGitHubDelivery(db, "recover", "pull_request", body);
  await drainInbox(db);
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='ignored'").get()!.status).toBe("ignored");
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='recover'").get()!.status).toBe("done");
});
