import {
	defaultSortPreference,
	isSortMode,
	type SortDirection,
	type SortPreference,
} from "#/features/command-center/sort-preference";
import { openSpecGate } from "#/openspec-gate";
import { activeOpenSpecGroups } from "#/openspec-tasks";

export type OpenSpecTask = { completed: boolean; text: string };
export type OpenSpecGroup = { title: string; tasks: OpenSpecTask[] };
export type OpenSpecEvidence = {
	change_name?: string;
	completed?: number | string;
	total?: number | string;
	pre_merge_ready?: boolean;
	active_group?: OpenSpecGroup | string | null;
	active_groups?: OpenSpecGroup[] | string | null;
	incomplete_groups?: OpenSpecGroup[] | string | null;
	activeGroup?: OpenSpecGroup | string | null;
	activeGroups?: OpenSpecGroup[] | string | null;
	incompleteGroups?: OpenSpecGroup[] | string | null;
	source_type?: string;
	source_url?: string | null;
	source_ref?: string | null;
	source_commit?: string | null;
	installation_id?: string;
	account_login?: string;
	repository_id?: string;
};
export type PullRequest = {
	installation_id?: string;
	repository_id?: string;
	installation_pull_requests?: string;
	full_name?: string;
	number?: number | string;
	title?: string;
	url?: string;
	state?: string;
	draft?: boolean | number;
	mergeable?: boolean | string;
	opened_at?: string;
	labels?: string[];
	open_specs?: OpenSpecEvidence[];
	open_spec_declaration?: "absent" | "empty" | "declared" | "invalid";
	detected_open_specs?: string[];
	review_activity?: boolean;
	review_requested?: boolean;
	completed_review_count?: number;
	unresolved_review_threads?: number;
	changes_requested?: boolean;
	repository_policy_loaded?: boolean;
	required_checks?: ReadonlyArray<{ head_sha?: string; conclusion?: string }>;
	workflow_state?: string;
	checks_state?: string;
	review_state?: string;
	bot_review_state?: string | null;
	bot_review_actor?: string | null;
	head_ref?: string;
	head_sha?: string;
	updated_at?: string;
	needs_attention?: boolean;
	workflow_failures?: Array<{ name?: string; url?: string }>;
	open_spec?: OpenSpecEvidence | null;
};

const asOpenSpecGroup = (value: unknown): OpenSpecGroup | null => {
	if (!value || typeof value !== "object") return null;
	const group = value as { title?: unknown; tasks?: unknown };
	if (typeof group.title !== "string" || !Array.isArray(group.tasks)) return null;
	const tasks = group.tasks.map((task) => {
		if (!task || typeof task !== "object") return null;
		const candidate = task as { completed?: unknown; text?: unknown };
		return typeof candidate.completed === "boolean" && typeof candidate.text === "string"
			? { completed: candidate.completed, text: candidate.text }
			: null;
	});
	return tasks.every((task): task is OpenSpecTask => task !== null) ? { title: group.title, tasks } : null;
};

type ParsedEvidence<Value> = { state: "missing" | "invalid" } | { state: "valid"; value: Value };

const invalidOpenSpecEvidence = (field: string) => console.warn("Invalid OpenSpec task evidence field", field);

const parseOpenSpecValue = (value: unknown, field: string): ParsedEvidence<unknown> => {
	if (value === undefined || value === null) return { state: "missing" };
	if (typeof value !== "string") return { state: "valid", value };
	try {
		return { state: "valid", value: JSON.parse(value) };
	} catch {
		invalidOpenSpecEvidence(field);
		return { state: "invalid" };
	}
};

const parseOpenSpecGroups = (value: unknown, field: string): ParsedEvidence<OpenSpecGroup[]> => {
	const parsed = parseOpenSpecValue(value, field);
	if (parsed.state !== "valid") return parsed;
	if (!Array.isArray(parsed.value)) {
		invalidOpenSpecEvidence(field);
		return { state: "invalid" };
	}
	const groups = parsed.value.map(asOpenSpecGroup);
	if (!groups.every((group): group is OpenSpecGroup => group !== null)) {
		invalidOpenSpecEvidence(field);
		return { state: "invalid" };
	}
	return { state: "valid", value: groups.slice(0, 2) };
};

const parseOpenSpecGroup = (value: unknown, field: string): ParsedEvidence<OpenSpecGroup> => {
	const parsed = parseOpenSpecValue(value, field);
	if (parsed.state !== "valid") return parsed;
	const group = asOpenSpecGroup(parsed.value);
	if (!group) {
		invalidOpenSpecEvidence(field);
		return { state: "invalid" };
	}
	return { state: "valid", value: group };
};

