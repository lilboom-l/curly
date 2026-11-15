// curly! app: background effects, the pages, and startup.
import {
	applyCloak,
	comboFromEvent,
	credit,
	getFavorites,
	goTo,
	h,
	hookFramePanic,
	hookPanic,
	icon,
	inBlank,
	loadGames,
	onRoute,
	openInBlank,
	panic,
	pausePanic,
	route,
	settings,
	site,
	storage,
	toggleFavorite
} from "./core.js";
import { bareEndpoint, checkBare, defaultBareUrl, formatForDisplay, frameContainer, newTabUrl, openInBrowser, startEngine, tabs } from "./proxy.js";


// ===================== background effects =====================


// Black-and-white background effects on a single canvas.
//
// Kept cheap on purpose: pixel ratio capped, particles drawn in a few batched
// paths per frame (one per depth layer) instead of one fill each, motion scaled
// by frame time so speed doesn't depend on refresh rate, and the loop stops
// while the tab is hidden or the full-screen browser covers it.

const rand = (min, max) => min + Math.random() * (max - min);

// Each effect: create(w, h, density) -> state, frame(ctx, state, dt, w, h, t).
const effects = {
	snow: {
		create(w, h, density) {
			const layers = [
				{ r: [0.6, 1.2], speed: 18, alpha: 0.35, sway: 6 },
				{ r: [1.2, 2], speed: 32, alpha: 0.6, sway: 12 },
				{ r: [2, 3.2], speed: 55, alpha: 0.9, sway: 20 }
			];
			const per = Math.min(160, (w * h) / 9000) * density;
			return layers.map((l, i) => ({
				...l,
				flakes: Array.from({ length: Math.round(per / (i + 1)) }, () => ({
					x: rand(0, w),
					y: rand(0, h),
					r: rand(...l.r),
					phase: rand(0, Math.PI * 2),
					freq: rand(0.4, 1.1)
				}))
			}));
		},
		frame(ctx, layers, dt, w, h, t) {
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = "#fff";
			for (const l of layers) {
				ctx.globalAlpha = l.alpha;
				ctx.beginPath();
				for (const f of l.flakes) {
					f.y += l.speed * (0.7 + f.r / 4) * dt;
					if (f.y > h + 4) {
						f.y = -4;
						f.x = rand(0, w);
					}
					const x = f.x + Math.sin(t * f.freq + f.phase) * l.sway;
					ctx.moveTo(x + f.r, f.y);
					ctx.arc(x, f.y, f.r, 0, Math.PI * 2);
				}
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		}
	},

	stars: {
		create(w, h, density) {
			const count = Math.min(500, (w * h) / 3500) * density;
			return {
				stars: Array.from({ length: Math.round(count) }, () => ({
					x: rand(0, w),
					y: rand(0, h),
					r: Math.random() < 0.9 ? rand(0.4, 1.1) : rand(1.1, 1.8),
					phase: rand(0, Math.PI * 2),
					freq: rand(0.5, 2)
				})),
				shooting: null,
				next: rand(2, 6)
			};
		},
		frame(ctx, s, dt, w, h, t) {
			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = "#fff";
			// Bucket by brightness so twinkling costs 4 fills, not hundreds.
			const buckets = [[], [], [], []];
			for (const st of s.stars) {
				const b = (Math.sin(t * st.freq + st.phase) + 1) / 2;
				buckets[Math.min(3, Math.floor(b * 4))].push(st);
			}
			buckets.forEach((list, i) => {
				ctx.globalAlpha = 0.2 + i * 0.25;
				ctx.beginPath();
				for (const st of list) {
					ctx.moveTo(st.x + st.r, st.y);
					ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
				}
				ctx.fill();
			});

			s.next -= dt;
			if (!s.shooting && s.next <= 0) {
				s.shooting = { x: rand(w * 0.2, w), y: rand(0, h * 0.4), vx: -rand(500, 800), vy: rand(200, 350), life: 1 };
				s.next = rand(3, 8);
			}
			if (s.shooting) {
				const m = s.shooting;
				m.x += m.vx * dt;
				m.y += m.vy * dt;
				m.life -= dt * 1.2;
				const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 0.12, m.y - m.vy * 0.12);
				grad.addColorStop(0, `rgba(255,255,255,${Math.max(0, m.life)})`);
				grad.addColorStop(1, "rgba(255,255,255,0)");
				ctx.globalAlpha = 1;
				ctx.strokeStyle = grad;
				ctx.lineWidth = 1.6;
				ctx.beginPath();
				ctx.moveTo(m.x, m.y);
				ctx.lineTo(m.x - m.vx * 0.12, m.y - m.vy * 0.12);
				ctx.stroke();
				if (m.life <= 0) s.shooting = null;
			}
			ctx.globalAlpha = 1;
		}
	},

	rain: {
		create(w, h, density) {
			const layers = [
				{ len: 10, speed: 600, alpha: 0.15, width: 1 },
				{ len: 16, speed: 850, alpha: 0.25, width: 1 },
				{ len: 24, speed: 1150, alpha: 0.4, width: 1.3 }
			];
			const per = Math.min(220, (w * h) / 7000) * density;
			return layers.map((l, i) => ({
				...l,
				drops: Array.from({ length: Math.round(per / (i + 1)) }, () => ({ x: rand(0, w), y: rand(0, h) }))
			}));
		},
		frame(ctx, layers, dt, w, h) {
			ctx.clearRect(0, 0, w, h);
			ctx.strokeStyle = "#fff";
			const slant = 0.18;
			for (const l of layers) {
				ctx.globalAlpha = l.alpha;
				ctx.lineWidth = l.width;
				ctx.beginPath();
				for (const d of l.drops) {
					d.y += l.speed * dt;
					d.x += l.speed * slant * dt;
					if (d.y > h) {
						d.y = -l.len;
						d.x = rand(-w * 0.2, w);
					}
					ctx.moveTo(d.x, d.y);
					ctx.lineTo(d.x - l.len * slant, d.y - l.len);
				}
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
		}
	},

	binary: {
		trails: true,
		create(w, h, density) {
			const size = 16;
			const cols = Math.ceil(w / size);
			return {
				size,
				// y is measured in rows, so start within one screen of rows above.
				cols: Array.from({ length: cols }, () => ({
					y: rand(-h / size, 0) * 0.6,
					speed: rand(6, 16) * density ** 0.3,
					active: Math.random() < 0.35 + 0.35 * Math.min(1, density)
				})),
				acc: 0
			};
		},
		frame(ctx, s, dt, w, h) {
			// Fade the previous frame instead of clearing: that's the trail.
			ctx.fillStyle = "rgba(0,0,0,0.12)";
			ctx.fillRect(0, 0, w, h);
			ctx.font = `${s.size}px ui-monospace, Consolas, monospace`;
			ctx.textBaseline = "top";
			s.cols.forEach((c, i) => {
				if (!c.active) {
					if (Math.random() < dt * 0.3) c.active = true;
					return;
				}
				const prev = Math.floor(c.y);
				c.y += c.speed * dt;
				if (Math.floor(c.y) === prev) return;
				const y = Math.floor(c.y) * s.size;
				ctx.fillStyle = "#fff";
				ctx.fillText(Math.random() < 0.5 ? "0" : "1", i * s.size, y);
				// Dim the glyph above the head so the head stands out.
				ctx.fillStyle = "rgba(160,160,160,0.9)";
				ctx.fillText(Math.random() < 0.5 ? "0" : "1", i * s.size, y - s.size);
				if (y > h && Math.random() < 0.05) {
					c.y = rand(-20, 0);
					c.speed = rand(6, 16);
					c.active = Math.random() < 0.8;
				}
			});
		}
	},

	fireflies: {
		create(w, h, density) {
			// One pre-rendered glow sprite, drawn with drawImage (far cheaper
			// than shadowBlur on every dot).
			const sprite = document.createElement("canvas");
			sprite.width = sprite.height = 32;
			const g = sprite.getContext("2d");
			const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
			grad.addColorStop(0, "rgba(255,255,255,1)");
			grad.addColorStop(0.25, "rgba(255,255,255,0.6)");
			grad.addColorStop(1, "rgba(255,255,255,0)");
			g.fillStyle = grad;
			g.fillRect(0, 0, 32, 32);
			const count = Math.min(70, (w * h) / 25000) * density;
			return {
				sprite,
				flies: Array.from({ length: Math.round(count) }, () => ({
					x: rand(0, w),
					y: rand(0, h),
					a: rand(0, Math.PI * 2),
					v: rand(10, 30),
					size: rand(10, 22),
					phase: rand(0, Math.PI * 2)
				}))
			};
		},
		frame(ctx, s, dt, w, h, t) {
			ctx.clearRect(0, 0, w, h);
			for (const f of s.flies) {
				f.a += rand(-1, 1) * dt;
				f.x = (f.x + Math.cos(f.a) * f.v * dt + w) % w;
				f.y = (f.y + Math.sin(f.a) * f.v * dt + h) % h;
				ctx.globalAlpha = 0.25 + 0.75 * ((Math.sin(t * 1.3 + f.phase) + 1) / 2);
				ctx.drawImage(s.sprite, f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
			}
			ctx.globalAlpha = 1;
		}
	},

	warp: {
		create(w, h, density) {
			const count = Math.min(400, (w * h) / 4000) * density;
			const spawn = () => ({ x: rand(-1, 1), y: rand(-1, 1), z: rand(0.1, 1) });
			return { spawn, stars: Array.from({ length: Math.round(count) }, spawn) };
		},
		frame(ctx, s, dt, w, h) {
			ctx.clearRect(0, 0, w, h);
			const cx = w / 2;
			const cy = h / 2;
			const scale = Math.max(w, h) * 0.5;
			ctx.strokeStyle = "#fff";
			ctx.lineCap = "round";
			for (const bucket of [0.25, 0.55, 0.9]) {
				ctx.globalAlpha = bucket;
				ctx.lineWidth = bucket * 2;
				ctx.beginPath();
				for (const st of s.stars) {
					const bright = 1 - st.z;
					if (bright > bucket || bright < bucket - 0.35) continue;
					const pz = st.z;
					st.z -= dt * 0.35;
					if (st.z <= 0.02) {
						Object.assign(st, s.spawn(), { z: 1 });
						continue;
					}
					ctx.moveTo(cx + (st.x / pz) * scale, cy + (st.y / pz) * scale);
					ctx.lineTo(cx + (st.x / st.z) * scale, cy + (st.y / st.z) * scale);
				}
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
		}
	}
};

let canvas = null;
let stop = () => {};
let paused = false;

const run = () => {
	stop();
	const { effect, effectDensity, effectSpeed } = settings.load();
	const fx = effects[effect];
	canvas?.remove();
	canvas = null;
	if (!fx) return;

	// A fresh canvas per effect: an opaque (trail) context can't be reused.
	canvas = document.createElement("canvas");
	canvas.className = "bg__canvas";
	document.querySelector(".bg").append(canvas);
	const ctx = canvas.getContext("2d", { alpha: !fx.trails });
	let w = 0;
	let h = 0;
	let state = null;
	let frame = 0;
	let last = 0;
	let t = 0;

	const resize = () => {
		const dpr = Math.min(devicePixelRatio || 1, 1.5);
		w = innerWidth;
		h = innerHeight;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (fx.trails) {
			ctx.fillStyle = "#000";
			ctx.fillRect(0, 0, w, h);
		}
		state = fx.create(w, h, effectDensity);
	};

	const tick = now => {
		// Clamp so a long pause (tab switch) doesn't teleport everything.
		const dt = Math.min(0.05, (now - (last || now)) / 1000) * effectSpeed;
		last = now;
		t += dt;
		fx.frame(ctx, state, dt, w, h, t);
		// Always animates, even with the OS "reduce motion" setting on (Windows
		// turns it on when animation effects are off). The effect is the user's
		// own choice, and "None" turns it off.
		frame = requestAnimationFrame(tick);
	};

	const start = () => {
		cancelAnimationFrame(frame);
		if (document.hidden || paused) return;
		last = 0;
		frame = requestAnimationFrame(tick);
	};

	let resizeTimer = 0;
	const onResize = () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			resize();
			start();
		}, 120);
	};

	resize();
	start();
	addEventListener("resize", onResize);
	document.addEventListener("visibilitychange", start);
	const resume = start;
	stop = () => {
		cancelAnimationFrame(frame);
		clearTimeout(resizeTimer);
		removeEventListener("resize", onResize);
		document.removeEventListener("visibilitychange", start);
	};
	stop.resume = resume;
};

