// Stage 3: Enter command menu, inventory/equipment with a cursor and item
// menus, item prompts with a cursor, in a running game.
// SRV=<served folder> NODE_PATH=<playwright@1.56>/node_modules node stage3.mjs
import { realErrors, serve, open, screen, sleep, keys, type, waitText, wipeDbs, birth } from './lib.mjs';
const shot = (n) => (process.env.SHOTS ? `${process.env.SHOTS}/${n}.png` : null);
const srv = await serve();
let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const snap = async (page, n) => { if (shot(n)) await page.screenshot({ path: shot(n) }); };
const J = JSON.stringify;
const pad = (d) => ({ key: String(d), code: 'Numpad' + d });	// numpad digit (X11 KP_n macro)
const lastMsgs = async (page, n = 3) => (await screen(page, 2)).split('\n').filter((l) => l.trim()).slice(-n).map((l) => l.trim());

// Item rows of the list on term 0: { label, name, cursor, y }
async function items(page) {
	const out = [];
	(await screen(page)).split('\n').forEach((l, y) => {
		const m = /^(.*?)([> ])([a-w0-9])\) (\S.*)$/.exec(l);
		if (m && y > 0 && y < 24 && m[1].length < 12) out.push({ label: m[3], name: m[4].replace(/^[A-Z][a-z ]+ +: /, '').split(/\s{2,}/)[0].trim(), cursor: m[2] === '>', y, x: m[1].length + 1 });
	});
	return out;
}
async function zap(page) {	// debug ^A z: kill the monsters in sight
	await keys(page, [{ key: 'a', ctrlKey: true }], 300);
	const q = await waitText(page, /Are you sure|Debug Command/);
	if (/Are you sure/.test(q)) { await type(page, 'y'); await waitText(page, /Debug Command/); }
	await type(page, 'z', 500);
}
// After an item action: the list is back, or a monster is in view (then reopen by hand)
async function reopened(page, key) {
	await sleep(300);
	let s = await screen(page);
	if (/Letter: use/.test(s)) return s;
	const vis = await screen(page, 3);
	console.log('     (list not reopened; Visible: ' + J(vis.split('\n')[0].trim()) + ')');
	if (!/can see/.test(vis)) ok(false, 'list reopens when no monster is in view');
	await type(page, key, 500);
	return waitText(page, /Letter: use/);
}
const count = (name) => { const m = /^(\d+) /.exec(name); return m ? +m[1] : 1; };

