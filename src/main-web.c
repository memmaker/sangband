/* File: main-web.c */

/*
 * Browser (Emscripten/WASM) front end for Sangband 1.0.2.
 *
 * Adapted from the Easyband web port (RVIP template, itself from Zangband's).
 * Sangband's z-term (Leon Marrick's, 3.0-era) differs: Term->cols/rows,
 * term #1 is reserved for the special map window (unused here, as in
 * main-gcu.c), sub-windows start at TERM_SUBWINDOW (2), 128 colours,
 * "(+)" message prompts that the option "message_to_window" skips.
 *
 * All drawing is done by JavaScript on one <canvas> per term (see
 * web/sangband.js).  Blocking input uses Asyncify: when the game waits
 * for a key we sleep in emscripten_sleep(), which yields to the browser.
 *
 * The module registers itself as "web": pref.prf loads pref-x11.prf (the
 * X11 keysym macro triggers the page sends) for it, but not font-x11.prf
 * (X11 font glyph numbers).
 */

#include "angband.h"

#ifdef USE_WEB

#include <emscripten.h>
#include "main.h"

const char help_web[] = "Browser (Emscripten) front end";

/* Web terms: 0 main, then the sub-windows (web_window_flags[]) */
#define WEB_TERMS 7

static term web_term[WEB_TERMS];

/* angband_term[] index of each web term (1 = special map, unused) */
static const int web_ang[WEB_TERMS] = { 0, 2, 3, 4, 5, 6, 7 };

/* Pending "save now" request from the page (tab hidden / closing) */
static int web_want_save = 0;

/* Last time we yielded to the browser */
static double web_last_yield = 0;


/* ---- JavaScript side (implemented in web/sangband.js) ---- */

EM_JS(void, js_text, (int t, int x, int y, int n, int a, const char *s), {
	Module.qb.text(t, x, y, n, a, s);
});

EM_JS(void, js_wipe, (int t, int x, int y, int n), {
	Module.qb.wipe(t, x, y, n);
});

EM_JS(void, js_clear, (int t), {
	Module.qb.clear(t);
});

EM_JS(void, js_curs, (int t, int x, int y), {
	Module.qb.curs(t, x, y);
});

EM_JS(void, js_pict, (int t, int x, int y, int n, const byte *ap, const char *cp,
                      const byte *tap, const char *tcp), {
	Module.qb.pict(t, x, y, n, ap, cp, tap, tcp);
});

EM_JS(void, js_fresh, (int t), {
	Module.qb.fresh(t);
});

EM_JS(void, js_bell, (void), {
	Module.qb.bell();
});

EM_JS(void, js_sound, (const char *name), {
	Module.qb.sound(UTF8ToString(name));
});

EM_JS(void, js_depth, (int depth), {
	Module.qb.depth(depth);
});

EM_JS(void, js_color, (int i, int r, int g, int b), {
	Module.qb.color(i, r, g, b);
});

EM_JS(int, js_term_cols, (int t), {
	return Module.qb.termCols(t);
});

EM_JS(int, js_term_rows, (int t), {
	return Module.qb.termRows(t);
});

/* Layout changes after a browser resize */
EM_JS(int, js_layout_pending, (int t), {
	return Module.qb.layoutPending(t);
});

EM_JS(int, js_pending_cols, (int t), {
	return Module.qb.pendingCols(t);
});

EM_JS(int, js_pending_rows, (int t), {
	return Module.qb.pendingRows(t);
});

EM_JS(void, js_apply_layout, (int t, int cols, int rows), {
	Module.qb.applyLayout(t, cols, rows);
});

/* Next queued input: -1 none, else key */
EM_JS(int, js_next_event, (int at_cmd), {
	return Module.qb.nextEvent(at_cmd);
});

EM_JS(void, js_quit, (const char *msg, int dead), {
	Module.qb.quit(msg ? UTF8ToString(msg) : "", dead);
});

EM_JS(void, js_plog, (const char *msg), {
	Module.qb.plog(UTF8ToString(msg));
});

EM_JS(void, js_sync, (void), {
	Module.qb.sync();
});


/* Persist the save directories (called after every save) */
void web_sync_files(void)
{
	js_sync();
}


/* Called from JS when the page is about to be hidden or closed */
EMSCRIPTEN_KEEPALIVE void web_request_save(void)
{
	web_want_save = 1;
}