// The browser covers the whole screen, so there's no point drawing behind it.
const setBackgroundPaused = value => {
	if (paused === value) return;
	paused = value;
	stop.resume?.();
};

const initBackground = () => {
	let key = "";
	const update = s => {
		const next = [s.effect, s.effectDensity, s.effectSpeed].join("|");
		if (next === key) return;
		key = next;
		run();
	};
	update(settings.load());
	settings.onChange(update);
};


// ===================== footer =====================


const link = (href, label) => h("a", { href, target: "_blank", rel: "noreferrer" }, label);

const footer = () =>
	h(
		"footer",
		{ class: "footer" },
		h("span", null, `© ${new Date().getFullYear()} ${site.name} by `, link(site.authorUrl, site.author), ". Games provided by ", link(credit.url, credit.name), "."),
		h("nav", null, h("a", { href: "#/privacy" }, "Privacy"), h("a", { href: "#/dmca" }, "DMCA"), link(site.discord, "Discord"), link(site.repo, "GitHub"))
	);

// ===================== home =====================


// Same six picks for the whole day.
const dailyPicks = games => {
	let seed = Math.floor(Date.now() / 86_400_000);
	const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
	const pool = games.filter(g => !g.proxied);
	const picks = Array.from({ length: Math.min(6, pool.length) }, () => pool[Math.floor(rand() * pool.length)]);
	return picks.filter((g, i) => picks.indexOf(g) === i);
};

