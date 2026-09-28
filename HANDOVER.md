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
