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
	seedBindings,
	seedLocalDemo,
	sessionUser,
	upsertIdentity,
} from "#/access";
import { mutateUser } from "#/db";
import { withDatabase } from "./mongo-support";

test("OAuth state is one-time and expires", () =>
	withDatabase(async (db) => {
		const state = await createOAuthState(db, new Date("2030-01-01"));
		expect((await db.oauthStates.findOne({}))?._id).not.toBe(state);
		expect(await consumeOAuthState(db, state, new Date("2029-01-01"))).toBe(
			true,
		);
		expect(await consumeOAuthState(db, state, new Date("2029-01-01"))).toBe(
			false,
		);
		const expired = await createOAuthState(db, new Date("2020-01-01"));
		expect(await consumeOAuthState(db, expired, new Date("2021-01-01"))).toBe(
			false,
		);
	}));

test("sessions are hashed, expire, and dashboard identity never crosses users", () =>
	withDatabase(async (db) => {
		await upsertIdentity(
			db,
			"u1",
			"sisko",
			"https://avatars.githubusercontent.com/u/100?v=4",
		);
		await upsertIdentity(
			db,
			"u2",
			"kira",
			"https://avatars.githubusercontent.com/u/200?v=4",
		);
		await bindInstallation(db, "u1", "i1", "cubanx");
		await bindInstallation(db, "u2", "i2", "cubanx");
		const user = await db.users.findOne({ _id: "u1" });
		user?.installations[0]?.repositories.push({
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
			openSpecs: [],
			deployments: [],
		});
		await db.users.replaceOne({ _id: "u1" }, user!);
		const { token } = await createSession(db, "u1", new Date("2030-01-01"));
		expect((await db.sessions.findOne({}))?._id).not.toBe(token);
		expect((await sessionUser(db, token, new Date("2029-01-01")))?.id).toBe(
			"u1",
		);
		const dashboard = await dashboardForSession(
			db,
			token,
			new Date("2029-01-01"),
		);
		expect(dashboard.pullRequests.map((pr: any) => pr.number)).toEqual([1]);
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
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
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
			openSpecs: [],
			deployments: [],
		});
		user?.installations[1]?.repositories.push({
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
			openSpecs: [],
			deployments: [],
		});
		user?.installations[1]?.repositories.push({
			repositoryId: "r3",
			full_name: "cubanx/local-only",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const dashboard = await dashboardForUser(db, "u");
		expect(dashboard.repositories).toContainEqual({
			installation_id: "2",
			account_login: "Crisp-Inc",
			repository_id: "r3",
			full_name: "cubanx/local-only",
		});
		expect(
			dashboard.pullRequests.map((pr: any) => [
				pr.number,
				pr.title,
				pr.needs_attention,
			]),
		).toEqual([
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
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
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
			openSpecs: [],
			deployments: [],
		});
		user?.installations[1]?.repositories.push(
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
				openSpecs: [],
				deployments: [],
			},
			{
				repositoryId: "other",
				full_name: "ds9/old",
				pullRequests: [
					{ number: 1, title: "other", author_login: "SiSkO", state: "open" },
				],
				openSpecs: [],
				deployments: [],
			},
		);
		await db.users.replaceOne({ _id: "u" }, user!);
		expect(
			(await dashboardForUser(db, "u")).pullRequests
				.map((pr: any) => pr.title)
				.sort(),
		).toEqual(["new", "other"]);
	}));

test("local demo projections are deterministic and isolated", () =>
	withDatabase(async (db) => {
		await seedLocalDemo(db);
		await seedLocalDemo(db);
		const dashboard = await dashboardForUser(db, LOCAL_DEMO_USER.id);
		expect(dashboard.installationCount).toBe(1);
		expect(dashboard.pullRequests).toHaveLength(5);
		expect(dashboard.deployments).toHaveLength(3);
		expect(dashboard.notifications).toHaveLength(1);
		expect(dashboard.user).toEqual({
			login: "sisko",
			fixture_avatar: true,
		});
		expect(
			dashboard.pullRequests.find((pr: any) => pr.number === 1),
		).toMatchObject({
			title: "Build developer command center MVP",
			url: "https://github.com/cubanx/dev-command-center/pull/1",
			draft: 1,
			bot_review_state: "in_progress",
			workflow_failures: [
				{
					name: "Local demo workflow",
					url: "https://github.com/cubanx/dev-command-center/actions/runs/1",
				},
			],
			open_spec: {
				change_name: "build-developer-command-center-mvp",
				completed: 26,
				total: 27,
			},
		});
		expect(
			dashboard.pullRequests.find((pr: any) => pr.number === 2),
		).toMatchObject({
			draft: false,
			mergeable: "unknown",
			review_state: "approved",
			checks_state: "success",
			workflow_state: "success",
			needs_attention: false,
		});
		expect(
			dashboard.pullRequests.find((pr: any) => pr.number === 3),
		).toMatchObject({
			mergeable: "clean",
			review_state: "approved",
			checks_state: "success",
			workflow_state: "success",
			needs_attention: false,
		});
		expect(
			dashboard.pullRequests.find((pr: any) => pr.number === 4),
		).toMatchObject({
			draft: false,
			mergeable: "unknown",
			review_state: "changes_requested",
			checks_state: "success",
			workflow_state: "success",
			needs_attention: true,
		});
		expect(
			dashboard.pullRequests.find((pr: any) => pr.number === 5),
		).toMatchObject({
			mergeable: "clean",
			workflow_state: "failure",
			workflow_failures: [
				{
					name: "Merge readiness",
					url: "https://github.com/cubanx/dev-command-center/actions/runs/5",
				},
			],
			needs_attention: true,
		});
	}));

