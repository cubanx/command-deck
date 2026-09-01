import { type QueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DashboardLoadError, OperationalDashboard } from "#/features/command-center/dashboard";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export const dashboardLoader = ({ context }: { context: { queryClient: QueryClient } }) =>
	context.queryClient.ensureQueryData(snapshotQueryOptions);

export const Route = createFileRoute("/")({
	loader: dashboardLoader,
	component: Dashboard,
	errorComponent: DashboardLoadError,
});

export function Dashboard() {
	const { data: snapshot } = useSuspenseQuery(snapshotQueryOptions);
	return <OperationalDashboard snapshot={snapshot} />;
}
