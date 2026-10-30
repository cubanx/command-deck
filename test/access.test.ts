import { expect, test } from "vitest";
import {
	bindInstallation,
	consumeOAuthState,
	createOAuthState,
	createSession,
	dashboardForSession,
	dashboardForUser,
	LOCAL_DEMO_USER,
	safeAvatarUrl,
	seedLocalDemo,
	sessionUser,
	upsertIdentity,
} from "#/access";
import { type Db, upsertDeployment, upsertPullRequest } from "#/db";
import { withDatabase } from "./mongo-support";

type RepositoryFixture = {
	repositoryId: string;
	full_name: string;
	pullRequests: Array<Record<string, unknown>>;
	deployments: Array<Record<string, unknown>>;
};
async function putRepositories(db: Db, installationId: string, ...repositories: RepositoryFixture[]) {
	for (const { repositoryId, full_name, pullRequests, deployments } of repositories) {
		await db.repositories.updateOne(
			{ _id: repositoryId },
			{
				$set: { repositoryId, full_name, updatedAt: new Date() },
				$addToSet: { installationIds: installationId },
			},
			{ upsert: true },
		);
		for (const pr of pullRequests) await upsertPullRequest(db, { ...pr, repositoryId, number: Number(pr.number) });
		for (const deployment of deployments)
			await upsertDeployment(db, { ...deployment, repositoryId, deploymentId: String(deployment.id) });
	}
}

test("OAuth state is one-time and expires", () =>
	withDatabase(async (db) => {
		const state = await createOAuthState(db, new Date("2030-01-01"));
		expect((await db.oauthStates.findOne({}))?._id).not.toBe(state);
		expect(await consumeOAuthState(db, state, new Date("2029-01-01"))).toBe(true);
		expect(await consumeOAuthState(db, state, new Date("2029-01-01"))).toBe(false);
		const expired = await createOAuthState(db, new Date("2020-01-01"));
		expect(await consumeOAuthState(db, expired, new Date("2021-01-01"))).toBe(false);
	}));

test("sessions are hashed, expire, and dashboard identity never crosses users", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u1", "sisko", "https://avatars.githubusercontent.com/u/100?v=4");
		await upsertIdentity(db, "u2", "kira", "https://avatars.githubusercontent.com/u/200?v=4");
		await bindInstallation(db, "u1", "i1", "cubanx");
		await bindInstallation(db, "u2", "i2", "cubanx");
		await putRepositories(db, "i1", {
			repositoryId: "r",
			full_name: "ds9/ops",
			pullRequests: [
				{
					number: 1,
					title: "Defend the wormhole",
					author_login: "sisko",
					state: "open",
					checks_state: "failure",
				},
			],
			deployments: [],
		});
		const { token } = await createSession(db, "u1", new Date("2030-01-01"));
		expect((await db.sessions.findOne({}))?._id).not.toBe(token);
		expect((await sessionUser(db, token, new Date("2029-01-01")))?.id).toBe("u1");
		const dashboard = await dashboardForSession(db, token, new Date("2029-01-01"));
		expect(dashboard.pullRequests.map((pr) => pr.number)).toEqual([1]);
		expect(dashboard.user).toEqual({
			login: "sisko",
			avatar_url: "https://avatars.githubusercontent.com/u/100?v=4",
		});
		expect(JSON.stringify(dashboard)).not.toContain("/u/200");
		expect(await sessionUser(db, token, new Date("2031-01-01"))).toBeNull();
	}));

test("avatar URLs require credential-free HTTPS and invalid values are not projected", () =>
	withDatabase(async (db) => {
		expect(safeAvatarUrl("https://avatars.githubusercontent.com/u/9?v=4")).toBe(
			"https://avatars.githubusercontent.com/u/9?v=4",
		);
		for (const value of [
			"http://avatars.githubusercontent.com/u/9",
			"https://user:secret@avatars.githubusercontent.com/u/9",
			"javascript:alert(1)",
			"not a url",
		])
			expect(safeAvatarUrl(value)).toBeUndefined();

		await upsertIdentity(db, "u", "odo", "javascript:alert(1)");
		expect((await dashboardForUser(db, "u")).user).toEqual({ login: "odo" });
	}));

