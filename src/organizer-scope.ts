// Word-Smith — organizer-scope. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import type WordSmith from './plugin';
import type { wsOrgSelMake } from './organizer-sel';
import type { WordSmithSettings } from './settings';

// ════════════════════════════════════════════════════════════════════════
// THE SCOPE — what the window is pointed at, and what a click does to it
// ════════════════════════════════════════════════════════════════════════
//
// THE NINETEENTH PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-15, by
// `ws-dev/lift.js`): `orgSelect` (the ONE writer of `organizerFolder` —
// a folder chosen, saved, drawn), `orgNote` (the note the pane holds),
// `orgMark` (which row wears the mark), `orgFolderHolds` /
// `orgScopeHolds`, `orgFollow` (a click on a note row: the scope stays
// where it already holds the note and moves to the note's folder when it
// does not — view state, no store), and `showItem`. Two hundred lines.
//
// WHAT IT READS, through `d`: the folder and its guards (`d.orgFolder`,
// `d.orgFolderOk`, `d.orgFolderSet`, `d.folderOf`), the selection
// (`d.orgSel`, `d.keyOf`), the
// settings (`d.s`), the draw (`d.draw`, `d.drawPanel`) and `d.plugin`.
//
// TWO `let`s ARE LIVE — `orgNote` (read by the tabs, the subject line and
// the keys) and `orgDrawTimer` (the index's debounce) — so they come back
// as getters and setters and the closure reads them as `orgScope.<name>`.
// The comments came with it, as they stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgScopeMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (6 of 11).
export interface OrgScopeDeps {
	plugin: WordSmith;
	readonly draw: () => void;
	readonly drawPanel: () => void;
	readonly folderOf: (path: string) => string;
	readonly keyOf: (it: { path: string; kind: string; }) => string;
	readonly orgFolder: string;
	readonly orgFolderOk: (p: string) => boolean;
	readonly orgFolderSet: (v: string) => string;
	readonly orgSel: ReturnType<typeof wsOrgSelMake>;
	readonly s: WordSmithSettings;
}

