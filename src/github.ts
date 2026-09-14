import { createSign, randomUUID } from "node:crypto";
import type {
	Db,
	MergedPullRequestEvidence,
	PullRequest,
	ReconciliationEvidence,
	ReconciliationRunDocument,
	Repository,
	RepositoryDocument,
} from "#/db";
import {
	correlateDeploymentPullRequest,
	deletePullRequest,
	patchPullRequest,
	retainRecentMergedPullRequests,
	upsertDeployment,
	upsertPullRequest,
} from "#/db";
import { latestDeploymentStatus } from "#/deployment-status";
import { approvedInstallationAccount, sameLogin } from "#/installations";
import { detectedOpenSpecSlugs, parseOpenSpecDeclaration, parseTasks } from "#/openspec";
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
	_db: Db,
	_key: string,
	url: string,
	fetcher: FetchLike,
	evidence: Pick<ReconciliationEvidence, "operation" | "repository"> = {
		operation: "unknown",
	},
	collectionKey?: string,
): Promise<ReadResult> {
	const all: unknown[] = [],
		seen = new Set([url]);
	let next: string | undefined = url;
	while (next) {
		let response: Response | undefined;
		let bodylessNotModified = false;
		for (let attempt = 0; attempt < 3; attempt++) {
			response = await githubFetch(fetcher, next, { headers: { accept: "application/vnd.github+json" } });
			if (response.status === 304) {
				if (bodylessNotModified) break;
				bodylessNotModified = true;
				continue;
			}
			const delay = retryDelay(response, attempt);
			if (delay === undefined || attempt === 2) break;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
		if (!response || response.status === 304 || !response.ok)
			return {
				kind: "error",
				message: `GitHub request failed (${response?.status ?? "unknown"})`,
				stale: true,
				...evidence,
				summary: "GitHub request failed",
				status: response?.status,
			};
		let page: unknown;
		try {
			page = await response.json();
		} catch {
			return {
				kind: "error",
				message: "GitHub pagination payload was invalid",
				stale: true,
				...evidence,
				summary: "GitHub pagination payload was invalid",
			};
		}
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
			following = githubNextLink(response.headers.get("link"), seen);
		} catch (error) {
			return {
				kind: "error",
				message: error instanceof Error ? error.message : "GitHub pagination failed",
				stale: true,
				...evidence,
				summary: "GitHub pagination failed",
			};
		}
		all.push(...items);
		next = following;
	}
	return { kind: "changed", body: all };
}
export async function conditionalGet(
	_db: Db,
	_key: string,
	url: string,
	fetcher: FetchLike = fetch,
	evidence: Pick<ReconciliationEvidence, "operation" | "repository"> = {
		operation: "unknown",
	},
): Promise<ReadResult> {
	let response: Response | undefined;
	for (let attempt = 0; attempt < 3; attempt++) {
		response = await githubFetch(fetcher, url, { headers: { accept: "application/vnd.github+json" } });
		if (response.status === 304) {
			if (attempt === 0) continue;
			break;
		}
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
	if (response.status === 304)
		return {
			kind: "error",
			message: "GitHub returned an unexpected not-modified response",
			stale: true,
			...evidence,
			summary: "GitHub returned an unexpected not-modified response",
		};
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
	incomplete?: boolean;
	number: number;
	tasks: OpenSpecTask[];
	/** Evidence read at the immutable merge commit. Never replace this with default-branch progress. */
	mergedTasks?: OpenSpecTask[];
	mergedSourceCommit?: string;
	mergedSourceRef?: string;
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
	const projectTasks = (tasks: OpenSpecTask[] | undefined, ref?: string) =>
		tasks?.map((task) => {
			const progress = parseTasks(task.content);
			return {
				change_name: task.changeName,
				...progress,
				pre_merge_ready: progress.preMergeReady,
				active_group: progress.activeGroup,
				active_groups: progress.activeGroups,
				incomplete_groups: progress.incompleteGroups,
				source_commit: task.sha,
				source_ref: optionalString(ref),
				...(repository
					? {
							source_url: safeUrl(
								`https://github.com/${repository.split("/").map(encodeURIComponent).join("/")}/blob/${encodeURIComponent(task.sha)}/${task.path.split("/").map(encodeURIComponent).join("/")}`,
							),
						}
					: {}),
			};
		});
	const open_specs = projectTasks(evidence?.tasks, optionalString(sourceRef));
	const merged_open_specs = projectTasks(evidence?.mergedTasks, evidence?.mergedSourceRef);
	return {
		open_specs,
		open_spec: open_specs?.[0] ?? null,
		open_spec_declaration: evidence?.declaration ?? "absent",
		detected_open_specs: evidence?.detected ?? [],
		...(evidence?.mergedTasks
			? {
					merged_open_specs,
					merged_source_commit: evidence.mergedSourceCommit,
					merged_source_ref: evidence.mergedSourceRef,
				}
			: {}),
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
	includeRetention?: boolean;
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
			...(input.includeRetention !== false && (declaration.state === "invalid" || input.priorUnresolved)
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
		incomplete: unresolved,
		declaration: declaration.state,
		detected: [],
		...(input.includeRetention !== false && (retentionNeeded || unresolved)
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
	const installation = await db.installations.findOne({ _id: input.installationId });
	if (!installation || !approvedInstallationAccount(installation.accountLogin))
		return { users: [], installation: undefined, repository: undefined };
	const repositoryDocument = await db.repositories.findOne({
		_id: input.repositoryId,
		installationIds: input.installationId,
	});
	if (!repositoryDocument) return { users: [], installation, repository: undefined };
	const [pullRequests, deployments] = await Promise.all([
		db.pullRequests.find({ repositoryId: input.repositoryId }).toArray(),
		db.deployments.find({ repositoryId: input.repositoryId }).toArray(),
	]);
	const repository: Repository = {
		repositoryId: repositoryDocument.repositoryId,
		full_name: repositoryDocument.full_name,
		pullRequests: pullRequests as PullRequest[],
		openSpecs: [],
		deployments: deployments as Record<string, unknown>[],
		...(repositoryDocument.policy ? { policy: repositoryDocument.policy as Repository["policy"] } : {}),
	};
	return {
		users: [],
		installation,
		repository,
	};
};

const removeClosedPullRequest = async (
	db: Db,
	repository: NonNullable<Awaited<ReturnType<typeof loadReconciliationTarget>>["repository"]>,
	input: ReconcilePullRequestInput,
): Promise<ReadResult> => {
	const previous = repository.pullRequests.find((item) => Number(item.number) === input.number) as
		| (PullRequest & { revision?: number })
		| undefined;
	const changed =
		previous?.merged === true
			? false
			: previous
				? await deletePullRequest(db, `${input.repositoryId}:${input.number}`, {
						revision: previous.revision,
						updated_at: previous.updated_at,
					})
				: false;
	return { kind: changed ? "changed" : "unchanged", body: null };
};

const readMergedOpenSpecs = async (
	input: ReconcilePullRequestInput,
	request: FetchLike,
	repository: Repository,
	taskFetcher: TaskFetcher,
	pullRequest: Record<string, unknown>,
): Promise<PullRequestOpenSpecs> => {
	const providerAuthor = optionalString((pullRequest.author as { login?: unknown } | undefined)?.login);
	const matchingPriorPullRequests = repository.pullRequests.filter((item) =>
		sameLogin(item.author_login, providerAuthor),
	);
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
		const mergeCommit = optionalString((pullRequest.mergeCommit as { oid?: unknown } | undefined)?.oid);
		const branchEvidence = await readDefaultBranch(request, repository.full_name);
		if (!mergeCommit)
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
		const mergedEvidence = await fetchMergedOpenSpecTasks({
			installationId: input.installationId,
			repositoryId: input.repositoryId,
			request,
			taskFetcher,
			repository: repository.full_name,
			ref: optionalString(pullRequest.baseRefName) ?? branchEvidence.ref,
			sha: mergeCommit,
			number: input.number,
			body: pullRequest.body,
			priorObligations,
			includeRetention: false,
		});
		const defaultEvidence = await fetchMergedOpenSpecTasks({
			installationId: input.installationId,
			repositoryId: input.repositoryId,
			request,
			taskFetcher,
			repository: repository.full_name,
			ref: branchEvidence.ref,
			sha: branchEvidence.sha,
			number: input.number,
			body: pullRequest.body,
			priorObligations: [
				...priorObligations,
				...mergedEvidence.tasks
					.filter((task) => parseTasks(task.content).postMergeIncomplete)
					.map((task) => task.changeName),
			],
			priorUnresolved: matchingPriorPullRequests.some(
				(item) => Number(item.number) === input.number && item.post_merge_unresolved === true,
			),
		});
		return {
			...defaultEvidence,
			incomplete: mergedEvidence.incomplete || defaultEvidence.incomplete,
			...(mergedEvidence.incomplete ? {} : { mergedTasks: mergedEvidence.tasks }),
			mergedSourceCommit: mergeCommit,
			mergedSourceRef: optionalString(pullRequest.baseRefName) ?? branchEvidence.ref,
		};
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
		? await readMergedOpenSpecs(input, request, repository, taskFetcher, pullRequest)
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
	if (evidence.incomplete) return false;
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

const isRevisionConflict = (error: unknown) => error instanceof Error && error.message.includes("changed concurrently");

const applyOpenPullRequest = async (
	db: Db,
	repository: NonNullable<Awaited<ReturnType<typeof loadReconciliationTarget>>["repository"]>,
	input: ReconcilePullRequestInput,
	read: PullRequestRead,
): Promise<ReadResult> => {
	const { openSpecEvidence, merged } = read;
	const next = pullRequestProjection(repository, input.number, read);
	const previous = repository.pullRequests.find((item) => Number(item.number) === input.number) as
		| (PullRequest & { revision?: number })
		| undefined;
	if (merged && canExcludeMergedPullRequest(openSpecEvidence)) {
		let changed = false;
		if (previous) {
			const current = await db.pullRequests.findOne({ _id: `${input.repositoryId}:${input.number}` });
			if (current?.revision !== previous.revision || current?.head_sha !== previous.head_sha)
				return { kind: "unchanged" };
			try {
				changed = await deletePullRequest(db, `${input.repositoryId}:${input.number}`, {
					revision: previous.revision,
					updated_at: previous.updated_at,
				});
			} catch (error) {
				if (!isRevisionConflict(error)) throw error;
				return { kind: "unchanged" };
			}
		}
		return changed ? { kind: "changed", body: next } : { kind: "unchanged" };
	}
	if (previous?.updated_at && next.updated_at && String(previous.updated_at) > String(next.updated_at))
		return { kind: "unchanged" };
	if (previous?.merged === true && merged !== true) return { kind: "unchanged" };
	const openSpecFields = openSpecProjection(
		openSpecEvidence,
		openSpecEvidence.retention?.sourceRef ?? (read.pullRequest as { headRefName?: unknown }).headRefName,
		repository.full_name,
	);
	const patch = Object.fromEntries(
		Object.entries({ ...next, ...openSpecFields, lifecycle_stale: false }).filter(([, value]) => value !== undefined),
	);
	let changed: boolean;
	if (previous) {
		const current = await db.pullRequests.findOne({ _id: `${input.repositoryId}:${input.number}` });
		if (current?.revision !== previous.revision || current?.head_sha !== previous.head_sha)
			return { kind: "unchanged" };
		const projectedKeys = Object.keys(patch);
		const projectedOpenSpecKeys = new Set(
			[
				"open_specs",
				"open_spec",
				"detected_open_specs",
				"post_merge_source_commit",
				"post_merge_source_ref",
				"post_merge_obligations",
				"post_merge_unresolved",
				"post_merge_state",
				"lifecycle_stale",
				...(openSpecEvidence.mergedTasks === undefined
					? []
					: ["merged_open_specs", "merged_source_commit", "merged_source_ref"]),
			].filter((key) => key in patch),
		);
		if (openSpecEvidence.mergedTasks === undefined && previous?.merged_open_specs !== undefined) {
			projectedOpenSpecKeys.add("merged_open_specs");
			projectedOpenSpecKeys.add("merged_source_commit");
			projectedOpenSpecKeys.add("merged_source_ref");
		}
		const unset = Object.keys(previous).filter(
			(key) =>
				[
					"title",
					"url",
					"state",
					"author_login",
					"merged",
					"retention_candidate",
					"merge_sha",
					"merged_at",
					"draft",
					"opened_at",
					"updated_at",
					"head_ref",
					"base_ref",
					"head_sha",
					"mergeable",
					"labels",
					"review_activity",
					"completed_review_count",
					"unresolved_review_threads",
					"changes_requested",
					"repository_policy_loaded",
					"required_checks",
					"workflow_state",
					"checks_state",
					"open_specs",
					"open_spec",
					"detected_open_specs",
					"merged_open_specs",
					"merged_source_commit",
					"merged_source_ref",
					"post_merge_source_commit",
					"post_merge_source_ref",
					"post_merge_obligations",
					"post_merge_unresolved",
					"post_merge_state",
					"lifecycle_stale",
				].includes(key) &&
				!projectedOpenSpecKeys.has(key) &&
				!projectedKeys.includes(key),
		);
		try {
			changed = await patchPullRequest(db, `${input.repositoryId}:${input.number}`, patch, unset, {
				revision: previous.revision,
				head_sha: previous.head_sha,
				source_commit: previous.source_commit,
			});
		} catch (error) {
			if (!isRevisionConflict(error)) throw error;
			return { kind: "unchanged" };
		}
	} else {
		changed = await upsertPullRequest(db, { repositoryId: input.repositoryId, number: input.number, ...patch });
	}
	return changed ? { kind: "changed", body: next } : { kind: "unchanged" };
};

export async function reconcilePullRequest(db: Db, input: ReconcilePullRequestInput): Promise<ReadResult> {
	const { repository } = await loadReconciliationTarget(db, input);
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
		const read = await readOpenPullRequest(db, input, request, owner, name, repository, stage);
		stage.value = "persistence";
		return read
			? await applyOpenPullRequest(db, repository, input, read)
			: await removeClosedPullRequest(db, repository, input);
	} catch (error) {
		if (isRevisionConflict(error)) return { kind: "unchanged" };
		const details = failureDetails(error);
		const diagnostic = errorField(error, "diagnostic") as GitHubRequestFailure["diagnostic"];
		await input.reportFailure?.({
			operation: `targeted pull request reconciliation ${stage.value}`,
			...details,
			status: details.status ?? 0,
			target: `repositories/${input.repositoryId}/pulls/${input.number}`,
			...(diagnostic ? { diagnostic } : {}),
		});
		await patchPullRequest(db, `${input.repositoryId}:${input.number}`, { lifecycle_stale: true });
		return {
			kind: "error",
			stale: true,
			message: "pull request reconciliation failed",
			operation: "pull_request",
			summary: "Pull request reconciliation failed",
		};
	}
}
const retainedReconciliationTargets = (
	reconciliationPullRequests: PullRequest[],
	installationId: string,
	repositoryId: string,
	pullRequests: unknown[],
) => {
	const targets: Array<{ installationId: string; repositoryId: string; number: number }> = [];
	const seen = new Set<number>();
	for (const pr of reconciliationPullRequests)
		if (
			Number.isSafeInteger(Number(pr.number)) &&
			Number(pr.number) > 0 &&
			!seen.has(Number(pr.number)) &&
			(pr.retention_candidate === true ||
				!pullRequests.some((item) => Number((item as { number?: unknown }).number) === Number(pr.number)))
		) {
			seen.add(Number(pr.number));
			targets.push({ installationId, repositoryId: repositoryId, number: Number(pr.number) });
		}
	return { reconciliationPullRequests, targets };
};

const mergedPullRequestCandidate = (pullRequest: Record<string, unknown>): PullRequest | undefined => {
	const mergedAt = optionalString(pullRequest.merged_at);
	if (pullRequest.merged !== true && !mergedAt) return undefined;
	const number = Number(pullRequest.number);
	if (!Number.isSafeInteger(number) || number <= 0) return undefined;
	const head = (pullRequest.head as { ref?: unknown; sha?: unknown } | undefined) ?? {};
	const base = (pullRequest.base as { ref?: unknown } | undefined) ?? {};
	return {
		number,
		title: optionalString(pullRequest.title),
		url: optionalString(pullRequest.html_url),
		author_login: optionalString((pullRequest.user as { login?: unknown } | undefined)?.login),
		state: "closed",
		merged: true,
		retention_candidate: true,
		merge_sha: optionalString(pullRequest.merge_commit_sha),
		merged_at: mergedAt,
		head_ref: optionalString(head.ref),
		head_sha: optionalString(head.sha),
		base_ref: optionalString(base.ref),
		draft: pullRequest.draft ? 1 : 0,
		opened_at: optionalString(pullRequest.created_at),
		updated_at: optionalString(pullRequest.updated_at),
		body: pullRequest.body,
	};
};

const loadBootstrapIdentity = async (db: Db, installationId: string, identityRequest: FetchLike) => {
	const boundInstallation = await db.installations.findOne({ _id: installationId });
	if (!boundInstallation || !approvedInstallationAccount(boundInstallation.accountLogin))
		return {
			kind: "error" as const,
			stale: true as const,
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
			kind: "error" as const,
			stale: true as const,
			message: "installation account is not approved",
			operation: "installation_identity",
			summary: "Installation account is not approved",
		};
	const body = installation.body as { account?: { login?: unknown }; permissions?: { pull_requests?: unknown } };
	const account = body.account?.login;
	if (!approvedInstallationAccount(account))
		return {
			kind: "error" as const,
			stale: true as const,
			message: "installation account is not approved",
			operation: "installation_identity",
			summary: "Installation account is not approved",
		};
	if (!sameLogin(boundInstallation.accountLogin, account))
		return {
			kind: "error" as const,
			stale: true as const,
			message: "installation account changed",
			operation: "installation_identity",
			summary: "Installation account changed",
		};
	return {
		account,
		permissions: body.permissions,
		boundRepositories: await db.repositories.find({ installationIds: installationId }).toArray(),
	};
};

const persistBootstrapSnapshot = async (
	db: Db,
	installationId: string,
	snapshot: Repository,
	expectedBefore: PullRequest[],
	counts: { prCount: number; changedPrCount: number; unchangedPrCount: number },
) => {
	const existing = (await db.pullRequests.find({ repositoryId: snapshot.repositoryId }).toArray()) as PullRequest[];
	const expectedByNumber = new Map(expectedBefore.map((item) => [Number(item.number), item]));
	const observedNumbers = new Set<number>();
	await db.repositories.updateOne(
		{ _id: snapshot.repositoryId },
		{
			$set: {
				repositoryId: snapshot.repositoryId,
				full_name: snapshot.full_name,
				...(snapshot.policy ? { policy: snapshot.policy } : {}),
			},
			$addToSet: { installationIds: installationId },
		},
		{ upsert: true },
	);
	for (const item of snapshot.pullRequests) {
		const number = Number(item.number);
		if (!Number.isSafeInteger(number) || number <= 0) continue;
		observedNumbers.add(number);
		const expected = expectedByNumber.get(number);
		const current = await db.pullRequests.findOne({ _id: `${snapshot.repositoryId}:${number}` });
		if (
			(expected && (!current || current.revision !== expected.revision || current.head_sha !== expected.head_sha)) ||
			(!expected && current)
		)
			continue;
		const { number: _number, ...fields } = item;
		const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
		const changed = await upsertPullRequest(
			db,
			{ repositoryId: snapshot.repositoryId, number, ...patch },
			expected
				? {
						revision: typeof expected.revision === "number" ? expected.revision : undefined,
						head_sha: expected.head_sha,
					}
				: { absent: true },
		);
		counts.prCount++;
		if (changed) counts.changedPrCount++;
		else counts.unchangedPrCount++;
	}
	for (const item of existing) {
		const number = Number(item.number);
		if (item.state === "open" && item.retention_candidate !== true && !observedNumbers.has(number)) {
			const expected = expectedByNumber.get(number);
			if (!expected || item.revision !== expected.revision || item.head_sha !== expected.head_sha) continue;
			try {
				await deletePullRequest(db, String(item._id), {
					revision: typeof expected.revision === "number" ? expected.revision : undefined,
					updated_at: item.updated_at,
				});
			} catch (error) {
				if (!isRevisionConflict(error)) throw error;
			}
		}
	}
	for (const deployment of snapshot.deployments) {
		const deploymentId = String(deployment.id ?? deployment.deploymentId ?? "");
		if (!deploymentId) continue;
		const { id: _id, deploymentId: _deploymentId, ...fields } = deployment;
		await upsertDeployment(db, { repositoryId: snapshot.repositoryId, deploymentId, id: deploymentId, ...fields });
	}
};

const mergedCandidatesFrom = (body: unknown) =>
	(Array.isArray(body) ? body : [])
		.map((item) => mergedPullRequestCandidate(item as Record<string, unknown>))
		.filter((item): item is PullRequest => item !== undefined);

const recentMergedEvidence = (existing: PullRequest[], mergedCandidates: PullRequest[]) =>
	retainRecentMergedPullRequests(
		existing
			.concat(mergedCandidates)
			.filter((item) => (item.retention_candidate === true || item.merged === true) && typeof item.number === "number")
			.map((item) => ({
				number: Number(item.number),
				title: String(item.title ?? "Untitled"),
				url: String(item.url ?? ""),
				head_sha: String(item.head_sha ?? ""),
				merge_sha: String(item.merge_sha ?? ""),
				merged_at: String(item.merged_at ?? ""),
			})),
	);

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
	const identity = await loadBootstrapIdentity(db, installationId, identityRequest);
	if ("kind" in identity) return identity;
	const { account, permissions, boundRepositories } = identity;
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
	const existingPullRequestsByRepository = new Map<string, PullRequest[]>();
	const openSpecTasks: OpenSpecTask[] = [];
	const retainedTargets: Array<{ installationId: string; repositoryId: string; number: number }> = [];
	for (const repo of repositories) {
		const existingRepository = boundRepositories.find((item) => item.repositoryId === String(repo.id));
		const existingPullRequests = (await db.pullRequests
			.find({ repositoryId: String(repo.id) })
			.toArray()) as PullRequest[];
		existingPullRequestsByRepository.set(String(repo.id), existingPullRequests);
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
		const closedPrs = await pagedGet(
			db,
			`installation:${installationId}:repo:${repo.id}:closed-prs`,
			`https://api.github.com/repositories/${repo.id}/pulls?state=closed&per_page=100`,
			request,
			{ operation: "pull_requests", repository: repo.full_name },
		);
		if (closedPrs.kind !== "changed") return closedPrs;
		const deployments = await bootstrapDeployments(db, installationId, String(repo.id), token, fetcher, repo.full_name);
		if (deployments.kind === "error") return deployments;
		const deploymentRows = deployments.kind === "changed" ? deployments.body : [];
		const pullRequests = Array.isArray(prs.body) ? prs.body : [];
		const mergedCandidates = mergedCandidatesFrom(closedPrs.body);
		const deploymentPullRequests = [
			...pullRequests.map((pr: any) => ({
				...pr,
				url: pr.html_url,
				head_sha: pr.head?.sha,
			})),
			...mergedCandidates,
		];
		const recentMergedPullRequests = recentMergedEvidence(existingPullRequests, mergedCandidates);
		const { reconciliationPullRequests, targets } = retainedReconciliationTargets(
			existingPullRequests
				.filter((item) => item.retention_candidate === true || item.state === "open")
				.concat(mergedCandidates),
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
	const pullRequestsPermission = permissions?.pull_requests;
	const prCounts = { prCount: 0, changedPrCount: 0, unchangedPrCount: 0 };
	for (const snapshot of snapshots)
		await persistBootstrapSnapshot(
			db,
			installationId,
			snapshot,
			existingPullRequestsByRepository.get(snapshot.repositoryId) ?? [],
			prCounts,
		);
	const observedRepositoryIds = new Set(snapshots.map((snapshot) => snapshot.repositoryId));
	for (const repository of boundRepositories)
		if (!observedRepositoryIds.has(repository.repositoryId))
			await db.repositories.updateOne({ _id: repository.repositoryId }, { $pull: { installationIds: installationId } });
	await db.installations.updateOne(
		{ _id: installationId },
		{
			$set: {
				accountLogin: account,
				active: true,
				suspended: false,
				permissions: { pull_requests: typeof pullRequestsPermission === "string" ? pullRequestsPermission : undefined },
				lastSuccessfulSyncAt: new Date(),
			},
			$unset: { lastSyncError: "" },
		},
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
	now = new Date(),
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
		`https://api.github.com/repositories/${repositoryId}/deployments?per_page=100`,
		request,
		{ operation: "deployments", repository },
	);
	if (list.kind !== "changed" || !Array.isArray(list.body)) return list;
	const pendingStates = new Set(["pending", "in_progress", "queued", "requested", "waiting", "expected"]);
	const knownPending = new Map(
		(await db.deployments.find({ repositoryId, state: { $in: [...pendingStates] } }).toArray()).map((item) => [
			String(item.deploymentId ?? item.id ?? ""),
			item,
		]),
	);
	const cutoff = now.getTime() - 48 * 60 * 60_000;
	const recent = (item: Record<string, unknown>) => {
		const timestamp = Date.parse(String(item.created_at ?? item.updated_at ?? ""));
		return !Number.isFinite(timestamp) || timestamp >= cutoff;
	};
	const rows = new Map(
		list.body
			.map((item) => item as Record<string, unknown>)
			.filter((item) => {
				const key = String(item.id ?? "");
				return key && (recent(item) || knownPending.has(key));
			})
			.map((item) => [String(item.id), item]),
	);
	for (const [id, item] of knownPending) if (!rows.has(id)) rows.set(id, { ...item, id });
	const deployments: Record<string, unknown>[] = [];
	for (const item of rows.values()) {
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
	const beginStandaloneRun = async (installationId: string) => {
		const startedAt = new Date();
		const id = randomUUID();
		await db.reconciliationRuns.insertOne({
			_id: id,
			installationId,
			trigger: "manual",
			startedAt,
			status: "running",
		});
		return { id, startedAt };
	};
	const finishStandaloneRun = async (run: { id: string; startedAt: Date }, result: ReadResult) => {
		const completedAt = new Date();
		const operation = result.kind === "error" ? (result.operation ?? "reconciliation") : "reconciliation";
		const summary = result.kind === "error" ? (result.summary ?? "Reconciliation failed") : "Reconciliation completed";
		await db.reconciliationRuns.updateOne(
			{ _id: run.id, status: "running" },
			{
				$set: {
					status: "completed",
					outcome: result.kind === "error" ? "failure" : "success",
					operation,
					summary,
					completedAt,
					durationMs: Math.max(0, completedAt.getTime() - run.startedAt.getTime()),
					...(result.kind === "error" ? { failureCount: 1 } : {}),
				},
			},
		);
	};
	const ids = installationIds
		? [...new Set(installationIds)].sort()
		: [
				...new Set(
					(
						await db.installations
							.find(
								{ active: { $ne: false }, suspended: { $ne: true } },
								{ projection: { installationId: 1, accountLogin: 1 } },
							)
							.toArray()
					)
						.filter((item) => approvedInstallationAccount(item.accountLogin))
						.map((item) => item.installationId),
				),
			].sort();
	const results: Array<{ installationId: string; result: ReadResult }> = [];
	for (const installationId of ids) {
		const startedAt = new Date();
		const standaloneRun = onResult ? undefined : await beginStandaloneRun(installationId);
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
		if (standaloneRun) await finishStandaloneRun(standaloneRun, result);
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
	const installation = await db.installations.findOne({ _id: installationId });
	if (!installation || !approvedInstallationAccount(installation.accountLogin)) return;
	await db.installations.updateOne(
		{ _id: installationId },
		{
			$set: { lastSyncError: result.message.slice(0, 200) },
		},
	);
}

export async function approvedInstallationIdsForUser(db: Db, userId: string) {
	const bindings = await db.bindings.find({ userId }, { projection: { installationId: 1 } }).toArray();
	const installations = await db.installations
		.find(
			{
				_id: { $in: bindings.map((binding) => binding.installationId) },
				active: { $ne: false },
				suspended: { $ne: true },
			},
			{ projection: { installationId: 1, accountLogin: 1 } },
		)
		.toArray();
	return installations
		.filter((installation) => approvedInstallationAccount(installation.accountLogin))
		.map((installation) => installation.installationId)
		.sort();
}
