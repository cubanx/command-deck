import { createHash, randomUUID } from "node:crypto";
import type { Db, Installation, UserAggregate } from "./db";
import { mutateUser } from "./db";
import { approvedInstallationAccount } from "./installations";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const LOCAL_DEMO_USER = { id: "local-demo-user", login: "sisko" } as const;
const badPrStates = new Set(["action_required", "cancelled", "canceled", "failure", "failed", "timed_out"]);
const normalize = (value: unknown) => String(value ?? "unknown").toLowerCase().replaceAll(" ", "_");
const needsAttention = (pr: Record<string, unknown>) => Boolean(pr.draft) || normalize(pr.review_state) === "changes_requested" || badPrStates.has(normalize(pr.checks_state)) || badPrStates.has(normalize(pr.workflow_state)) || ["blocked", "conflict", "conflicting", "dirty", "false", "unmergeable"].includes(normalize(pr.mergeable));
const emptyUser = (id: string): UserAggregate => ({ _id: id, schemaVersion: 1, revision: 0, github: {}, installations: [], createdAt: new Date(), updatedAt: new Date() });
const pullRequestUrl = (fullName: unknown, number: unknown) => {
  if (fullName == null || number == null) return null;
  return `https://github.com/${String(fullName)}/pull/${String(number)}`;
};
const openSpecUrl = (fullName: unknown, sha: unknown, change: unknown) => {
  if (fullName == null || sha == null || change == null) return null;
  return `https://github.com/${String(fullName)}/blob/${String(sha)}/openspec/changes/${encodeURIComponent(String(change))}/tasks.md`;
};

