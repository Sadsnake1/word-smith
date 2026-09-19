// Word-Smith — organizer-ticks. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { wsUnderIndex, wsUnderRow } from './org-index';
import type { WsUnderIndex } from './org-index';
import { wsCatch } from './preamble';
import type WordSmith from './plugin';
import type { TFile } from 'obsidian';

// ════════════════════════════════════════════════════════════════════════
// THE EXPORT'S TICKS — what is in, out of the closure
// ════════════════════════════════════════════════════════════════════════
//
// THE SECOND PIECE LIFTED OUT OF `openManuscriptModal` (2026-09-14), after
// the journal. It owns four things the closure used to hold as loose
// variables — the tick set, the scope it was read for, the write's debounce
// timer, and the per-draw index of what each row governs — and the six
// functions that touch them: the gather, the load from ws-structure.md, the
// debounced write back, the index, the two doors that add a place or drop
// one, and the door Obsidian's tree paints its boxes through.
//
// WHAT IT READS, all through `d`:
//   plugin       exportGather, exportApplyRemembered, structureRead,
//                structureWriteSection, orgTicksSchedule
//   scopes()     the export's places (null = the whole vault; `orgMany` went)
//                or the folder, which stay the closure's
//   scope()      the one scope those come to when there is one
//   placesSet(l) the closure takes the new places and drops its cached
//                export options (the tab is built again, not refreshed)
//   select(p)    the closure drops the places and chooses one folder
//   redraw()     draw() then drawPanel()
//   said(m)      the foot's say-line
//   wanted()     whether the Export tab is up (the tree paints boxes only then)
// WHAT THE WINDOW LENDS THIS MODULE (A422, 2026-09-18): the type of the object
// `openManuscriptModal` hands `wsOrgTicksMake`, as the checker sees it at the call —
// a getter without a setter is readonly; a member that reads `any` is a
// closure local the window has not typed yet (4 of 7).
export interface OrgTicksDeps {
	plugin: WordSmith;
	scopes: () => string[] | null;
	scope: () => string;
	select: (p: string) => void;
	redraw: () => void;
	said: (m: string) => void;
	wanted: () => boolean;
}

