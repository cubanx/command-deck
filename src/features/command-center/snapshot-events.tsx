import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export const SnapshotEvents = () => {
	const queryClient = useQueryClient();

	useEffect(() => {
		const events = new EventSource("/events");
		const invalidate = () =>
			void queryClient.invalidateQueries({
				queryKey: snapshotQueryOptions.queryKey,
			});
		events.addEventListener("refresh", invalidate);

		return () => events.close();
	}, [queryClient]);

	return null;
};
