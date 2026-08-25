import { readFileSync } from "node:fs";
import {
	bindInstallation,
	consumeOAuthState,
	createOAuthState,
	createSession,
	dashboardForUser,
	LOCAL_DEMO_USER,
	seedLocalDemo,
	sessionUser,
	upsertIdentity,
} from "#/access";
import type { Config } from "#/config";
import { loadConfig } from "#/config";
import type { Db, MergeIntent } from "#/db";
import { databaseReady, initializeDatabase, openDatabase } from "#/db";
import {
	acceptGitHubDelivery,
	drainInbox,
	githubSignatureValid,
	markDeliveriesRepairedByReconciliation,
} from "#/events";
import {
	approvedInstallationIdsForUser,
	bootstrapInstallation,
	type GitHubRequestFailure,
	githubAppJwt,
	githubErrorDiagnostic,
	githubFetch,
	githubNextLink,
	installationToken,
	logReconciliationFailure,
	normalizedReconciliationFailure,
	persistReconciliationFailure,
	type ReadResult,
	reconcileInstallations,
	reconcilePullRequest,
} from "#/github";
import { approvedInstallationAccount } from "#/installations";
import {
	advanceMergeIntent,
	authorizeBeforeInstallation,
	confirmExactMerge,
	createMergeIntent,
	mergeEligibility,
	mergeIntentFor,
	mergeIntentHash,
} from "#/merge";
import {
	countedFetch,
	createReconciliationCoordinator,
} from "#/reconciliation-coordinator";
import { createWeekdayReconciliationScheduler } from "#/reconciliation-scheduler";
import { buildBrowserScript } from "#/web/build";

type AppDependencies = {
	bootstrapInstallation?: typeof bootstrapInstallation;
	reconcileInstallations?: typeof reconcileInstallations;
	reconcilePullRequest?: typeof reconcilePullRequest;
};

const lifecycleChangedFields = (
	before: Record<string, unknown> | undefined,
	after: unknown,
) => {
	if (!after || typeof after !== "object") return [];
	return [
		["state", "state"],
		["draft", "draft"],
		["head_sha", "head"],
		["mergeable", "mergeability"],
		["unresolved_review_threads", "review_threads"],
		["changes_requested", "reviews"],
		["required_checks", "required_checks"],
		["workflow_state", "actions"],
		["checks_state", "checks"],
		["labels", "labels"],
	].flatMap(([field, category]) =>
		JSON.stringify(before?.[field]) ===
		JSON.stringify((after as Record<string, unknown>)[field])
			? []
			: [category],
	);
};

const cookie = (request: Request) =>
	request.headers.get("cookie")?.match(/(?:^|; )dcc_session=([^;]+)/)?.[1];
const webAsset = (name: string) =>
	readFileSync(new URL(`./web/${name}`, import.meta.url), "utf8");
const html = webAsset("index.html");
const css = webAsset("app.css");
const retirementWorker = webAsset("sw.js");

type SessionIdentity = { id: string; login?: string };
type MergeProvider = {
	inspect(intent: MergeIntent): Promise<Record<string, unknown>>;
	merge(
		intent: MergeIntent,
		variables: Record<string, string>,
	): Promise<Record<string, unknown>>;
};
type AppContext = {
	db: Db;
	config: Config;
	initialized: Promise<unknown>;
	streams: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>;
	encoder: TextEncoder;
	authenticated(request: Request): Promise<SessionIdentity | null>;
	reconcile(
		userId?: string,
		trigger?: "scheduled" | "webhook" | "startup" | "manual",
		installationIds?: string[],
	): Promise<"success" | "running" | "failed" | "missing">;
	reconcilePullRequest(target: {
		installationId: string;
		repositoryId: string;
		number: number;
	}): Promise<"success" | "failed">;
	scheduleDrain(): Promise<void>;
	refresh(userId: string): void;
	mergeProvider?: MergeProvider;
	bootstrapInstallation?: typeof bootstrapInstallation;
};

const freshShellHeaders = { "cache-control": "no-cache" };
const textAssets = new Map<string, [string, string, HeadersInit?]>([
	["/", [html, "text/html; charset=utf-8", freshShellHeaders]],
	["/configuration", [html, "text/html; charset=utf-8", freshShellHeaders]],
	["/app.css", [css, "text/css", freshShellHeaders]],
	[
		"/manifest.webmanifest",
		[webAsset("manifest.webmanifest"), "application/manifest+json"],
	],
]);
const iconAssets = new Map<string, [string, string]>([
	["/avatar-fixture.svg", ["avatar-fixture.svg", "image/svg+xml"]],
	["/icon.svg", ["icon.svg", "image/svg+xml"]],
	["/icon-adaptive.svg", ["icon-adaptive.svg", "image/svg+xml"]],
	["/favicon-32.png", ["favicon-32.png", "image/png"]],
	["/apple-touch-icon.png", ["apple-touch-icon.png", "image/png"]],
	["/icon-192.png", ["icon-192.png", "image/png"]],
	["/icon-512.png", ["icon-512.png", "image/png"]],
	["/icon-maskable-512.png", ["icon-maskable-512.png", "image/png"]],
]);

const publicResponse = async (path: string) => {
	if (path === "/sw.js")
		return new Response(retirementWorker, {
			headers: {
				"content-type": "text/javascript",
				"cache-control": "no-cache",
			},
		});
	if (path === "/app.js")
		return new Response(await buildBrowserScript(), {
			headers: { "content-type": "text/javascript", ...freshShellHeaders },
		});
	const text = textAssets.get(path);
	if (text)
		return new Response(text[0], {
			headers: { "content-type": text[1], ...text[2] },
		});
	const icon = iconAssets.get(path);
	return icon
		? new Response(
				readFileSync(new URL(`../assets/${icon[0]}`, import.meta.url)),
				{
					headers: { "content-type": icon[1] },
				},
			)
		: undefined;
};

const boundedBody = async (request: Request, limit = 1_000_000) => {
	if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
	const reader = request.body?.getReader();
	if (!reader) return "";
	const decoder = new TextDecoder();
	let size = 0;
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > limit) return null;
		text += decoder.decode(value, { stream: true });
	}
};

