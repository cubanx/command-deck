import { expect, test } from "bun:test";
import { LOCAL_DEMO_USER, bindInstallation, createOAuthState, createSession, dashboardForSession, dashboardForUser, consumeOAuthState, seedBindings, seedLocalDemo, sessionUser, upsertIdentity } from "../src/access";
import { mutateUser } from "../src/db";
import { withDatabase } from "./mongo-support";

test("OAuth state is one-time and expires", () => withDatabase(async (db) => {
  const state = await createOAuthState(db, new Date("2030-01-01"));
  expect((await db.oauthStates.findOne({}))?._id).not.toBe(state);
  expect(await consumeOAuthState(db, state, new Date("2029-01-01"))).toBeTrue();
  expect(await consumeOAuthState(db, state, new Date("2029-01-01"))).toBeFalse();
  const expired = await createOAuthState(db, new Date("2020-01-01"));
  expect(await consumeOAuthState(db, expired, new Date("2021-01-01"))).toBeFalse();
}));

test("sessions are hashed, expire, and dashboard rows never cross bindings", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u1", "sisko"); await upsertIdentity(db, "u2", "kira");
  await bindInstallation(db, "u1", "i1"); await bindInstallation(db, "u2", "i2");
  const user = await db.users.findOne({ _id: "u1" }); user!.installations[0]!.repositories.push({ repositoryId: "r", full_name: "ds9/ops", pullRequests: [{ number: 1, title: "Defend the wormhole", author_login: "sisko", state: "open", checks_state: "failure" }], openSpecs: [], deployments: [] }); await db.users.replaceOne({ _id: "u1" }, user!);
  const { token } = await createSession(db, "u1", new Date("2030-01-01"));
  expect((await db.sessions.findOne({}))!._id).not.toBe(token);
  expect((await sessionUser(db, token, new Date("2029-01-01")))?.id).toBe("u1");
  expect((await dashboardForSession(db, token, new Date("2029-01-01"))).pullRequests.map((pr: any) => pr.number)).toEqual([1]);
  expect(await sessionUser(db, token, new Date("2031-01-01"))).toBeNull();
}));

test("local demo projections are deterministic and isolated", () => withDatabase(async (db) => {
  await seedLocalDemo(db); await seedLocalDemo(db);
  const dashboard = await dashboardForUser(db, LOCAL_DEMO_USER.id);
  expect(dashboard.installationCount).toBe(1); expect(dashboard.pullRequests).toHaveLength(1); expect(dashboard.deployments).toHaveLength(3); expect(dashboard.notifications).toHaveLength(1);
  expect(dashboard.pullRequests[0]).toMatchObject({ title: "Build developer command center MVP", url: "https://github.com/cubanx/dev-command-center/pull/1", draft: 1, open_spec: { change_name: "build-developer-command-center-mvp", completed: 26, total: 27 } });
}));

test("dashboard prioritizes attention and correlates OpenSpecs without unsafe or ambiguous links", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "1");
  const user = await db.users.findOne({ _id: "u" }), sha = "a".repeat(40), now = new Date("2030-01-03T00:00:00Z");
  user!.installations[0]!.repositories.push({ repositoryId: "2", full_name: "ds9/ops", pullRequests: [
    { number: 1, title: "Urgent", author_login: "sisko", state: "open", checks_state: "failure", updated_at: "2030-01-01", url: "javascript:alert(1)", head_sha: sha, head_ref: "shared" },
    { number: 2, title: "Branch", author_login: "sisko", state: "open", updated_at: "2030-01-03", head_ref: "unique" },
    { number: 3, title: "Ambiguous", author_login: "sisko", state: "open", updated_at: "2030-01-02", head_ref: "shared" }
  ], openSpecs: [
    { change_name: "sha-match", completed: 2, total: 2, source_commit: sha, source_ref: "other" },
    { change_name: "branch-match", completed: 2, total: 2, source_ref: "unique" },
    { change_name: "ambiguous-a", completed: 2, total: 2, source_ref: "shared" },
    { change_name: "ambiguous-b", completed: 2, total: 2, source_ref: "shared" }
  ], deployments: [
    { id: "old", state: "success", updated_at: "2025-12-31T23:59:59Z" },
    { id: "pending", state: "pending", updated_at: "2030-01-02T23:00:00Z" },
    { id: "failure", state: "failure", updated_at: "2030-01-02T22:00:00Z" },
    { id: "success", state: "success", updated_at: "2030-01-02T21:00:00Z" }
  ] }); await db.users.replaceOne({ _id: "u" }, user!);
  const dashboard = await dashboardForUser(db, "u", now);
  expect(dashboard.pullRequests.map((pr: any) => pr.number)).toEqual([1, 2, 3]);
  expect(dashboard.pullRequests[0]).toMatchObject({ url: "https://github.com/ds9/ops/pull/1", open_spec: { change_name: "sha-match", source_url: `https://github.com/ds9/ops/blob/${sha}/openspec/changes/sha-match/tasks.md` } });
  expect(dashboard.pullRequests[1]?.open_spec).toMatchObject({ change_name: "branch-match" }); expect(dashboard.pullRequests[2]?.open_spec).toBeNull();
  expect(dashboard.deployments.map((deployment: any) => deployment.id)).toEqual(["pending", "failure", "success"]);
}));

