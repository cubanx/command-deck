import { normalized, type OpenSpecEvidence, parseTasks } from "#/features/command-center/view-model";

type RequestLike = {
	result?: unknown;
	error?: unknown;
	onerror?: IDBRequest["onerror"] | (() => void);
	onsuccess?: IDBRequest["onsuccess"] | (() => void);
};
const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown error");
export type BrowserFileHandle = { getFile(): Promise<{ text(): Promise<string> }> };
export type BrowserDirectoryHandle = {
	name?: string;
	kind?: string;
	getDirectoryHandle(name: string): Promise<BrowserDirectoryHandle>;
	getFileHandle(name: string): Promise<BrowserFileHandle>;
	entries(): AsyncIterable<[string, BrowserDirectoryHandle]>;
	queryPermission(options: { mode: "read" }): Promise<PermissionState>;
	requestPermission(options: { mode: "read" }): Promise<PermissionState>;
};
export type CheckoutRecord = {
	key: string;
	account?: string;
	kind?: "root" | "override";
	handle?: BrowserDirectoryHandle;
};
const requestResult = (request: RequestLike) =>
	new Promise((resolve, reject) => {
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
export const checkoutStoreFor = <Record>(
	open: () => Promise<{ getAll(): RequestLike; put(record: Record): RequestLike }>,
) => ({
	getAll: async () => requestResult((await open()).getAll()),
	put: async (record: Record) => requestResult((await open()).put(record)),
});
const checkoutDatabase = () =>
	new Promise<IDBDatabase>((resolve, reject) => {
		if (!globalThis.indexedDB) throw new TypeError("Checkout storage is unavailable");
		const request = globalThis.indexedDB.open("dcc-checkouts", 1);
		request.onupgradeneeded = () => request.result.createObjectStore("handles", { keyPath: "key" });
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
const checkoutStore = () =>
	checkoutStoreFor(async () => {
		const database = await checkoutDatabase();
		return {
			getAll: () => database.transaction("handles").objectStore("handles").getAll(),
			put: (record: CheckoutRecord) => database.transaction("handles", "readwrite").objectStore("handles").put(record),
		};
	});
export const storedCheckouts = () => checkoutStore().getAll();
export const persistCheckout = (record: CheckoutRecord) => checkoutStore().put(record);
export const checkoutKey = (account: unknown, repositoryId: unknown) =>
	`${normalized(account)}:${String(repositoryId)}`;
export const exactCheckoutDirectory = (
	root: Pick<BrowserDirectoryHandle, "getDirectoryHandle">,
	repository: Pick<{ full_name: string }, "full_name">,
) => root.getDirectoryHandle(repository.full_name.split("/").at(-1) ?? repository.full_name);
export const revalidateCheckout = (record: { handle: Pick<BrowserDirectoryHandle, "queryPermission"> }) =>
	record.handle.queryPermission({ mode: "read" });
export const persistVerifiedCheckout = async <Handle, Repo, Record>({
	handle,
	repository,
	read,
	persist,
	record,
}: {
	handle: Handle;
	repository: Repo;
	read(handle: Handle, repository: Repo): Promise<unknown>;
	persist(record: Record): Promise<unknown>;
	record: Record;
}) => {
	if (!(await read(handle, repository))) return false;
	await persist(record);
	return true;
};
export type CheckoutRepository = {
	account_login: string;
	installation_id: string;
	repository_id: string;
	full_name: string;
};
export const repositoryForRemote = (content: unknown) => {
	const origin = String(content ?? "").match(/^\[remote "origin"\]([\s\S]*?)(?=^\[|(?![\s\S]))/m);
	const match = origin?.[1].match(
		/^\s*url\s*=\s*(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\s*$/im,
	);
	return match ? normalized(`${match[1]}/${match[2].replace(/\.git$/i, "")}`) : null;
};
export const readCheckout = async (handle: BrowserDirectoryHandle, repository: CheckoutRepository) => {
	const git = await handle.getDirectoryHandle(".git");
	const config = await (await git.getFileHandle("config")).getFile();
	if (repositoryForRemote(await config.text()) !== normalized(repository.full_name)) return null;
	const head = await (await git.getFileHandle("HEAD")).getFile();
	const value = (await head.text()).trim();
	const ref = value.match(/^ref: refs\/heads\/([A-Za-z0-9._/-]+)$/)?.[1] ?? null;
	const source_ref = ref && !ref.includes("..") ? ref : null;
	const source_commit = /^[0-9a-f]{40}$/i.test(value) ? value : null;
	const specs: OpenSpecEvidence[] = [];
	const files = new Map<string, BrowserFileHandle>();
	try {
		const changes = await (await handle.getDirectoryHandle("openspec")).getDirectoryHandle("changes");
		for await (const [name, directory] of changes.entries()) {
			if (directory.kind !== "directory" || !/^[A-Za-z0-9._-]+$/.test(name)) continue;
			try {
				const fileHandle = await directory.getFileHandle("tasks.md");
				const tasks = await fileHandle.getFile();
				specs.push({
					change_name: name,
					...parseTasks(await tasks.text()),
					source_ref,
					source_commit,
					source_type: "local",
					installation_id: repository.installation_id,
					account_login: repository.account_login,
					repository_id: repository.repository_id,
				});
				files.set(name, fileHandle);
			} catch (error) {
				if (errorName(error) !== "NotFoundError") console.error("Local OpenSpec read failed", errorName(error));
			}
		}
	} catch (error) {
		if (errorName(error) !== "NotFoundError") throw error;
	}
	return { specs, files };
};
