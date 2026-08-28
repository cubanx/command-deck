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
	const direction = page.getByRole("combobox", { name: "Sort direction" });
	const cards = page.getByRole("article");
	await search.fill("Bajoran");
	await expect(cards).toHaveCount(1);
	await expect(page.getByRole("article", { name: "Restore the Bajoran relay" })).toBeVisible();
	await page.getByRole("button", { name: "Status: All (8)" }).click();
	await page.getByRole("checkbox", { name: "All" }).uncheck();
	await page.getByRole("checkbox", { name: "OpenSpec" }).check();
	await expect(page.getByRole("button", { name: "Status (1)" })).toBeVisible();
	await expect(cards).toHaveCount(1);
	await expect(page.getByRole("article", { name: "Restore the Bajoran relay" })).toBeVisible();
	await page.getByRole("button", { name: "Clear filters" }).click();
	await sort.selectOption("repository");
	await direction.selectOption("asc");
	await expect(cards).toHaveCount(2);
	await expect(cards.nth(0)).toHaveAccessibleName("Restore the Bajoran relay");
	await expect(cards.nth(1)).toHaveAccessibleName("Calibrate the Defiant sensor array");

	const blocked = page
		.getByRole("article", { name: "Restore the Bajoran relay" });
	await expect(blocked.getByRole("button", { name: "Merge" })).toHaveCount(0);
	await blocked.getByRole("button", { name: "Inspect Restore the Bajoran relay status" }).click();
	const statusDetail = page.getByRole("dialog", {
		name: "Pull request status detail",
	});
	await expect(statusDetail.getByText("OpenSpec incomplete")).toBeVisible();
	await expect(
		statusDetail.getByText(/OpenSpec · stabilize-bajoran-relay/),
	).toBeVisible();
	await expect(statusDetail.getByText("Actions: success")).toBeVisible();
	await expect(statusDetail.getByText("Checks: success")).toBeVisible();
	await statusDetail.getByRole("button", { name: "Close status detail" }).click();

	await page.getByRole("button", { name: /Latest deployment/ }).click();
	await expect(
		page.getByRole("dialog", { name: "Deployment detail" }),
	).toContainText("Deep Space Nine");
	await page.getByRole("button", { name: "Close deployment detail" }).click();

	await search.fill("Defiant");
	await sort.selectOption("repository");
	await direction.selectOption("asc");
	await request.post("/__e2e__/refresh");
	await expect(cards).toHaveCount(2);
	await expect(cards.nth(0)).toHaveAccessibleName("Refresh the Defiant Bajoran relay");
	await expect(cards.nth(1)).toHaveAccessibleName("Refresh the Defiant sensor array");
	await expect(search).toHaveValue("Defiant");
	await expect(sort).toHaveValue("repository");
	await expect(direction).toHaveValue("asc");
	await page.reload();
	await expect(sort).toHaveValue("repository");
	await expect(direction).toHaveValue("asc");

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
	await expect(
		eligible.getByRole("form", { name: "Merge Refresh the Defiant sensor array" }),
	).toHaveAttribute("action", "/api/merge/start");
	await eligible.getByRole("button", { name: "Merge" }).click();
	await expect(
		page.getByRole("heading", { name: "Confirm fixture merge" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Confirm merge" }).click();
	await expect(page.getByText("Fixture merge completed")).toBeVisible();
	await page.getByRole("link", { name: "Return to dashboard" }).click();

});
