// Word-Smith — preamble: the helpers, the constants, the views and the
// settings' defaults every other module reads.

import { FuzzySuggestModal, Menu, setIcon, Platform, ItemView, normalizePath, sanitizeHTMLToDom } from 'obsidian';
import type { App, FileStats, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { WordSmithSettings, WsMenuRowSpec, WsMenuPickItem, WsExportOpts, WsExportRun, WsExportSection, WsHost, WsVimApi } from './settings';
import type WordSmith from '../plugin/plugin';
import { wsT, wsTIn, wsNumIn } from './ui-text';
// THE SUBJECTS OUT OF THIS FILE (the writer's "Do all", 2026-10-22): the text engine, Export's page and the bar's themes
// are modules of their own beside it. Every name in them is still served from here, so no module that imports from
// preamble changed.
import { wsReplaceToLast } from './text-engine';
export * from './text-engine';
import { wsIsRtl } from './export-page';
export * from './export-page';
export * from './bar-themes';

// what the property pickers list: a key and its label, how many notes carry
// it and in how many spellings, or a row that would create it
export interface WsPropItem { label: string; key?: string; n?: number; spellings?: number; isNew?: boolean; type?: string; value?: string; tag?: string; [extra: string]: unknown }
import { ViewPlugin, Decoration, WidgetType, keymap, EditorView } from '@codemirror/view';
import { RangeSetBuilder, Prec } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import type { WsLensSort, WsLensChip } from '../organizer/organizer-lens';

// `Platform` is used only through isMobileApp(), which falls back to the
// body class: a stub of `obsidian` with a fixed list of exports hands
// anything new here as `undefined` rather than as a throw, and it must be
// treated as absent. `apiVersion` IS THE DOCUMENTED ONE: `app.appVersion`
// is undefined on 1.13.7.

// ── WHAT applyStyleProps MAY WRITE ON <body> ─────────────────────
//
// The complete lists, so that switching a feature off removes exactly what
// switching it on wrote, and so a test can hold styles.css to reading every
// one of them. A name added to applyStyleProps that is not here is written
// and never cleared.
export const STYLE_KINDS = ['text', 'highlight', 'line'];
export const STYLE_CLASSES = ['ws-para-single', 'ws-line-spacing', 'ws-line-hl', 'ws-line-ul', 'ws-dim-active']
	.concat(STYLE_KINDS.map((k) => 'ws-pos-' + k), STYLE_KINDS.map((k) => 'ws-ck-' + k));
export const STYLE_PROPS = ['--ws-line-measure', '--ws-line-spacing', '--ws-line-hl-color', '--ws-line-top-h', '--ws-line-bot-h', '--ws-line-ul-period', '--ws-line-ul-dash', '--ws-dim-opacity',
	'--ws-ck-hard-bg', '--ws-ck-veryhard-bg', '--ws-ck-short-bg', '--ws-ck-mid-bg', '--ws-mask-opacity', '--ws-para-indent']
	.concat(['noun', 'verb', 'adj', 'adv', 'conj', 'pron'].flatMap((k) => ['--ws-pos-' + k + '-color', '--ws-pos-' + k + '-bg']),
		['filler', 'passive', 'illusion', 'misused', 'pronoun', 'dialogue', 'repeat', 'cliche'].flatMap((k) => ['--ws-ck-' + k + '-color', '--ws-ck-' + k + '-bg']));

// THE USER AGENT, READ IN ONE PLACE. Two things need it and neither is OS
// detection: the INSTALLER version — the `obsidian/x.y.z` token, which is
// the only place Obsidian reports the installer (the app version is
// `apiVersion`; the two differ, and the installer is the part that freezes
// on enable when it is old) — and the diagnostics' engine line (Chromium
// and Electron versions, for a bug report). The plugin review's platform
// rule bans `navigator.userAgent` on sight because plugins sniff it for
// the OS; the OS is asked of `Platform` everywhere here.
export const wsUserAgent = () => {
	try { const nav = window.navigator; return nav ? String(nav.userAgent || '') : ''; }
	catch { return ''; }
};

// Path picker for the scope list. Defined conditionally because `class X
// extends undefined` throws at definition time, and FuzzySuggestModal is not
// present on very old API versions — there the Add buttons simply hide.
export const WsPathSuggestModal = FuzzySuggestModal ? class extends FuzzySuggestModal<string> {
	_items: string[];
	_onPick: (item: string) => void;
	constructor(app: App, items: string[], placeholder: string, onPick: (item: string) => void) {
		super(app);
		this._items = items;
		this._onPick = onPick;
		if (this.setPlaceholder) this.setPlaceholder(placeholder);
	}
	getItems() { return this._items; }
	getItemText(item: string) { return item; }
	onChooseItem(item: string) { this._onPick(item); }
} : null;

// ── AND A PICKER FOR THE WRITER'S OWN PROPERTY KEYS ─────────────────────────
//
// A fuzzy modal has a search box, no cap, and is the control Obsidian uses
// everywhere else a writer picks one thing out of many; a menu capped at
// twenty rows does not offer the twenty-first at all. SAME CONDITIONAL
// SHAPE as the path picker above, and for the same reason: `class X
// extends undefined` throws at DEFINITION time, so on an API without
// `FuzzySuggestModal` this must be null rather than absent — and the
// caller falls back to the menu, which still works.
//
// The item is the key; everything else in the line is a reason to pick it
// — how many notes carry it, and whether it is spelled more than one way.
export const WsPropSuggestModal = FuzzySuggestModal ? class extends FuzzySuggestModal<WsPropItem> {
	_items: WsPropItem[];
	_onPick: (item: WsPropItem) => void;
	_newLabel: string;
	_taken: WsPropItem[];
	// TWO CALLERS, TWO QUESTIONS. The columns picker asks "which property
	// should become a column?" over `propKeysInScope`, whose items carry a
	// note count and a spelling count; another caller asks over
	// `orgKnownProps`, which is NAMES ONLY. So the placeholder is an
	// argument, and a missing `n` prints the label alone rather than the
	// string "undefined notes". Do NOT fake a count here to make the line
	// uniform: a number nobody counted is worse than a line without one.
	constructor(app: App, items: WsPropItem[], onPick: (item: WsPropItem) => void, placeholder: string | null, newLabel?: string, taken?: WsPropItem[]) {
		super(app);
		this._items = items;
		this._onPick = onPick;
		// ── AND A WAY TO NAME ONE THAT DOES NOT EXIST YET ────────────
		//
		// OPTIONAL, because the two callers ask different questions. Pass a
		// label with `%s` in it and the list grows a create row; pass nothing
		// and this is the search it always was. A picker that refuses a vault
		// with no properties is no door for the writer most in need of naming
		// one.
		this._newLabel = newLabel || '';
		// ── AND WHAT IT REFUSES IS NOT ALWAYS WHAT IT OFFERS ──
		//
		// THE NEW-PROPERTY DOOR OFFERS NOTHING TO PICK — picking an existing key
		// is the other button's job — but it must still refuse a name the vault
		// already uses, or it would offer to create a key `addProp` silently
		// drops. DEFAULTS TO THE ITEMS, so every existing caller is unchanged: a
		// picker that offers a key is a picker that refuses to re-create it.
		this._taken = taken || items;
		if (this.setPlaceholder) {
			this.setPlaceholder(placeholder
				|| wsT('Which property should become a column?'));
		}
	}
	// THE CREATE ROW NAMES WHAT IS BEING TYPED, which is the difference
	// between a door and a dead end — a static "New property…" cannot tell
	// a writer what it is about to make. `getItems()` is called by
	// FuzzySuggestModal on every keystroke, so reading `inputEl` here is
	// what makes the row live; there is no other hook that sees the query
	// without reimplementing the matcher.
	//
	// GUARDED. `inputEl` is SuggestModal's own field, but a build without
	// it must degrade to the plain search rather than throw inside a
	// keystroke handler.
	getItems() {
		if (!this._newLabel) return this._items;
		let q = '';
		try { q = String((this.inputEl && this.inputEl.value) || '').trim(); }
		catch { q = ''; }
		if (!q) return this._items;
		// NOT WHEN IT WOULD DUPLICATE. `addProp` silently refuses a key it
		// already has, so offering to create one beside the key it would
		// duplicate is a row that opens onto nothing.
		const lower = q.toLowerCase();
		// AGAINST `_taken`, WHICH IS THE ITEMS UNLESS A CALLER SAID
		// OTHERWISE — see the constructor. The offer list and the refuse
		// list are the same question for every door but the new-property
		// one, which offers nothing and still refuses everything taken.
		for (const it of this._taken) {
			if (String(it && it.label || '').toLowerCase() === lower) return this._items;
			if (String(it && it.key || '').toLowerCase() === lower) return this._items;
		}
		// LAST, so it never displaces a real key while typing narrows towards
		// one.
		return this._items.concat([{
			key: q, label: this._newLabel.replace('%s', q), isNew: true
		}]);
	}
	getItemText(item: WsPropItem) {
		if (typeof item.n !== 'number') return item.label;
		return item.label + '  ·  ' + (item.n === 1 ? wsT('{n} note', { n: item.n }) : wsT('{n} notes', { n: item.n }))
			+ ((item.spellings || 0) > 1 ? '  ·  ' + wsT('{n} spellings', { n: item.spellings || 0 }) : '');
	}
	onChooseItem(item: WsPropItem) { this._onPick(item); }
} : null;

// The four ways a menu separator can draw. Named in one place so the
// stylesheet's classes, the card's dropdown and the guard in
// menuRuleStyle() cannot drift apart.
// A separator's four looks, plus NONE — which still breaks the line and
// still holds its space, and simply draws no rule. A band of buttons often
// wants air above it rather than a hairline, and the alternative was a
// second kind of divider that did nothing.
export const MENU_RULE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'];

// How many cells one line of the menu may hold. Five is the ceiling
// because the sixth is unreadable at any modal width a palette should
// have — and a cap the writer meets while dragging is kinder than a
// menu that quietly becomes unusable.
export const MENU_MAX_COLS = 5;

// The shortest a letterbox mask may be. The arrows stand down under
// WS_ARROWS_MIN_PX rather than the mask growing to hold them: a mask can
// be thinner than its ornament; it just cannot carry it. WHAT 60 BUYS is
// CLEARANCE: the top mask's line sits at the mask's own height, and
// Obsidian's tab strip occupies roughly the first forty pixels of the
// window — lower and the line is BEHIND the app's own chrome, where no
// pointer can reach it however large its hit area is. If the chrome ever
// gets taller, this is the number that has to move.
export const WS_MASK_MIN_PX   = 60;
// The tallest a mask may be drawn, as a fraction of the window. Named
// here because TWO places need the same answer — the layout, which
// draws it, and the drag, which used to have no ceiling at all.
export const WS_MASK_MAX_FRAC = 0.45;
export const WS_ARROWS_MIN_PX = 34;
// The narrowest the arrow ROW may be. The horizontal inset was capped only
// at half the window less 20px, so it could squeeze the row to about forty
// pixels — narrower than the glyphs and the rule it carries, which then
// overlapped, wrapped and sat on top of each other. The inset is the
// writer's to set; how far it may go is the row's to decide.
export const WS_ARROWS_MIN_W  = 180;

// Which menu owns Escape. The handler is a capture listener on the
// document (see openBarMenu), so a menu opened over another — the ribbon
// pressed twice, say — would leave two listeners racing, and the OLDER
// one would win by being first in the list and stopping the event. The
// newest menu is the one on screen, so the newest listener is the one
// that answers; every other returns at once. A HOLDER, not a `let`: an
// importer cannot reassign a module export — and it is the DOCUMENT's,
// not the plugin's, because the listener list is.
export const WS_MENU_ESC: { owner: ((e: KeyboardEvent) => void) | null } = { owner: null };

// ── The docked menu ─────────────────────────────────────────────────────────
// The same rows as the pop-up, in a leaf: dockable under the file tree,
// stacked with the outline, remembered in the workspace layout, and — the
// point of it — reachable with the quick-cycle direction keys like any
// other pane.
//
// ONE COLUMN, AND NO FINDER, deliberately. A sidebar is narrow and tall:
// bands of five would be unreadable at 280px, and a search field is what
// the pop-up is FOR — summon it, type, gone. A panel you keep open is for
// reaching things by eye and by arrow, not for querying.
//
// Guarded like the other Obsidian classes here: `extends undefined`
// throws at definition time, and a stub of 'obsidian' may be bare.
export const WS_MENU_VIEW = 'word-smith-menu';
// The Outliner as a PANE. A vault asked for this window beside the writing —
// dragged out, docked to a side, or a tab — and a leaf is all three for free.
export const WS_OUTLINER_VIEW = 'word-smith-outliner';
// THREE PANES, NOT ONE WINDOW WITH THREE TABS. Export and History are
// views of their own; each pane is the same window built on ONE tab with
// its tab strip away, and Obsidian's tree drives all of them through the
// doors. `WS_OUTLINER_VIEW` keeps its id — saved workspaces hold it.
export const WS_EXPORT_VIEW = 'word-smith-export';
export const WS_HISTORY_VIEW = 'word-smith-history';
export const WS_PANE_VIEWS: Record<string, string> = { organizer: WS_OUTLINER_VIEW, export: WS_EXPORT_VIEW, history: WS_HISTORY_VIEW };
export const WS_PANE_NAMES: Record<string, string> = { organizer: 'Organizer', export: 'Export', history: 'History' };
export const WS_PANE_ICONS: Record<string, string> = { organizer: 'list-tree', export: 'file-output', history: 'history' };

// THE MARK, as an icon Obsidian can draw anywhere it draws icons — the
// leaf's tab, its header, the quick-switcher. A serif W: the ribbon wears
// the same letter as live text, but a view icon has to be a registered
// SVG path, and Lucide's `type` (a T) is a perfectly good icon for
// somebody else's plugin.
//
// A PATH rather than a font glyph, because this one is drawn by Obsidian
// into contexts we do not style — currentColor and a 100x100 viewBox are
// the contract. Traced as strokes so it keeps its serifs at 16px, where a
// hairline serif on a filled letterform disappears.
export const WS_ICON = 'word-smith-w';
// The ribbon button's title — ONE string, because Obsidian keys the
// ribbon entry on `<plugin id>:<title>` and the switch has to name the
// same entry to take it off.
// Whether an element is on screen, by Obsidian's own `isShown` where the
// element has it (a hidden tab, a collapsed sidebar); an element without
// it is taken as shown — a stub's elements, and a modal's.
export const wsElShown = (el: { isShown?: () => boolean } | null | undefined) => (!el || typeof el.isShown !== 'function') ? true : !!el.isShown();
// A PICKER ROW'S SWATCH, from one maker for the five places a row is drawn
// (the bar's popup, the menu's drawers, the finder's results in the pop-up and
// the pane): a ball, or the item's own shape. Only a row with a color has one.
// 'currentColor' asks for a swatch in the row's own ink, which is the sheet's
// default, so it is not written inline, and it fades with the row.
export function wsPickerSwatch(row: HTMLElement, item: WsMenuPickItem) {
	if (!item.color) return null;
	const dot = row.createSpan({ cls: 'ws-picker-dot' + (item.shape ? ' is-' + item.shape : '') });
	if (item.color !== 'currentColor') dot.style.backgroundColor = item.color;
	return dot;
}

export const WS_RIBBON_TITLE = 'Open the Word-Smith menu';
export const WS_ICON_SVG =
	'<g fill="none" stroke="currentColor" stroke-width="9" ' +
	'stroke-linecap="square" stroke-linejoin="miter">' +
	// The W itself: four strokes, the middle apex stopping short of the
	// cap line the way a serif W's does.
	'<path d="M18 26 L34 74 L50 38 L66 74 L82 26" />' +
	// Serifs: a bracket at each terminal, which is the whole difference
	// between this and a sans W at icon size.
	'<path d="M8 26 H28" /><path d="M72 26 H92" />' +
	'</g>';
// ── THE OUTLINER, AS A PANE ─────────────────────────────────────────────────
//
// Built by the same `openManuscriptModal` that builds the modal, through the
// host seam. There is ONE description of this window and two things it can
// live in — which is the whole reason the seam was cut before the view was
// written.
export const WsOutlinerView = ItemView ? class extends ItemView {
	// THE TYPE IS THE CLASS'S, NOT A FIELD'S. Obsidian stamps `data-type`
	// from `getViewType()` inside `super()`, before any field set after it
	// exists — a field-driven type stamps every pane "undefined". Export
	// and History are subclasses below, each answering its own type and tab.
	plugin: WordSmith;
	_built: boolean;
	host: WsHost;
	constructor(leaf: WorkspaceLeaf, plugin: WordSmith) { super(leaf); this.plugin = plugin; }
	paneTab()        { return 'organizer'; }
	getViewType()    { return WS_OUTLINER_VIEW; }
	// THE LEAF IS THE WHOLE WINDOW, so it is named for the window. ONLY THE
	// LABEL says Organizer: `WS_OUTLINER_VIEW` and every command id stay as
	// they are — those are written into saved workspaces and into hotkeys
	// the writer has set, and changing them drops a pane on the next restart.
	getDisplayText() { return wsT(WS_PANE_NAMES[this.paneTab()]); }
	getIcon()        { return WS_PANE_ICONS[this.paneTab()]; }

	async onOpen() {
		// WAITS FOR THE LAYOUT. A pane is RESTORED at startup from the saved
		// workspace, so `onOpen` can run before the vault index exists — and
		// this window reads every markdown file to build its tree. Without
		// this it would draw an empty tree once and never again, on exactly
		// the machines where a writer had left it open.
		//
		// `onLayoutReady` fires SYNCHRONOUSLY when the layout is already up,
		// so opening the pane by hand is not deferred a frame.
		this.plugin.app.workspace.onLayoutReady(() => {
			if (this._built) return;
			this._built = true;
			try { this.build(); } catch (_) { wsCatch('onOpen: this.build();', _); }
		});
	}

	build() {
		this.contentEl.empty();
		// FOCUSABLE, or the keys never arrive. `leafHost` binds them to this
		// element and a keydown only reaches an element that focus is inside.
		this.contentEl.setAttribute('tabindex', '-1');
		this.host = this.plugin.leafHost(this);
		// ONE TAB, NO STRIP: the pane is that tab and nothing else.
		this.plugin.openManuscriptModal({ host: this.host, tab: this.paneTab(), only: true });
	}

	async onClose() {
		// EVERYTHING THE WINDOW REGISTERED COMES OFF. The tree watcher, the
		// counter and the Escape ladder are all held by the host, and the
		// ladder is on `window` — a pane that forgot this would go on
		// swallowing Escape for the rest of the session on behalf of a pane
		// nobody can see.
		try { if (this.host && this.host.teardown) this.host.teardown(); } catch (_) { wsCatch('onClose: if (this.host) this.host.teardown();', _); }
		this.contentEl.empty();
	}
} : null;
// EXPORT AND HISTORY, EACH ITS OWN TYPE: the same window built on one
// tab; the class answers the type so Obsidian's `data-type` is right
// from the first paint.
export const WsExportView = WsOutlinerView ? class extends WsOutlinerView {
	paneTab()     { return 'export'; }
	getViewType() { return WS_EXPORT_VIEW; }
} : null;
export const WsHistoryView = WsOutlinerView ? class extends WsOutlinerView {
	paneTab()     { return 'history'; }
	getViewType() { return WS_HISTORY_VIEW; }
} : null;
export const WS_PANE_CLASSES: Record<string, typeof WsOutlinerView> = { organizer: WsOutlinerView, export: WsExportView, history: WsHistoryView };

export const WsMenuView = ItemView ? class extends ItemView {
	plugin: WordSmith;
	// the keyboard's row, the rows opened, the finder's text, the row being
	// dragged, and the document listeners the pane owns until it closes
	_at: number | null;
	_openSet: Set<string>;
	_q: string;
	_dragRow: string | null;
	_releasePanelPointer: (() => void) | null;
	constructor(leaf: WorkspaceLeaf, plugin: WordSmith) { super(leaf); this.plugin = plugin; }
	getViewType()    { return WS_MENU_VIEW; }
	getDisplayText() { return 'Word-Smith'; }
	// The plugin's own mark, registered at load — `type` is Lucide's T,
	// which is a perfectly good icon for somebody else's plugin.
	getIcon()        { return WS_ICON; }

	async onOpen() {
		this.render();
		// THE KEYBOARD. A leaf only answers while it has focus, so this
		// needs none of the pop-up's arbitration: no scope to fight over,
		// no vim gate, no letters standing in for arrows. The container is
		// focusable and the keys are its own — which is why quick-cycling
		// INTO the panel and then pressing down does what it looks like it
		// should.
		//
		// hjkl steer here unconditionally, unlike in the pop-up: there is
		// no field competing for them unless the finder itself has focus,
		// and that case is checked first.
		this.contentEl.setAttribute('tabindex', '-1');
		// While a press is in progress inside this panel, a redraw asked
		// for by anything else waits — see refreshMenuPanels. Registered
		// on the document rather than the container so a release outside
		// the panel still clears the flag; a stuck flag would freeze the
		// panel's live state for the rest of the session.
		this.contentEl.addEventListener('pointerdown', () => {
			this.plugin._panelPointerDown = true;
		});
		const release = () => {
			if (!this.plugin._panelPointerDown) return;
			this.plugin._panelPointerDown = false;
			if (!this.plugin._panelRefreshPending) return;
			this.plugin._panelRefreshPending = false;
			// AFTER THE CLICK, not on pointerup. `click` fires after
			// `pointerup`, so redrawing here replaced the element between
			// the two — which is the very bug this deferral was written to
			// fix, moved a few milliseconds later. A timeout of 0 puts the
			// redraw in the next task, by which time the click has been
			// delivered and the row has done what it was pressed to do.
			window.setTimeout(() => { if (!this.plugin._unloaded) this.plugin.refreshMenuPanelsNow(); }, 0);
		};
		document.addEventListener('pointerup', release, true);
		document.addEventListener('pointercancel', release, true);
		this._releasePanelPointer = release;
		this.contentEl.addEventListener('keydown', (e) => {
			const typing = this.contentEl.querySelector('.ws-menu-search')
				=== document.activeElement;
			const k = e.key;
			const vim = !typing && 'hjkl'.includes(k);
			if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'Escape'].includes(k)
				&& !vim) return;
			const rows = this.navItems();
			if (!rows.length) return;
			const step = (d: number) => {
				this._at = Math.max(0, Math.min((this._at || 0) + d, rows.length - 1));
				this.paint(true);
			};
			if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); step(1); return; }
			if (k === 'ArrowUp'   || k === 'k') { e.preventDefault(); step(-1); return; }
			if (k === 'Enter' || k === 'ArrowRight' || k === 'l') {
				e.preventDefault();
				const cur = rows[this._at || 0];
				if (cur) cur.click();
				return;
			}
			if (k === 'ArrowLeft' || k === 'h') {
				// Out of the row the selection is in, and no further: a
				// panel has nothing to back out TO, unlike a pop-up that
				// can close. Only THAT row closes — the others a writer
				// opened are none of this keystroke's business.
				e.preventDefault();
				const cur = rows[this._at || 0];
				const owner = cur && cur.closest && cur.closest('.ws-menu-item');
				const id = owner && owner.dataset ? owner.dataset.rowId : null;
				if (id && this._openSet.has(id)) { this._openSet.delete(id); this.render(); }
				return;
			}
			if (k === 'Escape') {
				e.preventDefault();
				if ((this._q || '').trim()) { this._q = ''; this.render(); return; }
				// Escape closes them all: it is the "put this away" key,
				// and putting one of five away is not what it means.
				if (this._openSet.size) { this._openSet.clear(); this.render(); }
			}
		});
	}
	async onClose() {
		// The document listeners are ours and outlive the leaf otherwise.
		try {
			if (this._releasePanelPointer) {
				document.removeEventListener('pointerup', this._releasePanelPointer, true);
				document.removeEventListener('pointercancel', this._releasePanelPointer, true);
			}
		} catch (_) { wsCatch('onClose: if (this._releasePanelPointer)', _); }
		try { this.plugin._panelPointerDown = false; } catch (_) { wsCatch('onClose: this.plugin._panelPointerDown = false;', _); }
		// ── AND THE SCHEME GOES BACK ON THE BODY ──────────────────
		//
		// A THEME PICKED FROM THIS MENU writes its variables onto `body` live,
		// so a menu that closes without handing them back leaves a half-painted
		// vault behind it — the pop-up's `onClose` calls exactly these two, and
		// the panel's has to as well.
		try {
			if (this.plugin.barThemeOnCssChange) this.plugin.barThemeOnCssChange();
			if (this.plugin.barThemeGuard) this.plugin.barThemeGuard();
		} catch (_) { wsCatch('onClose: if (this.plugin.barThemeOnCssChange) …', _); }
	}

	// THE PANEL KEEPS THE FOCUS IT WAS GIVEN. Every mode this panel toggles
	// is applied to the ACTIVE editor — the letterbox masks it, the
	// typewriter scrolls it, Hemingway locks its keys — and handing the
	// editor back after every toggle would throw a writer who quick-cycled
	// INTO the panel out of it by their own first keystroke. A pane you
	// cannot remain in is not a pane. So the toggle applies the plugin's
	// own state instead of moving the writer: `refresh` repaints from the
	// REMEMBERED note (activeMarkdownView). Alt+direction is how you leave,
	// the same as any other pane.
	returnFocus() {
		// `refresh()` is the plugin's own full apply pass — the same one
		// `saveSettings(true)` runs. Every picker item already saves, so
		// this is belt and braces for a row toggle that changes app state
		// without going through settings (light/dark), and it costs a
		// repaint nobody will see twice.
		try { if (this.plugin.refresh) this.plugin.refresh(); } catch (_) { wsCatch('returnFocus: if (this.plugin.refresh) this.plugin.refresh();', _); }
	}

	// WHAT CHANGED, WITHOUT REBUILDING WHAT DID NOT. A full render empties
	// the panel and draws it again, so an open drawer is destroyed and
	// recreated and its opening animation replays — a folder closing and
	// opening again under the pointer. A toggle changes what the rows SAY,
	// not what they ARE: the counts on the right, and which drawer items
	// read as on. Both are rewritten in place here.
	refreshStates() {
		const specs = this.plugin.menuRowSpecs();
		const label = (row: WsMenuRowSpec) => (typeof row.label === 'function' ? row.label() : row.label);
		for (const node of Array.from(this.contentEl.querySelectorAll('.ws-menu-item'))) {
			const id = node.dataset ? node.dataset.rowId : null;
			const row = specs.find(r => r.id === id);
			if (!row) continue;
			const el = node.querySelector('.ws-menu-row');
			if (!el) continue;
			const lab = el.querySelector('.ws-menu-label');
			if (lab) lab.textContent = label(row);
			// ── AND THE GLYPH, WHICH CAN ALSO BE A FUNCTION ──────────────
			//
			// The moon and the sun change places when the mode does; a refresh of
			// the label alone left the moon beside the word "Light" — a glyph
			// arguing with the word beside it is worse than no glyph at all.
			// REDRAWN ONLY WHERE THE ICON IS A FUNCTION: every other row's glyph
			// is a constant, and calling `setIcon` on all of them after every
			// toggle would wipe the hand-drawn flag marks, which are written into
			// the icon element rather than named in Obsidian's set.
			const icon = el.querySelector('.ws-menu-icon');
			if (icon && !icon.classList.contains('is-blank')) {
				// THROUGH `menuIconFor`, the resolver the DRAW uses. A
				// second copy of the lookup here is a second answer to
				// "what glyph is this row", and the two would disagree the
				// day either changed — the fault that left one menu with a
				// column the other had not got.
				const def = (this.plugin.menuFeatureDefs() || [])
					.filter(d => d.id === row.id)[0];
				if (def && typeof def.icon === 'function') {
					const want = this.plugin.menuIconFor(row.id);
					if (want) {
						icon.textContent = '';
						try { if (setIcon) setIcon(icon, want); } catch (_) { wsCatch('refreshStates: if (setIcon) setIcon(icon, want);', _); }
					}
				}
			}
			const state = el.querySelector('.ws-menu-state');
			if (row.items && state) {
				const its = row.items();
				if (row.count !== false) {
					const on = its.filter(i => (typeof i.on === 'function' ? i.on() : i.on)).length;
					state.textContent = on ? wsT('{n} on', { n: on }) : wsT('off');
				} else {
					const cur = its.find(i => (typeof i.on === 'function' ? i.on() : i.on));
					if (cur) state.textContent = cur.label;
				}
			}
			// The drawer's own rows, matched BY POSITION against the
			// picker's list: the two are drawn from the same call in the
			// same order, and a toggle changes what an item reports, never
			// how many there are.
			const subs = Array.from(node.querySelectorAll('.ws-menu-sub'));
			if (subs.length && row.items) {
				const its = row.items();
				subs.forEach((sub, i) => {
					const it = its[i];
					if (!it) return;
					const on = (typeof it.on === 'function' ? it.on() : it.on);
					sub.toggleClass('is-off', !on);
				});
			}
		}
		this.paint();
	}

	// The children of an open row, built into the tree's own container.
	// Called from render() and from the in-place toggle alike, so the two
	// cannot draw a drawer differently — which is exactly the drift that
	// made keeping this inline a bad idea once the toggle stopped
	// re-rendering.
	drawDrawer(node: HTMLDivElement, row: WsMenuRowSpec) {
		// NO `ws-menu-drawer` HERE. That class belongs to the pop-up, and
		// its rules — written for a centred, height-capped block floating
		// over a note — were landing on the panel and cancelling the very
		// geometry the tree supplies: `margin-inline: 0` overrode the
		// `margin-left` Obsidian uses to PLACE the indentation guide, which
		// is why the line kept sitting in the wrong column however the
		// numbers were adjusted. The panel's container is tree classes and
		// nothing else, plus a hook of its own for the opening animation.
		const box = node.createDiv({
			cls: 'tree-item-children nav-folder-children ws-panel-drawer is-opening'
		});
		// `is-opening` carries BOTH the growth animation and the clipping
		// it needs, and is dropped the moment the animation ends. The clip
		// cannot be permanent: a selected row paints to the pane's edge
		// (see the full-bleed rule), and a container that clips forever
		// would cut that bleed off at the drawer's own indent, leaving the
		// highlight stopping short of the edge the file tree reaches.
		const done = () => {
			box.removeClass('is-opening');
			box.removeEventListener('animationend', done);
		};
		box.addEventListener('animationend', done);
		// A build with animations off never fires animationend, so the
		// class would stick and clip for ever.
		window.setTimeout(done, 600);
		return this.fillDrawer(box, row);
	}

	// The rows inside a drawer. Split from drawDrawer so an opening and a
	// redraw share one body — the two differ only in whether they animate.
	fillDrawer(box: HTMLDivElement, row: WsMenuRowSpec) {
		for (const item of (row.items ? row.items() : [])) {
			const isOn = (typeof item.on === 'function' ? item.on() : item.on);
			const kid = box.createDiv({ cls: 'tree-item nav-file' });
			const sub = kid.createDiv({
				cls: 'tree-item-self is-clickable nav-file-title'
					+ ' ws-menu-sub ws-picker-row' + (isOn ? '' : ' is-off')
			});
			wsPickerSwatch(sub, item);
			if (item.icon) {
				const ic = item.icon();
				ic.classList.add('ws-picker-icon');
				sub.appendChild(ic);
			}
			const lab = sub.createSpan({ cls: 'ws-picker-label', text: item.label });
			if (item.font) lab.style.fontFamily = item.font;
			sub.addEventListener('click', () => { void (async () => {
				const idx = this.navItems().indexOf(sub);
				if (idx >= 0) this._at = idx;
				if (item.onClick) await item.onClick();
				// In place: a full render would tear this drawer down and
				// build it again, replaying its opening animation under
				// the pointer that just pressed it.
				this.refreshStates();
				// The mode was applied to the editor; give the editor back
				// so the writer can see it happen.
				this.returnFocus();
			})(); });
		}
		return box;
	}

	// Everything selectable on screen, in the order it is drawn — rows and
	// the items of an open drawer alike, because the writer walking down
	// with an arrow does not distinguish them.
	navItems() {
		return [...this.contentEl.querySelectorAll('.ws-menu-row, .ws-menu-sub')];
	}

	paint(scroll?: boolean) {
		const rows = this.navItems();
		rows.forEach((el, i) => el.toggleClass('is-active', i === (this._at || 0)));
		// SCROLL ONLY WHEN A KEY MOVED THE SELECTION. paint() runs after
		// every click and every redraw too, and the selection it scrolls to
		// is wherever the ARROWS last were — so clicking a row halfway down
		// the panel yanked the view back up to a selection the writer had
		// not touched. A key press knows it moved something; a click knows
		// where it was aimed. Only the first has any business scrolling.
		if (!scroll) return;
		const cur = rows[this._at || 0];
		if (cur && cur.scrollIntoView) {
			try { cur.scrollIntoView({ block: 'nearest' }); } catch (_) { wsCatch('paint: cur.scrollIntoView( block: \'nearest\' );', _); }
		}
	}

	render() {
		const plugin = this.plugin;
		const root = this.contentEl;
		root.empty();
		if (this._at == null) this._at = 0;
		// A SET, not one id. The file tree keeps every folder you opened
		// open; closing one because you opened another is a pop-up habit,
		// where space is short and only one thing can be the subject. A
		// pane has room, and a writer who opens Modes and Theme means to
		// see both.
		if (!this._openSet) this._openSet = new Set();
		root.addClass('ws-menu-panel');
		// The panel wears the menu's own classes, so one stylesheet
		// dresses both and a change to the pop-up cannot leave the panel
		// behind.
		// THE FINDER SITS ABOVE THE SCROLL, like the file tree's. In the
		// pop-up it is a layout entry and renders wherever its card was
		// dropped — but a pop-up does not scroll. A pane does, and a
		// finder that scrolls away with the rows is a finder you have to
		// go back up for; the tree's own sits in a header with the scroll
		// starting beneath it, full width.
		//
		// So the panel PINS it: still only present when the layout carries
		// the Search card, still removed when that card is shelved, but
		// always at the top. The card's position is a pop-up decision, and
		// this is the one place the two surfaces are allowed to differ.
		// THE FILE EXPLORER'S OWN CONTAINERS, not just its row classes. Every
		// remaining difference — row height, text colour, the scrollbar's
		// position, the guide lines, the search field's width — comes from
		// `nav-header` and `nav-files-container`. Wearing the containers means
		// the app supplies all of it.
		const header = root.createDiv({ cls: 'ws-menu-header nav-header' });
		const list = root.createDiv({
			cls: 'ws-menu-list nav-files-container node-insert-event'
		});
		// THE ROOT WRAPPER. Obsidian's explorer does not put its folders
		// straight into the scroller: they sit in a `mod-root` tree item
		// whose children container holds the whole tree. Several of the app's
		// rules are written against that SHAPE — the indentation guides among
		// them — so getting the classes right and the structure wrong is
		// where the last few pixels of difference kept coming from.
		const rootItem = list.createDiv({ cls: 'tree-item nav-folder mod-root' });
		const rows = rootItem.createDiv({ cls: 'tree-item-children nav-folder-children' });
		const specs = plugin.menuRowSpecs();
		const label = (row: WsMenuRowSpec) => (typeof row.label === 'function' ? row.label() : row.label);

		// THE FINDER sits WHERE THE LAYOUT PUTS IT, like every other entry,
		// and its value survives a re-render: the panel redraws on every click
		// and on every theme change, and a query that vanished when a mode
		// flipped would be worse than no finder at all.
		const q = (this._q || '').trim().toLowerCase();

		for (const id of plugin.menuVisibleLayout()) {
			if (id === 'search') {
				// Wrapped the way Obsidian wraps its own: the magnifying
				// glass is drawn by `search-input-container`, not by the
				// input — which is why a bare field looked like a text box
				// beside the file tree's search. In the HEADER, so the
				// scroll starts under it.
				// `nav-buttons-container` is the strip the tree's own header
				// controls sit in, and it carries the side margins that
				// make the field start and end where the tree's does.
				const bar = header.createDiv({ cls: 'nav-buttons-container' });
				// Built by `wsMenuSearchInto`, so the modal menu gets exactly this box
				// rather than a copy of it.
				const inp = wsMenuSearchInto(bar);
				inp.value = this._q || '';
				inp.addEventListener('input', () => {
					this._q = inp.value;
					this.render();
					// Focus and caret restored by hand: the panel rebuilds
					// its whole list on every keystroke, so the field the
					// writer is typing into is a NEW element each time.
					const next = this.contentEl.querySelector('.ws-menu-search') as HTMLInputElement | null;
					if (next) {
						try {
							next.focus();
							next.setSelectionRange(next.value.length, next.value.length);
						} catch (_) { wsCatch('render: next.focus();', _); }
					}
				});
				continue;
			}
			if (/^rule-\d+$/.test(id)) {
				rows.createDiv({ cls: 'ws-menu-rule is-' + plugin.menuRuleStyle(id) });
				continue;
			}
			if (q) continue;   // results are drawn below, in place of the rows
			const row: WsMenuRowSpec | null = specs.find(r => r.id === id)
				|| (plugin.menuIsCommand(id) && plugin.menuCommandFor(id) ? {
					id,
					label: plugin.menuAliasOf(id),
					full: plugin.menuCommandName(id),
					wide: true,
					run: () => {
						try { const cid = plugin.menuCommandId(id); if (cid) plugin.app.commands.executeCommandById(cid); }
						catch (_) { wsCatch('render / run: plugin.app.commands.executeCommandById(plugin.menuCommandId(id));', _); }
					}
				} : null);
			if (!row) continue;

			// OBSIDIAN'S OWN TREE MARKUP. Every attempt to MATCH the file
			// tree's metrics by hand — padding, chevron offset, guide
			// position — landed a few pixels out, because the tree is
			// built from `tree-item` / `tree-item-self` / `tree-item-inner`
			// and those carry indents, hover shapes and guide offsets that
			// no reimplementation gets right by measuring a screenshot.
			// Wearing the classes means the app supplies all of it, and a
			// theme that moves any of it moves the panel too.
			//
			// ONE COLUMN still: `is-wide` is a pop-up idea (centred footer
			// rows) and would centre half a sidebar.
			// `node`, not `item`: the drawer loop below binds `item` for each
			// picker entry, and naming the tree node the same thing would build the
			// container on whichever picker item happened to be in scope.
			const node = rows.createDiv({ cls: 'tree-item nav-folder ws-menu-item' });
			// The row's id on the element, so a keystroke standing on a
			// drawer item can find the row that owns it.
			try { node.dataset.rowId = row.id; } catch (_) { wsCatch('render: node.dataset.rowId = row.id;', _); }
			const el = node.createDiv({
				cls: 'tree-item-self is-clickable ws-menu-row'
					+ (row.items ? ' mod-collapsible nav-folder-title' : ' nav-file-title')
			});
			if (row.full) {
				el.setAttribute('title', row.full);
				el.setAttribute('aria-label', row.full);
			}
			// A CHEVRON on anything that opens, turned down when it is
			// open — the same affordance Obsidian's own file tree and
			// outline use, so a writer already knows what it means. Rows
			// that ACT rather than open get a spacer of the same width,
			// or every label in the panel would sit at a different
			// left edge.
			// OBSIDIAN'S OWN TRIANGLE, in Obsidian's own wrapper class, so
			// it is the same size and the same shape as the file tree's
			// rather than a › that resembles one. `collapse-icon` is what
			// the app styles; `is-collapsed` is how it says which way the
			// triangle points.
			// `tree-item-icon` is the box the tree reserves for the
			// triangle; `collapse-icon` is what draws and rotates it. Both,
			// or the label starts at a different place from the tree's.
			if (row.items) {
				const chev = el.createDiv({
					cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator'
						+ ' ws-menu-chev'
						+ (this._openSet.has(row.id) ? '' : ' is-collapsed')
				});
				try { if (setIcon) setIcon(chev, 'right-triangle'); } catch (_) { wsCatch('render: if (setIcon) setIcon(chev, \'right-triangle\');', _); }
			} else {
				el.createDiv({
					cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator'
						+ ' ws-menu-chev is-blank'
				});
			}
			// ── THE ROW'S OWN GLYPH ─────────────────────────────────────
			//
			// AFTER the chevron and before the name, which is where the file
			// explorer puts a folder's icon — so a writer's eye runs down one
			// column of shapes rather than two.
			//
			// A COMMAND ROW GETS ONE TOO, from Obsidian's own command icon
			// where it has declared one. A pane where the built-in rows carry
			// pictures and the writer's own rows do not says theirs are second
			// class, and they are the rows that writer chose.
			{
				// Through `menuDrawIcon`, the one writer of a menu row's glyph — the
				// modal's builder and this one draw the same thing. A pinned command
				// (`cmd:` + its id, never in `menuFeatureDefs`) wears the command-palette
				// glyph as a fallback there; do not add a defs entry per command — the
				// ids are the writer's and unbounded.
				plugin.menuDrawIcon(el, row.id);
			}
			el.createDiv({
				cls: 'tree-item-inner nav-folder-title-content ws-menu-label',
				text: label(row)
			});
			if (row.items && row.count !== false) {
				const its = row.items();
				const on = its.filter(i => (typeof i.on === 'function' ? i.on() : i.on)).length;
				el.createSpan({ cls: 'ws-menu-state', text: on ? wsT('{n} on', { n: on }) : wsT('off') });
			} else if (row.items) {
				const cur = row.items().find(i => (typeof i.on === 'function' ? i.on() : i.on));
				if (cur) el.createSpan({ cls: 'ws-menu-state', text: cur.label });
			}
			// ── DRAGGED INTO ORDER, IN THE PANE ITSELF ──────────────────
			//
			// The order was arrangeable only in Settings → Menu, on a board of
			// cards. That is the right place to design a layout and the wrong
			// place to fix one: a writer who finds Font two rows lower than
			// they want it is LOOKING at the pane, and being sent to a
			// settings tab to move it means they will not.
			//
			// `menuMove` is the settings board's own function. Two ways to
			// reorder that wrote the order differently would drift the first
			// time either changed — and the order is a list of ids, so the
			// same call serves a card and a row.
			//
			// AN INSERTION POINT, not a swap: dropping on the upper half of a
			// row means before it and the lower half means after, which is how
			// every list in this plugin and in Obsidian reads a drop. A swap
			// would send the row you aimed at somewhere you did not.
			el.setAttribute('draggable', 'true');
			el.addEventListener('dragstart', (ev) => {
				this._dragRow = row.id;
				el.addClass('is-dragging');
				try { if (ev.dataTransfer) ev.dataTransfer.setData('text/plain', row.id); } catch (_) { wsCatch('render: ev.dataTransfer.setData(\'text/plain\', row.id);', _); }
			});
			el.addEventListener('dragend', () => {
				this._dragRow = null;
				el.removeClass('is-dragging');
				for (const n of Array.from(rows.querySelectorAll('.ws-menu-row'))) {
					n.removeClass('is-drop-above'); n.removeClass('is-drop-below');
				}
			});
			el.addEventListener('dragover', (ev) => {
				if (!this._dragRow || this._dragRow === row.id) return;
				ev.preventDefault();
				let above = true;
				try {
					const r = el.getBoundingClientRect();
					above = (ev.clientY - r.top) < r.height / 2;
				} catch (_) { wsCatch('render: const r = el.getBoundingClientRect();', _); }
				el.toggleClass('is-drop-above', above);
				el.toggleClass('is-drop-below', !above);
			});
			el.addEventListener('dragleave', () => {
				el.removeClass('is-drop-above'); el.removeClass('is-drop-below');
			});
			el.addEventListener('drop', (ev) => { void (async () => {
				ev.preventDefault();
				const moved = this._dragRow;
				this._dragRow = null;
				const above = el.classList.contains('is-drop-above');
				el.removeClass('is-drop-above'); el.removeClass('is-drop-below');
				if (!moved || moved === row.id) return;
				// THE INDEX IS TAKEN FROM THE FULL LAYOUT, not from the rows on
				// screen: hidden entries still hold their places in the order,
				// and dropping between two visible rows must not shuffle the
				// invisible one that sits between them.
				const ids = plugin.menuLayout().filter(x => x !== moved);
				const at = ids.indexOf(row.id);
				plugin.menuMove(moved, at + (above ? 0 : 1));
				await plugin.saveSettings();
				this.render();
			})(); });

			el.addEventListener('click', () => { void (async () => {
				// The selection follows the pointer, so the next arrow
				// press continues from where the writer is looking rather
				// than from wherever the keyboard was left.
				const idx = this.navItems().indexOf(el);
				if (idx >= 0) this._at = idx;
				if (row.toggle) { row.toggle(); this.refreshStates(); this.returnFocus(); return; }
				if (row.run)    { void row.run(); return; }
				// OPENED IN PLACE, not by re-rendering. A CSS transition
				// needs the SAME element to change state — and a full
				// render replaces the chevron with a fresh one, which has
				// no previous rotation to animate from. That is why the
				// panel's triangles snapped while the file tree's beside
				// them turned.
				//
				// So the class is toggled on the chevron that is already
				// on screen, and the children container is added or
				// removed beneath it. Everything else the row draws is
				// left alone, which is also why the row does not flicker.
				// Opening one row no longer closes another: every folder a
				// writer opens stays open, exactly as the tree's do.
				const opening = !this._openSet.has(row.id);
				if (opening) this._openSet.add(row.id);
				else this._openSet.delete(row.id);
				const chev = el.querySelector('.ws-menu-chev');
				if (chev) {
					if (opening) chev.removeClass('is-collapsed');
					else chev.addClass('is-collapsed');
				}
				if (opening) {
					node.addClass('is-open');
					this.drawDrawer(node, row);
				} else {
					node.removeClass('is-open');
					const kids = node.querySelector('.tree-item-children');
					if (kids) kids.remove();
				}
				this.paint();
			})(); });

			if (this._openSet.has(row.id) && row.items) {
				node.addClass('is-open');
				this.drawDrawer(node, row);
			}
		}

		// RESULTS, when a query is typed: rows and their items at once,
		// each naming the row it came from — the same rule the pop-up
		// keeps, so a writer who learns one has learned the other.
		if (q) {
			const hits: ({ sc: number; kind: 'row'; row: WsMenuRowSpec; label: string } | { sc: number; kind: 'item'; item: WsMenuPickItem; from: string })[] = [];
			for (const id of plugin.menuVisibleLayout()) {
				const row = specs.find(r => r.id === id);
				if (!row) continue;
				const lab = label(row);
				if (row.run || row.toggle) {
					const sc = Math.max(barMenuFuzzy(q, lab),
						row.keywords ? barMenuFuzzy(q, row.keywords) - 1 : -1);
					if (sc >= 0) hits.push({ sc, kind: 'row', row, label: lab });
				}
				if (!row.items) continue;
				for (const item of row.items()) {
					const sc = Math.max(barMenuFuzzy(q, item.label),
						barMenuFuzzy(q, lab + ' ' + item.label) - 2);
					if (sc >= 0) hits.push({ sc, kind: 'item', item, from: lab });
				}
			}
			hits.sort((a, b) => b.sc - a.sc);
			for (const h of hits.slice(0, 12)) {
				const isOn = h.kind === 'item'
					&& (typeof h.item.on === 'function' ? h.item.on() : h.item.on);
				const sub = list.createDiv({
					cls: 'ws-menu-sub ws-picker-row ws-menu-result'
						+ (h.kind === 'item' && !isOn ? ' is-off' : '')
				});
				if (h.kind === 'item') wsPickerSwatch(sub, h.item);
				sub.createSpan({ cls: 'ws-picker-label',
					text: h.kind === 'row' ? h.label : h.item.label });
				if (h.kind === 'item') sub.createSpan({ cls: 'ws-menu-in', text: h.from });
				sub.addEventListener('click', () => { void (async () => {
					if (h.kind === 'item') {
						if (h.item.onClick) await h.item.onClick();
						this.render();
						this.returnFocus();
						return;
					}
					if (h.row.toggle) { h.row.toggle(); this.render(); this.returnFocus(); return; }
					if (h.row.run) void h.row.run();
				})(); });
			}
			if (!hits.length) list.createDiv({ cls: 'ws-menu-empty', text: wsT('Nothing matches') });
		}

		// The selection survives the redraw, clamped to what is left: a
		// row that opened a drawer has more below it than it did, and a
		// query has fewer.
		const n = this.navItems().length;
		if (n) this._at = Math.max(0, Math.min(this._at, n - 1));
		this.paint();
	}
} : null;

