export type OpenSpecGate = { applicable: boolean; ready: boolean };

export function openSpecGate(
	openSpecs: ReadonlyArray<Record<string, unknown>>,
	labels: ReadonlyArray<string>,
): OpenSpecGate {
	if (!openSpecs.length)
		return labels.includes("openspec-not-required")
			? { applicable: false, ready: true }
			: { applicable: true, ready: false };
	return {
		applicable: true,
		ready: openSpecs.every(
			(item) =>
				item.pre_merge_ready === true ||
				(Number(item.completed) === Number(item.total) &&
					Number(item.total) >= 0),
		),
	};
}
