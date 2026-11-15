'use strict';
const assert = require('assert');
const Module = require('module');
const esbuild = require('esbuild');

const result = esbuild.buildSync({
	entryPoints: ['src/organizer/organizer-drag.ts'],
	bundle: true,
	platform: 'node',
	format: 'cjs',
	external: ['obsidian'],
	write: false
});
const load = Module._load;
Module._load = function (name) {
	if (name === 'obsidian') return { setIcon() {} };
	return load.apply(this, arguments);
};
const compiled = new Module('organizer-drag-test', module);
compiled._compile(result.outputFiles[0].text, 'organizer-drag-test.js');

class Row {
	constructor(top = 0) { this.top = top; this.listeners = new Map(); this.classes = new Set(); }
	addEventListener(name, fn) {
		const list = this.listeners.get(name) || [];
		list.push(fn);
		this.listeners.set(name, list);
	}
	emit(name, event) { for (const fn of this.listeners.get(name) || []) fn(event); }
	setAttribute() {}
	addClass(name) { this.classes.add(name); }
	removeClass(name) { this.classes.delete(name); }
	getBoundingClientRect() { return { top: this.top, height: 100 }; }
}

const setup = (treeMoveInto) => {
	const orders = { two: ['two/B.md', 'two/C.md'] };
	const calls = [];
	const plugin = {
		treeMoveInto: async (path, folder) => {
			calls.push(['move', path, folder]);
			return treeMoveInto(path, folder, orders);
		},
		treeOrderCurrent: (folder) => [...(orders[folder] || [])],
		treeOrderMove: async (folder, moved, before) => {
			calls.push(['order', folder, moved, before]);
			const items = orders[folder];
			items.splice(items.indexOf(moved), 1);
			const at = before === null ? items.length : items.indexOf(before);
			items.splice(at < 0 ? items.length : at, 0, moved);
			return true;
		},
		touchDrag() {}
	};
	const panel = { querySelectorAll: () => [] };
	const messages = [];
	const drag = compiled.exports.wsOrgDragMake({
		plugin,
		folderOf: (path) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
		nameOf: (path) => path.split('/').pop(),
		panel,
		said: (...args) => messages.push(args)
	});
	return { orders, calls, messages, drag };
};
const beginDrag = (drag, source, sourceRow) => {
	drag.orgRowDrag(source, sourceRow);
	source.emit('dragstart', { dataTransfer: { setData() {} } });
};
const event = (y, preventDefault = () => {}) => ({
	clientY: y,
	preventDefault,
	dataTransfer: { set dropEffect(value) {} }
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

(async () => {
	const success = setup(async (path, folder, orders) => {
		const dest = `${folder}/${path.split('/').pop()}`;
		orders[folder].push(dest);
		return { ok: true, dest };
	});
	const source = new Row();
	const target = new Row();
	beginDrag(success.drag, source, { path: 'one/AA.md', parent: 'one', kind: 'file' });
	success.drag.orgRowDrag(target, { path: 'two/B.md', parent: 'two', kind: 'file' });
	let accepted = false;
	target.emit('dragover', event(75, () => { accepted = true; }));
	assert.strictEqual(accepted, true, 'cross-folder Markdown row accepts a drop');
	target.emit('drop', event(75));
	await tick();
	assert.deepStrictEqual(success.calls, [
		['move', 'one/AA.md', 'two'],
		['order', 'two', 'two/AA.md', 'two/C.md']
	]);
	assert.deepStrictEqual(success.orders.two, ['two/B.md', 'two/AA.md', 'two/C.md']);
	assert.strictEqual(success.messages.length, 1, 'successful placement is reported');

	const refused = setup(async () => ({ ok: false, said: 'Name already exists.' }));
	const refusedSource = new Row();
	const refusedTarget = new Row();
	beginDrag(refused.drag, refusedSource, { path: 'one/AA.md', parent: 'one', kind: 'file' });
	refused.drag.orgRowDrag(refusedTarget, { path: 'two/B.md', parent: 'two', kind: 'file' });
	refusedTarget.emit('drop', event(25));
	await tick();
	assert.deepStrictEqual(refused.calls, [['move', 'one/AA.md', 'two']], 'move refusal prevents reordering');
	assert.deepStrictEqual(refused.messages, [['Name already exists.', true]], 'move refusal is surfaced');

	const into = setup(async (path, folder) => ({ ok: true, dest: `${folder}/${path.split('/').pop()}` }));
	const intoSource = new Row();
	const folder = new Row();
	beginDrag(into.drag, intoSource, { path: 'one/AA.md', parent: 'one', kind: 'file' });
	into.drag.orgRowDrag(folder, { path: 'two/Folder', parent: 'two', kind: 'folder' });
	into.drag.orgGroupDrop(folder, 'two/Folder');
	let acceptedInto = false;
	folder.emit('dragover', event(50, () => { acceptedInto = true; }));
	assert.strictEqual(acceptedInto, true, 'folder middle still accepts move-into');
	folder.emit('drop', event(50));
	await tick();
	assert.deepStrictEqual(into.calls, [['move', 'one/AA.md', 'two/Folder']], 'folder-middle drop stays a move-into action');
	assert.strictEqual(into.messages.length, 1);

	for (const kind of ['file', 'folder']) {
		for (const y of [10, 50, 90]) {
			const same = setup(async () => { throw new Error('a self-drop must never move anything'); });
			const row = new Row();
			const path = kind === 'folder' ? 'one/Folder' : 'one/AA.md';
			beginDrag(same.drag, row, { path, parent: 'one', kind });
			if (kind === 'folder') same.drag.orgGroupDrop(row, path);
			let geometryReads = 0;
			row.getBoundingClientRect = () => { geometryReads++; return { top: 0, height: 100 }; };
			let acceptedSelfDrop = false;
			row.emit('dragover', event(y, () => { acceptedSelfDrop = true; }));
			assert.strictEqual(acceptedSelfDrop, true, 'the source row must accept the drop so the browser does not cancel the drag');
			row.emit('drop', event(y));
			assert.strictEqual(row.classes.has('is-dragging'), false, 'the source row is restored immediately on drop');
			await tick();
			assert.deepStrictEqual(same.calls, [], `${kind} self-drop at ${y} must not move or reorder`);
			assert.deepStrictEqual(same.messages, [], 'a self-drop should not produce a message');
			assert.strictEqual(geometryReads, 0, 'a self-drop must not calculate drop placement');
		}
	}
	console.log('Organizer cross-folder row drop passed (placement, refusal, folder-middle behavior)');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
