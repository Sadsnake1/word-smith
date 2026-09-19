// Word-Smith — preamble. Hand-owned since 2026-09-18 (A418 step 3b); first
// cut from the JavaScript slices by ws-dev/gen-ts.js, which is retired.

import { FuzzySuggestModal, Menu, setIcon, Platform, ItemView, normalizePath, sanitizeHTMLToDom } from 'obsidian';
import type { App, FileStats, TAbstractFile, TFile, TFolder, WorkspaceLeaf } from 'obsidian';
import type { WordSmithSettings, WsMenuRowSpec, WsExportOpts, WsExportRun, WsExportSection, WsHost, WsVimApi } from './settings';
import type WordSmith from './plugin';

// what the property pickers list: a key and its label, how many notes carry
// it and in how many spellings, or a row that would create it
export interface WsPropItem { label: string; key?: string; n?: number; spellings?: number; isNew?: boolean; type?: string; value?: string; tag?: string; [extra: string]: unknown }
import { ViewPlugin, Decoration, WidgetType, keymap, EditorView } from '@codemirror/view';
import { RangeSetBuilder, Prec } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import type { WsLensSort, WsLensChip } from './organizer-lens';

// `Platform` is destructured with the rest and used only through
// isMobileApp(), which falls back to the body class: the harness stubs
// `obsidian` with a fixed list of exports, so anything new arrives here as
// `undefined` rather than as a throw, and must be treated as absent.
// `apiVersion` IS THE DOCUMENTED ONE. `app.appVersion` is undefined here —
// measured, on 1.13.7 — and a diagnostics dump that says “Obsidian ?” is a
// dump that has to be chased up with a question.

// ── WHAT applyStyleProps MAY WRITE ON <body> (A418) ─────────────────────
//
// The complete lists, so that switching a feature off removes exactly what
// switching it on wrote, and so selfcarry_probe can hold styles.css to
// reading every one of them. A name added to applyStyleProps that is not
// here is written and never cleared.
export const STYLE_KINDS = ['text', 'highlight', 'squiggle', 'line'];
export const STYLE_CLASSES = ['ws-para-single', 'ws-line-spacing', 'ws-line-hl', 'ws-dim-active']
	.concat(STYLE_KINDS.map((k) => 'ws-pos-' + k), STYLE_KINDS.map((k) => 'ws-ck-' + k));
export const STYLE_PROPS = ['--ws-line-measure', '--ws-line-spacing', '--ws-line-hl-color', '--ws-dim-opacity',
	'--ws-ck-hard-bg', '--ws-ck-veryhard-bg']
	.concat(['noun', 'verb', 'adj', 'adv', 'conj'].flatMap((k) => ['--ws-pos-' + k + '-color', '--ws-pos-' + k + '-bg']),
		['filler', 'passive', 'illusion', 'misused', 'pronoun', 'dialogue', 'repeat'].flatMap((k) => ['--ws-ck-' + k + '-color', '--ws-ck-' + k + '-bg']));

// THE USER AGENT, READ IN ONE PLACE (A418). Two things need it and neither
// is OS detection: the INSTALLER version — the `obsidian/x.y.z` token, which
// is the only place Obsidian reports the installer (the app version is
// `apiVersion`; the two differ, and the installer is the part that freezes
// on enable when it is old) — and the diagnostics' engine line (Chromium and
// Electron versions, for a bug report). The plugin review's platform rule
// bans `navigator.userAgent` on sight because plugins sniff it for the OS;
// the OS is asked of `Platform` everywhere here, and this reads the string
// through the global object so the one legitimate use does not read as the
// other.
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
// Asked for from a vault: "the add a property needs its own button and
// mini-modal menu, because people with many properties will not see that mini
// menu with what property to pick."
//
// The menu it replaces was capped at TWENTY rows, unsearchable, and opened at
// the pointer inside another menu — so in a vault with forty keys the twenty-
// first was not merely hard to find, it was not offered at all. A fuzzy modal
// has a search box, no cap, and is the control Obsidian uses everywhere else
// a writer picks one thing out of many.
//
// SAME CONDITIONAL SHAPE as the path picker above, and for the same reason:
// `class X extends undefined` throws at DEFINITION time, so on an API without
// `FuzzySuggestModal` this must be null rather than absent — and the caller
// falls back to the menu, which still works.
//
// The item is the key; everything else in the line is a reason to pick it —
// how many notes carry it, and whether it is spelled more than one way.
export const WsPropSuggestModal = FuzzySuggestModal ? class extends FuzzySuggestModal<WsPropItem> {
	_items: WsPropItem[];
	_onPick: (item: WsPropItem) => void;
	_newLabel: string;
	_taken: WsPropItem[];
	// TWO CALLERS, TWO QUESTIONS (2026-08-22). The columns picker asks
	// "which property should become a column?" over `propKeysInScope`,
	// whose items carry a note count and a spelling count. The DRAWER's
	// label asks "which property should every row show?" over
	// `orgKnownProps`, which is NAMES ONLY — the registry's list, with no
	// scan behind it. So the placeholder is an argument, and a missing
	// `n` prints the label alone rather than the string "undefined
	// notes". Do NOT fake a count here to make the line uniform: a number
	// nobody counted is worse than a line without one.
	constructor(app: App, items: WsPropItem[], onPick: (item: WsPropItem) => void, placeholder: string | null, newLabel?: string, taken?: WsPropItem[]) {
		super(app);
		this._items = items;
		this._onPick = onPick;
		// ── AND A WAY TO NAME ONE THAT DOES NOT EXIST YET ────────────
		//
		// Writer, 2026-08-25: "the button to add a proprety should be a
		// search or add a new proprietey." The columns picker searched
		// what already existed and nothing else — and REFUSED outright on
		// a vault with no properties, so the writer most in need of naming
		// one had no door at all.
		//
		// OPTIONAL, because the two callers ask different questions. Pass
		// a label with `%s` in it and the list grows a create row; pass
		// nothing and this is the search it always was.
		this._newLabel = newLabel || '';
		// ── AND WHAT IT REFUSES IS NOT ALWAYS WHAT IT OFFERS (A141) ──
		//
		// Writer, 2026-09-04: two doors instead of one — "add a new
		// propriety that first ask the type and a name, and another
		// button with add an existing propriety".
		//
		// THE NEW-PROPERTY DOOR OFFERS NOTHING TO PICK. Its list is
		// empty on purpose — picking an existing key is the OTHER
		// button's job — but it must still refuse a name the vault
		// already uses, or it would offer to create a key `addProp`
		// silently drops. With one list doing both jobs that door had to
		// choose between refusing duplicates and staying empty.
		//
		// DEFAULTS TO THE ITEMS, so every existing caller is unchanged:
		// a picker that offers a key is a picker that refuses to
		// re-create it, which is what they all meant.
		this._taken = taken || items;
		if (this.setPlaceholder) {
			this.setPlaceholder(placeholder
				|| 'Which property should become a column?');
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
		// LAST, so it never displaces a real key while typing narrows
		// towards one — the same placement `orgPropsSearch` chose for its
		// own create row in 2026-08-23.
		return this._items.concat([{
			key: q, label: this._newLabel.replace('%s', q), isNew: true
		}]);
	}
	getItemText(item: WsPropItem) {
		if (typeof item.n !== 'number') return item.label;
		return item.label + '  ·  ' + item.n + (item.n === 1 ? ' note' : ' notes')
			+ (item.spellings > 1 ? '  ·  ' + item.spellings + ' spellings' : '');
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

// The shortest a letterbox mask may be: about a line of text. It was the
// ARROW ROW'S height, which made the smallest usable mask three lines deep
// — and a writer who wants a hairline of shroud should have one.
//
// The arrows are what needed the room, so the arrows stand down instead:
// under WS_ARROWS_MIN_PX there is no band to sit in, and a row of glyphs
// floating on the page with no mask behind them is what the vault
// photographed. A mask can be thinner than its ornament; it just cannot
// carry it.
// TOMBSTONE: 6px, "about half a line", on the argument that a writer
// closing the gap all the way should be able to reach a hairline.
// REVERSED BY THE WRITER (2026-08-22): "letterbox 6px is too low".
//
// The argument had missed that the band is ALSO ITS OWN DRAG HANDLE.
// At six pixels the only control that could undo the six pixels was a
// six-pixel target — so the setting could be reached and then not left,
// which is the same fault as the report's other half (drag it too tall
// and the menu goes, with the handle behind it). 24px is the smallest
// band that is comfortably grabbable with a pointer and still visibly a
// band; it stays UNDER `WS_ARROWS_MIN_PX`, so the older rule holds —
// a mask may be thinner than the ornament it carries, it just cannot
// carry it. Ask and the hairline comes back.
//
// 24 WAS STILL TOO LOW — reported a SECOND time: "i can still lose the
// drag. change the minimum level to 60". The first fix reasoned about
// the wrong thing. The handle is not the mask: it is the rule line, and
// it already carries a 12px invisible hit area (`.ws-arrow-line
// ::before`, ±6px), so grabbing was never about the mask's height.
//
// WHAT 60 ACTUALLY BUYS is CLEARANCE. The top mask's line sits at the
// mask's own height, and Obsidian's tab strip occupies roughly the first
// forty pixels of the window — so at 24 the line is BEHIND the app's own
// chrome, where no pointer can reach it however large its hit area is.
// 60 puts it clear. That is the writer's number and this is the reason
// it works; if the chrome ever gets taller, this is the number that has
// to move.
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
// that answers; every other returns at once. A HOLDER, not a `let`: it is
// a module export now (A418) and an importer cannot reassign one — and it
// is the DOCUMENT's, not the plugin's, because the listener list is.
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
// Guarded like the other Obsidian classes here: `extends undefined` throws
// at definition time, and the harness stubs a bare 'obsidian'.
export const WS_MENU_VIEW = 'word-smith-menu';
// The Outliner as a PANE. A vault asked for this window beside the writing —
// dragged out, docked to a side, or a tab — and a leaf is all three for free.
export const WS_OUTLINER_VIEW = 'word-smith-outliner';
// THREE PANES, NOT ONE WINDOW WITH THREE TABS (A258, writer 2026-09-08:
// "we need to split organizer, export and history now. also remove those
// headers thing so we make the view bigger"). Export and History are views
// of their own; each pane is the same window built on ONE tab with its tab
// strip away, and Obsidian's tree drives all of them through the doors
// (A254). `WS_OUTLINER_VIEW` keeps its id — saved workspaces hold it.
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
// The ribbon button's title — ONE string, because Obsidian keys the ribbon
// entry on `<plugin id>:<title>` and the switch has to name the same entry
// to take it off (A407).
// Whether an element is on screen, by Obsidian's own `isShown` where the
// element has it (a hidden tab, a collapsed sidebar); an element without it
// is taken as shown — the fixtures' elements, and a modal's.
export const wsElShown = (el: { isShown?: () => boolean } | null | undefined) => (!el || typeof el.isShown !== 'function') ? true : !!el.isShown();

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
	// exists — a field-driven type stamped every pane "undefined" (measured
	// live 2026-09-08). Export and History are subclasses below, each
	// answering its own type and tab.
	plugin: WordSmith;
	_built: boolean;
	host: WsHost;
	constructor(leaf: WorkspaceLeaf, plugin: WordSmith) { super(leaf); this.plugin = plugin; }
	paneTab()        { return 'organizer'; }
	getViewType()    { return WS_OUTLINER_VIEW; }
	// THE LEAF IS THE WHOLE WINDOW, so it is named for the window.
	//
	// TOMBSTONE, TWICE. It read 'Outliner' — the name of the FIRST TAB inside
	// it — and became 'Manuscript' so that clicking Export or History did not
	// leave the tab title claiming otherwise. A vault has now retired both:
	// "don't call the outliner Manuscript", then "change the name of Outliner
	// to Organizer", and separately the whole manuscript-folder CONCEPT is
	// going.
	//
	// SO THE OLD OBJECTION IS ACCEPTED RATHER THAN ANSWERED. The leaf and its
	// first tab share a name again. That is the lesser of the two problems:
	// one word for this thing everywhere beats a third word invented to keep a
	// title honest, especially when the third word names a concept the writer
	// no longer uses.
	//
	// ONLY THE LABEL MOVES. `WS_OUTLINER_VIEW` and every command id stay as
	// they are — those are written into saved workspaces and into hotkeys the
	// writer has set, and changing them drops a pane on the next restart.
	getDisplayText() { return WS_PANE_NAMES[this.paneTab()]; }
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
		// ONE TAB, NO STRIP (A258): the pane is that tab and nothing else.
		this.plugin.openManuscriptModal({ host: this.host, tab: this.paneTab(), only: true });
	}

	async onClose() {
		// EVERYTHING THE WINDOW REGISTERED COMES OFF. The tree watcher, the
		// counter and the Escape ladder are all held by the host, and the
		// ladder is on `window` — a pane that forgot this would go on
		// swallowing Escape for the rest of the session on behalf of a pane
		// nobody can see.
		try { if (this.host) this.host.teardown(); } catch (_) { wsCatch('onClose: if (this.host) this.host.teardown();', _); }
		this.contentEl.empty();
	}
} : null;
// EXPORT AND HISTORY, EACH ITS OWN TYPE (A258): the same window built on
// one tab; the class answers the type so Obsidian's `data-type` is right
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
			window.setTimeout(() => this.plugin.refreshMenuPanelsNow(), 0);
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
		// FOUND BY MOVING THE SUITE, not by reading. `menu_probe` drove
		// the POP-UP thirty times and this panel not once; pointed at
		// the panel, one assertion went red — "closing the menu puts the
		// scheme back rather than leaving it stripped".
		//
		// It was true of the pop-up, whose `onClose` calls exactly these
		// two, and had never been true here. Nobody had noticed because
		// the pop-up was the only menu with a test. With the pop-up
		// deleted — which is what the writer has asked for — the restore
		// would have left the plugin with it.
		//
		// A THEME PICKED FROM THIS MENU writes its variables onto `body`
		// live, so a menu that closes without handing them back leaves a
		// half-painted vault behind it.
		try {
			if (this.plugin.barThemeOnCssChange) this.plugin.barThemeOnCssChange();
			if (this.plugin.barThemeGuard) this.plugin.barThemeGuard();
		} catch (_) { wsCatch('onClose: if (this.plugin.barThemeOnCssChange) …', _); }
	}

	// HAND THE EDITOR BACK AFTER ACTING. Every mode this panel toggles is
	// applied to the ACTIVE editor — the letterbox masks it, the
	// typewriter scrolls it, Hemingway locks its keys — and clicking a
	// row in a docked leaf makes the PANEL active, so the toggle flipped
	// and nothing on screen changed until the writer clicked back into
	// their note. That reads as a broken switch.
	//
	// The pop-up never had this problem: it closes on the way out and
	// focus returns by itself. A panel does not close, so it has to give
	// the editor back on purpose.
	// THE PANEL KEEPS THE FOCUS IT WAS GIVEN.
	//
	// It used to hand the editor back after every toggle, so a mode
	// applied to the active editor would visibly apply. That fixed the
	// symptom and broke the pane: a writer who quick-cycled INTO the panel
	// was thrown out of it by their own first keystroke, with no way to
	// stay and press a second. A pane you cannot remain in is not a pane.
	//
	// So the toggle applies the plugin's own state instead of moving the
	// writer. `applyAll` is the same pass the settings tab runs after a
	// change; it repaints from the REMEMBERED note (activeMarkdownView),
	// which is exactly the lookup that made the Report work from here.
	// Alt+direction is how you leave, the same as any other pane.
	returnFocus() {
		// `refresh()` is the plugin's own full apply pass — the same one
		// `saveSettings(true)` runs. Every picker item already saves, so
		// this is belt and braces for a row toggle that changes app state
		// without going through settings (light/dark), and it costs a
		// repaint nobody will see twice.
		try { if (this.plugin.refresh) this.plugin.refresh(); } catch (_) { wsCatch('returnFocus: if (this.plugin.refresh) this.plugin.refresh();', _); }
	}

	// WHAT CHANGED, WITHOUT REBUILDING WHAT DID NOT.
	//
	// Every state change used to call render(), which empties the panel and
	// draws it again — so an open drawer was destroyed and recreated, and
	// its opening animation replayed. On screen that is a folder closing
	// and opening again under the pointer, which is what the vault filmed.
	//
	// A toggle changes what the rows SAY, not what they ARE: the counts on
	// the right, and which drawer items read as on. Both are rewritten in
	// place here, leaving every element — and every animation that has
	// already played — alone.
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
			// Reported from a vault: the moon and the sun do not change
			// places when the mode does. They were never redrawn. This
			// refreshed the LABEL and the state after a toggle and nothing
			// else, so `lightdark` flipped its word to "Light" while the
			// moon stayed beside it — the one arrangement the row's own
			// comment says must not happen, because a glyph arguing with
			// the word beside it is worse than no glyph at all.
			//
			// REDRAWN ONLY WHERE THE ICON IS A FUNCTION. Every other row's
			// glyph is a constant, and calling `setIcon` on all of them
			// after every toggle is work with no possible effect — and it
			// would wipe the hand-drawn flag marks, which are written into
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
					state.textContent = on ? String(on) + ' on' : 'off';
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
	// redraw share one body — the two差 only in whether they animate.
	fillDrawer(box: HTMLDivElement, row: WsMenuRowSpec) {
		for (const item of row.items()) {
			const isOn = (typeof item.on === 'function' ? item.on() : item.on);
			const kid = box.createDiv({ cls: 'tree-item nav-file' });
			const sub = kid.createDiv({
				cls: 'tree-item-self is-clickable nav-file-title'
					+ ' ws-menu-sub ws-picker-row' + (isOn ? '' : ' is-off')
			});
			if (item.color) {
				const dot = sub.createSpan({ cls: 'ws-picker-dot' });
				if (item.color !== 'currentColor') dot.style.backgroundColor = item.color;
			}
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
		// THE FILE EXPLORER'S OWN CONTAINERS, not just its row classes.
		// Every remaining difference — row height, text colour, the
		// scrollbar's position, the guide lines, the search field's width
		// — came from styling those things myself while the tree got them
		// from `nav-header` and `nav-files-container`. Wearing the
		// containers means the app supplies all of it, and every rule of
		// ours that was imitating one could go.
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

		// THE FINDER, on trial. It was left out on the reasoning that a
		// search field is what the pop-up is for — summon, type, gone —
		// and that a pane you keep open is for reaching things by eye. That
		// is an argument, not evidence, so here it is to be judged in use.
		//
		// It sits WHERE THE LAYOUT PUTS IT, like every other entry, and its
		// value survives a re-render: the panel redraws on every click and
		// on every theme change, and a query that vanished when a mode
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
				// Built by `wsMenuSearchInto` since 2026-09-02, so the modal
				// menu gets exactly this box rather than a copy of it.
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
						try { plugin.app.commands.executeCommandById(plugin.menuCommandId(id)); }
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
			// picker entry, and naming the tree node the same thing meant
			// the container was built on whichever picker item happened to
			// be in scope. It cost two probe failures and would have cost a
			// vault a panel with no children in it.
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
				// A PINNED COMMAND WEARS THE COMMAND-PALETTE GLYPH.
				//
				// (writer, 2026-08-22: pinned commands "all wear a CLOCK icon
				// - illogical".) NOT A CLOCK, and worth recording because the
				// name misleads: it was `chevron-right-circle`, which at 16px
				// is an outlined circle with a short angled stroke off-centre
				// and reads as a clock face. Nothing in this codebase ever
				// asked for a clock here.
				//
				// It is a FALLBACK, fixed in this one place: a pinned command's
				// id is `cmd:` + the command id, which is never in
				// `menuFeatureDefs`, so `menuIconFor` returns '' and this
				// line decides. Do not add a defs entry per command - the ids
				// are the writer's and unbounded.
				// MOVED TO `menuDrawIcon` (2026-09-02), which is the one writer
				// of a menu row's glyph now. Thirty lines stood here and the
				// modal's builder had none of them, so the modal drew no icons
				// at all. Every note that explained a line travelled with it.
				plugin.menuDrawIcon(el, row.id);
			}
			el.createDiv({
				cls: 'tree-item-inner nav-folder-title-content ws-menu-label',
				text: label(row)
			});
			if (row.items && row.count !== false) {
				const its = row.items();
				const on = its.filter(i => (typeof i.on === 'function' ? i.on() : i.on)).length;
				el.createSpan({ cls: 'ws-menu-state', text: on ? String(on) + ' on' : 'off' });
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
				try { ev.dataTransfer.setData('text/plain', row.id); } catch (_) { wsCatch('render: ev.dataTransfer.setData(\'text/plain\', row.id);', _); }
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
			const hits = [];
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
				if (h.kind === 'item' && h.item.color) {
					const dot = sub.createSpan({ cls: 'ws-picker-dot' });
					if (h.item.color !== 'currentColor') dot.style.backgroundColor = h.item.color;
				}
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
			if (!hits.length) list.createDiv({ cls: 'ws-menu-empty', text: 'Nothing matches' });
		}

		// The selection survives the redraw, clamped to what is left: a
		// row that opened a drawer has more below it than it did, and a
		// query has fewer.
		const n = this.navItems().length;
		if (n) this._at = Math.max(0, Math.min(this._at, n - 1));
		this.paint();
	}
} : null;

// TOMBSTONE (1.3.0): a WsCommandSuggestModal picked the command to pin for
// exactly one build. Obsidian's settings window is ITSELF a modal, and
// opening a second one over it closes the first — so pinning a command
// threw the writer out of settings and back to the note. The picker is
// inline in the tab now (see displayMenuTab), which is also where a
// writer can see the shelf they are adding to.

// Obsidian exposes its bundled CodeMirror 6 packages to plugins via require.
// Decorations registered through registerEditorExtension render inside CM6's
// own pipeline, which is the only glitch-free way to do per-line styling —
// any MutationObserver / direct-DOM approach races the editor's rendering
// and flickers (this is also how the reference typewriter-mode plugin works).
// THE PACKAGES ARE IMPORTED (A418): Obsidian resolves `@codemirror/*` for a
// plugin at run time and esbuild leaves them external, so the try/require
// dance for "an extremely old build" is gone — 1.13.7 has them all. NULL
// WHERE THEY DID NOT ANSWER: the harness's Chromium pages answer `{}` to
// every package but obsidian, and the `if (!CM)` guards below say the same
// thing they said before — the editor features are off, nothing else is.
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
		unless if when whenever wherever whether than plus versus`);

	add('AUX', `am is are was were be been being have has had having do does
		did doing`);

	add('MOD', `will would shall should can could may might must ought`);

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
		hurrah phew ugh er um`);

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

	// Common nouns that suffix rules would otherwise mis-tag.
	add('NOUN', `time way people man woman men women child children day year
		work place case point group number world life hand eye head word thing
		name home room door house water fire air book story line page thought
		idea money family friend school city country state night morning
		evening week month hour minute moment reason question answer problem
		sense mind heart voice face body kind sort part end side form order
		matter fact view level rate area field course result effect chance
		change nothing everything something anything president student
		resident agent parent patient client moment accident incident
		continent talent tenant servant assistant consultant restaurant
		elephant infant merchant giant opponent component ingredient
		event government department apartment argument statement movement
		environment equipment treatment agreement`);

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

// ── Tokenizer ────────────────────────────────────────────────────────────────

// Numbers are tokens too — "the 747 carried 416 passengers" is a
// five-word sentence, not a three-word one, and the rhythm grade was
// quietly wrong on any prose with figures in it. The separator part
// only continues into another digit, so the full stop after "in 1984."
// stays outside the token and sentence detection still sees it.
export const WORD_RE = /[A-Za-z][A-Za-z'\u2019-]*|\d+(?:[.,:]\d+)*%?/g;

// One word of a line as the checks see it: the text, lowered, its span, the
// tag the tagger gives it, and whether it opens a sentence.
export interface WsToken { w: string; lw: string; from: number; to: number; tag: string | null; first?: boolean }
export function tokenizeLine(text: string) {
	const out: WsToken[] = [];
	WORD_RE.lastIndex = 0;
	let m;
	while ((m = WORD_RE.exec(text))) {
		// Trailing hyphens/apostrophes belong to the markup, not the word.
		let w = m[0].replace(/[-'\u2019]+$/, '');
		if (!w) continue;
		out.push({ w, lw: w.toLowerCase().replace(/\u2019/g, "'"), from: m.index, to: m.index + w.length, tag: null });
	}
	return out;
}

// ── Suffix tagging ───────────────────────────────────────────────────────────

export function suffixTag(lw: string, raw: string, isFirstInSentence: boolean) {
	if (/^\d/.test(lw)) return 'NUM';
	if (lw.length > 3 && /ly$/.test(lw) && !LY_NOT_ADVERB.has(lw)) return 'ADV';
	if (lw.length > 4 && /(ing)$/.test(lw)) return 'VERB';
	if (lw.length > 3 && /(ed)$/.test(lw)) return 'VERB';
	if (lw.length > 4 && /(est)$/.test(lw)) return 'ADJ';
	if (lw.length > 4 && /(tion|sion|ment|ness|ity|ance|ence|ship|hood|dom|ism|ist|acy|age|ure|ery|ology|graphy|itis)$/.test(lw)) return 'NOUN';
	if (lw.length > 4 && /(ous|ful|less|ive|able|ible|ical|ic|ish|ary|ent|ant|ile|ory|some|like|ward|proof)$/.test(lw)) return 'ADJ';
	if (lw.length > 4 && /(ize|ise|ate|ify|fy)$/.test(lw)) return 'VERB';
	if (lw.length > 3 && /(er|or)$/.test(lw)) return 'NOUN';
	if (lw.length > 3 && /s$/.test(lw) && !/ss$/.test(lw)) {
		const base = lw.replace(/(ies|es|s)$/, (m): string => (m === 'ies' ? 'y' : ''));
		if (POS_LEX[base] === 'VERB') return 'VERB';
		return 'NOUN';
	}
	// Capitalised mid-sentence → proper noun.
	if (!isFirstInSentence && /^[A-Z]/.test(raw)) return 'NOUN';
	return 'NOUN';
}

// ── Context rules ────────────────────────────────────────────────────────────

export const SENT_END = /[.!?\u2026]$/;

// Adverbs that grade a quality rather than modify an action.
export const DEGREE_ADVERBS = new Set(['very', 'so', 'too', 'quite', 'rather',
	'really', 'extremely', 'incredibly', 'terribly', 'awfully', 'fairly',
	'pretty', 'somewhat', 'deeply', 'highly', 'utterly', 'truly',
	'remarkably', 'surprisingly', 'perfectly', 'entirely', 'completely']);

// Words that go flat after a verb — same form as the adjective, adverb
// duty: "ran close", "went straight on", "held tight", "fell hard".
export const FLAT_ADVERBS = new Set(['close', 'fast', 'hard', 'tight', 'straight',
	'high', 'low', 'deep', 'long', 'far', 'near', 'early', 'late', 'slow',
	'quick', 'loud', 'wide', 'right', 'wrong', 'first', 'last']);

// Verbs that link a subject to a description rather than an object.
export const LINKING_VERBS = new Set(`seem seems seemed appear appears appeared
	look looks looked feel feels felt sound sounds sounded smell smells
	smelled taste tastes tasted grow grows grew turn turns turned remain
	remains remained stay stays stayed become becomes became get gets got
	getting`.split(/\s+/).filter(Boolean));

// Full stops that do not end sentences. "e.g." and initials tokenize as
// single letters, so those are handled by length; this set covers the
// multi-letter cases. Without it, "Dr. Smith said it" opens a false
// sentence at "Smith" — and the loose-pronoun check downstream then fires
// on perfectly anchored mid-sentence pronouns, while the rhythm grade is
// computed on half-sentences.
export const ABBREVIATIONS = new Set(`mr mrs ms dr prof rev gen sen rep hon st mt
	ft vs etc al cf ca approx dept est fig vol ch pp no op ed inc ltd co
	corp univ assn bros jan feb mar apr jun jul aug sep sept oct nov dec
	mon tue tues wed thu thurs fri sat sun`.split(/\s+/).filter(Boolean));

export const SUBJECT_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'who']);

export function tagTokens(tokens: WsToken[], text: string) {
	// Pass 1 — lexicon, then suffix. Sentence starts use one token of
	// lookahead: a full stop only opens a new sentence when the word before
	// it is not an abbreviation or an initial, and the word after it is
	// capitalised.
	let firstInSentence = true;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const lex = POS_LEX[t.lw];
		t.first = firstInSentence;
		// Contracted auxiliaries attach to anything — "Dinah'll miss me",
		// "the key'd vanished" — so the known-word list can never cover
		// them all. The ending is the tag. 's stays out (possessives), and
		// ma'am is a word that merely ends like "I'm".
		let dyn = null;
		if (!lex && t.lw !== "ma'am") {
			const cm = /'(ll|d|re|ve|m)$/.exec(t.lw);
			if (cm) dyn = (cm[1] === 'll' || cm[1] === 'd') ? 'MOD' : 'AUX';
		}
		t.tag = lex || dyn || suffixTag(t.lw, t.w, firstInSentence);
		// A sentence ends when the character right after this token is a
		// terminator (the tokenizer never swallows punctuation).
		const after = text.slice(t.to, t.to + 2);
		const ch = after.trim().charAt(0) || '';
		if (!SENT_END.test(ch)) { firstInSentence = false; continue; }
		if (ch !== '.') { firstInSentence = true; continue; }
		const nx = tokens[i + 1];
		firstInSentence = !(ABBREVIATIONS.has(t.lw) || t.lw.length === 1) &&
			(!nx || /^[A-Z]/.test(nx.w));
	}

	// Pass 2 — context. Cheap, local, and in the order that matters:
	// determiner/preposition demotion before infinitive promotion, so
	// "the run" stays a noun but "to run" becomes a verb.
	for (let i = 0; i < tokens.length; i++) {
		const t    = tokens[i];
		const prev = i > 0 ? tokens[i - 1] : null;
		const next = i + 1 < tokens.length ? tokens[i + 1] : null;

		// "the work", "a call", "in place" → noun, not verb. An -ing word
		// in the same slot is a gerund ("the meeting") unless a noun
		// follows, which makes it a participial modifier ("the running
		// water"). -ed words after a determiner are always modifiers.
		if (t.tag === 'VERB' && prev && (prev.tag === 'DET' || prev.tag === 'PREP')) {
			// "made her feel", "let her go" — a causative verb two back
			// means "her" is the object and this is a bare infinitive, not
			// a possession.
			const causative = prev.lw === 'her' && POS_LEX[t.lw] === 'VERB' &&
				i >= 2 && tokens[i - 2].tag === 'VERB';
			if (causative) { /* stays a verb */ }
			else if (/ed$/.test(t.lw))  t.tag = 'ADJ';
			else if (/ing$/.test(t.lw)) {
				// "the meeting" is a thing and "the running water" a
				// modifier — but only after a determiner. A gerund after a
				// preposition is an action being talked about ("of getting
				// up", "by running fast", "without looking"), and demoting
				// those stripped the verbs out of half of any literary
				// sentence.
				if (prev.tag === 'DET') t.tag = (next && next.tag === 'NOUN') ? 'ADJ' : 'NOUN';
			}
			else                        t.tag = 'NOUN';
		}
		// A handful of lexicon adverbs moonlight as nouns, and a determiner
		// settles it: "the well", "her back". Unless a noun follows, in
		// which case they are modifying it and the compound rule below has
		// the better claim ("the back door").
		if (t.tag === 'ADV' && (t.lw === 'well' || t.lw === 'back') && prev &&
			prev.tag === 'DET' && (!next || (next.tag !== 'NOUN' && next.tag !== 'ADJ'))) {
			t.tag = 'NOUN';
		}
		// Determiner + adjective with no noun after it → the adjective is
		// carrying the noun slot ("the poor", "the best").
		if (t.tag === 'ADJ' && prev && prev.tag === 'DET' && (!next || next.tag !== 'NOUN')) {
			// leave adjectives that clearly modify something later
			if (!next || (next.tag !== 'ADJ' && next.tag !== 'NOUN')) t.tag = 'NOUN';
		}
		// "to write" → infinitive.
		if (prev && prev.tag === 'TO' && (t.tag === 'NOUN' || t.tag === 'ADJ') && POS_LEX[t.lw] !== 'NOUN') {
			t.tag = 'VERB';
		}
		// Auxiliary or modal followed by a participle-shaped word → verb —
		// but only for words the lexicon doesn't already know. "nothing",
		// "something", "morning" and "evening" end in -ing too, and "it was
		// nothing" is not a verb phrase.
		if (prev && (prev.tag === 'AUX' || prev.tag === 'MOD') && t.tag === 'NOUN' &&
			!POS_LEX[t.lw] && /ing$|ed$|en$/.test(t.lw)) {
			t.tag = 'VERB';
		}
		// "to do", "to be", "to have" — an auxiliary right after "to" is a
		// plain infinitive: the marker gets its TO tag and the verb its own.
		if (t.lw === 'to' && next && next.tag === 'AUX' &&
			/^(do|be|have)$/.test(next.lw)) {
			t.tag = 'TO';
			next.tag = 'VERB';
		}
		// Negated do-support is followed by a bare verb, full stop —
		// "don't panic", "didn't time it" — whatever the lexicon thinks
		// the word is elsewhere.
		if (prev && /^(don't|doesn't|didn't)$/.test(prev.lw) &&
			(t.tag === 'NOUN' || t.tag === 'ADJ')) {
			t.tag = 'VERB';
		}
		// A modal followed by a word the lexicon does not know is a bare
		// verb too ("will attempt", "can't panic") — unless the next token
		// is an auxiliary, which is subject–aux inversion with a noun in
		// the middle ("can food be stored").
		if (prev && prev.tag === 'MOD' && (t.tag === 'NOUN' || t.tag === 'ADJ') &&
			!POS_LEX[t.lw] && !(next && next.tag === 'AUX')) {
			t.tag = 'VERB';
		}
		// A degree adverb grades a quality: "very sleepy", "quite odd",
		// "so tired". Unknown words in that slot are adjectives, unless a
		// noun follows to claim them ("very hungry wolves" keeps hungry
		// for the rule two below).
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && DEGREE_ADVERBS.has(prev.lw) &&
			(!next || next.tag !== 'NOUN')) {
			t.tag = 'ADJ';
		}
		// Coordination copies the part of speech across: in "sleepy and
		// stupid" the second word rides on the first.
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next !== undefined &&
			(prev.lw === 'and' || prev.lw === 'or' || prev.lw === 'but') &&
			i >= 2 && tokens[i - 2].tag === 'ADJ' && (!next || next.tag !== 'NOUN')) {
			t.tag = 'ADJ';
		}
		// Noun immediately before a noun, where the first is also an
		// adjective by suffix, reads as a modifier.
		if (t.tag === 'NOUN' && next && next.tag === 'NOUN' && /(ic|al|ive|ous|ful)$/.test(t.lw)) {
			t.tag = 'ADJ';
		}
		// An unknown word between a determiner (or another adjective) and a
		// noun is filling the modifier slot: "her difficult book". Limited to
		// words the lexicon does not claim, so noun-noun compounds like "the
		// book cover" keep both nouns.
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next &&
			(prev.tag === 'DET' || prev.tag === 'ADJ' || prev.tag === 'PREP') && next.tag === 'NOUN') {
			t.tag = 'ADJ';
		}
		// Sentence-initial word followed by a determiner or pronoun, with no
		// lexicon entry claiming it as a noun, is almost always an
		// imperative verb ("Check the file", "Open your notes").
		if (t.first && t.tag === 'NOUN' && !POS_LEX[t.lw] && next &&
			(next.tag === 'DET' || next.tag === 'PRON')) {
			t.tag = 'VERB';
		}
		// A subject pronoun followed by a word the lexicon does not know is
		// carrying the verb slot: "I sprint", "they scribble". Restricted
		// to unknown words so lexicon nouns survive ("I, Claudius" aside,
		// "it time we left" is not prose worth guessing about).
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && prev.tag === 'PRON' &&
			SUBJECT_PRONOUNS.has(prev.lw)) {
			t.tag = 'VERB';
		}

		// A linking verb hands its slot to a description, not a thing:
		// "seems fine", "looked ancient", "felt wrong". Only unknown
		// words move, and only when no noun follows to claim them
		// ("became president" keeps its noun).
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && prev.tag === 'VERB' && LINKING_VERBS.has(prev.lw) &&
			(!next || (next.tag !== 'NOUN' && next.tag !== 'DET'))) {
			t.tag = 'ADJ';
		}
		// Flat adverbs: adjective-shaped words straight after a verb are
		// doing adverb work — "ran close by her", "went straight on" —
		// unless a noun follows to be modified ("ran close races").
		if (prev && prev.tag === 'VERB' && FLAT_ADVERBS.has(t.lw) &&
			(t.tag === 'ADJ' || t.tag === 'NOUN' || t.tag === 'VERB') &&
			!(next && next.tag === 'NOUN')) {
			t.tag = 'ADV';
		}
		// "thought that she had", "the fact that the key" — "that" before
		// a subject is joining clauses, not pointing at anything. Before a
		// noun ("that man") or an auxiliary ("that would be four thousand
		// miles") it keeps its determiner/pronoun reading.
		if (t.lw === 'that' && t.tag === 'DET' && next &&
			((next.tag === 'PRON' && SUBJECT_PRONOUNS.has(next.lw)) || next.tag === 'DET')) {
			t.tag = 'CONJ';
		}
		// "like" earns its verb reading only with a subject or a modal in
		// front — "I like tea", "would like", "didn't like it". After a
		// be-form it is the preposition again: "she was like a ghost".
		if (t.lw === 'like' && prev &&
			((prev.tag === 'PRON' && SUBJECT_PRONOUNS.has(prev.lw)) || prev.tag === 'MOD' ||
			 /^(do|does|did|don't|doesn't|didn't|won't|can't|couldn't|wouldn't|shouldn't)$/.test(prev.lw))) {
			t.tag = 'VERB';
		}
		// A gerund opening a sentence with an auxiliary right after it is
		// the subject, not an action: "Running is hard", "Waiting was
		// the worst part".
		if (t.first && t.tag === 'VERB' && /ing$/.test(t.lw) && next &&
			(next.tag === 'AUX' || next.tag === 'MOD')) {
			t.tag = 'NOUN';
		}
	}

	// "to" is an infinitive marker before a verb and a preposition everywhere
	// else. Decided last, so the infinitive promotion above has already run
	// and "to write" is distinguishable from "to the shop".
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].tag !== 'TO') continue;
		const next = tokens[i + 1];
		if (!next || next.tag !== 'VERB') tokens[i].tag = 'PREP';
	}
	return tokens;
}