const gameCard = game =>
	h(
		"a",
		{ class: "card", href: `#/games?play=${encodeURIComponent(game.id)}` },
		h("img", { src: game.thumbnail, alt: "", loading: "lazy", decoding: "async", onError: e => (e.currentTarget.style.visibility = "hidden") }),
		h("span", { class: "card__name" }, game.name)
	);

const renderHome = () => {
	const input = h("input", { placeholder: "Search the web or enter a URL", autocomplete: "off", spellcheck: "false", "aria-label": "Search or URL" });
	const error = h("p", { class: "form-error", hidden: true });
	const gamesButton = h("button", { type: "button", class: "btn", onClick: () => goTo("games") }, icon("games", 18), " Games");
	const picks = h("div");

	const form = h(
		"form",
		{
			class: "searchbar",
			role: "search",
			onSubmit: e => {
				e.preventDefault();
				const result = openInBrowser(input.value, { newTab: true });
				error.hidden = result !== "blocked";
				error.textContent = "That address can't be opened through the proxy.";
				if (result === "opened") input.value = "";
			}
		},
		icon("search"),
		input,
		h("button", { type: "submit", class: "btn btn--accent" }, "Go")
	);

	const el = h(
		"div",
		{ class: "page page--home" },
		h(
			"section",
			{ class: "hero" },
			h("h1", { class: "hero__title" }, h("span", { class: "hero__mark" }, icon("logo", 40)), site.name),
			h("p", { class: "hero__tagline" }, site.tagline),
			form,
			error,
			h(
				"div",
				{ class: "row hero__actions" },
				gamesButton,
				h("button", { type: "button", class: "btn", onClick: () => goTo("browser") }, icon("browser", 18), " Browser"),
				h("a", { class: "btn", href: site.discord, target: "_blank", rel: "noreferrer" }, icon("discord", 18), " Discord")
			)
		),
		picks,
		footer()
	);

	loadGames().then(games => {
		gamesButton.lastChild.textContent = ` ${games.length} games`;
		const featured = dailyPicks(games);
		if (!featured.length) return;
		picks.replaceWith(
			h(
				"section",
				{ class: "section" },
				h(
					"div",
					{ class: "section__head" },
					h("h2", null, "Today's picks"),
					h("button", { type: "button", class: "link", onClick: () => goTo("games") }, "All games ", icon("right", 16))
				),
				h("div", { class: "grid grid--picks" }, featured.map(gameCard))
			)
		);
	}, () => {});

	return { el, focus: () => input.focus({ preventScroll: true }) };
};


