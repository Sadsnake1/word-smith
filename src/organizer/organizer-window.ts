// Word-Smith — Organizer: the Organizer: the window, its doors, the index glue, the ticks, the tree hooks.
//
// Part of the plugin class, cut out by area: the
// methods below are assigned onto WordSmith.prototype at the end of plugin.ts
// and declared on the class there, so every `this.x()` reaches them exactly
// as before, from any file. `this` is the plugin.

import { Menu, setIcon, getAllTags, Platform, ItemView } from 'obsidian';
import type { Events, WorkspaceLeaf, TAbstractFile, Modifier, KeymapEventListener, MenuItem } from 'obsidian';
import type { WsHost, WsFileLike, WsOrgDoor, WsOrgMenuCtx, WordSmithSettings } from '../core/settings';
import { wsCountFootnotes, wsOrgAgg, wsOrgCounts, wsOrgDistinct, wsOrgIndex, wsOrgPathsUnder, wsOrgPut, wsOrgRemove, wsOrgRename, wsOrgStale } from './org-index';
import type { WsOrgIndexMap } from './org-index';
import { wsOrgDrawBar } from './organizer-bar';
import { wsOrgDrawTable } from './organizer-table';
import { wsOrgCellsMake } from './organizer-cells';
import { wsOrgChromeMake } from './organizer-chrome';
import { wsOrgChipsMake } from './organizer-chips';
import { wsOrgColsMake } from './organizer-cols';
import { wsOrgDragMake } from './organizer-drag';
import { wsOrgFilesMake } from './organizer-files';
import { wsOrgFlagsMake } from './organizer-flags';
import { wsOrgJournalMake } from './organizer-journal';
import { wsOrgKeysMake } from './organizer-keys';
import { WsLensSort, WsLensChip, wsOrgLensMake } from './organizer-lens';
import { wsOrgModeMake } from './organizer-mode';
import { wsOrgNavMake } from './organizer-nav';
import { wsOrgPropsMake } from './organizer-props';
import { wsOrgReadingsMake } from './organizer-readings';
import { wsOrgRenameMake } from './organizer-rename';
import { wsOrgRowsMake } from './organizer-rows';
import { wsOrgScopeMake } from './organizer-scope';
import { wsOrgSelMake } from './organizer-sel';
import { wsOrgShapeMake } from './organizer-shape';
import { wsOrgTicksMake } from './organizer-ticks';
import { wsOrgWidthsMake } from './organizer-widths';
import { wsOrgWritesMake } from './organizer-writes';
import { wsOrgZoomMake } from './organizer-zoom';
import type { WsOrgCtx, WsOrgCtxOwn } from './org-ctx';
import type { WsOrgRow } from './organizer-rows';
import { WS_FOLDER_COLOURS, WS_OUTLINER_VIEW, WS_PANE_CLASSES, WS_PANE_VIEWS, WS_STATUSES, WS_WRITE, WsOutlinerView, wsCatch, wsCtxLend, wsElShown, wsFlagSvg, wsFolderSvg, wsGuard, wsGuardReport, wsMenuIsNative, wsSessionNew, wsSortArrow, wsSvgInto, wsBag, wsStatOf, wsStr, wsErrMsg, wsTimedRead } from '../core/preamble';
import { wsT, wsUiDate } from '../core/ui-text';
import type WordSmith from '../plugin/plugin';
import type { WsModEvent, WsHistoryTabState, WsOrgExportCtx, WsExportPanelHandle, WsOrgHistoryCtx } from '../plugin/plugin';

// THE WINDOW'S FRAME: no title, the stores, the document and window it lives in, the skeleton and the nav
// (lifted out of openManuscriptModal, 2026-10-30). It reads the host and the options only; everything after
// it in the window reads what it hands back.
function wsOrgWindowFrame(plugin: WordSmith, host: WsHost, o: { tab?: string; host?: WsHost; only?: boolean }) {
	// ── NO TITLE ON THIS WINDOW ─────────────────────────────────────────
	//
	// The title ELEMENT stays where Obsidian put it and simply holds
	// nothing. Removing it is not ours to do: it is the modal's own
	// furniture, and a theme that positions the close button against it
	// would have nothing to position against.
	host.rootEl.addClass('ws-uni-modal');
	if (host.paneClass) host.rootEl.addClass(host.paneClass);
	// One aurora palette per OPENING, not per draw: the inspector
	// rebuilds on every tab switch and on every cursor move, and
	// re-rolling the colours there reads as a glitch rather than as a
	// thing you were dealt. Same reason, same line, as the report.
	plugin._auroraSeed = Math.random();

	const s = plugin.settings;
	for (const k of ['fileGoals', 'fileStatus']) {
		if (!wsBag(s)[k]) wsBag(s)[k] = {};
	}
	// DEAD KEYS, DELETED ON LOAD: a dead key that still parses is a trap for
	// whoever reuses the name.
	delete s.orgLenses;
	delete s.uniSlimCol;
	delete s.organizerView;
	delete s.organizerDrawer;
	// ONE STORE FOR TARGETS: a folder is the sum of its notes, and the table
	// gets a folder row's number from `ORG_AGG` summing over the rows as shown.
	const goalStore   = (): 'fileGoals' => 'fileGoals';
	// ONE STORE, because only files have flags; `markOf` answers '' for a
	// folder rather than reading a key that does not exist.
	const statusStore = (): 'fileStatus' => 'fileStatus';
	const targetOf = (path: string|number) => Number(s[goalStore()][path]) || 0;
	const markOf   = (path: string|number, kind: string) => (kind === 'folder' ? ''
		: (s[statusStore()][path] || ''));

	// ── WHICH DOCUMENT THIS WINDOW IS IN ────────────────────────────
	//
	// A POPOUT IS A DIFFERENT DOCUMENT. This window is a leaf as well as
	// a sheet, and a leaf can be dragged into its own OS window - which
	// `openOutlinerPane` has always said is the whole reason it is one.
	// In that window `document` and `window` still name the MAIN one, so
	// every bare reference addresses a page the writer is not looking at:
	// a selection that never highlights, a drag whose mouseup never
	// arrives, an Escape that reaches nothing.
	//
	// ONE WRITER FOR THE FACT. Everything below asks these two rather
	// than the globals, so there is one description of where this window
	// lives instead of eight that have to be kept in step.
	//
	// FALLING BACK TO THE GLOBALS is not a nicety: `contentEl` is detached
	// in a fixture, where `ownerDocument` is still right but `defaultView`
	// can be null.
	const ownerDoc = () => {
		try { return host.contentEl.ownerDocument || document; }
		catch { return document; }
	};
	const ownerWin = () => {
		try { return ownerDoc().defaultView || window; }
		catch { return window; }
	};
	const body  = host.contentEl.createDiv({ cls: 'ws-uni-body' });
	// ACROSS THE TOP OF THE WINDOW, not inside the inspector: a tab that
	// hides the inspector would hide the tabs with it.
	const tabsRow = body.createDiv({ cls: 'ws-uni-tabs' });
	// ONE TAB ONLY: a pane built for one tab hides the strip — the three
	// tabs are three panes — and its tab cannot be switched.
	const single = !!o.only;
	if (single) body.addClass('is-single');
	// ONE COLUMN. `cols` keeps its box for the stylesheet's sake and holds
	// the one pane there is.
	const cols  = body.createDiv({ cls: 'ws-uni-cols' });
	const right = cols.createDiv({ cls: 'ws-uni-right' });
	const foot  = body.createDiv({ cls: 'ws-uni-foot' });

	// NARROW IS MEASURED, NOT ASKED OF THE PLATFORM. A sheet is always the
	// same size, but a leaf is whatever width the writer dragged it to —
	// docked into a sidebar it can be 260px on a desktop. The phone still
	// declares itself, because a phone is narrow before anything has been
	// measured; a pane is measured, and re-measured when it is dragged
	// (`ResizeObserver`).
	//
	// THE THRESHOLD HAS ONE READER: `--ws-uni-narrow`, declared on
	// `.ws-uni-modal` in the stylesheet beside the rules it switches. The
	// `700` is a fallback for a root that is not styled yet; a test
	// holds it against the stylesheet's own number so the two cannot drift.
	// A PANE BUILT FOR ONE TAB HAS NO TREE COLUMN TO STACK, so its limit is
	// the phone's, `--ws-uni-narrow-single`, not the two-column window's.
	const orgNarrowLimit = () => {
		const fallback = single ? 420 : 700;
		try {
			const said = getComputedStyle(host.rootEl)
				.getPropertyValue(single ? '--ws-uni-narrow-single' : '--ws-uni-narrow');
			const n = parseInt(String(said).trim(), 10);
			return isFinite(n) && n > 0 ? n : fallback;
		} catch { return fallback; }
	};
	const narrow = !!(Platform && Platform.isMobile);
	if (narrow) host.rootEl.addClass('is-narrow');
	// organizer-nav.ts reads this closure through the names below and
	// nothing else; the aliases keep the names the closure calls.
	const orgNav = wsOrgNavMake({
		plugin,
		get body() { return body; },
		get host() { return host; },
		get narrow() { return narrow; },
		get orgNarrowLimit() { return orgNarrowLimit; },
	});
	return { body, foot, goalStore, markOf, orgNav, ownerDoc, ownerWin, right, s, single, statusStore, tabsRow, targetOf };
}

// A FOLDER CHOSEN FOR THE WINDOW from Obsidian's tree, by its right-click ("Organizer here", "History here"; lifted
// out of openManuscriptModal, A888). A plain click on a folder there chooses nothing (A892).
function wsOrgDoorSelect(a: { orgScope: ReturnType<typeof wsOrgScopeMake>; orgSelect: (p: string) => void; tab: string }, p: string) {
	const { orgScope, orgSelect, tab } = a;
	// A folder chosen while History is up is the folder's history: the note
	// it was scoped to is let go. `orgSelect` keeps a note that is under the
	// folder, which is right for the table's cursor and wrong for a scope.
	if (tab === 'history') orgScope.orgNote = '';
	orgSelect(p == null || p === '/' ? '' : String(p));
}

// A NOTE, as the window hears of it (lifted out of openManuscriptModal, A888): one opened anywhere, or one CHOSEN by
// the tree's right-click ("History here" on a note).
function wsOrgDoorFollow(a: { drawPanel: () => void; exportOpts: WsExportPanelHandle | null; orgFollow: (it: { path: string; kind: string; }, keepScope: boolean, markOnly?: boolean) => void; orgScope: ReturnType<typeof wsOrgScopeMake>; tab: string }, p: string, chosen?: boolean) {
	const { drawPanel, exportOpts, orgFollow, orgScope, tab } = a;
	if (!p) return;
	// NOTHING OPENED ELSEWHERE MOVES THE WINDOW (A892, the writer: "i dont want to click on folders and the organizer
	// to switch there. remove that, including history too, so remove the pin too"): a note the window shows is marked
	// and that is all; one it does not show changes nothing; and on History, whose subject the mark is, not even the
	// mark. A note CHOSEN is followed as before: the window keeps its folder when it holds the note, and History
	// takes the note as its subject.
	if (!chosen && (tab === 'history' || !orgScope.orgScopeShows(String(p)))) return;
	orgFollow({ kind: 'file', path: String(p) }, true, !chosen);
	drawPanel();
	// THE READER FOLLOWS TOO: click a ticked file in Obsidian's tree and the
	// reader goes to it.
	if (exportOpts && exportOpts.jumpTo && tab === 'export') {
		try { exportOpts.jumpTo(String(p)); } catch (_) { wsCatch('treeDoor.follow: exportOpts.jumpTo(String(p));', _); }
	}
}

