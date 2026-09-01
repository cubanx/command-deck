import { fileURLToPath } from "node:url";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tanstackRouter({ target: "react", autoCodeSplitting: false })],
	resolve: {
		alias: { "#": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: { environment: "happy-dom" },
});
