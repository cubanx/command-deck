// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { syncAppearance } from "#/features/command-center/appearance";
import { Configuration } from "#/features/command-center/configuration";
import { DashboardLoadError, OperationalDashboard } from "#/features/command-center/dashboard";
import { CommandCenterNavigation } from "#/features/command-center/navigation";
import { configurationLoader, Route } from "#/routes/configuration";
import { renderFrontend } from "#/web/test-harness";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const client = () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(["snapshot"], {
		user: { login: "Kira", fixture_avatar: true },
		repositories: [{ account_login: "ds9", installation_id: "9", repository_id: "ops", full_name: "ds9/ops" }],
		pullRequests: [],
		deployments: [{ full_name: "ds9/ops", environment: "production", state: "success" }],
		notifications: [],
	});
	return queryClient;
};

test("renders responsive avatar navigation", async () => {
	const originalViewport = window.innerWidth;
	Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
	try {
		renderFrontend(<CommandCenterNavigation />, client());
		const brand = screen.getByRole("link", { name: "Command Deck.ai" });
		expect(screen.queryByText("Open pull requests you authored.")).toBeNull();
		const header = brand.closest(".command-center-navigation");
		expect(header?.querySelector(".command-center-header-brand")?.contains(brand)).toBe(true);
		expect(header?.querySelector(".command-center-header-deployment .deployment-summary")).toBeTruthy();
		expect(brand.getAttribute("href")).toBe("/");
		expect(brand.querySelector('img[src="/icon-adaptive.svg"]')).toBeTruthy();
		expect(header?.querySelector(".avatar-menu-caret")).toBeTruthy();
		expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
		const userMenu = screen.getByRole("button", { name: "User menu" });
		expect(header?.querySelector(".command-center-header-avatar")?.contains(userMenu)).toBe(true);
		expect(userMenu.classList.contains("avatar-menu-button")).toBe(true);
		userMenu.focus();
		expect(document.activeElement).toBe(userMenu);
		fireEvent.click(userMenu);
		expect((await screen.findByRole("menuitem", { name: "Configuration" })).getAttribute("href")).toBe(
			"/configuration",
		);
		expect(screen.getByRole("menuitem", { hidden: true, name: "Reconcile all PRs" })).toBeTruthy();
	} finally {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: originalViewport });
	}
});

test("presents operational configuration controls and announces sanitized reconciliation results without notification controls", async () => {
	const queryClient = client();
	const currentSnapshot = queryClient.getQueryData(["snapshot"]);
	const fetch = vi.fn(
		async (path: string) =>
			new Response(JSON.stringify(path === "/api/snapshot" ? currentSnapshot : { status: "success" }), { status: 200 }),
	);
	vi.stubGlobal("fetch", fetch);
	vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn(async () => "granted") });
	renderFrontend(<Configuration />, queryClient);
	const configuration = screen.getByRole("main", { name: "Configuration" });
	expect(within(configuration).queryByRole("button", { name: /Latest deployment/i })).toBeNull();
	expect(screen.getByRole("button", { name: "Sync GitHub installations" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Reconcile all PRs" })).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Sync GitHub installations" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reconcile", { method: "POST" }));
	expect(await screen.findByText("Reconciliation completed.")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Reconcile all PRs" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reconcile/pull-requests", { method: "POST" }));
	expect(screen.queryByRole("button", { name: "Enable notifications" })).toBeNull();
	expect(Notification.requestPermission).not.toHaveBeenCalled();
});

test("uses the shared sign-in affordance when Configuration cannot load an authenticated snapshot", () => {
	expect(Route.options.errorComponent).toBe(DashboardLoadError);
	renderFrontend(<DashboardLoadError />);
	expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/auth/github");
});

