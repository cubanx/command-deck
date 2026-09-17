import { createHash, randomUUID } from "node:crypto";
import type { UpdateFilter } from "mongodb";
import type {
	DashboardFilters,
	DashboardPreferences,
	DashboardSortPreference,
	Db,
	PullRequest,
	UserDocument,
} from "#/db";
import { approvedInstallationAccount, sameLogin } from "#/installations";
import { openSpecGate } from "#/openspec-gate";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type DashboardPullRequest = PullRequest & {
	number?: number;
	title?: string;
	installation_id?: string;
	installation_pull_requests?: string;
	repository_id?: string;
	full_name?: string;
	open_specs?: Record<string, unknown>[];
	open_spec?: Record<string, unknown> | null;
	needs_attention?: boolean;
	retention_candidate?: boolean;
	updated_at?: string;
	head_sha?: string;
	labels?: unknown[];
};
type DashboardSnapshot = {
	user: Record<string, unknown>;
	pullRequests: DashboardPullRequest[];
	repositories: Array<Record<string, unknown>>;
	deployments: Array<Record<string, unknown>>;
	preferences: DashboardPreferences;
	installationCount: number;
	stale: boolean;
};
export const LOCAL_DEMO_USER = { id: "local-demo-user", login: "sisko" } as const;
const badPrStates = new Set(["action_required", "cancelled", "canceled", "failure", "failed", "timed_out"]);
const normalize = (value: unknown) =>
	String(value ?? "unknown")
		.toLowerCase()
		.replaceAll(" ", "_");
const needsAttention = (pr: Record<string, unknown>) =>
	Boolean(
		pr.draft ||
			pr.post_merge_unresolved === true ||
			normalize(pr.review_state) === "changes_requested" ||
			badPrStates.has(normalize(pr.checks_state)) ||
			badPrStates.has(normalize(pr.workflow_state)) ||
			["blocked", "conflict", "conflicting", "dirty", "false", "unmergeable"].includes(normalize(pr.mergeable)),
	);
const localDemoPullRequests = [
	"Restore the Defiant launch checklist",
	"Tune the wormhole transit monitor",
	"Add Bajoran calendar import",
	"Retire obsolete docking alerts",
	"Harden the promenade inventory sync",
	"Repair runabout maintenance report",
	"Document the holosuite failover drill",
	"Simplify replicator supply filters",
	"Show science lab sensor freshness",
	"Fix shuttle bay assignment sorting",
	"Improve Quark's tab reconciliation",
	"Audit cargo manifest export",
	"Prepare gamma quadrant survey view",
	"Add senior staff rotation reminder",
	"Correct infirmary shift coverage",
	"Move celestial temple backups",
	"Refresh federation relay credentials",
	"Test phaser array diagnostics",
	"Publish the station status digest",
].map((title, index) => ({
	number: 119 - index,
	title,
	url: `https://github.com/ds9/ops-console/pull/${119 - index}`,
	author_login: LOCAL_DEMO_USER.login,
	state: "open",
	draft: Number(index % 6 === 0),
	head_ref: `demo/${title.toLowerCase().replaceAll(" ", "-")}`,
	head_sha: `local-demo-${119 - index}`,
	mergeable: index % 5 === 0 ? "conflicting" : "clean",
	review_state: index % 4 === 0 ? "changes_requested" : "approved",
	checks_state: index % 7 === 0 ? "failure" : "success",
	workflow_state: index % 3 === 0 ? "failure" : "success",
	bot_review_actor: "odo[bot]",
	bot_review_state: index % 3 === 0 ? "in_progress" : "approved",
	...([117, 118].includes(119 - index) ? { labels: ["openspec-not-required"] } : {}),
}));

