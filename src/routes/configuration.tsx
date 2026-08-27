import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/configuration")({
	component: () => <main aria-label="Configuration">Configuration</main>,
});
