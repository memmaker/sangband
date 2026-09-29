/*
 * Sangband in the browser: terminal rendering, input and save persistence.
 * The game (sangband-core.js / .wasm) calls into Module.qb (see main-web.c).
 * The map (term 0) is the only canvas; every other window and the pop-up
 * are HTML text lines from the game (RVIP W0 rule 6), list icons CSS
 * sprites of tiles.png sized in em.
 */
(function () {
	'use strict';

	var TILE = 32;                 /* source tile size in tiles.png (Sangband's own David Gervais 32x32, web/mkgraf.py) */
	var TILESET = 'Gervais';
	/* Sangband reads its system pref files from lib/pref (preloaded); lib/user
	   holds only what the player writes, so it is persisted with the saves;
	   the page's own settings live in /sangband/web */
	var PERSIST = ['/sangband/lib/save', '/sangband/lib/apex', '/sangband/lib/bone', '/sangband/lib/user', '/sangband/web'];

	/* Term 0 main; what terms 1-6 show: web_window_flags[] in src/main-web.c */
	var TERMS = [
		{ id: 'main', title: '' },
		{ id: 'inv', title: 'Inventory' },
		{ id: 'msg', title: 'Messages' },
		{ id: 'mon', title: 'Visible' },
		{ id: 'rec', title: 'Recall' },
		{ id: 'eqp', title: 'Equipment' },
		{ id: 'chr', title: 'Character' }
	];

	var palette = [];
	var terms = [];
	var events = [];
	var tiles = new Image();
	var tilesReady = false;
	var dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));

	function $(id) { return document.getElementById(id); }

	/* Saves, export/import, new game, help and crashes: the shared rvip-app.js */
	/*
	 * Sangband names a savefile after the character (lib/save/0.<Name>) and
	 * lists them in lib/save/user.0.svg, newest first; the game loads the
	 * newest living one at start.  Export: every save + the list as one JSON
	 * bundle.  Import: such a bundle, or a single savefile (0.<Name>,
	 * sangband-<Name>.sav), which then heads the list.
	 */
	var SAVE_DIR = '/sangband/lib/save/';
	var app = RvipApp({
		name: 'sangband',
		save: function () { return saveFiles(); },
		root: SAVE_DIR,
		clear: removeSaves,
		put: putSave,
		noSave: 'There is no saved character yet (Ctrl-S saves).',
		flush: function (done) { if (Module._web_request_save) Module._web_request_save(); setTimeout(done, 1500); },
		helpText: 'Press ? in the game for its own help.'
	});

	function putSave(file, data) {
		var FS = Module.FS, n = file.name.split('/').pop();
		FS.mkdirTree(SAVE_DIR);
		if (n === 'user.0.svg') { FS.writeFile(SAVE_DIR + n, data); return; }
		/* a savefile: 0.<Name> (also from sangband-<Name>.sav); without a list
		   (a lone file) it gets one, so the game loads it at start */
		var m = /^(?:sangband-)?(?:\d+\.)?([A-Za-z0-9_-]+)(?:\.sav)?$/.exec(n);
		if (!m) return 'Not a Sangband savefile name: ' + n + ' (expected 0.<Name>, sangband-<Name>.sav or a sangband-save.json bundle).';
		FS.writeFile(SAVE_DIR + '0.' + m[1], data);
		if (!FS.analyzePath(SAVE_DIR + 'user.0.svg').exists)
			FS.writeFile(SAVE_DIR + 'user.0.svg', '1' + m[1] + '@' + m[1] + ' (imported)\n');
	}


	/* ---------- tiling window layout ---------- */

	/*
	 * The windows tile the area below the top bar like a tiling window
	 * manager: a fixed tree of splits, stored as fractions so it adapts to
	 * the browser size.  Windows never overlap and always cover the area:
	 *
	 *   +------------------+-------+   side   : x of main | side column
	 *   |                  |  inv  |   inv    : y of inv | mon (of top height)
	 *   |       main       +-------+   bottom : y of top | bottom row
	 *   |                  |  mon  |   msg    : x of msg | rec
	 *   |                  |       |
	 *   +-------------+----+-------+
	 *   |     msg     |    rec     |
	 *   +-------------+------------+
	 *
	 * The gutters between windows are drag handles.  Split positions, zoom
	 * levels and window titles are kept in LAYOUT_FILE, in the IndexedDB
	 * backed game filesystem next to the savefile.
	 */
	var FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Liberation Mono", monospace';
	var GUT = 6, TITLE_H = 20, BORDER = 2;
	var MIN_W = 90, MIN_H = 64, MAIN_MIN_W = 240, MAIN_MIN_H = 160;
	var TILE_STEPS = [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64];
	/* Tile mode: a map grid is 2 x 1 text cells (MAP_STEP in the game), cell height = tile size */
	var GTILE_STEPS = [8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48, 64];
	var LAYOUT_FILE = '/sangband/web/web-layout.json';
	var SPLITS = ['side', 'bottom', 'inv', 'msg'];

	var L = null;             /* persisted layout state */
	var rects = {};           /* current window rectangles, by id */

	function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

	/* Font face per window: the map (text mode) has its own choice */
	function face(i) { var n = L && (i ? L.face : L.mapFace); return n ? '"' + n + '", ' + FONT : FONT; }
	var mctx = null;             /* the map canvas' context measures the map font */
	function measure(fontPx) {
		mctx = mctx || $('t-main').querySelector('canvas').getContext('2d');
		mctx.font = fontPx + 'px ' + face(0);
		return mctx.measureText('M').width;
	}

	function areaSize() {
		var g = $('game');
		return { w: g.clientWidth, h: g.clientHeight };
	}

	function defaultLayout() {
		var A = areaSize(), W = A.w, H = A.h;
		/* Not laid out yet (hidden or zero-sized): assume a typical screen */
		if (W < 400 || H < 300) { W = 1280; H = 720; }
		var sideW = clamp(W * 0.24, 260, 440), botH = clamp(H * 0.19, 120, 220);
		var fit = Math.min((W - sideW - GUT - BORDER) / 40, (H - botH - GUT - BORDER) / 24);
		var tile = TILE_STEPS[0];
		TILE_STEPS.forEach(function (t) { if (t <= fit) tile = t; });
		/* Tiles: same cells as text (a tile is two cells wide) */
		var gfit = fit;
		var gtile = GTILE_STEPS[0];
		GTILE_STEPS.forEach(function (t) { if (t <= gfit) gtile = t; });
		/* auto*: still following the window size (not customised yet) */
		return { v: 1, tile: tile, gtile: gtile, titles: {}, autoSplit: true, autoTile: true,
			split: { side: (W - sideW) / W, bottom: (H - botH) / H, inv: 0.46, msg: 0.6 } };
	}

	function loadLayout() {
		var d = defaultLayout();
		try {
			var s = JSON.parse(Module.FS.readFile(LAYOUT_FILE, { encoding: 'utf8' }));
			if (s && s.v === 1) {
				SPLITS.forEach(function (k) {
					if (typeof s.split[k] === 'number' && s.split[k] > 0 && s.split[k] < 1) d.split[k] = s.split[k];
				});
				if (TILE_STEPS.indexOf(s.tile) >= 0) d.tile = s.tile;
				if (GTILE_STEPS.indexOf(s.gtile) >= 0) d.gtile = s.gtile;
				if (s.mult >= 1 && s.mult <= 4) d.mult = s.mult;
				d.autoSplit = s.autoSplit === true;
				d.autoTile = s.autoTile === true;
				if (d.autoSplit || d.autoTile) followWindow(d);
				/* old layout: its sub window sizes move to the WM once */
				if (s.font && s.wm && s.wm.v === 2 && !s.wm.fs) s.wm.fs = s.font;
				d.text = s.text === true;
				if (typeof s.face === 'string') d.face = s.face;
				if (typeof s.mapFace === 'string') d.mapFace = s.mapFace;
				if (s.audio) d.audio = { sound: s.audio.sound === true, music: s.audio.music === true };
				if (s.wm) d.wm = s.wm;
				if (s.titles) Object.keys(s.titles).forEach(function (k) {
					if (typeof s.titles[k] === 'string' && TERMS.some(function (t) { return t.id === k; })) d.titles[k] = s.titles[k].slice(0, 60);
				});
			}
		} catch (err) { /* no layout saved yet */ }
		L = d;
		renderTiles();
		$('sel-font').value = L.face || '';
		loadFace(L.face); loadFace(L.mapFace);
		if (L.audio) { audio.sound = !!L.audio.sound; audio.music = !!L.audio.music; renderAudio(); }
	}

	var saveTimer = 0;
	function saveLayout() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () {
			try {
				Module.FS.writeFile(LAYOUT_FILE, JSON.stringify(L));
				app.sync();
			} catch (err) { console.warn('layout not saved', err); }
		}, 400);
	}

	/*
	 * Until the player drags a gutter / zooms, the splits / tile size are
	 * recomputed for the current window size.  Otherwise a page that first
	 * loads in a tiny window (background tab, pane still opening) would
	 * keep that layout's proportions forever.
	 */
	function followWindow(l) {
		if (!l.autoSplit && !l.autoTile) return;
		var d = defaultLayout();
		if (l.autoSplit) l.split = d.split;
		if (l.autoTile) { l.tile = d.tile; l.gtile = d.gtile; }
	}

	function place(el, r) {
		el.style.left = r[0] + 'px';
		el.style.top = r[1] + 'px';
		el.style.width = Math.max(0, r[2]) + 'px';
		el.style.height = Math.max(0, r[3]) + 'px';
	}

	/* Windows are placed by the shared tiling window manager (rvip-wm.js) */
	var wm = null;
	function applyDom() { if (wm) wm.apply(); }
	function makeWM() {
		var s = defaultLayout().split;
		wm = RvipWM({
			area: $('game'), menu: $('btn-layout'),
			wins: [{ id: 'main', title: 'Map' }, { id: 'inv', title: 'Inventory' }, { id: 'msg', title: 'Messages' }, { id: 'mon', title: 'Visible' }, { id: 'rec', title: 'Recall' }, { id: 'eqp', title: 'Equipment' }, { id: 'chr', title: 'Character' }],
			multi: { d: 'v', r: s.bottom, a: { d: 'h', r: s.side, a: 'main', b: { d: 'v', r: s.inv, a: 'inv', b: 'mon' } }, b: 'msg' },
			single: 'main',
			state: L.wm,
			save: function (st) { L.wm = st; saveLayout(); },
			layout: function (r) {
				rects = r;
				if (terms[0]) fitCanvas(0);
				placePop();
				scheduleSoon();
			},
			/* A-/A+: map tile steps; the text windows are the WM's (body font-size); the pop-up follows Messages */
			zoom: { main: function (s, d) { zoomMain(d); }, msg: popFont },
			onReset: resetLayout
		});
		wm.apply();
	}

	/* Canvas area of a window (inside its border and title bar) */
	function inner(i) {
		var r = rects[TERMS[i].id] || [0, 0, 400, 240];     /* hidden: any size */
		return { w: Math.max(1, r[2] - BORDER), h: Math.max(1, r[3] - BORDER - ($('game').classList.contains('wm-single') ? 0 : TITLE_H)) };
	}

	/* Cell size, font and cols/rows of the map term at the current zoom */
	function termShape(i) {
		var box = inner(i), cw, ch, font, cols, rows;
		{
			/* Text cells are half as wide as high; with tiles a grid is two
			   cells (the game's big tiles, MAP_STEP in defines.h) */
			ch = tilesOn() ? Math.min(L.gtile, defaultLayout().gtile) : L.tile; cw = ch / 2;   /* tiles: cells fit 80x24, A+ zooms the grid */
			font = Math.floor(Math.min(ch * 0.8, cw / 0.62));
			/* text mode: cells from the map font, so wide fonts do not overlap */
			if (!tilesOn()) { cw = Math.ceil(measure(font)); ch = Math.round(font * 1.3); }
			/* tile mode: the cells are the grid's; a wide font gets smaller to fit them */
			else while (font > 6 && measure(font) > cw) font--;
			/* The game fits its map view to the term (web_set_view()); 80x24 at least */
			cols = clamp(Math.floor(box.w / cw), 80, 255);
			rows = clamp(Math.floor(box.h / ch), 24, 255);
		}
		return { cols: cols, rows: rows, cw: cw, ch: ch, font: font, face: face(i) };
	}

	/*
	 * A canvas bigger than its window (main window below 80x24, or a size
	 * the game hasn't applied yet) is scaled down to fit, never clipped.
	 */
	function fitCanvas(i) {
		var T = terms[i], box = inner(i);
		var w = T.cols * T.cw, h = T.rows * T.ch;
		var sc = Math.min(1, box.w / w, box.h / h);
		T.cv.style.width = (w * sc) + 'px';
		T.cv.style.height = (h * sc) + 'px';
		if (!i) {
			/* the prompt box over row 0 (RvipWM.prompt): one cell row as shown, the map term's font */
			var m = $('t-main');
			m.style.setProperty('--cell-h', (T.ch * sc) + 'px');
			m.style.setProperty('--cell-font', (T.font * sc) + 'px');
			m.style.setProperty('--cell-face', T.face);
		}
	}

	/* (Re)size one term's canvas; resizing the canvas also blanks it */
	function configureTerm(i, l, cols, rows) {
		var cv = $('t-' + TERMS[i].id).querySelector('canvas');
		cv.width = cols * l.cw * dpr;
		cv.height = rows * l.ch * dpr;
		var ctx = cv.getContext('2d', { alpha: false });
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.imageSmoothingEnabled = false;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.font = l.font + 'px ' + l.face;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, cols * l.cw, rows * l.ch);
		terms[i] = { cv: cv, ctx: ctx, cols: cols, rows: rows,
			cw: l.cw, ch: l.ch, font: l.font, face: l.face, dpr: dpr };
		fitCanvas(i);
	}

	function buildTerms() {
		loadLayout();
		makeWM();
		renderMapSel();
		var l = termShape(0);
		configureTerm(0, l, l.cols, l.rows);
		TERMS.forEach(function (d, i) { if (i) textPane(i, document.querySelector('#t-' + d.id + ' pre')); });
		textPane(P_POP, document.querySelector('#pop pre'));
		applyFace(); popFont();
	}

	/*
	 * New window sizes or zoom: compute each term's new shape; the game
	 * applies it (qb.applyLayout) the next time it looks for input.
	 */
	var pending = null;

	function sameShape(T, l) {
		return T.cols === l.cols && T.rows === l.rows && T.cw === l.cw &&
			T.ch === l.ch && T.font === l.font && T.face === l.face;
	}

	function scheduleLayout() {
		if (!terms.length) return;
		dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
		/* only the map term follows its window; unchanged needs no work (unless the pixel ratio changed) */
		var l = termShape(0);
		pending = [(!rects.main || (sameShape(terms[0], l) && terms[0].dpr === dpr)) ? null : l];
	}

	/* Throttled version for live dragging */
	var schedTimer = 0, schedLast = 0;
	function scheduleSoon() {
		var now = Date.now();
		clearTimeout(schedTimer);
		if (now - schedLast > 80) { schedLast = now; scheduleLayout(); }
		else schedTimer = setTimeout(function () { schedLast = Date.now(); scheduleLayout(); }, 80);
	}

	/* Zoom: main window tile size, sub window font size */
	function zoomMain(dir) {
		if (tilesOn()) {   /* tile mode: bigger grids, same 80x24 text cells */
			var m = clamp((L.mult || 1) + dir, 1, 4);
			if (m === (L.mult || 1)) return;
			L.mult = m;
			saveLayout();
			app.status('Map tiles: ' + (m * terms[0].ch) + ' px');
			clearTimeout(zoomMsgTimer);
			zoomMsgTimer = setTimeout(function () { app.status(''); }, 1200);
			return;
		}
		var g = tilesOn(), st = g ? GTILE_STEPS : TILE_STEPS, k = g ? 'gtile' : 'tile';
		var i = st.indexOf(L[k]);
		var n = clamp(i + dir, 0, st.length - 1);
		if (n === i) return;
		L[k] = st[n];
		L.autoTile = false;
		scheduleLayout();
		saveLayout();
		app.status('Map cells: ' + L[k] + ' px');
		clearTimeout(zoomMsgTimer);
		zoomMsgTimer = setTimeout(function () { app.status(''); }, 1200);
	}
	var zoomMsgTimer = 0;

	function resetLayout() {
		L = Object.assign(defaultLayout(), { audio: L.audio, wm: wm.state(), face: L.face, mapFace: L.mapFace, text: L.text, mult: 1 });
		scheduleLayout();
		saveLayout();
	}

	/* Sub window titles: click to rename */
	function titleOf(id) {
		var d = TERMS.filter(function (t) { return t.id === id; })[0];
		return L.titles[id] || d.title;
	}

	function renderTitles() {
		TERMS.forEach(function (d, i) {
			if (!i) return;
			$('t-' + d.id).querySelector('.name').textContent = titleOf(d.id);
		});
	}

	function editTitle(id) {
		var name = $('t-' + id).querySelector('.name');
		if (name.querySelector('input')) return;
		var input = document.createElement('input');
		input.value = titleOf(id);
		input.maxLength = 60;
		input.setAttribute('aria-label', 'Window title');
		name.textContent = '';
		name.appendChild(input);
		input.focus();
		input.select();
		var done = false;
		function finish(keep) {
			if (done) return;
			done = true;
			var v = input.value.trim();
			if (keep) {
				var d = TERMS.filter(function (t) { return t.id === id; })[0];
				if (!v || v === d.title) delete L.titles[id];
				else L.titles[id] = v;
				saveLayout();
			}
			renderTitles();
		}
		input.addEventListener('keydown', function (e) {
			e.stopPropagation();
			if (e.key === 'Enter') { e.preventDefault(); finish(true); }
			else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
		});
		input.addEventListener('blur', function () { finish(true); });
	}

	/* ---------- drawing (called from C) ---------- */

	function color(a) {
		return palette[a] || palette[a & 0x0F] || '#fff';
	}

	function glyph(b) {
		/* font-x11.prf uses the X11 fixed font's DEC graphics: 1 diamond, 2 wall */
		if (b === 1) return '\u25C6';
		if (b === 2) return '\u2592';
		if (b < 32 || b === 127) return ' ';
		return String.fromCharCode(b);
	}

	/* ---------- text windows (RVIP W0 rule 6): HTML lines from the game ----------
	 * main-web.c web_row(): each changed row trimmed, colour runs "\x05#rrggbb" ..
	 * "\x06", the cursor cell "\x01" .. "\x06", a tile icon "\x07" + a c ta tc (hex)
	 * + width in cells; then the rows in use.  Text size = the WM's body font-size
	 * (A-/A+ per window); the pop-up has the Messages size. */
	var P_POP = TERMS.length;
	var txt = [];                /* pane -> {el, lines, n, end} */
	var pop = { x: -1, y: -1 };  /* the pop-up's first cell on term 0 */
	function textPane(p, el) { el.textContent = ''; txt[p] = { el: el, lines: [], n: 0, end: null }; }
	function mark(T) {           /* before a change: was the window at its end? */
		var b = T.el.parentNode;
		if (T.end == null) T.end = b.scrollTop + b.clientHeight >= b.scrollHeight - 4;
	}
	function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
	var TOK = /\x05#[0-9a-f]{6}|\x07[0-9a-f]{8}\d|[\x01\x06]|[^\x01\x05\x06\x07]+/g;
	var SHEET_COLS = 128, SHEET_ROWS = 30, IC = 1.2;   /* tiles.png: 128 x 30 tiles; icon side in em */
	function sprite(a, k) {
		return 'url(tiles.png) ' + -(k & 0x7F) * IC + 'em ' + -(a & 0x7F) * IC + 'em / ' + SHEET_COLS * IC + 'em ' + SHEET_ROWS * IC + 'em no-repeat';
	}
	/* A tile icon (object/monster over its terrain) spanning w cells */
	function iconHtml(t) {
		var a = parseInt(t.substr(1, 2), 16), k = parseInt(t.substr(3, 2), 16), ta = parseInt(t.substr(5, 2), 16), tk = parseInt(t.substr(7, 2), 16);
		var bg = sprite(a, k);
		if ((ta & 0x80) && (tk & 0x80) && (ta !== a || tk !== k)) bg += ', ' + sprite(ta, tk);
		return '<span class="ic" style="width:' + t.charAt(9) + 'ch"><span style="background:' + bg + '"></span></span>';
	}
	function rowHtml(s) {
		var out = '', len = 0;
		(s.match(TOK) || []).forEach(function (a) {
			if (a === '\x01') out += '<span class="cu">';
			else if (a === '\x06') out += '</span>';
			else if (a[0] === '\x05') out += '<span style="color:' + a.slice(1) + '">';
			else if (a[0] === '\x07') { out += iconHtml(a); len += +a.charAt(9); }
			else { out += esc(a); len += a.length; }
		});
		return [out, len];
	}
	function drawRow(T, y) {
		var d = T.el.children[y];
		if (!d) return;
		var h = rowHtml(T.lines[y] || '');
		d.innerHTML = h[0]; d._len = h[1];
	}
	/* the top-bar font on every text window and the pop-up (the map has its own) */
	function applyFace() {
		var f = face(1);
		document.querySelectorAll('pre.txt').forEach(function (e) { e.style.fontFamily = f; });
	}
	function popFont() { $('pop').style.fontSize = RvipWM.fontSize('msg') + 'px'; placePop(); }
	/* at the pop-up's own cell over the map (the map term's cell size), inside the game area */
	function placePop() {
		var P = $('pop'), T = terms[0];
		if (P.hidden || !T || pop.x < 0 || !rects.main) return;
		var sc = parseFloat(T.cv.style.width) / (T.cols * T.cw) || 1, dy = Math.round(pop.y * T.ch * sc);
		P.style.marginTop = dy + 'px';
		RvipWM.popup(P, { x: Math.round(pop.x * T.cw * sc) });
		P.style.maxHeight = Math.max(40, RvipWM.popupBox().h - dy) + 'px';
	}
	/* A click on a pop-up row: the game's mouse key at that term 0 cell (menus, item lists) */
	function onPopMouse(e) {
		if (!app.running || e.button === 1) return;
		var d = e.target.closest && e.target.closest('#pop pre > div');
		e.preventDefault();
		if (!d) return;
		var y = Array.prototype.indexOf.call(d.parentNode.children, d), r = d.getBoundingClientRect();
		var x = d._len ? Math.floor((e.clientX - r.left) / (r.width / d._len)) : 0;
		events.push({ mouse: true, x: Math.min(254, pop.x + Math.max(0, x)), y: pop.y + y, b: e.button === 2 ? 3 : e.detail >= 2 ? 4 : 2 });
	}

	/*
	 * Sound effects (sound.cfg, web/sounds.py) and the game's own music
	 * (lib/xtra/music/jukebox.cfg, rendered to music/*.ogg), both off by default
	 */
	var audio = { sound: false, music: false, cfg: null, cache: {}, depth: -1, song: null, have: {},
		themes: null, want: -1, theme: -1, start: 0 };
	var THEMES = ['town', 'peaceful', 'light', 'medium', 'heavy', 'deadly', 'death'];

	/* Config files sit in the preloaded lib (a fetched .cfg is a download prompt) */
	function readCfg(path) {
		var out = {}, t = '';
		try { t = Module.FS.readFile(path, { encoding: 'utf8' }); } catch (e) { }
		t.split('\n').forEach(function (l) {
			var m = /^(\w+)\s*=\s*(.+)$/.exec(l.trim());
			if (m) out[m[1]] = m[2].split(/\s+/);
		});
		return out;
	}
	function loadSoundCfg() { audio.cfg = readCfg('/sangband/lib/xtra/sound/sound.cfg'); }

	/* Start a song of this theme (play_music_sdl()); none there = silence */
	function playTheme(v) {
		if (!audio.themes) audio.themes = readCfg('/sangband/lib/xtra/music/jukebox.cfg');
		var list = audio.themes[THEMES[v]] || [];
		if (audio.song) { audio.song.pause(); audio.song = null; }
		audio.theme = v;
		audio.start = performance.now() / 1000;
		if (!list.length) return;
		var f = list[Math.floor(Math.random() * list.length)].replace(/\.[a-z0-9]+$/i, '.ogg');
		audio.song = new Audio('music/' + f);
		audio.song.loop = true;
		audio.song.volume = 0.5;
		audio.song.play().catch(function () { });
	}

	/*
	 * The jukebox (intrface.c jukebox(), not compiled here): change at once on
	 * a +100 request or when nothing plays, else only after the song had time,
	 * sooner when the danger rose a lot.
	 */
	function jukebox(v) {
		var now = v >= 100 || audio.theme < 0;
		if (v >= 100) v -= 100;
		if (now) return v !== audio.theme;
		var t = performance.now() / 1000 - audio.start;
		var len = (audio.song && isFinite(audio.song.duration)) ? audio.song.duration : 120;
		if (t < 10) return false;
		if (v >= 0 && v <= 5) {
			var d = v - audio.theme;
			if (d >= 4) return true;
			if (d >= 3) return t >= 20;
			if (d >= 2) return t >= 30;
			if (d >= 1) return t >= Math.max(len, 50);
			if (d >= 0) return t >= Math.max(len, 120);
			if (d >= -1) return t >= Math.max(len, 60);
			if (d >= -2) return t >= 40;
			if (d >= -3) return t >= 30;
			return false;
		}
		return t >= Math.max(len, 60);
	}

	function updateMusic() {
		if (audio.music && audio.have.music) {
			/* made on first use: no music fetch at page load or while off */
			if (audio.want >= 0 && audio.theme < 0) playTheme(audio.want);
		}
		else {
			if (audio.song) { audio.song.pause(); audio.song = null; }
			audio.theme = -1;
		}
	}

	function toggleAudio(kind) {
		audio[kind] = !audio[kind];
		L.audio = { sound: audio.sound, music: audio.music };
		saveLayout();
		renderAudio();
		updateMusic();
	}

	/*
	 * Tiles button: cycles the tile sets, then None (one set here: Gervais
	 * <-> None).  None is the game's own text mode: web_set_tiles(0), applied
	 * at the next command prompt, where the visuals reload and the map, the
	 * Inventory and the Visible list redraw.
	 */
	function toggleTiles() {
		if (!tilesReady) return;
		L.text = !L.text;
		if (Module._web_set_tiles) Module._web_set_tiles(L.text ? 0 : 1);
		scheduleLayout();	/* map cells change width with the mode */
		saveLayout();
		renderTiles();
	}
	function tilesOn() { return tilesReady && !(L && L.text); }
	function renderTiles() { $('btn-tiles').textContent = 'Tiles: ' + (tilesOn() ? TILESET : 'None'); renderMapSel(); }
	/* Map font select on the Map title bar, text mode only (shown on hover) */
	var mapSel = document.createElement('select');
	mapSel.className = 'map-font';
	mapSel.title = 'Map font (text mode)';
	mapSel.innerHTML = '<option value="">Default font</option>';
	mapSel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });   /* not a window drag */
	mapSel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
	function renderMapSel() {
		var bs = document.querySelector('#t-main .wm-btns');
		if (bs && mapSel.parentNode !== bs) bs.insertBefore(mapSel, bs.firstChild);
		mapSel.hidden = tilesOn();
		mapSel.value = (L && L.mapFace) || '';
	}
	/* Fonts: faces from the index page's fonts/ (web/build.sh lists them) */
	function loadFace(n, now) {
		var redraw = function () { applyFace(); if (terms.length) scheduleLayout(); };
		if (!n) { if (now) redraw(); return; }
		var ff = new FontFace(n, 'url(../fonts/' + n + '.woff)');
		ff.load().then(function () { document.fonts.add(ff); redraw(); })
			.catch(function () { app.status('Could not load the font ' + n + '.', true); });
	}

	function renderAudio() {
		$('chk-sound').checked = !!audio.sound;
		$('chk-music').checked = !!audio.music;
	}

	var qb = {
		sound: function (name) {
			if (!audio.cfg) loadSoundCfg();
			var files = audio.sound && audio.have.sound && audio.cfg[name];
			if (!files) return;
			var f = files[Math.floor(Math.random() * files.length)];
			if (!audio.cache[f]) audio.cache[f] = new Audio('sound/' + f);
			var a = audio.cache[f].cloneNode();
			a.volume = 0.6;
			a.play().catch(function () { });
		},

		depth: function (d) { audio.depth = d; },

		/* TERM_XTRA_MUSIC: a theme 0..6 (+100 = change now), every game turn */
		music: function (v) {
			audio.want = v % 100;
			if (!audio.music || !audio.have.music) return;
			if (jukebox(v)) playTheme(v % 100);
		},

		mouseX: 0, mouseY: 0, mouseB: 0,

		termCols: function (t) { return terms[t].cols; },
		termRows: function (t) { return terms[t].rows; },

		layoutPending: function (t) { return (pending && pending[t]) ? 1 : 0; },
		pendingCols: function (t) { return pending[t].cols; },
		pendingRows: function (t) { return pending[t].rows; },
		applyLayout: function (t, cols, rows) {
			var l = pending[t];
			pending[t] = null;
			configureTerm(t, l, cols, rows);
		},

		color: function (i, r, g, b) {
			palette[i] = 'rgb(' + r + ',' + g + ',' + b + ')';
		},

		clear: function (t) {
			var T = terms[t];
			T.ctx.fillStyle = '#000';
			T.ctx.fillRect(0, 0, T.cols * T.cw, T.rows * T.ch);
		},

		wipe: function (t, x, y, n) {
			var T = terms[t];
			T.ctx.fillStyle = '#000';
			T.ctx.fillRect(x * T.cw, y * T.ch, n * T.cw, T.ch);
		},

		text: function (t, x, y, n, a, s) {
			var T = terms[t], c = T.ctx, H = Module.HEAPU8, st = 1;
			c.fillStyle = '#000';
			c.fillRect(x * T.cw, y * T.ch, n * st * T.cw, T.ch);
			c.fillStyle = color(a);
			var cy = y * T.ch + T.ch / 2 + 1;
			for (var i = 0; i < n; i++) {
				var ch = H[s + i];
				if (ch !== 32) c.fillText(glyph(ch), (x + i * st) * T.cw + st * T.cw / 2, cy);
			}
		},

		/*
		 * One graphics cell from the game (main-web.c decides everything):
		 * tile a/k (sheet row/column | 0x80) over terrain ta/tk, in a box of
		 * w x h cells: a big map tile (square cells), a list icon over two
		 * cells, or one cell.  Icons keep the tile square, centred.
		 * Nearest-neighbour only (imageSmoothingEnabled = false).
		 */
		pict: function (t, x, y, a, k, ta, tk, w, h) {
			var T = terms[t], c = T.ctx;
			var px = x * T.cw, py = y * T.ch, bw = w * T.cw, bh = h * T.ch;
			c.fillStyle = '#000';
			c.fillRect(px, py, bw, bh);

			/* Not a tile (or no sheet): the text glyph */
			if (!(a & 0x80) || !(k & 0x80) || !tilesReady) {
				if (k !== 32) {
					c.fillStyle = color(a & 0x7F);
					c.fillText(glyph(k), px + T.cw / 2, py + T.ch / 2 + 1);
				}
				return;
			}

			var sw = tiles.naturalWidth, sh = tiles.naturalHeight;
			var fx = (k & 0x7F) * TILE, fy = (a & 0x7F) * TILE;
			var bx = (tk & 0x7F) * TILE, by = (ta & 0x7F) * TILE;
			if (fx + TILE > sw || fy + TILE > sh) fx = fy = 0;
			if (bx + TILE > sw || by + TILE > sh) bx = by = 0;

			var s = Math.min(bw, bh), dx = px + Math.floor((bw - s) / 2), dy = py + Math.floor((bh - s) / 2);
			if ((ta & 0x80) && (tk & 0x80) && (bx !== fx || by !== fy))
				c.drawImage(tiles, bx, by, TILE, TILE, dx, dy, s, s);
			c.drawImage(tiles, fx, fy, TILE, TILE, dx, dy, s, s);
		},

		/* w x h cells: a big map tile's box (the game never puts it on the hero) */
		curs: function (t, x, y, w, h) {
			var T = terms[t], c = T.ctx;
			c.strokeStyle = '#ff0';
			c.lineWidth = 1;
			c.strokeRect(x * T.cw + 0.5, y * T.ch + 0.5, w * T.cw - 1, h * T.ch - 1);
		},

		fresh: function () { },
		prompt: function (s) { RvipWM.prompt.text(s); },   /* term 0 row 0 over the map (main-web.c) */
		line: function (p, y, s) {
			var T = txt[p];
			if (!T) return;
			mark(T);
			T.lines[y] = s;
			if (y < T.n) drawRow(T, y);
		},
		rows: function (p, n) {
			var T = txt[p];
			if (!T) return;
			mark(T);
			while (T.el.children.length < n) { T.el.appendChild(document.createElement('div')); drawRow(T, T.el.children.length - 1); }
			while (T.el.children.length > n) T.el.removeChild(T.el.lastChild);
			T.n = n;
			if (p === P_POP) { $('pop').hidden = !n; placePop(); }
			/* a window that was at its end (Messages) stays there; scrolled up, it stays put */
			if (T.end) T.el.parentNode.scrollTop = T.el.parentNode.scrollHeight;
			T.end = null;
		},
		/* the pop-up's first cell on term 0 (-1: none): shown there over the map */
		popAt: function (x, y) { pop.x = x; pop.y = y; if (x < 0) { txt[P_POP].lines = []; } placePop(); },

		bell: function () { },

		/* Tiles at start (the Tiles button later calls web_set_tiles()); map zoom, read at each command prompt */
		tilesWanted: function () { return (tilesReady && !L.text) ? 1 : 0; },
		tileMult: function () { return (tilesOn() && L && L.mult) || 1; },

		nextEvent: function (atCmd) {
			RvipWM.prompt.wait(atCmd);
			if (!events.length) return -1;
			var e = events.shift();
			/* A click: MOUSEKEY button x y term in main-web.c web_pump() */
			if (e.mouse) return 0x1000000 | (e.b << 16) | (e.y << 8) | e.x;
			return e.k;
		},

		plog: function (msg) {
			console.warn('[sangband]', msg);
			app.status(msg, true);
		},

		sync: function () { app.sync(); },

		/* The game ended (quit_aux): death after tombstone and scores, or save + quit */
		quit: function (msg, dead) {
			app.running = false;
			app.sync();
			/* dead: 1 died, 0 saved + quit, -1 left before playing (Esc at the start menu) */
			$('overlay-msg').textContent = msg ? msg : dead > 0 ? 'Your character has died. Play again to roll a new one.' :
				dead === 0 ? 'Your game has been saved. Play again to continue.' : 'Sangband has ended.';
			$('overlay').hidden = false;
			$('btn-restart').focus();
		}
	};

	/* ---------- input ---------- */

	function pushKey(k) { events.push({ k: k }); }

	function pushString(s) {
		for (var i = 0; i < s.length; i++) pushKey(s.charCodeAt(i));
	}

	/* X11-style macro trigger: ^_ [N][S][O] _ keysym \r  (see pref-x11.prf) */
	function pushKeysym(sym, e) {
		pushString('\x1f' + (e.ctrlKey ? 'N' : '') + (e.shiftKey ? 'S' : '') +
			(e.altKey ? 'O' : '') + '_' + sym.toString(16).toUpperCase() + '\r');
	}

	var KEYSYMS = {
		ArrowLeft: 0xFF51, ArrowUp: 0xFF52, ArrowRight: 0xFF53, ArrowDown: 0xFF54,
		Home: 0xFF50, End: 0xFF57, PageUp: 0xFF55, PageDown: 0xFF56,
		Insert: 0xFF63, Clear: 0xFF0B, Pause: 0xFF13,
		F1: 0xFFBE, F2: 0xFFBF, F3: 0xFFC0, F4: 0xFFC1, F5: 0xFFC2, F6: 0xFFC3,
		F7: 0xFFC4, F8: 0xFFC5, F9: 0xFFC6, F10: 0xFFC7, F11: 0xFFC8, F12: 0xFFC9
	};

	/* Keypad with Shift (NumLock on) arrives as KP_<nav> in X11 */
	var KP_NAV = [0xFF9E, 0xFF9C, 0xFF99, 0xFF9B, 0xFF96, 0xFF9D, 0xFF98, 0xFF95, 0xFF97, 0xFF9A];

	function onKey(e) {
		/* Typing a window title */
		if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
		if (!app.running || e.isComposing) return;
		if (e.metaKey) return;               /* leave Cmd shortcuts to the browser */
		var k = e.key, code = e.code || '';

		if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta' ||
			k === 'CapsLock' || k === 'NumLock' || k === 'Dead') return;

		/* Numeric keypad: direction keys */
		var m = /^Numpad(\d)$/.exec(code);
		if (m) {
			var d = +m[1];
			if (e.shiftKey) pushKeysym(KP_NAV[d], { shiftKey: true });
			else if (e.ctrlKey || e.altKey) pushKeysym(0xFFB0 + d, e);
			else pushKeysym(0xFFB0 + d, {});
			e.preventDefault();
			return;
		}

		if (k === 'Escape') pushKey(27);
		else if (k === 'Enter') pushKey(13);
		else if (k === 'Tab') pushKey(9);
		else if (k === 'Backspace' || k === 'Delete') pushKey(8);
		else if (KEYSYMS[k]) pushKeysym(KEYSYMS[k], e);
		else if (k.length === 1) {
			var c = k.charCodeAt(0);
			if (e.ctrlKey && !e.altKey) {
				/* Control-letter and friends */
				var u = k.toUpperCase().charCodeAt(0);
				if (u >= 64 && u <= 95) pushKey(u & 0x1F);
				else pushKey(c);
			}
			else if (e.altKey && c < 128) {
				pushKeysym(c, { altKey: true, shiftKey: false });
			}
			else if (c < 256) pushKey(c);
			else return;
		}
		else return;

		e.preventDefault();
	}

	function onMouse(e) {
		if (!app.running) return;
		var T = terms[0], r = T.cv.getBoundingClientRect();
		var sx = r.width / (T.cols * T.cw), sy = r.height / (T.rows * T.ch);
		var x = Math.floor((e.clientX - r.left) / sx / T.cw);
		var y = Math.floor((e.clientY - r.top) / sy / T.ch);
		if (x < 0 || y < 0 || x >= T.cols || y >= T.rows) return;
		if (e.button === 1) return;
		/* Sangband's MOUSE_L_CLICK 2, MOUSE_R_CLICK 3, MOUSE_L_DBLCLICK 4 */
		events.push({ mouse: true, x: x, y: y, b: e.button === 2 ? 3 : e.detail >= 2 ? 4 : 2 });
		e.preventDefault();
	}

	/* ---------- persistence (IndexedDB via IDBFS) ---------- */

	function mountPersistent() {
		var FS = Module.FS;
		PERSIST.forEach(function (d) {
			FS.mkdirTree(d);
			FS.mount(Module.IDBFS, {}, d);
		});
		Module.addRunDependency('idbfs');
		FS.syncfs(true, function (err) {
			if (err) {
				console.error(err);
				app.status('Could not read saved games from IndexedDB (' + err + '). ' +
					'Saving may not work in this browser mode.', true);
			}
			Module.removeRunDependency('idbfs');
		});
	}

	function listFiles() {
		var FS = Module.FS, out = [];
		PERSIST.forEach(function (d) {
			var names;
			try { names = FS.readdir(d); } catch (err) { return; }
			names.forEach(function (name) {
				if (name === '.' || name === '..') return;
				var p = d + '/' + name;
				if (FS.isFile(FS.stat(p).mode)) out.push(p);
			});
		});
		return out;
	}

	function removeSaves() {
		listFiles().forEach(function (p) {
			if (p.indexOf(SAVE_DIR) === 0) Module.FS.unlink(p);
		});
	}

	/* The savefiles (0.<Name>) and their list (user.0.svg) */
	function saveFiles() {
		return listFiles().filter(function (p) {
			return p.indexOf(SAVE_DIR) === 0 && /^(0\.[^.]+|user\.0\.svg)$/.test(p.slice(SAVE_DIR.length));
		}).filter(function (p, i, a) { return !/svg$/.test(p) || a.length > 1; });
	}

	/* ---------- startup ---------- */

	window.Module = {
		qb: qb,
		/* no -u: the game loads the newest living character (user.0.svg) */
		arguments: [],
		noInitialRun: false,
		preRun: [function () {
			if (!tilesDone) {
				Module.addRunDependency('tiles');
				tilesWait = true;
			}
			/* Empty dirs aren't packaged; the game builds lib/data/*.raw at startup */
			['/sangband/lib/data', '/sangband/lib/info', '/sangband/lib/xtra', '/sangband/web'].forEach(function (d) { Module.FS.mkdirTree(d); });
			/* Own paths: IndexedDB names come from the mount points, shared per origin */
			Module.FS.chdir('/sangband');
			mountPersistent();
		}],
		/* Terms must exist before main() runs (it asks for their sizes) */
		onRuntimeInitialized: function () {
			app.running = true;
			app.status('');
			$('game').hidden = false;
			buildTerms();
		},
		print: function (s) { console.log(s); },
		printErr: function (s) { console.warn(s); },
		setStatus: function (s) {
			if (s && !app.running) app.status(s.replace(/\(\d+\/\d+\)/, '').trim() || 'Loading…');
		},
		onAbort: function (what) { app.crashed(new Error(what)); }
	};

	/* Tile sheet; main() waits for it */
	var tilesDone = false, tilesWait = false;
	function tilesFinished(ok) {
		tilesReady = ok;
		tilesDone = true;
		if (!ok) console.warn('no tile set (tiles.png); using text');
		if (L) renderTiles();
		if (tilesWait) Module.removeRunDependency('tiles');
	}
	/* Sangband's own 32x32 sheet (lib/xtra/graf, web/mkgraf.py) */
	tiles.onload = function () { tilesFinished(true); };
	tiles.onerror = function () { tilesFinished(false); };
	tiles.src = 'tiles.png';

	document.addEventListener('keydown', onKey);
	document.addEventListener('DOMContentLoaded', function () {
		var mainCv = document.querySelector('#t-main canvas');
		mainCv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
		mainCv.addEventListener('mousedown', onMouse);
		$('pop').addEventListener('mousedown', onPopMouse);
		$('pop').addEventListener('contextmenu', function (e) { e.preventDefault(); });
		$('chk-sound').onchange = function () { toggleAudio('sound'); };
		$('chk-music').onchange = function () { toggleAudio('music'); };
		RvipWM.dropdown($('btn-audio'), $('menu-audio'));
		RvipWM.dropdown($('btn-file'), $('menu-file'));
		$('btn-tiles').onclick = toggleTiles;
		fetch('fonts.json').then(function (r) { return r.json(); }).then(function (list) {
			[[$('sel-font'), 'face'], [mapSel, 'mapFace']].forEach(function (a) {
				list.forEach(function (n) {
					var o = document.createElement('option');
					o.value = n; o.textContent = n.replace(/^Web(Plus|437)_/, '').replace(/_/g, ' ');
					a[0].appendChild(o);
				});
				a[0].value = (L && L[a[1]]) || '';
			});
		}).catch(function () { });
		[[$('sel-font'), 'face'], [mapSel, 'mapFace']].forEach(function (a) {
			a[0].onchange = function () {
				if (!L) return;
				L[a[1]] = this.value;
				saveLayout();
				loadFace(this.value, true);
				this.blur();
			};
		});
		renderAudio();
		/* Only what this build ships (audio.json from build.sh): nothing missing is ever fetched */
		fetch('audio.json').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (have) {
			['sound', 'music'].forEach(function (k) {
				var c = $('chk-' + k);
				audio.have[k] = !!have[k];
				c.disabled = !have[k];
				if (!have[k]) c.parentNode.title = 'Not in this build yet';
			});
			updateMusic();
		});

		/* Buttons never take the keyboard focus away from the game */
		document.querySelectorAll('button').forEach(function (b) {
			b.addEventListener('mousedown', function (e) { e.preventDefault(); });
		});

		TERMS.forEach(function (d, i) {
			if (!i) return;
			var w = $('t-' + d.id);
		});
		$('btn-restart').onclick = function () { location.reload(); };
	});

	/* Resize and reposition the windows when the browser window changes */
	var resizeTimer = 0;
	window.addEventListener('resize', function () {
		if (!terms.length) return;
		followWindow(L);
		applyDom();
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(scheduleLayout, 150);
	});

	/* Autosave when the tab is hidden; keep IndexedDB current */
	document.addEventListener('visibilitychange', function () {
		if (document.hidden && app.running && Module._web_request_save) Module._web_request_save();
		if (document.hidden) app.sync();
	});
	window.addEventListener('pagehide', function () { app.sync(); });
	window.addEventListener('beforeunload', function (e) {
		if (!app.running) return;
		app.sync();
		e.preventDefault();
		e.returnValue = '';
	});
	setInterval(function () { if (app.running) app.sync(); }, 15000);

	/* Autosave every two minutes (the game only saves when idle at the command prompt) */
	setInterval(function () {
		if (app.running && Module._web_request_save) Module._web_request_save();
	}, 120000);
})();
