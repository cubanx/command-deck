import { Alert, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppearanceControls } from "#/features/command-center/configuration-appearance";
import { CheckoutControls, type Repository } from "#/features/command-center/configuration-checkouts";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";
import {
	reconcileAllInstallationsMutationOptions,
	reconcilePullRequestsMutationOptions,
} from "#/features/command-center/snapshot-mutations";

const isRepository = (value: unknown): value is Repository =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Record<string, unknown>).account_login === "string" &&
	typeof (value as Record<string, unknown>).installation_id === "string" &&
	typeof (value as Record<string, unknown>).repository_id === "string" &&
	typeof (value as Record<string, unknown>).full_name === "string";

export function Configuration() {
	const { data: snapshot } = useQuery({ ...snapshotQueryOptions, staleTime: Number.POSITIVE_INFINITY });
	const queryClient = useQueryClient();
	const repositories = useMemo(() => snapshot?.repositories.filter(isRepository) ?? [], [snapshot?.repositories]);
	const installations = useMutation(reconcileAllInstallationsMutationOptions(queryClient));
	const pullRequests = useMutation(reconcilePullRequestsMutationOptions(queryClient));
	const [busy, setBusy] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState<{ alert: boolean; text: string } | null>(null);
	const [notifications, setNotifications] = useState<string | null>(null);
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
	const enableNotifications = async () => {
		if (!("Notification" in globalThis)) return setNotifications("Notifications are not supported.");
		try {
			const permission = await Notification.requestPermission();
			setNotifications(permission === "granted" ? "Notifications enabled." : "Notifications were not enabled.");
		} catch (error) {
			console.error("Notification permission request failed", error instanceof Error ? error.name : "unknown error");
			setNotifications("Notification permission request failed.");
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
					<Button onClick={() => void enableNotifications()}>Enable notifications</Button>
				</Group>
				{announcement?.alert ? (
					<Alert role="alert" color="red">
						{announcement.text}
					</Alert>
				) : announcement ? (
					<Text role="status">{announcement.text}</Text>
				) : null}
				{notifications && <Text role="status">{notifications}</Text>}
				<AppearanceControls />
				<Alert color="blue">Detected OpenSpec candidates are local and informational.</Alert>
				<CheckoutControls repositories={repositories} />
			</Stack>
		</main>
	);
}
