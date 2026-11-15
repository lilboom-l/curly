// curly! core: config, storage, settings, panic key, tab cloak, routing,
// DOM helpers, icons and the game list. Plain ES module, no build step.


// ===================== config =====================


export const site = {
	name: "curly!",
	tagline: "Games and the open web. No limits.",
	repo: "https://github.com/lilboom-l/curly",
	discord: "https://discord.gg/Un24M9gnpN",
	author: "idevs",
	authorUrl: "https://github.com/lilboom-l",
	// Bare server for the proxy. GitHub Pages can't run one, so put the URL of
	// one you host (ending in /bare/ or similar) here, or set it in Settings.
	bareUrl: ""
};

// Games are hosted by truffled.lol; the list lives in json/games.json.
export const credit = { name: "truffled.lol", url: "https://truffled.lol" };


// ===================== paths =====================


// The folder the site is served from: "/" normally, "/<repo>/" on GitHub Pages.
// Everything the proxy loads is resolved against this so the site works under
// any path.
export const baseUrl = new URL(".", location.href);

export const basePath = baseUrl.pathname;

export const asset = path => new URL(path, baseUrl).href;


// ===================== storage =====================


export const storage = (() => {
	const namespace = "curly";
	const version = 1;

	const key = name => `${namespace}:${name}`;

	const read = (name, fallback) => {
		try {
			const raw = localStorage.getItem(key(name));
			if (raw === null) return fallback;

			const parsed = JSON.parse(raw);
			if (parsed?.__v !== version) {
				return migrate(name, parsed, fallback);
			}
			return parsed.value;
		} catch {
			return fallback;
		}
	};

	const write = (name, value) => {
		try {
			const envelope = { __v: version, value };
			localStorage.setItem(key(name), JSON.stringify(envelope));
			return true;
		} catch {
			return false;
		}
	};

	const remove = name => {
		try {
			localStorage.removeItem(key(name));
		} catch {}
	};

	const clearAll = () => {
		try {
			const prefix = `${namespace}:`;
			const names = [];
			for (let i = 0; i < localStorage.length; i++) {
				const name = localStorage.key(i);
				if (name?.startsWith(prefix)) names.push(name);
			}
			for (const name of names) localStorage.removeItem(name);
		} catch {}
	};

	const migrate = (name, parsed, fallback) => {
		if (parsed && typeof parsed === "object" && !("__v" in parsed)) {
			write(name, parsed);
			return parsed;
		}
		return fallback;
	};

	return { read, write, remove, clearAll };
})();


// ===================== settings =====================


