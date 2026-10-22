// Word-Smith — plugin: the class's lifecycle, its settings and their
// migrations, the scope, the ribbon. The areas' methods are in their own
// modules (see the class top).

import { Plugin, MarkdownView, TFile, Menu, Modal, Notice, setIcon, Platform, addIcon, editorInfoField } from 'obsidian';
import { WsWelcomeModal } from './welcome';
import { wsT } from '../core/ui-text';
import type { Command, Events, WorkspaceSidedock, WorkspaceMobileDrawer, WorkspaceLeaf, TAbstractFile } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { Text as CmText } from '@codemirror/state';
import type { WordSmithSettings, WsTextStats, WsBoolKey, WsNumberKey, WsStructRow, WsOrgDoor, WsOrgMenuCtx, WsRawSettings } from '../core/settings';
import { wsCompat } from '../core/obsidian-internals';
import {
	type WsOrgIndexMap,
} from '../organizer/org-index';
import { WsLensSort, WsLensChip } from '../organizer/organizer-lens';
import type { WsOrgCtx } from '../organizer/org-ctx';
import type { WsOrgCol } from '../organizer/organizer-cols';
import type { Extension } from '@codemirror/state';
import {
	BAR_KEYS_INERT,
	DEFAULT_BAR_PRESETS,
	DEFAULT_SETTINGS,
	WS_RETIRED_KEYS,
	WS_ICON,
	WS_ICON_SVG,
	WS_MENU_VIEW,
	WS_RIBBON_TITLE,
	WS_SESSION_KEYS,
	WS_WRITE,
	WsOutlinerView,
	barCloneValue,
	wsCatch,
	wsForDisk,
	wsGuard,
	wsGuardTell,
	wsRepairSettings,
	wsBag,
	wsStr,
	wsErrMsg,
	wsIsFolder,
	wsElOf,
} from '../core/preamble';
import type { WsSession, WsGoalPlan } from '../core/preamble';
import { WordSmithSettingTab, WsPrompt } from './settings-tab';
import { wsIsPackPath } from '../core/language';
import type { WsPack } from '../core/language';
import type { WsRef } from '../core/citations';
import { diagnosticsMethods } from './diagnostics';
import type { DiagnosticsMethods } from './diagnostics';
import { paintMethods } from './paint';
import type { PaintMethods } from './paint';
import { editorMethods } from '../editor/editor';
import type { EditorMethods } from '../editor/editor';
import { focusMethods } from './focus';
import type { FocusMethods } from './focus';
import { treeMethods } from './tree';
import type { TreeMethods } from './tree';
import { organizerWindowMethods } from '../organizer/organizer-window';
import type { OrganizerWindowMethods } from '../organizer/organizer-window';
import { reportMethods } from './report';
import type { ReportMethods } from './report';
import { barMethods } from './bar';
import type { BarMethods } from './bar';
import { menuMethods } from './menu';
import type { MenuMethods } from './menu';
import { storesMethods } from './stores';
import type { StoresMethods } from './stores';
import { themesMethods } from './themes';
import type { ThemesMethods } from './themes';
import { exportMethods } from './export';
import type { ExportMethods } from './export';
import { historyMethods } from './history';
import type { HistoryMethods } from './history';
import type { WsCm5Facade } from '../core/obsidian-private';

// THE HISTORY RECORD as the store holds it: the days by date, the paths' totals,
// and today's tally — added, removed, net, with the words by note. Step 4
// names the shape the fields carried inline; the day and path maps are still
// wide.
// one tally: words added, removed, net
export interface WsHistoryTally { a: number; r: number; n: number }
// the History tab's state between paints: the period shown, the scope, the search
// A note the structure store was found in: its path, whether it is the legacy
// spelling, its mtime and its text (`structureSources`).
export interface WsStructSource { path: string; legacy: boolean; mtime: number; text: string }
// An event with modifier keys, as a mouse and a keyboard event both carry them.
export interface WsModEvent extends Event { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }
export interface WsHistoryTabState { rerender?: () => void; scope: string | string[]; query: string; shiftPeriod: ((dir: number) => void) | null; year: number; month: number; hideScope?: boolean }
// What the window hands the Export tab's panel (`orgDrawExport`): its panel,
// the tab up, the ticks and their doors, the draws, the scope, the options
// handle it writes back.
export interface WsOrgExportCtx {
	panel: HTMLElement; tab: () => string;
	ticks: () => Set<string> | null; tickAll: (on: boolean) => void;
	drawPanel: () => void;
	exportFiles: () => TFile[]; exportScope: () => string; exportScopes: () => string[] | null;
	loadTicks: () => Promise<unknown>; setExportOpts: (o: WsExportPanelHandle | null) => void;
}
// The export options panel as built (`buildExportOptions`): its element, a
// redraw, a refresh of the figures, a jump to a section.
export interface WsExportPanelHandle { el: HTMLDivElement; redraw: () => void; refresh: () => void; jumpTo: (path: string) => boolean }
// …and the History tab's: its panel, the tab, a redraw, the state it keeps.
export interface WsOrgHistoryCtx { panel: HTMLElement; tab: () => string; drawPanel: () => void; histState: WsHistoryTabState }
// one bar of the chart: a day, a week or a month, with what it tallies
export interface WsHistoryBucket { key: string; label: string; a: number; r: number; n: number; days: number; title?: string; isNow?: boolean; readout?: string }
// what a settings paste (or its undo) answers: a refusal, or the count applied
// and the keys the repair reset
export type WsSettingsPasted = { error: string; applied?: undefined; repaired?: undefined } | { error?: undefined; applied: number; repaired: string[] };

export interface WsHistoryRecord {
	started: string | null;
	days: Record<string, WsHistoryTally>;
	paths: Record<string, Record<string, WsHistoryTally>>;
	today: { date: string; a: number; r: number; n: number; by: Record<string, WsHistoryTally> };
}

// ── THE INK'S PARTICLES (the screensaver, `drawInk`) ─────────────────
// A drop is thrown water: where, how fast, how old, its colour and size and
// the glyph it is drawn as; `shed` once it has left the surface, `pull`
// when the surface draws it back. A bubble rises with a wobble. A wave is a
// travelling swell: its birth, amplitude, width, speed, the hollow behind
// it and the spray it throws; `broke` once. The orb is the jar's ball.
export interface WsInkDrop { x: number; y: number; vx: number; vy: number; life: number; shed?: boolean; pull?: boolean; hue: number; size: number; shape: number }
export interface WsInkBubble { x: number; y: number; size: number; rise: number; phase: number; wob: number; hue: number }
export interface WsInkWave { x: number; dir: number; born: number; amp: number; wid: number; spd: number; hollow: number; spray: number; hue: number; broke: boolean }
export interface WsInkOrb { amount: number; want: number; x: number; y: number; spin: number; vel: number; last: number; vy: number; dropping: boolean; falling: boolean; streak?: number }

// THE FIELDS A FRESH LOAD STARTS FROM: every handle, timer, cache and latch
// the plugin keeps, set to its empty value (lifted out of onload, A488).
function wsFieldsReset(plugin: WordSmith) {
	plugin.maskTopEl        = null;
	plugin.maskBottomEl     = null;
	plugin.arrowsTopEl      = null;
	plugin.arrowsBottomEl   = null;
	plugin.maskResizeObserver = null;
	plugin._maskRaf         = null;

	// ── Retro bar state ───────────────────────────────────────────────────
	plugin.retroStatusBarEl = null;
	// Peek state for a hidden bar (see syncBarPeekState).
	plugin._peekArmed    = false;
	plugin._peekZoneTop  = Infinity;
	plugin._barPeek      = false;
	plugin._barPeekTimer = null;
	plugin._barBoxHeight = 0;
	plugin.retroPlinthEl = null;
	plugin.clockInterval    = null;
	plugin._wpm = null; plugin._wpmTimer = null; plugin._wpmWanted = false; plugin._wpmDayDirty = false;
	plugin._dailyWordsTimer = null; plugin._dailyWordsWeighing = null;
	plugin.batteryLevel     = null;
	plugin.batteryCharging  = false;
	plugin._batteryManager  = null;   // kept so listeners can be detached on unload
	plugin._batteryHandler  = null;
	plugin._wsLastTotalWordCount = 0;
	plugin._docStatsCache   = null;   // { doc, totalWC, charCount, paras } keyed on CM doc identity
	plugin._capsLockOn      = false;  // tracked from keyboard events for {caps}
	plugin._numLockOn       = false;  // tracked from keyboard events for {nump}
	plugin._statusRowEls    = [];     // per-row elements, for per-row text fitting
	plugin._fenceCache      = null;   // { doc, set } of non-prose line numbers
	plugin._paraCache       = null;   // { doc, val } paragraph geometry
	plugin._lastTypo        = null;   // last typography substitution, for backspace-to-revert
	plugin._barPicker       = null;   // open bar popup, if any
	plugin._backupLast = null; plugin._backupTried = null; plugin._ownFolders = null; plugin._ownMarked = null; plugin._ownExcludeTimer = null;
	plugin._goalNowState = null;
	plugin._goalFolderCounts = null; plugin._goalFolderBusy = false;
	plugin._goalPanel = null; plugin._goalPanelOff = null;
	plugin._dailyPanel = null; plugin._dailyPanelOff = null; plugin._dailyLive = null; plugin._twPressed = false;
	plugin._barPickerDismiss = null;
	plugin._barPickerFrames = null;
	plugin._barPickerKey    = (e) => { if (e.key === 'Escape') plugin.closeBarPicker(); };
	plugin._vimMapped       = false;  // whether our vim motion maps are installed
	plugin._fmCache         = {};     // path -> frontmatter overrides
	plugin._hemFlashTimer   = null;   // clears the blocked-key flash class
	plugin._scopeGen        = 0;      // bumped on file/layout change; keys the per-editor scope cache
	plugin._lastScopeInScope = null;  // last known scope state of the active file
	plugin._lastPaneScope   = null;   // 'any:anyTw' of the panes on screen, as last stamped
	plugin._lastNoteKeys    = null;   // what the open notes' own keys add up to, as last applied (A862)

	// ── Scroll / resize handlers ──────────────────────────────────────────
	plugin.currentScroller  = null;
	plugin.scrollHandler    = null;
	plugin.windowResizeHandler = null;

	// ── Paragraph tagger ──────────────────────────────────────────────────

	// ── Style injection ───────────────────────────────────────────────────

	// ── Word count cache ──────────────────────────────────────────────────
	plugin.explorerObserver = null;
	plugin.wordCountCache   = new Map();
	plugin._patchScheduled  = false;

	// ── Zen state ─────────────────────────────────────────────────────────
	plugin._isTogglingZen   = false;
	plugin._wasZenMode      = false;
	plugin._tabContainersCache = null;

	// ── Surface gate ──────────────────────────────────────────────────────
	// Whether zen's sidebar collapse is currently suspended because the
	// active pane is not a note, and what to put back when it is again.
	plugin._sidebarsSuspended = false;
	plugin._suspendedLeft     = false;
	plugin._suspendedRight    = false;
	// Last value written to --ws-bar-reserve, so the mask pass (which
	// runs on scroll) only touches :root when the strip actually
	// changes depth.
	plugin._barReserve        = null;

	// ── Drag / refresh bookkeeping ────────────────────────────────────────
	plugin._activeDragCleanup = null;   // aborts an in-flight mask drag on unload
	plugin._refreshTimer      = null;   // debounced saveSettings → refresh

	// ── Live selection rAF ────────────────────────────────────────────────
	plugin._selectionRaf    = null;

	// ── The Typewriter's frame and the editor that asked (A506) ──
	plugin._twFrame         = null;
	plugin._twView          = null;
	plugin._twIdle          = null;
	plugin._twIdleView      = null;

	// ── The docked menu's revival: one pass in flight at a time ──
	plugin._reviving        = null;
	// ── The watch on Cursor-Smith’s caret canvas, for a token in its colour ──
	plugin._caretObs        = null;
	plugin._caretObsEl      = null;

	// ── Theme observer ────────────────────────────────────────────────────
	plugin._themeObserver   = null;
}

// THE COMMANDS: the palette's every entry, the feature toggles, the quick
// panels and the menu's arrows (lifted out of onload, A488).
export function wsRegisterCommands(plugin: WordSmith) {
	// THE DAILY TARGET, from the palette (PR #93, A879): the token's panel when the token is on the bar, else a prompt
	// for the words a day, 0 for none
	plugin.addCommand({
		id: 'set-daily-target',
		name: 'Set the daily target',
		callback: () => plugin.dailyTargetOpen()
	});
	plugin.addCommand({
		id: 'repair-display',
		name: 'Repair the display (draw everything again)',
		callback: () => { plugin.repairDisplay(); new Notice('Word-Smith: repaired.', 4000); }
	});
	plugin.addCommand({
		id: 'clean-up-order-file',
		name: 'Clean up the custom order file (entries for files that are gone)',
		callback: () => { void plugin.structureCleanUpSay(); }
	});
	plugin.addCommand({
		id: 'copy-settings',
		name: 'Copy your settings as text',
		callback: async () => {
			try { await navigator.clipboard.writeText(plugin.settingsCopyText()); new Notice('Word-Smith: settings copied.', 4000); }
			catch { new Notice('Word-Smith: could not reach the clipboard.', 6000); }
		}
	});
	plugin.addCommand({
		id: 'paste-settings',
		name: 'Paste settings from the clipboard (replaces everything; the settings can undo it)',
		callback: async () => {
			let text = '';
			try { text = await navigator.clipboard.readText(); } catch { new Notice('Word-Smith: could not read the clipboard.', 6000); return; }
			const r = await plugin.settingsPasteText(text);
			new Notice('Word-Smith: ' + (r.error !== undefined ? r.error : (r.applied + ' setting(s) pasted' + (r.repaired.length ? ', ' + r.repaired.length + ' reset' : '') + '.')), 8000);
		}
	});
	plugin.addCommand({
		id: 'copy-diagnostics',
		name: 'Copy diagnostics for a bug report',
		callback: async () => {
			// A PAUSE FIRST: on a phone this runs from the command palette, whose
			// search field has the keyboard up and the workspace shrunk. 1200ms is
			// inside the five seconds a user gesture keeps the clipboard open for.
			await new Promise((r) => window.setTimeout(r, 1200));
			try { await plugin.sheetSelfTest(); } catch (_) { wsCatch('onload / callback: await this.sheetSelfTest();', _); }
			let text = '';
			try { text = plugin.diagnostics(); }
			catch (e) { text = 'Word-Smith: diagnostics failed — ' + wsErrMsg(e); }
			try {
				await navigator.clipboard.writeText(text);
				new Notice('Word-Smith: diagnostics copied. Paste them into the '
					+ 'issue.', 6000);
			} catch {
				// THE CLIPBOARD CAN REFUSE — no permission, or no focus. The
				// console is the fallback and NOT the plan: a writer who
				// cannot open it has been told that much by the failure.
				try { console.warn(text); } catch (_e) { wsCatch('onload / callback: console.warn(text);', _e); }
				new Notice('Word-Smith: could not reach the clipboard — the '
					+ 'diagnostics are in the developer console instead.', 8000);
			}
		}
	});
	plugin.addCommand({
		id: 'open-export',
		name: 'Export a manuscript\u2026',
		callback: () => plugin.openExportModal()
	});
	plugin.addCommand({
		id: 'open-menu-panel',
		name: 'Open the menu in a panel',
		// ONLY WHILE THE PANEL IS ON (A504, the plugin guidelines: a command
		// that runs under a condition is a checkCallback): off, it is not
		// offered at all rather than offered and refused.
		checkCallback: (checking: boolean) => {
			if (!plugin.settings.menuDock) return false;
			if (!checking) void plugin.openMenuPanel(true);
			return true;
		}
	});
	plugin.addCommand({
		id: 'toggle-retro-bar',
		name: 'Toggle the Powerline bar',
		// Mirrors the settings-tab switch: flip the master, repaint, and
		// save with a full refresh — the refresh is what lifts/reapplies
		// the inline display:none on Obsidian's native status bar.
		// NOT ON A PHONE WITH ITS OWN SWITCH OFF (A504, the plugin guidelines:
		// a checkCallback): there it would flip a master that changes nothing
		// on this screen, so it is not offered.
		checkCallback: (checking: boolean) => {
			if (typeof Platform !== 'undefined' && Platform && Platform.isPhone
				&& !plugin.settings.retroBarOnPhone) return false;
			if (!checking) {
				plugin.settings.enableRetroStatus = !plugin.settings.enableRetroStatus;
				plugin.updateStatusBar();
				plugin.updateRetroStatusBar();
				void plugin.saveSettings(true);
			}
			return true;
		}
	});
	plugin.addCommand({
		id: 'toggle-wordsmith',
		name: 'Turn everything on or off',
		callback: () => plugin.toggleFullPlugin()
	});
	plugin.addCommand({
		id: 'cycle-bar-preset',
		name: 'Cycle Powerline presets',
		callback: () => plugin.cycleBarPreset(1)
	});

	// ── Feature toggles ───────────────────────────────────────────────
	// One shape for all of them: flip the master flag, save with an
	// immediate refresh so the change is on screen before the palette
	// has finished closing, and say which way it went. The Notice is
	// not decoration — several of these are invisible on a note that
	// happens not to trigger them (no passive voice, no long sentences),
	// and a toggle you cannot confirm reads as a toggle that did nothing.
	const featureToggle = (id: string, name: string, key: WsBoolKey, label: string) => {
		plugin.addCommand({
			id, name,
			callback: async () => {
				plugin.settings[key] = !plugin.settings[key];
				await plugin.saveSettings(true);
				new Notice('Word-Smith: ' + label + (plugin.settings[key] ? ' on.' : ' off.'));
			}
		});
	};
	featureToggle('toggle-letterbox', 'Toggle letter box mode',
		'enableLetterbox', 'Letter box mode');
	featureToggle('toggle-typewriter', 'Toggle typewriter mode',
		'enableTypewriter', 'Typewriter mode');
	featureToggle('toggle-hemingway', 'Toggle Hemingway mode',
		'hemingwayEnabled', 'Hemingway mode');
	featureToggle('toggle-syntax', 'Toggle syntax highlighting',
		'posEnabled', 'Syntax highlighting');
	featureToggle('toggle-prose-checks', 'Toggle prose checks',
		'checksEnabled', 'Prose checks');

	// PAGE MODE, FOR NOW: the same switch as the Modes picker's, over the
	// Layout toggle and never written into it (togglePageQuick).
	plugin.addCommand({
		id: 'toggle-page-view',
		name: 'Toggle page mode',
		callback: () => {
			const on = plugin.togglePageQuick();
			if (on !== null) new Notice('Word-Smith: Page mode' + (on ? ' on.' : ' off.'));
		}
	});

	// Zen is not a plain flag — it collapses sidebars, hides chrome and
	// records what to put back — so it routes through its own method
	// rather than being flipped here.
	plugin.addCommand({
		id: 'toggle-zen',
		name: 'Toggle zen mode',
		callback: () => plugin.toggleZen()
	});

	// The id is NOT renamed with the label. It is the key a user's
	// hotkey is bound to, and a hotkey that silently stops working is a
	// worse defect than the wrong noun in a palette.
	plugin.addCommand({
		id: 'open-report',
		name: 'Show the writing report',
		callback: () => plugin.openReportModal()
	});

	// Its own command, not a mode of the report's: they are two windows
	// now, and one of them works with no note open.
	plugin.addCommand({
		id: 'open-history',
		name: 'Show the writing history',
		callback: () => plugin.openHistoryModal()
	});

	// THE UNIFIED WINDOW — a tree with the report and the history beside
	// it. Its own command while it is being built, rather than taking
	// over the four the palette already has: those still open the four
	// windows, and a writer who finds this one wanting can go straight
	// back to them. When the Export tab lands and the old four become
	// wrappers, this becomes the way in and they point at it.
	plugin.addCommand({
		id: 'open-manuscript',
		name: 'Open the Organizer',
		// THE PANE: the id and the name are promised to every saved hotkey and
		// stay. THE SWITCH: off, the command is not offered.
		checkCallback: (checking: boolean) => {
			if (plugin.settings.organizerOn === false) return false;
			if (!checking) void plugin.orgOpenTab('organizer');
			return true;
		}
	});

	// Quick panels — the left/right sidebar toggle and "reveal the view"
	// as one keystroke, with the sidebar closing again once you have
	// picked something.
	//
	// checkCallback, not callback: returning false while `checking` is
	// true takes the command OUT of the palette, which is the official
	// way to make one conditional. Obsidian has no public
	// removeCommand, so a plain callback gated on the setting would
	// leave a dead entry in the palette whenever the toggle was off.
	const quickCmd = (id: string, name: string, key: WsBoolKey, viewType: string) => plugin.addCommand({
		id, name,
		checkCallback: (checking: boolean) => {
			if (!plugin.settings[key]) return false;
			if (!checking) void plugin.toggleQuickPanel(viewType);
			return true;
		}
	});
	// Capture, so the translation happens before the view sees a letter
	// it has no use for. Registered once and gated inside, rather than
	// hooked and unhooked as the setting changes.
	plugin.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => plugin.quickCycleVimKey(e), true);

	quickCmd('quick-file-explorer', 'Quick file explorer',
		'quickExplorer', 'file-explorer');
	quickCmd('quick-outline', 'Quick outline', 'quickOutline', 'outline');

	// Quick cycle. Four commands, no default hotkeys — Alt+arrows and
	// Alt+hjkl are both good bindings and which one a writer wants
	// depends on whether they think in vim, so the choice is left in
	// Obsidian's Hotkeys pane where it can be either or both. Alt is
	// untouched by vim mode, so neither conflicts in any mode.
	plugin.addCommand({
		id: 'open-menu',
		name: 'Open the menu',
		callback: () => plugin.openBarMenu()
	});

	for (const dir of ['left', 'right', 'up', 'down']) {
		plugin.addCommand({
			id: 'quick-cycle-' + dir,
			name: 'Quick cycle: jump ' + dir,
			checkCallback: (checking: boolean) => {
				if (!plugin.settings.quickCycle) return false;
				if (!checking) void plugin.quickCycleMove(dir);
				return true;
			}
		});
	}

	// The mark, registered before anything can ask for it.
	try { if (addIcon) addIcon(WS_ICON, WS_ICON_SVG); } catch (_) { wsCatch('onload: if (addIcon) addIcon(WS_ICON, WS_ICON_SVG);', _); }
	// A DOT (A728): Lucide's `dot` as it draws at its stroke, a filled circle in the middle of addIcon's 100 by 100
	try { if (addIcon) addIcon('ws-dot', '<circle cx="50" cy="50" r="8.5" fill="currentColor" stroke="none"/>'); } catch (_) { wsCatch('onload: addIcon(ws-dot)', _); }
}

