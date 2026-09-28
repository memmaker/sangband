#!/bin/sh
# Upload web/dist to https://ruzzoli.de/roguelikes/sangband/ (only from pushed commits, RVIP step 9)
# Build first: sh web/build.sh
cd "$(dirname "$0")" && git fetch -q origin && [ -z "$(git status --porcelain)" ] && [ "$(git rev-parse @)" = "$(git rev-parse origin/main)" ] || { echo "commit + push first"; exit 1; }
set -e
[ -f dist/sangband-core.wasm ] || { echo "no web/dist: run web/build.sh first"; exit 1; }
ssh ruzzoli.de 'sudo mkdir -p /var/www/ruzzoli.de/roguelikes/sangband && sudo chown -R felix:www-data /var/www/ruzzoli.de/roguelikes/sangband'
rsync -rtz --delete dist/ ruzzoli.de:/var/www/ruzzoli.de/roguelikes/sangband/
