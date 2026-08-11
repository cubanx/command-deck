import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { openDatabase } from "../src/db";
import { acceptGitHubDelivery, drainInbox, githubSignatureValid } from "../src/events";

const body = JSON.stringify({ installation: { id: 9 }, repository: { id: 2, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Keep station online", html_url: "x", user: { login: "sisko" }, state: "open", draft: true, head: { ref: "ops/keep-station-online", sha: "a".repeat(40) }, updated_at: "2026-01-01" } });
const sign = (value: string) => `sha256=${createHmac("sha256", "secret").update(value).digest("hex")}`;

test("GitHub verifies raw HMAC, dedupes, projects supported events, and clears processed payload", async () => {
  const db = openDatabase();
  expect(githubSignatureValid(body, sign(body), "secret")).toBeTrue();
  expect(githubSignatureValid(body, sign(body), "wrong")).toBeFalse();
  expect(acceptGitHubDelivery(db, "d1", "pull_request", body)).toBeTrue();
  expect(acceptGitHubDelivery(db, "d1", "pull_request", body)).toBeFalse();
  await drainInbox(db);
  expect(db.query("SELECT title,draft,head_ref,head_sha FROM pull_requests").get()).toMatchObject({ title: "Keep station online", draft: 1, head_ref: "ops/keep-station-online", head_sha: "a".repeat(40) });
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

test("configured bot comments project review progress without changing formal review state", async () => {
  const db = openDatabase();
  acceptGitHubDelivery(db, "pr", "pull_request", body);
  acceptGitHubDelivery(db, "formal", "pull_request_review", JSON.stringify({ installation: { id: 9 }, repository: { id: 2 }, pull_request: { number: 7 }, review: { state: "changes_requested" } }));
  await drainInbox(db);
  const comment = (login: string, text: string, action = "created") => JSON.stringify({ action, installation: { id: 9 }, repository: { id: 2 }, issue: { number: 7, pull_request: {} }, comment: { user: { login }, body: text } });
  const reviewBot = { login: "claude[bot]", startMarker: "started review", doneMarker: "review complete" };
  acceptGitHubDelivery(db, "other", "issue_comment", comment("quark", "started review"));
  acceptGitHubDelivery(db, "start", "issue_comment", comment("Claude[bot]", "Claude started review"));
  await drainInbox(db, undefined, reviewBot);
  expect(db.query("SELECT review_state,bot_review_actor,bot_review_state FROM pull_requests").get()).toMatchObject({ review_state: "changes_requested", bot_review_actor: "Claude[bot]", bot_review_state: "in_progress" });
  acceptGitHubDelivery(db, "done", "issue_comment", comment("claude[bot]", "Started review; review complete", "edited"));
  await drainInbox(db, undefined, reviewBot);
  expect(db.query("SELECT review_state,bot_review_state FROM pull_requests").get()).toMatchObject({ review_state: "changes_requested", bot_review_state: "complete" });
});
