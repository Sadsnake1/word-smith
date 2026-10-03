// Exercise the shipped plugin's settings and chrome lifecycle. Only unrelated
// rendering and the Obsidian storage boundary are stubbed; no vault is written.
module.exports = async (WordSmith, is) => {
	const plugin = Object.create(WordSmith.prototype);
	let saved = { zenEnabled: true, zenMode: true, hideInlineTitle: false };
	plugin.loadData = async () => JSON.parse(JSON.stringify(saved));
	plugin.saveData = async (data) => { saved = JSON.parse(JSON.stringify(data)); };
	plugin.historyBaselines = () => {};
	for (const name of ['storeWriteOk', 'flagsApply', 'goalsFileSync', 'settingsMirrorSync', 'scheduleRefresh']) {
		plugin[name] = () => {};
	}
	await plugin.loadSettings();
	is('an existing vault defaults to keeping the window title', plugin.settings.zenHideWindowTitle, false);
	plugin.settings.zenHideWindowTitle = true;
	await plugin.saveSettings();
	await plugin.loadSettings();
	is('hide window title survives the normal save/load path', plugin.settings.zenHideWindowTitle, true);
	plugin.applyBarSnapshot({ zenHideWindowTitle: false });
	is('a Powerline preset cannot overwrite hide window title', plugin.settings.zenHideWindowTitle, true);
	is('hide window title does not change the inline-title preference', plugin.settings.hideInlineTitle, false);

	const makeClasses = (...initial) => {
		const values = new Set(initial);
		return {
			contains: (name) => values.has(name),
			add: (...names) => names.forEach((name) => values.add(name)),
			remove: (...names) => names.forEach((name) => values.delete(name)),
			toggle: (name, on) => { if (on) values.add(name); else values.delete(name); },
		};
	};
	const makeElement = (...classes) => ({
		classList: makeClasses(...classes),
		style: { length: 0, removeProperty() {} },
		setAttribute() {}, removeAttribute() {},
	});
	const body = makeElement('titlebar-text-off'); // Baseline owns this class.
	const titlebar = makeElement('titlebar');
	const originalDocument = global.document;
	global.document = {
		body,
		documentElement: makeElement(),
		querySelector: (selector) => selector === '.titlebar'
			|| (selector === '.titlebar.ws-main-titlebar' && titlebar.classList.contains('ws-main-titlebar'))
			? titlebar : null,
		querySelectorAll: () => [],
	};
	let noteSurface = true;
	plugin.isNoteSurfaceActive = () => noteSurface;
	plugin.opt = (key) => plugin.settings[key];
	plugin.isActiveFileInScope = () => false;
	plugin.shouldHideNativeStatusBar = plugin.shouldHideScrollBar = plugin.layoutOn = () => false;
	plugin.textOpt = () => false;
	plugin.isIosApp = plugin.isRightToLeft = plugin.barIsHidden = () => false;
	for (const name of ['applyTorchVars', 'applyThemeClass', 'applyThemeVars', 'syncBarPeekState', 'setWindowControlColours']) {
		plugin[name] = () => {};
	}
	const hidden = () => body.classList.contains('ws-zen-hide-window-title');
	try {
		plugin.applyBodyClasses();
		is('Zen hides the main title even outside the text-folder scope', hidden(), true);
		is('the existing main-window titlebar marker is applied', titlebar.classList.contains('ws-main-titlebar'), true);
		plugin.settings.zenHideWindowTitle = false;
		plugin.applyBodyClasses();
		is('turning the option off removes our hiding effect', hidden(), false);
		is('turning the option off preserves Baseline hiding', body.classList.contains('titlebar-text-off'), true);
		plugin.settings.zenHideWindowTitle = true;
		plugin.settings.zenEnabled = false;
		plugin.applyBodyClasses();
		is('the preference alone does not hide the title outside Zen', hidden(), false);
		plugin.settings.zenEnabled = true;
		plugin.applyBodyClasses();
		is('re-entering Zen restores the hiding effect', hidden(), true);
		noteSurface = false;
		plugin.applyBodyClasses();
		is('a non-note surface suspends title hiding', hidden(), false);
		noteSurface = true;
		plugin.applyBodyClasses();
		is('returning to a note restores title hiding', hidden(), true);
		plugin.clearAllBodyState();
		is('plugin cleanup removes title hiding', hidden(), false);
		is('plugin cleanup preserves Baseline hiding', body.classList.contains('titlebar-text-off'), true);
		is('plugin cleanup removes the main-window marker', titlebar.classList.contains('ws-main-titlebar'), false);
	} finally {
		if (originalDocument === undefined) delete global.document;
		else global.document = originalDocument;
	}
};
