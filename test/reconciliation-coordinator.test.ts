import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { createReconciliationCoordinator, failureDetails, logReconciliationError } from "#/reconciliation-coordinator";

const target = (number: number) => ({
	installationId: "9",
	repositoryId: "2",
	number,
});
const flush = async () => {
	for (let count = 0; count < 10; count++) await Promise.resolve();
};

test("serializes installation targets, deduplicates hints, and debounces bursts", async () => {
	vi.useFakeTimers();
	try {
		const calls: number[] = [];
		let release: (() => void) | undefined;
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async ({ number }) => {
				calls.push(number);
				if (number === 1)
					await new Promise<void>((resolve) => {
						release = resolve;
					});
			},
			reconcileInstallations: async () => {},
		});
		coordinator.enqueue(target(1));
		coordinator.enqueue(target(1));
		coordinator.enqueue(target(2));
		vi.advanceTimersByTime(250);
		await flush();
		expect(calls).toEqual([1]);
		release?.();
		vi.runAllTimers();
		await flush();
		expect(calls).toEqual([1, 2]);
	} finally {
		vi.useRealTimers();
	}
});

test("runs one dirty follow-up and coalesces broad reconciliation", async () => {
	vi.useFakeTimers();
	try {
		const calls: string[] = [];
		let release: (() => void) | undefined;
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async ({ number }) => {
				calls.push(`pr:${number}`);
				if (calls.length === 1)
					await new Promise<void>((resolve) => {
						release = resolve;
					});
			},
			reconcileInstallations: async () => {
				calls.push("broad");
			},
		});
		coordinator.enqueue(target(7));
		vi.advanceTimersByTime(250);
		await flush();
		coordinator.enqueue(target(7));
		coordinator.reconcileInstallations();
		coordinator.reconcileInstallations();
		release?.();
		vi.runAllTimers();
		await flush();
		expect(calls).toEqual(["pr:7", "pr:7", "broad"]);
	} finally {
		vi.useRealTimers();
	}
});

test("preserves queued work after a failed reconciliation", async () => {
	vi.useFakeTimers();
	try {
		const calls: number[] = [];
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async ({ number }) => {
				calls.push(number);
				if (number === 1) throw new Error("Cardassian relay failed");
			},
			reconcileInstallations: async () => {},
		});
		coordinator.enqueue(target(1));
		coordinator.enqueue(target(2));
		vi.advanceTimersByTime(250);
		await flush();
		vi.runAllTimers();
		await flush();
		expect(calls).toEqual([1, 2]);
	} finally {
		vi.useRealTimers();
	}
});

test("logs sanitized diagnostics for failed targeted and broad reconciliation", async () => {
	vi.useFakeTimers();
	const originalError = console.error,
		logs: unknown[][] = [];
	console.error = (...args: unknown[]) => logs.push(args);
	try {
		const failure = Object.assign(new Error("token=must-not-escape"), {
			name: "ProviderTimeout",
		});
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async () => {
				throw failure;
			},
			reconcileInstallations: async () => {
				throw failure;
			},
		});
		coordinator.enqueue(target(7));
		vi.advanceTimersByTime(250);
		await flush();
		coordinator.reconcileInstallations();
		await flush();
	} finally {
		console.error = originalError;
		vi.useRealTimers();
	}
	expect(logs.map(([line]) => JSON.parse(String(line)))).toEqual([
		{
			event: "reconciliation_failed",
			level: "error",
			message: "reconciliation failed installation=9 operation=pull_request category=targeted",
			installationId: "9",
			operation: "pull_request",
			failureClass: "unknown",
			target: "repositories/2/pulls/7",
			category: "targeted",
		},
		{
			event: "reconciliation_failed",
			level: "error",
			message: "reconciliation failed installation=unknown operation=reconciliation category=broad",
			installationId: "unknown",
			operation: "reconciliation",
			failureClass: "unknown",
			category: "broad",
		},
	]);
	expect(JSON.stringify(logs)).not.toContain("must-not-escape");
});