// ===================== games =====================


const filters = [
	["all", "All"],
	["favorites", "Favorites"],
	["games", "Games"],
	["ports", "Ports"],
	["web", "Web"]
];

const player = (game, onClose) => {
	let favorite = getFavorites().includes(game.id);
	const frame = h("iframe", { src: game.url, title: game.name, allow: "autoplay; fullscreen; gamepad; pointer-lock; clipboard-write", allowfullscreen: true });
	hookFramePanic(frame);
	const stage = h("div", { class: "player__stage" }, frame);
	const star = h("button", { type: "button", class: "icon-btn", title: "Favorite" }, icon("star"));
	const syncStar = () => {
		star.classList.toggle("is-on", favorite);
		star.setAttribute("aria-pressed", String(favorite));
	};
	star.addEventListener("click", () => {
		favorite = toggleFavorite(game.id).includes(game.id);
		syncStar();
	});
	syncStar();

	return h(
		"div",
		{ class: "player" },
		h(
			"div",
			{ class: "player__bar" },
			h("button", { type: "button", class: "btn btn--ghost", onClick: onClose }, icon("left"), " Back"),
			h("h2", { class: "player__title" }, game.name),
			h(
				"div",
				{ class: "player__actions" },
				star,
				h("button", { type: "button", class: "icon-btn", title: "Reload", onClick: () => (frame.src = game.url) }, icon("reload")),
				h("button", { type: "button", class: "icon-btn", title: "Open through the proxy", onClick: () => openInBrowser(game.url, { newTab: true }) }, icon("globe")),
				h("button", { type: "button", class: "icon-btn", title: "Fullscreen", onClick: () => stage.requestFullscreen() }, icon("expand"))
			)
		),
		stage,
		h("p", { class: "player__hint" }, "Game not loading? It may be blocked on your network. Use the globe button to load it through the proxy.")
	);
};

