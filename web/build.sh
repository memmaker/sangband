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
# Help: the game guide (make-help.py, stage 6), else a short stand-in
if [ -f web/make-help.py ]; then python3 web/make-help.py > "$OUT/help.html"; else cp web/help-stub.html "$OUT/help.html"; fi
# Audio the page may fetch: only what ships (nothing missing is requested)
SND=false; MUS=false
if [ -d web/sound ]; then cp -R web/sound "$OUT/"; SND=true; fi
if [ -d web/music ]; then cp -R web/music "$OUT/"; MUS=true; fi
echo "{\"sound\": $SND, \"music\": $MUS}" > "$OUT/audio.json"
# Font choosers: the index page's fonts/*.woff (the page loads ../fonts/)
FONTS="${FONTS:-$HOME/Games/roguelikes-index/fonts}"
[ -d "$FONTS" ] || FONTS=/home/user/roguelikes/fonts
(ls "$FONTS" 2>/dev/null | sed -n 's/\.woff$//p') | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))' > "$OUT/fonts.json"
rm -rf web/stage
ls -la "$OUT"
