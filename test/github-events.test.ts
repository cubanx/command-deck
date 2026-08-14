import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { bindInstallation, upsertIdentity } from "../src/access";
import {
	acceptGitHubDelivery,
	drainInbox,
	githubSignatureValid,
} from "../src/events";
import { withDatabase } from "./mongo-support";

test("malformed signed webhook bodies are ignored without an inbox row", () =>
	withDatabase(async (db) => {
		expect(
			await acceptGitHubDelivery(db, "bad-json", "pull_request", "{"),
		).toBe(false);
		expect(await db.inboxDeliveries.countDocuments({})).toBe(0);
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
		expect(await acceptGitHubDelivery(db, "d1", "pull_request", body)).toBe(
			true,
		);
		expect(await acceptGitHubDelivery(db, "d1", "pull_request", body)).toBe(
			false,
		);
		expect(await drainInbox(db)).toEqual(["u1", "u2"]);
		expect(
			(await db.users.findOne({ _id: "u1" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({ title: "Keep station online", draft: 1 });
		expect(
			(await db.inboxDeliveries.findOne({ _id: "github:d1" }))?.payload,
		).toBeUndefined();
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
		).toMatchObject({ status: "rejected", attempts: 3, payload: push });
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