export const activeOpenSpecGroupsFor = (spec: OpenSpecEvidence): OpenSpecGroup[] => {
	for (const [field, value] of [
		["active_groups", spec.active_groups],
		["activeGroups", spec.activeGroups],
	] as const) {
		const groups = parseOpenSpecGroups(value, field);
		if (groups.state === "valid") return groups.value;
	}
	for (const [field, value] of [
		["active_group", spec.active_group],
		["activeGroup", spec.activeGroup],
	] as const) {
		const group = parseOpenSpecGroup(value, field);
		if (group.state === "valid") return [group.value];
	}
	return [];
};
export const incompleteOpenSpecGroupsFor = (spec: OpenSpecEvidence): OpenSpecGroup[] => {
	for (const [field, value] of [
		["incomplete_groups", spec.incomplete_groups],
		["incompleteGroups", spec.incompleteGroups],
	] as const) {
		const groups = parseOpenSpecGroups(value, field);
		if (groups.state === "valid") return groups.value;
	}
	return activeOpenSpecGroupsFor(spec);
};
export type PullRequestItem = { pr: PullRequest; spec?: OpenSpecEvidence | null; localSpecs?: OpenSpecEvidence[] };
export type DerivedPullRequest = PullRequestItem & {
	bucket: Lifecycle["stage"];
	score: number;
	blockers: string[];
	progress: number | null;
};
export type ViewState = {
	query: string;
	statuses: Set<string>;
	repositories: Set<string> | null;
	attention: boolean;
	failedActions: boolean;
	failedChecks: boolean;
	sort: SortPreference;
};
export type Lifecycle = {
	stage: "closed" | "draft" | "openspec" | "ready" | "reviewing" | "mergeable";
	blockers: string[];
};
export type MergeControl =
	| { state: "enabled" }
	| { state: "permission-required" | "closed" | "draft" | "blocked"; reason: string };

export const normalized = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase();
export const detectedOpenSpecCandidatesFor = (pr: PullRequest) => {
	const authoritativeNames = new Set(
		[...(pr.open_specs ?? []), ...(pr.open_spec ? [pr.open_spec] : [])]
			.map((spec) => normalized(spec.change_name))
			.filter(Boolean),
	);
	return (pr.detected_open_specs ?? []).filter((candidate) => !authoritativeNames.has(normalized(candidate)));
};
const distance = (left: string, right: string) => {
	let prior = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let row = 1; row <= left.length; row++) {
		const next = [row];
		for (let column = 1; column <= right.length; column++)
			next[column] = Math.min(
				next[column - 1] + 1,
				prior[column] + 1,
				prior[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
			);
		prior = next;
	}
	return prior[right.length];
};
export const fuzzyScore = (query: unknown, value: unknown) => {
	const needle = normalized(query);
	const haystack = normalized(value);
	if (!needle || haystack === needle) return 0;
	if (haystack.startsWith(needle)) return 1;
	if (haystack.includes(needle)) return 2;
	return haystack.split(/[^a-z0-9]+/).some((word) => word && distance(needle, word) <= 2)
		? 3
		: Number.POSITIVE_INFINITY;
};
export const isProjectedMergeable = (pr: PullRequest) =>
	pr.mergeable === true || ["true", "clean"].includes(normalized(pr.mergeable));
const failedState = (value: unknown) =>
	[
		"action_required",
		"action-required",
		"cancelled",
		"canceled",
		"failed",
		"failure",
		"timed_out",
		"timed-out",
	].includes(normalized(value));
const specsFor = (pr: PullRequest, spec?: OpenSpecEvidence | null) => pr.open_specs ?? (spec ? [spec] : []);
const reviewActivityFor = (pr: PullRequest) =>
	pr.review_activity === true ||
	pr.review_requested === true ||
	Number(pr.completed_review_count) > 0 ||
	["approved", "commented", "changes_requested", "complete"].includes(normalized(pr.review_state)) ||
	["approved", "commented", "changes_requested", "complete"].includes(normalized(pr.bot_review_state));
const completedReviewFor = (pr: PullRequest) =>
	Number(pr.completed_review_count) > 0 ||
	["approved", "commented", "complete"].includes(normalized(pr.review_state)) ||
	["approved", "commented", "complete"].includes(normalized(pr.bot_review_state));
const requiredChecksReady = (pr: PullRequest) =>
	Array.isArray(pr.required_checks) &&
	pr.required_checks.every(
		(check) =>
			check.head_sha === pr.head_sha && ["success", "neutral", "skipped"].includes(normalized(check.conclusion)),
	);