// Obsidian resolves `@codemirror/*` for a plugin at run time and esbuild
// leaves them external. Decorations registered through
// registerEditorExtension render inside CM6's own pipeline, which is the
// only glitch-free way to do per-line styling — any MutationObserver /
// direct-DOM approach races the editor's rendering and flickers. NULL
// WHERE THEY DID NOT ANSWER: a page that stubs the packages gets `{}`,
// and the `if (!CM)` guards below turn the editor features off, nothing
// else.
export const CM = typeof ViewPlugin === 'function'
	? { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, keymap, EditorView, Prec, isolateHistory }
	: null;

// ─────────────────────────────────────────────────────────────────────────────
// Arrow style presets
// ─────────────────────────────────────────────────────────────────────────────

export const ARROW_STYLES: Record<string, { top: string; bottom: string }> = {
	'solid-triangle':   { top: '▲', bottom: '▼' },
	'outline-triangle': { top: '△', bottom: '▽' },
	'standard-arrow':   { top: '↑', bottom: '↓' },
	'chevron':          { top: '∧', bottom: '∨' },
	'double-chevron':   { top: '⇑', bottom: '⇓' },
	'custom':           { top: '',   bottom: ''  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Prose analysis — lexicon, tagger, detectors
//
// Everything here is deliberately dependency-free. A real POS tagger
// (compromise, wink, natural) is 200KB–2MB and would dwarf the plugin; this
// is a lexicon + suffix + context tagger in the Brill tradition, which gets
// roughly 90% of ordinary English prose right. That is the correct accuracy
// target for a *writing aid*: the highlighting is a nudge to look at a
// sentence, not a grammatical assertion, and a wrong colour costs the writer
// a glance. Anything that needs to be exact (word counts, goals) is computed
// elsewhere and never goes through here.
//
// Tags used internally:
//   DET PRON PREP CONJ AUX MOD ADV ADJ NOUN VERB NUM TO
// which collapse to five highlight classes (noun / verb / adj / adv / conj)
// mirroring syntax colouring.
// ─────────────────────────────────────────────────────────────────────────────

export const POS_LEX: Record<string, string> = Object.create(null) as Record<string, string>;
(function buildLexicon() {
	const add = (tag: string, words: string) => {
		for (const w of words.split(/\s+/)) if (w) POS_LEX[w] = tag;
	};

	add('DET', `a an the this that these those my your his her its our their
		some any each every no another both either neither all much many few
		little several enough such which whose what`);

	add('PRON', `i me you he him she it we us they them mine yours hers ours
		theirs myself yourself himself herself itself ourselves yourselves
		themselves who whom someone somebody something anyone anybody anything
		everyone everybody everything nobody nothing none one`);

	add('PREP', `of in for with on at by from about into over under above
		across against along among amid around before behind below beneath
		beside besides between beyond despite during except inside near off
		onto outside past since through throughout till toward towards
		underneath until unto upon within without via per unlike like`);

	add('CONJ', `as and but or nor yet so because although though while whereas
		unless if when whenever where wherever whereby wherein whereupon whether than plus versus`);

	add('AUX', `am is are was were be been being have has had having do does
		did doing`);

	add('MOD', `will would shall should can could may might must ought cannot`);

	add('TO', 'to');

	// 'one' stays a pronoun; the rest count things. NUM has no highlight
	// bucket, so numbers stay uncoloured — which is itself the point:
	// they stop being mistaken for nouns and verbs around them.
	add('NUM', `two three four five six seven eight nine ten eleven twelve
		thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty
		thirty forty fifty sixty seventy eighty ninety hundred thousand
		million billion dozen`);

	// Adverbs that do not end in -ly, plus the discourse connectives.
	add('ADV', `not never always often sometimes usually rarely seldom very
		quite rather too also just only even still already soon now then here
		there again once twice far away back together apart forward ahead
		almost nearly hardly barely scarcely somewhat somehow perhaps maybe
		indeed instead however therefore thus moreover nevertheless nonetheless
		anyway otherwise meanwhile furthermore hence why how well today
		tomorrow yesterday tonight later earlier ever else rather forth aside
		abroad anymore altogether upward downward inward outward up down out`);

	// Interjections take no highlight at all — "Oh dear!" is neither a
	// noun nor anything else worth a colour.
	add('INTJ', `oh ah aha alas hey hello ha hmm hush wow oops ouch yay
		hurrah phew ugh er um nay yea aye`);

	add('ADJ', `worth dear good bad big small large little old new young long short high
		low great same different other own able early late main major minor
		real true false whole full empty free hard easy simple complex clear
		dark light heavy soft loud quiet strong weak rich poor deep shallow
		wide narrow thick thin clean dirty warm cool hot cold dry wet sharp
		dull fast slow safe next last first second third final total certain
		sure possible likely necessary important common general specific
		particular single double sorry ready open close public private local
		national international social political economic human natural best
		better worse worst less least more most difficult strange quick slight
		direct exact vast brief sudden silent distant ancient modern current
		recent obvious similar familiar popular regular various serious
		previous senior junior chief prime sole mere utter sheer stark plain
		vague subtle blunt harsh calm tense tight loose smooth rough steep
		flat round square straight curved hollow solid dense sparse lengthy
		tidy messy odd fine keen bold quiet sweet bitter sour tough gentle
		fierce eager weary alive alone aware alike`);

	// THE COMMON ADJECTIVES (A674): a word the lexicon does not know is a noun
	// unless its shape or its neighbours say otherwise, and a bare predicate
	// ("am fond of", "is cruel to") or a color has neither. These are general
	// English, the colors, the feelings and the plain qualities, not a list of
	// the held-out set's misses.
	add('ADJ', `red green blue yellow black white brown grey gray pink purple
		orange golden silver pale bright dim vivid
		happy sad glad angry afraid proud ashamed jealous anxious nervous
		fond cruel kind unkind polite rude honest wise foolish clever stupid
		brave cowardly lazy busy tired sick ill healthy hungry thirsty
		pretty ugly beautiful handsome lovely charming elegant
		wrong right correct proper fair unfair equal due
		cheap expensive valuable precious rare frequent constant usual
		normal curious weird unusual typical ordinary
		huge tiny enormous immense massive slim slender broad
		fresh stale raw ripe salty spicy mild bland
		silly solemn severe tender
		ample scarce abundant multiple numerous countless
		medieval worldwide global rural urban royal holy sacred
		visible invisible hidden secret
		crowded noisy peaceful violent
		wild tame savage innocent guilty
		alert asleep awake dead`);

	// Common nouns that suffix rules would otherwise mis-tag.
	add('NOUN', `time way people man woman men women child children day year
		work place case point group number world life hand eye head word thing
		name home room door house water fire air book story line page thought
		idea money family friend school city country state night morning
		evening week month hour minute moment reason question answer problem
		sense mind heart voice face body kind sort part end side form order
		matter fact view level rate area field course result effect chance
		change president student
		resident agent parent patient client moment accident incident
		continent talent tenant servant assistant consultant restaurant
		elephant infant merchant giant opponent component ingredient
		event government department apartment argument statement movement
		environment equipment treatment agreement`);

	// THE SUFFIX RULES' NOUNS (A674): an -ory, -ary, -ic, -ive, -ile or -ant ending
	// reads as an adjective ("history", "library", "music", "motive", "plant").
	add('NOUN', `history memory theory category factory territory victory inventory
		laboratory directory library dictionary salary summary secretary diary
		boundary anniversary music logic topic traffic clinic critic magic fabric
		archive detective motive incentive initiative perspective olive plant
		profile missile reptile textile exile`);

	// Base-form verbs. Many are also nouns (work, call, run, hold); context
	// rules below demote them to NOUN after a determiner or preposition.
	add('VERB', `go goes went gone going come comes came make makes made take
		takes took taken see sees saw seen know knows knew known think thinks
		say says said tell tells told give gives gave given find finds want
		wants need needs use uses try tries ask asks call calls feel feels felt
		seem seems leave leaves left keep keeps kept let lets begin begins
		began begun help helps show shows shown turn turns start starts run
		runs ran move moves live lives believe believes hold holds held bring
		brings brought happen happens write writes wrote written read stand
		stands stood hear hears heard mean means meant set sets meet meets met
		pay pays paid sit sits sat speak speaks spoke spoken lie lies lay lead
		leads led grow grows grew grown open opens win wins won offer offers
		remember remembers love loves consider considers appear appears buy
		buys bought wait waits serve serves die dies send sends build builds
		built stay stays fall falls fell cut cuts reach reaches remain remains
		put puts get gets got gotten become becomes became look looks 
		likes work works play plays walk walks talk talks check checks add adds
		note notes list lists click clicks press presses save saves load loads
		close closes choose chooses pick picks draw draws point points push
		pushes pull pulls carry carries follow follows lead include includes
		provide provides create creates allow allows report reports describe
		describes explain explains suggest suggests decide decides expect
		expects prefer prefers manage manages develop develops support
		supports require requires produce produces receive receives return
		returns continue continues change changes learn learns teach teaches
		spend spends watch watches listen listens forget forgets enjoy enjoys
		agree agrees accept accepts refuse refuses avoid avoids reduce reduces
		improve improves replace replaces remove removes apply applies`);

	// THE SUFFIX RULES' VERBS (A674): -ish, -ive, -ent, -ant, -ile, -like and -less
	// read as adjectives, and "they finish", "we arrive", "to publish" are verbs.
	add('VERB', `finish publish establish punish vanish polish cherish nourish
		flourish banish abolish demolish astonish diminish furnish accomplish
		distinguish extinguish arrive arrives survive survives achieve achieves
		deceive deceives perceive perceives derive derives thrive thrives strive
		strives deprive deprives revive revives drive drives dive dives invent
		invents prevent prevents resent resents repent consent grant grants smile
		smiles dislike dislikes bless blesses`);

	// Contracted auxiliaries and modals. The tokenizer keeps apostrophes,
	// so these arrive as single tokens and the plain forms above never
	// match them — without these, "don't" and "i'm" fell through to the
	// suffix rules and tagged as nouns, which broke every context rule
	// keyed on a neighbouring AUX.
	add('AUX', `don't doesn't didn't isn't aren't wasn't weren't hasn't
		haven't hadn't i'm you're we're they're he's she's it's that's
		there's what's here's who's let's i've you've we've they've it'll
		that'll i'll you'll he'll she'll we'll they'll i'd you'd he'd she'd
		we'd they'd`);

	add('MOD', `can't won't wouldn't shouldn't couldn't mustn't needn't
		oughtn't`);
})();

// -ly words that are adjectives (or otherwise not the manner adverbs a
// writer is being asked to reconsider). Without this list "family",
// "reply" and "supply" all light up as adverbs.
export const LY_NOT_ADVERB = new Set(`only family reply apply supply imply comply
	multiply rely rally ally july italy holy ugly silly early likely lonely
	lovely friendly deadly costly orderly elderly monthly weekly daily yearly
	nightly hourly timely lively unlikely ghastly ghostly homely jolly folly
	bully belly sally tally melancholy anomaly assembly bristly burly chilly
	crumbly curly dolly gully hilly jelly kindly lolly manly measly oily
	prickly rally scaly smelly steely surly wobbly wooly worldly italy sicily
	assembly panoply monopoly`.split(/\s+/).filter(Boolean));

// ─────────────────────────────────────────────────────────────────────────────
// Export — a manuscript out of the vault
// ─────────────────────────────────────────────────────────────────────────────

// A .docx is a ZIP of small XML files, and Word accepts STORED
// (uncompressed) entries — so the whole container is a few hundred lines
// with no dependency and no build step, which is the only way it can
// also work on a phone. A library is ~500KB shipped to every writer
// whether they export or not.
//
// The CRC is the only fiddly part, and it is fiddly in a specific way:
// get it wrong and Word does not say "bad checksum", it says the file is
// corrupt and offers to recover it. So the table is standard and a test
// checks a known value rather than trusting it.

// ── THE TABLE'S SIZING MATH, PURE ───────────────────────────────────────────
//
// PURE MEANS PURE: no DOM, no closure state, no settings. A caller
// gathers roomPx/chPx/gapPx from the DOM and passes numbers in. The
// table sizes its columns from real glyphs now (the grid), and these four
// survive as the documented fallback, tested but uncalled.
//
// The constants and the 1.12 label weight are facts about the table,
// each with one writer here. Labels ellipse, so a floor a little short
// costs a letter rather than an overflow — the asymmetry that makes a
// tight floor safe. MAX_TEXT is the lower ceiling for a column of
// WORDS: fourteen characters is a point of view, a status, a place
// name, or the first two of a list of tags — enough to recognise a
// value, not enough for one long one to take a quarter of the pane. The
// cap never squeezes the heading — see wsColPrefCh.
export const WS_COL_MIN_CH = 4, WS_COL_MAX_CH = 20, WS_COL_MAX_TEXT_CH = 14, WS_COL_PAD_CH = 1;
// THE LABEL COSTS MORE THAN ITS LETTERS: small caps with letter-spacing,
// weighted rather than measured (a layout pass per label is a price the
// window cannot pay).
export function wsLabelCh(label: string | null | undefined) {
	return Math.ceil(String(label || '').length * 1.12);
}
// A column's PREFERRED width in ch: its widest seen value or its label,
// padded, capped — and a column of words (user property) capped harder
// than one of figures. The cap never squeezes the heading.
export function wsColPrefCh(col: { label?: string; user?: boolean } | null | undefined, seenCh: unknown) {
	const label = wsLabelCh(col && col.label);
	const cap = Math.max(label + WS_COL_PAD_CH,
		(col && col.user) ? WS_COL_MAX_TEXT_CH : WS_COL_MAX_CH);
	return Math.min(cap,
		Math.max(WS_COL_MIN_CH, label, Number(seenCh) || 0) + WS_COL_PAD_CH);
}
// Fit the preferred widths into the room: shave the WIDEST first, half a
// character at a time, never below a column's floor — its widest measured
// value or its own heading, whichever is more. When even the floors do not
// fit, nothing more is shaved and `clipped` says so: whole columns missing
// and announced beats every column half-eaten and silent.
//   o = { cols, colCh, prefs (ch numbers), roomPx, chPx, gapPx }
//   -> { widths (ch numbers), clipped }
export function wsFitCols(o: { cols: { id: string; label?: string }[]; colCh: Record<string, number | undefined>; prefs: number[]; roomPx: number; chPx: number; gapPx: number }) {
	const n = o.prefs.slice();
	const gaps = Math.max(0, n.length - 1) * o.gapPx;
	const floors = o.cols.map((c, i) => Math.min(n[i],
		Math.max(WS_COL_MIN_CH, wsLabelCh(c && c.label),
			(Number(o.colCh[c.id]) || 0))));
	const total = () => n.reduce((a, b) => a + b, 0) * o.chPx + gaps;
	let guard = 4000;
	while (total() > o.roomPx && guard-- > 0) {
		let big = -1;
		for (let i = 0; i < n.length; i++) {
			if (n[i] <= floors[i]) continue;
			if (big === -1 || n[i] > n[big]) big = i;
		}
		if (big === -1) break;
		n[big] = Math.max(floors[big], n[big] - 0.5);
	}
	return { widths: n, clipped: total() > o.roomPx + 0.5 };
}

export const WS_CRC_TABLE = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
		t[n] = c;
	}
	return t;
})();

export function wsCrc32(bytes: number[] | Uint8Array) {
	let c = 0 ^ (-1);
	for (let i = 0; i < bytes.length; i++) {
		c = (c >>> 8) ^ WS_CRC_TABLE[(c ^ bytes[i]) & 0xFF];
	}
	return (c ^ (-1)) >>> 0;
}

// UTF-8 without TextEncoder, because this runs inside Obsidian on desktop and
// mobile and the encoder is not worth assuming. Returns a plain array of byte
// values, which is what the ZIP assembly below concatenates.
export function wsUtf8(str: string) {
	const out = [];
	for (let i = 0; i < str.length; i++) {
		let c = str.charCodeAt(i);
		// Surrogate pair → one code point, or the four-byte form below is
		// built from half a character and the file is quietly malformed.
		if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
			const d = str.charCodeAt(i + 1);
			if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
		}
		if (c < 0x80) out.push(c);
		else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
		else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
		else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
	}
	return out;
}

// STORE-only ZIP. Entries are { name, bytes }; the result is a Uint8Array
// ready for vault.createBinary. THE PARTS ARE COPIED, NOT PUSHED: a picture
// makes a part megabytes long, and a byte at a time onto a plain array was a
// number per byte in memory (A568). Every part and header is laid into one
// buffer of the right size at the end.
export function wsZip(entries: { name: string; bytes: number[] | Uint8Array }[]) {
	const chunks: (number[] | Uint8Array)[] = [];
	const central: number[][] = [];
	const u16 = (v: number) => [v & 0xFF, (v >> 8) & 0xFF];
	const u32 = (v: number) => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
	let offset = 0;
	for (const e of entries) {
		const name = wsUtf8(e.name);
		const data = e.bytes;
		const crc  = wsCrc32(data);
		// Local header. Version 20, no flags, method 0 (stored). The DOS
		// date/time is left at zero: Word does not care, and a real clock here
		// would make two exports of the same manuscript differ byte for byte.
		const local = ([] as number[]).concat(
			u32(0x04034B50), u16(20), u16(0x0800), u16(0),
			u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
			u16(name.length), u16(0), name);
		central.push(([] as number[]).concat(
			u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0),
			u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
			u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
			u32(offset), name));
		chunks.push(local, data);
		offset += local.length + data.length;
	}
	const cdStart = offset;
	let cdLen = 0;
	for (const c of central) { chunks.push(c); cdLen += c.length; }
	chunks.push(([] as number[]).concat(u32(0x06054B50), u16(0), u16(0),
		u16(central.length), u16(central.length), u32(cdLen), u32(cdStart), u16(0)));
	let total = 0;
	for (const c of chunks) total += c.length;
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) { out.set(c, at); at += c.length; }
	return out;
}

// A RECT'S PAGE IN THE PAGED PREVIEW, its column, in one unit at every zoom. A rect comes back ZOOMED by the root's
// CSS zoom while `clientWidth` and `scrollLeft` do not (measured in Edge: at zoom 0.5 a 624px column's rect is 312px
// wide, its scrollLeft unchanged), so both are brought to the rect's. Read with the two mixed (A569 to #72), a page at a
// phone's 0.29 counted as a third of one: the reader's seams skipped pages, the contents' numbers ran short.
export function wsColumnOf(view: Window, flow: HTMLElement): ((r: DOMRect) => number) | null {
	const cw = flow.clientWidth, fr = flow.getBoundingClientRect();
	if (!(cw > 0) || !(fr.width > 0)) return null;
	const z = fr.width / cw;
	const across = (cw + (parseFloat(view.getComputedStyle(flow).columnGap) || 0)) * z;
	const origin = fr.left - flow.scrollLeft * z;
	return (r: DOMRect) => Math.floor((r.left - origin + 1) / across);
}
// A PARAGRAPH CUT WHERE A PAGE BEGINS (the writer: "So the preview and expanded look the same"): its first line on page
// `col` and what follows it go to a second paragraph, which opens the page in the reader; set to read as one paragraph
// (`pgsplit` keeps no air under it, `pgcont` no indent). The cut half, or null where the paragraph has no line there.
function wsPageCutAt(doc: Document, P: HTMLElement, colOf: (r: DOMRect) => number, col: number): [Text, number] | null {
	const tw = doc.createTreeWalker(P, 4);
	const marks: [Text, number][] = [];
	let n: Node | null;
	while ((n = tw.nextNode())) { const t = n as Text; for (let o = 0; o < t.data.length; o++) if (!/\s/.test(t.data[o])) marks.push([t, o]); }
	if (!marks.length || !P.lastChild) return null;
	const rg = doc.createRange();
	const on = (k: number) => { rg.setStart(marks[k][0], marks[k][1]); rg.setEnd(marks[k][0], marks[k][1] + 1); const rs = rg.getClientRects(); return rs.length ? colOf(rs[0]) >= col : false; };
	let lo = 0, hi = marks.length;
	while (lo < hi) { const mid = (lo + hi) >> 1; if (on(mid)) hi = mid; else lo = mid + 1; }
	return lo === 0 || lo >= marks.length ? null : marks[lo];
}
// …and made: what follows the place goes to a second paragraph after the first. Cut more than once, a paragraph is cut
// from its end back (`wsPageStarts`), so every place read is still in its first half; a middle part is both halves
function wsPageSplit(doc: Document, P: HTMLElement, at: [Text, number]): HTMLElement | null {
	if (!P.lastChild || !P.contains(at[0])) return null;
	const rg = doc.createRange();
	rg.setStart(at[0], at[1]); rg.setEndAfter(P.lastChild);
	const P2 = P.cloneNode(false) as HTMLElement;
	P2.removeAttribute('id');
	P2.classList.remove('pgsplit', 'first');
	P2.classList.add('pgcont');
	P2.appendChild(rg.extractContents());
	P.after(P2);
	P.classList.add('pgsplit');
	return P2;
}
// …AND THE PAGE A PART IS ON (the writer: "when im in the middle of last page the page numbers dissapear"): a later part
// (`pgcont`) is made after the reader's page map was taken, and made again at every zoom, so the map never knows it; each
// part begins the page after the part before it, so its page is its first part's and one on for each part between; the
// reader's seam between two parts (a page's foot, the next one's head) is passed over. Null where the first part is not in
// the map either
export function wsPageOfPart(el: Element, pageOf: WeakMap<HTMLElement, number>): number | null {
	let k: Element = el, on = 0;
	while (k.classList.contains('pgcont')) {
		let pv = k.previousElementSibling;
		while (pv && pv.classList.contains('seam')) pv = pv.previousElementSibling;
		if (!pv || !pv.classList.contains('pgsplit')) return null;
		k = pv;
		on++;
	}
	const at = pageOf.get(k as HTMLElement);
	return at == null ? null : at + on;
}
// A TABLE WHERE A PAGE BEGINS IN IT, likewise: its rows from that page on go to a second table after the first (the head
// not repeated, as Word repeats one only when told), so the reader's page holds the rows the printed page holds
function wsTableCutAt(table: Element, colOf: (r: DOMRect) => number, col: number): Element | null {
	const rows = Array.from(table.querySelectorAll(':scope > tbody > tr'));
	for (let i = 1; i < rows.length; i++) { const r = rows[i].getClientRects()[0]; if (r && colOf(r) >= col) return rows[i]; }
	return null;
}
function wsTableSplit(table: HTMLElement, row: Element): HTMLElement | null {
	const body = row.parentElement;
	if (!body) return null;
	const T2 = table.cloneNode(false) as HTMLElement;
	T2.classList.remove('tbsplit');
	T2.classList.add('tbcont');
	const B2 = T2.appendChild(body.cloneNode(false));
	for (let r: Element | null = row; r;) { const nx: Element | null = r.nextElementSibling; B2.appendChild(r); r = nx; }
	table.after(T2);
	table.classList.add('tbsplit');
	return T2;
}
// …joined again before the pages are read anew: another zoom may begin them elsewhere (from the end back, so a part
// that is both cut from and cut folds in before its first half takes it)
function wsPageJoin(flow: HTMLElement) {
	for (const t2 of Array.from(flow.querySelectorAll('table.tbcont')).reverse()) {
		const t1 = t2.previousElementSibling;
		const into = t1 && t1.classList.contains('tbsplit') ? t1.querySelector(':scope > tbody:last-of-type') : null;
		if (!t1 || !into) { t2.classList.remove('tbcont'); continue; }
		for (const r of Array.from(t2.querySelectorAll(':scope > tbody > tr'))) into.appendChild(r);
		t2.remove();
		t1.classList.remove('tbsplit');
	}
	for (const p2 of Array.from(flow.querySelectorAll('p.pgcont')).reverse()) {
		const p1 = p2.previousElementSibling;
		if (!p1 || !p1.classList.contains('pgsplit')) { p2.classList.remove('pgcont'); continue; }
		while (p2.firstChild) p1.appendChild(p2.firstChild);
		p2.remove();
		p1.classList.remove('pgsplit');
		p1.normalize();
	}
}

// ── WHERE EACH PRINTED PAGE BEGINS, FOR THE READER (A569, the writer's look 4) ──
//
// Read off the paged preview: every block's column is its page, so the first block of a new
// column begins page n. STAMPED ON THE BLOCK as `data-ws-page`, which only the reader draws (a
// faint rule and the number): no node is added and the pages are untouched. Read with the flow
// taken off for the moment, the scroll put back; a stamp from the last reading is cleared first.
export function wsPageStarts(doc: Document) {
	const root = doc.documentElement;
	const view = doc.defaultView;
	if (!root || !view) return 0;
	for (const el of Array.from(doc.querySelectorAll('[data-ws-page]'))) el.removeAttribute('data-ws-page');
	for (const el of Array.from(doc.querySelectorAll('[data-ws-page-open]'))) el.removeAttribute('data-ws-page-open');
	for (const el of Array.from(doc.querySelectorAll('.seam'))) el.remove();
	const flow = doc.querySelector<HTMLElement>('.sheet:not([data-pooled]) .flow');
	if (!flow) return 0;
	wsPageJoin(flow);
	const scroller = doc.scrollingElement;
	const top = scroller ? scroller.scrollTop : 0;
	const was = root.classList.contains('is-flow');
	if (was) root.classList.remove('is-flow');
	let n = 0;
	const starts: [Element, number][] = [];
	try {
		const colOf = wsColumnOf(view, flow);
		if (colOf) {
			let seen = 0;
			const mark = (el: Element, col: number, sec: Element) => {
				el.setAttribute('data-ws-page', String(col + 1)); seen = col; n++;
				starts.push([el, col + 1]);
				// A FILE THAT OPENS THE PAGE (A618): its page rule is its divider, so it
				// draws no dashed rule of its own above it
				if (el === sec.firstElementChild) sec.setAttribute('data-ws-page-open', '');
			};
			// A BLOCK THAT RUNS ONTO THE NEXT PAGE: a paragraph is cut at that page's first line and the cut opens the
			// page, so the reader's page holds what the printed page holds (until #72 the next block was marked, and a
			// paragraph longer than a page skipped a number); a list or a quotation is entered, block by block
			// READ FIRST, WRITTEN AFTER (the writer: "really laggy on 700pages, especially the expaned view"): every start and
			// every cut found with nothing changed, then the cuts made and the starts stamped. A cut made between two reads had
			// the engine lay the whole book out again before the next: a page a cut, a book's layout a page.
			const found: { el: Element | null; col: number; sec: Element; P?: HTMLElement; at?: [Text, number]; T?: HTMLElement; row?: Element }[] = [];
			const visit = (el: Element, sec: Element) => {
				const rs = el.getClientRects();
				if (!rs.length) return;
				const first = colOf(rs[0]), last = colOf(rs[rs.length - 1]);
				if (first > seen) { found.push({ el, col: first, sec }); seen = first; }
				if (last > first) {
					if (el.tagName === 'P') {
						for (let c = first + 1; c <= last; c++) { const at = wsPageCutAt(doc, el as HTMLElement, colOf, c); if (at) found.push({ el: null, col: c, sec, P: el as HTMLElement, at }); }
					} else if (el.tagName === 'TABLE') {
						for (let c = first + 1; c <= last; c++) { const row = wsTableCutAt(el, colOf, c); if (row) found.push({ el: null, col: c, sec, T: el as HTMLElement, row }); }
					} else if (/^(UL|OL|BLOCKQUOTE)$/.test(el.tagName)) for (const k of Array.from(el.children)) visit(k, sec);
				}
				if (last > seen) seen = last;
			};
			for (const sec of Array.from(flow.children)) for (const el of Array.from(sec.children)) visit(el, sec);
			for (let i = found.length - 1; i >= 0; i--) { const f = found[i]; if (f.P && f.at) f.el = wsPageSplit(doc, f.P, f.at); else if (f.T && f.row) f.el = wsTableSplit(f.T, f.row); }
			for (const c of Array.from(flow.querySelectorAll('table.tbcont'))) { const pv = c.previousElementSibling; if (pv) pv.classList.add('tbsplit'); }
			// (a part both cut from and cut: no air under it either)
			for (const c of Array.from(flow.querySelectorAll('p.pgcont'))) { const pv = c.previousElementSibling; if (pv) pv.classList.add('pgsplit'); }
			for (const f of found) if (f.el) mark(f.el, f.col, f.sec);
		}
	} finally {
		if (was) root.classList.add('is-flow');
		if (scroller) scroller.scrollTop = top;
	}
	try { wsPageSeams(doc, flow, starts); } catch (_) { wsCatch('wsPageStarts: the seams', _); }
	return n;
}

