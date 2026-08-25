import { expect, test } from "vitest";
import {
	createWeekdayReconciliationScheduler,
	nextWeekdayReconciliationAt,
} from "#/reconciliation-scheduler";

test("selects New York weekday ten-minute boundaries across DST", () => {
	expect(
		nextWeekdayReconciliationAt(
			new Date("2026-03-09T10:59:00Z"),
		)?.toISOString(),
	).toBe("2026-03-09T11:00:00.000Z");
	expect(
		nextWeekdayReconciliationAt(
			new Date("2026-11-02T11:59:00Z"),
		)?.toISOString(),
	).toBe("2026-11-02T12:00:00.000Z");
	expect(
		nextWeekdayReconciliationAt(
			new Date("2026-08-24T22:50:00Z"),
		)?.toISOString(),
	).toBe("2026-08-25T11:00:00.000Z");
	expect(
		nextWeekdayReconciliationAt(
			new Date("2026-08-22T16:00:00Z"),
		)?.toISOString(),
	).toBe("2026-08-24T11:00:00.000Z");
});

test("runs immediately at 07:00, enqueues known open PRs, and cleans up", async () => {
	const scheduled: Array<{ callback: () => void; delay: number }> = [];
	const cleared: unknown[] = [];
	const targets: Array<{
		installationId: string;
		repositoryId: string;
		number: number;
	}> = [];
	const scheduler = createWeekdayReconciliationScheduler({
		now: () => new Date("2026-08-24T11:00:00Z"),
		setTimeout: (callback, delay) => {
			scheduled.push({ callback, delay });
			return scheduled.length;
		},
		clearTimeout: (handle) => cleared.push(handle),
		knownOpenPullRequests: async () => [
			{ installationId: "9", repositoryId: "2", number: 7 },
			{ installationId: "9", repositoryId: "3", number: 8 },
		],
		enqueue: (target) => targets.push(target),
	});
	scheduler.start();
	for (let count = 0; count < 3; count++) await Promise.resolve();
	expect(targets).toEqual([
		{ installationId: "9", repositoryId: "2", number: 7 },
		{ installationId: "9", repositoryId: "3", number: 8 },
	]);
	expect(scheduled[0]?.delay).toBe(600_000);
	scheduler.stop();
	expect(cleared).toEqual([1]);
});

test("does not run before hours, after hours, or on weekends", async () => {
	for (const value of [
		"2026-08-24T10:59:00Z",
		"2026-08-24T23:00:00Z",
		"2026-08-22T15:00:00Z",
	]) {
		let runs = 0;
		const scheduler = createWeekdayReconciliationScheduler({
			now: () => new Date(value),
			setTimeout: () => 1,
			clearTimeout: () => {},
			knownOpenPullRequests: async () => {
				runs++;
				return [];
			},
			enqueue: () => {},
		});
		scheduler.start();
		await Promise.resolve();
		expect(runs).toBe(0);
		scheduler.stop();
	}
});
