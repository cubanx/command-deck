import { expect, test } from "vitest";
import {
	appearanceFor,
	blockersFor,
	bucketFor,
	derivePullRequests,
	fuzzyScore,
	repositoryOptions,
	sortPreference,
} from "#/web/app.js";

const items = [
	{
		pr: {
			number: 12,
			title: "Defiant readiness",
			full_name: "ds9/ops",
			head_ref: "defiant/ready",
			draft: 1,
			mergeable: "clean",
		},
		spec: { change_name: "upgrade-defiant" },
	},
	{
		pr: {
			number: 11,
			title: "Station reports",
			full_name: "ds9/reports",
			head_ref: "reports/main",
			draft: 0,
			mergeable: "unknown",
		},
		spec: null,
	},
	{
		pr: {
			number: 10,
			title: "Docking controls",
			full_name: "ds9/ops",
			head_ref: "docking/controls",
			draft: 1,
			mergeable: false,
		},
		spec: null,
	},
	{
		pr: {
			number: 9,
			title: "Defiant telemetry",
			full_name: "ds9/ops",
			head_ref: "defiant/telemetry",
			draft: 0,
			mergeable: true,
		},
		spec: null,
	},
];

type ViewItem = { pr: { number: number } };
const numbers = (views: ViewItem[]) => views.map(({ pr }) => pr.number);

test("status buckets remain exclusive while closest-to-merge uses independent blockers", () => {
	expect(bucketFor(items[0].pr)).toBe("mergeable");
	expect(bucketFor(items[1].pr)).toBe("ready");
	expect(bucketFor(items[2].pr)).toBe("draft");
	expect(numbers(derivePullRequests(items, {}))).toEqual([11, 9, 12, 10]);
});

test("closest-to-merge counts each unresolved gate once and shows exact labels", () => {
	const complete = { change_name: "complete", completed: 3, total: 3 };
	const cases = [
		[{ draft: true }, "Draft"],
		[{ review_state: "changes_requested" }, "Changes requested"],
		[{ workflow_state: "failure" }, "Actions failed"],
		[{ checks_state: "timed_out" }, "Checks failed"],
		[{ mergeable: "conflicting" }, "Mergeability blocked"],
		[
			{},
			"OpenSpec incomplete",
			{ change_name: "incomplete", completed: 1, total: 3 },
		],
	] as const;
	for (const [pr, label, spec = complete] of cases)
		expect(blockersFor(pr, spec)).toEqual([label]);
	expect(
		blockersFor(
			{
				draft: true,
				review_state: "changes_requested",
				workflow_state: "failed",
				checks_state: "cancelled",
				mergeable: false,
			},
			{ change_name: "incomplete", completed: 1, total: 3 },
		),
	).toHaveLength(6);
});

test("closest-to-merge keeps incomplete OpenSpec blockers visible before progress and PR ties", () => {
	const ordered = derivePullRequests(
		[
			{ pr: { number: 1, full_name: "ds9/ops" }, spec: null },
			{
				pr: { number: 2, full_name: "ds9/ops" },
				spec: { completed: 1, total: 2 },
			},
			{
				pr: { number: 3, full_name: "ds9/ops" },
				spec: { completed: 3, total: 4 },
			},
			{ pr: { number: 4, full_name: "ds9/ops" }, spec: null },
		],
		{},
	);
	expect(numbers(ordered)).toEqual([4, 1, 3, 2]);
});

test("search ranks exact, prefix, substring, then typo matches and keeps numeric queries exact", () => {
	expect([
		fuzzyScore("defiant", "defiant"),
		fuzzyScore("defiant", "defiant readiness"),
		fuzzyScore("defiant", "upgrade defiant controls"),
		fuzzyScore("defiant", "defint"),
	]).toEqual([0, 1, 2, 3]);
	expect(numbers(derivePullRequests(items, { query: "9" }))).toEqual([9]);
	expect(numbers(derivePullRequests(items, { query: "defint" }))).toEqual([
		9, 12,
	]);
});

