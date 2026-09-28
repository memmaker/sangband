// Shared helpers for the Playwright tests of the Sangband web port.
// Serves $SRV (a folder holding rvip-wm.js, rvip-app.js and sangband/ -> web/dist,
// as on the server) with python3 -m http.server; drives it in headless Chromium
// (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers, NODE_PATH=<dir with playwright@1.56>).
import { createRequire } from 'module';
import { spawn } from 'child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

// Console errors that matter (a missing favicon is not one)
export const realErrors = (errors) => errors.filter((e) => !/Failed to load resource/.test(e) && !/favicon/.test(e));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PORT = +(process.env.PORT || 8791);
export async function serve(port = PORT) {
	if (!process.env.SRV) throw new Error('set SRV to a folder with rvip-*.js and sangband -> web/dist');
	const srv = spawn('python3', ['-m', 'http.server', String(port), '-b', '127.0.0.1', '-d', process.env.SRV], { stdio: 'ignore' });
	await sleep(700);
	return srv;
}

export async function open(port = PORT, opts = {}) {
	const browser = await pw.chromium.launch({ executablePath: process.env.CHROME || undefined });
	const context = opts.context || await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await context.newPage();
	const errors = [];
	page.on('console', (m) => { if (process.env.DEBUG) console.log('[page]', m.type(), m.text()); if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', (e) => errors.push(String(e)));
	page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
	await page.addInitScript(shadowScript);
	await page.goto(`http://127.0.0.1:${port}/sangband/index.html`);
	await page.waitForFunction(() => window.Module && Module.qb && window.__shadowReady && window.__screen(0).length > 0, null, { timeout: 20000 });
	return { browser, context, page, errors };
}

// Text shadow of every term: wrap Module.qb.text/wipe/clear (looked up per call)
function shadowScript() {
	const S = {};
	function row(t, y) { S[t] = S[t] || []; S[t][y] = S[t][y] || []; return S[t][y]; }
	window.__screen = (t) => (S[t] || []).map((r) => (r || []).map((c) => c || ' ').join(''));
	const iv = setInterval(() => {
		if (!window.Module || !Module.qb || Module.qb.__wrapped) return;
		const q = Module.qb, text = q.text, wipe = q.wipe, clear = q.clear, pict = q.pict;
		q.text = function (t, x, y, n, a, s) {
			const r = row(t, y), H = Module.HEAPU8;
			for (let i = 0; i < n; i++) r[x + i] = String.fromCharCode(H[s + i] || 32);
			return text.apply(this, arguments);
		};
		q.wipe = function (t, x, y, n) { const r = row(t, y); for (let i = 0; i < n; i++) r[x + i] = ' '; return wipe.apply(this, arguments); };
		q.clear = function (t) { S[t] = []; return clear.apply(this, arguments); };
		q.pict = function (t, x, y, n, ap, cp) {
			const r = row(t, y), H = Module.HEAPU8;
			window.__picts = (window.__picts || 0) + n;
			for (let i = 0; i < n; i++) { const k = H[cp + i]; r[x + i] = (H[ap + i] & 0x80) ? '#' : String.fromCharCode(k || 32); }
			return pict.apply(this, arguments);
		};
		q.__wrapped = true;
		window.__shadowReady = true;
		clearInterval(iv);
	}, 5);
}

export async function screen(page, t = 0) {
	return (await page.evaluate((t) => window.__screen(t), t)).join('\n');
}

// Keys as the page's onKey sees them: dispatch keydown on document
export async function keys(page, list, delay = 40) {
	for (const k of list) {
		const o = typeof k === 'string' ? { key: k } : k;
		await page.evaluate((o) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, o))), o);
		await sleep(delay);
	}
}
export async function type(page, s, delay = 40) {
	await keys(page, [...s].map((c) => (c === '\r' ? 'Enter' : c === '\x1b' ? 'Escape' : c)), delay);
}

export async function waitText(page, re, t = 0, timeout = 15000) {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		const s = await screen(page, t);
		if (re.test(s)) return s;
		await sleep(100);
	}
	throw new Error('timeout waiting for ' + re + '\n' + (await screen(page, t)));
}

// Delete only this game's IDBFS databases on the test origin
export async function wipeDbs(page) {
	return page.evaluate(async () => {
		const dbs = await indexedDB.databases();
		const out = [];
		for (const d of dbs) if (d.name.startsWith('/sangband/')) { indexedDB.deleteDatabase(d.name); out.push(d.name); }
		return out;
	});
}
