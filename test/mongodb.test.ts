import { expect, test, vi } from "vitest";
import { closeDatabase, databaseReady, initializeDatabase, openDatabase, testDatabaseGuard } from "#/db";
import { drainInbox } from "#/events";
import { withDatabase } from "./mongo-support";

test("inbox drain can use index ordering while preserving eligibility", async () => {
	await withDatabase(async (db) => {
		await initializeDatabase(db);
		const current = new Date("2026-09-11T19:00:00Z");
		await db.inboxDeliveries.insertMany(
			["quark", "kira", "odo", "sisko", "dax"].map((name, index) => ({
				_id: name,
				provider: "ferengi",
				deliveryId: name,
				eventName: "trade",
				status:
					index === 3
						? ("done" as const)
						: index === 1 || index === 4
							? ("pending_verification" as const)
							: ("pending" as const),
				attempts: index === 4 ? 3 : 0,
				receivedAt: new Date(current.getTime() - index * 1000),
				...(index === 1
					? { nextAttemptAt: current }
					: index === 4
						? { nextAttemptAt: new Date(current.getTime() + 60_000) }
						: {}),
			})),
		);
		const find = db.inboxDeliveries.find.bind(db.inboxDeliveries);
		const selection = vi.spyOn(db.inboxDeliveries, "find").mockImplementationOnce((...args) => {
			const cursor = find(...args);
			const toArray = cursor.toArray.bind(cursor);
			vi.spyOn(cursor, "toArray").mockImplementationOnce(async () => {
				const { queryPlanner } = await cursor.clone().explain("queryPlanner");
				const plans = [queryPlanner.winningPlan, ...queryPlanner.rejectedPlans].map((plan) => JSON.stringify(plan));
				expect(
					plans.some((plan) => plan.includes('"indexName":"receivedAt_1"') && !plan.includes('"stage":"SORT"')),
				).toBe(true);
				const rows = await toArray();
				expect(rows.map((row) => row._id)).toEqual(["odo", "kira", "quark"]);
				return rows;
			});
			return cursor;
		});
		try {
			await drainInbox(
				db,
				undefined,
				undefined,
				async () => {},
				() => current,
			);
			expect(selection).toHaveBeenCalled();
			expect((await db.inboxDeliveries.listIndexes().toArray()).map((index) => index.key)).toEqual(
				expect.arrayContaining([{ status: 1, nextAttemptAt: 1 }, { receivedAt: 1 }]),
			);
		} finally {
			selection.mockRestore();
		}
	});
});

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
