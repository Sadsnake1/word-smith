// ── THE [@ SEARCH (A572) ─────────────────────────────────────────────────────
//
// The writer: "3 our search no other plugins". Typing [@ (or a second @ after a
// semicolon inside one) opens Word-Smith's own search of the library: by author,
// title, year or key, every word typed narrowing it, a key's start ranked first,
// then an author's. A pick writes the key, and closes the bracket where nothing
// closes it yet. With no library, the one line says where to choose one.
//
// MADE ON DEMAND, NOT AT LOAD: a class that extends EditorSuggest at the top of
// the module would throw wherever the API is not there (a test's stand-in, an
// older build), and take the whole plugin with it.
import { EditorSuggest } from 'obsidian';
import type { Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from 'obsidian';
import type WordSmith from '../plugin/plugin';
import type { WsRef } from '../core/citations';
import { WS_CITE_KEY_CHAR, wsCiteKeyText } from '../core/preamble';

/** a source, or the one line said when there is nothing to search */
export type WsCiteHit = WsRef | { none: string };

/** what opens the search: an open bracket, any sources cited before a semicolon, then @ and the key so far */
// (a key's letters in any alphabet, #75: typing the ø of Søhr closed the search; and after Pandoc's @{ too)
export const WS_CITE_TRIGGER = new RegExp('\\[(?:[^[\\]]*;\\s*)?[^[\\]@;]*?-?@\\{?(' + WS_CITE_KEY_CHAR + '*)$', 'u');

/** The library narrowed by every word typed, best first: a key that starts with it, then an author who does. */
export function wsCiteSearch(lib: Map<string, WsRef>, query: string, limit = 20): WsRef[] {
	const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
	const q = words[0] || '';
	const out: { r: WsRef; score: number }[] = [];
	for (const r of lib.values()) {
		const hay = [r.key, r.year, r.title].concat(r.authors.map((a) => a.family + ' ' + a.given), r.editors.map((a) => a.family)).join(' ').toLowerCase();
		if (!words.every((w) => hay.indexOf(w) !== -1)) continue;
		const first = r.authors[0] || r.editors[0];
		const score = !q ? 0 : r.key.toLowerCase().startsWith(q) ? 0 : first && first.family.toLowerCase().startsWith(q) ? 1 : 2;
		out.push({ r, score });
	}
	return out.sort((a, b) => a.score - b.score || (a.r.key < b.r.key ? -1 : a.r.key > b.r.key ? 1 : 0)).slice(0, limit).map((x) => x.r);
}

export function wsMakeCiteSuggest(plugin: WordSmith) {
	if (typeof EditorSuggest !== 'function') return null;
	class WsCiteSuggest extends EditorSuggest<WsCiteHit> {
		onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
			void file;
			if (!plugin.settings.pluginEnabled) return null;
			const before = editor.getLine(cursor.line).slice(0, cursor.ch);
			const m = WS_CITE_TRIGGER.exec(before);
			if (!m) return null;
			return { start: { line: cursor.line, ch: cursor.ch - m[1].length }, end: cursor, query: m[1] };
		}
		getSuggestions(ctx: EditorSuggestContext): WsCiteHit[] {
			const lib = plugin.citeLibrary();
			const path = String(plugin.settings.citeLibrary || '').trim();
			if (!lib.size) return [{ none: path ? 'No sources read from ' + path + '.' : 'Choose a library in Settings → Export → Citations.' }];
			return wsCiteSearch(lib, ctx.query);
		}
		renderSuggestion(hit: WsCiteHit, el: HTMLElement) {
			if ('none' in hit) { el.createDiv({ cls: 'ws-cite-sug-none', text: hit.none }); return; }
			const names = (hit.authors.length ? hit.authors : hit.editors).map((a) => a.family);
			const who = names.slice(0, 3).join(', ') + (names.length > 3 ? ' et al.' : '');
			el.createDiv({ cls: 'ws-cite-sug-head', text: [who, hit.year ? '(' + hit.year + ')' : ''].filter(Boolean).join(' ') });
			el.createDiv({ cls: 'ws-cite-sug-title', text: hit.title });
			el.createDiv({ cls: 'ws-cite-sug-key', text: '@' + hit.key });
		}
		selectSuggestion(hit: WsCiteHit) {
			const ctx = this.context;
			if (!ctx || 'none' in hit) { this.close(); return; }
			// the bracket closed by the pick where nothing after the cursor closes it yet
			const rest = ctx.editor.getLine(ctx.end.line).slice(ctx.end.ch);
			const closed = /^[^[]*\]/.test(rest);
			// THE KEY AS IT READS BACK (#75): in braces where it holds other punctuation (Räikkönen_1935.498–506) or ends
			// in a full stop, so a pick is never a key the export cuts; after a typed @{, only its closing brace
			const opened = ctx.start.ch > 0 && ctx.editor.getLine(ctx.start.line).charAt(ctx.start.ch - 1) === '{';
			const text = opened ? hit.key + '}' : wsCiteKeyText(hit.key);
			ctx.editor.replaceRange(text + (closed ? '' : ']'), ctx.start, ctx.end);
			ctx.editor.setCursor({ line: ctx.start.line, ch: ctx.start.ch + text.length + (closed ? 0 : 1) });
			this.close();
		}
	}
	return new WsCiteSuggest(plugin.app);
}
