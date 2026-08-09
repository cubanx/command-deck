import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { bootstrapInstallation, conditionalGet, reconcileInstallations, reconcileSerial } from "../src/github";

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

test("bootstrap persists PR draft and head evidence", async () => {
  const db = openDatabase();
  db.query("INSERT INTO installations (id) VALUES ('i')").run();
  await bootstrapInstallation(db, "i", "token", async (url) => new Response(String(url).includes("pulls?") ? JSON.stringify([{ number: 1, title: "Prepare Defiant", html_url: "https://github.com/ds9/ops/pull/1", user: { login: "sisko" }, draft: true, head: { ref: "ops/defiant", sha: "b".repeat(40) } }]) : JSON.stringify({ repositories: [{ id: 2, full_name: "ds9/ops" }] })));
  expect(db.query("SELECT draft,head_ref,head_sha FROM pull_requests").get()).toMatchObject({ draft: 1, head_ref: "ops/defiant", head_sha: "b".repeat(40) });
});
