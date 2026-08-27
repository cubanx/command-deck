import { createRoot } from "react-dom/client";
import { AppProvider } from "#/web/app-provider";
import { FrontendShell } from "#/web/frontend";

const root = document.getElementById("root");

if (!root) throw new Error("Command Center frontend root is missing");

createRoot(root).render(
	<AppProvider>
		<FrontendShell />
	</AppProvider>,
);
