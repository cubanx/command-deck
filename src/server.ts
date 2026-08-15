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
} from "#/events";
import {
	approvedInstallationIdsForUser,
	bootstrapInstallation,
	githubAppJwt,
	githubNextLink,
	installationToken,
	reconcileInstallations,
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
import { buildBrowserScript } from "#/web/build";

const cookie = (request: Request) =>
	request.headers.get("cookie")?.match(/(?:^|; )dcc_session=([^;]+)/)?.[1];
const webAsset = (name: string) =>
	readFileSync(new URL(`./web/${name}`, import.meta.url), "utf8");
const html = webAsset("index.html");
const css = webAsset("app.css");
const manifest = webAsset("manifest.webmanifest");
const worker = webAsset("sw.js");

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
	): Promise<"success" | "running" | "failed" | "missing">;
	scheduleDrain(): Promise<void>;
	refresh(userId: string): void;
	mergeProvider?: MergeProvider;
};

const textAssets = new Map<string, [string, string, HeadersInit?]>([
	["/", [html, "text/html; charset=utf-8"]],
	["/app.css", [css, "text/css"]],
	["/manifest.webmanifest", [manifest, "application/manifest+json"]],
	["/sw.js", [worker, "text/javascript", { "cache-control": "no-cache" }]],
]);
const iconAssets = new Map<string, [string, string]>([
	["/icon.svg", ["icon.svg", "image/svg+xml"]],
	["/icon-adaptive.svg", ["icon-adaptive.svg", "image/svg+xml"]],
	["/favicon-32.png", ["favicon-32.png", "image/png"]],
	["/apple-touch-icon.png", ["apple-touch-icon.png", "image/png"]],
	["/icon-192.png", ["icon-192.png", "image/png"]],
	["/icon-512.png", ["icon-512.png", "image/png"]],
	["/icon-maskable-512.png", ["icon-maskable-512.png", "image/png"]],
]);

