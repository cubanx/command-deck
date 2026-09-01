import { Button, Table, Text } from "@mantine/core";
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
type CheckoutResult = { state: string; candidates: string[] };

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
	const [results, setResults] = useState<Record<string, CheckoutResult>>({});
	const setResult = (repository: Repository, result: CheckoutResult) =>
		setResults((current) => ({
			...current,
			[checkoutKey(repository.account_login, repository.repository_id)]: result,
		}));
	useEffect(() => {
		if (!globalThis.indexedDB || !repositories.length) return;
		let active = true;
		const restore = async () => {
			try {
				const records = await storedCheckouts();
				const restored: Record<string, CheckoutResult> = {};
				for (const repository of repositories) {
					const key = checkoutKey(repository.account_login, repository.repository_id);
					const record = matchingRecord(records, key) ?? matchingRecord(records, `root:${repository.account_login}`);
					if (!record?.handle) continue;
					try {
						if ((await revalidateCheckout({ handle: record.handle })) !== "granted") {
							restored[key] = { state: `Permission required for ${repository.full_name}.`, candidates: [] };
							continue;
						}
						const handle = record.key.startsWith("root:")
							? await exactCheckoutDirectory(record.handle, repository)
							: record.handle;
						const specs = await readCheckout(handle, repository);
						if (specs === null) {
							restored[key] = { state: `Checkout does not match ${repository.full_name}.`, candidates: [] };
							continue;
						}
						restored[key] = {
							state: `Checkout restored for ${repository.full_name}.`,
							candidates: specs.specs.map((spec) => spec.change_name ?? "Unnamed OpenSpec"),
						};
					} catch (error) {
						console.error("Local checkout restore failed", error instanceof Error ? error.name : "unknown error");
						restored[key] = { state: "Checkout restore failed.", candidates: [] };
					}
				}
				if (active) setResults((current) => ({ ...current, ...restored }));
			} catch (error) {
				console.error("Local checkout restore failed", error instanceof Error ? error.name : "unknown error");
				if (active)
					setResults(
						Object.fromEntries(
							repositories.map((repository) => [
								checkoutKey(repository.account_login, repository.repository_id),
								{ state: "Checkout restore failed.", candidates: [] },
							]),
						),
					);
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
			setResult(repository, {
				state: `Checkout configured for ${repository.full_name}.`,
				candidates: checkout.evidence.specs.map((spec) => spec.change_name ?? "Unnamed OpenSpec"),
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return;
			console.error("Local checkout setup failed", error instanceof Error ? error.name : "unknown error");
			setResult(repository, { state: "Checkout setup failed.", candidates: [] });
		}
	};
	return (
		<Table aria-label="Repository checkouts">
			<Table.Thead>
				<Table.Tr>
					<Table.Th>Repository</Table.Th>
					<Table.Th>Account</Table.Th>
					<Table.Th>State</Table.Th>
					<Table.Th>Action</Table.Th>
				</Table.Tr>
			</Table.Thead>
			<Table.Tbody>
				{repositories.map((repository) => (
					<Table.Tr key={`${repository.account_login}:${repository.repository_id}`}>
						<Table.Td>{repository.full_name}</Table.Td>
						<Table.Td>{repository.account_login}</Table.Td>
						<Table.Td>
							{results[checkoutKey(repository.account_login, repository.repository_id)] ? (
								<Text role="status">
									{results[checkoutKey(repository.account_login, repository.repository_id)].state}
								</Text>
							) : (
								"Not configured"
							)}
							{results[checkoutKey(repository.account_login, repository.repository_id)]?.candidates.length ? (
								<Text>
									Detected local candidates:{" "}
									{results[checkoutKey(repository.account_login, repository.repository_id)].candidates.join(", ")}
								</Text>
							) : null}
						</Table.Td>
						<Table.Td>
							<Button
								aria-label={`Choose checkout for ${repository.full_name}`}
								onClick={() => void chooseCheckout(repository)}
							>
								Choose checkout
							</Button>
						</Table.Td>
					</Table.Tr>
				))}
			</Table.Tbody>
		</Table>
	);
}
