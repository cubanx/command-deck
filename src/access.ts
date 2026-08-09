import { createHash, randomUUID } from "node:crypto";
import type { Db } from "./db";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (date: Date) => date.toISOString();

export const LOCAL_DEMO_USER = { id: "local-demo-user", login: "sisko" } as const;
const badPrStates = new Set(["action_required", "cancelled", "canceled", "failure", "failed", "timed_out"]);
const normalize = (value: unknown) => String(value ?? "unknown").toLowerCase().replaceAll(" ", "_");
const needsAttention = (pr: Record<string, unknown>) => Boolean(pr.draft) || normalize(pr.review_state) === "changes_requested" || badPrStates.has(normalize(pr.checks_state)) || badPrStates.has(normalize(pr.workflow_state)) || ["blocked", "conflict", "conflicting", "dirty", "false", "unmergeable"].includes(normalize(pr.mergeable));
const repositoryName = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) ? value : null;
const pullRequestUrl = (value: unknown, fullName: unknown, number: unknown) => { try { const url = new URL(String(value)); if (url.protocol === "https:" && url.hostname === "github.com" && /^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname)) return url.toString(); } catch {} const repository = repositoryName(fullName); return repository && Number.isInteger(number) ? `https://github.com/${repository}/pull/${number}` : null; };
const openSpecUrl = (fullName: unknown, sha: unknown, change: unknown) => { const repository = repositoryName(fullName); return repository && typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha) && typeof change === "string" && /^[A-Za-z0-9._-]+$/.test(change) ? `https://github.com/${repository}/blob/${sha}/openspec/changes/${encodeURIComponent(change)}/tasks.md` : null; };

export function seedLocalDemo(db: Db) {
  db.transaction(() => {
    db.query("INSERT INTO users (id,github_id,login) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login").run(LOCAL_DEMO_USER.id, "local-demo-github", LOCAL_DEMO_USER.login);
    db.query("INSERT INTO installations (id,account_login) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET account_login=excluded.account_login").run("local-demo-installation", "deep-space-nine");
    bindInstallation(db, LOCAL_DEMO_USER.id, "local-demo-installation");
    db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES (?,?,?) ON CONFLICT(installation_id,id) DO UPDATE SET full_name=excluded.full_name").run("local-demo-installation", "local-demo-repository", "cubanx/dev-command-center");
    db.query("DELETE FROM pull_requests WHERE installation_id=? AND repository_id=? AND number<>1").run("local-demo-installation", "local-demo-repository");
    db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,draft,head_ref,head_sha,mergeable,review_state,checks_state,workflow_state,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(installation_id,repository_id,number) DO UPDATE SET title=excluded.title,url=excluded.url,author_login=excluded.author_login,state=excluded.state,draft=excluded.draft,head_ref=excluded.head_ref,head_sha=excluded.head_sha,mergeable=excluded.mergeable,review_state=excluded.review_state,checks_state=excluded.checks_state,workflow_state=excluded.workflow_state,updated_at=CURRENT_TIMESTAMP").run("local-demo-installation", "local-demo-repository", 1, "Build developer command center MVP", "https://github.com/cubanx/dev-command-center/pull/1", LOCAL_DEMO_USER.login, "open", 1, "dcc/build-developer-command-center-mvp", "local-demo", "conflicting", "changes_requested", "failure", "failure");
    db.query("UPDATE pull_requests SET bot_review_actor='claude[bot]',bot_review_state='in_progress',bot_review_updated_at=CURRENT_TIMESTAMP WHERE installation_id=? AND repository_id=? AND number=1").run("local-demo-installation", "local-demo-repository");
    const activeGroup = { title: "9. Configurable automated review progress", tasks: [{ completed: true, text: "Test review signals" }, { completed: true, text: "Project bot progress" }, { completed: true, text: "Render review evidence" }, { completed: false, text: "Review the local dashboard" }] };
    db.query("DELETE FROM openspec_progress WHERE installation_id=? AND repository_id=? AND change_name<>?").run("local-demo-installation", "local-demo-repository", "build-developer-command-center-mvp");
    db.query("INSERT INTO openspec_progress (installation_id,repository_id,change_name,completed,total,source_commit,source_ref,active_group,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(installation_id,repository_id,change_name) DO UPDATE SET completed=excluded.completed,total=excluded.total,source_commit=excluded.source_commit,source_ref=excluded.source_ref,active_group=excluded.active_group,updated_at=CURRENT_TIMESTAMP").run("local-demo-installation", "local-demo-repository", "build-developer-command-center-mvp", 26, 27, "local-demo", "dcc/build-developer-command-center-mvp", JSON.stringify(activeGroup));
    bindRailwayConnection(db, LOCAL_DEMO_USER.id, "bajor-orbital", "promenade", "alpha-quadrant");
    db.query("DELETE FROM deployments WHERE project_id=? AND service_id=? AND environment_id=?").run("bajor-orbital", "promenade", "alpha-quadrant");
    for (const [id, status, verification] of [["runabout-42", "SUCCESS", "verified"], ["runabout-43", "unknown", "pending"], ["runabout-44", "unknown", "error"]]) db.query("INSERT INTO deployments (installation_id,project_id,service_id,environment_id,id,status,verification_state,updated_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").run("local-demo-installation", "bajor-orbital", "promenade", "alpha-quadrant", id, status, verification);
    db.query("INSERT INTO notifications (id,user_id,transition_key,title,body,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,transition_key) DO UPDATE SET title=excluded.title,body=excluded.body,created_at=excluded.created_at").run("local-demo-notification", LOCAL_DEMO_USER.id, "demo:checks-failed:1701", "Checks failed", "Build developer command center MVP needs attention.", "2026-08-09T12:15:00.000Z");
  })();
}

