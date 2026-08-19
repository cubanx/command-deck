self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
	event.waitUntil(
		self.clients
			.matchAll({ type: "window" })
			.then((clients) =>
				Promise.all([
					caches
						.keys()
						.then((keys) =>
							Promise.all(keys.map((cache) => caches.delete(cache))),
						),
					self.registration.unregister(),
				]).then(() =>
					Promise.all(clients.map((client) => client.navigate(client.url))),
				),
			),
	),
);
