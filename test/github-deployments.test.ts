import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindInstallation, dashboardForUser } from "../src/access";
import { openDatabase } from "../src/db";
import { acceptGitHubDelivery, drainInbox } from "../src/events";

const deployment = (installation = "i1", repository = "r1") => JSON.stringify({
  installation: { id: installation }, repository: { id: repository, full_name: "cubanx/command-deck" },
  deployment: { id: 42, environment: "production", ref: "main", sha: "a".repeat(40), created_at: "2030-01-01T00:00:00Z" }
});
const status = (state: string, installation = "i1", repository = "r1", createdAt = "2030-01-01T01:00:00Z") => JSON.stringify({
  installation: { id: installation }, repository: { id: repository, full_name: "cubanx/command-deck" },
  deployment: { id: 42, environment: "production", ref: "main", sha: "a".repeat(40) },
  deployment_status: { id: 99, state, created_at: createdAt, target_url: "https://railway.example/deployments/42", log_url: "https://railway.example/logs/42" }
});

test("signed GitHub deployment deliveries project idempotently and notify only terminal transitions", async () => {
  const db = openDatabase();
  db.query("INSERT INTO users (id,github_id,login) VALUES ('u1','1','sisko')").run(); bindInstallation(db, "u1", "i1");
  acceptGitHubDelivery(db, "deployment-1", "deployment", deployment());
  acceptGitHubDelivery(db, "status-1", "deployment_status", status("success"));
  await drainInbox(db);
  expect(db.query("SELECT state,environment,target_url,log_url FROM github_deployments WHERE installation_id='i1' AND id='42'").get()).toEqual({ state: "success", environment: "production", target_url: "https://railway.example/deployments/42", log_url: "https://railway.example/logs/42" });
  expect(db.query("SELECT count(*) AS count FROM notifications").get()!.count).toBe(1);
  acceptGitHubDelivery(db, "deployment-late", "deployment", deployment()); await drainInbox(db);
  expect(db.query("SELECT state FROM github_deployments WHERE id='42'").get()).toEqual({ state: "success" });
  acceptGitHubDelivery(db, "status-2", "deployment_status", status("success")); await drainInbox(db);
  expect(db.query("SELECT count(*) AS count FROM notifications").get()!.count).toBe(1);
});

test("older deployment statuses cannot regress newer state and inactive does not notify", async () => {
  const db = openDatabase(); db.query("INSERT INTO users (id,github_id,login) VALUES ('u1','1','sisko')").run(); bindInstallation(db, "u1", "i1");
  acceptGitHubDelivery(db, "new", "deployment_status", status("success", "i1", "r1", "2030-01-02T01:00:00Z")); await drainInbox(db);
  acceptGitHubDelivery(db, "old", "deployment_status", status("pending", "i1", "r1", "2030-01-01T01:00:00Z")); await drainInbox(db);
  expect(db.query("SELECT state FROM github_deployments WHERE id='42'").get()).toEqual({ state: "success" });
  acceptGitHubDelivery(db, "inactive", "deployment_status", status("inactive", "i1", "r1", "2030-01-03T01:00:00Z")); await drainInbox(db);
  expect(db.query("SELECT state FROM github_deployments WHERE id='42'").get()).toEqual({ state: "inactive" });
  expect(db.query("SELECT count(*) AS count FROM notifications").get()!.count).toBe(1);
});

test("dashboard returns safe deployment target and log links", async () => {
  const db = openDatabase(); db.query("INSERT INTO users (id,github_id,login) VALUES ('u1','1','sisko')").run(); bindInstallation(db, "u1", "i1");
  acceptGitHubDelivery(db, "status-link", "deployment_status", status("success")); await drainInbox(db);
  expect(dashboardForUser(db, "u1").deployments[0]).toMatchObject({ target_url: "https://railway.example/deployments/42", log_url: "https://railway.example/logs/42" });
});

test("dashboard deployment rows stay within the user's installation", async () => {
  const db = openDatabase();
  db.query("INSERT INTO users (id,github_id,login) VALUES ('u1','1','sisko'),('u2','2','kira')").run();
  bindInstallation(db, "u1", "i1"); bindInstallation(db, "u2", "i2");
  acceptGitHubDelivery(db, "i1-status", "deployment_status", status("failure", "i1", "r1"));
  acceptGitHubDelivery(db, "i2-status", "deployment_status", status("success", "i2", "r2")); await drainInbox(db);
  expect(dashboardForUser(db, "u1").deployments.map((row) => row.installation_id)).toEqual(["i1"]);
});

test("new GitHub deployment storage does not require rebuilding a legacy database", () => {
  const db = openDatabase();
  expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='deployments'").get()).not.toBeNull();
  expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='github_deployments'").get()).not.toBeNull();
});

test("opens a legacy SQLite file without replacing legacy data", () => {
  const path = join(tmpdir(), `dcc-legacy-${crypto.randomUUID()}.sqlite`);
  const legacy = new Database(path, { create: true }); legacy.exec("CREATE TABLE deployments (id TEXT PRIMARY KEY, status TEXT NOT NULL); INSERT INTO deployments VALUES ('legacy-42','SUCCESS')"); legacy.close();
  const db = openDatabase(path);
  expect(db.query("SELECT status FROM deployments WHERE id='legacy-42'").get()).toEqual({ status: "SUCCESS" });
  expect(db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='github_deployments'").get()).not.toBeNull();
  db.close();
});
