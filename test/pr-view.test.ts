import { expect, test } from "vitest";
import type { BrowserDirectoryHandle } from "#/web/app";
import {
	appearanceFor,
	avatarUrlFor,
	blockersFor,
	bucketFor,
	checkoutKey,
	checkoutStateFor,
	checkoutStoreFor,
	derivePullRequests,
	exactCheckoutDirectory,
	fuzzyScore,
	lifecycleFor,
	loadFailureFor,
	localSpecFor,
	localSpecsFor,
	mergeControlFor,
	mergeMarkup,
	pageFor,
	parseTasks,
	persistVerifiedCheckout,
	pullRequestStatusMarkup,
	readCheckout,
	readRepositoryCheckout,
	repositoryForRemote,
	repositoryOptions,
	revalidateCheckout,
	sortPreference,
	statusDetailHoverDelay,
	statusDetailPositionFor,
	statusDetailStateFor,
} from "#/web/app";

const directory = (
	overrides: Partial<BrowserDirectoryHandle> = {},
): BrowserDirectoryHandle => ({
	getDirectoryHandle: async () => directory(),
	getFileHandle: async () => ({
		getFile: async () => ({ text: async () => "" }),
	}),
	entries: async function* () {},
	queryPermission: async () => "granted",
	requestPermission: async () => "granted",
	...overrides,
});

const items = [
	{
		pr: {
			number: 12,
			title: "Defiant readiness",
			full_name: "ds9/ops",
			head_ref: "defiant/ready",
			draft: 1,
			mergeable: "clean",
			labels: ["openspec-not-required"],
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
			labels: ["openspec-not-required"],
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
			labels: ["openspec-not-required"],
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
			labels: ["openspec-not-required"],
			review_activity: true,
			completed_review_count: 1,
			unresolved_review_threads: 0,
			changes_requested: false,
			repository_policy_loaded: true,
			required_checks: [],
		},
		spec: null,
	},
];

type ViewItem = { pr: Record<string, unknown> };
const numbers = (views: ViewItem[]) => views.map(({ pr }) => Number(pr.number));

const lifecycleReady = {
	labels: ["openspec-not-required"],
	review_activity: true,
	completed_review_count: 1,
	unresolved_review_threads: 0,
	changes_requested: false,
	repository_policy_loaded: true,
	required_checks: [],
	mergeable: "clean",
};

test("reduces lifecycle evidence with explicit precedence and named blockers", () => {
	const cases = [
		[{ state: "closed" }, undefined, "closed", []],
		[{ ...lifecycleReady, draft: true }, undefined, "draft", ["Draft"]],
		[{}, undefined, "openspec", ["No OpenSpec found"]],
		[
			{ ...lifecycleReady },
			{ completed: 1, total: 2, pre_merge_ready: false },
			"openspec",
			["OpenSpec incomplete"],
		],
		[
			{ ...lifecycleReady, review_activity: false, completed_review_count: 0 },
			undefined,
			"ready",
			[],
		],
		[
			{ ...lifecycleReady, unresolved_review_threads: 1 },
			undefined,
			"reviewing",
			["Unresolved review threads"],
		],
		[
			{ ...lifecycleReady, unresolved_review_threads: undefined },
			undefined,
			"reviewing",
			["Review threads unavailable"],
		],
		[
			{
				...lifecycleReady,
				review_requested: true,
				completed_review_count: 0,
				review_activity: false,
			},
			undefined,
			"reviewing",
			["Review pending"],
		],
		[
			{ ...lifecycleReady, changes_requested: true },
			undefined,
			"reviewing",
			["Changes requested"],
		],
		[
			{ ...lifecycleReady, changes_requested: undefined },
			undefined,
			"reviewing",
			["Review state unavailable"],
		],
		[
			{ ...lifecycleReady, mergeable: "unknown" },
			undefined,
			"reviewing",
			["Mergeability unknown"],
		],
		[
			{
				...lifecycleReady,
				head_sha: "a",
				required_checks: [{ head_sha: "a", conclusion: "skipped" }],
			},
			undefined,
			"mergeable",
			[],
		],
		[
			{ ...lifecycleReady, repository_policy_loaded: false },
			undefined,
			"reviewing",
			["Repository policy unavailable"],
		],
		[
			{
				...lifecycleReady,
				required_checks: [{ head_sha: "a", conclusion: "failure" }],
				head_sha: "a",
			},
			undefined,
			"reviewing",
			["Required checks incomplete"],
		],
		[lifecycleReady, undefined, "mergeable", []],
	] as const;
	for (const [pr, spec, stage, blockers] of cases)
		expect(lifecycleFor(pr, spec)).toEqual({ stage, blockers });
	expect(
		lifecycleFor({
			...lifecycleReady,
			completed_review_count: 0,
			bot_review_state: "COMMENTED",
		}),
	).toMatchObject({ stage: "mergeable" });
	expect(
		lifecycleFor({
			...lifecycleReady,
			head_sha: "a",
			required_checks: [{ head_sha: "a", conclusion: "success" }],
			checks_state: "failure",
			workflow_state: "failure",
		}),
	).toMatchObject({ stage: "mergeable" });
	const descriptiveOnly = lifecycleFor(lifecycleReady);
	expect(descriptiveOnly.stage).toBe("mergeable");
	expect(
		mergeMarkup({
			...lifecycleReady,
			installation_pull_requests: "read",
			state: "open",
		}),
	).toBe("");
	expect(lifecycleFor({ ...lifecycleReady, head_sha: "new" })).toMatchObject({
		stage: "mergeable",
	});
	expect(
		mergeMarkup({
			...lifecycleReady,
			installation_pull_requests: "write",
			state: "open",
			draft: false,
			mergeable: "clean",
		}),
	).toContain(">Merge</button>");
});

