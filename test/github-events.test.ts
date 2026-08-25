import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import {
	acceptGitHubDelivery,
	drainInbox,
	githubSignatureValid,
} from "#/events";
import { withDatabase } from "./mongo-support";

test("malformed webhook bodies are rejected without an inbox row", () =>
	withDatabase(async (db) => {
		expect(
			await acceptGitHubDelivery(db, "bad-json", "pull_request", "{"),
		).toEqual({ kind: "malformed" });
		expect(await db.inboxDeliveries.countDocuments({})).toBe(0);
	}));

test("verified account-less deliveries wait for one binding and project once", () =>
	withDatabase(async (db) => {
		const accountless = JSON.stringify({
			installation: { id: 9 },
			repository: { id: 2, full_name: "ds9/ops" },
			pull_request: {
				number: 7,
				title: "Restore power",
				state: "open",
				user: { login: "sisko" },
			},
		});
		expect(
			await acceptGitHubDelivery(
				db,
				"accountless",
				"pull_request",
				accountless,
			),
		).toEqual({ kind: "accepted" });
		let now = new Date("2030-01-01T00:00:00Z");
		const waits: number[] = [];
		await drainInbox(
			db,
			undefined,
			undefined,
			async (ms) => {
				waits.push(ms);
				now = new Date(now.getTime() + ms);
			},
			() => now,
		);
		expect(waits).toEqual([1000, 2000]);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:accountless" }),
		).toMatchObject({
			status: "pending_verification",
			payload: accountless,
			verificationReason: "missing_binding",
		});
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await drainInbox(
			db,
			undefined,
			undefined,
			async () => {},
			() => new Date("2030-01-02T00:00:00Z"),
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(1);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:accountless" }),
		).toMatchObject({
			status: "done",
			resolvedBy: "projection",
		});
	}));

test("ambiguous and conflicting bindings retain verified payloads", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "sisko", "sisko");
		await upsertIdentity(db, "kira", "kira");
		await bindInstallation(db, "sisko", "9", "cubanx");
		await bindInstallation(db, "kira", "9", "hudson-law");
		const payload = JSON.stringify({
			installation: { id: 9 },
			repository: { id: 2 },
			pull_request: { number: 1 },
		});
		await acceptGitHubDelivery(db, "ambiguous", "pull_request", payload);
		let now = new Date("2030-01-01T00:00:00Z");
		await drainInbox(
			db,
			undefined,
			undefined,
			async (ms) => {
				now = new Date(now.getTime() + ms);
			},
			() => now,
		);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:ambiguous" }),
		).toMatchObject({
			status: "pending_verification",
			verificationReason: "ambiguous_binding",
			payload,
		});
		await db.users.updateOne(
			{ _id: "kira" },
			{ $set: { "installations.0.accountLogin": "cubanx" } },
		);
		await acceptGitHubDelivery(
			db,
			"conflict",
			"pull_request",
			payload.replace('"id":9', '"id":9,"account":{"login":"hudson-law"}'),
		);
		now = new Date("2030-01-02T00:00:00Z");
		await drainInbox(
			db,
			undefined,
			undefined,
			async (ms) => {
				now = new Date(now.getTime() + ms);
			},
			() => now,
		);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:conflict" }),
		).toMatchObject({
			status: "pending_verification",
			verificationReason: "conflicting_account",
		});
	}));

test("temporary verification lookup failure retains and later projects exactly once", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const payload = JSON.stringify({
			installation: { id: 9, account: { login: "cubanx" } },
			repository: { id: 2 },
			pull_request: {
				number: 8,
				title: "Restore comms",
				state: "open",
				user: { login: "sisko" },
			},
		});
		await acceptGitHubDelivery(db, "temporary", "pull_request", payload);
		const users = db.users as typeof db.users & { find: typeof db.users.find };
		const originalFind = users.find;
		users.find = (() => {
			throw new Error("temporary lookup failure");
		}) as typeof users.find;
		let now = new Date("2030-01-01T00:00:00Z");
		await drainInbox(
			db,
			undefined,
			undefined,
			async (ms) => {
				now = new Date(now.getTime() + ms);
			},
			() => now,
		);
		users.find = originalFind;
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:temporary" }),
		).toMatchObject({
			status: "pending_verification",
			payload,
			verificationReason: "verification_unavailable",
		});
		now = new Date("2030-01-02T00:00:00Z");
		await drainInbox(
			db,
			undefined,
			undefined,
			async (ms) => {
				now = new Date(now.getTime() + ms);
			},
			() => now,
		);
		await drainInbox(
			db,
			undefined,
			undefined,
			async () => {},
			() => new Date("2030-01-03T00:00:00Z"),
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(1);
	}));

