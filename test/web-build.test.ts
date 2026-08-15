import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { buildBrowserScript } from "#/web/build";

test("the browser entry is TypeScript that Bun can build without dependencies", async () => {
	expect(await buildBrowserScript()).toContain("/api/snapshot");
	expect(
		await readFile(new URL("../src/web/build.ts", import.meta.url), "utf8"),
	).not.toContain('import "./app"');
});