// THE WORKSPACE'S EVENTS: file menus, leaf and layout changes, resize, the
// theme's CSS (lifted out of onload, A488).
// THE PLUGIN'S FILES BY THEIR NAMES (A733): the stores (and the two retired ones a vault may still hold) and the packs
const WS_OWN_NAMES = /^ws-(?:history|structure|settings|export|goals|lang-[A-Za-z0-9-]+)\.md$/;
export function wsWireWorkspace(plugin: WordSmith) {
	// THE PLUGIN'S OWN FOLDER IS READ AGAIN after any file comes, goes or moves (A733)
	for (const ev of ['create', 'delete', 'rename'] as const) plugin.onAppEvent(plugin.app.vault, ev, () => { plugin._ownFolders = null; });
	// …AND OBSIDIAN'S EXCLUDED FILES MOVE WITH IT (#71), once the vault has settled
	for (const ev of ['create', 'delete', 'rename'] as const) plugin.onAppEvent(plugin.app.vault, ev, () => plugin.excludeOwnFolderSoon());
	plugin.onAppEvent(plugin.app.workspace, 'file-menu',
		(menu: Menu, file: TAbstractFile, source: string) => {
			if (source === 'word-smith-outliner') return;
			plugin.fileMenuFor(menu, file);
		});
	// SEVERAL ROWS AT ONCE: select folders in Obsidian's tree, right-click,
	// "Export these".
	plugin.onAppEvent(plugin.app.workspace, 'files-menu',
		(menu: Menu, files: TAbstractFile[], source: string) => {
			if (source === 'word-smith-outliner') return;
			plugin.filesMenuFor(menu, files);
		});

	plugin.onAppEvent(plugin.app.workspace, 'file-open', (file: TAbstractFile) => {
		// THE NOTE YOU OPEN IS FOLLOWED by every open Organizer.
		plugin.orgTreeFollow(file && file.path);
		// …AND WEIGHED, if History has never seen it, so its first edit counts (A863)
		void plugin.historyNoteOpened(file);
		plugin.syncScope();
		plugin.applyEditorFont();
		plugin.applyVimMotionMaps();
		plugin.updateWorkspaceAesthetics();
	});
	plugin.onAppEvent(plugin.app.workspace, 'active-leaf-change', () => {
		plugin.syncScope();
		plugin.applyEditorFont();
		// Vim state is rebuilt with the editor, taking our maps with it.
		plugin.applyVimMotionMaps();
		plugin.updateWorkspaceAesthetics();
		plugin.scheduleExplorerPatch();
		if (plugin.zenActive() && plugin.settings.focusedFileMode) void plugin.updateFocusedFileMode();
		// (a pane made active by a press in its text is a click: Scroll when you click, off, leaves it still, #88)
		if (!(plugin._twPressed && plugin.settings.typewriterScrollOnClick === false)) plugin.typewriterScroll();
		// A tab put behind another is a leaf-change, not a layout-change;
		// the tree's boxes belong to a tab that is on screen.
		plugin.orgTicksSchedule();
	});
	plugin.onAppEvent(plugin.app.workspace, 'editor-change', () => {
		// (No Typewriter here, A506: an edit asks from inside the editor,
		// for the frame after the keystroke — see typewriterRequest.)
		// ONLY IF IT CHANGED: a keystroke that leaves the bar's text as it was
		// rebuilds and measures nothing.
		plugin.updateRetroStatusBar(true);
	});
	plugin.onAppEvent(plugin.app.workspace, 'resize', () => {
		plugin.scheduleMaskPosition();
		// Re-measure: a narrower window drops tokens, a wider one puts
		// them back.
		plugin.scheduleFit();
	});
	plugin.onAppEvent(plugin.app.workspace, 'layout-change', () => {
		plugin._tabContainersCache = null;
		plugin._scopeGen++;
		// An explorer leaf that was just opened has rows with no ticks yet;
		// nothing to do unless a window wants them.
		plugin.orgTicksSchedule();
		// The masks come off in reading view, and that is a refresh rather
		// than a re-measure: letterboxActive() changes answer, so the body
		// classes and the Modes popup have to change with it.
		plugin.applyBodyClasses();
		// Switching between editing and reading is a layout change, and
		// nothing else re-measures the masks when it happens. Without
		// this the geometry stamped before the swap is what stays on
		// screen until an unrelated event happens to run the pass —
		// which is why issue #1 could be cleared by changing note or
		// toggling zen, and by nothing you would think to try.
		plugin.scheduleMaskPosition();
		if (plugin.zenActive() && plugin.settings.focusedFileMode) void plugin.updateFocusedFileMode();
		// The explorer/outline observers are scoped to their leaf
		// containers, which layout changes can recreate — re-bind them.
		// …AND THE FLAGS COUNT AS A REASON TO WATCH. This asked only
		// about the two COUNT switches, so a vault with flags on and
		// counts off attached no observer and scheduled no pass: the
		// tree drew nothing until something else in the plugin happened
		// to call the patch, which is why flags appeared only after a
		// click on the bar's own token. A feature that draws in the
		// explorer has to be in every condition that decides whether the
		// explorer is drawn.
		if (plugin.settings.pluginEnabled && plugin.explorerWanted()) {
			plugin.attachExplorerObserver();
			plugin.scheduleExplorerPatch();
		}
		// THE SORT IS ITS OWN QUESTION, and it is asked here rather than
		// inside `explorerWanted()`: that condition decides whether to
		// WATCH the explorer's DOM, which the order does not need — it
		// goes through the view's own comparator. What it does need is a
		// re-patch, because a layout change can build a new view object
		// and the old patch went with the old one.
		if (plugin.settings.pluginEnabled) plugin.patchExplorerSort();
	});
	// THE MODE-SWITCH FIX: 'css-change' is the only event that fires when
	// the writer flips light/dark, and nothing above listens to it — which
	// left a scheme's dark half painted onto a light workspace until some
	// unrelated refresh happened by. See barThemeOnCssChange for why the
	// cursor bridge is deliberately not resynced from here.
	// Every leaf change is a chance to note which markdown view is
	// current, so a panel click later can still answer for it.
	plugin.onAppEvent(plugin.app.workspace, 'active-leaf-change', () => {
		plugin.rememberActiveMarkdown();
		// The panel shows live state — word counts, the current mode —
		// so it redraws when the writer moves, like any other pane.
		plugin.refreshMenuPanels();
	});
	plugin.onAppEvent(plugin.app.workspace, 'file-open', () => {
		plugin.rememberActiveMarkdown();
	});
	plugin.onAppEvent(plugin.app.workspace, 'css-change', () => {
		// A theme's stylesheet can move the bar's color with nothing on <body>
		// changing: the remembered read goes.
		plugin._barColorKey = null;
		plugin.barThemeOnCssChange();
		// A THEME SWITCH IS WHEN THE OTHER COLOUR BECOMES THE RIGHT ONE.
		// Without this, a writer moving from dark to light keeps flags
		// chosen for the dark one and wonders why they have gone faint.
		plugin.flagsApply();
	});

	// Mobile rebuilds the app container when Obsidian resumes, which
	// discards inline body styles. These are the events that follow a
	// rebuild; the guard is a no-op unless something actually went
	// missing, so listening broadly costs nothing.
	plugin.onAppEvent(plugin.app.workspace, 'resize', () => plugin.barThemeGuard());
	plugin.onAppEvent(plugin.app.workspace, 'active-leaf-change', () => plugin.barThemeGuard());
	plugin.registerDomEvent(document, 'visibilitychange', () => {
		if (!document.hidden) plugin.barThemeGuard();
	});
}

// THE DOCUMENT'S EVENTS: keys, pointer, selection, focus and the overlays
// Obsidian lays over the editor (lifted out of onload, A488).
export function wsWireDocument(plugin: WordSmith) {
	// NO TYPEWRITER ON A KEY (issue #22, A506): a key that moves the caret
	// moves it through the editor, which asks for the scroll itself.
	// ONLY IF IT CHANGED, here and on a selection change and a click: every
	// keystroke fires all three beside the edit, and each rebuilt a bar whose
	// text had not moved. A key that does move it ({vim}, {ln:col}, a
	// selection's {words}) still rebuilds.
	plugin.registerDomEvent(document, 'keyup', (evt: KeyboardEvent) => {
		plugin.updateModifierState(evt);
		plugin.updateRetroStatusBar(true);
	});
	// Peeking at a hidden bar. Deliberately the whole handler: everything
	// it could need is precomputed by syncBarPeekState, so a pointer move
	// with peeking disarmed costs one property read.
	plugin.registerDomEvent(document, 'mousemove', (evt: MouseEvent) => {
		if (!plugin._peekArmed) return;
		plugin.onPointerForBarPeek(evt.clientY);
	});
	// A click's caret is scrolled to on the way UP, not as it lands: a drag
	// that selects must not have the text moved out from under the pointer.
	// SCROLL WHEN YOU CLICK, OFF (#88): no scroll on the way up, and none from a pane the press made active (a
	// press in an editor's text, held until its release); the first key that types or moves the caret scrolls.
	plugin.registerDomEvent(document, 'mousedown', (ev: MouseEvent) => {
		const t = wsElOf(ev.target);
		plugin._twPressed = !!(t && t.closest('.cm-editor'));
	}, { capture: true });
	plugin.registerDomEvent(document, 'mouseup', () => {
		plugin.updateRetroStatusBar(true);
		plugin._twPressed = false;
		if (plugin.settings.typewriterScrollOnClick !== false) plugin.typewriterScroll();
	});
	// Live selection word count. selectionchange fires only when the
	// selection actually changes (mouse drag, shift+arrows, double-click),
	// unlike the old document-wide mousemove listener that re-derived
	// word counts on every pointer frame even with no selection at all.
	plugin._selectionRaf = null;
	plugin.registerDomEvent(document, 'selectionchange', () => {
		if (plugin._selectionRaf) return;
		plugin._selectionRaf = window.requestAnimationFrame(() => {
			plugin._selectionRaf = null;
			plugin.updateRetroStatusBar(true);
		});
	});
	// Escape exits zen mode (from new zen plugin — respects vim mode and excalidraw)
	// ZEN'S SIDE PANES PEEK FROM THE EDGE (A578): one listener, answering at once
	// while the switch's class is off.
	plugin.registerDomEvent(document, 'mousemove', (ev: MouseEvent) => plugin.zenPeekMove(ev));
	// …and the pointer leaving the window (A597): no move says so, and a peeked pane stayed
	plugin.registerDomEvent(document, 'mouseout', (ev: MouseEvent) => { if (!ev.relatedTarget) plugin.zenPeekAway(); });
	plugin.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
		plugin.updateModifierState(evt);
		// zenActive(), not settings.zenMode: the two disagree whenever the
		// master is off, and `zenMode` alone stays true after a bar-badge
		// exit — so this fired on Escape in a note that was not in zen,
		// and toggleZen() would then have taken it as a request to ENTER.
		if (evt.key === 'Escape' && plugin.settings.zenEscExits !== false && plugin.zenActive()) {
			const target = evt.target as HTMLElement | null;
			if (target) {
				const cmEditor = target.closest('.cm-editor');
				if (cmEditor) {
					const vault = plugin.app.vault;
					if (vault.config && vault.config.vimMode === true) {
						// In vim, Escape belongs to vim: it is how you
						// leave insert, visual and replace, and taking it
						// meant zen simply could not be left from the
						// keyboard — the guard here used to return
						// unconditionally.
						//
						// So it is taken only in NORMAL mode, where vim
						// has nothing left to do with it. The first
						// Escape drops you to normal as always; a second
						// one leaves zen. Nothing is stolen, and the
						// habit still works.
						if (plugin.getVimModeKey() !== 'normal') return;
					}
				}
				if (target.instanceOf(HTMLTextAreaElement) && target.className && target.className.includes('excalidraw')) return;
			}
			const activeModal = document.querySelector('.modal');
			if (!activeModal) { void plugin.toggleZen(); evt.preventDefault(); }
		}
	});

	// Track whether the note editor itself has focus. Used to gate the
	// elevated z-index (above Cursor Smith's canvas) so masks/arrows/bar
	// only float above everything while actually writing — not above the
	// command palette, settings, context menus, or other modals, which
	// take focus away from .cm-editor.
	const updateEditorFocusClass = () => {
		const active = document.activeElement;
		// WORD-SMITH'S OWN PANEL COUNTS AS WRITING. Focus in the docked
		// menu is not focus taken away by a modal or a palette — it is
		// the writer reaching for this plugin's own controls, and
		// dropping the masks the moment they do meant the letterbox
		// only appeared once they clicked back into the note. The pane
		// is part of the same act.
		const inEditor = !!(active && active.closest && (
			active.closest('.cm-editor') || active.closest('.ws-menu-panel')));
		document.body.classList.toggle('ws-editor-focused', inEditor);
		// The drag handles (the titlebar strip and the top mask) are
		// gated the OTHER way round from the z-index band: not "focus
		// is in the editor" but "focus is not inside anything that must
		// own its clicks". Two field reports shaped this. Gated on
		// editor focus alone, zen had NO drag handle whenever focus sat
		// elsewhere — "I can't drag the window". Widened to focus-on-
		// <body>, it STILL failed, because Obsidian parks focus on a
		// workspace container after ordinary clicks, not on body — a
		// whitelist here is a guess about Obsidian's focus routing that
		// each release can invalidate. The blacklist is the actual
		// invariant: dragging is wrong exactly while a modal, prompt,
		// suggestion popover or menu has focus, and those are stable,
		// purpose-named containers. Menus that take no focus at all are
		// covered separately: they carry their own no-drag later in the
		// DOM than the masks, which by invariant 12 (last element wins
		// the overlap) subtracts their rectangles from any grant
		// beneath.
		const blocked = !!(active && active.closest
			&& active.closest('.modal-container, .prompt, .suggestion-container, .menu'));
		document.body.classList.toggle('ws-drag-ok', !blocked);
		// {vim} reads focus, so the bar has to repaint on it — otherwise
		// the label lags by up to a second behind the palette opening.
		plugin.updateRetroStatusBar();
	};
	// `.ws-overlay-open` — is a modal, prompt, suggestion popover or menu
	// ON SCREEN? A different question from the focus one above, which
	// asks whether one HAS FOCUS: a menu can exist unfocused, and the
	// drag grants need to stand down for it either way.
	//
	// This was a `:has()` in the stylesheet, which needed no JS and was
	// the wrong tool: `body:not(:has(...))` puts the SUBJECT on body, so
	// the engine may re-check it on any change beneath body — and
	// beneath body is an editor whose DOM changes on every keystroke.
	//
	// The observer watches document.body's DIRECT CHILDREN only. That is
	// not a shortcut; it is why this is cheap. Obsidian appends all four
	// of these to body itself, so nothing here ever looks inside the
	// editor, and a keystroke produces no work at all.
	const OVERLAYS = '.modal-container, .prompt, .suggestion-container, .menu';
	const syncOverlayClass = () => {
		let open = false;
		try {
			for (const el of Array.from(document.body.children)) {
				if (el.matches && el.matches(OVERLAYS)) { open = true; break; }
			}
		} catch (_) { wsCatch('onload / syncOverlayClass: for (const el of Array.from(document.body.children))', _); }
		document.body.classList.toggle('ws-overlay-open', open);
	};
	syncOverlayClass();
	const overlayObserver = new MutationObserver(syncOverlayClass);
	overlayObserver.observe(document.body, { childList: true });
	plugin.register(() => {
		overlayObserver.disconnect();
		document.body.classList.remove('ws-overlay-open');
	});

	plugin.registerDomEvent(document, 'focusin', updateEditorFocusClass);
	plugin.registerDomEvent(document, 'focusout', () => window.requestAnimationFrame(updateEditorFocusClass));
	// Since 1.13 settings open in a separate window, which deactivates
	// this one WITHOUT firing focusin/focusout — activeElement keeps
	// reporting .cm-editor while the user is over in settings, so the
	// class stayed set and the masks/strip kept claiming
	// -webkit-app-region: drag, which is what made the settings window
	// un-draggable. Window blur is the event that does fire for it.
	//
	// hasFocus() is consulted here and ONLY here, and only to CLEAR.
	// Folding it into updateEditorFocusClass as a requirement for
	// setting the class turned out to break the letterbox outright:
	// hasFocus() reads false with DevTools focused (and misreports in
	// other Electron corner cases), and with it gating focusin the
	// class could stay off during ordinary typing — the masks then
	// never rose above full-viewport overlays (Cursor-Smith's canvas
	// at z 10000), which reads as "the letterbox doesn't display".
	// Clear-only means the worst a misreport can do is nothing.
	plugin.registerDomEvent(window, 'blur', () => window.requestAnimationFrame(() => {
		if (!document.hasFocus()) {
			document.body.classList.remove('ws-editor-focused');
			// And the drag class: this window's regions must not stay
			// claimed while another window (1.13 settings, a pop-out)
			// is the one being used — the original un-draggable
			// settings bug, on a second path.
			document.body.classList.remove('ws-drag-ok');
			plugin.updateRetroStatusBar();
		}
	}));
	plugin.registerDomEvent(window, 'focus', () => window.requestAnimationFrame(updateEditorFocusClass));
	updateEditorFocusClass();
}

// THE VAULT'S AND THE METADATA CACHE'S EVENTS: modify, create, rename,
// delete, changed, resolved (lifted out of onload, A488).
export function wsWireVault(plugin: WordSmith) {
	plugin.onAppEvent(plugin.app.vault, 'modify', (file: TAbstractFile) => {
		plugin.packsChanged(file && file.path);
		plugin.citeChanged(file && file.path);
		if (plugin.wordCountCache) plugin.wordCountCache.delete(file.path);
		plugin.scheduleExplorerPatch();
		// Same event, one more reader. The history is debounced and gated
		// on its own opt-in inside historyNoteChange, so this line costs a
		// function call in a vault that has never turned it on.
		plugin.historyNoteChange(file);
		// EVERY TREE SHOWING A FIGURE ABOUT THIS NOTE. The Manuscript
		// window caches a word count per path and never asked again, so a
		// window left open beside the editor showed the count the note had
		// when the window opened — for the rest of the session. Reported as
		// "the word counts don't update automatically", and that is exactly
		// what it was: nothing wrong with the counting, and nothing asking
		// for it a second time.
		plugin.treeCountsChanged(file && file.path);
		// The store changing under us — synced from another device, or
		// edited by hand — is read back rather than ignored. This is what
		// replaces the "find it again" button: there is nothing to press,
		// because the plugin notices.
		void plugin.historyAdopt(file);
		// THE ORDER FILE, TOO. `ws-export.md` is a note in the vault: it
		// syncs from another device and a writer can reorder its lines by
		// hand, which its own header invites them to do. The parsed store
		// is cached for the life of the session, so without this the tree
		// would go on drawing an order that is no longer in the file.
		plugin.treeOrderAdopt(file);
	});
	plugin.onAppEvent(plugin.app.metadataCache, 'changed', (file: TAbstractFile) => {
		// A NOTE'S OWN KEYS EDITED (A862): its editors and the colors follow at once, not at the next keystroke there
		const keysWere = file && file.path && plugin._fmCache && Object.prototype.hasOwnProperty.call(plugin._fmCache, file.path)
			? JSON.stringify(plugin._fmCache[file.path]) : null;
		if (plugin._fmCache && file && file.path) delete plugin._fmCache[file.path];
		plugin._scopeGen++;
		if (keysWere !== null && JSON.stringify(plugin.getOverrides(file)) !== keysWere && plugin.settings.pluginEnabled) plugin.noteKeysApply();
		// {backlinks} caches a walk of the whole vault against this.
		plugin._linkGen = (plugin._linkGen || 0) + 1;
		// The heading tokens read this cache, and it is the only thing on
		// the bar that does. A repaint that happened before the cache
		// answered has no headings to show and nothing that would make it
		// try again — see the 'resolved' handler below.
		const active = plugin.app.workspace.getActiveFile();
		if (file && active && file.path === active.path) {
			plugin.requestBarRebuild();
		}
	});
	// Fired once when the vault's links have all been resolved at startup,
	// and again after a batch of changes settles. Without it the first
	// backlink count of a session is whatever was resolvable at load.
	plugin.onAppEvent(plugin.app.metadataCache, 'resolved', () => {
		plugin._linkGen = (plugin._linkGen || 0) + 1;
		// AND repaint the bar.
		//
		// The heading tokens ({#} and the rest, {#>}) resolve through
		// metadataCache, which fills asynchronously. On a slower machine
		// the first paint of a session lands before it has answered, so
		// those tokens resolve to nothing — and a segment whose tokens
		// all resolve to nothing is dropped, by design. The row comes up
		// empty and stays empty, because nothing rebuilds it.
		//
		// Reported from ChromeOS, where a heading-only bar showed no left
		// or centre section at all; Windows and Android won the race and
		// never showed it. Forcing a repaint in the console fixed it and
		// it then held, which is what named this as a startup race rather
		// than a rendering fault.
		plugin.requestBarRebuild();
	});
	// A store that appears in the vault — first sync of a new install, or a
	// file the user pasted in — is picked up without being asked for.
	plugin.onAppEvent(plugin.app.vault, 'create', (file: TAbstractFile) => {
		plugin.packsChanged(file && file.path);
		plugin.citeChanged(file && file.path);
		// Every tree drawing this vault, once the vault knows about it.
		plugin.treeShapeChanged();
		// A new row in Obsidian's tree gets its export tick.
		plugin.orgTicksSchedule();
		// A note made empty starts its history at zero, so its first words count.
		plugin.historyNoteCreated(file);
		if (plugin._historyPath || !plugin.settings.historyTracking) return;
		void plugin.historyAdopt(file);
	});
	plugin.onAppEvent(plugin.app.vault, 'rename', (file: TAbstractFile, oldPath: string) => {
		plugin.packsChanged(file && file.path);
		plugin.citeChanged(file && file.path);
		plugin.packsChanged(oldPath);
		plugin.citeRenamed(oldPath, file.path);
		if (plugin.wordCountCache) plugin.wordCountCache.delete(oldPath);
		void plugin.renameScopePath(oldPath, file.path);
		plugin.historyRenamePath(oldPath, file.path);
		plugin.dailyWordsRename(oldPath, file.path);
		// FIRST, before anything writes: if the thing that moved was one
		// of this plugin's own files — or a folder holding one — the
		// path in settings has to follow it, or the next write makes a
		// fresh empty file at the address the writer just vacated.
		const followed = plugin.storeRenameFollow(oldPath, file.path);
		// Folders fire this too, so a folder rename carries the goals of
		// everything inside it.
		if (plugin.renameGoalPaths(oldPath, file.path) || followed) void plugin.saveSettings(true);
		// …and the export list, which is keyed by path twice over: the
		// rows inside a section, and the section's own scope.
		void plugin.structureRenameStore(oldPath, file.path);
		// The renamed row's export tick is read against its new path.
		plugin.orgTicksSchedule();
		// LAST, after the stores have followed the file. The trees redraw
		// from those stores, and redrawing before they were rewritten
		// would paint the order the vault had a moment ago.
		plugin.treeShapeChanged();
	});
	plugin.onAppEvent(plugin.app.vault, 'delete', (file: TAbstractFile) => {
		plugin.packsChanged(file && file.path);
		plugin.citeChanged(file && file.path);
		if (plugin.wordCountCache) plugin.wordCountCache.delete(file.path);
		void plugin.removeScopePath(file.path);
		plugin.historyForgetPath(file.path);
		// AND THE MIRROR: a deleted ws-settings.md returns with the next save
		// instead of waiting for a setting to move.
		plugin.settingsMirrorForget(file.path);
		// …AND THE ORDER STORE, which had no delete arm at all. See
		// `structureForgetPath`: the rename half has been here since
		// 1.41 and this half never was, so a deleted note left its row
		// and a deleted folder left its whole section. Folders fire this
		// event too, which is what makes one call enough.
		void plugin.structureForgetStore(file.path);
		// …AND THE GOALS, THE FLAGS AND THE COLOURS, which had no delete
		// arm either. The rename half two handlers up has carried them
		// since 1.41; this half never has, so a deleted note kept its
		// target at an address nothing could reach — and `renameGoalPaths`
		// lets an existing key WIN, so re-using that path later gave the
		// new note the dead one's goal.
		if (plugin.forgetGoalPaths(file.path)) void plugin.saveSettings(true);
		plugin.treeShapeChanged();
	});
}

// THE THEME OBSERVER: the body's class list, watched for a theme or a
// light/dark switch (lifted out of onload, A488).
export function wsWatchTheme(plugin: WordSmith) {
	plugin._themeObsBusy = false;
	plugin._themeObserver = new MutationObserver(() => {
		if (!plugin.settings.pluginEnabled) return;
		if (plugin._themeObsBusy) return;
		plugin._themeObsBusy = true;
		try {
			plugin.applyCssVariables();
			plugin.applyStyleProps();
			// Cursor-Smith's torch flips a body class of its own
			plugin.applyTorchVars();
			// A worn scheme has to survive whoever else writes to body.
			plugin.barThemeGuard();
		} finally {
			// CLEARED ON A TASK, not in the finally alone: the records
			// this callback's own writes queued are delivered at the next
			// microtask checkpoint, which is still inside this turn. A
			// flag cleared synchronously would be false again by then and
			// the loop would resume.
			window.setTimeout(() => { plugin._themeObsBusy = false; }, 0);
		}
	});
	plugin._themeObserver.observe(document.body,
		{ attributes: true, attributeFilter: ['class', 'style'] });
}

