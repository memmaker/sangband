#!/usr/bin/env python3
"""Writes the in-page game guide (dist/help.html) for the Sangband web build,
or with --docs a standalone page (docs/web/sangband-docs.html) in the shape
of the Docs collection's pages.

On the Mac the game content comes from the desktop key guides in
~/Desktop/Games/Roguelikes/Docs (build-docs.py + guides.py, entry
'sangband.html') once that entry exists, so both guides stay in sync; without
it (cloud) the same content comes from the constants below, written to be
pasted into the Docs entry (TAGLINE, ESSENTIALS, Tips, Credits = GAMES entry;
ABOUT + GUIDE = GUIDES entry).  The complete key list is parsed from the
game's own lib/help/cmdlist.txt either way (both keysets).

  python3 web/make-help.py > web/dist/help.html        (web/build.sh)
  python3 web/make-help.py --docs > docs/web/sangband-docs.html"""
import html, importlib.util, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
esc = html.escape
UPSTREAM = '230e028'


def kbd(k):
    return ' '.join(f'<kbd>{esc(p)}</kbd>' for p in k.split(' / '))


TAGLINE = ('Sangband 1.0.2 ("Skills Angband") by Leon Marrick and the Sangband team: an Angband '
           'variant without character classes. You earn experience and spend it on 27 skills, and '
           'what you raise decides whether you become a warrior, a spellcaster, a burglar or '
           'something in between.')

ESSENTIALS = [
    ('Moving', [('1-9 / arrows', 'Walk (numpad or digits)'), ('Shift + direction', 'Run'),
                ('H / O', 'Auto-explore (O also in the roguelike keyset)'),
                ('<', 'Go up (walks to a known up staircase first)'),
                ('>', 'Go down (walks to a known down staircase first)'),
                ('R', 'Rest (& = as needed, * = until HP/SP are full)'), ('S', 'Start/stop sneaking')]),
    ('Items', [('i', 'Inventory (cursor, Enter = item menu)'), ('e', 'Equipment'), ('g', 'Pick up'),
               ('w', 'Wear / wield'), ('t', 'Take off'), ('d', 'Drop'), ('q', 'Quaff a potion'),
               ('r', 'Read a scroll'), ('E', 'Eat'), ('F', 'Fuel your torch or lantern')]),
    ('Fighting', [('Move into a monster', 'Attack it'), ('f', 'Fire a missile'), ('v', 'Throw'),
                  ('m', 'Cast a spell (once you have a realm)'), ('p', 'Perform a combat talent'),
                  ('[', 'Use talents'), ('a / u / z', 'Aim a wand / use a staff / zap a rod'),
                  ('|', 'Switch weapons or change barehanded combat method')]),
    ('Skills and information', [('$', 'Advance skills (spend experience)'), ('Enter', 'Menu of all commands'),
                                ('l', 'Look around'), ('C', 'Character sheet'), ('Ctrl+P', 'Previous messages'),
                                ('Ctrl+Q', 'Your quests'), ('~', 'Knowledge menus'), ('?', 'In-game help')]),
    ('Game', [('Ctrl+S', 'Save'), ('Ctrl+X', 'Save and quit'), ('=', 'Options')]),
]

KEY_HINTS = [
    ('?', 'In-game help: every command, with explanations'),
    ('H / O', 'Auto-explore: walk to the nearest unexplored spot (O in both keysets)'),
    ('Enter', 'Menu of all commands'),
    ('<', 'Go up (walks to the nearest known up staircase; press again to climb)'),
    ('>', 'Go down (walks to the nearest known down staircase; press again to descend)'),
    ('Ctrl+S', 'Save'),
]