export const settings = (() => {
	const text =
		(max = 200) =>
		(value, fallback) => {
			const s = typeof value === "string" ? value.trim() : "";
			return s.length <= max ? s : fallback;
		};

	const bool = (value, fallback) => (typeof value === "boolean" ? value : fallback);

	const number = (min, max) => (value, fallback) =>
		typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

	const oneOf = allowed => (value, fallback) => (allowed.includes(value) ? value : fallback);

	const httpUrl = (value, fallback) => {
		const s = typeof value === "string" ? value.trim() : "";
		if (!s) return "";
		try {
			const url = new URL(s);
			return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
		} catch {
			return fallback;
		}
	};

	const bareUrl = (value, fallback) => {
		const s = httpUrl(value, fallback);
		if (!s || s === fallback) return s;
		return s.endsWith("/") ? s : s + "/";
	};

	const searchTemplate = (value, fallback) => {
		const s = typeof value === "string" ? value.trim() : "";
		if (!s.includes("%s")) return fallback;
		try {
			const probe = new URL(s.replaceAll("%s", "test"));
			return ["http:", "https:"].includes(probe.protocol) ? s : fallback;
		} catch {
			return fallback;
		}
	};

	const searchEngines = [
		{ id: "duckduckgo", label: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s" },
		{ id: "google", label: "Google", template: "https://www.google.com/search?q=%s" },
		{ id: "bing", label: "Bing", template: "https://www.bing.com/search?q=%s" },
		{ id: "brave", label: "Brave", template: "https://search.brave.com/search?q=%s" },
		{ id: "startpage", label: "Startpage", template: "https://www.startpage.com/sp/search?query=%s" }
	];

	const cloakIcon = (background, text) =>
		`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="${background}"/><text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" fill="white">${text}</text></svg>`)}`;

	const cloakPresets = [
		{ id: "none", label: "None", title: "", favicon: "" },
		{ id: "custom", label: "Custom", title: "", favicon: "" },
		{ id: "classroom", label: "Google Classroom", title: "Home", favicon: cloakIcon("#1e8e3e", "C") },
		{ id: "drive", label: "Google Drive", title: "My Drive - Google Drive", favicon: cloakIcon("#f9ab00", "D") },
		{ id: "docs", label: "Google Docs", title: "Google Docs", favicon: cloakIcon("#4285f4", "G") },
		{ id: "desmos", label: "Desmos", title: "Desmos | Graphing Calculator", favicon: cloakIcon("#2d70b3", "D") },
		{ id: "canvas", label: "Canvas", title: "Dashboard", favicon: cloakIcon("#e13f2b", "C") },
		{ id: "clever", label: "Clever", title: "Clever | Portal", favicon: cloakIcon("#436cf2", "C") }
	];

	const effects = [
		{ id: "snow", label: "Snow" },
		{ id: "stars", label: "Stars" },
		{ id: "rain", label: "Rain" },
		{ id: "binary", label: "Binary rain" },
		{ id: "fireflies", label: "Fireflies" },
		{ id: "warp", label: "Warp speed" },
		{ id: "none", label: "None" }
	];

	const schema = {
		searchEngine: { default: "https://duckduckgo.com/?q=%s", validate: searchTemplate },
		homeUrl: { default: "", validate: httpUrl },
		bareUrl: { default: "", validate: bareUrl },
		gameMode: { default: "direct", validate: oneOf(["direct", "proxy"]) },
		cloakPreset: { default: "none", validate: oneOf(cloakPresets.map(p => p.id)) },
		cloakTitle: { default: "", validate: text(120) },
		cloakFavicon: { default: "", validate: httpUrl },
		autoBlank: { default: false, validate: bool },
		panicKey: { default: "`", validate: text(40) },
		panicUrl: { default: "https://classroom.google.com/", validate: httpUrl },
		effect: { default: "snow", validate: oneOf(effects.map(e => e.id)) },
		effectDensity: { default: 1, validate: number(0.25, 2) },
		effectSpeed: { default: 1, validate: number(0.25, 2.5) }
	};

	const defaults = Object.fromEntries(Object.entries(schema).map(([key, def]) => [key, def.default]));

	const storeKey = "settings";

	let current = null;
	const listeners = new Set();

	const validate = raw => {
		const out = {};
		const rejected = [];

		for (const [name, def] of Object.entries(schema)) {
			const incoming = raw?.[name];
			if (incoming === undefined) {
				out[name] = def.default;
				continue;
			}

			const invalid = Symbol(name);
			const value = def.validate(incoming, invalid);
			if (value === invalid) {
				rejected.push(name);
				out[name] = def.default;
			} else {
				out[name] = value;
			}
		}

		return { settings: out, rejected };
	};

	const load = () => {
		if (current) return current;
		current = validate(storage.read(storeKey, {})).settings;
		return current;
	};

	const get = name => load()[name];

	const set = patch => {
		const { settings, rejected } = validate({ ...load(), ...patch });
		current = settings;
		const persisted = storage.write(storeKey, settings);
		for (const fn of listeners) fn(settings);
		return { settings, rejected, persisted };
	};

	const reset = () => {
		current = { ...defaults };
		const persisted = storage.write(storeKey, current);
		for (const fn of listeners) fn(current);
		return { settings: current, persisted };
	};

	const onChange = fn => {
		listeners.add(fn);
		return () => {
			listeners.delete(fn);
		};
	};

	return { searchEngines, cloakPresets, effects, schema, defaults, load, get, set, reset, onChange };
})();


// ===================== panic key =====================


