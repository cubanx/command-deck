import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { LifecycleRail } from "#/features/command-center/dashboard-lifecycle";
import { safeHref } from "#/features/command-center/dashboard-utils";
import { type DerivedPullRequest, mergeControlFor, type PullRequest } from "#/features/command-center/view-model";

const hasMergeTarget = (pr: PullRequest) =>
	typeof pr.installation_id === "string" &&
	pr.installation_id.trim().length > 0 &&
	typeof pr.repository_id === "string" &&
	pr.repository_id.trim().length > 0 &&
	Number.isInteger(Number(pr.number)) &&
	Number(pr.number) > 0 &&
	typeof pr.head_sha === "string" &&
	/^[a-f\d]{40}$/i.test(pr.head_sha);

function OpenSpecEvidence({ pr }: { pr: PullRequest }) {
	return (
		<>
			{pr.open_specs?.map((spec) => (
				<Text key={spec.change_name}>
					OpenSpec · {spec.change_name} · {spec.completed}/{spec.total}
				</Text>
			))}
			{pr.detected_open_specs?.length ? (
				<Text>Detected OpenSpec candidates (informational): {pr.detected_open_specs.join(", ")}</Text>
			) : null}
		</>
	);
}

function WorkflowFailures({ pr }: { pr: PullRequest }) {
	return pr.workflow_failures?.length ? (
		<Text component="ul" aria-label="Failed Actions workflows">
			{pr.workflow_failures.map((failure) => {
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
	) : null;
}

function MergeForm({ pr }: { pr: PullRequest }) {
	return mergeControlFor(pr).state === "enabled" && hasMergeTarget(pr) ? (
		<form aria-label={`Merge ${pr.title ?? `PR #${pr.number}`}`} method="post" action="/api/merge/start">
			<input type="hidden" name="installationId" value={pr.installation_id} />
			<input type="hidden" name="repositoryId" value={pr.repository_id} />
			<input type="hidden" name="number" value={pr.number} />
			<input type="hidden" name="headSha" value={pr.head_sha} />
			<Button type="submit">Merge</Button>
		</form>
	) : null;
}

export function PullRequestCard({
	item,
	busy,
	detailOpen,
	onDetail,
	onReconcile,
	onInstallation,
}: {
	item: DerivedPullRequest;
	busy: string | null;
	detailOpen: boolean;
	onDetail: (item: DerivedPullRequest, button: HTMLButtonElement) => void;
	onReconcile: (pr: PullRequest, button: HTMLButtonElement) => void;
	onInstallation: (pr: PullRequest, button: HTMLButtonElement) => void;
}) {
	const { pr } = item;
	const prHref = safeHref(pr.url);
	return (
		<Card component="article" withBorder aria-busy={busy === `pr:${pr.number}`} aria-label={pr.title}>
			<Stack gap="xs">
				<Group justify="space-between">
					<Title order={3}>{prHref ? <a href={prHref}>{pr.title}</a> : pr.title}</Title>
					<Badge>{item.bucket}</Badge>
				</Group>
				<Text component="ul">
					{item.blockers.map((blocker) => (
						<li key={blocker}>{blocker}</li>
					))}
				</Text>
				<LifecycleRail bucket={item.bucket} />
				<OpenSpecEvidence pr={pr} />
				<WorkflowFailures pr={pr} />
				<Group>
					<Button
						aria-controls="status-detail"
						aria-expanded={detailOpen}
						aria-label={`Inspect ${pr.title ?? `PR #${pr.number}`} status`}
						onClick={(event) => onDetail(item, event.currentTarget)}
					>
						Status details
					</Button>
					<Button
						aria-label={`Reconcile ${pr.title ?? `PR #${pr.number}`}`}
						disabled={busy !== null || !pr.installation_id || !pr.repository_id || !Number.isFinite(Number(pr.number))}
						loading={busy === `pr:${pr.number}`}
						onClick={(event) => onReconcile(pr, event.currentTarget)}
					>
						Reconcile PR
					</Button>
					<Button
						aria-label={`Reconcile installation ${pr.installation_id}`}
						disabled={busy !== null || !pr.installation_id}
						loading={busy === `installation:${pr.installation_id}`}
						onClick={(event) => onInstallation(pr, event.currentTarget)}
					>
						Reconcile installation
					</Button>
					<MergeForm pr={pr} />
				</Group>
			</Stack>
		</Card>
	);
}