test("dashboard prioritizes attention and correlates OpenSpecs without unsafe or ambiguous links", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const user = await db.users.findOne({ _id: "u" }),
			sha = "a".repeat(40),
			now = new Date("2030-01-03T00:00:00Z");
		user?.installations[0]?.repositories.push({
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
			openSpecs: [
				{
					change_name: "sha-match",
					completed: 2,
					total: 2,
					source_commit: sha,
					source_ref: "other",
				},
				{
					change_name: "branch-match",
					completed: 2,
					total: 2,
					source_ref: "unique",
				},
				{
					change_name: "ambiguous-a",
					completed: 2,
					total: 2,
					source_ref: "shared",
				},
				{
					change_name: "ambiguous-b",
					completed: 2,
					total: 2,
					source_ref: "shared",
				},
			],
			deployments: [
				{ id: "old", state: "success", updated_at: "2025-12-31T23:59:59Z" },
				{ id: "pending", state: "pending", updated_at: "2030-01-02T23:00:00Z" },
				{ id: "failure", state: "failure", updated_at: "2030-01-02T22:00:00Z" },
				{ id: "success", state: "success", updated_at: "2030-01-02T21:00:00Z" },
			],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const dashboard = await dashboardForUser(db, "u", now);
		expect(dashboard.pullRequests.map((pr: any) => pr.number)).toEqual([
			1, 2, 3, 4,
		]);
		const pullRequests = new Map(
			dashboard.pullRequests.map((pr: any) => [pr.number, pr]),
		);
		expect(pullRequests.get(1)).toMatchObject({
			url: "https://github.com/ds9/ops/pull/1",
			open_spec: null,
		});
		expect(pullRequests.get(2)?.open_spec).toMatchObject({
			change_name: "branch-match",
		});
		expect(pullRequests.get(3)?.open_spec).toBeNull();
		expect(pullRequests.get(4)?.open_spec).toBeNull();
		expect(
			dashboard.deployments.map((deployment: any) => deployment.id),
		).toEqual(["pending", "failure", "success"]);
	}));

test("operational collection identities and binding seeds are idempotent", () =>
	withDatabase(async (db) => {
		await seedBindings(db, {
			userId: "9",
			bindings: [
				{ installationId: "1", accountLogin: "cubanx" },
				{ installationId: "2", accountLogin: "Crisp-Inc" },
			],
		});
		await seedBindings(db, {
			userId: "9",
			bindings: [{ installationId: "1", accountLogin: "cubanx" }],
		});
		expect((await db.users.findOne({ _id: "9" }))?.installations).toHaveLength(
			2,
		);
		await upsertIdentity(db, "10", "kira");
		await bindInstallation(db, "10", "3", "hudson-law");
		await seedBindings(db, {
			userId: "10",
			bindings: [{ installationId: "3", accountLogin: "hudson-law" }],
		});
		expect(
			(await db.users.findOne({ _id: "10" }))?.installations,
		).toMatchObject([{ installationId: "3", accountLogin: "hudson-law" }]);
		await expect(
			seedBindings(db, {
				userId: "9",
				bindings: [
					{ installationId: "1", accountLogin: "cubanx" },
					{ installationId: "1", accountLogin: "cubanx" },
				],
			}),
		).rejects.toThrow("invalid binding seed");
		await seedBindings(db, {
			userId: "9",
			bindings: [{ installationId: "3", accountLogin: "crisp-inc" }],
		});
		const before = await db.users.findOne({ _id: "9" });
		await expect(
			seedBindings(db, {
				userId: "9",
				bindings: [
					{ installationId: "3", accountLogin: "hudson-law" },
					{ installationId: "1", accountLogin: "Crisp-Inc" },
				],
			}),
		).rejects.toThrow("conflicting binding seed");
		await expect(
			seedBindings(db, {
				userId: "not-a-github-id",
				bindings: [{ installationId: "3", accountLogin: "hudson-law" }],
			}),
		).rejects.toThrow("invalid binding seed");
		await expect(
			seedBindings(db, {
				userId: "9",
				bindings: [
					{ installationId: "3", accountLogin: "hudson-law" },
					{ installationId: "not-an-installation", accountLogin: "hudson-law" },
				],
			}),
		).rejects.toThrow("invalid binding seed");
		expect((await db.users.findOne({ _id: "9" }))?.installations).toEqual(
			before?.installations,
		);
		await db.inboxDeliveries.insertOne({
			_id: "github:d1",
			provider: "github",
			deliveryId: "d1",
			eventName: "push",
			status: "pending",
			attempts: 0,
			receivedAt: new Date(),
		});
		await expect(
			db.inboxDeliveries.insertOne({
				_id: "github:d1",
				provider: "github",
				deliveryId: "d1",
				eventName: "push",
				status: "pending",
				attempts: 0,
				receivedAt: new Date(),
			}),
		).rejects.toMatchObject({ code: 11000 });
		await db.notifications.insertOne({
			_id: "n1",
			userId: "9",
			transitionKey: "transition",
			title: "Title",
			body: "Body",
			createdAt: new Date(),
		});
		await expect(
			db.notifications.insertOne({
				_id: "n2",
				userId: "9",
				transitionKey: "transition",
				title: "Title",
				body: "Body",
				createdAt: new Date(),
			}),
		).rejects.toMatchObject({ code: 11000 });
	}));

