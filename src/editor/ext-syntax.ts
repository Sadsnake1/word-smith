// Word-Smith — ext-syntax: the Syntax and Prose marks on the lines, and the line being written held (issue #22). One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM, findDialogue, wsDialoguePairs, maskMarkup, posBucket } from '../core/preamble';
import type { WsToken } from '../core/preamble';
import type { WsEngine } from '../core/lang-engine';
import { wsPhraseSpansFor } from '../core/lang-engine';
import { Platform } from 'obsidian';
import type { Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import type WordSmith from '../plugin/plugin';
import type { Extension } from '@codemirror/state';

export function wsSyntaxExtension(plugin: WordSmith, cm: NonNullable<typeof CM>): Extension[] {
	const { ViewPlugin, Decoration } = cm;

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
	// the checks' findings, which the Never mark box takes off (A857); the word classes, Dialogue and Sentence rhythm
	// are not findings, and Repetition is read after the lines (its words in the box are left out of it there)
	const findings = new Set<Decoration>([checkMark.filler, checkMark.passive, checkMark.illusion, checkMark.misused, checkMark.pronoun, checkMark.cliche]);
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
	// (`never`: where the Never mark box's words stand in the line, A857)
	type WsLineMarks = { marks: [number, number, Decoration][]; tokens: WsToken[]; never: [number, number][] };
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
						const never = got.never;
						for (const t of got.tokens) {
							if (never.length && never.some(([a, b]) => t.from >= a && t.to <= b)) continue;
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
				// NEVER MARK (A857): where the box's words and phrases stand in this line
				const never: [number, number][] = checksOn && s.checkNeverMark
					? wsPhraseSpansFor(plugin.neverMarkRe(E.lang), masked, E.lang).map((r): [number, number] => [r.from, r.to]) : [];
				const base = 0;

				for (const t of tokens) {
					// (a pronoun its own class while Pronouns is on, A839; off, a noun as it always was)
					const bucket = t.tag === 'PRON' && posOn.pron ? 'pron' : posBucket(t.tag || '');
					if (bucket && posOn[bucket]) {
						keep(posMark[bucket], base + t.from, base + t.to);
					}
				}

				if (!checksOn) return { marks, tokens, never };

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
				}
				if (s.checkIllusion) {
					for (const r of E.illusions(tokens, masked)) {
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
					if (s.checkPronoun && E.vague(t, ti + 1 < tokens.length ? tokens[ti + 1] : null, tokens.slice(ti + 1, ti + 9))) {
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
				// …a finding inside a word or phrase of the Never mark box goes (A857)
				if (never.length) return { marks: marks.filter(([f, t, d]) => !(findings.has(d) && never.some(([a, b]) => f >= a && t <= b))), tokens, never };
				return { marks, tokens, never };
			}
		}
	}, { decorations: v => v.decorations });

	return [syntaxPlugin];
}
