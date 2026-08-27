import { Text } from "@mantine/core";

export const stages = ["draft", "openspec", "ready", "reviewing", "mergeable"];
export const stageLabel = (stage: string) =>
	({ draft: "Draft", openspec: "OpenSpec", ready: "Ready", reviewing: "Reviewing", mergeable: "Mergeable" })[stage] ??
	stage;

export function LifecycleRail({ bucket }: { bucket: string }) {
	return (
		<Text component="ol" aria-label="PR Lifecycle">
			{stages.map((stage, index) => {
				const current = stages.indexOf(bucket);
				const state = index < current ? "complete" : index === current ? "current" : "upcoming";
				return (
					<li key={stage} aria-current={state === "current" ? "step" : undefined}>
						{stageLabel(stage)} {state}
					</li>
				);
			})}
		</Text>
	);
}
