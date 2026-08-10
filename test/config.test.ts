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

const production = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production", PORT: "3000", PUBLIC_URL: "https://command-center.up.railway.app", RAILWAY_PUBLIC_DOMAIN: "command-center.up.railway.app",
  RAILWAY_VOLUME_MOUNT_PATH: "/data", DATABASE_PATH: "/data/command-center.sqlite", GITHUB_APP_ID: "1701", GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret", GITHUB_APP_PRIVATE_KEY: "private-key", GITHUB_WEBHOOK_SECRET: "webhook-secret", RAILWAY_API_TOKEN: "railway-token",
  RAILWAY_CONNECTIONS_JSON: JSON.stringify([{ githubUserId: "1701", projectId: "bajor", serviceId: "promenade", environmentId: "prod" }]), ...overrides
});

test("production requires real secrets, one HTTPS Railway origin, and secure cookies", () => {
  expect(loadConfig(production())).toMatchObject({ production: true, publicUrl: "https://command-center.up.railway.app", oauthCallbackUrl: "https://command-center.up.railway.app/auth/github/callback", secureCookies: true });
  for (const env of [production({ GITHUB_CLIENT_SECRET: undefined }), production({ GITHUB_WEBHOOK_SECRET: "changeme" }), production({ PUBLIC_URL: "http://command-center.up.railway.app" }), production({ PUBLIC_URL: "https://elsewhere.up.railway.app" })]) {
    expect(() => loadConfig(env)).toThrow();
  }
});

test("production SQLite stays inside the Railway volume", () => {
  for (const env of [production({ RAILWAY_VOLUME_MOUNT_PATH: undefined }), production({ DATABASE_PATH: ":memory:" }), production({ DATABASE_PATH: "data.sqlite" }), production({ DATABASE_PATH: "/tmp/data.sqlite" }), production({ DATABASE_PATH: "/data/../tmp/data.sqlite" })]) {
    expect(() => loadConfig(env)).toThrow("DATABASE_PATH");
  }
});

test("production Railway mappings reject only exact duplicate identities without echoing values", () => {
  const mapping = { githubUserId: "1701", projectId: "bajor", serviceId: "promenade", environmentId: "prod" };
  expect(loadConfig(production({ RAILWAY_CONNECTIONS_JSON: JSON.stringify([{ ...mapping }, { ...mapping, projectId: "cardassia" }]) })).railwayConnections).toHaveLength(2);
  for (const value of [JSON.stringify([mapping, mapping]), "not-json"]) {
    expect(() => loadConfig(production({ RAILWAY_CONNECTIONS_JSON: value }))).toThrow("RAILWAY_CONNECTIONS_JSON");
  }
});
