import { createSign } from "node:crypto";
import type {
	Db,
	MergedPullRequestEvidence,
	ReconciliationEvidence,
} from "#/db";
import {
	appendReconciliationEvidence,
	correlateDeploymentPullRequest,
	mutateUser,
	retainRecentMergedPullRequests,
} from "#/db";
import { latestDeploymentStatus } from "#/deployment-status";
import { approvedInstallationAccount, sameLogin } from "#/installations";
import { projectOpenSpec } from "#/openspec";

type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;
export type TaskFetcher = (input: {
	installationId: string;
	repositoryId: string;
	path: string;
	sha: string;
}) => Promise<string | null>;
export type GitHubRequestFailure = {
	operation: string;
	status: number;
	target: string;
	diagnostic?: {
		message?: string;
		documentationUrl?: string;
		errors?: Array<{ resource?: string; field?: string; code?: string }>;
	};
};
export type GitHubRequestFailureReporter = (
	failure: GitHubRequestFailure,
) => void | Promise<void>;
export type ReadResult =
	| { kind: "changed"; body: unknown }
	| { kind: "unchanged" }
	| {
			kind: "error";
			message: string;
			stale: true;
			operation?: string;
			summary?: string;
			repository?: string;
			status?: number;
	  };
type OpenSpecTask = {
	repositoryId: string;
	path: string;
	sha: string;
	content: string;
};
type GraphqlConnection = {
	nodes?: unknown[];
	pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};
const graphqlEndpoint = "https://api.github.com/graphql";
const providerFailedState = (value: unknown) =>
	[
		"action_required",
		"cancelled",
		"canceled",
		"failed",
		"failure",
		"timed_out",
	].includes(String(value).toLowerCase());
const optionalString = (value: unknown) =>
	typeof value === "string" ? value : undefined;
const base64url = (value: string | Buffer) =>
	Buffer.from(value).toString("base64url");
const diagnosticString = (value: unknown) =>
	typeof value === "string" ? value.slice(0, 200) : undefined;
export async function githubErrorDiagnostic(response: Response) {
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		return undefined;
	}
	if (!body || typeof body !== "object") return undefined;
	const value = body as Record<string, unknown>;
	const errors = Array.isArray(value.errors)
		? value.errors
				.map((error) => {
					if (!error || typeof error !== "object") return undefined;
					const item = error as Record<string, unknown>;
					const selected = {
						resource: diagnosticString(item.resource),
						field: diagnosticString(item.field),
						code: diagnosticString(item.code),
					};
					return Object.values(selected).some(Boolean) ? selected : undefined;
				})
				.filter((error): error is NonNullable<typeof error> => Boolean(error))
				.slice(0, 5)
		: undefined;
	const diagnostic = {
		message: diagnosticString(value.message),
		documentationUrl: diagnosticString(value.documentation_url),
		errors: errors?.length ? errors : undefined,
	};
	return Object.values(diagnostic).some(Boolean) ? diagnostic : undefined;
}
export function githubAppJwt(
	appId: string,
	privateKey: string,
	now = Math.floor(Date.now() / 1000),
) {
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
		payload = base64url(
			JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
		),
		signer = createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	signer.end();
	return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}