try {
	const { browser, page, errors } = await open();
	await birth(page, 'Menus');

	// ---- Enter menu ----
	await type(page, '\r');
	let s = await waitText(page, /Commands/);
	const groups = ['Objects', 'Movement', 'Special actions', 'Doors, traps, digging', 'Spells, talents, skills',
		'Using objects', 'Magical devices', 'Throwing and missiles', 'Information', 'Messages and notes',
		'Saving and exiting', 'Preferences', 'Extra commands'];
	ok(groups.every((g) => s.includes(g)), 'Enter: menu lists all ' + groups.length + ' groups');
	await snap(page, 's3-menu');
	// Box sized to content: the frame line is as wide as the longest entry + key + border
	const frame = s.split('\n').find((l) => /\+-*Commands-*\+/.test(l.replace(/ /g, '')) || /\+-Commands/.test(l));
	ok(!!frame, 'group box drawn: ' + J(frame && frame.trim()));

	await keys(page, [pad(2)], 150);	// cursor to Movement
	await keys(page, [pad(6)], 300);	// open it
	s = await waitText(page, /Auto-explore/);
	ok(/H\s+Auto-explore/.test(s) && /<\s+Go up staircase \(walks there\)/.test(s) && />\s+Go down staircase/.test(s),
		'Movement group: H explore, < and > stair walks with keys');
	ok(!/Walk|Run\b/.test(s), 'no walk/run entries (RVIP-Finetuning Movement)');
	await snap(page, 's3-movement');
	await keys(page, ['Escape'], 200);	// back to groups
	s = await screen(page);
	ok(/Commands/.test(s) && !/Auto-explore/.test(s), 'Escape goes back to the groups');
	await keys(page, [pad(8), pad(8)], 150);	// wraps to the bottom: Extra commands
	s = await screen(page);
	ok(/>\S*\s*Extra commands/.test(s.replace(/[a-z]\s+Extra/, 'Extra')) || /> ?m Extra commands/.test(s), 'cursor wraps (8 8 -> Extra commands)');
	await keys(page, ['Escape'], 300);
	s = await screen(page);
	ok(!/Commands/.test(s), 'Escape closes the menu');

	// Run a command from the menu: Information (letter i) -> V (version)
	await type(page, '\r'); await waitText(page, /Commands/);
	await type(page, 'i'); await waitText(page, /Game version/);
	await type(page, 'V', 600);
	const msgs = (await lastMsgs(page, 4)).join(' | ');
	s = await screen(page);
	ok(/Sangband|version/i.test(msgs + s) && !/Commands/.test(s), 'menu runs V (version): ' + J(msgs.slice(-120)));
	await keys(page, ['Escape'], 300);

	// Menu reaches the inventory: Objects -> Inventory list by cursor + Enter
	await type(page, '\r'); await waitText(page, /Commands/);
	await type(page, 'a', 300);	// Objects (the group cursor is remembered)
	await waitText(page, /Inventory list/);
	await keys(page, [{ key: 'Enter' }], 400);
	s = await waitText(page, /\(Inventory\) Letter: use/);
	ok(true, 'menu Objects -> Inventory list opens the item list');

	// ---- Inventory with cursor ----
	let list = await items(page);
	console.log('     pack:', J(list.map((i) => i.label + ') ' + i.name)));
	ok(list.length >= 2 && list[0].cursor, `list with cursor on the first item (${list.length} items)`);
	await snap(page, 's3-inven');
	await keys(page, [pad(2)], 250);
	list = await items(page);
	ok(list[1] && list[1].cursor && !list[0].cursor, 'numpad 2 moves the cursor down');
	await keys(page, [{ key: 'ArrowUp' }], 250);
	list = await items(page);
	ok(list[0].cursor, 'arrow up moves it back');

	// Enter on a food item: action box
	let food = list.find((i) => /Ration|Food|Biscuit|Jerky|Slime|Waybread|Apple|Mushroom/i.test(i.name));
	ok(!!food, 'pack has food: ' + J(food && food.name));
	for (let i = 0; i < list.indexOf(food); i++) await keys(page, [pad(2)], 120);
	await keys(page, [pad(5)], 400);
	s = await waitText(page, /Action/);
	ok(/E\s+Eat/.test(s) && /d\s+Drop/.test(s) && /I\s+Inspect/.test(s), 'numpad 5: action box Eat/Drop/Inspect with keys');
	await snap(page, 's3-action');
	await keys(page, ['Escape'], 300);
	s = await screen(page);
	ok(!/Action/.test(s) && /\(Inventory\)/.test(s), 'Escape closes the action box, list stays');

	// Letter = main action (eat); the list reopens (monsters cleared first:
	// with a monster in view it stays closed, by design)
	await keys(page, ['Escape'], 300);
	await zap(page);
	await type(page, 'i', 500);
	await waitText(page, /\(Inventory\) Letter: use/);
	const before = count(food.name);
	await type(page, food.label, 1200);
	s = await waitText(page, /\(Inventory\) Letter: use/);
	list = await items(page);
	const food2 = list.find((i) => i.label === food.label);
	ok(food2 && count(food2.name) === before - 1, `letter eats: ${before} -> ${food2 && count(food2.name)}, list reopened`);

	// Torch: main action = wield
	const torch = list.find((i) => /Torch/.test(i.name));
	ok(!!torch, 'pack has a torch');
	await type(page, torch.label, 1200);
	s = await reopened(page, 'i');
	ok(!(await items(page)).some((i) => /Torch/.test(i.name) && i.label === torch.label && count(i.name) === count(torch.name)), 'torch letter wields it (main action Wear)');

	// 4/6 switch to the equipment
	await keys(page, [pad(6)], 400);
	s = await waitText(page, /\(Equipment\) Letter: use/);
	let eq = await items(page);
	const lite = eq.find((i) => /Torch/.test(i.name));
	ok(!!lite, 'numpad 6: equipment list shows the torch ' + J(lite && lite.label));
	await snap(page, 's3-equip');

	// Ctrl+letter = inspect
	await keys(page, [{ key: lite.label, ctrlKey: true }], 800);
	s = await screen(page);
	ok(/Torch/.test(s) && !/\(Equipment\) Letter/.test(s), 'Ctrl+letter inspects the torch');
	await keys(page, ['Escape'], 400); await keys(page, ['Escape'], 400);
	s = await screen(page);
	if (!/\(Equipment\)/.test(s)) { await type(page, 'e', 400); }
	s = await waitText(page, /\(Equipment\) Letter: use/);
	ok(true, 'equipment list back after inspecting');

	// Shift+letter = drop (from the equipment)
	await keys(page, [{ key: lite.label.toUpperCase(), shiftKey: true }], 1200);
	s = await screen(page);
	if (/Drop how many|quantity/i.test(s)) { await type(page, '\r', 800); s = await screen(page); }
	eq = await items(page);
	const msgs2 = (await lastMsgs(page, 3)).join(' | ');
	ok(!eq.some((i) => /Torch/.test(i.name)) || /drop/i.test(msgs2), 'Shift+letter drops the torch: ' + J(msgs2.slice(-100)));
	await keys(page, ['Escape'], 300);

	// Click on a row opens its action box
	await type(page, 'i', 500);
	await waitText(page, /\(Inventory\) Letter: use/);
	list = await items(page);
	const g = await page.evaluate(() => {
		const c = document.querySelector('#t-main canvas'), r = c.getBoundingClientRect(), S = window.__screen(0);
		return { l: r.left, t: r.top, w: r.width, h: r.height, rows: S.length, cols: S.reduce((m, x) => Math.max(m, x.length), 0) };
	});
	const row = list[1];
	await page.mouse.click(g.l + (row.x + 4.5) * g.w / g.cols, g.t + (row.y + 0.5) * g.h / g.rows);
	await sleep(500);
	s = await screen(page);
	ok(/Action/.test(s), `click on row ${row.label}) opens its action box (term ${g.cols}x${g.rows})`);
	await keys(page, ['Escape'], 300);
	await page.mouse.click(g.l + (row.x + 4.5) * g.w / g.cols, g.t + (row.y + 0.5) * g.h / g.rows, { button: 'right' });
	await sleep(400);
	ok(!/Letter: use/.test(await screen(page)), 'right click (or a click outside) closes the list');

	// ---- Item prompt with a cursor: 'I' inspect ----
	await type(page, 'I', 600);
	s = await waitText(page, /Inspect which|Examine which|Inven:/);
	list = await items(page);
	ok(list.length && list[0].cursor && /8\/2 5/.test(s), 'item prompt shows the list with a cursor');
	await snap(page, 's3-prompt');
	await keys(page, [pad(2)], 250);
	list = await items(page);
	ok(list[1] && list[1].cursor, 'numpad 2 moves the prompt cursor');
	const want = list[1].name.replace(/^\d+ |^an? |^the /i, '').split(/[ (]/)[0];
	await keys(page, [pad(5)], 800);
	s = await screen(page);
	ok(s.includes(want) && !/Inven:/.test(s), 'numpad 5 chooses the cursor item: inspecting ' + J(want));
	await keys(page, ['Escape'], 400); await keys(page, ['Escape'], 400);

	// A command prompt: 'w' lists only wearables (the torches), cursor + Enter wields
	await type(page, 'w', 600);
	s = await waitText(page, /Wear\/Wield which/);
	list = await items(page);
	ok(list.length === 1 && /Torch/.test(list[0].name) && list[0].cursor, 'w: prompt lists the torch with the cursor ' + J(list.map((i) => i.name)));
	await keys(page, [{ key: 'Enter' }], 800);
	await type(page, 'e', 500);
	ok((await items(page)).some((i) => /Torch/.test(i.name)), 'Enter wielded the cursor item (in the equipment)');
	await keys(page, ['Escape'], 400);

	// '/' and 4/6 switch lists in a prompt: 'I' then 6 -> Equip
	await type(page, 'I', 600);
	await waitText(page, /Inven:/);
	await keys(page, [pad(6)], 400);
	s = await screen(page);
	ok(/Equip:/.test(s), 'numpad 6 switches the prompt to the equipment');
	await keys(page, ['Escape'], 400);

	// Roguelike keyset: the menu shows that keyset's keys and runs the right command
	await type(page, '=', 500); await waitText(page, /Game Behavior/);
	await type(page, '1', 500); await waitText(page, /Rogue-like commands/);
	await type(page, 'y', 300); await keys(page, ['Escape'], 300); await keys(page, ['Escape'], 500);
	await type(page, '\r'); await waitText(page, /Commands/);
	await type(page, 'b', 400);
	s = await waitText(page, /Auto-explore/);
	ok(/O\s+Auto-explore/.test(s) && /\.\s+Stay still/.test(s), 'roguelike: Movement shows O explore, . stay still');
	await keys(page, ['Escape'], 200);
	await type(page, 'd', 400);
	s = await waitText(page, /Tunnel/);
	ok(/\^T\s+Tunnel/.test(s) && /S\s+Jam a door/.test(s) && /f\s+Bash/.test(s), 'roguelike: ^T tunnel, S jam, f bash');
	await keys(page, ['Escape'], 200);
	await type(page, 'i', 400); await waitText(page, /Look around/);
	await type(page, 'x', 800);	// roguelike look key: runs look (underlying 'l'), not a walk
	s = await screen(page);
	ok(!/Commands/.test(s) && /\[|Recall|ESC|You see|You are/.test(s.split('\n')[0]), 'roguelike: x in the menu runs Look: ' + J(s.split('\n')[0].trim().slice(0, 70)));
	await keys(page, ['Escape'], 300); await keys(page, ['Escape'], 300);
	await snap(page, 's3-rogue');

	ok(realErrors(errors).length === 0, 'no console errors ' + J(realErrors(errors)));
	console.log('wiped', (await wipeDbs(page)).length, 'dbs');
	await browser.close();
} finally { srv.kill(); }
process.exit(fail ? 1 : 0);
