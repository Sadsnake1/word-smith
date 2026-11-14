'use strict';
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const esbuild = require('esbuild');

const source = fs.readFileSync('src/organizer/organizer-table.ts', 'utf8');
const bundle = esbuild.buildSync({
	stdin: { contents: source + '\nexport { wsOrgDrawRows };', resolveDir: path.resolve('src/organizer'), sourcefile: 'organizer-table.ts', loader: 'ts' },
	bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false
});
const load = Module._load;
Module._load = function (name) {
	if (name === 'obsidian') return { TFile: class {}, Modal: class {}, Menu: class {}, Notice: class {}, ItemView: class {}, FuzzySuggestModal: class {}, Platform: {} };
	return load.apply(this, arguments);
};
const compiled = new Module('organizer-folder-click', module);
compiled._compile(bundle.outputFiles[0].text, 'organizer-folder-click.js');

class Element {
	constructor(tag = 'div', cls = '', parent = null) { this.tag = tag; this.cls = cls; this.parent = parent; this.children = []; this.listeners = {}; this.style = { setProperty() {} }; }
	createEl(tag, options = {}) { const child = new Element(tag, options.cls || '', this); this.children.push(child); return child; }
	createDiv(options = {}) { return this.createEl('div', options); }
	createSpan(options = {}) { return this.createEl('span', options); }
	setAttribute() {}
	setCssProps() {}
	remove() {}
	addClass() {}
	addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
	contains(node) { for (let el = node; el; el = el.parent) if (el === this) return true; return false; }
	closest(selector) {
		for (let el = this; el; el = el.parent) {
			if (selector.includes('.ws-org-twist') && el.cls.split(' ').includes('ws-org-twist')) return el;
			if (['button', 'input', 'select', 'textarea'].includes(el.tag)) return el;
		}
		return null;
	}
	click(options = {}) {
		const event = { target: this, button: 0, stopPropagation() { this.stopped = true; }, ...options };
		for (let el = this; el && !event.stopped; el = el.parent) for (const fn of el.listeners.click || []) fn(event);
	}
}

for (const narrow of [false, true]) {
	const tbody = new Element('tbody');
	let open = false;
	let toggles = 0;
	const ctx = {
		markOf: () => '', orgNote: '', orgIsOpen: () => open,
		orgOpenSet: (_path, next) => { open = next; toggles++; },
		orgChevron: (parent) => parent.createSpan({ cls: 'ws-org-twist' }),
		orgFolderIcon: () => {}, nameOf: () => 'Folder', orgNarrowNow: () => narrow,
		orgRowDrag: () => {}, orgGroupDrop: () => {}, orgGripReleasedAt: 0, ORG_GRIP_CLICK_MS: 100
	};
	compiled.exports.wsOrgDrawRows({}, { cols: [], ctx, lensed: false, nums: null, rooted: false, rows: [{ path: 'folder', kind: 'folder' }], tbody, wrap: new Element() });
	const row = tbody.children[0], name = row.children[0], inner = name.children[0], twist = inner.children[0], label = inner.children[1], other = row.children[1];
	name.click();
	assert.strictEqual(open, true, `empty name-cell space opens folder (narrow=${narrow})`);
	label.click();
	assert.strictEqual(open, false, 'name closes folder');
	twist.click();
	assert.strictEqual(open, true, 'chevron toggles only once');
	other.click();
	assert.strictEqual(toggles, 3, 'other cells do not fold the folder');
	name.click({ shiftKey: true });
	assert.strictEqual(toggles, 3, 'modified clicks do not fold the folder');
}
console.log('Organizer folder name-cell clicks passed');
