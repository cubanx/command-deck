// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OperationalDashboard } from "#/features/command-center/dashboard";
import { renderFrontend } from "#/web/test-harness";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const snapshot = {
	pullRequests: [
		{
			number: 9,
			full_name: "ds9/ops",
			title: "Defiant readiness",
			url: "https://example.test/9",
			labels: ["openspec-not-required"],
			review_activity: true,
			completed_review_count: 1,
			unresolved_review_threads: 0,
			changes_requested: false,
			repository_policy_loaded: true,
			required_checks: [],
			mergeable: "clean",
			installation_pull_requests: "write",
			state: "open",
			head_sha: "a".repeat(40),
			installation_id: "ds9",
			repository_id: "ops",
		},
		{
			number: 10,
			full_name: "ds9/science",
			title: "Wormhole chart",
			labels: [],
			open_specs: [],
			open_spec_declaration: "empty",
			installation_pull_requests: "write",
			state: "open",
		},
	],
	deployments: [],
} satisfies Parameters<typeof OperationalDashboard>[0]["snapshot"];

const announcement = () =>
	screen.getAllByRole("status").find((element) => element.textContent?.startsWith("Reconciliation"))?.textContent;
const dismissByOverlay = async () => {
	await waitFor(() => expect(document.querySelector(".m_9814e45f")).not.toBeNull());
	const overlay = document.querySelector(".m_9814e45f");
	if (!overlay) throw new Error("Expected Mantine modal overlay");
	fireEvent.click(overlay);
};

const evidenceSnapshot = {
	...snapshot,
	pullRequests: [
		{
			...snapshot.pullRequests[0],
			open_specs: [
				{ change_name: "hold-the-line", completed: 1, total: 2 },
				{ change_name: "save-the-prophets", completed: 3, total: 3 },
			],
			detected_open_specs: ["local-runabout"],
			workflow_state: "failure",
			checks_state: "success",
			review_state: "approved",
			workflow_failures: [
				{ name: "Runabout check", url: "https://example.test/actions/9" },
				{ name: "Unsafe action", url: "javascript:alert(1)" },
			],
		},
	],
	deployments: [
		{
			full_name: "ds9/ops",
			environment: "production",
			state: "success",
			ref: "main",
			sha: "b".repeat(40),
			updated_at: "2026-08-27T12:00:00Z",
			target_url: "https://deploy.example.test/9",
			log_url: "https://logs.example.test/9",
			pull_request_number: 9,
			title: "Defiant deployment",
			url: "https://example.test/deployments/9",
		},
	],
} satisfies Parameters<typeof OperationalDashboard>[0]["snapshot"];

const controlSnapshot = {
	pullRequests: [
		{
			...snapshot.pullRequests[0],
			number: 101,
			full_name: "ds9/sisko",
			title: "Sisko mergeable",
			opened_at: "2026-01-01T00:00:00Z",
			updated_at: "2026-01-01T00:00:00Z",
		},
		{
			...snapshot.pullRequests[0],
			number: 202,
			full_name: "ds9/kira",
			title: "Kira ready",
			review_activity: false,
			completed_review_count: 0,
			opened_at: "2026-01-02T00:00:00Z",
			updated_at: "2026-01-05T00:00:00Z",
		},
		{
			...snapshot.pullRequests[0],
			number: 303,
			full_name: "ds9/quark",
			title: "Quark reviewing",
			checks_state: "failure",
			workflow_state: "failure",
			required_checks: [{ head_sha: "a".repeat(40), conclusion: "failure" }],
			opened_at: "2026-01-03T00:00:00Z",
			updated_at: "2026-01-03T00:00:00Z",
		},
		{
			...snapshot.pullRequests[0],
			number: 404,
			full_name: "ds9/odo",
			title: "Odo OpenSpec",
			labels: [],
			open_specs: [{ change_name: "repair-wormhole", completed: 1, total: 2 }],
			opened_at: "2026-01-04T00:00:00Z",
			updated_at: "2026-01-04T00:00:00Z",
		},
		{
			...snapshot.pullRequests[0],
			number: 505,
			full_name: "ds9/dukat",
			title: "Dukat draft",
			draft: true,
			opened_at: "2026-01-05T00:00:00Z",
			updated_at: "2026-01-02T00:00:00Z",
		},
	],
	deployments: [],
} satisfies Parameters<typeof OperationalDashboard>[0]["snapshot"];

