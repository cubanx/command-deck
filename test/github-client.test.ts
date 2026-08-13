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
  const db = openDatabase(); db.query("INSERT INTO installations (id,account_login) VALUES ('a','cubanx'), ('b','Crisp-Inc')").run();
  const order: string[] = []; const headers: string[] = [];
  const results = await reconcileInstallations(db, async (id) => { order.push(`token:${id}`); return `token-${id}`; }, async (url, init) => { headers.push(new Headers(init?.headers).get("authorization")!); return String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : new Response('{"repositories":[]}'); });
  expect(order).toEqual(["token:a", "token:b"]); expect(headers).toEqual(["Bearer token-a", "Bearer token-a", "Bearer token-b", "Bearer token-b"]); expect(results).toHaveLength(2);
});

test("bootstrap preserves webhook evidence, removes stale PRs, and requests 100 rows", async () => {
  const db = openDatabase();
  db.query("INSERT INTO installations (id,account_login) VALUES ('i','cubanx')").run();
  db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES ('i','2','ds9/ops')").run();
  db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,author_login,state,mergeable,review_state,checks_state,workflow_state,bot_review_actor,bot_review_state) VALUES ('i','2',1,'Old','sisko','open','conflicting','changes_requested','failure','failure','claude[bot]','complete'),('i','2',2,'Stale','sisko','open','clean','approved','success','success',NULL,NULL)").run();
  let pullsUrl = "";
  await bootstrapInstallation(db, "i", "token", async (url) => { if (String(url).endsWith("/installation")) return Response.json({ account: { login: "cubanx" } }); if (String(url).includes("pulls?")) { pullsUrl = String(url); return new Response(JSON.stringify([{ number: 1, title: "Prepare Defiant", html_url: "https://github.com/ds9/ops/pull/1", user: { login: "sisko" }, draft: true, head: { ref: "ops/defiant", sha: "b".repeat(40) } }])); } return new Response(JSON.stringify({ repositories: [{ id: 2, full_name: "ds9/ops" }] })); });
  expect(pullsUrl).toContain("per_page=100");
  expect(db.query("SELECT draft,head_ref,head_sha,mergeable,review_state,checks_state,workflow_state,bot_review_actor,bot_review_state FROM pull_requests WHERE number=1").get()).toMatchObject({ draft: 1, head_ref: "ops/defiant", head_sha: "b".repeat(40), mergeable: "conflicting", review_state: "changes_requested", checks_state: "failure", workflow_state: "failure", bot_review_actor: "claude[bot]", bot_review_state: "complete" });
  expect(db.query("SELECT count(*) AS count FROM pull_requests WHERE number=2").get()!.count).toBe(0);
});

test("deployment bootstrap is installation-token scoped, conditional, and bounded", async () => {
  const db = openDatabase(); db.query("INSERT INTO installations (id,account_login) VALUES ('i','cubanx')").run();
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

test("bootstrap paginates authenticated lists, reconstructs 304 pages, and preserves rows on a later-page failure", async () => {
  const db = openDatabase(); db.query("INSERT INTO installations (id) VALUES ('i')").run();
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const page = (body: unknown, next?: string) => new Response(JSON.stringify(body), { headers: next ? { etag: "v1", link: `<${next}>; rel=\"next\"` } : { etag: "v1" } });
  await bootstrapInstallation(db, "i", "token", async (url, init) => { calls.push({ url: String(url), authorization: new Headers(init?.headers).get("authorization") }); if (String(url).endsWith("/installation")) return Response.json({ account: { login: "cubanx" } }); if (String(url).includes("installation/repositories")) return String(url).includes("page=2") ? page({ repositories: [{ id: 2, full_name: "ds9/two" }] }) : page({ repositories: [{ id: 1, full_name: "ds9/one" }] }, "https://api.github.com/installation/repositories?per_page=100&page=2"); return page([]); });
  expect(calls.filter((call) => call.url.includes("installation/repositories")).map((call) => call.authorization)).toEqual(["Bearer token", "Bearer token"]);
  expect(db.query("SELECT count(*) AS count FROM repositories WHERE installation_id='i'").get()!.count).toBe(2);
  await bootstrapInstallation(db, "i", "token", async (url) => String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : String(url).includes("installation/repositories") ? new Response(null, { status: 304 }) : page([]));
  expect(db.query("SELECT count(*) AS count FROM repositories WHERE installation_id='i'").get()!.count).toBe(2);
  db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,state) VALUES ('i','1',99,'Prior','open')").run();
  const failed = await bootstrapInstallation(db, "i", "token", async (url) => { const value = String(url); if (value.endsWith("/installation")) return Response.json({ account: { login: "cubanx" } }); if (value.includes("installation/repositories")) return page({ repositories: [{ id: 1, full_name: "ds9/one" }] }); if (value.includes("pulls?") && value.includes("page=2")) return new Response("no", { status: 400 }); return value.includes("pulls?") ? page([{ number: 1, title: "First", state: "open" }], "https://api.github.com/repositories/1/pulls?state=open&per_page=100&page=2") : page([]); });
  expect(failed.kind).toBe("error");
  expect(db.query("SELECT number FROM pull_requests WHERE installation_id='i' AND repository_id='1'").all()).toEqual([{ number: 99 }]);
});

test("bootstrap backfills approved accounts and skips known unapproved installations", async () => {
  const db = openDatabase(); db.query("INSERT INTO installations (id) VALUES ('legacy')").run();
  await bootstrapInstallation(db, "legacy", "token", async (url) => String(url).endsWith("/installation") ? Response.json({ account: { login: "hudson-law" } }) : Response.json({ repositories: [] }));
  expect(db.query("SELECT account_login FROM installations WHERE id='legacy'").get()).toEqual({ account_login: "hudson-law" });
  db.query("INSERT INTO installations (id,account_login) VALUES ('bad','ferengi')").run(); let calls = 0;
  expect((await bootstrapInstallation(db, "bad", "token", async () => { calls++; return Response.json({}); })).kind).toBe("error"); expect(calls).toBe(0);
});
