export type Config = {
	port: number;
	hostname?: string;
	mongoUriBase: string;
	mongoDatabase: string;
	localDemo: boolean;
	githubClientId?: string;
	githubClientSecret?: string;
	githubAppId?: string;
	githubAppSlug?: string;
	githubAppPrivateKey?: string;
	githubWebhookSecret?: string;
	reviewBot?: ReviewBotConfig;
	production: boolean;
	publicUrl?: string;
	oauthCallbackUrl?: string;
	secureCookies: boolean;
};

export type ReviewBotConfig = {
	login: string;
	startMarker: string;
	doneMarker: string;
};
const integer = (
	value: string | undefined,
	fallback: number,
	valid: (candidate: number) => boolean,
	message: string,
) => {
	const candidate = Number(value ?? fallback);
	if (!Number.isInteger(candidate) || !valid(candidate)) throw new Error(message);
	return candidate;
};

const localDemoConfig = (env: Record<string, string | undefined>) => {
	if (env.DCC_LOCAL_DEMO && !["0", "1"].includes(env.DCC_LOCAL_DEMO)) throw new Error("DCC_LOCAL_DEMO must be 0 or 1");
	const localDemo = env.DCC_LOCAL_DEMO === "1";
	if (
		localDemo &&
		(env.NODE_ENV === "production" ||
			env.RAILWAY_ENVIRONMENT_ID ||
			env.RAILWAY_ENVIRONMENT_NAME ||
			env.RAILWAY_PROJECT_ID)
	)
		throw new Error("local demo cannot run in a hosted production environment");
	return localDemo;
};

const reviewBotConfig = (env: Record<string, string | undefined>): ReviewBotConfig | undefined => {
	const values = [env.GITHUB_REVIEW_BOT_LOGIN, env.GITHUB_REVIEW_BOT_START_MARKER, env.GITHUB_REVIEW_BOT_DONE_MARKER];
	if (values.some(Boolean) && !values.every(Boolean))
		throw new Error("review bot login and markers must be configured together");
	const [login, startMarker, doneMarker] = values.map((value) => value?.trim());
	if (login && (!/^[A-Za-z0-9][A-Za-z0-9_\-[\]]*$/.test(login) || login.length > 100))
		throw new Error("review bot login is invalid");
	if ((startMarker && startMarker.length > 200) || (doneMarker && doneMarker.length > 200))
		throw new Error("review bot markers must be at most 200 characters");
	return login && startMarker && doneMarker ? { login, startMarker, doneMarker } : undefined;
};

const productionUrls = (env: Record<string, string | undefined>, production: boolean) => {
	if (!production) return {} as { publicUrl?: string; oauthCallbackUrl?: string };
	const required = [
		"PUBLIC_URL",
		"MONGODB_URI_BASE",
		"MONGODB_DATABASE",
		"GITHUB_APP_ID",
		"GITHUB_CLIENT_ID",
		"GITHUB_CLIENT_SECRET",
		"GITHUB_APP_PRIVATE_KEY",
		"GITHUB_WEBHOOK_SECRET",
	] as const;
	for (const name of required) {
		const value = env[name]?.trim();
		if (!value || /^(changeme|replace|example|placeholder|your)([-_\s]|$)/i.test(value))
			throw new Error(`${name} is required`);
	}
	let origin: URL;
	try {
		origin = new URL(env.PUBLIC_URL ?? "");
	} catch {
		throw new Error("PUBLIC_URL must be an HTTPS origin");
	}
	if (
		origin.protocol !== "https:" ||
		origin.username ||
		origin.password ||
		origin.pathname !== "/" ||
		origin.search ||
		origin.hash ||
		origin.host !== env.RAILWAY_PUBLIC_DOMAIN
	)
		throw new Error("PUBLIC_URL must match RAILWAY_PUBLIC_DOMAIN as an HTTPS origin");
	return {
		publicUrl: origin.origin,
		oauthCallbackUrl: new URL("/auth/github/callback", origin).toString(),
	};
};

const localUrls = (env: Record<string, string | undefined>, port: number) => {
	const value = env.PUBLIC_URL?.trim();
	if (!value) {
		const origin = new URL(`http://127.0.0.1:${port}`);
		return {
			publicUrl: origin.origin,
			oauthCallbackUrl: new URL("/auth/github/callback", origin).toString(),
		};
	}
	let origin: URL;
	try {
		origin = new URL(value);
	} catch {
		throw new Error("PUBLIC_URL must be a loopback HTTP origin");
	}
	if (
		origin.protocol !== "http:" ||
		!["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
		origin.username ||
		origin.password ||
		origin.pathname !== "/" ||
		origin.search ||
		origin.hash
	)
		throw new Error("PUBLIC_URL must be a loopback HTTP origin");
	return {
		publicUrl: origin.origin,
		oauthCallbackUrl: new URL("/auth/github/callback", origin).toString(),
	};
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
	const port = integer(env.PORT, 3000, (value) => value >= 1 && value <= 65535, "PORT must be a valid TCP port");
	const localDemo = localDemoConfig(env);
	const production = env.NODE_ENV === "production" || Boolean(env.RAILWAY_ENVIRONMENT_NAME);
	const mongoUriBase = env.MONGODB_URI_BASE?.trim() ?? "mongodb://127.0.0.1:27017";
	const mongoDatabase =
		env.MONGODB_DATABASE?.trim() ??
		(production
			? "command-center-ai-production"
			: `command-center-ai-local-${(env.USER ?? "local").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`);
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(mongoDatabase)) throw new Error("MONGODB_DATABASE is invalid");
	if (production && mongoDatabase !== "command-center-ai-production")
		throw new Error("MONGODB_DATABASE must be command-center-ai-production");
	const urls = production ? productionUrls(env, production) : localUrls(env, port);
	return {
		port,
		hostname: localDemo ? "127.0.0.1" : undefined,
		mongoUriBase,
		mongoDatabase,
		localDemo,
		production,
		...urls,
		secureCookies: !urls.publicUrl?.startsWith("http:"),
		githubClientId: env.GITHUB_CLIENT_ID,
		githubClientSecret: env.GITHUB_CLIENT_SECRET,
		githubAppId: env.GITHUB_APP_ID,
		githubAppSlug: env.GITHUB_APP_SLUG,
		githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY,
		githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
		reviewBot: reviewBotConfig(env),
	};
}