const modifierKeys = new Set(["Control", "Shift", "Alt", "Meta"]);

// "Ctrl+Shift+Q", "`", "F9" ...
export const comboFromEvent = event => {
	if (modifierKeys.has(event.key)) return null;
	const parts = [];
	if (event.ctrlKey) parts.push("Ctrl");
	if (event.altKey) parts.push("Alt");
	if (event.shiftKey && event.key.length > 1) parts.push("Shift");
	if (event.metaKey) parts.push("Meta");
	parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
	return parts.join("+");
};

const matches = (event, combo) => {
	if (!combo) return false;
	return comboFromEvent(event)?.toUpperCase() === combo.toUpperCase();
};

const isTyping = event => {
	const el = event.target;
	if (!el?.tagName) return false;
	return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
};

let paused = false;

// The settings page pauses the panic key while recording a new one.
export const pausePanic = value => {
	paused = value;
};

export const panic = () => {
	const url = settings.get("panicUrl") || "https://classroom.google.com/";
	try {
		// Inside an about:blank cloak, move the outer tab instead.
		if (window.top && window.top !== window) {
			window.top.location.replace(url);
			return;
		}
	} catch {}
	location.replace(url);
};

const onKey = event => {
	if (paused) return;
	const combo = settings.get("panicKey");
	// A bare single character should not fire while someone is typing.
	if (combo.length === 1 && isTyping(event)) return;
	if (matches(event, combo)) {
		event.preventDefault();
		panic();
	}
};

// Keyed by document: a frame's contentWindow keeps its identity across
// navigations, but each new page needs its own listener.
const hooked = new WeakSet();

// Same-origin frames (proxied tabs) swallow key events, so listen inside them too.
export const hookPanic = target => {
	if (!target) return;
	try {
		const doc = target.document;
		if (hooked.has(doc)) return;
		target.addEventListener("keydown", onKey, true);
		hooked.add(doc);
	} catch {}
};

export const hookFramePanic = frame => {
	frame.addEventListener("load", () => hookPanic(frame.contentWindow));
};


// ===================== tab cloak =====================


const originalTitle = document.title;
const originalIcon = document.querySelector("link[rel~='icon']")?.href ?? "";

const resolve = () => {
	const id = settings.get("cloakPreset");
	if (id === "custom") return { title: settings.get("cloakTitle"), favicon: settings.get("cloakFavicon") };
	const preset = settings.cloakPresets.find(p => p.id === id);
	return { title: preset?.title ?? "", favicon: preset?.favicon ?? "" };
};

const applyTo = (target, title, favicon) => {
	target.title = title || originalTitle;
	const existing = target.querySelector("link[rel~='icon']");
	const link = existing ?? target.createElement("link");
	link.rel = "icon";
	link.href = favicon || originalIcon;
	if (!existing) target.head.append(link);
};

export const applyCloak = () => {
	const { title, favicon } = resolve();
	applyTo(document, title, favicon);

	try {
		if (parent !== window) applyTo(parent.document, title, favicon);
	} catch {}
};

export const inBlank = () => {
	try {
		return window.top !== window && window.top?.location.href === "about:blank";
	} catch {
		return false;
	}
};

// Reopens the site inside an about:blank tab so it stays out of history, then
// sends this tab to the panic URL. Returns false when the popup is blocked.
export const openInBlank = () => {
	const win = window.open("about:blank", "_blank");
	if (!win) return false;

	const { title, favicon } = resolve();
	const doc = win.document;
	doc.title = title || originalTitle;
	const icon = doc.createElement("link");
	icon.rel = "icon";
	icon.href = favicon || originalIcon;
	doc.head.append(icon);

	const style = doc.createElement("style");
	style.textContent =
		"html,body{margin:0;height:100%;overflow:hidden;background:#000}iframe{border:0;width:100%;height:100%}";
	doc.head.append(style);

	const frame = doc.createElement("iframe");
	frame.src = location.href;
	frame.allow = "autoplay; fullscreen; clipboard-read; clipboard-write";
	doc.body.append(frame);

	location.replace(settings.get("panicUrl") || "https://classroom.google.com/");
	return true;
};


