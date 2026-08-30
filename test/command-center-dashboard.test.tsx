// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DashboardLoadError, OperationalDashboard } from "#/features/command-center/dashboard";
import { Route } from "#/routes/index";
import { renderFrontend } from "#/web/test-harness";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const snapshot = {
	installationCount: 1,
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

const evidenceSnapshot = {
	...snapshot,
	pullRequests: [
		{
			...snapshot.pullRequests[0],
			open_specs: [
				{ change_name: "hold-the-line", completed: 1, total: 2 },
				{ change_name: "save-the-prophets", completed: 3, total: 3 },
			],
			detected_open_specs: ["hold-the-line", "SAVE-THE-PROPHETS", "local-runabout"],
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
	expect(screen.getAllByRole("list").some((list) => list.classList.contains("command-center-blockers"))).toBe(true);
	expect(screen.getByRole("article", { name: /Defiant readiness/i })).toBeTruthy();
	expect(screen.getByRole("article", { name: /Defiant readiness/i }).getAttribute("data-with-border")).toBe("true");
	expect(screen.queryByRole("link", { name: /Defiant readiness/i })).toBeNull();
	expect(screen.getByRole("button", { name: "Actions for Defiant readiness" })).toBeTruthy();
	expect(screen.getAllByText(/mergeable/i).length).toBeGreaterThan(1);
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
	const actions = card.getByRole("button", { name: "Actions for Defiant readiness" });
	actions.focus();
	fireEvent.click(actions);
	const pr = await screen.findByRole("menuitem", { name: "Reconcile PR" });
	fireEvent.click(pr);
	expect(actions.hasAttribute("disabled")).toBe(true);
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
	await waitFor(() => expect(document.activeElement).toBe(actions));
	expect(invalidate).toHaveBeenCalled();
});

test("keeps reconciliation in the card header without status details or an empty footer", async () => {
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, new QueryClient());
	const cardElement = screen.getByRole("article", { name: /Defiant readiness/i });
	const card = within(cardElement);
	expect(card.queryByText("Status details")).toBeNull();
	const actions = card.getByRole("button", { name: "Actions for Defiant readiness" });
	const header = card.getByRole("heading", { name: "Defiant readiness" });
	const headerGroup = header.closest(".mantine-Group-root") as HTMLElement | null;
	expect(headerGroup?.style.getPropertyValue("--group-wrap")).toBe("wrap");
	expect(header.contains(actions)).toBe(true);
	expect(card.queryByRole("link", { name: "Defiant readiness" })).toBeNull();
	expect(actions.textContent).not.toContain("Actions");
	expect(actions.textContent).toContain("⌄");
	expect(actions.querySelector(".command-center-pr-title-text")?.textContent).toBe("Defiant readiness");
	expect(actions.querySelector(".command-center-pr-title-cue")?.getAttribute("aria-hidden")).toBe("true");
	expect(actions.querySelectorAll("button")).toHaveLength(0);
	expect(cardElement.querySelector(".mantine-Badge-root")).toBeNull();
	expect(actions.classList.contains("command-center-pr-title-trigger")).toBe(true);
	expect(actions.hasAttribute("data-expanded")).toBe(false);
	expect(card.queryByRole("form", { name: "Merge Defiant readiness" })).toBeNull();
	expect(card.queryByRole("button", { name: /Reconcile installation/i })).toBeNull();
	fireEvent.click(actions);
	expect(actions.getAttribute("data-expanded")).toBe("true");
	const menuItems = await screen.findAllByRole("menuitem");
	expect(menuItems.map((item) => item.textContent)).toEqual(["Reconcile PR", "Merge", "Open PR ↗"]);
	const openPr = menuItems[2];
	expect(openPr.getAttribute("target")).toBe("_blank");
	expect(openPr.getAttribute("rel")).toBe("noreferrer");
	expect(openPr.textContent).toContain("↗");
	fireEvent.keyDown(document.body, { key: "Escape" });
	await waitFor(() => expect(actions.hasAttribute("data-expanded")).toBe(false));
});

test("portals the title menu while preferring its bottom-right anchor", async () => {
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, new QueryClient());
	const card = screen.getByRole("article", { name: "Defiant readiness" });
	const actions = screen.getByRole("button", { name: "Actions for Defiant readiness" });
	fireEvent.click(actions);
	const menu = await screen.findByRole("menu", { hidden: true });
	expect(menu.getAttribute("data-position")).toBe("bottom-end");
	expect(card.contains(menu)).toBe(false);
});

