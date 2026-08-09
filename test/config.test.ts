import { expect, test } from "bun:test";
import { loadConfig } from "../src/config";

test("validates runtime ports and reconciliation interval", () => {
  expect(() => loadConfig({ PORT: "0" })).toThrow("valid TCP port");
  expect(() => loadConfig({ RECONCILE_INTERVAL_MS: "1" })).toThrow("at least 60000");
  expect(loadConfig({}).port).toBe(3000);
});

test("local demo is loopback-only and rejected in hosted environments", () => {
  expect(loadConfig({ DCC_LOCAL_DEMO: "1", NODE_ENV: "development" })).toMatchObject({
    localDemo: true,
    hostname: "127.0.0.1"
  });
  expect(() => loadConfig({ DCC_LOCAL_DEMO: "1", NODE_ENV: "production" })).toThrow("local demo");
  expect(() => loadConfig({ DCC_LOCAL_DEMO: "1", RAILWAY_ENVIRONMENT_ID: "ds9" })).toThrow("local demo");
});

test("automated review signals are configured together", () => {
  expect(() => loadConfig({ GITHUB_REVIEW_BOT_LOGIN: "claude[bot]" })).toThrow("review bot");
  expect(loadConfig({
    GITHUB_REVIEW_BOT_LOGIN: "claude[bot]",
    GITHUB_REVIEW_BOT_START_MARKER: "started review",
    GITHUB_REVIEW_BOT_DONE_MARKER: "review complete"
  }).reviewBot).toEqual({ login: "claude[bot]", startMarker: "started review", doneMarker: "review complete" });
});
