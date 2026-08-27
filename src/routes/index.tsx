import { type QueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { snapshotQueryOptions } from "#/features/command-center/snapshot";
import {
	isSortMode,
	loadSortPreference,
	type SortPreference,
	saveSortPreference,
} from "#/features/command-center/sort-preference";

export const dashboardLoader = ({ context }: { context: { queryClient: QueryClient } }) =>
	context.queryClient.ensureQueryData(snapshotQueryOptions);

export const Route = createFileRoute("/")({
	loader: dashboardLoader,
	component: Dashboard,
});

export function Dashboard() {
	const { data: snapshot } = useSuspenseQuery(snapshotQueryOptions);
	const login = snapshot.user?.login ?? "User";
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState(() => loadSortPreference(globalThis.localStorage, console.error));

	useEffect(() => {
		saveSortPreference(sort, globalThis.localStorage, console.error);
	}, [sort]);

	return (
		<main aria-label="Command Center">
			<p>
				<span className="sr-only">Signed in as </span>
				{login}
			</p>
			<label>
				Search pull requests
				<input value={search} onChange={(event) => setSearch(event.target.value)} />
			</label>
			<label>
				Sort pull requests
				<select
					value={sort.mode}
					onChange={(event) => {
						if (isSortMode(event.target.value)) setSort({ ...sort, mode: event.target.value });
					}}
				>
					<option value="closest">Closest to merge</option>
					<option value="opened">Opened</option>
					<option value="updated">Recently updated</option>
					<option value="progress">OpenSpec progress</option>
					<option value="repository">Repository</option>
				</select>
			</label>
			<label>
				Sort direction
				<select
					value={sort.direction}
					onChange={(event) =>
						setSort({
							...sort,
							direction: event.target.value as SortPreference["direction"],
						})
					}
				>
					<option value="asc">Ascending</option>
					<option value="desc">Descending</option>
				</select>
			</label>
		</main>
	);
}