const trustedOrigin = (request: Request, config: Config) => {
	if (!config.production) return true;
	if (!config.publicUrl) return false;
	const origin = new URL(config.publicUrl);
	const header = (name: string) =>
		request.headers.get(name)?.split(",", 1)[0]?.trim();
	return (
		header("x-forwarded-proto") === "https" &&
		header("x-forwarded-host") === origin.host
	);
};
const escapeHtml = (value: unknown) =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const githubJson = async (url: string, token: string) => {
	const response = await githubFetch(fetch, url, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
		},
	});
	return response.ok
		? ((await response.json()) as Record<string, unknown>)
		: null;
};

const githubRead = async (url: string, token: string) => {
	const response = await githubFetch(fetch, url, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
		},
	});
	return {
		status: response.status,
		body: response.ok ? await response.json() : null,
	};
};

const logGitHubRequestFailure = (failure: GitHubRequestFailure) =>
	console.error("GitHub request failed", JSON.stringify(failure));

const successfulEvidence = (
	items: Array<Record<string, unknown>> | undefined,
	noRequirements: boolean,
) =>
	Array.isArray(items) &&
	(items.length === 0
		? noRequirements
		: items.every((item) => item.conclusion === "success"));

const latestReviewState = (reviews: Array<Record<string, unknown>>) => {
	const currentByReviewer = new Map<
		string,
		{ state: string; submittedAt: number }
	>();
	for (const review of reviews) {
		const state = String(review.state ?? "").toUpperCase();
		if (!["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(state))
			continue;
		const user = review.user as Record<string, unknown> | undefined;
		const reviewer = String(user?.id ?? user?.login ?? "");
		const submittedAt = Date.parse(
			String(review.submitted_at ?? review.updated_at ?? ""),
		);
		if (!reviewer || !Number.isFinite(submittedAt)) return "unknown";
		const current = currentByReviewer.get(reviewer);
		if (!current || submittedAt >= current.submittedAt)
			currentByReviewer.set(reviewer, { state, submittedAt });
	}
	const states = [...currentByReviewer.values()].map((review) => review.state);
	if (states.includes("CHANGES_REQUESTED")) return "changes_requested";
	if (states.includes("APPROVED")) return "approved";
	return "unknown";
};

const inspectMerge = async (
	intent: MergeIntent,
	tokenFor: (intent: MergeIntent) => Promise<string>,
) => {
	const token = await tokenFor(intent);
	const pullRequest = await githubJson(
		`https://api.github.com/repositories/${encodeURIComponent(intent.repositoryId)}/pulls/${intent.pullRequestNumber}`,
		token,
	);
	if (!pullRequest) return {};
	const head = pullRequest.head as Record<string, unknown> | undefined;
	const base = pullRequest.base as Record<string, unknown> | undefined;
	const sha = String(head?.sha ?? "");
	const branch = encodeURIComponent(String(base?.ref ?? ""));
	const [workflows, repository, checks, reviews, protectionRead, rulesRead] =
		await Promise.all([
			githubJson(
				`https://api.github.com/repositories/${encodeURIComponent(intent.repositoryId)}/actions/runs?head_sha=${encodeURIComponent(sha)}`,
				token,
			),
			githubJson(
				`https://api.github.com/repositories/${encodeURIComponent(intent.repositoryId)}`,
				token,
			),
			githubJson(
				`https://api.github.com/repositories/${encodeURIComponent(intent.repositoryId)}/commits/${encodeURIComponent(sha)}/check-runs`,
				token,
			),
			githubJson(
				`https://api.github.com/repositories/${encodeURIComponent(intent.repositoryId)}/pulls/${intent.pullRequestNumber}/reviews`,
				token,
			),
			githubRead(
				`https://api.github.com/repos/${intent.fullName}/branches/${branch}/protection`,
				token,
			),
			githubRead(
				`https://api.github.com/repos/${intent.fullName}/rules/branches/${branch}`,
				token,
			),
		]);
	const checkRuns = checks?.check_runs as
		| Array<Record<string, unknown>>
		| undefined;
	const workflowRuns = workflows?.workflow_runs as
		| Array<Record<string, unknown>>
		| undefined;
	const reviewList = Array.isArray(reviews) ? reviews : [];
	const protection = protectionRead.body as Record<string, unknown> | null;
	const requiredChecks = protection?.required_status_checks as
		| Record<string, unknown>
		| undefined;
	const requiredReviewPolicy = protection?.required_pull_request_reviews;
	const requiredCheckContexts = requiredChecks?.contexts;
	const noClassicRequirements =
		protectionRead.status === 404 ||
		(protectionRead.status === 200 &&
			Boolean(protection) &&
			(!requiredChecks ||
				(Array.isArray(requiredCheckContexts) &&
					requiredCheckContexts.length === 0)) &&
			!requiredReviewPolicy &&
			!protection?.restrictions &&
			!protection?.required_signatures &&
			!protection?.required_linear_history &&
			!protection?.required_conversation_resolution &&
			!protection?.required_commit_signatures &&
			!protection?.required_deployments);
	const noBranchRequirements =
		rulesRead.status === 200 &&
		Array.isArray(rulesRead.body) &&
		rulesRead.body.length === 0 &&
		noClassicRequirements;
	const reviewState = latestReviewState(reviewList);
	return {
		pullRequestId: pullRequest.node_id,
		state: pullRequest.state,
		draft: pullRequest.draft,
		head_sha: sha,
		mergeable:
			pullRequest.mergeable === true ? "clean" : pullRequest.mergeable_state,
		workflow_state: successfulEvidence(workflowRuns, noBranchRequirements)
			? "success"
			: "unknown",
		checks_state: successfulEvidence(checkRuns, noBranchRequirements)
			? "success"
			: "unknown",
		review_state:
			reviewState === "changes_requested"
				? reviewState
				: noBranchRequirements || reviewState === "approved"
					? "approved"
					: "unknown",
		merge_method: repository?.allow_merge_commit === true ? "MERGE" : "unknown",
		protection: noBranchRequirements ? "clear" : "unknown",
	};
};

export const defaultMergeProvider = (
	config: Config,
): MergeProvider | undefined => {
	if (!config.githubAppId || !config.githubAppPrivateKey) return undefined;
	const jwt = githubAppJwt(
		config.githubAppId,
		config.githubAppPrivateKey.replace(/\\n/g, "\n"),
	);
	const tokenFor = (intent: MergeIntent) =>
		installationToken(jwt, intent.installationId);
	return {
		inspect: (intent) => inspectMerge(intent, tokenFor),
		async merge(intent, variables) {
			const response = await githubFetch(
				fetch,
				"https://api.github.com/graphql",
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${await tokenFor(intent)}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						query:
							"mutation MergePullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!, $mergeMethod: PullRequestMergeMethod!) { mergePullRequest(input: { pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid, mergeMethod: $mergeMethod }) { pullRequest { merged } } }",
						variables,
					}),
				},
			);
			if (!response.ok) return { errors: [{ type: "FORBIDDEN" }] };
			const body = (await response.json()) as {
				data?: { mergePullRequest?: { pullRequest?: { merged?: boolean } } };
				errors?: Array<{ type?: string }>;
			};
			return {
				merged: body.data?.mergePullRequest?.pullRequest?.merged === true,
				errors: body.errors,
			};
		},
	};
};

