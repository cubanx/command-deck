import { Alert, Button, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { DashboardFilters } from "#/features/command-center/dashboard-filters";
import { DeploymentDetail, StatusDetail } from "#/features/command-center/dashboard-overlays";
import { PullRequestCard } from "#/features/command-center/dashboard-pull-request-card";
import { deploymentText, isDeployment, latestDeployment } from "#/features/command-center/dashboard-utils";
import {
	reconcileInstallationMutationOptions,
	reconcilePullRequestMutationOptions,
	reconcilePullRequestsMutationOptions,
} from "#/features/command-center/snapshot-mutations";
import {
	defaultSortPreference,
	loadSortPreference,
	saveSortPreference,
} from "#/features/command-center/sort-preference";
import {
	type DerivedPullRequest,
	derivePullRequests,
	type PullRequest,
	type ViewState,
} from "#/features/command-center/view-model";

type Snapshot = {
	error?: string;
	stale?: boolean;
	user?: { login: string };
	pullRequests: PullRequest[];
	deployments: unknown[];
};

export function OperationalDashboard({ snapshot }: { snapshot: Snapshot }) {
	const queryClient = useQueryClient();
	const [view, setView] = useState<Partial<ViewState>>({
		sort: loadSortPreference(globalThis.localStorage, console.error),
		query: "",
		statuses: new Set(),
		repositories: null,
	});
	const [detail, setDetail] = useState<DerivedPullRequest | null>(null);
	const [deployments, setDeployments] = useState(false);
	const [busy, setBusy] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState<{ alert: boolean; text: string } | null>(null);
	const detailOpener = useRef<HTMLElement | null>(null);
	const deploymentOpener = useRef<HTMLElement | null>(null);
	const all = useMutation(reconcilePullRequestsMutationOptions(queryClient));
	const installation = useMutation(reconcileInstallationMutationOptions(queryClient));
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
			button.focus();
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
	const deploymentEvidence = snapshot.deployments.filter(isDeployment);
	const latest = latestDeployment(deploymentEvidence);
	if (snapshot.error)
		return (
			<main aria-label="Command Center">
				<Alert color="red" role="alert">
					Unable to load Command Center. <a href="/auth/github">Sign in</a>
				</Alert>
			</main>
		);
	return (
		<main aria-label="Command Center">
			<Stack>
				{snapshot.stale && <Alert color="yellow">Provider reconciliation is stale.</Alert>}
				<Title order={1}>Command Center</Title>
				<Button
					aria-controls="deployment-detail"
					aria-expanded={deployments}
					onClick={(event) => {
						deploymentOpener.current = event.currentTarget;
						setDeployments(true);
					}}
				>
					Latest deployment{deploymentText(latest) ? ` · ${deploymentText(latest)}` : ""}
				</Button>
				{snapshot.user && (
					<Text>
						<span className="sr-only">Signed in as </span>
						{snapshot.user.login}
					</Text>
				)}
				<Text role="status">{items.length} pull requests</Text>
				<Group>
					<Button
						aria-label="Reconcile all pull requests"
						disabled={busy !== null}
						loading={busy === "all"}
						onClick={(event) => void run("all", event.currentTarget, () => all.mutateAsync(undefined))}
					>
						Reconcile all
					</Button>
				</Group>
				<DashboardFilters
					view={view}
					set={set}
					pullRequests={snapshot.pullRequests}
					clear={() =>
						setView({ sort: view.sort ?? defaultSortPreference, query: "", statuses: new Set(), repositories: null })
					}
				/>
				{!items.length ? (
					<Alert>No open authored pull requests.</Alert>
				) : (
					<SimpleGrid cols={{ base: 1, sm: 2 }}>
						{items.map((item) => (
							<PullRequestCard
								key={`${item.pr.full_name}:${item.pr.number}`}
								item={item}
								busy={busy}
								detailOpen={detail?.pr === item.pr}
								onDetail={(selected, button) => {
									detailOpener.current = button;
									setDetail(selected);
								}}
								onReconcile={(pr, button) =>
									void run(`pr:${pr.number}`, button, () =>
										reconcile.mutateAsync({
											installationId: pr.installation_id ?? "",
											repositoryId: pr.repository_id ?? "",
											number: Number(pr.number),
										}),
									)
								}
								onInstallation={(pr, button) =>
									void run(`installation:${pr.installation_id}`, button, () =>
										installation.mutateAsync(pr.installation_id ?? ""),
									)
								}
							/>
						))}
					</SimpleGrid>
				)}
				<StatusDetail detail={detail} close={() => setDetail(null)} returnFocus={() => detailOpener.current?.focus()} />
				<DeploymentDetail
					opened={deployments}
					deployments={deploymentEvidence}
					close={() => setDeployments(false)}
					returnFocus={() => deploymentOpener.current?.focus()}
				/>
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
