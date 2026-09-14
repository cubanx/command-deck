import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReviewBotConfig } from "#/config";
import type { Db } from "#/db";
import {
	correlateDeploymentPullRequest,
	deletePullRequest,
	patchPullRequest,
	retainRecentMergedPullRequests,
	upsertDeployment,
	upsertPullRequest,
} from "#/db";
import { shouldApplyDeploymentStatus } from "#/deployment-status";
import { approvedInstallationAccount, normalizedLogin, sameLogin } from "#/installations";
import { changedTaskPaths, projectOpenSpec } from "#/openspec";

export function githubSignatureValid(body: string, signature: string | null, secret: string) {
	if (!signature?.startsWith("sha256=")) return false;
	const expected = createHmac("sha256", secret).update(body).digest("hex"),
		actual = signature.slice(7);
	return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export async function acceptGitHubDelivery(db: Db, deliveryId: string, eventName: string, body: string) {
	try {
		JSON.parse(body);
	} catch {
		return { kind: "malformed" } as const;
	}
	try {
		await db.inboxDeliveries.insertOne({
			_id: `github:${deliveryId}`,
			provider: "github",
			deliveryId,
			payload: body,
			eventName,
			status: "pending_verification",
			attempts: 0,
			receivedAt: new Date(),
		});
		return { kind: "accepted" } as const;
	} catch (error) {
		if ((error as { code?: number }).code === 11000) return { kind: "duplicate" } as const;
		throw error;
	}
}
const id = (value: unknown) => (typeof value === "number" || typeof value === "string" ? String(value) : null);
const safeUrl = (value: unknown) =>
	URL.canParse(String(value)) && ["http:", "https:"].includes(new URL(String(value)).protocol)
		? new URL(String(value)).toString()
		: undefined;
const safeGitHubRunUrl = (value: unknown) => {
	if (!URL.canParse(String(value))) return undefined;
	const url = new URL(String(value));
	return url.protocol === "https:" && url.hostname === "github.com" ? url.toString() : undefined;
};
const branch = (value: unknown) =>
	typeof value === "string" && value.length <= 255 && /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..")
		? value
		: undefined;
type GitHubPayload = {
	action?: string;
	after?: string;
	ref?: string;
	sha?: unknown;
	commits?: Array<{
		added?: string[];
		modified?: string[];
		removed?: string[];
	}>;
	installation?: { id?: unknown; account?: { login?: unknown } };
	repository?: { id?: unknown; full_name?: string };
	pull_request?: {
		number?: unknown;
		state?: string;
		title?: string;
		html_url?: unknown;
		user?: { login?: string };
		draft?: unknown;
		mergeable?: unknown;
		head?: { ref?: unknown; sha?: unknown };
		merge_commit_sha?: unknown;
		merged_at?: unknown;
		merged?: unknown;
		base?: { ref?: unknown };
		created_at?: unknown;
		updated_at?: unknown;
	};
	check_run?: {
		conclusion?: unknown;
		pull_requests?: Array<{ number?: unknown }>;
		head_sha?: unknown;
		check_suite?: { head_sha?: unknown };
	};
	check_suite?: {
		conclusion?: unknown;
		pull_requests?: Array<{ number?: unknown }>;
		head_sha?: unknown;
	};
	workflow_run?: {
		id?: unknown;
		name?: unknown;
		html_url?: unknown;
		conclusion?: unknown;
		status?: unknown;
		pull_requests?: Array<{ number?: unknown }>;
		head_sha?: unknown;
	};
	review?: { state?: unknown };
	issue?: { pull_request?: unknown; number?: unknown };
	comment?: { user?: { login?: unknown }; body?: unknown };
	requested_reviewer?: { id?: unknown };
	deployment?: {
		id?: unknown;
		environment?: unknown;
		ref?: unknown;
		sha?: unknown;
		created_at?: unknown;
	};
	deployment_status?: {
		id?: unknown;
		state?: unknown;
		created_at?: unknown;
		target_url?: unknown;
		log_url?: unknown;
	};
};

export const githubPayloadInstallationId = (payload?: string) => {
	try {
		return id((JSON.parse(payload ?? "{}") as GitHubPayload).installation?.id);
	} catch {
		return undefined;
	}
};
type TaskFetcher = (input: {
	installationId: string;
	repositoryId: string;
	path: string;
	sha: string;
}) => Promise<string | null | { finalTreeAbsent: true }>;

const retainMergedPullRequest = (
	repository: import("./db").Repository,
	pr: NonNullable<GitHubPayload["pull_request"]>,
	previous: Record<string, unknown> | undefined,
) => {
	const headSha = exactHeadSha(pr.head?.sha) ?? exactHeadSha(previous?.head_sha);
	const mergeSha = exactHeadSha(pr.merge_commit_sha);
	const mergedAt = typeof pr.merged_at === "string" ? pr.merged_at : undefined;
	const number = Number(pr.number);
	const title = typeof pr.title === "string" ? pr.title.trim() : "";
	const url = safeUrl(pr.html_url);
	if (
		pr.merged === true &&
		Number.isSafeInteger(number) &&
		number > 0 &&
		title &&
		url &&
		headSha &&
		mergeSha &&
		mergedAt &&
		Number.isFinite(Date.parse(mergedAt))
	)
		repository.recentMergedPullRequests = retainRecentMergedPullRequests([
			...(repository.recentMergedPullRequests ?? []),
			{
				number,
				title,
				url,
				head_sha: headSha,
				merge_sha: mergeSha,
				merged_at: mergedAt,
			},
		]);
};

const projectClosedPullRequest = (
	repository: import("./db").Repository,
	pr: NonNullable<GitHubPayload["pull_request"]>,
	previous: Record<string, unknown> | undefined,
	index: number,
	userLogin: string | undefined,
) => {
	const authoredMerge = sameLogin(pr.user?.login, userLogin) && pr.merged === true;
	if (authoredMerge) {
		const next: Record<string, unknown> = {
			...previous,
			number: Number(pr.number),
			title: pr.title ?? previous?.title ?? "Untitled",
			url: pr.html_url ?? previous?.url,
			author_login: pr.user?.login,
			state: "closed",
			merged: true,
			retention_candidate: true,
			merge_sha: exactHeadSha(pr.merge_commit_sha) ?? previous?.merge_sha,
			merged_at: typeof pr.merged_at === "string" ? pr.merged_at : previous?.merged_at,
			head_ref: branch(pr.head?.ref) ?? previous?.head_ref,
			base_ref: branch(pr.base?.ref) ?? previous?.base_ref,
			head_sha: exactHeadSha(pr.head?.sha) ?? previous?.head_sha,
			updated_at: pr.updated_at ?? previous?.updated_at ?? new Date().toISOString(),
		};
		if (typeof next.url !== "string") delete next.url;
		if (typeof next.base_ref !== "string") delete next.base_ref;
		if (index >= 0) repository.pullRequests[index] = next;
		else repository.pullRequests.push(next);
		retainMergedPullRequest(repository, pr, previous);
	} else if (sameLogin(pr.user?.login, userLogin)) retainMergedPullRequest(repository, pr, previous);
	if (!authoredMerge && index >= 0) repository.pullRequests.splice(index, 1);
	if (repository.recentMergedPullRequests) {
		const recent = retainRecentMergedPullRequests(repository.recentMergedPullRequests);
		if (recent.length) repository.recentMergedPullRequests = recent;
		else delete repository.recentMergedPullRequests;
	}
	repository.deployments = repository.deployments.map((deployment) => {
		return correlateDeploymentPullRequest(deployment, repository.pullRequests, repository.recentMergedPullRequests);
	});
	return false;
};

const projectPullRequest = (
	repository: import("./db").Repository,
	data: GitHubPayload,
	userLogin: string | undefined,
) => {
	const pr = data.pull_request;
	if (!pr) return false;
	const index = repository.pullRequests.findIndex((item) => item.number === Number(pr.number));
	const previous = index >= 0 ? repository.pullRequests[index] : undefined;
	if (data.action === "closed" || pr.state !== "open" || !sameLogin(pr.user?.login, userLogin))
		return projectClosedPullRequest(repository, pr, previous, index, userLogin);
	const mergeabilityChanged = Boolean(previous) && pr.mergeable != null && previous?.mergeable !== String(pr.mergeable);
	const headRef = branch(pr.head?.ref);
	const next: Record<string, unknown> = {
		...previous,
		number: Number(pr.number),
		title: pr.title ?? "Untitled",
		url: pr.html_url,
		author_login: pr.user?.login,
		state: pr.state,
		draft: pr.draft ? 1 : 0,
		opened_at: typeof pr.created_at === "string" ? pr.created_at : previous?.opened_at,
		head_ref: headRef,
		base_ref: branch(pr.base?.ref),
		head_sha: typeof pr.head?.sha === "string" && /^[0-9a-f]{40}$/i.test(pr.head.sha) ? pr.head.sha : undefined,
		mergeable: String(pr.mergeable ?? "unknown"),
		updated_at: pr.updated_at ?? new Date().toISOString(),
	};
	if (!headRef) delete next.head_ref;
	if (index >= 0) repository.pullRequests[index] = next;
	else repository.pullRequests.push(next);
	return mergeabilityChanged;
};

const signalPullRequestNumber = (data: GitHubPayload) =>
	Number(
		data.pull_request?.number ??
			data.check_run?.pull_requests?.[0]?.number ??
			data.check_suite?.pull_requests?.[0]?.number ??
			data.workflow_run?.pull_requests?.[0]?.number,
	);

export type ReconciliationTarget = {
	installationId: string;
	repositoryId: string;
	number: number;
};

const exactHeadSha = (value: unknown) =>
	typeof value === "string" && /^[0-9a-f]{40}$/i.test(value) ? value : undefined;

const lifecycleTargets = (
	installationId: string,
	repository: import("./db").Repository,
	event: string,
	data: GitHubPayload,
): ReconciliationTarget[] => {
	let numbers: number[] = [];
	if (
		event === "pull_request" ||
		["pull_request_review", "pull_request_review_comment", "pull_request_review_thread"].includes(event)
	)
		numbers = [Number(data.pull_request?.number)];
	else if (["check_run", "check_suite", "workflow_run"].includes(event)) {
		const source = data[event as "check_run" | "check_suite" | "workflow_run"];
		const associations = Array.isArray(source?.pull_requests) ? source.pull_requests : [];
		numbers = associations.map((item: { number?: unknown }) => Number(item.number)).filter(Number.isInteger);
		if (!numbers.length) {
			const sha = exactHeadSha(
				source?.head_sha ?? (source as { check_suite?: { head_sha?: unknown } })?.check_suite?.head_sha,
			);
			if (sha) numbers = repository.pullRequests.filter((pr) => pr.head_sha === sha).map((pr) => Number(pr.number));
		}
	} else if (event === "status") {
		const sha = exactHeadSha(data.sha);
		if (sha) numbers = repository.pullRequests.filter((pr) => pr.head_sha === sha).map((pr) => Number(pr.number));
	} else if (event === "push") {
		numbers = repository.pullRequests.filter((pr) => pr.retention_candidate === true).map((pr) => Number(pr.number));
	}
	return repository.pullRequests
		.filter((pr) => (pr.state === "open" || pr.retention_candidate === true) && numbers.includes(Number(pr.number)))
		.map((pr) => ({
			installationId,
			repositoryId: repository.repositoryId,
			number: Number(pr.number),
		}));
};

const projectPullRequestSignal = (repository: import("./db").Repository, event: string, data: GitHubPayload) => {
	const target = repository.pullRequests.find((item) => item.number === signalPullRequestNumber(data));
	if (!target) return;
	if (event === "pull_request_review") target.review_state = data.review?.state ?? data.action;
	if (event === "check_run" || event === "check_suite")
		target.checks_state = data.check_run?.conclusion ?? data.check_suite?.conclusion ?? "pending";
	if (event === "workflow_run") {
		const workflow = data.workflow_run,
			workflowId = id(workflow?.id),
			name =
				typeof workflow?.name === "string" && workflow.name.trim().length <= 255 ? workflow.name.trim() : undefined,
			url = safeGitHubRunUrl(workflow?.html_url),
			state = workflow?.conclusion ?? workflow?.status ?? "pending",
			failures = Array.isArray(target.workflow_failures)
				? target.workflow_failures.filter((item) => item.id !== workflowId)
				: [];
		target.workflow_state = state;
		if (workflowId && name && url && ["failure", "timed_out", "cancelled", "action_required"].includes(String(state)))
			failures.push({ id: workflowId, name, url });
		target.workflow_failures = failures.sort((left, right) => String(left.name).localeCompare(String(right.name)));
	}
};

const projectBotReview = (repository: import("./db").Repository, data: GitHubPayload, reviewBot?: ReviewBotConfig) => {
	const issue = data.issue;
	if (!["created", "edited"].includes(String(data.action)) || !reviewBot || !issue?.pull_request) return;
	const target = repository.pullRequests.find((item) => item.number === Number(issue.number));
	const actor = data.comment?.user?.login;
	const text = String(data.comment?.body ?? "").toLowerCase();
	if (!target || typeof actor !== "string" || actor.toLowerCase() !== reviewBot.login.toLowerCase()) return;
	const state = text.includes(reviewBot.doneMarker.toLowerCase())
		? "complete"
		: text.includes(reviewBot.startMarker.toLowerCase())
			? "in_progress"
			: undefined;
	if (state) {
		target.bot_review_actor = actor;
		target.bot_review_state = state;
	}
};

const scopedPullRequestFilter = (repositoryId: string, event: string, data: GitHubPayload) => {
	const numbers =
		event === "pull_request" ||
		["pull_request_review", "pull_request_review_comment", "pull_request_review_thread", "issue_comment"].includes(
			event,
		)
			? [Number(data.pull_request?.number ?? data.issue?.number)].filter(
					(number) => Number.isSafeInteger(number) && number > 0,
				)
			: event === "check_run"
				? (data.check_run?.pull_requests ?? [])
						.map((item) => Number(item.number))
						.filter((number) => Number.isSafeInteger(number) && number > 0)
				: event === "check_suite"
					? (data.check_suite?.pull_requests ?? [])
							.map((item) => Number(item.number))
							.filter((number) => Number.isSafeInteger(number) && number > 0)
					: event === "workflow_run"
						? (data.workflow_run?.pull_requests ?? [])
								.map((item) => Number(item.number))
								.filter((number) => Number.isSafeInteger(number) && number > 0)
						: [];
	if (numbers.length) return { repositoryId, number: { $in: [...new Set(numbers)] } };
	const sha =
		event === "check_run"
			? data.check_run?.head_sha
			: event === "check_suite"
				? data.check_suite?.head_sha
				: event === "workflow_run"
					? data.workflow_run?.head_sha
					: event === "status"
						? data.sha
						: event === "deployment" || event === "deployment_status"
							? data.deployment?.sha
							: undefined;
	if (exactHeadSha(sha)) return { repositoryId, $or: [{ head_sha: sha }, { merge_sha: sha }] };
	if (event === "push") return { repositoryId, retention_candidate: true };
	return undefined;
};

const projectDeployment = (repository: import("./db").Repository, event: string, data: GitHubPayload) => {
	if (!data.deployment) return false;
	const deploymentId = id(data.deployment.id);
	if (!deploymentId) return false;
	const index = repository.deployments.findIndex((item) => item.id === deploymentId);
	const prior = index >= 0 ? repository.deployments[index] : {};
	const statusId = id(data.deployment_status?.id);
	const statusCreatedAt = data.deployment_status?.created_at;
	const nextState =
		event === "deployment_status"
			? String(data.deployment_status?.state ?? "pending").toLowerCase()
			: String(prior.state ?? "pending");
	const next = correlateDeploymentPullRequest(
		{
			...prior,
			id: deploymentId,
			environment: data.deployment.environment ?? prior.environment,
			ref: data.deployment.ref ?? prior.ref,
			sha: data.deployment.sha ?? prior.sha,
			state: nextState,
			status_id: statusId ?? prior.status_id,
			status_created_at: statusCreatedAt ?? prior.status_created_at,
			target_url: safeUrl(data.deployment_status?.target_url) ?? prior.target_url,
			log_url: safeUrl(data.deployment_status?.log_url) ?? prior.log_url,
			updated_at: statusCreatedAt ?? prior.updated_at ?? data.deployment.created_at ?? new Date().toISOString(),
		},
		repository.pullRequests,
		repository.recentMergedPullRequests,
	);
	if (event !== "deployment" && !shouldApplyDeploymentStatus(next, prior)) return false;
	if (index >= 0) repository.deployments[index] = next;
	else repository.deployments.push(next);
	repository.deployments.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
	repository.deployments = repository.deployments.slice(0, 20);
	return ["success", "failure", "error"].includes(nextState) && prior.state !== nextState;
};

const projectPush = async (
	db: Db,
	data: GitHubPayload,
	installationId: string,
	repositoryId: string,
	account: string,
	fetchTasks: TaskFetcher,
) => {
	let changed = false;
	const commits = Array.isArray(data.commits) ? data.commits : [];
	const files = commits.flatMap((commit) => [
		...(commit.added ?? []),
		...(commit.modified ?? []),
		...(commit.removed ?? []),
	]);
	const sourceRef = data.ref?.startsWith("refs/heads/") ? branch(data.ref.slice(11)) : undefined;
	const retentionPaths = files.filter(
		(path) =>
			/^openspec\/changes\/[^/]+\/tasks\.md$/.test(path) ||
			/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-[^/]+\/tasks\.md$/.test(path),
	);
	const paths = [...new Set([...changedTaskPaths(files), ...retentionPaths])];
	paths.sort((left, right) => {
		const leftDeleted = commits.some((commit) => (commit.removed ?? []).includes(left));
		const rightDeleted = commits.some((commit) => (commit.removed ?? []).includes(right));
		return Number(rightDeleted) - Number(leftDeleted);
	});
	for (const path of paths) {
		const changeName =
			path.match(/^openspec\/changes\/([^/]+)\/tasks\.md$/)?.[1] ??
			path.match(/^openspec\/changes\/archive\/\d{4}-\d{2}-\d{2}-([^/]+)\/tasks\.md$/)?.[1];
		if (!changeName) continue;
		const deleted = commits.some((commit) => (commit.removed ?? []).includes(path));
		const content = deleted
			? undefined
			: await fetchTasks({
					installationId,
					repositoryId,
					path,
					sha: data.after ?? "unknown",
				});
		if (!deleted && content === null) throw new Error("OpenSpec artifact fetch failed");
		if (!deleted && typeof content !== "string") continue;
		const result = await projectOpenSpec(db, {
			installationId,
			accountLogin: account,
			repositoryId,
			path,
			changeName,
			content: typeof content === "string" ? content : "",
			deleted,
			sha: data.after ?? "unknown",
			sourceRef,
		});
		changed ||= result.changed;
	}
	return changed;
};

const domainPatch = (before: Record<string, unknown> | undefined, after: Record<string, unknown>) => {
	const patch: Record<string, unknown> = {};
	const unset: string[] = [];
	for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
		if (["_id", "repositoryId", "number", "revision", "updatedAt"].includes(key)) continue;
		const next = after[key];
		if (next === undefined) {
			if (before?.[key] !== undefined) unset.push(key);
		} else if (JSON.stringify(before?.[key]) !== JSON.stringify(next)) patch[key] = next;
	}
	return { patch, unset };
};

