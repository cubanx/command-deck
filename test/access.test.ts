import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { bindInstallation, createOAuthState, createSession, dashboardForSession, consumeOAuthState, sessionUser } from "../src/access";

test("OAuth state is one-time and expires", () => {
  const db = openDatabase();
  const state = createOAuthState(db, new Date("2030-01-01"));
  expect(consumeOAuthState(db, state, new Date("2029-01-01"))).toBeTrue();
  expect(consumeOAuthState(db, state, new Date("2029-01-01"))).toBeFalse();
  const expired = createOAuthState(db, new Date("2020-01-01"));
  expect(consumeOAuthState(db, expired, new Date("2021-01-01"))).toBeFalse();
});

test("sessions are hashed, expire, and dashboard rows never cross bindings", () => {
  const db = openDatabase();
  db.query("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u1", "1", "sisko");
  db.query("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u2", "2", "kira");
  bindInstallation(db, "u1", "i1"); bindInstallation(db, "u2", "i2");
  db.query("INSERT INTO pull_requests (installation_id, repository_id, number, title, author_login, state) VALUES (?, ?, ?, ?, ?, ?)").run("i1", "r", 1, "Defend the wormhole", "sisko", "open");
  db.query("INSERT INTO pull_requests (installation_id, repository_id, number, title, state) VALUES (?, ?, ?, ?, ?)").run("i2", "r", 2, "Runabout repairs", "open");
  const { token } = createSession(db, "u1", new Date("2030-01-01"));
  expect(db.query("SELECT token_hash FROM sessions").get()!.token_hash).not.toBe(token);
  expect(sessionUser(db, token, new Date("2029-01-01"))?.id).toBe("u1");
  expect(dashboardForSession(db, token, new Date("2029-01-01")).pullRequests.map((pr) => pr.number)).toEqual([1]);
  expect(sessionUser(db, token, new Date("2031-01-01"))).toBeNull();
});
