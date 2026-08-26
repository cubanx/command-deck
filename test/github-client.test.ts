import { expect, test, vi } from "vitest";
import { bindInstallation, dashboardForUser, upsertIdentity } from "#/access";
import {
	bootstrapDeployments,
	bootstrapInstallation,
	conditionalGet,
	GITHUB_REQUEST_TIMEOUT_MS,
	type GitHubRequestFailure,
	githubFetch,
	githubNextLink,
	reconcileInstallations,
	reconcilePullRequest,
	reconcileSerial,
	retryDelay,
} from "#/github";
import { countedFetch } from "#/reconciliation-coordinator";
import { withDatabase } from "./mongo-support";

test("counted fetch includes token, retry, and pagination attempts", async () => {
	const calls: string[] = [];
	const counted = countedFetch(async (input) => {
		calls.push(String(input));
		return Response.json({});
	});
	await counted.fetcher(
		"https://api.github.com/app/installations/9/access_tokens",
		{ method: "POST" },
	);
	await counted.fetcher("https://api.github.com/repositories/2/pulls?page=1");
	await counted.fetcher("https://api.github.com/repositories/2/pulls?page=1");
	await counted.fetcher("https://api.github.com/repositories/2/pulls?page=2");
	expect(counted.count()).toBe(calls.length);
	expect(counted.count()).toBe(4);
});

test("targeted repair replaces complete lifecycle evidence without broad reads", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [
				{
					number: 7,
					author_login: "sisko",
					updated_at: "2026-08-24T12:00:00Z",
				},
			],
			openSpecs: [],
			deployments: [],
			policy: { refreshed_at: "2026-08-24T12:00:00Z", required_checks: [] },
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const input: Parameters<typeof reconcilePullRequest>[1] = {
			installationId: "9",
			repositoryId: "2",
			number: 7,
			token: "token",
			fetcher: async (url, init) => {
				const value = String(url);
				if (value.endsWith("/graphql")) {
					expect(init?.method).toBe("POST");
					const query = JSON.parse(String(init?.body)).query;
					expect(
						[...query].filter((character) => character === "{").length,
					).toBe([...query].filter((character) => character === "}").length);
					return Response.json({
						data: {
							repository: {
								pullRequest: {
									state: "OPEN",
									merged: false,
									isDraft: false,
									createdAt: "2026-08-20T12:00:00Z",
									updatedAt: "2026-08-24T12:00:00Z",
									title: "Defiant readiness",
									body: "## OpenSpecs\n- alpha\n- `zeta`",
									url: "https://github.com/ds9/ops/pull/7",
									headRefOid: "a".repeat(40),
									mergeable: "MERGEABLE",
									reviewDecision: null,
									labels: {
										nodes: [{ name: "openspec-not-required" }],
										pageInfo: { hasNextPage: false },
									},
									reviewRequests: {
										totalCount: 0,
										pageInfo: { hasNextPage: false },
									},
									reviews: {
										nodes: [{ state: "COMMENTED" }],
										pageInfo: { hasNextPage: false },
									},
									reviewThreads: {
										nodes: [{ isResolved: true }],
										pageInfo: { hasNextPage: false },
									},
									statusCheckRollup: {
										contexts: { nodes: [], pageInfo: { hasNextPage: false } },
									},
								},
							},
						},
					});
				}
				if (value.includes("actions/runs"))
					return Response.json({ workflow_runs: [] });
				if (value.includes("/pulls/7/files"))
					return Response.json([
						{ filename: "openspec/changes/alpha/tasks.md", status: "modified" },
						{ filename: "openspec/changes/zeta/tasks.md", status: "renamed" },
						{
							filename: "openspec/changes/removed/tasks.md",
							status: "removed",
						},
					]);
				throw new Error(`unexpected targeted request ${value}`);
			},
			fetchTasks: async ({ path }) =>
				path.includes("alpha")
					? "- [x] Align the deflector"
					: "- [x] Tune the warp core",
		};
		const result = await reconcilePullRequest(db, input);
		expect(result.kind).toBe("changed");
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({
			number: 7,
			opened_at: "2026-08-20T12:00:00Z",
			unresolved_review_threads: 0,
			changes_requested: false,
			repository_policy_loaded: true,
		});
		expect(
			(await dashboardForUser(db, "u")).pullRequests[0]?.open_specs,
		).toMatchObject([{ change_name: "alpha" }, { change_name: "zeta" }]);
		expect(
			(await dashboardForUser(db, "u")).pullRequests[0]?.detected_open_specs,
		).toEqual(["alpha", "zeta"]);
		const repaired = await db.users.findOne({ _id: "u" });
		if (!repaired) throw new Error("test user missing");
		repaired.installations[0]!.repositories[0]!.openSpecs = [];
		await db.users.replaceOne({ _id: "u" }, repaired);
		expect((await reconcilePullRequest(db, input)).kind).toBe("changed");
		const failures: GitHubRequestFailure[] = [];
		input.fetchTasks = async () => {
			throw Object.assign(new Error("fixture failure"), { status: 500 });
		};
		input.reportFailure = (failure) => {
			failures.push(failure);
		};
		expect((await reconcilePullRequest(db, input)).kind).toBe("error");
		expect(failures).toEqual([
			{
				operation: "targeted pull request reconciliation active OpenSpec task",
				status: 500,
				target: "repositories/2/pulls/7",
			},
		]);
		failures.splice(0);
		input.fetcher = async () =>
			Response.json({
				errors: [
					{
						message: "fixture provider message must not escape",
						path: ["repository", "pullRequest", "reviewThreads", "nodes", 0],
						type: "FORBIDDEN",
					},
				],
			});
		expect((await reconcilePullRequest(db, input)).kind).toBe("error");
		expect(failures).toEqual([
			{
				operation: "targeted pull request reconciliation GraphQL lifecycle",
				status: 200,
				target: "repositories/2/pulls/7",
				diagnostic: {
					errors: [
						{
							field: "repository.pullRequest.reviewThreads.nodes",
							code: "FORBIDDEN",
						},
					],
				},
			},
		]);
		expect(JSON.stringify(failures)).not.toContain(
			"fixture provider message must not escape",
		);
		failures.splice(0);
		const message = `${"m".repeat(200)} fixture-token-value`;
		input.fetcher = async () =>
			Response.json({
				errors: [
					{
						message,
						raw_body_fixture: "must-not-escape",
					},
				],
				query: "must-not-escape",
				variables: { token: "must-not-escape" },
			});
		expect((await reconcilePullRequest(db, input)).kind).toBe("error");
		expect(failures).toEqual([
			{
				operation: "targeted pull request reconciliation GraphQL lifecycle",
				status: 200,
				target: "repositories/2/pulls/7",
				diagnostic: { errors: [{ message: "m".repeat(200) }] },
			},
		]);
		expect(JSON.stringify(failures)).not.toContain("must-not-escape");
	}));

