// Word-Smith — organizer-flags. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import type { WsOrgRow } from './organizer-rows';
import type { WsOrgColAgg } from './organizer-readings';
import type { WsOrgCol } from './organizer-cols';
import type { WsOrgCtx } from './org-ctx';
import type { WsOrgJournalEntry } from './organizer-journal';
import { setIcon } from 'obsidian';
import { WS_STATUSES, wsCatch, wsFlagSvg, wsMenu, wsStatusLabel, wsStr, wsSvgInto } from './preamble';
import type WordSmith from './plugin';
import type { WordSmithSettings } from './settings';

// ════════════════════════════════════════════════════════════════════════
// THE FLAGS — the store write, the bulk set, the menu, the cell, the repaint
// ════════════════════════════════════════════════════════════════════════
//
// THE THIRD PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-14), by
// `ws-dev/lift.js`: the block left the closure as it stood, dedented, with
// every read of the closure routed through `d` — `d.s` the settings,
// `d.statusStore()` the store's key, `d.markOf` a row's flag, `d.drawPanel`
// the redraw, `d.orgBulkPaths` / `d.orgBulkSay` the selection, `d.orgCellHint`
// (read and SET) the one-cell draw hint, `d.orgHistPush` / `d.orgHistOn` the
// journal, `d.COLS` / `d.orgColText` / `d.orgColRaw` / `d.orgColAgg` the
// readings, `d.orgUnder` / `d.orgAt` the scope, `d.tableCtx` the table's
// aggregate drawer, and `d.plugin` for `saveSettings` and the explorer's
// repaint. Those getters are the whole of what a flag needs from the
// window; the closure's comments on each function came with it.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgFlagsMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (13 of 17).
export interface OrgFlagsDeps {
	plugin: WordSmith;
	readonly s: WordSmithSettings;
	readonly statusStore: () => 'fileStatus';
	readonly markOf: (path: string | number, kind: string) => string;
	readonly drawPanel: () => void;
	readonly orgBulkPaths: (row: { path: string; kind?: string } | null | undefined) => string[];
	readonly orgBulkSay: (n: number, what: string) => void;
	orgCellHint: { td: HTMLElement; path: string } | null;
	readonly orgHistPush: (entry: WsOrgJournalEntry) => void;
	readonly orgHistOn: (paths: string[], what: string) => string;
	readonly COLS: WsOrgCol[];
	readonly orgColText: (col: { id: string; key?: string; }, path: string) => string;
	readonly orgColRaw: (col: { id: string; key?: string; }, path: string) => unknown;
	readonly orgColAgg: (col: { id: string; user?: boolean; key?: string }, paths: string[]) => WsOrgColAgg;
	readonly orgUnder: (folder: string) => string[];
	readonly orgAt: () => string;
	readonly tableCtx: WsOrgCtx;
}

