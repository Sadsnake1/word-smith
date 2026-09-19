// Word-Smith — organizer-widths. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { wsCatch } from './preamble';
import type { WsSession } from './preamble';
import type WordSmith from './plugin';
import type { WordSmithSettings } from './settings';

// ════════════════════════════════════════════════════════════════════════
// THE WIDTHS — what a column measures, and the grips that let a writer say
// ════════════════════════════════════════════════════════════════════════
//
// THE SEVENTH PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-14, by
// `ws-dev/lift.js`): the floors and ceilings (`ORG_NAME_MIN` / `_MAX`,
// `ORG_COL_MIN`, `ORG_COL_MAXFRAC`, `orgColCeil`), the scroll the session
// remembers, a column's width and how it is read, stored and stamped
// (`orgColW`, `orgColWSet`, `orgColFit`, `orgColApply`, `orgColUnfix`,
// `orgColLive`, `orgColMark`, `orgColStamp`), the name column's own
// (`orgNameW`, `orgNameStamp` with its ResizeObserver), and the grips
// (`orgGripAt`, `orgGripHover`, `orgColGripBind`, `orgNameGripBind`) with
// the two probe doors `_orgGripAt` and `_orgGripDrag`. Six hundred lines.
//
// WHAT IT READS, through `d`: the settings (`d.s`), the session (`d.ses`),
// the phone test (`d.orgNarrowNow`), the window (`d.ownerWin`),
// `d.drawPanel`, `d.orgGripDrag` (which it also sets: the closure's drag
// latch) and `d.plugin`. Every `host` in here is a PARAMETER — the table's
// element, never the window's host — and the folder is not read at all:
// a scope-blind read list named it, and the getter went the same day.
//
// SIX OF ITS `let`s ARE LIVE — `orgScrollTop`, `orgScrollLeft`,
// `orgColFitNow`, `orgNameLineNow`, `orgNameRO`, `orgGripReleasedAt` —
// read and set by the table context the closure hands the table module;
// they come back as getters and setters, and the closure reads them as
// `orgWidths.<name>`. The comments on each function came with it, as it
// stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgWidthsMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (3 of 7).
export interface OrgWidthsDeps {
	plugin: WordSmith;
	readonly drawPanel: () => void;
	orgGripDrag: number;
	readonly orgNarrowNow: () => boolean;
	readonly ownerWin: () => typeof window;
	readonly s: WordSmithSettings;
	readonly ses: WsSession;
}

