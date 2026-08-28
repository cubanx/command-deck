import { Button, Checkbox, Group, Menu, NativeSelect, Stack, TextInput } from "@mantine/core";
import { stageLabel, stages } from "#/features/command-center/dashboard-lifecycle";
import { defaultSortPreference, isSortMode, type SortPreference } from "#/features/command-center/sort-preference";
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
}: {
	view: Partial<ViewState>;
	set: <Key extends keyof ViewState>(key: Key, value: ViewState[Key]) => void;
	clear: () => void;
	pullRequests: PullRequest[];
}) {
	const repositories = repositoryOptions(pullRequests.map((pr) => ({ pr })));
	const selectedRepositories = view.repositories ?? new Set(repositories);
	const selectedStatuses = view.statuses ?? new Set(stages);
	const selectedCount =
		stages.filter((stage) => selectedStatuses.has(stage)).length +
		attentionFilters.filter(([key]) => view[key] ?? true).length;
	const allSelected = selectedCount === stages.length + attentionFilters.length;
	const statusLabel = allSelected
		? `Status: All (${selectedCount})`
		: selectedCount === 0
			? "Status: None (0)"
			: `Status (${selectedCount})`;
	const toggleRepository = (repository: string) => {
		const next = new Set(selectedRepositories);
		next.has(repository) ? next.delete(repository) : next.add(repository);
		set("repositories", next.size === repositories.length ? null : next);
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
				<Menu closeOnItemClick={false}>
					<Menu.Target>
						<Button className="filter-status" size="sm">
							{statusLabel}
						</Button>
					</Menu.Target>
					<Menu.Dropdown>
						<Checkbox
							checked={allSelected}
							indeterminate={selectedCount > 0 && !allSelected}
							label="All"
							onChange={() => {
								set("statuses", new Set(allSelected ? [] : stages));
								set("attention", !allSelected);
								set("failedActions", !allSelected);
								set("failedChecks", !allSelected);
							}}
						/>
						<Menu.Label>Lifecycle</Menu.Label>
						{stages.map((stage) => (
							<Checkbox
								checked={selectedStatuses.has(stage)}
								key={stage}
								label={stageLabel(stage)}
								onChange={() => {
									const next = new Set(selectedStatuses);
									next.has(stage) ? next.delete(stage) : next.add(stage);
									set("statuses", next);
								}}
							/>
						))}
						<Menu.Label>Attention</Menu.Label>
						{attentionFilters.map(([key, label]) => (
							<Checkbox
								checked={view[key] ?? true}
								key={key}
								label={label}
								onChange={(event) => set(key, event.currentTarget.checked)}
							/>
						))}
					</Menu.Dropdown>
				</Menu>
				<NativeSelect
					className="filter-sort"
					label="Sort pull requests"
					size="sm"
					data={["closest", "opened", "updated", "progress", "repository"]}
					value={view.sort?.mode ?? "closest"}
					onChange={(event) =>
						isSortMode(event.currentTarget.value) &&
						set("sort", { ...(view.sort ?? defaultSortPreference), mode: event.currentTarget.value })
					}
				/>
				<NativeSelect
					className="filter-direction"
					label="Sort direction"
					size="sm"
					data={["asc", "desc"]}
					value={view.sort?.direction ?? "asc"}
					onChange={(event) =>
						set("sort", {
							...(view.sort ?? defaultSortPreference),
							direction: event.currentTarget.value as SortPreference["direction"],
						})
					}
				/>
				<Button className="filter-clear" size="sm" onClick={clear}>
					Clear filters
				</Button>
			</Group>
		</Stack>
	);
}