test("passes ownership context to targeted, bookkeeping, and broad failures", async () => {
	vi.useFakeTimers();
	try {
		const errors: Array<{ error: unknown; context: unknown }> = [];
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async () => {
				throw new Error("target diagnostic");
			},
			reconcileInstallations: async () => {
				throw new Error("broad diagnostic");
			},
			recordRun: async () => {
				throw new Error("bookkeeping diagnostic");
			},
			onError: (error, context) => errors.push({ error, context }),
		});
		const targeted = coordinator.enqueue(target(7));
		vi.advanceTimersByTime(250);
		await expect(targeted).resolves.toBe("failed");
		coordinator.reconcileInstallations();
		await Promise.resolve();
		expect(errors).toHaveLength(2);
		expect(errors.map(({ context }) => context)).toEqual([
			{ installationId: "9", target: "repositories/2/pulls/7", operation: "pull_request", category: "targeted" },
			{ operation: "reconciliation", category: "broad" },
		]);
		const bookkeeping = createReconciliationCoordinator({
			reconcilePullRequest: async () => ({ kind: "unchanged" as const }),
			reconcileInstallations: async () => {},
			recordRun: async () => {
				throw new Error("bookkeeping diagnostic");
			},
			onError: (error, context) => errors.push({ error, context }),
		});
		const result = bookkeeping.enqueue(target(8));
		vi.advanceTimersByTime(250);
		await expect(result).resolves.toBe("failed");
		expect(errors.at(-1)?.context).toEqual({
			installationId: "9",
			operation: "reconciliation_audit",
			target: "repositories/2/pulls/8",
			category: "bookkeeping",
		});
	} finally {
		vi.useRealTimers();
	}
});

test("emits one parseable sanitized JSON diagnostic on real Bun stderr", async () => {
	const child = spawn("bun", [fileURLToPath(new URL("./fixtures/reconciliation-stderr.ts", import.meta.url))], {
		cwd: process.cwd(),
	});
	let stderr = "";
	child.stderr.on("data", (chunk: Buffer) => {
		stderr += chunk;
	});
	const [exitCode] = await new Promise<[number | null]>((resolve, reject) => {
		child.on("error", reject);
		child.on("close", (code) => resolve([code]));
	});
	const lines = stderr.trim().split("\n");
	expect(exitCode).toBe(0);
	expect(lines).toHaveLength(5);
	expect(lines.map((line) => JSON.parse(line).operation)).toEqual([
		"pull_request",
		"reconciliation",
		"reconciliation_audit",
		"installation_credentials",
		"installation_identity",
	]);
	expect(JSON.parse(lines[4]!)).toMatchObject({ installationId: "9", status: 401 });
	expect(JSON.parse(lines[0]!)).toEqual({
		event: "reconciliation_failed",
		level: "error",
		message: "reconciliation failed installation=9 operation=pull_request category=targeted",
		installationId: "9",
		operation: "pull_request",
		failureClass: "unknown",
		target: "repositories/2/pulls/7",
		status: 503,
		code: 91,
		category: "targeted",
	});
	expect(stderr).not.toContain("token=canary");
	expect(stderr).not.toContain("raw canary");
	expect(stderr).not.toContain("secret-canary");
});

test("stops pending debounce timers", () => {
	vi.useFakeTimers();
	try {
		const calls: number[] = [];
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async ({ number }) => {
				calls.push(number);
			},
			reconcileInstallations: async () => {},
		});
		coordinator.enqueue(target(7));
		coordinator.stop();
		vi.advanceTimersByTime(250);
		expect(calls).toEqual([]);
	} finally {
		vi.useRealTimers();
	}
});

