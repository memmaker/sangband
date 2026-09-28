// Stage 2: auto-explore (H, and O which also works in the roguelike keyset) and stair walks (< / >) in a running game.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node stage2.mjs
// Positions come from main-web.c web_where() (the map is centred on the
// player, so '@' hardly moves on screen).
// Town: the character starts on the '>'; step off, '>' walks back (monsters
// moving in view stop the walk: press again), stops ON the stairs, '>' again
// descends.  DL1: light the torch, 'H' explores (debug ^A z clears monsters
// that stop it) until "Nothing left to explore" or 60 presses; then '<'
// walks to the nearest known up staircase, stops, and '<' again climbs.
import { realErrors, serve, open, screen, sleep, keys, type, waitText, wipeDbs, birth, where, settle } from './lib.mjs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const snap = async (page, n) => { if (shot(n)) await page.screenshot({ path: shot(n) }); };
const lastMsgs = async (page, n = 3) => (await screen(page, 2)).split('\n').filter((l) => l.trim()).slice(-n).map((l) => l.trim());
const same = (a, b) => a && b && a.y === b.y && a.x === b.x && a.d === b.d;
const J = JSON.stringify;
async function zap(page) {	// debug ^A z: kill the monsters in sight
	await keys(page, [{ key: 'a', ctrlKey: true }], 300);
	const q = await waitText(page, /Are you sure|Debug Command/);
	if (/Are you sure/.test(q)) { await type(page, 'y'); await waitText(page, /Debug Command/); }
	await type(page, 'z', 500);
}
try {
	let { browser, page, errors } = await open();
	await birth(page, 'Walker');
	const start = await where(page);
	ok(start && start.d === 0, 'birth: in town at ' + J(start));
	await type(page, 'wb', 400);	// wield (light) the torch
	await type(page, '1111222', 150);
	const off = await where(page);
	ok(!same(off, start), `stepped off the start stairs to ${J(off)}`);

	// '>' walks to the entrance and stops on it
	let walked = 0, arrived = false, presses = 0;
	for (; presses < 40 && !arrived; presses++) {
		await type(page, '>');
		const s = await settle(page, 800);
		walked += s.length - 1;
		arrived = same(s[s.length - 1], start);
		if ((await where(page)).d !== 0) break;
	}
	ok(arrived, `'>' walked ${walked} steps in ${presses} presses to the entrance and stopped on it (still in town)`);
	await snap(page, 's2-town-arrived');
	await type(page, '>'); await sleep(1500);
	const arrival = await where(page);
	ok(arrival.d === 1, `second '>' descends: depth ${arrival.d}`);

	// 'H' explores (a level closed off by a locked door: debug ^A j, a new DL1)
	let steps = 0, oSteps = 0, zaps = 0, inview = 0, levels = 1, finished = 0;
	const moves = [];
	for (presses = 0; presses < 80 && steps < 150; presses++) {
		const key = presses % 2 ? 'O' : 'H';	// 'O' = explore in both keysets
		await type(page, key);
		const s = await settle(page, 1200, 120000);
		steps += s.length - 1; moves.push(s.length - 1);
		if (key === 'O') oSteps += s.length - 1;
		const m = (await lastMsgs(page, 1))[0] || '';
		if (process.env.DEBUG_EXPLORE) console.log('     H', s.length - 1, m);
		if (/Nothing left to explore|Only a locked door/.test(m)) {
			finished++;
			if (steps >= 100 || levels >= 4) break;
			await keys(page, [{ key: 'a', ctrlKey: true }], 300);
			const q = await waitText(page, /Are you sure|Debug Command/);
			if (/Are you sure/.test(q)) { await type(page, 'y'); await waitText(page, /Debug Command/); }
			await type(page, 'j'); await waitText(page, /Jump to level/); await type(page, '\r', 1500);
			levels++;
		}
		else if (/^In view:/.test(m) && s.length === 1) { inview++; await zap(page); zaps++; }
		if ((await where(page)).d !== 1) break;
	}
	console.log('     explore: presses', presses, 'levels', levels, 'moves per press', moves.join(','));
	ok(steps >= 100, `'H' explored ${steps} steps in ${presses} presses on ${levels} level(s) (${inview} "In view" stops, ${zaps} debug zaps, ${finished} "nothing left"/"locked door")`);
	ok(oSteps > 0, `'O' explores too (${oSteps} steps)`);
	ok(moves.some((n) => n >= 10), 'one press walks many steps (one step per turn)');
	ok((await where(page)).d === 1, 'explore never took stairs');
	console.log('     last messages:', J(await lastMsgs(page, 4)));
	await snap(page, 's2-explored');

	// '<' walks to the nearest known up staircase, stops, '<' again climbs
	let upWalk = 0, climbed = false, stopAt = null;
	for (presses = 0; presses < 60 && !climbed; presses++) {
		const before = await where(page);
		await type(page, '<');
		const s = await settle(page, 1000, 120000);
		const now = s[s.length - 1];
		if (now.d === 0) { climbed = true; ok(same(stopAt, before), `climbed from where the walk stopped ${J(stopAt)}`); break; }
		upWalk += s.length - 1;
		if (s.length > 1) stopAt = now;
		const m = (await lastMsgs(page, 1))[0] || '';
		if (/know of no way up/.test(m)) break;
		if (/^In view:/.test(m) || (s.length === 1 && !/walk/.test(m))) { /* a disturbance: press again */ }
	}
	ok(upWalk > 0 && stopAt && stopAt.d === 1, `'<' walked ${upWalk} steps and stopped at ${J(stopAt)} (arrival stairs ${J(arrival)})`);
	ok(climbed, `pressing '<' again climbs: depth ${(await where(page)).d}`);
	await snap(page, 's2-back-in-town');

	// In town: '<' knows no way up
	await type(page, '<'); await sleep(600);
	ok(/know of no way up/.test((await lastMsgs(page, 1))[0]), 'town: "You know of no way up."');

	ok(realErrors(errors).length === 0, 'no console errors ' + J(realErrors(errors)));
	console.log('wiped', (await wipeDbs(page)).length, 'dbs');
	await browser.close();
} finally { srv.kill(); }
process.exit(fail ? 1 : 0);
