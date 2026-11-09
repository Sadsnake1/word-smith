// Word-Smith — the scratch pad: a note of its own beside every note, in the right sidebar, as Scrivener keeps a
// document's notes beside it.
//
// Part of the plugin class, cut out by area: the methods below are assigned onto WordSmith.prototype at the end of
// plugin.ts and declared on the class there. `this` is the plugin.
//
// ONE PAD A NOTE, AT THE NOTE'S OWN PATH under the pads' folder (`scratchPadFolder`, `Word-Smith/Scratch pads` by
// default): `Book/Chapter 1/Scene 1.md` keeps its pad at `Word-Smith/Scratch pads/Book/Chapter 1/Scene 1.md`, so the
// pad's tab carries the scene's name and the pads read as the manuscript does. A rename or a move takes the pad along.
// A pad is an ordinary note in an ordinary markdown pane: links, formatting, everything a note can hold. Pads are
// never writing: no count, no goal, no history, no Organizer row, nothing compiled (isFileCounted, isOwnHidden).
//
// THE PANE FOLLOWS THE NOTE YOU'RE IN. Opened once (the command, or Settings → Manuscript → Scratch pad), it stays in
// the right sidebar; every note made current in the main area brings its own pad into it, made then if it has none.
// The pane is a markdown pane in the right sidebar showing a pad, so a reload finds it again by that alone.
import { MarkdownView, Notice, TFile, normalizePath } from 'obsidian';
import type { TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { wsCatch, wsIsFolder } from '../core/preamble';
import { wsT } from '../core/ui-text';
import type WordSmith from './plugin';

const WS_SCRATCH_DEFAULT = 'Word-Smith/Scratch pads';

export const scratchMethods = {

	// the pads' folder, written as the vault writes paths; never the vault's root, where every note would be a pad
	scratchRoot(this: WordSmith): string {
		const raw = String(this.settings.scratchPadFolder || '').trim().replace(/^\/+|\/+$/g, '');
		const p = raw ? normalizePath(raw) : '';
		return p && p !== '/' ? p : WS_SCRATCH_DEFAULT;
	},
	isScratchPath(this: WordSmith, path: string): boolean {
		if (!path) return false;
		const root = this.scratchRoot();
		return path === root || path.startsWith(root + '/');
	},
	scratchPathFor(this: WordSmith, notePath: string): string {
		return this.scratchRoot() + '/' + notePath;
	},
	// a note that has a pad: markdown, not a pad itself, not one of the plugin's own files
	scratchWants(this: WordSmith, file: TAbstractFile | null | undefined): file is TFile {
		return file instanceof TFile && file.extension === 'md' && !this.isScratchPath(file.path) && !this.isStoreFile(file.path);
	},

	// THE PANE: the one this opened, while it is still in the right sidebar; else, after a reload, a markdown pane there
	// showing a pad
	scratchLeaf(this: WordSmith): WorkspaceLeaf | null {
		const ws = this.app.workspace;
		const leaves = ws.getLeavesOfType('markdown');
		// (getRoot guarded as reviveMenuPanel guards it: a pane being built or taken down can throw)
		const right = (leaf: WorkspaceLeaf) => { try { return leaf.getRoot() === ws.rightSplit; } catch (_) { wsCatch('scratchLeaf: leaf.getRoot()', _); return false; } };
		const was = this._scratchLeaf;
		if (was && leaves.indexOf(was) !== -1 && right(was)) return was;
		this._scratchLeaf = null;
		for (const leaf of leaves) {
			if (!right(leaf)) continue;
			if (this.isScratchPath(this.scratchLeafPath(leaf))) { this._scratchLeaf = leaf; return leaf; }
		}
		return null;
	},
	// the file a pane shows, read from its state, so a pane not drawn yet (a sidebar tab behind another) answers too
	scratchLeafPath(this: WordSmith, leaf: WorkspaceLeaf): string {
		try {
			const st = leaf.getViewState().state;
			return st && typeof st.file === 'string' ? st.file : '';
		} catch (_) { wsCatch('scratchLeafPath: leaf.getViewState()', _); return ''; }
	},
	// the note in the main area now: a markdown note in the main area or a window of its own, never a sidebar's
	scratchMainNote(this: WordSmith): TFile | null {
		const ws = this.app.workspace;
		const v = ws.getActiveViewOfType(MarkdownView);
		if (!v || !v.file) return null;
		let root = null;
		try { root = v.leaf.getRoot(); } catch (_) { wsCatch('scratchMainNote: leaf.getRoot()', _); return null; }
		if (root === ws.rightSplit || root === ws.leftSplit) return null;
		return this.scratchWants(v.file) ? v.file : null;
	},

	// ── FOLLOWING ───────────────────────────────────────────────────────────
	//
	// On every note opened and every pane made current (wsWireWorkspace). Nothing while the pane is closed. A pane made
	// current that is not a note in the main area (the pad itself, a canvas, the Organizer) leaves the pad as it is. One
	// switch at a time, and a quick run of switches lands on the last.
	//
	// NOT BEFORE THE LAYOUT IS READY: while Obsidian opens (and closes) a window, panes are made current while they are
	// still being built; the pad catches up once it is ready (wsWireWorkspace). NEVER THROWS into the handler that
	// called it: those are guarded, and a throw there is the writer's "something went wrong" notice.
	scratchFollow(this: WordSmith) {
		try {
			if (this._unloaded || !this.app.workspace.layoutReady) return;
			if (!this.scratchLeaf()) return;
			const note = this.scratchMainNote();
			if (!note) return;
			this._scratchWant = note.path;
			const run = () => this.scratchShow(note.path);
			this._scratchQueue = (this._scratchQueue || Promise.resolve()).then(run, run);
		} catch (_) { wsCatch('scratchFollow', _); }
	},
	async scratchShow(this: WordSmith, notePath: string) {
		try {
			if (this._unloaded || this._scratchWant !== notePath) return;
			const leaf = this.scratchLeaf();
			if (!leaf) return;
			const pad = await this.scratchEnsure(notePath);
			if (!pad || this._scratchWant !== notePath) return;
			if (this.scratchLeafPath(leaf) === pad.path) return;
			// (never made current: the caret stays in the note)
			await leaf.openFile(pad, { active: false });
		} catch (_) { wsCatch('scratchShow: ' + notePath, _); }
	},
	// a note's pad, made empty if it has none yet; null when a folder sits where the pad would be
	async scratchEnsure(this: WordSmith, notePath: string): Promise<TFile | null> {
		const vault = this.app.vault;
		const path = this.scratchPathFor(notePath);
		const there = vault.getAbstractFileByPath(path);
		if (there) return there instanceof TFile ? there : null;
		await this.scratchFolderEnsure(path.slice(0, path.lastIndexOf('/')));
		try {
			return await vault.create(path, '');
		} catch (e) {
			// (made a moment ago by sync from another device)
			const now = vault.getAbstractFileByPath(path);
			if (now instanceof TFile) return now;
			throw e;
		}
	},
	// every missing folder on the way, one at a time
	async scratchFolderEnsure(this: WordSmith, dir: string) {
		const vault = this.app.vault;
		let cur = '';
		for (const part of dir.split('/')) {
			if (!part) continue;
			cur = cur ? cur + '/' + part : part;
			const f = vault.getAbstractFileByPath(cur);
			if (f) { if (!wsIsFolder(f)) throw new Error('a file sits where the folder ' + cur + ' goes'); continue; }
			try { await vault.createFolder(cur); } catch (e) { if (!vault.getAbstractFileByPath(cur)) throw e; }
		}
	},

	// ── OPENING AND CLOSING ─────────────────────────────────────────────────

	// The pane in the right sidebar with the current note's pad, or brought forward if it is open; `focus` puts the caret
	// in the pad, to write there at once
	async scratchOpen(this: WordSmith, focus?: boolean) {
		try {
			const ws = this.app.workspace;
			const note = this.scratchMainNote();
			let leaf = this.scratchLeaf();
			if (!leaf && !note) {
				new Notice('Word-Smith: ' + wsT('open a note first: its scratch pad opens beside it.'), 5000);
				return;
			}
			if (!leaf) {
				leaf = ws.getRightLeaf(false);
				if (!leaf) { new Notice('Word-Smith: ' + wsT('there is no right sidebar to open the scratch pad in.'), 5000); return; }
				this._scratchLeaf = leaf;
			}
			if (note) {
				this._scratchWant = note.path;
				const pad = await this.scratchEnsure(note.path);
				if (pad && this.scratchLeafPath(leaf) !== pad.path) await leaf.openFile(pad, { active: false });
			}
			await ws.revealLeaf(leaf);
			if (focus) ws.setActiveLeaf(leaf, { focus: true });
		} catch (_) { wsCatch('scratchOpen', _); }
	},
	// the pane opened, or closed if it is open
	scratchToggle(this: WordSmith) {
		const leaf = this.scratchLeaf();
		if (leaf) { leaf.detach(); return; }
		void this.scratchOpen(false);
	},

	// ── A NOTE RENAMED OR MOVED: ITS PAD GOES WITH IT ───────────────────────
	//
	// A folder takes its pads' folder along. Obsidian may report the notes inside a renamed folder as well as the
	// folder, in whatever order: whichever arrives first moves what it finds, the rest find nothing left to move, and
	// a pad already at the new place is never overwritten.
	scratchRenamed(this: WordSmith, file: TAbstractFile, oldPath: string) {
		if (!file || !oldPath || file.path === oldPath) return;
		// (a pad moved by hand, or into or out of the pads' folder: nothing to follow)
		if (this.isScratchPath(oldPath) || this.isScratchPath(file.path)) return;
		const vault = this.app.vault;
		const from = this.scratchPathFor(oldPath), to = this.scratchPathFor(file.path);
		const pad = vault.getAbstractFileByPath(from);
		if (!pad) return;
		void (async () => {
			try {
				await this.scratchFolderEnsure(to.slice(0, to.lastIndexOf('/')));
				const at = vault.getAbstractFileByPath(to);
				if (!at) { await this.app.fileManager.renameFile(pad, to); return; }
				// a folder already there (its notes reported first): what is left moves in one at a time
				if (wsIsFolder(pad) && wsIsFolder(at)) {
					for (const kid of [...pad.children]) {
						const dest = to + kid.path.slice(from.length);
						if (!vault.getAbstractFileByPath(dest)) await this.app.fileManager.renameFile(kid, dest);
					}
				}
			} catch (_) { wsCatch('scratchRenamed: ' + oldPath + ' → ' + file.path, _); }
		})();
	},
};
export type ScratchMethods = typeof scratchMethods;