ABOUT = '''<p><strong>Sangband</strong> ("Skills Angband") is one of the oldest Angband variants and among the
first roguelikes with skills instead of classes. Chris Petit released it in March 1994; Michael Gorse
(1995–97) and Julian Lighton (1997–2001) carried it on, and Leon Marrick, maintainer from 2001, rebuilt
it into version 1.0.0 (2007). This is 1.0.2 (2011), with Joshua Middendorf among the developers. The goal
is Angband's: go down through the dungeon below the town and defeat Sauron (level 99) and Morgoth, Lord
of Darkness (level 100).</p>
<ul>
<li><strong>No classes.</strong> You pick a sex and one of twelve races (Human, Elf, Hobbit, Gnome,
Dwarf, Half-Orc, Half-Troll, High-Elf, Dark-Elf, Giant, Ent, Beorning). Everything else comes from the
27 skills you raise with the experience you earn.</li>
<li><strong>Oaths:</strong> commit to the Oath of Iron (the great warrior arts), one of the four
magic Oaths, or the Burglars' Guild, and give up the others for good.</li>
<li><strong>Four realms of magic:</strong> Wizardry, Piety, Druidic Lore and Necromancy, seven books
each. Druids watch the weather; druids and necromancers change shape.</li>
<li><strong>Talents</strong> (<kbd>[</kbd>, <kbd>p</kbd>) that come with skill levels, and
<strong>forging</strong>: weapons, armour, potions, scrolls, rings and amulets made from components and
magical essences found in the dungeon.</li>
<li><strong>Quests</strong> from the town's Inn, and a <strong>score</strong> that rewards killing
uniques with as few skills as possible.</li>
</ul>'''

TIPS = '''<ul>
<li>Press <kbd>$</kbd> before your first trip down: you start with a little unspent experience, enough
for a point or two in <strong>Wrestling</strong> or <strong>Karate</strong> and in <strong>Throwing</strong>
or <strong>Archery - Slings</strong> (the game's own tutorial advice).</li>
<li>You start with food, torches and gold but <strong>no weapon or armour</strong>: buy flasks of oil (General
Store, <kbd>1</kbd>) to throw with <kbd>v</kbd>, or a sling and shots (Weapon Smiths, <kbd>3</kbd>), some light
armour, and Cure Light Wounds potions and Phase Door scrolls (Temple <kbd>4</kbd>, Alchemy Shop <kbd>5</kbd>).
Wield a torch (<kbd>w</kbd>) before you go down.</li>
<li>Raise a few skills well rather than many a little: costs climb quickly with the level, similar
skills make each other cheaper, and skills you have not practised cost extra (the price shows grey,
then yellow, orange and red).</li>
<li><kbd>H</kbd> explores until something happens; press it again after each stop. <kbd>&gt;</kbd> walks to the
nearest known down staircase, and a second <kbd>&gt;</kbd> takes it.</li>
<li>Rest (<kbd>R</kbd> <kbd>&amp;</kbd> <kbd>Enter</kbd>) after fights, and look at a monster
(<kbd>l</kbd>) before you fight it.</li>
<li>Once you can afford it, buy a lantern and a shovel or pick, and keep a scroll of Word of Recall to get
back to town.</li>
</ul>'''

