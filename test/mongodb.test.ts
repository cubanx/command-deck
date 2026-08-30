import { expect, test } from "vitest";
import { closeDatabase, databaseReady, initializeDatabase, openDatabase, testDatabaseGuard } from "#/db";

test("MongoDB test guard rejects production and ambiguous databases", () => {
	expect(() => testDatabaseGuard("command-center-ai-test-12345678-1234-1234-1234-123456789abc")).not.toThrow();
	expect(() => testDatabaseGuard("command-center-ai-local-kira")).toThrow("isolated non-production");
	expect(() => testDatabaseGuard("command-center-ai-production")).toThrow("isolated non-production");
	expect(() =>
		testDatabaseGuard(["dev", "command", "center", "test", "12345678-1234-1234-1234-123456789abc"].join("-")),
	).toThrow("isolated non-production");
});

test.skipIf(!process.env.MONGODB_URI_BASE)(
	"MongoDB connects and initializes indexes idempotently against the guarded integration database",
	async () => {
		const uriBase = process.env.MONGODB_URI_BASE;
		const database = `command-center-ai-test-${crypto.randomUUID()}`;
		if (!uriBase) throw new Error("MONGODB_URI_BASE is required for MongoDB integration tests");
		testDatabaseGuard(database);
		const db = await openDatabase({ uriBase, database });
		try {
			await initializeDatabase(db);
			await databaseReady(db);
			expect(
				(await db.notifications.listIndexes().toArray()).some((index) => index.name === "userId_1_transitionKey_1"),
			).toBe(true);
		} finally {
			await db.mongo.dropDatabase();
			await closeDatabase(db);
		}
	},
);
