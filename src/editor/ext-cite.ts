// Word-Smith — ext-cite: citations marked in the text. One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM } from '../core/preamble';
import type { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type WordSmith from '../plugin/plugin';
import { wsFindCitations, wsCiteEntryText } from '../core/citations';
import type { Extension } from '@codemirror/state';

export function wsCiteExtension(plugin: WordSmith, cm: NonNullable<typeof CM>): Extension[] {
	const { ViewPlugin, Decoration, RangeSetBuilder } = cm;

	// ── CITATIONS WHILE WRITING (A572) ────────────────────────────────────
	//
	// A citation marked as it is written, a bracketed key the library does not hold
	// underlined, a citation's sources on hover as the chosen style lists them. A
	// narrative @word is marked only when the library knows it, so a handle is left
	// alone. Nothing with no library, or with Mark citations off.
	const citePlugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		constructor(view: EditorView) { this.decorations = this.build(view); }
		update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
		build(view: EditorView) {
			const s = plugin.settings;
			const lib = plugin.citeLibrary();
			if (!s.pluginEnabled || !s.citeMarks || !lib.size || !plugin.isEditorInScope(view)) return Decoration.none;
			const style = s.citeStyle || 'apa';
			const custom = { inText: s.citeCustomInText, around: s.citeCustomAround, entry: s.citeCustomEntry };
			const b = new RangeSetBuilder<Decoration>();
			let done = 0;
			for (const { from, to } of view.visibleRanges) {
				let pos = from;
				while (pos <= to) {
					const line = view.state.doc.lineAt(pos);
					pos = line.to + 1;
					if (line.number <= done) continue;
					done = line.number;
					if (line.text.indexOf('@') === -1) continue;
					for (const c of wsFindCitations(line.text)) {
						const known = c.items.every((it) => lib.has(it.key));
						if (c.narrative && !known) continue;
						const title = known
							? c.items.map((it) => { const r = lib.get(it.key); return r ? wsCiteEntryText(style, r, custom) : ''; }).join('\n')
							: 'Not in your library: ' + c.items.filter((it) => !lib.has(it.key)).map((it) => '@' + it.key).join(', ');
						b.add(line.from + c.from, line.from + c.to, Decoration.mark({ class: known ? 'ws-cite' : 'ws-cite ws-cite-missing', attributes: { title } }));
					}
				}
			}
			return b.finish();
		}
	}, { decorations: (v) => v.decorations });

	return [citePlugin];
}
