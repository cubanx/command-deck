import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ReviewBotConfig } from "#/config";
import type { Db } from "#/db";
import {
	correlateDeploymentPullRequest,
	mutateUser,
	retainRecentMergedPullRequests,
} from "#/db";
import { shouldApplyDeploymentStatus } from "#/deployment-status";
import {
	approvedInstallationAccount,
	normalizedLogin,
	sameLogin,
} from "#/installations";
import { changedTaskPaths, projectOpenSpec } from "#/openspec";

export function githubSignatureValid(
	body: string,
	signature: string | null,
	secret: string,
) {
	if (!signature?.startsWith("sha256=")) return false;
	const expected = createHmac("sha256", secret).update(body).digest("hex"),
		actual = signature.slice(7);
	return (
		actual.length === expected.length &&
		timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
	);
}
export async function acceptGitHubDelivery(
	db: Db,
	deliveryId: string,
	eventName: string,
	body: string,
) {
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
		if ((error as { code?: number }).code === 11000)
			return { kind: "duplicate" } as const;
		throw error;
	}
}
export async function notifyUser(
	db: Db,
	userId: string,
	transitionKey: string,
	title: string,
	body: string,
	link?: string,
) {
	try {
		await db.notifications.insertOne({
			_id: randomUUID(),
			userId,
			transitionKey,
			title,
			body,
			link,
			createdAt: new Date(),
		});
	} catch (error) {
		if ((error as { code?: number }).code !== 11000) throw error;
	}
}
export async function notifyBoundUsers(
	db: Db,
	installationId: string,
	accountLogin: string,
	key: string,
	title: string,
	body: string,
) {
	const users = await db.users
		.find({ "installations.installationId": installationId })
		.toArray();
	await Promise.all(
		users
			.filter((user) =>
				user.installations.some(
					(item) =>
						item.installationId === installationId &&
						approvedInstallationAccount(item.accountLogin) &&
						sameLogin(item.accountLogin, accountLogin),
				),
			)
			.map((user) => notifyUser(db, user._id, key, title, body)),
	);
}
const id = (value: unknown) =>
	typeof value === "number" || typeof value === "string" ? String(value) : null;
const safeUrl = (value: unknown) =>
	URL.canParse(String(value)) &&
	["http:", "https:"].includes(new URL(String(value)).protocol)
		? new URL(String(value)).toString()
		: undefined;
const safeGitHubRunUrl = (value: unknown) => {
	if (!URL.canParse(String(value))) return undefined;
	const url = new URL(String(value));
	return url.protocol === "https:" && url.hostname === "github.com"
		? url.toString()
		: undefined;
};
const branch = (value: unknown) =>
	typeof value === "string" &&
	value.length <= 255 &&
	/^[A-Za-z0-9._/-]+$/.test(value) &&
	!value.includes("..")
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
type TaskFetcher = (input: {
	installationId: string;
	repositoryId: string;
	path: string;
	sha: string;
}) => Promise<string | null>;

const ensureRepository = (
	installation: import("./db").Installation,
	repositoryId: string,
	fullName: unknown,
) => {
	let repository = installation.repositories.find(
		(item) => item.repositoryId === repositoryId,
	);
	if (!repository) {
		repository = {
			repositoryId,
			full_name: typeof fullName === "string" ? fullName : repositoryId,
			pullRequests: [],
			openSpecs: [],
			deployments: [],
		};
		installation.repositories.push(repository);
	}
	return repository;
};

