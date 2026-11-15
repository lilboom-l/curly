// Relative to this file, so the site works from a subfolder (GitHub Pages).
importScripts("engine/controller.sw.js");

const scope = new URL(self.registration.scope).pathname;
const shellCachePrefix = "curly-shell-";
const shellCache = shellCachePrefix + "v1";
const runtimeRoots = ["engine/", "bare/", "~/"].map(
	root => scope + root
);

const isUnderRoot = (pathname, root) =>
	pathname === root.slice(0, -1) || pathname.startsWith(root);

const isShellRequest = request => {
	if (request.method !== "GET") return false;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return false;
	if (url.search) return false;
	if (location.hostname === "localhost" || location.hostname === "127.0.0.1")
		return false;
	if (url.pathname === scope + "sw.js") return false;
	if (runtimeRoots.some(root => isUnderRoot(url.pathname, root)))
		return false;

	return true;
};

const shellResponse = async request => {
	const cache = await caches.open(shellCache);
	const cached = await cache.match(request);

	const network = fetch(request)
		.then(response => {
			if (response.ok) cache.put(request, response.clone());
			return response;
		})
		.catch(() => cached ?? Response.error());

	return cached ?? network;
};

self.addEventListener("fetch", event => {
	if ($scramjetController.shouldRoute(event)) {
		// A rejected route becomes a hard network error in the page, which
		// players report as "can't play this video". Answer with a readable 502
		// instead so the page can retry or show something sensible.
		event.respondWith(
			$scramjetController.route(event).catch(error => {
				const message = String(error?.message ?? error);
				console.warn("[curly!] proxy request failed:", event.request.url, message);
				return new Response(message, {
					status: 502,
					statusText: "Bad Gateway",
					headers: { "Content-Type": "text/plain", "X-Curly-Error": message.slice(0, 200).replace(/[^\x20-\x7e]/g, "?") }
				});
			})
		);
		return;
	}

	if (isShellRequest(event.request)) {
		event.respondWith(shellResponse(event.request));
	}
});

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event =>
	event.waitUntil(
		caches
			.keys()
			.then(keys =>
				Promise.all(
					keys
						.filter(
							key =>
								key.startsWith(shellCachePrefix) &&
								key !== shellCache
						)
						.map(key => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	)
);