test("targeted repair fails closed when the preserved repository policy is stale", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [{ number: 7, updated_at: "2026-08-24T12:00:00Z" }],
			openSpecs: [],
			deployments: [],
			policy: {
				refreshed_at: "2026-08-24T12:00:00Z",
				required_checks: [],
				stale: true,
			},
		});
		await db.users.replaceOne({ _id: "u" }, user!);

		await reconcilePullRequest(db, {
			installationId: "9",
			repositoryId: "2",
			number: 7,
			token: "token",
			fetcher: async (url) => {
				const value = String(url);
				if (value.endsWith("/graphql"))
					return Response.json({
						data: {
							repository: {
								pullRequest: {
									state: "OPEN",
									merged: false,
									isDraft: false,
									createdAt: "2026-08-20T12:00:00Z",
									updatedAt: "2026-08-24T12:00:00Z",
									headRefOid: "a".repeat(40),
									mergeable: "MERGEABLE",
									reviewDecision: null,
									labels: { nodes: [], pageInfo: { hasNextPage: false } },
									reviewRequests: { totalCount: 0 },
									reviews: { nodes: [], pageInfo: { hasNextPage: false } },
									reviewThreads: {
										nodes: [],
										pageInfo: { hasNextPage: false },
									},
									statusCheckRollup: {
										contexts: { nodes: [], pageInfo: { hasNextPage: false } },
									},
								},
							},
						},
					});
				if (value.includes("actions/runs"))
					return Response.json({ workflow_runs: [] });
				if (value.includes("/pulls/") && value.includes("/files"))
					return Response.json([]);
				throw new Error(`unexpected targeted request ${value}`);
			},
		});

		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({ repository_policy_loaded: false });
	}));

test("targeted repair paginates lifecycle and exact-head Actions evidence", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
			policy: {
				refreshed_at: "2026-08-24T12:00:00Z",
				required_checks: [{ context: "Validate All", integration_id: "42" }],
			},
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const calls: string[] = [];
		const result = await reconcilePullRequest(db, {
			installationId: "9",
			repositoryId: "2",
			number: 7,
			token: "token",
			fetcher: async (url, init) => {
				const value = String(url);
				calls.push(value);
				if (value.endsWith("/graphql")) {
					const body = JSON.parse(String(init?.body));
					if (body.variables.after === "threads-1")
						return Response.json({
							data: {
								repository: {
									pullRequest: {
										reviewThreads: {
											nodes: [{ isResolved: false }],
											pageInfo: { hasNextPage: false },
										},
									},
								},
							},
						});
					return Response.json({
						data: {
							repository: {
								pullRequest: {
									state: "OPEN",
									merged: false,
									isDraft: false,
									createdAt: "2026-08-20T12:00:00Z",
									updatedAt: "2026-08-24T12:00:00Z",
									headRefOid: "a".repeat(40),
									mergeable: "MERGEABLE",
									reviewDecision: null,
									labels: { nodes: [], pageInfo: { hasNextPage: false } },
									reviewRequests: { totalCount: 0 },
									reviews: { nodes: [], pageInfo: { hasNextPage: false } },
									reviewThreads: {
										nodes: [],
										pageInfo: { hasNextPage: true, endCursor: "threads-1" },
									},
									statusCheckRollup: {
										contexts: {
											nodes: [
												{
													name: "Validate All",
													conclusion: "NEUTRAL",
													checkSuite: { app: { databaseId: 42 } },
												},
											],
											pageInfo: { hasNextPage: false },
										},
									},
								},
							},
						},
					});
				}
				if (value.includes("actions/runs?page=2"))
					return Response.json({ workflow_runs: [] });
				if (value.includes("actions/runs")) {
					expect(value).toContain(`head_sha=${"a".repeat(40)}`);
					return Response.json(
						{ workflow_runs: [] },
						{
							headers: {
								link: '<https://api.github.com/repositories/2/actions/runs?page=2>; rel="next"',
							},
						},
					);
				}
				if (value.includes("/pulls/") && value.includes("/files"))
					return Response.json([]);
				throw new Error(`unexpected targeted request ${value}`);
			},
		});
		expect(result.kind).toBe("changed");
		expect(calls.some((value) => value.includes("actions/runs?page=2"))).toBe(
			true,
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({
			unresolved_review_threads: 1,
			required_checks: [{ conclusion: "neutral", head_sha: "a".repeat(40) }],
		});
	}));

