import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { bindInstallation } from "../src/access";
import { acceptGitHubDelivery, drainInbox } from "../src/events";

const base = { installation: { id: 1, account: { login: "cubanx" } }, repository: { id: 2, full_name: "ds9/ops" } };
test("GitHub projections close PRs and dedupe review, check, and mergeability transitions", async () => {
  const db = openDatabase(); db.query("INSERT INTO users (id,github_id,login) VALUES ('u','42','kira')").run(); bindInstallation(db, "u", "1", "cubanx");
  const pr = (action: string, mergeable: boolean) => JSON.stringify({ ...base, action, requested_reviewer: { id: 42 }, pull_request: { number: 7, title: "<unsafe>", state: "open", mergeable, user: { login: "sisko" } } });
  acceptGitHubDelivery(db, "pr1", "pull_request", pr("opened", false)); await drainInbox(db);
  acceptGitHubDelivery(db, "review", "pull_request", pr("review_requested", true)); acceptGitHubDelivery(db, "check", "check_run", JSON.stringify({ ...base, check_run: { id: 8, conclusion: "failure", pull_requests: [{ number: 7 }] } })); await drainInbox(db);
  expect(db.query("SELECT review_state,checks_state,mergeable FROM pull_requests").get()!.mergeable).toBe("true");
  expect(db.query("SELECT count(*) AS count FROM notifications").get()!.count).toBe(1);
  acceptGitHubDelivery(db, "closed", "pull_request", pr("closed", true)); await drainInbox(db);
  expect(db.query("SELECT count(*) AS count FROM pull_requests").get()!.count).toBe(0);
});

test("push projects only changed committed task artifacts and completion once", async () => {
  const db = openDatabase(); db.query("INSERT INTO users (id,github_id,login) VALUES ('u','1','odo')").run(); bindInstallation(db, "u", "1", "cubanx");
  const push = (sha: string, content: string) => JSON.stringify({ ...base, ref: "refs/heads/ops/defiant", after: sha, commits: [{ modified: ["openspec/changes/defiant/tasks.md", "README.md"] }] });
  acceptGitHubDelivery(db, "push1", "push", push("a", "")); await drainInbox(db, async () => "- [ ] Fly");
  acceptGitHubDelivery(db, "push2", "push", push("b", "")); await drainInbox(db, async () => "- [x] Fly");
  expect(db.query("SELECT completed,total FROM openspec_progress").get()!.completed).toBe(1);
  expect(db.query("SELECT source_ref FROM openspec_progress").get()!.source_ref).toBe("ops/defiant");
  expect(db.query("SELECT count(*) AS count FROM notifications WHERE title='OpenSpec complete'").get()!.count).toBe(1);
});
