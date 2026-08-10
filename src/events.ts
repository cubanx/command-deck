import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { ReviewBotConfig } from "./config";
import { changedTaskPaths, projectOpenSpec } from "./openspec";

export function githubSignatureValid(body: string, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const actual = signature.slice(7);
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export function acceptGitHubDelivery(db: Db, deliveryId: string, eventName: string, body: string) {
  return db.query("INSERT INTO inbox_deliveries (provider, delivery_id, payload, event_name) VALUES ('github', ?, ?, ?) ON CONFLICT DO NOTHING").run(deliveryId, body, eventName).changes === 1;
}
export function acceptRailwayHint(db: Db, deliveryId: string, body: string) {
  return db.query("INSERT INTO inbox_deliveries (provider, delivery_id, payload, event_name) VALUES ('railway', ?, ?, 'deployment') ON CONFLICT DO NOTHING").run(deliveryId, body).changes === 1;
}
export function notifyBoundUsers(db: Db, installationId: string, key: string, title: string, body: string) {
  const users = db.query("SELECT user_id FROM user_installations WHERE installation_id=?").all(installationId) as { user_id: string }[];
  for (const { user_id } of users) db.query("INSERT INTO notifications (id, user_id, transition_key, title, body) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, transition_key) DO NOTHING").run(randomUUID(), user_id, key, title, body);
}
function notifyUser(db: Db, userId: string, key: string, title: string, body: string) {
  db.query("INSERT INTO notifications (id, user_id, transition_key, title, body) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, transition_key) DO NOTHING").run(randomUUID(), userId, key, title, body);
}
const installationUsers = (db: Db, installationId: string) => (db.query("SELECT user_id FROM user_installations WHERE installation_id=?").all(installationId) as { user_id: string }[]).map((row) => row.user_id);
type RailwayHint = { projectId: string; serviceId: string; environmentId: string; deploymentId: string };
const branchRef = (value: unknown) => typeof value === "string" && value.length <= 255 && /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..") ? value : null;
const commitSha = (value: unknown) => typeof value === "string" && /^[0-9a-f]{40}$/i.test(value) ? value : null;
const railwayUsers = (db: Db, hint: RailwayHint) => db.query("SELECT user_id FROM railway_connections WHERE project_id=? AND service_id=? AND environment_id=?").all(hint.projectId, hint.serviceId, hint.environmentId) as { user_id: string }[];
const projectRailwayState = (db: Db, hint: RailwayHint, status: string, verification: "pending" | "error" | "verified") => {
  if (verification === "pending") db.query("INSERT INTO deployments (project_id,service_id,environment_id,id,status,verification_state) VALUES (?,?,?,?,?,'pending') ON CONFLICT DO NOTHING").run(hint.projectId, hint.serviceId, hint.environmentId, hint.deploymentId, status);
  else if (verification === "error") db.query("INSERT INTO deployments (project_id,service_id,environment_id,id,status,verification_state) VALUES (?,?,?,?,?,'error') ON CONFLICT(project_id,service_id,environment_id,id) DO UPDATE SET verification_state='error',updated_at=CURRENT_TIMESTAMP WHERE deployments.verification_state!='verified'").run(hint.projectId, hint.serviceId, hint.environmentId, hint.deploymentId, status);
  else db.query("INSERT INTO deployments (project_id,service_id,environment_id,id,status,verification_state) VALUES (?,?,?,?,?,'verified') ON CONFLICT(project_id,service_id,environment_id,id) DO UPDATE SET status=excluded.status,verification_state='verified',updated_at=CURRENT_TIMESTAMP").run(hint.projectId, hint.serviceId, hint.environmentId, hint.deploymentId, status);
};
async function projectGitHub(db: Db, event: string, raw: string, fetchTasks?: (input: { installationId: string; repositoryId: string; path: string; sha: string }) => Promise<string | null>, reviewBot?: ReviewBotConfig) {
  const data = JSON.parse(raw) as any;
  if (event === "pull_request" && data.installation?.id && data.repository?.id && data.pull_request) {
    const pr = data.pull_request, installation = String(data.installation.id), repo = String(data.repository.id);
    db.query("INSERT INTO installations (id) VALUES (?) ON CONFLICT DO NOTHING").run(installation);
    db.query("INSERT INTO repositories (installation_id,id,full_name) VALUES (?,?,?) ON CONFLICT(installation_id,id) DO UPDATE SET full_name=excluded.full_name").run(installation, repo, data.repository.full_name ?? repo);
    const before = db.query("SELECT mergeable FROM pull_requests WHERE installation_id=? AND repository_id=? AND number=?").get(installation, repo, pr.number) as { mergeable: string | null } | null;
    if (data.action === "closed" || pr.state !== "open") db.query("DELETE FROM pull_requests WHERE installation_id=? AND repository_id=? AND number=?").run(installation, repo, pr.number);
    else db.query("INSERT INTO pull_requests (installation_id,repository_id,number,title,url,author_login,state,draft,head_ref,head_sha,mergeable,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(installation_id,repository_id,number) DO UPDATE SET title=excluded.title,url=excluded.url,author_login=excluded.author_login,state=excluded.state,draft=excluded.draft,head_ref=excluded.head_ref,head_sha=excluded.head_sha,mergeable=excluded.mergeable,updated_at=excluded.updated_at").run(installation, repo, pr.number, pr.title ?? "Untitled", pr.html_url ?? null, pr.user?.login ?? null, pr.state, pr.draft ? 1 : 0, branchRef(pr.head?.ref), commitSha(pr.head?.sha), String(pr.mergeable ?? "unknown"), pr.updated_at ?? new Date().toISOString());
    const author = db.query("SELECT id FROM users WHERE login=?").get(pr.user?.login ?? "") as { id: string } | null;
    if (before && before.mergeable !== String(pr.mergeable ?? "unknown") && author) notifyUser(db, author.id, `mergeability:${repo}:${pr.number}:${pr.mergeable}`, "Mergeability changed", pr.title ?? "Pull request");
    if (data.action === "review_requested" && data.requested_reviewer?.id) { const user = db.query("SELECT id FROM users WHERE github_id=?").get(String(data.requested_reviewer.id)) as { id: string } | null; if (user) notifyUser(db, user.id, `review-request:${repo}:${pr.number}:${data.requested_reviewer.id}`, "Review requested", pr.title ?? "Pull request"); }
    return "done";
  }
  if (event === "pull_request_review" && data.installation?.id && data.repository?.id && data.pull_request?.number) { db.query("UPDATE pull_requests SET review_state=? WHERE installation_id=? AND repository_id=? AND number=?").run(data.review?.state ?? data.action, String(data.installation.id), String(data.repository.id), data.pull_request.number); return "done"; }
  if (event === "issue_comment") {
    if (!["created", "edited"].includes(data.action)) return "ignored";
    if (!reviewBot || !data.issue?.pull_request || !data.installation?.id || !data.repository?.id || !data.issue?.number) return "done";
    const actor = typeof data.comment?.user?.login === "string" ? data.comment.user.login : "";
    const body = typeof data.comment?.body === "string" ? data.comment.body.toLowerCase() : "";
    if (actor.toLowerCase() !== reviewBot.login.toLowerCase()) return "done";
    const state = body.includes(reviewBot.doneMarker.toLowerCase()) ? "complete" : body.includes(reviewBot.startMarker.toLowerCase()) ? "in_progress" : null;
    if (state) db.query("UPDATE pull_requests SET bot_review_actor=?,bot_review_state=?,bot_review_updated_at=? WHERE installation_id=? AND repository_id=? AND number=?").run(actor, state, data.comment.updated_at ?? data.comment.created_at ?? new Date().toISOString(), String(data.installation.id), String(data.repository.id), data.issue.number);
    return "done";
  }
  if ((event === "check_run" || event === "check_suite") && data.installation?.id && data.repository?.id) { const conclusion = data.check_run?.conclusion ?? data.check_suite?.conclusion ?? "pending", number = data.check_run?.pull_requests?.[0]?.number ?? data.check_suite?.pull_requests?.[0]?.number, installation = String(data.installation.id), repo = String(data.repository.id); if (number) db.query("UPDATE pull_requests SET checks_state=? WHERE installation_id=? AND repository_id=? AND number=?").run(conclusion, installation, repo, number); if (["failure", "timed_out", "cancelled"].includes(conclusion) && number) { const pr = db.query("SELECT author_login FROM pull_requests WHERE installation_id=? AND repository_id=? AND number=?").get(installation, repo, number) as { author_login: string } | null; const user = pr && db.query("SELECT id FROM users WHERE login=?").get(pr.author_login) as { id: string } | null; if (user) notifyUser(db, user.id, `check-failed:${repo}:${number}:${conclusion}`, "Checks failed", data.repository.full_name ?? "Repository"); } return "done"; }
  if (event === "workflow_run" && data.installation?.id && data.repository?.id) { const number = data.workflow_run?.pull_requests?.[0]?.number; if (number) db.query("UPDATE pull_requests SET workflow_state=? WHERE installation_id=? AND repository_id=? AND number=?").run(data.workflow_run?.conclusion ?? data.workflow_run?.status ?? "pending", String(data.installation.id), String(data.repository.id), number); return "done"; }
  if (event === "push" && data.installation?.id && data.repository?.id && fetchTasks) { const files = (data.commits ?? []).flatMap((c: any) => [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])]); const sourceRef = typeof data.ref === "string" && data.ref.startsWith("refs/heads/") ? branchRef(data.ref.slice(11)) ?? undefined : undefined; for (const path of changedTaskPaths(files)) { const removed = (data.commits ?? []).some((c: any) => (c.removed ?? []).includes(path)); const input = { installationId: String(data.installation.id), repositoryId: String(data.repository.id), path, sha: data.after ?? "unknown", sourceRef, deleted: removed }; const content = removed ? undefined : await fetchTasks(input); if (!removed && content === null) throw new Error("OpenSpec artifact fetch failed"); const complete = projectOpenSpec(db, { ...input, content: content ?? "" }); if (complete) notifyBoundUsers(db, input.installationId, `openspec-complete:${input.repositoryId}:${path}:${input.sha}`, "OpenSpec complete", path.split("/")[2]); } return "done"; }
  if (["installation", "push"].includes(event)) return "done";
  return "ignored";
}
export async function drainInbox(db: Db, railwayVerifier?: (hint: { projectId: string; serviceId: string; environmentId: string; deploymentId: string }) => Promise<{ status: string } | null>, fetchTasks?: (input: { installationId: string; repositoryId: string; path: string; sha: string }) => Promise<string | null>, reviewBot?: ReviewBotConfig) {
  const affected = new Set<string>();
  const rows = db.query("SELECT provider, delivery_id, payload, event_name FROM inbox_deliveries WHERE status IN ('pending', 'pending_verification') ORDER BY received_at").all() as { provider: string; delivery_id: string; payload: string; event_name: string }[];
  for (const row of rows) {
    try {
      if (row.provider === "github") {
        const status = await projectGitHub(db, row.event_name, row.payload, fetchTasks, reviewBot);
        const installation = JSON.parse(row.payload).installation?.id; if (installation) installationUsers(db, String(installation)).forEach((id) => affected.add(id));
        db.query("UPDATE inbox_deliveries SET status=?, payload=NULL, processed_at=CURRENT_TIMESTAMP WHERE provider=? AND delivery_id=?").run(status, row.provider, row.delivery_id);
      } else {
        const hint = parseRailwayHint(row.payload);
        if (!hint) { db.query("UPDATE inbox_deliveries SET status='rejected',error='invalid Railway hint',payload=NULL,processed_at=CURRENT_TIMESTAMP WHERE provider=? AND delivery_id=?").run(row.provider, row.delivery_id); continue; }
        projectRailwayState(db, hint, "unknown", "pending");
        const users = railwayUsers(db, hint); users.forEach(({ user_id }) => affected.add(user_id));
        if (!railwayVerifier) { db.query("UPDATE inbox_deliveries SET status='pending_verification',error='verification unavailable',processed_at=CURRENT_TIMESTAMP WHERE provider=? AND delivery_id=?").run(row.provider, row.delivery_id); continue; }
        let verified: { status: string } | null;
        try { verified = await railwayVerifier(hint); } catch (error) { projectRailwayState(db, hint, "unknown", "error"); db.query("UPDATE inbox_deliveries SET status='error',error=? WHERE provider=? AND delivery_id=?").run(error instanceof Error ? error.message.slice(0, 200) : "verification failed", row.provider, row.delivery_id); continue; }
        if (!verified) { db.query("UPDATE inbox_deliveries SET status='pending_verification', error='deployment not verified' WHERE provider=? AND delivery_id=?").run(row.provider, row.delivery_id); continue; }
        const prior = db.query("SELECT status FROM deployments WHERE project_id=? AND service_id=? AND environment_id=? AND id=?").get(hint.projectId, hint.serviceId, hint.environmentId, hint.deploymentId) as { status: string } | null;
        projectRailwayState(db, hint, verified.status, "verified");
        if (prior?.status !== verified.status && ["SUCCESS", "FAILED"].includes(verified.status)) for (const { user_id } of users) notifyUser(db, user_id, `railway:${hint.deploymentId}:${verified.status}`, `Deployment ${verified.status.toLowerCase()}`, hint.serviceId);
        db.query("UPDATE inbox_deliveries SET status='done', payload=NULL, processed_at=CURRENT_TIMESTAMP WHERE provider=? AND delivery_id=?").run(row.provider, row.delivery_id);
      }
    } catch (error) { db.query("UPDATE inbox_deliveries SET status='error', error=? WHERE provider=? AND delivery_id=?").run(error instanceof Error ? error.message.slice(0, 200) : "processing failed", row.provider, row.delivery_id); }
  }
  return [...affected];
}
export function parseRailwayHint(raw: string) {
  try { const value = JSON.parse(raw); const r = value.resource ?? value; const projectId = r.project?.id ?? r.projectId, serviceId = r.service?.id ?? r.serviceId, environmentId = r.environment?.id ?? r.environmentId, deploymentId = r.deployment?.id ?? r.deploymentId; return [projectId, serviceId, environmentId, deploymentId].every((x) => typeof x === "string" && x.length > 0) ? { projectId, serviceId, environmentId, deploymentId } : null; } catch { return null; }
}