const readyResponse = async (context: AppContext) => {
	try {
		await context.initialized;
		await databaseReady(context.db);
		return Response.json({ ok: true });
	} catch (error) {
		console.error(
			"MongoDB readiness failed",
			error instanceof Error ? error.message : "unknown error",
		);
		return new Response("not ready", { status: 503 });
	}
};

const sessionRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	if (path === "/api/snapshot") {
		const user = await context.authenticated(request);
		return user
			? Response.json(await dashboardForUser(context.db, user.id))
			: new Response("unauthenticated", { status: 401 });
	}
	if (path !== "/events") return undefined;
	const user = await context.authenticated(request);
	if (!user) return new Response("unauthenticated", { status: 401 });
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const set = context.streams.get(user.id) ?? new Set();
			set.add(controller);
			context.streams.set(user.id, set);
			controller.enqueue(
				context.encoder.encode("event: refresh\\ndata: {}\\n\\n"),
			);
			request.signal.addEventListener("abort", () => {
				set.delete(controller);
				if (!set.size) context.streams.delete(user.id);
			});
		},
	});
	return new Response(stream, {
		headers: {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		},
	});
};

const beginOAuth = async (context: AppContext, request: Request) => {
	if (!trustedOrigin(request, context.config))
		return new Response("invalid public origin", { status: 400 });
	if (!context.config.githubClientId)
		return new Response("GitHub OAuth is not configured", { status: 503 });
	const state = await createOAuthState(context.db);
	const redirect = context.config.oauthCallbackUrl
		? `&redirect_uri=${encodeURIComponent(context.config.oauthCallbackUrl)}`
		: "";
	return Response.redirect(
		`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(context.config.githubClientId)}&state=${encodeURIComponent(state)}${redirect}`,
		302,
	);
};

const beginInstall = async (context: AppContext, request: Request) => {
	const user = await context.authenticated(request);
	if (!user || !context.config.githubAppSlug)
		return new Response("GitHub App installation is not configured", {
			status: 503,
		});
	const state = await createOAuthState(context.db);
	return Response.redirect(
		`https://github.com/apps/${encodeURIComponent(context.config.githubAppSlug)}/installations/new?state=${encodeURIComponent(state)}`,
		302,
	);
};

type VerifiedInstallation = { id: number; account?: { login?: string } };
const verifyInstallation = async (
	accessToken: string,
	installationId: string,
) => {
	const headers = {
		authorization: `Bearer ${accessToken}`,
		accept: "application/vnd.github+json",
	};
	let next: string | undefined =
		"https://api.github.com/user/installations?per_page=100";
	let verified: VerifiedInstallation | undefined;
	const seen = new Set([next]);
	for (let pages = 0; next && pages < 100; pages++) {
		const response: Response = await githubFetch(fetch, next, { headers });
		if (!response.ok) return { failed: true };
		const body = (await response.json()) as {
			installations?: VerifiedInstallation[];
		};
		verified =
			body.installations?.find((item) => String(item.id) === installationId) ??
			verified;
		try {
			next = githubNextLink(response.headers.get("link"), seen);
		} catch {
			return { failed: true };
		}
		if (verified) break;
	}
	return { failed: false, verified };
};

const queueBootstrap = (context: AppContext, installationId: string) => {
	const { githubAppId, githubAppPrivateKey } = context.config;
	if (!context.bootstrapInstallation && (!githubAppId || !githubAppPrivateKey))
		return;
	queueMicrotask(() => {
		void (async () => {
			let result: ReadResult,
				classification = "ReadResult";
			try {
				if (context.bootstrapInstallation)
					result = await context.bootstrapInstallation(
						context.db,
						installationId,
						"",
						fetch,
						"",
					);
				else {
					const appJwt = githubAppJwt(
						githubAppId!,
						githubAppPrivateKey!.replace(/\\n/g, "\n"),
					);
					const token = await installationToken(appJwt, installationId);
					result = await bootstrapInstallation(
						context.db,
						installationId,
						token,
						fetch,
						appJwt,
						undefined,
						logGitHubRequestFailure,
					);
				}
			} catch (error) {
				result = normalizedReconciliationFailure();
				classification = error instanceof Error ? "Error" : "unknown";
			}
			if (result.kind === "error") {
				try {
					await persistReconciliationFailure(
						context.db,
						installationId,
						result,
					);
				} catch (error) {
					logReconciliationFailure(
						"installation bootstrap persistence failed",
						installationId,
						result,
						error instanceof Error ? "Error" : "unknown",
					);
				}
				logReconciliationFailure(
					"installation bootstrap failed",
					installationId,
					result,
					classification,
				);
			} else {
				if (result.kind === "changed")
					for (const user of await context.db.users
						.find(
							{ "installations.installationId": installationId },
							{ projection: { _id: 1 } },
						)
						.toArray())
						context.refresh(user._id);
				await context.scheduleDrain();
			}
		})();
	});
};

