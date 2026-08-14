const root = globalThis.document?.querySelector("#app");
const esc = (value) =>
	String(value ?? "").replace(
		/[&<>"']/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				char
			],
	);
const tone = (value) =>
	/success|complete|clean|approved/i.test(value)
		? "green"
		: /fail|error|conflict|change/i.test(value)
			? "red"
			: /pending|unknown|stale/i.test(value)
				? "yellow"
				: "blue";
const badge = (label, value) =>
	'<span class="status ' +
	tone(value) +
	'">' +
	esc(label) +
	": " +
	esc(value ?? "unknown") +
	"</span>";
let known = null,
	current = null,
	localSpecs = [],
	localFiles = new Map(),
	repositoryCatalog = [],
	checkoutHandles = new Map(),
	checkoutStates = new Map(),
	reconciling = false,
	reconcileMessage = "",
	view = {
		query: "",
		statuses: new Set(),
		repositories: new Set(),
		repositoryQuery: "",
		repositoryOpen: false,
		failedActions: false,
		failedChecks: false,
		sort: { mode: "closest", direction: "asc" },
	};

const appearanceKey = "dcc-appearance";
export const appearanceFor = (value, systemDark) => {
	const preference = ["system", "dark", "light"].includes(value)
		? value
		: "system";
	return {
		preference,
		theme:
			preference === "system" ? (systemDark ? "dark" : "light") : preference,
	};
};
const appearancePreference = () => {
	try {
		return appearanceFor(
			globalThis.localStorage?.getItem(appearanceKey),
			globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches,
		);
	} catch (error) {
		console.error(
			"Appearance preference read failed",
			error?.name ?? "unknown error",
		);
		return appearanceFor();
	}
};
const applyAppearance = (value) => {
	const appearance = appearanceFor(
		value,
		globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches,
	);
	document.documentElement.dataset.appearance = appearance.theme;
	document.documentElement.style.colorScheme = appearance.theme;
	return appearance;
};
const saveAppearance = (value) => {
	try {
		globalThis.localStorage?.setItem(appearanceKey, value);
		applyAppearance(value);
	} catch (error) {
		console.error(
			"Appearance preference save failed",
			error?.name ?? "unknown error",
		);
	}
};

const normalized = (value) =>
	String(value ?? "")
		.trim()
		.toLowerCase();