const publicResponse = async (path: string) => {
	if (path === "/app.js")
		return new Response(await buildBrowserScript(), {
			headers: { "content-type": "text/javascript" },
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
	const response = await fetch(url, {
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
	const response = await fetch(url, {
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
	return {
		pullRequestId: pullRequest.node_id,
		state: pullRequest.state,
		draft: pullRequest.draft,
		head_sha: sha,
		mergeable:
			pullRequest.mergeable === true ? "clean" : pullRequest.mergeable_state,
		workflow_state:
			Array.isArray(workflowRuns) &&
			workflowRuns.every((item) => item.conclusion === "success")
				? "success"
				: "unknown",
		checks_state:
			Array.isArray(checkRuns) &&
			checkRuns.every((item) => item.conclusion === "success")
				? "success"
				: "unknown",
		review_state: noBranchRequirements
			? "approved"
			: reviewList.some((item) => item.state === "APPROVED")
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
			const response = await fetch("https://api.github.com/graphql", {
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
			});
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
			error instanceof Error ? error.message.slice(0, 200) : "unknown error",
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
		const response: Response = await fetch(next, { headers });
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
	if (!githubAppId || !githubAppPrivateKey) return;
	queueMicrotask(() => {
		void installationToken(
			githubAppJwt(githubAppId, githubAppPrivateKey.replace(/\\n/g, "\n")),
			installationId,
		)
			.then((token) => bootstrapInstallation(context.db, installationId, token))
			.then((result) => {
				if (result.kind === "error")
					console.error(
						"installation bootstrap failed",
						result.message.slice(0, 200),
					);
			})
			.catch((error) =>
				console.error(
					"installation bootstrap failed",
					error instanceof Error
						? error.message.slice(0, 200)
						: "unknown error",
				),
			);
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
	const tokenResponse = await fetch(
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
		await fetch("https://api.github.com/user", { headers })
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
	const tokenResponse = await fetch(
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
		await fetch("https://api.github.com/user", {
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
			open_spec: projected.open_spec,
		};
	} catch (error) {
		console.error(
			"merge eligibility read failed",
			error instanceof Error ? error.message.slice(0, 200) : "unknown error",
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
	const inserted = await acceptGitHubDelivery(
		context.db,
		delivery,
		event,
		body,
	);
	if (inserted) queueMicrotask(() => void context.scheduleDrain());
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
	if (!githubAppId || !githubAppPrivateKey)
		return new Response("GitHub App is not configured", { status: 503 });
	const token = await installationToken(
		githubAppJwt(githubAppId, githubAppPrivateKey.replace(/\\n/g, "\n")),
		installationId,
	);
	return Response.json(
		await bootstrapInstallation(context.db, installationId, token),
	);
};

const reconcileRoute = async (
	context: AppContext,
	request: Request,
	path: string,
) => {
	if (path !== "/api/reconcile" || request.method !== "POST") return undefined;
	const user = await context.authenticated(request);
	if (!user) return new Response("unauthenticated", { status: 401 });
	const status = await context.reconcile(user.id);
	if (status === "missing") return new Response("not found", { status: 404 });
	return Response.json(
		{ status },
		{ status: status === "failed" ? 502 : status === "running" ? 202 : 200 },
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
			error instanceof Error ? error.message.slice(0, 200) : "unknown error",
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

export function createApp(
	db: Db,
	config: Config,
	mergeProvider?: AppContext["mergeProvider"],
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
	let draining = Promise.resolve();
	let reconciling: Promise<"success" | "failed"> | undefined;
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
		const response = await fetch(
			`https://api.github.com/repositories/${input.repositoryId}/contents/${input.path}?ref=${input.sha}`,
			{
				headers: {
					authorization: `Bearer ${token}`,
					accept: "application/vnd.github.raw",
				},
			},
		);
		return response.ok ? response.text() : null;
	};
	const context = {
		db,
		config,
		initialized,
		streams,
		encoder,
		mergeProvider: mergeProvider ?? defaultMergeProvider(config),
		refresh,
		authenticated: async (request: Request) => {
			if (config.localDemo) return LOCAL_DEMO_USER;
			const token = cookie(request);
			return token ? sessionUser(db, token) : null;
		},
		reconcile: async (userId?: string) => {
			const installationIds = userId
				? await approvedInstallationIdsForUser(db, userId)
				: undefined;
			if (userId && !installationIds?.length) return "missing";
			const appId = config.githubAppId,
				privateKey = config.githubAppPrivateKey;
			if (!appId || !privateKey) return "failed";
			if (reconciling) return "running";
			const work = reconcileInstallations(
				db,
				(id) =>
					installationToken(
						githubAppJwt(appId, privateKey.replace(/\\n/g, "\n")),
						id,
					),
				fetch,
				installationIds,
			)
				.then(() => "success" as const)
				.catch((error) => {
					console.error(
						"reconciliation failed",
						error instanceof Error
							? error.message.slice(0, 200)
							: "unknown error",
					);
					return "failed" as const;
				});
			reconciling = work;
			try {
				const status = await work;
				if (status === "success" && userId) refresh(userId);
				return status;
			} finally {
				if (reconciling === work) reconciling = undefined;
			}
		},
		scheduleDrain: async () => {},
	} satisfies AppContext;
	context.scheduleDrain = () => {
		draining = draining
			.then(async () => {
				await initialized;
				const users = await drainInbox(db, githubTasks, config.reviewBot);
				for (const user of users) refresh(user);
			})
			.catch((error) =>
				console.error(
					"webhook drain failed",
					error instanceof Error
						? error.message.slice(0, 200)
						: "unknown error",
				),
			);
		return draining;
	};
	return {
		drain: context.scheduleDrain,
		reconcile: () => context.reconcile(),
		fetch: (request: Request) => handleRequest(context, request),
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
				fetch: app.fetch,
			});
			void app.drain();
			if (config.githubAppId && config.githubAppPrivateKey)
				setInterval(() => void app.reconcile(), config.reconcileIntervalMs);
		})
		.catch((error) => {
			console.error(
				"MongoDB startup failed",
				error instanceof Error ? error.message.slice(0, 200) : "unknown error",
			);
			process.exitCode = 1;
		});
}
