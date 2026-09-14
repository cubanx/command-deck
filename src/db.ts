import { isDeepStrictEqual } from "node:util";
import { BSON, type Collection, MongoClient, type Db as MongoDb } from "mongodb";
import { compareDeploymentStatus, shouldApplyDeploymentStatus } from "#/deployment-status";

export const RECENT_MERGED_PULL_REQUEST_CAP = 100;
export const RECENT_MERGED_PULL_REQUEST_RETENTION_MS = 48 * 60 * 60 * 1_000;
const MAX_CAS_RETRIES = 3;
export type PullRequest = Record<string, unknown> & { opened_at?: string };
export type DashboardSortMode = "opened" | "closest" | "updated" | "progress" | "repository";
export type DashboardSortPreference = {
	mode: string;
	direction: "asc" | "desc";
};
export type DashboardFilters = {
	query?: string;
	statuses?: string[];
	attention?: boolean;
	failedActions?: boolean;
	failedChecks?: boolean;
};
export type DashboardPreferences = {
	repositoryIds?: string[] | null;
	sort?: DashboardSortPreference;
	filters?: DashboardFilters;
};
export type UserDocument = {
	_id: string;
	schemaVersion: 1;
	github: { login?: string; avatarUrl?: string };
	preferences?: { ui?: { dashboard?: DashboardPreferences } };
	createdAt: Date;
	updatedAt: Date;
};
export type InstallationDocument = {
	_id: string;
	installationId: string;
	accountLogin?: string;
	permissions?: { pull_requests?: string };
	active?: boolean;
	suspended?: boolean;
	lastSuccessfulSyncAt?: Date;
	lastSyncError?: string;
	validators?: Record<string, { etag?: string; body?: unknown; nextUrl?: string; updatedAt: Date }>;
};
export type UserInstallationBinding = { _id: string; userId: string; installationId: string; boundAt: Date };
export type RepositoryDocument = {
	_id: string;
	repositoryId: string;
	full_name: string;
	installationIds: string[];
	default_branch?: string;
	policy?: RepositoryPolicy;
	validators?: Record<string, { etag?: string; body?: unknown; nextUrl?: string; updatedAt: Date }>;
	updatedAt: Date;
};
export type PullRequestDocument = PullRequest & {
	_id: string;
	repositoryId: string;
	number: number;
	updatedAt: Date;
	revision?: number;
};
export type DeploymentDocument = Record<string, unknown> & {
	revision?: number;
	_id: string;
	repositoryId: string;
	deploymentId: string;
	updatedAt: Date;
};
export type RepositoryPolicy = Record<string, unknown> & {
	refreshed_at: string;
	required_checks: unknown[];
};
export type MergedPullRequestEvidence = {
	number: number;
	title: string;
	url: string;
	head_sha: string;
	merge_sha: string;
	merged_at: string;
};
export type Repository = {
	repositoryId: string;
	full_name: string;
	pullRequests: PullRequest[];
	openSpecs: Record<string, unknown>[];
	deployments: Record<string, unknown>[];
	policy?: RepositoryPolicy;
	recentMergedPullRequests?: MergedPullRequestEvidence[];
};
export type ReconciliationEvidence = {
	completedAt: Date;
	outcome: "success" | "failure";
	operation: string;
	summary: string;
	repository?: string;
	status?: number;
};
export type Session = { _id: string; userId: string; expiresAt: Date };
export type OAuthState = { _id: string; expiresAt: Date };
export type MergeIntent = {
	_id: string;
	userId: string;
	sessionId: string;
	installationId: string;
	repositoryId: string;
	fullName: string;
	pullRequestNumber: number;
	pullRequestTitle: string;
	headSha: string;
	pullRequestId?: string;
	stage: "started" | "authorized" | "consumed";
	expiresAt: Date;
};
export type InboxDelivery = {
	_id: string;
	provider: string;
	deliveryId: string;
	payload?: string;
	resolvedAccount?: string;
	eventName: string;
	status: "pending" | "pending_verification" | "done" | "ignored" | "rejected";
	attempts: number;
	nextAttemptAt?: Date;
	error?: string;
	verificationFirstAttemptAt?: Date;
	verificationLastAttemptAt?: Date;
	verificationReason?: "missing_binding" | "ambiguous_binding" | "conflicting_account" | "verification_unavailable";
	resolvedAt?: Date;
	resolvedBy?: "projection" | "recorded_noop" | "reconciliation";
	receivedAt: Date;
	processingStartedAt?: Date;
	processedAt?: Date;
};
export type ReconciliationRun = {
	installationId: string;
	trigger: "scheduled" | "webhook" | "startup" | "manual";
	startedAt: Date;
	completedAt: Date;
	durationMs: number;
	prCount: number;
	providerRequestCount: number;
	changedPrCount: number;
	unchangedPrCount: number;
	changedFieldCategories: string[];
	failureCount: number;
	unresolvedDeliveryCount: number;
	repairedDeliveryCount: number;
	outcome: "success" | "partial_failure" | "failure";
};
type RunningReconciliationRun = Pick<ReconciliationRun, "installationId" | "trigger" | "startedAt"> & {
	_id?: string;
	status: "running";
	completedAt?: never;
	durationMs?: never;
	prCount?: never;
	providerRequestCount?: never;
	changedPrCount?: never;
	unchangedPrCount?: never;
	changedFieldCategories?: never;
	failureCount?: never;
	unresolvedDeliveryCount?: never;
	repairedDeliveryCount?: never;
	outcome?: never;
	operation?: never;
	summary?: never;
};
export type ReconciliationRunDocument =
	| RunningReconciliationRun
	| (Pick<ReconciliationRun, "installationId" | "trigger" | "startedAt" | "completedAt" | "durationMs" | "outcome"> &
			Partial<
				Omit<ReconciliationRun, "installationId" | "trigger" | "startedAt" | "completedAt" | "durationMs" | "outcome">
			> & { _id?: string; status: "completed"; operation?: string; summary?: string });