test("title, repository, branch, OpenSpec, status, and multi-repository filters compose", () => {
	for (const query of [
		"readiness",
		"ds9/ops",
		"defiant/ready",
		"upgrade-defiant",
	])
		expect(numbers(derivePullRequests(items, { query }))).toContain(12);
	expect(
		numbers(
			derivePullRequests(items, {
				query: "defiant",
				statuses: new Set(["mergeable"]),
				repositories: new Set(["ds9/ops", "ds9/reports"]),
			}),
		),
	).toEqual([9, 12]);
	expect(repositoryOptions(items, "rep")).toEqual(["ds9/reports"]);
});

test("failed Actions and Checks are composable filters using projected aggregate states", () => {
	const filtered = [
		{
			pr: {
				number: 4,
				full_name: "ds9/ops",
				workflow_state: "failure",
				checks_state: "success",
			},
			spec: null,
		},
		{
			pr: {
				number: 3,
				full_name: "ds9/ops",
				workflow_state: "success",
				checks_state: "timed_out",
			},
			spec: null,
		},
		{
			pr: {
				number: 2,
				full_name: "ds9/ops",
				workflow_state: "failed",
				checks_state: "cancelled",
			},
			spec: null,
		},
	];
	expect(
		numbers(derivePullRequests(filtered, { failedActions: true })),
	).toEqual([4, 2]);
	expect(numbers(derivePullRequests(filtered, { failedChecks: true }))).toEqual(
		[3, 2],
	);
	expect(
		numbers(
			derivePullRequests(filtered, {
				failedActions: true,
				failedChecks: true,
			}),
		),
	).toEqual([2]);
});

test("appearance preference defaults to System and explicit choices override it", () => {
	expect(appearanceFor(undefined, false)).toEqual({
		preference: "system",
		theme: "light",
	});
	expect(appearanceFor("system", true)).toEqual({
		preference: "system",
		theme: "dark",
	});
	expect(appearanceFor("light", true)).toEqual({
		preference: "light",
		theme: "light",
	});
	expect(appearanceFor("dark", false)).toEqual({
		preference: "dark",
		theme: "dark",
	});
});

test("sort modes use deterministic direction, null-last fallbacks, and safe preferences", () => {
	const sortable = [
		{
			pr: {
				number: 4,
				full_name: "ds9/zeta",
				updated_at: "2026-01-04T00:00:00Z",
			},
			spec: { completed: 1, total: 2 },
		},
		{
			pr: {
				number: 3,
				full_name: "ds9/alpha",
				updated_at: "2026-01-03T00:00:00Z",
			},
			spec: { completed: 3, total: 4 },
		},
		{ pr: { number: 2, full_name: "ds9/beta" }, spec: null },
		{ pr: { number: 1, full_name: "ds9/alpha" }, spec: null },
	];
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "updated", direction: "desc" },
			}),
		),
	).toEqual([4, 3, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "updated", direction: "asc" },
			}),
		),
	).toEqual([3, 4, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "closest", direction: "desc" },
			}),
		),
	).toEqual([3, 4, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "number", direction: "asc" },
			}),
		),
	).toEqual([1, 2, 3, 4]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "number", direction: "desc" },
			}),
		),
	).toEqual([4, 3, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "progress", direction: "desc" },
			}),
		),
	).toEqual([3, 4, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "progress", direction: "asc" },
			}),
		),
	).toEqual([4, 3, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "repository", direction: "asc" },
			}),
		),
	).toEqual([1, 3, 2, 4]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "repository", direction: "desc" },
			}),
		),
	).toEqual([4, 2, 1, 3]);
	expect(sortPreference('{"mode":"number","direction":"desc"}')).toEqual({
		mode: "number",
		direction: "desc",
	});
	expect(sortPreference("not JSON")).toEqual({
		mode: "closest",
		direction: "asc",
	});
	expect(sortPreference('{"mode":"codex","direction":"asc"}')).toEqual({
		mode: "closest",
		direction: "asc",
	});
	expect(
		derivePullRequests(
			[
				{ pr: { number: 7, full_name: "ds9/zeta" }, spec: null },
				{ pr: { number: 7, full_name: "ds9/alpha" }, spec: null },
			],
			{},
		).map(({ pr }: { pr: { full_name: string } }) => pr.full_name),
	).toEqual(["ds9/alpha", "ds9/zeta"]);
});
