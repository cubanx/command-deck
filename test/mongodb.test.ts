import { expect, test } from "bun:test";
import { closeDatabase, databaseReady, initializeDatabase, openDatabase, testDatabaseGuard } from "../src/db";

test("MongoDB test guard rejects production and ambiguous databases", () => {
  expect(() => testDatabaseGuard("dev-command-center-test-12345678-1234-1234-1234-123456789abc")).not.toThrow();
  expect(() => testDatabaseGuard("dev-command-center-local-kira")).toThrow("isolated non-production");
  expect(() => testDatabaseGuard("dev-command-center-production")).toThrow("isolated non-production");
});

test.skipIf(!process.env.MONGODB_URI_BASE || !process.env.MONGODB_DATABASE)("MongoDB connects and initializes indexes idempotently against the guarded integration database", async () => {
  const uriBase = process.env.MONGODB_URI_BASE;
  const database = process.env.MONGODB_DATABASE;
  if (!uriBase || !database) throw new Error("MONGODB_URI_BASE and MONGODB_DATABASE are required for MongoDB integration tests");
  testDatabaseGuard(database);
  const db = await openDatabase({ uriBase, database });
  try {
    await initializeDatabase(db);
    await databaseReady(db);
    expect((await db.notifications.listIndexes().toArray()).some((index) => index.name === "userId_1_transitionKey_1")).toBeTrue();
  } finally {
    await db.mongo.dropDatabase();
    await closeDatabase(db);
  }
});