export const wsOrgWidthsMake = (d: OrgWidthsDeps) => {
// ── THE NAME COLUMN'S WIDTH IS THE WRITER'S (2026-08-29) ────────
//
// "the table is cut there (see pic) and i want to add a vertical
// separator to resize the name column (add a faint hairline)." The
// shot circled the empty band between `Scene 1` and the `Words`
// column.
//
// WHERE THE WIDTH CAME FROM: `max-width: 32ch`, and that rule’s own
// comment records discovering that a table cell IGNORES `max-width`
// until `display: flex` makes it apply ("747px to 235px, which is
// 32ch to the pixel"). So the number is real, it is one number for
// every vault, and the writer never picked it.
//
// STORED IN PIXELS AND NAMED IN PIXELS. FACTS: a store that changes
// UNIT changes NAME. The cap it overrides is in `ch`; a bare
// `organizerNameCol` could be read as either, and the first reader
// to guess wrong would be off by a factor of eight.
//
// NOT DEFAULTED, so absent means "the table decides", which is what
// every vault that has never dragged it still gets.
const ORG_NAME_MIN = 120;
const ORG_NAME_MAX = 1200;
// A COLUMN THAT IS NOT THE NAME may go narrower — a Flag or a
// Grade is a glyph and a number — but not below the hit target a
// pointer needs to grab its grip.
const ORG_COL_MIN = 48;
// AND NO COLUMN MAY EAT THE TABLE. Sixty per cent of the pane the
// table is drawn in, measured at the moment of the drag rather
// than stored, so it follows the pane instead of dating from
// whatever the pane was when the writer last dragged.
const ORG_COL_MAXFRAC = 0.6;
// ── READ ONCE A DRAW, NOT ONCE A CELL (A139) ────────────────────
//
// `clientWidth` IS A LAYOUT READ. This is reached from `orgColW`,
// which is reached from `orgColStamp`, which runs for EVERY CELL —
// inside the loop that is creating those cells. Write a `<td>`, read
// a width, write the next, read again: the browser has to lay the
// table out afresh on every read, because the last write invalidated
// what the read is asking about.
//
// MEASURED, and it is most of the window. A draw of 11 rows and 3
// data columns cost 121ms, of which the row loop was 91 and the
// COLUMN loop 90 — the name cell, with its icon and its chevron and
// two hundred lines of work, was 0.9ms for all eleven rows together.
//
// AND THE PER-COLUMN SPLIT IS WHAT NAMES THE CAUSE:
//
//     fm:Description   3.11ms a cell
//     mark             2.81ms a cell
//     tags             2.65ms a cell
//
// A flag cell reads no frontmatter, no store and no vault, and costs
// what a property cell costs. A uniform price paid by every cell
// whatever it contains is not the work in the cell — it is the thing
// every cell does before it branches, and that is this.
//
// THE RULE WAS ALREADY WRITTEN, TEN LINES BELOW, for `orgColFit`:
// "READ EVERYTHING, THEN WRITE … interleaving the two makes the
// browser lay the table out again on every column". It is the right
// rule and it was stated in the one place that already obeyed it.
//
// KEYED ON THE HOST, not a bare flag: the answer depends only on the
// element, so a different host must not read a cached number that was
// measured on another. Cleared at the top of every draw, where the
// pane may have been resized since — the same place and the same
// reason as `orgFilePathCache`.
// ── WHERE THE WRITER IS LOOKING, REMEMBERED AS THEY LOOK (A157) ─
//
// A156 carried the scroll across a redraw by READING it at the top
// of the draw. That fixed the jump and cost 5.8ms of a 16.4ms draw —
// measured — because `scrollTop` is a LAYOUT read, and asking for it
// makes the browser lay out everything the PREVIOUS draw wrote.
// Same fault as A139's `clientWidth`, arriving by way of its fix.
//
// A SCROLL EVENT ALREADY KNOWS THE NUMBER. The browser fires it
// after it has scrolled, so reading there costs nothing that has not
// already been paid — and the draw then reads a plain variable.
// STARTS WHERE IT LEFT OFF (A211). The restore machinery already
// exists — A156 put the writer back after every redraw — so the
// session only has to supply the opening value and take the closing
// one. Nothing else about the scroll changes.
let orgScrollTop = Math.max(0, Number(d.ses.scroll) || 0);
// AND SIDEWAYS (A263, writer 2026-09-08: "if i click on a header to
// sort by it and the screen is small, it scrolls all the way to the
// left again"). A redraw rebuilds the table's box; the columns you
// had scrolled to come back with it. Kept for the redraw only, not
// the session: a fresh window opens at the left edge.
let orgScrollLeft = 0;
let orgCeilHost: HTMLElement | null = null;
let orgCeilVal = 0;
const orgColCeilReset = () => { orgCeilHost = null; };
const orgColCeil = (host: HTMLElement) => {
	if (host && orgCeilHost === host) return orgCeilVal;
	const w = host && host.clientWidth;
	const v = !(w > 0) ? ORG_NAME_MAX
		: Math.max(ORG_COL_MIN, Math.round(w * ORG_COL_MAXFRAC));
	if (host) { orgCeilHost = host; orgCeilVal = v; }
	return v;
};
// THE ONE STORE. `name` is a member like any other; the column ids
// are `goal`, `words`, `fm:<key>` and the rest.
// RESIZE COLUMNS TO FIT, ONCE (writer, 2026-08-31). Declared here
// because it needs `orgColWSet` and the panel needs it; the table
// it measures is found through the panel host, not held, because a
// table element does not survive a redraw.
//
// READ EVERYTHING, THEN WRITE. The stamps come off, ONE layout is
// forced, every width is read, and only then is anything set —
// interleaving the two makes the browser lay the table out again
// on every column, which is the same rule `orgReadWidths` followed
// before it was retired with the outline.
const orgColFit = () => {
	if (!orgColFitNow) return;
	orgColFitNow();
};
let orgColFitNow: () => void = null;
const orgColPx = () => {
	const m = d.s.uniColPx;
	return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
};
const orgColW = (id: string, host: HTMLElement | null) => {
	const n = Number(orgColPx()[String(id)]);
	// NOT ON A PHONE (A293, writer 2026-09-11, a shot at 360px): the
	// stored widths are the desktop's, dragged on a table a thousand
	// pixels wide, and the store is shared. Honoured on a 360px pane
	// they gave an EMPTY Target column 270px while Grade and Words were
	// squeezed to “10…”. A narrow pane sizes every reading to its
	// content and gives the name the room that leaves (`--ws-org-nameroom`).
	if (id !== 'name' && d.orgNarrowNow()) return 0;
	if (!isFinite(n) || n <= 0) return 0;
	const lo = id === 'name' ? ORG_NAME_MIN : ORG_COL_MIN;
	const hi = Math.min(ORG_NAME_MAX, orgColCeil(host));
	return Math.round(Math.max(lo, Math.min(hi, n)));
};
const orgColWSet = (id: string, px: number | null) => {
	const m = Object.assign({}, orgColPx());
	if (px === null) delete m[String(id)];
	else m[String(id)] = Math.round(px);
	d.s.uniColPx = m;
	d.plugin.saveSettings().catch(() => {});
};
// KEPT AS A NAME, because the seam and the stamp both ask this one
// question and neither should learn about the map.
const orgNameW = () => orgColW('name', null);
// SET BY THE PANEL EACH TIME IT DRAWS, and read by the grip while it
// is being dragged. Declared here because the two are built in
// different places and neither owns the other.
let orgNameLineNow: () => void = null;
// AND THE THING THAT KEEPS IT TRUE. See where it is armed: the seam
// is measured off a table cell, and a cell has no width until the
// table has been laid out.
let orgNameRO: ResizeObserver | null = null;
const orgNameStamp = (table: HTMLElement) => {
	// ── THE WIDTH IS THE TABLE’S, AND IT STAYS THERE ──────────
	//
	// "i’ve marked the position of the separator in table view — it cuts
	// the row in outline" (2026-08-27).
	//
	// MEASURED with 240 stored: in Outline the table still read
	// `ws-org-table is-outline is-namefixed` and still carried
	// `--ws-org-namew: 240px`, and two of four name cells took a
	// `max-width: 240px` from it while the other two got `none`.
	//
	// THE SEAM WAS ALREADY WITHHELD HERE and that is what hid this:
	// `orgNameLine` removes the line’s variables in Outline, so the
	// writer saw no separator — and the WIDTH it sets went on applying.
	// "we don’t need the separator in outline veiw" (2026-08-30) was
	// answered for the drawing and not for the measurement.
	//
	// REMOVED, NOT SKIPPED, for the reason `orgNameLine` gives beside
	// its own removals: a table element that survives a redraw would
	// keep a stale class and a stale width, and the cut would come
	// back the next time anything else repainted.
	const w = orgNameW();
	if (!w) return;
	table.addClass('is-namefixed');
	table.style.setProperty('--ws-org-namew', w + 'px');
};
// THE HAIRLINE IS THE DOOR AND THE GRIP IS ITS HIT AREA.
//
// Every control needs a visible one — this window has a tombstone
// saying a gesture is not a door — and the writer asked for the
// hairline by name. It is drawn down the whole column, at rest, by
// the stylesheet; this is the 7px a pointer can actually aim at,
// because a 1px target is not one. Hovering it lights the edge.
// ── THE GRIP IS THE WHOLE SEAM, NOT ITS TOP ──────────────────────
//
// Writer, 2026-08-30: "i can’t drag the separator from anywhere, just
// from the top." It lived in the header CELL, so only the 28px of
// heading was draggable and the rest of the line was decoration that
// looked like a control.
//
// SO IT HANGS OFF THE HOST, exactly like the seam it aims at, and
// takes the same three variables. Two things drawn from one set of
// numbers cannot drift apart — which is the fault a grip pinned to
// the header and a line drawn on the host would have had the first
// time either moved.
// ── A COLUMN'S WIDTH HAS TO REACH ITS CELLS, NOT JUST ITS HEADER ───
//
// Writer, 2026-09-01: "the drag handles for other columns don't work
// properly". MEASURED: with `uniColPx` asking for 70px, the column
// stayed at 152.6px — header AND body — so a saved width did nothing
// at all and the drag only appeared to work while the pointer was
// down, because `move` stamps the `th` inline as it goes.
//
// A `<table>` TREATS A CELL WIDTH AS A SUGGESTION, which the header
// builder's own comment says in those words — it sets all three of
// width/min/max for exactly that reason. Three properties on the TH
// are still only the header's opinion: the column is as wide as its
// widest cell, and the body cells were never told.
//
// THE NAME COLUMN ALREADY SOLVED THIS, one column along: it stamps
// `--ws-org-namew` and a class, and the rule it drives names
// `.ws-org-name` — which is the `th` AND every `td`. The same fact,
// reaching every cell in the column rather than one of them.
//
// ONE STAMPER FOR ALL THREE SITES, because a width applied by the
// header and forgotten by the two body builders is the same bug in a
// new place — and there are two body builders, the subject row and the
// ordinary rows.
// THE MECHANICS OF STAMPING ONE CELL, in one place. The draw reads the
// STORE for its width and the live drag has a number in hand, so they
// cannot share a function — but they must not disagree about what
// applying a width means.
const orgColApply = (cell: HTMLElement, w: string|number) => {
	// box-sizing is the sheet's (`.ws-org-table th, td`); the three widths are the drag's.
	cell.style.width = w + 'px';
	cell.style.minWidth = w + 'px';
	cell.style.maxWidth = w + 'px';
};
// ── AND ITS MIRROR, WHICH DID NOT EXIST ─────────────────────────────
//
// Writer, 2026-09-02: "the resize columns to fit button does not
// work". Reproduced first and fixed second: driven through a real
// click, every width and `uniColPx` came back identical TO THE PIXEL.
//
// THE FIT CLEARED THE HEADER AND MEASURED THE COLUMN. `orgColApply`
// stamps three properties on EVERY cell in a column — the `th` and
// every `td`, which is the whole point of it, and the comment above
// says so. The fit removed them from `thead th` alone, so every body
// cell still carried `min-width` and `max-width` at the old number.
// A column is as wide as its widest constraint, so it did not move,
// the measurement returned exactly what was already stored, and the
// button wrote back the value it had just read. It was not doing
// nothing — it was doing a round trip.
//
// IT IS A FUNCTION, NEXT TO ITS OPPOSITE, for the reason `orgColApply`
// is one: three properties are written and all three have to go.
// Clearing `width` and leaving `min-width` is a column that cannot
// shrink, which looks exactly like a fit that does nothing.
const orgColUnfix = (cell: { style: { removeProperty: (arg0: string) => void; }; }) => {
	cell.style.removeProperty('width');
	cell.style.removeProperty('min-width');
	cell.style.removeProperty('max-width');
};
// AND THE WHOLE COLUMN AT ONCE, for the drag.
//
// Writer, 2026-09-01: "improve the columns resizing, it's kinda
// glitchy." HALF OF IT WAS MINE, from the batch that made a stored
// width reach the cells: the DRAW stamps every cell now, but `move`
// still stamped the `th` alone. So during a drag the header slid ahead
// of its own column and the body caught up in one jump on release.
const orgColLive = (host: HTMLElement, id: string, w: number) => {
	if (!host) return;
	for (const cell of Array.from<HTMLElement>(host.querySelectorAll('th, td'))) {
		if (cell.getAttribute('data-col') !== id) continue;
		orgColApply(cell, w);
	}
};
// AND THE WHOLE COLUMN WEARS THE DRAG (A316, writer: “highlight the
// full separator with accent color when I drag”). The same walk as the
// widths, once at the press and once at the release; the stylesheet
// turns the cells’ own separator to the accent, top to bottom.
const orgColMark = (host: HTMLElement, id: string, on: boolean) => {
	if (!host) return;
	for (const cell of Array.from<HTMLElement>(host.querySelectorAll('th, td'))) {
		if (cell.getAttribute('data-col') !== id) continue;
		cell.toggleClass('is-gripdrag', !!on);
	}
};
const orgColStamp = (cell: HTMLElement, id: string, host: HTMLElement | null) => {
	const w = orgColW(id, host);
	if (!w) return;
	// BORDER-BOX, OR THE COLUMN CREEPS — see `orgColApply`. The grip
	// measures what it is dragging from `getBoundingClientRect()`, which
	// INCLUDES the cell's padding, and stores that number.
	orgColApply(cell, w);
};
// ── AND IT MUST NOT EAT THE COLUMN IT SITS OVER ────────────────────
//
// Writer, 2026-09-01: "i cannot add or remove tags anymore."
//
// MINE, FROM THE BATCH THAT MADE THE GRIPS FULL HEIGHT. A grip is 7px
// wide at `z-index: 4`, and once it ran the whole 406px of the table
// there was a dead strip down every column's right edge. MEASURED with
// `elementFromPoint` at each cell's right edge: `ws-org-colgrip`, every
// time — never the cell. A tag chip's × sits at the right of its chip,
// so it was under the strip and could not be pressed.
//
// THE GRIP TAKES NO POINTER EVENTS NOW. It is the visible line and the
// hover mark and nothing else; the DRAG is bound on the scroller, which
// asks whether the pointer went down within `ORG_GRIP_NEAR` of a column
// edge. A press anywhere else reaches whatever is under it, which is
// what a press has always done and what stopped being true.
//
// BOTH HALVES OF WHAT WAS ASKED SURVIVE: the edge is still grabbable
// anywhere down its height — that is what the wrap-level test buys —
// and the cells under it are clickable again.
// WHEN A GRIP LAST LET GO (writer, 2026-09-01: "sometimes when i
// release the dragging of a column separator it, i think, clicks on
// the header of that column and the sorting of that column is turned
// on").
//
// THE PRESS IS STOPPED AND THE CLICK IS NOT. `orgColGripBind` calls
// `preventDefault` and `stopPropagation` on the pointerdown, and its
// comment says that settles it — "a drag that also sorted or moved the
// column would be three acts from one gesture". It does not: a click
// is synthesised from the pointerdown/pointerup PAIR and dispatched
// afterwards, and stopping the pointerdown does not cancel it. The
// grip is `pointer-events: none`, so that click lands on the `th`
// underneath — which IS the sort control.
//
// A TIMESTAMP, NOT A SWALLOWED EVENT. Adding a one-shot capturing
// listener to eat the next click is the usual trick and it is wrong
// here: if the release never produces one — the pointer left the
// window, the press was cancelled — the listener stays armed and eats
// an unrelated click later. A reading the sort handler consults
// cannot go stale that way.
let orgGripReleasedAt = 0;
const ORG_GRIP_CLICK_MS = 300;
const ORG_GRIP_NEAR = 4;
// WHICH EDGE IS THE POINTER ON, if any. The grips carry their column's
// id, so the answer is the grip itself rather than a second map of
// columns to positions.
const orgGripAt = (host: HTMLElement, x: number, y: number) => {
	if (!host) return null;
	const hb = host.getBoundingClientRect();
	if (y < hb.top || y > hb.bottom) return null;
	for (const g of Array.from<HTMLElement>(host.querySelectorAll('.ws-org-colgrip'))) {
		const r = g.getBoundingClientRect();
		// WITHIN THE GRIP’S OWN HEIGHT (A314). This tested x alone across
		// the whole host, which was harmless while every grip ran the
		// table’s height — and is the whole fault once a finger’s grip is
		// the header’s height: a press on a row at the seam’s x would
		// still capture the pointer and resize instead of panning. Under
		// jsdom every box is 0×0 at 0,0 and the probes press at 0,0.
		if (y < r.top || y > r.bottom) continue;
		const mid = (r.left + r.right) / 2;
		// AS FAR AS THE GRIP REACHES (A293): 4px from the edge on a mouse,
		// but a finger-wide grip under a coarse pointer (40px in the sheet)
		// owned the touch and this test started nothing unless the finger
		// was within four pixels — “dragging a bit of the column separator”.
		// The grip’s own half-width, measured, so the sheet decides.
		if (Math.abs(x - mid) <= Math.max(ORG_GRIP_NEAR, r.width / 2)) return g;
	}
	return null;
};
// ── AND THE POINTER HAS TO SAY SO (writer, 2026-09-01) ──────────
//
// "the vertical separators dont have that highiligh accent color and
// the pointer does not change when i hover over them."
//
// BOTH ARE ONE FAULT, AND IT IS THE PRICE OF THE LAST FIX. The grip
// was made `pointer-events: none` so the cells under it stay
// pressable — and an element that takes no pointer events gets no
// `:hover` and contributes no `cursor`. The stylesheet still
// carried both, aimed at an element that can never match. The drag
// survived only because it had already moved to a coordinate test
// on the host, which needs no hit-testing at all.
//
// SO THE ANSWER COMES FROM THE HOST, which IS hittable, keyed on
// the same `orgGripAt` reading the press uses. One writer for
// "is the pointer on an edge", answering three questions with it:
// the cursor, the accent, and the drag.
//
// BOUND ONCE PER HOST, not once per column. `orgColGripBind` runs
// for every column and the press handler is registered per column
// by design — each ignores every press but its own — but a
// pointermove that lights whichever edge is nearest has nothing to
// vary per column, and six copies would fight over `lit`.
const orgGripHover = (host: HTMLElement) => {
	if (!host || host.hasAttribute('data-ws-griphover')) return;
	host.setAttribute('data-ws-griphover', '1');
	let lit: HTMLElement = null;
	const light = (g: HTMLElement) => {
		if (lit === g) return;
		// AND THE HEADING BESIDE IT (A299): the dots on the heading's own
		// ::after brighten with the grip, and the stylesheet may not reach
		// a parent from a child (`:has()` is held out by selfcarry).
		if (lit) { lit.removeClass('is-near'); if (lit.parentElement) lit.parentElement.removeClass('is-gripnear'); }
		lit = g;
		if (lit) { lit.addClass('is-near'); if (lit.parentElement) lit.parentElement.addClass('is-gripnear'); }
		// A CLASS, NOT AN INLINE CURSOR. Setting `host.style.cursor`
		// is inherited, and inheritance loses to any descendant that
		// sets its own. MEASURED in the running vault: with the host
		// at `col-resize`, `getComputedStyle` on the element actually
		// under the pointer still answered `grab` — the rows are
		// draggable and say so. The host cursor was a true reading of
		// the wrong element.
		//
		// So the state is a class and the stylesheet reaches the whole
		// subtree with it, at a specificity that beats
		// `.ws-org-row.is-draggable` outright rather than by sitting
		// later in the file.
		host.toggleClass('is-gripnear', !!lit);
	};
	host.addEventListener('pointermove', (ev: MouseEvent) => {
		light(orgGripAt(host, ev.clientX, ev.clientY));
	});
	// LEAVING IS NOT A MOVE. Without this the last lit edge keeps its
	// accent and the scroller keeps the resize cursor after the
	// pointer has gone.
	host.addEventListener('pointerleave', () => light(null));
	// A LONG PRESS ON A GRIP OPENS NOTHING (A299). A finger resting on the
	// edge before it moves is a long press to the platform, and the column
	// menu opened under the drag. Capture, so the heading's own handler
	// never hears it; the heading away from an edge keeps its menu.
	host.addEventListener('contextmenu', (ev: MouseEvent) => {
		// A HEADING UNDER THE POINTER AND A GRIP WITH A WIDTH. Under jsdom
		// no box has a size, so a grip "near" (0,0) is every grip, and the
		// first guard swallowed every right-click in the window — the rows'
		// menus, the rename — and the gate said so. A laid-out grip has a
		// width; a zero box is no grip.
		if (!d.orgGripDrag) {
			const target = ev.target as HTMLElement | null;
	const inHead = target && target.closest && target.closest('thead');
			const g = inHead ? orgGripAt(host, ev.clientX, ev.clientY) : null;
			if (!g || !(g.getBoundingClientRect().width > 0)) return;
		}
		ev.preventDefault();
		ev.stopPropagation();
	}, true);
};
const orgColGripBind = (th: HTMLElement, col: { id: string; label: string }, host: HTMLElement) => {
	const grip = th.createDiv({ cls: 'ws-org-colgrip' });
	orgGripHover(host);
	grip.setAttribute('data-col', col.id);
	grip.title = 'Drag to set how wide “' + col.label + '” is — '
		+ 'double-click to hand it back to the table';
	let from = 0, base = 0, live = 0;
	const move = (ev: MouseEvent) => {
		live = Math.max(ORG_COL_MIN, Math.min(orgColCeil(host),
			base + (ev.clientX - from)));
		// STAMPED ON THE WHOLE COLUMN WHILE THE DRAG IS LIVE, saved on
		// release. A settings write per pointermove is a write per pixel
		// dragged, in a file the vault syncs.
		//
		// THE COLUMN, NOT THE HEADER. This stamped `th` alone, which was
		// enough while nothing else was stamped either — and stopped
		// being enough the moment the draw started stamping every cell:
		// the header moved with the pointer and the body did not, then
		// jumped to meet it on release.
		orgColLive(host, col.id, Math.round(live));
	};
	const up = () => {
		try {
			d.ownerWin().removeEventListener('pointermove', move, true);
			d.ownerWin().removeEventListener('pointerup', up, true);
		} catch (_) { wsCatch('openManuscriptModal / up: ownerWin().removeEventListener(\'pointermove\', move, true);', _); }
		// STAMPED WHETHER OR NOT IT MOVED. A press on a separator that
		// went nowhere is still not a press on the heading, and it
		// produces the same click.
		orgGripReleasedAt = Date.now();
		d.orgGripDrag = 0;
		orgColMark(host, col.id, false);
		if (!live) return;
		orgColWSet(col.id, live);
		live = 0;
	};
	// ON THE SCROLLER, NOT ON THE GRIP. The grip takes no pointer events
	// any more — see the note above — so the press is heard here and
	// answered only when it lands on this column's edge. Registered once
	// per column, and each ignores every press but its own.
	host.addEventListener('pointerdown', (ev: PointerEvent) => {
		if (orgGripAt(host, ev.clientX, ev.clientY) !== grip) return;
		// THE GRIP KEEPS ITS POINTER (A293): a finger that wanders off the
		// header mid-drag used to hand the move to whatever it was over.
		try { if (grip.setPointerCapture && ev.pointerId != null) grip.setPointerCapture(ev.pointerId); } catch (_) { wsCatch('openManuscriptModal / orgColGripBind: grip.setPointerCapture(ev.pointerId);', _); }
		// STOPPED, BOTH WAYS. The header cell IS the sort control and
		// it is draggable for reordering; a drag that also sorted or
		// moved the column would be three acts from one gesture.
		ev.preventDefault();
		ev.stopPropagation();
		from = ev.clientX;
		base = th.getBoundingClientRect().width || ORG_COL_MIN;
		live = 0;
		d.orgGripDrag = 1;
		// THE WHOLE COLUMN LIGHTS FOR THE DRAG (A316).
		orgColMark(host, col.id, true);
		try {
			d.ownerWin().addEventListener('pointermove', move, true);
			d.ownerWin().addEventListener('pointerup', up, true);
		} catch (_) { wsCatch('openManuscriptModal / orgColGripBind: ownerWin().addEventListener(\'pointermove\', move, true);', _); }
	});
	// AND IT MUST NOT START THE COLUMN REORDER EITHER. The `th`
	// carries `draggable="true"`, and a pointerdown on a child of a
	// draggable element still begins that drag.
	grip.addEventListener('dragstart', (ev: Event) => {
		ev.preventDefault();
		ev.stopPropagation();
	});
	// AND THE HAND-IT-BACK GESTURE, asked of the same edge test. It was
	// on the grip and would now never fire.
	host.addEventListener('dblclick', (ev: MouseEvent) => {
		if (orgGripAt(host, ev.clientX, ev.clientY) !== grip) return;
		ev.preventDefault();
		ev.stopPropagation();
		orgColWSet(col.id, null);
		d.drawPanel();
	});
};
const orgNameGripBind = (host: HTMLElement, th: HTMLElement, table: HTMLElement) => {
	const grip = host.createDiv({ cls: 'ws-org-namegrip' });
	grip.title = 'Drag to set how wide the Name column is '
		+ '\u2014 double-click to hand it back to the table';
	let from = 0, base = 0, live = 0;
	// THE SCROLLER'S CEILING, not the host's (A431): the host holds the grip,
	// the scroller holds the table, and the two differ by the vertical bar
	// and the inset. Every column's grip and the stamped `--ws-org-nameceil`
	// read the scroller; this one did not, and the sheet and the grip said
	// different numbers.
	const scroller = () => table.parentElement || host;
	const move = (ev: MouseEvent) => {
		live = Math.max(ORG_NAME_MIN, Math.min(orgColCeil(scroller()),
			base + (ev.clientX - from)));
		table.addClass('is-namefixed');
		table.style.setProperty('--ws-org-namew',
			Math.round(live) + 'px');
		// THE SEAM FOLLOWS THE DRAG. It is drawn outside the scroller
		// now, so nothing else moves it — a line that stayed where the
		// column used to end would be the worst of both.
		try { if (orgNameLineNow) orgNameLineNow(); } catch (_) { wsCatch('openManuscriptModal / move: if (orgNameLineNow) orgNameLineNow();', _); }
	};
	// SAVED ON RELEASE, NOT ON EVERY MOVE. A settings write per
	// pointermove is a write per pixel dragged, in a file the vault
	// syncs — the same reason the colour picker’s mirror is
	// debounced hard.
	const up = () => {
		try {
			d.ownerWin().removeEventListener('pointermove', move, true);
			d.ownerWin().removeEventListener('pointerup', up, true);
		} catch (_) { wsCatch('openManuscriptModal / up: ownerWin().removeEventListener(\'pointermove\', move, true);', _); }
		d.orgGripDrag = 0;
		host.removeClass('is-namedrag');
		if (!live) return;
		orgColWSet('name', live);
		live = 0;
	};
	grip.addEventListener('pointerdown', (ev: MouseEvent) => {
		// STOPPED, BOTH WAYS. The header cell IS the sort control
		// and it carries a context menu; a drag that also sorted the
		// table would be two acts from one gesture.
		ev.preventDefault();
		ev.stopPropagation();
		from = ev.clientX;
		base = th.getBoundingClientRect().width || ORG_NAME_MIN;
		live = 0;
		d.orgGripDrag = 1;
		// THE SEAM LIGHTS FOR THE DRAG (A316): the host’s own line.
		host.addClass('is-namedrag');
		try {
			d.ownerWin().addEventListener('pointermove', move, true);
			d.ownerWin().addEventListener('pointerup', up, true);
		} catch (_) { wsCatch('openManuscriptModal / orgNameGripBind: ownerWin().addEventListener(\'pointermove\', move, true);', _); }
	});
	grip.addEventListener('click', (ev: Event) => ev.stopPropagation());
	// AND THE WAY BACK IS ON THE SAME CONTROL. A width a writer can
	// set and not unset is a one-way door.
	grip.addEventListener('dblclick', (ev: Event) => {
		ev.preventDefault();
		ev.stopPropagation();
		orgColWSet('name', null);
		d.drawPanel();
	});
};
// A door for the probes, which cannot reach a closure local: the
// panel is what reads the store, so a test that writes one has to
// be able to ask for the redraw that reads it.
d.plugin._orgDraw = () => d.drawPanel();
// AND THE FIT, WHICH HAD NO DOOR AND THEREFORE NO TEST. It is a row in
// the Properties panel; reaching it from a probe meant a positioned
// click, which is why the only thing holding it was a hand drive. The
// door calls what the row calls — not a copy of it.
d.plugin._orgFit = () => { if (orgColFitNow) orgColFitNow(); };
// AND THE EDGE TEST (A314), so a probe can ask whether a press on a row
// at the seam’s x is a grip — which under a finger it must not be.
d.plugin._orgGripAt = (host, x, y) => orgGripAt(host, x, y);
// AND WHETHER THE PANE THINKS A GRIP IS STILL HELD (A316): a drag that
// never sees its release leaves every later pinch refused, and nothing
// on screen says so.
d.plugin._orgGripDrag = () => d.orgGripDrag;
	return { ORG_COL_MIN, orgColCeilReset, orgColCeil, orgColFit, orgColPx, orgNameStamp, orgColUnfix, orgColStamp, ORG_GRIP_CLICK_MS, orgColGripBind, orgNameGripBind, get orgScrollTop() { return orgScrollTop; }, set orgScrollTop(v) { orgScrollTop = v; }, get orgScrollLeft() { return orgScrollLeft; }, set orgScrollLeft(v) { orgScrollLeft = v; }, get orgColFitNow() { return orgColFitNow; }, set orgColFitNow(v) { orgColFitNow = v; }, get orgNameLineNow() { return orgNameLineNow; }, set orgNameLineNow(v) { orgNameLineNow = v; }, get orgNameRO() { return orgNameRO; }, set orgNameRO(v) { orgNameRO = v; }, get orgGripReleasedAt() { return orgGripReleasedAt; }, set orgGripReleasedAt(v) { orgGripReleasedAt = v; } };
};
