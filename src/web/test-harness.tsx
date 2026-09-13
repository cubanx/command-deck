import { MantineThemeProvider } from "@mantine/core";
import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { AppProvider } from "#/web/app-provider";

export const renderFrontend = (ui: ReactElement, queryClient = new QueryClient()) =>
	render(ui, {
		wrapper: ({ children }) => (
			<AppProvider queryClient={queryClient}>
				<MantineThemeProvider theme={{ components: { Menu: { defaultProps: { transitionProps: { duration: 0 } } } } }}>
					{children}
				</MantineThemeProvider>
			</AppProvider>
		),
	});
