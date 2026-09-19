// Word-Smith — organizer-readings. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { TFile } from 'obsidian';

import { wsCatch, wsListOf, wsStr, wsTaskSay, wsTasksOf } from './preamble';
import type WordSmith from './plugin';

// ════════════════════════════════════════════════════════════════════════
// THE READINGS — what a column says for a row, and what a folder adds up
// ════════════════════════════════════════════════════════════════════════
//
// THE FIFTH PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-14, by
// `ws-dev/lift.js`): `orgColRaw` (a column's raw value for a path — the
// readings by id, then the frontmatter), `orgColText` (the same, as the
// cell shows it), `orgFolderIcon`, the aggregate table `ORG_AGG` with
// `orgAggHow` and `orgColAgg` (what a folder row and the Total row say per
// column), and `orgColSortKey` (what a column sorts by). Seven hundred
// lines that every draw and every sort read.
//
// WHAT IT READS, through `d`: `d.markOf` (a row's flag), `d.nameOf`,
// `d.orgBackMap` / `d.orgOutLinks` (the link readings), the pending-value
// overlay (`d.orgPendGet`, `d.orgPendSame`, `d.orgPendDrop`), `d.targetOf`,
// and `d.plugin` for the index and the flag definitions. The comments on
// each function came with it, as it stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgReadingsMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (8 of 9).
// What a column says of a folder: the text, a tooltip, and for the flags
// column the flags counted under it.
export interface WsOrgColAgg { text: string; title?: string; flags?: { id: string; n: number; label: string }[] }
export interface OrgReadingsDeps {
	plugin: WordSmith;
	readonly markOf: (path: string | number, kind: string) => string;
	readonly nameOf: (path: string) => string;
	readonly orgBackMap: () => Map<string, string[]>;
	readonly orgOutLinks: (path: string) => ({ path: string; text?: undefined; } | { text: string; path?: undefined; })[];
	readonly orgPendDrop: (path: string, key: string) => void;
	readonly orgPendGet: (path: string, key: string) => { v: unknown; at: number } | null;
	readonly orgPendSame: (a: unknown, b: unknown) => boolean;
	readonly targetOf: (path: string | number) => number;
}

