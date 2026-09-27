// Word-Smith — organizer-sel: what is ticked, what the cursor is on, and
// what an edit spreads to.

import { Notice, Platform } from 'obsidian';
import { wsCatch } from '../core/preamble';
import type { WsSession } from '../core/preamble';
import type WordSmith from '../plugin/plugin';

// ════════════════════════════════════════════════════════════════════════
// THE SELECTION — what is ticked, what the cursor is on, and what an edit
// spreads to
// ════════════════════════════════════════════════════════════════════════
//
// The selection itself (`sel`, keyed `kind\0path` by `keyOf` / `itemOf`,
// `selRows`), the cursor the keyboard moves (`cursor`, `lastPicked`,
// `cursorDrives`), `spread` (an edit made on a row that is one of several
// ticked applies to all of them), and the bulk edit — `orgBulkOn`
// (desktop only), `orgBulkPaths`, `orgBulkSay`, `orgSelAnchor`,
// `orgSelClick` (plain, ctrl and shift), `orgSelHas`, `orgSelCount`.
//
// WHAT IT READS, through `d`: the session (`d.ses`, which remembers the
// cursor), the phone test (`d.orgNarrowNow`, because bulk edit is desktop
// only) and `d.plugin`.
//
// THREE `let`s ARE LIVE — `cursor`, `lastPicked`, `cursorDrives` — set by
// the arrows, the click and the draw all over the window, so they come
// back as getters and setters and the window reads them as
// `orgSel.<name>`.
// WHAT THE WINDOW LENDS THIS MODULE: the type of the object
// `openManuscriptModal` hands `wsOrgSelMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (2 of 3).
export interface OrgSelDeps {
	plugin: WordSmith;
	readonly orgNarrowNow: () => boolean;
	readonly ses: WsSession;
}