export const safeAvatarUrl = (value: unknown) => {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		if (url.protocol !== "https:" || url.username || url.password) return undefined;
		return url.href;
	} catch {
		return undefined;
	}
};
const emptyUser = (id: string): UserDocument => ({
	_id: id,
	schemaVersion: 1,
	github: {},
	createdAt: new Date(),
	updatedAt: new Date(),
});
const orderedOpenSpecs = (specs: Record<string, unknown>[]) =>
	[
		...new Map(
			specs.map((spec) => [[spec.change_name, spec.source_commit, spec.source_ref].map(String).join("\0"), spec]),
		).values(),
	].sort((a, b) => String(a.change_name ?? "").localeCompare(String(b.change_name ?? "")));

export async function upsertIdentity(db: Db, id: string, login: string, avatarUrl?: string) {
	const safeAvatar = safeAvatarUrl(avatarUrl),
		now = new Date();
	const update: UpdateFilter<UserDocument> = {
		$set: { "github.login": login, updatedAt: now },
		$setOnInsert: { schemaVersion: 1, createdAt: now },
	};
	if (safeAvatar) update.$set = { ...update.$set, "github.avatarUrl": safeAvatar };
	else update.$unset = { "github.avatarUrl": "" };
	await db.users.updateOne({ _id: id }, update, { upsert: true });
}

export async function bindInstallation(db: Db, userId: string, installationId: string, accountLogin?: string) {
	if (!approvedInstallationAccount(accountLogin)) return false;
	if (!(await db.users.findOne({ _id: userId }))) await db.users.insertOne(emptyUser(userId));
	const now = new Date();
	await db.installations.updateOne(
		{ _id: installationId },
		{ $set: { installationId, accountLogin, active: true, suspended: false }, $setOnInsert: { _id: installationId } },
		{ upsert: true },
	);
	await db.bindings.updateOne(
		{ userId, installationId },
		{ $setOnInsert: { _id: `${userId}:${installationId}`, userId, installationId, boundAt: now } },
		{ upsert: true },
	);
	return true;
}

export async function seedLocalDemo(db: Db) {
	await upsertIdentity(db, LOCAL_DEMO_USER.id, LOCAL_DEMO_USER.login);
	await bindInstallation(db, LOCAL_DEMO_USER.id, "local-demo-installation", "cubanx");
	const now = new Date();
	await db.repositories.updateOne(
		{ _id: "local-demo-repository" },
		{
			$set: {
				repositoryId: "local-demo-repository",
				full_name: "ds9/ops-console",
				installationIds: ["local-demo-installation"],
				updatedAt: now,
			},
		},
		{ upsert: true },
	);
	await db.pullRequests.deleteMany({ repositoryId: "local-demo-repository" });
	await db.pullRequests.insertMany(
		localDemoPullRequests.map((pr, index) => ({
			...pr,
			_id: `local-demo-repository:${pr.number}`,
			repositoryId: "local-demo-repository",
			updatedAt: now,
			...(index === 0
				? {
						open_specs: [
							{
								change_name: "restore-defiant-launch-checklist",
								completed: 26,
								total: 27,
								source_commit: "local-demo-119",
								source_ref: "demo/restore-the-defiant-launch-checklist",
							},
						],
					}
				: {}),
		})),
	);
	await db.deployments.deleteMany({ repositoryId: "local-demo-repository" });
	await db.deployments.insertMany(
		["success", "pending", "failure"].map((state, index) => ({
			_id: `local-demo-repository:${42 + index}`,
			repositoryId: "local-demo-repository",
			deploymentId: String(42 + index),
			state,
			updated_at: now.toISOString(),
			updatedAt: now,
		})),
	);
}

export async function createOAuthState(db: Db, expiresAt = new Date(Date.now() + 600_000), purpose?: "installation") {
	const state = `${purpose ? `${purpose}.` : ""}${randomUUID()}`;
	await db.oauthStates.insertOne({ _id: hash(state), expiresAt });
	return state;
}
export async function consumeOAuthState(db: Db, state: string, now = new Date()) {
	return Boolean(await db.oauthStates.findOneAndDelete({ _id: hash(state), expiresAt: { $gt: now } }));
}
export async function createSession(db: Db, userId: string, expiresAt = new Date(Date.now() + 30 * 86_400_000)) {
	const token = randomUUID() + randomUUID();
	await db.sessions.insertOne({ _id: hash(token), userId, expiresAt });
	return { token, expiresAt };
}
export async function sessionUser(db: Db, token: string, now = new Date()) {
	const session = await db.sessions.findOne({ _id: hash(token), expiresAt: { $gt: now } });
	if (!session) return null;
	const user = await db.users.findOne({ _id: session.userId }, { projection: { _id: 1, github: 1 } });
	return user?.github?.login ? { id: user._id, login: user.github.login } : null;
}

