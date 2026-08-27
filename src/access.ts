import { createHash, randomUUID } from "node:crypto";
import type { UpdateFilter } from "mongodb";
import type { Db, PullRequest, UserAggregate } from "#/db";
import { mutateUser } from "#/db";
import { approvedInstallationAccount, sameLogin } from "#/installations";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const LOCAL_DEMO_USER = {
	id: "local-demo-user",
	login: "sisko",
} as const;
const badPrStates = new Set(["action_required", "cancelled", "canceled", "failure", "failed", "timed_out"]);
const normalize = (value: unknown) =>
	String(value ?? "unknown")
		.toLowerCase()
		.replaceAll(" ", "_");
const needsAttention = (pr: Record<string, unknown>) =>
	Boolean(pr.draft) ||
	normalize(pr.review_state) === "changes_requested" ||
	badPrStates.has(normalize(pr.checks_state)) ||
	badPrStates.has(normalize(pr.workflow_state)) ||
	["blocked", "conflict", "conflicting", "dirty", "false", "unmergeable"].includes(normalize(pr.mergeable));
const emptyUser = (id: string): UserAggregate => ({
	_id: id,
	schemaVersion: 1,
	revision: 0,
	github: {},
	installations: [],
	createdAt: new Date(),
	updatedAt: new Date(),
});
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
}));
const pullRequestUrl = (fullName: unknown, number: unknown) => {
	if (fullName == null || number == null) return null;
	return `https://github.com/${String(fullName)}/pull/${String(number)}`;
};
const orderedOpenSpecs = (specs: Record<string, unknown>[]) => {
	const unique = new Map<string, Record<string, unknown>>();
	for (const spec of specs)
		unique.set([spec.change_name, spec.source_commit, spec.source_ref].map(String).join("\u0000"), spec);
	return [...unique.values()].sort(
		(a, b) =>
			["change_name", "source_commit", "source_ref"]
				.map((key) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")))
				.find(Boolean) ?? 0,
	);
};

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

export async function upsertIdentity(db: Db, id: string, login: string, avatarUrl?: string) {
	const safeAvatar = safeAvatarUrl(avatarUrl);
	const now = new Date(),
		update: UpdateFilter<UserAggregate> = {
			$set: { "github.login": login, updatedAt: now },
			$setOnInsert: { schemaVersion: 1, installations: [], createdAt: now },
			$inc: { revision: 1 },
		};
	if (safeAvatar) update.$set = { ...update.$set, "github.avatarUrl": safeAvatar };
	else update.$unset = { "github.avatarUrl": "" };
	await db.users.updateOne({ _id: id }, update, { upsert: true });
}
export async function seedBindings(
	db: Db,
	input: {
		userId: string;
		bindings: Array<{ installationId: string; accountLogin: string }>;
	},
) {
	if (
		!/^\d+$/.test(input.userId) ||
		!input.bindings.length ||
		new Set(input.bindings.map((item) => item.installationId)).size !== input.bindings.length ||
		input.bindings.some((item) => !/^\d+$/.test(item.installationId) || !approvedInstallationAccount(item.accountLogin))
	)
		throw new Error("invalid binding seed");
	const existing = await db.users.findOne({ _id: input.userId });
	if (!existing) {
		const user = emptyUser(input.userId);
		user.installations = input.bindings.map((item) => ({
			...item,
			boundAt: new Date(),
			repositories: [],
		}));
		await db.users.insertOne(user);
		return;
	}
	await mutateUser(db, input.userId, (user) => {
		for (const binding of input.bindings) {
			const prior = user.installations.find((item) => item.installationId === binding.installationId);
			if (prior?.accountLogin && prior.accountLogin !== binding.accountLogin)
				throw new Error("conflicting binding seed");
			if (!prior)
				user.installations.push({
					...binding,
					boundAt: new Date(),
					repositories: [],
				});
			else if (!prior.accountLogin) prior.accountLogin = binding.accountLogin;
		}
	});
}
export async function seedLocalDemo(db: Db) {
	await upsertIdentity(db, LOCAL_DEMO_USER.id, LOCAL_DEMO_USER.login);
	await bindInstallation(db, LOCAL_DEMO_USER.id, "local-demo-installation", "cubanx");
	await mutateUser(db, LOCAL_DEMO_USER.id, (user) => {
		const installation = user.installations.find((item) => item.installationId === "local-demo-installation");
		if (!installation) throw new Error("local demo installation missing after binding");
		installation.accountLogin = "cubanx";
		installation.repositories = [
			{
				repositoryId: "local-demo-repository",
				full_name: "ds9/ops-console",
				pullRequests: localDemoPullRequests.map((pullRequest, index) =>
					index
						? pullRequest
						: {
								...pullRequest,
								open_specs: [
									{
										change_name: "restore-defiant-launch-checklist",
										completed: 26,
										total: 27,
										source_commit: "local-demo-119",
										source_ref: "demo/restore-the-defiant-launch-checklist",
									},
								],
							},
				),
				openSpecs: [
					{
						change_name: "restore-defiant-launch-checklist",
						completed: 26,
						total: 27,
						source_commit: "local-demo-119",
						source_ref: "demo/restore-the-defiant-launch-checklist",
						active_group: JSON.stringify({
							title: "Tasks",
							tasks: [{ completed: false, text: "Review the local dashboard" }],
						}),
					},
				],
				deployments: ["success", "pending", "failure"].map((state, index) => ({
					id: String(42 + index),
					state,
					updated_at: new Date().toISOString(),
				})),
			},
		];
	});
	await db.notifications.updateOne(
		{ userId: LOCAL_DEMO_USER.id, transitionKey: "demo:checks-failed:1701" },
		{
			$set: {
				title: "Checks failed",
				body: "Restore the Defiant launch checklist needs attention.",
			},
			$setOnInsert: {
				_id: "local-demo-notification",
				userId: LOCAL_DEMO_USER.id,
				transitionKey: "demo:checks-failed:1701",
				createdAt: new Date(),
			},
		},
		{ upsert: true },
	);
}
export async function createOAuthState(db: Db, expiresAt = new Date(Date.now() + 600_000)) {
	const state = randomUUID();
	await db.oauthStates.insertOne({ _id: hash(state), expiresAt });
	return state;
}
export async function consumeOAuthState(db: Db, state: string, now = new Date()) {
	return Boolean(
		await db.oauthStates.findOneAndDelete({
			_id: hash(state),
			expiresAt: { $gt: now },
		}),
	);
}
export async function createSession(db: Db, userId: string, expiresAt = new Date(Date.now() + 30 * 86_400_000)) {
	const token = randomUUID() + randomUUID();
	await db.sessions.insertOne({ _id: hash(token), userId, expiresAt });
	return { token, expiresAt };
}
export async function sessionUser(db: Db, token: string, now = new Date()) {
	const session = await db.sessions.findOne({
		_id: hash(token),
		expiresAt: { $gt: now },
	});
	if (!session) return null;
	const user = await db.users.findOne({ _id: session.userId });
	return user?.github.login ? { id: user._id, login: user.github.login } : null;
}
export async function bindInstallation(db: Db, userId: string, installationId: string, accountLogin?: string) {
	if (!approvedInstallationAccount(accountLogin)) return false;
	await mutateUser(db, userId, (user) => {
		const installation = user.installations.find((item) => item.installationId === installationId);
		if (!installation)
			user.installations.push({
				installationId,
				accountLogin,
				boundAt: new Date(),
				repositories: [],
			});
		else installation.accountLogin = accountLogin;
	});
	return true;
}
export async function dashboardForUser(db: Db, userId: string, now = new Date()) {
	const user = await db.users.findOne({ _id: userId });
	if (!user?.github.login) throw new Error("unauthenticated");
	const installations = user.installations.filter((installation) =>
		approvedInstallationAccount(installation.accountLogin),
	);
	const repositories = installations.flatMap((installation) =>
		installation.repositories.map((repository) => ({
			...repository,
			installationId: installation.installationId,
			accountLogin: installation.accountLogin,
			pullRequestsPermission: installation.permissions?.pull_requests,
		})),
	);
	const projectedPullRequests: PullRequest[] = repositories.flatMap((repository) =>
		repository.pullRequests
			.filter((pr) => sameLogin(pr.author_login, user.github.login))
			.map((pr) => ({
				...pr,
				installation_id: repository.installationId,
				installation_pull_requests: repository.pullRequestsPermission,
				repository_id: repository.repositoryId,
				full_name: repository.full_name,
			})),
	);
	const byIdentity = new Map<string, PullRequest>();
	for (const pr of projectedPullRequests.filter((pr) => pr.state === "open")) {
		const key = `${pr.repository_id}:${pr.number}`;
		const previous = byIdentity.get(key);
		if (!previous || String(pr.updated_at ?? "") > String(previous.updated_at ?? "")) byIdentity.set(key, pr);
	}
	const openPullRequests = [...byIdentity.values()];
	const pullRequests: PullRequest[] = openPullRequests
		.map((pr): PullRequest => {
			const correlatedOpenSpecs = orderedOpenSpecs(
				Array.isArray(pr.open_specs)
					? (pr.open_specs as Record<string, unknown>[])
					: pr.open_spec && typeof pr.open_spec === "object"
						? [pr.open_spec as Record<string, unknown>]
						: [],
			);
			const openSpec = correlatedOpenSpecs[0] ?? null;
			return {
				...pr,
				url: pullRequestUrl(pr.full_name, pr.number),
				open_specs: correlatedOpenSpecs,
				open_spec: openSpec,
				needs_attention:
					needsAttention(pr) ||
					Boolean(
						correlatedOpenSpecs.some(
							(item) => item.pre_merge_ready !== true && Number(item.completed) < Number(item.total),
						),
					),
			};
		})
		.sort(
			(a, b) =>
				Number(b.needs_attention) - Number(a.needs_attention) ||
				String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
		);
	const cutoff = now.getTime() - 48 * 60 * 60_000;
	const deployments: Record<string, unknown>[] = repositories
		.flatMap((repository) =>
			repository.deployments
				.filter((item) => Date.parse(String(item.updated_at)) >= cutoff)
				.map(
					(item): Record<string, unknown> => ({
						...item,
						full_name: repository.full_name,
					}),
				),
		)
		.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
	const notifications = await db.notifications.find({ userId }).sort({ createdAt: -1 }).limit(20).toArray();
	const avatarUrl = safeAvatarUrl(user.github.avatarUrl);
	return {
		user: {
			login: user.github.login,
			...(avatarUrl ? { avatar_url: avatarUrl } : {}),
			...(userId === LOCAL_DEMO_USER.id ? { fixture_avatar: true } : {}),
		},
		pullRequests,
		repositories: repositories.map((repository) => ({
			installation_id: repository.installationId,
			account_login: repository.accountLogin,
			pull_requests: repository.pullRequestsPermission,
			repository_id: repository.repositoryId,
			full_name: repository.full_name,
			installation_pull_requests: repository.pullRequestsPermission,
		})),
		deployments,
		notifications: notifications.map((notification) => ({
			...notification,
			id: notification._id,
		})),
		installationCount: installations.length,
		stale: installations.some((installation) => Boolean(installation.lastSyncError)),
	};
}
export async function dashboardForSession(db: Db, token: string, now = new Date()) {
	const user = await sessionUser(db, token, now);
	if (!user) throw new Error("unauthenticated");
	return dashboardForUser(db, user.id, now);
}