export const lifecycleFor = (pr: PullRequest, spec?: OpenSpecEvidence | null): Lifecycle => {
	if (["closed", "merged"].includes(normalized(pr.state))) return { stage: "closed", blockers: [] };
	if (pr.draft) return { stage: "draft", blockers: ["Draft"] };
	const specs = specsFor(pr, spec);
	const gate = openSpecGate(specs, pr.labels ?? [], pr);
	if (!gate.ready)
		return {
			stage: "openspec",
			blockers: [
				gate.blocker === "confirm"
					? "Confirm OpenSpec association"
					: gate.applicable && specs.length
						? "OpenSpec incomplete"
						: "No OpenSpec found",
			],
		};
	if (!reviewActivityFor(pr)) return { stage: "ready", blockers: [] };
	const blockers = [
		...(completedReviewFor(pr) ? [] : ["Review pending"]),
		...(pr.unresolved_review_threads === 0
			? []
			: pr.unresolved_review_threads && pr.unresolved_review_threads > 0
				? ["Unresolved review threads"]
				: ["Review threads unavailable"]),
		...(pr.changes_requested === false
			? []
			: pr.changes_requested === true
				? ["Changes requested"]
				: ["Review state unavailable"]),
		...(pr.repository_policy_loaded === true ? [] : ["Repository policy unavailable"]),
		...(requiredChecksReady(pr) ? [] : ["Required checks incomplete"]),
		...(isProjectedMergeable(pr)
			? []
			: [
					["blocked", "conflicting", "dirty", "false", "unmergeable"].includes(normalized(pr.mergeable))
						? "Mergeability blocked"
						: "Mergeability unknown",
				]),
	];
	return { stage: blockers.length ? "reviewing" : "mergeable", blockers };
};
export const bucketFor = (pr: PullRequest, spec?: OpenSpecEvidence | null) => lifecycleFor(pr, spec).stage;
export const blockersFor = (pr: PullRequest, spec?: OpenSpecEvidence | null) => lifecycleFor(pr, spec).blockers;
const progressFor = (spec?: OpenSpecEvidence | null) =>
	spec && Number.isFinite(Number(spec.completed)) && Number.isFinite(Number(spec.total)) && Number(spec.total) > 0
		? Number(spec.completed) / Number(spec.total)
		: null;
const nullableCompare = (left: number | null, right: number | null, direction: SortDirection = "asc") => {
	if (left === null) return right === null ? 0 : 1;
	if (right === null) return -1;
	return (left < right ? -1 : left > right ? 1 : 0) * (direction === "desc" ? -1 : 1);
};
const providerTime = (value?: string) => {
	const time = Date.parse(value ?? "");
	return Number.isFinite(time) ? time : null;
};
const codePointCompare = (left: unknown, right: unknown) => {
	const a = normalized(left);
	const b = normalized(right);
	return a < b ? -1 : a > b ? 1 : 0;
};
const identityTie = (left: DerivedPullRequest, right: DerivedPullRequest) =>
	codePointCompare(left.pr.full_name, right.pr.full_name) ||
	codePointCompare(left.pr.repository_id, right.pr.repository_id) ||
	Number(left.pr.number) - Number(right.pr.number);
