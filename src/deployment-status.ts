type Status = Record<string, unknown>;

const terminalStates = new Set(["success", "failure", "error", "inactive"]);
const state = (status: Status) => String(status.state ?? "").toLowerCase();

const time = (status: Status) =>
	Date.parse(String(status.status_created_at ?? status.created_at ?? status.updated_at ?? ""));
const statusId = (status: Status) =>
	typeof status.status_id === "number" || typeof status.status_id === "string" ? String(status.status_id) : undefined;
const compareIds = (left?: string, right?: string) => {
	if (!left || !right) return 0;
	if (/^\d+$/.test(left) && /^\d+$/.test(right)) return left.length - right.length || left.localeCompare(right);
	return left.localeCompare(right);
};

export function compareDeploymentStatus(left: Status, right: Status) {
	const leftTime = time(left),
		rightTime = time(right);
	if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
	if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) return Number.isFinite(leftTime) ? 1 : -1;
	return compareIds(statusId(left), statusId(right));
}

export function latestDeploymentStatus(statuses: Status[]) {
	return statuses.reduce<Status | undefined>(
		(latest, status) => (!latest || compareDeploymentStatus(status, latest) > 0 ? status : latest),
		undefined,
	);
}

export function shouldApplyDeploymentStatus(next: Status, prior: Status) {
	const nextId = statusId(next),
		priorId = statusId(prior);
	if (terminalStates.has(state(prior)) && !terminalStates.has(state(next))) return false;
	return (
		Boolean(nextId && priorId && nextId === priorId) || compareDeploymentStatus(next, prior) > 0 || !prior.updated_at
	);
}