const mergeSnapshot = {
	pullRequests: [
		{ ...snapshot.pullRequests[0], title: "Valid merge" },
		{
			...snapshot.pullRequests[0],
			number: 10,
			full_name: "ds9/read",
			title: "Read only",
			installation_pull_requests: "read",
		},
		{ ...snapshot.pullRequests[0], number: 11, full_name: "ds9/draft", title: "Draft merge", draft: true },
		{ ...snapshot.pullRequests[0], number: 12, full_name: "ds9/closed", title: "Closed merge", state: "closed" },
		{
			...snapshot.pullRequests[0],
			number: 13,
			full_name: "ds9/checks",
			title: "Failed checks",
			required_checks: [{ head_sha: "a".repeat(40), conclusion: "failure" }],
		},
		{
			...snapshot.pullRequests[0],
			number: 14,
			full_name: "ds9/review",
			title: "Review pending",
			completed_review_count: 0,
		},
		{
			...snapshot.pullRequests[0],
			number: 15,
			full_name: "ds9/repository",
			title: "Missing repository",
			repository_id: undefined,
		},
		{
			...snapshot.pullRequests[0],
			number: 16,
			full_name: "ds9/installation",
			title: "Missing installation",
			installation_id: undefined,
		},
		{ ...snapshot.pullRequests[0], number: "nan", full_name: "ds9/number", title: "Invalid number" },
		{ ...snapshot.pullRequests[0], number: 0, full_name: "ds9/zero", title: "Zero number" },
		{ ...snapshot.pullRequests[0], number: 21.5, full_name: "ds9/fraction", title: "Fractional number" },
		{ ...snapshot.pullRequests[0], number: 22, full_name: "ds9/short-sha", title: "Short SHA", head_sha: "abc" },
		{
			...snapshot.pullRequests[0],
			number: 23,
			full_name: "ds9/nonhex-sha",
			title: "Nonhex SHA",
			head_sha: "g".repeat(40),
		},
		{ ...snapshot.pullRequests[0], number: 18, full_name: "ds9/head", title: "Missing head", head_sha: "" },
		{
			...snapshot.pullRequests[0],
			number: 19,
			full_name: "ds9/blocked",
			title: "Mergeability blocked",
			mergeable: "blocked",
		},
		{
			...snapshot.pullRequests[0],
			number: 20,
			full_name: "ds9/local",
			title: "Local only",
			labels: [],
			open_specs: [],
			open_spec_declaration: "empty",
			detected_open_specs: ["local-only"],
		},
	],
	deployments: [],
} satisfies Parameters<typeof OperationalDashboard>[0]["snapshot"];

const articleTitles = () => screen.getAllByRole("article").map((article) => article.getAttribute("aria-label"));

test("renders accessible lifecycle cards, filters, and fail-closed merge controls", () => {
	renderFrontend(<OperationalDashboard snapshot={snapshot} />);
	expect(screen.getByRole("article", { name: /Defiant readiness/i })).toBeTruthy();
	expect(screen.getByRole("article", { name: /Defiant readiness/i }).getAttribute("data-with-border")).toBe("true");
	expect(screen.getByRole("link", { name: /Defiant readiness/i })).toBeTruthy();
	expect(screen.getAllByText(/mergeable/i).length).toBeGreaterThan(1);
	expect(screen.getByRole("button", { name: "Merge" })).toBeTruthy();
	expect(screen.queryAllByRole("button", { name: "Merge" })).toHaveLength(1);
	fireEvent.change(screen.getByRole("textbox", { name: /search pull requests/i }), { target: { value: "wormhole" } });
	expect(screen.queryByText("Defiant readiness")).toBeNull();
	expect(screen.getByText("Wormhole chart")).toBeTruthy();
});

