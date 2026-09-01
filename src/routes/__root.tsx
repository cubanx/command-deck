import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { CommandCenterNavigation } from "#/features/command-center/navigation";
import { SnapshotEvents } from "#/features/command-center/snapshot-events";

export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<SnapshotEvents />
			<CommandCenterNavigation />
			<Outlet />
		</>
	),
});
