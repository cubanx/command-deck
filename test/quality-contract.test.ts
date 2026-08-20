import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("..", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Quality CI runs exactly the shared validation commands without validate:all", () => {
	const commands = JSON.parse(text("validation-commands.json")) as {
		commands: string[];
	};
	const workflow = text(".github/workflows/ci-quality.yml");
	const ciCommands = [...workflow.matchAll(/- run: (bun run [^\n]+)/g)].map(
		([, command]) => command,
	);
	expect(commands.commands).toEqual([
		"bun run check",
		"bun run typecheck",
		"bun run build:web",
		"bun run check:crap",
	]);
	expect(ciCommands.sort()).toEqual([...commands.commands].sort());
	expect(workflow).not.toContain("bun run validate:all");
	expect(workflow).toContain("name: Validate All");
	expect(workflow.slice(workflow.indexOf("  docker-build:"))).not.toContain(
		"needs:",
	);
	const dockerfile = text("Dockerfile");
	expect(dockerfile).toContain("COPY --chown=bun:bun tsconfig.json ./");
	expect(workflow).toContain(
		"docker run --rm command-center-ai:quality bun -e 'await import(\"./src/server.ts\")'",
	);
	expect(JSON.parse(text("src/web/manifest.webmanifest"))).toMatchObject({
		name: "Command Deck.ai",
		short_name: "Command Deck",
		display: "standalone",
	});
	expect(text("src/web/index.html")).toContain(
		'<link rel="manifest" href="/manifest.webmanifest">',
	);
	expect(text("src/web/app.ts")).not.toContain(
		"navigator.serviceWorker.register",
	);
	const worker = text("src/web/sw.js");
	expect(worker).toContain("self.skipWaiting()");
	expect(worker).toContain('self.addEventListener("activate"');
	const claim = worker.search(/self\.clients\s*\.claim\(\)/);
	const matchAll = worker.indexOf(".matchAll(");
	expect(claim).toBeGreaterThanOrEqual(0);
	expect(claim).toBeLessThan(matchAll);
	expect(matchAll).toBeLessThan(worker.indexOf("client.navigate(client.url)"));
	expect(worker).toMatch(/caches\s*\.\s*keys\(\)/);
	expect(worker).toMatch(/caches\s*\.\s*delete\(cache\)/);
	expect(worker).toContain("self.registration.unregister()");
	expect(worker).toContain("client.navigate(client.url)");
	expect(worker).not.toContain('self.addEventListener("fetch"');
	expect(worker).not.toMatch(/(?:const|let|var)\s+\w*cache\w*/i);
});
