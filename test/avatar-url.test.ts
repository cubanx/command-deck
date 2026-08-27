import { expect, test } from "vitest";
import { avatarUrlFor } from "#/features/command-center/avatar-url";

test("accepts only credential-free absolute HTTPS avatar URLs", () => {
	expect(avatarUrlFor("https://example.test/kira.png")).toBe("https://example.test/kira.png");
	for (const value of [
		"javascript:alert(1)",
		"http://example.test/kira.png",
		"https://kira:secret@example.test/kira.png",
		"not a url",
	])
		expect(avatarUrlFor(value)).toBeNull();
});
