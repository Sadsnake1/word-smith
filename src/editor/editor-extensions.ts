// Word-Smith — editor-extensions.

import {
	CM,
	findDialogue,
	wsDialoguePairs,
	isParagraphLine,
	maskMarkup,
	posBucket,
	scanNonProseLines,
	wsCatch,
} from '../core/preamble';
import type { WsToken } from '../core/preamble';
import type { WsEngine } from '../core/lang-engine';
import { wsPhraseSpansFor } from '../core/lang-engine';
import { Platform } from 'obsidian';
import type { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type { Range, Text, Transaction } from '@codemirror/state';
import type WordSmith from '../plugin/plugin';
import { wsFindCitations, wsCiteEntryText } from '../core/citations';

// what the tildes' measure phase hands its write phase: nothing, a hide, or
// where the rows are and what face they wear
type TildeMeasure = null | { hide: true } | { hide?: false; top: number; left: number; height: number; lineH: number; font: string; size: string; weight: string; count: number };

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
					const termEnd  = m.index + m[0].replace(/\s+$/, '').length; // end of terminator
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

	// ── THE LINE BEING WRITTEN IS HELD (issue #22) ──────────────────────────
	// A reader on iOS: "After pressing Backspace, the keyboard switches to Caps
	// Lock / capitalization mode, so the next character is entered as an
	// uppercase letter." Safari keeps the virtual keyboard's capitalization
	// from where the caret was when a SCRIPT moves the selection (CodeMirror
	// #165, a Safari bug), and CodeMirror has to move it whenever a decoration
	// change redraws the text under the caret. A Backspace between two words
	// did exactly that: their marks were rebuilt, the text node went, and the
	// next letter came up a capital. So a line being TYPED OR DELETED in keeps
	// the marks it had, carried through the edit, and every other line is
	// live; the line is marked afresh when the caret leaves it or the editor
	// loses focus. Only the writer's own keystrokes hold it: an undo, a paste
	// or a sync marks everything afresh.
	const typed = (u: ViewUpdate) => u.transactions.some((tr) => tr.isUserEvent('input.type') || tr.isUserEvent('delete'));
	const heldLineOf = (u: ViewUpdate) => { const l = u.state.doc.lineAt(u.state.selection.main.head); return { from: l.from, to: l.to }; };
	// `fresh` everywhere but the held line, `kept` on it; a line decoration
	// carried off a line start (two lines joined) is dropped, not moved.
	// `kept` is FILTERED, not rebuilt from its ranges: two marks over the same
	// word ("very", an adverb and a filler) nest in the set's own order, and a
	// set made again from its ranges nested them the other way round, which
	// CodeMirror redraws.
	const holdOver = (fresh: DecorationSet, kept: DecorationSet, held: { from: number; to: number }, u: ViewUpdate): DecorationSet => {
		const doc = u.state.doc;
		const add: Range<Decoration>[] = [];
		for (const it = fresh.iter(); it.value; it.next()) if (it.from < held.from || it.from > held.to) add.push(it.value.range(it.from, it.to));
		return kept.update({
			filter: (from, _to, value) => from >= held.from && from <= held.to
				&& !(value === markedLine && doc.lineAt(from).from !== from),
			add, sort: true,
		});
	};
	// ONLY WHERE A TOUCH KEYBOARD IS (A623): the capitals are a touch keyboard's,
	// and on the desktop the hold only made a line's marks trail the writing
	// until the caret left it ("displaying laggy"). There every line is live.
	const holds = () => !!(typeof Platform !== 'undefined' && Platform && Platform.isMobile);
	// the update every held plugin makes: `build` is its own fresh pass
	const holdUpdate = (inst: { decorations: DecorationSet; held: { from: number; to: number } | null }, u: ViewUpdate, build: (view: EditorView) => DecorationSet) => {
		if (u.docChanged && typed(u) && holds()) {
			inst.held = heldLineOf(u);
			inst.decorations = holdOver(build(u.view), inst.decorations.map(u.changes), inst.held, u);
		} else if (u.docChanged) {
			inst.held = null;
			inst.decorations = build(u.view);
		} else if (inst.held && (u.selectionSet || u.focusChanged)) {
			const head = u.state.selection.main.head;
			if (!u.view.hasFocus || head < inst.held.from || head > inst.held.to) { inst.held = null; inst.decorations = build(u.view); }
			else if (u.viewportChanged) inst.decorations = holdOver(build(u.view), inst.decorations, inst.held, u);
		} else if (u.viewportChanged) {
			inst.decorations = inst.held ? holdOver(build(u.view), inst.decorations, inst.held, u) : build(u.view);
		}
	};

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

	// ── Syntax highlight ──────────────────────────────────────────────────
	const checkMark = {
		filler:   Decoration.mark({ class: 'ws-ck-filler'   }),
		passive:  Decoration.mark({ class: 'ws-ck-passive'  }),
		illusion: Decoration.mark({ class: 'ws-ck-illusion' }),
		hard:     Decoration.mark({ class: 'ws-ck-hard'     }),
		veryhard: Decoration.mark({ class: 'ws-ck-veryhard' }),
		short:    Decoration.mark({ class: 'ws-ck-short'    }),
		mid:      Decoration.mark({ class: 'ws-ck-mid'      }),
		repeat:   Decoration.mark({ class: 'ws-ck-repeat'   }),
		misused:  Decoration.mark({ class: 'ws-ck-misused'  }),
		pronoun:  Decoration.mark({ class: 'ws-ck-pronoun'  }),
		dialogue: Decoration.mark({ class: 'ws-ck-dialogue' }),
		cliche:   Decoration.mark({ class: 'ws-ck-cliche'   })
	};
	// THE LINE THAT CARRIES A MARK. "Mute everything else" mutes against
	// the marks: every line once the note has shown one (the writer's pick "Mute every line"), none before — a note in a
	// language the tagger does not know (nothing tagged, nothing checked) reads at full ink instead of going faint end to end.
	const markedLine = Decoration.line({ class: 'ws-marked-line' });
	const posMark = {
		noun: Decoration.mark({ class: 'ws-pos-noun' }),
		verb: Decoration.mark({ class: 'ws-pos-verb' }),
		adj:  Decoration.mark({ class: 'ws-pos-adj'  }),
		adv:  Decoration.mark({ class: 'ws-pos-adv'  }),
		conj: Decoration.mark({ class: 'ws-pos-conj' }),
		pron: Decoration.mark({ class: 'ws-pos-pron' })
	};

	// ── ONE LINE'S MARKS, REMEMBERED (A623) ──────────────────────────────
	// A line's marks follow from its text, the switches and the language
	// alone, so a keystroke marks the line it changed and takes every other
	// visible line's from here. Forgotten whole when a switch or the language
	// changes (the signature), and past 4,000 lines. Repetition spans lines,
	// so each line keeps its words for that pass, which runs every time.
	type WsLineMarks = { marks: [number, number, Decoration][]; tokens: WsToken[] };
	const lineMarks = new Map<string, WsLineMarks>();
	let lineMarksSig = '';
	let lineMarksEngine: WsEngine | null = null;

	const syntaxPlugin = ViewPlugin.fromClass(class {
		decorations: DecorationSet;
		// the line being written, held (issue #22). It replaces A479's bare
		// word: that took the marks off the word under the caret, which is
		// itself a redraw under the caret on every tap into a marked word.
		// The caret alone moving changes nothing now.
		held: { from: number; to: number } | null = null;
		// a mark seen in this editor since its switches and language were set: from then on every line mutes (below)
		seenMarks = false;
		constructor(view: EditorView) { this.decorations = this.build(view); }
		update(u: ViewUpdate) { holdUpdate(this, u, (v) => this.build(v)); }
		build(view: EditorView) {
			const s = plugin.settings;
			if (!s.pluginEnabled) return Decoration.none;
			// THE NOTE'S OWN SAY (A862): `ws-syntax` and `ws-checks` in its frontmatter over the two switches
			const posHere = !!plugin.optForView(view, 'posEnabled'), checksHere = !!plugin.optForView(view, 'checksEnabled');
			// Word classes and writing checks are independent now: either
			// can run without the other.
			const posOn: Record<string, boolean> = posHere ? {
				noun: s.posNoun, verb: s.posVerb, adj: s.posAdjective,
				adv:  s.posAdverb, conj: s.posConjunction, pron: s.posPronoun
			} : {};
			const checksOn = checksHere && (s.checkFiller || s.checkPassive ||
				s.checkIllusion || s.checkMisused || s.checkPronoun ||
				s.checkRhythm || s.checkRepetition || s.checkDialogue || s.checkCliche);
			if (!Object.keys(posOn).some(k => posOn[k]) && !checksOn) return Decoration.none;
			if (!plugin.isEditorInScope(view)) return Decoration.none;
			// THE LANGUAGE'S ENGINE (A571): English's tagger and rules, or the
			// chosen pack's; a check the pack has no words for finds nothing.
			const E = plugin.langEngine();

			const doc  = view.state.doc;
			const skip = s.syntaxSkipCode ? plugin.getNonProseLines(doc) : null;
			const out: Range<Decoration>[] = [];
			// Repetition spans lines, so its tokens are collected across
			// the whole visible range and scanned once at the end.
			const seen: WsToken[] | null = s.checkRepetition ? [] : null;
			// the lines that got a mark, by their start — the repetition pass adds its own at the end
			const marked = new Set<number>();
			// the words are read only where something reads them: Dialogue and
			// Sentence rhythm never did, and tagged every line anyway
			const needTokens = Object.keys(posOn).some(k => posOn[k]) || !!(checksOn && (s.checkFiller
				|| s.checkPassive || s.checkIllusion || s.checkMisused || s.checkPronoun || s.checkRepetition || s.checkCliche));
			const bag = s as unknown as Record<string, unknown>;
			const sig = Object.keys(bag).filter(k => /^(pos|check)/.test(k)).sort().map(k => k + '=' + String(bag[k])).join(';');
			if (sig !== lineMarksSig || E !== lineMarksEngine || lineMarks.size > 4000) {
				lineMarks.clear(); lineMarksSig = sig; lineMarksEngine = E;
			}

			for (const range of view.visibleRanges) {
				let pos = range.from;
				while (pos <= range.to) {
					const line = doc.lineAt(pos);
					pos = line.to + 1;
					if (skip && skip.has(line.number)) continue;
					if (!line.text.trim()) continue;
					// (the line's marks kept under this note's own two switches too, A862: the same line in a note with ws-syntax:
					// false beside one without is two answers)
					const key = (posHere ? 'p' : '-') + (checksHere ? 'c' : '-') + '\n' + line.text;
					let got = lineMarks.get(key);
					if (!got) { got = markLine(line.text); lineMarks.set(key, got); }
					const base = line.from;
					for (const [from, to, deco] of got.marks) out.push(deco.range(base + from, base + to));
					if (got.marks.length) marked.add(base);
					if (seen) {
						for (const t of got.tokens) {
							seen.push({ lw: t.lw, w: t.w, from: base + t.from, to: base + t.to, tag: null });
						}
					}
				}
			}

			if (seen && seen.length) {
				const win = s.repetitionWindow    != null ? s.repetitionWindow    : 50;
				const min = s.repetitionMinLength != null ? s.repetitionMinLength : 5;
				for (const r of E.repetitions(seen, win, min)) {
					out.push(checkMark.repeat.range(r.from, r.to));
					marked.add(doc.lineAt(r.from).from);
				}
			}
			// EVERY LINE MUTES ONCE THE NOTE HAS SHOWN A MARK (the writer: "why are these senteced lit with just the conjuctions
			// on?", the pick "Mute every line"): a line without a word of the ticked classes fades with the rest rather than
			// standing out at full ink; remembered, so a stretch scrolled to without one fades too. A note that never shows one
			// (a language the tagger does not know, every class off) keeps its ink
			if (marked.size) this.seenMarks = true;
			if (this.seenMarks) {
				for (const range of view.visibleRanges) {
					let p = range.from;
					while (p <= range.to) { const line = doc.lineAt(p); p = line.to + 1; if (line.text.trim()) marked.add(line.from); }
				}
			}
			for (const at of marked) out.push(markedLine.range(at));
			return Decoration.set(out, true);

			// one line's marks, at its own offsets
			function markLine(text: string): WsLineMarks {
				const marks: [number, number, Decoration][] = [];
				const keep = (deco: Decoration, from: number, to: number) => { marks.push([from, to, deco]); };
				const masked = maskMarkup(text);
				const tokens = needTokens ? E.tag(masked) : [];
				const base = 0;

				for (const t of tokens) {
					// (a pronoun its own class while Pronouns is on, A839; off, a noun as it always was)
					const bucket = t.tag === 'PRON' && posOn.pron ? 'pron' : posBucket(t.tag || '');
					if (bucket && posOn[bucket]) {
						keep(posMark[bucket], base + t.from, base + t.to);
					}
				}

				if (!checksOn) return { marks, tokens };

				if (s.checkPassive) {
					for (const r of E.passive(tokens, masked)) {
						keep(checkMark.passive, base + r.from, base + r.to);
					}
				}
				// CLICHÉS (A839): the language's stock phrases, a span each
				if (s.checkCliche) {
					for (const r of E.cliches(tokens, masked)) {
						keep(checkMark.cliche, base + r.from, base + r.to);
					}
					// …and your own (A856), one a line, in any language
					for (const r of wsPhraseSpansFor(plugin.customClicheRe(E.lang), masked, E.lang)) {
						keep(checkMark.cliche, base + r.from, base + r.to);
					}
				}
				if (s.checkIllusion) {
					for (const r of E.illusions(tokens)) {
						keep(checkMark.illusion, base + r.from, base + r.to);
					}
				}
				if (s.checkMisused) {
					for (const r of E.misused(tokens, masked)) {
						keep(checkMark.misused, base + r.from, base + r.to);
					}
				}
				// Filler: phrases first, so a word inside a phrase is
				// not double-painted ("a lot of" already covers "lots").
				if (s.checkFiller) {
					for (const r of E.filler(tokens, masked, !!s.checkFillerSoft)) {
						keep(checkMark.filler, base + r.from, base + r.to);
					}
				}
				for (let ti = 0; ti < tokens.length; ti++) {
					const t = tokens[ti];
					// Only sentence-initial: a pronoun mid-sentence
					// almost always has its referent right there.
					if (s.checkPronoun && E.vague(t, ti + 1 < tokens.length ? tokens[ti + 1] : null)) {
						keep(checkMark.pronoun, base + t.from, base + t.to);
					}
				}

					// DIALOGUE. Marked on the RAW line rather than the
					// masked one: masking replaces code, links and
					// maths with filler of the same length, and a
					// quote inside a link title is still a quote to
					// the eye reading the page. Offsets are into the
					// line, so `base` puts them back in the document.
					// `raw` was never a name in this scope — it is
					// `line.text` — and the ReferenceError it threw
					// took the WHOLE syntax plugin down with it:
					// CodeMirror disables a view plugin whose update
					// throws, so turning Dialogue on switched every
					// check and word-class colour off at once.
				if (s.checkDialogue) {
					// (and your own pairs with them, A729)
					for (const q of findDialogue(text, E.dialogue, !!s.checkDialogueMore, s.checkDialogueMore && s.checkDialogueCustom ? wsDialoguePairs(s.checkDialogueCustom) : null)) {
						keep(checkMark.dialogue, base + q.from, base + q.to);
					}
				}

				// Sentence rhythm. Always a background tint, whatever
				// checkStyle says: a line under thirty words is
				// noise, and the point is to see a wall of one colour.
				if (s.checkRhythm) {
					// BY ITS GRADE OR BY ITS LENGTH (A595, Shade by): the words counted only
					// where they are asked, the grade only where it is
					const byLength = s.checkRhythmBy === 'length';
					for (const sent of E.sentences(masked)) {
						const tint = plugin.rhythmTint(byLength ? E.wordsIn(sent.text) : 0, byLength ? null : E.sentenceGrade(sent.text));
						const mark = tint === 'veryhard' ? checkMark.veryhard : tint === 'hard' ? checkMark.hard
							: tint === 'short' ? checkMark.short : tint === 'mid' ? checkMark.mid : null;
						if (mark) keep(mark, base + sent.from, base + sent.to);
					}
				}
				return { marks, tokens };
			}
		}
	}, { decorations: v => v.decorations });

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

	// Hemingway is concatenated ahead of the typography revert keymap so
	// that when the lock is on, Backspace is blocked rather than quietly
	// reverting a substitution.
	// Watches for a CodeMirror bottom panel — the vim ":" command line is
	// one — so the bar and the bottom mask can stand down while it is up.
	// Panels open through a state effect, so an update fires with them;
	// reading the DOM rather than guessing at vim internals keeps this
	// working whatever creates the panel.
	const panelWatcher = cm.ViewPlugin.fromClass(class {
		constructor(view: EditorView) { this.sync(view, true); }
		// A keystroke or a caret move is not a reason to re-measure the
		// window: only the panel opening or closing, or the editor's own size
		// changing without an edit (a sidebar, a font, a line that grew a row
		// once it was measured).
		update(u: ViewUpdate) { this.sync(u.view, u.geometryChanged && !u.docChanged); }
		destroy() { document.body.classList.remove('ws-vim-panel-open'); }
		sync(view: EditorView, resized: boolean) {
			let open = false, panel: Element | null = null;
			try { panel = view.dom.querySelector('.cm-panels-bottom'); open = !!panel; } catch (_) { wsCatch('buildEditorExtensions / sync: panel = view.dom.querySelector(\'.cm-panels-bottom\');', _); }
			document.body.classList.toggle('ws-vim-panel-open', open);
			// The {vim} COMMAND state is driven from this flag, and it has
			// to be updated on the way OUT as well as in. It used to sit
			// below the early return, so pressing Esc closed the panel and
			// left the flag stuck true — the bar reported COMMAND forever,
			// and with mode colours on the segment stayed that colour too.
			//
			// Set BEFORE the re-stamp below, not after: the bottom mask
			// now reads this flag to decide whether to clear the gutter
			// (see stampMaskPositions). The rAF defer means the old order
			// happened to work, but geometry that depends on which side
			// of a scheduling call an assignment falls on is a trap.
			const turned = open !== plugin._vimPanelOpen;
			if (turned) {
				plugin._vimPanelOpen = open;
				// ── AND THE GAP MOVES WITH IT ──────────────────────
				//
				// The reserve is the writer’s gap, lifted to fit the
				// line while it is open — so BOTH transitions have to
				// re-stamp, not just the measuring one below. Without
				// this the bar would rise on the next refresh and come
				// back down on the one after that.
				//
				// STAMPED HERE rather than through `refresh()`: the
				// same reasoning the measure path already carries a
				// paragraph about — a refresh behind an await leaves
				// the bar moved and the mask still at the old edge.
				try {
					document.documentElement.style.setProperty(
						'--ws-vim-gutter', plugin.vimGutterHeight() + 'px');
				} catch (_) { wsCatch('buildEditorExtensions / sync: document.documentElement.style.setProperty(', _); }
				plugin.updateRetroStatusBar();
			}
			// What sits at the bottom of the window just changed, so the
			// mask geometry that stops at the bar's top edge has to be
			// recomputed either way — opening AND closing.
			if (turned || resized) plugin.scheduleMaskPosition();
			if (!open) return;
			// Measured AFTER layout — panels open through a state effect,
			// so this update can run before the fixed positioning has
			// been applied and the height read at that instant is the
			// in-flow one.
			//
			// The measurement does NOT move the bar. It is recorded as
			// the height to reserve, so the gutter is already the right
			// size the next time `:` is pressed (and on every later
			// launch) and the bar can stay exactly where it is. Only a
			// changed value costs a save.
			window.requestAnimationFrame(() => {
				try {
					if (!panel || !panel.isConnected) return;
					const h = Math.round(panel.getBoundingClientRect().height);
					if (!(h > 0) || h > 120) return;
					if (Math.abs((plugin.settings.vimPanelHeight || 0) - h) < 1) return;
					plugin.settings.vimPanelHeight = h;
					// Stamp the variable NOW rather than waiting for the
					// refresh inside saveSettings — that refresh sits
					// behind an await on a disk write, and until it lands
					// the bar has moved to the new gutter while the mask
					// still ends at the old one. That gap is the strip
					// left uncovered under the mask the first time `:`
					// was pressed. Setting it here closes the window;
					// the save then only persists what is already true.
					document.documentElement.style.setProperty(
						'--ws-vim-gutter', plugin.vimGutterHeight() + 'px');
					plugin.scheduleMaskPosition();
					void plugin.saveSettings(true);
				} catch (_) { wsCatch('buildEditorExtensions / sync: if (!panel.isConnected) return;', _); }
			});
		}
	});

	// ── EOF tildes (vim's ~) ──────────────────────────────────────────────
	// Vim draws a ~ on every screen row past the end of the buffer. Those
	// rows are not document positions — no decoration can reach them — so
	// this plugin owns a real element over the empty space after the last
	// line.
	//
	// A LAYER OF THE SCROLLED CONTENT, inside .cm-scroller (the rerender
	// audit, 2026-09-25). It lived in view.dom, over the scroller, and was
	// placed again on every scroll — but Obsidian scrolls the note on the
	// compositor a frame before the page runs, so on each wheel tick the
	// tildes sat a whole scroll step off the last line for a frame (91px,
	// measured): the jitter Cursor-Smith's caret had. In the scrolled
	// content they move with the text and a scroll does not touch them.
	// The block runs from the last line to the end of what the scroller
	// holds, measured WITHOUT the block, and clips there: an absolute child
	// adds to what a scroller can scroll, and a block reaching past the end
	// would give the note room it could never lose.
	const eofTildePlugin = ViewPlugin.fromClass(class {
		view: EditorView;
		el: HTMLElement;
		measure: { read: () => TildeMeasure; write: (m: TildeMeasure) => void };
		constructor(view: EditorView) {
			this.view = view;
			this.el = createDiv();
			this.el.className = 'ws-eof-tildes';
			view.scrollDOM.appendChild(this.el);
			this.measure = { read: () => this.read(), write: (m) => this.write(m) };
			view.requestMeasure(this.measure);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged || u.geometryChanged || u.heightChanged) {
				u.view.requestMeasure(this.measure);
			}
		}
		destroy() {
			this.el.remove();
		}
		// All layout reads happen here, inside CM's measure phase.
		read() {
			const view = this.view;
			const s = plugin.settings;
			if (!s.pluginEnabled || !s.markersEnabled || !s.markBlankLines) return null;
			if (!plugin.isEditorInScope(view)) return null;
			const scRect  = view.scrollDOM.getBoundingClientRect();
			const cRect   = view.contentDOM.getBoundingClientRect();
			const cStyle  = getComputedStyle(view.contentDOM);
			// The bottom of the LAST DOCUMENT LINE, from CodeMirror's own
			// line geometry. The earlier box arithmetic (content bottom
			// minus padding) drifted in zen mode — the scroller carries
			// 50vh pads there and Obsidian stacks its own slack on the
			// content — which parked the tildes on the note's trailing
			// blank lines. lineBlockAt() knows exactly where the final
			// line ends; a line holding only a return is still a line,
			// so, as in vim, it gets no tilde — only the void after it.
			let textBottom;
			try {
				textBottom = view.documentTop
					+ view.lineBlockAt(view.state.doc.length).bottom;
			} catch {
				// Older CM without those accessors: fall back to boxes.
				textBottom = cRect.bottom - (parseFloat(cStyle.paddingBottom) || 0);
			}
			const lineH   = view.defaultLineHeight || 24;
			const sd = view.scrollDOM;
			// in the scrolled content's own coordinates
			const top = textBottom - scRect.top + sd.scrollTop;
			// THE END OF WHAT THE SCROLLER HOLDS, from the children in its flow
			// and its own bottom padding (the 50vh pads in zen) — never from its
			// scrollHeight, which counts this block, and never from a layer.
			// Cursor-Smith's caret layer sits in here too, absolute and as tall
			// as the scroll height: read, it fed this block its own height back
			// and the note gained 32px of room on every measure (measured).
			let end = sd.clientHeight;
			for (const c of Array.from(sd.children)) {
				const e = c as HTMLElement;
				if (e === this.el || typeof e.offsetTop !== 'number') continue;
				const pos = getComputedStyle(e).position;
				if (pos === 'absolute' || pos === 'fixed') continue;
				end = Math.max(end, e.offsetTop + e.offsetHeight);
			}
			end += parseFloat(getComputedStyle(sd).paddingBottom) || 0;
			const height = end - top;
			if (height < lineH * 0.5) return { hide: true as const };
			return {
				top,
				left:  (cRect.left - scRect.left) + sd.scrollLeft + (parseFloat(cStyle.paddingLeft) || 0),
				height,
				lineH,
				// The face is READ from the content element rather than
				// inherited. The overlay sits in .cm-scroller but outside
				// .cm-content, so the font rules that target
				// .cm-content (and the --ws-font stamp that drives them)
				// never reached it — which is why the tildes came out in
				// the interface font instead of the chosen one. Copying
				// the computed value cannot miss whatever set it.
				font:  cStyle.fontFamily,
				size:  cStyle.fontSize,
				weight: cStyle.fontWeight,
				count: Math.min(500, Math.ceil(height / lineH))
			};
		}
		write(m: TildeMeasure) {
			if (!m || m.hide === true || !(m.count > 0)) { this.el.classList.remove('is-on'); return; }
			const st = this.el.style;
			this.el.classList.add('is-on');
			st.top        = m.top + 'px';
			st.left       = m.left + 'px';
			st.height     = m.height + 'px';
			st.overflow   = 'hidden';
			st.lineHeight = m.lineH + 'px';
			st.fontFamily = m.font;
			st.fontSize   = m.size;
			st.fontWeight = m.weight;
			this.el.textContent = '~\n'.repeat(m.count);
		}
	});

	// ── The caret's floor ─────────────────────────────────────────────────
	// CodeMirror's own answer to "keep the cursor this far from the edge".
	// scrollMargins is consulted every time the editor scrolls something
	// into view, so the caret is never placed inside the returned margin —
	// and unlike every layout approach, this depends on no assumption
	// about how Obsidian sizes the editor. Two attempts at doing it with
	// CSS insets (pane padding, then a scroller margin) both looked
	// correct and both let the caret go on hiding under the bar.
	//
	// MEASURED, not reserved, and that is what makes it safe to run
	// alongside the CSS margin rather than instead of it. The margin
	// asked for is exactly how far the scroller's own bottom edge
	// currently reaches PAST the line the caret must stay above. If the
	// stylesheet already lifted that edge clear, the overlap is zero or
	// negative and nothing is added — so the two cannot double up. If the
	// stylesheet did nothing, this covers the whole distance on its own.
	//
	// It also gets splits right for free: the upper pane of a top/bottom
	// split has its scroller bottom above the bar already, so it asks for
	// nothing without needing to know about `.ws-bar-overlap`.
	const caretFloor = cm.EditorView.scrollMargins.of((view) => {
		try {
			if (!plugin.editorViewIsNote(view)) return null;
			const r = view.scrollDOM.getBoundingClientRect();
			const below = Math.round(r.bottom - plugin.caretFloorY());
			const above = Math.round(plugin.caretCeilingY() - r.top);
			// A pixel of slack at each edge: fractional geometry
			// otherwise asks for a 1px margin forever and every scroll
			// fights the last one.
			const margins: { top?: number; bottom?: number } = {};
			if (below > 1) margins.bottom = below;
			if (above > 1) margins.top = above;
			return (margins.top || margins.bottom) ? margins : null;
		} catch { return null; }
	});

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

	return [dimPlugin, markerPlugin, syntaxPlugin, paraPlugin, panelWatcher, eofTildePlugin, caretFloor, numberPlugin, typewriterPlugin, lineUnderPlugin, historyHoldPlugin, wpmPlugin, citePlugin]
		.concat(plugin.buildHemingwayExtensions())
		.concat(plugin.buildTypographyExtension())
		.concat(plugin.buildTypographyRevertKeymap());
}
