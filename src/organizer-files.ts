// Word-Smith — organizer-files. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import type WordSmith from './plugin';
import type { wsOrgSelMake } from './organizer-sel';

// ════════════════════════════════════════════════════════════════════════
// THE FILES — which of the vault's files this window is about, and what
// each one is called
// ════════════════════════════════════════════════════════════════════════
//
// THE TWENTY-SECOND PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-15,
// by `ws-dev/lift.js`): `allFiles` (EVERY file, not every markdown file —
// the tree draws what is there — with the order stores kept out),
// `folderOf`, `nameOf` (the name a row shows, which is the base name and
// not the path), `keptFiles` / `liveFiles` (what survives the shape, the
// kinds and the lens), `orgDrawnSig` (what the last draw drew, so a redraw
// that would change nothing is skipped) and `orgCellHint` (the cell a
// repaint should land on). Two hundred lines.
//
// WHAT IT READS, through `d`: the selection (`d.orgSel`, `d.keyOf`) and
// `d.plugin` — the vault, the index and the settings.
//
// TWO `let`s ARE LIVE — `orgDrawnSig` and `orgCellHint`, both read and
// set by the table's context — so they come back as getters and setters
// and the closure reads them as `orgFiles.<name>`. The comments came with
// it, as they stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgFilesMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (2 of 3).
export interface OrgFilesDeps {
	plugin: WordSmith;
	readonly keyOf: (it: { path: string; kind: string; }) => string;
	readonly orgSel: ReturnType<typeof wsOrgSelMake>;
}