test("aggregate CAS preserves concurrent data and rejects oversized replacement", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "9", "kira");
		await bindInstallation(db, "9", "1", "cubanx");
		await mutateUser(db, "9", (user) => {
			user.installations[0]?.repositories.push({
				repositoryId: "r",
				full_name: "ds9/ops",
				pullRequests: [{ number: 1 }],
				openSpecs: [],
				deployments: [],
			});
		});
		expect(
			(await db.users.findOne({ _id: "9" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(1);
		await expect(
			mutateUser(db, "9", (user) => {
				user.github.avatarUrl = "x".repeat(13 * 1024 * 1024);
			}),
		).rejects.toThrow("user 9 installations 1 exceeds");
		expect(
			(await db.users.findOne({ _id: "9" }))?.github.avatarUrl,
		).toBeUndefined();
	}));

test("identity upserts are atomic and preserve seeded bindings", () =>
	withDatabase(async (db) => {
		await seedBindings(db, {
			userId: "9",
			bindings: [{ installationId: "1", accountLogin: "cubanx" }],
		});
		await Promise.all(
			Array.from({ length: 8 }, () =>
				upsertIdentity(db, "9", "kira", "https://example.test/kira.png"),
			),
		);
		expect(await db.users.countDocuments({ _id: "9" })).toBe(1);
		expect(await db.users.findOne({ _id: "9" })).toMatchObject({
			revision: 8,
			github: { login: "kira", avatarUrl: "https://example.test/kira.png" },
			installations: [{ installationId: "1", accountLogin: "cubanx" }],
		});
	}));

test("aggregate CAS retries conflicts and preserves multiple bindings", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "kira");
		await bindInstallation(db, "u", "1", "cubanx");
		await bindInstallation(db, "u", "2", "cubanx");
		const original = db.users.replaceOne.bind(db.users) as (
			...args: Parameters<typeof db.users.replaceOne>
		) => ReturnType<typeof db.users.replaceOne>;
		let conflicts = 0;
		(db.users as any).replaceOne = async (
			...args: Parameters<typeof db.users.replaceOne>
		) => {
			if (conflicts++ === 0) return { modifiedCount: 0 };
			return original(...args);
		};
		await mutateUser(db, "u", (user) => {
			user.github.avatarUrl = "https://example.test/avatar";
		});
		expect((await db.users.findOne({ _id: "u" }))?.installations).toHaveLength(
			2,
		);
		expect(conflicts).toBe(2);
		(db.users as any).replaceOne = async () => ({ modifiedCount: 0 });
		await expect(mutateUser(db, "u", () => {})).rejects.toThrow(
			"changed concurrently",
		);
		(db.users as any).replaceOne = original;
	}));

test("notifications are user-scoped, newest first, and bounded", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u1", "sisko");
		await upsertIdentity(db, "u2", "kira");
		for (let index = 0; index < 21; index++)
			await db.notifications.insertOne({
				_id: `n${index}`,
				userId: "u1",
				transitionKey: `t${index}`,
				title: "Deployment",
				body: "Detail",
				link: `https://example.test/${index}`,
				createdAt: new Date(1_700_000_000_000 + index),
			});
		await expect(
			db.notifications.insertOne({
				_id: "duplicate",
				userId: "u1",
				transitionKey: "t1",
				title: "Deployment",
				body: "Detail",
				createdAt: new Date(),
			}),
		).rejects.toMatchObject({ code: 11000 });
		await db.notifications.insertOne({
			_id: "other",
			userId: "u2",
			transitionKey: "t1",
			title: "Other",
			body: "Other",
			createdAt: new Date(),
		});
		const notifications = (await dashboardForUser(db, "u1")).notifications;
		expect(notifications).toHaveLength(20);
		expect(notifications[0]).toMatchObject({
			_id: "n20",
			link: "https://example.test/20",
		});
		expect(notifications.some((item) => item._id === "other")).toBe(false);
	}));
