import { expect, test, vi } from "vitest";
import { upsertDeployment, upsertPullRequest } from "#/db";
import { withDatabase } from "./mongo-support";

test("oversized domain updates preserve prior PR and deployment evidence", () =>
	withDatabase(async (db) => {
		await upsertPullRequest(db, { repositoryId: "1701", number: 9, title: "Defiant" });
		await upsertDeployment(db, { repositoryId: "1701", deploymentId: "9", state: "success" });
		const oversized = "x".repeat(13 * 1024 * 1024);
		await expect(upsertPullRequest(db, { repositoryId: "1701", number: 9, title: oversized })).rejects.toThrow(
			"safe BSON limit",
		);
		await expect(upsertDeployment(db, { repositoryId: "1701", deploymentId: "9", log_url: oversized })).rejects.toThrow(
			"safe BSON limit",
		);
		expect(await db.pullRequests.findOne({ _id: "1701:9" })).toMatchObject({ title: "Defiant" });
		expect(await db.deployments.findOne({ _id: "1701:9" })).toMatchObject({ state: "success" });
	}));

test("an optional cleared field does not trigger repeated writes", () =>
	withDatabase(async (db) => {
		const input = { repositoryId: "1701", number: 8, review_state: undefined };
		await upsertPullRequest(db, input);
		expect(await upsertPullRequest(db, input)).toBe(false);
	}));

test("unchanged PR evidence preserves its write timestamp", () =>
	withDatabase(async (db) => {
		const input = { repositoryId: "1701", number: 7, title: "Defiant", updated_at: "2026-09-13T12:00:00Z" };
		await upsertPullRequest(db, input);
		const before = await db.pullRequests.findOne({ _id: "1701:7" });
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(await upsertPullRequest(db, input)).toBe(false);
		expect(await db.pullRequests.findOne({ _id: "1701:7" })).toEqual(before);
	}));

test("PR compare-and-set retries a concurrent same-source-time change", () =>
	withDatabase(async (db) => {
		await upsertPullRequest(db, {
			repositoryId: "1701",
			number: 7,
			title: "Defiant",
			updated_at: "2026-09-13T12:00:00Z",
		});
		const replace = db.pullRequests.replaceOne.bind(db.pullRequests);
		vi.spyOn(db.pullRequests, "replaceOne").mockImplementationOnce(async (...args) => {
			await upsertPullRequest(db, { repositoryId: "1701", number: 7, review_state: "approved" });
			return replace(...args);
		});
		await upsertPullRequest(db, {
			repositoryId: "1701",
			number: 7,
			title: "Defiant ready",
			updated_at: "2026-09-13T12:00:00Z",
		});
		expect(await db.pullRequests.findOne({ _id: "1701:7" })).toMatchObject({
			title: "Defiant ready",
			review_state: "approved",
		});
	}));

test("deployment replay preserves newer terminal evidence", () =>
	withDatabase(async (db) => {
		await upsertDeployment(db, {
			repositoryId: "1701",
			deploymentId: "9",
			state: "success",
			status_id: "20",
			status_created_at: "2026-09-13T12:00:00Z",
		});
		expect(
			await upsertDeployment(db, {
				repositoryId: "1701",
				deploymentId: "9",
				state: "pending",
				status_id: "19",
				status_created_at: "2026-09-13T11:00:00Z",
			}),
		).toBe(false);
		expect(await db.deployments.findOne({ _id: "1701:9" })).toMatchObject({ state: "success", status_id: "20" });
	}));

test("an expected bootstrap revision remains binding after a CAS retry", () =>
	withDatabase(async (db) => {
		await upsertPullRequest(db, { repositoryId: "1701", number: 7, title: "Defiant", head_sha: "a".repeat(40) });
		const before = await db.pullRequests.findOne({ _id: "1701:7" });
		const replace = db.pullRequests.replaceOne.bind(db.pullRequests);
		vi.spyOn(db.pullRequests, "replaceOne").mockImplementationOnce(async (...args) => {
			await upsertPullRequest(db, { repositoryId: "1701", number: 7, title: "New head", head_sha: "b".repeat(40) });
			return replace(...args);
		});
		expect(
			await upsertPullRequest(
				db,
				{ repositoryId: "1701", number: 7, title: "Old snapshot", head_sha: before!.head_sha },
				{ revision: before!.revision, head_sha: before!.head_sha },
			),
		).toBe(false);
		expect(await db.pullRequests.findOne({ _id: "1701:7" })).toMatchObject({
			title: "New head",
			head_sha: "b".repeat(40),
		});
	}));

test.each([{ state: "open" }, { merged: false }])("domain upserts preserve terminal merge evidence (%j)", (patch) =>
	withDatabase(async (db) => {
		await upsertPullRequest(db, { repositoryId: "1701", number: 7, state: "closed", merged: true });
		expect(await upsertPullRequest(db, { repositoryId: "1701", number: 7, ...patch })).toBe(false);
		expect(await db.pullRequests.findOne({ _id: "1701:7" })).toMatchObject({ state: "closed", merged: true });
	}),
);
