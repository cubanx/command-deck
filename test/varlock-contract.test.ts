import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("..", import.meta.url);
const text = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Varlock schema loads the approved local Environment through its official plugin", () => {
	expect(existsSync(new URL(".env.example", root))).toBe(false);
	expect(existsSync(new URL(".env", root))).toBe(false);
	expect(existsSync(new URL(".env.scan", root))).toBe(true);
	const schema = text(".env.schema");
	expect(schema).toContain("@plugin(@varlock/1password-plugin)");
	expect(schema).toContain("@initOp(token=$OP_SERVICE_ACCOUNT_TOKEN)");
	expect(schema).toContain(
		"@setValuesBulk(opLoadEnvironment(axpdch34cfdzlzyaziox2dvopy), omit=[GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET,GITHUB_APP_ID,GITHUB_APP_PRIVATE_KEY])",
	);
	expect(schema).toContain('@type=enum("0","1")');
	expect(schema).toMatch(
		/@type=opServiceAccountToken[^\n]*@sensitive[^\n]*@internal[^\n]*\nOP_SERVICE_ACCOUNT_TOKEN=/,
	);
	for (const name of [
		"PORT",
		"MONGODB_URI_BASE",
		"MONGODB_DATABASE",
		"DCC_LOCAL_DEMO",
		"NODE_ENV",
		"PUBLIC_URL",
		"RAILWAY_PUBLIC_DOMAIN",
		"GITHUB_CLIENT_ID",
		"GITHUB_CLIENT_SECRET",
		"GITHUB_APP_ID",
		"GITHUB_APP_SLUG",
		"GITHUB_APP_PRIVATE_KEY",
		"GITHUB_WEBHOOK_SECRET",
		"GITHUB_REVIEW_BOT_LOGIN",
		"GITHUB_REVIEW_BOT_START_MARKER",
		"GITHUB_REVIEW_BOT_DONE_MARKER",
		"RECONCILE_INTERVAL_MS",
	])
		expect(schema).toMatch(new RegExp(`^${name}=`, "m"));
	expect(schema).toContain("# @type=port");
	expect(schema).toMatch(/@type=string @sensitive\nMONGODB_URI_BASE=$/m);
	expect(text(".env.scan")).toBe(
		"# Scan-only overlay: MongoDB URI credentials are checked by scripts/scan-credential-uris.ts.\n# @import(./.env.schema)\n# ---\n\n# @type=string @sensitive=false\nMONGODB_URI_BASE=\n",
	);
	for (const name of [
		"MONGODB_URI_BASE",
		"GITHUB_CLIENT_ID",
		"GITHUB_CLIENT_SECRET",
		"GITHUB_APP_ID",
		"GITHUB_APP_PRIVATE_KEY",
		"GITHUB_WEBHOOK_SECRET",
	])
		expect(schema).toMatch(new RegExp(`@sensitive[^\\n]*\\n${name}=`, "m"));
	const refs = [
		"op://Automation/zoevvjnwlb52itscyya6rjuaqi/Section_tcdsae2ktrn7v4ow7qy3z24yw4/client-id",
		"op://Automation/zoevvjnwlb52itscyya6rjuaqi/password",
		"op://Automation/m5h6j7dj2mwxzwooks7ivjsh2m/Section_nmrnwjoh4gmsnscml47w57zb5y/app-id",
		"op://Automation/m5h6j7dj2mwxzwooks7ivjsh2m/password",
	];
	for (const [name, ref] of [
		["GITHUB_CLIENT_ID", refs[0]],
		["GITHUB_CLIENT_SECRET", refs[1]],
		["GITHUB_APP_ID", refs[2]],
		["GITHUB_APP_PRIVATE_KEY", refs[3]],
	])
		expect(schema).toMatch(
			new RegExp(
				`^${name}=op\\(${ref.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\)$`,
				"m",
			),
		);
	expect(schema.match(/op:\/\/[^)\s]+/g)).toEqual(refs);
	expect(schema).not.toContain("allowAppAuth");
	const manifest = text("package.json");
	expect(JSON.parse(manifest).scripts).toMatchObject({
		dev: "DCC_LOCAL_DEMO=0 NODE_ENV=development bunx varlock run -- bun --watch src/server.ts",
		"dev:demo":
			"NODE_ENV=development DCC_LOCAL_DEMO=1 bun --watch src/server.ts",
	});
	expect(JSON.parse(manifest)).toMatchObject({
		devDependencies: {
			"@varlock/1password-plugin": expect.any(String),
			varlock: expect.any(String),
		},
	});
});