test("dashboard shows every open authored PR across allowed installations, attention first", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "odo");
		await upsertIdentity(db, "other", "quark");
		await bindInstallation(db, "u", "1", "cubanx");
		await bindInstallation(db, "u", "2", "Crisp-Inc");
		await bindInstallation(db, "other", "3", "hudson-law");
		await putRepositories(db, "1", {
			repositoryId: "r1",
			full_name: "cubanx/defiant",
			pullRequests: [
				{
					number: 1,
					title: "Older healthy",
					author_login: "odo",
					state: "open",
					checks_state: "success",
					updated_at: "2030-01-01T00:00:00Z",
				},
				{ number: 3, title: "Closed", author_login: "odo", state: "closed" },
				{ number: 4, title: "Not Odo", author_login: "quark", state: "open" },
			],
			deployments: [],
		});
		await putRepositories(db, "2", {
			repositoryId: "r2",
			full_name: "cubanx/defiant",
			pullRequests: [
				{
					number: 1,
					title: "Newest healthy",
					author_login: "odo",
					state: "open",
					checks_state: "success",
					updated_at: "2030-01-03T00:00:00Z",
				},
				{
					number: 2,
					title: "Needs attention",
					author_login: "odo",
					state: "open",
					checks_state: "failure",
					updated_at: "2030-01-02T00:00:00Z",
				},
			],
			deployments: [],
		});
		await putRepositories(db, "2", {
			repositoryId: "r3",
			full_name: "cubanx/local-only",
			pullRequests: [],
			deployments: [],
		});
		const dashboard = await dashboardForUser(db, "u");
		expect(dashboard.repositories).toContainEqual({
			installation_id: "2",
			account_login: "Crisp-Inc",
			repository_id: "r3",
			full_name: "cubanx/local-only",
		});
		expect(dashboard.pullRequests.map((pr) => [pr.number, pr.title, pr.needs_attention])).toEqual([
			[2, "Needs attention", true],
			[1, "Newest healthy", false],
			[1, "Older healthy", false],
		]);
		expect((await dashboardForUser(db, "other")).pullRequests).toEqual([]);
	}));

test("dashboard deduplicates renamed stable repositories and matches authors case-insensitively", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "Sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		await bindInstallation(db, "u", "2", "Crisp-Inc");
		await putRepositories(db, "1", {
			repositoryId: "r",
			full_name: "ds9/old",
			pullRequests: [
				{
					number: 1,
					title: "old",
					author_login: "sisko",
					state: "open",
					updated_at: "2030-01-01",
				},
			],
			deployments: [],
		});
		await putRepositories(
			db,
			"2",
			{
				repositoryId: "r",
				full_name: "ds9/new",
				pullRequests: [
					{
						number: 1,
						title: "new",
						author_login: "SISKO",
						state: "open",
						updated_at: "2030-01-02",
					},
				],
				deployments: [],
			},
			{
				repositoryId: "other",
				full_name: "ds9/old",
				pullRequests: [{ number: 1, title: "other", author_login: "SiSkO", state: "open" }],
				deployments: [],
			},
		);
		expect((await dashboardForUser(db, "u")).pullRequests.map((pr) => pr.title).sort()).toEqual(["new", "other"]);
	}));

