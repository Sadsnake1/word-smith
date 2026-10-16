// Word-Smith — the settings schema.
//
// THE DEFAULTS ARE THE SCHEMA. `DEFAULT_SETTINGS` (preamble.ts) holds every
// key with its default, and every writer's data.json is that object with the
// file's values over it — so `typeof DEFAULT_SETTINGS` IS the type of
// `plugin.settings`, key by key, kind by kind. A default whose literal says
// nothing about its kind (`[]`, `{}`, `null`) says it there with an `as`.
//
// Two kinds of key are not in the defaults, and are said here instead:
//
//   LAZY   made on first use, absent until then — the export options, the
//          bar's cursor stash, a column list the Organizer builds when a
//          writer adds one. Optional, typed.
//   LEGACY keys an old data.json may carry that `loadSettings` reads from the
//          RAW file and deletes from the merged object on load. Typed `never`:
//          `delete this.settings.<key>` compiles, and no code can read a member
//          of one — a migration reads `raw`, which is `any`, on purpose.
//
// A key a migration renamed or reshaped costs a row in LEGACY and a migration
// keyed on `raw.<key> === undefined`, so it decides exactly once; a key made
// on first use costs a row in LAZY. Nothing else declares a settings key.
import type { DEFAULT_SETTINGS } from './preamble';
import type { ItemView, KeymapEventListener, Modal, Modifier, TAbstractFile } from 'obsidian';

/**
 * The export panel's options, made on first use (`exportOptionDefaults`) and
 * kept under `settings.exportOpts`. Every key is declared, so a control is
 * built for a key of its own kind: `WsExportBoolKey` for a switch,
 * `WsExportStringKey` for a text row or a select.
 */
