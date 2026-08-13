import { BSON, MongoClient, type Collection, type Db as MongoDb } from "mongodb";

export const MAX_USER_BSON_BYTES = 12 * 1024 * 1024;
const MAX_CAS_RETRIES = 3;
export type PullRequest = Record<string, unknown>;
export type Repository = { repositoryId: string; full_name: string; pullRequests: PullRequest[]; openSpecs: Record<string, unknown>[]; deployments: Record<string, unknown>[] };
export type Installation = { installationId: string; accountLogin?: string; boundAt: Date; repositories: Repository[]; lastSuccessfulSyncAt?: Date };
export type UserAggregate = { _id: string; schemaVersion: 1; revision: number; github: { login?: string; avatarUrl?: string }; installations: Installation[]; createdAt: Date; updatedAt: Date };
export type Session = { _id: string; userId: string; expiresAt: Date };
export type OAuthState = { _id: string; expiresAt: Date };
export type InboxDelivery = { _id: string; provider: string; deliveryId: string; payload?: string; eventName: string; status: "pending" | "pending_verification" | "done" | "ignored" | "rejected"; attempts: number; nextAttemptAt?: Date; error?: string; receivedAt: Date; processedAt?: Date };
export type ProviderCache = { _id: string; etag?: string; body?: unknown; nextUrl?: string; updatedAt: Date };
export type Notification = { _id: string; userId: string; transitionKey: string; title: string; body: string; link?: string; createdAt: Date };
export type Db = { mongo: MongoDb; users: Collection<UserAggregate>; sessions: Collection<Session>; oauthStates: Collection<OAuthState>; inboxDeliveries: Collection<InboxDelivery>; providerCache: Collection<ProviderCache>; notifications: Collection<Notification>; client: MongoClient };

let cached: { key: string; promise: Promise<Db> } | undefined;
export function databaseName(env: Record<string, string | undefined> = process.env) {
  if (env.MONGODB_DATABASE) return env.MONGODB_DATABASE;
  if (env.NODE_ENV === "production") return "dev-command-center-production";
  if (env.RAILWAY_ENVIRONMENT_NAME) return `dev-command-center-${env.RAILWAY_ENVIRONMENT_NAME.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
  if (env.NODE_ENV === "test") return `dev-command-center-test-${crypto.randomUUID()}`;
  return `dev-command-center-local-${(env.USER ?? "local").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
}
export function mongoConfig(env: Record<string, string | undefined> = process.env) {
  const uriBase = env.MONGODB_URI_BASE?.trim(), database = databaseName(env);
  if (!uriBase) throw new Error("MONGODB_URI_BASE is required");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(database)) throw new Error("MONGODB_DATABASE is invalid");
  return { uriBase, database };
}
export function testDatabaseGuard(database: string) { if (!/^dev-command-center-test-[a-f0-9-]{36}$/i.test(database)) throw new Error("MONGODB_DATABASE must be an explicitly isolated non-production dev-command-center-test UUID database"); }
export async function openDatabase(config = mongoConfig()): Promise<Db> {
  const key = `${config.uriBase}/${config.database}`;
  if (cached?.key === key) return cached.promise;
  const promise = (async () => { const client = new MongoClient(config.uriBase, { serverSelectionTimeoutMS: 5_000 }); await client.connect(); const mongo = client.db(config.database); return { client, mongo, users: mongo.collection<UserAggregate>("users"), sessions: mongo.collection<Session>("sessions"), oauthStates: mongo.collection<OAuthState>("oauth_states"), inboxDeliveries: mongo.collection<InboxDelivery>("inbox_deliveries"), providerCache: mongo.collection<ProviderCache>("provider_cache"), notifications: mongo.collection<Notification>("notifications") }; })();
  cached = { key, promise }; promise.catch(() => { if (cached?.promise === promise) cached = undefined; }); return promise;
}
export async function initializeDatabase(db: Db) { await Promise.all([db.users.createIndex({ "installations.installationId": 1 }), db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), db.oauthStates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }), db.inboxDeliveries.createIndex({ status: 1, nextAttemptAt: 1 }), db.notifications.createIndex({ userId: 1, transitionKey: 1 }, { unique: true }), db.notifications.createIndex({ userId: 1, createdAt: -1 })]); }
export async function databaseReady(db: Db) { await db.mongo.command({ ping: 1 }); await initializeDatabase(db); }
export async function closeDatabase(db: Db) { await db.client.close(); cached = undefined; }
export async function mutateUser(db: Db, userId: string, mutate: (user: UserAggregate) => void) { for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) { const existing = await db.users.findOne({ _id: userId }); if (!existing) throw new Error("user aggregate not found"); const next = structuredClone(existing); mutate(next); next.revision++; next.updatedAt = new Date(); if (BSON.serialize(next).byteLength > MAX_USER_BSON_BYTES) throw new Error(`user aggregate exceeds ${MAX_USER_BSON_BYTES} byte limit`); // ponytail: whole-document CAS is enough today; use targeted positional updates if measured write amplification matters.
    if ((await db.users.replaceOne({ _id: userId, revision: existing.revision }, next)).modifiedCount === 1) return next; } throw new Error("user aggregate changed concurrently"); }
