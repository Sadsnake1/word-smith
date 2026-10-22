// Word-Smith — ext-counting: what History holds out of a note's count (pastes, drops, cuts), and the words a minute. One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM } from '../core/preamble';
import type { ViewUpdate } from '@codemirror/view';
import type { Text, Transaction } from '@codemirror/state';
import type WordSmith from '../plugin/plugin';
import type { Extension } from '@codemirror/state';

export function wsCountingExtensions(plugin: WordSmith, cm: NonNullable<typeof CM>): Extension[] {
	const { ViewPlugin } = cm;

	// ── Pasted and cut text, for History ──────────────────────────────────
	// A paste, a drop or a cut (and an undo or redo, which History matches to
	// the paste or cut it reverses) is reported as the words it added or took
	// away, so History can leave moved text out of the day's writing. Every
	// paste route in Obsidian, the Markdown it makes of copied HTML too, comes
	// labelled `input.paste`; a cut is `delete.cut`.
	// WHAT IS HELD IS WHAT THE NOTE'S OWN COUNT DID (the writer: "i paste this: k fds fjldskjf lksdj flkdsjf lkds jf and
	// the words in daily word target are reduced"). The pasted text counted on its own said 7 where the note gained 6,
	// its first word joined to the one before it, and the day lost the difference; inside a code block or frontmatter,
	// which the note's count leaves out, it lost all of it. So the note is counted before and after, each document once.
	const docWordsMemo = new WeakMap<Text, number>();
	const docWords = (doc: Text) => {
		let n = docWordsMemo.get(doc);
		if (n === undefined) { n = plugin.countWords(doc.toString()); docWordsMemo.set(doc, n); }
		return n;
	};
	// PASTED TEXT TAKEN OUT AGAIN (the writer: "check this weird behaviour more"): a paste deleted with a key, not Undo,
	// kept its hold while the deletion took the same words off, and the day lost them twice. Each editor keeps the runs
	// it pasted, for its note only (carried through every change, split where other text lands inside one), and a
	// deletion that takes pasted text is held as moved text for the share of its words that were pasted.
	const PASTED_RUNS_MAX = 200;
	type WsRun = { from: number; to: number };
	const historyHoldPlugin = ViewPlugin.fromClass(class {
		runs: WsRun[] = [];
		path: string | null = null;
		update(u: ViewUpdate) {
			if (!u.docChanged) return;
			const s = plugin.settings;
			if (!s.historyTracking || s.historyCountPasted === true) { this.runs = []; return; }
			const file = plugin.getFileForEditorView(u.view);
			const path = file ? file.path : null;
			// another note in this editor: the runs were the last one's
			if (path !== this.path) { this.path = path; this.runs = []; }
			for (const tr of u.transactions) {
				if (!tr.docChanged) continue;
				const paste = tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop');
				const kind = (paste || tr.isUserEvent('delete.cut')) ? 'move'
					: tr.isUserEvent('undo') ? 'undo' : tr.isUserEvent('redo') ? 'redo' : '';
				if (kind) {
					const net = docWords(tr.newDoc) - docWords(tr.startState.doc);
					if (net && path) plugin.historyHold(path, net, kind);
				} else if (path && this.runs.length && (tr.isUserEvent('delete') || tr.isUserEvent('input'))) {
					const taken = this.pastedTaken(tr);
					if (taken) plugin.historyHold(path, -taken, 'move');
				}
				if (this.runs.length || paste) this.carry(tr, paste);
			}
		}
		// the words a deletion took, times the share of the deleted text that was pasted
		pastedTaken(tr: Transaction) {
			let all = 0, pasted = 0;
			const cuts: [number, number][] = [];
			tr.changes.iterChanges((fromA: number, toA: number) => {
				if (toA <= fromA) return;
				cuts.push([fromA, toA]);
				all += toA - fromA;
				for (const r of this.runs) pasted += Math.max(0, Math.min(toA, r.to) - Math.max(fromA, r.from));
			});
			if (!pasted || !all) return 0;
			const old = tr.startState.doc;
			let rest = '', at = 0;
			for (const [f, t] of cuts) { rest += old.sliceString(at, f); at = t; }
			rest += old.sliceString(at);
			const words = docWords(old) - plugin.countWords(rest);
			return words > 0 ? Math.round(words * pasted / all) : 0;
		}
		// the runs into the new document, split where this change lands inside one; a paste's own text a new run
		carry(tr: Transaction, paste: boolean) {
			const points: number[] = [], gone: [number, number][] = [];
			tr.changes.iterChanges((fromA: number, toA: number) => { points.push(fromA, toA); if (toA > fromA) gone.push([fromA, toA]); });
			const next: WsRun[] = [];
			for (const r of this.runs) {
				const inside = points.filter((p) => p > r.from && p < r.to).sort((a, b) => a - b);
				let a = r.from;
				for (const p of inside.concat([r.to])) {
					// a piece the change took out is gone (CodeMirror maps a replaced span's start to its start, so mapped it
					// would become the text that replaced it)
					if (!gone.some(([f, t]) => f <= a && p <= t)) {
						const from = tr.changes.mapPos(a, 1), to = tr.changes.mapPos(p, -1);
						if (to > from) next.push({ from, to });
					}
					a = p;
				}
			}
			if (paste) tr.changes.iterChanges((_fromA: number, _toA: number, fromB: number, toB: number) => { if (toB > fromB) next.push({ from: fromB, to: toB }); });
			this.runs = next.length > PASTED_RUNS_MAX ? next.slice(next.length - PASTED_RUNS_MAX) : next;
		}
	});

	// ── {wpm}: THE TYPED CHARACTERS (A730), only while the token is on the bar: typing, never a paste, a drop or a
	// smart quote (`input.typography`); one property read per keystroke otherwise ──
	const wpmPlugin = ViewPlugin.fromClass(class {
		update(u: ViewUpdate) {
			if (!u.docChanged || !plugin._wpmWanted) return;
			let n = 0;
			for (const tr of u.transactions) {
				if (!tr.docChanged || !tr.isUserEvent('input.type')) continue;
				tr.changes.iterChanges((_fa: number, _ta: number, _fb: number, _tb: number, ins: Text) => { n += ins.length; });
			}
			if (n > 0) plugin.wpmTyped(n, Date.now());
		}
	});

	return [historyHoldPlugin, wpmPlugin];
}
