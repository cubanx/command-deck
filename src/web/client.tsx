import "@mantine/core/styles.css";
import "#/web/app.css";
import { useQueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { syncAppearance } from "#/features/command-center/appearance";
import { routeTree } from "#/routeTree.gen";
import { AppProvider } from "#/web/app-provider";

const root = document.getElementById("root");

if (!root) throw new Error("Command Center frontend root is missing");

const FrontendRouter = () => {
	const queryClient = useQueryClient();
	const [router] = useState(() => createRouter({ routeTree, context: { queryClient } }));

	return <RouterProvider router={router} />;
};

const Appearance = () => {
	useEffect(() => {
		return syncAppearance();
	}, []);
	return null;
};

createRoot(root).render(
	<AppProvider>
		<Appearance />
		<FrontendRouter />
	</AppProvider>,
);
