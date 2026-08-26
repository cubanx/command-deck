import { createHash } from "node:crypto";
import type { Db, MergeIntent } from "#/db";
import { openSpecGate } from "#/openspec-gate";

const failed = new Set([
	"action_required",
	"action-required",
	"cancelled",
	"canceled",
	"failed",
	"failure",
	"timed_out",
	"timed-out",
]);
const normalized = (value: unknown) => String(value ?? "").toLowerCase();

export const mergeIntentHash = (value: string) =>
	createHash("sha256").update(value).digest("hex");

export const createMergeIntent = async (
	db: Db,
	input: Omit<MergeIntent, "_id" | "stage" | "expiresAt">,
	now = new Date(),
) => {
	const token = crypto.randomUUID();
	await db.mergeIntents.insertOne({
		...input,
		_id: mergeIntentHash(token),
		stage: "started",
		expiresAt: new Date(now.getTime() + 10 * 60_000),
	});
	return token;
};

export const advanceMergeIntent = async (
	db: Db,
	token: string,
	stage: MergeIntent["stage"],
	next: MergeIntent["stage"],
	now = new Date(),
	updates: Partial<Pick<MergeIntent, "pullRequestId">> = {},
) =>
	await db.mergeIntents.findOneAndUpdate(
		{ _id: mergeIntentHash(token), stage, expiresAt: { $gt: now } },
		{ $set: { stage: next, ...updates } },
		{ returnDocument: "before" },
	);

export const mergeIntentFor = async (db: Db, token: string, now = new Date()) =>
	await db.mergeIntents.findOne({
		_id: mergeIntentHash(token),
		expiresAt: { $gt: now },
	});

export const mergeEligibility = (pr: Record<string, unknown>) => {
	const spec = pr.open_spec as Record<string, unknown> | null;
	const specs = Array.isArray(pr.open_specs)
		? (pr.open_specs as Record<string, unknown>[])
		: spec
			? [spec]
			: [];
	const labels = Array.isArray(pr.labels)
		? pr.labels.filter((label): label is string => typeof label === "string")
		: [];
	const openSpec = openSpecGate(specs, labels, pr);
	const gates = [
		{ blocked: pr.state !== "open", reason: "Pull request is closed." },
		{ blocked: Boolean(pr.draft), reason: "Pull request is a draft." },
		{
			blocked: !/^[0-9a-f]{40}$/i.test(String(pr.head_sha ?? "")),
			reason: "Pull request head is unavailable.",
		},
		{
			blocked: !new Set(["clean", "true"]).has(normalized(pr.mergeable)),
			reason: "Mergeability is not confirmed.",
		},
		{
			blocked:
				normalized(pr.workflow_state) !== "success" ||
				normalized(pr.checks_state) !== "success" ||
				failed.has(normalized(pr.workflow_state)) ||
				failed.has(normalized(pr.checks_state)),
			reason: "Required checks are not successful.",
		},
		{
			blocked: normalized(pr.review_state) !== "approved",
			reason: "Required review is not approved.",
		},
		{
			blocked: !openSpec.ready,
			reason:
				openSpec.blocker === "confirm"
					? "Confirm OpenSpec association."
					: "OpenSpec completion is not confirmed.",
		},
		{
			blocked: pr.merge_method !== "MERGE",
			reason: "Merge commits are not confirmed.",
		},
		{
			blocked: pr.protection !== "clear",
			reason: "Branch protection is not confirmed.",
		},
	];
	const gate = gates.find((item) => item.blocked);
	if (gate) return { ok: false, reason: gate.reason };
	return { ok: true as const };
};

export const mergeResult = (result: Record<string, unknown>) => {
	if (result.merged === true) return "success";
	const type = normalized(
		(result.errors as Array<{ type?: string }> | undefined)?.[0]?.type,
	);
	if (type.includes("head") || type.includes("stale")) return "stale";
	if (type.includes("forbidden") || type.includes("permission"))
		return "permission";
	if (type.includes("conflict")) return "conflict";
	return "blocked";
};

export const authorizeBeforeInstallation = async ({
	fetcher,
	userToken,
	login,
	fullName,
	installationToken,
}: {
	fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
	userToken: string;
	login: string;
	fullName: string;
	installationToken: () => Promise<string>;
}) => {
	const response = await fetcher(
		`https://api.github.com/repos/${fullName.split("/").map(encodeURIComponent).join("/")}/collaborators/${encodeURIComponent(login)}/permission`,
		{ headers: { authorization: `Bearer ${userToken}` } },
	);
	const permission = response.ok
		? String(((await response.json()) as { permission?: string }).permission)
		: "";
	if (!new Set(["write", "maintain", "admin"]).has(permission)) return null;
	return installationToken();
};

export const confirmExactMerge = async ({
	intent,
	inspect,
	merge,
}: {
	intent: { pullRequestId: string; headSha: string };
	inspect: () => Promise<Record<string, unknown>>;
	merge: (
		variables: Record<string, string>,
	) => Promise<Record<string, unknown>>;
}) => {
	const first = await inspect();
	if (first.head_sha !== intent.headSha) return "stale";
	if (!mergeEligibility(first).ok) return "blocked";
	const second = await inspect();
	if (second.head_sha !== intent.headSha || !mergeEligibility(second).ok)
		return "stale";
	return mergeResult(
		await merge({
			pullRequestId: intent.pullRequestId,
			expectedHeadOid: intent.headSha,
			mergeMethod: "MERGE",
		}),
	);
};