test("never reveals failed response bodies and restores focus", async () => {
	const fetch = vi.fn(async () => new Response("secret-DS9-token", { status: 502 }));
	vi.stubGlobal("fetch", fetch);
	renderFrontend(<OperationalDashboard snapshot={snapshot} />, new QueryClient());
	const card = within(screen.getByRole("article", { name: /Defiant readiness/i }));
	const actions = card.getByRole("button", { name: "Actions for Defiant readiness" });
	actions.focus();
	fireEvent.click(actions);
	const pr = await screen.findByRole("menuitem", { name: "Reconcile PR", hidden: true });
	fireEvent.click(pr);
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Reconciliation failed. Try again."));
	expect(screen.queryByText("secret-DS9-token")).toBeNull();
	await waitFor(() => expect(document.activeElement).toBe(actions));
});

test("renders lifecycle and evidence separately", () => {
	renderFrontend(<OperationalDashboard snapshot={evidenceSnapshot} />);
	const card = within(screen.getByRole("article", { name: /Defiant readiness/i }));
	const lifecycle = card.getByRole("group", { name: "PR Lifecycle" });
	expect(lifecycle.classList.contains("pr-lifecycle")).toBe(true);
	expect(lifecycle.querySelector("legend.pr-lifecycle-title")?.textContent).toBe("PR Lifecycle");
	expect(lifecycle.querySelector(".sr-only")?.textContent).toBe("PR lifecycle. Current stage: OpenSpec ready");
	const pills = lifecycle.querySelector(".lifecycle-pills[aria-hidden='true']");
	expect([...(pills?.querySelectorAll(".lifecycle-pill") ?? [])].map((pill) => pill.textContent)).toEqual([
		"✓ Draft · Complete",
		"◐ OpenSpec ready · Current",
		"○ Ready for review · Upcoming",
		"○ Reviewing · Upcoming",
		"○ Mergeable · Upcoming",
	]);
	expect(pills?.querySelector(".lifecycle-pill.complete")?.textContent).toBe("✓ Draft · Complete");
	expect(pills?.querySelector(".lifecycle-pill.current")?.textContent).toBe("◐ OpenSpec ready · Current");
	expect(pills?.querySelectorAll(".lifecycle-pill.upcoming")).toHaveLength(3);
	expect(card.getByText("OpenSpec · hold-the-line · Incomplete · 1/2")).toBeTruthy();
	expect(card.getByText("OpenSpec · save-the-prophets · Complete · 3/3")).toBeTruthy();
	expect(card.getByText("Detected OpenSpec candidates (informational): local-runabout")).toBeTruthy();
	expect(card.queryByText(/Detected OpenSpec candidates .*hold-the-line/)).toBeNull();
	expect(card.getByRole("link", { name: "Runabout check" }).getAttribute("href")).toBe(
		"https://example.test/actions/9",
	);
	expect(card.queryByRole("link", { name: "Unsafe action" })).toBeNull();
	expect(card.getByText("Unsafe action")).toBeTruthy();
});

test("keeps filter controls in a shared wrapping row", () => {
	renderFrontend(<OperationalDashboard snapshot={snapshot} />);
	const row = screen.getByRole("textbox", { name: "Search pull requests" }).closest(".command-center-filter-row");
	expect(row).toBeTruthy();
	expect(screen.getByRole("textbox", { name: "Search pull requests" }).closest(".filter-grow")).toBeTruthy();
	const status = screen.getByRole("combobox", { name: "Status" });
	expect(row?.contains(status)).toBe(true);
	expect(status.getAttribute("placeholder")).toBe("All statuses");
	const sort = screen.getByRole("combobox", { name: "Sort pull requests" });
	expect(sort.closest(".filter-sort")).toBeTruthy();
	expect(screen.queryByRole("combobox", { name: "Sort direction" })).toBeNull();
	expect(
		within(sort)
			.getAllByRole("option")
			.map((option) => [option.getAttribute("value"), option.textContent]),
	).toEqual([
		["closest:asc", "Closest to merge"],
		["closest:desc", "Furthest from merge"],
		["opened:asc", "Oldest opened"],
		["opened:desc", "Newest opened"],
		["updated:asc", "Least recently updated"],
		["updated:desc", "Most recently updated"],
		["progress:asc", "Least complete"],
		["progress:desc", "Most complete"],
		["repository:asc", "Repository A–Z"],
		["repository:desc", "Repository Z–A"],
	]);
	expect(row?.contains(screen.getByRole("button", { name: "Clear filters" }))).toBe(true);
	const filters = row?.closest(".command-center-filters");
	if (!filters) throw new Error("Expected the filter card");
	const results = within(filters as HTMLElement).getByRole("status") as HTMLElement;
	expect(results.textContent).toBe("2 results");
	expect(results.style.color).toBe("var(--mantine-color-dimmed)");
	expect(results.style.marginBottom).toBe("var(--mantine-spacing-xs)");
	expect(results.style.marginLeft).toBe("auto");
	const clear = screen.getByRole("button", { name: "Clear filters" });
	expect(row?.contains(results)).toBe(true);
	expect(results.previousElementSibling).toBe(clear);
});

