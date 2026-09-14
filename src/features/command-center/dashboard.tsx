import { Alert, SimpleGrid, Stack, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardPreferences } from "#/db";
import { DashboardFilters } from "#/features/command-center/dashboard-filters";
import { stages } from "#/features/command-center/dashboard-lifecycle";
import { PullRequestCard } from "#/features/command-center/dashboard-pull-request-card";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";
import { reconcilePullRequestMutationOptions } from "#/features/command-center/snapshot-mutations";
import { defaultSortPreference, sortPreference } from "#/features/command-center/sort-preference";
import { derivePullRequests, type PullRequest, type ViewState } from "#/features/command-center/view-model";

type Snapshot = {
	preferences?: DashboardPreferences;
	repositories?: unknown[];
	error?: string;
	signedOut?: boolean;
	stale?: boolean;
	installationCount?: number;
	user?: { login: string };
	pullRequests: PullRequest[];
	deployments: unknown[];
};

export function DashboardLoadError() {
	return (
		<main aria-label="Command Center" className="command-center">
			<Alert color="red" role="alert">
				Unable to load Command Center. <a href="/auth/github">Sign in</a>
			</Alert>
		</main>
	);
}

export function SignedOutDashboard() {
	return (
		<main aria-label="Command Center" className="command-center">
			<Alert color="blue" role="status">
				Sign in to view your command center. <a href="/auth/github">Sign in with GitHub</a>
			</Alert>
		</main>
	);
}

const dashboardRepositories = (values: unknown[]) =>
	values.flatMap((value) => {
		if (!value || typeof value !== "object") return [];
		const row = value as Record<string, unknown>;
		return typeof row.repository_id === "string" && typeof row.full_name === "string"
			? [{ id: row.repository_id, name: row.full_name }]
			: [];
	});

const initialDashboardView = (
	snapshot: Snapshot,
	repositoryRows: { id: string; name: string }[],
): Partial<ViewState> => {
	const prefs = snapshot.preferences;
	const filters = prefs?.filters;
	return {
		sort: sortPreference(JSON.stringify(prefs?.sort)),
		query: typeof filters?.query === "string" ? filters.query : "",
		statuses: new Set(Array.isArray(filters?.statuses) ? filters.statuses : stages),
		repositories: Array.isArray(prefs?.repositoryIds)
			? new Set(repositoryRows.filter((repo) => prefs.repositoryIds?.includes(repo.id)).map((repo) => repo.name))
			: null,
		attention: typeof filters?.attention === "boolean" ? filters.attention : true,
		failedActions: typeof filters?.failedActions === "boolean" ? filters.failedActions : true,
		failedChecks: typeof filters?.failedChecks === "boolean" ? filters.failedChecks : true,
	};
};

