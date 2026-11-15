'use strict';
// Folder targets are either user-defined or calculated from counted descendant note targets. Saved manual values stay
// in the store while calculated mode is active. The vault's own Total row remains a count of saved targets (A752).
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
const targets = { 'book/a.md': 100, 'book/sub/b.md': 200, 'book/sub/c.md': 0 };
const folderTargets = {};
const excluded = new Set();
const settings = { folderTargets, folderTargetMode: 'calculated' };
const plugin = {
	_orgIndex: new Map([['book/a.md', { words: 40 }], ['book/sub/b.md', { words: 70 }], ['book/sub/c.md', { words: 10 }]]),
	settings,
	app: { vault: { getAbstractFileByPath: (p) => ({ path: p }) } },
	isFileCounted: (file) => !excluded.has(file.path),
	folderTargetFor: (p) => {
		if (settings.folderTargetMode !== 'calculated') return folderTargets[p] || 0;
		const prefix = p ? p + '/' : '';
		return Object.entries(targets).reduce((sum, [path, target]) =>
			path.startsWith(prefix) && plugin._orgIndex.has(path) && !excluded.has(path) ? sum + target : sum, 0);
	},
	orgTargetSay: (words, target) => `${words}/${target}`
};
const readings = compiled.exports.wsOrgReadingsMake({ plugin, targetOf: (p) => targets[p] || 0 });
const aggregate = (paths, folder) => readings.orgColAgg({ id: 'goal' }, paths, folder);
const all = ['book/a.md', 'book/sub/b.md', 'book/sub/c.md'];

// no target of its own: its notes' targets summed, against its counted words, marked as worked out
assert.deepStrictEqual(aggregate(all, 'book').goal, { words: 120, target: 300, derived: true });
assert.deepStrictEqual(aggregate(['book/sub/b.md', 'book/sub/c.md'], 'book/sub').goal, { words: 80, target: 200, derived: true });
assert.strictEqual(aggregate(['book/sub/c.md'], 'book/sub').goal.target, 200);
// THE VAULT'S TOTAL ROW is not a folder: it says how many targets are set (A752, the writer: "say x targets"), no sum
assert.strictEqual(aggregate(all, ''), null);
// calculated mode ignores stored folder targets, retaining them for a switch back to manual
folderTargets.book = 999;
assert.deepStrictEqual(aggregate(all, 'book').goal, { words: 120, target: 300, derived: true });
settings.folderTargetMode = 'manual';
assert.deepStrictEqual(aggregate(all, 'book').goal, { words: 120, target: 999 });
folderTargets['book/sub'] = 500;
assert.strictEqual(aggregate(all, 'book').goal.target, 999);
assert.strictEqual(aggregate(['book/sub/b.md', 'book/sub/c.md'], 'book/sub').goal.target, 500);
// a manually set folder target remains stored while calculated mode is selected
folderTargets['book/planned'] = 1000;
settings.folderTargetMode = 'calculated';
assert.strictEqual(aggregate(all, 'book').goal.target, 300);
assert.strictEqual(folderTargets['book'], 999);
assert.strictEqual(folderTargets['book/planned'], 1000);
// a changed note target moves the calculation
targets['book/sub/b.md'] = 350;
assert.strictEqual(aggregate(all, 'book').goal.target, 450);
// a folder left out of the counts adds nothing (the index holds none of its notes)
excluded.add('book/sub');
plugin._orgIndex.delete('book/sub/b.md'); plugin._orgIndex.delete('book/sub/c.md');
assert.deepStrictEqual(aggregate(['book/a.md'], 'book').goal, { words: 40, target: 100, derived: true });

// THE ROOT ROW with no target anywhere it can read: the count of targets, a click setting one (unchanged)
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
	addClass() {}
	remove() {}
}
const ctx = { orgUnder: () => ['a.md'], orgColAgg: () => null, colTextish: () => false,
	orgColStamp() {}, orgGoalCell(td, _row, text) { td.text = text; } };
const rootPlugin = { settings: { fileGoals: { 'a.md': 100 }, folderTargets: {} },
	app: { vault: { getAbstractFileByPath: () => ({}) } }, orgAggUnder: () => null };
table.exports.wsOrgDrawRoot(rootPlugin, { at: '', cols: [{ id: 'goal' }], ctx, orgLensEmptied: false, tbody: new Element(), wrap: new Element() });
const goal = ctx.orgRootRow.children[1];
assert.strictEqual(goal.text, '1 target');
assert.strictEqual(goal.title || '', 'Click to set a target');
console.log('Organizer target aggregation passed');
