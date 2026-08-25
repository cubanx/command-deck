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