export type Db = {
	mongo: MongoDb;
	users: Collection<UserDocument>;
	installations: Collection<InstallationDocument>;
	bindings: Collection<UserInstallationBinding>;
	repositories: Collection<RepositoryDocument>;
	pullRequests: Collection<PullRequestDocument>;
	deployments: Collection<DeploymentDocument>;
	sessions: Collection<Session>;
	oauthStates: Collection<OAuthState>;
	mergeIntents: Collection<MergeIntent>;
	inboxDeliveries: Collection<InboxDelivery>;
	reconciliationRuns: Collection<ReconciliationRunDocument>;
	client: MongoClient;
};

let cached: { key: string; promise: Promise<Db> } | undefined;
export function databaseName(env: Record<string, string | undefined> = process.env) {
	if (env.MONGODB_DATABASE) return env.MONGODB_DATABASE;
	if (env.RAILWAY_ENVIRONMENT_NAME || env.NODE_ENV === "production") return "command-center-ai-production";
	if (env.NODE_ENV === "test") return `command-center-ai-test-${crypto.randomUUID()}`;
	return `command-center-ai-local-${(env.USER ?? "local").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
}
export function mongoConfig(env: Record<string, string | undefined> = process.env) {
	const uriBase = env.MONGODB_URI_BASE?.trim(),
		database = databaseName(env);
	if (!uriBase) throw new Error("MONGODB_URI_BASE is required");
	if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(database)) throw new Error("MONGODB_DATABASE is invalid");
	if ((env.RAILWAY_ENVIRONMENT_NAME || env.NODE_ENV === "production") && database !== "command-center-ai-production")
		throw new Error("MONGODB_DATABASE must be command-center-ai-production");
	return { uriBase, database };
}
export function testDatabaseGuard(database: string) {
	if (!/^command-center-ai-test-[a-f0-9-]{36}$/i.test(database))
		throw new Error(
			"MONGODB_DATABASE must be an explicitly isolated non-production command-center-ai-test UUID database",
		);
}
export async function openDatabase(config = mongoConfig()): Promise<Db> {
	const key = `${config.uriBase}/${config.database}`;
	if (cached?.key === key) return cached.promise;
	const promise = (async () => {
		const client = new MongoClient(config.uriBase, {
			serverSelectionTimeoutMS: 5_000,
		});
		await client.connect();
		const mongo = client.db(config.database);
		return {
			client,
			mongo,
			users: mongo.collection<UserDocument>("users"),
			installations: mongo.collection<InstallationDocument>("installations"),
			bindings: mongo.collection<UserInstallationBinding>("user_installation_bindings"),
			repositories: mongo.collection<RepositoryDocument>("repositories"),
			pullRequests: mongo.collection<PullRequestDocument>("pull_requests"),
			deployments: mongo.collection<DeploymentDocument>("deployments"),
			sessions: mongo.collection<Session>("sessions"),
			oauthStates: mongo.collection<OAuthState>("oauth_states"),
			mergeIntents: mongo.collection<MergeIntent>("merge_intents"),
			inboxDeliveries: mongo.collection<InboxDelivery>("inbox_deliveries"),
			reconciliationRuns: mongo.collection<ReconciliationRunDocument>("reconciliation_runs"),
		};
	})();
	cached = { key, promise };
	promise.catch(() => {
		if (cached?.promise === promise) cached = undefined;
	});
	return promise;
}
export async function initializeDatabase(db: Db) {
	await Promise.all([
		db.users.createIndex({ "github.login": 1 }),
		db.installations.createIndex({ installationId: 1 }, { unique: true }),
		db.bindings.createIndex({ userId: 1, installationId: 1 }, { unique: true }),
		db.bindings.createIndex({ installationId: 1, userId: 1 }),
		db.repositories.createIndex({ repositoryId: 1 }, { unique: true }),
		db.repositories.createIndex({ installationIds: 1 }),
		db.pullRequests.createIndex({ repositoryId: 1, number: 1 }, { unique: true }),
		db.pullRequests.createIndex({ repositoryId: 1, state: 1, updated_at: -1 }),
		db.pullRequests.createIndex({ repositoryId: 1, retention_candidate: 1 }),
		db.pullRequests.createIndex({ author_login: 1, state: 1 }),
		db.deployments.createIndex({ repositoryId: 1, deploymentId: 1 }, { unique: true }),
		db.deployments.createIndex({ repositoryId: 1, updated_at: -1 }),
		db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
		db.oauthStates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
		db.mergeIntents.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
		db.inboxDeliveries.createIndex({ status: 1, nextAttemptAt: 1 }),
		db.inboxDeliveries.createIndex({ receivedAt: 1 }),
		db.inboxDeliveries.createIndex(
			{ processedAt: 1 },
			{ expireAfterSeconds: 259_200, partialFilterExpression: { status: { $in: ["done", "ignored"] } } },
		),
		db.reconciliationRuns.createIndex({ completedAt: 1 }, { expireAfterSeconds: 259_200 }),
		db.reconciliationRuns.createIndex({ installationId: 1, startedAt: -1 }),
	]);
}
export async function databaseReady(db: Db) {
	await db.mongo.command({ ping: 1 });
	await initializeDatabase(db);
}
export async function closeDatabase(db: Db) {
	await db.client.close();
	cached = undefined;
}

const MAX_DOMAIN_BSON_BYTES = 12 * 1024 * 1024;
export async function upsertPullRequest(
	db: Db,
	input: PullRequest & { repositoryId: string; number: number },
	expected?: { revision?: number; head_sha?: unknown; absent?: boolean },
) {
	const { _id: ignoredId, updatedAt: ignoredTime, revision: ignoredRevision, ...patch } = input;
	const _id = `${input.repositoryId}:${input.number}`;
	for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
		const existing = await db.pullRequests.findOne({ _id });
		if (
			expected &&
			(expected.absent
				? existing
				: !existing || expected.revision !== existing.revision || expected.head_sha !== existing.head_sha)
		)
			return false;
		if (existing?.merged === true && (input.state === "open" || input.merged === false)) return false;
		const incomingTime = Date.parse(String(input.updated_at ?? ""));
		const existingTime = Date.parse(String(existing?.updated_at ?? ""));
		if (existing && Number.isFinite(incomingTime) && Number.isFinite(existingTime) && incomingTime < existingTime)
			return false;
		const next = BSON.deserialize(BSON.serialize({ ...existing, ...patch, _id })) as PullRequestDocument;
		if (existing && isDeepStrictEqual(existing, next)) return false;
		const revision = typeof existing?.revision === "number" ? existing.revision : 0;
		const replacement = { ...next, revision: revision + 1, updatedAt: new Date() };
		if (BSON.serialize(replacement).byteLength > MAX_DOMAIN_BSON_BYTES)
			throw Object.assign(new Error(`pull request ${_id} exceeds the safe BSON limit`), {
				name: "DomainDocumentSizeError",
			});
		if (!existing) {
			try {
				await db.pullRequests.insertOne(replacement);
				return true;
			} catch (error) {
				if ((error as { code?: number }).code !== 11000) throw error;
			}
		} else {
			const result = await db.pullRequests.replaceOne(
				{ _id, revision: existing.revision === undefined ? { $exists: false } : revision },
				replacement,
			);
			if (result.modifiedCount === 1) return true;
		}
	}
	throw new Error(`pull request ${_id} changed concurrently`);
}

export async function upsertDeployment(
	db: Db,
	input: Record<string, unknown> & { repositoryId: string; deploymentId: string },
) {
	const { _id: ignoredId, updatedAt: ignoredTime, revision: ignoredRevision, ...patch } = input;
	const _id = `${input.repositoryId}:${input.deploymentId}`;
	for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
		const existing = await db.deployments.findOne({ _id });
		const next = BSON.deserialize(BSON.serialize({ ...existing, ...patch, _id })) as DeploymentDocument;
		if (existing && ("status_id" in patch || "status_created_at" in patch)) {
			if (compareDeploymentStatus(next, existing) < 0 || !shouldApplyDeploymentStatus(next, existing)) return false;
		}
		if (existing && isDeepStrictEqual(existing, next)) return false;
		const revision = typeof existing?.revision === "number" ? existing.revision : 0;
		const replacement = { ...next, revision: revision + 1, updatedAt: new Date() };
		if (BSON.serialize(replacement).byteLength > MAX_DOMAIN_BSON_BYTES)
			throw Object.assign(new Error(`deployment ${_id} exceeds the safe BSON limit`), {
				name: "DomainDocumentSizeError",
			});
		if (!existing) {
			try {
				await db.deployments.insertOne(replacement);
				return true;
			} catch (error) {
				if ((error as { code?: number }).code !== 11000) throw error;
			}
		} else {
			const result = await db.deployments.replaceOne(
				{ _id, revision: existing.revision === undefined ? { $exists: false } : revision },
				replacement,
			);
			if (result.modifiedCount === 1) return true;
		}
	}
	throw new Error(`deployment ${_id} changed concurrently`);
}

export async function patchPullRequest(
	db: Db,
	_id: string,
	patch: Record<string, unknown>,
	unset: string[] = [],
	expected?: { revision?: number; head_sha?: unknown; source_commit?: unknown },
) {
	for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
		const existing = await db.pullRequests.findOne({ _id });
		if (!existing) return false;
		if (expected) {
			const sourceChanged =
				("head_sha" in expected && expected.head_sha !== existing.head_sha) ||
				("source_commit" in expected && expected.source_commit !== existing.source_commit);
			if (sourceChanged) return false;
			if (expected.revision !== existing.revision) throw new Error(`pull request ${_id} changed concurrently`);
		}
		const next = { ...existing, ...patch } as Record<string, unknown>;
		for (const key of unset) delete next[key];
		const normalized = BSON.deserialize(BSON.serialize(next)) as PullRequestDocument;
		if (isDeepStrictEqual(existing, normalized)) return false;
		const revision = typeof existing.revision === "number" ? existing.revision : 0;
		const replacement = { ...normalized, revision: revision + 1, updatedAt: new Date() };
		if (BSON.serialize(replacement).byteLength > MAX_DOMAIN_BSON_BYTES)
			throw Object.assign(new Error(`pull request ${_id} exceeds the safe BSON limit`), {
				name: "DomainDocumentSizeError",
			});
		const result = await db.pullRequests.replaceOne(
			{ _id, revision: existing.revision === undefined ? { $exists: false } : revision },
			replacement,
		);
		if (result.modifiedCount === 1) return true;
	}
	throw new Error(`pull request ${_id} changed concurrently`);
}

export async function deletePullRequest(db: Db, _id: string, expected: { revision?: number; updated_at?: unknown }) {
	for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
		const existing = await db.pullRequests.findOne({ _id });
		if (!existing) return false;
		if (expected.updated_at !== existing.updated_at) return false;
		if (expected.revision !== existing.revision) throw new Error(`pull request ${_id} changed concurrently`);
		const result = await db.pullRequests.deleteOne({
			_id,
			revision: existing.revision === undefined ? { $exists: false } : existing.revision,
		});
		if (result.deletedCount === 1) return true;
	}
	throw new Error(`pull request ${_id} changed concurrently`);
}
export function retainRecentMergedPullRequests(evidence: MergedPullRequestEvidence[], now = Date.now()) {
	return evidence
		.filter((item) => Date.parse(item.merged_at) >= now - RECENT_MERGED_PULL_REQUEST_RETENTION_MS)
		.sort((left, right) => Date.parse(right.merged_at) - Date.parse(left.merged_at))
		.slice(0, RECENT_MERGED_PULL_REQUEST_CAP);
}

export function correlateDeploymentPullRequest(
	deployment: Record<string, unknown>,
	pullRequests: PullRequest[],
	recentMergedPullRequests: MergedPullRequestEvidence[] = [],
	now = Date.now(),
) {
	const {
		pull_request_number: _number,
		pull_request_title: _title,
		pull_request_url: _url,
		...uncorrelated
	} = deployment;
	const sha = uncorrelated.sha;
	if (typeof sha !== "string" || !/^[0-9a-f]{40}$/i.test(sha)) return uncorrelated;
	const match = [...pullRequests, ...retainRecentMergedPullRequests(recentMergedPullRequests, now)].find(
		(item) =>
			(item.head_sha === sha || ("merge_sha" in item && item.merge_sha === sha)) &&
			typeof item.number === "number" &&
			Number.isSafeInteger(item.number) &&
			item.number > 0 &&
			typeof item.title === "string" &&
			item.title.trim().length > 0 &&
			typeof item.url === "string" &&
			URL.canParse(item.url) &&
			["http:", "https:"].includes(new URL(item.url).protocol),
	);
	return match
		? {
				...uncorrelated,
				pull_request_number: match.number,
				pull_request_title: match.title,
				pull_request_url: match.url,
			}
		: uncorrelated;
}
