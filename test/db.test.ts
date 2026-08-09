import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";

test("initializes durable projection tables", () => {
  const db = openDatabase();
  const names = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name);
  expect(names).toEqual(expect.arrayContaining(["users", "sessions", "inbox_deliveries", "openspec_progress", "notifications"]));
  expect(db.query<{ name: string }, []>("PRAGMA table_info(openspec_progress)").all().map((row) => row.name)).toContain("active_group");
  expect(db.query<{ name: string }, []>("PRAGMA table_info(openspec_progress)").all().map((row) => row.name)).toContain("source_ref");
  expect(db.query<{ name: string }, []>("PRAGMA table_info(pull_requests)").all().map((row) => row.name)).toEqual(expect.arrayContaining(["draft", "head_ref", "head_sha", "bot_review_actor", "bot_review_state", "bot_review_updated_at"]));
  db.close();
});
