// Word-Smith — organizer-props. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { Notice, setIcon, Platform } from 'obsidian';
import { wsCatch, wsElOf, wsNodeOf, wsStr } from './preamble';
import type { WsPropItem } from './preamble';
import type { WsOrgCol } from './organizer-cols';
import type WordSmith from './plugin';
import type { WordSmithSettings, WsHost } from './settings';

// ════════════════════════════════════════════════════════════════════════
// THE PROPERTIES — the panel's list, the pop-over, the field editor
// ════════════════════════════════════════════════════════════════════════
//
// THE FOURTH AND LARGEST PIECE LIFTED OUT OF `openManuscriptModal`
// (2026-09-14, by `ws-dev/lift.js`): the Properties button's list (which
// keys are columns, in what order, dragged), the pop-over that adds a
// property by type, the sub-menu, the drafts, the edit guard, and
// `orgFieldEditor` — the one editor every property cell opens, which knows
// what a date is, what a number is, what the registry says and what to do
// when the value at hand disagrees. Eighteen hundred lines that were the
// middle of the closure.
//
// WHAT IT READS, through `d`: the settings (`d.s`), the column table and its
// sorts (`d.COLS`, `d.SORTS`, `d.colOff`, `d.orgColFit`, `d.addProp`), the
// property doors (`d.ORG_PROP_DOORS`, `d.orgPropSet`, `d.orgPropListSet`),
// the tag pill (`d.orgTagWrap`, `d.orgTagPill`), the panel and its windows
// (`d.panel`, `d.ownerDoc`, `d.ownerWin`), the draw (`d.draw`,
// `d.drawPanel`, `d.fill`, `d.liveFiles`), and `d.plugin`.
//
// FOUR OF ITS `let`s ARE LIVE — `orgEditGuard`, `orgOpenAfter`,
// `orgRedrawPending`, `orgFieldEscape` — reassigned in here and read by the
// closure's cells and draws; they come back as getters, and the closure
// reads them as `orgProps.<name>`. The comments on each function came
// with it, as it stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgPropsMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (12 of 20).
export interface OrgPropsDeps {
	plugin: WordSmith;
	readonly COLS: WsOrgCol[];
	readonly ORG_PROP_DOORS: { label: string; icons: string[]; types: { id: string; label: string; }[]; pick: (type: string, ev2: MouseEvent) => void; open: (ev2: MouseEvent) => void; }[];
	readonly SORTS: { id: string; label: string; icon: string; }[];
	readonly addProp: (info: WsPropItem) => Promise<void>;
	readonly colOff: Set<string>;
	readonly draw: () => void;
	readonly drawPanel: () => void;
	readonly fill: () => Promise<void>;
	readonly liveFiles: () => string[];
	readonly orgColFit: () => void;
	readonly orgPropListSet: (path: string, key: string, list: unknown, before: unknown) => Promise<boolean>;
	readonly orgPropSet: (path: string, key: string, value: unknown) => Promise<boolean>;
	readonly orgTagPill: (host: HTMLElement, text: string, o: { intext?: boolean; remove?: (() => void) | null; }) => HTMLSpanElement;
	readonly orgTagWrap: (host: HTMLElement, type: string) => HTMLElement;
	readonly ownerDoc: () => Document;
	readonly ownerWin: () => typeof window;
	readonly panel: HTMLDivElement;
	readonly s: WordSmithSettings;
	readonly host: WsHost;
}

