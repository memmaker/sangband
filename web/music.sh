#!/bin/sh
# Render Sangband's own music (lib/xtra/music: .it modules and .mid files,
# picked by jukebox.cfg) to web/music/*.ogg, which browsers can play.
# Run once by hand; the oggs are committed (build.sh copies web/music).
# Needs openmpt123 (.it), timidity with the FluidR3 GM soundfont (.mid) and
# ffmpeg with libvorbis:  apt-get install openmpt123 timidity fluid-soundfont-gm ffmpeg
set -e
cd "$(dirname "$0")/.."
SRC=lib/xtra/music OUT=web/music TMP=$(mktemp -d)
mkdir -p "$OUT"
# only the tunes jukebox.cfg names (intro.mid and odetojoy.mid are unused)
for f in $(tr -d "\r" < "$SRC/jukebox.cfg" | sed -n "s/^[a-z]* *= *//p" | tr " " "\n" | sort -u); do
	b=${f%.*}
	case "$f" in
	*.it) cp "$SRC/$f" "$TMP/$f"; openmpt123 --quiet --render --force --output-type wav "$TMP/$f" >/dev/null
		mv "$TMP/$f.wav" "$TMP/$b.wav" ;;
	*.mid) timidity -Ow -o "$TMP/$b.wav" "$SRC/$f" >/dev/null ;;
	esac
	ffmpeg -v error -y -i "$TMP/$b.wav" -ar 44100 -ac 2 -c:a libvorbis -q:a 0 "$OUT/$b.ogg"
	rm -f "$TMP/$b.wav"
done
rm -rf "$TMP"
ls -la "$OUT"