const defaultSort = { mode: "closest", direction: "asc" };
const sortModes = new Set([
	"closest",
	"updated",
	"number",
	"progress",
	"repository",
]);
export const sortPreference = (stored) => {
	try {
		const value = JSON.parse(stored);
		return sortModes.has(value?.mode) &&
			["asc", "desc"].includes(value?.direction)
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
		console.error(
			"Pull request sort read failed",
			error?.name ?? "unknown error",
		);
		return defaultSort;
	}
};
const saveSortPreference = () => {
	try {
		globalThis.localStorage?.setItem("dcc-pr-sort", JSON.stringify(view.sort));
	} catch (error) {
		console.error(
			"Pull request sort save failed",
			error?.name ?? "unknown error",
		);
	}
};
const distance = (left, right) => {
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
export const fuzzyScore = (query, value) => {
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
export const bucketFor = (pr) =>
	pr.mergeable === true || ["true", "clean"].includes(normalized(pr.mergeable))
		? "mergeable"
		: pr.draft
			? "draft"
			: "ready";
const failedState = (value) =>
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
export const blockersFor = (pr, spec) => {
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
const progressFor = (spec) =>
	spec &&
	Number.isFinite(Number(spec.completed)) &&
	Number.isFinite(Number(spec.total)) &&
	Number(spec.total) > 0
		? Number(spec.completed) / Number(spec.total)
		: null;
const nullableCompare = (left, right, direction = "asc") => {
	if (left === null) return right === null ? 0 : 1;
	if (right === null) return -1;
	return (
		(left < right ? -1 : left > right ? 1 : 0) * (direction === "desc" ? -1 : 1)
	);
};
const codePointCompare = (left, right) => {
	const a = normalized(left),
		b = normalized(right);
	return a < b ? -1 : a > b ? 1 : 0;
};
const repositoryTie = (left, right) =>
	codePointCompare(left.pr.full_name, right.pr.full_name) ||
	codePointCompare(left.pr.repository_id, right.pr.repository_id);
const numberCompare = (left, right) =>
	Number(right.pr.number) - Number(left.pr.number) ||
	repositoryTie(left, right);
const closestCompare = (left, right, direction = "asc") =>
	nullableCompare(left.blockers.length, right.blockers.length, direction) ||
	nullableCompare(left.progress, right.progress, "desc") ||
	numberCompare(left, right);
const sortCompare = (left, right, sort) => {
	const fallback = () => closestCompare(left, right);
	if (sort.mode === "closest")
		return closestCompare(left, right, sort.direction);
	if (sort.mode === "updated")
		return (
			nullableCompare(
				Number.isFinite(Date.parse(left.pr.updated_at))
					? Date.parse(left.pr.updated_at)
					: null,
				Number.isFinite(Date.parse(right.pr.updated_at))
					? Date.parse(right.pr.updated_at)
					: null,
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
const searchScore = ({ pr, spec }, query) => {
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
export const derivePullRequests = (items, filters) => {
	const query = normalized(filters.query),
		statuses = filters.statuses ?? new Set(),
		repositories = filters.repositories ?? new Set(),
		failedActions = filters.failedActions ?? false,
		failedChecks = filters.failedChecks ?? false,
		sort = sortModes.has(filters.sort?.mode) ? filters.sort : defaultSort;
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
				(!repositories.size || repositories.has(item.pr.full_name)),
		)
		.sort((left, right) => sortCompare(left, right, sort));
};
export const repositoryOptions = (items, query = "") =>
	[...new Set(items.map(({ pr }) => pr.full_name).filter(Boolean))]
		.filter((name) => Number.isFinite(fuzzyScore(query, name)))
		.sort(codePointCompare);
const parseTasks = (content) => {
	const groups = [];
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
const requestResult = (request) =>
	new Promise((resolve, reject) => {
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
export const checkoutStoreFor = (open) => ({
	getAll: async () => {
		const store = await open();
		return requestResult(store.getAll());
	},
	put: async (record) => {
		const store = await open();
		return requestResult(store.put(record));
	},
});
const checkoutStore = () =>
	checkoutStoreFor(async () => {
		const database = await checkoutDatabase();
		return {
			getAll: () =>
				database.transaction("handles").objectStore("handles").getAll(),
			put: (record) =>
				database
					.transaction("handles", "readwrite")
					.objectStore("handles")
					.put(record),
		};
	});
const storedCheckouts = () => checkoutStore().getAll();
const persistCheckout = (record) => checkoutStore().put(record);
export const exactCheckoutDirectory = (root, repository) =>
	root.getDirectoryHandle(repository.full_name.split("/").at(-1));
export const revalidateCheckout = (record) =>
	record.handle.queryPermission({ mode: "read" });
export const persistVerifiedCheckout = async ({
	handle,
	repository,
	read,
	persist,
	record,
}) => {
	if (!(await read(handle, repository))) return false;
	await persist(record);
	return true;
};
const permissionFor = async (record) => {
	const permission = await revalidateCheckout(record);
	checkoutStates.set(
		record.key,
		checkoutStateFor(checkoutSupported(), permission, false),
	);
	return permission;
};
const setCheckoutError = (key, error) => {
	checkoutStates.set(key, "Error");
	console.error("Local checkout read failed", error?.name ?? "unknown error");
};
const readCheckout = async (handle, repository) => {
	const git = await handle.getDirectoryHandle(".git"),
		config = await (await git.getFileHandle("config")).getFile();
	if (
		repositoryForRemote(await config.text()) !==
		normalized(repository.full_name)
	)
		return null;
	const head = await (await git.getFileHandle("HEAD")).getFile(),
		value = (await head.text()).trim(),
		ref = value.match(/^ref: refs\/heads\/([A-Za-z0-9._/-]+)$/),
		source_ref = ref && !ref[1].includes("..") ? ref[1] : null,
		source_commit = /^[0-9a-f]{40}$/i.test(value) ? value : null,
		specs = [],
		files = new Map();
	let changes;
	try {
		changes = await (
			await handle.getDirectoryHandle("openspec")
		).getDirectoryHandle("changes");
	} catch (error) {
		if (error?.name === "NotFoundError") return { specs, files };
		throw error;
	}
	for await (const [name, directory] of changes.entries()) {
		if (directory.kind !== "directory" || !/^[A-Za-z0-9._-]+$/.test(name))
			continue;
		try {
			const handle = await directory.getFileHandle("tasks.md"),
				file = await handle.getFile();
			specs.push({
				change_name: name,
				...parseTasks(await file.text()),
				source_ref,
				source_commit,
				source_type: "local",
				installation_id: repository.installation_id,
				account_login: repository.account_login,
				repository_id: repository.repository_id,
			});
			files.set(name, handle);
		} catch (error) {
			if (error?.name !== "NotFoundError")
				console.error(
					"Local OpenSpec read failed",
					error?.name ?? "unknown error",
				);
		}
	}
	return { specs, files };
};
const readRepositoryCheckout = async (repository, handle) => {
	const key = checkoutKey(repository.account_login, repository.repository_id);
	try {
		const evidence = await readCheckout(handle, repository);
		if (!evidence) {
			checkoutStates.set(key, "Unresolved");
			return;
		}
		localSpecs = localSpecs.filter(
			(item) =>
				item.installation_id !== repository.installation_id ||
				item.repository_id !== repository.repository_id,
		);
		for (const name of localFiles.keys())
			if (name.startsWith(`${key}:`)) localFiles.delete(name);
		localSpecs.push(...evidence.specs);
		for (const [name, file] of evidence.files)
			localFiles.set(`${key}:${name}`, file);
		checkoutStates.set(key, "Resolved");
	} catch (error) {
		if (["NotFoundError", "TypeMismatchError"].includes(error?.name))
			checkoutStates.set(key, "Unresolved");
		else setCheckoutError(key, error);
	}
};
const resolveCheckouts = async (repositories) => {
	if (!checkoutSupported()) {
		for (const repository of repositories)
			checkoutStates.set(
				checkoutKey(repository.account_login, repository.repository_id),
				"Unsupported",
			);
		return;
	}
	for (const repository of repositories) {
		const key = checkoutKey(repository.account_login, repository.repository_id),
			override = checkoutHandles.get(key),
			root = checkoutHandles.get(rootKey(repository.account_login)),
			record = override ?? root;
		if (!record) continue;
		try {
			if ((await permissionFor(record)) !== "granted") {
				checkoutStates.set(key, "Permission required");
				continue;
			}
		} catch (error) {
			setCheckoutError(key, error);
			continue;
		}
		if (override) await readRepositoryCheckout(repository, override.handle);
		else {
			try {
				const handle = await exactCheckoutDirectory(root.handle, repository);
				await readRepositoryCheckout(repository, handle);
			} catch (error) {
				if (["NotFoundError", "TypeMismatchError"].includes(error?.name))
					checkoutStates.set(key, "Unresolved");
				else setCheckoutError(key, error);
			}
		}
	}
};
const restoreCheckouts = async (repositories) => {
	try {
		if (!checkoutSupported()) return await resolveCheckouts(repositories);
		for (const record of await storedCheckouts())
			checkoutHandles.set(record.key, record);
		await resolveCheckouts(repositories);
	} catch (error) {
		console.error(
			"Local checkout restore failed",
			error?.name ?? "unknown error",
		);
	}
};
const groupFor = (item) => {
	if (!item.active_group) return null;
	if (typeof item.active_group === "object") return item.active_group;
	try {
		return JSON.parse(item.active_group);
	} catch (error) {
		console.error("OpenSpec group parse failed", error?.name ?? "invalid JSON");
		return null;
	}
};
const sourceFor = (item) =>
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
export const checkoutKey = (account, repositoryId) =>
	`${normalized(account)}:${String(repositoryId)}`;
const rootKey = (account) => `root:${normalized(account)}`;
const checkoutSupported = () =>
	Boolean(globalThis.indexedDB && globalThis.showDirectoryPicker);
export const checkoutStateFor = (supported, permission, resolved) =>
	!supported
		? "Unsupported"
		: permission !== "granted"
			? "Permission required"
			: resolved
				? "Resolved"
				: "Unresolved";
export const repositoryForRemote = (content) => {
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
export const localSpecFor = (pr, pullRequests, specs = localSpecs) => {
	const scoped = specs.filter(
		(item) =>
			item.installation_id === pr.installation_id &&
			item.repository_id === pr.repository_id,
	);
	const commitMatches = scoped.filter(
			(item) => item.source_commit && item.source_commit === pr.head_sha,
		),
		branchMatches = commitMatches.length
			? []
			: scoped.filter(
					(item) => item.source_ref && item.source_ref === pr.head_ref,
				),
		uniqueCommit =
			pullRequests.filter(
				(item) =>
					item.installation_id === pr.installation_id &&
					item.repository_id === pr.repository_id &&
					pr.head_sha &&
					item.head_sha === pr.head_sha,
			).length === 1,
		uniqueBranch =
			pullRequests.filter(
				(item) =>
					item.installation_id === pr.installation_id &&
					item.repository_id === pr.repository_id &&
					pr.head_ref &&
					item.head_ref === pr.head_ref,
			).length === 1;
	return commitMatches.length === 1 && uniqueCommit
		? commitMatches[0]
		: branchMatches.length === 1 && uniqueBranch
			? branchMatches[0]
			: null;
};
const specFor = (pr, pullRequests) =>
	localSpecFor(pr, pullRequests) ?? pr.open_spec;
const openSpecMarkup = (item) => {
	if (!item) return "";
	const group = groupFor(item),
		title = group?.title ?? "Complete";
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
						(task) =>
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
const workflowFailuresMarkup = (pr) => {
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
const controlsMarkup = (all, visible) => {
	const repositories = repositoryOptions(all, view.repositoryQuery),
		statusLabel = {
			mergeable: "Mergeable",
			ready: "Ready for review",
			draft: "Draft",
		};
	return (
		'<div class="pr-controls"><label for="pr-search">Search pull requests</label><input id="pr-search" type="search" value="' +
		esc(view.query) +
		'" autocomplete="off"><fieldset><legend>Status</legend>' +
		Object.entries(statusLabel)
			.map(
				([value, label]) =>
					'<label class="filter-pill"><input id="status-' +
					value +
					'" type="checkbox" data-status="' +
					value +
					'" ' +
					(view.statuses.has(value) ? "checked" : "") +
					">" +
					esc(label) +
					"</label>",
			)
			.join("") +
		'</fieldset><fieldset><legend>Failed state</legend><label class="filter-pill"><input id="failed-actions" type="checkbox" data-aggregate-filter="failedActions" ' +
		(view.failedActions ? "checked" : "") +
		'>Failed Actions</label><label class="filter-pill"><input id="failed-checks" type="checkbox" data-aggregate-filter="failedChecks" ' +
		(view.failedChecks ? "checked" : "") +
		'>Failed Checks</label></fieldset><label for="pr-sort">Sort pull requests</label><select id="pr-sort" aria-describedby="codex-activity-status"><option value="closest" ' +
		(view.sort.mode === "closest" ? "selected" : "") +
		'>Closest to merge</option><option value="codex" disabled aria-describedby="codex-activity-status">Codex activity (unavailable)</option><option value="updated" ' +
		(view.sort.mode === "updated" ? "selected" : "") +
		'>Recently updated</option><option value="number" ' +
		(view.sort.mode === "number" ? "selected" : "") +
		'>PR number</option><option value="progress" ' +
		(view.sort.mode === "progress" ? "selected" : "") +
		'>OpenSpec progress</option><option value="repository" ' +
		(view.sort.mode === "repository" ? "selected" : "") +
		'>Repository</option></select><span id="codex-activity-status" class="muted">Codex activity sorting is unavailable because no activity data is collected.</span><label for="pr-direction">' +
		(view.sort.mode === "number"
			? "PR number direction: Newest first or Oldest first"
			: "Sort direction") +
		'</label><select id="pr-direction"><option value="asc" ' +
		(view.sort.direction === "asc" ? "selected" : "") +
		'>Ascending</option><option value="desc" ' +
		(view.sort.direction === "desc" ? "selected" : "") +
		'>Descending</option></select><details class="repository-filter" ' +
		(view.repositoryOpen ? "open" : "") +
		"><summary>Repositories" +
		(view.repositories.size ? ` (${view.repositories.size})` : "") +
		'</summary><label for="repository-search">Find repository</label><input id="repository-search" type="search" value="' +
		esc(view.repositoryQuery) +
		'" autocomplete="off"><div class="repository-options">' +
		(repositories.length
			? repositories
					.map(
						(name, index) =>
							'<label><input id="repository-' +
							index +
							'" type="checkbox" data-repository="' +
							esc(name) +
							'" ' +
							(view.repositories.has(name) ? "checked" : "") +
							">" +
							esc(name) +
							"</label>",
					)
					.join("")
			: '<span class="muted">No repositories match.</span>') +
		'</div></details><span id="pr-count" aria-live="polite">' +
		esc(visible.length) +
		" of " +
		esc(all.length) +
		' pull requests</span><button id="clear-pr-filters" type="button">Clear</button></div>'
	);
};
const checkoutMarkup = () => {
	if (!checkoutSupported())
		return '<p class="muted" aria-live="polite">Local checkout access is Unsupported in this browser. Committed GitHub OpenSpecs remain available.</p>';
	const groups = new Map();
	for (const repository of repositoryCatalog) {
		const account = repository.account_login;
		groups.set(account, [...(groups.get(account) ?? []), repository]);
	}
	return groups.size
		? '<section class="checkout-mappings" aria-labelledby="checkout-title"><h3 id="checkout-title">Local checkouts</h3>' +
				[...groups]
					.map(
						([account, repositories], index) =>
							"<div><p><strong>" +
							esc(account) +
							'</strong> <button id="checkout-root-' +
							index +
							'" type="button" data-connect-root="' +
							esc(account) +
							'">Connect organization root</button></p><ul>' +
							repositories
								.map((repository) => {
									const key = checkoutKey(
										repository.account_login,
										repository.repository_id,
									);
									return (
										"<li><strong>" +
										esc(repository.full_name) +
										'</strong> · <span aria-live="polite">' +
										esc(checkoutStates.get(key) ?? "Unresolved") +
										'</span> <button type="button" data-connect-repository="' +
										esc(key) +
										'">Choose checkout</button>' +
										(checkoutStates.get(key) === "Permission required"
											? ' <button type="button" data-checkout-permission="' +
												esc(key) +
												'">Grant permission</button>'
											: "") +
										"</li>"
									);
								})
								.join("") +
							"</ul></div>",
					)
					.join("") +
				"</section>"
		: '<p class="muted">No authorized repositories are available for local checkout mapping.</p>';
};
const configurationMarkup = () => {
	const appearance = appearancePreference();
	return (
		'<section id="configuration" class="card configuration" aria-labelledby="configuration-title"><h2 id="configuration-title">Configuration</h2>' +
		checkoutMarkup() +
		'<div class="actions"><button id="notify" type="button">Enable notifications</button><button id="reconcile" type="button" ' +
		(reconciling ? "disabled" : "") +
		">" +
		(reconciling ? "Reconciling…" : "Reconcile now") +
		'</button></div><p id="reconcile-status" class="muted" aria-live="polite">' +
		esc(reconcileMessage) +
		'</p><fieldset class="appearance"><legend>Appearance</legend>' +
		["system", "dark", "light"]
			.map(
				(value) =>
					'<label><input type="radio" name="appearance" value="' +
					value +
					'" ' +
					(appearance.preference === value ? "checked" : "") +
					">" +
					esc(value[0].toUpperCase() + value.slice(1)) +
					"</label>",
			)
			.join("") +
		"</fieldset></section>"
	);
};
const rerender = (focusId) => {
	render(current);
	const control = document.getElementById(focusId);
	control?.focus();
	if (control?.setSelectionRange)
		control.setSelectionRange(control.value.length, control.value.length);
};
const bindControls = () => {
	document.querySelector("#pr-search")?.addEventListener("input", (event) => {
		view.query = event.currentTarget.value;
		rerender("pr-search");
	});
	document.querySelectorAll("[data-status]").forEach((input) => {
		input.addEventListener("change", () => {
			input.checked
				? view.statuses.add(input.dataset.status)
				: view.statuses.delete(input.dataset.status);
			rerender(input.id);
		});
	});
	document.querySelectorAll("[data-aggregate-filter]").forEach((input) => {
		input.addEventListener("change", () => {
			view[input.dataset.aggregateFilter] = input.checked;
			rerender(input.id);
		});
	});
	document.querySelector("#pr-sort")?.addEventListener("change", (event) => {
		view.sort = { ...view.sort, mode: event.currentTarget.value };
		saveSortPreference();
		rerender("pr-sort");
	});
	document
		.querySelector("#pr-direction")
		?.addEventListener("change", (event) => {
			view.sort = { ...view.sort, direction: event.currentTarget.value };
			saveSortPreference();
			rerender("pr-direction");
		});
	const repositoryFilter = document.querySelector(".repository-filter");
	repositoryFilter?.addEventListener("toggle", () => {
		view.repositoryOpen = repositoryFilter.open;
	});
	document
		.querySelector("#repository-search")
		?.addEventListener("input", (event) => {
			view.repositoryQuery = event.currentTarget.value;
			view.repositoryOpen = true;
			rerender("repository-search");
		});
	document.querySelectorAll("[data-repository]").forEach((input) => {
		input.addEventListener("change", () => {
			input.checked
				? view.repositories.add(input.dataset.repository)
				: view.repositories.delete(input.dataset.repository);
			view.repositoryOpen = true;
			rerender(input.id);
		});
	});
	document.querySelector("#clear-pr-filters")?.addEventListener("click", () => {
		view = {
			query: "",
			statuses: new Set(),
			repositories: new Set(),
			repositoryQuery: "",
			repositoryOpen: false,
			failedActions: false,
			failedChecks: false,
			sort: view.sort,
		};
		rerender("pr-search");
	});
};
const render = (x) => {
	if (!root || !x) return;
	current = x;
	if (x.error) {
		root.innerHTML =
			'<div class="card error">' +
			esc(x.error) +
			' <a href="/auth/github">Sign in</a></div>';
		return;
	}
	const rows = (items, empty, fn) =>
		items.length
			? `<div class="stack">${items.map(fn).join("")}</div>`
			: `<p class="muted">${empty}</p>`;
	const allPullRequests = x.pullRequests.map((pr) => ({
		pr,
		spec: specFor(pr, x.pullRequests),
	}));
	const prs = derivePullRequests(allPullRequests, view);
	root.innerHTML =
		'<header><div class="brand"><img class="brand-icon" src="/icon-adaptive.svg" alt=""><div><h1>Command center</h1><p class="muted">Open pull requests you authored.</p></div></div><div class="actions"><a class="button" href="#configuration">Connect local checkout</a><a class="button" href="#configuration">Enable notifications</a></div></header>' +
		(x.stale
			? '<p class="card error">Provider reconciliation is stale.</p>'
			: "") +
		'<div class="grid"><section class="card" aria-label="Pull requests">' +
		controlsMarkup(allPullRequests, prs) +
		rows(prs, "No open authored pull requests.", (item) => {
			const pr = item.pr;
			return (
				'<article><h3><a href="' +
				esc(pr.url) +
				'" target="_blank" rel="noopener noreferrer">#' +
				esc(pr.number) +
				" · " +
				esc(pr.title) +
				'</a></h3><div class="statuses">' +
				badge("attention", pr.needs_attention ? "needs attention" : "healthy") +
				badge("draft", pr.draft ? "draft" : "ready") +
				badge("Actions", pr.workflow_state) +
				badge("checks", pr.checks_state) +
				badge("review", pr.review_state) +
				(pr.bot_review_state
					? badge(`review · ${pr.bot_review_actor}`, pr.bot_review_state)
					: "") +
				badge("mergeable", pr.mergeable) +
				"</div>" +
				'<p class="muted">Blockers: ' +
				esc(item.blockers.length) +
				(item.blockers.length ? " · " + esc(item.blockers.join(", ")) : "") +
				"</p>" +
				workflowFailuresMarkup(pr) +
				openSpecMarkup(item.spec) +
				"</article>"
			);
		}) +
		'</section><section class="card"><h2>GitHub deployments · last 48 hours</h2>' +
		rows(
			x.deployments,
			"No recent deployment evidence.",
			(deployment) =>
				"<article><h3>" +
				esc(deployment.full_name) +
				" · " +
				esc(deployment.environment) +
				" · " +
				esc(deployment.id) +
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
		) +
		"</section></div>" +
		configurationMarkup();
	document
		.querySelector("#notify")
		?.addEventListener("click", () =>
			globalThis.Notification?.requestPermission(),
		);
	document.querySelectorAll("[data-connect-root]").forEach((button) => {
		button.addEventListener("click", () =>
			connectOrganization(button.dataset.connectRoot),
		);
	});
	document.querySelectorAll("[data-connect-repository]").forEach((button) => {
		button.addEventListener("click", () =>
			connectRepository(button.dataset.connectRepository),
		);
	});
	document.querySelectorAll("[data-checkout-permission]").forEach((button) => {
		button.addEventListener("click", () =>
			grantCheckoutPermission(button.dataset.checkoutPermission),
		);
	});
	document.querySelectorAll('[name="appearance"]').forEach((input) => {
		input.addEventListener("change", () => {
			saveAppearance(input.value);
			render(current);
		});
	});
	document.querySelector("#reconcile")?.addEventListener("click", reconcileNow);
	document.querySelectorAll("[data-local-source]").forEach((link) => {
		link.addEventListener("click", openLocalSource);
	});
	bindControls();
};
async function reconcileNow() {
	if (reconciling) return;
	reconciling = true;
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
		console.error(
			"Reconciliation request failed",
			error?.name ?? "unknown error",
		);
		reconcileMessage = "Reconciliation could not be completed.";
	} finally {
		reconciling = false;
		render(current);
	}
}
const connectOrganization = async (account) => {
	if (!checkoutSupported()) return;
	try {
		const handle = await showDirectoryPicker({
				id: "dcc-checkout",
				mode: "read",
			}),
			record = { key: rootKey(account), account, kind: "root", handle };
		checkoutHandles.set(record.key, record);
		await persistCheckout(record);
		await resolveCheckouts(repositoryCatalog);
		render(current);
	} catch (error) {
		if (error?.name !== "AbortError") setCheckoutError(rootKey(account), error);
	}
};
const connectRepository = async (key) => {
	if (!checkoutSupported()) return;
	const repository = repositoryCatalog.find(
		(item) => checkoutKey(item.account_login, item.repository_id) === key,
	);
	if (!repository) return;
	try {
		const handle = await showDirectoryPicker({
			id: "dcc-checkout",
			mode: "read",
		});
		const record = {
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
			checkoutStates.set(key, "Unresolved");
			return render(current);
		}
		checkoutHandles.set(key, record);
		await readRepositoryCheckout(repository, handle);
		render(current);
	} catch (error) {
		if (error?.name !== "AbortError") setCheckoutError(key, error);
	}
};
const grantCheckoutPermission = async (key) => {
	const record =
		checkoutHandles.get(key) ??
		checkoutHandles.get(`root:${key.split(":")[0]}`);
	if (!record) return;
	try {
		await record.handle.requestPermission({ mode: "read" });
		await resolveCheckouts(repositoryCatalog);
		render(current);
	} catch (error) {
		setCheckoutError(key, error);
	}
};
async function openLocalSource(event) {
	event.preventDefault();
	const handle = localFiles.get(event.currentTarget.dataset.localSource);
	if (!handle) return;
	try {
		const file = await handle.getFile(),
			url = URL.createObjectURL(
				new Blob([await file.text()], { type: "text/plain" }),
			),
			link = document.createElement("a");
		link.href = url;
		link.target = "_blank";
		link.rel = "noopener noreferrer";
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 60000);
	} catch (error) {
		console.error("Local OpenSpec open failed", error?.name ?? "unknown error");
	}
}
const load = () =>
	fetch("/api/snapshot")
		.then((response) =>
			response.ok ? response.json() : Promise.reject(response.status),
		)
		.then((data) => {
			repositoryCatalog = Array.isArray(data.repositories)
				? data.repositories
				: [];
			const ids = new Set(data.notifications.map((item) => item.id));
			if (known && globalThis.Notification?.permission === "granted")
				navigator.serviceWorker?.ready.then((worker) =>
					data.notifications
						.filter((item) => !known.has(item.id))
						.forEach((item) => {
							worker.showNotification(item.title, { body: item.body });
						}),
				);
			known = ids;
			render(data);
			restoreCheckouts(repositoryCatalog).then(() => {
				if (current === data) render(data);
			});
			return true;
		})
		.catch(() => {
			render({
				error: navigator.onLine
					? "Sign in to view your command center."
					: "Offline: live command-center data is unavailable.",
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
		const search = document.querySelector("#pr-search"),
			target = event.target;
		if (
			event.key === "/" &&
			!target?.matches?.("input, textarea, select, [contenteditable]")
		) {
			event.preventDefault();
			search?.focus();
		}
		if (event.key === "Escape" && target === search && view.query) {
			view.query = "";
			rerender("pr-search");
		}
	});
	navigator.serviceWorker?.register("/sw.js");
}