test("complete reconciliation repairs only attributable pull request and deployment deliveries", () =>
	withDatabase(async (db) => {
		const { markDeliveriesRepairedByReconciliation } = await import("#/events");
		for (const [deliveryId, eventName] of [
			["pr", "pull_request"],
			["deploy", "deployment"],
			["review", "pull_request_review"],
		] as const)
			await acceptGitHubDelivery(
				db,
				deliveryId,
				eventName,
				JSON.stringify({
					installation: { id: 9 },
					repository: { id: 2 },
				}),
			);
		expect(await markDeliveriesRepairedByReconciliation(db, "9", ["2"])).toBe(
			2,
		);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:pr" }),
		).toMatchObject({
			status: "done",
			resolvedBy: "reconciliation",
		});
		expect(
			(await db.inboxDeliveries.findOne({ _id: "github:pr" }))?.payload,
		).toBeUndefined();
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:review" }),
		).toMatchObject({
			status: "pending_verification",
		});
	}));

test("webhook author matching is case-insensitive", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "Sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await acceptGitHubDelivery(
			db,
			"case",
			"pull_request",
			JSON.stringify({
				action: "opened",
				installation: { id: 9, account: { login: "CUBANX" } },
				repository: { id: 2 },
				pull_request: {
					number: 1,
					title: "Case",
					state: "open",
					user: { login: "sisko" },
				},
			}),
		);
		await drainInbox(db);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(1);
	}));

const body = JSON.stringify({
	installation: { id: 9, account: { login: "cubanx" } },
	repository: { id: 2, full_name: "ds9/ops" },
	pull_request: {
		number: 7,
		title: "Keep station online",
		html_url: "https://github.com/ds9/ops/pull/7",
		user: { login: "sisko" },
		state: "open",
		draft: true,
		head: { ref: "ops/keep", sha: "a".repeat(40) },
		updated_at: "2026-01-01",
	},
});
const sign = (value: string) =>
	`sha256=${createHmac("sha256", "secret").update(value).digest("hex")}`;

