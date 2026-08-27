import {
	Alert,
	Badge,
	Button,
	Card,
	Checkbox,
	Group,
	Modal,
	NativeSelect,
	SimpleGrid,
	Stack,
	Text,
	TextInput,
	Title,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
	reconcileInstallationMutationOptions,
	reconcilePullRequestMutationOptions,
	reconcilePullRequestsMutationOptions,
} from "#/features/command-center/snapshot-mutations";
import {
	defaultSortPreference,
	isSortMode,
	loadSortPreference,
	type SortPreference,
	saveSortPreference,
} from "#/features/command-center/sort-preference";
import {
	type DerivedPullRequest,
	derivePullRequests,
	mergeControlFor,
	type PullRequest,
	repositoryOptions,
	type ViewState,
} from "#/features/command-center/view-model";

type Deployment = {
	id?: string;
	full_name?: string;
	environment?: string;
	ref?: string;
	sha?: string;
	state?: string;
	updated_at?: string;
	target_url?: string | null;
	log_url?: string | null;
};
type Snapshot = {
	error?: string;
	stale?: boolean;
	user?: { login: string };
	pullRequests: PullRequest[];
	deployments: unknown[];
};
const stages = ["draft", "openspec", "ready", "reviewing", "mergeable"];
const stageLabel = (stage: string) =>
	({ draft: "Draft", openspec: "OpenSpec", ready: "Ready", reviewing: "Reviewing", mergeable: "Mergeable" })[stage] ??
	stage;
const safeHref = (value: unknown) => {
	try {
		const url = new URL(String(value));
		return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
	} catch {
		return undefined;
	}
};
const latestDeployment = (deployments: Deployment[]) =>
	deployments.toSorted((left, right) => Date.parse(right.updated_at ?? "") - Date.parse(left.updated_at ?? ""))[0];
const deploymentText = (deployment?: Deployment) =>
	deployment
		? [deployment.full_name, deployment.environment, deployment.state, deployment.ref, deployment.sha]
				.filter(Boolean)
				.join(" · ")
		: "";
const isOptionalString = (value: unknown) => value === undefined || value === null || typeof value === "string";
const isDeployment = (value: unknown): value is Deployment =>
	typeof value === "object" &&
	value !== null &&
	["id", "full_name", "environment", "ref", "sha", "state", "updated_at", "target_url", "log_url"].every((field) =>
		isOptionalString((value as Record<string, unknown>)[field]),
	);
