import { Alert, Stack, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppearanceControls } from "#/features/command-center/configuration-appearance";
import { CheckoutControls, type Repository } from "#/features/command-center/configuration-checkouts";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

const isRepository = (value: unknown): value is Repository =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as Record<string, unknown>).account_login === "string" &&
	typeof (value as Record<string, unknown>).installation_id === "string" &&
	typeof (value as Record<string, unknown>).repository_id === "string" &&
	typeof (value as Record<string, unknown>).full_name === "string";

export function Configuration() {
	const { data: snapshot } = useQuery({ ...snapshotQueryOptions, staleTime: Number.POSITIVE_INFINITY });
	const repositories = useMemo(() => snapshot?.repositories.filter(isRepository) ?? [], [snapshot?.repositories]);
	return (
		<main aria-label="Configuration">
			<Stack>
				<Title order={1}>Configuration</Title>
				<AppearanceControls />
				<Alert color="blue">Detected OpenSpec candidates are local and informational.</Alert>
				<CheckoutControls repositories={repositories} />
			</Stack>
		</main>
	);
}
