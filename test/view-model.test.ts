import { expect, test, vi } from "vitest";
import {
	activeOpenSpecGroupsFor,
	derivePullRequests,
	detectedOpenSpecCandidatesFor,
	fuzzyScore,
	incompleteOpenSpecGroupsFor,
	lifecycleFor,
	mergeControlFor,
	orderedOpenSpecs,
	repositoryOptions,
} from "#/features/command-center/view-model";

const ready = {
	labels: ["openspec-not-required"],
	review_activity: true,
	completed_review_count: 1,
	unresolved_review_threads: 0,
	changes_requested: false,
	repository_policy_loaded: true,
	required_checks: [],
	mergeable: "clean",
};

const numbers = (items: ReturnType<typeof derivePullRequests>) => items.map(({ pr }) => Number(pr.number));

test("derives lifecycle precedence and authoritative OpenSpec blockers", () => {
	expect(lifecycleFor({ state: "closed" })).toEqual({ stage: "closed", blockers: [] });
	expect(lifecycleFor({ ...ready, draft: true })).toEqual({ stage: "draft", blockers: ["Draft"] });
	expect(lifecycleFor({ ...ready })).toEqual({ stage: "mergeable", blockers: [] });
	expect(lifecycleFor({ ...ready, open_spec_declaration: "invalid" })).toEqual({
		stage: "openspec",
		blockers: ["No OpenSpec found"],
	});
	expect(lifecycleFor({ ...ready, open_spec_declaration: "absent", detected_open_specs: ["wormhole-chart"] })).toEqual({
		stage: "openspec",
		blockers: ["Confirm OpenSpec association"],
	});
	expect(lifecycleFor({ ...ready, open_specs: [{ change_name: "defiant", completed: 1, total: 2 }] })).toEqual({
		stage: "openspec",
		blockers: ["OpenSpec incomplete"],
	});
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
			spec: { completed: 1, total: 2 },
		},
		{
			pr: {
				...ready,
				number: 3,
				full_name: "ds9/alpha",
				opened_at: "2026-01-03T00:00:00Z",
				updated_at: "2026-01-03T00:00:00Z",
			},
			spec: { completed: 3, total: 4 },
		},
		{ pr: { ...ready, number: 2, full_name: "ds9/beta" } },
		{ pr: { ...ready, number: 1, full_name: "ds9/alpha" } },
	];
	for (const mode of ["opened", "closest", "updated", "progress", "repository"] as const)
		for (const direction of ["asc", "desc"] as const)
			expect(numbers(derivePullRequests(items, { sort: { mode, direction } }))).toHaveLength(4);
	expect(numbers(derivePullRequests(items, { sort: { mode: "opened", direction: "asc" } }))).toEqual([3, 4, 1, 2]);
	expect(numbers(derivePullRequests(items, { sort: { mode: "opened", direction: "desc" } }))).toEqual([4, 3, 1, 2]);
	expect(numbers(derivePullRequests(items, { sort: { mode: "repository", direction: "asc" } }))).toEqual([1, 3, 2, 4]);
	expect(numbers(derivePullRequests(items, { sort: { mode: "repository", direction: "desc" } }))).toEqual([4, 2, 1, 3]);
});

test("orders and deduplicates authoritative OpenSpecs and enables merge only when lifecycle-ready", () => {
	expect(
		orderedOpenSpecs([
			{ change_name: "zeta", source_commit: "a" },
			{ change_name: "alpha", source_commit: "b" },
			{ change_name: "zeta", source_commit: "a" },
		]).map(({ change_name }) => change_name),
	).toEqual(["alpha", "zeta"]);
	expect(
		lifecycleFor({
			...ready,
			open_specs: [
				{ completed: 1, total: 2 },
				{ completed: 2, total: 2 },
			],
		}),
	).toMatchObject({ stage: "openspec" });
	expect(mergeControlFor({ ...ready, installation_pull_requests: "write", state: "open", draft: false })).toEqual({
		state: "enabled",
	});
	expect(
		mergeControlFor({
			...ready,
			installation_pull_requests: "write",
			state: "open",
			draft: false,
			open_specs: [{ completed: 1, total: 2 }],
		}),
	).toMatchObject({ state: "blocked" });
});

