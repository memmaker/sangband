#!/usr/bin/env python3
"""Build web/tiles.png from Sangband's own David Gervais 32x32 sheet.

lib/xtra/graf/32x32.bmp (8-bit palette) + 32x32m.bmp (1-bit mask: 0 = sprite,
1 = transparent) -> RGBA PNG, 128 x 30 tiles of 32x32 (the pref files'
attr/char & 0x7F = row/column). Lossless; run after changing the sheet.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
G = os.path.join(ROOT, 'lib/xtra/graf')
im = Image.open(os.path.join(G, '32x32.bmp')).convert('RGBA')
mask = Image.open(os.path.join(G, '32x32m.bmp')).convert('L')
im.putalpha(mask.point(lambda v: 0 if v else 255))
out = os.path.join(ROOT, 'web/tiles.png')
im.save(out, optimize=True)
print(out, os.path.getsize(out), 'bytes', im.size)