export async function installationToken(
	appJwt: string,
	installationId: string,
	fetcher: FetchLike = fetch,
) {
	const response = await fetcher(
		`https://api.github.com/app/installations/${installationId}/access_tokens`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${appJwt}`,
				accept: "application/vnd.github+json",
			},
		},
	);
	if (!response.ok)
		throw new Error(
			`GitHub installation token request failed (${response.status})`,
		);
	return ((await response.json()) as { token: string }).token;
}
export const retryDelay = (
	response: Response,
	attempt: number,
	now = Date.now(),
) => {
	const retryable =
		[429, 502, 503, 504].includes(response.status) ||
		(response.status === 403 &&
			response.headers.get("x-ratelimit-remaining") === "0");
	if (!retryable) return undefined;
	const retryAfter = Number(response.headers.get("retry-after"));
	if (retryAfter > 0) return Math.min(retryAfter * 1000, 60_000);
	const reset = Number(response.headers.get("x-ratelimit-reset"));
	if (reset * 1000 > now) return Math.min(reset * 1000 - now, 60_000);
	return Math.min(1000 * 2 ** attempt, 60_000);
};
async function githubGraphql(
	token: string,
	query: string,
	variables: Record<string, unknown>,
	fetcher: FetchLike,
) {
	let response: Response | undefined;
	for (let attempt = 0; attempt < 3; attempt++) {
		response = await fetcher(graphqlEndpoint, {
			method: "POST",
			headers: {
				authorization: `Bearer ${token}`,
				accept: "application/vnd.github+json",
				"content-type": "application/json",
			},
			body: JSON.stringify({ query, variables }),
		});
		const delay = retryDelay(response, attempt);
		if (delay === undefined || attempt === 2) break;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
	if (!response?.ok) throw new Error("GitHub GraphQL request failed");
	const body: unknown = await response.json();
	if (
		!body ||
		typeof body !== "object" ||
		Array.isArray((body as { errors?: unknown }).errors) ||
		!(body as { data?: unknown }).data
	)
		throw new Error("GitHub GraphQL response was incomplete");
	return (body as { data: Record<string, unknown> }).data;
}
const safeUrl = (value: unknown) =>
	URL.canParse(String(value)) &&
	["http:", "https:"].includes(new URL(String(value)).protocol)
		? new URL(String(value)).toString()
		: undefined;
const nextLink = (header: string | null) =>
	header
		?.split(",")
		.map((value) => value.trim().match(/^<([^>]+)>;\s*rel="next"$/))
		.find(Boolean)?.[1];
export function githubNextLink(header: string | null, seen: Set<string>) {
	const value = nextLink(header);
	if (!value) return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("GitHub pagination link was invalid");
	}
	if (url.origin !== "https://api.github.com")
		throw new Error("GitHub pagination link was not GitHub API");
	const next = url.toString();
	if (seen.has(next)) throw new Error("GitHub pagination loop detected");
	seen.add(next);
	return next;
}
async function pagedGet(
	db: Db,
	key: string,
	url: string,
	fetcher: FetchLike,
	evidence: Pick<ReconciliationEvidence, "operation" | "repository"> = {
		operation: "unknown",
	},
	collectionKey?: string,
): Promise<ReadResult> {
	const all: unknown[] = [],
		seen = new Set([url]);
	let next: string | undefined = url,
		pageNumber = 0;
	while (next) {
		const pageKey = `${key}:page:${pageNumber++}`,
			cached = await db.providerCache.findOne({ _id: pageKey });
		let response: Response | undefined;
		for (let attempt = 0; attempt < 3; attempt++) {
			response = await fetcher(next, {
				headers: cached?.etag
					? {
							accept: "application/vnd.github+json",
							"if-none-match": cached.etag,
						}
					: { accept: "application/vnd.github+json" },
			});
			const delay = retryDelay(response, attempt);
			if (delay === undefined || attempt === 2) break;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
		if (!response || (!response.ok && response.status !== 304))
			return {
				kind: "error",
				message: `GitHub request failed (${response?.status ?? "unknown"})`,
				stale: true,
				...evidence,
				summary: "GitHub request failed",
				status: response?.status,
			};
		const page = response.status === 304 ? cached?.body : await response.json();
		if (page === undefined)
			return {
				kind: "error",
				message: "GitHub cached page is unavailable",
				stale: true,
				...evidence,
				summary: "GitHub cached page is unavailable",
			};
		const items = Array.isArray(page)
			? page
			: Array.isArray((page as any).repositories)
				? (page as any).repositories
				: collectionKey && Array.isArray((page as any)[collectionKey])
					? (page as any)[collectionKey]
					: undefined;
		if (!items)
			return {
				kind: "error",
				message: "GitHub pagination payload was invalid",
				stale: true,
				...evidence,
				summary: "GitHub pagination payload was invalid",
			};
		let following: string | undefined;
		try {
			following =
				response.status === 304
					? cached?.nextUrl
						? githubNextLink(`<${cached.nextUrl}>; rel="next"`, seen)
						: undefined
					: githubNextLink(response.headers.get("link"), seen);
		} catch (error) {
			return {
				kind: "error",
				message:
					error instanceof Error ? error.message : "GitHub pagination failed",
				stale: true,
				...evidence,
				summary: "GitHub pagination failed",
			};
		}
		if (response.status !== 304)
			await db.providerCache.updateOne(
				{ _id: pageKey },
				{
					$set: {
						etag: response.headers.get("etag") ?? undefined,
						body: page,
						nextUrl: following,
						updatedAt: new Date(),
					},
				},
				{ upsert: true },
			);
		all.push(...items);
		next = following;
	}
	await db.providerCache.updateOne(
		{ _id: key },
		{ $set: { body: all, updatedAt: new Date() } },
		{ upsert: true },
	);
	return { kind: "changed", body: all };
}
export async function conditionalGet(
	db: Db,
	key: string,
	url: string,
	fetcher: FetchLike = fetch,
	evidence: Pick<ReconciliationEvidence, "operation" | "repository"> = {
		operation: "unknown",
	},
): Promise<ReadResult> {
	const cached = await db.providerCache.findOne({ _id: key });
	let response: Response | undefined;
	for (let attempt = 0; attempt < 3; attempt++) {
		response = await fetcher(url, {
			headers: cached?.etag
				? {
						"if-none-match": cached.etag,
						accept: "application/vnd.github+json",
					}
				: { accept: "application/vnd.github+json" },
		});
		const delay = retryDelay(response, attempt);
		if (delay === undefined || attempt === 2) break;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
	if (!response)
		return {
			kind: "error",
			message: "GitHub request failed",
			stale: true,
			...evidence,
			summary: "GitHub request failed",
		};
	if (response.status === 304) {
		await db.providerCache.updateOne(
			{ _id: key },
			{ $set: { updatedAt: new Date() } },
		);
		return cached?.body === undefined
			? {
					kind: "error",
					message: "GitHub cached response is unavailable",
					stale: true,
					...evidence,
					summary: "GitHub cached response is unavailable",
				}
			: { kind: "changed", body: cached.body };
	}
	if (!response.ok)
		return {
			kind: "error",
			message: `GitHub request failed (${response.status})`,
			stale: true,
			...evidence,
			summary: "GitHub request failed",
			status: response.status,
		};
	const body = await response.json();
	await db.providerCache.updateOne(
		{ _id: key },
		{
			$set: {
				etag: response.headers.get("etag") ?? undefined,
				body,
				updatedAt: new Date(),
			},
		},
		{ upsert: true },
	);
	return { kind: "changed", body };
}
export async function reconcileSerial(
	db: Db,
	keys: string[],
	fetcher: FetchLike,
	sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
	const results: ReadResult[] = [];
	for (const key of keys) {
		let result: ReadResult = {
			kind: "error",
			message: "not requested",
			stale: true,
		};
		for (let attempt = 0; attempt < 3; attempt++) {
			result = await conditionalGet(db, key, key, fetcher);
			if (result.kind !== "error" || attempt === 2) break;
			await sleep(1000 * 2 ** attempt);
		}
		results.push(result);
	}
	return results;
}
async function fetchOpenSpecTasksForPullRequests(
	db: Db,
	installationId: string,
	repositoryId: string,
	pullRequests: any[],
	request: FetchLike,
	taskFetcher: TaskFetcher,
	repository?: string,
): Promise<OpenSpecTask[] | ReadResult> {
	const tasks: OpenSpecTask[] = [];
	for (const pr of [...pullRequests].sort((a, b) => {
		const aUpdatedAt = Date.parse(a.updated_at),
			bUpdatedAt = Date.parse(b.updated_at),
			aHasValidUpdatedAt = Number.isFinite(aUpdatedAt),
			bHasValidUpdatedAt = Number.isFinite(bUpdatedAt);
		if (aHasValidUpdatedAt !== bHasValidUpdatedAt)
			return Number(bHasValidUpdatedAt) - Number(aHasValidUpdatedAt);
		return (
			bUpdatedAt - aUpdatedAt ||
			Number(a.number) - Number(b.number) ||
			String(a.head?.sha ?? "").localeCompare(String(b.head?.sha ?? ""))
		);
	})) {
		const sha = typeof pr.head?.sha === "string" ? pr.head.sha : undefined;
		if (!sha) continue;
		const changes = await conditionalGet(
			db,
			`installation:${installationId}:repo:${repositoryId}:openspec:${sha}`,
			`https://api.github.com/repositories/${repositoryId}/contents/openspec/changes?ref=${sha}`,
			async (url, init) => {
				const response = await request(url, init);
				return response.status === 404 ? Response.json([]) : response;
			},
			{ operation: "openspec", repository },
		);
		if (changes.kind === "unchanged" || changes.kind === "error")
			return changes;
		if (!Array.isArray(changes.body))
			return {
				kind: "error",
				stale: true,
				message: "GitHub OpenSpec listing payload was invalid",
				operation: "openspec",
				repository,
				summary: "GitHub OpenSpec listing payload was invalid",
			};
		for (const change of changes.body) {
			const name = (change as any)?.name;
			if (
				(change as any)?.type !== "dir" ||
				name === "archive" ||
				!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)
			)
				continue;
			const path = `openspec/changes/${name}/tasks.md`;
			const content = await taskFetcher({
				installationId,
				repositoryId,
				path,
				sha,
			});
			if (content === null)
				return {
					kind: "error",
					stale: true,
					message: "GitHub OpenSpec artifact fetch failed",
					operation: "openspec",
					repository,
					summary: "GitHub OpenSpec artifact fetch failed",
				};
			tasks.push({ repositoryId, path, sha, content });
		}
	}
	const changes = new Set<string>();
	return tasks.filter((task) => {
		const key = `${task.repositoryId}:${task.path.split("/")[2]}`;
		if (changes.has(key)) return false;
		changes.add(key);
		return true;
	});
}