export const wsOrgReadingsMake = (d: OrgReadingsDeps) => {
const orgColRaw = (col: { id: string; key?: string }, path: string): unknown => {
	const r = d.plugin._orgIndex && d.plugin._orgIndex.get(path);
	switch (col.id) {
		case 'words': return r ? r.words : null;
		case 'paras': return r ? r.paras : null;
		// ── HOW LONG IT TAKES TO READ ────────────────────────
		//
		// WORDS, RAW — the quantity, not the reading of it. Three
		// things fall out of that and none of them needs a special
		// case: the column sorts by length (which is the same order
		// as by duration, the one being a constant times the other),
		// a folder SUMS words the way the Words column does, and the
		// duration is said in exactly one place — `formatReadTime`,
		// which the Powerline bar and the report already use.
		//
		// IT IS THE WORDS COLUMN IN ANOTHER UNIT, and that is a fair
		// objection — the `left` column was retired in 2026-08-23 for
		// being arithmetic on readings already on screen. The
		// difference is exactly the unit: minutes answer a question
		// words cannot ("can I read this before the meeting"), and the
		// writer asked for it in those terms. `left` answered the same
		// question as its two parents in the same unit.
		case 'read': return r ? r.words : null;
		// ── WHAT KIND OF FILE IT IS ──────────────────────────
		//
		// FROM THE PATH, not from the index: the index is a reading
		// of a note's CONTENTS and it holds nothing for a .xlsx —
		// which is exactly the kind of file this column exists to
		// name. A row that the sweep has not reached still knows
		// what it is called.
		//
		// LOWER CASE, AND NO DOT, in the writer's own words: "like
		// xlsx, md , docx , etc". A file with no extension gets
		// null rather than an empty string, so the hide-empties
		// rule treats it as missing rather than as a value.
		// AN ARRAY OF PATHS, so the folder aggregate counts DISTINCT
		// notes beneath it the way the Tags column does — a list
		// counts its values, a scalar counts its notes, and this is a
		// list. Null when nothing points here, so the hide-empties
		// rule treats it as missing rather than as an empty answer.
		case 'backlinks': {
			const list = d.orgBackMap().get(String(path || ''));
			return (list && list.length) ? list : null;
		}
		case 'outlinks': {
			// THE CORE PANE'S TWO LISTS (A375): resolved links by
			// their paths, unresolved by the text written.
			const list = d.orgOutLinks(String(path || ''));
			return (list && list.length) ? list : null;
		}
		case 'footnotes': return r && typeof r.footnotes === 'number' ? r.footnotes : null;
		case 'ftype': {
			const m = /\.([A-Za-z0-9]+)$/.exec(String(path || ''));
			return m ? m[1].toLowerCase() : null;
		}
		// TOMBSTONE: the Links column (writer, 2026-09-02).
		//
		// "remove the links column or should we show it? right now it
		// only shows the count... let's discuss this" — and after the
		// discussion, "just cut the links for now."
		//
		// THEIR OBJECTION WAS THE RIGHT ONE and it is worth keeping
		// rather than just the verdict: a bare count is the least
		// useful thing a link can tell you. It read `resolvedLinks`,
		// counted DISTINCT destinations excluding the note itself, and
		// returned null rather than 0 so an unlinked note stayed blank.
		// All of that was right about a number nobody wanted.
		//
		// BACKLINKS STAYS EXACTLY AS IT IS. I offered the two as one
		// decision, calling Backlinks its twin; the writer SPLIT THEM —
		// "i want the backlinks as is" — and that is the answer that
		// counts. A column that says who points AT you is a different
		// question from one that says who you point at.
		// THE TWO CHARACTER COUNTS AND THE SENTENCE COUNT come
		// straight off the index, which now carries what
		// `analyzeText` was already measuring for every note.
		// Zero is null for the same reason it is above: an empty
		// note has nothing to report, not a nought to report.
		case 'chars': return (r && r.charsNoSpaces) ? r.charsNoSpaces : null;
		case 'charsall': return (r && r.charsWithSpaces) ? r.charsWithSpaces : null;
		case 'sentences': return (r && r.sentences) ? r.sentences : null;
		case 'grade': return (r && r.grade !== null) ? r.grade : null;
		// ── AND A FILE HAS THESE WHATEVER ITS EXTENSION (A127) ──────
		//
		// Writer, 2026-09-04: "last modified and created are not
		// displayed for non-md files". Both read the ORG INDEX, which
		// is built from `getMarkdownFiles` — so a PDF has no row and
		// both answered null.
		//
		// THE ANSWER WAS ALREADY IN THE VAULT, which is what makes this
		// one line rather than a store: a TFile carries `stat.mtime`
		// and `stat.ctime` for every extension, and the index copies
		// them from exactly there — `orgIndexRead` reads
		// `f.stat.mtime` into the row. So this is not a second source
		// of one fact; it is the SAME source, asked directly when the
		// copy does not exist.
		case 'modified': case 'created': {
			const want = col.id === 'modified' ? 'mtime' : 'ctime';
			if (r && r[want]) return r[want];
			try {
				const f2 = d.plugin.app.vault.getAbstractFileByPath(String(path || ''));
				if (f2 instanceof TFile && f2.stat && f2.stat[want]) return f2.stat[want];
			} catch (_) { wsCatch('openManuscriptModal / orgColRaw: const f2 = this.app.vault.getAbstractFileByPath(String(path || \'\'));', _); }
			return null;
		}
		case 'tasks': return (r && r.tasks) ? r.tasks : null;
		case 'goal': {
			const t = d.targetOf(path);
			return t > 0 ? t : null;
		}
		case 'mark': return d.markOf(path, 'file') || null;
		case 'tags': {
			const tg = d.plugin.tagsOf(path);
			return (tg && tg.length) ? tg : null;
		}
		default: {
			const key = d.plugin.propColKey(col.id);
			if (!key) return null;
			// A NOTE ANSWERS FROM THE INDEX, which holds the frontmatter
			// Obsidian parsed — unchanged, and still the only answer for
			// a `.md`.
			// WORKED OUT, NOT RETURNED, so the overlay below has something
			// to agree WITH. This branch used to return from inside the
			// loop; the readings are identical.
			let real = null;
			let fromIndex = false;
			if (r && r.props) {
				fromIndex = true;
				for (const k of Object.keys(r.props)) {
					if (k.toLowerCase() !== key.toLowerCase()) continue;
					const v = r.props[k];
					real = (v === null || v === undefined || v === '') ? null : v;
					break;
				}
			}
			// ── AND A FILE THAT CANNOT HOLD ONE ANSWERS FROM THE STORE ──
			//
			// A80: the org index is built from `getMarkdownFiles` and every
			// row in it comes from a `cachedRead`, so a PDF has NO index row
			// at all — `r` is undefined here, which is why this used to
			// return null before it read anything.
			//
			// NOT FIXED BY INDEXING THEM. The index is a reading of a
			// note's CONTENTS; putting a .pdf in it would mean reading a
			// binary to learn nothing. The second reader belongs here,
			// where the column already asks the question.
			if (!fromIndex) {
				const sv = d.plugin.propStoreGetSync(path, key);
				real = (sv === null || sv === undefined || sv === '') ? null : sv;
			}
			// ── AND WHAT WAS JUST TYPED WINS UNTIL THAT CATCHES UP (A212) ─
			const pend = d.orgPendGet(path, key);
			if (!pend) return real;
			const want = (pend.v === null || pend.v === undefined
				|| pend.v === '') ? null : pend.v;
			// AGREED — so the overlay has done its job and must go, or a
			// change made in the note itself would be masked by what was
			// typed here.
			if (d.orgPendSame(real, want)) { d.orgPendDrop(path, key); return real; }
			return want;
		}
	}
};
// TOMBSTONE: `orgReadSay`, three shapes for a duration, written and
// deleted within the hour. `formatReadTime` in 60-bar-rendering has
// done this since before 1.3.9 and has two callers already; a third
// wording of the same estimate is how one note ends up taking three
// minutes on a bar and four in a table.
const orgColText = (col: { id: string; key?: string }, path: string): string => {
	const v = orgColRaw(col, path);
	if (v === null) return '';
	switch (col.id) {
		// EVERY COUNT IS GROUPED, and this list is the whole reason the
		// four new columns join it rather than falling through to String(v).
		// Measured in the vault before this line changed: a file row read
		// 12309 while the folder row above it read 75,947 — the aggregate
		// path groups and the cell path did not, so one column printed a
		// number two ways depending on which kind of row it was in.
		case 'words': case 'paras':
		case 'chars': case 'charsall': case 'sentences':
			return Number(v).toLocaleString();
		// A TYPE IS ALREADY THE WORD IT SHOWS.
		case 'ftype': return wsStr(v);
		// THE NAMES, not the paths: a column of "Book/Part One/Ch 01.md"
		// is a column of one repeated prefix. The cell builder draws
		// these as pressable spans; this text is what a hover and a
		// folder row read, and what a filter matches against.
		case 'backlinks':
			return wsListOf(v).map((x) => String(d.nameOf(wsStr(x)))).join(', ');
		case 'outlinks':
			return wsListOf(v).map((x) => { const o = (x && typeof x === 'object') ? x as { path?: string; text?: string } : null; return o && o.path ? d.nameOf(o.path) : wsStr(o && o.text || x); }).join(', ');
		case 'footnotes': return Number(v).toLocaleString();
		// THE PLUGIN'S ONE READING OF A DURATION, shared with the
		// Powerline bar and the report. `v` is the note's words.
		case 'read': return d.plugin.formatReadTime(Number(v) || 0);
		// THE TARGET SAYS HOW FAR ALONG IT IS, not just what it is —
		// see `orgTargetSay`, which is the one writer of that.
		case 'goal':
			return d.plugin.orgTargetSay(Number(orgColRaw({ id: 'words' }, path)) || 0, Number(v) || 0);
		case 'grade': return (Math.round(Number(v) * 10) / 10).toFixed(1);
		// ONE FIXED STAMP, dd/mm/yyyy hh:mm (writer, 2026-08-22).
		// REVERSES pair 268b, which asked for the app locale here;
		// the tombstone carrying 268b's reasoning is on `orgStamp`
		// in src/38-org-index.js, which is now the only place this
		// plugin turns a file time into a column string — the cell
		// and BOTH group aggregates call it.
		case 'modified': case 'created':
			return d.plugin.orgStamp(Number(v) || 0);
		// SQUARE BRACKETS (writer, 2026-08-22). A bare `2/13` reads
		// as another measurement of the same kind as Words and
		// Left, and it is not a quantity of writing at all — it is
		// a count of boxes. The grammar already existed in two
		// other places (the goals list and the file-tree badge);
		// this column was the odd one out.
		//
		// THE GROUP AGGREGATE WEARS THEM TOO (orgColAgg, 'tasks').
		// Change one without the other and a folder's total reads
		// in a different notation from the rows it totals.
		case 'tasks': { const t = wsTasksOf(v); return t ? wsTaskSay(t.done, t.all) : ''; }
		case 'mark': {
			const def = d.plugin.flagDefs().filter(f => f.id === v)[0];
			return def ? def.label : wsStr(v);
		}
		case 'tags': return wsListOf(v).map(wsStr).join(', ');
		// ── A USER PROPERTY GOES THROUGH THE ONE FORMATTER ────────
		//
		// TOMBSTONE: this branch did its own `String(v)`, its own
		// `join(', ')` and its own yes/no. That `String(v)` is writer
		// number one of the three the 2026-08-27 brief names — it is
		// why a date read `1999-01-22` here and `22/01/1999` in the
		// Outline. See `formatValue` in src/38-org-index.js.
		//
		// THE TYPE IS LOOKED UP HERE and passed in, so the formatter
		// stays pure and never becomes a second reader of the registry.
		default: {
			// BY THE KEY, NOT THE ID. A user column's `id` is `fm:<key>`;
			// asking `orgPropType` for the id misses every time and drops
			// the column to text — which is how the Table went on printing
			// a raw ISO date after 361 was supposed to have ended that.
			// Found in the vault: `fm:date` read `1999-01-22` while the
			// Outline beside it read `22 Jan 1999`.
			const pk = col.key || col.id;
			return d.plugin.formatValue(pk, v, d.plugin.orgPropType(pk),
				d.plugin.dateStyle()).text;
		}
	}
};
// ── THE KIND GLYPHS, ONE BUILDER (writer, 2026-08-22) ──────────────
//
// "Icons in the TABLE view rows too — folder / note / file kinds,
// like the tree (honoring the icon-style dropdown)." LIKE the tree
// means BY the tree's own code: two copies would drift the day one
// of them learnt a new kind, which is the fault this file records
// twice already (the menu that gained a row its twin had not, the
// flag that stayed grey for a release).
//
// `organizerIcons`: 'obsidian' (lucide, default) · 'drawn'
// (Word-Smith's own folder glyph — folders only, so a note carries
// none there) · 'none'. A NON-NOTE keeps its kind glyph under both
// styles, because "this is an image" is information, not
// decoration.
//
// TRIED IN ORDER AND CHECKED, always: `setIcon` on a name this
// build's Lucide does not know leaves the element empty instead of
// throwing — how the export icon went missing for a release.
// TOMBSTONE: `orgIconStyle` AND THE WHOLE STYLE CHOICE (346).
//
// `const orgIconStyle = () => String(s.organizerIcons || 'obsidian');`
// stood here, and three values hung off it: `drawn` (this plugin's
// own hand-drawn glyphs), `none` (no icons at all) and the default.
// Writer, 2026-08-26: "remove icons options (we keep only one set of
// icons those that match obsidian owns, so no solid colored folder
// icons)."
//
// WHAT WENT WITH IT, said out loud because it is a capability and not
// only a look: `none` was THE ONLY WAY to turn the Manuscript
// window's icons off. The `fileTree*` switches govern Obsidian's
// explorer and nothing else. That window always shows icons now.
//
// AND `wsFolderSvg` DID NOT GO. It looks like the `drawn` glyph and
// it was one, but it is also the fallback below when `setIcon` draws
// nothing — which it does silently, on a name this build's Lucide
// does not have. Deleting it with the branch would have been the
// tidy-looking change that takes every folder icon out of the file
// explorer as well.
//
// `orgFolderIcon` IS A CLASS METHOD NOW — see below the closure.

// (The folder builder moved to `this.orgFolderIcon`; this alias keeps
// the ~dozen call sites in this 6,500-line method reading the way
// they always have.)
const orgFolderIcon = (into: HTMLElement, path: string, open: boolean) =>
	d.plugin.orgFolderIcon(into, path, open);
// TOMBSTONE: `orgKindIcon` WAS A CLOSURE LOCAL HERE (2026-08-25).
//
// It is `this.orgKindIcon` now, a class method — unmoved in every
// other respect, and both call sites in this file go through it.
//
// WHY IT MOVED: the writer asked for these same glyphs in
// Obsidian's own file explorer, which `src/80-sidebar-counts.js`
// paints. Nothing outside `openManuscriptModal` could reach a
// 6,500-line closure, so the explorer would have had to carry a
// COPY of the kind rules - a second writer of the glyph, which is
// the fault this window keeps deleting. FACTS already says
// `orgKindIcon` is called from both the tree and the table; it is
// now callable from a third place without being written twice.
//
// IT READS `organizerIcons` ITSELF rather than taking a style, so
// no caller has to know the setting exists. (The style it read was
// retired at 346; the sentence is kept because the SHAPE is the
// point — a drawing helper reads what it needs rather than being
// handed it.)
// ── WHAT A GROUP ROW SAYS, PER COLUMN (writer, 2026-08-22) ─────────
//
// "group rows grow AGGREGATES per column… make sensible per-column
// calls and say them." The calls, said out loud:
//
//   words · paras · left · today   SUM      — quantities of writing
//   goal (Target)                  SUM      — see the note below
//   tasks                          SUM done/all, as the cells write it
//   grade                          AVERAGE  — an index, not a quantity
//   modified                       NEWEST   — the same rule the index
//                                  already uses for a folder's mtime
//   created                        OLDEST   — when this group was
//                                  STARTED; newest would just repeat
//                                  whichever note was added last
//   flag                           NOTHING  — see below
//   tags & property columns        COUNT of distinct values, the
//                                  values themselves on hover
//
// TARGET IS SUMMED, NOT AVERAGED, and this departs from the ask on
// purpose: Words sits beside Target, and a summed 12,000 next to an
// averaged 800 reads as "12,000 of 800". Two adjacent numbers that
// invite a comparison they cannot survive is the fault this window
// keeps deleting. Summed, the pair answers the question the columns
// are for — how much of this group is written. Say the word and it
// becomes an average in one line.
//
// A FLAG AGGREGATES TO NOTHING. It is a state per scene: summing is
// meaningless, averaging worse, and "the commonest" would invent a
// fact the rows do not support. An empty cell says "ask the rows",
// which is true.
//
// OVER THE ROWS AS SHOWN, not over the folder. A lens that hides
// half the scenes must not leave a header claiming their words: the
// number a writer can check by adding up what is in front of them
// is the only one that can be trusted. Same reader as the cells
// (`orgColRaw`), so a total and its rows can never disagree.
const ORG_AGG: Record<string, string> = {
	words: 'sum', paras: 'sum', goal: 'sum',
	today: 'sum', grade: 'avg', modified: 'newest',
	// A COUNT PER FLAG (A321, writer 2026-09-12: “for folder aggregates
	// for flags i want a number and icon, so for more files carrying
	// multiple flags just display 2flag1icon 3flag2icon and so on”).
	// `none` stood here: a folder’s Flag cell was empty. Now it says how
	// many files beneath carry each flag, in the flags’ own order.
	created: 'oldest', tasks: 'tasks', mark: 'flags',
	// ── THE TWO NEW READINGS, NAMED RATHER THAN LEFT TO FALL ──
	//
	// The default is `count`, which answers "how many notes beneath
	// this carry a value". Measured with both columns left to fall
	// through: a folder read `3` in its Read time column — a count
	// of notes printed under a heading that says minutes.
	//
	// `read: sum` IS THE ONLY SELF-CONSISTENT CHOICE. Read time is
	// the Words column divided by a constant, and Words sums; a
	// folder saying 12,000 words and 3 minutes disagrees with
	// itself. Summing agrees with it by construction.
	//
	// `ftype: none` BECAUSE A FOLDER IS NOT A FILE. It has no kind,
	// and the default would have printed the note count in a column
	// of words like "md" and "xlsx" — a number that reads as a type.
	// `mark: none` is the same argument about flags.
	read: 'sum', ftype: 'none', footnotes: 'sum', outlinks: 'none',
	// ── AND THE FOUR ADDED AT 485fj ───────────────────────────
	//
	// All four SUM, and each for the reason `read` sums rather than
	// by default: the default is `count`, which answers "how many
	// notes beneath this carry a value" and would print a note count
	// under a heading that says Sentences.
	//
	// A folder's characters are its notes' characters added up; so
	// are its sentences; so are the links leaving it. None of the
	// four is an average or a newest — they are all sizes, and sizes
	// add.
	chars: 'sum', charsall: 'sum', sentences: 'sum'
};
// ── A DATE COLUMN COUNTS, IT DOES NOT LIST (writer, 2026-08-28) ──
//
// "aggregate better some things like dates should only show a count
// number, or proprieties that are text (think on it, so it makes
// sense)."
//
// `ORG_AGG` names the BUILT-INS, so a user property fell through to
// `distinct` whatever it held — and a folder row in the writer's own
// vault read `1999-01-22, 2222-02-21` in its date column: two notes'
// values printed side by side as if the FOLDER had two dates. A
// folder does not have a date. What it has is some notes that do.
//
// THE TEXT HALF IS DELIBERATELY NOT CHANGED, and this is where that
// is written down. Three days ago the same writer asked for exactly
// the enumeration a text column now shows — brief A2, "a folder's
// property cell lists every DISTINCT value beneath it — 'the Father,
// The Mother, Mara'" — and the tombstone below records what it
// replaced and why. "or proprieties that are text (think on it)" is
// an invitation to think, not an instruction; reversing a three-day-
// old ask on half a sentence is how this project has thrown away
// eight builds. The question is logged in INBOX for one word.
//
// BY TYPE, NOT BY NAME. `orgPropType` is the one reader of what a
// key holds, so a column the writer later declares a date starts
// counting without anyone remembering to list it here.
// ── A FOLDER SUMS WHAT IT CAN AND COUNTS EVERYTHING ELSE ────────
//
// "aggregate better some things like dates should only show a count
// number, or proprieties that are text (think on it, so it makes
// sense)" — and then, asked whether the short text columns should
// count as well: **"yes count them too"** (2026-08-29).
//
// SO THERE IS ONE RULE AND NO EXCEPTIONS. `ORG_AGG` names what a
// folder can honestly SUM, AVERAGE or take the newest of; everything
// else is counted. A folder does not have a date, a synopsis, a pov
// or a tag — what it has is some notes that do, which is a number.
//
// TOMBSTONE 1 (386): a `date`/`datetime` branch and an `isLongField`
// branch, added when only those two counted. They are not reversed,
// they are SUBSUMED — the fallthrough answers for them now, and two
// branches that can only agree with the default are a place for the
// two to drift apart.
//
// TOMBSTONE 2 (361, brief A2): `distinct`, which listed every value
// beneath a folder — "the Father, The Mother, Mara", truncated to two
// plus "+N" with the rest on the hover. That was this writer's own
// ask and it is this writer's own reversal, four days apart. THE
// VALUES ARE NOT LOST: they are still gathered, and they are still on
// the hover, which is where the enumeration went rather than away.
//
// AND IT TAKES THE BUILT-IN Tags COLUMN WITH IT, which was not named
// in the ask and is named here because it is the visible consequence:
// `tags` is not in `ORG_AGG`, so a folder's Tags cell read "maka
// baka, taka +1" and now reads a number. Leaving it enumerating would
// have put `Pov 3` beside `Tags maka baka, taka +1` in one row — two
// grammars for one question. One word puts it back.
// ── AND A CHECKBOX COUNTS THE TICKS (A132) ──────────────────────────
//
// Writer, 2026-09-04: "folder agregates of the checkboxes are not
// updateing or display corectly (no ticks - 3 shown)". MEASURED: the
// default `count` answers "how many beneath this CARRY a value", and
// `archived: false` carries one — so three unticked notes read as 3.
//
// A TICK IS NOT A VALUE, it is a state, and the number a writer reads
// off a folder is "how many are done". False is an answer to the
// question and it is not a tick.
const orgAggHow = (col: { id: string; user?: boolean; key?: string }) => {
	if (ORG_AGG[col.id]) return ORG_AGG[col.id];
	try {
		if (col.user && String(d.plugin.orgPropType(col.key || col.id))
			.toLowerCase() === 'checkbox') return 'ticked';
	} catch (_) { wsCatch('openManuscriptModal / orgAggHow: if (col.user && String(this.orgPropType(col.key || col.id))', _); }
	return 'count';
};
const orgColAgg = (col: { id: string; user?: boolean; key?: string }, paths: string[]): WsOrgColAgg => {
	const how = orgAggHow(col);
	if (how === 'none') return null;
	let sum = 0, n = 0, newest = 0, oldest = 0, done = 0, all = 0;
	// A GRADE IS WEIGHTED BY WORDS — see the 'avg' case. `wsum` is the
	// total weight and `wtot` the weighted total; both stay 0 for every
	// other aggregation and cost nothing.
	let wsum = 0, wtot = 0;
	// THE TARGET'S OWN NUMERATOR (the writer, 2026-09-20: "the total for
	// target, including for folder aggregates should show xxx/xxx"): the
	// words of the notes whose targets are being summed, so a folder's cell
	// reads its progress the way a note's does — words over target — and a
	// note with no target is in neither number.
	let wg = 0;
	// WHETHER THIS COLUMN HOLDS LISTS, learnt from the values rather
	// than from a table of column names. A hand-kept list of 'the
	// list-ish properties' forgets the next one somebody adds — the
	// same fault as a hand-typed menu list, which this project has
	// paid for more than once. `tags` is the only one in the
	// reporting vault today; `Characters` and `aliases` are declared
	// columns that would join it the day they hold a list.
	let listy = false;
	const seen = new Map<string, unknown>();
	for (const p of (paths || [])) {
		const v = orgColRaw(col, p);
		if (v === null || v === undefined) continue;
		if (how === 'tasks') { const t = wsTasksOf(v); if (t) { done += t.done; all += t.all; } n++; continue; }
		// ONLY A REAL TRUE COUNTS. A string "true" out of a hand-edited
		// store is not a ticked box, and neither is `false`.
		// x/x: `n` counts what CARRIES the key and `done` what is
		// TICKED — the writer asked for both numbers, and since A145
		// the difference is visible in the rows themselves, where an
		// absent property draws nothing and a false one draws a box.
		if (how === 'ticked') { n++; if (v === true) done++; continue; }
		if (how === 'flags') {
			const k = wsStr(v);
			seen.set(k, (Number(seen.get(k)) || 0) + 1); n++; continue;
		}
		// `dated` COLLECTS WHAT `distinct` COLLECTS and writes something
		// else with it: the count goes in the cell, the days on the
		// hover. One walk, two readings.
		if (how === 'count') {
			const take = (x: unknown) => {
				if (x === null || x === undefined) return;
				if (Array.isArray(x)) { listy = true; x.forEach(take); return; }
				if (typeof x === 'object') return;
				const s2 = wsStr(x).trim();
				if (s2 && !seen.has(s2)) seen.set(s2, x);
			};
			take(v); n++; continue;
		}
		const num = Number(v);
		if (!isFinite(num)) continue;
		n++;
		if (how === 'newest') { if (num > newest) newest = num; continue; }
		if (how === 'oldest') { if (!oldest || num < oldest) oldest = num; continue; }
		if (how === 'avg') {
			// THE NOTE'S OWN LENGTH, from the same reading the Words
			// column shows, so a weighted grade and a word count cannot
			// disagree about how long a scene is.
			let w = 0;
			try { w = Number(orgColRaw({ id: 'words' }, p)) || 0; } catch { w = 0; }
			if (w > 0) { wsum += w; wtot += num * w; }
		}
		if (col.id === 'goal') {
			let w = 0;
			try { w = Number(orgColRaw({ id: 'words' }, p)) || 0; } catch { w = 0; }
			wg += w;
		}
		sum += num;
	}
	if (!n) return null;
	if (how === 'flags') {
		// IN THE FLAGS’ OWN ORDER, not the order the files came in: the
		// same reading under every folder. A flag no definition names
		// (a stale id) still counts, after the named ones.
		const defs = d.plugin.flagDefs();
		const ids = defs.map(f => f.id).filter(id => seen.has(id))
			.concat(Array.from(seen.keys()).filter(id => !defs.some(f => f.id === id)));
		const flags = ids.map(id => {
			const def = defs.filter(f => f.id === id)[0];
			return { id, n: Number(seen.get(id)) || 0, label: def ? def.label : id };
		});
		return {
			flags,
			text: flags.map(f => f.n + ' ' + f.label).join(', '),
			title: flags.map(f => f.n + (f.n === 1 ? ' file ' : ' files ') + f.label).join(', ')
		};
	}
	// A FOLDER WITH NOTHING TICKED SAYS NOTHING, like every other
	// aggregate here — `!n` above has already returned for that.
	if (how === 'ticked') {
		return { text: done + '/' + n,
			title: done + ' of ' + n + ' ticked'
				+ ' \u2014 ' + n + (n === 1 ? ' file carries' : ' files carry')
				+ ' this property' };
	}
	switch (how) {
		case 'sum':
			// (The signed `+` stood here, for Today. It went with the
			// column — writer, 2026-08-27, "remove the today propriety".
			// No other reading is signed: words, paras and tasks cannot
			// be negative, so the prefix had exactly one customer.)
			//
			// A SUM CARRIES ITS COLUMN'S UNIT. Every other summed column
			// counts things, so a thousands separator is the whole of the
			// formatting; minutes are not a count, and 2.803 in a Read
			// time cell is a number in the wrong language. Named here
			// rather than given its own `how`, because the ARITHMETIC is
			// a plain sum — it is only the saying of it that differs.
			if (col.id === 'read') return { text: d.plugin.formatReadTime(sum) };
			// A FOLDER'S TARGET SAYS BOTH NUMBERS, whichever way its notes read
			// (the writer, 2026-09-20): the words of its targeted notes over
			// their targets, with the thousands separators the cells use.
			if (col.id === 'goal') return { text: wg.toLocaleString() + '/' + sum.toLocaleString(),
				title: wg.toLocaleString() + ' words over a target of ' + sum.toLocaleString() + ', in ' + n + (n === 1 ? ' note' : ' notes') };
			return { text: sum.toLocaleString() };
		case 'avg': {
			// ── WEIGHTED BY LENGTH (writer, 2026-08-27, brief A2) ─────
			//
			// “Grade → length-weighted average (an unweighted mean lets a
			// 100-word scene outvote a 3,000-word one)”. A chapter's grade
			// is a claim about the chapter, and a one-line stub carried
			// as much of it as the scene it is a note about.
			//
			// FALLS BACK TO THE PLAIN MEAN when nothing beneath it has a
			// length — weights that are all zero would divide by zero and
			// put NaN in a cell, which is worse than the mean it replaced.
			const a = wsum > 0 ? (wtot / wsum) : (sum / n);
			return { text: (Math.round(a * 10) / 10).toFixed(1),
				title: (wsum > 0 ? 'average of ' + n + ', weighted by length'
					: 'average of ' + n) };
		}
		// Written the way the CELLS are written, and now literally
		// BY the same function — `orgStamp`, one fixed dd/mm/yyyy
		// hh:mm — so a group and its rows read as one column rather
		// than two formats. Three inline `toLocaleString` calls
		// stood here and at the cell; that was three chances to
		// drift (2026-08-22, reversing 268b — tombstone on
		// `orgStamp` in src/38-org-index.js).
		case 'newest':
			return { text: d.plugin.orgStamp(newest),
				title: 'newest of ' + n };
		case 'oldest':
			return { text: d.plugin.orgStamp(oldest),
				title: 'oldest of ' + n };
		// AND THE BRACKETS, matching the cell (`orgColText`,
		// 'tasks'). The contract in this function's own header says
		// the aggregate is written "as the cells write it" — so
		// these two move together or that line becomes a lie.
		case 'tasks':
			return all ? { text: wsTaskSay(done, all) } : null;
		// ── A COUNT, AND THE DAYS ONE HOVER AWAY ────────────────
		//
		// "dates should only show a count number" (writer, 2026-08-28).
		// The number is how many notes beneath this folder carry one —
		// not how many DIFFERENT days, which is the question the 361
		// tombstone below calls one nobody asks.
		//
		// AND IT SAYS OF WHAT. A bare `3` in a date column could be read
		// as a day; the hover names the whole thing, in the same
		// grammar the enumerating columns use.
		default: {
			const tot = (paths || []).length;
			const vals2 = Array.from(seen.keys());
			// THE HOVER STILL CARRIES THE VALUES, which is what keeps the
			// count honest — except that a long field's values are
			// paragraphs, and a tooltip holding four of them is the cell
			// fault moved one hover along. It names how many instead.
			const many = vals2.join(', ');
			// ── A LIST COUNTS ITS VALUES; A SCALAR COUNTS ITS NOTES ──
			//
			// Writer, 2026-08-30: "the tag aggregator shows only how many
			// files have tags, not the tag count." Measured in their own
			// vault: `Chapter 2 - The Sea` holds `sea`, `keys` and `town`
			// across two notes, and the cell read 2.
			//
			// THE SCALAR RULE IS NOT REVERSED. "dates should only show a
			// count number" (2026-08-28) asked how many notes carry one,
			// and that is still what a date, a Pov or a Description
			// answers — a note has ONE of each, so notes and values are
			// the same number and the question never arises. A note has
			// MANY tags, which is the whole of the difference, so the
			// split is on the SHAPE of the value and not on the column's
			// name. In the reporting vault that changes exactly one
			// column, Tags, and leaves Pov, Locations, date and
			// Description reading as they did.
			//
			// AND THE HOVER SAYS WHICH QUESTION WAS ANSWERED, because
			// two counting rules in one column strip is exactly the kind
			// of thing that reads as a bug when it is not.
			const count = listy ? vals2.length : n;
			return { text: String(count),
				title: (listy
					? vals2.length + (vals2.length === 1 ? ' value' : ' values')
						+ ' across ' + n + (n === 1 ? ' note' : ' notes')
					: n + ' of ' + tot + (tot === 1 ? ' note' : ' notes'))
					+ (vals2.length && many.length <= 120
						? ' \u00b7 ' + many : '') };
		}
	}
};
// What a sort compares. Tasks sort by what is LEFT (that is the
// question the column answers); tags by how many; a flag by its
// place in the flag order, so Draft…Done reads as a progression.
const orgColSortKey = (col: { id: string; key?: string; sortAs?: string }, path: string): number | string | null => {
	const v = orgColRaw(col, path);
	if (v === null) return null;
	switch (col.id) {
		case 'tasks': { const t = wsTasksOf(v); return t ? t.all - t.done : null; }
		case 'tags': return wsListOf(v).length;
		case 'outlinks': return wsListOf(v).length;
		// BY PROGRESS, NOT BY THE NUMBER TYPED (A286 item 20, writer with a
		// shot: “look how it sorts the target (bad) -- sort them by
		// percentage”). The raw value is the target, so Sort: Target put
		// every 3,000 above every 2,500 while the column read 72%, 87%,
		// 83%. What the column SHOWS is how far along the note is, and that
		// is what it sorts by now: words over target. A target of nothing
		// has no progress and drops out, as it did.
		case 'goal': {
			const t = Number(v) || 0;
			if (!(t > 0)) return null;
			let w = 0;
			try { w = Number(orgColRaw({ id: 'words' }, path)) || 0; } catch { w = 0; }
			return w / t;
		}
		case 'mark': {
			const ids = d.plugin.flagDefs().map(f => f.id);
			const i = ids.indexOf(wsStr(v));
			return i === -1 ? ids.length : i;
		}
		default: {
			if (typeof v === 'number') return v;
			if (col.sortAs === 'number') {
				const n = parseFloat(wsStr(v));
				return isFinite(n) ? n : null;
			}
			if (col.sortAs === 'date') {
				const t = Date.parse(wsStr(v));
				return isFinite(t) ? t : null;
			}
			const s = Array.isArray(v) ? v.map(wsStr).join(', ') : wsStr(v);
			const n = parseFloat(s);
			return (isFinite(n) && String(n) === s.trim()) ? n : s.toLowerCase();
		}
	}
};
	return { orgColRaw, orgColText, orgFolderIcon, orgColAgg, orgColSortKey };
};
