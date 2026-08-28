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
	const direction = await findByLabelText("Sort direction");
	fireEvent.change(search, { target: { value: "defiant" } });
	fireEvent.change(sort, { target: { value: "updated" } });
	fireEvent.change(direction, { target: { value: "desc" } });
	queryClient.setQueryData(snapshotQueryOptions.queryKey, {
		...snapshot,
		user: { login: "Kira Nerys (refreshed)" },
	});
	await waitFor(() => expect(queryByText(/Signed in as Kira Nerys \(refreshed\)/)).toBeNull());

	expect((search as HTMLInputElement).value).toBe("defiant");
	expect((sort as HTMLSelectElement).value).toBe("updated");
	expect((direction as HTMLSelectElement).value).toBe("desc");
});
