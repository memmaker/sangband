#!/usr/bin/env python3
"""Tile coverage of lib/pref/graf32-g.prf (Gervais 32x32) against the edit files.

Covered = the pref gives the entry a tile (attr and char both >= 0x80), directly
or (features) through the mimic, (objects) through the flavour, (monsters) R:.
Also checks that every referenced tile is non-empty in the sheet.
Usage: python3 web/tile-coverage.py [prf] [--missing]   (e.g. lib/pref/graf16-g.prf)
"""
import sys, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = os.path.join(ROOT, 'lib/edit')
prf = next((a for a in sys.argv[1:] if not a.startswith('-')), os.path.join(ROOT, 'lib/pref/graf32-g.prf'))
show = '--missing' in sys.argv

def val(s):
    s = s.strip()
    if s.startswith('+') and s[1:2].isdigit():
        v = int(s[1:], 0) & 0xFF
        return v + 128 if v < 128 else v
    if s[:1].isdigit():
        return int(s, 0) & 0xFF
    return -1  # a character / colour letter = text

def entries(path):
    out, cur = [], None
    for line in open(path, encoding='latin-1'):
        line = line.rstrip('\r\n')
        if line.startswith('N:'):
            p = line.split(':')
            cur = {'idx': int(p[1]), 'name': ':'.join(p[2:]), 'raw': p}
            out.append(cur)
        elif cur is not None and len(line) > 1 and line[1] == ':':
            cur.setdefault(line[0], []).append(line[2:])
    return out

R, K, F, L = {}, {}, {}, {}
lines = open(prf, encoding='latin-1').read().replace('\r', '').split('\n')
for l in lines:
    if len(l) < 3 or l[1] != ':' or l[0] not in 'RKFL':
        continue
    t = re.split('[:/]', l[2:])
    a, c = val(t[1]), val(t[2])
    {'R': R, 'K': K, 'F': F, 'L': L}[l[0]][int(t[0], 0)] = (a, c)
tile = lambda p: p and p[0] >= 128 and p[1] >= 128

mons = entries(os.path.join(E, 'monster.txt'))
objs = entries(os.path.join(E, 'object.txt'))
flav = entries(os.path.join(E, 'flavor.txt'))
terr = entries(os.path.join(E, 'terrain.txt'))
ftv = {int(f['raw'][2]) for f in flav}

def report(name, items, ok):
    miss = [i for i in items if not ok(i)]
    n = len(items)
    print(f'{name:10s} {n - len(miss):4d}/{n:<4d} {100.0 * (n - len(miss)) / n:5.1f}%')
    if show:
        for i in miss:
            print(f'    missing {i["idx"]}: {i["name"]}')
    return n, len(miss)

tot = [0, 0]
def add(r):
    tot[0] += r[0]; tot[1] += r[1]

# monster 0 is the player: R:0:0:0 = the per race/specialty B: lines
add(report('monsters', [m for m in mons if m['idx']], lambda m: tile(R.get(m['idx']))))
def kind_ok(k):
    tv, sv = (int(x) for x in k['I'][0].split(':')[:2]) if 'I' in k else (0, 0)
    # Flavoured kinds are drawn from their flavour (rods take wand flavours);
    # scrolls only until known, then from their own K: line.
    if (tv in ftv or tv == 66) and not (tv == 80 and sv >= 29) and tv != 70:
        return True
    return tile(K.get(k['idx']))
add(report('objects', [o for o in objs if o['idx']], kind_ok))
add(report('flavours', flav, lambda f: tile(L.get(f['idx']))))
def feat_ok(f):
    m = int(f['M'][0]) if 'M' in f else f['idx']
    return tile(F.get(m))
add(report('features', [f for f in terr if f['idx']], feat_ok))
print(f'{"total":10s} {tot[0] - tot[1]:4d}/{tot[0]:<4d} {100.0 * (tot[0] - tot[1]) / tot[0]:5.1f}%')

# Empty-tile check against the prf's own sheet (lib/xtra/graf <n>x<n>.bmp + mask)
N = 16 if '16' in os.path.basename(prf) else 32
try:
    from PIL import Image
    G = os.path.join(ROOT, 'lib/xtra/graf')
    mask = Image.open(os.path.join(G, f'{N}x{N}m.bmp')).convert('L')
    empty = set()
    for d in (R, K, F, L):
        for a, c in d.values():
            if a >= 128 and c >= 128:
                x, y = (c & 0x7F) * N, (a & 0x7F) * N
                if x + N > mask.width or y + N > mask.height or mask.crop((x, y, x + N, y + N)).getextrema()[0] == 255:
                    empty.add((a & 0x7F, c & 0x7F))
    print(f'{N}x{N} sheet: empty tiles referenced:', sorted(empty) if empty else 'none')
except ImportError:
    pass
