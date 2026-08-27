import { mutationOptions, type QueryClient } from "@tanstack/react-query";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export type ReconcilePullRequest = {
	installationId: string;
	repositoryId: string;
	number: number;
};

const post = async (path: string, body?: BodyInit, headers?: HeadersInit) => {
	const response = await fetch(
		path,
		body === undefined ? { method: "POST" } : { method: "POST", headers: headers ?? {}, body },
	);
	if (!response.ok) throw new Error(`Snapshot mutation failed: ${response.status}`);
};

const snapshotMutationOptions = <Variables>(
	queryClient: QueryClient,
	mutationFn: (variables: Variables) => Promise<void>,
) =>
	mutationOptions({
		mutationFn,
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: snapshotQueryOptions.queryKey,
			}),
	});

export const reconcilePullRequestMutationOptions = (queryClient: QueryClient) =>
	snapshotMutationOptions(queryClient, (target: ReconcilePullRequest) =>
		post("/api/reconcile/pull-request", JSON.stringify(target), {
			"content-type": "application/json",
		}),
	);

export const reconcilePullRequestsMutationOptions = (queryClient: QueryClient) =>
	snapshotMutationOptions(queryClient, () => post("/api/reconcile/pull-requests"));

export const reconcileInstallationMutationOptions = (queryClient: QueryClient) =>
	snapshotMutationOptions(queryClient, (installationId: string) =>
		post("/api/reconcile", JSON.stringify({ installationId }), {
			"content-type": "application/json",
		}),
	);

export const mergeConfirmMutationOptions = (queryClient: QueryClient) =>
	snapshotMutationOptions(queryClient, (confirmation: string) =>
		post("/api/merge/confirm", new URLSearchParams({ confirmation }).toString(), {
			"content-type": "application/x-www-form-urlencoded",
		}),
	);