const validateDashboardFilters = (filters: DashboardFilters | undefined) => {
	const dashboardStatuses = new Set(["closed", "post-merge", "draft", "openspec", "ready", "reviewing", "mergeable"]);
	if (
		!filters ||
		Object.keys(filters).some(
			(key) => !["query", "statuses", "attention", "failedActions", "failedChecks"].includes(key),
		) ||
		Object.keys(filters).length !== 5 ||
		typeof filters.query !== "string" ||
		filters.query.length > 200 ||
		!Array.isArray(filters.statuses) ||
		filters.statuses.length > 20 ||
		filters.statuses.some((status) => typeof status !== "string" || !dashboardStatuses.has(status)) ||
		typeof filters.attention !== "boolean" ||
		typeof filters.failedActions !== "boolean" ||
		typeof filters.failedChecks !== "boolean"
	)
		throw new Error("invalid filters");
};

export async function updateDashboardPreferences(db: Db, userId: string, input: DashboardPreferences) {
	const dashboardSortModes = new Set(["opened", "closest", "updated", "progress", "repository"]);
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid preferences");
	const keys = Object.keys(input as object);
	if (keys.some((key) => !["repositoryIds", "sort", "filters"].includes(key))) throw new Error("invalid preferences");
	if (
		"repositoryIds" in input &&
		input.repositoryIds !== null &&
		(!Array.isArray(input.repositoryIds) ||
			input.repositoryIds.length > 500 ||
			input.repositoryIds.some((id) => typeof id !== "string" || id.length > 200))
	)
		throw new Error("invalid repositoryIds");
	if ("sort" in input) {
		const sort = input.sort as DashboardSortPreference | undefined;
		if (
			!sort ||
			Object.keys(sort).some((key) => !["mode", "direction"].includes(key)) ||
			Object.keys(sort).length !== 2 ||
			!dashboardSortModes.has(sort.mode) ||
			!["asc", "desc"].includes(sort.direction)
		)
			throw new Error("invalid sort");
	}
	if ("filters" in input) validateDashboardFilters(input.filters);
	const set: Record<string, unknown> = { updatedAt: new Date() };
	if ("repositoryIds" in input)
		set["preferences.ui.dashboard.repositoryIds"] =
			input.repositoryIds === null ? null : [...new Set(input.repositoryIds)];
	if ("sort" in input) set["preferences.ui.dashboard.sort"] = input.sort;
	if ("filters" in input) set["preferences.ui.dashboard.filters"] = input.filters;
	await db.users.updateOne({ _id: userId }, { $set: set });
}

