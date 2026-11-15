'use strict';
const assert = require('assert');
const Module = require('module');

const stub = {
	Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, Modal: class {}, Menu: class {},
	MarkdownView: class {}, TFile: class {}, TFolder: class {}, ItemView: class {}, FuzzySuggestModal: class {},
	Notice: class {}, Component: class {}, Events: class {}, setIcon() {}, addIcon() {},
	sanitizeHTMLToDom() {}, normalizePath: (p) => p, Platform: {}
};
const originalLoad = Module._load;
Module._load = function (name) {
	if (name === 'obsidian') return stub;
	if (/^@codemirror\//.test(name)) return {};
	return originalLoad.apply(this, arguments);
};
const WordSmith = require('../main.js').default;
const plugin = Object.create(WordSmith.prototype);
plugin.settings = { flags: [{ id: 'outline', exclude: true }], fileStatus: { 'notes.md': 'outline', 'chapter.md': 'draft' } };
plugin.isStoreFile = () => false;
plugin.isFileInScope = () => true;
assert.strictEqual(plugin.flagNotCounted('notes.md'), true);
assert.strictEqual(plugin.isPathNumbered('notes.md'), true);
assert.strictEqual(plugin.isFileCounted({ path: 'notes.md' }), false);
assert.strictEqual(plugin.isFileCounted({ path: 'chapter.md' }), true);
plugin.settings.flags = [{ id: 'outline', exclude: false }];
assert.strictEqual(plugin.flagNotCounted('notes.md'), false);
assert.strictEqual(plugin.isFileCounted({ path: 'notes.md' }), true);

(async () => {
	const recovering = Object.create(WordSmith.prototype);
	recovering.settings = { fileStatus: {} };
	recovering._orgIndex = new Map();
	recovering._orgIndexBuild = null;
	recovering.structureStore = () => ({});
	recovering.goalsStoreAdopt = () => ({ fileGoals: {}, fileStatus: { 'notes.md': 'outline' } });
	recovering.colorsStoreAdopt = () => null;
	recovering.userColsStoreAdopt = () => null;
	recovering.goalDatesStoreAdopt = () => ({});
	recovering.goalsSignature = () => 'changed';
	recovering.saveSettings = async () => {};
	recovering._orgIndexRing = () => {};
	let finishFirst;
	let sweeps = 0;
	recovering.orgIndexSweep = async () => {
		if (++sweeps === 1) {
			await new Promise((resolve) => { finishFirst = resolve; });
			recovering._orgIndex.set('notes.md', { words: 900 });
		} else recovering._orgIndex.delete('notes.md');
		return recovering._orgIndex;
	};
	const first = recovering.orgIndexResweep();
	recovering.structureAdoptSettings();
	finishFirst();
	await first;
	await new Promise((resolve) => setImmediate(resolve));
	assert.strictEqual(recovering._orgIndex.has('notes.md'), false, 'flags adopted during a sweep trigger a fresh sweep');
	assert.strictEqual(sweeps, 2);
	global.document = { body: { classList: { contains: () => false }, style: { setProperty() {} } } };
	const switched = Object.create(WordSmith.prototype);
	switched.settings = { flags: [{ id: 'outline', exclude: false }], fileStatus: {} };
	switched._orgIndex = new Map();
	switched._orgIndexBuild = null;
	switched._orgIndexRing = () => {};
	switched.explorerWanted = () => false;
	switched.flagsApply();
	let releaseSweep;
	let switchSweeps = 0;
	switched.orgIndexSweep = async () => {
		if (++switchSweeps === 1) {
			await new Promise((resolve) => { releaseSweep = resolve; });
			switched._orgIndex.set('notes.md', { words: 900 });
		} else switched._orgIndex.delete('notes.md');
		return switched._orgIndex;
	};
	const running = switched.orgIndexResweep();
	switched.settings.flags[0].exclude = true;
	switched.flagsApply();
	releaseSweep();
	await running;
	await new Promise((resolve) => setImmediate(resolve));
	assert.strictEqual(switched._orgIndex.has('notes.md'), false, 'a flag setting changed during a sweep triggers a fresh sweep');
	assert.strictEqual(switchSweeps, 2);
	console.log('Organizer flag membership refresh passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