const closestCompare = (left: DerivedPullRequest, right: DerivedPullRequest, direction: SortDirection = "asc") => {
	const stageRank = { mergeable: 0, reviewing: 1, ready: 2, openspec: 3, draft: 4, closed: 5 } as const;
	const ordered =
		stageRank[left.bucket] - stageRank[right.bucket] ||
		nullableCompare(left.blockers.length, right.blockers.length) ||
		nullableCompare(left.progress, right.progress, "desc") ||
		identityTie(left, right);
	return direction === "desc" ? -ordered : ordered;
};
const sortCompare = (left: DerivedPullRequest, right: DerivedPullRequest, sort: SortPreference) => {
	const fallback = () => closestCompare(left, right);
	if (sort.mode === "opened")
		return (
			nullableCompare(providerTime(left.pr.opened_at), providerTime(right.pr.opened_at), sort.direction) ||
			identityTie(left, right)
		);
	if (sort.mode === "closest") return closestCompare(left, right, sort.direction);
	if (sort.mode === "updated")
		return (
			nullableCompare(providerTime(left.pr.updated_at), providerTime(right.pr.updated_at), sort.direction) || fallback()
		);
	if (sort.mode === "progress") return nullableCompare(left.progress, right.progress, sort.direction) || fallback();
	return codePointCompare(left.pr.full_name, right.pr.full_name) * (sort.direction === "desc" ? -1 : 1) || fallback();
};
const searchScore = ({ pr, spec }: PullRequestItem, query: string) => {
	if (!query) return 0;
	if (/^\d+$/.test(query)) return Number(query) === Number(pr.number) ? 0 : Number.POSITIVE_INFINITY;
	return Math.min(
		fuzzyScore(query, pr.title),
		fuzzyScore(query, pr.full_name),
		fuzzyScore(query, pr.head_ref),
		fuzzyScore(query, spec?.change_name),
	);
};
export const derivePullRequests = (
	items: PullRequestItem[],
	filters: Partial<ViewState> = {},
): DerivedPullRequest[] => {
	const query = normalized(filters.query);
	const statuses = filters.statuses;
	const repositories = filters.repositories === undefined ? null : filters.repositories;
	const failedActions = filters.failedActions ?? false;
	const failedChecks = filters.failedChecks ?? false;
	const attention = filters.attention ?? false;
	const matchesSelection = (item: DerivedPullRequest) =>
		statuses?.has(item.bucket) ||
		(attention && (item.pr.needs_attention === true || item.blockers.length > 0)) ||
		(failedActions && failedState(item.pr.workflow_state)) ||
		(failedChecks && failedState(item.pr.checks_state));
	const sort = filters.sort && isSortMode(filters.sort.mode) ? filters.sort : defaultSortPreference;
	return items
		.map((item) => {
			const lifecycle = lifecycleFor(item.pr, item.spec);
			return {
				...item,
				bucket: lifecycle.stage,
				score: searchScore(item, query),
				blockers: lifecycle.blockers,
				progress: progressFor(item.spec),
			};
		})
		.filter(
			(item) =>
				item.bucket !== "closed" &&
				Number.isFinite(item.score) &&
				(statuses === undefined
					? (!failedActions || failedState(item.pr.workflow_state)) &&
						(!failedChecks || failedState(item.pr.checks_state)) &&
						(!attention || item.pr.needs_attention === true || item.blockers.length > 0)
					: matchesSelection(item)) &&
				(repositories === null || (typeof item.pr.full_name === "string" && repositories.has(item.pr.full_name))),
		)
		.sort((left, right) => sortCompare(left, right, sort));
};
export const repositoryOptions = (items: PullRequestItem[]) =>
	[...new Set(items.map(({ pr }) => pr.full_name).filter((name): name is string => typeof name === "string"))].sort(
		codePointCompare,
	);
export const orderedOpenSpecs = (specs: OpenSpecEvidence[]) => {
	const unique = new Map<string, OpenSpecEvidence>();
	for (const spec of specs) {
		const key = [spec.change_name, spec.source_commit, spec.source_ref].map(String).join("\u0000");
		if (!unique.has(key)) unique.set(key, spec);
	}
	return [...unique.values()].sort(
		(a, b) =>
			["change_name", "source_commit", "source_ref"]
				.map((key) =>
					String(a[key as keyof OpenSpecEvidence] ?? "").localeCompare(String(b[key as keyof OpenSpecEvidence] ?? "")),
				)
				.find(Boolean) ?? 0,
	);
};
export const parseTasks = (content: string) => {
	const groups: OpenSpecGroup[] = [];
	let title = "Tasks";
	for (const line of content.split(/\r?\n/)) {
		const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
		if (heading) {
			title = heading[1];
			continue;
		}
		const task = line.match(/^\s*- \[([ xX])\]\s+(.+?)\s*$/);
		if (!task) continue;
		let group = groups.at(-1);
		if (!group || group.title !== title) {
			group = { title, tasks: [] };
			groups.push(group);
		}
		group.tasks.push({ completed: task[1].toLowerCase() === "x", text: task[2] });
	}
	const tasks = groups.flatMap((group) => group.tasks);
	const activeGroups = activeOpenSpecGroups(groups);
	const incompleteGroups = groups.filter((group) => group.tasks.some((task) => !task.completed)).slice(0, 2);
	return {
		completed: tasks.filter((task) => task.completed).length,
		total: tasks.length,
		pre_merge_ready: !activeGroups.length,
		active_group: activeGroups[0] ?? null,
		active_groups: activeGroups,
		incomplete_groups: incompleteGroups,
	};
};
const mergeUnavailableReason = "GitHub App Pull requests write permission approval is required.";
export const mergeControlFor = (pr: PullRequest): MergeControl => {
	const gates: Array<{ blocked: boolean; state: Exclude<MergeControl["state"], "enabled"> }> = [
		{ blocked: pr.installation_pull_requests !== "write", state: "permission-required" },
		{ blocked: pr.state !== "open", state: "closed" },
		{ blocked: Boolean(pr.draft), state: "draft" },
		{ blocked: lifecycleFor(pr).stage !== "mergeable", state: "blocked" },
	];
	const blocked = gates.find((gate) => gate.blocked);
	return blocked ? { state: blocked.state, reason: mergeUnavailableReason } : { state: "enabled" };
};
