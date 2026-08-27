import { queryOptions } from "@tanstack/react-query";
import { avatarUrlFor } from "#/features/command-center/avatar-url";
import type { PullRequest } from "#/features/command-center/view-model";

export type DashboardSnapshot = {
	error?: string;
	stale?: boolean;
	user?: { login: string; avatar_url?: string; fixture_avatar?: boolean };
	repositories: unknown[];
	pullRequests: PullRequest[];
	deployments: unknown[];
	notifications: unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export const snapshotFor = (value: unknown): DashboardSnapshot | null => {
	if (
		!isRecord(value) ||
		!["repositories", "pullRequests", "deployments", "notifications"].every((key) => Array.isArray(value[key])) ||
		(value.error !== undefined && typeof value.error !== "string") ||
		(value.stale !== undefined && typeof value.stale !== "boolean") ||
		(value.user !== undefined &&
			(!isRecord(value.user) ||
				typeof value.user.login !== "string" ||
				(value.user.avatar_url !== undefined && typeof value.user.avatar_url !== "string") ||
				(value.user.fixture_avatar !== undefined && typeof value.user.fixture_avatar !== "boolean")))
	)
		return null;
	const user = value.user as Record<string, unknown> | undefined;
	const avatarUrl = avatarUrlFor(user?.avatar_url);
	return {
		...(value.error === undefined ? {} : { error: value.error }),
		...(value.stale === undefined ? {} : { stale: value.stale }),
		...(user === undefined
			? {}
			: {
					user: {
						login: user.login as string,
						...(avatarUrl === null ? {} : { avatar_url: avatarUrl }),
						...(user.fixture_avatar === undefined ? {} : { fixture_avatar: user.fixture_avatar as boolean }),
					},
				}),
		repositories: value.repositories as unknown[],
		pullRequests: value.pullRequests as PullRequest[],
		deployments: value.deployments as unknown[],
		notifications: value.notifications as unknown[],
	};
};

export const snapshotQueryOptions = queryOptions({
	queryKey: ["snapshot"],
	queryFn: async () => {
		const response = await fetch("/api/snapshot");
		if (!response.ok) throw new Error(`Snapshot request failed: ${response.status}`);
		const snapshot = snapshotFor(await response.json());
		if (!snapshot) throw new TypeError("Invalid dashboard snapshot");
		return snapshot;
	},
});
