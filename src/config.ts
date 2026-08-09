export type Config = {
  port: number; databasePath: string; githubClientId?: string; githubClientSecret?: string;
  githubAppId?: string; githubAppSlug?: string; githubAppPrivateKey?: string; githubWebhookSecret?: string; railwayWebhookToken?: string; railwayApiToken?: string; reconcileIntervalMs?: number;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port");
  const reconcileIntervalMs = Number(env.RECONCILE_INTERVAL_MS ?? 21_600_000);
  if (!Number.isInteger(reconcileIntervalMs) || reconcileIntervalMs < 60_000) throw new Error("RECONCILE_INTERVAL_MS must be at least 60000");
  return { port, databasePath: env.DATABASE_PATH ?? "./data/command-center.sqlite",
    githubClientId: env.GITHUB_CLIENT_ID, githubClientSecret: env.GITHUB_CLIENT_SECRET, githubAppId: env.GITHUB_APP_ID, githubAppSlug: env.GITHUB_APP_SLUG,
    githubAppPrivateKey: env.GITHUB_APP_PRIVATE_KEY, githubWebhookSecret: env.GITHUB_WEBHOOK_SECRET,
    railwayWebhookToken: env.RAILWAY_WEBHOOK_TOKEN, railwayApiToken: env.RAILWAY_API_TOKEN, reconcileIntervalMs };
}
