import { Button, Checkbox, Group, MultiSelect, NativeSelect, TextInput } from "@mantine/core";
import { stages } from "#/features/command-center/dashboard-lifecycle";
import { defaultSortPreference, isSortMode, type SortPreference } from "#/features/command-center/sort-preference";
import { type PullRequest, repositoryOptions, type ViewState } from "#/features/command-center/view-model";

export function DashboardFilters({
	view,
	set,
	clear,
	pullRequests,
}: {
	view: Partial<ViewState>;
	set: <Key extends keyof ViewState>(key: Key, value: ViewState[Key]) => void;
	clear: () => void;
	pullRequests: PullRequest[];
}) {
	const repositories = repositoryOptions(pullRequests.map((pr) => ({ pr })));
	return (
		<>
			<Group>
				<TextInput
					label="Search pull requests"
					value={view.query ?? ""}
					onChange={(event) => set("query", event.currentTarget.value)}
				/>
				<MultiSelect
					label="Repository"
					data={repositories}
					value={view.repositories ? [...view.repositories] : repositories}
					onChange={(values) => set("repositories", values.length === repositories.length ? null : new Set(values))}
				/>
				<NativeSelect
					label="Sort pull requests"
					data={["closest", "opened", "updated", "progress", "repository"]}
					value={view.sort?.mode ?? "closest"}
					onChange={(event) =>
						isSortMode(event.currentTarget.value) &&
						set("sort", { ...(view.sort ?? defaultSortPreference), mode: event.currentTarget.value })
					}
				/>
				<NativeSelect
					label="Sort direction"
					data={["asc", "desc"]}
					value={view.sort?.direction ?? "asc"}
					onChange={(event) =>
						set("sort", {
							...(view.sort ?? defaultSortPreference),
							direction: event.currentTarget.value as SortPreference["direction"],
						})
					}
				/>
				<Button onClick={clear}>Clear filters</Button>
			</Group>
			<Group>
				{stages.map((stage) => (
					<Checkbox
						key={stage}
						label={stage}
						checked={view.statuses?.has(stage) ?? false}
						onChange={() => {
							const statuses = new Set(view.statuses);
							statuses.has(stage) ? statuses.delete(stage) : statuses.add(stage);
							set("statuses", statuses);
						}}
					/>
				))}
				<Checkbox
					label="Needs attention"
					checked={view.attention ?? false}
					onChange={(event) => set("attention", event.currentTarget.checked)}
				/>
				<Checkbox
					label="Failed Actions"
					checked={view.failedActions ?? false}
					onChange={(event) => set("failedActions", event.currentTarget.checked)}
				/>
				<Checkbox
					label="Failed Checks"
					checked={view.failedChecks ?? false}
					onChange={(event) => set("failedChecks", event.currentTarget.checked)}
				/>
			</Group>
		</>
	);
}