test("records sanitized aggregate telemetry for a triggered targeted run", async () => {
	vi.useFakeTimers();
	try {
		const runs: Array<Record<string, unknown>> = [];
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async () => ({
				kind: "changed" as const,
				providerRequestCount: 4,
				changedFieldCategories: ["checks"],
			}),
			reconcileInstallations: async () => {},
			recordRun: async (run) => {
				runs.push(run);
			},
		});
		coordinator.enqueue(target(7), "webhook");
		vi.advanceTimersByTime(250);
		await flush();
		expect(runs).toEqual([
			expect.objectContaining({
				installationId: "9",
				trigger: "webhook",
				prCount: 1,
				providerRequestCount: 4,
				changedPrCount: 1,
				changedFieldCategories: ["checks"],
				unresolvedDeliveryCount: 0,
				repairedDeliveryCount: 0,
			}),
		]);
	} finally {
		vi.useRealTimers();
	}
});

test("returns the completed coalesced manual outcome", async () => {
	vi.useFakeTimers();
	try {
		const coordinator = createReconciliationCoordinator({
			reconcilePullRequest: async () => ({ kind: "error" as const }),
			reconcileInstallations: async () => {},
		});
		const result = coordinator.enqueue(target(7), "manual");
		vi.advanceTimersByTime(250);
		await expect(result).resolves.toBe("failed");
	} finally {
		vi.useRealTimers();
	}
});

test("finite failure details reject hostile payloads and invalid codes", () => {
	const cases = [
		[new Error("pull request r:7 changed concurrently"), "domain_conflict"],
		[new Error("pull request r:7 not found"), "domain_missing"],
		[{ name: "MongoNetworkError" }, "network"],
		[{ name: "MongoNetworkTimeoutError" }, "timeout"],
		[{ name: "MongoServerSelectionError" }, "server_selection"],
		[{ name: "MongoServerError" }, "database"],
		[{ name: "BSONError" }, "serialization"],
		[{ name: "DomainDocumentSizeError", message: "secret payload" }, "domain_size"],
		[null, "unknown"],
		["Garak secret", "unknown"],
		[{ name: "Garak secret", diagnostic: "Garak secret" }, "unknown"],
		[
			{
				get status() {
					throw new Error("Garak secret");
				},
			},
			"unknown",
		],
		[
			new Proxy(
				{},
				{
					get() {
						throw new Error("Garak secret");
					},
				},
			),
			"unknown",
		],
	] as const;
	for (const [error, failureClass] of cases) expect(failureDetails(error)).toEqual({ failureClass });
	expect(
		failureDetails(
			Object.freeze(
				Object.assign(new Error("Garak secret"), {
					name: "MongoServerError",
					code: 112,
					status: 503,
					cause: { password: "Garak secret" },
				}),
			),
		),
	).toEqual({ failureClass: "database", code: 112, status: 503 });
	for (const code of [
		"112",
		-1,
		1.5,
		Infinity,
		NaN,
		2147483648,
		{
			valueOf() {
				throw new Error("secret");
			},
		},
	])
		expect(failureDetails({ code, status: "503" })).toEqual({ failureClass: "unknown" });
	for (const status of [99, 600, 200.5, Infinity])
		expect(failureDetails({ status })).toEqual({ failureClass: "unknown" });
});

test("logger validates numeric PR targets and forwarded diagnostic fields", () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		for (const target of [
			"repositories/2/pulls/7",
			"https://secret",
			"repositories/secret/pulls/7",
			"repositories/2/pulls/0",
			"repositories/2/pulls/9007199254740992",
		])
			logReconciliationError({
				operation: "persistence",
				category: "targeted",
				target,
				failureClass: "network",
				code: 91,
				status: 503,
			});
		const rows = log.mock.calls.map(([line]) => JSON.parse(line));
		expect(rows[0]).toMatchObject({ target: "repositories/2/pulls/7", failureClass: "network", code: 91, status: 503 });
		expect(rows.slice(1).every((row) => !("target" in row))).toBe(true);
		logReconciliationError({
			operation: "persistence",
			category: "targeted",
			failureClass: "secret",
			code: "secret",
		} as never);
		expect(JSON.parse(log.mock.calls.at(-1)![0])).toMatchObject({ failureClass: "unknown" });
		expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
	} finally {
		log.mockRestore();
	}
});
