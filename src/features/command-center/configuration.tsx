import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppearanceControls } from "#/features/command-center/configuration-appearance";
import {
	reconcileAllInstallationsMutationOptions,
	reconcilePullRequestsMutationOptions,
} from "#/features/command-center/snapshot-mutations";

export function Configuration() {
	const queryClient = useQueryClient();
	const installations = useMutation(reconcileAllInstallationsMutationOptions(queryClient));
	const pullRequests = useMutation(reconcilePullRequestsMutationOptions(queryClient));
	const [busy, setBusy] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState<{ alert: boolean; text: string } | null>(null);
	const run = async (key: string, button: HTMLButtonElement, action: () => Promise<{ status: string }>) => {
		setBusy(key);
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
	return (
		<main aria-label="Configuration">
			<Stack>
				<Title order={1}>Configuration</Title>
				<Group>
					<Button
						disabled={busy !== null}
						loading={busy === "installations"}
						onClick={(event) =>
							void run("installations", event.currentTarget, () => installations.mutateAsync(undefined))
						}
					>
						Sync GitHub installations
					</Button>
					<Button
						disabled={busy !== null}
						loading={busy === "pull-requests"}
						onClick={(event) =>
							void run("pull-requests", event.currentTarget, () => pullRequests.mutateAsync(undefined))
						}
					>
						Reconcile all PRs
					</Button>
				</Group>
				{announcement?.alert ? (
					<Alert role="alert" color="red">
						{announcement.text}
					</Alert>
				) : announcement ? (
					<Text role="status">{announcement.text}</Text>
				) : null}
				<AppearanceControls />
			</Stack>
		</main>
	);
}