export interface WsExportOpts {
	// switches
	titlePage?: boolean; pageBreaks?: boolean; a4?: boolean; starBetween?: boolean; folderHeadings?: boolean;
	dashPageBreak?: boolean;
	keepFrontmatter?: boolean; keepComments?: boolean; keepCallouts?: boolean; keepTags?: boolean;
	keepHeadings?: boolean; wordCountOnTitle?: boolean; roundWordCount?: boolean; pageNumbers?: boolean;
	indent?: boolean; footnotes?: boolean; highlights?: boolean; smartQuotes?: boolean; justify?: boolean;
	doubleSpaced?: boolean; toc?: boolean; runningHeaderOn?: boolean; sectionTitles?: boolean; previewDark?: boolean;
	/** page numbers beside the contents' entries (A751) */
	/** (A751's contents page numbers switch: the contents always carry them now; deleted on load) */
	tocPages?: never;
	/** the headings in the middle of the line (#76), on by default; off, at the start like the text */
	centerHeads?: boolean;
	/** an empty line after every paragraph, indented or not (A756) */
	/** read once into `paraSpacing` and deleted on load (A834); a run may still carry it */
	paraBlank?: boolean;
	/** the space between paragraphs: 'auto', 'half', 'line' or 'note' (Your blank lines), `wsParaSpacing` */
	paraSpacing?: string;
	/** (#77's dropdown, never released: Keep line breaks since the writer's "in dont like this dropdown"; deleted on load) */
	paraStart?: never;
	/** KEEP LINE BREAKS (#77): every line a paragraph, a blank line kept as an empty one, the paragraph after it flush */
	keepLineBreaks?: boolean;
	/** the structure's numbers, from the file tree (#79): 'none', 'decimal' 1.1.2, 'decimalDot' 1.1.2., 'outline' I. A. 1.,
	 * 'chapter' Chapter 1 and Part I (`wsNumberStyle`) */
	numberStyle?: string;
	/** the first paragraph under a heading indented too, as French books set it */
	indentAfterHeads?: boolean;
	/** every blank line an empty line, the first between two paragraphs too, for notes written a paragraph a line (A851) */
	keepBlankLines?: boolean;
	/** the first line's indent, a size with its unit, '0.5in' or '1.25cm' (`WS_INDENT_SIZES`; half an inch by default) */
	indentSize?: string;
	// words
	author?: string; titleText?: string; subtitleText?: string; lastScope?: string; outFolder?: string; font?: string; divider?: string;
	format?: string; footnotePlace?: string; joinMode?: string; lineSpacing?: string; paperId?: string; listColumn?: string;
	/** A751: the running header's own words, where the page number goes, the contents' title */
	headerText?: string; pageNumberAt?: string; tocTitle?: string;
	/** #81: the header on the left (off, the right); your contact lines, for the title page's corner and the header's tokens */
	headerLeft?: boolean; address?: string; phone?: string; email?: string; contactOnTitle?: boolean;
	/** the language the book is written in (the pack in use), its direction with it (A846) */
	lang?: string;
	// numbers
	pt?: number;
	/** the last export, remembered so the panel can offer it again */
	lastRun?: { scope: string; format: string; into: string; files: number; name: string; at: number };
}
// the keys of T whose value is a V: an optional key counts, a retired one
// (`?: never`, which reads as `undefined` alone) does not
type KeysOf<T, V> = { [K in keyof T]-?: [Exclude<T[K], undefined>] extends [never] ? never : (Exclude<T[K], undefined> extends V ? K : never) }[keyof T];
// What the file menu is built for: a vault file or folder, or a row's own shape when
// its note is gone from the vault (`outlinerRowMenu`).
export type WsFileLike = { path: string; children?: TAbstractFile[] };
// What the Organizer hands a row's menu: how to say a result, reveal the row,
// report on a note, rename one (`orgMenuCtx`).
export interface WsOrgMenuCtx { said?: (msg: string, bad: boolean) => void; reveal?: () => void; report?: (item: TAbstractFile) => void; opens?: boolean; rename?: (item: { path: string; kind: string }) => void }
// The ticks' door on a window: whether the tree wants them, a row's state, a toggle.
export interface WsTicksDoor { wanted: () => boolean; state: (path: string | null, kind: string) => { mine: number; all: boolean; some: boolean } | null; toggle: (path: string | null, kind: string) => boolean }
// An open Organizer window as the tree's right-click, the menus and the ticks
// reach it (`orgWindowAdd`): which host it is, the tab it shows, its doors.
export interface WsOrgDoor {
	kind: 'modal' | 'leaf';
	select: (p: string) => void; follow: (p: string) => void;
	tab: () => string; single: () => boolean; tabSet: (id: string) => boolean;
	host: () => WsHost; ticks: WsTicksDoor; ticksOnly: (paths: string[]) => Promise<boolean>;
}
// The window's host: the modal it opens in, or the leaf that is the pane
// (`modalHost`, `leafHost`). One shape, so the window never asks which.
export interface WsHost {
	kind: 'modal' | 'leaf';
	modal?: Modal; view?: ItemView;
	rootEl: HTMLElement; contentEl: HTMLElement; containerEl?: HTMLElement;
	closes: boolean; paneClass?: string;
	key: (mods: Modifier[], k: string, fn: KeymapEventListener) => unknown;
	contains: (el: Node | null | undefined) => boolean;
	onClose: (fn: () => void) => void;
	show: () => void;
	blockClose?: (test: () => boolean) => void;
	teardown?: () => void;
	handle: () => Modal | ItemView;
}
// What the report counts of a note or a folder (`analyzeText`, `analyzeFolder`).
export interface WsTextStats {
	words: number; chars: number; charsNoSpaces: number; charsWithSpaces: number; syllables: number; sentences: number;
	paragraphs: number; lines: number; pages: number; grade: number;
	/** a pack's reading sums (A571), what its grade is made of; a folder adds them up */
	read?: Record<string, number>;
	files?: number; tasksDone?: number; tasksAll?: number; tasks?: { done: number; all: number } | null; totalWC?: number; charCount?: number;
}
// What the builders receive: the window's options plus what `exportOptsFor`
// derives at the moment of compiling — the title, the count, the header line.
/** a picture ready to travel (A568), read before the build: one per reference as written */
export interface WsImage { name: string; alt: string; width: number | null; ext: string; mime: string; src: string; bytes: Uint8Array<ArrayBuffer> | null; w: number; h: number }
/** what a build carries beside the options: the pictures of the note being walked, and the .docx's figure writer */
/** …and the numbering of footnote markers, one call per marker: a number for one whose note is defined, null for one that is not */
export interface WsExportBuild { imgs?: Map<string, WsImage> | null; docxFigure?: ((img: WsImage) => string[]) | null; noteRef?: ((label: string) => { n: number; end: boolean } | null) | null }
export interface WsExportRun extends WsExportOpts, WsExportBuild { title?: string; wordCount?: number; runningHeader?: string;
	/** the page each contents entry lands on, measured before a paged file is written (A751) */
	tocPageOf?: Record<string, number> }
// One section of a compiled book: a folder heading, or a note with its text.
export interface WsExportSection { title: string; markdown: string; path: string; depth: number; folder?: boolean; images?: Map<string, WsImage>;
	/** the book's own folder (A848): its heading in the text, never in the contents */
	book?: boolean;
	/** its folders under the export's root, a folder's own chain, a file's folder's: whether they print or not (#79's numbers) */
	dirs?: string[];
	/** the list of sources at the back (A572 step 4): its heading the title, one entry a source */
	bib?: boolean; entries?: string[] }