test("installation bootstrap projects ruleset and classic required checks", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const result = await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.endsWith("/repos/ds9/ops"))
					return Response.json({ default_branch: "main" });
				if (value.includes("/rules/branches/main"))
					return Response.json([
						{
							rules: [
								{
									type: "required_status_checks",
									parameters: {
										required_status_checks: [
											{ context: "Validate All", integration_id: 42 },
										],
									},
								},
							],
						},
					]);
				if (value.includes("/branches/main/protection"))
					return Response.json({
						required_status_checks: {
							contexts: ["Docker Build"],
							checks: [{ context: "Docker Build", app_id: 7 }],
						},
					});
				if (value.includes("/pulls?")) return Response.json([]);
				if (value.includes("/deployments")) return Response.json([]);
				if (value.includes("/pulls/") && value.includes("/files"))
					return Response.json([]);
				throw new Error(`unexpected bootstrap request ${value}`);
			},
			"app-jwt",
		);
		expect(result.kind).toBe("changed");
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.policy,
		).toMatchObject({
			required_checks: expect.arrayContaining([
				{ context: "Validate All", integration_id: "42" },
				{ context: "Docker Build", integration_id: "7" },
			]),
		});
	}));

test("failed policy refresh preserves the prior policy as stale", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
			policy: {
				refreshed_at: "2026-08-24T12:00:00Z",
				required_checks: [{ context: "Validate All" }],
			},
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const result = await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.endsWith("/repos/ds9/ops"))
					return new Response("down", { status: 503 });
				if (value.includes("/pulls?")) return Response.json([]);
				if (
					value.includes("/deployments") ||
					(value.includes("/pulls/") && value.includes("/files"))
				)
					return Response.json([]);
				throw new Error(`unexpected bootstrap request ${value}`);
			},
			"app-jwt",
		);
		expect(result.kind).toBe("changed");
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.policy,
		).toMatchObject({
			stale: true,
			required_checks: [{ context: "Validate All" }],
		});
	}));

test("targeted repair removes a closed PR and preserves prior evidence on partial data", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			openSpecs: [],
			deployments: [],
			pullRequests: [
				{ number: 7, title: "Prior", updated_at: "2026-08-24T12:00:00Z" },
			],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const base = {
			installationId: "9",
			repositoryId: "2",
			number: 7,
			token: "token",
		};
		expect(
			(
				await reconcilePullRequest(db, {
					...base,
					fetcher: async () =>
						Response.json({
							data: {
								repository: { pullRequest: { state: "CLOSED", merged: false } },
							},
						}),
				})
			).kind,
		).toBe("changed");
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toEqual([]);

		const restored = await db.users.findOne({ _id: "u" });
		restored?.installations[0]?.repositories[0]?.pullRequests.push({
			number: 7,
			title: "Prior",
			updated_at: "2026-08-24T12:00:00Z",
		});
		await db.users.replaceOne({ _id: "u" }, restored!);
		expect(
			(
				await reconcilePullRequest(db, {
					...base,
					fetcher: async () =>
						Response.json({
							data: { repository: { pullRequest: { state: "OPEN" } } },
						}),
				})
			).kind,
		).toBe("error");
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests[0],
		).toMatchObject({ title: "Prior", lifecycle_stale: true });
	}));

test("conditional reads retain ETags and surface 304", () =>
	withDatabase(async (db) => {
		let headers: Headers | undefined;
		expect(
			(
				await conditionalGet(
					db,
					"repos/1",
					"https://example.test/a",
					async (_, init) => {
						headers = new Headers(init?.headers);
						return new Response("{}", { headers: { etag: "v1" } });
					},
				)
			).kind,
		).toBe("changed");
		expect(headers?.get("if-none-match")).toBeNull();
		expect(
			await conditionalGet(
				db,
				"repos/1",
				"https://example.test/a",
				async (_, init) => {
					headers = new Headers(init?.headers);
					return new Response(null, { status: 304 });
				},
			),
		).toMatchObject({ kind: "changed", body: {} });
		expect(headers?.get("if-none-match")).toBe("v1");
	}));

test("provider retries honor reset headers and reject ordinary forbidden responses", () => {
	const now = 1_700_000_000_000;
	expect(
		retryDelay(
			new Response(null, {
				status: 403,
				headers: {
					"x-ratelimit-remaining": "0",
					"x-ratelimit-reset": "1700000005",
				},
			}),
			0,
			now,
		),
	).toBe(5000);
	expect(
		retryDelay(
			new Response(null, { status: 429, headers: { "retry-after": "7" } }),
			0,
			now,
		),
	).toBe(7000);
	expect(
		retryDelay(new Response(null, { status: 403 }), 0, now),
	).toBeUndefined();
});

test("GitHub requests fail with a safe timeout diagnostic", async () => {
	const timeout = vi
		.spyOn(AbortSignal, "timeout")
		.mockReturnValue(
			AbortSignal.abort(new DOMException("timed out", "TimeoutError")),
		);
	try {
		await expect(
			githubFetch(
				async (_, init) => {
					init?.signal?.throwIfAborted();
					return new Response();
				},
				"https://api.github.com/fixtures/defiant",
				{ method: "POST" },
			),
		).rejects.toThrow(
			`GitHub request timed out after ${GITHUB_REQUEST_TIMEOUT_MS}ms: POST https://api.github.com/fixtures/defiant`,
		);
	} finally {
		timeout.mockRestore();
	}
});

test("GitHub pagination rejects unsafe and looping links before credentialed fetches", () => {
	expect(() =>
		githubNextLink('<https://evil.example/page>; rel="next"', new Set()),
	).toThrow("not GitHub API");
	const seen = new Set(["https://api.github.com/page"]);
	expect(() =>
		githubNextLink('<https://api.github.com/page>; rel="next"', seen),
	).toThrow("loop");
});

test("legacy bindings backfill only after approved authoritative identity", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "SISKO");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations.push({
			installationId: "9",
			boundAt: new Date(),
			repositories: [],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		let repos = 0;
		await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) =>
				String(url).includes("/app/installations/")
					? Response.json({ account: { login: "Crisp-Inc" } })
					: String(url).includes("installation/repositories")
						? (repos++, Response.json({ repositories: [] }))
						: Response.json([]),
			"app-jwt",
		);
		expect(repos).toBe(1);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.accountLogin,
		).toBe("Crisp-Inc");
	}));