const oauthCallback = async (
	context: AppContext,
	request: Request,
	url: URL,
) => {
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const installationId = url.searchParams.get("installation_id");
	const { githubClientId, githubClientSecret } = context.config;
	if (
		!trustedOrigin(request, context.config) ||
		!code ||
		!state ||
		!(await consumeOAuthState(context.db, state)) ||
		!githubClientId ||
		!githubClientSecret
	)
		return new Response("invalid OAuth callback", { status: 400 });
	const tokenResponse = await githubFetch(
		fetch,
		"https://github.com/login/oauth/access_token",
		{
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				client_id: githubClientId,
				client_secret: githubClientSecret,
				code,
			}),
		},
	);
	const accessToken = (
		(await tokenResponse.json()) as { access_token?: string }
	).access_token;
	if (!accessToken)
		return new Response("GitHub sign-in failed", { status: 502 });
	const headers = {
		authorization: `Bearer ${accessToken}`,
		accept: "application/vnd.github+json",
	};
	const identity = (await (
		await githubFetch(fetch, "https://api.github.com/user", { headers })
	).json()) as { id: number; login: string; avatar_url?: string };
	const userId = String(identity.id);
	await upsertIdentity(context.db, userId, identity.login, identity.avatar_url);
	if (installationId && /^\d+$/.test(installationId)) {
		const verification = await verifyInstallation(accessToken, installationId);
		if (verification.failed)
			return new Response("GitHub installation verification failed", {
				status: 502,
			});
		if (!verification.verified)
			return new Response("unverified installation", { status: 403 });
		if (
			!approvedInstallationAccount(verification.verified.account?.login) ||
			!(await bindInstallation(
				context.db,
				userId,
				installationId,
				verification.verified.account?.login,
			))
		)
			return new Response("unapproved installation", { status: 403 });
		context.refresh(userId);
		queueBootstrap(context, installationId);
	}
	const session = await createSession(context.db, userId);
	return new Response(null, {
		status: 302,
		headers: {
			location: context.config.publicUrl ?? new URL("/", url).toString(),
			"set-cookie": `dcc_session=${session.token}; HttpOnly;${context.config.secureCookies ? " Secure;" : ""} SameSite=Lax; Path=/; Max-Age=2592000`,
		},
	});
};

const currentMergeTarget = async (
	context: AppContext,
	userId: string,
	intent: MergeIntent,
) => {
	const dashboard = await dashboardForUser(context.db, userId);
	return dashboard.pullRequests.find(
		(item) =>
			String(item.installation_id) === intent.installationId &&
			String(item.repository_id) === intent.repositoryId &&
			String(item.full_name) === intent.fullName &&
			Number(item.number) === intent.pullRequestNumber &&
			String(item.head_sha) === intent.headSha &&
			item.installation_pull_requests === "write",
	);
};

const mergeCallback = async (
	context: AppContext,
	request: Request,
	url: URL,
) => {
	const code = url.searchParams.get("code"),
		state = url.searchParams.get("state");
	if (!code || !state) return oauthCallback(context, request, url);
	const intent = await mergeIntentFor(context.db, state);
	if (!intent) return oauthCallback(context, request, url);
	const user = await context.authenticated(request);
	if (
		!user ||
		intent.userId !== user.id ||
		intent.sessionId !== mergeIntentHash(cookie(request) ?? "")
	)
		return new Response("invalid merge authorization", { status: 403 });
	const {
		githubClientId,
		githubClientSecret,
		githubAppId,
		githubAppPrivateKey,
	} = context.config;
	if (
		!githubClientId ||
		!githubClientSecret ||
		!githubAppId ||
		!githubAppPrivateKey
	)
		return new Response("merge is unavailable", { status: 503 });
	const tokenResponse = await githubFetch(
		fetch,
		"https://github.com/login/oauth/access_token",
		{
			method: "POST",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				client_id: githubClientId,
				client_secret: githubClientSecret,
				code,
			}),
		},
	);
	const userToken = ((await tokenResponse.json()) as { access_token?: string })
		.access_token;
	if (!userToken)
		return new Response("merge authorization failed", { status: 502 });
	const identity = (await (
		await githubFetch(fetch, "https://api.github.com/user", {
			headers: { authorization: `Bearer ${userToken}` },
		})
	).json()) as { id?: number | string; login?: string };
	if (
		String(identity.id ?? "") !== user.id ||
		!identity.login ||
		identity.login.toLowerCase() !== String(user.login).toLowerCase()
	)
		return new Response("merge authorization failed", { status: 403 });
	if (!(await currentMergeTarget(context, user.id, intent)))
		return new Response("merge authorization failed", { status: 403 });
	const installed = await authorizeBeforeInstallation({
		fetcher: fetch,
		userToken,
		login: identity.login,
		fullName: intent.fullName,
		installationToken: () =>
			installationToken(
				githubAppJwt(githubAppId, githubAppPrivateKey.replace(/\\n/g, "\n")),
				intent.installationId,
			),
	});
	if (!installed)
		return new Response("merge authorization failed", { status: 403 });
	const projected = await currentMergeTarget(context, user.id, intent);
	if (!projected)
		return new Response("merge authorization failed", { status: 403 });
	const provider = context.mergeProvider;
	if (!provider) return new Response("merge is unavailable", { status: 503 });
	let authoritative: Record<string, unknown>;
	try {
		authoritative = {
			...(await provider.inspect(intent)),
			labels: projected.labels,
			open_specs: projected.open_specs,
			open_spec: projected.open_spec,
		};
	} catch (error) {
		console.error(
			"merge eligibility read failed",
			error instanceof Error ? error.message : "unknown error",
		);
		return new Response("merge eligibility is unavailable", { status: 502 });
	}
	const pullRequestId = authoritative.pullRequestId;
	if (typeof pullRequestId !== "string" || !mergeEligibility(authoritative).ok)
		return new Response("merge eligibility is unavailable", { status: 409 });
	if (
		!(await advanceMergeIntent(
			context.db,
			state,
			"started",
			"authorized",
			undefined,
			{
				pullRequestId,
			},
		))
	)
		return new Response("merge authorization failed", { status: 409 });
	return new Response(
		`<!doctype html><title>Confirm merge</title><main><h1>Confirm merge</h1><p>${escapeHtml(intent.fullName)} #${intent.pullRequestNumber} · ${escapeHtml(intent.pullRequestTitle)}</p><p>Head: ${escapeHtml(intent.headSha)}</p><p>Method: MERGE</p><form method="post" action="/api/merge/confirm"><input type="hidden" name="confirmation" value="${escapeHtml(state)}"><button type="submit">Confirm MERGE</button></form></main>`,
		{ headers: { "content-type": "text/html; charset=utf-8" } },
	);
};

