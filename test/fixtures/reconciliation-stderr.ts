import assert from "node:assert/strict";
import { isReportedReconciliationFailure, reconcileInstallations } from "../../src/github";
import { createReconciliationCoordinator } from "../../src/reconciliation-coordinator";

const target = { installationId: "9", repositoryId: "2", number: 7 };
const failure = Object.freeze(
	Object.assign(new Error("token=canary"), {
		name: "\nsecret-canary",
		diagnostic: "raw canary",
		status: 503,
		code: 91,
	}),
);
let fail = true;
const coordinator = createReconciliationCoordinator({
	debounceMs: 0,
	reconcilePullRequest: async () => {
		if (fail) throw failure;
		return { kind: "unchanged" };
	},
	reconcileInstallations: async () => {
		throw failure;
	},
});
assert.equal(await coordinator.enqueue(target), "failed");
fail = false;
assert.equal(await coordinator.enqueue(target), "success");
coordinator.reconcileInstallations();
await new Promise((resolve) => setTimeout(resolve, 0));

const bookkeeping = createReconciliationCoordinator({
	debounceMs: 0,
	reconcilePullRequest: async () => ({ kind: "unchanged" }),
	reconcileInstallations: async () => {},
	recordRun: async () => {
		throw failure;
	},
});
assert.equal(await bookkeeping.enqueue(target), "failed");

// No provider or database connection: exercise the real terminal aggregate boundary.
const db = { users: { find: () => ({ toArray: async () => [] }) } };
try {
	await reconcileInstallations(
		db as never,
		async () => {
			throw failure;
		},
		async () => {
			throw new Error("unexpected fetch");
		},
		["9"],
	);
	assert.fail("terminal aggregate must reject");
} catch (error) {
	assert.ok(isReportedReconciliationFailure(error));
}
const providerDb = {
	users: {
		find: (_filter: unknown, options: { projection: { installations?: number } }) => ({
			toArray: async () =>
				options.projection.installations ? [{ installations: [{ installationId: "9", accountLogin: "cubanx" }] }] : [],
		}),
	},
	providerCache: { findOne: async () => null },
};
try {
	await reconcileInstallations(
		providerDb as never,
		async () => ({ token: "fictional", appJwt: "fictional" }),
		async () => new Response("raw canary", { status: 401 }),
		["9"],
	);
	assert.fail("terminal provider failure must reject");
} catch (error) {
	assert.ok(isReportedReconciliationFailure(error));
}
coordinator.stop();
bookkeeping.stop();
