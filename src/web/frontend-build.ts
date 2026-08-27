import { build } from "vite";

type FrontendManifest = Record<string, { file: string; css?: string[] }>;
type BuildOutput = { type: string; fileName: string; source?: string | Uint8Array };

export const frontendManifestFor = (output: BuildOutput[]): FrontendManifest => {
	const manifest = output.find((asset) => asset.type === "asset" && asset.fileName.endsWith("manifest.json"));
	if (!manifest?.source) throw new TypeError("Frontend build did not produce a manifest");
	const source = typeof manifest.source === "string" ? manifest.source : new TextDecoder().decode(manifest.source);
	const parsed: unknown = JSON.parse(source);
	if (typeof parsed !== "object" || parsed === null) throw new TypeError("Invalid frontend manifest");
	return parsed as FrontendManifest;
};

export const buildFrontend = async () => {
	const result = await build({
		build: {
			manifest: true,
			write: false,
			rollupOptions: {
				input: new URL("./client.tsx", import.meta.url).pathname,
			},
		},
	});

	if (Array.isArray(result)) return result.flatMap(({ output }) => output);
	if ("output" in result) return result.output;
	throw new Error("Frontend build did not produce assets");
};