test("operational collection identities and binding seeds are idempotent", () => withDatabase(async (db) => {
  await seedBindings(db, { userId: "9", bindings: [{ installationId: "1", accountLogin: "cubanx" }, { installationId: "2", accountLogin: "Crisp-Inc" }] });
  await seedBindings(db, { userId: "9", bindings: [{ installationId: "1", accountLogin: "cubanx" }] });
  expect((await db.users.findOne({ _id: "9" }))?.installations).toHaveLength(2);
  await upsertIdentity(db, "10", "kira"); await bindInstallation(db, "10", "3"); await seedBindings(db, { userId: "10", bindings: [{ installationId: "3", accountLogin: "hudson-law" }] });
  expect((await db.users.findOne({ _id: "10" }))?.installations).toMatchObject([{ installationId: "3", accountLogin: "hudson-law" }]);
  await expect(seedBindings(db, { userId: "9", bindings: [{ installationId: "1", accountLogin: "cubanx" }, { installationId: "1", accountLogin: "cubanx" }] })).rejects.toThrow("invalid binding seed");
  await expect(seedBindings(db, { userId: "9", bindings: [{ installationId: "3", accountLogin: "crisp-inc" }] })).rejects.toThrow("invalid binding seed");
  const before = await db.users.findOne({ _id: "9" });
  await expect(seedBindings(db, { userId: "9", bindings: [{ installationId: "3", accountLogin: "hudson-law" }, { installationId: "1", accountLogin: "Crisp-Inc" }] })).rejects.toThrow("conflicting binding seed");
  await expect(seedBindings(db, { userId: "not-a-github-id", bindings: [{ installationId: "3", accountLogin: "hudson-law" }] })).rejects.toThrow("invalid binding seed");
  await expect(seedBindings(db, { userId: "9", bindings: [{ installationId: "3", accountLogin: "hudson-law" }, { installationId: "not-an-installation", accountLogin: "hudson-law" }] })).rejects.toThrow("invalid binding seed");
  expect((await db.users.findOne({ _id: "9" }))?.installations).toEqual(before?.installations);
  await db.inboxDeliveries.insertOne({ _id: "github:d1", provider: "github", deliveryId: "d1", eventName: "push", status: "pending", attempts: 0, receivedAt: new Date() });
  await expect(db.inboxDeliveries.insertOne({ _id: "github:d1", provider: "github", deliveryId: "d1", eventName: "push", status: "pending", attempts: 0, receivedAt: new Date() })).rejects.toMatchObject({ code: 11000 });
  await db.notifications.insertOne({ _id: "n1", userId: "9", transitionKey: "transition", title: "Title", body: "Body", createdAt: new Date() });
  await expect(db.notifications.insertOne({ _id: "n2", userId: "9", transitionKey: "transition", title: "Title", body: "Body", createdAt: new Date() })).rejects.toMatchObject({ code: 11000 });
}));

test("aggregate CAS preserves concurrent data and rejects oversized replacement", () => withDatabase(async (db) => {
  await upsertIdentity(db, "9", "kira"); await bindInstallation(db, "9", "1");
  await mutateUser(db, "9", (user) => { user.installations[0]!.repositories.push({ repositoryId: "r", full_name: "ds9/ops", pullRequests: [{ number: 1 }], openSpecs: [], deployments: [] }); });
  expect((await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories[0]?.pullRequests).toHaveLength(1);
  await expect(mutateUser(db, "9", (user) => { user.github.avatarUrl = "x".repeat(13 * 1024 * 1024); })).rejects.toThrow("exceeds");
}));

test("aggregate CAS retries conflicts and preserves multiple bindings", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "kira"); await bindInstallation(db, "u", "1"); await bindInstallation(db, "u", "2");
  const original = db.users.replaceOne.bind(db.users); let conflicts = 0;
  (db.users as any).replaceOne = async (...args: any[]) => { if (conflicts++ === 0) return { modifiedCount: 0 }; return original(...args); };
  await mutateUser(db, "u", (user) => { user.github.avatarUrl = "https://example.test/avatar"; });
  expect((await db.users.findOne({ _id: "u" }))?.installations).toHaveLength(2); expect(conflicts).toBe(2);
  (db.users as any).replaceOne = async () => ({ modifiedCount: 0 });
  await expect(mutateUser(db, "u", () => {})).rejects.toThrow("changed concurrently");
  (db.users as any).replaceOne = original;
}));

test("notifications are user-scoped, newest first, and bounded", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u1", "sisko"); await upsertIdentity(db, "u2", "kira");
  for (let index = 0; index < 21; index++) await db.notifications.insertOne({ _id: `n${index}`, userId: "u1", transitionKey: `t${index}`, title: "Deployment", body: "Detail", link: `https://example.test/${index}`, createdAt: new Date(1_700_000_000_000 + index) });
  await expect(db.notifications.insertOne({ _id: "duplicate", userId: "u1", transitionKey: "t1", title: "Deployment", body: "Detail", createdAt: new Date() })).rejects.toMatchObject({ code: 11000 });
  await db.notifications.insertOne({ _id: "other", userId: "u2", transitionKey: "t1", title: "Other", body: "Other", createdAt: new Date() });
  const notifications = (await dashboardForUser(db, "u1")).notifications;
  expect(notifications).toHaveLength(20); expect(notifications[0]).toMatchObject({ _id: "n20", link: "https://example.test/20" }); expect(notifications.some((item) => item._id === "other")).toBeFalse();
}));