// ── THE PAGE'S FOOT AND HEAD, WHERE ONE PAGE ENDS AND THE NEXT BEGINS (A804) ──
//
// The writer: "make the expanded view with all the headers page numbers and everything to match the actual export".
// Before each page's first block a seam: the page that ends, its number where the file puts it at the foot; a dashed
// cut; the page that begins, its running header and its number where the file heads it. The first page's head over
// the text, the last page's foot under it; neither on a title page (`w:titlePg`, and the preview's own sheets). Read
// off the preview's root (`data-ws-head`, `data-ws-pn`, `data-ws-tp`), shown in the reader alone (`.seam`).
export function wsPageSeams(doc: Document, flow: Element, starts: [Element, number][]) {
	const root = doc.documentElement;
	if (!root || !root.hasAttribute('data-ws-pn')) return 0;
	const head = root.getAttribute('data-ws-head') || '', pn = root.getAttribute('data-ws-pn') || 'none', tp = root.hasAttribute('data-ws-tp');
	// (the header's side and its own {page}, #81)
	const left = root.getAttribute('data-ws-hside') === 'left', mine = left ? 'top-left' : 'top-right';
	// (made with Obsidian's own helpers and handed to the frame's document, which adopts them: the review asks for
	// createEl over createElement)
	const seam = (parent: Node, before: Node | null, ends: number, begins: number) => {
		// SOFT where the engine broke inside a file (the next block's top margin is dropped there, as the page drops it); a
		// file that opens the page keeps its own
		const soft = !!before && before.parentNode === parent && (before as Element).previousElementSibling !== null;
		const s = createDiv({ cls: 'seam' + (soft ? ' is-soft' : ''), attr: { 'aria-hidden': 'true' } });
		if (ends > 0) {
			// the room the page's text left at its foot, made up (`wsSeamFill`)
			s.createDiv({ cls: 'seam-fill' });
			const f = s.createDiv({ cls: 'seam-foot' });
			if (pn.startsWith('bottom-') && !(tp && ends === 1)) f.createSpan({ cls: 'seam-num is-' + pn.slice(7), text: String(ends) });
			if (begins > 0) s.createDiv({ cls: 'seam-cut' });
		}
		if (begins > 0) {
			const h = s.createDiv({ cls: 'seam-head' });
			if (!(tp && begins === 1)) {
				if (pn.startsWith('top-') && pn !== mine) h.createSpan({ cls: 'seam-num is-' + pn.slice(4), text: String(begins) });
				const said = head.split('{page}').join(String(begins)) + (pn === mine ? (head ? ' ' : '') + begins : '');
				if (said) h.createSpan({ cls: 'seam-hdr' + (left ? ' is-left' : ''), text: said });
			}
		}
		parent.insertBefore(s, before);
	};
	const first = flow.firstElementChild;
	if (first) seam(first, first.firstChild, 0, 1);
	for (const [el, page] of starts) if (el.parentNode) seam(el.parentNode, el, page - 1, page);
	const last = flow.lastElementChild;
	if (last) seam(last, null, starts.length ? starts[starts.length - 1][1] : 1, 0);
	try { wsSeamFill(doc, flow as HTMLElement); } catch (_) { wsCatch('wsPageSeams: the fill', _); }
	return starts.length + 2;
}

// …AND EACH PAGE THE PAPER'S HEIGHT (the writer: "for expanded view add those spaces between pages. So the preview and
// expanded look the same"): a page's text stops short of its foot by what the engine left there, and the seam's fill
// makes that up, so every page in the reader is a sheet as tall as the paper with the paged view's air between sheets.
// Measured in the reader (the seams show there alone), and written as a share of the page's height (`--page-ch`) so a
// zoom leaves it right.
function wsSeamFill(doc: Document, flow: HTMLElement) {
	const root = doc.documentElement;
	if (!root || !root.classList.contains('is-flow')) return 0;
	const seams = Array.from(flow.querySelectorAll<HTMLElement>('.seam'));
	if (seams.length < 2) return 0;
	const probe = createDiv({ cls: 'seam-probe' });
	flow.appendChild(probe);
	const H = probe.getBoundingClientRect().height;
	const marks = seams.map((s) => {
		const fill = s.querySelector<HTMLElement>('.seam-fill'), head = s.querySelector<HTMLElement>('.seam-head');
		return { fill, top: fill ? fill.getBoundingClientRect().top : 0, after: (head || s).getBoundingClientRect().bottom };
	});
	probe.remove();
	if (!(H > 0)) return 0;
	let n = 0;
	for (let i = 1; i < marks.length; i++) {
		const m = marks[i];
		if (!m.fill) continue;
		const share = Math.max(0, (H - (m.top - marks[i - 1].after)) / H);
		m.fill.style.height = 'calc(var(--page-ch) * ' + share.toFixed(5) + ')';
		n++;
	}
	return n;
}

// ── THE NOTES AT THE FOOT OF THE PAGE THAT CITES THEM (#72) ─────────────────────────────────────────────────────────
//
// brg-2000: "if you choose in the export options to display the footnotes at the bottom of each page, it doesn't display
// that way in the preview panel". A Word file's footnotes are Word's to lay out, and the preview lays them out as Word
// does: each note at the foot of the page its first mark is on, under a short rule, single spaced and a size smaller
// (the .docx's FootnoteText), the page's text giving way to them and a paragraph cut at the line where the room ends.
// LAID OUT A FEW PAGES AT A TIME: the book's sections go through a SCRATCH flow of the same columns holding only the
// pages since the last block, the finished ones held aside, so a layout is a few pages and not the book (measured in
// Edge, 375 pages and 520 notes: the whole flow 7.4 s, this 0.64 s). A note no page can take (its mark on a page a
// picture fills) stays on the notes page at the back. Run in the pages, at zoom 1; the reader is the same document.
// (TOMBSTONE: WS_FOOT_SLACK, 4px left at each page's foot, and `.fnfoot { break-inside: avoid }`: both held a page placed
// at 100% and shown under a CSS zoom, whose lines rounded differently. The page is never zoomed now, only its frame
// scaled, and neither could be shown to matter: each passed anyway in the sweep, and every zoom placed without them.)
// (TOMBSTONE: WS_PREVIEW_ZOOM_FLOOR, the preview zoomed down to three quarters and shrunk below. A zoom at all relaid
// the page's text, 58 pages at 110% to 150% where the book has 61: the frame is scaled at every zoom now, `apply`.)
export function wsFootNotes(doc: Document): { notes: number; placed: number } {
	const none = { notes: 0, placed: 0 };
	const view = doc.defaultView, root = doc.documentElement;
	const flow = doc.querySelector<HTMLElement>('.sheet:not([data-pooled]) .flow');
	const notesSec = flow ? flow.querySelector<HTMLElement>('section.notes') : null;
	const sheet = flow ? flow.closest<HTMLElement>('.sheet') : null;
	// PLACED, OR TRIED: the contents' numbers may be read now (`wsTocPagesFill` waits for this on a page of notes at the foot)
	if (root) root.setAttribute('data-ws-fn-placed', '');
	if (!view || !root || !flow || !notesSec || !sheet || !sheet.parentNode) return none;
	const wasFlow = root.classList.contains('is-flow');
	if (wasFlow) root.classList.remove('is-flow');
	const zoomWas = root.style.zoom;
	root.style.removeProperty('zoom');
	const byId = new Map<string, HTMLElement>();
	for (const li of Array.from(notesSec.querySelectorAll<HTMLElement>('ol.notes > li'))) byId.set(li.id, li);
	notesSec.remove();
	// the scratch: a sheet of the same shape out of sight, its flow of the same columns
	const sSheet = sheet.cloneNode(false) as HTMLElement;
	sSheet.removeAttribute('id');
	sSheet.setAttribute('data-ws-scratch', '');
	const sFlow = flow.cloneNode(false) as HTMLElement;
	sSheet.appendChild(sFlow);
	sheet.parentNode.appendChild(sSheet);
	const meas = createDiv({ cls: 'fnmeasure' });
	sSheet.appendChild(meas);
	const queue = Array.from(flow.children);
	for (const s of queue) s.remove();
	const placed = new Set<string>(), leftovers: string[] = [];
	// THE FINISHED PAGES WAIT IN THE REAL FLOW, laid out by nobody while it is hidden (`is-placing`): a flow a layout
	// has to cross is the book again, at every step
	flow.classList.add('is-placing');
	try {
		const across = sFlow.clientWidth + (parseFloat(view.getComputedStyle(sFlow).columnGap) || 0);
		const fr = sFlow.getBoundingClientRect();
		const H = fr.height, top0 = fr.top;
		if (!(across > 0) || !(H > 0)) throw new Error('no page to lay notes on');
		let O = 0;
		const origin = () => { const r = sFlow.getBoundingClientRect(); O = r.left - sFlow.scrollLeft; };
		const colOf = (r: DOMRect) => Math.floor((r.left - O + 1) / across);
		const refId = (r: Element) => { const a = r.querySelector('a'); return a ? decodeURIComponent((a.getAttribute('href') || '').slice(1)) : ''; };
		// a page's notes as Word sets them: the number raised, a space, the note
		const mk = (ids: string[]) => {
			const b = createDiv({ cls: 'fnfoot' });
			for (const id of ids) {
				const li = byId.get(id);
				if (!li) continue;
				const p = b.createEl('p', { cls: 'fn', attr: { id } });
				p.createEl('sup', { cls: 'fnmark', text: id.replace(/^fn-/, '') });
				p.appendText(' ');
				for (const k of Array.from(li.childNodes)) p.appendChild(k.cloneNode(true));
			}
			return b;
		};
		const blocksOf = () => Array.from(sFlow.querySelectorAll<HTMLElement>(':scope > * > *'));
		const mb = (el: Element) => parseFloat(view.getComputedStyle(el).marginBottom) || 0;
		// a line's box: a character's glyph box grown by the half-leading to the line's height
		const lineBottom = (r: DOMRect, lh: number) => (lh > r.height ? r.bottom + (lh - r.height) / 2 : r.bottom);
		// the first character of the line that runs past `limit` on page p
		const splitAt = (P: HTMLElement, p: number, limit: number) => {
			const lh = parseFloat(view.getComputedStyle(P).lineHeight) || 0;
			const tw = doc.createTreeWalker(P, 4);
			const marks: [Text, number][] = [];
			let n: Node | null;
			while ((n = tw.nextNode())) { const t = n as Text; for (let o = 0; o < t.data.length; o++) if (!/\s/.test(t.data[o])) marks.push([t, o]); }
			if (!marks.length) return null;
			const rg = doc.createRange();
			const past = (k: number) => {
				rg.setStart(marks[k][0], marks[k][1]); rg.setEnd(marks[k][0], marks[k][1] + 1);
				const rs = rg.getClientRects();
				if (!rs.length) return false;
				const c = colOf(rs[0]);
				return c > p || (c === p && lineBottom(rs[0], lh) > limit + 0.5);
			};
			let lo = 0, hi = marks.length;
			while (lo < hi) { const mid = (lo + hi) >> 1; if (past(mid)) hi = mid; else lo = mid + 1; }
			return lo < marks.length ? { k: lo, at: marks[lo] } : null;
		};
		// the notes cited on scratch page p, at its foot: the block, or null when the page cannot take them
		const placeOn = (p: number, ids: string[]) => {
			let block = mk(ids);
			meas.appendChild(block);
			const h = block.getBoundingClientRect().height;
			meas.removeChild(block);
			for (let attempt = 0; attempt < 4; attempt++) {
				origin();
				const list = blocksOf();
				const limitFor = (el: Element | null) => top0 + H - h - (el ? mb(el) : 0) - 1 - attempt * 4;
				const endsBefore = (el: Element) => {
					const rs = el.getClientRects();
					if (!rs.length) return true;
					const r = rs[rs.length - 1], c = colOf(r);
					return c < p || (c === p && r.bottom <= limitFor(el) + 0.5);
				};
				let lo = 0, hi = list.length;
				while (lo < hi) { const mid = (lo + hi) >> 1; if (endsBefore(list[mid])) lo = mid + 1; else hi = mid; }
				const B = list[lo] || null;
				let after: HTMLElement | null = null, split: [HTMLElement, HTMLElement] | null = null;
				if (!B) after = list[list.length - 1] || null;
				else {
					const r0 = B.getClientRects()[0];
					const c0 = r0 ? colOf(r0) : p + 1;
					if (r0 && (c0 < p || (c0 === p && r0.top < limitFor(B))) && B.tagName === 'P') {
						const s = splitAt(B, p, limitFor(B));
						if (s && s.k > 0 && B.lastChild) {
							const rg = doc.createRange();
							rg.setStart(s.at[0], s.at[1]); rg.setEndAfter(B.lastChild);
							const frag = rg.extractContents();
							const P2 = B.cloneNode(false) as HTMLElement;
							P2.removeAttribute('id');
							P2.classList.add('fncont');
							P2.appendChild(frag);
							B.after(P2);
							B.classList.add('fnsplit');
							split = [B, P2];
							after = B;
						}
					}
					if (!split) {
						after = list[lo - 1] || null;
						// the page's first block cannot be cut before: nothing would stand on the page
						if (after) { const ra = after.getClientRects(); const la = ra[ra.length - 1]; if (!la || colOf(la) < p) after = null; }
					}
				}
				if (!after) return null;
				after.after(block);
				// a note whose every mark went on with the text goes with it
				for (const fn of Array.from(block.querySelectorAll('p.fn'))) {
					const cites = Array.from(sFlow.querySelectorAll('sup.fnref')).filter((r) => refId(r) === fn.id);
					if (cites.length && cites.every((r) => (block.compareDocumentPosition(r) & 4) !== 0)) fn.remove();
				}
				const br = block.getBoundingClientRect();
				if (colOf(br) === p && block.getClientRects().length === 1 && br.bottom <= top0 + H + 0.5) {
					// AT THE FOOT: the air left above the block, so the rule sits where Word draws it
					const gap = Math.floor(top0 + H - br.bottom - 1);
					if (gap > 0) block.style.marginTop = gap + 'px';
					return block;
				}
				block.remove();
				if (split) { const [a, b2] = split; while (b2.firstChild) a.appendChild(b2.firstChild); b2.remove(); a.classList.remove('fnsplit'); }
				block = mk(ids);
			}
			return null;
		};
		const finishBefore = (keep: Node | null) => { while (sFlow.firstChild && sFlow.firstChild !== keep) flow.appendChild(sFlow.firstChild); };
		const opensPage = (s: Element) => s.classList.contains('page') || s.hasAttribute('data-ws-cont');
		for (let guard = 0; guard < 200000; guard++) {
			origin();
			const refs = Array.from(sFlow.querySelectorAll('sup.fnref'));
			const first = refs.find((r) => { const id = refId(r); return byId.has(id) && !placed.has(id); });
			if (!first) {
				const next = queue.shift();
				if (!next) break;
				// what stands before the last section that opens a page is finished
				const secs = Array.from(sFlow.children);
				for (let k = secs.length - 1; k > 0; k--) if (opensPage(secs[k])) { finishBefore(secs[k]); break; }
				sFlow.appendChild(next);
				continue;
			}
			const p = colOf(first.getBoundingClientRect());
			// a page's foot is decided once another page follows it (or it is the book's last)
			if (queue.length && Math.round(sFlow.scrollWidth / across) <= p + 1) { const next = queue.shift(); if (next) sFlow.appendChild(next); continue; }
			const ids: string[] = [];
			for (const r of refs) {
				const id = refId(r);
				if (!byId.has(id) || placed.has(id) || ids.indexOf(id) >= 0) continue;
				const c = colOf(r.getBoundingClientRect());
				if (c === p) ids.push(id); else if (c > p) break;
			}
			const block = placeOn(p, ids);
			if (!block) { for (const id of ids) { placed.add(id); leftovers.push(id); } continue; }
			for (const fn of Array.from(block.querySelectorAll('p.fn'))) placed.add(fn.id);
			if (!block.querySelector('p.fn')) { block.remove(); continue; }
			// the section cut after the block: the rest opens the next page
			const S = block.parentElement;
			if (!S) break;
			if (block.nextSibling) {
				const S2 = S.cloneNode(false) as HTMLElement;
				S2.removeAttribute('id');
				S2.setAttribute('data-ws-cont', '');
				while (block.nextSibling) S2.appendChild(block.nextSibling);
				S.after(S2);
			}
			finishBefore(S.nextSibling);
			if (sFlow.firstChild === S) flow.appendChild(S);
		}
	} catch (_) { wsCatch('wsFootNotes', _); }
	finally {
		while (sFlow.firstChild) flow.appendChild(sFlow.firstChild);
		for (const s of queue) flow.appendChild(s);
		// the cut sections joined back to the ones they were cut from
		for (const c of Array.from(flow.querySelectorAll(':scope > [data-ws-cont]'))) {
			const prev = c.previousElementSibling;
			if (prev) { while (c.firstChild) prev.appendChild(c.firstChild); c.remove(); } else c.removeAttribute('data-ws-cont');
		}
		sSheet.remove();
		// what no page could take stays at the back
		for (const id of byId.keys()) if (!placed.has(id) && leftovers.indexOf(id) < 0) leftovers.push(id);
		if (leftovers.length) {
			for (const li of Array.from(notesSec.querySelectorAll('ol.notes > li'))) if (leftovers.indexOf(li.id) < 0) li.remove();
			flow.appendChild(notesSec);
		}
		flow.classList.remove('is-placing');
		root.style.zoom = zoomWas;
		if (wasFlow) root.classList.add('is-flow');
	}
	return { notes: byId.size, placed: byId.size - leftovers.length };
}

// ── AN E-BOOK (A612) ─────────────────────────────────────────────────────
//
// THE WEB PAGE'S DOCUMENT, CUT INTO A BOOK: the builder the preview, the .html and
// the PDF read, so the e-book cannot drift from what the writer just looked at.
// Each section that opens a page opens a file (a reader turns a page there too),
// every link is told the file its anchor went to, the pictures are unpacked from
// their data addresses into the book, and each file is written by the browser's
// own XML serializer, which is what makes it the XHTML an EPUB must be (a <br>
// written <br/>, every & escaped), on a phone as on the desktop. EPUB 3, with an
// EPUB 2 table of contents beside it for older readers; a store-only zip, the
// mimetype first and alone, as the format asks.
export interface WsEpubNav { id: string; label: string; level: number }
export interface WsEpubMeta { title: string; author: string; lang: string; nav: WsEpubNav[]; indent: boolean; paraBlank?: boolean; paraHalf?: boolean; modified?: string; tocTitle?: string; centerHeads?: boolean }

// the picture kinds every EPUB reader is bound to show
const WS_EPUB_IMG: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

// THE BOOK'S IDENTIFIER from its title and author: the same book exported twice is
// the same book to a reader's library, which updates it rather than shelving two.
export function wsEpubUuid(seed: string) {
	const h = [0, 1, 2, 3].map((k) => wsCrc32(wsUtf8(k + '|' + seed)).toString(16).padStart(8, '0')).join('');
	return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-'
		+ ((parseInt(h.charAt(16), 16) & 3) | 8).toString(16) + h.slice(17, 20) + '-' + h.slice(20, 32);
}

// base64 to bytes without atob, which a build's typings may call deprecated
const WS_B64_AT = (() => {
	const t = new Int16Array(128).fill(-1);
	const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	for (let i = 0; i < 64; i++) t[a.charCodeAt(i)] = i;
	return t;
})();
export function wsDataUrlBytes(url: string): { mime: string; bytes: Uint8Array } | null {
	const m = /^data:([^;,]+)((?:;[^;,]*)*),([\s\S]*)$/.exec(url);
	if (!m) return null;
	try {
		if (!/;base64/i.test(m[2])) return { mime: m[1].toLowerCase(), bytes: new Uint8Array(wsUtf8(decodeURIComponent(m[3]))) };
		const s = m[3];
		const out = new Uint8Array(Math.ceil(s.length * 3 / 4));
		let o = 0, buf = 0, bits = 0;
		for (let i = 0; i < s.length; i++) {
			const c = s.charCodeAt(i);
			const v = c < 128 ? WS_B64_AT[c] : -1;
			if (v < 0) continue;
			buf = ((buf << 6) | v) & 0xFFFFFF; bits += 6;
			if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xFF; }
		}
		return { mime: m[1].toLowerCase(), bytes: out.slice(0, o) };
	} catch { return null; }
}

// A READER'S PAGE, not a sheet: no paper, no margins, no running header, and since
// A626 no face and no line height either ("there are font stuff like times new roman,
// line spaces"): the reader's app sets those, and a book that names them overrides
// the reader's choice in the apps that honor a publisher's style. The book keeps its
// shape: the indents, the headings, the breaks.
export function wsEpubCss(meta: WsEpubMeta) {
	return 'body { margin: 0; }\n'
		+ 'p { margin: ' + (meta.paraBlank ? '0 0 1em 0' : meta.paraHalf ? '0 0 0.5em 0' : meta.indent ? '0' : '0 0 0.6em 0') + '; text-indent: ' + (meta.indent ? '1.5em' : '0') + '; hyphens: auto; -webkit-hyphens: auto; }\n'
		// (a kept blank line one line, no spacing of its own: A851)
		+ 'p.blank { margin: 0; }\n'
		+ 'p.first, p.div, p.cmt, p.li, blockquote p, figure p, li p, td p, th p { text-indent: 0; }\n'
		// CENTERED unless the writer turned Center headings off (#76); the title page stays centered either way
		+ 'h1, h2, h3, h4, h5, h6 {' + (meta.centerHeads === false ? '' : ' text-align: center;') + ' font-weight: bold; text-indent: 0; margin: 1.5em 0 1em; page-break-after: avoid; break-after: avoid; }\n'
		+ 'h1, h2 { font-size: 1.4em; } h3, h4, h5, h6 { font-size: 1.15em; }\n'
		+ 'section.tp { text-align: center; padding-top: 25%; } section.tp h1 { font-size: 2em; } section.tp p { text-indent: 0; }\n'
		+ 'p.div { text-align: center; margin: 1em 0; }\n'
		+ 'p.cmt { font-style: italic; color: #555; }\n'
		+ 'blockquote { margin: 0.6em 1.5em; } blockquote.callout { border-left: 2px solid #bbb; padding-left: 0.6em; margin-left: 1em; }\n'
		+ 'p.li { margin: 0 0 0.2em 1em; } p.li.l1 { margin-left: 2em; } p.li.l2 { margin-left: 3em; } p.li.l3 { margin-left: 4em; }\n'
		+ 'pre.code, pre.math, pre.fm { font-family: monospace; font-size: 0.85em; white-space: pre-wrap; }\n'
		+ 'table.tbl { border-collapse: collapse; margin: 0.8em auto; width: 100%; table-layout: fixed; } table.tbl th, table.tbl td { border: 1px solid #888; padding: 2px 6px; vertical-align: top; overflow-wrap: anywhere; }\n'
		+ 'figure.fig { margin: 0.8em 0; text-align: center; text-indent: 0; page-break-inside: avoid; break-inside: avoid; }\n'
		+ 'figure.fig img { max-width: 100%; height: auto; } figure.fig figcaption { font-style: italic; font-size: 0.9em; }\n'
		+ 'mark.hl-red { background: #f8c1c8; } mark.hl-orange { background: #f9d6b2; } mark.hl-green { background: #b5eaca; } mark.hl-blue { background: #b5d3f5; } mark.hl-purple { background: #d6cbfa; }\n'
		+ 'sup.fnref a { text-decoration: none; } ol.notes li { font-size: 0.92em; margin: 0 0 0.4em; text-indent: 0; }\n'
		+ 'p.bib { padding-left: 2em; text-indent: -2em; margin: 0 0 0.5em; }\n'
		+ 'ol.toc { list-style: none; padding: 0; } ol.toc li.l1 { margin-left: 1.5em; } ol.toc li.l2 { margin-left: 3em; } ol.toc li.l3 { margin-left: 4.5em; }\n'
		+ 'nav ol { list-style: none; } nav li { margin: 0.2em 0; }\n';
}

export function wsBuildEpub(html: string, meta: WsEpubMeta) {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const ser = new XMLSerializer();
	const lang = meta.lang || 'en';
	const title = meta.title || wsTIn(lang, 'Untitled');
	// THE FILES: a section that opens a page opens one; a section that runs on joins it
	const parts: Element[][] = [];
	for (const el of Array.from(doc.body.children)) {
		if (/^(STYLE|SCRIPT)$/.test(el.tagName)) continue;
		if (!parts.length || (el.tagName === 'SECTION' && el.classList.contains('page'))) parts.push([el]);
		else parts[parts.length - 1].push(el);
	}
	if (!parts.length) parts.push([]);
	// THE TITLE PAGE IS A CHAPTER TOO (A632, the writer: "the epub needs to have the title
	// page as a chapter too"): an address of its own, first in the contents, under the title
	const tp = doc.body.querySelector('section.tp');
	if (tp && !tp.id) tp.id = 'ws-title-page';
	const name = (i: number) => 'part-' + String(i + 1).padStart(3, '0') + '.xhtml';
	const home = new Map<string, number>();
	parts.forEach((els, i) => {
		for (const el of els) for (const x of [el].concat(Array.from(el.querySelectorAll('[id]')))) if (x.id && !home.has(x.id)) home.set(x.id, i);
	});
	const media: { href: string; mime: string; bytes: Uint8Array }[] = [];
	const unpacked = new Map<string, string>();
	parts.forEach((els, i) => {
		for (const el of els) {
			// a link told the file its anchor went to; one to nothing in the book loses its address
			for (const a of Array.from(el.querySelectorAll('a[href^="#"]'))) {
				const id = (a.getAttribute('href') || '').slice(1);
				const at = home.get(id);
				if (at === undefined) a.removeAttribute('href');
				else if (at !== i) a.setAttribute('href', name(at) + '#' + id);
			}
			for (const img of Array.from(el.querySelectorAll('img'))) {
				const src = img.getAttribute('src') || '';
				let href = unpacked.get(src);
				if (!href) {
					const d = /^data:/i.test(src) ? wsDataUrlBytes(src) : null;
					const ext = d ? WS_EPUB_IMG[d.mime] : '';
					if (!d || !ext) {
						// a picture no reader is bound to show leaves its words, never a hole
						img.replaceWith(doc.createTextNode('[' + (img.getAttribute('alt') || 'Image') + ']'));
						continue;
					}
					href = 'images/img-' + (media.length + 1) + '.' + ext;
					media.push({ href, mime: d.mime, bytes: d.bytes });
					unpacked.set(src, href);
				}
				img.setAttribute('src', '../' + href);
				if (!img.hasAttribute('alt')) img.setAttribute('alt', '');
			}
			// the notes in EPUB's own words, so a reader that knows them opens a note in place
			for (const a of Array.from(el.querySelectorAll('sup.fnref a'))) a.setAttribute('epub:type', 'noteref');
			for (const li of Array.from(el.querySelectorAll('ol.notes > li'))) li.setAttribute('epub:type', 'endnote');
		}
	});
	const x = wsXml;
	const page = (head: string, body: string, css: string) => '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
		+ '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="' + x(lang) + '" xml:lang="' + x(lang) + '"' + (wsIsRtl(lang) ? ' dir="rtl"' : '') + '>\n'
		+ '<head>\n<meta charset="utf-8"/>\n<title>' + x(head) + '</title>\n<link rel="stylesheet" type="text/css" href="' + css + '"/>\n</head>\n'
		+ '<body>\n' + body + '\n</body>\n</html>\n';
	const xmlOf = (n: Node) => ser.serializeToString(n)
		.replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')
		// a control character is no XML; a tab, a line break and a return are
		.replace(/[^\P{Cc}\t\n\r]/gu, '');
	const files: { name: string; bytes: number[] | Uint8Array }[] = [
		{ name: 'mimetype', bytes: wsUtf8('application/epub+zip') },
		{ name: 'META-INF/container.xml', bytes: wsUtf8('<?xml version="1.0" encoding="utf-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n') },
	];
	const texts: { name: string; bytes: number[] | Uint8Array }[] = [];
	parts.forEach((els, i) => {
		const h = els.map((el) => el.querySelector('h1, h2, h3, h4, h5, h6')).find((e) => !!e);
		const head = ((h && h.textContent) || '').trim() || title;
		texts.push({ name: 'OEBPS/text/' + name(i), bytes: wsUtf8(page(head, els.map(xmlOf).join('\n'), '../style.css')) });
	});
	// THE CONTENTS: the web page's own entries, nested by their levels; the first page when there are none
	const listed = meta.nav.filter((e) => home.has(e.id));
	const tpEntry: WsEpubNav[] = tp ? [{ id: tp.id, label: title, level: 0 }] : [];
	const entries: WsEpubNav[] = (listed.length || tp) ? tpEntry.concat(listed) : [{ id: '', label: title, level: 0 }];
	const hrefOf = (e: WsEpubNav) => 'text/' + name(e.id ? (home.get(e.id) ?? 0) : 0) + (e.id ? '#' + e.id : '');
	const ol: string[] = [];
	let depth = 0;
	for (const e of entries) {
		const lv = Math.min(Math.max(1, e.level + 1), depth + 1);
		if (lv > depth) { ol.push('<ol>'); depth++; }
		else { ol.push('</li>'); while (depth > lv) { ol.push('</ol></li>'); depth--; } }
		ol.push('<li><a href="' + x(hrefOf(e)) + '">' + x(e.label) + '</a>');
	}
	ol.push('</li>');
	while (depth > 1) { ol.push('</ol></li>'); depth--; }
	ol.push('</ol>');
	const uid = 'urn:uuid:' + wsEpubUuid(title + '|' + (meta.author || ''));
	const ncx = '<?xml version="1.0" encoding="utf-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
		+ '<head><meta name="dtb:uid" content="' + x(uid) + '"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>\n'
		+ '<docTitle><text>' + x(title) + '</text></docTitle>\n<navMap>\n'
		+ entries.map((e, k) => '<navPoint id="np' + (k + 1) + '" playOrder="' + (k + 1) + '"><navLabel><text>' + x(e.label) + '</text></navLabel><content src="' + x(hrefOf(e)) + '"/></navPoint>').join('\n')
		+ '\n</navMap>\n</ncx>\n';
	const modified = (meta.modified || new Date().toISOString()).replace(/\.\d+Z$/, 'Z');
	const items = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
		'<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
		'<item id="css" href="style.css" media-type="text/css"/>']
		.concat(parts.map((_, i) => '<item id="p' + (i + 1) + '" href="text/' + name(i) + '" media-type="application/xhtml+xml"/>'))
		.concat(media.map((m, k) => '<item id="i' + (k + 1) + '" href="' + m.href + '" media-type="' + m.mime + '"/>'));
	const opf = '<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="' + x(lang) + '">\n'
		+ '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
		+ '<dc:identifier id="bookid">' + x(uid) + '</dc:identifier>\n'
		+ '<dc:title>' + x(title) + '</dc:title>\n'
		+ (meta.author ? '<dc:creator>' + x(meta.author) + '</dc:creator>\n' : '')
		+ '<dc:language>' + x(lang) + '</dc:language>\n'
		+ '<meta property="dcterms:modified">' + x(modified) + '</meta>\n'
		+ '</metadata>\n<manifest>\n' + items.join('\n') + '\n</manifest>\n'
		+ '<spine toc="ncx"' + (wsIsRtl(lang) ? ' page-progression-direction="rtl"' : '') + '>\n' + parts.map((_, i) => '<itemref idref="p' + (i + 1) + '"/>').join('\n') + '\n</spine>\n</package>\n';
	return wsZip(files.concat([
		{ name: 'OEBPS/content.opf', bytes: wsUtf8(opf) },
		{ name: 'OEBPS/nav.xhtml', bytes: wsUtf8(page(title, '<nav epub:type="toc" id="toc">\n<h1>' + x(meta.tocTitle || wsTIn(lang, 'Contents')) + '</h1>\n' + ol.join('') + '\n</nav>', 'style.css')) },
		{ name: 'OEBPS/toc.ncx', bytes: wsUtf8(ncx) },
		{ name: 'OEBPS/style.css', bytes: wsUtf8(wsEpubCss(meta)) },
	], texts, media.map((m) => ({ name: 'OEBPS/' + m.href, bytes: m.bytes }))));
}

// ── THE E-BOOK, CHECKED AFTER IT IS BUILT (A654, the writer's pick 10) ─────────────
//
// What a store's checker refuses first, read back from the bytes the export is about to write: the mimetype
// first, stored and right; the package the container names; every file the manifest lists, in the book, and no
// manifest id twice; every reading-order entry in the manifest; one contents page; every page well-formed XHTML
// with no id twice; every contents link (nav and toc.ncx) landing on a page and an id that are there. A list of
// what is wrong, in words; empty, the book holds. A stored zip only, which is what wsZip writes.
export function wsEpubCheck(bytes: Uint8Array): string[] {
	const out: string[] = [];
	const dec = new TextDecoder();
	const files = new Map<string, Uint8Array>();
	const order: { name: string; method: number }[] = [];
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let i = 0;
	while (i + 30 <= bytes.length && dv.getUint32(i, true) === 0x04034b50) {
		const method = dv.getUint16(i + 8, true), size = dv.getUint32(i + 18, true), nlen = dv.getUint16(i + 26, true), xlen = dv.getUint16(i + 28, true);
		const name = dec.decode(bytes.subarray(i + 30, i + 30 + nlen));
		const start = i + 30 + nlen + xlen;
		files.set(name, bytes.subarray(start, start + size));
		order.push({ name, method });
		i = start + size;
	}
	const text = (n: string) => { const b = files.get(n); return b ? dec.decode(b) : null; };
	const xml = (n: string) => {
		const t = text(n);
		if (t == null) return null;
		const d = new DOMParser().parseFromString(t, 'application/xml');
		return d.getElementsByTagName('parsererror').length ? null : d;
	};
	// IN THE INTERFACE'S LANGUAGE (A695): the first of these is the Export pane's notice, which alone reads them;
	// a file's, an id's and a format's own names are filled in as they are
	if (!order.length || order[0].name !== 'mimetype' || order[0].method !== 0 || text('mimetype') !== 'application/epub+zip') out.push(wsT('the mimetype is not first, stored and "{type}"', { type: 'application/epub+zip' }));
	const cont = xml('META-INF/container.xml');
	const rf = cont ? cont.getElementsByTagName('rootfile')[0] : null;
	const opfPath = (rf && rf.getAttribute('full-path')) || '';
	const opf = opfPath ? xml(opfPath) : null;
	if (!opf) { out.push(opfPath ? wsT('the package ({file}) is missing or not well formed', { file: opfPath }) : wsT('the package (none named) is missing or not well formed')); return out; }
	const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
	const ids = new Set<string>();
	let nav = '';
	for (const it of Array.from(opf.getElementsByTagName('item'))) {
		const id = it.getAttribute('id') || '', href = it.getAttribute('href') || '';
		if (ids.has(id)) out.push(wsT('the manifest lists "{id}" twice', { id }));
		ids.add(id);
		if (!files.has(base + href)) out.push(wsT('the manifest lists {file}, which is not in the book', { file: href }));
		if (/(^|\s)nav(\s|$)/.test(it.getAttribute('properties') || '')) nav = nav ? '\u0000' : base + href;
	}
	if (!nav || nav === '\u0000') out.push(nav ? wsT('more than one contents page') : wsT('no contents page'));
	for (const ref of Array.from(opf.getElementsByTagName('itemref'))) {
		const idref = ref.getAttribute('idref') || '';
		if (!ids.has(idref)) out.push(wsT('the reading order names "{id}", which the manifest lacks', { id: idref }));
	}
	// every page well formed, no id twice in it
	const idsIn = new Map<string, Set<string>>();
	for (const name of Array.from(files.keys())) {
		if (!/\.xhtml$/.test(name)) continue;
		const d = xml(name);
		if (!d) { out.push(wsT('{file} is not well-formed XHTML', { file: name.slice(base.length) })); continue; }
		const seen = new Set<string>();
		for (const el of Array.from(d.getElementsByTagName('*'))) {
			const id = el.getAttribute('id');
			if (!id) continue;
			if (seen.has(id)) out.push(wsT('{file} has the id "{id}" twice', { file: name.slice(base.length), id }));
			seen.add(id);
		}
		idsIn.set(name, seen);
	}
	// every contents link lands on a page and an id that are there
	const land = (from: string, href: string) => {
		const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
		const [file, frag] = href.split('#');
		const full = dir + file;
		const there = idsIn.get(full);
		if (!there) out.push(wsT('the contents link to {link}, a page not in the book', { link: href }));
		else if (frag && !there.has(frag)) out.push(wsT('the contents link to {link}, an id not there', { link: href }));
	};
	const navDoc = nav && nav !== '\u0000' ? xml(nav) : null;
	if (navDoc) for (const a of Array.from(navDoc.getElementsByTagName('a'))) land(nav, a.getAttribute('href') || '');
	const ncxItem = Array.from(opf.getElementsByTagName('item')).find((it) => it.getAttribute('media-type') === 'application/x-dtbncx+xml');
	const ncxPath = ncxItem ? base + (ncxItem.getAttribute('href') || '') : '';
	const ncx = ncxPath ? xml(ncxPath) : null;
	if (ncx) for (const c of Array.from(ncx.getElementsByTagName('content'))) land(ncxPath, c.getAttribute('src') || '');
	return out;
}

