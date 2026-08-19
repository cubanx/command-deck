type SortMode = "closest" | "updated" | "number" | "progress" | "repository";
type SortDirection = "asc" | "desc";
type SortPreference = { mode: SortMode; direction: SortDirection };
type CheckoutResolution = "resolved" | "unresolved";
type CheckoutState =
	| "Unsupported"
	| "Permission required"
	| "Resolved"
	| "Unresolved"
	| "Error";
type OpenSpecTask = { completed: boolean; text: string };
type OpenSpecGroup = { title: string; tasks: OpenSpecTask[] };
type OpenSpecEvidence = {
	change_name?: string;
	completed?: number | string;
	total?: number | string;
	active_group?: OpenSpecGroup | string | null;
	source_type?: string;
	source_url?: string | null;
	source_ref?: string | null;
	source_commit?: string | null;
	installation_id?: string;
	account_login?: string;
	repository_id?: string;
};
type WorkflowFailure = { name?: string; url?: string };
type PullRequest = {
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
	workflow_state?: string;
	checks_state?: string;
	review_state?: string;
	bot_review_state?: string | null;
	bot_review_actor?: string | null;
	head_ref?: string;
	head_sha?: string;
	updated_at?: string;
	needs_attention?: boolean;
	workflow_failures?: WorkflowFailure[];
	open_spec?: OpenSpecEvidence | null;
};
type NotificationProjection = { id: string; title: string; body: string };
type DeploymentProjection = {
	id?: string;
	full_name?: string;
	environment?: string;
	ref?: string;
	sha?: string;
	state?: string;
	target_url?: string | null;
	log_url?: string | null;
};
type DashboardSnapshot = {
	error?: string;
	stale?: boolean;
	user?: { login: string; avatar_url?: string; fixture_avatar?: boolean };
	pullRequests: PullRequest[];
	deployments: DeploymentProjection[];
	repositories: Repository[];
	notifications: NotificationProjection[];
};
export type BrowserFileHandle = {
	getFile(): Promise<{ text(): Promise<string> }>;
};
export type BrowserDirectoryHandle = {
	name?: string;
	kind?: string;
	getDirectoryHandle(name: string): Promise<BrowserDirectoryHandle>;
	getFileHandle(name: string): Promise<BrowserFileHandle>;
	entries(): AsyncIterable<[string, BrowserDirectoryHandle]>;
	queryPermission(options: { mode: "read" }): Promise<PermissionState>;
	requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};
type CheckoutRecord = {
	key: string;
	account?: string;
	kind?: "root" | "override";
	handle?: BrowserDirectoryHandle;
};
type RequestLike = {
	result?: unknown;
	error?: unknown;
	onerror?: IDBRequest["onerror"] | (() => void);
	onsuccess?: IDBRequest["onsuccess"] | (() => void);
};
type Repository = {
	account_login: string;
	repository_id: string;
	installation_id: string;
	full_name: string;
};
type PullRequestItem = { pr: PullRequest; spec?: OpenSpecEvidence | null };
type DerivedPullRequest = PullRequestItem & {
	bucket: string;
	score: number;
	blockers: string[];
	progress: number | null;
};
type ViewState = {
	query: string;
	statuses: Set<string>;
	repositories: Set<string> | null;
	attention: boolean;
	failedActions: boolean;
	failedChecks: boolean;
	sort: SortPreference;
};

const errorName = (error: unknown) =>
	error instanceof Error ? error.name : "unknown error";
const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;
const hasOnlyOptionalStrings = (
	value: Record<string, unknown>,
	keys: string[],
) =>
	keys.every(
		(key) => value[key] === undefined || typeof value[key] === "string",
	);
const hasOnlyOptionalNullableStrings = (
	value: Record<string, unknown>,
	keys: string[],
) =>
	keys.every(
		(key) =>
			value[key] === undefined ||
			value[key] === null ||
			typeof value[key] === "string",
	);
const isOpenSpecGroup = (value: unknown): value is OpenSpecGroup =>
	isRecord(value) &&
	typeof value.title === "string" &&
	Array.isArray(value.tasks) &&
	value.tasks.every(
		(task) =>
			isRecord(task) &&
			typeof task.completed === "boolean" &&
			typeof task.text === "string",
	);
const isOpenSpecEvidence = (value: unknown): value is OpenSpecEvidence =>
	isRecord(value) &&
	hasOnlyOptionalStrings(value, [
		"change_name",
		"source_type",
		"installation_id",
		"account_login",
		"repository_id",
	]) &&
	hasOnlyOptionalNullableStrings(value, [
		"source_url",
		"source_ref",
		"source_commit",
	]) &&
	["completed", "total"].every(
		(key) =>
			value[key] === undefined ||
			typeof value[key] === "string" ||
			typeof value[key] === "number",
	) &&
	(value.active_group === undefined ||
		value.active_group === null ||
		typeof value.active_group === "string" ||
		isOpenSpecGroup(value.active_group));
const isPullRequest = (value: unknown): value is PullRequest =>
	isRecord(value) &&
	hasOnlyOptionalStrings(value, [
		"installation_id",
		"repository_id",
		"installation_pull_requests",
		"full_name",
		"title",
		"url",
		"state",
		"workflow_state",
		"checks_state",
		"review_state",
		"head_ref",
		"head_sha",
		"updated_at",
	]) &&
	hasOnlyOptionalNullableStrings(value, [
		"bot_review_state",
		"bot_review_actor",
	]) &&
	(value.number === undefined ||
		typeof value.number === "number" ||
		typeof value.number === "string") &&
	(value.draft === undefined ||
		typeof value.draft === "boolean" ||
		typeof value.draft === "number") &&
	(value.mergeable === undefined ||
		typeof value.mergeable === "boolean" ||
		typeof value.mergeable === "string") &&
	(value.open_spec === undefined ||
		value.open_spec === null ||
		isOpenSpecEvidence(value.open_spec)) &&
	(value.needs_attention === undefined ||
		typeof value.needs_attention === "boolean") &&
	(value.workflow_failures === undefined ||
		(Array.isArray(value.workflow_failures) &&
			value.workflow_failures.every(
				(item) =>
					isRecord(item) && hasOnlyOptionalStrings(item, ["name", "url"]),
			)));
const isDeployment = (value: unknown): value is DeploymentProjection =>
	isRecord(value) &&
	hasOnlyOptionalStrings(value, [
		"id",
		"full_name",
		"environment",
		"ref",
		"sha",
		"state",
	]) &&
	hasOnlyOptionalNullableStrings(value, ["target_url", "log_url"]);
const isRepository = (value: unknown): value is Repository =>
	isRecord(value) &&
	typeof value.account_login === "string" &&
	typeof value.repository_id === "string" &&
	typeof value.installation_id === "string" &&
	typeof value.full_name === "string";
const isBrowserDirectoryHandle = (
	value: unknown,
): value is BrowserDirectoryHandle =>
	isRecord(value) &&
	typeof value.getDirectoryHandle === "function" &&
	typeof value.getFileHandle === "function" &&
	typeof value.entries === "function" &&
	typeof value.queryPermission === "function" &&
	typeof value.requestPermission === "function";
const isCheckoutRecord = (value: unknown): value is CheckoutRecord =>
	isRecord(value) &&
	typeof value.key === "string" &&
	isBrowserDirectoryHandle(value.handle);
export const avatarUrlFor = (value: unknown) => {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
};
export const pageFor = (pathname: unknown) =>
	pathname === "/configuration" ? "configuration" : "dashboard";
