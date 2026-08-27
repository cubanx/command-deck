import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { SnapshotEvents } from "#/features/command-center/snapshot-events";

export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<SnapshotEvents />
			<Outlet />
		</>
	),
});
