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

const production = (overrides: Record<string, string | undefined> = {}) => ({
  NODE_ENV: "production", PORT: "3000", PUBLIC_URL: "https://command-center.up.railway.app", RAILWAY_PUBLIC_DOMAIN: "command-center.up.railway.app",
  MONGODB_URI_BASE: "mongodb://mongo.example", MONGODB_DATABASE: "dev-command-center-production", GITHUB_APP_ID: "1701", GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret", GITHUB_APP_PRIVATE_KEY: "private-key", GITHUB_WEBHOOK_SECRET: "webhook-secret", ...overrides
});

test("production requires real secrets, one HTTPS Railway origin, and secure cookies", () => {
  expect(loadConfig(production())).toMatchObject({ production: true, publicUrl: "https://command-center.up.railway.app", oauthCallbackUrl: "https://command-center.up.railway.app/auth/github/callback", secureCookies: true });
  for (const env of [production({ GITHUB_CLIENT_SECRET: undefined }), production({ GITHUB_WEBHOOK_SECRET: "changeme" }), production({ PUBLIC_URL: "http://command-center.up.railway.app" }), production({ PUBLIC_URL: "https://elsewhere.up.railway.app" })]) {
    expect(() => loadConfig(env)).toThrow();
  }
});

test("production requires MongoDB configuration", () => {
  for (const env of [production({ MONGODB_URI_BASE: undefined }), production({ MONGODB_DATABASE: undefined }), production({ MONGODB_DATABASE: "bad name" })]) {
    expect(() => loadConfig(env)).toThrow();
  }
});