const retainMergedPullRequest = (
	repository: import("./db").Repository,
	pr: NonNullable<GitHubPayload["pull_request"]>,
	previous: Record<string, unknown> | undefined,
) => {
	const headSha =
		exactHeadSha(pr.head?.sha) ?? exactHeadSha(previous?.head_sha);
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

const projectPullRequest = (
	repository: import("./db").Repository,
	data: GitHubPayload,
	userLogin: string | undefined,
) => {
	const pr = data.pull_request;
	if (!pr) return false;
	const index = repository.pullRequests.findIndex(
		(item) => item.number === Number(pr.number),
	);
	const previous = index >= 0 ? repository.pullRequests[index] : undefined;
	if (
		data.action === "closed" ||
		pr.state !== "open" ||
		!sameLogin(pr.user?.login, userLogin)
	) {
		if (sameLogin(pr.user?.login, userLogin))
			retainMergedPullRequest(repository, pr, previous);
		if (index >= 0) repository.pullRequests.splice(index, 1);
		if (repository.recentMergedPullRequests) {
			const recent = retainRecentMergedPullRequests(
				repository.recentMergedPullRequests,
			);
			if (recent.length) repository.recentMergedPullRequests = recent;
			else delete repository.recentMergedPullRequests;
		}
		repository.deployments = repository.deployments.map((deployment) =>
			correlateDeploymentPullRequest(
				deployment,
				repository.pullRequests,
				repository.recentMergedPullRequests,
			),
		);
		return false;
	}
	const mergeabilityChanged =
		Boolean(previous) &&
		pr.mergeable != null &&
		previous?.mergeable !== String(pr.mergeable);
	const headRef = branch(pr.head?.ref);
	const next: Record<string, unknown> = {
		...previous,
		number: Number(pr.number),
		title: pr.title ?? "Untitled",
		url: pr.html_url,
		author_login: pr.user?.login,
		state: pr.state,
		draft: pr.draft ? 1 : 0,
		head_ref: headRef,
		head_sha:
			typeof pr.head?.sha === "string" && /^[0-9a-f]{40}$/i.test(pr.head.sha)
				? pr.head.sha
				: undefined,
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
	typeof value === "string" && /^[0-9a-f]{40}$/i.test(value)
		? value
		: undefined;

const lifecycleTargets = (
	installationId: string,
	repository: import("./db").Repository,
	event: string,
	data: GitHubPayload,
): ReconciliationTarget[] => {
	let numbers: number[] = [];
	if (
		event === "pull_request" ||
		[
			"pull_request_review",
			"pull_request_review_comment",
			"pull_request_review_thread",
		].includes(event)
	)
		numbers = [Number(data.pull_request?.number)];
	else if (["check_run", "check_suite", "workflow_run"].includes(event)) {
		const source = data[event as "check_run" | "check_suite" | "workflow_run"];
		const associations = Array.isArray(source?.pull_requests)
			? source.pull_requests
			: [];
		numbers = associations
			.map((item: { number?: unknown }) => Number(item.number))
			.filter(Number.isInteger);
		if (!numbers.length) {
			const sha = exactHeadSha(
				source?.head_sha ??
					(source as { check_suite?: { head_sha?: unknown } })?.check_suite
						?.head_sha,
			);
			if (sha)
				numbers = repository.pullRequests
					.filter((pr) => pr.head_sha === sha)
					.map((pr) => Number(pr.number));
		}
	} else if (event === "status") {
		const sha = exactHeadSha(data.sha);
		if (sha)
			numbers = repository.pullRequests
				.filter((pr) => pr.head_sha === sha)
				.map((pr) => Number(pr.number));
	}
	return repository.pullRequests
		.filter((pr) => pr.state === "open" && numbers.includes(Number(pr.number)))
		.map((pr) => ({
			installationId,
			repositoryId: repository.repositoryId,
			number: Number(pr.number),
		}));
};

const projectPullRequestSignal = (
	repository: import("./db").Repository,
	event: string,
	data: GitHubPayload,
) => {
	const target = repository.pullRequests.find(
		(item) => item.number === signalPullRequestNumber(data),
	);
	if (!target) return;
	if (event === "pull_request_review")
		target.review_state = data.review?.state ?? data.action;
	if (event === "check_run" || event === "check_suite")
		target.checks_state =
			data.check_run?.conclusion ?? data.check_suite?.conclusion ?? "pending";
	if (event === "workflow_run") {
		const workflow = data.workflow_run,
			workflowId = id(workflow?.id),
			name =
				typeof workflow?.name === "string" && workflow.name.trim().length <= 255
					? workflow.name.trim()
					: undefined,
			url = safeGitHubRunUrl(workflow?.html_url),
			state = workflow?.conclusion ?? workflow?.status ?? "pending",
			failures = Array.isArray(target.workflow_failures)
				? target.workflow_failures.filter((item) => item.id !== workflowId)
				: [];
		target.workflow_state = state;
		if (
			workflowId &&
			name &&
			url &&
			["failure", "timed_out", "cancelled", "action_required"].includes(
				String(state),
			)
		)
			failures.push({ id: workflowId, name, url });
		target.workflow_failures = failures.sort((left, right) =>
			String(left.name).localeCompare(String(right.name)),
		);
	}
};

const projectBotReview = (
	repository: import("./db").Repository,
	data: GitHubPayload,
	reviewBot?: ReviewBotConfig,
) => {
	const issue = data.issue;
	if (
		!["created", "edited"].includes(String(data.action)) ||
		!reviewBot ||
		!issue?.pull_request
	)
		return;
	const target = repository.pullRequests.find(
		(item) => item.number === Number(issue.number),
	);
	const actor = data.comment?.user?.login;
	const text = String(data.comment?.body ?? "").toLowerCase();
	if (
		!target ||
		typeof actor !== "string" ||
		actor.toLowerCase() !== reviewBot.login.toLowerCase()
	)
		return;
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

const projectDeployment = (
	repository: import("./db").Repository,
	event: string,
	data: GitHubPayload,
) => {
	if (!data.deployment) return false;
	const deploymentId = id(data.deployment.id);
	if (!deploymentId) return false;
	const index = repository.deployments.findIndex(
		(item) => item.id === deploymentId,
	);
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
			target_url:
				safeUrl(data.deployment_status?.target_url) ?? prior.target_url,
			log_url: safeUrl(data.deployment_status?.log_url) ?? prior.log_url,
			updated_at:
				statusCreatedAt ??
				prior.updated_at ??
				data.deployment.created_at ??
				new Date().toISOString(),
		},
		repository.pullRequests,
		repository.recentMergedPullRequests,
	);
	if (event !== "deployment" && !shouldApplyDeploymentStatus(next, prior))
		return false;
	if (index >= 0) repository.deployments[index] = next;
	else repository.deployments.push(next);
	repository.deployments.sort((a, b) =>
		String(b.updated_at).localeCompare(String(a.updated_at)),
	);
	repository.deployments = repository.deployments.slice(0, 20);
	return (
		["success", "failure", "error"].includes(nextState) &&
		prior.state !== nextState
	);
};

const applyGitHubEvent = (
	aggregate: import("./db").UserAggregate,
	installationId: string,
	repositoryId: string,
	account: string,
	event: string,
	data: GitHubPayload,
	reviewBot: ReviewBotConfig | undefined,
) => {
	const installation = aggregate.installations.find(
		(item) => item.installationId === installationId,
	);
	if (
		!installation ||
		!approvedInstallationAccount(installation.accountLogin) ||
		!sameLogin(installation.accountLogin, account)
	)
		return { mergeabilityChanged: false, terminalTransition: false };
	const repository =
		event === "pull_request" ||
		event === "deployment" ||
		event === "deployment_status"
			? ensureRepository(installation, repositoryId, data.repository?.full_name)
			: installation.repositories.find(
					(item) => item.repositoryId === repositoryId,
				);
	if (!repository)
		return { mergeabilityChanged: false, terminalTransition: false };
	if (event === "pull_request")
		return {
			mergeabilityChanged: projectPullRequest(
				repository,
				data,
				aggregate.github.login,
			),
			terminalTransition: false,
		};
	if (
		[
			"pull_request_review",
			"pull_request_review_comment",
			"pull_request_review_thread",
			"check_run",
			"check_suite",
			"workflow_run",
		].includes(event)
	)
		projectPullRequestSignal(repository, event, data);
	if (event === "issue_comment") projectBotReview(repository, data, reviewBot);
	const terminalTransition =
		event === "deployment" || event === "deployment_status"
			? projectDeployment(repository, event, data)
			: false;
	return { mergeabilityChanged: false, terminalTransition };
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
	const sourceRef = data.ref?.startsWith("refs/heads/")
		? branch(data.ref.slice(11))
		: undefined;
	for (const path of changedTaskPaths(files)) {
		const deleted = commits.some((commit) =>
			(commit.removed ?? []).includes(path),
		);
		const content = deleted
			? undefined
			: await fetchTasks({
					installationId,
					repositoryId,
					path,
					sha: data.after ?? "unknown",
				});
		if (!deleted && content === null)
			throw new Error("OpenSpec artifact fetch failed");
		const result = await projectOpenSpec(db, {
			installationId,
			accountLogin: account,
			repositoryId,
			path,
			content: content ?? "",
			deleted,
			sha: data.after ?? "unknown",
			sourceRef,
		});
		changed ||= result.changed;
		if (result.completed)
			await notifyBoundUsers(
				db,
				installationId,
				account,
				`openspec-complete:${repositoryId}:${path}:${data.after}`,
				"OpenSpec complete",
				path.split("/")[2] ?? "OpenSpec",
			);
	}
	return changed;
};

const notifyReviewRequest = async (
	db: Db,
	data: GitHubPayload,
	installationId: string,
	repositoryId: string,
	account: string,
) => {
	if (data.action !== "review_requested" || !data.requested_reviewer?.id)
		return;
	const target = await db.users.findOne({
		_id: String(data.requested_reviewer.id),
	});
	if (
		!target?.installations.some(
			(item) =>
				item.installationId === installationId &&
				approvedInstallationAccount(item.accountLogin) &&
				sameLogin(item.accountLogin, account),
		)
	)
		return;
	await notifyUser(
		db,
		target._id,
		`review-request:${repositoryId}:${data.pull_request?.number}:${target._id}`,
		"Review requested",
		data.pull_request?.title ?? "Pull request",
	);
};

const notifyCheckFailure = async (
	db: Db,
	event: string,
	data: GitHubPayload,
	installationId: string,
	repositoryId: string,
	account: string,
) => {
	if (
		!["check_run", "check_suite"].includes(event) ||
		!["failure", "timed_out", "cancelled"].includes(
			String(data.check_run?.conclusion ?? data.check_suite?.conclusion),
		)
	)
		return;
	const number = signalPullRequestNumber(data);
	const candidates = await db.users
		.find({ "installations.installationId": installationId })
		.toArray();
	for (const candidate of candidates) {
		const ownsPullRequest = candidate.installations.some(
			(item) =>
				item.installationId === installationId &&
				approvedInstallationAccount(item.accountLogin) &&
				sameLogin(item.accountLogin, account) &&
				item.repositories
					.find((repository) => repository.repositoryId === repositoryId)
					?.pullRequests.some((pr) => pr.number === number),
		);
		if (ownsPullRequest)
			await notifyUser(
				db,
				candidate._id,
				`check-failed:${repositoryId}:${number}`,
				"Checks failed",
				data.repository?.full_name ?? "Repository",
			);
	}
};

const notifyProjectionChanges = async (
	db: Db,
	event: string,
	data: GitHubPayload,
	installationId: string,
	repositoryId: string,
	account: string,
	terminalTransition: boolean,
	mergeabilityUsers: Set<string>,
) => {
	if (
		event === "deployment_status" &&
		terminalTransition &&
		data.deployment &&
		data.deployment_status
	)
		await notifyBoundUsers(
			db,
			installationId,
			account,
			`github-deployment:${repositoryId}:${data.deployment?.id}:${String(data.deployment_status.state).toLowerCase()}`,
			`Deployment ${String(data.deployment_status.state).toLowerCase()}`,
			data.repository?.full_name ?? "Repository",
		);
	if (data.pull_request)
		for (const userId of mergeabilityUsers)
			await notifyUser(
				db,
				userId,
				`mergeability:${repositoryId}:${data.pull_request.number}:${data.pull_request.mergeable}`,
				"Mergeability changed",
				data.pull_request.title ?? "Pull request",
			);
	if (event === "pull_request")
		await notifyReviewRequest(db, data, installationId, repositoryId, account);
	await notifyCheckFailure(
		db,
		event,
		data,
		installationId,
		repositoryId,
		account,
	);
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
	if (
		![
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
		].includes(event)
	)
		return { status: "ignored" as const, targets: [] };
	const installationId = id(data.installation?.id);
	const repositoryId = id(data.repository?.id);
	const account = data.installation?.account?.login ?? resolvedAccount;
	if (!installationId || !repositoryId || !approvedInstallationAccount(account))
		return { status: "ignored" as const, targets: [] };
	let terminalTransition = false;
	let changed = false;
	const mergeabilityUsers = new Set<string>();
	const targets = new Map<string, ReconciliationTarget>();
	const users = await db.users
		.find(
			{ "installations.installationId": installationId },
			{ projection: { _id: 1 } },
		)
		.toArray();
	for (const user of users)
		await mutateUser(db, user._id, (aggregate) => {
			const before = JSON.stringify(aggregate);
			const result = applyGitHubEvent(
				aggregate,
				installationId,
				repositoryId,
				account,
				event,
				data,
				reviewBot,
			);
			terminalTransition ||= result.terminalTransition;
			if (result.mergeabilityChanged) mergeabilityUsers.add(aggregate._id);
			changed ||= before !== JSON.stringify(aggregate);
			const repository = aggregate.installations
				.find((item) => item.installationId === installationId)
				?.repositories.find((item) => item.repositoryId === repositoryId);
			for (const target of repository
				? lifecycleTargets(installationId, repository, event, data)
				: [])
				targets.set(`${target.repositoryId}:${target.number}`, target);
		});
	if (event === "push" && fetchTasks)
		changed ||= await projectPush(
			db,
			data,
			installationId,
			repositoryId,
			account,
			fetchTasks,
		);
	await notifyProjectionChanges(
		db,
		event,
		data,
		installationId,
		repositoryId,
		account,
		terminalTransition,
		mergeabilityUsers,
	);
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
		status:
			lifecycleHint && !targets.size ? ("ignored" as const) : ("done" as const),
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
			reason:
				| "missing_binding"
				| "ambiguous_binding"
				| "conflicting_account"
				| "verification_unavailable";
	  };

const verifyGitHubDelivery = async (
	db: Db,
	raw: string,
): Promise<Verification> => {
	let data: GitHubPayload;
	try {
		data = JSON.parse(raw);
	} catch {
		return { kind: "pending", reason: "verification_unavailable" };
	}
	const installationId = id(data.installation?.id);
	const repositoryId = id(data.repository?.id);
	if (!installationId || !repositoryId)
		return { kind: "pending", reason: "missing_binding" };
	try {
		const users = await db.users
			.find(
				{ "installations.installationId": installationId },
				{ projection: { installations: 1 } },
			)
			.toArray();
		const accounts = [
			...new Set(
				users.flatMap((user) =>
					user.installations
						.filter(
							(item) =>
								item.installationId === installationId &&
								approvedInstallationAccount(item.accountLogin),
						)
						.map((item) => normalizedLogin(item.accountLogin))
						.filter((account): account is string => Boolean(account)),
				),
			),
		];
		if (!accounts.length) return { kind: "pending", reason: "missing_binding" };
		if (accounts.length !== 1)
			return { kind: "pending", reason: "ambiguous_binding" };
		const account = data.installation?.account?.login;
		if (account && !sameLogin(account, accounts[0]))
			return { kind: "pending", reason: "conflicting_account" };
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
	const rows = await db.inboxDeliveries
		.find({ provider: "github", status: "pending_verification" })
		.toArray();
	const ids = rows.flatMap((row) => {
		try {
			const data = JSON.parse(row.payload ?? "{}") as GitHubPayload;
			return String(data.installation?.id ?? "") === installationId &&
				["pull_request", "deployment", "deployment_status"].includes(
					row.eventName,
				) &&
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
	}) => Promise<string | null>,
	reviewBot?: ReviewBotConfig,
	sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
	now = () => new Date(),
	enqueueTarget?: (target: ReconciliationTarget) => void,
) {
	const affected = new Set<string>();
	while (true) {
		const current = now(),
			rows = await db.inboxDeliveries
				.find({
					status: { $in: ["pending", "pending_verification"] },
					$or: [
						{ nextAttemptAt: { $exists: false } },
						{ nextAttemptAt: { $lte: current } },
					],
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
								verificationFirstAttemptAt:
									row.verificationFirstAttemptAt ?? attemptedAt,
								verificationLastAttemptAt: attemptedAt,
								nextAttemptAt: new Date(
									attemptedAt.getTime() +
										(attempts <= 2 ? 1000 * 2 ** (attempts - 1) : 60_000),
								),
							},
						},
					);
					continue;
				}
				await db.inboxDeliveries.updateOne(
					{ _id: row._id },
					{ $set: { resolvedAccount: verification.account } },
				);
				const projection = await projectGitHub(
					db,
					row.eventName,
					verification.raw,
					verification.account,
					fetchTasks,
					reviewBot,
				);
				const installationId = verification.installationId;
				if (projection.changed && installationId)
					(
						await db.users
							.find(
								{ "installations.installationId": installationId },
								{ projection: { _id: 1 } },
							)
							.toArray()
					).forEach((user) => {
						affected.add(user._id);
					});
				await db.inboxDeliveries.updateOne(
					{ _id: row._id },
					{
						$set: {
							status: projection.status === "ignored" ? "ignored" : "done",
							processedAt: now(),
							resolvedAt: now(),
							resolvedBy:
								projection.status === "ignored"
									? "recorded_noop"
									: "projection",
						},
						$unset: { payload: "", error: "", nextAttemptAt: "" },
					},
				);
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
								verificationFirstAttemptAt:
									row.verificationFirstAttemptAt ?? attemptedAt,
								verificationLastAttemptAt: attemptedAt,
								nextAttemptAt: new Date(
									attemptedAt.getTime() +
										(attempts <= 2 ? 1000 * 2 ** (attempts - 1) : 60_000),
								),
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
							error:
								error instanceof Error
									? error.message.slice(0, 200)
									: "processing failed",
							...(terminal
								? { processedAt: now() }
								: {
										nextAttemptAt: new Date(
											now().getTime() + 1000 * 2 ** (attempts - 1),
										),
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
		if (
			!next?.nextAttemptAt ||
			(next.status === "pending_verification" && next.attempts >= 3)
		)
			break;
		await sleep(Math.max(0, next.nextAttemptAt.getTime() - now().getTime()));
	}
	return [...affected];
}