async function refreshRepositoryPolicy(
	db: Db,
	installationId: string,
	repository: { repositoryId: string; full_name: string; policy?: unknown },
	request: FetchLike,
) {
	const evidence = {
		operation: "repository_policy",
		repository: repository.full_name,
	};
	const details = await conditionalGet(
		db,
		`installation:${installationId}:repo:${repository.repositoryId}:details`,
		`https://api.github.com/repos/${repository.full_name}`,
		request,
		evidence,
	);
	const branch =
		details.kind === "changed"
			? (details.body as any)?.default_branch
			: undefined;
	if (typeof branch !== "string" || !branch)
		return {
			policy: repository.policy && {
				...(repository.policy as Record<string, unknown>),
				stale: true,
			},
			stale: true,
		};
	const encoded = encodeURIComponent(branch);
	const [rules, protection] = await Promise.all([
		conditionalGet(
			db,
			`installation:${installationId}:repo:${repository.repositoryId}:rules:${branch}`,
			`https://api.github.com/repos/${repository.full_name}/rules/branches/${encoded}`,
			request,
			evidence,
		),
		conditionalGet(
			db,
			`installation:${installationId}:repo:${repository.repositoryId}:protection:${branch}`,
			`https://api.github.com/repos/${repository.full_name}/branches/${encoded}/protection`,
			request,
			evidence,
		),
	]);
	if (
		rules.kind !== "changed" ||
		(protection.kind === "error" && protection.status !== 404)
	)
		return {
			policy: repository.policy && {
				...(repository.policy as Record<string, unknown>),
				stale: true,
			},
			stale: true,
		};
	if (!Array.isArray(rules.body))
		return {
			policy: repository.policy && {
				...(repository.policy as Record<string, unknown>),
				stale: true,
			},
			stale: true,
		};
	const required = new Map<
		string,
		{ context: string; integration_id?: string }
	>();
	for (const rule of rules.body as any[])
		for (const parameter of rule?.rules ?? [])
			if (parameter?.type === "required_status_checks")
				for (const check of parameter?.parameters?.required_status_checks ??
					[]) {
					const context = optionalString(check?.context);
					if (context)
						required.set(`${context}:${check.integration_id ?? ""}`, {
							context,
							...(check.integration_id == null
								? {}
								: { integration_id: String(check.integration_id) }),
						});
				}
	const classic =
		protection.kind === "changed"
			? (protection.body as any)?.required_status_checks
			: undefined;
	for (const check of classic?.checks ?? []) {
		const context = optionalString(check?.context);
		if (context)
			required.set(`${context}:${check.app_id ?? ""}`, {
				context,
				...(check.app_id == null
					? {}
					: { integration_id: String(check.app_id) }),
			});
	}
	for (const context of classic?.contexts ?? [])
		if (typeof context === "string") required.set(`${context}:`, { context });
	return {
		policy: {
			refreshed_at: new Date().toISOString(),
			required_checks: [...required.values()],
		},
		stale: false,
	};
}

