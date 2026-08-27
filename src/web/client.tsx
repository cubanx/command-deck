import { useQueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "#/routeTree.gen";
import { AppProvider } from "#/web/app-provider";

const root = document.getElementById("root");

if (!root) throw new Error("Command Center frontend root is missing");

const FrontendRouter = () => {
	const queryClient = useQueryClient();
	const [router] = useState(() =>
		createRouter({ routeTree, context: { queryClient } }),
	);

	return <RouterProvider router={router} />;
};

createRoot(root).render(
	<AppProvider>
		<FrontendRouter />
	</AppProvider>,
);
