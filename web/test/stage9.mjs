// Stage 9: graveyard + leaderboard beacon (roguelikes-index/server/CONTRACT.md).
// Hook: files.c close_game() -> main-web.c web_run_end() -> js_beacon -> RvipWM.report.
// Beacons are captured at the network (page.route on /roguelikes/beacon) and at
// RvipWM.report (wrapped). Runs: death (debug DL60 + summons), win (debug-summoned
// Morgoth (DL101) with its hit points poked to 0 in the wasm heap, killed in melee, then
// 'Q' retire), quit (ironman character: 'Q' = suicide) with the outbox test
// (503 -> one URL with id/at kept in localStorage 'rvip-outbox'; 204 +
// RvipWM.flush() -> the same URL sent, outbox empty), plain save & quit
// ('Q' of a normal character) sends nothing.
// SRV=<served folder> PORT=<port> PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node stage9.mjs
import { realErrors, serve, open, screen, sleep, keys, type, waitText, wipeDbs, where } from './lib.mjs';
import fs from 'fs';
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const J = JSON.stringify;
const top = async (page) => (await screen(page)).split('\n')[0] || '';
const KILLERS = process.env.KILLERS || '/home/user/roguelikes/killers/sangband';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '-');

async function debug(page, k) {	// debug command ^A k
	await keys(page, [{ key: 'a', ctrlKey: true }], 300);
	const q = await waitText(page, /Are you sure|Debug Command/);
	if (/Are you sure/.test(q)) { await type(page, 'y'); await waitText(page, /Debug Command/); }
	await type(page, k, 500);
}

// Fresh character (as lib.mjs birth(), optionally ironman via the '=' birth options)
async function birth(page, name, ironman = false) {
	await wipeDbs(page); await page.reload();
	await page.waitForFunction(() => window.__shadowReady && window.__screen(0).join('').includes('Press any key'), null, { timeout: 30000 });
	await wrapReport(page);
	await type(page, ' '); await waitText(page, /a\) New Character/);
	await type(page, 'a'); await waitText(page, /Choose a gender/);
	if (ironman) {
		await type(page, '=', 800); await waitText(page, /ironman_play/);
		await type(page, '2y', 300); await type(page, '\x1b', 800);
		await waitText(page, /Type\s+:\s+Ironman/);
	}
	await type(page, 'a'); await waitText(page, /Choose a race/);
	await type(page, 'a'); await waitText(page, /Enter minimum value/);
	await type(page, '\r\r\r\r\r\r'); await waitText(page, /Accept these odds/);
	await type(page, 'y'); await waitText(page, /Return to accept/);
	await type(page, '\r'); await waitText(page, /Enter a name/);
	await keys(page, Array(8).fill('Backspace'));
	await type(page, name + '\r'); await waitText(page, /any other key to continue/);
	await type(page, ' ');
	return waitText(page, new RegExp(name + '[\\s\\S]*Town'));
}

// Record every RvipWM.report(q) call (the game side of the beacon)
async function wrapReport(page) {
	await page.evaluate(() => {
		window.__reports = [];
		const r = window.RvipWM.report;
		window.RvipWM.report = function (q) { window.__reports.push(q); return r.apply(this, arguments); };
	});
}
const reports = (page) => page.evaluate(() => window.__reports || []);
const outbox = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('rvip-outbox') || '[]'));
const overlay = (page) => page.evaluate(() => !document.getElementById('overlay').hidden);

// Answer screens/prompts until the page overlay ("Sangband has ended") shows
async function toOverlay(page, n = 60) {
	for (let i = 0; i < n; i++) {
		if (await overlay(page)) return true;
		const t = await top(page);
		await type(page, /want to quit\?|Die\?/.test(t) ? 'y' : /\[y\/n\]/.test(t) ? 'n' : '\x1b', 400);
	}
	return overlay(page);
}
const params = (u) => Object.fromEntries(new URL(u, 'http://x').searchParams);

// The monster's struct in the wasm heap (types.h monster_type: s16b r_idx; byte fy, fx; s16b hp, maxhp;
// byte csleep, mspeed, energy, mana, stunned)
async function pokeMonster(page, r_idx, near) {
	return page.evaluate(([r_idx, near]) => {
		const H = Module.HEAPU8, v = new DataView(H.buffer), hits = [];
		for (let a = 0; a + 8 < H.length; a += 2) {
			if (v.getInt16(a, true) !== r_idx) continue;
			const y = H[a + 2], x = H[a + 3], hp = v.getInt16(a + 4, true), mhp = v.getInt16(a + 6, true);
			if (Math.abs(y - near.y) <= 1 && Math.abs(x - near.x) <= 1 && mhp >= 1000 && hp <= mhp && hp >= 0) hits.push({ a, y, x, hp, mhp });
		}
		// 0 hp, asleep, speed 1 and no energy (it never acts), stunned
		for (const h of hits) { v.setInt16(h.a + 4, 0, true); H[h.a + 8] = 255; H[h.a + 9] = 1; H[h.a + 10] = 0; H[h.a + 12] = 255; }
		return hits;
	}, [r_idx, near]);
}

