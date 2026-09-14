import { expect, test } from "vitest";
import { createSession, updateDashboardPreferences, upsertIdentity } from "#/access";
import { upsertPullRequest } from "#/db";
import { createApp } from "#/server";
import { testConfig, withDatabase } from "./mongo-support";

const request = (app: ReturnType<typeof createApp>, token: string, init: RequestInit = {}) =>
	app.fetch(
		new Request("http://local/api/preferences", {
			...init,
			headers: { cookie: `dcc_session=${token}`, "content-type": "application/json", ...init.headers },
		}),
	);

test("preferences PATCH validates the canonical fields and preserves concurrent updates", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		const session = await createSession(db, "1701");
		const app = createApp(db, testConfig);
		const body = {
			repositoryIds: null,
			sort: { mode: "updated", direction: "desc" },
			filters: { query: "shields", statuses: ["reviewing"], attention: true, failedActions: false, failedChecks: true },
		};
		const response = await request(app, session.token, { method: "PATCH", body: JSON.stringify(body) });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject(body);
		await Promise.all([
			updateDashboardPreferences(db, "1701", { sort: { mode: "closest", direction: "asc" } }),
			updateDashboardPreferences(db, "1701", { repositoryIds: ["42"] }),
			upsertPullRequest(db, { repositoryId: "301", number: 7, title: "Defiant restored" }),
		]);
		expect(await (await request(app, session.token)).json()).toMatchObject({
			repositoryIds: ["42"],
			sort: { mode: "closest", direction: "asc" },
			filters: body.filters,
		});
		expect((await db.pullRequests.findOne({ _id: "301:7" }))?.title).toBe("Defiant restored");
		await app.stop();
	}));

test("invalid preferences and another user's session are rejected without writes", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await upsertIdentity(db, "1702", "kira");
		const first = await createSession(db, "1701");
		const second = await createSession(db, "1702");
		const app = createApp(db, testConfig);
		const invalid = await request(app, first.token, {
			method: "PATCH",
			body: JSON.stringify({ sort: { mode: "codex", direction: "asc" } }),
		});
		expect(invalid.status).toBe(400);
		const forbidden = await request(app, "missing", {
			method: "PATCH",
			body: JSON.stringify({ repositoryIds: ["42"] }),
		});
		expect(forbidden.status).toBe(401);
		const secondResponse = await request(app, second.token, {
			method: "PATCH",
			body: JSON.stringify({ repositoryIds: ["43"] }),
		});
		expect(secondResponse.status).toBe(200);
		const firstPreferences = await (await request(app, first.token)).json();
		expect(firstPreferences.repositoryIds).toBeUndefined();
		await app.stop();
	}));

test("preferences reject unsupported nested fields and filter states", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		const { token } = await createSession(db, "1701");
		const app = createApp(db, testConfig);
		const filters = { query: "", statuses: ["reviewing"], attention: true, failedActions: true, failedChecks: true };
		try {
			for (const body of [
				{ sort: { mode: "updated", direction: "asc", unwanted: "oversized fixture payload" } },
				{ filters: { ...filters, unwanted: "oversized fixture payload" } },
				{ filters: { ...filters, statuses: ["not-a-stage"] } },
			])
				expect((await request(app, token, { method: "PATCH", body: JSON.stringify(body) })).status).toBe(400);
			expect(await (await request(app, token)).json()).toEqual({});
		} finally {
			await app.stop();
		}
	}));