// ===================== routing =====================


// Hash routes: #/<view>?<query>, e.g. #/games?play=<id>.
const views = ["home", "games", "browser", "settings", "privacy", "dmca"];

export const route = () => {
	const [path, search = ""] = location.hash.replace(/^#\/?/, "").split("?");
	const name = path.split("/")[0];
	return { view: views.includes(name) ? name : "home", query: new URLSearchParams(search) };
};

export const onRoute = fn => addEventListener("hashchange", () => fn(route()));

export const goTo = view => {
	if (route().view !== view) location.hash = "/" + view;
};


// ===================== DOM =====================


// Tiny element builder: h("button", { class: "btn", onClick }, "Go").
// Children can be nodes, strings, numbers, arrays, or null/false (skipped).
export const h = (tag, props, ...children) => {
	const el = document.createElement(tag);
	for (const [key, value] of Object.entries(props ?? {})) {
		if (value === null || value === undefined || value === false) continue;
		if (key === "class") el.className = value;
		else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2).toLowerCase(), value);
		else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
		else if (key === "dataset") Object.assign(el.dataset, value);
		else if (key === "value" || key === "checked") el[key] = value;
		else if (value === true) el.setAttribute(key, "");
		else el.setAttribute(key, value);
	}
	append(el, children);
	return el;
};

const append = (el, children) => {
	for (const child of children) {
		if (child === null || child === undefined || child === false) continue;
		if (Array.isArray(child)) append(el, child);
		else el.append(child instanceof Node ? child : String(child));
	}
};


// ===================== icons =====================


// Custom two-tone icon set. Each icon is a list of layers on a 24x24 grid:
//   f  filled shape at full strength
//   b  filled shape at reduced strength (the "back" tone)
//   s  stroked line
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;

export const icons = {
	// A curly brace with a dot: "{!"
	logo: [{ s: "M10 3.5c-2.4 0-3.3 1.1-3.3 3.3v2.1c0 1.6-.8 2.6-2.4 3.1 1.6.5 2.4 1.5 2.4 3.1v2.1c0 2.2.9 3.3 3.3 3.3" }, { s: "M15.5 5v9" }, { f: circle(15.5, 18.6, 1.5) }],
	discord: [
		{ b: "M4.5 4h15A2.5 2.5 0 0 1 22 6.5v9a2.5 2.5 0 0 1-2.5 2.5H12l-5 4v-4H4.5A2.5 2.5 0 0 1 2 15.5v-9A2.5 2.5 0 0 1 4.5 4z" },
		{ f: circle(8.5, 11, 1.6) },
		{ f: circle(15.5, 11, 1.6) }
	],
	github: [{ s: "M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" }],
	home: [
		{ b: "M5 10.6 12 5l7 5.6V19a2 2 0 0 1-2 2h-3.2v-4.6a1.8 1.8 0 0 0-3.6 0V21H7a2 2 0 0 1-2-2z" },
		{ f: "M11.1 2.6a1.5 1.5 0 0 1 1.8 0l8.6 6.7a1 1 0 1 1-1.2 1.6L12 4.6l-8.3 6.3a1 1 0 1 1-1.2-1.6z" }
	],
	games: [
		{
			b: "M7.2 5.5h9.6a5 5 0 0 1 4.9 4.1l1 5.6a3.4 3.4 0 0 1-6 2.7L15.4 16H8.6l-1.3 1.9a3.4 3.4 0 0 1-6-2.7l1-5.6a5 5 0 0 1 4.9-4.1z"
		},
		{ f: "M7 8.6h1.6v1.9h1.9v1.6H8.6V14H7v-1.9H5.1v-1.6H7z" },
		{ f: circle(16.4, 9.6, 1.25) },
		{ f: circle(18.4, 12.6, 1.25) }
	],
	browser: [
		{ b: "M2.5 6.5a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" },
		{ f: "M2.5 6.5a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3V8h-19z" },
		{ f: "M6 11.5h8v1.8H6zM6 15.2h5v1.8H6z" }
	],
	globe: [
		{ b: circle(12, 12, 9) },
		{ s: "M3.5 12h17M12 3c2.4 2.6 3.4 5.6 3.4 9s-1 6.4-3.4 9c-2.4-2.6-3.4-5.6-3.4-9s1-6.4 3.4-9z" }
	],
	settings: [
		{ b: "M3 6.2h18v1.6H3zM3 11.2h18v1.6H3zM3 16.2h18v1.6H3z" },
		{ f: circle(8, 7, 2.6) },
		{ f: circle(15.5, 12, 2.6) },
		{ f: circle(10, 17, 2.6) }
	],
	search: [{ b: circle(10.5, 10.5, 7) }, { f: "M15.3 16.7l1.4-1.4 4.6 4.6a1 1 0 0 1-1.4 1.4z" }],
	shield: [
		{ b: "M12 2.5 20 5.6v5.9c0 4.7-3.4 8.8-8 10-4.6-1.2-8-5.3-8-10V5.6z" },
		{ f: "M10.8 15.4 7.5 12.1l1.4-1.4 1.9 1.9 4.4-4.4 1.4 1.4z" }
	],
	star: [{ f: "M12 2.8l2.8 5.6 6.2.9-4.5 4.4 1.1 6.2L12 17l-5.6 2.9 1.1-6.2L3 9.3l6.2-.9z" }],
	shuffle: [
		{
			s: "M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c1.6 0 2.8-1.3 3.8-3M14 10c1-1.7 2.1-3 3.5-3H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"
		}
	],
	plus: [{ s: "M12 5v14M5 12h14" }],
	x: [{ s: "M6.5 6.5l11 11M17.5 6.5l-11 11" }],
	left: [{ s: "M14.5 6 8.5 12l6 6" }],
	right: [{ s: "M9.5 6l6 6-6 6" }],
	reload: [{ s: "M19.5 12a7.5 7.5 0 1 1-2.2-5.3" }, { f: "M20.5 3.5v6h-6z" }],
	expand: [{ s: "M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" }]
};

