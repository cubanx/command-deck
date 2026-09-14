// @vitest-environment happy-dom
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OperationalDashboard } from "#/features/command-center/dashboard";
import { renderFrontend } from "#/web/test-harness";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
const snapshot = {
	user: { login: "sisko" },
	repositories: [
		{ repository_id: "301", full_name: "ds9/defiant" },
		{ repository_id: "302", full_name: "ds9/prometheus" },
	],
	pullRequests: [
		{ number: 7, repository_id: "301", full_name: "ds9/defiant", title: "Defiant shields", state: "open" },
		{ number: 8, repository_id: "302", full_name: "ds9/prometheus", title: "Prometheus shields", state: "open" },
	],
	deployments: [],
	preferences: {
		repositoryIds: ["301"],
		sort: { mode: "updated", direction: "desc" as const },
		filters: { query: "shields" },
	},
};
test("restores server preferences without saving defaults, saves stable IDs, and restores another session", async () => {
	const fetch = vi.fn(async (_url: string, _options?: RequestInit) => Response.json({}));
	vi.stubGlobal("fetch", fetch);
	const first = renderFrontend(<OperationalDashboard snapshot={snapshot} />);
	expect((first.getByLabelText("Sort pull requests") as HTMLSelectElement).value).toBe("updated:desc");
	expect((first.getByLabelText("Search pull requests") as HTMLInputElement).value).toBe("shields");
	expect(first.getByRole("button", { name: /ds9\/prometheus/ }).getAttribute("aria-pressed")).toBe("false");
	expect(fetch).not.toHaveBeenCalled();
	fireEvent.click(first.getByRole("button", { name: /ds9\/prometheus/ }));
	await waitFor(() => expect(fetch).toHaveBeenCalled());
	const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
	expect(body.repositoryIds).toBeNull();
	expect(body.sort).toEqual({ mode: "updated", direction: "desc" });
	first.unmount();
	const second = renderFrontend(<OperationalDashboard snapshot={{ ...snapshot, preferences: body }} />);
	expect(second.getByRole("button", { name: /ds9\/prometheus/ }).getAttribute("aria-pressed")).toBe("true");
	fireEvent.click(second.getByRole("button", { name: "Clear filters" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
	const cleared = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));
	expect(cleared.filters.query).toBe("");
	expect(cleared.repositoryIds).toBeNull();
	expect(cleared.sort).toEqual(body.sort);
});
test("preference save failures are visible without exposing response details", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("fictional-secret", { status: 500 })),
	);
	const view = renderFrontend(<OperationalDashboard snapshot={snapshot} />);
	fireEvent.change(view.getByLabelText("Search pull requests"), { target: { value: "wormhole" } });
	await waitFor(() => expect(view.getByText(/Unable to save preferences/)).toBeTruthy());
	expect(view.container.textContent).not.toContain("fictional-secret");
});

test("stable selections follow repository renames and never reveal revoked repositories", async () => {
	const fetch = vi.fn(async () => Response.json({}));
	vi.stubGlobal("fetch", fetch);
	const view = renderFrontend(<OperationalDashboard snapshot={snapshot} />);
	const renamed = {
		...snapshot,
		repositories: [{ repository_id: "301", full_name: "ds9/defiant-refit" }, snapshot.repositories[1]!],
		pullRequests: [{ ...snapshot.pullRequests[0]!, full_name: "ds9/defiant-refit" }, snapshot.pullRequests[1]!],
	};
	view.rerender(<OperationalDashboard snapshot={renamed} />);
	await waitFor(() =>
		expect(view.getByRole("button", { name: /ds9\/defiant-refit/ }).getAttribute("aria-pressed")).toBe("true"),
	);
	view.rerender(
		<OperationalDashboard
			snapshot={{ ...renamed, repositories: [snapshot.repositories[1]!], pullRequests: [snapshot.pullRequests[1]!] }}
		/>,
	);
	expect(view.queryByRole("button", { name: /ds9\/defiant/ })).toBeNull();
	expect(view.getByRole("button", { name: /ds9\/prometheus/ }).getAttribute("aria-pressed")).toBe("false");
	expect(fetch).not.toHaveBeenCalled();
});