// Ctrl+Z and Ctrl+Y on the Organizer: History's undo and redo, for this pane only (lifted out of openManuscriptModal, A888).
function wsOrgHistKey(a: { host: WsHost; orgHistMine: () => boolean; orgHistRun: (dir: string) => Promise<boolean>; ownerDoc: () => Document; tab: string }, ev: KeyboardEvent) {
	const { host, orgHistMine, orgHistRun, ownerDoc, tab } = a;
	if (tab !== 'organizer') return;
	if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
	const k = String(ev.key || '').toLowerCase();
	if (k !== 'z' && k !== 'y') return;
	const t = ev.target as HTMLElement | null;
	const doc = ownerDoc();
	const inPane = t && host.contains(t);
	const onBody = t === doc.body || t === doc.documentElement;
	if (!inPane && !onBody) return;
	if (inPane && t.closest && t.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
	// A KEY FROM THE BODY — a row was clicked, nothing took the focus —
	// goes to ONE pane: a leaf's when Obsidian says its leaf is the active
	// one, a modal's when it is the pane last touched. A last-touched mark
	// can point at a modal that has since closed, its listener gone with
	// it, so the leaf is asked of the API first.
	if (onBody && !orgHistMine()) return;
	const root = host.rootEl || host.contentEl;
	if (!root || !doc.body || !doc.body.contains(root)) return;
	ev.preventDefault();
	ev.stopPropagation();
	if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
	void orgHistRun((k === 'y' || ev.shiftKey) ? 'redo' : 'undo');
}

// Whether a key from the body is this pane's (lifted out of openManuscriptModal, A888).
function wsOrgHistMine(plugin: WordSmith, a: { host: WsHost; onHistKey: (ev: KeyboardEvent) => void }) {
	const { host, onHistKey } = a;
	try {
		if (host.kind === 'leaf' && host.view && host.view.leaf && plugin.app.workspace) {
			// The active view, asked of the API (activeLeaf is deprecated): ours
			// is an ItemView, so the question is whether the active one IS it.
			return plugin.app.workspace.getActiveViewOfType(ItemView) === host.view;
		}
	} catch (_) { wsCatch('orgHistMine: this.app.workspace.getActiveViewOfType(ItemView) === host.view', _); }
	return plugin._orgHistActive === onHistKey;
}

// THE WINDOW CLOSED: every door, watcher and listener it put up comes down (lifted out of openManuscriptModal, A888).
function wsOrgWindowClosed(plugin: WordSmith, a: { onHistKey: (ev: KeyboardEvent) => void; orgIndexChanged: () => void; orgNav: ReturnType<typeof wsOrgNavMake>; orgPropPopClose: () => void; orgScope: ReturnType<typeof wsOrgScopeMake>; orgWidths: ReturnType<typeof wsOrgWidthsMake>; stopEscape: () => void; stopWatching: () => void; treeDoor: WsOrgDoor }) {
	const { onHistKey, orgIndexChanged, orgNav, orgPropPopClose, orgScope, orgWidths, stopEscape, stopWatching, treeDoor } = a;
	// THE DOOR GOES WITH THE WINDOW: a closed window that kept its door
	// would be chosen into by every folder click.
	try { plugin.orgWindowDrop(treeDoor); } catch (_) { wsCatch('openManuscriptModal: this.orgWindowDrop(treeDoor);', _); }
	try { stopWatching(); } catch (_) { wsCatch('openManuscriptModal: stopWatching();', _); }
	// THE THIRD ONE. The Escape ladder is on `window`, which means a
	// window that forgets to unregister it does not merely leak — it
	// goes on swallowing Escape for a window nobody can see.
	try { stopEscape(); } catch (_) { wsCatch('openManuscriptModal: stopEscape();', _); }
	try { if (plugin._orgHistActive === onHistKey) plugin._orgHistActive = null; } catch (_) { wsCatch('openManuscriptModal: this._orgHistActive = null;', _); }
	// AND THE WIDTH WATCHER. A ResizeObserver holds its callback, and
	// its callback holds this whole window — a pane closed without
	// this keeps two thousand lines alive and toggles a class on an
	// element nothing can see, every time the workspace moves.
	try { orgNav.stopWidth(); } catch (_) { wsCatch('openManuscriptModal: stopWidth();', _); }
	try { orgNav.stopNav(); } catch (_) { wsCatch('openManuscriptModal: stopNav();', _); }
	// AND THE INDEX BELL, for the same reason: the index outlives the
	// window on purpose (it is the plugin's), so a subscription left
	// behind would redraw a tree nothing can see on every keystroke.
	try { orgIndexChanged(); } catch (_) { wsCatch('openManuscriptModal: orgIndexChanged();', _); }
	try { if (orgScope.orgDrawTimer) window.clearTimeout(orgScope.orgDrawTimer); } catch (_) { wsCatch('openManuscriptModal: if (orgDrawTimer) window.clearTimeout(orgDrawTimer);', _); }
	// AND THE PROPERTIES PANEL, which hangs on the shared body and
	// would otherwise outlive the window that opened it — with two
	// capture listeners on the window still eating clicks and Escape.
	// AND THE SEAM’S OBSERVER, for the reason every other one here is
	// dropped: it holds a callback that holds this whole window, and it
	// would go on measuring a table nothing can see.
	try {
		if (orgWidths.orgNameRO) { orgWidths.orgNameRO.disconnect(); orgWidths.orgNameRO = null; }
	} catch (_) { wsCatch('openManuscriptModal: if (orgNameRO) orgNameRO.disconnect();', _); }
	try { orgPropPopClose(); } catch (_) { wsCatch('openManuscriptModal: orgPropPopClose();', _); }
}

// THE ACTIVE NOTE IS THE OPENING SELECTION (lifted out of openManuscriptModal, A888).
function wsOrgOpenOnNote(plugin: WordSmith, a: { folderOf: (path: string) => string; orgFollow: (it: { path: string; kind: string; }, keepScope: boolean, markOnly?: boolean) => void; orgOpen: Set<string>; s: WordSmithSettings; tab: string }) {
	const { folderOf, orgFollow, orgOpen, s, tab } = a;
	if (tab === 'organizer') {
		try {
			// `activeNoteFile()` — the SAME source the cursor placement
			// above reads. Two answers to "the note in hand" is how the
			// mark and the cursor came to stand on different rows.
			const af = plugin.activeNoteFile ? plugin.activeNoteFile() : null;
			if (af && af.path && /\.md$/i.test(af.path)
				&& !(plugin.isStoreFile && plugin.isStoreFile(af.path))) {
				// ── THE ACTIVE NOTE CHOOSES THE FOLDER ONCE A SESSION ─────────
				//
				// Two good rules meet here: a writer mid-scene opens the Organizer
				// ABOUT that scene, and the window comes back the way it was left.
				// They are split by the session. The FIRST time this window opens after
				// Obsidian starts, the note in hand chooses the folder — nothing has
				// been left anywhere to come back to. Every open after that keeps the
				// folder the writer was in.
				//
				// THE NOTE IS STILL MARKED EITHER WAY — `markOnly` marks and leaves the
				// scope alone, so "the note I am in is highlighted" survives; it is
				// only the JUMP that stops.
				let been = null;
				try { been = plugin._wsSession ? plugin._wsSession.folder : null; } catch (_) { wsCatch('openManuscriptModal: been = this._wsSession ? this._wsSession.folder : null;', _); }
				orgFollow({ path: af.path, kind: 'file' }, true, been !== null);
				// (The cursor is already standing on the active note —
				// the open logic above placed it; one writer.)
				let dir = folderOf(af.path);
				// ── …AND IN THE TABLE, WHICH FOLDS ON ITS OWN STORE ──────
				//
				// The table folds on `orgOpen`. Keeping the writer's chosen folder
				// (see `keepScope`) can leave the note nested two levels down inside
				// it, and a marked row nobody can see is not a mark.
				//
				// SET DIRECTLY, NOT THROUGH `orgOpenSet`: that one saves and redraws
				// on every call, which down a deep path is a write and a repaint per
				// ancestor, before the first paint has happened. Persisted once below —
				// and only when an ancestor was shut: every open of the window wrote
				// data.json whole otherwise, on the pane's rebuild at every plugin load.
				let opened = 0;
				while (dir) {
					if (!orgOpen.has(dir)) { orgOpen.add(dir); opened++; }
					dir = folderOf(dir);
				}
				if (opened) {
					s.organizerOpen = Array.from(orgOpen);
					plugin.saveSettings().catch(() => {});
				}
			}
		} catch (_) { wsCatch('openManuscriptModal: const af = this.activeNoteFile ? this.activeNoteFile() : null;', _); }
	}
}

export const organizerWindowMethods = {

	// ── A FOLDER'S OWN MENU ──────────────────────────────────────────────────
	//
	// A METHOD, not a closure inside `onload`: everything this adds to a
	// folder's right-click — its colour, its flag — is behaviour a test can
	// drive only if it can build the menu.
	// THE REPORT ROW, on both trees. It was on the Outliner's menu and not on
	// the file explorer's, so the same right-click answered differently
	// depending on which tree the row was in — and the explorer is the tree a
	// writer is in most of the time.
	fileMenuReportRow(this: WordSmith, menu: Menu, path: string) {
		if (!path) return;
		menu.addItem((i: MenuItem) => i.setTitle(wsT('Report on this')).setIcon('bar-chart-2')
			.onClick(() => { try { this.openReportModal(path); } catch (_) { wsCatch('fileMenuReportRow: this.openReportModal(path);', _); } }));
	},

	fileMenuFor(this: WordSmith, menu: Menu, file: WsFileLike, org?: WsOrgMenuCtx) {
		if (!file || !file.path) return;
		const isFolder = !!file.children;
		// ── NOT ON EMPTY SPACE ──────────────────────────────────────────────
		//
		// Right-clicking the blank area under the last row of the file explorer
		// fires this event for the VAULT ROOT, and Obsidian's own menu there is
		// the two things you can do with no row under the pointer: New note, New
		// folder. Every row this plugin adds is about a thing that was clicked.
		// The root is `/` here and `''` everywhere else in this plugin.
		if (file.path === '/' || file.path === '') return;
		const path = file.path;

		this.fileMenuReportRow(menu, path);
		// The Organizer's rows: Organizer here, Export this, History here — the
		// tree as the window's remote, from the menu.
		try { this.fileMenuOrganizerRows(menu, file); } catch (_) { wsCatch('fileMenuFor: this.fileMenuOrganizerRows(menu, file);', _); }

		// FILE-ONLY: only files have flags. The row that reaches this closure is
		// refused for a folder below, and there is no folder store to name.
		const store = 'fileStatus';
		const nowFlag = (this.settings[store] || {})[path] || '';
		const setFlag = async (id: string) => {
			// (from an Organizer row, through its journal and selection: A869)
			if (org && org.flag) { await org.flag(path, id); return; }
			const all = Object.assign({}, this.settings[store] || {});
			if (id) all[path] = id; else delete all[path];
			this.settings[store] = all;
			await this.saveSettings(true);
			try { void this.patchExplorerDOM(); } catch (_) { wsCatch('fileMenuFor / setFlag: this.patchExplorerDOM();', _); }
		};
		const flagRows = (into: Menu) => {
			// EVERY STATE LISTED, not a cycle: a menu is a place to choose,
			// and asking somebody to press a row four times to reach "Done" is
			// a cycle wearing a menu's clothes.
			for (const st of WS_STATUSES) {
				into.addItem((i: { setTitle: (arg0: DocumentFragment) => void; setChecked: (arg0: boolean) => void; onClick: (arg0: () => Promise<void>) => void; }) => {
					const frag = createFragment();
					const mark = createSpan();
					mark.className = 'ws-menuflag is-' + st.id;
					wsSvgInto(mark, wsFlagSvg(st.id, 12));
					frag.appendChild(mark);
					frag.appendChild(document.createTextNode(st.label));
					i.setTitle(frag);
					i.setChecked(nowFlag === st.id);
					i.onClick(() => setFlag(st.id));
				});
			}
			into.addItem((i: MenuItem) => i.setTitle(wsT('No flag')).setChecked(!nowFlag)
				.onClick(() => setFlag('')));
		};

		const nowColour = (this.settings.folderColors || {})[path] || '';
		const setColour = async (id: string) => {
			if (org && org.colour) { await org.colour(path, id); return; }
			const all = Object.assign({}, this.settings.folderColors || {});
			if (id) all[path] = id; else delete all[path];
			this.settings.folderColors = all;
			await this.saveSettings();
			try { void this.patchExplorerDOM(); } catch (_) { wsCatch('fileMenuFor / colourRow: this.patchExplorerDOM();', _); }
			// …AND EVERY OTHER TREE SHOWING THIS FOLDER. The line above repaints
			// Obsidian's explorer and nothing else; without this a colour set from
			// the Organizer's own right-click changed the explorer behind it and not
			// the row that had just been clicked.
			try { this.treeOrderChanged(); } catch (_) { wsCatch('fileMenuFor / colourRow: this.treeOrderChanged();', _); }
		};
		const colourRow = (into: Menu) => {
			// A NATIVE MENU GETS THE COLOURS BY NAME, one row each, the current one
			// ticked: it would draw the balls below as one blank row that does
			// nothing (Settings → Appearance → Native menus, on by default on a Mac).
			if (wsMenuIsNative(menu)) {
				for (const c of WS_FOLDER_COLOURS) {
					into.addItem((i: MenuItem) => i.setTitle(wsT(c.label)).setChecked(nowColour === c.id)
						.onClick(() => { void setColour(c.id); }));
				}
				return;
			}
			into.addItem((i: { setTitle: (arg0: DocumentFragment) => void; }) => {
				const frag = createFragment();
				const row = createSpan();
				row.className = 'ws-folderdots';
				for (const c of WS_FOLDER_COLOURS) {
					const dot = createSpan();
					dot.className = 'ws-folderdot' + (c.id ? '' : ' is-none')
						+ (nowColour === c.id ? ' is-on' : '');
					if (c.css) dot.style.backgroundColor = c.css;
					dot.setAttribute('aria-label', wsT(c.label));
					dot.title = wsT(c.label);
					dot.addEventListener('click', (ev2) => { void (async () => {
						ev2.preventDefault();
						ev2.stopPropagation();
						await setColour(c.id);
						try { menu.hide(); } catch (_) { wsCatch('fileMenuFor / colourRow: menu.hide();', _); }
					})(); });
					row.appendChild(dot);
				}
				frag.appendChild(row);
				i.setTitle(frag);
			});
		};

		// SUBMENUS, because this is somebody else's menu. A right-click
		// already carries eight of Obsidian's own rows, and ours in the middle
		// of them made the plugin the loudest thing in a menu that is mostly
		// about renaming and deleting. `setSubmenu` is recent; where it is
		// missing the rows go inline, which is what they did before and is
		// worse rather than broken.
		const folded = (title: string, icon: string, fill: (into: Menu) => void) => {
			menu.addItem((i) => {
				i.setTitle(title);
				try { if (i.setIcon) i.setIcon(icon); } catch (_) { wsCatch('fileMenuFor / folded: if (i.setIcon) i.setIcon(icon);', _); }
				let sub = null;
				try { if (typeof i.setSubmenu === 'function') sub = i.setSubmenu(); } catch (_) { wsCatch('fileMenuFor / folded: if (typeof i.setSubmenu === \'function\') sub = i.setSubmenu();', _); }
				if (sub) fill(sub);
				else { i.setIsLabel(true); fill(menu); }
			});
		};

		// COLOUR IS A FOLDER'S. It is drawn on the folder glyph, and a note
		// has none — a colour that changed nothing anybody can see is a
		// setting that reads as broken.
		if (isFolder) folded(wsT('Folder color'), 'palette', colourRow);
		// AND A FLAG IS A FILE'S, the mirror of the line above it. ONE guard
		// closes all THREE doors, because all three funnel through here: the
		// explorer's right-click, the Organizer tree's row menu, and the
		// table's group-header menu.
		if (!isFolder && WS_STATUSES.length) folded(wsT('Flag'), 'flag', flagRows);

	},

	// ── ANY PROPERTY, AS A COLUMN ───────────────────────────────────────────
	//
	// A writer who keeps `deadline:` or `pov:` in their frontmatter can put it
	// in the Organizer beside the word counts — out of the metadata cache,
	// never written.
	//
	// A USER COLUMN'S ID IS NAMESPACED — `fm:deadline`, not `deadline` —
	// because the built-in ids are stored in `uniColsOff` and as the sort, and
	// a property called `words` or `mark` would otherwise silently become one
	// of ours.
	propColId(this: WordSmith, key: string) { return 'fm:' + String(key || ''); },

	propColKey(this: WordSmith, id: string) {
		const s = String(id || '');
		return s.indexOf('fm:') === 0 ? s.slice(3) : '';
	},

	// The raw value, whatever YAML made of it.
	//
	// ── THE KEY IS MATCHED WITHOUT REGARD TO CASE ───────────────────────────
	//
	// YAML keys ARE case-sensitive and Obsidian's cache reports them exactly
	// as typed, so `date:` in one note and `Date:` in another are two
	// different properties as far as the vault is concerned. They are not two
	// different properties as far as the WRITER is concerned — it is the same
	// field typed twice over months — and the consequence is two columns,
	// both labelled DATE, each half full.
	//
	// So one column reads either spelling. This is the plugin being lenient
	// about a distinction the writer did not mean to draw, which is the same
	// judgement the goals file makes when it accepts a hyphen where it writes
	// an em dash.
	//
	// EXACT FIRST, THEN THE FIRST CASE-INSENSITIVE MATCH IN THE NOTE'S OWN KEY
	// ORDER. A note carrying BOTH spellings is the case that has to be
	// decided rather than left to chance: the exact one is what the column
	// asked for and wins, and where neither is exact the note's own ordering
	// decides, which is stable across reads.
	propRaw(this: WordSmith, path: string, key: string): unknown {
		try {
			const want = String(key || '');
			if (!want) return undefined;
			const f = this.app.vault.getAbstractFileByPath(String(path || ''));
			if (!f || f.children) return undefined;
			const cache = this.app.metadataCache
				&& this.app.metadataCache.getFileCache(f);
			const fm = cache && cache.frontmatter;
			// ── NO FRONTMATTER IS NOT THE SAME AS NO PROPERTY ─────────────────
			//
			// A `.md` with none has none: Obsidian owns that answer and this
			// must not offer a second one. A file that CANNOT hold
			// frontmatter keeps its properties in `ws-structure.md`, and
			// `propStoreHolds` is the one predicate that tells the two apart
			// — so a note falls straight through this branch unchanged.
			if (!fm) {
				const sv = this.propStoreGetSync(String(path || ''), want);
				return sv === '' ? undefined : sv;
			}
			if (Object.prototype.hasOwnProperty.call(fm, want)) return fm[want];
			const low = want.toLowerCase();
			for (const k of Object.keys(fm)) {
				if (k.toLowerCase() === low) return fm[k];
			}
			return undefined;
		} catch { return undefined; }
	},

	// What a cell says. A LIST BECOMES A COUNT, with the values on the hover:
	// the Tags column already learnt this — six values rendered small are six
	// unreadable words in a column that then decides how wide every row is.
	// A nested map has no reading at all and says so rather than printing
	// `[object Object]`.
	propText(this: WordSmith, path: string, key: string) {
		const v = this.propRaw(path, key);
		if (v == null || v === '') return '';
		// ── A LIST SAYS WHAT IS IN IT, NOT HOW MUCH ────────────────────────
		//
		// JOINED, AND LET THE COLUMN CUT IT. `widthOf` caps a property column
		// at COL_MAX_TEXT_CH, the cell ellipses, and `propTitle` already put
		// the whole list on the hover — so "Anna, Ben, Cora" becomes
		// "Anna, Ben, C…" in a narrow pane and the full list is one hover
		// away. That is strictly more than a count could say in the same room,
		// which is the answer to what a long list of tags does here.
		if (Array.isArray(v)) {
			const kept = v.filter(x => x != null && typeof x !== 'object');
			return kept.length ? kept.map(String).join(', ') : '';
		}
		if (typeof v === 'object') return '\u2014';
		if (typeof v === 'boolean') return v ? 'yes' : 'no';
		return wsStr(v);
	},

	propTitle(this: WordSmith, path: string, key: string) {
		const v = this.propRaw(path, key);
		if (Array.isArray(v)) {
			return v.filter(x => x != null && typeof x !== 'object').map(String).join(', ');
		}
		if (v && typeof v === 'object') return 'Word-Smith cannot show a nested property in a column.';
		return v == null ? '' : wsStr(v);
	},

	// ── HOW A PROPERTY SORTS, WHICH IS THE WHOLE DIFFICULTY ─────────────────
	//
	// `deadline: 2028-08-18` is parsed by YAML as a DATE. `deadline: 18 Aug
	// 2028` is a STRING — and sorted as one, "18 Aug 2028" comes before
	// "2 Sep 2027", because "1" sorts before "2". The column looks sorted.
	// It is confidently wrong and nothing on screen says so.
	//
	// So the type is SNIFFED ACROSS THE VALUES ACTUALLY PRESENT rather than
	// guessed from the first one: every value a number is numeric, every
	// value a parseable date is chronological, anything else is text. All or
	// nothing — one unparseable value among fifty dates makes the column
	// text, because a mixed column sorted as dates puts that row somewhere
	// arbitrary and the writer cannot see which rule it lost to.
	//
	// AND THE ANSWER IS SHOWN, in the column's own menu, and can be
	// overridden — a guess a writer can see and correct is a different thing
	// from a guess.
	//
	// DATES ARE NOT PARSED BY `new Date(string)` ALONE. That accepts almost
	// anything and invents a reading for it: `new Date('Chapter 4')` is
	// Invalid, but `new Date('4')` is the year 2001. So a bare number is
	// never a date, and a string has to carry a month name or two
	// separators before it is offered to the parser at all.
	propLooksLikeDate(this: WordSmith, v: unknown) {
		if (v instanceof Date) return !isNaN(v.getTime());
		if (typeof v !== 'string') return false;
		const s = v.trim();
		if (!s || /^-?[\d.,]+$/.test(s)) return false;
		const shaped = /\d{4}-\d{2}-\d{2}/.test(s)
			|| /\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(s)
			|| /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s);
		if (!shaped) return false;
		const t = Date.parse(s);
		return !isNaN(t);
	},

	propSortAs(this: WordSmith, key: string, paths: string[]) {
		const seen = [];
		for (const p of (paths || [])) {
			const v = this.propRaw(p, key);
			if (v == null || v === '') continue;
			if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date))) continue;
			seen.push(v);
		}
		if (!seen.length) return 'text';
		if (seen.every(v => typeof v === 'number'
			|| (typeof v === 'string' && /^-?[\d.,]+$/.test(v.trim()) && v.trim() !== ''))) {
			return 'number';
		}
		if (seen.every(v => this.propLooksLikeDate(v))) return 'date';
		return 'text';
	},

	// ── WHAT KINDS OF FILE THE ORGANIZER DRAWS ──────────────────────────────
	//
	// One table, so the menu that offers the toggles and the test that
	// applies them cannot drift apart. `icons` is a LIST tried in order,
	// because `setIcon` with a name this build's Lucide does not know draws
	// NOTHING and does not throw.
	// ── THE TAGS ON A NOTE, AS OBSIDIAN SEES THEM ───────────────────────────
	//
	//
	// THROUGH THE METADATA CACHE, and that is the whole design decision here.
	// A tag can be written in two places — the `tags:` property and an inline
	// `#tag` in the body — and Obsidian has already resolved both. Reading the
	// frontmatter alone would quietly miss every inline tag; parsing the body
	// ourselves would be a second implementation of something the app is
	// already authoritative about, free to disagree with it.
	//
	// `getAllTags` IS THE ONE THAT KNOWS BOTH, and it is not on every API
	// version — so the cache's own two lists are the fallback, and an empty
	// array is the answer when neither is there. A throw inside a filter
	// predicate runs once per row per draw.
	//
	// THE LEADING `#` IS KEPT. It is what Obsidian returns, it is what a writer
	// recognises, and stripping it here would mean putting it back in every
	// place that shows one.
	uniTagsOf(this: WordSmith, path: string) {
		try {
			const f = this.app.vault.getAbstractFileByPath(path);
			if (!f) return [];
			const cache = this.app.metadataCache
				&& this.app.metadataCache.getFileCache(f);
			if (!cache) return [];
			const all = (typeof getAllTags === 'function') ? getAllTags(cache) : null;
			if (Array.isArray(all)) return all;
			const out = [];
			for (const t of (cache.tags || [])) {
				if (t && t.tag) out.push(String(t.tag));
			}
			const fm: unknown = cache.frontmatter && cache.frontmatter.tags;
			for (const t of (Array.isArray(fm) ? fm : (fm ? [fm] : []))) {
				const v = String(t || '').trim();
				if (v) out.push(v[0] === '#' ? v : '#' + v);
			}
			return out;
		} catch { return []; }
	},

	// Every tag in the notes currently in scope, commonest first — the list
	// the filter menu offers. Same shape as `propKeysInScope`, and for the
	// same reason: a menu of four hundred tags is not a menu, so the ones a
	// writer actually uses come first and the tail is reachable by search.
	uniTagsInScope(this: WordSmith, paths: string[]) {
		const seen = new Map<string, number>();
		for (const p of (paths || [])) {
			for (const t of this.uniTagsOf(p)) {
				seen.set(t, (seen.get(t) || 0) + 1);
			}
		}
		return Array.from(seen.keys())
			.sort((a, b) => ((seen.get(b) || 0) - (seen.get(a) || 0)) || a.localeCompare(b))
			.map(t => ({ tag: t, n: seen.get(t) || 0 }));
	},

	uniTypeGroups(this: WordSmith) {
		return [
			{ id: 'md',     label: 'Notes',  icons: ['file-text', 'file'],
				ext: ['md'] },
			{ id: 'image',  label: 'Images', icons: ['image', 'file-image', 'file'],
				ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'] },
			{ id: 'canvas', label: 'Canvas', icons: ['layout-dashboard', 'layout', 'file'],
				ext: ['canvas'] },
			{ id: 'base',   label: 'Bases',  icons: ['database', 'table', 'file'],
				ext: ['base'] },
			// THE PLAIN SHEET: `file-type` drew a page with an A on it, so a .pdf row
			// wore a different glyph from the .docx and .xlsx rows beside it — one
			// difference, in the one place the format is already written out in words.
			{ id: 'pdf',    label: 'PDFs',   icons: ['file'],
				ext: ['pdf'] },
			{ id: 'audio',  label: 'Audio',  icons: ['file-audio', 'music', 'file'],
				ext: ['mp3', 'wav', 'm4a', 'ogg', 'flac', '3gp'] },
			{ id: 'video',  label: 'Video',  icons: ['file-video', 'video', 'file'],
				ext: ['mp4', 'mkv', 'mov', 'webm', 'ogv'] },
			// The catch-all has no extension list: it claims whatever no
			// group above did, so a kind nobody thought of has a door in.
			{ id: 'other',  label: 'Other files', icons: ['file'], ext: null }
		];
	},

	// The group a file belongs to, by extension — 'other' when nothing
	// claims it. `file` may be a TFile or anything with a path; the stubbed
	// vaults carry no `extension`, so the path answers when it is absent.
	uniTypeGroupOf(this: WordSmith, file: { path: string; extension?: string }) {
		const ext = String((file && file.extension)
			|| String((file && file.path) || '').split('.').pop() || '')
			.toLowerCase();
		for (const g of this.uniTypeGroups()) {
			if (g.ext && g.ext.indexOf(ext) !== -1) return g.id;
		}
		return 'other';
	},

	// The enabled set, normalised. Absent or empty settings mean the
	// default — notes only — because an empty set would draw a tree of
	// folders with nothing in them and read as broken rather than as strict.
	uniTypeSet(this: WordSmith) {
		const raw = this.settings && this.settings.uniTypes;
		const list = Array.isArray(raw) && raw.length ? raw : ['md'];
		return new Set(list);
	},

	uniTypeAllows(this: WordSmith, file: { path: string; extension?: string }) {
		const set = this.uniTypeSet();
		const g = this.uniTypeGroupOf(file);
		if (g !== 'other') return set.has(g);
		// AN EXTENSION OF ITS OWN: `ext:docx` in the set narrows Other to that
		// extension; `other` itself is still everything the kinds do not name.
		if (set.has('other')) return true;
		const ext = String((file && file.extension)
			|| String((file && file.path) || '').split('.').pop() || '').toLowerCase();
		return !!ext && set.has('ext:' + ext);
	},

	// Move one row to another's place, keeping everything else in order.
	// Split out of the drag handler so the ORDER can be tested without a
	// pointer: dragging is untestable in a headless probe, and the thing
	// worth testing is not the drag, it is that a novel comes out in the
	// order the writer left it in.
	// ── Dragging, on a screen with no mouse ─────────────────────────────────
	//
	// HTML5 drag-and-drop DOES NOT EXIST ON TOUCH. `dragstart` and its
	// family are never fired by a finger, so every reorderable list in this
	// plugin — the export tree, the menu's rows, the theme shelf — looked
	// draggable on a tablet and moved for nobody. Obsidian runs on iPads
	// and Android tablets, which is exactly the machine somebody curates a
	// manuscript on, so this is a missing feature rather than a small one.
	//
	// One helper for all three, because three hand-rolled touch handlers
	// is three chances to get the scroll interaction wrong. It is
	// deliberately NOT a drag library: press, hold briefly, move, drop.
	//
	//   el        the row being made draggable
	//   id        what to hand back on a drop
	//   opts.rows () => every draggable element, to hit-test against
	//   opts.idOf (element) => its id
	//   opts.drop (fromId, toId, after) => do the move and redraw
	//
	// THE HOLD IS THE WHOLE DESIGN. A list that scrolls and a list whose
	// rows drag are the same pixels, and the only thing that can tell a
	// scroll from a drag is intent expressed in TIME: move within 400ms and
	// the list scrolls as it always did; hold still first and the row comes
	// with you. Under the threshold nothing is preventDefault'd, so a
	// flick scrolls exactly as it would if this code were not here.
	touchDrag(this: WordSmith, el: HTMLElement, id: string, opts: { rows: () => HTMLElement[]; idOf: (el: HTMLElement) => string | null; drop: (from: string, to: string, below: boolean) => void }) {
		const HOLD = 400;          // ms before a press becomes a drag
		const SLOP = 10;           // px of movement that cancels the hold
		let timer: number | null = null, dragging = false, startY = 0, startX = 0;

		const marks = () => {
			for (const r of opts.rows()) {
				r.removeClass('is-over-top');
				r.removeClass('is-over-bottom');
			}
		};
		const stop = () => {
			if (timer) { window.clearTimeout(timer); timer = null; }
			if (dragging) el.removeClass('is-dragging');
			dragging = false;
			marks();
		};
		const under = (y: number) => {
			for (const r of opts.rows()) {
				const b = r.getBoundingClientRect();
				if (y >= b.top && y <= b.bottom) return { row: r, below: (y - b.top) > b.height / 2 };
			}
			return null;
		};

		el.addEventListener('touchstart', (ev: TouchEvent) => {
			if (!ev.touches || ev.touches.length !== 1) return;
			startY = ev.touches[0].clientY;
			startX = ev.touches[0].clientX;
			timer = window.setTimeout(() => {
				dragging = true;
				el.addClass('is-dragging');
				// A short buzz where the platform has one: the hold is
				// invisible otherwise, and a writer holding a row with
				// nothing happening lets go at 300ms every time.
				try { if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(15); } catch (_) { wsCatch('touchDrag: if (window.navigator && window.navigator.vibrate) …', _); }
			}, HOLD);
		}, { passive: true });

		el.addEventListener('touchmove', (ev: TouchEvent) => {
			if (!ev.touches || !ev.touches.length) return;
			const y = ev.touches[0].clientY;
			if (!dragging) {
				// Moved before the hold finished: this is a scroll, and
				// the timer must not fire underneath it.
				if (Math.abs(y - startY) > SLOP || Math.abs(ev.touches[0].clientX - startX) > SLOP) stop();
				return;
			}
			// Now it is a drag, so the list must NOT scroll under it.
			ev.preventDefault();
			marks();
			const hit = under(y);
			if (hit && hit.row !== el) hit.row.addClass(hit.below ? 'is-over-bottom' : 'is-over-top');
		}, { passive: false });

		el.addEventListener('touchend', (ev: TouchEvent) => {
			if (!dragging) { stop(); return; }
			const t = (ev.changedTouches && ev.changedTouches[0]) || null;
			const hit = t ? under(t.clientY) : null;
			stop();
			if (!hit || hit.row === el) return;
			const to = opts.idOf(hit.row);
			if (to == null || to === id) return;
			opts.drop(id, to, hit.below);
		});
		el.addEventListener('touchcancel', stop);
	},

	// ── THE UNIFIED WINDOW ──────────────────────────────────────────────────
	//
	// ONE WINDOW. A tree on the left, an inspector on the right, and the tabs
	// across the inspector answer for whatever the tree has lit.
	// THE TREE IS THE NAVIGATOR, and it is the only one. Everything this
	// window knows about "where are we looking" is the set of rows lit in it.
	// Ticks belong to the Export tab and to nothing else: a checkbox means
	// "this one is in", which is meaningless in the other two tabs.
	// ── THE HOST SEAM ───────────────────────────────────────────────────────
	//
	// The window is usable BESIDE the writing — dragged out, docked to a
	// side, or opened as a tab, the way Obsidian's own panes work. A modal
	// cannot be any of those: it is a sheet over the app that takes the
	// whole window and gives it back when you close it. So the eight lines
	// that touch the host are named as a HOST, and somebody else supplies one.
	//
	// What a host owes this window:
	//   `rootEl`     the element that wears `ws-uni-modal` and `is-narrow`
	//   `contentEl`  what the window is built into
	//   `key`        register a keystroke, and hand back nothing
	//   `contains`   is this event inside us? \u2014 for the Escape ladder
	//   `onClose`    run this when the window goes
	//   `show`       put it on screen
	//
	// `modalHost` below is the sheet; the pane's host is built by
	// `WsOutlinerView` (preamble.ts) to the same shape.
	modalHost(this: WordSmith): WsHost | null {
		// `wsModal`, not the constructor: a window that is not on the
		// register outlives its plugin.
		const modal = this.wsModal();
		if (!modal) return null;
		return {
			kind: 'modal',
			modal,
			rootEl: modal.modalEl,
			contentEl: modal.contentEl,
			containerEl: modal.containerEl,
			closes: true,
			key: (mods: Modifier[], k: string, fn: KeymapEventListener) => modal.scope.register(mods, k, fn),
			contains: (el: Node) => {
				try { return !!(modal.containerEl && modal.containerEl.contains(el)); }
				catch { return false; }
			},
			onClose: (fn: () => void) => {
				const was = modal.onClose ? modal.onClose.bind(modal) : null;
				modal.onClose = () => { try { fn(); } catch (_) { wsCatch('modalHost / onClose: fn();', _); } if (was) was(); };
			},
			show: () => modal.open(),
			// ── AND A WINDOW CAN REFUSE TO GO ────────────────────────────
			//
			// Obsidian's own Escape runs before anything this window can register:
			// the modal's scope runs the first match, and the app's keymap is bound
			// above a capture listener on the container and even on `window`. So
			// instead of racing for the EVENT the EFFECT is guarded: whoever wins
			// the key, closing goes through `close()`, and a window that declines to
			// shut cannot be shut by an Escape it never saw. The test does the
			// cancelling too, so one press still ends the rename.
			blockClose: (test: () => boolean) => {
				const real = modal.close.bind(modal);
				modal.close = () => { if (test()) return; real(); };
			},
			handle: () => modal
		};
	},

	// ── THE ORGANIZER INDEX — the glue ─────────────────────────────────────
	//
	// The pure store and its arithmetic live in org-index.ts; these methods
	// are the only place the store meets Obsidian. The rules:
	//
	// · FED BY THE VAULT AND ITS EVENTS, never by what is drawn or
	// folded. Nothing in here may touch the DOM, and nothing in the
	// window may write the index — the edit flow is strictly
	// view → writer → vault → metadata event → index → view.
	// · MEMBERSHIP IS `isFileCounted`, the same one writer every other
	// total in this plugin uses. If a note is out of the report's
	// figures it is out of these, or two windows would disagree about
	// one manuscript.
	// · MTIME-CACHED: the sweep re-reads only what changed. Opening the
	// window twice costs one read of the notes that were edited
	// between, not a read of the vault.
	// · COUNTED BY `analyzeText`/`countTasks` — the counters the report
	// already answers with. The index adds no third opinion about what
	// a word is.

	// Start (or join) the index. Idempotent: the first call builds and
	// watches; every later call returns the same store's build promise.
	orgIndexEnsure(this: WordSmith) {
		if (this._orgIndex) {
			// AN EMPTY INDEX OVER A VAULT WITH NOTES IS NOT AN ANSWER. The tree's
			// first paint of a session starts the index before the vault has listed
			// its files; that sweep sees nothing and, left alone, the index stayed
			// empty for the session. Sweep again the moment the vault answers.
			// …ONCE FOR EACH STATE OF WHAT IS COUNTED (A875, issue #86): asked on every draw, a sweep that counted
			// nothing (every note out of scope) rang the bell, the bell drew 150 ms later, and the draw asked again —
			// the table rebuilt eleven times a second for as long as the pane was open. The notes' number and the
			// three settings that decide what is counted say when to look again; a note's own `wordsmith:` comes
			// through `changed`.
			if (this._orgIndexBuild == null && !this._orgIndex.size && this.orgIndexVaultHasNotes()) {
				const at = this.orgIndexCountedSig();
				if (at !== this._orgIndexEmptyAt) { this._orgIndexEmptyAt = at; return this.orgIndexResweep(); }
			}
			return this._orgIndexBuild ?? Promise.resolve(this._orgIndex);
		}
		this._orgIndex = wsOrgIndex();
		this._orgIndexWatch();
		return this.orgIndexResweep();
	},

	// One sweep, joined if one is running: the build promise is the one every
	// caller waits on, and the bell rings when it lands.
	// `all`: read every note again, not only the changed ones (the language
	// changed, and every grade with it); asked while a sweep runs, it follows it.
	orgIndexResweep(this: WordSmith, all?: boolean): Promise<WsOrgIndexMap> {
		if (this._orgIndexBuild != null) {
			const running = this._orgIndexBuild;
			return all ? running.then(() => this.orgIndexResweep(true)) : running;
		}
		this._orgIndexBuild = (async () => {
			try {
				const ix = await this.orgIndexSweep(all);
				this._orgIndexRing();
				return ix;
			} finally { this._orgIndexBuild = null; }
		})();
		return this._orgIndexBuild;
	},

	orgIndexCountedSig(this: WordSmith) {
		const s = this.settings;
		let n = 0;
		try { n = this.app.vault.getMarkdownFiles().length; } catch { n = 0; }
		return n + '|' + JSON.stringify([s.scopeMode, s.scopePaths, s.countExclude]);
	},

	orgIndexVaultHasNotes(this: WordSmith) {
		try { return !!(this.app.vault.getMarkdownFiles && this.app.vault.getMarkdownFiles().length); }
		catch { return false; }
	},

	// A STORE PATH JUST BECAME KNOWN. The history store is located lazily —
	// `historyFindFile` reads the vault for it the first time the history is
	// needed — and the structure store's memory of where it was found fills
	// on its first read; an index swept before either answered counted the
	// note like any other, and the tree showed the plugin's own table as the
	// writer's words. The stores are left out everywhere else, so the moment
	// one is located its reading leaves the index and the bell rings; a
	// store the index never held costs one lookup.
	orgIndexStoreKnown(this: WordSmith, path: string | null | undefined) {
		if (!path || !this._orgIndex) return;
		if (wsOrgRemove(this._orgIndex, path)) this._orgIndexRing();
	},

	// The index's change bell. A view subscribes to repaint FROM the index
	// (never to re-derive); the glue rings it after every write it takes.
	// Rung once per sweep and once per event — the subscriber owns its own
	// debounce, because how often to repaint is a VIEW question.
	orgIndexOnChange(this: WordSmith, cb: () => void) {
		if (!this._orgIndexSubs) this._orgIndexSubs = new Set();
		this._orgIndexSubs.add(cb);
		return () => { this._orgIndexSubs.delete(cb); };
	},

	_orgIndexRing(this: WordSmith) {
		for (const cb of (this._orgIndexSubs || [])) {
			try { cb(); } catch (_) { wsCatch('_orgIndexRing: cb();', _); }
		}
	},

	// One pass over the vault's markdown files. Reads what is stale,
	// removes what stopped belonging (deleted while we were not looking,
	// or excluded by a membership change) — so the sweep leaves the index
	// EXACTLY the counted vault, whatever happened while the plugin was
	// off. Folds, panes and tabs do not exist down here.
	async orgIndexSweep(this: WordSmith, all?: boolean) {
		const ix = this._orgIndex;
		const files = (this.app.vault.getMarkdownFiles
			&& this.app.vault.getMarkdownFiles()) || [];
		const seen = new Set();
		for (const f of files) {
			if (!f || !f.path) continue;
			if (!this.isFileCounted(f)) continue;
			seen.add(f.path);
			const mt = (f.stat && f.stat.mtime) || 0;
			if (!all && !wsOrgStale(ix, f.path, mt)) continue;
			try { await this.orgIndexRead(f); } catch (_) { wsCatch('orgIndexSweep: await this.orgIndexRead(f);', _); }
		}
		for (const p of Array.from(ix.keys())) {
			if (!seen.has(p)) wsOrgRemove(ix, p);
		}
		return ix;
	},

	// Read ONE file into the index: one cachedRead, both counters, and the
	// cache's frontmatter (shallow-copied by the store's writer — Obsidian
	// mutates that object in place).
	async orgIndexRead(this: WordSmith, f: TAbstractFile) {
		if (!this._orgIndex || !f || !f.path) return null;
		const text = await this.app.vault.cachedRead(f);
		// MEMBERSHIP AGAIN, AFTER THE READ. The history store is located lazily
		// (`historyFindFile`, a read of the vault), so a note can become a store
		// while its own read is in flight. What is not counted is not put,
		// whoever asked.
		if (!this.isFileCounted(f)) { wsOrgRemove(this._orgIndex, f.path); return null; }
		// (timed for the diagnostics' slowest readings, every reader of the note in the one timing)
		const { st, tk, fn, vocab } = wsTimedRead(f.path, 'Organizer', text, () => ({ st: this.analyzeText(text), tk: this.countTasks(text),
			fn: wsCountFootnotes(text), vocab: this.wordFreqInto(text, null).size }));
		let props = null;
		try {
			const c = this.app.metadataCache.getFileCache(f);
			props = (c && c.frontmatter) || null;
		} catch (_) { wsCatch('orgIndexRead: const c = this.app.metadataCache.getFileCache(f);', _); }
		return wsOrgPut(this._orgIndex, f.path, {
			words: st.words, paras: st.paragraphs,
			// Straight from the same `analyzeText` call that gives the words:
			// measured already, discarded until now.
			charsNoSpaces: st.charsNoSpaces,
			charsWithSpaces: st.charsWithSpaces,
			sentences: st.sentences,
			// Footnotes — the definitions written in the note and its inline ones,
			// counted once each.
			footnotes: fn,
			tasks: tk, grade: st.sentences ? st.grade : undefined,
			// VOCABULARY (A681, the writer): the note's different words, by the Report's own reader, so the
			// column and the Report's figure are one number
			vocab,
			mtime: (wsStatOf(f) || { mtime: 0 }).mtime || 0,
			ctime: (wsStatOf(f) || { ctime: 0 }).ctime || 0,
			props
		});
	},

	// The events. `metadataCache.changed` fires after a file's content and
	// cache are both current, which is the moment a reading can be taken;
	// rename MOVES the entry (the text did not change); delete removes it.
	// Registered through `registerEvent`, so unload cleans up.
	_orgIndexWatch(this: WordSmith) {
		const md = (f: TAbstractFile) => f && f.path && /\.md$/i.test(f.path);
		// Guarded registration: a stub vault (and, in principle, a host build)
		// may carry no event bus. An index that cannot watch is still an index —
		// the sweep still answers.
		const reg = (bus: Events, name: string, fn: (...data: never[]) => unknown) => {
			try {
				if (!bus || typeof bus.on !== 'function') return;
				// Guarded like the rest; its own registration rather than `onAppEvent`
				// because of the stub-vault check above.
				const ref = bus.on(name, wsGuard(fn, 'the org index\u2019s ' + name + ' handler'));
				try { this.registerEvent(ref); } catch (_) { wsCatch('_orgIndexWatch / reg: this.registerEvent(ref);', _); }
			} catch (_) { wsCatch('_orgIndexWatch / reg: if (!bus || typeof bus.on !== \'function\') return;', _); }
		};
		reg(this.app.metadataCache, 'changed', (f: TAbstractFile) => {
			if (!md(f) || !this._orgIndex) return;
			if (!this.isFileCounted(f)) {
				if (wsOrgRemove(this._orgIndex, f.path)) this._orgIndexRing();
				return;
			}
			void (async () => {
				try { await this.orgIndexRead(f); this._orgIndexRing(); } catch (_) { wsCatch('orgIndexWatch changed: await this.orgIndexRead(f);', _); }
			})();
		});
		reg(this.app.vault, 'delete', (f: TAbstractFile) => {
			if (md(f) && this._orgIndex
				&& wsOrgRemove(this._orgIndex, f.path)) this._orgIndexRing();
		});
		// THE VAULT ARRIVES AFTER THE PLUGIN: `resolved` is the cache's word
		// that its first pass over the vault is done — and later, that a batch
		// of changes has settled. A sweep then is the one that FILLS an index
		// started too early; on a settled vault it is a walk of mtimes and
		// nothing read.
		reg(this.app.metadataCache, 'resolved', () => {
			if (!this._orgIndex) return;
			void this.orgIndexResweep();
		});
		reg(this.app.vault, 'rename', (f: TAbstractFile, oldPath: string) => {
			if (!md(f) || !this._orgIndex) return;
			if (wsOrgRename(this._orgIndex, oldPath, f.path)) {
				this._orgIndexRing();
			} else {
				// A file we had never read moved into view — read it.
				void (async () => {
					try { await this.orgIndexRead(f); this._orgIndexRing(); } catch (_) { wsCatch('orgIndexWatch rename: await this.orgIndexRead(f);', _); }
				})();
			}
		});
		// No 'create' handler: a brand-new note fires `metadataCache.changed`
		// once its cache exists, and reading it before that would index a
		// note whose frontmatter Obsidian has not parsed yet.
	},

	// ── THE ONE FRONTMATTER WRITER ─────────────────────────────────────────
	//
	// Every property edit in the Organizer lands here and nowhere else,
	// through `app.fileManager.processFrontMatter` — atomic, and the only
	// API that keeps the writer's other keys. CAVEAT (in the README): the
	// first write may normalize that note's frontmatter formatting (quoting,
	// key order).
	//
	// An EMPTY value deletes the key: an empty field means "no value", and a
	// `pov: ""` line left behind would be a value to every filter and
	// enumeration in the window. The add-property flow never writes an empty
	// value at all — it opens an editor and commits only what gets typed.
	//
	// The key is matched without regard to case against what the note
	// already carries (the propRaw rule), so editing `Pov` from a column
	// labelled `pov` rewrites the writer's key rather than adding a twin.
	async orgPropWrite(this: WordSmith, path: string, key: string, value: unknown) {
		const f = this.app.vault.getAbstractFileByPath(String(path || ''));
		if (!f || f.children || !key) return false;
		// ── A FILE WITH NO FRONTMATTER TO PROCESS ────────────────────────
		//
		// `processFrontMatter` writes into the file itself, which is the
		// right answer for a `.md` and impossible for a `.pdf`. The fork is
		// HERE, at the one writer, rather than at the cells: the drafts, the
		// menus and anything added later all reach this function without
		// passing a cell, and a guard on the door is not a guard on the
		// write.
		//
		// THE SAME PREDICATE BOTH WAYS. `propStoreHolds` decides who stores
		// where, and it is asked here and in every read — so a property can
		// never be written to one place and looked for in the other.
		if (this.propStoreHolds(String(path || ''))) {
			return await this.propStoreSet(String(path), key, value);
		}
		const empty = value === undefined || value === null || value === ''
			|| (Array.isArray(value) && !value.length);
		try {
			await this.app.fileManager.processFrontMatter(f, (fm: Record<string, unknown>) => {
				let real = String(key);
				for (const k of Object.keys(fm || {})) {
					if (k.toLowerCase() === String(key).toLowerCase()) { real = k; break; }
				}
				if (empty) delete fm[real];
				else fm[real] = value;
			});
			// Told once per subject, and re-armed here so the next failure is news.
			// The value on screen goes back on its own — the cell repaints from the
			// note, so a writer sees their typing appear and then vanish. Without a
			// word for it that reads as the plugin throwing the edit away.
			return this.storeWriteOk(WS_WRITE.prop);
		} catch (e) {
			return this.storeWriteFailed(WS_WRITE.prop, e,
				wsT('The cell has gone back to what the note says.'));
		}
	},

	// WHAT THE WRITER CHOSE FOR THIS KEY IN OUR OWN PANEL, or '' if they
	// never said. Stored on the column beside its label, so it travels with
	// the column and disappears with it — a type for a column nobody has is
	// a fact about nothing.
	orgPropTypeChosen(this: WordSmith, key: string) {
		const k = String(key || '').toLowerCase();
		if (!k) return '';
		try {
			const cols = (this.settings && this.settings.uniUserCols) || [];
			for (const c of cols) {
				if (!c || !c.key || !c.type) continue;
				if (String(c.key).toLowerCase() === k) return String(c.type);
			}
		} catch (_) { wsCatch('orgPropTypeChosen: const cols = (this.settings && this.settings.uniUserCols) || [];', _); }
		return '';
	},

// What KIND of value a property holds, from Obsidian's own registry
// (metadataTypeManager) — feature-detected, because the API has moved
// between builds and a stub has none. '' means "unknown; infer from the
// value at hand".
	orgPropType(this: WordSmith, key: string) {
		const k = String(key || '').toLowerCase();
		if (k === 'tags') return 'tags';
		if (k === 'aliases') return 'multitext';
		try {
			const mt = this.app.metadataTypeManager;
			if (mt) {
				// THE NAMES THIS BUILD HAS (measured on 1.13.7): `getAssignedType` is
				// NOT a function — the call threw straight into the catch below, silently
				// — and `properties[k]` is `{ name, widget, occurrences }`: the field is
				// `widget`, `.type` is undefined on every entry. Both misses were
				// invisible, because '' means "infer from the value" and the fallbacks
				// guess right often enough.
				//
				// Ordered assigned-then-inferred, which is Obsidian's own precedence:
				// `getAssignedWidget` is what the WRITER chose in the properties UI,
				// `getPropertyInfo` is what Obsidian worked out for itself (and it
				// answers 'text' for a key it has never seen, which is a better default
				// than '').
				if (typeof mt.getAssignedWidget === 'function') {
					const w = mt.getAssignedWidget(k);
					// a name, or (1.13) the widget object with its type
					if (typeof w === 'string' && w) return w;
					if (w && typeof w === 'object' && w.type) return String(w.type);
				}
				// ── AND THEN WHAT THE WRITER CHOSE HERE ───────────────────
				//
				// `getPropertyInfo` answers 'text' for a key it has never seen — a fair
				// default for a key the vault knows; for one invented a second ago it is
				// an assertion dressed as an inference. So a remembered type goes here,
				// between what OBSIDIAN WAS TOLD and what OBSIDIAN GUESSED: an explicit
				// choice in either interface beats an inference, and a choice made in
				// Obsidian's own properties pane still wins over ours, because that is
				// the vault's answer about the vault's data. It matters most where
				// Obsidian can never learn: a non-md file keeps its properties in
				// `ws-structure.md`, which Obsidian does not read.
				const mine = this.orgPropTypeChosen(k);
				if (mine) return mine;
				if (typeof mt.getPropertyInfo === 'function') {
					const pi = mt.getPropertyInfo(k);
					if (pi && pi.widget) return String(pi.widget);
				}
				const info = mt.properties && mt.properties[k];
				if (info && info.widget) return String(info.widget);
				// THE OLDER SPELLINGS, kept and kept LAST. They are not
				// dead code to delete on sight: this plugin ships to vaults
				// on other builds, the API has moved once already, and a
				// feature-detected branch costs nothing when it is absent.
				if (typeof mt.getAssignedType === 'function') {
					const t = mt.getAssignedType(k);
					if (t) return String(t);
				}
				if (info && info.type) return String(info.type);
			}
		} catch (_) { wsCatch('orgPropType: const mt = this.app.metadataTypeManager;', _); }
		return '';
	},

	// ── ONE PLACE A DAY BECOMES A STRING ───────────────────────────────
	//
	// PURE, AND THE STYLE IS PASSED IN. `formatValue` hands it through so it
	// stays testable without settings; `orgStamp` below reads the setting and
	// hands it to the same function. A third format cannot appear without
	// being added here.
	dateText(this: WordSmith, y: number, mo: number, d: number, hh: number | null | undefined, mi: number | null | undefined, style: string) {
		const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
			'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const two = (n: number) => (n < 10 ? '0' : '') + n;
		const st = String(style || 'human');
		let out;
		if (st === 'iso') out = y + '-' + two(mo + 1) + '-' + two(d);
		else if (st === 'dmy') out = two(d) + '/' + two(mo + 1) + '/' + y;
		else if (st === 'mdy') out = two(mo + 1) + '/' + two(d) + '/' + y;
		// 'human' AND ANYTHING UNRECOGNISED. A hand-edited data.json must not
		// be able to make every date in the window disappear.
		else {
			// THE MONTH IN THE INTERFACE'S LANGUAGE (A695): the same day, its parts named by Intl where it is not English
			const day = new Date(2000, 0, 1);
			day.setFullYear(y, mo, d);
			out = wsUiDate(d + ' ' + MONTHS[mo] + ' ' + y, day, { day: 'numeric', month: 'short', year: 'numeric' });
		}
		if (hh !== null && hh !== undefined) out += ' ' + two(hh) + ':' + two(mi || 0);
		return out;
	},

	// The writer's choice, with the default spelled once.
	dateStyle(this: WordSmith) {
		try { return String((this.settings && this.settings.organizerDateFormat) || 'human'); }
		catch { return 'human'; }
	},

	// A FILE TIME, THROUGH THE SAME RENDERER. Local getters on purpose: a
	// file's mtime is a moment, and the writer wants it in their own clock.
	// (A date PROPERTY is a written-down day and is read as typed — see the
	// UTC note in `formatValue`. Those are different facts, not two answers
	// to one; only the SHAPE is shared.)
	orgStamp(this: WordSmith, ms: number) {
		const n = Number(ms);
		if (!n || !isFinite(n)) return '';
		const dt = new Date(n);
		return this.dateText(dt.getFullYear(), dt.getMonth(), dt.getDate(),
			dt.getHours(), dt.getMinutes(), this.dateStyle());
	},

	// ── ONE VALUE, ONE FORMATTER ─────────────────────────────────────────
	//
	// PURE, AND A METHOD ONLY SO IT CAN BE TESTED. It touches no `this`; the
	// prototype is simply how a plain-node test reaches it. Every caller
	// passes the type in rather than looking it up, so this cannot become a
	// second reader of the registry.
	//
	// `ok: false` IS THE POINT OF THE RETURN SHAPE. A value that does not
	// parse as its DECLARED type is not printed as though it were fine — the
	// caller draws it muted with the raw string on hover. Malformed
	// frontmatter becomes visible instead of plausible.
	//
	// NO LOCALE IN THE MONTH, deliberately: a locale month makes every
	// reading a function of the machine drawing it.
	//
	// AND THE DATE IS PARSED BY PATTERN, NOT BY `new Date(string)`. `new
	// Date('1999-01-22')` is UTC midnight while `new Date('1999-01-22T09:30')`
	// is LOCAL — mixing them puts a note a day earlier for anyone west of
	// Greenwich. A regex has no timezone.
	formatValue(this: WordSmith, key: string, raw: unknown, type: string, style: string) {
		const done = (text: string, ok: boolean) => ({ text: text, ok: ok !== false });

		// NOTHING IS A STATE, NOT A FAULT. A property a note has not filled in
		// is the commonest value in any vault.
		if (raw === null || raw === undefined || raw === '') return done('', true);

		const t = String(type || '').toLowerCase();

		if (t === 'checkbox' || typeof raw === 'boolean') {
			return done(raw === true ? '\u2713' : '', true);
		}

		// LISTS FIRST, and by the VALUE's shape as well as the declared type:
		// a `tags` key holding one string is still a list to the writer.
		if (Array.isArray(raw) || t === 'tags' || t === 'multitext' || t === 'aliases') {
			const arr = Array.isArray(raw) ? raw : [raw];
			const kept = arr.filter((x: null) => x !== null && x !== undefined && typeof x !== 'object');
			return done(kept.map((x) => String(x).trim()).join(', '), true);
		}

		// An object that is not an array has no honest one-line rendering.
		if (typeof raw === 'object' && !(raw instanceof Date)) return done('\u2014', false);

		if (t === 'number') {
			const n = Number(raw);
			// A NUMBER WRITTEN AS TEXT IS STILL A NUMBER. Frontmatter is typed
			// by hand and `count: "1234"` is what a hand types.
			if (raw === true || raw === false || !isFinite(n)) return done(wsStr(raw), false);
			return done(n.toLocaleString(), true);
		}

		if (t === 'date' || t === 'datetime' || raw instanceof Date) {
			let y, mo, d, hh = null, mi = null;
			if (raw instanceof Date) {
				if (isNaN(raw.getTime())) return done(String(raw), false);
				// UTC GETTERS, to match the pattern branch below: a YAML parser
				// that hands over a Date built from an ISO day built it at UTC
				// midnight, and local getters would move it a day west of here.
				y = raw.getUTCFullYear(); mo = raw.getUTCMonth(); d = raw.getUTCDate();
				if (t === 'datetime') { hh = raw.getUTCHours(); mi = raw.getUTCMinutes(); }
			} else {
				const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(wsStr(raw).trim());
				if (!m) return done(wsStr(raw).trim(), false);
				y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]);
				if (m[4] !== undefined) { hh = Number(m[4]); mi = Number(m[5]); }
				// A PATTERN IS NOT A CALENDAR. `2026-02-31` matches the shape and
				// is not a day; saying so is the whole reason `ok` exists.
				//
				const LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
				const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
				const max = (mo === 1 && leap) ? 29 : LEN[mo];
				if (mo < 0 || mo > 11 || d < 1 || d > max) return done(wsStr(raw).trim(), false);
				if (hh !== null && (hh > 23 || (mi !== null && mi > 59))) return done(wsStr(raw).trim(), false);
			}
			// THROUGH THE ONE RENDERER, so a date property and a Modified cell
			// cannot disagree about what a day looks like.
			return done(this.dateText(y, mo, d, hh, mi, style), true);
		}

		// TEXT, AND ANYTHING UNDECLARED. `app.metadataTypeManager` is a private
		// API: when it is absent every key comes back typeless, and a formatter
		// that flagged those would make a whole vault look broken.
		return done(wsStr(raw).trim(), true);
	},

	// Every property name a note in the vault CARRIES: the notes' own
	// frontmatter, read from the metadata cache (so a note this index excludes
	// still names its keys), and the index's rows.
	//
	// NOT OBSIDIAN'S REGISTRY (`metadataTypeManager.properties`): it keeps a
	// property after its last note lets it go, until the app restarts.
	// Measured: a property deleted from its only note, then the note deleted,
	// and the registry still named it, so a deleted property stayed in the
	// Properties panel until a restart.
	orgKnownProps(this: WordSmith) {
		const seen = new Map<string, string>();
		try {
			const files = this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : [];
			for (const f of files) {
				const cache = this.app.metadataCache && this.app.metadataCache.getFileCache(f);
				const fm = cache && cache.frontmatter;
				if (!fm) continue;
				for (const k of Object.keys(fm)) {
					// Obsidian's own bookkeeping, never the writer's.
					if (k === 'position') continue;
					if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
				}
			}
		} catch (_) { wsCatch('orgKnownProps: the notes’ frontmatter', _); }
		if (this._orgIndex) {
			for (const r of this._orgIndex.values()) {
				if (!r || !r.props) continue;
				for (const k of Object.keys(r.props)) {
					if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
				}
			}
		}
		return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
	},

	// The questions the window asks. Null when the index has not answered
	// yet — a caller renders a blank, never a zero: unknown is not empty.
	orgWordsOf(this: WordSmith, path: string) {
		const r = this._orgIndex && this._orgIndex.get(String(path));
		return r ? r.words : null;
	},

	orgAggUnder(this: WordSmith, folder: string) {
		if (!this._orgIndex) return null;
		return wsOrgAgg(this._orgIndex, wsOrgPathsUnder(this._orgIndex, folder));
	},

	// WITH THE STORE'S ROWS: a .pdf has no index row, and its values would
	// otherwise never be offered or counted.
	orgDistinctUnder(this: WordSmith, folder: string, key: string) {
		if (!this._orgIndex) return [];
		return wsOrgDistinct(this._orgIndex,
			wsOrgPathsUnder(this._orgIndex, folder), key, this.propStoreRowsUnder(folder, key));
	},

	// …and how many notes carry each of them. Same paths, same rules, one
	// walk apart — see `wsOrgCounts` for why it is a sibling of the
	// enumerator rather than a wider return from it.
	orgCountsUnder(this: WordSmith, folder: string, key: string) {
		if (!this._orgIndex) return new Map<string, number>();
		return wsOrgCounts(this._orgIndex,
			wsOrgPathsUnder(this._orgIndex, folder), key, this.propStoreRowsUnder(folder, key));
	},

	openManuscriptModal(this: WordSmith, opts: { tab?: string; host?: WsHost; only?: boolean }) {
		const o = opts || {};
		// A HOST IS HANDED IN by the pane, or the sheet's is made here: the
		// caller decides what this window lives inside, and the window does not
		// know or care.
		const host = o.host || this.modalHost();
		if (!host) return;
		const { body, foot, goalStore, markOf, orgNav, ownerDoc, ownerWin, right, s, single, statusStore, tabsRow, targetOf } = wsOrgWindowFrame(this, host, o);
		// ── THE SELECTION ───────────────────────────────────────────────────
		//
		// One object the whole window shares. Each path carries its own kind —
		// a selection can hold a chapter FOLDER and a scene at once, which two
		// clicks produce — and the Map keeps them in the order they were picked.
		//
		// EMPTY MEANS THE WHOLE VAULT. The window is useful the instant it
		// opens: before anything is clicked the inspector is already answering
		// for the entire manuscript.
		// ── HOW YOU WERE LOOKING LAST TIME ───────────────────────────────
		//
		// The window remembers its state while Obsidian runs and forgets it on
		// a restart. ON THE INSTANCE, never on disk: a restart, a reload and a
		// disable/enable cycle each give a fresh window for free — there is
		// nothing to migrate and no key to go stale.
		//
		// WRITTEN ON EVERY CHANGE, NOT ON CLOSE, which is the whole design: a
		// deploy orphans this window, Escape closes it, and Obsidian can close
		// it under us — an on-close snapshot misses all three.
		const ses = this._wsSession || (this._wsSession = wsSessionNew());
		// organizer-zoom.ts reads this closure through the names below.
		const orgZoom = wsOrgZoomMake({
			plugin: this,
			get body() { return body; },
			get ses() { return ses; },
		});
		const zoomTag = orgZoom.zoomTag;
		// organizer-sel.ts reads this closure through the names below.
		const orgSel = wsOrgSelMake({
			plugin: this,
			get orgNarrowNow() { return orgNarrowNow; },
			get ses() { return ses; },
		});
		const sel = orgSel.sel;
		const keyOf = orgSel.keyOf;
		const itemOf = orgSel.itemOf;
		const selRows = orgSel.selRows;
		const orgBulkPaths = orgSel.orgBulkPaths;
		const orgBulkSay = orgSel.orgBulkSay;
		// THE HISTORY OF ONE NOTE: the note the tree handed the window (`orgNote`,
		// set by `orgFollow`) is the History tab's subject while it is set; the
		// Organizer's table is a folder's and keeps reading the folder.
		const subjectRows = () => {
			const note = tab === 'history' ? orgScope.orgNote : '';
			if (note) return [{ kind: 'file', path: note }];
			return orgFolder ? [{ kind: 'folder', path: orgFolder }] : [];
		};

		// ── THE TICKS ───────────────────────────────────────────────────────
		//
		// What is IN the manuscript, as against what order it is in. A tick is
		// the only thing the Export tab adds to a row, and it means one thing:
		// this one is in. THE TREE GROWS A CHECKBOX COLUMN ON THIS TAB AND LOSES
		// IT ON THE OTHERS — a tick is meaningless in the Organizer and History
		// tabs, and a column of boxes nobody can act on is a column to read past.
		//
		// THE EXPORT IS THE VAULT, AND THE TREE'S BOXES CHOOSE. The Export tab
		// does not follow the Organizer's folder: it gathers the vault, its ticks
		// live in the store's root section, and "Export this" on a folder or a
		// note is a set of ticks (`ticksOnly`), not a scope.
		const exportScopes = (): string[] | null => null;
		const exportScope = () => {
			const many = exportScopes();
			if (many && many.length === 1) return many[0];
			// NOTHING CHOSEN MEANS THE VAULT. Several folders are never a scope: a
			// composite key like `A|B` would be an entry in a PATH-KEYED store that
			// no rename walk could follow.
			return '';
		};
		// organizer-ticks.ts owns the tick set, the scope it was read for, the
		// write's debounce and the per-draw index of what each row governs, and
		// reads this closure through the names below.
		const orgTicks = wsOrgTicksMake({
			plugin: this,
			scopes: () => exportScopes(),
			scope: () => exportScope(),
			select: (p) => { orgSelect(p); },
			redraw: () => { drawPanel(); },
			said: (m) => said(m),
			// ON SCREEN, NOT MERELY ON THE EXPORT TAB. A docked pane left on Export
			// and put behind another tab, or in a collapsed sidebar, would keep the
			// boxes of a tab nobody can see. Obsidian's `isShown` is the same
			// question the leaf answers for itself.
			wanted: () => tab === 'export' && wsElShown(host.rootEl)
		});
		const exportFiles = orgTicks.files;
		const loadTicks = orgTicks.load;

		// organizer-shape.ts reads this closure through the names below.
		const orgShape = wsOrgShapeMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get fill() { return fill; },
			get s() { return s; },
		});
		// ── THREE TABS, ALL LABELLED ────────────────────────────────────────
		//
		// The Organizer and the Export are two answers to one question: what is
		// in the book, and in what order. They belong side by side and they
		// belong labelled. Only the LABEL says Organizer: the view type stays
		// `word-smith-outliner` and the command ids stay as they are, because
		// those are written into saved workspaces and into whatever hotkeys the
		// writer has set, and renaming them would silently drop a pane on the
		// next restart.
		const TABS = [
			{ id: 'organizer', label: wsT('Organizer'), icon: 'list-tree', tree: 'binder' },
			// THE EXPORT'S OWN GLYPH, the one the docked menu has always used
			// for the same command. Two pictures for one act is how a writer
			// learns two things instead of one; `book-open` was this window's
			// invention and nothing else in the plugin used it.
			{ id: 'export',   label: wsT('Export'),    icon: 'file-output', tree: 'ticks' },
			{ id: 'history',  label: wsT('History'),   icon: 'history',   tree: 'slim' }
		// THE SWITCH: with the Organizer off the window has two tabs.
		].filter((t) => t.id !== 'organizer' || this.settings.organizerOn !== false);
		// AN EXPLICIT ASK WINS OVER THE MEMORY. A command that says “open on
		// History” means it; the memory is only the answer to “open it again”.
		let tab: string = TABS.some(t => t.id === o.tab) ? String(o.tab)
			: (TABS.some(t => t.id === ses.tab) ? String(ses.tab) : TABS[0].id);
		ses.tab = tab;

		// ── THE ORGANIZER'S SELECTION — one variable, one writer ────────────
		//
		// WHICH FOLDER the right pane is about. Empty means the whole vault.
		// `orgSelect` is the only thing that CALLS it — the crumbs and the
		// explorer's door do — so there is exactly one place a selection change
		// can happen and exactly one place to persist it (it survives sessions).
		//
		// Validated on the way in, not on the way out: a folder deleted while
		// the window was shut falls back to the root rather than leaving the
		// right pane describing a path nothing has.
		const orgFolderOk = (p: string) => {
			if (!p) return false;
			try {
				const at = this.app.vault.getAbstractFileByPath(p);
				return !!(at && at.children);
			} catch { return false; }
		};
		let orgFolder = orgFolderOk(String(s.organizerFolder || ''))
			? String(s.organizerFolder) : '';
		// ── AND THE SESSION WINS INSIDE A SESSION ────────────────────────
		//
		// `organizerFolder` is the folder ACROSS restarts; the session is the
		// folder across opens, and the fresher of the two. TAKEN AS-IS, not
		// re-validated: it can only have come from `orgFolderSet`, which
		// validated it on the way in, and `''` is a real answer meaning the
		// whole vault.
		if (ses.folder !== null) orgFolder = String(ses.folder);
		// ── AND THERE ARE THREE WRITERS OF IT, NOT ONE ───────────────
		//
		// `orgSelect`, and `orgFollow` twice — once for a folder row, once for
		// the parent of a note. A session recorded in one writer only stayed
		// blank on the path a writer takes most, so THE ASSIGNMENT IS THE DOOR
		// and all three go through it.
		const orgFolderSet = (v: string) => {
			orgFolder = orgFolderOk(v) ? String(v) : '';
			try { if (this._wsSession) this._wsSession.folder = orgFolder; } catch (_) { wsCatch('openManuscriptModal / orgFolderSet: if (this._wsSession) this._wsSession.folder = orgFolder;', _); }
			return orgFolder;
		};
		// A pane can be dragged narrow on a desktop, so narrowness is the
		// CLASS the ResizeObserver maintains, not the platform flag — asking
		// `narrow` here would give a docked 300px pane the wide behaviour.
		const orgNarrowNow = () => {
			try { return host.rootEl.classList.contains('is-narrow'); }
			catch { return false; }
		};
		// organizer-scope.ts reads this closure through the names below.
		const orgScope = wsOrgScopeMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get folderOf() { return folderOf; },
			get keyOf() { return keyOf; },
			get orgFolder() { return orgFolder; },
			get orgFolderOk() { return orgFolderOk; },
			get orgFolderSet() { return orgFolderSet; },
			get orgSel() { return orgSel; },
			get s() { return s; },
		});
		const orgSelect = orgScope.orgSelect;
		const orgFollow = orgScope.orgFollow;
		const orgIndexChanged = this.orgIndexOnChange(() => {
			if (tab !== 'organizer') return;
			if (orgScope.orgDrawTimer) window.clearTimeout(orgScope.orgDrawTimer);
			orgScope.orgDrawTimer = window.setTimeout(() => {
				orgScope.orgDrawTimer = null;
				if (tab !== 'organizer') return;
				try { pruneUserCols(); } catch (_) { wsCatch('orgIndexChanged: pruneUserCols();', _); }
				drawPanel();
			}, 150);
		});

		// organizer-lens.ts reads this closure through the names below.
		const orgLensBox = wsOrgLensMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get orgFolder() { return orgFolder; },
			get s() { return s; },
			get ses() { return ses; },
		});
		const orgLensOn = orgLensBox.orgLensOn;
		const orgLensSet = orgLensBox.orgLensSet;
		const orgLensClear = orgLensBox.orgLensClear;
		const orgAt = orgLensBox.orgAt;
		const orgOpen = new Set<string>(s.organizerOpen);
		const orgIsOpen = (p: string) => orgOpen.has(p);
		// The table always shows its rows; the bar's Collapse all folds the
		// folders.
		// ── ONE WRITE AND ONE REDRAW, HOWEVER MANY FOLDERS MOVE ────────
		//
		// Fold-all once looped over every foldable path calling the single-path
		// setter, and each call saved the settings AND rebuilt the whole panel —
		// six full `drawPanel` runs for five rows, seconds on a real book. SO
		// THE MANY-PATH FORM IS THE ONE THAT DOES THE WORK and the single-path
		// form calls it.
		const orgOpenSetMany = (paths: string[], on: boolean) => {
			let moved = 0;
			for (const p of paths) {
				if (on ? orgOpen.has(p) : !orgOpen.has(p)) continue;
				if (on) orgOpen.add(p); else orgOpen.delete(p);
				moved++;
			}
			// NOTHING MOVED, NOTHING WRITTEN. Folding an already-folded set
			// used to cost a save and a redraw all the same.
			if (!moved) return;
			s.organizerOpen = Array.from(orgOpen);
			this.saveSettings().catch(() => {});
			drawPanel();
		};
		const orgOpenSet = (p: string, on: boolean) => orgOpenSetMany([p], on);
		// organizer-rows.ts reads this closure through the names below.
		const orgRows = wsOrgRowsMake({
			plugin: this,
			get orgIsOpen() { return orgIsOpen; },
		});
		const orgRowList = orgRows.orgRowList;
		const orgUnder = orgRows.orgUnder;
		const orgOutLinks = orgRows.orgOutLinks;
		const orgBackMap = orgRows.orgBackMap;
		// ── UNDO AND REDO — THE JOURNAL (organizer-journal.ts) ──────────────
		//
		// `wsOrgJournalMake` takes the three things it reads — the bar's
		// repaint, the word beside the buttons, the foot for a failure — and
		// hands back push / run / api / on.
		//
		// THE WORD BESIDE UNDO AND REDO: held on the context for six seconds,
		// painted by the bar — which the draw rebuilds, so the word cannot live
		// on the bar's own element.
		const ORG_BARSAY_MS = 6000;
		const orgBarSay = (msg: string) => {
			tableCtx.orgBarSaid = msg ? { msg: String(msg), until: Date.now() + ORG_BARSAY_MS } : null;
			try { if (tableCtx.orgBarSayPaint) tableCtx.orgBarSayPaint(); } catch (_) { wsCatch('orgBarSay: tableCtx.orgBarSayPaint();', _); }
		};
		this._orgBarSay = () => (tableCtx.orgBarSaid && Date.now() < tableCtx.orgBarSaid.until) ? tableCtx.orgBarSaid.msg : '';
		const orgJournal = wsOrgJournalMake({
			paint: () => { if (tableCtx.orgHistPaint) tableCtx.orgHistPaint(); },
			say: orgBarSay,
			fail: (msg) => said(msg, true)
		});
		const orgHistPush = orgJournal.push;
		const orgHistRun = orgJournal.run;
		const orgHistApi = orgJournal.api;
		const orgHistOn = orgJournal.on;
		// organizer-writes.ts reads this closure through the names below.
		const orgHeld = new Map<string, Set<string>>();
		const orgWrites = wsOrgWritesMake({
			plugin: this,
			orgHeldAdd: (paths: string[], key: string) => {
				for (const p of paths) { const ks = orgHeld.get(p) || new Set<string>(); ks.add(key); orgHeld.set(p, ks); }
			},
			get orgBulkPaths() { return orgBulkPaths; },
			get orgBulkSay() { return orgBulkSay; },
			get orgHistOn() { return orgHistOn; },
			get orgHistPush() { return orgHistPush; },
			get orgPropValue() { return orgPropValue; },
		});
		const orgPendDrop = orgWrites.orgPendDrop;
		const orgPendGet = orgWrites.orgPendGet;
		const orgPendSame = orgWrites.orgPendSame;
		const orgPropSet = orgWrites.orgPropSet;
		const orgPropListSet = orgWrites.orgPropListSet;
		// organizer-readings.ts reads this closure through the names below.
		const orgReadings = wsOrgReadingsMake({
			plugin: this,
			get markOf() { return markOf; },
			get nameOf() { return nameOf; },
			get orgBackMap() { return orgBackMap; },
			get orgOutLinks() { return orgOutLinks; },
			get orgPendDrop() { return orgPendDrop; },
			get orgPendGet() { return orgPendGet; },
			get orgPendSame() { return orgPendSame; },
			get targetOf() { return targetOf; },
		});
		const orgColRaw = orgReadings.orgColRaw;
		const orgColText = orgReadings.orgColText;
		const orgColAgg = orgReadings.orgColAgg;
		// organizer-chips.ts reads this closure through the names below.
		const orgChips = wsOrgChipsMake({
			plugin: this,
			get markOf() { return markOf; },
			get orgRowList() { return orgRowList; },
		});
		const orgPropKeys = orgChips.orgPropKeys;
		// organizer-rename.ts reads this closure through the names below.
		const orgRename = wsOrgRenameMake({
			plugin: this,
			get orgEditDone() { return orgEditDone; },
			get orgHistPush() { return orgHistPush; },
			get orgProps() { return orgProps; },
			get ownerDoc() { return ownerDoc; },
			get ownerWin() { return ownerWin; },
			get panel() { return panel; },
			get said() { return said; },
			get orgFlagSet() { return orgFlags.orgFlagSet; },
			get orgBulkPaths() { return orgBulkPaths; },
			get orgHistOn() { return orgHistOn; },
			get drawPanel() { return drawPanel; },
		});
		const orgFlags = wsOrgFlagsMake({
			plugin: this,
			get s() { return s; },
			get statusStore() { return statusStore; },
			get markOf() { return markOf; },
			get drawPanel() { return drawPanel; },
			get orgBulkPaths() { return orgBulkPaths; },
			get orgBulkSay() { return orgBulkSay; },
			get orgCellHint() { return orgFiles.orgCellHint; }, set orgCellHint(v) { orgFiles.orgCellHint = v; },
			get orgHistPush() { return orgHistPush; },
			get orgHistOn() { return orgHistOn; },
			get COLS() { return orgCols.COLS; },
			get orgColText() { return orgColText; },
			get orgColRaw() { return orgColRaw; },
			get orgColAgg() { return orgColAgg; },
			get orgUnder() { return orgUnder; },
			get orgAt() { return orgAt; },
			get tableCtx() { return tableCtx; },
		});
		const orgFlagSet = orgFlags.orgFlagSet;
		// organizer-cells.ts reads this closure through the names below.
		const orgCells = wsOrgCellsMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get drawOrg() { return drawOrg; },
			get goalStore() { return goalStore; },
			get nameOf() { return nameOf; },
			get openRow() { return openRow; },
			get orgBulkPaths() { return orgBulkPaths; },
			get orgBulkSay() { return orgBulkSay; },
			get orgColRaw() { return orgColRaw; },
			get orgEditDone() { return orgEditDone; },
			get orgFieldEditor() { return orgFieldEditor; },
			get orgHistOn() { return orgHistOn; },
			get orgHistPush() { return orgHistPush; },
			get orgOtherEditorOpen() { return orgOtherEditorOpen; },
			get orgProps() { return orgProps; },
			get s() { return s; },
			get targetOf() { return targetOf; },
		});
		const orgTagWrap = orgCells.orgTagWrap;
		const orgTagPill = orgCells.orgTagPill;
		// organizer-drag.ts reads this closure through the names below.
		const orgDrag = wsOrgDragMake({
			plugin: this,
			get folderOf() { return folderOf; },
			get nameOf() { return nameOf; },
			get panel() { return panel; },
			get said() { return said; },
		});
		// organizer-mode.ts reads this closure through the names below.
		const orgModeBox = wsOrgModeMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get orgOpen() { return orgOpen; },
			get orgOpenSet() { return orgOpenSet; },
			get s() { return s; },
		});
		const orgWidths = wsOrgWidthsMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get orgGripDrag() { return orgZoom.orgGripDrag; }, set orgGripDrag(v) { orgZoom.orgGripDrag = v; },
			get orgNarrowNow() { return orgNarrowNow; },
			get ownerWin() { return ownerWin; },
			get s() { return s; },
			get ses() { return ses; },
		});
		const orgColFit = orgWidths.orgColFit;
		// THE FOLDER THE PANE IS ON, FOR A TEST TO READ. A READER, NOT A WRITER:
		// `orgSelect` stays the one thing that sets this — a door that could set
		// it would be a second writer of the folder.
		this._orgAt = () => orgFolder;
		// ── THE TREE'S REMOTE ───────────────────────────────────────────
		//
		// Obsidian's own tree drives this window: a folder click chooses, the
		// note you open is followed. The window registers what it can do with
		// the plugin and takes itself off the list when it closes. `select` is
		// the one writer of organizerFolder; `follow` keeps the scope when it
		// already holds the note and moves to the note's folder when it does not.
		const treeDoor: WsOrgDoor = {
			kind: host.kind,
			select: (p: string) => wsOrgDoorSelect({ orgScope, orgSelect, tab }, p),
			follow: (p: string, chosen?: boolean) => wsOrgDoorFollow({ drawPanel, exportOpts, orgFollow, orgScope, tab }, p, chosen),
			tab: () => tab,
			single: () => single,
			// THE MENUS' DOORS: switch the tab and say which host this is so a pane
			// can be revealed.
			tabSet: (id: string) => tabSet(id),
			host: () => host,
			// THE TICKS FOR OBSIDIAN'S TREE are the ticks module's door: state and
			// toggle, all / some / none.
			ticks: orgTicks.door,
			// "Export this" / "Export these" from the tree: exactly these go out.
			// The ticks are read first, so the set lands on the vault's list and not
			// on nothing.
			ticksOnly: (paths: string[]) => orgTicks.setOnly(paths)
		};
		this.orgWindowAdd(treeDoor);
		// A READER, like _orgAt: the note the pane holds, so a test can tell
		// "unmarked in the tree" from "forgotten".
		this._orgNote = () => orgScope.orgNote;
		// ── THE LENS, DRIVEN ────────────────────────────────────
		//
		// The filters are built through SUBMENUS, which open on a real pointer
		// event and cannot be driven by script; this door is how a test sets a
		// lens. IT WRITES NO STORE. `orgLens` is a local: the lens is a
		// session's reading of the manuscript, not a setting.
		this._orgLens = () => JSON.parse(JSON.stringify(orgLensBox.orgLens)) as typeof orgLensBox.orgLens;
		this._orgLensSet = (patch: { sort?: WsLensSort|null; chips?: WsLensChip[]; }) => orgLensSet(patch);
		// A door for a test: the key picker's list goes to a suggest modal no
		// script can open.
		this._orgPropKeys = (at: string) => orgPropKeys(at);
		this._orgPropRows = () => orgPropPanelRows();
		// organizer-props.ts reads this closure through the names below.
		const orgProps = wsOrgPropsMake({
			plugin: this,
			get COLS() { return orgCols.COLS; },
			get ORG_PROP_DOORS() { return ORG_PROP_DOORS; },
			get SORTS() { return orgCols.SORTS; },
			get addProp() { return addProp; },
			get colOff() { return colOff; },
			get drawPanel() { return drawPanel; },
			get fill() { return fill; },
			get liveFiles() { return liveFiles; },
			get orgColFit() { return orgColFit; },
			get orgPropListSet() { return orgPropListSet; },
			get orgPropSet() { return orgPropSet; },
			get orgTagPill() { return orgTagPill; },
			get orgTagWrap() { return orgTagWrap; },
			get ownerDoc() { return ownerDoc; },
			get ownerWin() { return ownerWin; },
			get panel() { return panel; },
			get s() { return s; },
			get host() { return host; },
		});
		const orgPropPopEl = orgProps.orgPropPopEl;
		const orgPropPanelRows = orgProps.orgPropPanelRows;
		const orgPropSubEl = orgProps.orgPropSubEl;
		const orgPropSubClose = orgProps.orgPropSubClose;
		const orgPropPopClose = orgProps.orgPropPopClose;
		const orgOtherEditorOpen = orgProps.orgOtherEditorOpen;
		const orgEditDone = orgProps.orgEditDone;
		const orgPropValue = orgProps.orgPropValue;
		const orgFieldEditor = orgProps.orgFieldEditor;
		// organizer-cols.ts reads this closure through the names below.
		const orgCols = wsOrgColsMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get fill() { return fill; },
			get liveFiles() { return liveFiles; },
			get orgLens() { return orgLensBox.orgLens; }, set orgLens(v) { orgLensBox.orgLens = v; },
			get s() { return s; },
			get ses() { return ses; },
		});
		const colOff = orgCols.colOff;
		const pruneUserCols = orgCols.pruneUserCols;
		const addProp = orgCols.addProp;
		const ORG_PROP_DOORS = orgCols.ORG_PROP_DOORS;
		// organizer-files.ts reads this closure through the names below.
		const orgFiles = wsOrgFilesMake({
			plugin: this,
			get keyOf() { return keyOf; },
			get orgSel() { return orgSel; },
		});
		const folderOf = orgFiles.folderOf;
		const nameOf = orgFiles.nameOf;
		const liveFiles = orgFiles.liveFiles;
		let fill = async () => {};
		let drawPanel = () => {};

		// ── A row's five readings ───────────────────────────────────────────
		// One builder for both kinds: a folder and a note carry exactly the
		// same five, and two builders would be two places for the flag to
		// stop matching the target.
		//
		this._orgSel = () => selRows().map(it => it.path);
		this._orgPropSet = (p: string, k: string, v: unknown) => orgPropSet(p, k, v);
		this._orgPropListSet = (p: string, k: string, v: unknown, before: unknown) => orgPropListSet(p, k, v, before);
		// THE CELL TOO: a test driving the one-cell fast path hands the cell in.
		this._orgFlagSet = (row: { path: string }, id: string, cell: HTMLElement | null) => orgFlagSet(row, id, cell || null);
		// AND WHAT A ROW'S RIGHT-CLICK IS HANDED (A869): its flag and its folder's colour go through these
		this._orgMenuCtx = orgRename.orgMenuCtx;
		// AND THE FIELD EDITOR, opened on a live cell by a test, which cannot
		// keep one open across the redraws the index sends.
		this._orgFieldEditor = (td: HTMLElement, p: string, k: string) => orgFieldEditor(td, p, k, false);
		this._orgSelSet = (paths: string[]) => {
			sel.clear();
			for (const p of (paths || [])) sel.set(keyOf({ kind: 'file', path: p }), { kind: 'file', path: p });
		};

		// THE MODIFIERS BY NAME, off a mouse event or a key event alike —
		// `instanceof MouseEvent` is false in a popout's realm.
		const openRow = (it: { kind: string; path: string; }, ev?: WsModEvent) => {
			if (!it || it.kind !== 'file') return;
			const newTab = !!(ev && (ev.ctrlKey || ev.metaKey));
			try { void this.app.workspace.openLinkText(it.path, '', newTab ? 'tab' : false); }
			catch (_) { wsCatch('openRow: this.app.workspace.openLinkText(it.path)', _); }
		};

		// ── THE CHROME: the titlebar doors, the tab strip, the subject line
		// and the say-line (organizer-chrome.ts). Made before the doors are
		// drawn; the boxes it draws into later come as getters.
		const chrome = wsOrgChromeMake({
			plugin: this,
			host, single, TABS, ses, body, tabsRow, foot,
			get tab() { return tab; },
			set tab(v: string) { tab = v; },
			get subject() { return subject; },
			get orgSel() { return orgSel; },
			get orgScope() { return orgScope; },
			get orgFolder() { return orgFolder; },
			get orgUnder() { return orgUnder; },
			get zoomTag() { return zoomTag; },
			get drawPanel() { return drawPanel; },
		});
		const { drawTabs, tabSet, drawSubject, said } = chrome;
		chrome.doors();

		const subject = right.createDiv({ cls: 'ws-uni-subject' });
		orgZoom.zoomHost = subject;
		const panel = right.createDiv({ cls: 'ws-uni-panel' });
		// ── AND EMPTY SPACE PUTS THEM AWAY ─────────────────────────
		//
		// A property cell's own handler calls `stopPropagation` before anything
		// else, so this listener sees exactly the clicks that are NOT in a cell
		// being edited. BOUND ONCE, HERE, rather than inside `drawOrg`: a
		// listener added on every redraw is a listener stacked hundreds deep by
		// the end of a session, and each copy would call `drawOrg` again.
		panel.addEventListener('click', () => {
			if (panel.querySelector('.ws-org-editor')) drawOrg();
		});
		// ── AND THE PROPERTY STORE IS READ ONCE, HERE ────────────────
		//
		// The only other `structureRead()` on this side lives inside the
		// Export's tick memory; without this the store loaded when a writer
		// visited Export and not otherwise, and a non-md row showed nothing it
		// had been given. ONE SHOT, AND A REDRAW WHEN IT LANDS. `structureRead`
		// caches, so a second call is free — but a redraw per call would not
		// be, and `drawOrg` is called on every keystroke's worth of state change.
		if (!this._structStore) {
			// THROUGH `drawPanel`, NOT `drawOrg`: this window may be showing
			// History or Export when the read lands, and `drawOrg` would paint the
			// Organizer over whichever tab the writer is looking at. `drawPanel`
			// asks which tab first.
			void (async () => {
				try { await this.structureRead(); } catch (_) { wsCatch('openManuscriptModal: await this.structureRead();', _); return; }
				try { drawPanel(); } catch (_) { wsCatch('openManuscriptModal: drawPanel();', _); }
			})();
		}

		// The history keeps its own view state across tab switches — which
		// month you were looking at is not something to lose because you
		// glanced at the report — and it is told that the TREE owns the
		// scope, so it draws no finder and no crumbs of its own.
		const histState: WsHistoryTabState = Object.assign({ scope: '', query: '', shiftPeriod: null, hideScope: true }, this.historyOpeningPeriod());


		this._orgSubject = () => subject;
		this._orgScope = () => exportScope();
		this._orgScopes = () => exportScopes();
		this._orgSubjectRows = () => subjectRows();

		// THE TABLE (`orgTableMake`) reads the window's state through this
		// context — every name the region reads or writes, and nothing else.
		const tableCtx: WsOrgCtx = wsCtxLend<WsOrgCtxOwn>({
			// THE CLOSURE'S OWN: its state, its draws, its doors — what no module
			// holds. What the modules hold is LENT below, by name.
			// The bar's word is set on the context by `orgBarSay` and read by the
			// table's bar; a property from the start, so a name the table reads is
			// a name the context has before anything is said.
			orgBarSaid: null,
			orgHeld,
			get colTextish() { return colTextish; },
			get drawPanel() { return drawPanel; },
			get fill() { return fill; },
			get openRow() { return openRow; },
			get orgFolder() { return orgFolder; },
			get orgIsOpen() { return orgIsOpen; },
			get orgNarrowNow() { return orgNarrowNow; },
			get orgOpenSet() { return orgOpenSet; },
			// THE SELECTION'S DOORS.
			get orgOpenSetMany() { return orgOpenSetMany; },
			get orgHist() { return orgHistApi; },
			get orgPruneUserCols() { return pruneUserCols; },
			get ownerWin() { return ownerWin; },
			get panel() { return panel; },
			get s() { return s; },
			get ses() { return ses; },
			get drawSubject() { return drawSubject; },
			get tab() { return tab; },
		})
		// LENT FROM THE MODULES: each name a getter onto the module — and a
		// setter where the module has one, so a live let written through the
		// context lands where it lives. `wsCtxLend` refuses a name the module
		// does not have, and the checker holds the chain's type against
		// `WsOrgCtx` (org-ctx.ts).
			.lend(orgWidths, ['ORG_COL_MIN', 'ORG_GRIP_CLICK_MS', 'orgColCeil', 'orgColCeilReset', 'orgColFitNow', 'orgColGripBind', 'orgColPx', 'orgColStamp', 'orgColUnfix', 'orgGripReleasedAt', 'orgNameGripBind', 'orgNameLineNow', 'orgNameRO', 'orgNameStamp', 'orgScrollTop', 'orgScrollLeft'])
			.lend(orgCells, ['orgBackCell', 'orgOutCell', 'orgCanHoldProps', 'orgGoalBand', 'orgGoalCell', 'orgDeadlineCell', 'orgPropCell', 'orgPropRefuse', 'orgTagsCell'])
			.lend(orgLensBox, ['orgAddChip', 'orgAt', 'orgFilterByKey', 'orgLens', 'orgLensClear', 'orgLensOn', 'orgLensSet'])
			.lend(orgReadings, ['orgColAgg', 'orgColRaw', 'orgColSortKey', 'orgColText', 'orgFolderIcon', 'orgFolderVocab', 'orgPlanTitle'])
			.lend(orgProps, ['orgEditDone', 'orgEditGuard', 'orgFieldEditor', 'orgOpenAfter', 'orgPropPopClose', 'orgPropPopEl', 'orgPropPopOpen', 'orgRedrawPending'])
			.lend(orgShape, ['setShape', 'showShape', 'typeLabel', 'typeRows'])
			.lend(orgSel, ['orgSelClick', 'orgSelHas', 'orgSelCount'])
			.lend(orgCols, ['SORTS', 'colOff', 'setCols'])
			.lend(orgChips, ['orgChipHit', 'orgPropKeys'])
			.lend(orgFlags, ['orgFlagCell', 'orgRepaintFlagCell'])
			.lend(orgDrag, ['orgDragCol', 'orgGroupDrop', 'orgLastGrouping', 'orgRowDrag'])
			.lend(orgRows, ['orgFilePathCache', 'orgRowList', 'orgUnder'])
			.lend(orgFiles, ['nameOf', 'orgCellHint', 'orgDrawnSig'])
			.lend(orgModeBox, ['orgChevron'])
			.lend(orgRename, ['orgMenuCtx'])
			.lend(orgWrites, ['orgPropSet'])
			.lend(orgScope, ['orgNote', 'showItem'])
			.bag();
		const { drawOrg } = this.orgTableMake(tableCtx);
		// A DOOR ONTO THE CONTEXT, so a test can hold every `ctx.<name>` the
		// table's source reads to a name the live context answers.
		this._orgCtx = () => tableCtx;
		// Left-aligned columns: the ones holding WORDS rather than figures.
		// `ftype` IS A WORD, not a figure: "xlsx" lines up with "md" on its
		// first letter, the way every other column of words in this table
		// does. `read` is deliberately NOT here — "12 min" and "1 h 5 m" are
		// quantities, and quantities line up on the right.
		const colTextish = (col: { id: string; user?: boolean }) =>
			col.id === 'mark' || col.id === 'tags' || col.id === 'ftype'
			|| col.id === 'backlinks' || col.id === 'outlinks' || !!col.user
			|| String(col.id).indexOf('fm:') === 0;

		let panelGen = 0;
		drawPanel = () => {
			const gen = ++panelGen;
			// WHICH FILES A ROW GOVERNS IS A PER-DRAW CACHE, and this is where it
			// is dropped: the scope can change, a file can be added, a tick can
			// move. It is built on the first row that asks and dropped here, the
			// one door every tab's redraw walks through.
			orgTicks.dropIndex();
			// The Organizer wears its own layout on the SHARED panel and
			// subject elements; toggled here, the one door every tab's
			// redraw walks through, so leaving the tab always undresses them.
			panel.toggleClass('ws-org-host', tab === 'organizer');
			subject.toggleClass('ws-org-strip', tab === 'organizer');
			// NOT ON EXPORT: the tree beside it says where you are; the act row
			// says what is going out.
			subject.toggleClass('is-gone', tab === 'export');
			// …SO ON EXPORT THE ZOOM FIGURE RIDES THE ACT ROW, the line that tab
			// always shows, handed over once the row is drawn (below). Every
			// other tab keeps it on the subject line.
			if (tab !== 'export') orgZoom.zoomHost = subject;
			// The new Organizer draws its own pane and asks nothing async.
			if (tab === 'organizer') { drawOrg(); return; }
			const rows = subjectRows();
			// The one subject line: crumbs and counts, the same on every tab.
			drawSubject();
			// ── THE EXPORT TAB IS REFRESHED, NOT REBUILT ──────────────
			//
			// A row click once rebuilt the whole tab — the split, the act row, the
			// preview column — so the buttons slid left and the preview vanished
			// for the 210ms until the debounced compile put everything back.
			// NOTHING IN THIS PANEL IS SHAPED BY THE SCOPE: `buildExportAct` and
			// `buildExportOptions` are handed FUNCTIONS — `scope`, `compileList`,
			// `total` — precisely so they read live state rather than a captured
			// copy.
			//
			// `loadTicks` IS STILL AWAITED, and it is the reason this is not
			// merely a repaint: its cache is keyed on the scope, so a new
			// selection genuinely reloads that folder's remembered ticks. An
			// unchanged scope returns the same Set without touching disk.
			//
			// AND THE GENERATION IS CHECKED after the await, like every other
			// async draw here: a third selection arriving mid-read must not
			// have the second one's figures painted over it.
			if (tab === 'export' && exportOpts && panel.querySelector('.ws-export-split')) {
				void (async () => {
					try { await loadTicks(); } catch (_) { wsCatch('openManuscriptModal: await loadTicks();', _); return; }
					if (gen !== panelGen) return;
					try { if (exportOpts && exportOpts.refresh) exportOpts.refresh(); } catch (_) { wsCatch('openManuscriptModal: if (exportOpts && exportOpts.refresh) exportOpts.refresh();', _); }
				})();
				return;
			}
			// EMPTIED, SO THE HANDLES ARE DEAD: a stale handle would repaint a row
			// that is no longer on screen.
			exportOpts = null;
			panel.textContent = '';
			if (tab === 'export') {
				void (async () => {
					await drawExport();
					const act = panel.querySelector<HTMLElement>('.ws-export-top');
					if (tab === 'export' && act) { orgZoom.zoomHost = act; zoomTag(); }
				})();
				return;
			}
			drawHistory(rows);
			void gen;
		};


		// ── The Export tab ──────────────────────────────────────────────────
		//
		// The same two builders as the compile itself, handed the scope from
		// the tree and the list from the ticks. NO DRAG HERE: order is the
		// tree's — Obsidian's own — and a third place to set it would be two
		// answers to one question.
		//
		// WHAT THE EXPORT TAB WAS BUILT WITH, so a redraw can ask it to refresh
		// instead of building it again. Cleared whenever the panel is emptied,
		// because a handle to a detached row is worse than none. ONE HANDLE,
		// NOT TWO: the act row's `repaint` did nothing on this path.
		let exportOpts: WsExportPanelHandle | null = null;
		// The Export and History panels are methods (`orgDrawExport`,
		// `orgDrawHistory`); the window hands them what they read.
		const drawExport = () => this.orgDrawExport({ panel, tab: () => tab, ticks: () => orgTicks.current(),
			tickAll: (on: boolean) => orgTicks.setAll(on),
			drawPanel: () => drawPanel(), exportFiles, exportScope, exportScopes, loadTicks,
			setExportOpts: (o: WsExportPanelHandle | null) => { exportOpts = o; } });
		const drawHistory = (rows: { kind: string; path: string }[]) => this.orgDrawHistory({ panel, tab: () => tab, drawPanel: () => drawPanel(), histState }, rows);


		// ── The keyboard ────────────────────────────────────────────────────
		//
		// The file explorer's, because that is the tree this window stands in
		// for: up and down to move (Alt with them to move the row), Enter to
		// open the note, space to flag it. Not while the writer is
		// typing: every target box is inside this scope, and a down-arrow in a
		// text field means "go to the end of the line" everywhere else in the
		// app.
		const typing = (fromSearch: boolean) => {
			const el = ownerDoc().activeElement;
			return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
				|| (el as HTMLElement).isContentEditable));
		};
		// organizer-keys.ts reads this closure through the names below.
		const orgKeys = wsOrgKeysMake({
			plugin: this,
			get drawPanel() { return drawPanel; },
			get exportScope() { return exportScope; },
			get folderOf() { return folderOf; },
			get host() { return host; },
			get itemOf() { return itemOf; },
			get keyOf() { return keyOf; },
			get markOf() { return markOf; },
			get openRow() { return openRow; },
			get orgFlagSet() { return orgFlagSet; },
			get orgFollow() { return orgFollow; },
			get orgLensClear() { return orgLensClear; },
			get orgLensOn() { return orgLensOn; },
			get orgNote() { return orgScope.orgNote; },
			get orgPropPopClose() { return orgPropPopClose; },
			get orgPropPopEl() { return orgPropPopEl; },
			get orgPropSubClose() { return orgPropSubClose; },
			get orgPropSubEl() { return orgPropSubEl; },
			get orgProps() { return orgProps; },
			get orgSel() { return orgSel; },
			get panel() { return panel; },
			get sel() { return sel; },
			get tab() { return tab; },
			get typing() { return typing; },
		});
		const onEscape = orgKeys.onEscape;
		const onHistKey = (ev: KeyboardEvent) => wsOrgHistKey({ host, orgHistMine, orgHistRun, ownerDoc, tab }, ev);
		const orgHistMine = () => wsOrgHistMine(this, { host, onHistKey });
		this._orgHist = orgHistApi;
		this._orgHistKey = (ev: KeyboardEvent) => onHistKey(ev);
		this._orgHistActive = onHistKey;
		try { (host.rootEl || host.contentEl).addEventListener('pointerdown', () => { this._orgHistActive = onHistKey; }, true); } catch (_) { wsCatch('openManuscriptModal: host.rootEl.addEventListener(pointerdown, orgHistActive)', _); }
		let stopEscape = () => {};
		try {
			// ON THIS WINDOW'S OWN DOCUMENT. Bare `window` here meant Escape
			// in a popout reached nothing: the keydown happens in the popout
			// and the listener is sitting on the main window.
			const ew = ownerWin();
			ew.addEventListener('keydown', onEscape, true);
			ew.addEventListener('keydown', onHistKey, true);
			stopEscape = () => {
				try { ew.removeEventListener('keydown', onEscape, true); } catch (_) { wsCatch('openManuscriptModal: ew.removeEventListener(\'keydown\', onEscape, true);', _); }
				try { ew.removeEventListener('keydown', onHistKey, true); } catch (_) { wsCatch('openManuscriptModal: ew.removeEventListener(\'keydown\', onHistKey, true);', _); }
			};
		} catch (_) { wsCatch('openManuscriptModal: const ew = ownerWin();', _); }

		// THE OTHER TREE COUNTS TOO. Dragging a chapter in Obsidian's explorer
		// used to leave this window drawing the order it had drawn last: the
		// explorer was asked to sort again and nothing asked this. Registered
		// here and dropped in `onClose`, so a window that has been shut is not
		// still being redrawn for the rest of the session.
		const stopWatching = this.onTreeOrderChange(() => {
			void fill();
			// The Organizer's table IS the order too: a drag in either pane, in
			// Obsidian's explorer, or an edit to the order file must move the rows
			// in both places or the two are two orders again — the fault this
			// window exists to remove.
			if (tab === 'organizer') drawPanel();
		});
		// BOTH WATCHERS COME OFF. A window that unregisters one of two keeps a
		// dead window's `draw` alive for the rest of the session, drawing into
		// an element nothing can see — and doing it on every save.
		//
		// THROUGH THE HOST, which chains rather than overwrites: a leaf has
		// its own teardown to run and a window that replaced it would leave
		// the pane half-dismantled.
		host.onClose(() => wsOrgWindowClosed(this, { onHistKey, orgIndexChanged, orgNav, orgPropPopClose, orgScope, orgWidths, stopEscape, stopWatching, treeDoor }));

		// SET AT BUILD, not only on a click: the window can OPEN on this tab,
		// not only switch to it.
		body.toggleClass('is-organizer', tab === 'organizer');
		// (`is-treeoff` is the one-column layout's class.)
		body.toggleClass('is-treeoff', !ses.treeShown);
		// ── THE ACTIVE NOTE IS THE OPENING SELECTION ────────────────────────
		// A writer mid-scene opens the Organizer ABOUT that scene: the pane
		// shows its folder, the note is marked, the cursor stands on it so
		// the arrows continue from there, and its shut ancestors open so the
		// mark is on screen. Open-time only — arrowing away is not undone by
		// a redraw, and a pane host keeps the writer's later choices.
		wsOrgOpenOnNote(this, { folderOf, orgFollow, orgOpen, s, tab });
		drawTabs();
		// …and here too, not only in the tab handler. The window can be OPENED
		// on any tab — `openManuscriptModal({tab})`, the palette, the bar — and
		// a control drawn only by the handler is a control that is wrong for
		// every entry that does not go through it.
		void fill();
		drawPanel();
		// The opening mark is brought ON SCREEN — a selection the writer
		// cannot see is indistinguishable from none.
		if (orgScope.orgNote) {
			try {
				// ON THE PANEL: the mark is a table row.
				const el0 = panel.querySelector('tr.ws-org-row.ws-org-active');
				if (el0 && el0.scrollIntoView) el0.scrollIntoView({ block: 'center' });
			} catch (_) { wsCatch('openManuscriptModal: const el0 = panel.querySelector(tr.ws-org-row.ws-org-active);', _); }
		}
		host.show();
		// THE HOST'S OWN HANDLE, so a caller gets back the thing it can act
		// on — a modal or a leaf — rather than the seam.
		return host.handle();
	},

	// ── WHAT A FOLDER LOOKS LIKE, ASKED IN ONE PLACE ────────────────────────
	//
	// A CLASS METHOD, because the explorer's painter (tree.ts) cannot reach
	// a closure inside the window and would otherwise need a COPY of the
	// colour lookup — a second writer of the fact. Three surfaces, one
	// function: a colour set in the tree and absent elsewhere is two answers
	// to "which folder is this".

	orgFolderIcon(this: WordSmith, into: HTMLElement, path: string, open: boolean) {
		// ── THE SWITCH IS ANSWERED WHERE THE GLYPH IS BORN ──────────────
		//
		// HERE RATHER THAN AT THE CALL SITES. There are five of those, and a
		// switch read at five places is four chances to add a sixth that
		// forgets. Nothing reads the return value, so leaving early costs
		// nothing, and the span is never made rather than being made and
		// hidden: an element with `margin-inline-end` that is only invisible
		// leaves its gap behind.
		if (this.settings.orgFolderIcons === false) return null;
		const ic = into.createSpan({ cls: 'ws-foldericon' });
		// TRIED IN ORDER AND CHECKED: `setIcon` on a name this build's Lucide
		// does not know leaves the element empty instead of throwing — how the
		// export icon went missing for a release.
		let drew = false;
		for (const n of (open
			? ['folder-open', 'folder'] : ['folder-closed', 'folder'])) {
			ic.textContent = '';
			try { if (setIcon) setIcon(ic, n); } catch (_) { wsCatch('orgFolderIcon: if (setIcon) setIcon(ic, n);', _); }
			if (ic.childElementCount > 0) { drew = true; break; }
		}
		// THE FALLBACK IS LOAD-BEARING.
		if (!drew) wsSvgInto(ic, wsFolderSvg(!!open, 12));
		// A COLOURED FOLDER IS COLOURED EVERYWHERE.
		const cid = ((this.settings.folderColors || {})[path]) || '';
		const cdef = WS_FOLDER_COLOURS.filter(c => c.id === cid)[0];
		if (cdef && cdef.css) ic.style.color = cdef.css;
		return ic;
	},

	// ── WHAT A TARGET CELL SAYS ────────────────────────
	//
	// The reading lives in the column that already holds the target rather
	// than in a column of its own. A CLASS METHOD, so every cell says it
	// the same way — two answers to one question is the mistake this window
	// keeps deleting.
	//
	// NO TARGET, NOTHING SAID. Zero is a measurement and blank is the
	// absence of one; a cell reading "0%" claims a scene has a goal and has
	// made no progress towards it.
	//
	// AND THE PERCENTAGE NEVER ROUNDS UP TO 100 BEFORE IT IS MET. 4,999 of
	// 5,000 is 99.98%, and a writer who reads 100% stops. It is not capped
	// at the top either: past the target is past it, which is the one thing
	// an over-long scene needs to say.
	// `show` is the bar's {target}, which has its own shape; the Organizer's
	// cells leave it out and follow the column's.
	orgTargetSay(this: WordSmith, words: number, target: number) {
		const t = Number(target) || 0;
		if (t <= 0) return '';
		const w = Number(words) || 0;
		const how = (this.settings && this.settings.orgTargetShow)
			|| 'percent';
		if (how === 'percent') {
			const raw = (w / t) * 100;
			// ROUNDED, THEN CLAMPED — not floored. Flooring made 42.9% read
			// as 42%, which is a different lie from the one being avoided:
			// the clamp is only there to stop 99.98% printing as 100%,
			// because a writer who reads 100% stops writing.
			const pct = (raw < 100) ? Math.min(99, Math.round(raw))
				: Math.round(raw);
			return pct + '%';
		}
		return w.toLocaleString() + '/' + t.toLocaleString();
	},

	orgKindIcon(this: WordSmith, into: HTMLElement, path: string) {
		// The file half of the pair above, on the same terms: one gate at
		// the one place a file glyph is made.
		if (this.settings.orgFileIcons === false) return null;
		const isMd = /\.md$/i.test(String(path));
		const kindIc = into.createSpan({ cls: 'ws-uni-kindicon' });
		let names = ['file'];
		// A NOTE GETS THE PLAIN SHEET, NOT THE RULED ONE: lucide's file-text
		// draws three rules inside the sheet, which at 14px reads as texture
		// rather than as a kind. THIS IS THE ONE WRITER of the glyph: the
		// explorer, the Organizer and the export list all call orgKindIcon, so
		// all three change together. The fallback chain stays a chain on
		// purpose: setIcon fails SILENTLY on a name this build's Lucide does
		// not know.
		if (isMd) names = ['file'];
		else {
			const grp = this.uniTypeGroups()
				.filter((g) => g.id === this.uniTypeGroupOf({ path }))[0];
			names = (grp && grp.icons) || ['file'];
		}
		// `setIcon` FAILS SILENTLY on a name this build's Lucide does not
		// know - it leaves the element empty and throws nothing - so the
		// names are tried in order and the result is checked.
		for (const n of names) {
			kindIc.textContent = '';
			try { if (setIcon) setIcon(kindIc, n); } catch (_) { wsCatch('orgKindIcon: if (setIcon) setIcon(kindIc, n);', _); }
			// THE NAME THAT DREW IS RECORDED. `setIcon` fails silently, so a test
			// with no renderer cannot see a glyph at all — but it can see which
			// name was asked for, which is the half that tells a plain sheet from a
			// badge. Same pattern as the history stepper and the lens buttons.
			kindIc.dataset.icon = n;
			if (kindIc.childElementCount > 0) break;
		}
		return kindIc;
	},

	// ── AND THE FORMAT IS SAID IN WORDS, WHERE OBSIDIAN SAYS IT ───────
	//
	// `nav-file-tag` IS OBSIDIAN'S OWN CLASS, borrowed rather than copied.
	// Our rows are already built out of the explorer's markup —
	// `tree-item-self`, `nav-file-title`, `tree-item-inner` — so the label
	// needs no rule of ours to look right, and it goes on looking right
	// when a theme restyles the real explorer.
	//
	// A NOTE GETS NONE. Obsidian omits the tag for .md because every row
	// in a vault would carry the same word, which is no information at
	// all; the same is true here. LOWER CASE, as the app writes it.
	orgKindTag(this: WordSmith, into: HTMLElement, path: string) {
		const p = String(path || '');
		if (/\.md$/i.test(p)) return null;
		const bits = (p.split('/').pop() || '').split('.');
		if (bits.length < 2) return null;
		const ext = (bits.pop() || '').toLowerCase();
		if (!ext) return null;
		return into.createDiv({ cls: 'nav-file-tag', text: ext });
	},

	// ════════════════════════════════════════════════════════════════════════
	// THE EXPORT AND HISTORY PANELS, OUT OF THE WINDOW
	// ════════════════════════════════════════════════════════════════════════
	//
	// Methods, handed exactly the handful of the window's names they read
	// as `ctx` — the reads as functions (`tab()`, `ticks()`), because a
	// `let` copied at call time is the value it had then; the one write
	// (`exportOpts`) as a setter.

	async orgDrawExport(this: WordSmith, ctx: WsOrgExportCtx) {
		const { panel, exportFiles, exportScope, loadTicks } = ctx;
		const drawPanel = () => ctx.drawPanel();
		// ── ONE LIST, AND THE PANE COUNTS THE ONE THE BUTTON COMPILES ───
		//
		// One filter for `compileList` and for the figures under the controls:
		// the count cannot drift from the compile, because there is nothing
		// for it to drift from.
		const exportGoing = () => { const ticks = ctx.ticks(); return exportFiles().filter(
(			f: TAbstractFile) => ticks && ticks.has(f.path)); };
		panel.createDiv({ cls: 'ws-report-loading', text: wsT('Reading\u2026') });
		await loadTicks();
		if (ctx.tab() !== 'export') return;
		panel.textContent = '';
		const act = panel.createDiv({ cls: 'ws-export-top ws-uni-act' });
		const actHandle = this.buildExportAct(act, {
			scope: () => exportScope(),
			compileList: () => exportGoing(),
			total: () => exportFiles().length,
			tickAll: (on: boolean) => ctx.tickAll(on),
			// A TAB DOES NOT CLOSE ITSELF after a compile: the writer is standing
			// in their manuscript and has somewhere to go back to.
			onDone: () => { drawPanel(); }
		});
		// THE COUNT BESIDE THE BUTTON, because it is the fact that matters. The
		// act row (`.ws-export-top`) is built first, so the count is put INTO
		// that row rather than a copy made there; if the row is not there, the
		// panel keeps the count where it has always been.
		const actRow = panel.querySelector('.ws-export-top');
		const goEl = actRow ? actRow.querySelector('.ws-export-go') : null;
		const countEl = (actRow || panel).createDiv({
			cls: 'ws-uni-count' + (actRow ? ' is-besidego' : '') });
		// BEFORE the button, so it reads as the sentence the button acts on.
		// (`before`, not the row's insertBefore: the button lives in the format's group since A715)
		if (actRow && goEl) goEl.before(countEl);
		const bits: string[] = [];
		countEl.setText(bits.join('  \u00b7  '));
		countEl.style.display = bits.length ? '' : 'none';
		// THE OPTIONS GET THE LIST TOO. The preview lives beside them and
		// compiles what is TICKED — THE SAME TWO THE ACT LINE GETS, from the
		// same two functions: a preview compiling a different list from the
		// button beside it is the fault `compileList` exists to prevent.
		ctx.setExportOpts(this.buildExportOptions(panel, {
			scope: () => exportScope(),
			compileList: () => exportGoing(),
			// HOW MANY THERE ARE TO GO OUT, not how many are ticked. The
			// figures line beside the button says "11 out of 47 notes" now,
			// and 47 is a fact only this side knows: the preview is handed a
			// compiled list and cannot see what was left out of it.
			//
			// A FUNCTION, NOT A NUMBER, for the same reason `scope` and
			// `compileList` are: the pane recompiles on every option change
			// and a captured count would be the one that was true when the
			// pane was built.
			total: () => exportFiles().length,
		}));
		// ── AND THEN THE FORMAT IS PAINTED AGAIN ────────────────────
		//
		// `buildExportAct` ends by calling its own `paintFmt`, which sweeps the
		// pane for the controls that need pages and hides them — and the act
		// row is built ABOVE the options, so at that moment there is nothing in
		// the pane to find. `repaint` runs the sweep once the options exist.
		// Guarded, because a future caller may not return one.
		try { if (actHandle && actHandle.repaint) actHandle.repaint(); } catch (_) { wsCatch('orgDrawExport: if (actHandle && actHandle.repaint) actHandle.repaint();', _); }
	},

	orgDrawHistory(this: WordSmith, ctx: WsOrgHistoryCtx, rows: { kind: string; path: string }[]) {
		const { panel, histState } = ctx;
		const drawPanel = () => ctx.drawPanel();
		// The paths, not the rows: the record is kept per path, and a
		// folder covers everything beneath it by prefix — which is also
		// what makes an overlapping selection count a day once.
		histState.scope = rows.map((r) => r.path);
		try {
			if (this.settings.historyTracking && !this._historyReady) {
				panel.createDiv({ cls: 'ws-report-loading', text: wsT('Reading\u2026') });
				void (async () => {
					await this.historyLoad();
					// The period, not the scope: reopening the record must
					// not throw away the tree's selection.
					const at = this.historyOpeningPeriod();
					histState.year = at.year;
					histState.month = at.month;
					if (ctx.tab() === 'history') drawPanel();
				})();
				return;
			}
			this.renderHistoryTab(panel, histState, () => drawPanel());
		} catch (e) {
			panel.textContent = '';
			panel.createDiv({ text: wsT('History failed \u2014 {error}', { error: wsErrMsg(e) }) });
		}
	},

	// ════════════════════════════════════════════════════════════════════════
	// THE TABLE, OUT OF THE WINDOW
	// ════════════════════════════════════════════════════════════════════════
	//
	// A factory. `ctx` is the window's own state seen through accessor
	// properties: a read of `ctx.tab` is the window's `tab` at that moment,
	// an assignment through `ctx` sets the window's variable. Nothing here
	// copies a value; nothing here owns one the window also owns.
	orgTableMake(this: WordSmith, ctx: WsOrgCtx) {
		const s = ctx.s;
		const fill = () => ctx.fill();
		// ── THE ORGANIZER'S RIGHT PANE — the Table view ────────────────────
		//
		// A native <table>, because the data is flat: column sizing from real
		// glyphs, header/cell alignment by construction, sticky header and
		// sticky name column — no custom sizing code. Caps are `max-width` +
		// ellipsis on the cell, the full value on the hover.
		//
		// Custom order (no lens): rows grouped under folder headers, book
		// order. ANY lens up: the groups DISSOLVE to a flat list, each row
		// carrying its faint path — groups pin rows to folders, a sort claims
		// the order, and both cannot hold. Everything is drawn from the INDEX
		// and the stores; the fold state and the tree's DOM do not exist on
		// this side of the window.
		// ── WHILE AN EDITOR HOLDS THE PANE, THE OTHER ROWS STILL SHOW A BULK EDIT ──
		//
		// A tag typed into a box on one of several selected rows is written to
		// all of them, but the pane is not rebuilt while the box has the caret,
		// so the other rows went on showing their old tags until the box was
		// left, and a bulk edit read as one that had not happened. Their Tags
		// cells are rebuilt in place instead, from the index as it now stands;
		// the row being typed in is never touched.
		const orgRepaintHeld = () => {
			for (const [path, keys] of ctx.orgHeld) {
				if (!keys.has('tags')) continue;
				const tr = Array.from(ctx.panel.querySelectorAll('tr.ws-org-row')).find((r) => r.getAttribute('data-path') === path);
				const old = tr ? tr.querySelector('td[data-col="tags"]') : null;
				if (!tr || !old || old.querySelector('.ws-org-editor')) continue;
				// made on the row and moved into the old cell's place by `replaceWith`
				const td = tr.createEl('td', { cls: old.className, attr: { 'data-col': 'tags' } });
				const style = old.getAttribute('style');
				if (style) td.setAttribute('style', style);
				const cut = path.lastIndexOf('/');
				ctx.orgTagsCell(td, { path, parent: cut === -1 ? '' : path.slice(0, cut), kind: 'file', group: '', depth: 0, rel: '', idx: 0 });
				old.replaceWith(td);
			}
		};
		const drawOrg = () => {
			// THE SCAN IS ONE DRAW OLD AT MOST — see `orgAllFilePaths`.
			ctx.orgFilePathCache = null;
			// AND SO IS THE COLUMN CEILING: the pane may have been resized since
			// the last draw, so the cached `clientWidth` is dropped here and
			// re-read ONCE, rather than once a cell.
			ctx.orgColCeilReset();
			// THE EDIT-GUARD'S TEETH: while an editor holds focus, the pane
			// is not rebuilt — the redraw waits for the edit to end. This is
			// the one gate every repaint passes, so no caller can forget it.
			if (ctx.orgEditGuard) { ctx.orgRedrawPending = true; orgRepaintHeld(); return; }
			ctx.orgHeld.clear();
			// ── AND WHERE THE WRITER WAS LOOKING ─────────────────
			//
			// THE SCROLLER IS BUILT FRESH EVERY DRAW. `.ws-org-panel` is
			// `overflow: auto` and it is created by this function — so the element
			// the writer scrolled is thrown away and a new one, at zero, takes its
			// place. Every redraw — a commit, Escape, a click on another cell, a
			// property landing from the index ring — would throw the writer to the
			// first row, so the position is carried HERE, at the one gate every
			// repaint passes. READ FROM THE VARIABLE, NOT FROM THE ELEMENT — see
			// `orgScrollTop`, where the reason is.
			const orgKeepScroll = ctx.orgScrollTop;
			const orgKeepScrollX = ctx.orgScrollLeft || 0;
			// Idempotent kick: the first draw starts the sweep, the ring
			// repaints when it lands. Everything below reads what the index
			// knows NOW and blanks what it does not — unknown is not empty.
			void this.orgIndexEnsure();
			// A COLUMN WITH NO PROPERTY BEHIND IT GOES: once the index is built, a
			// user column whose key no note carries is dropped before the columns
			// are read.
			try { if (this._orgIndexBuild == null && ctx.orgPruneUserCols) ctx.orgPruneUserCols(); } catch (_) { wsCatch('drawOrg: ctx.orgPruneUserCols();', _); }
			const at = ctx.orgAt();
			// THE COLUMNS ARE A LIST, so every row, header, drag, sort and drawer
			// below reads `cols` — a second renderer would be a second writer of
			// the row. `uniColsOff` is the writer's own choice and nothing here
			// touches it.
			const cols = ctx.setCols();
			const lensed = ctx.orgLensOn();
			// A LENS SEES THE WHOLE SELECTION, FLAT; the book's own order is a
			// hierarchy. One list function, two questions.
			//
			// ── …AND THE THIRD QUESTION IS WHAT SHAPE OF THING ─────────
			//
			// HERE AND NOT IN `orgRowList`. That walk has two other callers —
			// `orgPropKeys` and the tag list — which use it to ENUMERATE what is
			// under the selection for the filter menu. Narrowing it there would
			// empty both menus while Folders only is up, leaving a writer unable to
			// build the filter that would get them out.
			//
			// FILES ONLY FLATTENS, and it has to. Dropping folder ROWS from a
			// grouped walk strands every note in a shut folder: no row left to
			// unfold, and a fold that filters is a filter nobody can see. A lens
			// flattens for the same reason.
			const shaped = ctx.showShape();
			// ── AND THE FOURTH QUESTION IS WHICH KINDS ────────────────────
			//
			// `orgRowList` enumerates the vault and the narrowing is here, next to
			// the shape, for the same reason the shape is here and not in the walk.
			// NOTHING CHANGES FOR A WRITER WHO HAS NOT ASKED: `uniTypeSet` answers
			// `['md']` when the store is absent or empty. ONE STORE, ASKED ONCE:
			// the tree, the chip and the kinds menu all read `uniTypes`. THE ONE
			// PREDICATE: `uniTypeAllows` is the membership rule — an extension of
			// its own under Other included; the stamped group stays for whoever
			// else reads it.
			const list = ctx.orgRowList(at, lensed || shaped === 'files')
				.filter((r0: { kind: string; path: string }) => r0.kind === 'folder' || this.uniTypeAllows({ path: r0.path }))
				.filter((r0: { kind: string; }) => (shaped === 'folders' ? r0.kind === 'folder'
					: shaped === 'files' ? r0.kind !== 'folder' : true));
			const sort = ctx.orgLens.sort;
			const sortCol = sort ? (cols.filter((c) => c.id === sort.id)[0] || null) : null;
			const sortDir = sort ? sort.dir : 'desc';
			// THE NAME SORT HAS NO COLUMN: the button, the chip and the menu all
			// ask "what is the sort called" and would get nothing for it.
			const sortByName = !sortCol && !!sort && sort.id === 'name';
			const sortLabel = sortCol ? sortCol.label + wsSortArrow(sortDir)
				: sortByName ? wsT('Name') + wsSortArrow(sortDir) : '';

			// ── which rows the lens leaves ──────────────────────────────
			const shown = list.filter((row: WsOrgRow) => {
				for (const c of ctx.orgLens.chips) {
					if (!c.off && !ctx.orgChipHit(c, row.path)) return false;
				}
				// Sorting BY a reading hides what has no value for it; the
				// strip's "N of M" accounts for them below.
				if (sortCol && ctx.orgColRaw(sortCol, row.path) === null) return false;
				return true;
			});
			let rows = shown;
			// BY NAME, WHICH IS NOT A READING: `sortCol` is looked up in the
			// reading columns and the Name is not one — its heading is built
			// outside the column loop. The key is the name the row SHOWS
			// (`nameOf`), compared the way the readings' text keys are, so "Ch 2"
			// sorts before "Ch 10". A lens flattens the list to files, so there is
			// no folder to place.
			if (sortByName) {
				const dir = sortDir === 'asc' ? 1 : -1;
				rows = shown.slice().sort((a, b) => {
					const d = String(ctx.nameOf(a.path)).localeCompare(
						String(ctx.nameOf(b.path)), undefined, { numeric: true });
					if (d) return d * dir;
					return a.idx - b.idx;
				});
			}
			if (sortCol) {
				const dir = sortDir === 'asc' ? 1 : -1;
				rows = shown.slice().sort((a, b) => {
					const ka = ctx.orgColSortKey(sortCol, a.path);
					const kb = ctx.orgColSortKey(sortCol, b.path);
					let d = 0;
					if (typeof ka === 'number' && typeof kb === 'number') d = ka - kb;
					else d = String(ka).localeCompare(String(kb), undefined, { numeric: true });
					if (d) return d * dir;
					return a.idx - b.idx;   // stable: ties keep book order
				});
			}

			// ── AND IF NOTHING BUT ONE CELL CHANGED, ONLY THAT CELL ──────
			//
			// THE GUARD IS THE REAL LIST, NOT A GUESS ABOUT IT. A flag can
			// legitimately MOVE a row — the table can be sorted by it — or HIDE
			// one, because a lens chip can filter on it. So the rows are computed
			// FIRST, by the code that always computes them, and the shortcut is
			// taken only when the answer is identical: if the list moved, this
			// falls through and the pane is rebuilt exactly as before. The data
			// half is not the cost (0.1ms against 8ms for the draw).
			// ── ROW NUMBERS, IN THE BOOK'S ORDER ─────────────────────
			//
			// The opened folder is 0 and is not a row; its rows count 1, 2, 3 in
			// the order shown, folders and files alike; a folder's rows count
			// inside it, 1.1, 1.2; deeper, 1.1.1. One counter per depth, the deeper
			// ones dropped each time a shallower row comes — so a folded folder's
			// files keep their numbers, being absent, and its siblings keep theirs.
			// Under a lens the list is flat and sorted: 1..n as shown. The widest
			// number sets the column's width, stamped on the table for the sheet
			// to read (`--ws-org-numw`).
			const nums = s.uniRowNumbers ? new Map<string, string>() : null;
			let numW = 0;
			if (nums) {
				const counters: number[] = [];
				for (const r0 of rows) {
					const d = lensed ? 0 : (r0.depth || 0);
					counters.length = d + 1;
					counters[d] = (counters[d] || 0) + 1;
					const label = counters.slice(0, d + 1).join('.');
					nums.set(r0.path, label);
					if (label.length > numW) numW = label.length;
				}
			}
			const sig = rows.map((r0: { path: string }) => r0.path).join('\n');
			const hint = ctx.orgCellHint;
			ctx.orgCellHint = null;
			if (hint && ctx.orgDrawnSig !== null && sig === ctx.orgDrawnSig
				&& ctx.orgRepaintFlagCell(hint.td, hint.path)) {
				return;
			}
			ctx.orgDrawnSig = sig;

			// ── the summary strip ────
			// THE ONE SUBJECT LINE: the window draws it the same on every tab.
			ctx.drawSubject();
			// (TOMBSTONE, A872: the history store loaded for a "today's net" figure no draw read any more)
			// N OF M IS ABOUT NOTES: a folder is a row and not a note, and so is one
			// of the plugin's own store notes (`ws-structure.md`, `ws-settings.md`,
			// `ws-history.md`), which the index leaves out through `isFileCounted`.
			// The rows stay — the count moves. ASKED OF `isFileCounted` AND NOT OF
			// THE INDEX, deliberately: the index fills in asynchronously, so "not in
			// the index" also means "not read yet", and a fresh window would count
			// 0 notes for a moment. Unknown is not empty.
			const orgCounted = (p0: string) => {
				try {
					const f0 = this.app.vault.getAbstractFileByPath(String(p0 || ''));
					return !!f0 && !f0.children && this.isFileCounted(f0);
				} catch { return false; }
			};
			const noteCount = (rr: WsOrgRow[]) => rr.filter((r0) => r0.kind !== 'folder'
				&& orgCounted(r0.path)).length;
			const narrowed = noteCount(rows) < noteCount(list);

			// ── the bar: Sort by + AND-combined property chips ──────────
			ctx.panel.textContent = '';
			wsOrgDrawBar(this, { at, cols, ctx, list, narrowed, noteCount, rows, s, sortByName, sortCol, sortDir, sortLabel });

			// ── the table ───────────────────────────────────────────────
			wsOrgDrawTable(this, { at, cols, ctx, fill, lensed, list, noteCount, numW, nums, orgKeepScroll, orgKeepScrollX, rows, s, shaped, sortCol, sortDir });
		};
		return { drawOrg };
	},

	// ════════════════════════════════════════════════════════════════════════
	// THE TREE'S REMOTE: Obsidian's file tree drives the Organizer
	// ════════════════════════════════════════════════════════════════════════
	//
	// Every open window — tab and pop-out — registers a DOOR here when it
	// opens and takes it away when it closes; the tree's right-click and the
	// note you open reach every door there is. A door that throws is
	// contained and named, so one broken window cannot stop the others.
	//
	// A CLICK IN THE TREE CHOOSES NOTHING (A892, the writer: "i dont want to
	// click on folders and the organizer to switch there. remove that,
	// including history too, so remove the pin too"). The capture-phase
	// listener that made a folder click the window's folder is gone, and
	// with it the pin that shut it off; a note opened is only marked
	// (`wsOrgDoorFollow`). The right-click below is the tree's one way in.

	orgWindows(this: WordSmith) {
		return (this._orgWindows || []).slice();
	},

	orgWindowAdd(this: WordSmith, door: WsOrgDoor) {
		this._orgWindows = this.orgWindows().filter((d) => d !== door);
		this._orgWindows.push(door);
		this.orgTicksSchedule();
	},

	orgWindowDrop(this: WordSmith, door: WsOrgDoor) {
		this._orgWindows = this.orgWindows().filter((d) => d !== door);
		this.orgTicksSchedule();
	},

	// ── THE EXPORT TICKS, IN OBSIDIAN'S TREE ──────────────────
	//
	// While a window has its Export tab up, every note row and folder row
	// in the file explorer carries a box: the same tick, the same store,
	// the same all / some / none. Off otherwise, and taken away when the
	// last window closes.
	//
	// PAINTED BY PATH, NOT BY SCAN: Obsidian's explorer keeps `fileItems`,
	// a map from path to the row it built, and reuses those rows when its
	// virtual scroller detaches and reattaches them — so a box put on
	// `selfEl` survives scrolling and no observer has to put it back. A
	// row scan is the fallback for a build without the map.
	//
	// THE TICK NEVER OPENS THE NOTE OR FOLDS THE FOLDER: the box stops its
	// own click and mousedown before the row's handlers see them, and the
	// folder-click hook above ignores it by class.
	orgTicksDoor(this: WordSmith) {
		for (const w of this.orgWindows()) {
			try {
				if (!w.ticks) continue;
				if (w.ticks.wanted()) return w;
			} catch (e) { wsGuardReport('the Organizer answering whether the tree wants ticks', e); }
		}
		return null;
	},

	orgTicksWanted(this: WordSmith) { return !!this.orgTicksDoor(); },

	// One repaint a tick, however many asks arrive in it. A TIMEOUT, NOT A
	// FRAME: an occluded Electron window throttles requestAnimationFrame
	// to nothing, and a writer with the window behind another app would
	// come back to a tree with no ticks.
	orgTicksSchedule(this: WordSmith) {
		if (this._ticksScheduled) return;
		this._ticksScheduled = true;
		window.setTimeout(() => { this._ticksScheduled = false; this.orgTicksRepaint(); }, 0);
	},

	// The rows of every explorer leaf, by path: `{ path, el, kind }`.
	orgTicksRows(this: WordSmith) {
		const out = [];
		for (const view of this.explorerViews()) {
			const items = view && view.fileItems;
			if (items && typeof items === 'object') {
				for (const path of Object.keys(items)) {
					if (path === '/' || path === '') continue;
					const it = items[path];
					const el = it && (it.selfEl || it.titleEl);
					if (!el) continue;
					const kind = (it.file && it.file.children) || (el.classList && el.classList.contains('nav-folder-title')) ? 'folder' : 'file';
					out.push({ path, el, kind });
				}
				continue;
			}
			// The fallback: the rows as drawn.
			const root = view && view.containerEl;
			if (!root || root.nodeType !== 1) continue;
			for (const el of Array.from(root.querySelectorAll('.nav-file-title[data-path], .nav-folder-title[data-path]'))) {
				const path = el.getAttribute('data-path');
				if (!path || path === '/') continue;
				out.push({ path, el, kind: el.classList.contains('nav-folder-title') ? 'folder' : 'file' });
			}
		}
		return out;
	},

	orgTicksRepaint(this: WordSmith) {
		// THE TREE IN THE BOOK'S ORDER WHILE EXPORT SHOWS (A873): asked here because this runs as Export opens, closes,
		// or goes behind another tab; the sort applied or taken off when the answer moves
		const sortWant = this.explorerSortWanted();
		if (sortWant !== this._explorerSortWas) {
			this._explorerSortWas = sortWant;
			try { this.patchExplorerSort(); } catch (_) { wsCatch('orgTicksRepaint: this.patchExplorerSort();', _); }
		}
		const door = this.orgTicksDoor();
		if (!door) { this.orgTicksClear(); return 0; }
		let n = 0;
		for (const row of this.orgTicksRows()) {
			try {
				if (row.kind === 'file' && !/\.md$/i.test(row.path)) continue;
				let box = row.el.querySelector(':scope > .ws-treetick') as HTMLInputElement | null;
				if (!box) {
					box = createEl('input');
					box.type = 'checkbox';
					box.className = 'ws-treetick ws-uni-check';
					box.draggable = false;
					box.addEventListener('mousedown', (ev: Event) => ev.stopPropagation());
					box.addEventListener('click', (ev: Event) => ev.stopPropagation());
					box.addEventListener('change', (ev: Event) => {
						ev.stopPropagation();
						const d = this.orgTicksDoor();
						try { if (d) d.ticks.toggle(row.path, row.kind); }
						catch (e) { wsGuardReport('the tree ticking a row for Export', e); }
						this.orgTicksSchedule();
					});
					// RIGHT AFTER THE CHEVRON, before everything else on the row — our own
					// folder icon included. A note row has no chevron, so the box is its
					// first thing.
					const chev = row.el.querySelector(':scope > .tree-item-icon, :scope > .collapse-icon');
					if (chev && chev.nextSibling) row.el.insertBefore(box, chev.nextSibling);
					else if (chev) row.el.appendChild(box);
					else row.el.insertBefore(box, row.el.firstChild);
				}
				const st = door.ticks.state(row.path, row.kind);
				// A ROW OUTSIDE THE EXPORT IS NOT DEAD: its box is empty and live, and
				// a tick brings the row in.
				const dead = !st || !st.mine;
				box.disabled = false;
				box.title = dead ? wsT('Nothing here goes into an export') : '';
				box.checked = !dead && st.all;
				box.indeterminate = !dead && st.some;
				box.classList.toggle('is-part', !dead && st.some);
				n++;
			} catch (e) { wsGuardReport('the tree painting an Export tick', e); }
		}
		return n;
	},

	// BY THE SAME ROWS THE PAINT WALKS, not by a document query alone: the
	// explorer keeps a row for every path, and the rows of a folder that is
	// shut are built and DETACHED — a box painted on one of those is not in
	// the document, so a query there left it, and the folder opened later
	// with its ticks on and no Export tab to answer for them.
	orgTicksClear(this: WordSmith) {
		for (const row of this.orgTicksRows()) {
			try { row.el.querySelectorAll(':scope > .ws-treetick').forEach((el) => el.remove()); }
			catch (_) { wsCatch('orgTicksClear: row.el.querySelectorAll(:scope > .ws-treetick)', _); }
		}
		try { document.querySelectorAll('.ws-treetick').forEach((el) => el.remove()); }
		catch (_) { wsCatch('orgTicksClear: document.querySelectorAll(.ws-treetick)', _); }
	},

	// ── THE RIGHT-CLICK ────────────────────────────────────────
	//
	// "Organizer here", "Export this", "History here" on a folder; the
	// first and last on a note. The tree's one way to choose the window's
	// folder since a click there stopped choosing (A892), and what a phone
	// gets as a long-press. A window already open is used and brought
	// forward; none open, the pane is opened. Either way the folder is
	// CHOSEN through the window's own door, so it persists.

	async orgOpenAt(this: WordSmith, path: string, tabId: string, opts?: { note?: string; only?: string[] }) {
		const p = (path == null || path === '/') ? '' : String(path);
		const o = opts || {};
		const id = tabId || 'organizer';
		let door = this.orgDoorFor(id);
		if (!door) {
			try { this._wsSession = this._wsSession || wsSessionNew(); } catch (_) { wsCatch('orgOpenAt: this._wsSession = this._wsSession || wsSessionNew();', _); }
			if (this._wsSession) this._wsSession.tab = id;
			try { await this.openOutlinerPane(id); } catch (e) { wsGuardReport('the tree opening the Organizer', e); }
			door = this.orgDoorFor(id);
			if (!door) return false;
		}
		try { if (door.tab() !== id && door.tabSet) door.tabSet(id); } catch (e) { wsGuardReport('the tree switching the Organizer’s tab', e); }
		if (o.only) {
			// The export's ticks, exactly these. The Organizer's folder is left
			// where it was: the export is the vault.
			try { if (door.ticksOnly) void door.ticksOnly(o.only); } catch (e) { wsGuardReport('the tree ticking what to export', e); }
		} else {
			this.orgTreeSelect(p);
			if (o.note) this.orgTreeFollow(o.note, true);
		}
		this.orgReveal(door);
		return true;
	},

	// A pane host is brought forward; a modal is already in front.
	orgReveal(this: WordSmith, door: { host: () => WsHost | null }) {
		try {
			const host = door && door.host && door.host();
			const h = host && host.handle && host.handle();
			const leaf = h && 'leaf' in h ? h.leaf : null;
			if (leaf && this.app.workspace.revealLeaf) void this.app.workspace.revealLeaf(leaf);
		} catch (e) { wsGuardReport('the tree bringing the Organizer forward', e); }
	},

	// The rows for one file or folder. Called from fileMenuFor.
	fileMenuOrganizerRows(this: WordSmith, menu: Menu, file: WsFileLike) {
		if (!file || !file.path) return;
		const isFolder = !!file.children;
		const path = String(file.path);
		const here = isFolder ? path : (path.lastIndexOf('/') > 0 ? path.slice(0, path.lastIndexOf('/')) : '');
		const note = isFolder ? null : path;
		const row = (title: string, icon: string, tabId: string) => {
			menu.addItem((i) => {
				i.setTitle(title);
				try { if (i.setIcon) i.setIcon(icon); } catch (_) { wsCatch('fileMenuOrganizerRows: if (i.setIcon) i.setIcon(icon);', _); }
				// MIRRORED WHERE THE MENU MIRRORS IT. Obsidian's MenuItem holds its
				// glyph in `iconEl`; the same class the bar menu stamps, so one rule
				// flips both — and only when the glyph that drew is the one the menu
				// flips, never a fallback.
				try {
					if (this.menuIconMirrored && this.menuIconMirrored(tabId) && i.iconEl
						&& i.iconEl.querySelector('svg')) i.iconEl.addClass('is-mirrored');
				} catch (_) { wsCatch('fileMenuOrganizerRows: i.iconEl.addClass(\'is-mirrored\');', _); }
				// "Export this" is a set of ticks, not a scope: the export is the
				// vault, and exactly this goes out.
				i.onClick(() => { void this.orgOpenAt(here, tabId, tabId === 'export' ? { note: note || undefined, only: [path] } : { note: note || undefined }); });
			});
		};
		row(wsT('Organizer here'), 'list-tree', 'organizer');
		// On notes too.
		row(wsT('Export this'), 'file-output', 'export');
		row(wsT('History here'), 'history', 'history');
	},

	// ── THE ONE WAY IN ───────────────────────────────────────────────
	//
	// The command, the menu row, the bar button, and the Export and History
	// openers all come here. A window already open is used — its tab
	// switched, a pane brought forward. None open, the pane is opened with
	// the session carrying the tab. The sheet is not a door; `modalHost()`
	// stays only as the fallback for a workspace with no leaf to give (an
	// old API, a stub), which the running app never is.
	//
	// THREE PANES: the door for a tab is a window ON that tab — a pane
	// built for it, or a window that can switch to it. None: that tab's own
	// pane is opened.
	orgDoorFor(this: WordSmith, tabId: string) {
		const doors = this.orgWindows();
		for (const d of doors) { try { if (d.tab() === tabId) return d; } catch (_) { wsCatch('orgDoorFor: d.tab()', _); } }
		for (const d of doors) { try { if (!(d.single && d.single())) return d; } catch (_) { wsCatch('orgDoorFor: d.single()', _); } }
		return null;
	},

	async orgOpenTab(this: WordSmith, tabId: string) {
		const id = tabId || 'organizer';
		const door = this.orgDoorFor(id);
		if (door) {
			try { if (door.tab() !== id && door.tabSet) door.tabSet(id); } catch (e) { wsGuardReport('switching the Organizer’s tab', e); }
			this.orgReveal(door);
			return door;
		}
		try { this._wsSession = this._wsSession || wsSessionNew(); } catch (_) { wsCatch('orgOpenTab: this._wsSession = this._wsSession || wsSessionNew();', _); }
		if (this._wsSession) this._wsSession.tab = id;
		let leaf = null;
		try { leaf = await this.openOutlinerPane(id); } catch (e) { wsGuardReport('opening the Organizer', e); leaf = null; }
		if (leaf) return leaf;
		return this.openManuscriptModal({ tab: id });
	},

	// Several rows selected in Obsidian's tree: "Export these" when two or
	// more of them are folders.
	filesMenuFor(this: WordSmith, menu: Menu, files: TAbstractFile[]) {
		// Folders and notes alike: what is chosen is what is ticked.
		const paths = (files || []).filter((f: TAbstractFile) => f && f.path && f.path !== '/').map((f: TAbstractFile) => f.path);
		if (paths.length < 2) return;
		menu.addItem((i: { setTitle: (arg0: string) => void; setIcon: (arg0: string) => void; onClick: (arg0: () => void) => void; }) => {
			i.setTitle(wsT('Export these'));
			try { if (i.setIcon) i.setIcon('file-output'); } catch (_) { wsCatch('filesMenuFor: if (i.setIcon) i.setIcon(file-output);', _); }
			i.onClick(() => { void this.orgOpenAt('', 'export', { only: paths }); });
		});
	},

	// A folder chosen from Obsidian's tree, by its right-click. '' and '/' are the whole vault.
	orgTreeSelect(this: WordSmith, path: string) {
		const p = (path == null || path === '/') ? '' : String(path);
		let n = 0;
		for (const w of this.orgWindows()) {
			try { w.select(p); n++; }
			catch (e) { wsGuardReport('the file tree choosing a folder for the Organizer', e); }
		}
		return n;
	},

	// The note you opened: marked by a door that shows it, no door moved
	// (A892). `chosen`, the tree's right-click on a note: followed.
	orgTreeFollow(this: WordSmith, path: string, chosen?: boolean) {
		if (!path) return 0;
		let n = 0;
		for (const w of this.orgWindows()) {
			try { w.follow(String(path), chosen); n++; }
			catch (e) { wsGuardReport('the Organizer following the note you opened', e); }
		}
		return n;
	},

	// ── A HOST BACKED BY A LEAF ─────────────────────────────────────────────
	//
	// The other half of the seam in `modalHost`. Same seven things,
	// answered by a pane instead of a sheet — so the window does not learn
	// a second shape.
	//
	// THREE OF THE SEVEN DIFFER, and each difference is the point:
	//
	// `key`   a modal has a `scope`; a view has none. The keys are a
	// listener on the view's OWN element, which means they only
	// fire while focus is inside it — so the Organizer's arrows
	// cannot move the cursor in a note the writer is typing in.
	// A modal never had that problem because it took the whole
	// application; a pane sits beside something live.
	//
	// `show`  nothing. The leaf is already on screen — Obsidian put it
	// there, and a pane that "opened" itself would fight the
	// workspace it lives in.
	//
	// `closes` FALSE. See the Escape ladder: its bottom rung hands the key
	// back so the modal can close. A docked pane must not vanish
	// when a writer presses Escape, so the rung stops at "nothing
	// left to back out of" and the press does nothing.
	leafHost(this: WordSmith, view: ItemView): WsHost {
		const teardowns: (() => void)[] = [];
		return {
			kind: 'leaf',
			view,
			rootEl: view.containerEl,
			contentEl: view.contentEl,
			closes: false,
			// ── A PANE IS NOT A SHEET, AND THE STYLESHEET HAS TO KNOW ────
			//
			// The root wears `ws-uni-modal` either way, because that class
			// carries everything this window LOOKS like — the bands, the
			// tabs, the panel, the heat ramp. What it also carries is the
			// SIZE of a modal: `88vw` wide and `82vh` tall, which inside a
			// leaf is a pane trying to be most of the screen regardless of
			// the space the workspace gave it.
			//
			// So a pane says so, and the two sizing rules stand down for it.
			// One extra class rather than splitting the shared look in two:
			// the size is the only thing a sheet and a pane disagree about.
			paneClass: 'ws-uni-pane',
			key: (mods: Modifier[], k: string, fn: KeymapEventListener) => {
				const want = Array.isArray(mods) ? mods : [];
				const handler = (ev: KeyboardEvent) => {
					if (ev.key !== k) return;
					// THE MODIFIERS ARE CHECKED BOTH WAYS. Matching only the ones asked
					// for lets Ctrl+ArrowDown run a plain ArrowDown binding — somebody
					// else's hotkey answered by ours — and a plain ArrowDown match the
					// Alt+ArrowDown NUDGE, so every arrow walked the cursor AND reordered
					// the book under it. A modal never had this: `modal.scope.register` is
					// Obsidian's own Scope and checks all four.
					const mod = ev.ctrlKey || ev.metaKey;
					if (mod !== (want.indexOf('Mod') !== -1)) return;
					if (ev.shiftKey !== (want.indexOf('Shift') !== -1)) return;
					if (ev.altKey !== (want.indexOf('Alt') !== -1)) return;
					if (fn(ev, { modifiers: '', key: k, vkey: k }) === false) ev.preventDefault();
				};
				view.containerEl.addEventListener('keydown', handler);
				teardowns.push(() => {
					try { view.containerEl.removeEventListener('keydown', handler); } catch (_) { wsCatch('leafHost / key: view.containerEl.removeEventListener(\'keydown\', handler);', _); }
				});
			},
			contains: (el: Node | null | undefined) => {
				try { return !!(el && view.containerEl && view.containerEl.contains(el)); }
				catch { return false; }
			},
			onClose: (fn: () => void) => { teardowns.push(fn); },
			// RUN BY THE VIEW when Obsidian takes the pane away. Everything
			// the window registered comes off, in the order it was added.
			teardown: () => { for (const t of teardowns) { try { t(); } catch (_) { wsCatch('leafHost: t();', _); } } },
			show: () => {},
			handle: () => view
		};
	},

	registerOutlinerPane(this: WordSmith) {
		if (!WsOutlinerView || this._outlinerPaneRegistered) return;
		try {
			// THREE VIEWS: Organizer, Export and History, each a pane of its own —
			// the same window built on one tab. Registered together, so a saved
			// workspace holding any of the three ids finds its view.
			for (const id of Object.keys(WS_PANE_VIEWS)) {
				const Cls = WS_PANE_CLASSES[id];
				if (Cls) this.registerView(WS_PANE_VIEWS[id], (leaf: WorkspaceLeaf) => new Cls(leaf, this));
			}
			this._outlinerPaneRegistered = true;
		} catch (_) { wsCatch('registerOutlinerPane: this.registerView(WS_OUTLINER_VIEW, (leaf) => new WsOutlinerView(leaf, …', _); }
	},

	outlinerPaneLeaves(this: WordSmith, tabId: string) {
		const type = WS_PANE_VIEWS[tabId || 'organizer'] || WS_OUTLINER_VIEW;
		try { return this.app.workspace.getLeavesOfType(type) || []; }
		catch { return []; }
	},

	// ONE PANE, REVEALED RATHER THAN STACKED. Asking twice used to be the way
	// to end up with two of a thing; a writer pressing the command again means
	// "show me the one I have".
	async openOutlinerPane(this: WordSmith, tabId?: string) {
		if (!WsOutlinerView) return null;
		const type = WS_PANE_VIEWS[tabId || 'organizer'] || WS_OUTLINER_VIEW;
		this.registerOutlinerPane();
		let leaf = this.outlinerPaneLeaves(tabId || 'organizer')[0];
		if (!leaf) {
			try {
				// THE MAIN AREA, not a sidebar. This is a working surface —
				// a tree, a band of readings and a panel — and a sidebar is
				// too narrow for it by default. A writer who wants it docked
				// can drag it there, or out into its own window, which is
				// the whole reason it is a leaf.
				// BESIDE A PANE OF OURS, AS A TAB: Export opened while an Organizer
				// pane stands should join its tab group, not carve a third vertical
				// split. With none of ours open, a split.
				const sibling = Object.keys(WS_PANE_VIEWS).map((t) => this.outlinerPaneLeaves(t)[0]).filter(Boolean)[0];
				const ws = this.app.workspace;
				if (sibling && sibling.parent && typeof ws.createLeafInParent === 'function') {
					leaf = ws.createLeafInParent(sibling.parent, (sibling.parent.children || []).length);
				} else {
					// A SPLIT, or the writer's new tab (#73)
					leaf = this.settings.paneOpenIn === 'tab' ? ws.getLeaf('tab') : ws.getLeaf('split', 'vertical');
				}
				if (leaf) await leaf.setViewState({ type, active: true });
			} catch { return null; }
		}
		try { void this.app.workspace.revealLeaf(leaf); } catch (_) { wsCatch('openOutlinerPane: this.app.workspace.revealLeaf(leaf);', _); }
		return leaf;
	},

	// ── AND OUT INTO ITS OWN OS WINDOW ─────────────────────────────
	//
	// IT BUILDS ON THE PANE rather than beside it. `openOutlinerPane`
	// already finds-or-makes the leaf and is the one writer of what that
	// leaf is; a second path that made its own would be a second answer to
	// "where does the Organizer live".
	//
	// BOTH API NAMES ARE TRIED AND CHECKED. `moveLeafToPopout` and
	// `openPopoutLeaf` both exist on 1.13.7, but neither is in the
	// published typings, so this must survive an Obsidian that has dropped
	// one. Failing back to the PANE is the honest failure: the writer asked
	// for a window and gets the thing a window is made of, still holding
	// their work.
	async openOutlinerPopout(this: WordSmith) {
		const leaf = await this.openOutlinerPane();
		if (!leaf) return null;
		const w = this.app.workspace;
		try {
			if (typeof w.moveLeafToPopout === 'function') {
				const out = w.moveLeafToPopout(leaf);
				// It returns the popout's WorkspaceWindow on some builds and
				// nothing on others; the leaf is what the caller wants back.
				void out;
				return leaf;
			}
		} catch (_) { wsCatch('openOutlinerPopout: if (typeof w.moveLeafToPopout === \'function\')', _); }
		try {
			if (typeof w.openPopoutLeaf === 'function') {
				const pl = w.openPopoutLeaf();
				if (pl) {
					await pl.setViewState({ type: WS_OUTLINER_VIEW, active: true });
					// THE ONE WE CAME FROM GOES. Otherwise the writer has the
					// Organizer twice - which is the fault every door in this
					// window is written to avoid.
					try { if (pl !== leaf) leaf.detach(); } catch (_) { wsCatch('openOutlinerPopout: if (pl !== leaf) leaf.detach();', _); }
					return pl;
				}
			}
		} catch (_) { wsCatch('openOutlinerPopout: if (typeof w.openPopoutLeaf === \'function\')', _); }
		return leaf;
	},
};
export type OrganizerWindowMethods = typeof organizerWindowMethods;
