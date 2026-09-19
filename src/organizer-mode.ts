// Word-Smith — organizer-mode. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { setIcon } from 'obsidian';
import { wsCatch } from './preamble';
import type WordSmith from './plugin';
import type { WordSmithSettings } from './settings';

// ════════════════════════════════════════════════════════════════════════
// THE MODE — table or outline, which is a DRAWER and not a second view
// ════════════════════════════════════════════════════════════════════════
//
// THE TWENTY-FIRST PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-15,
// by `ws-dev/lift.js`): `orgMode`, `orgChevron` (the fold triangle a row
// wears) and `orgModeSet`, with the two probe doors `_orgMode` and
// `_orgModeSet`. A hundred and thirty-five lines, most of them the
// argument: the outline is the same rows, the same lens and the same
// grouping with ONE editable field under each note, so it is a drawer the
// rows open and never a second view with a second set of columns.
//
// WHAT IT READS, through `d`: the settings (`d.s`), the fold set
// (`d.orgOpen`, `d.orgOpenSet`), `d.drawPanel` and `d.plugin`. The
// comments came with it, as they stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgModeMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (1 of 5).
export interface OrgModeDeps {
	plugin: WordSmith;
	readonly drawPanel: () => void;
	readonly orgOpen: Set<string>;
	readonly orgOpenSet: (p: string, on: boolean) => void;
	readonly s: WordSmithSettings;
}

