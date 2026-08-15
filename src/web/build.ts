import { readFile } from "node:fs/promises";

const outputDirectory = new URL("../../dist", import.meta.url).pathname;

export const buildBrowserScript = async ({ write = false } = {}) => {
	if (typeof Bun === "undefined")
		return readFile(new URL("../../dist/app.js", import.meta.url), "utf8");
	const result = await Bun.build({
		entrypoints: [new URL("./app.ts", import.meta.url).pathname],
		target: "browser",
		...(write ? { outdir: outputDirectory } : {}),
	});
	const output = result.outputs[0];
	if (!result.success || !output)
		throw new Error("Browser TypeScript build failed");
	return output.text();
};

if (import.meta.main) await buildBrowserScript({ write: true });
