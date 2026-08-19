import { expect, test, vi } from "vitest";

class FakeElement {
	dataset: Record<string, string> = {};
	innerHTML = "";
	style: Record<string, string> = {};
	value = "";
	checked = false;
	open = false;
	listeners = new Map<string, (event: Event) => unknown>();

	addEventListener(name: string, listener: (event: Event) => unknown) {
		this.listeners.set(name, listener);
	}

	focus() {}
	setSelectionRange() {}
	matches() {
		return false;
	}
}

test("the compiled browser runtime renders and reconciles with native controls", async () => {
	const elements = new Map<string, FakeElement>();
	const repositoryCheckbox = new FakeElement();
	repositoryCheckbox.dataset.repository = "ds9/defiant";
	repositoryCheckbox.checked = true;
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
			selector === "[data-repository]" ? [repositoryCheckbox] : [],
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
					active_group: { title: "Readiness", tasks: [] },
				},
			},
		],
		deployments: [
			{
				id: "deployment-9",
				full_name: "ds9/defiant",
				environment: "wormhole",
				state: "success",
			},
		],
	};
	let reconciled = false;
	const fetch = vi.fn(async (input: string) =>
		input === "/api/reconcile"
			? new Response(JSON.stringify({ status: "success" }))
			: new Response(JSON.stringify(snapshot)),
	);
	const register = vi.fn();
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
		navigator: {
			configurable: true,
			value: {
				onLine: true,
				serviceWorker: {
					ready: Promise.resolve({ showNotification: () => undefined }),
					register,
				},
			},
		},
		fetch: { configurable: true, value: fetch },
		EventSource: {
			configurable: true,
			value: class {
				addEventListener() {}
			},
		},
	});
	vi.resetModules();
	const app = await import("#/web/app");
	await vi.waitFor(() =>
		expect(element("#app").innerHTML).toContain("Prepare the Defiant"),
	);
	expect(register).not.toHaveBeenCalled();
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
	const reconcile = element("#reconcile").listeners.get("click");
	expect(reconcile).toBeTypeOf("function");
	await reconcile?.(new Event("click"));
	reconciled = fetch.mock.calls.some(([input]) => input === "/api/reconcile");
	expect(reconciled).toBe(true);
	Object.defineProperties(globalThis, {
		indexedDB: { configurable: true, value: {} },
		showDirectoryPicker: {
			configurable: true,
			value: async () => {
				const error = new Error("cancelled");
				error.name = "AbortError";
				throw error;
			},
		},
	});
	await app.connectRepository("ds9:42");
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