test("GitHub verifies, dedupes, fans out, and clears successful deliveries", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u1", "sisko");
		await upsertIdentity(db, "u2", "kira");
		await bindInstallation(db, "u1", "9", "cubanx");
		await bindInstallation(db, "u2", "9", "cubanx");
		expect(githubSignatureValid(body, sign(body), "secret")).toBe(true);
		expect(githubSignatureValid(body, sign(body), "wrong")).toBe(false);
		expect(await acceptGitHubDelivery(db, "d1", "pull_request", body)).toEqual({
			kind: "accepted",
		});
		expect(await acceptGitHubDelivery(db, "d1", "pull_request", body)).toEqual({
			kind: "duplicate",
		});
		expect(await drainInbox(db)).toEqual(["u1", "u2"]);
		expect(
			(await db.users.findOne({ _id: "u1" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({ title: "Keep station online", draft: 1 });
		expect(
			(await db.inboxDeliveries.findOne({ _id: "github:d1" }))?.payload,
		).toBeUndefined();
	}));

test("lifecycle hints enqueue only tracked open pull requests", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const targets: Array<{
			installationId: string;
			repositoryId: string;
			number: number;
		}> = [];
		const drain = () =>
			drainInbox(db, undefined, undefined, undefined, undefined, (target) =>
				targets.push(target),
			);
		for (const [deliveryId, eventName, payload] of [
			[
				"opened",
				"pull_request",
				{ action: "opened", pull_request: JSON.parse(body).pull_request },
			],
			[
				"synchronize",
				"pull_request",
				{ action: "synchronize", pull_request: JSON.parse(body).pull_request },
			],
			[
				"reopened",
				"pull_request",
				{ action: "reopened", pull_request: JSON.parse(body).pull_request },
			],
			[
				"review",
				"pull_request_review",
				{ pull_request: { number: 7 }, review: { state: "approved" } },
			],
			[
				"review-comment",
				"pull_request_review_comment",
				{ pull_request: { number: 7 } },
			],
			[
				"review-thread",
				"pull_request_review_thread",
				{ pull_request: { number: 7 }, action: "resolved" },
			],
			[
				"check",
				"check_run",
				{
					check_run: {
						pull_requests: [{ number: 91 }, { number: 7 }],
						check_suite: { head_sha: "a".repeat(40) },
					},
				},
			],
			[
				"suite",
				"check_suite",
				{
					check_suite: {
						pull_requests: [{ number: 91 }, { number: 7 }],
						head_sha: "a".repeat(40),
					},
				},
			],
			[
				"workflow",
				"workflow_run",
				{
					workflow_run: {
						pull_requests: [{ number: 91 }, { number: 7 }],
						head_sha: "a".repeat(40),
					},
				},
			],
			["status", "status", { sha: "a".repeat(40) }],
		] as const) {
			await acceptGitHubDelivery(
				db,
				deliveryId,
				eventName,
				JSON.stringify({
					installation: { id: 9, account: { login: "cubanx" } },
					repository: { id: 2 },
					...payload,
				}),
			);
		}
		await drain();
		expect(targets).toEqual(
			Array.from({ length: 10 }, () => ({
				installationId: "9",
				repositoryId: "2",
				number: 7,
			})),
		);
		await acceptGitHubDelivery(
			db,
			"unknown",
			"check_run",
			JSON.stringify({
				installation: { id: 9, account: { login: "cubanx" } },
				repository: { id: 2 },
				check_run: {
					pull_requests: [{ number: 99 }],
					check_suite: { head_sha: "b".repeat(40) },
				},
			}),
		);
		await drain();
		expect(targets).toHaveLength(10);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:unknown" }),
		).toMatchObject({ resolvedBy: "recorded_noop" });
	}));

test("closed pull requests remove directly without enqueueing, and pending verification does not enqueue", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const targets: unknown[] = [];
		const drain = () =>
			drainInbox(db, undefined, undefined, undefined, undefined, (target) =>
				targets.push(target),
			);
		await acceptGitHubDelivery(db, "open", "pull_request", body);
		await drain();
		await acceptGitHubDelivery(
			db,
			"closed-target",
			"pull_request",
			body.replace('"open"', '"closed"'),
		);
		await drain();
		expect(targets).toHaveLength(1);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(0);
		await acceptGitHubDelivery(
			db,
			"pending-target",
			"pull_request",
			JSON.stringify({
				installation: { id: 44 },
				repository: { id: 2 },
				pull_request: { number: 7 },
			}),
		);
		await drain();
		expect(targets).toHaveLength(1);
	}));

test("closed pull requests remove their projection", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await acceptGitHubDelivery(db, "open", "pull_request", body);
		await drainInbox(db);
		await acceptGitHubDelivery(
			db,
			"closed",
			"pull_request",
			body.replace('"open"', '"closed"'),
		);
		await drainInbox(db);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(0);
	}));

