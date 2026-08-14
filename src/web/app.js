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
	view = {
		query: "",
		statuses: new Set(),
		repositories: new Set(),
		repositoryQuery: "",
		repositoryOpen: false,
	};

const normalized = (value) =>
	String(value ?? "")
		.trim()
		.toLowerCase();
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
		bucketOrder = { mergeable: 0, ready: 1, draft: 2 };
	return items
		.map((item) => ({
			...item,
			bucket: bucketFor(item.pr),
			score: searchScore(item, query),
		}))
		.filter(
			(item) =>
				Number.isFinite(item.score) &&
				(!statuses.size || statuses.has(item.bucket)) &&
				(!repositories.size || repositories.has(item.pr.full_name)),
		)
		.sort(
			(left, right) =>
				bucketOrder[left.bucket] - bucketOrder[right.bucket] ||
				(query ? left.score - right.score : 0) ||
				Number(right.pr.number) - Number(left.pr.number),
		);
};
export const repositoryOptions = (items, query = "") =>
	[...new Set(items.map(({ pr }) => pr.full_name).filter(Boolean))]
		.filter((name) => Number.isFinite(fuzzyScore(query, name)))
		.sort((left, right) => left.localeCompare(right));
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
			esc(item.change_name) +
			'">Open local tasks</a>'
		: item.source_url
			? '<a href="' +
				esc(item.source_url) +
				'" target="_blank" rel="noopener noreferrer">Open tasks</a>'
			: "";
const localSpecFor = (pr, pullRequests) => {
	const commitMatches = localSpecs.filter(
			(item) => item.source_commit && item.source_commit === pr.head_sha,
		),
		branchMatches = commitMatches.length
			? []
			: localSpecs.filter(
					(item) => item.source_ref && item.source_ref === pr.head_ref,
				),
		uniqueCommit =
			pullRequests.filter(
				(item) => pr.head_sha && item.head_sha === pr.head_sha,
			).length === 1,
		uniqueBranch =
			pullRequests.filter(
				(item) => pr.head_ref && item.head_ref === pr.head_ref,
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
		'</fieldset><details class="repository-filter" ' +
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
		'<header><div class="brand"><img class="brand-icon" src="/icon-adaptive.svg" alt=""><div><h1>Command center</h1><p class="muted">Open pull requests you authored.</p></div></div><div class="actions"><button id="checkout">Connect local checkout</button><button id="notify">Enable notifications</button></div></header>' +
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
		"</section></div>";
	document
		.querySelector("#notify")
		?.addEventListener("click", () =>
			globalThis.Notification?.requestPermission(),
		);
	document
		.querySelector("#checkout")
		?.addEventListener("click", connectCheckout);
	document.querySelectorAll("[data-local-source]").forEach((link) => {
		link.addEventListener("click", openLocalSource);
	});
	bindControls();
};
async function connectCheckout() {
	if (!globalThis.showDirectoryPicker) {
		alert(
			"This browser does not support local directory access. Committed GitHub OpenSpecs remain available.",
		);
		return;
	}
	try {
		const checkout = await showDirectoryPicker({
			id: "dcc-checkout",
			mode: "read",
		});
		let source_ref = null,
			source_commit = null;
		try {
			const git = await checkout.getDirectoryHandle(".git"),
				head = await (await git.getFileHandle("HEAD")).getFile(),
				value = (await head.text()).trim(),
				ref = value.match(/^ref: refs\/heads\/([A-Za-z0-9._/-]+)$/);
			if (ref && !ref[1].includes("..")) source_ref = ref[1];
			else if (/^[0-9a-f]{40}$/i.test(value)) source_commit = value;
		} catch (error) {
			if (!["NotFoundError", "TypeMismatchError"].includes(error?.name))
				console.error(
					"Local Git head read failed",
					error?.name ?? "unknown error",
				);
		}
		const changes = await (
			await checkout.getDirectoryHandle("openspec")
		).getDirectoryHandle("changes");
		const specs = [],
			files = new Map();
		for await (const [name, directory] of changes.entries()) {
			if (directory.kind !== "directory" || !/^[A-Za-z0-9._-]+$/.test(name))
				continue;
			try {
				const handle = await directory.getFileHandle("tasks.md"),
					file = await handle.getFile(),
					progress = parseTasks(await file.text());
				specs.push({
					change_name: name,
					...progress,
					source_ref,
					source_commit,
					source_type: "local",
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
		localSpecs = specs;
		localFiles = files;
		render(current);
	} catch (error) {
		if (error?.name !== "AbortError") {
			console.error(
				"Local checkout access failed",
				error?.name ?? "unknown error",
			);
			alert(
				"Could not read that checkout. Select a repository containing openspec/changes.",
			);
		}
	}
}
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
