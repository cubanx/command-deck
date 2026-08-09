import { createSign } from "node:crypto";
import type { Db } from "./db";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type ReadResult = { kind: "changed"; body: unknown } | { kind: "unchanged" } | { kind: "error"; message: string; stale: true };
const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function githubAppJwt(appId: string, privateKey: string, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${payload}`); signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}
export async function installationToken(appJwt: string, installationId: string, fetcher: FetchLike = fetch) {
  const response = await fetcher(`https://api.github.com/app/installations/${installationId}/access_tokens`, { method: "POST", headers: { authorization: `Bearer ${appJwt}`, accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status})`);
  return (await response.json() as { token: string }).token;
}
export async function conditionalGet(db: Db, key: string, url: string, fetcher: FetchLike = fetch): Promise<ReadResult> {
  const etag = db.query("SELECT value FROM etags WHERE request_key=?").get(key) as { value: string } | null;
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) { const current = await fetcher(url, { headers: etag ? { "if-none-match": etag.value, accept: "application/vnd.github+json" } : { accept: "application/vnd.github+json" } }); response = current; if (![429, 502, 503, 504].includes(current.status) || attempt === 2) break; await new Promise((resolve) => setTimeout(resolve, waitFor(current, attempt))); }
  if (!response) return { kind: "error", message: "GitHub request failed", stale: true };
  if (response.status === 304) { db.query("INSERT INTO etags (request_key,value,checked_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(request_key) DO UPDATE SET checked_at=CURRENT_TIMESTAMP").run(key, etag?.value ?? ""); return { kind: "unchanged" }; }
  if (!response.ok) return { kind: "error", message: `GitHub request failed (${response.status})`, stale: true };
  const next = response.headers.get("etag"); if (next) db.query("INSERT INTO etags (request_key,value) VALUES (?,?) ON CONFLICT(request_key) DO UPDATE SET value=excluded.value,checked_at=CURRENT_TIMESTAMP").run(key, next);
  return { kind: "changed", body: await response.json() };
}
const waitFor = (response: Response, attempt: number) => {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 60_000);
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(reset) && reset > Date.now() / 1000) return Math.min((reset - Date.now() / 1000) * 1000, 60_000);
  return Math.min(1000 * 2 ** attempt, 8000);
};
export async function reconcileSerial(db: Db, keys: string[], fetcher: FetchLike, sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))) {
  const results: ReadResult[] = [];
  for (const key of keys) {
    let result: ReadResult = { kind: "error", message: "not requested", stale: true };
    for (let attempt = 0; attempt < 3; attempt++) {
      const etag = db.query("SELECT value FROM etags WHERE request_key=?").get(key) as { value: string } | null;
      const response = await fetcher(key, { headers: etag ? { "if-none-match": etag.value, accept: "application/vnd.github+json" } : { accept: "application/vnd.github+json" } });
      if (response.status === 304) { result = { kind: "unchanged" }; break; }
      if (response.ok) { const next = response.headers.get("etag"); if (next) db.query("INSERT INTO etags (request_key,value) VALUES (?,?) ON CONFLICT(request_key) DO UPDATE SET value=excluded.value,checked_at=CURRENT_TIMESTAMP").run(key, next); result = { kind: "changed", body: await response.json() }; break; }
      if (![429, 502, 503, 504].includes(response.status) || attempt === 2) { result = { kind: "error", message: `GitHub request failed (${response.status})`, stale: true }; break; }
      await sleep(waitFor(response, attempt));
    }
    results.push(result);
  }
  return results;
}
export async function bootstrapInstallation(db: Db, installationId: string, token: string, fetcher: FetchLike = fetch) {
  const request: FetchLike = (url, init) => fetcher(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), authorization: `Bearer ${token}` } });
  const repos = await conditionalGet(db, `installation:${installationId}:repos`, "https://api.github.com/installation/repositories?per_page=100", request);
  if (repos.kind === "error") return repos;
  const items = repos.kind === "changed" ? (repos.body as { repositories?: Array<{ id: number; full_name: string }> }).repositories ?? [] : db.query("SELECT id, full_name FROM repositories WHERE installation_id=?").all(installationId) as Array<{ id: number; full_name: string }>;
  if (repos.kind === "changed") {
    // ponytail: first page only; add paginated reconciliation when an installation exceeds 100 repositories.
    const ids = new Set(items.map((repo) => String(repo.id)));
    for (const row of db.query("SELECT id FROM repositories WHERE installation_id=?").all(installationId) as { id: string }[]) if (!ids.has(row.id)) { db.query("DELETE FROM pull_requests WHERE installation_id=? AND repository_id=?").run(installationId, row.id); db.query("DELETE FROM repositories WHERE installation_id=? AND id=?").run(installationId, row.id); }
  }
  for (const repo of items) {
    db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES (?,?,?) ON CONFLICT(installation_id,id) DO UPDATE SET full_name=excluded.full_name").run(installationId, String(repo.id), repo.full_name);
    const prs = await conditionalGet(db, `installation:${installationId}:repo:${repo.id}:prs`, `https://api.github.com/repositories/${repo.id}/pulls?state=open`, request);
    if (prs.kind !== "changed") continue;
    db.query("DELETE FROM pull_requests WHERE installation_id=? AND repository_id=?").run(installationId, String(repo.id));
    for (const pr of (prs.body as Array<any>)) db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(installationId, String(repo.id), pr.number, pr.title, pr.html_url ?? null, pr.user?.login ?? null, "open", pr.updated_at ?? new Date().toISOString());
  }
  return repos;
}
export async function reconcileInstallations(db: Db, tokenFor: (installationId: string) => Promise<string>, fetcher: FetchLike = fetch) {
  const results: Array<{ installationId: string; result: ReadResult }> = [];
  for (const { id } of db.query("SELECT id FROM installations ORDER BY id").all() as { id: string }[]) {
    try { results.push({ installationId: id, result: await bootstrapInstallation(db, id, await tokenFor(id), fetcher) }); }
    catch (error) { results.push({ installationId: id, result: { kind: "error", stale: true, message: error instanceof Error ? error.message : "reconciliation failed" } }); }
  }
  return results;
}
