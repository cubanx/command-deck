export type Config = {
  port: number; hostname?: string; databasePath: string; localDemo: boolean; githubClientId?: string; githubClientSecret?: string;
  githubAppId?: string; githubAppSlug?: string; githubAppPrivateKey?: string; githubWebhookSecret?: string; reviewBot?: ReviewBotConfig; railwayWebhookToken?: string; railwayApiToken?: string; reconcileIntervalMs?: number;
};

export type ReviewBotConfig = { login: string; startMarker: string; doneMarker: string };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  const reconcileIntervalMs = Number(env.RECONCILE_INTERVAL_MS ?? 21_600_000);
  if (!Number.isInteger(reconcileIntervalMs) || reconcileIntervalMs < 60_000) throw new Error("RECONCILE_INTERVAL_MS must be at least 60000");
  if (env.DCC_LOCAL_DEMO && !["0", "1"].includes(env.DCC_LOCAL_DEMO)) throw new Error("DCC_LOCAL_DEMO must be 0 or 1");
  const localDemo = env.DCC_LOCAL_DEMO === "1";
  if (localDemo && (env.NODE_ENV === "production" || env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID)) throw new Error("local demo cannot run in a hosted production environment");
  const reviewBotValues = [env.GITHUB_REVIEW_BOT_LOGIN, env.GITHUB_REVIEW_BOT_START_MARKER, env.GITHUB_REVIEW_BOT_DONE_MARKER];
  if (reviewBotValues.some(Boolean) && !reviewBotValues.every(Boolean)) throw new Error("review bot login and markers must be configured together");
  const [login, startMarker, doneMarker] = reviewBotValues.map((value) => value?.trim());
  if (login && (!/^[A-Za-z0-9][A-Za-z0-9_\-\[\]]*$/.test(login) || login.length > 100)) throw new Error("review bot login is invalid");
  if ((startMarker && startMarker.length > 200) || (doneMarker && doneMarker.length > 200)) throw new Error("review bot markers must be at most 200 characters");
  const reviewBot = login && startMarker && doneMarker ? { login, startMarker, doneMarker } : undefined;
  return { port, hostname: localDemo ? "127.0.0.1" : undefined, databasePath: env.DATABASE_PATH ?? "./data/command-center.sqlite", localDemo,
    githubClientId: env.GITHUB_CLIENT_ID, githubClientSecret: env.GITHUB_CLIENT_SECRET, githubAppId: env.GITHUB_APP_ID, githubAppSlug: env.GITHUB_APP_SLUG,
    githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY, githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET, reviewBot,
    railwayWebhookToken: env.RAILWAY_WEBHOOK_TOKEN, railwayApiToken: env.RAILWAY_API_TOKEN, reconcileIntervalMs };
}
