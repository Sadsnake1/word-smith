// Word-Smith — the Revisions view (#118): a note against one of its revisions, in a tab beside it.
//
// THE COMPARE THE WRITER ASKED FOR ("the snapshot diff does not see the paragraphs correctly, but it reverts full
// chunks instead of a track changes word like feature. so we need this to be best"): paragraphs paired first and then
// words (core/revisions-core.ts), each change brought back or kept on its own, a whole paragraph restored or moved back,
// the revision picked from a list in the header and stepped through with ← →. INLINE is one text marked like track
// changes; SIDE BY SIDE is a merge view, the revision on the left and the note itself on the right, where it can be
// written in ("more like snapshot diff, with the possibility to edit in the current note"): its edits saved into the
// note as they settle, an arrow between the two sides restoring a paragraph, a change's own Reject on its hover. A change
// is ACCEPTED (its new words kept, the mark cleared) or REJECTED (its old words back), as Word and Google Docs say it.
// A write goes into the note where the change is (an open editor's own edit, so Undo takes it back), and the note's
// text now is saved as a revision before a whole revision is restored over it. ONE LINE OF HEADER (the writer:
// "simplify the top menu of compare … only one line").

import { ItemView, Notice, Platform, TFile, setIcon, setTooltip } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import type { MergeView } from '@codemirror/merge';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history, historyKeymap, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { wsCatch, wsIconInto, wsModKeyName, wsWheelStep } from '../core/preamble';
import type { WsWheelAcc } from '../core/preamble';
import { wsT } from '../core/ui-text';
import { wsRevChanges, wsRevCompare, wsRevTally, wsRevBringBack, wsRevInsertPara, wsRevRemovePara, wsRevRestorePara } from '../core/revisions-core';
import type { WsRevComparison, WsRevGroup, WsRevItem } from '../core/revisions-core';
import { WS_REV_VIEW } from './revisions';
import type { WsRevEntry } from './revisions';
import type WordSmith from './plugin';

interface WsRevState { note?: string; pick?: string; choose?: boolean }
interface WsRevSpot { fa: number; ta: number; fb: number; tb: number }
// one thing the tab did to the note (or to its marks), to take back: the text before and after, the marks accepted either side
interface WsRevStep { before: string; after: string; keptBefore: string[]; keptAfter: string[] }
// THE MERGE VIEW, LOADED WHEN SIDE BY SIDE FIRST DRAWS (bundled: Obsidian has none): its module defines its facets and
// themes as it loads, so the plugin's start never runs it, and a writer who never compares side by side never pays for it
type WsMergeModule = typeof import('@codemirror/merge');
let WS_MERGE: WsMergeModule | null = null;
async function wsMergeModule(): Promise<WsMergeModule> { return WS_MERGE || (WS_MERGE = await import('@codemirror/merge')); }
// THE ZOOM, the Organizer's gesture (Ctrl or Cmd and the wheel, two fingers on a phone; 60% to 200% in tenths) and its way
// back, the lens and the figure in the header: one zoom for every Revisions tab, the session's. The text's own size,
// not a CSS zoom: the side by side is an editor, and its clicks are measured in the page's own pixels
let WS_REV_ZOOM = 1;

