// Word-Smith — organizer-shape. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import type { Menu } from 'obsidian';
import { wsCatch } from './preamble';
import type WordSmith from './plugin';
import type { WordSmithSettings } from './settings';

// ════════════════════════════════════════════════════════════════════════
// THE SHAPE AND THE KINDS — what a writer is looking at, in two stores
// ════════════════════════════════════════════════════════════════════════
//
// THE THIRTEENTH PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-15, by
// `ws-dev/lift.js`): the SHAPE (`showShape`, `setShape` — all files,
// notes only, folders only, files only) and the KINDS (`typeLabel`,
// `typeRows` — the one builder of the extension rows every menu that
// offers them uses). Two hundred and sixty lines, and the prose on them is
// the argument for their being two questions: `uniTypes` is about
// EXTENSIONS and a folder has none, so folding the two into one set would
// make "Notes only" a kind on Tuesdays and a shape on Wednesdays.
//
// WHAT IT READS, through `d`: the settings (`d.s`, both stores), the draw
// (`d.draw`, `d.fill`, `d.drawPanel`) and `d.plugin` for the kinds present
// under the selection. The comments on each function came with it, as it
// stood.
//
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgShapeMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (0 of 5).
export interface OrgShapeDeps {
	plugin: WordSmith;
	readonly draw: () => void;
	readonly drawPanel: () => void;
	readonly fill: () => Promise<void>;
	readonly s: WordSmithSettings;
}

