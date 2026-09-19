// Word-Smith — organizer-keys. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { wsCatch, wsGuardReport, wsNodeOf, wsStatusNext } from './preamble';
import type WordSmith from './plugin';
import type { WsModEvent } from './plugin';
import type { Modifier } from 'obsidian';
import type { WsHost } from './settings';
import type { wsOrgPropsMake } from './organizer-props';
import type { wsOrgSelMake } from './organizer-sel';

// ════════════════════════════════════════════════════════════════════════
// THE KEYS — the cursor, the bindings, and what Escape backs out of
// ════════════════════════════════════════════════════════════════════════
//
// THE SEVENTEENTH PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-15, by
// `ws-dev/lift.js`): the cursor over the table's rows (`cursorItem`,
// `tableOrder`, `moveCursor`), the binder every shortcut goes through
// (`key`, which refuses while something is being typed into), `nudge` (a
// row moved by the keyboard, through the one reorder writer), and THE
// ESCAPE LADDER — `escapeLadder` with `onEscape` over it, the rungs in the
// order the spec gives them: a field being edited, the properties pop-over,
// the lens, and then, on the tabs a selection outlives, the selection
// itself. Three hundred lines.
//
// THE LADDER LISTENS ON THE WINDOW, above the app's own keymap and below
// nothing; `onEscape` is what the closure binds and unbinds, and a ladder
// that outlives its window swallows Escape for the rest of the session.
//
// WHAT IT READS, through `d`: the tab (`d.tab`), the host and its panel
// (`d.host`, `d.panel`), the selection (`d.sel`, `d.orgSel`, `d.keyOf`,
// `d.itemOf`), the lens (`d.orgLensOn`, `d.orgLensClear`), the properties
// pop-over and its edit guard (`d.orgProps`, `d.orgPropPopEl`,
// `d.orgPropPopClose`, `d.orgPropSubEl`, `d.orgPropSubClose`), the row
// doors (`d.openRow`, `d.orgFollow`, `d.orgFlagSet`, `d.markOf`,
// `d.orgNote`, `d.folderOf`, `d.exportScope`), the draw (`d.draw`,
// `d.drawPanel`), `d.typing` and `d.plugin`. The comments came with it, as
// they stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgKeysMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (17 of 25).
export interface OrgKeysDeps {
	plugin: WordSmith;
	readonly draw: () => void;
	readonly drawPanel: () => void;
	readonly exportScope: () => string;
	readonly folderOf: (path: string) => string;
	readonly host: WsHost;
	readonly itemOf: (key: string) => { kind: string; path: string; };
	readonly keyOf: (it: { kind: string; path: string }) => string;
	readonly markOf: (path: string | number, kind: string) => string;
	readonly openRow: (it: { kind: string; path: string; }, ev?: WsModEvent) => void;
	readonly orgFlagSet: (row: { path: string }, id: string, cell: HTMLElement | null) => Promise<void>;
	readonly orgFollow: (it: { kind: string; path: string; }, keepScope: boolean, markOnly: boolean) => void;
	readonly orgLensClear: () => void;
	readonly orgLensOn: () => boolean;
	readonly orgNote: string;
	readonly orgPropPopClose: () => void;
	readonly orgPropPopEl: () => HTMLElement;
	readonly orgPropSubClose: () => void;
	readonly orgPropSubEl: () => HTMLElement;
	readonly orgProps: ReturnType<typeof wsOrgPropsMake>;
	readonly orgSel: ReturnType<typeof wsOrgSelMake>;
	readonly panel: HTMLDivElement;
	readonly sel: ReturnType<typeof wsOrgSelMake>['sel'];
	readonly tab: string;
	readonly typing: (fromSearch: boolean) => boolean;
}

