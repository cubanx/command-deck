import { Alert, SimpleGrid, Stack, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DashboardFilters } from "#/features/command-center/dashboard-filters";
import { stages } from "#/features/command-center/dashboard-lifecycle";
import { PullRequestCard } from "#/features/command-center/dashboard-pull-request-card";
import { reconcilePullRequestMutationOptions } from "#/features/command-center/snapshot-mutations";
import {
	defaultSortPreference,
	loadSortPreference,
	saveSortPreference,
} from "#/features/command-center/sort-preference";
import { derivePullRequests, type PullRequest, type ViewState } from "#/features/command-center/view-model";

type Snapshot = {
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

export function OperationalDashboard({ snapshot }: { snapshot: Snapshot }) {
	const queryClient = useQueryClient();
	const [view, setView] = useState<Partial<ViewState>>({
		sort: loadSortPreference(globalThis.localStorage, console.error),
		query: "",
		statuses: new Set(stages),
		repositories: null,
		attention: true,
		failedActions: true,
		failedChecks: true,
	});
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
	useEffect(
		() => saveSortPreference(view.sort ?? defaultSortPreference, globalThis.localStorage, console.error),
		[view.sort],
	);
	const items = derivePullRequests(
		snapshot.pullRequests.map((pr) => ({ pr, spec: pr.open_specs?.[0] ?? pr.open_spec })),
		view,
	);
	const set = <Key extends keyof ViewState>(key: Key, value: ViewState[Key]) =>
		setView((current) => ({ ...current, [key]: value }));
	if (snapshot.signedOut) return <SignedOutDashboard />;
	if (snapshot.error) return <DashboardLoadError />;
	return (
		<main aria-label="Command Center" className="command-center">
			<Stack gap="sm">
				{snapshot.stale && <Alert color="yellow">Provider reconciliation is stale.</Alert>}
				<DashboardFilters
					view={view}
					set={set}
					pullRequests={snapshot.pullRequests}
					resultCount={items.length}
					clear={() =>
						setView({
							sort: view.sort ?? defaultSortPreference,
							query: "",
							statuses: new Set(stages),
							repositories: null,
							attention: true,
							failedActions: true,
							failedChecks: true,
						})
					}
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