GUIDE = [
    ('Your first character', '''<p>After the title screen press a key and choose <em>New Character</em>. Pick a
sex and a race (the race matters much more: it sets your stats, abilities and which skills come easily),
then either enter minimum stats or just press <kbd>Enter</kbd> for each, accept the odds, and type a name.
Right after you arrive in town the game offers its own short tutorial: press <kbd>?</kbd> at that
moment to read it.</p>'''),
    ('Experience and skills: how Sangband works', '''<p>Sangband has no character level to grind
towards. Killing monsters, learning what objects do, casting a spell for the first time, disarming
traps and unlocking doors earn <strong>experience</strong>, and experience is money you spend.
The sidebar shows it as <em>EXP</em> (unspent experience). Press <kbd>$</kbd> for the skills screen:</p>
<ul>
<li>Choose a skill with its letter (<kbd>a</kbd>–<kbd>z</kbd>, <kbd>:</kbd>) or the cursor keys. The top lines
say what the next point costs and what the skill does.</li>
<li><kbd>+</kbd> (or <kbd>=</kbd>) raises it, <kbd>-</kbd> lowers it (you get the experience back for points
raised on this visit), <kbd>Enter</kbd> keeps the changes, <kbd>Esc</kbd> throws them away, <kbd>?</kbd> is
the skills help.</li>
<li>Your <strong>power</strong> (bottom left) grows with the skills you own. It gives you hit points,
and the experience needed to raise skills goes up with it.</li>
</ul>
<p>The skills fall into groups: melee (Swordsmanship, Clubbing, Jousting, and the barehanded Wrestling and
Karate), missiles (three kinds of Archery, Throwing), magic (Spellcasting, Magical Power and one skill per
realm), Magical Device, the rogue's Burglary, Perception, Stealth, Disarming, Dodging and Spell
Resistance, the four forging skills (Weaponsmithing, Armor Forging, Alchemy, Magical Infusion) and
Shapechange.</p>
<p>Three rules decide how cheap a skill is. <strong>Cost climbs fast</strong> with its level, so a
character who spreads points over everything ends up good at nothing. <strong>Similar skills help each
other</strong>: Swordsmanship at 30 makes Jousting up to 30 cost half. <strong>Practice matters</strong>:
a fighting, magic, device, burglary or disarming skill you have hardly used costs extra, so raise skills
you actually use. The game also keeps a <strong>score</strong> that is higher the fewer skills you needed to
beat each unique.</p>'''),
    ('Becoming a warrior, a caster or a burglar', '''<p>You choose a path by what you raise, and some
steps are for good:</p>
<ul>
<li><strong>Magic:</strong> raising Spellcasting lets you pick a realm (Sorcery, Piety, Druidic magic or
Necromancy). Buy the realm's first book in the Bookstore (<kbd>7</kbd>), then cast with <kbd>m</kbd>: you do
not learn spells one by one, every spell of a level up to your Spellcasting skill is yours. Piety wants
blunt or blessed weapons.</li>
<li><strong>Oaths:</strong> a combat skill of 25 opens the <em>Oath of Iron</em> (the strongest fighting,
most hit points, no magic at all). A realm skill (Wizardry, Holy Alliance, Nature Lore, Blood Dominion) of
20 opens that realm's Oath: full-strength spells and plenty of mana, but weaker at fighting. Burglary 20
opens the <em>Burglars' Guild</em>. You can take only one, and never go back.</li>
<li><strong>Talents</strong> come with skill levels and Oaths: <kbd>[</kbd> lists them, <kbd>p</kbd> uses a
combat talent.</li>
</ul>'''),
    ('The town and the dungeon', '''<p>Walk onto a number to enter a shop: <kbd>1</kbd> General Store,
<kbd>2</kbd> Armory, <kbd>3</kbd> Weapon Smiths, <kbd>4</kbd> Temple, <kbd>5</kbd> Alchemy Shop, <kbd>6</kbd>
Magic Shop, <kbd>7</kbd> Bookstore, <kbd>8</kbd> your Home (safe storage); the Inn (<kbd>+</kbd>) gives quests.
Inside, <kbd>p</kbd> buys, <kbd>s</kbd> sells, <kbd>I</kbd> inspects and <kbd>Esc</kbd> leaves. Night in town is
dangerous. You start on the town's down staircase: <kbd>&gt;</kbd> takes you into the dungeon, where every
level is new each time. Go deeper only as fast as your character can take it; if your hit points fall,
drink a potion, read Phase Door or run.</p>'''),
    ('Items', '''<p>Press <kbd>i</kbd>: the list has a cursor (<kbd>2</kbd>/<kbd>8</kbd>), a letter does an item's
main action, <kbd>Shift</kbd>+letter drops it, <kbd>Ctrl</kbd>+letter inspects it, <kbd>Enter</kbd> opens a
menu of everything you can do with it. Every prompt that asks for an item shows the list with the same
cursor. Unknown potions and scrolls are learned by use, and learning them earns experience too.</p>'''),
]