type GitHubProjectionContext = {
	db: Db;
	data: GitHubPayload;
	event: string;
	installationId: string;
	repositoryId: string;
	repository: import("./db").Repository;
	targets: Map<string, ReconciliationTarget>;
};

const projectPullRequestEvent = async (context: GitHubProjectionContext) => {
	const { db, data, event, installationId, repositoryId, repository, targets } = context;
	const pr = data.pull_request;
	const number = Number(pr?.number);
	if (event !== "pull_request" || !pr || !Number.isSafeInteger(number) || number <= 0) return false;
	const previous = await db.pullRequests.findOne({ _id: `${repositoryId}:${number}` });
	const before = previous ? { ...previous } : undefined;
	projectPullRequest(repository, data, pr.user?.login);
	const next = repository.pullRequests.find((item) => item.number === number) as Record<string, unknown> | undefined;
	let changed = false;
	if (!next) {
		if (previous)
			changed = await deletePullRequest(db, `${repositoryId}:${number}`, {
				revision: previous.revision,
				updated_at: previous.updated_at,
			});
	} else {
		const { patch, unset } = domainPatch(before, next);
		const incomingTime = Date.parse(String(next.updated_at ?? ""));
		const existingTime = Date.parse(String(previous?.updated_at ?? ""));
		const stale =
			previous && Number.isFinite(incomingTime) && Number.isFinite(existingTime) && incomingTime < existingTime;
		if (!stale && previous)
			changed = await patchPullRequest(db, `${repositoryId}:${number}`, patch, unset, {
				revision: previous.revision,
				head_sha: previous.head_sha,
				source_commit: previous.source_commit,
			});
		else if (!stale) changed = await upsertPullRequest(db, { repositoryId, number, ...patch });
	}
	if (next) targets.set(`${repositoryId}:${number}`, { installationId, repositoryId, number });
	return changed;
};

