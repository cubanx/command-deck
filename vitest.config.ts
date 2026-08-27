import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.{ts,tsx}"],
		fileParallelism: true,
		maxWorkers: 4,
		coverage: {
			provider: "v8",
			reporter: ["text", "json"],
			reportsDirectory: "coverage/unit",
			include: ["src/**/*.ts"],
		},
	},
});
