import { readFile } from "node:fs/promises";

import { buildBrowserScript } from "../src/web/build";

const encoder = new TextEncoder();
const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
let merged = false;
let refreshed = false;

const repository = {
	account_login: "starfleet",
	repository_id: "defiant",
	installation_id: "ds9",
	full_name: "starfleet/defiant",
};

const blockedPullRequest = () => ({
	...repository,
	installation_pull_requests: "write",
	number: 201,
	title: refreshed
		? "Refresh the Defiant Bajoran relay"
		: "Restore the Bajoran relay",
	url: "/fixture/pr/201",
	state: "open",
	draft: false,
	mergeable: false,
	workflow_state: "success",
	checks_state: "success",
	review_state: "approved",
	head_ref: "ops/stabilize-bajoran-relay",
	head_sha: "2012012012012012012012012012012012012012",
	updated_at: "2026-08-27T12:00:00.000Z",
	open_specs: [
		{
			change_name: "stabilize-bajoran-relay",
			completed: 1,
			total: 3,
			pre_merge_ready: false,
		},
	],
});

const eligiblePullRequest = () => ({
	...repository,
	repository_id: "sensor-array",
	full_name: "starfleet/defiant-sensor-array",
	installation_pull_requests: "write",
	number: 202,
	title: refreshed
		? "Refresh the Defiant sensor array"
		: "Calibrate the Defiant sensor array",
	url: "/fixture/pr/202",
	state: merged ? "merged" : "open",
	draft: false,
	mergeable: true,
	workflow_state: "success",
	checks_state: "success",
	review_state: "approved",
	review_activity: true,
	completed_review_count: 1,
	unresolved_review_threads: 0,
	changes_requested: false,
	repository_policy_loaded: true,
	head_ref: "ops/calibrate-defiant-sensor-array",
	head_sha: "2022022022022022022022022022022022022022",
	required_checks: [
		{ head_sha: "2022022022022022022022022022022022022022", conclusion: "success" },
	],
	labels: ["openspec-not-required"],
	updated_at: refreshed ? "2026-08-27T12:05:00.000Z" : "2026-08-27T12:01:00.000Z",
});

const snapshot = () => ({
	user: { login: "Benjamin Sisko", fixture_avatar: true },
	repositories: [repository, { ...repository, repository_id: "sensor-array", full_name: "starfleet/defiant-sensor-array" }],
	pullRequests: [blockedPullRequest(), eligiblePullRequest()],
	deployments: [
		{
			id: "ds9-production",
			full_name: "starfleet/defiant",
			environment: "Deep Space Nine",
			ref: "main",
			sha: "2022022022022022022022022022022022022022",
			state: "success",
			updated_at: "2026-08-27T12:02:00.000Z",
			pull_request_number: 202,
			pull_request_title: "Calibrate the Defiant sensor array",
			pull_request_url: "https://github.com/starfleet/defiant/pull/202",
		},
	],
	notifications: [],
});

const refresh = () => {
	for (const stream of streams) stream.enqueue(encoder.encode("event: refresh\ndata: fixture\n\n"));
};

const expectedMergeForm = {
	installationId: "ds9",
	repositoryId: "sensor-array",
	number: "202",
	headSha: "2022022022022022022022022022022022022022",
};

const validMergeForm = (form: FormData) =>
	Object.entries(expectedMergeForm).every(([key, value]) => form.get(key) === value);

const page = (body: string) =>
	new Response(`<!doctype html><title>Fixture merge</title><main>${body}</main>`, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});

const asset = (name: string) =>
	readFile(new URL(`../assets/${name}`, import.meta.url));

const browserScript = buildBrowserScript();

const staticResponse = async (path: string) => {
	if (path === "/")
		return new Response(await readFile(new URL("../src/web/index.html", import.meta.url)), {
			headers: { "content-type": "text/html; charset=utf-8" },
		});
	if (path === "/app.css")
		return new Response(await readFile(new URL("../src/web/app.css", import.meta.url)), {
			headers: { "content-type": "text/css; charset=utf-8" },
		});
	if (path === "/app.js")
		return new Response(await browserScript, {
			headers: { "content-type": "text/javascript; charset=utf-8" },
		});
	const file = path.slice(1);
	if (["avatar-fixture.svg", "icon-adaptive.svg"].includes(file))
		return new Response(await asset(file), {
			headers: { "content-type": "image/svg+xml" },
		});
	if (["apple-touch-icon.png", "favicon-32.png"].includes(file))
		return new Response(await asset(file), {
			headers: { "content-type": "image/png" },
		});
	return new Response("Not found", { status: 404 });
};

const server = Bun.serve({
	port: 4174,
	fetch: async (request) => {
		const url = new URL(request.url);
		if (url.pathname === "/api/snapshot") return Response.json(snapshot());
		if (url.pathname === "/events") {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					streams.add(controller);
					controller.enqueue(encoder.encode("event: refresh\ndata: fixture\n\n"));
				},
				cancel() {
					streams.clear();
				},
			});
			return new Response(body, {
				headers: {
					"cache-control": "no-cache",
					"content-type": "text/event-stream",
				},
			});
		}
		if (request.method === "POST" && url.pathname === "/api/merge/start") {
			if (!validMergeForm(await request.formData()))
				return Response.json({ error: "Invalid fixture merge request" }, { status: 400 });
			return page(
				'<h1>Confirm fixture merge</h1><form method="post" action="/api/merge/confirm"><button type="submit">Confirm merge</button></form>',
			);
		}
		if (request.method === "POST" && url.pathname === "/api/merge/confirm") {
			merged = true;
			refresh();
			return page(
				'<p>Fixture merge completed</p><a href="/">Return to dashboard</a>',
			);
		}
		if (request.method === "POST" && url.pathname === "/__e2e__/refresh") {
			refreshed = true;
			refresh();
			return Response.json({ status: "success" });
		}
		return staticResponse(url.pathname);
	},
});

const stop = () => server.stop(true);
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