test("requires declaration confirmation for changed OpenSpec candidates", () => {
	expect(
		lifecycleFor({
			...lifecycleReady,
			open_spec_declaration: "absent",
			detected_open_specs: ["capture-wolf-359"],
		}),
	).toEqual({ stage: "openspec", blockers: ["Confirm OpenSpec association"] });
	expect(
		lifecycleFor({
			...lifecycleReady,
			open_spec_declaration: "empty",
			labels: ["openspec-not-required"],
		}),
	).toMatchObject({ stage: "mergeable" });
	expect(
		pullRequestStatusMarkup({
			pr: {
				...lifecycleReady,
				number: 7,
				open_spec_declaration: "declared",
				detected_open_specs: ["extra<spec>"],
			},
			spec: null,
			bucket: "mergeable",
			blockers: [],
			score: 0,
			progress: null,
		}),
	).toContain('aria-label="Detected OpenSpec candidates"');
	expect(
		pullRequestStatusMarkup({
			pr: {
				...lifecycleReady,
				number: 7,
				open_spec_declaration: "declared",
				detected_open_specs: ["zeta", "extra<spec>"],
			},
			spec: null,
			bucket: "mergeable",
			blockers: [],
			score: 0,
			progress: null,
		}),
	).toContain("<ul><li>zeta</li><li>extra&lt;spec&gt;</li></ul>");
});

test("uses five lifecycle stages and global opened ordering", () => {
	const rendered = pullRequestStatusMarkup({
		pr: { ...lifecycleReady, number: 7 },
		bucket: "reviewing",
		blockers: ["Required checks incomplete"],
		progress: null,
		score: 0,
	});
	for (const stage of [
		"Draft",
		"OpenSpec ready",
		"Ready for review",
		"Reviewing",
		"Mergeable",
	])
		expect(rendered).toContain(stage);
	const ordered = derivePullRequests([
		{ pr: { ...lifecycleReady, number: 3, full_name: "ds9/zeta" } },
		{
			pr: {
				...lifecycleReady,
				number: 2,
				full_name: "ds9/alpha",
				opened_at: "2026-01-02T00:00:00Z",
			},
		},
		{
			pr: {
				...lifecycleReady,
				number: 1,
				full_name: "ds9/beta",
				opened_at: "2026-01-01T00:00:00Z",
			},
		},
	]);
	expect(numbers(ordered)).toEqual([2, 1, 3]);
	expect(
		derivePullRequests(
			[
				{ pr: { ...lifecycleReady, number: 2, full_name: "ds9/zeta" } },
				{
					pr: {
						...lifecycleReady,
						number: 1,
						full_name: "ds9/alpha",
						opened_at: "2026-01-01T00:00:00Z",
					},
				},
				{
					pr: {
						...lifecycleReady,
						number: 2,
						full_name: "ds9/alpha",
						opened_at: "2026-01-01T00:00:00Z",
					},
				},
			],
			{ sort: { mode: "opened", direction: "desc" } },
		).map(({ pr }) => `${pr.full_name}:${pr.number}`),
	).toEqual(["ds9/alpha:1", "ds9/alpha:2", "ds9/zeta:2"]);
	expect(sortPreference('{"mode":"number","direction":"desc"}')).toEqual({
		mode: "closest",
		direction: "asc",
	});
});