const projectLifecycleEvents = async (context: GitHubProjectionContext) => {
	const { db, data, event, installationId, repositoryId, repository, targets } = context;
	if (
		![
			"pull_request_review",
			"pull_request_review_comment",
			"pull_request_review_thread",
			"check_run",
			"check_suite",
			"workflow_run",
			"status",
		].includes(event)
	)
		return false;
	let changed = false;
	for (const target of lifecycleTargets(installationId, repository, event, data)) {
		const before = repository.pullRequests.find((item) => item.number === target.number) as
			| Record<string, unknown>
			| undefined;
		if (!before) continue;
		const facade = { ...repository, pullRequests: [{ ...before }] };
		projectPullRequestSignal(facade, event, {
			...data,
			pull_request: { ...(data.pull_request ?? {}), number: target.number },
		});
		const after = facade.pullRequests[0] as Record<string, unknown>;
		const { patch, unset } = domainPatch(before, after);
		changed =
			(await patchPullRequest(db, `${repositoryId}:${target.number}`, patch, unset, {
				revision: before.revision as number | undefined,
				head_sha: before.head_sha,
				source_commit: before.source_commit,
			})) || changed;
		targets.set(`${repositoryId}:${target.number}`, target);
	}
	return changed;
};

const projectIssueCommentEvent = async (context: GitHubProjectionContext, reviewBot?: ReviewBotConfig) => {
	const { db, data, installationId, repositoryId, repository, targets } = context;
	if (context.event !== "issue_comment") return false;
	const targetNumber = Number(data.issue?.number);
	const before = repository.pullRequests.find((item) => item.number === targetNumber) as
		| Record<string, unknown>
		| undefined;
	if (!before) return false;
	const facade = { ...repository, pullRequests: [{ ...before }] };
	projectBotReview(facade, data, reviewBot);
	const after = facade.pullRequests[0] as Record<string, unknown>;
	const { patch, unset } = domainPatch(before, after);
	const changed = await patchPullRequest(db, `${repositoryId}:${targetNumber}`, patch, unset, {
		revision: before.revision as number | undefined,
		head_sha: before.head_sha,
		source_commit: before.source_commit,
	});
	targets.set(`${repositoryId}:${targetNumber}`, { installationId, repositoryId, number: targetNumber });
	return changed;
};

