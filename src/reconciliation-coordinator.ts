export type PullRequestTarget = {
	installationId: string;
	repositoryId: string;
	number: number;
};
export type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;
export const countedFetch = (fetcher: FetchLike) => {
	let count = 0;
	return {
		fetcher: (input: RequestInfo | URL, init?: RequestInit) => {
			count++;
			return fetcher(input, init);
		},
		count: () => count,
	};
};
export type ReconciliationTrigger =
	| "scheduled"
	| "webhook"
	| "startup"
	| "manual";
type ReconciliationResult = {
	kind?: "changed" | "unchanged" | "error";
	providerRequestCount?: number;
	changedFieldCategories?: string[];
	unresolvedDeliveryCount?: number;
	repairedDeliveryCount?: number;
};
type ReconciliationOutcome = "success" | "failed";
type QueuedTarget = {
	target: PullRequestTarget;
	trigger: ReconciliationTrigger;
	waiters: Array<(outcome: ReconciliationOutcome) => void>;
};

type CoordinatorDependencies = {
	reconcilePullRequest(
		target: PullRequestTarget,
	): Promise<ReconciliationResult | void>;
	reconcileInstallations(): Promise<unknown>;
	recordRun?: (run: {
		installationId: string;
		trigger: ReconciliationTrigger;
		startedAt: Date;
		completedAt: Date;
		durationMs: number;
		prCount: number;
		providerRequestCount: number;
		changedPrCount: number;
		unchangedPrCount: number;
		changedFieldCategories: string[];
		failureCount: number;
		unresolvedDeliveryCount: number;
		repairedDeliveryCount: number;
		outcome: "success" | "partial_failure" | "failure";
	}) => Promise<void>;
	debounceMs?: number;
	onError?: (error: unknown) => void;
};

type InstallationWork = {
	pending: Map<string, QueuedTarget>;
	dirty: Map<string, QueuedTarget>;
	active?: string;
	timer?: ReturnType<typeof setTimeout>;
};

const targetKey = ({ repositoryId, number }: PullRequestTarget) =>
	`${repositoryId}:${number}`;

export function createReconciliationCoordinator({
	reconcilePullRequest,
	reconcileInstallations,
	recordRun,
	debounceMs = 250,
	onError = () => console.error("reconciliation failed"),
}: CoordinatorDependencies) {
	const installations = new Map<string, InstallationWork>();
	let broadRequested = false;
	let broadRunning = false;
	const workFor = (installationId: string) => {
		let work = installations.get(installationId);
		if (!work) {
			work = { pending: new Map(), dirty: new Map() };
			installations.set(installationId, work);
		}
		return work;
	};
	const hasTargetWork = () =>
		[...installations.values()].some((work) =>
			Boolean(work.active || work.timer || work.pending.size),
		);
	const runBroad = () => {
		if (!broadRequested || broadRunning || hasTargetWork()) return;
		broadRequested = false;
		broadRunning = true;
		void reconcileInstallations()
			.catch(onError)
			.finally(() => {
				broadRunning = false;
				for (const installationId of installations.keys()) run(installationId);
				runBroad();
			});
	};
	const run = (installationId: string) => {
		const work = workFor(installationId);
		if (work.active || broadRunning) return;
		const next = work.pending.entries().next().value as
			| [string, QueuedTarget]
			| undefined;
		if (!next) {
			runBroad();
			return;
		}
		const [key, queued] = next;
		work.pending.delete(key);
		work.active = key;
		const startedAt = new Date();
		void reconcilePullRequest(queued.target)
			.then(async (result) => {
				const completedAt = new Date();
				await recordRun?.({
					installationId,
					trigger: queued.trigger,
					startedAt,
					completedAt,
					durationMs: completedAt.getTime() - startedAt.getTime(),
					prCount: 1,
					providerRequestCount: result?.providerRequestCount ?? 0,
					changedPrCount: result?.kind === "changed" ? 1 : 0,
					unchangedPrCount: result?.kind === "unchanged" ? 1 : 0,
					changedFieldCategories:
						result?.changedFieldCategories ??
						(result?.kind === "changed" ? ["lifecycle"] : []),
					failureCount: result?.kind === "error" ? 1 : 0,
					unresolvedDeliveryCount: result?.unresolvedDeliveryCount ?? 0,
					repairedDeliveryCount: result?.repairedDeliveryCount ?? 0,
					outcome: result?.kind === "error" ? "failure" : "success",
				});
				queued.waiters.forEach((waiter) => {
					waiter(result?.kind === "error" ? "failed" : "success");
				});
			})
			.catch((error) => {
				onError(error);
				queued.waiters.forEach((waiter) => {
					waiter("failed");
				});
			})
			.finally(() => {
				work.active = undefined;
				const dirty = work.dirty.get(key);
				if (dirty) {
					work.pending.set(key, dirty);
					work.dirty.delete(key);
				}
				run(installationId);
				runBroad();
			});
	};
	return {
		enqueue(
			target: PullRequestTarget,
			trigger: ReconciliationTrigger = "scheduled",
		) {
			const work = workFor(target.installationId);
			const key = targetKey(target);
			let resolve: (outcome: ReconciliationOutcome) => void;
			const outcome = new Promise<ReconciliationOutcome>((done) => {
				resolve = done;
			});
			const queued = work.active === key ? work.dirty : work.pending;
			const existing = queued.get(key);
			if (existing) existing.waiters.push(resolve!);
			else queued.set(key, { target, trigger, waiters: [resolve!] });
			if (!work.timer && !work.active) {
				work.timer = setTimeout(() => {
					work.timer = undefined;
					run(target.installationId);
				}, debounceMs);
			}
			return outcome;
		},
		reconcileInstallations() {
			broadRequested = true;
			runBroad();
		},
		stop() {
			for (const work of installations.values())
				if (work.timer !== undefined) clearTimeout(work.timer);
		},
	};
}