SAVING = '''<ul>
<li><strong>Saving is automatic.</strong> Every save goes straight into this browser's storage (IndexedDB). The page saves every two minutes while the game waits for your next command, and whenever you switch to another tab or window.</li>
<li><kbd>Ctrl+S</kbd> saves and keeps playing. <kbd>Ctrl+X</kbd> saves and quits; press <em>Play again</em> (or reload the page) to continue.</li>
<li>Reloading the page continues your newest living character. The browser asks before you leave a running game.</li>
<li>When your character dies you see the tombstone; <em>Play again</em> then opens the start menu for a new character.</li>
<li><em>File ▾ → Export save</em> downloads all your characters as one file (<code>sangband-save.json</code>); <em>Import save</em> loads such a file, or a single Sangband savefile. Use them for a backup or to move to another browser or computer. <em>New game</em> deletes the characters stored in this browser.</li>
<li>Your window layout, text sizes, window titles, fonts and the Tiles and Audio choices are stored in the same browser storage.</li>
<li>Private/incognito windows and "clear site data" delete the stored game. Export first if the character matters.</li>
</ul>'''

WEB = '''<ul>
<li><strong>Windows:</strong> the map fills the big window; Inventory and Visible (the monsters in view) are on the right, Messages along the bottom. Recall, Equipment and Character can be turned on under <em>Windows ▾</em>, which also puts the layout back.</li>
<li><strong>Resize windows</strong> by dragging the gaps between them; the game redraws them at their new size. Drag a title bar onto another window to move it there; the ✎ button on a title bar renames the window.</li>
<li><strong>Zoom:</strong> hover over a window's title bar for its <em>A−</em> / <em>A+</em> buttons: they change its text size, and on the Map the size of the tiles.</li>
<li><strong>Tiles</strong> switches between David Gervais' 32×32 tiles and text. In text mode the Map title bar has its own font choice; <em>Font</em> sets the other windows' font.</li>
<li><strong>Audio ▾:</strong> <em>Sound effects</em> and <em>Music</em> are off by default. The sounds are Sangband's own samples (gaps filled from the Dubtrain pack); the music is Sangband's own jukebox: town tunes, and in the dungeon quieter or wilder songs as the danger around you changes.</li>
<li><strong>Keys:</strong> arrow keys, the numeric keypad or <kbd>1</kbd>–<kbd>9</kbd> move you; <kbd>Shift</kbd> + direction runs. The mouse works in the command menu and the item lists (left click chooses, right click goes back).</li>
<li>Browsers keep a few shortcuts for themselves (<kbd>Ctrl+W</kbd>, <kbd>Ctrl+T</kbd>, <kbd>Ctrl+N</kbd>, and <kbd>Cmd</kbd> shortcuts on a Mac), so those never reach the game: in the roguelike keyset use the <kbd>Enter</kbd> menu (or <kbd>T</kbd> in the original keyset) to tunnel.</li>
<li>If the game ever crashes, a message appears at the top; reload the page to continue from your last save.</li>
</ul>'''

CREDITS = '''<ul>
<li><strong>Sangband</strong> by Chris Petit, Michael Gorse, Julian Lighton, Leon Marrick and Joshua Middendorf (title screen, <code>lib/file/news.txt</code>); 1.0.x by Leon Marrick with developers Joshua Middendorf, Christer Nyfält and Scott Yost and many contributors (<code>docs/readme.txt</code>).</li>
<li><strong>Angband</strong> by Alex Cutler, Andy Astrand, Sean Marsh, Geoff Hill, Charles Teague, Charles Swiger, Ben Harrison and Robert Rühlmann; based on <strong>Moria</strong> (© 1985 Robert Alan Koeneke) and <strong>Umoria</strong> (© 1989 James E. Wilson).</li>
<li>Licence: the source is GNU GPL version 2 (parts also under the Moria licence), as its file headers and <code>docs/copying.txt</code> state; artistic works keep their own terms.</li>
<li><strong>Tiles:</strong> David Gervais' 32×32 tiles as shipped with Sangband (copyrighted freeware; palette tweaks by Leon Marrick).</li>
<li><strong>Sounds:</strong> Sangband's own samples (<code>lib/xtra/sound</code>); missing events from the Dubtrain Angband Sound Pack v3.1.0 by Dubtrain (dubtrain.com/angband), Creative Commons Attribution 4.0.</li>
<li><strong>Music:</strong> Sangband's own tunes (<code>lib/xtra/music/jukebox.cfg</code>): from Angband; from ToME by Reenen Laurie (with Dirk Laurie, and Grieg's "Åse's Death"), GPL; from Falcon's Eye by Jaakko Peltonen, NetHack General Public License. Rendered to Ogg for the browser (MIDI with the FluidR3 GM soundfont).</li>
</ul>'''