// Collapse the internal tag set to the five highlight buckets.
export function posBucket(tag: string) {
	switch (tag) {
		case 'NOUN': case 'PRON': return 'noun';
		case 'VERB': case 'AUX': case 'MOD': return 'verb';
		case 'ADJ':  return 'adj';
		case 'ADV':  return 'adv';
		case 'CONJ': case 'PREP': return 'conj';
		default: return null;
	}
}

// ── Writing checks ───────────────────────────────────────────────────────────
// Categories follow Editsaurus, which in turn follows Matt Might's shell
// scripts: filler words, passive voice, lexical illusions, commonly misused
// words, and pronouns with loose referents. All of it is list-and-rule based
// and runs on the visible lines only.

// Hedges and intensifiers — filler in any register, always flagged.
export const FILLER_STRONG = new Set(`very really quite rather somewhat fairly pretty
	extremely incredibly absolutely totally completely utterly literally
	actually basically essentially virtually practically arguably apparently
	seemingly presumably supposedly perhaps maybe probably possibly surely
	certainly clearly obviously definitely simply merely just truly honestly
	frankly somehow interestingly notably importantly ultimately effectively`
	.split(/\s+/).filter(Boolean));

// Quantifiers and frequency words: vague, but often doing honest work —
// "most users" in a manual and "several attempts" in a report are fine
// sentences. Behind a sub-toggle, off by default, so the filler check can
// stay on without painting every quantifier on the page.
export const FILLER_SOFT = new Set(`almost nearly roughly approximately several
	various numerous many most some few much lots often sometimes frequently
	occasionally usually generally typically relatively significantly
	substantially considerably slightly marginally overall largely mostly
	partly rarely`.split(/\s+/).filter(Boolean));

export const FILLER_PHRASES = new RegExp('\\b(' + [
	'kind of', 'sort of', 'a bit', 'a little', 'a lot of', 'lots of',
	'in order to', 'due to the fact that', 'the fact that',
	'it is important to note', 'it should be noted', 'needless to say',
	'at the end of the day', 'for all intents and purposes',
	'in terms of', 'with regard to', 'with respect to', 'in the event that',
	'more or less', 'to some extent', 'in my opinion', 'i think that',
	'as a matter of fact', 'when all is said and done', 'each and every',
	'first and foremost', 'few and far between'
].join('|') + ')\\b', 'gi');

// Passive voice: a be-form, optional adverbs, then a past participle.
export const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
	"isn't", "aren't", "wasn't", "weren't", 'get', 'gets', 'got', 'getting',
	// Contractions that can only be "be". The 's forms stay out: "he's
	// taken" is usually "he has taken" — perfect tense, active — and
	// flagging it would be wrong more often than right.
	"i'm", "you're", "we're", "they're"]);

export const IRREGULAR_PP = new Set(`been done gone seen taken given made said known
	written spoken broken chosen driven eaten fallen forgotten frozen hidden
	held kept left lost meant met paid put read run sent set shown shut sold
	sung sunk sat slept spent stood stolen struck sworn taught told thought
	thrown understood worn won built bought brought caught cut felt found got
	gotten heard led let lit lain laid drawn dealt fed fought fled flown
	forbidden forgiven grown hung hurt knelt learnt lent mistaken overcome
	proven quit ridden rung risen sought shaken shone shot shrunk slid sown
	sped spun spread sprung stuck stung stunk striven swept swum swung torn
	thrust trodden woken woven wound withdrawn beaten begun bent bound bred
	burst cast clung crept dug dreamt drunk dwelt hit knit leapt misled
	outdone overrun rebuilt rid sewn shed slain slit smelt spilt split spoilt
	strung sublet swollen undergone undertaken upheld withheld withstood wrung`
	.split(/\s+/).filter(Boolean));

// Words ending in -ed that are not past participles. An exact-match set, not
// a suffix regex: an alternative like `red` also swallows "considered".
export const ED_NOT_PARTICIPLE = new Set(`need indeed hundred thousand sacred wicked
	naked embed exceed proceed succeed feed speed breed bleed agreed freed
	deed creed greed seed weed shed sled bed fled led red wed hatred ahead
	instead spread thread bread dread biped moped aged blessed rugged ragged
	wretched crooked jagged`.split(/\s+/).filter(Boolean));

export const VERB_PREFIXES = ['re', 'over', 'under', 'out', 'mis', 'un', 'pre', 'dis',
	'fore', 'up', 'inter', 'trans', 'co', 'de'];

export function isPastParticiple(tok: WsToken) {
	const lw = tok.lw;
	if (IRREGULAR_PP.has(lw)) return true;
	if (lw.length > 5) {
		for (const pre of VERB_PREFIXES) {
			if (lw.startsWith(pre) && IRREGULAR_PP.has(lw.slice(pre.length))) return true;
		}
	}
	return lw.length > 3 && /ed$/.test(lw) && !ED_NOT_PARTICIPLE.has(lw);
}

export function isLyAdverb(tok: WsToken) {
	return tok.lw.length > 3 && /ly$/.test(tok.lw) && !LY_NOT_ADVERB.has(tok.lw);
}

// Participles that are almost always predicate adjectives after a be-form:
// "she was tired", "we're excited", "he got dressed" are states, not
// passives. A following "by" reinstates the flag — an explicit agent
// ("was surprised by the news") is passive enough to look at. "used" and
// "broken" are deliberately absent: "the tool was used" and "the window
// was broken" are the genuine article.
// States that never take an agent, so even a following "by" is temporal
// or spatial ("was gone by midnight", "was born by the river") and must
// not re-flag them the way it re-flags "was worried by the news".
export const AGENTLESS_STATES = new Set(['gone', 'born']);

export const PARTICIPLE_ADJECTIVES = new Set(`tired excited interested worried
	pleased surprised amazed amused annoyed ashamed bored concerned confused
	convinced delighted depressed determined devoted disappointed dressed
	embarrassed engaged exhausted fascinated frightened frustrated gifted
	married motivated organized organised prepared qualified related relaxed
	relieved satisfied scared shocked skilled stressed stuck talented
	terrified thrilled troubled upset committed dedicated educated
	experienced complicated sophisticated crowded born gone done finished
	lost armed retired settled seated situated located accustomed inclined
	torn broken worn`
	.split(/\s+/).filter(Boolean));

export function findPassive(tokens: WsToken[]) {
	const hits = [];
	const skippable = (t: WsToken) => t.tag === 'ADV' || isLyAdverb(t) || t.lw === 'been' || t.lw === 'being';
	for (let i = 0; i < tokens.length; i++) {
		if (!BE_FORMS.has(tokens[i].lw)) continue;
		let j = i + 1, hops = 0;
		while (j < tokens.length && hops < 4 && skippable(tokens[j])) { j++; hops++; }
		if (j < tokens.length && isPastParticiple(tokens[j])) {
			const pp  = tokens[j];
			const nxt = j + 1 < tokens.length ? tokens[j + 1] : null;
			// Predicate adjectives read as states; only an agent flags them.
			if (PARTICIPLE_ADJECTIVES.has(pp.lw) &&
				(AGENTLESS_STATES.has(pp.lw) || !(nxt && nxt.lw === 'by'))) { i = j; continue; }
			// Idioms that scan as passive but aren't worth a look:
			// "was supposed to", "was meant to", "was bound to".
			if (nxt && nxt.lw === 'to' &&
				(pp.lw === 'supposed' || pp.lw === 'meant' || pp.lw === 'bound')) { i = j; continue; }
			let start = tokens[i].from;
			if ((tokens[i].lw === 'been' || tokens[i].lw === 'being') && i > 0 &&
				/^(have|has|had|having)$/.test(tokens[i - 1].lw)) {
				start = tokens[i - 1].from;
			}
			hits.push({ from: start, to: tokens[j].to });
			i = j;
		}
	}
	return hits;
}

// Lexical illusions: the same word twice in a row. The eye skips them, which
// is exactly why they survive proofreading.
export function findIllusions(tokens: WsToken[]) {
	const hits = [];
	for (let i = 1; i < tokens.length; i++) {
		if (tokens[i].lw !== tokens[i - 1].lw) continue;
		if (tokens[i].lw.length < 2) continue;               // "s s" in odd markup
		if (tokens[i].lw === 'had') continue;                // "she had had enough" is grammar, not a slip
		hits.push({ from: tokens[i - 1].from, to: tokens[i].to });
	}
	return hits;
}

// Pairs people reach for the wrong half of. The old version was a bare
// word list, which flagged every "to", "there" and "then" on the page — a
// check nobody could leave on. Each confusion now has a context rule and
// fires only where the wrong half is the likely reading; the short list
// below is the remainder that is wrong in any context.
export const MISUSED_ALWAYS = new Set(['alot', 'irregardless', 'supposably',
	'definately', 'seperate', 'occured', 'untill', 'recieve', 'alright']);

// s-final nouns that are not plurals, so "less" before them stays legal.
export const MASS_S_NOUNS = new Set(['news', 'means', 'series', 'species',
	'physics', 'economics', 'politics', 'mathematics', 'ethics',
	'linguistics', 'measles', 'diabetes', 'chaos', 'gas', 'lens',
	'progress', 'los', 'las']);

export const COMPARATIVES = new Set(['more', 'less', 'fewer', 'better', 'worse',
	'rather', 'other', 'greater', 'higher', 'lower', 'larger', 'smaller',
	'bigger', 'older', 'younger', 'faster', 'slower', 'stronger', 'weaker',
	'earlier', 'later', 'longer', 'shorter', 'easier', 'harder', 'sooner',
	'farther', 'further', 'closer', 'cheaper', 'deeper', 'wider']);

export function findMisused(tokens: WsToken[]) {
	const hits: { from: number; to: number }[] = [];
	const flag = (a: WsToken, b?: WsToken) => hits.push({ from: a.from, to: (b || a).to });
	for (let i = 0; i < tokens.length; i++) {
		const t  = tokens[i];
		const p  = i > 0 ? tokens[i - 1] : null;
		const n  = i + 1 < tokens.length ? tokens[i + 1] : null;
		const lw = t.lw, nl = n ? n.lw : '', pl = p ? p.lw : '';

		if (MISUSED_ALWAYS.has(lw)) { flag(t); continue; }

		switch (lw) {
			// "could of", "must of" — the contraction 've misheard.
			case 'of':
				if (p && /^(could|would|should|must|might|may)$/.test(pl)) flag(p, t);
				break;
			// "its been", "its a" — the possessive where "it's" belongs.
			// Gerund possessives ("its being late") are real grammar, so
			// being/having stay exempt.
			case 'its':
				if (n && (n.tag === 'DET' ||
					(n.tag === 'AUX' && nl !== 'being' && nl !== 'having') ||
					nl === 'not')) flag(t);
				break;
			// "it's own" — the contraction where the possessive belongs.
			case "it's":
				if (nl === 'own') flag(t);
				break;
			// "their is", "their not coming" — "there"/"they're" territory.
			case 'their':
				if (n && ((n.tag === 'AUX' && nl !== 'being' && nl !== 'having') ||
					nl === 'not')) flag(t);
				break;
			// "there house was cold" — a bare lexicon noun straight after
			// "there" usually wanted "their". The AUX guard keeps
			// existential questions out: "is there money left?".
			case 'there':
				if (n && n.tag === 'NOUN' && POS_LEX[nl] === 'NOUN' &&
					!(p && p.tag === 'AUX')) flag(t);
				break;
			// "better then the rest", "rather then". Time-adverb readings
			// ("things were better then") end the clause, so a content
			// word has to follow before this fires.
			case 'then':
				if (p && n &&
					(COMPARATIVES.has(pl) || (p.tag === 'ADJ' && /er$/.test(pl))) &&
					(n.tag === 'DET' || n.tag === 'PRON' || n.tag === 'NOUN' ||
					 n.tag === 'ADJ' || n.tag === 'NUM' || n.tag === 'VERB')) flag(p, t);
				break;
			// "way to much", "there are to many" — "too" missing an o.
			// Bare "to much/many" is left alone: "it never amounted to
			// much" and "I said this to many people" are fine sentences.
			case 'to':
				if ((nl === 'much' || nl === 'many') &&
					(!p || p.tag === 'AUX' || p.tag === 'MOD' || pl === 'way' || pl === 'far')) flag(t, n);
				break;
			// "don't loose", "will loose", "to loose the game".
			case 'loose':
				if (p && (p.tag === 'MOD' || p.tag === 'TO' ||
					/^(don't|doesn't|didn't|won't|not)$/.test(pl))) flag(t);
				break;
			// "the affect" — the noun slot nearly always wants "effect".
			case 'affect': case 'affects':
				if (p && p.tag === 'DET') flag(t);
				break;
			// "less items" — a countable plural after "less" wants "fewer".
			case 'less':
				if (n && n.tag === 'NOUN' && /s$/.test(nl) &&
					!/(ss|us|is)$/.test(nl) && !MASS_S_NOUNS.has(nl)) flag(t, n);
				break;
			// "who's book is this" — contraction in the possessive slot.
			// "who's next", "who's there", "who's coming" all carry other
			// tags and stay clear.
			case "who's":
				if (n && POS_LEX[nl] === 'NOUN') flag(t);
				break;
			// "your a star", "your not" already fires above; "your are/is"
			// and "your the best" are the same slip with an article.
			case 'your':
				if (nl === 'welcome' || nl === 'not' || nl === 'going' || nl === 'gonna' ||
					(n && n.tag === 'DET') ||
					(n && n.tag === 'AUX' && nl !== 'being' && nl !== 'having')) flag(t);
				break;
			// "accept for the ending" — "except" misheard.
			case 'accept':
				if (nl === 'for') flag(t, n);
				break;
			// "quiet a few", "quiet the achievement" — "quite" mistyped.
			case 'quiet':
				if (nl === 'a' || nl === 'an') flag(t, n);
				break;
			// "will chose", "to chose", "didn't chose" — the past form in a
			// slot that only takes the base verb.
			case 'chose':
				if (p && (p.tag === 'MOD' || p.tag === 'TO' ||
					/^(don't|doesn't|didn't|won't)$/.test(pl))) flag(t);
				break;
			// "had lead the team", "was lead by" — "led" spelled like the
			// metal. Perfect and passive slots only take the participle.
			case 'lead':
				if ((p && /^(have|has|had)$/.test(pl)) ||
					(p && BE_FORMS.has(pl) && nl === 'by')) flag(t);
				break;
			// "walked passed the house" — a verb straight before it means
			// the preposition "past" was wanted.
			case 'passed':
				if (p && p.tag === 'VERB' && n && n.tag === 'DET') flag(t);
				break;
			// "peaked my interest" — "piqued". The possessive plus the noun
			// pins it; a mountain that "peaked" flags nothing.
			case 'peaked': case 'peeked':
				if (n && /^(my|his|her|their|our|your|its)$/.test(nl)) {
					const n2 = i + 2 < tokens.length ? tokens[i + 2] : null;
					if (n2 && /^(interest|curiosity|attention)$/.test(n2.lw)) flag(t, n2);
				}
				break;
		}
	}
	return hits;
}

// A pronoun opening a sentence usually points at the previous one, and the
// reader has to guess which part. Mid-sentence pronouns are left alone.
export const VAGUE_PRONOUNS = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'them', 'there']);

// ...but "This chapter shows" and "Those results held" are determiners
// with the referent standing right next to them — nothing loose there.
export function isVaguePronoun(t: WsToken, next: WsToken | null | undefined) {
	if (!t.first || !VAGUE_PRONOUNS.has(t.lw)) return false;
	if ((t.lw === 'this' || t.lw === 'that' || t.lw === 'these' || t.lw === 'those') &&
		next && (next.tag === 'NOUN' || next.tag === 'ADJ' || next.tag === 'NUM')) return false;
	return true;
}

// ── Readability ──────────────────────────────────────────────────────────────

// Syllable counting by the standard heuristic: strip silent endings, then
// count vowel groups. Wrong on a minority of words ("fire", "poem"), which is
// fine — Flesch–Kincaid averages over a whole document and the error washes
// out long before it moves the grade.
export function countSyllables(word: string) {
	let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
	if (!w) {
		// Spoken length of a figure grows with its digits — "1984" is five
		// syllables out loud. Digits+1, capped, tracks that well enough
		// for a grade that averages over sentences anyway.
		const d = String(word).replace(/[^0-9]/g, '').length;
		return d ? Math.min(6, d + 1) : 0;
	}
	if (w.length <= 3) return 1;
	w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
	w = w.replace(/^y/, '');
	const groups = w.match(/[aeiouy]{1,2}/g);
	return groups ? groups.length : 1;
}

// Sentence ranges within one line. Markdown paragraphs are normally a single
// soft-wrapped line, so a sentence very rarely crosses a hard break; treating
// the line as the outer bound keeps this cheap and viewport-local.
export const SENTENCE_SPLIT = /[^.!?\u2026]+[.!?\u2026]*\s*/g;

export function splitSentences(text: string) {
	const out = [];
	SENTENCE_SPLIT.lastIndex = 0;
	let m;
	while ((m = SENTENCE_SPLIT.exec(text))) {
		if (!m[0].trim()) continue;
		// Trim the trailing whitespace back off so the tint stops at the
		// full stop rather than running into the next sentence.
		const raw  = m[0];
		const from = m.index;
		const to   = from + raw.replace(/\s+$/, '').length;
		if (to <= from) continue;
		// Merge with the previous segment when the split was a false one:
		// the previous "sentence" ended in an abbreviation, an initial or a
		// decimal ("Dr.", "J.", "3."), or this one opens in lowercase — a
		// capital letter is what an actual sentence start looks like.
		// Splitting at "Dr. Smith" halves the sentence and halves the
		// rhythm grade with it.
		const prev = out.length ? out[out.length - 1] : null;
		if (prev) {
			const tail = text.slice(prev.from, prev.to);
			const am   = /([A-Za-z]+)\.$/.exec(tail);
			const falseEnd = (am && (am[1].length === 1 || ABBREVIATIONS.has(am[1].toLowerCase()))) ||
				/\d\.$/.test(tail) || /^[a-z0-9]/.test(raw.trim());
			if (falseEnd) {
				prev.to   = to;
				prev.text = text.slice(prev.from, to).trim();
				continue;
			}
		}
		out.push({ from, to, text: raw.trim() });
	}
	return out;
}

// Flesch–Kincaid grade level. Below ~9 reads easily; the Hemingway app calls
// 10–13 hard and 14+ very hard, which is where the two tints come from.
export function fkGrade(words: number, sentences: number, syllables: number) {
	if (!words || !sentences) return 0;
	return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

// Grade for one sentence, from its own tokens.
export function sentenceGrade(tokens: WsToken[]) {
	if (!tokens.length) return 0;
	let syl = 0;
	for (const t of tokens) syl += countSyllables(t.w);
	return fkGrade(tokens.length, 1, syl);
}

// ── Repetition radar ─────────────────────────────────────────────────────────

// Words common enough that repeating them is invisible and unavoidable. Only
// words outside this list, and long enough to be noticed, are worth flagging.
export const REPETITION_STOPWORDS = new Set(`the a an and or but if then than that this
	these those there here it its it's is are was were be been being am do does
	did have has had having will would shall should can could may might must
	i me my we us our you your he him his she her they them their who whom whose
	what which when where why how all any both each few more most other some such
	no nor not only own same so too very just also as at by for from in into of
	on to with about after before between during over under again once out up
	down off above below now new one two three way get got go went come came
	said say says like make made take took see saw know knew think thought`
	.split(/\s+/).filter(Boolean));

// ── THE COMMON WORDS THE REPORT SETS ASIDE (A347) ────────────────────────
//
// The ten most used words of any English book are the, and, to, of, a, I,
// in, was, he, that — the same ten for every book, telling the writer
// nothing. So the Report's "Most used words" leaves the FUNCTION words out
// (articles, conjunctions, prepositions, pronouns, auxiliaries,
// determiners) and shows the rest, with a tick to bring them back. This is
// NOT the repetition list above, and must not be merged with it: that one
// also hides "said", "looked", "way", "one" — words whose echo is
// invisible in prose but whose COUNT is exactly what a novelist wants read
// back to them.
export const REPORT_STOPWORDS = new Set(`the a an and or but nor if then than that this
	these those there here it its it's is are was were be been being am do does
	did done have has had having will would shall should can could may might must
	ought i me my mine myself we us our ours you your yours he him his she her
	hers they them their theirs who whom whose what which when where why how all
	any both each few more most other some such no not only own same so too very
	just also as at by for from in into of on to with about after before between
	during over under again once out up down off above below through against
	without within upon onto until while because although though whether either
	neither yet don't didn't doesn't isn't wasn't weren't won't wouldn't couldn't
	shouldn't can't cannot hasn't haven't hadn't i'm i've i'd i'll you're you've
	he's she's we're we've they're they've that's there's what's`
	.split(/\s+/).filter(Boolean));

// A word is an echo when the same word appeared within `window` words behind
// it. Both occurrences are marked, because you cannot fix one without seeing
// the other.
// ── Dialogue ────────────────────────────────────────────────────────────────
//
// Every quoted stretch on a line, as {from,to} offsets INTO THAT LINE.
//
// Four pairs are recognised: straight double and single, and their curly
// counterparts. Curly quotes are directional, so an opening one can only be
// closed by its own partner — which is what makes them reliable. Straight
// ones are ambiguous by nature, and the single straight quote is the hard
// case: it is also the apostrophe, and "don't" is not dialogue.
//
// So the apostrophe rule is POSITIONAL rather than a word list: a straight
// or curly single quote with a letter or digit on BOTH sides is an
// apostrophe (don't, it's, o'clock, '90s is handled by the digit test on the
// other side), and anything else is a candidate quote mark. That covers
// contractions and possessives without a dictionary, which is the only way
// it can work in every language the plugin counts.
//
// An UNCLOSED quote runs to the end of the line and no further. A speech
// that continues over a paragraph break is real (and English typography
// opens each paragraph without closing the last), but a highlight that
// leaks down the rest of the note because a writer typed one quote mark is
// far worse than one that stops early. The line is the unit here.
export function findDialogue(line: string) {
	const text = String(line || '');
	const out = [];
	// Openers mapped to what may close them. Curly pairs are strict;
	// straight marks close on themselves.
	const PAIRS: Record<string, string> = {
		'"': '"', "'": "'",
		'\u201c': '\u201d', '\u2018': '\u2019',
		// A few languages open with the closing-shaped mark or with
		// guillemets; both are common enough in translated manuscripts to
		// be worth recognising rather than leaving as stray text.
		'\u00ab': '\u00bb', '\u201e': '\u201c'
	};
	const isWordish = (ch: string) => !!ch && /[\p{L}\p{N}]/u.test(ch);
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		const close = PAIRS[ch];
		if (!close) { i++; continue; }
		// An apostrophe, not an opening quote: letters or digits on both
		// sides. Only the single marks can be one.
		if ((ch === "'" || ch === '\u2018' || ch === '\u2019')
			&& isWordish(text[i - 1]) && isWordish(text[i + 1])) { i++; continue; }
		let j = -1;
		for (let k = i + 1; k < text.length; k++) {
			const c = text[k];
			if (c !== close) continue;
			// The same positional rule at the closing end, or "it's" inside
			// a single-quoted line would end the speech early.
			if ((close === "'" || close === '\u2019')
				&& isWordish(text[k - 1]) && isWordish(text[k + 1])) continue;
			j = k;
			break;
		}
		// Unclosed: to the end of the line, which is as far as this can
		// safely guess.
		const end = j === -1 ? text.length : j + 1;
		if (end > i + 1) out.push({ from: i, to: end });
		i = end;
	}
	return out;
}

export function findRepetitions(tokens: WsToken[], windowSize: number, minLength: number) {
	const hits = [];
	const lastSeen = new Map<string, { i: number; from: number; to: number; flagged: boolean }>();
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const w = t.lw.replace(/[^a-z']/g, '');
		if (w.length < minLength || REPETITION_STOPWORDS.has(w)) continue;
		// Crude stemming, so "writing" echoes "writes".
		const stem = w.replace(/(ing|ed|es|s)$/, '');
		const key  = stem.length >= 4 ? stem : w;
		const prev = lastSeen.get(key);
		if (prev !== undefined && i - prev.i <= windowSize) {
			// The previous occurrence is only pushed the first time it
			// echoes — a word appearing three times in the window used to
			// emit the middle occurrence twice.
			if (!prev.flagged) hits.push({ from: prev.from, to: prev.to });
			hits.push({ from: t.from, to: t.to });
			lastSeen.set(key, { i, from: t.from, to: t.to, flagged: true });
		} else {
			lastSeen.set(key, { i, from: t.from, to: t.to, flagged: false });
		}
	}
	return hits;
}

// ── Smart typography ─────────────────────────────────────────────────────────
// Rules are pure data: `text` is what the user has typed once the newest
// character lands, `insert` is what replaces it. One matcher drives all of
// them, so adding a rule is a line rather than a branch.
//
// The dash chain is the interesting case — -- gives an en dash, another -
// promotes it to an em dash, and a third backs all the way out to three
// literal dashes, which is the escape hatch for anyone who wanted ---.
export const TYPO_RULES = [
	{ group: 'ellipsis',    text: '...',  insert: '\u2026' },

	{ group: 'dashes',      text: '--',            insert: '\u2013' },
	{ group: 'dashes',      text: '\u2013-',        insert: '\u2014' },
	{ group: 'dashes',      text: '\u2014-',        insert: '---'    },

	{ group: 'arrows',      text: '->',   insert: '\u2192' },
	{ group: 'arrows',      text: '<-',   insert: '\u2190' },
	{ group: 'arrows',      text: '=>',   insert: '\u21d2' },

	{ group: 'guillemets',  text: '<<',   insert: '\u00ab' },
	{ group: 'guillemets',  text: '>>',   insert: '\u00bb' },

	{ group: 'comparisons', text: '<=',   insert: '\u2264' },
	{ group: 'comparisons', text: '>=',   insert: '\u2265' },
	{ group: 'comparisons', text: '/=',   insert: '\u2260' },

	// notAfter stops 11/2 from collapsing into 1½.
	{ group: 'fractions', text: '1/2',  insert: '\u00bd', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/3',  insert: '\u2153', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '2/3',  insert: '\u2154', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/4',  insert: '\u00bc', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '3/4',  insert: '\u00be', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/5',  insert: '\u2155', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '2/5',  insert: '\u2156', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '3/5',  insert: '\u2157', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '4/5',  insert: '\u2158', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/6',  insert: '\u2159', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '5/6',  insert: '\u215a', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/7',  insert: '\u2150', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/8',  insert: '\u215b', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '3/8',  insert: '\u215c', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '5/8',  insert: '\u215d', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '7/8',  insert: '\u215e', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/9',  insert: '\u2151', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/10', insert: '\u2152', notAfter: /[\d/]/ }
];

// Longest first, so 1/10 wins over 1/1 and the em-dash chain resolves before
// the en-dash rule gets a look.
TYPO_RULES.sort((a, b) => b.text.length - a.text.length);

export const TYPO_MAX_LOOKBACK = TYPO_RULES.reduce((n, r) => Math.max(n, r.text.length), 0);

// A quote opens when nothing meaningful precedes it — start of line,
// whitespace, an opening bracket, or a dash. It closes otherwise, which is
// what makes don't come out as don\u2019t with no apostrophe special case.
export const TYPO_OPENS_AFTER = /[\s([{<\u2018\u201c\u2013\u2014\u2026-]/;

// ── Non-prose line scanning ──────────────────────────────────────────────────

// Line numbers (1-based) that are not prose: YAML frontmatter, fenced code
// (``` and ~~~), and $$ math blocks. Shared by the word counter, which works
// on a raw string, and the syntax highlighter, which works on a CodeMirror
// document — one implementation means the two can never disagree about which
// lines are text.
export function scanNonProseLines(lines: string[]) {
	const set = new Set();
	let inFence = false, fenceChar = '', inFront = false, inMath = false;
	for (let i = 0; i < lines.length; i++) {
		const n = i + 1, text = lines[i];
		if (n === 1 && /^---\s*$/.test(text)) { inFront = true; set.add(n); continue; }
		if (inFront) { set.add(n); if (/^---\s*$/.test(text)) inFront = false; continue; }
		const fence = text.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence) {
			const ch = fence[1].charAt(0);
			if (!inFence)         { inFence = true;  fenceChar = ch; set.add(n); continue; }
			if (ch === fenceChar) { inFence = false; set.add(n); continue; }
		}
		if (inFence) { set.add(n); continue; }
		if (/^\s{0,3}\$\$/.test(text)) {
			set.add(n);
			if (!/^\s{0,3}\$\$.*\$\$\s*$/.test(text)) inMath = !inMath;
			continue;
		}
		if (inMath) set.add(n);
	}
	return set;
}

// ── Paragraph detection ──────────────────────────────────────────────────────

// Lines that open a block construct. Every one of these carries its own
// indentation already — a bullet, a table cell, a quote marker — so adding a
// first-line indent on top just breaks the alignment it depends on.
export const BLOCK_LINE_RE = /^\s{0,3}(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~|\[\^[^\]]*\]:|:\s)|^(?:\s{4,}|\t)\S/;

// Thematic breaks and setext underlines: --- *** ___ ===
export const RULE_LINE_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|={2,})\s*$/;

export function isParagraphLine(text: string) {
	if (!text || !text.trim()) return false;
	if (RULE_LINE_RE.test(text))  return false;
	if (BLOCK_LINE_RE.test(text)) return false;
	return true;
}

// ── Counting ─────────────────────────────────────────────────────────────────

// Han and kana are counted per character, because Japanese and Chinese are
// not space-delimited — splitting on whitespace returns 1 for an entire
// paragraph. Hangul is deliberately absent: Korean *does* put spaces between
// words, so it counts the same way English does.
export const CJK_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;

// A word is any run starting with a letter or digit. Requiring one of those
// is what keeps list bullets, table pipes, blockquote markers and emphasis
// asterisks from each counting as a word.
export const WORDISH = /[\p{L}\p{N}][\p{L}\p{N}'\u2019_-]*/gu;

// Blanks out markup while preserving nothing but the prose. Unlike
// maskMarkup (used for highlighting) this keeps inline code *content* — "the
// `config` file has three keys" is a seven-word sentence to any writer — and
// strips list, task and blockquote prefixes, which highlighting does not care
// about but counting very much does.
export function maskForCounting(text: string) {
	const blank = (m: string) => ' '.repeat(m.length);
	let out = text;
	out = out.replace(/^\s*(?:>\s?)+/, blank);                    // blockquote markers
	out = out.replace(/^\s*[-*+]\s+\[[ xX-]\]\s*/, blank);      // task checkbox
	out = out.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, blank);         // list bullet / number
	out = out.replace(/`+/g, blank);                              // fences only; code text counts
	out = out.replace(/!\[\[[^\]]*\]\]/g, blank);                 // embeds
	out = out.replace(/\[\[([^\]|]*)\|/g, blank);                 // wikilink target + pipe
	out = out.replace(/\[\[|\]\]/g, blank);
	out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, blank);            // images
	out = out.replace(/\]\([^)]*\)/g, blank);                     // link target
	out = out.replace(/https?:\/\/\S+/g, blank);                  // bare urls
	out = out.replace(/<[^>]+>/g, blank);                         // html tags
	out = out.replace(/\[\^[^\]]*\]/g, blank);                    // footnote markers
	out = out.replace(/\$[^$\n]+\$/g, blank);                     // inline math
	return out;
}

// ── Markup masking ───────────────────────────────────────────────────────────

// Blanks out everything that is not prose, preserving string length so all
// offsets stay valid against the real line. Inline code, URLs, link targets,
// HTML tags and footnote markers are replaced by spaces; the visible text of
// a link is kept, because that text is prose the writer is responsible for.
export function maskMarkup(text: string) {
	const blank = (m: string) => ' '.repeat(m.length);
	let out = text;
	out = out.replace(/`[^`]*`?/g, blank);                        // inline code
	out = out.replace(/!\[\[[^\]]*\]\]/g, blank);                 // embeds
	out = out.replace(/\[\[([^\]|]*)\|/g, blank);                 // wikilink target + pipe
	out = out.replace(/\[\[|\]\]/g, blank);                       // wikilink brackets
	out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, blank);            // images
	out = out.replace(/\]\([^)]*\)/g, blank);                     // md link target
	out = out.replace(/https?:\/\/\S+/g, blank);                  // bare urls
	out = out.replace(/<[^>]+>/g, blank);                         // html tags
	out = out.replace(/\[\^[^\]]*\]/g, blank);                    // footnotes
	out = out.replace(/^\s{0,3}#{1,6}\s/, blank);                 // heading marker
	out = out.replace(/\{\{[^}]*\}\}/g, blank);                   // templates
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — a manuscript out of the vault
// ─────────────────────────────────────────────────────────────────────────────

