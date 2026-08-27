export type SortMode = "opened" | "closest" | "updated" | "progress" | "repository";
export type SortDirection = "asc" | "desc";
export type SortPreference = { mode: SortMode; direction: SortDirection };

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;
type Log = (message: string, detail: string) => void;

export const defaultSortPreference: SortPreference = {
	mode: "closest",
	direction: "asc",
};

const sortModes = new Set<SortMode>(["opened", "closest", "updated", "progress", "repository"]);

export const isSortMode = (value: string): value is SortMode => sortModes.has(value as SortMode);

const errorName = (error: unknown) => (error instanceof Error ? error.name : "UnknownError");

export const sortPreference = (stored: unknown): SortPreference => {
	try {
		const value: unknown = JSON.parse(String(stored));
		if (
			typeof value === "object" &&
			value !== null &&
			typeof (value as SortPreference).mode === "string" &&
			isSortMode((value as SortPreference).mode) &&
			((value as SortPreference).direction === "asc" || (value as SortPreference).direction === "desc")
		)
			return value as SortPreference;
	} catch {}
	return defaultSortPreference;
};

export const loadSortPreference = (storage: StorageReader | undefined, log: Log = console.error) => {
	try {
		return sortPreference(storage?.getItem("dcc-pr-sort"));
	} catch (error) {
		log("Pull request sort read failed", errorName(error));
		return defaultSortPreference;
	}
};

export const saveSortPreference = (
	preference: SortPreference,
	storage: StorageWriter | undefined,
	log: Log = console.error,
) => {
	try {
		storage?.setItem("dcc-pr-sort", JSON.stringify(preference));
	} catch (error) {
		log("Pull request sort save failed", errorName(error));
	}
};
