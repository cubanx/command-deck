import { build } from "vite";

export type FrontendManifest = Record<string, { file: string; css?: string[] }>;
export type BuildOutput = { type: string; fileName: string; source?: string | Uint8Array; code?: string };

export const frontendManifestFor = (output: BuildOutput[]): FrontendManifest => {
	const manifest = output.find((asset) => asset.type === "asset" && asset.fileName.endsWith("manifest.json"));
	if (!manifest?.source) throw new TypeError("Frontend build did not produce a manifest");
	const source = typeof manifest.source === "string" ? manifest.source : new TextDecoder().decode(manifest.source);
	const parsed: unknown = JSON.parse(source);
	if (typeof parsed !== "object" || parsed === null) throw new TypeError("Invalid frontend manifest");
	return parsed as FrontendManifest;
};

export const buildFrontend = async ({ write = false, watch = false } = {}) => {
	const result = await build({
		build: {
			manifest: true,
			write,
			watch: watch ? {} : undefined,
			rollupOptions: {
				input: new URL("./client.tsx", import.meta.url).pathname,
			},
		},
	});

	if (write) return [];
	if (Array.isArray(result)) return result.flatMap(({ output }) => output);
	if ("output" in result) return result.output;
	throw new Error("Frontend build did not produce assets");
};

export const buildFrontendAssets = async () => {
	const output = await buildFrontend();
	const manifest = frontendManifestFor(output);
	const files = new Map(
		output.flatMap((asset) => {
			const content = asset.type === "asset" ? asset.source : asset.code;
			return content === undefined
				? []
				: [[asset.fileName, typeof content === "string" ? content : new TextDecoder().decode(content)] as const];
		}),
	);
	return { files, manifest, output };
};

if (import.meta.main) await buildFrontend({ write: true, watch: process.argv.includes("--watch") });