const snapshotFor = (value: unknown): DashboardSnapshot | null => {
	if (!isRecord(value)) return null;
	const pullRequests = Array.isArray(value.pullRequests)
			? value.pullRequests.filter(isPullRequest)
			: [],
		deployments = Array.isArray(value.deployments)
			? value.deployments.filter(isDeployment)
			: [],
		repositories = Array.isArray(value.repositories)
			? value.repositories.filter(isRepository)
			: [],
		notifications = Array.isArray(value.notifications)
			? value.notifications.filter(
					(item): item is NotificationProjection =>
						isRecord(item) &&
						typeof item.id === "string" &&
						typeof item.title === "string" &&
						typeof item.body === "string",
				)
			: [],
		avatarUrl = isRecord(value.user)
			? avatarUrlFor(value.user.avatar_url)
			: null,
		user =
			isRecord(value.user) && typeof value.user.login === "string"
				? {
						login: value.user.login,
						...(avatarUrl ? { avatar_url: avatarUrl } : {}),
						...(value.user.fixture_avatar === true
							? { fixture_avatar: true }
							: {}),
					}
				: undefined;
	return {
		error: typeof value.error === "string" ? value.error : undefined,
		stale: value.stale === true,
		user,
		pullRequests,
		deployments,
		repositories,
		notifications,
	};
};
const root = globalThis.document?.querySelector<HTMLElement>("#app");
const esc = (value: unknown) =>
	String(value ?? "").replace(
		/[&<>"']/g,
		(char: string) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				char
			] ?? char,
	);
const tone = (value: unknown) =>
	/success|complete|clean|approved/i.test(String(value))
		? "green"
		: /fail|error|conflict|change/i.test(String(value))
			? "red"
			: /pending|unknown|stale/i.test(String(value))
				? "yellow"
				: "blue";
const badge = (label: string, value: unknown) =>
	'<span class="status ' +
	tone(value) +
	'">' +
	esc(label) +
	": " +
	esc(value ?? "unknown") +
	"</span>";
let known: Set<string> | null = null,
	current: DashboardSnapshot | null = null,
	localSpecs: OpenSpecEvidence[] = [],
	localFiles = new Map<string, BrowserFileHandle>(),
	repositoryCatalog: Repository[] = [],
	checkoutHandles = new Map<string, CheckoutRecord>(),
	checkoutStates = new Map<string, CheckoutState>(),
	reconciliationState: "idle" | "running" = "idle",
	reconcileMessage = "",
	statusDetailKey: string | null = null,
	statusDetailPinned = false,
	statusDetailTimer: ReturnType<typeof setTimeout> | null = null,
	statusDetailPosition = { left: 12, top: 12 },
	view: ViewState = {
		query: "",
		statuses: new Set(),
		repositories: null,
		attention: false,
		failedActions: false,
		failedChecks: false,
		sort: { mode: "closest", direction: "asc" },
	};

const appearanceKey = "dcc-appearance";
export const appearanceFor = ({
	preference: storedPreference,
	systemDark = false,
}: {
	preference?: unknown;
	systemDark?: boolean;
} = {}) => {
	const preference = ["system", "dark", "light"].includes(
		String(storedPreference),
	)
		? (storedPreference as "system" | "dark" | "light")
		: "system";
	let theme = preference;
	if (preference === "system") theme = systemDark ? "dark" : "light";
	return { preference, theme };
};
const appearancePreference = () => {
	try {
		return appearanceFor({
			preference: globalThis.localStorage?.getItem(appearanceKey),
			systemDark: globalThis.matchMedia?.("(prefers-color-scheme: dark)")
				.matches,
		});
	} catch (error) {
		console.error("Appearance preference read failed", errorName(error));
		return appearanceFor();
	}
};
const applyAppearance = (value: unknown) => {
	const appearance = appearanceFor({
		preference: value,
		systemDark: globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches,
	});
	document.documentElement.dataset.appearance = appearance.theme;
	document.documentElement.style.colorScheme = appearance.theme;
	return appearance;
};
const saveAppearance = (value: string) => {
	try {
		globalThis.localStorage?.setItem(appearanceKey, value);
		applyAppearance(value);
	} catch (error) {
		console.error("Appearance preference save failed", errorName(error));
	}
};

const normalized = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase();
const defaultSort: SortPreference = { mode: "closest", direction: "asc" };
const sortModes = new Set<string>([
	"closest",
	"updated",
	"number",
	"progress",
	"repository",
]);
const isSortMode = (value: unknown): value is SortMode =>
	typeof value === "string" && sortModes.has(value);
const isSortDirection = (value: unknown): value is SortDirection =>
	value === "asc" || value === "desc";
export const sortPreference = (stored: unknown): SortPreference => {
	try {
		const value: unknown = JSON.parse(String(stored));
		return isRecord(value) &&
			isSortMode(value.mode) &&
			isSortDirection(value.direction)
			? { mode: value.mode, direction: value.direction }
			: defaultSort;
	} catch {
		return defaultSort;
	}
};
const loadSortPreference = () => {
	try {
		return sortPreference(globalThis.localStorage?.getItem("dcc-pr-sort"));
	} catch (error) {
		console.error("Pull request sort read failed", errorName(error));
		return defaultSort;
	}
};
const saveSortPreference = () => {
	try {
		globalThis.localStorage?.setItem("dcc-pr-sort", JSON.stringify(view.sort));
	} catch (error) {
		console.error("Pull request sort save failed", errorName(error));
	}
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
	const needle = normalized(query),
		haystack = normalized(value);
	if (!needle) return 0;
	if (haystack === needle) return 0;
	if (haystack.startsWith(needle)) return 1;
	if (haystack.includes(needle)) return 2;
	return haystack
		.split(/[^a-z0-9]+/)
		.some((word) => word && distance(needle, word) <= 2)
		? 3
		: Number.POSITIVE_INFINITY;
};
export const isProjectedMergeable = (pr: PullRequest) =>
	pr.mergeable === true || ["true", "clean"].includes(normalized(pr.mergeable));
export const bucketFor = (pr: PullRequest) =>
	pr.draft ? "draft" : isProjectedMergeable(pr) ? "mergeable" : "ready";
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
export const blockersFor = (
	pr: PullRequest,
	spec?: OpenSpecEvidence | null,
) => {
	const blockers = [];
	if (pr.draft) blockers.push("Draft");
	if (normalized(pr.review_state) === "changes_requested")
		blockers.push("Changes requested");
	if (failedState(pr.workflow_state)) blockers.push("Actions failed");
	if (failedState(pr.checks_state)) blockers.push("Checks failed");
	if (
		pr.mergeable === false ||
		["blocked", "conflicting", "dirty", "false", "unmergeable"].includes(
			normalized(pr.mergeable),
		)
	)
		blockers.push("Mergeability blocked");
	if (
		spec &&
		Number.isFinite(Number(spec.completed)) &&
		Number.isFinite(Number(spec.total)) &&
		Number(spec.total) > 0 &&
		Number(spec.completed) < Number(spec.total)
	)
		blockers.push("OpenSpec incomplete");
	return blockers;
};
const progressFor = (spec?: OpenSpecEvidence | null) =>
	spec &&
	Number.isFinite(Number(spec.completed)) &&
	Number.isFinite(Number(spec.total)) &&
	Number(spec.total) > 0
		? Number(spec.completed) / Number(spec.total)
		: null;
const nullableCompare = (
	left: number | null,
	right: number | null,
	direction: SortDirection = "asc",
) => {
	if (left === null) return right === null ? 0 : 1;
	if (right === null) return -1;
	return (
		(left < right ? -1 : left > right ? 1 : 0) * (direction === "desc" ? -1 : 1)
	);
};
const providerTime = (value?: string) => {
	const time = Date.parse(value ?? "");
	return Number.isFinite(time) ? time : null;
};
const codePointCompare = (left: unknown, right: unknown) => {
	const a = normalized(left),
		b = normalized(right);
	return a < b ? -1 : a > b ? 1 : 0;
};
const repositoryTie = (left: DerivedPullRequest, right: DerivedPullRequest) =>
	codePointCompare(left.pr.full_name, right.pr.full_name) ||
	codePointCompare(left.pr.repository_id, right.pr.repository_id);
const numberCompare = (left: DerivedPullRequest, right: DerivedPullRequest) =>
	Number(right.pr.number) - Number(left.pr.number) ||
	repositoryTie(left, right);
const closestCompare = (
	left: DerivedPullRequest,
	right: DerivedPullRequest,
	direction: SortDirection = "asc",
) =>
	nullableCompare(left.blockers.length, right.blockers.length, direction) ||
	nullableCompare(left.progress, right.progress, "desc") ||
	numberCompare(left, right);
