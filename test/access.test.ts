import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { LOCAL_DEMO_USER, bindInstallation, createOAuthState, createSession, dashboardForSession, dashboardForUser, consumeOAuthState, seedLocalDemo, sessionUser } from "../src/access";

test("OAuth state is one-time and expires", () => {
  const db = openDatabase();
  const state = createOAuthState(db, new Date("2030-01-01"));
  expect(consumeOAuthState(db, state, new Date("2029-01-01"))).toBeTrue();
  expect(consumeOAuthState(db, state, new Date("2029-01-01"))).toBeFalse();
  const expired = createOAuthState(db, new Date("2020-01-01"));
  expect(consumeOAuthState(db, expired, new Date("2021-01-01"))).toBeFalse();
});

test("sessions are hashed, expire, and dashboard rows never cross bindings", () => {
  const db = openDatabase();
  db.query("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u1", "1", "sisko");
  db.query("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u2", "2", "kira");
  bindInstallation(db, "u1", "i1"); bindInstallation(db, "u2", "i2");
  db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES ('i1','r','ds9/ops')").run();
  db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES ('i2','r','ds9/repairs')").run();
  db.query("INSERT INTO pull_requests (installation_id, repository_id, number, title, author_login, state, checks_state) VALUES (?, ?, ?, ?, ?, ?, ?)").run("i1", "r", 1, "Defend the wormhole", "sisko", "open", "failure");
  db.query("INSERT INTO pull_requests (installation_id, repository_id, number, title, state) VALUES (?, ?, ?, ?, ?)").run("i2", "r", 2, "Runabout repairs", "open");
  const { token } = createSession(db, "u1", new Date("2030-01-01"));
  expect(db.query("SELECT token_hash FROM sessions").get()!.token_hash).not.toBe(token);
  expect(sessionUser(db, token, new Date("2029-01-01"))?.id).toBe("u1");
  expect(dashboardForSession(db, token, new Date("2029-01-01")).pullRequests.map((pr) => pr.number)).toEqual([1]);
  expect(sessionUser(db, token, new Date("2031-01-01"))).toBeNull();
});

test("local demo projections are deterministic and idempotent", () => {
  const db = openDatabase();
  seedLocalDemo(db);
  seedLocalDemo(db);
  const dashboard = dashboardForUser(db, LOCAL_DEMO_USER.id);
  expect(dashboard.installationCount).toBe(1);
  expect(dashboard.pullRequests).toHaveLength(1);
  expect(dashboard.deployments).toHaveLength(3);
  expect(dashboard.notifications).toHaveLength(1);
  expect(dashboard.pullRequests[0]?.author_login).toBe(LOCAL_DEMO_USER.login);
  expect(dashboard.pullRequests[0]?.url).toBe("https://github.com/cubanx/dev-command-center/pull/1");
  expect(dashboard.pullRequests[0]?.draft).toBe(1);
  expect(dashboard.pullRequests[0]?.open_spec).not.toBeNull();
});

test("dashboard correlates OpenSpec into PR status and retains every recent deployment state", () => {
  const db = openDatabase();
  db.query("INSERT INTO users (id,github_id,login) VALUES ('u','9','dax')").run();
  bindInstallation(db, "u", "i");
  db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES ('i','r','cubanx/dev-command-center')").run();
  db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,draft,checks_state,head_ref,head_sha) VALUES ('i','r',1,'Broken','javascript:alert(1)','dax','open',0,'failure','ops/broken',?)").run("a".repeat(40));
  db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,draft,checks_state,head_ref,head_sha) VALUES ('i','r',2,'Spec pending','https://github.com/cubanx/dev-command-center/pull/2','dax','open',0,'success','ops/warp-core',?)").run("b".repeat(40));
  db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,draft,checks_state,head_ref,head_sha) VALUES ('i','r',3,'Healthy','https://github.com/cubanx/dev-command-center/pull/3','dax','open',0,'success','ops/healthy',?)").run("c".repeat(40));
  db.query("INSERT INTO openspec_progress (installation_id,repository_id,change_name,completed,total,source_commit,source_ref,active_group) VALUES ('i','r','warp-core',1,2,?,?,?)").run("b".repeat(40), "ops/warp-core", JSON.stringify({ title: "2. Core", tasks: [{ completed: false, text: "Align" }] }));
  for (const [id, state, updated] of [["verified", "success", "2030-01-02T00:00:00Z"], ["pending", "pending", "2030-01-01T12:00:00Z"], ["error", "failure", "2030-01-01T11:00:00Z"], ["old", "success", "2029-12-20T00:00:00Z"]]) db.query("INSERT INTO github_deployments (installation_id,repository_id,id,state,updated_at) VALUES ('i','r',?,?,?)").run(id, state, updated);
  const dashboard = dashboardForUser(db, "u", new Date("2030-01-02T12:00:00Z"));
  const byNumber = new Map(dashboard.pullRequests.map((pr) => [pr.number, pr]));
  expect([...byNumber.values()].map((pr) => pr.needs_attention)).toEqual([false, true, true]);
  expect(byNumber.get(1)?.url).toBe("https://github.com/cubanx/dev-command-center/pull/1");
  expect(byNumber.get(2)?.open_spec?.source_url).toBe(`https://github.com/cubanx/dev-command-center/blob/${"b".repeat(40)}/openspec/changes/warp-core/tasks.md`);
  expect(byNumber.get(3)?.open_spec).toBeNull();
  expect(dashboard.deployments.map((deployment) => deployment.state)).toEqual(["success", "pending", "failure"]);
});

test("dashboard leaves ambiguous branch OpenSpecs unlinked", () => {
  const db = openDatabase();
  db.query("INSERT INTO users (id,github_id,login) VALUES ('u','10','bashir')").run();
  bindInstallation(db, "u", "i");
  db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES ('i','r','ds9/medical')").run();
  for (const number of [1, 2]) db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,author_login,state,head_ref,head_sha) VALUES ('i','r',?,'Research','bashir','open','ops/research',?)").run(number, String(number).repeat(40));
  db.query("INSERT INTO openspec_progress (installation_id,repository_id,change_name,completed,total,source_commit,source_ref) VALUES ('i','r','research',0,1,?,'ops/research')").run("f".repeat(40));
  expect(dashboardForUser(db, "u").pullRequests.every((pr) => pr.open_spec === null)).toBeTrue();
});