export async function dashboardForUser(db: Db, userId: string, now = new Date()): Promise<DashboardSnapshot> {
	const user = await db.users.findOne({ _id: userId }, { projection: { _id: 1, github: 1, preferences: 1 } });
	if (!user?.github?.login) throw new Error("unauthenticated");
	const bindings = await db.bindings.find({ userId }).toArray();
	const installations = (
		await db.installations
			.find({
				_id: { $in: bindings.map((item) => item.installationId) },
				active: { $ne: false },
				suspended: { $ne: true },
			})
			.toArray()
	).filter((item) => approvedInstallationAccount(item.accountLogin));
	const installationIds = installations.map((item) => item.installationId);
	const repositories = await db.repositories.find({ installationIds: { $in: installationIds } }).toArray();
	const repositoryIds = repositories.map((item) => item.repositoryId);
	const pullRows = await db.pullRequests
		.find({ repositoryId: { $in: repositoryIds }, $or: [{ state: "open" }, { retention_candidate: true }] })
		.toArray();
	const byIdentity = new Map<string, PullRequest>();
	for (const row of pullRows.filter((pr) => sameLogin(pr.author_login, user.github.login))) {
		const previous = byIdentity.get(row._id);
		if (!previous || String(row.updated_at ?? "") > String(previous.updated_at ?? "")) byIdentity.set(row._id, row);
	}
	const pullRequests: DashboardPullRequest[] = [...byIdentity.values()]
		.map((pr): DashboardPullRequest => {
			const repo = repositories.find((item) => item.repositoryId === String(pr.repositoryId));
			const installation = installations.find(
				(item) => item.installationId && repo?.installationIds.includes(item.installationId),
			);
			const specs = Array.isArray(pr.open_specs) ? orderedOpenSpecs(pr.open_specs as Record<string, unknown>[]) : [];
			const labels = Array.isArray(pr.labels)
				? pr.labels.filter((label): label is string => typeof label === "string")
				: [];
			const number = Number(pr.number);
			const safeUrl =
				typeof pr.url === "string" && URL.canParse(pr.url) && new URL(pr.url).protocol === "https:"
					? pr.url
					: repo?.full_name && Number.isSafeInteger(number)
						? `https://github.com/${repo.full_name}/pull/${number}`
						: undefined;
			const { _id, repositoryId: _repositoryId, revision: _revision, updatedAt: _updatedAt, ...fields } = pr;
			return {
				...fields,
				...(safeUrl ? { url: safeUrl } : {}),
				installation_id: installation?.installationId,
				installation_pull_requests:
					typeof installation?.permissions?.pull_requests === "string"
						? installation.permissions.pull_requests
						: undefined,
				repository_id: String(pr.repositoryId),
				full_name: repo?.full_name,
				open_specs: specs,
				open_spec: specs[0] ?? null,
				needs_attention: needsAttention(pr) || !openSpecGate(specs, labels, pr).ready,
			};
		})
		.sort(
			(a, b) =>
				Number(b.retention_candidate === true) - Number(a.retention_candidate === true) ||
				Number(b.needs_attention) - Number(a.needs_attention) ||
				String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
		);
	const cutoff = now.getTime() - 48 * 60 * 60_000;
	const deployments = (
		await db.deployments
			.find({ repositoryId: { $in: repositoryIds }, updated_at: { $gte: new Date(cutoff).toISOString() } })
			.sort({ updated_at: -1 })
			.toArray()
	).map((item) => {
		const {
			_id,
			repositoryId: _repositoryId,
			deploymentId,
			revision: _revision,
			updatedAt: _updatedAt,
			...fields
		} = item;
		return {
			id: deploymentId,
			...fields,
			full_name: repositories.find((repo) => repo.repositoryId === item.repositoryId)?.full_name,
		};
	});
	const avatarUrl = safeAvatarUrl(user.github.avatarUrl);
	return {
		user: {
			login: user.github.login,
			...(avatarUrl ? { avatar_url: avatarUrl } : {}),
			...(userId === LOCAL_DEMO_USER.id ? { fixture_avatar: true } : {}),
		},
		pullRequests,
		repositories: repositories.map((repo) => {
			const installation = installations.find((item) => repo.installationIds.includes(item.installationId));
			return {
				installation_id: installation?.installationId,
				account_login: installation?.accountLogin,
				pull_requests: installation?.permissions?.pull_requests,
				repository_id: repo.repositoryId,
				full_name: repo.full_name,
				installation_pull_requests: installation?.permissions?.pull_requests,
			};
		}),
		deployments,
		preferences: user.preferences?.ui?.dashboard ?? {},
		installationCount: installations.length,
		stale: installations.some((installation) => Boolean(installation.lastSyncError)),
	};
}
export async function dashboardForSession(db: Db, token: string, now = new Date()): Promise<DashboardSnapshot> {
	const user = await sessionUser(db, token, now);
	if (!user) throw new Error("unauthenticated");
	return dashboardForUser(db, user.id, now);
}
