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
