// Word-Smith — ext-dim-markers: focus dimming and the markers (tabs, spaces, line ends) as the editor draws them. One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM } from '../core/preamble';
import type { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type WordSmith from '../plugin/plugin';
import type { Extension } from '@codemirror/state';

export function wsDimMarkerExtensions(plugin: WordSmith, cm: NonNullable<typeof CM>, ownsFocus: (view: EditorView) => boolean): Extension[] {
	const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = cm;

	class InvisibleWidget extends WidgetType {
		text: string;
		constructor(text: string) { super(); this.text = text; }
		eq(other: InvisibleWidget) { return other.text === this.text; }
		toDOM() {
			const s = createSpan();
			s.className = 'ws-invisible';
			s.textContent = this.text;
			return s;
		}
		ignoreEvent() { return true; }
	}
	const PILCROW  = Decoration.widget({ widget: new InvisibleWidget('¶'), side: 1 });
	const NEWLINE  = Decoration.widget({ widget: new InvisibleWidget('↵'), side: 1 });
	const dimDeco   = Decoration.line({ class: 'ws-dim-line' });
	const dimText   = Decoration.mark({ class: 'ws-dim-text' });
	const spaceDeco = Decoration.mark({ class: 'ws-ws-space' });
	const tabDeco   = Decoration.mark({ class: 'ws-ws-tab' });
	const nbspDeco  = Decoration.mark({ class: 'ws-ws-nbsp' });

	// ── Focus dimming ─────────────────────────────────────────────────────
	const dimPlugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		constructor(view: EditorView) { this.decorations = this.build(view); }
		update(u: ViewUpdate) {
			if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
				this.decorations = this.build(u.view);
			}
		}
		build(view: EditorView) {
			const s = plugin.settings;
			// (the note's own ws-typewriter over the switch, A862)
			if (!s.pluginEnabled || !s.dimUnfocusedEnabled || !plugin.optForView(view, 'enableTypewriter')) return Decoration.none;
			if (!plugin.isEditorInScope(view)) return Decoration.none;
			// Nothing is "unfocused" when you are not in the editor at
			// all. Alt-tabbing away used to leave the whole note dimmed
			// around a cursor nobody was at; the plugin already rebuilds
			// on focusChanged, so this clears cleanly both ways.
			if (!ownsFocus(view)) return Decoration.none;
			const doc  = view.state.doc;
			const head = view.state.selection.main.head;
			const cur  = doc.lineAt(head);
			// Paragraph bounds (blank-line delimited) around the cursor.
			let pStart = cur.number, pEnd = cur.number;
			while (pStart > 1 && doc.line(pStart - 1).text.trim() !== '') pStart--;
			while (pEnd < doc.lines && doc.line(pEnd + 1).text.trim() !== '') pEnd++;
			// Focus range in absolute doc positions. Paragraph mode keeps
			// the whole paragraph; sentence mode narrows it to the sentence
			// under the cursor by scanning the paragraph text for sentence
			// terminators (., !, ?, …, optionally followed by closing
			// quotes/brackets, then whitespace or paragraph end).
			let focusFrom = doc.line(pStart).from;
			let focusTo   = doc.line(pEnd).to;
			if (s.dimFocusMode === 'sentence') {
				const paraText = doc.sliceString(focusFrom, focusTo);
				const rel = Math.min(Math.max(head - focusFrom, 0), paraText.length);
				const re = /[.!?\u2026]+["'\u201d\u2019)\]]*(\s+|$)/g;
				let sFrom = 0, sTo = paraText.length, m;
				while ((m = re.exec(paraText))) {
					const termEnd  = m.index + m[0].trimEnd().length;           // end of terminator
					const boundEnd = m.index + m[0].length;                     // after trailing whitespace
					if (boundEnd <= rel) { sFrom = boundEnd; }
					else { sTo = termEnd; break; }
				}
				focusTo   = focusFrom + sTo;   // compute before mutating focusFrom
				focusFrom = focusFrom + sFrom;
			}
			const b = new RangeSetBuilder<Decoration>();
			for (const range of view.visibleRanges) {
				let pos = range.from;
				while (pos <= range.to) {
					const line = doc.lineAt(pos);
					if (line.to < focusFrom || line.from > focusTo) {
						// Entirely outside the focus area → dim the whole line.
						b.add(line.from, line.from, dimDeco);
					} else {
						// Line overlaps the focus area (sentence mode) → dim
						// only the stretches of it outside the sentence.
						if (line.from < focusFrom) b.add(line.from, Math.min(focusFrom, line.to), dimText);
						if (focusTo < line.to)     b.add(Math.max(focusTo, line.from), line.to, dimText);
					}
					pos = line.to + 1;
				}
			}
			return b.finish();
		}
	}, { decorations: v => v.decorations });

	// ── Hidden markers ────────────────────────────────────────────────────
	const markerPlugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		constructor(view: EditorView) { this.decorations = this.build(view); }
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) {
				this.decorations = this.build(u.view);
			}
		}
		build(view: EditorView) {
			const s = plugin.settings;
			// ONE SWITCH: "Show hidden markers" (`markersEnabled`), then each
			// mark its own below.
			if (!s.pluginEnabled || !s.markersEnabled) return Decoration.none;
			if (!plugin.isEditorInScope(view)) return Decoration.none;
			const showSp  = s.markSpaces, showTab = s.markTabs, showNb = s.markNoBreak;
			const showPar = s.markParagraphs, showEol = s.markEndOfLines;
			if (!showSp && !showTab && !showNb && !showPar && !showEol) return Decoration.none;
			const doc  = view.state.doc;
			const b    = new RangeSetBuilder<Decoration>();
			const wsRe = /[ \t\u00a0\u202f]/g;
			for (const range of view.visibleRanges) {
				let pos = range.from;
				while (pos <= range.to) {
					const line = doc.lineAt(pos);
					if (showSp || showTab || showNb) {
						wsRe.lastIndex = 0;
						let m;
						while ((m = wsRe.exec(line.text))) {
							// a no-break space as ° (U+00A0, the narrow U+202F), a plain one as ·, a tab as →
							const ch = m[0];
							const deco = ch === '\t' ? (showTab ? tabDeco : null) : ch === ' ' ? (showSp ? spaceDeco : null) : (showNb ? nbspDeco : null);
							if (deco) b.add(line.from + m.index, line.from + m.index + 1, deco);
						}
					}
					// A blank line shows ¶ (paragraph break); every other line
					// end shows ↵ — except the last line, which has no newline.
					const blank = line.text.trim() === '';
					if (blank && showPar) {
						b.add(line.to, line.to, PILCROW);
					} else if (showEol && line.number < doc.lines) {
						b.add(line.to, line.to, NEWLINE);
					}
					pos = line.to + 1;
				}
			}
			return b.finish();
		}
	}, { decorations: v => v.decorations });

	return [dimPlugin, markerPlugin];
}