const pullRequestLifecycleQuery = `query PullRequestLifecycle($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      state merged isDraft createdAt updatedAt title url headRefName headRefOid mergeable reviewDecision
      labels(first: 100) { nodes { name } pageInfo { hasNextPage endCursor } }
      reviewRequests(first: 100) { totalCount }
      reviews(first: 100) { nodes { state } pageInfo { hasNextPage endCursor } }
      reviewThreads(first: 100) { nodes { isResolved } pageInfo { hasNextPage endCursor } }
      statusCheckRollup { contexts(first: 100) { nodes { ... on CheckRun { name status conclusion detailsUrl checkSuite { app { databaseId } } } ... on StatusContext { context state targetUrl } } pageInfo { hasNextPage endCursor } }
    }
  }
}`;

const graphqlConnectionQuery = (
	field: "labels" | "reviews" | "reviewThreads" | "contexts",
) =>
	`query PullRequestConnection($owner: String!, $repo: String!, $number: Int!, $after: String!) {
  repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
    ${field === "contexts" ? "statusCheckRollup { contexts" : field}(first: 100, after: $after) { nodes { ${
			field === "labels"
				? "name"
				: field === "reviews"
					? "state"
					: field === "reviewThreads"
						? "isResolved"
						: "... on CheckRun { name status conclusion detailsUrl checkSuite { app { databaseId } } } ... on StatusContext { context state targetUrl }"
		} } pageInfo { hasNextPage endCursor } }${field === "contexts" ? " }" : ""}
  } }
}`;

function graphqlConnection(value: unknown): GraphqlConnection {
	if (!value || typeof value !== "object")
		throw new Error("GitHub pull request pagination was incomplete");
	const connection = value as GraphqlConnection;
	if (
		!Array.isArray(connection.nodes) ||
		!connection.pageInfo ||
		typeof connection.pageInfo.hasNextPage !== "boolean"
	)
		throw new Error("GitHub pull request pagination was incomplete");
	if (
		connection.pageInfo.hasNextPage &&
		typeof connection.pageInfo.endCursor !== "string"
	)
		throw new Error("GitHub pull request pagination was incomplete");
	return connection;
}

async function completeGraphqlConnection(
	token: string,
	fetcher: FetchLike,
	owner: string,
	repo: string,
	number: number,
	field: "labels" | "reviews" | "reviewThreads" | "contexts",
	initial: unknown,
) {
	const nodes = [...graphqlConnection(initial).nodes!];
	let page = graphqlConnection(initial);
	while (page.pageInfo!.hasNextPage) {
		const data = await githubGraphql(
			token,
			graphqlConnectionQuery(field),
			{
				owner,
				repo,
				number,
				after: page.pageInfo!.endCursor,
			},
			fetcher,
		);
		const pullRequest = (data.repository as any)?.pullRequest;
		page = graphqlConnection(
			field === "contexts"
				? pullRequest?.statusCheckRollup?.contexts
				: pullRequest?.[field],
		);
		nodes.push(...page.nodes!);
	}
	return nodes;
}

type ReconcilePullRequestInput = {
	installationId: string;
	repositoryId: string;
	number: number;
	token: string;
	fetcher: FetchLike;
	fetchTasks?: TaskFetcher;
};
type PullRequestRead = {
	pullRequest: Record<string, unknown>;
	headSha: string;
	labels: unknown[];
	reviews: unknown[];
	threads: unknown[];
	contexts: unknown[];
	actions: unknown[];
	tasks: OpenSpecTask[];
};

const loadReconciliationTarget = async (
	db: Db,
	input: ReconcilePullRequestInput,
) => {
	const users = await db.users
		.find(
			{ "installations.installationId": input.installationId },
			{ projection: { _id: 1, installations: 1 } },
		)
		.toArray();
	const installation = users
		.flatMap((user) => user.installations)
		.find(
			(installation) =>
				installation.installationId === input.installationId &&
				approvedInstallationAccount(installation.accountLogin),
		);
	return {
		users,
		installation,
		repository: installation?.repositories.find(
			(item) => item.repositoryId === input.repositoryId,
		),
	};
};

const removeClosedPullRequest = async (
	db: Db,
	users: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	input: ReconcilePullRequestInput,
): Promise<ReadResult> => {
	await Promise.all(
		users.map((user) =>
			mutateUser(db, user._id, (aggregate) => {
				const target = aggregate.installations
					.find((item) => item.installationId === input.installationId)
					?.repositories.find(
						(item) => item.repositoryId === input.repositoryId,
					);
				if (target)
					target.pullRequests = target.pullRequests.filter(
						(item) => Number(item.number) !== input.number,
					);
			}),
		),
	);
	return { kind: "changed", body: null };
};