test("status buckets remain exclusive while closest-to-merge uses independent blockers", () => {
	expect(bucketFor(items[0].pr)).toBe("draft");
	expect(bucketFor(items[1].pr)).toBe("ready");
	expect(bucketFor(items[2].pr)).toBe("draft");
	expect(numbers(derivePullRequests(items, {}))).toEqual([9, 11, 10, 12]);
});

test("lifecycle precedence reflects current projected evidence, including regressions", () => {
	const pr = { ...lifecycleReady, draft: false, mergeable: true };
	expect(bucketFor(pr)).toBe("mergeable");
	pr.mergeable = false;
	expect(bucketFor(pr)).toBe("reviewing");
	expect(bucketFor({ ...lifecycleReady, draft: true })).toBe("draft");
});

test("status presentation has one warning, no positive pills, and preserves projected detail", () => {
	const markup = pullRequestStatusMarkup({
		pr: {
			number: 9,
			draft: false,
			mergeable: "conflicting",
			workflow_state: "failure",
			checks_state: "success",
			review_state: "changes_requested",
			head_ref: "ds9/hold-the-line",
			head_sha: "a".repeat(40),
			updated_at: "2026-08-18T12:00:00Z",
			workflow_failures: [
				{ name: "Runabout check", url: "https://github.com/ds9/actions/9" },
			],
		},
		spec: { change_name: "hold-the-line", completed: 1, total: 2 },
		bucket: "ready",
		blockers: [
			"Changes requested",
			"Actions failed",
			"Mergeability blocked",
			"OpenSpec incomplete",
		],
		progress: 0.5,
		score: 0,
	});
	expect(markup).toContain("Ready for review");
	expect(markup).toContain("Changes requested");
	expect(markup).toContain("Runabout check");
	expect(markup).toContain("ds9/hold-the-line");
	expect(markup).not.toContain("healthy");
	expect(markup.match(/class="status warning/g) ?? []).toHaveLength(1);
	expect(markup).toContain("PR lifecycle. Current stage: Ready for review");
	expect(markup).toContain("data-status-detail=");
	expect(markup).not.toContain('class="lifecycle-rail" data-status-detail');
	expect(markup).toContain('class="lifecycle-pills" aria-hidden="true"');
	expect(markup).toContain(
		'<fieldset class="pr-lifecycle"><legend class="pr-lifecycle-title">PR Lifecycle</legend><div',
	);
	expect(markup).toContain('class="lifecycle-pill complete"');
	expect(markup).toContain("✓ Draft · Complete");
	expect(markup).toContain('class="lifecycle-pill current"');
	expect(markup).toContain("◐ Ready for review · Current");
	expect(markup).toContain('class="lifecycle-pill upcoming"');
	expect(markup).toContain("○ Mergeable · Upcoming");
	expect(markup).toContain('class="pr-warning-row"');
	expect(markup).not.toContain('aria-current="step"');
});

test("status detail supports hover or focus, pinned activation, and dismissal", () => {
	const initial = { key: null, pinned: false };
	const inspected = statusDetailStateFor(initial, "ds9:42:9", "inspect");
	expect(inspected).toEqual({ key: "ds9:42:9", pinned: false });
	expect(statusDetailStateFor(inspected, "ds9:42:9", "activate")).toEqual({
		key: "ds9:42:9",
		pinned: true,
	});
	expect(
		statusDetailStateFor(
			{ key: "ds9:42:9", pinned: true },
			"ds9:42:9",
			"activate",
		),
	).toEqual({ key: null, pinned: false });
	expect(statusDetailStateFor(inspected, null, "dismiss")).toEqual(initial);
});

test("hover detail waits briefly, stays open on leave, and is replaced by another trigger", () => {
	expect(statusDetailHoverDelay).toBe(350);
	expect(
		statusDetailStateFor({ key: "ds9:42:9", pinned: false }, null, "leave"),
	).toEqual({ key: "ds9:42:9", pinned: false });
	expect(
		statusDetailStateFor({ key: "ds9:42:9", pinned: true }, null, "leave"),
	).toEqual({ key: "ds9:42:9", pinned: true });
	expect(
		statusDetailStateFor(
			{ key: "ds9:42:9", pinned: false },
			"ds9:7:1",
			"inspect",
		),
	).toEqual({ key: "ds9:7:1", pinned: false });
	expect(
		statusDetailPositionFor(
			{ left: 980, top: 740, width: 20, height: 20 },
			{ width: 1000, height: 800 },
		),
	).toEqual({ left: 628, top: 548 });
});

test("stage and attention filters compose independently", () => {
	const filtered = [
		{
			pr: { ...lifecycleReady, number: 3, full_name: "ds9/ops", draft: true },
			spec: null,
		},
		{ pr: { ...lifecycleReady, number: 2, full_name: "ds9/ops" }, spec: null },
		{
			pr: {
				...lifecycleReady,
				number: 1,
				full_name: "ds9/ops",
				workflow_state: "failure",
				review_activity: false,
				completed_review_count: 0,
				needs_attention: true,
			},
			spec: null,
		},
	];
	expect(
		numbers(
			derivePullRequests(filtered, {
				statuses: new Set(["ready"]),
				attention: true,
			}),
		),
	).toEqual([1]);
	expect(
		numbers(
			derivePullRequests(filtered, {
				statuses: new Set(["mergeable"]),
				attention: true,
			}),
		),
	).toEqual([]);
	expect(
		numbers(
			derivePullRequests(filtered, {
				statuses: new Set(["draft"]),
			}),
		),
	).toEqual([3]);
	expect(
		numbers(
			derivePullRequests(
				[
					{
						pr: {
							number: 4,
							full_name: "ds9/ops",
							draft: true,
							mergeable: "clean",
						},
						spec: null,
					},
				],
				{ statuses: new Set(["draft"]) },
			),
		),
	).toEqual([4]);
});

test("demo lifecycle states render as Draft, Ready for review, and Mergeable", () => {
	const demo = derivePullRequests(
		[
			{ pr: { ...lifecycleReady, number: 1, draft: true } },
			{
				pr: {
					number: 2,
					labels: ["openspec-not-required"],
					review_activity: false,
					completed_review_count: 0,
				},
			},
			{ pr: { ...lifecycleReady, number: 3 } },
			{
				pr: {
					number: 4,
					draft: false,
					...lifecycleReady,
					review_state: "changes_requested",
				},
			},
			{
				pr: {
					number: 5,
					draft: false,
					...lifecycleReady,
					workflow_state: "failure",
				},
			},
		],
		{},
	);
	expect(demo.map((item) => pullRequestStatusMarkup(item))).toEqual(
		expect.arrayContaining([
			expect.stringContaining("<strong>Draft</strong>"),
			expect.stringContaining("<strong>Ready for review</strong>"),
			expect.stringContaining("<strong>Mergeable</strong>"),
		]),
	);
});

test("closest-to-merge retains named lifecycle blockers", () => {
	const complete = { change_name: "complete", completed: 3, total: 3 };
	const cases = [
		[{ ...lifecycleReady, draft: true }, "Draft"],
		[
			{
				...lifecycleReady,
				changes_requested: true,
				review_state: "changes_requested",
			},
			"Changes requested",
		],
		[
			{ ...lifecycleReady, unresolved_review_threads: 1 },
			"Unresolved review threads",
		],
		[{ ...lifecycleReady, mergeable: "conflicting" }, "Mergeability blocked"],
		[
			{ ...lifecycleReady },
			"OpenSpec incomplete",
			{ change_name: "incomplete", completed: 1, total: 3 },
		],
	] as const;
	for (const [pr, label, spec = complete] of cases)
		expect(blockersFor(pr, spec)).toEqual([label]);
	expect(
		blockersFor(
			{ ...lifecycleReady, draft: true },
			{ change_name: "incomplete", completed: 1, total: 3 },
		),
	).toHaveLength(1);
});

test("closest-to-merge counts each unresolved gate once and shows exact labels", () => {
	const complete = { change_name: "complete", completed: 3, total: 3 };
	const cases = [
		[{ ...lifecycleReady, completed_review_count: 0 }, "Review pending"],
		[
			{
				...lifecycleReady,
				changes_requested: true,
				review_state: "changes_requested",
			},
			"Changes requested",
		],
		[
			{ ...lifecycleReady, unresolved_review_threads: 1 },
			"Unresolved review threads",
		],
		[
			{ ...lifecycleReady, repository_policy_loaded: false },
			"Repository policy unavailable",
		],
		[
			{
				...lifecycleReady,
				required_checks: [{ head_sha: "stale", conclusion: "failure" }],
			},
			"Required checks incomplete",
		],
		[{ ...lifecycleReady, mergeable: "conflicting" }, "Mergeability blocked"],
	] as const;
	for (const [pr, label, spec = complete] of cases)
		expect(blockersFor(pr, spec)).toEqual([label]);
	expect(
		blockersFor(
			{
				...lifecycleReady,
				completed_review_count: 0,
				changes_requested: true,
				review_state: "changes_requested",
				unresolved_review_threads: 1,
				repository_policy_loaded: false,
				required_checks: [{ head_sha: "stale", conclusion: "failure" }],
				mergeable: "conflicting",
			},
			complete,
		),
	).toHaveLength(6);
});

test("closest-to-merge keeps incomplete OpenSpec blockers visible before progress and PR ties", () => {
	const ordered = derivePullRequests(
		[
			{
				pr: { ...lifecycleReady, number: 1, full_name: "ds9/ops" },
				spec: null,
			},
			{
				pr: { ...lifecycleReady, number: 2, full_name: "ds9/ops" },
				spec: { completed: 1, total: 2 },
			},
			{
				pr: { ...lifecycleReady, number: 3, full_name: "ds9/ops" },
				spec: { completed: 3, total: 4 },
			},
			{
				pr: { ...lifecycleReady, number: 4, full_name: "ds9/ops" },
				spec: null,
			},
		],
		{ sort: { mode: "closest", direction: "asc" } },
	);
	expect(numbers(ordered)).toEqual([1, 4, 3, 2]);
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

test("title, repository, branch, OpenSpec, status, and repository selections compose", () => {
	for (const query of [
		"readiness",
		"ds9/ops",
		"defiant/ready",
		"upgrade-defiant",
	])
		expect(numbers(derivePullRequests(items, { query }))).toContain(12);
	const filters = { query: "defiant", statuses: new Set(["mergeable"]) };
	expect(
		numbers(derivePullRequests(items, { ...filters, repositories: null })),
	).toEqual([9]);
	expect(
		numbers(
			derivePullRequests(items, { repositories: new Set(["ds9/reports"]) }),
		),
	).toEqual([11]);
	expect(
		numbers(derivePullRequests(items, { repositories: new Set() })),
	).toEqual([]);
	expect(repositoryOptions(items)).toEqual(["ds9/ops", "ds9/reports"]);
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
		numbers(
			derivePullRequests(filtered, {
				failedActions: true,
				sort: { mode: "closest", direction: "asc" },
			}),
		),
	).toEqual([2, 4]);
	expect(
		numbers(
			derivePullRequests(filtered, {
				failedChecks: true,
				sort: { mode: "closest", direction: "asc" },
			}),
		),
	).toEqual([2, 3]);
	expect(
		numbers(
			derivePullRequests(filtered, {
				failedActions: true,
				failedChecks: true,
				sort: { mode: "closest", direction: "asc" },
			}),
		),
	).toEqual([2]);
});

test("appearance preference uses named inputs and explicit choices override System", () => {
	expect(appearanceFor({})).toEqual({
		preference: "system",
		theme: "light",
	});
	expect(appearanceFor({ preference: "system", systemDark: true })).toEqual({
		preference: "system",
		theme: "dark",
	});
	expect(appearanceFor({ preference: "light", systemDark: true })).toEqual({
		preference: "light",
		theme: "light",
	});
	expect(appearanceFor({ preference: "dark", systemDark: false })).toEqual({
		preference: "dark",
		theme: "dark",
	});
});

test("avatar and page boundaries fail closed", () => {
	expect(avatarUrlFor("https://avatars.githubusercontent.com/u/9?v=4")).toBe(
		"https://avatars.githubusercontent.com/u/9?v=4",
	);
	expect(avatarUrlFor("http://avatars.githubusercontent.com/u/9")).toBeNull();
	expect(avatarUrlFor("javascript:alert(1)")).toBeNull();
	expect(pageFor("/configuration")).toBe("configuration");
	expect(pageFor("/")).toBe("dashboard");
	expect(pageFor("/anything-else")).toBe("dashboard");
});

test("local checkout keys, permissions, and remotes fail closed", () => {
	expect(checkoutKey("Crisp-Inc", "42")).toBe("crisp-inc:42");
	expect(checkoutStateFor({ supported: false })).toBe("Unsupported");
	expect(checkoutStateFor({ supported: true, permission: "prompt" })).toBe(
		"Permission required",
	);
	expect(
		checkoutStateFor({
			supported: true,
			permission: "granted",
			resolution: "unresolved",
		}),
	).toBe("Unresolved");
	expect(
		checkoutStateFor({
			supported: true,
			permission: "granted",
			resolution: "resolved",
		}),
	).toBe("Resolved");
	expect(
		repositoryForRemote(
			'[remote "origin"]\n\turl = git@github.com:Crisp-Inc/dev-command-center.git',
		),
	).toBe("crisp-inc/dev-command-center");
	expect(
		repositoryForRemote(
			'[remote "upstream"]\n\turl = git@github.com:Crisp-Inc/dev-command-center.git',
		),
	).toBeNull();
	expect(
		repositoryForRemote(
			'[remote "origin"]\nurl = https://github.com.evil.test/Crisp-Inc/dev-command-center.git',
		),
	).toBeNull();
	expect(
		repositoryForRemote(
			'[remote "origin"]\nurl = https://github.com/Crisp-Inc/dev-command-center.git?token=nope',
		),
	).toBeNull();
	expect(
		repositoryForRemote("url = https://git.example.test/crisp/repo.git"),
	).toBeNull();
});

test("merge controls expose one named state instead of an opaque boolean chain", () => {
	for (const mergeable of [true, "true", "clean"]) {
		const pullRequest = {
			...lifecycleReady,
			installation_pull_requests: "write",
			state: "open",
			draft: false,
			mergeable,
		};
		expect(bucketFor(pullRequest)).toBe("mergeable");
		expect(mergeControlFor(pullRequest)).toEqual({ state: "enabled" });
		expect(mergeMarkup(pullRequest)).toContain(">Merge</button>");
	}
	expect(
		mergeControlFor({
			installation_pull_requests: "read",
			state: "open",
			draft: false,
			mergeable: "clean",
		}),
	).toEqual({
		state: "permission-required",
		reason: "GitHub App Pull requests write permission approval is required.",
	});
	expect(
		mergeMarkup({
			installation_pull_requests: "read",
			state: "open",
			draft: false,
			mergeable: true,
		}),
	).toBe("");
	expect(
		mergeMarkup({
			installation_pull_requests: "write",
			state: "open",
			draft: false,
			mergeable: "conflicting",
		}),
	).toBe("");
});

test("snapshot load failures log sanitized context and retain the existing message", () => {
	const logged: unknown[][] = [];
	const message = loadFailureFor({
		error: new TypeError("secret provider body"),
		online: true,
		log: (...values: unknown[]) => logged.push(values),
	});
	expect(message).toBe("Sign in to view your command center.");
	expect(logged).toEqual([["Command center load failed", "TypeError"]]);
});

test("local checkout parsing retains only verified repository and OpenSpec evidence", async () => {
	const file = (content: string) => ({
		getFile: async () => ({ text: async () => content }),
	});
	const taskDirectory = directory({
		getFileHandle: async () =>
			file("## Readiness\n- [x] Shields\n- [ ] Phasers"),
	});
	const changes = directory({
		entries: async function* (): AsyncGenerator<
			[string, BrowserDirectoryHandle]
		> {
			yield ["prepare-defiant", { kind: "directory", ...taskDirectory }];
		},
	});
	const git = directory({
		getFileHandle: async (gitFile: string) =>
			gitFile === "config"
				? file('[remote "origin"]\nurl = git@github.com:ds9/defiant.git')
				: file("ref: refs/heads/prepare-defiant"),
	});
	const openspec = directory({ getDirectoryHandle: async () => changes });
	const handle = directory({
		getDirectoryHandle: async (name: string) => {
			if (name === ".git") return git;
			if (name === "openspec") return openspec;
			throw new Error("unexpected directory");
		},
	});
	const repository = {
		account_login: "ds9",
		repository_id: "42",
		installation_id: "12",
		full_name: "ds9/defiant",
	};
	const evidence = await readCheckout(handle, repository);
	expect(evidence?.specs).toEqual([
		expect.objectContaining({
			change_name: "prepare-defiant",
			completed: 1,
			total: 2,
			source_ref: "prepare-defiant",
		}),
	]);
	expect(
		parseTasks(
			"## Helm\n- [x] Set course\n## Observe [post-merge]\n- [ ] Watch",
		),
	).toMatchObject({ completed: 1, total: 2, pre_merge_ready: true });
	expect(await readRepositoryCheckout(repository, handle)).toBe("Resolved");
	const pullRequest = {
		installation_id: "12",
		repository_id: "42",
		head_ref: "prepare-defiant",
	};
	expect(localSpecFor(pullRequest, [pullRequest])).toMatchObject({
		change_name: "prepare-defiant",
	});
	const missingCheckout = directory({
		getDirectoryHandle: async () => {
			const error = new Error("missing checkout");
			error.name = "NotFoundError";
			throw error;
		},
	});
	expect(await readRepositoryCheckout(repository, missingCheckout)).toBe(
		"Unresolved",
	);
	expect(localSpecFor(pullRequest, [pullRequest])).toBeNull();
});

test("checkout storage and resolution use native boundaries without prompting on reload", async () => {
	const records: Array<{ key: string; handle: BrowserDirectoryHandle }> = [];
	const request = (result: unknown) => {
		const value: { result?: unknown; onsuccess?: () => void } = { result };
		queueMicrotask(() => value.onsuccess?.());
		return value;
	};
	const store = checkoutStoreFor(async () => ({
		getAll: () => request(records),
		put: (record: { key: string; handle: BrowserDirectoryHandle }) => {
			records.push(record);
			return request(undefined);
		},
	}));
	const handle = directory({
		queryPermission: async () => "granted",
		requestPermission: async () => {
			throw new Error("reload must not prompt");
		},
	});
	await store.put({ key: "crisp-inc:42", handle });
	expect(await store.getAll()).toEqual([{ key: "crisp-inc:42", handle }]);
	expect(await revalidateCheckout({ handle })).toBe("granted");
	const root = directory({
		getDirectoryHandle: async (name: string) => directory({ name }),
	});
	expect(
		await exactCheckoutDirectory(root, {
			full_name: "Crisp-Inc/dev-command-center",
		}),
	).toMatchObject({ name: "dev-command-center" });
	let persisted = false;
	expect(
		await persistVerifiedCheckout({
			handle: {},
			repository: { full_name: "crisp-inc/dev-command-center" },
			read: async () => null,
			persist: async () => {
				persisted = true;
			},
			record: { key: "crisp-inc:42" },
		}),
	).toBe(false);
	expect(persisted).toBe(false);
});

test("local OpenSpec evidence is scoped to repository identity before branch matching", () => {
	const pr = {
		installation_id: "i",
		repository_id: "one",
		head_ref: "feature/shared",
	};
	const pullRequests = [
		pr,
		{
			installation_id: "i",
			repository_id: "two",
			head_ref: "feature/shared",
		},
	];
	expect(
		localSpecFor(pr, pullRequests, [
			{
				installation_id: "i",
				repository_id: "two",
				source_ref: "feature/shared",
			},
		]),
	).toBeNull();
	expect(
		localSpecFor(pr, pullRequests, [
			{
				installation_id: "i",
				repository_id: "one",
				source_ref: "feature/shared",
			},
		]),
	).toMatchObject({ repository_id: "one" });
});

test("local OpenSpec evidence keeps all exact matches and suppresses branch fallback", () => {
	const pr = {
		installation_id: "i",
		repository_id: "one",
		head_sha: "a".repeat(40),
		head_ref: "feature/shared",
	};
	expect(
		localSpecsFor(
			pr,
			[pr],
			[
				{
					installation_id: "i",
					repository_id: "one",
					change_name: "zeta",
					source_commit: pr.head_sha,
				},
				{
					installation_id: "i",
					repository_id: "one",
					change_name: "alpha",
					source_commit: pr.head_sha,
				},
				{
					installation_id: "i",
					repository_id: "one",
					change_name: "branch",
					source_ref: pr.head_ref,
				},
			],
		),
	).toMatchObject([{ change_name: "alpha" }, { change_name: "zeta" }]);
	expect(
		blockersFor({
			...lifecycleReady,
			open_specs: [
				{ completed: 1, total: 1 },
				{ completed: 1, total: 2 },
			],
		}),
	).toEqual(["OpenSpec incomplete"]);
});

test("sort modes use deterministic direction, null-last fallbacks, and safe preferences", () => {
	expect(sortPreference(null)).toEqual({ mode: "closest", direction: "asc" });
	const sortable = [
		{
			pr: {
				...lifecycleReady,
				number: 4,
				full_name: "ds9/zeta",
				updated_at: "2026-01-04T00:00:00Z",
			},
			spec: { completed: 1, total: 2 },
		},
		{
			pr: {
				...lifecycleReady,
				number: 3,
				full_name: "ds9/alpha",
				updated_at: "2026-01-03T00:00:00Z",
			},
			spec: { completed: 3, total: 4 },
		},
		{ pr: { ...lifecycleReady, number: 2, full_name: "ds9/beta" }, spec: null },
		{
			pr: { ...lifecycleReady, number: 1, full_name: "ds9/alpha" },
			spec: null,
		},
	];
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "updated", direction: "desc" },
			}),
		),
	).toEqual([4, 3, 1, 2]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "updated", direction: "asc" },
			}),
		),
	).toEqual([3, 4, 1, 2]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "closest", direction: "desc" },
			}),
		),
	).toEqual([4, 3, 2, 1]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "progress", direction: "desc" },
			}),
		),
	).toEqual([3, 4, 1, 2]);
	expect(
		numbers(
			derivePullRequests(sortable, {
				sort: { mode: "progress", direction: "asc" },
			}),
		),
	).toEqual([4, 3, 1, 2]);
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
		mode: "closest",
		direction: "asc",
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
		).map(({ pr }) => pr.full_name),
	).toEqual(["ds9/alpha", "ds9/zeta"]);
	expect(
		derivePullRequests(
			[
				{ pr: { number: 7, full_name: "ds9/zeta" }, spec: null },
				{ pr: { number: 7, full_name: "ds9/alpha" }, spec: null },
			],
			{},
		).map(({ pr }) => pr.full_name),
	).toEqual(["ds9/alpha", "ds9/zeta"]);
});

test("closest-to-merge ranks lifecycle stage before blockers", () => {
	const sorted = derivePullRequests(
		[
			{
				pr: { ...lifecycleReady, number: 1, full_name: "ds9/ops", draft: true },
				spec: null,
			},
			{
				pr: { ...lifecycleReady, number: 2, full_name: "ds9/ops" },
				spec: null,
			},
		],
		{ sort: { mode: "closest", direction: "asc" } },
	);
	expect(sorted.map((item) => item.pr.number)).toEqual([2, 1]);
});
