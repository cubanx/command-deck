import {
	closeDatabase,
	type Db,
	initializeDatabase,
	openDatabase,
	testDatabaseGuard,
} from "#/db";

export async function withDatabase(test: (db: Db) => Promise<void>) {
	const uriBase = process.env.MONGODB_URI_BASE;
	if (!uriBase)
		throw new Error("MONGODB_URI_BASE is required for MongoDB tests");
	const database = `dev-command-center-test-${crypto.randomUUID()}`;
	testDatabaseGuard(database);
	const db = await openDatabase({ uriBase, database });
	try {
		await initializeDatabase(db);
		await test(db);
	} finally {
		try {
			await db.mongo.dropDatabase();
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!error.message.includes("Client must be connected")
			)
				console.error(
					"MongoDB test cleanup failed",
					error instanceof Error ? error.message : "unknown error",
				);
		}
		await closeDatabase(db);
	}
}

export const testConfig = {
	port: 0,
	mongoUriBase: "mongodb://127.0.0.1:27018",
	mongoDatabase: "dev-command-center-test",
	localDemo: false,
	production: false,
	secureCookies: true,
};
