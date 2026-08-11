import { Database } from "bun:sqlite";

export type Db = Database;

export function openDatabase(path = ":memory:"): Db {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, github_id TEXT NOT NULL UNIQUE, login TEXT NOT NULL, avatar_url TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS installations (id TEXT PRIMARY KEY, account_login TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS user_installations (user_id TEXT NOT NULL REFERENCES users(id), installation_id TEXT NOT NULL REFERENCES installations(id), PRIMARY KEY (user_id, installation_id));
    CREATE TABLE IF NOT EXISTS repositories (installation_id TEXT NOT NULL REFERENCES installations(id), id TEXT NOT NULL, full_name TEXT NOT NULL, PRIMARY KEY (installation_id, id));
    CREATE TABLE IF NOT EXISTS pull_requests (installation_id TEXT NOT NULL, repository_id TEXT NOT NULL, number INTEGER NOT NULL, title TEXT NOT NULL, url TEXT, author_login TEXT, state TEXT NOT NULL, draft INTEGER NOT NULL DEFAULT 0, head_ref TEXT, head_sha TEXT, mergeable TEXT, review_state TEXT, bot_review_actor TEXT, bot_review_state TEXT, bot_review_updated_at TEXT, checks_state TEXT, workflow_state TEXT, updated_at TEXT, PRIMARY KEY (installation_id, repository_id, number));
    CREATE TABLE IF NOT EXISTS deployments (installation_id TEXT, project_id TEXT NOT NULL, service_id TEXT NOT NULL, environment_id TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, verification_state TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (project_id, service_id, environment_id, id));
    CREATE TABLE IF NOT EXISTS railway_connections (user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL, service_id TEXT NOT NULL, environment_id TEXT NOT NULL, PRIMARY KEY (user_id, project_id, service_id, environment_id));
    CREATE TABLE IF NOT EXISTS github_deployments (installation_id TEXT NOT NULL REFERENCES installations(id), repository_id TEXT NOT NULL, id TEXT NOT NULL, environment TEXT, ref TEXT, sha TEXT, state TEXT NOT NULL DEFAULT 'pending', status_id TEXT, target_url TEXT, log_url TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (installation_id, repository_id, id));
    CREATE TABLE IF NOT EXISTS inbox_deliveries (provider TEXT NOT NULL, delivery_id TEXT NOT NULL, payload TEXT, event_name TEXT, status TEXT NOT NULL DEFAULT 'pending', error TEXT, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, processed_at TEXT, PRIMARY KEY (provider, delivery_id));
    CREATE TABLE IF NOT EXISTS etags (request_key TEXT PRIMARY KEY, value TEXT NOT NULL, checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS openspec_progress (installation_id TEXT NOT NULL, repository_id TEXT NOT NULL, change_name TEXT NOT NULL, completed INTEGER NOT NULL, total INTEGER NOT NULL, source_commit TEXT NOT NULL, source_ref TEXT, active_group TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (installation_id, repository_id, change_name));
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), transition_key TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_id, transition_key));
  `);
  const openSpecColumns = db.query<{ name: string }, []>("PRAGMA table_info(openspec_progress)").all();
  if (!openSpecColumns.some(({ name }) => name === "active_group")) db.exec("ALTER TABLE openspec_progress ADD COLUMN active_group TEXT");
  if (!openSpecColumns.some(({ name }) => name === "source_ref")) db.exec("ALTER TABLE openspec_progress ADD COLUMN source_ref TEXT");
  const pullRequestColumns = db.query<{ name: string }, []>("PRAGMA table_info(pull_requests)").all();
  if (!pullRequestColumns.some(({ name }) => name === "draft")) db.exec("ALTER TABLE pull_requests ADD COLUMN draft INTEGER NOT NULL DEFAULT 0");
  if (!pullRequestColumns.some(({ name }) => name === "head_ref")) db.exec("ALTER TABLE pull_requests ADD COLUMN head_ref TEXT");
  if (!pullRequestColumns.some(({ name }) => name === "head_sha")) db.exec("ALTER TABLE pull_requests ADD COLUMN head_sha TEXT");
  if (!pullRequestColumns.some(({ name }) => name === "bot_review_actor")) db.exec("ALTER TABLE pull_requests ADD COLUMN bot_review_actor TEXT");
  if (!pullRequestColumns.some(({ name }) => name === "bot_review_state")) db.exec("ALTER TABLE pull_requests ADD COLUMN bot_review_state TEXT");
  if (!pullRequestColumns.some(({ name }) => name === "bot_review_updated_at")) db.exec("ALTER TABLE pull_requests ADD COLUMN bot_review_updated_at TEXT");
  const deploymentColumns = db.query<{ name: string }, []>("PRAGMA table_info(github_deployments)").all();
  if (!deploymentColumns.some(({ name }) => name === "target_url")) db.exec("ALTER TABLE github_deployments ADD COLUMN target_url TEXT");
  if (!deploymentColumns.some(({ name }) => name === "log_url")) db.exec("ALTER TABLE github_deployments ADD COLUMN log_url TEXT");
  return db;
}
