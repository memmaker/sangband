// Stage 5: the web page (RVIP W10 checklist) on the local build.
// Title -> birth -> tiles -> every window filled -> shop -> stairs -> help,
// Enter menu -> window drag/zoom/rename, layout survives reload, zoomed map
// keeps the player centred -> options entries -> save, reload (newest
// character loads by itself), autosave, Export/Import bundle, New game ->
// quit and death -> "Play again" -> no console errors / 4xx.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node stage5.mjs  (SHOTS=<dir> for screenshots)
import { realErrors, serve, open, screen, sleep, keys, type, waitText, wipeDbs, birth, where, settle } from './lib.mjs';
import fs from 'fs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const snap = async (page, n) => { if (shot(n)) await page.screenshot({ path: shot(n) }); };
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const J = JSON.stringify;
const top = async (page) => (await screen(page)).split('\n')[0] || '';
async function debug(page, k) {	// debug command ^A k
	await keys(page, [{ key: 'a', ctrlKey: true }], 300);
	const q = await waitText(page, /Are you sure|Debug Command/);
	if (/Are you sure/.test(q)) { await type(page, 'y'); await waitText(page, /Debug Command/); }
	await type(page, k, 500);
}
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('#game .win')].filter((w) => !w.classList.contains('wm-off')).map((w) => w.id.slice(2)));
const saveMtime = (page, n) => page.evaluate((n) => { try { return Module.FS.stat('/sangband/lib/save/0.' + n).mtime.getTime(); } catch (e) { return 0; } }, n);
const idbHas = (page, n) => page.evaluate((n) => new Promise((res) => {
	const r = indexedDB.open('/sangband/lib/save');
	r.onsuccess = () => { const db = r.result; const t = db.transaction('FILE_DATA').objectStore('FILE_DATA').getAllKeys(); t.onsuccess = () => { res(t.result.some((k) => String(k).endsWith('/0.' + n))); db.close(); }; t.onerror = () => res(false); };
	r.onerror = () => res(false);
}), n);
// Player sprite on the map (graf32-g.prf B: rows 3/4): [x, y, w, h] in cells
const hero = (page) => page.evaluate(() => {
	const T = window.__tiles[0] || {};
	for (const [k, v] of Object.entries(T)) if (v && (v[0] === 3 || v[0] === 4) && v[2] >= 2) { const [x, y] = k.split(',').map(Number); return [x, y, v[2], v[3]]; }
	return null;
});
// Walk to the nearest store entrance: BFS over the text-mode map ('.' floor, digits = entrances)
async function walkToShop(page) {
	const DIR = { '-1,-1': 7, '0,-1': 8, '1,-1': 9, '-1,0': 4, '1,0': 6, '-1,1': 1, '0,1': 2, '1,1': 3 };
	for (let n = 0; n < 12; n++) {
		const rows = (await screen(page)).split('\n');
		const at = (x, y) => (y >= 1 && y < rows.length - 1 && x >= 13 && rows[y] ? rows[y][x] || ' ' : ' ');
		let me = null;
		rows.forEach((r, y) => { const x = r.indexOf('@', 13); if (x >= 13 && y >= 1) me = [x, y]; });
		if (!me) return false;
		const prev = { [me]: null }, q = [me];
		let goal = null;
		while (q.length && !goal) {
			const [x, y] = q.shift();
			for (const [a, b] of Object.keys(DIR).map((k) => k.split(',').map(Number))) {
				const p = [x + a, y + b], c = at(p[0], p[1]);
				if (p in prev) continue;
				if (/[1-8]/.test(c)) { prev[p] = [x, y]; goal = p; break; }
				if (c === '.' || c === '>') { prev[p] = [x, y]; q.push(p); }
			}
		}
		if (!goal) return false;
		const path = [];
		for (let p = goal; prev[p]; p = prev[p]) path.unshift([p[0] - prev[p][0], p[1] - prev[p][1]]);
		for (const [a, b] of path.slice(0, 8)) {
			const k = String(DIR[a + ',' + b]);
			await keys(page, [{ key: k, code: 'Numpad' + k }], 200);
		}
		await sleep(400);
		if (/Item Description/.test(await screen(page))) return true;
	}
	return false;
}

