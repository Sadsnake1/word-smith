// Word-Smith — editor-extensions.

import { CM } from '../core/preamble';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type WordSmith from '../plugin/plugin';
import { wsDimMarkerExtensions } from './ext-dim-markers';
import { wsSyntaxExtension } from './ext-syntax';
import { wsParagraphExtension } from './ext-paragraphs';
import { wsPageExtensions } from './ext-page';
import { wsLineExtensions } from './ext-lines';
import { wsCountingExtensions } from './ext-counting';
import { wsCiteExtension } from './ext-cite';

// ── THE EDITOR EXTENSIONS, AS A FACTORY ────────────────────────────────
//
// This was the body of `buildEditorExtensions()`, which opened with
// `const plugin = this` because eight CodeMirror ViewPlugin classes inside
// it read the plugin from their own methods, where `this` is the plugin
// instance CodeMirror made. The review's rule (no-this-alias) is right that
// an alias is a smell in a method; the honest shape is a factory that is
// HANDED the plugin — the same shape as the Organizer's `03-organizer-*`
// modules — and the method is its guard and one call. The body is
// unchanged but for the three `this.build…()` at its end, which read
// `plugin.` now. A helper lives below 05, outside the class.

export function wsEditorExtensions(plugin: WordSmith, cm: NonNullable<typeof CM>) {
	// (the extensions themselves live in the ext-*.ts modules beside this one, a file each, since 2026-10-22)

	// (TOMBSTONE, A780, the writer: "leave the nbsp and invisible chars for now. remove them for now": A768's special spaces
	// as °, A771's invisible characters as ⌷ and ¬, A777's Other that held both)

	// WHETHER THE WRITER IS IN THIS EDITOR. CodeMirror's `hasFocus` also asks
	// `document.hasFocus()`, and on iOS nothing promises that stays true
	// through the keyboard's own edit; one false reading would take the
	// dimming off every line at once and put it back on the next update. On
	// iOS the question is only whether the editor's content is the active
	// element.
	const ownsFocus = (view: EditorView) => plugin.isIosApp()
		? !!view.root && view.root.activeElement === view.contentDOM
		: view.hasFocus;

	// Hemingway is concatenated ahead of the typography revert keymap so
	// that when the lock is on, Backspace is blocked rather than quietly
	// reverting a substitution.
	const all: Extension[] = [
		...wsDimMarkerExtensions(plugin, cm, ownsFocus),
		...wsSyntaxExtension(plugin, cm),
		...wsParagraphExtension(plugin, cm),
		...wsPageExtensions(plugin, cm),
		...wsLineExtensions(plugin, cm, ownsFocus),
		...wsCountingExtensions(plugin, cm),
		...wsCiteExtension(plugin, cm),
	];
	return all
		.concat(plugin.buildHemingwayExtensions())
		.concat(plugin.buildTypographyExtension())
		.concat(plugin.buildTypographyRevertKeymap());
}

