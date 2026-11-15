// curly! proxy: address parsing, the Scramjet engine (bare transport) and the
// tab manager behind the Browser page.
import { asset, basePath, goTo, hookFramePanic, settings, site } from "./core.js";


// ===================== addresses =====================


const looksLikeUrl =
	/^(?:(?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:.]+\]|[^\s/?#@]+\.[^\s/?#@.]{2,})(?::\d+)?(?:[/?#]\S*)?)$/iu;

const proxyableSchemes = new Set(["http:", "https:"]);

const isLoopback = hostname => {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host === "::1" || host === "::") return true;
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host);
	const octets = (mapped ? mapped[1] : host).split(".");
	if (octets.length !== 4) return false;
	if (!octets.every(part => /^\d{1,3}$/.test(part) && Number(part) < 256)) return false;
	return Number(octets[0]) === 127 || octets.join(".") === "0.0.0.0";
};

const blockedSchemes = new Set(["javascript:", "data:", "vbscript:", "file:", "blob:", "filesystem:"]);

export const resolveInput = (input, searchTemplate) => {
	const text = String(input ?? "").trim();
	if (!text) return { url: "", kind: "empty" };
	if (looksLikeUrl.test(text)) {
		try {
			const parsed = new URL(`https://${text}`);
			if (isLoopback(parsed.hostname)) return { url: "", kind: "blocked" };
			if (!parsed.username && !parsed.password) return { url: parsed.href, kind: "url" };
		} catch {}
	}

	if (isLoopback(text.split(/[:/?#]/)[0] ?? "")) {
		return { url: "", kind: "blocked" };
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
		try {
			const parsed = new URL(text);
			if (
				parsed.username ||
				parsed.password ||
				blockedSchemes.has(parsed.protocol) ||
				(proxyableSchemes.has(parsed.protocol) && isLoopback(parsed.hostname))
			) {
				return { url: "", kind: "blocked" };
			}
			return proxyableSchemes.has(parsed.protocol)
				? { url: parsed.href, kind: "url" }
				: { url: parsed.href, kind: "external" };
		} catch {
			return { url: "", kind: "blocked" };
		}
	}
	return {
		url: searchTemplate.replace("%s", encodeURIComponent(text)),
		kind: "search"
	};
};

export const formatForDisplay = url => {
	try {
		const parsed = new URL(url);
		const host = parsed.host.replace(/^www\./, "");
		const rest = parsed.pathname === "/" ? "" : parsed.pathname;
		return host + rest + parsed.search + parsed.hash;
	} catch {
		return url;
	}
};

export const originOf = url => {
	try {
		return new URL(url).origin;
	} catch {
		return "";
	}
};


// ===================== engine =====================


let controller = null;

let ready = null;

// Build-time default (VITE_BARE_URL), else a bare server on this same site.
export const defaultBareUrl = () => site.bareUrl || asset("bare/");

const runtimeScripts = ["engine/scramjet.js", "engine/controller.api.js", "engine/scramjet-utils.js"].map(asset);

const loadScript = src => {
	return new Promise((resolve, reject) => {
		const el = document.createElement("script");
		el.src = src;
		el.async = false;
		el.onload = () => resolve();
		el.onerror = () => reject(new Error("Failed to load " + src));
		document.head.append(el);
	});
};

const loadRuntimeScripts = async () => {
	await Promise.all(runtimeScripts.map(loadScript));
};

const isDevHost = () => location.hostname === "localhost" || location.hostname === "127.0.0.1";

const registerServiceWorker = async () => {
	if (!("serviceWorker" in navigator)) {
		throw new Error(
			"Service workers are unavailable. The page must be served over https:// " + "or from a localhost secure context."
		);
	}

	if (isDevHost()) {
		for (const existing of await navigator.serviceWorker.getRegistrations()) {
			if (!existing.active?.scriptURL.endsWith("/sw.js")) {
				await existing.unregister();
			}
		}
	}
	const registration = await navigator.serviceWorker.register(asset("sw.js"), {
		scope: basePath,
		updateViaCache: "none"
	});
	void registration.update();
	const ready = await navigator.serviceWorker.ready;
	const worker = ready.active ?? navigator.serviceWorker.controller;
	if (!worker) throw new Error("Service worker registered but never became active");
	return worker;
};

const bareModule = asset("engine/bare.mjs");

let currentTransport = { bare: "" };

let activeEndpoint = "";

const endpointOf = config => config.bare || defaultBareUrl();

const buildTransport = async config => {
	const module = await import(bareModule);
	activeEndpoint = endpointOf(config);
	const transport = new module.default(activeEndpoint);

	// The bare transport sends request bodies as a stream, which Chrome only
	// allows over HTTP/2. Over HTTP/1.1 every POST fails with
	// ERR_ALPN_NEGOTIATION_FAILED (YouTube then says "You're offline"), so read
	// the body into memory first.
	const request = transport.request.bind(transport);
	const endpoint = activeEndpoint;
	transport.request = async (remote, method, body, headers, signal) => {
		if (body instanceof ReadableStream) body = await new Response(body).arrayBuffer();
		try {
			return await request(remote, method, body, headers, signal);
		} catch (error) {
			// When the URL isn't a bare server (e.g. GitHub Pages answering with its
			// HTML 404 page), the transport fails parsing the reply as JSON. Say what
			// is actually wrong instead.
			if (error instanceof SyntaxError || /JSON/i.test(String(error?.message))) {
				throw new Error(`No bare server is answering at ${endpoint}. Set a working one in Settings → Proxy → Bare server.`);
			}
			throw error;
		}
	};

	return transport;
};

const applyTransport = async () => {
	if (endpointOf(currentTransport) === activeEndpoint) return;
	controller.setTransport(await buildTransport(currentTransport));
};

const keepAliveIntervalMs = 15000; // super duper jank hopefully scramjet fixes

const startKeepAlive = () => {
	setInterval(() => {
		navigator.serviceWorker.controller?.postMessage("keepalive");
	}, keepAliveIntervalMs);
};

const boot = async () => {
	const [serviceworker] = await Promise.all([registerServiceWorker(), loadRuntimeScripts()]);
	const api = window.$scramjetController;
	controller = new api.Controller({
		serviceworker,
		transport: await buildTransport(currentTransport),
		config: {
			prefix: basePath + "~/sj/",
			scramjetPath: basePath + "engine/scramjet.js",
			wasmPath: basePath + "engine/scramjet.wasm",
			injectPath: basePath + "engine/controller.inject.js"
		}
	});
	await controller.wait();
	startKeepAlive();
	return controller;
};

const utils = () => {
	return window.$scramjetUtils;
};

let localPlugins = null;

const plugins = () => {
	localPlugins ??= {
		ErrorPage: class ErrorPagePlugin extends utils().ManagedPlugin {
			#onError;
			constructor(onError) {
				super("error-page", []);
				this.#onError = onError;
			}
			install(frame) {
				this.tap(frame.hooks.error.request, (context, props) => {
					const ctx = context;
					const out = props;
					if (ctx.error?.name === "AbortError") return;
					if (!["document", "iframe", "frame"].includes(ctx.rawrequest?.destination ?? "")) return;
					out.suppressError = true;
					out.setResponse = {
						body: errorPage(ctx.error),
						headers: [["content-type", "text/html; charset=utf-8"]],
						status: 502,
						statusText: "Bad Gateway"
					};
					this.#onError?.(ctx.error);
				});
			}
		},
		HistoryUrl: class HistoryUrlPlugin extends utils().ManagedPlugin {
			constructor() {
				super("history-url", []);
			}
			install(frame) {
				this.tap(frame.hooks.init.post, context => {
					if (!context.isTopLevel) return;
					const historyConstructor = context.window.History;
					const history = historyConstructor.prototype;
					for (const method of ["pushState", "replaceState"]) {
						const original = history[method];
						history[method] = function (data, unused, url) {
							return original.call(this, data, unused, url ?? context.client.url.href);
						};
					}
				});
			}
		}
	};
	return localPlugins;
};

class ScramjetSession {
	url = "";
	#frame;
	#handlers;
	#destroyed = false;
	#onLoad;
	constructor(frame, handlers) {
		this.#frame = frame;
		this.#handlers = handlers;
		this.#onLoad = () => {
			if (!this.#destroyed) this.#handlers.ready?.();
		};
		this.#frame.element.addEventListener("load", this.#onLoad);
	}

	get element() {
		return this.#frame.element;
	}

	go(url) {
		if (this.#destroyed) return;
		this.#handlers.loading?.();
		this.#frame.go(url);
	}

	back() {
		if (!this.#destroyed) this.#frame.back();
	}

	forward() {
		if (!this.#destroyed) this.#frame.forward();
	}

	reload() {
		if (!this.#destroyed) this.#frame.reload();
	}

	destroy() {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#frame.element.removeEventListener("load", this.#onLoad);
		const index = controller?.frames.indexOf(this.#frame) ?? -1;
		if (index !== -1) controller.frames.splice(index, 1);
		this.#frame.element.remove();
	}
}

export const engine = {
	id: "scramjet",
	label: "Scramjet",
	async init() {
		ready ??= boot();
		return ready;
	},
	async createSession(element, handlers = {}) {
		await this.init();
		const u = utils();
		const { ErrorPage, HistoryUrl } = plugins();
		const session = new ScramjetSession(
			controller.createFrame(element, {
				plugins: [
					new u.HttpCachePlugin(),
					new HistoryUrl(),
					new u.UrlWatcherPlugin(url => {
						session.url = url;
						handlers.url?.(url);
						handlers.ready?.();
					}),
					new u.CatchEscapedLinksPlugin(url => {
						handlers.escape?.(url.href);
						return new URL(`data:text/html,${encodeURIComponent(errorPage(new Error("Opened in a new tab.")))}`);
					}),
					new ErrorPage(handlers.error)
				]
			}),
			handlers
		);
		return session;
	},
	async setTransport(config) {
		currentTransport = { ...currentTransport, ...config };
		if (ready) {
			await ready;
			await applyTransport();
		}
		return { ...currentTransport };
	},
	getTransport() {
		return { ...currentTransport };
	}
};

const errorPage = error => {
	const message = String(error?.message ?? error ?? "Unknown error").replace(/[<&]/g, c =>
		c === "<" ? "&lt;" : "&amp;"
	);
	return `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page unavailable</title>
<style>
	html { color-scheme: dark; font: 16px/1.5 Poppins, system-ui, sans-serif; background: #0d0b14; color: #ece9f5; }
	body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
	main { width: min(32rem, calc(100% - 3rem)); }
	h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
	p { margin: 0 0 .75rem; color: #a59fba; }
	code { font-size: .875rem; }
</style>
<main>
	<h1>This page could not be loaded</h1>
	<p>The proxy couldn't load this page.</p>
	<p><code>${message}</code></p>
</main>`;
};


// ===================== tabs =====================


let seq = 0;

export class Tab {
	id;
	url;
	title = "New Tab";
	loading = false;
	error = null;
	session = null;
	element;
	history = [];
	historyIndex = -1;

	#manager;
	#sessionPending = null;
	#destroyed = false;

	constructor(manager, options = {}) {
		this.id = `tab-${++seq}`;
		this.url = options.url ?? "";
		this.#manager = manager;

		this.element = document.createElement("iframe");
		this.element.className = "frame";
		this.element.dataset.tabId = this.id;
		this.element.setAttribute(
			"sandbox",
			"allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock"
		);
		this.element.setAttribute("allow", "autoplay; fullscreen; clipboard-read; clipboard-write; gamepad");
		hookFramePanic(this.element);
	}

	async ensureSession() {
		if (this.session) return this.session;
		if (this.#sessionPending) return this.#sessionPending;

		this.#sessionPending = engine.createSession(this.element, {
			url: url => {
				this.record(url);
				this.error = null;
				try {
					this.title = new URL(url).hostname.replace(/^www\./, "");
				} catch {
					this.title = url;
				}
				this.#manager.emit();
			},
			loading: () => {
				this.loading = true;
				this.#manager.emit();
			},
			ready: () => {
				this.loading = false;
				try {
					const title = this.element.contentDocument?.title;
					if (title) this.title = title;
				} catch {}
				this.#manager.emit();
			},
			error: error => {
				this.loading = false;
				this.error = error?.message ?? String(error);
				this.#manager.emit();
			},
			escape: url => {
				this.#manager.open(url);
			}
		});

		const pending = this.#sessionPending;
		try {
			const session = await pending;
			if (this.#destroyed) {
				session.destroy();
				return session;
			}
			this.session = session;
		} finally {
			if (this.#sessionPending === pending) this.#sessionPending = null;
		}

		return this.session;
	}

	async go(url, record = true) {
		if (this.#destroyed) return;
		const session = await this.ensureSession();
		if (this.#destroyed) {
			session.destroy();
			return;
		}
		if (record) this.record(url);
		else this.url = url;
		session.go(url);
		this.#manager.emit();
	}

	record(url) {
		if (this.history[this.historyIndex] === url) {
			this.url = url;
			return;
		}

		const existing = this.history.lastIndexOf(url, this.historyIndex - 1);
		if (existing >= 0) {
			this.historyIndex = existing;
			this.url = url;
			return;
		}

		this.history.splice(this.historyIndex + 1);
		this.history.push(url);
		this.historyIndex = this.history.length - 1;
		this.url = url;
	}

	get canGoBack() {
		return this.historyIndex > 0;
	}

	get canGoForward() {
		return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
	}

	back() {
		if (!this.canGoBack) return;
		this.historyIndex--;
		void this.go(this.history[this.historyIndex], false);
	}

	forward() {
		if (!this.canGoForward) return;
		this.historyIndex++;
		void this.go(this.history[this.historyIndex], false);
	}

	reload() {
		this.session?.reload();
	}

	destroy() {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.session?.destroy();
		this.session = null;
		void this.#sessionPending?.then(
			session => session.destroy(),
			() => {}
		);
		this.element.remove();
	}
}

export class TabManager {
	tabs = [];
	activeId = null;
	// Bumped on every change so React can subscribe with useSyncExternalStore.
	version = 0;

	#container;
	#listeners = new Set();
	#newTabUrl;

	constructor(container, newTabUrl) {
		this.#container = container;
		this.#newTabUrl = newTabUrl;
	}

	subscribe = fn => {
		this.#listeners.add(fn);
		return () => {
			this.#listeners.delete(fn);
		};
	};

	emit() {
		this.version++;
		for (const fn of this.#listeners) fn();
	}

	get active() {
		return this.tabs.find(t => t.id === this.activeId) ?? null;
	}

	// There are no internal pages: a new tab goes straight to the home URL.
	open(url = this.#newTabUrl(), options = {}) {
		const tab = new Tab(this, { url });
		this.tabs.push(tab);
		this.#container.append(tab.element);

		if (!options.background || !this.activeId) this.select(tab.id);
		else this.emit();

		if (url) void tab.go(url);
		return tab;
	}

	select(id) {
		if (!this.tabs.some(t => t.id === id)) return;
		this.activeId = id;

		for (const tab of this.tabs) {
			tab.element.classList.toggle("frame--active", tab.id === id);
		}

		this.emit();
	}

	close(id) {
		const index = this.tabs.findIndex(t => t.id === id);
		if (index === -1) return;

		const [tab] = this.tabs.splice(index, 1);
		tab.destroy();

		if (this.activeId === id) {
			const next = this.tabs[index] ?? this.tabs[index - 1];
			this.activeId = next?.id ?? null;
			if (next) this.select(next.id);
		}

		this.emit();
	}
}


// ===================== browser =====================


export const newTabUrl = () => {
	const home = settings.get("homeUrl");
	if (home) return home;
	try {
		return new URL(settings.get("searchEngine").replace("%s", "")).origin + "/";
	} catch {
		return "https://duckduckgo.com/";
	}
};

// Frames live in one container that the Browser view adopts, so tabs keep
// running while you're on other pages.
export const frameContainer = document.createElement("div");
frameContainer.className = "frames";

export const tabs = new TabManager(frameContainer, newTabUrl);

const syncTransport = () =>
	engine.setTransport({ bare: settings.get("bareUrl") }).catch(error => {
		console.error("Could not switch bare server", error);
	});

let lastBare = settings.get("bareUrl");
settings.onChange(s => {
	if (s.bareUrl === lastBare) return;
	lastBare = s.bareUrl;
	void syncTransport();
});

export const startEngine = async () => {
	await syncTransport();
	return engine.init();
};

// Address bar / search box / app tile entry point.
export const openInBrowser = (input, options = {}) => {
	const { url, kind } = resolveInput(input, settings.get("searchEngine"));
	if (kind === "empty") return "empty";
	if (kind === "blocked") return "blocked";
	if (kind === "external") {
		location.assign(url);
		return "opened";
	}

	if (options.newTab || !tabs.active) tabs.open(url);
	else void tabs.active.go(url);
	goTo("browser");
	return "opened";
};

export const bareEndpoint = () => settings.get("bareUrl") || defaultBareUrl();

// True when the configured bare server answers its meta endpoint with v3.
export const checkBare = async () => {
	try {
		const res = await fetch(bareEndpoint(), { cache: "no-store" });
		const meta = await res.json();
		return Array.isArray(meta?.versions) && meta.versions.includes("v3");
	} catch {
		return false;
	}
};
