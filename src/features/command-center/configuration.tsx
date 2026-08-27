import { Alert, Button, Radio, Stack, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { appearancePreference, saveAppearance } from "#/features/command-center/appearance";
import {
	type BrowserDirectoryHandle,
	type CheckoutRecord,
	checkoutKey,
	exactCheckoutDirectory,
	persistCheckout,
	persistVerifiedCheckout,
	readCheckout,
	revalidateCheckout,
	storedCheckouts,
} from "#/features/command-center/browser-checkout";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";

type Repository = { account_login: string; installation_id: string; repository_id: string; full_name: string };
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
	const [appearance, setAppearance] = useState(() => appearancePreference().preference);
	const [checkoutState, setCheckoutState] = useState<string | null>(null);
	const [localCandidates, setLocalCandidates] = useState<string[]>([]);
	useEffect(() => {
		if (!globalThis.indexedDB || !repositories.length) return;
		let active = true;
		const restore = async () => {
			try {
				const records = await storedCheckouts();
				const candidates: string[] = [];
				let restored = false;
				for (const repository of repositories) {
					const matchingRecord = (key: string) =>
						Array.isArray(records)
							? records.find(
									(value): value is CheckoutRecord =>
										typeof value === "object" &&
										value !== null &&
										(value as CheckoutRecord).key === key &&
										Boolean((value as CheckoutRecord).handle),
								)
							: undefined;
					const record =
						matchingRecord(checkoutKey(repository.account_login, repository.repository_id)) ??
						matchingRecord(`root:${repository.account_login}`);
					if (!record?.handle) continue;
					try {
						if ((await revalidateCheckout({ handle: record.handle })) !== "granted") {
							if (active) setCheckoutState(`Permission required for ${repository.full_name}.`);
							continue;
						}
						const handle = record.key.startsWith("root:")
							? await exactCheckoutDirectory(record.handle, repository)
							: record.handle;
						const specs = await readCheckout(handle, repository);
						if (specs === null) {
							if (active) setCheckoutState(`Checkout does not match ${repository.full_name}.`);
							continue;
						}
						candidates.push(...specs.specs.map((spec) => spec.change_name ?? "Unnamed OpenSpec"));
						restored = true;
					} catch (error) {
						console.error("Local checkout restore failed", error instanceof Error ? error.name : "unknown error");
						if (active) setCheckoutState("Checkout restore failed.");
					}
				}
				if (active && restored) {
					setLocalCandidates(candidates);
					setCheckoutState("Checkout restored.");
				}
			} catch (error) {
				console.error("Local checkout restore failed", error instanceof Error ? error.name : "unknown error");
				if (active) setCheckoutState("Checkout restore failed.");
			}
		};
		void restore();
		return () => {
			active = false;
		};
	}, [repositories]);
	const chooseCheckout = async (repository: Repository) => {
		try {
			const picker = (globalThis as typeof globalThis & { showDirectoryPicker?: () => Promise<BrowserDirectoryHandle> })
				.showDirectoryPicker;
			if (!picker) throw new TypeError("Directory picker is unavailable");
			const handle = await picker();
			const checkout = { evidence: null as Awaited<ReturnType<typeof readCheckout>> };
			const record: CheckoutRecord = {
				key: checkoutKey(repository.account_login, repository.repository_id),
				account: repository.account_login,
				kind: "override",
				handle,
			};
			const configured = await persistVerifiedCheckout({
				handle,
				repository,
				read: async (selectedHandle, selectedRepository) => {
					checkout.evidence = await readCheckout(selectedHandle, selectedRepository);
					return checkout.evidence;
				},
				persist: persistCheckout,
				record,
			});
			if (!configured || checkout.evidence === null) throw new TypeError("Checkout remote does not match repository");
			setLocalCandidates(checkout.evidence.specs.map((spec) => spec.change_name ?? "Unnamed OpenSpec"));
			setCheckoutState(`Checkout configured for ${repository.full_name}.`);
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			console.error("Local checkout setup failed", error instanceof Error ? error.name : "unknown error");
			setCheckoutState("Checkout setup failed.");
		}
	};
	return (
		<main aria-label="Configuration">
			<Stack>
				<Title order={1}>Configuration</Title>
				<Radio.Group
					label="Appearance"
					value={appearance}
					onChange={(value) => setAppearance(saveAppearance(value).preference)}
				>
					<Radio value="system" label="System" />
					<Radio value="light" label="Light" />
					<Radio value="dark" label="Dark" />
				</Radio.Group>
				<Alert color="blue">Detected OpenSpec candidates are local and informational.</Alert>
				{repositories.map((repository) => (
					<Button
						key={`${repository.account_login}:${repository.repository_id}`}
						onClick={() => void chooseCheckout(repository)}
					>
						Choose checkout for {repository.full_name}
					</Button>
				))}
				{checkoutState && <Text role="status">{checkoutState}</Text>}
				{localCandidates.length ? <Text>Detected local candidates: {localCandidates.join(", ")}</Text> : null}
			</Stack>
		</main>
	);
}