const renderGames = query => {
	let games = [];
	let favorites = getFavorites();
	let filter = "all";
	const cards = new Map();

	const count = h("p", { class: "muted" }, "Loading games…");
	const search = h("input", { placeholder: "Search games", spellcheck: "false", "aria-label": "Search games" });
	const random = h("button", { type: "button", class: "btn", disabled: true }, icon("shuffle", 18), " Random");
	const grid = h("div", { class: "grid grid--games" }, Array.from({ length: 18 }, () => h("div", { class: "card card--skeleton" })));
	const empty = h("p", { class: "empty", hidden: true });
	const notice = h("div", { class: "notice", hidden: true });
	const chips = filters.map(([id, label]) =>
		h(
			"button",
			{
				type: "button",
				role: "tab",
				class: "chip",
				onClick: () => {
					filter = id;
					apply();
				}
			},
			label
		)
	);
	const list = h(
		"div",
		null,
		h(
			"header",
			{ class: "page__head" },
			h("div", null, h("h1", null, "Games"), count, h("p", { class: "muted small" }, "Games provided by ", h("a", { href: credit.url, target: "_blank", rel: "noreferrer" }, credit.name), ".")),
			h("div", { class: "toolbar-row" }, h("label", { class: "search-input" }, icon("search", 18), search), random)
		),
		h("div", { class: "chips", role: "tablist" }, chips),
		notice,
		grid,
		empty
	);
	const el = h("div", { class: "page page--wide" }, list);

	const visible = () => games.filter(g => !cards.get(g.id).hidden);

	const apply = () => {
		const q = search.value.trim().toLowerCase();
		let shown = 0;
		for (const g of games) {
			const card = cards.get(g.id);
			const fav = favorites.includes(g.id);
			const match =
				(filter === "all" || (filter === "favorites" ? fav : g.category === filter)) && (!q || g.keywords.includes(q));
			card.hidden = !match;
			if (match) shown++;
		}
		chips.forEach((chip, i) => {
			const on = filters[i][0] === filter;
			chip.classList.toggle("is-active", on);
			chip.setAttribute("aria-selected", String(on));
		});
		random.disabled = !shown;
		empty.hidden = Boolean(shown) || !games.length;
		empty.textContent = filter === "favorites" ? "No favorites yet. Tap the star on a game to add it." : "No games match that search.";
	};

	const play = game => {
		if (game.proxied || settings.get("gameMode") === "proxy") return openInBrowser(game.url, { newTab: true });
		list.hidden = true;
		const view = player(game, () => {
			view.remove();
			favorites = getFavorites();
			for (const g of games) cards.get(g.id).querySelector(".card__fav").classList.toggle("is-on", favorites.includes(g.id));
			list.hidden = false;
			apply();
		});
		el.append(view);
		scrollTo({ top: 0 });
	};

	const card = game => {
		const fav = h(
			"button",
			{
				type: "button",
				class: favorites.includes(game.id) ? "card__fav is-on" : "card__fav",
				"aria-label": `Favorite ${game.name}`,
				onClick: e => {
					e.stopPropagation();
					favorites = toggleFavorite(game.id);
					fav.classList.toggle("is-on", favorites.includes(game.id));
					if (filter === "favorites") apply();
				}
			},
			icon("star", 16)
		);
		return h(
			"div",
			{ class: "card", role: "button", tabindex: "0", onClick: () => play(game), onKeyDown: e => e.key === "Enter" && play(game) },
			h("img", { src: game.thumbnail, alt: "", loading: "lazy", decoding: "async", onError: e => (e.currentTarget.style.visibility = "hidden") }),
			h("span", { class: "card__name" }, game.name),
			fav,
			game.proxied && h("span", { class: "card__tag" }, "Web")
		);
	};

	search.addEventListener("input", apply);
	random.addEventListener("click", () => {
		const pool = visible();
		if (pool.length) play(pool[Math.floor(Math.random() * pool.length)]);
	});

	loadGames().then(
		list => {
			games = list;
			count.textContent = `${games.length} games`;
			for (const g of games) cards.set(g.id, card(g));
			grid.replaceChildren(...cards.values());
			apply();
			// Links like #/games?play=<id> from the home page.
			const id = query.get("play");
			if (id) {
				history.replaceState(null, "", "#/games");
				const game = games.find(g => g.id === id);
				if (game) play(game);
			}
		},
		error => {
			grid.replaceChildren();
			count.textContent = "";
			notice.hidden = false;
			notice.textContent = `Couldn't load the game list: ${error.message}`;
		}
	);

	return { el, focus: () => search.focus({ preventScroll: true }) };
};


// ===================== browser =====================


// Created once and only shown/hidden, so tabs keep running in the background.
const createBrowserView = () => {
	let active = false;
	let bareOk = true;
	let error = "";

	const strip = h("div", { class: "tabstrip", role: "tablist" });
	const back = h("button", { type: "button", class: "icon-btn", "aria-label": "Back", onClick: () => tabs.active?.back() }, icon("left"));
	const forward = h("button", { type: "button", class: "icon-btn", "aria-label": "Forward", onClick: () => tabs.active?.forward() }, icon("right"));
	const reload = h("button", { type: "button", class: "icon-btn", "aria-label": "Reload", onClick: () => tabs.active?.reload() }, icon("reload"));
	const lock = h("span", { class: "omnibar__icon" });
	const address = h("input", { placeholder: "Search or enter address", autocomplete: "off", spellcheck: "false", "aria-label": "Address" });
	const status = h("p", { class: "browser__status", hidden: true });
	const loadbar = h("div", { class: "loadbar", hidden: true });
	const frames = h("div", { class: "browser__frames" }, frameContainer);
	const empty = h(
		"div",
		{ class: "browser__empty", hidden: true },
		h("p", null, "No tabs open."),
		h("button", { type: "button", class: "btn btn--accent", onClick: () => tabs.open() }, icon("plus", 18), " New tab")
	);

	address.addEventListener("focus", () => address.select());
	address.addEventListener("blur", () => render());

	const form = h(
		"form",
		{
			class: "omnibar__form",
			role: "search",
			onSubmit: e => {
				e.preventDefault();
				error = openInBrowser(address.value) === "blocked" ? "That address can't be opened through the proxy." : "";
				address.blur();
				render();
			}
		},
		lock,
		address
	);

	const el = h(
		"section",
		{ class: "browser is-hidden", "aria-hidden": "true" },
		strip,
		h(
			"div",
			{ class: "omnibar" },
			back,
			forward,
			reload,
			form,
			h("button", { type: "button", class: "icon-btn", "aria-label": "Fullscreen", onClick: () => frameContainer.requestFullscreen() }, icon("expand"))
		),
		status,
		loadbar,
		frames,
		empty
	);

	const tabEl = tab => {
		const selected = tab.id === tabs.activeId;
		return h(
			"div",
			{
				role: "tab",
				tabindex: "0",
				class: selected ? "tab is-active" : "tab",
				"aria-selected": String(selected),
				title: tab.url,
				onClick: () => tabs.select(tab.id),
				onAuxclick: e => e.button === 1 && tabs.close(tab.id),
				onKeyDown: e => e.key === "Enter" && tabs.select(tab.id)
			},
			tab.loading ? h("span", { class: "spinner" }) : icon("globe", 16),
			h("span", { class: "tab__label" }, tab.title),
			h(
				"button",
				{
					type: "button",
					class: "tab__close",
					"aria-label": `Close ${tab.title}`,
					onClick: e => {
						e.stopPropagation();
						tabs.close(tab.id);
					}
				},
				icon("x", 14)
			)
		);
	};

	const render = () => {
		const current = tabs.active;
		strip.replaceChildren(
			...tabs.tabs.map(tabEl),
			h("button", { type: "button", class: "tab-new", "aria-label": "New tab", title: "New tab", onClick: () => tabs.open(newTabUrl()) }, icon("plus", 18))
		);
		back.disabled = !current?.canGoBack;
		forward.disabled = !current?.canGoForward;
		reload.disabled = !current?.session;
		lock.replaceChildren(icon(current?.url.startsWith("https:") ? "shield" : "search", 16));
		if (document.activeElement !== address) address.value = current?.url ? formatForDisplay(current.url) : "";

		const message = !bareOk ? null : error || current?.error;
		status.hidden = bareOk && !message;
		if (!bareOk) {
			status.replaceChildren(`No bare server is answering at ${bareEndpoint()}. Set one in `, h("a", { href: "#/settings" }, "Settings → Proxy → Bare server"), ".");
		} else if (message) status.textContent = message;

		loadbar.hidden = !current?.loading;
		empty.hidden = tabs.tabs.length > 0;
	};

	const check = () =>
		checkBare().then(ok => {
			bareOk = ok;
			render();
		});

	tabs.subscribe(render);
	settings.onChange(() => active && check());
	render();

	return {
		el,
		setActive(value) {
			active = value;
			el.classList.toggle("is-hidden", !value);
			el.setAttribute("aria-hidden", String(!value));
			if (!value) return;
			// No internal new-tab page: opening the browser with nothing open
			// starts a tab on the home URL.
			if (!tabs.tabs.length) tabs.open();
			check();
		}
	};
};


