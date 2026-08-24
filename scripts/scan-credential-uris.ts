import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const paths = process.argv.slice(2);
const trackedPaths = paths.length
	? paths
	: (
			await execFileAsync("git", [
				"ls-files",
				"--cached",
				"--others",
				"--exclude-standard",
				"-z",
			])
		).stdout
			.split("\0")
			.filter(Boolean);
const credentialBearingMongoUri = /mongodb(?:\+srv)?:\/\/[^:\s/]+:[^@\s]+@/;
let found = false;

for (const path of trackedPaths) {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			console.error(`${path}: tracked file is missing; skipped`);
			continue;
		}
		throw error;
	}
	const lines = content.split(/\r?\n/);
	for (const [index, line] of lines.entries()) {
		if (!credentialBearingMongoUri.test(line)) continue;
		console.error(
			`${path}:${index + 1}: credential-bearing MongoDB URI is not allowed`,
		);
		found = true;
	}
}

if (found) process.exitCode = 1;
