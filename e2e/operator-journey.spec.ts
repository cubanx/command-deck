import { expect, test } from "@playwright/test";

test("operator can inspect, merge, and refresh fixture pull requests", async ({
	page,
	request,
}) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Command Deck.ai" })).toBeVisible();

	await page.locator("#pr-search").fill("Bajoran");
	await expect(page.locator("a.pr-title-link")).toHaveText(
		"#201 · Restore the Bajoran relay",
	);
	await page.locator("#clear-pr-filters").click();
	await page.locator("#pr-sort").selectOption("repository");
	await page.locator("#pr-direction").selectOption("asc");
	await expect(page.locator("a.pr-title-link")).toHaveText([
		"#201 · Restore the Bajoran relay",
		"#202 · Calibrate the Defiant sensor array",
	]);

	const blocked = page
		.locator("article.card")
		.filter({ hasText: "Restore the Bajoran relay" });
	await expect(blocked.getByRole("button", { name: "Merge" })).toHaveCount(0);
	await blocked.locator("a.pr-title-link").click();
	const statusDetail = page.getByRole("dialog", {
		name: "Pull request status detail",
	});
	await expect(statusDetail.getByText("OpenSpec incomplete")).toBeVisible();
	await expect(
		statusDetail.getByText(/OpenSpec · stabilize-bajoran-relay/),
	).toBeVisible();
	await expect(statusDetail.getByText(/Actions: success.*Checks: success/)).toBeVisible();
	await statusDetail.getByLabel("Close status detail").click();

	await page.locator('.deployment-summary[data-status-detail="deployments"]').click();
	await expect(
		page.getByRole("dialog", { name: "Deployment detail" }),
	).toContainText("Deep Space Nine");
	await page.getByLabel("Close deployment detail").click();

	await page.locator("#pr-search").fill("Defiant");
	await page.locator("#pr-sort").selectOption("repository");
	await page.locator("#pr-direction").selectOption("asc");
	await request.post("/__e2e__/refresh");
	await expect(page.locator("a.pr-title-link")).toHaveText([
		"#201 · Refresh the Defiant Bajoran relay",
		"#202 · Refresh the Defiant sensor array",
	]);
	await expect(page.locator("#pr-search")).toHaveValue("Defiant");
	await expect(page.locator("#pr-sort")).toHaveValue("repository");
	await expect(page.locator("#pr-direction")).toHaveValue("asc");

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
		.locator("article.card")
		.filter({ hasText: "Refresh the Defiant sensor array" });
	await eligible.getByRole("button", { name: "Merge" }).click();
	await expect(
		page.getByRole("heading", { name: "Confirm fixture merge" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Confirm merge" }).click();
	await expect(page.getByText("Fixture merge completed")).toBeVisible();
	await page.getByRole("link", { name: "Return to dashboard" }).click();

});