export function createOAuthState(db: Db, expiresAt = new Date(Date.now() + 10 * 60_000)) {
  const state = randomUUID();
  db.query("INSERT INTO oauth_states (state_hash, expires_at) VALUES (?, ?)").run(hash(state), iso(expiresAt));
  return state;
}
export function consumeOAuthState(db: Db, state: string, now = new Date()) {
  const result = db.query("DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ?").run(hash(state), iso(now));
  return result.changes === 1;
}
export function createSession(db: Db, userId: string, expiresAt = new Date(Date.now() + 30 * 86_400_000)) {
  const token = randomUUID() + randomUUID();
  db.query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").run(randomUUID(), userId, hash(token), iso(expiresAt));
  return { token, expiresAt };
}
export function sessionUser(db: Db, token: string, now = new Date()): { id: string; login: string } | null {
  return db.query("SELECT u.id, u.login FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ").get(hash(token), iso(now)) as { id: string; login: string } | null;
}
export function bindInstallation(db: Db, userId: string, installationId: string) {
  db.query("INSERT INTO installations (id) VALUES (?) ON CONFLICT(id) DO NOTHING").run(installationId);
  db.query("INSERT INTO user_installations (user_id, installation_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(userId, installationId);
}
export function bindRailwayConnection(db: Db, userId: string, projectId: string, serviceId: string, environmentId: string) {
  db.query("INSERT INTO railway_connections (user_id,project_id,service_id,environment_id) VALUES (?,?,?,?) ON CONFLICT DO NOTHING").run(userId, projectId, serviceId, environmentId);
}
export function dashboardForUser(db: Db, userId: string, now = new Date()) {
  const openSpecs: Array<Record<string, unknown> & { source_url: string | null }> = (db.query("SELECT op.*,r.full_name FROM openspec_progress op JOIN repositories r ON r.installation_id=op.installation_id AND r.id=op.repository_id JOIN user_installations ui ON ui.installation_id=op.installation_id WHERE ui.user_id=? ORDER BY op.updated_at DESC").all(userId) as Array<Record<string, unknown>>).map((item) => ({ ...item, source_url: openSpecUrl(item.full_name, item.source_commit, item.change_name) }));
  const projectedPullRequests = db.query("SELECT pr.*,r.full_name FROM pull_requests pr JOIN repositories r ON r.installation_id=pr.installation_id AND r.id=pr.repository_id JOIN user_installations ui ON ui.installation_id=pr.installation_id JOIN users u ON u.id=ui.user_id WHERE ui.user_id=? AND pr.author_login=u.login ORDER BY pr.updated_at DESC,pr.number DESC").all(userId) as Array<Record<string, unknown>>;
  const pullRequests = projectedPullRequests.map((pr) => {
    const candidates = openSpecs.filter((item) => item.installation_id === pr.installation_id && item.repository_id === pr.repository_id);
    const commitMatches = candidates.filter((item) => pr.head_sha && item.source_commit === pr.head_sha);
    const branchMatches = commitMatches.length ? [] : candidates.filter((item) => pr.head_ref && item.source_ref === pr.head_ref);
    const uniqueCommitHead = projectedPullRequests.filter((item) => item.installation_id === pr.installation_id && item.repository_id === pr.repository_id && pr.head_sha && item.head_sha === pr.head_sha).length === 1;
    const uniqueBranchHead = projectedPullRequests.filter((item) => item.installation_id === pr.installation_id && item.repository_id === pr.repository_id && pr.head_ref && item.head_ref === pr.head_ref).length === 1;
    const openSpec = commitMatches.length === 1 && uniqueCommitHead ? commitMatches[0] : branchMatches.length === 1 && uniqueBranchHead ? branchMatches[0] : null;
    return { ...pr, url: pullRequestUrl(pr.url, pr.full_name, pr.number), open_spec: openSpec, needs_attention: needsAttention(pr) || Boolean(openSpec && Number(openSpec.completed) < Number(openSpec.total)) };
  });
  const deployments = db.query("SELECT d.* FROM deployments d JOIN railway_connections rc ON rc.project_id=d.project_id AND rc.service_id=d.service_id AND rc.environment_id=d.environment_id WHERE rc.user_id=? AND datetime(d.updated_at)>=datetime(?) ORDER BY d.updated_at DESC,d.id DESC").all(userId, new Date(now.getTime() - 48 * 60 * 60_000).toISOString()) as Array<Record<string, unknown>>;
  const notifications = db.query("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(userId) as Array<Record<string, unknown>>;
  const installationCount = (db.query("SELECT count(*) AS count FROM user_installations WHERE user_id=?").get(userId) as { count: number }).count;
  return { pullRequests, deployments, notifications, installationCount };
}
export function dashboardForSession(db: Db, token: string, now = new Date()) {
  const user = sessionUser(db, token, now);
  if (!user) throw new Error("unauthenticated");
  return dashboardForUser(db, user.id, now);
}
