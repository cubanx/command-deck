import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";

test("initializes durable projection tables", () => {
  const db = openDatabase();
  const names = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  expect(names).toEqual(expect.arrayContaining(["users", "sessions", "inbox_deliveries", "openspec_progress", "notifications"]));
  db.close();
});