export const wsOrgSelMake = (d: OrgSelDeps) => {
// FIRST, because the cursor a hundred lines below reads it. Declared
// in the middle of the function first, next to the tab it also feeds,
// and the window would not open: `Cannot access 'ses' before
// initialization`, from a `const` in a closure this long.
const sel = new Map<string, { kind: string; path: string }>();
const keyOf = (it: { kind: string; path: string }) => it.kind + '\u0000' + it.path;
const itemOf = (key: string) => {
	const cut = key.indexOf('\u0000');
	return { kind: key.slice(0, cut), path: key.slice(cut + 1) };
};
const selRows = () => Array.from(sel.values());

// WHICH ROW THE KEYBOARD IS ON, kept separate from the selection: a
// writer arrowing down a manuscript is looking, not choosing, and
// moving the cursor must not throw away a selection they just made.
// It draws as a ring, so a row can be both at once.
let cursor: string | null = null;
// ── AND WHERE YOU WERE ────────────────────────────────────────
//
// TAKEN ONLY IF THE NOTE IS STILL THERE. A remembered cursor is a
// MEMORY, not an inventory — the vault moves while the window is shut,
// and a cursor on a note that has been deleted or renamed is a wrong
// answer where nobody asked a question. Dropped, not guessed: the
// window then opens with no cursor. A FOLDER KEY IS TAKEN ON THE SAME
// TERMS: `keyOf` carries the kind, and `getAbstractFileByPath` answers
// for a folder as readily as for a note, so one check covers both.
if (d.ses.cursor) {
	try {
		const was = itemOf(d.ses.cursor);
		if (was.path && d.plugin.app.vault.getAbstractFileByPath(was.path)) {
			cursor = d.ses.cursor;
		} else { d.ses.cursor = null; }
	} catch { d.ses.cursor = null; }
}
let lastPicked: null = null;
// WHETHER THE CURSOR HAS BEEN ASKED FOR. It is set the moment the
// window opens, onto the note the writer is in, because a tree that
// unfolds four levels and marks nothing leaves them hunting for
// where they are. That mark is "you are here", not a choice — so
// until an arrow is pressed or a row clicked, the inspector still
// answers for the whole vault, which is what makes the window useful
// before anything has been touched. One flag, because the alternative
// is a window whose first screen is a report on one scene when the
// decision was that an empty selection is the manuscript.
let cursorDrives = false;

// AN EDIT SPREADS TO WHAT IS SELECTED. Ctrl-click the scenes, then
// set the flag or type the target ONCE. There is no bulk row: five
// buttons for acts that already have a control on every row,
// appearing and disappearing under the writer's hands, is not wanted.
const spread = (it: { kind: string; path: string }) => {
	const k = keyOf(it);
	if (!sel.has(k) || sel.size < 2) return [it];
	return selRows();
};
// ── BULK EDIT, DESKTOP ONLY ──────────────────────────────────────
//
// Ctrl/Cmd-click toggles a note row, Shift-click takes the range from
// the last click over the rows shown, a plain click clears it (and
// shows the note), Escape clears it (the rung already there). And
// `spread` is asked at the three places a cell writes — the flag, the
// target, a property — so an edit made on a row that is IN a selection
// of two or more lands on every note in it. Files only: a folder in the
// range is skipped. DESKTOP ONLY: a phone has no modifier to click
// with, and `orgBulkOn` says no under a coarse pointer or a narrow
// pane, so the selection never fills there and nothing spreads.
const orgBulkOn = () => {
	try { if (Platform && Platform.isMobile) return false; } catch (_) { wsCatch('orgBulkOn: Platform.isMobile', _); }
	try { return !d.orgNarrowNow(); } catch { return true; }
};
// THE PATHS AN EDIT ON `row` LANDS ON: the row alone, or every note in
// a selection of two or more that holds it.
const orgBulkPaths = (row: { path: string; kind?: string } | null | undefined): string[] => {
	if (!row || !orgBulkOn()) return row && row.path ? [row.path] : [];
	return spread({ kind: row.kind || 'file', path: row.path })
		.filter(it => it.kind !== 'folder').map(it => it.path);
};
const orgBulkSay = (n: number, what: string) => {
	if (n < 2) return;
	try { new Notice('Word-Smith: ' + what + ' on ' + n + ' notes.'); } catch (_) { wsCatch('orgBulkSay: new Notice', _); }
};
// THE CLICK THAT SELECTS. `rows` is the list as shown, for the range.
let orgSelAnchor: string | null = null;
const orgSelClick = (ev: MouseEvent, row: { kind: string; path: string }, shownPaths: string[]) => {
	if (!orgBulkOn() || !ev || row.kind === 'folder') return false;
	const it = { kind: 'file', path: row.path };
	if (ev.shiftKey && orgSelAnchor) {
		const list = shownPaths || [];
		const a = list.indexOf(orgSelAnchor), b = list.indexOf(row.path);
		if (a !== -1 && b !== -1) {
			if (!(ev.ctrlKey || ev.metaKey)) sel.clear();
			for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
				const p = list[i];
				sel.set(keyOf({ kind: 'file', path: p }), { kind: 'file', path: p });
			}
			return true;
		}
	}
	if (ev.ctrlKey || ev.metaKey) {
		const k = keyOf(it);
		if (sel.has(k)) sel.delete(k); else sel.set(k, it);
		orgSelAnchor = row.path;
		return true;
	}
	// A PLAIN CLICK: the selection goes, the anchor moves.
	if (sel.size) sel.clear();
	orgSelAnchor = row.path;
	return false;
};
const orgSelHas = (path: string) => sel.has(keyOf({ kind: 'file', path }));
const orgSelCount = () => sel.size;
// WHAT THE INSPECTOR IS ABOUT. The selection when there is one, the
// cursor row when there is not, the vault when there is neither.
// Arrowing through an unchosen tree moves the inspector with it — but
// once rows are ctrl-clicked, arrowing leaves them alone, because a
// cursor that silently redefined a forty-scene selection would be an
// undo nobody asked for. The subject line says which of the two is
// being described, so it is never a guess.
//
// ── ONE SCOPE FOR THE WINDOW ─────────────────────────────────────
//
// The chosen folder — `orgFolder`, what a click in Obsidian's tree
// writes — is what all three tabs read; two scopes through one window
// is a writer clicking a folder and finding Export still on last week's
// part. "Several folders: select them in Obsidian's tree, right-click,
// Export these" — a list, or null.
	return { sel, keyOf, itemOf, selRows, orgBulkPaths, orgBulkSay, orgSelClick, orgSelHas, orgSelCount, get cursor() { return cursor; }, set cursor(v) { cursor = v; }, get lastPicked() { return lastPicked; }, set lastPicked(v) { lastPicked = v; }, get cursorDrives() { return cursorDrives; }, set cursorDrives(v) { cursorDrives = v; } };
};