const hasMergeTarget = (pr: PullRequest) =>
	typeof pr.installation_id === "string" &&
	pr.installation_id.trim().length > 0 &&
	typeof pr.repository_id === "string" &&
	pr.repository_id.trim().length > 0 &&
	Number.isInteger(Number(pr.number)) &&
	Number(pr.number) > 0 &&
	typeof pr.head_sha === "string" &&
	/^[a-f\d]{40}$/i.test(pr.head_sha);

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
	const closeDetail = () => {
		setDetail(null);
	};
	const closeDeployments = () => {
		setDeployments(false);
	};
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
					<TextInput
						label="Search pull requests"
						value={view.query ?? ""}
						onChange={(event) => set("query", event.currentTarget.value)}
					/>
					<NativeSelect
						label="Repository"
						data={["", ...repositoryOptions(snapshot.pullRequests.map((pr) => ({ pr })))]}
						value={[...(view.repositories ?? [])][0] ?? ""}
						onChange={(event) =>
							set("repositories", event.currentTarget.value ? new Set([event.currentTarget.value]) : null)
						}
					/>
					<NativeSelect
						label="Sort pull requests"
						data={["closest", "opened", "updated", "progress", "repository"]}
						value={view.sort?.mode ?? "closest"}
						onChange={(event) =>
							isSortMode(event.currentTarget.value) &&
							set("sort", { ...(view.sort ?? defaultSortPreference), mode: event.currentTarget.value })
						}
					/>
					<NativeSelect
						label="Sort direction"
						data={["asc", "desc"]}
						value={view.sort?.direction ?? "asc"}
						onChange={(event) =>
							set("sort", {
								...(view.sort ?? defaultSortPreference),
								direction: event.currentTarget.value as SortPreference["direction"],
							})
						}
					/>
					<Button
						onClick={() =>
							setView({ sort: view.sort ?? defaultSortPreference, query: "", statuses: new Set(), repositories: null })
						}
					>
						Clear filters
					</Button>
				</Group>
				<Group>
					{stages.map((stage) => (
						<Checkbox
							key={stage}
							label={stage}
							checked={view.statuses?.has(stage) ?? false}
							onChange={() => {
								const statuses = new Set(view.statuses);
								statuses.has(stage) ? statuses.delete(stage) : statuses.add(stage);
								set("statuses", statuses);
							}}
						/>
					))}
					<Checkbox
						label="Needs attention"
						checked={view.attention ?? false}
						onChange={(event) => set("attention", event.currentTarget.checked)}
					/>
					<Checkbox
						label="Failed Actions"
						checked={view.failedActions ?? false}
						onChange={(event) => set("failedActions", event.currentTarget.checked)}
					/>
					<Checkbox
						label="Failed Checks"
						checked={view.failedChecks ?? false}
						onChange={(event) => set("failedChecks", event.currentTarget.checked)}
					/>
				</Group>
				{!items.length ? (
					<Alert>No open authored pull requests.</Alert>
				) : (
					<SimpleGrid cols={{ base: 1, sm: 2 }}>
						{items.map((item) => {
							const merge = mergeControlFor(item.pr);
							const prHref = safeHref(item.pr.url);
							return (
								<Card
									component="article"
									withBorder
									aria-busy={busy === `pr:${item.pr.number}`}
									key={`${item.pr.full_name}:${item.pr.number}`}
									aria-label={item.pr.title}
								>
									<Stack gap="xs">
										<Group justify="space-between">
											<Title order={3}>{prHref ? <a href={prHref}>{item.pr.title}</a> : item.pr.title}</Title>
											<Badge>{item.bucket}</Badge>
										</Group>
										<Text component="ul">
											{item.blockers.map((blocker) => (
												<li key={blocker}>{blocker}</li>
											))}
										</Text>
										<Text component="ol" aria-label="PR Lifecycle">
											{stages.map((stage, index) => {
												const current = stages.indexOf(item.bucket);
												const state = index < current ? "complete" : index === current ? "current" : "upcoming";
												return (
													<li key={stage} aria-current={state === "current" ? "step" : undefined}>
														{stageLabel(stage)} {state}
													</li>
												);
											})}
										</Text>
										{item.pr.open_specs?.map((spec) => (
											<Text key={spec.change_name}>
												OpenSpec · {spec.change_name} · {spec.completed}/{spec.total}
											</Text>
										))}
										{item.pr.detected_open_specs?.length ? (
											<Text>
												Detected OpenSpec candidates (informational): {item.pr.detected_open_specs.join(", ")}
											</Text>
										) : null}
										{item.pr.workflow_failures?.length ? (
											<Text component="ul" aria-label="Failed Actions workflows">
												{item.pr.workflow_failures.map((failure) => {
													const failureHref = safeHref(failure.url);
													return (
														<li key={`${failure.name}:${failure.url}`}>
															{failureHref ? (
																<a href={failureHref} rel="noreferrer" target="_blank">
																	{failure.name ?? "Failed workflow"}
																</a>
															) : (
																(failure.name ?? "Failed workflow")
															)}
														</li>
													);
												})}
											</Text>
										) : null}
										<Group>
											<Button
												aria-controls="status-detail"
												aria-expanded={detail?.pr === item.pr}
												aria-label={`Inspect ${item.pr.title ?? `PR #${item.pr.number}`} status`}
												onClick={(event) => {
													detailOpener.current = event.currentTarget;
													setDetail(item);
												}}
											>
												Status details
											</Button>
											<Button
												aria-label={`Reconcile ${item.pr.title ?? `PR #${item.pr.number}`}`}
												disabled={
													busy !== null ||
													!item.pr.installation_id ||
													!item.pr.repository_id ||
													!Number.isFinite(Number(item.pr.number))
												}
												loading={busy === `pr:${item.pr.number}`}
												onClick={(event) =>
													void run(`pr:${item.pr.number}`, event.currentTarget, () =>
														reconcile.mutateAsync({
															installationId: item.pr.installation_id ?? "",
															repositoryId: item.pr.repository_id ?? "",
															number: Number(item.pr.number),
														}),
													)
												}
											>
												Reconcile PR
											</Button>
											<Button
												aria-label={`Reconcile installation ${item.pr.installation_id}`}
												disabled={busy !== null || !item.pr.installation_id}
												loading={busy === `installation:${item.pr.installation_id}`}
												onClick={(event) =>
													void run(`installation:${item.pr.installation_id}`, event.currentTarget, () =>
														installation.mutateAsync(item.pr.installation_id ?? ""),
													)
												}
											>
												Reconcile installation
											</Button>
											{merge.state === "enabled" && hasMergeTarget(item.pr) && (
												<form
													aria-label={`Merge ${item.pr.title ?? `PR #${item.pr.number}`}`}
													method="post"
													action="/api/merge/start"
												>
													<input type="hidden" name="installationId" value={item.pr.installation_id} />
													<input type="hidden" name="repositoryId" value={item.pr.repository_id} />
													<input type="hidden" name="number" value={item.pr.number} />
													<input type="hidden" name="headSha" value={item.pr.head_sha} />
													<Button type="submit">Merge</Button>
												</form>
											)}
										</Group>
									</Stack>
								</Card>
							);
						})}
					</SimpleGrid>
				)}
				<Modal
					onExitTransitionEnd={() => detailOpener.current?.focus()}
					opened={Boolean(detail)}
					onClose={closeDetail}
					closeOnEscape
					closeOnClickOutside
					returnFocus={false}
					title="Pull request status detail"
					withCloseButton
				>
					<Stack id="status-detail" gap="xs">
						<Text>Lifecycle: {detail ? stageLabel(detail.bucket) : "unknown"}</Text>
						<Text>Blockers: {detail?.blockers.length ? detail.blockers.join(", ") : "None"}</Text>
						<Text>Actions: {detail?.pr.workflow_state ?? "unknown"}</Text>
						<Text>Checks: {detail?.pr.checks_state ?? "unknown"}</Text>
						<Text>Review: {detail?.pr.review_state ?? "unknown"}</Text>
						<Text>Mergeability: {detail?.pr.mergeable ?? "unknown"}</Text>
						{detail?.pr.open_specs?.map((spec) => (
							<Text key={spec.change_name}>
								OpenSpec · {spec.change_name} · {spec.completed}/{spec.total}
							</Text>
						))}
						{detail?.pr.detected_open_specs?.length ? (
							<Text>Detected OpenSpec candidates (informational): {detail.pr.detected_open_specs.join(", ")}</Text>
						) : null}
						{detail?.pr.workflow_failures?.map((failure) => {
							const failureHref = safeHref(failure.url);
							return failureHref ? (
								<a href={failureHref} key={`${failure.name}:${failure.url}`} rel="noreferrer" target="_blank">
									{failure.name ?? "Failed workflow"}
								</a>
							) : (
								<Text key={`${failure.name}:${failure.url}`}>{failure.name ?? "Failed workflow"}</Text>
							);
						})}
						<Button onClick={closeDetail}>Close status detail</Button>
					</Stack>
				</Modal>
				<Modal
					onExitTransitionEnd={() => deploymentOpener.current?.focus()}
					opened={deployments}
					onClose={closeDeployments}
					closeOnEscape
					closeOnClickOutside
					returnFocus={false}
					title="Deployment detail"
					withCloseButton
				>
					<Stack id="deployment-detail" gap="xs">
						{deploymentEvidence.length ? (
							deploymentEvidence.map((deployment) => {
								const targetHref = safeHref(deployment.target_url);
								const logHref = safeHref(deployment.log_url);
								return (
									<Stack gap={0} key={deployment.id ?? `${deployment.full_name}:${deployment.updated_at}`}>
										<Text>{deploymentText(deployment)}</Text>
										{targetHref ? (
											<a href={targetHref} rel="noreferrer" target="_blank">
												Deployment
											</a>
										) : null}
										{logHref ? (
											<a href={logHref} rel="noreferrer" target="_blank">
												Logs
											</a>
										) : null}
									</Stack>
								);
							})
						) : (
							<Text>No recent deployment evidence.</Text>
						)}
						<Button onClick={closeDeployments}>Close deployment detail</Button>
					</Stack>
				</Modal>
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