const sortCompare = (
	left: DerivedPullRequest,
	right: DerivedPullRequest,
	sort: SortPreference,
) => {
	const fallback = () => closestCompare(left, right);
	if (sort.mode === "closest")
		return closestCompare(left, right, sort.direction);
	if (sort.mode === "updated")
		return (
			nullableCompare(
				providerTime(left.pr.updated_at),
				providerTime(right.pr.updated_at),
				sort.direction,
			) || fallback()
		);
	if (sort.mode === "number")
		return (
			nullableCompare(
				Number(left.pr.number),
				Number(right.pr.number),
				sort.direction,
			) ||
			repositoryTie(left, right) ||
			fallback()
		);
	if (sort.mode === "progress")
		return (
			nullableCompare(left.progress, right.progress, sort.direction) ||
			fallback()
		);
	return (
		codePointCompare(left.pr.full_name, right.pr.full_name) *
			(sort.direction === "desc" ? -1 : 1) || fallback()
	);
};
const searchScore = ({ pr, spec }: PullRequestItem, query: string) => {
	if (!query) return 0;
	if (/^\d+$/.test(query))
		return Number(query) === Number(pr.number) ? 0 : Number.POSITIVE_INFINITY;
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
	const statuses = filters.statuses ?? new Set();
	const repositories = filters.repositories === undefined ? null : filters.repositories;
	const failedActions = filters.failedActions ?? false;
	const failedChecks = filters.failedChecks ?? false;
	const attention = filters.attention ?? false;
	const sort =
		filters.sort && sortModes.has(filters.sort.mode)
			? filters.sort
			: defaultSort;
	return items
		.map((item) => ({
			...item,
			bucket: bucketFor(item.pr),
			score: searchScore(item, query),
			blockers: blockersFor(item.pr, item.spec),
			progress: progressFor(item.spec),
		}))
		.filter(
			(item) =>
				Number.isFinite(item.score) &&
				(!statuses.size || statuses.has(item.bucket)) &&
				(!failedActions || failedState(item.pr.workflow_state)) &&
				(!failedChecks || failedState(item.pr.checks_state)) &&
				(!attention ||
					item.pr.needs_attention === true ||
					item.blockers.length > 0) &&
				(repositories === null ||
					(typeof item.pr.full_name === "string" &&
						repositories.has(item.pr.full_name))),
		)
		.sort((left, right) => sortCompare(left, right, sort));
};
export const repositoryOptions = (items: PullRequestItem[]) =>
	[
		...new Set(
			items
				.map(({ pr }) => pr.full_name)
				.filter((name): name is string => typeof name === "string"),
		),
	]
		.sort(codePointCompare);
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
		group.tasks.push({
			completed: task[1].toLowerCase() === "x",
			text: task[2],
		});
	}
	const tasks = groups.flatMap((group) => group.tasks);
	return {
		completed: tasks.filter((task) => task.completed).length,
		total: tasks.length,
		active_group:
			groups.find((group) => group.tasks.some((task) => !task.completed)) ??
			null,
	};
};
const checkoutDatabase = () =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open("dcc-checkouts", 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore("handles", { keyPath: "key" });
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
const requestResult = (request: RequestLike) =>
	new Promise((resolve, reject) => {
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
export const checkoutStoreFor = <Record>(
	open: () => Promise<{
		getAll(): RequestLike;
		put(record: Record): RequestLike;
	}>,
) => ({
	getAll: async () => {
		const store = await open();
		return requestResult(store.getAll());
	},
	put: async (record: Record) => {
		const store = await open();
		return requestResult(store.put(record));
	},
});
const checkoutStore = () =>
	checkoutStoreFor(async () => {
		const database = (await checkoutDatabase()) as IDBDatabase;
		return {
			getAll: () =>
				database.transaction("handles").objectStore("handles").getAll(),
			put: (record: CheckoutRecord) =>
				database
					.transaction("handles", "readwrite")
					.objectStore("handles")
					.put(record),
		};
	});
const storedCheckouts = () => checkoutStore().getAll();
const persistCheckout = (record: CheckoutRecord) => checkoutStore().put(record);
export const exactCheckoutDirectory = (
	root: Pick<BrowserDirectoryHandle, "getDirectoryHandle">,
	repository: Pick<Repository, "full_name">,
) =>
	root.getDirectoryHandle(
		repository.full_name.split("/").at(-1) ?? repository.full_name,
	);
export const revalidateCheckout = (record: {
	handle: Pick<BrowserDirectoryHandle, "queryPermission">;
}) => record.handle.queryPermission({ mode: "read" });
export const persistVerifiedCheckout = async <Handle, Repo, Record>({
	handle,
	repository,
	read,
	persist,
	record,
}: {
	handle: Handle;
	repository: Repo;
	read(handle: Handle, repository: Repo): Promise<unknown>;
	persist(record: Record): Promise<unknown>;
	record: Record;
}) => {
	if (!(await read(handle, repository))) return false;
	await persist(record);
	return true;
};
const permissionFor = async (record: CheckoutRecord) => {
	if (!record.handle) throw new TypeError("Checkout handle is missing");
	const permission = await revalidateCheckout({ handle: record.handle });
	checkoutStates.set(
		record.key,
		checkoutStateFor({
			supported: checkoutSupported(),
			permission,
			resolution: "unresolved",
		}),
	);
	return permission;
};
const setCheckoutError = (key: string, error: unknown) => {
	checkoutStates.set(key, "Error");
	console.error("Local checkout read failed", errorName(error));
};
const clearRepositoryEvidence = (repository: Repository) => {
	const key = checkoutKey(repository.account_login, repository.repository_id);
	localSpecs = localSpecs.filter(
		(item) =>
			item.installation_id !== repository.installation_id ||
			item.repository_id !== repository.repository_id,
	);
	for (const name of localFiles.keys())
		if (name.startsWith(`${key}:`)) localFiles.delete(name);
};
const invalidateRepositoryCheckout = (
	repository: Repository,
	state: Exclude<CheckoutState, "Resolved">,
) => {
	clearRepositoryEvidence(repository);
	checkoutStates.set(
		checkoutKey(repository.account_login, repository.repository_id),
		state,
	);
};
const invalidateAccountCheckouts = (
	account: string,
	state: Exclude<CheckoutState, "Resolved">,
) => {
	for (const repository of repositoryCatalog)
		if (normalized(repository.account_login) === normalized(account))
			invalidateRepositoryCheckout(repository, state);
};
export const readCheckout = async (
	handle: BrowserDirectoryHandle,
	repository: Repository,
) => {
	const git = await handle.getDirectoryHandle(".git");
	const configHandle = await git.getFileHandle("config");
	const config = await configHandle.getFile();
	const configText = await config.text();
	if (repositoryForRemote(configText) !== normalized(repository.full_name))
		return null;
	const headHandle = await git.getFileHandle("HEAD");
	const head = await headHandle.getFile();
	const value = (await head.text()).trim();
	const ref = value.match(/^ref: refs\/heads\/([A-Za-z0-9._/-]+)$/);
	const source_ref = ref && !ref[1].includes("..") ? ref[1] : null;
	const source_commit = /^[0-9a-f]{40}$/i.test(value) ? value : null;
	const specs: OpenSpecEvidence[] = [];
	const files = new Map<string, BrowserFileHandle>();
	let changes: BrowserDirectoryHandle;
	try {
		const openspec = await handle.getDirectoryHandle("openspec");
		changes = await openspec.getDirectoryHandle("changes");
	} catch (error) {
		if (errorName(error) === "NotFoundError") return { specs, files };
		throw error;
	}
	for await (const [name, directory] of changes.entries()) {
		if (directory.kind !== "directory" || !/^[A-Za-z0-9._-]+$/.test(name))
			continue;
		try {
			const fileHandle = await directory.getFileHandle("tasks.md");
			const file = await fileHandle.getFile();
			const text = await file.text();
			specs.push({
				change_name: name,
				...parseTasks(text),
				source_ref,
				source_commit,
				source_type: "local",
				installation_id: repository.installation_id,
				account_login: repository.account_login,
				repository_id: repository.repository_id,
			});
			files.set(name, fileHandle);
		} catch (error) {
			if (errorName(error) !== "NotFoundError")
				console.error("Local OpenSpec read failed", errorName(error));
		}
	}
	return { specs, files };
};
export const readRepositoryCheckout = async (
	repository: Repository,
	handle: BrowserDirectoryHandle,
) => {
	const key = checkoutKey(repository.account_login, repository.repository_id);
	try {
		const evidence = await readCheckout(handle, repository);
		if (!evidence) {
			invalidateRepositoryCheckout(repository, "Unresolved");
			return "Unresolved";
		}
		clearRepositoryEvidence(repository);
		localSpecs.push(...evidence.specs);
		for (const [name, file] of evidence.files)
			localFiles.set(`${key}:${name}`, file);
		checkoutStates.set(key, "Resolved");
		return "Resolved";
	} catch (error) {
		if (["NotFoundError", "TypeMismatchError"].includes(errorName(error))) {
			invalidateRepositoryCheckout(repository, "Unresolved");
			return "Unresolved";
		}
		clearRepositoryEvidence(repository);
		setCheckoutError(key, error);
		return "Error";
	}
};
const resolveCheckouts = async (repositories: Repository[]) => {
	if (!checkoutSupported()) {
		for (const repository of repositories)
			invalidateRepositoryCheckout(repository, "Unsupported");
		return;
	}
	for (const repository of repositories) {
		const key = checkoutKey(repository.account_login, repository.repository_id),
			override = checkoutHandles.get(key),
			root = checkoutHandles.get(rootKey(repository.account_login)),
			record = override ?? root;
		if (!record) {
			invalidateRepositoryCheckout(repository, "Unresolved");
			continue;
		}
		try {
			if ((await permissionFor(record)) !== "granted") {
				invalidateRepositoryCheckout(repository, "Permission required");
				continue;
			}
		} catch (error) {
			clearRepositoryEvidence(repository);
			setCheckoutError(key, error);
			continue;
		}
		if (override?.handle)
			await readRepositoryCheckout(repository, override.handle);
		else {
			try {
				if (!root?.handle) throw new TypeError("Checkout root is missing");
				const handle = await exactCheckoutDirectory(root.handle, repository);
				await readRepositoryCheckout(repository, handle);
			} catch (error) {
				if (["NotFoundError", "TypeMismatchError"].includes(errorName(error)))
					invalidateRepositoryCheckout(repository, "Unresolved");
				else {
					clearRepositoryEvidence(repository);
					setCheckoutError(key, error);
				}
			}
		}
	}
};
const restoreCheckouts = async (repositories: Repository[]) => {
	try {
		if (!checkoutSupported()) return await resolveCheckouts(repositories);
		const stored = await storedCheckouts();
		if (!Array.isArray(stored)) throw new TypeError("Invalid checkout storage");
		for (const record of stored.filter(isCheckoutRecord))
			checkoutHandles.set(record.key, record);
		await resolveCheckouts(repositories);
	} catch (error) {
		for (const repository of repositories)
			invalidateRepositoryCheckout(repository, "Error");
		console.error("Local checkout restore failed", errorName(error));
	}
};
const groupFor = (item: OpenSpecEvidence) => {
	if (!item.active_group) return null;
	if (isOpenSpecGroup(item.active_group)) return item.active_group;
	try {
		const parsed: unknown = JSON.parse(item.active_group);
		return isOpenSpecGroup(parsed) ? parsed : null;
	} catch (error) {
		console.error("OpenSpec group parse failed", errorName(error));
		return null;
	}
};
const sourceFor = (item: OpenSpecEvidence) =>
	item.source_type === "local"
		? '<a href="#" data-local-source="' +
			esc(
				`${checkoutKey(item.account_login, item.repository_id)}:${item.change_name}`,
			) +
			'">Open local tasks</a>'
		: item.source_url
			? '<a href="' +
				esc(item.source_url) +
				'" target="_blank" rel="noopener noreferrer">Open tasks</a>'
			: "";
export const checkoutKey = (account: unknown, repositoryId: unknown) =>
	`${normalized(account)}:${String(repositoryId)}`;
const rootKey = (account: unknown) => `root:${normalized(account)}`;
const checkoutSupported = () =>
	Boolean(
		globalThis.indexedDB &&
			typeof browserGlobal.showDirectoryPicker === "function",
	);
export const checkoutStateFor = ({
	supported,
	permission,
	resolution = "unresolved",
}: {
	supported: boolean;
	permission?: unknown;
	resolution?: CheckoutResolution;
}): CheckoutState =>
	!supported
		? "Unsupported"
		: permission !== "granted"
			? "Permission required"
			: resolution === "resolved"
				? "Resolved"
				: "Unresolved";
export const repositoryForRemote = (content: unknown) => {
	const origin = String(content ?? "").match(
		/^\[remote "origin"\]([\s\S]*?)(?=^\[|(?![\s\S]))/m,
	);
	const match = origin?.[1].match(
		/^\s*url\s*=\s*(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\s*$/im,
	);
	return match
		? normalized(`${match[1]}/${match[2].replace(/\.git$/i, "")}`)
		: null;
};
export const localSpecFor = (
	pr: PullRequest,
	pullRequests: PullRequest[],
	specs = localSpecs,
) => {
	const scoped = specs.filter(
		(item) =>
			item.installation_id === pr.installation_id &&
			item.repository_id === pr.repository_id,
	);
	const commitMatches = scoped.filter(
		(item) => item.source_commit && item.source_commit === pr.head_sha,
	);
	const uniqueCommit =
		pullRequests.filter(
			(item) =>
				item.installation_id === pr.installation_id &&
				item.repository_id === pr.repository_id &&
				pr.head_sha &&
				item.head_sha === pr.head_sha,
		).length === 1;
	if (commitMatches.length === 1 && uniqueCommit) return commitMatches[0];
	const branchMatches = scoped.filter(
		(item) => item.source_ref && item.source_ref === pr.head_ref,
	);
	const uniqueBranch =
		pullRequests.filter(
			(item) =>
				item.installation_id === pr.installation_id &&
				item.repository_id === pr.repository_id &&
				pr.head_ref &&
				item.head_ref === pr.head_ref,
		).length === 1;
	if (branchMatches.length === 1 && uniqueBranch) return branchMatches[0];
	return null;
};
const specFor = (pr: PullRequest, pullRequests: PullRequest[]) =>
	localSpecFor(pr, pullRequests) ?? pr.open_spec;
const openSpecMarkup = (item?: OpenSpecEvidence | null) => {
	if (!item) return "";
	const group = groupFor(item);
	const title = group?.title ?? "Complete";
	return (
		'<details class="openspec"><summary><strong>OpenSpec · ' +
		esc(item.change_name) +
		" · " +
		esc(item.completed) +
		"/" +
		esc(item.total) +
		" · " +
		esc(title) +
		"</strong> " +
		sourceFor(item) +
		"</summary>" +
		(group
			? '<ul class="tasks">' +
				group.tasks
					.map(
						(task: OpenSpecTask) =>
							'<li><label><input type="checkbox" disabled ' +
							(task.completed ? "checked" : "") +
							"> " +
							esc(task.text) +
							"</label></li>",
					)
					.join("") +
				"</ul>"
			: '<p class="muted">All tasks complete.</p>') +
		"</details>"
	);
};
const workflowFailuresMarkup = (pr: PullRequest) => {
	const failures = Array.isArray(pr.workflow_failures)
		? pr.workflow_failures
		: [];
	return failures.length
		? '<ul class="workflow-failures" aria-label="Failed Actions workflows">' +
				failures
					.map(
						(item) =>
							'<li><a href="' +
							esc(item.url) +
							'" target="_blank" rel="noopener noreferrer">' +
							esc(item.name) +
							"</a></li>",
					)
					.join("") +
				"</ul>"
		: "";
};
const statusKeyFor = (pr: PullRequest) =>
	[pr.installation_id, pr.repository_id, pr.number].map(String).join(":");
export const statusDetailHoverDelay = 350;
export const statusDetailPositionFor = (
	trigger: { left: number; top: number; width: number; height: number },
	viewport: { width: number; height: number },
) => ({
	left: Math.max(12, Math.min(trigger.left, viewport.width - 372)),
	top: Math.max(
		12,
		Math.min(trigger.top + trigger.height + 8, viewport.height - 252),
	),
});
export const statusDetailStateFor = (
	state: { key: string | null; pinned: boolean },
	key: string | null,
	event: "inspect" | "activate" | "dismiss" | "leave",
) => {
	if (event === "dismiss") return { key: null, pinned: false };
	if (event === "leave") return state;
	if (event === "activate" && state.key === key && state.pinned)
		return { key: null, pinned: false };
	return { key, pinned: event === "activate" };
};
const stageLabel = (bucket: string) =>
	({ draft: "Draft", ready: "Ready for review", mergeable: "Mergeable" })[
		bucket
	] ?? "Ready for review";
const lifecycleMarkup = (item: DerivedPullRequest) => {
	const stages = ["draft", "ready", "mergeable"];
	const current = stages.indexOf(item.bucket);
	const pills = stages
		.map(
			(stage, index) =>
				`<span class="lifecycle-pill ${index < current ? "complete" : index === current ? "current" : "upcoming"}">${index < current ? "✓" : index === current ? "◐" : "○"} ${esc(stageLabel(stage))} · ${index < current ? "Complete" : index === current ? "Current" : "Upcoming"}</span>`,
		)
		.join("");
	return `<div class="lifecycle-rail"><span class="sr-only">PR lifecycle. Current stage: ${esc(stageLabel(item.bucket))}</span><span class="lifecycle-pills" aria-hidden="true">${pills}</span></div>`;
};
const warningMarkup = (item: DerivedPullRequest) => {
	const warning =
		item.blockers[0] ?? (item.pr.needs_attention ? "Needs attention" : "");
	return warning
		? `<button type="button" class="status warning" data-status-detail="${esc(statusKeyFor(item.pr))}">${esc(warning)}</button>`
		: "";
};
const lifecycleFrameMarkup = (item: DerivedPullRequest) =>
	`<fieldset class="pr-lifecycle"><legend class="pr-lifecycle-title">PR Lifecycle</legend>${lifecycleMarkup(item)}</fieldset>`;
const warningRowMarkup = (item: DerivedPullRequest) => {
	const warning = warningMarkup(item);
	return warning ? `<div class="pr-warning-row">${warning}</div>` : "";
};
export const pullRequestStatusMarkup = (item: DerivedPullRequest) =>
	lifecycleFrameMarkup(item) +
	warningRowMarkup(item) +
	statusDetailMarkup(item);
const statusDetailMarkup = (item: DerivedPullRequest) => {
	const { pr, spec, blockers } = item;
	return `<aside id="status-detail" class="status-detail" role="dialog" aria-label="Pull request status detail" style="left:${statusDetailPosition.left}px;top:${statusDetailPosition.top}px"><button type="button" data-status-detail-close aria-label="Close status detail">×</button><p><strong>${esc(stageLabel(item.bucket))}</strong>${blockers.length ? ` · ${esc(blockers.join(", "))}` : ""}</p><p>Actions: ${esc(pr.workflow_state ?? "unknown")} · Checks: ${esc(pr.checks_state ?? "unknown")} · Review: ${esc(pr.review_state ?? "unknown")} · Mergeability: ${esc(pr.mergeable ?? "unknown")}</p>${pr.bot_review_state ? `<p>Automated review${pr.bot_review_actor ? ` · ${esc(pr.bot_review_actor)}` : ""}: ${esc(pr.bot_review_state)}</p>` : ""}${workflowFailuresMarkup(pr)}<p class="muted">Branch: ${esc(pr.head_ref ?? "unknown")} · SHA: ${esc(pr.head_sha ?? "unknown")} · Updated: ${esc(pr.updated_at ?? "unknown")}</p>${openSpecMarkup(spec)}</aside>`;
};
const deploymentLabel = (deployment: DeploymentProjection) =>
	[deployment.full_name, deployment.environment, deployment.ref, deployment.sha]
		.filter((value): value is string => Boolean(value?.trim()))
		.join(" · ");
const deploymentRowsMarkup = (deployments: DeploymentProjection[]) =>
	deployments.length
		? `<div class="stack">${deployments
				.map(
					(deployment) =>
						"<article><h3>" +
						esc(deploymentLabel(deployment) || "Unknown deployment") +
						'</h3><div class="statuses">' +
						badge("status", deployment.state) +
						"</div>" +
						(deployment.target_url
							? '<p><a href="' +
								esc(deployment.target_url) +
								'" target="_blank" rel="noopener noreferrer">Deployment</a>' +
								(deployment.log_url
									? ' · <a href="' +
										esc(deployment.log_url) +
										'" target="_blank" rel="noopener noreferrer">Logs</a>'
									: "") +
								"</p>"
							: "") +
						"</article>",
				)
				.join("")}</div>`
		: '<p class="muted">No recent deployment evidence.</p>';
const deploymentDetailMarkup = (deployments: DeploymentProjection[]) =>
	`<aside id="status-detail" class="status-detail" role="dialog" aria-label="Deployment detail" style="left:${statusDetailPosition.left}px;top:${statusDetailPosition.top}px"><button type="button" data-status-detail-close aria-label="Close deployment detail">×</button><h2>GitHub deployments · last 48 hours</h2>${deploymentRowsMarkup(deployments.slice(0, 5))}${deployments.length > 5 ? `<details class="more-deployments"><summary>More deployments</summary>${deploymentRowsMarkup(deployments.slice(5))}</details>` : ""}</aside>`;
const deploymentSummaryMarkup = (deployments: DeploymentProjection[]) => {
	const deployment = deployments[0];
	return deployment
		? `<button type="button" class="deployment-summary" data-status-detail="deployments" aria-expanded="${statusDetailKey === "deployments"}" aria-controls="status-detail"><span class="deployment-summary-label">Latest deployment</span><span class="deployment-summary-detail">${esc(deploymentLabel(deployment) || "Unknown deployment")}</span><span class="status">${esc(deployment.state ?? "unknown")}</span></button>`
		: "";
};
type MergeControl =
	| { state: "enabled" }
	| {
			state: "permission-required" | "closed" | "draft" | "blocked";
			reason: string;
	  };
const mergeUnavailableReason =
	"GitHub App Pull requests write permission approval is required.";
export const mergeControlFor = (pr: PullRequest): MergeControl => {
	const gates: Array<{ blocked: boolean; state: MergeControl["state"] }> = [
		{
			blocked: pr.installation_pull_requests !== "write",
			state: "permission-required",
		},
		{ blocked: pr.state !== "open", state: "closed" },
		{ blocked: Boolean(pr.draft), state: "draft" },
		{ blocked: !isProjectedMergeable(pr), state: "blocked" },
	];
	const blocked = gates.find((gate) => gate.blocked);
	return blocked
		? {
				state: blocked.state as Exclude<MergeControl["state"], "enabled">,
				reason: mergeUnavailableReason,
			}
		: { state: "enabled" };
};
export const mergeMarkup = (pr: PullRequest) =>
	mergeControlFor(pr).state === "enabled"
		? '<form method="post" action="/api/merge/start"><input type="hidden" name="installationId" value="' +
			esc(pr.installation_id) +
			'"><input type="hidden" name="repositoryId" value="' +
			esc(pr.repository_id) +
			'"><input type="hidden" name="number" value="' +
			esc(pr.number) +
			'"><input type="hidden" name="headSha" value="' +
			esc(pr.head_sha) +
			'"><button type="submit">Merge</button></form>'
		: "";
const controlsMarkup = (
	all: PullRequestItem[],
	visible: DerivedPullRequest[],
) => {
	const repositories = repositoryOptions(all);
	const statusLabel = {
		mergeable: "Mergeable",
		ready: "Ready for review",
		draft: "Draft",
	};
	const statusFilters = Object.entries(statusLabel)
		.map(
			([value, label]) =>
				`<label class="filter-pill"><input id="status-${value}" type="checkbox" data-status="${value}" ${view.statuses.has(value) ? "checked" : ""}>${esc(label)}</label>`,
		)
		.join("");
	const repositoryChoices = repositories.length
		? repositories
				.map(
					(name, index) =>
						`<label><input id="repository-${index}" type="checkbox" data-repository="${esc(name)}" ${view.repositories === null || view.repositories.has(name) ? "checked" : ""}>${esc(name)}</label>`,
				)
				.join("")
		: '<span class="muted">No repositories.</span>';
	const repositoryGroup = `<fieldset class="repository-filter"><legend>Repositories</legend><div class="repository-options">${repositoryChoices}</div></fieldset>`;
	const searchGroup = `<div class="control-group search-results"><label for="pr-search">Search pull requests</label><input id="pr-search" type="search" value="${esc(view.query)}" autocomplete="off"><span id="pr-count" aria-live="polite">${esc(visible.length)} of ${esc(all.length)} pull requests</span><button id="clear-pr-filters" type="button">Clear</button></div>`;
	const filterGroup = `<div class="control-group filters"><fieldset><legend>Lifecycle stage</legend>${statusFilters}</fieldset><fieldset><legend>Attention</legend><label class="filter-pill"><input id="attention" type="checkbox" data-attention-filter ${view.attention ? "checked" : ""}>Needs attention</label></fieldset><fieldset><legend>Failed state</legend><label class="filter-pill"><input id="failed-actions" type="checkbox" data-aggregate-filter="failedActions" ${view.failedActions ? "checked" : ""}>Failed Actions</label><label class="filter-pill"><input id="failed-checks" type="checkbox" data-aggregate-filter="failedChecks" ${view.failedChecks ? "checked" : ""}>Failed Checks</label></fieldset></div>`;
	const directionLabel =
		view.sort.mode === "number"
			? "PR number direction: Newest first or Oldest first"
			: "Sort direction";
	const sortingGroup = `<div class="control-group sorting"><label for="pr-sort">Sort pull requests</label><select id="pr-sort"><option value="closest" ${view.sort.mode === "closest" ? "selected" : ""}>Closest to merge</option><option value="updated" ${view.sort.mode === "updated" ? "selected" : ""}>Recently updated</option><option value="number" ${view.sort.mode === "number" ? "selected" : ""}>PR number</option><option value="progress" ${view.sort.mode === "progress" ? "selected" : ""}>OpenSpec progress</option><option value="repository" ${view.sort.mode === "repository" ? "selected" : ""}>Repository</option></select><label for="pr-direction">${directionLabel}</label><select id="pr-direction"><option value="asc" ${view.sort.direction === "asc" ? "selected" : ""}>Ascending</option><option value="desc" ${view.sort.direction === "desc" ? "selected" : ""}>Descending</option></select></div>`;
	return `<div class="pr-controls">${repositoryGroup}${filterGroup}${sortingGroup}${searchGroup}</div>`;
};
const checkoutActionMarkup = (repository: Repository, state: CheckoutState) => {
	const key = checkoutKey(repository.account_login, repository.repository_id);
	const permissionButton =
		state === "Permission required"
			? ` <button type="button" data-checkout-permission="${esc(key)}">Grant permission</button>`
			: "";
	return `<button type="button" data-connect-repository="${esc(key)}">Choose checkout</button>${permissionButton}`;
};
const checkoutTableMarkup = (
	caption: string,
	emptyMessage: string,
	rows: { repository: Repository; state: CheckoutState }[],
) =>
	`<table><caption>${caption}</caption><thead><tr><th scope="col">Repository</th><th scope="col">Account</th><th scope="col">State</th><th scope="col">Action</th></tr></thead><tbody>${rows.length ? rows.map(({ repository, state }) => `<tr><td>${esc(repository.full_name)}</td><td>${esc(repository.account_login)}</td><td aria-live="polite">${esc(state)}</td><td>${checkoutActionMarkup(repository, state)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">${emptyMessage}</td></tr>`}</tbody></table>`;
const checkoutMarkup = () => {
	if (!checkoutSupported())
		return '<p class="muted" aria-live="polite">Local checkout access is Unsupported in this browser. Committed GitHub OpenSpecs remain available.</p>';
	if (!repositoryCatalog.length)
		return '<p class="muted">No authorized repositories are available for local checkout mapping.</p>';
	const rows = repositoryCatalog
		.map((repository) => ({
			repository,
			state:
				checkoutStates.get(
					checkoutKey(repository.account_login, repository.repository_id),
				) ?? "Unresolved",
		}))
		.sort((left, right) =>
			left.repository.full_name.localeCompare(
				right.repository.full_name,
				undefined,
				{
					sensitivity: "accent",
				},
			),
		);
	const roots = [
		...new Set(repositoryCatalog.map(({ account_login }) => account_login)),
	]
		.map(
			(account, index) =>
				`<p><strong>${esc(account)}</strong> <button id="checkout-root-${index}" type="button" data-connect-root="${esc(account)}">Connect organization root</button></p>`,
		)
		.join("");
	return `<section class="checkout-mappings" aria-labelledby="checkout-title"><h3 id="checkout-title">Local checkouts</h3>${roots}${checkoutTableMarkup(
		"Unresolved",
		"No unresolved checkouts.",
		rows.filter(({ state }) => state !== "Resolved"),
	)}${checkoutTableMarkup(
		"Resolved",
		"No resolved checkouts.",
		rows.filter(({ state }) => state === "Resolved"),
	)}</section>`;
};
const appearanceMenuMarkup = () => {
	const selected = appearancePreference().preference;
	return (
		'<fieldset class="appearance-menu"><legend>Appearance</legend>' +
		["system", "light", "dark"]
			.map((value) => {
				const checked = selected === value;
				const label = value[0].toUpperCase() + value.slice(1);
				return `<label><input type="radio" data-appearance-choice name="menu-appearance" value="${value}" ${checked ? "checked" : ""}><span>${label}</span><span class="appearance-check" aria-hidden="true">${checked ? "✓" : ""}</span></label>`;
			})
			.join("") +
		"</fieldset>"
	);
};
const configurationMarkup = () =>
	'<section class="card configuration" aria-labelledby="configuration-title"><h2 id="configuration-title">Configuration</h2><p><a href="/">Back to dashboard</a></p>' +
	checkoutMarkup() +
	'<div class="actions"><button id="notify" type="button">Enable notifications</button><button id="reconcile" type="button" ' +
	(reconciliationState === "running" ? "disabled" : "") +
	">" +
	(reconciliationState === "running" ? "Reconciling…" : "Reconcile now") +
	'</button></div><p id="reconcile-status" class="muted" aria-live="polite">' +
	esc(reconcileMessage) +
	"</p></section>";
const avatarMenuMarkup = (user?: DashboardSnapshot["user"]) => {
	const login = user?.login || "User";
	const avatarUrl = avatarUrlFor(user?.avatar_url);
	const avatar = user?.fixture_avatar
		? '<img class="user-avatar" src="/avatar-fixture.svg" alt="">'
		: avatarUrl
			? `<img class="user-avatar" src="${esc(avatarUrl)}" alt="">`
			: `<span class="user-avatar avatar-fallback" aria-hidden="true">${esc(login.slice(0, 1).toUpperCase())}</span>`;
	return `<details class="avatar-menu"><summary aria-label="User menu">${avatar}</summary><div class="avatar-menu-panel"><p><strong>${esc(login)}</strong></p>${appearanceMenuMarkup()}<a class="configuration-link" href="/configuration">⚙ Configuration</a></div></details>`;
};
const rerender = (focusSelector: string) => {
	render(current);
	const control = document.querySelector<HTMLInputElement>(focusSelector);
	control?.focus();
	if (control?.setSelectionRange)
		control.setSelectionRange(control.value.length, control.value.length);
};
const bindControls = () => {
	document
		.querySelector<HTMLInputElement>("#pr-search")
		?.addEventListener("input", (event) => {
			view.query = (event.currentTarget as HTMLInputElement).value;
			rerender("#pr-search");
		});
	document
		.querySelectorAll<HTMLInputElement>("[data-status]")
		.forEach((input) => {
			input.addEventListener("change", () => {
				const status = input.dataset.status;
				if (!status) return;
				input.checked
					? view.statuses.add(status)
					: view.statuses.delete(status);
				rerender(`#${input.id}`);
			});
		});
	document
		.querySelectorAll<HTMLInputElement>("[data-attention-filter]")
		.forEach((input) => {
			input.addEventListener("change", () => {
				view.attention = input.checked;
				rerender(`#${input.id}`);
			});
		});
	document
		.querySelector<HTMLSelectElement>("#pr-sort")
		?.addEventListener("change", (event) => {
			view.sort = {
				...view.sort,
				mode: (event.currentTarget as HTMLSelectElement).value as SortMode,
			};
			saveSortPreference();
			rerender("#pr-sort");
		});
	document
		.querySelector<HTMLSelectElement>("#pr-direction")
		?.addEventListener("change", (event) => {
			view.sort = {
				...view.sort,
				direction: (event.currentTarget as HTMLSelectElement)
					.value as SortDirection,
			};
			saveSortPreference();
			rerender("#pr-direction");
		});
	document
		.querySelectorAll<HTMLInputElement>("[data-repository]")
		.forEach((input) => {
			input.addEventListener("change", () => {
				const repository = input.dataset.repository;
				if (!repository) return;
				if (view.repositories === null)
					view.repositories = new Set(
						[...document.querySelectorAll<HTMLInputElement>("[data-repository]")]
							.map(({ dataset }) => dataset.repository)
							.filter((name): name is string => Boolean(name)),
					);
				input.checked
					? view.repositories.add(repository)
					: view.repositories.delete(repository);
				rerender(`#${input.id}`);
			});
		});
	document.querySelector("#clear-pr-filters")?.addEventListener("click", () => {
		view = {
			query: "",
			statuses: new Set(),
		repositories: null,
		attention: false,
			failedActions: false,
			failedChecks: false,
			sort: view.sort,
		};
		rerender("#pr-search");
	});
};
const bindStatusDetails = () => {
	const clearStatusDetailTimer = () => {
		if (statusDetailTimer) clearTimeout(statusDetailTimer);
		statusDetailTimer = null;
	};
	document
		.querySelectorAll<HTMLElement>("[data-status-detail]")
		.forEach((trigger) => {
			const focusSelector = `[data-status-detail="${trigger.dataset.statusDetail}"]`;
			const position = () => {
				const rect = trigger.getBoundingClientRect();
				statusDetailPosition = statusDetailPositionFor(rect, {
					width: globalThis.innerWidth || 1024,
					height: globalThis.innerHeight || 768,
				});
			};
			const show = (restoreFocus = false) => {
				const next = statusDetailStateFor(
					{ key: statusDetailKey, pinned: statusDetailPinned },
					trigger.dataset.statusDetail ?? null,
					"inspect",
				);
				statusDetailKey = next.key;
				statusDetailPinned = next.pinned;
				position();
				if (restoreFocus) rerender(focusSelector);
				else render(current);
			};
			trigger.addEventListener("pointerenter", () => {
				clearStatusDetailTimer();
				statusDetailTimer = setTimeout(show, statusDetailHoverDelay);
			});
			trigger.addEventListener("pointerleave", () => {
				clearStatusDetailTimer();
				const next = statusDetailStateFor(
					{ key: statusDetailKey, pinned: statusDetailPinned },
					null,
					"leave",
				);
				if (next.key !== statusDetailKey) {
					statusDetailKey = next.key;
					statusDetailPinned = next.pinned;
					render(current);
				}
			});
			trigger.addEventListener("focus", () => {
				clearStatusDetailTimer();
				show(true);
			});
			trigger.addEventListener("click", () => {
				clearStatusDetailTimer();
				const next = statusDetailStateFor(
					{ key: statusDetailKey, pinned: statusDetailPinned },
					trigger.dataset.statusDetail ?? null,
					"activate",
				);
				statusDetailKey = next.key;
				statusDetailPinned = next.pinned;
				position();
				rerender(focusSelector);
			});
		});
	document
		.querySelector("[data-status-detail-close]")
		?.addEventListener("click", () => {
			const next = statusDetailStateFor(
				{ key: statusDetailKey, pinned: statusDetailPinned },
				null,
				"dismiss",
			);
			statusDetailKey = next.key;
			statusDetailPinned = next.pinned;
			render(current);
		});
};
const render = (x: DashboardSnapshot | null) => {
	if (!root || !x) return;
	current = x;
	if (x.error) {
		root.innerHTML =
			'<div class="card error">' +
			esc(x.error) +
			' <a href="/auth/github">Sign in</a></div>';
		return;
	}
	const rows = <Item>(
		items: Item[],
		empty: string,
		fn: (item: Item) => string,
	) =>
		items.length
			? `<div class="stack">${items.map(fn).join("")}</div>`
			: `<p class="muted">${empty}</p>`;
	const allPullRequests = x.pullRequests.map((pr) => ({
		pr,
		spec: specFor(pr, x.pullRequests),
	}));
	const prs = derivePullRequests(allPullRequests, view);
	const statusDetail = statusDetailKey
		? derivePullRequests(allPullRequests).find(
				(item) => statusKeyFor(item.pr) === statusDetailKey,
			)
		: null;
	const headerMarkup =
		'<header><a class="brand brand-home" href="/"><img class="brand-icon" src="/icon-adaptive.svg" alt=""><div><h1>Command Deck.ai</h1><p class="muted">Open pull requests you authored.</p></div></a>' +
		deploymentSummaryMarkup(x.deployments) +
		avatarMenuMarkup(x.user) +
		"</header>";
	const dashboardMarkup =
		'<section class="card" aria-label="Pull requests">' +
		controlsMarkup(allPullRequests, prs) +
		rows(prs, "No open authored pull requests.", (item) => {
			const pr = item.pr;
			return (
				'<article class="card"><div class="pr-card-header"><h3><a href="' +
				esc(pr.url) +
				'" class="pr-title-link" data-status-detail="' +
				esc(statusKeyFor(pr)) +
				'" aria-expanded="' +
				(statusDetailKey === statusKeyFor(pr) ? "true" : "false") +
				'" aria-controls="status-detail" target="_blank" rel="noopener noreferrer">#' +
				esc(pr.number) +
				" · " +
				esc(pr.title) +
				"</a></h3>" +
				mergeMarkup(pr) +
				'</div><div class="pr-statuses">' +
				lifecycleFrameMarkup(item) +
				warningRowMarkup(item) +
				"</div>" +
				(item.spec
					? `<p class="muted">OpenSpec · ${esc(item.spec.change_name ?? "linked")}</p>`
					: "") +
				"</article>"
			);
		}) +
		`</section>${statusDetail ? statusDetailMarkup(statusDetail) : statusDetailKey === "deployments" ? deploymentDetailMarkup(x.deployments) : ""}`;
	const page = pageFor(globalThis.location?.pathname);
	const pageMarkup =
		page === "configuration" ? configurationMarkup() : dashboardMarkup;
	root.innerHTML =
		headerMarkup +
		(x.stale
			? '<p class="card error">Provider reconciliation is stale.</p>'
			: "") +
		pageMarkup;
	document
		.querySelector("#notify")
		?.addEventListener("click", () =>
			globalThis.Notification?.requestPermission(),
		);
	document
		.querySelectorAll<HTMLButtonElement>("[data-connect-root]")
		.forEach((button) => {
			button.addEventListener("click", () =>
				connectOrganization(button.dataset.connectRoot ?? ""),
			);
		});
	document
		.querySelectorAll<HTMLButtonElement>("[data-connect-repository]")
		.forEach((button) => {
			button.addEventListener("click", () =>
				connectRepository(button.dataset.connectRepository ?? ""),
			);
		});
	document
		.querySelectorAll<HTMLButtonElement>("[data-checkout-permission]")
		.forEach((button) => {
			button.addEventListener("click", () =>
				grantCheckoutPermission(button.dataset.checkoutPermission ?? ""),
			);
		});
	document
		.querySelectorAll<HTMLInputElement>("[data-appearance-choice]")
		.forEach((input) => {
			input.addEventListener("change", () => {
				saveAppearance(input.value);
				render(current);
			});
		});
	document.querySelector("#reconcile")?.addEventListener("click", reconcileNow);
	const avatarMenu = document.querySelector<HTMLDetailsElement>(".avatar-menu");
	avatarMenu?.addEventListener("focusout", (event) => {
		const next = event.relatedTarget;
		if (!(next instanceof Node) || !avatarMenu.contains(next))
			avatarMenu.open = false;
	});
	document
		.querySelectorAll<HTMLAnchorElement>("[data-local-source]")
		.forEach((link) => {
			link.addEventListener("click", openLocalSource);
		});
	bindControls();
	bindStatusDetails();
};
async function reconcileNow() {
	if (reconciliationState === "running") return;
	reconciliationState = "running";
	reconcileMessage = "Reconciliation running.";
	render(current);
	try {
		const response = await fetch("/api/reconcile", { method: "POST" });
		if (!response.ok) {
			console.error("Reconciliation request failed", response.status);
			reconcileMessage = "Reconciliation could not be completed.";
			return;
		}
		const result = await response.json();
		if (result.status === "success") {
			reconcileMessage = "Reconciliation complete.";
			await load();
		} else if (result.status === "running") {
			reconcileMessage = "Reconciliation is already running.";
		} else {
			reconcileMessage = "Reconciliation could not be completed.";
		}
	} catch (error) {
		console.error("Reconciliation request failed", errorName(error));
		reconcileMessage = "Reconciliation could not be completed.";
	} finally {
		reconciliationState = "idle";
		render(current);
	}
}
const browserGlobal = globalThis as typeof globalThis & {
	showDirectoryPicker?: (options: {
		id: string;
		mode: "read";
	}) => Promise<BrowserDirectoryHandle>;
};
const directoryPicker = () => {
	const picker = browserGlobal.showDirectoryPicker;
	if (!picker) throw new TypeError("Directory picker is unavailable");
	return picker({ id: "dcc-checkout", mode: "read" });
};
const connectOrganization = async (account: string) => {
	if (!checkoutSupported()) return;
	try {
		const handle = await directoryPicker();
		const record: CheckoutRecord = {
			key: rootKey(account),
			account,
			kind: "root",
			handle,
		};
		checkoutHandles.set(record.key, record);
		await persistCheckout(record);
		await resolveCheckouts(repositoryCatalog);
		render(current);
	} catch (error) {
		if (errorName(error) !== "AbortError") {
			invalidateAccountCheckouts(account, "Error");
			setCheckoutError(rootKey(account), error);
		}
	}
};
export const connectRepository = async (key: string) => {
	if (!checkoutSupported()) return;
	const repository = repositoryCatalog.find(
		(item) => checkoutKey(item.account_login, item.repository_id) === key,
	);
	if (!repository) return;
	try {
		const handle = await directoryPicker();
		const record: CheckoutRecord = {
			key,
			account: repository.account_login,
			kind: "override",
			handle,
		};
		if (
			!(await persistVerifiedCheckout({
				handle,
				repository,
				read: readCheckout,
				persist: persistCheckout,
				record,
			}))
		) {
			invalidateRepositoryCheckout(repository, "Unresolved");
			return render(current);
		}
		checkoutHandles.set(key, record);
		await readRepositoryCheckout(repository, handle);
		render(current);
	} catch (error) {
		if (errorName(error) !== "AbortError") {
			clearRepositoryEvidence(repository);
			setCheckoutError(key, error);
		}
	}
};
const grantCheckoutPermission = async (key: string) => {
	const record =
		checkoutHandles.get(key) ??
		checkoutHandles.get(`root:${key.split(":")[0]}`);
	if (!record?.handle) return;
	try {
		await record.handle.requestPermission({ mode: "read" });
		await resolveCheckouts(repositoryCatalog);
		render(current);
	} catch (error) {
		const repository = repositoryCatalog.find(
			(item) => checkoutKey(item.account_login, item.repository_id) === key,
		);
		if (repository) clearRepositoryEvidence(repository);
		setCheckoutError(key, error);
	}
};
async function openLocalSource(event: Event) {
	event.preventDefault();
	const source = (event.currentTarget as HTMLElement).dataset.localSource;
	const handle = source ? localFiles.get(source) : undefined;
	if (!handle) return;
	try {
		const file = await handle.getFile();
		const text = await file.text();
		const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
		const link = document.createElement("a");
		link.href = url;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 60000);
	} catch (error) {
		console.error("Local OpenSpec open failed", errorName(error));
	}
}
export const loadFailureFor = ({
	error,
	online,
	log = console.error,
}: {
	error: unknown;
	online: boolean;
	log?: (...values: unknown[]) => void;
}) => {
	log("Command center load failed", errorName(error));
	return online
		? "Sign in to view your command center."
		: "Offline: live command-center data is unavailable.";
};
const load = () =>
	fetch("/api/snapshot")
		.then((response) => {
			if (!response.ok) throw response.status;
			return response.json();
		})
		.then((data: unknown) => {
			const snapshot = snapshotFor(data);
			if (!snapshot) throw new TypeError("Invalid dashboard snapshot");
			const { notifications } = snapshot;
			repositoryCatalog = snapshot.repositories;
			const ids = new Set(notifications.map((item) => item.id));
			const priorIds = known;
			if (priorIds && globalThis.Notification?.permission === "granted")
				notifications
					.filter((item) => !priorIds.has(item.id))
					.forEach((item) => {
						new Notification(item.title, { body: item.body });
					});
			known = ids;
			render(snapshot);
			restoreCheckouts(repositoryCatalog).then(() => {
				if (current === snapshot) render(snapshot);
			});
			return true;
		})
		.catch((error: unknown) => {
			render({
				error: loadFailureFor({ error, online: navigator.onLine }),
				pullRequests: [],
				deployments: [],
				repositories: [],
				notifications: [],
			});
			return false;
		});
if (root) {
	view.sort = loadSortPreference();
	applyAppearance(appearancePreference().preference);
	globalThis
		.matchMedia?.("(prefers-color-scheme: dark)")
		.addEventListener("change", () => {
			if (appearancePreference().preference === "system")
				applyAppearance("system");
		});
	load().then((ok) => {
		if (ok) new EventSource("/events").addEventListener("refresh", load);
	});
	document.addEventListener("keydown", (event) => {
		const search = document.querySelector<HTMLInputElement>("#pr-search"),
			avatarMenu = document.querySelector<HTMLDetailsElement>(".avatar-menu"),
			target = event.target as Element | null;
		if (event.key === "Escape" && statusDetailKey) {
			const next = statusDetailStateFor(
				{ key: statusDetailKey, pinned: statusDetailPinned },
				null,
				"dismiss",
			);
			statusDetailKey = next.key;
			statusDetailPinned = next.pinned;
			render(current);
		}
		if (event.key === "Escape" && avatarMenu?.open) {
			avatarMenu.open = false;
			avatarMenu.querySelector<HTMLElement>("summary")?.focus();
		}
		if (
			event.key === "/" &&
			!target?.matches?.("input, textarea, select, [contenteditable]")
		) {
			event.preventDefault();
			search?.focus();
		}
		if (event.key === "Escape" && target === search && view.query) {
			view.query = "";
			rerender("#pr-search");
		}
	});
	document.addEventListener("click", (event) => {
		const avatarMenu =
			document.querySelector<HTMLDetailsElement>(".avatar-menu");
		const target = event.target as {
			closest?: (selector: string) => unknown;
		} | null;
		if (
			statusDetailKey &&
			!target?.closest?.("[data-status-detail], #status-detail")
		) {
			const next = statusDetailStateFor(
				{ key: statusDetailKey, pinned: statusDetailPinned },
				null,
				"dismiss",
			);
			statusDetailKey = next.key;
			statusDetailPinned = next.pinned;
			render(current);
		}
		if (
			avatarMenu?.open &&
			event.target instanceof Node &&
			!avatarMenu.contains(event.target)
		)
			avatarMenu.open = false;
	});
}
