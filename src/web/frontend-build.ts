import { build } from "vite";

export const buildFrontend = async () => {
	const result = await build({
		build: {
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