// ONCE THE LAYOUT IS READY: the work that needs the workspace built
// (lifted out of onload, A488).
export function wsOnLayoutReady(plugin: WordSmith) {
	// (not from a plugin unloaded since: after a quick reload it would end the NEW start's guard)
	window.setTimeout(() => { if (!plugin._unloaded) plugin.startGuardEnd(); }, 2000);
	if (!plugin.settings.pluginEnabled) return;
	const t0 = performance.now();
	plugin.refresh();
	// THE NOTE OPEN AT THE START weighed as one opened later is (A863)
	try { void plugin.historyNoteOpened(plugin.app.workspace.getActiveFile()); } catch (_) { wsCatch('onLayoutReady: historyNoteOpened', _); }
	// THE LANGUAGE PACKS, read after the start, never in it (A571)
	void plugin.packsScan();
	// THE CITATION LIBRARY, read after the start too (A572)
	void plugin.citeLoad();
	plugin.checkStylesheetVersion();
	plugin.checkManifestVersion();
	// A SECOND PASS ONCE THE STYLESHEET IS CERTAINLY UP. Everything
	// this plugin MEASURES is measured against rules that
	// styles.css supplies, and when the plugin is switched on from
	// the settings page this callback runs synchronously — before
	// Obsidian has necessarily applied them. The bar is the case a
	// writer sees: it is laid out by CSS, it was measured while
	// there was none, and it came up the wrong width until the
	// next note switch happened to rebuild it. Cheap, once, and it
	// costs nothing when the stylesheet was already there — the
	// refresh is idempotent.
	window.setTimeout(() => {
		if (!plugin._unloaded && plugin.settings && plugin.settings.pluginEnabled) plugin.refresh();
	}, 0);
	try {
		if (!plugin._loadMarks) plugin._loadMarks = [];
		plugin._loadMarks.push(['layout ready',
			plugin._loadMarks[plugin._loadMarks.length - 1][1]
				+ (performance.now() - t0)]);
	} catch (_) { wsCatch('onload: if (!this._loadMarks) this._loadMarks = [];', _); }
	// AND THE PANEL DOCKS ITSELF. Registering the view type is what lets
	// Obsidian RESTORE a pane it already has in the workspace — it does
	// not create one; on a fresh install, or after any start where the
	// workspace had no leaf of ours, the writer would have to dock it by
	// hand. `menuDock` is the writer's statement that they want the panel;
	// turning it off is how they say otherwise, and that path already
	// detaches the pane. Opened with `active: false` and no reveal, so a
	// docked pane appears where it belongs without stealing focus from
	// the note or, on a phone, throwing the sidebar open over what they
	// were reading. A pane Obsidian kept as a placeholder counts as one
	// that exists — reviveMenuPanel wakes it. A placeholder left by an
	// unload of a LIVE pane is not yet a leaf of our type while onload
	// runs — Obsidian makes it one, deferred, a moment later — so the
	// wake runs again on every layout change; it costs a look at a few
	// leaves and settles the moment nothing is a ghost.
	if (plugin.settings.menuDock) {
		void (async () => {
			await plugin.reviveMenuPanel();
			if (!plugin.menuPanelLeaves().length) await plugin.openMenuPanel(false);
		})();
		plugin.onAppEvent(plugin.app.workspace, 'layout-change', () => { if (plugin.settings.menuDock) void plugin.reviveMenuPanel(); });
	}
	// MARKERS MOVED OUT OF TEXT OPTIONS, so a vault that had them on
	// under the old arrangement keeps them on under the new one.
	// Without this the fix would read to an existing writer as "the
	// update turned my markers off" — a worse bug than the one it
	// fixes. ASKED OF THE FILE, so it decides once: asked of the merged
	// settings it turned the markers back on at every start for a writer
	// who had switched them off while Text Options was on.
	const rawM = plugin._rawData || {};
	if (rawM.markersEnabled === undefined
		&& rawM.showHiddenMarkers === true && rawM.miscEnabled === true) {
		plugin.settings.markersEnabled = true;
		void plugin.saveSettings();
	}
	// The goals file, read after the vault is up — it cannot be
	// read in onload, where getAbstractFileByPath answers for a
	// vault Obsidian has not finished indexing.
	//
	// THE MIRROR GOES FIRST, and for the same reason it is here at all
	// rather than in loadSettings: finding it means reading files. It
	// restores only when data.json had nothing in it, so on every
	// ordinary start this is one `getAbstractFileByPath` and a return.
	void (async () => {
		// a mirror that cannot be read leaves data.json as it is
		let restored = false;
		try { restored = await plugin.settingsMirrorRestore(plugin._rawData); } catch (_) { wsCatch('onLayoutReady: await plugin.settingsMirrorRestore(plugin._rawData);', _); }
		// THE WELCOME, ONCE, TO A NEW INSTALL (A743): after the mirror, because a setup it brought back is not new
		try { await plugin.welcomeOnFirstStart(restored); } catch (_) { wsCatch('onLayoutReady: welcomeOnFirstStart', _); }
		try {
			await plugin.goalsFileLoad();
			plugin.refresh();
		} catch (_) { wsCatch('onLayoutReady: await plugin.goalsFileLoad();', _); }
	})();
	// Only worth asking when the panel is on: a writer who never
	// docks it has no stake in whether the tree's classes moved,
	// and a notice they cannot act on is noise.
	if (plugin.settings.menuDock) plugin.checkAppClasses();
	// Read the store once the vault's file list exists — finding the
	// file means looking through it. Nothing is recorded until this
	// resolves; historyCapture waits on the same promise, so an edit
	// made during startup is counted rather than dropped.
	if (plugin.settings.historyTracking) void plugin.historyLoad();
}

// THE CLASS IS IN MORE THAN ONE FILE: each area's methods are a module's functions with an explicit `this`, put onto
// the prototype at the foot of this file. The class's base says they are there: Obsidian's Plugin, typed with every
// area's methods (its value is Plugin itself), so a method added to an area module is known to the checker at once.
// (Until 2026-10-22 each one was declared here by hand, 782 lines. A class and an interface of one name would say the
// same in one line, and the review refuses that merge: no-unsafe-declaration-merging.)
type WsAreaMethods = HistoryMethods & ExportMethods & ThemesMethods & StoresMethods & ReportMethods & MenuMethods & BarMethods & OrganizerWindowMethods & TreeMethods & FocusMethods & EditorMethods & PaintMethods & DiagnosticsMethods;
const WsPluginWithAreas = Plugin as unknown as new (...args: ConstructorParameters<typeof Plugin>) => Plugin & WsAreaMethods;
export default class WordSmith extends WsPluginWithAreas {
	// ── THE FIELDS ─────────────────────────────────────────────────────────
	// Declared as the checker saw them assigned — every `this.<name> = expr` in
	// the class and every `plugin.<name> = expr` written from another module, the
	// union of the expressions' widened types. A field that reads `any` here is
	// one whose every writer was itself untyped.
	_activeBarPreset: string;
	_activeDragCleanup: (() => void) | null;
	_appClassesChecked: boolean;
	_auroraSeed: number;
	_backlinkCache: { path: string; gen: number; text: string } | null;
	_barAnimT: number;
	_barBoundsCleared: boolean;
	_barBoundsDirty: boolean;
	_barBoundsEl: HTMLDivElement | null;
	_barColorCache: string | null;
	_barColorKey: string | null;
	_pageQuick: { on: boolean; base: boolean } | null;
	_barRenderSig: string | null;
	_barRootObserved: Element | null;
	_barRootRO: ResizeObserver | null;
	_fitRO: ResizeObserver | null;
	_barBoundsL: number | null;
	_barBoundsW: number | null;
	_barBoxHeight: number;
	_barPeek: boolean;
	_barPeekTimer: number | null;
	_barPicker: HTMLDivElement | null;
	_barPickerDismiss: ((e: Event) => void) | null;
	// the frames the open picker listens in (A628: a press on the Export preview closes it)
	_barPickerFrames: Document[] | null;
	_barPickerKey: ((e: KeyboardEvent) => void) | null;
	_barRebuilding: boolean;
	_barReserve: number | null;
	_batteryHandler: (() => void) | null;
	_batteryManager: { level: number; charging: boolean; addEventListener: (type: string, fn: () => void) => void; removeEventListener: (type: string, fn: () => void) => void } | null;
	_bodyResizeObs: ResizeObserver | null;
	_capSaid: Record<string, boolean>;
	_capsLockOn: boolean;
	_colorProbeEl: HTMLSpanElement | null;
	_docStatsCache: { doc: CmText | null; totalWC: number; charCount: number; paras: { start: number; end: number }[]; tasks: { done: number; all: number } } | null;
	_explorerClick: ((ev: Event) => void) | null;
	_exportPage: number;
	_exportZoom: number | null;
	/** the open Export panes' preview refreshes, run on a change in Settings › Export (`exportOptsChanged`) */
	_exportRefreshers?: Set<() => void>;
	_fenceCache: { doc: CmText; set: Set<unknown> } | null;
	_fitPending: boolean;
	_fitShortenFile: boolean;
	_fitShortenHead: number;
	_fitShortenHeadWidth: number;
	_fitShortenWidth: number;
	_flagsSig: string;
	_flagStamp: string;
	_fmCache: Record<string, Record<string, boolean | string> | null>;
	_focusTabPrev: Map<HTMLElement, { display: string; width: string; flexGrow: string; flexShrink: string; flexBasis: string }>;
	_folderWordBusy: boolean;
	_goalsFoldedFrom: string | null;
	_goalsFoundAt: string | null;
	_goalsSig: string | null;
	// goals with a date (A700): the token's state, the celebration running, the crossings seen, the folders' counts, the panel
	// (and the open note, its path and its words now, for the panel's other rows, A726)
	_goalNowState: { goal: { path: string; kind: 'note' | 'folder'; target: number; due: string }; plan: WsGoalPlan; say: { num: number; rest: string }; note?: { path: string; live: number } } | null;
	_goalFolderCounts: Map<string, { n: number; at: number }> | null;
	_goalFolderBusy: boolean;
	_goalPanel: HTMLDivElement | null;
	_goalPanelOff: (() => void) | null;
	_dailyPanel: HTMLDivElement | null;
	_dailyPanelOff: (() => void) | null;
	_dailyLive: { path: string; count: number } | null;
	// A709: the last good copy written per store, and the stores already checked for a cut this session
	_backupLast: Map<string, string> | null;
	_backupTried: Set<string> | null;
	// A733: the plugin's own folders, read once until the vault changes, and the explorer rows marked hidden
	_ownFolders: string[] | null;
	_ownMarked: Set<string> | null;
	// #71: Obsidian's Excluded files brought in line a moment after the vault changes
	_ownExcludeTimer: number | null;
	_goalsTimer: number | null;
	_goalsWritten: boolean;
	_hemFlashTimer: number | null;
	_hemIconTimer: number | null;
	_hemSaid: boolean;
	_hemScreenEl: HTMLElement | null;
	_hemScreenTimer: number | null;
	_history: WsHistoryRecord | null;
	_historyDirtyAt: number;
	_historyLoading: Promise<WsHistoryRecord> | null;
	_historyPath: string | null;
	_historyReady: boolean;
	_historySaveTimer: number | null;
	_historyTimers: Map<string, number>;
	_historyHeld: Map<string, { n: number; undo: number[]; redo: number[] }> | null;
	_historyWriting: boolean;
	_isTogglingZen: boolean;
	_lastMdView: MarkdownView;
	_lastScopeInScope: boolean | null;
	_lastPaneScope: string | null;
	_lastNoteKeys: string | null;
	_explorerSortWas: boolean | null = null;
	_lastTypo: { from: number; to: number; caret: number; glyph: string; original: string; time: number } | null;
	// your own clichés as one pattern, and the box and language it was made from (A856)
	_customClicheKey = '';
	_customClicheRe: RegExp | null = null;
	_neverMarkKey = '';
	_neverMarkRe: RegExp | null = null;
	_lastZoom: number;
	_linkGen: number;
	_loadMarks: [string, number][];
	_manifestWarned: boolean;
	_maskNotches: { nl: number; nr: number; nh: number; } | null;
	_maskRaf: number | null;
	_maskRetries: number;
	_menuPanelRegistered: boolean;
	_reviving: Promise<void> | null;
	_caretObs: MutationObserver | null;
	_caretObsEl: Element | null;
	_mirrorFoundAt: string | null;
	_mirrorSig: string;
	_mirrorTimer: number | null;
	_numLockOn: boolean;
	_openModals: Set<{ containerEl?: HTMLElement; close(): void }>;
	// the settings tab, held so onunload can cut its observer
	_settingsTab: WordSmithSettingTab | null;
	_packs: Map<string, { path: string; pack: WsPack; dupes: string[] }> | null;
	_packsBad: { path: string; why: string }[] | null;
	_packsRead: boolean;
	_packTimer: number | null;
	_packMissingSaid: boolean;
	/** the pack the counts were last measured in (null for English), so a change of it measures again */
	_packWas: WsPack | null;
	/** the citation library read (A572), what kept it from being read, a generation for the marks */
	_citeLib: Map<string, WsRef> | null;
	_citeLibError: string;
	_citeGen: number;
	_citeTimer: number | null;
	_orgAt: () => string;
	_orgBackMap: { gen: number; map: Map<string, string[]> } | null;
	_orgBarSay: () => string;
	_orgColOn: (id: string, on: boolean) => void;
	_orgCtx: () => WsOrgCtx;
	_orgDraw: () => void;
	_orgFieldEditor: (td: HTMLElement, p: string, k: string) => HTMLInputElement | null;
	_orgFit: () => void;
	_orgFlagSet: (row: { path: string }, id: string, cell: HTMLElement | null) => Promise<void>;
	_orgMenuCtx: WsOrgMenuCtx | null = null;
	_orgGripAt: (host: HTMLElement, x: number, y: number) => HTMLElement | null;
	_orgGripDrag: () => number;
	_orgHist: { run: (what: string) => void; canUndo: () => boolean; canRedo: () => boolean; undoLabel: () => string; redoLabel: () => string } | null;
	_orgHistActive: ((ev: KeyboardEvent) => void) | null;
	_orgHistKey: (ev: KeyboardEvent) => void;
	_orgIndex: WsOrgIndexMap;
	_orgIndexBuild: Promise<WsOrgIndexMap> | null;
	_orgIndexEmptyAt: string | null;
	_orgIndexSubs: Set<() => void>;
	_orgLens: () => { sort: WsLensSort | null; chips: WsLensChip[] };
	_orgLensSet: (patch: { sort?: WsLensSort | null; chips?: WsLensChip[] }) => void;
	_orgRedraw: () => void;
	_orgNote: () => string;
	_orgOpen: () => string[];
	_orgOpenSet: (p: string, on: boolean) => void;
	_orgPropKeys: (at: string) => string[];
	_orgPropListSet: (p: string, k: string, v: unknown, before: unknown) => Promise<boolean>;
	_orgPropRows: () => { col: WsOrgCol | null; key: string; name: string; dead: boolean }[];
	_orgPropSet: (p: string, k: string, v: unknown) => Promise<boolean>;
	_orgPruneUserCols: () => boolean;
	_orgScope: () => string;
	_orgScopes: () => string[] | null;
	_orgSel: () => string[];
	_orgSelSet: (paths: string[]) => void;
	_orgSubject: () => HTMLDivElement;
	_orgSubjectRows: () => { kind: string; path: string; }[];
	_orgWindows: WsOrgDoor[];
	_orgZoom: () => number;
	_outlinerPaneRegistered: boolean;
	_panelPointerDown: boolean;
	_panelRefreshPending: boolean;
	_panelSide: string;
	_panelWasOpen: boolean;
	_paraCache: { doc: string | string[] | CmText; val: { body: Set<unknown>; first: Set<unknown> } } | null;
	_passState: { marks: number[] };
	_patchAgain: boolean;
	_patchRunning: boolean;
	_patchScheduled: boolean;
	_peekArmed: boolean;
	_peekZoneTop: number;
	_quickCycleHere: WorkspaceLeaf | null;
	_quickCycleLast: Map<WorkspaceSidedock | WorkspaceMobileDrawer, WorkspaceLeaf>;
	_peek: { side: string; split: WorkspaceSidedock; open: boolean; arm: number | null; leave: number | null } | null;
	_rawData: Record<string, unknown> | null;
	_readerBeside: WorkspaceLeaf | null;
	_refreshTimer: number | null;
	_repairedKeys: string[];
	_scopeGen: number;
	_selectionRaf: number | null;
	_twFrame: number | null;
	_twPressed: boolean;
	_twView: EditorView | null;
	_twIdle: number | null;
	_twIdleView: EditorView | null;
	_settingsUndo: Record<string, unknown> | null;
	_sheetTest: string;
	_sidebarsSuspended: boolean;
	_stampZoom: number;
	_startBlocked: { kind: string; text: string; } | null;
	_unloaded: boolean;
	_startTripped: boolean;
	_statusRowEls: HTMLElement[];
	_storeFailSaid: Record<string, boolean>;
	_storeLast: { path: string; eol: string; same: boolean; at: number; };
	_structFoundAt: string | null;
	_structReading: Promise<Record<string, WsStructRow[]>> | null;
	_structRepaired: string[];
	_structSources: WsStructSource[];
	_structStore: Record<string, WsStructRow[]>;
	_structText: string;
	_structWriteQ: Promise<unknown> | null;
	_styleWarned: boolean;
	_suspendedLeft: boolean;
	_suspendedRight: boolean;
	_sysFonts: string[];
	_sysFontsFrom: string;
	_sysFontsQ: Promise<string[]> | null;
	_tabContainersCache: HTMLElement[] | null;
	_themeGuarding: boolean;
	_themeObsBusy: boolean;
	_themeObserver: MutationObserver | null;
	_themeSurfaceCache: Record<string, string> | null;
	_themeVarKeys: string[];
	_themeVarUniverse: string[];
	_ticksScheduled: boolean;
	_treeCountDirty: Set<string>;
	_treeCountTimer: number | null;
	_treeCountWatchers: Set<(paths: string[]) => void>;
	_treeIndexBell: (() => void) | null;
	_treeOrderLoading: boolean;
	_treeOrderWatchers: Set<() => void>;
	_treeShapeQueued: boolean;
	_vimMapped: boolean;
	_vimPanelOpen: boolean;
	_wasZenMode: boolean;
	_wcoWas: { color: string; symbolColor: string } | null;
	_wsDragPath: string | null;
	_wsDropRow: HTMLElement | null;
	_wsIconDone: boolean;
	_wsLastTotalWordCount: number;
	_wsSession: WsSession | null;
	_wsSortRowBound: boolean;
	_wsSortArmedAt: number;
	_wsSortShowPatched: boolean;
	_wsTreeDragBound: boolean;
	arrowsBottomEl: HTMLDivElement | null;
	arrowsTopEl: HTMLDivElement | null;
	batteryCharging: boolean;
	batteryLevel: number | null;
	caps: Record<string, boolean | null>;
	clockInterval: number | null;
	// {wpm} (A730): the meter (typed characters by time, the time spent typing, what is shown), its timer, and
	// whether a token is on the bar to listen for
	_wpm: { hits: [number, number][]; last: number; shown: number; needle: number; at: number } | null;
	_wpmTimer: number | null;
	_wpmWanted: boolean;
	// today's {wpm} record changed since it was last saved (A742)
	_wpmDayDirty: boolean;
	// the daily target: today's record's save on a rest, and the notes being weighed from disk for their start
	_dailyWordsTimer: number | null;
	_dailyWordsWeighing: Set<string> | null;
	currentScroller: HTMLElement | null;
	editorExtensions: Extension[];
	explorerObserver: MutationObserver | null;
	maskBottomEl: HTMLDivElement | null;
	maskGuardLeftEl: HTMLDivElement | null;
	// the band's two side handles and the readout a drag shows (A673)
	lbSideLeftEl: HTMLDivElement | null;
	lbSideRightEl: HTMLDivElement | null;
	lbReadoutEl: HTMLDivElement | null;
	// the scroller padding the positioner last set (A673: a pass that changes it asks for one more)
	_lbScrollPad: number | null;
	maskGuardRightEl: HTMLDivElement | null;
	maskResizeObserver: ResizeObserver | null;
	maskTopEl: HTMLDivElement | null;
	retroPlinthEl: HTMLDivElement | null;
	retroStatusBarEl: HTMLDivElement | null;
	scrollHandler: (() => void) | null;
	windowResizeHandler: (() => void) | null;
	// per path: the tree's old count (`count`), a note's stats and tasks under
	// `stats:<path>`, the tasks alone under the tasks pass's own key
	wordCountCache: Map<string, { mtime: number; count?: number; stats?: WsTextStats; tasks?: { done: number; all: number } | null }>;
	wsRibbonEl: HTMLElement | null;
	// Obsidian 1.13 declares `settings?: unknown` on Plugin — "declare a
	// concrete type on your subclass to type it". The schema is the defaults
	// (ts/src/settings.ts): every key held to its default's kind.
	settings: WordSmithSettings;

	// ════════════════════════════════════════════════════════════════════════
	// THE BOUNDARY
	// ════════════════════════════════════════════════════════════════════════
	//
	// REFUSED WHERE THE THING IS BORN. Every DOM listener and every command
	// this plugin owns is created by exactly one method each, so the guard goes
	// on the method rather than on the call sites that use them — a wrapper
	// applied per site is a wrapper the next call site forgets.
	//
	// `super` IS NOT ALWAYS THERE. The tests stub `Plugin` as an empty class,
	// so calling straight through would throw the moment a test registered
	// anything. The fallback is the path the tests take, and it is asserted.
	registerDomEvent(el: Window | Document | HTMLElement, type: string, cb: (ev: Event) => unknown, opts?: boolean | AddEventListenerOptions): void {
		const w = wsGuard(cb, 'a ' + type + ' handler');
		if (typeof super.registerDomEvent === 'function') {
			return super.registerDomEvent(el as HTMLElement, type as keyof HTMLElementEventMap, w, opts);
		}
		try { el.addEventListener(type, w, opts); } catch (_) { wsCatch('registerDomEvent: el.addEventListener(type, w, opts);', _); }
		return undefined;
	}

	// A COMMAND HAS FOUR PLACES TO PUT A FUNCTION and Obsidian calls whichever
	// is present. Naming them here rather than wrapping “every function-valued
	// key” keeps `icon` and `hotkeys` out of it, and a new kind of callback in
	// a future API shows up as an unguarded one rather than as a mystery.
	//
	// A THROWN `checkCallback` NOW RETURNS UNDEFINED, which reads as false, so
	// the command hides itself from the palette rather than offering an action
	// that cannot work. That is the right direction to fail in.
	addCommand(cmd: Command) {
		const c = cmd;
		try {
			const id = (c && c.name) ? c.name : ((c && c.id) ? c.id : 'a command');
			const bag = c as unknown as Record<string, unknown>;
			for (const k of ['callback', 'checkCallback',
				'editorCallback', 'editorCheckCallback']) {
				const fn = bag[k];
				if (typeof fn === 'function') bag[k] = wsGuard(fn as (...args: never[]) => unknown, 'the “' + id + '” command');
			}
		} catch (_) { wsCatch('addCommand: const id = (c && c.name) ? c.name : ((c && c.id) ? c.id : \'a …', _); }
		if (typeof super.addCommand === 'function') return super.addCommand(c);
		return c;
	}

	// AND ONE DOOR FOR VAULT AND WORKSPACE EVENTS. `registerEvent` takes an
	// EventRef, not a function — the callback is already inside `.on(...)` by
	// the time it is handed over — so this is the one boundary that cannot be
	// closed by an override and has to be called instead of it. A checker
	// keeps the bare form from coming back.
	onAppEvent(emitter: Events, name: string, cb: (...data: never[]) => unknown) {
		try {
			// THE ONE PLACE `registerEvent` IS STILL CALLED BARE, and it has to
			// be: this is the wrapper. The checker below knows this line by
			// name — a sweep that converts every plain shape converted THIS
			// one too on its first run, into a call to itself.
			return this.registerEvent(emitter.on(name, wsGuard(cb, 'the ' + name + ' handler')));
		} catch { return undefined; }
	}

	// ════════════════════════════════════════════════════════════════════════
	// LIFECYCLE
	// ════════════════════════════════════════════════════════════════════════

	// THE GUARD'S NOTICE. A method rather than a closure in onload, so a test
	// whose fixture never runs onload can build one and look at it. The button
	// copies where it stopped, the stack, and the diagnostics: a report can
	// carry all three without the reporter opening a console. Returns the
	// fragment.
	guardNotice(where: string, err: unknown) {
		let frag = null;
		try {
			frag = createFragment();
			const p = createDiv();
			p.textContent = 'Word-Smith: something went wrong in ' + where
				+ '. The rest of Obsidian is unaffected. This is said once a session.';
			frag.appendChild(p);
			const b = createEl('button');
			b.textContent = 'Copy details';
			b.className = 'ws-guard-copy';
			b.addEventListener('click', (ev) => { void (async () => {
				try { ev.stopPropagation(); } catch (_) { wsCatch('guardNotice: ev.stopPropagation();', _); }
				let text = 'Word-Smith: ' + where + '\n' + ((err instanceof Error && err.stack) || wsStr(err)) + '\n\n';
				try { text += this.diagnostics(); } catch (_) { wsCatch('guardNotice: text += this.diagnostics();', _); }
				try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
				catch { b.textContent = 'Could not copy'; }
			})(); });
			frag.appendChild(b);
			new Notice(frag, 20000);
		} catch (_) { wsCatch('guardNotice: frag = createFragment();', _); }
		return frag;
	}

	// ── THE START GUARD AND THE INSTALLER GATE ─────────────────────────────
	//
	// One mark per vault per device, in localStorage rather than data.json:
	// synchronous, no disk write on every launch, and a sync client cannot
	// carry it to a machine that did not freeze. `startStore` is a door for
	// the tests (a DOM's localStorage can throw on an opaque origin).
	startStore() {
		try { return window.localStorage || null; } catch { return null; }
	}

	startGuardKey() {
		const id = (this.app && this.app.appId) || 'vault';
		return 'word-smith:starting:' + id;
	}

