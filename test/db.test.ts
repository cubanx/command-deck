import { expect, test } from "vitest";
import { databaseName, mongoConfig } from "#/db";
import { withDatabase } from "./mongo-support";

test("selects explicit and environment-scoped database names", () => {
	expect(databaseName({ MONGODB_DATABASE: "ds9-operations" })).toBe(
		"ds9-operations",
	);
	expect(databaseName({ NODE_ENV: "production" })).toBe(
		"command-center-ai-production",
	);
	expect(databaseName({ RAILWAY_ENVIRONMENT_NAME: "Review / 42" })).toBe(
		"command-center-ai-review---42",
	);
	expect(databaseName({ NODE_ENV: "test" })).toMatch(
		/^command-center-ai-test-/,
	);
	expect(databaseName({ USER: "Benjamin Sisko" })).toBe(
		"command-center-ai-local-benjamin-sisko",
	);
});

test("production MongoDB configuration accepts only the canonical database", () => {
	expect(
		mongoConfig({
			NODE_ENV: "production",
			MONGODB_URI_BASE: "mongodb://mongo.example",
			MONGODB_DATABASE: "command-center-ai-production",
		}),
	).toMatchObject({ database: "command-center-ai-production" });
	expect(() =>
		mongoConfig({
			NODE_ENV: "production",
			MONGODB_URI_BASE: "mongodb://mongo.example",
			MONGODB_DATABASE: ["dev", "command", "center", "production"].join("-"),
		}),
	).toThrow("command-center-ai-production");
});

test("Railway MongoDB configuration accepts only its environment database", () => {
	const env = {
		MONGODB_URI_BASE: "mongodb://mongo.example",
		RAILWAY_ENVIRONMENT_NAME: "Review / 42",
	};
	expect(mongoConfig(env)).toMatchObject({
		database: "command-center-ai-review---42",
	});
	expect(() =>
		mongoConfig({ ...env, MONGODB_DATABASE: "arbitrary-valid" }),
	).toThrow("command-center-ai-review---42");
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