export function OperationalDashboard({ snapshot }: { snapshot: Snapshot }) {
	const queryClient = useQueryClient();
	const repositoryRows = useMemo(
		() => dashboardRepositories(snapshot.repositories ?? snapshot.pullRequests),
		[snapshot.repositories, snapshot.pullRequests],
	);
	const previousRepositories = useRef(repositoryRows);
	const dirty = useRef(false);
	const [view, setView] = useState<Partial<ViewState>>(() => initialDashboardView(snapshot, repositoryRows));
	const preferences = useMutation({
		scope: { id: "dashboard-preferences" },
		onSuccess: (_result, body) => {
			queryClient.setQueryData(snapshotQueryOptions.queryKey, (current) =>
				current ? { ...current, preferences: body as DashboardPreferences } : current,
			);
		},
		mutationFn: async (body: object) => {
			const response = await fetch("/api/preferences", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!response.ok) throw new Error("Unable to save preferences. Try again.");
		},
	});
	const save = preferences.mutate;
	useEffect(() => {
		const previous = previousRepositories.current;
		previousRepositories.current = repositoryRows;
		setView((current) => {
			if (current.repositories == null) return current;
			const ids = new Set(previous.filter((repo) => current.repositories?.has(repo.name)).map((repo) => repo.id));
			const names = repositoryRows.filter((repo) => ids.has(repo.id)).map((repo) => repo.name);
			return names.length === current.repositories.size && names.every((name) => current.repositories?.has(name))
				? current
				: { ...current, repositories: new Set(names) };
		});
	}, [repositoryRows]);

	useEffect(() => {
		if (!dirty.current || !snapshot.user || snapshot.signedOut || snapshot.error) return;
		const timer = setTimeout(() => {
			dirty.current = false;
			save({
				repositoryIds:
					view.repositories == null
						? null
						: repositoryRows.filter((repo) => view.repositories?.has(repo.name)).map((repo) => repo.id),
				sort: view.sort,
				filters: {
					query: view.query,
					statuses: [...(view.statuses ?? stages)],
					attention: view.attention,
					failedActions: view.failedActions,
					failedChecks: view.failedChecks,
				},
			});
		}, 250);
		return () => clearTimeout(timer);
	}, [view, save, repositoryRows, snapshot.user, snapshot.signedOut, snapshot.error]);

	const [busy, setBusy] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState<{ alert: boolean; text: string } | null>(null);
	const reconcile = useMutation(reconcilePullRequestMutationOptions(queryClient));
	const run = async (key: string, button: HTMLButtonElement, action: () => Promise<{ status: string }>) => {
		setBusy(key);
		setAnnouncement({ alert: false, text: "Reconciliation running." });
		try {
			const result = await action();
			setAnnouncement(
				result.status === "success"
					? { alert: false, text: "Reconciliation completed." }
					: result.status === "running"
						? { alert: false, text: "Reconciliation started." }
						: { alert: true, text: "Reconciliation failed. Try again." },
			);
		} catch {
			setAnnouncement({ alert: true, text: "Reconciliation failed. Try again." });
		} finally {
			setBusy(null);
			setTimeout(() => button.focus());
		}
	};
	const items = derivePullRequests(
		snapshot.pullRequests.map((pr) => ({ pr, spec: pr.open_specs?.[0] ?? pr.open_spec })),
		view,
	);
	const set = <Key extends keyof ViewState>(key: Key, value: ViewState[Key]) => {
		dirty.current = true;
		setView((current) => ({ ...current, [key]: value }));
	};
	if (snapshot.signedOut) return <SignedOutDashboard />;
	if (snapshot.error) return <DashboardLoadError />;
	return (
		<main aria-label="Command Center" className="command-center">
			<Stack gap="sm">
				{preferences.isError && (
					<Alert color="red" role="alert">
						Unable to save preferences. Try again.
					</Alert>
				)}
				{snapshot.stale && <Alert color="yellow">Provider reconciliation is stale.</Alert>}
				<DashboardFilters
					view={view}
					set={set}
					pullRequests={snapshot.pullRequests}
					resultCount={items.length}
					clear={() => {
						dirty.current = true;
						setView({
							sort: view.sort ?? defaultSortPreference,
							query: "",
							statuses: new Set(stages),
							repositories: null,
							attention: true,
							failedActions: true,
							failedChecks: true,
						});
					}}
				/>
				{!items.length ? (
					snapshot.installationCount === 0 ? (
						<Alert>
							Install GitHub to choose repositories. <a href="/install/github">Install GitHub</a>
						</Alert>
					) : (
						<Alert>No open authored pull requests.</Alert>
					)
				) : (
					<SimpleGrid cols={1} spacing="sm">
						{items.map((item) => (
							<PullRequestCard
								key={`${item.pr.full_name}:${item.pr.number}`}
								item={item}
								busy={busy}
								onReconcile={(pr, button) =>
									void run(`pr:${pr.number}`, button, () =>
										reconcile.mutateAsync({
											installationId: pr.installation_id ?? "",
											repositoryId: pr.repository_id ?? "",
											number: Number(pr.number),
										}),
									)
								}
							/>
						))}
					</SimpleGrid>
				)}
				{announcement?.alert ? (
					<Alert role="alert" color="red">
						{announcement.text}
					</Alert>
				) : announcement ? (
					<Text role="status">{announcement.text}</Text>
				) : null}
			</Stack>
		</main>
	);
}
