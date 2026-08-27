export type OpenSpecTaskGroup = {
	title: string;
	tasks: ReadonlyArray<{ completed: boolean }>;
};

export const activeOpenSpecGroup = <Group extends OpenSpecTaskGroup>(groups: ReadonlyArray<Group>): Group | null =>
	groups.find((group) => !group.title.includes("[post-merge]") && group.tasks.some((task) => !task.completed)) ?? null;
