import { expect, test } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import { initializeDatabase, upsertPullRequest } from "#/db";
import { withDatabase } from "./mongo-support";

test("identity, installation, binding, repository, pull request, and deployment are separate documents", () =>
	withDatabase(async (db) => {
		await initializeDatabase(db);
		await upsertIdentity(db, "1701", "sisko", "https://avatars.example.test/sisko.png");
		await bindInstallation(db, "1701", "42", "cubanx");
		await db.repositories.insertOne({
			_id: "301",
			repositoryId: "301",
			full_name: "ds9/ops-console",
			installationIds: ["42"],
			updatedAt: new Date(),
		});
		await db.pullRequests.insertOne({
			_id: "301:7",
			repositoryId: "301",
			number: 7,
			state: "open",
			author_login: "sisko",
			updatedAt: new Date(),
		});
		await db.deployments.insertOne({
			_id: "301:9",
			repositoryId: "301",
			deploymentId: "9",
			state: "success",
			updated_at: new Date().toISOString(),
			updatedAt: new Date(),
		});
		expect(await db.users.findOne({ _id: "1701" })).toMatchObject({ _id: "1701", github: { login: "sisko" } });
		expect(await db.users.findOne({ _id: "1701" })).not.toHaveProperty("installations");
		expect(await db.installations.findOne({ _id: "42" })).toMatchObject({
			installationId: "42",
			accountLogin: "cubanx",
		});
		expect(await db.bindings.findOne({ userId: "1701", installationId: "42" })).toBeTruthy();
		expect(await db.pullRequests.countDocuments({ repositoryId: "301" })).toBe(1);
		expect(await db.deployments.countDocuments({ repositoryId: "301" })).toBe(1);
	}));

test("shared installations fan out one PR document and reject stale replay without user writes", () =>
	withDatabase(async (db) => {
		await initializeDatabase(db);
		await upsertIdentity(db, "1701", "sisko");
		await upsertIdentity(db, "1702", "kira");
		await bindInstallation(db, "1701", "42", "cubanx");
		await bindInstallation(db, "1702", "42", "cubanx");
		await db.repositories.insertOne({
			_id: "301",
			repositoryId: "301",
			full_name: "ds9/ops-console",
			installationIds: ["42"],
			updatedAt: new Date(),
		});
		const updateUser = db.users.updateOne.bind(db.users);
		let userWrites = 0;
		db.users.updateOne = (async (...args: Parameters<typeof db.users.updateOne>) => {
			userWrites++;
			return updateUser(...args);
		}) as typeof db.users.updateOne;
		const newer = new Date("2026-09-13T20:00:00Z");
		await upsertPullRequest(db, {
			repositoryId: "301",
			number: 7,
			title: "new",
			author_login: "sisko",
			state: "open",
			updated_at: newer.toISOString(),
		});
		await upsertPullRequest(db, {
			repositoryId: "301",
			number: 7,
			title: "old",
			author_login: "sisko",
			state: "open",
			updated_at: "2026-09-13T19:00:00Z",
		});
		expect(userWrites).toBe(0);
		expect(await db.pullRequests.findOne({ _id: "301:7" })).toMatchObject({ title: "new" });
		expect((await (await import("#/access")).dashboardForUser(db, "1701")).pullRequests).toHaveLength(1);
		expect((await (await import("#/access")).dashboardForUser(db, "1702")).pullRequests).toHaveLength(0);
	}));