test("reconciles exact targets with busy, sanitized results, invalidation, and focus return", async () => {
	let resolve!: (response: Response) => void;
	const fetch = vi.fn(() => new Promise<Response>((done) => (resolve = done)));
	vi.stubGlobal("fetch", fetch);
	const client = new QueryClient();
	const invalidate = vi.spyOn(client, "invalidateQueries");
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, client);
	const cardElement = screen.getByRole("article", { name: /Defiant readiness/i });
	const card = within(cardElement);
	const pr = card.getByRole("button", { name: "Reconcile Defiant readiness" });
	pr.focus();
	fireEvent.click(pr);
	expect(pr.hasAttribute("disabled")).toBe(true);
	expect(cardElement.getAttribute("aria-busy")).toBe("true");
	expect(announcement()).toBe("Reconciliation running.");
	await waitFor(() =>
		expect(fetch).toHaveBeenCalledWith(
			"/api/reconcile/pull-request",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ installationId: "ds9", repositoryId: "ops", number: 9 }),
			}),
		),
	);
	resolve(new Response(JSON.stringify({ status: "success" }), { status: 200 }));
	await waitFor(() => expect(announcement()).toBe("Reconciliation completed."));
	expect(document.activeElement).toBe(pr);
	expect(invalidate).toHaveBeenCalled();
});

test("reconciles an installation with the exact JSON target", async () => {
	const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "success" }), { status: 200 }));
	vi.stubGlobal("fetch", fetch);
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, new QueryClient());
	const card = within(screen.getByRole("article", { name: /Defiant readiness/i }));
	fireEvent.click(card.getByRole("button", { name: "Reconcile installation ds9" }));
	await waitFor(() =>
		expect(fetch).toHaveBeenCalledWith(
			"/api/reconcile",
			expect.objectContaining({ body: JSON.stringify({ installationId: "ds9" }) }),
		),
	);
});

test("reconciles all pull requests without a request body", async () => {
	const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "success" }), { status: 200 }));
	vi.stubGlobal("fetch", fetch);
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, new QueryClient());
	fireEvent.click(screen.getByRole("button", { name: "Reconcile all pull requests" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reconcile/pull-requests", { method: "POST" }));
});

test("never reveals failed response bodies and restores focus", async () => {
	const fetch = vi.fn(async () => new Response("secret-DS9-token", { status: 502 }));
	vi.stubGlobal("fetch", fetch);
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, new QueryClient());
	const card = within(screen.getByRole("article", { name: /Defiant readiness/i }));
	const pr = card.getByRole("button", { name: "Reconcile Defiant readiness" });
	await waitFor(() => expect(pr.hasAttribute("disabled")).toBe(false));
	pr.focus();
	fireEvent.click(pr);
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Reconciliation failed. Try again."));
	expect(screen.queryByText("secret-DS9-token")).toBeNull();
	expect(document.activeElement).toBe(pr);
});

