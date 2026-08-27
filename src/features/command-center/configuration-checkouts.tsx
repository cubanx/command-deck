import { Button, Text } from "@mantine/core";
import { useEffect, useState } from "react";
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

export type Repository = { account_login: string; installation_id: string; repository_id: string; full_name: string };

const matchingRecord = (records: unknown, key: string) =>
	Array.isArray(records)
		? records.find(
				(value): value is CheckoutRecord =>
					typeof value === "object" &&
					value !== null &&
					(value as CheckoutRecord).key === key &&
					Boolean((value as CheckoutRecord).handle),
			)
		: undefined;

export function CheckoutControls({ repositories }: { repositories: Repository[] }) {
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
					const record =
						matchingRecord(records, checkoutKey(repository.account_login, repository.repository_id)) ??
						matchingRecord(records, `root:${repository.account_login}`);
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
				read: async (selectedHandle, selectedRepository) =>
					(checkout.evidence = await readCheckout(selectedHandle, selectedRepository)),
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
		<>
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
		</>
	);
}