const projectDeploymentEvent = async (context: GitHubProjectionContext) => {
	const { db, data, event, repositoryId, repository } = context;
	if (!["deployment", "deployment_status"].includes(event) || data.deployment?.id == null) return false;
	const deploymentId = id(data.deployment.id);
	if (!deploymentId) return false;
	const before = repository.deployments.find((item) => String(item.id ?? item.deploymentId) === deploymentId) as
		| Record<string, unknown>
		| undefined;
	projectDeployment(repository, event, data);
	const after = repository.deployments.find((item) => String(item.id ?? item.deploymentId) === deploymentId) as
		| Record<string, unknown>
		| undefined;
	if (!after) return false;
	const { patch } = domainPatch(before, after);
	return upsertDeployment(db, { repositoryId, deploymentId, ...patch });
};

const projectClosedDeploymentCorrelation = async (context: GitHubProjectionContext) => {
	const { db, data, event, repositoryId, repository } = context;
	if (event !== "pull_request" || data.action !== "closed") return false;
	let changed = false;
	for (const deployment of repository.deployments) {
		const deploymentId = id(deployment.id ?? deployment.deploymentId);
		if (!deploymentId) continue;
		const before = await db.deployments.findOne({ _id: `${repositoryId}:${deploymentId}` });
		const { patch } = domainPatch(before ?? undefined, deployment);
		if (Object.keys(patch).length)
			changed = (await upsertDeployment(db, { repositoryId, deploymentId, ...patch })) || changed;
	}
	return changed;
};

