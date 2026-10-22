// Word-Smith — ext-paragraphs: the paragraph indent, as a line decoration. One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM, isParagraphLine } from '../core/preamble';
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type WordSmith from '../plugin/plugin';
import type { Extension } from '@codemirror/state';

export function wsParagraphExtension(plugin: WordSmith, cm: NonNullable<typeof CM>): Extension[] {
	const { ViewPlugin, Decoration } = cm;

	// ── Paragraph indent ──────────────────────────────────────────────────
	// Previously a MutationObserver stamped .ws-para-first onto rendered
	// .cm-line nodes based only on blank-line adjacency, so bullets, tasks,
	// headings, quotes and table rows all got indented alongside prose.
	// As a decoration it works from the document instead of the DOM, which
	// also means it sees lines CodeMirror has scrolled out of existence.
	const paraFirstDeco   = Decoration.line({ class: 'ws-para-first' });
	const paraBodyDeco    = Decoration.line({ class: 'ws-para-line'  });
	const paraPendingDeco = Decoration.line({ class: 'ws-para-pending' });

	// ── THE EMPTY LINE UNDER A CARET IS INDENTED ALREADY (A507) ──────────
	// A blank line is not a paragraph, so it wore no spacer, and the caret on
	// it sat at the line's edge: the first letter typed brought the indent with
	// it and the text jumped 4em from where the caret had been (and Cursor-
	// Smith's cursor, its ink and its glide with it). So an empty line with a
	// caret on it wears the spacer it WILL have — getParagraphLines' own rule,
	// asked of the line as if the letter were in it — under a class of its
	// own, so it is a paragraph nowhere else: not to the numbers, the marks,
	// the report or the counts. Every cursor, the main one or not. Returns the
	// line numbers, ascending.
	const pendingLines = (view: EditorView, info: { body: Set<unknown>; first: Set<unknown> }, single: boolean): number[] => {
		const doc = view.state.doc;
		if (doc.length > 400000) return [];   // getParagraphLines indents nothing past this
		const out: number[] = [];
		let skip: Set<unknown> | null = null;
		for (const r of view.state.selection.ranges) {
			const line = doc.lineAt(r.head);
			if (line.text.trim() !== '' || out.indexOf(line.number) !== -1) continue;
			if (!r.empty && doc.lineAt(r.anchor).number !== line.number) continue;
			const col = r.head - line.from;
			if (!isParagraphLine(line.text.slice(0, col) + 'x' + line.text.slice(col))) continue;
			if (!skip) skip = plugin.getNonProseLines(doc);
			if (skip.has(line.number)) continue;
			if (!single) {
				// "first": the line above is blank, not prose, or the note's
				// start — and a paragraph came before it. Otherwise the letter
				// would continue the paragraph above, and a continuation is
				// not indented.
				const n = line.number;
				const above = n > 1 ? doc.line(n - 1) : null;
				const prevBlank = !above || skip.has(n - 1)
					|| (!info.body.has(n - 1) && above.text.trim() === '');
				// the set is filled in line order: its first entry is the
				// note's first paragraph line
				let firstBody = Infinity;
				for (const b of info.body) { firstBody = Number(b); break; }
				if (!prevBlank || firstBody >= n) continue;
			}
			out.push(line.number);
		}
		return out.sort((a, b) => a - b);
	};

	const paraPlugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		pending = '';
		constructor(view: EditorView) { this.decorations = this.build(view); }
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) { this.decorations = this.build(u.view); return; }
			// A caret moved: rebuilt only when the empty lines under the
			// carets are other lines than they were (an arrow along a line
			// with text costs a blank-line check, nothing more).
			if (u.selectionSet && this.pendingKey(u.view) !== this.pending) this.decorations = this.build(u.view);
		}
		on(view: EditorView) {
			return !!plugin.settings.pluginEnabled && plugin.textOpt('enableParagraphIndent', false) && plugin.isEditorInScope(view);
		}
		pendingKey(view: EditorView) {
			if (!this.on(view)) return '';
			return pendingLines(view, plugin.getParagraphLines(view.state.doc), plugin.settings.paragraphIndentMode === 'single').join(',');
		}
		build(view: EditorView) {
			this.pending = '';
			if (!this.on(view)) return Decoration.none;
			const s = plugin.settings;

			const doc    = view.state.doc;
			const info   = plugin.getParagraphLines(doc);
			const single = s.paragraphIndentMode === 'single';
			const wanted = single ? info.body : info.first;
			const deco   = single ? paraBodyDeco : paraFirstDeco;
			const out    = [];

			for (const range of view.visibleRanges) {
				let pos = range.from;
				while (pos <= range.to) {
					const line = doc.lineAt(pos);
					pos = line.to + 1;
					if (wanted.has(line.number)) out.push(deco.range(line.from));
				}
			}
			const pending = pendingLines(view, info, single);
			for (const n of pending) out.push(paraPendingDeco.range(doc.line(n).from));
			this.pending = pending.join(',');
			return Decoration.set(out, true);
		}
	}, { decorations: v => v.decorations });

	return [paraPlugin];
}