/* For the tests (web/test): depth << 16 | y << 8 | x of the player, -1 before play */
EMSCRIPTEN_KEEPALIVE int web_where(void)
{
	if (!character_generated) return (-1);
	return ((p_ptr->depth << 16) | (p_ptr->py << 8) | p_ptr->px);
}


/* Waiting for a command (the only safe moment for layout/save) */
static bool web_at_cmd(void)
{
	return (inkey_flag && character_generated);
}


/* The map view fills the main term (no special map window) */
static void web_set_view(void)
{
	term *t = &web_term[0];

	if (!use_special_map) calc_map_size(t->cols - COL_MAP, t->rows - ROW_MAP - 1);
	if (character_generated) verify_panel(0, FALSE);
}


/*
 * Resize the terms to the layout the page computed after a browser resize.
 * The main window changes its size only at the command prompt; a cell-size
 * change alone applies at once.
 */
static void web_apply_layout(void)
{
	int i, main_resized = 0;
	term *old = Term;

	for (i = 0; i < WEB_TERMS; i++)
	{
		term *t = &web_term[i];
		int cols, rows;

		if (!js_layout_pending(i)) continue;

		cols = js_pending_cols(i);
		rows = js_pending_rows(i);
		if (cols < 1) cols = 1;
		if (rows < 1) rows = 1;
		if (cols > 255) cols = 255;
		if (rows > 255) rows = 255;

		if (!i)
		{
			if (cols < 80) cols = 80;
			if (rows < 24) rows = 24;

			if (((cols != t->cols) || (rows != t->rows)) && !web_at_cmd()) continue;
		}

		/* New canvas size and cell size (the canvas starts blank) */
		js_apply_layout(i, cols, rows);

		(void)Term_activate(t);
		if ((cols == t->cols) && (rows == t->rows)) (void)Term_redraw();
		else
		{
			(void)Term_resize(cols, rows);
			if (!i) web_set_view(), main_resized = 1;
			(void)Term_redraw();
		}

		/* Sub-windows: let the game refill them */
		if (i) p_ptr->window |= op_ptr->window_flag[web_ang[i]];
	}

	(void)Term_activate(old);

	/* New map view size: the game redraws the whole screen (command prompt) */
	if (main_resized && character_generated) do_cmd_redraw();
}


/* Move queued browser input into the main term's key queue */
static int web_pump(void)
{
	int k, got = 0;
	term *old = Term;

	web_apply_layout();

	(void)Term_activate(&web_term[0]);

	while ((k = js_next_event(web_at_cmd())) >= 0)
	{
		(void)Term_keypress(k);
		got = 1;
	}

	/* Safe autosave: only while waiting for a command */
	if (web_want_save && web_at_cmd() && !p_ptr->is_dead && !got &&
	    (Term->key_head == Term->key_tail))
	{
		web_want_save = 0;
		(void)Term_keypress(KTRL('S'));
		got = 1;
	}

	(void)Term_activate(old);
	return got;
}

static void web_yield(int ms)
{
	emscripten_sleep(ms);
	web_last_yield = emscripten_get_now();
}

static errr web_check_events(int wait)
{
	if (web_pump()) return (0);

	if (!wait)
	{
		/* Let the browser paint now and then during long actions */
		if (emscripten_get_now() - web_last_yield > 50) web_yield(0);
		return (web_pump() ? 0 : 1);
	}

	while (1)
	{
		web_yield(10);
		if (web_pump()) return (0);
	}
}

static void web_react(void)
{
	int i;

	for (i = 0; i < MAX_COLORS; i++)
		js_color(i, color_table[i].rv, color_table[i].gv, color_table[i].bv);
}

static int web_idx(void)
{
	return (int)(Term - web_term);
}

static errr Term_xtra_web(int n, int v)
{
	switch (n)
	{
		case TERM_XTRA_CLEAR: js_clear(web_idx()); return (0);
		case TERM_XTRA_NOISE: js_bell(); return (0);
		case TERM_XTRA_SOUND:
			if ((v > 0) && (v < MSG_MAX) && angband_sound_name[v])
				js_sound(angband_sound_name[v]);
			return (0);
		case TERM_XTRA_FRESH:
			js_fresh(web_idx());

			/* The page plays town music at depth 0 */
			js_depth(character_generated ? p_ptr->depth : -1);
			return (0);
		case TERM_XTRA_BORED: return (web_check_events(0));
		case TERM_XTRA_EVENT: return (web_check_events(v));
		case TERM_XTRA_FLUSH:
			while (js_next_event(0) >= 0) ;
			return (0);
		case TERM_XTRA_DELAY:
			js_fresh(web_idx());
			if (v > 0) web_yield(v);
			return (0);
		case TERM_XTRA_REACT: web_react(); return (0);
	}

	return (1);
}

