import { randomUUID } from "node:crypto";
import type { Db, ReconciliationRun, ReconciliationRunDocument } from "#/db";
import { approvedInstallationIdsForUser } from "#/github";

type RunSummary = { outcome: ReconciliationRun["outcome"] } & Partial<
	Pick<
		ReconciliationRun,
		| "prCount"
		| "providerRequestCount"
		| "changedPrCount"
		| "unchangedPrCount"
		| "failureCount"
		| "unresolvedDeliveryCount"
		| "repairedDeliveryCount"
	>
>;
const runs = (db: Db) => db.reconciliationRuns;

export async function beginReconciliationRun(
	db: Db,
	input: Pick<ReconciliationRunDocument, "installationId" | "trigger">,
	now = new Date(),
) {
	const _id = randomUUID();
	await runs(db).insertOne({
		_id,
		installationId: input.installationId,
		trigger: input.trigger,
		startedAt: now,
		status: "running",
	} as ReconciliationRunDocument);
	return _id;
}

export async function finishReconciliationRun(db: Db, id: string, summary: RunSummary, now = new Date()) {
	const run = await runs(db).findOne({ _id: id, status: "running" });
	if (!run) return;
	if (!["success", "partial_failure", "failure"].includes(summary.outcome))
		throw new Error("invalid reconciliation outcome");
	const counts: Partial<RunSummary> = {};
	for (const key of [
		"prCount",
		"providerRequestCount",
		"changedPrCount",
		"unchangedPrCount",
		"failureCount",
		"unresolvedDeliveryCount",
		"repairedDeliveryCount",
	] as const) {
		const value = summary[key];
		if (value !== undefined) {
			if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid reconciliation count");
			counts[key] = value;
		}
	}
	await runs(db).updateOne(
		{ _id: id, status: "running" },
		{
			$set: {
				...counts,
				outcome: summary.outcome,
				operation: "reconciliation",
				summary: summary.outcome === "success" ? "Reconciliation completed" : "Reconciliation failed",
				status: "completed",
				completedAt: now,
				durationMs: Math.max(0, now.getTime() - run.startedAt.getTime()),
			},
		},
	);
}

export async function reconciliationRunsForUser(db: Db, userId: string) {
	const installationIds = await approvedInstallationIdsForUser(db, userId);
	return runs(db)
		.find({ installationId: { $in: installationIds } })
		.sort({ startedAt: -1 })
		.limit(20)
		.toArray();
}
