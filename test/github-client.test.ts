import { expect, test } from "bun:test";
import { bindInstallation, dashboardForUser, upsertIdentity } from "../src/access";
import { bootstrapDeployments, bootstrapInstallation, conditionalGet, reconcileInstallations, reconcileSerial, retryDelay } from "../src/github";
import { withDatabase } from "./mongo-support";

test("conditional reads retain ETags and surface 304", () => withDatabase(async (db) => {
  let headers: Headers | undefined;
  expect((await conditionalGet(db, "repos/1", "https://example.test/a", async (_, init) => { headers = new Headers(init?.headers); return new Response('{}', { headers: { etag: "v1" } }); })).kind).toBe("changed");
  expect(headers!.get("if-none-match")).toBeNull();
  expect(await conditionalGet(db, "repos/1", "https://example.test/a", async (_, init) => { headers = new Headers(init?.headers); return new Response(null, { status: 304 }); })).toMatchObject({ kind: "changed", body: {} });
  expect(headers!.get("if-none-match")).toBe("v1");
}));

test("provider retries honor reset headers and reject ordinary forbidden responses", () => {
  const now = 1_700_000_000_000;
  expect(retryDelay(new Response(null, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000005" } }), 0, now)).toBe(5000);
  expect(retryDelay(new Response(null, { status: 429, headers: { "retry-after": "7" } }), 0, now)).toBe(7000);
  expect(retryDelay(new Response(null, { status: 403 }), 0, now)).toBeUndefined();
});

test("serial reconciliation and complete bootstrap use installation tokens", () => withDatabase(async (db) => {
  let calls = 0; const waits: number[] = [];
  const results = await reconcileSerial(db, ["a", "b"], async () => ++calls === 1 ? new Response("retry", { status: 429 }) : new Response("{}"), async (ms) => waits.push(ms));
  expect(results.every((result) => result.kind === "changed")).toBeTrue(); expect(waits).toEqual([]);
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx");
  await bootstrapInstallation(db, "9", "token", async (url, init) => { expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token"); return String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : String(url).includes("pulls?") ? Response.json([{ number: 1, title: "Defiant", user: { login: "sisko" }, state: "open" }]) : Response.json({ repositories: [{ id: 2, full_name: "ds9/ops" }] }); });
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.pullRequests).toHaveLength(1);
}));

test("multi-page reconciliation replaces only a complete snapshot", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx");
  const prior = await db.users.findOne({ _id: "u" }); prior!.installations[0]!.repositories.push({ repositoryId: "old", full_name: "ds9/old", pullRequests: [], openSpecs: [], deployments: [] }); await db.users.replaceOne({ _id: "u" }, prior!);
  const fetcher = async (url: RequestInfo | URL) => { const value = String(url); if (value.endsWith("/installation")) return Response.json({ account: { login: "cubanx" } }); if (value.includes("repositories?page=2")) return Response.json({ repositories: [{ id: 2, full_name: "ds9/two" }] }); if (value.includes("installation/repositories")) return Response.json({ repositories: [{ id: 1, full_name: "ds9/one" }] }, { headers: { link: '<https://api.github.com/installation/repositories?page=2>; rel="next"' } }); if (value.includes("/pulls?")) return Response.json([]); if (value.includes("/deployments")) return Response.json([]); return new Response("missing", { status: 500 }); };
  expect((await bootstrapInstallation(db, "9", "token", fetcher)).kind).toBe("changed");
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories.map((repo) => repo.repositoryId)).toEqual(["1", "2"]);
  const failed = await bootstrapInstallation(db, "9", "token", async () => new Response("down", { status: 503 }));
  expect(failed.kind).toBe("error"); expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories.map((repo) => repo.repositoryId)).toEqual(["1", "2"]);
}));

test("recent deployments follow Link pagination", () => withDatabase(async (db) => {
  const calls: string[] = [];
  const result = await bootstrapDeployments(db, "9", "2", "token", async (url) => { const value = String(url); calls.push(value); if (value.includes("deployments?page=2")) return Response.json([{ id: 2 }]); if (value.includes("/deployments?")) return Response.json([{ id: 1 }], { headers: { link: '<https://api.github.com/repositories/2/deployments?page=2>; rel="next"' } }); return Response.json([]); });
  expect(result).toMatchObject({ kind: "changed" }); expect(calls.some((value) => value.includes("deployments?page=2"))).toBeTrue();
}));

test("complete reconciliation is user-scoped and preserves webhook fields", () => withDatabase(async (db) => {
  await upsertIdentity(db, "a", "sisko"); await upsertIdentity(db, "b", "kira"); await bindInstallation(db, "a", "9", "cubanx"); await bindInstallation(db, "b", "9", "cubanx");
  for (const userId of ["a", "b"]) { const user = await db.users.findOne({ _id: userId }); user!.installations[0]!.repositories.push({ repositoryId: "old", full_name: "ds9/old", pullRequests: [], openSpecs: [], deployments: [] }); await db.users.replaceOne({ _id: userId }, user!); }
  await bootstrapInstallation(db, "9", "token", async (url) => String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : String(url).includes("installation/repositories") ? Response.json({ repositories: [{ id: 2, full_name: "ds9/ops" }] }) : String(url).includes("/pulls?") ? Response.json([{ number: 1, title: "Sisko", user: { login: "sisko" }, state: "open" }, { number: 2, title: "Kira", user: { login: "kira" }, state: "open" }]) : Response.json([]));
  expect((await db.users.findOne({ _id: "a" }))?.installations[0]?.repositories[0]?.pullRequests.map((pr) => pr.number)).toEqual([1]); expect((await db.users.findOne({ _id: "b" }))?.installations[0]?.repositories[0]?.pullRequests.map((pr) => pr.number)).toEqual([2]);
}));

