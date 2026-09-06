import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { createReconciliationCoordinator } from "#/reconciliation-coordinator";

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
			category: "targeted",
		},
		{
			event: "reconciliation_failed",
			level: "error",
			message: "reconciliation failed installation=unknown operation=reconciliation category=broad",
			installationId: "unknown",
			operation: "reconciliation",
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
			{ installationId: "9", operation: "pull_request", category: "targeted" },
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
