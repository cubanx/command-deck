export type Deployment = {
	id?: string;
	full_name?: string;
	environment?: string;
	ref?: string;
	sha?: string;
	state?: string;
	updated_at?: string;
	target_url?: string | null;
	log_url?: string | null;
};

export const safeHref = (value: unknown) => {
	try {
		const url = new URL(String(value));
		return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
	} catch {
		return undefined;
	}
};
export const latestDeployment = (deployments: Deployment[]) =>
	deployments.toSorted((left, right) => Date.parse(right.updated_at ?? "") - Date.parse(left.updated_at ?? ""))[0];
export const deploymentText = (deployment?: Deployment) =>
	deployment
		? [deployment.full_name, deployment.environment, deployment.state, deployment.ref, deployment.sha]
				.filter(Boolean)
				.join(" · ")
		: "";
const isOptionalString = (value: unknown) => value === undefined || value === null || typeof value === "string";
export const isDeployment = (value: unknown): value is Deployment =>
	typeof value === "object" &&
	value !== null &&
	["id", "full_name", "environment", "ref", "sha", "state", "updated_at", "target_url", "log_url"].every((field) =>
		isOptionalString((value as Record<string, unknown>)[field]),
	);