const authRoute = (
	context: AppContext,
	request: Request,
	url: URL,
): Promise<Response> | Response | undefined => {
	switch (url.pathname) {
		case "/auth/github":
			return beginOAuth(context, request);
		case "/install/github":
			return beginInstall(context, request);
		case "/auth/github/callback":
			return mergeCallback(context, request, url);
		case "/auth/github/setup":
			return new Response("unverified installation binding is not supported", {
				status: 410,
			});
	}
};

const webhookRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	if (path !== "/webhooks/github" || request.method !== "POST")
		return undefined;
	const body = await boundedBody(request);
	const delivery = request.headers.get("x-github-delivery");
	const event = request.headers.get("x-github-event");
	if (body === null) return new Response("payload too large", { status: 413 });
	if (
		!delivery ||
		!event ||
		!context.config.githubWebhookSecret ||
		!githubSignatureValid(
			body,
			request.headers.get("x-hub-signature-256"),
			context.config.githubWebhookSecret,
		)
	)
		return new Response("invalid GitHub webhook", { status: 401 });
	const intake = await acceptGitHubDelivery(context.db, delivery, event, body);
	if (intake.kind === "malformed")
		return new Response("invalid GitHub webhook body", { status: 400 });
	if (intake.kind === "accepted")
		queueMicrotask(() => void context.scheduleDrain());
	return new Response(null, { status: 202 });
};

const repairRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	const repair = path.match(
		/^\/api\/installations\/(\d+)\/(bootstrap|repair)$/,
	);
	if (!repair || request.method !== "POST") return undefined;
	const user = await context.authenticated(request);
	const installationId = repair[1];
	const binding =
		user &&
		(
			await context.db.users.findOne(
				{ _id: user.id },
				{ projection: { installations: 1 } },
			)
		)?.installations.find((item) => item.installationId === installationId);
	if (
		!binding ||
		(binding.accountLogin && !approvedInstallationAccount(binding.accountLogin))
	)
		return new Response("not found", { status: 404 });
	const { githubAppId, githubAppPrivateKey } = context.config;
	if (!context.bootstrapInstallation && (!githubAppId || !githubAppPrivateKey))
		return new Response("GitHub App is not configured", { status: 503 });
	try {
		const appJwt = context.bootstrapInstallation
			? ""
			: githubAppJwt(githubAppId!, githubAppPrivateKey!.replace(/\\n/g, "\n"));
		const token = context.bootstrapInstallation
			? ""
			: await installationToken(appJwt, installationId);
		const result = await (
			context.bootstrapInstallation ?? bootstrapInstallation
		)(context.db, installationId, token, fetch, appJwt);
		if (result.kind === "error")
			await persistReconciliationFailure(context.db, installationId, result);
		else {
			await markDeliveriesRepairedByReconciliation(
				context.db,
				installationId,
				result.kind === "changed" && Array.isArray(result.body)
					? result.body.map((repository: { id?: unknown }) =>
							String(repository.id ?? ""),
						)
					: [],
			);
			if (result.kind === "changed")
				for (const affected of await context.db.users
					.find(
						{ "installations.installationId": installationId },
						{ projection: { _id: 1 } },
					)
					.toArray())
					context.refresh(affected._id);
			void context.scheduleDrain();
		}
		return Response.json(result);
	} catch (error) {
		const result = normalizedReconciliationFailure();
		await persistReconciliationFailure(context.db, installationId, result);
		logReconciliationFailure(
			"installation repair failed",
			installationId,
			result,
			error instanceof Error ? "Error" : "unknown",
		);
		return Response.json(result);
	}
};

const reconcileRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	if (request.method !== "POST") return undefined;
	const user = await context.authenticated(request);
	if (!user) return new Response("unauthenticated", { status: 401 });
	if (path === "/api/reconcile") {
		const body = await boundedBody(request, 4_000);
		let installationIds: string[] | undefined;
		if (body) {
			try {
				const installationId = String(JSON.parse(body).installationId ?? "");
				if (!installationId)
					return new Response("invalid reconciliation request", {
						status: 400,
					});
				if (
					!(await approvedInstallationIdsForUser(context.db, user.id)).includes(
						installationId,
					)
				)
					return new Response("not found", { status: 404 });
				installationIds = [installationId];
			} catch {
				return new Response("invalid reconciliation request", { status: 400 });
			}
		}
		const status = await context.reconcile(user.id, "manual", installationIds);
		if (status === "missing") return new Response("not found", { status: 404 });
		return Response.json(
			{ status },
			{ status: status === "failed" ? 502 : status === "running" ? 202 : 200 },
		);
	}
	if (
		!["/api/reconcile/pull-request", "/api/reconcile/pull-requests"].includes(
			path,
		)
	)
		return undefined;
	if (!(await approvedInstallationIdsForUser(context.db, user.id)).length)
		return new Response("not found", { status: 404 });
	const targets = (await dashboardForUser(context.db, user.id)).pullRequests
		.filter((pullRequest) => pullRequest.state === "open")
		.map((pullRequest) => ({
			installationId: String(pullRequest.installation_id),
			repositoryId: String(pullRequest.repository_id),
			number: Number(pullRequest.number),
		}));
	if (path === "/api/reconcile/pull-request") {
		const body = await boundedBody(request, 4_000);
		if (!body)
			return new Response("invalid reconciliation request", { status: 400 });
		let target: {
			installationId: string;
			repositoryId: string;
			number: number;
		};
		try {
			const parsed = JSON.parse(body);
			target = {
				installationId: String(parsed.installationId),
				repositoryId: String(parsed.repositoryId),
				number: Number(parsed.number),
			};
		} catch {
			return new Response("invalid reconciliation request", { status: 400 });
		}
		if (
			!targets.some(
				(item) =>
					item.installationId === target.installationId &&
					item.repositoryId === target.repositoryId &&
					item.number === target.number,
			)
		)
			return new Response("not found", { status: 404 });
		const status = await context.reconcilePullRequest(target);
		return Response.json(
			{ status },
			{ status: status === "success" ? 200 : 502 },
		);
	}
	const unique = [
		...new Map(
			targets.map((target) => [
				`${target.installationId}:${target.repositoryId}:${target.number}`,
				target,
			]),
		).values(),
	];
	const results = await Promise.all(
		unique.map((target) => context.reconcilePullRequest(target)),
	);
	const failedCount = results.filter((result) => result === "failed").length;
	return Response.json(
		{
			status: failedCount ? "partial_failure" : "success",
			count: unique.length,
			successfulCount: unique.length - failedCount,
			failedCount,
			estimatedProviderRequests: unique.length * 4,
		},
		{ status: failedCount ? 502 : 200 },
	);
};

const mergeRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	if (path !== "/api/merge/start" || request.method !== "POST")
		return undefined;
	if (!trustedOrigin(request, context.config))
		return new Response("invalid public origin", { status: 400 });
	const user = await context.authenticated(request);
	const body = await boundedBody(request, 4_000);
	if (!user) return new Response("unauthenticated", { status: 401 });
	if (!body) return new Response("invalid merge request", { status: 400 });
	let target: {
		installationId?: string;
		repositoryId?: string;
		number?: number;
		headSha?: string;
	};
	try {
		target = request.headers
			.get("content-type")
			?.includes("application/x-www-form-urlencoded")
			? Object.fromEntries(new URLSearchParams(body))
			: JSON.parse(body);
	} catch {
		return new Response("invalid merge request", { status: 400 });
	}
	const dashboard = await dashboardForUser(context.db, user.id);
	const pullRequest = dashboard.pullRequests.find(
		(item) =>
			String(item.installation_id) === target.installationId &&
			String(item.repository_id) === target.repositoryId &&
			Number(item.number) === Number(target.number) &&
			String(item.head_sha) === target.headSha,
	);
	if (!pullRequest) return new Response("not found", { status: 404 });
	if (pullRequest.installation_pull_requests !== "write")
		return new Response("merge permission approval is required", {
			status: 409,
		});
	const session = cookie(request);
	if (!session || !context.config.githubClientId)
		return new Response("merge is unavailable", { status: 503 });
	const state = await createMergeIntent(context.db, {
		userId: user.id,
		sessionId: mergeIntentHash(session),
		installationId: String(target.installationId),
		repositoryId: String(target.repositoryId),
		fullName: String(pullRequest.full_name),
		pullRequestNumber: Number(target.number),
		pullRequestTitle: String(pullRequest.title),
		headSha: String(target.headSha),
	});
	const redirect = context.config.oauthCallbackUrl
		? `&redirect_uri=${encodeURIComponent(context.config.oauthCallbackUrl)}`
		: "";
	return Response.redirect(
		`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(context.config.githubClientId)}&state=${encodeURIComponent(state)}${redirect}`,
		302,
	);
};

const mergeConfirmRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	if (path !== "/api/merge/confirm" || request.method !== "POST")
		return undefined;
	if (!trustedOrigin(request, context.config))
		return new Response("invalid public origin", { status: 400 });
	const user = await context.authenticated(request);
	const body = await boundedBody(request, 4_000);
	if (!user || !body)
		return new Response("invalid merge confirmation", { status: 400 });
	let token: string;
	try {
		const contentType = request.headers.get("content-type") ?? "";
		const confirmation = contentType.includes(
			"application/x-www-form-urlencoded",
		)
			? Object.fromEntries(new URLSearchParams(body))
			: (JSON.parse(body) as { confirmation?: string });
		token = String(confirmation.confirmation ?? "");
	} catch {
		return new Response("invalid merge confirmation", { status: 400 });
	}
	const intent = await mergeIntentFor(context.db, token);
	if (
		!intent ||
		intent.userId !== user.id ||
		intent.sessionId !== mergeIntentHash(cookie(request) ?? "")
	)
		return new Response("invalid merge confirmation", { status: 403 });
	if (!(await advanceMergeIntent(context.db, token, "authorized", "consumed")))
		return new Response("stale merge confirmation", { status: 409 });
	try {
		const provider = context.mergeProvider;
		if (!provider || !intent.pullRequestId)
			return new Response("merge is unavailable", { status: 503 });
		if (!(await currentMergeTarget(context, user.id, intent)))
			return Response.json({ status: "blocked" }, { status: 409 });
		const result = await confirmExactMerge({
			intent: { pullRequestId: intent.pullRequestId, headSha: intent.headSha },
			inspect: async () => {
				const projected = await currentMergeTarget(context, user.id, intent);
				if (!projected) return {};
				return {
					...(await provider.inspect(intent)),
					labels: projected.labels,
					open_specs: projected.open_specs,
					open_spec: projected.open_spec,
				};
			},
			merge: (variables) => provider.merge(intent, variables),
		});
		return Response.json(
			{ status: result },
			{ status: result === "success" ? 200 : 409 },
		);
	} catch (error) {
		console.error(
			"merge confirmation failed",
			error instanceof Error ? error.message : "unknown error",
		);
		return Response.json({ status: "blocked" }, { status: 502 });
	} finally {
		context.refresh(user.id);
	}
};

