import { expect, test } from "vitest";
import type { BrowserDirectoryHandle } from "#/web/app";
import {
	appearanceFor,
	blockersFor,
	bucketFor,
	checkoutKey,
	checkoutStateFor,
	checkoutStoreFor,
	derivePullRequests,
	exactCheckoutDirectory,
	fuzzyScore,
	loadFailureFor,
	localSpecFor,
	mergeControlFor,
	parseTasks,
	persistVerifiedCheckout,
	readCheckout,
	readRepositoryCheckout,
	repositoryForRemote,
	repositoryOptions,
	revalidateCheckout,
	sortPreference,
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

type ViewItem = { pr: Record<string, unknown> };
const numbers = (views: ViewItem[]) => views.map(({ pr }) => Number(pr.number));

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
	expect(
		mergeControlFor({
			installation_pull_requests: "write",
			state: "open",
			draft: false,
			mergeable: "clean",
		}),
	).toEqual({ state: "enabled" });
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
	expect(parseTasks("## Helm\n- [x] Set course").completed).toBe(1);
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
		).map(({ pr }) => pr.full_name),
	).toEqual(["ds9/alpha", "ds9/zeta"]);
});
