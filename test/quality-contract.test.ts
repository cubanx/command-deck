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
		"bun run check:crap",
	]);
	expect(ciCommands.sort()).toEqual([...commands.commands].sort());
	expect(workflow).not.toContain("bun run validate:all");
	expect(workflow).toContain("name: Validate All");
	expect(workflow.slice(workflow.indexOf("  docker-build:"))).not.toContain(
		"needs:",
	);
});