const handleRequest = async (context: AppContext, request: Request) => {
	const url = new URL(request.url);
	const path = url.pathname;
	const publicAsset = await publicResponse(path);
	if (publicAsset) return publicAsset;
	if (path === "/health") return Response.json({ ok: true });
	if (path === "/ready") return readyResponse(context);
	await context.initialized;
	return (
		(await sessionRoute(context, request, path)) ??
		(await authRoute(context, request, url)) ??
		(await webhookRoute(context, request, path)) ??
		(await repairRoute(context, request, path)) ??
		(await reconcileRoute(context, request, path)) ??
		(await mergeRoute(context, request, path)) ??
		(await mergeConfirmRoute(context, request, path)) ??
		new Response("not found", { status: 404 })
	);
};

type PullRequestTarget = {
	installationId: string;
	repositoryId: string;
	number: number;
};
type ReconciliationOptions = {
	db: Db;
	config: Config;
	dependencies: AppDependencies;
	reconcileAll: typeof reconcileInstallations;
	reconcileTarget: typeof reconcilePullRequest;
	refresh(userId: string): void;
};

const reconcileTargetedPullRequest = async (
	options: ReconciliationOptions,
	target: PullRequestTarget,
) => {
	const { db, config, dependencies, reconcileTarget, refresh } = options;
	const counted = countedFetch(fetch);
	const before = (
		await db.users.findOne(
			{ "installations.installationId": target.installationId },
			{ projection: { installations: 1 } },
		)
	)?.installations
		.find((item) => item.installationId === target.installationId)
		?.repositories.find((item) => item.repositoryId === target.repositoryId)
		?.pullRequests.find((item) => Number(item.number) === target.number);
	const result = dependencies.reconcilePullRequest
		? await reconcileTarget(db, {
				...target,
				token: "",
				fetcher: counted.fetcher,
			})
		: await (async () => {
				const appId = config.githubAppId;
				const privateKey = config.githubAppPrivateKey;
				if (!appId || !privateKey)
					throw new Error("GitHub App is not configured");
				const appJwt = githubAppJwt(appId, privateKey.replace(/\\n/g, "\n"));
				return reconcileTarget(db, {
					...target,
					token: await installationToken(
						appJwt,
						target.installationId,
						counted.fetcher,
					),
					fetcher: counted.fetcher,
				});
			})();
	if (result.kind === "changed")
		for (const user of await db.users
			.find(
				{ "installations.installationId": target.installationId },
				{ projection: { _id: 1 } },
			)
			.toArray())
			refresh(user._id);
	return {
		...result,
		providerRequestCount: counted.count(),
		changedFieldCategories:
			result.kind === "changed"
				? lifecycleChangedFields(before, result.body)
				: [],
	};
};

const createTargetedCoordinator = (options: ReconciliationOptions) =>
	createReconciliationCoordinator({
		reconcilePullRequest: (target) =>
			reconcileTargetedPullRequest(options, target),
		reconcileInstallations: async () => {},
		recordRun: async (run) => {
			await options.db.reconciliationRuns.insertOne(run);
		},
	});

const createBroadReconciler = (options: ReconciliationOptions) => {
	let reconciling: Promise<"success" | "failed"> | undefined;
	return async (
		userId?: string,
		trigger: "scheduled" | "webhook" | "startup" | "manual" = "manual",
		scopedInstallationIds?: string[],
	): Promise<"success" | "running" | "failed" | "missing"> => {
		const { db, config, reconcileAll, refresh } = options;
		const installationIds =
			scopedInstallationIds ??
			(userId ? await approvedInstallationIdsForUser(db, userId) : undefined);
		if (userId && !installationIds?.length) return "missing";
		const appId = config.githubAppId;
		const privateKey = config.githubAppPrivateKey;
		if (!appId || !privateKey) return "failed";
		if (reconciling) return "running";
		const requestCounts = new Map<string, number>();
		const affectedUsers = new Set<string>();
		let activeInstallationId: string | undefined;
		const countingFetch = (...input: Parameters<typeof fetch>) => {
			if (activeInstallationId)
				requestCounts.set(
					activeInstallationId,
					(requestCounts.get(activeInstallationId) ?? 0) + 1,
				);
			return fetch(...input);
		};
		const startedAt = new Date();
		const work = reconcileAll(
			db,
			async (id) => {
				activeInstallationId = id;
				const appJwt = githubAppJwt(appId, privateKey.replace(/\\n/g, "\n"));
				return {
					token: await installationToken(appJwt, id, countingFetch),
					appJwt,
				};
			},
			countingFetch,
			installationIds,
			undefined,
			logGitHubRequestFailure,
			async ({ installationId, result }) => {
				if (result.kind === "changed")
					for (const user of await db.users
						.find(
							{ "installations.installationId": installationId },
							{ projection: { _id: 1 } },
						)
						.toArray())
						affectedUsers.add(user._id);
				const completedAt = new Date();
				const repairedDeliveryCount =
					result.kind !== "changed" || !Array.isArray(result.body)
						? 0
						: await markDeliveriesRepairedByReconciliation(
								db,
								installationId,
								result.body.map((repository: { id?: unknown }) =>
									String(repository.id ?? ""),
								),
							);
				const unresolvedDeliveryCount = await db.inboxDeliveries.countDocuments(
					{
						provider: "github",
						status: "pending_verification",
					},
				);
				await db.reconciliationRuns.insertOne({
					installationId,
					trigger,
					startedAt,
					completedAt,
					durationMs: 0,
					prCount: 0,
					providerRequestCount: requestCounts.get(installationId) ?? 0,
					changedPrCount: result.kind === "changed" ? 1 : 0,
					unchangedPrCount: result.kind === "unchanged" ? 1 : 0,
					changedFieldCategories:
						result.kind === "changed" ? ["installation"] : [],
					failureCount: result.kind === "error" ? 1 : 0,
					unresolvedDeliveryCount,
					repairedDeliveryCount,
					outcome: result.kind === "error" ? "failure" : "success",
				});
			},
		)
			.then(() => "success" as const)
			.catch((error) => {
				console.error("reconciliation failed", error);
				return "failed" as const;
			});
		reconciling = work;
		try {
			const status = await work;
			if (status === "success")
				for (const userId of affectedUsers) refresh(userId);
			return status;
		} finally {
			if (reconciling === work) reconciling = undefined;
		}
	};
};

