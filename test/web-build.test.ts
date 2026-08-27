import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { frontendAssetLoader, loadFrontendAssets } from "#/web/frontend-assets";
import { buildFrontend, frontendManifestFor } from "#/web/frontend-build";

test("the frontend entry emits a production browser asset", async () => {
	const output = await buildFrontend();

	expect(output.some((asset) => asset.type === "chunk" && asset.isEntry)).toBe(true);
	const manifest = frontendManifestFor(output);
	expect(manifest["src/web/client.tsx"]?.file).toBeTruthy();
	expect(
		Object.values(manifest)
			.flatMap((entry) => [entry.file, ...(entry.css ?? [])])
			.every((file) => output.some((asset) => asset.fileName === file)),
	).toBe(true);
});

test("the Vite shell targets the React root and runtime loads prebuilt manifest assets", async () => {
	await buildFrontend({ write: true });
	const { manifest, asset } = loadFrontendAssets();
	const entry = manifest["src/web/client.tsx"];
	const shell = await readFile(new URL("../src/web/index.html", import.meta.url), "utf8");
	expect(shell).toContain('id="root"');
	expect(shell).not.toContain('id="app"');
	expect(shell).not.toContain("/app.js");
	expect(asset(entry.file)).toBeTruthy();
	for (const file of entry.css ?? []) expect(asset(file)).toBeTruthy();
});

test("runtime fails closed when production assets are absent", async () => {
	const directory = await mkdtemp(join(tmpdir(), "command-center-assets-"));
	try {
		expect(() => loadFrontendAssets(pathToFileURL(`${directory}/`))).toThrow("Prebuilt frontend assets unavailable");
	} finally {
		await rm(directory, { recursive: true });
	}
});

test("development reloads changed hashed manifest assets while production keeps its loaded manifest", async () => {
	const path = await mkdtemp(join(tmpdir(), "command-center-assets-"));
	const directory = pathToFileURL(`${path}/`);
	const manifestPath = new URL(".vite/manifest.json", directory);
	const original = { file: "assets/client-original.js", css: [] };
	try {
		await mkdir(new URL(".vite/", directory), { recursive: true });
		await mkdir(new URL("assets/", directory));
		await writeFile(new URL(original.file, directory), "original");
		await writeFile(manifestPath, JSON.stringify({ "src/web/client.tsx": original }));
		const development = frontendAssetLoader({ directory, development: true });
		const production = frontendAssetLoader({ directory });
		expect(development().manifest["src/web/client.tsx"]?.file).toBe(original.file);
		expect(production().manifest["src/web/client.tsx"]?.file).toBe(original.file);
		await writeFile(new URL("assets/client-rebuilt.js", directory), "rebuilt");
		await writeFile(
			manifestPath,
			JSON.stringify({ "src/web/client.tsx": { ...original, file: "assets/client-rebuilt.js" } }),
		);
		await utimes(manifestPath, new Date(), new Date(Date.now() + 1_000));
		expect(development().manifest["src/web/client.tsx"]?.file).toBe("assets/client-rebuilt.js");
		expect(production().manifest["src/web/client.tsx"]?.file).toBe(original.file);
	} finally {
		await rm(path, { recursive: true });
	}
});
