export type OpenSpecGate = {
	applicable: boolean;
	ready: boolean;
	blocker?: "confirm" | "invalid" | "conflict";
};

export function openSpecGate(
	openSpecs: ReadonlyArray<Record<string, unknown>>,
	labels: ReadonlyArray<string>,
	evidence: Record<string, unknown> = {},
): OpenSpecGate {
	const declaration = evidence.open_spec_declaration;
	const detected = Array.isArray(evidence.detected_open_specs)
		? evidence.detected_open_specs
		: [];
	const exempt = labels.includes("openspec-not-required");
	if (declaration === "invalid")
		return { applicable: true, ready: false, blocker: "invalid" };
	if (declaration === "empty")
		return exempt
			? { applicable: false, ready: true }
			: { applicable: true, ready: false, blocker: "conflict" };
	if (declaration === "declared" && exempt)
		return { applicable: true, ready: false, blocker: "conflict" };
	if (declaration === "absent" && detected.length)
		return { applicable: true, ready: false, blocker: "confirm" };
	if (!openSpecs.length)
		return exempt
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
