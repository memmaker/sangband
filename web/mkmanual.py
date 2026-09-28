# Shrine files for Sangband: the in-game help (lib/help, Angband 3.0-style plain text) as one
# HTML page, plus the upstream docs (manual, command card, changelog, licence) next to it.
#   python3 web/mkmanual.py ~/Games/roguelikes-index/shrine/sangband
import html, os, re, shutil, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
H = os.path.join(ROOT, 'lib', 'help')
D = os.path.join(ROOT, 'docs')
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(OUT, exist_ok=True)


def read(p):
    b = open(p, 'rb').read()
    try: t = b.decode('utf-8')
    except UnicodeDecodeError: t = b.decode('cp1252', errors='replace')
    return t.replace('\r\n', '\n').replace('\r', '\n')


order, seen = [], set()
def visit(f):
    if f in seen or not os.path.exists(f'{H}/{f}'): return
    seen.add(f); order.append(f)
    for m in re.finditer(r'^\*\*\*\*\* \[.\] (\S+)', read(f'{H}/{f}'), re.M): visit(m.group(1))
visit('help.hlp')
for f in sorted(os.listdir(H)):  # files the menus don't reach
    if f not in seen: seen.add(f); order.append(f)
def fid(f): return f.replace('.', '-')
def body(f):
    lines = [l for l in read(f'{H}/{f}').split('\n') if not l.startswith('***** ')]  # menu targets: hidden in the game too
    t = html.escape('\n'.join(lines).rstrip())
    return re.sub(r'\(([a-z_-]+\.(?:txt|hlp))\)', lambda m: f'(<a href="#{fid(m.group(1))}">{m.group(1)}</a>)' if m.group(1) in seen else m.group(0), t)

with open(f'{OUT}/help.html', 'w', encoding='utf-8') as o:
    o.write('''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sangband · In-game help</title>
<style>body{background:#0b0a09;color:#d8d2c4;font:14px/1.45 "IBM Plex Mono",monospace;margin:0;padding:16px}
a{color:#e0b060}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 2em}h2{color:#e0b060;font-size:16px;border-bottom:1px solid #3a342a;padding-top:8px}
nav a{margin-right:1em;white-space:nowrap}</style></head><body>
<p><a href="../sangband.html">&larr; Sangband shrine</a> · In-game help of Sangband 1.0.2 (<kbd>?</kbd>), <code>lib/help/</code> as in the web build
(the port added the explore, stair-walk and command-menu lines and fixed four stale roguelike-keyset rows). The full manual is <a href="manual.html">manual.html</a>.</p>
''')
    o.write('<nav>' + ' '.join(f'<a href="#{fid(f)}">{f}</a>' for f in order) + '</nav>\n')
    for f in order: o.write(f'<h2 id="{fid(f)}">{f}</h2>\n<pre>{body(f)}</pre>\n')
    o.write('</body></html>\n')

# Upstream docs, unchanged (manual.html is UTF-8 already; text files to UTF-8 + LF)
shutil.copy(f'{D}/manual.html', f'{OUT}/manual.html')
shutil.copy(f'{D}/Commands.pdf', f'{OUT}/commands.pdf')
open(f'{OUT}/license.txt', 'w', encoding='utf-8').write(read(f'{D}/copying.txt'))
logs = ['changes-101 to 102.txt', 'changes-100 to 101.txt', 'changes-099-21 to 100.txt',
        'changes-099-16 to 099-20d.txt', 'changes-096 to 099-15.txt', 'changes-080 to 095.txt']
with open(f'{OUT}/changelog.txt', 'w', encoding='utf-8') as o:
    o.write('Sangband change logs, newest first: docs/changes-*.txt of the 1.0.2 source release\n\n')
    for f in logs:
        o.write('=' * 78 + f'\n{f}\n' + '=' * 78 + '\n\n' + read(f'{D}/{f}').strip() + '\n\n')
print('wrote', len(order), 'help files +', ', '.join(sorted(os.listdir(OUT))))
