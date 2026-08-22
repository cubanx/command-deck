import { createSign } from "node:crypto";
import type { Db, ReconciliationEvidence } from "#/db";
import { appendReconciliationEvidence, mutateUser } from "#/db";
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
		if (!Array.isArray(page) && !Array.isArray((page as any).repositories))
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
		all.push(...(Array.isArray(page) ? page : (page as any).repositories));
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
	}>;
	const openSpecTasks: OpenSpecTask[] = [];
	for (const repo of repositories) {
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
			deployments: deploymentRows as Record<string, unknown>[],
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
