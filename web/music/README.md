# Sangband music for the web build

Sangband's own tunes from `lib/xtra/music` (the ones `jukebox.cfg` names),
rendered to Ogg Vorbis by `web/music.sh` because browsers cannot play `.it`
modules or `.mid` files: `.it` with openmpt123 (libopenmpt), `.mid` with
TiMidity++ and the FluidR3 GM soundfont (Frank Wen, MIT licence). The page
plays them as the game's jukebox asks (town, peaceful ... deadly, death).

Credits and terms, from `lib/xtra/music/jukebox.cfg` (which must travel with
the songs; it is in the game's `lib/xtra/music` next to the originals):

- From Angband: evfalls, lothlor2, missclr1, orielwin.
- From Tales of Middle-earth (ToME, DarkGod and others, http://www.t-o-m-e.net),
  by Reenen Laurie and Cosmic Gerbil: aasesdeath, battle101, bree-ragtime,
  caravanserai, cirith-ungol, elven_town, fall, module3, orc-town, prelude, saraband.
  - aasesdeath: composed by Grieg, converted from MID to IT by Reenen Laurie;
    the IT file is GPL, the original MID (Mutopia Project) public domain.
  - bree-ragtime, caravanserai, elven_town, fall, module3, orc-town: composed
    and sequenced by Reenen Laurie, licensed GPL.
  - prelude, saraband: composed by Dirk Laurie, sequenced by Reenen Laurie,
    licensed GPL.
- From Falcon's Eye 1.9.3 (Jaakko Peltonen), NetHack General Public License:
  battle1, firecave, shopping.
- barddanc: shipped with Sangband 1.0.2, not credited in `jukebox.cfg`.

The copyright text for Reenen Laurie's songs, verbatim from `jukebox.cfg`:

```
# Copyright for songs by Reenen Laurie:
#
# aasesdeath.it
# Composed by Grieg. Converted from MID to .IT by Reenen Laurie.
# The .IT file is GPL.  The original .MID file was found at
# http://www.mutopiaproject.org/cgibin/make-table.cgi?searchingfor=grieg
# The .MID file's license is PUBLIC DOMAIN.
# 
# bree-ragtime.it, caravanserai.it, elven_town.it, fall.it, module3.it,
# orc-town.it
# Composed and Sequenced by Reenen Laurie and licensed GPL.
# 
# prelude.it, saraband.it
# Composed by Dirk Laurie, sequenced by Reenen Laurie and licensed GPL.
# 
# This text, in it's entirety, must be included with these songs when
# distributed.  It may be appended to other credit-like files as well,
# but must be found in the same "place" as the music can be found.
# 
# I (Reenen Laurie) can be contacted at rlaurie@gmail.com.
#
```
