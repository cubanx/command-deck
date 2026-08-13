export const APPROVED_INSTALLATION_ACCOUNTS = ["cubanx", "Crisp-Inc", "hudson-law"] as const;
export const approvedInstallationAccount = (login: unknown): login is string => typeof login === "string" && APPROVED_INSTALLATION_ACCOUNTS.some((account) => account.toLowerCase() === login.toLowerCase());