	// Returns true when the last start never took its mark away.
	startGuardBegin() {
		let tripped = false;
		try {
			const st = this.startStore();
			if (!st) return false;
			const k = this.startGuardKey();
			tripped = st.getItem(k) != null;
			st.setItem(k, String(Date.now()));
		} catch { return false; }
		return tripped;
	}

	startGuardEnd() {
		try { const st = this.startStore(); if (st) st.removeItem(this.startGuardKey()); } catch (_) { wsCatch('startGuardEnd: const st = this.startStore();', _); }
	}

	// null, or { kind: 'refuse' | 'safe', text }. Read once, after settings.
	startBlocked() {
		const v = this.installerVerdict(this.installerVersion());
		if (v.kind === 'refuse') return { kind: 'refuse', text: v.text };
		if (this._startTripped) {
			return { kind: 'safe', text: 'Word-Smith: the last start did not finish, so everything is off this time.'
				+ ' Settings \u2192 Word-Smith has a button to try again; if it freezes again, check your installer version (Settings \u2192 General) and open an issue.' };
		}
		return null;
	}

	// The door on the banner: a real off-and-on through Obsidian, so every
	// command, event and extension the blocked start skipped is registered.
	async startAgain() {
		const id = (this.manifest && this.manifest.id) || 'word-smith';
		const pl = this.app && this.app.plugins;
		if (!pl || !pl.disablePlugin || !pl.enablePlugin) return false;
		await pl.disablePlugin(id);
		await pl.enablePlugin(id);
		return true;
	}