const SVG = "http://www.w3.org/2000/svg";

export const icon = (name, size = 20) => {
	const svg = document.createElementNS(SVG, "svg");
	svg.setAttribute("class", "icon");
	svg.setAttribute("width", size);
	svg.setAttribute("height", size);
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("aria-hidden", "true");
	for (const layer of icons[name]) {
		const path = document.createElementNS(SVG, "path");
		if (layer.s) {
			path.setAttribute("d", layer.s);
			path.setAttribute("fill", "none");
			path.setAttribute("stroke", "currentColor");
			path.setAttribute("stroke-width", "2");
			path.setAttribute("stroke-linecap", "round");
			path.setAttribute("stroke-linejoin", "round");
		} else {
			path.setAttribute("d", layer.f ?? layer.b);
			path.setAttribute("fill", "currentColor");
			if (layer.b) path.setAttribute("opacity", "0.38");
		}
		svg.append(path);
	}
	return svg;
};


// ===================== games =====================


let pending = null;

const normalize = data =>
	(data?.games ?? [])
		.filter(g => g && typeof g.name === "string" && typeof g.url === "string")
		.map(g => ({
			id: g.name + "|" + g.url,
			name: g.name,
			url: g.url,
			thumbnail: g.thumbnail ?? "",
			proxied: g.category === "web",
			category: g.category ?? "games",
			keywords: [g.name, ...(g.altNames ?? [])].join(" ").toLowerCase()
		}));

// The list ships with the site (json/games.json), so it loads instantly and
// works offline from the service worker cache.
export const loadGames = () => {
	pending ??= fetch(asset("json/games.json"))
		.then(res => {
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return res.json();
		})
		.then(normalize);
	pending.catch(() => (pending = null));
	return pending;
};

export const getFavorites = () => storage.read("favorites", []);

export const toggleFavorite = id => {
	const favs = getFavorites();
	const next = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id];
	storage.write("favorites", next);
	return next;
};
