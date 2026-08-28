import { Avatar, Button, Menu, Text } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { avatarUrlFor } from "#/features/command-center/avatar-url";
import { DeploymentDetail } from "#/features/command-center/dashboard-overlays";
import { deploymentText, isDeployment, latestDeployment } from "#/features/command-center/dashboard-utils";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";
import { reconcilePullRequestsMutationOptions } from "#/features/command-center/snapshot-mutations";

export function CommandCenterNavigation() {
	const { data: snapshot } = useQuery({ ...snapshotQueryOptions, staleTime: Number.POSITIVE_INFINITY });
	const queryClient = useQueryClient();
	const reconcile = useMutation(reconcilePullRequestsMutationOptions(queryClient));
	const [announcement, setAnnouncement] = useState<string | null>(null);
	const [deployments, setDeployments] = useState(false);
	const deploymentOpener = useRef<HTMLElement | null>(null);
	const user = snapshot?.user;
	const avatar = user?.fixture_avatar ? "/avatar-fixture.svg" : avatarUrlFor(user?.avatar_url);
	const deploymentEvidence = snapshot?.deployments.filter(isDeployment) ?? [];
	const latest = latestDeployment(deploymentEvidence);
	return (
		<>
			<header className="command-center-navigation">
				<div className="command-center-header-brand">
					<a className="brand brand-home" href="/">
						<img alt="" className="brand-icon" src="/icon-adaptive.svg" />
						<span className="brand-copy">
							<strong>Command Deck.ai</strong>
						</span>
					</a>
				</div>
				<div className="command-center-header-deployment">
					<Button
						aria-controls="deployment-detail"
						aria-expanded={deployments}
						className="deployment-summary"
						classNames={{ inner: "deployment-summary-inner", label: "deployment-summary-button-label" }}
						onClick={(event) => {
							deploymentOpener.current = event.currentTarget;
							setDeployments(true);
						}}
					>
						<span className="deployment-summary-content">
							<span className="deployment-summary-label">Latest deployment</span>
							<span className="deployment-summary-detail">
								{deploymentText(latest) || "No recent deployment evidence."}
							</span>
							{latest?.state && <span className="status">{latest.state}</span>}
						</span>
					</Button>
				</div>
				<div className="command-center-header-avatar">
					<Menu closeOnItemClick={false}>
						<Menu.Target>
							<button aria-label="User menu" className="avatar-menu-button" type="button">
								<span className="avatar-menu-target">
									<Avatar component="span" src={avatar} alt="" radius="xl">
										{user?.login?.slice(0, 1).toUpperCase() ?? "U"}
									</Avatar>
									<span aria-hidden="true" className="avatar-menu-caret">
										⌄
									</span>
								</span>
							</button>
						</Menu.Target>
						<Menu.Dropdown>
							<Menu.Label>{user?.login ?? "User"}</Menu.Label>
							<Menu.Item
								disabled={reconcile.isPending}
								onClick={() =>
									void reconcile
										.mutateAsync(undefined)
										.then((result) =>
											setAnnouncement(
												result.status === "success"
													? "Reconciliation completed."
													: result.status === "running"
														? "Reconciliation started."
														: "Reconciliation failed. Try again.",
											),
										)
										.catch(() => setAnnouncement("Reconciliation failed. Try again."))
								}
							>
								{reconcile.isPending ? "Reconciling PRs…" : "Reconcile all PRs"}
							</Menu.Item>
							<Menu.Item component="a" href="/configuration">
								Configuration
							</Menu.Item>
							{announcement && <Text role="status">{announcement}</Text>}
						</Menu.Dropdown>
					</Menu>
				</div>
			</header>
			<DeploymentDetail
				opened={deployments}
				deployments={deploymentEvidence}
				close={() => setDeployments(false)}
				returnFocus={() => deploymentOpener.current?.focus()}
			/>
		</>
	);
}