const readOpenPullRequest = async (
	db: Db,
	input: ReconcilePullRequestInput,
	request: FetchLike,
	owner: string,
	name: string,
	repository: NonNullable<
		Awaited<ReturnType<typeof loadReconciliationTarget>>["repository"]
	>,
): Promise<PullRequestRead | undefined> => {
	const data = await githubGraphql(
		input.token,
		pullRequestLifecycleQuery,
		{ owner, repo: name, number: input.number },
		input.fetcher,
	);
	const pullRequest = (
		data.repository as { pullRequest?: Record<string, unknown> } | undefined
	)?.pullRequest;
	if (!pullRequest || typeof pullRequest !== "object")
		throw new Error("GitHub pull request response was incomplete");
	if (
		["CLOSED", "MERGED"].includes(String(pullRequest.state)) ||
		pullRequest.merged === true
	)
		return undefined;
	if (
		!pullRequest.reviewRequests ||
		typeof (pullRequest.reviewRequests as any).totalCount !== "number"
	)
		throw new Error("GitHub pull request response was incomplete");
	const headSha =
		typeof pullRequest.headRefOid === "string"
			? pullRequest.headRefOid
			: undefined;
	if (!headSha) throw new Error("GitHub pull request head was unavailable");
	const [labels, reviews, threads, contexts] = await Promise.all([
		completeGraphqlConnection(
			input.token,
			input.fetcher,
			owner,
			name,
			input.number,
			"labels",
			pullRequest.labels,
		),
		completeGraphqlConnection(
			input.token,
			input.fetcher,
			owner,
			name,
			input.number,
			"reviews",
			pullRequest.reviews,
		),
		completeGraphqlConnection(
			input.token,
			input.fetcher,
			owner,
			name,
			input.number,
			"reviewThreads",
			pullRequest.reviewThreads,
		),
		pullRequest.statusCheckRollup === null
			? Promise.resolve([])
			: completeGraphqlConnection(
					input.token,
					input.fetcher,
					owner,
					name,
					input.number,
					"contexts",
					(pullRequest.statusCheckRollup as any)?.contexts,
				),
	]);
	const actions = await pagedGet(
		db,
		"installation:" +
			input.installationId +
			":repo:" +
			input.repositoryId +
			":actions:" +
			headSha,
		"https://api.github.com/repositories/" +
			input.repositoryId +
			"/actions/runs?head_sha=" +
			headSha +
			"&per_page=100",
		request,
		{ operation: "actions", repository: repository.full_name },
		"workflow_runs",
	);
	if (actions.kind !== "changed" || !Array.isArray(actions.body))
		throw new Error("GitHub Actions response was incomplete");
	const taskFetcher =
		input.fetchTasks ??
		(async (task: Parameters<TaskFetcher>[0]) => {
			const response = await request(
				"https://api.github.com/repositories/" +
					task.repositoryId +
					"/contents/" +
					task.path +
					"?ref=" +
					task.sha,
				{ headers: { accept: "application/vnd.github.raw" } },
			);
			return response.ok ? response.text() : null;
		});
	const tasks = await fetchOpenSpecTasksForPullRequests(
		db,
		input.installationId,
		input.repositoryId,
		[
			{
				number: input.number,
				head: { sha: headSha },
				updated_at: pullRequest.updatedAt,
			},
		],
		request,
		taskFetcher,
		repository.full_name,
	);
	if (!Array.isArray(tasks))
		throw new Error("GitHub OpenSpec read was incomplete");
	if (
		!labels.every((item: any) => item && typeof item.name === "string") ||
		!reviews.every((item: any) => item && typeof item.state === "string") ||
		!threads.every(
			(item: any) => item && typeof item.isResolved === "boolean",
		) ||
		!contexts.every(
			(item: any) =>
				item &&
				(typeof item.name === "string" || typeof item.context === "string"),
		)
	)
		throw new Error("GitHub pull request response was incomplete");
	return {
		pullRequest,
		headSha,
		labels,
		reviews,
		threads,
		contexts,
		actions: actions.body,
		tasks,
	};
};

const applyOpenPullRequest = async (
	db: Db,
	users: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	installation: Awaited<
		ReturnType<typeof loadReconciliationTarget>
	>["installation"],
	repository: NonNullable<
		Awaited<ReturnType<typeof loadReconciliationTarget>>["repository"]
	>,
	input: ReconcilePullRequestInput,
	read: PullRequestRead,
): Promise<ReadResult> => {
	const {
		pullRequest,
		headSha,
		labels,
		reviews,
		threads,
		contexts,
		actions,
		tasks,
	} = read;
	const reviewNodes = reviews as Array<{ state: string }>;
	const threadNodes = threads as Array<{ isResolved: boolean }>;
	const policy = repository.policy as
		| {
				required_checks?: Array<{
					context?: string;
					integration_id?: string;
				}>;
				stale?: boolean;
		  }
		| undefined;
	const requiredChecks = (policy?.required_checks ?? []).map((required) => {
		const context = contexts.find(
			(item: any) =>
				[item?.name, item?.context].includes(required.context) &&
				(!required.integration_id ||
					String(required.integration_id) ===
						String(item?.checkSuite?.app?.databaseId)),
		);
		const conclusion = (context as any)?.conclusion ?? (context as any)?.state;
		return {
			head_sha: headSha,
			conclusion:
				context &&
				["success", "neutral", "skipped"].includes(
					String(conclusion).toLowerCase(),
				)
					? String(conclusion).toLowerCase()
					: "missing",
		};
	});
	const next = {
		number: input.number,
		title: optionalString(pullRequest.title),
		url: optionalString(pullRequest.url),
		state: "open",
		draft: pullRequest.isDraft ? 1 : 0,
		opened_at: optionalString(pullRequest.createdAt),
		updated_at: optionalString(pullRequest.updatedAt),
		head_ref: optionalString(pullRequest.headRefName),
		head_sha: headSha,
		mergeable:
			pullRequest.mergeable === "MERGEABLE"
				? "clean"
				: pullRequest.mergeable === "CONFLICTING"
					? "conflicting"
					: "unknown",
		labels,
		review_activity:
			Number((pullRequest.reviewRequests as any).totalCount) > 0 ||
			reviewNodes.some((review) =>
				["APPROVED", "COMMENTED", "CHANGES_REQUESTED"].includes(
					String(review.state),
				),
			),
		completed_review_count: reviewNodes.filter((review) =>
			["APPROVED", "COMMENTED", "CHANGES_REQUESTED"].includes(
				String(review.state),
			),
		).length,
		unresolved_review_threads: threadNodes.filter(
			(thread) => !thread.isResolved,
		).length,
		changes_requested: pullRequest.reviewDecision === "CHANGES_REQUESTED",
		repository_policy_loaded: Boolean(policy && !policy.stale),
		required_checks: requiredChecks,
		workflow_state: actions.some((run: any) =>
			providerFailedState(run.conclusion ?? run.status),
		)
			? "failure"
			: "success",
		checks_state: contexts.some((context: any) =>
			providerFailedState(context?.conclusion ?? context?.state),
		)
			? "failure"
			: "success",
	};
	await Promise.all(
		users.map((user) =>
			mutateUser(db, user._id, (aggregate) => {
				const target = aggregate.installations
					.find((item) => item.installationId === input.installationId)
					?.repositories.find(
						(item) => item.repositoryId === input.repositoryId,
					);
				const previous = target?.pullRequests.find(
					(item) => Number(item.number) === input.number,
				);
				if (
					!target ||
					(previous?.updated_at &&
						String(previous.updated_at) > String(next.updated_at)) ||
					(previous?.head_sha &&
						previous.head_sha !== next.head_sha &&
						String(previous.updated_at ?? "") >= String(next.updated_at ?? ""))
				)
					return;
				if (previous) Object.assign(previous, next, { lifecycle_stale: false });
				else target.pullRequests.push({ ...next, lifecycle_stale: false });
			}),
		),
	);
	for (const task of tasks)
		await projectOpenSpec(db, {
			installationId: input.installationId,
			accountLogin: installation?.accountLogin ?? "",
			...task,
		});
	return { kind: "changed", body: next };
};

