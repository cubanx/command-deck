import { createSign } from "node:crypto";
import type { Db, MergedPullRequestEvidence, PullRequest, ReconciliationEvidence, Repository } from "#/db";
import {
	appendReconciliationEvidence,
	correlateDeploymentPullRequest,
	mutateUser,
	retainRecentMergedPullRequests,
} from "#/db";
import { latestDeploymentStatus } from "#/deployment-status";
import { approvedInstallationAccount, sameLogin } from "#/installations";
import { detectedOpenSpecSlugs, parseOpenSpecDeclaration, parseTasks, projectRepositoryTasks } from "#/openspec";
import {
	errorField,
	failureDetails,
	logReconciliationError,
	type ReconciliationErrorCategory,
} from "#/reconciliation-coordinator";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export const GITHUB_REQUEST_TIMEOUT_MS = 30_000;
export const githubFetch = async (fetcher: FetchLike, input: RequestInfo | URL, init?: RequestInit) => {
	const timeout = AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS);
	try {
		return await fetcher(input, {
			...init,
			signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
		});
	} catch (error) {
		if (timeout.aborted)
			throw new Error(
				`GitHub request timed out after ${GITHUB_REQUEST_TIMEOUT_MS}ms: ${init?.method ?? "GET"} ${String(input)}`,
			);
		throw error;
	}
};
export type TaskFetcher = (input: {
	installationId: string;
	repositoryId: string;
	path: string;
	sha: string;
}) => Promise<string | null | { finalTreeAbsent: true }>;
export type GitHubRequestFailure = {
	failureClass?: string;
	code?: number;
	operation: string;
	status: number;
	target: string;
	diagnostic?: {
		message?: string;
		documentationUrl?: string;
		errors?: Array<{
			resource?: string;
			field?: string;
			code?: string;
			message?: string;
		}>;
	};
};
export type GitHubRequestFailureReporter = (failure: GitHubRequestFailure) => void | Promise<void>;
export type ReadResult =
	| {
			kind: "changed";
			body: unknown;
			prCount?: number;
			changedPrCount?: number;
			unchangedPrCount?: number;
	  }
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
const mergePullRequestSnapshot = (old: PullRequest | undefined, next: PullRequest): PullRequest => ({
	...old,
	...next,
	opened_at: next.opened_at ?? old?.opened_at,
});
const projectedPullRequestCounts = (
	previousRepositories: Repository[],
	snapshots: Repository[],
	login: string | undefined,
) => {
	const counts = { prCount: 0, changedPrCount: 0, unchangedPrCount: 0 };
	for (const snapshot of snapshots) {
		const previous = previousRepositories.find((repository) => repository.repositoryId === snapshot.repositoryId);
		for (const pr of snapshot.pullRequests.filter((pr) => sameLogin(pr.author_login, login))) {
			const old = previous?.pullRequests.find((item) => item.number === pr.number);
			counts.prCount++;
			if (JSON.stringify(old) === JSON.stringify(mergePullRequestSnapshot(old, pr))) counts.unchangedPrCount++;
			else counts.changedPrCount++;
		}
	}
	return counts;
};

type OpenSpecTask = {
	repositoryId: string;
	path: string;
	changeName: string;
	sha: string;
	content: string;
};
type GraphqlConnection = {
	nodes?: unknown[];
	pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
};
const graphqlEndpoint = "https://api.github.com/graphql";
const providerFailedState = (value: unknown) =>
	["action_required", "cancelled", "canceled", "failed", "failure", "startup_failure", "timed_out", "error"].includes(
		String(value).toLowerCase(),
	);
const providerAggregateState = (items: unknown[], stateFor: (item: unknown) => unknown) => {
	if (!items.length) return "unknown";
	let pending = false;
	let unknown = false;
	for (const item of items) {
		const state = String(stateFor(item) ?? "").toLowerCase();
		if (providerFailedState(state)) return "failure";
		if (["success", "neutral", "skipped"].includes(state)) continue;
		if (["queued", "in_progress", "pending", "requested", "waiting", "expected"].includes(state)) pending = true;
		else unknown = true;
	}
	return pending ? "pending" : unknown ? "unknown" : "success";
};
const optionalString = (value: unknown) => (typeof value === "string" ? value : undefined);
const validBranch = (value: unknown) =>
	typeof value === "string" && value.length <= 255 && /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..")
		? value
		: undefined;