static errr Term_curs_web(int x, int y)
{
	js_curs(web_idx(), x, y);
	return (0);
}

static errr Term_wipe_web(int x, int y, int n)
{
	js_wipe(web_idx(), x, y, n);
	return (0);
}

static errr Term_text_web(int x, int y, int n, byte a, cptr s)
{
	js_text(web_idx(), x, y, n, a, s);
	return (0);
}

static errr Term_pict_web(int x, int y, int n, const byte *ap, const char *cp,
                          const byte *tap, const char *tcp)
{
	js_pict(web_idx(), x, y, n, ap, cp, tap, tcp);
	return (0);
}

/* The tall display (46+ rows) needs nothing from the port (as main-gcu.c) */
static errr switch_display_web(int display)
{
	(void)display;
	return (0);
}


static void hook_plog(cptr str)
{
	if (str) js_plog(str);
}

static void hook_quit(cptr str)
{
	int i;

	for (i = 0; i < WEB_TERMS; i++) (void)term_nuke(&web_term[i]);

	/* After death the tombstone and scores already waited for a key */
	js_sync();
	js_quit(str, p_ptr->is_dead);
}


/*
 * What each sub-window shows (TERMS in web/sangband.js), by web term.
 * init_angband() clears the flags, main.c then calls web_init_game();
 * a savefile brings its own flags.
 */
static const u32b web_window_flags[WEB_TERMS] =
{
	0,
	PW_INVEN,					/* 1 (angband_term[2]) Inventory */
	PW_MESSAGE,					/* 2 (3) Messages */
	PW_M_LIST,					/* 3 (4) Visible (monster list) */
	PW_MONSTER | PW_OBJECT,		/* 4 (5) Recall */
	PW_EQUIP,					/* 5 (6) Equipment */
	PW_PLAYER_0					/* 6 (7) Character */
};


/*
 * After init_angband() (which clears the window flags and read pref.prf):
 * RVIP defaults for new characters.  A savefile brings its own values.
 */
void web_init_game(void)
{
	int i;

	for (i = 1; i < WEB_TERMS; i++)
		op_ptr->window_flag[web_ang[i]] = web_window_flags[i];

	/* Keep the player centred: maximal clearance = "center_player" */
	clear_y = clear_x = 99;
}


errr init_web(int argc, char **argv)
{
	int i;

	(void)argc;
	(void)argv;

	/* All 128 colours (as main-sdl.c) */
	max_system_colors = MAX_COLORS;
	web_react();

	use_graphics = arg_graphics = GRAPHICS_NONE;

	for (i = 0; i < WEB_TERMS; i++)
	{
		term *t = &web_term[i];
		int cols = js_term_cols(i), rows = js_term_rows(i);

		if (!i)
		{
			if (cols < 80) cols = 80;
			if (rows < 24) rows = 24;
		}
		if (cols > 255) cols = 255;
		if (rows > 255) rows = 255;

		(void)term_init(t, cols, rows, (i == 0) ? 1024 : 16);

		t->soft_cursor = TRUE;
		t->attr_blank = TERM_WHITE;
		t->char_blank = ' ';

		t->xtra_hook = Term_xtra_web;
		t->curs_hook = Term_curs_web;
		t->wipe_hook = Term_wipe_web;
		t->text_hook = Term_text_web;
		t->pict_hook = Term_pict_web;
		t->higher_pict = TRUE;

		/* Every web term is on the page (message_to_window checks it) */
		t->mapped_flag = TRUE;

		(void)Term_activate(t);
		angband_term[web_ang[i]] = t;
	}

	switch_display_hook = switch_display_web;

	(void)Term_activate(&web_term[0]);
	web_set_view();

	web_last_yield = emscripten_get_now();

	quit_aux = hook_quit;
	plog_aux = hook_plog;

	return (0);
}

#endif /* USE_WEB */