// A .docx is a ZIP of small XML files, and Word accepts STORED (uncompressed)
// entries — so the whole container is a few hundred lines with no dependency
// and no build step, which is the only way it can also work on a phone.
// Writing it by hand rather than pulling in a library is a deliberate trade:
// the library is ~500KB on a main.js that is already 1.3MB, and every byte of
// that ships to every writer whether they export or not.
//
// The CRC is the only fiddly part, and it is fiddly in a specific way: get it
// wrong and Word does not say "bad checksum", it says the file is corrupt and
// offers to recover it. So the table is standard and the probe checks a known
// value rather than trusting it.

// ── THE TABLE'S SIZING MATH, PURE ───────────────────────────────────────────
//
// Extracted from `openManuscriptModal` (BRIEF-TABLE-SUBGRID Phase 1) so the
// §9d floor rule is finally probe-reachable: inside the closure, jsdom's
// chPx of 0 made `fitData` return before the floors ran, and the rule that
// keeps a value from being cut was guarded by the live vault alone. Here
// chPx is an ARGUMENT — there is no early return to hide behind, and the
// tests in tests/fit_cols_test.js drive every branch.
//
// PURE MEANS PURE: no DOM, no closure state, no settings. The window
// gathers roomPx/chPx/gapPx from the DOM (those reads stay in the closure,
// where the elements are) and passes numbers in. These four survive the
// subgrid swap (Phase 2) as the documented fallback, tested but uncalled.
//
// The constants and the 1.12 label weight are facts about the table, each
// with one writer here — the closure may not restate them.
//
// TIGHTER THAN THE FIRST GUESS: the first floor weighted the label 1.2
// and added 2ch of air, which on a column of en-dashes is a heading with
// a third of its own width in padding. Labels ellipse, so a floor a
// little short costs a letter rather than an overflow — the asymmetry
// that makes tightening safe. MAX_TEXT is the lower ceiling for a column
// of WORDS: fourteen characters is a point of view, a status, a place
// name, or the first two of a list of tags — enough to recognise a value,
// not enough for one long one to take a quarter of the pane (measured: a
// 109px Pov column, every visible cell empty, sized by a note scrolled
// off screen). The cap never squeezes the heading — see wsColPrefCh.
export const WS_COL_MIN_CH = 4, WS_COL_MAX_CH = 20, WS_COL_MAX_TEXT_CH = 14, WS_COL_PAD_CH = 1;
// THE LABEL COSTS MORE THAN ITS LETTERS: small caps with letter-spacing,
// weighted rather than measured (a layout pass per label is a price the
// window cannot pay, and jsdom could never answer).
export function wsLabelCh(label: string) {
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
// ready for vault.createBinary.
export function wsZip(entries: { name: string; bytes: number[] }[]) {
	const out: number[] = [];
	const central: number[][] = [];
	const u16 = (v: number) => [v & 0xFF, (v >> 8) & 0xFF];
	const u32 = (v: number) => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
	let offset = 0;
	for (const e of entries) {
		const name = wsUtf8(e.name);
		const data = e.bytes;
		const crc  = wsCrc32(data);
		// Local header. Version 20, no flags, method 0 (stored). The DOS
		// date/time is left at zero: Word does not care, and a real clock
		// here would make two exports of the same manuscript differ byte
		// for byte, which makes the probe's job harder for no gain.
		const local = ([] as number[]).concat(
			u32(0x04034B50), u16(20), u16(0x0800), u16(0),
			u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
			u16(name.length), u16(0), name);
		central.push(([] as number[]).concat(
			u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0),
			u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
			u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
			u32(offset), name));
		for (const b of local) out.push(b);
		for (let i = 0; i < data.length; i++) out.push(data[i]);
		offset += local.length + data.length;
	}
	const cdStart = offset;
	let cdLen = 0;
	for (const c of central) { for (const b of c) out.push(b); cdLen += c.length; }
	const end = ([] as number[]).concat(u32(0x06054B50), u16(0), u16(0),
		u16(central.length), u16(central.length), u32(cdLen), u32(cdStart), u16(0));
	for (const b of end) out.push(b);
	return new Uint8Array(out);
}