export const wsOrgFilesMake = (d: OrgFilesDeps) => {
// WHERE WORD-SMITH APPLIES IS STILL A SETTING, and it still governs
// what gets counted, compiled and reported on. It simply does not
// govern this window's tree any more.
//
// The store files stay out: an order file inside a chapter folder
// would be counted, targeted and flagged like a scene.
const allFiles = () => {
	try {
		// EVERY file, not every markdown file — the tree draws what
		// exists and the TYPE FILTER says which kinds survive. The
		// default set is 'md' alone, so a vault that has never
		// touched the menu gets byte-for-byte the list this used to
		// return. `getFiles` is not on the stubbed vaults the probes
		// drive, so the markdown list stands in where it is absent —
		// under a stub the type filter has nothing to add anyway.
		const v = d.plugin.app.vault;
		const raw = (v.getFiles ? v.getFiles() : v.getMarkdownFiles()) || [];
		// ── THE PLUGIN'S OWN FILES ARE STILL FILES ──────────────
		//
		// Writer, 2026-08-25: "also show all the filess in organizer
		// including ws-strucutre ws-setting."
		//
		// `.filter(f => !this.isStoreFile(f.path))` STOOD HERE. Its
		// reasoning is real and is written out in `isFileCounted`:
		// "a record of the writing should not record itself being
		// kept" — the store is rewritten every time a box is ticked,
		// so counting it moved the day's word count and repainted
		// the bar while a writer was choosing files.
		//
		// EVERY WORD OF THAT IS ABOUT TOTALS. `isFileCounted` still
		// says it, independently and unchanged, so nothing about
		// the counts moves here. Being absent from a total and
		// being absent from the LIST OF FILES IN THE VAULT are two
		// questions, and one predicate was answering both — which
		// is why the writer could see `ws-settings.md` (not flagged)
		// and not `ws-structure.md` (flagged) with no rule they
		// could infer between them.
		//
		// WHAT DOES NOT COME BACK IS THE DRAG: see `orgRowDrag`,
		// where a store row is refused. A row that reorders the file
		// the order is stored in is a row that writes itself.
		return raw
			// (a third .filter on the retired folder scope stood here)
			.filter(f => d.plugin.uniTypeAllows(f));
	} catch { return []; }
};
const folderOf = (path: string) => {
	const cut = String(path).lastIndexOf('/');
	return cut === -1 ? '' : path.slice(0, cut);
};
const nameOf = (path: string) => (path === '' ? 'Vault root'
	: String(path).split('/').pop().replace(/\.md$/, ''));

// EVERYTHING FOLDED, except the way down to the note in hand —
// ON A FIRST OPENING ONLY.
//
// The window opens on the whole vault with NOTHING SELECTED — that is
// the decision, and it is what makes the inspector useful before the
// first click. But arriving at a four-hundred-note vault with no idea
// where you are standing is a wall, so the chapter the writer is
// actually in is unfolded and cursored. Shown, not chosen: the
// inspector still answers for the vault until they pick something.
//
// AND IT DEFERS TO WHAT THE WRITER LEFT. This block ran unconditionally
// and folded every folder in the vault, which quietly overruled the
// remembered set two hundred lines above — two answers to "which
// folders are shut", with the later one winning and the writer's own
// choice losing. A guess is the right answer only when there is no
// answer: once somebody has folded something themselves, that is what
// the window is for remembering.
// THE CURSOR GOES TO THE NOTE IN HAND. (The fold seeding that stood
// around this — every folder shut on a first run, the note’s ancestors
// opened again — was the tree’s, A277.)
{
	const here = d.plugin.activeNoteFile && d.plugin.activeNoteFile();
	if (here && here.path) d.orgSel.cursor = d.keyOf({ path: here.path, kind: 'file' });
}

// ── TOMBSTONE (Phase 5): THE SEARCH SYNTAX ──────────────────────────
//
// `file:` / `path:` / `tag:` / `-negation` / "phrases" — the query
// grammar the old tab’s box spoke (`parseQuery` the parser, `termHits`
// the field dispatch). The spec’s FILTER section replaced the whole
// feature — plain search + AND chips in the Table view — and says out
// loud that the old syntax retires with the old tab. What stays for
// the remaining tabs’ tree search is exactly what a bare word always
// did: the path contains it, every word ANDed.
// TOMBSTONE (A277): `queryTerms`, `parseQuery` and `matches` — the tree
// search’s grammar. Nothing types into them since the box went with the
// tree (A267), so the predicate answered yes to everything: an
// always-true filter is a filter waiting to be believed.
// TOMBSTONE (Phase 5): `hasValueIn` / `matchesFilter` and the
// facet OR/AND rule — the filter set’s predicates. `keepFile` is
// the search alone now; the Table view’s chips are where a
// property narrows anything.
// TOMBSTONE (A277): `keepFile`, which asked `matches`. Every file is kept.

// ── TOMBSTONE: THE EMPTY-VALUE PRUNE (A58, 2026-09-03) ───────────
//
// `hasSortValue` decided whether a row had anything in the sorted
// column, and `pruneEmpty` decided whether to apply it —
// `sort !== 'order' && sort !== 'name'`, which is ALWAYS FALSE
// because `sort` is always `'order'`. So nothing was ever pruned and
// `emptyHidden` was always 0.
//
// THE REASONING IN IT WAS RIGHT AND IS WORTH KEEPING IN WORDS: a row
// is hidden only when it is KNOWN to have nothing, never when it is
// merely unmeasured, because treating the two alike hides every note
// in a folded folder the moment a heading is clicked — fold state
// acting as an invisible filter. If a prune is ever built again, it
// is built on that rule.
// ── THE LIST BEFORE THE PRUNE, WHICH IS A SEPARATE QUESTION ─────────
//
// "Which files survive the filters" and "which of those have anything
// in the sorted column" are two stages, and they have to stay two:
// `sortingProp` sniffs a property's TYPE over the files on screen, and
// pointing it at the pruned list made a cycle — prune asks `sortText`,
// `sortText` asks `sortingProp`, `sortingProp` asks for the list, which
// prunes. It recursed until the stack went, and the probe reported it
// as an unhandled exception with two siblings missing from a tree.
//
// AND THE SNIFF IS BETTER OFF HERE ANYWAY. A type worked out from only
// the rows that survived a prune that DEPENDS on that type is circular
// reasoning even where it terminates: the question "is this column
// dates or text" is about every value present, not about the ones a
// previous answer kept.
const keptFiles = () => allFiles().map(f => f.path);
// EVERY KEPT FILE IS A LIVE FILE. The prune above it is gone, so
// this is the identity it has always computed.
const liveFiles = () => keptFiles();

// A search OPENS what it finds — once, by unfolding the ancestors of
// each match and then getting out of the way. Overriding the fold
// state on every draw is what made the board's chevrons look dead
// while anything was typed: they toggled a set the draw ignored.
// TOMBSTONE (A277): `openTo`, which unfolded the ancestors of everything a
// search matched. There is no search.

// WHERE A FOLDER'S CHILDREN STAND, when the tree is in manuscript
// order. Read once per draw per folder rather than per comparison:
// a sort is O(n log n) comparisons and this is a map lookup either
// way, but building it inside the comparator would rebuild it for
// every one of them.
// ── WHAT THE PANE IS CURRENTLY SHOWING (A209) ───────────────────
//
// The paths of the drawn rows, in order. A redraw compares the list it
// has just computed against this: identical means nothing moved or
// vanished, and a one-cell change can be painted as one cell.
//
// `null` MEANS NOTHING HAS BEEN DRAWN YET, which is not the same as
// an empty pane — an empty table has an empty signature, and taking
// the fast path against a pane that was never built would repaint a
// cell that is not there.
let orgDrawnSig: string | null = null;
// The row a one-cell change is about, set by the writer that made it
// and consumed by the next draw. Cleared as it is read, so a hint
// cannot survive into a later draw that is about something else.
let orgCellHint: { td: HTMLElement; path: string } | null = null;
// TOMBSTONE (A267, 2026-09-09): `rankIn` and `rankFor`, the per-draw
// memo of the stored order, and `cmp` with `MANUSCRIPT_LAST` — the
// comparator the window's own tree sorted its rows with.
//
// THE TREE WAS THE ONLY CALLER of all four. The table reads the stored
// order through `exportGather` (22-document-analysis) and sorts on its
// own lens; nothing in the window asked `cmp` anything once the tree
// went. A comparator nobody calls is a second opinion about order
// waiting for somebody to reach for it.
// ── WHICH FILES A ROW GOVERNS, ONCE PER DRAW (A188, 2026-09-05) ─
//
// `tickBox` asked this PER ROW, and asked it the expensive way:
//
//   const mine = exportFiles().map(f => f.path).filter(under);
//
// `exportFiles()` re-runs `exportGather` over the scope, `map`
// allocates a fresh array of every path, and `filter` walks it — so
// one draw of the Export tree was ROWS x FILES, three times over.
// Doubling the manuscript doubles the rows AND the list: four times
// the work for twice the book, which is what `ws-dev/scale_probe.js`
// went red on at 3.4x.
//
// ONE WALK: each file adds itself to every folder above it, and the
// row looks its answer up. Same lists, same order — the writer's
// order, which is why this pushes in gather order rather than
// sorting — and the same shape as `rankFor` above it: born empty at
// the top of `draw`, so it can never answer about a vault that has
// changed since.
//
// THE `p === path` CLAUSE IS GONE and it never fired: it asked
// whether a gathered FILE has the same path as the FOLDER being
// drawn, and a vault cannot hold both at one path. It was a
// defensive clause rather than a decision, and paying a lookup per
// row for a case the file system forbids is not a trade.
// THE PER-DRAW INDEX of what each row governs is the ticks module's
// (03-organizer-ticks.js): its `index()` builds on the first row that
// asks, its `dropIndex()` is the one door that drops it, and the
// panel draw calls that.
	return { folderOf, nameOf, liveFiles, get orgDrawnSig() { return orgDrawnSig; }, set orgDrawnSig(v) { orgDrawnSig = v; }, get orgCellHint() { return orgCellHint; }, set orgCellHint(v) { orgCellHint = v; } };
};
