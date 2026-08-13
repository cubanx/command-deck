import { createSign } from "node:crypto";
import type { Db } from "./db";
import { approvedInstallationAccount } from "./installations";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type ReadResult = { kind: "changed"; body: unknown; next?: string | null } | { kind: "unchanged"; body?: unknown; next?: string | null } | { kind: "error"; message: string; stale: true };
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
  const etag = db.query("SELECT value,cached_body FROM etags WHERE request_key=?").get(key) as { value: string; cached_body: string | null } | null;
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) { const current = await fetcher(url, { headers: etag ? { "if-none-match": etag.value, accept: "application/vnd.github+json" } : { accept: "application/vnd.github+json" } }); response = current; if (![429, 502, 503, 504].includes(current.status) || attempt === 2) break; await new Promise((resolve) => setTimeout(resolve, waitFor(current, attempt))); }
  if (!response) return { kind: "error", message: "GitHub request failed", stale: true };
  if (response.status === 304) { if (!etag?.cached_body) return { kind: "error", message: "GitHub returned uncached 304", stale: true }; db.query("UPDATE etags SET checked_at=CURRENT_TIMESTAMP WHERE request_key=?").run(key); try { const cached = JSON.parse(etag.cached_body); return cached && typeof cached === "object" && "body" in cached ? { kind: "unchanged", body: cached.body, next: cached.next } : { kind: "unchanged", body: cached }; } catch { return { kind: "error", message: "GitHub cached response is invalid", stale: true }; } }
  if (!response.ok) return { kind: "error", message: `GitHub request failed (${response.status})`, stale: true };
  const body = await response.json(), next = response.headers.get("etag");
  const link = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  if (next) db.query("INSERT INTO etags (request_key,value,cached_body) VALUES (?,?,?) ON CONFLICT(request_key) DO UPDATE SET value=excluded.value,cached_body=excluded.cached_body,checked_at=excluded.checked_at").run(key, next, JSON.stringify({ body, next: link }));
  return { kind: "changed", body, next: link };
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
export async function bootstrapInstallation(db: Db, installationId: string, token: string, fetcher: FetchLike = fetch): Promise<ReadResult> {
  const known = db.query("SELECT account_login FROM installations WHERE id=?").get(installationId) as { account_login: string | null } | null;
  if (known?.account_login && !approvedInstallationAccount(known.account_login)) return { kind: "error", message: "unapproved installation", stale: true };
  const request: FetchLike = (url, init) => fetcher(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), authorization: `Bearer ${token}` } });
  const installation = await request(`https://api.github.com/installation`, { headers: { accept: "application/vnd.github+json" } });
  if (!installation.ok) return { kind: "error", message: "GitHub installation verification failed", stale: true };
  const accountLogin = (await installation.json() as { account?: { login?: unknown } }).account?.login;
  if (!approvedInstallationAccount(accountLogin)) return { kind: "error", message: "unapproved installation", stale: true };
  db.query("INSERT INTO installations (id,account_login) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET account_login=excluded.account_login").run(installationId, accountLogin);
  const pages = async (key: string, first: string): Promise<ReadResult> => { const seen = new Set<string>(), values: unknown[] = []; let url: string | null = first, changed = false; while (url) { if (seen.has(url)) return { kind: "error", message: "GitHub pagination loop", stale: true }; seen.add(url); const result = await conditionalGet(db, `${key}:v2:page:${seen.size}`, url, request); if (result.kind === "error") return result; changed ||= result.kind === "changed"; values.push(result.body); if (result.next && (!result.next.startsWith("https://api.github.com/") || seen.has(result.next))) return { kind: "error", message: "GitHub pagination link is invalid", stale: true }; url = result.next ?? null; } return { kind: changed ? "changed" : "unchanged", body: values }; };
  const repos = await pages(`installation:${installationId}:repos`, "https://api.github.com/installation/repositories?per_page=100");
  if (repos.kind === "error") return repos;
  const items = (repos.body as Array<{ repositories?: Array<{ id: number; full_name: string }> }>).flatMap((page) => page.repositories ?? []), uniqueRepos = [...new Map(items.map((repo) => [String(repo.id), repo])).values()];
  const snapshots: Array<{ repo: { id: number; full_name: string }; pullRequests: Array<any> }> = [];
  for (const repo of uniqueRepos) { const prs = await pages(`installation:${installationId}:repo:${repo.id}:prs`, `https://api.github.com/repositories/${repo.id}/pulls?state=open&per_page=100`); if (prs.kind === "error") return prs; snapshots.push({ repo, pullRequests: (prs.body as Array<any[]>).flat().filter((pr, index, all) => all.findIndex((item) => item.number === pr.number) === index) }); }
  const ids = new Set(uniqueRepos.map((repo) => String(repo.id)));
  db.transaction(() => { for (const row of db.query("SELECT id FROM repositories WHERE installation_id=?").all(installationId) as { id: string }[]) if (!ids.has(row.id)) { db.query("DELETE FROM pull_requests WHERE installation_id=? AND repository_id=?").run(installationId, row.id); db.query("DELETE FROM repositories WHERE installation_id=? AND id=?").run(installationId, row.id); }
    for (const { repo, pullRequests } of snapshots) { db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES (?,?,?) ON CONFLICT(installation_id,id) DO UPDATE SET full_name=excluded.full_name").run(installationId, String(repo.id), repo.full_name); const numbers = new Set(pullRequests.map((pr) => Number(pr.number))); for (const pr of pullRequests) db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,draft,head_ref,head_sha,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(installation_id,repository_id,number) DO UPDATE SET title=excluded.title,url=excluded.url,author_login=excluded.author_login,state=excluded.state,draft=excluded.draft,head_ref=excluded.head_ref,head_sha=excluded.head_sha,updated_at=excluded.updated_at").run(installationId, String(repo.id), pr.number, pr.title, pr.html_url ?? null, pr.user?.login ?? null, pr.state ?? "open", pr.draft ? 1 : 0, typeof pr.head?.ref === "string" ? pr.head.ref : null, typeof pr.head?.sha === "string" ? pr.head.sha : null, pr.updated_at ?? new Date().toISOString()); for (const row of db.query("SELECT number FROM pull_requests WHERE installation_id=? AND repository_id=?").all(installationId, String(repo.id)) as { number: number }[]) if (!numbers.has(row.number)) db.query("DELETE FROM pull_requests WHERE installation_id=? AND repository_id=? AND number=?").run(installationId, String(repo.id), row.number); }
  })();
  for (const repo of uniqueRepos) {
    await bootstrapDeployments(db, installationId, String(repo.id), token, fetcher);
  }
  return { kind: "changed", body: uniqueRepos } as ReadResult;
}
export async function bootstrapDeployments(db: Db, installationId: string, repositoryId: string, token: string, fetcher: FetchLike = fetch) {
  const request: FetchLike = (url, init) => fetcher(url, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), authorization: `Bearer ${token}` } });
  const list = await conditionalGet(db, `installation:${installationId}:repo:${repositoryId}:deployments`, `https://api.github.com/repositories/${repositoryId}/deployments?per_page=20`, request);
  if (list.kind !== "changed") return list;
  // ponytail: only the newest 20 deployments; paginate if a selected repository needs deeper history.
  for (const deployment of Array.isArray(list.body) ? list.body as Array<any> : []) {
    const id = String(deployment.id); const statuses = await conditionalGet(db, `installation:${installationId}:repo:${repositoryId}:deployment:${id}:statuses`, `https://api.github.com/repositories/${repositoryId}/deployments/${id}/statuses?per_page=1`, request);
    const latest = statuses.kind === "changed" ? (statuses.body as Array<any>)[0] : null;
    const prior = latest ? null : db.query("SELECT state,status_id,updated_at FROM github_deployments WHERE installation_id=? AND repository_id=? AND id=?").get(installationId, repositoryId, id) as { state: string; status_id: string | null; updated_at: string } | null;
    db.query("INSERT INTO github_deployments (installation_id,repository_id,id,environment,ref,sha,state,status_id,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(installation_id,repository_id,id) DO UPDATE SET environment=excluded.environment,ref=excluded.ref,sha=excluded.sha,state=excluded.state,status_id=excluded.status_id,updated_at=excluded.updated_at").run(installationId, repositoryId, id, deployment.environment ?? null, deployment.ref ?? null, deployment.sha ?? null, latest?.state ?? prior?.state ?? "pending", latest?.id ? String(latest.id) : prior?.status_id ?? null, latest?.created_at ?? prior?.updated_at ?? deployment.created_at ?? new Date().toISOString());
  }
  return list;
}
export async function reconcileInstallations(db: Db, tokenFor: (installationId: string) => Promise<string>, fetcher: FetchLike = fetch) {
  const results: Array<{ installationId: string; result: ReadResult }> = [];
  for (const { id, account_login } of db.query("SELECT id,account_login FROM installations ORDER BY id").all() as { id: string; account_login: string | null }[]) {
    if (account_login && !approvedInstallationAccount(account_login)) { results.push({ installationId: id, result: { kind: "error", stale: true, message: "unapproved installation" } }); continue; }
    try { results.push({ installationId: id, result: await bootstrapInstallation(db, id, await tokenFor(id), fetcher) }); }
    catch (error) { results.push({ installationId: id, result: { kind: "error", stale: true, message: error instanceof Error ? error.message : "reconciliation failed" } as ReadResult }); }
  }
  return results;
}
