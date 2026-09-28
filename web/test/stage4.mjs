// Stage 4: tiles (Sangband's own David Gervais 32x32 set) in a running game:
// big map tiles, player sprite, no cursor on the hero, list icons, sidebar
// stays text, flavoured ring, dungeon with unknown grids, map zoom, and the
// Tiles button switching to None (native text) and back.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node stage4.mjs
// SHOTS=<dir> writes screenshots (map crops at cell size) there.
import { realErrors, serve, open, screen, sleep, keys, type, waitText, birth, where, settle } from './lib.mjs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const J = JSON.stringify;

const tiles = (page, t) => page.evaluate((t) => window.__tiles[t] || {}, t);
const resetTiles = (page) => page.evaluate(() => { window.__tiles = {}; window.__picts = 0; });
const btn = (page) => page.evaluate(() => document.getElementById('btn-tiles').textContent);
// Player sprites: sheet rows 3 and 4 (graf32-g.prf B: lines)
const hero = (T) => Object.entries(T).filter(([, v]) => v && (v[0] === 3 || v[0] === 4) && v[2] === 2);

// A crop of a term's canvas around cell (x, y), radius r cells, at page scale
async function crop(page, t, id, x, y, rx, ry, name) {
	if (!shot(name)) return;
	const g = await page.evaluate(([t, id]) => {
		const cv = document.querySelector('#t-' + id + ' canvas'), r = cv.getBoundingClientRect();
		return { x: r.left, y: r.top, cw: r.width / Module.qb.termCols(t), ch: r.height / Module.qb.termRows(t), w: r.width, h: r.height };
	}, [t, id]);
	const x0 = Math.max(0, (x - rx) * g.cw), y0 = Math.max(0, (y - ry) * g.ch);
	await page.screenshot({ path: shot(name), clip: { x: g.x + x0, y: g.y + y0, width: Math.min(g.w - x0, (2 * rx + 2) * g.cw), height: Math.min(g.h - y0, (2 * ry + 1) * g.ch) } });
}
async function canvasShot(page, id, name) { if (shot(name)) await page.locator('#t-' + id + ' canvas').screenshot({ path: shot(name) }); }

async function debugCmd(page, k) {	// ^A <k>
	await keys(page, [{ key: 'a', ctrlKey: true }], 300);
	const q = await waitText(page, /Are you sure|Debug Command/);
	if (/Are you sure/.test(q)) { await type(page, 'y'); await waitText(page, /Debug Command/); }
	await type(page, k, 400);
}

