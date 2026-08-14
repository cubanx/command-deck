import { expect, test } from "bun:test";
import { withDatabase } from "./mongo-support";

test("initializes required Mongo collections and indexes", () => withDatabase(async (db) => {
  expect((await db.mongo.listCollections().toArray()).map((item) => item.name)).toEqual(expect.arrayContaining(["users", "sessions", "oauth_states", "inbox_deliveries", "notifications"]));
  expect((await db.notifications.listIndexes().toArray()).some((index) => index.unique && index.key.userId === 1 && index.key.transitionKey === 1)).toBeTrue();
  for (const collection of [db.sessions, db.oauthStates]) expect((await collection.listIndexes().toArray()).some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0)).toBeTrue();
}));