// XML text escaping. Ampersand first or the escapes escape each other.
// One id per section, shared by every target so a link means the same thing
// in the .docx, the PDF and the markdown. Word bookmark names are the strict
// case — letters, digits and underscore, no leading digit, 40 characters —
// so that is what everything uses rather than three near-identical schemes.
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
// ── HOW FAR THE TITLE BLOCK DROPS ──────────────────────────────────────
//
// Writer, 2026-09-03, twice: "the preview still don't center that title and
// author and number of words on the first page." Asked which they meant,
// they chose to CENTRE IT IN BOTH — the sheet and the .docx — so the two
// stay in step.
//
// IT WAS A LITERAL EIGHT, matching the eight empty paragraphs Word drops.
// Eight is about a third of the way down a Letter page, which is where a
// generated title page usually lands and is not centred.
//
// COMPUTED FROM THE PAGE, because "centred" is not a number: it depends on
// the paper, its margins, the point size and the line spacing, all four of
// which this window lets a writer change. A fixed drop centres exactly one
// combination of them.
//
// ONE WRITER, TWO READERS. `wsDocxBody` pushes this many empty paragraphs
// and the preview sets `padding-top` to the same count of line boxes, so
// the sheet on screen stays the sheet in the file — which is the coupling
// the old comment existed to protect, kept rather than broken.
//
// THE BLOCK IS WHAT IT DRAWS: a title, an author line when there is one,
// and a blank plus the word count when that is shown.
// ── WHICH TARGETS HAVE PAGES ───────────────────────────────────────────
//
// The Export pane hides typesetting where there are no pages, and the
// Structure group hides the page CHOICE for the same reason. Both asked
// the `FORMATS` table, which is a local inside the tab builder — so the
// second reader threw `FORMATS is not defined` and took the whole options
// build with it. Measured in the running vault: the pane came back with
// one select in it, the format picker, and nothing else.
//
// SO THE FACT MOVES HERE, where both readers can have it, and `FORMATS`
// reads it too rather than restating it.
// ── SHOULD THE NARROW CLASS FLIP? (A186, lifted 2026-09-06) ─────────────────
//
// The Organizer's width watcher observes the window root and writes a class
// ON the window root, and `is-narrow` changes that element's own layout —
// one pane instead of two, the name column capped. **An observer must not
// write what it watches**: measure → write → re-measure spins whenever the
// write moves the width back across the threshold, which is a question about
// scrollbars, fonts and device pixels rather than about this code. That is
// why it settles on a Mac Studio and freezes on a MacBook Pro.
//
// THE THREE GUARDS LIVED INSIDE `openManuscriptModal`, a closure nothing can
// reach, so the one loop this plugin has a vault report for was the one part
// of it no assertion held. A jsdom section was written and WITHDRAWN — it
// went green against the unguarded build twice, because jsdom has no layout
// and a shim has to invent the feedback and then proves whatever it
// invented.
//
// SO THE DECISION IS PURE AND THE OBSERVER IS THE PLUMBING. A hostile width
// sequence can be fed to this directly, in plain node, and the answer is the
// shipped one rather than a copy of it — which is the lesson `wsUnderIndex`
// cost earlier today.
//
// `state` IS MUTATED, deliberately: the budget has to remember across calls,
// and threading it back through a return value would let a caller forget to
// store it — which is the one mistake that turns the budget off.
export function wsNarrowDecide(state: WsNarrowState, w: number, lim: number, now: number) {
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
// ── IS THE EXPLORER PAINTER IN A STORM? (A202) ─────────────────────────────
//
// `attachExplorerObserver` watches the file-explorer subtree and
// `patchExplorerDOM` writes into it. Our own writes are filtered out (see
// `explorerRecordsMatter`), but the loop Obsidian can close for us is not
// ours to filter: our badges change a row's height, the explorer's VIRTUAL
// SCROLLER re-renders rows to suit, that is Obsidian removing and adding
// nodes, we repaint, heights change again. **That fight only exists when the
// tree scrolls** — a small screen with a big vault, which is the cleanest
// account anyone has offered of “a problem on my MacBook Pro, but not at all
// on Mac Studio”.
//
// NOT REPRODUCED HERE. This is a guard for a mechanism nobody has watched
// fire, like the three on `is-narrow` before it, and it makes the same
// trade: **a freeze becomes a missing decoration and a sentence on screen**,
// and a writer can report a sentence. A frozen Obsidian cannot even have its
// console opened — that reporter said so.
//
// THE WINDOW IS DELIBERATELY LONG. A writer flicking through a big tree
// makes bursts, and a burst is not a storm; three seconds of nearly every
// frame is not something a hand does. The cost of firing early is badges
// that vanish during a scroll, which would be a bug report of its own.
export function wsPassStorm(state: { marks: number[] }, now: number) {
	state.marks.push(now);
	while (state.marks.length && now - state.marks[0] > WS_STORM_MS) state.marks.shift();
	return state.marks.length > WS_STORM_PASSES;
}
export function wsPassState(): { marks: number[] } { return { marks: [] }; }
// ── SOON, AND NOT ON A FRAME (A279) ────────────────────────
//
// AN OCCLUDED ELECTRON WINDOW THROTTLES `requestAnimationFrame` TO NOTHING —
// measured at A258, where a tick painter drew no boxes at all while Obsidian
// sat behind the terminal. A zero-millisecond timeout still runs. Anything
// that must paint whether or not the window is on screen asks for this one.
//
// NOT A GENERAL REPLACEMENT: an animation SHOULD stop while nobody is
// looking, and those keep their frames.
export function wsSoon(fn: () => void) {
	// window's timer, never the bare global (a pop-out's work belongs to its
	// window); a fixture with no window at all runs the work now.
	try { return window.setTimeout(fn, 0); }
	catch { fn(); return 0; }
}
export const WS_STORM_MS = 3000;
// 150 passes in three seconds is fifty a second sustained — past what a
// scroll produces and short of nothing.
export const WS_STORM_PASSES = 150;

// ── ONE THROW MUST NOT TAKE A FEATURE — OR A NEIGHBOUR — WITH IT ──────
//
// Obsidian fires an event by walking a plain list of callbacks. A throw in
// ours does not stop at us: it stops the WALK, so every handler registered
// after ours — other plugins’ — never runs for that event. The same shape
// applies to a DOM listener on `document`: the throw is reported and the
// listener survives, but everything our own handler meant to do after the
// failing line is silently skipped, for ever, with no mark on screen.
//
// MEASURED FIRST, and it changed the scope. Every state latch in the plugin
// (`_patchRunning`, `_fitPending`, `_themeGuarding`, `_folderWordBusy`,
// `_panelRefreshPending`) already clears BEFORE its risky work or inside a
// catch-all, so the “a throw leaves a latch shut and the feature is dead”
// story does not apply here — 8 latches checked, 8 already safe. What is
// left is the boundary, which is what this guards.
//
// IT REPORTS. A guard that swallows quietly is worse than the throw it
// caught, so: one console line per SITE (not per fire — a handler that
// throws on mousemove would fill the console in a second), and one Notice
// per session, because the reporter who could not open a console is the
// reason any of this exists.
export const WS_GUARD_SEEN = new Set<string>();
export let WS_GUARD_TOLD = false;
// SET BY THE PLUGIN, not imported: this file is loaded in plain node by the
// probes, where `Notice` does not exist and a Notice is not wanted anyway.
export let WS_GUARD_TELL: ((where: string, err: unknown) => void) | null = null;
export function wsGuardTell(fn: (where: string, err: unknown) => DocumentFragment) { WS_GUARD_TELL = fn; }
// FOR THE PROBES, and for a second plugin instance in the same process:
// without this the “once per site” memory carries between cases and the
// second case asserts on a report the first one already made.
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
// `where` IS A SENTENCE THE WRITER COULD READ, not an internal name. It ends
// up in a Notice, and “wsOrgTick” tells them nothing about what stopped.
// ── REPAIR ON READ (A231-1b, stability brief item 4) ────────────────────
//
// data.json is a file a writer can edit, a sync can half-write, and an
// older build can leave a different shape in. `Object.assign` put whatever
// it held over the defaults, so a string where a number belongs, or null
// where an object does, reached every reader that trusted the default's
// shape — and those readers are everywhere, most of them guarded by
// nothing. THE DEFAULTS ARE THE SCHEMA: one writer of the shape, no second
// table to keep in step. A key whose default is null or undefined accepts
// anything; a key not in the defaults is not this function's business.
//
// STRICT ON PURPOSE: `"15"` for a font size is reset, not coerced. A coercion
// is a second opinion about what the writer meant, and the default is the
// one value every reader already copes with.
// The settings read as the bag they are on disk: for the walks that visit every
// key by name, where the shape of one key is exactly what is being checked.
export const wsBag = (o: object): Record<string, unknown> => o as Record<string, unknown>;
// A folder by its shape, not its class: a vault folder has `children` where a
// note has none, and the fixtures build plain objects of the same shape.
export const wsIsFolder = (f: TAbstractFile | null | undefined): f is TFolder => !!f && Array.isArray((f as { children?: unknown }).children);
// and a note the same way: a path with no children
export const wsIsFile = (f: TAbstractFile | null | undefined): f is TFile => !!f && !Array.isArray((f as { children?: unknown }).children);
// a note's stat, read by shape for the same reason (a folder has none)
export const wsStatOf = (f: TAbstractFile | null | undefined): FileStats | null => (f && (f as { stat?: FileStats }).stat) || null;
// A value as text, for a String() over an unknown: an object says its JSON, not
// [object Object], and nothing says 'undefined'.
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
// answers 1 to, where `instanceof Element` (and a global that a probe's
// window may not have) would not.
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

// ── A PARAGRAPH AND THE LINE IT CAME FROM (A231-2b) ──────────────────────
//
// The reader shows prose the export rendered; the note holds the same prose
// as markdown. To put the caret where the writer clicked, the paragraph's
// opening words are looked for in the note with the markup read past:
// hashes, emphasis, a link's text without its target, a quote's chevron.
// The FIRST line that reads the same wins — a repeated line goes to its
// first appearance, which is where a reader would look too.
export function wsSnippetOf(text: string) {
	return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
export function wsPlainLine(line: string) {
	return String(line || '')
		.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (m: string, a: string, b: string) => b || a)
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

// ── THE SWALLOWED CATCH, NAMED (A252-4) ───────────────────────────────────
//
// 458 `catch (_) {}` sites (2026-09-08), each a place where a throw died
// without a mark: the rest of the try did not run, and nobody was told.
// Every one now reads `catch (_) { wsCatch(where, _); }`, the sentence
// read from the source by `ws-dev/name-catches.js` — the method, the
// closure, the first statement of the try — so a console line can say
// what did not finish.
//
// NOT THE GUARD'S NOTICE. Most of these sites expect to throw now and
// then — a file that is not there, an API an older Obsidian lacks, a
// listener already removed — and a Notice on every start for a battery
// file that does not exist would be the noise the writer switched the
// plugin off over. So: the console, ONCE per site per session, and the
// count; the diagnostics carry the list, so a report can quote it.
export const WS_CATCH_SEEN = new Map<string, { n: number; last: string }>();
export function wsCatch(where: string, err: unknown) {
	const rec = WS_CATCH_SEEN.get(where);
	const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : (err ? JSON.stringify(err) : ''));
	if (rec) { rec.n++; rec.last = msg; return false; }
	WS_CATCH_SEEN.set(where, { n: 1, last: msg });
	try { console.warn('Word-Smith: ' + where + ' threw and was contained: ' + msg); } catch { /* ws:keep */ }
	return true;
}
export function wsCatchSeen() {
	return Array.from(WS_CATCH_SEEN, ([where, r]) => ({ where, n: r.n, last: r.last }));
}
export function wsCatchReset() { WS_CATCH_SEEN.clear(); }

// WHAT HANGS BELOW THE NAVBAR (A293). On a phone Obsidian draws
// `.mobile-navbar` over the foot of a leaf that runs the full screen; a
// raised one is 80px where a plain one is 48 and its own views are padded
// for the plain one. Measured, not guessed: the element’s bottom against
// the navbar’s top, in pixels, or 0 where there is no navbar.
export function wsNavbarOverlap(el: HTMLElement) {
	const nav = document.querySelector('.mobile-navbar');
	if (!nav || !el) return 0;
	const n = nav.getBoundingClientRect(), b = el.getBoundingClientRect();
	if (!(n.height > 0) || !(b.height > 0)) return 0;
	return Math.max(0, Math.round(b.bottom - n.top));
}

// A PATH THE WRITER TYPED, in the vault's own spelling (plugin guidelines,
// read 2026-09-11: “use normalizePath() for user-defined paths”). Obsidian’s
// `normalizePath` trims, turns backslashes round, folds `//`, strips the
// ends' slashes and NFC-normalises — and answers '/' for nothing, which
// every caller here wants as '' so its default can apply. A probe's stub
// may not carry it; the fallback does the first four by hand. The vault
// knows a file under ONE exact string and answers null for every other
// spelling, so before this a pasted `Word-Smith\ws-structure.md` was “not
// found”, the legacy name was tried, and a second store could be made
// beside the first — the duplicate-store fault (A182) by another door.
// Normalising can only find MORE, never move a store: a file that exists
// is already at its normalised path.
// ── THE SAME TEXT IN OTHER LINE ENDINGS IS THE SAME TEXT (A295, 2026-09-15) ──
//
// A user: "any little interaction with it (including updating Word-Smith)
// updates the ws-structure.md file, and it messes up my recent files log".
// MEASURED: the store's composer is byte-identical from 1.4.3 through 1.5.1,
// and Obsidian's `vault.process` writes nothing when the callback hands
// back the very string it was given (the asar: `if ((o = t(r)) === r)
// return r`). So a store rewritten on an update composed DIFFERENT bytes —
// and the one difference that is nobody's edit is the line ending: an
// editor or a sync client that saves CRLF turns every `\n` the plugin wrote
// into `\r\n`, the plugin composes `\n` again, and the two never agree,
// so every save rewrites the file and every sync carries it. This is the
// compare the three store writers make before handing `process` a new
// text: equal but for `\r`, and the file is left exactly as it is.
export function wsTextSameEol(a: string, b: string) {
	const norm = (t: string | null | undefined) => String(t == null ? '' : t).replace(/\r\n?/g, '\n');
	return norm(a) === norm(b);
}
// ── A CONTEXT IS LENT A MODULE'S MEMBERS BY NAME (2026-09-15) ────────────
//
// The Organizer's table is handed a context of ninety names by the window
// that opens it (44-organizer-table.js reads `ctx.orgColRaw` and the rest).
// Fifty-five of those are members of the modules lifted out of the window
// the day before — a function, or a live `let` the module returns as a
// getter and a setter — and each was written out by hand as one more
// accessor: `get orgColRaw() { return orgColRaw; }`. This lends them instead:
// a getter each, reading the module when asked (so a live let is read
// when it is read, not when it is lent), and a setter wherever the module
// has one, so a write through the context lands where the let lives.
//
// IT REFUSES A NAME THE MODULE DOES NOT HAVE, at open time, loudly — a
// misspelt accessor used to hand the table `undefined` and the table read
// it without complaint.
//
// AND THE CHECKER KNOWS WHAT WAS LENT (A422 step 4): `.lend(mod, names)`
// takes the names as keys OF THE MODULE and answers a bag whose type has
// them, so `const tableCtx: WsOrgCtx = wsCtxLend(own).lend(…)…bag()` is
// checked member by member against the declared context (org-ctx.ts) —
// the bag a probe once held by reading the table's source for `ctx.<name>`.
// The one assertion is inside, after `defineProperty` has made it true.
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

// A MENU ON A PHONE IS A SHEET AT THE BOTTOM OF THE BODY (A294, from the
// writer’s shot of the property-type chooser showing four rows of six).
// `.is-phone .menu { position: absolute; bottom: 0 }` puts every Obsidian
// menu at the screen’s foot, under the raised navbar that covers the last
// 80px; the pane root’s stamp cannot reach an element on the body. So the
// sheet is marked once it is shown and the body carries the bar’s height,
// measured then — the bar is raised or plain, and the keyboard comes and
// goes — and the sheet sits on it. Every menu the Organizer opens comes
// from `wsMenu()`, which is `new Menu()` with the lift behind its two
// show doors.
// THE LAST SHEET, MEASURED 300ms AFTER IT WAS SHOWN (A294-b: the second
// shot showed four rows with the lift deployed). A menu is gone by the
// time the palette runs “Copy diagnostics”, so the record is taken when
// the menu is drawn and printed later: every row, the rows without a box,
// the rows with something ELSE under a finger at their middle
// (elementFromPoint — a navbar painted over the sheet counts here), the
// sheet’s rect and computed bottom, the body’s stamp, the navbar.
export let WS_LAST_SHEET: string | null = null;
// STORED TOO (A294-d): three pastes came after a restart each — Android
// drops the app when the writer switches to the chat and back — so the
// in-memory record never reached a report. localStorage is per vault per
// device and survives that; the same door the start guard uses.
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
			'navbar ' + (n ? R(n) + ' z ' + getComputedStyle(nav).zIndex : 'none'),
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
// THE LAST KEYBOARD (A298): a field focused in a pane on a phone, and 700ms
// later the geometry that a paste can carry — the leaf, the root, the body
// and its bar padding, the panel and its scroll, the field, the window and
// the visual viewport, Obsidian’s --keyboard-height, the bar. Kept like the
// sheet: the app restarts between the look and the command.
export const WS_KB_KEY = 'word-smith:last-keyboard';
export let WS_LAST_KEYBOARD: string | null = null;
export function wsKeyboardRecord(root: HTMLElement) {
	try {
		const R = (el: Element) => { if (!el) return 'none'; const r = el.getBoundingClientRect(); return Math.round(r.top) + '..' + Math.round(r.bottom) + ' (' + Math.round(r.height) + ')'; };
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

// THE SCOPE A CONTEXT HOLDS (A238). The Export tab hands its context
// `scope: () => exportScope()`; the modal hands a string. A reader that
// does `String(ctx.scope)` prints the function — "() => exportScope()" in
// the title box, seen in a screenshot. One reader, which asks a function
// and takes a string as it is.
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
				return (out as PromiseLike<unknown>).then(null, (err: unknown) => { wsGuardReport(where, err); });
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

// ── WHAT NEVER REACHES THE DISK (A211) ────────────────────────────────────
//
// Writer, 2026-09-06: “History pane should NOT keep remembering across
// restarts”, answering the one open question in a larger ask — the window
// should remember how you were looking FOR THE SESSION, and start fresh
// after a restart.
//
// THE RULE THAT FALLS OUT: a choice about the MANUSCRIPT persists — the
// selected folder, targets, flags, the column set, the tree order, the
// ticks. A choice about the VIEW lasts the session. These three are view.
//
// NOT MOVED TO ANOTHER OBJECT, which is the design that keeps this small:
// they go on living on `this.settings`, so the nine places that read them
// and the forty-three assertions that name them are untouched. What
// changes is only that the SAVE strips them and the LOAD drops them — the
// one place where “does this reach the disk” is decided, rather than a
// rule restated at every writer.
//
// AND THE LOAD DROPS THEM TOO, not just the save: a `data.json` written by
// an older build still carries all three, and honouring those would be the
// old behaviour surviving the change that removed it. A key that is
// written by nothing and read by nothing is a trap — this file has said so
// before, deleting `orgLenses` on load for the same reason.
export const WS_SESSION_KEYS = ['historyView', 'historySeries', 'historyCalMetric'];

// (WS_TAB_KEYS — which key belonged to which settings tab, for A237 57's
// Reset this tab — retired 2026-09-18 with the tabs (A421): a group of the
// declarative panel reads its own keys off its definitions, and
// `settingsResetKeys` takes the list.)
// ── AND THE WINDOW’S OWN VIEW, SAME RULE (A211) ───────────────────────────
//
// Writer, 2026-09-06: “I also want for the organiser to remember its state
// if I close it. **not if I close obsidian and then restart it**.”
//
// HELD ON THE PLUGIN INSTANCE and never written anywhere, so a restart, a
// `plugin:reload` and a disable/enable cycle each give a fresh window for
// free. There is nothing to migrate, nothing to validate on read, and no
// key in `data.json` to go stale.
//
// NOT BY HIDING THE MODAL’S DOM, which is the cheaper-looking answer and is
// the orphaned-window trap this project already has a name for: a hidden
// table goes on taking index events, holds a focus trap, and answers with a
// stale build after a deploy.
export interface WsSession {
	tab: string | null; cursor: string | null; lens: { sort: WsLensSort | null; chips: WsLensChip[] } | null; panel: boolean | null;
	scroll: number; folder: string | null; treeShown: boolean; zoom: number;
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
		// THE READER (A218). Expanded is a way of LOOKING at the manuscript,
		// so it lasts exactly as long as the other five: close the window and
		// it is still open, restart Obsidian and it is not.
		flow: false,
		// AND HOW THE READER WAS SET (A224). Writer: “remember my last state
		// in the export pane, even in expanded view”. The paged side already
		// had its page and its fit as runtime fields; these are the reader's
		// two, and they live here for the same reason `flow` does.
		flowZoom: 1,
		flowScroll: 0,
		// WHICH FOLDER THE PANE WAS ABOUT (A220). `organizerFolder` already
		// persists this across restarts; what the session adds is the answer
		// to a different question — has this window been opened AT ALL yet.
		// `null` means not since Obsidian started, and that is the one time
		// the active note gets to choose the folder.
		folder: null,
		// THE WINDOW'S OWN TREE (A254-1b): hidden by default now that
		// Obsidian's tree drives the window; shown again for the session
		// only when the writer asks, and cut one release later.
		treeShown: false,
		// CTRL + WHEEL ZOOM OF THE PANE (A259): one number for the three
		// panes, the session's, like the reader's own zoom beside it.
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
	// cannot be undone — a state with no door out of it, which is exactly the
	// fault the mode-change tombstone in `orgLensOn` describes.
	// THE NAME IS A SORT WITHOUT A COLUMN (A312): its heading carries no id
	// and it is not in `cols`, so a lens sorted by name is validated against
	// the one id no table lacks.
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
	const out: Record<string, unknown> = Object.assign({}, settings || {});
	for (const k of WS_SESSION_KEYS) delete out[k];
	return out;
}

// The reader's frame is born from this (`srcdoc`), so its document is in standards
// mode before the first page lands: a root swapped into an about:blank frame stays
// in quirks mode whatever doctype rides with it (measured 2026-09-18).
export const WS_FRAME_SHELL = '<!DOCTYPE html><html><head></head><body></body></html>';
// A LUCIDE GLYPH INTO AN ELEMENT, tried by name and CHECKED: `setIcon` with a
// name this build does not know leaves the element empty rather than throwing
// (how the export icon went missing for a release), so the names are tried in
// order, the one that drew is recorded on the element (`data-icon` — the half a
// jsdom run can see), and the glyph is the fallback when none did.
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
// A GLYPH AND ITS WORD in a button (A427): the glyph in a span before the word,
// the word in a span of its own, so a probe reading the button's text reads
// the word alone (an svg has none) and a stylesheet can size the glyph. The
// glyph's fallback is nothing: a build with no Lucide shows the word.
export function wsGlyphWord(b: HTMLElement, names: string[], word: string): void {
	b.empty();
	const ico = b.createSpan({ cls: 'ws-export-ico-in' });
	// THE EXPORT ARROW POINTS AWAY FROM THE PAGE here as everywhere else (the
	// menu, the tab strip, the bar's token; the writer, 2026-09-20: "always the
	// arrow to point right") — stamped only when `file-output` is the glyph
	// that drew, never on a fallback shape.
	if (wsIconInto(ico, names, '') === 'file-output') ico.addClass('is-mirrored');
	b.createSpan({ cls: 'ws-export-word', text: word });
}
export function wsFormatHasPages(id: string) {
	return id === 'docx' || id === 'pdf' || id === 'html';
}

// HOW BIG A HEADING IS, ONCE, FOR BOTH READERS.
//
// Writer, 2026-09-03, comparing the file with the screen: "the headings
// are in another font size in the preview, in word docx they are ok" and
// "the title is written with another size".
//
// THE .docx COMPUTED THEM AND THE PREVIEW GUESSED THEM. The style table
// sets `w:sz` to `half + 4` for levels 1-2 and `half + 2` below, where
// `half` is the body size in half-points — so at 12pt the file has 14pt
// and 13pt headings. The preview's stylesheet said `1.5em`, `1.15em`,
// `1em`: 18pt, 13.8pt, 12pt. Only the second was ever close.
//
// AND THE TITLE PAGE WAS THE WORST OF IT. `WsTitle` carries no `w:sz` at
// all, so in Word it is the body size in bold — 12pt. The preview drew it
// with the `h1` rule at 1.5em, half again as large as the file.
//
// Returned as a MULTIPLE of the body size, because that is the one form
// both can use: the docx multiplies it back into half-points, the
// stylesheet writes it as `em`.
export function wsHeadSizeEm(o: WsExportOpts | null | undefined, n: number) {
	const half = Math.round(((o && o.pt) || 12) * 2);
	if (!(half > 0)) return 1;
	return (half + (n <= 2 ? 4 : 2)) / half;
}


export function wsTitleWords(o: WsExportRun | null | undefined) {
	const n = (o && o.wordCount) || 0;
	if (o && o.roundWordCount === false) return n.toLocaleString() + ' words';
	return 'about ' + wsRoundWords(n).toLocaleString() + ' words';
}

export function wsAnchorId(title: string, i: number) {
	const base = String(title || 'section').toLowerCase()
		.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
	return 'ws_' + (base || 'section') + '_' + (i + 1);
}

export function wsXml(str: string | number | null | undefined) {
	return String(str == null ? '' : str)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// TOMBSTONE: RICH TEXT (.rtf). A third target, written for what it could
// not go wrong at — plain text, so no container to malform, no relationship
// to dangle and no part to leave out, which are the three ways a .docx
// breaks — and for the submission portal that refuses .docx. It went for
// what it could not DO: a 1987 container that carries no real links, no
// styles anyone reads and nothing a browser will open, in a plugin whose
// other two targets are the one every publisher asks for and the one the
// writer already keeps. HTML replaced it: everything opens it, it prints
// to a PDF from any browser, and it is the same document the preview
// already draws, so it costs one function call rather than four hundred
// lines of escaping.
//
// If it returns: `wsBuildRtf(sections, o)` built the whole file as one
// string, and `wsRtfText` was the load-bearing half — RTF is 7-bit, so a
// backslash, a brace or anything above 127 had to be escaped as \uN? with
// an ASCII stand-in, and an unescaped brace does not make a wrong
// character, it makes a file that will not open at all.

// ── Paper ───────────────────────────────────────────────────────────────────
//
// One table, three consumers: the .docx section properties, the preview's
// page CSS and the .html file that preview is made of. It was a BOOLEAN — `a4`, true or false — which
// is a fine way to ask "which hemisphere" and no way at all to ask "what am
// I making". A submission goes on Letter or A4; a proof of a novel goes on
// the trim size it will be printed at, and 6 × 9 is not a variant of Letter.
//
// TWIPS ARE THE SOURCE, because two of the three consumers want them
// (a twip is a twentieth of a point, 1440 to the inch) and the third can be
// derived: inches for CSS come back out at two decimals, which is exactly
// what the hand-written A4 numbers here used to say.
//
// THE MARGIN TRAVELS WITH THE PAPER. An inch on Letter is the manuscript
// convention; an inch on a 5.5 × 8.5 digest page leaves a 3.5-inch measure
// with a third of the sheet as white space, which does not read as a book —
// it reads as a mistake. Small trims get three quarters of an inch, and the
// mass-market page half an inch.
// a sheet the export can be set on: twips wide and high, and its margin
export interface WsPaper { id: string; label: string; w: number; h: number; mar: number }
export const WS_PAPERS: WsPaper[] = [
	{ id: 'letter',    label: 'US Letter \u2014 8.5 \u00d7 11 in',        w: 12240, h: 15840, mar: 1440 },
	{ id: 'a4',        label: 'A4 \u2014 210 \u00d7 297 mm',              w: 11906, h: 16838, mar: 1440 },
	{ id: 'legal',     label: 'US Legal \u2014 8.5 \u00d7 14 in',         w: 12240, h: 20160, mar: 1440 },
	{ id: 'executive', label: 'Executive \u2014 7.25 \u00d7 10.5 in',     w: 10440, h: 15120, mar: 1080 },
	{ id: 'b5',        label: 'B5 \u2014 176 \u00d7 250 mm',              w:  9979, h: 14173, mar: 1080 },
	{ id: 'a5',        label: 'A5 \u2014 148 \u00d7 210 mm',              w:  8391, h: 11906, mar: 1080 },
	{ id: 'trade',     label: 'Trade paperback \u2014 6 \u00d7 9 in',     w:  8640, h: 12960, mar: 1080 },
	{ id: 'digest',    label: 'Digest \u2014 5.5 \u00d7 8.5 in',          w:  7920, h: 12240, mar: 1080 },
	{ id: 'pocket',    label: 'Mass market \u2014 4.25 \u00d7 6.87 in',   w:  6120, h:  9893, mar:  720 }
];

// The paper an options object means. Falls back through the boolean it
// replaced, so a vault saved before this table opens on the paper it had
// rather than on whatever happens to be first in the list — and an id from
// a later version, or a typo, still gets a page rather than a crash.
// THE SAME TABLE, IN THE UNITS CHROMIUM WANTS. Word measures in twips (1440
// to the inch) and Electron's `printToPDF` takes its page size in MICRONS and
// its margins in INCHES — two different units in one options object, which is
// the kind of thing that is wrong once and then wrong for ever.
//
// Derived from WS_PAPERS rather than written out again. Nine sizes in a second
// list is nine chances for a size to disagree with itself, and the last time
// this plugin kept one list in two places the Blocked flag was grey in the file
// explorer for a release.
export function wsPaperMicrons(paper: WsPaper) {
	const mic = (twips: number) => Math.round(twips * 25400 / 1440);
	const inch = (twips: number) => twips / 1440;
	return {
		width: mic(paper.w), height: mic(paper.h),
		margin: inch(paper.mar)
	};
}

export function wsPaperOf(o: WsExportOpts | null | undefined) {
	const oo = o || {};
	const id = oo.paperId || (oo.a4 ? 'a4' : 'letter');
	for (const p of WS_PAPERS) if (p.id === id) return p;
	return WS_PAPERS[0];
}

// Twips to CSS inches, two decimals: 11906 → "8.27in", which is what the
// A4 rule in the preview said when it was written out by hand.
export function wsTwipIn(tw: number) {
	return (Math.round((tw / 1440) * 100) / 100) + 'in';
}

// ── The fonts on the machine ────────────────────────────────────────────────
//
// TOMBSTONE: SEVEN FACES from a fixed drop-down, on the reasoning that a font
// the READER's Word does not have is substituted silently. Right about the
// reader's machine and wrong about the writer's: a vault with EB Garamond,
// Alegreya or Iowan Old Style installed was offered seven names, none of them
// theirs, with no way to say otherwise. The old seven survive as WS_SAFE_FONTS
// — the floor for a machine that can answer neither question below — and the
// warning the fixed list existed to give is now a line under the box for a
// name nothing here can find.
//
// TWO SOURCES, in this order:
//   queryLocalFonts() — the Local Font Access API, which the Electron under
//   Obsidian's desktop app has. Every installed family, by name, including
//   the ones nobody thought to list. Asynchronous, and it wants a transient
//   activation behind it, which is why it is asked for when the export window
//   OPENS (the click that opened it is the gesture) and again the first time
//   the box takes focus.
//   A CANVAS MEASUREMENT for everywhere else — mobile, an older build, a
//   refused permission. Naming a family that is installed changes the width
//   of a measured string; naming one that is not falls back to the generic
//   and measures identically. It cannot DISCOVER a face nobody named, which
//   is why it is second.
export const WS_SAFE_FONTS = ['Times New Roman', 'Garamond', 'Georgia', 'Cambria',
	'Courier Prime', 'Calibri', 'Arial'];

// What the canvas sieve asks after: not what a writer may CHOOSE — that is
// whatever the machine reports — but what is worth measuring for when the
// machine will not report anything. A name here that is not installed simply
// does not survive the sieve.
export const WS_FONT_CANDIDATES = [
	'Arial', 'Arial Black', 'Arial Narrow', 'Aptos', 'Bahnschrift', 'Book Antiqua',
	'Bookman Old Style', 'Calibri', 'Cambria', 'Candara', 'Century Gothic',
	'Century Schoolbook', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
	'Courier New', 'Franklin Gothic Book', 'Garamond', 'Georgia', 'Impact',
	'Lucida Bright', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
	'Perpetua', 'Rockwell', 'Segoe UI', 'Sitka Text', 'Sylfaen', 'Tahoma',
	'Times New Roman', 'Trebuchet MS', 'Verdana',
	'American Typewriter', 'Andale Mono', 'Avenir', 'Avenir Next', 'Baskerville',
	'Big Caslon', 'Bodoni 72', 'Charter', 'Cochin', 'Copperplate', 'Didot',
	'Futura', 'Geneva', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Hoefler Text',
	'Iowan Old Style', 'Lucida Grande', 'Menlo', 'Monaco', 'New York', 'Optima',
	'Palatino', 'SF Mono', 'SF Pro', 'Seravek', 'Skia', 'Superclarendon', 'Times',
	'Cantarell', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'FreeSans',
	'FreeSerif', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif',
	'Nimbus Roman', 'Nimbus Sans', 'Noto Sans', 'Noto Serif', 'Ubuntu', 'Ubuntu Mono',
	'Alegreya', 'Atkinson Hyperlegible', 'Bitter', 'Cardo', 'Cascadia Code',
	'Charis SIL', 'Crimson Pro', 'Crimson Text', 'Courier Prime', 'EB Garamond',
	'Fira Code', 'Fira Sans', 'Gentium Book Plus', 'Hack', 'IBM Plex Mono',
	'IBM Plex Sans', 'IBM Plex Serif', 'Inconsolata', 'Inter', 'Iosevka',
	'JetBrains Mono', 'Junicode', 'Lato', 'Libre Baskerville', 'Literata', 'Lora',
	'Merriweather', 'Montserrat', 'Open Sans', 'OpenDyslexic', 'PT Mono', 'PT Sans',
	'PT Serif', 'Roboto', 'Roboto Mono', 'Source Code Pro', 'Source Sans Pro',
	'Source Serif Pro', 'Spectral', 'Vollkorn'
];

// Names in, clean unique names out: trimmed of the quotes a CSS stack carries,
// unique without being case-sensitive about it, and without the hidden system
// faces macOS reports (".SF NS Text" and its family) — a writer cannot use one
// and would have to scroll past a dozen to reach a font they can.
export function wsUniqueFonts(names: (string | null | undefined)[] | null | undefined) {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of (names || [])) {
		const name = String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '').trim();
		if (!name || name.charAt(0) === '.' || name.length > 64) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
	}
	return out;
}

// A 2D context to measure in, or null where there is none — jsdom without the
// canvas package is the case that matters, since every probe runs there.
export function wsFontMeasureCtx() {
	try {
		const c = createEl('canvas');
		return (c && c.getContext) ? c.getContext('2d') : null;
	} catch { return null; }
}

// The sieve. A family is installed if naming it changes the measured width of
// a string — checked against all THREE generics, because a face that IS the
// platform's serif measures the same as `serif` and would otherwise be
// reported missing while sitting right there in the menu.
export function wsProbeInstalledFonts(candidates: string[], ctx?: CanvasRenderingContext2D) {
	const c = ctx || wsFontMeasureCtx();
	if (!c || typeof c.measureText !== 'function') return [];
	const BASE = ['monospace', 'serif', 'sans-serif'];
	const TXT  = 'mmmmmmmmmmlliWWWW@0Oo';
	const base: Record<string, number> = {};
	for (const b of BASE) {
		try {
			c.font = '72px ' + b;
			base[b] = c.measureText(TXT).width;
		} catch { return []; }
		// A headless canvas measures everything as zero. It cannot answer this
		// question, and answering it anyway reports every font on the machine
		// as missing — a worse lie than saying nothing.
		if (!base[b]) return [];
	}
	const out = [];
	for (const name of (candidates || [])) {
		const clean = String(name).replace(/["\\]/g, '');
		if (!clean) continue;
		for (const b of BASE) {
			let w = 0;
			try {
				c.font = '72px "' + clean + '", ' + b;
				w = c.measureText(TXT).width;
			} catch { w = 0; }
			if (w && Math.abs(w - base[b]) > 0.5) { out.push(name); break; }
		}
	}
	return out;
}

// The search itself: PLAIN, not fuzzy. A fuzzy scorer earns its keep on
// commands, where a writer half-remembers a name; a font list is a thing you
// read, and fuzzy matching on it puts "Times New Roman" three rows below
// something that merely contains a t, an i and an m. Substring, case-blind,
// with names that START with what was typed first — which is how Obsidian's
// own font setting behaves, and the behaviour a writer typing "gar" expects.
export function wsFontMatches(q: string | null | undefined, all: string[], limit: number) {
	const list  = all || [];
	const lim   = limit || 40;
	const query = String(q == null ? '' : q).trim().toLowerCase();
	if (!query) return list.slice(0, lim);
	const starts = [], holds = [];
	for (const name of list) {
		const hay = String(name).toLowerCase();
		const at  = hay.indexOf(query);
		if (at === 0) starts.push(name);
		else if (at > 0) holds.push(name);
	}
	return starts.concat(holds).slice(0, lim);
}

// ── Line spacing ────────────────────────────────────────────────────────────
//
// Three answers where there was a boolean. Double is the submission
// convention and stays the default; single is closer to a finished book;
// one-and-a-half is what a reader who is not an editor actually prefers, and
// it was the answer the boolean could not give. In twips: 240 is one line at
// 12pt, and Word's `w:line` is a multiple of that.
//
// THE BOOLEAN STILL ANSWERS, for a vault saved before the three: only an
// explicit `doubleSpaced: false` means single, because the key is absent in
// a default document and absent must not mean single.
export function wsLineTwips(o: WsExportOpts | null | undefined) {
	const oo = o || {};
	if (oo.lineSpacing === 'single') return 240;
	if (oo.lineSpacing === 'onehalf') return 360;
	if (oo.lineSpacing === 'double') return 480;
	return oo.doubleSpaced === false ? 240 : 480;
}

// ── The mark between things ─────────────────────────────────────────────────
//
// ONE MARK, for both places it can appear: between two files that run on
// down the same page, and where a `***` line sits inside a file. They were
// briefly two settings (`sceneMark` fell back to this one) on the reasoning
// that a writer might want a different mark inside a chapter from the one
// between chapters — which is true of about nobody, and cost a second text
// box in a column already asking two questions in a row.
export function wsJoinMark(o: WsExportOpts | null | undefined) {
	const oo = o || {};
	return oo.divider == null ? '#' : oo.divider;
}

// TOMBSTONE: CHAPTER NUMBERS lived here — `wsChapterLabel(o, idx, title)`
// with a forty-name lookup table, turning the ORDER into "Chapter One" or
// "Chapter 1" and joining it to the title with an em dash. The clever part
// was the comparison that kept `Ch 01` from printing as "Chapter One — Ch
// 01": a file padded to sort is the commonest name there is, and matching it
// meant stripping punctuation AND leading zeros before comparing. If it ever
// comes back, that is the part to bring with it.
//
// It went because it was a third drop-down in a row that already asks where
// a file starts and what heading it carries, for something a writer settles
// once in the file names.
//
// (removed)

// a run of a paragraph: text and how it is set
export interface WsRun { text: string; bold?: boolean; ital?: boolean; high?: boolean; sup?: boolean; mono?: boolean }
export function wsInlineRuns(text: string, opts?: WsExportOpts | null) {
	const o = opts || {};
	let t = String(text == null ? '' : text);
	// CURLY QUOTES AT COMPILE TIME, never in the writer's files. Which way
	// a quote curls depends on what is beside it: an apostrophe inside a
	// word is always a right single, an opening quote follows a space or a
	// line start, and everything else closes. Done here rather than by the
	// typography feature because that one edits the note and this must not.
	if (o.smartQuotes) {
		t = t.replace(/(\w)'(\w)/g, '$1\u2019$2')          // don't
			.replace(/(^|[\s([{\u201c])'/g, '$1\u2018')    // opening single
			.replace(/'/g, '\u2019')                        // the rest close
			.replace(/(^|[\s([{\u2018])"/g, '$1\u201c')    // opening double
			.replace(/"/g, '\u201d');
	}
	// Order matters: images before links, or the image's own ](…) is eaten.
	t = t.replace(/!\[\[([^\]]*)\]\]/g, (m: string, p1: string) => o.dropImages ? '' : '[Image: ' + p1.split('|')[0] + ']');
	t = t.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (m, alt, src) =>
		o.dropImages ? '' : '[Image: ' + (alt || src) + ']');
	t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');   // wikilink, shown text
	t = t.replace(/\[\[([^\]]*)\]\]/g, '$1');
	t = t.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1');       // md link, label
	t = t.replace(/`([^`]*)`/g, '$1');                     // code text stays
	t = t.replace(/<[^>]+>/g, '');                         // html tags
	// COMMENTS, unless the writer asked for them. `%%like this%%` is a note
	// to self, and the whole point of it is that it does not travel — but
	// "does not travel" is a DEFAULT, not a law: a draft going to a reader
	// with the queries in it ("check this date") is a real thing to want,
	// and the alternative was deleting the marks by hand and putting them
	// back. Kept WITH their marks: a comment printed as plain prose is
	// indistinguishable from prose, which is the one way this could do harm.
	if (!o.keepComments) t = t.replace(/%%[\s\S]*?%%/g, '');

	// FOOTNOTE MARKERS, when the notes themselves are not travelling. The
	// definitions are dropped where they are collected; leaving `[^3]`
	// standing in the prose would point at a note that is no longer in the
	// document, which is worse than either having them or not.
	if (o.footnotes === false) t = t.replace(/\[\^[^\]]*\]/g, '');

	// Split into runs on **, * and ==, keeping the text between. Underscores
	// are deliberately NOT treated as emphasis: snake_case and file_names are
	// far more common in a vault than _italics_, and turning half a filename
	// italic is worse than missing an emphasis.
	//
	// `==` IS NEW, and fixes a leak rather than adding a flourish: highlight
	// marks were matched by nothing here, so they travelled into the
	// manuscript as literal equals signs — `==like this==` printed exactly
	// like that in the .docx. They are consumed either way now; whether the
	// highlight itself survives (yellow in Word, <mark> on the page) is the
	// Highlights switch, and off is still the default because a highlight is
	// usually a note to self about the prose rather than part of it.
	const runs: WsRun[] = [];
	const re = /(\*\*\*|\*\*|\*|==)/g;
	let bold = false, ital = false, high = false, last = 0, m;
	const push = (text: string) => { if (text) runs.push({ text, bold, ital, high: high && !!o.highlights }); };
	while ((m = re.exec(t)) !== null) {
		if (m.index > last) push(t.slice(last, m.index));
		if (m[1] === '***') { bold = !bold; ital = !ital; }
		else if (m[1] === '**') bold = !bold;
		else if (m[1] === '==') high = !high;
		else ital = !ital;
		last = re.lastIndex;
	}
	if (last < t.length) push(t.slice(last));
	return runs.filter(r => r.text.length);
}

// One paragraph of OOXML. `style` names a style defined in styles.xml.
export function wsPara(runs: WsRun[], style: string, opts?: { noIndent?: boolean; align?: string; pageBreakBefore?: boolean }) {
	const o = opts || {};
	const pr = [];
	if (style) pr.push('<w:pStyle w:val="' + style + '"/>');
	if (o.pageBreakBefore) pr.push('<w:pageBreakBefore/>');
	if (o.align) pr.push('<w:jc w:val="' + o.align + '"/>');
	if (o.noIndent) pr.push('<w:ind w:firstLine="0"/>');
	const body = (runs.length ? runs : [{ text: '' }]).map((r: WsRun) => {
		const rpr = [];
		if (r.bold) rpr.push('<w:b/>');
		if (r.ital) rpr.push('<w:i/>');
		if (r.sup)  rpr.push('<w:vertAlign w:val="superscript"/>');
		if (r.mono) rpr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
		// Word's own highlight, not a shaded background: it is what the
		// yellow pen in Word's toolbar writes, so a reader can clear it
		// with the same button rather than hunting through styles.
		if (r.high) rpr.push('<w:highlight w:val="yellow"/>');
		return '<w:r>' + (rpr.length ? '<w:rPr>' + rpr.join('') + '</w:rPr>' : '')
			// xml:space, or Word eats the spaces at either end of a run and
			// "**bold** word" comes out as "boldword".
			+ '<w:t xml:space="preserve">' + wsXml(r.text) + '</w:t></w:r>';
	}).join('');
	return '<w:p>' + (pr.length ? '<w:pPr>' + pr.join('') + '</w:pPr>' : '') + body + '</w:p>';
}

// A table, plainly. Verbose but entirely static — no relationships, no binary
// parts, nothing that can fall out of sync with another file in the package,
// which is why this is cheap and images are not.
export function wsTable(rows: string[][]) {
	const width = Math.max.apply(null, rows.map((r) => r.length));
	const grid = '<w:tblGrid>' + new Array(width).fill('<w:gridCol w:w="' + Math.floor(9360 / width) + '"/>').join('') + '</w:tblGrid>';
	const body = rows.map((cells, ri) => '<w:tr>' + new Array(width).fill(0).map((_, ci) => {
		const runs = wsInlineRuns(cells[ci] == null ? '' : cells[ci]);
		if (ri === 0) runs.forEach(r => { r.bold = true; });
		return '<w:tc><w:tcPr><w:tcW w:w="' + Math.floor(9360 / width) + '" w:type="dxa"/></w:tcPr>'
			+ wsPara(runs, 'WsTableCell') + '</w:tc>';
	}).join('') + '</w:tr>').join('');
	return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>'
		+ '<w:tblW w:w="0" w:type="auto"/>'
		+ '<w:tblBorders>'
		+ ['top','left','bottom','right','insideH','insideV']
			.map(k => '<w:' + k + ' w:val="single" w:sz="4" w:color="auto"/>').join('')
		+ '</w:tblBorders></w:tblPr>' + grid + body + '</w:tbl>';
}

// Block walk: markdown → an array of OOXML blocks. Footnotes are COLLECTED
// rather than embedded — a real Word footnote needs its own part, a
// content-type entry, a relationship and matching ids, and an id mismatch is
// the kind of fault Word reports as "this file is corrupt" with no clue. What
// a manuscript actually wants is endnotes, so the markers stay superscript in
// the text and the definitions are gathered into a section at the end.
export function wsBlocksFromMarkdown(md: string | null | undefined, opts: WsExportOpts | null | undefined) {
	const o = opts || {};
	// LINE ENDINGS FIRST, once, for the whole document. A vault synced from
	// Windows has CRLF in it, and splitting on \n alone leaves a carriage
	// return at the end of every line — invisible in the editor, harmless
	// in prose (the lines are trimmed), and NOT harmless inside a code
	// fence, which is kept verbatim: the CR travelled into the .docx and
	// Word drew it. Found by feeding the converter a Windows file rather
	// than by reading it.
	const lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
	const out = [];
	const notes = [];
	let i = 0;
	let firstPara = true;

	// FRONTMATTER, which does not travel unless it is asked for. It is the
	// note's plumbing — status, tags, the day it was started — and a
	// manuscript opening with a YAML block is nobody's manuscript. But a
	// writer proofing what a note actually CONTAINS wants it, so it is a
	// switch, off by default, and what it prints is the block verbatim in
	// monospace: it is data, not prose, and setting it as prose would be a
	// lie about what it is.
	if (lines.length && /^---\s*$/.test(lines[0])) {
		let j = 1;
		while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
		if (o.keepFrontmatter) {
			for (let k = 0; k <= Math.min(j, lines.length - 1); k++) {
				out.push(wsPara([{ text: lines[k], mono: true }], 'WsCode', { noIndent: true }));
			}
		}
		i = j + 1;
	}
	for (; i < lines.length; i++) {
		const line = lines[i];
		const t = line.trim();
		// A BLANK LINE IS NOT A PARAGRAPH, and it must not clear this flag.
		// It did, and that is why every paragraph came out indented: a
		// heading sets `firstPara`, markdown puts a blank line between the
		// heading and the prose, and that blank line reset it before the
		// paragraph could be drawn. What ends “this is the first paragraph
		// of a scene” is a paragraph being WRITTEN, nothing else.
		//
		// The rule matters more than it looks: a manuscript indents every
		// paragraph EXCEPT the first of a chapter or a scene, and getting it
		// wrong is one of the few things an editor sees before reading a word.
		if (!t) continue;

		// A footnote definition: collected, not printed here.
		const fn = t.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
		// Collected, not printed here — or dropped outright when the switch
		// says the notes are not coming. Either way the definition line
		// never appears in the prose where it was written.
		if (fn) { if (o.footnotes !== false) notes.push({ id: fn[1], text: fn[2] }); continue; }

		// A COMMENT BLOCK. wsInlineRuns handles `%%inline%%` because it can
		// see both marks on one line; a block comment opens on its own line
		// and closes lines later, so the stripper never matched it and the
		// note LEAKED into the manuscript one line at a time. It is dropped
		// here, or kept as a quote — set apart from the prose, since a
		// comment that reads as prose is the one way this option could put
		// a note to self into a submission unnoticed.
		if (/^%%/.test(t)) {
			const buf = [];
			const oneLine = /^%%.*%%\s*$/.test(t);
			if (oneLine) buf.push(t.replace(/^%%/, '').replace(/%%\s*$/, ''));
			else {
				buf.push(t.replace(/^%%/, ''));
				for (i++; i < lines.length; i++) {
					const ct = lines[i];
					if (/%%\s*$/.test(ct.trim())) { buf.push(ct.replace(/%%\s*$/, '')); break; }
					buf.push(ct);
				}
			}
			if (o.keepComments) {
				for (const b of buf) {
					if (b.trim()) out.push(wsPara(wsInlineRuns(b.trim(), o), 'WsQuote', { noIndent: true }));
				}
				firstPara = true;
			}
			continue;
		}

		// Fenced code: kept as monospace lines. Novels rarely have any, and
		// dropping a block a writer deliberately included is worse than
		// carrying it plainly.
		const fence = t.match(/^(`{3,}|~{3,})/);
		if (fence) {
			const ch = fence[1].charAt(0);
			const buf = [];
			for (i++; i < lines.length; i++) {
				const ft = lines[i].trim();
				if (ft.charAt(0) === ch && new RegExp('^' + ch + '{3,}').test(ft)) break;
				buf.push(lines[i]);
			}
			for (const b of buf) out.push(wsPara([{ text: b, mono: true }], 'WsCode', { noIndent: true }));
			continue;
		}

		// A table: header, separator, body.
		if (/^\|/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
			// A PIPE CAN BE IN A CELL, written `\\|` — which is how anyone
			// writes a table containing a pipe, and splitting on every
			// pipe turned one two-column row into three ragged ones with
			// a stray backslash. Split on UNESCAPED pipes only, then
			// unescape what is left.
			const cellsOf = (row: string) => {
				const t2 = row.trim().replace(/^\||\|$/g, '');
				const out2 = [];
				let cur = '';
				for (let k = 0; k < t2.length; k++) {
					const ch = t2.charAt(k);
					if (ch === '\\' && t2.charAt(k + 1) === '|') { cur += '|'; k++; continue; }
					if (ch === '|') { out2.push(cur.trim()); cur = ''; continue; }
					cur += ch;
				}
				out2.push(cur.trim());
				return out2;
			};
			const rows = [cellsOf(t)];
			i += 2;
			for (; i < lines.length && /^\|/.test(lines[i].trim()); i++) rows.push(cellsOf(lines[i]));
			i--;
			out.push(wsTable(rows));
			firstPara = true;
			continue;
		}

		// A scene divider. This is the one piece of markup a manuscript
		// really depends on, so it is centred and spaced rather than drawn
		// as a rule: agents expect a # on its own line between scenes.
		if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
			out.push(wsPara([{ text: wsJoinMark(o) }], 'WsDivider',
				{ align: 'center', noIndent: true }));
			firstPara = true;
			continue;
		}

		const head = t.match(/^(#{1,6})\s+(.*)$/);
		if (head) {
			// Dropped ENTIRELY when headings are off, rather than demoted to
			// a paragraph: a writer whose chapter titles are the file names
			// has "# Chapter One" in the note as a working label, and
			// leaving it in the manuscript as prose is worse than either
			// keeping it as a heading or losing it.
			if (o.keepHeadings === false) { firstPara = true; continue; }
			out.push(wsPara(wsInlineRuns(head[2], o), 'WsHeading' + head[1].length,
				{ noIndent: true }));
			firstPara = true;
			continue;
		}

		const quote = t.match(/^>\s?(.*)$/);
		if (quote) {
			out.push(wsPara(wsInlineRuns(quote[1], o), 'WsQuote', { noIndent: true }));
			continue;
		}

		// Lists: rendered as indented paragraphs carrying their own marker.
		// Real Word numbering needs numbering.xml and a definition per list,
		// which is a lot of machinery for something a manuscript rarely has
		// and an editor will not miss.
		const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
		if (li) {
			const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, '    ').length / 2));
			const mark = /^\d/.test(li[2]) ? li[2] + ' ' : '\u2022 ';
			out.push(wsPara(wsInlineRuns(mark + li[3], o), 'WsList' + depth, { noIndent: true }));
			continue;
		}

		// Ordinary prose. Manuscript format indents every paragraph EXCEPT
		// the first of a scene — that is the convention, and getting it
		// wrong is the tell that a manuscript was machine-made.
		const runs = [];
		for (const r of wsInlineRuns(t, o)) {
			// Footnote markers survive as superscript numbers.
			const parts = String(r.text).split(/\[\^([^\]]+)\]/);
			for (let k = 0; k < parts.length; k++) {
				if (!parts[k]) continue;
				if (k % 2) runs.push({ text: parts[k], sup: true });
				// EVERY flag the run arrived with, not two of them. This
				// rebuilt the run to hang a superscript off it and copied
				// `bold` and `ital` by hand — so a highlight, added later
				// and one line further up, was silently dropped on any
				// paragraph that went through here, which is all of them.
				// A run's properties are its own; splitting it must not
				// edit them.
				else runs.push(Object.assign({}, r, { text: parts[k] }));
			}
		}
		out.push(wsPara(runs, 'WsBody', { noIndent: firstPara === false ? false : true }));
		firstPara = false;
	}
	return { blocks: out, notes };
}

// The styles part. Manuscript standard (Shunn) is the default because it is
// what a novelist submitting work actually needs and the thing every other
// tool makes you assemble by hand: 12pt serif, double spaced, half-inch first
// line indent, ragged right.
export function wsStylesXml(opt: WsExportOpts | null | undefined) {
	const o = opt || {};
	const font = o.font || 'Times New Roman';
	const half = Math.round((o.pt || 12) * 2);            // half-points
	const line = wsLineTwips(o);                          // 240 = single
	const ind  = o.indent === false ? 0 : 720;            // twips, half inch
	// A PARAGRAPH NEEDS ONE BOUNDARY: an indent, or air. Turn the indent
	// off with double spacing on — the pairing a manuscript uses — and
	// there is nothing between one paragraph and the next at all, and the
	// result reads as a broken file rather than as block-set prose. That
	// is why the indent switch was removed once; the switch was never the
	// problem, the missing second boundary was. Body prose only: a list or
	// a table cell already has its own separation.
	const gap  = o.indent === false ? 120 : 0;
	// ── WIDOWS AND ORPHANS ──────────────────────────────────────────────
	//
	// An ORPHAN is the first line of a paragraph left alone at the foot of
	// a page; a WIDOW is the last line carried over alone to the top of the
	// next. Both read as a fault in the file rather than as typesetting —
	// a page that opens with four words and half an inch of white is the
	// first thing an agent sees, and it is the sort of thing that gets a
	// manuscript put down. The fix is to make two lines travel together:
	// if only one would fit, the whole paragraph goes over.
	//
	// SAID OUT LOUD, because Word's default lives in the APPLICATION and
	// not in the file. A document that does not carry `w:widowControl` is
	// trusting whatever opens it — usually on in Word, off in a few
	// converters, and unknowable in whatever a publisher runs. The preview
	// and the .html target have said `orphans: 2; widows: 2` since they
	// were written; this is the one target that was silent, and it is the
	// one an agent actually opens.
	//
	// NOT keepLines, which forces a whole paragraph onto one page: that is
	// right for a heading and disastrous for prose, where a long paragraph
	// would leave half a page blank rather than break at all.
	//
	// FIRST IN THE pPr, because OOXML's paragraph properties are a
	// SEQUENCE, not a bag: widowControl belongs before spacing and
	// indentation, and elements out of order are one of the faults Word
	// reports as a corrupt document rather than as a style it ignored.
	const widow = '<w:widowControl/>';
	const st = (id: string, name: string, extra: string, rpr?: string) =>
		'<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/>'
		+ '<w:pPr>' + extra + '</w:pPr>'
		+ '<w:rPr>' + (rpr || '') + '</w:rPr></w:style>';
	const spacing = '<w:spacing w:line="' + line + '" w:lineRule="auto" w:after="0"/>'
		+ (o.justify ? '<w:jc w:val="both"/>' : '');
	const bodySpacing = widow
		+ '<w:spacing w:line="' + line + '" w:lineRule="auto" w:after="' + gap + '"/>'
		+ (o.justify ? '<w:jc w:val="both"/>' : '');
	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ '<w:docDefaults><w:rPrDefault><w:rPr>'
		+ '<w:rFonts w:ascii="' + wsXml(font) + '" w:hAnsi="' + wsXml(font) + '"/>'
		+ '<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>'
		+ '</w:rPr></w:rPrDefault>'
		// In the DEFAULTS as well as on the body style, so that every
		// paragraph this writer emits — quotes, lists, the notes at the
		// back — inherits it without each style having to remember.
		+ '<w:pPrDefault><w:pPr>' + widow + spacing + '</w:pPr></w:pPrDefault></w:docDefaults>'
		+ st('WsBody', 'Body', bodySpacing + '<w:ind w:firstLine="' + ind + '"/>')
		+ st('WsDivider', 'Scene divider', spacing + '<w:jc w:val="center"/>')
		+ st('WsQuote', 'Quote', spacing + '<w:ind w:left="720" w:right="720"/>', '<w:i/>')
		+ st('WsCode', 'Code', '<w:spacing w:line="240" w:lineRule="auto" w:after="0"/><w:ind w:left="360"/>',
			'<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>')
		+ st('WsTableCell', 'Table cell', '<w:spacing w:line="240" w:lineRule="auto" w:after="0"/>')
		+ st('WsList0', 'List', spacing + '<w:ind w:left="360"/>')
		+ st('WsList1', 'List 2', spacing + '<w:ind w:left="720"/>')
		+ st('WsList2', 'List 3', spacing + '<w:ind w:left="1080"/>')
		+ st('WsList3', 'List 4', spacing + '<w:ind w:left="1440"/>')
		// THE STYLE IS NOT BOLD; THE TITLE RUN IS. Writer, 2026-09-03: "in docx
		// the title is bold, and the autor and word counts too (unbold those)".
		// All three paragraphs wear WsTitle, so a <w:b/> in the STYLE bolded the
		// lot - and the title run sets bold: true as well, which is why removing
		// it here leaves the title bold and takes the other two back to plain.
		// That is what the preview has always drawn: an h1 and two ordinary
		// paragraphs.
		+ st('WsTitle', 'Title', spacing + '<w:jc w:val="center"/>')
		// OUTLINE LEVELS, or Word's own table of contents cannot see these
		// headings at all. A TOC field collects by outline level, not by
		// style name — a custom style without one is invisible to it, and
		// the field comes back "no table of contents entries found",
		// which reads as a broken document rather than a missing setting.
		+ [1,2,3,4,5,6].map(n => st('WsHeading' + n, 'heading ' + n,
			spacing + '<w:keepNext/><w:outlineLvl w:val="' + (n - 1) + '"/>'
			+ '<w:jc w:val="' + (n <= 2 ? 'center' : 'left') + '"/>'
			+ '<w:spacing w:before="240" w:line="' + line + '" w:lineRule="auto"/>',
			'<w:b/><w:sz w:val="' + Math.round(wsHeadSizeEm(o, n) * half) + '"/>')).join('')
		+ '</w:styles>';
}

// The running header: Surname / Title / page, which is what an agent's
// guidelines ask for. It is its own part with its own relationship — the one
// place this writer has to keep two files agreeing, so the id is a constant
// rather than a generated value.
export function wsHeaderXml(text: string, withPage: boolean) {
	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ '<w:p><w:pPr><w:jc w:val="right"/><w:ind w:firstLine="0"/></w:pPr>'
		+ '<w:r><w:t xml:space="preserve">' + wsXml(text) + ' </w:t></w:r>'
		// The page number is a FIELD, not a number: Word recomputes it per
		// page, and writing a literal would put "1" on every page of the
		// manuscript.
		+ (withPage === false ? ''
			: '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>')
		+ '</w:p></w:hdr>';
}

// Assemble the whole package. `sections` is [{ title, markdown }].
export function wsBuildDocx(sections: WsExportSection[], opt: WsExportRun | null | undefined) {
	const o = opt || {};
	const body = [];
	const allNotes: { id: string; text: string; }[] = [];
	// A FOLDER HEADING HANDS ITS PAGE TO THE FILE BELOW IT. Writer,
	// 2026-09-03, with Word and the preview side by side: "in the docx it
	// puts the folder name on a separate page not as a heading (the preview
	// does it good how it supposed to work)".
	//
	// 486cs gave the folder heading a page break so it would stop trailing
	// the previous chapter — and the FILE heading after it breaks too, so
	// the folder name got a sheet of its own with nothing under it. Two
	// breaks where the writer wanted one.
	//
	// The preview never had this: it holds the heading in `pendingFolder`
	// and flushes it onto the next page WITH the content. This is the same
	// idea in the only form Word has — the folder opens the page, and the
	// file that follows is told the page is already open.
	let folderOpenedPage = false;

	if (o.titlePage) {
		const t = o.title || 'Untitled';
		// NO DROP. Writer, 2026-09-03, side by side: Word sat a line lower
		// than the preview, because the preview centres in the sheet and this
		// counted lines down to the block. A count cannot centre it — 27 text
		// lines less a 4-line block leaves 23, an odd number — so the title
		// page becomes its own SECTION and Word centres it, which is the same
		// answer the screen reached at 486ck by different means.
		body.push(wsPara([{ text: t, bold: true }], 'WsTitle', { noIndent: true, align: 'center' }));
		if (o.author) body.push(wsPara([{ text: 'by ' + o.author }], 'WsTitle', { noIndent: true, align: 'center' }));
		if (o.wordCount != null && o.wordCountOnTitle !== false) {
			// NO BLANK LINE BEFORE THE COUNT. Writer, 2026-09-03, comparing the
			// two: "the docx has the title page different than the preview it
			// adds a enter below the author name and then writes the number of
			// words". The preview's markup is three elements with no spacer
			// between them, so the file grew a line the screen never had.
			//
			// It was there to pad the drop when the block was placed by counting
			// lines — `wsTitleDropLines` counts the word count as TWO, the blank
			// and the text. The section centres the block now (486cr), so the
			// padding has nothing left to pad and only made the two disagree.
			body.push(wsPara([{ text: wsTitleWords(o) }],
				'WsTitle', { noIndent: true, align: 'center' }));
		}
		// THE SECTION BREAK THAT CENTRES IT. In OOXML a section's properties
		// live in the LAST paragraph of that section, so this empty paragraph
		// IS the break — it carries `w:vAlign center`, which is Word's own
		// vertical centring for a page's content and the only mechanism it
		// has. No header reference: a manuscript's running head starts on the
		// first page of TEXT, which is what `w:titlePg` used to arrange and
		// what a separate section arranges more plainly.
		//
		// Page numbering is untouched: sections continue the count unless
		// told otherwise, so the first text page is still 2 and the running
		// header still reads it.
		{
			const tp = wsPaperOf(o);
			body.push('<w:p><w:pPr><w:sectPr>'
				+ '<w:pgSz w:w="' + tp.w + '" w:h="' + tp.h + '"/>'
				+ '<w:pgMar w:top="' + tp.mar + '" w:right="' + tp.mar + '"'
				+ ' w:bottom="' + tp.mar + '" w:left="' + tp.mar + '"'
				+ ' w:header="720" w:footer="720" w:gutter="0"/>'
				+ '<w:vAlign w:val="center"/>'
				+ '</w:sectPr></w:pPr></w:p>');
		}
		// The first real section starts a page, not a paragraph.
		if (sections.length) sections = sections.slice();
	}

	// THE CONTENTS, with links. Internal hyperlinks need no relationship —
	// `w:anchor` points at a bookmark inside the same document — which is
	// why this costs a few lines rather than another part in the package.
	// Deliberately not Word's own TOC field: that renders as "right-click
	// to update" until the reader does, and a manuscript arriving with an
	// instruction where its contents should be is worse than no contents.
	// WORD'S OWN TABLE OF CONTENTS, not a list of links. The list was
	// honest and could not do the one thing a contents page is for on
	// paper: PAGE NUMBERS. A field knows them, and recomputes them when
	// the manuscript changes rather than lying after the first edit.
	//
	// The old objection — that a field renders as "right-click to update"
	// until a reader refreshes it — is answered by settings.xml below,
	// which asks Word to update fields on open. The placeholder text
	// inside the field is what shows if a reader declines, so it says
	// something useful rather than nothing.
	if (o.toc && sections.length > 1) {
		body.push(wsPara([{ text: 'Contents', bold: true }], 'WsHeading2',
			{ noIndent: true, pageBreakBefore: !!o.titlePage }));
		body.push('<w:p><w:pPr><w:pStyle w:val="WsBody"/><w:ind w:firstLine="0"/></w:pPr>'
			+ '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
			// \o collects a RANGE of outline levels, \h makes the entries
			// links, \z hides the page numbers in web layout, \u uses the
			// outline levels declared above.
			//
			// THE RANGE IS MEASURED, NOT FIXED AT "1-2" (2026-09-02). Two was
			// right when this writer produced exactly two levels; folder
			// headings produce as many as the folders nest, and a Part three
			// deep simply vanished from the contents. It is NOT widened to a
			// flat "1-6" either: the notes' own headings are demoted BELOW the
			// structural ones, so a fixed 6 would pull every heading inside
			// every chapter into the table. The deepest structural level is
			// exactly the line between the two, and with folder headings off it
			// computes to 2 — the old value, unchanged.
			+ '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-'
			+ wsDeepestLevel(o, sections) + '" \\h \\z \\u </w:instrText></w:r>'
			+ '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
			+ '<w:r><w:t xml:space="preserve">Right-click here and choose '
			+ 'Update Field to build the contents.</w:t></w:r>'
			+ '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
	}

	sections.forEach((sec, idx) => {
		// ── A FOLDER IS A HEADING AND NOTHING ELSE ───────────────────
		//
		// No divider, no page of its own, no body. It does NOT answer to
		// `sectionTitles`, which is about whether a FILE contributes its
		// own name — a different question with its own control.
		//
		// `WsHeading1`..`WsHeading6` are all declared in the style table,
		// so Word gets a real outline level and the TOC field collects it.
		if (sec.folder) {
			const lv = Math.min(6, sec.depth || 1);
			if (o.toc) {
				body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="'
					+ wsAnchorId(sec.title, idx) + '"/>');
			}
			// AND IT OPENS A PAGE, like every other section. Writer, 2026-09-03:
			// "the chapter name(folder heading) is not on a new page". This
			// branch pushed its paragraph and RETURNED above the page-break
			// logic below, so a folder heading was the one thing in the file
			// that never started one — while the preview has broken there all
			// along.
			//
			// THE PREVIEW'S RULE IS `(i > 0 || o.titlePage || o.toc) &&
			// o.pageBreaks !== false`, and this is it MINUS the title-page term.
			// A `.page` in the preview is an element, so 'break' there just means
			// start another one; in Word the title page is now its own SECTION
			// (486cr) and a section break already ends the page. Adding a page
			// break on top of it would insert a blank sheet — the same output in
			// one medium and one page of nothing in the other.
			const fbrk = (idx > 0 || o.toc) && o.pageBreaks !== false;
			folderOpenedPage = fbrk;
			body.push(wsPara([{ text: sec.title, bold: true }], 'WsHeading' + lv,
				{ noIndent: true, pageBreakBefore: fbrk }));
			if (o.toc) body.push('<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
			return;
		}
		const first = idx === 0 && !o.titlePage;
		// Read once and cleared here, so it cannot leak past the section
		// immediately below the folder — a second file must break normally.
		const justAfterFolder = folderOpenedPage;
		folderOpenedPage = false;
		// A DIVIDER BETWEEN FILES, for scenes that run on rather than each
		// starting a page. Deliberately independent of the page break: a
		// manuscript that breaks pages between chapters still wants a
		// divider between the scenes INSIDE one, and a writer who has each
		// scene in its own file wants exactly this and no page breaks at
		// all. Both on is legal and simply means both.
		if (o.starBetween && idx > 0) {
			body.push(wsPara([{ text: wsJoinMark(o) }], 'WsDivider',
				{ align: 'center', noIndent: true }));
		}
		if (o.sectionTitles && sec.title) {
			// The bookmark wraps the heading, so a link lands on the title
			// rather than a line above it. Word requires the id twice —
			// start carries the name, end only the number — and a mismatch
			// there is one of the faults it reports as a corrupt file.
			if (o.toc) {
				const id = wsAnchorId(sec.title, idx);
				body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="' + id + '"/>');
			}
			// THE HEADING DOES NOT DECIDE THE PAGE. `pageBreakBefore: !first`
			// broke a page before every heading whatever the join answer
			// said — so "Each file: follows a divider" put a divider at the
			// top of a fresh page, and "runs straight on" ran straight on to
			// page two. The bug hid because the two commonest settings are
			// page breaks ON (where it is right) and headings OFF (where it
			// never runs), and it needed both of the other answers at once
			// to show.
			// ONE LEVEL BELOW ITS FOLDER when folder headings are on, and
			// `WsHeading2` when they are off — which is what every export
			// has done since this option existed.
			body.push(wsPara([{ text: sec.title, bold: true }],
				'WsHeading' + wsFileHeadLevel(o, sec),
				{ noIndent: true,
					pageBreakBefore: o.pageBreaks !== false && !first && !justAfterFolder }));
			if (o.toc) body.push('<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
		} else if (o.toc) {
			// No heading to hang it on, so the bookmark sits on an empty
			// paragraph at the section's start — a link that lands in the
			// right place beats a contents entry that does nothing.
			const id = wsAnchorId(sec.title, idx);
			body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="' + id + '"/>'
				+ '<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
			if (o.pageBreaks && !first) body.push(wsPara([], 'WsBody', { pageBreakBefore: true }));
		} else if (o.pageBreaks && !first) {
			body.push(wsPara([], 'WsBody', { pageBreakBefore: true }));
		} else if (o.titlePage && idx === 0) {
			body.push(wsPara([], 'WsBody', { pageBreakBefore: true }));
		}
		// The note's own headings move down under the folder's — see
		// `wsDemoteHeadings`. The other two targets do the same.
		const built = wsBlocksFromMarkdown(
			o.folderHeadings ? wsDemoteHeadings(sec.markdown, sec.depth || 0)
				: sec.markdown, o);
		for (const b of built.blocks) body.push(b);
		for (const n of built.notes) allNotes.push(n);
	});

	if (allNotes.length) {
		body.push(wsPara([{ text: 'Notes', bold: true }], 'WsHeading2',
			{ noIndent: true, pageBreakBefore: true }));
		for (const n of allNotes) {
			body.push(wsPara(([{ text: n.id + '. ', bold: true }] as WsRun[]).concat(wsInlineRuns(n.text, o)),
				'WsBody', { noIndent: true }));
		}
	}

	// THE TITLE PAGE CARRIES NO HEADER. A manuscript's running head starts
	// on the first page of TEXT — "Surname / Title / 1" printed across the
	// title page is one of the tells that a document was generated rather
	// than set. `w:titlePg` says "this section's first page is different",
	// and the first-page header it then looks for is deliberately empty.
	// THE TITLE PAGE IS ITS OWN SECTION NOW and carries no header of its
	// own, so `w:titlePg` has nothing left to arrange — it says "this
	// section's first page differs", and this section's first page is the
	// first page of TEXT, which SHOULD wear the running head. Kept only for
	// the case it still describes: a running header with no title page.
	const wantFirst = false;   // see above: nothing left for it to arrange
	const paper = wsPaperOf(o);
	const wantToc = !!(o.toc && sections.length > 1);
	const headerRef = o.runningHeader
		? '<w:headerReference w:type="default" r:id="rId3"/>'
			+ (wantFirst ? '<w:headerReference w:type="first" r:id="rId4"/><w:titlePg/>' : '')
		: '';
	const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
		+ ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
		+ '<w:body>' + body.join('')
		// The paper, its margins and the manuscript default — Letter with
		// an inch all round — all come out of WS_PAPERS now, because a
		// book's trim size is a page and not a variant of Letter.
		+ '<w:sectPr>' + headerRef
		+ '<w:pgSz w:w="' + paper.w + '" w:h="' + paper.h + '"/>'
		+ '<w:pgMar w:top="' + paper.mar + '" w:right="' + paper.mar + '"'
		+ ' w:bottom="' + paper.mar + '" w:left="' + paper.mar + '"'
		+ ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
		+ '</w:body></w:document>';

	const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
		+ '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
		+ '<Default Extension="xml" ContentType="application/xml"/>'
		+ '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
		+ '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
		+ (o.runningHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '')
		+ (wantFirst ? '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '')
		+ (wantToc ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : '')
		+ '</Types>';

	const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		+ '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
		+ '</Relationships>';

	const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		+ '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
		+ (o.runningHeader ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '')
		+ (wantFirst ? '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>' : '')
		+ (wantToc ? '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' : '')
		+ '</Relationships>';

	// The part that turns "right-click to update" into a contents page a
	// reader never has to think about. Only shipped when there IS a field
	// to update: a document with nothing dirty in it should not ask.
	const settingsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ '<w:updateFields w:val="true"/></w:settings>';

	const entries = [
		{ name: '[Content_Types].xml', bytes: wsUtf8(types) },
		{ name: '_rels/.rels',         bytes: wsUtf8(rootRels) },
		{ name: 'word/document.xml',   bytes: wsUtf8(doc) },
		{ name: 'word/_rels/document.xml.rels', bytes: wsUtf8(docRels) },
		{ name: 'word/styles.xml',     bytes: wsUtf8(wsStylesXml(o)) }
	];
	if (wantToc) entries.push({ name: 'word/settings.xml', bytes: wsUtf8(settingsXml) });
	if (o.runningHeader) {
		entries.push({ name: 'word/header1.xml',
			bytes: wsUtf8(wsHeaderXml(o.runningHeader, o.pageNumbers !== false)) });
	}
	if (wantFirst) {
		// An EMPTY header, not a missing one: Word needs the part the
		// reference names, and a reference pointing at nothing is the kind
		// of fault it reports as a corrupt file rather than as a missing
		// header.
		entries.push({ name: 'word/header2.xml', bytes: wsUtf8(wsHeaderXml('', false)) });
	}
	return wsZip(entries);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────────────────────────────────────────

// Powerline separator shapes, chosen per boundary by the character used to
// divide the row. The divider you type IS the shape:
//
//   >   arrow        )   rounded
//   |   straight     /   angle, cutting up to the right
//                    \   angle, cutting down to the right
//
// A backslash immediately followed by one of these is an escape, so \| is a
// literal pipe and a lone \ between spaces is still a divider.
// ── READING SPEED FOR {readtime} ────────────────────────────────────────
//
// Fixed, not a setting: it is not a number anyone has a calibrated opinion
// about, and offering a box for it invites a writer to tune a figure they
// have no way to measure.
//
// 238, ON THE WRITER'S WORD (2026-09-02: "do 238wpm"). It was 200 — the
// round number that gets copied between blogs. Brysbaert's 2019
// meta-analysis puts adult silent reading of English prose at 238 wpm,
// and that is the figure they asked for.
//
// IT WAS ALSO ASKED FOR BY ACCIDENT ONCE. A second constant,
// `WS_READ_WPM = 238`, was added an hour before it was deleted — see the
// tombstone further down. What was wrong there was not the number: it was
// having TWO of them, so the plugin would have answered "how long is this
// to read" differently on two surfaces a writer can see at once. This is
// the one constant, changed once, and its three customers follow.
export const READ_WPM = 238;

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

// ── Themes ───────────────────────────────────────────────────────────────────
//
// A theme is a NAMED FILL of the palette keys and nothing else. Applying one
// writes the same twenty-two settings a writer would set by hand in the
// pickers, and nothing more; there is no theme layer at
// paint time, no second code path, and nothing here that the colour pickers
// cannot also produce. That is deliberate: a shelf of palettes is worth
// having, a parallel styling system is not.
//
// BOTH HALVES ARE MANDATORY. The palette comment above says why in one line —
// "a palette that merely survives the switch is not the same as one designed
// for it" — and it is the whole reason this is a table of pairs rather than a
// list of colour schemes. Obsidian's own light/dark state picks the half, so
// a writer who switches at dusk gets a bar that was designed for dusk.
//
// The BACKGROUNDS are the constraint, not the accents. A segment's ink is
// derived from its background (powerlineInk) unless the row says otherwise,
// so every c-slot has to be far enough from one of the two inks for that
// derivation to have a readable answer — which rules out the mid-tones most
// upstream palettes use for their accent colours. The values below are
// therefore the upstream palette's SURFACE family where one exists, and the
// upstream accent darkened (dark half) or tinted (light half) where it does
// not. theme_probe asserts the result rather than trusting this paragraph.
//
// Slot meanings, kept identical across every theme so switching does not
// rearrange a bar someone built:
//   c1 accent · c2 quiet mid · c3 quiet deep · c4 green · c5 warm ·
//   c6 violet · c7 alert
//   t1 ink · t2 reverse ink · t3 muted ink · t4 accent ink
//
// Palette VALUES are used as facts, with the source named per theme. No
// upstream code is copied.
// TOMBSTONE (1.2.7). BAR_THEME_GROUPS collapsed the four Modus variants
// into one shelf slot with a folder in the menu and variant chips on the
// card. It was removed within the same release by vault feedback, and the
// deletion is worth more than the feature was:
//
//   the group card could be REMOVED AND NEVER RESTORED — the hidden row
//   looks a hidden id up in the theme table to draw its chip, and a group
//   id is not in the table, so the chip could not render and the family
//   was gone for good;
//   it could not be dragged, because the drag handlers key on a theme id;
//   and the variant chips made one card twice the height of every other.
//
// All three came from the same root: a pseudo-entry that is not a theme,
// travelling through machinery that is about themes. The lesson kept here
// is that a collection type added to a list must satisfy EVERY contract
// the list's members satisfy — order, drag, hide, restore — and the shelf
// already had four. Four variants, four cards, is the honest shape.
//
// The hidden row now also restores ids it cannot name, so nothing a
// writer removes is ever unreachable again, whatever put it there.

// One half of a scheme: the four surfaces, the seven accents and the four inks, by
// slot name — and readable by any slot name, which is how the picker walks them.
export interface WsThemeHalf { b1: string; b2: string; b3: string; b4: string; c1: string; c2: string; c3: string; c4: string; c5: string; c6: string; c7: string; t1: string; t2: string; t3: string; t4: string; [slot: string]: string }
export interface WsBarTheme { id: string; name: string; names?: { dark: string; light: string }; note: string; dark: WsThemeHalf; light: WsThemeHalf }
export const BAR_THEMES: WsBarTheme[] = [
	{
		// EVERY VALUE BELOW IS UPSTREAM'S, from Protesilaos Stavrou's own
		// published palette (protesilaos.com/emacs/modus-themes-colors,
		// released CC0). The mapping is the interesting part, because the
		// Modus palettes name the exact roles this table needs:
		//
		//   b1-b4  bg-main, bg-dim, bg-inactive, border
		//   t1/t3  fg-main, fg-dim
		//   t4     accent-0
		//   sel    bg-region     bar  bg-mode-line-active
		//   c1     bg-completion — the surface a chosen candidate wears,
		//          which is what our selected-file slot IS
		//   c4/c7  bg-added / bg-removed, NOT green/red by name: that pair
		//          is where each variant states its own semantics, and on
		//          the colour-vision variants it is deliberately not
		//          red-and-green. Deuteranopia adds in blue and removes in
		//          yellow; tritanopia adds in cyan and removes in red. Our
		//          slots follow the MEANING rather than the hue, so those
		//          variants stay legible to the eyes they were built for.
		//   c5/c6  bg-yellow-subtle, bg-magenta-subtle
		//
		// Guessed approximations sat here until the palette was fetched.
		id: 'modus', name: 'Modus',
		names: { dark: 'Modus Vivendi', light: 'Modus Operandi' },
		note: 'Protesilaos Stavrou \u2014 his own published palette',
		dark:  { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
		         c1: '#2f447f', c2: '#1e1e1e', c3: '#000000', c4: '#00422a',
		         c5: '#4a4000', c6: '#552f5f', c7: '#620f2a',
		         t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#00bcff',
		         sel: '#5a5a5a', bar: '#505050', cur: '#ffffff' },
		light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
		         c1: '#c0deff', c2: '#f2f2f2', c3: '#ffffff', c4: '#b3fabf',
		         c5: '#fff576', c6: '#ffddff', c7: '#ffcfbf',
		         t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#0031a9',
		         sel: '#bdbdbd', bar: '#c8c8c8', cur: '#000000' }
	},

	{
		// EVERY VALUE FROM vim's own quiet.vim, both backgrounds. The papers
		// were approximations before and both were wrong in the direction
		// that matters most: quiet's dark half is PURE BLACK (#000000) and
		// its light half is a definite GREY (#d7d7d7), not the near-white
		// this table had. A monochrome scheme is nothing but its greys, so
		// getting the paper approximately right is getting it wrong.
		//
		// Its accents are the three colours quiet allows itself, and each
		// is a REVERSE pairing, so the rendered surface is the guifg:
		// Visual is orange (#ffaf00), Search blue (#00afff), Todo mint
		// (#00ffaf). They live in the accent slots; the ramp stays grey,
		// which is why the Vim modes still come out as shades of grey.
		id: 'quiet', name: 'Quiet',
		note: 'vim\u2019s own quiet \u2014 monochrome by design, three colours allowed',
		dark:  { b1: '#000000', b2: '#1c1c1c', b3: '#303030', b4: '#585858',
		         c1: '#a8a8a8', c2: '#1c1c1c', c3: '#000000', c4: '#303030',
		         c5: '#3a3a3a', c6: '#444444', c7: '#4e4e4e',
		         t1: '#dadada', t2: '#000000', t3: '#a8a8a8', t4: '#dadada',
		         sel: '#ffaf00', bar: '#dadada' },
		light: { b1: '#d7d7d7', b2: '#cccccc', b3: '#e4e4e4', b4: '#a8a8a8',
		         // Seven steps of quiet's own grey ladder, each distinct:
		         // on a monochrome scheme the ladder IS the palette, so two
		         // slots landing on one value costs a whole accent.
		         c1: '#9e9e9e', c2: '#cccccc', c3: '#d7d7d7', c4: '#c8c8c8',
		         c5: '#bcbcbc', c6: '#b4b4b4', c7: '#a8a8a8',
		         t1: '#000000', t2: '#d7d7d7', t3: '#626262', t4: '#000000',
		         sel: '#ffaf00', bar: '#000000' }
	},

	{
		id: 'habamax', name: 'Habamax',
		note: 'Vim\u2019s habamax \u2014 muted, warm-neutral',
		dark:  { b1: '#1c1c1c', b2: '#262626',
		         b3: '#303030', b4: '#3a3a3a',
		         c1: '#004f71', c2: '#303030', c3: '#1c1c1c', c4: '#005454',
		         c5: '#634500', c6: '#484867', c7: '#870000',
		         t1: '#bcbcbc', t2: '#1c1c1c', t3: '#808080', t4: '#87afaf', sel: '#454545', bar: '#9e9e9e' },
		light: { b1: '#ffffff', b2: '#f0f0f0',
		         b3: '#e4e4e4', b4: '#d0d0d0',
		         c1: '#cfe4f0', c2: '#e4e4e4', c3: '#f2f2f2', c4: '#d0ecdc',
		         c5: '#f0e2c0', c6: '#ddd8f0', c7: '#f4d0d0',
		         t1: '#262626', t2: '#ffffff', t3: '#626262', t4: '#005f87', sel: '#c6c6c6' }
	},
	{
		id: 'nord', name: 'Nord',
		note: 'Arctic Ice Studio \u2014 polar night and snow storm',
		dark:  { b1: '#2e3440', b2: '#3b4252',
		         b3: '#434c5e', b4: '#4c566a',
		         c1: '#4c6a91', c2: '#3b4252', c3: '#2e3440', c4: '#3f6650',
		         c5: '#7a5f34', c6: '#6b5470', c7: '#8f4148',
		         t1: '#eceff4', t2: '#2e3440', t3: '#9aa4b6', t4: '#88c0d0', sel: '#434c5e', bar: '#4c566a' },
		light: { b1: '#eceff4', b2: '#e5e9f0',
		         b3: '#d8dee9', b4: '#c8d0dc',
		         c1: '#c5d4e8', c2: '#d8dee9', c3: '#eceff4', c4: '#cfe0c8',
		         c5: '#f0e2bd', c6: '#e2d3e5', c7: '#f0cdd0',
		         t1: '#2e3440', t2: '#eceff4', t3: '#5c6779', t4: '#5e81ac', sel: '#d8dee9', bar: '#d8dee9' }
	},
	{
		// The light half's mode line stays DERIVED: Alucard's open-source
		// release ships no editor port yet (the request is an open issue
		// on dracula/visual-studio-code), so there is no upstream value
		// to take.
		id: 'dracula', name: 'Dracula',
		note: 'Zeno Rocha\u2019s Dracula, with Alucard for the light half',
		dark:  { b1: '#282a36', b2: '#343746',
		         b3: '#44475a', b4: '#565a72',
		         c1: '#4a3f7a', c2: '#44475a', c3: '#282a36', c4: '#2f6b46',
		         c5: '#7a6a2a', c6: '#6b3f6b', c7: '#8b3a3a',
		         t1: '#f8f8f2', t2: '#282a36', t3: '#a0a3b8', t4: '#bd93f9', sel: '#44475a', bar: '#44475a' },
		light: { b1: '#f8f8f2', b2: '#eeeef0',
		         b3: '#e0e0e6', b4: '#cfcfd8',
		         c1: '#d9d0f5', c2: '#e8e8e2', c3: '#f8f8f2', c4: '#cdeed8',
		         c5: '#f2eec4', c6: '#f5d5e8', c7: '#f7cfcf',
		         t1: '#1f1f1f', t2: '#f8f8f2', t3: '#6c6c6c', t4: '#644ac9', sel: '#d8d0e8' }
	},
	{
		id: 'gruvbox', name: 'Gruvbox',
		note: 'Pavel Pertsev \u2014 retro groove, hard contrast',
		dark:  { b1: '#282828', b2: '#32302f',
		         b3: '#3c3836', b4: '#504945',
		         c1: '#376769', c2: '#504945', c3: '#282828', c4: '#65610c',
		         c5: '#825700', c6: '#8f3f71', c7: '#9d0006',
		         t1: '#ebdbb2', t2: '#282828', t3: '#a89984', t4: '#83a598', sel: '#504945', bar: '#504945' },
		light: { b1: '#fbf1c7', b2: '#f2e5bc',
		         b3: '#ebdbb2', b4: '#d5c4a1',
		         c1: '#cfe0dd', c2: '#ebdbb2', c3: '#fbf1c7', c4: '#d5e6c0',
		         c5: '#f2e0b0', c6: '#ecd5e4', c7: '#f5d2c8',
		         t1: '#3c3836', t2: '#fbf1c7', t3: '#7c6f64', t4: '#076678', sel: '#d5c4a1', bar: '#d5c4a1' }
	},
	{
		id: 'solarized', name: 'Solarized',
		note: 'Ethan Schoonover \u2014 the light and dark halves are his own pairing',
		dark:  { b1: '#002b36', b2: '#073642',
		         b3: '#0a4653', b4: '#125666',
		         c1: '#196ba3', c2: '#073642', c3: '#002b36', c4: '#5a6a00',
		         c5: '#7a5c00', c6: '#94275e', c7: '#99231f',
		         t1: '#eee8d5', t2: '#002b36', t3: '#93a1a1', t4: '#2aa198', sel: '#073642', bar: '#839496' },
		light: { b1: '#fdf6e3', b2: '#f5eed6',
		         b3: '#eee8d5', b4: '#ded8c5',
		         c1: '#cfe2f0', c2: '#eee8d5', c3: '#fdf6e3', c4: '#dfe8c0',
		         c5: '#f2e4bb', c6: '#f5d3e2', c7: '#f7d2cf',
		         t1: '#073642', t2: '#fdf6e3', t3: '#657b83', t4: '#268bd2', sel: '#eee8d5', bar: '#073642' }
	},
	{
		id: 'catppuccin', name: 'Catppuccin',
		note: 'the Catppuccin community \u2014 Mocha dark, Latte light',
		dark:  { b1: '#1e1e2e', b2: '#181825',
		         b3: '#313244', b4: '#45475a',
		         c1: '#3e5a8f', c2: '#313244', c3: '#1e1e2e', c4: '#39654d',
		         c5: '#795433', c6: '#6b4a8f', c7: '#8f3f55',
		         t1: '#cdd6f4', t2: '#1e1e2e', t3: '#9399b2', t4: '#89b4fa', sel: '#585b70', bar: '#181825' },
		light: { b1: '#eff1f5', b2: '#e6e9ef',
		         b3: '#dce0e8', b4: '#ccd0da',
		         c1: '#cfdcf7', c2: '#dce0e8', c3: '#eff1f5', c4: '#d3ecd0',
		         c5: '#f5ddc8', c6: '#e6d5f7', c7: '#f7d3dc',
		         t1: '#4c4f69', t2: '#eff1f5', t3: '#6c6f85', t4: '#1e66f5', sel: '#ccd0da', bar: '#e6e9ef' }
	},
	{
		id: 'tokyonight', name: 'Tokyo Night / Day',
		names: { dark: 'Tokyo Night', light: 'Tokyo Day' },
		note: 'enkia \u2014 Night when your mode is dark, Day when it is light',
		dark:  { b1: '#1a1b26', b2: '#16161e',
		         b3: '#24283b', b4: '#2f334d',
		         c1: '#385295', c2: '#292e42', c3: '#1a1b26', c4: '#3e5d37',
		         c5: '#6a5128', c6: '#5a4380', c7: '#8a3a4a',
		         t1: '#c0caf5', t2: '#1a1b26', t3: '#787c99', t4: '#7aa2f7', sel: '#33467c', bar: '#16161e' },
		light: { b1: '#e1e2e7', b2: '#d5d6db',
		         b3: '#c8c9ce', b4: '#b6b7bd',
		         c1: '#ccd6f5', c2: '#d8dae5', c3: '#e9e9ec', c4: '#d3e8c8',
		         c5: '#f2e2c0', c6: '#e0d5f5', c7: '#f5d0d8',
		         t1: '#33374c', t2: '#e9e9ec', t3: '#5a6699', t4: '#2e7de9', sel: '#b7c1e3', bar: '#cfd5e3' }
	},
	{
		id: 'rosepine', name: 'Ros\u00e9 Pine',
		note: 'the Ros\u00e9 Pine team \u2014 Moon dark, Dawn light',
		dark:  { b1: '#232136', b2: '#2a273f',
		         b3: '#393552', b4: '#44415a',
		         c1: '#2d6a85', c2: '#2a273f', c3: '#232136', c4: '#3a5f54',
		         c5: '#795c32', c6: '#5f4580', c7: '#8a4155',
		         t1: '#e0def4', t2: '#232136', t3: '#908caa', t4: '#9ccfd8', sel: '#403d52', bar: '#393552' },
		light: { b1: '#faf4ed', b2: '#fffaf3',
		         b3: '#f2e9e1', b4: '#e4dcd4',
		         c1: '#cfe2ea', c2: '#f2e9e1', c3: '#faf4ed', c4: '#d5e8dd',
		         c5: '#f5e2c2', c6: '#e5d8f0', c7: '#f7d5dd',
		         t1: '#575279', t2: '#faf4ed', t3: '#797593', t4: '#286983', sel: '#dfdad9', bar: '#f2e9e1' }
	},
	{
		id: 'modus-tinted', name: 'Modus Tinted',
		names: { dark: 'Modus Vivendi Tinted', light: 'Modus Operandi Tinted' },
		note: 'the tinted pair \u2014 warm paper by day, deep indigo night',
		dark:  { b1: '#0d0e1c', b2: '#1d2235', b3: '#2b3045', b4: '#61647a',
		         c1: '#483d8a', c2: '#1d2235', c3: '#0d0e1c', c4: '#00422a',
		         c5: '#4a4000', c6: '#552f5f', c7: '#620f2a',
		         t1: '#ffffff', t2: '#0d0e1c', t3: '#989898', t4: '#b6a0ff',
		         sel: '#555a66', bar: '#484d67', cur: '#ff66ff' },
		// c1 IS UPSTREAM'S bg-completion AGAIN (A342, writer 2026-09-13 with
		// the explorer's active note circled: "the modus operandi tinted has
		// that selection grey too dark - put the original color back (we
		// changed it some time ago)"). The dark grey #595959 — fg-dim, the
		// scheme's t3 — had been asked for twice and stood as the family's
		// one deliberate deviation; a dark grey carries white ink at 4.5:1,
		// so the selected-file rule took it for the nav surface and every
		// selected note went charcoal on paper. Reversed on the newer word:
		// Stavrou's pink, as the rest of the family reads its bg-completion.
		light: { b1: '#fbf7f0', b2: '#efe9dd', b3: '#dfd5cf', b4: '#9f9690',
		         c1: '#f0c1cf', c2: '#efe9dd', c3: '#fbf7f0', c4: '#b3fabf',
		         c5: '#fff576', c6: '#ffddff', c7: '#ffcfbf',
		         t1: '#000000', t2: '#fbf7f0', t3: '#595959', t4: '#a0132f',
		         sel: '#c2bcb5', bar: '#cab9b2', cur: '#d00000' }
	},

	{
		// c4/c7 are bg-added/bg-removed, which upstream puts on the
		// blue\u2013yellow axis here. Copying green and red into those slots
		// would have undone the entire point of the variant.
		id: 'modus-deuteranopia', name: 'Modus Deuteranopia',
		names: { dark: 'Modus Vivendi Deuteranopia', light: 'Modus Operandi Deuteranopia' },
		note: 'red\u2013green\u2013safe: it adds in blue and removes in yellow',
		dark:  { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
		         c1: '#2f447f', c2: '#1e1e1e', c3: '#000000', c4: '#003066',
		         c5: '#4a4000', c6: '#552f5f', c7: '#3d3d00',
		         t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#79a8ff',
		         sel: '#5a5a5a', bar: '#2a2a6a', cur: '#efef00' },
		light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
		         c1: '#c0deff', c2: '#f2f2f2', c3: '#ffffff', c4: '#d5d7ff',
		         c5: '#fff576', c6: '#ffddff', c7: '#f4f099',
		         t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#3548cf',
		         sel: '#bdbdbd', bar: '#d0d6ff', cur: '#0000ff' }
	},

	{
		// c4/c7 are bg-added/bg-removed on the red\u2013cyan axis, upstream's
		// own answer for this deficiency.
		id: 'modus-tritanopia', name: 'Modus Tritanopia',
		names: { dark: 'Modus Vivendi Tritanopia', light: 'Modus Operandi Tritanopia' },
		note: 'blue\u2013yellow\u2013safe: it adds in cyan and removes in red',
		dark:  { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
		         c1: '#004253', c2: '#1e1e1e', c3: '#000000', c4: '#004254',
		         c5: '#4a4000', c6: '#552f5f', c7: '#4f1119',
		         t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#00d3d0',
		         sel: '#5a5a5a', bar: '#003c52', cur: '#ff5f5f' },
		light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
		         c1: '#afdfef', c2: '#f2f2f2', c3: '#ffffff', c4: '#b5e7ff',
		         c5: '#fff576', c6: '#ffddff', c7: '#ffd8d5',
		         t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#005e8b',
		         sel: '#bdbdbd', bar: '#afe0f2', cur: '#d00000' }
	},

	{
		// The dark half is Monokai; the light half is OUR adaptation of it
		// onto paper \u2014 upstream never shipped one, and a survived dark
		// palette on white is worse than a designed light one.
		//
		// The mode line: the TextMate original names none \u2014 a TextMate
		// scheme colours text, not chrome \u2014 so the value is the canonical
		// Emacs port's (oneKelvinSmith/monokai-emacs, mode-line background
		// = monokai-highlight #49483E), which is Monokai's own selection
		// grey and so still Wimer's colour, worn where Emacs wears it.
		// The light half stays derived: no upstream light Monokai exists
		// to name one.
		id: 'monokai', name: 'Monokai',
		note: 'Wimer Hazenberg \u2014 the classic; light half is our adaptation',
		dark:  { b1: '#272822', b2: '#3e3d32', b3: '#49483e', b4: '#75715e',
		         c1: '#66d9ef', c2: '#3e3d32', c3: '#272822', c4: '#375a2e',
		         c5: '#7a5a1e', c6: '#6f5c9c', c7: '#8f2f3f',
		         t1: '#f8f8f2', t2: '#272822', t3: '#a59f85', t4: '#a6e22e', sel: '#49483e', bar: '#49483e' },
		light: { b1: '#fafafa', b2: '#f0f0ee', b3: '#e6e6e2', b4: '#d0d0c8',
		         c1: '#cdeef5', c2: '#f0f0ee', c3: '#fafafa', c4: '#dcedc8',
		         c5: '#fde3b3', c6: '#e6dcf5', c7: '#f8ccd4',
		         t1: '#272822', t2: '#fafafa', t3: '#75715e', t4: '#f92672', sel: '#d8d8d0' }
	},
	{
		// One Light names no StatusLine of its own — onedark.vim ships the
		// dark half only — so its bar is OURS, one step off the paper,
		// like every scheme that names none.
		id: 'onedark', name: 'One Dark / Light',
		names: { dark: 'One Dark', light: 'One Light' },
		note: 'Atom\u2019s pair \u2014 One Dark when dark, One Light when light',
		dark:  { b1: '#282c34', b2: '#2c313a', b3: '#333842', b4: '#3e4451',
		         c1: '#61afef', c2: '#2c313a', c3: '#282c34', c4: '#3e6845',
		         c5: '#7a5c26', c6: '#7e5f9e', c7: '#8f3a44',
		         t1: '#abb2bf', t2: '#282c34', t3: '#7f848e', t4: '#61afef', sel: '#3e4451', bar: '#2c323c' },
		light: { b1: '#fafafa', b2: '#f0f0f1', b3: '#e5e5e6', b4: '#d3d3d4',
		         c1: '#cfe5fb', c2: '#f0f0f1', c3: '#fafafa', c4: '#d6e9cc',
		         c5: '#f5e3bd', c6: '#e6d9f2', c7: '#f6d0d4',
		         t1: '#383a42', t2: '#fafafa', t3: '#696c77', t4: '#4078f2', sel: '#d0d4da', bar: '#e5e5e6' }
	},
	{
		id: 'nightfox', name: 'Nightfox / Dayfox',
		names: { dark: 'Nightfox', light: 'Dayfox' },
		note: 'EdenEast \u2014 Nightfox when dark, Dayfox when light',
		dark:  { b1: '#192330', b2: '#212e3f', b3: '#29394f', b4: '#39506d',
		         c1: '#2e4372', c2: '#212e3f', c3: '#192330', c4: '#2b4a3c',
		         c5: '#574a27', c6: '#4a3a63', c7: '#5c2f39',
		         t1: '#cdcecf', t2: '#192330', t3: '#738091', t4: '#86abdc', sel: '#2b3b51', bar: '#131a24' },
		light: { b1: '#f6f2ee', b2: '#efe9e3', b3: '#e7e0d9', b4: '#d6cfc7',
		         c1: '#ccd7ee', c2: '#efe9e3', c3: '#f6f2ee', c4: '#cfe0ce',
		         c5: '#ecdcb8', c6: '#ded2ec', c7: '#f0cdd2',
		         t1: '#352c24', t2: '#f6f2ee', t3: '#766f68', t4: '#2848a9', sel: '#e2d9cd', bar: '#e4dcd4' }
	},
	{
		// Wave for the dark half, Lotus for the light \u2014 the upstream ink
		// pairing on Lotus paper sits at 6.25:1, past AA and short of AAA;
		// named in the probe with its measurement, like Ros\u00e9 Pine Dawn.
		id: 'kanagawa', name: 'Kanagawa',
		names: { dark: 'Kanagawa Wave', light: 'Kanagawa Lotus' },
		note: 'rebelot \u2014 Wave by night, Lotus by day',
		dark:  { b1: '#1f1f28', b2: '#2a2a37', b3: '#363646', b4: '#54546d',
		         c1: '#2d4f67', c2: '#2a2a37', c3: '#1f1f28', c4: '#33473d',
		         c5: '#5a4a2d', c6: '#453a62', c7: '#692f36',
		         t1: '#dcd7ba', t2: '#1f1f28', t3: '#727169', t4: '#7e9cd8', sel: '#2d4f67', bar: '#16161d' },
		light: { b1: '#f2ecbc', b2: '#eae3ae', b3: '#e0d7a0', b4: '#b8b092',
		         c1: '#cbd8e6', c2: '#eae3ae', c3: '#f2ecbc', c4: '#d2dcae',
		         c5: '#ecd39a', c6: '#d8cadf', c7: '#ecc2c5',
		         t1: '#545464', t2: '#f2ecbc', t3: '#716e61', t4: '#4d699b', sel: '#c9d5de', bar: '#dcd5ac' }
	},
	{
		// GITHUB NAMES A MODE LINE AND IT IS THE PAGE. Primer's own
		// github-vscode-theme sets statusBar.background to color.bg.canvas
		// — the editor surface itself — and a maintainer confirms the
		// theme deliberately has no distinct status colour. A strip equal
		// to the page is the one thing this table's invariant refuses
		// (“the strip is not the page”), and the popular Neovim port's
		// blue strip is that port's computed invention, not Primer's. So
		// GitHub derives, like every scheme that names none.
		id: 'github', name: 'GitHub',
		note: 'Primer \u2014 the dark and light you read pull requests in',
		dark:  { b1: '#0d1117', b2: '#161b22', b3: '#21262d', b4: '#30363d',
		         c1: '#1c3b63', c2: '#161b22', c3: '#0d1117', c4: '#1f4529',
		         c5: '#544000', c6: '#3c2d69', c7: '#67232b',
		         t1: '#e6edf3', t2: '#0d1117', t3: '#8b949e', t4: '#4493f8', sel: '#264f78' },
		light: { b1: '#ffffff', b2: '#f6f8fa', b3: '#eaeef2', b4: '#d0d7de',
		         c1: '#cfe4fb', c2: '#f6f8fa', c3: '#ffffff', c4: '#c9edd0',
		         c5: '#f3e29c', c6: '#e3d3f5', c7: '#f8cfcf',
		         t1: '#1f2328', t2: '#ffffff', t3: '#656d76', t4: '#0969da', sel: '#b6d9f8' }
	},
	{
		// The light half needed two ADAPTATIONS to be usable as an interface:
		// upstream's muted grey (#939f91) and green accent (#8da101) both sit
		// under 3:1 on the paper, so the muted ink is darkened to #7a877e and
		// the accent to #6c8a00 \u2014 the same hue, deep enough to read. The
		// body-ink pairing itself (#5c6a72 on #fdf6e3, 5.16:1) is upstream's
		// own and is carried as a named exception rather than re-inked.
		id: 'everforest', name: 'Everforest',
		note: 'sainnhe \u2014 the forest floor, by night and by day',
		dark:  { b1: '#2d353b', b2: '#343f44', b3: '#3d484d', b4: '#475258',
		         c1: '#384b55', c2: '#343f44', c3: '#2d353b', c4: '#425047',
		         c5: '#514d44', c6: '#4a3f55', c7: '#563a3f',
		         t1: '#d3c6aa', t2: '#2d353b', t3: '#859289', t4: '#a7c080', sel: '#543a48', bar: '#343f44' },
		light: { b1: '#fdf6e3', b2: '#f4f0d9', b3: '#efebd4', b4: '#d8d3ba',
		         c1: '#d6e5dc', c2: '#f4f0d9', c3: '#fdf6e3', c4: '#d1e0c2',
		         c5: '#eee0b2', c6: '#e2d8e4', c7: '#f2d5d0',
		         t1: '#5c6a72', t2: '#fdf6e3', t3: '#7a877e', t4: '#6c8a00', sel: '#f0f1d2', bar: '#f2efdf' }
	},
	{
		// Vim ships TWO stock blue schemes and this pair is BOTH of them,
		// verbatim: blue.vim (white on #000087, yellow Statements) by day,
		// darkblue.vim (#c0c0c0 on #000040) by night. The day face is a
		// DARK palette in the light slot, which every other scheme on this
		// shelf would be wrong to do — and this one is right to, because
		// blue.vim's whole identity is that navy.
		//
		// It cost a real bug to make it work rather than merely declare
		// it. Everything Word-Smith colours for itself picks a dark or a
		// light variant, and every one of them was choosing by the APP's
		// mode: in light mode they all took their light variants — dark
		// inks — and painted them onto navy. See isDarkSurface, which is
		// the fix and the general rule: the plugin's own colours follow
		// the PAPER, the pair's half still follows the app.
		//
		// theme_probe carries this as the one NAMED exception to "a light
		// half is light", beside the measured contrast exceptions. An
		// exception with a reason and a test is a decision; an exception
		// without one is a bug nobody noticed.
		id: 'vimblue', name: 'Vim Blue / Darkblue',
		names: { dark: 'Vim Darkblue', light: 'Vim Blue' },
		note: ':colorscheme blue by day, darkblue by night \u2014 both as Vim ships them',
		dark:  { b1: '#000040', b2: '#000058', b3: '#10106e', b4: '#30309a',
		         c1: '#2a2a9e', c2: '#000058', c3: '#000040', c4: '#0f6b45',
		         c5: '#6b6b10', c6: '#4b2d9e', c7: '#8b1a3a',
		         t1: '#c0c0c0', t2: '#000040', t3: '#8080c0', t4: '#ffff60',
		         // The same cyan as the day face: the reference shows both
		         // windows wearing it, and the darker cyan this started as
		         // measured 4.48 against this half's ink — under the floor
		         // by two hundredths, which is still under it.
		         sel: '#2e3f9e', bar: '#00afaf' },
		light: { b1: '#000087', b2: '#1c1c99', b3: '#2e2eab', b4: '#5555c4',
		         // c1 is blue.vim's CursorLine — the vivid blue band the
		         // reference shows under the cursor — so the selected file
		         // and the selection wear the colour the scheme uses to say
		         // "here".
		         c1: '#2222dd', c2: '#1c1c99', c3: '#000087', c4: '#0f6b52',
		         c5: '#6b6b00', c6: '#4b2d9e', c7: '#8b1a3a',
		         // t3 is Comment's pale blue; t4 is Statement's yellow, which
		         // is also what the caret takes.
		         t1: '#ffffff', t2: '#000087', t3: '#87afd7', t4: '#ffff00',
		         sel: '#2222dd', bar: '#00afaf' }
	},
	{
		// Steph Ango's — the author of Minimal, and designed light-first
		// with a dark twin rather than the other way round, which is why
		// both halves are upstream's own.
		//
		// The mode line: the spec names no status role and the Obsidian
		// theme sets none, but the OFFICIAL Neovim port — kepano/
		// flexoki-neovim, the one the Flexoki README links — does:
		// `StatusLine = { fg = tx, bg = ui-3 }`. ui-3 is flexoki-800
		// (#403E3C) on the dark half and flexoki-200 (#CECDC3) on the
		// light — spec colours, worn where Neovim wears them.
		id: 'flexoki', name: 'Flexoki',
		note: 'Steph Ango \u2014 an inky palette for prose, both halves his',
		dark:  { b1: '#100f0f', b2: '#1c1b1a', b3: '#282726', b4: '#343331',
		         c1: '#21344f', c2: '#1c1b1a', c3: '#100f0f', c4: '#2b3a1e',
		         c5: '#4a3a12', c6: '#362c52', c7: '#4d2220',
		         t1: '#cecdc3', t2: '#100f0f', t3: '#878580', t4: '#4385be', sel: '#282726', bar: '#403e3c' },
		light: { b1: '#fffcf0', b2: '#f2f0e5', b3: '#e6e4d9', b4: '#dad8ce',
		         c1: '#d3e3f7', c2: '#f2f0e5', c3: '#fffcf0', c4: '#dbe6c4',
		         c5: '#f2e2b0', c6: '#e2d6f0', c7: '#f6d2cd',
		         t1: '#100f0f', t2: '#fffcf0', t3: '#6f6e69', t4: '#205ea6', sel: '#e6e4d9', bar: '#cecdc3' }
	},
	{
		// Jan Warcho\u0142's Solarized successor: the same idea \u2014 one pair,
		// tuned together \u2014 with the contrast complaint answered.
		//
		// The mode line is UPSTREAM'S OWN vim port (editors/vim in
		// jan-warchol/selenized): `StatusLine gui=reverse` with both
		// halves NONE, so the RENDERED strip is Normal inverted \u2014 the
		// body ink as the surface, the paper as the text. Read as
		// rendered, exactly as the other reverse schemes in this table
		// are: dark wears fg_0 #adbcbc, light wears fg_0 #53676d, and
		// each carries an ink well past the floor (6.07 and 5.37).
		id: 'selenized', name: 'Selenized',
		note: 'Jan Warcho\u0142 \u2014 Solarized rebuilt, both halves tuned together',
		dark:  { b1: '#103c48', b2: '#184956', b3: '#1c5460', b4: '#2d5b69',
		         c1: '#17455a', c2: '#184956', c3: '#103c48', c4: '#1c4a35',
		         c5: '#4a4520', c6: '#3f3560', c7: '#5c2330',
		         // fg_1, not fg_0: Selenized ships both, and the brighter one
		         // is what clears AAA on its own paper and carries an ink on
		         // its own selection. fg_0 becomes the muted ink, which is
		         // what it reads as anyway.
		         t1: '#cad8d9', t2: '#103c48', t3: '#adbcbc', t4: '#4695f7', sel: '#184956', bar: '#adbcbc' },
		light: { b1: '#fbf3db', b2: '#ece3cc', b3: '#e0d7bf', b4: '#c3bba4',
		         c1: '#cddef2', c2: '#ece3cc', c3: '#fbf3db', c4: '#d7e6c4',
		         c5: '#f0e0a8', c6: '#ecd4e6', c7: '#f8cfc9',
		         t1: '#3a4d53', t2: '#fbf3db', t3: '#53676d', t4: '#0072d4', sel: '#e0d7bf', bar: '#53676d' }
	},
	{
		// ICEBERG NAMES A MODE LINE AND DOES NOT GET ONE. Its StatusLine is
		// `reverse`, so the rendered strip is #757ca3 on the light half — a
		// mid slate that carries neither of this scheme's inks at 4.5:1
		// (3.35 at best, which is what upstream itself puts there). A
		// terminal statusline can live at that contrast; a strip we promise
		// is legible cannot. It derives instead, and the dark half keeps
		// its published colour, which does clear the floor.
		id: 'iceberg', name: 'Iceberg',
		note: 'cocopon \u2014 a bluish, low-glare pair from Vim',
		dark:  { b1: '#161821', b2: '#1e2132', b3: '#272c42', b4: '#3d425b',
		         c1: '#2a3a5c', c2: '#1e2132', c3: '#161821', c4: '#2c4030',
		         c5: '#4a3a24', c6: '#3a3352', c7: '#4d2833',
		         t1: '#c6c8d1', t2: '#161821', t3: '#6b7089', t4: '#84a0c6', sel: '#272c42', bar: '#818596' },
		light: { b1: '#e8e9ec', b2: '#dcdfe7', b3: '#cad0de', b4: '#a7adba',
		         c1: '#c3d0e8', c2: '#dcdfe7', c3: '#e8e9ec', c4: '#cfe0c0',
		         c5: '#f0dcc0', c6: '#ded4ee', c7: '#f2ccd6',
		         t1: '#33374c', t2: '#e8e9ec', t3: '#7b8296', t4: '#2d539e', sel: '#cad0de' }
	},
	{
		id: 'papercolor', name: 'PaperColor',
		note: 'NLKNguyen \u2014 Material-ish, and light-first by design',
		dark:  { b1: '#1c1c1c', b2: '#262626', b3: '#303030', b4: '#444444',
		         c1: '#1f3a4a', c2: '#262626', c3: '#1c1c1c', c4: '#2b3a1a',
		         c5: '#4a4400', c6: '#3a2a4a', c7: '#4a1010',
		         t1: '#d0d0d0', t2: '#1c1c1c', t3: '#8a8a8a', t4: '#5fafd7', sel: '#303030', bar: '#5f8787' },
		light: { b1: '#eeeeee', b2: '#e4e4e4', b3: '#d0d0d0', b4: '#bcbcbc',
		         c1: '#c6e2ee', c2: '#e4e4e4', c3: '#eeeeee', c4: '#cde8c0',
		         c5: '#f0e4b0', c6: '#e2d0ee', c7: '#f4cccc',
		         t1: '#444444', t2: '#eeeeee', t3: '#767676', t4: '#0087af', sel: '#d0d0d0', bar: '#005f87' }
	},
	{
		// The light half's accent is OURS: upstream's orange (#fa8d3e)
		// measures 2.4:1 on that paper and would fail the accent gate, so
		// it is deepened to the same hue at 3.8:1. Same treatment, same
		// disclosure, as Everforest's.
		id: 'ayu', name: 'Ayu',
		note: 'ayu \u2014 warm accents on cool ground; light accent deepened by us',
		dark:  { b1: '#0b0e14', b2: '#131721', b3: '#1b1f2b', b4: '#2d3542',
		         c1: '#1e3a52', c2: '#131721', c3: '#0b0e14', c4: '#1c3a26',
		         c5: '#4a3c14', c6: '#33294a', c7: '#4a1f24',
		         t1: '#bfbdb6', t2: '#0b0e14', t3: '#6c7380', t4: '#e6b450', sel: '#253a5e', bar: '#14191f' },
		light: { b1: '#fcfcfc', b2: '#f3f4f5', b3: '#e7e8e9', b4: '#d3d4d5',
		         c1: '#cfe3f7', c2: '#f3f4f5', c3: '#fcfcfc', c4: '#d6e8c6',
		         c5: '#f7e3b0', c6: '#e4d8f2', c7: '#f8d0cc',
		         t1: '#5c6166', t2: '#fcfcfc', t3: '#8a8f98', t4: '#d1650a', sel: '#e7e8e9',
		         // statusBar.background from ayu-theme's own vscode-ayu
		         // (ayu-light.json) — the panel shade, one visible step off
		         // the page. The ink is measured as ever; upstream's own
		         // #8a9199 sits under the floor and is not taken.
		         bar: '#f8f9fa' }
	},
];

export const PL_DIVIDERS: Record<string, string> = { '>': 'arrow', '<': 'arrow', '|': 'straight',
	')': 'round', '(': 'round', '~': 'wave', '/': 'angleF', '\\': 'angleB' };

// Two dividers carry a DIRECTION as well as a shape. Between segments the
// direction is dictated by which way the group runs, so it is ignored there;
// at the two ends there is nothing dictating it, and this is what lets a row
// open with an arrow pointing out of the bar or into it. `<{file}` starts
// with a left-pointing point, `>{file}` with a right-pointing one.
export const PL_DIR: Record<string, string> = { '<': 'left', '>': 'right', '(': 'left', ')': 'right' };

// What --ws-stylesheet-version in styles.css must read for this build. See
// the comment beside that variable: a stale stylesheet in a vault is
// indistinguishable from a broken feature — the rules are absent, the script
// works, and the report is "your fix did nothing". Bump both together.
// ── OBSIDIAN'S OWN MARK (2026-08-24) ────────────────────────────────
//
// The writer asked for "the obsidian icon instead of that vault icon".
// Lucide has no `obsidian`, which is why the icon loop fell through to
// `vault` - a safe door, which is what they were looking at.
//
// THE TOMBSTONE HERE SAID NOT TO DRAW ONE: "a wrong logo is worse than
// an honest folder". That still holds, and this is not a drawing - it
// is OBSIDIAN'S OWN wireframe path, lifted from the `svg.logo-wireframe`
// the app already renders in its own DOM (measured 2026-08-24, viewBox
// 0 0 512 512, one stroked path). So the mark is theirs, not an
// approximation of theirs.
//
// STROKED, NOT FILLED, so it takes `currentColor` and sits beside the
// Lucide folder glyphs as line art rather than as a blob.
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
// NO `stroke-width` ATTRIBUTE, AND THAT IS THE FIX (2026-08-25).
//
// It carried `stroke-width="46"` and drew at 0.051px on screen. CSS
// beats a presentation attribute always, and Obsidian's own
// `.svg-icon { stroke-width: 1.75px }` was winning — a rule written
// for Lucide's 24-unit viewBox, applied to this mark's 512-unit one.
// Inside an SVG that value resolves in USER UNITS, so it came out
// twenty-six times too thin and the mark was a hairline. Reported as
// "the obsidian icon does not have the accented color": the stroke
// was the accent the whole time, there was just nothing of it.
//
// So the weight lives in the stylesheet, at a specificity that can
// actually win (`svg.ws-obsidian-mark`, (0,1,1)), and it lives there
// ALONE — a copy here would be a second writer of a number this file
// cannot enforce.
// A SHARE THAT SHOWS ITS FIRST DIGIT (A401): two decimals, and one more for
// every leading zero it would otherwise be all of — 2.55, 0.03, 0.004,
// 0.0005 — so no word that is there reads as 0.00%. Eight is the ceiling.
export const wsShareText = (v: number) => {
	const x = Number(v) || 0;
	if (x <= 0) return '0.00';
	let d = 2;
	while (d < 8 && Number(x.toFixed(d)) === 0) d++;
	return x.toFixed(d);
};
// MARKUP INTO AN ELEMENT, WITHOUT innerHTML (A418, 2026-09-17). The glyphs
// below are STRINGS on purpose — one writer per drawing, and a string can be
// asked what it drew (unified_probe pins the shapes by their path data). The
// plugin review forbids writing a string into the DOM through innerHTML, so
// every glyph lands through this one seam: Obsidian's sanitizeHTMLToDom
// parses the markup into nodes through DOMPurify (an <svg> and its paths come
// through whole) and they replace what the element held. Fifteen sites were
// `el.innerHTML = wsFlagSvg(…)`; they are `wsSvgInto(el, wsFlagSvg(…))`.
export const wsSvgInto = (el: Element, markup: string) => {
	el.empty();
	el.appendChild(sanitizeHTMLToDom(String(markup == null ? '' : markup)));
	return el;
};
export const wsObsidianSvg = (px: number) => '<svg class="svg-icon ws-obsidian-mark" '
	+ 'viewBox="0 0 512 512" width="' + px + '" height="' + px + '" '
	+ 'fill="none" stroke="currentColor" '
	+ 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
	+ '<path d="' + WS_OBSIDIAN_PATH + '"/></svg>';
// TOMBSTONE: `WS_READ_WPM = 238`, added an hour before it was deleted.
//
// IT WAS A SECOND RATE. `READ_WPM = 200` has been in this file the whole
// time, with two customers — `{readtime}` on the Powerline bar and the
// report's own Read time cell — and the Organizer's new column was
// dividing by a different number. The plugin would have answered "how
// long is this to read" twice, differently, about the same note, on two
// surfaces a writer can see at once.
//
// 238 IS THE BETTER FIGURE and that was not the point. Brysbaert's 2019
// meta-analysis puts adult silent reading of English prose there, and
// the 200 beside it was the round number that gets copied between blogs.
//
// AND IT IS 238 NOW (2026-09-02, on the writer's word) — in `READ_WPM`,
// the one constant, where changing it moves all three surfaces together.
// The fault this tombstone records was never the figure; it was having
// two places to put it.
// But 200 SHIPPED in 1.3.9, in two places a writer reads every day, and
// changing what they say is the writer's call and not a side effect of
// adding a column. It is on the inbox as an ASK.
// ── FOLDER NAMES AS HEADINGS ─────────────────────────────────────────
//
// A user, relayed by the writer 2026-09-01: "Would it be possible to,
// optionally, use folder names as Chapters/Sections?" — a book kept as
// `Section 1/Chapter 1/Some topic.md` compiling to `Section 1`,
// `Chapter 1`, then the prose. Their reason is the good part: "I find it
// good to be able to separate the chapter/section headings from the body
// text, so that it is easier to move things around within
// chapters/sections. The only way to do this, at present, is to create a
// document that just has a heading."
//
// OFF, because it changes the shape of every existing export and nobody
// with a flat folder of scenes asked for it.
export const WS_EXPORT_FOLDER_HEADINGS_DEFAULT = false;

// ── WHERE THE BOOK STARTS, so a folder every file shares is not a
// heading. A manuscript kept entirely in `Book/` would otherwise open
// with a chapter called Book that contains everything, which says
// nothing. The deepest folder EVERY file shares is the root, and levels
// are counted below it.
//
// ON PATH SEGMENTS, not characters: a common prefix taken on characters
// calls "Book 1" and "Book 10" one folder. The retired `exportTickRoot`
// made the same choice for the same reason.
// ── AND THE FOLDER THE WRITER CHOSE IS NOT COMMON CONTEXT (A153) ──
//
// Writer, 2026-09-04, with two shots of the same first page: "if i
// select only chapter 3 folder it does not add the folder heading
// name". Everything ticked, the page reads CHAPTER 3 - UNKNOWN then
// Scene 4. Chapter 3 alone, it reads Scene 4.
//
// THE ROOT IS STRIPPED FROM EVERY PATH, which is the whole job of this
// function: it removes the part that is context rather than structure,
// so a book's own folder does not become a heading above every page.
// The root is the files' COMMON ANCESTOR, so it moves with the
// selection — and when the selection is one folder, that folder
// BECOMES the root and its name is stripped along with it.
//
// SO THE SAME CHAPTER HAS A HEADING OR NOT DEPENDING ON WHETHER A
// SIBLING WAS TICKED BESIDE IT. Two chapters: common ancestor is the
// book, both get headings. One chapter: the ancestor is the chapter,
// and it gets none. Nothing about the chapter changed.
//
// THE SCOPE TELLS THEM APART. A folder the writer picked is not
// context — it is the thing they picked — so when the computed root
// IS that folder, the root steps up one and the folder gets its name
// back. A root nobody picked (the book, when the selection is its
// parent) is left exactly where it was, which is why the
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

// WHAT LEVEL A FILE'S OWN NAME IS SET AT. Two when folder headings are
// off, which is what every export has done since the option existed; one
// below its folder when they are on, so a chapter contains its scenes
// rather than sitting beside them.
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
	for (const sec of sections || []) top = Math.min(top, wsSecHeadLevel(o, sec));
	return (sec: WsExportSection) => Math.max(0, wsSecHeadLevel(o, sec) - top);
}

// ── HOW A TASK COUNT IS WRITTEN ──────────────────────────────────────
//
// Writer, 2026-08-22: "tasks should read like [2/13]".
//
// BRACKETED, because a bare 4/5 in a row of numbers reads as another
// measurement of the same kind as Words and Target — and it is not a
// quantity of writing at all, it is a count of boxes. The brackets are the
// notation the task is written in in the note itself, so the column says
// what it is without the header having to be read.
//
// ONE WRITER, FOUND BY THE SWEEP. It was written out at THREE sites — the
// table cell, the folder aggregate and the tree row — and exactly one of
// them was asserted. The sabotage case that strips the brackets aims at
// the tree, so it applied cleanly and reported PASSED ANYWAY while the
// suite stayed green: the assertion was about a different copy. Three
// copies of a notation is three chances for one of them to drift, and no
// number of assertions fixes that as well as having one copy.
export function wsTaskSay(done: string|number, all: string|number) {
	if (!all) return '';
	return '[' + done + '/' + all + ']';
}

// ── WHICH WAY A SORT RUNS, WRITTEN ONCE ──────────────────────────────
//
// ARROWS, NOT TRIANGLES. A coloured triangle is a decoration that has to
// be learnt; an arrow points the way the rows are going, and it is the
// mark the file explorer and every table on the web already use.
//
// ONE WRITER, FOUND BY THE SWEEP. It was written out at FOUR sites — the
// Sort button's title, the sort menu's row, the lens chip and the column
// header's mark — and NONE of the four was asserted for direction: the
// probe checked that a mark exists, never which way it points. Two
// sabotage cases swapped the arrows at the header, and both reported
// PASSED ANYWAY.
//
// Four copies of a mark is four chances for one of them to point the
// other way, which is worse than no mark: a reader who trusts it sorts
// their manuscript backwards.
export function wsSortArrow(dir: string) {
	return dir === 'desc' ? ' ↓' : ' ↑';
}

export const WS_STYLESHEET_VERSION = 560;
// THE INSTALLER GATE (A243 54). Encoded major*1000+minor. Refused below
// 1.9: installers 1.5.12 and 1.8.3 froze Obsidian on enable (Reddit,
// August 2026). Warned below 1.13: the installer this build is measured
// in. Move both only on evidence, and move the two texts with them.
export const WS_INSTALLER_REFUSE = 1009;
export const WS_INSTALLER_REFUSE_TEXT = '1.9';
export const WS_INSTALLER_WARN = 1013;
export const WS_INSTALLER_WARN_TEXT = '1.13';

// ── WHAT A FAILED WRITE IS ABOUT (A171, writer 2026-09-05) ─────────────
//
// Ten writes carry a writer’s work and every one of them ended in
// `console.error` and nothing else. `storeWriteFailed` reports them all
// and latches PER SUBJECT — so the subject is a shared name rather than
// a string typed twice, once in the failure arm and once in the success
// arm. Two copies and the latch never clears: the toast is said once and
// never again, which is the failure mode hardest to notice.
//
// THEY READ AS THE SENTENCE THEY LAND IN — “Word-Smith: could not ” plus
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

// What manifest.json must say for this build. The stylesheet has had such
// a check since 1.2.x; the manifest never did, and it turns out to fail
// the same way and be harder to notice: everyone updating a plugin by hand
// copies main.js and styles.css and forgets the third file, so the code is
// new, the styles are new, and the version the writer READS — in
// Community Plugins, in a bug report — is whatever it was months ago. A
// mismatch here is not a broken plugin; it is a plugin lying about which
// one it is, which is worse for anyone trying to help.
export const WS_PLUGIN_VERSION = '1.5.4';

// ── Writing history ─────────────────────────────────────────────────────────
// One measurement per typing pause, not one per autosave.
export const HISTORY_DEBOUNCE_MS = 2000;
// How long a pause counts as "stopped writing". Long enough that it does not
// fire between two sentences, short enough that the file is current whenever
// you look away from the editor.
export const HISTORY_IDLE_MS     = 8000;
// And the ceiling, for a session that never pauses.
export const HISTORY_MAX_UNSAVED_MS = 120000;
// Everything between these markers in the ledger note belongs to the plugin
// and is rewritten wholesale. Everything outside them belongs to the user and
// is never touched.
// The export list's markers, the same idea as the history's: the file is
// found by these rather than by its path, so a writer can move or rename it.
// ── FLAGS: WHERE A CHAPTER IS UP TO ─────────────────────────────────────────
//
// Called MARKS for one session. "Mark" was already taken twice over in this
// plugin — the hidden markers a writer toggles in the editor, and the marks
// between segments on the bar — and a word doing three jobs in one settings
// pane is a word that has stopped meaning any of them. A flag is a thing you
// plant on a chapter to say what state it is in, which is exactly this.
// The stored ids do not change (`fileStatus`, `folderStatus`, and the words
// draft / revise / done in `ws-goals.md`): renaming a thing on screen must
// not rewrite a vault's file.
//
// THREE STATES AND UNMARKED, and no more. The failure mode of a status
// vocabulary is twelve labels nobody can remember: three are comparable
// across a whole manuscript, colour cleanly, and sort in an order everybody
// already agrees on. Custom labels sound generous and break the useful part —
// if one writer's "polish" and another's "beta" are both amber, the colour
// stops meaning anything and "5 of 7 done" has nothing to count.
//
// Stored in `ws-goals.md` beside the targets, because a status is the same
// kind of fact as a target: the writer's own note about their manuscript,
// which must survive a reinstall and be editable by hand. Folders take one
// too — a part can be finished while a stray note inside it is not, and the
// roll-up beside it is what makes that visible rather than hidden.
// FIVE STATES, in the order a scene passes through them — which is also the
// order a click cycles, so pressing a chip walks the scene forward through
// its own life rather than round an arbitrary ring.
//
// Three was thin for a manuscript. The two that were missing are the two ends
// of the real problem: a scene that EXISTS but is not written yet, and a scene
// that cannot go forward until something outside it is settled.
//
//   Outline   a placeholder. There are notes here, not prose.
//   Draft     written once, roughly.
//   Revise    written, and known to need work.
//   Blocked   cannot proceed — research, continuity, a decision not made.
//   Done      finished.
//
// TOMBSTONE: A SECOND COLUMN OF HAND-SET ICONS, for "needs research",
// "continuity problem" and the like. It would have been a second answer to
// "what state is this scene in" beside a column that already answers it —
// and hand-set markers rot: a writer marks a scene broken, fixes it, and the
// mark sits there lying for three months. `Blocked` is that idea, folded
// into the one axis that already exists.
// THE IDS ARE FIXED FOREVER; everything else about a state is the writer's.
//
// A flag is stored against a path as its ID — `revise`, `blocked` — in a note
// in the vault. So a writer renaming "Blocked" to "Stuck" must not change
// what is written on disk, or every note carrying that flag loses it, and a
// vault synced from a machine with different names would disagree about what
// its own manuscript says. The label, the shape and the two colours are
// settings; the five ids are not, and the count decides how many are offered.
// The ORDER is the ring's and the count's (the first N are offered): Draft,
// Revise, Done first since 2026-09-18 (the writer: "I want Draft Revise
// Done"), Sketch and Blocked after. A vault's stored flags are read by id,
// so the order can move; the ids cannot.
export const WS_STATE_IDS = ['draft', 'revise', 'done', 'outline', 'blocked'];

// The list every reader of a flag consults, kept in step with the settings by
// `flagsApply`. A module-level table because `wsStatusLabel` and
// `wsFlagSvg` are module functions called from thirty places — including
// paint paths with no plugin in scope — and threading a plugin through all of
// them to look up a label would be a worse cure than the disease.
// REPLACED IN PLACE, never reassigned: it is a module export now (A418), and
// an importer cannot assign one. Every reader walks it at read time, and the
// redraw signature in `flagsApply` compares its JSON, not its identity.
export const WS_STATUSES: { id: string; label: string; shape?: string }[] = [
	{ id: 'draft',   label: 'Draft'   },
	{ id: 'revise',  label: 'Revise'  },
	{ id: 'done',    label: 'Done'    },
	{ id: 'outline', label: 'Sketch' },
	{ id: 'blocked', label: 'Blocked' }
];
// ── THE FLAG ITSELF ─────────────────────────────────────────────────────────
//
// One shape, three fills. Colour alone cannot carry a state: red and green is
// the commonest colour-blindness pair, these things are drawn at eleven
// pixels, and half the places a flag appears (a file explorer row, a bar
// token) have no room for a word beside it. So the three read as a FILL
// DENSITY — hollow, half, solid — which survives greyscale, a small size and
// a printout, and the colour is the fast lane for everyone who can use it.
//
//   Draft   an outline. Nothing in it yet.
//   Revise  half filled, along the pole. Work has been done and more is due.
//   Solid   done, and it stops being a question.
//
// Decorative, deliberately: the WORD is still the state, and the flag stands
// beside it wherever there is room. A vocabulary told only in pictures is one
// nobody can search, sort by name, or read in `ws-goals.md`.
// THE SHAPE IS THE STATE, and the colour agrees with it.
//
//   Draft   a pennant, pointing on. Nothing finished about it.
//   Revise  a swallowtail — a bite taken out of the fly end. Work has come
//           back for more.
//   Done    a plain rectangle. Squared off, and it stops being a question.
//
// Three SHAPES rather than three fills, and all three solid: a filled flag
// eleven pixels high reads as its silhouette, which is why every signal flag
// ever flown is a shape first. Colour alone could not carry this — red and
// green is the commonest colour-blindness pair, and half the places a flag
// appears (a file explorer row, a bar token) have no room for a word beside
// it. The silhouette survives greyscale, a small size and a printout.
//
// `currentColor` throughout, so the COLOUR IS THE STYLESHEET'S and a scheme
// can move it: the flags take a theme's own blue, red and green (its c1, c7
// and c4 slots) whenever a theme is on, and their plain defaults otherwise.
// See barThemeVars for the three lines that do it.
// THE SHAPES A FLAG CAN BE. A writer picks one per state, so the reasoning
// that used to be baked into three ids now has to hold for any of them
// against any other: each of these is told apart by its SILHOUETTE, not by
// its colour or its fill. Red and green is the commonest colour-blindness
// pair, these are drawn at eleven pixels, and half the places a flag appears
// have no room for a word beside it.
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

// ── THE AXIS BOUND (writer, BRIEF-HISTORY-MODERNISE A1) ─────────────────
//
// "the axis fits the 95th percentile of the visible days (or 3x the
// median, whichever is larger), never the maximum."
//
// THE PROBLEM IT SOLVES, their words: "every writing day is under 5
// pixels". One 10k day flattens a month of real work into a line along
// the axis. Measured in their vault, August 2026: 19 active days, median
// 216, max 11,300 - an ordinary day was 1.9% of the plot.
//
// PURE, and takes the VALUES rather than the buckets: the caller decides
// what a value is (added, deleted, net; one direction at a time), and
// this decides only where the ceiling goes. Signs are ignored - a bound
// is a magnitude - so the same function answers for the bars that rise
// and the bars that fall.
//
// (n-1)*q, NOT n*q. The calendar next door carries the same note and the
// reason: with a handful of active days the latter rounds to the LAST
// element - "the maximum wearing a percentile's name" - and the outlier
// it exists to tame becomes the scale again.
//
// THE BOUND NEVER EXCEEDS THE LARGEST VALUE. When the spread is tight,
// 3x the median lands above everything; a chart whose ceiling is three
// times its tallest bar is a chart of empty air. Clamping there is what
// makes the rule SELF-LIMITING: measured in the writer's vault, Monthly
// and Yearly clip nothing at all and are unchanged by this.
//
// ZEROES ARE NOT DATA POINTS. A day nobody wrote is not a small day; it
// would drag the median to nothing and make the bound 3x nothing.
export const WS_AXIS_PCT = 0.95;
export const WS_AXIS_MED_MULT = 3;
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

// ── TOMBSTONE: THE ZIGZAG, AND EVERYTHING IT NEEDED ───────────────────
//
// `WS_HIST_ZIG_AMP`, `WS_HIST_ZIG_PERIOD` and `wsZigDepths` went on
// 2026-09-02 with the mark they drew. The writer asked for the cut on
// 2026-08-25 ("a zigzagged line that cut's the top of the column") and
// against it on 2026-09-02 ("i want the cutted bar to show it diffrently,
// not those pixelated shit"); offered seven treatments across two rounds,
// they chose NO MARK. The column runs to the top and the label says how
// far it really goes.
//
// THE ARGUMENT WAS NOT WRONG AND IS WORTH KEEPING: a cut must BE the edge,
// not a decoration laid on one, because a mark over a straight edge leaves
// the edge underneath it straight — that is why the zigzag replaced a
// hatch. What it could not survive was the grid it had to be drawn on:
// teeth one 2px cell wide on a column 16px wide read as stair-steps. The
// comment here argued that at length, and it was right that a diagonal in
// a `preserveAspectRatio="none"` viewBox leans differently at every width.
// Both things were true; the shape still had to go.
//
// PROVED DEAD BY SABOTAGE, NOT BY READING. After the drawing code went,
// each of these had exactly ONE occurrence in main.js — its own
// declaration — and `--audit` still reported every anchor matching,
// because a case anchored on `wsZigDepths` can be APPLIED to a function
// nobody calls. Only the live sweep said PASSED ANYWAY. The audit asks
// whether a case can be applied; the sweep asks whether applying it still
// breaks anything, and dead code is exactly where those two disagree.
// ── ONE GAP FOR BOTH OVER-LABELS, IN CELLS (writer, 2026-09-02) ────────
//
// "increase the space between 11k and the bar, also put it evenly because
// look 11k on the red bar is too close to it."
//
// MEASURED IN THE RUNNING VAULT BEFORE ANYTHING MOVED: the upper label
// stood 8px clear of its bar and the lower one 1px. Not a near miss — the
// lower label was touching.
//
// AND THE ASYMMETRY WAS DELIBERATE, which is why it survived a first
// complaint. The comment beside it read: "It sat one cell off the bar
// going up and three going down; the asymmetry is the descender room a
// downward label needs, and it is kept." The reasoning was sound and the
// arithmetic was not: BOTH labels carry `translate(-50%, -100%)`, so the
// number placed is the label's BOTTOM edge. Going up that is the edge
// facing the bar and three cells buys three cells of air; going down the
// bottom is the far edge, so the same three cells are spent on the label's
// own height and what faces the bar is whatever is left. Descender room
// was being added to the side with no descenders.
//
// SO THE FIX IS THE TRANSFORM, not the number: the downward label is
// placed by its TOP edge instead, and then one constant is genuinely one
// gap on both sides.
export const WS_HIST_LAB_GAP    = 6;


// ── ONE SEARCH BOX FOR BOTH MENUS (writer, 2026-09-02) ────────────────
//
// "for the modal menu make the search box look more like the obsidian one
// with the icon and not elipsis, but Search . . ." — and then the sentence
// that decides how it is built: "we have that search box made for the
// word-smith docked menu".
//
// SO IT IS NOT A SECOND BOX STYLED TO MATCH. The docked panel already had
// the right one and the modal drew a plainer copy: `type="text"` instead of
// `search`, no wrapper, and `Search\u2026` where the other says `Search...`.
// Three small differences, none of them decided — the modal's version was
// simply written separately and never compared.
//
// THE WRAPPER IS WHAT DRAWS THE MAGNIFIER. `search-input-container` is
// Obsidian's own class; the icon comes from the app rather than from us,
// which is why the docked box has one and the modal never did.
//
// THREE DOTS, NOT AN ELLIPSIS, and there is already an assertion holding
// that for the Organizer's finder — the file tree above these panels says
// "Search...", and a box beneath it saying "Search\u2026" is one of those
// differences you cannot unsee once noticed. That comment was written for
// one box; it is true of all three.
export function wsMenuSearchInto(parent: HTMLDivElement) {
	const wrap = parent.createDiv({ cls: 'ws-menu-searchwrap search-input-container' });
	const inp = wrap.createEl('input', { cls: 'ws-menu-search' });
	inp.type = 'search';
	inp.placeholder = 'Search...';
	return inp;
}

export function wsFlagSvg(id: string, size: number) {
	const px = size || 11;
	const shape = wsFlagShapeOf(id);
	// A CLASS TOKEN, NOT MARKUP (plugin guidelines, read 2026-09-11): the id
	// arrives from a note's own property and lands through innerHTML, so it
	// is cut to the characters a class can hold before it is written.
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
		// The one shape that is a STOP rather than a stage. It was a road
		// sign's triangle with a bar and a dot cut into it; the writer asked
		// for "a thicker exclamation mark" (A355, 2026-09-13) — so it is the
		// mark itself, heavy: a bar that tapers from 3.8 wide at the top to
		// 2.6 at its foot, rounded both ends, and a dot under it, all in
		// currentColor so the flag's colour is the whole of it. The id stays
		// `alert`: notes carry it.
		return open('<path d="M4.6 2.4 A1.9 1.9 0 0 1 8.4 2.4 L7.8 8.4 A1.3 1.3 0 0 1 5.2 8.4 Z" fill="currentColor"/>'
			+ '<circle cx="6.5" cy="11.9" r="1.75" fill="currentColor"/>');
	}
	// A plain triangle, point up, no pole (A356, writer 2026-09-13: "add
	// triangle as an option for flag icons", the day the alert's triangle
	// became an exclamation mark).
	if (shape === 'triangle') return open('<path d="M6.5 1.8 L12.2 11.6 H0.8 Z" fill="currentColor"/>');
	// A question mark and a star (A357, writer 2026-09-13: "Add question
	// mark, star" from the list offered). The mark is a stroked hook — over
	// the top and down to a stem — with a dot under it, as heavy as the
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

// A FILE GLYPH WITH ITS FORMAT LETTERED ON IT (writer, 2026-08-23: "the
// file glyph with the format written on it as a LABEL, the way a document
// icon usually carries its type"). Asked for pdf, xlsx and docx.
//
// HAND-DRAWN BECAUSE IT HAS TO BE: Lucide ships no format-labelled file
// icons, so `setIcon` cannot answer this at all — there is no name to try.
// The shape to copy is `wsFlagSvg` above: a pure function returning a
// STRING of markup, no `document`, drawn from `currentColor` so a theme
// keeps working and the plugin's own palettes move it.
//
// ONE function rather than three drawings, and that is the point of it —
// the label is an argument, so this adds a BRANCH to the icon code rather
// than a second icon system. Any extension can be lettered; the caller
// decides which ones earn it.
//
// `textLength` + `lengthAdjust` are load-bearing, not decoration. These
// draw at 14–15px (styles.css caps `.ws-uni-kindicon svg`), a four-letter
// label like XLSX has about 10px to live in, and the writer's font is not
// the font every reader has. Naming the width makes the label FIT by
// construction instead of overflowing on a machine we cannot measure.
// TOMBSTONE (2026-08-31): the lettered-glyph drawing and the list of
// formats that earned one.
//
// NEITHER NAME IS SPELT IN THIS COMMENT, and that is deliberate:
// unified_probe asserts they are absent from the build by searching
// the text, and a tombstone that names them is a tombstone that keeps
// them alive. This is the SIXTH time in this project that prose beside
// an assertion has taken it green.
//
// A folded-page mark with a band of letters masked out of it, one
// mask id per format, clamped by `textLength` so four letters could
// not overflow. Built 2026-08-23 from the writer’s "the badges are
// not readeable", and it DID become readable.
//
// What it never became was a file icon. At the 14px it draws at, a
// page with a filled band under it reads as a MACHINE — a scanner,
// a printer — and that is what the writer circled: "change the file
// icons for xlsx, pdf, docx, etc, make them look like regular
// icons".
//
// The answer is the one Obsidian already uses and this plugin can
// simply borrow: a plain sheet, and the format written beside it in
// a `nav-file-tag`. See `orgKindTag`. A label is READ; a badge has
// to be decoded, and at this size there is no room to decode it in.

// THE MANUSCRIPT ORDER'S OWN MARK: lines in a chosen order, and an arrow.
//
// It stands on Obsidian's sort button while this order is on, which is the
// alternative to HIDING that button — the app's own control keeps working and
// says what it is set to, the way a filtered search shows a marked funnel.
//
// TOMBSTONE: A HAND-WRITTEN M. The reasoning was that a written letter says a
// person put this order here, against five orders the app works out for
// itself. The reasoning was fine and the glyph was not: at 18px, in a row of
// clean geometric icons, an uneven letterform reads as a rendering fault
// rather than as handwriting. A mark in a toolbar has about a fifth of a
// second to be legible, which is not long enough to be charmed by it.
//
// What replaced it says the same thing with the toolbar's own vocabulary:
// three lines of different lengths — an order somebody chose, not one that
// falls out of a rule — with a downward arrow beside them. Stroked, on the
// 24px grid, at the same weight as its neighbours, so it belongs in the row
// it sits in.
export function wsManuscriptSvg(size: number) {
	const px = size || 18;
	return '<svg class="ws-mssort svg-icon" viewBox="0 0 24 24" '
		+ 'width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" '
		+ 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" '
		+ 'aria-hidden="true">'
		// Three lines, deliberately unequal and NOT in descending order:
		// a neat staircase reads as "sorted by length", which is the one
		// thing this order is not.
		+ '<path d="M4 6.5 H15"/>'
		+ '<path d="M4 12 H11"/>'
		+ '<path d="M4 17.5 H16.5"/>'
		// …and the arrow, set apart from them, saying which way they run.
		+ '<path d="M20 6.5 V17"/>'
		+ '<path d="M17.6 14.6 L20 17.2 L22.4 14.6"/>'
		+ '</svg>';
}

// TOMBSTONE: `wsManuscriptRootSvg`, an open book drawn in place of the folder
// glyph on a manuscript root. The concept is retired at the vault's request —
// see the tombstone on the "This is a manuscript folder" row. Nothing draws a
// book any more, so `.ws-msroot`, `.ws-msroot-ribbon` and `.ws-msroot-mark`
// are unused from here; their stylesheet rules go with them, and so do the
// three sabotage cases that pointed at the ribbon.

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
// THE OVER-LABEL'S OWN ROOM, in viewBox units.
//
// A clipped bar prints its real figure OUTSIDE the plot, so the number
// never sits on the ink it describes. But the only room outside the plot
// was PAD (`HISTORY_PX * 3`, six units) and the label is taller than
// that — and an svg root clips to its viewBox. So the top of every
// over-label was cut off for as long as the feature has existed:
// measured 2026-08-25 at baseline y=4 against a 9px face, and reported
// with a screenshot as "the number up there is not displaying properly".
//
// IT OWNS THE FONT SIZE IT IS MEASURED AGAINST — the same rule a `ch`
// store keeps. `.ws-hist-overlab` is `font-size: 9px`, and this axis is
// 1:1 (the viewBox is HISTORY_CHART_H tall and the svg is that many
// pixels tall), so twelve units clears a 9px glyph with its descender
// and a little air. CHANGE ONE AND CHANGE BOTH; history_render_probe
// reads the stylesheet and asserts the label fits.
//
// It is spent ONLY on the side that has something to say: a chart with
// nothing clipped keeps the whole plot.
// HEADROOM FOR AN OVER-LABEL, and it must cover the label ITSELF plus the
// gap beneath it: the span is ~11px of type and WS_HIST_LAB_GAP * HISTORY_PX
// of air, so 12 covered the gap and nothing else. Raised on 2026-09-02 when
// the gap grew; history_render_probe already held the guard that caught it
// ('with its whole height inside the top of the plot'), which is why this is
// a number changed rather than a fault shipped.
export const HISTORY_OVERLAB_PAD = 24;
// Few buckets must not become slabs: two years of data on the Year tab would
// otherwise draw two bars a third of the panel wide each.
export const HISTORY_BAR_MAX     = 34;
// The chart's viewBox. Chosen to land close to 1:1 against the modal's real
// width so a 4-unit block renders as a roughly 4-pixel square — the whole
// pixel idiom depends on the two scales not drifting far apart.
export const HISTORY_CHART_W     = 660;
export const HISTORY_CHART_H     = 184;
export const HISTORY_DAYNAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const HISTORY_MONTHS      = ['January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'];

// Theme surfaces, addressable as :b1 and :b2 instead of a number.
//
// The seven :N backgrounds are colours the writer picked; these two are
// whatever the current theme is already using for the page and the panels
// beside it. That makes them the only way to write a segment that DISAPPEARS
// into the bar — a label with no block behind it, between two that have one —
// and it keeps working when the theme changes or the vault flips dark to
// light, which a picked colour cannot.
//
// Values are resolved from the live computed style rather than written as
// `var(--background-primary)`: a separator's colour ends up in an SVG `fill`
// ATTRIBUTE, and custom properties do not resolve in presentation attributes.
// The resolved token works everywhere — background-color, box-shadow and fill
// all accept whatever syntax the theme declared it in.
// A directive at the very START of row 1's left slot, setting the BAR's own
// colours from the theme, the palette, or the live mode rather than a
// segment's.
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
// Same grammar as the powerline suffixes on purpose — ":" is a background and
// ";" is text everywhere in a row — but a different position: the suffix form
// always follows a token (`{file}:b1`), so nothing here can be mistaken for
// it. Both may appear, in either order, and the pair may be followed by
// ordinary content.
//
// The palette and vim forms return a SLOT rather than a value: they need the
// plugin (settings, theme, live mode) to resolve, and this is a module
// function. resolveBarDirective() on the plugin turns a slot into paint.
//
// Returns the stripped string alongside the values so the caller cannot
// render one without honouring the other.
// Every one of these ENDS in a variable that always resolves, and that is
// not tidiness — it is the difference between a slot the theme does not
// define and a bar that vanishes.
//
// These values are stamped straight into `--ws-bg`, and the bar paints with
// `background-color: var(--ws-bg)`. A var() that does not resolve is invalid
// AT COMPUTED-VALUE TIME, which does not fall back to the previous
// declaration — it falls back to the property's INITIAL value, and the
// initial value of background-color is `transparent`. So one undefined theme
// variable does not give a slightly wrong colour, it gives no bar at all.
//
// And it does not stop there, which is what made this hard to read as one
// bug. `barColor` is then read back off the element, sees rgba(0,0,0,0), and
// stays 'transparent' — and barColor is what a group's END CAP is drawn
// against. For a slanted cut the SHAPE takes that colour and the backing
// rect takes the segment's, so the cut paints invisibly over a solid
// rectangle and the group appears to start with a straight edge instead.
// Reported as two unrelated faults in light mode ("the middle is
// transparent" and "the right side starts with | instead of \\"), one cause.
//
// Core Obsidian defines --background-primary, --background-primary-alt,
// --background-secondary and --background-secondary-alt. It does NOT define
// --background-tertiary; community themes often do. But a theme is free to
// leave any of them out, and one that did took the whole bar with it — so
// every chain below terminates at --background-primary, which is the one
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
		// `bs` and `bc` join b1-b4 as surface names, BEFORE b\d+ in the
		// alternation so the engine need not backtrack into them. Listed
		// rather than widened to \w+, because an unknown slot must stay
		// unmatched and print itself: a typo that silently resolved to
		// nothing is the failure this grammar was built to avoid. The old
		// spelling `s` is deliberately absent — see BAR_DIRECTIVE_BG.
		//
		// :bc and ;bc travel the SLOT route with :vim rather than the
		// theme-surface route with :bs, because the cursor's colour is
		// LIVE state — Cursor-Smith repaints the caret per vim mode — and
		// a slot is resolved on every repaint where a surface is stamped
		// once (see cursorColor).
		// `:f` and `;f` join `:vim` and `:bc` on the SLOT route rather than
		// the surface route, and for the same reason: the flag's colour is
		// LIVE state. It follows the note in front of the writer and changes
		// the moment they flag it, where a surface is stamped once when the
		// scheme is applied.
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

// Separator width as a fraction of the row's height, which is the same thing
// as the arrow's sharpness. The apex sits at (w, h/2) and the base runs
// (0,0) to (0,h), so the nose measures
//
//     2 · atan((h/2) / w)  =  2 · atan(0.5 / aspect)
//
//     0.34 -> 112 degrees    0.50 -> 90    0.85 -> 61    1.05 -> 51
//
// WIDER IS POINTIER. A long shallow triangle has a sharp nose; a short
// stubby one is blunt.
//
// A WHOLE SESSION OF WRONG ANSWERS IS RECORDED HERE, because the mistake
// underneath them is easy to repeat. Asked to make the arrows pointier
// from 0.85, this was set to 0.34 and then 0.5 — both BLUNTER, 112 and 90
// against the 61 it started at — because the angle was being computed as
// 2·atan(2·aspect), which is the COMPLEMENT of the real one. The two
// formulas agree at exactly 0.5, which is the one value that could not
// reveal the error. A stray comment claiming a Powerline glyph "is nearer
// 65 degrees" is what the first guess was aimed at; the original comment
// beside this constant had the correct formula and the correct 61 all
// along, and was read past.
//
// 1.05 is a 51-degree nose: clearly sharper than the 61 that prompted the
// complaint, and still a triangle with a body rather than a needle.
//
// A constant, not a setting. It was briefly a slider, and a slider was the
// wrong shape for it: the writer has no way to judge the number without
// dragging it, and it put a wire-format key (BAR_KEYS index 56) behind a
// question nobody wanted asked. That key stays in the table — it cannot be
// removed, only stopped being read.
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

// Doubling turns a character into a SOFT mark: drawn in the row's own
// foreground, inside one colour block instead of between two — the hairline
// short and faint, the chevrons the same line bent to a point and drawn as
// an outline stroke (buildSoftChevron), the way p10k's thin dividers sit
// inside a block. Only
// three exist, and the set is deliberately short rather than symmetric —
// (( )) || ~~ were tried and removed. A soft mark has to stay legible at a
// few pixels of foreground colour, and the round, twin and wave forms did
// not: they read as specks. Chevrons keep a clear direction and the hairline
// is unmistakable at any size, so those are what remain. Backslash is
// excluded regardless: a doubled backslash already means a literal one.
//
// A fourth mark, a 1px rule at the bar's full height, was built and removed.
// Not for how it DREW — that part worked — but for how it read in the format
// string. It was spelled `||` first, which put a third meaning on the one
// character that is already the straight divider and the only one with an
// escape, and then `;;`, which has none of those problems and a worse one: at
// the size a row is written and scanned, `;;` and `::` are the same two
// stacked dots. A grammar the writer has to squint at is not simpler than no
// mark at all. If it comes back it needs characters that look nothing like
// the hairline's.
//
// Note this means doubling is NOT universal. A doubled character with no
// entry here falls through to the tokenizer, which splits on each half as a
// hard divider — the empty segment between them is then dropped by the
// collapse pass, so `{a} )) {b}` renders as a single round join rather than
// as an error. That is the intended degradation.
//
// All three work in a PLAIN row as well as a powerline one. They were
// powerline-only for no reason anyone chose: the split lived inside
// renderPowerlineSection, so a plain row printed `::` as two colons. Nothing
// about a mark in the row's own foreground needs a coloured block behind it —
// that is what makes it soft. renderStatusSection now does the same split, and
// since the powerline renderer hands it pieces that are already split, the
// two do not collide. Sizing differs and only sizing: a segment gives the
// marks a definite height to stretch into and a plain section does not, so
// the stylesheet sizes them from the bar's font there (see .ws-pl-soft).
// The official Obsidian crystal as one path, its four facets separate
// subpaths so the facet lines are gaps in the fill. From simple-icons
// (CC0 path data); see buildObsidianIcon for the trademark note.
export const OBSIDIAN_ICON_PATH = 'M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z';

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
	// A FRESH INSTALL SHOWS NINE (the writer, 2026-09-18: "close so themes by
	// default, leave some of them on, because too many options on at first is
	// not ok", then "put modus operandi tinted, and modus vivendi tinted on"
	// — one scheme, Modus Tinted, light and dark): the ones most writers know
	// by name stay on the shelf, the other sixteen wait as pills below it, one
	// tap from coming back. A vault that has saved keeps its own.
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
	// TOMBSTONE (1.3.0): `menuColumns` and `menuCenterText` lived here
	// for part of one cycle and never shipped. The menu is one column —
	// a palette is a list, and a grid made the reading order a puzzle —
	// and row labels are centred by the stylesheet as the one look, not
	// a toggle. A saved value for either key is simply unread.
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
	// id that is absent starts a line. THE SHIPPED MENU IS PAIRED (the
	// writer, 2026-09-20: "make this the default way of the menu"): Syntax |
	// Prose, Font | Markers, Theme | Light / Dark, Report | History,
	// Organizer | Export, with Search, Modes and the rule on lines of their
	// own — the second of each pair continues the line (see `menuLayout` for
	// the order). A vault that saved its own list keeps it, an empty list
	// being the single column the menu used to ship as.
	menuJoined:     ['prose', 'markers', 'lightdark', 'history', 'export'] as string[],
	// How each separator draws — layout id → solid / dashed / dotted /
	// double. A rule is the one thing on this shelf with nothing to say,
	// so its only setting is how it looks. Absent means solid.
	menuRuleStyles: {} as Record<string, string>,
	// The menu as a DOCKED PANEL as well as a pop-up: a leaf you can drag
	// under the file tree and jump to with quick cycle, rather than a
	// window you summon and dismiss.
	//
	// ON by default. It shipped off on the reasoning that a plugin adding
	// a pane uninvited takes a decision belonging to the writer — which
	// is true of a pane nobody asked for, and this one IS the plugin: a
	// new install otherwise shows nothing at all until the writer finds a
	// setting they have no reason to look for. Turning it off is one
	// click and the pane's position is remembered.
	menuDock:       true,
	// WHAT THE TARGET CELL SAYS (writer, 2026-08-31: "make the target
	// show percentage or xxx/xxx").
	//
	// `ratio` WAS THE DEFAULT because the column is called Target: a
	// cell reading "43%" no longer says anywhere what the target IS,
	// and 2,145/5,000 carries the progress AND the number it is
	// against. The writer reversed it (2026-09-20: "the target column by
	// default should be percentage"): the column stays narrow, and a
	// folder's cell says both numbers whichever way the notes read.
	orgTargetShow: 'percent',
	// (`exportTicksAlways` stood here for a day — A254-1c's one setting —
	// and went at A271: the ticks are on only while an Export pane is open.
	// Deleted on load, like every dead key.)
	// ── THE ORGANISER'S OWN ICONS, ONE SWITCH EACH ──────────────────────
	//
	// Writer, 2026-09-02: "add option in organiser settings to show or not
	// show folder icons and another option to show or not show file icons
	// (same as int the file tree tab in the plugins settings)".
	//
	// TWO KEYS, NOT ONE, because that is how it was asked for and how the
	// pair it is modelled on already works: `fileTreeFolderIcons` and
	// `fileTreeKindIcons` are separate switches on the File tree tab, and
	// a writer who wants folders marked and files plain has to be able to
	// say so. A single "icons" switch would be a third grammar.
	//
	// `true` IS WHAT THE WINDOW DOES TODAY, so a vault that upgrades sees
	// no change and no migration is owed: these keys have never existed,
	// so `raw.orgFolderIcons === undefined` is true for everyone and the
	// defaults put them in.
	// The marker for the one-time flip in loadSettings; see the note there.
	fileIconsOffOnce: false,
	orgFolderIcons: true,
	// OFF, on the writer's word the day after they asked for the switch:
	// "remove the file icons from file tree and organiser too (we keep only
	// folder icons)". A folder glyph tells a folder from a note at a glance;
	// a glyph on every note tells you what you already know from the row it
	// is in. The switch stays, because a switch is one click back.
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
	// TOMBSTONE (1.3.5): barThemeMarginalia and marginaliaGutter. An iA
	// Writer hanging gutter, built twice and removed twice — the second
	// build fixed every complaint made about the first (hashes ranged
	// right instead of counted in `ch`, markers hung out of flow, an
	// auto-sized margin, the chevron against the hash run) and the look
	// was still not wanted. Worth recording: every individual defect was
	// fixable and every one got fixed, and the whole never became good.
	// Both keys are swept in loadSettings; the Obsidian findings are in
	// the tombstone at the end of styles.css.
	// The shape of a task checkbox: '' leaves Obsidian's (or your theme's)
	// alone, which is why the default is empty rather than 'square'.
	barThemeCheckbox:   '',
	// TOMBSTONE (1.2.8). barThemeGlass was a frosted-glass toggle, removed
	// by vault feedback within the release. barThemeGlassStash OUTLIVES it
	// on purpose: while Glass was on it borrowed Obsidian's own
	// `translucency` setting, and a vault that ran it still has that
	// borrow outstanding. Deleting the feature without repaying it would
	// leave a writer's window translucent forever, changed by a plugin
	// that no longer has the code to explain it. The repayment runs once,
	// on load, and clears itself — see barThemeGlassRepay.
	barThemeGlassStash: null as boolean | null,
	// TOMBSTONE (1.2.7). barThemeSimpleTabs was REMOVED within this same
	// release by vault feedback: the flattening rules amounted to "only an
	// underline" under real themes — the look needs Minimal's full tab
	// rework or nothing, and a toggle that underdelivers its name is worse
	// than no toggle. The key is simply gone from defaults; a stale value
	// in data.json is harmlessly ignored.
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
	hideStatusBar:            true,
	hideLinkedMentions:       true,
	hideScrollBar:            true,
	hideRibbon:               true,
	// Zen sub-options that hide things this plugin owns, rather than
	// Obsidian's. Kept beside the rest of the hide group so the tab reads as
	// one list, but note they are NOT bar presets: a preset describes how the
	// bar looks, and whether zen hides it is a property of zen.
	zenHideBar:               false,
	// How long the bar lingers after the pointer leaves the strip it hides
	// in. 0 turns peeking off entirely, which is the off switch — a separate
	// toggle for it would be a second control for one decision.
	barPeekMs:                2000,
	// Breathing room between the caret and whatever occupies the edge of the
	// window: the bar, the vim command line, the letterbox. Enforced through
	// CodeMirror's scrollMargins (see caretFloorY), which is the one route
	// that has ever reached the editor — the zen padding sliders that tried
	// to do this with CSS are a tombstone in ARCHITECTURE.md.
	caretMarginPx:            0,
	// Escape leaves zen. Off-limits in vim's insert/visual/replace modes
	// whatever this says — see the keydown handler — so it costs a vim user
	// one extra keystroke rather than a keybinding.
	zenEscExits:              true,
	// Measured height of the vim command line, so the gutter can be
	// reserved at the right size before the first `:` of a session.
	vimPanelHeight:           23,
	// ── HOW FAR THE BAR SITS FROM THE BOTTOM (A174, 2026-09-05) ────────
	//
	// Writer: “add a slider that goes from 0 to 23 px so users can pick
	// how far the status line sits from the bottom … maybe increase the
	// slider range from 0 - 30px (default for new users 23px)”.
	//
	// 23 FOR EVERYONE, new vault and old. It is what every vault shows
	// today — the vim gutter was reserved unconditionally — so nobody
	// sees anything move on the upgrade; the number simply becomes
	// theirs. No migration writes it: the default IS the answer.
	//
	// AND IT IS NOT `vimPanelHeight`, one line up. That is a MEASUREMENT
	// — how tall this vault’s `:` line actually is — and this is a
	// CHOICE. They happen to be 23 on this machine and that is a
	// coincidence of the theme, not a shared fact.
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
	maskPaddingH:             194,
	// Whether the masks span the whole editor or only the TEXT COLUMN.
	// Off is how it shipped: a backdrop across the pane. On, the mask ends
	// where the writing ends, which reads as a frame around the page
	// rather than a band across the window — and it follows the column
	// when the readable-line width or the padding changes, without the
	// writer re-measuring the horizontal inset by hand.
	maskMatchText:            false,
	// And whether "the text" includes the editor's own side padding. Off
	// takes the column itself; on takes the column plus the space the
	// editor leaves beside it, which is what the eye reads as the page.
	maskMatchTextPadded:      true,
	maskOverhang:             4,
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
	dimUnfocusedEnabled:      false,
	dimFocusMode:             'paragraph', // 'paragraph' | 'sentence'
	dimOpacity:               0.55,

	// ── Retro status bar ──────────────────────────────────────────────────────
	// A PHONE'S OWN OPT-IN for the bar (A286): the master above syncs across
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
	statusBarRows:            1,
	statusRows:               [
		{ left: ':b2{obsidian}:6>{ggggg}{ggggg}{ggggg}|{file}:vim>{ggggg}>{ggggg}>{ggggg}>{ggggg}~',
		  center: '<{ss}{mode}:7/{syntax}::{prose}:2|{font}\\{report}:vim<',
		  right: '~{markers}{paragraph}~{words} words){clock}{time}' },
		{ left: '',
		  center: '',
		  right: '' },
		{ left: '',
		  center: '',
		  right: '' },
	],
	fileTokenFormat:          'path',     // 'path' (~/folder/name) | 'name' (basename only)
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
	// THE INTERFACE FONT FOR THE BAR (A454, the writer: "use interface font for
	// the powerline, not the text font"): off, the bar follows the font chosen
	// through the font token; on, Obsidian's own face whatever the note is in.
	statusBarUiFont:          false,
	statusBarHeight:          16,
	statusBarPadTop:          2,         // breathing room above the rows
	statusBarPadBottom:       2,         // and below them
	// ── Powerline ──────────────────────────────────────────────────────────
	// Segments are split on a divider character, and the character chosen
	// sets that boundary's shape (see PL_DIVIDERS). Inside a segment, ::
	// draws a soft divider. A colour is chosen per segment by suffixing any
	// token in it with :N — {file}:2, or {file} :2 if you want the space.
	// INERT — see BAR_KEYS_INERT for what that means and why the value here
	// still matters.
	powerlineEnabled:         true,
	powerlineModeColors:      true,
	// Vestigial. The separator's angle was briefly a slider and is now the
	// PL_SEP_ASPECT constant — there is one right answer for "does this read
	// as an arrow", and it was not a question worth asking. The key stays
	// because it is BAR_KEYS index 56 and share codes already carry it; it
	// is written, encoded and decoded, and read by nothing.
	powerlineSepWidth:        78,
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
	// Text colours, addressed as ;N after the background number.
	// INERT (BAR_KEYS_INERT). One palette now: ;N reads the background
	// swatches, so a colour retinted there retints wherever it is used.
	powerlineText1:           "#ffffff",
	powerlineText2:           "#16181d",
	powerlineText3:           "#9aa0a6",
	powerlineText4:           "#4f9dde",
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
	powerlineTextLight1:      "#16181d",
	powerlineTextLight2:      "#f7f7f5",
	powerlineTextLight3:      "#5c636b",
	powerlineTextLight4:      "#2d6da4",
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
	// Three of them, drawn the same way: the writing goal as a ring, the file
	// goal as a triangle, the folder goal as a square. One label mode and one
	// line weight across all three, so they never disagree about how they look.
	goalTarget:               200,       // legacy vault-wide goal; kept so old data loads
	// INERT. Kept so a vault that turned it off does not read as corrupt on
	// load; nothing reads it any more. Targets and flags live in
	// `ws-goals.md` full stop — the switch offered a state where they lived
	// only in data.json, which a writer cannot read, cannot edit and loses on
	// a reinstall, and that is not a choice worth offering for the numbers
	// somebody chose deliberately.
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
	// TOMBSTONE: `uniColCh`, widths the writer dragged, in `ch`, keyed by
	// column id — and `uniCols` before it, the same store in PIXELS. Both are
	// deleted on load rather than ignored; see the migration, and see the
	// header cell in the Organizer for why the handles went. Only the NAME
	// column's width is stored now, in `uniNameCh`.
	// Which folders the writer has folded away in the Outliner. Kept because
	// the alternative is folding them again on every opening; pruned when the
	// window opens, so a folder deleted while it was shut does not linger as a
	// path nothing matches.
	// TOMBSTONE (A277): `uniShut`, the window tree’s folds. Deleted on load.
	// AND THE TREE ROOT’S OWN FOLD, which is a SECOND key on purpose.
	//
	// It shared `organizerRootShut` with the table’s subject row from
	// 2026-08-26, and the comment beside that sharing argued for it: one
	// row, one fact, "a second boolean would let a writer fold it in one
	// pane and find it open in the other". The writer reported the
	// consequence on 2026-08-31 — "when i close a main folder in the table
	// the organiser filetree colappses on the rootfolder" — and MEASURED
	// in their vault it is exactly that: folding the table’s subject took
	// the tree from 37 rows to 1.
	//
	// THEY ARE NOT ONE ROW. The table’s subject is the folder the table is
	// SHOWING and the tree’s root is the top of the whole vault; they only
	// coincide when the scope is the vault. Two rows in two panes, so two
	// facts — and `loadSettings` seeds this one from the old key so a fold
	// already made does not spring open on upgrade.
	// TOMBSTONE (A267, 2026-09-09): `uniRootShut`, the window tree's own
	// root fold. It had exactly one reader and the tree took it out; a key
	// nothing reads is a name somebody reuses. Deleted on load.
	// ── THE NEW ORGANIZER (RULES-OF-THE-WINDOW.md) ──────────────────────────
	// TOMBSTONE: `organizerRoot` (2026-08-30). The manuscript root the
	// Organizer's tree hung from. Retired on the writer's word — "we
	// already can click on a folder" — which is exactly the objection
	// that retired `uniScope` and `manuscriptRoots` before it: a
	// persisted narrowing is invisible once set. The tree starts at the
	// vault, always, and `organizerFolder` remembers where you were.
	// DELETED on load, not merely undefaulted: a key that still parses
	// is a trap for whoever reuses the name.
	// The selected folder in the Organizer tab, kept across sessions (spec,
	// SETTLED list). Empty means the manuscript root itself. Written by ONE
	// function (`orgSelect` in the window) and nothing else.
	organizerFolder:          '',
	// Which of the two right-pane views is up (spec, RIGHT PANE): 'table'
	// or 'outline'. A view the writer chose is a view the window
	// remembers — the uniBoard precedent.
	// TOMBSTONE: `organizerDrawer` (2026-08-24). It held whether the
	// TABLE view's property drawer was open, and it went with the button
	// that opened it - the writer's own answer when asked whether two
	// controls should go on answering one question. Table is the columns
	// and Outline is the properties; `organizerMode` is now the only
	// store that says which of the two is up. Deleted on load, because a
	// dead key that still parses is a trap for whoever reuses the name.
	// TOMBSTONE: `organizerOutlineProp` — the ONE property the Outline drew
	// under every row, view-wide, defaulting to the synopsis with a
	// label-click to switch it.
	//
	// THE OUTLINE WENT AT A26 AND THIS DID NOT. Measured 2026-08-31 while
	// cutting the synopsis chain: the key had NO reader left anywhere in
	// `src/` — only this line declaring it. It was noted then and not
	// touched, because that batch was about a different chain; it is a dead
	// key by the rule three paragraphs of this file spend on the subject, so
	// it goes now.
	//
	// DELETED ON LOAD, not merely undefaulted: 1.3.9 shipped, so a stranger's
	// data.json carries whichever property they had chosen, and with no
	// reader left it would sit there unreachable for ever. `uniColCh`,
	// `organizerRoot` and `synopsisKey` are the precedent.
	// Which KINDS of file the Outliner's tree draws. Group ids from
	// `uniTypeGroups` — ALL of them by default, decided by the vault that
	// asked for this: the request was "all the file types in it", with the
	// menu's one-click "Notes only" as the way back. 1.3.9 has never
	// shipped, so there is no older behaviour to keep silent for. NOT what
	// the compile consumes: the compile keeps its own extension check at the
	// point of consumption, and the two rules have one owner each. The list
	// is written out rather than computed because DEFAULT_SETTINGS is a
	// plain literal read before the class exists — keep it equal to the ids
	// in `uniTypeGroups`.
	uniTypes:                 ['md', 'image', 'canvas', 'base', 'pdf', 'audio', 'video', 'other'],
	// TOMBSTONE: `uniScope`, the Outliner's FOLDER SCOPE — "these are my
	// folders", folder paths, empty meaning the whole vault. Retired at the
	// vault's request: "remove scoping a folder (we use the search bar)".
	// It had already outlived `manuscriptRoots`, which died of the same
	// fault it then reproduced: a persisted narrowing with a sign a writer
	// stops seeing. The key is deleted on load in `10-settings`.
	// TOMBSTONE (Phase 5): `uniBoard` / `uniBoardTags` — the corkboard.
	// Dead by the spec's SETTLED list; both keys deleted on load.
	// Set the first time a history store is written or found. See
	// `historyWrite`: it is what stops an unready vault index being read as
	// "there is no history here" and a second, empty file being made beside
	// the one holding the record.
	historySeen:              false,
	settingsMirror:           true,
	settingsMirrorPath:       'Word-Smith/ws-settings.md',
	fileGoals:                {} as Record<string, number>,   // note path -> word target
	// TOMBSTONE (A169, 2026-09-05): `folderGoals`. “let’s retire folder
	// goals — they are only the sum of their files now.” Deleted on
	// load in `loadSettings`, the `uniCols` precedent: a key that still
	// parses is a key somebody reuses. `folderTargetRollup` is the one
	// answer to what a folder is worth, and it adds up the notes.
	// …and where each one is up to: 'draft' | 'revise' | 'done', absent for
	// unmarked. Same keys, same file (`ws-goals.md`), because a status is
	// the same kind of fact as a target — the writer's own note about their
	// own manuscript, which has to outlive a reinstall and be editable by
	// hand. See WS_STATUSES for why there are three of them and not twelve.
	fileStatus:               {} as Record<string, string>,   // note path -> flag id
	goalLabelMode:            'fraction',  // 'percent' inside | 'fraction' beside | 'none'

	// INERT (BAR_KEYS_INERT). The bar takes the theme's surface and text; a
	// row directive (:b2, ;vim) is the only override, and it is visible in
	// the format string rather than two tabs away.
	retroCustomColors:        false,
	retroDarkBgColor:         "#141010",
	retroDarkTextColor:       "#f2f2f2",
	retroLightBgColor:        "#e9e8e8",
	retroLightTextColor:      "#f7fb09",
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
	fontTokenFormat:          'glyph',   // 'glyph' (the menu's icon, since A331; was Aa) | 'word' (Fonts) | 'both' (A400)
	markersTokenFormat:       'glyph',   // 'glyph' (the menu's icon, since A331; was \u00b6) | 'word' (Markers) | 'both' (A400)
	// THE OTHER EIGHT (A331): { modes | syntax | prose | theme | report |
	// history | export | organizer: 'icon' }; a token absent from the map
	// shows its word. One key, so a preset or a share code carries it whole.
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

	// ── Text options ──────────────────────────────────────────────────────────
	enableParagraphIndent:    false,
	paragraphIndentEm:        4,
	paragraphIndentMode:      'single',   // 'double' | 'single'
	lineSpacing:              1.5,
	// '' = whatever the theme sets, and that is the only defensible shipped
	// value. This held a real font name for eleven releases (issues #4 and
	// #6): installing the plugin restyled every note in a face the writer had
	// not chosen and, because the only control for it was the {font} button
	// on the bar, a preset without that token left no way to find the switch.
	// A plugin may add things to Obsidian. It may not quietly redecorate what
	// was already there.
	editorFont:               '',
	// One-shot: see the migration in loadSettings.
	editorFontDefaultCleared: false,
	limitLineLength:          false,
	maxLineChars:             64,
	justifyText:              true,
	showHiddenMarkers:        true,
	// PARAGRAPH NUMBERS, in the left margin, off by default. PROSE
	// paragraphs only: not list items, not tasks, not headings, callouts,
	// quotes, tables or code. A manuscript's paragraphs are the unit an
	// editor refers to ("cut the third paragraph"), and numbering the
	// bullets in a shopping list alongside them would make the count mean
	// nothing.
	//
	// TOMBSTONE (1.3.4): `lineNumberMode` ('off'|'absolute'|'relative')
	// lived beside this for one build and was removed on sight — THE
	// SECOND TIME this plugin has grown line numbers and had them taken
	// out. The first attempt is already swept in loadSettings, in a list
	// that says why: positioning the gutter against the text column was
	// more trouble than the distance it saved. This attempt drew the
	// numbers as line decorations instead of as a gutter, met the same
	// wall from the other side, and went the same way. The key needs no
	// new sweep — that older list already deletes it.
	//
	// If a third attempt is ever made: do not draw numbers at all.
	// Obsidian has line numbers; the only thing missing is relative mode,
	// and the way to add that is to reformat Obsidian's own gutter
	// (Prec.highest + lineNumbers({ formatNumber })) rather than to put a
	// second set of numbers beside the first.
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
	syntaxStyle:              'text',     // 'text' | 'highlight' | 'squiggle' | 'line'
	checksEnabled:            false,      // master switch over the writing checks
	checkStyle:               'squiggle', // same options, for the writing checks
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
	// Dialogue: everything between quotes, so speech can be found at a
	// glance. Off by default like every other check — a plugin that starts
	// colouring a manuscript before it is asked has overreached.
	checkDialogue:            false,
	checkDialogueColor:       "#4f9dd9",
	checkRhythm:              false,
	checkRhythmHardColor:     "#d4a017",
	checkRhythmVeryHardColor: "#c2544d",
	checkRhythmHardGrade:     10,        // Flesch-Kincaid grade for "hard"
	checkRhythmVeryHardGrade: 14,        // and for "very hard"
	checkRepetition:          true,
	checkRepetitionColor:     "#4caf7d",
	repetitionWindow:         50,        // words
	repetitionMinLength:      5,         // ignore short words
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
	typoEllipsis:             true,
	typoDashes:               true,
	typoArrows:               true,
	typoComparisons:          false,
	typoGuillemets:           false,
	typoFractions:            true,

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
	// TOMBSTONE (1.3.2): `barMenu` gated whether the Menu command existed
	// at all. It shipped true, nobody had a reason to turn it off, and the
	// ribbon button and the docked panel both go through the menu — so the
	// switch offered to break two other things to remove one palette entry
	// that Obsidian's Hotkeys pane can hide anyway. A saved value is
	// unread.
	quickCycle:               false,
	// A sub-option of quickCycle, and off by default because it is the more
	// opinionated half: the sidebar you walked out of shuts behind you.
	quickCycleCloseOnLeave:   false,
	enableFileTreeCounts:     false,
	// A tiny flag beside the count in the file explorer, from the same store
	// the board writes. Its own switch, because the counts are a number on
	// every row and the flags are a mark on the few that carry one.
	fileTreeFlags:            false,
	// ON, by the writer's word (2026-08-27): “leave the toggle there, but
	// default on for anyone”. The switch below stays exactly where it was —
	// this changes what a vault STARTS at, not what it can be set to.
	//
	// FLIPPING THIS ALONE REACHES ALMOST NOBODY, which is why the one-shot
	// below exists: `loadSettings` merges DEFAULT_SETTINGS under the raw
	// file, and `saveSettings` persists the whole merged object — so every
	// vault that has ever saved once already has `treeOrder` written into
	// data.json and raw wins. Only a vault with NO data.json would see this.
	treeOrder:                true,
	// One-shot: see the migration in loadSettings. It turns the order ON
	// once for a vault that predates the default above, and then never
	// again — so a writer who switches it off keeps it off, from the
	// settings tab or from the explorer's own sort menu.
	treeOrderForcedOn:        false,
	fileTreeFolderIcons:      true,    // on by default since 2026-09-18 (the writer)
	// THE SAME KIND GLYPH THE MANUSCRIPT WINDOW DRAWS, in Obsidian’s own
	// tree (writer, 2026-08-25: "icons that match the organizer").
	// OFF like its neighbour above: this paints into somebody else’s
	// pane, and a plugin update that rearranges a writer’s file tree
	// without being asked is the kind of change that gets a plugin
	// removed. 1.3.8 shipped without it, so on-by-default would be a
	// surprise for every vault that updates.
	fileTreeKindIcons:        false,
	// IS THE SUBJECT ROW FOLDED? (writer, 2026-08-25: "put a chevron on the
	// root folder … with collapse expand".)
	//
	// ITS OWN BOOLEAN, and not a member of `organizerOpen`. That set holds
	// the folders that are OPEN and defaults EMPTY, because "empty is
	// all-shut" is the state the writer asked the window to open in. The
	// SUBJECT is the opposite: it must default OPEN or the table opens
	// blank. A single flag with the default the other way round says that
	// plainly; folding the subject into the same set would have needed a
	// sentinel and an exception, for one row.
	// THE ORGANIZER’S SWITCH (A295, a user via the writer, 2026-09-12: “is
	// there a way to opt out of Organizer? … I specifically want to opt out
	// of having the plugin add files into my vault”). Off: the Organizer’s
	// doors are shut — the menu row, the window’s tab, the command — and
	// `Word-Smith/ws-structure.md` is neither made nor written; a file that
	// exists is read and left alone. The order, goals, ticks and non-note
	// properties are held for the session and not kept. History has its
	// own switch (`historyTracking`), the settings copy has its own
	// (`settingsMirror`); this is the third store’s.
	organizerOn:              true,
	// WHICH FOLDERS ARE THE WRITING. Empty means the whole vault, which is
	// what every reading in this plugin meant before roots existed and is
	// still the right answer for a vault that is only a manuscript.
	//
	// A LIST, not one folder: two books in one vault is ordinary, and a
	// writer with "Novel" and "Short stories" should not have to choose which
	// one the plugin is about this week.
	// TOMBSTONE: `manuscriptRoots: []`. The concept is retired — see the
	// tombstone on the menu row that set it. The stored key is DELETED on load
	// rather than ignored, so a vault stops carrying an answer to a question
	// nothing asks any more.
	// TOMBSTONE (writer, 2026-08-31: "cut it"): `synopsisKey`, which named
	// the frontmatter key the synopsis was read from. Its only reader was
	// `synopsisOfKey()`, whose only reader was `synopsisOf()`, whose only
	// reader was the index’s `synopsis` record field — and that field was
	// displayed by nothing. The whole chain went in one cut; see the
	// paragraph in `src/20-scope.js` where it used to live.
	//
	// DELETED ON LOAD, not merely undefaulted. 1.3.9 has shipped, so this
	// key is certainly in a stranger’s data.json and not only in ours — the
	// `uniColCh` precedent, and the reason a dead key is removed rather
	// than left to sit unreachable forever.
	// ── WHICH PROPERTIES ARE WRITTEN OUT IN FULL (writer, 2026-08-28) ──
	//
	// "make so that i can have more than one long fields", and "don't call
	// the star the prose field (call it Long field)". The unit changed from
	// one key to a set, so by FACTS' own rule the store changed name:
	// `organizerLongFields`, written by the ★ column in the Properties
	// panel.
	//
	// AND IT IS NOT DEFAULTED HERE, WHICH IS THE WHOLE POINT OF THIS NOTE.
	// It was, for about twenty minutes, and MEASURED IN THE WRITER'S VAULT
	// it threw their choice away: `longFields()` falls back to `synopsisKey`
	// only when the new array is ABSENT, and a default here is never absent
	// — the defaults are merged into every vault's settings on load. Their
	// `synopsisKey: "Description"` was overruled by a shipped `['synopsis']`
	// they had never chosen.
	//
	// (The paragraph that stood here explained why the default had to stay on
	// `synopsisKey` rather than move to the new array — a default is never
	// absent, so defaulting the successor would have overruled a writer who
	// had pointed the old key at their own `Description`. Both keys are gone
	// now: the array with the long-field set, this one with the chain.)
	// ── WHAT A DAY LOOKS LIKE, ONCE (writer, 2026-08-27) ──────────────
	// “I want them unified and the date format should be set in Organizer tab
	// settings.” Read by `dateText`, which is the ONLY place a date becomes
	// a string — the Modified column, the Created column and every date
	// property all go through it, so they cannot disagree.
	// 'human' · 'iso' · 'dmy' · 'mdy'. Anything else falls back to 'human'
	// rather than breaking: this is a string in a file a writer may hand-edit.
	//
	// NAMED FOR THE ORGANIZER, and not `dateFormat`, because that name is
	// SPOKEN FOR. `tests/tokens_test.js` asserts `!('dateFormat' in DEF)`
	// beside `readTimeWpm` and `powerlineCapStyle` — a family of “this is
	// deliberately not a setting” guards protecting the STATUS BAR's tokens
	// from format strings. That guard is about the bar's {date}; this is about
	// the Organizer's readings. Two different surfaces, and the scoped name
	// keeps the older decision intact instead of quietly overturning it.
	organizerDateFormat:      'human',
	// path -> one of WS_FOLDER_COLOURS' ids. Absent means as it was.
	folderColors:             {} as Record<string, string>,   // folder path -> colour id
	// HOW MANY STATES A MANUSCRIPT HAS, and what each one is called, looks
	// like and is coloured. Three is the default — Draft, Revise, Done (the
	// writer, 2026-09-18: "put only 3 flags as default", "I want Draft Revise
	// Done"; five until then); 0 turns flags off entirely
	// for a writer who does not think in stages, and the column, the chip and
	// the bar token go with them.
	//
	// TWO COLOURS EACH, because one is wrong half the time: a flag colour
	// chosen against a dark theme is invisible on a light one, and a writer
	// who works in both should not have to choose which half of their day the
	// flags work in.
	flagCount:                3,
	flags: [
		// SKETCH, not "Outline". The id stays `outline` for ever — it is what
		// is written against a path in the vault, and changing it would drop
		// the flag off every note carrying it. The LABEL is a setting, and a
		// setting is free to change: a vault that has never customised its
		// flags picks up the new word, and one that has keeps its own.
		//
		// It moved because the tab beside it is called Outliner now, and a
		// window with an Outliner tab whose rows can be flagged "Outline" is
		// one word meaning two things eight inches apart. That is the same
		// fault as a folder called Notes colliding with the goals' old
		// `### Notes` section, and it was worth a migration to fix there.
		//
		// THE ORDER IS THE RING'S, AND THE COUNT OFFERS THE FIRST N (the writer,
		// 2026-09-18: "put only 3 flags as default" — "I want Draft Revise
		// Done"): Draft, Revise, Done are a fresh install's three; Sketch and
		// Blocked join when the count is raised. Same order as WS_STATE_IDS.
		{ id: 'draft',   label: 'Draft',   shape: 'pennant', light: '#4b7bb5', dark: '#6f95c9' },
		{ id: 'revise',  label: 'Revise',  shape: 'swallow', light: '#b8453c', dark: '#cf5b52' },
		{ id: 'done',    label: 'Done',    shape: 'banner',  light: '#3f8a53', dark: '#5aa96c' },
		{ id: 'outline', label: 'Sketch', shape: 'hollow',  light: '#7b818c', dark: '#8a8f98' },
		{ id: 'blocked', label: 'Blocked', shape: 'alert',   light: '#c08a2a', dark: '#d9a441' }
	],
	// TOMBSTONE: `hideStoreFiles` — took the plugin's own three notes out of
	// the file tree. Removed 2026-08-27, the writer's word: “we should not
	// hide them, let them be there.” The notes are the writer's, they are in
	// their vault, and a plugin hiding files it wrote is the plugin deciding
	// what a writer may see of their own work. A stale `true` left in an old
	// data.json is inert — nothing reads the key and the rule that acted on
	// it is gone from the stylesheet.
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
	// AND WHICH NAMES (A330): the shipped presets seeded so far, so a preset
	// added in a later release reaches a vault seeded before it, and one the
	// writer deleted does not come back.
	barPresetsSeededNames:    [] as string[],

	// ── Writing history ──────────────────────────────────────────────────────
	// The first behavioural data this plugin has ever stored, so it is OFF
	// until asked for, and every value here is AUTHORED — none of it came from
	// the donor vault the rest of the 1.25 defaults were taken from. Shipping
	// the maintainer's own writing history as everyone's day one would be
	// absurd, and these keys join zenMode/fullscreen/scopePaths/fileGoals on
	// the list of things a donor snapshot must never supply.
	//
	// None of these are BAR_KEYS. A bar preset must not carry a writing
	// history any more than it carries someone's word targets.
	historyTracking:          false,
	// (The daily-goal setting stood here. The goal line was retired at the
	// writer's word, 2026-08-28: "remove the goal line", chosen from two
	// costed readings. A vault carrying the key keeps an inert number —
	// nothing reads it, and 1.3.9 has never shipped, so no migration is
	// owed for it.
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
	// APPENDED (A331): the indices before it are burned into share codes.
	'barTokenIcons',
	// APPENDED (A454): the bar in the interface font.
	'statusBarUiFont'
];

// The keys above that no longer DO anything.
//
// Every one belonged to a feature that was removed. None can be deleted from
// BAR_KEYS: a share code stores each field as its INDEX into that array, so
// removing one renumbers every field after it and silently reinterprets every
// code anyone has already posted. They keep their slots, they keep their
// DEFAULT_SETTINGS values (barShareFields emits only what differs from the
// default, so sitting on it is what keeps new codes quiet about them), and
// nothing reads them.
//
// ONE list, rather than a comment at each site. It was three comments in
// three places by the time there were three families of these, each preset
// had to be hand-stripped of them, and the fourth family would have been a
// comment somebody forgot to write. Everything that WRITES a preset or a
// share code now skips this set automatically; everything that reads BAR_KEYS
// for its indices still walks the full array.
//
// To retire another key: add it here, remove its reads, and leave the array
// alone. To bring one back: take it out of here. Nothing else changes.
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
]);

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
	const base = wsBag(DEFAULT_SETTINGS);
	for (const k of BAR_KEYS) {
		out[k] = barCloneValue(
			Object.prototype.hasOwnProperty.call(preset || {}, k)
				? preset[k] : base[k]);
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipped presets
// ─────────────────────────────────────────────────────────────────────────────
// FULL snapshots, not sparse. The two here were exported from a working
// vault's data.json rather than written by hand, so each states all 58
// BAR_KEYS explicitly. barPresetWithDefaults still fills gaps for anything
// LOADED from elsewhere (an older saved preset, a share code); these simply
// have none.
//
// The inert keys are absent, and no longer by hand: saveBarPreset writes
// BAR_KEYS_LIVE, so a preset re-baked from a vault export comes out already
// stripped. Strip them if you paste one in from an older export.
//
// Plain is what a brand-new vault comes up with (see loadSettings). Renaming
// it, or removing it, changes the opening bar — the seeding below is keyed by
// name and so is that lookup.
//
// Re-exported from the same vault at 1.2.1, so both now exercise the grammar
// this release added: Code opens on :b4 and carries ;6 ink and a three-step
// fade ({ggg}>{gg}>{g}), Plain sets both button labels to the word form and
// wears the menu's icons on its seven buttons over a hairline rule (A454: the
// writer's own share code, "make this the default bar"). If a
// future change breaks one of those, a fresh install shows it on first run.
//
// Seeded into the library once (see barPresetsSeeded), never re-seeded, so a
// deleted one stays deleted.
export const DEFAULT_BAR_PRESETS = {
	"Plain": {
		"statusBarRows": 1,
		"statusRows": [{"left":":: {file}::{#>}","center":"","right":"{powermenu}::{words} words ::"},{"left":"","center":"","right":""},{"left":"","center":"","right":""}],
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
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": false,
		"barRuleDarkTopColor": "#fbfaf9",
		"barRuleDarkBottomColor": "#fbfaf9",
		"barRuleLightTopColor": "#16181d",
		"barRuleLightBottomColor": "#16181d",
		"fontTokenFormat": "word",
		"markersTokenFormat": "word",
		"barTokenIcons": {"modes":"icon","report":"icon","history":"icon","export":"icon","organizer":"icon","syntax":"icon","prose":"icon","powermenu":"icon"},
		"statusBarUiFont": false,
	},
	"Code": {
		"statusBarRows": 1,
		"statusRows": [{"left":":b4{obsidian}:b2;f|{vim}|{ln:col}:6|{file}:b2>{#>}:b1>{ggg}>{gg}>{g}","center":"","right":"{powermenu}:b3\\ {markers}\\{words}:b2w::{chars}ch\\{tasks}:6\\{clock}{time}:5"},{"left":"","center":"","right":""},{"left":"","center":"","right":""}],
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
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": false,
		"barRuleDarkTopColor": "#fbfaf9",
		"barRuleDarkBottomColor": "#fbfaf9",
		"barRuleLightTopColor": "#16181d",
		"barRuleLightBottomColor": "#16181d",
		"fontTokenFormat": "glyph",
		"markersTokenFormat": "glyph",
		"barTokenIcons": {},
		"statusBarUiFont": false,
	},
	// ── TWO MORE, DIFFERENT FROM THE TWO (A330, writer 2026-09-12: “add 2
	// more presets for the powerline one with gradients, and one with
	// whatever. make them different with what we have. so we ship 4 default
	// presets”). FADE is built on the {g} runs — three fades a row, a warm
	// seven-colour palette, mode colours on, no rules, the glyph tokens. INK
	// is the opposite: no bands at all, thin marks between readings, one
	// hairline on top, the note’s own font, lower-case Vim labels, greys.
	// Both state every live key, as the probe demands of a shipped preset.
	"Fade": {
		"statusBarRows": 1,
		"statusRows": [{"left":":1 | {gg}{gg}{gg}{gg}{gg}{gg}{gg} | {file}:2 > {ggg}>{ggg}>{ggg}>{ggg}>","center":"","right":"{gg}{gg}{gg}{gg}{gg}{gg}{gg} | {flag}:f ~ {tasks}:4 ~ {words}:5 words ~ {readtime}:6 | {gg}{gg}{gg}{gg}{gg}{gg}{gg}"},{"left":"","center":"","right":""},{"left":"","center":"","right":""}],
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
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": false,
		"barRuleDarkTopColor": "#fbfaf9",
		"barRuleDarkBottomColor": "#fbfaf9",
		"barRuleLightTopColor": "#16181d",
		"barRuleLightBottomColor": "#16181d",
		"fontTokenFormat": "glyph",
		"markersTokenFormat": "glyph",
		"barTokenIcons": {},
		"statusBarUiFont": false,
	},
};

// (WS_INK_RETIRED stood here: the shipped Ink's snapshot, kept so loadSettings
// could take an UNEDITED copy out of a vault. It never matched — the token
// migrations had rewritten every vault's rows — so the sweep goes by the seeded
// names now (loadSettings), and the literal went with it, 2026-09-18.)

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────