const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const diagnosticString = (value: unknown) => (typeof value === "string" ? value.slice(0, 200) : undefined);
const graphqlErrorDiagnostic = (errors: unknown) => {
	if (!Array.isArray(errors)) return undefined;
	const items = errors
		.map((error) => {
			if (!error || typeof error !== "object") return undefined;
			const value = error as Record<string, unknown>;
			const path = Array.isArray(value.path)
				? diagnosticString(value.path.filter((item): item is string => typeof item === "string").join("."))
				: undefined;
			const code = diagnosticString(value.type);
			const message = path || code ? undefined : diagnosticString(value.message);
			return path || code || message
				? {
						...(path ? { field: path } : {}),
						...(code ? { code } : {}),
						...(message ? { message } : {}),
					}
				: undefined;
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item))
		.slice(0, 5);
	return items.length ? { errors: items } : undefined;
};
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
export function githubAppJwt(appId: string, privateKey: string, now = Math.floor(Date.now() / 1000)) {
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
		payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })),
		signer = createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	signer.end();
	return `${header}.${payload}.${signer.sign(privateKey).toString("base64url")}`;
}
export async function installationToken(appJwt: string, installationId: string, fetcher: FetchLike = fetch) {
	const response = await githubFetch(
		fetcher,
		`https://api.github.com/app/installations/${installationId}/access_tokens`,
		{
			method: "POST",
			headers: {
				authorization: `Bearer ${appJwt}`,
				accept: "application/vnd.github+json",
			},
		},
	);
	if (!response.ok) throw new Error(`GitHub installation token request failed (${response.status})`);
	return ((await response.json()) as { token: string }).token;
}
export const retryDelay = (response: Response, attempt: number, now = Date.now()) => {
	const retryable =
		[429, 502, 503, 504].includes(response.status) ||
		(response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
	if (!retryable) return undefined;
	const retryAfter = Number(response.headers.get("retry-after"));
	if (retryAfter > 0) return Math.min(retryAfter * 1000, 60_000);
	const reset = Number(response.headers.get("x-ratelimit-reset"));
	if (reset * 1000 > now) return Math.min(reset * 1000 - now, 60_000);
	return Math.min(1000 * 2 ** attempt, 60_000);
};
async function githubGraphql(token: string, query: string, variables: Record<string, unknown>, fetcher: FetchLike) {
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
	if (!response?.ok)
		throw Object.assign(new Error("GitHub GraphQL request failed"), {
			status: response?.status,
		});
	const body: unknown = await response.json();
	if (!body || typeof body !== "object") throw new Error("GitHub GraphQL response was incomplete");
	const errors = (body as { errors?: unknown }).errors;
	if (Array.isArray(errors))
		throw Object.assign(new Error("GitHub GraphQL response was incomplete"), {
			status: response.status,
			diagnostic: graphqlErrorDiagnostic(errors),
		});
	if (!(body as { data?: unknown }).data)
		throw Object.assign(new Error("GitHub GraphQL response was incomplete"), {
			status: response.status,
		});
	return (body as { data: Record<string, unknown> }).data;
}
const safeUrl = (value: unknown) =>
	URL.canParse(String(value)) && ["http:", "https:"].includes(new URL(String(value)).protocol)
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
	if (url.origin !== "https://api.github.com") throw new Error("GitHub pagination link was not GitHub API");
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
			response = await githubFetch(fetcher, next, {
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
				message: error instanceof Error ? error.message : "GitHub pagination failed",
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
	await db.providerCache.updateOne({ _id: key }, { $set: { body: all, updatedAt: new Date() } }, { upsert: true });
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
		response = await githubFetch(fetcher, url, {
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
		await db.providerCache.updateOne({ _id: key }, { $set: { updatedAt: new Date() } });
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
type PullRequestOpenSpecs = {
	number: number;
	tasks: OpenSpecTask[];
	declaration: "absent" | "empty" | "declared" | "invalid";
	detected: string[];
	retention?: {
		obligations: string[];
		unresolved: boolean;
		sourceCommit?: string;
		sourceRef?: string;
	};
};
const openSpecProjection = (
	evidence: PullRequestOpenSpecs | undefined,
	sourceRef?: unknown,
	sourceRepository?: unknown,
) => {
	const repository = optionalString(sourceRepository);
	const open_specs = evidence?.tasks.map((task) => {
		const progress = parseTasks(task.content);
		return {
			change_name: task.changeName,
			...progress,
			pre_merge_ready: progress.preMergeReady,
			active_group: progress.activeGroup,
			active_groups: progress.activeGroups,
			incomplete_groups: progress.incompleteGroups,
			source_commit: task.sha,
			source_ref: optionalString(sourceRef),
			...(repository
				? {
						source_url: safeUrl(
							`https://github.com/${repository.split("/").map(encodeURIComponent).join("/")}/blob/${encodeURIComponent(task.sha)}/${task.path.split("/").map(encodeURIComponent).join("/")}`,
						),
					}
				: {}),
		};
	});
	return {
		open_specs,
		open_spec: open_specs?.[0] ?? null,
		open_spec_declaration: evidence?.declaration ?? "absent",
		detected_open_specs: evidence?.detected ?? [],
		...(evidence?.retention
			? {
					post_merge_obligations: evidence.retention.obligations,
					post_merge_unresolved: evidence.retention.unresolved,
					post_merge_source_commit: evidence.retention.sourceCommit,
					post_merge_source_ref: evidence.retention.sourceRef,
				}
			: {}),
	};
};

const mergedTaskPaths = (paths: unknown[], name: string) => {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return paths
		.map(String)
		.filter((path) => new RegExp(`^openspec/changes/archive/\\d{4}-\\d{2}-\\d{2}-${escaped}/tasks\\.md$`).test(path));
};

const readDefaultBranch = async (request: FetchLike, repository: string) => {
	const details = await githubFetch(request, `https://api.github.com/repos/${repository}`);
	if (!details.ok) throw Object.assign(new Error("GitHub default branch read failed"), { status: details.status });
	const body = (await details.json()) as { default_branch?: unknown };
	const ref = validBranch(body.default_branch);
	if (!ref) throw new Error("GitHub default branch was unavailable");
	const commit = await githubFetch(
		request,
		`https://api.github.com/repos/${repository}/commits/${encodeURIComponent(ref)}`,
	);
	if (!commit.ok) throw Object.assign(new Error("GitHub default branch commit read failed"), { status: commit.status });
	const commitBody = (await commit.json()) as { sha?: unknown };
	if (typeof commitBody.sha !== "string" || !/^[0-9a-f]{40}$/i.test(commitBody.sha))
		throw new Error("GitHub default branch commit was unavailable");
	return { ref, sha: commitBody.sha };
};

const readDefaultTree = async (request: FetchLike, repository: string, sha: string) => {
	const response = await githubFetch(
		request,
		`https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
	);
	if (!response.ok)
		throw Object.assign(new Error("GitHub default branch tree read failed"), { status: response.status });
	const body = (await response.json()) as { truncated?: unknown; tree?: Array<{ path?: unknown; type?: unknown }> };
	if (body.truncated !== false || !Array.isArray(body.tree))
		throw new Error("GitHub default branch tree was incomplete");
	return body.tree.filter((item) => item.type === "blob").map((item) => String(item.path ?? ""));
};

const fetchMergedOpenSpecTasks = async (input: {
	installationId: string;
	repositoryId: string;
	request: FetchLike;
	taskFetcher: TaskFetcher;
	repository: string;
	ref: string;
	sha: string;
	number: number;
	body: unknown;
	priorObligations: string[];
	priorUnresolved?: boolean;
}): Promise<PullRequestOpenSpecs> => {
	const declaration = parseOpenSpecDeclaration(input.body);
	const declared = declaration.state === "declared" ? declaration.slugs : [];
	const obligations = [...new Set([...input.priorObligations, ...declared])].sort();
	if (!obligations.length)
		return {
			number: input.number,
			tasks: [],
			declaration: declaration.state,
			detected: [],
			...(declaration.state === "invalid" || input.priorUnresolved
				? {
						retention: {
							obligations: [],
							unresolved: true,
							sourceCommit: input.sha,
							sourceRef: input.ref,
						},
					}
				: {}),
		};
	let tree: string[] | undefined;
	const tasks: OpenSpecTask[] = [];
	let unresolved = declaration.state === "invalid";
	let retentionNeeded =
		input.priorObligations.length > 0 || input.priorUnresolved === true || declaration.state === "invalid";
	for (const changeName of obligations) {
		let path = `openspec/changes/${changeName}/tasks.md`;
		let content: string | null | { finalTreeAbsent: true };
		try {
			content = await input.taskFetcher({
				installationId: input.installationId,
				repositoryId: input.repositoryId,
				path,
				sha: input.sha,
			});
		} catch {
			unresolved = true;
			continue;
		}
		if (typeof content !== "string") {
			tree ??= await readDefaultTree(input.request, input.repository, input.sha);
			const archives = mergedTaskPaths(tree, changeName);
			if (archives.length !== 1) {
				unresolved = true;
				continue;
			}
			path = archives[0]!;
			try {
				content = await input.taskFetcher({
					installationId: input.installationId,
					repositoryId: input.repositoryId,
					path,
					sha: input.sha,
				});
			} catch {
				unresolved = true;
				continue;
			}
		}
		if (typeof content !== "string") {
			unresolved = true;
			continue;
		}
		if (parseTasks(content).total === 0) {
			unresolved = true;
		}
		if (parseTasks(content).postMergeIncomplete) retentionNeeded = true;
		tasks.push({ repositoryId: input.repositoryId, path, changeName, sha: input.sha, content });
	}
	return {
		number: input.number,
		tasks,
		declaration: declaration.state,
		detected: [],
		...(retentionNeeded || unresolved
			? {
					retention: {
						obligations,
						unresolved,
						sourceCommit: input.sha,
						sourceRef: input.ref,
					},
				}
			: {}),
	};
};

async function fetchOpenSpecTasksForPullRequests(
	db: Db,
	installationId: string,
	repositoryId: string,
	pullRequests: Array<{
		number?: unknown;
		updated_at?: unknown;
		head?: { sha?: unknown };
		body?: unknown;
	}>,
	request: FetchLike,
	taskFetcher: TaskFetcher,
	repository?: string,
	stage?: { value: string },
): Promise<PullRequestOpenSpecs[] | ReadResult> {
	const artifactFailure = (status?: number): ReadResult => ({
		kind: "error",
		stale: true,
		message: "GitHub OpenSpec artifact fetch failed",
		operation: "openspec",
		repository,
		summary: "GitHub OpenSpec artifact fetch failed",
		...(status === undefined ? {} : { status }),
	});
	const errorStatus = (error: unknown) => {
		const status = Number((error as { status?: unknown })?.status);
		return Number.isSafeInteger(status) ? status : undefined;
	};
	const archiveTaskPaths = (paths: string[], name: string) => {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		return paths.filter((path) =>
			new RegExp(`^openspec/changes/archive/\\d{4}-\\d{2}-\\d{2}-${escaped}/tasks\\.md$`).test(path),
		);
	};
	const results: PullRequestOpenSpecs[] = [];
	for (const pr of [...pullRequests].sort((a, b) => {
		const aUpdatedAt = Date.parse(String(a.updated_at ?? "")),
			bUpdatedAt = Date.parse(String(b.updated_at ?? "")),
			aHasValidUpdatedAt = Number.isFinite(aUpdatedAt),
			bHasValidUpdatedAt = Number.isFinite(bUpdatedAt);
		if (aHasValidUpdatedAt !== bHasValidUpdatedAt) return Number(bHasValidUpdatedAt) - Number(aHasValidUpdatedAt);
		return (
			bUpdatedAt - aUpdatedAt ||
			Number(a.number) - Number(b.number) ||
			String(a.head?.sha ?? "").localeCompare(String(b.head?.sha ?? ""))
		);
	})) {
		const sha = typeof pr.head?.sha === "string" ? pr.head.sha : undefined;
		if (!sha) continue;
		const number = Number(pr.number);
		if (!Number.isSafeInteger(number))
			return {
				kind: "error",
				stale: true,
				message: "GitHub pull request number was invalid",
				operation: "openspec",
				repository,
				summary: "GitHub OpenSpec read was incomplete",
			};
		if (stage) stage.value = "changed files";
		const changes = await pagedGet(
			db,
			`installation:${installationId}:repo:${repositoryId}:pr:${number}:files:${sha}`,
			`https://api.github.com/repositories/${repositoryId}/pulls/${number}/files?per_page=100`,
			request,
			{ operation: "openspec", repository },
			"filename",
		);
		if (changes.kind !== "changed" || !Array.isArray(changes.body)) return changes;
		const declaration = parseOpenSpecDeclaration(pr.body);
		const paths = changes.body
			.filter((item) => (item as { status?: unknown }).status !== "removed")
			.map((item) => String((item as { filename?: unknown }).filename ?? ""));
		const detected = detectedOpenSpecSlugs(paths);
		const tasks: OpenSpecTask[] = [];
		if (declaration.state === "declared")
			for (const name of declaration.slugs) {
				let path = `openspec/changes/${name}/tasks.md`;
				let content: string | null | { finalTreeAbsent: true };
				if (stage) stage.value = "active OpenSpec task";
				try {
					content = await taskFetcher({
						installationId,
						repositoryId,
						path,
						sha,
					});
				} catch (error) {
					return artifactFailure(errorStatus(error));
				}
				if (typeof content !== "string") {
					if (content?.finalTreeAbsent) return artifactFailure();
					const archivePaths = archiveTaskPaths(paths, name);
					const [archivePath] = archivePaths;
					if (archivePaths.length !== 1 || !archivePath) return artifactFailure();
					path = archivePath;
					if (stage) stage.value = "archive OpenSpec task";
					try {
						content = await taskFetcher({
							installationId,
							repositoryId,
							path,
							sha,
						});
					} catch (error) {
						return artifactFailure(errorStatus(error));
					}
					if (content === null) return artifactFailure();
				}
				if (typeof content !== "string") return artifactFailure();
				tasks.push({ repositoryId, path, changeName: name, sha, content });
			}
		results.push({ number, tasks, declaration: declaration.state, detected });
	}
	return results;
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
	const branch = details.kind === "changed" ? (details.body as any)?.default_branch : undefined;
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
	if (rules.kind !== "changed" || (protection.kind === "error" && protection.status !== 404))
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
	const required = new Map<string, { context: string; integration_id?: string }>();
	for (const rule of rules.body as any[])
		for (const parameter of rule?.rules ?? [])
			if (parameter?.type === "required_status_checks")
				for (const check of parameter?.parameters?.required_status_checks ?? []) {
					const context = optionalString(check?.context);
					if (context)
						required.set(`${context}:${check.integration_id ?? ""}`, {
							context,
							...(check.integration_id == null ? {} : { integration_id: String(check.integration_id) }),
						});
				}
	const classic = protection.kind === "changed" ? (protection.body as any)?.required_status_checks : undefined;
	for (const check of classic?.checks ?? []) {
		const context = optionalString(check?.context);
		if (context)
			required.set(`${context}:${check.app_id ?? ""}`, {
				context,
				...(check.app_id == null ? {} : { integration_id: String(check.app_id) }),
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
      state merged isDraft createdAt updatedAt title body url headRefName headRefOid baseRefName mergeCommit { oid } mergedAt author { login } mergeable reviewDecision
      labels(first: 100) { nodes { name } pageInfo { hasNextPage endCursor } }
      reviewRequests(first: 100) { totalCount }
      reviews(first: 100) { nodes { state } pageInfo { hasNextPage endCursor } }
      reviewThreads(first: 100) { nodes { isResolved } pageInfo { hasNextPage endCursor } }
      statusCheckRollup { contexts(first: 100) { nodes { ... on CheckRun { name status conclusion detailsUrl checkSuite { app { databaseId } } } ... on StatusContext { context state targetUrl } } pageInfo { hasNextPage endCursor } }
    }
  }
}
}`;

const graphqlConnectionQuery = (field: "labels" | "reviews" | "reviewThreads" | "contexts") =>
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
	if (!value || typeof value !== "object") throw new Error("GitHub pull request pagination was incomplete");
	const connection = value as GraphqlConnection;
	if (!Array.isArray(connection.nodes) || !connection.pageInfo || typeof connection.pageInfo.hasNextPage !== "boolean")
		throw new Error("GitHub pull request pagination was incomplete");
	if (connection.pageInfo.hasNextPage && typeof connection.pageInfo.endCursor !== "string")
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
		page = graphqlConnection(field === "contexts" ? pullRequest?.statusCheckRollup?.contexts : pullRequest?.[field]);
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
	reportFailure?: GitHubRequestFailureReporter;
};
type PullRequestRead = {
	pullRequest: Record<string, unknown>;
	headSha: string;
	merged: boolean;
	labels: unknown[];
	reviews: unknown[];
	threads: unknown[];
	contexts: unknown[];
	actions: unknown[];
	openSpecEvidence: PullRequestOpenSpecs;
};

const loadReconciliationTarget = async (db: Db, input: ReconcilePullRequestInput) => {
	const users = await db.users
		.find(
			{ "installations.installationId": input.installationId },
			{ projection: { _id: 1, github: 1, installations: 1 } },
		)
		.toArray();
	const installation = users
		.flatMap((user) => user.installations)
		.find(
			(installation) =>
				installation.installationId === input.installationId && approvedInstallationAccount(installation.accountLogin),
		);
	return {
		users,
		installation,
		repository: installation?.repositories.find((item) => item.repositoryId === input.repositoryId),
	};
};

const removeClosedPullRequest = async (
	db: Db,
	users: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	input: ReconcilePullRequestInput,
): Promise<ReadResult> => {
	const results = await Promise.all(
		users.map(async (user) => {
			let changed = false;
			await mutateUser(db, user._id, (aggregate) => {
				changed = false;
				const target = aggregate.installations
					.find((item) => item.installationId === input.installationId)
					?.repositories.find((item) => item.repositoryId === input.repositoryId);
				const previous = target?.pullRequests.find((item) => Number(item.number) === input.number);
				const observed = user.installations
					.find((item) => item.installationId === input.installationId)
					?.repositories.find((item) => item.repositoryId === input.repositoryId)
					?.pullRequests.find((item) => Number(item.number) === input.number);
				if (previous?.merged === true || JSON.stringify(previous) !== JSON.stringify(observed)) return;
				if (target) {
					const before = target.pullRequests.length;
					target.pullRequests = target.pullRequests.filter((item) => Number(item.number) !== input.number);
					changed ||= target.pullRequests.length !== before;
				}
			});
			return changed;
		}),
	);
	const changed = results.some(Boolean);
	return { kind: changed ? "changed" : "unchanged", body: null };
};

const readMergedOpenSpecs = async (
	input: ReconcilePullRequestInput,
	request: FetchLike,
	repository: Repository,
	users: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	taskFetcher: TaskFetcher,
	pullRequest: Record<string, unknown>,
): Promise<PullRequestOpenSpecs> => {
	const priorPullRequests = users.flatMap((user) =>
		user.installations
			.filter((item) => item.installationId === input.installationId && approvedInstallationAccount(item.accountLogin))
			.flatMap((item) => item.repositories)
			.filter((item) => item.repositoryId === input.repositoryId)
			.flatMap((item) => item.pullRequests.map((pullRequest) => ({ pullRequest, login: user.github.login }))),
	);
	const providerAuthor = optionalString((pullRequest.author as { login?: unknown } | undefined)?.login);
	const matchingPriorPullRequests = priorPullRequests
		.filter(({ login }) => sameLogin(login, providerAuthor))
		.map(({ pullRequest }) => pullRequest);
	const priorObligations = [
		...new Set(
			matchingPriorPullRequests
				.filter((item) => Number(item.number) === input.number)
				.flatMap((item) =>
					Array.isArray(item.post_merge_obligations)
						? item.post_merge_obligations.filter((value): value is string => typeof value === "string")
						: [],
				),
		),
	];
	try {
		const branchEvidence = await readDefaultBranch(request, repository.full_name);
		return await fetchMergedOpenSpecTasks({
			installationId: input.installationId,
			repositoryId: input.repositoryId,
			request,
			taskFetcher,
			repository: repository.full_name,
			ref: branchEvidence.ref,
			sha: branchEvidence.sha,
			number: input.number,
			body: pullRequest.body,
			priorObligations,
			priorUnresolved: matchingPriorPullRequests.some(
				(item) => Number(item.number) === input.number && item.post_merge_unresolved === true,
			),
		});
	} catch {
		const declaration = parseOpenSpecDeclaration(pullRequest.body);
		const obligations = [...new Set([...priorObligations, ...declaration.slugs])].sort();
		// A failed branch/tree read leaves declared work unresolved, without claiming a source commit.
		return {
			number: input.number,
			tasks: [],
			declaration: declaration.state,
			detected: [],
			...(obligations.length ||
			declaration.state === "invalid" ||
			matchingPriorPullRequests.some(
				(item) => Number(item.number) === input.number && item.post_merge_unresolved === true,
			)
				? { retention: { obligations, unresolved: true } }
				: {}),
		} satisfies PullRequestOpenSpecs;
	}
};

const validatePullRequestRead = (
	input: Omit<PullRequestRead, "openSpecEvidence"> & {
		tasks: PullRequestOpenSpecs | Awaited<ReturnType<typeof fetchOpenSpecTasksForPullRequests>>;
	},
): PullRequestRead => {
	const { pullRequest, headSha, merged, labels, reviews, threads, contexts, actions, tasks } = input;
	if (
		(merged && "kind" in tasks) ||
		(!merged && (!Array.isArray(tasks) || tasks.length !== 1 || ("kind" in tasks && tasks.kind === "error")))
	)
		throw Object.assign(new Error("GitHub OpenSpec read was incomplete"), {
			status: !Array.isArray(tasks) && "kind" in tasks && tasks.kind === "error" ? tasks.status : undefined,
		});
	if (
		!labels.every((item: any) => item && typeof item.name === "string") ||
		!reviews.every((item: any) => item && typeof item.state === "string") ||
		!threads.every((item: any) => item && typeof item.isResolved === "boolean") ||
		!contexts.every((item: any) => item && (typeof item.name === "string" || typeof item.context === "string"))
	)
		throw new Error("GitHub pull request response was incomplete");
	const openSpecEvidence: PullRequestOpenSpecs | undefined = merged
		? (tasks as PullRequestOpenSpecs)
		: Array.isArray(tasks)
			? tasks[0]
			: undefined;
	if (!openSpecEvidence || "kind" in openSpecEvidence) throw new Error("GitHub OpenSpec read was incomplete");
	return {
		pullRequest,
		headSha,
		merged,
		labels,
		reviews,
		threads,
		contexts,
		actions,
		openSpecEvidence,
	};
};

const readOpenPullRequest = async (
	db: Db,
	input: ReconcilePullRequestInput,
	request: FetchLike,
	owner: string,
	name: string,
	repository: NonNullable<Awaited<ReturnType<typeof loadReconciliationTarget>>["repository"]>,
	users: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	stage: { value: string },
): Promise<PullRequestRead | undefined> => {
	stage.value = "GraphQL lifecycle";
	const data = await githubGraphql(
		input.token,
		pullRequestLifecycleQuery,
		{ owner, repo: name, number: input.number },
		input.fetcher,
	);
	const pullRequest = (data.repository as { pullRequest?: Record<string, unknown> } | undefined)?.pullRequest;
	if (!pullRequest || typeof pullRequest !== "object") throw new Error("GitHub pull request response was incomplete");
	const merged = pullRequest.merged === true || String(pullRequest.state) === "MERGED";
	if (String(pullRequest.state) === "CLOSED" && !merged) return undefined;
	if (!pullRequest.reviewRequests || typeof (pullRequest.reviewRequests as any).totalCount !== "number")
		throw new Error("GitHub pull request response was incomplete");
	const headSha = typeof pullRequest.headRefOid === "string" ? pullRequest.headRefOid : undefined;
	if (!headSha) throw new Error("GitHub pull request head was unavailable");
	const [labels, reviews, threads, contexts] = await Promise.all([
		completeGraphqlConnection(input.token, input.fetcher, owner, name, input.number, "labels", pullRequest.labels),
		completeGraphqlConnection(input.token, input.fetcher, owner, name, input.number, "reviews", pullRequest.reviews),
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
	stage.value = "Actions";
	const actions = await pagedGet(
		db,
		"installation:" + input.installationId + ":repo:" + input.repositoryId + ":actions:" + headSha,
		"https://api.github.com/repositories/" + input.repositoryId + "/actions/runs?head_sha=" + headSha + "&per_page=100",
		request,
		{ operation: "actions", repository: repository.full_name },
		"workflow_runs",
	);
	if (actions.kind !== "changed" || !Array.isArray(actions.body))
		throw Object.assign(new Error("GitHub Actions response was incomplete"), {
			status: actions.kind === "error" ? actions.status : undefined,
		});
	const taskFetcher =
		input.fetchTasks ??
		(async (task: Parameters<TaskFetcher>[0]) => {
			const response = await githubFetch(
				request,
				"https://api.github.com/repositories/" + task.repositoryId + "/contents/" + task.path + "?ref=" + task.sha,
				{ headers: { accept: "application/vnd.github.raw" } },
			);
			if (response.ok) return response.text();
			if (response.status === 404) return null;
			throw Object.assign(new Error("GitHub OpenSpec artifact fetch failed"), {
				status: response.status,
			});
		});
	stage.value = "changed files";
	const tasks = merged
		? await readMergedOpenSpecs(input, request, repository, users, taskFetcher, pullRequest)
		: await fetchOpenSpecTasksForPullRequests(
				db,
				input.installationId,
				input.repositoryId,
				[
					{
						number: input.number,
						head: { sha: headSha },
						updated_at: pullRequest.updatedAt,
						body: pullRequest.body,
					},
				],
				request,
				taskFetcher,
				repository.full_name,
				stage,
			);
	return validatePullRequestRead({
		pullRequest,
		headSha,
		merged,
		labels,
		reviews,
		threads,
		contexts,
		actions: actions.body,
		tasks,
	});
};

const pullRequestProjection = (repository: Repository, number: number, read: PullRequestRead) => {
	const { pullRequest, headSha, labels, reviews, threads, contexts, actions, openSpecEvidence, merged } = read;
	const priorPullRequest = repository.pullRequests.find((item) => Number(item.number) === number);
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
				(!required.integration_id || String(required.integration_id) === String(item?.checkSuite?.app?.databaseId)),
		);
		const conclusion = (context as any)?.conclusion ?? (context as any)?.state;
		return {
			head_sha: headSha,
			conclusion:
				context && ["success", "neutral", "skipped"].includes(String(conclusion).toLowerCase())
					? String(conclusion).toLowerCase()
					: "missing",
		};
	});
	return {
		number: number,
		title: optionalString(pullRequest.title),
		url: optionalString(pullRequest.url),
		state: merged ? "closed" : "open",
		author_login:
			optionalString((pullRequest.author as { login?: unknown } | undefined)?.login) ??
			optionalString(priorPullRequest?.author_login),
		...(merged ? { merged: true, retention_candidate: true } : {}),
		...(merged
			? {
					merge_sha:
						optionalString((pullRequest.mergeCommit as { oid?: unknown } | undefined)?.oid) ??
						optionalString(priorPullRequest?.merge_sha),
					merged_at: optionalString(pullRequest.mergedAt) ?? optionalString(priorPullRequest?.merged_at),
					base_ref: optionalString(pullRequest.baseRefName) ?? optionalString(priorPullRequest?.base_ref),
				}
			: {}),
		draft: pullRequest.isDraft ? 1 : 0,
		opened_at: optionalString(pullRequest.createdAt),
		updated_at: optionalString(pullRequest.updatedAt),
		head_ref: optionalString(pullRequest.headRefName),
		base_ref:
			optionalString(pullRequest.baseRefName) ?? (merged ? optionalString(priorPullRequest?.base_ref) : undefined),
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
			reviewNodes.some((review) => ["APPROVED", "COMMENTED", "CHANGES_REQUESTED"].includes(String(review.state))),
		completed_review_count: reviewNodes.filter((review) =>
			["APPROVED", "COMMENTED", "CHANGES_REQUESTED"].includes(String(review.state)),
		).length,
		unresolved_review_threads: threadNodes.filter((thread) => !thread.isResolved).length,
		changes_requested: pullRequest.reviewDecision === "CHANGES_REQUESTED",
		repository_policy_loaded: Boolean(policy && !policy.stale),
		required_checks: requiredChecks,
		workflow_state: providerAggregateState(actions, (run) => {
			const value = run as Record<string, unknown>;
			return value.conclusion ?? value.status;
		}),
		checks_state: providerAggregateState(contexts, (context) => {
			const value = context as Record<string, unknown>;
			return value.conclusion ?? value.state ?? value.status;
		}),
		...openSpecProjection(
			openSpecEvidence,
			openSpecEvidence.retention?.sourceRef ?? pullRequest.headRefName,
			repository.full_name,
		),
	};
};

const canExcludeMergedPullRequest = (evidence: PullRequestOpenSpecs) => {
	const retention = evidence.retention;
	return (
		!retention ||
		(!retention.unresolved &&
			(retention.obligations.length === 0 ||
				(retention.obligations.length === evidence.tasks.length &&
					evidence.tasks.every((task) => {
						const progress = parseTasks(task.content);
						return progress.total > 0 && progress.completed === progress.total;
					}))))
	);
};

const applyOpenPullRequest = async (
	db: Db,
	users: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	repository: NonNullable<Awaited<ReturnType<typeof loadReconciliationTarget>>["repository"]>,
	input: ReconcilePullRequestInput,
	read: PullRequestRead,
): Promise<ReadResult> => {
	const { openSpecEvidence, merged } = read;
	const next = pullRequestProjection(repository, input.number, read);
	const results = await Promise.all(
		users.map(async (user) => {
			let changed = false;
			await mutateUser(db, user._id, (aggregate) => {
				changed = false;
				const target = aggregate.installations
					.find((item) => item.installationId === input.installationId)
					?.repositories.find((item) => item.repositoryId === input.repositoryId);
				const previous = target?.pullRequests.find((item) => Number(item.number) === input.number);
				const observed = user.installations
					.find((item) => item.installationId === input.installationId)
					?.repositories.find((item) => item.repositoryId === input.repositoryId)
					?.pullRequests.find((item) => Number(item.number) === input.number);
				if (
					!target ||
					((!previous || merged) && !sameLogin(next.author_login, aggregate.github.login)) ||
					(!merged && previous?.merged === true) ||
					JSON.stringify(previous) !== JSON.stringify(observed) ||
					(previous?.updated_at && String(previous.updated_at) > String(next.updated_at)) ||
					(previous?.head_sha &&
						previous.head_sha !== next.head_sha &&
						String(previous.updated_at ?? "") >= String(next.updated_at ?? ""))
				)
					return;
				for (const task of openSpecEvidence.tasks)
					changed =
						projectRepositoryTasks(target, task.changeName ?? task.path.split("/")[2]!, task).changed || changed;
				if (merged && canExcludeMergedPullRequest(openSpecEvidence)) {
					if (previous) {
						target!.pullRequests = target!.pullRequests.filter((item) => Number(item.number) !== input.number);
						changed = true;
					}
					return;
				}
				if (
					previous?.lifecycle_stale === false &&
					Object.entries(next).every(([key, value]) => JSON.stringify(previous?.[key]) === JSON.stringify(value))
				)
					return;
				changed = true;
				if (previous) Object.assign(previous, next, { lifecycle_stale: false });
				else target.pullRequests.push({ ...next, lifecycle_stale: false });
			});
			return changed;
		}),
	);
	const changed = results.some(Boolean);
	return { kind: changed ? "changed" : "unchanged", body: next };
};

export async function reconcilePullRequest(db: Db, input: ReconcilePullRequestInput): Promise<ReadResult> {
	const { users, repository } = await loadReconciliationTarget(db, input);
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
	const stage = { value: "GraphQL lifecycle" };
	try {
		const read = await readOpenPullRequest(db, input, request, owner, name, repository, users, stage);
		stage.value = "persistence";
		return read
			? await applyOpenPullRequest(db, users, repository, input, read)
			: await removeClosedPullRequest(db, users, input);
	} catch (error) {
		const details = failureDetails(error);
		const diagnostic = errorField(error, "diagnostic") as GitHubRequestFailure["diagnostic"];
		await input.reportFailure?.({
			operation: `targeted pull request reconciliation ${stage.value}`,
			...details,
			status: details.status ?? 0,
			target: `repositories/${input.repositoryId}/pulls/${input.number}`,
			...(diagnostic ? { diagnostic } : {}),
		});
		await Promise.all(
			users.map((user) =>
				mutateUser(db, user._id, (aggregate) => {
					const target = aggregate.installations
						.find((item) => item.installationId === input.installationId)
						?.repositories.find((item) => item.repositoryId === input.repositoryId);
					const previous = target?.pullRequests.find((item) => Number(item.number) === input.number);
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
const mergeRepositorySnapshot = (
	previous: Repository | undefined,
	observed: Repository | undefined,
	snapshot: Repository,
	openSpecTasks: OpenSpecTask[],
	login: string | undefined,
): Repository[] => {
	// ponytail: retry changed repositories on the next refresh; use per-PR guards if busy repositories starve.
	if (JSON.stringify(previous) !== JSON.stringify(observed)) return previous ? [previous] : [];
	const retained = previous?.pullRequests.filter((pr) => pr.retention_candidate === true) ?? [];
	const next: Repository = {
		...snapshot,
		pullRequests: snapshot.pullRequests
			.filter(
				(pr) => pr.retention_candidate !== true && !retained.some((item) => Number(item.number) === Number(pr.number)),
			)
			.filter((pr) => sameLogin(pr.author_login, login))
			.map((pr) =>
				mergePullRequestSnapshot(
					previous?.pullRequests.find((item) => item.number === pr.number),
					pr,
				),
			)
			.concat(retained),
		openSpecs: [],
		deployments: snapshot.deployments.slice(0, 20),
	};
	for (const task of openSpecTasks.filter((item) => item.repositoryId === snapshot.repositoryId))
		projectRepositoryTasks(next, task.changeName ?? task.path.split("/")[2]!, task);
	return [next];
};

const retainedReconciliationTargets = (
	bound: Awaited<ReturnType<typeof loadReconciliationTarget>>["users"],
	installationId: string,
	repositoryId: string,
	pullRequests: unknown[],
) => {
	const targets: Array<{ installationId: string; repositoryId: string; number: number }> = [];
	const reconciliationPullRequests = [
		...new Map(
			bound
				.flatMap((user) => user.installations)
				.filter((item) => item.installationId === installationId)
				.flatMap((item) => item.repositories)
				.filter((item) => item.repositoryId === repositoryId)
				.flatMap((item) => item.pullRequests)
				.filter((pr) => pr.retention_candidate === true || pr.state === "open")
				.map((pr) => [Number(pr.number), pr] as const),
		).values(),
	];
	for (const pr of reconciliationPullRequests)
		if (
			Number.isSafeInteger(Number(pr.number)) &&
			Number(pr.number) > 0 &&
			(pr.retention_candidate === true ||
				!pullRequests.some((item) => Number((item as { number?: unknown }).number) === Number(pr.number)))
		)
			targets.push({ installationId, repositoryId: repositoryId, number: Number(pr.number) });
	return { reconciliationPullRequests, targets };
};

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
			const response = await githubFetch(request, target, {
				headers: { accept: "application/vnd.github.raw" },
			});
			if (response.ok) return response.text();
			if (response.status === 404) return null;
			await reportTaskFetchFailure?.({
				operation: "bootstrap OpenSpec task fetch",
				status: response.status,
				target,
				diagnostic: await githubErrorDiagnostic(response),
			});
			throw Object.assign(new Error("GitHub OpenSpec artifact fetch failed"), { status: response.status });
		});
	const bound = await db.users
		.find({ "installations.installationId": installationId }, { projection: { _id: 1, github: 1, installations: 1 } })
		.toArray();
	if (
		!bound.some((user) =>
			user.installations.some(
				(item) =>
					item.installationId === installationId &&
					(!item.accountLogin || approvedInstallationAccount(item.accountLogin)),
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
	if (installation.kind !== "changed")
		return {
			kind: "error",
			stale: true,
			message: "installation account is not approved",
			operation: "installation_identity",
			summary: "Installation account is not approved",
		};
	const installationBody = installation.body as {
		account?: { login?: unknown };
		permissions?: { pull_requests?: unknown };
	};
	const account = installationBody.account?.login;
	if (!approvedInstallationAccount(account))
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
	const snapshots: Repository[] = [];
	const openSpecTasks: OpenSpecTask[] = [];
	const retainedTargets: Array<{ installationId: string; repositoryId: string; number: number }> = [];
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
		const deployments = await bootstrapDeployments(db, installationId, String(repo.id), token, fetcher, repo.full_name);
		if (deployments.kind === "error") return deployments;
		const deploymentRows = deployments.kind === "changed" ? deployments.body : [];
		const pullRequests = Array.isArray(prs.body) ? prs.body : [];
		const deploymentPullRequests = pullRequests.map((pr: any) => ({
			...pr,
			url: pr.html_url,
			head_sha: pr.head?.sha,
		}));
		const recentMergedPullRequests = retainRecentMergedPullRequests(existingRepository?.recentMergedPullRequests ?? []);
		const { reconciliationPullRequests, targets } = retainedReconciliationTargets(
			bound,
			installationId,
			String(repo.id),
			pullRequests,
		);
		retainedTargets.push(...targets);
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
		openSpecTasks.push(...tasks.flatMap((item) => item.tasks));
		const evidenceByNumber = new Map(tasks.map((item) => [item.number, item]));
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
			pullRequests: [
				...(Array.isArray(prs.body)
					? prs.body.map((item): PullRequest => {
							const pr = item as {
								number?: unknown;
								title?: unknown;
								html_url?: unknown;
								user?: { login?: unknown };
								state?: unknown;
								draft?: unknown;
								head?: { ref?: unknown; sha?: unknown };
								created_at?: unknown;
								updated_at?: unknown;
								body?: unknown;
							};
							const evidence = evidenceByNumber.get(Number(pr.number));
							return {
								number: pr.number,
								title: pr.title,
								url: pr.html_url,
								author_login: pr.user?.login,
								state: pr.state,
								draft: pr.draft ? 1 : 0,
								opened_at: optionalString(pr.created_at),
								head_ref: pr.head?.ref,
								head_sha: pr.head?.sha,
								updated_at: pr.updated_at,
								...openSpecProjection(evidence, pr.head?.ref, repo.full_name),
							};
						})
					: []),
				...reconciliationPullRequests.filter(
					(pr) => !pullRequests.some((item) => Number((item as { number?: unknown }).number) === Number(pr.number)),
				),
			],
			openSpecs: [],
			deployments: (deploymentRows as Record<string, unknown>[]).map((deployment) =>
				correlateDeploymentPullRequest(deployment, deploymentPullRequests, recentMergedPullRequests),
			),
			...(recentMergedPullRequests.length ? { recentMergedPullRequests } : {}),
		});
	}
	const pullRequestsPermission = installationBody.permissions?.pull_requests;
	const perUserCounts = await Promise.all(
		bound.map(async (user) => {
			let attemptCounts = {
				prCount: 0,
				changedPrCount: 0,
				unchangedPrCount: 0,
			};
			await mutateUser(db, user._id, (aggregate) => {
				attemptCounts = {
					prCount: 0,
					changedPrCount: 0,
					unchangedPrCount: 0,
				};
				const installation = aggregate.installations.find((item) => item.installationId === installationId);
				if (
					!installation ||
					(installation.accountLogin &&
						(!approvedInstallationAccount(installation.accountLogin) || !sameLogin(installation.accountLogin, account)))
				)
					return;
				const previousRepositories = installation.repositories;
				if (!installation.accountLogin) installation.accountLogin = account;
				installation.permissions = {
					pull_requests: typeof pullRequestsPermission === "string" ? pullRequestsPermission : undefined,
				};
				installation.repositories = snapshots.flatMap((snapshot) => {
					const previous = previousRepositories.find((item) => item.repositoryId === snapshot.repositoryId);
					const observed = user.installations
						.find((item) => item.installationId === installationId)
						?.repositories.find((item) => item.repositoryId === snapshot.repositoryId);
					return mergeRepositorySnapshot(previous, observed, snapshot, openSpecTasks, aggregate.github.login);
				});
				attemptCounts = projectedPullRequestCounts(
					previousRepositories,
					installation.repositories,
					aggregate.github.login,
				);
				installation.lastSuccessfulSyncAt = new Date();
				delete installation.lastSyncError;
				appendReconciliationEvidence(installation, {
					completedAt: new Date(),
					outcome: "success",
					operation: "reconciliation",
					summary: "Reconciliation completed",
				});
			});
			return attemptCounts;
		}),
	);
	const prCounts = perUserCounts.reduce(
		(total, counts) => ({
			prCount: total.prCount + counts.prCount,
			changedPrCount: total.changedPrCount + counts.changedPrCount,
			unchangedPrCount: total.unchangedPrCount + counts.unchangedPrCount,
		}),
		{ prCount: 0, changedPrCount: 0, unchangedPrCount: 0 },
	);
	for (const target of retainedTargets) {
		const result = await reconcilePullRequest(db, {
			...target,
			token,
			fetcher,
			fetchTasks,
		});
		if (result.kind === "error") return result;
	}
	return { ...repos, ...prCounts };
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
	for (const item of list.body.slice(0, 20)) {
		const deployment = item as Record<string, unknown>;
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
				? latestDeploymentStatus(
						status.body.map((item) => {
							const value = item as Record<string, unknown>;
							return {
								...value,
								status_id: value.id,
								status_created_at: value.created_at,
							};
						}),
					)
				: undefined;
		deployments.push({
			id: String(deployment.id),
			environment: deployment.environment,
			ref: deployment.ref,
			sha: deployment.sha,
			state: latest?.state ?? "pending",
			status_id: latest?.status_id == null ? undefined : String(latest.status_id),
			status_created_at: latest?.status_created_at,
			target_url: safeUrl(latest?.target_url),
			log_url: safeUrl(latest?.log_url),
			updated_at: latest?.status_created_at ?? deployment.created_at ?? new Date().toISOString(),
		});
	}
	return { kind: "changed", body: deployments };
}
export async function reconcileInstallations(
	db: Db,
	credentialsFor: (installationId: string) => Promise<{ token: string; appJwt: string }>,
	fetcher: FetchLike,
	installationIds?: string[],
	fetchTasks?: TaskFetcher,
	reportTaskFetchFailure?: GitHubRequestFailureReporter,
	onResult?: (item: { installationId: string; startedAt: Date; result: ReadResult }) => Promise<void>,
) {
	const ids = installationIds
		? [...new Set(installationIds)].sort()
		: [
				...new Set(
					(await db.users.find({}, { projection: { installations: 1 } }).toArray()).flatMap((user) =>
						user.installations
							.filter((item) => !item.accountLogin || approvedInstallationAccount(item.accountLogin))
							.map((item) => item.installationId),
					),
				),
			].sort();
	const results: Array<{ installationId: string; result: ReadResult }> = [];
	for (const installationId of ids) {
		const startedAt = new Date();
		let result: ReadResult;
		let operation = "installation_credentials";
		try {
			const { token, appJwt } = await credentialsFor(installationId);
			operation = "installation_bootstrap";
			result = await bootstrapInstallation(
				db,
				installationId,
				token,
				fetcher,
				appJwt,
				fetchTasks,
				reportTaskFetchFailure,
			);
		} catch {
			result = {
				...normalizedReconciliationFailure(),
				operation,
			};
		}
		results.push({ installationId, result });
		try {
			await onResult?.({ installationId, startedAt, result });
		} catch (error) {
			logReconciliationFailure(
				"installation reconciliation bookkeeping failed",
				installationId,
				normalizedReconciliationFailure(),
				"bookkeeping",
			);
		}
		if (result.kind === "error") {
			logReconciliationFailure("installation reconciliation failed", installationId, result, "broad");
			try {
				await persistReconciliationFailure(db, installationId, result);
			} catch (error) {
				logReconciliationFailure(
					"installation reconciliation persistence failed",
					installationId,
					normalizedReconciliationFailure(),
					"bookkeeping",
				);
			}
		}
	}
	const failures = results.filter((item) => item.result.kind === "error");
	if (failures.length) {
		const error = new Error(
			`reconciliation failed for installations ${failures.map((item) => item.installationId).join(",")}`,
		);
		Object.defineProperty(error, reportedReconciliationFailure, { value: true });
		throw error;
	}
	return results;
}

const reportedReconciliationFailure = Symbol("reportedReconciliationFailure");
export const isReportedReconciliationFailure = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	(error as Record<symbol, unknown>)[reportedReconciliationFailure] === true;

export const normalizedReconciliationFailure = (): Extract<ReadResult, { kind: "error" }> => ({
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
	category: ReconciliationErrorCategory,
) =>
	logReconciliationError({
		installationId,
		operation:
			category === "bookkeeping" || result.operation === "reconciliation"
				? event.replace(/ failed$/, "")
				: (result.operation ?? event),
		category,
		status: category === "bookkeeping" ? undefined : result.status,
	});

export async function persistReconciliationFailure(
	db: Db,
	installationId: string,
	result: Extract<ReadResult, { kind: "error" }>,
) {
	const users = await db.users
		.find({ "installations.installationId": installationId }, { projection: { _id: 1 } })
		.toArray();
	await Promise.all(
		users.map((user) =>
			mutateUser(db, user._id, (aggregate) => {
				const installation = aggregate.installations.find((item) => item.installationId === installationId);
				if (installation && (!installation.accountLogin || approvedInstallationAccount(installation.accountLogin))) {
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
	const user = await db.users.findOne({ _id: userId }, { projection: { installations: 1 } });
	return [
		...new Set(
			user?.installations
				.filter((item) => !item.accountLogin || approvedInstallationAccount(item.accountLogin))
				.map((item) => item.installationId) ?? [],
		),
	].sort();
}
