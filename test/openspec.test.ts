import { expect, test } from "vitest";
import { bindInstallation, dashboardForUser, upsertIdentity } from "#/access";
import {
	changedTaskPaths,
	openSpecGate,
	parseTasks,
	projectOpenSpec,
} from "#/openspec";
import { withDatabase } from "./mongo-support";

test("projects installation-scoped OpenSpec progress", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "r",
			full_name: "ds9/ops",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		expect(
			changedTaskPaths(["openspec/changes/defiant/tasks.md", "README.md"]),
		).toEqual(["openspec/changes/defiant/tasks.md"]);
		expect(parseTasks("## Tasks\n- [x] Ready\n- [ ] Fly")).toMatchObject({
			completed: 1,
			total: 2,
		});
		expect(
			await projectOpenSpec(db, {
				installationId: "1",
				accountLogin: "cubanx",
				repositoryId: "r",
				path: "openspec/changes/defiant/tasks.md",
				content: "- [x] Ready",
				sha: "a".repeat(40),
			}),
		).toBe(true);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.openSpecs,
		).toHaveLength(1);
		expect(
			await projectOpenSpec(db, {
				installationId: "1",
				accountLogin: "cubanx",
				repositoryId: "r",
				path: "openspec/changes/defiant/tasks.md",
				content: "- [x] Ready",
				sha: "a".repeat(40),
				sourceRef: "main",
			}),
		).toBe(false);
		await projectOpenSpec(db, {
			installationId: "1",
			accountLogin: "cubanx",
			repositoryId: "r",
			path: "openspec/changes/defiant/tasks.md",
			deleted: true,
			sha: "b".repeat(40),
		});
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.openSpecs,
		).toHaveLength(0);
	}));

test("keeps total progress while ignoring only exact post-merge groups for readiness", () => {
	const progress = parseTasks(`## Build
- [x] Implement
- [ ] Verify rollout

## Observe [post-merge]
- [ ] Check production`);
	expect(progress).toMatchObject({
		completed: 1,
		total: 3,
		preMergeReady: false,
		activeGroup: { title: "Build" },
	});
	expect(
		parseTasks(`## Build
- [x] Implement

## Observe [post-merge]
- [ ] Check production`),
	).toMatchObject({ completed: 1, total: 2, preMergeReady: true });
	expect(
		parseTasks(`## Deploy after merge
- [ ] Verify production`),
	).toMatchObject({
		preMergeReady: false,
		activeGroup: { title: "Deploy after merge" },
	});
	expect(
		parseTasks(`## Mixed [post-merge]
- [ ] Implement before merge
- [ ] Verify production`),
	).toMatchObject({ preMergeReady: true, activeGroup: null });
	expect(
		parseTasks(`## Mixed pre-merge and post-merge
- [ ] Implement before merge
- [ ] Verify production`),
	).toMatchObject({ preMergeReady: false });
});

test("applies openspec-not-required only when no OpenSpec is correlated", () => {
	expect(openSpecGate([], ["openspec-not-required"])).toEqual({
		applicable: false,
		ready: true,
	});
	expect(openSpecGate([], [])).toEqual({ applicable: true, ready: false });
	expect(
		openSpecGate([{ pre_merge_ready: false }], ["openspec-not-required"]),
	).toEqual({ applicable: true, ready: false });
});

test("persists optional lifecycle projections and private reconciliation runs", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "1", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "r",
			full_name: "ds9/ops",
			pullRequests: [{ number: 7, opened_at: "2026-08-24T12:00:00.000Z" }],
			openSpecs: [],
			deployments: [],
			policy: { refreshed_at: "2026-08-24T12:00:00.000Z", required_checks: [] },
			recentMergedPullRequests: [
				{
					number: 7,
					title: "Defiant telemetry",
					url: "https://github.com/ds9/ops/pull/7",
					head_sha: "a".repeat(40),
					merge_sha: "b".repeat(40),
					merged_at: "2026-08-24T12:00:00.000Z",
				},
			],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		await db.reconciliationRuns.insertOne({
			installationId: "1",
			trigger: "manual",
			startedAt: new Date("2026-08-24T12:00:00.000Z"),
			completedAt: new Date("2026-08-24T12:00:01.000Z"),
			durationMs: 1_000,
			prCount: 1,
			providerRequestCount: 4,
			changedPrCount: 0,
			unchangedPrCount: 1,
			changedFieldCategories: [],
			failureCount: 0,
			unresolvedDeliveryCount: 0,
			repairedDeliveryCount: 0,
			outcome: "success",
		});
		expect(await db.reconciliationRuns.countDocuments()).toBe(1);
		expect(JSON.stringify(await dashboardForUser(db, "u"))).not.toContain(
			"providerRequestCount",
		);
		expect(await db.reconciliationRuns.indexes()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: { completedAt: 1 },
					expireAfterSeconds: 1_209_600,
				}),
				expect.objectContaining({
					key: { installationId: 1, completedAt: -1 },
				}),
			]),
		);
		expect(await db.users.findOne({ _id: "u" })).toMatchObject({
			installations: [
				{
					repositories: [
						{
							pullRequests: [{ opened_at: "2026-08-24T12:00:00.000Z" }],
							policy: { required_checks: [] },
							recentMergedPullRequests: [
								expect.objectContaining({
									number: 7,
									merge_sha: "b".repeat(40),
								}),
							],
						},
					],
				},
			],
		});
	}));
