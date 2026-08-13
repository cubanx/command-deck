import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { openDatabase } from "../src/db";
import { acceptGitHubDelivery, drainInbox, githubSignatureValid } from "../src/events";
import { dashboardForUser } from "../src/access";

const body = JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Keep station online", html_url: "x", user: { login: "sisko" }, state: "open", draft: true, head: { ref: "ops/keep-station-online", sha: "a".repeat(40) }, updated_at: "2026-01-01" } });
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

test("allowed webhook projections retain the verified account for bound-user visibility", async () => {
  const db = openDatabase();
  const allowed = JSON.stringify({ installation: { id: 11, account: { login: "hudson-law" } }, repository: { id: 12, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Keep station online", html_url: "https://github.com/ds9/ops/pull/7", user: { login: "sisko" }, state: "open", draft: false, head: { ref: "ops/keep-station-online", sha: "a".repeat(40) }, updated_at: "2026-01-01" } });
  db.query("INSERT INTO users (id,github_id,login) VALUES ('user-1','github-1','sisko'),('user-2','github-2','sisko')").run();
  expect(acceptGitHubDelivery(db, "allowed", "pull_request", allowed)).toBeTrue();
  await drainInbox(db);
  db.query("INSERT INTO user_installations (user_id,installation_id) VALUES ('user-1','11')").run();
  expect(db.query("SELECT account_login FROM installations WHERE id='11'").get()).toEqual({ account_login: "hudson-law" });
  expect(dashboardForUser(db, "user-1").pullRequests).toHaveLength(1);
  expect(dashboardForUser(db, "user-2").pullRequests).toHaveLength(0);
});

test("unknown events are ignored and a restart drain processes retained pending rows", async () => {
  const db = openDatabase();
  acceptGitHubDelivery(db, "ignored", "fork", JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } } }));
  acceptGitHubDelivery(db, "recover", "pull_request", body);
  await drainInbox(db);
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='ignored'").get()!.status).toBe("ignored");
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='recover'").get()!.status).toBe("done");
});

test("failed webhook processing retries with bounded backoff", async () => {
  const db = openDatabase();
  const push = JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2 }, ref: "refs/heads/main", after: "a".repeat(40), commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }] });
  acceptGitHubDelivery(db, "retry", "push", push);
  let attempts = 0; const waits: number[] = [];
  await drainInbox(db, async () => ++attempts < 3 ? null : "## Tasks\n- [x] Restore communications", undefined, async (ms) => waits.push(ms));
  expect(attempts).toBe(3); expect(waits).toEqual([1000, 2000]);
  expect(db.query("SELECT status,error,payload FROM inbox_deliveries WHERE delivery_id='retry'").get()).toMatchObject({ status: "done", error: null, payload: null });
});

test("exhausted webhook retries remain pending for a later drain", async () => {
  const db = openDatabase();
  const push = JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2 }, after: "a".repeat(40), commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }] });
  acceptGitHubDelivery(db, "retry-later", "push", push);
  const waits: number[] = [];
  await drainInbox(db, async () => null, undefined, async (ms) => waits.push(ms));
  expect(waits).toEqual([1000, 2000]);
  expect(db.query("SELECT status,error,payload FROM inbox_deliveries WHERE delivery_id='retry-later'").get()).toMatchObject({ status: "pending", error: "OpenSpec artifact fetch failed", payload: push });
});

test("configured bot comments project review progress without changing formal review state", async () => {
  const db = openDatabase();
  acceptGitHubDelivery(db, "pr", "pull_request", body);
  acceptGitHubDelivery(db, "formal", "pull_request_review", JSON.stringify({ installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2 }, pull_request: { number: 7 }, review: { state: "changes_requested" } }));
  await drainInbox(db);
  const comment = (login: string, text: string, action = "created") => JSON.stringify({ action, installation: { id: 9, account: { login: "cubanx" } }, repository: { id: 2 }, issue: { number: 7, pull_request: {} }, comment: { user: { login }, body: text } });
  const reviewBot = { login: "claude[bot]", startMarker: "started review", doneMarker: "review complete" };
  acceptGitHubDelivery(db, "other", "issue_comment", comment("quark", "started review"));
  acceptGitHubDelivery(db, "start", "issue_comment", comment("Claude[bot]", "Claude started review"));
  await drainInbox(db, undefined, reviewBot);
  expect(db.query("SELECT review_state,bot_review_actor,bot_review_state FROM pull_requests").get()).toMatchObject({ review_state: "changes_requested", bot_review_actor: "Claude[bot]", bot_review_state: "in_progress" });
  acceptGitHubDelivery(db, "done", "issue_comment", comment("claude[bot]", "Started review; review complete", "edited"));
  await drainInbox(db, undefined, reviewBot);
  expect(db.query("SELECT review_state,bot_review_state FROM pull_requests").get()).toMatchObject({ review_state: "changes_requested", bot_review_state: "complete" });
});

test("missing or unapproved installation accounts stay outside intake and projection", async () => {
  const db = openDatabase(), unapproved = JSON.stringify({ installation: { id: 9, account: { login: "ferengi" } }, repository: { id: 2 }, pull_request: { number: 7, state: "open" } });
  expect(acceptGitHubDelivery(db, "bad", "pull_request", unapproved)).toBeFalse();
  db.query("INSERT INTO inbox_deliveries (provider,delivery_id,payload,event_name) VALUES ('github','legacy',?,'push')").run(unapproved);
  let fetched = false; await drainInbox(db, async () => { fetched = true; return "- [ ] Never"; });
  expect(fetched).toBeFalse(); expect(db.query("SELECT count(*) AS count FROM installations").get()!.count).toBe(0);
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='legacy'").get()).toEqual({ status: "ignored" });
});
