import { createTheme, MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

const theme = createTheme({
	primaryColor: "cyan",
	primaryShade: 4,
	defaultRadius: "sm",
	components: {
		Button: { defaultProps: { variant: "outline" } },
	},
	colors: {
		cyan: [
			"#ecfeff",
			"#cffafe",
			"#a5f3fc",
			"#7dd3fc",
			"#38bdf8",
			"#0ea5e9",
			"#0284c7",
			"#0369a1",
			"#075985",
			"#0c4a6e",
		],
		dark: [
			"#e5edf6",
			"#d5deea",
			"#b6c2d0",
			"#8b9bb0",
			"#64748b",
			"#475569",
			"#334155",
			"#202b3d",
			"#172033",
			"#101827",
		],
	},
});

export const AppProvider = ({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) => {
	const [client] = useState(() => queryClient ?? new QueryClient());

	return (
		<MantineProvider defaultColorScheme="dark" theme={theme}>
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		</MantineProvider>
	);
};
