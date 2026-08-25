import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const root = new URL("..", import.meta.url);
const mongoUri = (
	scheme: string,
	user: string,
	password: string,
	host: string,
) => [scheme, "//", user, ":", password, "@", host].join("");

const scan = async (content?: string, paths?: string[]) => {
	const directory = mkdtempSync(join(tmpdir(), "dcc-uri-scan-"));
	const path = join(directory, "fixture.txt");
	if (content !== undefined) writeFileSync(path, content);
	try {
		const child = spawn(
			process.execPath,
			[
				"scripts/scan-credential-uris.ts",
				...(paths ?? (content === undefined ? [] : [path])),
			],
			{
				cwd: root.pathname,
			},
		);
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk;
		});
		const [exitCode] = await once(child, "close");
		return {
			exitCode,
			stderr,
		};
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

test.each([
	["mongodb:", "sisko", "orb-experience", "localhost/command-deck"],
	["mongodb+srv:", "kira", "resistance-cell", "cluster.example/command-deck"],
])(
	"credential-bearing MongoDB URIs fail without being echoed",
	async (...parts) => {
		const uri = mongoUri(...parts);
		const result = await scan(uri);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			"credential-bearing MongoDB URI is not allowed",
		);
		expect(result.stderr).not.toContain(uri);
	},
);

test("credential-free localhost MongoDB URIs pass", async () => {
	const result = await scan("mongodb://127.0.0.1:27018/command-deck");
	expect(result).toEqual({ exitCode: 0, stderr: "" });
});

test("missing paths emit a sanitized warning", async () => {
	const directory = mkdtempSync(join(tmpdir(), "dcc-uri-missing-"));
	const path = join(directory, "missing.txt");
	try {
		expect(await scan(undefined, [path])).toEqual({
			exitCode: 0,
			stderr: `${path}: tracked file is missing; skipped\n`,
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

test("untracked credential-bearing MongoDB URIs fail", async () => {
	const path = join(root.pathname, ".scan-credential-uri-test");
	writeFileSync(
		path,
		mongoUri("mongodb:", "odo", "constable-bucket", "localhost/command-deck"),
	);
	try {
		const result = await scan();
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(
			".scan-credential-uri-test:1: credential-bearing MongoDB URI is not allowed",
		);
	} finally {
		rmSync(path, { force: true });
	}
});
