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

test("filter row stays compact on tablets and uses a mobile grid", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(/\.command-center-filter-row \.filter-grow\s*\{\s*flex: 0 1 20rem;\s*min-width: 14rem;\s*\}/);
	expect(css).toMatch(
		/@media \(min-width: 601px\) and \(max-width: 760px\)\s*\{[\s\S]*?\.command-center-filter-row\s*\{\s*flex-wrap: nowrap;\s*\}[\s\S]*?\.command-center-filter-row \.filter-grow,[\s\S]*?\.command-center-filter-row \.filter-sort\s*\{\s*flex: 1 1 0;\s*min-width: 0;\s*\}/,
	);
	expect(css).toMatch(/\.command-center-filter-row \.filter-status\s*\{\s*flex: 0 0 auto;\s*\}/);
	expect(css).toMatch(
		/@media \(min-width: 601px\) and \(max-width: 760px\)\s*\{[\s\S]*?\.command-center-filter-row button\s*\{\s*flex: none;\s*\}/,
	);
	expect(css).toMatch(
		/@media \(max-width: 600px\)\s*\{[\s\S]*?\.command-center-filter-row\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\}[\s\S]*?\.command-center-filter-row \.filter-grow\s*\{\s*grid-column: 1 \/ -1;\s*\}/,
	);
	expect(css).toMatch(
		/@media \(max-width: 600px\)\s*\{[\s\S]*?\.command-center-filter-row \.filter-status,[\s\S]*?\.command-center-filter-row \.filter-sort\s*\{\s*min-width: 0;\s*\}/,
	);
	expect(css).toMatch(
		/@media \(max-width: 420px\)\s*\{[\s\S]*?\.command-center-filter-row \.filter-status,[\s\S]*?\.command-center-filter-row \.filter-sort\s*\{\s*grid-column: 1 \/ -1;\s*\}/,
	);
});

test("Sort width accommodates semantic ordering labels", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(/\.command-center-filter-row \.filter-sort\s*\{\s*flex: 0 0 14rem;\s*min-width: 14rem;\s*\}/);
});

test("Navigation brand keeps its icon size while centering the larger label", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(/\.brand-icon\s*\{\s*width: 44px;\s*height: 44px;/);
	expect(css).toMatch(/\.command-center-navigation \.brand\s*\{\s*align-items: center;\s*\}/);
	expect(css).toMatch(
		/\.command-center-navigation \.brand strong\s*\{\s*font-size: 1\.25rem;\s*line-height: 1\.1;\s*\}/,
	);
});

test("navigation deployment summary keeps status beside its label above the detail", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(
		/\.command-center-navigation \.deployment-summary-content\s*\{\s*display: grid;\s*grid-template-columns: auto auto;\s*gap: 2px 6px;\s*\}/,
	);
	expect(css).toMatch(
		/\.command-center-navigation \.deployment-summary-label\s*\{\s*grid-column: 1;\s*grid-row: 1;[\s\S]*?\}/,
	);
	expect(css).toMatch(
		/\.command-center-navigation \.deployment-summary \.status\s*\{\s*grid-column: 2;\s*grid-row: 1;/,
	);
	expect(css).toMatch(
		/\.command-center-navigation \.deployment-summary-detail\s*\{\s*grid-column: 1 \/ -1;\s*grid-row: 2;[\s\S]*?\}/,
	);
});

test("narrow navigation keeps a centered deployment rail without forcing the brand onto its own row", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(
		/@media \(max-width: 760px\)\s*\{[\s\S]*?\.command-center-navigation\s*\{\s*display: flex;\s*flex-wrap: wrap;\s*\}/,
	);
	expect(css).toMatch(
		/@media \(max-width: 760px\)\s*\{[\s\S]*?\.command-center-header-brand,[\s\S]*?\.command-center-header-avatar\s*\{\s*flex: 1 1 0;\s*\}/,
	);
	expect(css).toMatch(
		/@media \(max-width: 760px\)\s*\{[\s\S]*?\.command-center-header-deployment\s*\{\s*flex: 0 0 auto;\s*\}/,
	);
	expect(css).not.toMatch(/\.command-center-navigation \.brand\s*\{\s*flex-basis: 100%;\s*\}/);
});

test("OpenSpec disclosures retain their native summary affordances", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(/\.openspec > summary\s*\{\s*cursor: pointer;\s*\}/);
	expect(css).toMatch(/summary:focus-visible\s*\{/);
});

test("dashboard blockers and post-merge pills stay contained", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(/\.command-center-blockers\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/);
	expect(css).toMatch(/\.post-merge-badge\s*\{[\s\S]*?margin-inline-start:\s*[^;]+;[\s\S]*?vertical-align:\s*middle;/);
});

test("PR title menu trigger keeps its prominent heading presentation", () => {
	const css = text("src/web/app.css");
	expect(css).toMatch(
		/\.command-center-pr-title-trigger\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;[\s\S]*?gap:\s*[^;]+;[\s\S]*?max-width:\s*100%;[\s\S]*?font:\s*inherit;/,
	);
	expect(css).toMatch(/\.command-center-pr-title-text\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/);
	expect(css).toMatch(
		/\.command-center-pr-title-cue\s*\{[\s\S]*?flex:\s*none;[\s\S]*?line-height:\s*1;[\s\S]*?transform:\s*translateY\(-1px\);/,
	);
	expect(css).toMatch(
		/\.command-center-pr-title-trigger\[data-expanded\]\s+\.command-center-pr-title-cue\s*\{[\s\S]*?transform:\s*translateY\(-1px\)\s+rotate\(180deg\);/,
	);
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
