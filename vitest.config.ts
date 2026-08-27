import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json"],
			reportsDirectory: "coverage/unit",
			include: ["src/**/*.ts"],
		},
		projects: [
			{
				test: {
					name: "unit",
					include: ["test/**/*.test.{ts,tsx}"],
					exclude: [
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
					fileParallelism: true,
					maxWorkers: 4,
					sequence: { groupOrder: 0 },
				},
			},
			{
				test: {
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
				},
			},
		],
	},
});
