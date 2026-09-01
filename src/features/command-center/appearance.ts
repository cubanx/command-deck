export const appearanceKey = "dcc-appearance";
export const appearanceFor = ({
	preference: storedPreference,
	systemDark = false,
}: {
	preference?: unknown;
	systemDark?: boolean;
} = {}) => {
	const preference = ["system", "dark", "light"].includes(String(storedPreference))
		? (storedPreference as "system" | "dark" | "light")
		: "system";
	return { preference, theme: preference === "system" ? (systemDark ? "dark" : "light") : preference };
};
export const applyAppearance = (value: unknown) => {
	const appearance = appearanceFor({
		preference: value,
		systemDark: globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches,
	});
	document.documentElement.dataset.appearance = appearance.theme;
	document.documentElement.dataset.mantineColorScheme = appearance.theme;
	document.documentElement.style.colorScheme = appearance.theme;
	return appearance;
};
export const appearancePreference = () => {
	try {
		return appearanceFor({
			preference: globalThis.localStorage?.getItem(appearanceKey),
			systemDark: globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches,
		});
	} catch (error) {
		console.error("Appearance preference read failed", error instanceof Error ? error.name : "unknown error");
		return appearanceFor();
	}
};
export const saveAppearance = (value: string) => {
	try {
		globalThis.localStorage?.setItem(appearanceKey, value);
		return applyAppearance(value);
	} catch (error) {
		console.error("Appearance preference save failed", error instanceof Error ? error.name : "unknown error");
		return appearanceFor();
	}
};
export const syncAppearance = () => {
	const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
	const apply = () => applyAppearance(appearancePreference().preference);
	apply();
	media?.addEventListener("change", apply);
	return () => media?.removeEventListener("change", apply);
};