test("normalizes bounded OpenSpec groups while retaining legacy records", () => {
	const current = { title: "Current", tasks: [{ completed: false, text: "Reconfigure the deflector" }] };
	const next = { title: "Next", tasks: [{ completed: false, text: "Test the warp core" }] };
	expect(activeOpenSpecGroupsFor({ active_groups: [current, next, { title: "Later", tasks: [] }] })).toEqual([
		current,
		next,
	]);
	expect(activeOpenSpecGroupsFor({ active_groups: JSON.stringify([current, next]) })).toEqual([current, next]);
	expect(activeOpenSpecGroupsFor({ activeGroups: JSON.stringify([current, next]) })).toEqual([current, next]);
	expect(activeOpenSpecGroupsFor({ active_group: JSON.stringify(current) })).toEqual([current]);
	expect(activeOpenSpecGroupsFor({ activeGroup: JSON.stringify(current) })).toEqual([current]);
	expect(activeOpenSpecGroupsFor({ active_groups: [] })).toEqual([]);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	expect(activeOpenSpecGroupsFor({ active_groups: "{", activeGroup: JSON.stringify(current) })).toEqual([current]);
	expect(
		activeOpenSpecGroupsFor({
			active_groups: [{ title: "Broken", tasks: [{ completed: "no", text: "Invalid" }] }] as unknown as [],
			active_group: current,
		}),
	).toEqual([current]);
	expect(warn).toHaveBeenCalledWith("Invalid OpenSpec task evidence field", "active_groups");
	warn.mockRestore();
});

test("prefers display-only incomplete OpenSpec groups with active-group fallbacks", () => {
	const postMerge = { title: "2.2 Observe [post-merge]", tasks: [{ completed: false, text: "Confirm the relay" }] };
	const current = { title: "Current", tasks: [{ completed: false, text: "Reconfigure the deflector" }] };
	expect(incompleteOpenSpecGroupsFor({ incomplete_groups: [postMerge], active_groups: [] })).toEqual([postMerge]);
	expect(incompleteOpenSpecGroupsFor({ active_groups: [current] })).toEqual([current]);
});

test("keeps only detected OpenSpec candidates absent from authoritative evidence", () => {
	expect(
		detectedOpenSpecCandidatesFor({
			open_specs: [{ change_name: "Defiant repair" }],
			open_spec: { change_name: "legacy-wormhole" },
			detected_open_specs: ["defiant repair", "LEGACY-WORMHOLE", "local-runabout"],
		}),
	).toEqual(["local-runabout"]);
});

test("browser-local OpenSpecs are informational and cannot affect authoritative lifecycle or merge controls", () => {
	const authoritative = {
		...ready,
		installation_pull_requests: "write",
		state: "open",
		draft: false,
		labels: [],
		open_specs: [],
		open_spec_declaration: "empty" as const,
	};
	const localComplete = { change_name: "local-defiant", completed: 9, total: 9, source_type: "local" };
	const localIncomplete = { change_name: "local-wormhole", completed: 1, total: 9, source_type: "local" };
	const [withoutLocal] = derivePullRequests([{ pr: authoritative }]);
	const [derived] = derivePullRequests([{ pr: authoritative, localSpecs: [localComplete, localIncomplete] }]);
	expect(derived.localSpecs).toEqual([localComplete, localIncomplete]);
	expect(derived.bucket).toBe(withoutLocal.bucket);
	expect(derived.blockers).toEqual(withoutLocal.blockers);
	expect(derived).toMatchObject({ bucket: "openspec", blockers: ["No OpenSpec found"] });
	expect(numbers(derivePullRequests([{ pr: authoritative }], { attention: true }))).toEqual(
		numbers(derivePullRequests([{ pr: authoritative, localSpecs: [localComplete] }], { attention: true })),
	);
	expect(mergeControlFor(authoritative)).toMatchObject({ state: "blocked" });
	const blocked = { ...authoritative, open_specs: [{ change_name: "authoritative", completed: 1, total: 2 }] };
	expect(derivePullRequests([{ pr: blocked, localSpecs: [localComplete] }])[0]).toMatchObject({
		bucket: "openspec",
		blockers: ["OpenSpec incomplete"],
	});
	expect(mergeControlFor(blocked)).toMatchObject({ state: "blocked" });
	const notRequired = { ...ready, installation_pull_requests: "write", state: "open", draft: false, open_specs: [] };
	expect(mergeControlFor(notRequired)).toEqual({ state: "enabled" });
});