test("local demo projections are deterministic and isolated", () =>
	withDatabase(async (db) => {
		await seedLocalDemo(db);
		await seedLocalDemo(db);
		const dashboard = await dashboardForUser(db, LOCAL_DEMO_USER.id);
		expect(dashboard.installationCount).toBe(1);
		expect(dashboard.pullRequests).toHaveLength(19);
		expect(dashboard.deployments).toHaveLength(3);
		expect(dashboard.user).toEqual({
			login: "sisko",
			fixture_avatar: true,
		});
		const defiantChecklist = dashboard.pullRequests.find((pr) => pr.title === "Restore the Defiant launch checklist");
		expect(defiantChecklist).toMatchObject({
			title: "Restore the Defiant launch checklist",
			url: "https://github.com/ds9/ops-console/pull/119",
			draft: 1,
		});
		expect(dashboard.pullRequests.find((pr) => pr.number === 118)).toMatchObject({
			title: "Tune the wormhole transit monitor",
			draft: 0,
			mergeable: "clean",
			review_state: "approved",
			checks_state: "success",
			workflow_state: "success",
			needs_attention: false,
		});
		expect(dashboard.pullRequests.find((pr) => pr.number === 117)).toMatchObject({
			title: "Add Bajoran calendar import",
			mergeable: "clean",
			review_state: "approved",
			checks_state: "success",
			workflow_state: "success",
			needs_attention: false,
		});
		expect(dashboard.pullRequests.find((pr) => pr.number === 116)).toMatchObject({
			title: "Retire obsolete docking alerts",
			draft: 0,
			mergeable: "clean",
			review_state: "approved",
			checks_state: "success",
			workflow_state: "failure",
			needs_attention: true,
		});
		expect(dashboard.pullRequests.find((pr) => pr.number === 115)).toMatchObject({
			title: "Harden the promenade inventory sync",
			mergeable: "clean",
			workflow_state: "success",
			needs_attention: true,
		});
	}));

test("dashboard prioritizes attention and sanitizes unsafe links", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const sha = "a".repeat(40),
			now = new Date("2030-01-03T00:00:00Z");
		await putRepositories(db, "1", {
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [
				{
					number: 1,
					title: "Urgent",
					author_login: "sisko",
					state: "open",
					checks_state: "failure",
					updated_at: "2030-01-01",
					url: "javascript:alert(1)",
					head_sha: sha,
					head_ref: "shared",
				},
				{
					number: 2,
					title: "Branch",
					author_login: "sisko",
					state: "open",
					updated_at: "2030-01-03",
					head_ref: "unique",
				},
				{
					number: 3,
					title: "Ambiguous branch",
					author_login: "sisko",
					state: "open",
					updated_at: "2030-01-02",
					head_ref: "shared",
				},
				{
					number: 4,
					title: "Ambiguous commit",
					author_login: "sisko",
					state: "open",
					updated_at: "2030-01-01T01:00:00Z",
					head_sha: sha,
					head_ref: "other",
				},
			],
			deployments: [
				{ id: "old", state: "success", updated_at: "2025-12-31T23:59:59Z" },
				{ id: "pending", state: "pending", updated_at: "2030-01-02T23:00:00Z" },
				{ id: "failure", state: "failure", updated_at: "2030-01-02T22:00:00Z" },
				{ id: "success", state: "success", updated_at: "2030-01-02T21:00:00Z" },
			],
		});
		const dashboard = await dashboardForUser(db, "u", now);
		expect(dashboard.pullRequests.map((pr) => pr.number)).toEqual([1, 2, 3, 4]);
		const pullRequests = new Map(dashboard.pullRequests.map((pr) => [pr.number, pr]));
		expect(pullRequests.get(1)).toMatchObject({ url: "https://github.com/ds9/ops/pull/1" });
		expect(dashboard.deployments.map((deployment) => deployment.id)).toEqual(["pending", "failure", "success"]);
	}));

test("identity upserts are atomic and preserve separate bindings", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "9", "kira");
		await bindInstallation(db, "9", "1", "cubanx");
		await Promise.all(
			Array.from({ length: 8 }, () => upsertIdentity(db, "9", "kira", "https://example.test/kira.png")),
		);
		expect(await db.users.countDocuments({ _id: "9" })).toBe(1);
		expect(await db.users.findOne({ _id: "9" })).toMatchObject({
			github: { login: "kira", avatarUrl: "https://example.test/kira.png" },
		});
		expect(await db.bindings.find({ userId: "9" }).toArray()).toMatchObject([{ installationId: "1" }]);
		expect(await db.users.findOne({ _id: "9" })).not.toHaveProperty("installations");
	}));