export async function reconcilePullRequest(
	db: Db,
	input: ReconcilePullRequestInput,
): Promise<ReadResult> {
	const { users, installation, repository } = await loadReconciliationTarget(
		db,
		input,
	);
	if (!repository)
		return {
			kind: "error",
			stale: true,
			message: "pull request target is unavailable",
			operation: "pull_request",
			summary: "Pull request target is unavailable",
		};
	const [owner, name] = repository.full_name.split("/");
	if (!owner || !name)
		return {
			kind: "error",
			stale: true,
			message: "repository identity is invalid",
			operation: "pull_request",
			summary: "Pull request target is unavailable",
		};
	const request: FetchLike = (url, init) =>
		input.fetcher(url, {
			...init,
			headers: {
				...Object.fromEntries(new Headers(init?.headers)),
				authorization: `Bearer ${input.token}`,
			},
		});
	try {
		const read = await readOpenPullRequest(
			db,
			input,
			request,
			owner,
			name,
			repository,
		);
		return read
			? applyOpenPullRequest(db, users, installation, repository, input, read)
			: removeClosedPullRequest(db, users, input);
	} catch {
		await Promise.all(
			users.map((user) =>
				mutateUser(db, user._id, (aggregate) => {
					const target = aggregate.installations
						.find((item) => item.installationId === input.installationId)
						?.repositories.find(
							(item) => item.repositoryId === input.repositoryId,
						);
					const previous = target?.pullRequests.find(
						(item) => Number(item.number) === input.number,
					);
					if (previous) previous.lifecycle_stale = true;
				}),
			),
		);
		return {
			kind: "error",
			stale: true,
			message: "pull request reconciliation failed",
			operation: "pull_request",
			summary: "Pull request reconciliation failed",
		};
	}
}
export async function bootstrapInstallation(
	db: Db,
	installationId: string,
	token: string,
	fetcher: FetchLike,
	appJwt: string,
	fetchTasks?: TaskFetcher,
	reportTaskFetchFailure?: GitHubRequestFailureReporter,
): Promise<ReadResult> {
	const request: FetchLike = (url, init) =>
		fetcher(url, {
			...init,
			headers: {
				...Object.fromEntries(new Headers(init?.headers)),
				authorization: `Bearer ${token}`,
			},
		});
	const identityRequest: FetchLike = (url, init) =>
		fetcher(url, {
			...init,
			headers: {
				...Object.fromEntries(new Headers(init?.headers)),
				authorization: `Bearer ${appJwt}`,
			},
		});
	const taskFetcher =
		fetchTasks ??
		(async (input) => {
			const target = `https://api.github.com/repositories/${input.repositoryId}/contents/${input.path}?ref=${input.sha}`;
			const response = await request(target, {
				headers: { accept: "application/vnd.github.raw" },
			});
			if (response.ok) return response.text();
			await reportTaskFetchFailure?.({
				operation: "bootstrap OpenSpec task fetch",
				status: response.status,
				target,
				diagnostic: await githubErrorDiagnostic(response),
			});
			return null;
		});
	const bound = await db.users
		.find(
			{ "installations.installationId": installationId },
			{ projection: { _id: 1, installations: 1 } },
		)
		.toArray();
	if (
		!bound.some((user) =>
			user.installations.some(
				(item) =>
					item.installationId === installationId &&
					(!item.accountLogin ||
						approvedInstallationAccount(item.accountLogin)),
			),
		)
	)
		return {
			kind: "error",
			stale: true,
			message: "installation account is not approved",
			operation: "installation_identity",
			summary: "Installation account is not approved",
		};
	const installation = await conditionalGet(
		db,
		`installation:${installationId}:identity`,
		`https://api.github.com/app/installations/${installationId}`,
		identityRequest,
		{ operation: "installation_identity" },
	);
	if (installation.kind === "error") return installation;
	if (
		installation.kind !== "changed" ||
		!approvedInstallationAccount((installation.body as any)?.account?.login)
	)
		return {
			kind: "error",
			stale: true,
			message: "installation account is not approved",
			operation: "installation_identity",
			summary: "Installation account is not approved",
		};
	const repos = await pagedGet(
		db,
		`installation:${installationId}:repos`,
		"https://api.github.com/installation/repositories?per_page=100",
		request,
		{ operation: "repository_list" },
	);
	if (repos.kind !== "changed") return repos;
	const repositories = repos.body as Array<{ id: number; full_name: string }>;
	const snapshots = [] as Array<{
		repositoryId: string;
		full_name: string;
		pullRequests: any[];
		openSpecs: Record<string, unknown>[];
		deployments: Record<string, unknown>[];
		recentMergedPullRequests?: MergedPullRequestEvidence[];
		policy?: { refreshed_at: string; required_checks: unknown[] };
	}>;
	const openSpecTasks: OpenSpecTask[] = [];
	for (const repo of repositories) {
		const existingRepository = bound
			.flatMap((user) => user.installations)
			.find((item) => item.installationId === installationId)
			?.repositories.find((item) => item.repositoryId === String(repo.id));
		const policy = await refreshRepositoryPolicy(
			db,
			installationId,
			{
				repositoryId: String(repo.id),
				full_name: repo.full_name,
				policy: existingRepository?.policy,
			},
			request,
		);
		const prs = await pagedGet(
			db,
			`installation:${installationId}:repo:${repo.id}:prs`,
			`https://api.github.com/repositories/${repo.id}/pulls?state=open&per_page=100`,
			request,
			{ operation: "pull_requests", repository: repo.full_name },
		);
		if (prs.kind !== "changed") return prs;
		const deployments = await bootstrapDeployments(
			db,
			installationId,
			String(repo.id),
			token,
			fetcher,
			repo.full_name,
		);
		if (deployments.kind === "error") return deployments;
		const deploymentRows =
			deployments.kind === "changed" ? deployments.body : [];
		const pullRequests = Array.isArray(prs.body) ? prs.body : [];
		const deploymentPullRequests = pullRequests.map((pr: any) => ({
			...pr,
			url: pr.html_url,
			head_sha: pr.head?.sha,
		}));
		const recentMergedPullRequests = retainRecentMergedPullRequests(
			existingRepository?.recentMergedPullRequests ?? [],
		);
		const tasks = await fetchOpenSpecTasksForPullRequests(
			db,
			installationId,
			String(repo.id),
			pullRequests,
			request,
			taskFetcher,
			repo.full_name,
		);
		if (!Array.isArray(tasks)) return tasks;
		openSpecTasks.push(...tasks);
		snapshots.push({
			repositoryId: String(repo.id),
			full_name: repo.full_name,
			...(policy.policy
				? {
						policy: policy.policy as {
							refreshed_at: string;
							required_checks: unknown[];
						},
					}
				: {}),
			pullRequests: Array.isArray(prs.body)
				? prs.body.map((pr: any) => ({
						number: pr.number,
						title: pr.title,
						url: pr.html_url,
						author_login: pr.user?.login,
						state: pr.state,
						draft: pr.draft ? 1 : 0,
						head_ref: pr.head?.ref,
						head_sha: pr.head?.sha,
						updated_at: pr.updated_at,
					}))
				: [],
			openSpecs: [],
			deployments: (deploymentRows as Record<string, unknown>[]).map(
				(deployment) =>
					correlateDeploymentPullRequest(
						deployment,
						deploymentPullRequests,
						recentMergedPullRequests,
					),
			),
			...(recentMergedPullRequests.length ? { recentMergedPullRequests } : {}),
		});
	}
	const account = (installation.body as any).account.login;
	const pullRequestsPermission = (installation.body as any).permissions
		?.pull_requests;
	await Promise.all(
		bound.map((user) =>
			mutateUser(db, user._id, (aggregate) => {
				const installation = aggregate.installations.find(
					(item) => item.installationId === installationId,
				);
				if (
					!installation ||
					(installation.accountLogin &&
						(!approvedInstallationAccount(installation.accountLogin) ||
							!sameLogin(installation.accountLogin, account)))
				)
					return;
				if (!installation.accountLogin) installation.accountLogin = account;
				installation.permissions = {
					pull_requests:
						typeof pullRequestsPermission === "string"
							? pullRequestsPermission
							: undefined,
				};
				installation.repositories = snapshots.map((snapshot) => {
					const previous = installation.repositories.find(
						(repository) => repository.repositoryId === snapshot.repositoryId,
					);
					return {
						...snapshot,
						pullRequests: snapshot.pullRequests
							.filter((pr) =>
								sameLogin(pr.author_login, aggregate.github.login),
							)
							.map((pr) => {
								const old = previous?.pullRequests.find(
									(item) => item.number === pr.number,
								);
								return { ...old, ...pr };
							}),
						openSpecs: snapshot.openSpecs,
						deployments: snapshot.deployments.slice(0, 20),
						...(snapshot.recentMergedPullRequests
							? { recentMergedPullRequests: snapshot.recentMergedPullRequests }
							: {}),
					};
				});
				installation.lastSuccessfulSyncAt = new Date();
				delete installation.lastSyncError;
				appendReconciliationEvidence(installation, {
					completedAt: new Date(),
					outcome: "success",
					operation: "reconciliation",
					summary: "Reconciliation completed",
				});
			}),
		),
	);
	for (const task of openSpecTasks)
		await projectOpenSpec(db, {
			installationId,
			accountLogin: account,
			...task,
		});
	return repos;
}
export async function bootstrapDeployments(
	db: Db,
	installationId: string,
	repositoryId: string,
	token: string,
	fetcher: FetchLike = fetch,
	repository?: string,
): Promise<ReadResult> {
	const request: FetchLike = (url, init) =>
		fetcher(url, {
			...init,
			headers: {
				...Object.fromEntries(new Headers(init?.headers)),
				authorization: `Bearer ${token}`,
			},
		});
	const list = await pagedGet(
		db,
		`installation:${installationId}:repo:${repositoryId}:deployments`,
		`https://api.github.com/repositories/${repositoryId}/deployments?per_page=20`,
		request,
		{ operation: "deployments", repository },
	);
	if (list.kind !== "changed" || !Array.isArray(list.body)) return list;
	const deployments: Record<string, unknown>[] = [];
	for (const deployment of (list.body as any[]).slice(0, 20)) {
		const status = await pagedGet(
			db,
			`installation:${installationId}:repo:${repositoryId}:deployment:${deployment.id}:statuses`,
			`https://api.github.com/repositories/${repositoryId}/deployments/${deployment.id}/statuses?per_page=100`,
			request,
			{ operation: "deployments", repository },
		);
		if (status.kind === "error") return status;
		const latest =
			status.kind === "changed" && Array.isArray(status.body)
				? (latestDeploymentStatus(
						status.body.map((item: any) => ({
							...item,
							status_id: item.id,
							status_created_at: item.created_at,
						})),
					) as any)
				: undefined;
		deployments.push({
			id: String(deployment.id),
			environment: deployment.environment,
			ref: deployment.ref,
			sha: deployment.sha,
			state: latest?.state ?? "pending",
			status_id:
				latest?.status_id == null ? undefined : String(latest.status_id),
			status_created_at: latest?.status_created_at,
			target_url: safeUrl(latest?.target_url),
			log_url: safeUrl(latest?.log_url),
			updated_at:
				latest?.status_created_at ??
				deployment.created_at ??
				new Date().toISOString(),
		});
	}
	return { kind: "changed", body: deployments };
}
export async function reconcileInstallations(
	db: Db,
	credentialsFor: (
		installationId: string,
	) => Promise<{ token: string; appJwt: string }>,
	fetcher: FetchLike,
	installationIds?: string[],
	fetchTasks?: TaskFetcher,
	reportTaskFetchFailure?: GitHubRequestFailureReporter,
	onResult?: (item: {
		installationId: string;
		result: ReadResult;
	}) => Promise<void>,
) {
	const ids = installationIds
		? [...new Set(installationIds)].sort()
		: [
				...new Set(
					(
						await db.users
							.find({}, { projection: { installations: 1 } })
							.toArray()
					).flatMap((user) =>
						user.installations
							.filter(
								(item) =>
									!item.accountLogin ||
									approvedInstallationAccount(item.accountLogin),
							)
							.map((item) => item.installationId),
					),
				),
			].sort();
	const results: Array<{ installationId: string; result: ReadResult }> = [];
	for (const installationId of ids) {
		let result: ReadResult;
		try {
			const { token, appJwt } = await credentialsFor(installationId);
			result = await bootstrapInstallation(
				db,
				installationId,
				token,
				fetcher,
				appJwt,
				fetchTasks,
				reportTaskFetchFailure,
			);
		} catch (error) {
			result = normalizedReconciliationFailure();
			logReconciliationFailure(
				"installation reconciliation failed",
				installationId,
				result,
				error instanceof Error ? "Error" : "unknown",
				error,
			);
		}
		results.push({ installationId, result });
		await onResult?.({ installationId, result });
		if (result.kind === "error") {
			logReconciliationFailure(
				"installation reconciliation failed",
				installationId,
				result,
				"ReadResult",
			);
			await persistReconciliationFailure(db, installationId, result);
		}
	}
	const failures = results.filter((item) => item.result.kind === "error");
	if (failures.length)
		throw new Error(
			`reconciliation failed for installations ${failures.map((item) => item.installationId).join(",")}`,
		);
	return results;
}

