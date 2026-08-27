import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { buildBrowserScript } from "#/web/build";
import { buildFrontend } from "#/web/frontend-build";

test("the legacy browser entry remains TypeScript that Bun can build", async () => {
	expect(await buildBrowserScript()).toContain("/api/snapshot");
	expect(await readFile(new URL("../src/web/build.ts", import.meta.url), "utf8")).not.toContain('import "./app"');
});

test("the frontend entry emits a production browser asset", async () => {
	const output = await buildFrontend();

	expect(output.some((asset) => asset.type === "chunk" && asset.isEntry)).toBe(true);
});
