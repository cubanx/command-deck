import { expect, test } from "@playwright/test";

test("operator can inspect, merge, and refresh fixture pull requests", async ({
	page,
	request,
}) => {
	await page.goto("/");
	await expect(page.getByRole("main", { name: "Command Center" })).toBeVisible();
	await expect(page.getByRole("link", { name: /Command Deck\.ai/ })).toHaveAttribute("href", "/");

	const search = page.getByRole("textbox", { name: "Search pull requests" });
	const sort = page.getByRole("combobox", { name: "Sort pull requests" });
	const status = page.getByRole("combobox", { name: "Status" });
	const cards = page.getByRole("article");
	await search.fill("Bajoran");
	await expect(cards).toHaveCount(1);
	await expect(page.getByRole("article", { name: "Restore the Bajoran relay" })).toBeVisible();
	await search.fill("");
	await status.click();
	await page.getByRole("option", { exact: true, name: "OpenSpec" }).click();
	await expect(cards).toHaveCount(1);
	await expect(page.getByRole("article", { name: "Restore the Bajoran relay" })).toBeVisible();
	await page.getByRole("button", { name: "Clear filters" }).click();
	await expect(status).toHaveAttribute("placeholder", "All statuses");
	await sort.selectOption("repository:asc");
	await expect(cards).toHaveCount(2);
	await expect(cards.nth(0)).toHaveAccessibleName("Restore the Bajoran relay");
	await expect(cards.nth(1)).toHaveAccessibleName("Calibrate the Defiant sensor array");

	const blocked = page
		.getByRole("article", { name: "Restore the Bajoran relay" });
	const blockedActions = blocked.getByRole("button", { name: "Actions for Restore the Bajoran relay" });
	await expect(blocked.getByRole("link", { name: "Restore the Bajoran relay" })).toHaveCount(0);
	await expect(blockedActions).toContainText("⌄");
	await blockedActions.click();
	const actionMenu = page.getByRole("menu");
	await expect(actionMenu.getByRole("menuitem", { name: "Merge" })).toHaveCount(0);
	await expect(actionMenu.getByRole("menuitem").allTextContents()).resolves.toEqual(["Reconcile PR", "Open PR ↗"]);
	const openPr = actionMenu.getByRole("menuitem").filter({ hasText: "Open PR" });
	await expect(openPr).toHaveAttribute("href", "https://github.com/starfleet/defiant/pull/201");
	await expect(openPr).toHaveAttribute("target", "_blank");
	await expect(openPr).toHaveAttribute("rel", "noreferrer");
	await actionMenu.getByRole("menuitem", { name: "Reconcile PR" }).click();
	await expect(page.getByText("Reconciliation completed.")).toBeVisible();
	await expect(blockedActions).toBeFocused();

	await page.getByRole("button", { name: /Latest deployment/ }).click();
	await expect(
		page.getByRole("dialog", { name: "Deployment detail" }),
	).toContainText("Deep Space Nine");
	await page.getByRole("button", { name: "Close deployment detail" }).click();

	await search.fill("Defiant");
	await sort.selectOption("repository:asc");
	await request.post("/__e2e__/refresh");
	await expect(cards).toHaveCount(2);
	await expect(cards.nth(0)).toHaveAccessibleName("Refresh the Defiant Bajoran relay");
	await expect(cards.nth(1)).toHaveAccessibleName("Refresh the Defiant sensor array");
	await expect(search).toHaveValue("Defiant");
	await expect(sort).toHaveValue("repository:asc");
	await page.reload();
	await expect(sort).toHaveValue("repository:asc");

	const rejected = await request.post("/api/merge/start", {
		form: {
			installationId: "ds9",
			repositoryId: "sensor-array",
			number: "202",
			headSha: "not-the-defiant",
		},
	});
	expect(rejected.status()).toBe(400);

	const eligible = page
		.getByRole("article", { name: "Refresh the Defiant sensor array" });
	await eligible.getByRole("button", { name: "Actions for Refresh the Defiant sensor array" }).click();
	await expect(page.getByRole("form", { name: "Merge Refresh the Defiant sensor array" })).toHaveAttribute(
		"action",
		"/api/merge/start",
	);
	await page.getByRole("menu").getByRole("menuitem", { name: "Merge" }).click();
	await expect(
		page.getByRole("heading", { name: "Confirm fixture merge" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Confirm merge" }).click();
	await expect(page.getByText("Fixture merge completed")).toBeVisible();
	await page.getByRole("link", { name: "Return to dashboard" }).click();

});
