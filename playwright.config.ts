import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "e2e",
	use: { baseURL: "http://127.0.0.1:4174" },
	workers: 1,
	webServer: {
		command: "bun run e2e:server",
		url: "http://127.0.0.1:4174",
		reuseExistingServer: false,
	},
});