const supportedGitHubEvents = new Set([
	"pull_request",
	"pull_request_review",
	"pull_request_review_comment",
	"pull_request_review_thread",
	"check_run",
	"check_suite",
	"workflow_run",
	"status",
	"issue_comment",
	"deployment",
	"deployment_status",
	"push",
]);

const loadGitHubProjectionContext = async (
	db: Db,
	event: string,
	data: GitHubPayload,
	resolvedAccount?: string,
): Promise<{ context: GitHubProjectionContext; account: string } | undefined> => {
	if (!supportedGitHubEvents.has(event)) return;
	const installationId = id(data.installation?.id);
	const repositoryId = id(data.repository?.id);
	const account = data.installation?.account?.login ?? resolvedAccount;
	if (!installationId || !repositoryId || !approvedInstallationAccount(account)) return;
	const installation = await db.installations.findOne(
		{ _id: installationId },
		{ projection: { accountLogin: 1, active: 1, suspended: 1 } },
	);
	if (
		!installation ||
		!approvedInstallationAccount(installation.accountLogin) ||
		!sameLogin(installation.accountLogin, account) ||
		installation.active === false ||
		installation.suspended === true
	)
		return;
	await db.repositories.updateOne(
		{ _id: repositoryId },
		{
			$set: { repositoryId, full_name: String(data.repository?.full_name ?? repositoryId) },
			$addToSet: { installationIds: installationId },
		},
		{ upsert: true },
	);
	const pullRequestFilter = scopedPullRequestFilter(repositoryId, event, data);
	const pullRequests = pullRequestFilter ? await db.pullRequests.find(pullRequestFilter).toArray() : [];
	const deploymentId = id(data.deployment?.id);
	const deploymentSha =
		(event === "pull_request" && data.action === "closed" ? data.pull_request?.head?.sha : undefined) ??
		(event === "deployment" || event === "deployment_status" ? data.deployment?.sha : undefined);
	const deploymentFilter = deploymentId
		? { _id: `${repositoryId}:${deploymentId}` }
		: exactHeadSha(deploymentSha)
			? { repositoryId, sha: deploymentSha }
			: undefined;
	const recentMergedPullRequests = pullRequests
		.filter(
			(pr) =>
				pr.retention_candidate === true &&
				Number.isSafeInteger(Number(pr.number)) &&
				Number(pr.number) > 0 &&
				typeof pr.title === "string" &&
				typeof pr.url === "string" &&
				exactHeadSha(pr.head_sha) &&
				exactHeadSha(pr.merge_sha) &&
				typeof pr.merged_at === "string" &&
				Number.isFinite(Date.parse(pr.merged_at)),
		)
		.map((pr) => ({
			number: Number(pr.number),
			title: String(pr.title),
			url: String(pr.url),
			head_sha: String(pr.head_sha),
			merge_sha: String(pr.merge_sha),
			merged_at: String(pr.merged_at),
		}));
	const repository = {
		repositoryId,
		full_name: String(data.repository?.full_name ?? repositoryId),
		pullRequests: pullRequests as import("#/db").PullRequest[],
		openSpecs: [],
		deployments: (deploymentFilter ? await db.deployments.find(deploymentFilter).toArray() : []) as Record<
			string,
			unknown
		>[],
		recentMergedPullRequests,
	};
	return {
		account,
		context: { db, data, event, installationId, repositoryId, repository, targets: new Map() },
	};
};

