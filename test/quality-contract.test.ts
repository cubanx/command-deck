import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("..", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Quality CI runs exactly the shared validation commands without validate:all", () => {
	const commands = JSON.parse(text("validation-commands.json")) as {
		commands: string[];
	};
	const workflow = text(".github/workflows/ci-quality.yml");
	const ciCommands = [...workflow.matchAll(/- run: (bun run [^\n]+)/g)].map(([, command]) => command);
	expect(commands.commands).toEqual(["bun run check", "bun run typecheck", "bun run build:web", "bun run check:crap"]);
	expect(ciCommands.sort()).toEqual([...commands.commands, "bun run test:e2e"].sort());
	expect(workflow).not.toContain("bun run validate:all");
	expect(workflow).toContain("name: Validate All");
	expect(workflow).toContain("name: Playwright E2E");
	expect(workflow).toContain("bunx playwright install --with-deps chromium");
	expect(workflow).toContain("bun run test:e2e");
	expect(workflow.slice(workflow.indexOf("  docker-build:"))).not.toContain("needs:");
	const dockerfile = text("Dockerfile");
	expect(dockerfile).toContain("FROM oven/bun:1.3.11 AS frontend-build");
	expect(dockerfile).toContain("RUN bun install --frozen-lockfile");
	expect(dockerfile).toContain("RUN bun run build:web");
	expect(dockerfile).toContain("COPY --from=frontend-build --chown=bun:bun /app/dist ./dist");
	expect(dockerfile).toContain("bun install --frozen-lockfile --production");
	expect(text(".dockerignore")).toContain("dist");
	expect(dockerfile).toContain("COPY --chown=bun:bun tsconfig.json ./");
	expect(text("src/server.ts")).not.toContain("frontend-build");
	expect(text("src/web/frontend-assets.ts")).not.toContain('from "vite"');
	expect(workflow).toContain("docker run --rm command-center-ai:quality bun -e 'await import(\"./src/server.ts\")'");
	expect(JSON.parse(text("src/web/manifest.webmanifest"))).toMatchObject({
		name: "Command Deck.ai",
		short_name: "Command Deck",
		display: "standalone",
	});
	expect(text("src/web/index.html")).toContain('<link rel="manifest" href="/manifest.webmanifest">');
	expect(text("src/web/client.tsx")).not.toContain("navigator.serviceWorker.register");
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

test("local validation loads, scans, and injects Varlock while CI remains credential-free", () => {
	const packageJson = JSON.parse(text("package.json")) as {
		scripts: Record<string, string>;
	};
	const workflow = text(".github/workflows/ci-quality.yml");
	expect(packageJson.scripts["validate:all"]).toBe(
		"bun scripts/scan-credential-uris.ts && bunx varlock load --agent && bunx varlock scan --path .env.scan && bunx varlock run -- bun scripts/validate-all.ts",
	);
	expect(workflow).not.toMatch(/varlock|OP_SERVICE_ACCOUNT_TOKEN|1password/i);
});

test("development startup builds the ignored frontend assets before starting the Vite-free server", () => {
	const packageJson = JSON.parse(text("package.json")) as { scripts: Record<string, string> };
	expect(packageJson.scripts.dev).toContain("bun run build:web &&");
	expect(packageJson.scripts["dev:demo"]).toContain("bun run build:web &&");
	expect(packageJson.scripts.dev).toContain("scripts/dev.ts");
	expect(packageJson.scripts["dev:demo"]).toContain("scripts/dev.ts");
	expect(text("scripts/dev.ts")).toContain('"--watch", "src/server.ts"');
	expect(text("scripts/dev.ts")).toContain('"src/web/frontend-build.ts", "--watch"');
});

test("Railway deploys only when runtime inputs change", () => {
	const railway = JSON.parse(text("railway.json")) as {
		build: { watchPatterns?: string[] };
	};
	expect(railway.build.watchPatterns).toEqual(["**", "!/README.md", "!/docs/**", "!/openspec/**", "!/.mex/**"]);
});

test("server allows serial GitHub reconciliation to outlive Bun's default idle timeout", () => {
	expect(text("src/server.ts")).toMatch(/Bun\.serve\(\{[\s\S]*?idleTimeout:\s*255,[\s\S]*?fetch:\s*app\.fetch,/);
});
