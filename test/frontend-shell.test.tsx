// @vitest-environment happy-dom

import { QueryClient } from "@tanstack/react-query";
import { test } from "vitest";
import { FrontendShell } from "#/web/frontend";
import { renderFrontend } from "#/web/test-harness";

test("root providers render an accessible Command Center main surface", () => {
	const { getByRole } = renderFrontend(<FrontendShell />, new QueryClient());

	getByRole("main", { name: "Command Center" });
});