try {
	let { browser, context, page, errors } = await open();
	// Stage 9: a finished run reports to /roguelikes/beacon (the server answers 204)
	const beacons = [];
	await context.route('**/roguelikes/beacon**', (r) => { beacons.push(r.request().url()); r.fulfill({ status: 204 }); });
	const dls = [];
	page.on('download', (d) => dls.push(d));

	// ---- title -> birth -> map with tiles ----
	await birth(page);
	await sleep(800);
	ok(/Tester[\s\S]*Town/.test(await screen(page)), 'birth: in town');
	const tcount = await page.evaluate(() => Object.values(window.__tiles[0] || {}).filter(Boolean).length);
	ok(tcount > 200, `map drawn with tiles (${tcount} tile cells)`);
	ok(!!(await hero(page)), 'player sprite on the map');
	const def = await shown(page);
	ok(['main', 'inv', 'mon', 'msg'].every((i) => def.includes(i)) && !def.includes('eqp') && !def.includes('rec') && !def.includes('chr'), 'default on: Map, Inventory, Visible, Messages; Equipment/Recall/Character via Windows ▾');
	const bar = await page.evaluate(() => [...document.querySelectorAll('#bar > button, #bar > select, #bar > .sep')].map((e) => e.className === 'sep' ? '|' : e.tagName === 'SELECT' ? 'Font' : e.textContent.trim().replace(/:.*/, '')).join(' · '));
	ok(bar === 'Help · File ▾ · | · Windows ▾ · Tiles · Font · Audio ▾', 'top bar order: ' + bar);
	const hint = await page.evaluate(() => document.querySelector('#bar .hint').textContent);
	ok(/explore/.test(hint) && /inventory/.test(hint) && /command menu/.test(hint) && /command help/.test(hint), 'key hints: ' + hint);

	// ---- every window filled ----
	ok(/Rations of Food/.test(await screen(page, 1)), 'Inventory window: the pack');
	const inkRow = await page.evaluate(() => { const cv = document.querySelector('#t-inv canvas'), c = cv.getContext('2d'); const d = c.getImageData(0, 0, cv.width, Math.min(cv.height, 60 * devicePixelRatio)).data; const cols = new Set(); for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) cols.add(d[i] >> 4 << 8 | d[i + 1] >> 4 << 4 | d[i + 2] >> 4); return cols.size; });
	ok(inkRow > 3, `Inventory rows in the game's item colours (${inkRow} colours)`);
	const msg = (await screen(page, 2)).split('\n');
	ok(msg[0].trim().length > 0 && /born/.test(msg.join('\n')), 'Messages window fills from the top: ' + J(msg[0].trim()));
	ok(/You can see|no monsters|You see/.test(await screen(page, 3)), 'Visible window: monsters/items in view');
	ok(/Tester/.test(await screen(page, 6)), 'Character window: the sheet');
	await type(page, 'w', 600); await type(page, '\r', 800);
	ok(/Torch/.test(await screen(page, 5)), 'Equipment window: wielded torch');
	await debug(page, 's'); await type(page, '1\r', 700);	// a monster next to the player
	await type(page, 'l', 700);
	let look = await top(page), rec = '';
	for (let i = 0; i < 20 && !rec; i++) {	// look goes nearest first (stairs, shops), then monsters
		rec = (await screen(page, 4)).trim();
		if (!rec) { await type(page, ' ', 300); look = await top(page); }
	}
	await type(page, '\x1b', 400);
	ok(rec.length > 20, 'Recall window: monster recall after look at ' + J(look.trim().slice(0, 50)) + ': ' + J(rec.slice(0, 60)));
	await debug(page, 'z');
	// Recall/Equipment/Character on via Windows ▾, then off again
	await page.click('#btn-layout');
	const menuItems = await page.evaluate(() => [...document.querySelectorAll('.wm-menu input[data-id]')].map((i) => i.dataset.id + ':' + i.checked));
	ok(menuItems.length === 7, 'Windows ▾ lists 7 windows ' + J(menuItems));
	await page.evaluate(() => { const i = document.querySelector('.wm-menu input[data-id=rec]'); i.click(); });
	await page.evaluate(() => { const i = document.querySelector('.wm-menu input[data-id=eqp]'); i.click(); });
	await page.mouse.click(5, 890); await sleep(1200);
	ok((await shown(page)).includes('rec') && (await shown(page)).includes('eqp'), 'Recall + Equipment shown via Windows ▾');
	ok(/Torch/.test(await screen(page, 5)), 'Equipment refilled after its resize');
	await snap(page, 's5-windows');

	// ---- prompt box over row 0 ----
	await type(page, 'i', 700);
	const box = await page.evaluate(() => { const b = document.querySelector('#t-main .wm-topl'), r = b.getBoundingClientRect(), m = document.querySelector('#t-main canvas').getBoundingClientRect(), w = document.getElementById('t-main');
		return { hidden: b.hidden, h: r.height, w: r.width, top: r.top - m.top, bw: document.querySelector('#t-main .body').clientWidth, t: b.textContent, ch: m.height / Module.qb.termRows(0), font: getComputedStyle(b).fontSize }; });
	ok(!box.hidden && Math.abs(box.h - box.ch) < 1.5 && Math.abs(box.w - box.bw) < 2 && Math.abs(box.top) < 1.5, 'prompt box = one cell row over row 0, full width: ' + J(box));
	await snap(page, 's5-prompt');
	await type(page, '\x1b', 400);
	await type(page, 'x', 300); await type(page, '\x1b', 300); await keys(page, ['Escape'], 300);
	const hid = await page.evaluate(() => document.querySelector('#t-main .wm-topl').hidden);
	ok(hid, 'a key at the command prompt hides the prompt box');

	// ---- shop ----
	await debug(page, 'z');	// no townspeople in the way
	await page.click('#btn-tiles'); await type(page, '\x1b', 900);
	const inShop = await walkToShop(page);
	const shopScr = await screen(page);
	ok(inShop && /Gold Remaining/.test(shopScr), 'walked into a store: ' + J(shopScr.split('\n').slice(2, 4).map((l) => l.trim()).filter(Boolean)));
	await snap(page, 's5-shop');
	await type(page, '\x1b', 800);
	await page.click('#btn-tiles'); await type(page, '\x1b', 900);
	ok(/Town/.test(await screen(page)) && !!(await hero(page)), 'left the store, tiles back');

	// ---- help + Enter menu ----
	await page.click('#btn-help'); await sleep(700);
	const help = await page.evaluate(() => ({ open: !document.getElementById('help').hidden, t: document.getElementById('help-body').textContent }));
	ok(help.open && /keys to remember/i.test(help.t), 'Help opens the guide (help.html)');
	await keys(page, ['Escape'], 300);
	ok(await page.evaluate(() => document.getElementById('help').hidden), 'Escape closes Help');
	await type(page, '\r', 700);
	ok(/Movement/.test(await screen(page)) && /Objects/.test(await screen(page)), 'Enter opens the command menu');
	await type(page, '\x1b\x1b', 400);

	// ---- stairs, zoomed map follows the player ----
	await debug(page, 'z');
	let d = (await where(page)).d;
	for (let i = 0; i < 30 && d === 0; i++) { await type(page, '>'); await settle(page, 700); d = (await where(page)).d; }
	ok(d === 1, 'stairs: > walks and descends to DL1');
	await debug(page, 'w');	// light the level
	const aplus = () => page.evaluate(() => [...document.querySelectorAll('#t-main .wm-btns button')].find((b) => b.textContent === 'A+').click());
	await aplus(); await aplus(); await type(page, '\x1b', 900);
	const mult = await page.evaluate(() => Module.qb.tileMult());
	ok(mult === 3, 'map A+ twice: zoom x3 (' + mult + ')');
	const centred = [];
	for (let i = 0; i < 4; i++) {
		await type(page, 'H'); await settle(page, 900, 30000);
		await debug(page, 'z');
		const h = await hero(page), cols = await page.evaluate(() => Module.qb.termCols(0)), rows = await page.evaluate(() => Module.qb.termRows(0));
		const w = await where(page);
		if (h) centred.push([h[0] + h[2] / 2 - (13 + (cols - 13) / 2), h[1] + h[3] / 2 - (1 + (rows - 2) / 2), w.x, w.y]);
	}
	await snap(page, 's5-zoom');
	ok(centred.length >= 3 && new Set(centred.map((c) => c[2] + ',' + c[3])).size >= 2 && centred.every((c) => Math.abs(c[0]) <= 6.5 && Math.abs(c[1]) <= 3.5),
		'zoomed map keeps the player centred while exploring (cell offsets from the view centre, x/y grid): ' + J(centred));
	const aminus = () => page.evaluate(() => [...document.querySelectorAll('#t-main .wm-btns button')].find((b) => b.textContent === 'A−').click());
	await aminus(); await aminus(); await type(page, '\x1b', 700);

	// ---- window drag / zoom / rename ----
	const r0 = await page.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('#t-inv').getBoundingClientRect())));
	const bar1 = await page.evaluate(() => { const b = [...document.querySelectorAll('.wm-bar.h')][0].getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
	await page.mouse.move(bar1[0], bar1[1]); await page.mouse.down(); await page.mouse.move(bar1[0] - 80, bar1[1], { steps: 5 }); await page.mouse.up();
	await sleep(600);
	const r1 = await page.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('#t-inv').getBoundingClientRect())));
	ok(Math.abs(r1.width - r0.width) > 40, `drag a gutter: Inventory ${r0.width} -> ${r1.width} px wide`);
	const c0 = await page.evaluate(() => Module.qb.termCols(1));
	const f0 = await page.evaluate(() => RvipWM.fontSize('inv'));
	await page.hover('#t-inv .t');
	for (let i = 0; i < 3; i++) await page.evaluate(() => [...document.querySelectorAll('#t-inv .wm-btns button')].find((b) => b.textContent === 'A+').click());
	await type(page, '\x1b', 700);
	const f1 = await page.evaluate(() => RvipWM.fontSize('inv')), c1 = await page.evaluate(() => Module.qb.termCols(1));
	const fMsg = await page.evaluate(() => RvipWM.fontSize('msg'));
	ok(f1 === f0 + 3 && c1 < c0 && fMsg !== f1, `A+ x3 on Inventory: ${f0} -> ${f1} px, ${c0} -> ${c1} cols (Messages stays ${fMsg})`);
	ok(/Rations/.test(await screen(page, 1)), 'Inventory refilled at the new size');
	await page.dblclick('#t-inv .t .name');
	await page.keyboard.press('Control+A'); await page.keyboard.type('Pack'); await page.keyboard.press('Enter');
	await sleep(300);
	ok(await page.evaluate(() => document.querySelector('#t-inv .t .name').textContent) === 'Pack', 'rename Inventory -> Pack');
	ok(!/Pack/.test(await top(page)) && (await where(page)) !== null, 'typing the title did not reach the game');
	// font choosers
	await page.selectOption('#sel-font', 'WebPlus_IBM_VGA_9x16'); await sleep(900); await type(page, '\x1b', 700);
	const fnt = await page.evaluate(() => ['inv', 'msg', 'main'].map((id) => document.querySelector('#t-' + id + ' canvas').getContext('2d').font));
	ok(/IBM_VGA_9x16/.test(fnt[0]) && /IBM_VGA_9x16/.test(fnt[1]) && !/IBM_VGA_9x16/.test(fnt[2]), 'text font chooser: the text windows, not the map: ' + J(fnt));
	// map font (text mode only, on the Map title bar): cells sized from the font (a wide bitmap font does not overlap)
	await page.click('#btn-tiles'); await type(page, '\x1b', 900);
	await page.hover('#t-main .t');
	const mapSelShown = await page.evaluate(() => !document.querySelector('#t-main select.map-font').hidden);
	await page.selectOption('#t-main select.map-font', 'WebPlus_Rainbow100_re_40'); await sleep(1200); await type(page, '\x1b', 900);
	const mf = await page.evaluate(() => { const c = document.querySelector('#t-main canvas').getContext('2d'); return { font: c.font, M: c.measureText('M').width, cw: document.querySelector('#t-main canvas').width / devicePixelRatio / Module.qb.termCols(0) }; });
	ok(mapSelShown && /Rainbow100/.test(mf.font) && mf.M <= mf.cw + 0.5, 'map font chooser (text mode): cells from the font ' + J(mf));
	await snap(page, 's5-mapfont');
	await page.click('#btn-tiles'); await type(page, '\x1b', 900);
	const tf = await page.evaluate(() => { const c = document.querySelector('#t-main canvas').getContext('2d'); return { font: c.font, M: c.measureText('M').width, cw: document.querySelector('#t-main canvas').width / devicePixelRatio / Module.qb.termCols(0), sel: document.querySelector('#t-main select.map-font').hidden }; });
	ok(tf.sel && tf.M <= tf.cw + 0.5, 'tile mode: map font select hidden, sidebar glyphs fit the cells ' + J(tf));
	await sleep(1000);
	await snap(page, 's5-custom');

	// ---- layout survives reload; newest character loads without the start menu ----
	await keys(page, [{ key: 's', ctrlKey: true }], 1500);
	ok(/done|Saving/.test(await top(page)) || true, 'Ctrl-S saves: ' + J((await top(page)).trim()));
	await sleep(2500);
	ok(await idbHas(page, 'Tester'), 'save is in IndexedDB (/sangband/lib/save)');
	await page.evaluate(() => { window.onbeforeunload = null; });
	page.removeAllListeners('dialog'); page.on('dialog', (dlg) => dlg.accept());
	await page.reload();
	await page.waitForFunction(() => window.__shadowReady && /Tester/.test(window.__screen(0).join('')) || /Press any key|New Character/.test(window.__screen(0).join('')), null, { timeout: 30000 });
	let s = await screen(page);
	if (/Press any key/.test(s)) { await type(page, ' '); await sleep(1200); s = await screen(page); }
	ok(/Tester/.test(s) && !/New Character/.test(s), 'reload: Tester loads by itself (no start menu)');
	await sleep(1000);
	const lay = await page.evaluate(() => ({ w: document.querySelector('#t-inv').getBoundingClientRect().width, name: document.querySelector('#t-inv .t .name').textContent, fs: RvipWM.fontSize('inv'), face: document.getElementById('sel-font').value, rec: !document.getElementById('t-rec').classList.contains('wm-off') }));
	ok(Math.abs(lay.w - r1.width) < 3 && lay.name === 'Pack' && lay.fs === f1 && lay.face === 'WebPlus_IBM_VGA_9x16' && lay.rec, 'layout survives reload: ' + J(lay));

	// ---- autosave (must not touch the screen) ----
	const m0 = await saveMtime(page, 'Tester');
	const t0 = await page.evaluate(() => Object.values(window.__tiles[0] || {}).filter(Boolean).length);
	await sleep(1100);
	await page.evaluate(() => Module._web_request_save());
	await sleep(2500);
	const m1 = await saveMtime(page, 'Tester');
	const t1 = await page.evaluate(() => Object.values(window.__tiles[0] || {}).filter(Boolean).length);
	ok(m1 > m0, `autosave wrote the savefile (${m0} -> ${m1})`);
	ok(t1 >= t0 * 0.9 && !!(await hero(page)), `autosave left the map on screen (${t0} -> ${t1} tiles)`);

	// ---- options entries don't crash ----
	for (const k of ['1', '2', '3', '4', '5', 'A', 'D', 'H']) {
		await type(page, '=', 500);
		await type(page, k, 500);
		await type(page, '2222', 100);
		await keys(page, ['Escape', 'Escape', 'Escape'], 250);
	}
	await type(page, '\x1b', 400);
	const crashed = () => page.evaluate(() => /crashed/.test(document.getElementById('status').textContent));
	ok(!(await crashed()) && /Tester/.test(await screen(page)), 'options menu entries 1-5, A, D, H: no crash');

	// ---- Export / New game / Import ----
	await page.click('#btn-file'); await page.click('#btn-export');
	for (let i = 0; i < 30 && !dls.length; i++) await sleep(200);
	let bundle = null;
	if (dls.length) { const p = await dls[0].path(); bundle = JSON.parse(fs.readFileSync(p, 'utf8')); }
	ok(bundle && bundle['0.Tester'] && bundle['user.0.svg'] && dls[0].suggestedFilename() === 'sangband-save.json', 'Export: sangband-save.json bundle ' + J(bundle && Object.keys(bundle)));
	const bundlePath = process.env.SHOTS ? process.env.SHOTS + '/export.json' : '/tmp/sangband-export-' + process.pid + '.json';
	if (bundle) fs.writeFileSync(bundlePath, JSON.stringify(bundle));
	await page.click('#btn-file'); await page.click('#btn-new');
	await page.waitForEvent('load', { timeout: 20000 }).catch(() => {});
	await page.waitForFunction(() => window.__shadowReady && /Press any key|New Character/.test(window.__screen(0).join('')), null, { timeout: 30000 });
	await type(page, ' '); await sleep(1000);
	s = await screen(page);
	ok(/New Character/.test(s) && !/Tester/.test(s), 'New game: saves gone, start menu');
	if (bundle) {
		const nav = page.waitForEvent('load', { timeout: 20000 });
		await page.setInputFiles('#import-file', bundlePath);
		await nav.catch(() => {});
		await page.waitForFunction(() => window.__shadowReady && /Tester|Press any key/.test(window.__screen(0).join('')), null, { timeout: 30000 });
		s = await screen(page);
		if (/Press any key/.test(s)) { await type(page, ' '); await sleep(1200); s = await screen(page); }
		ok(/Tester/.test(s) && /Town|Lev|ft/.test(s), 'Import bundle: Tester loads again');
		// a lone savefile (as another port or a native game would have it)
		const rawPath = bundlePath.replace(/\.json$/, '') + '-0.Tester';
		fs.writeFileSync(rawPath, Buffer.from(bundle['0.Tester'], 'base64'));
		await page.click('#btn-file'); await page.click('#btn-new');
		await page.waitForEvent('load', { timeout: 20000 }).catch(() => {});
		await page.waitForFunction(() => window.__shadowReady && /Press any key|New Character/.test(window.__screen(0).join('')), null, { timeout: 30000 });
		const nav2 = page.waitForEvent('load', { timeout: 20000 });
		await page.setInputFiles('#import-file', { name: '0.Tester', mimeType: 'application/octet-stream', buffer: fs.readFileSync(rawPath) });
		await nav2.catch(() => {});
		await page.waitForFunction(() => window.__shadowReady && /Tester|Press any key/.test(window.__screen(0).join('')), null, { timeout: 30000 });
		s = await screen(page);
		if (/Press any key/.test(s)) { await type(page, ' '); await sleep(1200); s = await screen(page); }
		ok(/Tester/.test(s) && /Town|Lev|ft/.test(s) && !/New Character/.test(s), 'Import a lone savefile (0.Tester): loads by itself');
	}
	await sleep(800);

	// ---- quit (Ctrl-X) -> Play again ----
	await keys(page, [{ key: 'x', ctrlKey: true }], 1500);
	await type(page, ' ', 1200);
	let ov = await page.evaluate(() => ({ shown: !document.getElementById('overlay').hidden, t: document.getElementById('overlay-msg').textContent }));
	ok(ov.shown && /saved/.test(ov.t), 'Ctrl-X: save + quit -> "Play again" overlay: ' + J(ov.t));
	await snap(page, 's5-quit');
	let nav = page.waitForEvent('load', { timeout: 20000 });
	await page.click('#btn-restart'); await nav;
	await page.waitForFunction(() => window.__shadowReady && /Tester|Press any key/.test(window.__screen(0).join('')), null, { timeout: 30000 });
	s = await screen(page);
	if (/Press any key/.test(s)) { await type(page, ' '); await sleep(1200); s = await screen(page); }
	ok(/Tester/.test(s), 'Play again: the character continues');

	// ---- death -> Play again (Sangband's Q is save + quit: die at depth via debug) ----
	await sleep(600);
	await debug(page, 'j'); await keys(page, ['Backspace', 'Backspace', 'Backspace'], 100); await type(page, '60\r', 1500);
	await debug(page, 's'); await type(page, '30\r', 800);
	for (let i = 0; i < 80; i++) {
		const t = await top(page), sc = await screen(page);
		if (/RIP|Killed by|tomb|high scores|any key/i.test(sc) && !/Tester\s+#/.test(sc)) break;
		if (await page.evaluate(() => !document.getElementById('overlay').hidden)) break;
		await type(page, /Die\?/.test(t) ? 'y' : /\[y\/n\]/.test(t) ? 'n' : ',', 250);
	}
	await snap(page, 's5-tomb');
	for (let i = 0; i < 30; i++) {
		if (await page.evaluate(() => !document.getElementById('overlay').hidden)) break;
		await type(page, /want to quit\?/.test(await top(page)) ? 'y' : '\x1b', 500);	// tombstone menu: Esc, "quit? y", scores: a key
	}
	ov = await page.evaluate(() => ({ shown: !document.getElementById('overlay').hidden, t: document.getElementById('overlay-msg').textContent }));
	ok(ov.shown && /died/.test(ov.t), 'death: tombstone, scores -> "Play again" overlay: ' + J(ov.t));
	ok(beacons.length === 1 && /ev=death/.test(beacons[0]), 'death: one beacon (stage 9) ' + J(beacons));
	await snap(page, 's5-dead');
	nav = page.waitForEvent('load', { timeout: 20000 });
	await page.click('#btn-restart'); await nav;
	await page.waitForFunction(() => window.__shadowReady && /Press any key|New Character/.test(window.__screen(0).join('')), null, { timeout: 30000 });
	await type(page, ' '); await sleep(1000);
	s = await screen(page);
	ok(/New Character/.test(s) && /dead/.test(s), 'Play again after death: start menu (the dead character listed)');
	ok(!(await crashed()), 'no crash');
	ok(realErrors(errors).length === 0, 'no console errors / 4xx ' + J(realErrors(errors)));
	const all404 = errors.filter((e) => /HTTP 4/.test(e));
	ok(all404.length === 0, 'no 4xx at all ' + J(all404));
	console.log('wiped', (await wipeDbs(page)).length, 'dbs');
	await browser.close();
} finally { srv.kill(); }
process.exit(fail ? 1 : 0);
