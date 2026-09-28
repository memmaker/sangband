// Stage 6: docs (help.html from make-help.py) and sound + music.
// Help: every section, keys box, both keysets, links, Escape; the guide's
// game claims (tutorial prompt, starting kit, skills screen keys and costs,
// Oath and realm texts) against the running game.
// Audio: off by default and nothing fetched; a real click on Sound effects
// makes game events request sound/*; Music requests the jukebox's town
// tune, the dungeon brings another theme; choices survive a reload; off stops.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node stage6.mjs  (SHOTS=<dir> for screenshots)
import { realErrors, serve, open, screen, sleep, keys, type, waitText, birth, where } from './lib.mjs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const snap = async (page, n) => { if (shot(n)) await page.screenshot({ path: shot(n) }); };
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const { browser, page, errors } = await open();
const reqs = [];
page.on('request', (r) => { const u = r.url(); if (/\/(sound|music)\//.test(u)) reqs.push(u.replace(/^.*\/sangband\//, '')); });
const audioReqs = (re) => reqs.filter((u) => re.test(u));
const town = /music\/(elven_town|caravanserai|evfalls|shopping)\.ogg/;
const dungeon = /music\/(bree-ragtime|prelude|lothlor2|missclr1|orielwin|orc-town|saraband|module3|barddanc|cirith-ungol|firecave|fall|battle1|battle101)\.ogg/;
try {
	/* ---------- audio off by default ---------- */
	await birth(page);
	const def = await page.evaluate(() => ({ s: document.getElementById('chk-sound').checked, m: document.getElementById('chk-music').checked,
		sd: document.getElementById('chk-sound').disabled, md: document.getElementById('chk-music').disabled }));
	ok(!def.s && !def.m && !def.sd && !def.md, 'audio: both checkboxes off by default and enabled (audio.json) ' + JSON.stringify(def));

	/* ---------- guide claims in the game ---------- */
	let s = await screen(page);
	ok(/If you press '\?' now, you can start a Sangband tutorial/.test(s), 'guide: tutorial offered right after birth');
	await type(page, '?'); s = await waitText(page, /stores happy to sell/);
	ok(/stores happy to sell/.test(s), 'guide: ? opens the tutorial');
	await type(page, '\x1b', 400); await type(page, '\x1b', 400);
	s = await screen(page);
	ok(/EXP\s+3/.test(s), 'guide: sidebar EXP = unspent experience (3 at start)');
	await type(page, 'i', 500); s = await screen(page);
	ok(/Rations of Food/.test(s) && /Wooden Torch/.test(s) && !/Sling|Dagger|Sword/.test(s), 'guide: starting pack food + torches, no weapon');
	await type(page, '\x1b', 400);
	await type(page, 'e', 500); s = await screen(page);
	console.log('     equipment: ' + s.split('\n').slice(0, 4).join(' | ').replace(/\s+/g, ' '));
	await type(page, '\x1b', 400);
	await type(page, '$', 800); s = await screen(page);
	ok(/\+\/=\) Advance skills/.test(s) && /RETURN\) Accept/.test(s) && /ESC\) Cancel/.test(s) && /Power:/.test(s), 'guide: $ skills screen (+/= advance, Enter accept, Esc cancel, Power)');
	ok(/a\) Swordsmanship/.test(s) && /:\) Shapechange/.test(s) && /h\) Wrestling/.test(s) && /g\) Throwing/.test(s), 'guide: skills a-z and : (27)');
	await type(page, 'h', 300); await type(page, '+', 500); s = await screen(page);
	if (/\[y\/n\]/.test(s)) { await type(page, 'y', 500); s = await screen(page); }
	ok(/h\) Wrestling\s*:\s*[1-9]/.test(s) || /Wrestling\s*:\s*1/.test(s), 'guide: + raises Wrestling');
	await type(page, '-', 500); s = await screen(page);
	ok(/Unspent XP: 3/.test(s), 'guide: - lowers it again, experience refunded');
	await type(page, '+', 500); s = await screen(page);
	if (/\[y\/n\]/.test(s)) await type(page, 'y', 500);
	await type(page, '\r', 800); s = await screen(page);
	if (/\[y\/n\]/.test(s)) { await type(page, 'y', 800); s = await screen(page); }
	ok(/EXP\s+[0-2]\b/.test(s), 'guide: Enter keeps the raised skill (EXP now ' + (/EXP\s+(\d+)/.exec(s) || [])[1] + ')');
	await type(page, '\x1b', 300);
	await type(page, 'R', 400); s = await screen(page);
	ok(/'\*' for HP\/SP, '&' as needed/.test(s), 'guide: R prompt has & and *');
	await type(page, '\x1b', 300);

	/* no audio fetched while off (sounds happened: eat, skills, store...) */
	await keys(page, ['E'], 500); await type(page, 'a', 600); await type(page, '\x1b', 300);
	ok(reqs.length === 0, 'audio: nothing fetched while off (' + reqs.length + ')');

	/* ---------- help ---------- */
	await page.click('#btn-help'); await sleep(800);
	const h = await page.evaluate(() => {
		const b = document.getElementById('help-body');
		return { open: !document.getElementById('help').hidden, t: b.textContent, html: b.innerHTML,
			ids: [...b.querySelectorAll('h2')].map((e) => e.id), toc: b.querySelectorAll('.toc a').length,
			box: !!b.querySelector('.box.key'), grid: !!b.querySelector('.grid .box'), all: b.querySelectorAll('.all div').length,
			links: [...b.querySelectorAll('a[href^="http"]')].map((a) => a.href) };
	});
	await snap(page, 'help');
	ok(h.open, 'help: opens');
	ok(['h-about', 'h-keys', 'h-saving', 'h-tips', 'h-guide', 'h-web', 'h-credits', 'h-version'].every((i) => h.ids.includes(i)) && h.toc === 8, 'help: all 8 sections + toc ' + h.ids.join(','));
	ok(h.box && h.grid && h.all > 80, 'help: keys box, essentials grid, complete list (' + h.all + ' rows) with the page classes');
	ok(/Auto-explore/.test(h.t) && /Command menu/.test(h.t) && /\(roguelike keyset\)/.test(h.t) && /Dig a Tunnel \(roguelike keyset\)/.test(h.t), 'help: both keysets in the list');
	ok(/IndexedDB/.test(h.t) && /Export save/.test(h.t) && /every two minutes/.test(h.t), 'help: saving written for the web');
	ok(/skills screen/.test(h.t) && /Oath of Iron/.test(h.t) && /Similar skills help/.test(h.t), 'help: new-player guide explains skills');
	ok(h.links.includes('https://github.com/memmaker/sangband/compare/230e028...main') && h.links.includes('https://github.com/memmaker/sangband/tree/230e028') &&
		h.links.some((l) => /code\.google\.com\/archive\/p\/skills-angband/.test(l)) && /svn trunk r313/.test(h.t) && /sangband_source_102\.zip/.test(h.t), 'help: About this version links');
	ok(/Leon Marrick/.test(h.t) && /GPL version 2/.test(h.t) && /Dubtrain/.test(h.t) && /Reenen Laurie/.test(h.t), 'help: credits + licence');
	await keys(page, ['Escape'], 400);
	ok(await page.evaluate(() => document.getElementById('help').hidden), 'help: Escape closes');

	/* ---------- sound on (a real click: user gesture) ---------- */
	await page.click('#btn-audio'); await sleep(200);
	await page.click('#chk-sound'); await sleep(300);
	await page.mouse.click(5, 300); await sleep(200);   /* close the menu */
	await keys(page, ['E'], 500); await type(page, 'a', 1200); await type(page, '\x1b', 300);
	const eat = audioReqs(/sound\//);
	ok(eat.length > 0, 'sound: eating requests a sample: ' + eat.slice(0, 3).join(' '));
	ok(eat.some((u) => /Mmm\.wav/.test(u)), 'sound: eat = the game\'s own Mmm.wav');
	/* Dubtrain gap: stairs_down has no own sample */
	reqs.length = 0;
	const w0 = await where(page);
	await type(page, '>', 1500);
	for (let i = 0; i < 20 && (await where(page)).d === 0; i++) await type(page, '>', 1200);
	const w1 = await where(page);
	ok(w0.d === 0 && w1.d > 0, 'sound: went down to DL' + w1.d);
	ok(audioReqs(/sound\/.*\.mp3/).length > 0, 'sound: a Dubtrain sample for a gap event: ' + audioReqs(/sound\//).join(' '));
	ok(audioReqs(/music\//).length === 0, 'music: still off, nothing fetched');

	/* ---------- music on ---------- */
	await page.click('#btn-audio'); await sleep(200);
	await page.click('#chk-music'); await sleep(1500);
	await page.mouse.click(5, 300); await sleep(200);
	const m1 = audioReqs(/music\//);
	ok(m1.some((u) => dungeon.test(u)), 'music: dungeon theme requested at once: ' + m1.join(' '));
	const st = await page.evaluate(() => { const a = [...document.querySelectorAll('audio')]; return 1; });
	/* back up to town: the jukebox changes at once (+100 at a new level) */
	reqs.length = 0;
	for (let i = 0; i < 20 && (await where(page)).d > 0; i++) await type(page, '<', 1200);
	await sleep(1500);
	ok((await where(page)).d === 0 && audioReqs(town).length > 0, 'music: town tune in town: ' + audioReqs(/music\//).join(' '));

	/* ---------- persisted in the layout file ---------- */
	await keys(page, [{ key: 's', ctrlKey: true }], 1500);
	await page.reload();
	await page.waitForFunction(() => window.Module && Module.qb && window.__shadowReady, null, { timeout: 30000 });
	await sleep(3000);
	const kept = await page.evaluate(() => ({ s: document.getElementById('chk-sound').checked, m: document.getElementById('chk-music').checked }));
	ok(kept.s && kept.m, 'audio: choices survive a reload ' + JSON.stringify(kept));
	/* off again */
	await page.click('#btn-audio'); await sleep(200);
	await page.click('#chk-music'); await page.click('#chk-sound'); await sleep(300);
	await page.mouse.click(5, 300); await sleep(200);
	reqs.length = 0;
	await keys(page, ['E'], 500); await type(page, 'a', 800); await type(page, '\x1b', 300);
	ok(reqs.length === 0, 'audio: off again, nothing fetched');
	ok(await page.evaluate(() => { const L = JSON.parse(Module.FS.readFile('/sangband/web/web-layout.json', { encoding: 'utf8' })); return L.audio && L.audio.sound === false && L.audio.music === false; }).catch(() => false), 'audio: layout file holds the off state');
	const dec = await page.evaluate(() => Promise.all(['sound/Mmm.wav', 'sound/plc_miss_swish.mp3', 'music/elven_town.ogg', 'music/shopping.ogg'].map((u) => new Promise((res) => {
		const a = new Audio(u); a.onloadedmetadata = () => res(u + ' ' + a.duration.toFixed(1) + 's'); a.onerror = () => res(u + ' ERROR'); setTimeout(() => res(u + ' timeout'), 5000);
	}))));
	ok(dec.every((d) => / [0-9.]+s$/.test(d)), 'audio: wav, mp3 and ogg decode in Chromium: ' + dec.join(', '));
	ok(realErrors(errors).length === 0, 'no console errors / 4xx: ' + realErrors(errors).join(' | '));
} catch (e) {
	console.log('FAIL exception: ' + e.stack);
	fail++;
} finally {
	await browser.close();
	srv.kill();
}
console.log(fail ? `${fail} FAILED` : 'all ok');
process.exit(fail ? 1 : 0);
