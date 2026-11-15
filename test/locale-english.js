'use strict';
const assert = require('assert');
const esbuild = require('esbuild');
const Module = require('module');
const path = require('path');

async function main() {
const { options } = await import('../esbuild.config.mjs');
const result = await esbuild.build({
	...options(false), entryPoints: undefined, outfile: undefined, logLevel: 'silent',
	stdin: { contents: "export { wsUiPick, wsUiPickForApp, wsUiSet, wsUiLang, wsUiLocale, wsUiMissed, wsT, wsTIn } from './src/core/ui-text'; export { wsRegisterCommands } from './src/plugin/plugin'; export { storesMethods } from './src/plugin/stores';", resolveDir: path.resolve('.'), loader: 'ts' },
	bundle: true, platform: 'node', format: 'cjs', external: ['obsidian', '@codemirror/*'], write: false
});
const load = Module._load;
let appLanguage = 'en';
Module._load = function (name) {
	if (name === 'obsidian') return { Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, Modal: class {}, Menu: class {}, MarkdownView: class {}, TFile: class {}, TFolder: class {}, ItemView: class {}, FuzzySuggestModal: class {}, Notice: class {}, Component: class {}, Events: class {}, Platform: {}, getLanguage: () => appLanguage, setIcon() {}, addIcon() {} };
	if (name.startsWith('@codemirror/')) return {};
	return load.apply(this, arguments);
};
const bundle = new Module('locale-english-test', module);
bundle._compile(result.outputFiles[0].text, 'locale-english-test.js');
const ui = bundle.exports;
global.document = {};
const british = require('../locales/en-GB.json');
for (const [source, translation] of Object.entries(british)) {
	assert.deepStrictEqual((translation.match(/\{\w+\}/g) || []).sort(), (source.match(/\{\w+\}/g) || []).sort(), `placeholders in ${source}`);
}
assert.strictEqual(ui.wsUiPickForApp('en', 'en-NZ'), 'en-NZ');
assert.strictEqual(ui.wsUiPickForApp('en', 'en_GB'), 'en-GB');
assert.strictEqual(ui.wsUiPickForApp('en', 'en-US'), '');
assert.strictEqual(ui.wsUiPickForApp('en', 'fr-FR'), '');
assert.strictEqual(ui.wsUiPickForApp('fr', 'en-NZ'), 'fr', 'Obsidian language takes priority');
assert.strictEqual(ui.wsUiPickForApp('en-US', 'en-NZ'), '', 'an explicit US preference takes priority');
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-NZ' }, configurable: true });
ui.storesMethods.uiApply.call({});
assert.strictEqual(ui.wsT('Organizer'), 'Organiser', 'the plugin uses the preferred regional English');
appLanguage = 'fr';
ui.storesMethods.uiApply.call({});
assert.strictEqual(ui.wsUiLang(), 'fr', 'the plugin respects an explicitly selected app language');
for (const locale of ['en-GB', 'en-NZ']) {
	ui.wsUiSet(ui.wsUiPick(locale));
	assert.strictEqual(ui.wsUiLang(), locale);
	assert.strictEqual(ui.wsUiLocale(), locale);
	assert.strictEqual(ui.wsT('Organizer'), 'Organiser');
	assert.strictEqual(ui.wsT('Colors'), 'Colours');
	assert.strictEqual(ui.wsT('Center headings'), 'Centre headings');
	assert.strictEqual(ui.wsT('Open the Organizer'), 'Open the Organiser');
	assert.strictEqual(ui.wsT('For every date the Organizer shows. A file time reads: {stamp}', { stamp: '22/01/1999' }), 'For every date the Organiser shows. A file time reads: 22/01/1999');
	assert.strictEqual(ui.wsT(ui.wsT('Organizer')), 'Organiser', 'a second translation pass is stable');
	assert.strictEqual(ui.wsT('An unchanged English sentence'), 'An unchanged English sentence');
	assert.deepStrictEqual(ui.wsUiMissed(), [], 'unchanged English is expected in a regional spelling table');
	assert.strictEqual(ui.wsTIn(locale, 'Organizer'), 'Organiser');
	const commands = [];
	ui.wsRegisterCommands({ addCommand: (command) => commands.push(command), registerDomEvent() {} });
	assert.strictEqual(commands.find((c) => c.id === 'open-manuscript').name, 'Open the Organiser');
}
ui.wsUiSet(ui.wsUiPickForApp('en', 'en-US'));
assert.strictEqual(ui.wsT('Organizer'), 'Organizer');
assert.strictEqual(ui.wsT('Colors'), 'Colors');
const WordSmith = require('../main.js').default;
const shipped = Object.create(WordSmith.prototype);
appLanguage = 'en';
for (const [preferred, expected] of [['en-NZ', 'Organiser'], ['en-GB', 'Organiser'], ['en-US', 'Organizer']]) {
	Object.defineProperty(globalThis, 'navigator', { value: { language: preferred }, configurable: true });
	shipped.uiApply();
	assert.strictEqual(shipped.menuRowSpecs().find((row) => row.id === 'organizer').label, expected, `shipped plugin, ${preferred}`);
}
console.log('British and New Zealand English localisation passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