export const wsOrgKeysMake = (d: OrgKeysDeps) => {
const cursorItem = () => (d.orgSel.cursor ? d.itemOf(d.orgSel.cursor) : null);
// THE KEYS WALK THE TABLE (A267; writer 2026-09-09: "when i arrow in
// the organiser it changes the order of files"). They used to walk
// the window's own tree — folders included, so an arrow landing on a
// folder row CHANGED THE SCOPE, and with that tree hidden the table
// seemed to reshuffle by itself. Up and Down step through the note
// rows the table shows, marking the note (the scope is kept); Enter
// opens it; Alt+Up/Down nudge it within its folder through the one
// order writer. Left and Right, which folded the tree, are gone.
// THE TABLE'S ROWS WHERE THERE IS A TABLE; the scope's notes in the
// one order otherwise, so Export and History arrow through the same
// notes the Organizer would list (A267 — the tree that used to carry
// the arrows on those tabs is gone).
const tableOrder = () => {
	const drawn = Array.from<HTMLElement>(d.panel.querySelectorAll('tr.ws-org-row:not(.is-folder)[data-path]'))
		.map((r) => r.getAttribute('data-path')).filter(Boolean);
	if (drawn.length) return drawn;
	try { return d.plugin.exportGather(d.exportScope()).map((f) => f.path); }
	catch (e) { wsGuardReport('the Organizer listing the notes the arrows walk', e); return []; }
};
const moveCursor = (by: number) => {
	const order = tableOrder();
	if (!order.length) return;
	const here = d.orgSel.cursor ? (d.itemOf(d.orgSel.cursor) || {}).path : (d.orgNote || null);
	const at = here ? order.indexOf(here) : -1;
	const next = Math.max(0, Math.min(order.length - 1, at + by));
	const it = { kind: 'file', path: order[at === -1 ? 0 : next] };
	d.orgSel.cursor = d.keyOf(it);
	d.orgSel.cursorDrives = true;
	d.orgFollow(it, true, true);
	d.drawPanel();
	const el = d.panel.querySelector('tr.ws-org-row.ws-org-active');
	if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
};
const key = (combo: [Modifier[], string], fn: (() => void) | (() => Promise<void>), fromSearch?: boolean) => d.host.key(combo[0], combo[1], (ev: Event) => {
	if (d.typing(fromSearch)) return;
	void fn();
	ev.preventDefault();
	return false;
});
key([[], 'ArrowDown'], () => moveCursor(1), true);
key([[], 'ArrowUp'], () => moveCursor(-1), true);
const nudge = async (by: number) => {
	const it = cursorItem();
	if (!it || !it.path) return;
	const parent = d.folderOf(it.path);
	let sibs: string[] = [];
	try { sibs = d.plugin.treeOrderCurrent(parent) || []; } catch { sibs = []; }
	const at = sibs.indexOf(it.path);
	if (at === -1) return;
	const to = at + by;
	if (to < 0 || to >= sibs.length) return;
	const before = by < 0 ? sibs[to] : (sibs[to + 1] != null ? sibs[to + 1] : null);
	await d.plugin.treeOrderMove(parent, it.path, before);
	d.orgSel.cursor = d.keyOf(it);
	d.orgSel.cursorDrives = true;
	d.drawPanel();
};
key([['Alt'], 'ArrowUp'], () => { void nudge(-1); });
key([['Alt'], 'ArrowDown'], () => { void nudge(1); });
key([[], 'Enter'], () => { const it = cursorItem(); if (it) d.openRow(it); }, true);
// SPACE FLAGS THE ROW, the act this window exists for and the one
// worth a single key.
key([[], ' '], async () => {
	const it = cursorItem();
	if (!it) return;
	// ONLY FILES HAVE FLAGS (writer, 2026-08-22). This is the SECOND
	// place a flag is born and it never touches `fileMenuFor`, so the
	// menu's refusal does not reach it: a folder under the cursor and
	// one press of Space wrote `folderStatus` directly.
	//
	// Refused HERE and not in `cursorItem()`, which is shared with the
	// fold/unfold arrows and the Alt+arrow nudge — a folder must still
	// be reachable by the cursor, it just may not be flagged.
	if (it.kind !== 'file') return;
	const next = wsStatusNext(d.markOf(it.path, it.kind));
	// THROUGH THE ONE WRITER (A359): the journal sees it, the
	// selection gets it, and the store is written in one place.
	await d.orgFlagSet({ path: it.path }, next, null);
});
// ── ESCAPE BACKS OUT ONE STEP AT A TIME ─────────────────────────────
//
// Reported from a vault twice: pressing it left the window entirely,
// and it went on doing so after the first fix.
//
// TOMBSTONE: `modal.scope.register([], 'Escape', …)`. Obsidian's Modal
// registers its OWN Escape in its constructor, and `Scope` runs the
// first handler that matches — so a handler added afterwards never got
// a say. `stopPropagation` on the row being renamed does not help
// either: the app's keymap listens above this window, so the event has
// already been handled by the time it would bubble.
//
// A CAPTURE LISTENER is what runs before somebody else's handler —
// but WHERE it is bound decides how much of "before" it gets. See the
// tombstone further down: this was bound to the window's own
// container on the reasoning that a container is "the one place that
// runs first", and a container nested inside `document` is not.
//
// The ladder, in the order a writer would undo them. A writer pressing
// Escape almost never means "throw all of this away" — they mean "not
// that": not this rename, not this search, not this selection. Closing
// on the first press makes the key too expensive to use, so nobody
// uses it.
const escapeLadder = (ev: KeyboardEvent) => {
	if (ev.key !== 'Escape') return false;
	// ── A RENAME IN PROGRESS IS CANCELLED HERE ──────────────────
	//
	// TOMBSTONE: `if (renaming) return true;` — refuse the key and
	// leave the cancelling to the row's own keydown handler.
	//
	// THE TWO COULD NEVER BOTH RUN. This ladder is a CAPTURE
	// listener ABOVE the row, so returning true fires
	// `stopImmediatePropagation` on the way DOWN and the event
	// never reaches the name element at all. The rung defeated the
	// handler it was deferring to, and Escape mid-rename did
	// nothing — reported from a vault as the window leaving.
	//
	// `finish` is guarded by its own `settled` flag, so a build
	// where the event DOES reach the row runs it twice and the
	// second run returns immediately.
	// (The tree's rename rung went with the tree, A267.)
	// ── THE ORGANIZER'S OWN RUNGS (spec: Escape clears the lens) ──
	// Then, on a phone, it backs out of the right pane; then the
	// modal rule below applies as everywhere else.
	if (d.tab === 'organizer') {
		// A field being edited restores FIRST — the editor's own
		// Escape, held for this ladder, because the capture listener
		// reaches the key before the input ever would.
		if (d.orgProps.orgFieldEscape) {
			const f2 = d.orgProps.orgFieldEscape;
			d.orgProps.orgFieldEscape = null;
			try { f2(); } catch (_) { wsCatch('openManuscriptModal / escapeLadder: f2();', _); }
			return true;
		}
		// THE PROPERTIES PANEL CLOSES FIRST, because it is the topmost
		// thing on screen and Escape means the topmost thing. The panel
		// carries its own capture listener as well, for the case this
		// ladder refuses: it hangs on the body, so a keystroke typed
		// into its search box did not start inside `host` at all.
		if (d.orgPropPopEl()) { d.orgPropPopClose(); return true; }
		// (A RUNG WENT HERE with the free-text filter draft — see its
		// tombstone. Escape closed the draft box; there is no box.)
		if (d.orgLensOn()) { d.orgLensClear(); return true; }
		// The TREE search clears next (writer, 2026-08-22: the tree
		// searches now) — through the one writer, so the terms go
		// with the text.
		if (d.host.closes === false) return true;
		return false;
	}
	if (d.sel.size || d.orgSel.cursorDrives) {
		d.sel.clear();
		d.orgSel.lastPicked = null;
		// …and the cursor stops speaking for the window too. Escape
		// here means "never mind, show me everything", and clearing a
		// selection only to land on whichever row the cursor happened
		// to be resting against would be a different note's report
		// arriving unasked.
		d.orgSel.cursorDrives = false;
		d.draw();
		d.drawPanel();
		return true;
	}
	// ── NOTHING LEFT TO BACK OUT OF ─────────────────────────────
	//
	// In a MODAL the key is handed back and the window closes, which
	// is what Escape means everywhere else in the app.
	//
	// IN A PANE IT MEANS NOTHING. A docked Outliner sitting beside a
	// note must not vanish because the writer pressed Escape — they
	// are as likely to have meant it for the editor, and a pane that
	// closed itself would take a workspace arrangement with it. The
	// rungs above still apply: the search clears, the selection
	// clears, and then the key stops here.
	//
	// The HOST says which it is. A window does not know what it is
	// living in and should not have to ask.
	if (d.host.closes === false) return true;
	return false;
};
// ── AND IT LISTENS ON THE WINDOW, NOT ON THE CONTAINER ──────────────
//
// TOMBSTONE: `modal.containerEl.addEventListener(…, true)`, on the
// premise that "a capture listener on the window's own container is
// the one place that runs before anybody else's". THAT PREMISE WAS
// NEVER TESTED AND IT IS NOT TRUE. Capture runs from the TOP down, so
// any listener on `window` or `document` — which is where an app puts
// its global keymap — reaches the event BEFORE anything on a
// container nested inside them.
//
// `window` in the capture phase is the earliest point that exists.
// Nothing can precede it except another window-capture listener
// registered earlier, and this one is registered when the window
// opens rather than when the app boots.
//
// SCOPED TO THIS MODAL, two ways, because a global listener that is
// not scoped is a key stolen from the whole application:
//   · the event must have started INSIDE our container, so a confirm
//     dialog stacked on top of the Outliner keeps its own Escape —
//     its container is a sibling of ours, not a child;
//   · and it comes off in `onClose`, so a window that has been shut
//     is not still eating Escape for the rest of the session.
const onEscape = (ev: Event) => {
	// ASKED OF THE HOST, not of a modal. A leaf-backed host answers
	// the same question about its own element, and the ladder does
	// not have to learn a second shape to work in a pane.
	// ── AND THE PROPERTIES PANEL COUNTS AS INSIDE ───────────────
	//
	// The scope test exists so a dialog stacked on top keeps its own
	// Escape — its container is a SIBLING of ours, not a child. The
	// panel USED TO BE a sibling too, hanging on the body, so the test
	// said no to our own control, the ladder declined, and Escape in
	// the search box closed the WINDOW — measured 2026-08-28.
	//
	// A177 MOVED IT INSIDE `rootEl`, so `host.contains` now answers
	// yes on its own. THE NAMED TEST STAYS: `contains` is the host
	// seam's question, a leaf answers it about a different element
	// than a modal does, and a panel that has to be reachable by
	// Escape is not something to leave resting on which root a future
	// host picks. It is ours; it is named here either way.
	const pop0 = (d.tab === 'organizer') ? d.orgPropPopEl() : null;
	const sub0 = (d.tab === 'organizer') ? d.orgPropSubEl() : null;
	const hit = wsNodeOf(ev.target);
	if (!d.host.contains(hit)
		&& !(pop0 && pop0.contains(hit))
		&& !(sub0 && sub0.contains(hit))) return;
	if (!escapeLadder(ev as KeyboardEvent)) return;
	ev.preventDefault();
	ev.stopPropagation();
	// BOTH stops. `stopPropagation` holds the event inside this
	// container; `stopImmediatePropagation` also holds it back
	// from another listener on the container itself, which is what
	// a capture-phase guard is for.
	if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
};
// ── THE RENAME KEEPS THE WINDOW OPEN, WHOEVER HEARD THE KEY ─────────
//
// Reported from a vault three times: Escape during a rename closes the
// whole Outliner. The ladder below is still the right shape and still
// runs when it gets the chance — but it has lost the race twice, and a
// writer does not care which listener was first.
//
// So the window refuses. `close()` is the one door every route out
// goes through, whatever fired it, and while a name is being typed
// into, the answer is no — and the rename is cancelled on the way, so
// the press still does what a writer meant by it.
//
// ONE PRESS, ONE UNDO. The second Escape finds no rename running and
// the window closes normally, which is the ladder working as written.
//
// ── AND THE PROPERTIES PANEL IS THE SAME SHAPE (2026-08-28) ─────
//
// MEASURED IN THE VAULT: Escape typed into the panel's search box
// closed the panel AND THE WINDOW. Two fixes were tried first and
// both are the ones the comment above this already calls losers —
// a capture listener of the panel's own on `window`, then teaching
// the ladder's scope test that the panel counts as inside. The
// window still went. `blockClose` is what this codebase learnt to do
// about that: STOP RACING FOR THE EVENT AND GUARD THE EFFECT.
//
// TOPMOST FIRST, so the panel is answered before the rename — a
// panel open over a half-typed name is on top of it.
//
// THE × STILL CLOSES THE WINDOW IN ONE CLICK, and that is not luck:
// a press on it is a `mousedown` OUTSIDE the panel first, which the
// panel's own dismiss hears, so by the time `close()` runs there is
// no panel left to refuse for. Escape has no mousedown, which is
// exactly the case this rung is for.
if (d.host.blockClose) {
	d.host.blockClose(() => {
		// THE SUBMENU IS ABOVE THE PANEL (A179), so it backs out
		// first: a writer with a type list open who presses Escape
		// means the list, not the panel under it.
		if (d.tab === 'organizer' && d.orgPropSubEl()) {
			d.orgPropSubClose();
			return true;
		}
		if (d.tab === 'organizer' && d.orgPropPopEl()) {
			d.orgPropPopClose();
			return true;
		}
		// AND A FIELD BEING EDITED REFUSES THE CLOSE (A267). The
		// tree's rename held this rung and went with the tree; the
		// Organizer's own row rename took its place, and a goal cell
		// mid-edit is the same case — a window that throws away a
		// half-typed name on one keystroke is the reported bug with a
		// different editor in it. `orgFieldEscape` IS the editor's
		// cancel, held for exactly this.
		if (d.tab === 'organizer' && d.orgProps.orgFieldEscape) {
			const f2 = d.orgProps.orgFieldEscape;
			d.orgProps.orgFieldEscape = null;
			try { f2(); } catch (_) { wsCatch('openManuscriptModal / blockClose: f2();', _); }
			return true;
		}
		return false;
	});
}

// UNDO AND REDO KEYS (A350): Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y (Cmd on
// a Mac) while the pane has the key — not while a field inside it
// does, whose own undo is the browser's, and not from another pane.
	return { onEscape };
};
