import type { QueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Configuration } from "#/features/command-center/configuration";
import { DashboardLoadError } from "#/features/command-center/dashboard";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export const configurationLoader = ({ context }: { context: { queryClient: QueryClient } }) =>
	context.queryClient.ensureQueryData(snapshotQueryOptions);

export const Route = createFileRoute("/configuration")({
	loader: configurationLoader,
	component: Configuration,
	errorComponent: DashboardLoadError,
});