async function projectGitHub(
	db: Db,
	event: string,
	raw: string,
	resolvedAccount?: string,
	fetchTasks?: TaskFetcher,
	reviewBot?: ReviewBotConfig,
) {
	const data = JSON.parse(raw) as GitHubPayload;
	const loaded = await loadGitHubProjectionContext(db, event, data, resolvedAccount);
	if (!loaded) return { status: "ignored" as const, targets: [] };
	const { context, account } = loaded;
	const { installationId, repositoryId, repository, targets } = context;
	const changedValues = [
		await projectPullRequestEvent(context),
		await projectLifecycleEvents(context),
		await projectIssueCommentEvent(context, reviewBot),
		await projectDeploymentEvent(context),
		await projectClosedDeploymentCorrelation(context),
		...(event === "push" && fetchTasks
			? [await projectPush(db, data, installationId, repositoryId, account, fetchTasks)]
			: []),
	];
	const changed = changedValues.some(Boolean);
	if (event === "push")
		for (const target of lifecycleTargets(installationId, repository, event, data))
			targets.set(`${repositoryId}:${target.number}`, target);
	const lifecycleHint = [
		"pull_request_review",
		"pull_request_review_comment",
		"pull_request_review_thread",
		"check_run",
		"check_suite",
		"workflow_run",
		"status",
	].includes(event);
	return {
		status: lifecycleHint && !targets.size ? ("ignored" as const) : ("done" as const),
		changed,
		targets: [...targets.values()],
	};
}