let beacons = [], mode = 204;
try {
	const { browser, context, page, errors } = await open();
	await context.route('**/roguelikes/beacon**', (route) => {
		beacons.push(route.request().url());
		route.fulfill(mode === 204 ? { status: 204 } : { status: 503, body: 'down' });
	});
	await page.evaluate(() => localStorage.removeItem('rvip-outbox'));

	// ---- plain save & quit ('Q' of a normal character): no beacon ----
	await birth(page, 'Saver');
	await sleep(500);
	await type(page, 'Q', 1500);
	ok(await toOverlay(page), 'Q (normal character): save + quit -> overlay');
	ok(/saved/.test(await page.evaluate(() => document.getElementById('overlay-msg').textContent)), 'overlay says saved');
	await sleep(500);
	ok(beacons.length === 0 && (await reports(page)).length === 0, 'plain save & quit sends nothing ' + J(beacons));

	// ---- death: debug DL60 + summons ----
	await birth(page, 'Dier');
	await sleep(500);
	await debug(page, 'j'); await keys(page, ['Backspace', 'Backspace', 'Backspace'], 100); await type(page, '60\r', 1500);
	await debug(page, 's'); await type(page, '30\r', 800);
	for (let i = 0; i < 120 && !(await reports(page)).length; i++) {
		const t = await top(page);
		await type(page, /Die\?/.test(t) ? 'y' : /\[y\/n\]/.test(t) ? 'n' : ',', 250);
	}
	let R = await reports(page);
	ok(R.length === 1, 'death: one RvipWM.report ' + J(R));
	ok(await toOverlay(page), 'death: tombstone -> overlay');
	await sleep(1000);
	ok(beacons.length === 1, 'death: one beacon request ' + J(beacons));
	let p = params(beacons[0] || '');
	console.log('     death beacon', J(p));
	ok(p.g === 'sangband' && p.ev === 'death' && p.name === 'Dier', 'death: g, ev, name');
	ok(p.killer && !/^(a|an|the) /i.test(p.killer) && !/^\(/.test(p.killer), 'death: killer without article: ' + p.killer);
	ok(p.depth === '60', 'death: depth 60');
	ok(/^\d+$/.test(p.score) && /^\d+$/.test(p.turns) && +p.turns > 0 && /^\d+$/.test(p.lvl) && +p.lvl >= 1, 'death: score, turns, lvl (power) numbers');
	ok(/^[a-z0-9]+$/.test(p.id) && /^\d{13}$/.test(p.at), 'death: id + at from RvipWM');
	ok(fs.existsSync(`${KILLERS}/${slug(p.killer || '')}.png`), `killer art ${slug(p.killer || '')}.png exists`);
	ok((await outbox(page)).length === 0, 'death: outbox empty after 204');

	// ---- win: Morgoth summoned next to the hero, hit points poked to 0, killed; 'Q' retires ----
	beacons = [];
	await birth(page, 'Winner');
	await sleep(500);
	// Morgoth is FORCE_DEPTH (level 100): below the quest level no quest owns him yet
	await debug(page, 'j'); await keys(page, ['Backspace', 'Backspace', 'Backspace'], 100); await type(page, '101\r', 1500);
	// DL101 often generates Morgoth himself (unique: then the summon fails): zap the whole level (count 250)
	await type(page, '0250', 200); await debug(page, 'z');
	let me, hits = [];
	for (let i = 0; i < 4 && !hits.length; i++) {	// a corridor or a vault wall can leave no room next to the hero: teleport, retry
		if (i) { await debug(page, 't'); await type(page, '0250', 200); await debug(page, 'z'); }
		await debug(page, 'n'); await keys(page, ['Backspace', 'Backspace', 'Backspace', 'Backspace'], 100); await type(page, '768', 300);
		await type(page, '\r', 1200);
		me = await where(page); hits = await pokeMonster(page, 768, me);
	}
	ok(hits.length === 1, 'win: Morgoth next to the hero, hp poked ' + J(hits));
	const DIR = { '-1,-1': '7', '-1,0': '8', '-1,1': '9', '0,-1': '4', '0,1': '6', '1,-1': '1', '1,0': '2', '1,1': '3' };
	let won = false;
	for (let i = 0; i < 80 && hits.length; i++) {
		const s = await screen(page);
		if (/Total Winner|Morgoth, Lord of Darkness is (destroyed|dead)|slain Morgoth|vanquished/i.test(s)) won = true;
		const t = await top(page);
		if (won && !/-more-|\[y\/n\]/.test(t)) break;
		if (/-more-/.test(t) || /any key/i.test(s)) { await type(page, ' ', 300); continue; }
		me = await where(page);
		const again = await pokeMonster(page, 768, me);	// keep it at 0 hp and asleep
		if (!again.length && i > 0) { won = true; continue; }
		const h = again[0] || hits[0];
		await type(page, DIR[(h.y - me.y) + ',' + (h.x - me.x)], 350);
	}
	await sleep(500);
	for (let i = 0; i < 10; i++) { const t = await top(page); if (/-more-/.test(t)) await type(page, ' ', 300); else break; }
	const msgs = (await screen(page, 2)).split('\n').map((l) => l.trim()).filter(Boolean);
	console.log('     messages:', J(msgs.slice(-6)));
	ok(won && msgs.some((l) => /Morgoth/.test(l) && /(dies|destroyed|slain|killed|vanquished)/i.test(l)), 'win: Morgoth killed (message log)');
	await type(page, '\x1b', 300);
	await type(page, 'Q', 800);
	const q = await top(page);
	ok(/retire/.test(q), 'win: Q asks "Do you want to retire?": ' + J(q.trim()));
	await type(page, 'y', 1500);
	for (let i = 0; i < 40 && !(await reports(page)).length; i++) await type(page, ' ', 300);
	R = await reports(page);
	ok(R.length === 1 && /ev=win/.test(R[0]), 'win: RvipWM.report ev=win ' + J(R));
	ok(await toOverlay(page), 'win: kingly + tombstone -> overlay');
	await sleep(800);
	p = params(beacons[0] || '');
	console.log('     win beacon', J(p));
	ok(beacons.length === 1 && p.ev === 'win' && p.name === 'Winner' && !p.killer && p.depth === '101' && p.score && p.turns && p.lvl && p.id && p.at, 'win: beacon fields (no killer)');
	ok((await outbox(page)).length === 0, 'win: outbox empty after 204');

	// ---- quit: ironman 'Q' = suicide, server down (503) -> outbox, then flush ----
	beacons = []; mode = 503;
	await birth(page, 'Quitter', true);
	await sleep(500);
	await type(page, 'Q', 800);
	ok(/suicide/.test(await top(page)), 'ironman Q asks "Do you really want to suicide?"');
	await type(page, 'y', 600);
	ok(/SUICIDE/.test(await top(page)), 'asks for the @ sign');
	await type(page, '@', 1500);
	for (let i = 0; i < 20 && !(await reports(page)).length; i++) await type(page, ' ', 300);
	R = await reports(page);
	ok(R.length === 1 && /ev=quit/.test(R[0]), 'quit: RvipWM.report ev=quit ' + J(R));
	ok(await toOverlay(page), 'quit: tombstone -> overlay');
	await sleep(800);
	p = params(beacons[0] || '');
	console.log('     quit beacon', J(p));
	ok(p.ev === 'quit' && p.name === 'Quitter' && !p.killer && p.depth === '0', 'quit: fields (no killer)');
	let box = await outbox(page);
	ok(box.length === 1 && /&id=[a-z0-9]+&at=\d+$/.test(box[0]) && beacons.every((u) => u.endsWith(box[0])), '503: one URL with &id=&at= in rvip-outbox ' + J(box));
	mode = 204; const before = beacons.length;
	await page.evaluate(() => RvipWM.flush());
	await sleep(1500);
	const sent = beacons.slice(before);
	ok(sent.length === 1 && sent[0].endsWith(box[0]), '204 + RvipWM.flush(): the same URL sent ' + J(sent));
	ok((await outbox(page)).length === 0, 'outbox empty after the flush');

	ok(realErrors(errors).filter((e) => !/beacon/.test(e)).length === 0, 'no console errors ' + J(realErrors(errors)));
	console.log('wiped', (await wipeDbs(page)).length, 'dbs');
	await page.evaluate(() => localStorage.removeItem('rvip-outbox'));
	await browser.close();
} finally { srv.kill(); }
process.exit(fail ? 1 : 0);
