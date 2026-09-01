// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { snapshotFor, snapshotQueryOptions } from "#/features/command-center/snapshot";
import { SnapshotEvents } from "#/features/command-center/snapshot-events";
import { Dashboard, dashboardLoader } from "#/routes/index";
import { renderFrontend } from "#/web/test-harness";

const snapshot = {
	user: { login: "Kira Nerys" },
	repositories: [],
	pullRequests: [],
	deployments: [],
	notifications: [],
};

const storage = new Map<string, string>();
const localStorage = {
	clear: () => storage.clear(),
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => storage.set(key, value),
};

class FixtureEventSource {
	static instances: FixtureEventSource[] = [];
	closed = false;
	listeners = new Map<string, ((event: Event) => void)[]>();

	constructor() {
		FixtureEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: (event: Event) => void) {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	close() {
		this.closed = true;
	}

	emit(type: string) {
		for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
	}
}

beforeEach(() => {
	vi.stubGlobal("localStorage", localStorage);
});

afterEach(() => {
	cleanup();
	FixtureEventSource.instances = [];
	localStorage.clear();
	vi.unstubAllGlobals();
});

test("prefetches the dashboard through one snapshot cache", async () => {
	const fetch = vi.fn(async () => Response.json(snapshot));
	vi.stubGlobal("fetch", fetch);
	const queryClient = new QueryClient();

	await dashboardLoader({ context: { queryClient } } as never);
	const { queryByText } = renderFrontend(<Dashboard />, queryClient);
	expect(queryByText(/Signed in as Kira Nerys/)).toBeNull();

	expect(fetch).toHaveBeenCalledTimes(1);
	expect(queryClient.getQueryData(snapshotQueryOptions.queryKey)).toEqual(snapshot);
});

test("treats only an unauthenticated snapshot as signed out without retry", async () => {
	const fetch = vi.fn(async () => new Response(null, { status: 401 }));
	vi.stubGlobal("fetch", fetch);
	const queryClient = new QueryClient();
	await dashboardLoader({ context: { queryClient } } as never);
	const { getByRole, queryByRole } = renderFrontend(<Dashboard />, queryClient);
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(getByRole("status").textContent).toContain("Sign in to view your command center.");
	expect(getByRole("link", { name: "Sign in with GitHub" }).getAttribute("href")).toBe("/auth/github");
	expect(queryByRole("alert")).toBeNull();
});

test("keeps non-401 snapshot failures in TanStack Query's default retry and error path", async () => {
	vi.useFakeTimers();
	const fetch = vi.fn(async () => new Response(null, { status: 500 }));
	vi.stubGlobal("fetch", fetch);
	const queryClient = new QueryClient({
		defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY, retry: 2, retryDelay: 0 } },
	});
	try {
		const loading = queryClient.fetchQuery(snapshotQueryOptions);
		const failure = loading.catch((error) => error);
		await vi.runAllTimersAsync();
		expect(await failure).toMatchObject({ message: "Snapshot request failed: 500" });
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(queryClient.getQueryState(snapshotQueryOptions.queryKey)?.status).toBe("error");
	} finally {
		vi.useRealTimers();
	}
});

test("normalizes the legacy snapshot contract without discarding optional projection fields", () => {
	expect(
		snapshotFor({
			error: "temporarily unavailable",
			stale: true,
			installationCount: 0,
			user: {
				login: "Kira Nerys",
				avatar_url: "https://example.test/kira.png",
				fixture_avatar: true,
			},
			repositories: [],
			pullRequests: [],
			deployments: [],
			notifications: [],
		}),
	).toEqual({
		error: "temporarily unavailable",
		stale: true,
		installationCount: 0,
		user: {
			login: "Kira Nerys",
			avatar_url: "https://example.test/kira.png",
			fixture_avatar: true,
		},
		repositories: [],
		pullRequests: [],
		deployments: [],
		notifications: [],
	});
	expect(
		snapshotFor({
			repositories: [],
			pullRequests: [],
			deployments: [],
			notifications: [],
		}),
	).toMatchObject({
		repositories: [],
		pullRequests: [],
		deployments: [],
		notifications: [],
	});
	expect(
		snapshotFor({
			user: { login: 7 },
			repositories: [],
			pullRequests: [],
			deployments: [],
			notifications: [],
		}),
	).toBeNull();
	expect(
		snapshotFor({
			user: { login: "Kira Nerys", avatar_url: "http://example.test/kira.png" },
			repositories: [],
			pullRequests: [],
			deployments: [],
			notifications: [],
		}),
	).toMatchObject({ user: { login: "Kira Nerys" } });
	expect(
		snapshotFor({
			installationCount: -1,
			repositories: [],
			pullRequests: [],
			deployments: [],
			notifications: [],
		}),
	).toBeNull();
});