test("keeps deployment and broad reconciliation controls out of the dashboard", () => {
	renderFrontend(<OperationalDashboard snapshot={snapshot} />);
	expect(screen.queryByRole("button", { name: /Latest deployment/i })).toBeNull();
	expect(screen.queryByRole("button", { name: "Sync GitHub installations" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Reconcile all PRs" })).toBeNull();
});

test("presents only authoritative OpenSpec tasks on cards and status details", async () => {
	renderFrontend(
		<OperationalDashboard
			snapshot={{
				...snapshot,
				pullRequests: [
					{
						...snapshot.pullRequests[0],
						open_specs: [
							{
								change_name: "defiant-repair",
								completed: 1,
								total: 3,
								active_groups: [
									{
										title: "Current repairs",
										tasks: [
											{ completed: true, text: "Align the deflector" },
											{ completed: false, text: "Reconfigure the deflector" },
										],
									},
									{
										title: "Next repairs",
										tasks: [{ completed: false, text: "Test the warp core" }],
									},
								],
								source_url: "https://github.com/ds9/ops/blob/main/openspec/changes/defiant-repair/tasks.md",
							},
							{
								change_name: "wormhole-log",
								completed: 3,
								total: 3,
								active_groups: [],
								source_url: "javascript:alert('not-safe')",
							},
							{
								change_name: "duplicate-source",
								completed: 0,
								total: 3,
								active_groups: [
									{
										title: "Repeated source title",
										tasks: [
											{ completed: false, text: "Repeat the task" },
											{ completed: false, text: "Repeat the task" },
										],
									},
									{
										title: "Repeated source title",
										tasks: [{ completed: false, text: "Next repeated task" }],
									},
								],
							},
							{
								change_name: "incomplete-evidence",
								completed: 5,
								total: 8,
								active_groups: [],
								source_url: "https://github.com/ds9/ops/blob/main/openspec/changes/incomplete-evidence/tasks.md",
							},
							{
								change_name: "modernize-railway-better-auth",
								completed: 5,
								total: 8,
								pre_merge_ready: true,
								active_groups: [],
								incomplete_groups: [
									{
										title: "2.2-2.4 Observe [post-merge]",
										tasks: [
											{ completed: false, text: "2.2 Confirm the relay" },
											{ completed: false, text: "2.3 Observe the rollout" },
											{ completed: false, text: "2.4 Record the outcome" },
										],
									},
								],
							},
						],
						detected_open_specs: ["local-candidate"],
					},
				],
			}}
		/>,
	);
	const article = screen.getByRole("article", { name: /Defiant readiness/i });
	const viewers = article.querySelectorAll("details");
	expect(viewers).toHaveLength(5);
	expect([...viewers].slice(0, 4).map((viewer) => viewer.querySelector("summary")?.textContent)).toEqual([
		"OpenSpec · defiant-repair · Current repairs · 1/3",
		"OpenSpec · wormhole-log · Complete · 3/3",
		"OpenSpec · duplicate-source · Repeated source title · 0/3",
		"OpenSpec · incomplete-evidence · Incomplete · 5/8",
	]);
	const postMergeSummary = viewers[4]?.querySelector("summary");
	expect(postMergeSummary?.textContent).toContain("OpenSpec · modernize-railway-better-auth · 5/8");
	expect(postMergeSummary?.textContent).not.toContain("Post-merge remaining");
	expect(
		within(postMergeSummary as HTMLElement)
			.getByText("Post-merge")
			.closest(".post-merge-badge"),
	).not.toBeNull();
	expect(viewers[0]?.classList.contains("openspec")).toBe(true);
	expect(viewers[0]?.querySelector("summary > strong")?.textContent).toBe(
		"OpenSpec · defiant-repair · Current repairs · 1/3",
	);
	expect(viewers[0]?.querySelector("ul.tasks")).toBeTruthy();
	expect(viewers[0]?.textContent).toContain("Current repairs");
	expect(viewers[0]?.textContent).toContain("Next repairs");
	expect(
		[...viewers[0]!.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].map((input) => [
			input.checked,
			input.disabled,
		]),
	).toEqual([
		[true, true],
		[false, true],
		[false, true],
	]);
	expect(
		within(article).getAllByRole("checkbox", {
			name: "Reconfigure the deflector",
		}),
	).toHaveLength(1);
	expect(within(article).getAllByRole("checkbox", { name: "Repeat the task" })).toHaveLength(2);
	expect(
		(
			within(article).getByRole("checkbox", {
				name: "Next repeated task",
			}) as HTMLInputElement
		).disabled,
	).toBe(true);
	expect(viewers[3]?.textContent).toContain("Task details are unavailable until reconciliation.");
	expect(viewers[3]?.textContent).not.toContain("All tasks complete.");
	expect(viewers[4]?.textContent).toContain("2.2 Confirm the relay");
	expect(within(article).getAllByRole("link", { name: "Open tasks" })).toHaveLength(2);
	expect([...viewers].some((viewer) => viewer.textContent?.includes("local-candidate"))).toBe(false);
	expect([...viewers].some((viewer) => viewer.textContent?.includes("All tasks complete."))).toBe(true);
});

test("filters, orders, clears, and persists the operational card view", async () => {
	const store = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
	});
	renderFrontend(<OperationalDashboard snapshot={controlSnapshot} />);
	const search = screen.getByRole("textbox", { name: "Search pull requests" });
	const repositoryPills = screen.getByRole("group", { name: "Repositories" });
	const dukat = screen.getByRole("button", { name: "ds9/dukat" });
	expect(dukat.getAttribute("aria-pressed")).toBe("true");
	expect(dukat.querySelector("[aria-hidden='true']")?.textContent).toBe("✓\u00a0");
	fireEvent.click(dukat);
	const unselectedDukat = screen.getByRole("button", { name: "ds9/dukat" });
	expect(unselectedDukat.getAttribute("aria-pressed")).toBe("false");
	expect(unselectedDukat.querySelector("[aria-hidden='true']")).toBeNull();
	fireEvent.click(unselectedDukat);
	fireEvent.change(search, { target: { value: "202" } });
	expect(articleTitles()).toEqual(["Kira ready"]);
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	const status = () => screen.getByRole("combobox", { name: "Status" });
	const selectStatus = async (name: string) => {
		fireEvent.click(status());
		fireEvent.click(await screen.findByRole("option", { name, hidden: true }));
	};
	const clearStatuses = () => {
		const clear = status().closest(".filter-status")?.querySelector("[class*='InputClearButton']");
		if (!clear) throw new Error("Expected built-in status clear control");
		fireEvent.click(clear);
	};
	fireEvent.click(status());
	expect(within(await screen.findByRole("listbox")).getAllByRole("option", { hidden: true })).toHaveLength(8);
	expect(screen.queryByRole("checkbox", { name: "All" })).toBeNull();
	expect(screen.queryByText("Lifecycle")).toBeNull();
	expect(screen.queryByText("Attention")).toBeNull();
	fireEvent.click(await screen.findByRole("option", { name: "Draft", hidden: true }));
	expect(articleTitles()).toEqual(["Dukat draft"]);
	await selectStatus("Needs attention");
	expect(articleTitles()).toEqual(["Quark reviewing", "Odo OpenSpec", "Dukat draft"]);
	const removeDraft = status().closest(".filter-status")?.querySelector("span[data-with-remove] button");
	if (!removeDraft) throw new Error("Expected built-in Draft removal control");
	fireEvent.click(removeDraft);
	expect(status().closest(".filter-status")?.textContent).not.toContain("Draft");
	expect(articleTitles()).toEqual(["Quark reviewing", "Odo OpenSpec", "Dukat draft"]);
	clearStatuses();
	expect(articleTitles()).toHaveLength(5);
	expect(status().getAttribute("placeholder")).toBe("All statuses");
	expect(screen.queryByText(/Status: (All|None)/)).toBeNull();
	for (const [stage, title] of [
		["Draft", "Dukat draft"],
		["OpenSpec", "Odo OpenSpec"],
		["Ready", "Kira ready"],
		["Reviewing", "Quark reviewing"],
		["Mergeable", "Sisko mergeable"],
	] as const) {
		await selectStatus(stage);
		expect(articleTitles()).toEqual([title]);
		clearStatuses();
	}
	for (const [name, expected] of [
		["Needs attention", ["Quark reviewing", "Odo OpenSpec", "Dukat draft"]],
		["Failed Actions", ["Quark reviewing"]],
		["Failed Checks", ["Quark reviewing"]],
	] as const) {
		await selectStatus(name);
		expect(articleTitles()).toEqual(expected);
		clearStatuses();
	}
	for (const name of ["ds9/dukat", "ds9/kira", "ds9/odo", "ds9/quark", "ds9/sisko"])
		fireEvent.click(within(repositoryPills).getByRole("button", { name }));
	expect(screen.queryAllByRole("article")).toEqual([]);
	fireEvent.click(within(repositoryPills).getByRole("button", { name: "ds9/sisko" }));
	expect(articleTitles()).toEqual(["Sisko mergeable"]);
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	const sort = screen.getByRole("combobox", { name: "Sort pull requests" });
	for (const [value, expected] of [
		["opened:asc", ["Sisko mergeable", "Kira ready", "Quark reviewing", "Odo OpenSpec", "Dukat draft"]],
		["opened:desc", ["Dukat draft", "Odo OpenSpec", "Quark reviewing", "Kira ready", "Sisko mergeable"]],
		["updated:asc", ["Sisko mergeable", "Dukat draft", "Quark reviewing", "Odo OpenSpec", "Kira ready"]],
		["updated:desc", ["Kira ready", "Odo OpenSpec", "Quark reviewing", "Dukat draft", "Sisko mergeable"]],
		["repository:asc", ["Dukat draft", "Kira ready", "Odo OpenSpec", "Quark reviewing", "Sisko mergeable"]],
		["repository:desc", ["Sisko mergeable", "Quark reviewing", "Odo OpenSpec", "Kira ready", "Dukat draft"]],
		["closest:asc", ["Sisko mergeable", "Quark reviewing", "Kira ready", "Odo OpenSpec", "Dukat draft"]],
		["closest:desc", ["Dukat draft", "Odo OpenSpec", "Kira ready", "Quark reviewing", "Sisko mergeable"]],
		["progress:asc", ["Odo OpenSpec", "Sisko mergeable", "Quark reviewing", "Kira ready", "Dukat draft"]],
		["progress:desc", ["Odo OpenSpec", "Sisko mergeable", "Quark reviewing", "Kira ready", "Dukat draft"]],
	] as const) {
		fireEvent.change(sort, { target: { value } });
		expect(articleTitles()).toEqual(expected);
	}
	fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
	expect((sort as HTMLSelectElement).value).toBe("progress:desc");
	expect(status().getAttribute("placeholder")).toBe("All statuses");
	expect(store.get("dcc-pr-sort")).toBe('{"mode":"progress","direction":"desc"}');
	expect(screen.getByRole("status").textContent).toBe("5 results");
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

test("distinguishes GitHub setup from an ordinary empty pull request list", () => {
	const { rerender } = renderFrontend(
		<OperationalDashboard snapshot={{ ...snapshot, installationCount: 0, pullRequests: [] }} />,
	);
	expect(screen.getByRole("link", { name: "Install GitHub" }).getAttribute("href")).toBe("/install/github");
	expect(screen.queryByText("No open authored pull requests.")).toBeNull();
	rerender(<OperationalDashboard snapshot={{ ...snapshot, installationCount: 1, pullRequests: [] }} />);
	expect(screen.getByText("No open authored pull requests.")).toBeTruthy();
	expect(screen.queryByRole("link", { name: "Install GitHub" })).toBeNull();
});

test("renders a GitHub sign-in path for route load failures", () => {
	expect(Route.options.errorComponent).toBe(DashboardLoadError);
	renderFrontend(<DashboardLoadError />);
	expect(screen.getByRole("alert").textContent).toContain("Unable to load Command Center.");
	expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/github");
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

test("renders only complete, lifecycle-ready native merge forms", async () => {
	renderFrontend(<OperationalDashboard snapshot={mergeSnapshot} />);
	fireEvent.click(screen.getByRole("button", { name: "Actions for Valid merge" }));
	const form = await screen.findByRole("form", { name: "Merge Valid merge" });
	expect(form.getAttribute("method")).toBe("post");
	expect(form.getAttribute("action")).toBe("/api/merge/start");
	expect([...form.querySelectorAll("input")].map((input) => [input.name, input.value])).toEqual([
		["installationId", "ds9"],
		["repositoryId", "ops"],
		["number", "9"],
		["headSha", "a".repeat(40)],
	]);
	for (const title of [
		"Read only",
		"Draft merge",
		"Failed checks",
		"Review pending",
		"Missing repository",
		"Missing installation",
	])
		expect(within(screen.getByRole("article", { name: title })).queryByRole("form")).toBeNull();
	expect(screen.queryByRole("article", { name: "Closed merge" })).toBeNull();
});