test("bootstrap uses the App JWT for identity and installation token for repositories", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const result = await bootstrapInstallation(
			db,
			"9",
			"installation-token",
			async (url, init) => {
				const value = String(url),
					authorization = new Headers(init?.headers).get("authorization");
				if (value === "https://api.github.com/installation")
					throw new Error("legacy installation endpoint requested");
				if (value === "https://api.github.com/app/installations/9") {
					expect(authorization).toBe("Bearer app-jwt");
					return Response.json({ account: { login: "cubanx" } });
				}
				expect(value).toBe(
					"https://api.github.com/installation/repositories?per_page=100",
				);
				expect(authorization).toBe("Bearer installation-token");
				return Response.json({ repositories: [] });
			},
			"app-jwt",
		);
		expect(result.kind).toBe("changed");
	}));

test("serial reconciliation and complete bootstrap use installation tokens", () =>
	withDatabase(async (db) => {
		let calls = 0;
		const waits: number[] = [];
		const results = await reconcileSerial(
			db,
			["a", "b"],
			async () =>
				++calls === 1
					? new Response("retry", { status: 429 })
					: new Response("{}"),
			async (ms) => waits.push(ms),
		);
		expect(results.every((result) => result.kind === "changed")).toBe(true);
		expect(waits).toEqual([]);
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url, init) => {
				expect(new Headers(init?.headers).get("authorization")).toBe(
					String(url).includes("/app/installations/")
						? "Bearer app-jwt"
						: "Bearer token",
				);
				return String(url).includes("/app/installations/")
					? Response.json({ account: { login: "cubanx" } })
					: String(url).includes("pulls?")
						? Response.json([
								{
									number: 1,
									title: "Defiant",
									user: { login: "sisko" },
									state: "open",
								},
							])
						: Response.json({
								repositories: [{ id: 2, full_name: "ds9/ops" }],
							});
			},
			"app-jwt",
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.pullRequests,
		).toHaveLength(1);
	}));

test("multi-page reconciliation replaces only a complete snapshot", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const prior = await db.users.findOne({ _id: "u" });
		prior?.installations[0]?.repositories.push({
			repositoryId: "old",
			full_name: "ds9/old",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
		});
		await db.users.replaceOne({ _id: "u" }, prior!);
		const fetcher = async (url: RequestInfo | URL) => {
			const value = String(url);
			if (value.includes("/app/installations/"))
				return Response.json({ account: { login: "cubanx" } });
			if (value.includes("repositories?page=2"))
				return Response.json({
					repositories: [{ id: 2, full_name: "ds9/two" }],
				});
			if (value.includes("installation/repositories"))
				return Response.json(
					{ repositories: [{ id: 1, full_name: "ds9/one" }] },
					{
						headers: {
							link: '<https://api.github.com/installation/repositories?page=2>; rel="next"',
						},
					},
				);
			if (value.includes("/pulls?")) return Response.json([]);
			if (value.includes("/deployments")) return Response.json([]);
			return new Response("missing", { status: 500 });
		};
		expect(
			(await bootstrapInstallation(db, "9", "token", fetcher, "app-jwt")).kind,
		).toBe("changed");
		expect(
			(
				await db.users.findOne({ _id: "u" })
			)?.installations[0]?.repositories.map((repo) => repo.repositoryId),
		).toEqual(["1", "2"]);
		const failed = await bootstrapInstallation(
			db,
			"9",
			"token",
			async () => new Response("down", { status: 503 }),
			"app-jwt",
		);
		expect(failed.kind).toBe("error");
		expect(
			(
				await db.users.findOne({ _id: "u" })
			)?.installations[0]?.repositories.map((repo) => repo.repositoryId),
		).toEqual(["1", "2"]);
	}));

test("recent deployments follow Link pagination", () =>
	withDatabase(async (db) => {
		const calls: string[] = [];
		const result = await bootstrapDeployments(
			db,
			"9",
			"2",
			"token",
			async (url) => {
				const value = String(url);
				calls.push(value);
				if (value.includes("deployments?page=2"))
					return Response.json([{ id: 2 }]);
				if (value.includes("/deployments?"))
					return Response.json([{ id: 1 }], {
						headers: {
							link: '<https://api.github.com/repositories/2/deployments?page=2>; rel="next"',
						},
					});
				return Response.json([]);
			},
		);
		expect(result).toMatchObject({ kind: "changed" });
		expect(calls.some((value) => value.includes("deployments?page=2"))).toBe(
			true,
		);
	}));

test("complete reconciliation is user-scoped and preserves webhook fields", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "a", "sisko");
		await upsertIdentity(db, "b", "kira");
		await bindInstallation(db, "a", "9", "cubanx");
		await bindInstallation(db, "b", "9", "cubanx");
		for (const userId of ["a", "b"]) {
			const user = await db.users.findOne({ _id: userId });
			user?.installations[0]?.repositories.push({
				repositoryId: "old",
				full_name: "ds9/old",
				pullRequests: [],
				openSpecs: [],
				deployments: [],
			});
			await db.users.replaceOne({ _id: userId }, user!);
		}
		await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) =>
				String(url).includes("/app/installations/")
					? Response.json({ account: { login: "cubanx" } })
					: String(url).includes("installation/repositories")
						? Response.json({ repositories: [{ id: 2, full_name: "ds9/ops" }] })
						: String(url).includes("/pulls?")
							? Response.json([
									{
										number: 1,
										title: "Sisko",
										user: { login: "sisko" },
										state: "open",
									},
									{
										number: 2,
										title: "Kira",
										user: { login: "kira" },
										state: "open",
									},
								])
							: Response.json([]),
			"app-jwt",
		);
		expect(
			(
				await db.users.findOne({ _id: "a" })
			)?.installations[0]?.repositories[0]?.pullRequests.map((pr) => pr.number),
		).toEqual([1]);
		expect(
			(
				await db.users.findOne({ _id: "b" })
			)?.installations[0]?.repositories[0]?.pullRequests.map((pr) => pr.number),
		).toEqual([2]);
	}));