test("invalidates the snapshot for refresh events and reconnects without polling", () => {
	vi.stubGlobal("EventSource", FixtureEventSource);
	const setInterval = vi.spyOn(globalThis, "setInterval");
	const queryClient = new QueryClient();
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	queryClient.setQueryData(snapshotQueryOptions.queryKey, snapshot);
	const { unmount } = renderFrontend(<SnapshotEvents />, queryClient);
	const events = FixtureEventSource.instances[0];

	events.emit("open");
	expect(invalidate).not.toHaveBeenCalled();
	expect(queryClient.getQueryState(snapshotQueryOptions.queryKey)?.isInvalidated).toBe(false);
	events.emit("refresh");
	expect(invalidate).toHaveBeenCalledTimes(1);
	expect(queryClient.getQueryState(snapshotQueryOptions.queryKey)?.isInvalidated).toBe(true);
	expect(setInterval).not.toHaveBeenCalled();
	queryClient.setQueryData(snapshotQueryOptions.queryKey, snapshot);
	events.emit("open");
	expect(invalidate).toHaveBeenCalledTimes(1);
	events.emit("refresh");
	expect(invalidate).toHaveBeenCalledTimes(2);
	expect(queryClient.getQueryState(snapshotQueryOptions.queryKey)?.isInvalidated).toBe(true);

	unmount();
	expect(events.closed).toBe(true);
});

test("opens snapshot events only while the current snapshot is authenticated and healthy", async () => {
	vi.stubGlobal("EventSource", FixtureEventSource);
	const queryClient = new QueryClient();
	queryClient.setQueryData(snapshotQueryOptions.queryKey, { ...snapshot, user: undefined });
	renderFrontend(<SnapshotEvents />, queryClient);
	expect(FixtureEventSource.instances).toHaveLength(0);

	queryClient.setQueryData(snapshotQueryOptions.queryKey, snapshot);
	await waitFor(() => expect(FixtureEventSource.instances).toHaveLength(1));
	const authenticatedEvents = FixtureEventSource.instances[0];
	queryClient.setQueryData(snapshotQueryOptions.queryKey, { ...snapshot, error: "Sign in required" });
	await waitFor(() => expect(authenticatedEvents.closed).toBe(true));
	queryClient.setQueryData(snapshotQueryOptions.queryKey, snapshot);
	await waitFor(() => expect(FixtureEventSource.instances).toHaveLength(2));
});

test("delivers each newly observed notification once without replaying the initial snapshot", async () => {
	vi.stubGlobal("EventSource", FixtureEventSource);
	const notification = vi.fn();
	Object.assign(notification, { permission: "granted" });
	vi.stubGlobal("Notification", notification);
	const queryClient = new QueryClient();
	queryClient.setQueryData(snapshotQueryOptions.queryKey, {
		...snapshot,
		notifications: [{ id: "existing", title: "Already seen", body: "No replay" }],
	});
	renderFrontend(<SnapshotEvents />, queryClient);
	expect(notification).not.toHaveBeenCalled();

	const updatedSnapshot = {
		...snapshot,
		notifications: [
			{ id: "new", title: "New deployment", body: "The Defiant is ready" },
			{ id: "existing", title: "Already seen", body: "No replay" },
		],
	};
	queryClient.setQueryData(snapshotQueryOptions.queryKey, updatedSnapshot);
	await waitFor(() => expect(notification).toHaveBeenCalledTimes(1));
	queryClient.setQueryData(snapshotQueryOptions.queryKey, updatedSnapshot);
	await waitFor(() => expect(notification).toHaveBeenCalledTimes(1));
});

test("drops notifications observed before permission without replaying them after permission is granted", async () => {
	vi.stubGlobal("EventSource", FixtureEventSource);
	let permission = "default";
	const notification = vi.fn();
	Object.defineProperty(notification, "permission", { get: () => permission });
	vi.stubGlobal("Notification", notification);
	const queryClient = new QueryClient();
	queryClient.setQueryData(snapshotQueryOptions.queryKey, snapshot);
	renderFrontend(<SnapshotEvents />, queryClient);

	const droppedSnapshot = {
		...snapshot,
		notifications: [{ id: "dropped", title: "Old deployment", body: "Do not replay" }],
	};
	queryClient.setQueryData(snapshotQueryOptions.queryKey, droppedSnapshot);
	await waitFor(() => expect(notification).not.toHaveBeenCalled());
	permission = "granted";
	queryClient.setQueryData(snapshotQueryOptions.queryKey, {
		...snapshot,
		notifications: [
			{ id: "new", title: "New deployment", body: "The Defiant is ready" },
			...droppedSnapshot.notifications,
		],
	});
	await waitFor(() => expect(notification).toHaveBeenCalledTimes(1));
	expect(notification).toHaveBeenCalledWith("New deployment", { body: "The Defiant is ready" });
});

test("preserves dashboard preferences while the snapshot changes", async () => {
	localStorage.setItem("dcc-pr-sort", JSON.stringify({ mode: "updated", direction: "desc" }));
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => Response.json(snapshot)),
	);
	const queryClient = new QueryClient();
	const { findByLabelText, queryByText } = renderFrontend(<Dashboard />, queryClient);
	const search = await findByLabelText("Search pull requests");
	expect(queryByText(/Signed in as Kira Nerys/)).toBeNull();
	const sort = await findByLabelText("Sort pull requests");
	fireEvent.change(search, { target: { value: "defiant" } });
	fireEvent.change(sort, { target: { value: "updated:desc" } });
	queryClient.setQueryData(snapshotQueryOptions.queryKey, {
		...snapshot,
		user: { login: "Kira Nerys (refreshed)" },
	});
	await waitFor(() => expect(queryByText(/Signed in as Kira Nerys \(refreshed\)/)).toBeNull());

	expect((search as HTMLInputElement).value).toBe("defiant");
	expect((sort as HTMLSelectElement).value).toBe("updated:desc");
	expect(queryByText("Sort direction")).toBeNull();
});
