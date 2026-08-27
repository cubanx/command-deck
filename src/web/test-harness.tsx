import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { AppProvider } from "#/web/app-provider";

export const renderFrontend = (
	ui: ReactElement,
	queryClient = new QueryClient(),
) =>
	render(ui, {
		wrapper: ({ children }) => (
			<AppProvider queryClient={queryClient}>{children}</AppProvider>
		),
	});
