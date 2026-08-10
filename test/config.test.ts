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

test("Railway mappings are strict operator configuration keyed by GitHub ID", () => {
  const mapping = { githubUserId: "1701", projectId: "bajor-orbital", serviceId: "promenade", environmentId: "alpha-quadrant" };
  expect(loadConfig({ RAILWAY_CONNECTIONS_JSON: JSON.stringify([mapping]) }).railwayConnections).toEqual([mapping]);
  for (const value of ["{}", "not-json", JSON.stringify([{ ...mapping, githubUserId: "sisko" }]), JSON.stringify([{ ...mapping, extra: "wormhole" }]), JSON.stringify([mapping, mapping])]) {
    expect(() => loadConfig({ RAILWAY_CONNECTIONS_JSON: value })).toThrow("RAILWAY_CONNECTIONS_JSON");
  }
  expect(() => loadConfig({ DCC_LOCAL_DEMO: "1", RAILWAY_CONNECTIONS_JSON: JSON.stringify([mapping]) })).toThrow("local demo");
});