test("cached paginated next link survives a Link-less 304", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx"); let phase = 0, pageTwo = 0;
  const fetcher = async (url: RequestInfo | URL) => { const value = String(url); if (value.endsWith("/installation")) return Response.json({ account: { login: "cubanx" } }); if (value.includes("repositories?page=2")) { pageTwo++; return Response.json({ repositories: [{ id: 2, full_name: "ds9/two" }] }, { headers: { etag: "p2" } }); } if (value.includes("installation/repositories")) return phase++ ? new Response(null, { status: 304 }) : Response.json({ repositories: [{ id: 1, full_name: "ds9/one" }] }, { headers: { etag: "p1", link: '<https://api.github.com/installation/repositories?page=2>; rel="next"' } }); if (value.includes("/pulls?")) return Response.json([]); return Response.json([]); };
  await bootstrapInstallation(db, "9", "token", fetcher); await bootstrapInstallation(db, "9", "token", fetcher); expect(pageTwo).toBeGreaterThan(1); expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories).toHaveLength(2);
}));

test("bootstrap rejects unsafe deployment links", () => withDatabase(async (db) => {
  const result = await bootstrapDeployments(db, "9", "2", "token", async (url) => String(url).includes("/7/statuses") ? Response.json([{ id: 1, state: "success", target_url: "javascript:alert(1)", log_url: "invalid" }]) : String(url).includes("statuses") ? Response.json([{ id: 2, state: "success", target_url: "https://railway.app/deployment/8", log_url: "https://railway.app/logs/8" }]) : Response.json([{ id: 7 }, { id: 8 }]));
  expect(result).toMatchObject({ kind: "changed" }); expect((result as any).body[0]).toMatchObject({ target_url: undefined, log_url: undefined }); expect((result as any).body[1]).toMatchObject({ target_url: "https://railway.app/deployment/8", log_url: "https://railway.app/logs/8" });
}));

test("bootstrap caps deployment status reads and rows at twenty", () => withDatabase(async (db) => {
  let statuses = 0; const result = await bootstrapDeployments(db, "9", "2", "token", async (url) => String(url).includes("statuses") ? (statuses++, Response.json([])) : Response.json(Array.from({ length: 21 }, (_, id) => ({ id }))));
  expect(statuses).toBe(20); expect((result as any).body).toHaveLength(20);
}));

test("complete bootstrap preserves webhook fields and OpenSpecs while removing stale projections", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx"); const user = await db.users.findOne({ _id: "u" }); user!.installations[0]!.repositories.push({ repositoryId: "2", full_name: "ds9/ops", pullRequests: [{ number: 1, author_login: "sisko", state: "open", review_state: "approved", checks_state: "success", workflow_state: "success", mergeable: "clean", bot_review_state: "complete" }, { number: 99, author_login: "sisko", state: "open" }], openSpecs: [{ change_name: "defiant", completed: 1, total: 2 }], deployments: [] }, { repositoryId: "stale", full_name: "ds9/stale", pullRequests: [], openSpecs: [], deployments: [] }); await db.users.replaceOne({ _id: "u" }, user!);
  await bootstrapInstallation(db, "9", "token", async (url) => String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : String(url).includes("installation/repositories") ? Response.json({ repositories: [{ id: 2, full_name: "ds9/ops" }] }) : String(url).includes("/pulls?") ? Response.json([{ number: 1, title: "Defiant", user: { login: "sisko" }, state: "open" }]) : Response.json([]));
  const repositories = (await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories ?? [], repo = repositories[0]; expect(repositories).toHaveLength(1); expect(repo?.pullRequests).toHaveLength(1); expect(repo?.pullRequests[0]).toMatchObject({ title: "Defiant", review_state: "approved", checks_state: "success", workflow_state: "success", mergeable: "clean", bot_review_state: "complete" }); expect(repo?.openSpecs).toMatchObject([{ change_name: "defiant" }]);
}));

test("installation reconciliation obtains tokens and bootstraps serially in stable order", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "10", "cubanx"); await bindInstallation(db, "u", "9", "cubanx"); const tokens: string[] = [];
  const results = await reconcileInstallations(db, async (installationId) => { tokens.push(installationId); return `token-${installationId}`; }, async (url) => String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : String(url).includes("installation/repositories") ? Response.json({ repositories: [] }) : Response.json([]));
  expect(tokens).toEqual(["10", "9"]); expect(results.map((result) => result.installationId)).toEqual(["10", "9"]); expect(results.every((result) => result.result.kind === "changed")).toBeTrue();
}));

test("installation reconciliation marks stale projections and rejects visibly", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "9", "cubanx");
  await expect(reconcileInstallations(db, async () => "token", async () => new Response("down", { status: 500 }))).rejects.toThrow("reconciliation failed for installations 9");
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]).toMatchObject({ lastSyncError: "GitHub request failed (500)" });
  expect((await dashboardForUser(db, "u")).stale).toBeTrue();
  await reconcileInstallations(db, async () => "token", async (url) => String(url).endsWith("/installation") ? Response.json({ account: { login: "cubanx" } }) : String(url).includes("installation/repositories") ? Response.json({ repositories: [] }) : Response.json([]));
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.lastSyncError).toBeUndefined(); expect((await dashboardForUser(db, "u")).stale).toBeFalse();
}));
