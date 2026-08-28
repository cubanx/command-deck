// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { syncAppearance } from "#/features/command-center/appearance";
import {
	exactCheckoutDirectory,
	persistVerifiedCheckout,
	revalidateCheckout,
} from "#/features/command-center/browser-checkout";
import { Configuration } from "#/features/command-center/configuration";
import { OperationalDashboard } from "#/features/command-center/dashboard";
import { CommandCenterNavigation } from "#/features/command-center/navigation";
import { configurationLoader } from "#/routes/configuration";
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

const checkoutStorage = () => {
	const records = new Map<string, unknown>();
	const request = (result: unknown, save?: () => void) => {
		const value: { result: unknown; onsuccess?: () => void; onerror?: () => void } = { result };
		queueMicrotask(() => {
			save?.();
			value.onsuccess?.();
		});
		return value;
	};
	const database = {
		createObjectStore: vi.fn(),
		transaction: () => ({
			objectStore: () => ({
				getAll: () => request([...records.values()]),
				put: (record: { key: string }) => request(undefined, () => records.set(record.key, record)),
			}),
		}),
	};
	vi.stubGlobal("indexedDB", {
		open: () => {
			const value: {
				result: typeof database;
				onupgradeneeded?: () => void;
				onsuccess?: () => void;
				onerror?: () => void;
			} = {
				result: database,
			};
			queueMicrotask(() => {
				value.onupgradeneeded?.();
				value.onsuccess?.();
			});
			return value;
		},
	});
	return records;
};

