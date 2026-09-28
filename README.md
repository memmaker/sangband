**RVIP port** of Sangband 1.0.2 (Skills Angband) by Leon Marrick and
Joshua Middendorf, from the Google Code project `skills-angband`, svn trunk
r313 (`source-archive.zip`,
[commit `230e028`](https://github.com/memmaker/sangband/tree/230e028),
the first commit here, untouched; the 1.0.2 release zip
`sangband_source_102.zip` is dated 2011-03-31).
Play: https://ruzzoli.de/roguelikes/sangband/
Our changes: https://github.com/memmaker/sangband/compare/230e028...main

Sangband replaces Angband's classes and experience levels with skills: every
character raises the skills they choose (weapons, magic realms, stealth,
burglary, forging, shapechanging, ...), gains talents and oaths, and the
game adapts to the character's "power". Chris Petit began it in 1994 on
Angband 2.5 code (via his Bangband); Michael Gorse and Julian Lighton carried
it to 0.9.5 on Angband 2.8.3; Leon Marrick rebuilt it with Oangband code for
1.0.0 (2007), and the Google Code team released 1.0.1 and 1.0.2 (2010-2011).
Upstream notes: `s-readme.txt`, `docs/` (manual, change logs, `copying.txt`),
`lib/help/`, `lib/file/news.txt`.

What this port adds:
- **Web frontend** `src/main-web.c` (z-term hooks to canvases, Emscripten +
  Asyncify), saves in the browser's IndexedDB, autosave, Export/Import; page
  `web/index.html` + `web/sangband.js` with the shared `rvip-wm.js` windows:
  Map, Inventory, Messages, Visible, Recall, Equipment, Character.
- **Explore** `H` (roguelike keyset `O`), **`<` / `>`** walk to the nearest
  known staircase and take it (`src/cmd2.c`).
- **Enter menu** with every command (`src/util.c`), **inventory cursor** with
  item menus and a cursor in every item prompt (`src/cmd3.c`,
  `src/object1.c`); no `-more-` stops.
- **Tiles**: Sangband's own David Gervais 32x32 set (`lib/xtra/graf`), pref
  typos fixed for 100% coverage (`lib/pref/graf32-g.prf`), big tiles.
- **Sound and music**: Sangband's own samples and tunes (rendered to ogg,
  `web/music`), gaps filled from the Dubtrain Angband Sound Pack
  (`web/dubtrain`); both off by default.
- Upstream bug fixes found with AddressSanitizer in the `RVIP: stage 1` commit.

## Build

`sh web/build.sh` → `web/dist` (the game) and `web/serve` (a local test site:
`cd web/serve && python3 -m http.server 8000`, open
http://localhost:8000/sangband/). The page loads the shared `../rvip-wm.js`,
`../rvip-app.js` and `../fonts/` from next to the game folder; build.sh links
them into `web/serve`:

- **Mac**: Homebrew emscripten (`brew install emscripten`, `emcc` on `PATH`);
  shared files from `~/Games/rvip-tools/web` and `~/Games/roguelikes-index`.
- **Cloud / Linux**: emsdk (`git clone https://github.com/emscripten-core/emsdk
  /home/user/emsdk && cd /home/user/emsdk && ./emsdk install latest &&
  ./emsdk activate latest`); build.sh finds `$EMSDK` (default
  `/home/user/emsdk`) when `emcc` is not on `PATH`; shared files from
  `/home/user/rvip/web` and `/home/user/roguelikes`.
- Overrides: `RVIP_WEB=<folder with rvip-wm.js>`, `ROGUELIKES=<folder with
  fonts/>` (or `FONTS=<font folder>`), `EMSDK=<emsdk folder>`.

Needs `python3` (help page, sound config). Music is committed as ogg;
`web/music.sh` re-renders it (openmpt123, timidity, ffmpeg). Tests:
`web/test/*.mjs` (Playwright, see `HANDOVER.md`). Deploy: `sh web/deploy.sh`
(only from a clean, pushed `main`). Notes: `HANDOVER.md`.

Controls (original keyset): 1–9 / arrows move, Shift runs, `H` explore,
`<` `>` stairs, Enter command menu, `i` / `e` item menus, `$` skills,
`p` talents, `?` help, Ctrl+S save, Ctrl+X save and quit. The Help button
opens the game guide.

Credits: Sangband by Chris Petit, Michael Gorse, Julian Lighton, Leon Marrick
and Joshua Middendorf; Angband by Alex Cutler, Andy Astrand, Sean Marsh, Geoff
Hill, Charles Teague, Charles Swiger, Ben Harrison and Robert Rühlmann; Moria
by Robert Alan Koeneke, Umoria by James E. Wilson. Tiles © David Gervais.
Music credits: `web/music/README.md`. Sound: Dubtrain Angband Sound Pack
v3.1.0 by Dubtrain, CC BY 4.0. Web port: memmaker.

Licence: GNU GPL version 2; parts also under the Moria licence, see
`docs/copying.txt`.
