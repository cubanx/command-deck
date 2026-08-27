import { expect, test } from "vitest";
import config from "../vitest.config";

test("runs Mongo-backed tests in a single-worker project after unit tests", () => {
	const projects = config.test?.projects;
	const projectConfigs = (projects ?? []).filter(
		(project): project is { test: NonNullable<typeof config.test> } =>
			typeof project === "object" && project !== null && "test" in project,
	);
	expect(projectConfigs).toHaveLength(2);
	const [unit, mongo] = projectConfigs;
	expect(unit.test).toMatchObject({
		name: "unit",
		include: ["test/**/*.test.{ts,tsx}"],
		fileParallelism: true,
		maxWorkers: 4,
		sequence: { groupOrder: 0 },
	});
	expect(unit.test?.exclude).toEqual([
		"test/access.test.ts",
		"test/db.test.ts",
		"test/github-client.test.ts",
		"test/github-deployments.test.ts",
		"test/github-events.test.ts",
		"test/merge.test.ts",
		"test/mongodb.test.ts",
		"test/openspec.test.ts",
		"test/projection-invariants.test.ts",
		"test/server-startup-reconciliation.test.ts",
		"test/server.test.ts",
		"test/webhook-size.test.ts",
	]);
	expect(mongo.test).toMatchObject({
		name: "mongo",
		include: [
			"test/access.test.ts",
			"test/db.test.ts",
			"test/github-client.test.ts",
			"test/github-deployments.test.ts",
			"test/github-events.test.ts",
			"test/merge.test.ts",
			"test/mongodb.test.ts",
			"test/openspec.test.ts",
			"test/projection-invariants.test.ts",
			"test/server-startup-reconciliation.test.ts",
			"test/server.test.ts",
			"test/webhook-size.test.ts",
		],
		maxWorkers: 1,
		sequence: { groupOrder: 1 },
	});
});
