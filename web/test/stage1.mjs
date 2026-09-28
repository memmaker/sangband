// Stage 1: birth into the town, random keys, save (Ctrl-X), reload, restore.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node stage1.mjs [seed] [keys]
import { realErrors, serve, open, screen, sleep, keys, type, waitText, wipeDbs } from './lib.mjs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const seed = +(process.argv[2] || 1), N = +(process.argv[3] || 300);
let r = seed; const rnd = (n) => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r % n; };
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const snap = async (page, n) => { if (shot(n)) await page.screenshot({ path: shot(n) }); };
try {
	let { browser, page, errors } = await open();
	await wipeDbs(page); await page.reload();
	await page.waitForFunction(() => window.__shadowReady && window.__screen(0).join('').includes('Press any key'), null, { timeout: 30000 });
	await type(page, ' '); await waitText(page, /a\) New Character/);
	await type(page, 'a'); await waitText(page, /Choose a gender/);
	await type(page, 'a'); await waitText(page, /Choose a race/);
	await type(page, 'a'); await waitText(page, /Enter minimum value/);
	await type(page, '\r\r\r\r\r\r'); await waitText(page, /Accept these odds/);
	await type(page, 'y'); await waitText(page, /Return to accept/);
	await type(page, '\r'); await waitText(page, /Enter a name/);
	await keys(page, Array(8).fill('Backspace'));
	await type(page, 'Tester\r'); await waitText(page, /any other key to continue/);
	await type(page, ' ');
	const town = await waitText(page, /Tester[\s\S]*Town/);
	ok(/HP\s+\d+\/\s*\d+/.test(town) && !/\(\+\)/.test(town), 'birth: in town, no (+) stops');
	await snap(page, 's1-town');

	// Random keys: letters, digits, Escape, Enter (no Ctrl keys, no Q suicide)
	const K = 'abcdefghijklmnoprtuvwxyzBCDEFGIJKLMNOPRTUVWXYZ123456789,.;:<>[]{}()+-/|\\'.split('').concat(Array(20).fill('Escape'), Array(8).fill('Enter'));
	for (let i = 0; i < N; i++) {
		await keys(page, [K[rnd(K.length)]], 15);
		if (i % 50 === 49) await keys(page, Array(4).fill('Escape'), 15);
	}
	await keys(page, Array(8).fill('Escape'), 60);
	const crashed = await page.evaluate(() => /crash/i.test(document.getElementById('status').textContent));
	ok(!crashed, `${N} random keys (seed ${seed}), no crash`);
	await snap(page, 's1-random');

	// Save + quit
	await keys(page, [{ key: 'x', ctrlKey: true }], 300);
	for (let i = 0; i < 8 && await page.evaluate(() => document.getElementById('overlay').hidden); i++) await keys(page, ['Escape'], 700);
	await page.waitForFunction(() => !document.getElementById('overlay').hidden, null, { timeout: 15000 });
	ok(true, 'Ctrl-X: "has ended" overlay');
	await sleep(+(process.env.SYNC_WAIT || 1500));
	const saves = await page.evaluate(() => Module.FS.readdir('/sangband/lib/save'));
	ok(saves.some((s) => /PLAYER|Tester/.test(s)), 'savefile written: ' + saves.join(' '));

	// Reload: the character comes back
	await page.reload();
	await page.waitForFunction(() => window.__shadowReady && window.__screen(0).join('').includes('Press any key'), null, { timeout: 30000 });
	await type(page, ' ');
	// The newest living character loads by itself (no savefile menu, stage 5)
	await waitText(page, /Tester[\s\S]*(Town|Lev \d)/);
	ok(!/New Character/.test(await screen(page)), 'reload: Tester restored without the start menu');
	await snap(page, 's1-restored');
	ok(realErrors(errors).length === 0, 'no console errors ' + JSON.stringify(realErrors(errors)));
	console.log('wiped', (await wipeDbs(page)).length, 'dbs');
	await browser.close();
} finally { srv.kill(); }
process.exit(fail ? 1 : 0);
