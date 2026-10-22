// Word-Smith — ext-lines: line numbers, Typewriter's scroll, the current line underlined. One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM, scanNonProseLines } from '../core/preamble';
import type { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type WordSmith from '../plugin/plugin';
import type { Extension } from '@codemirror/state';

export function wsLineExtensions(plugin: WordSmith, cm: NonNullable<typeof CM>, ownsFocus: (view: EditorView) => boolean): Extension[] {
	const { ViewPlugin, Decoration, RangeSetBuilder } = cm;

	// ── Margin numbers ────────────────────────────────────────────────────
	// Line numbers (absolute or relative) and paragraph numbers, drawn
	// as a LINE DECORATION carrying the figure in a data attribute, with
	// CSS ::before reading it back out through attr().
	//
	// NOT a CM6 gutter, and that is the whole point of the design. A
	// gutter is a sibling of .cm-content pinned to the left edge of the
	// scroller, which means it knows nothing about anything this plugin
	// does to the text: Text Options' horizontal padding, Marginalia's
	// 8ch gutter, and above all Limit line length, which centres the
	// column with margin-inline auto. A gutter would sit far off at the
	// pane's edge while the prose floated in the middle — numbers
	// belonging to a column they are nowhere near. A decoration is ON
	// the line, so it travels with the column through every one of
	// those, and one CSS offset places it for all of them.
	const numberPlugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		constructor(view: EditorView) { this.decorations = this.build(view); }
		update(u: ViewUpdate) {
			// No selectionSet: paragraph numbers do not depend on where
			// the caret is. (The removed relative line numbers did, and
			// were the only reason this ever rebuilt on cursor movement.)
			if (u.docChanged || u.viewportChanged) {
				this.decorations = this.build(u.view);
			}
		}
		build(view: EditorView) {
			const b = new RangeSetBuilder<Decoration>();
			if (!plugin.textOpt('paragraphNumbers', false) || !plugin.isEditorInScope(view)) {
				return b.finish();
			}
			const doc = view.state.doc;

			// PARAGRAPH NUMBERS need the whole document, not the
			// viewport: paragraph seven is only the seventh if the six
			// above it were counted, and the six above it are usually
			// scrolled off. scanNonProseLines is the same helper the
			// word count uses, so "prose" means here exactly what it
			// means there — frontmatter, fences and maths are not it.
			const paraOf = new Map();
			{
				const lines = doc.toString().split('\n');
				const skip = scanNonProseLines(lines);
				let n = 0, open = false;
				for (let i = 0; i < lines.length; i++) {
					const ln = i + 1;
					const raw = lines[i];
					const t = raw.trim();
					// A blank line, or anything the counter skips, ends
					// the paragraph that was open.
					if (!t || skip.has(ln)) { open = false; continue; }
					// STRUCTURE IS NOT A PARAGRAPH. Headings, list items
					// and tasks, quotes and callouts, tables, and the
					// rules between sections all read as lines of prose
					// to a naive check and are none of them the thing an
					// editor means by "the third paragraph".
					if (/^(#{1,6}\s|>|\||\s*([-*+]\s|\d+[.)]\s)|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(raw)) {
						open = false;
						continue;
					}
					// A paragraph is numbered at its FIRST line only —
					// the wrapped continuation of one paragraph is not a
					// second paragraph.
					if (!open) { n++; open = true; paraOf.set(ln, n); }
				}
			}

			for (const { from, to } of view.visibleRanges) {
				let pos = from;
				while (pos <= to) {
					const line = doc.lineAt(pos);
					if (paraOf.has(line.number)) {
						b.add(line.from, line.from, Decoration.line({
							attributes: { 'data-ws-pnum': String(paraOf.get(line.number)) }
						}));
					}
					if (line.to + 1 <= pos) break;
					pos = line.to + 1;
				}
			}
			return b.finish();
		}
	}, { decorations: v => v.decorations });

	// ── Typewriter ────────────────────────────────────────────────────────
	// The editor the writer is in asks for the scroll on its own edits and
	// caret moves — typed, deleted, undone, an arrow, a Vim motion — and says
	// which it was: on iOS an edit's scroll waits for a pause in typing
	// (typewriterRequest). A pointer's selection is left to mouseup, so a drag
	// never scrolls under the pointer. On iOS a Backspace arrives as
	// `delete.backward` (CodeMirror replays the key after the native
	// deletion), a typed letter or a QuickType pick as `input.type`.
	const typewriterPlugin = ViewPlugin.fromClass(class {
		update(u: ViewUpdate) {
			if (!u.docChanged && !u.selectionSet) return;
			if (!ownsFocus(u.view)) return;
			if (!u.docChanged && u.transactions.some((tr) => tr.isUserEvent('select.pointer'))) return;
			// A SELECTION SET WHERE IT ALREADY WAS IS NO MOVE (#88, measured in the showcase): Obsidian dispatches the
			// selection again 50 ms after a click's release, with no userEvent, and it read as a keyboard move, so the
			// clicked line went to its rest whatever "Scroll when you click" said, under a double click's second press
			if (!u.docChanged && u.startState.selection.eq(u.state.selection)) return;
			const edit = u.docChanged && u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'));
			plugin.typewriterRequest(u.view, edit ? 'edit' : 'move');
		}
	});

	// ── The current line, underlined (#82) ───────────────────────────────
	// The tint fills the paragraph CodeMirror calls a line; a line UNDER it
	// belongs under the row the caret is on, as Typewriter Mode draws it (Davis
	// Riedel's, where the reporter came from), or a wrapped paragraph is
	// underlined at its foot, rows below the writing. The row's foot is
	// measured in CodeMirror's measure phase as an offset from the top of the
	// line's own box, less the line's width, and handed to the stylesheet as
	// --ws-line-ul-y on this editor. A row is as tall as the line height with
	// the glyphs centered in it, so its foot is the caret's bottom plus half the
	// leading. A position no line holds (an embed, a fold) leaves it unset,
	// and the stylesheet draws at the box's foot. A LINE ON TOP (A850, A852)
	// is drawn at the row's top, --ws-line-ol-y: the caret's top less half the
	// leading.
	const lineUnderPlugin = ViewPlugin.fromClass(class {
		view: EditorView;
		measure: { read: () => { ol: number; ul: number } | null; write: (y: { ol: number; ul: number } | null) => void };
		constructor(view: EditorView) {
			this.view = view;
			this.measure = { read: () => this.read(), write: (y) => this.write(y) };
			view.requestMeasure(this.measure);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.selectionSet || u.geometryChanged || u.viewportChanged || u.focusChanged) u.view.requestMeasure(this.measure);
		}
		destroy() { this.write(null); }
		read() {
			const view = this.view, s = plugin.settings;
			if (!s.highlightCurrentLine || s.lineHighlightStyle !== 'line') return null;
			// (only a note with Typewriter on draws the lines, A853: its pane wears `ws-scoped-tw`)
			if (!view.dom.closest('.ws-scoped-tw')) return null;
			const sel = view.state.selection.main;
			const c = view.coordsAtPos(sel.head, sel.assoc || 1);
			if (!c) return null;
			const at = view.domAtPos(view.state.doc.lineAt(sel.head).from).node;
			const el = at.nodeType === 1 ? at as Element : at.parentElement;
			const line = el ? el.closest('.cm-line') : null;
			if (!line) return null;
			const lh = parseFloat(getComputedStyle(line).lineHeight), glyphs = c.bottom - c.top;
			const half = lh > glyphs ? (lh - glyphs) / 2 : 0;
			const foot = c.bottom + half;
			const w = Math.min(3, Math.max(1, Math.round(Number(s.lineUnderlineWidth) || 2)));
			const top = line.getBoundingClientRect().top;
			return { ol: Math.max(0, Math.round(c.top - half - top)), ul: Math.round(foot - top) - w };
		}
		write(y: { ol: number; ul: number } | null) {
			const st = this.view.dom.style;
			if (y == null) { st.removeProperty('--ws-line-ul-y'); st.removeProperty('--ws-line-ol-y'); return; }
			st.setProperty('--ws-line-ul-y', y.ul + 'px');
			st.setProperty('--ws-line-ol-y', y.ol + 'px');
		}
	});

	return [numberPlugin, typewriterPlugin, lineUnderPlugin];
}
