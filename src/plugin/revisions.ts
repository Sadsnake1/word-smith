// Word-Smith — Revisions: a note's past, kept in the plugin's folder (#118): saving one, the automatic ones, Keep, a note
// that moves taking its revisions along, the deleted notes, cleaning up, File recovery's versions, and the one menu the
// Powermenu's row, {revisions} and the commands open.
//
// Part of the plugin class, cut out by area: the
// methods below are assigned onto WordSmith.prototype at the end of plugin.ts
// and declared on the class there, so every `this.x()` reaches them exactly
// as before, from any file. `this` is the plugin.

import { MarkdownView, Notice, TFile, TFolder, setIcon } from 'obsidian';
import type { Menu } from 'obsidian';
import type { TAbstractFile } from 'obsidian';
import type { WsFileLike, WsMenuPickItem } from '../core/settings';
import { wsCatch, wsIconPick, wsIsFolder } from '../core/preamble';
import { wsT } from '../core/ui-text';
import { WS_REV_DIR, wsNameStamp, wsRevNewestFirst, wsRevFolder, wsRevIsPath, wsRevNoteOf, wsRevParse, wsRevSerialize, wsRevStamp, wsRevStampTime, wsRevTracked } from '../core/revisions-core';
import type { WsRevKind, WsRevMeta } from '../core/revisions-core';
import type WordSmith from './plugin';

// one revision as the picker and the view read it; a File recovery version is one too, kept by Obsidian, not by us
export interface WsRevEntry { path: string; taken: number; kind: WsRevKind | 'recovery'; name: string; words: number }
export const WS_REV_VIEW = 'word-smith-revisions';
// an open note's editor, as much of Obsidian's as a revision needs: its text, and an edit its Undo takes back
export interface WsRevEditor { getValue(): string; replaceRange?(text: string, from: unknown, to?: unknown): void; offsetToPos?(offset: number): unknown }
// the intervals, in minutes, by their setting
const EVERY: Record<string, number> = { '10': 10, '30': 30, '60': 60, day: 24 * 60 };

