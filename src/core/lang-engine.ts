// ── THE LANGUAGE ENGINE (A571 7b) ───────────────────────────────────────────
//
// What the editor's marks, the reading grade and the Report ask of a language,
// in one shape: a line's words tagged, the prose checks' spans, the sentences,
// a sentence's grade, a text's sums and the grade they make. English answers
// with the tagger and the rules it always had (preamble.ts, untouched); a pack
// answers from its note, through `wsPackEngine`, which reads data and never
// runs any.
//
// THE PACK ENGINE, in the order it decides:
// · WORDS by spaces (any script's letters; an elision such as French l' or
//   Italian dell' split off its word), or for Chinese and Japanese by the
//   browser's word segmenter (ICU, offline, on phones too; a build without one
//   takes each character of those scripts as a word).
// · A WORD'S CLASS from the pack's lists (closed classes first, so a word under
//   two headings is the function word), then the same with an inflection taken
//   off ("schnelle" is "schnell"), then a capital mid-sentence where the pack
//   says it marks a noun, then the longest ending in its table, then what
//   stands before it. A word none of these know is left uncolored: a guess in
//   a language the engine does not know is worse than no color.
// · SENTENCES end at the pack's own marks, closing quotes kept with them; an
//   abbreviation, an initial, an ordinal or a lowercase next word joins them
//   back.
// · THE CHECKS: filler, soft filler and hedges, misused words and the passive's
//   helpers matched over words in a row (a phrase is its words with only space
//   between); vague pronouns at a sentence's start; a doubled word unless it is
//   a function word; repetition minus the function words.
// · THE GRADE by the pack's formula, from sums a folder can add up, always as a
//   school grade so the rhythm thresholds mean one thing in every language.

import { FILLER_PHRASES, FILLER_SOFT, FILLER_STRONG, findIllusions, findMisused, findPassive, findRepetitions, isVaguePronoun, POS_LEX, sentenceGrade, splitSentences, tagTokens, tokenizeLine, wsQuoteHolds, wsSentenceStart } from './preamble';
import type { WsToken, WsDialogueMarks } from './preamble';
import type { WsPack } from './language';
import { WS_PACK_FORMULAS, wsPackQuotes } from './language';

export interface WsSpan { from: number; to: number }
export interface WsSentence { from: number; to: number; text: string }
/** what a grade is made from, added up over a sentence, a note or a folder */
export type WsReadSums = Record<string, number>;

export interface WsEngine {
	/** 'en', or the pack's code */
	lang: string;
	/** true where words come from the segmenter (Chinese, Japanese) */
	segmented: boolean;
	/** a line's words, tagged, each sentence's first word marked */
	tag(masked: string): WsToken[];
	filler(tokens: WsToken[], masked: string, soft: boolean): WsSpan[];
	passive(tokens: WsToken[], masked: string): WsSpan[];
	illusions(tokens: WsToken[]): WsSpan[];
	misused(tokens: WsToken[], masked: string): WsSpan[];
	vague(t: WsToken, next: WsToken | null): boolean;
	sentences(masked: string): WsSentence[];
	/** one sentence's grade, or null for a fragment (under four words) */
	sentenceGrade(text: string): number | null;
	/** how many words a text runs, as this language counts them (A595) */
	wordsIn(text: string): number;
	repetitions(tokens: WsToken[], windowSize: number, minLength: number): WsSpan[];
	/** adds one sentence to the sums; false when it holds no word */
	sumsInto(text: string, into: WsReadSums): boolean;
	gradeOf(sums: WsReadSums): number;
	/** a function word, left out of the Report's most used words unless asked */
	isCommon(lw: string): boolean;
	/** Capitalize sentences: does a sentence start at the caret, the line's text before it and the line above */
	sentenceStart(before: string, prevLine: string | null): boolean;
	/** Dialogue's marks: the pairs and the dash the language writes speech with, or null for the usual (A610) */
	dialogue: WsDialogueMarks | null;
	/** what the engine could not use in the pack, said on the Language page */
	notes: string[];
}

// ── ENGLISH, as it always was ─────────────────────────────────────────────
//
// The tagger and the checks of preamble.ts behind the same shape; the filler
// pass is the one the editor ran inline (phrases first, so a word inside a
// phrase is not painted twice).
const wsEnglishFiller = (tokens: WsToken[], masked: string, soft: boolean): WsSpan[] => {
	const out: WsSpan[] = [];
	const phrases: [number, number][] = [];
	FILLER_PHRASES.lastIndex = 0;
	let m;
	while ((m = FILLER_PHRASES.exec(masked))) {
		phrases.push([m.index, m.index + m[0].length]);
		out.push({ from: m.index, to: m.index + m[0].length });
	}
	for (const t of tokens) {
		if ((FILLER_STRONG.has(t.lw) || (soft && FILLER_SOFT.has(t.lw)))
			&& !phrases.some((pr) => t.from >= pr[0] && t.to <= pr[1])) out.push({ from: t.from, to: t.to });
	}
	return out;
};

export const WS_ENGLISH_ENGINE: WsEngine = {
	lang: 'en',
	segmented: false,
	tag: (masked) => tagTokens(tokenizeLine(masked), masked),
	filler: wsEnglishFiller,
	passive: (tokens) => findPassive(tokens),
	illusions: (tokens) => findIllusions(tokens),
	misused: (tokens, masked) => findMisused(tokens, masked),
	vague: (t, next) => isVaguePronoun(t, next),
	sentences: (masked) => splitSentences(masked),
	wordsIn: (text) => tokenizeLine(text).length,
	sentenceGrade: (text) => {
		const st = tokenizeLine(text);
		return st.length < 4 ? null : sentenceGrade(st);
	},
	repetitions: (tokens, w, min) => findRepetitions(tokens, w, min),
	// English's sums are counted in the Report's own way (`analyzeText`); the
	// engine shape is for the packs there.
	sumsInto: () => false,
	gradeOf: () => 0,
	isCommon: () => false,
	sentenceStart: (before, prevLine) => wsSentenceStart(before, prevLine),
	dialogue: null,
	notes: [],
};