test("shares compact deployment detail in navigation without placing it in route content", async () => {
	const queryClient = client();
	renderFrontend(
		<>
			<CommandCenterNavigation />
			<OperationalDashboard snapshot={queryClient.getQueryData(["snapshot"]) as never} />
		</>,
		queryClient,
	);
	const dashboard = screen.getByRole("main", { name: "Command Center" });
	expect(within(dashboard).queryByRole("button", { name: /Latest deployment/i })).toBeNull();
	const deployment = screen.getByRole("button", { name: /Latest deployment.*ds9\/ops/i });
	expect(deployment.classList.contains("deployment-summary")).toBe(true);
	const deploymentContent = deployment.querySelector(".deployment-summary-content");
	expect([...(deploymentContent?.children ?? [])].map((child) => child.className)).toEqual([
		"deployment-summary-label",
		"status",
		"deployment-summary-detail",
	]);
	expect(deploymentContent?.querySelector(".deployment-summary-label")?.textContent).toBe("Latest deployment");
	expect(deploymentContent?.querySelector(".status")?.textContent).toBe("success");
	expect(deploymentContent?.querySelector(".deployment-summary-detail")?.textContent).toContain("ds9/ops");
	const userMenu = screen.getByRole("button", { name: "User menu" });
	const avatarTarget = userMenu.querySelector(".avatar-menu-target");
	expect(avatarTarget?.querySelector(".avatar-menu-caret")).toBeTruthy();
	expect(avatarTarget?.querySelector(".mantine-Avatar-root")).toBeTruthy();
	deployment.focus();
	fireEvent.click(deployment);
	const dialog = await screen.findByRole("dialog", { name: "Deployment detail" });
	expect(dialog.textContent).toContain("production");
	fireEvent.keyDown(dialog, { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Deployment detail" })).toBeNull());
	expect(document.activeElement).toBe(deployment);
	cleanup();
	renderFrontend(
		<>
			<CommandCenterNavigation />
			<Configuration />
		</>,
		queryClient,
	);
	const configuration = screen.getByRole("main", { name: "Configuration" });
	expect(within(configuration).queryByRole("button", { name: /Latest deployment/i })).toBeNull();
	expect(screen.getByRole("button", { name: /Latest deployment.*ds9\/ops/i })).toBeTruthy();
});

test("prefetches the configuration snapshot and refreshes the subscribed avatar", async () => {
	const queryClient = new QueryClient();
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						user: { login: "Nerys" },
						repositories: [{ account_login: "ds9", installation_id: "9", repository_id: "ops", full_name: "ds9/ops" }],
						pullRequests: [],
						deployments: [],
						notifications: [],
					}),
				),
		),
	);
	await configurationLoader({ context: { queryClient } });
	renderFrontend(
		<>
			<CommandCenterNavigation />
			<Configuration />
		</>,
		queryClient,
	);
	expect(screen.getByRole("button", { name: "User menu" }).textContent).toContain("N");
	queryClient.setQueryData(["snapshot"], { ...queryClient.getQueryData(["snapshot"]), user: { login: "Ezri" } });
	expect(await screen.findByText("E")).toBeTruthy();
});

test("applies persisted appearance at startup and cleans up system changes", () => {
	const listeners = new Set<() => void>();
	vi.stubGlobal("localStorage", { getItem: () => "system" });
	vi.stubGlobal("matchMedia", () => ({
		matches: false,
		addEventListener: (_: string, listener: () => void) => listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
	}));
	const stop = syncAppearance();
	expect(document.documentElement.dataset.appearance).toBe("light");
	expect(document.documentElement.dataset.mantineColorScheme).toBe("light");
	for (const listener of listeners) listener();
	stop();
	expect(listeners.size).toBe(0);
});

test("persists appearance", async () => {
	const store = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
	});
	renderFrontend(<Configuration />, client());
	fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
	expect(store.get("dcc-appearance")).toBe("dark");
	expect(document.documentElement.dataset.appearance).toBe("dark");
	expect(document.documentElement.dataset.mantineColorScheme).toBe("dark");
});
