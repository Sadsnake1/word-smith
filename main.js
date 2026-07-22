'use strict';

const { Plugin, PluginSettingTab, Setting, MarkdownView, TFile } = require('obsidian');

// Obsidian exposes its bundled CodeMirror 6 packages to plugins via require.
// Decorations registered through registerEditorExtension render inside CM6's
// own pipeline, which is the only glitch-free way to do per-line styling —
// any MutationObserver / direct-DOM approach races the editor's rendering
// and flickers (this is also how the reference typewriter-mode plugin works).
let CM = null;
try {
	const { ViewPlugin, Decoration, WidgetType } = require('@codemirror/view');
	const { RangeSetBuilder } = require('@codemirror/state');
	CM = { ViewPlugin, Decoration, WidgetType, RangeSetBuilder };
} catch (_) {
	// Extremely old Obsidian build — dimming + hidden markers silently off.
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrow style presets
// ─────────────────────────────────────────────────────────────────────────────

const ARROW_STYLES = {
	'solid-triangle':   { top: '▲', bottom: '▼' },
	'outline-triangle': { top: '△', bottom: '▽' },
	'standard-arrow':   { top: '↑', bottom: '↓' },
	'chevron':          { top: '∧', bottom: '∨' },
	'double-chevron':   { top: '⇑', bottom: '⇓' },
	'custom':           { top: '',   bottom: ''  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
	// ── Master switch ─────────────────────────────────────────────────────────
	pluginEnabled:            true,

	// ── Zen mode ──────────────────────────────────────────────────────────────
	// zenMode stays false as a default even though the author writes in zen:
	// it's a runtime mode, not a preference — defaulting it on would collapse
	// sidebars and hide the entire UI the moment a new user installs the
	// plugin, before they know what's happening or how to exit.
	zenMode:                  false,
	fullscreen:               false,
	leftSidebar:              true,       // saved state (was collapsed when entering zen)
	rightSidebar:             true,
	hideProperties:           true,
	hideInlineTitle:          true,
	hideStatusBar:            true,
	hideLinkedMentions:       true,
	hideScrollBar:            true,
	hideRibbon:               true,
	topPadding:               0,
	bottomPadding:            0,
	focusedFileMode:          false,

	// ── Typewriter / letterbox ────────────────────────────────────────────────
	enableTypewriter:         true,
	editorPaddingH:           90,
	enableLetterbox:          true,
	letterboxLines:           8,
	letterboxPx:              87,
	maskPaddingH:             208,
	maskOverhang:             4,
	arrowStyle:               'solid-triangle',
	customArrowTop:           '^',
	customArrowBottom:        'v',
	arrowCount:               5,
	arrowScale:               1.0,
	separatorStyle:           'solid',
	separatorWeight:          2,
	highlightCurrentLine:     false,
	lineHighlightDarkColor:   '#3a3a2a',
	lineHighlightLightColor:  '#fff2b2',
	lineHighlightOpacity:     0.35,
	typewriterLinesAbove:     8,
	typewriterLinesBelow:     8,
	dimUnfocusedEnabled:      true,
	dimFocusMode:             'paragraph', // 'paragraph' | 'sentence'
	dimOpacity:               0.35,

	// ── Retro status bar ──────────────────────────────────────────────────────
	enableRetroStatus:        true,
	statusFormatLeft:         '{file}',
	statusFormatCenter:       '{goal}',
	statusFormatRight:        ' ¶{paragraph} | {words}w | {battery} | {date} {time} ',
	fileTokenFormat:          'name',     // 'path' (~/folder/name) | 'name' (basename only)
	statusBarBorder:          true,
	statusBarFontSize:        12,
	statusBarHeight:          30,
	goalTarget:               1000,
	goalDisplay:              'bar',
	goalBaseline:             0,          // per-vault word-count counter — never ship a non-zero default
	goalBarCells:             20,
	goalFlashEnabled:         true,
	dateFormat:               'dd/mm',
	retroDarkBgColor:         '#050505',
	retroDarkTextColor:       '#fbfaf9',
	retroLightBgColor:        '#f5f0e8',
	retroLightTextColor:      '#050505',
	arrowDarkColor:           '#fbfaf9',
	arrowLightColor:          '#2b2b2b',
	lineDarkColor:            '#faf8f5',
	lineLightColor:           '#2b2b2b',

	// ── Misc options ──────────────────────────────────────────────────────────
	miscEnabled:              true,

	// ── Text options ──────────────────────────────────────────────────────────
	enableParagraphIndent:    false,
	paragraphIndentEm:        2,
	paragraphIndentMode:      'double',   // 'double' | 'single'
	lineSpacing:              1.5,
	justifyText:              true,
	showHiddenMarkers:        false,
	markSpaces:               true,
	markTabs:                 true,
	markParagraphs:           true,
	markEndOfLines:           true,

	// ── Sidebar word counts ───────────────────────────────────────────────────
	enableFileTreeCounts:     true,
	enableOutlineCounts:      true
};

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

module.exports = class WordSmith extends Plugin {

	async onload() {
		// ── Mask / letterbox state ─────────────────────────────────────────────
		this.maskTopEl        = null;
		this.maskBottomEl     = null;
		this.arrowsTopEl      = null;
		this.arrowsBottomEl   = null;
		this.maskResizeObserver = null;
		this._maskRaf         = null;

		// ── Retro bar state ───────────────────────────────────────────────────
		this.retroStatusBarEl = null;
		this.clockInterval    = null;
		this.batteryLevel     = null;
		this.batteryCharging  = false;
		this._batteryManager  = null;   // kept so listeners can be detached on unload
		this._batteryHandler  = null;
		this._zgLastTotalWordCount = 0;
		this._docStatsCache   = null;   // { doc, totalWC, charCount, paras } keyed on CM doc identity
		this._lastFit         = null;   // fitStatusBarText memo { text, width, base }
		this._capsLockOn      = false;  // tracked from keyboard events for {caps}
		this._numLockOn       = false;  // tracked from keyboard events for {nump}

		// ── Scroll / resize handlers ──────────────────────────────────────────
		this.currentScroller  = null;
		this.scrollHandler    = null;
		this.windowResizeHandler = null;

		// ── Paragraph tagger ──────────────────────────────────────────────────
		this._paraTaggerObserver = null;
		this._paraTaggerTarget   = null;
		this._paraTagRaf         = null;

		// ── Style injection ───────────────────────────────────────────────────
		this.styleEl          = null;

		// ── Word count cache ──────────────────────────────────────────────────
		this.explorerObserver = null;
		this.wordCountCache   = new Map();
		this._patchScheduled  = false;

		// ── Zen state ─────────────────────────────────────────────────────────
		this._isTogglingZen   = false;
		this._wasZenMode      = false;
		this._tabContainersCache = null;

		// ── Drag / refresh bookkeeping ────────────────────────────────────────
		this._activeDragCleanup = null;   // aborts an in-flight mask drag on unload
		this._refreshTimer      = null;   // debounced saveSettings → refresh

		// ── Live selection rAF ────────────────────────────────────────────────
		this._selectionRaf    = null;

		// ── Theme observer ────────────────────────────────────────────────────
		this._themeObserver   = null;

		await this.loadSettings();
		this._wasZenMode = this.settings.zenMode;

		// Zen mode persists across restarts, but _wasZenMode above makes
		// setSidebarVisibility() a no-op on the first refresh() — so a vault
		// relaunched in zen mode could come back with body classes applied yet
		// sidebars open. Force the sidebars into the zen state once the
		// workspace layout exists, without touching the saved pre-zen
		// leftSidebar/rightSidebar restore state.
		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.pluginEnabled || !this.settings.zenMode) return;
			const ws = this.app.workspace;
			if (ws.leftSplit  && !ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.collapse();
		});

		this.addSettingTab(new WordSmithSettingTab(this.app, this));
		this.setupBattery();

		// Commands
		this.addCommand({
			id: 'toggle-wordsmith',
			name: 'Toggle Word-Smith on/off',
			callback: () => this.toggleFullPlugin()
		});
		this.addCommand({
			id: 'toggle-zen-mode',
			name: 'Zen mode',
			callback: () => this.toggleZenMode()
		});
		// "WS" badge ribbon button — toggles the whole plugin on/off.
		// Obsidian's addRibbonIcon expects a Lucide icon name; we replace
		// the SVG it inserts with a text badge and use a class hook for
		// styling. The label doubles as the tooltip.
		this.wsRibbonEl = this.addRibbonIcon('type', 'Toggle Word-Smith on/off', () => this.toggleFullPlugin());
		this.wsRibbonEl.addClass('ws-ribbon-btn');
		this.wsRibbonEl.empty();
		this.wsRibbonEl.createSpan({ cls: 'ws-ribbon-badge', text: 'WS' });
		this.updateWsRibbonState();

		// Workspace events
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.updateWorkspaceAesthetics();
			this.scheduleExplorerPatch();
			if (this.settings.zenMode && this.settings.focusedFileMode) this.updateFocusedFileMode();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('editor-change', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('resize', () => this.scheduleMaskPosition()));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this._tabContainersCache = null;
			if (this.settings.zenMode && this.settings.focusedFileMode) this.updateFocusedFileMode();
			// The explorer/outline observers are scoped to their leaf
			// containers, which layout changes can recreate — re-bind them.
			if (this.settings.pluginEnabled &&
				(this.settings.enableFileTreeCounts || this.settings.enableOutlineCounts)) {
				this.attachExplorerObserver();
				this.scheduleExplorerPatch();
			}
		}));

		// DOM events
		this.registerDomEvent(document, 'keyup', (evt) => {
			this.updateModifierState(evt);
			this.updateRetroStatusBar();
			this.typewriterScroll();
		});
		this.registerDomEvent(document, 'mouseup', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		});
		// Live selection word count. selectionchange fires only when the
		// selection actually changes (mouse drag, shift+arrows, double-click),
		// unlike the old document-wide mousemove listener that re-derived
		// word counts on every pointer frame even with no selection at all.
		this._selectionRaf = null;
		this.registerDomEvent(document, 'selectionchange', () => {
			if (this._selectionRaf) return;
			this._selectionRaf = requestAnimationFrame(() => {
				this._selectionRaf = null;
				this.updateRetroStatusBar();
			});
		});
		// Escape exits zen mode (from new zen plugin — respects vim mode and excalidraw)
		this.registerDomEvent(document, 'keydown', (evt) => {
			this.updateModifierState(evt);
			if (evt.key === 'Escape' && this.settings.zenMode) {
				const target = evt.target;
				if (target) {
					const cmEditor = target.closest('.cm-editor');
					if (cmEditor) {
						const vault = this.app.vault;
						if (vault.config && vault.config.vimMode === true) return;
					}
					if (target instanceof HTMLTextAreaElement && target.className && target.className.includes('excalidraw')) return;
				}
				const activeModal = document.querySelector('.modal');
				if (!activeModal) { this.toggleZenMode(); evt.preventDefault(); }
			}
		});

		// Track whether the note editor itself has focus. Used to gate the
		// elevated z-index (above Cursor Smith's canvas) so masks/arrows/bar
		// only float above everything while actually writing — not above the
		// command palette, settings, context menus, or other modals, which
		// take focus away from .cm-editor.
		const updateEditorFocusClass = () => {
			const active = document.activeElement;
			const inEditor = !!(active && active.closest && active.closest('.cm-editor'));
			document.body.classList.toggle('zg-editor-focused', inEditor);
		};
		this.registerDomEvent(document, 'focusin', updateEditorFocusClass);
		this.registerDomEvent(document, 'focusout', () => requestAnimationFrame(updateEditorFocusClass));
		updateEditorFocusClass();

		// Vault events
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (this.wordCountCache) this.wordCountCache.delete(file.path);
			this.scheduleExplorerPatch();
		}));

		// Theme observer. Guarded on pluginEnabled: disablePlugin() removes
		// body classes, which fires this very observer — without the guard
		// it would recreate the injected styles (line highlight etc.) and
		// re-stamp CSS variables immediately after they were removed.
		this._themeObserver = new MutationObserver(() => {
			if (!this.settings.pluginEnabled) return;
			this.applyCssVariables();
			this.updateStyleEl();
		});
		this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

		// CM6 decoration extensions (focus dimming + hidden markers)
		this.setupEditorExtensions();

		this.refresh();
	}

	onunload() {
		// Clean up retro bar
		this.removeCustomElements();
		this.stopClockTick();
		// Clean up style injection
		this.removeStyleEl();
		// Clean up para tagger
		this.detachParaTagger();
		// Clean up word count observer
		this.detachExplorerObserver();
		this.removeWordCounts();
		// Clean up scroll/resize handlers
		this.detachScrollHandler();
		this.detachResizeHandler();
		// Restore the native status bar (inline hide is not class-based)
		this.applyNativeStatusBarVisibility(false);
		// Clean up theme observer
		if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
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
		// Exit zen mode cleanly
		if (this.settings.zenMode) {
			this.settings.zenMode = false;
			this.applyBodyClasses();
			this.setSidebarVisibility();
		}
		document.body.classList.remove(
			'zenmode-active', 'zenmode-hide-properties', 'zenmode-hide-status-bar',
			'zenmode-hide-scroll-bar', 'zenmode-hide-title-bar',
			'zenmode-hide-linked-mentions', 'zg-para-indent', 'zg-justify'
		);
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// Restore all tab containers
		document.querySelectorAll('.workspace-tabs').forEach(el => {
			el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
			el.style.display = '';
			el.style.width   = '';
			el.style.flex    = '';
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
		// The ASCII arrow style was removed (too similar to Chevron) — carry
		// anyone still on it over to the closest replacement.
		if (this.settings.arrowStyle === 'ascii') {
			this.settings.arrowStyle = 'chevron';
		}
		// Transient UI state that older versions leaked into data.json, plus
		// settings for the removed exit button. Dropped on next save.
		delete this.settings._lastArrowCount;
		delete this.settings.exitButtonVisibility;
		delete this.settings.autoHideButtonOnDesktop;
	}

	// Persist settings. By default the full refresh() (mask/observer teardown
	// and rebuild) is debounced so a slider drag firing onChange every tick
	// doesn't rebuild the world per tick — only the trailing call applies.
	// Pass applyImmediately for state changes that must land now (zen toggle,
	// master switch).
	async saveSettings(applyImmediately = false) {
		await this.saveData(this.settings);
		if (applyImmediately) {
			if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
			this.refresh();
		} else {
			this.scheduleRefresh();
		}
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

	refresh() {
		this.updateWsRibbonState();
		if (!this.settings.pluginEnabled) { this.disablePlugin(); this.reconfigureEditors(); return; }
		this.applyBodyClasses();
		this.applyCssVariables();
		this.updateStyleEl();
		this.updateWorkspaceAesthetics();
		this.setSidebarVisibility();
		this.updateFocusedFileMode();
		this.typewriterScroll();
		// The dim/marker decorations read settings only when (re)built, so a
		// settings change needs the editors reconfigured to take effect.
		this.reconfigureEditors();
		if (this.settings.enableFileTreeCounts || this.settings.enableOutlineCounts) {
			this.attachExplorerObserver();
		} else {
			this.detachExplorerObserver();
			this.removeWordCounts();
		}
	}

	// Swaps the registered extension array's contents for freshly built
	// plugin instances, then reconfigures every open editor. Both halves are
	// required: updateOptions() alone with the same extension values is a
	// no-op (CM6 keeps the old instances), and swapping without
	// updateOptions() never reaches the editors. With the plugin disabled
	// the array is emptied, which fully removes the decorations.
	reconfigureEditors() {
		if (CM && this.editorExtensions) {
			this.editorExtensions.length = 0;
			this.editorExtensions.push(...this.buildEditorExtensions());
		}
		try { this.app.workspace.updateOptions(); } catch (_) {}
	}

	// Tear down everything without unloading the plugin
	disablePlugin() {
		this.removeCustomElements();
		this.stopClockTick();
		this.removeStyleEl();
		this.detachParaTagger();
		this.detachExplorerObserver();
		this.removeWordCounts();
		this.detachScrollHandler();
		this.detachResizeHandler();
		this.applyNativeStatusBarVisibility(false);
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		// Strip all body classes and attributes
		document.body.classList.remove(
			'zenmode-active', 'zenmode-hide-properties', 'zenmode-hide-status-bar',
			'zenmode-hide-scroll-bar', 'zenmode-hide-linked-mentions', 'zg-para-indent',
			'zg-justify', 'zg-masks-active', 'zenmode-hide-ribbon', 'zg-retrobar-active'
		);
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// The horizontal padding rule is unscoped (applies always), so it
		// needs its own reset when the plugin itself is turned off.
		document.documentElement.style.removeProperty('--zg-editor-padding-h');
		// Restore tab containers
		document.querySelectorAll('.workspace-tabs').forEach(el => {
			el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
			el.style.display = ''; el.style.width = ''; el.style.flex = '';
		});
		// Restore sidebars
		const ws = this.app.workspace;
		if (ws.leftSplit && !ws.leftSplit.collapsed)   ws.leftSplit.expand();
		if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.expand();
		// Exit fullscreen
		if (document.fullscreenElement && document.exitFullscreen) {
			document.exitFullscreen().catch(() => {});
		}
	}

	applyBodyClasses() {
		const body = document.body;
		const zen  = this.settings.zenMode;
		// The retro bar visually replaces the native status bar, so it always
		// hides it while active — independent of the separate "hide native
		// status bar in zen mode" toggle below. These used to share a single
		// setting, which meant flipping either one could silently flip the
		// other's effect (e.g. turning the retro bar on/off would overwrite
		// the zen-mode toggle's value, or vice versa).
		const hideNativeStatusBar = this.settings.enableRetroStatus || (zen && this.settings.hideStatusBar);
		body.classList.toggle('zenmode-active',             zen);
		body.classList.toggle('zenmode-hide-properties',    zen && this.settings.hideProperties);
		body.classList.toggle('zenmode-hide-status-bar',    hideNativeStatusBar);
		this.applyNativeStatusBarVisibility(hideNativeStatusBar);
		body.classList.toggle('zenmode-hide-scroll-bar',    zen && this.settings.hideScrollBar);
		body.classList.toggle('zenmode-hide-linked-mentions', zen && this.settings.hideLinkedMentions);
		body.classList.toggle('zenmode-hide-ribbon',        zen && this.settings.hideRibbon);
		body.classList.toggle('zg-para-indent',             this.settings.enableParagraphIndent);
		body.classList.toggle('zg-justify',                 this.settings.justifyText);
		body.classList.toggle('zg-masks-active',            this.settings.enableTypewriter && this.settings.enableLetterbox);
		if (zen) {
			body.setAttribute('data-zen-hide-inline-title', String(this.settings.hideInlineTitle));
			body.setAttribute('data-zen-focused-file',      String(this.settings.focusedFileMode));
		} else {
			body.removeAttribute('data-zen-hide-inline-title');
			body.removeAttribute('data-zen-focused-file');
		}
	}

	// Hides/restores the native status bar via an inline
	// display:none!important. The class-based CSS rule alone proved
	// unreliable: themes and snippets commonly style .status-bar with
	// higher-specificity or !important rules that outrank a descendant
	// selector, which let the native bar show through the retro bar's
	// goal-met flash (whose strobe dips the retro bar's opacity). An inline
	// important declaration cannot be beaten by any stylesheet rule.
	applyNativeStatusBarVisibility(hide) {
		const nb = document.querySelector('.status-bar');
		if (!nb) return;
		if (hide) nb.style.setProperty('display', 'none', 'important');
		else nb.style.removeProperty('display');
	}

	applyCssVariables() {
		const root = document.documentElement.style;
		root.setProperty('--zg-editor-padding-h',    this.settings.editorPaddingH + 'px');
		// (z-index vars intentionally not stamped here — the stylesheet
		// defaults already provide them, and inline values on :root would
		// still lose to the elevated body.zg-masks-active values anyway.)
		root.setProperty('--zen-mode-top-padding',    this.settings.topPadding + 'px');
		root.setProperty('--zen-mode-bottom-padding', this.settings.bottomPadding + 'px');

		// Arrow size is a vw-based clamp() in styles.css so it tracks window
		// resizes with zero JS; only the user's scale multiplier is stamped.
		root.setProperty('--zg-arrow-scale',          String(this.settings.arrowScale || 1));
		root.setProperty('--zg-separator-style',      this.settings.separatorStyle);
		root.setProperty('--zg-separator-weight',     this.settings.separatorWeight + 'px');
		root.setProperty('--zg-status-bar-font-size', this.settings.statusBarFontSize + 'px');
		root.setProperty('--zg-status-bar-height',    this.settings.statusBarHeight + 'px');
		root.setProperty('--zg-para-indent',          (this.settings.paragraphIndentEm || 2) + 'em');
		root.setProperty('--zg-mask-overhang',        (this.settings.maskOverhang || 4) + 'px');

		const isDark = document.body.classList.contains('theme-dark');
		root.setProperty('--zg-bg',         isDark ? this.settings.retroDarkBgColor   : this.settings.retroLightBgColor);
		root.setProperty('--zg-text',        isDark ? this.settings.retroDarkTextColor  : this.settings.retroLightTextColor);
		root.setProperty('--zg-arrow-color', isDark ? this.settings.arrowDarkColor      : this.settings.arrowLightColor);
		root.setProperty('--zg-line-color',  isDark ? this.settings.lineDarkColor       : this.settings.lineLightColor);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Injected styles
	// ─────────────────────────────────────────────────────────────────────────

	updateStyleEl() {
		if (!this.settings.pluginEnabled) { this.removeStyleEl(); return; }
		if (!this.styleEl) {
			this.styleEl = document.head.createEl('style');
			this.styleEl.id = 'zengrinder-injected';
		}
		const rules = [];
		if (this.settings.enableParagraphIndent) {
			const ind = 'var(--zg-para-indent)';
			if (this.settings.paragraphIndentMode === 'single') {
				rules.push('.zg-para-indent .cm-line + .cm-line:not(.cm-blankLine) { text-indent: ' + ind + ' !important; }');
				rules.push('.zg-para-indent .markdown-preview-view p { text-indent: ' + ind + ' !important; }');
			} else {
				rules.push('.zg-para-indent .zg-para-first { text-indent: ' + ind + ' !important; }');
				rules.push('.zg-para-indent .markdown-preview-view p + p { text-indent: ' + ind + ' !important; }');
			}
		}
		if (this.settings.justifyText) {
			// Justify in the source editor (skip code blocks and table cells).
			// The .cm-line selector is chained through .cm-content so it wins
			// over theme styles without !important in most cases.
			rules.push('.zg-justify .cm-content .cm-line { text-align: justify; text-align-last: left; }');
			// Reading view: paragraphs and list items.
			rules.push('.zg-justify .markdown-preview-view p, .zg-justify .markdown-preview-view li { text-align: justify; }');
		}
		if (this.settings.lineSpacing && this.settings.lineSpacing !== 1.5) {
			const ls = String(this.settings.lineSpacing);
			rules.push('.cm-content { line-height: ' + ls + ' !important; }');
			rules.push('.markdown-preview-view { line-height: ' + ls + ' !important; }');
		}
		if (this.settings.highlightCurrentLine) {
			const isDark = document.body.classList.contains('theme-dark');
			const hex     = isDark ? this.settings.lineHighlightDarkColor : this.settings.lineHighlightLightColor;
			const opacity = this.settings.lineHighlightOpacity != null ? this.settings.lineHighlightOpacity : 0.35;
			rules.push('.cm-active.cm-line { background-color: ' + this.hexToRgba(hex, opacity) + ' !important; }');
		}
		if (this.settings.dimUnfocusedEnabled) {
			const opacity = this.settings.dimOpacity != null ? this.settings.dimOpacity : 0.35;
			rules.push('.zg-dim-line, .zg-dim-text { opacity: ' + opacity + '; transition: opacity 0.15s ease; }');
		}
		this.styleEl.textContent = rules.join('\n');
		if (this.settings.enableParagraphIndent && this.settings.paragraphIndentMode !== 'single') {
			this.attachParaTagger();
		} else {
			this.detachParaTagger();
		}
	}

	removeStyleEl() {
		if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Paragraph tagger (double-enter indent)
	// ─────────────────────────────────────────────────────────────────────────

	attachParaTagger() {
		// Observe only the active editor's .cm-content — the old body-wide
		// observer with characterData re-scanned every .cm-line in every
		// editor on any mutation anywhere in the app. Re-bound on
		// active-leaf-change via updateWorkspaceAesthetics().
		const view    = this.app.workspace.getActiveViewOfType(MarkdownView);
		const content = view ? view.contentEl.querySelector('.cm-content') : null;
		if (this._paraTaggerObserver && this._paraTaggerTarget === content) return;
		this.detachParaTagger();
		if (!content) return;
		const schedule = () => {
			if (this._paraTagRaf) return;
			this._paraTagRaf = requestAnimationFrame(() => {
				this._paraTagRaf = null;
				this.tagParaFirstLines(content);
			});
		};
		this._paraTaggerObserver = new MutationObserver(schedule);
		this._paraTaggerTarget   = content;
		// class toggles don't re-trigger this observer (no attributes flag)
		this._paraTaggerObserver.observe(content, { childList: true, subtree: true, characterData: true });
		schedule();
	}

	detachParaTagger() {
		if (this._paraTaggerObserver) { this._paraTaggerObserver.disconnect(); this._paraTaggerObserver = null; }
		this._paraTaggerTarget = null;
		if (this._paraTagRaf) { cancelAnimationFrame(this._paraTagRaf); this._paraTagRaf = null; }
		document.querySelectorAll('.zg-para-first').forEach(el => el.classList.remove('zg-para-first'));
	}

	tagParaFirstLines(scope) {
		const contents = scope ? [scope] : Array.from(document.querySelectorAll('.cm-content'));
		for (let ci = 0; ci < contents.length; ci++) {
			const lines = contents[ci].querySelectorAll('.cm-line');
			let prevWasBlank = true;
			for (let i = 0; i < lines.length; i++) {
				const line    = lines[i];
				const isBlank = line.classList.contains('cm-blankLine') || line.textContent.trim() === '';
				if (!isBlank && prevWasBlank && i > 0) {
					line.classList.add('zg-para-first');
				} else {
					line.classList.remove('zg-para-first');
				}
				prevWasBlank = isBlank;
			}
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Zen mode toggle (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	async toggleZenMode() {
		if (this._isTogglingZen) return;
		this._isTogglingZen = true;
		try {
			// If the plugin is off, turn it on first — zen mode depends on the
			// body classes, masks, and observers that refresh()/applyBodyClasses()
			// set up, none of which run while pluginEnabled is false. Flipping
			// the flag here and letting saveSettings() → refresh() below handle
			// the wiring means the command works from either state.
			if (!this.settings.pluginEnabled) this.settings.pluginEnabled = true;
			const entering = !this.settings.zenMode;

			if (entering) {
				if (this.settings.focusedFileMode) await this.revealPinnedTabIfExists();
				if (this.settings.fullscreen && document.documentElement.requestFullscreen) {
					try {
						await document.documentElement.requestFullscreen();
						await new Promise(r => requestAnimationFrame(r));
					} catch (_) {}
				}
				this.settings.zenMode = true;
			} else {
				if (document.fullscreenElement && document.exitFullscreen) {
					try {
						await document.exitFullscreen();
						await new Promise(r => requestAnimationFrame(r));
					} catch (_) {}
				}
				this.settings.zenMode = false;
			}
			await this.saveSettings(true);
		} finally {
			this._isTogglingZen = false;
		}
	}

	async toggleFullPlugin() {
		const next = !this.settings.pluginEnabled;
		if (!next && this.settings.zenMode) {
			// Exit zen mode cleanly (fullscreen, sidebars, saved state) while
			// the plugin is still enabled — toggleZenMode() no-ops once
			// pluginEnabled is false.
			await this.toggleZenMode();
		}
		this.settings.pluginEnabled = next;
		await this.saveSettings(true); // refresh() tears everything down or re-applies it
	}

	updateWsRibbonState() {
		if (!this.wsRibbonEl) return;
		this.wsRibbonEl.classList.toggle('is-disabled', !this.settings.pluginEnabled);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Sidebar management (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	setSidebarVisibility() {
		if (this.settings.zenMode === this._wasZenMode) return;
		const ws = this.app.workspace;
		if (!ws.leftSplit || !ws.rightSplit) return;
		if (!this.settings.zenMode) {
			if (!this.settings.leftSidebar)  ws.leftSplit.expand();
			if (!this.settings.rightSidebar) ws.rightSplit.expand();
		} else {
			this.settings.rightSidebar = ws.rightSplit.collapsed;
			this.settings.leftSidebar  = ws.leftSplit.collapsed;
			if (!ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (!ws.rightSplit.collapsed) ws.rightSplit.collapse();
		}
		this._wasZenMode = this.settings.zenMode;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Focused file mode (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	getTabContainerFromLeaf(leaf) {
		if (!leaf) return null;
		const el = leaf.containerEl || null;
		if (!el) return null;
		const tc = el.closest('.workspace-tabs');
		return (tc instanceof HTMLElement) ? tc : null;
	}

	async revealPinnedTabIfExists() {
		try {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				let pinned = leaf.pinned === true;
				if (!pinned && leaf.view && leaf.view.getState) {
					const s = leaf.view.getState();
					if (s.pinned === true) pinned = true;
				}
				if (!pinned && leaf.containerEl) {
					const th = leaf.containerEl.querySelector('.workspace-tab-header');
					if (th && (th.classList.contains('is-pinned') || th.hasAttribute('data-pinned'))) pinned = true;
				}
				if (pinned) {
					await this.app.workspace.revealLeaf(leaf);
					await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
					return;
				}
			}
		} catch (_) {}
	}

	findActiveTabContainerFromDOM() {
		const active = document.querySelector('.workspace-tab-header.is-active');
		if (active) {
			const tc = active.closest('.workspace-tabs');
			if (tc instanceof HTMLElement) return tc;
		}
		for (const c of Array.from(document.querySelectorAll('.workspace-tabs'))) {
			const el = c;
			if (el.offsetParent !== null && !el.classList.contains('zenmode-tab-hidden')) return el;
		}
		return null;
	}

	async updateFocusedFileMode() {
		if (!this.settings.zenMode || !this.settings.focusedFileMode) {
			document.querySelectorAll('.workspace-tabs').forEach(el => {
				el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
				el.style.display = ''; el.style.width = ''; el.style.flex = '';
			});
			return;
		}
		await this.revealPinnedTabIfExists();
		if (!this._tabContainersCache) {
			this._tabContainersCache = Array.from(document.querySelectorAll('.workspace-tabs'));
		}
		const all = this._tabContainersCache;
		let active = null;
		for (const c of all) {
			const pinned = c.querySelectorAll('.workspace-tab-header.is-pinned, .workspace-tab-header[data-pinned="true"]');
			if (pinned.length > 0) { active = c; break; }
		}
		if (!active) {
			const leaf = this.app.workspace.getMostRecentLeaf();
			if (leaf) active = this.getTabContainerFromLeaf(leaf);
		}
		if (!active) active = this.findActiveTabContainerFromDOM();
		if (!active) return;
		all.forEach(c => {
			if (c === active) {
				c.classList.remove('zenmode-tab-hidden');
				c.style.display = ''; c.style.width = '100%'; c.style.flex = '1 1 100%';
			} else {
				c.classList.add('zenmode-tab-hidden');
				c.style.display = 'none';
			}
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Workspace aesthetics (letterbox + retro bar)
	// ─────────────────────────────────────────────────────────────────────────

	updateWorkspaceAesthetics() {
		// Event handlers (active-leaf-change etc.) call this unconditionally;
		// without this guard, opening a note rebuilds the retro bar and masks
		// even while the plugin is toggled off.
		if (!this.settings.pluginEnabled) return;
		// Retro status bar: independent of zen mode
		this.updateStatusBar();
		this.updateRetroStatusBar();

		// The paragraph tagger is scoped to the active editor's .cm-content,
		// so it needs re-binding whenever the active leaf changes.
		if (this.settings.enableParagraphIndent && this.settings.paragraphIndentMode !== 'single') {
			this.attachParaTagger();
		}
		// (Focus dimming and hidden markers are CM6 decorations registered
		// once via registerEditorExtension — they follow every editor
		// automatically and need no per-leaf re-binding here.)

		// Letterbox masks + typewriter: driven by enableTypewriter, not zenMode
		if (this.settings.enableTypewriter) {
			this.buildMaskElements();
		} else {
			this.removeMaskElements();
		}

		// Positioning (masks AND/OR retro bar width) needs the scroll/resize
		// wiring whenever either feature is visible.
		if (this.settings.enableTypewriter || this.settings.enableRetroStatus) {
			this.attachScrollHandler();
			this.attachResizeHandler();
			this.scheduleMaskPosition();
		} else {
			this.detachScrollHandler();
			this.detachResizeHandler();
		}
	}

	// Remove only mask/arrow elements (not the retro bar)
	removeMaskElements() {
		for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl]) {
			if (el) el.remove();
		}
		this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
		document.documentElement.style.setProperty('--zg-scroller-pad-top',    '0px');
		document.documentElement.style.setProperty('--zg-scroller-pad-bottom', '0px');
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Retro status bar
	// ─────────────────────────────────────────────────────────────────────────

	updateStatusBar() {
		if (this.settings.enableRetroStatus && !this.retroStatusBarEl) {
			this.retroStatusBarEl = document.body.createEl('div', { cls: 'zengrinder-status-bar' });
			this.startClockTick();
		} else if (!this.settings.enableRetroStatus && this.retroStatusBarEl) {
			this.retroStatusBarEl.remove();
			this.retroStatusBarEl = null;
			this.stopClockTick();
		}
		if (this.retroStatusBarEl) {
			this.retroStatusBarEl.classList.toggle('zengrinder-status-border', this.settings.statusBarBorder);
		}
		// Body class lets CSS lift bottom editor panels (vim ":" command
		// line etc.) above the bar — see styles.css.
		document.body.classList.toggle('zg-retrobar-active', !!this.retroStatusBarEl);
		// Re-stamp on every call (runs on leaf changes) so a status bar
		// element created after plugin load is still caught.
		this.applyNativeStatusBarVisibility(
			this.settings.enableRetroStatus || (this.settings.zenMode && this.settings.hideStatusBar));
		this.applyCssVariables();
	}

	startClockTick() {
		if (this.clockInterval) return;
		// registerInterval → Obsidian clears it automatically on unload
		this.clockInterval = this.registerInterval(window.setInterval(() => this.updateRetroStatusBar(), 15000));
	}

	stopClockTick() {
		if (this.clockInterval) { window.clearInterval(this.clockInterval); this.clockInterval = null; }
	}

	async setupBattery() {
		if (!navigator.getBattery) return;
		try {
			const bm = await navigator.getBattery();
			const update = () => {
				this.batteryLevel    = Math.round(bm.level * 100);
				this.batteryCharging = bm.charging;
				this.updateRetroStatusBar();
			};
			this._batteryManager = bm;
			this._batteryHandler = update;
			bm.addEventListener('levelchange', update);
			bm.addEventListener('chargingchange', update);
			update();
		} catch (_) {}
	}

	formatBattery() {
		if (this.batteryLevel === null) return '?%';
		return (this.batteryCharging ? '⚡︎' : '') + this.batteryLevel + '%';
	}

	// Converts a #rrggbb / #rgb hex color plus an alpha (0–1) into an
	// rgba() string, so a single color-picker + slider pair can produce a
	// translucent highlight without needing CSS color-mix() support.
	hexToRgba(hex, alpha) {
		if (!hex) return 'transparent';
		let h = hex.replace('#', '');
		if (h.length === 3) h = h.split('').map(c => c + c).join('');
		const r = parseInt(h.substring(0, 2), 16) || 0;
		const g = parseInt(h.substring(2, 4), 16) || 0;
		const b = parseInt(h.substring(4, 6), 16) || 0;
		const a = Math.max(0, Math.min(1, alpha != null ? alpha : 1));
		return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
	}

	formatDate(now) {
		const dd = String(now.getDate()).padStart(2, '0');
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const yyyy = String(now.getFullYear());
		const yy   = yyyy.slice(-2);
		return (this.settings.dateFormat || 'dd/mm/yyyy')
			.replace(/yyyy/g, yyyy).replace(/yy/g, yy).replace(/mm/g, mm).replace(/dd/g, dd);
	}

	formatTime(now) {
		return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
	}

	getFilePath(view) {
		const file = view && view.file;
		if (!file) return 'no file';
		if (this.settings.fileTokenFormat === 'name') return file.basename;
		const parts = file.path.split('/');
		return (parts.length <= 1 ? '~/' : '~/' + parts.slice(0, -1).join('/') + '/') + file.basename;
	}

	// Strip a leading YAML frontmatter block. Frontmatter inflates word
	// counts on heavily-tagged notes and makes goals inconsistent with
	// Obsidian's own counter.
	stripFrontmatter(text) {
		if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
			const m = text.match(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/);
			if (m) return text.slice(m[0].length);
		}
		return text;
	}

	countWords(text) {
		const t = this.stripFrontmatter(text).trim();
		return t === '' ? 0 : t.split(/\s+/).length;
	}

	// Doc-derived stats (total word count, char count, paragraph ranges),
	// cached on the CodeMirror doc object — reference equality means the
	// cache only invalidates after actual edits, so the selection/cursor
	// paths never re-split a 50k-word note just to redraw the bar.
	getDocStats(view) {
		const editor = view.editor;
		const doc = editor && editor.cm && editor.cm.state ? editor.cm.state.doc : null;
		if (doc && this._docStatsCache && this._docStatsCache.doc === doc) {
			return this._docStatsCache;
		}
		const full      = view.getViewData();
		const totalWC   = this.countWords(full);
		const charCount = full.length;
		// Paragraph ranges: contiguous runs of non-blank, non-heading lines.
		const lines = full.split('\n');
		const paras = [];
		let inPara = false;
		for (let i = 0; i < lines.length; i++) {
			const raw     = lines[i];
			const blank   = raw.trim() === '';
			const heading = /^\s{0,3}#{1,6}\s/.test(raw);
			if (!blank && !heading) {
				if (!inPara) { paras.push({ start: i, end: i }); inPara = true; }
				else paras[paras.length - 1].end = i;
			} else {
				inPara = false;
			}
		}
		const stats = { doc, totalWC, charCount, paras };
		if (doc) this._docStatsCache = stats; // only cache when identity is trackable
		return stats;
	}

	getParagraphInfo(view, stats) {
		if (!view || !view.editor) return '1/1';
		const paras = (stats || this.getDocStats(view)).paras;
		const total = paras.length;
		if (total === 0) return '1/1';
		const cursorLine = view.editor.getCursor('head').line;
		// The paragraph containing the cursor; on a blank line, the next one.
		let current = 0;
		for (let p = 0; p < total; p++) {
			if (cursorLine <= paras[p].end) { current = p + 1; break; }
		}
		if (!current) current = total;
		return current + '/' + total;
	}

	formatGoal(total) {
		const count  = Math.max(0, total - (this.settings.goalBaseline || 0));
		const target = this.settings.goalTarget || 1000;
		const ratio  = Math.min(count / target, 1);
		return { text: count.toLocaleString() + '/' + target.toLocaleString(), ratio, met: count >= target };
	}

	// Reads CapsLock/NumLock state off a keyboard event and refreshes the
	// retro bar when either changes. Not every keyboard event supports
	// getModifierState (and NumLock has no meaning on keyboards/OSes without
	// a physical numpad concept, e.g. most Mac laptops), so this fails quiet.
	updateModifierState(evt) {
		if (!evt || typeof evt.getModifierState !== 'function') return;
		let changed = false;
		try {
			const caps = evt.getModifierState('CapsLock');
			if (caps !== this._capsLockOn) { this._capsLockOn = caps; changed = true; }
		} catch (_) { /* getModifierState with an unsupported key name can throw */ }
		try {
			const num = evt.getModifierState('NumLock');
			if (num !== this._numLockOn) { this._numLockOn = num; changed = true; }
		} catch (_) {}
		if (changed) this.updateRetroStatusBar();
	}

	// Best-effort Vim mode label for {vim}. Obsidian's Vim mode is backed by
	// @replit/codemirror-vim, which exposes its state on a CM5-compatible
	// facade at editor.cm.cm — not officially documented, but it's the same
	// access pattern community Vim-status plugins rely on. Falls back to ''
	// (token renders empty) any time the shape isn't what's expected, e.g.
	// Vim mode is off, or a future Obsidian version changes internals.
	getVimModeLabel() {
		try {
			const vault = this.app.vault;
			if (!vault.config || vault.config.vimMode !== true) return '';

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const cm6  = view && view.editor && view.editor.cm;
			const cm5  = cm6 && cm6.cm;
			const vim  = cm5 && cm5.state && cm5.state.vim;
			if (!vim) return '';

			// Replace mode (R) is represented as insert mode with the CM5
			// facade's overwrite flag set — vim.replaceMode alone is not
			// reliable across versions, which is why REPLACE never showed.
			if (vim.insertMode) {
				return (cm5.state.overwrite || vim.replaceMode) ? '-- REPLACE --' : '-- INSERT --';
			}
			if (vim.replaceMode) return '-- REPLACE --';
			if (vim.visualMode) {
				if (vim.visualBlock) return '-- VISUAL BLOCK --';
				if (vim.visualLine)  return '-- VISUAL LINE --';
				return '-- VISUAL --';
			}
			switch (vim.mode) {
				case 'insert':  return '-- INSERT --';
				case 'replace': return '-- REPLACE --';
				case 'visual':  return '-- VISUAL --';
			}
			// The ex command-line (":") prompt doesn't flip `mode` in every
			// version of the vim layer, so also check for its dialog in the DOM.
			if (document.querySelector('.cm-vim-panel, .CodeMirror-dialog')) return '-- COMMAND --';
			return '-- NORMAL --';
		} catch (_) {
			return '';
		}
	}

	updateRetroStatusBar() {
		if (!this.retroStatusBarEl) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const now  = new Date();
		let stats = null, totalWC = 0, charCount = 0, displayWC = 0, displayCC = 0;

		if (view) {
			stats     = this.getDocStats(view);
			totalWC   = stats.totalWC;
			charCount = stats.charCount;
			const editor = view.editor;
			const sel = editor ? editor.getSelection() : '';
			if (sel && sel.trim().length > 0) {
				displayWC = sel.trim().split(/\s+/).length;
				displayCC = sel.length;
			} else {
				displayWC = totalWC;
				displayCC = charCount;
			}
		}

		const goal = this.formatGoal(totalWC);
		const subs = {
			'{file}':      this.getFilePath(view),
			'{words}':     displayWC,
			'{chars}':     displayCC,
			'{time}':      this.formatTime(now),
			'{date}':      this.formatDate(now),
			'{battery}':   this.formatBattery(),
			'{paragraph}': this.getParagraphInfo(view, stats),
			'{caps}':      this._capsLockOn ? 'CAPS' : '',
			'{nump}':      this._numLockOn ? 'NUMP' : '',
			'{vim}':       this.getVimModeLabel(),
			'{goal}':      '\x00GOAL\x00'
		};

		const left   = this.settings.statusFormatLeft   || '';
		const center = this.settings.statusFormatCenter || '';
		const right  = this.settings.statusFormatRight  || '';
		const hasGoal = left.includes('{goal}') || center.includes('{goal}') || right.includes('{goal}');

		// Click-to-reset
		if (hasGoal) {
			this.retroStatusBarEl.style.cursor = 'pointer';
			this.retroStatusBarEl.title        = 'Click to reset word goal baseline';
			if (!this.retroStatusBarEl._zgResetHandler) {
				this.retroStatusBarEl._zgResetHandler = async () => {
					this.settings.goalBaseline = this._zgLastTotalWordCount || 0;
					await this.saveSettings();
					this.updateRetroStatusBar();
				};
				this.retroStatusBarEl.addEventListener('mousedown', this.retroStatusBarEl._zgResetHandler);
			}
		} else {
			this.retroStatusBarEl.style.cursor = '';
			this.retroStatusBarEl.title        = '';
			if (this.retroStatusBarEl._zgResetHandler) {
				this.retroStatusBarEl.removeEventListener('mousedown', this.retroStatusBarEl._zgResetHandler);
				this.retroStatusBarEl._zgResetHandler = null;
			}
		}
		this._zgLastTotalWordCount = totalWC;

		this.retroStatusBarEl.empty();
		const leftEl   = this.retroStatusBarEl.createSpan({ cls: 'zg-status-section zg-status-left' });
		const centerEl = this.retroStatusBarEl.createSpan({ cls: 'zg-status-section zg-status-center' });
		const rightEl  = this.retroStatusBarEl.createSpan({ cls: 'zg-status-section zg-status-right' });
		leftEl.appendChild(this.renderStatusSection(left, subs, goal));
		centerEl.appendChild(this.renderStatusSection(center, subs, goal));
		rightEl.appendChild(this.renderStatusSection(right, subs, goal));

		// Flash the bar when goal is met (if enabled)
		this.retroStatusBarEl.classList.toggle('zg-goal-met', goal.met && this.settings.goalFlashEnabled);

		// Shrink font size if the content overflows the bar's current width
		// (e.g. when a sidebar is open and the note pane narrows).
		this.fitStatusBarText();
	}

	// Turns one of the three format strings (left/center/right) into a DOM
	// fragment, substituting tokens and swapping in the live goal-bar element
	// where {goal} appeared (rather than plain text, when the bar display
	// style is chosen).
	renderStatusSection(formatStr, subs, goal) {
		const frag = document.createDocumentFragment();
		if (!formatStr) return frag;

		let out = formatStr;
		for (const token in subs) out = out.split(token).join(String(subs[token]));

		if (out.includes('\x00GOAL\x00')) {
			const parts = out.split('\x00GOAL\x00');
			if (parts[0]) frag.appendChild(document.createTextNode(parts[0]));
			if (this.settings.goalDisplay === 'bar') {
				frag.appendChild(this.buildGoalBar(goal.ratio));
			} else {
				const span = document.createElement('span');
				span.className = 'zg-goal-text';
				span.textContent = goal.text;
				frag.appendChild(span);
			}
			if (parts[1]) frag.appendChild(document.createTextNode(parts[1]));
		} else if (out) {
			frag.appendChild(document.createTextNode(out));
		}
		return frag;
	}

	// Reduce the retro bar's font size until the text fits its current width,
	// never going above the user's configured size. Resets to the configured
	// size first so it grows back when the bar has room again (sidebar closed).
	fitStatusBarText() {
		const el = this.retroStatusBarEl;
		if (!el) return;
		const baseSize = this.settings.statusBarFontSize || 13;
		// Resetting font-size forces a reflow; skip the whole measure when
		// nothing that affects fit has changed since the last call.
		const text  = el.textContent;
		const width = el.clientWidth;
		if (this._lastFit && this._lastFit.text === text &&
			this._lastFit.width === width && this._lastFit.base === baseSize) return;
		this._lastFit = { text, width, base: baseSize };

		el.style.fontSize = baseSize + 'px';
		if (el.scrollWidth <= el.clientWidth) return;

		const minSize = Math.max(7, Math.floor(baseSize * 0.5));
		let size = baseSize;
		while (el.scrollWidth > el.clientWidth && size > minSize) {
			size -= 1;
			el.style.fontSize = size + 'px';
		}
	}

	buildGoalBar(ratio) {
		const CELLS  = Math.max(1, Math.min(20, this.settings.goalBarCells || 5));
		const filled = Math.round(ratio * CELLS);
		const wrap   = document.createElement('span');
		wrap.className = 'zg-goal-bar';
		for (let i = 0; i < CELLS; i++) {
			const seg = document.createElement('span');
			seg.className = 'zg-goal-seg' + (i < filled ? ' zg-goal-seg-filled' : '');
			seg.style.setProperty('--i', String(i));
			seg.style.setProperty('--n', String(CELLS));
			seg.textContent = i < filled ? '\u2588' : '\u2591';
			wrap.appendChild(seg);
		}
		return wrap;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Letterbox mask system
	// ─────────────────────────────────────────────────────────────────────────

	buildMaskElements() {
		for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl]) {
			if (el) el.remove();
		}
		this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }

		if (!this.settings.enableLetterbox) return;
		if (!this.app.workspace.getActiveViewOfType(MarkdownView)) return;

		this.maskTopEl    = document.body.createEl('div', { cls: 'zengrinder-mask zengrinder-mask-top' });
		this.maskBottomEl = document.body.createEl('div', { cls: 'zengrinder-mask zengrinder-mask-bottom' });

		const chars = this.getArrowChars();
		this.arrowsTopEl    = this.buildArrowLayer('top',    chars.top);
		this.arrowsBottomEl = this.buildArrowLayer('bottom', chars.bottom);

		const scroller = this.getActiveScroller();
		if (scroller && 'ResizeObserver' in window) {
			this.maskResizeObserver = new ResizeObserver(() => this.scheduleMaskPosition());
			this.maskResizeObserver.observe(scroller);
		}
		this.updateMaskVisibility();
	}

	stampMaskPositions() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) { this._maskRaf = null; return; }

		const scroller = view.contentEl.querySelector('.cm-scroller')
			|| view.contentEl.querySelector('.markdown-preview-view')
			|| view.contentEl;
		const sr = scroller.getBoundingClientRect();

		let statusH = 0;
		if (this.settings.enableRetroStatus && this.retroStatusBarEl) {
			statusH = this.retroStatusBarEl.getBoundingClientRect().height || this.settings.statusBarHeight || 30;
		} else {
			const nb = document.querySelector('.status-bar');
			if (nb && getComputedStyle(nb).display !== 'none') statusH = nb.getBoundingClientRect().height || 0;
		}

		// Use the scroller's actual top — it already sits below whatever chrome is visible.
		// Do NOT clamp to an arbitrary drag-bar height; that was pushing the mask down.
		const sTop    = Math.max(0, sr.top);
		const sLeft   = Math.max(0, sr.left);
		const sWidth  = sr.width;
		// visualViewport.height is the honest bottom edge on mobile when the
		// on-screen keyboard is open; innerHeight ignores it.
		const vpH     = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
		const sBottom = vpH - statusH;
		const sHeight = Math.max(0, sBottom - sTop);

		let maskH = this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26;
		maskH = Math.min(maskH, Math.floor(sHeight * 0.45));
		maskH = Math.max(maskH, 34);

		const padH      = this.settings.maskPaddingH || 0;
		const arrowLeft = sLeft + padH;
		const arrowW    = Math.max(0, sWidth - padH * 2);
		const arrowH    = maskH;
		const overhang  = this.settings.maskOverhang != null ? this.settings.maskOverhang : 4;

		const S = (el, styles) => { if (el) Object.assign(el.style, styles); };
		S(this.maskTopEl,    { left: sLeft+'px', width: sWidth+'px', top: sTop+'px', height: (arrowH+overhang)+'px', bottom:'' });
		S(this.arrowsTopEl,  { left: arrowLeft+'px', width: arrowW+'px', top: sTop+'px', height: arrowH+'px', bottom:'' });
		S(this.maskBottomEl, { left: sLeft+'px', width: sWidth+'px', top: (sBottom-arrowH-overhang)+'px', height: (arrowH+overhang)+'px', bottom:'' });
		S(this.arrowsBottomEl, { left: arrowLeft+'px', width: arrowW+'px', top: (sBottom-arrowH)+'px', height: arrowH+'px', bottom:'' });

		// Retro status bar: match the note pane's width, not the full window —
		// keeps it clear of open sidebars instead of spanning edge to edge.
		S(this.retroStatusBarEl, { left: sLeft+'px', width: sWidth+'px' });
		this.fitStatusBarText();

		// Outside zen mode there's no big 50vh scroller padding to push the
		// first/last lines clear of the masks, so a brand-new or short note
		// starts hidden behind the top mask. Give the scroller just enough
		// top/bottom breathing room to clear the mask height, independent of
		// zen mode — zen mode's own 50vh padding (see styles.css) already
		// covers this and is left untouched.
		const scrollPad = this.settings.enableLetterbox ? Math.round(arrowH + overhang + 24) : 0;
		document.documentElement.style.setProperty('--zg-scroller-pad-top',    scrollPad + 'px');
		document.documentElement.style.setProperty('--zg-scroller-pad-bottom', scrollPad + 'px');

		this._maskRaf = null;
	}

	scheduleMaskPosition() {
		if (this._maskRaf) return;
		this._maskRaf = requestAnimationFrame(() => this.stampMaskPositions());
	}

	buildArrowLayer(position, char) {
		const wrap   = document.body.createEl('div', { cls: 'zengrinder-arrows-wrap zengrinder-arrows-wrap-' + position + ' is-visible' });
		const line   = wrap.createEl('div', { cls: 'zengrinder-arrow-line' });
		const arrows = wrap.createEl('div', { cls: 'zengrinder-arrows' });
		for (let i = 0; i < this.settings.arrowCount; i++) arrows.createEl('span', { text: char });
		if (position === 'top') wrap.insertBefore(arrows, line);

		// Pointer events (with capture) instead of mouse events: identical on
		// desktop, and tablet/mobile dragging works for free.
		line.style.cursor        = 'ns-resize';
		line.style.pointerEvents = 'auto';
		line.addEventListener('pointerdown', e => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault(); e.stopPropagation();
			this._startVerticalDrag(e, position, line);
		});

		arrows.style.cursor        = 'ew-resize';
		arrows.style.pointerEvents = 'auto';
		arrows.addEventListener('pointerdown', e => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault(); e.stopPropagation();
			this._startHorizontalDrag(e, arrows);
		});
		return wrap;
	}

	// Shared pointer-drag plumbing. setPointerCapture routes all move/up
	// events to the grabbed element, so no document-level listeners are
	// needed — and _activeDragCleanup lets onunload abort a drag that's
	// still in flight instead of leaking its listeners.
	_startPointerDrag(e, el, cursor, onMove) {
		if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
		document.body.style.cursor = cursor; document.body.style.userSelect = 'none';
		const finish = (save) => {
			el.removeEventListener('pointermove',   onMove);
			el.removeEventListener('pointerup',     onUp);
			el.removeEventListener('pointercancel', onCancel);
			if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
				try { el.releasePointerCapture(e.pointerId); } catch (_) {}
			}
			document.body.style.cursor = ''; document.body.style.userSelect = '';
			this._activeDragCleanup = null;
			if (save) this.saveSettings();
		};
		const onUp     = () => finish(true);
		const onCancel = () => finish(false);
		el.addEventListener('pointermove',   onMove);
		el.addEventListener('pointerup',     onUp);
		el.addEventListener('pointercancel', onCancel);
		this._activeDragCleanup = () => finish(false);
	}

	_startVerticalDrag(e, position, el) {
		const startY = e.clientY;
		const startH = (this.maskTopEl ? parseFloat(this.maskTopEl.style.height) : null)
			|| (this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26);
		this._startPointerDrag(e, el, 'ns-resize', me => {
			const dy = me.clientY - startY;
			this.settings.letterboxPx = Math.max(0, startH + dy * (position === 'top' ? 1 : -1));
			this.scheduleMaskPosition();
		});
	}

	_startHorizontalDrag(e, el) {
		const startX   = e.clientX;
		const startPad = this.settings.maskPaddingH || 0;
		const cx       = window.innerWidth / 2;
		this._startPointerDrag(e, el, 'ew-resize', me => {
			const dx = me.clientX - startX;
			this.settings.maskPaddingH = Math.max(0, Math.min(Math.round(cx) - 20, Math.round(startPad + dx * (startX < cx ? 1 : -1))));
			this.scheduleMaskPosition();
		});
	}

	getArrowChars() {
		if (this.settings.arrowStyle === 'custom') {
			return { top: this.settings.customArrowTop || '^', bottom: this.settings.customArrowBottom || 'v' };
		}
		return ARROW_STYLES[this.settings.arrowStyle] || ARROW_STYLES['solid-triangle'];
	}

	removeCustomElements() {
		// Tear down retro bar
		if (this.retroStatusBarEl) { this.retroStatusBarEl.remove(); this.retroStatusBarEl = null; }
		document.body.classList.remove('zg-retrobar-active');
		this.stopClockTick();
		// Tear down masks
		this.removeMaskElements();
	}

	getActiveScroller() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return null;
		return view.contentEl.querySelector('.cm-scroller') || view.contentEl.querySelector('.markdown-preview-view') || null;
	}

	attachScrollHandler() {
		this.detachScrollHandler();
		const scroller = this.getActiveScroller();
		if (!scroller) return;
		this.currentScroller = scroller;
		this.scrollHandler   = () => this.updateMaskVisibility();
		scroller.addEventListener('scroll', this.scrollHandler, { passive: true });
		requestAnimationFrame(() => this.updateMaskVisibility());
	}

	detachScrollHandler() {
		if (this.currentScroller && this.scrollHandler) {
			this.currentScroller.removeEventListener('scroll', this.scrollHandler);
		}
		this.currentScroller = this.scrollHandler = null;
	}

	updateMaskVisibility() {
		const s = this.currentScroller || this.getActiveScroller();
		if (!s) return;
		const { scrollTop, scrollHeight, clientHeight } = s;
		if (this.arrowsTopEl)    this.arrowsTopEl.classList.toggle('is-visible',    scrollTop > 2);
		if (this.arrowsBottomEl) this.arrowsBottomEl.classList.toggle('is-visible', scrollTop + clientHeight < scrollHeight - 2);
	}

	attachResizeHandler() {
		if (this.windowResizeHandler) return;
		this.windowResizeHandler = () => this.scheduleMaskPosition();
		window.addEventListener('resize', this.windowResizeHandler);
	}

	detachResizeHandler() {
		if (!this.windowResizeHandler) return;
		window.removeEventListener('resize', this.windowResizeHandler);
		this.windowResizeHandler = null;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Typewriter scroll
	// ─────────────────────────────────────────────────────────────────────────

	typewriterScroll() {
		if (!this.settings.pluginEnabled || !this.settings.enableTypewriter) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const scroller = view.contentEl.querySelector('.cm-scroller');
		if (!scroller) return;
		let lineTop, lineHeight;
		const activeLine = view.contentEl.querySelector('.cm-active-line');
		if (activeLine) {
			const sr = scroller.getBoundingClientRect();
			const lr = activeLine.getBoundingClientRect();
			lineTop = lr.top - sr.top + scroller.scrollTop;
			lineHeight = lr.height;
		} else {
			const cm = view.editor && view.editor.cm;
			if (!cm) return;
			try {
				const coords = cm.coordsAtPos(cm.state.selection.main.head);
				if (!coords) return;
				const sr = scroller.getBoundingClientRect();
				lineTop = coords.top - sr.top + scroller.scrollTop;
				lineHeight = coords.bottom - coords.top;
			} catch (_) { return; }
		}
		// Cursor's vertical anchor within the scroller, expressed as a ratio
		// derived from "keep N lines above / M lines below" — defaults of 8/8
		// reproduce the previous fixed dead-center (0.5) behaviour.
		const linesAbove = Math.max(0, this.settings.typewriterLinesAbove != null ? this.settings.typewriterLinesAbove : 8);
		const linesBelow = Math.max(0, this.settings.typewriterLinesBelow != null ? this.settings.typewriterLinesBelow : 8);
		const totalLines = linesAbove + linesBelow;
		const ratioAbove  = totalLines > 0 ? linesAbove / totalLines : 0.5;
		const target = lineTop + lineHeight / 2 - scroller.clientHeight * ratioAbove;
		if (Math.abs(scroller.scrollTop - target) < 1) return;
		scroller.scrollTop = target;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// CM6 editor extensions: focus dimming + hidden markers
	// ─────────────────────────────────────────────────────────────────────────
	// Both features are implemented as CodeMirror decorations so they render
	// inside the editor's own pipeline — recomputed atomically with every
	// transaction, never racing CM6's DOM reconciliation the way the earlier
	// MutationObserver approach did (which is what caused the flicker).
	// The extensions read this.settings at build time, so they self-disable
	// when toggled off; refresh() calls workspace.updateOptions() to force a
	// rebuild whenever settings change.
	//
	// "Sentence" dim mode is approximated as the current line: decorations
	// could technically split a line into per-sentence marks, but Obsidian's
	// live-preview widgets (checkboxes, embeds, rendered links) sit inside
	// lines at unpredictable offsets, so line granularity is what's reliable.

	setupEditorExtensions() {
		if (!CM) return; // @codemirror modules unavailable — features off
		// A mutable array is registered ONCE; reconfigureEditors() then swaps
		// its contents and calls workspace.updateOptions(), which is the
		// standard Obsidian pattern for dynamic editor extensions.
		this.editorExtensions = [];
		this.editorExtensions.push(...this.buildEditorExtensions());
		this.registerEditorExtension(this.editorExtensions);
	}

	// Factory that creates FRESH ViewPlugin values each call. This matters:
	// workspace.updateOptions() with unchanged extension values is a no-op —
	// CM6 keeps the existing plugin instances and never re-runs their
	// constructors — so settings toggles silently did nothing until some
	// unrelated edit/scroll happened to trigger an update(). Recreating the
	// plugins forces real reconfiguration and an immediate rebuild.
	buildEditorExtensions() {
		if (!CM || !this.settings.pluginEnabled) return [];
		const plugin = this;
		const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = CM;

		class InvisibleWidget extends WidgetType {
			constructor(text) { super(); this.text = text; }
			eq(other) { return other.text === this.text; }
			toDOM() {
				const s = document.createElement('span');
				s.className = 'zg-invisible';
				s.textContent = this.text;
				return s;
			}
			ignoreEvent() { return true; }
		}
		const PILCROW  = Decoration.widget({ widget: new InvisibleWidget('¶'), side: 1 });
		const NEWLINE  = Decoration.widget({ widget: new InvisibleWidget('↵'), side: 1 });
		const dimDeco   = Decoration.line({ class: 'zg-dim-line' });
		const dimText   = Decoration.mark({ class: 'zg-dim-text' });
		const spaceDeco = Decoration.mark({ class: 'zg-ws-space' });
		const tabDeco   = Decoration.mark({ class: 'zg-ws-tab' });

		// ── Focus dimming ─────────────────────────────────────────────────────
		const dimPlugin = ViewPlugin.fromClass(class {
			constructor(view) { this.decorations = this.build(view); }
			update(u) {
				if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
					this.decorations = this.build(u.view);
				}
			}
			build(view) {
				const s = plugin.settings;
				if (!s.pluginEnabled || !s.enableTypewriter || !s.dimUnfocusedEnabled) return Decoration.none;
				const doc  = view.state.doc;
				const head = view.state.selection.main.head;
				const cur  = doc.lineAt(head);
				// Paragraph bounds (blank-line delimited) around the cursor.
				let pStart = cur.number, pEnd = cur.number;
				while (pStart > 1 && doc.line(pStart - 1).text.trim() !== '') pStart--;
				while (pEnd < doc.lines && doc.line(pEnd + 1).text.trim() !== '') pEnd++;
				// Focus range in absolute doc positions. Paragraph mode keeps
				// the whole paragraph; sentence mode narrows it to the sentence
				// under the cursor by scanning the paragraph text for sentence
				// terminators (., !, ?, …, optionally followed by closing
				// quotes/brackets, then whitespace or paragraph end).
				let focusFrom = doc.line(pStart).from;
				let focusTo   = doc.line(pEnd).to;
				if (s.dimFocusMode === 'sentence') {
					const paraText = doc.sliceString(focusFrom, focusTo);
					const rel = Math.min(Math.max(head - focusFrom, 0), paraText.length);
					const re = /[.!?\u2026]+["'\u201d\u2019)\]]*(\s+|$)/g;
					let sFrom = 0, sTo = paraText.length, m;
					while ((m = re.exec(paraText))) {
						const termEnd  = m.index + m[0].replace(/\s+$/, '').length; // end of terminator
						const boundEnd = m.index + m[0].length;                     // after trailing whitespace
						if (boundEnd <= rel) { sFrom = boundEnd; }
						else { sTo = termEnd; break; }
					}
					focusTo   = focusFrom + sTo;   // compute before mutating focusFrom
					focusFrom = focusFrom + sFrom;
				}
				const b = new RangeSetBuilder();
				for (const range of view.visibleRanges) {
					let pos = range.from;
					while (pos <= range.to) {
						const line = doc.lineAt(pos);
						if (line.to < focusFrom || line.from > focusTo) {
							// Entirely outside the focus area → dim the whole line.
							b.add(line.from, line.from, dimDeco);
						} else {
							// Line overlaps the focus area (sentence mode) → dim
							// only the stretches of it outside the sentence.
							if (line.from < focusFrom) b.add(line.from, Math.min(focusFrom, line.to), dimText);
							if (focusTo < line.to)     b.add(Math.max(focusTo, line.from), line.to, dimText);
						}
						pos = line.to + 1;
					}
				}
				return b.finish();
			}
		}, { decorations: v => v.decorations });

		// ── Hidden markers ────────────────────────────────────────────────────
		const markerPlugin = ViewPlugin.fromClass(class {
			constructor(view) { this.decorations = this.build(view); }
			update(u) {
				if (u.docChanged || u.viewportChanged) {
					this.decorations = this.build(u.view);
				}
			}
			build(view) {
				const s = plugin.settings;
				if (!s.pluginEnabled || !s.showHiddenMarkers) return Decoration.none;
				const showSp  = s.markSpaces, showTab = s.markTabs;
				const showPar = s.markParagraphs, showEol = s.markEndOfLines;
				if (!showSp && !showTab && !showPar && !showEol) return Decoration.none;
				const doc  = view.state.doc;
				const b    = new RangeSetBuilder();
				const wsRe = /[ \t]/g;
				for (const range of view.visibleRanges) {
					let pos = range.from;
					while (pos <= range.to) {
						const line = doc.lineAt(pos);
						if (showSp || showTab) {
							wsRe.lastIndex = 0;
							let m;
							while ((m = wsRe.exec(line.text))) {
								const isTab = m[0] === '\t';
								if (isTab ? showTab : showSp) {
									b.add(line.from + m.index, line.from + m.index + 1, isTab ? tabDeco : spaceDeco);
								}
							}
						}
						// A blank line shows ¶ (paragraph break); every other line
						// end shows ↵ — except the last line, which has no newline.
						const blank = line.text.trim() === '';
						if (blank && showPar) {
							b.add(line.to, line.to, PILCROW);
						} else if (showEol && line.number < doc.lines) {
							b.add(line.to, line.to, NEWLINE);
						}
						pos = line.to + 1;
					}
				}
				return b.finish();
			}
		}, { decorations: v => v.decorations });

		return [dimPlugin, markerPlugin];
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Word count: file tree + outline
	// ─────────────────────────────────────────────────────────────────────────

	attachExplorerObserver() {
		// Observe only the file-explorer and outline leaf containers — the
		// old body-wide observer scheduled a full explorer re-scan on any DOM
		// change anywhere (typing repaints, tooltips, …). Re-bound from the
		// layout-change handler since these leaves can be recreated.
		this.detachExplorerObserver();
		this.scheduleExplorerPatch();
		this.explorerObserver = new MutationObserver(() => this.scheduleExplorerPatch());
		const targets = document.querySelectorAll(
			'.workspace-leaf-content[data-type="file-explorer"], .workspace-leaf-content[data-type="outline"]');
		targets.forEach(t => this.explorerObserver.observe(t, { childList: true, subtree: true }));
	}

	detachExplorerObserver() {
		if (this.explorerObserver) { this.explorerObserver.disconnect(); this.explorerObserver = null; }
	}

	scheduleExplorerPatch() {
		if (this._patchScheduled) return;
		this._patchScheduled = true;
		requestAnimationFrame(() => { this._patchScheduled = false; this.patchExplorerDOM(); });
	}

	async patchExplorerDOM() {
		// Covers scheduleExplorerPatch() calls from active-leaf-change, vault
		// modify, and the mutation observer while the plugin is toggled off.
		if (!this.settings.pluginEnabled) return;
		if (this.settings.enableFileTreeCounts) {
			const roots = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
			for (let ri = 0; ri < roots.length; ri++) {
				const root  = roots[ri];
				const tiles = root.querySelectorAll('.nav-file-title');
				const jobs  = [];
				for (let i = 0; i < tiles.length; i++) {
					const path = tiles[i].dataset && tiles[i].dataset.path;
					if (path && path.endsWith('.md')) jobs.push(this.applyFileWordCount(tiles[i], path));
				}
				await Promise.all(jobs); // parallel reads, not one await per file
				this.applyFolderSums(root);
			}
		} else {
			document.querySelectorAll('.nav-file-title .zg-count, .nav-folder-title .zg-count').forEach(el => el.remove());
		}
		if (this.settings.enableOutlineCounts) {
			const oroots = document.querySelectorAll('.workspace-leaf-content[data-type="outline"]');
			await Promise.all(Array.from(oroots, r => this.applyOutlineWordCounts(r)));
		} else {
			document.querySelectorAll('.tree-item-self .zg-count').forEach(el => el.remove());
		}
	}

	async applyFileWordCount(el, path) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return;
		const hit = this.wordCountCache.get(path);
		if (hit && hit.mtime === file.stat.mtime) { this.setCountBadge(el, hit.count); return; }
		try {
			const text = await this.app.vault.cachedRead(file);
			const count = this.countWords(text); // frontmatter excluded, matching the status bar
			this.wordCountCache.set(path, { mtime: file.stat.mtime, count });
			this.setCountBadge(el, count);
		} catch (_) {}
	}

	applyFolderSums(root) {
		const folders = root.querySelectorAll('.nav-folder-title');
		for (let i = folders.length - 1; i >= 0; i--) {
			const fEl = folders[i].closest('.nav-folder');
			if (!fEl) continue;
			const children = fEl.querySelector('.nav-folder-children');
			if (!children) continue;
			let total = 0;
			children.querySelectorAll('.zg-count[data-wc]').forEach(b => total += parseInt(b.dataset.wc, 10) || 0);
			this.setCountBadge(folders[i], total);
		}
	}

	async applyOutlineWordCounts(outlineRoot) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		const cache = this.app.metadataCache.getFileCache(activeFile);
		if (!cache || !cache.headings) return;
		let text;
		try { text = await this.app.vault.cachedRead(activeFile); } catch (_) { return; }
		const counts = new Map();
		cache.headings.forEach((h, i) => {
			const start = h.position.end.offset;
			const end   = (i + 1 < cache.headings.length) ? cache.headings[i + 1].position.start.offset : text.length;
			const slice = text.slice(start, end).trim();
			counts.set('plain:' + h.heading, slice === '' ? 0 : slice.split(/\s+/).length);
		});
		outlineRoot.querySelectorAll('.tree-item-self').forEach(node => {
			const inner = node.querySelector('.tree-item-inner');
			if (!inner) return;
			const count = counts.get('plain:' + inner.textContent.trim());
			if (count != null) this.setCountBadge(node, count);
		});
	}

	setCountBadge(parentEl, count) {
		parentEl.style.display = 'flex'; parentEl.style.alignItems = 'center'; parentEl.style.justifyContent = 'space-between';
		const inner = parentEl.querySelector('.nav-file-title-content, .nav-folder-title-content, .tree-item-inner');
		if (inner) { inner.style.flex = '1'; inner.style.overflow = 'hidden'; inner.style.textOverflow = 'ellipsis'; inner.style.whiteSpace = 'nowrap'; }
		let badge = parentEl.querySelector('.zg-count');
		if (!badge) { badge = document.createElement('span'); badge.className = 'zg-count'; parentEl.appendChild(badge); }
		badge.dataset.wc = String(count);
		if (badge.textContent !== count.toLocaleString()) badge.textContent = count.toLocaleString();
	}

	removeWordCounts() {
		document.querySelectorAll('.zg-count').forEach(el => el.remove());
		if (this.wordCountCache) this.wordCountCache.clear();
	}
};

// =============================================================================
// Settings tab
// =============================================================================

class WordSmithSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Transient UI memory (last non-zero arrow count, active tab) lives here
		// — on the tab instance — so it never gets persisted into data.json.
		this._lastArrowCount = null;
		this._activeTab = 'zen';
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName('Word-Smith').setHeading();

		// ── Master on/off ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Enable Word-Smith')
			.setDesc('Master switch — turns the entire plugin on or off without uninstalling it.')
			.addToggle(t => t.setValue(this.plugin.settings.pluginEnabled)
				.onChange(async v => {
					this.plugin.settings.pluginEnabled = v;
					await this.plugin.saveSettings(true); // master switch lands immediately, not debounced
					this.display();
				}));

		if (!this.plugin.settings.pluginEnabled) return;

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// ── Tab bar ──────────────────────────────────────────────────────────────
		const TABS = [
			{ id: 'zen',        label: 'Zen',          render: this.displayZenTab },
			{ id: 'typewriter', label: 'Typewriter',   render: this.displayTypewriterTab },
			{ id: 'mask',       label: 'Mask',         render: this.displayMaskTab },
			{ id: 'retrobar',   label: 'Retro Bar',    render: this.displayRetroBarTab },
			{ id: 'text',       label: 'Text Options', render: this.displayTextTab }
		];
		if (!this._activeTab || !TABS.some(t => t.id === this._activeTab)) this._activeTab = TABS[0].id;

		const navEl = containerEl.createEl('div', { cls: 'ws-tab-nav' });
		TABS.forEach(tab => {
			const btn = navEl.createEl('button', {
				text: tab.label,
				cls: 'ws-tab-btn' + (this._activeTab === tab.id ? ' is-active' : '')
			});
			btn.addEventListener('click', () => {
				if (this._activeTab === tab.id) return;
				this._activeTab = tab.id;
				this.display();
			});
		});

		const bodyEl = containerEl.createEl('div', { cls: 'ws-tab-body' });
		const active = TABS.find(t => t.id === this._activeTab);
		active.render.call(this, bodyEl);
	}

	// ── Zen tab ────────────────────────────────────────────────────────────────
	displayZenTab(containerEl) {
		new Setting(containerEl)
			.setName('Zen mode')
			.setDesc('Hide UI chrome and collapse sidebars for distraction-free writing.')
			.addToggle(t => t.setValue(this.plugin.settings.zenMode)
				.onChange(async () => { await this.plugin.toggleZenMode(); this.display(); }));

		if (this.plugin.settings.zenMode) {
			const z = this.sub(containerEl);

			this.toggle(z, 'Full screen', 'Enter fullscreen when enabling zen mode.', 'fullscreen');

			this.toggle(z, 'Focused file mode', 'Only show the active file — hide all other panes.', 'focusedFileMode');

			this.label(z, 'Hide in zen mode');
			const hide = this.sub(z);
			this.toggle(hide, 'Properties',       'Hide note properties / frontmatter.',   'hideProperties');
			this.toggle(hide, 'Inline title',      'Hide the inline note title.',            'hideInlineTitle');
			this.toggle(hide, 'Native status bar', 'Hide Obsidian\'s built-in status bar in zen mode. (The retro bar always hides it while active, regardless of this setting.)', 'hideStatusBar');
			this.toggle(hide, 'Linked mentions',   'Hide linked mentions panel.',            'hideLinkedMentions');
			this.toggle(hide, 'Scroll bar',        'Hide the editor scroll bar.',            'hideScrollBar');
			this.toggle(hide, 'Ribbon',            'Hide the left ribbon bar.',               'hideRibbon');

			this.label(z, 'Padding');
			const pad = this.sub(z);
			this.slider(pad, 'Top',    'Extra space above editor content (0–100 px).', 'topPadding',    0, 100, 1);
			this.slider(pad, 'Bottom', 'Extra space below editor content (0–100 px).', 'bottomPadding', 0, 100, 1);
		}
	}

	// ── Typewriter tab ─────────────────────────────────────────────────────────
	displayTypewriterTab(containerEl) {
		new Setting(containerEl)
			.setName('Typewriter mode')
			.setDesc('Keep the cursor line vertically centred as you type.')
			.addToggle(t => t.setValue(this.plugin.settings.enableTypewriter)
				.onChange(async v => {
					this.plugin.settings.enableTypewriter = v;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enableTypewriter) {
			containerEl.createEl('p', { text: 'Letterbox masks and arrows have their own settings on the Mask tab. Horizontal text padding now lives on the Text Options tab.', cls: 'ws-settings-note' });

			const tw = this.sub(containerEl);

			// ── Current line highlight ─────────────────────────────────────────
			this.label(tw, 'Current line highlight');
			this.toggle(tw, 'Highlight current line', 'Tint the background of the line the cursor is on.', 'highlightCurrentLine', () => this.display());
			if (this.plugin.settings.highlightCurrentLine) {
				const hl = this.sub(tw);
				new Setting(hl).setName('Dark theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightDarkColor).onChange(async v => { this.plugin.settings.lineHighlightDarkColor = v; await this.plugin.saveSettings(); }));
				new Setting(hl).setName('Light theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightLightColor).onChange(async v => { this.plugin.settings.lineHighlightLightColor = v; await this.plugin.saveSettings(); }));
				this.slider(hl, 'Opacity', 'How strong the tint is.', 'lineHighlightOpacity', 0.05, 1, 0.05);
			}

			// ── Cursor position ─────────────────────────────────────────────────
			this.label(tw, 'Cursor position');
			tw.createEl('p', { text: 'How many lines of context to keep above/below the cursor. Equal values keep it dead-centre (the default).', cls: 'ws-settings-note' });
			const pos = this.sub(tw);
			this.numInput(pos, 'Lines above cursor', '', 'typewriterLinesAbove', 0, 40);
			this.numInput(pos, 'Lines below cursor', '', 'typewriterLinesBelow', 0, 40);

			// ── Focus dimming ────────────────────────────────────────────────────
			this.label(tw, 'Focus dimming');
			this.toggle(tw, 'Dim unfocused text', 'Fade everything outside the focus area while you write.', 'dimUnfocusedEnabled', () => this.display());
			if (this.plugin.settings.dimUnfocusedEnabled) {
				const dim = this.sub(tw);
				new Setting(dim).setName('Focus area')
					.addDropdown(d => d
						.addOption('paragraph', 'Paragraph')
						.addOption('sentence',  'Sentence')
						.setValue(this.plugin.settings.dimFocusMode || 'paragraph')
						.onChange(async v => { this.plugin.settings.dimFocusMode = v; await this.plugin.saveSettings(); }));
				this.slider(dim, 'Opacity', 'Opacity of the dimmed, unfocused text.', 'dimOpacity', 0.05, 1, 0.05);
			}
		} else {
			containerEl.createEl('p', {
				text: 'Turn this on to also use the letterbox masks on the Mask tab — they require typewriter mode to be active.',
				cls: 'ws-settings-note'
			});
		}
	}

	// ── Mask (arrows) tab ──────────────────────────────────────────────────────
	displayMaskTab(containerEl) {
		if (!this.plugin.settings.enableTypewriter) {
			containerEl.createEl('p', {
				text: 'Typewriter mode is off, so masks won\'t be visible yet. Enable it from the Typewriter tab.',
				cls: 'ws-settings-note'
			});
		}

		this.toggle(containerEl, 'Enable letterbox', 'Top and bottom masks framing the writing area (active in zen mode).', 'enableLetterbox', () => this.display());

		if (this.plugin.settings.enableLetterbox) {
			const ls = this.sub(containerEl);

			new Setting(ls).setName('Mask height (px)').setDesc('Drag the separator line in zen mode to adjust live.')
				.addSlider(s => s.setLimits(0, 400, 4)
					.setValue(this.plugin.settings.letterboxPx != null
						? Math.round(this.plugin.settings.letterboxPx)
						: (this.plugin.settings.letterboxLines || 8) * 26)
					.setDynamicTooltip()
					.onChange(async v => { this.plugin.settings.letterboxPx = v; await this.plugin.saveSettings(); }));

			this.slider(ls, 'Horizontal inset', 'Insets the arrow/line layer. Drag the arrow row to adjust live.', 'maskPaddingH', 0, 400, 10);

			new Setting(ls).setName('Show arrows').setDesc('Arrow characters along the mask edges.')
				.addToggle(t => t.setValue(this.plugin.settings.arrowCount > 0)
					.onChange(async v => {
						if (!v) this._lastArrowCount = this.plugin.settings.arrowCount || 5;
						this.plugin.settings.arrowCount = v ? (this._lastArrowCount || 5) : 0;
						await this.plugin.saveSettings(); this.display();
					}));

			if (this.plugin.settings.arrowCount > 0) {
				const as = this.sub(ls);
				new Setting(as).setName('Arrow style')
					.addDropdown(d => d
						.addOption('solid-triangle',   '▲ / ▼  Solid triangles')
						.addOption('outline-triangle', '△ / ▽  Outline triangles')
						.addOption('standard-arrow',   '↑ / ↓  Standard arrows')
						.addOption('chevron',          '∧ / ∨  Chevrons')
						.addOption('double-chevron',   '⇑ / ⇓  Double chevrons')
						.addOption('custom',           'Custom characters')
						.setValue(this.plugin.settings.arrowStyle)
						.onChange(async v => { this.plugin.settings.arrowStyle = v; await this.plugin.saveSettings(); this.display(); }));
				if (this.plugin.settings.arrowStyle === 'custom') {
					new Setting(as).setName('Top char').addText(t => t.setValue(this.plugin.settings.customArrowTop).onChange(async v => { this.plugin.settings.customArrowTop = v || '^'; await this.plugin.saveSettings(); }));
					new Setting(as).setName('Bottom char').addText(t => t.setValue(this.plugin.settings.customArrowBottom).onChange(async v => { this.plugin.settings.customArrowBottom = v || 'v'; await this.plugin.saveSettings(); }));
				}
				this.numInput(as, 'Arrow count', 'Number per row (1–10).', 'arrowCount', 1, 10);
				this.slider(as, 'Arrow scale', 'Size multiplier.', 'arrowScale', 0.5, 3, 0.1);
			}

			this.label(ls, 'Separator line');
			new Setting(ls).setName('Line style')
				.addDropdown(d => d
					.addOption('none',   'None (hidden)')
					.addOption('solid',  'Solid ——')
					.addOption('dashed', 'Dashed - - -')
					.addOption('dotted', 'Dotted · · ·')
					.addOption('double', 'Double ═══')
					.setValue(this.plugin.settings.separatorStyle)
					.onChange(async v => { this.plugin.settings.separatorStyle = v; await this.plugin.saveSettings(); }));
			this.slider(ls, 'Line weight', 'Thickness (1–8 px).', 'separatorWeight', 1, 8, 1);

			this.label(ls, 'Colors');
			ls.createEl('p', { text: 'Dark and light variants switch automatically with your theme.', cls: 'ws-settings-note' });
			this.label(ls, 'Dark theme');
			const cdk = this.sub(ls);
			new Setting(cdk).setName('Arrows color').addColorPicker(cp => cp.setValue(this.plugin.settings.arrowDarkColor).onChange(async v => { this.plugin.settings.arrowDarkColor = v; await this.plugin.saveSettings(); }));
			new Setting(cdk).setName('Separator line color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineDarkColor).onChange(async v => { this.plugin.settings.lineDarkColor = v; await this.plugin.saveSettings(); }));
			this.label(ls, 'Light theme');
			const clt = this.sub(ls);
			new Setting(clt).setName('Arrows color').addColorPicker(cp => cp.setValue(this.plugin.settings.arrowLightColor).onChange(async v => { this.plugin.settings.arrowLightColor = v; await this.plugin.saveSettings(); }));
			new Setting(clt).setName('Separator line color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineLightColor).onChange(async v => { this.plugin.settings.lineLightColor = v; await this.plugin.saveSettings(); }));
		}
	}

	// ── Retro Bar tab ──────────────────────────────────────────────────────────
	displayRetroBarTab(containerEl) {
		new Setting(containerEl)
			.setName('Retro status bar')
			.setDesc('Fixed retro-styled bar at the bottom. Auto-hides the native status bar while active.')
			.addToggle(t => t.setValue(this.plugin.settings.enableRetroStatus)
				.onChange(async v => {
					this.plugin.settings.enableRetroStatus = v;
					this.plugin.updateStatusBar();
					this.plugin.updateRetroStatusBar();
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enableRetroStatus) {
			const rb = this.sub(containerEl);

			this.label(rb, 'Format');
			rb.createEl('p', {
				text: 'Tokens: {file} {words} {chars} {time} {date} {battery} {paragraph} {goal} {caps} {nump} {vim}',
				cls: 'ws-settings-note'
			});
			const fmt = this.sub(rb);
			new Setting(fmt).setName('Left').setDesc('Aligned to the left edge of the bar.')
				.addText(t => t.setPlaceholder('e.g. {file}')
					.setValue(this.plugin.settings.statusFormatLeft)
					.onChange(async v => { this.plugin.settings.statusFormatLeft = v; await this.plugin.saveSettings(); }));
			new Setting(fmt).setName('Center').setDesc('Centered in the bar.')
				.addText(t => t.setPlaceholder(DEFAULT_SETTINGS.statusFormatCenter)
					.setValue(this.plugin.settings.statusFormatCenter)
					.onChange(async v => { this.plugin.settings.statusFormatCenter = v; await this.plugin.saveSettings(); }));
			new Setting(fmt).setName('Right').setDesc('Aligned to the right edge of the bar.')
				.addText(t => t.setPlaceholder('e.g. {vim}')
					.setValue(this.plugin.settings.statusFormatRight)
					.onChange(async v => { this.plugin.settings.statusFormatRight = v; await this.plugin.saveSettings(); }));
			new Setting(fmt).setName('{file} format').setDesc('What the {file} token shows.')
				.addDropdown(d => d
					.addOption('path', 'Full path  ~/folder/note')
					.addOption('name', 'File name only  note')
					.setValue(this.plugin.settings.fileTokenFormat || 'path')
					.onChange(async v => { this.plugin.settings.fileTokenFormat = v; await this.plugin.saveSettings(); this.plugin.updateRetroStatusBar(); }));
			this.slider(rb, 'Font size', 'Font size (8–24 px).', 'statusBarFontSize', 8, 24, 1);
			this.slider(rb, 'Height',    'Bar height (20–60 px).', 'statusBarHeight',   20, 60, 1);
			this.toggle(rb, 'Top border', 'Coloured separator line above the bar.', 'statusBarBorder');

			this.label(rb, 'Writing goal');
			const gs = this.sub(rb);
			new Setting(gs).setName('Word target').setDesc('Target word count. Click the bar to reset the baseline.')
				.addText(t => {
					t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.addClass('ws-num-input');
					t.setValue(String(this.plugin.settings.goalTarget));
					t.onChange(async v => { const n = parseInt(v, 10); if (!isNaN(n) && n > 0) { this.plugin.settings.goalTarget = n; await this.plugin.saveSettings(); } });
				});
			new Setting(gs).setName('Display style')
				.addDropdown(d => d
					.addOption('fraction', 'Fraction  847/1,000')
					.addOption('bar',      'Fill bar  ████░')
					.setValue(this.plugin.settings.goalDisplay)
					.onChange(async v => { this.plugin.settings.goalDisplay = v; await this.plugin.saveSettings(); this.display(); }));
			if (this.plugin.settings.goalDisplay === 'bar') {
				this.slider(gs, 'Segments', 'Number of fill-bar segments (1–20).', 'goalBarCells', 1, 20, 1);
			}
			this.toggle(gs, 'Flash animation', 'Flash the bar when the word target is reached.', 'goalFlashEnabled');

			this.label(rb, 'Date format');
			const df = this.sub(rb);
			const preview = df.createEl('code');
			const refreshPreview = () => preview.setText(this.plugin.formatDate(new Date()));
			new Setting(df).setName('Format string').setDesc('Tokens: dd  mm  yy  yyyy')
				.addText(t => {
					t.setPlaceholder('dd/mm/yyyy').setValue(this.plugin.settings.dateFormat);
					t.onChange(async v => { this.plugin.settings.dateFormat = v || 'dd/mm/yyyy'; await this.plugin.saveSettings(); refreshPreview(); });
				});
			const fmtRow = df.createEl('div', { cls: 'ws-fmt-row' });
			for (const fmt of ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd.mm.yy', 'dd-mm-yyyy', 'yyyy/mm/dd']) {
				const btn = fmtRow.createEl('button', { text: fmt });
				btn.addEventListener('click', async () => { this.plugin.settings.dateFormat = fmt; await this.plugin.saveSettings(); this.display(); });
			}
			df.createEl('small', { text: 'Preview: ' }).appendChild(preview);
			refreshPreview();

			// ── Colors (inside retro bar) ─────────────────────────────────────────
			this.label(rb, 'Colors');
			rb.createEl('p', { text: 'Dark and light variants switch automatically with your theme.', cls: 'ws-settings-note' });

			this.label(rb, 'Dark theme');
			const dk = this.sub(rb);
			new Setting(dk).setName('Bar background').addColorPicker(cp => cp.setValue(this.plugin.settings.retroDarkBgColor).onChange(async v => { this.plugin.settings.retroDarkBgColor = v; await this.plugin.saveSettings(); }));
			new Setting(dk).setName('Bar text / accent').addColorPicker(cp => cp.setValue(this.plugin.settings.retroDarkTextColor).onChange(async v => { this.plugin.settings.retroDarkTextColor = v; await this.plugin.saveSettings(); }));

			this.label(rb, 'Light theme');
			const lt = this.sub(rb);
			new Setting(lt).setName('Bar background').addColorPicker(cp => cp.setValue(this.plugin.settings.retroLightBgColor).onChange(async v => { this.plugin.settings.retroLightBgColor = v; await this.plugin.saveSettings(); }));
			new Setting(lt).setName('Bar text / accent').addColorPicker(cp => cp.setValue(this.plugin.settings.retroLightTextColor).onChange(async v => { this.plugin.settings.retroLightTextColor = v; await this.plugin.saveSettings(); }));
		}
	}

	// ── Text Options tab (text options + word counts) ─────────────────────────
	displayTextTab(containerEl) {
		new Setting(containerEl)
			.setName('Text options')
			.setDesc('Paragraph indent, line spacing, justification, and sidebar word counts.')
			.addToggle(t => t.setValue(this.plugin.settings.miscEnabled)
				.onChange(async v => { this.plugin.settings.miscEnabled = v; await this.plugin.saveSettings(); this.display(); }));

		if (this.plugin.settings.miscEnabled) {
			const mc = this.sub(containerEl);

			this.slider(mc, 'Horizontal padding', 'Left/right text padding inside the editor. Applies everywhere — not just zen mode.', 'editorPaddingH', 0, 400, 10);

			this.toggle(mc, 'Paragraph indent', 'Indent the first line of paragraphs.', 'enableParagraphIndent', () => this.display());
			if (this.plugin.settings.enableParagraphIndent) {
				const pi = this.sub(mc);
				new Setting(pi).setName('Indent trigger')
					.addDropdown(d => d
						.addOption('double', 'Blank line (double Enter)')
						.addOption('single', 'Every line (single Enter)')
						.setValue(this.plugin.settings.paragraphIndentMode || 'double')
						.onChange(async v => { this.plugin.settings.paragraphIndentMode = v; await this.plugin.saveSettings(); }));
				this.slider(pi, 'Indent size (em)', 'Width of the indent.', 'paragraphIndentEm', 0.5, 8, 0.5);
			}
			new Setting(mc).setName('Line spacing').setDesc('Line height multiplier (e.g. 1, 1.5, 2).')
				.addText(t => {
					t.inputEl.type = 'number'; t.inputEl.min = '0.8'; t.inputEl.max = '4'; t.inputEl.step = '0.1'; t.inputEl.addClass('ws-num-input');
					t.setValue(String(this.plugin.settings.lineSpacing != null ? this.plugin.settings.lineSpacing : 1.5));
					t.onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0.8 && n <= 4) { this.plugin.settings.lineSpacing = n; await this.plugin.saveSettings(); } });
				});
			this.toggle(mc, 'Justify text', 'Full-justify paragraph text in both editing and reading views.', 'justifyText');

			this.label(mc, 'Hidden markers');
			this.toggle(mc, 'Show hidden markers', 'Reveal invisible whitespace and line breaks in the editor.', 'showHiddenMarkers', () => this.display());
			if (this.plugin.settings.showHiddenMarkers) {
				const hm = this.sub(mc);
				this.toggle(hm, 'Spaces', 'Mark every space with a middle dot (·).', 'markSpaces');
				this.toggle(hm, 'Tabs', 'Mark every tab with an arrow (→).', 'markTabs');
				this.toggle(hm, 'Paragraphs', 'Mark blank (paragraph-break) lines with a pilcrow (¶).', 'markParagraphs');
				this.toggle(hm, 'End of lines', 'Mark the end of every line with a return arrow (↵).', 'markEndOfLines');
			}

			this.label(mc, 'Word counts');
			this.toggle(mc, 'File tree word counts', 'Word count per note in the left sidebar, summed into folders.', 'enableFileTreeCounts', () => this.display());
			this.toggle(mc, 'Outline heading counts', 'Word count per heading section in the outline panel.', 'enableOutlineCounts', () => this.display());
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	sub(root) {
		return root.createEl('div', { cls: 'ws-settings-sub' });
	}

	label(root, text) {
		root.createEl('p', { text, cls: 'ws-settings-label' });
	}

	toggle(c, name, desc, key, cb) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addToggle(t => t.setValue(this.plugin.settings[key]).onChange(async v => {
				this.plugin.settings[key] = v;
				await this.plugin.saveSettings();
				if (cb) cb.call(this, v);
			}));
	}

	slider(c, name, desc, key, min, max, step) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addSlider(s => s.setLimits(min, max, step || 1).setValue(this.plugin.settings[key]).setDynamicTooltip()
				.onChange(async v => { this.plugin.settings[key] = v; await this.plugin.saveSettings(); }));
	}

	numInput(c, name, desc, key, min, max) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addText(t => {
				t.inputEl.type = 'number'; t.inputEl.min = String(min); t.inputEl.max = String(max); t.inputEl.addClass('ws-num-input');
				t.setValue(String(this.plugin.settings[key]));
				t.onChange(async v => { const n = parseInt(v, 10); if (!isNaN(n) && n >= min && n <= max) { this.plugin.settings[key] = n; await this.plugin.saveSettings(); } });
			});
	}
}
/* nosourcemap */