// Resize test (RVIP W10): 1000x650 -> 1440x900 -> 1200x750 (once with a
// prompt open) -> 760x500, then back to the desktop size. Reads every
// shown window's canvas: the game must apply the new shape (cols/rows)
// and a canvas must not be scaled when its window is big enough.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node resize.mjs
import { realErrors, serve, open, screen, sleep, keys, type, waitText, birth, where } from './lib.mjs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const J = JSON.stringify;
const IDS = ['main', 'inv', 'msg', 'mon', 'rec', 'eqp', 'chr'];
// Per shown window: canvas px (intrinsic / dpr), CSS px, body px, cols x rows
const read = (page) => page.evaluate((IDS) => IDS.map((id, t) => {
	const w = document.getElementById('t-' + id);
	if (w.classList.contains('wm-off')) return null;
	const cv = w.querySelector('canvas'), b = w.querySelector('.body'), d = devicePixelRatio;
	return { id, nat: [Math.round(cv.width / d), Math.round(cv.height / d)], css: [cv.getBoundingClientRect().width, cv.getBoundingClientRect().height],
		body: [b.clientWidth, b.clientHeight], cr: [Module.qb.termCols(t), Module.qb.termRows(t)] };
}).filter(Boolean), IDS);
const scaled = (w) => Math.abs(w.css[0] - w.nat[0]) > 1 || Math.abs(w.css[1] - w.nat[1]) > 1;
const fits = (w) => w.nat[0] <= w.body[0] + 1 && w.nat[1] <= w.body[1] + 1;

try {
	const { browser, page, errors } = await open();
	await birth(page);
	await sleep(800);
	for (const [W, H, prompt] of [[1000, 650], [1440, 900], [1200, 750, true], [760, 500], [1440, 900]]) {
		if (prompt) await type(page, 'i', 700);	// the inventory prompt is open while the window changes
		await page.setViewportSize({ width: W, height: H });
		await sleep(600);
		if (prompt) {
			await sleep(800);
			const during = await read(page);
			const m = during.find((w) => w.id === 'main');
			const noClip = m.css[0] <= m.body[0] + 1 && m.css[1] <= m.body[1] + 1;
			ok(noClip && /Inventory/.test((await screen(page)).split('\n')[0]), `${W}x${H} with the inventory prompt open: main ${J(m.cr)} shown ${J(m.css.map(Math.round))} in ${J(m.body)} (no clipping; the new shape waits for the command prompt), prompt still up`);
			await type(page, '\x1b', 400);
		}
		await type(page, '\x1b', 300);	// a key poll at the command prompt applies the main term
		await sleep(900);
		const ws = await read(page);
		const bad = ws.filter((w) => fits(w) ? scaled(w) : false);
		const over = ws.filter((w) => !fits(w) && w.id !== 'main');
		const m = ws.find((w) => w.id === 'main');
		ok(!bad.length && !over.length, `${W}x${H}: ${ws.map((w) => w.id + ' ' + w.cr.join('x') + (scaled(w) ? ' scaled' : '')).join(', ')}` + (bad.length ? ' BAD ' + J(bad) : '') + (over.length ? ' OVER ' + J(over) : ''));
		ok(m.cr[0] >= 80 && m.cr[1] >= 24 && (fits(m) ? !scaled(m) : scaled(m)), `${W}x${H}: main ${m.cr.join('x')} ${fits(m) ? 'at 1:1' : 'CSS-scaled down (window below 80x24)'} canvas ${J(m.nat)} in ${J(m.body)}`);
		ok(/Rations/.test(await screen(page, 1)) && /Tester/.test(await screen(page)), `${W}x${H}: Inventory and map redrawn`);
		if (shot('r-' + W)) await page.screenshot({ path: shot('r-' + W) });
	}
	ok(!(await page.evaluate(() => /crashed/.test(document.getElementById('status').textContent))), 'no crash');
	ok(realErrors(errors).length === 0, 'no console errors ' + J(realErrors(errors)));
	await browser.close();
} finally { srv.kill(); }
process.exit(fail ? 1 : 0);
