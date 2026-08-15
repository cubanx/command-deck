const CACHE = "dcc-shell-v10";
const ASSETS = [
	"/",
	"/app.css?v=7",
	"/app.js?v=7",
	"/manifest.webmanifest",
	"/icon.svg",
	"/icon-adaptive.svg",
	"/avatar-fixture.svg",
	"/favicon-32.png",
	"/apple-touch-icon.png",
	"/icon-192.png",
	"/icon-512.png",
	"/icon-maskable-512.png",
];
const PATHS = new Set(
	ASSETS.map((value) => new URL(value, self.location).pathname),
);
self.addEventListener("install", (e) => {
	self.skipWaiting();
	e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener("activate", (e) =>
	e.waitUntil(
		Promise.all([
			caches
				.keys()
				.then((keys) =>
					Promise.all(
						keys
							.filter((key) => key !== CACHE)
							.map((key) => caches.delete(key)),
					),
				),
			self.clients.claim(),
		]),
	),
);
self.addEventListener("fetch", (e) => {
	const u = new URL(e.request.url);
	if (e.request.method === "GET" && PATHS.has(u.pathname))
		e.respondWith(caches.match(e.request).then((x) => x || fetch(e.request)));
});