export const wsOrgShapeMake = (d: OrgShapeDeps) => {
// ── FOLDERS, FILES, OR BOTH — A SHAPE, NOT A KIND ───────────────────
//
// Asked for from a vault: "the notes only filter should only show the
// notes not the folders, add a folders only too", and "add a show only
// the files".
//
// IT IS A SEPARATE QUESTION FROM THE KINDS. `uniTypes` is about
// EXTENSIONS — which of Notes, Images, Canvas, PDFs exist here — and it
// has never had anything to say about folders, because a folder has no
// extension to match. Folding the two into one set would have made
// "Notes only" a kind on Tuesdays and a shape on Wednesdays.
//
// SO THEY ARE TWO STORES AND ONE MENU. The rows a writer reads are
// "All files / Notes only / Folders only / Files only", which is one
// list of four answers to "what should I be looking at"; underneath,
// each row sets whichever of the two it needs and leaves the other
// alone. `Notes only` is the one that sets both — a kind AND a shape —
// and that is exactly what was asked for.
const showShape = () => {
	const v = String(d.s.uniShow || 'all');
	return (v === 'files' || v === 'folders') ? v : 'all';
};
const setShape = async (v: string) => {
	d.s.uniShow = (v === 'files' || v === 'folders') ? v : 'all';
	await d.plugin.saveSettings(true);
	d.draw(); void d.fill();
	// AND THE PANEL, for the Organizer's own kind chip (2026-08-22).
	// `draw()` is the tree; the chip that says a narrowing is on
	// lives in the table's bar, and a sign that only appears on the
	// next unrelated redraw is a sign a writer cannot trust.
	// Guarded: `drawPanel` is declared further down the closure.
	try { d.drawPanel(); } catch (_) { wsCatch('openManuscriptModal / setShape: drawPanel();', _); }
};
// ── WHICH KINDS OF FILE — NO LONGER A BUTTON OF ITS OWN ─────────────
//
// TOMBSTONE: "the third question, its own control… folding it into the
// filter menu would rebuild the one-funnel fault". Asked for from a
// vault, plainly: "remove the filetype button, we already control that
// in the filter button", inside a larger request for four buttons that
// each own one question and share none of it.
//
// THE ONE-FUNNEL FAULT WAS A LABEL, NOT A MENU. What it records is a
// single button reading "Everything · Words" — two answers to two
// questions in one strip of text, neither readable without opening it.
// A SUBMENU is not that: "By type" is a named door, the ticks inside it
// are the state, and the filter's own label still says only what the
// filter does.
//
// AND THE STATE KEEPS A VISIBLE SIGN, which is the half of that
// tombstone worth keeping. It is a chip beside the scope's, for exactly
// the reason that one exists: "half my vault vanished" is what an
// invisible filter files itself under, and a writer who has hidden
// every kind but Notes must be able to see it without opening a menu.
const typeLabel = () => {
	const on = d.plugin.uniTypeSet();
	const all = d.plugin.uniTypeGroups();
	const shape = showShape();
	// THE SHAPE WINS THE LABEL when it is the narrower statement.
	// "Folders only" and "Notes only" are what a writer will recognise
	// as the reason a tree looks short; "1 kind" is not.
	if (shape === 'folders') return 'Folders only';
	if (shape === 'files' && on.size === 1 && on.has('md')) return 'Notes only';
	if (shape === 'files') return 'Files only';
	if (on.size >= all.length) return 'All files';
	if (on.size === 1 && on.has('md')) return 'Notes';
	return on.size + ' kinds';
};
// ── THE KINDS, AS ONE BUILDER ───────────────────────────────────────
//
// Asked for from a vault: the filter menu should carry submenus "by
// type, by files, by flag". So these rows are now reachable from two
// places — this button, and the filter menu's "By type" — and they are
// written ONCE. Two copies of a menu is how one of them gains a row the
// other has not; the column menu's comment records that fault and the
// sort menu's submenus already avoid it the same way.
//
// THE BUTTON STAYS. Reaching the kinds from the filter menu does not
// mean the filter menu OWNS them: the tombstone on that control is a
// single button whose label read "Everything · Words" — two answers to
// two questions, neither readable without opening it. The button keeps
// its own label ("Notes" / "All files" / "N kinds"), so the state is
// still legible at a glance; the submenu is a second door, not a move.
const typeRows = (into: Menu) => {
	const groups = d.plugin.uniTypeGroups();
	const setAnd = (list: string[]) => {
		d.plugin.settings.uniTypes = list;
		void d.plugin.saveSettings(true);
			d.draw(); void d.fill();
		// …and the bar's kind chip — see the note in `setShape`.
		try { d.drawPanel(); } catch (_) { wsCatch('openManuscriptModal / setAnd: drawPanel();', _); }
	};
	const on = d.plugin.uniTypeSet();
	// ── FOUR ANSWERS TO "WHAT AM I LOOKING AT" ──────────────────
	//
	// One list, because that is how a writer reads it. Underneath,
	// each row sets whichever of the two stores it needs: the kinds
	// are extensions, the shape is folders-versus-files, and only
	// "Notes only" sets both — which is precisely what was asked for
	// ("the notes only filter should only show the notes not the
	// folders").
	//
	// CHECKED, so the list says which one is on without being opened.
	// These four are a single choice; the kinds beneath the separator
	// are a SET, and the separator is the whole of what says so.
	const shape = showShape();
	const allOn = on.size >= groups.length;
	const pick = (i: number, title: string, icon: string, isOn: boolean, fn: () => Promise<void>) => {
		into.addItem((i2) => {
			i2.setTitle(title).setIcon(icon).onClick(fn);
			try {
				if (typeof i2.setChecked === 'function') i2.setChecked(isOn);
				else if (isOn) i2.setTitle('✓ ' + title);
			} catch (_) { wsCatch('openManuscriptModal / pick: if (typeof i2.setChecked === \'function\') i2.setChecked(isOn);', _); }
		});
	};
	pick(0, 'Everything', 'files', shape === 'all' && allOn, async () => {
		setAnd(groups.map(g => g.id));
		await setShape('all');
	});
	pick(1, 'Notes only', 'file-text',
		shape === 'files' && on.size === 1 && on.has('md'), async () => {
			setAnd(['md']);
			await setShape('files');
		});
	pick(2, 'Files only', 'file', shape === 'files' && allOn, async () => {
		setAnd(groups.map(g => g.id));
		await setShape('files');
	});
	pick(3, 'Folders only', 'folder', shape === 'folders', () => setShape('folders'));
	into.addSeparator();
	for (const g of groups) {
		into.addItem((i) => {
			i.setTitle(g.label).setIcon(g.icons[0])
				.onClick(() => {
					const next = new Set(d.plugin.uniTypeSet());
					if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
					// An empty set would draw folders holding
					// nothing, which reads as broken rather than
					// strict — the last kind standing stays on.
					if (!next.size) next.add('md');
					setAnd(Array.from(next));
				});
			// `setChecked` is not on every build; where it is
			// absent the state is said in the title instead —
			// a silent toggle is a menu that has to be opened
			// twice to be read once.
			try {
				if (typeof i.setChecked === 'function') i.setChecked(on.has(g.id));
				else if (on.has(g.id)) i.setTitle('\u2713 ' + g.label);
			} catch (_) { wsCatch('openManuscriptModal / typeRows: if (typeof i.setChecked === \'function\') i.setChecked(on.has(g.id));', _); }
		});
	}
	// ── AND THE EXTENSIONS THE VAULT ACTUALLY HOLDS BEYOND THE KINDS (A304) ──
	//
	// Writer: “I want to filter for other file type than those so maybe add
	// a search option where I can type docx or xlsx” — and, offered the
	// list instead, “for filtering do the list”. The vault’s own extensions,
	// counted, each its own tick, nothing to type or misspell. `ext:<ext>`
	// in the set narrows Other to those; ticking the first one turns Other
	// itself off, so the narrowing is what shows. Counted from the vault at
	// each opening of the menu — a menu is not a draw.
	const known = new Set();
	for (const g of groups) for (const e of (g.ext || [])) known.add(e);
	const counts = new Map();
	try {
		for (const f of (d.plugin.app.vault.getFiles ? d.plugin.app.vault.getFiles() : [])) {
			const e = String((f && f.extension) || '').toLowerCase();
			if (!e || known.has(e)) continue;
			counts.set(e, (counts.get(e) || 0) + 1);
		}
	} catch (_) { wsCatch('openManuscriptModal / typeRows: for (const f of this.app.vault.getFiles())', _); }
	const exts = Array.from(counts.keys()).sort();
	if (exts.length) into.addSeparator();
	for (const e of exts) {
		const title = e + '  ·  ' + counts.get(e);
		const isOn = on.has('other') || on.has('ext:' + e);
		into.addItem((i) => {
			i.setTitle(title).setIcon('file')
				.onClick(() => {
					const next = new Set(d.plugin.uniTypeSet());
					const id = 'ext:' + e;
					if (next.has(id)) next.delete(id);
					else { next.add(id); next.delete('other'); }
					if (!next.size) next.add('md');
					setAnd(Array.from(next));
				});
			try {
				if (typeof i.setChecked === 'function') i.setChecked(isOn);
				else if (isOn) i.setTitle('\u2713 ' + title);
			} catch (_) { wsCatch('openManuscriptModal / typeRows: i.setChecked(isOn) for an extension', _); }
		});
	}
};

// THE TREE ON ITS OWN, and the inspector on its own. Two buttons
// rather than one three-way control: a writer arranging a manuscript
// wants the tree wide, a writer reading a report wants it gone, and
// each of those is one press from where they are standing.
// TOMBSTONE: a button that gave the tree the whole window. The
// Organise tab is that, with a name on it and a reason to be there —
// two controls for one state, one of them unlabelled, was a worse
// answer to the same question.

// (The BAND — 'ws-uni-head' — stood here. One filetree only:
// writer, 2026-08-22. The tree has no header row on any tab.)
// (`head` stood here, and was `null`. Its one reader is gone.)
// `nav-files-container` and `nav-folder` on the container, because a
// theme's tree rules are written against the explorer's OUTER element
// as often as against its rows — indent guides in particular. Without
// it the rows are dressed and the tree around them is not.
// TOMBSTONE (A277): `listWrap` (the tree’s own `nav-files-container`),
// `hint` (the line under it that named the drag) and the sideways-scroll
// shadow on the column. The rows they held are Obsidian’s now.

// FIVE READINGS, and the same five the board carries: percentage,
// words, grade, target, flag. They are narrower here than on the
// board because the tree is a pane rather than a window — the grip
// between the panes is the answer to a writer who wants more of them
// than that.
//
// The board's own widths (`goalsCols`) are deliberately NOT read:
// they were dragged against a 980px window and would arrive here as
// five columns and no room for a file name.
// FOUR TABS, AND THE TAB DECIDES HOW MUCH TREE YOU GET.
//
// The tree does two jobs and they want opposite things. Reading a
// report, it is a navigator and every column beside a name is in the
// way. Arranging a book, it IS the work and the panel is in the way.
// Two pane buttons were the manual answer to that, which asked the
// writer to state something the tab they had chosen already said.
//
// ONE TREE THROUGHOUT. The Organise tab does not draw its own — that
// would be two trees in one window, which is the fault this whole
// window exists to remove. It is the same tree, given the room.
// TOMBSTONE: A REPORT TAB. The figures for one note are a thing a
// writer opens while WRITING that note — from the bar, mid-sentence —
// and putting them behind a tab in a window about the whole manuscript
// made a glance cost a window. `openReportModal` is that glance and it
// stays its own thing, as it was.
//
// What is left here is the three questions this window is for: what
// shape is the book in, what have I written, and what goes out.
// ── OUTLINER, not Structure ─────────────────────────────────────────
//
// The old name was defended on the grounds that this tab is not an
// outliner: you can rearrange the filesystem but not compose shape.
// That stopped being true the moment a folder and a note could be MADE
// from here — a tree you can add nodes to, order, nest and flag is an
// outliner, and calling it anything else makes a writer look for the
// outliner somewhere else.
//
// It also closes the gap between the label and the id, which had been
// `organise` all along: when the internal name and the visible one
// disagree for a year, the internal one is usually the honest one.
//
// THE ID STAYS `organise`. It is written into `data.json` as the last
// tab a writer was on, and renaming it would drop them onto Report on
// the first open after the update — a rename on disk for a cosmetic
// gain, which is the trade the flag ids exist to refuse.
	return { showShape, setShape, typeLabel, typeRows };
};