export type WsExportBoolKey = KeysOf<WsExportOpts, boolean>;
export type WsExportStringKey = KeysOf<WsExportOpts, string>;

/** a manuscript state, as `flagDefs` repairs it from what a vault stored */
export interface WsFlagDef { id: string; label: string; shape?: string; light?: string; dark?: string }

/** the history record as 1.28 and earlier kept it in data.json; moved to its own file once, on load */
export interface WsLegacyHistory { days?: Record<string, { a: number; r: number; n: number }>; started?: string; fileCounts?: Record<string, number> }

/** a column the writer added to the Organizer's table */
export interface WsUserCol { key: string; label: string; sortAs: string; type?: string; fresh?: boolean; w?: number }

// A row of the Powermenu (menuRowSpecs, and a pinned command resolved to the
// same shape): a drawer of items, a toggle, or a run; `wide` centres it,
// `reopen` brings the menu back after it, `count` false hides the drawer's
// count, `keywords` and `full` feed the finder.
export interface WsMenuRowSpec {
	id: string;
	// a word, or (the light/dark toggle) the word for the moment
	label: string | (() => string);
	items?: () => WsMenuPickItem[];
	count?: boolean;
	keywords?: string;
	full?: string;
	toggle?: () => unknown;
	wide?: boolean;
	reopen?: boolean;
	// a run may hand back the panel it opened; its close doors are wrapped
	// so the menu comes back after it (`reopen`)
	run?: () => WsOpenedPanel | void | Promise<unknown>;
}
export interface WsOpenedPanel { onClose?: () => void; close?: () => unknown }
// Two doors the desktop's `require` answers (global.d.ts): Electron's window,
// asked to set the title-bar overlay, and the Vim adapter's api — a
// duck-typed thing every route is asked for, narrowed once by `wsVimOf`.
export interface WsElectronWindow { setTitleBarOverlay?(overlay: Record<string, unknown>): void }
export interface WsVimApi { map(from: string, to: string, mode: string): void; unmap(from: string, mode: string): void }

// The Organizer's table context: the bag the twenty-two factories lend their

// What this plugin reads of Cursor-Smith's settings, when it is installed: the
// caret's colours, per Vim mode and global, and whether Vim theming is on.
export interface WsCursorSmithLook { colorDark?: string; colorLight?: string; [extra: string]: unknown }
export interface WsCursorSmithSettings extends WsCursorSmithLook { vimModeEnabled?: boolean; vimModes?: Record<string, WsCursorSmithLook | undefined>; [extra: string]: unknown }
// Cursor-Smith as the plugin registry holds it: its settings, its save, and the
// flag its own settings tab sets while it swaps them
export interface WsCursorSmithPlugin { settings?: WsCursorSmithSettings; look?: WsCursorSmithLook; saveSettings?: () => Promise<void>; _settingsSwapped?: boolean;
	// its preset library (Cursor-Smith 1.7): the names, loading one, and the name it
	// last loaded (in memory only; unknown after a restart)
	getUserPresets?: () => Record<string, unknown>; loadUserPreset?: (name: string) => Promise<void>;
	refreshSettingTab?: () => void; _activePresetName?: string; _pendingPresetName?: string;
	[extra: string]: unknown }
// One item of a drawer: its label, whether it is on, what a tap does, and
// (some) an icon, a key or id, a note for the tooltip.
export interface WsMenuPickItem {
	label: string;
	// a row whose words and glyph follow its state, redrawn on the list's every refresh (A628)
	labelOf?: () => string;
	iconOf?: () => Element;
	on?: boolean | (() => boolean);
	onClick?: () => unknown;
	icon?: () => Element;
	key?: string;
	id?: string;
	note?: string;
	// the theme and font drawers: a swatch and the face the label is set in
	color?: string;
	// the swatch's shape when it is not a ball: a scheme is a square, a prose
	// check the thick line it underlines with
	shape?: 'square' | 'line';
	font?: string;
	// the modes picker: a row that hangs under the one above it
	sub?: boolean;
}