type Verification =
	| {
			kind: "ready";
			raw: string;
			account: string;
			installationId: string;
	  }
	| {
			kind: "pending";
			reason: "missing_binding" | "ambiguous_binding" | "conflicting_account" | "verification_unavailable";
	  };

const verifyGitHubDelivery = async (db: Db, raw: string): Promise<Verification> => {
	let data: GitHubPayload;
	try {
		data = JSON.parse(raw);
	} catch {
		return { kind: "pending", reason: "verification_unavailable" };
	}
	const installationId = id(data.installation?.id);
	const repositoryId = id(data.repository?.id);
	if (!installationId || !repositoryId) return { kind: "pending", reason: "missing_binding" };
	try {
		const installation = await db.installations.findOne({ _id: installationId }, { projection: { accountLogin: 1 } });
		const accounts =
			installation && approvedInstallationAccount(installation.accountLogin)
				? [normalizedLogin(installation.accountLogin)].filter((account): account is string => Boolean(account))
				: [];
		if (!accounts.length) return { kind: "pending", reason: "missing_binding" };
		if (accounts.length !== 1) return { kind: "pending", reason: "ambiguous_binding" };
		const account = data.installation?.account?.login;
		if (account && !sameLogin(account, accounts[0])) return { kind: "pending", reason: "conflicting_account" };
		data.installation ??= {};
		data.installation.account = {
			...(data.installation.account ?? {}),
			login: accounts[0],
		};
		return {
			kind: "ready",
			raw: JSON.stringify(data),
			account: accounts[0],
			installationId,
		};
	} catch {
		return { kind: "pending", reason: "verification_unavailable" };
	}
};

