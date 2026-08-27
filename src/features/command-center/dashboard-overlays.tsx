import { Button, Modal, Stack, Text } from "@mantine/core";
import { stageLabel } from "#/features/command-center/dashboard-lifecycle";
import { type Deployment, deploymentText, safeHref } from "#/features/command-center/dashboard-utils";
import type { DerivedPullRequest } from "#/features/command-center/view-model";

export function StatusDetail({
	detail,
	close,
	returnFocus,
}: {
	detail: DerivedPullRequest | null;
	close: () => void;
	returnFocus: () => void;
}) {
	return (
		<Modal
			onExitTransitionEnd={returnFocus}
			opened={Boolean(detail)}
			onClose={close}
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
				<Button onClick={close}>Close status detail</Button>
			</Stack>
		</Modal>
	);
}

export function DeploymentDetail({
	opened,
	deployments,
	close,
	returnFocus,
}: {
	opened: boolean;
	deployments: Deployment[];
	close: () => void;
	returnFocus: () => void;
}) {
	return (
		<Modal
			onExitTransitionEnd={returnFocus}
			opened={opened}
			onClose={close}
			closeOnEscape
			closeOnClickOutside
			returnFocus={false}
			title="Deployment detail"
			withCloseButton
		>
			<Stack id="deployment-detail" gap="xs">
				{deployments.length ? (
					deployments.map((deployment) => (
						<DeploymentEvidence
							deployment={deployment}
							key={deployment.id ?? `${deployment.full_name}:${deployment.updated_at}`}
						/>
					))
				) : (
					<Text>No recent deployment evidence.</Text>
				)}
				<Button onClick={close}>Close deployment detail</Button>
			</Stack>
		</Modal>
	);
}

function DeploymentEvidence({ deployment }: { deployment: Deployment }) {
	const targetHref = safeHref(deployment.target_url);
	const logHref = safeHref(deployment.log_url);
	return (
		<Stack gap={0}>
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
}
