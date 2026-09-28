# Sangband 1.0.2: handover

## RVIP progress

### Stage 1 (get + build): done 2026-09-28 (cloud)
- **Folder** `/home/user/sangband` (Mac: `~/Games/sangband`), branch `main`.
  Upstream = commit `230e028`: Sangband 1.0.2 (Skills Angband, Leon Marrick),
  Google Code svn trunk r313 (`source-archive.zip`, sha256 in the commit
  message; release zip `sangband_source_102.zip` 2011-03-31). No git remote yet.
- **Case A**, Leon Marrick's 3.0-era z-term (Oangband / FAangband 1.x family),
  see RVIP.md `A-Sangband`. A0: empty lib dirs carry `delete.txt`, no empty
  blobs; `lib/xtra/graf` has **no tile sheets** (only graf16/32 prefs in
  `lib/pref`) → stage 4 needs Shockbolt or the binary release's sheets.
  `lib/xtra/sound` ships its own wavs + `sound.cfg` (stage 6).
- **Web frontend** `src/main-web.c` (from Easyband's), module `"web"`
  (`pref.prf` loads `pref-x11.prf` for it). Web terms 0..6 =
  `angband_term[0,2..7]` (term 1 = special map, unused): Map, Inventory,
  Messages, Visible (`PW_M_LIST`), Recall, Equipment, Character
  (`web_window_flags[]`, set by `web_init_game()` from `main.c` after
  `init_angband()`). Page: `web/index.html` + `web/sangband.js` (Easyband's
  page, text only, tiles code dormant), loads `../rvip-wm.js`, `../rvip-app.js`.
- **Build** `sh web/build.sh` → `web/dist` (emcc 6.0.10, emsdk
  `/home/user/emsdk`): all `src/*.c` except `main-*`, `intrface.c`,
  `borgdumb.c`; `-O2 -fcommon -std=gnu99 -DUSE_WEB` + W7 flags, warnings on
  (3 harmless left: `full_name ?:`, `(bool)` unused). Preload
  `/sangband/lib` (edit file help pref info); IDBFS: `lib/save apex bone
  user` + `/sangband/web`.
- **Test** `web/test/stage1.mjs` (Playwright 1.56, `SRV`= folder with
  `rvip-*.js`, `fonts` → roguelikes/fonts, `sangband` → web/dist; `NODE_PATH`,
  `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`): birth → town without `(+)`
  stops, 500 random keys, Ctrl-X save, reload, character restored: all ok.
- **Defaults (3d)**: `message_to_window` on (web: `msg_flush()` never waits
  when it is set); centred map via `clear_y = clear_x = 99`.
- **ASan** (emcc `-fsanitize=address`, birth + 2500 random keys, 3 seeds):
  fixed `print_tomb()` stack-use-after-scope (`buf2`). Also fixed:
  format-string bugs (history.c, info.c, util.c `fprintf`; loadsave.c
  `strnfmt` of `user.0.svg` text + unbounded name loop), randart speed
  precedence, `!m_ptr->hp < 0`, `%ld` with int in `print_tomb()`. W8: no
  cast-function-type / prototype-less warnings. ASan build removed.
- **Quirks**: savefile = `lib/save/0.<Name>` + `user.0.svg`; after a reload
  the start menu needs `c` (the character) — stage 5 could auto-pick it;
  `sangband.js` `SAVE_NAME`/`put()` still assume `0.PLAYER` (Import/Export:
  stage 5). Font/Help/Audio buttons present; help.html/music not yet (404 on use).
- **Next**: stage 2 (explore + stairs).

### Stage 2 (explore + stairs): done 2026-09-28 (cloud)
- **Explore key `H`** (original keyset; was unused) **and `O`** (unused in
  both keysets: the roguelike `H` is the `C:1` "run west" keymap, so
  roguelike players use `O`). `X` = `w0` keymap in both, `` ` `` = Escape.
  Help: `lib/help/cmdlist.txt` (both keysets), `cmddesc.txt` (explore
  entry, `<`/`>` walk text); page key hints `web/index.html`.
- **Code**: end of `src/cmd2.c` (Easyband's explorer ported):
  `auto_explore` (0 / explore / up / down), `explore_step()`,
  `do_cmd_explore()`, `explore_to_stairs()`, `explore_reset()`,
  `explore_new_level()`; prototypes in `externs.h`.
- **Main-loop hook**: `dungeon.c` `process_player()`: `auto_explore` in the
  "player abort" key check and `else if (auto_explore) explore_step();`
  before the running branch; `dungeon()` calls `explore_new_level()` after
  `p_ptr->leaving = FALSE`; `disturb()` (`cave.c`) calls `explore_reset()`;
  `process_command()` `case 'H': case 'O':`. `do_cmd_go_up/down()`
  (`cmd2.c`) walk to the nearest known staircase/shaft when not on one
  (and stop there: press again to take it, RVIP-Finetuning "Movement").
- **Known grid**: `cave_info & CAVE_MARK` or the explorer's own
  `explore_seen[][]` (every `CAVE_SEEN|CAVE_MARK` grid at each step).
  Passable: `TF_PASSABLE` terrain (floor, rubble, water, trees, open doors,
  stairs) except lava and shop entrances, no visible monster, no visible
  trap (`t_list`: `cave_trap() && cave_visible_trap()`, glyphs are fine);
  closed door 32 is opened directly (`cave_set_feat(FEAT_OPEN)`), locked/
  jammed 33..47 stop once ("The door is locked.") and are skipped after.
  Targets: marked object not yet walked to, or a grid next to an unknown
  one. Town stair walks may cross unknown grids (entrance at night).
- **Stops**: monster in view (explore only; `NEVER_MOVE` ones only when
  adjacent; "In view: a Fruit bat." / "something"), any new message (also
  between steps), any key ("Cancelled."), no step made, no light in the
  dungeon, blind/confused/hallucinating ("You are in no state to find your
  way."), "Nothing left to explore." / "Only a locked door or a known trap
  is in the way." / "You know of no way up/down.". Web: `Term_fresh()` +
  `TERM_XTRA_DELAY` 40 ms per step (visible walk).
- **Test** `web/test/stage2.mjs` (as stage 1: `SRV`, `NODE_PATH`,
  `PLAYWRIGHT_BROWSERS_PATH`): town `>` walks to the entrance and stops on
  it, `>` again descends; DL1 `H`/`O` explore 150+ steps (debug `^A z`
  clears monsters that stop it, `^A j Enter` = new DL1 if a locked door
  closes the level), `<` walks to the up staircase, stops, `<` again climbs;
  town `<` "You know of no way up.". Passes; stage1.mjs still passes.
  Positions come from the new export `web_where()` (`main-web.c`,
  `EXPORTED_FUNCTIONS` in `build.sh`): the map is centred, `@` stays put
  on screen. `lib.mjs`: shadow rows built with `Array.from` (sparse rows
  shifted text left), new `birth()`, `where()`, `settle()`.
- **Open**: in town every townsperson moving in view disturbs a weak
  character, so `>` walks 1-3 steps per press there (by design, A3).
  Picking up / "You see ..." messages stop explore at each object (the
  message rule). The page draws a small copy of the top message line over
  the map's first row (stage 5, page CSS). Roguelike `O` not run in a
  browser (keymap reasoning only; `O` has no `C:1` line).
- **Next**: stage 3 (Enter menu + inventory); the menu must list `H`/`O`
  explore and the `<`/`>` stair walks.

### Stage 3 (Enter menu + inventory): done 2026-09-28 (cloud)
- **Enter menu**: `cmd_menu()` at the end of `src/util.c` (Easyband's port,
  groups as `lib/help/cmddesc.txt`): 13 groups in `cmd_menu_groups[]`
  (Objects, Movement = `,` stay + `H`/`O` explore + `<`/`>` stair walks, no
  walk/run/jump; Special actions, Doors/traps/digging, Spells/talents/skills
  incl. `[` `p` `$` `]`, Using objects, Magical devices, Throwing, Information
  incl. `^Q`, Messages, Saving, Preferences, Extra incl. `^V`). Opened in
  `request_command()` right after `inkey()` on `\r`/`\n` when not shopping
  and no keymap uses Enter; the chosen underlying command runs with
  `skip_keymap` (Sangband's own flag). Keys shown for the current keyset by
  `command_key()` (the key itself unless a keymap takes it, else the keymap
  that runs exactly it; entry `alt` 'O' when 'H' has none: roguelike).
  Generic boxed list `box_menu()` (sized to content, scrolls if taller than
  the screen, `^`/`v` marks), keys via `menu_key()` = `inkey(ALLOW_CLICK)`:
  arrows/keypad arrive as digits through the pref-x11.prf macros, so no
  keysym parsing; left click chooses, right click / outside = back.
- **Item menus**: `inven_screen()` at the end of `src/cmd3.c`
  (`do_cmd_inven()/do_cmd_equip()` call it unless `command_shopping`).
  Letter = main action, Shift = drop, Ctrl = inspect, 2/8 move, Enter/Space/5/
  click = action box (`inv_action_menu()` → `box_menu()` right of the list),
  `+ - *`, 4/6 or `/` switch lists, Esc/0/. close, other keys = commands.
- **How item actions run: key queue + preselect.** `inv_act[]` {key, name,
  pack/equip, test} in main-action order (E q r a u z A f m b w t F `(` v d k
  I { }). `inv_run()` sets `get_item_preselect` + `get_item_preselect_on`,
  `p_ptr->command_new = key`, `command_new_raw` (→ `skip_keymap`) and
  `inven_reopen` = `i`/`e`. `get_item()` (`object1.c`) takes the preselect
  first if the places, `get_item_okay()` and `get_item_allow()` accept it
  (`repeat_push()` so `n`/`^V` repeat). `request_command()` clears the
  preselect when no command is queued and queues the reopen when
  `inven_may_reopen()` (no moving visible monster in LOS).
- **Item prompts with a cursor**: `get_item()` always shows the list
  (`command_see`), cursor from `show_list_*` (rows/slots recorded by
  `show_inven/equip/floor()`; `show_list_cursor()`, `show_list_at()`); 2/8
  move, 5/Enter/click choose, 4/6 cycle pack/equipment/floor; digit
  @-tags win over cursor keys; quiver labels 1/3/7/9/0 still work directly
  (2/4/5/6/8 are cursor keys). Lists are sized to content (`len = 0`), col
  >= 2 for the `>` cursor.
- **Mouse**: page `onMouse` now attached to the main canvas; `nextEvent()`
  returns `0x1000000|button<<16|y<<8|x`, `web_pump()` queues `MOUSEKEY`,
  button (2 L, 3 R, 4 L-double), x, y, `TERM_MAIN` (Sangband's own mouse
  protocol; double-click = look is untested).
- **Help**: cmddesc.txt "Inventory list" (item menus + prompts) and "Command
  menu (Enter)"; cmdlist.txt `^M Command menu (Enter)`; page hint `Enter menu`.
- **Test** `web/test/stage3.mjs` (as stage 1/2): 34 checks: groups, Movement
  (H, < >, no walk/run), Escape back/close, wrap, menu runs V, menu →
  inventory, cursor numpad/arrow, action box (Eat/Drop/Inspect with keys),
  letter eats + list reopens (debug `^A z` first), torch letter wields, 6 →
  equipment, Ctrl+letter inspects, Shift+letter drops, click opens the box,
  right click closes, `I` prompt cursor + numpad 5, `w` prompt lists only the
  torch + Enter wields, 6 switches the prompt, roguelike keyset (O, ^T, S,
  f; `x` runs Look). stage1.mjs and stage2.mjs still pass (3d holds).
- **Line endings**: `src/*.c` are CRLF (some mixed, e.g. cmd3.c, object1.c);
  `main-web.c` LF. Python text-mode rewrites turn CRLF into LF: patch in
  binary or restore endings (did so here).
- **Open**: the item list overlays the sidebar from col (cols-80)*2/3 as the
  original does (sidebar text left of it stays); no mouse on sub-windows
  (inventory pane); wheel not mapped. No ASan run this stage (browser tests only).
- **Next**: stage 4 (tiles: no sheets in `lib/xtra/graf`, see stage 1).

### Stage 4 (tiles): done 2026-09-28 (cloud)
- **Tile set: Sangband's own David Gervais 32x32** (`lib/xtra/graf/32x32.bmp`
  + `32x32m.bmp`, copyright D. Gervais, palette tweaks by LM; readme.txt
  there). Stage 1 was wrong: the source ships sheets; the Windows release
  `sangband_windows_102.zip` has byte-identical sheets and prefs. One set
  only, no other set mixed in (user rule, RVIP.md step 4).
- **Candidates** (`python3 web/tile-coverage.py [prf]`; monsters w/o the
  player, objects, flavours, features): Gervais `graf32-g.prf` as shipped
  1494/1503 = **99.4%** (3 monsters + 6 objects missing/typo'd, 3 empty
  tiles); after fixes **100%**; Adam Bolt `graf16-g.prf` 1368/1503 = 91.0%
  ("not fully implemented" upstream; 16 px); `graf32-f` (terrain only)
  18.8%; Shockbolt not needed (external, would be a second set).
- **Pref fixes** (`lib/pref/graf32-g.prf`, gaps filled from the same
  sheet): `B:` player lines `+3:/+18` → `+3/+18` (shifted 5 specialties),
  `+4/71` (text 'G') and empty (4,44)/(4,70) → the race's own tiles;
  Innkeeper `R:2:1:+9` → `+11:+9`; Shrieker 49 (was `R:367`), Giant
  sapphire 7/14, Ghoul 20/81, Berserker 13/0, Athelas 2/21, Hatchet 10/32,
  Chain Mail `K:193` (was a 2nd `K:192`), Magma scroll 7/75, Chaos essence
  2/50 (`+2:+`), Pouch 6/95. Lurker/Trapper/Greater Unseen keep the empty
  sprite on purpose (look like floor). Rods show their wand flavour (game
  design: rods reuse wand flavours).
- **Loader**: `web/mkgraf.py` → `web/tiles.png` (RGBA, 4096x960, 1.2 MB,
  committed; mask bit 1 = transparent), `web/build.sh` copies it to dist.
  Game side `src/main-web.c`: `use_graphics = GRAPHICS_DAVID_GERVAIS2`
  ($GRAF `32x32-g` → `tiles.prf` → `graf32-g.prf`) or `GRAPHICS_NONE`
  (ascii.prf); `web_set_tiles(int)` (exported, FAangband's name) applied at
  the command prompt: `reset_visuals()` + `do_cmd_redraw()` (map, Inventory,
  Visible redraw). Page button `Tiles: Gervais` ↔ `Tiles: None`, kept in
  the layout file (`L.text`).
- **Scale**: big tiles, a grid = `MAP_STEP x MAP_VSTEP` = 2m x m text cells
  (m = map zoom 1..4, A−/A+ on the Map title bar in tile mode), square;
  cell height from `L.gtile` (fits 80x24, e.g. 24 px at 1440x900).
  Nearest-neighbour only (`imageSmoothingEnabled = false`). Code:
  `defines.h` `MAP_STEP/MAP_VSTEP` (1 natively), `cave.c` `map_pad()` +
  `move_cursor_relative/print_rel/lite_spot/prt_map`, `dungeon.c` and
  `web_set_view()` `calc_map_size()` in grids, `xtra2.c` `mouse_grid()`.
  `js_pict(t,x,y,a,c,ta,tc,w,h)` per cell, C decides the box (see RVIP.md
  A-Sangband); cursor box = whole big tile, never on the hero.
- **Lists**: Inventory/Equipment windows `a) X name` (symbol, or the tile
  as a two-cell icon; `object1.c` `list_icon()`), Visible list icons (the
  game's own `pict + blank + name`). Sidebar equippy chars stay text
  (`object_text_glyph()`); `object_attr()` ignores shimmer colours when the
  char is a tile.
- **Test** `web/test/stage4.mjs` (as stage 1-3, `SHOTS=<dir>` for crops):
  town big tiles, player sprite 3/7, no cursor on the hero, sidebar text,
  Inventory + Visible icons, look cursor spans the tile, debug ring →
  flavour tile on the map, DL1 unknown grids = black tile 0/0, zoom 4x2,
  None → text map + `a) , Rations`, back, choice survives reload; all ok.
  stage1-3 still pass. Screenshots looked at (town, ring, DL1, zoom, menus
  over tiles, None); overlays (item list, Enter menu) leave no stale halves.
- **Open**: tiles at the default 24 px scale 32→24 (NN, slightly uneven
  pixels; 16/32/48 are clean); no statues/figurines in Sangband (statue
  *monsters* have tiles); at zoom 2+ text over the first cell of a big tile
  leaves the tile's lower rows until the next redraw; display_map (`M`)
  draws 1-cell tiles (small); not checked in the Mac pane yet.
- **Next**: stage 5 (web page: windows layout, deploy).

### Stage 5 (web page): done 2026-09-28 (cloud; not deployed, no ssh)
- **Page** `web/index.html` + `web/sangband.js` (Easyband's finetuned page),
  shared `../rvip-wm.js` / `../rvip-app.js` (never copied). Top bar: Help ·
  File ▾ (Export save, Import save, New game) | Windows ▾ · Tiles: Gervais/None ·
  Font (text windows) · Audio ▾; key hints `H` explore · `i` inventory ·
  `Enter` command menu · `?` command help · `<` `>` stairs. Map font select on
  the Map title bar (text mode only; text-mode cells from the font, tile mode
  shrinks a wide font to the grid cells). A−/A+ per window (WM `state.fs`),
  Map A−/A+ = tile zoom 1..4 (text mode: cell steps).
- **Windows** (terms 0..6 = Map, Inventory, Messages, Visible, Recall,
  Equipment, Character; `web_window_flags[]`): default on Map, Inventory,
  Visible, Messages; the rest via Windows ▾ (all filled by the game).
  Messages fill from the top (`fix_message()` under `USE_WEB`, leading blank
  birth separators skipped). Sub-window resize at the prompt refills at once
  (`window_stuff()` after `web_apply_layout()`). Prompt box over row 0: CSS
  vars `--cell-h/-font/-face` set in `fitCanvas()` (follows the CSS scale).
- **Saves**: no `-u`, no default `user_name()` under `USE_WEB` (`main.c`):
  `savefile_load(FALSE)` loads the newest living character of `user.0.svg`;
  the loaded-character sheet ("'Q' to quit, 'C' ...") is skipped for the
  living (`dungeon.c` `play_game()`). `save_player()` ends with
  `web_sync_files()`. Export = JSON bundle `sangband-save.json`
  (`0.<Name>`… + `user.0.svg`, RvipApp `root` = save dir); Import takes the
  bundle or a lone `0.<Name>` / `sangband-<Name>.sav` (writes a one-line
  `user.0.svg` if none). New game clears `lib/save` only. Autosave: Ctrl-S
  pushed at the idle prompt every 2 min / tab hidden (map stays on screen).
- **Game end**: `web_game_end(p_ptr->is_dead)` right after `play_game()`
  (`cleanup_angband()` frees `p_ptr` before `quit()`), `hook_quit` passes
  -1/0/1 → overlay "Sangband has ended" + died / saved text + Play again.
- **Help** `help.html` = `web/help-stub.html` until stage 6's
  `web/make-help.py` exists (build.sh uses that when present). **Audio**:
  build.sh writes `audio.json` (`sound`/`music` true only if `web/sound`,
  `web/music` exist); the checkboxes stay disabled otherwise, nothing
  missing is fetched (stage 6: add the dirs, sound code already in the page).
- **Deploy**: `web/deploy.sh` (guard: `git fetch origin`, clean, HEAD =
  `origin/main`; rsync `dist/` to ruzzoli.de:/var/www/ruzzoli.de/roguelikes/sangband)
  — created, NOT run (no ssh in the cloud).
- **Tested** (headless Chromium, local `web/dist`): `web/test/stage5.mjs` 52
  checks = W10 checklist: birth, tiles, every window filled (Recall via look
  after `^A s`), item colours, top bar order + hints, Windows ▾, prompt box
  geometry + hide on key, shop (BFS walk in text mode), Help/Escape, Enter
  menu, `>` descend, zoom x3 keeps `@` centred while exploring, gutter drag,
  A+ on one window only, rename (no key leak), both font choosers, Ctrl-S +
  IndexedDB, reload loads Tester by itself, layout/titles/sizes/font survive
  reload, autosave (mtime, map untouched), options 1-5/A/D/H no crash, Export
  bundle, New game, Import bundle, Import lone savefile, Ctrl-X → Play again →
  continues, death (debug DL60 + summons) → tombstone → Play again → start
  menu, no console errors, no 4xx. `web/test/resize.mjs`: 1000×650 →
  1440×900 → 1200×750 with the inventory prompt open (old canvas CSS-scaled,
  applied at the prompt) → 760×500 → 1440×900: every canvas 1:1, redrawn.
  stage1-4 tests still pass (stage1 now expects no start menu on reload).
- **For the Mac check**: look at the page in the pane (layout, font sizes of
  the sidebar at small windows: at 760×500 tile cells are 6×12 px, sidebar
  text ~9 px), fonts from `../fonts` (local test linked roguelikes/fonts),
  real key input (numpad, Shift+keypad), the tile zoom, the death screen
  flow by hand, and deploy with `sh web/deploy.sh` once pushed, then
  https://ruzzoli.de/roguelikes/sangband/.
- **Open**: map window narrower than 80 cells shows the main term CSS-scaled
  (80×24 minimum, W3); Messages keeps the game's blank birth separators
  between lines; help is a stub (stage 6); no mouse on sub-windows.
- **Next**: stage 6 (docs + sound: make-help.py, sound/music dirs → audio.json).

### Stage 6 (docs + sound): done 2026-09-28 (cloud)
- **Help** `web/make-help.py` → `dist/help.html` (build.sh; `help-stub.html`
  removed). Self-contained cloud form of NPP's (TAGLINE, ESSENTIALS, KEY_HINTS,
  ABOUT, TIPS, GUIDE, SAVING, WEB, CREDITS; prefers a Docs entry
  `sangband.html` on the Mac, `SANGBAND_NO_DOCS=1` skips it; `--docs` writes a
  standalone page). Output uses the page's help classes (`.toc .box .key .grid
  .all`); `index.html` got `#help-body a` in the accent colour. Sections: about,
  keys (remember box, essentials, complete list 95 entries = original keyset +
  roguelike rows that differ, " (roguelike keyset)"), saving (IndexedDB,
  autosave, Export/Import, New game), tips, new-player guide (skills, costs,
  practice, similar skills, power, realms, Oaths, talents, town/shops, items),
  browser, credits (news.txt, readme.txt, copying.txt, jukebox.cfg), About this
  version (sangband_source_102.zip, Google Code skills-angband svn r313,
  `tree/230e028`, `compare/230e028...main`).
- **cmdlist.txt fixes** (checked against `pref.prf` keymaps and
  `process_command()`): roguelike `a` = Zap a rod, `z` = Aim a wand (were
  swapped), `p` = Perform a combat talent (was "Pray a prayer"), `G` unused
  (was "Gain new spells", no such command). CRLF kept.
- **Sound**: `web/sounds.py` writes the web `sound.cfg` into the preload
  (`lib/xtra/sound/sound.cfg`) and copies samples to `dist/sound`: Sangband's
  own wavs first (cfg names matched case-insensitively, `unh.wav,` comma,
  never-shipped names dropped), 50 empty events from Dubtrain v3.1.0
  (`web/dubtrain`: only the used mp3s + `sound.prf` + README, CC BY 4.0,
  copied from ref-nppangband), melee `miss` = `plc_miss_swish` (own was
  `crossb.wav`), missile events get the arrow samples. walk/ambient silent.
- **Music**: Sangband ships its own (`lib/xtra/music`, .it/.mid +
  `jukebox.cfg`, themes town/peaceful/light/medium/heavy/deadly/death, GPL /
  NetHack GPL, credits in `web/music/README.md` incl. the verbatim Reenen Laurie
  text). `web/music.sh` renders them to `web/music/*.ogg` (openmpt123, timidity
  + FluidR3 GM, ffmpeg vorbis q0; 19 tunes, 13 MB, committed; apt-get needed
  `apt-get update` first in the cloud). C: `use_sound = SOUND_AND_MUSIC` in
  `init_web()`, `TERM_XTRA_MUSIC` → `js_music(v)`; the game's own
  `danger_music_level()` asks every turn. Page: `jukebox()` ported from
  `intrface.c` (not compiled) in `sangband.js`, `jukebox.cfg` read from the
  preload FS (`.it/.mid` → `.ogg`), song made only when Music is on.
- **Toggles**: Audio ▾ Sound effects / Music, off by default, kept in
  `web-layout.json` (`L.audio`). `audio.json` = `{"sound": true, "music": true}`.
- **Test** `web/test/stage6.mjs` (as before: `SRV`, `PORT`, `PLAYWRIGHT_BROWSERS_PATH`),
  33 checks: audio off + nothing fetched, guide claims in the game (tutorial
  `?`, EXP sidebar, starting kit, `$` screen keys/27 skills, `+`/`-`/Enter,
  `R` prompt), help sections/classes/keysets/links/credits/Escape, real click
  Sound → eat requests own `Mmm.wav`, `>` requests a Dubtrain mp3, Music → a
  dungeon theme at once, `<` to town → town tune, reload keeps both, off →
  nothing fetched, layout file holds off, wav/mp3/ogg decode, no errors.
  stage1-5 + resize still pass (stage5 help check now case-insensitive).
- **Open**: Google Code link not checked from the cloud (proxy 403; github
  links 200). No Docs entry written (cloud): generate it on the Mac from
  make-help.py. Music volume 0.5 / sounds 0.6 not tuned by ear.
- **Next**: stage 7 (repo / deploy / card).

### Stage 7 (publish): done 2026-09-28 (cloud; NOT pushed, NOT deployed: no ssh)
- **Repo** github.com/memmaker/sangband (remote `origin`, branch `main`),
  history kept (no bundle inside, no filter-repo): commit 1 = upstream
  `230e028`. `README.md` new (upstream `s-readme.txt` untouched): upstream =
  Sangband 1.0.2, Google Code skills-angband svn trunk r313, links
  `tree/230e028` and `compare/230e028...main`, build on Mac + cloud.
- **build.sh**: `RVIP_WEB` (default `~/Games/rvip-tools/web`, else
  `/home/user/rvip/web`), `ROGUELIKES` (default `~/Games/roguelikes-index`,
  else `/home/user/roguelikes`), `FONTS`, `EMSDK`; writes `web/serve/`
  (gitignored: rvip-*.js + fonts symlinks, `sangband -> ../dist`). Fresh
  `git clone` → `sh web/build.sh` → `stage1.mjs` against `web/serve`: all ok.
- **og**: `<!--og-->` block in `web/index.html` (from the card; image
  `img/sangband.png`), stage 5's hand-written description removed. No shrine
  yet (stage 8: og.py's shrine loop picks it up once the card has an Info link).
- **Selection page** (`/home/user/roguelikes`, branch
  `claude/modest-davinci-rw8z6m`, commit `8c40e3f`): card after NPPAngband
  (tag "Angband variant · 2011", ver "Based on Sangband 1.0.2 ·
  skills-angband svn r313 @ 230e028", no Info button yet), image = the
  project's title splash `news.png` (403x376, sha1 493f2203…) as
  `img/sangband.png`, CSS `img.splash` = cover, top-anchored (logo + dragon;
  contain was tiny/unreadable). Screenshots checked at 1440 (DPR 1 and 2)
  and 375 px. "39 classic roguelikes" in the index og text. og.py fix: its
  card regex matched no card since `data-year` (now `<div class="card"[^>]*>`).
- **Year** 2011 (years.json `sangband`, src
  https://code.google.com/archive/p/skills-angband/downloads — downloads JSON
  `releaseDate` 1301547251 = 2011-03-31 for `sangband_source_102.zip`): README
  rule = release of the played version (as NPP 0.5.1 → 2011, ZAPM 0.8.2 →
  2010). Tree node `Sangband` 1994 (years.json tree) for the birth.
- **Parent**: Angband (tree `<li>` under Angband: Sangband 1994 → Sangband
  1.0.2 2011). `docs/manual.txt` history: Chris Petit, first release 3 March
  1994 on Angband 2.5.x code as modified in his Bangband; Gorse to 0.9.3,
  Lighton 0.9.4-0.9.5 (updated to Angband 2.8.3), Marrick from 2001, 1.0.0
  May 2007. **Disagreements**: `s-readme.txt` says "based on Angband and also
  on Oangband" (Marrick's 1.0 took Oangband code; noted in the tree text, not
  placed under Oangband); first release date: manual text 3 Mar 1994, its
  copyright list "0.1 - 0.8.5: Jun 28, 1994", RogueBasin (via web search
  snippet; the site is blocked here) 2 Sep 1994 — all 1994. RogueBasin page
  not read directly (proxy 403).
- **Deploy on the Mac** (after the orchestrator pushed both repos):
  1. `cd ~/Games/sangband && git pull && sh web/build.sh && sh web/deploy.sh`
     then `curl -s https://ruzzoli.de/roguelikes/sangband/ | grep og:image`
     and play https://ruzzoli.de/roguelikes/sangband/.
  2. Merge `claude/modest-davinci-rw8z6m` into `main` of roguelikes-index,
     `cd ~/Games/roguelikes-index && git checkout main && git pull &&
     ./order.py && ./deploy.sh`, check https://ruzzoli.de/roguelikes/ (card)
     and https://ruzzoli.de/roguelikes/#tree.
- **Open**: nothing deployed; card and tree link to `sangband/` which 404s
  until step 1 runs. Shrine / Info button / tree ✦: stage 8.
- **Next**: stage 8 (shrine).

### Stage 8 (shrine): done 2026-09-28 (cloud; NOT pushed, NOT deployed: no ssh)
- **Shrine** `roguelikes/shrine/sangband.html` + `shrine/sangband/`: sections in
  step-11 order (+ Screenshots after Credits, as rogue54): facts, lineage (with
  both disagreements spelled out: first release 3 Mar / 28 Jun / 2 Sep 1994;
  base Angband 2.5 via Bangband → 2.8.3 (manual) vs 2.9.3 + 3.0.6 changes +
  Oangband 0.7.0 (`src/changes.txt`) vs "Angband and also Oangband"
  (`s-readme.txt`)), credits, 4 screenshots (`img/sangband.png` splash, town,
  `$` skills, DL3), trivia, USP, code dive, stats, manual, start, help, cheats.
- **Manual files** by `web/mkmanual.py <shrine/sangband>`: `manual.html`
  (upstream `docs/manual.html`, unchanged, rev. 22 Oct 2010), `help.html`
  (all 34 `lib/help` files as in this build), `commands.pdf` (upstream
  command card 2007), `changelog.txt` (`docs/changes-*.txt`, newest first,
  CR/CRLF + cp1252 → UTF-8/LF), `license.txt` (`docs/copying.txt`).
  Manual exists; **no walkthrough found** (random dungeon), said on the page.
- **Facts from the code**: 14 races (help said twelve: fixed in
  `make-help.py` ABOUT, Dúnadan + Drúedain were missing), 27 skills, 6 oaths,
  4 realms / 28 books / 207 spells (W50 P54 D51 N52), 50 talents, 18 shapes,
  607 monsters (88 uniques + 11 player-ghost templates), 535 object kinds,
  136 artifacts, 132 egos, 53 terrain, 118 vaults, MAX_DEPTH 128, quests
  Sauron 99 / Morgoth 100. Upstream src: 225,224 lines in 83 .c/.h
  (`git archive 230e028 src`).
- **Credits correction**: the 1.0.2 title screen (`lib/file/news.txt`) lists
  Petit, Gorse, Lighton, Marrick **and Joshua Middendorf**; the 1.0.1 splash
  `news.png` only the four. 1.0.x developers per `docs/readme.txt`:
  Middendorf, Christer Nyfält, Scott Yost.
- **Trivia sources**: RogueBasin, archive.org, narkive, angband.live,
  wikipedia, namu, setsideb are all blocked here (proxy 403, WebFetch
  EGRESS_BLOCKED). Reachable: `storage.googleapis.com/google-code-archive/
  v2/code.google.com/skills-angband/` `project.json`, `downloads-page-1.json`,
  `issues-page-N.json`, `issues/issue-N.json` (191 issues; used #97, #103,
  #181); `wikis.json` 403. Trivia also from the shipped changelogs/manual.
- **Cheats (tested in the web build)**: `Ctrl+A` debug (confirm → "Debug
  Command:"), wizard `Ctrl+W` is eaten by the browser → `^` then `w` (the
  game's "Control:" prefix) reaches the wizard confirm. Cheat options:
  know monster info, multiple lives, skills past power 100.
- **Links**: card Info button + tree ✦ (roguelikes index.html); game page
  `#bar h1` already linked `../shrine/sangband.html` (+ CSS) since stage 5
  (inherited from NPP's page). og block written by og.py's shrine loop run for
  this shrine only (card image `img/sangband.png`).
- **Checked**: shrine 375 px scrollWidth = innerWidth (also help.html), 1440
  px screenshots looked at, every local link/image 200.
- **Mac / deploy**: after the orchestrator pushes: roguelikes `deploy.sh`
  (merge the branch into main first, as stage 7), game `git pull && sh
  web/build.sh && sh web/deploy.sh` (help.html race count changed); then
  check https://ruzzoli.de/roguelikes/shrine/sangband.html, the card Info, the
  tree ✦ and the game-title link.
- **Open**: nothing deployed; RogueBasin's 2 Sep 1994 date still unread
  first-hand; Google Code link targets not openable from the cloud.
- **Next**: stage 9 (graveyard + leaderboard).