export const wsOrgModeMake = (d: OrgModeDeps) => {
// ── THE OUTLINE IS A DRAWER (Phase 4; writer, 2026-08-22) ───────────
//
// Same rows, same lens, same grouping — the outline is the table
// with ONE editable field under each note: one property, the same
// property view-wide, synopsis by default.
//
// TOMBSTONE: `orgView`, `orgViewSet` and the Table|Outline toggle
// in the strip. It was never a second VIEW — nothing about the
// table changed, a line appeared under each row — so a pair of
// tab-like buttons promised a bigger difference than it delivered
// and spent the strip's right end saying so. A disclosure is what
// this always was: ONE button in the bar, beside the other two
// lenses, and the rows stay put behind it.
//
// A NEW KEY, not a re-read of the old one: `organizerView` held a
// view NAME and this holds a drawer FLAG, which is the rule about
// a store that changes unit changing name. The old key is deleted
// on load with the other dead ones.
// ── TABLE OR OUTLINE, AND IT IS A MODE, NOT A TOGGLE ────────────
//
// The writer, 2026-08-23: "I want the button to show the
// properties, hide the table and become an outliner like
// scrivener." Asked how Scrivener does it, they chose Scrivener's
// own arrangement: a MODE PICKER IN THE WINDOW CHROME, not a
// toggle in the view's own bar and not a segmented pair inside the
// subject line.
//
// A MODE, BECAUSE THERE ARE STATES, NOT A STATE. Scrivener has
// three (Scrivenings, Corkboard, Outliner); this window has two so
// far. A toggle that lights up would be lying about how many ways
// there are to look at the same selection - which is the argument
// for the segmented control rather than a taste for one.
//
// NOT `organizerView`, which is DELETED four screens above: a key
// whose meaning changed must change name, and that one meant a
// TAB. This one means how the table draws.
// ALWAYS TABLE FOR A READER (2026-08-31). The store is coerced in
// `loadSettings` as well; this is the belt to that brace, so a
// window opened before a save still draws a pane that exists.
// The variable stays because fifteen call sites still ask it and
// they are cut in the next batches, not this one.
// (`orgMode`, the variable, went with the key on 2026-09-18.)
// ── THE CHEVRON, AND IT IS THE FILE TREE'S ──────────────────────
//
// Writer, 2026-08-25, with a shot circling them: "make the chevrons
// in the right pane be like the ones in the filetree."
//
// MEASURED FIRST. The table drew a SPAN holding the text `⌄` or
// `›` at 16x16 in `--text-faint` — rgb(102,102,102) live —
// while the tree beside it and Obsidian's own explorer both draw a
// `right-triangle` inside `tree-item-icon collapse-icon
// nav-folder-collapse-indicator` at rgb(179,179,179). Not a
// resemblance problem: a different glyph, a different size and a
// different colour.
//
// THE PLUGIN HAD ALREADY LEARNT THIS ONCE. `00-preamble.js` builds
// exactly this for the menu pane and its comment says why —
// "Obsidian's own triangle, in Obsidian's own wrapper class, so it
// is the same size and the same shape as the file tree's rather
// than a › that resembles one". The table was the pane that had
// not, so this is that builder, shared rather than copied.
//
// TWO VOCABULARIES ON ONE ELEMENT, and both are load-bearing.
// `is-collapsed` is the app's word and what its own rule ROTATES
// on — wear the class, ask for nothing, and a theme restyles this
// for free. `is-open` is ours and seven assertions plus the fold
// handler read it. They are written together here, in one place, so
// they cannot drift into disagreeing about which way a folder is.
//
// `setIcon` FAILS SILENTLY on a name this build's Lucide does not
// have, so the result is CHECKED and the old text glyph is the
// fallback — a chevron that draws nothing at all would be worse
// than the one being replaced.
const orgChevron = (into: HTMLElement, open: boolean) => {
	const el = into.createSpan({
		cls: 'ws-org-twist tree-item-icon collapse-icon'
			+ ' nav-folder-collapse-indicator'
			+ (open ? ' is-open' : ' is-collapsed')
	});
	try { if (setIcon) setIcon(el, 'right-triangle'); } catch (_) { wsCatch('openManuscriptModal / orgChevron: if (setIcon) setIcon(el, \'right-triangle\');', _); }
	if (!el.childElementCount) el.setText(open ? '⌄' : '›');
	return el;
};
// THE MODE IS GONE (the writer, 2026-09-18: "delete it" — Outline went at
// A26, and `organizerMode` was written and never read since). What stays is
// the one thing the probes reached through the mode's door: a redraw of the
// panel. `_orgRedraw` says what it is.
d.plugin._orgRedraw = () => d.drawPanel();

// ── AND THE READINGS ON THE TITLE LINE ARE CHOSEN TOO ──────
//
// Writer, 2026-08-29: "add checkboxes in outline view for flag,
// grade, words, target, tasks all of them too but they will be
// displayed in the row just like the word count (so i can hide or
// view them)." The ▤ column was DEAD for every built-in reading
// and its tooltip said why — "Outline shows frontmatter properties"
// — which was true of the CARD and never of the note’s own line,
// where three readings and a flag have been drawn since 2026-08-28
// with no door onto which.
//
// A SECOND STORE, NOT A SECOND UNIT IN THE FIRST. FACTS: "a store
// that changes UNIT changes NAME". `organizerOutlineProps` holds
// FRONTMATTER KEYS; these are COLUMN IDS. Putting `mark` in beside
// `synopsis` would leave every reader of that array guessing which
// kind each entry was, and `orgFieldRow` would try to read a
// property called "mark" off the note.
//
// NOT DEFAULTED, AND 381 IS WHY. `loadSettings` is
// `Object.assign({}, DEFAULT_SETTINGS, raw)`, so a key with a
// default is NEVER absent — and a writer who switched every reading
// off would be indistinguishable from one who had never opened the
// panel. `undefined` means "the set this had before it had a door";
// `[]` means none, and it has to be able to mean that.
// AND ONE ONTO WHAT IS OPEN. `orgOpen` is a Set built from the store
// when the window opens — a SNAPSHOT — so writing
// `settings.organizerOpen` from outside changes the store and nothing
// else until the next open. A probe that did that and redrew got the
// same closed rows back and blamed the builder.
d.plugin._orgOpenSet = (p, on) => d.orgOpenSet(p, !!on);
d.plugin._orgOpen = () => Array.from(d.orgOpen);

// ── LIFTED INTO 03-organizer-widths.js (2026-09-14) ──
// The block that stood here reads this closure through the names below
// and nothing else; the aliases keep the names the closure calls.
	return { orgChevron };
};
