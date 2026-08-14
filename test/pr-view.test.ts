import { expect, test } from "vitest";
import {
	appearanceFor,
	bucketFor,
	derivePullRequests,
	fuzzyScore,
	repositoryOptions,
} from "#/web/app.js";

const items = [
	{
		pr: {
			number: 12,
			title: "Defiant readiness",
			full_name: "ds9/ops",
			head_ref: "defiant/ready",
			draft: 1,
			mergeable: "clean",
		},
		spec: { change_name: "upgrade-defiant" },
	},
	{
		pr: {
			number: 11,
			title: "Station reports",
			full_name: "ds9/reports",
			head_ref: "reports/main",
			draft: 0,
			mergeable: "unknown",
		},
		spec: null,
	},
	{
		pr: {
			number: 10,
			title: "Docking controls",
			full_name: "ds9/ops",
			head_ref: "docking/controls",
			draft: 1,
			mergeable: false,
		},
		spec: null,
	},
	{
		pr: {
			number: 9,
			title: "Defiant telemetry",
			full_name: "ds9/ops",
			head_ref: "defiant/telemetry",
			draft: 0,
			mergeable: true,
		},
		spec: null,
	},
];

type ViewItem = { pr: { number: number } };
const numbers = (views: ViewItem[]) => views.map(({ pr }) => pr.number);

test("status buckets are exclusive and ordered before descending PR number", () => {
	expect(bucketFor(items[0].pr)).toBe("mergeable");
	expect(bucketFor(items[1].pr)).toBe("ready");
	expect(bucketFor(items[2].pr)).toBe("draft");
	expect(numbers(derivePullRequests(items, {}))).toEqual([12, 9, 11, 10]);
});

test("search ranks exact, prefix, substring, then typo matches and keeps numeric queries exact", () => {
	expect([
		fuzzyScore("defiant", "defiant"),
		fuzzyScore("defiant", "defiant readiness"),
		fuzzyScore("defiant", "upgrade defiant controls"),
		fuzzyScore("defiant", "defint"),
	]).toEqual([0, 1, 2, 3]);
	expect(numbers(derivePullRequests(items, { query: "9" }))).toEqual([9]);
	expect(numbers(derivePullRequests(items, { query: "defint" }))).toEqual([
		12, 9,
	]);
});

test("title, repository, branch, OpenSpec, status, and multi-repository filters compose", () => {
	for (const query of [
		"readiness",
		"ds9/ops",
		"defiant/ready",
		"upgrade-defiant",
	])
		expect(numbers(derivePullRequests(items, { query }))).toContain(12);
	expect(
		numbers(
			derivePullRequests(items, {
				query: "defiant",
				statuses: new Set(["mergeable"]),
				repositories: new Set(["ds9/ops", "ds9/reports"]),
			}),
		),
	).toEqual([12, 9]);
	expect(repositoryOptions(items, "rep")).toEqual(["ds9/reports"]);
});

test("appearance preference defaults to System and explicit choices override it", () => {
	expect(appearanceFor(undefined, false)).toEqual({
		preference: "system",
		theme: "light",
	});
	expect(appearanceFor("system", true)).toEqual({
		preference: "system",
		theme: "dark",
	});
	expect(appearanceFor("light", true)).toEqual({
		preference: "light",
		theme: "light",
	});
	expect(appearanceFor("dark", false)).toEqual({
		preference: "dark",
		theme: "dark",
	});
});