// A MANUSCRIPT'S WORD COUNT IS ROUNDED, and saying "about 52,437 words"
// is a small tell that a machine wrote the title page: nobody counts a
// novel to the word, and the figure is there to tell an editor what shape
// of book has arrived. The convention is a coarser round as the book gets
// longer — a hundred for a short story, where five hundred either way is a
// third of it; a thousand for a novel, where it is noise.
export function wsRoundWords(n: number) {
	const w = Math.max(0, Math.round(Number(n) || 0));
	if (w < 100) return w;                                    // too short to round
	if (w < 1500) return Math.round(w / 100) * 100;
	if (w < 10000) return Math.round(w / 500) * 500;
	return Math.round(w / 1000) * 1000;
}

// ── SHOULD THE NARROW CLASS FLIP? ─────────────────────────────
//
// The Organizer's width watcher observes the window root and writes a
// class ON the window root, and `is-narrow` changes that element's own
// layout — one pane instead of two, the name column capped. **An
// observer must not write what it watches**: measure → write →
// re-measure spins whenever the write moves the width back across the
// threshold, which is a question about scrollbars, fonts and device
// pixels rather than about this code — it settles on one machine and
// freezes on another.
//
// SO THE DECISION IS PURE AND THE OBSERVER IS THE PLUMBING. A hostile
// width sequence can be fed to this directly, in plain node, and the
// answer is the shipped one rather than a copy of it. `state` IS
// MUTATED, deliberately: the budget has to remember across calls, and
// threading it back through a return value would let a caller forget to
// store it — which is the one mistake that turns the budget off.
export type WsNarrowPick = { act: 'skip'; want?: boolean } | { act: 'flip'; want: boolean } | { act: 'stop'; want: boolean; width: number; limit: number };
export function wsNarrowDecide(state: WsNarrowState, w: number, lim: number, now: number): WsNarrowPick {
	if (!w) return { act: 'skip' };
	// GUARD 1 — A DEAD BAND. It goes narrow AT the limit and wide again only
	// well above it, so no single width can be on both sides of the answer.
	// 24px is wider than any scrollbar this has to survive.
	const want = (state.isNarrow === true) ? (w < lim + 24) : (w < lim);
	// GUARD 2 — NEVER WRITE AN ANSWER THAT HAS NOT CHANGED. A write that
	// changes nothing still costs a style recalculation, and it is the write
	// that feeds the next notification.
	if (want === state.isNarrow) return { act: 'skip', want: want };
	// GUARD 3 — A FLIP BUDGET. If the class still manages to move the width
	// past the dead band, stop answering rather than spin. **A HANG BECOMES
	// A WRONG WIDTH**, and a wrong width is something a writer can report; a
	// frozen app is not.
	if (now - state.flipWindow > 1000) { state.flipWindow = now; state.flips = 0; }
	if (++state.flips > WS_NARROW_FLIPS) {
		return { act: 'stop', want: want, width: w, limit: lim };
	}
	state.isNarrow = want;
	return { act: 'flip', want: want };
}
// ── IS THE EXPLORER PAINTER IN A STORM? ─────────────────────────────
//
// `attachExplorerObserver` watches the file-explorer subtree and
// `patchExplorerDOM` writes into it. Our own writes are filtered out (see
// `explorerRecordsMatter`), but the loop Obsidian can close for us is
// not ours to filter: our badges change a row's height, the explorer's
// VIRTUAL SCROLLER re-renders rows to suit, that is Obsidian removing
// and adding nodes, we repaint, heights change again. That fight only
// exists when the tree scrolls — a small screen with a big vault.
//
// A GUARD, NOT A CURE: a freeze becomes a missing decoration and a
// sentence on screen, and a writer can report a sentence; a frozen
// Obsidian cannot even have its console opened. THE WINDOW IS
// DELIBERATELY LONG: a writer flicking through a big tree makes bursts,
// and a burst is not a storm; three seconds of nearly every frame is
// not something a hand does. Firing early would make badges vanish
// during a scroll.
export function wsPassStorm(state: { marks: number[] }, now: number) {
	state.marks.push(now);
	while (state.marks.length && now - state.marks[0] > WS_STORM_MS) state.marks.shift();
	return state.marks.length > WS_STORM_PASSES;
}
export function wsPassState(): { marks: number[] } { return { marks: [] }; }
// ── SOON, AND NOT ON A FRAME ────────────────────────
//
// AN OCCLUDED ELECTRON WINDOW THROTTLES `requestAnimationFrame` TO
// NOTHING; a zero-millisecond timeout still runs. Anything that must
// paint whether or not the window is on screen asks for this one. NOT A
// GENERAL REPLACEMENT: an animation SHOULD stop while nobody is looking,
// and those keep their frames.
export function wsSoon(fn: () => void) {
	// window's timer, never the bare global (a pop-out's work belongs to its
	// window); a fixture with no window at all runs the work now.
	try { return window.setTimeout(fn, 0); }
	catch { fn(); return 0; }
}
export const WS_STORM_MS = 3000;
// A PEEK (A578): how long the pointer rests on the window's edge before a pane
// slides out (a sweep across the edge opens nothing), and how long it may be
// away from an open pane before the pane goes.
export const WS_PEEK_DWELL_MS = 180;
// how far in from the window's edge the pointer opens a pane (A588: three pixels
// was a target a hand missed; the writer asked for "more room")
export const WS_PEEK_EDGE_PX = 12;
export const WS_PEEK_LEAVE_MS = 350;
// 150 passes in three seconds is fifty a second sustained — past what a
// scroll produces and short of nothing.
export const WS_STORM_PASSES = 150;

// ── ONE THROW MUST NOT TAKE A FEATURE — OR A NEIGHBOUR — WITH IT ──────
//
// Obsidian fires an event by walking a plain list of callbacks. A throw
// in ours does not stop at us: it stops the WALK, so every handler
// registered after ours — other plugins' — never runs for that event.
// The same shape applies to a DOM listener on `document`: the throw is
// reported and the listener survives, but everything our own handler
// meant to do after the failing line is silently skipped, for ever, with
// no mark on screen.
//
// IT REPORTS. A guard that swallows quietly is worse than the throw it
// caught, so: one console line per SITE (not per fire — a handler that
// throws on mousemove would fill the console in a second), and one
// Notice per session, for the writer who cannot open a console.
export const WS_GUARD_SEEN = new Set<string>();
export let WS_GUARD_TOLD = false;
// SET BY THE PLUGIN, not imported: this file also loads in plain node,
// where `Notice` does not exist.
export let WS_GUARD_TELL: ((where: string, err: unknown) => void) | null = null;
export function wsGuardTell(fn: (where: string, err: unknown) => void) { WS_GUARD_TELL = fn; }
// For a test, and for a second plugin instance in the same process:
// without this the "once per site" memory carries between them.
export function wsGuardReset() { WS_GUARD_SEEN.clear(); WS_GUARD_TOLD = false; }
export function wsGuardSeen() { return Array.from(WS_GUARD_SEEN); }
export function wsGuardReport(where: string, err: unknown) {
	const first = !WS_GUARD_SEEN.has(where);
	if (first) {
		WS_GUARD_SEEN.add(where);
		try {
			console.error('Word-Smith: ' + where
				+ ' threw and was contained; the rest of it did not run.', err);
		} catch (_) { wsCatch('wsGuardReport: console.error(\'Word-Smith: \' + where', _); }
	}
	if (!WS_GUARD_TOLD && WS_GUARD_TELL) {
		WS_GUARD_TOLD = true;
		try { WS_GUARD_TELL(where, err); } catch (_) { wsCatch('wsGuardReport: WS_GUARD_TELL(where, err);', _); }
	}
	return first;
}
export const wsBag = (o: object): Record<string, unknown> => o as Record<string, unknown>;
// A folder by its shape, not its class: a vault folder has `children` where a
// note has none, and the fixtures build plain objects of the same shape.
export const wsIsFolder = (f: TAbstractFile | null | undefined): f is TFolder => !!f && Array.isArray((f as { children?: unknown }).children);
// and a note the same way: a path with no children
export const wsIsFile = (f: TAbstractFile | null | undefined): f is TFile => !!f && !Array.isArray((f as { children?: unknown }).children);
// a note's stat, read by shape for the same reason (a folder has none)
export const wsStatOf = (f: TAbstractFile | null | undefined): FileStats | null => (f && (f as { stat?: FileStats }).stat) || null;
// AN EVENT'S TARGET AS A NODE, or null. Not `instanceof Node`: a popout
// window's nodes are another realm's, and the test would refuse them — the
// one assertion here rides a duck test every realm answers.
export function wsNodeOf(t: EventTarget | null | undefined): Node | null {
	return (t && typeof (t as Node).nodeType === 'number') ? (t as Node) : null;
}
// A TASK TALLY out of a raw reading, or null: the index writes `{ all, done }`
// for a note with boxes and nothing for one without.
export function wsTasksOf(v: unknown): { all: number; done: number } | null {
	if (!v || typeof v !== 'object') return null;
	const o = v as { all?: unknown; done?: unknown };
	return { all: Number(o.all) || 0, done: Number(o.done) || 0 };
}
// A LIST out of a raw reading: the list itself, a single value as one, nothing as none.
export function wsListOf(v: unknown): unknown[] {
	if (v === null || v === undefined || v === '') return [];
	return Array.isArray(v) ? v : [v];
}
// …AND AS AN ELEMENT, or null: by `nodeType`, which every realm's element
// answers 1 to, where `instanceof Element` (and a global a window may not
// have) would not.
export function wsElOf(t: EventTarget | null | undefined): Element | null {
	const n = wsNodeOf(t);
	return n && n.nodeType === 1 ? (n as Element) : null;
}
// THE VIM API, or null: whatever a route answered, if it maps and unmaps.
export function wsVimOf(v: unknown): WsVimApi | null {
	const o = v as { map?: unknown; unmap?: unknown } | null;
	return (o && typeof o.map === 'function' && typeof o.unmap === 'function') ? (v as WsVimApi) : null;
}
// A THROWN THING'S MESSAGE: an Error's, or the thing as text.
export function wsErrMsg(e: unknown): string {
	return (e instanceof Error && e.message) ? e.message : wsStr(e);
}
export function wsStr(v: unknown): string {
	if (v == null) return '';
	if (typeof v === 'string') return v;
	if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return ''; } }
	if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
	return typeof v === 'symbol' ? v.toString() : '';
}
export function wsKindOf(v: unknown) {
	if (v === null) return 'null';
	if (Array.isArray(v)) return 'array';
	return typeof v;
}
// ── REPAIR ON READ ────────────────────────────────────────────────
//
// data.json is a file a writer can edit, a sync can half-write, and an
// older build can leave a different shape in. `Object.assign` would put
// whatever it held over the defaults, so a string where a number belongs,
// or null where an object does, would reach every reader that trusts the
// default's shape. THE DEFAULTS ARE THE SCHEMA: one writer of the shape,
// no second table to keep in step. A key whose default is null or
// undefined accepts anything; a key not in the defaults is not this
// function's business.
//
// STRICT ON PURPOSE: `"15"` for a font size is reset, not coerced. A
// coercion is a second opinion about what the writer meant, and the
// default is the one value every reader already copes with.
export function wsRepairSettings(live: WordSmithSettings, base: WordSmithSettings) {
	const settings = wsBag(live), defaults = wsBag(base);
	const repaired: string[] = [];
	for (const k of Object.keys(defaults)) {
		const want = wsKindOf(defaults[k]);
		if (want === 'null' || want === 'undefined') continue;
		let bad = wsKindOf(settings[k]) !== want;
		if (!bad && want === 'number' && !isFinite(settings[k] as number)) bad = true;
		if (!bad) continue;
		// A COPY, never the default itself: install_probe holds that no two
		// plugins share a default by reference, and a repaired key is no
		// exception.
		const d = defaults[k];
		settings[k] = (want === 'array' || want === 'object') ? JSON.parse(JSON.stringify(d)) : d;
		repaired.push(k);
	}
	return repaired;
}

// ── A PARAGRAPH AND THE LINE IT CAME FROM ──────────────────────
//
// The reader shows prose the export rendered; the note holds the same prose
// as markdown. To put the caret where the writer clicked, the paragraph's
// opening words are looked for in the note with the markup read past:
// hashes, emphasis, a link's text without its target, a quote's chevron.
// The FIRST line that reads the same wins — a repeated line goes to its
// first appearance, which is where a reader would look too.
export function wsSnippetOf(text: string | null | undefined) {
	return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
export function wsPlainLine(line: string) {
	const s = String(line || '').replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '');
	return wsReplaceToLast(s, ')', /!?\[([^[\]]*)\]\([^)]*\)/g, '$1')
		// (the shown text only after a "|": two runs that could take the same letters tried every split of a line
		// with an unclosed [[, 0.4 s for 26 KB; A877)
		.replace(/\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]/g, (m: string, a: string, b: string | undefined) => b || a)
		.replace(/[*_~`]+/g, '')
		.replace(/\s+/g, ' ').trim();
}
export function wsLineOfSnippet(md: string, snippet: string | null | undefined) {
	const want = wsSnippetOf(snippet);
	if (!want) return -1;
	const head = want.slice(0, 24);
	const lines = String(md || '').split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const plain = wsPlainLine(lines[i]);
		if (!plain) continue;
		if (plain === want || plain.indexOf(head) === 0) return i;
	}
	return -1;
}

// ── THE SWALLOWED CATCH, NAMED ───────────────────────────────────
//
// A `catch (_) {}` is a place where a throw dies without a mark: the
// rest of the try did not run, and nobody was told. Every catch site
// reads `catch (_) { wsCatch(where, _); }` — the method, the closure,
// the first statement of the try — so a console line can say what did
// not finish.
//
// NOT THE GUARD'S NOTICE. Most of these sites expect to throw now and
// then — a file that is not there, an API an older Obsidian lacks, a
// listener already removed — and a Notice on every start for a battery
// file that does not exist would be the noise a writer switches the
// plugin off over. So: the console, ONCE per site per session, and the
// count; the diagnostics carry the list, so a report can quote it. At DEBUG
// level (the plugin guidelines: "the developer console should only show
// error messages"): hidden unless the console's Verbose level is on.
export const WS_CATCH_SEEN = new Map<string, { n: number; last: string }>();
// `where` IS A SENTENCE THE WRITER COULD READ, not an internal name. It ends
// up in a Notice, and “wsOrgTick” tells them nothing about what stopped.
export function wsCatch(where: string, err: unknown) {
	const rec = WS_CATCH_SEEN.get(where);
	const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : (err ? JSON.stringify(err) : ''));
	if (rec) { rec.n++; rec.last = msg; return false; }
	WS_CATCH_SEEN.set(where, { n: 1, last: msg });
	try { console.debug('Word-Smith: ' + where + ' threw and was contained: ' + msg); } catch { /* ws:keep */ }
	return true;
}
export function wsCatchSeen() {
	return Array.from(WS_CATCH_SEEN, ([where, r]) => ({ where, n: r.n, last: r.last }));
}
export function wsCatchReset() { WS_CATCH_SEEN.clear(); }

// THE SLOWEST NOTE READINGS THIS SESSION (the writer's pick for "Copy diagnostics for a bug report": #86 took a week of
// messages because nothing in the report named the note that was slow). Every place that reads a whole note times the
// reading, and the slowest few are kept, one entry a note at its worst, with what makes a note heavy: its size and its
// longest line. Memory only, never written anywhere; the diagnostics are the one reader.
export type WsSlowRead = { path: string; ms: number; size: number; longest: number; by: string };
export const WS_SLOW_READS_KEPT = 8;
const WS_SLOW_READS = new Map<string, WsSlowRead>();
export function wsTimedRead<T>(path: string, by: string, text: string, fn: () => T): T {
	const t0 = performance.now();
	try { return fn(); } finally {
		const ms = performance.now() - t0;
		const had = path ? WS_SLOW_READS.get(path) : undefined;
		if (path && (!had || ms > had.ms)) {
			const s = String(text || '');
			let longest = 0, at = 0;
			while (at <= s.length) {
				let nl = s.indexOf('\n', at);
				if (nl < 0) nl = s.length;
				if (nl - at > longest) longest = nl - at;
				at = nl + 1;
			}
			WS_SLOW_READS.set(path, { path, ms, size: s.length, longest, by });
			if (WS_SLOW_READS.size > WS_SLOW_READS_KEPT) {
				let least: WsSlowRead | null = null;
				for (const r of WS_SLOW_READS.values()) if (!least || r.ms < least.ms) least = r;
				if (least) WS_SLOW_READS.delete(least.path);
			}
		}
	}
}
export function wsSlowReads(): WsSlowRead[] { return Array.from(WS_SLOW_READS.values()).sort((a, b) => b.ms - a.ms); }
export function wsSlowReadsReset() { WS_SLOW_READS.clear(); }

// WHAT HANGS BELOW THE NAVBAR. On a phone Obsidian draws `.mobile-navbar`
// over the foot of a leaf that runs the full screen; a raised one is
// 80px where a plain one is 48 and its own views are padded for the
// plain one. Measured, not guessed: the element's bottom against the
// navbar's top, in pixels, or 0 where there is no navbar.
export function wsNavbarOverlap(el: HTMLElement) {
	const nav = document.querySelector('.mobile-navbar');
	if (!nav || !el) return 0;
	const n = nav.getBoundingClientRect(), b = el.getBoundingClientRect();
	if (!(n.height > 0) || !(b.height > 0)) return 0;
	return Math.max(0, Math.round(b.bottom - n.top));
}

// A PATH THE WRITER TYPED, in the vault's own spelling. Obsidian's
// `normalizePath` trims, turns backslashes round, folds `//`, strips the
// ends' slashes and NFC-normalises — and answers '/' for nothing, which
// every caller here wants as '' so its default can apply. A stub may not
// carry it; the fallback does the first four by hand. The vault knows a
// file under ONE exact string and answers null for every other spelling,
// so a pasted `Word-Smith\ws-structure.md` would be "not found" and a
// second store could be made beside the first. Normalising can only find
// MORE, never move a store: a file that exists is already at its
// normalised path.
//
// ── THE SAME TEXT IN OTHER LINE ENDINGS IS THE SAME TEXT ──
//
// Obsidian's `vault.process` writes nothing when the callback hands back
// the very string it was given. An editor or a sync client that saves
// CRLF turns every `\n` the plugin wrote into `\r\n`, the plugin
// composes `\n` again, and the two never agree — so every save would
// rewrite the file and every sync carry it. This is the compare the
// store writers make before handing `process` a new text: equal but for
// `\r`, and the file is left exactly as it is.
export function wsTextSameEol(a: string, b: string) {
	const norm = (t: string | null | undefined) => String(t == null ? '' : t).replace(/\r\n?/g, '\n');
	return norm(a) === norm(b);
}
// ── A CONTEXT IS LENT A MODULE'S MEMBERS BY NAME ────────────
//
// The Organizer's table is handed a context of ninety names by the
// window that opens it, most of them members of the modules the window
// is built from — a function, or a live `let` the module returns as a
// getter and a setter. This lends them: a getter each, reading the
// module when asked (so a live let is read when it is read, not when it
// is lent), and a setter wherever the module has one, so a write through
// the context lands where the let lives.
//
// IT REFUSES A NAME THE MODULE DOES NOT HAVE, at open time, loudly — a
// misspelt accessor would hand the table `undefined`, and the table
// would read it without complaint. AND THE CHECKER KNOWS WHAT WAS LENT:
// `.lend(mod, names)` takes the names as keys OF THE MODULE and answers
// a bag whose type has them, so the bag is checked member by member
// against the declared context (org-ctx.ts).
export function wsCtxLend<T extends object>(into: T) {
	return {
		lend<M extends object, K extends keyof M & string>(mod: M, names: K[]) {
			for (const n of names) {
				const d = Object.getOwnPropertyDescriptor(mod, n);
				if (!d) throw new Error('wsCtxLend: the module has no `' + n + '` to lend');
				const desc: PropertyDescriptor = { enumerable: true, configurable: true, get: () => mod[n] };
				if (d.set) desc.set = (v: M[K]) => { mod[n] = v; };
				Object.defineProperty(into, n, desc);
			}
			return wsCtxLend(into as T & Pick<M, K>);
		},
		bag: () => into,
	};
}
export function wsPathNorm(p: string) {
	const s = String(p == null ? '' : p);
	let out = '';
	if (typeof normalizePath === 'function') {
		try { out = String(normalizePath(s)); } catch (_) { wsCatch('wsPathNorm: out = String(normalizePath(s));', _); out = ''; }
	}
	if (!out) out = s.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
	return out === '/' ? '' : out;
}

// A MENU ON A PHONE IS A SHEET AT THE BOTTOM OF THE BODY. `.is-phone
// .menu { position: absolute; bottom: 0 }` puts every Obsidian menu at
// the screen's foot, under the raised navbar that covers the last 80px;
// the pane root's stamp cannot reach an element on the body. So the
// sheet is marked once it is shown and the body carries the bar's
// height, measured then — the bar is raised or plain, and the keyboard
// comes and goes — and the sheet sits on it. Every menu the Organizer
// opens comes from `wsMenu()`, which is `new Menu()` with the lift
// behind its two show doors.
//
// THE LAST SHEET, MEASURED 300ms AFTER IT WAS SHOWN. A menu is gone by
// the time the palette runs "Copy diagnostics", so the record is taken
// when the menu is drawn and printed later: every row, the rows without
// a box, the rows with something ELSE under a finger at their middle
// (elementFromPoint — a navbar painted over the sheet counts here), the
// sheet's rect and computed bottom, the body's stamp, the navbar.
export let WS_LAST_SHEET: string | null = null;
// STORED TOO: Android drops the app when the writer switches to a chat
// and back, so an in-memory record never reaches a report. localStorage
// is per vault per device and survives that; the same door the start
// guard uses.
export const WS_SHEET_KEY = 'word-smith:last-sheet';
export function wsLocalStore() {
	try { return window.localStorage || null; } catch { return null; }
}
export function wsSheetRecord(dom: Element, phone: boolean, store: boolean) {
	try {
		const R = (r: DOMRect) => Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
		const items = Array.from<HTMLElement>(dom.querySelectorAll('.menu-item'));
		const efp = typeof document.elementFromPoint === 'function' ? (x: number, y: number) => document.elementFromPoint(x, y) : null;
		let hidden = 0, covered = 0, over = '';
		for (const it of items) {
			const r = it.getBoundingClientRect();
			if (!(r.width > 0 && r.height > 0)) { hidden++; continue; }
			if (!efp) continue;
			const top = efp(r.left + r.width / 2, r.top + r.height / 2);
			if (top && (top === it || it.contains(top))) continue;
			covered++;
			if (!over) over = top ? String(top.tagName).toLowerCase() + '.' + String(top.className || '').split(' ').slice(0, 2).join('.') : 'nothing';
		}
		const a = dom.getBoundingClientRect();
		const cs = getComputedStyle(dom);
		const nav = document.querySelector('.mobile-navbar');
		const n = nav ? nav.getBoundingClientRect() : null;
		const sc = dom.querySelector('.menu-scroll');
		const d = new Date();
		const line = [d.toTimeString().slice(0, 8), 'phone ' + (phone ? 'yes' : 'no'),
			'items ' + items.length, 'hidden ' + hidden, 'covered ' + covered + (over ? ' by ' + over : ''),
			'rect ' + R(a), 'bottom ' + Math.round(a.bottom),
			'css bottom ' + cs.bottom + ' z ' + cs.zIndex + ' pos ' + cs.position + ' class "' + dom.className + '"',
			'body var ' + (document.body.style.getPropertyValue('--ws-mobilebar-h') || 'none'), 'innerH ' + window.innerHeight,
			'navbar ' + ((nav && n) ? R(n) + ' z ' + getComputedStyle(nav).zIndex : 'none'),
			'scroll ' + (sc ? sc.scrollHeight + '/' + sc.clientHeight : '-')].join(' ');
		if (store !== false) {
			WS_LAST_SHEET = line;
			const ls = wsLocalStore();
			if (ls) ls.setItem(WS_SHEET_KEY, line);
		}
		return line;
	} catch (_) { wsCatch('wsSheetRecord: const items = Array.from(dom.querySelectorAll(.menu-item));', _); }
	return 'could not be read';
}
export function wsLastSheet() {
	if (WS_LAST_SHEET) return WS_LAST_SHEET;
	const ls = wsLocalStore();
	const kept = ls ? ls.getItem(WS_SHEET_KEY) : null;
	return kept ? 'none this session; kept from an earlier one: ' + kept : 'none this session';
}
// THE LAST KEYBOARD: a field focused in a pane on a phone, and 700ms
// later the geometry that a paste can carry — the leaf, the root, the
// body and its bar padding, the panel and its scroll, the field, the
// window and the visual viewport, Obsidian's --keyboard-height, the bar.
// Kept like the sheet: the app restarts between the look and the command.
export const WS_KB_KEY = 'word-smith:last-keyboard';
export let WS_LAST_KEYBOARD: string | null = null;
export function wsKeyboardRecord(root: HTMLElement) {
	try {
		const R = (el: Element | null) => { if (!el) return 'none'; const r = el.getBoundingClientRect(); return Math.round(r.top) + '..' + Math.round(r.bottom) + ' (' + Math.round(r.height) + ')'; };
		const q = (sel: string) => root.querySelector(sel);
		const leaf = root.closest ? root.closest('.workspace-leaf-content') : null;
		const body = q('.ws-uni-body'), panel = q('.ws-uni-panel');
		const act = document.activeElement;
		const vv = window.visualViewport;
		const d = new Date();
		const line = [d.toTimeString().slice(0, 8), 'leaf ' + R(leaf), 'root ' + R(root),
			'body ' + R(body) + (body ? ' pad ' + getComputedStyle(body).paddingBottom : ''),
			'panel ' + R(panel) + (panel ? ' scroll ' + panel.scrollHeight + '/' + panel.clientHeight + '@' + panel.scrollTop : ''),
			'field ' + (act && root.contains(act) ? act.tagName.toLowerCase() + '.' + String(act.className || '').split(' ')[0] + ' ' + R(act) : 'none in the pane'),
			'innerH ' + window.innerHeight, 'visualH ' + (vv ? Math.round(vv.height) : '-'),
			'keyboard ' + (getComputedStyle(document.body).getPropertyValue('--keyboard-height').trim() || '-'),
			'navbar ' + R(document.querySelector('.mobile-navbar')),
			'chain ' + (() => { const out = []; let e = body; while (e && out.length < 6 && e !== document.body) { const c = getComputedStyle(e); out.push(String(e.className || e.tagName).split(' ')[0] + ':' + R(e) + ' h=' + c.height + ' ' + c.display + (c.flexGrow !== '0' ? ' grow=' + c.flexGrow : '') + (c.maxHeight !== 'none' ? ' max=' + c.maxHeight : '')); e = e.parentElement; } return out.join(' > '); })()].join(' ');
		WS_LAST_KEYBOARD = line;
		const ls = wsLocalStore();
		if (ls) ls.setItem(WS_KB_KEY, line);
	} catch (_) { wsCatch('wsKeyboardRecord: const leaf = root.closest(.workspace-leaf-content);', _); }
}
export function wsLastKeyboard() {
	if (WS_LAST_KEYBOARD) return WS_LAST_KEYBOARD;
	const ls = wsLocalStore();
	const kept = ls ? ls.getItem(WS_KB_KEY) : null;
	return kept ? 'none this session; kept from an earlier one: ' + kept : 'none this session';
}
export function wsSheetLift(menu: Menu) {
	try {
		const dom = menu && menu.dom;
		if (!dom || !dom.classList) return;
		const phone = !!(typeof Platform !== 'undefined' && Platform && Platform.isPhone);
		if (phone) {
			dom.classList.add('ws-sheet');
			const nav = document.querySelector('.mobile-navbar');
			const n = nav ? nav.getBoundingClientRect() : null;
			const h = n && n.height > 0 ? Math.max(0, Math.round(window.innerHeight - n.top)) : 0;
			if (h > 0) document.body.style.setProperty('--ws-mobilebar-h', h + 'px');
			else document.body.style.removeProperty('--ws-mobilebar-h');
		}
		// the diagnostics’ own test sheet is marked; it must not become the last REAL one
		window.setTimeout(() => wsSheetRecord(dom, phone, !(dom.dataset && dom.dataset.wsSelftest === '1')), 300);
	} catch (_) { wsCatch('wsSheetLift: dom.classList.add(ws-sheet);', _); }
}
// A MENU THE OPERATING SYSTEM DRAWS: Obsidian's "Native menus" (Settings →
// Appearance), on by default on a Mac. Such a menu shows each row's TEXT and
// nothing else, and a click reaches the row, never an element inside its
// title — so a row drawn from markup alone is a blank row that does nothing.
// Read from the menu itself, which carries the app's choice when it is made.
export function wsMenuIsNative(menu: unknown): boolean {
	try {
		if (!(typeof Platform !== 'undefined' && Platform && Platform.isDesktop)) return false;
		return !!(menu && (menu as { useNativeMenu?: unknown }).useNativeMenu === true);
	} catch { return false; }
}
// A WHEEL'S ZOOM STEPS (the Mac audit for issue #56, 2026-10-10). A mouse notch
// is one step. A trackpad's pinch, and two fingers with Ctrl or Cmd held,
// arrive as dozens of small events a gesture, and each took a whole step: one
// movement ran the zoom to its end. Small deltas now add up to a notch's worth
// before a step; a sideways swipe (no deltaY) is no step; a pause starts the
// count again. +1 is in (the wheel away from you, fingers apart), -1 out.
export interface WsWheelAcc { sum: number; at: number }
export function wsWheelStep(acc: WsWheelAcc, deltaY: number, now: number): number {
	if (now - acc.at > 300) acc.sum = 0;
	acc.at = now;
	if (Math.abs(deltaY) >= 50) { acc.sum = 0; return deltaY > 0 ? -1 : 1; }
	acc.sum += deltaY;
	if (Math.abs(acc.sum) < 100) return 0;
	const step = acc.sum > 0 ? -1 : 1;
	acc.sum = 0;
	return step;
}
export function wsMenu() {
	const m = new Menu();
	for (const k of ['showAtPosition', 'showAtMouseEvent'] as const) {
		const f: unknown = (m as unknown as Record<string, unknown>)[k];
		if (typeof f !== 'function') continue;
		const show = f as (...args: unknown[]) => unknown;
		(m as unknown as Record<string, unknown>)[k] = function (...args: unknown[]) { const r = show.apply(m, args); wsSheetLift(m); return r === undefined ? m : r; };
	}
	return m;
}

// THE SCOPE A CONTEXT HOLDS. The Export tab hands its context `scope:
// () => exportScope()`; an older caller hands a string. A reader that
// does `String(ctx.scope)` prints the function. One reader, which asks a
// function and takes a string as it is.
export function wsCtxScope(ctx: { scope?: unknown } | null | undefined) {
	try {
		const s = ctx && ctx.scope;
		return wsStr((typeof s === 'function' ? (s as () => unknown)() : s) || '');
	} catch { return ''; }
}

export function wsGuard<F extends (...args: never[]) => unknown>(fn: F, where: string): F {
	if (typeof fn !== 'function') return fn;
	const call = fn as (...args: unknown[]) => unknown;
	return function (this: unknown, ...args: unknown[]): unknown {
		try {
			const out = call.apply(this, args);
			// AN ASYNC HANDLER THROWS LATER, into nothing. `try` never sees a
			// rejected promise, and an unhandled rejection is exactly the
			// silent failure this exists to end — so the promise is caught as
			// well as the call. Duck-typed rather than `instanceof Promise`,
			// because a handler may return any thenable.
			if (out && typeof (out as PromiseLike<unknown>).then === 'function') {
				const pending = out as PromiseLike<unknown>;
				return (async () => {
					try { return await pending; } catch (err) { wsGuardReport(where, err); return undefined; }
				})();
			}
			return out;
		} catch (err) {
			wsGuardReport(where, err);
			return undefined;
		}
	} as F;
}

// EIGHT FLIPS A SECOND. A writer dragging a pane edge crosses the threshold
// once, twice if they wobble; eight is past anything a hand does and short
// of anything that would be felt as a freeze.
export const WS_NARROW_FLIPS = 8;
// A FRESH BUDGET. `isNarrow` starts NULL rather than false: the first
// measurement must be able to flip in either direction, and `false` would
// make a window that opens narrow skip its own first answer.
export interface WsNarrowState { isNarrow: boolean | null; flips: number; flipWindow: number }
export function wsNarrowState(): WsNarrowState { return { isNarrow: null, flips: 0, flipWindow: 0 }; }

// ── WHAT NEVER REACHES THE DISK ────────────────────────────────────
//
// A choice about the MANUSCRIPT persists — the selected folder, targets,
// flags, the column set, the tree order, the ticks. A choice about the
// VIEW lasts the session. These three are view.
//
// NOT MOVED TO ANOTHER OBJECT, which is the design that keeps this
// small: they go on living on `this.settings`, so every reader is
// untouched. What changes is only that the SAVE strips them and the
// LOAD drops them — the one place where "does this reach the disk" is
// decided, rather than a rule restated at every writer. AND THE LOAD
// DROPS THEM TOO, not just the save: a `data.json` written by an older
// build still carries all three, and honouring those would be the old
// behaviour surviving the change that removed it.
export const WS_SESSION_KEYS = ['historyView', 'historySeries', 'historyCalMetric'];

// ── TODAY'S RECORDS STAY OUT OF THE VAULT'S SETTINGS COPY (A879) ─────────────
//
// Kept in data.json for the day, and never written into ws-settings.md: each changes all day long, and none is worth
// anything after a reinstall, when its day has passed. {dailytarget}'s record, {wpm}'s, {target}'s.
export const WS_MIRROR_DAY_KEYS = ['dailyWords', 'wpmDay', 'goalDay'];

// ── AND THE WINDOW'S OWN VIEW, SAME RULE ───────────────────────────
//
// HELD ON THE PLUGIN INSTANCE and never written anywhere, so a restart,
// a reload and a disable/enable cycle each give a fresh window for
// free. There is nothing to migrate, nothing to validate on read, and
// no key in `data.json` to go stale. NOT BY HIDING THE MODAL'S DOM,
// which is the cheaper-looking answer and an orphan: a hidden table goes
// on taking index events, holds a focus trap, and answers with a stale
// build after a deploy.
export interface WsSession {
	tab: string | null; cursor: string | null; lens: { sort: WsLensSort | null; chips: WsLensChip[] } | null; panel: boolean | null;
	scroll: number; folder: string | null; treeShown: boolean; zoom: number;
	// the Organizer's root row folded shut: a way of looking, so the session's
	// and never saved (a table that reopened on its root row alone would read
	// as an empty folder)
	rootShut?: boolean;
	// the export reader's place: flowing or paged, its zoom, its scroll, the paragraph at the top
	flow?: boolean; flowZoom?: number; flowScroll?: number; flowTop?: { idx: number; off: number } | null;
}
export function wsSessionNew(): WsSession {
	return {
		tab: null,        // which of the three was up
		cursor: null,     // the key of the cursor row, not the row
		lens: null,       // { sort, chips } — the arrangement, not the data
		panel: null,      // narrow window: was the panel showing?
		scroll: 0,        // the table's scroll position
		// THE READER. Expanded is a way of LOOKING at the manuscript, so it
		// lasts exactly as long as the other five: close the window and it is
		// still open, restart Obsidian and it is not.
		flow: false,
		// AND HOW THE READER WAS SET: the paged side has its page and its fit
		// as runtime fields; these are the reader's two, and they live here for
		// the same reason `flow` does. NONE CHOSEN (0) until the reader zooms (A804): the page's width fitted to the window
		flowZoom: 0,
		flowScroll: 0,
		// WHICH FOLDER THE PANE WAS ABOUT. `organizerFolder` persists this
		// across restarts; what the session adds is the answer to a different
		// question — has this window been opened AT ALL yet. `null` means not
		// since Obsidian started, and that is the one time the active note gets
		// to choose the folder.
		folder: null,
		// (`treeShown` is the one-column layout's flag: Obsidian's tree drives
		// the window.)
		treeShown: false,
		// CTRL + WHEEL ZOOM OF THE PANE: one number for the three panes, the
		// session's, like the reader's own zoom beside it.
		zoom: 1
	};
}
// ── THREE RULES, AND ALL THREE ARE “DROP IT, DO NOT GUESS” ────────────────
//
// A remembered view is a MEMORY, not an inventory — the same rule the
// export tick list already follows. The vault moves while the window is
// shut, and every one of these has a wrong answer that is worse than none:
// a cursor on a deleted note, a chip filtering a column nobody has any
// more, a sort by a column that was removed.
//
// PURE, so the cases that matter can be driven in plain node. Through a
// rendered window the only reachable case is the ordinary one.
// TWO NAMESPACES, NOT ONE, and the first draft of this used a `col` field
// that exists in neither. A SORT names a column by its `id`
// (`orgLensSet({ sort: { id: col.id, dir } })`); a property CHIP names one
// by its frontmatter `key`, case-insensitively, the way the column reader
// matches it. And a chip with an `axis` — flag, tag, task — is not tied to
// a user column at all and can never go stale that way.
export function wsSessionLens(lens: { chips?: unknown; sort?: WsLensSort | null } | null | undefined, colIds: string[], colKeys: string[]) {
	if (!lens || typeof lens !== 'object') return null;
	const ids = new Set(colIds || []);
	const keys = new Set((colKeys || []).map((k) => String(k).toLowerCase()));
	// A CHIP NAMING A COLUMN THAT IS GONE IS DROPPED — and the others are
	// KEPT. Dropping the whole lens because one chip died would throw away an
	// arrangement the writer built, over a column they removed on purpose.
	const chips = (Array.isArray(lens.chips) ? (lens.chips as WsLensChip[]) : []).filter((c) => {
		if (!c || typeof c !== 'object') return false;
		if (c.axis) return true;
		if (c.key === undefined || c.key === null) return false;
		return keys.has(String(c.key).toLowerCase());
	});
	// A SORT BY A MISSING COLUMN IS NOT A SORT. It cannot be applied and it
	// cannot be undone — a state with no door out of it.
	// THE NAME IS A SORT WITHOUT A COLUMN: its heading carries no id and it
	// is not in `cols`, so a lens sorted by name is validated against the
	// one id no table lacks.
	const sort = (lens.sort && lens.sort.id !== undefined
		&& (ids.has(lens.sort.id) || lens.sort.id === 'name'))
		? lens.sort : null;
	if (!sort && !chips.length) return null;
	return { sort: sort, chips: chips };
}
// A COPY WITHOUT THEM. `saveData` writes what it is handed, so the strip
// has to make a new object rather than delete from the live settings —
// deleting there would reset the writer’s chart mid-session, on a save
// caused by something else entirely.
export function wsForDisk(settings: WordSmithSettings) {
	const out = wsBag(Object.assign({}, settings || {}));
	for (const k of WS_SESSION_KEYS) delete out[k];
	return out;
}

// The reader's frame is born from this (`srcdoc`), so its document is in
// standards mode before the first page lands: a root swapped into an
// about:blank frame stays in quirks mode whatever doctype rides with it.
export const WS_FRAME_SHELL = '<!DOCTYPE html><html><head></head><body></body></html>';
// A LUCIDE GLYPH INTO AN ELEMENT, tried by name and CHECKED: `setIcon`
// with a name this build does not know leaves the element empty rather
// than throwing, so the names are tried in order, the one that drew is
// recorded on the element (`data-icon`), and the glyph is the fallback
// when none did.
// THE MODIFIER, NAMED AS THIS MACHINE NAMES IT. On a Mac, Ctrl-click is the
// right click (the browser sends a context menu and no click), so a sentence
// that says Ctrl-click sends a Mac writer to the wrong menu; Cmd is the Mac's
// gathering and shortcut key, and the code already takes either.
export function wsModKeyName(): string {
	try { return Platform && Platform.isMacOS ? 'Cmd' : 'Ctrl'; } catch { return 'Ctrl'; }
}
// THE FIRST OF SOME ICON NAMES THIS OBSIDIAN BUNDLES (A681): setIcon draws nothing for a name its Lucide
// lacks (letters is newer than 1.14.4's set), so the names are tried once on a detached element and the
// first that draws is kept; where none draws, or nothing can be probed, the last name stands
const WS_ICON_PICKED = new Map<string, string>();
export function wsIconPick(names: string[]): string {
	const key = names.join('|');
	const had = WS_ICON_PICKED.get(key);
	if (had !== undefined) return had;
	let got = names[names.length - 1] || '';
	try {
		const el = createDiv();
		for (const nm of names) {
			el.empty();
			try { setIcon(el, nm); } catch { /* an unknown name: the next is tried */ }
			if (el.childElementCount > 0) { got = nm; break; }
		}
	} catch { /* no document to probe in: the last name */ }
	WS_ICON_PICKED.set(key, got);
	return got;
}
export function wsIconInto(el: HTMLElement, names: string[], glyph: string): string {
	for (const nm of names) {
		el.textContent = '';
		try { setIcon(el, nm); } catch { /* an unknown name: the next is tried */ }
		if (el.childElementCount > 0) { el.dataset.icon = nm; return nm; }
	}
	el.dataset.icon = names[0] || '';
	el.setText(glyph);
	return '';
}
// A GLYPH AND ITS WORD in a button: the glyph in a span before the word,
// the word in a span of its own, so the button's text reads the word
// alone (an svg has none) and a stylesheet can size the glyph. The
// glyph's fallback is nothing: a build with no Lucide shows the word.
export function wsGlyphWord(b: HTMLElement, names: string[], word: string): void {
	b.empty();
	const ico = b.createSpan({ cls: 'ws-export-ico-in' });
	// THE EXPORT ARROW POINTS AWAY FROM THE PAGE here as everywhere else
	// (the menu, the tab strip, the bar's token) — stamped only when
	// `file-output` is the glyph that drew, never on a fallback shape.
	if (wsIconInto(ico, names, '') === 'file-output') ico.addClass('is-mirrored');
	b.createSpan({ cls: 'ws-export-word', text: word });
}
// ── WHICH TARGETS HAVE PAGES ───────────────────────────────────────────
//
// The Export pane hides typesetting where there are no pages, and the
// Structure group hides the page CHOICE for the same reason. Both need
// the fact, and neither can see the other's table — so it lives here,
// and `FORMATS` reads it too rather than restating it.
export function wsFormatHasPages(id: string) {
	return id === 'docx' || id === 'pdf' || id === 'html';
}

// HOW BIG A HEADING IS, ONCE, FOR BOTH READERS: 14 to every 12 of the text
// for levels 1-2, 13 to every 12 below, so a 12pt manuscript has 14pt and
// 13pt headings and a 24pt reading copy 28pt and 26pt. A MULTIPLE, not a
// fixed step over the text: two points over 24 is a heading nobody sees.
// `WsTitle` carries no `w:sz` at all: the title's own run sets its size
// (`wsTitleHalfPoints`). Both readers take the multiple: the docx turns it
// back into half-points, the stylesheet writes it as `em`.
export const WS_HEAD_EM_TOP = 14 / 12;
export const WS_HEAD_EM_SUB = 13 / 12;
export function wsHeadSizeEm(n: number) {
	return n <= 2 ? WS_HEAD_EM_TOP : WS_HEAD_EM_SUB;
}


// THE LINE ON THE TITLE PAGE, in one place because three targets print it
// and they had three copies of the same sentence.
//
// ROUNDED IS THE CONVENTION and stays the default: a manuscript says "about
// 90,000 words" because a publisher is costing paper, not auditing a count,
// and a figure like 89,412 claims a precision that stops being true the
// moment anybody edits a line. But it IS a claim about someone else's
// expectations, and vaults have both kinds of reader — a competition entry
// with a hard ceiling wants the exact number, and so does anyone whose
// agent asked for one.
// (IN THE BOOK'S LANGUAGE, A864: "environ 90 000 mots" on a French manuscript, its figure as French writes it)
export function wsTitleWords(o: WsExportRun | null | undefined) {
	const n = (o && o.wordCount) || 0, lang = o && o.lang;
	if (o && o.roundWordCount === false) return wsTIn(lang, '{count} words', { n, count: wsNumIn(lang, n) });
	const r = wsRoundWords(n);
	return wsTIn(lang, 'about {count} words', { n: r, count: wsNumIn(lang, r) });
}

// One id per section, shared by every target so a link means the same thing
// in the .docx, the PDF and the markdown. Word bookmark names are the strict
// case — letters, digits and underscore, no leading digit, 40 characters —
// so that is what everything uses rather than three near-identical schemes.
export function wsAnchorId(title: string, i: number) {
	const base = String(title || 'section').toLowerCase()
		.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
	return 'ws_' + (base || 'section') + '_' + (i + 1);
}

// XML text escaping. Ampersand first or the escapes escape each other.
export function wsXml(str: string | number | null | undefined) {
	return String(str == null ? '' : str)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────────────────────────────────────────

// ── READING SPEED FOR {readtime} ────────────────────────────────────────
//
// Fixed, not a setting: it is not a number anyone has a calibrated opinion
// about, and offering a box for it invites a writer to tune a figure they
// have no way to measure.
//
// 238: Brysbaert's 2019 meta-analysis puts adult silent reading of English
// prose there (200 is the round number that gets copied between blogs).
// THE ONE CONSTANT: the bar's {readtime}, the report's Read time and the
// Organizer's column all divide by it, so the plugin never answers "how
// long is this to read" two ways on two surfaces a writer can see at once.
export const READ_WPM = 238;

// ── WORDS TO A PAGE ─────────────────────────────────────────────────────
//
// The manuscript convention, 250 words to a page of 12pt double-spaced type.
// ROUGH ON PURPOSE: the true count belongs to the paper, the size and the
// spacing, which only Export knows, and its preview counts real pages. THE ONE
// CONSTANT: the report's Pages and the Organizer's column both read it. A note
// with any words is a page at least.
export const WS_WORDS_PER_PAGE = 250;
export function wsPagesOf(words: number) {
	return words > 0 ? Math.max(1, Math.round(words / WS_WORDS_PER_PAGE)) : 0;
}

// ── GOALS WITH A DATE (A700) ─────────────────────────────────────────────
// A day is a LOCAL calendar day, written YYYY-MM-DD: `new Date('2026-11-30')` is midnight in UTC, which is
// the day before west of Greenwich, so a deadline is never parsed that way.
export function wsDayKey(d: Date) {
	const p = (n: number) => (n < 10 ? '0' : '') + n;
	return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function wsDayOf(key: string): Date | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || '').trim());
	if (!m) return null;
	const d = new Date(+m[1], +m[2] - 1, +m[3]);
	return wsDayKey(d) === m[0] ? d : null;   // 2026-02-30 is no day
}
// The working days from one day to another, both counted, by the digits of getDay() that `work` holds (an
// empty `work` is every day: a writer who unticked all seven still has a deadline).
export function wsWorkDaysLeft(from: Date, to: Date, work: string) {
	const w = work ? String(work) : '0123456';
	const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
	const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
	let n = 0;
	for (let guard = 0; d.getTime() <= end && guard < 40000; guard++) {
		if (w.indexOf(String(d.getDay())) !== -1) n++;
		d.setDate(d.getDate() + 1);
	}
	return n;
}
// THE PLAN for one goal. `start` is the count when today began (the first reading of the day), so the day's share
// holds still while the writer writes: what was left at the start, over the working days left, today counted when it
// is one, rounded UP (a share that rounds down misses the deadline by the remainder). On a day off the share is
// the working days' own; met is met whichever day it is. Past the deadline the goal is overdue by what is left.
export interface WsGoalPlan { target: number; done: number; start: number; today: number; due: string; daysLeft: number; perDay: number; todayMet: boolean; left: number; state: 'open' | 'done' | 'overdue' }
export function wsGoalPlan(target: number, done: number, start: number, due: string, now: Date, work: string): WsGoalPlan {
	const t = Math.max(0, Math.round(target || 0)), d = Math.max(0, Math.round(done || 0));
	const s = Math.max(0, Math.min(d, Math.round(start == null ? d : start)));
	const plan: WsGoalPlan = { target: t, done: d, start: s, today: d - s, due: String(due || ''), daysLeft: 0, perDay: 0, todayMet: false, left: Math.max(0, t - d), state: 'open' };
	const dueDay = wsDayOf(plan.due);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	if (dueDay && dueDay.getTime() >= today.getTime()) plan.daysLeft = wsWorkDaysLeft(today, dueDay, work);
	if (t > 0 && d >= t) { plan.state = 'done'; return plan; }
	if (dueDay && dueDay.getTime() < today.getTime()) { plan.state = 'overdue'; return plan; }
	if (!dueDay || t <= 0) return plan;
	plan.perDay = Math.ceil(Math.max(0, t - s) / Math.max(1, plan.daysLeft));
	plan.todayMet = plan.perDay > 0 && plan.today >= plan.perDay;
	return plan;
}

// HOW FAR A GOAL WITH NO DEADLINE HAS COME (A706), IN HUNDREDTHS since A724 (the bar is one bar, not eight cells):
// words over target, a hundred once it is reached
export function wsGoalPct(p: WsGoalPlan): number {
	return p.target > 0 ? Math.min(100, Math.round(100 * Math.min(1, p.done / p.target))) : 0;
}

// How many addressable colours each row offers. Backgrounds carry the
// palette, so there are more of them; text on a coloured block only needs a
// light, a dark and an accent or two. Both lookups wrap, so an out-of-range
// :N or ;N folds back rather than failing.
// The gap `.ws-status-row` puts between its sections. Mirrored here because
// the fit test has to know how much room the sections need BETWEEN them, not
// only how wide they are: without it the bar reported a fit while the
// sections were already touching. Keep in step with the stylesheet.
export const BAR_SECTION_GAP = 12;

// Breathing room demanded before a row counts as fitting. Without it a row
// balanced on the exact boundary oscillates: drop a token, now it fits,
// restore it, now it does not — once per frame, which reads as flicker.
export const FIT_SLACK = 4;

// How much wider than the width that forced a reduction the row must get
// before the reduction is undone. Pure hysteresis: restoring the moment the
// shortened row fits would overflow it again immediately.
export const FIT_RESTORE_MARGIN = 24;

// The four value classes the fit pass sheds in. Lower goes first.
export const FIT_CLASS_DECORATION = 0;   // rules, spacer runs, slivers
export const FIT_CLASS_ORNAMENT   = 1;   // a drawn glyph and little else
export const FIT_CLASS_AMBIENT    = 1.5; // the clock: a reading you have elsewhere
export const FIT_CLASS_READING    = 2;   // counts, times, positions, headings
export const FIT_CLASS_IDENTITY   = 3;   // {file}, {vim} — where you are

export const PL_BG_COUNT = 7;

// ── OBSIDIAN'S OWN MARK ────────────────────────────────────────────
//
// Lucide has no `obsidian` glyph. NOT A DRAWING OF THE LOGO (a wrong
// logo is worse than an honest folder): it is OBSIDIAN'S OWN wireframe
// path, lifted from the `svg.logo-wireframe` the app renders in its own
// DOM (viewBox 0 0 512 512, one stroked path). STROKED, NOT FILLED, so
// it takes `currentColor` and sits beside the Lucide folder glyphs as
// line art.
//
// NO `stroke-width` ATTRIBUTE. CSS beats a presentation attribute, and
// Obsidian's own `.svg-icon { stroke-width: 1.75px }` — a rule written
// for Lucide's 24-unit viewBox — would win over one here; inside an SVG
// that value resolves in USER UNITS, so on this mark's 512-unit box it
// draws twenty-six times too thin, a hairline. The weight lives in the
// stylesheet at a specificity that wins (`svg.ws-obsidian-mark`,
// (0,1,1)), and ALONE — a copy here would be a second writer of a
// number this file cannot enforce.
export const WS_OBSIDIAN_PATH = 'M172.7 461.6c73.6-149.1 2.1-217-43.7-246.9'
	+ 'm72 96.7c71.6-17.3 141-16.3 189.8 88.5m-114-96.3c-69.6-174 44.6-181'
	+ ' 16.3-273.6m97.7 370c1.6-3 3.3-5.8 5.1-8.6 20-29.9 34.2-53.2'
	+ ' 41.4-65.3a16 16 0 0 0-1.2-17.7 342.1 342.1 0 0 1-40.2-66.1c-10.9-26'
	+ '-12.5-66.5-12.6-86.2 0-7.4-2.4-14.7-7-20.6l-81.8-104a32 32 0 0'
	+ ' 0-1.4-1.5m97.7 370a172.8 172.8 0 0 0-18 59c-2.9 21.5-24 38.4-45'
	+ ' 32.6-30-8.3-64.5-21.1-95.7-23.5l-47.8-3.6c-7.7-.6-15-4-20.3-9.5'
	+ 'l-82.3-84.8c-9-9.2-11.4-23-6.2-34.8 0 0 51-111.8 52.8-117.7l.7-3'
	+ 'M293.1 30a31.5 31.5 0 0 0-44.4-2.3l-97.4 87.5c-5.4 5-9 11.5-10'
	+ ' 18.8-3.7 24.5-9.7 68-12.3 80.7';
// A SHARE THAT SHOWS ITS FIRST DIGIT: two decimals, and one more for
// every leading zero it would otherwise be all of — 2.55, 0.03, 0.004,
// 0.0005 — so no word that is there reads as 0.00%. Eight is the ceiling.
export const wsShareText = (v: number) => {
	const x = Number(v) || 0;
	if (x <= 0) return '0.00';
	let d = 2;
	while (d < 8 && Number(x.toFixed(d)) === 0) d++;
	return x.toFixed(d);
};
// MARKUP INTO AN ELEMENT, WITHOUT innerHTML. The glyphs below are
// STRINGS on purpose — one writer per drawing, and a string can be
// asked what it drew. The plugin review forbids writing a string into
// the DOM through innerHTML, so every glyph lands through this one
// seam: Obsidian's sanitizeHTMLToDom parses the markup into nodes
// through DOMPurify (an <svg> and its paths come through whole) and
// they replace what the element held.
export const wsSvgInto = (el: Element, markup: string) => {
	el.empty();
	el.appendChild(sanitizeHTMLToDom(String(markup == null ? '' : markup)));
	return el;
};
// ONE BAR, ITS CORNERS A LITTLE ROUND (A724, the writer: "make the bar not segmented with a bit of rounded corners.
// including the one in the popup"): a track and its fill, two boxes and not an svg of cells. A box's edges land on
// whole pixels (A705's fuzz was an svg's cells between them) and its corners are the sheet's, never stretched with
// the box. The share, 0 to 100, is `--ws-bar-pct` on the track: the one writer of the fill's width.
// (TOMBSTONE, A724: `wsCellsInto`, A705's row of cells in one crisp svg.)
export const wsBarInto = (host: HTMLElement, frac: number): HTMLElement => {
	const pct = Math.round(Math.max(0, Math.min(1, isFinite(frac) ? frac : 0)) * 100);
	const bar = host.createSpan({ cls: 'ws-bar' });
	bar.setCssProps({ '--ws-bar-pct': String(pct) });
	bar.createSpan({ cls: 'ws-bar-fill' });
	return bar;
};
// A COLOR TURNED ROUND THE WHEEL as CSS's `hue-rotate()` turns it: the filter's
// own matrix, on the 0-255 channels (Cursor-Smith turns its caret canvas with
// that filter while its colors are flipped, and a token in the caret's color
// has to land on the same color). Hex in, hex out; anything unparseable back
// unchanged.
export function wsHueRotate(hex: string, deg: number): string {
	const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
	if (!m || !isFinite(deg)) return hex;
	const n = parseInt(m[1], 16);
	const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
	const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
	const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return '#'
		+ ch(r * (0.213 + c * 0.787 - s * 0.213) + g * (0.715 - c * 0.715 - s * 0.715) + b * (0.072 - c * 0.072 + s * 0.928))
		+ ch(r * (0.213 - c * 0.213 + s * 0.143) + g * (0.715 + c * 0.285 + s * 0.140) + b * (0.072 - c * 0.072 - s * 0.283))
		+ ch(r * (0.213 - c * 0.213 - s * 0.787) + g * (0.715 - c * 0.715 + s * 0.715) + b * (0.072 + c * 0.928 + s * 0.072));
}

// A CURSOR-SMITH PRESET, DRAWN: its caret's shape in its own color, the mark
// beside its name in the Cursors lists. Box (filled, or an outline when it is
// hollow), Line or Underline, in the dark or the light color for the mode on
// screen, along its gradient when it has one. Only a hex code is let into the
// markup; anything else draws in the row's own ink.
let wsCursorMarkSeq = 0;
export function wsCursorMarkSvg(look: unknown, dark: boolean): string {
	const o = (look && typeof look === 'object') ? look as Record<string, unknown> : {};
	const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim())) ? v.trim() : '';
	const style = (typeof o.cursorStyle === 'string' && o.cursorStyle ? o.cursorStyle : 'Line').toLowerCase();
	const stops: string[] = [];
	const n = Math.max(0, Math.min(4, Number(o.gradientCount) || 0));
	if (o.gradientEnabled === true) {
		for (let i = 1; i <= n; i++) {
			const c = hex(o[(dark ? 'gradientDark' : 'gradientLight') + i]);
			if (c) stops.push(c);
		}
	}
	let paint = hex(dark ? o.colorDark : o.colorLight) || 'currentColor';
	let defs = '';
	if (stops.length >= 2) {
		const id = 'ws-cursormark-' + (++wsCursorMarkSeq);
		// along the caret: down a Line or a Box, across an Underline
		const across = style === 'underline';
		defs = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="' + (across ? 1 : 0) + '" y2="' + (across ? 0 : 1) + '">'
			+ stops.map((c, i) => '<stop offset="' + (i / (stops.length - 1)) + '" stop-color="' + c + '"/>').join('')
			+ '</linearGradient></defs>';
		paint = 'url(#' + id + ')';
	}
	let shape: string;
	if (style === 'box') {
		shape = o.boxHollow === true
			? '<rect x="1.75" y="1.75" width="6.5" height="10.5" fill="none" stroke="' + paint + '" stroke-width="1.5"/>'
			: '<rect x="1" y="1" width="8" height="12" fill="' + paint + '"/>';
	} else if (style === 'underline') {
		shape = '<rect x="1" y="11" width="8" height="2" fill="' + paint + '"/>';
	} else {
		const w = Math.max(1.5, Math.min(3, Number(o.caretWidthPx) || 2));
		shape = '<rect x="' + (5 - w / 2) + '" y="1" width="' + w + '" height="12" fill="' + paint + '"/>';
	}
	return '<svg class="ws-cursor-mark is-' + (style === 'box' || style === 'underline' ? style : 'line') + '" viewBox="0 0 10 14" aria-hidden="true">' + defs + shape + '</svg>';
}
export const wsObsidianSvg = (px: number) => '<svg class="svg-icon ws-obsidian-mark" '
	+ 'viewBox="0 0 512 512" width="' + px + '" height="' + px + '" '
	+ 'fill="none" stroke="currentColor" '
	+ 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
	+ '<path d="' + WS_OBSIDIAN_PATH + '"/></svg>';
