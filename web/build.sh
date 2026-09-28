#!/bin/sh
# Build Sangband for the browser (Emscripten + Asyncify).
# Output goes to web/dist (served next to ../rvip-wm.js, ../rvip-app.js).
# emcc on PATH, else ${EMSDK:-/home/user/emsdk} (cloud; see RVIP W7).
set -e
cd "$(dirname "$0")/.."
command -v emcc >/dev/null 2>&1 || PATH="${EMSDK:-/home/user/emsdk}/upstream/emscripten:$PATH"
OUT=web/dist
rm -rf "$OUT" web/stage && mkdir -p "$OUT" web/stage/lib

# Game files: edit/file/help/pref (+ info); lib/data/*.raw are rebuilt by
# the game at start; save/apex/bone/user are IndexedDB mounts (sangband.js)
for d in edit file help pref info; do cp -R lib/$d web/stage/lib/; done
for d in data save apex bone user xtra; do mkdir -p web/stage/lib/$d; done
# Audio config for the page (read from the FS, never fetched): the web
# sound.cfg (web/sounds.py: own samples + Dubtrain gaps, files to dist/sound)
# and the game's jukebox.cfg (tunes rendered to web/music/*.ogg by music.sh)
mkdir -p web/stage/lib/xtra/sound web/stage/lib/xtra/music
python3 web/sounds.py web/stage/lib/xtra/sound/sound.cfg "$OUT/sound"
cp lib/xtra/music/jukebox.cfg web/stage/lib/xtra/music/

# Sources: as Makefile.std (no intrface.c: the SDL/Windows GUI layer; no
# borgdumb.c), with the web front end instead of main-gcu.c
SRCS=$(ls src/*.c | grep -v '/main\|/intrface\.c\|/borgdumb\.c')

# Warnings stay on (RVIP W8: signature mismatches must be seen)
emcc -O2 -fcommon -std=gnu99 -DUSE_WEB -Isrc \
	-Wno-deprecated-non-prototype -Wno-parentheses -Wno-dangling-else \
	$SRCS src/main.c src/main-web.c \
	-o "$OUT/sangband-core.js" \
	-sASYNCIFY -sASYNCIFY_STACK_SIZE=65536 -sSTACK_SIZE=1048576 \
	-sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=64MB \
	-sEXPORTED_FUNCTIONS=_main,_web_request_save,_web_where,_web_set_tiles \
	-sEXPORTED_RUNTIME_METHODS=FS,IDBFS,HEAPU8,addRunDependency,removeRunDependency \
	-sFORCE_FILESYSTEM -lidbfs.js -sENVIRONMENT=web \
	--preload-file web/stage/lib@/sangband/lib

cp web/index.html web/sangband.js web/tiles.png "$OUT/"
# Help: the game guide (web/make-help.py; key list from lib/help/cmdlist.txt)
python3 web/make-help.py > "$OUT/help.html"
# Audio the page may fetch: only what ships (nothing missing is requested)
SND=false; MUS=false
if [ -d "$OUT/sound" ]; then SND=true; fi
if [ -d web/music ]; then cp -R web/music "$OUT/"; MUS=true; fi
echo "{\"sound\": $SND, \"music\": $MUS}" > "$OUT/audio.json"
# Shared files the page loads from one level up (never copied into the repo):
# ../rvip-wm.js, ../rvip-app.js, ../rvip-sound.js from rvip-tools, ../fonts/
# from the selection page. Mac: ~/Games/rvip-tools/web, ~/Games/roguelikes-index;
# cloud: /home/user/rvip/web, /home/user/roguelikes. Override with RVIP_WEB /
# ROGUELIKES (or FONTS for the font folder alone).
RVIP_WEB="${RVIP_WEB:-$HOME/Games/rvip-tools/web}"
[ -f "$RVIP_WEB/rvip-wm.js" ] || RVIP_WEB=/home/user/rvip/web
ROGUELIKES="${ROGUELIKES:-$HOME/Games/roguelikes-index}"
[ -d "$ROGUELIKES/fonts" ] || ROGUELIKES=/home/user/roguelikes
FONTS="${FONTS:-$ROGUELIKES/fonts}"
# Font choosers: the index page's fonts/*.woff (the page loads ../fonts/)
(ls "$FONTS" 2>/dev/null | sed -n 's/\.woff$//p') | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))' > "$OUT/fonts.json"
rm -rf web/stage
# Local test site web/serve (as on the server): rvip-*.js + fonts one level
# above the game folder. Serve: cd web/serve && python3 -m http.server 8000,
# then open http://localhost:8000/sangband/
rm -rf web/serve && mkdir -p web/serve
for f in rvip-wm.js rvip-app.js rvip-sound.js; do
	if [ -f "$RVIP_WEB/$f" ]; then ln -s "$RVIP_WEB/$f" web/serve/; else echo "warning: no $RVIP_WEB/$f (set RVIP_WEB)"; fi
done
if [ -d "$FONTS" ]; then ln -s "$FONTS" web/serve/fonts; else echo "warning: no font folder $FONTS (set ROGUELIKES or FONTS)"; fi
ln -s ../dist web/serve/sangband
ls -la "$OUT"
