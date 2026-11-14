'use strict';
const assert = require('assert');
const Module = require('module');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Exercise the actual Organizer readings with the Obsidian runtime stubbed.
const result = esbuild.buildSync({ entryPoints: ['src/organizer/organizer-readings.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false });
const load = Module._load;
Module._load = function (name) {
	if (name === 'obsidian') return { TFile: class {} };
	return load.apply(this, arguments);
};
const compiled = new Module('organizer-readings-test', module);
compiled._compile(result.outputFiles[0].text, 'organizer-readings-test.js');
const targets = { 'a.md': 100, 'sub/b.md': 200, 'sub/c.md': 0 };
const excluded = new Set();
const plugin = {
	_orgIndex: new Map([['a.md', { words: 40 }], ['sub/b.md', { words: 70 }], ['sub/c.md', { words: 10 }]]),
	settings: { orgFolderTargetSum: true },
	app: { vault: { getAbstractFileByPath: (path) => ({ path }) } },
	isFileCounted: (file) => !excluded.has(file.path),
	folderTargetFor: () => 999,
	orgTargetSay: (words, target) => `${words}/${target}`
};
const readings = compiled.exports.wsOrgReadingsMake({ plugin, targetOf: (path) => targets[path] || 0 });
const aggregate = (paths, folder) => readings.orgColAgg({ id: 'goal' }, paths, folder);
assert.deepStrictEqual(aggregate(['a.md', 'sub/b.md', 'sub/c.md'], '').goal, { words: 120, target: 300 });
assert.deepStrictEqual(aggregate(['sub/b.md', 'sub/c.md'], 'sub').goal, { words: 80, target: 200 });
assert.strictEqual(aggregate(['sub/c.md'], 'sub'), null);
plugin.settings.orgFolderTargetSum = false;
assert.strictEqual(aggregate(['a.md', 'sub/b.md'], '').goal.target, 999);
plugin.settings.orgFolderTargetSum = true;
targets['sub/b.md'] = 350;
assert.strictEqual(aggregate(['a.md', 'sub/b.md'], '').goal.target, 450);
plugin._orgIndex.delete('sub/b.md');
excluded.add('sub/b.md');
assert.deepStrictEqual(aggregate(['a.md', 'sub/b.md'], '').goal, { words: 40, target: 100 });
excluded.delete('sub/b.md');
plugin._orgIndex.set('sub/b.md', { words: 70 });
assert.deepStrictEqual(aggregate(['a.md', 'sub/b.md'], '').goal, { words: 110, target: 450 });
const tableBundle = esbuild.buildSync({
	stdin: { contents: fs.readFileSync('src/organizer/organizer-table.ts', 'utf8') + '\nexport { wsOrgDrawRoot };', resolveDir: path.resolve('src/organizer'), loader: 'ts' },
	bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false
});
const table = new Module('organizer-root-test', module);
table._compile(tableBundle.outputFiles[0].text, 'organizer-root-test.js');
class Element {
	constructor() { this.children = []; }
	createEl() { const child = new Element(); this.children.push(child); return child; }
	createDiv() { return this.createEl(); }
	createSpan() { return this.createEl(); }
	setAttribute() {}
	setCssProps() {}
	remove() {}
}
for (const summed of [false, true]) {
	const ctx = { orgUnder: () => ['a.md'], orgColAgg: () => null, colTextish: () => false,
		orgColStamp() {}, orgGoalCell(td, _row, text) { td.text = text; } };
	const rootPlugin = { settings: { orgFolderTargetSum: summed, fileGoals: { 'a.md': 100 }, folderTargets: {} },
		app: { vault: { getAbstractFileByPath: () => ({}) } }, orgAggUnder: () => null };
	table.exports.wsOrgDrawRoot(rootPlugin, { at: '', cols: [{ id: 'goal' }], ctx, orgLensEmptied: false, tbody: new Element(), wrap: new Element() });
	const goal = ctx.orgRootRow.children[1];
	assert.strictEqual(goal.text, summed ? '' : '1 target');
	assert.strictEqual(goal.title || '', summed ? '' : 'Click to set a target');
}
console.log('Organizer target aggregation passed');