// ===================== settings =====================


// Each control registers a sync function; they all run when settings change,
// so the page never needs a full re-render (which would kill focus and drags).
const syncers = new Set();

const section = (title, description, ...children) =>
	h("section", { class: "panel settings-section" }, h("h2", null, title), description && h("p", { class: "muted small" }, description), h("div", { class: "settings-fields" }, children));

const field = (label, help, control) =>
	h("div", { class: "field" }, h("div", { class: "field__label" }, h("span", null, label), help && h("small", { class: "muted" }, help)), h("div", { class: "field__control" }, control));

const toggle = (name, label) => {
	const el = h("button", { type: "button", role: "switch", class: "switch", "aria-label": label, onClick: () => settings.set({ [name]: !settings.get(name) }) }, h("span"));
	syncers.add(s => {
		el.classList.toggle("is-on", s[name]);
		el.setAttribute("aria-checked", String(s[name]));
	});
	return el;
};

const select = (name, options) => {
	const el = h("select", { class: "input", onChange: e => settings.set({ [name]: e.target.value }) }, options.map(([value, label]) => h("option", { value }, label)));
	syncers.add(s => (el.value = s[name]));
	return el;
};

const segmented = (name, options) => {
	const buttons = options.map(([value, label]) => h("button", { type: "button", class: "seg__btn", onClick: () => settings.set({ [name]: value }) }, label));
	syncers.add(s => buttons.forEach((b, i) => b.classList.toggle("is-active", s[name] === options[i][0])));
	return h("div", { class: "seg" }, buttons);
};

const range = (name, min, max, step, label) => {
	const el = h("input", { type: "range", min, max, step, "aria-label": label, onInput: e => settings.set({ [name]: Number(e.target.value) }) });
	syncers.add(s => {
		if (document.activeElement !== el) el.value = s[name];
	});
	return el;
};

// Saves on blur/Enter, so half-typed values aren't rejected mid-typing.
const text = (name, placeholder) => {
	const el = h("input", { class: "input", placeholder, spellcheck: "false" });
	const commit = () => {
		if (el.value === settings.get(name)) return;
		const { rejected } = settings.set({ [name]: el.value });
		el.classList.toggle("is-bad", rejected.includes(name));
	};
	el.addEventListener("input", () => el.classList.remove("is-bad"));
	el.addEventListener("blur", commit);
	el.addEventListener("keydown", e => e.key === "Enter" && commit());
	syncers.add(s => {
		if (document.activeElement !== el && !el.classList.contains("is-bad")) el.value = s[name];
	});
	return el;
};