export const revisionsMethods = {
	// THE SAVE ALWAYS ASKS (the writer: "a popup ... with the name and timestamp by default, that people can change the
	// name"): the note's name and the moment, selected, so typing replaces it and Enter keeps it. A window of the
	// plugin's own (`wsModal`), so an unload closes it.
	revNameAsk(this: WordSmith, o: { title: string; sub: string; value: string; ok: string }, done: (name: string | null) => void) {
		const m = this.wsModal();
		if (!m) return;
		m.modalEl.addClass('ws-rev-name');
		m.titleEl.setText(o.title);
		if (o.sub) m.contentEl.createDiv({ cls: 'ws-rev-name-sub', text: o.sub });
		const inp = m.contentEl.createEl('input', { cls: 'ws-rev-name-input', attr: { type: 'text', placeholder: wsT('A name for it') } });
		inp.value = o.value;
		const row = m.contentEl.createDiv({ cls: 'modal-button-container' });
		const cancel = row.createEl('button', { text: wsT('Cancel') });
		const ok = row.createEl('button', { cls: 'mod-cta', text: o.ok });
		let sent = false;
		const send = (v: string | null) => { if (sent) return; sent = true; m.close(); done(v); };
		ok.addEventListener('click', () => send(inp.value.trim() || o.value));
		cancel.addEventListener('click', () => send(null));
		inp.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); send(inp.value.trim() || o.value); } });
		// …and shut any other way (Escape, the ×), it saves nothing
		const was = m.onClose.bind(m);
		m.onClose = () => { if (!sent) { sent = true; done(null); } was(); };
		m.open();
		window.setTimeout(() => { inp.focus(); inp.select(); }, 0);
	},
	// A QUESTION BEFORE ANYTHING GOES: how many, and that it goes to the trash
	revConfirm(this: WordSmith, q: string, sub: string, okLabel: string, run: () => void) {
		const m = this.wsModal();
		if (!m) return;
		m.titleEl.setText(q);
		m.contentEl.createDiv({ cls: 'ws-rev-name-sub', text: sub });
		const row = m.contentEl.createDiv({ cls: 'modal-button-container' });
		row.createEl('button', { text: wsT('Cancel') }).addEventListener('click', () => m.close());
		row.createEl('button', { cls: 'mod-warning', text: okLabel }).addEventListener('click', () => { m.close(); run(); });
		m.open();
	},
	// AN OPEN REVISIONS TAB FOLLOWS ITS NOTE as it is typed in or saved, and a revision saved or deleted: one subscription
	// of the plugin's (wsWireVault, wsWireWorkspace) reaching every open tab
	revViewsChanged(this: WordSmith, path: string) {
		if (!path) return;
		try {
			this.app.workspace.getLeavesOfType(WS_REV_VIEW).forEach((l) => {
				const v = l.view as unknown as { note?: string; redrawSoon?: () => void };
				if (v && v.redrawSoon && (v.note === path || this.revIsPath(path))) v.redrawSoon();
			});
		} catch (_) { wsCatch('revViewsChanged', _); }
	},
	// ── WHERE THEY ARE ──────────────────────────────────────────────────────────────────────────────────────────────
	// THE PLUGIN'S FOLDER, where its stores are (the writer may have moved them): ws-structure.md's folder
	revOwnDir(this: WordSmith): string {
		const p = String(this.settings.structurePath || 'Word-Smith/ws-structure.md');
		const cut = p.lastIndexOf('/');
		return cut > 0 ? p.slice(0, cut) : '';
	},
	revRoot(this: WordSmith): string { const d = this.revOwnDir(); return (d ? d + '/' : '') + WS_REV_DIR; },
	revIsPath(this: WordSmith, path: string): boolean { return !!path && wsRevIsPath(this.revOwnDir(), String(path)); },
	revOn(this: WordSmith): boolean { return !!(this.settings && this.settings.revisionsOn); },
	// a note automatic revisions are taken of: a note, not one of ours, in a place the writer chose
	revTracked(this: WordSmith, path: string): boolean {
		if (!this.revOn() || !/\.md$/i.test(String(path)) || this.revIsPath(path) || this.isStoreFile(path)) return false;
		return wsRevTracked(path, this.settings.revisionPaths || [], this.settings.revisionExcept || []);
	},

	// ── A NOTE'S REVISIONS ──────────────────────────────────────────────────────────────────────────────────────────
	// newest first, by their names (the moment); the folder read from the vault's own index, so it costs nothing
	revFiles(this: WordSmith, notePath: string): TFile[] {
		const f = this.app.vault.getAbstractFileByPath(wsRevFolder(this.revOwnDir(), notePath));
		if (!(f instanceof TFolder)) return [];
		return f.children
			.filter((c): c is TFile => c instanceof TFile && wsRevStampTime(c.name) !== null)
			.sort(wsRevNewestFirst);
	},
	revCount(this: WordSmith, notePath: string): number { return this.revFiles(notePath).length; },
	// A REVISION'S HEADER, read once and kept until the file changes (its size and time on disk)
	async revMeta(this: WordSmith, f: TFile): Promise<WsRevMeta | null> {
		const key = f.path + '\n' + (f.stat ? f.stat.mtime + ':' + f.stat.size : '');
		const cache = this._revMeta || (this._revMeta = new Map<string, WsRevMeta | null>());
		if (cache.has(key)) return cache.get(key) || null;
		let meta: WsRevMeta | null = null;
		try { const p = wsRevParse(await this.app.vault.cachedRead(f)); meta = p ? p.meta : null; } catch (_) { wsCatch('revMeta: cachedRead', _); }
		if (cache.size > 2000) cache.clear();
		cache.set(key, meta);
		return meta;
	},
	async revList(this: WordSmith, notePath: string): Promise<WsRevEntry[]> {
		const out: WsRevEntry[] = [];
		for (const f of this.revFiles(notePath)) {
			const m = await this.revMeta(f);
			out.push({ path: f.path, taken: (m && m.taken) || wsRevStampTime(f.name) || 0, kind: m ? m.kind : 'auto', name: m ? m.name : '', words: m ? m.words : 0 });
		}
		return out;
	},
	async revText(this: WordSmith, entry: WsRevEntry): Promise<string> {
		if (entry.kind === 'recovery') { const r = (this._revRecovery || new Map<string, string>()).get(entry.path); return r || ''; }
		const f = this.app.vault.getAbstractFileByPath(entry.path);
		if (!(f instanceof TFile)) return '';
		const p = wsRevParse(await this.app.vault.read(f));
		return p ? p.text : '';
	},
	// THE NOTE'S TEXT NOW: an open editor's, which may be ahead of the disk, or the file's
	async revNoteText(this: WordSmith, notePath: string): Promise<string | null> {
		const ed = this.revEditorOf(notePath);
		if (ed) return ed.getValue();
		const f = this.app.vault.getAbstractFileByPath(notePath);
		return f instanceof TFile ? this.app.vault.read(f) : null;
	},
	revEditorOf(this: WordSmith, notePath: string): WsRevEditor | null {
		const found: WsRevEditor[] = [];
		try {
			this.app.workspace.iterateAllLeaves((leaf) => {
				const v = leaf.view as unknown as { file?: { path: string }; editor?: WsRevEditor; getViewType?(): string };
				if (v && v.getViewType && v.getViewType() === 'markdown' && v.file && v.file.path === notePath && v.editor) found.push(v.editor);
			});
		} catch (_) { wsCatch('revEditorOf: iterateAllLeaves', _); }
		return found[0] || null;
	},

	// ── SAVING ONE ──────────────────────────────────────────────────────────────────────────────────────────────────
	// NEVER A COPY OF THE LAST ONE: a text the newest revision already holds saves nothing (and says so, by hand)
	async revSave(this: WordSmith, notePath: string, kind: WsRevKind, name: string): Promise<string | null> {
		const text = await this.revNoteText(notePath);
		if (text == null) return null;
		const newest = this.revFiles(notePath)[0];
		if (newest) {
			try { const p = wsRevParse(await this.app.vault.read(newest)); if (p && p.text === text) return null; } catch (_) { wsCatch('revSave: read the newest', _); }
		}
		const dir = wsRevFolder(this.revOwnDir(), notePath);
		await this.revEnsureFolder(dir);
		const now = new Date();
		// A SECOND ONE IN THE SAME SECOND takes one past the highest there, never a number Keep has just freed: a reused -2
		// sorted as the oldest, and the next prune threw away the newest
		const stamp = wsRevStamp(now);
		let path = dir + '/' + stamp + '.md';
		const same = this.revFiles(notePath).filter((f) => f.name === stamp + '.md' || f.name.startsWith(stamp + '-'));
		if (same.length || this.app.vault.getAbstractFileByPath(path)) {
			let k = 1;
			// (the suffix after the stamp: "15-30.md" ends in -30 and is the first of its minute)
			for (const f of same) { const m = /^-(\d+)\.md$/.exec(f.name.slice(stamp.length)); k = Math.max(k, m ? Number(m[1]) : 1); }
			path = dir + '/' + stamp + '-' + (k + 1) + '.md';
			while (this.app.vault.getAbstractFileByPath(path)) path = dir + '/' + stamp + '-' + (++k + 1) + '.md';
		}
		await this.app.vault.create(path, wsRevSerialize({ note: notePath, taken: now.getTime(), kind, name, words: this.countWords(text) }, text));
		if (kind === 'auto') await this.revPrune(notePath);
		this.revChanged();
		return path;
	},
	async revEnsureFolder(this: WordSmith, dir: string) {
		const bits = dir.split('/');
		let acc = '';
		for (const b of bits) {
			acc = acc ? acc + '/' + b : b;
			if (!this.app.vault.getAbstractFileByPath(acc)) {
				try { await this.app.vault.createFolder(acc); } catch (_) { wsCatch('revEnsureFolder: createFolder', _); }
			}
		}
	},
	// BY HAND: the popup, the note's name and the moment ready to keep or change
	revSavePrompt(this: WordSmith, notePath?: string) {
		const path = notePath || this.revActivePath();
		if (!path) { new Notice(wsT('Word-Smith: open a note to save a revision of it.')); return; }
		const base = path.split('/').pop()!.replace(/\.md$/i, '');
		const when = new Date();
		const def = base + ' ' + wsNameStamp(when);
		this.revNameAsk({ title: wsT('Save a revision'), sub: wsT('{note} as it is now. Yours are kept until you delete them.', { note: base }), value: def, ok: wsT('Save revision') }, (name) => {
			if (name == null) return;
			void this.revSave(path, 'yours', name).then((saved) => {
				new Notice(saved ? wsT('Word-Smith: revision saved ({name})', { name }) : wsT('Word-Smith: nothing changed since the last revision.'));
				if (saved) this.revGlint();
			}).catch((e: unknown) => { wsCatch('revSavePrompt: revSave', e); new Notice(wsT('Word-Smith: the revision could not be saved.')); });
		});
	},
	// A FOLDER, every note in it at once, under one name
	revSaveFolderPrompt(this: WordSmith, folderPath: string) {
		const notes = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folderPath + '/') && !this.revIsPath(f.path) && !this.isStoreFile(f.path));
		if (!notes.length) { new Notice(wsT('Word-Smith: no notes in this folder.')); return; }
		const base = folderPath.split('/').pop() || folderPath;
		const def = base + ' ' + wsNameStamp(new Date());
		this.revNameAsk({ title: wsT('Save a revision of every note'), sub: wsT(notes.length === 1 ? '{folder}: {n} note, saved under this name.' : '{folder}: {n} notes, saved together under one name.', { folder: folderPath, n: notes.length }), value: def, ok: wsT(notes.length === 1 ? 'Save {n} revision' : 'Save {n} revisions', { n: notes.length }) }, (name) => {
			if (name == null) return;
			void (async () => {
				let saved = 0;
				for (const f of notes) { try { if (await this.revSave(f.path, 'yours', name)) saved++; } catch (_) { wsCatch('revSaveFolderPrompt: revSave', _); } }
				new Notice(wsT(saved === 1 ? 'Word-Smith: {n} revision saved ({name})' : 'Word-Smith: {n} revisions saved ({name})', { n: saved, name }));
				if (saved) this.revGlint();
			})();
		});
	},
	revActivePath(this: WordSmith): string {
		try { const f = this.revFrontFile() || this.activeNoteFile(); return f && /\.md$/i.test(f.path) && !this.revIsPath(f.path) ? f.path : ''; } catch { return ''; }
	},
	// THE REVISIONS TAB IN FRONT stands for its note: the drawer's Save and Compare are that note's (the bar stands down there:
	// the writer, "remove the powerline from the revisions it's useless")
	revFrontFile(this: WordSmith): TFile | null {
		try {
			const ws = this.app.workspace;
			if (ws.getActiveViewOfType(MarkdownView)) return null;
			const leaf = ws.getMostRecentLeaf();
			const v = leaf && leaf.view;
			if (!v || v.getViewType() !== WS_REV_VIEW) return null;
			const note = (v as unknown as { note?: string }).note;
			const f = note ? this.app.vault.getAbstractFileByPath(note) : null;
			return f instanceof TFile ? f : null;
		} catch { return null; }
	},

	// ── KEEP ────────────────────────────────────────────────────────────────────────────────────────────────────────
	// THE AUTOMATIC ONES ONLY: yours are kept until you delete them. Past the number the oldest go to the
	// trash, Obsidian's own (its setting decides which), never deleted for good
	async revPrune(this: WordSmith, notePath: string) {
		const keep = String(this.settings.revisionsKeep || '20');
		if (keep === 'all') return;
		const autos: TFile[] = [];
		for (const f of this.revFiles(notePath)) {
			const m = await this.revMeta(f);
			if (m && m.kind === 'auto') autos.push(f);
		}
		const gone = autos.slice(Math.max(0, Number(keep) || 20));
		for (const f of gone) { try { await this.app.fileManager.trashFile(f); } catch (_) { wsCatch('revPrune: trashFile', _); } }
	},

	// ── AUTOMATIC ───────────────────────────────────────────────────────────────────────────────────────────────────
	// A NOTE THAT CHANGED is marked; once a minute each marked note whose newest revision is older than the interval
	// gets one. A note only read, or left open, gets none.
	revNoteChanged(this: WordSmith, file: TAbstractFile) {
		if (!file || wsIsFolder(file) || !this.revTracked(file.path)) return;
		const dirty = this._revDirty || (this._revDirty = new Set<string>());
		dirty.add(file.path);
	},
	async revAutoTick(this: WordSmith) {
		if (this._unloaded || !this.revOn() || !this._revDirty || !this._revDirty.size) return;
		const mins = EVERY[String(this.settings.revisionsEvery || '30')];
		if (!mins) return;
		const now = Date.now();
		for (const path of Array.from(this._revDirty)) {
			if (!this.revTracked(path)) { this._revDirty.delete(path); continue; }
			const newest = this.revFiles(path)[0];
			const last = newest ? wsRevStampTime(newest.name) || 0 : 0;
			if (now - last < mins * 60000) continue;
			this._revDirty.delete(path);
			try { await this.revSave(path, 'auto', ''); } catch (_) { wsCatch('revAutoTick: revSave', _); }
		}
	},

	// ── A NOTE THAT MOVES TAKES ITS REVISIONS ───────────────────────────────────────────────────────────────────────
	// a note renamed or moved, or a folder of them: the revisions' folder goes the same way, so its history is never lost
	async revFollowRename(this: WordSmith, file: TAbstractFile, oldPath: string) {
		if (!file || this.revIsPath(file.path) || this.revIsPath(oldPath)) return;
		const own = this.revOwnDir();
		const isFolder = wsIsFolder(file);
		if (!isFolder && !/\.md$/i.test(oldPath)) return;
		const from = isFolder ? (own ? own + '/' : '') + WS_REV_DIR + '/' + oldPath : wsRevFolder(own, oldPath);
		const to = isFolder ? (own ? own + '/' : '') + WS_REV_DIR + '/' + file.path : wsRevFolder(own, file.path);
		const src = this.app.vault.getAbstractFileByPath(from);
		if (!src || !wsIsFolder(src) || this.app.vault.getAbstractFileByPath(to)) return;
		const cut = to.lastIndexOf('/');
		if (cut > 0) await this.revEnsureFolder(to.slice(0, cut));
		try { await this.app.fileManager.renameFile(src, to); } catch (_) { wsCatch('revFollowRename: renameFile', _); }
		this.revChanged();
	},

	// ── DELETED NOTES ───────────────────────────────────────────────────────────────────────────────────────────────
	// A NOTE DELETED KEEPS ITS REVISIONS, so a chapter deleted by mistake can come back: every folder of revisions whose
	// note is gone
	revDeleted(this: WordSmith): { note: string; files: TFile[] }[] {
		const out: { note: string; files: TFile[] }[] = [];
		const root = this.app.vault.getAbstractFileByPath(this.revRoot());
		const own = this.revOwnDir();
		const walk = (node: TAbstractFile | null) => {
			if (!(node instanceof TFolder)) return;
			const files = node.children.filter((c): c is TFile => c instanceof TFile && wsRevStampTime(c.name) !== null);
			if (files.length) {
				const note = wsRevNoteOf(own, node.path);
				if (note && !this.app.vault.getAbstractFileByPath(note)) out.push({ note, files: files.sort(wsRevNewestFirst) });
			}
			for (const c of node.children) walk(c);
		};
		walk(root);
		return out;
	},
	async revRestoreDeleted(this: WordSmith, note: string) {
		const d = this.revDeleted().find((x) => x.note === note);
		if (!d || !d.files.length) return false;
		const p = wsRevParse(await this.app.vault.read(d.files[0]));
		if (!p) return false;
		const cut = note.lastIndexOf('/');
		if (cut > 0) await this.revEnsureFolder(note.slice(0, cut));
		await this.app.vault.create(note, p.text);
		this.revChanged();
		return true;
	},

	// ── CLEANING UP ─────────────────────────────────────────────────────────────────────────────────────────────────
	// what there is: every revision file, its notes, its size
	revStats(this: WordSmith): { files: number; notes: number; bytes: number } {
		let files = 0, bytes = 0; const notes = new Set<string>();
		const own = this.revOwnDir();
		const walk = (node: TAbstractFile | null) => {
			if (!(node instanceof TFolder)) return;
			for (const c of node.children) {
				if (c instanceof TFolder) { walk(c); continue; }
				if (!(c instanceof TFile) || wsRevStampTime(c.name) === null) continue;
				files++; bytes += (c.stat && c.stat.size) || 0; notes.add(wsRevNoteOf(own, node.path));
			}
		};
		walk(this.app.vault.getAbstractFileByPath(this.revRoot()));
		return { files, notes: notes.size, bytes };
	},
	// every revision file there is, with its note, for the clean-ups to choose from
	revAllFiles(this: WordSmith): { f: TFile; note: string }[] {
		const out: { f: TFile; note: string }[] = [];
		const own = this.revOwnDir();
		const walk = (node: TAbstractFile | null) => {
			if (!(node instanceof TFolder)) return;
			for (const c of node.children) {
				if (c instanceof TFolder) walk(c);
				else if (c instanceof TFile && wsRevStampTime(c.name) !== null) out.push({ f: c, note: wsRevNoteOf(own, node.path) });
			}
		};
		walk(this.app.vault.getAbstractFileByPath(this.revRoot()));
		return out;
	},
	async revTrash(this: WordSmith, files: TFile[]): Promise<number> {
		let n = 0;
		for (const f of files) { try { await this.app.fileManager.trashFile(f); n++; } catch (_) { wsCatch('revTrash: trashFile', _); } }
		this.revChanged();
		return n;
	},
	// the automatic ones older than so many days; yours stay
	async revCleanOlder(this: WordSmith, days: number, dry?: boolean): Promise<number> {
		const cut = Date.now() - days * 86400000;
		const gone: TFile[] = [];
		for (const { f } of this.revAllFiles()) {
			const t = wsRevStampTime(f.name) || 0;
			if (t >= cut) continue;
			const m = await this.revMeta(f);
			if (m && m.kind === 'auto') gone.push(f);
		}
		return dry ? gone.length : this.revTrash(gone);
	},
	async revCleanDeleted(this: WordSmith, dry?: boolean): Promise<number> {
		const files = this.revDeleted().flatMap((d) => d.files);
		return dry ? files.length : this.revTrash(files);
	},
	async revCleanAll(this: WordSmith): Promise<number> { return this.revTrash(this.revAllFiles().map((x) => x.f)); },
	async revCleanNote(this: WordSmith, notePath: string, autosOnly: boolean): Promise<number> {
		const gone: TFile[] = [];
		for (const f of this.revFiles(notePath)) {
			if (!autosOnly) { gone.push(f); continue; }
			const m = await this.revMeta(f);
			if (m && m.kind === 'auto') gone.push(f);
		}
		return this.revTrash(gone);
	},
	// NAMING ONE MAKES IT YOURS, kept until you delete it (the file rewritten with its new header, its text as it was)
	async revRename(this: WordSmith, path: string, name: string) {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return;
		const p = wsRevParse(await this.app.vault.read(f));
		if (!p) return;
		await this.app.vault.modify(f, wsRevSerialize(Object.assign({}, p.meta, { name, kind: name ? 'yours' : p.meta.kind }), p.text));
		this.revChanged();
	},

	// ── FILE RECOVERY'S OWN VERSIONS (Obsidian's core plugin), listed after ours, kept on this device only ──
	async revRecovery(this: WordSmith, notePath: string): Promise<WsRevEntry[]> {
		if (!this.settings.revisionsRecovery) return [];
		try {
			const ip = this.app.internalPlugins;
			const fr = ip && typeof ip.getEnabledPluginById === 'function' ? ip.getEnabledPluginById('file-recovery') : null;
			const db = fr && fr.db;
			if (!db) return [];
			const all = await db.transaction('backups', 'readonly').store.index('path').getAll(notePath);
			const keep = this._revRecovery || (this._revRecovery = new Map<string, string>());
			return (all || []).filter((b) => b && typeof b.data === 'string').sort((a, b) => b.ts - a.ts).map((b) => {
				const key = 'file-recovery:' + notePath + ':' + b.ts;
				keep.set(key, b.data);
				return { path: key, taken: b.ts, kind: 'recovery' as const, name: '', words: this.countWords(b.data) };
			});
		} catch (_) { wsCatch('revRecovery: file-recovery', _); return []; }
	},

	// ── WHAT EVERYONE SHOWS AGAIN AFTER A CHANGE: the bar's count, the Organizer's column, an open compare ──
	revChanged(this: WordSmith) {
		try { this.updateRetroStatusBar(); } catch (_) { wsCatch('revChanged: updateRetroStatusBar', _); }
		try { this._orgIndexRing(); } catch (_) { wsCatch('revChanged: organizer', _); }
		try {
			this.app.workspace.getLeavesOfType(WS_REV_VIEW).forEach((l) => { const v = l.view as unknown as { redrawSoon?: () => void }; if (v && v.redrawSoon) v.redrawSoon(); });
		} catch (_) { wsCatch('revChanged: views', _); }
	},
	revGlint(this: WordSmith) {
		try {
			const b = document.querySelector('.ws-barbtn-revisions');
			if (b) { b.removeClass('is-glint'); void b.clientWidth; b.addClass('is-glint'); }
		} catch (_) { wsCatch('revGlint', _); }
	},
	// A MOMENT SAID SHORT: 11:20 today, Yesterday 22:05, Mon 2 Nov 21:40; with `long`, always the date
	revWhen(this: WordSmith, t: number, long?: boolean): string {
		const d = new Date(t), now = new Date();
		const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		if (!long && t >= day) return hm;
		if (!long && t >= day - 86400000) return wsT('Yesterday {time}', { time: hm });
		let date = '';
		try { date = d.toLocaleDateString(this.revLocale(), { weekday: long ? undefined : 'short', month: 'short', day: 'numeric' }); } catch { date = d.toDateString(); }
		return date + ', ' + hm;
	},
	revLocale(this: WordSmith): string { try { return document.documentElement.lang || 'en'; } catch { return 'en'; } },

	// ── THE ONE MENU: the Powermenu's row, {revisions} and the commands open it ──
	revMenuItems(this: WordSmith): WsMenuPickItem[] {
		const ic = (name: string) => () => { const e = createSpan(); try { setIcon(e, name); } catch (_) { wsCatch('revMenuItems: setIcon', _); } return e; };
		if (!this.revOn()) {
			return [{ label: wsT('Revisions are off: turn them on in Settings'), icon: ic('file-clock'), on: true, onClick: () => this.openOwnSettings() }];
		}
		const path = this.revActivePath();
		const items: WsMenuPickItem[] = [];
		items.push({ label: wsT('Save a revision'), icon: ic('save'), on: !!path, onClick: () => this.revSavePrompt(path) });
		// (the commands only: the revisions themselves are listed in the compare's own picker)
		items.push({ label: wsT('Compare revisions'), icon: ic(wsIconPick(['git-compare-arrows', 'git-compare'])), on: !!path && this.revCount(path) > 0, onClick: () => { if (path) void this.revOpen(path, '', true); } });
		const gone = this.revDeleted().length;
		items.push({ label: wsT('Deleted notes') + (gone ? ' (' + gone + ')' : ''), icon: ic(wsIconPick(['file-x', 'file-x-2', 'archive-restore'])), on: true, onClick: () => this.revDeletedModal() });
		return items;
	},
	// THE COMPARE, in a tab beside the note: `pick` the revision to show (the newest when none), `choose` opening its list
	async revOpen(this: WordSmith, notePath: string, pick?: string, choose?: boolean) {
		if (!notePath) return;
		let leaf = this.app.workspace.getLeavesOfType(WS_REV_VIEW).find((l) => { const st = l.getViewState().state as { note?: string } | undefined; return !!st && st.note === notePath; });
		if (!leaf) leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({ type: WS_REV_VIEW, active: true, state: { note: notePath, pick: pick || '', against: 'now', choose: !!choose } });
		await this.app.workspace.revealLeaf(leaf);
	},
	revDeletedModal(this: WordSmith) {
		const list = this.revDeleted();
		const m = this.wsModal();
		if (!m) return;
		m.titleEl.setText(wsT('Deleted notes'));
		m.contentEl.createDiv({ cls: 'ws-rev-name-sub', text: wsT('Notes you deleted that still have revisions. Restore brings one back where it was, as its last revision.') });
		if (!list.length) m.contentEl.createDiv({ cls: 'ws-rev-empty', text: wsT('None. A deleted note’s revisions stay here until you clean them up.') });
		for (const d of list) {
			const row = m.contentEl.createDiv({ cls: 'ws-rev-deleted-row' });
			const info = row.createDiv({ cls: 'ws-rev-deleted-info' });
			info.createDiv({ text: d.note.split('/').pop()!.replace(/\.md$/i, '') });
			info.createDiv({ cls: 'ws-rev-deleted-meta', text: d.note + ' · ' + wsT(d.files.length === 1 ? '{n} revision' : '{n} revisions', { n: d.files.length }) + ' · ' + this.revWhen(wsRevStampTime(d.files[0].name) || 0) });
			const b = row.createEl('button', { text: wsT('Restore') });
			b.addEventListener('click', () => { void this.revRestoreDeleted(d.note).then((ok) => { if (ok) { new Notice(wsT('Word-Smith: {note} restored', { note: d.note })); row.remove(); } }); });
		}
		m.open();
	},

	// ── THE FILE TREE'S RIGHT-CLICK ──
	revFileMenu(this: WordSmith, menu: Menu, file: WsFileLike) {
		if (!this.revOn() || !file || this.revIsPath(file.path) || this.isStoreFile(file.path)) return;
		const isFolder = !!file.children;
		if (!isFolder && !/\.md$/i.test(file.path)) return;
		menu.addSeparator();
		if (!isFolder) {
			menu.addItem((i) => i.setTitle(wsT('Save a revision…')).setIcon('save').onClick(() => this.revSavePrompt(file.path)));
			if (this.revCount(file.path)) menu.addItem((i) => i.setTitle(wsT('Compare revisions')).setIcon(wsIconPick(['git-compare-arrows', 'git-compare'])).onClick(() => { void this.revOpen(file.path); }));
		} else {
			menu.addItem((i) => i.setTitle(wsT('Save a revision of every note…')).setIcon('save').onClick(() => this.revSaveFolderPrompt(file.path)));
		}
		const paths = this.settings.revisionPaths || [], except = this.settings.revisionExcept || [];
		const p = file.path;
		if (paths.includes(p)) {
			menu.addItem((i) => i.setTitle(wsT('Stop keeping revisions')).setIcon('x').onClick(() => { void this.revSetTracked(p, 'untrack'); }));
		} else if (wsRevTracked(isFolder ? p + '/x.md' : p, paths, except)) {
			menu.addItem((i) => i.setTitle(wsT('Leave out of revisions')).setIcon('x').onClick(() => { void this.revSetTracked(p, 'except'); }));
		} else {
			menu.addItem((i) => i.setTitle(isFolder ? wsT('Keep revisions of this folder') : wsT('Keep revisions of this note')).setIcon('file-clock').onClick(() => { void this.revSetTracked(p, 'track'); }));
		}
	},
	async revSetTracked(this: WordSmith, path: string, how: 'track' | 'untrack' | 'except') {
		const s = this.settings;
		const paths = Array.isArray(s.revisionPaths) ? s.revisionPaths : (s.revisionPaths = []);
		const except = Array.isArray(s.revisionExcept) ? s.revisionExcept : (s.revisionExcept = []);
		if (how === 'track') { if (!paths.includes(path)) paths.push(path); s.revisionExcept = except.filter((e) => e !== path); }
		if (how === 'untrack') { s.revisionPaths = paths.filter((e) => e !== path); s.revisionExcept = except.filter((e) => !e.startsWith(path + '/')); }
		if (how === 'except' && !except.includes(path)) except.push(path);
		await this.saveSettings();
		new Notice(how === 'track' ? wsT('Word-Smith: revisions kept for {name}', { name: path.split('/').pop() || path }) : how === 'except' ? wsT('Word-Smith: {name} left out of revisions', { name: path.split('/').pop() || path }) : wsT('Word-Smith: no longer kept'));
	},
	// TURNED ON FOR THE FIRST TIME: the book (the Organizer's folder) chosen, or the whole vault without one
	revFirstOn(this: WordSmith) {
		const s = this.settings;
		if (!Array.isArray(s.revisionPaths) || !s.revisionPaths.length) s.revisionPaths = [String(s.organizerFolder || '') || '/'];
	},
	// THE CLEAN-UP, from Settings: what there is, then three ways to make it less, each asked before it goes to the trash
	revCleanupModal(this: WordSmith, after?: () => void) {
		const m = this.wsModal();
		if (!m) return;
		const st = this.revStats();
		m.titleEl.setText(wsT('Clean up revisions'));
		m.contentEl.createDiv({ cls: 'ws-rev-name-sub', text: wsT(st.files === 1 ? '{n} revision' : '{n} revisions', { n: st.files }) + ', ' + wsT(st.notes === 1 ? '{n} note' : '{n} notes', { n: st.notes }) + ', ' + this.revSize(st.bytes) + '. ' + wsT('Everything goes to Obsidian’s trash.') });
		const row = (title: string, sub: () => Promise<string>, label: string, warn: boolean, run: () => void, extra?: (el: HTMLElement) => void) => {
			const r = m.contentEl.createDiv({ cls: 'ws-rev-clean-row' });
			const info = r.createDiv({ cls: 'ws-rev-clean-info' });
			const t = info.createDiv({ text: title });
			if (extra) extra(t);
			const n = info.createDiv({ cls: 'ws-rev-deleted-meta', text: '…' });
			const paint = () => { void sub().then((s) => { n.setText(s); }); };
			paint();
			r.createEl('button', { cls: warn ? 'mod-warning' : '', text: label }).addEventListener('click', run);
			return paint;
		};
		let days = 30;
		const paintOld = row(wsT('Automatic revisions older than'), async () => { const n = await this.revCleanOlder(days, true); return wsT(n === 1 ? '{n} revision; yours stay' : '{n} revisions; yours stay', { n }); }, wsT('Delete'), false, () => {
			void this.revCleanOlder(days, true).then((n) => this.revConfirm(wsT(n === 1 ? 'Delete {n} automatic revision?' : 'Delete {n} automatic revisions?', { n }), wsT('Yours stay. They go to Obsidian’s trash.'), wsT('Delete'), () => {
				void this.revCleanOlder(days).then((k) => { new Notice(wsT(k === 1 ? 'Word-Smith: {n} revision deleted' : 'Word-Smith: {n} revisions deleted', { n: k })); m.close(); if (after) after(); });
			}));
		}, (el) => {
			const sel = el.createEl('select', { cls: 'dropdown ws-rev-clean-age' });
			for (const [v, l] of [[7, wsT('a week')], [30, wsT('a month')], [90, wsT('three months')]] as const) sel.createEl('option', { text: l, value: String(v) });
			sel.value = '30';
			sel.addEventListener('change', () => { days = Number(sel.value) || 30; paintOld(); });
		});
		row(wsT('Revisions of deleted notes'), async () => { const n = await this.revCleanDeleted(true); return wsT(n === 1 ? '{n} revision' : '{n} revisions', { n }); }, wsT('Delete'), false, () => {
			this.revConfirm(wsT('Delete the revisions of deleted notes?'), wsT('You can no longer restore those notes. They go to Obsidian’s trash.'), wsT('Delete'), () => {
				void this.revCleanDeleted().then((k) => { new Notice(wsT(k === 1 ? 'Word-Smith: {n} revision deleted' : 'Word-Smith: {n} revisions deleted', { n: k })); m.close(); if (after) after(); });
			});
		});
		row(wsT('Every revision'), async () => wsT(st.files === 1 ? '{n} revision, yours too' : '{n} revisions, yours too', { n: st.files }), wsT('Delete all…'), true, () => {
			this.revConfirm(wsT('Delete every revision?'), wsT('All of them, yours too. They go to Obsidian’s trash.'), wsT('Delete all'), () => {
				void this.revCleanAll().then((k) => { new Notice(wsT(k === 1 ? 'Word-Smith: {n} revision deleted' : 'Word-Smith: {n} revisions deleted', { n: k })); m.close(); if (after) after(); });
			});
		});
		m.open();
	},
	revSize(this: WordSmith, bytes: number): string {
		return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
	},
};

export type RevisionsMethods = typeof revisionsMethods;
