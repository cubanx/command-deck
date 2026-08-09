import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { acceptRailwayHint, drainInbox, parseRailwayHint } from "../src/events";

test("Railway hints require a complete shape and an authoritative match before state", async () => {
  const db = openDatabase();
  expect(parseRailwayHint('{"projectId":"p"}')).toBeNull();
  acceptRailwayHint(db, "bad", '{"projectId":"p"}');
  await drainInbox(db, async () => ({ status: "SUCCESS" }));
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='bad'").get()!.status).toBe("rejected");
  acceptRailwayHint(db, "pending", '{"resource":{"project":{"id":"p"},"service":{"id":"s"},"environment":{"id":"e"},"deployment":{"id":"d"}}}');
  await drainInbox(db, async () => null);
  expect(db.query("SELECT count(*) AS count FROM deployments").get()!.count).toBe(0);
  expect(db.query("SELECT status FROM inbox_deliveries WHERE delivery_id='pending'").get()!.status).toBe("pending_verification");
  await drainInbox(db, async () => ({ status: "SUCCESS" }));
  expect(db.query("SELECT verification_state FROM deployments").get()!.verification_state).toBe("verified");
});