try {
	const { browser, page, errors } = await open();
	await birth(page, 'Tiles');
	await sleep(500);

	// ---- tiles on by default ----
	ok(/Gervais/.test(await btn(page)), 'Tiles button: ' + J(await btn(page)));
	let T0 = await tiles(page, 0);
	const big = Object.values(T0).filter((v) => v && v[2] === 2 && v[3] === 1);
	ok(big.length > 300, 'town drawn as big tiles (2x1 cells): ' + big.length);
	const odd = Object.entries(T0).filter(([p, v]) => v && +p.split(',')[0] >= 13 && v[2] !== 2);
	ok(odd.length === 0, 'every map tile is a big tile ' + J(odd.slice(0, 3)));
	const side = Object.entries(T0).filter(([p, v]) => v && +p.split(',')[0] < 13);
	ok(side.length === 0, 'sidebar (equippy chars) stays text ' + J(side.slice(0, 3)));
	let H = hero(T0);
	ok(H.length === 1, 'player sprite on the map: ' + J(H));
	const [hx, hy] = H[0][0].split(',').map(Number);
	const curs = await page.evaluate(() => window.__curs);
	ok(!curs || !(curs[0] === 0 && curs[1] === hx && curs[2] === hy), 'no cursor on the hero: last cursor ' + J(curs));
	await crop(page, 0, 'main', hx, hy, 12, 6, 's4-town');

	// ---- lists: Inventory icons (two cells), Visible icons ----
	const inv = await tiles(page, 1);
	const invIcons = Object.entries(inv).filter(([p, v]) => v && v[2] === 2 && p.startsWith('3,'));
	ok(invIcons.length >= 2, 'Inventory: icons at col 3 over two cells: ' + invIcons.length);
	console.log('     Inventory: ' + J((await screen(page, 1)).split('\n').filter((l) => l.trim()).slice(0, 4)));
	await canvasShot(page, 'inv', 's4-inventory');
	const vis = await screen(page, 3);
	const visIcons = Object.values(await tiles(page, 3)).filter((v) => v && v[2] === 2);
	console.log('     Visible: ' + J(vis.split('\n').filter((l) => l.trim()).slice(0, 3)));
	const visRows = vis.split('\n').filter((l) => l.trim()).length;
	ok(visIcons.length > 0 || /no monsters/.test(vis), 'Visible: icons over two cells: ' + visIcons.length + ' (' + visRows + ' rows)');
	await canvasShot(page, 'mon', 's4-visible');

	// ---- look at your own grid: no cursor on the hero ----
	await page.evaluate(() => { window.__curs = null; });
	await type(page, 'l', 600);
	let lc = await page.evaluate(() => window.__curs);
	console.log('     look: ' + J((await screen(page)).split('\n')[0].trim()) + ' cursor ' + J(lc));
	ok(!lc || !(lc[1] === hx && lc[2] === hy), 'look at the hero: no cursor drawn on it');
	await type(page, '\x1b\x1b', 300);

	// ---- a flavoured ring next to the hero ----
	await debugCmd(page, 'c');
	let s = await waitText(page, /\] Ring/);
	const rk = /\[(.)\] Ring/.exec(s)[1];
	await type(page, rk, 400);
	s = await waitText(page, /\[a\]/);
	await type(page, 'a', 600);
	await waitText(page, /how many objects/);
	await type(page, '\r', 800);
	await keys(page, [{ key: '4', code: 'Numpad4' }], 600);	// step off, the ring may lie under us
	await keys(page, [{ key: '6', code: 'Numpad6' }], 600);
	await keys(page, [{ key: 'r', ctrlKey: true }], 800);
	T0 = await tiles(page, 0);
	const rings = Object.entries(T0).filter(([, v]) => v && v[0] === 5);	// ring flavours: sheet row 5
	H = hero(T0);
	ok(rings.length >= 1, 'ring flavour tile on the map: ' + J(rings.slice(0, 2)));
	if (H.length) { const [x, y] = H[0][0].split(',').map(Number); await crop(page, 0, 'main', x, y, 5, 3, 's4-ring'); }

	// ---- look at the ring (target mode, free cursor): the cursor frames the whole big tile ----
	await page.evaluate(() => { window.__curs = null; });
	await type(page, 'l', 500);	// look; 'p' = the player's grid in free mode, a direction moves the cursor
	await type(page, 'p', 400);
	await keys(page, [{ key: '4', code: 'Numpad4' }], 500);
	lc = await page.evaluate(() => window.__curs);
	console.log('     target: ' + J((await screen(page)).split('\n')[0].trim()) + ' cursor ' + J(lc));
	ok(lc && lc[0] === 0 && lc[3] === 2 && lc[4] === 1, 'free look cursor spans the big tile ' + J(lc));
	await type(page, '\x1b\x1b\x1b', 300);

	// ---- dungeon: unknown grids stay black ----
	for (let i = 0; i < 4 && (await where(page)).d === 0; i++) { await type(page, '>', 300); await settle(page, 1200, 20000); }
	ok((await where(page)).d === 1, 'reached DL1: ' + J(await where(page)));
	await keys(page, [{ key: 'r', ctrlKey: true }], 800);
	T0 = await tiles(page, 0);
	const dark = Object.values(T0).filter((v) => v && v[0] === 0 && v[1] === 0).length;
	ok(dark > 100, 'unknown grids drawn as the black darkness tile: ' + dark);
	H = hero(T0);
	if (H.length) { const [x, y] = H[0][0].split(',').map(Number); await crop(page, 0, 'main', x, y, 14, 7, 's4-dungeon'); }
	await canvasShot(page, 'main', 's4-map-full');

	// ---- map zoom (A+ on the Map title bar): 4x2-cell tiles, back ----
	await page.evaluate(() => document.querySelector('#t-main button[title="Bigger text"]').click());
	await sleep(300); await type(page, '\x1b', 800);
	T0 = await tiles(page, 0);
	const z = Object.values(T0).filter((v) => v && v[2] === 4 && v[3] === 2).length;
	ok(z > 50, 'zoomed map: tiles over 4x2 cells: ' + z);
	H = hero(await tiles(page, 0));
	await page.evaluate(() => document.querySelector('#t-main button[title="Smaller text"]').click());
	await sleep(300); await type(page, '\x1b', 800);

	// ---- Tiles: None (native text) ----
	await resetTiles(page);
	await page.evaluate(() => document.getElementById('btn-tiles').click());
	await sleep(300); await type(page, '\x1b', 1200);
	ok(/None/.test(await btn(page)), 'button now: ' + J(await btn(page)));
	const picts = await page.evaluate(() => Object.values(window.__tiles).reduce((n, T) => n + Object.values(T).filter((v) => v).length, 0));
	ok(picts === 0, 'None: no tiles drawn anywhere: ' + picts);
	s = await screen(page);
	ok(/@/.test(s.split('\n').slice(1, -1).join('')), 'None: text map with @');
	const invText = (await screen(page, 1)).split('\n').filter((l) => l.trim());
	ok(/^a\) \S {1,2}\S/.test(invText[0] || ''), 'None: Inventory rows "a) <symbol> name": ' + J(invText[0]));
	await crop(page, 0, 'main', 40, 12, 20, 8, 's4-none');

	// ---- and back to Gervais ----
	await page.evaluate(() => document.getElementById('btn-tiles').click());
	await sleep(300); await type(page, '\x1b', 1200);
	T0 = await tiles(page, 0);
	ok(/Gervais/.test(await btn(page)) && hero(T0).length === 1 && Object.keys(T0).length > 100, 'Gervais again: player sprite + map tiles');
	ok(Object.values(await tiles(page, 1)).some((v) => v && v[2] === 2), 'Gervais again: Inventory icons back');

	// ---- the choice survives a reload ----
	await page.evaluate(() => document.getElementById('btn-tiles').click());
	await sleep(300); await type(page, '\x1b', 800);
	await keys(page, [{ key: 's', ctrlKey: true }], 1500);
	await page.reload();
	await page.waitForFunction(() => window.__shadowReady && window.__screen(0).join('').length > 0, null, { timeout: 30000 });
	ok(/None/.test(await btn(page)), 'after reload the button still says None');
	await page.evaluate(() => document.getElementById('btn-tiles').click());
	await sleep(500);

	ok(realErrors(errors).length === 0, 'no console errors ' + J(realErrors(errors)));
	await browser.close();
} catch (e) {
	console.log('FAIL exception: ' + e.stack);
	fail++;
}
srv.kill();
console.log(fail ? fail + ' FAILED' : 'all ok');
process.exit(fail ? 1 : 0);