test("installation bootstrap reports direct projected PR reconciliation counts", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			openSpecs: [],
			deployments: [],
			pullRequests: [
				{
					number: 7,
					title: "The same old song",
					author_login: "sisko",
					state: "open",
					draft: 0,
				},
				{
					number: 8,
					title: "Before the Dominion War",
					author_login: "sisko",
					state: "open",
					draft: 0,
					open_spec: null,
					open_spec_declaration: "absent",
					detected_open_specs: [],
				},
			],
		});
		await db.users.replaceOne({ _id: "u" }, user!);

		const result = await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.includes("/pulls?"))
					return Response.json([
						{
							number: 7,
							title: "A changed song",
							user: { login: "sisko" },
							state: "open",
						},
						{
							number: 8,
							title: "Before the Dominion War",
							user: { login: "sisko" },
							state: "open",
						},
					]);
				return Response.json([]);
			},
			"app-jwt",
		);

		expect(result).toMatchObject({
			kind: "changed",
			prCount: 2,
			changedPrCount: 1,
			unchangedPrCount: 1,
		});
	}));

test("installation bootstrap does not double count after a user CAS retry", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			openSpecs: [],
			deployments: [],
			pullRequests: [
				{
					number: 7,
					title: "Prior",
					author_login: "sisko",
					state: "open",
					draft: 0,
				},
				{
					number: 8,
					title: "Same",
					author_login: "sisko",
					state: "open",
					draft: 0,
				},
			],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		const replace = vi
			.spyOn(db.users, "replaceOne")
			.mockImplementationOnce(async () => {
				await db.users.updateOne(
					{ _id: "u" },
					{
						$set: {
							"installations.0.repositories.0.pullRequests.1.title":
								"Intervening write",
						},
						$inc: { revision: 1 },
					},
				);
				return { modifiedCount: 0 } as never;
			});
		const result = await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.includes("/pulls?"))
					return Response.json([
						{
							number: 7,
							title: "Changed",
							user: { login: "sisko" },
							state: "open",
						},
						{
							number: 8,
							title: "Same",
							user: { login: "sisko" },
							state: "open",
						},
					]);
				return Response.json([]);
			},
			"app-jwt",
		);
		expect(replace).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			kind: "changed",
			prCount: 2,
			changedPrCount: 2,
			unchangedPrCount: 0,
		});
	}));

test("cached paginated next link survives a Link-less 304", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		let phase = 0,
			pageTwo = 0;
		const fetcher = async (url: RequestInfo | URL) => {
			const value = String(url);
			if (value.includes("/app/installations/"))
				return Response.json({ account: { login: "cubanx" } });
			if (value.includes("repositories?page=2")) {
				pageTwo++;
				return Response.json(
					{ repositories: [{ id: 2, full_name: "ds9/two" }] },
					{ headers: { etag: "p2" } },
				);
			}
			if (value.includes("installation/repositories"))
				return phase++
					? new Response(null, { status: 304 })
					: Response.json(
							{ repositories: [{ id: 1, full_name: "ds9/one" }] },
							{
								headers: {
									etag: "p1",
									link: '<https://api.github.com/installation/repositories?page=2>; rel="next"',
								},
							},
						);
			if (value.includes("/pulls?")) return Response.json([]);
			return Response.json([]);
		};
		await bootstrapInstallation(db, "9", "token", fetcher, "app-jwt");
		await bootstrapInstallation(db, "9", "token", fetcher, "app-jwt");
		expect(pageTwo).toBeGreaterThan(1);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories,
		).toHaveLength(2);
	}));

test("bootstrap rejects unsafe deployment links", () =>
	withDatabase(async (db) => {
		const result = await bootstrapDeployments(
			db,
			"9",
			"2",
			"token",
			async (url) =>
				String(url).includes("/7/statuses")
					? Response.json([
							{
								id: 1,
								state: "success",
								target_url: "javascript:alert(1)",
								log_url: "invalid",
							},
						])
					: String(url).includes("statuses")
						? Response.json([
								{
									id: 2,
									state: "success",
									target_url: "https://railway.app/deployment/8",
									log_url: "https://railway.app/logs/8",
								},
							])
						: Response.json([{ id: 7 }, { id: 8 }]),
		);
		expect(result).toMatchObject({ kind: "changed" });
		if (result.kind !== "changed") throw new Error("expected changed result");
		const body = result.body as Record<string, unknown>[];
		expect(body[0]).toMatchObject({
			target_url: undefined,
			log_url: undefined,
		});
		expect(body[1]).toMatchObject({
			target_url: "https://railway.app/deployment/8",
			log_url: "https://railway.app/logs/8",
		});
	}));

test("bootstrap caps deployment status reads and rows at twenty", () =>
	withDatabase(async (db) => {
		let statuses = 0;
		const result = await bootstrapDeployments(
			db,
			"9",
			"2",
			"token",
			async (url) =>
				String(url).includes("statuses")
					? (statuses++, Response.json([]))
					: Response.json(Array.from({ length: 21 }, (_, id) => ({ id }))),
		);
		expect(statuses).toBe(20);
		if (result.kind !== "changed") throw new Error("expected changed result");
		expect(result.body).toHaveLength(20);
	}));

