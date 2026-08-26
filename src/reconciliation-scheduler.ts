import type { PullRequestTarget } from "#/reconciliation-coordinator";

type NewYorkTime = { weekday: number; hour: number; minute: number };

const newYorkFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	weekday: "short",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

const newYorkTime = (date: Date): NewYorkTime => {
	const values = Object.fromEntries(
		newYorkFormatter
			.formatToParts(date)
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, part.value]),
	);
	return {
		weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
			values.weekday,
		),
		hour: Number(values.hour),
		minute: Number(values.minute),
	};
};

const isWeekdayBoundary = (date: Date) => {
	const { weekday, hour, minute } = newYorkTime(date);
	return (
		weekday >= 1 && weekday <= 5 && hour >= 7 && hour < 19 && minute % 10 === 0
	);
};

export function nextWeekdayReconciliationAt(after: Date) {
	// ponytail: bounded minute scan avoids timezone conversion dependencies; replace if scheduling becomes hot.
	for (
		let candidate = new Date(
			Math.floor(after.getTime() / 60_000) * 60_000 + 60_000,
		);
		candidate.getTime() - after.getTime() <= 8 * 24 * 60 * 60_000;
		candidate = new Date(candidate.getTime() + 60_000)
	)
		if (isWeekdayBoundary(candidate)) return candidate;
	return undefined;
}

type SchedulerDependencies = {
	now?: () => Date;
	setTimeout?: (callback: () => void, delay: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
	knownOpenPullRequests(): Promise<PullRequestTarget[]>;
	enqueue(target: PullRequestTarget): void;
};

export function createWeekdayReconciliationScheduler({
	now = () => new Date(),
	setTimeout: scheduleTimeout = setTimeout,
	clearTimeout: cancelTimeout = (handle) =>
		clearTimeout(handle as ReturnType<typeof setTimeout>),
	knownOpenPullRequests,
	enqueue,
}: SchedulerDependencies) {
	let timer: unknown;
	let stopped = false;
	const run = () =>
		void knownOpenPullRequests()
			.then((targets) => targets.forEach(enqueue))
			.catch((error) =>
				console.error(
					"weekday reconciliation scheduling failed",
					error instanceof Error ? error.name : "unknown",
				),
			);
	const schedule = () => {
		if (stopped) return;
		const current = now();
		if (isWeekdayBoundary(current)) run();
		const next = nextWeekdayReconciliationAt(current);
		if (next)
			timer = scheduleTimeout(
				schedule,
				Math.max(0, next.getTime() - current.getTime()),
			);
	};
	return {
		start: schedule,
		stop() {
			stopped = true;
			if (timer !== undefined) cancelTimeout(timer);
		},
	};
}