// ── FOLDER NAMES AS HEADINGS ─────────────────────────────────────────
//
// A book kept as `Section 1/Chapter 1/Some topic.md` compiles to
// `Section 1`, `Chapter 1`, then the prose — the chapter headings live
// apart from the body text, so pieces move between chapters without
// dragging a heading with them.
//
// OFF, because it changes the shape of every existing export.
export const WS_EXPORT_FOLDER_HEADINGS_DEFAULT = false;
// THE EXPORT PREVIEW DRAWS ITSELF UP TO THIS MUCH TEXT: the bytes of the ticked
// notes, read off `stat.size` before any file is read. The preview lays every
// page out at once and holds the window while it does, about 7.5 ms per
// thousand words on a desktop (0.8 s for a 106,000-word novel, 3.3 s for
// 425,000); a note runs near 5.7 bytes a word, so this is about 175,000 words,
// a little over a second. Past it the preview waits to be asked.
export const WS_EXPORT_PREVIEW_AUTO_BYTES = 1000000;

// ── WHERE THE BOOK STARTS, so a folder every file shares is not a
// heading. A manuscript kept entirely in `Book/` would otherwise open
// with a chapter called Book that contains everything, which says
// nothing. The deepest folder EVERY file shares is the root, and levels
// are counted below it.
//
// ON PATH SEGMENTS, not characters: a common prefix taken on characters
// calls "Book 1" and "Book 10" one folder.
//
// AND THE FOLDER THE WRITER CHOSE IS NOT COMMON CONTEXT. The root is
// the files' COMMON ANCESTOR, so it moves with the selection — and when
// the selection is one folder, that folder would BECOME the root and
// its name be stripped along with it: two chapters ticked, both get
// headings; one chapter, none. THE SCOPE TELLS THEM APART. A folder the
// writer picked is not context — it is the thing they picked — so when
// the computed root IS that folder, the root steps up one and the
// folder gets its name back. A root nobody picked (the book, when the
// selection is its parent) is left where it was, which is why the
// everything-ticked export is unchanged.
//
// OPTIONAL, and absent it behaves as it always did: the preview and
// the export both know their scope, and nothing else calls this.
export function wsExportRoot(paths: string[], scope: string) {
	const list = (paths || []).filter(Boolean).map(String);
	if (!list.length) return '';
	let acc = list[0].split('/').slice(0, -1);
	for (const p of list) {
		const bits = p.split('/').slice(0, -1);
		let i = 0;
		while (i < acc.length && i < bits.length && acc[i] === bits[i]) i++;
		acc = acc.slice(0, i);
		if (!acc.length) return '';
	}
	const root = acc.join('/');
	// STEP UP WHEN THE ROOT IS THE CHOSEN FOLDER — see above. Compared
	// as whole paths, never as a prefix: `Book 1` must not match
	// `Book 10`, which is the containment rule this project already
	// keeps for folder names.
	if (root && scope && String(scope) === root) {
		return acc.slice(0, -1).join('/');
	}
	return root;
}

// ── A NOTE'S OWN HEADINGS MOVE DOWN UNDER A FOLDER HEADING ───────────
//
// This is the design question the ask carried, and it has to be answered
// or the feature is wrong rather than incomplete: a scene whose first
// line is `# The Sea` sitting under a folder heading `# Chapter 1`
// OUTRANKS the chapter it is in. Every level in the note moves down by
// the depth of the folder it was found in.
//
// CAPPED AT SIX, because there is no `<h7>` and Word has no seventh
// heading style. A note six folders deep keeps its headings at 6 rather
// than emitting something no target can render.
//
// FENCED CODE IS NOT PROSE. A `#` at the start of a line inside a code
// block is a comment in somebody's shell script, and demoting it would
// edit their code. The fence state is tracked rather than the lines
// being matched blind.
// THE STRUCTURE'S NUMBERS (#79, PhilemonRe: "use the folder/document-structure ... for numbering the headings"; the
// writer: "i want the numbers heading to work for the full filetree so if i have nested folders they should have 1.1.2",
// the picks "1.1.2, 1.1.2., I. A. 1., Chapter 1" and "From the tree"): each folder and file numbered by its place in the
// file tree, counted among its folder's files and folders in the book's order, a folder counted whether it prints as a
// heading or not, from below the folder every file shares (the book itself); shown where its heading prints (a folder's
// with Folders, a file's name with File names), never on a note's own heading or the list of sources. Each index's
// number with what follows it (1.1.2 and a space, Chapter 1 and a colon), '' where none shows
export const WS_NUMBER_STYLES = ['none', 'decimal', 'decimalDot', 'outline', 'chapter'];
export function wsNumberStyle(o: WsExportOpts | null | undefined): string {
	const v = String((o && o.numberStyle) || '');
	return WS_NUMBER_STYLES.includes(v) ? v : 'none';
}
export function wsRoman(n: number): string {
	let out = '', v = Math.max(1, Math.floor(n));
	for (const [d, s] of [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']] as [number, string][]) while (v >= d) { out += s; v -= d; }
	return out;
}
// A, B ... Z, AA: the outline's letters
function wsLetters(n: number): string {
	let out = '', v = Math.max(1, Math.floor(n));
	while (v > 0) { v--; out = String.fromCharCode(65 + (v % 26)) + out; v = Math.floor(v / 26); }
	return out;
}
// a section's folders under the export's root: its own chain for a folder, its folder's for a file (from its path and
// depth where the compile gave none)
export function wsSecDirs(sec: WsExportSection): string[] {
	if (sec.dirs) return sec.dirs;
	const d = Math.max(0, sec.depth || 0), parts = String(sec.path || '').split('/');
	if (!d) return [];
	return (sec.folder ? parts : parts.slice(0, -1)).slice(-d);
}
export function wsHeadNumbers(o: WsExportOpts | null | undefined, sections: WsExportSection[]): string[] {
	const out = sections.map(() => '');
	const style = wsNumberStyle(o);
	if (!o || style === 'none') return out;
	const chains = sections.map((sec) => (sec.bib ? null : wsSecDirs(sec)));
	// THE BOOK'S OWN FOLDERS, the ones every file sits in, are not counted: its parts are 1, 2, 3, not 1.1, 1.2
	const fileChains = chains.filter((c, i): c is string[] => !!c && !sections[i].folder);
	let common = fileChains.length ? fileChains[0].length : 0;
	for (const c of fileChains) { let k = 0; while (k < common && k < c.length && c[k] === fileChains[0][k]) k++; common = k; }
	// (one level at most: the compile's chains open with the book's folder; a single part under it is still a part)
	common = Math.min(common, 1);
	const count = new Map<string, number>(), pos = new Map<string, number[]>();
	const next = (key: string, base: number[]) => { const n = (count.get(key) || 0) + 1; count.set(key, n); return base.concat([n]); };
	const folderAt = (dirs: string[]) => {
		let p: number[] = [];
		for (let k = 0; k < dirs.length; k++) {
			const key = dirs.slice(0, k + 1).join('/');
			let got = pos.get(key);
			if (!got) { got = next(dirs.slice(0, k).join('/'), p); pos.set(key, got); }
			p = got;
		}
		return p;
	};
	const mark = (level: number, n: number) => (level === 1 ? wsRoman(n) : level === 2 ? wsLetters(n) : level === 4 ? wsLetters(n).toLowerCase() : level === 5 ? wsRoman(n).toLowerCase() : String(n));
	let chapter = 0, part = 0;
	sections.forEach((sec, i) => {
		const c = chains[i];
		if (!c || (sec.folder && c.length <= common)) return;
		const dirs = c.slice(common);
		// a file counted among its folder's children whether its name prints or not, so the next one keeps its place
		const p = sec.folder ? folderAt(dirs) : next(dirs.join('/'), folderAt(dirs));
		if (!sec.folder && !(o.sectionTitles && sec.title)) return;
		if (style === 'decimal') out[i] = p.join('.') + ' ';
		else if (style === 'decimalDot') out[i] = p.join('.') + '. ';
		else if (style === 'outline') out[i] = mark(p.length, p[p.length - 1]) + '. ';
		// CHAPTER 1 through the whole book, a file at any depth; PART I a top folder, a deeper folder none
		else if (style === 'chapter') out[i] = sec.folder ? (p.length === 1 ? 'Part ' + wsRoman(++part) + ': ' : '') : 'Chapter ' + (++chapter) + ': ';
	});
	return out;
}
// …set before its title, what follows it its own
export const wsNumbered = (num: string, title: string) => (num ? num + title : title);

// A NOTE'S OWN HEADINGS, WHERE THEY SIT: under its folder's when Folders are headings (each moved down by the depth),
// and under its file's name when File names and Note headings both are (#79: moved down below that heading's level, and
// a first heading that is the file's name itself dropped, so the title is not set twice)
export function wsNoteHeadings(o: WsExportOpts | null | undefined, sec: WsExportSection, md: string): string {
	let text = String(md == null ? '' : md);
	if (o && o.sectionTitles && o.keepHeadings !== false && sec.title) {
		const lines = text.split('\n');
		let i = 0;
		if (/^---\s*$/.test(lines[0] || '')) { i = 1; while (i < lines.length && !/^---\s*$/.test(lines[i])) i++; i++; }
		while (i < lines.length && !lines[i].trim()) i++;
		const h = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(lines[i] || '');
		if (h && h[1].trim().toLowerCase() === String(sec.title).trim().toLowerCase()) { lines.splice(i, 1); text = lines.join('\n'); }
		return wsDemoteHeadings(text, wsFileHeadLevel(o, sec));
	}
	return o && o.folderHeadings ? wsDemoteHeadings(text, sec.depth || 0) : text;
}

// …AND LEFT OUT, in the Markdown target as the page and Word leave them out with Insert heading's The file's name or None
// (the writer: "fix the markdown heading too"): each heading line and the blank line under it; a fence keeps its own
export function wsDropHeadings(md: string): string {
	let fence: string | null = null;
	const lines = String(md == null ? '' : md).split('\n'), out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const f = /^\s*(```+|~~~+)/.exec(line);
		if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; out.push(line); continue; }
		if (!fence && /^#{1,6}\s/.test(line)) { if (i + 1 < lines.length && !lines[i + 1].trim()) i++; continue; }
		out.push(line);
	}
	return out.join('\n');
}
export function wsDemoteHeadings(md: string, by: number) {
	const n = Math.max(0, Math.floor(Number(by) || 0));
	if (!n) return String(md == null ? '' : md);
	let fence: string | null = null;
	return String(md == null ? '' : md).split('\n').map((line) => {
		const f = /^\s*(```+|~~~+)/.exec(line);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = null;
			return line;
		}
		if (fence) return line;
		const h = /^(#{1,6})(\s)/.exec(line);
		if (!h) return line;
		const want = Math.min(6, h[1].length + n);
		return '#'.repeat(want) + line.slice(h[1].length);
	}).join('\n');
}

// ── THE HOST WINDOW'S OWN SECONDARY SURFACE, AS A LITERAL ───────────
//
// The export preview is an iframe and inherits no custom properties from
// the window around it, so a `var(--background-secondary)` written into its
// stylesheet is unset. This reads the value where it IS defined and hands
// back something an iframe can use.
//
// A FALLBACK THAT IS NOT WHITE: the sheet is white, and a desk the same
// colour as the paper on it shows no page edge at all.
export function wsHostTint() {
	try {
		const v = getComputedStyle(document.body)
			.getPropertyValue('--background-secondary');
		if (v && v.trim()) return v.trim();
	} catch (_) { wsCatch('wsHostTint: const v = getComputedStyle(document.body)', _); }
	return '#ececec';
}

// WHAT LEVEL A FILE'S OWN NAME IS SET AT. Two when folder headings are
// off, which is what every export has done since the option existed; one
// below its folder when they are on, so a chapter contains its scenes
// rather than sitting beside them.
export function wsFileHeadLevel(o: WsExportOpts | null | undefined, sec: WsExportSection) {
	if (!o || !o.folderHeadings) return 2;
	return Math.min(6, ((sec && sec.depth) || 0) + 1);
}

// ── THE LEVEL A SECTION SITS AT, WHATEVER KIND IT IS ─────────────────
//
// The contents list has to indent by SOMETHING, and the only honest
// something is the level the entry will actually carry in the document.
// A separate indent rule would be a second writer of the outline, and it
// would disagree with the headings the day either changed.
//
// A FOLDER IS ITS DEPTH, A FILE IS ONE BELOW ITS FOLDER. That asymmetry
// is not arbitrary: a top-level folder is the Part (level 1) and the
// files inside it are its Chapters (level 2). With folder headings OFF
// there are no folder sections at all and every file is level 2, so this
// returns a flat 2 for everything and the list does not indent — which is
// what "if some options are picked" means.
export function wsSecHeadLevel(o: WsExportOpts | null | undefined, sec: WsExportSection) {
	// THE OPTION GOVERNS BOTH KINDS. `exportSections` emits no folder
	// section at all when `folderHeadings` is off, so this branch cannot be
	// reached from the app — but a function that answers "level 1" for a
	// folder in a flat export is a function whose result depends on the
	// caller having already checked the option, and every caller then has
	// to remember. It checks once, here.
	if (!o || !o.folderHeadings) return 2;
	if (sec && sec.folder) return Math.min(6, sec.depth || 1);
	return wsFileHeadLevel(o, sec);
}

// The deepest level any section reaches. Word builds its own contents
// from a RANGE of outline levels, so it needs the number rather than the
// per-entry indent the other two formats want.
export function wsDeepestLevel(o: WsExportRun, sections: WsExportSection[]) {
	let d = 1;
	for (const sec of sections || []) d = Math.max(d, wsSecHeadLevel(o, sec));
	return d;
}

