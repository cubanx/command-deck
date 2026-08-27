import { expect, test, vi } from "vitest";
import {
	defaultSortPreference,
	loadSortPreference,
	saveSortPreference,
	sortPreference,
} from "#/features/command-center/sort-preference";

test("accepts every supported sort preference and rejects malformed values", () => {
	for (const mode of [
		"opened",
		"closest",
		"updated",
		"progress",
		"repository",
	]) {
		expect(sortPreference(JSON.stringify({ mode, direction: "desc" }))).toEqual(
			{
				mode,
				direction: "desc",
			},
		);
	}
	expect(sortPreference('{"mode":"unknown","direction":"asc"}')).toEqual(
		defaultSortPreference,
	);
	expect(sortPreference('{"mode":"opened","direction":"sideways"}')).toEqual(
		defaultSortPreference,
	);
	expect(sortPreference("not json")).toEqual(defaultSortPreference);
});

test("logs sanitized storage failures and keeps the default preference", () => {
	const log = vi.fn();
	const failure = new Error("secret storage path");
	expect(
		loadSortPreference(
			{
				getItem: () => {
					throw failure;
				},
			},
			log,
		),
	).toEqual(defaultSortPreference);
	expect(log).toHaveBeenCalledWith("Pull request sort read failed", "Error");
	saveSortPreference(
		defaultSortPreference,
		{
			setItem: () => {
				throw failure;
			},
		},
		log,
	);
	expect(log).toHaveBeenCalledWith("Pull request sort save failed", "Error");
});