const keyRecorder = () => {
	let recording = false;
	const el = h("button", { type: "button", class: "btn kbd-btn" });
	const show = () => {
		el.classList.toggle("btn--accent", recording);
		el.replaceChildren(recording ? "Press a key… (Esc to cancel)" : h("kbd", null, settings.get("panicKey") || "None"));
	};
	const onKey = event => {
		event.preventDefault();
		event.stopPropagation();
		if (event.key !== "Escape") {
			const combo = comboFromEvent(event);
			if (!combo) return;
			settings.set({ panicKey: combo });
		}
		stop();
	};
	const stop = () => {
		recording = false;
		removeEventListener("keydown", onKey, true);
		pausePanic(false);
		show();
	};
	el.addEventListener("click", () => {
		if (recording) return stop();
		recording = true;
		pausePanic(true);
		addEventListener("keydown", onKey, true);
		show();
	});
	syncers.add(() => !recording && show());
	return el;
};

// Full reset: storage, caches, IndexedDB and service workers.
const resetWebsite = async () => {
	if (!confirm("Reset the website? This removes all your settings, favorites and saved data.")) return;
	try {
		for (const reg of (await navigator.serviceWorker?.getRegistrations()) ?? []) await reg.unregister();
	} catch {}
	try {
		for (const key of await caches.keys()) await caches.delete(key);
	} catch {}
	try {
		for (const db of (await indexedDB.databases?.()) ?? []) if (db.name) indexedDB.deleteDatabase(db.name);
	} catch {}
	try {
		localStorage.clear();
		sessionStorage.clear();
	} catch {}
	location.replace(location.pathname);
};

const renderSettings = () => {
	syncers.clear();

	const effectButtons = settings.effects.map(e =>
		h("button", { type: "button", class: "effect", onClick: () => settings.set({ effect: e.id }) }, h("span", { class: `effect__preview effect__preview--${e.id}` }), e.label)
	);
	const effectSliders = h("div", null, field("Amount", null, range("effectDensity", 0.25, 2, 0.05, "Amount")), field("Speed", null, range("effectSpeed", 0.25, 2.5, 0.05, "Speed")));
	syncers.add(s => {
		effectButtons.forEach((b, i) => {
			const on = s.effect === settings.effects[i].id;
			b.classList.toggle("is-active", on);
			b.setAttribute("aria-pressed", String(on));
		});
		effectSliders.hidden = s.effect === "none";
	});

	const customCloak = h("div", null, field("Title", null, text("cloakTitle", "Google Docs")), field("Icon URL", null, text("cloakFavicon", "https://…/favicon.ico")));
	syncers.add(s => (customCloak.hidden = s.cloakPreset !== "custom"));

	const blankError = h("small", { class: "form-error", hidden: true }, "Popup blocked. Allow popups for this site.");

	const el = h(
		"div",
		{ class: "page" },
		h("header", { class: "page__head" }, h("div", null, h("h1", null, "Settings"), h("p", { class: "muted" }, "Saved in this browser only."))),

		section(
			"Panic key",
			"Instantly leave the site. Works on every page, including inside proxied tabs.",
			field("Key", "Click, then press any key or combo.", keyRecorder()),
			field("Redirect to", null, text("panicUrl", "https://classroom.google.com/")),
			field("Test it", null, h("button", { type: "button", class: "btn", onClick: panic }, "Panic now"))
		),

		section("Background effect", null, h("div", { class: "effects" }, effectButtons), effectSliders),

		section(
			"Tab cloak",
			"Disguise this tab's title and icon.",
			field("Preset", null, select("cloakPreset", settings.cloakPresets.map(p => [p.id, p.label]))),
			customCloak,
			field(
				"about:blank",
				"Reopen the site in an about:blank tab so it doesn't show in history.",
				h("div", { class: "row" }, h("button", { type: "button", class: "btn", onClick: () => (blankError.hidden = openInBlank()) }, "Open now"), blankError)
			),
			field("Auto about:blank", "Do it automatically every time the site opens.", toggle("autoBlank", "Auto about:blank"))
		),

		section(
			"Proxy",
			null,
			field("Search engine", null, select("searchEngine", settings.searchEngines.map(e => [e.template, e.label]))),
			field("New tab page", "Blank uses the search engine's home page.", text("homeUrl", "https://duckduckgo.com/")),
			field("Bare server", `Blank uses this site's own (${defaultBareUrl()}).`, text("bareUrl", defaultBareUrl())),
			field("Open games", "Direct is faster. Use the proxy if games are blocked on your network.", segmented("gameMode", [["direct", "Direct"], ["proxy", "Through proxy"]]))
		),

		section(
			"Data",
			null,
			field("Reset settings", null, h("button", { type: "button", class: "btn", onClick: () => settings.reset() }, "Reset")),
			field("Reset website", "Fixes most problems: removes all saved data, caches and the proxy service worker, then reloads.", h("button", { type: "button", class: "btn btn--danger", onClick: resetWebsite }, "Reset website")),
			field(
				"Clear saved data",
				"Settings and favorite games.",
				h(
					"button",
					{
						type: "button",
						class: "btn btn--danger",
						onClick: () => {
							if (!confirm("Clear all saved data?")) return;
							storage.clearAll();
							location.reload();
						}
					},
					"Clear all data"
				)
			)
		)
	);

	const sync = s => syncers.forEach(fn => fn(s));
	sync(settings.load());
	const off = settings.onChange(sync);
	return { el, destroy: off };
};


