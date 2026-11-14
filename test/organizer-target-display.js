'use strict';
const assert = require('assert');
const Module = require('module');
const esbuild = require('esbuild');
const original = Module._load;
Module._load = function (name) { if (name === 'obsidian') return { TFile: class {} }; return original.apply(this, arguments); };
const result = esbuild.buildSync({ entryPoints: ['src/organizer/organizer-cells.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false });
const compiled = new Module('organizer-target-display', module);
compiled._compile(result.outputFiles[0].text, 'organizer-target-display.js');
class Cell {
	constructor() { this.children = []; this.listeners = []; this.style = { setProperty() {}, removeProperty() {} }; }
	setText(text) { this.text = text; }
	empty() { this.text = ''; this.children = []; }
	createSpan(options) { this.children.push(options); return {}; }
	addClass() {}
	removeClass() {}
	toggleClass() {}
	addEventListener(name) { this.listeners.push(name); }
}
const cells = compiled.exports.wsOrgCellsMake({ plugin: { settings: {} }, goalStore: () => 'fileGoals', orgColRaw: (col) => col.id === 'words' ? 3506 : 2000 });
for (const kind of ['folder', 'file']) {
	const cell = new Cell();
	cells.orgGoalCell(cell, { kind, path: 'chapter.md' }, '3,506/2,000', kind === 'folder' ? { words: 3506, target: 2000 } : null);
	assert.deepStrictEqual(cell.children.map((item) => item.cls), ['ws-org-goal-current', 'ws-org-goal-separator', 'ws-org-goal-target']);
	assert.deepStrictEqual(cell.children.map((item) => item.text), ['3,506', ' / ', '2,000']);
	assert(cell.listeners.includes('click'));
	assert.match(cell.title, /3,506.*2,000/);
}
const percent = new Cell();
cells.orgGoalCell(percent, { kind: 'file', path: 'chapter.md' }, '175%');
assert.strictEqual(percent.text, '175%');
assert.deepStrictEqual(percent.children, []);
console.log('Organizer target display passed');
