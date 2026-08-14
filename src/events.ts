import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ReviewBotConfig } from "./config";
import type { Db } from "./db";
import { mutateUser } from "./db";
import { shouldApplyDeploymentStatus } from "./deployment-status";
import { approvedInstallationAccount, sameLogin } from "./installations";
import { changedTaskPaths, projectOpenSpec } from "./openspec";

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
	let account: unknown;
	try {
		account = JSON.parse(body)?.installation?.account?.login;
	} catch {
		return false;
	}
	if (!approvedInstallationAccount(account)) return false;
	try {
		await db.inboxDeliveries.insertOne({
			_id: `github:${deliveryId}`,
			provider: "github",
			deliveryId,
			payload: body,
			eventName,
			status: "pending",
			attempts: 0,
			receivedAt: new Date(),
		});
		return true;
	} catch (error) {
		if ((error as { code?: number }).code === 11000) return false;
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
const branch = (value: unknown) =>
	typeof value === "string" &&
	value.length <= 255 &&
	/^[A-Za-z0-9._/-]+$/.test(value) &&
	!value.includes("..")
		? value
		: undefined;
type GitHubPayload = Record<string, any>;
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
	if (
		data.action === "closed" ||
		pr.state !== "open" ||
		!sameLogin(pr.user?.login, userLogin)
	) {
		if (index >= 0) repository.pullRequests.splice(index, 1);
		return false;
	}
	const previous = index >= 0 ? repository.pullRequests[index] : undefined;
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
	if (event === "workflow_run")
		target.workflow_state =
			data.workflow_run?.conclusion ?? data.workflow_run?.status ?? "pending";
};

const projectBotReview = (
	repository: import("./db").Repository,
	data: GitHubPayload,
	reviewBot?: ReviewBotConfig,
) => {
	if (
		!["created", "edited"].includes(String(data.action)) ||
		!reviewBot ||
		!data.issue?.pull_request
	)
		return;
	const target = repository.pullRequests.find(
		(item) => item.number === Number(data.issue.number),
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
	const next = {
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
		updated_at:
			statusCreatedAt ??
			prior.updated_at ??
			data.deployment.created_at ??
			new Date().toISOString(),
	};
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
	const repository = ensureRepository(
		installation,
		repositoryId,
		data.repository?.full_name,
	);
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
	const commits = Array.isArray(data.commits) ? data.commits : [];
	const files = commits.flatMap((commit: GitHubPayload) => [
		...(commit.added ?? []),
		...(commit.modified ?? []),
		...(commit.removed ?? []),
	]);
	const sourceRef = data.ref?.startsWith("refs/heads/")
		? branch(data.ref.slice(11))
		: undefined;
	for (const path of changedTaskPaths(files)) {
		const deleted = commits.some((commit: GitHubPayload) =>
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
		const completed = await projectOpenSpec(db, {
			installationId,
			accountLogin: account,
			repositoryId,
			path,
			content: content ?? "",
			deleted,
			sha: data.after ?? "unknown",
			sourceRef,
		});
		if (completed)
			await notifyBoundUsers(
				db,
				installationId,
				account,
				`openspec-complete:${repositoryId}:${path}:${data.after}`,
				"OpenSpec complete",
				path.split("/")[2] ?? "OpenSpec",
			);
	}
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
	if (event === "deployment_status" && terminalTransition)
		await notifyBoundUsers(
			db,
			installationId,
			account,
			`github-deployment:${repositoryId}:${data.deployment?.id}:${String(data.deployment_status.state).toLowerCase()}`,
			`Deployment ${String(data.deployment_status.state).toLowerCase()}`,
			data.repository?.full_name ?? "Repository",
		);
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
	fetchTasks?: TaskFetcher,
	reviewBot?: ReviewBotConfig,
) {
	const data = JSON.parse(raw) as GitHubPayload;
	const installationId = id(data.installation?.id);
	const repositoryId = id(data.repository?.id);
	const account = data.installation?.account?.login;
	if (!installationId || !repositoryId || !approvedInstallationAccount(account))
		return "ignored";
	let terminalTransition = false;
	const mergeabilityUsers = new Set<string>();
	const users = await db.users
		.find(
			{ "installations.installationId": installationId },
			{ projection: { _id: 1 } },
		)
		.toArray();
	for (const user of users)
		await mutateUser(db, user._id, (aggregate) => {
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
		});
	if (event === "push" && fetchTasks)
		await projectPush(
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
	return "done";
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
				const status = await projectGitHub(
					db,
					row.eventName,
					row.payload ?? "",
					fetchTasks,
					reviewBot,
				);
				const installationId = id(
					JSON.parse(row.payload ?? "{}").installation?.id,
				);
				if (installationId)
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
							status: status === "ignored" ? "ignored" : "done",
							processedAt: now(),
						},
						$unset: { payload: "", error: "", nextAttemptAt: "" },
					},
				);
			} catch (error) {
				const attempts = row.attempts + 1,
					terminal = attempts >= 3;
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
		if (!next?.nextAttemptAt) break;
		await sleep(Math.max(0, next.nextAttemptAt.getTime() - now().getTime()));
	}
	return [...affected];
}
