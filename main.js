'use strict';

const { Plugin, PluginSettingTab, Setting, MarkdownView, TFile, ButtonComponent } = require('obsidian');

// ─────────────────────────────────────────────────────────────────────────────
// Arrow style presets
// ─────────────────────────────────────────────────────────────────────────────

const ARROW_STYLES = {
	'solid-triangle':   { top: '▲', bottom: '▼' },
	'outline-triangle': { top: '△', bottom: '▽' },
	'standard-arrow':   { top: '↑', bottom: '↓' },
	'chevron':          { top: '∧', bottom: '∨' },
	'double-chevron':   { top: '⇑', bottom: '⇓' },
	'ascii':            { top: '^',  bottom: 'v' },
	'custom':           { top: '',   bottom: ''  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
	// ── Master switch ─────────────────────────────────────────────────────────
	pluginEnabled:            true,

	// ── Zen mode ──────────────────────────────────────────────────────────────
	zenMode:                  false,
	fullscreen:               false,
	exitButtonVisibility:     'always',   // 'always' | 'mobile-only' | 'never'
	autoHideButtonOnDesktop:  false,
	leftSidebar:              true,       // saved state (was collapsed when entering zen)
	rightSidebar:             true,
	hideProperties:           true,
	hideInlineTitle:          false,
	hideStatusBar:            true,
	hideLinkedMentions:       false,
	hideScrollBar:            true,
	topPadding:               0,
	bottomPadding:            0,
	focusedFileMode:          false,

	// ── Typewriter / letterbox ────────────────────────────────────────────────
	enableTypewriter:         true,
	editorPaddingH:           150,
	enableLetterbox:          true,
	letterboxLines:           8,
	letterboxPx:              112,
	maskPaddingH:             123,
	maskOverhang:             4,
	arrowStyle:               'solid-triangle',
	customArrowTop:           '^',
	customArrowBottom:        'v',
	arrowCount:               5,
	arrowScale:               1.0,
	separatorStyle:           'solid',
	separatorWeight:          2,

	// ── Retro status bar ──────────────────────────────────────────────────────
	enableRetroStatus:        true,
	statusFormatText:         '{file} | {goal} | words: {words} | chars: {chars} | {date} {time} | {battery} | ¶{paragraph}',
	statusBarBorder:          true,
	statusBarFontSize:        13,
	statusBarHeight:          30,
	goalTarget:               1000,
	goalDisplay:              'bar',
	goalBaseline:             0,          // intentionally not copied — see note below
	goalBarCells:             5,
	goalFlashEnabled:         true,
	dateFormat:               'dd/mm/yy',
	retroDarkBgColor:         '#050505',
	retroDarkTextColor:       '#fbfaf9',
	retroLightBgColor:        '#f5f0e8',
	retroLightTextColor:      '#1a4a1a',
	arrowDarkColor:           '#fbfaf9',
	arrowLightColor:          '#1a4a1a',
	lineDarkColor:            '#faf8f5',
	lineLightColor:           '#1a4a1a',

	// ── Misc options ──────────────────────────────────────────────────────────
	miscEnabled:              true,

	// ── Text options ──────────────────────────────────────────────────────────
	enableParagraphIndent:    false,
	paragraphIndentEm:        2,
	paragraphIndentMode:      'double',   // 'double' | 'single'
	lineSpacing:              1.5,

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
		this._zgLastTotalWordCount = 0;

		// ── Scroll / resize handlers ──────────────────────────────────────────
		this.currentScroller  = null;
		this.scrollHandler    = null;
		this.windowResizeHandler = null;

		// ── Paragraph tagger ──────────────────────────────────────────────────
		this._paraTaggerObserver = null;

		// ── Style injection ───────────────────────────────────────────────────
		this.styleEl          = null;

		// ── Word count cache ──────────────────────────────────────────────────
		this.explorerObserver = null;
		this.wordCountCache   = new Map();
		this._patchScheduled  = false;

		// ── Zen button (from new zen plugin) ─────────────────────────────────
		this.buttonContainer  = null;
		this.button           = null;
		this.hasButton        = false;
		this._isTogglingZen   = false;
		this._wasZenMode      = false;
		this._hasShownInitialHighlight = false;
		this._highlightTimeouts = [];
		this._tabContainersCache = null;
		this.visualViewportResizeHandler = null;

		// ── Live selection rAF ────────────────────────────────────────────────
		this._selectionRaf    = null;

		// ── Theme observer ────────────────────────────────────────────────────
		this._themeObserver   = null;

		await this.loadSettings();
		this._wasZenMode = this.settings.zenMode;

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
		this.addRibbonIcon('expand', 'Toggle zen mode', () => this.toggleZenMode());

		// Workspace events
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.updateWorkspaceAesthetics();
			this.scheduleExplorerPatch();
			if (this.settings.zenMode && this.settings.focusedFileMode) this.updateFocusedFileMode();
		}));
		this.registerEvent(this.app.workspace.on('editor-change', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('resize', () => this.scheduleMaskPosition()));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this._tabContainersCache = null;
			if (this.settings.zenMode && this.settings.focusedFileMode) this.updateFocusedFileMode();
		}));

		// DOM events
		this.registerDomEvent(document, 'keyup', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		});
		this.registerDomEvent(document, 'mouseup', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		});
		// Live selection word count
		this._selectionRaf = null;
		this.registerDomEvent(document, 'mousemove', () => {
			if (this._selectionRaf) return;
			this._selectionRaf = requestAnimationFrame(() => {
				this._selectionRaf = null;
				this.updateRetroStatusBar();
			});
		});
		// Escape exits zen mode (from new zen plugin — respects vim mode and excalidraw)
		this.registerDomEvent(document, 'keydown', (evt) => {
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

		// Theme observer
		this._themeObserver = new MutationObserver(() => this.applyCssVariables());
		this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

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
		// Clean up theme observer
		if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		// Clean up zen button
		this._highlightTimeouts.forEach(id => clearTimeout(id));
		if (this.buttonContainer) this.buttonContainer.remove();
		if (this.visualViewportResizeHandler && window.visualViewport) {
			window.visualViewport.removeEventListener('resize', this.visualViewportResizeHandler);
		}
		// Exit zen mode cleanly
		if (this.settings.zenMode) {
			this.settings.zenMode = false;
			this.applyBodyClasses();
			this.setSidebarVisibility();
		}
		document.body.classList.remove(
			'zenmode-active', 'zenmode-hide-properties', 'zenmode-hide-status-bar',
			'zenmode-hide-scroll-bar', 'zenmode-hide-title-bar',
			'zenmode-hide-linked-mentions', 'zg-para-indent'
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
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.refresh();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Core refresh
	// ─────────────────────────────────────────────────────────────────────────

	refresh() {
		if (!this.settings.pluginEnabled) { this.disablePlugin(); return; }
		this.applyBodyClasses();
		this.applyCssVariables();
		this.updateStyleEl();
		this.updateWorkspaceAesthetics();
		this.setSidebarVisibility();
		this.setButtonVisibility();
		this.updateFocusedFileMode();
		if (this.settings.enableFileTreeCounts || this.settings.enableOutlineCounts) {
			this.attachExplorerObserver();
		} else {
			this.detachExplorerObserver();
			this.removeWordCounts();
		}
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
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		// Remove button
		if (this.buttonContainer) { this.buttonContainer.classList.remove('zenmode-button-visible'); }
		// Strip all body classes and attributes
		document.body.classList.remove(
			'zenmode-active', 'zenmode-hide-properties', 'zenmode-hide-status-bar',
			'zenmode-hide-scroll-bar', 'zenmode-hide-linked-mentions', 'zg-para-indent',
			'zg-masks-active'
		);
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
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
		body.classList.toggle('zenmode-active',             zen);
		body.classList.toggle('zenmode-hide-properties',    zen && this.settings.hideProperties);
		body.classList.toggle('zenmode-hide-status-bar',    this.settings.hideStatusBar);
		body.classList.toggle('zenmode-hide-scroll-bar',    zen && this.settings.hideScrollBar);
		body.classList.toggle('zenmode-hide-linked-mentions', zen && this.settings.hideLinkedMentions);
		body.classList.toggle('zg-para-indent',             this.settings.enableParagraphIndent);
		body.classList.toggle('zg-masks-active',            this.settings.enableTypewriter && this.settings.enableLetterbox);
		if (zen) {
			body.setAttribute('data-zen-hide-inline-title', String(this.settings.hideInlineTitle));
			body.setAttribute('data-zen-focused-file',      String(this.settings.focusedFileMode));
		} else {
			body.removeAttribute('data-zen-hide-inline-title');
			body.removeAttribute('data-zen-focused-file');
		}
	}

	applyCssVariables() {
		const root = document.documentElement.style;
		root.setProperty('--zg-editor-padding-h',    this.settings.editorPaddingH + 'px');
		root.setProperty('--zg-z-mask',   '20');
		root.setProperty('--zg-z-arrows', '21');
		root.setProperty('--zg-z-status', '22');
		root.setProperty('--zen-mode-top-padding',    this.settings.topPadding + 'px');
		root.setProperty('--zen-mode-bottom-padding', this.settings.bottomPadding + 'px');

		const base = window.innerWidth * 0.012;
		const size = Math.max(10, Math.min(40, base * (this.settings.arrowScale || 1)));
		root.setProperty('--zg-arrow-font-size',      size + 'px');
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
		if (this.settings.lineSpacing && this.settings.lineSpacing !== 1.5) {
			const ls = String(this.settings.lineSpacing);
			rules.push('.cm-content { line-height: ' + ls + ' !important; }');
			rules.push('.markdown-preview-view { line-height: ' + ls + ' !important; }');
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
		if (this._paraTaggerObserver) return;
		const tag = () => this.tagParaFirstLines();
		this._paraTaggerObserver = new MutationObserver(tag);
		this._paraTaggerObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
		tag();
	}

	detachParaTagger() {
		if (this._paraTaggerObserver) { this._paraTaggerObserver.disconnect(); this._paraTaggerObserver = null; }
		document.querySelectorAll('.zg-para-first').forEach(el => el.classList.remove('zg-para-first'));
	}

	tagParaFirstLines() {
		const contents = document.querySelectorAll('.cm-content');
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
		if (!this.settings.pluginEnabled) return;
		if (this._isTogglingZen) return;
		this._isTogglingZen = true;
		try {
			const entering = !this.settings.zenMode;
			if (!entering) this._hasShownInitialHighlight = false;

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
			await this.saveSettings();
		} finally {
			this._isTogglingZen = false;
		}
	}

	async toggleFullPlugin() {
		const anyOn = this.settings.zenMode || this.settings.enableRetroStatus;
		const next  = !anyOn;
		await this.toggleZenMode();
		this.settings.enableRetroStatus = next;
		await this.saveSettings();
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
	// Exit button (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	createButton() {
		this.buttonContainer = document.createElement('div');
		this.buttonContainer.classList.add('zenmode-button');
		this.button = new ButtonComponent(this.buttonContainer);
		this.button.setIcon('shrink');
		this.button.onClick(() => this.toggleZenMode());
		document.body.appendChild(this.buttonContainer);
		this.adjustButtonPosition();
		this.registerDomEvent(window, 'resize', () => this.adjustButtonPosition());
		if (window.visualViewport) {
			this.visualViewportResizeHandler = () => this.adjustButtonPosition();
			window.visualViewport.addEventListener('resize', this.visualViewportResizeHandler);
		}
	}

	adjustButtonPosition() {
		if (!this.buttonContainer || !document.body.classList.contains('is-mobile')) return;
		const vph  = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
		const navH = Math.max(0, window.outerHeight - vph);
		const off  = Math.max(60, navH + 10);
		this.buttonContainer.style.bottom = off + 'px';
	}

	setButtonVisibility() {
		const isMobile   = document.body.classList.contains('is-mobile');
		const shouldShow = this.settings.zenMode && (
			this.settings.exitButtonVisibility === 'always' ||
			(this.settings.exitButtonVisibility === 'mobile-only' && isMobile)
		);
		if (shouldShow) {
			if (!this.hasButton) { this.createButton(); this.hasButton = true; }
			this.buttonContainer.classList.add('zenmode-button-visible');
			this.buttonContainer.classList.toggle('zenmode-button-moved-up', !isMobile);
			if (this.settings.autoHideButtonOnDesktop && !isMobile && this.settings.exitButtonVisibility === 'always') {
				this.buttonContainer.classList.add('zenmode-button-auto-hide');
				if (!this._hasShownInitialHighlight) {
					this.buttonContainer.classList.add('zenmode-button-initial-highlight');
					this._hasShownInitialHighlight = true;
					const t1 = window.setTimeout(() => {
						if (this.buttonContainer) {
							this.buttonContainer.classList.remove('zenmode-button-initial-highlight');
							const t2 = window.setTimeout(() => {
								if (this.buttonContainer) this.buttonContainer.classList.add('zenmode-button-fade-out');
							}, 300);
							this._highlightTimeouts.push(t2);
						}
					}, 1500);
					this._highlightTimeouts.push(t1);
				}
			} else {
				this.buttonContainer.classList.remove('zenmode-button-auto-hide', 'zenmode-button-initial-highlight', 'zenmode-button-fade-out');
			}
			this.adjustButtonPosition();
		} else if (this.hasButton) {
			this.buttonContainer.classList.remove('zenmode-button-visible');
		}
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
		// Retro status bar: independent of zen mode
		this.updateStatusBar();
		this.updateRetroStatusBar();

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
		this.applyCssVariables();
	}

	startClockTick() {
		if (this.clockInterval) return;
		this.clockInterval = window.setInterval(() => this.updateRetroStatusBar(), 15000);
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
			bm.addEventListener('levelchange', update);
			bm.addEventListener('chargingchange', update);
			update();
		} catch (_) {}
	}

	formatBattery() {
		if (this.batteryLevel === null) return '?%';
		return (this.batteryCharging ? '⚡︎' : '') + this.batteryLevel + '%';
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
		const parts = file.path.split('/');
		return (parts.length <= 1 ? '~/' : '~/' + parts.slice(0, -1).join('/') + '/') + file.basename;
	}

	getParagraphInfo(view) {
		if (!view || !view.editor) return '1/1';
		const cursorLine = view.editor.getCursor('head').line;
		const lines = view.getViewData().split('\n');
		let current = 0, total = 0, inPara = false, counted = false;
		for (let i = 0; i < lines.length; i++) {
			const raw     = lines[i];
			const blank   = raw.trim() === '';
			const heading = /^\s{0,3}#{1,6}\s/.test(raw);
			if (!blank && !heading && !inPara) {
				total++; inPara = true;
				if (!counted && i >= cursorLine) { current = total; counted = true; }
			}
			if (blank || heading) inPara = false;
			if (!counted && i === cursorLine && inPara) { current = total; counted = true; }
		}
		if (!counted) current = total;
		if (total === 0) { total = 1; current = 1; }
		return current + '/' + total;
	}

	formatGoal(total) {
		const count  = Math.max(0, total - (this.settings.goalBaseline || 0));
		const target = this.settings.goalTarget || 1000;
		const ratio  = Math.min(count / target, 1);
		return { text: count.toLocaleString() + '/' + target.toLocaleString(), ratio, met: count >= target };
	}

	updateRetroStatusBar() {
		if (!this.retroStatusBarEl) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const now  = new Date();
		let totalWC = 0, charCount = 0, displayWC = 0, displayCC = 0;

		if (view) {
			const full = view.getViewData();
			totalWC   = full.trim() === '' ? 0 : full.trim().split(/\s+/).length;
			charCount  = full.length;
			const editor = view.editor;
			if (editor) {
				const sel = editor.getSelection();
				if (sel && sel.trim().length > 0) {
					displayWC = sel.trim().split(/\s+/).length;
					displayCC = sel.length;
				} else {
					displayWC = totalWC;
					displayCC = charCount;
				}
			} else {
				displayWC = totalWC;
				displayCC = charCount;
			}
		}

		const goal    = this.formatGoal(totalWC);
		const hasGoal = this.settings.statusFormatText.includes('{goal}');
		const subs    = {
			'{file}':      this.getFilePath(view),
			'{words}':     displayWC,
			'{chars}':     displayCC,
			'{time}':      this.formatTime(now),
			'{date}':      this.formatDate(now),
			'{battery}':   this.formatBattery(),
			'{paragraph}': this.getParagraphInfo(view),
			'{goal}':      '\x00GOAL\x00'
		};

		let out = this.settings.statusFormatText;
		for (const token in subs) out = out.split(token).join(String(subs[token]));

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

		if (out.includes('\x00GOAL\x00')) {
			const parts = out.split('\x00GOAL\x00');
			this.retroStatusBarEl.empty();
			if (parts[0]) this.retroStatusBarEl.appendText(parts[0]);
			if (this.settings.goalDisplay === 'bar') {
				this.retroStatusBarEl.appendChild(this.buildGoalBar(goal.ratio));
			} else {
				this.retroStatusBarEl.createSpan({ cls: 'zg-goal-text', text: goal.text });
			}
			if (parts[1]) this.retroStatusBarEl.appendText(parts[1]);
		} else {
			this.retroStatusBarEl.setText(out);
		}

		// Flash the bar when goal is met (if enabled)
		this.retroStatusBarEl.classList.toggle('zg-goal-met', goal.met && this.settings.goalFlashEnabled);

		// Shrink font size if the content overflows the bar's current width
		// (e.g. when a sidebar is open and the note pane narrows).
		this.fitStatusBarText();
	}

	// Reduce the retro bar's font size until the text fits its current width,
	// never going above the user's configured size. Resets to the configured
	// size first so it grows back when the bar has room again (sidebar closed).
	fitStatusBarText() {
		const el = this.retroStatusBarEl;
		if (!el) return;
		const baseSize = this.settings.statusBarFontSize || 13;
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
		const sBottom = window.innerHeight - statusH;
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

		line.style.cursor        = 'ns-resize';
		line.style.pointerEvents = 'auto';
		line.addEventListener('mousedown', e => {
			if (e.button !== 0) return;
			e.preventDefault(); e.stopPropagation();
			this._startVerticalDrag(e, position);
		});

		arrows.style.cursor        = 'ew-resize';
		arrows.style.pointerEvents = 'auto';
		arrows.addEventListener('mousedown', e => {
			if (e.button !== 0) return;
			e.preventDefault(); e.stopPropagation();
			this._startHorizontalDrag(e);
		});
		return wrap;
	}

	_startVerticalDrag(e, position) {
		const startY = e.clientY;
		const startH = (this.maskTopEl ? parseFloat(this.maskTopEl.style.height) : null)
			|| (this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26);
		document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none';
		const onMove = me => {
			const dy = me.clientY - startY;
			this.settings.letterboxPx = Math.max(0, startH + dy * (position === 'top' ? 1 : -1));
			this.scheduleMaskPosition();
		};
		const onUp = async () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.style.cursor = ''; document.body.style.userSelect = '';
			await this.saveSettings();
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	_startHorizontalDrag(e) {
		const startX   = e.clientX;
		const startPad = this.settings.maskPaddingH || 0;
		const cx       = window.innerWidth / 2;
		document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none';
		const onMove = me => {
			const dx = me.clientX - startX;
			this.settings.maskPaddingH = Math.max(0, Math.min(Math.round(cx) - 20, Math.round(startPad + dx * (startX < cx ? 1 : -1))));
			this.scheduleMaskPosition();
		};
		const onUp = async () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			document.body.style.cursor = ''; document.body.style.userSelect = '';
			await this.saveSettings();
		};
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
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
		if (!this.settings.enableTypewriter) return;
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
		const target = lineTop + lineHeight / 2 - scroller.clientHeight / 2;
		if (Math.abs(scroller.scrollTop - target) < 1) return;
		scroller.scrollTop = target;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Word count: file tree + outline
	// ─────────────────────────────────────────────────────────────────────────

	attachExplorerObserver() {
		if (this.explorerObserver) return;
		this.scheduleExplorerPatch();
		this.explorerObserver = new MutationObserver(() => this.scheduleExplorerPatch());
		this.explorerObserver.observe(document.body, { childList: true, subtree: true });
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
		if (this.settings.enableFileTreeCounts) {
			const roots = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
			for (let ri = 0; ri < roots.length; ri++) {
				const root = roots[ri];
				const tiles = root.querySelectorAll('.nav-file-title');
				for (let i = 0; i < tiles.length; i++) {
					const path = tiles[i].dataset && tiles[i].dataset.path;
					if (path && path.endsWith('.md')) await this.applyFileWordCount(tiles[i], path);
				}
				this.applyFolderSums(root);
			}
		} else {
			document.querySelectorAll('.nav-file-title .zg-count, .nav-folder-title .zg-count').forEach(el => el.remove());
		}
		if (this.settings.enableOutlineCounts) {
			const oroots = document.querySelectorAll('.workspace-leaf-content[data-type="outline"]');
			for (let ri = 0; ri < oroots.length; ri++) await this.applyOutlineWordCounts(oroots[ri]);
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
			const count = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
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
	constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Word-Smith' });

		// ── Master on/off ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Enable Word-Smith')
			.setDesc('Master switch — turns the entire plugin on or off without uninstalling it.')
			.addToggle(t => t.setValue(this.plugin.settings.pluginEnabled)
				.onChange(async v => {
					this.plugin.settings.pluginEnabled = v;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (!this.plugin.settings.pluginEnabled) return;

		containerEl.createEl('hr').style.cssText = 'margin:8px 0 16px;border:none;border-top:1px solid var(--background-modifier-border);';

		// ── Zen Mode toggle + inline options ───────────────────────────────────
		new Setting(containerEl)
			.setName('Zen mode')
			.setDesc('Hide UI chrome and collapse sidebars for distraction-free writing.')
			.addToggle(t => t.setValue(this.plugin.settings.zenMode)
				.onChange(async () => { await this.plugin.toggleZenMode(); this.display(); }));

		if (this.plugin.settings.zenMode) {
			const z = this.sub(containerEl);

			this.toggle(z, 'Full screen', 'Enter fullscreen when enabling zen mode.', 'fullscreen');

			new Setting(z).setName('Exit button').setDesc('When to show the exit button.')
				.addDropdown(d => d
					.addOption('always',      'Always')
					.addOption('mobile-only', 'Mobile only')
					.addOption('never',       'Never')
					.setValue(this.plugin.settings.exitButtonVisibility)
					.onChange(async v => { this.plugin.settings.exitButtonVisibility = v; await this.plugin.saveSettings(); }));

			this.toggle(z, 'Auto-hide exit button on desktop', 'Hide on desktop — hover to reveal.', 'autoHideButtonOnDesktop');
			this.toggle(z, 'Focused file mode', 'Only show the active file — hide all other panes.', 'focusedFileMode');

			this.label(z, 'Hide in zen mode');
			const hide = this.sub(z);
			this.toggle(hide, 'Properties',       'Hide note properties / frontmatter.',   'hideProperties');
			this.toggle(hide, 'Inline title',      'Hide the inline note title.',            'hideInlineTitle');
			this.toggle(hide, 'Native status bar', 'Hide Obsidian\'s built-in status bar.', 'hideStatusBar');
			this.toggle(hide, 'Linked mentions',   'Hide linked mentions panel.',            'hideLinkedMentions');
			this.toggle(hide, 'Scroll bar',        'Hide the editor scroll bar.',            'hideScrollBar');

			this.label(z, 'Padding');
			const pad = this.sub(z);
			this.slider(pad, 'Top',    'Extra space above editor content (0–100 px).', 'topPadding',    0, 100, 1);
			this.slider(pad, 'Bottom', 'Extra space below editor content (0–100 px).', 'bottomPadding', 0, 100, 1);
		}

		// ── Typewriter toggle + inline options ─────────────────────────────────
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
			const tw = this.sub(containerEl);

			this.slider(tw, 'Horizontal padding', 'Left/right text padding inside the editor.', 'editorPaddingH', 0, 400, 10);

			this.label(tw, 'Letterbox masks');
			this.toggle(tw, 'Enable letterbox', 'Top and bottom masks framing the writing area (active in zen mode).', 'enableLetterbox', () => this.display());

			if (this.plugin.settings.enableLetterbox) {
				const ls = this.sub(tw);

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
							this.plugin.settings._lastArrowCount = this.plugin.settings.arrowCount || 5;
							this.plugin.settings.arrowCount = v ? (this.plugin.settings._lastArrowCount || 5) : 0;
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
							.addOption('ascii',            '^  /  v  ASCII')
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
				containerEl.createEl('p', { text: 'Dark and light variants switch automatically with your theme.' }).style.cssText = 'font-size:0.82em;color:var(--text-muted);margin:0 0 6px 14px;';
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

		// ── Retro Bar toggle + inline options ──────────────────────────────────
		new Setting(containerEl)
			.setName('Retro status bar')
			.setDesc('Fixed retro-styled bar at the bottom. Auto-hides the native status bar while active.')
			.addToggle(t => t.setValue(this.plugin.settings.enableRetroStatus)
				.onChange(async v => {
					this.plugin.settings.enableRetroStatus = v;
					this.plugin.settings.hideStatusBar = v;
					document.body.classList.toggle('zenmode-hide-status-bar',
						this.plugin.settings.zenMode && v);
					this.plugin.updateStatusBar();
					this.plugin.updateRetroStatusBar();
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enableRetroStatus) {
			const rb = this.sub(containerEl);

			new Setting(rb).setName('Format').setDesc('Tokens: {file} {words} {chars} {time} {date} {battery} {paragraph} {goal}')
				.addText(t => t.setPlaceholder(DEFAULT_SETTINGS.statusFormatText)
					.setValue(this.plugin.settings.statusFormatText)
					.onChange(async v => { this.plugin.settings.statusFormatText = v || '{file}'; await this.plugin.saveSettings(); }));
			this.slider(rb, 'Font size', 'Font size (8–24 px).', 'statusBarFontSize', 8, 24, 1);
			this.slider(rb, 'Height',    'Bar height (20–60 px).', 'statusBarHeight',   20, 60, 1);
			this.toggle(rb, 'Top border', 'Coloured separator line above the bar.', 'statusBarBorder');

			this.label(rb, 'Writing goal');
			const gs = this.sub(rb);
			new Setting(gs).setName('Word target').setDesc('Target word count. Click the bar to reset the baseline.')
				.addText(t => {
					t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.style.width = '80px';
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
			const fmtRow = df.createEl('div');
			fmtRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px;';
			for (const fmt of ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd.mm.yy', 'dd-mm-yyyy', 'yyyy/mm/dd']) {
				const btn = fmtRow.createEl('button', { text: fmt });
				btn.style.cssText = 'font-family:monospace;font-size:11px;padding:2px 6px;cursor:pointer;';
				btn.addEventListener('click', async () => { this.plugin.settings.dateFormat = fmt; await this.plugin.saveSettings(); this.display(); });
			}
			df.createEl('small', { text: 'Preview: ' }).appendChild(preview);
			refreshPreview();

			// ── Colors (inside retro bar) ─────────────────────────────────────────
			this.label(rb, 'Colors');
			containerEl.createEl('p', { text: 'Dark and light variants switch automatically with your theme.' }).style.cssText = 'font-size:0.82em;color:var(--text-muted);margin:0 0 6px 14px;';

			this.label(rb, 'Dark theme');
			const dk = this.sub(rb);
			new Setting(dk).setName('Bar background').addColorPicker(cp => cp.setValue(this.plugin.settings.retroDarkBgColor).onChange(async v => { this.plugin.settings.retroDarkBgColor = v; await this.plugin.saveSettings(); }));
			new Setting(dk).setName('Bar text / accent').addColorPicker(cp => cp.setValue(this.plugin.settings.retroDarkTextColor).onChange(async v => { this.plugin.settings.retroDarkTextColor = v; await this.plugin.saveSettings(); }));

			this.label(rb, 'Light theme');
			const lt = this.sub(rb);
			new Setting(lt).setName('Bar background').addColorPicker(cp => cp.setValue(this.plugin.settings.retroLightBgColor).onChange(async v => { this.plugin.settings.retroLightBgColor = v; await this.plugin.saveSettings(); }));
			new Setting(lt).setName('Bar text / accent').addColorPicker(cp => cp.setValue(this.plugin.settings.retroLightTextColor).onChange(async v => { this.plugin.settings.retroLightTextColor = v; await this.plugin.saveSettings(); }));
		}

		// ── Misc Options (text options + word counts) ──────────────────────────
		containerEl.createEl('hr').style.cssText = 'margin:16px 0 8px;border:none;border-top:1px solid var(--background-modifier-border);';
		new Setting(containerEl)
			.setName('Misc options')
			.setDesc('Paragraph indent, line spacing, and sidebar word counts.')
			.addToggle(t => t.setValue(this.plugin.settings.miscEnabled)
				.onChange(async v => { this.plugin.settings.miscEnabled = v; await this.plugin.saveSettings(); this.display(); }));

		if (this.plugin.settings.miscEnabled) {
			const mc = this.sub(containerEl);

			this.label(mc, 'Text options');
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
					t.inputEl.type = 'number'; t.inputEl.min = '0.8'; t.inputEl.max = '4'; t.inputEl.step = '0.1'; t.inputEl.style.width = '60px';
					t.setValue(String(this.plugin.settings.lineSpacing != null ? this.plugin.settings.lineSpacing : 1.5));
					t.onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0.8 && n <= 4) { this.plugin.settings.lineSpacing = n; await this.plugin.saveSettings(); } });
				});

			this.label(mc, 'Word counts');
			this.toggle(mc, 'File tree word counts', 'Word count per note in the left sidebar, summed into folders.', 'enableFileTreeCounts', () => this.display());
			this.toggle(mc, 'Outline heading counts', 'Word count per heading section in the outline panel.', 'enableOutlineCounts', () => this.display());
		}
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	sub(root) {
		const el = root.createEl('div');
		el.style.cssText = 'border-left:2px solid var(--background-modifier-border);margin-left:12px;padding-left:12px;margin-top:4px;margin-bottom:8px;';
		return el;
	}

	label(root, text) {
		const p = root.createEl('p', { text });
		p.style.cssText = 'margin:12px 0 4px;font-weight:600;font-size:0.9em;color:var(--text-muted);';
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
				t.inputEl.type = 'number'; t.inputEl.min = String(min); t.inputEl.max = String(max); t.inputEl.style.width = '60px';
				t.setValue(String(this.plugin.settings[key]));
				t.onChange(async v => { const n = parseInt(v, 10); if (!isNaN(n) && n >= min && n <= max) { this.plugin.settings[key] = n; await this.plugin.saveSettings(); } });
			});
	}
}