// ===================== privacy & DMCA =====================


const contact = () => [link(site.discord, "Discord"), " or ", link(site.repo, "GitHub")];

const privacy = () => [
	h("h1", null, "Privacy Policy"),
	h("p", { class: "muted" }, "Last updated November 2026"),
	h("h2", null, "What we collect"),
	h("p", null, `${site.name} has no accounts and no analytics. Your settings and favorite games are stored only in your browser's local storage and never leave your device.`),
	h("h2", null, "Proxied browsing"),
	h(
		"p",
		null,
		"Pages you open in the browser are fetched through a bare server. Requests pass through that server so it can reach the site for you. We do not log or store the pages you visit or what you send to them. If you set a different bare server in Settings, that server's operator's policies apply instead."
	),
	h("h2", null, "Third parties"),
	h("p", null, `Games are provided by ${credit.name} and load from its servers, and fonts come from Google Fonts. Those services may receive your IP address as part of a normal web request.`),
	h("h2", null, "Clearing your data"),
	h("p", null, "Use Settings → Data → Reset website, or clear this site's data in your browser."),
	h("h2", null, "Contact"),
	h("p", null, "Questions? Reach us on ", contact(), ".")
];

const dmca = () => [
	h("h1", null, "DMCA"),
	h(
		"p",
		null,
		`${site.name} does not host any games. Games are provided by ${credit.name} (${credit.url}) and loaded from its servers; ${site.name} only keeps a list of links to them. Websites opened in the browser are fetched live from their owners. All trademarks and copyrights belong to their respective owners.`
	),
	h("p", null, "If you own content that appears here and want it removed, send a notice that includes:"),
	h(
		"ul",
		null,
		h("li", null, "Your name and contact information."),
		h("li", null, "The copyrighted work you believe is being infringed."),
		h("li", null, `The page on ${site.name} where it appears, with a link if possible.`),
		h("li", null, "A statement that you have a good-faith belief the use is not authorized by the owner, its agent, or the law."),
		h("li", null, "A statement that the information in your notice is accurate and that you are the owner or authorized to act for the owner."),
		h("li", null, "Your physical or electronic signature.")
	),
	h("p", null, "Send notices through ", contact(), ". Valid requests are handled promptly and the game is removed from json/games.json.")
];

const renderLegal = page => ({
	el: h("div", { class: "page" }, h("article", { class: "panel prose" }, page === "privacy" ? privacy() : dmca()), footer())
});


// ===================== startup =====================


const nav = [
	["home", "Home", "home"],
	["games", "Games", "games"],
	["browser", "Browser", "browser"],
	["settings", "Settings", "settings"]
];

const views = {
	home: () => renderHome(),
	games: query => renderGames(query),
	settings: () => renderSettings(),
	privacy: () => renderLegal("privacy"),
	dmca: () => renderLegal("dmca")
};

// ---------- shell ----------

const navButtons = nav.map(([view, label, name]) =>
	h("button", { type: "button", class: "sidebar__item", dataset: { view }, onClick: () => goTo(view) }, icon(name), h("span", null, label))
);

const outlet = h("div", { class: "outlet" });
const browser = createBrowserView();

const external = (href, label, name) =>
	h("a", { class: "sidebar__item sidebar__item--link", href, target: "_blank", rel: "noreferrer" }, icon(name), h("span", null, label));

document.querySelector(".sidebar").append(
	h("button", { class: "sidebar__logo", type: "button", "aria-label": site.name, onClick: () => goTo("home") }, icon("logo", 24)),
	...navButtons,
	h("div", { class: "sidebar__spacer" }),
	external(site.discord, "Discord", "discord"),
	external(site.repo, "GitHub", "github")
);
document.querySelector(".content").append(outlet, browser.el);
document.title = site.name;

// ---------- routing ----------

let current = { view: null, destroy: null };

const show = ({ view, query }) => {
	for (const button of navButtons) {
		const on = button.dataset.view === view;
		button.classList.toggle("is-active", on);
		if (on) button.setAttribute("aria-current", "page");
		else button.removeAttribute("aria-current");
	}

	browser.setActive(view === "browser");
	setBackgroundPaused(view === "browser");
	if (view === "browser") {
		outlet.hidden = true;
		current.destroy?.();
		current = { view, destroy: null };
		return;
	}

	outlet.hidden = false;
	if (view === current.view && view !== "games") return;
	current.destroy?.();
	const page = views[view](query);
	outlet.replaceChildren(page.el);
	current = { view, destroy: page.destroy ?? null };
	scrollTo({ top: 0 });
};

onRoute(show);
show(route());

// ---------- global behaviour ----------

hookPanic(window);
initBackground();
applyCloak();
settings.onChange(applyCloak);

// Start the proxy once the page is idle so it never delays first paint.
const whenIdle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 300));
whenIdle(() => startEngine().catch(error => console.error("Proxy failed to start", error)));

// Auto about:blank. Browsers block popups without a click, so if the first
// attempt is blocked, retry on the next click anywhere.
if (settings.get("autoBlank") && !inBlank() && !openInBlank()) {
	addEventListener("pointerdown", () => openInBlank(), { once: true });
}