test("deployment status cache preserves authoritative state on 304", () =>
	withDatabase(async (db) => {
		let statusReads = 0;
		const fetcher = async (url: RequestInfo | URL) => {
			const value = String(url);
			if (value.includes("/7/statuses"))
				return statusReads++
					? new Response(null, { status: 304 })
					: Response.json(
							[
								{
									id: 101,
									state: "success",
									created_at: "2030-01-02T00:00:00Z",
								},
							],
							{ headers: { etag: "status-101" } },
						);
			return Response.json([{ id: 7, created_at: "2030-01-01T00:00:00Z" }]);
		};
		await bootstrapDeployments(db, "9", "2", "token", fetcher);
		const result = await bootstrapDeployments(db, "9", "2", "token", fetcher);
		expect(result).toMatchObject({
			kind: "changed",
			body: [
				{
					id: "7",
					state: "success",
					status_id: "101",
					status_created_at: "2030-01-02T00:00:00Z",
				},
			],
		});
	}));

test("complete bootstrap re-correlates deployments from retained merge evidence", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [],
			openSpecs: [],
			deployments: [],
			recentMergedPullRequests: [
				{
					number: 7,
					title: "Repair the Defiant",
					url: "https://github.com/ds9/ops/pull/7",
					head_sha: "a".repeat(40),
					merge_sha: "b".repeat(40),
					merged_at: new Date().toISOString(),
				},
			],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.includes("/pulls?"))
					return Response.json([
						{
							number: 8,
							title: "Open a replimat",
							html_url: "https://github.com/ds9/ops/pull/8",
							head: { sha: "a".repeat(40) },
							user: { login: "sisko" },
							state: "open",
						},
					]);
				if (value.includes("/deployments?"))
					return Response.json([
						{ id: 1, sha: "b".repeat(40) },
						{ id: 2, sha: "a".repeat(40) },
					]);
				if (value.includes("/1/statuses") || value.includes("/2/statuses"))
					return Response.json([]);
				return Response.json([]);
			},
			"app-jwt",
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.deployments[0],
		).toMatchObject({
			pull_request_number: 7,
			pull_request_title: "Repair the Defiant",
		});
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.deployments[1],
		).toMatchObject({
			pull_request_number: 8,
			pull_request_title: "Open a replimat",
		});
	}));

test("complete bootstrap preserves webhook fields and clears OpenSpecs without current tasks", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push(
			{
				repositoryId: "2",
				full_name: "ds9/ops",
				pullRequests: [
					{
						number: 1,
						author_login: "sisko",
						state: "open",
						review_state: "approved",
						checks_state: "success",
						workflow_state: "success",
						mergeable: "clean",
						bot_review_state: "complete",
					},
					{ number: 99, author_login: "sisko", state: "open" },
				],
				openSpecs: [{ change_name: "defiant", completed: 1, total: 2 }],
				deployments: [],
			},
			{
				repositoryId: "stale",
				full_name: "ds9/stale",
				pullRequests: [],
				openSpecs: [],
				deployments: [],
			},
		);
		await db.users.replaceOne({ _id: "u" }, user!);
		await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) =>
				String(url).includes("/app/installations/")
					? Response.json({ account: { login: "cubanx" } })
					: String(url).includes("installation/repositories")
						? Response.json({ repositories: [{ id: 2, full_name: "ds9/ops" }] })
						: String(url).includes("/pulls?")
							? Response.json([
									{
										number: 1,
										title: "Defiant",
										user: { login: "sisko" },
										state: "open",
									},
								])
							: Response.json([]),
			"app-jwt",
		);
		const repositories =
				(await db.users.findOne({ _id: "u" }))?.installations[0]
					?.repositories ?? [],
			repo = repositories[0];
		expect(repositories).toHaveLength(1);
		expect(repo?.pullRequests).toHaveLength(1);
		expect(repo?.pullRequests[0]).toMatchObject({
			title: "Defiant",
			review_state: "approved",
			checks_state: "success",
			workflow_state: "success",
			mergeable: "clean",
			bot_review_state: "complete",
		});
		expect(repo?.openSpecs).toEqual([]);
	}));