test("renders lifecycle and evidence separately and provides dismissible status detail", async () => {
	renderFrontend(<OperationalDashboard snapshot={evidenceSnapshot} />);
	const card = within(screen.getByRole("article", { name: /Defiant readiness/i }));
	expect(card.getByRole("list", { name: "PR Lifecycle" }).textContent).toContain("Draft complete");
	expect(card.getByRole("list", { name: "PR Lifecycle" }).textContent).toContain("Mergeable upcoming");
	expect(card.getByText("OpenSpec · hold-the-line · 1/2")).toBeTruthy();
	expect(card.getByText("OpenSpec · save-the-prophets · 3/3")).toBeTruthy();
	expect(card.getByText(/Detected OpenSpec candidates \(informational\): local-runabout/)).toBeTruthy();
	expect(card.getByRole("link", { name: "Runabout check" }).getAttribute("href")).toBe(
		"https://example.test/actions/9",
	);
	expect(card.queryByRole("link", { name: "Unsafe action" })).toBeNull();
	expect(card.getByText("Unsafe action")).toBeTruthy();
	const trigger = card.getByRole("button", { name: "Inspect Defiant readiness status" });
	trigger.focus();
	fireEvent.click(trigger);
	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	const dialog = await screen.findByRole("dialog", { name: "Pull request status detail" });
	expect(dialog.textContent).toContain("Actions: failure");
	expect(dialog.textContent).toContain("Checks: success");
	expect(dialog.textContent).toContain("Review: approved");
	expect(dialog.textContent).toContain("Mergeability: clean");
	expect(dialog.textContent).toContain("OpenSpec · hold-the-line · 1/2");
	expect(dialog.textContent).toContain("Detected OpenSpec candidates (informational): local-runabout");
	fireEvent.keyDown(dialog, { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pull request status detail" })).toBeNull());
	expect(document.activeElement).toBe(trigger);
	fireEvent.click(trigger);
	fireEvent.click(await screen.findByRole("button", { name: "Close status detail" }));
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pull request status detail" })).toBeNull());
	expect(document.activeElement).toBe(trigger);
	fireEvent.click(trigger);
	await dismissByOverlay();
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pull request status detail" })).toBeNull());
	expect(document.activeElement).toBe(trigger);
});

test("presents deployment evidence, empty state, and dismissible deployment detail", async () => {
	const { rerender } = renderFrontend(<OperationalDashboard snapshot={evidenceSnapshot} />);
	const trigger = screen.getByRole("button", { name: /Latest deployment.*ds9\/ops/i });
	trigger.focus();
	fireEvent.click(trigger);
	expect(trigger.getAttribute("aria-expanded")).toBe("true");
	const dialog = await screen.findByRole("dialog", { name: "Deployment detail" });
	expect(dialog.textContent).toContain("ds9/ops");
	expect(dialog.textContent).toContain("production");
	expect(dialog.textContent).toContain("success");
	expect(dialog.textContent).toContain("main");
	expect(dialog.textContent).toContain("b".repeat(40));
	expect(within(dialog).getByRole("link", { name: "Deployment" }).getAttribute("href")).toBe(
		"https://deploy.example.test/9",
	);
	expect(within(dialog).getByRole("link", { name: "Logs" }).getAttribute("href")).toBe("https://logs.example.test/9");
	fireEvent.keyDown(dialog, { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Deployment detail" })).toBeNull());
	expect(document.activeElement).toBe(trigger);
	fireEvent.click(trigger);
	await dismissByOverlay();
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Deployment detail" })).toBeNull());
	expect(document.activeElement).toBe(trigger);
	rerender(<OperationalDashboard snapshot={{ ...snapshot, pullRequests: [] }} />);
	fireEvent.click(screen.getByRole("button", { name: /Latest deployment/i }));
	expect((await screen.findByRole("dialog", { name: "Deployment detail" })).textContent).toContain(
		"No recent deployment evidence.",
	);
});

test("filters, orders, clears, and persists the operational card view", () => {
	const store = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
	});
	renderFrontend(<OperationalDashboard snapshot={controlSnapshot} />);
	const search = screen.getByRole("textbox", { name: "Search pull requests" });
	fireEvent.change(search, { target: { value: "202" } });
	expect(articleTitles()).toEqual(["Kira ready"]);
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	for (const [stage, title] of [
		["draft", "Dukat draft"],
		["openspec", "Odo OpenSpec"],
		["ready", "Kira ready"],
		["reviewing", "Quark reviewing"],
		["mergeable", "Sisko mergeable"],
	] as const) {
		fireEvent.click(screen.getByRole("checkbox", { name: stage }));
		expect(articleTitles()).toEqual([title]);
		fireEvent.click(screen.getByRole("checkbox", { name: stage }));
	}
	for (const [name, expected] of [
		["Needs attention", ["Quark reviewing", "Odo OpenSpec", "Dukat draft"]],
		["Failed Actions", ["Quark reviewing"]],
		["Failed Checks", ["Quark reviewing"]],
	] as const) {
		fireEvent.click(screen.getByRole("checkbox", { name }));
		expect(articleTitles()).toEqual(expected);
		fireEvent.click(screen.getByRole("checkbox", { name }));
	}
	const repository = screen.getByRole("combobox", { name: "Repository" });
	fireEvent.click(repository);
	for (const name of ["ds9/dukat", "ds9/odo", "ds9/quark", "ds9/sisko"])
		fireEvent.click(screen.getByRole("option", { name }));
	expect(articleTitles()).toEqual(["Kira ready"]);
	fireEvent.click(screen.getByRole("option", { name: "ds9/sisko" }));
	expect(articleTitles()).toEqual(["Sisko mergeable", "Kira ready"]);
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	const sort = screen.getByRole("combobox", { name: "Sort pull requests" });
	const direction = screen.getByRole("combobox", { name: "Sort direction" });
	for (const [mode, asc, desc] of [
		[
			"opened",
			["Sisko mergeable", "Kira ready", "Quark reviewing", "Odo OpenSpec", "Dukat draft"],
			["Dukat draft", "Odo OpenSpec", "Quark reviewing", "Kira ready", "Sisko mergeable"],
		],
		[
			"updated",
			["Sisko mergeable", "Dukat draft", "Quark reviewing", "Odo OpenSpec", "Kira ready"],
			["Kira ready", "Odo OpenSpec", "Quark reviewing", "Dukat draft", "Sisko mergeable"],
		],
		[
			"repository",
			["Dukat draft", "Kira ready", "Odo OpenSpec", "Quark reviewing", "Sisko mergeable"],
			["Sisko mergeable", "Quark reviewing", "Odo OpenSpec", "Kira ready", "Dukat draft"],
		],
		[
			"closest",
			["Sisko mergeable", "Quark reviewing", "Kira ready", "Odo OpenSpec", "Dukat draft"],
			["Dukat draft", "Odo OpenSpec", "Kira ready", "Quark reviewing", "Sisko mergeable"],
		],
		[
			"progress",
			["Odo OpenSpec", "Sisko mergeable", "Quark reviewing", "Kira ready", "Dukat draft"],
			["Odo OpenSpec", "Sisko mergeable", "Quark reviewing", "Kira ready", "Dukat draft"],
		],
	] as const) {
		fireEvent.change(sort, { target: { value: mode } });
		fireEvent.change(direction, { target: { value: "asc" } });
		expect(articleTitles()).toEqual(asc);
		fireEvent.change(direction, { target: { value: "desc" } });
		expect(articleTitles()).toEqual(desc);
	}
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect((sort as HTMLSelectElement).value).toBe("progress");
	expect((direction as HTMLSelectElement).value).toBe("desc");
	expect(store.get("dcc-pr-sort")).toBe('{"mode":"progress","direction":"desc"}');
	expect(screen.getByRole("status").textContent).toBe("5 pull requests");
});

test("keeps snapshot failures sanitized while stale and empty states remain usable", () => {
	const { rerender } = renderFrontend(<OperationalDashboard snapshot={{ ...snapshot, error: "secret-ds9-failure" }} />);
	expect(screen.getAllByRole("main", { name: "Command Center" })).toHaveLength(1);
	expect(screen.getByRole("alert").textContent).toContain("Unable to load Command Center.");
	expect(screen.queryByText("secret-ds9-failure")).toBeNull();
	expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/github");
	rerender(<OperationalDashboard snapshot={{ ...snapshot, stale: true }} />);
	expect(screen.getByRole("alert").textContent).toContain("Provider reconciliation is stale.");
	expect(screen.getByRole("article", { name: "Defiant readiness" })).toBeTruthy();
	rerender(<OperationalDashboard snapshot={{ ...snapshot, pullRequests: [] }} />);
	expect(screen.getByRole("alert").textContent).toBe("No open authored pull requests.");
});

test("renders one responsive semantic dashboard surface without duplicate controls", () => {
	const originalViewport = window.innerWidth;
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
	try {
		window.dispatchEvent(new Event("resize"));
		renderFrontend(<OperationalDashboard snapshot={snapshot} />);
		expect(screen.getAllByRole("main", { name: "Command Center" })).toHaveLength(1);
		expect(screen.getAllByRole("textbox", { name: "Search pull requests" })).toHaveLength(1);
		expect(screen.getAllByRole("article")).toHaveLength(2);
	} finally {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: originalViewport });
	}
});

test("renders only complete, lifecycle-ready native merge forms", () => {
	renderFrontend(<OperationalDashboard snapshot={mergeSnapshot} />);
	const form = screen.getByRole("form", { name: "Merge Valid merge" });
	expect(form.getAttribute("method")).toBe("post");
	expect(form.getAttribute("action")).toBe("/api/merge/start");
	expect([...form.querySelectorAll("input")].map((input) => [input.name, input.value])).toEqual([
		["installationId", "ds9"],
		["repositoryId", "ops"],
		["number", "9"],
		["headSha", "a".repeat(40)],
	]);
	expect(screen.getAllByRole("form")).toHaveLength(1);
	for (const title of [
		"Read only",
		"Draft merge",
		"Failed checks",
		"Review pending",
		"Missing repository",
		"Missing installation",
		"Invalid number",
		"Zero number",
		"Fractional number",
		"Short SHA",
		"Nonhex SHA",
		"Missing head",
		"Mergeability blocked",
		"Local only",
	])
		expect(within(screen.getByRole("article", { name: title })).queryByRole("form")).toBeNull();
	expect(screen.queryByRole("article", { name: "Closed merge" })).toBeNull();
});
