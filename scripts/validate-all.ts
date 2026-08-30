import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../validation-commands.json", import.meta.url), "utf8")) as {
	commands: string[];
};

for (const command of manifest.commands) {
	const result = Bun.spawn(command.split(" "), {
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await result.exited) !== 0) process.exitCode = 1;
	if (process.exitCode) break;
}