// ── HOW FAR IN AN ENTRY SITS, WHICH IS NOT ITS LEVEL ─────────────────
//
// Indenting by the level itself was the first attempt and it was wrong
// in the flat case: with folder headings off every section is level 2,
// so every entry got one step of indent and a contents list that had
// always sat at the margin quietly moved right. The assertion for the
// off arm caught it.
//
// A LIST IS INDENTED RELATIVE TO ITS OWN SHALLOWEST ENTRY. That is what
// makes it self-normalising: a flat export has one level and therefore
// no indent, an export rooted at a sub-folder starts at the margin
// wherever that folder sits in the vault, and a nested one steps in from
// whatever its top is. Nothing has to know which case it is in.
export function wsTocSteps(o: WsExportRun, sections: WsExportSection[]) {
	let top = 6;
	// (the book's own folder is in no contents, so its parts are the contents' first level: A848)
	for (const sec of sections || []) if (!sec.book) top = Math.min(top, wsSecHeadLevel(o, sec));
	return (sec: WsExportSection) => Math.max(0, wsSecHeadLevel(o, sec) - top);
}

// ── HOW A TASK COUNT IS WRITTEN ──────────────────────────────────────
//
// BRACKETED, because a bare 4/5 in a row of numbers reads as another
// measurement of the same kind as Words and Target — and it is not a
// quantity of writing at all, it is a count of boxes. The brackets are
// the notation the task is written in in the note itself, so the column
// says what it is without the header having to be read. ONE WRITER for
// the table cell, the folder aggregate and the tree row.
export function wsTaskSay(done: string|number, all: string|number) {
	if (!all) return '';
	return '[' + done + '/' + all + ']';
}

// ── WHICH WAY A SORT RUNS, WRITTEN ONCE ──────────────────────────────
//
// ARROWS, NOT TRIANGLES. A coloured triangle is a decoration that has to
// be learnt; an arrow points the way the rows are going, and it is the
// mark the file explorer and every table on the web already use. ONE
// WRITER for the Sort button's title, the sort menu's row, the lens chip
// and the column header's mark: four copies of a mark is four chances
// for one of them to point the other way, which is worse than no mark —
// a reader who trusts it sorts their manuscript backwards.
export function wsSortArrow(dir: string) {
	return dir === 'desc' ? ' ↓' : ' ↑';
}

// What --ws-stylesheet-version in styles.css must read for this build. See
// the comment beside that variable: a stale stylesheet in a vault is
// indistinguishable from a broken feature — the rules are absent, the script
// works, and the report is "your fix did nothing". Bump both together.
export const WS_STYLESHEET_VERSION = 580;
// THE INSTALLER GATE. Encoded major*1000+minor. Refused below 1.9:
// installers 1.5.12 and 1.8.3 froze Obsidian on enable. Warned below
// 1.13: the installer this build is measured in. Move both only on
// evidence, and move the two texts with them.
export const WS_INSTALLER_REFUSE = 1009;
export const WS_INSTALLER_REFUSE_TEXT = '1.9';
export const WS_INSTALLER_WARN = 1013;
export const WS_INSTALLER_WARN_TEXT = '1.13';

// ── WHAT A FAILED WRITE IS ABOUT ─────────────────────────────────────
//
// Ten writes carry a writer's work. `storeWriteFailed` reports them all
// and latches PER SUBJECT — so the subject is a shared name rather than
// a string typed twice, once in the failure arm and once in the success
// arm: two copies and the latch never clears, the toast is said once
// and never again.
//
// THEY READ AS THE SENTENCE THEY LAND IN — "Word-Smith: could not " plus
// this — so they are verbs, and lower case.
export const WS_WRITE = Object.freeze({
	goals:     'save the goals and the manuscript order',
	mirror:    'write the settings mirror',
	structure: 'save the manuscript structure',
	prop:      'write that property',
	stored:    'store that property',
	rename:    'follow a rename in the export list',
	forget:    'forget a deleted path in the export list',
	move:      'follow the store to its new place',
	settings:  'save your settings',
});

// What manifest.json must say for this build, checked like the
// stylesheet's version: everyone updating a plugin by hand copies
// main.js and styles.css and forgets the third file, so the code is
// new, the styles are new, and the version the writer READS — in
// Community Plugins, in a bug report — is months old. A mismatch here
// is a plugin lying about which one it is.
export const WS_PLUGIN_VERSION = '1.8.9';

// ── Writing history ─────────────────────────────────────────────────────────
// One measurement per typing pause, not one per autosave.
export const HISTORY_DEBOUNCE_MS = 2000;
// How long a pause counts as "stopped writing". Long enough that it does not
// fire between two sentences, short enough that the file is current whenever
// you look away from the editor.
export const HISTORY_IDLE_MS     = 8000;
// And the ceiling, for a session that never pauses.
export const HISTORY_MAX_UNSAVED_MS = 120000;
// ── FLAGS: WHERE A CHAPTER IS UP TO ──────────────────────────────────
//
// Flags on screen; the stored ids do not change (`fileStatus`,
// `folderStatus`, and the words in `ws-goals.md`): renaming a thing on
// screen must not rewrite a vault's file.
//
// FIVE STATES, in the order a scene passes through them — which is also
// the order a click cycles, so pressing a chip walks the scene forward
// through its own life rather than round an arbitrary ring:
//
//   Outline   a placeholder. There are notes here, not prose.
//   Draft     written once, roughly.
//   Revise    written, and known to need work.
//   Blocked   cannot proceed — research, continuity, a decision not made.
//   Done      finished.
//
// Stored in `ws-goals.md` beside the targets, because a status is the
// same kind of fact as a target: the writer's own note about their
// manuscript, which must survive a reinstall and be editable by hand.
// Folders take one too — a part can be finished while a stray note
// inside it is not, and the roll-up beside it is what makes that visible.
//
// THE IDS ARE FIXED FOREVER; everything else about a state is the
// writer's. A flag is stored against a path as its ID — `revise`,
// `blocked` — so renaming "Blocked" to "Stuck" must not change what is
// written on disk, or every note carrying that flag loses it, and a
// vault synced from a machine with different names would disagree about
// what its own manuscript says. The label, the shape and the two
// colours are settings; the five ids are not, and the count decides how
// many are offered. The ORDER is the ring's and the count's (the first N
// are offered): Draft, Revise, Done first, Sketch and Blocked after. A
// vault's stored flags are read by id, so the order can move; the ids
// cannot.
export const WS_STATE_IDS = ['draft', 'revise', 'done', 'outline', 'blocked'];

// The list every reader of a flag consults, kept in step with the settings by
// `flagsApply`. A module-level table because `wsStatusLabel` and
// `wsFlagSvg` are module functions called from thirty places — including
// paint paths with no plugin in scope — and threading a plugin through all of
// them to look up a label would be a worse cure than the disease.
// REPLACED IN PLACE, never reassigned: it is a module export, and an
// importer cannot assign one. Every reader walks it at read time, and
// the redraw signature in `flagsApply` compares its JSON, not its
// identity.
export const WS_STATUSES: { id: string; label: string; shape?: string }[] = [
	{ id: 'draft',   label: 'Draft'   },
	{ id: 'revise',  label: 'Revise'  },
	{ id: 'done',    label: 'Done'    },
	{ id: 'outline', label: 'Sketch' },
	{ id: 'blocked', label: 'Blocked' }
];
// ── FOLDER COLOURS ──────────────────────────────────────────────────────────
//
// Seven and a default. They are Obsidian's OWN named colours — `--color-red`
// through `--color-purple`, which every theme in the world defines and most
// themes restyle — so a coloured folder belongs to whatever the writer is
// wearing rather than to a palette this plugin invented. A Word-Smith theme
// can move them like any other variable.
//
// SEVEN, not fifteen: a colour has to be namable at a glance for a writer to
// mean anything by it, and a tree of fifteen hues is a tree nobody can read
// down. The first swatch is not a colour at all — it is "as it was", drawn as
// an outline, because taking a colour off has to be as easy as putting one on.
export const WS_FOLDER_COLOURS = [
	{ id: '',       label: 'Default', css: '' },
	{ id: 'red',    label: 'Red',     css: 'var(--color-red, #c0503f)' },
	{ id: 'orange', label: 'Orange',  css: 'var(--color-orange, #c98a3c)' },
	{ id: 'yellow', label: 'Yellow',  css: 'var(--color-yellow, #c9a227)' },
	{ id: 'green',  label: 'Green',   css: 'var(--color-green, #4f9a5c)' },
	{ id: 'cyan',   label: 'Cyan',    css: 'var(--color-cyan, #3f9aa8)' },
	{ id: 'blue',   label: 'Blue',    css: 'var(--color-blue, #4a7fc1)' },
	{ id: 'purple', label: 'Purple',  css: 'var(--color-purple, #8a63c9)' }
];

export const WS_FLAG_SHAPES = [
	{ id: 'pennant',  label: 'Pennant' },
	{ id: 'hollow',   label: 'Hollow pennant' },
	{ id: 'swallow',  label: 'Swallowtail' },
	{ id: 'banner',   label: 'Banner' },
	{ id: 'alert',    label: 'Exclamation' },
	{ id: 'triangle', label: 'Triangle' },
	{ id: 'question', label: 'Question mark' },
	{ id: 'star',     label: 'Star' },
	{ id: 'dot',      label: 'Dot' },
	{ id: 'square',   label: 'Square' },
	{ id: 'check',    label: 'Tick' },
	{ id: 'bookmark', label: 'Bookmark' },
	{ id: 'pause',    label: 'Paused' }
];
export const WS_SHAPE_FOR: Record<string, string> = { outline: 'hollow', draft: 'pennant', revise: 'swallow',
	blocked: 'alert', done: 'banner' };

export function wsFlagShapeOf(id: string) {
	for (const st of WS_STATUSES) if (st.id === id) return st.shape || WS_SHAPE_FOR[id] || 'pennant';
	return WS_SHAPE_FOR[id] || 'pennant';
}

// ── THE AXIS BOUND ───────────────────────────────────────────────────
//
// The axis fits the 95th percentile of the visible days (or 3x the
// median, whichever is larger), never the maximum: one 10k day would
// flatten a month of real work into a line along the axis (a vault
// measured at 19 active days, median 216, max 11,300 — an ordinary day
// was 1.9% of the plot).
//
// PURE, and takes the VALUES rather than the buckets: the caller decides
// what a value is (added, deleted, net; one direction at a time), and
// this decides only where the ceiling goes. Signs are ignored — a bound
// is a magnitude — so the same function answers for the bars that rise
// and the bars that fall.
//
// (n-1)*q, NOT n*q: with a handful of active days the latter rounds to
// the LAST element — the maximum wearing a percentile's name — and the
// outlier it exists to tame becomes the scale again.
//
// THE BOUND NEVER EXCEEDS THE LARGEST VALUE. When the spread is tight,
// 3x the median lands above everything; a chart whose ceiling is three
// times its tallest bar is a chart of empty air. Clamping there is what
// makes the rule SELF-LIMITING: Monthly and Yearly clip nothing at all.
//
// ZEROES ARE NOT DATA POINTS. A day nobody wrote is not a small day; it
// would drag the median to nothing and make the bound 3x nothing.
export const WS_AXIS_PCT = 0.95;
export const WS_AXIS_MED_MULT = 3;
// MONOTONE CUBIC TANGENTS (Fritsch–Carlson), not Catmull-Rom: a curve through the points that never leaves the
// interval its neighbours define, so a peak is drawn at its own height and no higher. A Catmull-Rom spline overshoots:
// History's quiet day between two busy ones got a net it never had, and the Report's Rhythm drew its sharpest stretch
// past the top of its box (A794, the writer: "that peak gets too high"). A span from i to i+1, h wide, is the Bézier
// C(x[i] + h/3, y[i] + m[i]·h/3, x[i+1] − h/3, y[i+1] − m[i+1]·h/3, x[i+1], y[i+1]).
export function wsMonotoneTangents(px: number[], py: number[]): number[] {
	const nP = px.length;
	if (nP < 2) return nP ? [0] : [];
	const d = new Array<number>(nP - 1);
	for (let i = 0; i < nP - 1; i++) d[i] = (py[i + 1] - py[i]) / (px[i + 1] - px[i]);
	const m = new Array<number>(nP);
	m[0] = d[0];
	m[nP - 1] = d[nP - 2];
	for (let i = 1; i < nP - 1; i++) {
		// A TURNING POINT GETS A FLAT TANGENT. Without this the curve rounds over a peak and reads higher than it was.
		m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
	}
	for (let i = 0; i < nP - 1; i++) {
		if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
		const a = m[i] / d[i], bq = m[i + 1] / d[i];
		const sq = a * a + bq * bq;
		if (sq > 9) {
			const t2 = 3 / Math.sqrt(sq);
			m[i] = t2 * a * d[i];
			m[i + 1] = t2 * bq * d[i];
		}
	}
	return m;
}

export function wsQuantile(sorted: number[], q: number) {
	if (!sorted.length) return 0;
	return sorted[Math.max(0, Math.min(sorted.length - 1,
		Math.floor((sorted.length - 1) * q)))];
}
export function wsAxisBound(values: unknown[] | null | undefined) {
	const mags: number[] = [];
	for (const v of (values || [])) {
		const m = Math.abs(Number(v) || 0);
		if (m > 0) mags.push(m);
	}
	if (!mags.length) return { bound: 0, clipped: [] };
	mags.sort((a, b) => a - b);
	const top = mags[mags.length - 1];
	const want = Math.max(wsQuantile(mags, WS_AXIS_PCT),
		WS_AXIS_MED_MULT * wsQuantile(mags, 0.5));
	const bound = Math.max(1, Math.min(top, want));
	return { bound: bound, clipped: mags.filter(m => m > bound) };
}

// ── ONE GAP FOR BOTH OVER-LABELS, IN CELLS ───────────────────────────
//
// BOTH labels carry `translate(-50%, -100%)`, so the number placed is
// the label's BOTTOM edge. Going up that is the edge facing the bar and
// the cells buy air; going down the bottom is the far edge, so the same
// cells would be spent on the label's own height and what faces the bar
// is whatever is left. So the downward label is placed by its TOP edge
// instead, and one constant is genuinely one gap on both sides.
export const WS_HIST_LAB_GAP    = 6;


// ── ONE SEARCH BOX FOR BOTH MENUS ────────────────────────────────────
//
// The docked panel and the modal menu draw the same box, not a second
// one styled to match. THE WRAPPER IS WHAT DRAWS THE MAGNIFIER:
// `search-input-container` is Obsidian's own class; the icon comes from
// the app rather than from us. THREE DOTS, NOT AN ELLIPSIS — the file
// tree above these panels says "Search...", and a box beneath it saying
// "Search…" is one of those differences you cannot unsee once noticed.
export function wsMenuSearchInto(parent: HTMLDivElement) {
	const wrap = parent.createDiv({ cls: 'ws-menu-searchwrap search-input-container' });
	const inp = wrap.createEl('input', { cls: 'ws-menu-search' });
	inp.type = 'search';
	inp.placeholder = wsT('Search...');
	return inp;
}