# Desktop Docs entry, when it exists, wins (same fields)
DOCS = os.path.expanduser('~/Desktop/Games/Roguelikes/Docs')
PAGE = 'sangband.html'
if os.path.exists(os.path.join(DOCS, 'build-docs.py')) and not os.environ.get('SANGBAND_NO_DOCS'):
    sys.path.insert(0, DOCS)
    spec = importlib.util.spec_from_file_location('build_docs', os.path.join(DOCS, 'build-docs.py'))
    docs = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(docs)
    from guides import GUIDES   # noqa: E402
    game = next((g for g in docs.GAMES if g['file'] == PAGE), None)
    if game and PAGE in GUIDES:
        info = dict(game['info'])
        TAGLINE, ESSENTIALS, TIPS, CREDITS = game['tagline'], game['essentials'], info['Tips'], info['Credits']
        ABOUT, GUIDE = GUIDES[PAGE][0][1], GUIDES[PAGE][1:]


def parse_keys(section):
    """(key, description) rows of one keyset of lib/help/cmdlist.txt: two
    columns, the right one starting at column 40; '(unused)', '(special ...)'
    and the '(walk - ...)' keymap rows are left out."""
    out = []
    for line in section.split('\n'):
        if not re.match(r'^ \S  ', line):
            continue
        for part in (line[:40], line[40:]):
            m = re.match(r'^\s*(\^?\S)\s{1,2}(\S.*?)\s*$', part)
            if not m or m[2].startswith('('):
                continue
            k, d = m[1], m[2]
            if k == '^M':
                k, d = 'Enter', 'Command menu'
            elif k.startswith('^'):
                k = 'Ctrl+' + k[1]
            out.append((k, d))
    return out


def all_keys():
    """Original keyset, then the roguelike rows that differ, marked"""
    t = open(os.path.join(HERE, '../lib/help/cmdlist.txt'), encoding='latin-1').read().replace('\r', '')
    orig = t.split('--- Original keyset ---')[1].split('--- Roguelike keyset ---')[0]
    rogue = t.split('--- Roguelike keyset ---')[1]
    move = [('1-9 / arrows', 'Walk'), ('Shift + direction', 'Run'), ('Ctrl + direction', 'Alter (open, tunnel, disarm ...)')]
    keys = move + parse_keys(orig)
    norm = lambda d: re.sub(r's\b|\W', '', d.lower())
    have = {(k, norm(d)) for k, d in keys}
    keys += [('h j k l y u b n', 'Walk (roguelike keyset)'), ('Shift + h j k l y u b n', 'Run (roguelike keyset)')]
    keys += [(k, d + ' (roguelike keyset)') for k, d in parse_keys(rogue) if (k, norm(d)) not in have]
    return keys


def dl(items):
    return '<dl>' + ''.join(f'<dt>{kbd(k)}</dt><dd>{esc(d)}</dd>' for k, d in items) + '</dl>'


def section(anchor, title, body):
    return f'<h2 id="h-{anchor}">{esc(title)}</h2>{body}'