test("complete bootstrap refreshes OpenSpecs from current pull request heads", () =>
	withDatabase(async (db) => {
		const invalidSha = "c".repeat(40),
			olderSha = "a".repeat(40),
			newerSha = "b".repeat(40);
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const user = await db.users.findOne({ _id: "u" });
		user?.installations[0]?.repositories.push({
			repositoryId: "2",
			full_name: "ds9/ops",
			pullRequests: [],
			openSpecs: [{ change_name: "stale-change", completed: 0, total: 1 }],
			deployments: [],
		});
		await db.users.replaceOne({ _id: "u" }, user!);
		let hasChange = true,
			listingUnchanged = false;
		const fetcher = async (url: RequestInfo | URL) => {
			const value = String(url);
			if (value.includes("/app/installations/"))
				return Response.json({ account: { login: "cubanx" } });
			if (value.includes("installation/repositories"))
				return Response.json({
					repositories: [{ id: 2, full_name: "ds9/ops" }],
				});
			if (value.includes("/pulls?"))
				return Response.json([
					{
						number: 1,
						title: "Q Who",
						user: { login: "sisko" },
						state: "open",
						updated_at: "not-a-timestamp",
						head: { sha: invalidSha },
					},
					{
						number: 7,
						title: "Wolf 359",
						user: { login: "sisko" },
						state: "open",
						updated_at: "2026-08-20T12:00:00Z",
						head: { sha: olderSha },
					},
					{
						number: 8,
						title: "Best of Both Worlds",
						user: { login: "sisko" },
						state: "open",
						updated_at: "2026-08-21T12:00:00Z",
						head: { sha: newerSha },
						body: "## OpenSpecs\n- capture-wolf-359",
					},
				]);
			if (value.includes("/pulls/8/files"))
				if (listingUnchanged) return new Response(null, { status: 304 });
				else
					return hasChange
						? Response.json(
								[
									{ filename: "openspec/changes/capture-wolf-359/tasks.md" },
									{
										filename:
											"openspec/changes/archive/2026-08-26-capture-wolf-359/tasks.md",
									},
								],
								{
									headers: { etag: "changes-v1" },
								},
							)
						: Response.json([]);
			if (value.includes("/pulls/") && value.includes("/files"))
				return Response.json([]);
			return Response.json([]);
		};
		const fetchTasks = async (input: { path: string; sha: string }) => {
			expect(input).toMatchObject({
				path: "openspec/changes/capture-wolf-359/tasks.md",
			});
			return input.sha === newerSha
				? "- [x] Hold the line"
				: "- [ ] Resistance is futile";
		};
		await bootstrapInstallation(
			db,
			"9",
			"token",
			fetcher,
			"app-jwt",
			fetchTasks,
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.openSpecs,
		).toMatchObject([
			{
				change_name: "capture-wolf-359",
				completed: 1,
				total: 1,
				source_commit: newerSha,
			},
		]);
		const dashboard = await dashboardForUser(db, "u");
		expect(dashboard.pullRequests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					number: 8,
					open_spec: expect.objectContaining({ source_commit: newerSha }),
				}),
				expect.objectContaining({ number: 1, open_spec: null }),
				expect.objectContaining({ number: 7, open_spec: null }),
			]),
		);
		listingUnchanged = true;
		expect(
			await bootstrapInstallation(
				db,
				"9",
				"token",
				fetcher,
				"app-jwt",
				fetchTasks,
			),
		).toMatchObject({ kind: "changed" });
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.openSpecs,
		).toMatchObject([
			{ change_name: "capture-wolf-359", completed: 1, total: 1 },
		]);
		listingUnchanged = false;
		hasChange = false;
		await bootstrapInstallation(
			db,
			"9",
			"token",
			fetcher,
			"app-jwt",
			fetchTasks,
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]
				?.openSpecs,
		).toMatchObject([{ change_name: "capture-wolf-359" }]);
	}));

test("bootstrap resolves a declared OpenSpec from one changed archive path only after active 404", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const sha = "a".repeat(40);
		const reads: string[] = [];
		let archivePaths = [
			"openspec/changes/archive/2026-08-26-standardize-sortable-headers/tasks.md",
		];
		const fetcher = async (url: RequestInfo | URL) => {
			const value = String(url);
			if (value.includes("/app/installations/"))
				return Response.json({ account: { login: "cubanx" } });
			if (value.includes("installation/repositories"))
				return Response.json({
					repositories: [{ id: 2, full_name: "ds9/ops" }],
				});
			if (value.includes("/pulls?"))
				return Response.json([
					{
						number: 7,
						title: "Archive",
						user: { login: "sisko" },
						state: "open",
						head: { sha },
						body: "## OpenSpecs\n- standardize-sortable-headers",
					},
				]);
			if (value.includes("/pulls/7/files"))
				return Response.json([
					...archivePaths.map((filename) => ({ filename })),
					{
						filename:
							"openspec/changes/archive/2026-08-25-standardize-sortable-headers/tasks.md",
						status: "removed",
					},
				]);
			if (value.includes("/deployments")) return Response.json([]);
			return Response.json([]);
		};
		const result = await bootstrapInstallation(
			db,
			"9",
			"token",
			fetcher,
			"app-jwt",
			async ({ path }) => {
				reads.push(path);
				return path.includes("archive/") ? "- [x] Archive me" : null;
			},
		);
		expect(result.kind).toBe("changed");
		expect(reads).toEqual([
			"openspec/changes/standardize-sortable-headers/tasks.md",
			"openspec/changes/archive/2026-08-26-standardize-sortable-headers/tasks.md",
		]);
		expect(
			(await dashboardForUser(db, "u")).pullRequests[0]?.open_spec,
		).toMatchObject({
			change_name: "standardize-sortable-headers",
			source_commit: sha,
		});
		for (const paths of [
			[],
			[
				"openspec/changes/archive/2026-08-25-standardize-sortable-headers/tasks.md",
				"openspec/changes/archive/2026-08-26-standardize-sortable-headers/tasks.md",
			],
		]) {
			archivePaths = paths;
			expect(
				await bootstrapInstallation(
					db,
					"9",
					"token",
					fetcher,
					"app-jwt",
					async () => null,
				),
			).toMatchObject({
				kind: "error",
				message: "GitHub OpenSpec artifact fetch failed",
			});
		}
	}));

test("bootstrap keeps OpenSpec task failures generic while reporting safe diagnostics", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const reports: unknown[] = [];
		const result = await bootstrapInstallation(
			db,
			"9",
			"token",
			async (url) => {
				const value = String(url);
				if (value.includes("/app/installations/"))
					return Response.json({ account: { login: "cubanx" } });
				if (value.includes("installation/repositories"))
					return Response.json({
						repositories: [{ id: 2, full_name: "ds9/ops" }],
					});
				if (value.includes("/pulls?"))
					return Response.json([
						{
							number: 7,
							title: "In the Pale Moonlight",
							user: { login: "sisko" },
							state: "open",
							head: { sha: "a".repeat(40) },
							body: "## OpenSpecs\n- hold-the-line",
						},
					]);
				if (value.includes("/deployments")) return Response.json([]);
				if (value.includes("/pulls/7/files"))
					return Response.json([
						{ filename: "openspec/changes/hold-the-line/tasks.md" },
						{
							filename:
								"openspec/changes/archive/2026-08-26-hold-the-line/tasks.md",
						},
					]);
				return Response.json(
					{
						message: "Resource not accessible by integration",
						documentation_url: "https://docs.github.com/rest",
						errors: [
							{
								resource: "Repository",
								field: "contents",
								code: "forbidden",
								value: "must-not-log",
							},
						],
						secret: "must-not-log",
					},
					{ status: 403 },
				);
			},
			"app-jwt",
			undefined,
			(report) => {
				reports.push(report);
			},
		);
		expect(result).toMatchObject({
			kind: "error",
			message: "GitHub OpenSpec artifact fetch failed",
		});
		expect(reports).toEqual([
			{
				operation: "bootstrap OpenSpec task fetch",
				status: 403,
				target:
					"https://api.github.com/repositories/2/contents/openspec/changes/hold-the-line/tasks.md?ref=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				diagnostic: {
					message: "Resource not accessible by integration",
					documentationUrl: "https://docs.github.com/rest",
					errors: [
						{ resource: "Repository", field: "contents", code: "forbidden" },
					],
				},
			},
		]);
	}));

