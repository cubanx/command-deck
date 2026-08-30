import { Card, Group, Menu, Stack, Text, Title, UnstyledButton } from "@mantine/core";
import { useRef } from "react";
import { LifecycleRail } from "#/features/command-center/dashboard-lifecycle";
import { OpenSpecTaskViewer } from "#/features/command-center/dashboard-openspec";
import { safeHref } from "#/features/command-center/dashboard-utils";
import {
	type DerivedPullRequest,
	detectedOpenSpecCandidatesFor,
	mergeControlFor,
	type PullRequest,
} from "#/features/command-center/view-model";

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
	const detectedOpenSpecs = detectedOpenSpecCandidatesFor(pr);
	return (
		<>
			{pr.open_specs?.map((spec) => (
				<OpenSpecTaskViewer key={spec.change_name} spec={spec} />
			))}
			{detectedOpenSpecs.length ? (
				<Text>Detected OpenSpec candidates (informational): {detectedOpenSpecs.join(", ")}</Text>
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

function MergeMenuItem({ pr }: { pr: PullRequest }) {
	const id = `merge-${pr.full_name}-${pr.number}`;
	return mergeControlFor(pr).state === "enabled" && hasMergeTarget(pr) ? (
		<>
			<form aria-label={`Merge ${pr.title ?? `PR #${pr.number}`}`} id={id} method="post" action="/api/merge/start">
				<input type="hidden" name="installationId" value={pr.installation_id} />
				<input type="hidden" name="repositoryId" value={pr.repository_id} />
				<input type="hidden" name="number" value={pr.number} />
				<input type="hidden" name="headSha" value={pr.head_sha} />
			</form>
			<Menu.Item form={id} type="submit">
				Merge
			</Menu.Item>
		</>
	) : null;
}

export function PullRequestCard({
	item,
	busy,
	onReconcile,
}: {
	item: DerivedPullRequest;
	busy: string | null;
	onReconcile: (pr: PullRequest, button: HTMLButtonElement) => void;
}) {
	const { pr } = item;
	const prHref = safeHref(pr.url);
	const trigger = useRef<HTMLButtonElement>(null);
	return (
		<Card
			className="command-center-card"
			component="article"
			padding="sm"
			withBorder
			aria-busy={busy === `pr:${pr.number}`}
			aria-label={pr.title}
		>
			<Stack gap="xs">
				<Group gap="xs" wrap="wrap">
					<Title order={3}>
						<Menu position="bottom-end">
							<Menu.Target>
								<UnstyledButton
									aria-label={`Actions for ${pr.title ?? `PR #${pr.number}`}`}
									className="command-center-pr-title-trigger"
									disabled={busy === `pr:${pr.number}`}
									ref={trigger}
								>
									<span className="command-center-pr-title-text">{pr.title}</span>
									<span aria-hidden="true" className="command-center-pr-title-cue">
										⌄
									</span>
								</UnstyledButton>
							</Menu.Target>
							<Menu.Dropdown>
								<Menu.Item
									disabled={
										busy !== null || !pr.installation_id || !pr.repository_id || !Number.isFinite(Number(pr.number))
									}
									onClick={(event) => onReconcile(pr, trigger.current ?? event.currentTarget)}
								>
									Reconcile PR
								</Menu.Item>
								<MergeMenuItem pr={pr} />
								{prHref ? (
									<Menu.Item component="a" href={prHref} rel="noreferrer" target="_blank">
										Open PR <span aria-hidden="true">↗</span>
									</Menu.Item>
								) : null}
							</Menu.Dropdown>
						</Menu>
					</Title>
				</Group>
				<Text className="command-center-blockers" component="ul">
					{item.blockers.map((blocker) => (
						<li key={blocker}>{blocker}</li>
					))}
				</Text>
				<LifecycleRail bucket={item.bucket} />
				<OpenSpecEvidence pr={pr} />
				<WorkflowFailures pr={pr} />
			</Stack>
		</Card>
	);
}