// (A CLASS ONLY WHERE OBSIDIAN HAS ITEMVIEW, as the Outliner's: a suite's stand-in Obsidian has none)
export const WsRevisionsView = ItemView ? class extends ItemView {
	plugin: WordSmith;
	note = '';
	pick = '';
	entries: WsRevEntry[] = [];
	cmp: WsRevComparison | null = null;
	oldText = '';
	// the list's changes from now, by revision, for the note's text they were counted against
	counts = new Map<string, { n: number; add: number; rem: number }>();
	countedText = '';
	newText = '';
	kept = new Set<string>();
	unfold = new Set<number>();
	focusAt = -1;
	pop: HTMLElement | null = null;
	timer = 0;
	busy = false;
	// THE LAST DRAW ASKED FOR WINS: a click on › while the one before is still reading draws once, the right one
	seq = 0;
	headEl: HTMLElement | null = null;
	sumEl: HTMLElement | null = null;
	// side by side: the merge view, its note's edits waiting to be saved, what was last written (so its echo is no news)
	merge: MergeView | null = null;
	saveTimer = 0;
	lastWritten: string | null = null;
	outside = false;
	// UNDO AND REDO: inline, the tab's own steps; side by side, the right side's own history
	undos: WsRevStep[] = [];
	redos: WsRevStep[] = [];
	undoBtn: HTMLButtonElement | null = null;
	redoBtn: HTMLButtonElement | null = null;
	zoomHost: HTMLElement | null = null;
	wheelAcc: WsWheelAcc = { sum: 0, at: 0 };
	pinch: { z0: number; d0: number } | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: WordSmith) {
		super(leaf);
		this.plugin = plugin;
		this.navigation = true;
	}
	getViewType() { return WS_REV_VIEW; }
	getDisplayText() { return wsT('Revisions: {note}', { note: this.noteName() || '' }); }
	getIcon() { return 'file-clock'; }
	noteName() { return String(this.note || '').split('/').pop()!.replace(/\.md$/i, ''); }

	async setState(state: unknown, result: ViewStateResult) {
		const st = (state || {}) as WsRevState;
		if (typeof st.note === 'string') this.note = st.note;
		this.pick = typeof st.pick === 'string' ? st.pick : '';
		this.kept.clear(); this.unfold.clear(); this.focusAt = -1;
		await this.redraw();
		if (st.choose) window.setTimeout(() => this.openPicker(), 0);
		return super.setState(state, result);
	}
	getState(): Record<string, unknown> { return { note: this.note, pick: this.pick }; }

	async onOpen() {
		this.contentEl.addClass('ws-rev-view');
		this.contentEl.tabIndex = 0;
		// THE NOTE CHANGING (typed in beside this tab, or saved) reaches the compare a moment after it settles: the
		// plugin's one subscription calls `redrawSoon` on every open tab (revViewsChanged)
		this.registerDomEvent(this.contentEl, 'keydown', (e: KeyboardEvent) => this.onKey(e));
		this.registerDomEvent(document, 'mousedown', (e: MouseEvent) => { if (this.pop && !this.pop.contains(e.target as Node) && !(e.target as HTMLElement).closest('.ws-rev-pick')) this.closePicker(); });
		// THE KEYS FOLLOW A CLICK: a button pressed, a revision picked, the tab keeps the keys (an editor keeps its own)
		this.registerDomEvent(this.contentEl, 'click', (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('input, textarea, .cm-editor')) this.keepKeys(); });
		this.registerDomEvent(this.contentEl, 'wheel', (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			const step = wsWheelStep(this.wheelAcc, e.deltaY, Date.now());
			if (step) this.zoomTo(WS_REV_ZOOM + step * 0.1);
		}, { passive: false });
		const span = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
		this.registerDomEvent(this.contentEl, 'touchstart', (e: TouchEvent) => { this.pinch = e.touches.length === 2 ? { d0: span(e.touches) || 1, z0: WS_REV_ZOOM } : null; }, { passive: true });
		this.registerDomEvent(this.contentEl, 'touchmove', (e: TouchEvent) => {
			if (!this.pinch || e.touches.length !== 2) return;
			e.preventDefault();
			this.zoomTo(this.pinch.z0 * span(e.touches) / this.pinch.d0);
		}, { passive: false });
		this.registerDomEvent(this.contentEl, 'touchend', (e: TouchEvent) => { if (e.touches.length < 2) this.pinch = null; }, { passive: true });
		this.zoomApply();
		this.keepKeys();
	}
	async onClose() {
		if (this.timer) window.clearTimeout(this.timer);
		this.closePicker();
		// an edit still waiting goes into the note before the tab goes
		await this.flushEdits();
		this.dropMerge();
	}
	zoomTo(z: number) {
		const next = Math.min(2, Math.max(0.6, Math.round(z * 10) / 10));
		if (next === WS_REV_ZOOM) return;
		WS_REV_ZOOM = next;
		this.zoomApply();
	}
	zoomApply() {
		try { this.contentEl.style.setProperty('--ws-rev-zoom', String(WS_REV_ZOOM)); } catch (_) { wsCatch('WsRevisionsView: zoom', _); }
		// (the editors measure their lines again at the new size)
		const m = this.merge;
		if (m) { try { m.a.requestMeasure(); m.b.requestMeasure(); } catch (_) { wsCatch('WsRevisionsView: requestMeasure', _); } }
		this.paintZoom();
	}
	// THE WAY BACK, the Organizer's: a lens and the figure at the end of the header while the zoom is not 100%, a click
	// putting it back (a magnifier with a minus while smaller, a plus while larger)
	paintZoom() {
		const host = this.zoomHost;
		if (!host) return;
		let t = host.querySelector<HTMLElement>('.ws-uni-zoomtag');
		if (Math.abs(WS_REV_ZOOM - 1) < 0.001) { if (t) t.remove(); return; }
		if (!t) {
			t = host.createEl('button', { cls: 'ws-export-mini ws-uni-zoomtag' });
			t.title = wsT('Back to 100%');
			t.setAttribute('aria-label', wsT('Zoom back to 100%'));
			t.addEventListener('click', (ev: Event) => { ev.stopPropagation(); this.zoomTo(1); });
		}
		t.empty();
		wsIconInto(t.createSpan({ cls: 'ws-uni-zoomlens' }), [WS_REV_ZOOM < 1 ? 'zoom-out' : 'zoom-in'], '');
		t.createSpan({ cls: 'ws-uni-zoomnum', text: Math.round(WS_REV_ZOOM * 100) + '%' });
	}
	keepKeys() { try { if (!this.contentEl.contains(document.activeElement) || document.activeElement === document.body) this.contentEl.focus({ preventScroll: true }); } catch (_) { wsCatch('WsRevisionsView: keepKeys', _); } }
	redrawSoon() {
		if (this.timer) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => { this.timer = 0; void this.sync(); }, 400);
	}

	// ── READING ──
	async readEntries(): Promise<WsRevEntry[]> {
		const ours = await this.plugin.revList(this.note);
		const theirs = await this.plugin.revRecovery(this.note);
		return ours.concat(theirs).sort((a, b) => b.taken - a.taken);
	}
	async redraw() {
		const seq = ++this.seq;
		if (!this.note) { this.dropMerge(); this.contentEl.empty(); return; }
		try {
			const entries = await this.readEntries();
			if (seq !== this.seq) return;
			let pick = this.pick;
			if (!entries.find((e) => e.path === pick)) pick = entries.length ? entries[0].path : '';
			const left = entries.find((e) => e.path === pick);
			const oldText = left ? await this.plugin.revText(left) : '';
			const newText = (await this.plugin.revNoteText(this.note)) || '';
			if (seq !== this.seq) return;
			this.entries = entries; this.pick = pick;
			this.oldText = oldText; this.newText = newText;
			this.cmp = left ? wsRevCompare(oldText, newText) : null;
		} catch (_) { wsCatch('WsRevisionsView: redraw', _); this.cmp = null; }
		if (seq === this.seq) this.render();
	}
	// A CHANGE FROM OUTSIDE: side by side, the note's new text goes into the right side where it changed (the caret
	// and the scroll stay), a revision saved meanwhile into the pickers; otherwise the compare is drawn again
	async sync() {
		const m = this.merge;
		if (!m) { await this.redraw(); return; }
		try {
			const cur = await this.plugin.revNoteText(this.note);
			if (this.merge !== m) return;
			const doc = m.b.state.doc.toString();
			if (cur != null && cur !== doc && cur !== this.lastWritten && !this.saveTimer) {
				let s = 0; while (s < cur.length && s < doc.length && cur[s] === doc[s]) s++;
				let e = 0; while (e < cur.length - s && e < doc.length - s && cur[cur.length - 1 - e] === doc[doc.length - 1 - e]) e++;
				this.outside = true;
				try { m.b.dispatch({ changes: { from: s, to: doc.length - e, insert: cur.slice(s, cur.length - e) } }); } finally { this.outside = false; }
				this.newText = cur; this.cmp = wsRevCompare(this.oldText, cur); this.paintSum();
			}
			const entries = await this.readEntries();
			if (this.merge !== m) return;
			// (the revision shown gone, deleted or renamed: drawn again, its edits saved first)
			if (!entries.find((x) => x.path === this.pick)) { await this.flushEdits(); await this.redraw(); return; }
			const sig = (l: WsRevEntry[]) => l.map((x) => x.path + '|' + x.kind + '|' + x.name).join('\n');
			if (sig(entries) !== sig(this.entries)) { this.entries = entries; this.paintHead(); }
		} catch (_) { wsCatch('WsRevisionsView: sync', _); }
	}

	// ── DRAWING ──
	render() {
		const root = this.contentEl;
		const keepScroll = root.scrollTop;
		this.dropMerge();
		root.empty();
		this.closePicker();
		this.headEl = null; this.sumEl = null;
		const left = this.entries.find((e) => e.path === this.pick);
		if (!left) {
			const empty = root.createDiv({ cls: 'ws-rev-empty' });
			empty.createDiv({ text: wsT('No revisions of {note} yet.', { note: this.noteName() }) });
			const b = empty.createEl('button', { cls: 'mod-cta', text: wsT('Save a revision…') });
			b.addEventListener('click', () => this.plugin.revSavePrompt(this.note));
			return;
		}
		this.headEl = root.createDiv({ cls: 'ws-rev-head' });
		this.paintHead();
		const body = root.createDiv({ cls: 'ws-rev-body' + (this.mode() === 'side' ? ' is-side' : '') });
		if (this.cmp) { if (this.mode() === 'side') void this.drawMerge(body, keepScroll); else this.drawInline(body); }
		root.scrollTop = keepScroll;
		this.keepKeys();
	}
	// THE HEADER: inline, one line, the view's switch first, then ‹ the revision ›, the count, Undo and Redo, Restore and Open
	// note; SIDE BY SIDE, CUT AS THE PANES ARE, each half with what its pane needs: over the revision the switch, ‹ the
	// revision › and Restore, over the note its name, the count, Undo and Redo and Open note (the writer: "cut in two more
	// clearly … so each pane has the buttons that it needed"). The revision is always against the note as it is ("i will
	// also compare only with the now")
	paintHead() {
		const head = this.headEl;
		const left = this.entries.find((e) => e.path === this.pick);
		if (!head || !left) return;
		head.empty();
		const side = this.mode() === 'side';
		head.toggleClass('is-side', side);
		// ON A PHONE, TWO LINES: the revision and Restore, then the note, its count, Undo and Redo (measured at 360px: one
		// line needs 397px of the 328 a phone gives); no switch, side by side is not drawn there
		const phone = this.onPhone();
		const line = head.createDiv({ cls: 'ws-rev-line' + (side ? ' is-split' : '') + (phone ? ' is-phone' : '') });
		const rev = side ? line.createDiv({ cls: 'ws-rev-half' }) : line;
		if (side) line.createDiv({ cls: 'ws-rev-gap' });
		const note = side ? line.createDiv({ cls: 'ws-rev-half is-note' }) : line;
		const seg = rev.createDiv({ cls: 'ws-rev-seg' });
		const mode = this.mode();
		for (const [id, icon, tip] of [['inline', 'align-left', wsT('Inline, like track changes')], ['side', 'columns-2', wsT('Side by side')]] as const) {
			const b = seg.createEl('button', { cls: mode === id ? 'is-on' : '' });
			this.tipOf(b, tip);
			try { setIcon(b, icon); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
			b.addEventListener('click', () => { void (async () => { await this.flushEdits(); this.plugin.settings.revisionsCompare = id; await this.plugin.saveSettings(); this.render(); })(); });
		}
		// a thin rule between groups ("arrange the icons better")
		const sep = (parent: HTMLElement) => parent.createSpan({ cls: 'ws-rev-sep' });
		sep(rev);
		// the two arrows side by side, then the revision (the writer: "the arrows should sit one next to each other")
		this.iconBtn(rev, 'chevron-left', wsT('Older revision (←)'), () => this.step(1), !this.canStep(1));
		this.iconBtn(rev, 'chevron-right', wsT('Newer revision (→)'), () => this.step(-1), !this.canStep(-1));
		this.pickBtn(rev, left);
		if (!side) sep(note);
		// RESTORE SAYS SO (the writer: "add name to the left icon"), its description on hover
		const restore = () => {
			const b = rev.createEl('button', { cls: 'ws-rev-textbtn' });
			const i = b.createSpan(); try { setIcon(i, 'history'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
			b.createSpan({ text: wsT('Restore') });
			this.tipOf(b, wsT('Restore this revision: the note takes its text, and its text now is saved first.'));
			b.addEventListener('click', () => this.restoreAll(left));
			return b;
		};
		if (side) restore().addClass('is-end');
		if (phone) { restore(); line.createDiv({ cls: 'ws-rev-break' }); }
		// THE NOTE'S NAME OPENS THE NOTE (no button of its own: the writer, "make the note name clickable to open the note")
		const name = note.createDiv({ cls: 'ws-rev-notename' });
		name.tabIndex = 0;
		const ic = name.createSpan({ cls: 'ws-rev-kind' });
		try { setIcon(ic, 'file-text'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
		name.createSpan({ text: this.noteName() });
		this.tipOf(name, wsT('Open note: back to the note, to write in it.'));
		const open = () => { void this.app.workspace.openLinkText(this.note, '', false); };
		name.addEventListener('click', open);
		name.addEventListener('keydown', (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
		this.sumEl = note.createDiv({ cls: 'ws-rev-sum' });
		this.paintSum();
		const mod = wsModKeyName();
		if (!side) sep(note);
		this.undoBtn = this.iconBtn(note, 'undo-2', wsT('Undo') + ' (' + mod + '+Z)', () => { void this.undoRedo(true); }, true);
		this.redoBtn = this.iconBtn(note, 'redo-2', wsT('Redo') + ' (' + mod + '+Shift+Z)', () => { void this.undoRedo(false); }, true);
		this.paintUndo();
		if (!side && !phone) { sep(note); restore(); }
		this.zoomHost = note;
		this.paintZoom();
	}
	// the count: how many changes, the words added and removed, the paragraphs moved; the keys on its hover
	paintSum() {
		const el = this.sumEl;
		if (!el) return;
		el.empty();
		const { n, add, rem, mov } = wsRevTally(this.cmp);
		if (n) {
			el.createSpan({ text: n === 1 ? wsT('1 change') : wsT('{n} changes', { n }) });
			// "+12 −1 words": the two counts share the word, so neither reads "1 words"
			const w = el.createSpan();
			w.createSpan({ cls: 'is-add', text: '+' + add.toLocaleString() });
			w.appendText(' ');
			w.createSpan({ cls: 'is-rem', text: '−' + rem.toLocaleString() });
			w.appendText(' ' + wsT('words'));
		}
		if (mov) el.createSpan({ cls: 'is-move', text: mov === 1 ? wsT('1 moved') : wsT('{n} moved', { n: mov }) });
		if (!n && !mov) el.createSpan({ text: wsT('No changes: the same text') });
		const keys = this.mode() === 'side' ? wsT('↑ ↓ changes · ← → revisions') : wsT('↑ ↓ changes · ← → revisions · A accept · R reject');
		if (!Platform.isMobile) el.setAttribute('title', keys);
	}
	mode() { return this.plugin.settings.revisionsCompare === 'side' && !this.onPhone() ? 'side' : 'inline'; }
	// a phone's screen; one door, so a probe on a desktop can draw this tab as a phone draws it
	onPhone() { return Platform.isPhone; }
	iconBtn(parent: HTMLElement, icon: string, tip: string, run: () => void, off: boolean): HTMLButtonElement {
		const b = parent.createEl('button', { cls: 'ws-rev-iconbtn' });
		this.tipOf(b, tip);
		try { setIcon(b, icon); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
		b.disabled = off;
		b.addEventListener('click', run);
		return b;
	}
	// (a suite's stand-in Obsidian has no setTooltip: the words then go on the label alone)
	tipOf(el: HTMLElement, tip: string) {
		try { if (typeof setTooltip === 'function') { setTooltip(el, tip, { placement: 'bottom' }); return; } } catch (_) { wsCatch('WsRevisionsView: setTooltip', _); }
		el.setAttribute('aria-label', tip);
	}
	kindIcon(e: WsRevEntry) { return e.kind === 'yours' ? 'save' : e.kind === 'recovery' ? 'history' : 'clock'; }
	whoOf(e: WsRevEntry) { return e.kind === 'yours' ? (e.name || wsT('Saved by you')) : e.kind === 'recovery' ? wsT('File recovery') : wsT('Automatic'); }
	// a revision's own name on its button, when it has one of its own (not the note's name and the time it was given)
	shortName(e: WsRevEntry) {
		const rest = e.name && e.name.startsWith(this.noteName()) ? e.name.slice(this.noteName().length) : null;
		const plain = rest != null && (/^ \d{2}-\d{2}-\d{4} \d{2}-\d{2}$/.test(rest) || rest.startsWith(', '));
		return e.kind === 'yours' && e.name && !plain ? e.name : '';
	}
	pickBtn(parent: HTMLElement, e: WsRevEntry) {
		const b = parent.createDiv({ cls: 'ws-rev-pick' + (e.kind === 'yours' ? ' is-yours' : '') });
		b.tabIndex = 0;
		const ic = b.createSpan({ cls: 'ws-rev-kind' });
		try { setIcon(ic, this.kindIcon(e)); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
		b.createSpan({ cls: 'ws-rev-when', text: this.plugin.revWhen(e.taken) });
		const name = this.shortName(e);
		if (name) b.createSpan({ cls: 'ws-rev-who', text: name });
		const chev = b.createSpan({ cls: 'ws-rev-chev' });
		try { setIcon(chev, 'chevron-down'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
		b.setAttribute('title', this.plugin.revWhen(e.taken, true) + ' · ' + this.whoOf(e) + ' · ' + (e.words === 1 ? wsT('1 word') : wsT('{n} words', { n: e.words.toLocaleString() })));
		// one click opens the list, a second closes it
		b.addEventListener('click', () => { if (this.pop) this.closePicker(); else this.openPicker(); });
		b.addEventListener('keydown', (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.openPicker(); } });
	}

	// ── THE PICKER: every revision by day, newest first; its name and its deletion on the row ──
	openPicker() {
		this.closePicker();
		const anchor = this.contentEl.querySelector<HTMLElement>('.ws-rev-pick');
		if (!anchor) return;
		const pop = this.contentEl.createDiv({ cls: 'ws-rev-pop menu' });
		this.pop = pop;
		const r = anchor.getBoundingClientRect(), host = this.contentEl.getBoundingClientRect();
		pop.style.left = Math.max(6, r.left - host.left) + 'px';
		pop.style.top = (r.bottom - host.top + this.contentEl.scrollTop + 4) + 'px';
		// the note now: side by side, the right side as it is being written
		const nowText = this.merge ? this.merge.b.state.doc.toString() : this.newText;
		const counted: [WsRevEntry, HTMLElement][] = [];
		const pickIt = (set: () => void) => { set(); this.kept.clear(); this.focusAt = -1; this.closePicker(); void this.flushEdits().then(() => this.redraw()); };
		let day = '';
		for (const e of this.entries) {
			const label = e.kind === 'recovery' ? wsT('File recovery') : this.dayLabel(e.taken);
			if (label !== day) { day = label; pop.createDiv({ cls: 'ws-rev-day', text: label }); }
			const sel = this.pick === e.path;
			const it = pop.createDiv({ cls: 'ws-rev-item' + (sel ? ' is-sel' : '') + (e.kind === 'yours' ? ' is-yours' : '') });
			this.rowIcon(it, this.kindIcon(e));
			const d = new Date(e.taken);
			const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
			const text = it.createDiv({ cls: 'ws-rev-rowtext' });
			// THE TITLE IS ITS OWN NAME, OR ITS TIME (the day is the heading above it): a name of the note and the time it
			// was given, or "Saved by you", says nothing the row's icon and heading do not
			const named = this.shortName(e);
			text.createDiv({ cls: 'ws-rev-title' + (named ? '' : ' is-time'), text: named || hhmm });
			const meta = text.createDiv({ cls: 'ws-rev-meta' });
			if (named) meta.createSpan({ text: hhmm });
			if (e.kind === 'auto') meta.createSpan({ text: wsT('Automatic') });
			meta.createSpan({ text: e.words === 1 ? wsT('1 word') : wsT('{n} words', { n: e.words.toLocaleString() }) });
			// HOW FAR IT IS FROM THE NOTE NOW, the words added and removed (the writer: "the + - badges"), filled in once open
			counted.push([e, it.createSpan({ cls: 'ws-rev-delta' })]);
			it.setAttribute('title', this.plugin.revWhen(e.taken, true) + ' · ' + this.whoOf(e));
			// ITS NAME AND ITS DELETION ON THE ROW, SHOWN ALWAYS: a tap on a phone reaches them, and nothing comes or goes under
			// the pointer
			if (e.kind !== 'recovery') {
				const acts = it.createSpan({ cls: 'ws-rev-rowacts' });
				const nb = acts.createEl('button', { attr: { 'aria-label': e.kind === 'yours' ? wsT('Rename') : wsT('Name it, so it is kept') } });
				try { setIcon(nb, 'pencil'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
				nb.addEventListener('click', (ev) => { ev.stopPropagation(); this.closePicker(); this.renameEntry(e); });
				const db = acts.createEl('button', { attr: { 'aria-label': wsT('Delete this revision') } });
				try { setIcon(db, 'trash-2'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
				db.addEventListener('click', (ev) => {
					ev.stopPropagation(); this.closePicker();
					this.plugin.revConfirm(wsT('Delete this revision?'), wsT('It goes to Obsidian’s trash.'), wsT('Delete'), () => {
						const f = this.app.vault.getAbstractFileByPath(e.path);
						if (f instanceof TFile) void this.plugin.revTrash([f]).then(() => { new Notice(wsT('Word-Smith: revision deleted')); void this.redraw(); });
					});
				});
			}
			it.addEventListener('click', () => pickIt(() => { this.pick = e.path; }));
		}
		const shown = pop.querySelector<HTMLElement>('.ws-rev-item.is-sel');
		if (shown) shown.scrollIntoView({ block: 'nearest' });
		{
			const foot = pop.createDiv({ cls: 'ws-rev-foot' });
			const ours = this.entries.filter((e) => e.kind !== 'recovery');
			foot.createSpan({ text: wsT(ours.length === 1 ? '{n} revision' : '{n} revisions', { n: ours.length }) + ' · ' + wsT('{n} saved by you', { n: ours.filter((e) => e.kind === 'yours').length }) });
			// (what it deletes, said: the automatic ones, yours staying)
			if (this.entries.some((e) => e.kind === 'auto')) {
				const del = foot.createEl('a', { text: wsT('Delete automatic revisions…') });
				del.addEventListener('click', () => { this.closePicker(); this.deleteAllOfNote(); });
			}
		}
		// INSIDE THE TAB, whatever its width (on a phone the list ran 263px past the screen)
		pop.style.left = Math.max(6, Math.min(r.left - host.left, host.width - pop.offsetWidth - 6)) + 'px';
		void this.countRows(counted, nowText);
	}
	rowIcon(parent: HTMLElement, icon: string) { const s = parent.createSpan({ cls: 'ws-rev-kind' }); try { setIcon(s, icon); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); } }
	closePicker() { if (this.pop) { this.pop.remove(); this.pop = null; } }
	// THE WORDS FROM NOW, one revision after another while the list is open (the header's own count, wsRevTally), kept
	// while the note's text is the same; a list closed meanwhile stops it
	async countRows(rows: [WsRevEntry, HTMLElement][], now: string) {
		if (this.countedText !== now) { this.countedText = now; this.counts.clear(); }
		for (const [e, el] of rows) {
			if (!el.isConnected) return;
			let t = this.counts.get(e.path);
			if (t === undefined) {
				try { t = wsRevTally(wsRevCompare(await this.plugin.revText(e), now)); } catch (_) { wsCatch('WsRevisionsView: countRows', _); continue; }
				if (this.countedText !== now) return;
				this.counts.set(e.path, t);
			}
			this.paintCount(el, t);
		}
	}
	// THE WORDS ADDED AND REMOVED SINCE IT, the header's own "+4 −1", no glyph (the writer: "i want the + - badges without
	// that icon"); nothing when the revision is the note as it is; its changes on the hover
	paintCount(el: HTMLElement, t: { n: number; add: number; rem: number }) {
		el.empty();
		if (!t.n) return;
		el.createSpan({ cls: 'is-add', text: '+' + t.add.toLocaleString() });
		el.createSpan({ cls: 'is-rem', text: '−' + t.rem.toLocaleString() });
		el.setAttribute('title', t.n === 1 ? wsT('1 change') : wsT('{n} changes', { n: t.n }));
	}
	// ↑ ↓ through the open list, Enter picks, Escape closes (the keys of the compare wait while it is open)
	pickerKey(e: KeyboardEvent): boolean {
		const pop = this.pop;
		if (!pop) return false;
		const rows = Array.from(pop.querySelectorAll<HTMLElement>('.ws-rev-item'));
		if (e.key === 'Escape') { this.closePicker(); return true; }
		if (!rows.length) return false;
		let at = rows.findIndex((r) => r.hasClass('is-hl'));
		if (at < 0) at = rows.findIndex((r) => r.hasClass('is-sel'));
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			at = Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)));
			rows.forEach((r, i) => r.toggleClass('is-hl', i === at));
			rows[at].scrollIntoView({ block: 'nearest' });
			return true;
		}
		if (e.key === 'Enter' && at >= 0) { rows[at].click(); return true; }
		return false;
	}
	dayLabel(t: number) {
		const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
		if (t >= d0) return wsT('Today');
		if (t >= d0 - 86400000) return wsT('Yesterday');
		try { return new Date(t).toLocaleDateString(this.plugin.revLocale(), { weekday: 'long', month: 'long', day: 'numeric' }); } catch { return new Date(t).toDateString(); }
	}
	renameEntry(e: WsRevEntry) {
		this.plugin.revNameAsk({ title: e.kind === 'yours' ? wsT('Rename this revision') : wsT('Name this revision'), sub: e.kind === 'yours' ? '' : wsT('Named, it is yours: kept until you delete it.'), value: e.name, ok: wsT('Save name') }, (name) => {
			if (name == null) return;
			void this.plugin.revRename(e.path, name).then(() => this.redraw());
		});
	}
	deleteAllOfNote() {
		const autos = this.entries.filter((e) => e.kind === 'auto').length;
		this.plugin.revConfirm(wsT('Delete this note’s automatic revisions?'), wsT(autos === 1 ? '{n} revision; yours stay. It goes to Obsidian’s trash.' : '{n} revisions; yours stay. They go to Obsidian’s trash.', { n: autos }), wsT('Delete'), () => {
			void this.plugin.revCleanNote(this.note, true).then((n) => { new Notice(wsT(n === 1 ? 'Word-Smith: {n} revision deleted' : 'Word-Smith: {n} revisions deleted', { n })); void this.redraw(); });
		});
	}

	// ── THE CHANGES, INLINE: one text, what went struck through, what came underlined ──
	drawInline(body: HTMLElement) {
		const doc = body.createDiv({ cls: 'ws-rev-doc' });
		let ch = 0;
		const items = this.cmp ? this.cmp.items : [];
		// LONG UNCHANGED STRETCHES FOLD: two or more paragraphs alike in a row become one line that opens them
		let run: WsRevItem[] = [];
		const flush = () => {
			const folded = run.length >= 2 && !run.some((it) => 'b' in it && this.unfold.has(it.b));
			if (folded) {
				const f = doc.createDiv({ cls: 'ws-rev-fold', text: wsT('⋯ {n} paragraphs unchanged', { n: run.length }) });
				const bs = run.map((it) => ('b' in it ? it.b : -1));
				f.addEventListener('click', () => { for (const b of bs) this.unfold.add(b); this.render(); });
			} else for (const it of run) this.paraEl(doc, it, () => ch++);
			run = [];
		};
		for (const it of items) {
			if (it.type === 'same') { run.push(it); continue; }
			flush();
			this.paraEl(doc, it, () => ch++);
		}
		flush();
		if (this.focusAt >= 0) this.paintFocus();
	}
	paraEl(doc: HTMLElement, it: WsRevItem, nextId: () => number) {
		const p = doc.createDiv({ cls: 'ws-rev-para is-' + it.type });
		if (it.type === 'same') { p.setText(it.text); return; }
		// A CHANGED PARAGRAPH'S OWN LINE ABOVE IT: what happened to it on the left, what can be done on the right, so a
		// button never sits on the words (the writer's shot: Restore paragraph over the first line)
		const headRow = p.createDiv({ cls: 'ws-rev-phead' });
		const tag = (icon: string, text: string) => { const t = headRow.createDiv({ cls: 'ws-rev-tag' }); const i = t.createSpan(); try { setIcon(i, icon); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); } t.createSpan({ text }); };
		const pact = (icon: string, text: string, run: () => void) => {
			const box = headRow.querySelector<HTMLElement>('.ws-rev-pacts') || headRow.createDiv({ cls: 'ws-rev-pacts' });
			const b = box.createEl('button');
			const i = b.createSpan(); try { setIcon(i, icon); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
			b.createSpan({ text });
			b.addEventListener('click', run);
		};
		if (it.type === 'ghost') { tag('arrow-up-down', it.up ? wsT('A paragraph moved up from here') : wsT('A paragraph moved down from here')); return; }
		if (it.type === 'added') {
			p.dataset.ch = String(nextId());
			tag('plus', wsT('New paragraph'));
			pact('x', wsT('Remove it'), () => void this.apply((t, c) => wsRevRemovePara(t, c, it.b)));
			p.createDiv({ cls: 'ws-rev-text', text: it.text });
			return;
		}
		if (it.type === 'removed') {
			p.dataset.ch = String(nextId());
			tag('trash-2', wsT('Removed paragraph'));
			pact('undo-2', wsT('Bring it back'), () => void this.apply((t, c) => wsRevInsertPara(t, c, it.at, it.text)));
			p.createDiv({ cls: 'ws-rev-text', text: it.text });
			return;
		}
		if (it.type === 'moved') {
			tag('arrow-up-down', (it.up ? wsT('Moved here from below') : wsT('Moved here from above')) + (it.old !== it.text ? ', ' + wsT('and changed') : ''));
			pact('arrow-up-down', wsT('Move it back'), () => this.moveBack(it));
		}
		if (it.type === 'changed') {
			const n = it.g.filter((x) => x.eq === undefined).length;
			tag('pencil', n === 1 ? wsT('1 change') : wsT('{n} changes', { n }));
			pact('history', wsT('Restore paragraph'), () => void this.apply((t, c) => wsRevRestorePara(t, c, it.b, it.old)));
		}
		const text = p.createDiv({ cls: 'ws-rev-text' });
		this.groupsInto(text, it.b, it.g, nextId);
	}
	groupsInto(el: HTMLElement, b: number, g: WsRevGroup[], nextId: () => number) {
		g.forEach((x, gi) => {
			if (x.eq !== undefined) { el.appendText(x.eq); return; }
			const key = b + ':' + gi + ':' + String(x.del) + '>' + String(x.ins);
			if (this.kept.has(key)) { el.appendText(String(x.ins || '')); return; }
			const c = el.createSpan({ cls: 'ws-rev-chg' });
			c.dataset.ch = String(nextId());
			// THE CHANGE'S BUTTONS IN THE LEFT MARGIN, on the line of a mark of no width at its start, over no text (above its
			// first word where the margin has no room: paintFocus)
			// (centered on a change that wraps, they sat on its words: the writer's shot)
			const anchor = c.createSpan({ cls: 'ws-rev-anchor' });
			if (x.del) c.createEl('del', { text: x.del });
			if (x.ins) c.createEl('ins', { text: x.ins });
			const acts = anchor.createSpan({ cls: 'ws-rev-acts' });
			const accept = acts.createEl('button', { cls: 'is-accept', attr: { title: wsT('Accept: keep the new words and clear the mark (A)') } });
			const ai = accept.createSpan(); try { setIcon(ai, 'check'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
			accept.setAttribute('aria-label', wsT('Accept'));
			accept.addEventListener('click', (ev) => { ev.stopPropagation(); const was = Array.from(this.kept); this.kept.add(key); this.remember(this.newText, this.newText, was); this.render(); });
			const reject = acts.createEl('button', { cls: 'is-reject', attr: { title: wsT('Reject: put the old words back (R)') } });
			const ri = reject.createSpan(); try { setIcon(ri, 'x'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
			reject.setAttribute('aria-label', wsT('Reject'));
			reject.addEventListener('click', (ev) => { ev.stopPropagation(); void this.apply((t, cm) => wsRevBringBack(t, cm, b, g, gi)); });
			c.addEventListener('mouseenter', () => { this.focusAt = Number(c.dataset.ch); this.paintFocus(); });
		});
	}

	// ── SIDE BY SIDE: a merge view, the revision on the left, the note on the right and written in there ──
	async drawMerge(body: HTMLElement, keepScroll: number) {
		const host = body.createDiv({ cls: 'ws-rev-merge' });
		let mod: WsMergeModule;
		try { mod = await wsMergeModule(); } catch (_) { wsCatch('WsRevisionsView: load the merge view', _); host.remove(); this.drawInline(body); return; }
		// (drawn again while it loaded: the newer draw has its own)
		if (!host.isConnected || this.merge) return;
		const b = [
			history(), keymap.of(historyKeymap),
			EditorView.updateListener.of((u) => { if (u.docChanged && !this.outside) this.saveSoon(); if (u.docChanged) this.paintUndo(); }),
		];
		try {
			this.merge = new mod.MergeView({
				parent: host,
				// (no spellchecker's wavy line: the writer, "make this line a underline, no curvy shit")
				a: { doc: this.oldText, extensions: [EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.contentAttributes.of({ spellcheck: 'false' })] },
				b: { doc: this.newText, extensions: [EditorView.lineWrapping, EditorView.contentAttributes.of({ spellcheck: 'false' }), ...b] },
				// the compare's own pairing, as offsets: a paragraph against its paragraph, its words changed one by one
				diffConfig: { override: (x: string, y: string) => wsRevChanges(x, y).map((c) => new mod.Change(c.fromA, c.toA, c.fromB, c.toB)) },
				highlightChanges: true,
				gutter: true,
				revertControls: 'a-to-b',
				renderRevertControl: () => {
					const btn = createEl('button', { cls: 'ws-rev-revert', attr: { 'aria-label': wsT('Restore paragraph'), title: wsT('Restore paragraph') } });
					try { setIcon(btn, 'arrow-right'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
					return btn;
				},
			});
		} catch (_) { wsCatch('WsRevisionsView: MergeView', _); this.merge = null; host.remove(); this.drawInline(body); return; }
		this.hoverBack(host, this.merge);
		this.paintUndo();
		this.zoomApply();
		this.contentEl.scrollTop = keepScroll;
	}
	// A CHANGE'S OWN REJECT, on its hover in the note's side: its old words back where its new ones are (Accept has nothing
	// to do here: the right side is the note as it is)
	hoverBack(host: HTMLElement, m: MergeView) {
		const tip = host.createDiv({ cls: 'ws-rev-acts ws-rev-float' });
		const back = tip.createEl('button', { cls: 'is-reject', attr: { title: wsT('Reject: put the old words back (R)') } });
		const bi = back.createSpan(); try { setIcon(bi, 'x'); } catch (_) { wsCatch('WsRevisionsView: setIcon', _); }
		back.createSpan({ text: wsT('Reject') });
		let spot: WsRevSpot | null = null;
		const find = (pos: number, side: 'a' | 'b'): WsRevSpot | null => {
			for (const ch of m.chunks) {
				for (const c of ch.changes) {
					const s = { fa: ch.fromA + c.fromA, ta: ch.fromA + c.toA, fb: ch.fromB + c.fromB, tb: ch.fromB + c.toB };
					const from = side === 'a' ? s.fa : s.fb, to = side === 'a' ? s.ta : s.tb;
					if (pos >= from && pos <= Math.max(to, from + 1)) return s;
				}
			}
			return null;
		};
		const hide = () => { tip.removeClass('is-on'); spot = null; };
		const over = (view: EditorView, side: 'a' | 'b') => (e: MouseEvent) => {
			if (tip.contains(e.target as Node)) return;
			const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
			const s = pos == null ? null : find(pos, side);
			if (!s) { hide(); return; }
			if (spot && spot.fb === s.fb && spot.tb === s.tb) return;
			spot = s;
			// BESIDE THE CHANGE IN THE NOTE, the side a Reject writes into
			const at = m.b.coordsAtPos(s.fb);
			if (!at) { hide(); return; }
			const hr = host.getBoundingClientRect();
			tip.addClass('is-on');
			tip.style.left = Math.max(0, at.left - hr.left) + 'px';
			// above the change's line, or under it where the line is the first and there is no room above
			const above = at.top - hr.top - tip.offsetHeight - 2;
			tip.style.top = (above >= 0 ? above : at.bottom - hr.top + 2) + 'px';
		};
		// THE REVISION'S SIDE SHOWS NOTHING (the writer: "when i hover in the left note the popup appears in the right one")
		m.a.dom.addEventListener('mousemove', hide);
		m.b.dom.addEventListener('mousemove', over(m.b, 'b'));
		host.addEventListener('mouseleave', hide);
		back.addEventListener('click', (ev) => {
			ev.stopPropagation();
			if (!spot) return;
			const s = spot; hide();
			m.b.dispatch({ changes: { from: s.fb, to: s.tb, insert: m.a.state.sliceDoc(s.fa, s.ta) } });
		});
	}
	dropMerge() { if (this.merge) { try { this.merge.destroy(); } catch (_) { wsCatch('WsRevisionsView: destroy', _); } this.merge = null; } }
	saveSoon() {
		if (this.saveTimer) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => { this.saveTimer = 0; void this.saveEdits(); }, 500);
	}
	// what the right side says goes into the note, the smallest edit; the count follows it
	async saveEdits() {
		const m = this.merge;
		if (!m) return;
		const next = m.b.state.doc.toString();
		try {
			const cur = await this.plugin.revNoteText(this.note);
			if (cur == null || cur === next) return;
			this.lastWritten = next;
			await this.writeNote(cur, next);
			this.newText = next;
			this.cmp = wsRevCompare(this.oldText, next);
			this.paintSum();
		} catch (_) { wsCatch('WsRevisionsView: saveEdits', _); }
	}
	async flushEdits() { if (this.saveTimer) { window.clearTimeout(this.saveTimer); this.saveTimer = 0; await this.saveEdits(); } }

	// ── WRITING INTO THE NOTE: the smallest edit, through an open editor when there is one (its Undo takes it back) ──
	async apply(make: (text: string, cmp: WsRevComparison) => string) {
		if (this.busy || !this.cmp) return;
		this.busy = true;
		try {
			const cur = await this.plugin.revNoteText(this.note);
			// THE NOTE CHANGED since this was drawn (typing beside it): drawn again first, the press asked for again
			if (cur == null || cur !== this.newText) { await this.redraw(); new Notice(wsT('Word-Smith: the note changed; the compare is drawn again.')); return; }
			const next = make(cur, this.cmp);
			if (next === cur) return;
			const was = Array.from(this.kept);
			await this.writeNote(cur, next);
			this.remember(cur, next, was);
			await this.redraw();
		} catch (_) { wsCatch('WsRevisionsView: apply', _); }
		finally { this.busy = false; }
	}
	async writeNote(cur: string, next: string) {
		let s = 0; while (s < cur.length && s < next.length && cur[s] === next[s]) s++;
		let e = 0; while (e < cur.length - s && e < next.length - s && cur[cur.length - 1 - e] === next[next.length - 1 - e]) e++;
		const ed = this.plugin.revEditorOf(this.note);
		if (ed && ed.replaceRange && ed.offsetToPos) { ed.replaceRange(next.slice(s, next.length - e), ed.offsetToPos(s), ed.offsetToPos(cur.length - e)); return; }
		const f = this.app.vault.getAbstractFileByPath(this.note);
		if (f instanceof TFile) await this.app.vault.process(f, (data: string) => (data === cur ? next : data));
	}
	moveBack(it: Extract<WsRevItem, { type: 'moved' }>) {
		void this.apply((t, c) => {
			const g = c.items.find((x) => x.type === 'ghost' && x.a === it.a);
			let to = 0;
			for (const x of c.items) { if (x === g) break; if (x !== it && 'b' in x) to = x.b + 1; }
			const removed = wsRevRemovePara(t, c, it.b);
			const c2 = wsRevCompare(this.oldText, removed);
			const at = it.b < to ? to - 1 : to;
			return wsRevInsertPara(removed, c2, Math.min(at, c2.B.length), it.text);
		});
	}
	restoreAll(left: WsRevEntry) {
		const when = this.plugin.revWhen(left.taken, true);
		this.plugin.revConfirm(wsT('Restore {when}?', { when }), wsT('The note takes this revision’s text. Its text now is saved first, as a revision named “Before restoring {when}”.', { when }), wsT('Restore'), () => {
			void (async () => {
				await this.flushEdits();
				await this.plugin.revSave(this.note, 'yours', wsT('Before restoring {when}', { when }));
				const cur = await this.plugin.revNoteText(this.note);
				if (cur != null && cur !== this.oldText) { const was = Array.from(this.kept); await this.writeNote(cur, this.oldText); this.remember(cur, this.oldText, was); }
				new Notice(wsT('Word-Smith: restored. Your text before it is saved as a revision.'));
				await this.redraw();
			})();
		});
	}

	// ── UNDO AND REDO: inline, what the tab did (a change rejected or accepted, a paragraph restored, the whole note);
	// side by side, the right side's own history (its keys work in it as they do in any editor) ──
	remember(before: string, after: string, keptBefore: string[]) {
		this.undos.push({ before, after, keptBefore, keptAfter: Array.from(this.kept) });
		if (this.undos.length > 100) this.undos.shift();
		this.redos = [];
	}
	paintUndo() {
		const m = this.merge;
		const can = (back: boolean) => (m ? (back ? undoDepth(m.b.state) : redoDepth(m.b.state)) > 0 : (back ? this.undos : this.redos).length > 0);
		try {
			if (this.undoBtn) this.undoBtn.disabled = !can(true);
			if (this.redoBtn) this.redoBtn.disabled = !can(false);
		} catch (_) { wsCatch('WsRevisionsView: paintUndo', _); }
	}
	async undoRedo(back: boolean) {
		const m = this.merge;
		if (m) { (back ? undo : redo)({ state: m.b.state, dispatch: (tr) => m.b.dispatch(tr) }); this.paintUndo(); return; }
		if (this.busy) return;
		const from = back ? this.undos : this.redos, to = back ? this.redos : this.undos;
		const step = from.pop();
		if (!step) return;
		this.busy = true;
		try {
			const cur = await this.plugin.revNoteText(this.note);
			// (the note written in since: what was done here is not what it holds now, so nothing is taken back)
			if (cur == null || cur !== (back ? step.after : step.before)) {
				this.undos = []; this.redos = [];
				new Notice(wsT('Word-Smith: the note changed; there is nothing to undo here.'));
				await this.redraw();
				return;
			}
			const next = back ? step.before : step.after;
			if (next !== cur) await this.writeNote(cur, next);
			this.kept = new Set(back ? step.keptBefore : step.keptAfter);
			to.push(step);
			await this.redraw();
		} catch (_) { wsCatch('WsRevisionsView: undoRedo', _); }
		finally { this.busy = false; }
	}

	// ── THE KEYS: ↑ ↓ from change to change, ← → older and newer, A accepts, R rejects, Ctrl+Z and Ctrl+Shift+Z ──
	nextOf(dir: number) { return this.entries[this.entries.findIndex((e) => e.path === this.pick) + dir] || null; }
	canStep(dir: number) { return !!this.nextOf(dir); }
	step(dir: number) {
		const n = this.nextOf(dir);
		if (!n) return;
		this.pick = n.path; this.kept.clear(); this.focusAt = -1;
		void this.flushEdits().then(() => this.redraw());
	}
	onKey(e: KeyboardEvent) {
		// an editor's keys are its own (the right side is written in), and a field's
		if ((e.target as HTMLElement).closest('input, textarea, .cm-editor')) return;
		if (this.pop && this.pickerKey(e)) { e.preventDefault(); return; }
		const mod = e.ctrlKey || e.metaKey;
		if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); void this.undoRedo(!e.shiftKey); return; }
		if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); void this.undoRedo(false); return; }
		// (Ctrl or Cmd with a letter is Obsidian's or the system's: select all, reload)
		if (mod || e.altKey) return;
		if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(1); return; }
		if (e.key === 'ArrowRight') { e.preventDefault(); this.step(-1); return; }
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const m = this.merge;
			if (m && WS_MERGE) { (e.key === 'ArrowDown' ? WS_MERGE.goToNextChunk : WS_MERGE.goToPreviousChunk)({ state: m.b.state, dispatch: (tr) => m.b.dispatch(tr) }); return; }
			this.moveFocus(e.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		const cur = this.contentEl.querySelector<HTMLElement>('.ws-rev-chg.is-focus');
		if (!cur) return;
		if (e.key === 'a' || e.key === 'A') { e.preventDefault(); const b = cur.querySelector<HTMLElement>('.ws-rev-acts button.is-accept'); if (b) b.click(); }
		if (e.key === 'r' || e.key === 'R') { e.preventDefault(); const b = cur.querySelector<HTMLElement>('.ws-rev-acts button.is-reject'); if (b) b.click(); }
	}
	moveFocus(dir: number) {
		const els = Array.from(this.contentEl.querySelectorAll<HTMLElement>('[data-ch]'));
		if (!els.length) return;
		this.focusAt = Math.max(0, Math.min(els.length - 1, (this.focusAt < 0 ? (dir > 0 ? -1 : els.length) : this.focusAt) + dir));
		this.paintFocus();
		const el = els.find((x) => Number(x.dataset.ch) === this.focusAt);
		if (el) el.scrollIntoView({ block: 'center' });
	}
	paintFocus() {
		this.contentEl.querySelectorAll<HTMLElement>('[data-ch]').forEach((x) => x.toggleClass('is-focus', Number(x.dataset.ch) === this.focusAt));
		// THE CHIP IN THE MARGIN, OR ABOVE ITS CHANGE where the margin has no room (a phone, a narrow pane); and inside the tab:
		// a change near its right edge pushed its Accept and Reject past it
		const chg = this.contentEl.querySelector<HTMLElement>('.ws-rev-chg.is-focus');
		const acts = chg ? chg.querySelector<HTMLElement>('.ws-rev-acts') : null;
		if (chg && acts) {
			const box = this.contentEl.getBoundingClientRect();
			chg.removeClass('is-above');
			acts.style.removeProperty('left');
			if (acts.getBoundingClientRect().left < box.left + 4) {
				chg.addClass('is-above');
				const over = acts.getBoundingClientRect().right - box.right + 6;
				if (over > 0) acts.style.left = -over + 'px';
			}
		}
	}
} : null;