export async function markDeliveriesRepairedByReconciliation(
	db: Db,
	installationId: string,
	repositoryIds: Iterable<string>,
	now = () => new Date(),
) {
	const covered = new Set(repositoryIds);
	const rows = await db.inboxDeliveries.find({ provider: "github", status: "pending_verification" }).toArray();
	const ids = rows.flatMap((row) => {
		if (githubPayloadInstallationId(row.payload) !== installationId) return [];
		try {
			const data = JSON.parse(row.payload ?? "{}") as GitHubPayload;
			return ["pull_request", "deployment", "deployment_status"].includes(row.eventName) &&
				covered.has(id(data.repository?.id) ?? "")
				? [row._id]
				: [];
		} catch {
			return [];
		}
	});
	if (!ids.length) return 0;
	await db.inboxDeliveries.updateMany(
		{ _id: { $in: ids } },
		{
			$set: {
				status: "done",
				processedAt: now(),
				resolvedAt: now(),
				resolvedBy: "reconciliation",
			},
			$unset: { payload: "", nextAttemptAt: "" },
		},
	);
	return ids.length;
}
export async function drainInbox(
	db: Db,
	fetchTasks?: (input: {
		installationId: string;
		repositoryId: string;
		path: string;
		sha: string;
	}) => Promise<string | null | { finalTreeAbsent: true }>,
	reviewBot?: ReviewBotConfig,
	sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
	now = () => new Date(),
	enqueueTarget?: (target: ReconciliationTarget) => void,
	onChangedUser?: (userId: string) => void,
) {
	const affected = new Set<string>();
	while (true) {
		const current = now(),
			rows = await db.inboxDeliveries
				.find({
					status: { $in: ["pending", "pending_verification"] },
					$or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: { $lte: current } }],
				})
				.sort({ receivedAt: 1 })
				.toArray();
		for (const row of rows)
			try {
				if (row.provider !== "github") {
					await db.inboxDeliveries.updateOne(
						{ _id: row._id },
						{
							$set: { status: "rejected", processedAt: now() },
							$unset: { payload: "", nextAttemptAt: "" },
						},
					);
					continue;
				}
				const processingStartedAt = row.processingStartedAt ?? now();
				await db.inboxDeliveries.updateOne(
					{ _id: row._id, processingStartedAt: { $exists: false } },
					{ $set: { processingStartedAt } },
				);
				const verification = await verifyGitHubDelivery(db, row.payload ?? "");
				if (verification.kind === "pending") {
					const attemptedAt = now();
					const attempts = row.attempts + 1;
					await db.inboxDeliveries.updateOne(
						{ _id: row._id },
						{
							$set: {
								status: "pending_verification",
								attempts,
								verificationReason: verification.reason,
								verificationFirstAttemptAt: row.verificationFirstAttemptAt ?? attemptedAt,
								verificationLastAttemptAt: attemptedAt,
								nextAttemptAt: new Date(attemptedAt.getTime() + (attempts <= 2 ? 1000 * 2 ** (attempts - 1) : 60_000)),
							},
						},
					);
					continue;
				}
				await db.inboxDeliveries.updateOne({ _id: row._id }, { $set: { resolvedAccount: verification.account } });
				const projection = await projectGitHub(
					db,
					row.eventName,
					verification.raw,
					verification.account,
					fetchTasks,
					reviewBot,
				);
				const installationId = verification.installationId;
				const changedUsers =
					projection.changed && installationId
						? (await db.bindings.find({ installationId }, { projection: { userId: 1 } }).toArray()).map(
								(binding) => binding.userId,
							)
						: [];
				for (const userId of changedUsers) affected.add(userId);
				await db.inboxDeliveries.updateOne(
					{ _id: row._id },
					{
						$set: {
							status: projection.status === "ignored" ? "ignored" : "done",
							processedAt: now(),
							resolvedAt: now(),
							resolvedBy: projection.status === "ignored" ? "recorded_noop" : "projection",
						},
						$unset: { payload: "", error: "", nextAttemptAt: "" },
					},
				);
				for (const userId of changedUsers) onChangedUser?.(userId);
				for (const target of projection.targets)
					try {
						enqueueTarget?.(target);
					} catch (error) {
						console.error(
							"targeted reconciliation enqueue failed",
							error instanceof Error ? error.message : "unknown error",
						);
					}
			} catch (error) {
				const attempts = row.attempts + 1;
				if (row.provider === "github") {
					const attemptedAt = now();
					await db.inboxDeliveries.updateOne(
						{ _id: row._id },
						{
							$set: {
								status: "pending_verification",
								attempts,
								error: "processing failed",
								verificationReason: "verification_unavailable",
								verificationFirstAttemptAt: row.verificationFirstAttemptAt ?? attemptedAt,
								verificationLastAttemptAt: attemptedAt,
								nextAttemptAt: new Date(attemptedAt.getTime() + (attempts <= 2 ? 1000 * 2 ** (attempts - 1) : 60_000)),
							},
						},
					);
					continue;
				}
				const terminal = attempts >= 3;
				await db.inboxDeliveries.updateOne(
					{ _id: row._id },
					{
						$set: {
							status: terminal ? "rejected" : "pending",
							attempts,
							error: error instanceof Error ? error.message.slice(0, 200) : "processing failed",
							...(terminal
								? { processedAt: now() }
								: {
										nextAttemptAt: new Date(now().getTime() + 1000 * 2 ** (attempts - 1)),
									}),
						},
						...(terminal ? { $unset: { nextAttemptAt: "" } } : {}),
					},
				);
			}
		const next = await db.inboxDeliveries
			.find({
				status: { $in: ["pending", "pending_verification"] },
				nextAttemptAt: { $exists: true },
			})
			.sort({ nextAttemptAt: 1 })
			.limit(1)
			.next();
		if (!next?.nextAttemptAt || (next.status === "pending_verification" && next.attempts >= 3)) break;
		await sleep(Math.max(0, next.nextAttemptAt.getTime() - now().getTime()));
	}
	return [...affected];
}