	async onload() {
		// FIRST LINE, so the first phase includes the field initialisation
		// below it — three hundred assignments is not free and it is exactly
		// the kind of thing nobody thinks to measure.
		this.loadMark('start');
		this._unloaded = false;
		// THE CRASH-LOOP GUARD. A freeze at start repeats at every start until
		// the plugin is removed by hand. A mark is written here and taken away
		// two seconds after the first real refresh; a mark found at the NEXT
		// start means the last one never got that far, and this start builds
		// nothing. The verdict is read after the settings load, in
		// startBlocked().
		this._startTripped = this.startGuardBegin();
		// ONE SENTENCE, ONCE A SESSION, when something this plugin owns throws
		// and is contained. The console has the detail and the site; a writer
		// whose Obsidian froze could not open the console to read it, which is
		// the whole reason there is a Notice at all. Wired here rather than in
		// the helper because `Notice` does not exist under the tests. The notice
		// carries a copy button, so a report can carry the stack and the
		// diagnostics without the reporter opening a console.
		wsGuardTell((where, err) => this.guardNotice(where, err));
		// ── Mask / letterbox state ─────────────────────────────────────────────
		wsFieldsReset(this);

		this.loadMark('fields');
		await this.loadSettings();
		// THE ONE MOST LIKELY TO BE THE ANSWER: it reads data.json, runs
		// every migration, and on a fresh vault writes defaults back.
		this.loadMark('loadSettings');
		// ── AN OLD INSTALLER IS NOT AN OLD APP ──────────────────────────────
		//
		// `minAppVersion` in the manifest gates the APP version, which
		// auto-updates — but the INSTALLER is the Electron shell, which never
		// does. A writer can be on a current app inside an old installer, sail
		// past the manifest gate, and get a stylesheet full of declarations
		// their Chromium has never heard of: `color-mix()` needs Chromium 111
		// and `:has()` needs 105. Both fail INVISIBLY — an invalid declaration
		// is dropped, not reported — so it files itself as "the plugin looks
		// broken".
		//
		// AND THE GATE: installers 1.5.12 and 1.8.3 froze Obsidian on enable,
		// 1.12.7 lagged, and every one of them was cured by a fresh installer.
		// Below 1.9 the plugin refuses to start and says why, once per launch;
		// between 1.9 and 1.13 it warns once per installer, remembered in
		// settings — a warning on every launch is a warning that gets turned
		// off in the reader's head. The version is the `obsidian/x.y.z` token
		// in the user agent, which is the INSTALLER speaking (the app can say
		// 1.13.7 while the token says 1.13.4); a phone has no token and is
		// never refused, and iOS has no Chromium to be warned about.
		try {
			const v = this.installerVerdict(this.installerVersion());
			if (v.kind === 'warn' && this.settings.oldInstallerSaid !== v.major) {
				this.settings.oldInstallerSaid = v.major || 0;
				void this.saveSettings(true);
				new Notice(v.text, 30000);
			}
		} catch (_) { wsCatch('onload: const v = this.installerVerdict(this.installerVersion());', _); }
		// A BLOCKED START BUILDS NOTHING. The settings tab is the one surface
		// that still opens, carrying the reason and, in safe mode, the door.
		// AND THE MARK COMES OFF AT ONCE: a blocked start builds nothing, so
		// there is nothing in it to freeze, and leaving the mark would make
		// every later start blocked too. Thirty seconds, not for ever: the
		// settings tab carries the reason for as long as it takes.
		const blocked = this.startBlocked();
		if (blocked) {
			this._startBlocked = blocked;
			this.startGuardEnd();
			try { new Notice(blocked.text, 30000); } catch (_) { wsCatch('onload: new Notice(this._startBlocked.text, 30000);', _); }
			try { this.uiApply(); } catch (_) { wsCatch('onload: uiApply (blocked)', _); }
			this._settingsTab = new WordSmithSettingTab(this.app, this);
			this.addSettingTab(this._settingsTab);
			this.loadMark('blocked');
			return;
		}
		// Settle the Glass borrow, if this vault has one outstanding. Runs
		// once and clears itself; see barThemeGlassRepay. (`saveSettings`
		// catches its own write, so this catch is a belt over a belt — kept
		// because it costs nothing.)
		if (this.barThemeGlassRepay()) { try { await this.saveSettings(); } catch (_) { wsCatch('onload: await this.saveSettings();', _); } }
		this._wasZenMode = this.zenOn();

		// Zen mode persists across restarts, but _wasZenMode above makes
		// setSidebarVisibility() a no-op on the first refresh() — so a vault
		// relaunched in zen mode could come back with body classes applied yet
		// sidebars open. Force the sidebars into the zen state once the
		// workspace layout exists, without touching the saved pre-zen
		// leftSidebar/rightSidebar restore state.
		this.app.workspace.onLayoutReady(() => {
			// THE ORDER, BEFORE THE FIRST SORT. `sortFolderItems` runs inside
			// Obsidian's own render and cannot wait for a file, so the store
			// is read once here and the tree is asked to sort again when it
			// lands. Without the second half the first draw of a session is
			// alphabetical and stays that way until something else moves.
			// THE CAPABILITIES ARE PROBED FOR EVERY VAULT, not only one with the
			// tree order on: the diagnostics dump and capMissing read them.
			try { this.caps = wsCompat(this.app).caps; } catch { this.caps = {}; }
			if (!this.settings.pluginEnabled || !this.settings.treeOrder) return;
			// ASKED WHEN THERE ARE PANES TO ASK. Half the table is about views
			// that do not exist during `onload`, and a look that runs too early
			// answers `null` for everything — honest and useless. `caps` is read
			// by the diagnostics dump.
			void (async () => { await this.treeOrderLoad(); this.patchExplorerSort(); })();
		});

		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.pluginEnabled || !this.zenOn()) return;
			const ws = this.app.workspace;
			if (ws.leftSplit  && !ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.collapse();
		});

		// Before anything draws a flag: the table every label and shape is
		// read from is built from the settings, not from the source.
		try { this.flagsApply(); } catch (_) { wsCatch('onload: this.flagsApply();', _); }

		// the settings in Obsidian's language (A692), before the tab is built
		try { this.uiApply(); } catch (_) { wsCatch('onload: uiApply', _); }
		this._settingsTab = new WordSmithSettingTab(this.app, this);
		this.addSettingTab(this._settingsTab);
		this.loadMark('settings tab');
		void this.setupBattery();

		// Commands
		// The panel: registered whenever the setting is on, so a workspace
		// saved with the pane open restores it at startup rather than
		// needing the writer to open it again.
		if (this.settings.menuDock) this.registerMenuPanel();
		// REGISTERED UNCONDITIONALLY AND AT LOAD, which is not the same as
		// building anything. Obsidian restores a saved workspace by asking
		// for the view type by name; a plugin that registers it lazily leaves
		// a writer's pane as an empty "no view of type" box until they happen
		// to run the command. Registering is a map entry — the tree is built
		// in `onOpen`, and only if the pane is actually there.
		this.registerOutlinerPane();
		// THE METHODS STAY WHERE THEY HAVE OTHER CALLERS: `openOutlinerPane` is
		// how `orgOpenTab` opens a tab that is not open, and `openOutlinerPopout`
		// is the window’s own pop-out door. `openWritingLayout` had no caller but
		// its command and goes with it.
		// A REPORT A WRITER CAN PASTE. Two freeze reports carried an OS, a
		// version and two console lines, one of which blamed Obsidian for a
		// method it has. This carries what would have answered them — and it
		// copies, because one of those writers could not open the console
		// after the freeze.
		wsRegisterCommands(this);
		// The icon first: the ribbon is about to ask for it by name.
		this.loadMark('commands');
		this.registerWsIcon();
		// "WS" badge ribbon button — OPENS THE MENU. On mobile Obsidian lists
		// ribbon items by this label, so the label is the only thing a phone
		// shows — it has to say what the button does. Obsidian's addRibbonIcon
		// expects a Lucide icon name; we replace the SVG it inserts with a text
		// badge and use a class hook for styling. The label doubles as the
		// tooltip. It opens the menu and not the master switch: the most
		// visible button must not be the most destructive one, a mis-click
		// that strips the workspace. MADE BY ITS OWN METHOD: the master switch
		// takes it off the ribbon and puts it back, and both need the same
		// builder.
		if (this.settings.pluginEnabled !== false) this.wsRibbonMake();

		// Workspace events
		// OUR ROWS ON OBSIDIAN'S OWN TREE, where the writer is already standing
		// when the thought occurs — the same place Obsidian puts every other
		// thing you can do to a folder.
		//
		// AND NOT ON OUR OWN, WHICH WOULD ADD THEM TWICE. The Organizer builds
		// its context menu by calling `fileMenuFor` directly — deliberately
		// BEFORE Rename and Delete, so both trees answer a right-click the same
		// way — and then broadcasts `file-menu` so a writer's other plugins
		// still work in this window. `fileMenuFor` is not idempotent (it appends
		// rows to a menu it did not build), so this listener skips the broadcast
		// by its source string: every other plugin still hears the event, and
		// the one listener that has already had its say stays quiet.
		wsWireWorkspace(this);


		// DOM events
		wsWireDocument(this);

		// Vault events
		wsWireVault(this);

		// Theme observer. Guarded on pluginEnabled: disablePlugin() removes
		// body classes, which fires this very observer — without the guard
		// it would recreate the injected styles and re-stamp CSS variables
		// immediately after they were removed.
		//
		// ── AND IT MUST NOT ANSWER ITSELF (GitHub #14) ──────────────────────
		//
		// This observer watches body's `class` and `style`; everything it
		// calls WRITES body's class and style. A callback that re-triggers
		// itself never lets the microtask queue drain, and Obsidian hangs with
		// no error and no crash — on a fresh install, the moment the plugin is
		// enabled. TWO HALVES, both in: the writers do not write when nothing
		// has changed (see `applyThemeClass`), and this flag stops the callback
		// re-entering while its own writes land. The `_themeGuarding` flag
		// inside `barThemeGuard` only protects that one function from calling
		// itself; it never covered this callback reaching `applyCssVariables`
		// directly.
		wsWatchTheme(this);

		this.loadMark('events + chrome');
		// CM6 decoration extensions (focus dimming + hidden markers)
		this.setupEditorExtensions();
		this.scheduleVimMotionMaps();
		this.loadMark('editor extensions');

		this.refresh();
		// THE FIRST PAINT, and the one that stands the whole plugin down
		// during `onload` because there is no leaf yet — see the note below.
		this.loadMark('first refresh');

		// The surface gate reads the most recent leaf in the MAIN area, and
		// during onload there is not one: every pane the workspace is about
		// to restore is still to come, so the refresh above necessarily
		// answers "not a note" and stands the whole plugin down. Ask again
		// once there is something to ask about.
		//
		// Registered here, at the end of onload, and not beside the zen
		// sidebar collapse near the top: onLayoutReady fires SYNCHRONOUSLY
		// when the layout is already ready, which is exactly what happens
		// when the plugin is switched on from the settings page — a refresh
		// registered up there would run against a half-built plugin.
		// EVERYTHING SYNCHRONOUS IS DONE. What follows is a callback, and on a
		// cold start it runs after Obsidian has built the workspace — so it is
		// timed separately rather than folded into the load.
		this.loadMark('onload done');
		this.app.workspace.onLayoutReady(() => wsOnLayoutReady(this));
	}

	// ── ONE WAY TO MAKE A WINDOW, AND IT IS ON THE REGISTER ────────
	//
	// A window must not outlive the plugin that drew it: after a reload,
	// a disable or an update, a window still on screen belongs to a
	// destroyed object — every listener in it is dead, so it eats
	// keystrokes and clicks and looks perfectly alive doing it. `onunload`
	// closes everything on the register.
	//
	// THE REGISTER IS KEPT AT THE CONSTRUCTOR, not asked of the callers:
	// "remember to register your modal" is a rule the sixth creation site
	// forgets. There is one way to make one, and a test counts the
	// constructor calls to keep it that way.
	wsModal() {
		if (!Modal) return null;
		const m = new Modal(this.app);
		if (!this._openModals) this._openModals = new Set();
		this._openModals.add(m);
		// AND OFF AGAIN WHEN IT SHUTS, or the set grows for the life of
		// the session and holds a dead modal per open.
		//
		// WRAPPED, NOT ASSIGNED. `modalHost` wraps `onClose` too, and so
		// does anything else that wants to know; each wrapper keeps the
		// one it found. This is the innermost and so runs last.
		const was = m.onClose ? m.onClose.bind(m) : null;
		m.onClose = () => {
			try { this._openModals.delete(m); } catch (_) { wsCatch('wsModal: this._openModals.delete(m);', _); }
			if (was) was();
		};
		return m;
	}
	onunload() {
		// FIRST: WORK QUEUED BEFORE THIS DOES NOT RUN AFTER IT. A refresh in the
		// moment before a disable (a toggle, settings synced in) leaves a
		// file-tree pass on a timer, and run after the cleanup below it
		// decorated Obsidian's tree again for a plugin that was gone.
		this._unloaded = true;
		// a peeked pane closes, so the panes are as the writer left them
		try { this.zenPeekEnd(); } catch (_) { wsCatch('onunload: this.zenPeekEnd();', _); }
		// the Typewriter's pending iOS scroll has no plugin to scroll for
		if (this._twIdle != null) { window.clearTimeout(this._twIdle); this._twIdle = null; this._twIdleView = null; }
		// {wpm}'s timer (A730)
		try { this.wpmTickStop(); } catch (_) { wsCatch('onunload: this.wpmTickStop();', _); }
		// today's words for the daily target, if a save was still waiting on a rest
		try { if (this._dailyWordsTimer != null) this.dailyWordsFlush(); } catch (_) { wsCatch('onunload: this.dailyWordsFlush();', _); }
		// THE SETTINGS TAB'S OBSERVER: it lives for the tab's life — not
		// disconnected on hide(), since Obsidian 1.13 re-renders the last
		// definitions on reopen without asking for them again — so this is the
		// one place it is cut; a watch on the settings window's body with no
		// plugin behind it is a leak.
		try { if (this._settingsTab) this._settingsTab.teardown(); } catch (_) { wsCatch('onunload: this._settingsTab.teardown();', _); }
		this._settingsTab = null;
		// THE WINDOWS GO FIRST, before anything they might read is torn
		// down. `close()` and not a DOM removal: the modal is Obsidian's,
		// and it has a focus trap, a scroll lock and a scope to give back.
		// OVER A COPY, because closing removes from the set being walked.
		//
		// AND ONLY WHAT IS ACTUALLY ON SCREEN. `wsModal` registers at
		// CONSTRUCTION, which is the only place a rule can be enforced — but
		// a modal built at the top of a method can still return without ever
		// calling `open()`, and closing one of those takes Obsidian into its
		// own stack for a window that was never on it ("e.isShown is not a
		// function"). `containerEl.isConnected` is the honest test of "is this
		// window on screen" — it is what `close()` is for and nothing else
		// needs closing.
		try {
			if (this._openModals) {
				for (const m of Array.from(this._openModals)) {
					try {
						if (m && m.containerEl && m.containerEl.isConnected) m.close();
					} catch (_) { wsCatch('onunload: if (m && m.containerEl && m.containerEl.isConnected) m.close();', _); }
				}
				this._openModals.clear();
			}
		} catch (_) { wsCatch('onunload: if (this._openModals)', _); }
		// THE WINDOW CONTROLS GO BACK. They are Electron's, not ours, and
		// they outlive the plugin: a writer who disables Word-Smith and
		// keeps a recoloured strip in the corner of their window has been
		// left a mess with no way to trace it.
		try { this.setWindowControlColours(false); } catch (_) { wsCatch('onunload: this.setWindowControlColours(false);', _); }
		// …AND SO DOES THE TREE'S ORDER, for the same reason and a sharper
		// one: this is a patched method on an object Obsidian owns and goes
		// on using. Leaving it in place after unload means a disabled plugin
		// still deciding what order a vault is in, with nothing on screen to
		// say why.
		try { this.unpatchExplorerSort(); } catch (_) { wsCatch('onunload: this.unpatchExplorerSort();', _); }
		// (The eye button was removed at 352; there is no longer a control of
		// ours in their header to take down.)
		// …and the sort MENU, which is a second patched method on the same
		// object Obsidian goes on using. A disabled plugin must not be
		// putting rows in somebody's menus.
		try { for (const v of this.explorerViews()) this.unpatchExplorerSortMenu(v); } catch (_) { wsCatch('onunload: for (const v of this.explorerViews()) this.unpatchExplorerSortMenu(v);', _); }
		// …and the sort button gets its own icon back. TOLD, NOT WRITTEN INTO THE SETTING (A873, the writer: "sometimes it
		// switches back to file name sort"): this set `treeOrder` off for the painter to read, and the History flush below
		// saved it, so every reload, update or quit with History on came back with the custom order off
		try { this.paintExplorerSortIcon(false); } catch (_) { wsCatch('onunload: this.paintExplorerSortIcon(false);', _); }
		// Anything counted since the last lazy save, before the timers that
		// would have written it are torn down. Synchronous-looking on purpose:
		// the promise is not awaited because onunload cannot await, but the
		// saveData call is issued before anything else is dismantled.
		if (this._historyTimers) {
			for (const t of this._historyTimers.values()) window.clearTimeout(t);
			this._historyTimers.clear();
		}
		if (this.settings && this.settings.historyTracking) {
			try { void this.historyFlush(true); } catch (_) { wsCatch('onunload: this.historyFlush(true);', _); }
		}
		// …and the goals file and the settings mirror, whose writes wait on timers (storeTimersFlush)
		try { this.storeTimersFlush(); } catch (_) { wsCatch('onunload: this.storeTimersFlush();', _); }
		// The linger timer holds a reference to this plugin instance and
		// would keep it alive past unload.
		this.endBarPeek(true);
		// The theme, by name. Uninstalling or updating the plugin unloads
		// it without ever calling disablePlugin(), and inline properties on
		// body outlive the stylesheet — so without this a removed plugin
		// leaves the workspace wearing a scheme it can no longer take off.
		this.barThemeUndress();
		// A CLEAN UNLOAD IS A START THAT FINISHED: a freeze never gets here, a
		// reload always does, so two reloads inside two seconds do not trip the
		// guard.
		try { this.startGuardEnd(); } catch (_) { wsCatch('onunload: this.startGuardEnd();', _); }
		// Clean up retro bar
		this.removeCustomElements();
		this.stopClockTick();
		// Clean up style injection
		this.clearStyleProps();
		// Clean up para tagger
		// Clean up word count observer
		this.detachExplorerObserver();
		this.removeWordCounts();
		// The tree's remote: the folder click listener. The windows have closed
		// by now and dropped their doors, but a start that never finished may
		// not have.
		this.orgTreeHookDetach();
		// …and the export ticks it painted into Obsidian's tree.
		this.orgTicksClear();
		// Clean up scroll/resize handlers
		this.detachScrollHandler();
		this.detachResizeHandler();
		// Clean up theme observer
		if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		if (this._fitRO) { this._fitRO.disconnect(); this._fitRO = null; }
		if (this._barRootRO) { this._barRootRO.disconnect(); this._barRootRO = null; }
		if (this._caretObs) { this._caretObs.disconnect(); this._caretObs = null; this._caretObsEl = null; }
		// Abort an in-flight mask drag (its move/up listeners would otherwise
		// outlive the plugin)
		if (this._activeDragCleanup) this._activeDragCleanup();
		// Detach battery listeners — they hold a reference to this plugin
		// instance and would keep it alive after unload
		if (this._batteryManager && this._batteryHandler) {
			this._batteryManager.removeEventListener('levelchange',    this._batteryHandler);
			this._batteryManager.removeEventListener('chargingchange', this._batteryHandler);
			this._batteryManager = this._batteryHandler = null;
		}
		// Cancel a pending debounced refresh
		if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
		if (this._ownExcludeTimer) { window.clearTimeout(this._ownExcludeTimer); this._ownExcludeTimer = null; }
		if (this._hemFlashTimer) { window.clearTimeout(this._hemFlashTimer); this._hemFlashTimer = null; }
		if (this._hemScreenTimer) { window.clearTimeout(this._hemScreenTimer); this._hemScreenTimer = null; }
		if (this._hemIconTimer) { window.clearTimeout(this._hemIconTimer); this._hemIconTimer = null; }
		if (this._hemScreenEl) { this._hemScreenEl.remove(); this._hemScreenEl = null; }
		this.closeBarPicker();
		// (A700: the goal's panel; A879: the daily target's)
		this.closeGoalPanel();
		this.closeDailyPanel();
		document.querySelectorAll('.cm-editor.ws-hem-blocked')
			.forEach(el => el.classList.remove('ws-hem-blocked'));
		// Leave zen cleanly. The MASTER goes down, matching how toggleZen()
		// leaves — and nothing is saved here, so data.json keeps both flags
		// and zen resumes when the plugin is loaded again.
		if (this.zenOn()) {
			this.settings.zenEnabled = false;
			this.applyBodyClasses();
			this.setSidebarVisibility();
		}
		this.settings.vimSoftWrapMotion = false;
		this.applyVimMotionMaps();
		this.clearAllBodyState();
		// Only the containers focused-file mode actually wrote to, and back to
		// what they held before. See _focusTabRestore.
		this._focusTabRestore();
		// THE NATIVE STATUS BAR: hidden by `body.zenmode-hide-status-bar` alone,
		// which clearAllBodyState above has just taken off; there is no inline
		// write to leave.
	}

	// ════════════════════════════════════════════════════════════════════════
	// SETTINGS: load, save, migrate
	// ════════════════════════════════════════════════════════════════════════

	// SETTINGS AS TEXT. The copy is exactly what data.json holds: wsForDisk
	// strips the session keys, as the save does. A paste goes through the
	// same door a load does — the defaults underneath, the repair pass over
	// the shape — so a hand-edited or foreign JSON cannot crash the plugin.
	// The previous settings are kept for one Undo.
	settingsCopyText() {
		return JSON.stringify(wsForDisk(this.settings), null, 2);
	}

	async settingsApplyRaw(raw: Record<string,unknown>) {
		const merged = Object.assign({}, DEFAULT_SETTINGS, raw);
		const repaired = wsRepairSettings(merged, DEFAULT_SETTINGS);
		for (const k of WS_SESSION_KEYS) delete merged[k];
		this.settings = merged;
		await this.saveSettings(true);
		return repaired;
	}

	async settingsPasteText(text: string): Promise<WsSettingsPasted> {
		let raw: unknown = null;
		try { raw = JSON.parse(String(text || '')); } catch { raw = null; }
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			return { error: 'the clipboard does not hold a settings object \u2014 copy one from this tab first.' };
		}
		this._settingsUndo = wsForDisk(this.settings);
		const bag = raw as Record<string, unknown>;
		const repaired = await this.settingsApplyRaw(bag);
		return { applied: Object.keys(bag).length, repaired };
	}

	async settingsUndoPaste(): Promise<WsSettingsPasted> {
		const prev = this._settingsUndo;
		if (!prev) return { error: 'there is nothing to undo.' };
		this._settingsUndo = null;
		const repaired = await this.settingsApplyRaw(prev);
		return { applied: Object.keys(prev).length, repaired };
	}

	// RESET A GROUP, by key. The settings tab hands over the keys a group's
	// rows write — read off its definitions, so there is no second table to
	// hold to the render. A reset drops those keys from the disk shape and
	// goes through the same door a load and a paste do, so the defaults come
	// back underneath and the repair pass runs; the previous settings are
	// kept for the one Undo the paste has. A key on no row — the window's, a
	// picker's — is never in a list, so never touched.
	async settingsResetKeys(keys: string[]) {
		if (!Array.isArray(keys) || !keys.length) return { error: 'nothing to reset.' };
		this._settingsUndo = wsForDisk(this.settings);
		const raw = wsForDisk(this.settings);
		let changed = 0;
		const base = wsBag(DEFAULT_SETTINGS);
		// (an export value, `exportOpts.<key>`, A855: back to what a fresh export starts with, the export's others kept)
		const exportBase = wsBag(this.exportDefaultsOf());
		let exported = false;
		for (const k of keys) {
			if (k.startsWith('exportOpts.')) {
				const sub = k.slice('exportOpts.'.length), eo = raw.exportOpts;
				if (!eo || typeof eo !== 'object') continue;
				const bag = wsBag(eo);
				if (JSON.stringify(bag[sub]) !== JSON.stringify(exportBase[sub])) changed++;
				if (exportBase[sub] === undefined) delete bag[sub]; else bag[sub] = exportBase[sub];
				exported = true;
				continue;
			}
			if (JSON.stringify(raw[k]) !== JSON.stringify(base[k])) changed++;
			delete raw[k];
		}
		await this.settingsApplyRaw(raw);
		// (an open Export tab's preview follows)
		if (exported) { try { this.exportOptsChanged(); } catch (_) { wsCatch('settingsResetKeys: exportOptsChanged', _); } }
		// A RESET OF THE HISTORY GROUP STARTS THE RECORD OVER: with no store
		// file anywhere in the vault, the memory of one goes too, so the next
		// write — the toggle, or Delete all history — makes a first rather than
		// a notice that none was made. A file that is there is left alone: the
		// reset is about the switches, not the record. The group is known by
		// its switch.
		if (keys.includes('historyTracking')) {
			try {
				if (this.settings.historySeen && !(await this.historyFindFile())) {
					this.settings.historySeen = false;
					await this.saveSettings();
				}
			} catch (_) { wsCatch('settingsResetKeys: if (this.settings.historySeen && !(await this.historyFindFile()))', _); }
		}
		return { changed, keys: keys.length };
	}

	// ── SETTINGS THAT ARRIVE FROM ANOTHER DEVICE ────────────────────────
	//
	// Obsidian calls this when data.json changes under the running plugin:
	// Obsidian Sync bringing another device's settings, or any tool that
	// rewrites the file. Without it the plugin kept its copy in memory and
	// wrote it back at its next save, and Sync carried that back: the other
	// device's change undone, in both directions.
	//
	// THE SAME LOAD AS AT START, so every repair, migration and retirement
	// applies to what arrived, then the same refresh a settings change takes.
	// NOTHING IS WRITTEN: loadSettings writes nothing, and a write here would
	// go back to the device that sent it. INTO THE SAME OBJECT: windows hold
	// `plugin.settings`, and a new object would leave them writing into one
	// nothing saves. This window's session view is kept. A file that cannot
	// be read mid-sync leaves everything as it was.
	async onExternalSettingsChange() {
		const live = this.settings;
		const bag = wsBag(live);
		const session: Record<string, unknown> = {};
		for (const k of WS_SESSION_KEYS) if (Object.prototype.hasOwnProperty.call(bag, k)) session[k] = bag[k];
		try { await this.loadSettings(); }
		catch (e) { this.settings = live; wsCatch('onExternalSettingsChange: loadSettings', e); return; }
		const fresh = wsBag(this.settings);
		for (const k of Object.keys(bag)) if (!(k in fresh)) delete bag[k];
		Object.assign(bag, fresh, session);
		this.settings = live;
		try { this.refresh(); } catch (e) { wsCatch('onExternalSettingsChange: refresh', e); }
		const tab = this._settingsTab;
		try { if (tab && tab.containerEl && tab.containerEl.isConnected) tab.update(); }
		catch (e) { wsCatch('onExternalSettingsChange: the settings page', e); }
	}

	// THE WELCOME (A743): opened from Settings → About, and once on a new install's first start
	openWelcome() { new WsWelcomeModal(this.app, this).open(); }
	async welcomeOnFirstStart(restored: boolean) {
		if (this.settings.welcomeShown || !this.settings.pluginEnabled || this._startBlocked) return;
		this.settings.welcomeShown = true;
		await this.saveSettings();
		if (!restored) this.openWelcome();
	}

	async loadSettings() {
		// The RAW file is kept alongside the merged copy: a migration that
		// asks "did this vault ever have an opinion about X" cannot ask the
		// merged object, where every key is present because the defaults put
		// it there.
		const raw: WsRawSettings = ((await this.loadData()) as WsRawSettings | null) || {};

		// THE STEPS, IN ORDER: each reads what the ones before it left (a key renamed in one is read by its new name in
		// the next), so they run as they are listed. (One method of 750 lines until 2026-10-22.)
		this.settingsMeetSchema(raw);
		this.settingsMigrateOnce(raw);
		this.settingsOldShapes();
		this.settingsDropDeadKeys(raw);
		this.settingsBarValues();
		this.settingsSeedPresets(raw);
	}

	// THE FILE OVER THE DEFAULTS: repaired where a value is the wrong kind, the session keys fresh, the nested stores
	// whole (loadSettings, step 1 of 6).
	settingsMeetSchema(raw: WsRawSettings) {
		// KEPT, and kept as it came. The settings mirror restores only when
		// data.json had nothing to say, and "nothing" cannot be asked of the
		// merged object — every key is present there because the defaults put
		// it there. `loadData` answers null for a file that is not there and
		// `{}` for one that is empty; both are the restore case, and the
		// difference is worth nothing to us, so the coalesce above is safe.
		this._rawData = raw;
		// THE FILE MEETS THE SCHEMA: the defaults with the file's values over them,
		// said to be the schema's shape here and MADE so by `wsRepairSettings`
		// below, which holds every key to its kind.
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw as Partial<WordSmithSettings>);
		// ── AND THE SESSION KEYS START FRESH ─────────────────────────────
		//
		// A `data.json` written by an older build still carries them, and
		// honouring them would be the old behaviour outliving the change that
		// removed it. Deleted rather than overwritten, so every reader falls
		// through to its own default. REPAIR ON READ comes first: before the
		// session keys are dropped (a dropped key is undefined — an absent
		// shape, not a wrong one), before any migration reads a value, and
		// before any reader trusts a shape. The migrations below read from
		// `raw`, which is untouched — a repaired key is a key the file held in
		// a shape no migration was written for. Told once, in the console, by
		// name; and kept on the instance for the diagnostics dump.
		this._repairedKeys = wsRepairSettings(this.settings, DEFAULT_SETTINGS);
		if (this._repairedKeys.length) {
			try {
				console.warn('Word-Smith: ' + this._repairedKeys.length
					+ ' setting(s) in data.json had the wrong shape and were reset to their defaults: '
					+ this._repairedKeys.join(', '));
			} catch (_) { wsCatch('loadSettings: console.warn(\'Word-Smith: \' + this._repairedKeys.length', _); }
		}
		for (const k of WS_SESSION_KEYS) delete wsBag(this.settings)[k];

		// Immediately, not lazily. That merge is SHALLOW, so every nested
		// default is shared by reference with DEFAULT_SETTINGS until something
		// replaces it — and the baseline cache is written on a hot path.
		// Building the real object here means no later code path can be the
		// first to touch it and mutate the table.
		this.historyBaselines();
	}

	// THE MIGRATIONS THAT DECIDE ONCE: each asks the raw file (did this vault ever have an opinion) or keeps a flag, so
	// it can never overrule a choice made later (loadSettings, step 2 of 6).
	settingsMigrateOnce(raw: WsRawSettings) {
		// letterboxCustomColors arrived in 1.11, and the four arrow/line
		// pickers it now gates were unconditional before it. A vault that had
		// picked its own colours WAS using them, so the toggle comes up on
		// for that vault and its letterbox looks the same after the upgrade
		// as before. One still on the shipped four gets the new default,
		// which is to follow the theme's text colour.
		//
		// Guarded on the key being absent from the raw file, so this decides
		// exactly once and can never overrule a choice made later.
		if (raw.letterboxCustomColors === undefined) {
			this.settings.letterboxCustomColors = ['arrowDarkColor', 'arrowLightColor',
				'lineDarkColor', 'lineLightColor']
				.some(k => raw[k] !== undefined && raw[k] !== wsBag(DEFAULT_SETTINGS)[k]);
		}
		// ── CURSORS UNDER THEME, ONCE ─────────────────────────────────────
		// The menu's Cursors row is new, and an order a writer saved before it
		// existed would take it under its last row (`menuLayout` appends what an
		// order does not name). It goes under Theme, where the shipped order has
		// it. Decided by the saved order not naming it, so this happens once: the
		// next save names it, and wherever a writer drags it after that is theirs.
		if (Array.isArray(raw.menuOrder) && !raw.menuOrder.includes('cursors')) {
			const order = this.settings.menuOrder;
			const at = Array.isArray(order) ? order.indexOf('theme') : -1;
			if (at !== -1) order.splice(at + 1, 0, 'cursors');
		}
		// ── LANGUAGE UNDER PROSE, ONCE (A601): the same rule as Cursors above ──
		if (Array.isArray(raw.menuOrder) && !raw.menuOrder.includes('lang')) {
			const order = this.settings.menuOrder;
			const at = Array.isArray(order) ? order.indexOf('prose') : -1;
			if (at !== -1) order.splice(at + 1, 0, 'lang');
		}
		// `barThemeLight` lived one unreleased day; a vault that ran that build
		// carries it.
		delete this.settings.barThemeLight;
		// editorFont once shipped with a real font name as its default, so every
		// vault that saved has that name in data.json whether or not anyone chose
		// it. Cleared exactly once, and only when the value is still character-
		// for-character the old default: a writer who picked another face has a
		// different string and is not touched.
		// THE TREE'S ORDER COMES ON ONCE, FOR EVERYONE. The default alone could
		// not do it: `saveSettings` persists the MERGED object, so every vault
		// that has saved settings even once already carries `treeOrder` and the
		// raw value wins the merge above. SO IT IS FORCED, EXACTLY ONCE, and the
		// flag is what keeps the switch a switch: without it every reload would
		// re-assert the order, and the toggle in Settings → File tree — and
		// "Custom sort" in the explorer's own menu, which writes the same key —
		// would both appear to do nothing the next time the plugin loaded.
		if (!this.settings.treeOrderForcedOn) {
			this.settings.treeOrder = true;
			this.settings.treeOrderForcedOn = true;
		}
		// …AND ONCE MORE (A873, the writer: "sometimes it switches back to file name sort"): every unload set it off and the
		// History flush saved that, at each reload, update and quit, so a vault's off is mostly the fault's and not a choice.
		// On again once, the same idiom; the switch is a switch from then on
		if (!this.settings.treeOrderBackOnce) {
			this.settings.treeOrder = true;
			this.settings.treeOrderBackOnce = true;
		}
		// ── THE FILE ICONS GO, ONCE ──────────────────────────────────────
		//
		// Both keys already exist in older vaults, so a default cannot reach
		// them; this is the `treeOrderForcedOn` idiom instead — forced exactly
		// once, with a marker that keeps the switch a switch. The switches are
		// not deleted: off is one click from on.
		if (!this.settings.fileIconsOffOnce) {
			this.settings.orgFileIcons = false;
			this.settings.fileTreeKindIcons = false;
			this.settings.fileIconsOffOnce = true;
		}
		if (!this.settings.editorFontDefaultCleared) {
			if (this.settings.editorFont === 'JetBrainsMono Nerd Font') {
				this.settings.editorFont = '';
			}
			this.settings.editorFontDefaultCleared = true;
		}
		// THE SAME TRAP, AND THE SAME CURE: the Outline flag becomes Sketch.
		//
		// Changing a default is not enough. `flags` is in DEFAULT_SETTINGS, so
		// every vault that has ever saved its settings has the old labels
		// written into data.json — exactly the reason the editorFont fix above
		// exists, and it was learned the hard way there.
		//
		// The label moved because the tab beside it is called Outliner now, and
		// a window with an Outliner tab whose rows can be flagged "Outline" is
		// one word meaning two things eight inches apart.
		//
		// ONLY WHEN IT IS STILL CHARACTER-FOR-CHARACTER THE OLD DEFAULT, and
		// only once. A writer who renamed that flag to something of their own
		// is not touched; one who had deliberately chosen the identical word
		// loses it once and types it back. THE ID IS NOT TOUCHED AT ALL — it is
		// what is written against a path in the vault, and rewriting it would
		// drop the flag off every note carrying one.
		if (!this.settings.outlineFlagRenamed) {
			try {
				for (const f of (this.settings.flags || [])) {
					if (f && f.id === 'outline' && f.label === 'Outline') f.label = 'Sketch';
				}
			} catch (_) { wsCatch('loadSettings: for (const f of (this.settings.flags || []))', _); }
			this.settings.outlineFlagRenamed = true;
		}
		// TYPEWRITER: the two "lines" settings become one anchor percentage.
		// LOSSLESS, because the old pair was never a pair of line counts —
		// the scroll code reduced it to `above / (above + below)` and used
		// that as a fraction of the viewport height. So the ratio IS the new
		// number, and every existing vault keeps the caret exactly where it
		// had it. Read from `raw` rather than from the merged settings so a
		// vault that never touched them is not migrated onto a default.
		if (raw.typewriterAnchor === undefined
			&& (raw.typewriterLinesAbove !== undefined || raw.typewriterLinesBelow !== undefined)) {
			const a = Math.max(0, Number(raw.typewriterLinesAbove) || 0);
			const b = Math.max(0, Number(raw.typewriterLinesBelow) || 0);
			const t = a + b;
			this.settings.typewriterAnchor = t > 0 ? Math.round((a / t) * 100) : 50;
		}
	}

	// OLD SHAPES CARRIED INTO NEW ONES: the bar's rows, a padding split in two, the keys of features that went
	// (loadSettings, step 3 of 6).
	settingsOldShapes() {
		delete this.settings.barThemeMarginalia;
		delete this.settings.marginaliaGutter;
		delete this.settings.typewriterLinesAbove;
		delete this.settings.typewriterLinesBelow;
		// Migrate old letterboxRatio
		if (this.settings.letterboxRatio != null) {
			if (this.settings.letterboxPx == null)
				this.settings.letterboxPx = this.settings.letterboxRatio * 200;
			delete this.settings.letterboxRatio;
		}
		// Migrate the old single-field retro bar format into the center slot
		// of the new left/center/right layout.
		if (this.settings.statusFormatText != null) {
			this.settings.statusFormatCenter = this.settings.statusFormatText;
			delete this.settings.statusFormatText;
		}
		// Fold the flat left/center/right keys into row 0 of the multi-row
		// model, then drop them. Done before the normalisation below so a
		// vault upgrading from either older shape lands in the same place.
		if (this.settings.statusFormatLeft   != null ||
			this.settings.statusFormatCenter != null ||
			this.settings.statusFormatRight  != null) {
			const rows = Array.isArray(this.settings.statusRows)
				? this.settings.statusRows.slice()
				: DEFAULT_SETTINGS.statusRows.map(r => Object.assign({}, r));
			const row0 = Object.assign({ left: '', center: '', right: '' }, rows[0] || {});
			if (this.settings.statusFormatLeft   != null) row0.left   = this.settings.statusFormatLeft;
			if (this.settings.statusFormatCenter != null) row0.center = this.settings.statusFormatCenter;
			if (this.settings.statusFormatRight  != null) row0.right  = this.settings.statusFormatRight;
			rows[0] = row0;
			this.settings.statusRows = rows;
			delete this.settings.statusFormatLeft;
			delete this.settings.statusFormatCenter;
			delete this.settings.statusFormatRight;
		}
		// {wpm} was removed. Scrub it from saved rows, or anyone who used it
		// is left staring at the literal text "{wpm}" in their bar forever.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right'] as const) {
					if (typeof row[slot] === 'string' && row[slot].includes('{wpm}')) {
						row[slot] = row[slot].replace(/\s*\{wpm\}\s*(wpm)?/g, '').trim();
					}
				}
			}
		}
		delete this.settings.wpmWindowSec;
		// Positioning the gutter against the text column was more trouble
		// than the distance it saved; the numbers sit where CodeMirror puts
		// them again.
		for (const dead of ['lineNumberGap', 'lineNumberWidth', 'showLineNumbers',
			'lineNumberMode', 'lineNumberVisual', 'lineNumberSize']) {
			delete wsBag(this.settings)[dead];
		}
		// One symmetric padding became two, so the split starts from whatever
		// the single value was rather than snapping back to the default.
		// Settings arrive merged over DEFAULT_SETTINGS, so the two new keys are
		// never null by the time this runs — guarding on them would make the
		// whole migration a no-op. The presence of the retired key is the
		// signal, and it is enough on its own.
		if (this.settings.statusBarPadding != null) {
			const pad = this.settings.statusBarPadding;
			this.settings.statusBarPadTop    = pad;
			this.settings.statusBarPadBottom = pad;
			delete this.settings.statusBarPadding;
		}
		// The auto-hiding bar was replaced by a command.
		for (const dead of ['zenAutoHideBar', 'zenAutoHideDelay', 'zenAutoHideZone']) {
			delete wsBag(this.settings)[dead];
		}
		// {nump} became {num}; {toc}, {textview} and {lock} were removed — the
		// last of those because the H badge in {mode} already says the same
		// thing. Rewrite saved rows so nobody is left with literal token text.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right'] as const) {
					if (typeof row[slot] !== 'string') continue;
					const before = row[slot];
					let v = before
						.split('{nump}').join('{num}')
						.replace(/\s*\{(toc|textview|lock)\}\s*/g, ' ')
						.replace(/[ \t]{2,}/g, ' ');
					// Only tidy the edges of a slot a token was actually
					// removed from: that slot's spacing is changing anyway, and
					// the substitution leaves a space of its own behind. Slots
					// left alone keep whatever padding was deliberately typed.
					if (v !== before) v = v.trim();
					row[slot] = v;
				}
			}
		}
		// Prose analysis (adverb / passive / hedge marking) was removed; only
		// its code-skipping preference carries over, since syntax highlight
		// wants the same answer.
		// The flash used to be a boolean that outlined the editor. Screen is
		// the closest equivalent of "on".
		if (this.settings.hemFlashOnBlock != null) {
			this.settings.hemFlashTarget = this.settings.hemFlashOnBlock ? 'screen' : 'none';
			delete this.settings.hemFlashOnBlock;
		}
		if (this.settings.proseSkipCode != null) {
			this.settings.syntaxSkipCode = !!this.settings.proseSkipCode;
		}
		for (const dead of ['proseEnabled', 'proseSkipCode', 'proseHighlightStyle',
			'proseAdverbs', 'proseAdverbColor', 'prosePassive', 'prosePassiveColor',
			'proseWeasel', 'proseWeaselColor']) {
			delete wsBag(this.settings)[dead];
		}
		// The unified-colours feature and the preset system (saved looks +
		// share codes) were removed. Their keys are dropped from data.json
		// so a hand-read config does not suggest features that no longer
		// exist; any override an older version left inline on body.style is
		// wiped by clearChromeColors() on the first apply pass.
		for (const dead of ['uiColorsEnabled', 'uiBgColor', 'uiTextColor',
			'uiUnifyChrome', 'presets']) {
			delete wsBag(this.settings)[dead];
		}
		// The file-goal hairline (a progress line on the bar's top edge) was
		// removed. Its toggle, its gauge-style selector and the three goal
		// colours went with it — those colours tinted the hairline and
		// nothing else, so keeping pickers for them would have meant
		// controls that change nothing. folderGoalHairline was already dead
		// before this and is swept up here too.
		for (const dead of ['fileGoalHairline', 'folderGoalHairline',
			'goalGaugeStyle', 'goalShowGauge', 'goalCustomColors',
			'goalColor', 'fileGoalColor', 'folderGoalColor']) {
			delete wsBag(this.settings)[dead];
		}
		// The note mini-theme ("Customise background and text") was removed
		// outright. It repainted the whole window from two picked colours
		// and never became reliable across themes; what survives is the
		// cleanup below, because the two colours it stamped lived inline on
		// body.style and an inline custom property outlives an upgrade.
		for (const dead of ['noteCustomColors', 'noteDarkBgColor',
			'noteDarkTextColor', 'noteLightBgColor', 'noteLightTextColor']) {
			delete wsBag(this.settings)[dead];
		}
	}

	// THE DEAD KEYS, DELETED RATHER THAN IGNORED, and the columns' stores brought to today's names (loadSettings, step 4
	// of 6).
	settingsDropDeadKeys(raw: WsRawSettings) {
		// ── THE DEAD KEYS, DELETED RATHER THAN IGNORED ───────────────────
		//
		// A value that still parses under a plausible name is a value somebody
		// reuses: the ch store was once written under `uniCols`, read a vault's
		// old PIXELS as characters, and drew four columns 432px wide. So every
		// retired key is deleted on load, and none is converted.
		//
		// `uniCols`: per-column widths in pixels; a pixel count depends on the
		// font it was dragged in, which is not recorded.
		delete this.settings.uniCols;
		// `folderGoals`: a number typed on a FOLDER used to beat the sum of the
		// notes under it; there is one answer now and it derives.
		delete this.settings.folderGoals;
		// `goalUnit` (A705): words or characters for a target, never released; a target counts words.
		delete this.settings.goalUnit;
		// `goalTokenFormat` (A707): how {goal} read, never released; {target} is the one token now, its shape targetTokenFormat.
		delete this.settings.goalTokenFormat;
		// {target}'S FIVE (A754, the writer: "only those 5 options"): a shape cut that day reads as the nearest of the
		// five, and `targetTokenFollows` (A726, whose goal) goes, never released; its "Today's share" was Words to go today
		const tf = String(this.settings.targetTokenFormat || '');
		const follows = wsBag(this.settings).targetTokenFollows;
		if (tf === 'left' || (follows === 'daily' && (tf === 'ratio' || tf === 'percent'))) this.settings.targetTokenFormat = 'today';
		else if (tf === 'barcount' || tf === 'barpercent') this.settings.targetTokenFormat = 'bar';
		else if (!['ratio', 'today', 'percent', 'bar', 'icon'].includes(tf)) this.settings.targetTokenFormat = 'percent';
		delete this.settings.targetTokenFollows;
		// {dailytarget}'s three shapes: anything else reads as the words over the target
		if (!['ratio', 'percent', 'bar'].includes(String(this.settings.dailyTargetFormat || ''))) this.settings.dailyTargetFormat = 'ratio';
		// `markNbsp`, `markInvisible` and `markOther` (A768, A771, A777), never released: the markers they drew are gone (A780)
		delete this.settings.markNbsp; delete this.settings.markInvisible; delete this.settings.markOther;
		// `goalCelebrate` and `goalMetSeen` (A700), never released: the celebration is gone (A786)
		delete this.settings.goalCelebrate; delete this.settings.goalMetSeen;
		// `typoQuoteSpace` (A770), never released: the space with « » is typed in Custom quote marks since A776
		delete this.settings.typoQuoteSpace;
		// `exportOpts.tocPages` (A751, released in 1.8.3): the contents always carry their page numbers (the writer: "table of
		// contents always have page numbers, so remove that extra page numbers option for toc")
		if (this.settings.exportOpts) delete wsBag(this.settings.exportOpts).tocPages;
		// `exportOpts.paraStart` (#77's dropdown), never released: Keep line breaks (`keepLineBreaks`) since the writer's word
		if (this.settings.exportOpts) delete wsBag(this.settings.exportOpts).paraStart;
		// A839'S FIRST COLORS, never released (the writer: "pronouns are still yellowish"): a vault saved between 963ac0d and
		// 97cf292 kept Pronouns gold and Clichés teal, and a saved value outlives a changed default; exactly those two take
		// today's (measured: the showcase vault had both)
		if (raw.posPronounColor === '#c9a227') this.settings.posPronounColor = DEFAULT_SETTINGS.posPronounColor;
		if (raw.checkClicheColor === '#3aa597') this.settings.checkClicheColor = DEFAULT_SETTINGS.checkClicheColor;
		// PARAGRAPH SPACING, ONE CHOICE (A834, the writer's pick "One dropdown"): `paraBlank` and `keepLineBreaks` (#77, released
		// in 1.8.4) read once into `paraSpacing`, then gone. Keep line breaks is Auto: blank lines are kept always since A849,
		// and so is Your blank lines (`note`, never released), which is no choice now
		if (this.settings.exportOpts) {
			const eo = wsBag(this.settings.exportOpts);
			if (eo.paraSpacing === undefined) eo.paraSpacing = eo.paraBlank ? 'line' : 'auto';
			if (eo.paraSpacing === 'note') eo.paraSpacing = 'auto';
			delete eo.paraBlank; delete eo.keepLineBreaks;
			// THE ADDRESS ONE BOX (A843, the writer: "don't make adress a token, just a text box that can have 3,4 lines"): the
			// four lines (never released) read once into it, then gone
			const lines4 = [eo.address1, eo.address2, eo.address3, eo.address4].map((x) => wsStr(x).trim()).filter(Boolean);
			if (eo.address === undefined && lines4.length) eo.address = lines4.join('\n');
			delete eo.address1; delete eo.address2; delete eo.address3; delete eo.address4;
			// HEADINGS AS ONE LIST (the writer's pick "One list"): Insert heading's answer (`chapterTitles`, released) read once into
			// File names and Note headings, then gone; Number the headings and its suffix (#79, never released) into the numbers
			if (typeof eo.chapterTitles === 'string') {
				eo.sectionTitles = eo.chapterTitles === 'file' || eo.chapterTitles === 'both';
				eo.keepHeadings = eo.chapterTitles === 'note' || eo.chapterTitles === 'both';
			}
			if (eo.numberStyle === undefined && eo.numberHeads) eo.numberStyle = 'decimal';
			delete eo.chapterTitles; delete eo.numberHeads; delete eo.numberSuffix;
			// THE LAST EXPORT, NEVER READ (A872, Fable's review): `lastRun` written on every export for a "Set up again" never
			// built, `lastScope` and `listColumn` a default and a check nothing read; gone, and gone from a vault that has them
			delete eo.lastRun; delete eo.lastScope; delete eo.listColumn;
		}
		// A VAULT WITH SETTINGS BEFORE THE WELCOME HAS SEEN WORD-SMITH (A743): only a new install meets it; asked of the
		// FILE, so it decides once
		if (raw.welcomeShown === undefined && Object.keys(raw).length > 0) this.settings.welcomeShown = true;
		// SENTENCE RHYTHM'S OLD DEFAULTS FOLLOW THE THEME (A782): a vault that never picked a tint saved the default; the
		// three hexes read as "the theme's" once, and a color the writer chose stays theirs
		for (const [k, old] of [['checkRhythmHardColor', '#d4a017'], ['checkRhythmVeryHardColor', '#c2544d'], ['checkRhythmShortColor', '#5aa469']] as const) {
			if (typeof raw[k] === 'string' && raw[k].toLowerCase() === old) this.settings[k] = '';
		}
		// `uniColCh`: the same store in characters; the handles that wrote it
		// are gone and every reading column sizes itself to its contents.
		delete this.settings.uniColCh;
		// `exportTicksAlways`: the export ticks in Obsidian's tree are on only
		// while an Export pane is open.
		delete this.settings.exportTicksAlways;
		// `interfaceInPack`: the interface in a language pack's words (A586),
		// built and taken out the same night on the writer's word; never released,
		// but a vault that tried it saved the switch.
		delete wsBag(this.settings).interfaceInPack;
		// `zenPanesQuiet`: Zen's side panes hid the file tree's buttons until the
		// pointer came (A578), taken out on the writer's word (A597) before it shipped.
		delete wsBag(this.settings).zenPanesQuiet;
		// `zenPanesDim`, `zenPanesPeek`, `zenPanesOver`: the side panes' ways, each
		// its own switch (A578), one switch, Zen Sidebars, since (A604), unshipped.
		delete wsBag(this.settings).zenPanesDim;
		delete wsBag(this.settings).zenPanesPeek;
		delete wsBag(this.settings).zenPanesOver;
		// ── RETIRED IN 1.6.8 (A508) ── read by nothing, and written into every
		// data.json by every preset applied until now: the bar's row count (it
		// draws one), the separator's angle (a constant), the 1.2.x colours
		// BAR_KEYS_INERT lists, the vault-wide goal and its label mode. Out of
		// the saved presets too, which are applied whole, and their rows cut to
		// the one the bar draws.
		for (const k of WS_RETIRED_KEYS) delete wsBag(this.settings)[k];
		for (const snap of Object.values(this.settings.barPresets || {})) {
			if (!snap || typeof snap !== 'object') continue;
			for (const k of BAR_KEYS_INERT) delete wsBag(snap)[k];
			if (Array.isArray(snap.statusRows)) snap.statusRows = snap.statusRows.slice(0, 1);
		}
		// `manuscriptRoots`: the folders that were THE WRITING — what the counts
		// counted, what the compile compiled. Everything in the vault is the
		// writing now. A stale list here is not inert: a vault held `["Booksa"]`,
		// an empty folder, and every total in it was about nothing with no
		// visible sign.
		delete this.settings.manuscriptRoots;
		// `organizerRoot`: one folder the Organizer's tree, totals and compile
		// hung from; the folder the writer clicked (`organizerFolder`) is the
		// visible start now. The `manuscriptRoots` shape exactly — a stale path
		// a future reader could treat as the root.
		delete this.settings.organizerRoot;
		// `uniRootShut`: the fold of the Organizer's own tree, gone with that
		// tree.
		delete this.settings.uniRootShut;
		// `organizerRootShut`: the table's root fold; the subject row that
		// switched it is the Total row now.
		delete this.settings.organizerRootShut;
		// `uniTreeWidth`: dragged by the grip between two panes; there is one
		// pane.
		delete this.settings.uniTreeWidth;
		// `uniShut`: that tree's own fold set.
		delete this.settings.uniShut;
		// `fileTreeGoals`: the tree's goal percentage; the switch is gone.
		delete this.settings.fileTreeGoals;

		// SEVEN GOAL KEYS NOTHING EVER READ: each carried a default and a slot
		// in every vault's data.json, and `settings.<key>` appears nowhere in
		// the plugin (`goalsFile` hid behind `goalsFileSync` and its kin — the
		// goals file syncs on a SIGNATURE and asks no switch). Deleting them
		// removes a line from a file, not a feature.
		delete this.settings.goalsFile;
		delete this.settings.goalBaseline;
		delete this.settings.goalRingWeight;
		delete this.settings.goalOrientation;
		delete this.settings.goalLenWriting;
		delete this.settings.goalLenFile;
		delete this.settings.goalLenFolder;

		// `organizerMode`: Outline mode is gone; the only mode is the table.
		delete this.settings.organizerMode;
		// …and the stores the mode owned:
		delete this.settings.organizerOutlineProps;
		// `synopsisKey`: the frontmatter key a synopsis was read from; nothing
		// displays that field.
		delete this.settings.synopsisKey;
		// `organizerOutlineProp`, `organizerOutlineReads`: the outline's chosen
		// property and its readings.
		delete this.settings.organizerOutlineProp;
		delete this.settings.organizerOutlineReads;
		// `organizerLongFields`: written by the ★ column, the properties an
		// Outline card drew in full. It was never in DEFAULT_SETTINGS: a
		// default is never absent, and a shipped `['synopsis']` would have
		// overruled a writer's own key.
		delete this.settings.organizerLongFields;
		// `organizerNameColPx` → `uniColPx.name`: the Name column had ONE
		// number; twelve columns need twelve, so there is one map and the Name
		// column is a member of it. KEYED ON `raw`, DECIDED ONCE: it runs only
		// where the map is ABSENT, so a writer who has since dragged the Name
		// column cannot have the old number put back over it. Read from `raw`,
		// not `this.settings`, where the defaults have already been merged in.
		if (raw.uniColPx === undefined) {
			const px = Number(raw.organizerNameColPx);
			if (isFinite(px) && px > 0) this.settings.uniColPx = { name: Math.round(px) };
		}
		// And the old key goes.
		delete this.settings.organizerNameColPx;
		// THE DEADLINE'S COLUMNS START OFF (A700). A vault that has shaped its columns keeps a list of what is OFF, so a
		// new column arrives ON in it; these three wait to be asked for, as on a fresh vault. Keyed on `raw.goalDeadlines`,
		// absent only until this build first saves: decided once, never over a column the writer later turned on.
		if (raw.goalDeadlines === undefined && Array.isArray(this.settings.uniColsOff)) {
			for (const id of ['deadline']) if (this.settings.uniColsOff.indexOf(id) === -1) this.settings.uniColsOff.push(id);
		}
		// PER DAY IS GONE (A725): a dev build's vault may name it among the hidden columns or the widths; a dead name
		// is one somebody reuses
		// A731's `orgDeadlineShow` ('days' | 'date'), never released: `orgDeadlineCell` since A735, the date and the days
		delete this.settings.orgDeadlineShow;
		// {wpm}'s 'best' (A730), never released, gone on the writer's word (A738): the speed now
		if (this.settings.wpmTokenFormat === 'best') this.settings.wpmTokenFormat = 'now';
		// …its 'avg' and its unit (A730), never released, gone on the writer's word (A788: "wpm should only do
		// wordperminute no charsper minute, remove the average while typing"): the speed now, in words a minute
		if (this.settings.wpmTokenFormat === 'avg') this.settings.wpmTokenFormat = 'now';
		delete this.settings.wpmTokenUnit;
		// …AND DAYS LEFT (A731), the Deadline cell's own now
		if (Array.isArray(this.settings.uniColsOff)) this.settings.uniColsOff = this.settings.uniColsOff.filter((id) => id !== 'perday' && id !== 'daysleft');
		if (this.settings.uniColPx && typeof this.settings.uniColPx === 'object') { delete this.settings.uniColPx.perday; delete this.settings.uniColPx.daysleft; }
		// `folderStatus`: only files have flags. A stale map of folder paths is
		// a list a future reader could treat as flagged. The structure file
		// stops being written with folder flags, `goalsStoreAdopt` stops
		// reading them back and `renameGoalPaths` stops following them; delete
		// here alone and the next structureRead puts the key straight back.
		delete this.settings.folderStatus;
		// `uniScope`: a PERSISTED narrowing of the table — the `manuscriptRoots`
		// fault one storey up; the search box and the filters answer per
		// glance.
		delete this.settings.uniScope;
		// `uniBoard`, `uniBoardTags`: the corkboard; a vault that reinstalls
		// with `uniBoard: true` must not wake a view that no longer exists.
		delete this.settings.uniBoard;
		delete this.settings.uniBoardTags;
		// `uniNameCh`: the name-drag width; the table's name column is capped by
		// max-width and the browser owns every width.
		delete this.settings.uniNameCh;
	}

	// THE BAR'S VALUES brought into today's ranges, styles and tokens (loadSettings, step 5 of 6).
	settingsBarValues() {
		// readTimeWpm: {readtime} is fixed at READ_WPM now.
		// dateFormat:  {date} became {dd} {mm} {yyyy} {yy}, composed in the
		//              row format, so there is no format string to store.
		// powerlineCapStyle: the end cap follows the row's own dividers.
		// statusBarPadSide (a left/right inset for the bar) never took effect
		// in the field across three implementations — margin, left/right from
		// a custom property, and an inline write on the element — so it was
		// removed rather than left as a control that does nothing.
		for (const dead of ['readTimeWpm', 'dateFormat', 'powerlineCapStyle',
			'statusBarPadSide']) {
			delete wsBag(this.settings)[dead];
		}
		// Row height range moved from 20-60 to 12-30. A saved value outside
		// the new bounds has to be clamped here: the slider would render
		// pinned at an end while the bar kept drawing at the old size, and
		// nothing the user did to the control would change anything until
		// they happened to drag past the stored value.
		// Text colours went from six to four. A saved ;5 or ;6 in a row now
		// wraps to ;1/;2 rather than failing, so the format strings are left
		// alone; only the dead keys are swept.
		delete this.settings.powerlineText5;
		delete this.settings.powerlineText6;
		if (typeof this.settings.statusBarHeight === 'number') {
			this.settings.statusBarHeight =
				Math.max(12, Math.min(30, this.settings.statusBarHeight));
		}
		// Groove and Ridge were removed from the Line style dropdown. This
		// has to be a REWRITE, not a delete: the value is stamped straight
		// into a CSS border-style, so a saved 'groove' would keep rendering
		// while the dropdown — asked to select a value it no longer offers —
		// showed whatever its first option is. Solid is the nearest thing
		// either of them was pretending to be, and both were fetched by
		// someone who wanted a line there.
		if (this.settings.statusBarBorderStyle === 'groove'
			|| this.settings.statusBarBorderStyle === 'ridge') {
			this.settings.statusBarBorderStyle = 'solid';
		}
		// The same value can arrive inside a SAVED PRESET, which is applied
		// wholesale and never passes through the check above.
		for (const snap of Object.values(this.settings.barPresets || {})) {
			if (snap && (snap.statusBarBorderStyle === 'groove'
				|| snap.statusBarBorderStyle === 'ridge')) {
				snap.statusBarBorderStyle = 'solid';
			}
		}
		// {date} in saved rows would otherwise render as the literal text
		// "{date}" forever. Rewritten to the pair it almost always meant;
		// anyone wanting a different order edits the row.
		for (const row of (this.settings.statusRows || [])) {
			for (const slot of ['left', 'center', 'right'] as const) {
				if (typeof row[slot] === 'string' && row[slot].includes('{date}')) {
					row[slot] = row[slot].replace(/\{date\}/g, '{dd}/{mm}');
				}
			}
		}
		// Always end up with exactly ONE well-formed row, whatever was in
		// data.json — hand-edited configs included. The bar draws one; the
		// two empty rows every vault carried went in 1.6.8 (A508).
		{
			const src = Array.isArray(this.settings.statusRows) ? this.settings.statusRows : [];
			this.settings.statusRows = [0].map(i =>
				Object.assign({ left: '', center: '', right: '' }, src[i] || {}));
		}
		// The old fill bar drew Unicode block characters in the interface font,
		// which is why it read as a terminal artifact. It has been replaced by
		// a drawn ring; goalBarCells is the marker that data.json predates the
		// change, so anyone who was on the block bar lands on the ring.
		// The border was a single on/off flag; the style None is the "off" (not
		// weight 0, which `|| 1` drew as 1px for a year and is the hairline now).
		// goalDisplay, goalRingPercent and goalShapeLabel collapsed into one
		// label mode, and that mode was read by nothing (retired, A508): the
		// three are simply deleted.
		if (this.settings.goalShapeLabel != null || this.settings.goalRingPercent != null ||
			this.settings.goalDisplay != null) {
			delete this.settings.goalDisplay;
			delete this.settings.goalRingPercent;
			delete this.settings.goalShapeLabel;
		}
		if (this.settings.statusBarBorder != null) {
			if (!this.settings.statusBarBorder) this.settings.statusBarBorderStyle = 'none';
			delete this.settings.statusBarBorder;
		}
		// 'hairline' was briefly a rule STYLE; it is the rule WEIGHT 0. A vault
		// that chose it keeps the look: Solid at 0. Keyed on the value, which
		// nothing can write again.
		if (this.settings.statusBarBorderStyle === 'hairline') {
			this.settings.statusBarBorderStyle = 'solid';
			this.settings.statusBarBorderWidth = 0;
		}
		// 'squiggle' was a mark STYLE through 1.5.4, and the checks' default. A
		// vault that chose it, or never chose, lands on Line — the nearest mark.
		// Keyed on the value, which nothing can write again.
		if (this.settings.syntaxStyle === 'squiggle') this.settings.syntaxStyle = 'line';
		if (this.settings.checkStyle === 'squiggle') this.settings.checkStyle = 'line';
		if (this.settings.goalBarCells != null) delete this.settings.goalBarCells;
		// The slim bar was dropped; the ring is the only indicator now.
		// goalLabel used to place text beside the indicator. The percentage
		// now lives inside the ring, so the old setting maps onto the toggle.
		if (this.settings.goalLabel != null) {
			// Goal tokens are gone from the bar — goals live in settings and
			// on the hairline edges now. Saved bars that still carry the old
			// tokens would otherwise print them as literal text.
			if (Array.isArray(this.settings.statusRows)) {
				for (const r of this.settings.statusRows) {
					for (const k of ['left', 'center', 'right'] as const) {
						if (r && typeof r[k] === 'string' && /\{(?:goal|filegoal|foldergoal)\}/.test(r[k])) {
							r[k] = r[k].replace(/\{(?:goal|filegoal|foldergoal)\}/g, '').replace(/  +/g, ' ').trim();
						}
					}
				}
			}
			delete this.settings.goalLabel;
		}
		// The ASCII arrow style was removed (too similar to Chevron) — carry
		// anyone still on it over to the closest replacement.
		if (this.settings.arrowStyle === 'ascii') {
			this.settings.arrowStyle = 'chevron';
		}
		// The vim command line was restyled shorter, so any height measured
		// under the old rules over-reserves the gutter and leaves the bar
		// floating above the panel until the next `:` re-measures. Drop it
		// once and let it be taken again; 0 simply means "not measured yet"
		// and falls back to a snapped row.
		if (this.settings.vimPanelHeight > 34) this.settings.vimPanelHeight = 0;
		// The cursor-position memory was removed. It kept a growing
		// path -> {line, ch, scroll} map in data.json, so drop it rather
		// than leave a dead table there forever.
		delete this.settings.restoreCursorPosition;
		delete this.settings.cursorMemory;
		// Transient UI state that older versions leaked into data.json, plus
		// settings for the removed exit button. Dropped on next save.
		delete this.settings._lastArrowCount;
		delete this.settings.exitButtonVisibility;
		delete this.settings.autoHideButtonOnDesktop;
		// Zen padding, removed. The bottom half never worked in the field
		// (five attempts) and the
		// top half went with it rather than leaving half a group behind.
		// Dropped from data.json on the next save so nobody carries two
		// settings that nothing reads.
		delete this.settings.topPadding;
		delete this.settings.bottomPadding;
		// {writechecks} became {prose} in 1.10. Rewritten in place so the
		// panel shows the current spelling; the substitution table still
		// accepts the old one, which is what keeps a share code or a preset
		// written before the rename working. Both halves are needed — this
		// reaches only this vault's rows, and the alias reaches everything
		// that arrives later.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right'] as const) {
					if (typeof row[slot] === 'string' && row[slot].includes('{writechecks}')) {
						row[slot] = row[slot].replace(/\{writechecks\}/g, '{prose}');
					}
				}
			}
		}
		// {outliner} became {organizer}: the substitution table still ACCEPTS
		// the old spelling, and this rewrites the rows a vault already has so
		// the settings panel shows the new one.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right'] as const) {
					if (typeof row[slot] === 'string' && row[slot].includes('{outliner}')) {
						row[slot] = row[slot].replace(/\{outliner\}/g, '{organizer}');
					}
				}
			}
		}
	}

	// THE BAR PRESETS seeded into the library once, the retired one out, and a new vault's opening bar (loadSettings,
	// step 6 of 6).
	settingsSeedPresets(raw: WsRawSettings) {
		// Seed the shipped bar presets into the library, exactly once. The
		// flag is what makes a deleted built-in stay deleted — the obvious
		// version of this (add any name that is missing) resurrects them on
		// every launch, so "delete" would only ever mean "until restart".
		// The identity check is the third clause for the usual reason: the
		// merge in loadSettings is shallow, so on a vault that has never saved
		// one, `settings.barPresets` IS the literal in DEFAULT_SETTINGS, and
		// the seeding below would write the shipped presets into the defaults
		// table rather than into this vault's copy.
		if (!this.settings.barPresets || typeof this.settings.barPresets !== 'object'
			|| this.settings.barPresets === DEFAULT_SETTINGS.barPresets) {
			this.settings.barPresets = {};
		}
		// SEEDED BY NAME. A flag alone means a vault seeded with two presets
		// never receives a third: each shipped name is seeded once and
		// remembered, so a new one arrives on the next launch and a deleted one
		// stays deleted. A vault that carries the flag and no list was seeded
		// when Plain and Code were the whole set. Never overwrite: a vault from
		// before the flag may already hold a user's own preset under one of
		// these names.
		{
			// AN EMPTY LIST IS NO LIST: the default is `[]`, and it reaches a
			// vault that was seeded before the list existed, so the flag has
			// to be asked — and it says those vaults had Plain and Code.
			const had = Array.isArray(this.settings.barPresetsSeededNames)
				? this.settings.barPresetsSeededNames.slice() : [];
			const seeded = had.length ? had
				: (this.settings.barPresetsSeeded ? ['Plain', 'Code'] : []);
			let grew = false;
			for (const [name, snap] of Object.entries(DEFAULT_BAR_PRESETS)) {
				if (seeded.indexOf(name) !== -1) continue;
				if (!(name in this.settings.barPresets)) {
					this.settings.barPresets[name] = barCloneValue(snap);
				}
				seeded.push(name);
				grew = true;
			}
			if (grew || !Array.isArray(this.settings.barPresetsSeededNames)) {
				this.settings.barPresetsSeededNames = seeded;
			}
			this.settings.barPresetsSeeded = true;
		}
		// THE INK PRESET IS RETIRED. A vault that got it from the seeder (its
		// name is in barPresetsSeededNames) loses it here, edited or not; a bar
		// the writer saved under that name themselves, in a vault the seeder
		// never gave one, is theirs and stays. The name stays in the seeded
		// list, so it is never seeded again.
		try {
			const seededInk = Array.isArray(this.settings.barPresetsSeededNames) && this.settings.barPresetsSeededNames.indexOf('Ink') !== -1;
			if (seededInk && this.settings.barPresets && this.settings.barPresets.Ink) delete this.settings.barPresets.Ink;
		} catch (_) { wsCatch('loadSettings: the retired Ink preset', _); }

		// The bar a brand-new vault comes up with.
		//
		// The DEFAULT_SETTINGS values for BAR_KEYS are frozen — barShareFields
		// emits only what DIFFERS from them and the recipient fills the rest
		// back in from their own copy, so retuning one silently changes what
		// every share code already in the wild decodes to (see the note above
		// BAR_KEYS). The defaults therefore stay exactly as they are, and the
		// opening bar is chosen by APPLYING a preset over them instead. Same
		// result on screen, no reinterpretation of anyone's code, and the
		// presets that leave a key unstated still inherit what they always
		// did.
		//
		// Guarded on the saved file being empty, not on a flag: an empty
		// data.json means this vault has never expressed an opinion about
		// anything, which is the only case where overwriting the bar is
		// certainly safe. An upgrading vault — including one that never
		// touched the Retro Bar tab — keeps the bar it has.
		if (!Object.keys(raw).length && DEFAULT_BAR_PRESETS.Plain) {
			this.applyBarSnapshot(DEFAULT_BAR_PRESETS.Plain);
			this._activeBarPreset = 'Plain';
		}
	}

	// ─────────────────────────────────────────────────────────────────────────

	// Whether Obsidian's Vim key bindings are on. The vim ":" line only
	// exists when they are, and it is the reason the gutter is reserved.
	isVimKeysOn() {
		try {
			const vault = this.app.vault;
			return !!(vault && vault.config && vault.config.vimMode === true);
		} catch { return false; }
	}

	// ─────────────────────────────────────────────────────────────────────────

	// Persist settings. By default the full refresh() (mask/observer teardown
	// and rebuild) is debounced so a slider drag firing onChange every tick
	// doesn't rebuild the world per tick — only the trailing call applies.
	// Pass applyImmediately for state changes that must land now (zen toggle,
	// master switch).
	// ── A FAILED SAVE MUST NOT REACH THE CALLERS ─────────────────────
	//
	// A rejection here — a full disk, a locked vault, a sync conflict —
	// would walk out to every caller with no handler: an unhandled
	// rejection, and a setting that silently did not persist. Caught at
	// the function, not at the callers: a `.catch` bolted onto every call
	// site is eighty-seven chances to forget the eighty-eighth.
	//
	// AND EVERYTHING BELOW STILL RUNS: `goalsFileSync` and
	// `settingsMirrorSync` write the writer's OWN files, and
	// `ws-settings.md` exists precisely to survive the loss of data.json.
	// A save that just failed makes the mirror more important, not less,
	// so a failure here is reported and passed over rather than returned
	// on.
	async saveSettings(applyImmediately = false) {
		try {
			// STRIPPED, NOT DELETED. `wsForDisk` hands back a copy with the
			// session-only keys removed; the live `this.settings` keeps them,
			// because a writer changing the chart and then changing a colour must
			// not have the chart reset by the colour's save.
			await this.saveData(wsForDisk(this.settings));
			// IT WORKED, so the next failure is news again.
			this.storeWriteOk(WS_WRITE.settings);
		} catch (e) { this.settingsSaveFailed(e); }
		// The flags follow the settings from ONE place, for the same reason
		// the goals file does: they are set from a settings tab, a count, and
		// four widgets per row, and hooking each of those is four chances to
		// miss one.
		try { this.flagsApply(); } catch (_) { wsCatch('saveSettings: this.flagsApply();', _); }
		// The goals file follows the settings, and follows them from ONE
		// place: goals are set from the gauge, from three settings rows and
		// from a rename, and hooking each of those would be four chances to
		// miss one. It writes only when the targets have actually changed.
		this.goalsFileSync();
		// …and the settings mirror, from the same one place and for the same
		// reason: settings are changed from six tabs, a menu, a dozen widgets
		// and a rename, and hooking each of those would be a dozen chances to
		// miss one. Debounced hard — the mirror is the least urgent thing in
		// the plugin, and a write per keystroke in a colour picker is noise in
		// the vault and in sync.
		this.settingsMirrorSync();
		if (applyImmediately) {
			if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
			this.refresh();
		} else {
			this.scheduleRefresh();
		}
	}

	// ── …AND THE WRITER IS TOLD, ONCE ────────────────────────────────
	//
	// A settings save that fails is SILENT DATA LOSS: the choice is on
	// screen, it is in memory, and it is not on disk. Nobody opens a
	// console — the export says "export failed —" in a Notice for the
	// same reason.
	//
	// ONCE PER RUN OF FAILURES, re-armed by the next save that works. A
	// disk that is full stays full, and `saveSettings` is called from a
	// dozen widgets: without the latch a stuck vault would paint a wall
	// of toasts and bury the one that mattered.
	//
	// AND IT NAMES THE WAY OUT, because the mirror really is one: the
	// same call goes on to write `ws-settings.md`, which is read back
	// into an empty data.json. That is not consolation, it is the
	// instruction.
	//
	// THROUGH THE ONE REPORTER: `storeWriteFailed` is the console line,
	// the latch and the Notice for every store write; the settings are
	// simply the first subject it was written for. ONE LATCH TABLE, NOT A
	// FLAG BESIDE IT — two mechanisms for one idea is how the second
	// stops being re-armed, and the symptom of that is silence.
	settingsSaveFailed(e: unknown) {
		return this.storeWriteFailed(WS_WRITE.settings, e,
			'They are still set for this session, and are mirrored to '
			+ 'ws-settings.md.');
	}

	scheduleRefresh() {
		if (this._refreshTimer) window.clearTimeout(this._refreshTimer);
		this._refreshTimer = window.setTimeout(() => {
			this._refreshTimer = null;
			this.refresh();
		}, 120);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Core refresh
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// APPLY: the single path from settings to the DOM
	// ════════════════════════════════════════════════════════════════════════

	refresh() {
		// NOTHING IS BUILT ON A BLOCKED START. onload returned before the
		// commands, the events and the editor extensions were registered; a
		// refresh reached through a settings toggle would build the surfaces
		// over a half-registered plugin. Try again is a real off-and-on.
		// Nor after an unload: a refresh queued before it has nothing to draw for.
		if (this._startBlocked || this._unloaded) return;
		this.updateWsRibbonState();
		if (!this.settings.pluginEnabled) { this.disablePlugin(); this.reconfigureEditors(); return; }
		// Back on: the ribbon returns, and the panel returns to the side it
		// was taken from. Both are no-ops when nothing was removed, so this
		// costs a running plugin nothing.
		void this.restoreMenuPanelSpot();
		// Scope decides what the rest of this method may apply, and the list
		// may have just changed, so it is resolved first.
		this._scopeGen++;
		this._lastScopeInScope = this.isActiveFileInScope();
		this.applyBodyClasses();
		this.applyCssVariables();
		this.applyEditorFont();
		this.applyStyleProps();
		this.updateWorkspaceAesthetics();
		this.setSidebarVisibility();
		// After setSidebarVisibility, never before: that is the zen toggle's
		// own pass and it must see the sidebars as the toggle left them.
		this.syncSurfaceSidebars();
		void this.updateFocusedFileMode();
		this.typewriterScroll();
		// The dim/marker decorations read settings only when (re)built, so a
		// settings change needs the editors reconfigured to take effect.
		this.reconfigureEditors();
		if (this.explorerWanted()) {
			this.attachExplorerObserver();
			// AND A PASS, not only an observer. Attaching watches for the
			// NEXT change to the tree; a writer who has just switched flags
			// on is looking at a tree that is not going to change until they
			// touch it.
			this.scheduleExplorerPatch();
		} else {
			this.detachExplorerObserver();
			this.removeWordCounts();
			// (and the own folder shown again, the pass that would have done it not running, A733)
			this.paintExplorerOwnFolder();
		}
		// …and out of the graph and search, or back in (#71)
		this.excludeOwnFolder();
		// …and the order, which patches or unpatches itself from one call.
		// Switching it OFF has to put the tree back within the same gesture:
		// a writer turning it off and seeing their tree still in book order
		// would reasonably conclude the switch does nothing.
		this.patchExplorerSort();
		// THE DOCKED MENU'S ROWS SAY WHAT WAS JUST CHOSEN (A609), wherever it was
		// chosen: a language or a font picked on the bar left the pane naming the
		// old one until the writer moved to another note. States only, 0.2 ms.
		this.refreshMenuPanels();
	}

	disablePlugin() {
		// The theme comes off first, and by name: clearChromeColors below
		// is exempted from theme variables ON PURPOSE (see the janitor),
		// so it is the one sweep that cannot do this job.
		this.barThemeUndress();
		// The chrome override lives on body, not in the stylesheet, so it
		// outlives clearStyleProps() unless it is cleared by hand.
		this.clearChromeColors();
		// And the window's controls, which are Electron's: no class coming
		// off repaints them, and the switch is a disable as much as onunload.
		this.setWindowControlColours(false);
		this.endBarPeek(true);
		this._peekArmed = false;
		this.clearBarBounds();
		this.removeCustomElements();
		this.stopClockTick();
		this.clearStyleProps();
		this.detachExplorerObserver();
		this.removeWordCounts();
		this.orgTreeHookDetach();
		this.orgTicksClear();
		this.detachScrollHandler();
		this.detachResizeHandler();
		// THE PANEL AND THE RIBBON GO TOO. A kill switch that leaves a pane
		// in the sidebar and a button on the ribbon has not switched the
		// plugin off — it has switched off the parts that were easy to find,
		// and those two are Word-Smith's most visible surfaces.
		//
		// The panel's SIDE is remembered first, so enabling puts it back
		// where the writer had it rather than in Obsidian's default sidebar.
		// A pane that returns to the wrong place is its own small insult.
		this.rememberMenuPanelSpot();
		this.closeMenuPanel();
		// (The ribbon button is taken off the ribbon by `updateWsRibbonState`,
		// which `refresh` runs before this.)
		// Both caches hold a reference to a CodeMirror document; drop them so
		// a disabled plugin does not pin one.
		this._fenceCache = null;
		this._paraCache = null;
		this._docStatsCache = null;
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		// The bar's two observers: the fit's, and the root split's for its bounds.
		if (this._fitRO) { this._fitRO.disconnect(); this._fitRO = null; }
		if (this._barRootRO) { this._barRootRO.disconnect(); this._barRootRO = null; }
		if (this._caretObs) { this._caretObs.disconnect(); this._caretObs = null; this._caretObsEl = null; }
		this._barRootObserved = null;
		this._barRenderSig = null;
		// Strip all body classes and attributes
		this.clearAllBodyState();
		// Vim maps live on a global adapter, not in our extensions, so they
		// have to be released by hand.
		this.applyVimMotionMaps();
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// The horizontal padding rule is unscoped (applies always), so it
		// needs its own reset when the plugin itself is turned off. The
		// vertical pair is zen-scoped and would stop applying anyway once
		// the body classes are cleared above, but clearing them keeps a
		// disabled plugin from leaving any of its variables on :root.
		document.documentElement.style.removeProperty('--ws-editor-padding-h');
		// Left behind by the removed zen padding. An inline custom property
		// on :root outlives the stylesheet that read it, so a vault that had
		// the feature keeps the value forever unless it is actively cleared
		// — the same failure mode as the note mini-theme's three.
		document.documentElement.style.removeProperty('--zen-mode-top-padding');
		document.documentElement.style.removeProperty('--zen-mode-bottom-padding');
		// Restore tab containers — only the ones we changed, and to their own
		// previous values. This line used to reach every .workspace-tabs in
		// the workspace and blank its inline flex, which is where a sidebar's
		// pane sizes went. See _focusTabRestore.
		this._focusTabRestore();
		// Restore sidebars
		const ws = this.app.workspace;
		if (ws.leftSplit && !ws.leftSplit.collapsed)   ws.leftSplit.expand();
		if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.expand();
		// Exit fullscreen
		if (document.fullscreenElement && document.exitFullscreen) {
			document.exitFullscreen().catch(() => {});
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Paragraph tagger (double-enter indent)
	// ─────────────────────────────────────────────────────────────────────────

	// ─────────────────────────────────────────────────────────────────────────
	// Zen mode toggle (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// TOGGLES
	// ════════════════════════════════════════════════════════════════════════

	// Flip a boolean setting and apply it now (no debounce — these are
	// hotkey-driven). Pass ensurePos to also switch the master POS toggle on,
	// so "Syntax highlight: verbs" does what it says from a cold start.
	async toggleSetting(key: WsBoolKey, ensurePos?: boolean) {
		this.settings[key] = !this.settings[key];
		if (ensurePos && this.settings[key]) this.settings.posEnabled = true;
		await this.saveSettings(true);
	}

	// ── THE RIBBON BUTTON GOES WITH THE SWITCH ───────────────────────
	//
	// Hiding the element is the desktop half of the job: the phone lists
	// the ribbon from `leftRibbon.items`, skipping only what is flagged
	// hidden, so a button that is `display: none` is still offered there.
	// The switch does what Obsidian's own unload does — `removeRibbonAction`
	// (the id is `<plugin id>:<title>`, as `addRibbonIcon` builds it) and
	// the element detached — and then the one thing unload leaves behind,
	// the entry in the array, goes too, or the phone would still list it
	// and its tap would call a callback that had been deleted. On: made
	// again through the same builder onload used, so it is the same button.
	// A ribbon-config "hide" the writer had set on our button is not kept
	// across an off-and-on: Obsidian keys that on the array entry, and the
	// entry is what had to go.
	wsRibbonMake() {
		if (this.wsRibbonEl) return;
		// "WS" badge ribbon button — OPENS THE MENU. (It toggled the whole
		// plugin until 1.3.0; this comment said so for a while after it
		// stopped being true, which is its own small lesson.) On mobile
		// Obsidian lists ribbon items by this label, so the label is the
		// only thing a phone shows — it has to say what the button does.
		// Obsidian's addRibbonIcon expects a Lucide icon name; we replace
		// the SVG it inserts with a text badge and use a class hook for
		// styling. The label doubles as the tooltip.
		const el = this.addRibbonIcon('type', WS_RIBBON_TITLE, () => this.openBarMenu());
		if (!el) return;
		this.wsRibbonEl = el;
		el.addClass('ws-ribbon-btn');
		el.empty();
		// A SERIF W — THE REGISTERED ICON, the same one the docked leaf
		// wears. It was a styled text span here and a drawn glyph there,
		// and the two sat one above the other in the sidebar looking
		// almost but not quite alike. Almost is worse than different.
		// One icon, set through Obsidian's own setIcon, and the question
		// cannot come back.
		//
		// (An S sat behind it for one build. Two letters in an 18px square
		// is a monogram at a size that cannot hold one — at ribbon scale
		// the pair read as a smudge.)
		const badge = el.createSpan({ cls: 'ws-ribbon-badge' });
		let iconSet = false;
		try {
			if (setIcon) { setIcon(badge, WS_ICON); iconSet = !!badge.querySelector('svg'); }
		} catch (_) { wsCatch('wsRibbonMake: if (setIcon) setIcon(badge, WS_ICON);', _); }
		// The text span stays as the fallback for a build where the icon
		// did not register: a blank ribbon button is worse than a letter
		// that is merely close.
		if (!iconSet) badge.createSpan({ cls: 'ws-ribbon-w', text: 'W' });
	}
	wsRibbonDrop() {
		const el = this.wsRibbonEl;
		if (!el) return;
		this.wsRibbonEl = null;
		const id = this.manifest.id + ':' + WS_RIBBON_TITLE;
		try {
			const ribbon = this.app.workspace.leftRibbon;
			if (ribbon && typeof ribbon.removeRibbonAction === 'function') ribbon.removeRibbonAction(id);
			if (ribbon && Array.isArray(ribbon.items)) {
				const at = ribbon.items.findIndex((i) => i && i.id === id);
				if (at !== -1) ribbon.items.splice(at, 1);
			}
		} catch (_) { wsCatch('wsRibbonDrop: ribbon.removeRibbonAction(id)', _); }
		try { el.detach(); } catch { try { el.remove(); } catch (_2) { wsCatch('wsRibbonDrop: el.detach();', _2); } }
	}
	updateWsRibbonState() {
		if (this.settings && this.settings.pluginEnabled === false) this.wsRibbonDrop();
		else this.wsRibbonMake();
	}

	// ── AND OUR OWN WINDOW IS NOT "ANOTHER FILE" ─────────────────────
	//
	// `isActiveFileInScope` asks for the active MARKDOWN view, and one of
	// our panes is not one — so focusing the Organizer would read as "no
	// note here", the bar would come down, and the native bar it hides
	// would come back with the note's word count under the writer's table.
	// The Organizer, Export and History are windows ONTO the writing, so
	// the bar keeps the answer it had for the note in hand.
	//
	// THE NOTE IN HAND, not "the last true answer": a cached boolean would
	// outlive the note that made it true and light the bar over somebody
	// else's vault. `activeNoteFile` falls through to the workspace's own
	// active file, which is the note the pane was opened beside.
	wsOwnViewActive() {
		// THROUGH `getActiveViewOfType`, not `workspace.activeLeaf`: the
		// sanctioned door, and it answers null for a deferred view rather than
		// a shell with no type. The three panes are three instances of the one
		// view class.
		try {
			if (!WsOutlinerView) return false;
			const ws = this.app.workspace;
			const v = ws && typeof ws.getActiveViewOfType === 'function' ? ws.getActiveViewOfType(WsOutlinerView) : null;
			if (v) return true;
			// A SIDEBAR IN FOCUS LEAVES THE MAIN AREA'S ANSWER (A764, the writer: "if i have the organizer open and i click in
			// the word-smith pane the obsidian status bar appears, check for history and export tabs too"): the pane took the
			// focus and the Organizer, History or Export still fills the main area, Obsidian's most recent leaf there. A note
			// in focus anywhere is the note's answer.
			if (!ws || (typeof ws.getActiveViewOfType === 'function' && ws.getActiveViewOfType(MarkdownView))) return false;
			const leaf = typeof ws.getMostRecentLeaf === 'function' ? ws.getMostRecentLeaf() : null;
			return !!(leaf && leaf.view instanceof WsOutlinerView);
		} catch (_) { wsCatch('wsOwnViewActive: const v = ws.getActiveViewOfType(WsOutlinerView);', _); return false; }
	}


	// ─────────────────────────────────────────────────────────────────────────
	// Scope
	//
	// Scope gates the writing surface — masks, retro bar, text options, all
	// four editor decorations and the Hemingway lock. It deliberately does not
	// gate zen mode's workspace chrome or sidebar state: zen is a mode you
	// enter by hotkey for a session, and flinging the sidebars open every time
	// you glance at an out-of-scope note would be worse than useless. Sidebar
	// word counts stay vault-wide too — those are for navigating, not writing.
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// SCOPE: path lists + per-note frontmatter
	// ════════════════════════════════════════════════════════════════════════

	// ── Per-note overrides ───────────────────────────────────────────────────
	// Path lists handle projects; frontmatter handles this note today.
	//
	//   wordsmith: off       the plugin does nothing in this note
	//   ws-zen: true         override a mode for this note only
	//   ws-typewriter: false
	//   ws-hemingway: true
	//   ws-syntax: true      the word classes, and the prose checks —
	//   ws-checks: false     a journal wants neither, a draft wants both
	//   ws-typography: false
	//
	// THE KEYS ARE THE ONES A NOTE CAN MEAN: how it is written (a mode), and
	// what is marked in it. A per-note font and per-note markers were here
	// and are not — a font is the vault's, the markers are a way of looking
	// — and `ws-goal` is not: a target has one home, `ws-goals.md`, where it
	// can be seen beside its neighbours.
	//
	// Cached per path and dropped whenever the metadata cache reports a
	// change, so editing the frontmatter takes effect on the next repaint.
	getOverrides(file: TAbstractFile | null | undefined) {
		if (!file || !file.path) return null;
		if (!this._fmCache) this._fmCache = {};
		if (Object.prototype.hasOwnProperty.call(this._fmCache, file.path)) {
			return this._fmCache[file.path];
		}
		let fm = null;
		try {
			const cache = this.app.metadataCache && this.app.metadataCache.getFileCache(file);
			fm = cache && cache.frontmatter;
		} catch { fm = null; }

		let out: Record<string, boolean | string> | null = null;
		if (fm) {
			// YAML gives booleans for true/false but strings for on/off/yes/no,
			// and people write all of them.
			const isOff = (v: unknown): boolean => v === false || /^(false|off|no)$/i.test(wsStr(v));
			const isOn  = (v: unknown): boolean => v === true  || /^(true|on|yes)$/i.test(wsStr(v));
			const add   = (k: string, v: boolean | string) => { (out = out || {})[k] = v; };

			if ('wordsmith' in fm) add('__disabled', isOff(fm.wordsmith));
			const MAP: Record<string, string> = {
				'ws-zen':        'zenMode',
				'ws-typewriter': 'enableTypewriter',
				'ws-hemingway':  'hemingwayEnabled',
				'ws-syntax':     'posEnabled',
				'ws-checks':     'checksEnabled',
				'ws-typography': 'typographyEnabled'
			};
			for (const key in MAP) {
				if (!(key in fm)) continue;
				if (isOn(fm[key]))       add(MAP[key], true);
				else if (isOff(fm[key])) add(MAP[key], false);
			}
		}
		this._fmCache[file.path] = out;
		return out;
	}

	// Effective value of a setting for a given note.
	optFor<K extends keyof WordSmithSettings>(file: TFile | null, key: K): WordSmithSettings[K] | boolean | string {
		const o = this.getOverrides(file);
		if (o && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
		return this.settings[key];
	}

	// Same, for the note in the active pane.
	opt<K extends keyof WordSmithSettings>(key: K) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return this.optFor(view ? view.file : null, key);
	}

	// And for whichever note a given editor is showing.
	// (A862, Fable's review: "ws-syntax, ws-checks, ws-typography, ws-hemingway and ws-typewriter are documented and do
	// nothing": the editors' builders read the switches and never this. They ask it now, on every keystroke)
	optForView<K extends keyof WordSmithSettings>(cmView: EditorView & { cm?: WsCm5Facade }, key: K) {
		return this.optFor(this.fileOfEditor(cmView), key);
	}

	// THE NOTE AN EDITOR SHOWS (A862): Obsidian's own field in the editor's state first. It is there from the editor's
	// first build, when the pane does not hold the editor yet (CodeMirror builds the plugins inside the editor's
	// constructor), so a walk of the panes then finds nothing. Else the pane that holds it, kept for a generation once
	// found and never kept unfound: one walk per editor per file or layout change
	fileOfEditor(cmView: EditorView & { cm?: WsCm5Facade }): TFile | null {
		try {
			const info = editorInfoField && cmView.state ? cmView.state.field(editorInfoField, false) : null;
			if (info && info.file) return info.file;
		} catch { /* a state without Obsidian's field: a canvas card's, a test's */ }
		const memo = cmView._wsFile;
		if (memo && memo.gen === this._scopeGen) return memo.f;
		const f = this.getFileForEditorView(cmView);
		if (f) cmView._wsFile = { gen: this._scopeGen, f };
		return f;
	}

	// WHETHER A SWITCH IS WANTED ANYWHERE (A862): on, or a note open in a pane turning it on in its frontmatter. What
	// every editor shares asks this (the Typography and Hemingway handlers being built at all, the marks' colors on the
	// body), and each editor then asks its own note.
	notesWant<K extends keyof WordSmithSettings>(key: K): boolean {
		if (this.settings[key] === true) return true;
		let any = false;
		try {
			this.app.workspace.iterateAllLeaves((leaf) => {
				const v = leaf && leaf.view;
				if (any || !v || !v.getViewType || v.getViewType() !== 'markdown') return;
				const f = (v as MarkdownView).file;
				if (f && this.optFor(f, key) === true) any = true;
			});
		} catch (_) { wsCatch('notesWant: this.app.workspace.iterateAllLeaves(leaf =>', _); }
		return any;
	}

	// …WHAT THE OPEN NOTES ADD UP TO (A862), one line: syncScope compares it, so a note with its own keys opened in a pane
	// (or the focus moving between two that differ) puts the editors and the colors right
	noteKeysSig(): string {
		return (['posEnabled', 'checksEnabled', 'typographyEnabled', 'hemingwayEnabled'] as const).map((k) => (this.notesWant(k) ? '1' : '0')).join('')
			+ (this.opt('hemingwayEnabled') ? 'h' : '') + (this.opt('enableTypewriter') ? 't' : '');
	}

	// …AND PUT RIGHT: the body's colors and classes, and every editor rebuilt with what it now reads
	noteKeysApply() {
		this._lastNoteKeys = this.noteKeysSig();
		this.applyBodyClasses();
		this.applyStyleProps();
		this.reconfigureEditors();
	}

	// Obsidian keeps its right-to-left preference in appearance config, and
	// also sets it per note. Either is enough to mirror the text options.
	// The Text Options master switch, honoured at RUNTIME rather than only in
	// the settings pane.
	//
	// It used to hide the controls and nothing else: `miscEnabled` appeared
	// exactly once outside the settings tab, in its own default. So switching
	// the tab off left the horizontal padding, the paragraph indent, the line
	// limit, the justification, the line spacing and the hidden markers all
	// still applied, with no visible control left to turn any of them off
	// again. A master switch that only hides its own controls is worse than no
	// master switch, because it lies about what it did.
	//
	// Everything the tab owns is read through this one accessor, so a new
	// setting added to that tab cannot forget to be gated — it is gated by the
	// only route there is to its value.
	//
	// WHETHER THE LAYOUT IS ON AT ALL: the master, and — when "Only in Zen" is
	// ticked (A481) — Zen. zenActive(), the question the rest of the plugin
	// asks, so a canvas in Zen is not laid out as a page. Entering and leaving
	// Zen runs saveSettings → refresh, which re-reads every site below.
	layoutOn(): boolean {
		if (!this.settings.miscEnabled) return false;
		return !this.settings.layoutZenOnly || this.zenActive();
	}
	textOpt(key: WsBoolKey, whenOff: boolean): boolean;
	textOpt(key: WsNumberKey, whenOff: number): number;
	textOpt(key: WsBoolKey | WsNumberKey, whenOff: boolean | number): boolean | number {
		if (!this.layoutOn()) return whenOff;
		const v = this.settings[key];
		return v === undefined ? whenOff : v;
	}
	// THE TEXT'S SIDE PADDING: the layout's, AND THE LETTER BOX'S WHILE IT IS ON (A672, issue #55; the writer:
	// "with it's horizontal drag to slide the padded margins", and, asked, "Letter Box applies it"), so its
	// sides' drag answers with Text options off or "Only in Zen" out of Zen
	padOn(): boolean {
		return this.layoutOn() || !!this.settings.enableLetterbox;
	}

	isRightToLeft() {
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.editor && view.editor.cm && view.editor.cm.contentDOM) {
				const dir = view.editor.cm.contentDOM.getAttribute('dir');
				if (dir) return dir === 'rtl';
			}
		} catch { /* editor not ready */ }
		try {
			if (this.app.vault.getConfig) return !!this.app.vault.getConfig('rightToLeft');
		} catch (_) { wsCatch('isRightToLeft: if (this.app.vault.getConfig) return …', _); }
		return false;
	}

	// ── Surface gate ─────────────────────────────────────────────────────
	// Word-Smith is a writing suite: everything it does — the bar, the
	// masks, zen's chrome hiding, the type options — is about a note being
	// written. On a canvas, a base, a PDF, the graph or an empty tab there
	// is no note, so it all stands down and Obsidian comes back exactly as
	// it was, native status bar included. This is the FIRST question every
	// scope check asks; the path list and frontmatter overrides only decide
	// between notes.
	//
	// Read from the most recent leaf in the main area, NOT from
	// workspace.activeLeaf: clicking the file explorer, the outline or a
	// search box makes a sidebar leaf active, and gating on that would tear
	// the bar down and put it back every time the pointer left the editor.
	// getMostRecentLeaf() ignores the sidebars, which is exactly the
	// question being asked.
	//
	// getViewType() rather than `instanceof MarkdownView`: since 1.7
	// Obsidian defers unopened tabs, and a deferred view is not an instance
	// of anything useful while still reporting the type it will become.
	//
	// Fails OPEN on a throw. A future API change that breaks this should
	// leave the plugin working everywhere, not disable it everywhere.
	isNoteSurfaceActive() {
		try {
			const ws = this.app.workspace;
			// Fast path, and the only one that can see a markdown view in
			// a pop-out window: if the active view IS a note, it is a note.
			if (ws.getActiveViewOfType && ws.getActiveViewOfType(MarkdownView)) return true;
			let leaf = null;
			try { leaf = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : null; } catch (_) { wsCatch('isNoteSurfaceActive: leaf = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : null;', _); }
			const view = leaf && leaf.view;
			if (!view) return false;   // no pane at all
			const type = view.getViewType ? view.getViewType() : '';
			// AN EMPTY TAB IS A NOTE SURFACE WAITING FOR A NOTE. A canvas,
			// a PDF or a base is a different KIND of thing and the bar
			// rightly stands down for them — but a new tab is where a
			// writer lands between notes, and Obsidian's own bar reappearing
			// there for a second read as the plugin flickering off. The
			// bar shows what it can (the clock, the mode, the buttons) and
			// leaves the file readouts empty, which is what they are.
			// WORD-SMITH'S OWN PANEL IS NOT A CHANGE OF SURFACE. Clicking a
			// row in the docked menu makes it the most recent leaf, and
			// this then answered "no note here" — so the masks came down
			// and the letterbox only reappeared once the writer clicked
			// back into the note. The pane is a control surface for the
			// note they are still in; the question is what they are
			// WRITING in, not what they last touched.
			if (type === WS_MENU_VIEW) {
				return !!this.activeNoteFile();
			}
			return type === 'markdown' || type === 'empty';
		} catch { return true; }
	}

	// Whether a given CodeMirror view belongs to a markdown leaf. Canvas
	// cards, base formula fields and embedded editors are real CM6 views
	// that no leaf walk can identify — getFileForEditorView returns null
	// for them, which is indistinguishable from "a note whose leaf is not
	// wired up yet". The leaf container's data-type answers it directly.
	//
	// Fails OPEN for the same reason as above, and specifically so that an
	// editor in some container this does not recognise keeps its
	// decorations rather than silently losing them.
	editorViewIsNote(cmView: EditorView) {
		try {
			const dom = cmView && cmView.dom;
			if (!dom || !dom.closest) return true;
			const host = dom.closest('.workspace-leaf-content[data-type]');
			if (!host) return true;
			return host.getAttribute('data-type') === 'markdown';
		} catch { return true; }
	}

	hasScopeLimits() {
		return Array.isArray(this.settings.scopePaths) && this.settings.scopePaths.length > 0;
	}

	// True when the path is named by the list, either exactly (a note) or as
	// an ancestor (a folder). Prefix matching appends the separator so that
	// "Novel" does not also claim "Novel Ideas/draft.md".
	countExcludeList() {
		const s = this.settings;
		if (!Array.isArray(s.countExclude)) s.countExclude = [];
		return s.countExclude;
	}

	// Whole path segments only, so excluding "Book/Notes" does not also
	// exclude "Book/Notebook.md". The same rule the goal renames and the
	// history scoping use.
	isPathExcludedFromCounts(path: string|string[]) {
		if (!path) return false;
		for (const entry of this.countExcludeList()) {
			if (!entry) continue;
			const base = String(entry).replace(/\/+$/, '');
			if (!base) continue;
			if (path === base || path.indexOf(base + '/') === 0) return true;
		}
		return false;
	}

	isStoreFile(path: string) {
		if (!path) return false;
		// A LANGUAGE PACK (A571) is the plugin's own file too: visible, never
		// the writer's writing. Known by its name, before any scan.
		if (wsIsPackPath(path)) return true;
		try {
			if (path === this._historyPath) return true;
			if (path === this.structurePathNow()) return true;
			if (path === this.goalsFilePath()) return true;
			// …AND THE SETTINGS MIRROR, which was the one store this did not
			// know. CURRENT.md carried it as debt for pairs.
			//
			// It is the same fault the other three are here for, and worse in
			// one way: `settingsMirrorSync` rewrites this note on nearly every
			// settings change — a colour picker, a slider drag, a toggle — so
			// CHANGING A SETTING counted as writing. The plugin saw a modify,
			// counted the words, moved the day's total and repainted the bar.
			// A record of the writing recording itself being kept.
			//
			// THROUGH THE ACCESSOR, not the raw setting: `settingsMirrorPathFor`
			// is what every other reader uses and it is what strips a leading
			// slash. Comparing against `settings.settingsMirrorPath` directly
			// would go on counting in any vault whose path began with one.
			if (path === this.settingsMirrorPathFor()) return true;
			// …AND WHERE IT WAS FOUND (A875): the mirror is found by its mark wherever it is, and written there; one
			// moved out of its configured path was counted as a note, its JSON read for words at every write
			if (this._mirrorFoundAt && path === this._mirrorFoundAt) return true;
		} catch (_) { wsCatch('isStoreFile: if (path === this._historyPath) return true;', _); }
		return false;
	}

	// THE PLUGIN'S OWN FOLDER (A733, the writer: "add option to hide Word-Smith folder in Vault page settings, toggled off
	// by default (hide it from organizer, obsidian own filetree, export too)"): a folder holding the plugin's files and
	// NOTHING ELSE (the stores, the packs), `Word-Smith/` unless the writer moved them. A book folder a store was moved
	// into holds the writer's notes too, so it is never this. Read once until the vault changes (wsWireWorkspace).
	ownFolders(): string[] {
		if (this._ownFolders) return this._ownFolders;
		const dirs = new Set<string>();
		try {
			for (const f of this.app.vault.getFiles()) {
				const cut = f.path.lastIndexOf('/');
				if (cut > 0 && (this.isStoreFile(f.path) || WS_OWN_NAMES.test(f.name))) dirs.add(f.path.slice(0, cut));
			}
		} catch (_) { wsCatch('ownFolders: this.app.vault.getFiles()', _); }
		const out: string[] = [];
		for (const dir of dirs) {
			const node = this.app.vault.getAbstractFileByPath(dir);
			const kids = node && wsIsFolder(node) ? node.children : null;
			// (BY NAME TOO, measured live: just after a reload the history is not loaded yet, so `isStoreFile` did not know
			// ws-history.md and the folder was no one's; the plugin's files keep their names wherever they live)
			if (kids && kids.length && kids.every((k) => !wsIsFolder(k) && (this.isStoreFile(k.path) || WS_OWN_NAMES.test(k.name)))) out.push(dir);
		}
		this._ownFolders = out;
		return out;
	}
	// …and whether a path is in it, the switch on: the folder and everything in it
	isOwnHidden(path: string): boolean {
		if (!this.settings || !this.settings.hideOwnFolder || !path) return false;
		return this.ownFolders().some((d0) => path === d0 || path.startsWith(d0 + '/'));
	}
	// …and out of Obsidian's file explorer: its row and its children go with the folder's `.nav-folder` (the class is
	// taken off every other folder, and off all of them with the switch off)
	paintExplorerOwnFolder() {
		const own = this.settings.hideOwnFolder ? this.ownFolders() : [];
		// OBSIDIAN'S OWN RECORD OF EVERY ROW TOO (`fileItems`, private; measured live: the explorer draws only the rows in
		// view, and `Word-Smith/` sits at the foot): a folder scrolled to is drawn already marked, never shown for a pass.
		// The paths marked last time are unmarked when the switch or the folder changes.
		const marked = this._ownMarked || (this._ownMarked = new Set<string>());
		try {
			for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
				const items = leaf.view && leaf.view.fileItems;
				if (!items) continue;
				for (const p of marked) { const it = items[p]; if (it && it.el && own.indexOf(p) === -1) it.el.removeClass('ws-own-hidden'); }
				for (const p of own) { const it = items[p]; if (it && it.el) it.el.addClass('ws-own-hidden'); }
			}
		} catch (_) { wsCatch('paintExplorerOwnFolder: fileItems', _); }
		marked.clear();
		for (const p of own) marked.add(p);
		const roots = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
		for (const root of Array.from(roots)) {
			for (const t of Array.from(root.querySelectorAll<HTMLElement>('.nav-folder-title'))) {
				const box = t.closest('.nav-folder');
				if (box) box.toggleClass('ws-own-hidden', own.indexOf(String(t.dataset.path || '')) !== -1);
			}
		}
	}

	// …AND OUT OF THE GRAPH (#71, Skrath: "Any chance they can also be hidden from the graph view?"): the folder in
	// Obsidian's own Excluded files (Settings → Files and links), the one list the graph, search, Bases and the link
	// suggestions all ask (`metadataCache.isUserIgnored`, read in 1.14.4's app.js). SYNC DOES NOT READ IT (the writer
	// asked; measured there: Sync keeps its own `ignoreFolders`), so the files still sync. ONLY WHAT THIS ADDED is taken
	// out again (`ownExcluded`): an entry the writer typed is theirs, switch or no switch. Not before the vault is read
	// (the folder would read as gone and its entry be taken out at every start), and never on unload, or app.json
	// would change at every close.
	excludeOwnFolder() {
		const vault = this.app && this.app.vault;
		if (!vault || typeof vault.getConfig !== 'function' || typeof vault.setConfig !== 'function') return;
		if (!this.app.workspace || !this.app.workspace.layoutReady) return;
		const ours = (this.settings.ownExcluded || []).map(String);
		if (!this.settings.hideOwnFolder && !ours.length) return;
		const want = this.settings.hideOwnFolder ? this.ownFolders().map((d) => d + '/') : [];
		const raw = vault.getConfig('userIgnoreFilters');
		const now = Array.isArray(raw) ? raw.map(String) : [];
		const next = now.filter((e) => !(ours.includes(e) && !want.includes(e)));
		const kept = ours.filter((e) => want.includes(e) && next.includes(e));
		// (the writer's own entry for the folder, in any case, as Obsidian matches: kept, not added again, not ours)
		for (const d of want) if (!next.some((e) => e.toLowerCase() === d.toLowerCase())) { next.push(d); kept.push(d); }
		if (next.length !== now.length || next.some((e, i) => e !== now[i])) {
			try { vault.setConfig('userIgnoreFilters', next.length ? next : null); } catch (_) { wsCatch('excludeOwnFolder: setConfig', _); return; }
		}
		if (kept.length !== ours.length || kept.some((e, i) => e !== ours[i])) {
			this.settings.ownExcluded = kept;
			void this.saveSettings();
		}
	}
	// …a moment after the vault changes (the folder moved or renamed), and only while there is something to keep in line
	excludeOwnFolderSoon() {
		if (!this.settings || (!this.settings.hideOwnFolder && !(this.settings.ownExcluded || []).length)) return;
		if (this._ownExcludeTimer) window.clearTimeout(this._ownExcludeTimer);
		this._ownExcludeTimer = window.setTimeout(() => { this._ownExcludeTimer = null; this.excludeOwnFolder(); }, 1500);
	}

	isFileCounted(file: TAbstractFile) {
		if (!file || !file.path) return false;
		// The history store is a note in the vault, and the History tab tells
		// people to keep it beside their manuscript — so without this it lands
		// INSIDE the folder whose goal it would then inflate, growing by a row
		// a day while it does so. It is already excluded from the history
		// itself by path; this is the same exclusion for every other total.
		if (this._historyPath && file.path === this._historyPath) return false;
		// …AND THE OTHER TWO STORES, for the same reason and a worse one.
		// The export list is rewritten every time a box is ticked and the
		// goals file every time a target changes — so ticking a scene in
		// the Export window counted as WRITING: it moved the day's word
		// count, repainted the bar, and glitched the whole interface while
		// a writer was choosing files. A record of the writing should not
		// record itself being kept.
		if (this.isStoreFile(file.path)) return false;
		if (!this.isFileInScope(file)) return false;
		return !this.isPathExcludedFromCounts(file.path);
	}

	pathMatchesScope(path: string) {
		if (!path) return false;
		for (const entry of this.settings.scopePaths) {
			if (!entry) continue;
			if (entry === '/') return true;                 // vault root
			if (path === entry) return true;
			if (path.startsWith(entry.endsWith('/') ? entry : entry + '/')) return true;
		}
		return false;
	}

	isFileInScope(file: TAbstractFile | null | undefined) {
		// `wordsmith: off` in the frontmatter wins over any path list, and
		// `wordsmith: on` opts a note back in past an excluding one.
		const ov = this.getOverrides(file);
		if (ov && ov.__disabled === true)  return false;
		if (ov && ov.__disabled === false) return true;
		// WORD-SMITH'S OWN NOTES ARE IN SCOPE (A607, A611): a pack, ws-structure.md,
		// the history, the settings note, whatever the path list leaves out. The bar,
		// the marks and the note's layout come with them; counted they never are
		// (isFileCounted asks isStoreFile first), and a pack is never retyped.
		if (file && file.path && this.isStoreFile(file.path)) return true;
		if (!this.hasScopeLimits()) return true;
		const exclude = this.settings.scopeMode === 'exclude';
		// No file at all (an empty pane, a non-markdown view): in scope only
		// when the list is naming things to leave out.
		if (!file || !file.path) return exclude;
		const hit = this.pathMatchesScope(file.path);
		return exclude ? !hit : hit;
	}

	isActiveFileInScope() {
		// Surface first: a canvas or a base is out of scope before any path
		// list or frontmatter is consulted, because there is no note to
		// consult them about.
		if (!this.isNoteSurfaceActive()) return false;
		// No "no limits configured" shortcut here: frontmatter can disable a
		// note on its own, and the shortcut used to return true before the
		// override was ever read. getOverrides is cached, so this is cheap.
		//
		// THE NOTE IN HAND, not the active view's file. A click in the file
		// explorer or in a docked pane makes a sidebar leaf the active one, and
		// the active MarkdownView is then null — asked about `null`, an include
		// list answered "out of scope", and the bar came down, Obsidian's own
		// bar came up and the note's font went, on every click beside the
		// editor. `activeNoteFile` is the view still open in the main area (the
		// remembered one), which is the note the question is about.
		return this.isFileInScope(this.activeNoteFile());
	}

	// Which file a given CodeMirror view is showing. Needed because split
	// panes can hold one in-scope and one out-of-scope note at the same time,
	// and the decorations have to follow their own editor, not the active one.
	getFileForEditorView(cmView: EditorView&{ cm?: WsCm5Facade; }): TFile | null {
		let found: TFile | null = null;
		try {
			this.app.workspace.iterateAllLeaves(leaf => {
				if (found) return;
				const v = leaf && leaf.view;
				if (v && v.editor && v.editor.cm === cmView) found = v.file || null;
			});
		} catch (_) { wsCatch('getFileForEditorView: this.app.workspace.iterateAllLeaves(leaf =>', _); }
		return found;
	}

	// Memoised against a generation counter that every file/layout change
	// bumps, so the leaf walk above happens once per editor per change rather
	// than once per repaint.
	isEditorInScope(cmView: EditorView) {
		if (!cmView) return true;
		// Same reasoning as isActiveFileInScope: the file has to be resolved
		// even with no path list, because its frontmatter may opt out. The
		// generation memo below keeps that to one leaf walk per editor per
		// file/layout change rather than one per repaint.
		if (cmView._wsScope && cmView._wsScope.gen === this._scopeGen) return cmView._wsScope.in;
		// Not a note's editor at all — a canvas card, a base field — so no
		// decoration belongs in it, whatever file the pane behind it holds.
		// A LANGUAGE PACK IS MARKED UP like any note since A611, on the writer's word
		// (A571 left it bare); only its typing is left alone (isEditorPack).
		const viewFile = this.getFileForEditorView(cmView);
		const val = this.editorViewIsNote(cmView)
			&& this.isFileInScope(viewFile);
		cmView._wsScope = { gen: this._scopeGen, in: val };
		return val;
	}

	// A LANGUAGE PACK'S EDITOR (A611): its quote marks and its words are what Word-Smith
	// reads, so Typography and Capitalize sentences never retype them. Memoised as above.
	isEditorPack(cmView: EditorView) {
		if (!cmView) return false;
		if (cmView._wsPack && cmView._wsPack.gen === this._scopeGen) return cmView._wsPack.on;
		const f = this.getFileForEditorView(cmView);
		const on = !!(f && wsIsPackPath(f.path));
		cmView._wsPack = { gen: this._scopeGen, on };
		return on;
	}

	// Called on every leaf/file change. Cheap when no limits are configured.
	syncScope() {
		this._scopeGen++;
		if (!this.settings.pluginEnabled) return;
		const inScope = this.isActiveFileInScope();
		// The panes are stamped on every change (a note opened in one, a pane
		// closed); the body follows only when what they add up to has moved.
		const before = this._lastPaneScope;
		const panes = this.stampPaneScope();
		// (and the open notes' own keys, A862)
		const keys = this.noteKeysSig();
		if (inScope === this._lastScopeInScope && panes.any + ':' + panes.anyTw === before && keys === this._lastNoteKeys) return;
		this._lastScopeInScope = inScope;
		if (keys !== this._lastNoteKeys) { this._lastNoteKeys = keys; this.applyStyleProps(); }
		this.applyBodyClasses();
		this.reconfigureEditors();
		this.applyVimMotionMaps();
		// Crossing into or out of a note is also what suspends and restores
		// zen's collapsed sidebars.
		this.syncSurfaceSidebars();
	}

	// ════════════════════════════════════════════════════════════════════════
	// DOCUMENT ANALYSIS: counting, paragraphs, non-prose lines
	// ════════════════════════════════════════════════════════════════════════

	getFilePath(view: MarkdownView | null) {
		const file = view && view.file;
		if (!file) return 'no file';
		// _fitShortenFile is set by the fit pass and read HERE, at build
		// time. The first version of this rewrote the rendered element
		// instead, and the bar re-renders every second — the two fought and
		// the name visibly flipped back and forth. Deciding it while the
		// text is being produced means every render is self-consistent and
		// there is nothing to undo.
		if ((this.settings || {}).fileTokenFormat === 'name' || this._fitShortenFile) {
			return file.basename;
		}
		const parts = file.path.split('/');
		return (parts.length <= 1 ? '~/' : '~/' + parts.slice(0, -1).join('/') + '/') + file.basename;
	};

	// THE NOTE A PANEL SHOULD ANSWER ABOUT.
	//
	// `getActiveViewOfType(MarkdownView)` answers null the moment focus
	// leaves the editor — and clicking a row in a docked panel does
	// exactly that, because the panel IS the active leaf. So the Report
	// opened from the panel found no file and reported on "Current note",
	// which is the emptiest possible answer to "how long is this?".
	//
	// The last markdown view seen is remembered instead, and consulted
	// when the live one is gone. Obsidian's own `getActiveFile()` keeps
	// working this way for the same reason — a sidebar click is not a
	// change of note — so this only teaches the plugin what the app
	// already believes.
	rememberActiveMarkdown() {
		try {
			const v = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (v && v.file) this._lastMdView = v;
		} catch (_) { wsCatch('rememberActiveMarkdown: const v = this.app.workspace.getActiveViewOfType(MarkdownView);', _); }
	}

	activeMarkdownView() {
		try {
			const v = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (v && v.file) { this._lastMdView = v; return v; }
		} catch (_) { wsCatch('activeMarkdownView: const v = this.app.workspace.getActiveViewOfType(MarkdownView);', _); }
		// The remembered one, but only while its leaf is still open and
		// still holds a file: a view whose tab was closed must not go on
		// answering for a note nobody is looking at.
		const last = this._lastMdView;
		if (last && last.file) {
			try {
				const alive = this.app.workspace.getLeavesOfType('markdown')
					.some((l) => l.view === last);
				if (alive) return last;
			} catch { return last; }
		}
		// NO SYNTHETIC VIEW. This used to hand back `{ file }` from the
		// app's own active file when no real view could be found — enough
		// for the Report, which only wants a name, and POISON for the mask
		// layout, which asks the view for its scroller. That object has no
		// contentEl, so `stampMaskPositions` threw on every frame: the
		// letterbox set its class, the text took its padding, and nothing
		// was ever drawn. A flicker with no masks in it.
		//
		// This returns a REAL VIEW or nothing. Callers that only want the
		// file ask for the file.
		return null;
	}

	// The note a panel should answer ABOUT, by name. Falls back to the
	// app's own active file, which survives a sidebar click even when the
	// view lookup does not — this is the part the Report wanted, and the
	// part that must not be dressed up as a view.
	activeNoteFile() {
		const v = this.activeMarkdownView();
		if (v && v.file) return v.file;
		try { return this.app.workspace.getActiveFile() || null; } catch { return null; }
	}

	// ── The docked panel ─────────────────────────────────────────────────────
	// Registered once, at load, and only while the setting is on: an
	// unregistered view type in a saved workspace layout is simply skipped
	// by Obsidian, so switching this off cannot corrupt a layout — the
	// pane goes, and comes back where it was if the setting returns.
	// The serif W, drawn. Stroke-based rather than a glyph: an icon has no
	// text node to hang a font on, and a path is the same shape in every
	// vault whatever fonts are installed. The two short cross strokes are
	// the serifs at the top terminals.
	registerWsIcon() {
		if (!addIcon || this._wsIconDone) return;
		this._wsIconDone = true;
		try {
			// THE SAME LETTER AS THE RIBBON, and by the same means: a real
			// glyph in a real serif face. The first version drew a W as
			// stroked paths and did not match — a hand-drawn W is a
			// different letter from a typeset one, and the two sat inches
			// apart where anyone could see it. An <text> node inside the
			// icon's SVG renders the face the ribbon renders, so they are
			// the same shape by construction rather than by resemblance.
			addIcon(WS_ICON,
				'<text x="50" y="76" text-anchor="middle" fill="currentColor" '
				+ 'font-size="84" font-weight="500" '
				+ 'font-family="\'Iowan Old Style\', Georgia, \'Times New Roman\', '
				+ '\'Liberation Serif\', serif">W</text>');
		} catch (_) { wsCatch('registerWsIcon: addIcon(WS_ICON,', _); }
	}

	// THE DAILY TARGET, ASKED FOR from the command (A879): the token's panel while the token is on the bar, else a prompt
	// for the words a day, 0 for none
	dailyTargetOpen() {
		const tok = this.retroStatusBarEl ? this.retroStatusBarEl.querySelector<HTMLElement>('.ws-dailytok') : null;
		if (tok && tok.isConnected) { this.openDailyPanel(tok); return; }
		this.dailyWordGoalPrompt();
	}

	dailyWordGoalPrompt() {
		const p = new WsPrompt(this.app, wsT('Daily target'), '1000', async (v) => {
			const n = Number(String(v).replace(/[\s,.\u00a0\u202f']/g, ''));
			if (!isFinite(n) || n < 0 || Math.floor(n) !== n || n > 1000000) return wsT('A whole number of words, 0 for none.');
			this.settings.dailyWordGoal = n;
			await this.saveSettings();
			this.updateRetroStatusBar();
			return true;
		});
		const g = Number(this.settings.dailyWordGoal) || 0;
		if (g > 0) p.field.value = String(g);
		p.open();
	}

	// Reads CapsLock/NumLock state off a keyboard event and refreshes the
	// retro bar when either changes. Not every keyboard event supports
	// getModifierState (and NumLock has no meaning on keyboards/OSes without
	// a physical numpad concept, e.g. most Mac laptops), so this fails quiet.
	updateModifierState(evt: { getModifierState: (key: string) => boolean } | null) {
		if (!evt || typeof evt.getModifierState !== 'function') return;
		let changed = false;
		try {
			const caps = evt.getModifierState('CapsLock');
			if (caps !== this._capsLockOn) { this._capsLockOn = caps; changed = true; }
		} catch { /* getModifierState with an unsupported key name can throw */ }
		try {
			const num = evt.getModifierState('NumLock');
			if (num !== this._numLockOn) { this._numLockOn = num; changed = true; }
		} catch (_) { wsCatch('updateModifierState: const num = evt.getModifierState(\'NumLock\');', _); }
		if (changed) this.updateRetroStatusBar();
	}

	// Best-effort Vim mode label for {vim}. Obsidian's Vim mode is backed by
	// @replit/codemirror-vim, which exposes its state on a CM5-compatible
	// facade at editor.cm.cm — not officially documented, but it's the same
	// access pattern community Vim-status plugins rely on. Falls back to ''
	// (token renders empty) any time the shape isn't what's expected, e.g.
	// Vim mode is off, or a future Obsidian version changes internals.
	// The caret is in the note itself, rather than in some dialog over it.
	editorHasFocus() {
		try {
			const a = document.activeElement;
			return !!(a && a.closest && a.closest('.cm-editor'));
		} catch { return true; }
	}
}

// The modules' methods onto the prototype (WsAreaMethods, over the class, is their type).
Object.assign(WordSmith.prototype, historyMethods, exportMethods, themesMethods, storesMethods, menuMethods, barMethods, reportMethods, organizerWindowMethods, treeMethods, focusMethods, editorMethods, paintMethods, diagnosticsMethods);