export const normalizedReconciliationFailure = (): Extract<
	ReadResult,
	{ kind: "error" }
> => ({
	kind: "error",
	stale: true,
	message: "reconciliation failed",
	operation: "reconciliation",
	summary: "Reconciliation failed",
});

export const logReconciliationFailure = (
	event: string,
	installationId: string,
	result: Extract<ReadResult, { kind: "error" }>,
	classification: string,
	error?: unknown,
) =>
	console.error(
		event,
		installationId,
		result.operation ?? "reconciliation",
		classification,
		error ?? result.message,
	);

export async function persistReconciliationFailure(
	db: Db,
	installationId: string,
	result: Extract<ReadResult, { kind: "error" }>,
) {
	const users = await db.users
		.find(
			{ "installations.installationId": installationId },
			{ projection: { _id: 1 } },
		)
		.toArray();
	await Promise.all(
		users.map((user) =>
			mutateUser(db, user._id, (aggregate) => {
				const installation = aggregate.installations.find(
					(item) => item.installationId === installationId,
				);
				if (
					installation &&
					(!installation.accountLogin ||
						approvedInstallationAccount(installation.accountLogin))
				) {
					installation.lastSyncError = result.message.slice(0, 200);
					appendReconciliationEvidence(installation, {
						completedAt: new Date(),
						outcome: "failure",
						operation: result.operation ?? "reconciliation",
						summary: result.summary ?? "Reconciliation failed",
						repository: result.repository,
						status: result.status,
					});
				}
			}),
		),
	);
}

export async function approvedInstallationIdsForUser(db: Db, userId: string) {
	const user = await db.users.findOne(
		{ _id: userId },
		{ projection: { installations: 1 } },
	);
	return [
		...new Set(
			user?.installations
				.filter(
					(item) =>
						!item.accountLogin ||
						approvedInstallationAccount(item.accountLogin),
				)
				.map((item) => item.installationId) ?? [],
		),
	].sort();
}
