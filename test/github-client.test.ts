import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { bootstrapDeployments, bootstrapInstallation, conditionalGet, reconcileInstallations, reconcileSerial } from "../src/github";

test("conditional reads retain ETags and surface a 304 without replacing data", async () => {
  const db = openDatabase();
  let headers: Headers | undefined;
  const first = await conditionalGet(db, "repos/1", "https://example.test/a", async (_, init) => { headers = new Headers(init?.headers); return new Response('{"ok":true}', { headers: { etag: "v1" } }); });
  expect(first.kind).toBe("changed"); expect(headers!.get("if-none-match")).toBeNull();
  const second = await conditionalGet(db, "repos/1", "https://example.test/a", async (_, init) => { headers = new Headers(init?.headers); return new Response(null, { status: 304 }); });
  expect(headers!.get("if-none-match")).toBe("v1"); expect(second.kind).toBe("unchanged");
});

test("serial reconciliation backs off retryable requests and returns explicit errors", async () => {
  const db = openDatabase(); let active = 0, peak = 0, calls = 0, waits: number[] = [];
  const results = await reconcileSerial(db, ["a", "b"], async () => { active++; peak = Math.max(peak, active); calls++; active--; return calls === 1 ? new Response("no", { status: 429, headers: { "retry-after": "1" } }) : new Response("{}"); }, async (ms) => waits.push(ms));
  expect(peak).toBe(1); expect(waits).toEqual([1000]); expect(results.every((r) => r.kind === "changed")).toBeTrue();
});

test("installation reconciliation is serial and uses the supplied installation token", async () => {
  const db = openDatabase(); db.query("INSERT INTO installations (id) VALUES ('a'), ('b')").run();
  const order: string[] = []; const headers: string[] = [];
  const results = await reconcileInstallations(db, async (id) => { order.push(`token:${id}`); return `token-${id}`; }, async (_url, init) => { headers.push(new Headers(init?.headers).get("authorization")!); return new Response('{"repositories":[]}'); });
  expect(order).toEqual(["token:a", "token:b"]); expect(headers).toEqual(["Bearer token-a", "Bearer token-b"]); expect(results).toHaveLength(2);
});

test("bootstrap preserves webhook evidence, removes stale PRs, and requests 100 rows", async () => {
  const db = openDatabase();
  db.query("INSERT INTO installations (id) VALUES ('i')").run();
  db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES ('i','2','ds9/ops')").run();
  db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,author_login,state,mergeable,review_state,checks_state,workflow_state,bot_review_actor,bot_review_state) VALUES ('i','2',1,'Old','sisko','open','conflicting','changes_requested','failure','failure','claude[bot]','complete'),('i','2',2,'Stale','sisko','open','clean','approved','success','success',NULL,NULL)").run();
  let pullsUrl = "";
  await bootstrapInstallation(db, "i", "token", async (url) => { if (String(url).includes("pulls?")) { pullsUrl = String(url); return new Response(JSON.stringify([{ number: 1, title: "Prepare Defiant", html_url: "https://github.com/ds9/ops/pull/1", user: { login: "sisko" }, draft: true, head: { ref: "ops/defiant", sha: "b".repeat(40) } }])); } return new Response(JSON.stringify({ repositories: [{ id: 2, full_name: "ds9/ops" }] })); });
  expect(pullsUrl).toContain("per_page=100");
  expect(db.query("SELECT draft,head_ref,head_sha,mergeable,review_state,checks_state,workflow_state,bot_review_actor,bot_review_state FROM pull_requests WHERE number=1").get()).toMatchObject({ draft: 1, head_ref: "ops/defiant", head_sha: "b".repeat(40), mergeable: "conflicting", review_state: "changes_requested", checks_state: "failure", workflow_state: "failure", bot_review_actor: "claude[bot]", bot_review_state: "complete" });
  expect(db.query("SELECT count(*) AS count FROM pull_requests WHERE number=2").get()!.count).toBe(0);
});

test("deployment bootstrap is installation-token scoped, conditional, and bounded", async () => {
  const db = openDatabase(); db.query("INSERT INTO installations (id) VALUES ('i')").run();
  const urls: string[] = [], headers: Headers[] = [];
  await bootstrapDeployments(db, "i", "2", "token", async (url, init) => { urls.push(String(url)); headers.push(new Headers(init?.headers)); return String(url).includes("/statuses") ? Response.json([{ id: 9, state: "success" }], { headers: { etag: "status-v1" } }) : Response.json([{ id: 7, environment: "production", ref: "main", sha: "a".repeat(40) }], { headers: { etag: "deployments-v1" } }); });
  expect(urls).toEqual(["https://api.github.com/repositories/2/deployments?per_page=20", "https://api.github.com/repositories/2/deployments/7/statuses?per_page=1"]);
  expect(headers.every((value) => value.get("authorization") === "Bearer token")).toBeTrue();
  expect(db.query("SELECT state FROM github_deployments WHERE id='7'").get()).toEqual({ state: "success" });
});

test("deployment bootstrap preserves status evidence on a 304", async () => {
  const db = openDatabase(); db.query("INSERT INTO installations (id) VALUES ('i')").run();
  db.query("INSERT INTO github_deployments (installation_id,repository_id,id,state,status_id,updated_at) VALUES ('i','2','7','success','9','2026-01-01')").run();
  db.query("INSERT INTO etags (request_key,value) VALUES ('installation:i:repo:2:deployment:7:statuses','status-v1')").run();
  await bootstrapDeployments(db, "i", "2", "token", async (url) => String(url).includes("/statuses") ? new Response(null, { status: 304 }) : Response.json([{ id: 7, environment: "production", ref: "main", sha: "a".repeat(40) }]));
  expect(db.query("SELECT state,status_id,updated_at FROM github_deployments WHERE id='7'").get()).toEqual({ state: "success", status_id: "9", updated_at: "2026-01-01" });
});
