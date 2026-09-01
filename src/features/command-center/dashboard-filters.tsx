import { Button, Group, MultiSelect, NativeSelect, Stack, Text, TextInput } from "@mantine/core";
import { stageLabel, stages } from "#/features/command-center/dashboard-lifecycle";
import {
	defaultSortPreference,
	sortPreferenceFromValue,
	sortPreferenceValue,
} from "#/features/command-center/sort-preference";
import { type PullRequest, repositoryOptions, type ViewState } from "#/features/command-center/view-model";

const attentionFilters = [
	["attention", "Needs attention"],
	["failedActions", "Failed Actions"],
	["failedChecks", "Failed Checks"],
] as const;

export function DashboardFilters({
	view,
	set,
	clear,
	pullRequests,
	resultCount,
}: {
	view: Partial<ViewState>;
	set: <Key extends keyof ViewState>(key: Key, value: ViewState[Key]) => void;
	clear: () => void;
	pullRequests: PullRequest[];
	resultCount: number;
}) {
	const repositories = repositoryOptions(pullRequests.map((pr) => ({ pr })));
	const selectedRepositories = view.repositories ?? new Set(repositories);
	const selectedStatuses = view.statuses ?? new Set(stages);
	const selectedStatusValues = [
		...stages.filter((stage) => selectedStatuses.has(stage)),
		...attentionFilters.flatMap(([key]) => ((view[key] ?? true) ? [key] : [])),
	];
	const allSelected = selectedStatusValues.length === stages.length + attentionFilters.length;
	const toggleRepository = (repository: string) => {
		const next = new Set(selectedRepositories);
		next.has(repository) ? next.delete(repository) : next.add(repository);
		set("repositories", next.size === repositories.length ? null : next);
	};
	const setStatuses = (values: string[]) => {
		if (!values.length) {
			set("statuses", new Set(stages));
			for (const [key] of attentionFilters) set(key, true);
			return;
		}
		set("statuses", new Set(stages.filter((stage) => values.includes(stage))));
		for (const [key] of attentionFilters) set(key, values.includes(key));
	};
	return (
		<Stack className="command-center-filters" gap="xs">
			<Group aria-label="Repositories" className="command-center-repository-row" gap="xs" role="group" wrap="wrap">
				{repositories.map((repository) => (
					<Button
						aria-pressed={selectedRepositories.has(repository)}
						key={repository}
						size="sm"
						variant={selectedRepositories.has(repository) ? "light" : "subtle"}
						onClick={() => toggleRepository(repository)}
					>
						{selectedRepositories.has(repository) && <span aria-hidden="true">✓&nbsp;</span>}
						{repository}
					</Button>
				))}
			</Group>
			<Group align="flex-end" className="command-center-filter-row" gap="xs" wrap="wrap">
				<TextInput
					className="filter-grow"
					label="Search pull requests"
					size="sm"
					value={view.query ?? ""}
					onChange={(event) => set("query", event.currentTarget.value)}
				/>
				<MultiSelect
					className="filter-status"
					clearable
					data={[
						...stages.map((stage) => ({ value: stage, label: stageLabel(stage) })),
						...attentionFilters.map(([value, label]) => ({ value, label })),
					]}
					label="Status"
					placeholder="All statuses"
					size="sm"
					value={allSelected ? [] : selectedStatusValues}
					onChange={setStatuses}
				/>
				<NativeSelect
					className="filter-sort"
					label="Sort pull requests"
					size="sm"
					data={[
						{ value: "closest:asc", label: "Closest to merge" },
						{ value: "closest:desc", label: "Furthest from merge" },
						{ value: "opened:asc", label: "Oldest opened" },
						{ value: "opened:desc", label: "Newest opened" },
						{ value: "updated:asc", label: "Least recently updated" },
						{ value: "updated:desc", label: "Most recently updated" },
						{ value: "progress:asc", label: "Least complete" },
						{ value: "progress:desc", label: "Most complete" },
						{ value: "repository:asc", label: "Repository A–Z" },
						{ value: "repository:desc", label: "Repository Z–A" },
					]}
					value={sortPreferenceValue(view.sort ?? defaultSortPreference)}
					onChange={(event) =>
						set("sort", sortPreferenceFromValue(event.currentTarget.value, view.sort ?? defaultSortPreference))
					}
				/>
				<Button className="filter-clear" size="sm" onClick={clear}>
					Clear filters
				</Button>
				<Text c="dimmed" mb="xs" ml="auto" role="status">
					{resultCount} results
				</Text>
			</Group>
		</Stack>
	);
}
