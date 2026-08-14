import { expect, test } from "vitest";
import { databaseName } from "#/db";
import { withDatabase } from "./mongo-support";

test("selects explicit and environment-scoped database names", () => {
	expect(databaseName({ MONGODB_DATABASE: "ds9-operations" })).toBe(
		"ds9-operations",
	);
	expect(databaseName({ NODE_ENV: "production" })).toBe(
		"dev-command-center-production",
	);
	expect(databaseName({ RAILWAY_ENVIRONMENT_NAME: "Review / 42" })).toBe(
		"dev-command-center-review---42",
	);
	expect(databaseName({ NODE_ENV: "test" })).toMatch(
		/^dev-command-center-test-/,
	);
	expect(databaseName({ USER: "Benjamin Sisko" })).toBe(
		"dev-command-center-local-benjamin-sisko",
	);
});

test("initializes required Mongo collections and indexes", () =>
	withDatabase(async (db) => {
		expect(
			(await db.mongo.listCollections().toArray()).map((item) => item.name),
		).toEqual(
			expect.arrayContaining([
				"users",
				"sessions",
				"oauth_states",
				"inbox_deliveries",
				"notifications",
			]),
		);
		expect(
			(await db.notifications.listIndexes().toArray()).some(
				(index) =>
					index.unique &&
					index.key.userId === 1 &&
					index.key.transitionKey === 1,
			),
		).toBe(true);
		for (const collection of [db.sessions, db.oauthStates])
			expect(
				(await collection.listIndexes().toArray()).some(
					(index) =>
						index.key.expiresAt === 1 && index.expireAfterSeconds === 0,
				),
			).toBe(true);
	}));