const knownOpenPullRequests = async (db: Db, initialized: Promise<unknown>) => {
	await initialized;
	return (
		await db.users.find({}, { projection: { installations: 1 } }).toArray()
	).flatMap((user) =>
		user.installations.flatMap((installation) =>
			approvedInstallationAccount(installation.accountLogin)
				? installation.repositories.flatMap((repository) =>
						repository.pullRequests
							.filter((pullRequest) => pullRequest.state === "open")
							.map((pullRequest) => ({
								installationId: installation.installationId,
								repositoryId: repository.repositoryId,
								number: Number(pullRequest.number),
							})),
					)
				: [],
		),
	);
};

const createScheduleDrain = (options: {
	db: Db;
	initialized: Promise<unknown>;
	githubTasks: Parameters<typeof drainInbox>[1];
	reviewBot: Config["reviewBot"];
	targetedCoordinator: ReturnType<typeof createTargetedCoordinator>;
	reconcile: ReturnType<typeof createBroadReconciler>;
	refresh(userId: string): void;
}) => {
	let draining = Promise.resolve();
	let startupReconciled = false;
	return () => {
		draining = draining
			.then(async () => {
				await options.initialized;
				const users = await drainInbox(
					options.db,
					options.githubTasks,
					options.reviewBot,
					undefined,
					undefined,
					(target) => options.targetedCoordinator.enqueue(target, "webhook"),
				);
				for (const user of users) options.refresh(user);
				if (!startupReconciled) {
					startupReconciled = true;
					void options.reconcile(undefined, "startup");
				}
			})
			.catch((error) =>
				console.error(
					"webhook drain failed",
					error instanceof Error ? error.message : "unknown error",
				),
			);
		return draining;
	};
};

export function createApp(
	db: Db,
	config: Config,
	mergeProvider?: AppContext["mergeProvider"],
	dependencies: AppDependencies = {},
) {
	const initialized = initializeDatabase(db).then(() =>
		config.localDemo ? seedLocalDemo(db) : undefined,
	);
	const streams = new Map<
		string,
		Set<ReadableStreamDefaultController<Uint8Array>>
	>();
	const encoder = new TextEncoder();
	const refresh = (userId: string) => {
		for (const controller of streams.get(userId) ?? [])
			controller.enqueue(encoder.encode("event: refresh\\ndata: {}\\n\\n"));
	};
	const reconcileAll =
		dependencies.reconcileInstallations ?? reconcileInstallations;
	const reconcileTarget =
		dependencies.reconcilePullRequest ?? reconcilePullRequest;
	const githubTasks = async (input: {
		installationId: string;
		repositoryId: string;
		path: string;
		sha: string;
	}) => {
		if (!config.githubAppId || !config.githubAppPrivateKey) return null;
		const token = await installationToken(
			githubAppJwt(
				config.githubAppId,
				config.githubAppPrivateKey.replace(/\\n/g, "\n"),
			),
			input.installationId,
		);
		const target = `https://api.github.com/repositories/${input.repositoryId}/contents/${input.path}?ref=${input.sha}`;
		const response = await githubFetch(fetch, target, {
			headers: {
				authorization: `Bearer ${token}`,
				accept: "application/vnd.github.raw",
			},
		});
		if (response.ok) return response.text();
		logGitHubRequestFailure({
			operation: "webhook OpenSpec task fetch",
			status: response.status,
			target,
			diagnostic: await githubErrorDiagnostic(response),
		});
		return null;
	};
	const reconciliationOptions = {
		db,
		config,
		dependencies,
		reconcileAll,
		reconcileTarget,
		refresh,
	};
	const targetedCoordinator = createTargetedCoordinator(reconciliationOptions);
	const reconcile = createBroadReconciler(reconciliationOptions);
	const context = {
		db,
		config,
		initialized,
		streams,
		encoder,
		mergeProvider: mergeProvider ?? defaultMergeProvider(config),
		bootstrapInstallation: dependencies.bootstrapInstallation,
		refresh,
		authenticated: async (request: Request) => {
			if (config.localDemo) return LOCAL_DEMO_USER;
			const token = cookie(request);
			return token ? sessionUser(db, token) : null;
		},
		reconcile,
		reconcilePullRequest: (target) =>
			targetedCoordinator.enqueue(target, "manual"),
		scheduleDrain: async () => {},
	} satisfies AppContext;
	context.scheduleDrain = createScheduleDrain({
		db,
		initialized,
		githubTasks,
		reviewBot: config.reviewBot,
		targetedCoordinator,
		reconcile,
		refresh,
	});
	const scheduler = createWeekdayReconciliationScheduler({
		knownOpenPullRequests: () => knownOpenPullRequests(db, initialized),
		enqueue: targetedCoordinator.enqueue,
	});
	if (config.githubAppId && config.githubAppPrivateKey) scheduler.start();
	return {
		drain: context.scheduleDrain,
		reconcile: () => context.reconcile(),
		fetch: (request: Request) => handleRequest(context, request),
		stop() {
			scheduler.stop();
			targetedCoordinator.stop();
		},
	};
}
if (import.meta.main) {
	const config = loadConfig();
	void openDatabase({
		uriBase: config.mongoUriBase,
		database: config.mongoDatabase,
	})
		.then((db) => {
			const app = createApp(db, config);
			Bun.serve({
				port: config.port,
				hostname: config.hostname,
				idleTimeout: 255,
				fetch: app.fetch,
			});
			void app.drain();
		})
		.catch((error) => {
			console.error(
				"MongoDB startup failed",
				error instanceof Error ? error.message : "unknown error",
			);
			process.exitCode = 1;
		});
}