test("webhook retries retain payload and bot plus OpenSpec updates preserve formal review", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await acceptGitHubDelivery(db, "pr", "pull_request", body);
		await drainInbox(db);
		const comment = JSON.stringify({
			action: "created",
			installation: { id: 9, account: { login: "cubanx" } },
			repository: { id: 2 },
			issue: { number: 7, pull_request: {} },
			comment: { user: { login: "Claude[bot]" }, body: "started review" },
		});
		await acceptGitHubDelivery(db, "bot", "issue_comment", comment);
		await drainInbox(db, undefined, {
			login: "claude[bot]",
			startMarker: "started review",
			doneMarker: "review complete",
		});
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({ bot_review_state: "in_progress" });
		await acceptGitHubDelivery(
			db,
			"bot-deleted",
			"issue_comment",
			comment
				.replace('"created"', '"deleted"')
				.replace("started review", "review complete"),
		);
		await drainInbox(db, undefined, {
			login: "claude[bot]",
			startMarker: "started review",
			doneMarker: "review complete",
		});
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({ bot_review_state: "in_progress" });
		const push = JSON.stringify({
			installation: { id: 9, account: { login: "cubanx" } },
			repository: { id: 2 },
			ref: "refs/heads/main",
			after: "a".repeat(40),
			commits: [{ modified: ["openspec/changes/defiant/tasks.md"] }],
		});
		await acceptGitHubDelivery(db, "push", "push", push);
		await acceptGitHubDelivery(db, "after-push", "pull_request", body);
		const waits: number[] = [];
		let now = new Date("2030-01-01T00:00:00Z");
		await drainInbox(
			db,
			async () => null,
			undefined,
			async (ms) => {
				waits.push(ms);
				expect(
					(await db.inboxDeliveries.findOne({ _id: "github:after-push" }))
						?.status,
				).toBe("done");
				now = new Date(now.getTime() + ms);
			},
			() => now,
		);
		expect(waits).toEqual([1000, 2000]);
		expect(
			await db.inboxDeliveries.findOne({ _id: "github:push" }),
		).toMatchObject({
			status: "pending_verification",
			attempts: 3,
			payload: push,
		});
	}));

test("webhook branches reject whitespace, overlong, and dotdot refs", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		for (const [index, ref] of [
			"ops/ bad",
			"x".repeat(256),
			"ops/../bad",
		].entries()) {
			const payload = JSON.parse(body);
			payload.pull_request.number = index + 10;
			payload.pull_request.head.ref = ref;
			await acceptGitHubDelivery(
				db,
				`pr-branch-${index}`,
				"pull_request",
				JSON.stringify(payload),
			);
		}
		await drainInbox(db);
		expect(
			(
				await db.users.findOne({ _id: "u" })
			)?.installations[0]?.repositories[0]?.pullRequests
				.filter((pr) => Number(pr.number) >= 10)
				.map((pr) => pr.head_ref),
		).toEqual([undefined, undefined, undefined]);
		for (const [index, ref] of [
			"ops/ bad",
			"x".repeat(256),
			"ops/../bad",
		].entries())
			await acceptGitHubDelivery(
				db,
				`push-branch-${index}`,
				"push",
				JSON.stringify({
					installation: { id: 9, account: { login: "cubanx" } },
					repository: { id: 2 },
					ref: `refs/heads/${ref}`,
					after: "a".repeat(40),
					commits: [
						{ modified: [`openspec/changes/branch-${index}/tasks.md`] },
					],
				}),
			);
		await drainInbox(db, async () => "- [ ] Check branch validation");
		expect(
			(
				await db.users.findOne({ _id: "u" })
			)?.installations[0]?.repositories[0]?.openSpecs.every(
				(spec) => spec.source_ref === undefined,
			),
		).toBe(true);
	}));