// ── ENGLISH WITH ITS PACK (A691; ONE PACK since A694, the writer: "Only one English pack with us /UK typography dropdown") ──
//
// English is built in; ws-lang-en.md shows what it knows, the UK's spellings among it (generated from these lists by
// ws-dev/gen-english-packs.js) and take a writer's words. The TAGGER stays English's own, its context rules
// and all; a word the pack places where the built-in lexicon does not (a word added, or moved to another
// heading) is that class whatever the rules made of it, because a writer's list always wins. Filler, soft
// filler and Commonly misused are the pack's lists outright (a row the writer takes out is not flagged);
// English's context-ruled confusions (its/it's, could of, fewer/less) stay. The quotes are Typography's Quote
// style, US or UK. The grade, the sentences, the passive and the rest are English's own.
// English's own tags a pack has no heading for, and the heading that holds them (both uncolored, or both verbs)
const WS_EN_EQUIV: Record<string, string> = { MOD: 'AUX', TO: 'PART', INTJ: 'PART' };
const WS_EN_PACK_ENGINES = new WeakMap<WsPack, WsEngine>();
export function wsEnglishPackEngine(pack: WsPack): WsEngine {
	const had = WS_EN_PACK_ENGINES.get(pack);
	if (had) return had;
	const P = wsPackEngine(pack);
	const L = (k: string) => pack.lists[k] || [];
	const same = (a: string | undefined, b: string) => !!a && (a === b || WS_EN_EQUIV[a] === b || WS_EN_EQUIV[b] === a);
	// the words the pack places otherwise than the built-in lexicon, the first heading winning as in a pack
	const over = new Map<string, string>();
	for (const [k, tag] of WS_LEX_ORDER) for (const w of L(k)) {
		const lw = w.toLowerCase().replace(/’/g, "'").trim();
		if (!lw || /\s/.test(lw) || over.has(lw)) continue;
		over.set(lw, same(POS_LEX[lw], tag) ? '' : tag);
	}
	for (const [k, v] of Array.from(over)) if (!v) over.delete(k);
	const hasFiller = L('filler words').length > 0 || L('soft filler').length > 0;
	const hasMisused = !!(pack.tables.misused && pack.tables.misused.length);
	const e: WsEngine = {
		...WS_ENGLISH_ENGINE,
		lang: pack.lang || 'en',
		tag: (masked) => {
			const tokens = tagTokens(tokenizeLine(masked), masked);
			if (over.size) for (const t of tokens) { const o = over.get(t.lw); if (o) t.tag = o; }
			return tokens;
		},
		filler: (tokens, masked, soft) => (hasFiller ? P.filler(tokens, masked, soft) : WS_ENGLISH_ENGINE.filler(tokens, masked, soft)),
		// the context rules' hits, then the pack's table (its words and its phrases), one span each
		misused: hasMisused ? (tokens, masked) => {
			const ruled = findMisused(tokens, masked, new Set<string>(), []);
			const listed = P.misused(tokens, masked).filter((h) => !ruled.some((r) => r.from < h.to && h.from < r.to));
			return ruled.concat(listed).sort((a, b) => a.from - b.from);
		} : (tokens, masked) => WS_ENGLISH_ENGINE.misused(tokens, masked),
		dialogue: P.dialogue,
		notes: P.notes,
	};
	WS_EN_PACK_ENGINES.set(pack, e);
	return e;
}

// ── THE GRADE ─────────────────────────────────────────────────────────────

