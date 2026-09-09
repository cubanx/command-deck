export const stages = ["post-merge", "draft", "openspec", "ready", "reviewing", "mergeable"];
export const stageLabel = (stage: string) =>
	({
		"post-merge": "Post-merge",
		draft: "Draft",
		openspec: "OpenSpec",
		ready: "Ready",
		reviewing: "Reviewing",
		mergeable: "Mergeable",
	})[stage] ?? stage;

const pillLabel = (stage: string) =>
	({
		"post-merge": "Merged",
		draft: "Draft",
		openspec: "OpenSpec ready",
		ready: "Ready for review",
		reviewing: "Reviewing",
		mergeable: "Mergeable",
	})[stage] ?? stage;

export function LifecycleRail({ bucket }: { bucket: string }) {
	if (bucket === "post-merge")
		return (
			<fieldset className="pr-lifecycle">
				<legend className="pr-lifecycle-title">PR Lifecycle</legend>
				<span className="sr-only">PR lifecycle. Current stage: Merged</span>
				<div aria-hidden="true" className="lifecycle-pills">
					<span className="lifecycle-pill current">◐ Merged · Current</span>
				</div>
			</fieldset>
		);
	const activeStages = stages.filter((stage) => stage !== "post-merge");
	return (
		<fieldset className="pr-lifecycle">
			<legend className="pr-lifecycle-title">PR Lifecycle</legend>
			<span className="sr-only">PR lifecycle. Current stage: {pillLabel(bucket)}</span>
			<div aria-hidden="true" className="lifecycle-pills">
				{activeStages.map((stage, index) => {
					const current = activeStages.indexOf(bucket);
					const state = index < current ? "complete" : index === current ? "current" : "upcoming";
					const marker = state === "complete" ? "✓" : state === "current" ? "◐" : "○";
					const stateLabel = state === "complete" ? "Complete" : state === "current" ? "Current" : "Upcoming";
					return (
						<span className={`lifecycle-pill ${state}`} key={stage}>
							{marker} {pillLabel(stage)} · {stateLabel}
						</span>
					);
				})}
			</div>
		</fieldset>
	);
}
