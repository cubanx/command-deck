import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, test, vi } from "vitest";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";
import {
	mergeConfirmMutationOptions,
	reconcileAllInstallationsMutationOptions,
	reconcileInstallationMutationOptions,
	reconcilePullRequestMutationOptions,
	reconcilePullRequestsMutationOptions,
} from "#/features/command-center/snapshot-mutations";

const runMutation = (options: { mutationFn?: unknown }, variables?: unknown) =>
	(options.mutationFn as (variables: unknown) => Promise<unknown>)(variables);
const runSuccess = (options: { onSuccess?: unknown }, variables?: unknown) =>
	(options.onSuccess as (data: unknown, variables: unknown) => Promise<void>)(undefined, variables);

afterEach(() => vi.unstubAllGlobals());

test("uses the existing reconciliation and merge-confirmation contracts", async () => {
	const statuses = ["running", "success", "blocked", "failed", "success"];
	const fetch = vi.fn(async () => new Response(JSON.stringify({ status: statuses.shift() }), { status: 200 }));
	vi.stubGlobal("fetch", fetch);
	const queryClient = new QueryClient();
	expect(
		await runMutation(reconcilePullRequestMutationOptions(queryClient), {
			installationId: "ds9",
			repositoryId: "defiant",
			number: 9,
		}),
	).toEqual({ status: "running" });
	expect(await runMutation(reconcileAllInstallationsMutationOptions(queryClient))).toEqual({ status: "success" });
	expect(await runMutation(reconcilePullRequestsMutationOptions(queryClient))).toEqual({ status: "blocked" });
	expect(await runMutation(reconcileInstallationMutationOptions(queryClient), "ds9")).toEqual({ status: "failed" });
	expect(await runMutation(mergeConfirmMutationOptions(queryClient), "confirmation-token")).toEqual({
		status: "success",
	});

	expect(fetch.mock.calls).toEqual([
		[
			"/api/reconcile/pull-request",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					installationId: "ds9",
					repositoryId: "defiant",
					number: 9,
				}),
			},
		],
		["/api/reconcile", { method: "POST" }],
		["/api/reconcile/pull-requests", { method: "POST" }],
		[
			"/api/reconcile",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ installationId: "ds9" }),
			},
		],
		[
			"/api/merge/confirm",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: "confirmation=confirmation-token",
			},
		],
	]);
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	await runSuccess(reconcilePullRequestMutationOptions(queryClient), {
		installationId: "ds9",
		repositoryId: "defiant",
		number: 9,
	});
	await runSuccess(reconcileAllInstallationsMutationOptions(queryClient));
	await runSuccess(reconcilePullRequestsMutationOptions(queryClient));
	await runSuccess(reconcileInstallationMutationOptions(queryClient), "ds9");
	await runSuccess(mergeConfirmMutationOptions(queryClient), "confirmation-token");
	expect(invalidate).toHaveBeenCalledTimes(5);
	expect(invalidate).toHaveBeenCalledWith({
		queryKey: snapshotQueryOptions.queryKey,
	});
});

test("fails with a generic status without reading a response body", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("provider secret", { status: 502 })),
	);
	await expect(runMutation(reconcilePullRequestsMutationOptions(new QueryClient()))).rejects.toThrow(
		"Snapshot mutation failed: 502",
	);
});

test("rejects malformed mutation responses without exposing their body", async () => {
	for (const body of ["not json", JSON.stringify({}), JSON.stringify({ status: "secret" })]) {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(body, { status: 200 })),
		);
		await expect(runMutation(reconcilePullRequestsMutationOptions(new QueryClient()))).rejects.toThrow(
			"Invalid snapshot mutation response",
		);
	}
});
