import { readFileSync } from "node:fs";

export type FrontendManifest = Record<string, { file: string; css?: string[] }>;

const unavailable = () => new Error("Prebuilt frontend assets unavailable");

export const loadFrontendAssets = (directory = new URL("../../dist/", import.meta.url)) => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(new URL(".vite/manifest.json", directory), "utf8"));
		if (typeof parsed !== "object" || parsed === null) throw unavailable();
		const manifest = parsed as FrontendManifest;
		const entry = manifest["src/web/client.tsx"];
		if (!entry?.file || !Array.isArray(entry.css)) throw unavailable();
		for (const file of [entry.file, ...entry.css]) readFileSync(new URL(file, directory));
		return {
			manifest,
			asset: (file: string) => {
				if (!file.startsWith("assets/") || file.includes("..")) return undefined;
				try {
					return readFileSync(new URL(file, directory));
				} catch {
					throw unavailable();
				}
			},
		};
	} catch {
		throw unavailable();
	}
};