export const wsOrgTicksMake = (d: OrgTicksDeps) => {
	const plugin = d.plugin;
	let ticks: Set<string> | null = null;          // Set of paths, or null until the scope is read
	let ticksFor: string | null = null;       // which scope `ticks` belongs to
	let tickTimer: number = null;
	// THE PER-DRAW INDEX of what each row governs, built on the first row
	// that asks and dropped by `dropIndex()`, which the panel draw calls —
	// the one door every tab's redraw walks through. OVER THE WHOLE VAULT,
	// NOT THE PLACES (A391, writer 2026-09-14: "bring back the half filled
	// ticks"): built over the places, a folder above a place counted only
	// the notes the place held, so a folder with one ticked subfolder read
	// as all ticked. A folder's box speaks for every note under it in the
	// vault: full, half, or empty, as a tree's box does. The arithmetic is
	// `wsUnderIndex`, in src/01-org-index.js, where a suite can reach it.
	let underIn: WsUnderIndex | null = null;
	const index = () => {
		if (!underIn) underIn = wsUnderIndex(plugin.exportGather(''));
		return underIn;
	};
	const dropIndex = () => { underIn = null; };
	const forget = () => { ticksFor = null; };
	// THE FILES, FROM EVERY SCOPE, DEDUPED AND IN THE WRITER'S ORDER. One
	// gather per folder, concatenated in the order they were picked: a
	// writer who selects Part Three then Part One has said something about
	// the order, and re-sorting them by path would be this window
	// overruling them.
	const files = () => {
		const many = d.scopes();
		if (!many || many.length < 2) return plugin.exportGather(d.scope());
		const out: TFile[] = [], seen = new Set<string>();
		for (const p of many) {
			for (const f of plugin.exportGather(p)) {
				if (f && f.path && !seen.has(f.path)) { seen.add(f.path); out.push(f); }
			}
		}
		return out;
	};
	const load = async () => {
		const at = d.scope();
		const many = d.scopes();
		// THE CACHE KEY NAMES EVERY SCOPE, so switching from Part One to
		// Part One + Part Three reloads rather than reusing the first
		// list. It is a cache key only — it never reaches disk, which is
		// what keeps the stored side path-keyed and rename-safe.
		const cacheKey = (many && many.length > 1) ? many.join('\n') : at;
		if (ticks && ticksFor === cacheKey) return ticks;
		const list = files();
		let remembered = null;
		try {
			const store = await plugin.structureRead();
			if (many && many.length > 1) {
				// ONE MEMORY PER FOLDER, MERGED. Each folder's ticks are
				// stored under its own path, exactly as a single-folder
				// compile stores them — so a folder remembers the same
				// thing whether it was compiled alone or beside another,
				// and `renameGoalPaths` keeps working on every entry
				// without knowing this feature exists.
				const merged = [];
				for (const p of many) {
					const part = store[p];
					if (part && part.length) for (const r of part) merged.push(r);
				}
				remembered = merged.length ? merged : null;
			} else {
				remembered = store[at];
			}
		} catch (_) { wsCatch('openManuscriptModal / loadTicks: const store = await this.structureRead();', _); }
		if (remembered && remembered.length) {
			const applied = plugin.exportApplyRemembered(list, remembered);
			ticks = applied.chosen;
		} else {
			ticks = new Set(list.map(f => f.path));
		}
		ticksFor = cacheKey;
		try { plugin.orgTicksSchedule(); } catch (_) { wsCatch('loadTicks: this.orgTicksSchedule();', _); }
		return ticks;
	};
	const remember = () => {
		// Obsidian's tree carries the same ticks (A254-1c): every change
		// asks for one repaint there, on the next frame.
		try { plugin.orgTicksSchedule(); } catch (_) { wsCatch('rememberTicks: this.orgTicksSchedule();', _); }
		// Debounced: a writer unticking twelve scenes should cause one
		// write, not twelve.
		if (tickTimer) window.clearTimeout(tickTimer);
		tickTimer = window.setTimeout(() => {
			const many = d.scopes();
			if (many && many.length > 1) {
				// ONE SECTION PER FOLDER, never a composite key — and never
				// under a NOTE'S path (A363): a note added as a place is one
				// file; its tick is in the store already, under the folder
				// that holds it, or not at all.
				for (const p of many) {
					if (/\.md$/i.test(String(p))) continue;
					const rows = plugin.exportGather(p).map(f => ({
						path: f.path, on: !ticks || ticks.has(f.path)
					}));
					void plugin.structureWriteSection(p, rows);
				}
				return;
			}
			const at = d.scope();
			const rows = plugin.exportGather(at).map(f => ({
				path: f.path, on: !ticks || ticks.has(f.path)
			}));
			void plugin.structureWriteSection(at, rows);
		}, 400);
	};
	// PLACES FROM ANYWHERE (A363, writer 2026-09-13: "in export i cant add
	// more files or folders - only from the folder that i've opened exporter
	// in. remove this behaviour, i want to add files and folder from
	// different places"). The scope list already takes several folders from
	// the explorer's multi-select; these two doors let a tick in the tree
	// add a folder or a note to it (A381), and take one out. The vault root
	// is everything already, so nothing is added to it.
	// Every gathered note on, or every one off (A415, the button beside
	// "Export as"). The same remember and redraw a row's box goes through.
	const setAll = (on: boolean) => {
		if (!ticks) return false;
		for (const f of files()) { if (on) ticks.add(f.path); else ticks.delete(f.path); }
		remember();
		d.redraw();
		return true;
	};
	// Exactly these go out (A415-b, "Export this" / "Export these" from the
	// tree): every gathered note under a folder given, a note given, and
	// nothing else. Read first, so the set lands on the vault's list.
	const setOnly = (paths: string[]) => {
		const want = (Array.isArray(paths) ? paths : [paths])
			.map((p) => (p == null || p === '/') ? '' : String(p)).filter((p) => p !== '');
		return Promise.resolve(load()).then(() => {
			if (!ticks) return false;
			ticks.clear();
			for (const f of files()) {
				const p = f.path;
				if (want.some((w) => p === w || p.indexOf(w + '/') === 0)) ticks.add(p);
			}
			remember();
			d.redraw();
			return true;
		}, () => false);
	};
	// TOMBSTONE (A415-b, writer 2026-09-15: "remove the folder behaviour of
	// the export"): `placeAdd` and `placeDrop` — the export's "places", a
	// folder or a note from anywhere joining the scope (A363, A381). The
	// export is the vault; a box is a tick and nothing more.
	// THE DOOR OBSIDIAN'S TREE PAINTS ITS BOXES THROUGH (A254-1c): what a
	// row's box shows, and what a click on it does.
	const door = {
		wanted: () => d.wanted(),
		state: (path: string | null, kind: string) => {
			if (!ticks) return null;
			const mine = wsUnderRow(index(), path, kind);
			if (!mine.length) return { mine: 0, all: false, some: false };
			const on = mine.filter((p) => ticks.has(p)).length;
			return { mine: mine.length, all: on === mine.length, some: on > 0 && on < mine.length };
		},
		toggle: (path: string | null, kind: string) => {
			if (!ticks) return false;
			const mine = wsUnderRow(index(), path, kind);
			// (A row outside the export's places used to JOIN them here; the
			// places went at A415-b. Every note's box is real.)
			const on = mine.filter((p) => ticks.has(p)).length;
			const next = on !== mine.length;
			for (const p of mine) { if (next) ticks.add(p); else ticks.delete(p); }
			remember();
			d.redraw();
			return true;
		}
	};
	return { files, load, remember, index, dropIndex, forget, setAll, setOnly, door, current: () => ticks };
};
