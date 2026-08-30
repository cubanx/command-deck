import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

export const SnapshotEvents = () => {
	const queryClient = useQueryClient();
	const { data: snapshot, isError } = useQuery({ ...snapshotQueryOptions, enabled: false });
	const notificationIds = useRef<Set<string> | null>(null);
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

	useEffect(() => {
		if (!authenticated) return;
		const notifications = snapshot?.notifications ?? [];
		const ids = notifications.flatMap((notification) => {
			if (typeof notification !== "object" || notification === null) return [];
			const { id, title, body } = notification as Record<string, unknown>;
			return typeof id === "string" && typeof title === "string" && typeof body === "string"
				? [{ id, title, body }]
				: [];
		});
		if (notificationIds.current === null) {
			notificationIds.current = new Set(ids.map((notification) => notification.id));
			return;
		}
		for (const notification of ids) {
			if (notificationIds.current.has(notification.id)) continue;
			notificationIds.current.add(notification.id);
			if ("Notification" in globalThis && Notification.permission === "granted")
				new Notification(notification.title, { body: notification.body });
		}
	}, [authenticated, snapshot?.notifications]);

	return null;
};
