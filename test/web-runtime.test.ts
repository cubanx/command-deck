import { expect, test } from "vitest";

class FakeElement {
	dataset: Record<string, string> = {};
	innerHTML = "";
	style: Record<string, string> = {};
	value = "";
	checked = false;
	open = false;
	focusCount = 0;
	listeners = new Map<string, (event: Event) => unknown>();

	addEventListener(name: string, listener: (event: Event) => unknown) {
		this.listeners.set(name, listener);
	}

	focus() {
		this.focusCount += 1;
	}
	setSelectionRange() {}
	matches() {
		return false;
	}
	getBoundingClientRect() {
		return { left: 16, top: 16, width: 100, height: 24 } as DOMRect;
	}
}

test("the compiled browser runtime renders and reconciles with native controls", async () => {
	const elements = new Map<string, FakeElement>();
	const repositoryCheckbox = new FakeElement();
	repositoryCheckbox.dataset.repository = "ds9/defiant";
	repositoryCheckbox.checked = true;
	const statusTrigger = new FakeElement();
	statusTrigger.dataset.statusDetail = "12:42:9";
	const deploymentTrigger = new FakeElement();
	deploymentTrigger.dataset.statusDetail = "deployments";
	const element = (selector: string) => {
		const existing = elements.get(selector);
		if (existing) return existing;
		const created = new FakeElement();
		elements.set(selector, created);
		return created;
	};
	const document = {
		documentElement: new FakeElement(),
		querySelector: (selector: string) => element(selector),
		querySelectorAll: (selector: string) =>
			selector === "[data-repository]"
				? [repositoryCheckbox]
				: selector === "[data-reconcile-all]"
					? [element("#reconcile-all")]
					: selector === "[data-status-detail]"
						? [statusTrigger, deploymentTrigger]
						: [],
		getElementById: (id: string) => element(`#${id}`),
		createElement: () => new FakeElement(),
		addEventListener: (name: string, listener: (event: Event) => unknown) =>
			element("document").addEventListener(name, listener),
	};
	const snapshot = {
		stale: false,
		notifications: [],
		repositories: [
			{
				account_login: "ds9",
				repository_id: "42",
				installation_id: "12",
				full_name: "ds9/defiant",
			},
		],
		pullRequests: [
			{
				installation_id: "12",
				repository_id: "42",
				installation_pull_requests: "read",
				full_name: "ds9/defiant",
				number: 9,
				title: "Prepare the Defiant",
				url: "https://github.com/ds9/defiant/pull/9",
				state: "open",
				draft: true,
				mergeable: "clean",
				workflow_state: "failure",
				checks_state: "success",
				review_state: "pending",
				head_sha: "a".repeat(40),
				workflow_failures: [
					{
						name: "Battle readiness",
						url: "https://github.com/ds9/defiant/actions/runs/9",
					},
				],
				open_spec: {
					change_name: "prepare-defiant",
					completed: 1,
					total: 2,
					source_url: "https://github.com/ds9/defiant/issues/9",
					active_group: {
						title: "Readiness",
						tasks: [
							{ text: "Calibrate the phaser array", completed: true },
							{ text: "Run the readiness drill", completed: false },
						],
					},
				},
			},
		],
		deployments: [
			{
				id: "deployment-9",
				full_name: "ds9/defiant",
				ref: "main",
				sha: "a".repeat(40),
				state: "error",
				updated_at: "2030-01-02T02:00:00Z",
				pull_request_number: 9,
				pull_request_title: "Prepare the Defiant",
				pull_request_url: "https://github.com/ds9/defiant/pull/9",
				target_url: "https://defiant.example/deployments/9",
				log_url: "https://defiant.example/logs/9",
			},
			...Array.from({ length: 5 }, (_, index) => ({
				id: `deployment-${index + 10}`,
				full_name: "ds9/defiant",
				environment: "wormhole",
				state: "success",
			})),
		],
	};
	const fetchCalls: string[] = [];
	const fetch = async (input: string) => {
		fetchCalls.push(input);
		return input === "/api/reconcile/pull-requests"
			? new Response(JSON.stringify({ status: "success" }))
			: new Response(JSON.stringify(snapshot));
	};
	function Notification() {}
	Object.assign(Notification, { permission: "granted" });
	Object.defineProperties(globalThis, {
		document: { configurable: true, value: document },
		localStorage: {
			configurable: true,
			value: { getItem: () => null, setItem: () => undefined },
		},
		matchMedia: {
			configurable: true,
			value: () => ({ matches: false, addEventListener: () => undefined }),
		},
		navigator: { configurable: true, value: { onLine: true } },
		Notification: {
			configurable: true,
			value: Notification,
		},
		confirm: { configurable: true, value: () => true },
		fetch: { configurable: true, value: fetch },
		EventSource: {
			configurable: true,
			value: class {
				addEventListener() {}
			},
		},
	});
	const app = await import("#/web/app");
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(element("#app").innerHTML).toContain("Prepare the Defiant");
	expect(element("#app").innerHTML).toContain(
		"OpenSpec · prepare-defiant · 1/2 · Readiness",
	);
	expect(element("#app").innerHTML).toContain('<details class="openspec">');
	expect(element("#app").innerHTML).toContain("Calibrate the phaser array");
	expect(element("#app").innerHTML).toContain("Run the readiness drill");
	expect(element("#app").innerHTML).toContain("Open tasks");
	expect(element("#app").innerHTML).toContain('class="deployment-summary"');
	expect(element("#app").innerHTML).toContain("Latest deployment");
	expect(element("#app").innerHTML).toContain("#9 · Prepare the Defiant");
	expect(element("#app").innerHTML).toContain(">Failed<");
	expect(element("#app").innerHTML).not.toContain(
		`ds9/defiant · main · ${"a".repeat(40)}`,
	);
	expect(element("#app").innerHTML).not.toContain(" ·  · ");
	expect(element("#app").innerHTML).not.toContain(
		"GitHub deployments · last 48 hours",
	);
	expect(element("#app").innerHTML).not.toContain("deployment-9");
	const summary = app.deploymentSummaryMarkup([
		{
			full_name: "ds9/defiant",
			sha: "b".repeat(40),
			state: "pending",
			updated_at: "2030-01-02T03:00:00Z",
		},
		{
			full_name: "ds9/defiant",
			sha: "c".repeat(40),
			state: "error",
			updated_at: "2030-01-02T02:00:00Z",
		},
		{
			full_name: "ds9/defiant",
			sha: "e".repeat(40),
			state: "success",
			updated_at: "2030-01-02T01:00:00Z",
		},
	]);
	expect(summary).toContain(
		`href="https://github.com/ds9/defiant/commit/${"c".repeat(40)}"`,
	);
	expect(summary).toContain("c".repeat(7));
	expect(summary).toContain(">Failed<");
	expect(summary).not.toContain(">ds9/defiant<");
	expect(
		app.deploymentSummaryMarkup([
			{
				full_name: "ds9/defiant",
				sha: "d".repeat(40),
				state: "failure",
				updated_at: "2030-01-02T04:00:00Z",
			},
		]),
	).toContain(">Failed<");
	expect(
		app.deploymentSummaryMarkup([
			{ state: "inactive", updated_at: "2030-01-02T03:00:00Z" },
			{ state: "success", updated_at: "not a date" },
		]),
	).toContain("No completed deployment in the last 48 hours");
	expect(element("#app").innerHTML).toContain("lifecycle-rail");
	expect(element("#app").innerHTML).toContain("lifecycle-pills");
	expect(element("#app").innerHTML).not.toContain(
		'class="lifecycle-rail" data-status-detail',
	);
	expect(element("#app").innerHTML).toContain(
		'<fieldset class="pr-lifecycle"><legend class="pr-lifecycle-title">PR Lifecycle</legend><div',
	);
	expect(element("#app").innerHTML).toContain('class="pr-warning-row"');
	expect(element("#app").innerHTML).toContain(
		"PR lifecycle. Current stage: Draft",
	);
	expect(element("#app").innerHTML).toContain(
		'<a href="https://github.com/ds9/defiant/pull/9" class="pr-title-link" data-status-detail="12:42:9"',
	);
	expect(element("#app").innerHTML).toContain("data-status-detail");
	expect(element("#app").innerHTML).not.toContain("Battle readiness");
	statusTrigger.listeners.get("focus")?.(new Event("focus"));
	expect(element('[data-status-detail="12:42:9"]').focusCount).toBe(1);
	statusTrigger.listeners.get("click")?.(new Event("click"));
	expect(element('[data-status-detail="12:42:9"]').focusCount).toBe(2);
	statusTrigger.listeners.get("click")?.(new Event("click"));
	const hover = statusTrigger.listeners.get("pointerenter");
	expect(hover).toBeTypeOf("function");
	const focusCountBeforeHover = element(
		'[data-status-detail="12:42:9"]',
	).focusCount;
	hover?.(new Event("pointerenter"));
	await new Promise((resolve) => setTimeout(resolve, 360));
	expect(element('[data-status-detail="12:42:9"]').focusCount).toBe(
		focusCountBeforeHover,
	);
	expect(element("#app").innerHTML).toContain("Battle readiness");
	expect(element("#app").innerHTML).toContain(
		'data-repository="ds9/defiant" checked',
	);
	expect(element("#app").innerHTML).not.toContain("repository-search");
	repositoryCheckbox.checked = false;
	repositoryCheckbox.listeners.get("change")?.(new Event("change"));
	expect(element("#app").innerHTML).toContain(
		"No open authored pull requests.",
	);
	// Restore the selected repository before exercising the independent detail UI.
	repositoryCheckbox.checked = true;
	repositoryCheckbox.listeners.get("change")?.(new Event("change"));
	expect(element("#app").innerHTML).toContain('style="left:16px;top:48px"');
	expect(element("#app").innerHTML).not.toContain("bottom: 16px");
	statusTrigger.listeners.get("pointerleave")?.(new Event("pointerleave"));
	expect(element("#app").innerHTML).toContain("Battle readiness");
	statusTrigger.listeners.get("click")?.(new Event("click"));
	statusTrigger.listeners.get("pointerleave")?.(new Event("pointerleave"));
	expect(element("#app").innerHTML).toContain("Battle readiness");
	deploymentTrigger.listeners.get("click")?.(new Event("click"));
	expect(element("#app").innerHTML).toContain('aria-label="Deployment detail"');
	expect(element("#app").innerHTML).toContain("ds9/defiant · main");
	expect(element("#app").innerHTML).toContain("Deployment</a>");
	expect(element("#app").innerHTML).toContain("Logs</a>");
	expect(element("#app").innerHTML).toContain(
		'<details class="more-deployments"><summary>More deployments</summary>',
	);
	element("document").listeners.get("click")?.({
		target: null,
	} as unknown as Event);
	expect(element("#app").innerHTML).not.toContain(
		'aria-label="Deployment detail"',
	);
	const reconcile = element("#reconcile-all").listeners.get("click");
	expect(reconcile).toBeTypeOf("function");
	await reconcile?.(new Event("click"));
	expect(fetchCalls).toContain("/api/reconcile/pull-requests");
	const request = <Result>(result: Result) => {
		const value: {
			result: Result;
			onsuccess?: () => void;
			onerror?: () => void;
		} = { result };
		queueMicrotask(() => value.onsuccess?.());
		return value;
	};
	const database = {
		transaction: () => ({
			objectStore: () => ({
				getAll: () => request([]),
				put: (record: unknown) => request(record),
			}),
		}),
	};
	const missingCheckoutDirectory = () =>
		Object.assign(new Error("missing checkout directory"), {
			name: "NotFoundError",
		});
	const checkout = {
		getDirectoryHandle: async (name: string) => {
			if (name === ".git")
				return {
					getDirectoryHandle: async () => {
						throw missingCheckoutDirectory();
					},
					getFileHandle: async (file: string) => ({
						getFile: async () => ({
							text: async () =>
								file === "config"
									? '[remote "origin"]\n\turl = git@github.com:ds9/defiant\n'
									: "ref: refs/heads/main\n",
						}),
					}),
				};
			throw missingCheckoutDirectory();
		},
	};
	Object.defineProperties(globalThis, {
		indexedDB: { configurable: true, value: { open: () => request(database) } },
		location: { configurable: true, value: { pathname: "/configuration" } },
		showDirectoryPicker: {
			configurable: true,
			value: async () => checkout,
		},
	});
	await app.connectRepository("ds9:42");
	expect(element("#app").innerHTML).toContain(
		'<td aria-live="polite">Resolved</td>',
	);
	expect(element("#app").innerHTML).toContain("Change checkout");
	const keydown = element("document").listeners.get("keydown");
	keydown?.({
		key: "/",
		target: new FakeElement(),
		preventDefault: () => undefined,
	} as unknown as Event);
	keydown?.({
		key: "Escape",
		target: element("#pr-search"),
		preventDefault: () => undefined,
	} as unknown as Event);
});