export interface WsLazySettings {
	exportOpts?: WsExportOpts;
	barThemeCursorStash?: { 'global': Record<string, { had: boolean; v?: unknown }>; vim?: Record<string, Record<string, { had: boolean; v?: unknown }>> } | null;
	barThemeCursorDressed?: boolean;
	uniUserCols?: WsUserCol[];
	organizerOpen?: string[];
	oldInstallerSaid?: number;
	uniColPx?: Record<string, number>;
	flags?: WsFlagDef[];
	// the Organizer's own: the readings switched off, the saved lens, the shape shown
	uniColsOff?: string[];
	uniLens?: Record<string, unknown>;
	uniShow?: 'all' | 'files' | 'folders';
	// the row numbers, on from the table's menu (found by the typed context:
	// read and written for a year with no row here)
	uniRowNumbers?: boolean;
	// `organizerMode` (which of two views was up, before the outline went)
	// is a dead key, deleted on load, typed with the others below.
}

export interface WsLegacySettings {
	barThemeMarginalia?: never; marginaliaGutter?: never; typewriterLinesAbove?: never; typewriterLinesBelow?: never;
	letterboxRatio?: never; statusFormatText?: never; statusFormatLeft?: never; statusFormatCenter?: never;
	statusFormatRight?: never; wpmWindowSec?: never; statusBarPadding?: never; hemFlashOnBlock?: never;
	proseSkipCode?: never; uniCols?: never; folderGoals?: never; goalUnit?: never; goalTokenFormat?: never; targetTokenFollows?: never; markNbsp?: never; markInvisible?: never; markOther?: never; goalCelebrate?: never; goalMetSeen?: never; typoQuoteSpace?: never; wpmTokenUnit?: never; orgDeadlineShow?: never; uniColCh?: never; exportTicksAlways?: never;
	manuscriptRoots?: never; organizerRoot?: never; uniRootShut?: never; organizerRootShut?: never;
	uniTreeWidth?: never; uniShut?: never; fileTreeGoals?: never; goalsFile?: never; goalBaseline?: never;
	goalRingWeight?: never; goalOrientation?: never; goalLenWriting?: never; goalLenFile?: never;
	goalLenFolder?: never; organizerOutlineProps?: never; synopsisKey?: never;
	organizerOutlineProp?: never; organizerOutlineReads?: never; organizerLongFields?: never;
	organizerNameColPx?: never; folderStatus?: never; uniScope?: never; uniBoard?: never; uniBoardTags?: never;
	uniNameCh?: never; powerlineText5?: never; powerlineText6?: never; goalShapeLabel?: never;
	goalRingPercent?: never; goalDisplay?: never; goalLabel?: never; statusBarBorder?: never; goalBarCells?: never;
	restoreCursorPosition?: never; cursorMemory?: never; _lastArrowCount?: never; exitButtonVisibility?: never;
	autoHideButtonOnDesktop?: never; topPadding?: never; bottomPadding?: never;
	// the one legacy key read from the merged object, by the history store's own move
	historyData?: WsLegacyHistory;
	orgLenses?: never; uniSlimCol?: never; organizerView?: never; organizerDrawer?: never; organizerMode?: never;
	// one unreleased day's light pick; deleted on load
	barThemeLight?: never;
	// retired in 1.6.8 (A508), read by nothing: WS_RETIRED_KEYS, deleted on load
	statusBarRows?: never; powerlineSepWidth?: never; powerlineEnabled?: never;
	powerlineText1?: never; powerlineText2?: never; powerlineText3?: never; powerlineText4?: never;
	powerlineTextLight1?: never; powerlineTextLight2?: never; powerlineTextLight3?: never; powerlineTextLight4?: never;
	retroCustomColors?: never; retroDarkBgColor?: never; retroDarkTextColor?: never;
	retroLightBgColor?: never; retroLightTextColor?: never; goalTarget?: never; goalLabelMode?: never;
	// the Letter Box's own width (A672): the band is the words', its sides the text's margins
	maskMatchText?: never; maskMatchTextPadded?: never; maskPaddingH?: never;
	// the markers' second switch, which only the bar's picker could see
	showHiddenMarkers?: never;
}

export type WordSmithSettings = typeof DEFAULT_SETTINGS & WsLazySettings & WsLegacySettings;
// THE FILE AS READ (`loadData`, a pasted settings text): every key the
// schema names, each an unknown — a migration reads a key and decides,
// which is what it always did; it never trusted the shape.
export type WsRawSettings = { [K in keyof WordSmithSettings]?: unknown } & Record<string, unknown>;
// the keys of the settings by the kind of value they hold: a switch, a word, a number
export type WsBoolKey = KeysOf<WordSmithSettings, boolean>;
export type WsStringKey = KeysOf<WordSmithSettings, string>;
export type WsNumberKey = KeysOf<WordSmithSettings, number>;
// one row of the structure store: a path, whether it is ticked, and a note beside it
export interface WsStructRow { path: string; on?: boolean; note?: string }