test("renders responsive avatar navigation and preserves local checkout evidence as informational", async () => {
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

test("presents operational configuration controls and announces sanitized reconciliation and notification results", async () => {
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
	expect(screen.getByRole("table", { name: "Repository checkouts" })).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Sync GitHub installations" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reconcile", { method: "POST" }));
	expect(await screen.findByText("Reconciliation completed.")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Reconcile all PRs" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/reconcile/pull-requests", { method: "POST" }));
	fireEvent.click(screen.getByRole("button", { name: "Enable notifications" }));
	expect(await screen.findByText("Notifications enabled.")).toBeTruthy();
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
	const userMenu = screen.getByRole("button", { name: "User menu" });
	const avatarTarget = userMenu.querySelector(".avatar-menu-target");
	expect(avatarTarget?.querySelector(".avatar-menu-caret")).toBeTruthy();
	expect(avatarTarget?.querySelector(".mantine-Avatar-root")).toBeTruthy();
	fireEvent.click(deployment);
	expect((await screen.findByRole("dialog", { name: "Deployment detail" })).textContent).toContain("production");
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
	expect(screen.getByRole("button", { name: "Choose checkout for ds9/ops" })).toBeTruthy();
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

test("persists appearance and labels checkout discovery as local informational evidence", async () => {
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
	expect(screen.getByText("Detected OpenSpec candidates are local and informational.")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Choose checkout for ds9/ops" })).toBeTruthy();
});

test("uses verified browser checkout contracts and reports picker failures without authority changes", async () => {
	const handle = {
		queryPermission: vi.fn(async () => "granted" as PermissionState),
		getDirectoryHandle: vi.fn(async () => handle),
		getFileHandle: vi.fn(),
		entries: async function* () {},
		requestPermission: vi.fn(),
	};
	const persisted: unknown[] = [];
	expect(await revalidateCheckout({ handle })).toBe("granted");
	expect(await exactCheckoutDirectory(handle, { full_name: "ds9/ops" })).toBe(handle);
	expect(
		await persistVerifiedCheckout({
			handle,
			repository: "ds9/ops",
			read: async () => true,
			persist: async () => persisted.push("saved"),
			record: { key: "ds9:ops" },
		}),
	).toBe(true);
	vi.stubGlobal(
		"showDirectoryPicker",
		vi.fn(async () => {
			throw new Error("DS9 picker failed");
		}),
	);
	renderFrontend(<Configuration />, client());
	fireEvent.click(screen.getByRole("button", { name: "Choose checkout for ds9/ops" }));
	expect((await screen.findByRole("status")).textContent).toBe("Checkout setup failed.");
});

test("reads, persists, and restores local checkout evidence without changing the snapshot", async () => {
	const records = checkoutStorage();
	const file = (text: string) => ({ getFile: async () => ({ text: async () => text }) });
	const checkout = {
		getDirectoryHandle: vi.fn(async (name: string) => {
			if (name === ".git")
				return {
					getFileHandle: async (fileName: string) =>
						file(fileName === "config" ? '[remote "origin"]\n url = https://github.com/ds9/ops\n' : "a".repeat(40)),
					entries: async function* () {},
				};
			if (name === "openspec")
				return {
					getDirectoryHandle: async () => ({
						entries: async function* () {
							yield ["hold-the-line", { kind: "directory", getFileHandle: async () => file("- [x] Done") }];
						},
					}),
				};
			throw new DOMException("Missing", "NotFoundError");
		}),
		queryPermission: async () => "granted" as PermissionState,
		requestPermission: async () => "granted" as PermissionState,
	};
	vi.stubGlobal(
		"showDirectoryPicker",
		vi.fn(async () => checkout),
	);
	const snapshot = client();
	renderFrontend(<Configuration />, snapshot);
	fireEvent.click(screen.getByRole("button", { name: "Choose checkout for ds9/ops" }));
	expect((await screen.findByRole("status")).textContent).toContain("Checkout configured");
	expect(screen.getByText(/Detected local candidates: hold-the-line/)).toBeTruthy();
	expect(records.size).toBe(1);
	expect(snapshot.getQueryData(["snapshot"])).toMatchObject({ pullRequests: [] });
	cleanup();
	renderFrontend(<Configuration />, client());
	expect((await screen.findByRole("status")).textContent).toContain("Checkout restored");
});

test("keeps legacy account-root checkout results local to each repository", async () => {
	const records = checkoutStorage();
	const file = (text: string) => ({ getFile: async () => ({ text: async () => text }) });
	const checkoutFor = (repository: string, candidate: string) => ({
		getDirectoryHandle: async (name: string) => {
			if (name === ".git")
				return {
					getFileHandle: async (fileName: string) =>
						file(
							fileName === "config" ? `[remote "origin"]\n url = https://github.com/${repository}\n` : "a".repeat(40),
						),
				};
			if (name === "openspec")
				return {
					getDirectoryHandle: async () => ({
						entries: async function* () {
							yield [candidate, { kind: "directory", getFileHandle: async () => file("- [x] Done") }];
						},
					}),
				};
			throw new DOMException("Missing", "NotFoundError");
		},
		queryPermission: async () => "granted" as PermissionState,
		requestPermission: async () => "granted" as PermissionState,
	});
	const root = {
		getDirectoryHandle: async (name: string) =>
			name === "ops" ? checkoutFor("ds9/ops", "hold-the-line") : checkoutFor("ds9/science", "wormhole-study"),
		queryPermission: async () => "granted" as PermissionState,
		requestPermission: async () => "granted" as PermissionState,
	};
	records.set("root:ds9", { key: "root:ds9", account: "ds9", kind: "root", handle: root });
	const queryClient = client();
	queryClient.setQueryData(["snapshot"], {
		...queryClient.getQueryData(["snapshot"]),
		repositories: [
			{ account_login: "ds9", installation_id: "9", repository_id: "ops", full_name: "ds9/ops" },
			{ account_login: "ds9", installation_id: "9", repository_id: "science", full_name: "ds9/science" },
		],
	});
	renderFrontend(<Configuration />, queryClient);
	const table = screen.getByRole("table", { name: "Repository checkouts" });
	const ops = within(screen.getByRole("row", { name: /ds9\/ops\s+ds9/ }));
	const science = within(screen.getByRole("row", { name: /ds9\/science\s+ds9/ }));
	expect((await ops.findByRole("status")).textContent).toBe("Checkout restored for ds9/ops.");
	expect((await science.findByRole("status")).textContent).toBe("Checkout restored for ds9/science.");
	expect(ops.getByText("Detected local candidates: hold-the-line")).toBeTruthy();
	expect(science.getByText("Detected local candidates: wormhole-study")).toBeTruthy();
	expect(table.textContent).not.toContain("Detected local candidates: hold-the-line, wormhole-study");
	expect(screen.getByText("Detected OpenSpec candidates are local and informational.")).toBeTruthy();
});
