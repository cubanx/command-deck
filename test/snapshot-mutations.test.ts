import { QueryClient } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";
import {
	mergeConfirmMutationOptions,
	reconcileInstallationMutationOptions,
	reconcilePullRequestMutationOptions,
	reconcilePullRequestsMutationOptions,
} from "#/features/command-center/snapshot-mutations";

const runMutation = (options: { mutationFn?: unknown }, variables?: unknown) =>
	(options.mutationFn as (variables: unknown) => Promise<void>)(variables);
const runSuccess = (options: { onSuccess?: unknown }, variables?: unknown) =>
	(options.onSuccess as (data: unknown, variables: unknown) => Promise<void>)(undefined, variables);

test("uses the existing reconciliation and merge-confirmation contracts", async () => {
	const fetch = vi.fn(async () => new Response(null, { status: 200 }));
	vi.stubGlobal("fetch", fetch);
	const queryClient = new QueryClient();
	await runMutation(reconcilePullRequestMutationOptions(queryClient), {
		installationId: "ds9",
		repositoryId: "defiant",
		number: 9,
	});
	await runMutation(reconcilePullRequestsMutationOptions(queryClient));
	await runMutation(reconcileInstallationMutationOptions(queryClient), "ds9");
	await runMutation(mergeConfirmMutationOptions(queryClient), "confirmation-token");

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
	await runSuccess(reconcilePullRequestsMutationOptions(queryClient));
	await runSuccess(reconcileInstallationMutationOptions(queryClient), "ds9");
	await runSuccess(mergeConfirmMutationOptions(queryClient), "confirmation-token");
	expect(invalidate).toHaveBeenCalledTimes(4);
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
