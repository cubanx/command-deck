import { Button, Modal, Stack, Text } from "@mantine/core";
import { type Deployment, deploymentText, safeHref } from "#/features/command-center/dashboard-utils";

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