export const wsOrgPropsMake = (d: OrgPropsDeps) => {
// TOMBSTONE (brief C3, 2026-08-28): `orgFirstNotePath` and
// `ORG_PROPS_SHORTLIST` stood here. The first served
// `orgPropsSearch`'s "name a property that does not exist yet" flow,
// which hung its input on the first note on screen; that door is the
// panel's "Add a property…" and `pickProp` now, and there is one
// create path where there were two. The second capped the checklist
// at twelve keys — the panel scrolls and searches, so the cap that
// could hide a CHOSEN key is gone with the list that needed it.
// RANKED BY USE, NOT BY ALPHABET. Measured in the writer's vault
// 2026-08-23: an alphabetical shortlist of twelve came back as
// nine `excalidraw-*` keys belonging to another plugin, and not
// one of the writer's own properties reached the menu at all. A
// vault does not choose its neighbours' namespaces.
//
// NOT `propKeysInScope`, which ranks the same way and is right
// there - it answers a DIFFERENT question ("which key could
// become a COLUMN") and drops `tags`, the synopsis key and
// anything already a column. Every one of those exclusions is a
// column rule; the drawer edits all three, and the tombstone in
// orgKnownProps records what happened the last time a drawer
// inherited a column's refusal.
const orgPropsByUse = () => {
	const seen = new Map<string, { label: string; n: number }>();
	for (const p2 of d.liveFiles()) {
		const f = d.plugin.app.vault.getAbstractFileByPath(p2);
		const cache = f && d.plugin.app.metadataCache
			&& d.plugin.app.metadataCache.getFileCache(f);
		const fm = cache && cache.frontmatter;
		if (!fm) continue;
		for (const k of Object.keys(fm)) {
			// Obsidian's own bookkeeping, never the writer's.
			if (k === 'position') continue;
			const low = k.toLowerCase();
			const at = seen.get(low) || { label: k, n: 0 };
			at.n += 1;
			seen.set(low, at);
		}
	}
	return Array.from(seen.values())
		.sort((a, b) => (b.n - a.n) || a.label.localeCompare(b.label))
		.map((x) => x.label);
};
// ── "IS IT OPEN" IS READ FROM THE DOM, NOT REMEMBERED ───────────
//
// It WAS a `let orgPropPop` holding the element, and that is one
// writer too many: a deploy's orphan sweep or a probe tidying up can
// remove the node without this window hearing — and then the button
// believes a panel is open, presses shut, and appears dead. The node
// IS the state; anything else is a copy that can go stale.
//
// STILL TRUE NOW THE PANEL LIVES IN THE WINDOW (A177). It is one
// window's own child, so a second window can no longer take it — but
// a reload orphans the whole window with the panel inside it, which
// is the same stale handle by another route.
const orgPropPopEl = () => {
	try { return d.ownerDoc().querySelector('.ws-org-proppop'); }
	catch { return null; }
};
let orgPropPopQuery = '';
let orgPropPopOff: () => void = null;
// WHAT THE PANEL LISTS, AND IN WHAT ORDER — one function, so the
// render and every probe reading it are asking the same question.
//
// A ROW IS `{ sect, col, key, name, dead }`: the section it belongs
// to, the COLUMN it switches on (or null, for a key that has never
// been made one), the FRONTMATTER KEY it switches on (or '', for a
// reading), and whether ▤ is dead.
// ── A ROW'S ID IS THE ID ITS COLUMN HAS, OR WOULD HAVE ──────────
//
// `words` for a reading, `fm:Pov` for a property — whether or not a
// column for it exists yet. That is the SAME id space `uniColOrder`
// already ranks, so one store carries the order of this panel and the
// order of the table, and a key ranked before it was ever a column
// simply starts meaning something the moment it becomes one.
// A ROW OF THE PROPERTIES PANEL: a column of the table, or a bare key the notes carry.
interface WsPropRow { col: WsOrgCol | null; key: string; name: string; dead: boolean }
const orgPropRowId = (r: WsPropRow) => (r && r.col ? r.col.id
	: (r && r.key ? d.plugin.propColId(r.key) : ''));
const orgPropPanelRows = () => {
	const rows: WsPropRow[] = [];
	const taken = new Set();
	const addRow = (col: WsOrgCol | null, key: string, name: string) => {
		const low = String(key || '').toLowerCase();
		if (low && taken.has(low)) return;
		if (low) taken.add(low);
		rows.push({ col: col || null, key: key || '',
			name: name, dead: !key });
	};
	// ── TOMBSTONE: THE FOUR FAMILIES (writer, 2026-08-28) ───────
	//
	// Size · Progress · Dates · Labels · Your properties, chosen by
	// this writer on 2026-08-25 out of three costed groupings, and
	// retired by the same writer three days later out of three costed
	// options. THE FIGHT WAS REAL AND IT IS WHY THEY WERE ASKED: a
	// family list and ONE flat column order cannot both be the order.
	// A drag that stopped at a heading could not put a property above
	// a reading; a drag that crossed one wrote an order the panel then
	// refused to show, which is the springs-back fault this window
	// already has a tombstone about.
	//
	// THE COST WAS NAMED BEFORE THEY CHOSE: it reverses their own
	// 2026-08-25 answer and the flag leaves Labels. They took it —
	// "put what you scan for at the top" only means the top in a list
	// that has one.
	//
	// WHAT REPLACES A HEADING IS THE DEFAULT ORDER BELOW, which is
	// the only thing a writer who has never dragged anything sees:
	// the readings as `COLS` declares them, then the columns they
	// made, then the fields they chose, then the rest of the vault
	// COMMONEST FIRST. By use and not by alphabet, because an
	// alphabetical list of this vault's 51 keys opens on nine
	// `excalidraw-*` rows and not one of the writer's own.
	for (const c of d.COLS) {
		if (c.user) continue;
		// `tags` IS THE ONE READING THAT IS ALSO A REAL KEY.
		addRow(c, (c.id === 'tags' ? 'tags' : ''), c.label);
	}
	for (const c of d.COLS) { if (c.user) addRow(c, c.key, c.label); }
	for (const k of orgPropsByUse()) addRow(null, k, String(k));
	for (const k of d.plugin.orgKnownProps()) addRow(null, k, String(k));
	// ── AND THEN THE WRITER'S OWN ORDER OVER THE TOP ───────────
	//
	// APPLIED AS A RANKING, not used as the list: a column added in a
	// later version is in no saved order, and a saved order used
	// directly would silently drop it. Ones it does not name keep
	// their place in the default order above, behind the ones it does.
	// This is `colRank`'s rule, applied to a longer list — the table
	// and the panel are sorting the same ids by the same store.
	const saved = Array.isArray(d.s.uniColOrder) ? d.s.uniColOrder : [];
	const at = new Map<string, number>();
	saved.forEach((id, i) => { if (!at.has(id)) at.set(id, i); });
	const rank = (x: { r?: WsPropRow; n: number; id: string }) => (at.has(x.id) ? at.get(x.id) : saved.length + x.n);
	const ordered = rows
		.map((r, n) => ({ r: r, n: n, id: orgPropRowId(r) }))
		.sort((a, b) => (rank(a) - rank(b)) || (a.n - b.n))
		.map((x) => x.r);
	// THE TICKED ONES FIRST (A368, writer 2026-09-13: "when i toggle a
	// propriety on i want it to be moved on top of the list - so it's
	// easier work with that"): the rows that are columns on screen,
	// in the order above, then the rest in theirs. A tick moves the
	// row up on the render that follows the click.
	const shown = (r: { col: { id: string; }; }) => !!(r.col && !d.colOff.has(r.col.id));
	return ordered.filter(shown).concat(ordered.filter((r) => !shown(r)));
};
// ── AND A DRAG REWRITES IT, BOTH HALVES (brief C3) ──────────────
//
// "The drag order drives column order AND chip order." Two stores,
// one gesture, and the second is DERIVED from the first rather than
// dragged separately: `organizerOutlineProps` keeps saying WHICH
// properties are chosen (ticking still appends, as it has since 302)
// and takes its ORDER from the panel, so the chips under a card and
// the columns across a row cannot disagree about what comes first.
//
// A DROP TAKES THE TARGET'S PLACE rather than swapping with it. The
// band's grammar since it had columns: dragging the last row to the
// front should leave everything else in the order it was in, and a
// swap moves two things when a writer moved one.
let orgPropDragId: string | null = null;
const orgPropMoveTo = async (moved: string, target: string) => {
	const here = orgPropPanelRows();
	const ids = here.map(orgPropRowId).filter(Boolean);
	const from = ids.indexOf(moved);
	if (from !== -1) ids.splice(from, 1);
	const to = ids.indexOf(target);
	ids.splice(to === -1 ? ids.length : to, 0, moved);
	// ── WHAT GETS WRITTEN DOWN, AND WHAT KEEPS ITS DEFAULT ──────
	//
	// MEASURED IN THE WRITER'S VAULT, 2026-08-28: the panel draws 61
	// rows and 41 of them are another plugin's keys (`excalidraw-*`,
	// `TQ_*`). Writing the whole list put all 61 into `data.json` on
	// the first drag — an order the writer never expressed, over rows
	// they have never looked at, and forty of them permanently ranked
	// ahead of anything added later.
	//
	// SO THE STORE HOLDS WHAT THE WRITER HAS A VIEW ABOUT: a column
	// that exists, a property they have chosen as a field, and the row
	// they just moved. Everything else keeps its DEFAULT rank, which
	// is `orgPropPanelRows`'s own order — commonest first — and sorts
	// after the ranked ones exactly as `colRank` has always done it.
	// The relative order of the ones that matter is preserved intact;
	// what is dropped is a record of where `excalidraw-mask` sits.
	const mattersId = new Set();
	for (const r of here) {
		const rid = orgPropRowId(r);
		if (!rid) continue;
		// A ROW MATTERS IF IT IS A COLUMN. It also mattered if the key
		// was in the outline's chosen set; there is no such set, and a
		// column is the only thing a row can now be.
		if (r.col) mattersId.add(rid);
	}
	mattersId.add(moved);
	const keep = ids.filter((id) => mattersId.has(id));
	// …then anything the store already ranked that the panel does not
	// draw — a column removed from the vault's keys still has a rank,
	// and dropping it here would silently reorder it if it came back.
	const rest = (Array.isArray(d.s.uniColOrder) ? d.s.uniColOrder : [])
		.filter((id) => keep.indexOf(id) === -1 && ids.indexOf(id) === -1);
	d.s.uniColOrder = keep.concat(rest);
	await d.plugin.saveSettings();
	// (The chips' own rank — `idOfKey`, `rank2`, `rk` — stood here,
	// ranking a store that is gone: the same drag once re-sorted
	// `organizerOutlineProps` so the chips under a card and the columns
	// across a row could not disagree. There is one store now, and the
	// ranker had no reader left. Cut 2026-09-14.)
	d.draw(); void d.fill(); d.drawPanel();
	orgPropPopRender();
};
// THE TYPE BADGE COMES FROM OBSIDIAN'S OWN REGISTRY and from nowhere
// else (writer's mock: "the types come from Obsidian's own registry —
// nothing to configure"). A READING HAS NO ENTRY THERE — it is
// counted, not declared — so it wears no badge and no icon rather
// than a guess. Hand-typing a type per built-in column would be a
// second writer of a fact this plugin does not own.
// ── THE LONG FIELDS (brief B2, amended by the writer 2026-08-28) ──
//
// "add the star a propriety, not with right click, add a star in the
// right of checkboxes so i can click it (to work ok on mobile too)",
// "don't call the star the prose field (call it Long field)", and
// "make so that i can have more than one long fields".
//
// THREE ASKS AND ONE CONTROL. The star was a right-click at 377 —
// the writer's own earlier word — and a right-click is not a gesture
// a phone has. It is a third TOGGLE beside ▦ and ▤ now, which also
// makes "more than one" fall out: a set of ticks is a set.
//
// ★ IMPLIES ▤, and that is the one rule worth stating. A property
// that is not shown under a row cannot be drawn long under it, so
// starring one that is off switches it on. Unstarring leaves it a
// chip; switching ▤ off takes the star with it, because a star on a
// property nothing draws is a mark with nothing to mark.
//
// TOMBSTONE (A252-2): `orgLongUsable`, “usable, not merely set” (brief B3).
// It called `orgLongList()`, which nothing declares — the checker's
// one TS2304 in the whole build — and nothing called it. A helper
// that would throw the first time it ran, kept alive by having no
// caller: exactly the A236 class, one branch away.
const orgPropKindOf = (r: { key: string }) => {
	if (!r.key) return '';
	try { return String(d.plugin.orgPropType(r.key) || ''); }
	catch { return ''; }
};
// ── AND A COLUMN TURNED ON IS BROUGHT INTO VIEW (A134) ──────────────
//
// Writer, 2026-09-04: "some proprieties in proprietis submenu are
// unclickable now", "i can't turn them on (no columns appear)".
//
// THE PRESS WAS NEVER BROKEN. Measured in their vault: the store
// changes, the header is built, and the new column lands PAST THE
// RIGHT EDGE — pane 993px against a table of 1163, overflowing by
// 170, with `fm:cast` at left 1065 and `fm:aaa` at 1115. The pane
// scrolls, so the column is there; nothing tells the eye.
//
// A CONTROL THAT WORKS AND SHOWS NOTHING READS AS BROKEN, which is
// this window's own rule about affordances turned the other way
// round — and it is why the report was "unclickable" rather than
// "off screen": from the writer's side those are the same thing.
//
// SCROLLED ONLY WHEN TURNING ON, and only when the header really is
// out of sight. Scrolling on the way OFF would move the pane away
// from what the writer was looking at, and scrolling to something
// already visible is a jump for nothing.
const orgRevealCol = (id: string) => {
	try {
		const scroller = d.panel.querySelector('.ws-org-panel');
		const th = d.panel.querySelector('thead th[data-col="' + id + '"]');
		if (!scroller || !th) return;
		const hr = scroller.getBoundingClientRect();
		const tr = th.getBoundingClientRect();
		if (tr.right <= hr.right && tr.left >= hr.left) return;
		scroller.scrollLeft += (tr.right - hr.right) + 12;
	} catch (_) { wsCatch('openManuscriptModal / orgRevealCol: const host = panel.querySelector(\'.ws-org-panel\');', _); }
};
const orgPropColToggle = async (r: { col: { id: string } | null; key: string }) => {
	if (r.col) {
		const turningOn = d.colOff.has(r.col.id);
		if (d.colOff.has(r.col.id)) d.colOff.delete(r.col.id);
		else d.colOff.add(r.col.id);
		d.s.uniColsOff = Array.from<string>(d.colOff);
		await d.plugin.saveSettings();
		// The name column is `1fr` and takes whatever the columns
		// give back; and the FIGURES are gathered lazily, so a column
		// switched on draws empty until something asks for them —
		// reported as "they don't display immediately after clicking
		// word counts", which is exactly what it was.
			d.draw(); void d.fill(); d.drawPanel();
		// AFTER THE REDRAW, because the header does not exist until
		// `drawPanel` has built it and a scroll aimed at nothing does
		// nothing.
		if (turningOn) orgRevealCol(r.col.id);
	} else {
		// A KEY THAT IS NOT A COLUMN YET BECOMES ONE. This is the
		// whole of point 5 above: the panel lists the vault, so ▦ on
		// a listed key has to be able to make the column it promises.
		// `addProp` is the one writer of `uniUserCols` and redraws
		// everything derived from it.
		await d.addProp({ key: String(r.key).toLowerCase(), label: r.key });
	}
	orgPropPopRender();
};
// ── THE TYPE SUBMENU (A179, writer 2026-09-05) ──────────────────
//
// “for adding a new properiety the propriety pane should not close,
// make that as a submenu (like a rightclick submenu with the ‘>’
// then the suboptions type appeasrs (text, checkbox, date, etc..)”.
//
// OURS, NOT OBSIDIAN'S. This panel is a div wearing the `menu`
// costume, not a `Menu`, so `setSubmenu` has nothing to hang off
// even on a build that has it. The flyout is a second div in the
// same costume.
//
// AND IT IS BUILT WHERE THE PANEL IS, for A177's reason: a node
// outside the modal is an escape as far as Obsidian's focus trap is
// concerned, and the caret is taken off it. Nothing here takes
// typing yet — but a control that cannot hold focus is one keyboard
// row away from the fault A177 spent an afternoon on.
//
// READ FROM THE DOM, like the panel: the node IS the state.
const orgPropSubEl = () => {
	try { return d.ownerDoc().querySelector('.ws-org-propsub'); }
	catch { return null; }
};
const orgPropSubClose = () => {
	try {
		const d0 = d.ownerDoc();
		for (const n of Array.from<HTMLElement>(
			d0.querySelectorAll('.ws-org-propsub'))) n.remove();
	} catch (_) { wsCatch('openManuscriptModal / orgPropSubClose: const d0 = ownerDoc();', _); }
};
const orgPropPopClose = () => {
	// THE SUBMENU GOES FIRST AND ALWAYS. It is a sibling, not a
	// child, so removing the panel would leave it standing over an
	// empty space with handlers that still fire.
	orgPropSubClose();
	if (orgPropPopOff) {
		try { orgPropPopOff(); } catch (_) { wsCatch('openManuscriptModal / orgPropPopClose: orgPropPopOff();', _); }
		orgPropPopOff = null;
	}
	// EVERY ONE IN THE DOCUMENT, not only the node this window
	// remembers. Since A177 the panel is a child of this window's own
	// root, so closing takes it — but a panel left by a PREVIOUS build
	// or by an orphaned window is still in the document, and this is
	// the sweep that finds it. A query that narrowed to `host.rootEl`
	// would stop finding exactly the ones nothing else will.
	try {
		const d0 = d.ownerDoc();
		const old = Array.from<HTMLElement>(d0.querySelectorAll('.ws-org-proppop'));
		for (const n of old) n.remove();
	} catch (_) { wsCatch('openManuscriptModal / orgPropPopClose: const d0 = ownerDoc();', _); }
};
const orgPropPopRender = () => {
	const pop = orgPropPopEl();
	if (!pop) return;
	const box = pop.querySelector('.ws-org-propbody');
	if (!box) return;
	box.empty();
	const q = orgPropPopQuery.trim().toLowerCase();
	const rows = orgPropPanelRows()
		.filter(r => !q || r.name.toLowerCase().indexOf(q) !== -1);
	// ONE TOGGLE, DRAWN THE SAME WAY TWICE. A dead one keeps its box
	// and its width and loses only its handler, so the column of
	// ticks stays a column.
	const tog = (into: HTMLElement, on: boolean, dead: boolean, title: string, fn: () => Promise<void>) => {
		// THE STATE CLASSES ARE WHOLE LITERALS, not `'is-' + kind`.
		// `ws-dev/selectors.js` greps main.js as TEXT, so a class
		// assembled from a prefix and a variable names nothing it can
		// find — the self-check went red on `is-fld` the first time
		// this was built, which is the check doing its job.
		const t = into.createSpan({ cls: 'ws-org-ptog is-col'
			+ (on ? ' is-on' : '') + (dead ? ' is-dead' : '') });
		// THE STAR IS A BOX LIKE THE OTHER TWO, and it is drawn as a
		// star by the stylesheet rather than by a glyph in the markup:
		// this vault reads in Roboto Mono and a character a font does
		// not carry renders as tofu. `.ws-org-pbox` is the same box in
		// all three columns, so a tick and a star line up.
		t.createSpan({ cls: 'ws-org-pbox' });
		// ── EXCEPT THE LONG COLUMN, WHICH IS A SCROLL ──────────────
		//
		// "for the long item in outline mode change it to scroll-text"
		// (writer, 2026-08-31, with the Lucide link).
		//
		// IT WAS NOT A GLYPH AT ALL: three CSS gradients stacked into a
		// ≡. The reason nothing was TYPED still stands — a character a
		// font does not carry renders as tofu — and it does not reach
		// here: a Lucide icon is an SVG, not a character, so there is no
		// font to be missing it.
		//
		// TOMBSTONE: the ★ column drew a `scroll-text` glyph inside its
		// box here, tried against three names because `setIcon` fails
		// SILENTLY on one this build’s Lucide does not carry — which is
		// how the export icon went missing for a release. The column went
		// at the writer’s word; the glyph goes with it.
		t.title = title;
		if (dead) { t.setAttribute('aria-disabled', 'true'); return t; }
		t.setAttribute('role', 'checkbox');
		t.setAttribute('aria-checked', on ? 'true' : 'false');
		t.addEventListener('click', (ev: Event) => {
			ev.preventDefault();
			ev.stopPropagation();
			void fn();
		});
		return t;
	};
	let drew = 0;
	const clearAim = () => {
		for (const el2 of Array.from<HTMLElement>(box.querySelectorAll('.ws-drop-above'))) {
			el2.removeClass('ws-drop-above');
		}
	};
	for (const r of rows) {
		const row = box.createDiv({ cls: 'ws-org-prow' });
		const rid = orgPropRowId(r);
		if (rid) row.setAttribute('data-id', rid);
		if (r.col) row.setAttribute('data-col', r.col.id);
		if (r.key) row.setAttribute('data-key', r.key);
		// ── THE GRIP, AND IT IS NOT DECORATION ─────────────────
		//
		// It was not drawn at all in 375, deliberately: a handle that
		// does nothing is the dead-control fault this window keeps
		// removing, and the drag was a batch away. It arrives with it.
		//
		// SEARCHING TURNS IT OFF. A drop while the list is filtered
		// would write an order over rows the writer cannot see — the
		// fold-as-filter fault, one control along.
		const grip = row.createSpan({ cls: 'ws-org-pgrip' });
		// A LUCIDE GRIP, NOT THE MOCK'S ⠿. The mock simulates Obsidian
		// in a browser with whatever font it likes; this vault reads in
		// Roboto Mono, and a braille glyph a font does not carry renders
		// as tofu. Names tried in order and CHECKED, because `setIcon`
		// fails silently on one this build's Lucide has dropped.
		for (const n2 of ['grip-vertical', 'grip', 'more-vertical']) {
			grip.textContent = '';
			try { if (setIcon) setIcon(grip, n2); } catch (_) { wsCatch('openManuscriptModal / orgPropPopRender: if (setIcon) setIcon(grip, n2);', _); }
			if (grip.childElementCount > 0) { grip.dataset.icon = n2; break; }
		}
		if (!q && rid) {
			grip.addClass('is-propdrag');
			grip.title = 'Drag to reorder — this is the column order '
				+ 'and the chip order';
			row.setAttribute('draggable', 'true');
			row.addEventListener('dragstart', (ev: DragEvent) => {
				orgPropDragId = rid;
				try { ev.dataTransfer.setData('text/plain', rid); } catch (_) { wsCatch('openManuscriptModal / orgPropPopRender: ev.dataTransfer.setData(\'text/plain\', rid);', _); }
			});
			row.addEventListener('dragover', (ev: Event) => {
				if (!orgPropDragId || orgPropDragId === rid) return;
				ev.preventDefault();
				clearAim();
				row.addClass('ws-drop-above');
			});
			row.addEventListener('drop', (ev: Event) => {
				ev.preventDefault();
				const moved = orgPropDragId;
				orgPropDragId = null;
				clearAim();
				if (!moved || moved === rid) return;
				void orgPropMoveTo(moved, rid);
			});
			row.addEventListener('dragend', () => {
				orgPropDragId = null;
				clearAim();
			});
		}
		const colOn = !!(r.col && !d.colOff.has(r.col.id));
		tog(row, colOn, false,
			r.col ? 'Show as a column in Table'
				: 'Add “' + r.name + '” as a column',
			() => orgPropColToggle(r));
		// TOMBSTONE: THE ▤ COLUMN (writer, 2026-08-31, "remove those 2
		// columns in proprities"). It asked "show this under every row
		// in Outline" of a property, and "show it on the note’s own
		// line, beside the flag" of a reading — one column of ticks
		// because to the writer it was one question.
		//
		// There is no Outline, and both stores it wrote are deleted on
		// load: the tick did not survive a reload. A control that lands,
		// draws itself, and is gone next time is worse than no control.
		// TOMBSTONE: THE ★ COLUMN (writer, 2026-08-31, "remove the star
		// too — we dont need that long field anymore, we have only the
		// table"). Asked for on 2026-08-28 as a tick rather than a
		// right-click, "so i can click it (to work ok on mobile too)".
		//
		// IT MARKED A PROPERTY AS THE LONG ONE — written out in full on
		// an Outline card while every other chosen property was a chip.
		// That distinction was the CARD’s: a table row is one line, so
		// with only the table there is no block to be, and the writer
		// said so in those words.
		//
		// AND IT WAS NOT INERT WHEN IT WENT, which is why this tombstone
		// is longer than the loss. `organizerLongFields` also fed
		// `longFields()` → `synopsisOfKey()` → `synopsisOf()`, which
		// draws the synopsis chevron on a Table row. That still works:
		// the SET is gone and `synopsisKey` — the single key it
		// superseded, and still the default — is what the chevron reads
		// now. A vault pointing at `Description` goes on pointing there.
		const nm = row.createSpan({ cls: 'ws-org-pname' });
		// ── AND A READING WEARS ITS OWN GLYPH TOO (writer, 2026-09-02) ──
		//
		// "add icons for our proprietes too : words, target, flag, type,
		// etc in the proprieties submenu."
		//
		// THIS SLOT WAS DELIBERATELY EMPTY and the reason was sound: a
		// vault property's glyph is chosen from its TYPE, and a reading
		// has no type to read, so the old comment here said "empty for a
		// reading, not guessed". Correct about guessing, wrong about the
		// alternative — nobody has to guess, because every reading was
		// given a glyph by hand in `BUILTIN_SORTS` and the Sort menu has
		// been drawing them all along. Measured there the same night:
		// twelve rows, twelve glyphs.
		//
		// SO IT IS THE SAME LOOKUP AT A SECOND SURFACE, not a second
		// table. `BUILTIN_SORTS` stays the one writer of what a reading
		// looks like, and a column added tomorrow gets its glyph in both
		// places or in neither.
		//
		// GUARDED, because `SORTS` is declared further down this method
		// than this line is written: it is initialised long before the
		// panel can be opened, but a `let` read before its declaration
		// throws rather than returning undefined, and an empty slot is a
		// better outcome than a panel that does not draw.
		const ic = nm.createSpan({ cls: 'ws-org-piconslot' });
		if (r.key) orgPropIcon(ic, r.key);
		else if (r.col) {
			try {
				const def = d.SORTS.filter((sd) => sd.id === r.col.id)[0];
				if (def && def.icon && setIcon) {
					setIcon(ic, def.icon);
					if (ic.childElementCount > 0) ic.dataset.icon = def.icon;
				}
			} catch (_) { wsCatch('openManuscriptModal / orgPropPopRender: const def = SORTS.filter((sd) => sd.id === r.col.id)[0];', _); }
		}
		nm.createSpan({ cls: 'ws-org-pnametext', text: r.name });
		row.createSpan({ cls: 'ws-org-pkind', text: orgPropKindOf(r) });
		// ── AND THE DELETE, WHICH LIVES HERE NOW ───────────────
		//
		// Writer, 2026-08-31, asked whether removing a property should
		// follow the retired expanded view out or move onto the chip:
		// "move onto the chip".
		//
		// THIS PANEL HAD NO DELETE AT ALL. `removeProp` was reachable
		// only from two context menus, and this is the panel that exists
		// to answer "which properties do I have" — the one place a
		// writer looks to manage them.
		//
		// THE CHIP'S OWN MARK. `.ws-org-chipx` is the × on a lens chip
		// and means exactly this: take this one away. Same glyph, same
		// meaning, one row along — and the grip's own tooltip already
		// calls this list "the chip order".
		//
		// THE SLOT IS ALWAYS DRAWN, EMPTY WHERE IT CANNOT ACT. Only a
		// property the writer ADDED can be removed — a reading declared
		// in `COLS` has nothing to delete, and a vault property that is
		// not a column yet was never added. Drawing the cell either way
		// is the same rule the tick above follows: "a dead one keeps its
		// box and its width and loses only its handler, so the column
		// stays a column".
		// ── TOMBSTONE: THE × (writer, 2026-09-04) ────────────────────
		//
		// "we need to think on that x on the proprieties menu - remove
		// propriety to not create confusion between deleting a propriety
		// or just uncheck it (maybe it's best to remove that x and the
		// checkbox near a propriety will suffice)".
		//
		// THEY WERE RIGHT AND THE MEASUREMENT SAYS WHY. The × called
		// `removeProp`, which takes the column out of `uniUserCols` and
		// touches no file; the tick puts the same column in or out of
		// `uniColsOff`. Both are about the column. One removed the
		// entry, the other hid it, and nothing on screen said which was
		// which — A133 had to read the source to answer it.
		//
		// THE SLOT STAYS, EMPTY. The caption row and the rows are
		// separate grids that line up only because they fill the same
		// number of cells — measured 2026-08-28, when a missing fourth
		// cell put 8px between the two.
		//
		// WHAT IS LOST, AND IT IS REAL: nothing prunes `uniUserCols`
		// now, so a key added once is offered for ever — and since A135
		// the chosen TYPE lives on that entry. The writer was told this
		// before saying yes; if the list grows unwieldy the answer is
		// one prune in the settings tab, away from the table.
		const del = row.createSpan({ cls: 'ws-org-pdel is-dead' });
		void del;
		drew++;
	}
	if (!drew) {
		box.createDiv({ cls: 'ws-org-propnone',
			text: 'No property of that name' });
	}
};
// TOGGLES, LIKE THE PANEL'S OWN DOOR. A second press on the same row
// shuts it — without this the row looks dead, because closing and
// reopening draws the identical list in the identical place.
// ── A VIEWPORT POINT, IN THE COORDINATES THE FLYOUT IS PLACED IN ──
//
// Writer, 2026-09-09: "the proprieties menu opens too far from the
// button", with a shot of the panel a hand’s width to the right of it.
//
// MEASURED IN THE VAULT: the button’s bottom-left at (1348, 135), the
// style written as left 1251 / top 135 — and the panel painted at
// (2409, 175), because its offset parent is the `workspace-leaf` at
// (1158, 40). Every number was right and they were in two different
// frames of reference.
//
// IT ONLY SHOWED UP IN A PANE. The flyouts are drawn inside the host
// (A177, so the modal’s focus trap counts them as inside the window) and
// a MODAL’s root starts at the viewport origin, where the two frames
// agree. A pane’s root starts wherever the leaf is — and the panes are
// what the window is now (A258).
//
// ONE CONVERTER FOR BOTH FLYOUTS, because they had one bug: the panel
// and its type submenu place themselves the same way, and fixing the
// one the writer photographed would have left the other.
const orgPopBase = (el: HTMLElement) => {
	try {
		const par = el && el.offsetParent;
		if (!par || !par.getBoundingClientRect) return { left: 0, top: 0 };
		const b = par.getBoundingClientRect();
		return { left: b.left || 0, top: b.top || 0 };
	} catch (_) { wsCatch('openManuscriptModal / orgPopBase: const par = el && el.offsetParent;', _); return { left: 0, top: 0 }; }
};
const orgPropSubOpen = (anchor: HTMLElement, door: { label?: string; icons?: string[]; types: { id: string; label: string }[]; pick: (type: string, ev2: MouseEvent) => void; open?: (ev2: MouseEvent) => void }) => {
	const was = !!orgPropSubEl();
	orgPropSubClose();
	if (was) return null;
	const d0 = d.ownerDoc();
	const sub = (d.host.rootEl || d0.body)
		.createDiv({ cls: 'menu ws-org-propsub' });
	for (const t of (door.types || [])) {
		const row = sub.createDiv({ cls: 'ws-org-propsubrow' });
		row.createSpan({ text: t.label });
		row.dataset.type = t.id;
		row.addEventListener('click', (ev: MouseEvent) => {
			ev.preventDefault();
			ev.stopPropagation();
			orgPropSubClose();
			try { door.pick(t.id, ev); } catch (_) { wsCatch('openManuscriptModal / orgPropSubOpen: door.pick(t.id, ev);', _); }
		});
	}
	// ── BESIDE THE ROW, AND FLIPPED WHEN THERE IS NO ROOM ───────
	//
	// The same idiom as the panel, and the same reason for the
	// `try`: `getBoundingClientRect` is all zeros under jsdom, which
	// lands this at the origin and changes nothing any assertion
	// reads. TOP-ALIGNED WITH THE ROW, not below it — a submenu that
	// drops downward from the last row of a panel goes off the foot
	// of the window.
	// A SHEET ON A PHONE, LIKE THE PANEL IT HANGS OFF (A294-e, the writer’s
	// DOM snippet: `ws-org-propsubrow` with data-type="datetime" — the
	// row was there, under the bar). This wears `menu`, so app.css draws
	// it at the foot of the screen with `top: unset !important`; a placed
	// `left` would only fight the sheet’s insets. The stylesheet sets its
	// `bottom` to the bar’s measured height, as the panel’s is.
	if (typeof Platform !== 'undefined' && Platform && Platform.isPhone) return sub;
	try {
		// OFF THE PANEL'S EDGE, NOT THE ROW'S. Measured in the vault:
		// anchored to the row, the flyout started 9px INSIDE the panel
		// and overlapped its border, because the row sits inside 8px of
		// panel padding and 6px of its own. The ROW still gives the
		// height — a submenu lines up with the thing that opened it.
		const r = anchor.getBoundingClientRect();
		const box = (orgPropPopEl() || anchor).getBoundingClientRect();
		const w0 = d.ownerWin();
		const wide = sub.offsetWidth || 0;
		const tall = sub.offsetHeight || 0;
		const vw = w0.innerWidth || 0;
		const vh = w0.innerHeight || 0;
		let x = box.right;
		if (vw && x + wide > vw) x = Math.max(0, box.left - wide);
		let y = r.top;
		if (vh && y + tall > vh) y = Math.max(0, vh - tall);
		// INTO THE FRAME IT IS PLACED IN (A273). The reads above are all
		// viewport rects, and the flyout is positioned inside the host.
		const base = orgPopBase(sub);
		sub.style.left = Math.round(x - base.left) + 'px';
		sub.style.top = Math.round(y - base.top) + 'px';
	} catch (_) { wsCatch('openManuscriptModal / orgPropSubOpen: const r = anchor.getBoundingClientRect();', _); }
	return sub;
};
const orgPropPopOpen = (anchor: HTMLElement) => {
	orgPropPopClose();
	const d0 = d.ownerDoc();
	// ── IN THE WINDOW, NOT ON THE BODY (A177, writer 2026-09-05) ──
	//
	// “i cannot seach in the proprieties sub meanu in the organiser
	// ( i think it redraws it after i click in the search box)”.
	//
	// MEASURED IN THE VAULT, FRONTED, AND THE REDRAW IS INNOCENT: the
	// box takes focus, the node is NOT replaced — same node,
	// `isConnected` true after 700ms — and setting its value filters
	// the list from 29 rows to 1. The filter has always worked.
	//
	// WHAT HAPPENS IS THAT OBSIDIAN TAKES THE FOCUS BACK. Within
	// 700ms `document.activeElement` is the first `.ws-uni-tab` in the
	// strip, and the stack captured at that `focusout` has NO PLUGIN
	// FRAME IN IT — it is the modal's own focus trap, which treats an
	// element outside the modal as an escape and hauls the caret in.
	// A bare input proves it both ways: appended to `body` while this
	// window is open it takes focus and loses it to a tab; appended to
	// `rootEl` it keeps it.
	//
	// AND THE OLD REASON FOR THE BODY DOES NOT HOLD. Three comments
	// said the panel hangs outside so this window's `overflow: hidden`
	// cannot clip it. IT IS `position: fixed`, and `.ws-uni-modal`
	// sets no transform, filter, perspective or containment — so it is
	// not a containing block for a fixed child, and its overflow
	// cannot clip one. Measured with the panel driven 176px BELOW the
	// modal's bottom edge: identical rect and hit-testable at a point
	// outside the window, from either parent. The fear was real; the
	// mechanism was not.
	//
	// THE BODY IS STILL THE FALLBACK, for a host that has no root — a
	// panel drawn nowhere is worse than a panel that cannot be typed
	// in.
	const pop = (d.host.rootEl || d0.body)
		.createDiv({ cls: 'menu ws-org-proppop' });
	// ── TOMBSTONE: THE HEAD ROW (A180, writer 2026-09-05) ───────
	//
	// “also, remove those descriptions”, with a red line struck
	// through the whole row. It carried “PROPERTIES” on the left
	// and “drag to reorder” on the right.
	//
	// BOTH ARGUMENTS WERE MINE AND BOTH WERE THIN. The name said
	// the panel “names itself after the button that opened it” —
	// a label on a panel that opens from one button, an inch
	// above it, reading the same word. The hint was put there
	// because “a gesture is not a door”, and that rule is right:
	// but the GRIPS are drawn on every row and visible, so the
	// gesture already had its door and this was a caption on top
	// of it. `git log -S ws-org-propheadsay`.
	const srch = pop.createEl('input', { cls: 'ws-org-propsearch' });
	srch.type = 'text';
	srch.placeholder = 'Search properties…';
	srch.value = orgPropPopQuery;
	srch.addEventListener('input', () => {
		orgPropPopQuery = srch.value || '';
		orgPropPopRender();
	});
	// ── TOMBSTONE: THE CAPTION ROW (A180, writer 2026-09-05) ────
	//
	// Struck through in the same screenshot as the head: the row
	// under the search box carrying a ▦ icon and the word “name”.
	// `capIcon` goes with it — it had one caller.
	//
	// IT WAS “where the panel teaches itself”, and it taught one
	// column of ticks. It had been built to teach three, and the
	// other two went with the Outline at the writer’s word
	// (2026-08-31) — so it had been a third of a caption for a
	// week, and this is the rest of that removal arriving.
	//
	// WHAT DIED WITH IT, so nobody re-derives it: the caption and
	// the rows were separate grids that lined up only if they read
	// ONE track list AND filled the same NUMBER of cells. A
	// missing fourth cell put the name column 8px out on
	// 2026-08-28 and 57px out on 2026-08-31, and `--ws-prop-tracks`
	// is in `em` so the font-size was part of the fact. With one
	// grid left there is nothing to line up against — which is why
	// this is safe to take out and would not have been before.
	pop.createDiv({ cls: 'ws-org-propbody' });
	// ── AND ONE SWITCH FOR HOW WIDE THEY ALL ARE ───────────────
	//
	// It sits at the foot with the add door because it is the only
	// other control here that is about the SET rather than about a
	// property — every row above answers "is this a column", and
	// these two answer questions about the table.
	{
		const au = pop.createDiv({ cls: 'ws-org-propauto' });
		const g = au.createSpan({ cls: 'ws-org-propautoicon' });
		for (const n of ['move-horizontal', 'unfold-horizontal', 'maximize-2']) {
			g.textContent = '';
			try { if (setIcon) setIcon(g, n); } catch (_) { wsCatch('openManuscriptModal / orgPropPopOpen: if (setIcon) setIcon(g, n);', _); }
			if (g.childElementCount > 0) { g.dataset.icon = n; break; }
		}
		au.createSpan({ text: 'Resize columns to fit' });
		au.title = 'Set every column to the width of what it holds, '
			+ 'up to six tenths of the pane. They stay draggable afterwards.';
		// A BUTTON, NOT A SWITCH (writer, 2026-08-31): "i don’t want a
		// checkbox for autoresize just a button that does resize —
		// after i play around with the columns sizes, see a
		// description, maybe add some tags, then i want to click
		// resize columns and just that."
		au.addEventListener('click', (ev: Event) => {
			ev.preventDefault();
			ev.stopPropagation();
			d.orgColFit();
		});
	}
	// ── THE ADD DOORS, AND THEY ARE THE SAME TWO (A141) ─────────
	//
	// One row became two at the writer's ask. BUILT FROM A LIST so
	// the header menu below can offer the same two from the same
	// names: a hand-typed second copy is how a door gets added in
	// one place and forgotten in the other, which this window has
	// a rule about.
	for (const door of d.ORG_PROP_DOORS) {
		const add = pop.createDiv({ cls: 'ws-org-propadd' });
		{
			const g = add.createSpan({ cls: 'ws-org-propaddicon' });
			for (const n of door.icons) {
				g.textContent = '';
				try { if (setIcon) setIcon(g, n); } catch (_) { wsCatch('openManuscriptModal / orgPropPopOpen: if (setIcon) setIcon(g, n);', _); }
				if (g.childElementCount > 0) { g.dataset.icon = n; break; }
			}
		}
		// THE LABEL IS NAMED (A179). It was the only unclassed span on
		// the row, which was fine while it was the only span after the
		// icon — the chevron made it two, and `row.textContent` started
		// answering 'Add a new property\u203a' to a check about the
		// label. A reader that has to strip decoration off a string is
		// one decoration away from being wrong again.
		add.createSpan({ cls: 'ws-org-propaddname', text: door.label });
		// ── THE CHEVRON IS THE DOOR ONTO THE TYPES (A179) ────
		//
		// The writer drew it themselves — “a rightclick submenu
		// with the ‘>’”. It is drawn only on the door that HAS a
		// submenu: a chevron on the row that opens a modal would
		// promise a list that never comes.
		if (door.types) {
			add.addClass('has-sub');
			add.createSpan({ cls: 'ws-org-propmore',
				text: '\u203a' });
		}
		add.addEventListener('click', (ev: MouseEvent) => {
			// ── AND THE PANEL STAYS OPEN (A179) ──────────────
			//
			// TOMBSTONE: `orgPropPopClose()` stood here, on both
			// doors. “the propriety pane should not close”.
			//
			// THE NAMING MODAL STILL OPENS over it, at the
			// writer's word when asked (2026-09-05): the panel is
			// behind it and is still there afterwards, which is the
			// part that was costing them the list.
			ev.preventDefault();
			ev.stopPropagation();
			if (door.types) { orgPropSubOpen(add, door); return; }
			// A DOOR WITHOUT TYPES TAKES THE SUBMENU WITH IT. Two
			// flyouts open at once over one panel is a stack the
			// writer never asked for.
			orgPropSubClose();
			door.open(ev);
		});
	}
	orgPropPopRender();
	// UNDER THE BUTTON, and pulled back inside the frame when there
	// is not room to its right. `getBoundingClientRect` is all zeros
	// under jsdom, which lands the panel at the origin and changes
	// nothing any assertion reads.
	// ON A PHONE IT IS A SHEET, AND NOT PLACED AT ALL (A286). This element
	// wears Obsidian’s `menu` class, and app.css makes every `.is-phone
	// .menu` a full-width sheet at the foot of the screen — `left` and
	// `right` at the safe-area insets, `top: unset !important`. An inline
	// `left` beat the stylesheet’s and left the sheet starting under the
	// button and running off the glass: “Targe”, “Last m”, “Create” in the
	// writer’s shot. The Sort and Filter menus are real Obsidian menus and
	// already open as sheets there; this one now does the same.
	// THE PHONE SKIPS THE PLACEMENT, NOT THE CLOSE (A298-e). This `return`
	// stood here since A293 and left the sheet with no outside listener on
	// a phone at all — the writer’s landscape sheet that nothing would
	// close. The listener below is wired whatever the platform; only the
	// placing is the desktop’s.
	const phoneSheet = !!(typeof Platform !== 'undefined' && Platform && Platform.isPhone);
	if (!phoneSheet) try {
		const r = anchor.getBoundingClientRect();
		const w0 = d.ownerWin();
		const wide = pop.offsetWidth || 0;
		const room = (w0.innerWidth || 0) - wide;
		// INTO THE FRAME IT IS PLACED IN (A273): the clamp is done in
		// VIEWPORT space, where the room was measured, and the result is
		// converted once, at the end.
		const base = orgPopBase(pop);
		const x = Math.max(0, room > 0 ? Math.min(r.left, room) : r.left);
		pop.style.left = Math.round(x - base.left) + 'px';
		// TWO PIXELS UNDER THE BUTTON, LIKE THE MENUS BESIDE IT (A286, item
		// 19; writer: “the sort submenu and the filter and the properties are
		// misaligned with their respective buttons vertically”). Obsidian’s
		// own positioner writes `top = y + 2` for every menu it places, so
		// Sort and Filter sat 2px lower than this one. Same number, one row.
		pop.style.top = Math.round(r.bottom - base.top) + 2 + 'px';
	} catch (_) { wsCatch('openManuscriptModal / orgPropPopOpen: const r = anchor.getBoundingClientRect();', _); }
	// ── DISMISS: ESCAPE, AND A CLICK ANYWHERE ELSE ──────────────
	//
	// ON THE WINDOW, IN CAPTURE, for the reason the Escape ladder
	// gives: capture from the top is the only phase that cannot be
	// beaten by a listener registered earlier. And on `ownerWin`,
	// not the global — a popout's clicks happen in the popout.
	//
	// THE BUTTON IS NOT AN OUTSIDE CLICK. It toggles, so letting the
	// dismiss run first would close the panel and let the button
	// reopen it — a press that appears to do nothing.
	const onDown = (ev: Event) => {
		const hit = wsNodeOf(ev.target);
		try {
			if (pop.contains(hit)) return;
			// THE SUBMENU IS NOT AN OUTSIDE CLICK (A179). It is a
			// SIBLING of the panel, not a child, so `pop.contains`
			// says no to it — and picking a type would have shut the
			// panel the writer asked to keep open.
			const sub0 = orgPropSubEl();
			if (sub0 && sub0.contains(hit)) return;
			const t = wsElOf(ev.target) || (hit && hit.parentElement);
			if (t && t.closest('.ws-org-colsbtn')) return;
		} catch (_) { wsCatch('openManuscriptModal / onDown: if (pop.contains(ev.target)) return;', _); }
		orgPropPopClose();
	};
	// ── ESCAPE IS THE LADDER'S, AND ONLY THE LADDER'S ───────────
	//
	// TOMBSTONE: a second capture listener on `keydown` here, which
	// closed the panel itself. MEASURED IN THE VAULT 2026-08-28 and
	// it was WRONG: Escape typed into the panel's search box closed
	// the panel AND THE WHOLE WINDOW — the exact fault reported from
	// a vault three times about renames, one control along.
	//
	// The cause is that the panel is not inside `host`, so the
	// window's own ladder declined the key on its scope test and
	// whatever ran next closed the window. Two listeners racing for
	// one key is the shape; the fix is not a better racer. The
	// ladder's scope test now KNOWS about the panel (see `onEscape`)
	// and the panel is its topmost rung, so one place decides what
	// Escape means in this window.
	try {
		const w0 = d.ownerWin();
		// POINTERDOWN, NOT MOUSEDOWN (A298-e, writer in landscape: “no way to close
		// the propriety submenu … tapping out of the modal”): a tap on the phone
		// raises no compatibility mousedown where a touch handler has claimed the
		// touch, and the pane’s own have; a pointerdown comes for every finger.
		w0.addEventListener('pointerdown', onDown, true);
		orgPropPopOff = () => {
			try { w0.removeEventListener('pointerdown', onDown, true); } catch (_) { wsCatch('openManuscriptModal / orgPropPopOpen: w0.removeEventListener(\'mousedown\', onDown, true);', _); }
		};
	} catch (_) { wsCatch('openManuscriptModal / orgPropPopOpen: const w0 = ownerWin();', _); }
	return pop;
};
// (A418: `orgAddDraft` stood here — "a property being ADDED to one note",
// a draft the add flow was to carry. Nothing ever read it: it was declared
// null, set null by `doneDraft` at seven exits, and read nowhere. Cut with
// the door and its calls; the comments below that still say `doneDraft()`
// tell the history of the guard's ORDER — release, then orgEditDone — and
// that order stands.)

// ── THE EDIT-GUARD (spec: a focused row never redraws) ──────────────
//
// While any field editor holds focus, drawOrg DEFERS: the pane is
// not rebuilt, so the editor element — and the writer's cursor,
// selection and half-typed sentence — survive every index event,
// order change and lens ring that lands mid-edit. The deferred
// redraw runs the moment the edit ends. This is the last arrow of
// view → writer → vault → event → index → view, held until the
// writer looks up.
let orgEditGuard: { path: string; key: string } | null = null;      // truthy while an editor holds focus
// ── ONE CELL IS OPEN AT A TIME (writer, 2026-09-03) ─────────────
//
// "if i click into the some tags cells, it leaves those plus sings
// all over and even if if i click on empty space they are still
// there". The plus is the placeholder on `.ws-org-chipval`, the add
// box inside the chips editor — so a plus left behind IS an editor
// left behind in a cell nobody is writing in.
//
// AND IT COULD NOT BE FIXED AT THE BLUR, which is where I looked
// first. An opened editor DOES NOT FOCUS ITSELF — `engage` arms the
// guard on the element's own `focus` event and nothing calls
// `.focus()` — so clicking a cell opens a box that never receives
// focus, never blurs, and is never taken away. `orgEditDone` cannot
// help either: it returns early unless a redraw was already owed,
// which the file notes elsewhere ("AND IT COMES BACK IF NOTHING
// REDRAWS") and worked around locally for the date field.
//
// SO IT IS FIXED WHERE THE SECOND ONE IS BORN. Opening an editor
// asks whether another is open and, if so, rebuilds the pane first —
// `drawOrg` is the ONE writer of a cell's contents, so nothing here
// has to know how to un-draw one. `orgOpenAfter` carries the cell to
// re-open across that redraw, because the `td` it was clicked on
// does not survive it.
let orgOpenAfter: { path: string; id: string; key: string } | null = null;      // to re-open after a redraw
const orgOtherEditorOpen = (td: HTMLElement) => {
	try {
		return Array.from(d.panel.querySelectorAll('.ws-org-editor'))
			.some((e) => !td.contains(e));
	} catch { return false; }
};
let orgRedrawPending = false;
let orgFieldEscape: () => void = null;    // the focused editor's own Escape, for the ladder
const orgEditDone = () => {
	orgEditGuard = null;
	orgFieldEscape = null;
	if (!orgRedrawPending) return;
	// ── THE CARET MAY BE LANDING IN THE NEXT FIELD (6b, 2026-08-31)
	//
	// Writer: moving from one field to another in a card can wipe
	// the pane. REPRODUCED, and the event order is the whole of it —
	// `blur` fires BEFORE the incoming `focus`, so a redraw run here
	// tears out the field the caret is moving INTO, half a tick
	// before it gets there.
	//
	// MEASURED IN THE VAULT, Obsidian foregrounded, on a card
	// carrying two real fields (a `textarea` and the tags `input`):
	// focus A, queue a redraw — A survives, which is the edit-guard
	// working — then focus B, and `A blur -> BODY` is followed by
	// **both A and B out of the document**. Focus ends on `body`.
	//
	// ONE TICK IS ENOUGH TO TELL THE TWO APART. `orgEditGuard` is
	// armed by an editor's own `focus` handler, and focus follows
	// blur in the same task, so by the time this timeout runs the
	// guard says whether the writer moved to another field or left
	// the fields altogether.
	//
	// AND `orgRedrawPending` IS NOT CLEARED on the way out: if the
	// caret did land in another editor, the redraw is still owed and
	// runs when THAT edit ends. Clearing it here would drop the
	// index event that queued it, which is the fault this whole
	// guard exists to avoid — the pane would go stale instead of
	// flickering, which is worse and quieter.
	window.setTimeout(() => {
		if (orgEditGuard) return;
		if (!orgRedrawPending) return;
		orgRedrawPending = false;
		d.drawPanel();
	}, 0);
};

// ── ONE FIELD, TYPED FROM THE REGISTRY ──────────────────────────────
//
// input / growing textarea / chips with vault autocomplete / toggle
// / number / date — decided by `orgPropType` (metadataTypeManager,
// feature-detected) and the value at hand. Flat values only: a
// nested object is read-only here and edited in the note. Commit on
// blur and Enter; Shift+Enter is a newline in the textarea; Escape
// restores and backs out. Every write goes through the ONE
// frontmatter writer, `orgPropWrite`.
// ── WHAT THIS NOTE ACTUALLY HAS — ONE READER ─────────────────
//
// Frontmatter keys are the writer’s capitals and the index keeps
// them, so every lookup is case-insensitive. This was written out
// inside `orgFieldEditor`; the card now has to ask the same question
// before it draws anything, and two loops over `entry.props` that
// disagreed about case would show a property in one place and hide
// it in the other.
// ── AND THIS IS A READER TOO (A125, 2026-09-04) ──────────────────
//
// Writer: "if i click on it it disapears and if i write in it it
// overwrites the text, its not behaveing like the other description
// cells for md files". Exactly right, and this line is why: the
// EDITOR seeds itself from here, and here read only the org index —
// which is built from `getMarkdownFiles`, so a PDF has no entry. The
// box opened EMPTY over a cell that was showing a value, and the
// next keystroke replaced it.
//
// THE A80 CARD CALLED `propRaw` "the ONE reader" AND IT WAS WRONG.
// There are three — the column (`orgColRaw`), the property lookup
// (`propRaw`) and this one — and a fallback wired into two of three
// is a value that displays and cannot be edited.
const orgPropValue = (path: string, key: string) => {
	const entry = d.plugin._orgIndex && d.plugin._orgIndex.get(path);
	if (entry && entry.props) {
		for (const k of Object.keys(entry.props)) {
			if (k.toLowerCase() === String(key).toLowerCase()) {
				return entry.props[k];
			}
		}
		return null;
	}
	const sv = d.plugin.propStoreGetSync(String(path || ''), key);
	return sv === undefined ? null : sv;
};
// ONE EDITOR, ONE CALLER, AND NO SWITCH (2026-08-31). It took a
// fifth argument, `oneLine`, whose whole job was to suppress a
// textarea that GROWS with its content — right in an Outline card,
// wrong in a 24px cell, because the row would change height as a
// writer types and this session lost two rounds to a control doing
// exactly that.
//
// With the outline gone there is one caller and it always passed
// true, so the branch could not run and the argument could not
// vary. Both removed rather than left: a knob with one setting is a
// knob somebody turns.
const orgFieldEditor = (card: HTMLElement, path: string, key: string, isDraft: boolean) => {
	// ── THE HOST WAS EMPTIED TO HOLD THIS, SO A REPAINT IS OWED ──────
	//
	// Writer, 2026-09-01: "look what happens if i click in a tags cell.
	// it adds that plus and when i click out it does not go away, it
	// fucks up the row making in double".
	//
	// MINE, from A47. `orgEditDone` redraws only if a repaint was
	// already held back, and a click that changes nothing holds none
	// back — so the chips box stayed in the cell after the blur, at the
	// height of two lines, with its add-box still in it. Exactly what
	// the writer described.
	//
	// TOMBSTONE: `if (isDraft) orgRedrawPending = true` on two blur
	// handlers. That condition asked the wrong question. A draft row
	// must vanish when abandoned — true — but so must a CELL editor,
	// because both callers do `td.textContent = ''` before building one:
	// the host has already thrown away what it was showing. There is no
	// caller that wants the editor left on screen, so the question is
	// not "is this a draft" but "was something cleared to make room",
	// and the answer is always yes at this line.
	//
	// ASKING AT BIRTH RATHER THAN AT EACH TEARDOWN. There are four ways
	// out of here — checkbox blur, chips blur, scalar commit, scalar
	// Escape — and the scalar pair never asked at all, so `orgPropCell`
	// left a bare `<input>` in the cell on an unchanged click too. One
	// line here covers all four and cannot be forgotten by a fifth.
	//
	// It is safe to set this early: `orgEditDone` consumes it a tick
	// later and only when no other editor has taken focus, so moving
	// between two fields still defers the redraw to the last one.
	orgRedrawPending = true;
	// ── AND THE HOST SAYS IT IS HOLDING ONE ─────────────────────────
	//
	// Writer, 2026-09-01: "make the whole cell writable not that grey
	// stuff (i'm in a description cell)", with a shot of a small grey
	// box floating in a much wider cell.
	//
	// MEASURED: the cell is 119 × 23.6 with 4px/10px of padding, and
	// the input inside it was 66.4 × 19.6 — a third of the room, sat
	// in the middle of it. An `<input>` takes its `size` in characters
	// and does not grow to its box, and an empty value asks for the
	// floor of six.
	//
	// A CLASS RATHER THAN `:has()`. The stylesheet needs to know that
	// THIS cell is being written in — to drop its padding, so the
	// field reaches the edges rather than leaving a grey box inside a
	// bigger one. `td:has(> .ws-org-editor)` would say it too, and
	// `cascade_check` cannot read a `:has()` selector, so the rule
	// would be unguarded.
	//
	// NOTHING TAKES IT OFF, and nothing needs to: every way out of an
	// editor repaints the panel now (the line above), and the repaint
	// builds the cell again from nothing.
	try { card.addClass('is-editing'); } catch (_) { wsCatch('openManuscriptModal / orgFieldEditor: card.addClass(\'is-editing\');', _); }
	const v = orgPropValue(path, key);
	const complex = (v !== null && typeof v === 'object' && !Array.isArray(v))
		|| (Array.isArray(v) && v.some(x => x !== null && typeof x === 'object'));
	if (complex) {
		card.createDiv({ cls: 'ws-org-editor is-complex',
			text: 'complex value — edit in note' });
		return null;
	}
	// The registry first, the VALUE AT HAND second: Obsidian's type
	// registry lags a fresh property and answers nothing for one it
	// has not met — but a value that IS a number, a boolean or a
	// date already says what widget it wants (measured live: `num:
	// 3` drew a text box for the 900ms the registry took to learn
	// it, and a probe reaching for input[type=number] found null).
	let type = d.plugin.orgPropType(key);
	if (!type && v !== null) {
		if (typeof v === 'number') type = 'number';
		else if (typeof v === 'boolean') type = 'checkbox';
		else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(wsStr(v))) type = 'datetime';
		else if (/^\d{4}-\d{2}-\d{2}$/.test(wsStr(v))) type = 'date';
	}
	const engage = (el2: HTMLElement, esc: () => void) => {
		el2.addEventListener('focus', () => {
			orgEditGuard = { path, key };
			orgFieldEscape = esc;
		});
	};
	// `tags` IS A LIST WHATEVER THE REGISTRY SAYS. The other three
	// tests all need something to read: a type Obsidian has learnt,
	// or a value that is already an array. A note with NO tags
	// offers neither — `v` is null and a fresh registry answers
	// nothing — so the first tag on a note would have been typed
	// into a TEXT box and written as a string. This vault already
	// carries what that costs: one note whose whole tags list is
	// the single string "#ideas #todo". Named by key, once.
	const listKinds = type === 'tags' || type === 'multitext'
		|| type === 'aliases' || Array.isArray(v)
		|| String(key).toLowerCase() === 'tags';
	if (type === 'checkbox') {
		const box = card.createEl('input', { cls: 'ws-org-editor' });
		box.type = 'checkbox';
		box.checked = v === true;
		engage(box, () => { box.checked = v === true; box.blur(); });
		// A toggle says what it means the moment it flips.
		box.addEventListener('change', () => { void (async () => {
			await d.orgPropSet(path, key, box.checked);
		})(); });
		// AN UNTOUCHED DRAFT IS ABANDONED BY CLICKING AWAY. The scalar
		// branch has always done this - `commit()` calls `doneDraft()`
		// when nothing changed - and the naming branch does it too.
		// These two did not, and the consequence was not a stale flag:
		// `orgEditDone` REDRAWS, the redraw draws the still-live draft
		// again, the draft row takes focus on its timeout and re-arms
		// the guard the blur had just released. `drawOrg` returns early
		// while that guard is up, so the whole panel stopped repainting
		// - the mode picker, the columns and the drawer all froze, and
		// none of that looks like a draft bug. A writer who opened a
		// list-typed or checkbox draft and changed their mind had no
		// way out but to give it a value (2026-08-24, found by the
		// probe as four unrelated reds).
		// AND IT REPAINTS — asked for once, where the editor is built,
		// because every editor empties its host. See the head of
		// `orgFieldEditor`.
		box.addEventListener('blur', () => {
			orgEditDone();
		});
		return box;
	}
	if (listKinds) {
		// CHIPS. Frontmatter values are the writer's and editable;
		// for `tags`, the note's BODY tags appear too — dimmed,
		// non-removable, marked "in text", because deleting a #tag
		// means editing prose and that is the editor's job.
		const wrap2 = card.createDiv({ cls: 'ws-org-editor is-chips' });
		const now = Array.isArray(v) ? v.filter(x => x !== null && typeof x !== 'object').map(String)
			: (v === null || v === '' ? [] : [wsStr(v)]);
		// ── THE LIST THE BOX IS HOLDING, NOT THE ONE IT WAS BUILT WITH ──
		//
		// "i cannot enter more tags. there is a problem with Tags."
		//
		// MEASURED in the writer’s vault, 2026-08-27, on a note carrying
		// one tag `zzalpha`, with the Obsidian window brought to the
		// FOREGROUND first — Chromium defers focus events for a background
		// window, and a drive that does not do this reads a guard that never
		// armed. Typing `zzbeta` + Enter, then `zzgamma` + Enter, left the
		// note holding `[zzalpha, zzgamma]`. THE SECOND TAG ATE THE FIRST,
		// so a writer can never get past one more tag than they started
		// with. It is also why this vault has a note whose tags are the
		// single string "#ideas #todo": two tags typed into one box,
		// because two boxes never worked.
		//
		// THE EDIT-GUARD IS WHY, AND THE GUARD IS RIGHT. While the caret is
		// in this box the pane is not rebuilt, so the editor — and `now`,
		// the list it closed over when it was drawn — survives the write.
		// Every Enter therefore committed `now.concat([val])` from the SAME
		// stale snapshot. Both halves were right alone: the guard keeps the
		// box still, and the box read a list only a rebuild could refresh.
		// The fix belongs HERE and not in the guard — taking the guard’s
		// teeth out would fix the tags by throwing away every half-typed
		// sentence in the pane.
		//
		// So the box keeps its own running copy. `now` stays what the note
		// had when this editor was drawn, and the chips are built from it;
		// `live` is what it has NOW, and it is the only list a commit reads
		// or writes.
		let live = now.slice();
		const commitList = async (list: string[]) => {
			// THE DELTA IS AGAINST `live`, the list this box last wrote — a
			// chip taken off after one was added is one removal, not a
			// replay of both (A349).
			await d.orgPropListSet(path, key, list, live);
			live = list.slice();
		};
		// ONE CHIP BUILDER, because a chip is now made in two places: when
		// the box is drawn, and when a tag is added to a box that is NOT
		// going to be redrawn (see `live` above). Without the second, the
		// tag a writer just typed lands in the file and shows nothing —
		// which reads exactly like the bug this is fixing.
		// THE PILLS' HOST, typed by the key (A371): a tags list wears
		// the tag colours, any other list the plain pill.
		const pillHost = d.orgTagWrap(wrap2, String(key).toLowerCase() === 'tags' ? 'tags' : 'multitext');
		const mkChip = (val: string) => {
			// ── THE × IS THERE, BUT ONLY WHEN REACHED FOR ────────
			//
			// "remove the x pills" (2026-08-30), then — once they were
			// gone — "now you removed the x button completely and i can’t
			// remove tags". Both are right, and they are not in conflict:
			// four buttons on a row of four words is clutter, and no
			// button at all is a list you cannot take anything out of.
			//
			// THE COST WAS FLAGGED BEFORE IT WAS PAID and the answer was
			// offered with it: hide it at REST and show it under the
			// pointer. The row reads as words again, and the door is
			// where a hand already is when it wants one.
			//
			// IT KEEPS ITS BOX AT REST — `opacity`, not `display` — so the
			// pill does not change width under the pointer, which is the
			// reflow-on-hover fault the chip itself has a comment about.
			//
			// OBSIDIAN'S PILL (A371), through the one builder; the ×
			// is its remove button.
			const chip = d.orgTagPill(pillHost, String(val), { remove: () => {
				// the pill goes once the list is written, as before; a failed
				// write keeps it and reaches the console
				void commitList(live.filter(z => z !== val)).then(() => chip.remove());
			} });
			return chip;
		};
		for (const val of now) mkChip(val);
		if (String(key).toLowerCase() === 'tags') {
			const inText = new Set(now.map(t => String(t).replace(/^#/, '').toLowerCase()));
			let bodyTags = [];
			try {
				const f2 = d.plugin.app.vault.getAbstractFileByPath(path);
				const c2 = f2 && d.plugin.app.metadataCache.getFileCache(f2);
				for (const t of ((c2 && c2.tags) || [])) {
					const tag = String(t.tag || '').replace(/^#/, '');
					if (tag && !inText.has(tag.toLowerCase())
						&& bodyTags.indexOf(tag) === -1) bodyTags.push(tag);
				}
			} catch (_) { wsCatch('openManuscriptModal / orgFieldEditor: const f2 = this.app.vault.getAbstractFileByPath(path);', _); }
			for (const tag of bodyTags) {
				const chip = d.orgTagPill(pillHost, tag, { intext: true });
				chip.title = 'Written in the note itself — edit it there';
			}
		}
		const inp = wrap2.createEl('input', { cls: 'ws-org-chipval' });
		inp.placeholder = '+';
		const dlid = 'ws-org-fdl-' + Math.floor(Math.random() * 1e9);
		const dl = wrap2.createEl('datalist'); dl.id = dlid;
		for (const opt of d.plugin.orgDistinctUnder('', key).slice(0, 60)) {
			dl.createEl('option', { value: wsStr(opt) });
		}
		inp.setAttribute('list', dlid);
		engage(inp, () => { inp.value = ''; inp.blur(); });
		// ── A TAG IS NOT FREE TEXT ─────────────────────────
		//
		// Writer, 2026-08-28: "obsidian does not let tags with spaces in
		// them, so check how it is the proper way to work with tags in
		// obsidian."
		//
		// THE RULE, from Obsidian’s own documentation: a tag may contain
		// letters (any language), numbers but NOT as the first character,
		// underscore, hyphen, and forward slash for nesting. Nothing
		// else — no spaces — and in FRONTMATTER it is written without the
		// leading `#`, which is inline syntax.
		//
		// THIS BOX TOOK ANYTHING, and this vault shows the cost: tags
		// reading `maka baka` and `dfdf fddf dfdf df`, and one note whose
		// whole tags list is the single string `#ideas #todo` — two tags
		// typed into one box back when a second box did not work (419).
		// Obsidian indexes none of them, so they are invisible to its own
		// search while sitting in plain sight in ours.
		//
		// A SPACE IS REPAIRED, A LEADING DIGIT IS REFUSED. A writer typing
		// two words means one tag, and `-` is the form Obsidian’s own docs
		// use for it — there is a right answer, so we write it. A leading
		// digit has no such answer: no character can be assumed to be the
		// one they meant, and silently inventing one is worse than saying
		// no.
		//
		// TAGS ONLY. The same box edits `Characters` and `aliases`, where
		// "the Father" is a perfectly good value; the probe asserts that
		// pair, or this would be a rule about tags quietly applied to
		// every list.
		const isTagField = String(key).toLowerCase() === 'tags';
		const tagClean = (raw: string) => String(raw)
			// The `#` is how a tag is written IN PROSE; frontmatter carries
			// the bare name, and a writer types the hash out of habit.
			.replace(/^#+/, '')
			// Whole runs, so “a  b” does not become “a--b”.
			.replace(/\s+/g, '-')
			// Everything Obsidian will not index, dropped rather than
			// substituted — `\p{L}` so this holds for any language.
			.replace(/[^\p{L}\p{N}_\-/]/gu, '')
			// A nest separator is one slash, and never an edge.
			.replace(/\/{2,}/g, '/').replace(/^[-/]+|[-/]+$/g, '');
		inp.addEventListener('keydown', (ev: KeyboardEvent) => { void (async () => {
			if (ev.key !== 'Enter') return;
			ev.preventDefault();
			const typed = inp.value.trim();
			if (!typed) { inp.blur(); return; }
			const val = isTagField ? tagClean(typed) : typed;
			if (isTagField && (!val || /^\p{N}/u.test(val))) {
				// SAID OUT LOUD. A box that silently swallows what was typed
				// reads as broken — which is what "there is a problem with
				// Tags" was, one fault ago.
				try {
					new Notice(val ? 'A tag cannot start with a number — Obsidian '
						+ 'will not index “' + val + '”.'
						: 'That is not a tag Obsidian can index.');
				} catch (_) { wsCatch('openManuscriptModal / orgFieldEditor: new Notice(val ? \'A tag cannot start with a number — Obsidian \'', _); }
				return;
			}
			if (live.indexOf(val) === -1) {
				await commitList(live.concat([val]));
				// BEFORE THE "in text" ONES, which are the note’s prose and not
				// this list — a tag just typed belongs with the ones it joined.
				const at = wrap2.querySelector('.ws-org-tagchip.is-intext') || inp;
				wrap2.insertBefore(mkChip(val), at);
			}
			// AND THE BOX EMPTIES EITHER WAY. It did not on a successful add,
			// so the next tag was typed onto the end of the last one — the
			// other half of "i cannot enter more tags".
			inp.value = '';
		})(); });
		// The same, for a list: see the checkbox branch above.
		inp.addEventListener('blur', () => {
			orgEditDone();
		});
		return inp;
	}
	// The single-value editors share one commit/restore shape.
	const was = v === null ? '' : wsStr(v);
	let el2;
	// TOMBSTONE: A GROWING TEXTAREA FOR A LONG FIELD (2026-08-31).
	// `!oneLine && (type === 'longtext' || isLongField(key))` drew a
	// `<textarea class="is-grow">` that resized to its content — the
	// synopsis editor on an Outline card.
	//
	// `oneLine` existed to suppress it, and since the outline went its
	// one caller — the Table's property cell — has always passed true,
	// so this could not run. The parameter goes with the branch rather
	// than being left as an argument nobody may pass differently: a
	// knob with one setting is a knob somebody turns.
	//
	// A TABLE ROW IS ONE LINE, which is the writer's own rule twice
	// over — "two rounds were lost this session" to a control that
	// changed a row's height. A long value edits in a one-line input
	// and the resizable columns answer the width (A27/A27a).
	{
		el2 = card.createEl('input', { cls: 'ws-org-editor' });
		if (type === 'number') el2.type = 'number';
		else if (type === 'date') el2.type = 'date';
		else if (type === 'datetime') el2.type = 'datetime-local';
		else el2.type = 'text';
		el2.value = was;
		// ── AND IT IS AS WIDE AS WHAT IT HOLDS ───────────────────
		//
		// "the outline is still cut". Measured on a Description whose
		// value is 547px of text: the input was 155.2px — an `<input>`
		// takes its default size of about twenty characters and does
		// NOT grow to its content, so anything longer is cut off inside
		// a chip that has already shrink-wrapped around it. `Pov: the
		// Father` fits in twenty and looked fine; a sentence does not.
		//
		// `size` IS THE MECHANISM AN INPUT HAS for this — a width in
		// characters, which is what the card is measured in too. Capped
		// at 60 so one long value cannot push the line off the pane;
		// floored at 6, which is the `min-width` the chip already used.
		try {
			const n = String(was == null ? '' : was).length;
			el2.size = Math.max(6, Math.min(60, n + 1));
		} catch (_) { wsCatch('openManuscriptModal / orgFieldEditor: const n = String(was == null ? \'\' : was).length;', _); }
	}
	let settled = false;
	const commit = async () => {
		if (settled) return;
		settled = true;
		const raw = el2.value;
		// THE DRAFT IS CANCELLED BEFORE THE REDRAW, NOT AFTER IT.
		// These two were the other way round on this branch alone -
		// the path below, where a value actually changed, has always
		// had them in this order. `orgEditDone` REDRAWS if a repaint
		// was held back, so running it first repainted a panel whose
		// `orgAddDraft` was still set: the draft row came back, took
		// focus again on its timeout, and re-armed the very guard the
		// blur had just released. `doneDraft()` then cleared the flag
		// with no repaint left to notice - a row on screen the state
		// says is gone, and a panel that has stopped redrawing.
		// Found by the probe 2026-08-24: four assertions about the
		// columns, the mode class and the drawer all went red at once,
		// none of them about drafts, because `drawOrg` returns early
		// while the guard is up and that is the one gate every repaint
		// passes.
		if (raw === was) { orgEditDone(); return; }
		let out: string | number = raw;
		if (type === 'number') {
			const n = parseFloat(raw);
			out = raw.trim() === '' ? '' : (isFinite(n) ? n : raw);
		}
		// ── THE PANE IS HANDED BACK BEFORE THE DISK (A158) ──────
		//
		// Writer, 2026-09-04: “ok, just do the async thingy”, meaning
		// the rebuild that “lands in two halves”.
		//
		// THESE TWO LINES STOOD AFTER THE AWAIT, so the edit was not
		// over until the file had been written. Clicking a second cell
		// while this one is open sets `orgOpenAfter` and calls
		// `drawOrg`, which returns early WHILE THE GUARD IS UP — so
		// the second cell opened only when this write resolved.
		//
		// MEASURED IN THE VAULT, window fronted, on the fixture folder,
		// three rounds each, click-to-editor:
		//
		//     non-md    51.3  69.1  60.8 ms
		//     markdown  57.7  57.1  58.7 ms
		//
		// against a `drawPanel` of 6.7–21ms and a `setTimeout(0)` of 0.
		// The FIRST run of this drive said 0.2ms and proved nothing:
		// Obsidian was backgrounded, Chromium fired no `focus`, the
		// guard was never armed and the fault could not happen. The
		// window has to be fronted for this measurement to exist.
		//
		// AND THE OTHER THREE EDITORS ALREADY DO THIS. The checkbox and
		// the chips both release the guard in their own `blur` —
		// `doneDraft(); orgEditDone();`, no await — and only this one
		// held it across a disk write. This is the fourth editor
		// joining the other three, not a new behaviour.
		//
		// NOTHING RACES THE GUARD, because `orgEditDone` runs here
		// while this editor is the one that just blurred. That is the
		// 6b danger and it is why the repaint below is NOT another
		// `orgEditDone`: by the time the write lands the guard may
		// belong to the NEXT cell, and clearing it would tear out the
		// field the writer is typing in.
		const stored = d.plugin.propStoreHolds(path);
		orgEditDone();
		await d.orgPropSet(path, key, out);
		// A STORED PROPERTY FIRES NO INDEX EVENT. A markdown write
		// reaches the pane through the ring; a non-md one lands in
		// `ws-structure.md` and rings nothing, so without this the
		// cell would keep the value it had before — the same reason
		// `step` asks for a repaint on the stored path and not the
		// other. THROUGH `drawPanel`, which reaches `drawOrg` — “the
		// one gate every repaint passes”, so a late write that finds
		// another editor open waits for it instead of interrupting it.
		if (stored) d.drawPanel();
	};
	engage(el2, () => {
		// Escape RESTORES — the write never happens, the field says
		// what the note says, and the key backs out one step.
		settled = true;
		el2.value = was;
		el2.blur();
	});
	el2.addEventListener('keydown', (ev: KeyboardEvent) => {
		if (ev.key === 'Enter') {
			// Shift+Enter is a NEWLINE in the growing textarea; a
			// bare Enter commits everywhere.
			if (ev.shiftKey && el2.tagName === 'TEXTAREA') return;
			ev.preventDefault();
			// AND THE KEY STOPS HERE (A337, writer 2026-09-13: “if i enter a
			// value in a propriety field and press enter it opens the
			// note”). The rename and the target editor stop their Enter;
			// this one let it travel on to the document, where Obsidian’s
			// keymap handles it AFTER the field has blurred below — so the
			// pane’s own Enter found nothing typing and opened the cursor
			// row. One act from one key.
			ev.stopPropagation();
			el2.blur();   // blur is the one committer
		}
	});
	el2.addEventListener('blur', () => {
		if (settled) { settled = false; orgEditDone(); return; }
		void commit();
	});
	// ── A DATE SHOWS THE WRITER'S FORMAT, AND EDITS ON A CLICK ──────
	//
	// Writer, 2026-08-27: the same day read `1999-01-22` in Table and
	// `22/01/1999` here. 361 gave Table one formatter; this half could
	// not be done by formatting harder, because the thing on screen WAS
	// a live `<input type="date">` — a native date input renders in the
	// BROWSER's locale and takes no instruction. No setting could ever
	// have reached it.
	//
	// ONLY date AND datetime. A text or number input already displays
	// exactly what is stored, so there is no disagreement to fix and
	// swapping them would be a behaviour change to every field for
	// nothing. The narrow rule is the whole reason this is safe.
	//
	// A DRAFT OPENS STRAIGHT INTO THE BOX: a key being added has no
	// value to show, and making the writer click the empty space they
	// just asked for would be a second gesture for one intention.
	if ((type === 'date' || type === 'datetime') && !isDraft) {
		const shown = card.createSpan({ cls: 'ws-org-shown' });
		// ── IT SAYS WHAT THE BOX SAYS, WHENEVER IT IS ASKED ────
		//
		// Writer, 2026-08-28: "putting in dates is kinda glitchy, they
		// dont update untill i exit the modal and enter again the
		// modal."
		//
		// THE WRITE ALWAYS LANDED. Measured: `processFrontMatter` got
		// the new day and the span went on showing the old one — so a
		// writer saw their typing thrown away and found it there the
		// next time they opened the window.
		//
		// IT WAS DRAWN ONCE AND PUT BACK UNCHANGED. This span is what
		// a date field IS at rest; the blur that restores it was
		// written to swap two classes, so it restored the STRING the
		// span had been built with. Whether a redraw arrives afterwards
		// is a different question and not one this field may depend on:
		// the span goes back in the same tick the value changes.
		//
		// SO IT RENDERS, rather than remembering. One function, called
		// when the field is built and again whenever the box stands
		// down — and it goes through `formatValue`, so a day at rest
		// and a day in a Table cell cannot disagree.
		const sayDay = (raw: unknown) => {
			const fmt2 = d.plugin.formatValue(key, raw, type, d.plugin.dateStyle());
			// AN EMPTY DAY STILL NEEDS SOMETHING TO CLICK, or a property
			// with no value yet becomes uneditable the moment it stops
			// being an input.
			shown.setText(fmt2.text || '—');
			shown.toggleClass('is-empty', !fmt2.text);
			shown.toggleClass('ws-org-badval', !fmt2.ok);
			shown.title = fmt2.ok ? ''
				: ('This is not a valid ' + type + ': ' + wsStr(raw));
		};
		sayDay(v);
		el2.addClass('is-editing-off');
		// FOCUSABLE, because it replaced something that was. The field
		// was reachable by Tab when it was permanently an input, and a
		// display that could only be opened with a mouse would be a
		// keyboard regression dressed as a formatting fix.
		shown.tabIndex = 0;
		const open = () => {
			shown.addClass('is-editing-off');
			el2.removeClass('is-editing-off');
			try { el2.focus(); } catch (_) { wsCatch('openManuscriptModal / open: el2.focus();', _); }
		};
		shown.addEventListener('click', open);
		shown.addEventListener('focus', open);
		shown.addEventListener('keydown', (ev: KeyboardEvent) => {
			if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
		});
		// AND IT COMES BACK IF NOTHING REDRAWS. `orgEditDone` only
		// repaints when a repaint was held back, so an unchanged value
		// blurs with no redraw at all — and the field would be left as a
		// bare locale-formatted box until something else happened.
		//
		// READING THE BOX, NOT THE VALUE IT WAS BUILT WITH. That is the
		// whole of the 2026-08-28 fix: this handler restored the classes
		// and left the old day on screen.
		el2.addEventListener('blur', () => {
			sayDay(el2.value);
			el2.addClass('is-editing-off');
			shown.removeClass('is-editing-off');
		});
	}
	return el2;
};

// The field row itself: property label (the view-wide picker), the
// editor, and the per-row "+" that adds a property to that note.
// ── A PROPERTY WEARS ITS TYPE'S GLYPH (writer, 2026-08-23) ──────
//
// Matching Obsidian's own properties block, which the writer sent a
// picture of: a small icon, the key, then the value. The icon is not
// decoration - it says what KIND of property this is, which is why
// `tags` gets a tag and `aliases` gets the forward arrow while an
// ordinary text key gets the lines.
//
// TWO KEYS ARE SPECIAL BY NAME rather than by type: Obsidian treats
// `tags` and `aliases` as their own things and draws them so, and a
// writer reading the row expects the same picture in both windows.
//
// Names in order and CHECKED, as everywhere else here: `setIcon`
// fails silently, and Lucide has renamed several of these.
const ORG_PROP_ICONS: Record<string, string[]> = {
	tags:     ['tags', 'tag'],
	aliases:  ['forward', 'corner-up-right', 'arrow-right'],
	checkbox: ['check-square', 'square-check', 'check'],
	number:   ['binary', 'hash'],
	date:     ['calendar', 'calendar-days'],
	datetime: ['clock', 'calendar-clock'],
	list:     ['list'],
	text:     ['text', 'align-left', 'list']
};
const orgPropIcon = (into: HTMLElement, key: string) => {
	const k = String(key || '').toLowerCase();
	let names = null;
	if (k === 'tags' || k === 'tag') names = ORG_PROP_ICONS.tags;
	else if (k === 'aliases' || k === 'alias') names = ORG_PROP_ICONS.aliases;
	if (!names) {
		let t = '';
		try { t = String(d.plugin.orgPropType(key) || ''); } catch { t = ''; }
		names = ORG_PROP_ICONS[t]
			|| (t === 'multitext' ? ORG_PROP_ICONS.list : ORG_PROP_ICONS.text);
	}
	const g = into.createSpan({ cls: 'ws-org-propicon' });
	for (const n of names) {
		g.textContent = '';
		try { if (setIcon) setIcon(g, n); } catch (_) { wsCatch('openManuscriptModal / orgPropIcon: if (setIcon) setIcon(g, n);', _); }
		if (g.childElementCount > 0) { g.dataset.icon = n; break; }
	}
	return g;
};
// ── THE PROPERTY ROW TAKES A DROP, AND NEVER STARTS ONE ─────────
//
// Measured 2026-08-24: with the drawer open only 30.4% of the
// vertical run between two notes accepted a drop (24.1% in
// Outline), because this row sat between them with no handler. A
// writer dragging a scene a short distance let go over nothing and
// watched it spring back.
//
// DROP-ONLY. `orgRowDrag` would set `draggable="true"` here too,
// and then selecting text in a synopsis would start dragging the
// note instead of selecting it.
//
// THE WHOLE ROW MEANS "AFTER ITS NOTE". This row hangs below the
// note it describes, so every point in it is after that note; with
// two notes adjacent, "after A" and "before B" are one insertion.
// A midpoint split would be arithmetic with no question behind it.
//
// The folder rules in `orgRowDrag` cannot arise: field rows are
// built under `!isFolder` only.
// ── THE CHOSEN SET REARRANGES, BY DRAGGING ONE PROPERTY OVER
// ── ANOTHER (writer’s Q5/Q6 answer; logged unbuilt until now) ──
//
// The STORE was ready and only the gesture was missing: ticking
// APPENDS, so `orgOutlineProps` has always been "the order the
// writer chose them in" and nothing but a drag was needed to
// change it. The line this replaces said so plainly — "Dragging a
// drawer row to reorder is NOT built; it is logged."
//
// IT BINDS TO THE PROPERTY, NOT TO THE ROW. A chosen property is
// drawn as a labelled row here and as a chip in the Outline’s chip
// row; binding the gesture to a surface would build it twice and
// let the two disagree about what "above" means. So: ONE
// arithmetic (`wsOrgDropBefore` — the same one every reorder in
// this window already ends in), one mover, and two binders that
// any element standing for a property calls.
//
// KEPT APART FROM THE NOTE DRAG BY IDENTITY. This row already
// accepts a NOTE drop (316) and both gestures now sit on the same
// `tr`. FACTS records what it costs when two handlers on one
// element touch shared state before deciding who owns the event:
// whichever was registered first eats the drag and the other sees
// nothing. Here each side reads only its OWN state, and every
// handler returns before clearing a mark or reading a key while
// the other side’s state is live — so registration order is not
// part of the design.
//
// AND THE HANDLE IS THE LABEL, NOT THE ROW: `draggable` on the row
// takes text selection away from the synopsis, which is exactly
// why `orgFieldDrop` is drop-only.
// WHICH OF THE CHOSEN ARE CHIPS — ONE WRITER (2026-08-24). The
// Outline draws the synopsis as the stacked block from the writer’s
// first mock and everything else as chips under it, and both the
// renderer and the reorder have to agree about which is which. Two
// copies of that filter is two writers of one fact.
// NOT OFFERED WHEN THERE IS NOTHING TO REARRANGE, and the count that
// matters is the CHIPS. A grab cursor over a drag that cannot land
// is a control that lies, and after the chip split there are two
// ways for it to lie: one chosen property, or one chosen property
// PLUS the synopsis - which stacks on its own and is not part of the
// line being rearranged.
// ── AND THE SAME QUESTION FOR THE BLOCKS (writer, 2026-08-28) ───
//
// "make so that i can have more than one long fields (plus i can
// arrange them in the outline view with drag and drop)."
//
// THE 326 TOMBSTONE IS WHY THIS IS A SECOND COUNT AND NOT THE SAME
// ONE. The stacked row WAS a drag handle, built and retired in one
// batch, because the synopsis was the only property ever drawn as a
// block and "an affordance whose only possible target is itself is
// the control-that-lies fault". That was true of ONE long field and
// is false of two — so the handle comes back, and only when there are
// two blocks to swap.
//
// BLOCKS AGAINST BLOCKS, chips against chips. Both wrote the same
// ordered set through `orgPropsMove` — retired 2026-08-31 with the
// rows that called it — but a block dragged onto the chip LINE had
// nowhere to land that a writer could see: the chips are one row, so
// moving a block among them changed the stored order and nothing on
// screen. Offering it would have been the springs-back fault.
// WITHIN ONE NOTE’S BLOCK. The set is view-wide, so the arithmetic
// would work perfectly well across notes — and a drag that
// travelled DOWN the table to land the property UP the set is a
// gesture whose result contradicts its direction. The block under
// the cursor is the one being rearranged; a drop anywhere else
// says no by not lighting up, which is the refusal grammar the
// rest of this window already uses.
// ONE BUILDER FOR THE PER-NOTE "+", because the stacked block and
// the chip row both carry it. Two copies of a menu that WRITES a
// draft is the two-writers fault with a redraw on the end of it.
// TOMBSTONE: `orgAddPropBtn` (2026-08-30). The "+" that opened the
// property picker on an outline card. Its only caller was the open
// card's last row, and that went at the writer's word — "no more
// add a propriety - we have the table for that".
//
// DELETED RATHER THAN LEFT: a helper with no caller is a name
// somebody reuses, and `drawHead` is what that costs when it is
// left for later — 322 unreachable lines for nine days, then a
// no-op stub with three callers for another five. Both gone now;
// the example is kept because the cost was real.

// ── PICKING A PROPERTY’S TYPE (writer, 2026-08-25) ─────────────
//
// "just like how obsidian does it" - so it IS how Obsidian does it:
// the vocabulary is read from their registry and the choice is
// written to their store. The menu says so in its title, because a
// control that quietly changes every note in the vault has to.
//
// A TICK, NOT A HIGHLIGHT, and it distinguishes three states the way
// Obsidian does: an ASSIGNED widget is ticked; with none assigned
// nothing is ticked and the inferred one is named in the footer row.
// ── THE MOCK’S CHIP ROW (writer’s second Outliner mock) ─────
//
// "with a synopsis then below I can pick what I want tags, other
// properties including the clickable flag." So in Outline the
// synopsis keeps the BLOCK the first mock asked for — muted label,
// value in body type, behind the left rule — and everything else
// the writer ticked is a CHIP on one line under it.
//
// THE FLAG IS NOT REPEATED HERE. The mock draws one and it landed
// on the TITLE line at 310, through `orgFlagCycle`. A second
// clickable flag on the same note would be two doors onto one
// fact, which is the thing this window keeps removing.
//
// AND IT IS NOT A SECOND CHIP. `orgFieldEditor` already renders a
// list-typed property as `.ws-org-tagchip` pills with an add box,
// and the tags story — body tags dimmed, non-removable, marked "in
// text" — lives inside it. A chip here is the [glyph + key + THAT
// EDITOR] unit laid along a line, so every typed editor, every
// commit path and the whole tag story keep working unchanged.
// ── HOW DEEP A ROW STANDS, WRITTEN ONCE (writer, 2026-08-28) ────
//
// "indent more the whole proprieties part so it's more clear that
// those are under each note."
//
// MEASURED FIRST, AND THE NUMBER WAS NOT THE FAULT. The block sat
// 16px LEFT of its own note's name — but only at THAT depth. The name
// cell is padded `10px + depth * step` and the property cell was a
// flat `10px`, so the gap between a note and its own properties GREW
// by one step for every folder level it was under. A constant was
// standing in for a fact the row already knows.
//
// TWO CALLERS, ONE FUNCTION, and that is the point: the stacked block
// and the chip line are built by DIFFERENT builders, and the first
// attempt stamped only one of them — measured after deploying, the
// block moved and the chips under it did not.
//
// `+ 1` FOR THE SUBJECT, exactly as the name cell does it and for the
// same reason: `row.depth` counts from the subject, and the
// stylesheet's `calc(10px + depth * step)` cannot take a -1.
// ── WHICH FIELD ROW OPENS A NOTE'S CARD, AND WHICH CLOSES IT ────
//
// A note draws one `<tr>` per long field plus one for its chips, and
// each carries a card. Stamped as a run, they can be padded as ONE:
// the opener keeps its top padding, the closer keeps its bottom and
// gains the space that separates this note from the next name, and
// everything between them closes up to the mock's 4px.
//
// RE-STAMPED WHEN THE DRAFT JOINS, because a draft arrives after the
// run is built and becomes the new closer — leaving the old one
// marked would put the gap in the middle of a note.
// `openCard` IS THE WHOLE SET, NOT A FLAG. An open card draws one row
// per property, so each call gets ONE key — and a row that knows only
// its own key cannot size a column shared with its siblings. Passing
// the set makes the width derivable here instead of guessed in the
// stylesheet; truthiness still says "this is an open card".
	return { orgPropPopEl, orgPropPanelRows, orgPropSubEl, orgPropSubClose, orgPropPopClose, orgPropPopOpen, orgOtherEditorOpen, orgEditDone, orgPropValue, orgFieldEditor, get orgEditGuard() { return orgEditGuard; }, set orgEditGuard(v) { orgEditGuard = v; }, get orgOpenAfter() { return orgOpenAfter; }, set orgOpenAfter(v) { orgOpenAfter = v; }, get orgRedrawPending() { return orgRedrawPending; }, set orgRedrawPending(v) { orgRedrawPending = v; }, get orgFieldEscape() { return orgFieldEscape; }, set orgFieldEscape(v) { orgFieldEscape = v; } };
};
