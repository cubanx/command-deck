import { expect, test } from "vitest";
import { loadConfig } from "#/config";

test("validates runtime ports", () => {
	expect(() => loadConfig({ PORT: "0" })).toThrow("valid TCP port");
	expect(loadConfig({}).port).toBe(3000);
});

test("local demo is loopback-only and rejected in hosted environments", () => {
	expect(
		loadConfig({ DCC_LOCAL_DEMO: "1", NODE_ENV: "development" }),
	).toMatchObject({
		localDemo: true,
		hostname: "127.0.0.1",
	});
	expect(() =>
		loadConfig({ DCC_LOCAL_DEMO: "1", NODE_ENV: "production" }),
	).toThrow("local demo");
	expect(() =>
		loadConfig({ DCC_LOCAL_DEMO: "1", RAILWAY_ENVIRONMENT_ID: "ds9" }),
	).toThrow("local demo");
	expect(() =>
		loadConfig({
			DCC_LOCAL_DEMO: "1",
			RAILWAY_ENVIRONMENT_NAME: "Review / 42",
		}),
	).toThrow("local demo");
});

test("local OAuth uses an explicit loopback HTTP origin and non-secure cookies", () => {
	expect(loadConfig({ NODE_ENV: "development", PORT: "3005" })).toMatchObject({
		publicUrl: "http://127.0.0.1:3005",
		oauthCallbackUrl: "http://127.0.0.1:3005/auth/github/callback",
	});
	expect(
		loadConfig({
			NODE_ENV: "development",
			PUBLIC_URL: "http://127.0.0.1:3000",
		}),
	).toMatchObject({
		publicUrl: "http://127.0.0.1:3000",
		oauthCallbackUrl: "http://127.0.0.1:3000/auth/github/callback",
		secureCookies: false,
	});
	for (const publicUrl of [
		"http://command-center.example",
		"http://localhost.evil.example",
		"not a URL",
	]) {
		expect(() => loadConfig({ PUBLIC_URL: publicUrl })).toThrow(
			"PUBLIC_URL must be a loopback HTTP origin",
		);
	}
});

test("automated review signals are configured together", () => {
	expect(() => loadConfig({ GITHUB_REVIEW_BOT_LOGIN: "claude[bot]" })).toThrow(
		"review bot",
	);
	expect(
		loadConfig({
			GITHUB_REVIEW_BOT_LOGIN: "claude[bot]",
			GITHUB_REVIEW_BOT_START_MARKER: "started review",
			GITHUB_REVIEW_BOT_DONE_MARKER: "review complete",
		}).reviewBot,
	).toEqual({
		login: "claude[bot]",
		startMarker: "started review",
		doneMarker: "review complete",
	});
});

const production = (overrides: Record<string, string | undefined> = {}) => ({
	NODE_ENV: "production",
	PORT: "3000",
	PUBLIC_URL: "https://command-center.up.railway.app",
	RAILWAY_PUBLIC_DOMAIN: "command-center.up.railway.app",
	MONGODB_URI_BASE: "mongodb://mongo.example",
	MONGODB_DATABASE: "command-center-ai-production",
	GITHUB_APP_ID: "1701",
	GITHUB_CLIENT_ID: "client-id",
	GITHUB_CLIENT_SECRET: "client-secret",
	GITHUB_APP_PRIVATE_KEY: "private-key",
	GITHUB_WEBHOOK_SECRET: "webhook-secret",
	...overrides,
});

test("production requires real secrets, one HTTPS Railway origin, and secure cookies", () => {
	expect(loadConfig(production())).toMatchObject({
		production: true,
		publicUrl: "https://command-center.up.railway.app",
		oauthCallbackUrl:
			"https://command-center.up.railway.app/auth/github/callback",
		secureCookies: true,
	});
	for (const env of [
		production({ GITHUB_CLIENT_SECRET: undefined }),
		production({ GITHUB_WEBHOOK_SECRET: "changeme" }),
		production({ PUBLIC_URL: "http://command-center.up.railway.app" }),
		production({ PUBLIC_URL: "https://elsewhere.up.railway.app" }),
	]) {
		expect(() => loadConfig(env)).toThrow();
	}
});

test("production requires MongoDB configuration", () => {
	for (const env of [
		production({ MONGODB_URI_BASE: undefined }),
		production({ MONGODB_DATABASE: undefined }),
		production({ MONGODB_DATABASE: "bad name" }),
		production({
			MONGODB_DATABASE: ["dev", "command", "center", "production"].join("-"),
		}),
		production({ MONGODB_DATABASE: "command-center-ai-staging" }),
	]) {
		expect(() => loadConfig(env)).toThrow();
	}
});

test("local MongoDB configuration uses the canonical isolated family", () => {
	expect(loadConfig({ USER: "Benjamin Sisko" }).mongoDatabase).toBe(
		"command-center-ai-local-benjamin-sisko",
	);
});

test("Railway MongoDB configuration uses the shared hosted database", () => {
	expect(
		loadConfig(
			production({
				NODE_ENV: undefined,
				RAILWAY_ENVIRONMENT_NAME: "Review / 42",
			}),
		),
	).toMatchObject({
		production: true,
		mongoDatabase: "command-center-ai-production",
		publicUrl: "https://command-center.up.railway.app",
	});
	expect(() =>
		loadConfig(
			production({
				NODE_ENV: undefined,
				RAILWAY_ENVIRONMENT_NAME: "Review / 42",
				GITHUB_CLIENT_SECRET: undefined,
			}),
		),
	).toThrow("GITHUB_CLIENT_SECRET is required");
	for (const mongoDatabase of [
		"command-center-ai-local-benjamin-sisko",
		"command-center-ai-review---42",
		"arbitrary-valid",
	]) {
		expect(() =>
			loadConfig(
				production({
					NODE_ENV: undefined,
					RAILWAY_ENVIRONMENT_NAME: "Review / 42",
					MONGODB_DATABASE: mongoDatabase,
				}),
			),
		).toThrow("command-center-ai-production");
	}
});
