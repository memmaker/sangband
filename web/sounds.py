#!/usr/bin/env python3
"""Write the web build's sound.cfg and copy the used samples.

Sangband's own samples (lib/xtra/sound + sound.cfg, shipped upstream) come
first; the cfg's names are matched case-insensitively (it says 'yes.wav' for
'Yes.wav') and names it gives for files it never shipped (failed.wav,
amiss.wav, ...) are dropped.  Events it leaves empty are filled from the
Dubtrain Angband Sound Pack v3.1.0 (web/dubtrain: the used mp3s + sound.prf,
CC BY 4.0).  A melee miss is a swing (RVIP-Finetuning "Sound"): Sangband's
own 'miss' is a crossbow sample, so it gets plc_miss_swish; missiles get the
arrow samples.  'walk' stays silent (every step), ambient_* are never raised.

Usage: sounds.py <sound.cfg to write> <sound dir>   (web/build.sh)"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
OWN = os.path.join(HERE, '../lib/xtra/sound')
PACK = os.path.join(HERE, 'dubtrain')

# Sangband event -> Dubtrain (Angband 4.2 sound.prf) events, where the names
# differ or 4.2 has none; missing here = the event name in upper case
MAP = {'walk': '', 'identify_bad': 'IDENT_BAD', 'identify_ego': 'IDENT_EGO', 'identify_art': 'IDENT_ART',
       'breathe_elements': 'BR_ELEMENTS', 'breathe_confusion': 'BR_CHAOS', 'breathe_disenchant': 'BR_DISEN',
       'summon_monster': 'SUM_MONSTER', 'summon_angel': 'SUM_AINU', 'summon_undead': 'SUM_UNDEAD',
       'summon_animal': 'SUM_ANIMAL', 'summon_spider': 'SUM_SPIDER', 'summon_hound': 'SUM_HOUND',
       'summon_hydra': 'SUM_HYDRA', 'summon_demon': 'SUM_DEMON', 'summon_dragon': 'SUM_DRAGON',
       'summon_gr_undead': 'SUM_HI_UNDEAD', 'summon_gr_dragon': 'SUM_HI_DRAGON',
       'summon_gr_demon': 'SUM_HI_DEMON', 'summon_ringwraith': 'SUM_WRAITH', 'summon_unique': 'SUM_UNIQUE',
       'pseudo_id': 'NOTICE', 'mon_create_trap': 'CREATE_TRAP', 'mon_shriek': 'SHRIEK',
       'mon_cast_fear': 'CAST_FEAR', 'cast_spell': 'SPELL', 'pray_prayer': 'PRAYER',
       # Sangband's own events (monster missiles, new timed effects): the closest 4.2 sound
       'shot': 'SHOOT', 'arrow': 'SHOOT', 'bolt': 'SHOOT', 'missl': 'SHOOT', 'pmissl': 'SHOOT',
       'boulder': 'HITWALL', 'spit': 'MON_SPIT', 'whip': 'MON_HIT', 'yell_for_help': 'SHRIEK',
       'br_wind': 'BR_FORCE', 'br_mana': 'BR_PLASMA', 'diseased': 'POISONED', 'steelskin': 'SHIELD',
       'holy': 'BLESSED', 'necro_rage': 'BERSERK', 'wiz_prot': 'SHIELD', 'invis': 'SEE_INVIS',
       'mania': 'BERSERK', 'res_dam': 'SHIELD', 'res_ethereal': 'SHIELD',
       'mon_blow_soft': 'MON_HIT', 'mon_blow_medium': 'MON_HIT', 'mon_blow_hard': 'MON_HIT',
       'mon_blow_deadly': 'MON_HIT'}
for b in ('frost', 'elec', 'acid', 'gas', 'fire', 'chaos', 'shards', 'sound', 'light', 'dark', 'nether',
          'nexus', 'time', 'inertia', 'gravity', 'plasma', 'force'):
    MAP['breathe_' + b] = 'BR_' + b.upper()
SWISH = 'plc_miss_swish.mp3'
MISSILES = ('shoot', 'shot', 'arrow', 'bolt', 'missl', 'pmissl')

src = open(os.path.join(HERE, '../src/variable.c'), encoding='latin-1').read()
EVENTS = re.findall(r'"(\w*)"', src.split('angband_sound_name[MSG_MAX] =')[1].split('};')[0])

have = {f.lower(): f for f in os.listdir(OWN)}
own = {}
for line in open(os.path.join(OWN, 'sound.cfg'), encoding='latin-1'):
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        own[k.strip()] = [have[f.lower()] for f in re.split(r'[\s,]+', v) if f.lower() in have]
pack = {}
for line in open(os.path.join(PACK, 'sound.prf'), encoding='latin-1'):
    m = re.match(r'sound:(\w+):(.*)', line.strip())
    if m:
        pack[m[1]] = [f + '.mp3' for f in m[2].split() if os.path.exists(os.path.join(PACK, f + '.mp3'))]

cfg_path, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
lines = ['# Sangband web build: own samples, gaps from Dubtrain v3.1.0 (web/sounds.py)', '[Sound]']
n_own = n_pack = 0
silent = []
for e in EVENTS:
    if not e or e == 'walk' or e.startswith('ambient_'):
        continue
    files, d = own.get(e, []), OWN
    if e == 'miss':
        files, d = [SWISH], PACK
    if files and d == OWN:
        n_own += 1
    else:
        if not files:
            files = sorted({f for n in MAP.get(e, e.upper()).split() for f in pack.get(n, [])})
            if e in MISSILES:
                files = [f for f in files if f != SWISH]
        d = PACK
        n_pack += 1
    if not files:
        silent.append(e)
    for f in files:
        shutil.copy(os.path.join(d, f), out)
    lines.append(f'{e} = {" ".join(files)}')
open(cfg_path, 'w').write('\n'.join(lines) + '\n')
print(f'sounds.py: {n_own} events own samples, {n_pack} Dubtrain, silent: {" ".join(silent) or "none"}',
      file=sys.stderr)
