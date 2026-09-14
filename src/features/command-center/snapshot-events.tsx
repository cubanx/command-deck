import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export const SnapshotEvents = () => {
	const queryClient = useQueryClient();
	const { data: snapshot, isError } = useQuery({ ...snapshotQueryOptions, enabled: false });
	const authenticated = Boolean(snapshot?.user && !snapshot.error && !isError);

	useEffect(() => {
		if (!authenticated) return;
		const events = new EventSource("/events");
		const invalidate = () =>
			void queryClient.invalidateQueries({
				queryKey: snapshotQueryOptions.queryKey,
			});
		events.addEventListener("refresh", invalidate);

		return () => events.close();
	}, [authenticated, queryClient]);

	return null;
};
