import { Badge } from "@mantine/core";
import { safeHref } from "#/features/command-center/dashboard-utils";
import { incompleteOpenSpecGroupsFor, type OpenSpecEvidence } from "#/features/command-center/view-model";

export function OpenSpecTaskViewer({ spec }: { spec: OpenSpecEvidence }) {
	const groups = incompleteOpenSpecGroupsFor(spec);
	const groupOccurrences = new Map<string, number>();
	const keyedGroups = groups.map((group) => {
		const groupContent = JSON.stringify([group.title, group.tasks.map((task) => [task.completed, task.text])]);
		const groupOccurrence = groupOccurrences.get(groupContent) ?? 0;
		groupOccurrences.set(groupContent, groupOccurrence + 1);
		const groupKey = `${groupContent}:${groupOccurrence}`;
		const taskOccurrences = new Map<string, number>();

		return {
			group,
			key: groupKey,
			tasks: group.tasks.map((task) => {
				const taskContent = JSON.stringify([task.completed, task.text]);
				const taskOccurrence = taskOccurrences.get(taskContent) ?? 0;
				taskOccurrences.set(taskContent, taskOccurrence + 1);

				return { key: `${groupKey}:${taskContent}:${taskOccurrence}`, task };
			}),
		};
	});
	const sourceHref = safeHref(spec.source_url);
	const incompleteWithoutDetails =
		!groups.length &&
		Number.isFinite(Number(spec.completed)) &&
		Number.isFinite(Number(spec.total)) &&
		Number(spec.completed) < Number(spec.total);
	const postMergeRemaining = groups.length > 0 && spec.pre_merge_ready === true;
	return (
		<details className="openspec">
			<summary>
				<strong>
					OpenSpec · {spec.change_name} ·{" "}
					{postMergeRemaining
						? null
						: `${groups[0]?.title ?? (incompleteWithoutDetails ? "Incomplete" : "Complete")} · `}
					{spec.completed}/{spec.total}
				</strong>
				{postMergeRemaining ? (
					<Badge className="post-merge-badge" size="xs">
						Post-merge
					</Badge>
				) : null}
			</summary>
			{keyedGroups.length ? (
				keyedGroups.map(({ group, key, tasks }) => (
					<section key={key}>
						<h4>{group.title}</h4>
						<ul className="tasks">
							{tasks.map(({ key: taskKey, task }) => (
								<li key={taskKey}>
									<label>
										<input checked={task.completed} disabled type="checkbox" /> {task.text}
									</label>
								</li>
							))}
						</ul>
					</section>
				))
			) : incompleteWithoutDetails ? (
				<p>Task details are unavailable until reconciliation.</p>
			) : (
				<p>All tasks complete.</p>
			)}
			{sourceHref ? (
				<a href={sourceHref} rel="noreferrer" target="_blank">
					Open tasks
				</a>
			) : null}
		</details>
	);
}