export const wsOrgScopeMake = (d: OrgScopeDeps) => {
// ── AND THE NARROW WINDOW'S ONE DOOR SWINGS BOTH WAYS (A165) ───
//
// Writer, 2026-09-04: "right now i can only see the organiser file
// tree on the phone". 486eu made the narrow layout ENGAGE; this is
// the half that says on screen that it did.
//
// MEASURED, narrow forced: in the TREE state the back button is
// shown at 44x44 wearing the title "Back to the tree" — pointing
// home from home. It is the ONLY chrome that hints a second pane
// exists and it faces the wrong way, and the only working way
// across was tapping a FOLDER: a gesture, not a door.
//
// SO IT IS A TOGGLE, meaningful in both states, and the GLYPH has
// to carry it — a phone has no hover, so a `title` nobody can read
// is not the door either.
//
// AND `is-panel` GETS ONE WRITER while it is being touched. The
// label is a second fact about the same state and there were
// already four places setting the class; a fifth that has to be
// remembered beside each of them is the drift this window keeps
// removing.
// TOMBSTONE (A277): `uniBackEl`, `uniPanelAt`, `uniBackFace`, `uniPanelSet`
// and `uniPanelShow` — the narrow layout’s two faces and the button
// between them. One column since A267, so there is no other face.
const orgSelect = (p: string) => {
	d.orgFolderSet(p);
	// ── AND THE NOTE MARK CANNOT OUTLIVE ITS FOLDER (A149) ──
	//
	// Writer, 2026-09-04: "i dont want two selections … if i
	// select a note, then select a folder that does not have that
	// note it still shows the note selected and the folder that
	// does not have that note".
	//
	// MEASURED before fixing: at open, `_ws-typecheck/note-b.md`
	// marked inside `_ws-typecheck` — two marks that AGREE, which
	// is the 2026-08-21 ask working. Then clicking
	// `_ws-typecheck/agg`: the note mark stayed put while the
	// folder mark moved somewhere that cannot contain it.
	//
	// FOUR PLACES WRITE `orgFolder` AND ONLY THIS ONE COULD DO IT.
	// The initial read has no mark to orphan; `orgFollow` sets
	// both together in either branch — clearing the note for a
	// folder, or narrowing to the note's own parent. This is the
	// only writer that moved one half of the pair.
	//
	// THE MARK IS DROPPED, NOT THE FEATURE. A folder that DOES
	// hold the note keeps both, because that is the writer's own
	// earlier ask — "if a note is selected show the whole folder
	// of that note with the note itself selected" — and the two
	// marks there are one selection seen at two depths, not two
	// selections. What was reported is the pair DISAGREEING.
	if (orgNote && !orgFolderHolds(d.orgFolder, orgNote)) orgNote = '';
	d.s.organizerFolder = d.orgFolder;
	d.plugin.saveSettings().catch(() => {});
	// One pane at a time when there is only room for one: choosing a
	// folder IS the move to the right pane, and the back button is the
	// way home — same grammar as the old tabs' narrow layout.
	d.draw();
	d.drawPanel();
};
// ── SELECTION FOLLOWS THE NOTE (inbox, 2026-08-21) ──────────────────
// "if a note is selected show the whole folder of that note with the
// note itself selected". `orgNote` is the marked note — accent in the
// tree AND the table — and `orgFollow` is its one writer: the cursor
// keys feed it, and the open-time active-file follow feeds it. It is
// VIEW state (not saved): the persisted folder stays `orgSelect`'s.
let orgNote = '';
// WHICH OF THE TWO THE TREE MARKS (A234, writer 2026-09-07): "let
// show only one thing selected in the organiser file tree - not
// like two right now the folder and the file - it's confusing for
// users". View state, like orgNote: the STORE keeps the folder and
// the note both, because the pane needs the folder to know what it
// shows; the tree marked the last thing chosen.
//
// TOMBSTONE (2026-09-15): `orgMark`, and its three writers. THE TREE IT
// MARKED WAS DELETED AT A267 and its reader went with it, so for six days
// it was state nothing could see — found by two sabotage cases that
// deleted a write and changed nothing a probe could measure. The fault it
// was built for is still answered: there is one subject line and one
// marked row, and the one mark lives in the table's draw.
// ── …AND `keepScope` IS HOW IT STOPS OVERRULING A CHOICE ─────
//
// "the organizer does not remember what the state left when i reopen
// it" (2026-08-30).
//
// MEASURED: everything else in that state survives — the mode, the
// open cards, the outline’s properties, the readings, the columns,
// the dragged Name width and the tree width. `organizerFolder` was
// the one, and it was not lost: it was READ at open and then thrown
// away by the follow a few lines later, which is worse than not
// storing it — the writer’s choice is on disk, being ignored.
//
// TWO OF THE WRITER’S ASKS MEET HERE. 2026-08-21: "if a note is
// selected show the whole folder of that note with the note itself
// selected". 2026-08-30: the window should remember where it was.
// `keepScope` keeps both by moving the scope only when the folder
// being held does not already CONTAIN the note — so a writer
// mid-scene inside their chosen scope keeps the scope and still gets
// the scene marked, and a writer editing something outside it is
// followed exactly as before.
//
// ONLY THE OPEN PASSES IT. The cursor keys call this with no flag,
// because arrowing onto a note in another folder is a writer ASKING
// to be taken there — that is the pane following the selection, and
// it is not the thing that was reported.
// WHOLE SEGMENTS, so a folder named `Book` does not claim a note
// under `Bookshelf`. One reader, because two places asking "is this
// note inside the scope" is two chances to answer it differently.
//
// AN EMPTY SCOPE HOLDS NOTHING, here. It is the whole vault, so it
// contains every note in the ordinary sense — but this reader
// answers ONE question, "may the follow leave the scope alone",
// and the answer for a pane with no folder chosen is no: that is
// exactly when the open-time follow should take it to the active
// note. A table click does not ask this question at all now.
// ── AND THE CONTAINMENT ITSELF HAS ONE READER (A149) ────────────
//
// `orgSelect` needs the same question asked of a DIFFERENT folder —
// the one being chosen — so the test is lifted out rather than
// typed a second time. The paragraph above already says why: "two
// places asking 'is this note inside the scope' is two chances to
// answer it differently".
//
// THE EMPTY-FOLDER POLICY STAYS AT THE CALLER, because the two
// callers genuinely disagree about it and that disagreement is
// correct. Plain containment says the whole vault holds every note.
// `orgScopeHolds` then refuses the empty scope on purpose — it asks
// "may the follow leave the scope alone", and for a pane with no
// folder chosen the answer is no. `orgSelect` asks the plain
// question and wants the plain answer. Folding either policy into
// this reader would give one of them the other's behaviour.
const orgFolderHolds = (folder: string, path: string) => !folder
	|| String(path).indexOf(String(folder) + '/') === 0;
const orgScopeHolds = (path: string) => !!d.orgFolder
	&& orgFolderHolds(d.orgFolder, path)
	&& d.orgFolderOk(d.orgFolder);
const orgFollow = (it: { path: string; kind: string }, keepScope: boolean, markOnly?: boolean) => {
	if (!it || !it.path) return;
	if (it.kind === 'folder') {
		orgNote = '';
		d.orgFolderSet(it.path);
	} else {
		orgNote = it.path;
		// The held scope already covers this note: mark it and leave
		// the scope alone.
		//
		// AND THE WHOLE VAULT HOLDS EVERY NOTE (2026-08-31). This read
		// `keepScope && orgFolder && …`, so the ONE scope that contains
		// everything — the empty one, which is what the pane holds when
		// no folder is chosen — was the one scope that failed the
		// containment test and got narrowed away. A guard that is false
		// for the widest case is the wrong way round.
		// MARK AND NOTHING ELSE (writer, 2026-08-31). The table row
		// asks for this: a click there selects, and the way into a
		// folder is the tree on the left — their words. Checked
		// BEFORE the containment test, because it is not a question
		// about the scope: it holds whatever the scope is, including
		// the empty one.
		if (markOnly) return;
		if (keepScope && orgScopeHolds(it.path)) return;
		const par = d.folderOf(it.path);
		d.orgFolderSet(par);
	}
};
// ── SINGLE CLICK SHOWS, DOUBLE CLICK OPENS (G6) ─────────────────
//
// The writer, 2026-08-23: "history and export already have the
// double click to open file thing." So this was never a behaviour
// to design - it ships on two of the three tabs and the Organizer
// was the one that disagreed, opening a note the moment a row was
// touched. Both of its surfaces did: the binder row and the table
// row.
//
// NOTHING NEW IS WRITTEN, and that is the point. `orgFollow` above
// is already the ONE writer of which note is marked - the accent in
// the tree and `ws-org-active` in the table are both its doing -
// and the cursor keys have fed it since the follow landed. This is
// the same three lines `moveCursor` runs, minus the scroll: a
// writer who just clicked a row does not need it brought into view.
// A second notion of "the shown row" is the fault this window keeps
// removing, and there is no second mark, no second class and no new
// state here.
//
// AND OPENING KEEPS THREE DOORS, so the gesture is not the only way
// in: double click, Enter on the cursor, and Open in the row's
// right-click menu.
const showItem = (it: { path: string; kind: string }, markOnly?: boolean) => {
	if (!it || !it.path) return;
	d.orgSel.cursor = d.keyOf(it);
	d.orgSel.cursorDrives = true;
	orgFollow(it, false, markOnly);
	d.draw();
	// AT ONCE, NOT ON THE DEBOUNCE. `moveCursor` ends in
	// `schedulePanel()` because a held arrow key would otherwise
	// rebuild the table on every step; a click is one deliberate act
	// and 140ms of nothing after it reads as a dead row.
	d.drawPanel();
};

// TOMBSTONE (writer's pass, 2026-08-21): `orgWordsCell` — the
// binder's per-row words number. "remove the word counts from it":
// the tree is names and folds now, full stop; the figures live in
// the right pane's table and the strip's aggregate. The index still
// feeds both of those.

// The index rings after every write it takes; while the Organizer tab
// is up, that repaints the numbers FROM it — one debounced clock,
// because a paste into a big note lands as several events.
let orgDrawTimer: number | null = null;
	// (orgScopeHolds is out for the pin, A462: the explorer's door asks it)
	return { orgSelect, orgFollow, showItem, orgScopeHolds, get orgNote() { return orgNote; }, set orgNote(v) { orgNote = v; }, get orgDrawTimer() { return orgDrawTimer; }, set orgDrawTimer(v) { orgDrawTimer = v; } };
};
