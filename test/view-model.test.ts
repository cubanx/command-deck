import { expect, test } from "vitest";
import {
	derivePullRequests,
	fuzzyScore,
	lifecycleFor,
	mergeControlFor,
	repositoryOptions,
} from "#/features/command-center/view-model";

const ready = {
	review_activity: true,
	completed_review_count: 1,
	unresolved_review_threads: 0,
	changes_requested: false,
	repository_policy_loaded: true,
	required_checks: [],
	mergeable: "clean",
};

const numbers = (items: ReturnType<typeof derivePullRequests>) => items.map(({ pr }) => Number(pr.number));

test("derives lifecycle precedence", () => {
	expect(lifecycleFor({ state: "closed" })).toEqual({ stage: "closed", blockers: [] });
	expect(lifecycleFor({ ...ready, draft: true })).toEqual({ stage: "draft", blockers: ["Draft"] });
	expect(lifecycleFor({ ...ready })).toEqual({ stage: "mergeable", blockers: [] });
});

test("retained merged work is visible first and cannot be merged", () => {
	const retained = {
		...ready,
		number: 1,
		full_name: "ds9/ops",
		state: "closed",
		merged: true,
		retention_candidate: true,
	};
	const open = { ...ready, number: 2, full_name: "ds9/ops", state: "open" };
	expect(lifecycleFor(retained)).toEqual({ stage: "post-merge", blockers: [] });
	expect(mergeControlFor(retained)).toMatchObject({ state: "closed" });
	for (const direction of ["asc", "desc"] as const)
		expect(
			numbers(derivePullRequests([{ pr: open }, { pr: retained }], { sort: { mode: "repository", direction } })),
		).toEqual([1, 2]);
});

test("retention partitions preserve every sort comparator and remain filterable", () => {
	const items = [4, 1, 3, 2].map((number) => ({
		pr: {
			...ready,
			number,
			title: number <= 2 ? "Defiant follow-up" : "Station repair",
			full_name: number % 2 ? "ds9/alpha" : "ds9/beta",
			opened_at: `2026-09-0${number % 2 ? 1 : 2}T12:00:00Z`,
			updated_at: `2026-09-0${number % 2 ? 1 : 2}T12:00:00Z`,
			state: number <= 2 ? "closed" : "open",
			merged: number <= 2,
			retention_candidate: number <= 2,
			draft: number <= 2,
		},
	}));
	for (const mode of ["opened", "closest", "updated", "repository"] as const)
		for (const direction of ["asc", "desc"] as const) {
			const highFirst = direction === "desc";
			expect(numbers(derivePullRequests(items, { sort: { mode, direction } }))).toEqual(
				highFirst ? [2, 1, 4, 3] : [1, 2, 3, 4],
			);
		}
	expect(numbers(derivePullRequests(items, { statuses: new Set(["post-merge"]) }))).toEqual([1, 2]);
	expect(numbers(derivePullRequests(items, { query: "Defiant" }))).toEqual([1, 2]);
	expect(numbers(derivePullRequests(items, { repositories: new Set(["ds9/alpha"]) }))).toEqual([1, 3]);
});

test("keeps lifecycle buckets exclusive while composing attention, failure, repository, and fuzzy filters", () => {
	const items = [
		{
			pr: {
				...ready,
				number: 1,
				full_name: "ds9/ops",
				title: "Defiant readiness",
				workflow_state: "failed",
				checks_state: "cancelled",
				needs_attention: true,
			},
		},
		{
			pr: {
				...ready,
				number: 2,
				full_name: "ds9/science",
				title: "Wormhole report",
				review_activity: false,
				completed_review_count: 0,
			},
		},
		{ pr: { ...ready, number: 3, full_name: "ds9/ops", title: "Docking", draft: true } },
	];
	expect(numbers(derivePullRequests(items, { attention: true, failedActions: true, failedChecks: true }))).toEqual([1]);
	expect(numbers(derivePullRequests(items, { statuses: new Set(["ready"]) }))).toEqual([2]);
	expect(numbers(derivePullRequests(items, { statuses: new Set() }))).toEqual([]);
	expect(numbers(derivePullRequests(items, { repositories: new Set(["ds9/ops"]) }))).toEqual([1, 3]);
	expect(repositoryOptions(items)).toEqual(["ds9/ops", "ds9/science"]);
	expect([
		fuzzyScore("defiant", "defiant"),
		fuzzyScore("defiant", "defiant readiness"),
		fuzzyScore("defiant", "hold defiant"),
		fuzzyScore("defiant", "defint"),
	]).toEqual([0, 1, 2, 3]);
	expect(numbers(derivePullRequests(items, { query: "1" }))).toEqual([1]);
});

test("sorts every preference deterministically with null-last values", () => {
	const items = [
		{
			pr: {
				...ready,
				number: 4,
				full_name: "ds9/zeta",
				opened_at: "2026-01-04T00:00:00Z",
				updated_at: "2026-01-04T00:00:00Z",
			},
		},
		{
			pr: {
				...ready,
				number: 3,
				full_name: "ds9/alpha",
				opened_at: "2026-01-03T00:00:00Z",
				updated_at: "2026-01-03T00:00:00Z",
			},
		},
		{ pr: { ...ready, number: 2, full_name: "ds9/beta" } },
		{ pr: { ...ready, number: 1, full_name: "ds9/alpha" } },
	];
	for (const mode of ["opened", "closest", "updated", "repository"] as const)
		for (const direction of ["asc", "desc"] as const)
			expect(numbers(derivePullRequests(items, { sort: { mode, direction } }))).toHaveLength(4);
	expect(numbers(derivePullRequests(items, { sort: { mode: "opened", direction: "asc" } }))).toEqual([3, 4, 1, 2]);
	expect(numbers(derivePullRequests(items, { sort: { mode: "opened", direction: "desc" } }))).toEqual([4, 3, 1, 2]);
	expect(numbers(derivePullRequests(items, { sort: { mode: "repository", direction: "asc" } }))).toEqual([1, 3, 2, 4]);
	expect(numbers(derivePullRequests(items, { sort: { mode: "repository", direction: "desc" } }))).toEqual([4, 2, 1, 3]);
});

test("enables merge only when lifecycle-ready", () => {
	expect(mergeControlFor({ ...ready, installation_pull_requests: "write", state: "open", draft: false })).toEqual({
		state: "enabled",
	});
	expect(
		mergeControlFor({
			...ready,
			installation_pull_requests: "write",
			state: "open",
			draft: false,
			review_activity: false,
			completed_review_count: 0,
		}),
	).toMatchObject({ state: "blocked" });
});