test("review, check, and workflow deliveries mutate the stable pull-request projection", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await acceptGitHubDelivery(db, "pr", "pull_request", body);
		await drainInbox(db);
		for (const [delivery, event, payload] of [
			[
				"review",
				"pull_request_review",
				{ pull_request: { number: 7 }, review: { state: "changes_requested" } },
			],
			[
				"check",
				"check_run",
				{
					check_run: { conclusion: "failure", pull_requests: [{ number: 7 }] },
				},
			],
			[
				"workflow",
				"workflow_run",
				{
					workflow_run: {
						id: 1701,
						name: "Quality",
						html_url: "https://github.com/ds9/ops/actions/runs/1701",
						conclusion: "failure",
						pull_requests: [{ number: 7 }],
					},
				},
			],
		] as const)
			await acceptGitHubDelivery(
				db,
				delivery,
				event,
				JSON.stringify({
					installation: { id: 9, account: { login: "cubanx" } },
					repository: { id: 2 },
					...payload,
				}),
			);
		await drainInbox(db);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({
			review_state: "changes_requested",
			checks_state: "failure",
			workflow_state: "failure",
			workflow_failures: [
				{
					id: "1701",
					name: "Quality",
					url: "https://github.com/ds9/ops/actions/runs/1701",
				},
			],
		});
		await acceptGitHubDelivery(
			db,
			"workflow-success",
			"workflow_run",
			JSON.stringify({
				installation: { id: 9, account: { login: "cubanx" } },
				repository: { id: 2 },
				workflow_run: {
					id: 1701,
					name: "Quality",
					html_url: "https://github.com/ds9/ops/actions/runs/1701",
					conclusion: "success",
					pull_requests: [{ number: 7 }],
				},
			}),
		);
		await drainInbox(db);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({
			checks_state: "failure",
			workflow_state: "success",
			workflow_failures: [],
		});
		await acceptGitHubDelivery(
			db,
			"workflow-unsafe",
			"workflow_run",
			JSON.stringify({
				installation: { id: 9, account: { login: "cubanx" } },
				repository: { id: 2 },
				workflow_run: {
					id: 1702,
					name: "Deploy",
					html_url: "javascript:alert(1)",
					conclusion: "failure",
					pull_requests: [{ number: 7 }],
				},
			}),
		);
		await drainInbox(db);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0]?.workflow_failures,
		).toEqual([]);
	}));

test("event notifications are user-scoped and transition-deduplicated", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "9", "sisko");
		await upsertIdentity(db, "10", "kira");
		await bindInstallation(db, "9", "1", "cubanx");
		const deployment = JSON.stringify({
			installation: { id: 1, account: { login: "cubanx" } },
			repository: { id: 2, full_name: "ds9/ops" },
			deployment: { id: 7 },
			deployment_status: { state: "success", created_at: "2030-01-01" },
		});
		await acceptGitHubDelivery(db, "d1", "deployment_status", deployment);
		await acceptGitHubDelivery(db, "d2", "deployment_status", deployment);
		await drainInbox(db);
		expect(
			await db.notifications.countDocuments({
				userId: "9",
				transitionKey: "github-deployment:2:7:success",
			}),
		).toBe(1);
		expect(await db.notifications.countDocuments({ userId: "10" })).toBe(0);
		await bindInstallation(db, "10", "1", "CUBANX");
		const review = JSON.stringify({
			action: "review_requested",
			installation: { id: 1, account: { login: "cubanx" } },
			repository: { id: 2 },
			pull_request: {
				number: 7,
				title: "Review",
				state: "open",
				user: { login: "sisko" },
				mergeable: true,
			},
			requested_reviewer: { id: 10 },
		});
		await acceptGitHubDelivery(db, "review-request", "pull_request", review);
		await drainInbox(db);
		expect(
			await db.notifications.countDocuments({
				userId: "10",
				title: "Review requested",
			}),
		).toBe(1);
		expect(
			await db.notifications.countDocuments({
				userId: "9",
				title: "Mergeability changed",
			}),
		).toBe(0);
		const changed = review.replace('"mergeable":true', '"mergeable":false');
		await acceptGitHubDelivery(db, "merge-change", "pull_request", changed);
		await acceptGitHubDelivery(db, "merge-repeat", "pull_request", changed);
		await drainInbox(db);
		expect(
			await db.notifications.countDocuments({
				userId: "9",
				title: "Mergeability changed",
			}),
		).toBe(1);
		await acceptGitHubDelivery(
			db,
			"check",
			"check_run",
			JSON.stringify({
				installation: { id: 1, account: { login: "cubanx" } },
				repository: { id: 2 },
				check_run: { conclusion: "failure", pull_requests: [{ number: 7 }] },
			}),
		);
		await drainInbox(db);
		expect(
			await db.notifications.countDocuments({
				userId: "9",
				title: "Checks failed",
			}),
		).toBe(1);
		expect(
			await db.notifications.countDocuments({
				userId: "10",
				title: "Checks failed",
			}),
		).toBe(0);
	}));