// ── THE FLAG ITSELF ──────────────────────────────────────────────────
//
// THE SHAPE IS THE STATE, and the colour agrees with it. A writer picks
// a shape per state, so each has to be told apart from any other by its
// SILHOUETTE, not by its colour or its fill: red and green is the
// commonest colour-blindness pair, these are drawn at eleven pixels,
// and half the places a flag appears (a file explorer row, a bar token)
// have no room for a word beside it. A filled flag eleven pixels high
// reads as its silhouette, which is why every signal flag ever flown is
// a shape first; the silhouette survives greyscale, a small size and a
// printout.
//
// Decorative, deliberately: the WORD is still the state, and the flag
// stands beside it wherever there is room. A vocabulary told only in
// pictures is one nobody can search, sort by name, or read in
// `ws-goals.md`.
//
// `currentColor` throughout, so the COLOUR IS THE STYLESHEET'S and a
// scheme can move it: the flags take a theme's own blue, red and green
// (its c1, c7 and c4 slots) whenever a theme is on, and their plain
// defaults otherwise. See barThemeVars for the three lines that do it.
export function wsFlagSvg(id: string, size: number) {
	const px = size || 11;
	const shape = wsFlagShapeOf(id);
	// A CLASS TOKEN, NOT MARKUP: the id arrives from a note's own property
	// and lands in markup, so it is cut to the characters a class can hold
	// before it is written.
	const tok = String(id == null ? '' : id).replace(/[^\w-]/g, '');
	const open = (body: string) => '<svg class="ws-flag is-' + tok + '" viewBox="0 0 13 14" width="' + px
		+ '" height="' + Math.round(px * 14 / 13) + '" aria-hidden="true">' + body + '</svg>';
	// The pole is always drawn on the flags: a flag with no pole is a shape,
	// not a flag. The shapes that are NOT flags — the triangle, the dot, the
	// tick — have no pole, which is what makes them read as a different KIND
	// of mark rather than a fifth flag.
	const pole = '<path d="M2 1.5 L2 12.5" stroke="currentColor" stroke-width="1.6" '
		+ 'stroke-linecap="round" fill="none"/>';
	if (shape === 'pennant') return open(pole + '<path d="M2.8 2 L11.6 5.5 L2.8 9 Z" fill="currentColor"/>');
	if (shape === 'hollow') {
		return open(pole + '<path d="M2.8 2 L11.6 5.5 L2.8 9 Z" fill="none" stroke="currentColor" '
			+ 'stroke-width="1.3" stroke-linejoin="round"/>');
	}
	if (shape === 'swallow') {
		return open(pole + '<path d="M2.8 2 L11.6 2 L8.6 5.5 L11.6 9 L2.8 9 Z" fill="currentColor"/>');
	}
	if (shape === 'banner') return open(pole + '<path d="M2.8 2 L11.6 2 L11.6 9 L2.8 9 Z" fill="currentColor"/>');
	if (shape === 'alert') {
		// The one shape that is a STOP rather than a stage: the mark itself,
		// heavy — a bar that tapers from 3.8 wide at the top to 2.6 at its
		// foot, rounded both ends, and a dot under it, all in currentColor so
		// the flag's colour is the whole of it. The id stays `alert`: notes
		// carry it.
		return open('<path d="M4.6 2.4 A1.9 1.9 0 0 1 8.4 2.4 L7.8 8.4 A1.3 1.3 0 0 1 5.2 8.4 Z" fill="currentColor"/>'
			+ '<circle cx="6.5" cy="11.9" r="1.75" fill="currentColor"/>');
	}
	// A plain triangle, point up, no pole.
	if (shape === 'triangle') return open('<path d="M6.5 1.8 L12.2 11.6 H0.8 Z" fill="currentColor"/>');
	// A question mark and a star. The mark is a stroked hook — over the
	// top and down to a stem — with a dot under it, as heavy as the
	// exclamation; the star is five points on a 5.6 / 2.3 radius about the
	// box's middle, filled.
	if (shape === 'question') {
		return open('<path d="M3.7 4.4 A2.8 2.8 0 1 1 7.9 7 Q6.5 7.9 6.5 9.5" fill="none" stroke="currentColor" '
			+ 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
			+ '<circle cx="6.5" cy="12.1" r="1.45" fill="currentColor"/>');
	}
	if (shape === 'star') {
		return open('<path d="M6.5 1.4 L7.85 5.14 L11.83 5.27 L8.69 7.71 L9.79 11.53 L6.5 9.3 L3.21 11.53 '
			+ 'L4.31 7.71 L1.17 5.27 L5.15 5.14 Z" fill="currentColor" stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/>');
	}
	if (shape === 'dot') return open('<circle cx="6.5" cy="6.5" r="3.6" fill="currentColor"/>');
	if (shape === 'square') return open('<rect x="3" y="3" width="7.2" height="7.2" rx="1.2" fill="currentColor"/>');
	if (shape === 'check') {
		return open('<path d="M2.4 7 L5.4 10 L11 3.6" fill="none" stroke="currentColor" '
			+ 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
	}
	if (shape === 'bookmark') {
		return open('<path d="M3.4 2 H10.2 A0.6 0.6 0 0 1 10.8 2.6 V12 L6.8 9.4 L2.8 12 V2.6 '
			+ 'A0.6 0.6 0 0 1 3.4 2 Z" fill="currentColor"/>');
	}
	if (shape === 'pause') {
		return open('<rect x="3.2" y="2.8" width="2.6" height="8.4" rx="0.8" fill="currentColor"/>'
			+ '<rect x="7.6" y="2.8" width="2.6" height="8.4" rx="0.8" fill="currentColor"/>');
	}
	return open(pole + '<path d="M2.8 2 L11.6 5.5 L2.8 9 Z" fill="currentColor"/>');
}

// ── THE FOLDER ITSELF ───────────────────────────────────────────────────────
//
// A shut folder and an open one, drawn rather than borrowed: `setIcon` would
// bring Obsidian's classes with it, and the chevron already taught this file
// what that costs — `collapse-icon` carries the app's own rotation, which
// composed with ours and pointed an open folder left.
//
// The two shapes differ by SILHOUETTE and not only by fill: a shut folder is
// a closed box with its tab, an open one is the same box with its front wall
// folded down and away, which is what every file manager since 1984 has
// drawn. At twelve pixels the difference has to be in the outline, because
// the fill is four pixels tall.
//
// `currentColor`, like the flag, so the stylesheet decides the colour and a
// theme can move it. Muted by default: the folder is punctuation in front of
// the name, not a thing to read.
export function wsFolderSvg(open: boolean, size: number) {
	const px = size || 12;
	const body = open
		// The front wall dropped and skewed away, so the box reads as tipped
		// open rather than merely lighter.
		? '<path d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5.4 L6.8 4.2 H10.5 '
			+ 'A1 1 0 0 1 11.5 5.2 V5.8 H3.6 L1.5 11 Z" fill="currentColor"/>'
			+ '<path d="M3.6 5.8 H13 L11 11 H1.5 Z" fill="currentColor" opacity="0.55"/>'
		: '<path d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5.4 L6.8 4.2 H11 '
			+ 'A1 1 0 0 1 12 5.2 V10 A1 1 0 0 1 11 11 H2.5 '
			+ 'A1 1 0 0 1 1.5 10 Z" fill="currentColor"/>';
	return '<svg class="ws-folder' + (open ? ' is-open' : '') + '" viewBox="0 0 14 14" '
		+ 'width="' + px + '" height="' + px + '" aria-hidden="true">' + body + '</svg>';
}

// A FILE GLYPH WITH ITS FORMAT LETTERED ON IT, the way a document icon
// usually carries its type.
//
// HAND-DRAWN BECAUSE IT HAS TO BE: Lucide ships no format-labelled file
// icons, so `setIcon` cannot answer this at all — there is no name to
// try. The shape to copy is `wsFlagSvg` above: a pure function returning
// a STRING of markup, no `document`, drawn from `currentColor` so a theme
// keeps working and the plugin's own palettes move it.
//
// ONE function rather than three drawings: the label is an argument, so
// this adds a BRANCH to the icon code rather than a second icon system.
// Any extension can be lettered; the caller decides which ones earn it.
//
// `textLength` + `lengthAdjust` are load-bearing, not decoration. These
// draw at 14–15px (styles.css caps `.ws-uni-kindicon svg`), a
// four-letter label like XLSX has about 10px to live in, and the
// writer's font is not the font every reader has. Naming the width makes
// the label FIT by construction instead of overflowing on a machine we
// cannot measure.

// TOMBSTONE (A705): `wsManuscriptSvg`, the custom order's hand-drawn mark (three unequal lines and an arrow) on
// Obsidian's sort button. The button wears the Organizer's `list-ordered` now, the writer's word: "change the icon
// from the file tree of custom order to the one in the organizer".

export function wsStatusLabel(id: string) {
	for (const st of WS_STATUSES) if (st.id === id) return st.label;
	return '';
}
// The next state a click asks for, cycling back to unmarked: a ring, so a
// chip pressed by mistake is a few presses from being right again rather than
// something to hunt for in a menu.
export function wsStatusNext(id: string) {
	// NO STATES IS A REAL ANSWER now that a writer can set the count to none,
	// and this read `[0].id` of an empty list — a throw, from a click, in the
	// one configuration that means "I do not want this feature".
	if (!WS_STATUSES.length) return '';
	const i = WS_STATUSES.findIndex(st => st.id === id);
	if (i === -1) return WS_STATUSES[0].id;
	return i + 1 < WS_STATUSES.length ? WS_STATUSES[i + 1].id : '';
}

// ── The stores' markers ──────────────────────────────────────────────────────
//
// A store is found by the marker it carries, not by the path it was last seen
// at (see `storeFind` for the seven ways a file leaves its address). So a
// RENAME of a store file is only ever a rename: the marker is the identity and
// it comes with it.
//
// LEGACY, both of them. `ws-export.md` and `ws-goals.md` became one file —
// `ws-structure.md` — because targets and flags ARE structure: "this chapter
// aims at 4,000 and is in revision" belongs beside "this chapter comes third
// and goes in the book". Two files meant two writes, two parses, and two ways
// for a rename to be followed. These two markers are still READ, for ever,
// because a vault that has not been opened since carries them; they are never
// written again.
export const GOALS_MARK_START  = '<!-- wordsmith:goals:start -->';
export const GOALS_MARK_END    = '<!-- wordsmith:goals:end -->';

export const EXPORT_MARK_START = '<!-- wordsmith:export:start -->';
export const EXPORT_MARK_END   = '<!-- wordsmith:export:end -->';

// What is written now: the manuscript's shape, in one file.
export const STRUCT_MARK_START = '<!-- wordsmith:structure:start -->';
export const STRUCT_MARK_END   = '<!-- wordsmith:structure:end -->';
export const STRUCT_BASENAME   = 'ws-structure.md';

// A one-directional mirror of data.json. NOT a second source of truth: see
// `settingsMirrorWrite` for why it is written one way and read in exactly two
// situations.
export const SETTINGS_MARK_START = '<!-- wordsmith:settings:start -->';
export const SETTINGS_MARK_END   = '<!-- wordsmith:settings:end -->';

export const HISTORY_MARK_START  = '<!-- wordsmith:history:start -->';
export const HISTORY_MARK_END    = '<!-- wordsmith:history:end -->';
// One pixel block, in chart viewBox units. Every bar height, every line and
// the centre line itself snap to this grid — that snapping IS the pixelated
// look, and it is why nothing in the panel is allowed to be a stroked path.
export const HISTORY_PX          = 2;
// Steps in the heat ramp each bar is shaded with, cool at the axis and hot at
// the far end. Six is enough to read as a gradient and few enough to dither
// between cleanly.
export const HISTORY_HEAT        = 6;
// Above this the cell is coarsened rather than the chart drawing a rect per
// square of a very large grid.
export const HISTORY_MAX_CELLS   = 30000;

// How many frames the mask pass will wait for a pane to have a box before it
// gives up. A leaf that never gets one — a background tab, a collapsed
// sidebar — must not spin a repaint loop for the rest of the session.
export const MASK_MEASURE_RETRIES = 20;
// HEADROOM FOR AN OVER-LABEL, in viewBox units. A clipped bar prints
// its real figure OUTSIDE the plot, so the number never sits on the ink
// it describes — and an svg root clips to its viewBox, so the room has
// to be reserved. It must cover the label ITSELF plus the gap beneath
// it: the span is ~11px of type and WS_HIST_LAB_GAP * HISTORY_PX of
// air. This axis is 1:1 (the viewBox is HISTORY_CHART_H tall and the
// svg is that many pixels tall), and `.ws-hist-overlab` is `font-size:
// 9px` — CHANGE ONE AND CHANGE BOTH; the history render test reads the
// stylesheet and asserts the label fits. It is spent ONLY on the side
// that has something to say: a chart with nothing clipped keeps the
// whole plot.
export const HISTORY_OVERLAB_PAD = 24;
// (TOMBSTONE, A783: HISTORY_BAR_MAX, 34, the cap that kept a few buckets from slabs a third of the panel wide; every
// view's bar is a 31-day month's day now, history.ts)
// The chart's viewBox. Chosen to land close to 1:1 against the modal's real
// width so a 4-unit block renders as a roughly 4-pixel square — the whole
// pixel idiom depends on the two scales not drifting far apart.
export const HISTORY_CHART_W     = 660;
export const HISTORY_CHART_H     = 184;
export const HISTORY_DAYNAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const HISTORY_MONTHS      = ['January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'];

// ── THE BAR'S DIRECTIVES ────────────────────────────────────────────
//
// Theme surfaces, addressable as :b1 and :b2 instead of a number. The
// seven :N backgrounds are colours the writer picked; these two are
// whatever the current theme is already using for the page and the
// panels beside it — the only way to write a segment that DISAPPEARS
// into the bar, and it keeps working when the theme changes or the
// vault flips dark to light, which a picked colour cannot.
//
// Values are resolved from the live computed style rather than written
// as `var(--background-primary)`: a separator's colour ends up in an SVG
// `fill` ATTRIBUTE, and custom properties do not resolve in presentation
// attributes.
//
// A directive at the very START of row 1's left slot sets the BAR's own
// colours from the theme, the palette, or the live mode rather than a
// segment's (read by `readBarDirective` below):
//
//   :b1 :b2 :b3 :b4  the theme's page, panel, alt-panel and tertiary surfaces
//   :N   palette background N (wrapping, like a segment's :N)
//   :vim the live vim mode colour, restamped on every repaint
//   :f   the flag on the note in hand — nothing when it has none
//   ;t1 ;t2 ;t3      the theme's normal, muted and faint text
//   ;N   palette colour N as text (the same palette :N reads)
//   ;vim the live vim mode colour as text
//   ;f   the flag on the note in hand, as text
//
// Same grammar as the powerline suffixes on purpose — ":" is a background
// and ";" is text everywhere in a row — but a different position: the
// suffix form always follows a token (`{file}:b1`), so nothing here can
// be mistaken for it. Both may appear, in either order, and the pair may
// be followed by ordinary content. The palette and vim forms return a
// SLOT rather than a value: they need the plugin (settings, theme, live
// mode) to resolve; resolveBarDirective() on the plugin turns a slot
// into paint. The reader returns the stripped string alongside the
// values so the caller cannot render one without honouring the other.
//
// EVERY ONE OF THESE ENDS IN A VARIABLE THAT ALWAYS RESOLVES. They are
// stamped straight into `--ws-bg`, and the bar paints with
// `background-color: var(--ws-bg)`. A var() that does not resolve is
// invalid AT COMPUTED-VALUE TIME, which falls back to the property's
// INITIAL value — for background-color, `transparent`. So one undefined
// theme variable gives no bar at all; and `barColor`, read back off the
// element, sees rgba(0,0,0,0) and stays 'transparent', which is what a
// group's END CAP is drawn against, so a slanted cut paints invisibly
// over a solid rectangle and the group appears to start with a straight
// edge. Core Obsidian defines --background-primary,
// --background-primary-alt, --background-secondary and
// --background-secondary-alt; it does NOT define --background-tertiary
// (community themes often do), and a theme is free to leave any of them
// out — so every chain terminates at --background-primary, the one
// surface nothing can render without.
export const BAR_DIRECTIVE_BG: Record<string, string> = {
	b1: 'var(--background-primary)',
	b2: 'var(--background-secondary, var(--background-primary))',
	b3: 'var(--background-secondary-alt, var(--background-secondary, var(--background-primary)))',
	b4: 'var(--background-tertiary, var(--background-primary-alt, var(--background-primary)))',
	// :bs — THE STATUS LINE'S OWN SURFACE. Not a fifth step of the ramp: a
	// worn scheme may NAME this colour (Vim's blue pair paints it cyan,
	// Quiet inverts it to black, PaperColor makes it teal) and the ramp
	// cannot express that. It falls back through the chrome surfaces, so a
	// bar written with :bs looks sane with no scheme worn — the same
	// contract every other slot keeps.
	//
	// Spelled :s until 1.3.0, and REMOVED clean rather than aliased: the
	// grammar's rule is that an unrecognised slot prints itself, so a saved
	// `:s` now shows ":s" in the bar — which is how its writer finds out
	// the name changed, instead of a hidden synonym nobody can discover.
	//
	// :bs is also THE DEFAULT. A row that declares nothing sits on this
	// surface (see applyCssVariables), and so does every segment with no
	// colour of its own (powerlineSegColor) — the bar reads as one strip,
	// the way a vim statusline does, until a colour is asked for.
	bs: 'var(--status-bar-background, var(--background-secondary, var(--background-primary)))',
};
// The same reasoning, one step milder: an unresolvable ink leaves `color` at
// its initial value, which is black — wrong rather than absent, and invisible
// on a dark bar.
export const BAR_DIRECTIVE_TEXT: Record<string, string> = {
	t1: 'var(--text-normal)',
	t2: 'var(--text-muted, var(--text-normal))',
	t3: 'var(--text-faint, var(--text-muted, var(--text-normal)))',
};

export function readBarDirective(formatStr: string) {
	let rest = String(formatStr == null ? '' : formatStr);
	let bg = null, text = null, bgSlot = null, textSlot = null;
	let bgTheme = null, textTheme = null;
	// Looped rather than one regex with two optional groups: that form only
	// accepts the pair in the order it was written, and a writer who types
	// ;t2:b2 has said exactly the same thing.
	for (;;) {
		// `bs` and `bc` join b1-b4 as surface names, BEFORE bd+ in the
		// alternation so the engine need not backtrack into them. Listed rather
		// than widened to w+, because an unknown slot must stay unmatched and
		// print itself: a typo that silently resolved to nothing is the failure
		// this grammar was built to avoid.
		//
		// :bc, ;bc, :f and ;f travel the SLOT route with :vim rather than the
		// theme-surface route with :bs, because the cursor's colour and the
		// flag's are LIVE state — Cursor-Smith repaints the caret per vim mode,
		// and the flag follows the note in front of the writer — and a slot is
		// resolved on every repaint where a surface is stamped once (see
		// cursorColor).
		const m = /^\s*(?::(bs|bc|f|b\d+|vim|\d+)|;(t\d+|vim|bc|f|\d+))/i.exec(rest);
		if (!m) break;
		if (m[1] && bg === null && bgSlot === null) {
			if (/^\d+$/.test(m[1]))        bgSlot = parseInt(m[1], 10);
			else if (/^(?:vim|bc|f)$/i.test(m[1]))  bgSlot = m[1].toLowerCase();
			else {
				const k = m[1].toLowerCase();
				bg = BAR_DIRECTIVE_BG[k] || null;
				// The SLOT NAME as well as the var() chain. The chain is what
				// gets stamped if nothing better is available; the name is
				// what lets resolveBarDirective read the surface and check it
				// is actually PAINTABLE. A var() fallback only fires for an
				// UNDEFINED variable — one a theme defines as `transparent`
				// resolves perfectly well and takes the whole bar with it.
				if (bg) bgTheme = k;
			}
		}
		if (m[2] && text === null && textSlot === null) {
			if (/^\d+$/.test(m[2]))       textSlot = parseInt(m[2], 10);
			else if (/^(?:vim|bc|f)$/i.test(m[2])) textSlot = m[2].toLowerCase();
			else {
				const k = m[2].toLowerCase();
				text = BAR_DIRECTIVE_TEXT[k] || null;
				if (text) textTheme = k;
			}
		}
		// Consumed whether or not it was recognised: :b7 is a typo for a
		// directive, and leaving it in the row would print ":b7" in the bar
		// rather than showing the writer that it did nothing.
		rest = rest.slice(m[0].length);
	}
	return { bg, text, bgSlot, textSlot, bgTheme, textTheme, rest };
}

// Parse a colour into [r, g, b]. Handles the two syntaxes that can actually
// reach a fade: the palette's hex (3/4/6/8 digit) and getComputedStyle's
// rgb()/rgba() for the bar's own read-back colour. Anything else — including
// the literal 'transparent' an unset bar leaves behind — is null, and the
// mixer falls back to the other end rather than guessing.
export function parseColorRGB(str: string) {
	try {
		const s = String(str).trim();
		if (s[0] === '#') {
			let h = s.slice(1);
			if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
			if (h.length < 6) return null;
			return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
		}
		const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(s);
		if (m) return [1, 2, 3].map(i => Math.round(parseFloat(m[i])));
		return null;
	} catch { return null; }
}

// A stepped mix for the fade bands. Plain sRGB interpolation on purpose:
// the bands are DISCRETE steps (the p10k pixel look), so the perceptual
// smoothness a Lab-space mix buys is invisible at three to eight bands,
// and sRGB round-trips exactly through the hex the palette stores.
export function mixColors(a: string, b: string, t: number) {
	const ca = parseColorRGB(a), cb = parseColorRGB(b);
	if (!ca && !cb) return 'transparent';
	if (!ca) return String(b);
	if (!cb) return String(a);
	const m = (i: number) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
	return 'rgb(' + m(0) + ', ' + m(1) + ', ' + m(2) + ')';
}

// HSL both ways, for the vivify stage. The tables stay upstream-faithful —
// muted surfaces and blue accents are what those schemes ARE — so anything
// that needs to be LOUD (the cursor, the Vim modes, selection, bold) is
// DERIVED: take the slot's hue, raise the saturation, find a lightness that
// reads. Colour comes from the derivation; fidelity stays in the table.
// Subsequence fuzzy scoring: every query character must appear in order,
// and the score rewards the two things that make a match feel right —
// characters that land TOGETHER, and characters that land at the start of
// a word. "tn" finds Tokyo Night, "opt" finds Operandi Tinted, and a
// scattered coincidental match sinks below a tight one rather than being
// excluded, because excluding it is how a finder loses the item somebody
// is actually looking for.
//
// Case-insensitive; the query is pre-lowered by the caller once, rather
// than per candidate, because this runs across every item of every row on
// each keystroke.
export function barMenuFuzzy(q: string, text: string) {
	if (!q) return 0;
	const t = text.toLowerCase();
	let ti = 0, score = 0, streak = 0;
	for (let qi = 0; qi < q.length; qi++) {
		const c = q[qi];
		let found = -1;
		for (let i = ti; i < t.length; i++) {
			if (t[i] === c) { found = i; break; }
		}
		if (found === -1) return -1;
		// A word start is worth more than a letter in the middle of one.
		const atWordStart = found === 0 || /[\s/\-_(]/.test(t[found - 1]);
		score += atWordStart ? 8 : 1;
		streak = (found === ti && qi > 0) ? streak + 1 : 0;
		score += streak * 4;
		ti = found + 1;
	}
	// Shorter labels win ties: an exact-ish hit on "Nord" should outrank
	// the same letters scattered through a longer name.
	return score - Math.min(t.length, 40) * 0.1;
}

export function colorToHsl(str: string) {
	const p = parseColorRGB(str);
	if (!p) return null;
	const r = p[0] / 255, g = p[1] / 255, b = p[2] / 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
	const l = (mx + mn) / 2, d = mx - mn;
	const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d !== 0) {
		if (mx === r)      h = ((g - b) / d) % 6;
		else if (mx === g) h = (b - r) / d + 2;
		else               h = (r - g) / d + 4;
		h *= 60; if (h < 0) h += 360;
	}
	return { h: h, s: sat, l: l };
}

export function hslToHex(h: number, s: number, l: number) {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0, g = 0, b = 0;
	if (h < 60)       { r = c; g = x; }
	else if (h < 120) { r = x; g = c; }
	else if (h < 180) { g = c; b = x; }
	else if (h < 240) { g = x; b = c; }
	else if (h < 300) { r = x; b = c; }
	else              { r = c; b = x; }
	const hx = (v: number) => ('0' + Math.round((v + m) * 255).toString(16)).slice(-2);
	return '#' + hx(r) + hx(g) + hx(b);
}

// Separator width as a fraction of the row's height, which is the same
// thing as the arrow's sharpness. The apex sits at (w, h/2) and the base
// runs (0,0) to (0,h), so the nose measures
//
// 2 · atan((h/2) / w)  =  2 · atan(0.5 / aspect)
//
// 0.34 -> 112 degrees    0.50 -> 90    0.85 -> 61    1.05 -> 51
//
// WIDER IS POINTIER. A long shallow triangle has a sharp nose; a short
// stubby one is blunt. (Not 2·atan(2·aspect), which is the COMPLEMENT —
// the two agree at exactly 0.5, the one value that cannot reveal the
// mistake.) 1.05 is a 51-degree nose: clearly sharper than 61, and still
// a triangle with a body rather than a needle.
//
// A constant, not a setting: a slider was the wrong shape for it — the
// writer has no way to judge the number without dragging it — and it put
// a wire-format key (BAR_KEYS index 56) behind a question nobody wanted
// asked. That key stays in the table; it cannot be removed, only stopped
// being read.
export const PL_SEP_ASPECT = 1.05;

// The same four surfaces as BAR_DIRECTIVE_BG, as raw variable NAMES: a
// segment's colour ends up in an SVG `fill` attribute on its separators, and
// custom properties do not resolve in presentation attributes — so these are
// read from the computed style instead (themeSurfaceColor).
//
// A LIST per slot, tried in order, for the same reason b4 carries a var()
// fallback above: --background-tertiary is not part of core Obsidian. The
// first name that resolves to anything wins, and if none do the caller falls
// through to the auto colour rather than painting a segment black.
export const PL_THEME_BGS: Record<string, string[]> = {
	b1: ['--background-primary'],
	b2: ['--background-secondary', '--background-primary'],
	b3: ['--background-secondary-alt', '--background-secondary', '--background-primary'],
	b4: ['--background-tertiary', '--background-primary-alt', '--background-primary'],
	bs: ['--status-bar-background', '--background-secondary', '--background-primary'],
	// The caret with no Cursor-Smith to ask: Obsidian's own — which its
	// default theme sets to the text colour, the same value this plugin's
	// stylesheet writes for the editor. cursorColor() walks this AFTER
	// asking Cursor-Smith, which owns the caret whenever it is installed.
	bc: ['--caret-color', '--text-normal'],
};

// A segment's ;tN, as a var() — this one can be, because it is set as the
// `color` property rather than as an SVG attribute.
export const PL_THEME_INKS: Record<string, string> = {
	t1: 'var(--text-normal)',
	t2: 'var(--text-muted)',
	t3: 'var(--text-faint)',
};

// The same slots as raw variable NAMES, for the BAR directive, which has to
// know whether a surface actually paints before it stamps one. See
// resolveBarDirective.
export const BAR_THEME_INK_VARS: Record<string, string[]> = {
	t1: ['--text-normal'],
	t2: ['--text-muted', '--text-normal'],
	t3: ['--text-faint', '--text-muted', '--text-normal'],
};

// The official Obsidian crystal as one path, its four facets separate
// subpaths so the facet lines are gaps in the fill. From simple-icons
// (CC0 path data); see buildObsidianIcon for the trademark note.
export const OBSIDIAN_ICON_PATH = 'M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z';

// Doubling turns a character into a SOFT mark: drawn in the row's own
// foreground, inside one colour block instead of between two — the
// hairline short and faint, the chevrons the same line bent to a point
// and drawn as an outline stroke (buildSoftChevron), the way p10k's thin
// dividers sit inside a block. Only three exist, and the set is
// deliberately short rather than symmetric: a soft mark has to stay
// legible at a few pixels of foreground colour, and round, twin and wave
// forms read as specks. Chevrons keep a clear direction and the hairline
// is unmistakable at any size. Backslash is excluded regardless: a
// doubled backslash already means a literal one. (A 1px rule at the
// bar's full height is not among them: spelled `||` it puts a third
// meaning on the one character that is already the straight divider,
// and spelled `;;` it is the same two stacked dots as `::` at the size a
// row is written and scanned.)
//
// Doubling is NOT universal. A doubled character with no entry here
// falls through to the tokenizer, which splits on each half as a hard
// divider — the empty segment between them is then dropped by the
// collapse pass, so `{a} )) {b}` renders as a single round join rather
// than as an error. That is the intended degradation.
//
// All three work in a PLAIN row as well as a powerline one: nothing
// about a mark in the row's own foreground needs a coloured block behind
// it — that is what makes it soft. renderStatusSection does the same
// split as renderPowerlineSection, and since the powerline renderer
// hands it pieces that are already split, the two do not collide. Sizing
// differs and only sizing: a segment gives the marks a definite height
// to stretch into and a plain section does not, so the stylesheet sizes
// them from the bar's font there (see .ws-pl-soft).
export const PL_SOFT: Record<string, string> = {
	'::': 'ws-pl-soft',
	'>>': 'ws-pl-soft ws-pl-chev-r',
	'<<': 'ws-pl-soft ws-pl-chev-l'
};
export const PL_SOFT_SPLIT = /(::|>>|<<)/;


export const DEFAULT_SETTINGS = {
	// ── Themes ──────────────────────────────────────────────────────────────
	// Which colour SCHEME is dressing the workspace ('custom' = none), the
	// writer's own ordering of the shelf, and the schemes they have removed
	// from it. Order is priority, exactly as Obsidian's own font list works:
	// the list you see is the list you curated. None of these is in BAR_KEYS
	// — a scheme is this vault's clothing, not a bar design to share.
	// The kill switch. Off, the whole theme system stands down — no class,
	// no variables, no cursor writes — while every choice below survives for
	// the day it comes back on. A kill switch that forgot your shelf would
	// be a reset button wearing the wrong name.
	barThemeEnabled: true,
	barTheme:       'custom',
	barThemeOrder:  [] as string[],
	// A FRESH INSTALL SHOWS NINE: the ones most writers know by name stay
	// on the shelf, the other sixteen wait as pills below it, one tap from
	// coming back. A vault that has saved keeps its own.
	barThemeHidden: [
		'modus', 'quiet', 'habamax', 'modus-deuteranopia', 'modus-tritanopia',
		'monokai', 'nightfox', 'kanagawa', 'github', 'everforest', 'vimblue', 'flexoki',
		'selenized', 'iceberg', 'papercolor', 'ayu',
	] as string[],
	// ── The menu's own layout ─────────────────────────────────────────────
	// The Alt+X palette, arranged from the Menu tab the way the theme
	// shelf is: order is an id list ([] = the shipped order), hidden is a
	// quiet shelf nothing is deleted from, and separators are writer-made
	// `rule-N` ids that live in the order like anything else.
	//
	menuOrder:      [] as string[],
	menuHidden:     [] as string[],
	// Pinned commands are `cmd:<obsidian-command-id>` entries in the order
	// above, and this is what each is CALLED: the writer's own short name,
	// editable from the card whenever they like. An id with no entry wears
	// its stripped default (menuDefaultAlias), so clearing the field is the
	// revert path and there is no reset button to explain.
	menuAliases:    {} as Record<string, string>,
	// Which entries CONTINUE the line above rather than starting their own.
	// The order stays one flat list — reading order, left to right then
	// down — and this is the only thing that says where a line breaks. An
	// id that is absent starts a line. THE SHIPPED MENU IS PAIRED: Syntax |
	// Prose, Font | Markers, Theme | Light / Dark, Report | History,
	// Organizer | Export, with Search, Modes and the rule on lines of their
	// own — the second of each pair continues the line (see `menuLayout` for
	// the order). A vault that saved its own list keeps it; an empty list
	// is a single column.
	menuJoined:     ['prose', 'markers', 'lightdark', 'history', 'export'] as string[],
	// How each separator draws — layout id → solid / dashed / dotted /
	// double. A rule is the one thing on this shelf with nothing to say,
	// so its only setting is how it looks. Absent means solid.
	menuRuleStyles: {} as Record<string, string>,
	// The menu as a DOCKED PANEL as well as a pop-up: a leaf you can drag
	// under the file tree and jump to with quick cycle, rather than a
	// window you summon and dismiss. ON by default: a new install otherwise
	// shows nothing at all until the writer finds a setting they have no
	// reason to look for. Turning it off is one click and the pane's
	// position is remembered.
	menuDock:       true,
	// WHAT THE TARGET CELL SAYS: 'percent', or 'ratio' (2,145/5,000, which
	// carries the progress AND the number it is against). Percent keeps the
	// column narrow, and a folder's cell says both numbers whichever way
	// the notes read.
	orgTargetShow: 'percent',
	// THE DEADLINE CELL SHOWS the date and the working days left, "20 Oct 2026 · 8d" (A735, the writer: "show the deadline
	// date too and 8d"), or one of them: 'both' | 'days' | 'date'. One column (A731), not a Days left that hung on it.
	orgDeadlineCell: 'both',
	// WHERE THE ORGANIZER, EXPORT AND HISTORY OPEN (#73, Maja-Nune: "I prefer it opens a new tab in the current
	// workspace"): 'split', a split to the right of the note, as they always have; or 'tab', a new tab in the note's own
	// group. A second of ours joins the first's group either way.
	paneOpenIn: 'split',
	// ── THE ORGANISER'S OWN ICONS, ONE SWITCH EACH ──────────────────────
	//
	// TWO KEYS, NOT ONE, like the pair they are modelled on:
	// `fileTreeFolderIcons` and `fileTreeKindIcons` are separate switches on
	// the File tree tab, and a writer who wants folders marked and files
	// plain has to be able to say so.
	// The marker for the one-time flip in loadSettings; see the note there.
	fileIconsOffOnce: false,
	orgFolderIcons: true,
	// OFF: a folder glyph tells a folder from a note at a glance; a glyph on
	// every note tells you what you already know from the row it is in. The
	// switch stays, because a switch is one click back.
	orgFileIcons: false,
	// The scheme's reach, each independently togglable in the Theme tab.
	// SIMPLIFIED collapses every surface to the editor's colour (one wash);
	// off, each surface takes its own step of the theme's ramp. Headings and
	// code pull accents from the scheme. Cursor hands the scheme's inks to
	// Cursor-Smith, if it is installed.
	barThemeHeadings:   false,
	barThemeCode:       false,
	barThemeSimplified: false,
	barThemeCursor:     false,
	barThemeVim:        false,
	barThemeBorderless: false,
	// The shape of a task checkbox: '' leaves Obsidian's (or your theme's)
	// alone, which is why the default is empty rather than 'square'.
	barThemeCheckbox:   '',
	// The Glass look is gone, but while it was on it borrowed Obsidian's own
	// `translucency` setting; a vault that ran it still has that borrow
	// outstanding. The repayment runs once, on load, and clears itself —
	// see barThemeGlassRepay.
	barThemeGlassStash: null as boolean | null,
	barThemeMarkdown:   false,

	// ── Master switch ─────────────────────────────────────────────────────────
	pluginEnabled:            true,

	// ── Scope ─────────────────────────────────────────────────────────────────
	// An empty list means every note, in either mode. That is the only sane
	// default: a scope feature that starts out excluding everything would look
	// exactly like a broken plugin.
	scopeMode:                'include',  // 'include' | 'exclude'
	scopePaths:               [] as string[],
	// Notes and folders that Word-Smith still WORKS in but never COUNTS: an
	// outline, a research folder, a scratch file inside the manuscript. Kept
	// separate from scopePaths because the two answer different questions —
	// that one is "leave this note alone entirely", this one is "help me write
	// it, just do not put it in the total". NULL rather than [] for the reason
	// every nested default here is: the merge in loadSettings is shallow.
	countExclude:             null as string[] | null,

	// ── Zen mode ──────────────────────────────────────────────────────────────
	// zenEnabled ships off while zenMode ships on. That is not a contradiction:
	// the plugin installs quietly, and the Zen tab's single switch — or the Z
	// badge — then brings up focus mode and the letterbox together, already
	// configured. Turning focus mode on at install would collapse
	// sidebars and hide the entire UI the moment a new user installs the
	// plugin, before they know what's happening or how to exit.
	zenMode:                  true,
	fullscreen:               false,
	leftSidebar:              true,       // saved state (was collapsed when entering zen)
	rightSidebar:             true,
	hideProperties:           true,
	hideInlineTitle:          true,
	zenHideWindowTitle:       true,
	hideStatusBar:            true,
	hideLinkedMentions:       true,
	hideScrollBar:            true,
	hideRibbon:               true,
	// Zen sub-options that hide things this plugin owns, rather than
	// Obsidian's. Kept beside the rest of the hide group so the tab reads as
	// one list, but note they are NOT bar presets: a preset describes how the
	// bar looks, and whether zen hides it is a property of zen.
	// ON BY DEFAULT (A480, the writer: "for zen, add hide powerline by
	// default"): zen is the empty page, and the bar still peeks from the
	// bottom edge. A vault that saved `false` keeps it — this is a default.
	zenHideBar:               true,
	// How long the bar lingers after the pointer leaves the strip it hides
	// in. 0 turns peeking off entirely, which is the off switch — a separate
	// toggle for it would be a second control for one decision.
	barPeekMs:                2000,
	// Breathing room between the caret and whatever occupies the edge of the
	// window: the bar, the vim command line, the letterbox. Enforced through
	// CodeMirror's scrollMargins (see caretFloorY), which is the one route
	// that has ever reached the editor; CSS padding never did.
	caretMarginPx:            0,
	// Escape leaves zen. Off-limits in vim's insert/visual/replace modes
	// whatever this says — see the keydown handler — so it costs a vim user
	// one extra keystroke rather than a keybinding.
	zenEscExits:              true,
	// ZEN'S SIDE PANES (A578, desktop): the look (a shade off the note, cut
	// straight, the icons at the foot), and four ways they behave, each its own
	// switch under it: controls quiet until the pointer is over a pane, the
	// panes dimmed while the caret is in the note, a peek from the window's
	// edge, and a pane floating over the note instead of pushing it aside.
	zenPanes:                 true,
	// Measured height of the vim command line, so the gutter can be
	// reserved at the right size before the first `:` of a session.
	vimPanelHeight:           23,
	// ── HOW FAR THE BAR SITS FROM THE BOTTOM ─────────────────────────────
	//
	// 23 FOR EVERYONE, new vault and old: the vim gutter was reserved
	// unconditionally at that height before this was a choice, so nobody
	// sees anything move on the upgrade. No migration writes it: the default
	// IS the answer.
	//
	// AND IT IS NOT `vimPanelHeight`, one line up. That is a MEASUREMENT —
	// how tall this vault's `:` line actually is — and this is a CHOICE.
	// They happen to be 23 on this machine and that is a coincidence of the
	// theme, not a shared fact.
	barBottomGap:             23,
	focusedFileMode:          false,

	// ── Typewriter / letterbox ────────────────────────────────────────────────
	enableTypewriter:         false,
	editorPaddingH:           100,
	// The Zen tab's master switch. Focus mode and letterbox are its two
	// halves; the Z badge in the bar toggles this, not focus mode alone.
	zenEnabled:               false,
	zenTitlebarMatch:         true,     // paint the window title bar like the editor
	enableLetterbox:          false,
	letterboxLines:           8,
	letterboxPx:              95.81700000000001,
	// THE BAND IS THE WORDS' WIDTH (A672, issue #55): maskPaddingH (the arrows' own inset), maskMatchText
	// and maskMatchTextPadded (a choice of widths) are retired; the band's sides drag the text's margins
	maskOverhang:             4,
	// how solid the masks are (A673): 1 hides the lines above and below the band, lower lets them show faintly
	maskOpacity:              1,
	arrowStyle:               "solid-triangle",
	arrowLineEnds:            false,     // cap each separator line with an arrow
	customArrowTop:           "^",
	customArrowBottom:        "v",
	arrowCount:               5,
	arrowScale:               0.7,
	separatorStyle:           "solid",
	separatorWeight:          2,
	highlightCurrentLine:     false,
	lineHighlightDarkColor:   "#a8a8a4",
	lineHighlightLightColor:  "#707070",
	lineHighlightOpacity:     0.15,
	// THE CURRENT LINE MARKED UNDER (#82, Dalibor-P: "option to underline the current line, instead of filling the
	// background of the line"; the writer: "line width 1-3 px, colors for dark and light, dashed, dotted, opacity … a
	// dropdown highlight or underline"): the same colors and opacity as the tint
	// …AND ONE ABOVE IT TOO (A850, the writer: "add option for top and bottom line too"), AS ONE CHOICE WITH TWO TICKS
	// (A852: "a single option called line with toggles for top and bottom"): Line, a line on top and one at the bottom
	lineHighlightStyle:       'fill',      // 'fill' | 'line'
	lineTop:                  false,       // Line: a line above the row
	lineBottom:               true,        // Line: a line under the row (the underline, #82)
	lineUnderlineWidth:       2,           // px, 1 to 3
	lineUnderlineStyle:       'solid',     // 'solid' | 'dashed' | 'dotted'
	// WHERE THE CARET RESTS, as a percentage of the editor's height: 0 is
	// the very top, 50 the middle, 100 the bottom.
	//
	// It replaces `typewriterLinesAbove` / `typewriterLinesBelow`, which
	// counted nothing. Those two were reduced to `above / (above + below)`
	// and multiplied by the VIEWPORT height, so 8/8, 2/2 and 20/20 were
	// byte-for-byte identical, and "4 lines above" actually meant "a
	// quarter of the way down the screen" whatever the font size. Two
	// inputs, 1681 combinations, one ratio, and a writer who changed a
	// number and saw nothing happen. One number that says what it does.
	// The migration in loadSettings carries every old pair over exactly,
	// because the old pair already WAS this number.
	typewriterAnchor:         50,
	// SCROLL WHEN YOU CLICK (#88, Dalibor-P): a click brings its line to the rest, as it always did; off, the page
	// stays still under a click, so a double or triple click selects what was pressed, and the line moves at the
	// first key that types or moves the caret (the editor asks then)
	typewriterScrollOnClick:  true,
	dimUnfocusedEnabled:      false,
	dimFocusMode:             'paragraph', // 'paragraph' | 'sentence'
	dimOpacity:               0.55,

	// ── Retro status bar ──────────────────────────────────────────────────────
	// A PHONE'S OWN OPT-IN for the bar: the master beside it syncs across
	// devices; this says whether a phone shows it at all. Off, because a
	// 360px screen has no room for a status line.
	retroBarOnPhone:          false,
	enableRetroStatus:        true,
	// Toggled by command rather than by hover. Three attempts at an
	// auto-hiding bar all foundered on the same thing: a full-width strip
	// living next to Obsidian's own chrome keeps colliding with it.
	retroBarHidden:           false,
	// statusRows is the source of truth for bar content. The old flat
	// statusFormatLeft/Center/Right keys are folded into row 0 on load and
	// then deleted, so there is never a second place holding the same text.
	// ONE ROW: the bar draws one (getStatusRows). `statusBarRows` and the two
	// empty rows every vault carried are deleted on load (A508).
	statusRows:               [
		{ left: ':b2{obsidian}:6>{ggggg}{ggggg}{ggggg}|{file}:vim>{ggggg}>{ggggg}>{ggggg}>{ggggg}~',
		  center: '<{ss}{mode}:7/{syntax}::{prose}:2|{font}\\{report}:vim<',
		  right: '~{markers}{paragraph}~{words} words){clock}{time}' },
	],
	fileTokenFormat:          'path',     // 'path' (~/folder/name) | 'name' (basename only)
	// WHAT THE {target} PANEL'S ROWS COUNT (A778, the writer: "let's add option for today, if there is deadline else full and
	// full"): 'today' (today's share while a deadline runs, else the whole goal) | 'full' (always the whole goal)
	targetPanelShows:         'today',
	// THE WELCOME SHOWN (A743): false on a new install, which opens it once; a vault that had settings before it, or
	// whose setup came back from ws-settings.md, is not new
	welcomeShown:             false,
	targetTokenFormat:        'percent',  // {target}: 'ratio' (2,145/5,000) | 'today' (500, today's share to go) | 'percent' (43%)
	                                     //   | 'bar' | 'icon' (A754: five, numbers only; whose goal, A726's targetTokenFollows, went)
	timeTokenFormat:          '24h',      // {time}: '24h' (14:05) | '12h' (2:05 PM)
	// {wpm} (A730, issue #65): 'gauge' (the gauge and the speed now) | 'gaugeonly' | 'momentum' (A788) | 'now' | 'today'
	// (A742; A738: no 'best'; A788: no 'avg', and words a minute only, no wpmTokenUnit)
	wpmTokenFormat:           'gauge',
	// {wpm}'s day (A742): today's typed characters and the time spent typing, a new record each day
	wpmDay:                   { date: '', chars: 0, activeMs: 0 },
	// 'icon' (the silhouette alone) | 'name' (the word alone, for a bar in a
	// face where an inline SVG sits badly) | 'both'.
	//
	// THE SILHOUETTE ALONE, by default. A bar is a width budget and the flag
	// is the only reading on it that can be told in a picture — spending six
	// characters on "revise" beside a shape that already says it is the
	// budget going the wrong way.
	flagTokenFormat:          'icon',
	statusBarBorderStyle:     'none',     // matches the mask separator options
	statusBarBorderWidth:     1,           // 0–8 px, 0 the hairline; 'none' style hides it
	// Which edges the rule is drawn on. The style dropdown turns BOTH off
	// at once; these pick one. Default to the old behaviour, which drew
	// both regardless of the setting being labelled "Top border".
	statusBarBorderTop:       true,
	statusBarBorderBottom:    false,
	statusBarFontSize:        15,
	// The bar's type follows the editor's own size (--font-text-size),
	// Ctrl+scroll zoom included, instead of the fixed slider above.
	statusBarFontFollowNote:  true,
	// THE INTERFACE FONT FOR THE BAR: off, the bar follows the font chosen
	// through the font token; on, Obsidian's own face whatever the note is
	// in.
	statusBarUiFont:          false,
	statusBarHeight:          16,
	statusBarPadTop:          2,         // breathing room above the rows
	statusBarPadBottom:       2,         // and below them
	// ── Powerline ──────────────────────────────────────────────────────────
	// Segments are split on a divider character, and the character chosen
	// sets that boundary's shape (see PL_DIVIDERS). Inside a segment, ::
	// draws a soft divider. A colour is chosen per segment by suffixing any
	// token in it with :N — {file}:2, or {file} :2 if you want the space.
	powerlineModeColors:      true,
	// Six, numbered 1-6 the way they are written in a row. Defaults are a
	// muted spread rather than six shouts: the loud bar is the classic way
	// a homemade statusline becomes unreadable at 13px.
	powerlineColor1:          "#4f9dde",
	powerlineColor2:          "#3f4550",
	powerlineColor3:          "#2f333c",
	powerlineColor4:          "#4caf7d",
	powerlineColor5:          "#307853",
	powerlineColor6:          "#8a7fd1",
	powerlineColor7:          "#cc141d",
	// Mode colours, set beside the mode labels in the Vim tab. A segment
	// suffixed :vim follows whichever of these matches the live mode.
	// Light-theme variants of all eleven, added in 1.12. The originals above
	// are the DARK set — they keep their names, their values and their
	// BAR_KEYS indices, because both the key order and those default values
	// are a share-code wire format.
	//
	// Not copies of the dark set: on a light bar the two quiet neutrals have
	// to be light greys rather than slates, and the near-white default ink
	// has to become near-black. A palette that merely survives the switch is
	// not the same as one designed for it.
	powerlineColorLight1:     "#2d6da4",
	powerlineColorLight2:     "#d9dce1",
	powerlineColorLight3:     "#eceef1",
	powerlineColorLight4:     "#2f8a5b",
	powerlineColorLight5:     "#b96f1e",
	powerlineColorLight6:     "#6a5cb8",
	powerlineColorLight7:     "#a2404f",
	// When Cursor-Smith is installed and theming the caret per vim mode, take
	// its colours instead of the five below, so the bar and the cursor agree.
	vimFollowCursorSmith:     true,
	vimColorNormal:           "#4f9dde",
	vimColorInsert:           "#4caf7d",
	vimColorVisual:           "#8a7fd1",
	vimColorReplace:          "#c2544d",
	vimColorCommand:          "#e0913a",
	// The same five for a light theme. A mode colour is read at a glance
	// against the bar behind it, so the dark set's brightness is exactly
	// what makes it wrong on a pale bar.
	vimColorNormalLight:      "#2d6da4",
	vimColorInsertLight:      "#2f8a5b",
	vimColorVisualLight:      "#6a5cb8",
	vimColorReplaceLight:     "#a03c36",
	vimColorCommandLight:     "#b96f1e",
	// ── Goals ────────────────────────────────────────────────────────────────
	// A note's target and its flag live in the structure file, which a writer
	// can read and edit and which outlives a reinstall. (The vault-wide
	// `goalTarget` and the label mode went in 1.6.8, A508: nothing read them.)
	// LEGACY PATHS, kept because a vault that moved either file said where it
	// wanted it, and that is the address the migration looks at first. Neither
	// is written to again once the structure file exists — see
	// `structureMigrate`. They are not deleted from the defaults, because a
	// key that vanishes takes with it the only record of where a writer put
	// their file.
	goalsPath:                'Word-Smith/ws-goals.md',
	exportListPath:           'Word-Smith/ws-export.md',
	// …and the one file both of those became. The order, the export ticks and
	// the goals are one manuscript's shape, so they are one file.
	structurePath:            'Word-Smith/ws-structure.md',
	// A READABLE MIRROR of data.json, written one way. On, because the case it
	// exists for is the one where nobody thought to turn it on: a reinstall,
	// or a vault restored from a backup that kept the notes and not the
	// plugin folder.
	// A one-off migration flag, kept so the rename above decides exactly once
	// and can never overrule a writer who renames it back.
	outlineFlagRenamed:       false,
	// The order the columns are read in, per writer. A LIST OF IDS applied as
	// a sort rather than used as the list itself — see `colRank` for why a
	// column added in a later version must not be dropped by an order saved
	// before it existed.
	uniColOrder:              [] as string[],
	// ── THE NEW ORGANIZER (RULES-OF-THE-WINDOW.md) ──────────────────────────
	// The selected folder in the Organizer tab, kept across sessions. Empty
	// means the whole vault. Written by ONE function (`orgSelect` in the
	// window) and nothing else.
	organizerFolder:          '',
	// THE PIN: on, the explorer's door is shut — a note opened elsewhere and
	// a folder clicked there leave the pane on `organizerFolder`; the pane's
	// own crumbs still move it. The button on the path line is the one
	// writer.
	organizerPinned:          false,
	// Which KINDS of file the Outliner's tree draws. Group ids from
	// `uniTypeGroups` — ALL of them by default, decided by the vault that
	// asked for this: the request was "all the file types in it", with the
	// menu's one-click "Notes only" as the way back. NOT what
	// the compile consumes: the compile keeps its own extension check at the
	// point of consumption, and the two rules have one owner each. The list
	// is written out rather than computed because DEFAULT_SETTINGS is a
	// plain literal read before the class exists — keep it equal to the ids
	// in `uniTypeGroups`.
	uniTypes:                 ['md', 'image', 'canvas', 'base', 'pdf', 'audio', 'video', 'other'],
	// Set the first time a history store is written or found. See
	// `historyWrite`: it is what stops an unready vault index being read as
	// "there is no history here" and a second, empty file being made beside
	// the one holding the record.
	historySeen:              false,
	settingsMirror:           true,
	settingsMirrorPath:       'Word-Smith/ws-settings.md',
	fileGoals:                {} as Record<string, number>,   // note path -> word target
	// …and where each one is up to, by flag id, absent for unmarked. Same
	// keys, same file (`ws-goals.md`), because a status is the same kind of
	// fact as a target — the writer's own note about their own manuscript,
	// which has to outlive a reinstall and be editable by hand. See
	// WS_STATE_IDS.
	fileStatus:               {} as Record<string, string>,   // note path -> flag id
	// GOALS WITH A DATE (A700). A FOLDER'S OWN TARGET, by folder path, the vault's root as '' (the writer: folders get
	// their own target, and the sum of their notes' targets is gone). NOT `folderGoals`, a retired name every load deletes.
	folderTargets:            {} as Record<string, number>,
	// …a deadline, a local day YYYY-MM-DD, on a note or a folder, by path. Both live in ws-structure.md beside the targets.
	goalDeadlines:            {} as Record<string, string>,
	// the days of the week that count toward a deadline, as the digits of Date.getDay() (0 is Sunday): every day
	goalWorkDays:             '0123456',
	// THE DAY (A700): each goal's count the first time it was read today, which today's share is worked out from so
	// it holds still all day (its `met`, the celebration's latch, went with it, A786)
	goalDay:                  { date: '', start: {} as Record<string, number> },
	// THE DAILY TARGET (PR #93, A879): how many words a day the writer means to write, 0 for none. {dailytarget} says
	// today's words over it, 356/1,000, or today's words alone while it is 0
	dailyWordGoal:            0,
	// …and how {dailytarget} says it: 'ratio' (356/1,000) | 'percent' (36%) | 'bar' (the bar alone)
	dailyTargetFormat:        'ratio',
	// …and TODAY'S WORDS while History is off, a new record each day: each note's count the first time it was seen today
	// (`start`, read from the saved note, never the editor mid-switch) and its count now (`last`, live). Today's words are
	// what the notes gained between the two, summed: a deletion takes words back. `reset` is today's figure when Reset
	// was pressed (History's or this record's), and the token says what came after it, never below zero
	dailyWords:               { date: '', start: {} as Record<string, number>, last: {} as Record<string, number>, reset: 0 },

	// The bar's top and bottom rules. Their own colours now rather than
	// var(--ws-text): the rules are the one part of the bar that reads as a
	// frame around it, and a frame that always matches the text has no way
	// to be quieter than the text. Top and bottom separately, because a bar
	// sitting against the window edge usually wants only the top one to
	// carry any weight. The defaults are the theme text colours these
	// resolved to before, so an upgrading vault sees no change.
	barRuleDarkTopColor:      "#fbfaf9",
	barRuleDarkBottomColor:   "#fbfaf9",
	barRuleLightTopColor:     "#16181d",
	barRuleLightBottomColor:  "#16181d",
	// What the {font} and {markers} buttons say. 'glyph' is the specimen
	// ("Aa", "\u00b6"); 'word' spells it out. Two settings rather than one,
	// because the buttons are different widths and a writer trading room
	// for legibility does it one button at a time.
	fontTokenFormat:          'glyph',   // 'glyph' (the menu's icon) | 'word' (Fonts) | 'both'
	markersTokenFormat:       'glyph',   // 'glyph' (the menu's icon) | 'word' (Markers) | 'both'
	// THE OTHER EIGHT: { modes | syntax | prose | theme | report | history |
	// export | organizer: 'icon' }; a token absent from the map shows its
	// word. One key, so a preset or a share code carries it whole.
	barTokenIcons:            {} as Record<string, string>,   // token id -> 'icon' | 'both'
	// Off, the arrows and the separator lines take the theme's text colour —
	// they are furniture around the writing, not a feature that should be
	// announcing itself in a colour of its own. The four pickers below are
	// what "on" reaches.
	letterboxCustomColors:    false,
	arrowDarkColor:           "#fbfaf9",
	arrowLightColor:          "#080808",
	lineDarkColor:            "#faf8f5",
	lineLightColor:           "#030303",

	// ── Misc options ──────────────────────────────────────────────────────────
	miscEnabled:              false,
	// The Layout rows apply only while Zen is on (A481, the writer: "add a
	// option to enable to toggle layout options when zen is enabled"): the
	// book page in Zen, Obsidian's own page out of it. Read through
	// `layoutOn`, never directly.
	layoutZenOnly:            false,
	// PAGE MODE: the text column drawn as a page, a contour on a darker
	// ground, as wide as the padding and line length make it. A Layout row,
	// read through `textOpt`.
	pageView:                 false,

	// ── Text options ──────────────────────────────────────────────────────────
	enableParagraphIndent:    false,
	paragraphIndentEm:        4,
	paragraphIndentMode:      'single',   // 'double' | 'single'
	lineSpacing:              1.5,
	// '' = whatever the theme sets, and that is the only defensible shipped
	// value: a real font name here restyles every note in a face the writer
	// had not chosen (issues #4 and #6), and with the only control for it
	// the {font} button on the bar, a preset without that token left no way
	// to find the switch. A plugin may add things to Obsidian. It may not
	// quietly redecorate what was already there.
	editorFont:               '',
	// One-shot: see the migration in loadSettings.
	editorFontDefaultCleared: false,
	limitLineLength:          false,
	maxLineChars:             64,
	justifyText:              true,
	// HEADINGS IN THE MIDDLE OF THE LINE, a Layout row, off by default: the
	// editor's heading lines and the reading view's, in a note in scope.
	centerHeadings:           false,
	// PARAGRAPH NUMBERS, in the left margin, off by default. PROSE
	// paragraphs only: not list items, not tasks, not headings, callouts,
	// quotes, tables or code. A manuscript's paragraphs are the unit an
	// editor refers to ("cut the third paragraph"), and numbering the
	// bullets in a shopping list alongside them would make the count mean
	// nothing.
	//
	paragraphNumbers:         false,
	markSpaces:               false,
	// MARKERS HAVE THEIR OWN MASTER, and this is a bug fix rather than
	// tidying. They used to live under Text Options and be gated by
	// `miscEnabled` — so ticking "Tabs" in the bar's picker set
	// `miscEnabled = true` to make the marker appear, and that same switch
	// owns `limitLineLength`. A writer who had once set a narrow measure
	// and switched the tab off got their column silently narrowed by
	// clicking a whitespace marker, with nothing in the Markers section to
	// connect the two. Reported from the field as "all my text is
	// formatted to extremely narrow columns that I cannot reverse".
	markersEnabled:           false,
	markTabs:                 false,
	// THE NO-BREAK SPACES, as ° (the writer, 2026-10-15: "do the french spaces toggle and the non-breaking space marker"):
	// U+00A0 and the narrow U+202F, which Language spacing types and which look like any space; on with the markers.
	// A NEW NAME: A768's `markNbsp` is deleted on load since A780
	markNoBreak:              true,
	markParagraphs:           false,
	markEndOfLines:           false,
	markBlankLines:           true,

	// ── Hemingway mode ────────────────────────────────────────────────────────
	// Every lock is individually switchable, but the defaults describe what
	// "Hemingway mode" means when you turn it on: you can type forward and
	// nothing else. Paste is the one exception — pulling in a quote or a note
	// is not self-editing, and blocking it mostly just breaks research.
	hemingwayEnabled:         false,
	hemBlockBackspace:        true,
	hemBlockDelete:           true,
	hemBlockUndo:             true,
	hemBlockCut:              true,
	hemBlockPaste:            true,
	hemBlockArrows:           false,
	hemBlockJumpKeys:         false,     // Home / End / PageUp / PageDown
	hemBlockSelectAll:        false,
	hemBlockMouse:            false,     // clicking to reposition the caret
	hemFlashTarget:           'both',  // 'none' | 'screen' | 'retrobar' | 'both'

	// ── Syntax highlight ──────────────────────────────────────────────────────
	syntaxSkipCode:           true,
	syntaxStyle:              'text',     // 'text' | 'highlight' | 'line'
	checksEnabled:            false,      // master switch over the writing checks
	checkStyle:               'line',     // same options, for the writing checks (Squiggle until 1.5.4; a vault on it moves here)
	checkFiller:              true,
	checkFillerSoft:          false,     // also flag quantifiers/frequency words
	checkFillerColor:         "#8a7fd1",
	checkPassive:             true,
	checkPassiveColor:        "#c2544d",
	checkIllusion:            true,
	checkIllusionColor:       "#d98cc4",
	checkMisused:             true,
	checkMisusedColor:        "#e0913a",
	checkPronoun:             true,
	checkPronounColor:        "#4f9dde",
	// stock phrases (A839, the writer's pick "Clichés"), off like every check added since
	checkCliche:              false,
	checkClicheColor:         "#e0b90f",
	// YOUR OWN CLICHÉS (A856, the writer: "do 3 too"): one a line, the slots a pack's use ({a|b}, {*}); marked as the list's
	customCliches:            '',
	// NEVER MARK (A857, the writer's pick, 2026-10-22): words and phrases no check marks, one a line, read as Your clichés
	// are (a check… key, so the editor's cache of a line's marks hears a change)
	checkNeverMark:           '',
	// Dialogue: everything between quotes, so speech can be found at a
	// glance. Off by default like every other check — a plugin that starts
	// colouring a manuscript before it is asked has overreached.
	checkDialogue:            false,
	checkDialogueColor:       "#4f9dd9",
	// italics (*thought*) and angle brackets (‹ › and < >) count as speech too, for thoughts and telepathy (A711, #68)
	checkDialogueMore:        false,
	// …and your own pairs, under that switch (A729): "<> // <<>>", a space between, each its opener and its closer
	checkDialogueCustom:      '',
	// the plugin's own folder out of sight, its files where they are (A733): the Organizer, the explorer, Export
	hideOwnFolder:            false,
	// …and what the switch put into Obsidian's Excluded files to keep the folder out of the graph and search (#71): the
	// entries it added, the only ones it ever takes out again
	ownExcluded:              [] as string[],
	checkRhythm:              false,
	// SENTENCE RHYTHM'S TINTS, THE THEME'S UNLESS PICKED (A782, the writer: "put the same colors for sentence rythm
	// too"): empty is the theme's yellow, red and green, as Word frequency's bands; a color picked is the writer's
	checkRhythmHardColor:     "",
	checkRhythmVeryHardColor: "",
	checkRhythmShortColor:    "", // by length: the green a short sentence takes (A630)
	checkRhythmMid:           true,      // by length: the middle (past Short up to, short of Long from) tinted too (A658)
	checkRhythmMidColor:      "#5b8dd6", // …a blue, fainter than the other three (the writer: "use a faint blue")
	checkRhythmHardGrade:     10,        // Flesch-Kincaid grade for "hard"
	checkRhythmVeryHardGrade: 14,        // and for "very hard"
	checkRhythmBy:            'grade',   // what the two tints read: 'grade' or 'length' in words (A595)
	checkRhythmLongWords:     25,        // by length: the first tint from this many words
	checkRhythmVeryLongWords: 40,        // and the second
	checkRhythmShortWords:    8,         // and up to this many words, the green (A630)
	checkRepetition:          true,
	checkRepetitionColor:     "#4caf7d",
	repetitionWindow:         50,        // words
	repetitionMinLength:      5,         // ignore short words
	// THE LANGUAGE the syntax and prose checks read (A571): 'en' is built in,
	// any other code is a pack in the vault. Kept by its code, so a pack not
	// yet synced in is English until it arrives, and the choice comes back with it.
	language:                 'en',
	// THE LANGUAGES THE SWITCHER OFFERS (A601), by code, ticked under Prose →
	// Language: the {lang} token's picker and the menu's Language row show English,
	// these, and the one in use.
	languageChoices:          [] as string[],
	// CITATIONS (A572): the library file, the style, the list's heading, a style of one's own in
	// tokens, and the marks while writing
	citeLibrary:              '',
	citeStyle:                'apa',
	citeHeading:              '',
	citeCustomInText:         '{etal} {year}[, {page}]',
	citeCustomAround:         'parens',
	citeCustomEntry:          '{authors-full}. {year}. {title*}.[ {place}:][ {publisher}.]',
	citeMarks:                true,
	// Ibid. in Chicago's notes (#60's rest): off, as Chicago now prefers the short note
	citeIbid:                 false,
	posEnabled:               false,
	posDimOthers:             true,
	// The Writing Checks counterpart of posDimOthers. Ships OFF where the
	// syntax one ships ON, and the difference is not an oversight: syntax
	// mode is a "show me the skeleton" view a writer turns on deliberately
	// and reads all at once, while checks run alongside ordinary writing —
	// fading a whole draft by default would be the plugin redecorating a
	// document nobody asked it to.
	checkDimOthers:           false,
	posNoun:                  false,
	posNounColor:             "#4f9dde",
	posVerb:                  false,
	posVerbColor:             "#4caf7d",
	posAdjective:             false,
	posAdjectiveColor:        "#d98cc4",
	posAdverb:                false,
	posAdverbColor:           "#e0913a",
	posConjunction:           false,
	posConjunctionColor:      "#9aa0a6",
	// a sixth class (A839, the writer's pick "Pronouns in Syntax"): off, a pronoun is a noun as it always was
	posPronoun:               false,
	posPronounColor:          "#8466f0",

	// ── Typography ────────────────────────────────────────────────────────────
	// Off by default: it rewrites the document as you type, and that is not a
	// thing to start doing to someone's notes uninvited.
	typographyEnabled:        false,
	typoSmartQuotes:          true,
	typoCustomQuotes:         false,     // pick the characters yourself
	typoOpenDouble:           "\u201c",
	typoCloseDouble:          "\u201d",
	typoOpenSingle:           "\u2018",
	typoCloseSingle:          "\u2019",
	typoApostrophe:           "\u2019",
	typoQuotesFromLanguage:   true,      // a language pack's own marks are typed (A615)
	// THE LANGUAGE'S SPACES (the writer, 2026-10-15: "do the french spaces toggle"): its pack's `## Spaces`, typed; off
	typoLanguageSpaces:       false,
	// …and with no space typed (#59, "Add the space for you"): the mark straight after a word takes it; off
	typoSpaceForYou:          false,
	typoQuoteStyle:           'us',      // the usual marks: US “ ” outside, UK ‘ ’ outside (A694)
	typoEllipsis:             true,
	typoDashes:               true,
	typoArrows:               true,
	typoComparisons:          false,
	typoGuillemets:           false,
	typoFractions:            true,
	typoCapitalize:           false,

	// ── Sidebar word counts ───────────────────────────────────────────────────
	// Quick panels. Off by default: they add two commands, and a palette
	// that grew entries nobody asked for on upgrade would be the wrong kind
	// of surprise. Switching one on is what puts its command in the palette
	// (see the checkCallback in onload).
	quickExplorer:            false,
	quickOutline:             false,
	// ON by default, unlike the other Misc toggles. It is the plugin's front
	// door — everything the bar's buttons do, reachable from one hotkey — and
	// a front door that ships locked is a contradiction. The switch exists
	// for anyone who wants the command out of their palette.
	quickCycle:               false,
	// A sub-option of quickCycle, and off by default because it is the more
	// opinionated half: the sidebar you walked out of shuts behind you.
	quickCycleCloseOnLeave:   false,
	enableFileTreeCounts:     false,
	// A tiny flag beside the count in the file explorer, from the same store
	// the board writes. Its own switch, because the counts are a number on
	// every row and the flags are a mark on the few that carry one.
	fileTreeFlags:            false,
	// ON. FLIPPING THIS ALONE REACHES ALMOST NOBODY, which is why the
	// one-shot below exists: `loadSettings` merges DEFAULT_SETTINGS under the
	// raw file, and `saveSettings` persists the whole merged object — so
	// every vault that has ever saved once already has `treeOrder` written
	// into data.json and raw wins. Only a vault with NO data.json would see
	// this.
	treeOrder:                true,
	// One-shot: see the migration in loadSettings. It turns the order ON
	// once for a vault that predates the default above, and then never
	// again — so a writer who switches it off keeps it off, from the
	// settings tab or from the explorer's own sort menu.
	treeOrderForcedOn:        false,
	treeOrderBackOnce:        false,   // the custom order on again once after A873's unload bug
	fileTreeFolderIcons:      true,
	// THE SAME KIND GLYPH THE MANUSCRIPT WINDOW DRAWS, in Obsidian's own
	// tree. OFF: this paints into somebody else's pane, and a plugin update
	// that rearranges a writer's file tree without being asked is the kind
	// of change that gets a plugin removed.
	fileTreeKindIcons:        false,
	// THE ORGANIZER'S SWITCH, for a writer who does not want the plugin
	// adding files to their vault. Off: the Organizer's doors are shut — the
	// menu row, the window's tab, the command — and
	// `Word-Smith/ws-structure.md` is neither made nor written; a file that
	// exists is read and left alone. The order, goals, ticks and non-note
	// properties are held for the session and not kept. History has its
	// own switch (`historyTracking`), the settings copy has its own
	// (`settingsMirror`); this is the third store's.
	organizerOn:              true,
	// ── WHAT A DAY LOOKS LIKE, ONCE ─────────────────────────────────────
	//
	// Read by `dateText`, which is the ONLY place a date becomes a string —
	// the Modified column, the Created column and every date property all
	// go through it, so they cannot disagree. 'human' · 'iso' · 'dmy' ·
	// 'mdy'. Anything else falls back to 'human' rather than breaking: this
	// is a string in a file a writer may hand-edit.
	//
	// NAMED FOR THE ORGANIZER, and not `dateFormat`, because that name is
	// SPOKEN FOR: a test asserts `!('dateFormat' in DEF)` beside
	// `readTimeWpm` and `powerlineCapStyle` — a family of "this is
	// deliberately not a setting" guards protecting the STATUS BAR's tokens
	// from format strings. That guard is about the bar's {date}; this is
	// about the Organizer's readings.
	organizerDateFormat:      'human',
	// path -> one of WS_FOLDER_COLOURS' ids. Absent means as it was.
	folderColors:             {} as Record<string, string>,   // folder path -> colour id
	// HOW MANY STATES A MANUSCRIPT HAS, and what each one is called, looks
	// like and is coloured. Three is the default — Draft, Revise, Done; 0
	// turns flags off entirely for a writer who does not think in stages,
	// and the column, the chip and the bar token go with them.
	//
	// TWO COLOURS EACH, because one is wrong half the time: a flag colour
	// chosen against a dark theme is invisible on a light one, and a writer
	// who works in both should not have to choose which half of their day
	// the flags work in.
	flagCount:                3,
	flags: [
		// SKETCH, not "Outline". The id stays `outline` for ever — it is what
		// is written against a path in the vault, and changing it would drop
		// the flag off every note carrying it. The LABEL is a setting, and a
		// setting is free to change: a vault that has never customised its
		// flags picks up the word, and one that has keeps its own. (The tab
		// beside it is called Outliner, and a window with an Outliner tab whose
		// rows can be flagged "Outline" is one word meaning two things eight
		// inches apart.)
		//
		// THE ORDER IS THE RING'S, AND THE COUNT OFFERS THE FIRST N: Draft,
		// Revise, Done are a fresh install's three; Sketch and Blocked join when
		// the count is raised. Same order as WS_STATE_IDS.
		{ id: 'draft',   label: 'Draft',   shape: 'pennant', light: '#4b7bb5', dark: '#6f95c9' },
		{ id: 'revise',  label: 'Revise',  shape: 'swallow', light: '#b8453c', dark: '#cf5b52' },
		{ id: 'done',    label: 'Done',    shape: 'banner',  light: '#3f8a53', dark: '#5aa96c' },
		{ id: 'outline', label: 'Sketch', shape: 'hollow',  light: '#7b818c', dark: '#8a8f98' },
		{ id: 'blocked', label: 'Blocked', shape: 'alert',   light: '#c08a2a', dark: '#d9a441' }
	],
	// Unticked boxes in the tree, beside the count: "3/5" on a scene says
	// there is work left in it that a word count cannot.
	// How close a target is, on the row that has one. Off by default like
	// every other optional mark: a reading costs every row in the vault, and
	// this one costs the rows that have no target too, in the space it takes
	// from their names.
	fileTreeTasks:            false,
	enableOutlineCounts:      false,

	// ── Vim and gutters ───────────────────────────────────────────────────────
	vimSoftWrapMotion:        true,      // j/k move by visual line, not logical
	vimLabelNormal:           "NORMAL",
	vimLabelInsert:           "INSERT",
	vimLabelVisual:           "VISUAL",
	vimLabelReplace:          "REPLACE",
	vimLabelCommand:          "COMMAND",

	// ── Bar presets ───────────────────────────────────────────────────────────
	// name -> partial snapshot of BAR_KEYS. Lives in settings so saveSettings
	// persists it with everything else. NOT itself a BAR_KEY: a preset must
	// never carry the preset library, or loading one would delete the others.
	barPresets:               {} as Record<string, Record<string, unknown>>,   // name -> a pickBar snapshot
	// Whether the shipped presets have been seeded into that library. A flag
	// rather than a per-name check, so deleting a built-in makes it stay
	// deleted instead of returning on the next launch.
	//
	// FALSE as the default, which is the whole point of it: a fresh vault
	// has not been seeded, so the seeder runs once and the shipped presets
	// arrive. Defaulting it true meant new installs declared themselves
	// already seeded and started with an empty library. A vault that has
	// run the seeder holds `true` in its own data.json and is untouched,
	// so nothing a user deleted comes back.
	barPresetsSeeded:         false,
	// AND WHICH NAMES: the shipped presets seeded so far, so a preset added
	// in a later release reaches a vault seeded before it, and one the
	// writer deleted does not come back.
	barPresetsSeededNames:    [] as string[],

	// ── Writing history ──────────────────────────────────────────────────────
	// Behavioural data, so it is OFF until asked for. None of these are
	// BAR_KEYS: a bar preset must not carry a writing history any more than
	// it carries someone's word targets.
	historyTracking:          false,
	// Which of Day / Month / Year the report opens on, and which series are
	// drawn. Both are remembered rather than reset per opening: a writer who
	// looks at months every morning should not have to say so every morning.
	historyView:              'day',      // 'day' | 'month' | 'year' | 'cal'
	// Which single figure the calendar shades by. The chart can draw three
	// series at once because a bar has room for three; a calendar cell has
	// one colour, so this is a CHOICE rather than a set of toggles.
	historyCalMetric:         'net',      // 'added' | 'removed' | 'net'
	historySeries:            null as { added?: boolean; removed?: boolean; net?: boolean; average?: boolean } | null,   // filled by historySeriesOn(); see there
	// Where the store is CREATED if none exists yet, and the first place it is
	// looked for. Not a lock: the plugin finds the file by its marker anywhere
	// in the vault, so moving or renaming it is expected rather than tolerated,
	// and this key follows the file when it moves.
	// ONE FOLDER, NOT THREE FILES IN THE ROOT. New vaults get
	// `Word-Smith/`; an existing store is left exactly where it is (see
	// storeResolve) because moving a writer's file without asking is worse
	// than an untidy root. Not a DOT folder, deliberately: Obsidian does
	// not index those, so the files would stop being notes — unfindable by
	// the marker search, unopenable in the app, and un-editable by hand,
	// which is the property all three of these stores are built on.
	historyFilePath:          'Word-Smith/ws-history.md',
	// Whether the store also records WHICH notes each day's words happened in.
	// On, because without it the finder in the history window has nothing to
	// find. It is the one thing in the record that is not purely a number, and
	// it is what makes the file grow with the notes you touch rather than only
	// with the days you write.
	historyPerFile:           true,
	// Pasted and cut text left out of the history unless this is on: moving
	// text is a cut and a paste, and neither is writing.
	historyCountPasted:       false,
	// The one history-adjacent thing left in data.json, and it is not history:
	// path -> last known word count, the cache that turns a save into a delta.
	// Worthless to a human, a kilobyte of JSON in the middle of a note if it
	// were stored there, and rebuilt automatically. NULL rather than {} — the
	// merge in loadSettings is shallow, and an object literal here would be
	// shared by reference with every vault that has never written a word.
	historyBaselines:         null as Record<string, number> | null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Retro bar presets: the key table and the share-code codec
// ─────────────────────────────────────────────────────────────────────────────

// Everything the Retro Bar tab can set — the whole tab, and nothing outside
// it. A preset is a snapshot containing exactly these keys.
//
// Deliberately excluded, and why:
//   enableRetroStatus  the master switch. Loading a preset must never turn
//                      the bar off, and a preset saved with it off would.
//   retroBarHidden     transient — the slide-away toggle, not a look.
//   goalTarget, goalBaseline, fileGoals, folderGoals
//                      personal data. Sharing a bar must not ship someone
//                      else's word targets or their folder names.
//   goalRingWeight and the other goal geometry
//                      bar presentation, but no tab renders it, so it is not
//                      part of "every option in the Retro Bar tab". Append
//                      it below if that changes.
//   arrow*/line* colours
//                      letterbox furniture, set in the Letter Box tab.
//
// ═══ APPEND-ONLY BELOW THE MARKER. ═══
// A share code stores each field as its INDEX into this array, so inserting
// or reordering anything reinterprets every code already posted. Appending is
// safe: older codes simply don't mention the new indices, and barParseFields
// skips indices it doesn't recognise.
//
// The same freeze now applies to these keys' DEFAULT_SETTINGS *values*.
// barShareFields emits only what DIFFERS from the defaults and the recipient
// fills the rest back in from their own copy — so retuning a default here
// silently changes what every existing code decodes to. That is a new
// constraint on this file: before this feature, a default was just a default.
export const BAR_KEYS = [
	// Layout
	'statusBarRows', 'statusRows', 'fileTokenFormat',
	// Powerline
	'powerlineEnabled', 'powerlineModeColors',
	'powerlineColor1', 'powerlineColor2', 'powerlineColor3', 'powerlineColor4',
	'powerlineColor5', 'powerlineColor6', 'powerlineColor7',
	'powerlineText1', 'powerlineText2', 'powerlineText3', 'powerlineText4',
	// Borders
	'statusBarBorderStyle', 'statusBarBorderWidth',
	'statusBarBorderTop', 'statusBarBorderBottom',
	// Appearance
	'statusBarFontSize', 'statusBarHeight',
	'statusBarPadTop', 'statusBarPadBottom',
	// Vim labels and their colours (they live in this tab, not the Vim tab)
	'vimFollowCursorSmith',
	'vimColorNormal', 'vimColorInsert', 'vimColorVisual',
	'vimColorReplace', 'vimColorCommand',
	'vimLabelNormal', 'vimLabelInsert', 'vimLabelVisual',
	'vimLabelReplace', 'vimLabelCommand',
	// Bar colours
	'retroCustomColors',
	'retroDarkBgColor', 'retroDarkTextColor',
	'retroLightBgColor', 'retroLightTextColor',
	// ═══ APPEND ONLY BELOW THIS LINE ═══
	// 1.12: light-theme variants. Appended rather than interleaved with the
	// dark ones they pair with — grouping them by slot would read better and
	// would silently reinterpret every share code in the wild, which is what
	// the marker above is for. An older code simply does not mention these
	// indices and lands on the light defaults.
	'powerlineColorLight1', 'powerlineColorLight2', 'powerlineColorLight3',
	'powerlineColorLight4', 'powerlineColorLight5', 'powerlineColorLight6',
	'powerlineColorLight7',
	'powerlineTextLight1', 'powerlineTextLight2',
	'powerlineTextLight3', 'powerlineTextLight4',
	'vimColorNormalLight', 'vimColorInsertLight', 'vimColorVisualLight',
	'vimColorReplaceLight', 'vimColorCommandLight',
	// 1.14
	'powerlineSepWidth',
	// 1.21
	'statusBarFontFollowNote',
	// 1.2.1: the bar's rule colours, which replaced the removed custom
	// background/text pair, and the two button-label formats. Appended, so
	// every code already in the wild simply does not mention indices 58-63
	// and lands on the defaults — which are the values the rules resolved
	// to before they were choosable.
	'barRuleDarkTopColor', 'barRuleDarkBottomColor',
	'barRuleLightTopColor', 'barRuleLightBottomColor',
	'fontTokenFormat', 'markersTokenFormat',
	// APPENDED, and appended for a reason: this list is a wire format read by
	// index, and this key first went in beside `fileTokenFormat` at the top —
	// which shifted every key after it, so every share code already posted
	// would have decoded to a different bar. Nothing here moves. New keys go
	// on the end, where an older code simply does not mention them.
	'flagTokenFormat',
	// APPENDED: the indices before it are burned into share codes.
	'barTokenIcons',
	// APPENDED: the bar in the interface font.
	'statusBarUiFont',
	// APPENDED: how {target} says the note's target.
	'targetTokenFormat',
	// APPENDED: {time} in 24 or 12 hours.
	'timeTokenFormat',
	// APPENDED: {wpm}'s shape (A730).
	'wpmTokenFormat'
	// (TOMBSTONE, A788: 'wpmTokenUnit', words or characters a minute; never released, words a minute alone)
	// (TOMBSTONE, A707: 'goalTokenFormat', how {goal} read; {goal} went before it shipped, {target} is the one token)
];

// The keys above that no longer DO anything.
//
// Every one belonged to a feature that was removed. None can be deleted from
// BAR_KEYS: a share code stores each field as its INDEX into that array, so
// removing one renumbers every field after it and silently reinterprets every
// code anyone has already posted. They keep their slots and nothing reads
// them. SINCE 1.6.8 (A508) THEY ARE IN NO VAULT EITHER: not in
// DEFAULT_SETTINGS, never emitted by barShareFields, dropped by
// barParseFields from an older code, never written by a snapshot (only the
// live keys are), and deleted on load from data.json and every saved preset
// (WS_RETIRED_KEYS).
//
// ONE list, rather than a comment at each site. It was three comments in
// three places by the time there were three families of these, each preset
// had to be hand-stripped of them, and the fourth family would have been a
// comment somebody forgot to write. Everything that WRITES a preset or a
// share code now skips this set automatically; everything that reads BAR_KEYS
// for its indices still walks the full array.
//
// To retire another key: add it here, remove its reads, take it out of
// DEFAULT_SETTINGS, type it `never` in WsLegacySettings, and leave the array
// alone. To bring one back, undo those.
export const BAR_KEYS_INERT = new Set([
	// 1.2.0 — powerline is baked in; there is no plain bar to switch to.
	'powerlineEnabled',
	// 1.2.1 — the bar's own background and text follow the theme, and a row
	// directive is the only override.
	'retroCustomColors',
	'retroDarkBgColor', 'retroDarkTextColor',
	'retroLightBgColor', 'retroLightTextColor',
	// 1.2.1 — one palette. ;N reads the background swatches.
	'powerlineText1', 'powerlineText2', 'powerlineText3', 'powerlineText4',
	'powerlineTextLight1', 'powerlineTextLight2',
	'powerlineTextLight3', 'powerlineTextLight4',
	// 1.6.8 (A508) — the bar draws one row, and the separator's angle is the
	// PL_SEP_ASPECT constant.
	'statusBarRows', 'powerlineSepWidth',
]);

// Every settings key retired from DEFAULT_SETTINGS and deleted on load
// (A508): the retired bar keys, and the vault-wide goal and its label
// mode, which nothing has read since targets moved to the structure file.
// …and the Letter Box's own width (A672, issue #55): the band is the words' width, its sides the text's margins
export const WS_RETIRED_KEYS: string[] = [...BAR_KEYS_INERT, 'goalTarget', 'goalLabelMode', 'showHiddenMarkers',
	'maskMatchText', 'maskMatchTextPadded', 'maskPaddingH'];

// The keys a preset or a share code should actually carry.
export const BAR_KEYS_LIVE = BAR_KEYS.filter(k => !BAR_KEYS_INERT.has(k));

export const BAR_SHARE_VERSION = '1';

// Share code format (version "1"):
//   1|<name>|<i><type><value>~<i><type><value>~…
//   • the name is percent-encoded, so a literal "|" or "~" in it cannot
//     split the code.
//   • each field is an index into BAR_KEYS, a one-char type tag, then a value:
//       b0 / b1   boolean
//       n<num>    number
//       c<hex>    colour, "#" dropped — by far the most common value here
//       s<enc>    string, percent-encoded (token rows, label text)
//       j<enc>    JSON, percent-encoded — statusRows is an array of objects
//                 and has no shorter honest representation
//   • only fields differing from DEFAULT_SETTINGS are emitted.
//
// Codes are long compared with Cursor-Smith's because a bar carries token
// strings rather than numbers. That is the format doing its job: the rows ARE
// the preset, and abbreviating them would mean a second grammar to keep in
// step with the one the writer types into the panel.

// encodeURIComponent leaves "~" alone — it is an unreserved character — and
// "~" is the field separator here. That is fine in a plugin whose values are
// numbers and colours; it is not fine in this one, where "~" is a legal
// powerline divider (the wave) and therefore appears in ordinary row text. A
// row of `{words}~{time}` encoded straight would split into two malformed
// fields and the whole preset would decode as the defaults. Escaped by hand
// on the way out; decodeURIComponent already understands %7E coming back.
export function barEnc(s: string|number|boolean) {
	return encodeURIComponent(s).replace(/~/g, '%7E');
}

export function barShareNum(n: number) {
	if (Number.isInteger(n)) return String(n);
	return String(Math.round(n * 1e6) / 1e6);
}

export function barShareEncodeValue(v: unknown) {
	if (typeof v === 'boolean') return 'b' + (v ? '1' : '0');
	if (typeof v === 'number')  return 'n' + barShareNum(v);
	if (typeof v === 'string') {
		if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return 'c' + v.slice(1);
		return 's' + barEnc(v);
	}
	return 'j' + barEnc(JSON.stringify(v));
}

export function barShareDecodeValue(tag: string, raw: string) {
	switch (tag) {
		case 'b': return raw === '1';
		case 'n': return Number(raw);
		case 'c': return '#' + raw;
		case 's': return decodeURIComponent(raw);
		case 'j': try { return JSON.parse(decodeURIComponent(raw)) as unknown; } catch { return undefined; }
		default:  return undefined;
	}
}

// Just the bar keys out of a settings object, and only those it actually has.
export function pickBar(src: Record<string, unknown> | null | undefined) {
	const out: Record<string, unknown> = {};
	if (!src) return out;
	for (const k of BAR_KEYS) {
		if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
	}
	return out;
}

// Structural values (statusRows) compare and copy by VALUE, never by
// reference. Two vaults' rows are equal when they read the same, and a loaded
// preset must not hand the live settings the same array the library holds —
// editing a row in the panel would then silently rewrite the preset it came
// from.
export function barSameValue(a: unknown, b: unknown) {
	if (a === b) return true;
	if (typeof a === 'number' && typeof b === 'number') return barShareNum(a) === barShareNum(b);
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
	}
	return false;
}

export function barCloneValue<T>(v: T): T {
	if (!v || typeof v !== 'object') return v;
	try { return JSON.parse(JSON.stringify(v)) as T; } catch { return v; }
}

export function barShareFields(bar: Record<string, unknown>, base: WordSmithSettings) {
	const defaults = wsBag(base);
	const fields = [];
	// Walks the FULL array, because the index is the wire format and an
	// inert key still occupies its slot. It just never emits one — a vault
	// carrying a stale non-default value for a retired key would otherwise
	// put it in every code it minted, for a recipient that does not read it.
	for (let i = 0; i < BAR_KEYS.length; i++) {
		const k = BAR_KEYS[i];
		if (BAR_KEYS_INERT.has(k)) continue;
		if (!(k in bar)) continue;
		if (barSameValue(bar[k], defaults[k])) continue;
		fields.push(i + barShareEncodeValue(bar[k]));
	}
	return fields.join('~');
}

// Always returns an object, never null: an empty body legitimately means
// "identical to the defaults", which is not the same as a missing body.
export function barParseFields(body: string) {
	const snap: Record<string, unknown> = {};
	if (!body) return snap;
	for (const field of body.split('~')) {
		if (!field) continue;
		const m = /^(\d+)(.)([\s\S]*)$/.exec(field);
		if (!m) continue;
		const key = BAR_KEYS[Number(m[1])];
		if (!key) continue;              // index from a newer version: skip it
		if (BAR_KEYS_INERT.has(key)) continue;   // a retired key an older code carries
		const val = barShareDecodeValue(m[2], m[3]);
		if (val !== undefined) snap[key] = val;
	}
	return snap;
}

export function barPresetToCode(name: string, snap: Record<string, unknown>) {
	const body = barShareFields(pickBar(snap), DEFAULT_SETTINGS);
	return [BAR_SHARE_VERSION, barEnc(name || ''), body].join('|');
}

export function barCodeToPreset(code: string) {
	const trimmed = (code || '').trim();
	if (trimmed.slice(0, 2) !== BAR_SHARE_VERSION + '|') return null;
	try {
		const parts = trimmed.split('|');
		// parts[0] is the version, already matched. A literal "|" cannot reach
		// the name field (it is percent-encoded), so everything from parts[2]
		// on is body and is rejoined rather than truncated.
		const name = decodeURIComponent(parts[1] || '') || 'Imported preset';
		return { name, snap: barParseFields(parts.slice(2).join('|')) };
	} catch {
		return null;
	}
}

// A preset saved before some setting existed should land on that setting's
// DEFAULT, not on whatever this vault happened to have set beforehand. Without
// this, loading an old preset leaves a stray value from the previous look and
// the result matches neither.
export function barPresetWithDefaults(preset: Record<string, unknown> | null | undefined) {
	const out: Record<string, unknown> = {};
	const base = wsBag(DEFAULT_SETTINGS), given = preset || {};
	for (const k of BAR_KEYS_LIVE) {
		out[k] = barCloneValue(
			Object.prototype.hasOwnProperty.call(given, k)
				? given[k] : base[k]);
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipped presets
// ─────────────────────────────────────────────────────────────────────────────
// FULL snapshots, not sparse. Exported from a working vault's data.json
// rather than written by hand, so each states every live BAR_KEY
// explicitly (saveBarPreset writes BAR_KEYS_LIVE, so a preset re-baked
// from a vault export comes out already stripped of the inert keys).
// barPresetWithDefaults still fills gaps for anything LOADED from
// elsewhere (an older saved preset, a share code); these have none.
//
// Plain is what a brand-new vault comes up with (see loadSettings).
// Renaming it, or removing it, changes the opening bar — the seeding
// below is keyed by name and so is that lookup. Code opens on :b4 and
// carries ;6 ink and a three-step fade ({ggg}>{gg}>{g}); Plain (the
// writer's fourth, 2026-09-21) opens on :b1 with the file, the four
// buttons that name a question (modes, syntax, prose, report — icon and
// word) in the centre, the words at the right, at 16px over a hairline
// rule — so a change that breaks the grammar shows on a fresh install's
// first run.
//
// Seeded into the library once (see barPresetsSeeded), never re-seeded,
// so a deleted one stays deleted.
export const DEFAULT_BAR_PRESETS = {
	"Plain": {
		"statusRows": [{"left":":b1{ssss}{file}","center":"{mode} {syntax} {prose} {report}","right":"{words} words{ssss}"}],
		"fileTokenFormat": "name",
		"flagTokenFormat": "both",
		"powerlineModeColors": false,
		"powerlineColor1": "#4f9dde",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#2f333c",
		"powerlineColor4": "#4caf7d",
		"powerlineColor5": "#e0913a",
		"powerlineColor6": "#8a7fd1",
		"powerlineColor7": "#b5566b",
		"statusBarBorderStyle": "solid",
		"statusBarBorderWidth": 0,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": true,
		"statusBarFontSize": 16,
		"statusBarHeight": 20,
		"statusBarPadTop": 4,
		"statusBarPadBottom": 4,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "-- NORMAL --",
		"vimLabelInsert": "-- INSERT --",
		"vimLabelVisual": "-- VISUAL --",
		"vimLabelReplace": "-- REPLACE --",
		"vimLabelCommand": "-- COMMAND --",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#b96f1e",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"statusBarFontFollowNote": true,
		"barRuleDarkTopColor": "#fbfaf9",
		"barRuleDarkBottomColor": "#fbfaf9",
		"barRuleLightTopColor": "#16181d",
		"barRuleLightBottomColor": "#16181d",
		"fontTokenFormat": "word",
		"markersTokenFormat": "word",
		"barTokenIcons": {"history":"icon","export":"icon","organizer":"icon","powermenu":"icon","report":"both","modes":"both","syntax":"both","prose":"both"},
		"statusBarUiFont": false,
		"targetTokenFormat": "percent",
		"timeTokenFormat": "24h",
		"wpmTokenFormat": "gauge",
	},
	"Code": {
		"statusRows": [{"left":":b4{obsidian}:b2;f|{vim}|{ln:col}:6|{file}:b2>{#>}:b1>{ggg}>{gg}>{g}","center":"","right":"{powermenu}:b3\\ {markers}\\{words}:b2w::{chars}ch\\{tasks}:6\\{clock}{time}:5"}],
		"fileTokenFormat": "name",
		"flagTokenFormat": "both",
		"powerlineModeColors": true,
		"powerlineColor1": "#4f9dde",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#2f333c",
		"powerlineColor4": "#4caf7d",
		"powerlineColor5": "#e0913a",
		"powerlineColor6": "#8a7fd1",
		"powerlineColor7": "#b5566b",
		"statusBarBorderStyle": "none",
		"statusBarBorderWidth": 1,
		"statusBarBorderTop": false,
		"statusBarBorderBottom": false,
		"statusBarFontSize": 14,
		"statusBarHeight": 20,
		"statusBarPadTop": 4,
		"statusBarPadBottom": 4,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "NORMAL",
		"vimLabelInsert": "INSERT",
		"vimLabelVisual": "VISUAL",
		"vimLabelReplace": "REPLACE",
		"vimLabelCommand": "COMMAND",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#d79956",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"statusBarFontFollowNote": false,
		"barRuleDarkTopColor": "#fbfaf9",
		"barRuleDarkBottomColor": "#fbfaf9",
		"barRuleLightTopColor": "#16181d",
		"barRuleLightBottomColor": "#16181d",
		"fontTokenFormat": "glyph",
		"markersTokenFormat": "glyph",
		"barTokenIcons": {},
		"statusBarUiFont": false,
		"targetTokenFormat": "percent",
		"timeTokenFormat": "24h",
		"wpmTokenFormat": "gauge",
	},
	// ── TWO MORE, DIFFERENT FROM THE TWO. FADE is built on the {g} runs —
	// three fades a row, a warm seven-colour palette, mode colours on, no
	// rules, the glyph tokens. INK is the opposite: no bands at all, thin
	// marks between readings, one hairline on top, the note's own font,
	// lower-case Vim labels, greys. Both state every live key, as the test
	// demands of a shipped preset.
	"Fade": {
		"statusRows": [{"left":":1 | {gg}{gg}{gg}{gg}{gg}{gg}{gg} | {file}:2 > {ggg}>{ggg}>{ggg}>{ggg}>","center":"","right":"{gg}{gg}{gg}{gg}{gg}{gg}{gg} | {flag}:f ~ {tasks}:4 ~ {words}:5 words ~ {readtime}:6 | {gg}{gg}{gg}{gg}{gg}{gg}{gg}"}],
		"fileTokenFormat": "name",
		"flagTokenFormat": "both",
		"powerlineModeColors": true,
		"powerlineColor1": "#e06c75",
		"powerlineColor2": "#d19a66",
		"powerlineColor3": "#e5c07b",
		"powerlineColor4": "#98c379",
		"powerlineColor5": "#56b6c2",
		"powerlineColor6": "#61afef",
		"powerlineColor7": "#c678dd",
		"statusBarBorderStyle": "none",
		"statusBarBorderWidth": 1,
		"statusBarBorderTop": false,
		"statusBarBorderBottom": false,
		"statusBarFontSize": 13,
		"statusBarHeight": 19,
		"statusBarPadTop": 4,
		"statusBarPadBottom": 4,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#61afef",
		"vimColorInsert": "#98c379",
		"vimColorVisual": "#c678dd",
		"vimColorReplace": "#e06c75",
		"vimColorCommand": "#d19a66",
		"vimLabelNormal": "NORMAL",
		"vimLabelInsert": "INSERT",
		"vimLabelVisual": "VISUAL",
		"vimLabelReplace": "REPLACE",
		"vimLabelCommand": "COMMAND",
		"powerlineColorLight1": "#c0392b",
		"powerlineColorLight2": "#b9770e",
		"powerlineColorLight3": "#a88a1a",
		"powerlineColorLight4": "#5e9c3a",
		"powerlineColorLight5": "#2e8b9a",
		"powerlineColorLight6": "#2d6da4",
		"powerlineColorLight7": "#8e44ad",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#5e9c3a",
		"vimColorVisualLight": "#8e44ad",
		"vimColorReplaceLight": "#c0392b",
		"vimColorCommandLight": "#b9770e",
		"statusBarFontFollowNote": false,
		"barRuleDarkTopColor": "#fbfaf9",
		"barRuleDarkBottomColor": "#fbfaf9",
		"barRuleLightTopColor": "#16181d",
		"barRuleLightBottomColor": "#16181d",
		"fontTokenFormat": "glyph",
		"markersTokenFormat": "glyph",
		"barTokenIcons": {},
		"statusBarUiFont": false,
		"targetTokenFormat": "percent",
		"timeTokenFormat": "24h",
		"wpmTokenFormat": "gauge",
	},
};

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

// THE THEME'S COLOR AS HEX (A782): Obsidian's --color-<name> as the body has it, for a color picker that shows what a
// tint left to the theme draws; the default theme's when it cannot be read
export const WS_THEME_FALLBACK: Record<string, string> = { green: '#44cf6e', yellow: '#e0de71', red: '#fb464c' };
export function wsThemeHex(name: string): string {
	let v = '';
	try { v = getComputedStyle(document.body).getPropertyValue('--color-' + name).trim(); } catch { v = ''; }
	return /^#[0-9a-f]{6}$/i.test(v) ? v : (WS_THEME_FALLBACK[name] || '#808080');
}