export async function upsertIdentity(db: Db, id: string, login: string, avatarUrl?: string) {
  const now = new Date(), update: any = { $set: { "github.login": login, updatedAt: now }, $setOnInsert: { schemaVersion: 1, installations: [], createdAt: now }, $inc: { revision: 1 } };
  if (avatarUrl) update.$set["github.avatarUrl"] = avatarUrl; else update.$unset = { "github.avatarUrl": "" };
  await db.users.updateOne({ _id: id }, update, { upsert: true });
}
export async function seedBindings(db: Db, input: { userId: string; bindings: Array<{ installationId: string; accountLogin: string }> }) {
  if (!/^\d+$/.test(input.userId) || !input.bindings.length || new Set(input.bindings.map((item) => item.installationId)).size !== input.bindings.length || input.bindings.some((item) => !/^\d+$/.test(item.installationId) || !approvedInstallationAccount(item.accountLogin))) throw new Error("invalid binding seed");
  const existing = await db.users.findOne({ _id: input.userId });
  if (!existing) { const user = emptyUser(input.userId); user.installations = input.bindings.map((item) => ({ ...item, boundAt: new Date(), repositories: [] })); await db.users.insertOne(user); return; }
  await mutateUser(db, input.userId, (user) => { for (const binding of input.bindings) { const prior = user.installations.find((item) => item.installationId === binding.installationId); if (prior?.accountLogin && prior.accountLogin !== binding.accountLogin) throw new Error("conflicting binding seed"); if (!prior) user.installations.push({ ...binding, boundAt: new Date(), repositories: [] }); else if (!prior.accountLogin) prior.accountLogin = binding.accountLogin; } });
}
export async function seedLocalDemo(db: Db) {
  await upsertIdentity(db, LOCAL_DEMO_USER.id, LOCAL_DEMO_USER.login);
  await bindInstallation(db, LOCAL_DEMO_USER.id, "local-demo-installation", "cubanx");
  await mutateUser(db, LOCAL_DEMO_USER.id, (user) => { const installation = user.installations[0]!; installation.repositories = [{ repositoryId: "local-demo-repository", full_name: "cubanx/dev-command-center", pullRequests: [{ number: 1, title: "Build developer command center MVP", url: "https://github.com/cubanx/dev-command-center/pull/1", author_login: LOCAL_DEMO_USER.login, state: "open", draft: 1, head_ref: "dcc/build-developer-command-center-mvp", head_sha: "local-demo", mergeable: "conflicting", review_state: "changes_requested", checks_state: "failure", workflow_state: "failure", bot_review_actor: "claude[bot]", bot_review_state: "in_progress" }], openSpecs: [{ change_name: "build-developer-command-center-mvp", completed: 26, total: 27, source_commit: "local-demo", source_ref: "dcc/build-developer-command-center-mvp", active_group: JSON.stringify({ title: "Tasks", tasks: [{ completed: false, text: "Review the local dashboard" }] }) }], deployments: ["success", "pending", "failure"].map((state, index) => ({ id: String(42 + index), state, updated_at: new Date().toISOString() })) }]; });
  await db.notifications.updateOne({ userId: LOCAL_DEMO_USER.id, transitionKey: "demo:checks-failed:1701" }, { $setOnInsert: { _id: "local-demo-notification", userId: LOCAL_DEMO_USER.id, transitionKey: "demo:checks-failed:1701", title: "Checks failed", body: "Build developer command center MVP needs attention.", createdAt: new Date() } }, { upsert: true });
}
export async function createOAuthState(db: Db, expiresAt = new Date(Date.now() + 600_000)) { const state = randomUUID(); await db.oauthStates.insertOne({ _id: hash(state), expiresAt }); return state; }
export async function consumeOAuthState(db: Db, state: string, now = new Date()) { return Boolean(await db.oauthStates.findOneAndDelete({ _id: hash(state), expiresAt: { $gt: now } })); }
export async function createSession(db: Db, userId: string, expiresAt = new Date(Date.now() + 30 * 86_400_000)) { const token = randomUUID() + randomUUID(); await db.sessions.insertOne({ _id: hash(token), userId, expiresAt }); return { token, expiresAt }; }
export async function sessionUser(db: Db, token: string, now = new Date()) { const session = await db.sessions.findOne({ _id: hash(token), expiresAt: { $gt: now } }); if (!session) return null; const user = await db.users.findOne({ _id: session.userId }); return user?.github.login ? { id: user._id, login: user.github.login } : null; }
export async function bindInstallation(db: Db, userId: string, installationId: string, accountLogin?: string) { if (!approvedInstallationAccount(accountLogin)) return false; await mutateUser(db, userId, (user) => { const installation = user.installations.find((item) => item.installationId === installationId); if (!installation) user.installations.push({ installationId, accountLogin, boundAt: new Date(), repositories: [] }); else installation.accountLogin = accountLogin; }); return true; }
export async function dashboardForUser(db: Db, userId: string, now = new Date()) {
  const user = await db.users.findOne({ _id: userId }); if (!user?.github.login) throw new Error("unauthenticated");
  const installations = user.installations.filter((installation) => approvedInstallationAccount(installation.accountLogin));
  const repositories = installations.flatMap((installation) => installation.repositories.map((repository) => ({ ...repository, installationId: installation.installationId })));
  const openSpecs: any[] = repositories.flatMap((repository) => repository.openSpecs.map((spec) => ({ ...spec, installation_id: repository.installationId, repository_id: repository.repositoryId, full_name: repository.full_name, source_url: openSpecUrl(repository.full_name, spec.source_commit, spec.change_name) })));
  const projectedPullRequests: any[] = repositories.flatMap((repository) => repository.pullRequests.filter((pr) => pr.author_login === user.github.login).map((pr) => ({ ...pr, installation_id: repository.installationId, repository_id: repository.repositoryId, full_name: repository.full_name })));
  const byIdentity = new Map<string, any>(); for (const pr of projectedPullRequests.filter((pr) => pr.state === "open")) { const key = `${pr.full_name}:${pr.number}`; const previous = byIdentity.get(key); if (!previous || String(pr.updated_at ?? "") > String(previous.updated_at ?? "")) byIdentity.set(key, pr); }
  const openPullRequests = [...byIdentity.values()];
  const pullRequests = openPullRequests.map((pr) => { const candidates = openSpecs.filter((item) => item.installation_id === pr.installation_id && item.repository_id === pr.repository_id); const matches = candidates.filter((item) => pr.head_sha && item.source_commit === pr.head_sha); const branches = matches.length ? [] : candidates.filter((item) => pr.head_ref && item.source_ref === pr.head_ref); const uniqueCommit = openPullRequests.filter((item) => item.installation_id === pr.installation_id && item.repository_id === pr.repository_id && pr.head_sha && item.head_sha === pr.head_sha).length === 1; const uniqueBranch = openPullRequests.filter((item) => item.installation_id === pr.installation_id && item.repository_id === pr.repository_id && pr.head_ref && item.head_ref === pr.head_ref).length === 1; const openSpec = matches.length === 1 && uniqueCommit ? matches[0] : branches.length === 1 && uniqueBranch ? branches[0] : null; return { ...pr, url: pullRequestUrl(pr.full_name, pr.number), open_spec: openSpec, needs_attention: needsAttention(pr) || Boolean(openSpec && Number(openSpec.completed) < Number(openSpec.total)) }; }).sort((a, b) => Number(b.needs_attention) - Number(a.needs_attention) || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
  const cutoff = now.getTime() - 48 * 60 * 60_000;
  const deployments: any[] = repositories.flatMap((repository) => repository.deployments.filter((item) => Date.parse(String(item.updated_at)) >= cutoff).map((item) => ({ ...item, full_name: repository.full_name }))).sort((a: any, b: any) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const notifications = await db.notifications.find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
  return { pullRequests, deployments, notifications: notifications.map((notification) => ({ ...notification, id: notification._id })), installationCount: installations.length, stale: installations.some((installation) => Boolean(installation.lastSyncError)) };
}
export async function dashboardForSession(db: Db, token: string, now = new Date()) { const user = await sessionUser(db, token, now); if (!user) throw new Error("unauthenticated"); return dashboardForUser(db, user.id, now); }
