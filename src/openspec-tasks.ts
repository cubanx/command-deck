export type OpenSpecTaskGroup = {
	title: string;
	tasks: ReadonlyArray<{ completed: boolean }>;
};

export const activeOpenSpecGroups = <Group extends OpenSpecTaskGroup>(groups: ReadonlyArray<Group>): Group[] =>
	groups
		.filter((group) => !group.title.includes("[post-merge]") && group.tasks.some((task) => !task.completed))
		.slice(0, 2);

export const activeOpenSpecGroup = <Group extends OpenSpecTaskGroup>(groups: ReadonlyArray<Group>): Group | null =>
	activeOpenSpecGroups(groups)[0] ?? null;