test("installation reconciliation obtains tokens and bootstraps serially in stable order", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "10", "cubanx");
		await bindInstallation(db, "u", "9", "cubanx");
		const tokens: string[] = [],
			appJwts: string[] = [];
		let activeInstallationId = "";
		const results = await reconcileInstallations(
			db,
			async (installationId) => {
				tokens.push(installationId);
				appJwts.push(`app-jwt-${installationId}`);
				activeInstallationId = installationId;
				return {
					token: `token-${installationId}`,
					appJwt: `app-jwt-${installationId}`,
				};
			},
			async (url, init) => {
				const authorization = new Headers(init?.headers).get("authorization");
				expect(authorization).toBe(
					String(url).includes("/app/installations/")
						? `Bearer app-jwt-${activeInstallationId}`
						: `Bearer token-${activeInstallationId}`,
				);
				return String(url).includes("/app/installations/")
					? Response.json({ account: { login: "cubanx" } })
					: String(url).includes("installation/repositories")
						? Response.json({ repositories: [] })
						: Response.json([]);
			},
		);
		expect(tokens).toEqual(["10", "9"]);
		expect(appJwts).toEqual(["app-jwt-10", "app-jwt-9"]);
		expect(results.map((result) => result.installationId)).toEqual(["10", "9"]);
		expect(results.every((result) => result.result.kind === "changed")).toBe(
			true,
		);
	}));

test("installation reconciliation marks stale projections and rejects visibly", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const originalError = console.error,
			logs: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		try {
			await expect(
				reconcileInstallations(
					db,
					async () => {
						throw new Error("raw provider diagnostic");
					},
					async () => new Response("down", { status: 500 }),
				),
			).rejects.toThrow("reconciliation failed for installations 9");
		} finally {
			console.error = originalError;
		}
		expect(logs).toContainEqual([
			"installation reconciliation failed",
			"9",
			"reconciliation",
			"Error",
			"reconciliation failed",
		]);
		expect(JSON.stringify(logs)).not.toContain("raw provider diagnostic");
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0],
		).toMatchObject({ lastSyncError: "reconciliation failed" });
		const failedUser = await db.users.findOne({ _id: "u" });
		if (!failedUser) throw new Error("test user missing");
		const failedInstallation = failedUser.installations[0];
		if (!failedInstallation) throw new Error("test installation missing");
		const failedEvidence = failedInstallation.reconciliationEvidence?.at(-1);
		expect(failedEvidence).toMatchObject({
			outcome: "failure",
			operation: "reconciliation",
		});
		expect(JSON.stringify(failedEvidence)).not.toContain(
			"raw provider diagnostic",
		);
		expect((await dashboardForUser(db, "u")).stale).toBe(true);
		await reconcileInstallations(
			db,
			async () => ({ token: "token", appJwt: "app-jwt" }),
			async (url) =>
				String(url).includes("/app/installations/")
					? Response.json({ account: { login: "cubanx" } })
					: String(url).includes("installation/repositories")
						? Response.json({ repositories: [] })
						: Response.json([]),
		);
		expect(
			(await db.users.findOne({ _id: "u" }))?.installations[0]?.lastSyncError,
		).toBeUndefined();
		const successfulUser = await db.users.findOne({ _id: "u" });
		if (!successfulUser) throw new Error("test user missing");
		const successfulInstallation = successfulUser.installations[0];
		if (!successfulInstallation) throw new Error("test installation missing");
		const successfulEvidence =
			successfulInstallation.reconciliationEvidence?.at(-1);
		expect(successfulEvidence).toMatchObject({
			outcome: "success",
			operation: "reconciliation",
		});
		expect((await dashboardForUser(db, "u")).stale).toBe(false);
	}));

test("reconciliation evidence retains the newest 20 failures deterministically", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "u", "sisko");
		await bindInstallation(db, "u", "9", "cubanx");
		const originalError = console.error,
			logs: unknown[][] = [];
		console.error = (...args: unknown[]) => {
			logs.push(args);
		};
		try {
			for (let status = 480; status <= 500; status++)
				await expect(
					reconcileInstallations(
						db,
						async () => ({ token: "token", appJwt: "app-jwt" }),
						async () => new Response(`raw diagnostic ${status}`, { status }),
					),
				).rejects.toThrow("reconciliation failed for installations 9");
		} finally {
			console.error = originalError;
		}
		expect(logs).toContainEqual([
			"installation reconciliation failed",
			"9",
			"installation_identity",
			"ReadResult",
			"GitHub request failed (500)",
		]);
		const user = await db.users.findOne({ _id: "u" });
		if (!user) throw new Error("test user missing");
		const installation = user.installations[0];
		if (!installation) throw new Error("test installation missing");
		const evidence = installation.reconciliationEvidence;
		expect(evidence).toHaveLength(20);
		expect(evidence?.map((record) => record.status)).toEqual(
			Array.from({ length: 20 }, (_, index) => index + 481),
		);
		expect(JSON.stringify(evidence)).not.toContain("raw diagnostic");
	}));