def body():
    parts = []
    toc = [('about', 'About the game'), ('keys', 'Keyboard controls'), ('saving', 'Saving your game'),
           ('tips', 'Tips'), ('guide', "New player's guide"), ('web', 'Playing in the browser'),
           ('credits', 'Credits'), ('version', 'About this version')]
    parts.append('<p>' + esc(TAGLINE) + '</p><ul class="toc">' +
                 ''.join(f'<li><a href="#h-{a}">{esc(t)}</a></li>' for a, t in toc) + '</ul>')
    parts.append(section('about', 'About the game', ABOUT))
    ess = ''.join(f'<div class="box"><h3>{esc(cat)}</h3>{dl(items)}</div>' for cat, items in ESSENTIALS)
    keys = all_keys()
    full = ''.join(f'<div>{kbd(k)}<span>{esc(d)}</span></div>' for k, d in keys)
    parts.append(section('keys', 'Keyboard controls',
                         '<div class="box key"><h3>The keys to remember</h3>' + dl(KEY_HINTS) + '</div>'
                         '<h3>Essential keys</h3><div class="grid">' + ess + '</div>'
                         '<p>Sangband has two keysets: the original one (below) and a roguelike one (walk with '
                         '<kbd>h</kbd> <kbd>j</kbd> <kbd>k</kbd> <kbd>l</kbd> <kbd>y</kbd> <kbd>u</kbd> <kbd>b</kbd> '
                         '<kbd>n</kbd>), switched in the options (<kbd>=</kbd>).</p>'
                         '<details><summary>Complete key list (' + str(len(keys)) + ' entries, both keysets, '
                         'from the game\'s own command list)</summary>'
                         '<div class="all">' + full + '</div></details>'))
    parts.append(section('saving', 'Saving your game', SAVING))
    parts.append(section('tips', 'Tips', TIPS))
    parts.append(section('guide', "New player's guide", ''.join(f'<h3>{esc(t)}</h3>{b}' for t, b in GUIDE)))
    parts.append(section('web', 'Playing in the browser', WEB))
    parts.append(section('credits', 'Credits', CREDITS))
    parts.append(section('version', 'About this version', '<ul>'
                 '<li>Based on <strong>Sangband 1.0.2</strong> (the release <code>sangband_source_102.zip</code>, 2011), '
                 'from the Google Code project <em>skills-angband</em>, svn trunk r313.</li>'
                 '<li>Original source: <a href="https://code.google.com/archive/p/skills-angband/" '
                 'target="_blank" rel="noopener">code.google.com/archive/p/skills-angband</a> (svn trunk r313), '
                 f'committed unchanged as <a href="https://github.com/memmaker/sangband/tree/{UPSTREAM}" target="_blank" '
                 f'rel="noopener">{UPSTREAM}</a>.</li>'
                 '<li>Our changes (web port, auto-explore, stair walking, command and item menus, tiles, '
                 'sound and music, web build): '
                 f'<a href="https://github.com/memmaker/sangband/compare/{UPSTREAM}...main" target="_blank" '
                 f'rel="noopener">memmaker/sangband, {UPSTREAM}...main</a>.</li></ul>'))
    return '\n'.join(parts)


DOC = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sangband keys</title>
<style>
:root { --bg: #0b0b0d; --panel: #16161a; --line: #2b2b33; --text: #d8d8de; --dim: #8a8a96; --accent: #d9b24c; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 system-ui, sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 60px; }
h1 { color: var(--accent); margin: 0 0 6px; }
h2 { font-size: 19px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--accent); margin: 18px 0 8px; }
a { color: var(--accent); }
kbd { display: inline-block; min-width: 1.2em; padding: 0 5px; font: 13px/1.6 ui-monospace, monospace; text-align: center;
  background: #22222a; border: 1px solid #3a3a46; border-bottom-width: 2px; border-radius: 4px; }
code { font: 13px ui-monospace, monospace; background: #22222a; padding: 0 4px; border-radius: 3px; }
.toc { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; list-style: none; }
.toc a { display: block; padding: 3px 10px; border: 1px solid var(--line); border-radius: 12px; text-decoration: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.box { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 4px 14px 10px; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
dd { margin: 0; color: var(--text); }
.all { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 4px 16px; margin-top: 10px; }
.all span { margin-left: 8px; }
details summary { cursor: pointer; color: var(--accent); margin-top: 14px; }
</style></head>
<body><main><h1>Sangband</h1>
%s
</main></body></html>
'''

if __name__ == '__main__':
    print(DOC % body() if '--docs' in sys.argv else body())