// FLESCH'S OWN TABLE, ease to school grade: 90–100 is fifth grade, 80–90 sixth,
// 70–80 seventh, 60–70 eighth and ninth, 50–60 tenth to twelfth, 30–50 college,
// under 30 a graduate. The middles of those bands, joined by straight lines and
// carried on past the ends: what every 0–100 reading ease (each language's
// Flesch, Tateisi's) is turned into, so "hard" is one number everywhere.
const WS_EASE_TABLE: [number, number][] = [[95, 5], [85, 6], [75, 7], [65, 8.5], [55, 11], [40, 14.5], [15, 17.5]];
export function wsEaseToGrade(ease: number): number {
	const T = WS_EASE_TABLE;
	if (!isFinite(ease)) return 0;
	let a = T[0], b = T[1];
	if (ease < T[T.length - 1][0]) { a = T[T.length - 2]; b = T[T.length - 1]; }
	else for (let i = 0; i + 1 < T.length; i++) if (ease <= T[i][0] && ease >= T[i + 1][0]) { a = T[i]; b = T[i + 1]; break; }
	const g = a[1] + (ease - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
	return Math.max(0, Math.min(22, g));
}

// THE FORMULAS, by the name a pack's `## Readability` gives under `formula`,
// each a school grade from the sums; a coefficient the pack writes under its
// own name replaces the one here.
// · flesch: base − sentence × words a sentence − word × syllables a word, an
//   ease; German Amstad, Spanish Fernández-Huerta, French Kandel-Moles, Dutch
//   Douma and the Portuguese one are this with their own three numbers.
// · wstf: the first Wiener Sachtextformel, a grade already.
// · gulpease: 89 + (300 × sentences − 10 × letters) ÷ words, 0–100; 80 is
//   where a fifth grader stops, 60 an eighth, 40 a high school's end.
// · lix: words a sentence + the share of words over six letters; ÷ 4.
// · fog-pl: Pisarek's FOG for Polish, hard words at four syllables.
// · tateisi: Japanese by the lengths of its script runs; an ease.
// · zh: Chinese by characters a sentence and the share outside the pack's
//   common characters.
// THE GRADE'S NAME (A638, the writer: "say here what reading grade symtem is has"): the pack's own
// `name` under Readability if it gives one, else the formula's, a Flesch by the language it was fitted to
const WS_FORMULA_NAMES: Record<string, string> = {
	flesch: 'Flesch reading ease', wstf: 'Wiener Sachtextformel', gulpease: 'Gulpease index', lix: 'LIX',
	'fog-pl': 'FOG-PL (Pisarek)', tateisi: 'Tateisi', zh: 'Characters a sentence and rare characters',
};
const WS_FLESCH_FOR: Record<string, string> = { de: 'Amstad', es: 'Fernández-Huerta', fr: 'Kandel and Moles', nl: 'Douma', pt: 'Martins' };
export function wsPackGradeName(pack: WsPack): string {
	const rd = pack.keyed.readability || {};
	const own = String(rd.name || '').trim();
	if (own) return own;
	const f = wsLower(String(rd.formula || '').trim());
	if (!f || !WS_FORMULA_NAMES[f]) return '';
	const lang = String(pack.lang || '').split('-')[0].toLowerCase();
	if (f === 'flesch' && WS_FLESCH_FOR[lang]) return WS_FLESCH_FOR[lang] + ' (Flesch for its language)';
	return WS_FORMULA_NAMES[f];
}

// WHERE A PACK'S READING GRADE COMES FROM (A684, the writer: "say in the language settings what tests were
// ported"): made for the language, adapted for it, or ported from another where none is settled. A pack says
// its own under Readability (`- from:`); else the formula's own origin, Flesch's by the language it was
// adapted for.
const WS_FORMULA_FROM: Record<string, string> = {
	lix: 'Bj\u00f6rnsson\u2019s LIX, made for Swedish (1968)',
	wstf: 'Bamberger and Vanecek, made for German (1984)',
	gulpease: 'GULP, University of Rome, made for Italian (1988)',
	'fog-pl': 'Gunning\u2019s Fog index, adapted for Polish by Pisarek',
	tateisi: 'Tateisi, Ono and Yamada, made for Japanese (1988)',
	zh: 'Word-Smith\u2019s own estimate; no settled Chinese formula is used',
	flesch: 'Flesch\u2019s reading ease, made for English (1948), with this pack\u2019s coefficients',
};
const WS_FLESCH_FROM: Record<string, string> = {
	es: 'Fern\u00e1ndez-Huerta\u2019s adaptation of Flesch for Spanish (1959)',
	fr: 'Kandel and Moles\u2019s adaptation of Flesch for French (1958)',
	nl: 'Douma\u2019s adaptation of Flesch for Dutch (1960)',
	pt: 'Martins and others\u2019 adaptation of Flesch for Brazilian Portuguese (1996)',
};
export function wsPackGradeFrom(pack: WsPack): string {
	const rd = pack.keyed.readability || {};
	const own = String(rd.from || '').trim();
	if (own) return own;
	const f = wsLower(String(rd.formula || '').trim());
	const lang = String(pack.lang || '').split('-')[0].toLowerCase();
	if (f === 'flesch' && WS_FLESCH_FROM[lang]) return WS_FLESCH_FROM[lang];
	return WS_FORMULA_FROM[f] || '';
}

export function wsGradeOf(formula: string, coef: Record<string, number>, s: WsReadSums): number {
	const n = (k: string) => s[k] || 0;
	const W = n('words'), S = n('sentences');
	if (!W || !S) return 0;
	const c = (k: string) => (typeof coef[k] === 'number' && isFinite(coef[k]) ? coef[k] : (WS_PACK_FORMULAS[formula] || {})[k] || 0);
	const pct = (k: string) => 100 * n(k) / W;
	const mean = (len: string, cnt: string) => (n(cnt) ? n(len) / n(cnt) : 0);
	switch (formula) {
		case 'flesch': return wsEaseToGrade(c('base') - c('sentence') * (W / S) - c('word') * (n('syllables') / W));
		case 'wstf': return Math.max(0, c('ms') * pct('poly3') + c('sl') * (W / S) + c('iw') * pct('long') - c('es') * pct('mono') - c('c'));
		case 'gulpease': return Math.max(0, (105 - (c('base') + (c('sentence') * S - c('letter') * n('letters')) / W)) / 5);
		case 'lix': return Math.max(0, c('scale') * (W / S + pct('long')));
		case 'fog-pl': return Math.max(0, c('scale') * (W / S + pct('poly4')));
		case 'tateisi': {
			const rs = c('base') - c('ls') * (n('chars') / S) - c('la') * mean('aLen', 'aN') + c('lh') * mean('hLen', 'hN')
				- c('lc') * mean('cLen', 'cN') - c('lk') * mean('kLen', 'kN') - c('cp') * (n('commas') / S);
			return wsEaseToGrade(rs);
		}
		case 'zh': return Math.max(0, c('length') * (n('chars') / S) + c('rare') * (n('han') ? 100 * n('rare') / n('han') : 0) + c('base'));
		default: return 0;
	}
}

// ── THE PACK ENGINE ───────────────────────────────────────────────────────

// a class as a pack's tables and context lines name it, to the tagger's tag
const WS_TAG_OF: Record<string, string> = {
	noun: 'NOUN', verb: 'VERB', adjective: 'ADJ', adverb: 'ADV', conjunction: 'CONJ', preposition: 'PREP',
	pronoun: 'PRON', article: 'DET', auxiliary: 'AUX', particle: 'PART', number: 'NUM',
};
// the lists, closed classes first: a word under two headings is the function word
const WS_LEX_ORDER: [string, string][] = [
	['numbers', 'NUM'], ['units', 'NUM'], ['articles', 'DET'], ['pronouns', 'PRON'], ['prepositions', 'PREP'], ['conjunctions', 'CONJ'], ['auxiliaries', 'AUX'],
	['particles', 'PART'], ['verbs', 'VERB'], ['adjectives', 'ADJ'], ['adverbs', 'ADV'], ['nouns', 'NOUN'],
];
const WS_CLOSED = ['numbers', 'articles', 'pronouns', 'prepositions', 'conjunctions', 'auxiliaries', 'particles'];
const WS_OPEN_TAGS = new Set(['VERB', 'ADJ', 'ADV', 'NOUN']);
// the marks that close a quotation or a bracket after a sentence's end, kept with it
const WS_CLOSERS = '"\'\u201d\u2019\u201c\u2018\u00bb\u00ab\u203a\u2039)]\u300d\u300f\u3011\u3009\u300b\uff09';
// 々 and 〇 are written among the kanji and counted with them (A614: 様々 cut a kanji run)
const WS_HAN = /[\u3005\u3007\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const WS_HIRA = /[\u3040-\u309f]/;
const WS_KATA = /[\u30a0-\u30ff\uff66-\uff9f]/;
const WS_LETTER = /[\p{L}\p{M}]/u;
const WS_DEFAULT_VOWELS = 'aeiouy\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f2\u00f3\u00f4\u00f5\u00f6\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00ff\u0105\u0119\u0117\u012f\u0173\u0153\u0101\u0113\u012b\u014d\u016b';

// …and the cedilla ş ţ an older Romanian text types read as the comma ș ț its pack lists (A614)
// …and a stress mark left over after composing (Russian, Ukrainian: Ко́фе is кофе; A677). A Latin é is
// composed by then and keeps its accent; …and the apostrophe Ukrainian spelling recommends, \u02bc, is the plain one
const wsLower = (w: string) => w.toLowerCase().replace(/[\u2019\u02bc]/g, "'").normalize('NFC').replace(/\u0301/g, '').replace(/\u015f/g, '\u0219').replace(/\u0163/g, '\u021b');
const wsEsc = (s: string) => s.replace(/[\\\]^-]/g, '\\$&');
const wsListOfKeyed = (v: string | undefined) => String(v || '').split(/[,\uff0c\u3001]/).map((x) => x.trim()).filter(Boolean);
const wsNum = (v: string | undefined) => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : null; };
// a phrase as the matcher keys it: lower case, one space where any ran
const wsPhraseKey = (s: string) => wsLower(s).replace(/\s+/g, ' ').trim();
// what opens a clause whose first word wears a sentence's capital: a quote, a colon, a dash, a bracket (A624)
const WS_CLAUSE_OPEN = /^["'\u201c\u201e\u201a\u2018\u00ab\u00bb\u2039\u203a\u300c\u300e([:\u2013\u2014-]$/;
// the first character before a place that is not a space, or ''
const wsCharBefore = (s: string, at: number) => { let q = at - 1; while (q >= 0 && /\s/.test(s.charAt(q))) q--; return q >= 0 ? s.charAt(q) : ''; };

interface WsSegmenter { segment(s: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> }
function wsSegmenterFor(lang: string): WsSegmenter | null {
	const I = Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => WsSegmenter };
	try { return typeof I.Segmenter === 'function' ? new I.Segmenter(lang, { granularity: 'word' }) : null; } catch { return null; }
}

// one pattern of a pack: `ge…t` (a beginning and an end), `…iert` (an end),
// `被…` (a mark and the word after it), a bare word; `...` is read as `…`
interface WsPat { pre: string; suf: string; whole: string }
const wsPat = (raw: string): WsPat => {
	const s = wsLower(raw).replace(/\.\.\./g, '\u2026');
	const k = s.indexOf('\u2026');
	return k === -1 ? { pre: '', suf: '', whole: s } : { pre: s.slice(0, k), suf: s.slice(k + 1), whole: '' };
};

const WS_ENGINES = new WeakMap<WsPack, WsEngine>();
export function wsPackEngine(pack: WsPack): WsEngine {
	const had = WS_ENGINES.get(pack);
	if (had) return had;
	const e = wsBuildPackEngine(pack);
	WS_ENGINES.set(pack, e);
	return e;
}

function wsBuildPackEngine(pack: WsPack): WsEngine {
	const notes: string[] = [];
	const L = (k: string) => pack.lists[k] || [];
	const segmented = String(pack.props.words || '').trim().toLowerCase() === 'segmenter';
	const seg = segmented ? wsSegmenterFor(pack.lang) : null;

	// THE LEXICON: one-word entries, the first heading in WS_LEX_ORDER winning
	const lex = new Map<string, string>();
	for (const [k, tag] of WS_LEX_ORDER) for (const w of L(k)) {
		const lw = wsLower(w);
		if (!/\s/.test(lw) && !lex.has(lw)) lex.set(lw, tag);
	}
	const closed = new Set<string>();
	for (const k of WS_CLOSED) for (const w of L(k)) closed.add(wsLower(w));
	// AN INFLECTION: an ending a word sheds ("e": schnelle is schnell), or one it swaps
	// for another ("t>en": liegt is liegen), longest first
	const inflections = L('inflections').map(wsLower).map((x) => {
		const [off, on] = x.split('>');
		return { off: (off || '').trim().replace(/^[-\u2026]+/, ''), on: (on || '').trim().replace(/^[-\u2026]+/, '') };
	}).filter((x) => x.off).sort((a, b) => b.off.length - a.off.length);
	const elisions = new Set(L('elisions').map((x) => wsLower(x).replace(/\u2019/g, "'")));
	const endings: { end: string; tag: string }[] = [];
	for (const row of pack.tables.endings || []) {
		const end = wsLower(row[0] || '').replace(/^[-\u2026*]+|^\.\.\./, '');
		const tag = WS_TAG_OF[wsLower(row[1] || '')];
		if (!end) continue;
		if (!tag) { notes.push('Endings: "' + (row[1] || '') + '" is not a word class'); continue; }
		endings.push({ end, tag });
	}
	endings.sort((a, b) => b.end.length - a.end.length);
	let capTag = '', capFirstTag = '';
	const after = new Map<string, string>();
	const ctx = pack.keyed.context || {};
	// WORDS THAT MAKE THE NEXT ONE A VERB (A621): "verb after" any word ("să"), "infinitive
	// after" one that ends as an infinitive does and not as a "not infinitive" form ("a negocia",
	// never "a Moscovei" or "a omului"). A pronoun, a particle or an adverb of the lists between
	// them is stepped over ("să le folosească", "a nu mai face"), an article too after "verb
	// after" ("să o cumpere"); a capital, a closed word or a figure is never made one.
	// …and "article endings": a verb's form wearing one is a noun ("veniturile", "trecutul")
	// …and "capitalized over" (A624): the listed classes a capital mid-sentence outranks, where a capital is a
	// noun's whatever else the word is (German: "das Leben", "die Deutschen"); never where an adjective wears
	// one too (Dutch: "de Amerikaanse president")
	// …and "article before" (A674, the held-out Danish and Norwegian): pronouns that are articles before an
	// adjective or a noun ("det nye hus", "de fleste") and pronouns elsewhere ("det er"); "opening": the
	// class of an unknown word that opens a sentence, where every "after" rule has no word before it to
	// read (Japanese 羅生門が…, Chinese 瓦楞上…)
	// …and "adjective after": words of degree after which a word the lists do not hold describes ("más
	// amarga", "più recondito"), an ending's guess outranked; "coordination": the words for "and" and "or",
	// after which such a word is an adjective when the word before them is one ("fuerte y amargo")
	// …and "no verb after" (A677, Russian and Ukrainian): classes no verb follows ("в берете", "свої орбіти"),
	// where a word an ending alone called a verb takes the "after" rule's class instead
	const CTX_LISTS = /^(verb after|infinitive after|infinitive endings|not infinitive|article endings|capitalized over|article before|adjective after|coordination|no verb after)$/;
	const ctxList = (k: string) => String(ctx[k] || '').split(',').map((x) => wsLower(x.trim()).replace(/^[-\u2026]+/, '')).filter(Boolean);
	const verbAfter = new Set(ctxList('verb after'));
	const infAfter = new Set(ctxList('infinitive after'));
	const infEnds = ctxList('infinitive endings');
	const notInf = ctxList('not infinitive');
	const articled = new Set(ctxList('article endings'));
	const capOver = new Set(ctxList('capitalized over').map((c) => WS_TAG_OF[c] || WS_TAG_OF[c.replace(/s$/, '')]).filter((t) => !!t && WS_OPEN_TAGS.has(t)));
	const artBefore = new Set(ctxList('article before'));
	const adjAfter = new Set(ctxList('adjective after'));
	const andWords = new Set(ctxList('coordination'));
	const noVerbAfter = new Set(ctxList('no verb after').map((c) => (WS_LEX_ORDER.find(([h]) => h === c) || [])[1] || WS_TAG_OF[c] || WS_TAG_OF[c.replace(/s$/, '')]).filter((t): t is string => !!t));
	// …and "unknown" (A674): the class of a word nothing else placed, last of all (Chinese: a noun, the
	// likeliest thing a word the lists lack is)
	let openTag = '', unknownTag = '';
	for (const k of Object.keys(ctx)) {
		if (CTX_LISTS.test(k)) continue;
		const tag = WS_TAG_OF[wsLower(ctx[k])];
		if (!tag) { notes.push('Context: "' + ctx[k] + '" is not a word class'); continue; }
		if (k === 'capitalized') { capTag = tag; continue; }
		if (k === 'capitalized first') { capFirstTag = tag; continue; }
		if (k === 'opening') { openTag = tag; continue; }
		if (k === 'unknown') { unknownTag = tag; continue; }
		const m = /^after (.+)$/.exec(k);
		const of = m ? (WS_LEX_ORDER.find(([h]) => h === m[1]) || [])[1] || WS_TAG_OF[m[1]] : '';
		if (!of) { notes.push('Context: "' + k + '" is not a rule this engine knows'); continue; }
		after.set(of, tag);
	}
	const minStem = segmented ? 1 : 2;
	// A HANGUL SYLLABLE IS A WHOLE STEM (A677, Korean: "나는" is 나 and its particle, "집에" 집 and 에), where
	// letters need two or three to be one
	const hangul = (w: string) => /[\uac00-\ud7af]/.test(w);
	const stemAt = (w: string, n: number) => hangul(w) ? 1 : n;
	// a word's class from the lists, as written, then by a shortened form of it (open classes only)
	const inflOf = (lw: string): string => {
		for (const f of inflections) {
			if (lw.length - f.off.length < stemAt(lw, 3) || !lw.endsWith(f.off)) continue;
			const base = lex.get(lw.slice(0, -f.off.length) + f.on);
			if (base && WS_OPEN_TAGS.has(base)) return base === 'VERB' && articled.has(f.off) ? 'NOUN' : base;
		}
		return '';
	};
	// THE ENDING THAT EXPLAINS MOST OF THE WORD: on the word as written, or on a
	// shortened form with what it shed counted in ("zulässigen" is -ig with -en
	// shed, four letters, where a bare -en is two); a tie goes to the word as written
	const endingOf = (lw: string): string => {
		let best = '', score = 0;
		const tryOn = (w: string, extra: number) => {
			for (const e of endings) {
				if (w.length < e.end.length + stemAt(w, minStem) || !w.endsWith(e.end)) continue;
				if (e.end.length + extra > score) { score = e.end.length + extra; best = e.tag; }
				break;
			}
		};
		tryOn(lw, 0);
		// only an ending shed, never one swapped in: "Brot" read as "broen" was a verb by -en
		for (const f of inflections) if (!f.on && lw.length - f.off.length >= stemAt(lw, 3) && lw.endsWith(f.off)) tryOn(lw.slice(0, -f.off.length), f.off.length);
		return best;
	};

	// SENTENCES
	const ends = String(pack.props['sentence-end'] || '. ! ? \u2026').split(/\s+/).filter(Boolean).join('').replace(/\.\.\./g, '\u2026');
	const endCls = wsEsc(ends);
	const SPLIT = new RegExp('[^' + endCls + ']+[' + endCls + ']*[' + wsEsc(WS_CLOSERS) + ']*\\s*', 'gu');
	const abbr = new Set(L('abbreviations').map((a) => { const x = wsLower(a).replace(/\s+/g, ''); return x.endsWith('.') ? x : x + '.'; }));
	// the letters of an abbreviation, each a word to the tokenizer ("z" and "b" in "z. B.")
	const abbrPieces = new Set<string>();
	for (const a of abbr) for (const p of a.split('.')) if (p) abbrPieces.add(p);
	// SPEECH (A610): the pack's quotes, any others it names (other-quotes: » « › ‹), its dialogue dash
	const dq = wsPackQuotes(pack);
	const pairs: Record<string, string> = {};
	if (dq) { pairs[dq.od] = dq.cd; pairs[dq.os] = dq.cs; }
	const oq = String(pack.props['other-quotes'] || '').split(/\s+/).filter(Boolean);
	for (let i = 0; i + 1 < oq.length; i += 2) pairs[oq[i]] = oq[i + 1];
	const dashes = String(pack.props['dialogue-dash'] || '').replace(/\s+/g, '');
	// …and its speech verbs, which end a speech with no second dash after them (A622)
	const dialogue: WsDialogueMarks | null = (Object.keys(pairs).length || dashes) ? { pairs, dashes, verbs: L('speech verbs').map(wsLower) } : null;
	// …and the doubles and guillemets among them hold a quotation opened partway through a sentence whole (A642);
	// a single quote can be the apostrophe
	const held: Record<string, string> = { '"': '"' };
	for (const o of Object.keys(pairs)) if (!/['\u2018\u2019]/.test(o + pairs[o])) held[o] = pairs[o];
	// ORDINALS WITH A DOT (ordinal-dot: yes): "am 3. Oktober" one sentence; a year ends one
	const ordinal = /^(yes|true|on)$/i.test(String(pack.props['ordinal-dot'] || '').trim());
	// Capitalize sentences reads the same ends (not the ellipsis, which trails) and every quote mark a pack may use
	const capMarks = {
		// …and the pack's own openers, Swedish ” among them (A614)
		open: wsEsc('"\'\u201c\u2018\u201e\u201a\u00ab\u00bb\u2039\u203a\u00bf\u00a1([' + Object.keys(pairs).join('')),
		end: wsEsc(ends.replace(/\u2026/g, '') || '.'),
		close: wsEsc('"\'\u201d\u2019\u201c\u2018\u00bb\u00ab\u203a\u2039)]'),
		quote: wsEsc('"\'\u201d\u2019\u201c\u2018\u00bb\u00ab\u203a\u2039'),
		abbr,
		dash: dashes ? wsEsc(dashes) : '',
		ordinal,
	};
	// …and its speech verbs, which keep a speech tag with its quotation where no capital can (A677)
	const sayWords = L('speech verbs').map(wsLower).filter(Boolean);
	const sentences = (text: string): WsSentence[] => {
		const out: WsSentence[] = [];
		SPLIT.lastIndex = 0;
		let m;
		while ((m = SPLIT.exec(text))) {
			if (!m[0].trim()) continue;
			const raw = m[0], from = m.index, to = from + raw.replace(/\s+$/, '').length;
			if (to <= from) continue;
			const prev = out.length ? out[out.length - 1] : null;
			if (prev) {
				const tail = text.slice(prev.from, prev.to);
				const last = wsLower((/(\S+)$/.exec(tail) || ['', ''])[1]).replace(/^[\p{Ps}\p{Pi}"'\u201e\u201a\u00ab\u00bb]+/u, '');
				// an initial, or letters each with its dot (R.G., U.S., A.J.: A642), ends no sentence
				const dotEnd = /\.$/.test(last) && (/^(\p{L}\.)+$/u.test(last) || abbr.has(last) || (ordinal && /^\d{1,3}\.$/.test(last)));
				// A PIECE WITH NO LETTER OR FIGURE IN IT (a zero-width space, a lone ";"), or one that opens with a
				// comma, a semicolon, a colon or a closing bracket (", 1975."), carries on the last (A642)
				const carries = !/[\p{L}\p{N}]/u.test(raw) || /^[\s\u200b]*[,;:)\]]/.test(raw);
				// A FULL STOP INSIDE A FIGURE never ends a sentence: 380.000, 14.12 (A610)
				const inFigure = /\d\.$/.test(tail) && /^\d/.test(raw);
				// 「…。」と: a quotation and the と that reports it are one sentence (A614)
				const quoted = /[\u300d\u300f]$/.test(tail) && /^(\u3068|\u3063\u3066)/.test(raw);
				// A SPEECH TAG AFTER A QUOTATION, WHERE NO CAPITAL SAYS WHETHER A SENTENCE GOES ON (A677, Korean “왜요?”
				// 그녀가 물었다, Chinese “……？”他问道): the piece opens in a script without case and names one of the pack’s speech verbs
				const said = /[\u201d\u300d\u300f\u00bb"]$/.test(tail) && /^[\s\p{Pd}]*\p{Lo}/u.test(raw)
					&& sayWords.some((v) => raw.toLowerCase().includes(v));
				if (dotEnd || inFigure || quoted || said || carries || /^[\p{P}\s]*\p{Ll}/u.test(raw) || /^[\u00ba\u00aa]/.test(raw) || wsQuoteHolds(text, prev.from, from, held)) {
					prev.to = to;
					prev.text = text.slice(prev.from, to).trim();
					continue;
				}
			}
			out.push({ from, to, text: raw.trim() });
		}
		return out;
	};

	// WORDS
	// an ordinal in letters is its figure's (19e, 1er, 3ème, 2nd) (A614)
	const WORDS = /(?![\u00ba\u00aa])\p{L}[\p{L}\p{M}'\u2019-]*|\d+(?:[.,:]\d+)*(?:\.?[\u00ba\u00aa])?(?:\p{Ll}{1,3}(?!\p{L}))?%?/gu;
	const push = (out: WsToken[], w: string, at: number) => { if (w) out.push({ w, lw: wsLower(w), from: at, to: at + w.length, tag: null }); };
	const tokenize = (text: string): WsToken[] => {
		const out: WsToken[] = [];
		if (segmented) {
			if (seg) {
				for (const s of seg.segment(text)) if (s.isWordLike) push(out, s.segment, s.index);
			} else {
				// no segmenter: each character of those scripts a word, a run of any other letters one
				const R = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]|\p{L}[\p{L}\p{M}]*|\d+/gu;
				let m;
				while ((m = R.exec(text))) push(out, m[0], m.index);
			}
			return out;
		}
		WORDS.lastIndex = 0;
		let m;
		while ((m = WORDS.exec(text))) {
			const w = m[0].replace(/[-'\u2019]+$/, '');
			if (!w) continue;
			// an elision, its own word: l'homme is l' and homme
			const ap = w.search(/['\u2019]/);
			// …unless the whole is a word the pack lists: c'est-à-dire, d'abord (A614)
			if (ap > 0 && ap < w.length - 1 && !lex.has(wsLower(w)) && elisions.has(wsLower(w.slice(0, ap + 1)).replace(/\u2019/g, "'"))) {
				push(out, w.slice(0, ap + 1), m.index);
				push(out, w.slice(ap + 1), m.index + ap + 1);
				continue;
			}
			push(out, w, m.index);
		}
		return out;
	};
	// THE PASSIVE'S WORDS, read before the tagger: a participle it does not otherwise know is a verb
	const pv = pack.keyed.passive || {};
	const helpers = new Set(wsListOfKeyed(pv.helpers).map(wsLower));
	const parts = wsListOfKeyed(pv.participle).map(wsPat);
	const notPart = new Set(wsListOfKeyed(pv.not).map(wsLower));
	const marks = wsListOfKeyed(pv.marks).map(wsPat).filter((p) => p.pre || p.suf || p.whole);
	const winRaw = String(pv.window || '').trim().toLowerCase();
	const clause = winRaw === 'clause';
	const hops = clause ? 12 : Math.max(0, Math.min(12, wsNum(winRaw) ?? 2));
	if (winRaw && !clause && wsNum(winRaw) === null) notes.push('Passive: window "' + pv.window + '" is not a number or "clause"');
	const isPart = (lw: string) => !notPart.has(lw) && parts.some((p) => (p.whole ? p.whole === lw
		: lw.length >= p.pre.length + p.suf.length + 2 && lw.startsWith(p.pre) && lw.endsWith(p.suf)));
	const tag = (text: string): WsToken[] => {
		const tokens = tokenize(text);
		const starts = sentences(text).map((s) => s.from);
		let si = 0;
		const guessed: boolean[] = [];
		for (const t of tokens) {
			let first = false;
			while (si < starts.length && starts[si] <= t.from) { first = true; si++; }
			t.first = first || tokens[0] === t;
			// THE ORDER: the lists as written; a figure; a capital mid-sentence (a
			// capital is evidence, a shortened form a guess: "Lage" is not "lag");
			// a shortened form in the lists; an ending; a participle; a capital
			// opening a sentence where the pack says so; else uncolored
			const lx = lex.get(t.lw);
			// A CAPITAL MID-SENTENCE OVER A LISTED VERB, ADJECTIVE OR ADVERB (A624, the news: German "das
			// Leben", "die Deutschen"), where the pack says so (capitalized over); not a quote's, a colon's or
			// a dash's first word, which wears a sentence's capital, nor a word in capitals
			if (lx && capTag && !t.first && capOver.has(lx) && /^\p{Lu}\p{Ll}/u.test(t.w) && !WS_CLAUSE_OPEN.test(wsCharBefore(text, t.from))) {
				t.tag = capTag; guessed.push(false); continue;
			}
			if (lx) { t.tag = lx; guessed.push(false); continue; }
			// A WORD AND ITS CLITIC (A610): geht’s, gibt’s, auto's are their word (an
			// elision in front, French l', was split off before this)
			const ap = t.lw.search(/['\u2019]/);
			// …a SHORT one only (A677): "об'єднаних", "п'ять" are Ukrainian words with an apostrophe inside, never
			// "об" and a clitic
			if (ap > 1 && t.lw.length - ap - 1 <= 3) {
				const ht = lex.get(t.lw.slice(0, ap)) || inflOf(t.lw.slice(0, ap));
				if (ht && ht !== 'NUM') { t.tag = ht; guessed.push(false); continue; }
			}
			if (/^\p{Nd}/u.test(t.lw)) { t.tag = 'NUM'; guessed.push(false); continue; }
			// A ROMAN NUMERAL IN CAPITALS (A677: "в XVI веке", "Петра I") is a figure; after the lists, so a
			// listed word that looks like one keeps its class (Italian "I", Polish "I" opening a sentence)
			if (/^[IVXLCDM]+$/.test(t.w) && /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(t.w)) { t.tag = 'NUM'; guessed.push(false); continue; }
			// a piece of an abbreviation, its dot right after it: known, and no class of its own
			if (abbrPieces.has(t.lw) && text.charAt(t.to) === '.') { t.tag = 'ABBR'; guessed.push(false); continue; }
			const cap = /^\p{Lu}/u.test(t.w);
			if (capTag && !t.first && cap) { t.tag = capTag; guessed.push(false); continue; }
			const inf = inflOf(t.lw);
			if (inf) { t.tag = inf; guessed.push(false); continue; }
			// A HYPHENATED WORD (A614): a compound takes its last part's class where that is a
			// word of meaning (norte-americanos, rotatie-energie); a verb and its clitic take the
			// first part's (disse-lhe, dit-il), the last being a known pronoun, and fall to the
			// endings when the verb is unknown (grogna-t-il), never to the pronoun's class
			if (t.lw.indexOf('-') > 0) {
				const bits = t.lw.split('-').filter(Boolean);
				const of = (p: string) => lex.get(p) || inflOf(p) || endingOf(p);
				const lastT = bits.length > 1 ? of(bits[bits.length - 1]) : '';
				const ht = !lastT ? '' : /^(NOUN|ADJ|VERB|ADV)$/.test(lastT) ? lastT : of(bits[0]);
				if (ht) { t.tag = ht; guessed.push(false); continue; }
			}
			const en = endingOf(t.lw) || (isPart(t.lw) || inflections.some((f) => !f.on && t.lw.endsWith(f.off) && isPart(t.lw.slice(0, -f.off.length))) ? 'VERB' : '');
			// a capital opening a sentence outranks a verb's ending, which is a lowercase word's
			// evidence ("Brot" is no -t verb); a noun's or an adjective's ending still speaks
			if (capFirstTag && t.first && cap && (!en || en === 'VERB')) { t.tag = capFirstTag; guessed.push(false); continue; }
			// …AND MID-SENTENCE A CAPITAL IS NEVER A VERB'S (A677: Russian "Татьяна", "Светлана" read as
			// participles by the passive's …ана): the verb guess is dropped, an adjective's kept ("Московской
			// области"); a quote's, a colon's or a dash's first word wears a sentence's capital and keeps it
			const capVerb = en === 'VERB' && cap && !t.first && !WS_CLAUSE_OPEN.test(wsCharBefore(text, t.from));
			t.tag = capVerb ? null : en || null;
			guessed.push(true);
		}
		// A PHRASE OF A CLASS (A621): every word of it that class, the longest first
		for (const r of match(tokens, text, lexPm)) {
			for (let i = 0; i < tokens.length; i++) if (tokens[i].from >= r.from && tokens[i].to <= r.to) { tokens[i].tag = r.kind; guessed[i] = false; }
		}
		// A VERB BY ITS MARKER (A621)
		if (verbAfter.size || infAfter.size) for (let i = 0; i + 1 < tokens.length; i++) {
			const inf = infAfter.has(tokens[i].lw);
			if (!inf && !verbAfter.has(tokens[i].lw)) continue;
			let j = i + 1, near = true;
			for (let hop = 0; ; hop++, j++) {
				if (j >= tokens.length || !/^\s+$/.test(text.slice(tokens[j - 1].to, tokens[j].from))) { near = false; break; }
				const tg = tokens[j].tag || '';
				const step = tg === 'PRON' || tg === 'PART' || (!inf && tg === 'DET') || lex.get(tokens[j].lw) === 'ADV';
				if (!step || hop >= 3) break;
			}
			if (!near) continue;
			const t = tokens[j];
			if (/^\p{Lu}/u.test(t.w) || closed.has(t.lw) || lex.get(t.lw) === 'ADV' || (t.tag && !WS_OPEN_TAGS.has(t.tag))) continue;
			if (inf && (!infEnds.some((e) => t.lw.length > e.length + 1 && t.lw.endsWith(e)) || notInf.some((e) => t.lw.endsWith(e)))) continue;
			t.tag = 'VERB'; guessed[j] = false;
		}
		// AN ARTICLE BY WHAT FOLLOWS IT (A674): a listed pronoun right before an adjective, a noun or a
		// figure is that word's article ("det nye Tilbygg", "den drik", "de 3"); before a verb, an
		// adverb or nothing it is the pronoun it was ("det er", "som den er")
		if (artBefore.size) for (let i = 0; i + 1 < tokens.length; i++) {
			const t = tokens[i], nx = tokens[i + 1];
			if (t.tag !== 'PRON' || !artBefore.has(t.lw) || !/^\s+$/.test(text.slice(t.to, nx.from))) continue;
			if (nx.tag === 'ADJ' || nx.tag === 'NOUN' || nx.tag === 'NUM') t.tag = 'DET';
		}
		// AN ADJECTIVE BY THE WORD BEFORE IT (A674): a guessed word right after a word of degree, or after
		// "and" with an adjective before that; never a capital, never across a comma, never an adverb its
		// ending names ("molto rapidamente", the Italian pack's own Expect)
		if (adjAfter.size || andWords.size) for (let i = 1; i < tokens.length; i++) {
			const t = tokens[i], pv = tokens[i - 1];
			if (!guessed[i] || t.tag === 'ADV' || /^\p{Lu}/u.test(t.w) || !/^\s+$/.test(text.slice(pv.to, t.from))) continue;
			const coord = andWords.has(pv.lw) && i >= 2 && tokens[i - 2].tag === 'ADJ' && /^\s+$/.test(text.slice(tokens[i - 2].to, pv.from));
			if (adjAfter.has(pv.lw) || coord) { t.tag = 'ADJ'; guessed[i] = false; }
		}
		// AN UNKNOWN WORD OPENING A SENTENCE (A674), where the pack names its class (opening: noun)
		if (openTag) for (let i = 0; i < tokens.length; i++) {
			if (tokens[i].first && guessed[i] && !tokens[i].tag) { tokens[i].tag = openTag; guessed[i] = false; }
		}
		if (after.size) for (let i = 1; i < tokens.length; i++) {
			// …and A PARTICIPLE RIGHT AFTER AN ARTICLE (A614): "um concentrado", "el resultado",
			// "der gebaute"; the article outranks the ending. A participle only: French "la
			// jugeant" is an object pronoun and its verb, and stays one
			const overArticle = tokens[i].tag === 'VERB' && tokens[i - 1].tag === 'DET' && isPart(tokens[i].lw);
			// …and a verb an ending guessed, after a class no verb follows (no verb after, A677)
			const overNoVerb = guessed[i] && tokens[i].tag === 'VERB' && noVerbAfter.has(tokens[i - 1].tag || '')
				&& /^\s+$/.test(text.slice(tokens[i - 1].to, tokens[i].from));
			if (overNoVerb) { tokens[i].tag = after.get(tokens[i - 1].tag || '') || 'NOUN'; continue; }
			if (!guessed[i] || (tokens[i].tag && !overArticle)) continue;
			const rule = after.get(tokens[i - 1].tag || '');
			if (rule) tokens[i].tag = rule;
		}
		if (unknownTag) for (let i = 0; i < tokens.length; i++) {
			if (guessed[i] && !tokens[i].tag && /\p{L}/u.test(tokens[i].w)) tokens[i].tag = unknownTag;
		}
		return tokens;
	};

	// PHRASES: the checks' words, matched over words in a row
	const phraseMap = (pairs: [string[], string][]) => {
		const map = new Map<string, string>();
		let longest = 1;
		for (const [words, kind] of pairs) for (const w of words) {
			const k = wsPhraseKey(w.replace(/\s*\([^)]*\)\s*$/, ''));
			if (!k) continue;
			map.set(k, kind);
			longest = Math.max(longest, segmented ? Math.min(8, k.length) : k.split(' ').length);
		}
		return { map, longest };
	};
	const match = (tokens: WsToken[], text: string, pm: { map: Map<string, string>; longest: number }) => {
		const out: { from: number; to: number; kind: string }[] = [];
		if (!pm.map.size) return out;
		for (let i = 0; i < tokens.length;) {
			let best = -1, kind = '', key = '';
			for (let j = i; j < tokens.length && j - i < pm.longest; j++) {
				if (j > i) {
					const gap = text.slice(tokens[j - 1].to, tokens[j].from);
					if (!/^\s*$/.test(gap)) break;
					key += gap ? ' ' : '';
				}
				key += tokens[j].lw;
				const k = pm.map.get(key);
				if (k) { best = j; kind = k; }
			}
			if (best >= 0) { out.push({ from: tokens[i].from, to: tokens[best].to, kind }); i = best + 1; }
			else i++;
		}
		return out;
	};
	const fillerPm = phraseMap([[L('soft filler'), 'soft'], [L('filler words'), 'strong'], [L('hedges'), 'strong']]);
	// the classes' own phrases (A621), the first heading in WS_LEX_ORDER winning as for a word
	// …AND IN A SEGMENTED SCRIPT EVERY LISTED WORD OF TWO CHARACTERS OR MORE (A624): the segmenter cuts listed
	// words in two (网民 as 网|民, 読売新聞 as 読|売|新聞), and the pieces joined are the word
	const lexPm = phraseMap(WS_LEX_ORDER.slice().reverse().map(([k, tag]): [string[], string] => [L(k).filter((w) => {
		const lw = wsLower(w).trim();
		return segmented ? Array.from(lw).length > 1 : /\s/.test(lw);
	}), tag]));
	const misusedPm = phraseMap([[(pack.tables.misused || []).map((r) => r[0] || ''), 'misused']]);
	const vague = new Set(L('loose pronouns').map(wsLower));

	const passive = (tokens: WsToken[], text: string): WsSpan[] => {
		const out: WsSpan[] = [];
		// THE PASSIVE: a helper, then a participle within the window, in one sentence
		if (helpers.size && parts.length) {
			for (let i = 0; i < tokens.length; i++) {
				if (!helpers.has(tokens[i].lw)) continue;
				for (let j = i + 1; j < tokens.length && j - i - 1 <= hops; j++) {
					const gap = text.slice(tokens[j - 1].to, tokens[j].from);
					if (tokens[j].first || /[;:]/.test(gap) || (clause && /[,\u2014\u2013]/.test(gap))) break;
					if (!isPart(tokens[j].lw)) continue;
					if (j - i <= 3) out.push({ from: tokens[i].from, to: tokens[j].to });
					else { out.push({ from: tokens[i].from, to: tokens[i].to }); out.push({ from: tokens[j].from, to: tokens[j].to }); }
					i = j;
					break;
				}
			}
		}
		// a mark in the text, for a language whose passive is written inside its words
		for (const p of marks) {
			const needle = p.whole || (p.suf && !p.pre ? p.suf : p.pre);
			if (!needle) continue;
			for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
				let from = at, to = at + needle.length;
				// …never in a word the pack says is none (A677, Korean: 오래된 "old" ends as …된 does)
				const host = tokens.find((t) => t.from <= at && t.to >= to);
				if (host && notPart.has(host.lw)) continue;
				if (p.suf && !p.pre) {   // …された: the word before it with it
					let prev: WsToken | null = null;
					for (const t of tokens) { if (t.from < at) prev = t; else break; }
					if (prev) from = Math.min(from, prev.from);
				} else if (p.pre && !p.suf) {   // 被…: the word after it with it
					const next = tokens.find((t) => t.from >= to);
					if (next) to = next.to;
				}
				out.push({ from, to });
			}
		}
		return out.sort((a, b) => a.from - b.from);
	};

	// SYLLABLES AND SUMS
	const rd = pack.keyed.readability || {};
	const vowelStr = wsListOfKeyed(rd.vowels).join('') || WS_DEFAULT_VOWELS;
	const vowels = new Set(Array.from(wsLower(vowelStr)));
	const diph = wsListOfKeyed(rd.diphthongs).map(wsLower).sort((a, b) => b.length - a.length);
	const silent = wsListOfKeyed(rd.silent).map(wsLower).sort((a, b) => b.length - a.length);
	const common = new Set(Array.from(L('common characters').join('')));
	const syllables = (word: string): number => {
		let w = wsLower(word);
		if (!WS_LETTER.test(w)) { const d = w.replace(/[^0-9]/g, '').length; return d ? Math.min(6, d + 1) : 0; }
		for (const s of silent) if (w.length > s.length + 2 && w.endsWith(s)) { w = w.slice(0, -s.length); break; }
		let n = 0;
		for (let i = 0; i < w.length;) {
			if (!vowels.has(w[i])) { i++; continue; }
			const d = diph.find((x) => w.startsWith(x, i));
			i += d ? d.length : 1;
			n++;
		}
		return Math.max(1, n);
	};
	const sumsInto = (text: string, into: WsReadSums): boolean => {
		const toks = tokenize(text);
		if (!toks.length) return false;
		const add = (k: string, v: number) => { into[k] = (into[k] || 0) + v; };
		add('sentences', 1);
		for (const t of toks) {
			const letters = (t.w.match(/\p{L}/gu) || []).length;
			const syl = segmented ? 0 : syllables(t.w);
			add('words', 1); add('letters', letters); add('syllables', syl);
			if (letters > 6) add('long', 1);
			if (syl === 1) add('mono', 1);
			if (syl >= 3) add('poly3', 1);
			if (syl >= 4) add('poly4', 1);
		}
		// the characters, for the languages counted by them: script runs, rare ones, commas
		let run = '', len = 0;
		const close = () => { if (run && len) { add(run + 'Len', len); add(run + 'N', 1); } run = ''; len = 0; };
		for (const ch of Array.from(text)) {
			const k = WS_HAN.test(ch) ? 'c' : WS_HIRA.test(ch) ? 'h' : WS_KATA.test(ch) ? 'k' : /[\p{L}\p{N}]/u.test(ch) ? 'a' : '';
			if (k) {
				add('chars', 1);
				if (k === 'c') { add('han', 1); if (common.size && !common.has(ch)) add('rare', 1); }
			}
			if (/[\u3001\uff0c,]/.test(ch)) add('commas', 1);
			if (k !== run) { close(); run = k; }
			if (k) len++;
		}
		close();
		return true;
	};
	const formula = wsLower(rd.formula || '');
	if (formula && !WS_PACK_FORMULAS[formula]) notes.push('Readability: "' + rd.formula + '" is not a formula this engine knows');
	const coef: Record<string, number> = {};
	for (const k of Object.keys(rd)) { const v = wsNum(rd[k]); if (v !== null) coef[k] = v; }
	const gradeOf = (s: WsReadSums) => (WS_PACK_FORMULAS[formula] ? wsGradeOf(formula, coef, s) : 0);

	// REPETITION: the function words and the pack's own list left out; a word
	// keyed by its stem where an inflection comes off
	const repIgnore = new Set([...closed, ...L('repetition ignore').map(wsLower)]);
	const repMin = wsNum(pack.props['repeat-min']);
	const stem = (w: string) => {
		for (const f of inflections) if (w.length - f.off.length >= 4 && w.endsWith(f.off)) return w.slice(0, -f.off.length) + f.on;
		return w;
	};

	return {
		lang: pack.lang,
		segmented,
		tag,
		filler: (tokens, text, soft) => match(tokens, text, fillerPm).filter((h) => soft || h.kind !== 'soft').map((h) => ({ from: h.from, to: h.to })),
		passive,
		illusions: (tokens) => {
			const out: WsSpan[] = [];
			if (segmented) return out;   // a doubled word is grammar there (看看, 時々)
			for (let i = 1; i < tokens.length; i++) {
				const a = tokens[i - 1], b = tokens[i];
				if (a.lw === b.lw && b.lw.length >= 2 && !closed.has(b.lw) && !/^\d/.test(b.lw)) out.push({ from: a.from, to: b.to });
			}
			return out;
		},
		misused: (tokens, text) => match(tokens, text, misusedPm).map((h) => ({ from: h.from, to: h.to })),
		vague: (t, next) => !!t.first && vague.has(t.lw) && !(next && (next.tag === 'NOUN' || next.tag === 'ADJ' || next.tag === 'NUM')),
		sentences,
		wordsIn: (text) => tokenize(text).length,
		sentenceGrade: (text) => {
			if (!WS_PACK_FORMULAS[formula]) return null;
			const s: WsReadSums = {};
			if (!sumsInto(text, s) || (s.words || 0) < 4) return null;
			return gradeOf(s);
		},
		repetitions: (tokens, windowSize, minLength) => {
			const out: WsSpan[] = [];
			const min = repMin !== null ? repMin : minLength;
			const last = new Map<string, { i: number; from: number; to: number; flagged: boolean }>();
			for (let i = 0; i < tokens.length; i++) {
				const t = tokens[i];
				const w = t.lw.replace(/[^\p{L}\p{M}']/gu, '');
				if (Array.from(w).length < min || repIgnore.has(w)) continue;
				const key = stem(w);
				const prev = last.get(key);
				if (prev && i - prev.i <= windowSize) {
					if (!prev.flagged) out.push({ from: prev.from, to: prev.to });
					out.push({ from: t.from, to: t.to });
					last.set(key, { i, from: t.from, to: t.to, flagged: true });
				} else last.set(key, { i, from: t.from, to: t.to, flagged: false });
			}
			return out;
		},
		sumsInto,
		gradeOf,
		isCommon: (lw) => closed.has(wsLower(lw)) || repIgnore.has(wsLower(lw)),
		sentenceStart: (before, prevLine) => wsSentenceStart(before, prevLine, capMarks),
		dialogue,
		notes,
	};
}
