import { createHash, randomUUID } from "node:crypto";
import type { Db } from "./db";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (date: Date) => date.toISOString();

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
export function dashboardForUser(db: Db, userId: string) {
  const pullRequests = db.query("SELECT pr.* FROM pull_requests pr JOIN user_installations ui ON ui.installation_id=pr.installation_id JOIN users u ON u.id=ui.user_id WHERE ui.user_id=? AND pr.author_login=u.login ORDER BY pr.updated_at DESC, pr.number DESC").all(userId) as Array<Record<string, unknown>>;
  const openSpecs = db.query("SELECT op.* FROM openspec_progress op JOIN user_installations ui ON ui.installation_id=op.installation_id WHERE ui.user_id=? ORDER BY op.updated_at DESC").all(userId) as Array<Record<string, unknown>>;
  const deployments = db.query("SELECT d.* FROM deployments d JOIN railway_connections rc ON rc.project_id=d.project_id AND rc.service_id=d.service_id AND rc.environment_id=d.environment_id WHERE rc.user_id=? AND d.verification_state='verified' ORDER BY d.updated_at DESC").all(userId) as Array<Record<string, unknown>>;
  const notifications = db.query("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(userId) as Array<Record<string, unknown>>;
  const installationCount = (db.query("SELECT count(*) AS count FROM user_installations WHERE user_id=?").get(userId) as { count: number }).count;
  return { pullRequests, openSpecs, deployments, notifications, installationCount };
}
export function dashboardForSession(db: Db, token: string, now = new Date()) {
  const user = sessionUser(db, token, now);
  if (!user) throw new Error("unauthenticated");
  return dashboardForUser(db, user.id);
}
