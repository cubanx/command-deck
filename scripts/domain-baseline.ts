import { strict as assert } from "node:assert";
import { BSON } from "mongodb";
import { createSession, dashboardForUser, LOCAL_DEMO_USER, seedLocalDemo, sessionUser } from "../src/access";
import { drainInbox } from "../src/events";
import { withDatabase } from "../test/mongo-support";

// Compare with the recorded pre-refactor measurements in implementation-evidence.md.
assert.equal(process.env.MONGODB_URI_BASE, "mongodb://127.0.0.1:27018");
await withDatabase(async (db) => {
	await seedLocalDemo(db);
	const template = await db.repositories.findOne({});
	assert.ok(template);
	const pulls = await db.pullRequests.find({ repositoryId: template.repositoryId }).toArray();
	const deployments = await db.deployments.find({ repositoryId: template.repositoryId }).toArray();
	await db.repositories.deleteMany({});
	await db.pullRequests.deleteMany({});
	await db.deployments.deleteMany({});
	for (let index = 0; index < 30; index++) {
		const repositoryId = String(1701 + index);
		await db.repositories.insertOne({
			...template,
			_id: repositoryId,
			repositoryId,
			full_name: `ds9/station-${index}`,
		});
		await db.pullRequests.insertMany(pulls.map((pr) => ({ ...pr, _id: `${repositoryId}:${pr.number}`, repositoryId })));
		if (deployments.length)
			await db.deployments.insertMany(
				deployments.map((deployment) => ({
					...deployment,
					_id: `${repositoryId}:${deployment.deploymentId}`,
					repositoryId,
				})),
			);
	}
	assert.equal(await db.pullRequests.countDocuments({}), 570);
	const { token } = await createSession(db, LOCAL_DEMO_USER.id);
	const samples: Record<string, number>[] = [];
	for (let i = 0; i < 11; i++) {
		const start = performance.now();
		assert.ok(await sessionUser(db, token));
		const authenticated = performance.now();
		const snapshot = await dashboardForUser(db, LOCAL_DEMO_USER.id);
		const assembled = performance.now();
		const json = JSON.stringify(snapshot);
		const serialized = performance.now();
		if (i)
			samples.push({
				authMs: authenticated - start,
				snapshotMs: assembled - authenticated,
				serializationMs: serialized - assembled,
				bytes: Buffer.byteLength(json),
			});
	}
	// Add hidden history only after timing the unchanged baseline population.
	await db.pullRequests.insertMany(
		Array.from({ length: 1000 }, (_, index) => ({
			_id: `1701:${10000 + index}`,
			repositoryId: "1701",
			number: 10000 + index,
			state: "closed",
			author_login: "sisko",
			updatedAt: new Date(),
		})),
	);
	await db.pullRequests.insertMany(
		Array.from({ length: 1000 }, (_, index) => ({
			_id: `unbound:${10000 + index}`,
			repositoryId: "unbound",
			number: 10000 + index,
			state: "open",
			author_login: "sisko",
			updatedAt: new Date(),
		})),
	);
	const repositoryIds = Array.from({ length: 30 }, (_, index) => String(1701 + index));
	const queries = {
		identity: db.users.find({ _id: LOCAL_DEMO_USER.id }, { projection: { _id: 1, github: 1 } }),
		bindings: db.bindings.find({ userId: LOCAL_DEMO_USER.id }),
		repositories: db.repositories.find({ installationIds: "local-demo-installation" }),
		pullRequests: db.pullRequests.find({
			repositoryId: { $in: repositoryIds },
			$or: [{ state: "open" }, { retention_candidate: true }],
		}),
		deployments: db.deployments.find({
			repositoryId: { $in: repositoryIds },
			updated_at: { $gte: new Date(Date.now() - 48 * 60 * 60_000).toISOString() },
		}),
	};
	const queryPlans: Record<string, unknown> = {};
	for (const [name, query] of Object.entries(queries)) {
		const plan = await query.explain("executionStats");
		if (name === "pullRequests") {
			assert.equal(plan.executionStats.nReturned, 570);
			assert.equal(
				plan.executionStats.totalDocsExamined,
				570,
				"closed and unauthorized history must stay outside the read",
			);
		}
		queryPlans[name] = {
			winningPlan: plan.queryPlanner.winningPlan,
			returned: plan.executionStats.nReturned,
			documentsExamined: plan.executionStats.totalDocsExamined,
			keysExamined: plan.executionStats.totalKeysExamined,
			executionMs: plan.executionStats.executionTimeMillis,
		};
	}
	const user = await db.users.findOne({ _id: LOCAL_DEMO_USER.id });
	assert.ok(user);
	const receivedAt = new Date();
	await db.inboxDeliveries.insertOne({
		_id: "github:ds9-baseline",
		provider: "github",
		deliveryId: "ds9-baseline",
		eventName: "pull_request",
		status: "pending",
		attempts: 0,
		receivedAt,
		payload: JSON.stringify({
			action: "edited",
			installation: { id: "local-demo-installation", account: { login: "cubanx" } },
			repository: { id: 1701, full_name: "ds9/station-0" },
			pull_request: {
				...pulls.find((pr) => pr.number === 119),
				number: 119,
				title: "Defiant baseline title edit",
				user: { login: "sisko" },
				head: { sha: "a".repeat(40), ref: "ds9/baseline" },
				updated_at: new Date().toISOString(),
			},
		}),
	});
	const drainStartedAt = Date.now();
	await drainInbox(db);
	const drainEndedAt = Date.now();
	const receipt = await db.inboxDeliveries.findOne({ _id: "github:ds9-baseline" });
	assert.equal(receipt?.status, "done");
	const median = (key: string) => samples.map((s) => s[key]!).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
	console.log(
		JSON.stringify(
			{
				repositories: 30,
				prs: 570,
				warmSamples: samples.length,
				queryPlanExtraClosedPrs: 1000,
				queryPlanExtraUnauthorizedPrs: 1000,
				queryPlans,
				userBsonBytes: BSON.serialize(user).byteLength,
				median: Object.fromEntries(Object.keys(samples[0]!).map((key) => [key, median(key)])),
				queueBeforeDrainMs: drainStartedAt - receivedAt.getTime(),
				singleReceiptDrainMs: drainEndedAt - drainStartedAt,
				receiptTotalMs: receipt!.processedAt!.getTime() - receivedAt.getTime(),
				note: "Local loopback; drain time includes verification and DB work. No provider calls, network UI, or production latency claim.",
			},
			null,
			2,
		),
	);
});
