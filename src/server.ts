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
import type { Db } from "#/db";
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

const cookie = (request: Request) =>
	request.headers.get("cookie")?.match(/(?:^|; )dcc_session=([^;]+)/)?.[1];
const webAsset = (name: string) =>
	readFileSync(new URL(`./web/${name}`, import.meta.url), "utf8");
const html = webAsset("index.html");
const css = webAsset("app.css");
const js = webAsset("app.js");
const manifest = webAsset("manifest.webmanifest");
const worker = webAsset("sw.js");

type SessionIdentity = { id: string; login?: string };
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
};

const textAssets = new Map<string, [string, string, HeadersInit?]>([
	["/", [html, "text/html; charset=utf-8"]],
	["/app.css", [css, "text/css"]],
	["/app.js", [js, "text/javascript"]],
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

const publicResponse = (path: string) => {
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
			return oauthCallback(context, request, url);
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

const handleRequest = async (context: AppContext, request: Request) => {
	const url = new URL(request.url);
	const path = url.pathname;
	const publicAsset = publicResponse(path);
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
		new Response("not found", { status: 404 })
	);
};

export function createApp(db: Db, config: Config) {
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
