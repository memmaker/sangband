# Sangband 1.0.2: handover

Web port, all RVIP stages 1–9 done and deployed (procedure:
`~/Games/rvip-tools/RVIP.md`, case A, Leon Marrick's 3.0-era z-term).
Repo **memmaker/sangband** (remote `origin`, branch `main`), full history:
commit 1 = upstream `230e028` (Sangband 1.0.2, Google Code skills-angband svn
trunk r313 = `sangband_source_102.zip`, 2011-03-31). README links
`tree/230e028` and `compare/230e028...main`; upstream `s-readme.txt` untouched.
Live: https://ruzzoli.de/roguelikes/sangband/ · shrine
https://ruzzoli.de/roguelikes/shrine/sangband.html

## Build, test, deploy
- `sh web/build.sh` → `web/dist`: all `src/*.c` except `main-*`,
  `intrface.c`, `borgdumb.c`; `-O2 -fcommon -std=gnu99 -DUSE_WEB`, warnings
  on. Env: `RVIP_WEB` (default `~/Games/rvip-tools/web`), `ROGUELIKES`
  (default `~/Games/roguelikes-index`), `FONTS`, `EMSDK`. Writes `web/serve/`
  (gitignored: rvip-*.js + fonts symlinks, `sangband -> ../dist`) for tests.
  Preload `/sangband/lib` (edit file help pref info + web `sound.cfg`);
  IDBFS `lib/save apex bone user` + `/sangband/web` (`web-layout.json`).
- `sh web/deploy.sh` (guard: `git fetch origin`, clean tree, HEAD =
  `origin/main`; rsync to ruzzoli.de).
- Tests: Playwright `web/test/stage1..6.mjs`, `stage9.mjs`, `resize.mjs`
  against `web/serve` (`SRV`, `PORT`; `KILLERS` for stage 9). `lib.mjs`:
  `__screen(0)` lays the pop-up over term 0, `__pane(p)`, `status(page)`.
- **Line endings**: `src/*.c` are CRLF (some mixed, e.g. cmd3.c, object1.c),
  `main-web.c` LF. Python text-mode rewrites turn CRLF into LF: patch in
  binary or restore endings.

## File map (port code)
- `src/main-web.c`: module `"web"` (`pref.prf` loads `pref-x11.prf`). Terms
  0..6 = `angband_term[0,2..7]` (term 1 special map unused): Map, Inventory,
  Messages, Visible, Recall, Equipment, Character (`web_window_flags[]`,
  `web_init_game()`); 7 pop-up, 8 Status. Defaults: `message_to_window` on,
  centred map (`clear_y = clear_x = 99`).
- Text windows are HTML (RVIP W0 rule 6; Sangband was the pilot): terms 1..6
  fixed sizes (`web_cols[]`/`web_rows[]`), `web_sub_fresh()` → JS `line()`/
  `rows()`; row format from `web_row()` (colour runs `\x05#rrggbb`..`\x06`,
  cursor `\x01`, tile icon `\x07`). Pop-up while `!character_generated ||
  screen_depth > 0` (`web_main_fresh()` sends the cells that differ from
  `Term->mem`; `web_repaint()` after). Status pane: `web_status()` (sidebar +
  status line groups); `js_origin(COL_MAP, ROW_MAP, 1)` so the canvas is the
  map area only. WM inserts `stat` left of `main` in old layouts
  (`withStat()`).
- Explore `H` (original) / `O` (both keysets; roguelike `H` = run west), stair
  walks `<`/`>` (stop on the stair, press again): end of `src/cmd2.c`, hooks
  in `dungeon.c` `process_player()`/`dungeon()`/`process_command()`,
  `cave.c disturb()`. Positions for tests: exported `web_where()`.
- Enter menu `cmd_menu()` end of `src/util.c` (groups as
  `lib/help/cmddesc.txt`, runs with `skip_keymap`); item menus
  `inven_screen()` end of `src/cmd3.c`; item prompts with cursor in
  `get_item()` (`object1.c`, `get_item_preselect`). Mouse = Sangband's own
  `MOUSEKEY` protocol on the map canvas and pop-up.
- Tiles: Sangband's own **David Gervais 32x32** (`lib/xtra/graf/32x32.bmp` +
  mask) → `web/tiles.png` by `web/mkgraf.py` (committed). `graf32-g.prf`
  fixed to 100% (`web/tile-coverage.py`). `web_set_tiles(int)` (Gervais /
  None) at the command prompt. Big tiles `MAP_STEP x MAP_VSTEP` (zoom 1..4,
  `map_pad()` in `cave.c`); list icons via `list_icon()` (`object1.c`).
- Saves: no `-u` under `USE_WEB`; loads the newest living character of
  `user.0.svg` (start sheet skipped). Export/Import = JSON bundle
  `sangband-save.json` (or a lone `0.<Name>`). Autosave Ctrl-S every 2 min /
  tab hidden. Game end: `web_game_end(p_ptr->is_dead)` after `play_game()`.
- Help: `web/make-help.py` → `dist/help.html` (self-contained; uses a Docs
  entry `sangband.html` if present, `SANGBAND_NO_DOCS=1` skips, `--docs`
  writes a standalone page). `lib/help/cmdlist.txt` roguelike keys fixed.
- Sound: `web/sounds.py` (own wavs + Dubtrain v3.1.0 mp3s from
  `web/dubtrain` for 50 empty events). Music: own `lib/xtra/music` rendered
  by `web/music.sh` to `web/music/*.ogg` (committed, credits in
  `web/music/README.md`); page `jukebox()` in `sangband.js` follows
  `jukebox.cfg` and `danger_music_level()` via `TERM_XTRA_MUSIC`.
- Beacon: `files.c close_game()` top of the `is_dead` branch →
  `web_run_end()`. win = `total_winner`, quit = "(Quit the game)"/"(Suicide
  -- ...)", `lvl` = `p_ptr->power` (no levels). Plain save & quit sends
  nothing. Killer art: roguelikes-index `killers/make.py sangband()` (decimal
  `R:<idx>:+row:+col`).
- Shrine manual files: `web/mkmanual.py <shrine/sangband>`.

## Gotchas
- Wizard `Ctrl+W` is eaten by the browser: `^` then `w`.
- Win test: DL101, `^A n 768` Morgoth, poke his hp in the wasm heap (see
  `web/test/stage9.mjs`).

## Open
- No Docs entry `sangband.html` in `~/Desktop/Games/Roguelikes/Docs` yet
  (`python3 web/make-help.py --docs`).
- Not checked first-hand: Google Code archive links (help + shrine),
  RogueBasin's 2 Sep 1994 date. Sound/music volumes (0.6 / 0.5) not tuned by
  ear.
- In town moving townspeople stop `>` walks every 1-3 steps (by design);
  pick-up messages stop explore at each object. At zoom 2+ text over a big
  tile's first cell leaves its lower rows until the next redraw;
  `display_map` (`M`) draws small 1-cell tiles.