export const wsOrgFlagsMake = (d: OrgFlagsDeps) => {
// ── THE FLAG, CYCLED WHERE IT IS READ (writer's pass) ───────────────
// A click on the mark cell runs the same cycle Space runs in the old
// trees — '' → each flag in order → '' — through the same store, so
// the two controls can never disagree about what "next" means. The
// row's own click opens the note, so the cell stops the event.
// THE CYCLE ITSELF, on whatever element wants it. Lifted out of the
// cell below when the Outline's title line needed the same gesture
// (2026-08-23): the cell keeps its behaviour exactly, and there is
// still one description of what "next" means.
// ── AND A MENU, BECAUSE A RING IS NOT A PICKER (A193, 2026-09-06) ───
//
// Writer: “add a dropdown menu to flag row (it's hard to click 5 times
// to get a flag you want)”.
//
// THE RING IS RIGHT FOR THE NEXT STATE AND WRONG FOR A CHOSEN ONE.
// The comment above says why it exists — “a chip pressed by mistake is
// a few presses from being right again” — and that reasoning is about
// UNDOING, not about reaching. Five states means the fifth costs five
// clicks and overshooting it costs four more.
//
// SO THE RING STAYED AND THE MENU WAS ADDED BESIDE IT (2026-08-31) —
// UNTIL A236 (2026-09-07), when the writer asked for the cell itself to
// be the list: "make the flag cells in organiser a drop down list".
// The ring is gone; the list is what a click opens.
//
// IT READS THE STORE, NOT THE CELL. A menu built from what is drawn
// would disagree with the ring the moment a redraw was pending, and
// the two controls writing one fact is exactly what `statusStore`
// exists to prevent.
// ── A FLAG DOES NOT NEED THE WHOLE APPLY PASS (A208) ────────
//
// `saveSettings(true)` means “apply immediately”, and applying means
// ALL of it: body classes, CSS variables, the editor font, the style
// element, workspace aesthetics, sidebar visibility, focus mode,
// typewriter scrolling and a reconfigure of every open editor. To
// change one flag on one row.
//
// MEASURED on one click: `saveSettings` 14.4ms, of which `refresh` is
// **12ms** — and the writer’s own report on this control is that it is
// hard to click five times. Five clicks were five full applies.
//
// SO THE REFRESH IS SCHEDULED RATHER THAN FORCED. `scheduleRefresh`
// debounces at 120ms, so a run of clicks costs ONE apply instead of
// one each, and the `{flag}` token on the bar lands a frame or two
// later than a hand can notice.
//
// AND THE ONE THING THAT DID NEED THE PASS IS DONE DIRECTLY.
// `repaintExplorerFlag` exists for exactly this and carries the same
// reasoning one surface along: “Flagging a note from the bar redrew
// every tile in the tree … to change eleven pixels on one line.”
// THE CELL IS PASSED IN (A236). This read a `cell` that was never
// declared: a ReferenceError thrown AFTER the save, inside an async
// function, so a flag chosen from the menu was written and the cell
// never redrew — the promise swallowed the throw and drawPanel() was
// the line after it.
// THE FLAG STORE, WRITTEN FROM A LIST OF PAIRS, so an undo is the same
// write with the pairs it read (A350).
const orgFlagApply = async (pairs: [string, string][]) => {
	for (const [p, v] of pairs) {
		if (v) d.s[d.statusStore()][p] = v;
		else delete d.s[d.statusStore()][p];
	}
	await d.plugin.saveSettings();
	for (const [p] of pairs) d.plugin.repaintExplorerFlag(p);
	d.drawPanel();
};
const orgFlagSet = async (row: { path: string }, id: string, cell: HTMLElement | null) => {
	// ON EVERY NOTE THE SELECTION HOLDS (A320), the row alone otherwise.
	const paths = d.orgBulkPaths(row);
	const before: [string, string][] = paths.map((p) => [p, d.s[d.statusStore()][p] || '']);
	const after: [string, string][] = paths.map((p) => [p, id || '']);
	d.orgBulkSay(paths.length, id ? 'Flag set' : 'Flag cleared');
	// THE NEXT DRAW IS ABOUT THIS CELL (A209). It is a HINT and not an
	// instruction: the draw takes it only if the row list it computes
	// is identical to the one on screen, and rebuilds everything if a
	// chip or a sort moved anything.
	// ONE ROW ONLY (A393, writer 2026-09-14: "the edit flags in bulk
	// does not update automatically, only when i click out"): the
	// hint repaints the one cell and skips the draw, so the other
	// rows the write reached kept their old flag until the next
	// full draw. A bulk set takes the draw.
	d.orgCellHint = (cell && paths.length === 1) ? { td: cell, path: row.path } : null;
	d.orgHistPush({
		label: d.orgHistOn(paths, id ? 'Flag ' + wsStatusLabel(id) : 'Flag cleared'),
		undo: () => orgFlagApply(before),
		redo: () => orgFlagApply(after)
	});
	await orgFlagApply(after);
};
const orgFlagMenu = (ev: MouseEvent, row: WsOrgRow, td: HTMLElement) => {
	const now = d.markOf(row.path, 'file');
	const m = wsMenu();
	// (A261, writer 2026-09-08: "in the dropdown pick a flag modal, we
	// need to erase that heading" — the "Flag" label row that stood
	// here is gone; the flags speak for themselves.)
	// CLEARING IS A CHOICE LIKE ANY OTHER, and it is FIRST because it
	// is the one the ring makes hardest to reach — from the last state
	// it is one more click, and from anywhere else it is all of them.
	try { if (m.dom && m.dom.addClass) m.dom.addClass('ws-flag-menu'); } catch (_) { wsCatch('openManuscriptModal / orgFlagMenu: if (m.dom && m.dom.addClass) m.dom.addClass(\'ws-flag-menu\');', _); }
	const row1 = (title: string, id: string) => m.addItem((i) => {
		i.setTitle(title);
		// THE SHAPE BESIDE THE WORD (A246), drawn into the item's own icon
		// element the way the row menu's flag rows are: no Lucide name
		// draws these. Guarded — `iconEl` is not documented.
		try { if (id && i.iconEl) wsSvgInto(i.iconEl, wsFlagSvg(id, 12)); } catch (_) { wsCatch('openManuscriptModal / row1: if (id && i.iconEl) wsSvgInto(i.iconEl, wsFlagSvg(id, 12));', _); }
		// `setChecked` IS OBSIDIAN'S, and a stub without it must not take
		// the menu down with it — the tick is a courtesy, the click is
		// the feature.
		try { i.setChecked(now === id); } catch (_) { wsCatch('openManuscriptModal / row1: i.setChecked(now === id);', _); }
		i.onClick(() => orgFlagSet(row, id, td));
	});
	row1('No flag', '');
	for (const st of WS_STATUSES) row1(st.label, st.id);
	// DROPPED FROM THE CELL (A236): a dropdown hangs from its control,
	// not from wherever the pointer happened to be in it. The pointer is
	// the fallback for a cell with no box (a right-click from the
	// keyboard, a probe).
	let at = null;
	try {
		const r = td && td.getBoundingClientRect && td.getBoundingClientRect();
		if (r && (r.width || r.height)) at = { x: r.left, y: r.bottom };
	} catch (_) { wsCatch('openManuscriptModal / orgFlagMenu: const r = td && td.getBoundingClientRect && …', _); }
	try {
		if (at) m.showAtPosition(at);
		else m.showAtMouseEvent(ev);
	} catch { try { m.showAtPosition(at || { x: 0, y: 0 }); } catch (_e) { wsCatch('openManuscriptModal / orgFlagMenu: m.showAtPosition(at || x: 0, y: 0 );', _e); } }
};
// ── ONE CELL, WHEN ONLY ONE CELL CHANGED (A209) ─────────────────────
//
// MEASURED: one flag click moved **252 nodes** — the bar, the sort
// control and every row rebuilt — to change one icon on a 14-row
// table. 0.86ms a row, so a hundred-row folder is ~86ms a click, which
// is A138's “very laggy”.
//
// `repaintExplorerFlag` is the same idea one surface along, and its
// comment is this one: “Flagging a note from the bar redrew every tile
// in the tree … to change eleven pixels on one line.”
//
// IT REBUILDS THE READING, NOT THE CELL. The `td` carries the click
// cycle and the context menu, so replacing it would drop both; only
// the icon and the label are swapped, and the caret is left where it
// is. `orgColText` is the same function the draw uses, so the two
// cannot come to disagree about what a flag reads as.
// ── THE CELL ITSELF, NOT A PATH TO LOOK ONE UP BY ───────────────
//
// Written first as a lookup by path, and it painted the RIGHT cell in
// the WRONG pane: `document.querySelector` is global, and a probe that
// stands up two hosts has two rows wearing that path. The instrumented
// run said so plainly — icon in the cell, in the row, connected, right
// column — while the assertion looked at the other one.
//
// THE WRITER ALREADY HAS THE ELEMENT. Every gesture that changes a
// flag starts in the cell, so the cell is what it hands over: no
// lookup, no ambiguity, and nothing to be wrong about which pane.
// `isConnected` is the one check left — a hint can outlive its DOM.
const orgRepaintFlagCell = (td: HTMLElement, path: string) => {
	try {
		if (!td || !td.isConnected) return false;
		const col = (d.COLS || []).filter(c => c.id === 'mark')[0];
		if (!col) return false;
		const text = d.orgColText(col, path);
		const more = td.querySelector('.ws-org-flagmore');
		// EVERYTHING BUT THE CARET GOES. A cell can be going from a flag
		// to none, so removing only what is there is not enough.
		for (const kid of Array.from<ChildNode>(td.childNodes)) {
			if (kid !== more) td.removeChild(kid);
		}
		if (text) {
			const v = d.orgColRaw({ id: 'mark' }, path);
			const ic = td.createSpan({ cls: 'ws-org-flagic' });
			wsSvgInto(ic, wsFlagSvg(wsStr(v), 10));
			td.createSpan({ text: text });
			// BEFORE THE CARET, which `createSpan` appended past. The
			// caret is the last thing in the cell in a fresh draw too.
			if (more) td.appendChild(more);
		}
		// AND THE FOLDERS ABOVE IT (A334, writer 2026-09-13: “the icons
		// in the folder aggregates does not update when i modify a
		// flag”). This fast path repaints the note’s own cell and skips
		// the rebuild (A209) — which was right while a folder’s Flag
		// cell was empty (`mark: 'none'`) and wrong the day it became a
		// count per flag (A321). The folder rows that hold the note, and
		// the subject row, get their Flag cell drawn again through the
		// same drawer the build uses; the rest of the table stands.
		try {
			const table = td.closest('table');
			const draw = d.tableCtx && d.tableCtx.orgAggInto;
			if (table && draw) {
				const redo = (cell: HTMLElement, under: string[]) => {
					if (!cell) return;
					cell.textContent = '';
					cell.removeClass('ws-org-aggflags');
					const agg = d.orgColAgg(col, under);
					if (agg) draw(cell, agg);
				};
				for (const tr of Array.from<HTMLElement>(table.querySelectorAll('tr.ws-org-row.is-folder'))) {
					const fp = tr.getAttribute('data-path') || '';
					if (fp && String(path).indexOf(fp + '/') === 0) {
						redo(tr.querySelector('td[data-col="mark"]'), d.orgUnder(fp));
					}
				}
				const sub = table.querySelector('tr.ws-org-subrow td[data-col="mark"]');
				if (sub) redo(sub, d.orgUnder(d.orgAt()));
			}
		} catch (_) { wsCatch('orgRepaintFlagCell / folders above: const table = td.closest(\'table\');', _); }
		return true;
	} catch { return false; }
};
const orgFlagCell = (td: HTMLElement, row: WsOrgRow, text: string) => {
	if (text) {
		const v = d.orgColRaw({ id: 'mark' }, row.path);
		const ic = td.createSpan({ cls: 'ws-org-flagic' });
		wsSvgInto(ic, wsFlagSvg(wsStr(v), 10));
		td.createSpan({ text: text });
	}
	td.addClass('is-flag');
	// A DROPDOWN, NOT A RING (A236, writer 2026-09-07: "make the flag
	// cells in organiser a drop down list"). The cell cycled on click
	// and listed only from the ▾; the list is the control now, from
	// anywhere on the cell. The ring's own reasoning was about UNDOING
	// a wrong press — a list with a tick on the current flag undoes
	// nothing, because nothing is pressed by mistake.
	td.title = 'Choose a flag';
	td.addEventListener('click', (ev: Event) => {
		ev.stopPropagation();
		orgFlagMenu(ev as MouseEvent, row, td);
	});
	// ── THE MENU'S VISIBLE DOOR ─────────────────────────────────
	//
	// A GESTURE IS NOT A DOOR. Right-click alone is how the property
	// removal ended up reported as missing — “there is no way to
	// remove a property added” — for a feature that had existed all
	// along behind exactly that gesture and nothing pointing at it.
	//
	// ON HOVER, not always: forty rows each showing a caret is a
	// column of furniture, and the pointer is already on the row a
	// writer means. The element is in the DOM either way, so anything
	// driving it can find it without a hover to simulate.
	//
	// AND IT IS ON EVERY FLAG CELL, including an unflagged one: the
	// menu's whole point is reaching a state you are not at, and the
	// state a row is most often not at is its first.
	// A SELECT'S OWN ARROW (A354, writer 2026-09-13: "make that hover
	// chevron bigger and on the right side - to look more visually as a
	// dropdown"): Lucide's chevron-down, as Obsidian's drop-downs wear,
	// set at the cell's right edge by the sheet; the text caret only
	// where `setIcon` draws nothing.
	const more = td.createSpan({ cls: 'ws-org-flagmore' });
	try { if (setIcon) setIcon(more, 'chevron-down'); } catch (_) { wsCatch('orgFlagCell: setIcon(more, chevron-down);', _); }
	if (!more.childElementCount) more.setText('\u25be');
	more.setAttribute('aria-label', 'Choose a flag');
	more.title = 'Choose a flag';
	more.addEventListener('click', (ev: Event) => {
		// THE CELL BELOW IT CYCLES. Without this the caret would set a
		// flag on the way to offering the menu.
		ev.stopPropagation();
		orgFlagMenu(ev as MouseEvent, row, td);
	});
	td.addEventListener('contextmenu', (ev: Event) => {
		ev.preventDefault();
		ev.stopPropagation();
		orgFlagMenu(ev as MouseEvent, row, td);
	});
};
	return { orgFlagSet, orgRepaintFlagCell, orgFlagCell };
};
