import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

export const AppProvider = ({ children, queryClient }: { children: ReactNode; queryClient?: QueryClient }) => {
	const [client] = useState(() => queryClient ?? new QueryClient());

	return (
		<MantineProvider>
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		</MantineProvider>
	);
};
