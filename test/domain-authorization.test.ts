import { expect, test } from "vitest";
import { bindInstallation, dashboardForUser, upsertIdentity } from "#/access";
import { withDatabase } from "./mongo-support";

test("shared repository access follows active bindings and installation state", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await upsertIdentity(db, "1702", "kira");
		await upsertIdentity(db, "1703", "quark");
		await bindInstallation(db, "1701", "42", "cubanx");
		await bindInstallation(db, "1702", "42", "cubanx");
		await db.repositories.insertOne({
			_id: "301",
			repositoryId: "301",
			full_name: "ds9/defiant",
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
		expect((await dashboardForUser(db, "1701")).pullRequests).toHaveLength(1);
		expect((await dashboardForUser(db, "1702")).repositories).toHaveLength(1);
		expect((await dashboardForUser(db, "1702")).pullRequests).toHaveLength(0);
		expect((await dashboardForUser(db, "1703")).repositories).toHaveLength(0);
		await db.installations.updateOne({ _id: "42" }, { $set: { suspended: true } });
		expect((await dashboardForUser(db, "1701")).repositories).toHaveLength(0);
		expect((await dashboardForUser(db, "1701")).pullRequests).toHaveLength(0);
		await db.installations.updateOne({ _id: "42" }, { $set: { suspended: false, active: false } });
		expect((await dashboardForUser(db, "1701")).repositories).toHaveLength(0);
		await db.installations.updateOne({ _id: "42" }, { $set: { active: true } });
		await db.bindings.deleteMany({ userId: "1701" });
		expect((await dashboardForUser(db, "1701")).repositories).toHaveLength(0);
		expect((await dashboardForUser(db, "1702")).repositories).toHaveLength(1);
		await db.repositories.updateOne({ _id: "301" }, { $set: { installationIds: [] } });
		expect((await dashboardForUser(db, "1702")).repositories).toHaveLength(0);
	}));

test("a disallowed installation cannot supply displayed permissions on a shared repository", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await bindInstallation(db, "1701", "42", "cubanx");
		await bindInstallation(db, "1701", "43", "Crisp-Inc");
		await db.installations.updateOne(
			{ _id: "42" },
			{ $set: { accountLogin: "ferengi-alliance", permissions: { pull_requests: "write" } } },
		);
		await db.installations.updateOne({ _id: "43" }, { $set: { permissions: { pull_requests: "read" } } });
		await db.repositories.insertOne({
			_id: "301",
			repositoryId: "301",
			full_name: "ds9/defiant",
			installationIds: ["42", "43"],
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
		const dashboard = await dashboardForUser(db, "1701");
		expect(dashboard.repositories).toMatchObject([{ installation_id: "43", account_login: "Crisp-Inc" }]);
		expect(dashboard.pullRequests).toMatchObject([{ installation_id: "43", installation_pull_requests: "read" }]);
		expect(dashboard.installationCount).toBe(1);
	}));
