export const APPROVED_INSTALLATION_ACCOUNTS = [
	"cubanx",
	"Crisp-Inc",
	"hudson-law",
] as const;
export const normalizedLogin = (login: unknown) =>
	typeof login === "string" ? login.trim().toLowerCase() : undefined;
export const sameLogin = (left: unknown, right: unknown) =>
	Boolean(
		normalizedLogin(left) && normalizedLogin(left) === normalizedLogin(right),
	);
export const approvedInstallationAccount = (login: unknown): login is string =>
	Boolean(
		normalizedLogin(login) &&
			APPROVED_INSTALLATION_ACCOUNTS.some((account) =>
				sameLogin(account, login),
			),
	);
