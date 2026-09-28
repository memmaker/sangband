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
