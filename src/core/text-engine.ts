// Word-Smith — text-engine: the English engine and the counting: words, their parts of speech, the writing checks, readability, repetition, dialogue, smart typography, where a sentence starts, which lines are prose, paragraphs, the word count and the masks it reads through.
// Out of preamble.ts on the writer's "Do all", 2026-10-22, the text as it was; preamble re-exports all of it, so
// a module that imports from preamble is unchanged.

import { POS_LEX, LY_NOT_ADVERB } from './preamble';

// ── Tokenizer ────────────────────────────────────────────────────────────────

// Numbers are tokens too — "the 747 carried 416 passengers" is a
// five-word sentence, not a three-word one, and the rhythm grade was
// quietly wrong on any prose with figures in it. The separator part
// only continues into another digit, so the full stop after "in 1984."
// stays outside the token and sentence detection still sees it.
//
// LATIN LETTERS, NOT A\u2013Z (A482): an English writer's caf\u00e9, na\u00efve, r\u00e9sum\u00e9
// and Zo\u00eb were cut at the accent \u2014 "caf", "na" + "ve", "r" + "sum" \u2014 and
// each piece was tagged and checked as a word of its own. \p{M} keeps a
// decomposed accent (e + U+0301) inside its word. The Latin SCRIPT, not
// every letter: the tagger is English, and a run of Chinese or Cyrillic
// read as one unknown word would be coloured as a noun it knows nothing
// about \u2014 outside the script is outside the tagger, as before.
// THE ORDINAL MARKS (A610): º and ª belong to their figure (1.º, 2.ª) and are never a
// word's first letter (n.º is one word).
export const WORD_RE = /(?![\u00ba\u00aa])\p{Script=Latin}[\p{Script=Latin}\p{M}'\u2019-]*|\d+(?:[.,:]\d+)*(?:\.?[\u00ba\u00aa])?%?/gu;

// One word of a line as the checks see it: the text, lowered, its span, the
// tag the tagger gives it, and whether it opens a sentence.
export interface WsToken { w: string; lw: string; from: number; to: number; tag: string | null; first?: boolean; guess?: boolean }
export function tokenizeLine(text: string) {
	const out: WsToken[] = [];
	WORD_RE.lastIndex = 0;
	let m;
	while ((m = WORD_RE.exec(text))) {
		// Trailing hyphens/apostrophes belong to the markup, not the word.
		let w = m[0].replace(/[-'\u2019]+$/, '');
		if (!w) continue;
		out.push({ w, lw: w.toLowerCase().replace(/\u2019/g, "'"), from: m.index, to: m.index + w.length, tag: null });
	}
	return out;
}

// ── Suffix tagging ───────────────────────────────────────────────────────────

export function suffixTag(lw: string) {
	if (/^\d/.test(lw)) return 'NUM';
	if (lw.length > 3 && /ly$/.test(lw) && !LY_NOT_ADVERB.has(lw)) return 'ADV';
	if (lw.length > 4 && /(ing)$/.test(lw)) return 'VERB';
	// A HYPHENED -ED (A674): "dark-colored", "mass-produced", "blue-eyed" describe. After a
	// subject it is the verb again ("she double-checked"), which the context rules settle.
	if (lw.includes('-') && /ed$/.test(lw)) return 'ADJ';
	if (lw.length > 3 && /(ed)$/.test(lw)) return 'VERB';
	if (lw.length > 4 && /(est)$/.test(lw)) return 'ADJ';
	if (lw.length > 4 && /(tion|sion|ment|ness|ity|ance|ence|ship|hood|dom|ism|ist|acy|age|ure|ery|ology|graphy|itis|mony)$/.test(lw)) return 'NOUN';
	if (lw.length > 4 && /(ous|ful|less|ive|able|ible|ical|ic|ish|ary|ent|ant|ile|ory|some|like|ward|proof)$/.test(lw)) return 'ADJ';
	if (lw.length > 4 && /(ize|ise|ate|ify|fy)$/.test(lw)) return 'VERB';
	if (lw.length > 3 && /(er|or)$/.test(lw)) return 'NOUN';
	if (lw.length > 3 && /s$/.test(lw) && !/ss$/.test(lw)) {
		const base = lw.replace(/(ies|es|s)$/, (m): string => (m === 'ies' ? 'y' : ''));
		if (POS_LEX[base] === 'VERB') return 'VERB';
		return 'NOUN';
	}
	// Anything else is a noun, a capitalised name mid-sentence included: the
	// proper-noun test that stood here returned the same NOUN as this line and
	// could change nothing (found by A482's sweep: a case on it passed anyway).
	return 'NOUN';
}

// ── Context rules ────────────────────────────────────────────────────────────

export const SENT_END = /[.!?\u2026]$/;

// Adverbs that grade a quality rather than modify an action.
export const DEGREE_ADVERBS = new Set(['very', 'so', 'too', 'quite', 'rather',
	'really', 'extremely', 'incredibly', 'terribly', 'awfully', 'fairly',
	'pretty', 'somewhat', 'deeply', 'highly', 'utterly', 'truly',
	'remarkably', 'surprisingly', 'perfectly', 'entirely', 'completely']);

// Words that go flat after a verb — same form as the adjective, adverb
// duty: "ran close", "went straight on", "held tight", "fell hard".
export const FLAT_ADVERBS = new Set(['close', 'fast', 'hard', 'tight', 'straight',
	'high', 'low', 'deep', 'long', 'far', 'near', 'early', 'late', 'slow',
	'quick', 'loud', 'wide', 'right', 'wrong', 'first', 'last']);

// Verbs that link a subject to a description rather than an object.
export const LINKING_VERBS = new Set(`seem seems seemed appear appears appeared
	look looks looked feel feels felt sound sounds sounded smell smells
	smelled taste tastes tasted grow grows grew turn turns turned remain
	remains remained stay stays stayed become becomes became get gets got
	getting`.split(/\s+/).filter(Boolean));

// Full stops that do not end sentences. "e.g." and initials tokenize as
// single letters, so those are handled by length; this set covers the
// multi-letter cases. Without it, "Dr. Smith said it" opens a false
// sentence at "Smith" — and the loose-pronoun check downstream then fires
// on perfectly anchored mid-sentence pronouns, while the rhythm grade is
// computed on half-sentences.
export const ABBREVIATIONS = new Set(`mr mrs ms dr prof rev gen sen rep hon st mt
	ft vs etc al cf ca approx dept est fig vol ch pp no op ed inc ltd co
	corp univ assn bros jan feb mar apr jun jul aug sep sept oct nov dec
	mon tue tues wed thu thurs fri sat sun`.split(/\s+/).filter(Boolean));

export const SUBJECT_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'who']);

// A674, from the held-out English (Pride and Prejudice and the "Coffee" article):
// a word shaped like a thing ("the gentleman", "the government") is no modifier
// even between "the" and a noun; the be-forms that hand a predicate its slot; the
// irregular pasts that keep their verb after "which" ("which became").
const WS_NOUN_SHAPE = /(tion|sion|ment|ness|ity|ance|ence|ship|hood|dom|ism|acy|ology|graphy|mony|[^u]man|men)$/;
const WS_BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const WS_IRREGULAR_PAST = new Set(`went came made took saw knew thought said told gave found felt left kept
	began held brought wrote stood heard meant met paid sat spoke lay led grew won bought sent built fell
	became got ran`.split(/\s+/).filter(Boolean));

export function tagTokens(tokens: WsToken[], text: string) {
	// Pass 1 — lexicon, then suffix. Sentence starts use one token of
	// lookahead: a full stop only opens a new sentence when the word before
	// it is not an abbreviation or an initial, and the word after it is
	// capitalised.
	let firstInSentence = true;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const lex = POS_LEX[t.lw];
		t.first = firstInSentence;
		// Contracted auxiliaries attach to anything — "Dinah'll miss me",
		// "the key'd vanished" — so the known-word list can never cover
		// them all. The ending is the tag. 's stays out (possessives), and
		// ma'am is a word that merely ends like "I'm".
		let dyn = null;
		if (!lex && t.lw !== "ma'am") {
			const cm = /'(ll|d|re|ve|m)$/.exec(t.lw);
			if (cm) dyn = (cm[1] === 'll' || cm[1] === 'd') ? 'MOD' : 'AUX';
		}
		t.tag = lex || dyn || suffixTag(t.lw);
		// a word the lexicon does not hold is a guess (A840: what a learned rule with no word may change)
		if (!lex && !dyn) t.guess = true;
		// THE PIECES OF A FIGURE OR AN ABBREVIATION (A674): "the 15th century" is a figure and its
		// letters, "e.g." two letters with stops; none of them is a word to color.
		const before = i > 0 ? tokens[i - 1] : null;
		if (/^(st|nd|rd|th)$/.test(t.lw) && before && before.tag === 'NUM' && before.to === t.from) { t.tag = 'NUM'; t.guess = false; }
		else if (t.lw.length === 1 && text.charAt(t.to) === '.' && (!/^[aio]$/.test(t.lw) || /\p{L}/u.test(text.charAt(t.to + 1)))) { t.tag = 'ABBR'; t.guess = false; }
		// A sentence ends when the character right after this token is a
		// terminator (the tokenizer never swallows punctuation).
		const after = text.slice(t.to, t.to + 2);
		const ch = after.trim().charAt(0) || '';
		if (!SENT_END.test(ch)) { firstInSentence = false; continue; }
		if (ch !== '.') { firstInSentence = true; continue; }
		const nx = tokens[i + 1];
		firstInSentence = !(ABBREVIATIONS.has(t.lw) || t.lw.length === 1) &&
			(!nx || /^\p{Lu}/u.test(nx.w));
	}

	// Two words read together only with nothing but space between them: a comma,
	// a dash or a bracket ends the phrase ("in popularity, coffee"). A capital
	// mid-sentence is a name, and a name is the thing itself (A674).
	const linked = (a: WsToken, b: WsToken) => !/\S/.test(text.slice(a.to, b.from));
	const named = (x: WsToken) => !x.first && /^\p{Lu}/u.test(x.w);
	// THE THING AFTER "THE" AND AN ADJECTIVE (A674): "the earliest reports", "the
	// best works" are things, read before the adjective decides whether a noun
	// follows it.
	for (let i = 2; i < tokens.length; i++) {
		const t = tokens[i], a = tokens[i - 1];
		if (t.tag === 'VERB' && POS_LEX[t.lw] === 'VERB' && !/(ed|ing)$/.test(t.lw) && !WS_IRREGULAR_PAST.has(t.lw) &&
			a.tag === 'ADJ' && tokens[i - 2].tag === 'DET' && linked(a, t) && linked(tokens[i - 2], a)) t.tag = 'NOUN';
	}

	// Pass 2 — context. Cheap, local, and in the order that matters:
	// determiner/preposition demotion before infinitive promotion, so
	// "the run" stays a noun but "to run" becomes a verb.
	for (let i = 0; i < tokens.length; i++) {
		const t    = tokens[i];
		const prev = i > 0 ? tokens[i - 1] : null;
		const next = i + 1 < tokens.length ? tokens[i + 1] : null;

		// A POSSESSIVE OWNS A THING (A674): "the plant's use", "her mother's love".
		// Not a participle, which the 's of "has" brings ("John's gone").
		if (t.tag === 'VERB' && prev && prev.tag === 'NOUN' && /'s$/.test(prev.lw) && linked(prev, t) &&
			!/(ed|ing|en|ne|wn)$/.test(t.lw) && !WS_IRREGULAR_PAST.has(t.lw)) {
			t.tag = 'NOUN';
		}
		// "WHICH BECAME" (A674): after "which" or "what" a past or a third person
		// is the clause's verb, not a thing the word points at ("which book").
		// The relative "that" too, "the house that stood" (A839), unless a thing
		// follows and the word modifies it ("that painted wall").
		const relVerb = !!prev && (/^(which|what|whatever|whichever)$/.test(prev.lw) ||
			(prev.lw === 'that' && !(next && next.tag === 'NOUN' && linked(t, next)))) &&
			(/(ed|[^s]s)$/.test(t.lw) || WS_IRREGULAR_PAST.has(t.lw));
		if (t.tag === 'ADJ' && t.lw.includes('-') && /ed$/.test(t.lw) && prev && prev.tag === 'PRON' && SUBJECT_PRONOUNS.has(prev.lw)) {
			t.tag = 'VERB';
		}

		// "the work", "a call", "in place" → noun, not verb. An -ing word
		// in the same slot is a gerund ("the meeting") unless a noun
		// follows, which makes it a participial modifier ("the running
		// water"). -ed words after a determiner are always modifiers.
		if (t.tag === 'VERB' && prev && (prev.tag === 'DET' || prev.tag === 'PREP') && !relVerb) {
			// "made her feel", "let her go" — a causative verb two back
			// means "her" is the object and this is a bare infinitive, not
			// a possession.
			const causative = prev.lw === 'her' && POS_LEX[t.lw] === 'VERB' &&
				i >= 2 && tokens[i - 2].tag === 'VERB';
			if (causative) { /* stays a verb */ }
			else if (/ed$/.test(t.lw))  t.tag = 'ADJ';
			else if (/ing$/.test(t.lw)) {
				// "the meeting" is a thing and "the running water" a
				// modifier — but only after a determiner. A gerund after a
				// preposition is an action being talked about ("of getting
				// up", "by running fast", "without looking"), and demoting
				// those stripped the verbs out of half of any literary
				// sentence.
				if (prev.tag === 'DET') t.tag = (next && next.tag === 'NOUN') ? 'ADJ' : 'NOUN';
			}
			else                        t.tag = 'NOUN';
		}
		// A handful of lexicon adverbs moonlight as nouns, and a determiner
		// settles it: "the well", "her back". Unless a noun follows, in
		// which case they are modifying it and the compound rule below has
		// the better claim ("the back door").
		if (t.tag === 'ADV' && (t.lw === 'well' || t.lw === 'back') && prev &&
			prev.tag === 'DET' && (!next || (next.tag !== 'NOUN' && next.tag !== 'ADJ'))) {
			t.tag = 'NOUN';
		}
		// Determiner + adjective with no noun after it → the adjective is
		// carrying the noun slot ("the poor", "the best").
		// "The dark one", "the red ones" (A674): "one" holds the noun's place.
		// Nor a participle with its noun after it: "the oldest prepared foods".
		const after = i + 2 < tokens.length ? tokens[i + 2] : null;
		if (t.tag === 'ADJ' && prev && prev.tag === 'DET' && (!next || next.tag !== 'NOUN') &&
			!(next && /^(one|ones)$/.test(next.lw)) &&
			!(next && next.tag === 'VERB' && /(ed|ing)$/.test(next.lw) && after && after.tag === 'NOUN')) {
			// leave adjectives that clearly modify something later
			if (!next || (next.tag !== 'ADJ' && next.tag !== 'NOUN')) t.tag = 'NOUN';
		}
		// "to write" → infinitive.
		if (prev && prev.tag === 'TO' && (t.tag === 'NOUN' || t.tag === 'ADJ') && POS_LEX[t.lw] !== 'NOUN' &&
			!/(ness|ity|hood|dom|ism|acy|ology|graphy|mony)$/.test(t.lw)) {
			t.tag = 'VERB';
		}
		// Auxiliary or modal followed by a participle-shaped word → verb —
		// but only for words the lexicon doesn't already know. "nothing",
		// "something", "morning" and "evening" end in -ing too, and "it was
		// nothing" is not a verb phrase.
		if (prev && (prev.tag === 'AUX' || prev.tag === 'MOD') && t.tag === 'NOUN' &&
			!POS_LEX[t.lw] && /ing$|ed$|en$/.test(t.lw)) {
			t.tag = 'VERB';
		}
		// "to do", "to be", "to have" — an auxiliary right after "to" is a
		// plain infinitive: the marker gets its TO tag and the verb its own.
		if (t.lw === 'to' && next && next.tag === 'AUX' &&
			/^(do|be|have)$/.test(next.lw)) {
			t.tag = 'TO';
			next.tag = 'VERB';
		}
		// Negated do-support is followed by a bare verb, full stop —
		// "don't panic", "didn't time it" — whatever the lexicon thinks
		// the word is elsewhere.
		if (prev && /^(don't|doesn't|didn't)$/.test(prev.lw) &&
			(t.tag === 'NOUN' || t.tag === 'ADJ')) {
			t.tag = 'VERB';
		}
		// A modal followed by a word the lexicon does not know is a bare
		// verb too ("will attempt", "can't panic") — unless the next token
		// is an auxiliary, which is subject–aux inversion with a noun in
		// the middle ("can food be stored").
		if (prev && prev.tag === 'MOD' && (t.tag === 'NOUN' || t.tag === 'ADJ') &&
			!POS_LEX[t.lw] && !(next && next.tag === 'AUX')) {
			t.tag = 'VERB';
		}
		// A degree adverb grades a quality: "very sleepy", "quite odd",
		// "so tired". Unknown words in that slot are adjectives, unless a
		// noun follows to claim them ("very hungry wolves" keeps hungry
		// for the rule two below).
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && DEGREE_ADVERBS.has(prev.lw) &&
			(!next || next.tag !== 'NOUN')) {
			t.tag = 'ADJ';
		}
		// Coordination copies the part of speech across: in "sleepy and
		// stupid" the second word rides on the first.
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next !== undefined && !named(t) &&
			(prev.lw === 'and' || prev.lw === 'or' || prev.lw === 'but') &&
			i >= 2 && tokens[i - 2].tag === 'ADJ' && (!next || next.tag !== 'NOUN')) {
			t.tag = 'ADJ';
		}
		// Noun immediately before a noun, where the first is also an
		// adjective by suffix, reads as a modifier.
		if (t.tag === 'NOUN' && next && next.tag === 'NOUN' && /(ic|al|ive|ous|ful)$/.test(t.lw)) {
			t.tag = 'ADJ';
		}
		// An unknown word between a determiner (or another adjective) and a
		// noun is filling the modifier slot: "her difficult book". Limited to
		// words the lexicon does not claim, so noun-noun compounds like "the
		// book cover" keep both nouns. NOT A PLURAL (A592): "the anvils glow"
		// read anvils as a modifier of glow; a word in -s is the thing itself.
		// Not across a comma, not a name, not a word shaped like a thing (A674:
		// "in popularity, coffee", "the Kaffa region", "this gentleman dislikes").
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next && !/[^s]s$/.test(t.lw) &&
			(prev.tag === 'DET' || prev.tag === 'ADJ' || prev.tag === 'PREP') && next.tag === 'NOUN' &&
			linked(t, next) && !named(t) && !WS_NOUN_SHAPE.test(t.lw)) {
			t.tag = 'ADJ';
		}
		// THE PLURAL'S VERB (A592): after "the <plural>", an unknown word that is
		// not itself a plural, with no noun after it to modify and no verb after
		// it to be the subject of ("the boys club meets"), is what the plural
		// does: "the anvils glow", "the dogs bark".
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && !/s$/.test(t.lw) && prev && prev.tag === 'NOUN' && /[^s']s$/.test(prev.lw) &&
			i >= 2 && tokens[i - 2].tag === 'DET' && (!next || !/^(NOUN|ADJ|VERB|AUX|MOD)$/.test(next.tag || ''))) {
			t.tag = 'VERB';
		}
		// Sentence-initial word followed by a determiner or pronoun, with no
		// lexicon entry claiming it as a noun, is almost always an
		// imperative verb ("Check the file", "Open your notes"). Not a plural
		// (A594, English Wikipedia: "Additives such as gum are used").
		if (t.first && t.tag === 'NOUN' && !POS_LEX[t.lw] && !/[^su]s$/.test(t.lw) && next &&
			(next.tag === 'DET' || next.tag === 'PRON')) {
			t.tag = 'VERB';
		}
		// A subject pronoun followed by a word the lexicon does not know is
		// carrying the verb slot: "I sprint", "they scribble". Restricted
		// to unknown words so lexicon nouns survive ("I, Claudius" aside,
		// "it time we left" is not prose worth guessing about).
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && prev.tag === 'PRON' &&
			SUBJECT_PRONOUNS.has(prev.lw)) {
			t.tag = 'VERB';
		}

		// A linking verb hands its slot to a description, not a thing:
		// "seems fine", "looked ancient", "felt wrong". Only unknown
		// words move, and only when no noun follows to claim them
		// ("became president" keeps its noun).
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && prev.tag === 'VERB' && LINKING_VERBS.has(prev.lw) &&
			(!next || (next.tag !== 'NOUN' && next.tag !== 'DET'))) {
			t.tag = 'ADJ';
		}
		// A BE-FORM'S PREDICATE (A674): "am fond of", "is cruel to", "is totally
		// wrong." An unknown word after "is" (an adverb between allowed) with
		// nothing after it to modify describes; a word shaped like a thing does
		// not ("was sabotage", "is surgery").
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && !named(t) && !/[^s']s$/.test(t.lw) &&
			!WS_NOUN_SHAPE.test(t.lw) && !/(age|ery|ist|itis)$/.test(t.lw)) {
			const be = linked(prev, t) && (WS_BE_FORMS.has(prev.lw) || (prev.tag === 'ADV' && i >= 2 && WS_BE_FORMS.has(tokens[i - 2].lw)));
			if (be && (!next || next.first || !linked(t, next) || !/^(NOUN|DET|ADJ|PRON|NUM|VERB)$/.test(next.tag || ''))) t.tag = 'ADJ';
		}
		// "SO" GRADES (A674): "so much", "so serious", "so tired" — the adverb,
		// where "so we left" joins.
		if (t.lw === 'so' && t.tag === 'CONJ' && next && linked(t, next) &&
			(next.tag === 'ADJ' || next.tag === 'ADV' || /^(much|many|few|little|far|long|well|often)$/.test(next.lw) ||
			 (next.tag === 'VERB' && !POS_LEX[next.lw] && /ed$/.test(next.lw)))) {
			t.tag = 'ADV';
		}
		// WHAT A THING DOES TO ANOTHER (A674): an unknown word in -s between a
		// singular noun and a determiner is the noun's verb: "this gentleman
		// dislikes the amusement", "the house costs a fortune". An unknown noun the
		// modifier rule above took for an adjective, because this word looked like
		// its noun, is the subject again ("this farmer plows the field").
		const subject = !!prev && (prev.tag === 'NOUN' || (prev.tag === 'ADJ' && !POS_LEX[prev.lw] &&
			suffixTag(prev.lw) === 'NOUN' && i >= 2 && tokens[i - 2].tag === 'DET'));
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && /[^s']s$/.test(t.lw) && prev && subject &&
			!/s$/.test(prev.lw) && next && next.tag === 'DET' && linked(prev, t) && linked(t, next)) {
			t.tag = 'VERB';
			prev.tag = 'NOUN';
		}
		// Flat adverbs: adjective-shaped words straight after a verb are
		// doing adverb work — "ran close by her", "went straight on" —
		// unless a noun follows to be modified ("ran close races").
		if (prev && prev.tag === 'VERB' && FLAT_ADVERBS.has(t.lw) &&
			(t.tag === 'ADJ' || t.tag === 'NOUN' || t.tag === 'VERB') &&
			!(next && next.tag === 'NOUN')) {
			t.tag = 'ADV';
		}
		// "thought that she had", "the fact that the key" — "that" before
		// a subject is joining clauses, not pointing at anything. Before a
		// noun ("that man") or an auxiliary ("that would be four thousand
		// miles") it keeps its determiner/pronoun reading.
		if (t.lw === 'that' && t.tag === 'DET' && next &&
			((next.tag === 'PRON' && SUBJECT_PRONOUNS.has(next.lw)) || next.tag === 'DET')) {
			t.tag = 'CONJ';
		}
		// "like" earns its verb reading only with a subject or a modal in
		// front — "I like tea", "would like", "didn't like it". After a
		// be-form it is the preposition again: "she was like a ghost".
		if (t.lw === 'like' && prev &&
			((prev.tag === 'PRON' && SUBJECT_PRONOUNS.has(prev.lw)) || prev.tag === 'MOD' ||
			 /^(do|does|did|don't|doesn't|didn't|won't|can't|couldn't|wouldn't|shouldn't)$/.test(prev.lw))) {
			t.tag = 'VERB';
		}
		// A gerund opening a sentence with an auxiliary right after it is
		// the subject, not an action: "Running is hard", "Waiting was
		// the worst part".
		if (t.first && t.tag === 'VERB' && /ing$/.test(t.lw) && next &&
			(next.tag === 'AUX' || next.tag === 'MOD')) {
			t.tag = 'NOUN';
		}
	}

	// A POINTING WORD STANDING ALONE IS A PRONOUN (A839): "this is", "which
	// works", "those who", "what it means", "the house that stood" hold a
	// noun's place; before a thing or a quality they point ("this house",
	// "which one", "this very room"). A "that" joining clauses is a
	// conjunction already, decided above.
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.tag !== 'DET' || !/^(this|that|these|those|which|what|whichever|whatever)$/.test(t.lw)) continue;
		const next = tokens[i + 1], after = tokens[i + 2];
		if (next && /^(one|ones)$/.test(next.lw)) continue;
		if (next && next.tag === 'ADV' && after && linked(next, after) && (after.tag === 'NOUN' || after.tag === 'ADJ')) continue;
		if (!next || !linked(t, next) || /^(AUX|MOD|VERB|PREP|CONJ|TO|PRON|ADV)$/.test(next.tag || '')) t.tag = 'PRON';
	}

	// "to" is an infinitive marker before a verb and a preposition everywhere
	// else. Decided last, so the infinitive promotion above has already run
	// and "to write" is distinguishable from "to the shop".
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i].tag !== 'TO') continue;
		const next = tokens[i + 1];
		if (!next || next.tag !== 'VERB') tokens[i].tag = 'PREP';
	}
	return tokens;
}

// Collapse the internal tag set to the five highlight buckets.
export function posBucket(tag: string) {
	switch (tag) {
		case 'NOUN': case 'PRON': return 'noun';
		case 'VERB': case 'AUX': case 'MOD': return 'verb';
		case 'ADJ':  return 'adj';
		case 'ADV':  return 'adv';
		case 'CONJ': case 'PREP': return 'conj';
		default: return null;
	}
}

// ── Writing checks ───────────────────────────────────────────────────────────
// Categories follow Editsaurus, which in turn follows Matt Might's shell
// scripts: filler words, passive voice, lexical illusions, commonly misused
// words, and pronouns with loose referents. All of it is list-and-rule based
// and runs on the visible lines only.

// CLICHÉS, ENGLISH'S OWN (A839, the writer's pick "Clichés", "do these for all language packs"): stock phrases a reader
// has met too often to see; a pack lists its language's under `## Clichés (Cliches)`, and ws-lang-en.md shows these
// ENGLISH'S STOCK PHRASES (A839; A856, the writer: "bigger lists, verbal and written cliches, idioms and all that", with
// their 98 sayings and "a breath of fresh air", "love at first sight", "better safe than sorry"): written for Word-Smith,
// never copied from a published list. SLOTS (wsPhrasePattern): {a|b} any of these words, an empty choice optional, {*}
// any one word; a space takes a comma, so "easy come easy go" finds "easy come, easy go". A saying is stored as the
// core a writer reuses ("judge a book by its cover" finds "don't judge…" and "you can't judge…"). Left to Filler words:
// "needless to say", "each and every", "first and foremost" (the four both lists held before stay)
const WS_POSS = '{my|your|his|her|its|our|their}';
export const WS_CLICHES_EN: string[] = [
	// ── sayings: proverbs, adages, maxims, platitudes, truisms ──
	'absence makes the heart grow fonder', 'a friend in need is a friend indeed', 'age is just a number',
	"leopard {can't|cannot|doesn't|does not|never} {change|changes} its spots", "all's well that ends well",
	'an apple a day keeps the doctor away', 'actions speak louder than words', 'picture is worth a thousand words',
	'rolling stone gathers no moss', 'stitch in time saves nine', 'watched pot never boils',
	'beauty is in the eye of the beholder', 'beauty is only skin deep', 'better late than never', 'better safe than sorry',
	'birds of a feather', 'blood is thicker than water', '{bark|barks|barking|barked} up the wrong tree', 'break a leg',
	'{burn|burns|burning|burned|burnt} the midnight oil', 'curiosity killed the cat', "diamonds are a girl's best friend",
	'bite the hand that feeds {you|him|her|them|us|me}', 'count ' + WS_POSS + ' chickens before they hatch',
	'{cry|cries|crying|cried} over {spilled|spilt} milk', 'all ' + WS_POSS + ' eggs in one basket',
	'{throw|throws|throwing|threw|thrown} the baby out with the {bathwater|bath water}',
	'{put|puts|putting} the cart before the horse', 'easy come easy go', 'every cloud has a silver lining',
	'every dog has its day', 'every man for himself', 'every rose has its thorn', 'fools rush in',
	'good things come to those who wait', 'great minds think alike', 'haste makes waste', 'honesty is the best policy',
	"if it ain't broke", 'ignorance is bliss', 'takes two to tango', '{raining|rained|rains} cats and dogs',
	'keep your friends close', '{kill|kills|killing|killed} two birds with one stone', 'laughter is the best medicine',
	'{let|lets|letting} the cat out of the bag', 'look before you leap', 'love is blind', 'hay while the sun shines',
	'misery loves company', "money {doesn't|does not} grow on trees", 'look a gift horse in the mouth', 'no pain no gain',
	'old habits die hard', 'once in a blue moon', 'opportunity knocks', 'out of sight out of mind',
	'out of the frying pan', 'practice makes perfect', "rome {wasn't|was not} built in a day", 'seeing is believing',
	'silence is golden', 'while the iron is hot', "apple {doesn't|does not|never} {fall|falls} far from the tree",
	'ball is in ' + WS_POSS + ' court', 'best of both worlds', 'the bigger they are the harder they fall',
	'early bird catches the worm', 'grass is always greener', 'the more the merrier', 'pen is mightier than the sword',
	'pot calling the kettle black', 'road to hell is paved with good intentions', 'the show must go on',
	"{there's|there is} no place like home", 'no smoke without fire', "time flies when you're having fun", 'how time flies',
	'time heals all wounds', 'too many cooks', "two wrongs {don't|do not} make a right", 'variety is the spice of life',
	'when in rome', 'when one door closes', 'when the going gets tough', "where there's smoke",
	'have ' + WS_POSS + ' cake and eat it', 'judge a book by its cover', 'make an {omelette|omelet} without breaking',
	'teach an old dog new tricks', 'kiss a lot of frogs', 'reap what {you|they|we|he|she|i} {sow|sowed|sown}',
	'apple of {my|your|his|her|our|their} eye', 'everything happens for a reason', 'it is what it is',
	'you get what you pay for', 'time waits for no {one|man}', 'boys will be boys', "it's a small world", 'life goes on',
	"{life is|life's} too short", 'it could be worse', "what {doesn't|does not} kill you makes you stronger",
	'this too shall pass', "{there's|there is} a first time for everything", "{it's|it is} never too late",
	'follow ' + WS_POSS + ' heart', 'live and learn', 'live and let live', 'to each {their|his|her} own', 'enough is enough',
	'what will be will be', 'all good things {must |}come to an end', 'no news is good news', 'home is where the heart is',
	'the truth will set you free', "what's done is done", "{it's|it is} the thought that counts",
	'slow and steady wins the race', 'you only live once', 'knowledge is power', "money {can't|cannot} buy happiness",
	'patience is a virtue', 'the best things in life are free', 'all that glitters is not gold',
	"beggars {can't|cannot} be choosers", "all's fair in love and war", 'you can lead a horse to water',
	'what goes around comes around', 'the devil is in the details', 'the pen is mightier', 'the rest is history',
	'only time will tell', 'stood the test of time', 'time heals', 'easier said than done',
	// ── idioms ──
	'at the drop of a hat', 'add insult to injury', 'back to square one', 'back to the drawing board',
	'{beat|beats|beating|beaten} a dead horse', 'bend over backwards', 'between a rock and a hard place',
	'{bite|bit|bites|biting|bitten} off more than {*} {can|could} chew', 'blow off steam', 'break the bank',
	'{burn|burned|burnt|burning} ' + WS_POSS + ' bridges', 'by the book', 'call it a day', 'cost an arm and a leg',
	'an arm and a leg', 'cross that bridge when', 'cut corners', 'cut to the chase', "devil's advocate", 'down to earth',
	'like a fish out of water', 'a fish out of water', 'get out of hand', 'get the ball rolling',
	'the benefit of the doubt', 'go the extra mile', 'hang in there', '{hit|hits|hitting} the ground running',
	'hit the sack', 'in hot water', 'in the same boat', 'jump on the bandwagon', 'keep ' + WS_POSS + ' chin up',
	'let sleeping dogs lie', 'miss the boat', 'leave no stone unturned', 'off the hook', 'on thin ice',
	'once in a lifetime', 'out of the woods', 'over the moon', 'play it by ear', '{pull|pulling|pulled} ' + WS_POSS + ' leg',
	'rule of thumb', 'see eye to eye', '{spill|spilled|spilt|spilling} the beans', 'steal ' + WS_POSS + ' thunder',
	'with a grain of salt', 'the last straw', 'the whole nine yards', 'throw caution to the wind', 'turn a blind eye',
	'under the radar', 'up in the air', 'wild goose chase', 'window of opportunity',
	'worth ' + WS_POSS + ' weight in gold', 'your guess is as good as mine', 'tip of the iceberg', 'a drop in the bucket',
	'a dime a dozen', 'a far cry from', 'a level playing field', 'a matter of time', 'a race against time',
	'a slippery slope', 'a sight for sore eyes', 'a tough nut to crack', "all in a day's work", 'as old as the hills',
	'at the crack of dawn', 'at the end of ' + WS_POSS + ' rope', '{bite|bit|bites|biting|bitten} the dust',
	'the black sheep', 'bone of contention', 'born with a silver spoon', 'bring home the bacon',
	'burn the candle at both ends', 'by leaps and bounds', 'the forest for the trees', 'the wood for the trees',
	'caught red-handed', 'a change of heart', 'chip on ' + WS_POSS + ' shoulder', 'clear as mud', 'cold feet',
	'come rain or shine', 'come full circle', 'cry wolf', 'cut and dried', 'dead in the water', 'down the rabbit hole',
	'draw the line', '{drop|dropped|dropping} the ball', 'every fiber of ' + WS_POSS + ' being', 'fall on deaf ears',
	'fell on deaf ears', 'tooth and nail', 'fits like a glove', 'a flash in the pan', 'from rags to riches',
	'from the bottom of ' + WS_POSS + ' heart', 'get ' + WS_POSS + ' act together', 'go down in flames',
	'go with the flow', 'head in the clouds', 'heart on ' + WS_POSS + ' sleeve', 'high and dry', 'hold all the cards',
	'in a nutshell', 'in the nick of time', 'not rocket science', 'jump the gun',
	'keep ' + WS_POSS + ' eyes peeled', '{kick|kicked|kicks|kicking} the bucket', 'knock on wood', 'know the ropes',
	'larger than life', 'like a moth to a flame', 'like clockwork', "like there's no tomorrow",
	'lose ' + WS_POSS + ' marbles', 'make ends meet', 'method to the madness', 'method in ' + WS_POSS + ' madness',
	'nip {it|this|that} in the bud', 'not ' + WS_POSS + ' cup of tea', 'on the same page',
	'once and for all', 'out of ' + WS_POSS + ' league', 'par for the course', 'pass the buck', 'pie in the sky',
	'play with fire', 'pull out all the stops', 'put ' + WS_POSS + ' foot down', 'rain on ' + WS_POSS + ' parade',
	'hit rock bottom', 'rub salt in the wound', 'run of the mill', 'sell like hotcakes', 'set in stone',
	'shoot {myself|yourself|himself|herself|itself|ourselves|themselves} in the foot', 'sit on the fence', 'so far so good',
	'sour grapes', 'speak of the devil', '{stand|stands|standing|stood} ' + WS_POSS + ' ground', 'start from scratch',
	'like a sore thumb', "straight from the horse's mouth", 'take the bull by the horns', 'the bottom line',
	'the calm before the storm', 'calm before the storm', 'the moment of truth', 'the name of the game', 'the real deal',
	"{the sky's|the sky is} the limit", 'the tables {have|had} turned', 'turn the tables', 'the world is ' + WS_POSS + ' oyster',
	'through the roof', 'under the bus', 'tie the knot', 'long story short', 'touch and go', 'tried and true',
	'turn over a new leaf', 'until the cows come home', 'up the creek', 'walking on eggshells', 'walk on eggshells',
	'water under the bridge', 'weather the storm', 'when pigs fly', 'with flying {colors|colours}', 'beat around the bush',
	'bite the bullet', '{bit|bites|biting|bitten} the bullet', 'break the ice', 'face the music', 'head over heels',
	'in the heat of the moment', 'heart of gold', 'a heart of stone', '{hit|hits|hitting} the nail on the head',
	'needle in a haystack', 'out of the blue', 'piece of cake', 'plenty of fish in the sea',
	'{read|reading|reads} between the lines', 'think outside the box', 'through thick and thin', 'under the weather',
	'without a shadow of a doubt', 'at the speed of light', 'all walks of life', 'as luck would have it',
	'a blessing in disguise', 'the writing on the wall', 'once upon a time', 'the elephant in the room', 'a perfect storm',
	'the perfect storm', 'against all odds', 'at a loss for words', 'by the skin of ' + WS_POSS + ' teeth',
	'nerves of steel', 'on cloud nine', 'safe and sound', 'avoid like the plague', 'crystal clear', 'at the end of the day',
	'for all intents and purposes', 'few and far between', 'when all is said and done', 'it goes without saying',
	'last but not least', 'light at the end of the tunnel', 'in this day and age', 'the tip of the iceberg',
	'{take|takes|taking|took|taken} it with a grain of salt',
	// ── similes ──
	'busy as a bee', 'blind as a bat', 'brave as a lion', 'clean as a whistle', 'clear as day', 'clear as a bell',
	'cold as ice', 'cool as a cucumber', 'cute as a button', 'dead as a doornail', 'deaf as a post', 'dry as a bone',
	'dull as dishwater', 'easy as pie', 'flat as a pancake', 'free as a bird', 'fresh as a daisy', 'good as gold',
	'happy as a clam', 'hard as nails', 'hard as a rock', 'light as a feather', 'mad as a hatter', 'neat as a pin',
	'plain as day', 'pleased as punch', 'pretty as a picture', 'proud as a peacock', 'quick as a flash',
	'quick as lightning', 'quiet as a mouse', 'red as a beet', 'right as rain', 'sharp as a tack', 'sick as a dog',
	'silent as the grave', 'sly as a fox', 'smooth as silk', 'snug as a bug in a rug', 'solid as a rock',
	'steady as a rock', 'stubborn as a mule', 'sweet as honey', 'thick as thieves', 'tough as nails', 'ugly as sin',
	'white as a ghost', 'white as a sheet', 'white as snow', 'wise as an owl', 'fit as a fiddle', 'strong as an ox',
	'slow as molasses', '{sleep|sleeps|sleeping|slept} like a {log|baby|rock}', '{run|runs|running|ran} like the wind',
	'like a deer in {the |}headlights', 'like a bat out of hell', 'like a bull in a china shop', 'like a house on fire',
	'like a ton of bricks', 'two peas in a pod', 'like a broken record', 'like a well-oiled machine',
	'like a kid in a candy store', 'eyes like saucers',
	// ── fiction: what stories overuse ──
	'love at first sight', 'a breath of fresh air', 'time stood still', 'little did {they|he|she|i|we|you} know',
	'{a chill|chills|a shiver|shivers} {ran|run|runs|running|went|crept} down ' + WS_POSS + ' spine',
	'{sent|sends|sending} {a shiver|shivers|a chill|chills} down ' + WS_POSS + ' spine',
	"{let out|released|exhaled} a breath {*} {didn't|did not|hadn't|had not} {know|known|realized|realised} {*} {was|were|had been} holding",
	'heart {pounded|pounding|hammered|hammering|raced|racing} in ' + WS_POSS + ' chest', 'heart skipped a beat',
	'blood ran cold', 'a dark and stormy night', 'all a dream', '{woke|wakes|waking|awoke} {up |}in a cold sweat',
	'jaw dropped', 'eyes widened in {surprise|shock|horror|disbelief}',
	'a single tear {rolled|ran|slid|trickled} down ' + WS_POSS + ' cheek', 'deafening silence', 'silence was deafening',
	'an eerie silence', 'all hell broke loose', 'dead of night', 'in the blink of an eye', 'out of nowhere',
	'too good to be true', 'happily ever after', 'the end of an era', 'a force to be reckoned with',
	'fate had other plans', 'world came crashing down', 'the moment {i|he|she|they|we} laid eyes on',
	'never in ' + WS_POSS + ' wildest dreams', 'the stuff of {legends|legend|nightmares}', 'a sea of faces',
	'a wave of {relief|panic|nausea|guilt|emotion|fear} washed over', 'butterflies in ' + WS_POSS + ' stomach',
	'weak at the knees', 'the hairs on the back of ' + WS_POSS + ' neck', "smile {that|which} {didn't|did not|never} reach " + WS_POSS + ' eyes',
	'what {felt|seemed} like an eternity', 'lost in thought', 'deep in thought', 'a mind of {its|her|his|their} own',
	'the last thing {i|he|she|they|we} remembered', 'a twist of fate', 'life flashed before ' + WS_POSS + ' eyes',
	'frozen {in|with} fear', 'paralyzed with fear', '{my|his|her|their|your} mind {raced|was racing}',
	'cut the tension with a knife', '{their|our} eyes met across the {room|crowded room}', 'piercing {blue|green|grey|gray} eyes', 'raven {hair|locks}', '{a bead|beads} of sweat',
	'more than meets the eye', 'scared to death', 'scared out of ' + WS_POSS + ' wits', 'bated breath',
	'{held|holding|holds} ' + WS_POSS + ' breath in anticipation', 'a rush of adrenaline', 'electricity shot through',
	"it was {all |}{just |}a dream",
	// ── crutch phrases ──
	'all of a sudden', 'at this point in time', 'by and large', 'in the final analysis', 'since the dawn of {time|man|mankind}',
	"in today's {world|society}", 'first things first', "for what it's worth", 'all things considered',
	'in the grand scheme of things', 'more often than not', 'time and time again', 'the time has come', 'now more than ever',
	'the fact of the matter is', 'at the end of the road', 'when push comes to shove',
	// ── dialogue: stock lines ──
	'we need to talk', "{it's|it is} not what it looks like", 'i can explain', "you just {don't|do not} get it",
	"is that all {you've|you have} got", "{i have|i've got|i've|i got} a bad feeling about this", 'over my dead body',
	"{we've got|we have} company", "this {isn't|is not|ain't} over", "{you'll|you will} pay for this", 'too old for this',
	'quiet too quiet', 'not so different {you and i|you and me|after all}', "{it's|it is} a trap",
	'what could possibly go wrong', 'now or never', 'no time to explain', 'stop meeting like this',
	'this changes everything', "not you {it's|it is} me", 'i was born ready', 'you complete me',
	// ── jargon ──
	'circle back', 'low-hanging fruit', 'move the needle', 'paradigm shift', 'touch base', 'game changer',
	'a win-win', '{take|takes|taking|took|taken} {it|this|things} to the next level', 'level the playing field',
	'push the envelope', 'bring to the table', 'deep dive',
];

// Hedges and intensifiers — filler in any register, always flagged.
export const FILLER_STRONG = new Set(`very really quite rather somewhat fairly pretty
	extremely incredibly absolutely totally completely utterly literally
	actually basically essentially virtually practically arguably apparently
	seemingly presumably supposedly perhaps maybe probably possibly surely
	certainly clearly obviously definitely simply merely just truly honestly
	frankly somehow interestingly notably importantly ultimately effectively`
	.split(/\s+/).filter(Boolean));

// Quantifiers and frequency words: vague, but often doing honest work —
// "most users" in a manual and "several attempts" in a report are fine
// sentences. Behind a sub-toggle, off by default, so the filler check can
// stay on without painting every quantifier on the page.
export const FILLER_SOFT = new Set(`almost nearly roughly approximately several
	various numerous many most some few much lots often sometimes frequently
	occasionally usually generally typically relatively significantly
	substantially considerably slightly marginally overall largely mostly
	partly rarely`.split(/\s+/).filter(Boolean));

export const FILLER_PHRASES = new RegExp('\\b(' + [
	'kind of', 'sort of', 'a bit', 'a little', 'a lot of', 'lots of',
	'in order to', 'due to the fact that', 'the fact that',
	'it is important to note', 'it should be noted', 'needless to say',
	'at the end of the day', 'for all intents and purposes',
	'in terms of', 'with regard to', 'with respect to', 'in the event that',
	'more or less', 'to some extent', 'in my opinion', 'i think that',
	'as a matter of fact', 'when all is said and done', 'each and every',
	'first and foremost', 'few and far between'
].join('|') + ')\\b', 'gi');

// Passive voice: a be-form, optional adverbs, then a past participle.
export const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
	"isn't", "aren't", "wasn't", "weren't", 'get', 'gets', 'got', 'getting',
	// Contractions that can only be "be". The 's forms stay out: "he's
	// taken" is usually "he has taken" — perfect tense, active — and
	// flagging it would be wrong more often than right.
	"i'm", "you're", "we're", "they're"]);

export const IRREGULAR_PP = new Set(`been done gone seen taken given made said known
	written spoken broken chosen driven eaten fallen forgotten frozen hidden
	held kept left lost meant met paid put read run sent set shown shut sold
	sung sunk sat slept spent stood stolen struck sworn taught told thought
	thrown understood worn won built bought brought caught cut felt found got
	gotten heard led let lit lain laid drawn dealt fed fought fled flown
	forbidden forgiven grown hung hurt knelt learnt lent mistaken overcome
	proven quit ridden rung risen sought shaken shone shot shrunk slid sown
	sped spun spread sprung stuck stung stunk striven swept swum swung torn
	thrust trodden woken woven wound withdrawn beaten begun bent bound bred
	burst cast clung crept dug dreamt drunk dwelt hit knit leapt misled
	outdone overrun rebuilt rid sewn shed slain slit smelt spilt split spoilt
	strung sublet swollen undergone undertaken upheld withheld withstood wrung`
	.split(/\s+/).filter(Boolean));

// Words ending in -ed that are not past participles. An exact-match set, not
// a suffix regex: an alternative like `red` also swallows "considered".
export const ED_NOT_PARTICIPLE = new Set(`need indeed hundred thousand sacred wicked
	naked embed exceed proceed succeed feed speed breed bleed agreed freed
	deed creed greed seed weed shed sled bed fled led red wed hatred ahead
	instead spread thread bread dread biped moped aged blessed rugged ragged
	wretched crooked jagged`.split(/\s+/).filter(Boolean));

export const VERB_PREFIXES = ['re', 'over', 'under', 'out', 'mis', 'un', 'pre', 'dis',
	'fore', 'up', 'inter', 'trans', 'co', 'de'];

export function isPastParticiple(tok: WsToken) {
	const lw = tok.lw;
	if (IRREGULAR_PP.has(lw)) return true;
	if (lw.length > 5) {
		for (const pre of VERB_PREFIXES) {
			if (lw.startsWith(pre) && IRREGULAR_PP.has(lw.slice(pre.length))) return true;
		}
	}
	return lw.length > 3 && /ed$/.test(lw) && !ED_NOT_PARTICIPLE.has(lw);
}

export function isLyAdverb(tok: WsToken) {
	return tok.lw.length > 3 && /ly$/.test(tok.lw) && !LY_NOT_ADVERB.has(tok.lw);
}

// Participles that are almost always predicate adjectives after a be-form:
// "she was tired", "we're excited", "he got dressed" are states, not
// passives. A following "by" reinstates the flag — an explicit agent
// ("was surprised by the news") is passive enough to look at. "used" and
// "broken" are deliberately absent: "the tool was used" and "the window
// was broken" are the genuine article.
// States that never take an agent, so even a following "by" is temporal
// or spatial ("was gone by midnight", "was born by the river") and must
// not re-flag them the way it re-flags "was worried by the news".
export const AGENTLESS_STATES = new Set(['gone', 'born']);

export const PARTICIPLE_ADJECTIVES = new Set(`tired excited interested worried
	pleased surprised amazed amused annoyed ashamed bored concerned confused
	convinced delighted depressed determined devoted disappointed dressed
	embarrassed engaged exhausted fascinated frightened frustrated gifted
	married motivated organized organised prepared qualified related relaxed
	relieved satisfied scared shocked skilled stressed stuck talented
	terrified thrilled troubled upset committed dedicated educated
	experienced complicated sophisticated crowded born gone done finished
	lost armed retired settled seated situated located accustomed inclined
	torn broken worn`
	.split(/\s+/).filter(Boolean));

export function findPassive(tokens: WsToken[]) {
	const hits = [];
	const skippable = (t: WsToken) => t.tag === 'ADV' || isLyAdverb(t) || t.lw === 'been' || t.lw === 'being';
	for (let i = 0; i < tokens.length; i++) {
		if (!BE_FORMS.has(tokens[i].lw)) continue;
		let j = i + 1, hops = 0;
		while (j < tokens.length && hops < 4 && skippable(tokens[j])) { j++; hops++; }
		if (j < tokens.length && isPastParticiple(tokens[j])) {
			const pp  = tokens[j];
			const nxt = j + 1 < tokens.length ? tokens[j + 1] : null;
			// Predicate adjectives read as states; only an agent flags them.
			if (PARTICIPLE_ADJECTIVES.has(pp.lw) &&
				(AGENTLESS_STATES.has(pp.lw) || !(nxt && nxt.lw === 'by'))) { i = j; continue; }
			// Idioms that scan as passive but aren't worth a look:
			// "was supposed to", "was meant to", "was bound to".
			if (nxt && nxt.lw === 'to' &&
				(pp.lw === 'supposed' || pp.lw === 'meant' || pp.lw === 'bound')) { i = j; continue; }
			let start = tokens[i].from;
			if ((tokens[i].lw === 'been' || tokens[i].lw === 'being') && i > 0 &&
				/^(have|has|had|having)$/.test(tokens[i - 1].lw)) {
				start = tokens[i - 1].from;
			}
			hits.push({ from: start, to: tokens[j].to });
			i = j;
		}
	}
	return hits;
}

// Lexical illusions: the same word twice in a row. The eye skips them, which
// is exactly why they survive proofreading.
// THE SAME WORD TWICE WITH ONLY SPACE BETWEEN ("the the"): the eye reads one of them. With a mark between it is meant,
// "No, no", "very, very", "Go! Go!" (A857, the writer's pick, 2026-10-22); `text` is the line the tokens came from,
// its markup blanked (without it, as before: every pair)
export function findIllusions(tokens: WsToken[], text?: string) {
	const hits = [];
	for (let i = 1; i < tokens.length; i++) {
		if (tokens[i].lw !== tokens[i - 1].lw) continue;
		if (text !== undefined && !/^\s+$/.test(text.slice(tokens[i - 1].to, tokens[i].from))) continue;
		if (tokens[i].lw.length < 2) continue;               // "s s" in odd markup
		if (tokens[i].lw === 'had') continue;                // "she had had enough" is grammar, not a slip
		hits.push({ from: tokens[i - 1].from, to: tokens[i].to });
	}
	return hits;
}

// Pairs people reach for the wrong half of. The old version was a bare
// word list, which flagged every "to", "there" and "then" on the page — a
// check nobody could leave on. Each confusion now has a context rule and
// fires only where the wrong half is the likely reading; the short list
// below is the remainder that is wrong in any context.
// …CHECKED against published lists (A687 part 2, 2026-10-11: Grammarist, Merriam-Webster, Paul Brians, the
// Oxford list Wikipedia keeps): "supposably" is a real word (capable of being supposed) and went; the rest
// are misspellings every dictionary rejects, the eggcorns among them one hyphenated word ("deep-seeded" is
// right only in sports seeding, where a writer would not hyphenate it).
export const MISUSED_ALWAYS = new Set(['alot', 'irregardless',
	'definately', 'seperate', 'occured', 'untill', 'recieve', 'alright',
	'wierd', 'accomodate', 'occurence', 'tommorow', 'independant', 'arguement', 'noticable', 'millenium',
	'existance', 'neccessary', 'embarass', 'begining', 'acheive', 'beleive', 'concious', 'freind', 'occassion',
	'posession', 'recomend', 'refered', 'succesful', 'writting', 'garantee', 'harrass', 'liason', 'mispell',
	'neice', 'perseverence', 'priviledge', 'rythm', 'sieze', 'suprise', 'mischievious', 'truely', 'goverment',
	'tenderhooks', 'deep-seeded', 'shoe-in', 'doggy-dog']);

// …AND THE PHRASES wrong in any context, the eggcorns (A687 part 2: Grammarist's list and its pages), matched
// over words with only space between: "for all intensive purposes", never "intensive purposes" alone
export const MISUSED_PHRASES = ['for all intensive purposes', 'case and point', 'one in the same', 'per say',
	'nip it in the butt', 'free reign', 'baited breath', 'beckon call', 'mute point', "hair's breath",
	'sneak peak', 'damp squid', 'escape goat', 'old wise tales', 'take it for granite', 'deep seeded', 'tow the line'];
const WS_MISUSED_PHRASE_WORDS = MISUSED_PHRASES.map((p) => p.split(' '));

// s-final nouns that are not plurals, so "less" before them stays legal.
export const MASS_S_NOUNS = new Set(['news', 'means', 'series', 'species',
	'physics', 'economics', 'politics', 'mathematics', 'ethics',
	'linguistics', 'measles', 'diabetes', 'chaos', 'gas', 'lens',
	'progress', 'los', 'las']);

export const COMPARATIVES = new Set(['more', 'less', 'fewer', 'better', 'worse',
	'rather', 'other', 'greater', 'higher', 'lower', 'larger', 'smaller',
	'bigger', 'older', 'younger', 'faster', 'slower', 'stronger', 'weaker',
	'earlier', 'later', 'longer', 'shorter', 'easier', 'harder', 'sooner',
	'farther', 'further', 'closer', 'cheaper', 'deeper', 'wider']);

// `masked` (the line) lets a phrase be found, its words with only space between; `always` the words wrong
// anywhere, English's own unless an English pack brings its table (wsEnglishPackEngine passes an empty set
// and matches the pack's rows itself, so a row the writer takes out is not flagged)
export function findMisused(tokens: WsToken[], masked?: string, always: Set<string> = MISUSED_ALWAYS, phrases: string[][] = WS_MISUSED_PHRASE_WORDS) {
	const hits: { from: number; to: number }[] = [];
	const flag = (a: WsToken, b?: WsToken | null) => hits.push({ from: a.from, to: (b || a).to });
	for (let i = 0; i < tokens.length; i++) {
		const t  = tokens[i];
		const p  = i > 0 ? tokens[i - 1] : null;
		const n  = i + 1 < tokens.length ? tokens[i + 1] : null;
		const lw = t.lw, nl = n ? n.lw : '', pl = p ? p.lw : '';

		if (always.has(lw)) { flag(t); continue; }
		if (masked !== undefined) {
			const ph = phrases.find((w) => w[0] === lw && i + w.length <= tokens.length
				&& w.every((x, k) => tokens[i + k].lw === x && (k === 0 || /^\s+$/.test(masked.slice(tokens[i + k - 1].to, tokens[i + k].from)))));
			if (ph) { flag(t, tokens[i + ph.length - 1]); i += ph.length - 1; continue; }
		}

		switch (lw) {
			// "could of", "must of" — the contraction 've misheard.
			case 'of':
				if (p && /^(could|would|should|must|might|may)$/.test(pl)) flag(p, t);
				break;
			// "its been", "its a" — the possessive where "it's" belongs.
			// Gerund possessives ("its being late") are real grammar, so
			// being/having stay exempt.
			case 'its':
				if (n && (n.tag === 'DET' ||
					(n.tag === 'AUX' && nl !== 'being' && nl !== 'having') ||
					nl === 'not')) flag(t);
				break;
			// "it's own" — the contraction where the possessive belongs.
			case "it's":
				if (nl === 'own') flag(t);
				break;
			// "their is", "their not coming" — "there"/"they're" territory.
			case 'their':
				if (n && ((n.tag === 'AUX' && nl !== 'being' && nl !== 'having') ||
					nl === 'not')) flag(t);
				break;
			// "there house was cold" — a bare lexicon noun straight after
			// "there" usually wanted "their". The AUX guard keeps
			// existential questions out: "is there money left?".
			case 'there':
				if (n && n.tag === 'NOUN' && POS_LEX[nl] === 'NOUN' &&
					!(p && p.tag === 'AUX')) flag(t);
				break;
			// "better then the rest", "rather then". Time-adverb readings
			// ("things were better then") end the clause, so a content
			// word has to follow before this fires.
			case 'then':
				if (p && n &&
					(COMPARATIVES.has(pl) || (p.tag === 'ADJ' && /er$/.test(pl))) &&
					(n.tag === 'DET' || n.tag === 'PRON' || n.tag === 'NOUN' ||
					 n.tag === 'ADJ' || n.tag === 'NUM' || n.tag === 'VERB')) flag(p, t);
				break;
			// "way to much", "there are to many" — "too" missing an o.
			// Bare "to much/many" is left alone: "it never amounted to
			// much" and "I said this to many people" are fine sentences.
			case 'to':
				if ((nl === 'much' || nl === 'many') &&
					(!p || p.tag === 'AUX' || p.tag === 'MOD' || pl === 'way' || pl === 'far')) flag(t, n);
				break;
			// "don't loose", "will loose", "to loose the game".
			case 'loose':
				if (p && (p.tag === 'MOD' || p.tag === 'TO' ||
					/^(don't|doesn't|didn't|won't|not)$/.test(pl))) flag(t);
				break;
			// "the affect" — the noun slot nearly always wants "effect".
			case 'affect': case 'affects':
				if (p && p.tag === 'DET') flag(t);
				break;
			// "less items" — a countable plural after "less" wants "fewer".
			case 'less':
				if (n && n.tag === 'NOUN' && /s$/.test(nl) &&
					!/(ss|us|is)$/.test(nl) && !MASS_S_NOUNS.has(nl)) flag(t, n);
				break;
			// "who's book is this" — contraction in the possessive slot.
			// "who's next", "who's there", "who's coming" all carry other
			// tags and stay clear.
			case "who's":
				if (n && POS_LEX[nl] === 'NOUN') flag(t);
				break;
			// "your a star", "your not" already fires above; "your are/is"
			// and "your the best" are the same slip with an article.
			case 'your':
				if (nl === 'welcome' || nl === 'not' || nl === 'going' || nl === 'gonna' ||
					(n && n.tag === 'DET') ||
					(n && n.tag === 'AUX' && nl !== 'being' && nl !== 'having')) flag(t);
				break;
			// "accept for the ending" — "except" misheard.
			case 'accept':
				if (nl === 'for') flag(t, n);
				break;
			// "quiet a few", "quiet the achievement" — "quite" mistyped.
			case 'quiet':
				if (nl === 'a' || nl === 'an') flag(t, n);
				break;
			// "will chose", "to chose", "didn't chose" — the past form in a
			// slot that only takes the base verb.
			case 'chose':
				if (p && (p.tag === 'MOD' || p.tag === 'TO' ||
					/^(don't|doesn't|didn't|won't)$/.test(pl))) flag(t);
				break;
			// "had lead the team", "was lead by" — "led" spelled like the
			// metal. Perfect and passive slots only take the participle.
			case 'lead':
				if ((p && /^(have|has|had)$/.test(pl)) ||
					(p && BE_FORMS.has(pl) && nl === 'by')) flag(t);
				break;
			// "walked passed the house" — a verb straight before it means
			// the preposition "past" was wanted.
			case 'passed':
				if (p && p.tag === 'VERB' && n && n.tag === 'DET') flag(t);
				break;
			// "peaked my interest" — "piqued". The possessive plus the noun
			// pins it; a mountain that "peaked" flags nothing.
			case 'peaked': case 'peeked':
				if (n && /^(my|his|her|their|our|your|its)$/.test(nl)) {
					const n2 = i + 2 < tokens.length ? tokens[i + 2] : null;
					if (n2 && /^(interest|curiosity|attention)$/.test(n2.lw)) flag(t, n2);
				}
				break;
		}
	}
	return hits;
}

// THE "IT" THAT POINTS AT NOTHING (A857, the writer's pick, 2026-10-22): "It rained", "It was late", "It seems that…",
// "It was hard to tell" have no referent for a reader to lose, and the words after the it say so: weather, the time or
// the light after a form of be, a word of feeling or judgment with "to" or "that" after it, seems that, turned out, took
// … to. One that could point back ("It was broken", "It seemed to work") is still marked. Read over the line's next
// few words.
const IT_WEATHER = /^(rain|snow|hail|sleet|drizzl|pour|thunder|freez|froze|thaw)/;
const IT_AUX = new Set(['will', 'would', 'could', 'might', 'may', 'must', 'should', 'can', 'has', 'had', 'have']);
const IT_BE = new Set(['is', 'was', 'be', 'been']);
const IT_BETWEEN = new Set(['getting', 'growing', 'becoming', 'nearly', 'almost', 'already', 'still', 'too', 'so', 'very', 'quite',
	'pretty', 'rather', 'just', 'now', 'not', 'never', 'always', 'a', 'an', 'the']);
const IT_TIME = new Set(['late', 'early', 'dark', 'light', 'cold', 'hot', 'warm', 'cool', 'chilly', 'freezing', 'sunny', 'cloudy',
	'windy', 'rainy', 'foggy', 'misty', 'humid', 'night', 'midnight', 'noon', 'morning', 'evening', 'afternoon', 'dawn', 'dusk',
	'summer', 'winter', 'spring', 'autumn', 'time', 'raining', 'snowing', 'pouring', 'drizzling', "o'clock", 'monday', 'tuesday',
	'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'christmas']);
const IT_THAT = new Set(['to', 'that', 'whether', 'how', 'why', 'if']);
export function wsExpletiveIt(after: WsToken[]): boolean {
	const w = after.map((x) => x.lw);
	if (!w.length) return false;
	if (IT_WEATHER.test(w[0])) return true;
	if (/^(seem|appear|happen)/.test(w[0])) return /^(that|as|like)$/.test(w[1] || '') || (!!after[1] && after[1].tag === 'ADJ' && w[2] === 'that');
	if (/^turn(s|ed)?$/.test(w[0]) && w[1] === 'out') return true;
	if (/^(dawn|occur)(s|ed|red)?$/.test(w[0]) && /^(on|to)$/.test(w[1] || '')) return true;
	if (/^(take|takes|took)$/.test(w[0])) return w.slice(1, 7).includes('to');
	let i = 0;
	if (IT_AUX.has(w[0])) i++;
	if (!IT_BE.has(w[i] || '')) return false;
	i++;
	while (i < w.length && IT_BETWEEN.has(w[i])) i++;
	const k = after[i];
	if (!k) return false;
	if (IT_TIME.has(k.lw) || k.tag === 'NUM') return true;
	return k.tag === 'ADJ' && w.slice(i + 1, i + 4).some((x) => IT_THAT.has(x));
}

// A pronoun opening a sentence usually points at the previous one, and the
// reader has to guess which part. Mid-sentence pronouns are left alone.
export const VAGUE_PRONOUNS = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'them', 'there']);

// ...but "This chapter shows" and "Those results held" are determiners
// with the referent standing right next to them — nothing loose there.
export function isVaguePronoun(t: WsToken, next: WsToken | null | undefined, after?: WsToken[]) {
	if (!t.first || !VAGUE_PRONOUNS.has(t.lw)) return false;
	if (t.lw === 'it' && after && wsExpletiveIt(after)) return false;
	if ((t.lw === 'this' || t.lw === 'that' || t.lw === 'these' || t.lw === 'those') &&
		next && (next.tag === 'NOUN' || next.tag === 'ADJ' || next.tag === 'NUM')) return false;
	return true;
}

// ── Readability ──────────────────────────────────────────────────────────────

// Syllable counting by the standard heuristic: strip silent endings, then
// count vowel groups. Wrong on a minority of words ("fire", "poem"), which is
// fine — Flesch–Kincaid averages over a whole document and the error washes
// out long before it moves the grade.
export function countSyllables(word: string) {
	// THE ACCENTS ARE VOWELS (A482): stripped as "not a–z", café was "caf" —
	// one syllable — and résumé "rsum". A final é or ë is spoken (ca-fé,
	// Zo-ë), so it becomes a vowel pair the silent-e rule below cannot eat;
	// a diaeresis opens a new syllable (na-ïve), so a consonant is put in
	// front of it; then the marks go and the English rules run as before.
	let w = String(word).toLowerCase()
		.replace(/[éë]$/, 'ey')
		.replace(/([aeiouy])([äëïöü])/g, '$1h$2')
		.normalize('NFD').replace(/\p{M}/gu, '')
		.replace(/[^a-z]/g, '');
	if (!w) {
		// Spoken length of a figure grows with its digits — "1984" is five
		// syllables out loud. Digits+1, capped, tracks that well enough
		// for a grade that averages over sentences anyway.
		const d = String(word).replace(/[^0-9]/g, '').length;
		return d ? Math.min(6, d + 1) : 0;
	}
	if (w.length <= 3) return 1;
	w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
	w = w.replace(/^y/, '');
	const groups = w.match(/[aeiouy]{1,2}/g);
	return groups ? groups.length : 1;
}

// Sentence ranges within one line. Markdown paragraphs are normally a single
// soft-wrapped line, so a sentence very rarely crosses a hard break; treating
// the line as the outer bound keeps this cheap and viewport-local.
// …AND THE MARKS THAT CLOSE A QUOTATION STAY WITH IT (A637): "“Not I!” said the Lory" is one
// sentence, its tag joined back by the lower case after the closer; nested closers too (’”)
export const SENTENCE_SPLIT = /[^.!?\u2026]+[.!?\u2026]*["'\u201d\u2019\u00bb\u203a)\]]*\s*/g;

// A QUOTATION OPENED PARTWAY THROUGH A SENTENCE, WHICH CARRIES ON PAST ITS CLOSER, ENDS IT NOWHERE INSIDE
// (A642, the writer's Carroll: "…to hear the Rabbit say to itself, “Oh dear! Oh dear! I shall be late!” (when
// she thought it over …) … under the hedge." was 29 + 2 + 110 words). True when the piece from `from` to `at`
// holds an opener still open at `at`, with a letter or figure before it, whose closer is on this line and is
// followed by no sentence's start. A quotation that opens the sentence ("“Hello. How are you?” she asked")
// or ends it splits as before. Single quotes are left out: ’ is the apostrophe
// …UP TO FORTY WORDS: over Alice the quotations held were 4 to 37 words, or 75 to 151 (a speech of a dozen
// sentences, "I'm sure I'm not Ada", which the Report then named the longest sentence); a longer one keeps its own
export const HELD_QUOTE_WORDS = 40;
export const HELD_QUOTES: Record<string, string> = { '\u201c': '\u201d', '"': '"', '\u00ab': '\u00bb' };
export function wsQuoteHolds(text: string, from: number, at: number, pairs: Record<string, string>): boolean {
	const open: { i: number; close: string }[] = [];
	for (let i = from; i < at; i++) {
		const ch = text[i];
		if (open.length && open[open.length - 1].close === ch) open.pop();
		// a mark that both opens and closes (") opens only after a space, a bracket or a dash: in
		// 'bendiga", escribió' it closes a quotation this line never opened
		else if (pairs[ch] !== undefined && (pairs[ch] !== ch || i === 0 || /[\s([{\u2014\u2013-]/.test(text[i - 1]))) open.push({ i, close: pairs[ch] });
	}
	if (!open.length) return false;
	// words before it, and no sentence's end between them and it (the split can carry an opener on the end of
	// the sentence before: 。“)
	const before = text.slice(from, open[0].i);
	if (!/[\p{L}\p{N}]/u.test(before) || /[.!?\u2026\u3002\uff01\uff1f]["'\u201d\u2019\u00bb\u203a)\]\s]*$/.test(before)) return false;
	const c = text.indexOf(open[0].close, at);
	if (c < 0 || (text.slice(open[0].i, c).match(/[\p{L}\p{N}]+/gu) || []).length > HELD_QUOTE_WORDS) return false;
	// …and after its closer the sentence goes on: no capital, a bracket's either ('“…O Mouse!” (Alice thought'),
	// no stop ('… Qué presidente".' ends one), and a
	// quotation that ended on its own stop goes on only into a lower-case word or a mark that continues
	const after = text.slice(c + 1).replace(/^[\s"'\u201d\u2019\u201c\u00bb\u00ab\u203a\u2039\u300d\u300f]+/, '');
	if (!after || /^[([]*[\p{Lu}.!?\u2026\u3002\uff01\uff1f]/u.test(after)) return false;
	return !/[.!?\u2026\u3002\uff01\uff1f]$/.test(text.slice(from, c)) || /^[\p{Ll},;:([\u2014\u2013-]/u.test(after);
}

// THE END OF A SENTENCE BEING JOINED (A877). Whether a full stop ended a sentence is read off the sentence's LAST
// word, and a sentence grows at every false end; read whole each time, a long line whose sentences kept joining
// cost the square of its length (146 ms for one 26 KB line, 2.4 s with thin spaces in it). So the tests read a
// window of its end. A last word that reaches the window's start is read from the whole sentence, so every answer
// is the one the whole would give. `re` is not global.
export const WS_TAIL_WINDOW = 64;
export function wsTailEnd(text: string, from: number, to: number): string {
	return text.slice(Math.max(from, to - WS_TAIL_WINDOW), to);
}
export function wsTailMatch(re: RegExp, text: string, from: number, to: number): RegExpExecArray | null {
	const lo = Math.max(from, to - WS_TAIL_WINDOW);
	const m = re.exec(text.slice(lo, to));
	// (2, not 1: a window cut through a surrogate pair starts on its low half)
	return (m && lo > from && m.index < 2) ? re.exec(text.slice(from, to)) : m;
}

export function splitSentences(text: string) {
	const out: { from: number; to: number; text: string }[] = [];
	SENTENCE_SPLIT.lastIndex = 0;
	let m;
	while ((m = SENTENCE_SPLIT.exec(text))) {
		if (!m[0].trim()) continue;
		// Trim the trailing whitespace back off so the tint stops at the
		// full stop rather than running into the next sentence.
		const raw  = m[0];
		const from = m.index;
		// TRIMMED WITH trimEnd, NOT /\s+$/ (#86): that pattern starts at every space of a run inside the sentence, reads
		// the run to its end and fails there, the square of the run; a 26 KB run (a long URL blanked by the count's mask,
		// a padded table) cost 0.5 s a reading. trimEnd takes the same characters as \s, in one pass.
		const to   = from + raw.trimEnd().length;
		if (to <= from) continue;
		// Merge with the previous segment when the split was a false one:
		// the previous "sentence" ended in an abbreviation, an initial or a
		// decimal ("Dr.", "J.", "3."), or this one opens in lowercase — a
		// capital letter is what an actual sentence start looks like.
		// Splitting at "Dr. Smith" halves the sentence and halves the
		// rhythm grade with it.
		const prev = out.length ? out[out.length - 1] : null;
		if (prev) {
			const am   = wsTailMatch(/(\p{L}+)\.$/u, text, prev.from, prev.to);
			// A FIGURE ENDS A SENTENCE (A642: "Published in 1975. It was good." was one): a decimal's second
			// half opens with a digit and joins below; a list's number standing alone ("1.") is the one figure kept
			// (anchored, so it reads the sentence's opening only: the end carries no space, and `\s` is what trim() takes)
			const falseEnd = (am && (am[1].length === 1 || ABBREVIATIONS.has(am[1].toLowerCase()))) ||
				/^\s*\d{1,3}\.$/.test(text.slice(prev.from, prev.to)) || /^[\p{P}\s]*[\p{Ll}0-9]/u.test(raw.trim()) || wsQuoteHolds(text, prev.from, from, HELD_QUOTES);
			if (falseEnd) {
				prev.to = to;
				continue;
			}
		}
		out.push({ from, to, text: '' });
	}
	// each sentence's text cut once, when its end is known (A877)
	for (const s of out) s.text = text.slice(s.from, s.to).trim();
	return out;
}

// Flesch–Kincaid grade level. Below ~9 reads easily; the Hemingway app calls
// 10–13 hard and 14+ very hard, which is where the two tints come from.
export function fkGrade(words: number, sentences: number, syllables: number) {
	if (!words || !sentences) return 0;
	return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

// Grade for one sentence, from its own tokens.
export function sentenceGrade(tokens: WsToken[]) {
	if (!tokens.length) return 0;
	let syl = 0;
	for (const t of tokens) syl += countSyllables(t.w);
	return fkGrade(tokens.length, 1, syl);
}

// ── Repetition radar ─────────────────────────────────────────────────────────

// Words common enough that repeating them is invisible and unavoidable. Only
// words outside this list, and long enough to be noticed, are worth flagging.
export const REPETITION_STOPWORDS = new Set(`the a an and or but if then than that this
	these those there here it its it's is are was were be been being am do does
	did have has had having will would shall should can could may might must
	i me my we us our you your he him his she her they them their who whom whose
	what which when where why how all any both each few more most other some such
	no nor not only own same so too very just also as at by for from in into of
	on to with about after before between during over under again once out up
	down off above below now new one two three way get got go went come came
	said say says like make made take took see saw know knew think thought`
	.split(/\s+/).filter(Boolean));

// ── THE COMMON WORDS THE REPORT SETS ASIDE ────────────────────────
//
// The ten most used words of any English book are the, and, to, of, a, I,
// in, was, he, that — the same ten for every book, telling the writer
// nothing. So the Report's "Most used words" leaves the FUNCTION words out
// (articles, conjunctions, prepositions, pronouns, auxiliaries,
// determiners) and shows the rest, with a tick to bring them back. This is
// NOT the repetition list above, and must not be merged with it: that one
// also hides "said", "looked", "way", "one" — words whose echo is
// invisible in prose but whose COUNT is exactly what a novelist wants read
// back to them.
export const REPORT_STOPWORDS = new Set(`the a an and or but nor if then than that this
	these those there here it its it's is are was were be been being am do does
	did done have has had having will would shall should can could may might must
	ought i me my mine myself we us our ours you your yours he him his she her
	hers they them their theirs who whom whose what which when where why how all
	any both each few more most other some such no not only own same so too very
	just also as at by for from in into of on to with about after before between
	during over under again once out up down off above below through against
	without within upon onto until while because although though whether either
	neither yet don't didn't doesn't isn't wasn't weren't won't wouldn't couldn't
	shouldn't can't cannot hasn't haven't hadn't i'm i've i'd i'll you're you've
	he's she's we're we've they're they've that's there's what's`
	.split(/\s+/).filter(Boolean));

// ── Dialogue ────────────────────────────────────────────────────────────────
//
// Every quoted stretch on a line, as {from,to} offsets INTO THAT LINE.
//
// Four pairs are recognised: straight double and single, and their curly
// counterparts. Curly quotes are directional, so an opening one can only be
// closed by its own partner — which is what makes them reliable. Straight
// ones are ambiguous by nature, and the single straight quote is the hard
// case: it is also the apostrophe, and "don't" is not dialogue.
//
// So the apostrophe rule is POSITIONAL rather than a word list: a straight
// or curly single quote with a letter or digit on BOTH sides is an
// apostrophe (don't, it's, o'clock, '90s is handled by the digit test on the
// other side), and anything else is a candidate quote mark. That covers
// contractions and possessives without a dictionary, which is the only way
// it can work in every language the plugin counts.
//
// An UNCLOSED quote runs to the end of the line and no further. A speech
// that continues over a paragraph break is real (and English typography
// opens each paragraph without closing the last), but a highlight that
// leaks down the rest of the note because a writer typed one quote mark is
// far worse than one that stops early. The line is the unit here.
// THE LANGUAGE'S SPEECH MARKS (A610): the pairs its pack declares beside the ones
// above (German »…«, Polish „…”, Swedish ”…”), and the dash it opens speech with.
export interface WsDialogueMarks { pairs: Record<string, string>; dashes: string; verbs?: string[] }

// SPEECH BY DASH (A610), as Spanish, Polish, the Scandinavian languages and French
// write it: the dash that opens the paragraph opens the speech, and each dash after
// it that stands apart (a space before it, or a space or a mark after it) turns
// speech to narration and back. "—Hola —dijo él—. ¿Qué tal?" is "—Hola" and
// "¿Qué tal?"; a range (1990–2000) has neither and turns nothing.
// A TAG WITH NO SECOND DASH (A622): "– Lasă-mă în pace! zise el.", "– Hej, sa han." A
// "!", "?", "…" or "," and then one of the language's speech verbs, the first word
// after it or the second ("a zis", "i-a spus"), or the verb of an inversion ("dit-il",
// "demanda-t-elle"), ends the speech at the mark. A capital after it is more speech.
const WS_TAG_MARKS = ',!?\u2026';
const WS_INVERTED = new Set(['il', 'elle', 'ils', 'elles', 'on', 't-il', 't-elle', 't-on', 'je', 'tu', 'nous', 'vous']);
function wsSpeechTagAt(text: string, k: number, said: Set<string>): boolean {
	const m = /^\s+(\p{Ll}[\p{L}\p{M}'\u2019-]*)(?:\s+([\p{L}\p{M}'\u2019-]+))?/u.exec(text.slice(k + 1, k + 80));
	if (!m) return false;
	const low = (w: string) => w.toLowerCase().replace(/\u2019/g, "'").normalize('NFC').replace(/\u015f/g, '\u0219').replace(/\u0163/g, '\u021b');
	const verb = (w: string | undefined) => {
		if (!w) return false;
		const x = low(w).replace(/[-']+$/, '');
		if (said.has(x)) return true;
		const cut = x.indexOf('-');
		return cut > 0 && WS_INVERTED.has(x.slice(cut + 1)) && said.has(x.slice(0, cut));
	};
	return verb(m[1]) || verb(m[2]);
}
function wsDashDialogue(text: string, at: number, dashes: string, verbs?: string[]) {
	const out: { from: number; to: number }[] = [];
	const add = (from: number, to: number) => {
		while (from < to && /[\s.,;:]/.test(text[from])) from++;
		while (to > from && /\s/.test(text[to - 1])) to--;
		if (to > from) out.push({ from, to });
	};
	let speech = true, from = at;
	const said = verbs && verbs.length ? new Set(verbs) : null;
	for (let k = at + 1; k < text.length; k++) {
		if (speech && said && WS_TAG_MARKS.indexOf(text[k]) !== -1 && wsSpeechTagAt(text, k, said)) {
			add(from, k + 1);
			speech = false;
			from = k + 1;
			continue;
		}
		if (dashes.indexOf(text[k]) === -1) continue;
		const after = k + 1 < text.length ? text[k + 1] : ' ';
		if (!/\s/.test(text[k - 1]) && !/[\s\p{P}]/u.test(after)) continue;
		if (speech) add(from, k);
		speech = !speech;
		from = k + 1;
	}
	if (speech) add(from, text.length);
	return out;
}

// LEADING ELISIONS (A710): a straight mark that begins a word and is no quote: English 'em, 'til, 'tis, 'twas, 'cause,
// 'bout, 'round, 'nuff, 'cept, the 'n' of rock 'n' roll; Dutch 's, 't, 'n, 'k, 'm, 'r, 'ns; a year ('90s). The word
// whole (not 'Sorry', not a stammer's 'M-my'), any case.
const WS_ELISION = /^(?:(?:em|til|tis|twas|cause|bout|round|nuff|cept|ns|n|s|t|k|m|r)(?![\p{L}\p{N}-])|\d\d)/iu;
// SCRIPTS WITH NO APOSTROPHE (A710): Chinese, Japanese and Korean. A mark between two of their characters is a quote
// (他心想‘算了’就走了, ‘아니’라고), never the apostrophe the letters-on-both-sides rule took it for.
const WS_NO_APOSTROPHE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
// YOUR OWN SPEECH MARKS (A729, the writer: "add more speech marks into dialogue with a custom text box to add pairs there
// under like <> // \\ <<>> and so on"): pairs written one after another, a space or a comma between; a pair is its
// opening half and its closing half (<<>> is << and >>, // is / and /), one mark alone opens and closes on itself. A
// pair of odd length past one says nothing it could mean and is left out. The longest opener first, so << is read
// before <. Read once a text.
const WS_OWN_PAIRS = new Map<string, [string, string][]>();
export function wsDialoguePairs(text: string): [string, string][] {
	const key = String(text || '');
	const had = WS_OWN_PAIRS.get(key);
	if (had) return had;
	const out: [string, string][] = [];
	for (const t of key.split(/[\s,]+/)) {
		const pair: [string, string] | null = !t ? null : t.length === 1 ? [t, t]
			: t.length % 2 === 0 ? [t.slice(0, t.length / 2), t.slice(t.length / 2)] : null;
		if (pair && !out.some((p) => p[0] === pair[0] && p[1] === pair[1])) out.push(pair);
	}
	out.sort((a, b) => b[0].length - a[0].length);
	if (WS_OWN_PAIRS.size > 32) WS_OWN_PAIRS.clear();
	WS_OWN_PAIRS.set(key, out);
	return out;
}
export function findDialogue(line: string, marks?: WsDialogueMarks | null, more?: boolean, own?: [string, string][] | null) {
	const text = String(line || '');
	const out = [];
	if (marks && marks.dashes) {
		const lead = (/^[\s>]*/.exec(text) || [''])[0].length;
		if (lead < text.length && marks.dashes.indexOf(text[lead]) !== -1) return wsDashDialogue(text, lead, marks.dashes, marks.verbs);
	}
	// Openers mapped to what may close them. Curly pairs are strict;
	// straight marks close on themselves.
	const PAIRS: Record<string, string> = {
		'"': '"', "'": "'",
		'\u201c': '\u201d', '\u2018': '\u2019',
		// A few languages open with the closing-shaped mark or with
		// guillemets; both are common enough in translated manuscripts to
		// be worth recognising rather than leaving as stray text.
		'\u00ab': '\u00bb', '\u201e': '\u201c'
	};
	// …and the language's own (A610): a closer added beside the usual one, so „ closes
	// on “ in German and on ” in Polish; each opener a string of what may close it
	if (marks) for (const o of Object.keys(marks.pairs)) if (o) PAIRS[o] = (PAIRS[o] || '') + marks.pairs[o];
	// MORE SPEECH MARKS, ON A SWITCH (A711, issue #68, lilellia: "in fantasy, telepathic communication is generally
	// italicised, with quotation marks reserved for spoken dialogue"; the writer: "Add a toggle in dialogue for more
	// brackets"): italics, *one* or _one_, and angle brackets, ‹ › and < >
	if (more) { PAIRS['*'] = '*'; PAIRS['_'] = '_'; PAIRS['\u2039'] = (PAIRS['\u2039'] || '') + '\u203a'; PAIRS['<'] = '>'; }
	// a letter or digit of an alphabet that has an apostrophe (A710: not Chinese, Japanese or Korean)
	const isWordish = (ch: string) => !!ch && /[\p{L}\p{N}]/u.test(ch) && !WS_NO_APOSTROPHE.test(ch);
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		// AN HTML TAG IS STEPPED OVER WHOLE (A711): its attributes' quotes (class="x") are no speech, switch or not
		if (ch === '<') {
			const tag = /^(?:!--[\s\S]*?--|\/?[a-z][\w-]*(?:\s[^>]*)?\/?)>/.exec(text.slice(i + 1));
			if (tag) { i += 1 + tag[0].length; continue; }
		}
		// YOUR OWN PAIRS FIRST (A729): one opens where a word may begin (the line's start, a space, an opening bracket or
		// quote) and touches its first word; it closes on its closer touching the last word, before a space, a mark or
		// the line's end; and something is between. So https://, and/or, C:\ and an empty <<>> open nothing.
		if (own && own.length) {
			let hit: { from: number; to: number } | null = null;
			for (const [o, c] of own) {
				if (!text.startsWith(o, i)) continue;
				const first = text[i + o.length] || '';
				if (!/[\s([{"'\u201c\u2018\u00ab\u2039]/.test(i === 0 ? ' ' : text[i - 1]) || !first || /\s/.test(first) || text.startsWith(c, i + o.length)) continue;
				for (let k = i + o.length + 1; k <= text.length - c.length; k++) {
					if (!text.startsWith(c, k) || /\s/.test(text[k - 1])) continue;
					if (/[\p{L}\p{N}]/u.test(text[k + c.length] || '')) continue;
					hit = { from: i, to: k + c.length };
					break;
				}
				if (hit) break;
			}
			if (hit) { out.push(hit); i = hit.to; continue; }
		}
		const close = PAIRS[ch];
		if (!close) { i++; continue; }
		// An apostrophe, not an opening quote: letters or digits on both
		// sides. Only the single marks can be one.
		if ((ch === "'" || ch === '\u2018' || ch === '\u2019')
			&& isWordish(text[i - 1]) && isWordish(text[i + 1])) { i++; continue; }
		// A STRAIGHT MARK RIGHT AFTER A LETTER OR DIGIT OPENS NOTHING (A710, issue #67, lilellia: "The girls' choice to
		// leave was understandable, given the teachers' actions." read as speech from one possessive to the other): it is a
		// possessive (girls'), the end of a pair, or inches (5"). Speech opens after a space, a mark or the line's start.
		// Curly marks never needed this: the curly apostrophe opens nothing.
		if ((ch === "'" || ch === '"') && isWordish(text[i - 1])) { i++; continue; }
		// …nor one that begins an elision ('em, 'til, '90s, Dutch 's and 't)
		if (ch === "'" && WS_ELISION.test(text.slice(i + 1, i + 8))) { i++; continue; }
		// an italic opens on ONE mark touching its first word: not bold (**), not a list's "* ", not snake_case (A711)
		if ((ch === '*' || ch === '_') && (text[i + 1] === ch || text[i - 1] === ch || !text[i + 1] || /\s/.test(text[i + 1])
			|| (ch === '_' && isWordish(text[i - 1])))) { i++; continue; }
		let j = -1;
		for (let k = i + 1; k < text.length; k++) {
			const c = text[k];
			if (close.indexOf(c) === -1) continue;
			// The same positional rule at the closing end, or "it's" inside
			// a single-quoted line would end the speech early.
			if ((c === "'" || c === '\u2019')
				&& isWordish(text[k - 1]) && isWordish(text[k + 1])) continue;
			// A straight mark after a space closes nothing (A710): speech ends on its last word or mark, and "stay 'til"
			// is the elision's own mark
			if (c === "'" && /\s/.test(text[k - 1] || '')) continue;
			// an italic closes on ONE mark after its last word, and an underscore not inside a word (A711)
			if ((c === '*' || c === '_') && (text[k + 1] === c || text[k - 1] === c || /\s/.test(text[k - 1] || '')
				|| (c === '_' && isWordish(text[k + 1])))) continue;
			j = k;
			break;
		}
		// AN UNCLOSED STRAIGHT SINGLE MARK OPENS NOTHING (A710): with no partner on the line it is far likelier an
		// apostrophe ('ere, 'ow, any elision the list does not know) than speech. The double marks and the curly ones,
		// which no apostrophe shares, still run to the end of the line.
		// (and, on the switch, an italic or a < with no partner on the line: a stray mark paints nothing, A711)
		if (j === -1 && (ch === "'" || ch === '*' || ch === '_' || ch === '<')) { i++; continue; }
		// Unclosed: to the end of the line, which is as far as this can
		// safely guess.
		const end = j === -1 ? text.length : j + 1;
		if (end > i + 1) out.push({ from: i, to: end });
		i = end;
	}
	return out;
}

export function findRepetitions(tokens: WsToken[], windowSize: number, minLength: number) {
	const hits = [];
	const lastSeen = new Map<string, { i: number; from: number; to: number; flagged: boolean }>();
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		// every letter and its accents, as the packs read it: `[^a-z']` cut résumé to "rsum", four letters, so a
		// repeated résumé was never compared, and café to "caf" (A857's small fault, fixed 2026-10-22)
		const w = t.lw.replace(/[^\p{L}\p{M}']/gu, '');
		if (Array.from(w).length < minLength || REPETITION_STOPWORDS.has(w)) continue;
		// Crude stemming, so "writing" echoes "writes".
		const stem = w.replace(/(ing|ed|es|s)$/, '');
		const key  = stem.length >= 4 ? stem : w;
		const prev = lastSeen.get(key);
		if (prev !== undefined && i - prev.i <= windowSize) {
			// The previous occurrence is only pushed the first time it
			// echoes — a word appearing three times in the window used to
			// emit the middle occurrence twice.
			if (!prev.flagged) hits.push({ from: prev.from, to: prev.to });
			hits.push({ from: t.from, to: t.to });
			lastSeen.set(key, { i, from: t.from, to: t.to, flagged: true });
		} else {
			lastSeen.set(key, { i, from: t.from, to: t.to, flagged: false });
		}
	}
	return hits;
}

// ── Smart typography ─────────────────────────────────────────────────────────
// Rules are pure data: `text` is what the user has typed once the newest
// character lands, `insert` is what replaces it. One matcher drives all of
// them, so adding a rule is a line rather than a branch.
//
// The dash chain is the interesting case — -- gives an en dash, another -
// promotes it to an em dash, and a third backs all the way out to three
// literal dashes, which is the escape hatch for anyone who wanted ---.
export const TYPO_RULES = [
	{ group: 'ellipsis',    text: '...',  insert: '\u2026' },

	{ group: 'dashes',      text: '--',            insert: '\u2013' },
	{ group: 'dashes',      text: '\u2013-',        insert: '\u2014' },
	{ group: 'dashes',      text: '\u2014-',        insert: '---'    },

	{ group: 'arrows',      text: '->',   insert: '\u2192' },
	{ group: 'arrows',      text: '<-',   insert: '\u2190' },
	{ group: 'arrows',      text: '=>',   insert: '\u21d2' },

	{ group: 'guillemets',  text: '<<',   insert: '\u00ab' },
	{ group: 'guillemets',  text: '>>',   insert: '\u00bb' },

	{ group: 'comparisons', text: '<=',   insert: '\u2264' },
	{ group: 'comparisons', text: '>=',   insert: '\u2265' },
	{ group: 'comparisons', text: '/=',   insert: '\u2260' },

	// notAfter stops 11/2 from collapsing into 1½.
	{ group: 'fractions', text: '1/2',  insert: '\u00bd', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/3',  insert: '\u2153', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '2/3',  insert: '\u2154', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/4',  insert: '\u00bc', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '3/4',  insert: '\u00be', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/5',  insert: '\u2155', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '2/5',  insert: '\u2156', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '3/5',  insert: '\u2157', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '4/5',  insert: '\u2158', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/6',  insert: '\u2159', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '5/6',  insert: '\u215a', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/7',  insert: '\u2150', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/8',  insert: '\u215b', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '3/8',  insert: '\u215c', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '5/8',  insert: '\u215d', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '7/8',  insert: '\u215e', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/9',  insert: '\u2151', notAfter: /[\d/]/ },
	{ group: 'fractions', text: '1/10', insert: '\u2152', notAfter: /[\d/]/ }
];

// Longest first, so 1/10 wins over 1/1 and the em-dash chain resolves before
// the en-dash rule gets a look.
TYPO_RULES.sort((a, b) => b.text.length - a.text.length);

export const TYPO_MAX_LOOKBACK = TYPO_RULES.reduce((n, r) => Math.max(n, r.text.length), 0);

// A quote opens when nothing meaningful precedes it — start of line,
// whitespace, an opening bracket, or a dash. It closes otherwise, which is
// what makes don't come out as don\u2019t with no apostrophe special case.
export const TYPO_OPENS_AFTER = /[\s([{<\u2018\u201c\u2013\u2014\u2026-]/;

// ── A SENTENCE STARTS HERE ("Capitalize sentences") ───────────────────
// Read from the line's text before the caret and the line above it (null on
// the first line). A sentence starts at the start of a line, past its block
// markers (quote marks, a bullet or number, a task box, a heading's hashes)
// and any opening quotes, unless the line above runs on without ending a
// sentence; and after `.`, `!` or `?`, the closing marks after them, a space
// and any opening marks. NOT after an ellipsis, which trails; not after an
// initial, a dotted abbreviation or a common one; not after `?` or `!` closed
// by a quote mark, where a dialogue tag goes on in lower case ("Really?" she
// asked); not in a table row or inside a link.
const WS_ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'vs', 'etc', 'fig', 'vol', 'cf', 'ca', 'approx',
	'gen', 'col', 'lt', 'sgt', 'capt', 'rev', 'mt', 'ft', 'inc', 'ltd', 'co', 'dept', 'jan', 'feb', 'apr', 'jun', 'jul', 'aug', 'sep',
	'sept', 'oct', 'nov', 'dec']);
// THE MARKS A SENTENCE IS READ BY, as character-class bodies: what may open one (quote
// marks, brackets), what ends one, what may close the one before, which of those are
// quote marks (a dialogue tag goes on after them), and the abbreviations that end
// none (with their dot; null is English's list). English's are the default; a
// language pack hands its own (A571).
// dash: the dialogue dash, escaped; ordinal: "3." is an ordinal there (German, Danish…) (A610)
export interface WsSentenceMarks { open: string; end: string; close: string; quote: string; abbr: Set<string> | null; dash?: string; ordinal?: boolean }
export const WS_SENTENCE_MARKS_EN: WsSentenceMarks = { open: '"\'\u201c\u2018([', end: '.!?', close: '"\'\u201d\u2019)\\]', quote: '"\'\u201d\u2019', abbr: null };
export function wsSentenceStart(before: string, prevLine: string | null, marks?: WsSentenceMarks | null): boolean {
	const k = marks || WS_SENTENCE_MARKS_EN;
	if (/^\s*\|/.test(before)) return false;
	if (before.lastIndexOf('[[') > before.lastIndexOf(']]')) return false;
	if (/\]\([^)]*$/.test(before)) return false;
	const m = /^(\s*(?:>\s?)*)(\s*(?:[-*+]\s+(?:\[.\]\s+)?|\d+[.)]\s+|#{1,6}\s+))?/.exec(before);
	const lead = m ? m[0] : '';
	const rest = before.slice(lead.length);
	// A LINE OPENED BY THE DIALOGUE DASH opens a sentence: —¿Vienes?, – Hej (A610)
	const dashLead = k.dash ? '(?:[' + k.dash + ']\\s?)?' : '';
	if (new RegExp('^' + dashLead + '[' + k.open + ']*$').test(rest)) {
		if (m && m[2]) return true;
		if (prevLine === null) return true;
		const p = prevLine.trimEnd().replace(/^\s*(?:>\s?)*/, '');
		if (p === '' || /^#{1,6}\s/.test(p) || /^(?:-{3,}|\*{3,}|_{3,})$/.test(p)) return true;
		return new RegExp('[' + k.end + '][' + k.close + ']*$').test(p);
	}
	const t = new RegExp('(\\S*?)([' + k.end + ']+)([' + k.close + ']*)\\s+' + (k.dash ? '([' + k.dash + ']\\s?)?' : '()') + '[' + k.open + ']*$').exec(rest);
	if (!t) return false;
	if (/\.\./.test(t[2])) return false;
	// A DASH AFTER THE END (A610): after a full stop it opens the speech again ("Jan. — Może");
	// after ? or ! it opens the tag, which goes on in lower case ("¿Vienes? —preguntó")
	if (t[4] && !/\./.test(t[2])) return false;
	if (new RegExp('[' + k.quote + ']').test(t[3]) && !/\./.test(t[2])) return false;
	if (t[2] === '.') {
		const w = t[1].replace(new RegExp('^[' + k.open + ']+'), '');
		if (/^\p{L}$/u.test(w) || w.indexOf('.') !== -1 || (k.abbr ? k.abbr.has(w.toLowerCase() + '.') : WS_ABBREVIATIONS.has(w.toLowerCase()))) return false;
		// "am 3. Oktober": an ordinal where the language writes them so; a year ends a sentence
		if (k.ordinal && /^\d{1,3}$/.test(w)) return false;
	}
	return true;
}

// ── Non-prose line scanning ──────────────────────────────────────────────────

// Line numbers (1-based) that are not prose: YAML frontmatter, fenced code
// (``` and ~~~), and $$ math blocks. Shared by the word counter, which works
// on a raw string, and the syntax highlighter, which works on a CodeMirror
// document — one implementation means the two can never disagree about which
// lines are text.
export function scanNonProseLines(lines: string[]) {
	const set = new Set();
	let inFence = false, fenceChar = '', inFront = false, inMath = false;
	for (let i = 0; i < lines.length; i++) {
		const n = i + 1, text = lines[i];
		if (n === 1 && /^---\s*$/.test(text)) { inFront = true; set.add(n); continue; }
		if (inFront) { set.add(n); if (/^---\s*$/.test(text)) inFront = false; continue; }
		const fence = text.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fence) {
			const ch = fence[1].charAt(0);
			if (!inFence)         { inFence = true;  fenceChar = ch; set.add(n); continue; }
			if (ch === fenceChar) { inFence = false; set.add(n); continue; }
		}
		if (inFence) { set.add(n); continue; }
		if (/^\s{0,3}\$\$/.test(text)) {
			set.add(n);
			if (!/^\s{0,3}\$\$.*\$\$\s*$/.test(text)) inMath = !inMath;
			continue;
		}
		if (inMath) set.add(n);
	}
	return set;
}

// ── Paragraph detection ──────────────────────────────────────────────────────

// Lines that open a block construct. Every one of these carries its own
// indentation already — a bullet, a table cell, a quote marker — so adding a
// first-line indent on top just breaks the alignment it depends on.
export const BLOCK_LINE_RE = /^\s{0,3}(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~|\[\^[^\]]*\]:|:\s)|^(?:\s{4,}|\t)\S/;

// Thematic breaks and setext underlines: --- *** ___ ===
export const RULE_LINE_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|={2,})\s*$/;

export function isParagraphLine(text: string) {
	if (!text || !text.trim()) return false;
	if (RULE_LINE_RE.test(text))  return false;
	if (BLOCK_LINE_RE.test(text)) return false;
	return true;
}

// ── Counting ─────────────────────────────────────────────────────────────────

// Han and kana are counted per character, because Japanese and Chinese are
// not space-delimited — splitting on whitespace returns 1 for an entire
// paragraph. Hangul is deliberately absent: Korean *does* put spaces between
// words, so it counts the same way English does.
export const CJK_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;

// A word is any run starting with a letter or digit. Requiring one of those
// is what keeps list bullets, table pipes, blockquote markers and emphasis
// asterisks from each counting as a word.
// A FIGURE IS ONE WORD (A610), its separators inside it: 1.000, 3,5, 3.14, 10:30 and
// 1.º were two each, in every language. A word processor counts each once. A figure
// first, then a word; NO LOOKBEHIND, which an older iPhone's Safari cannot parse (smoke).
// (A846: a word's own combining marks and joiners inside it, Hindi's vowel signs, Arabic's harakat, Persian's half-space:
// किताब one word, not क|त|ब; می‌روم one, not می|روم)
export const WORDISH = /\p{N}+(?:[.,:]\p{N}+)*(?:\.?[\u00ba\u00aa])?(?:[\p{L}\p{M}\p{N}'\u2019_-]|\u200c|\u200d)*|(?![\u00ba\u00aa])\p{L}(?:[\p{L}\p{M}\p{N}'\u2019_-]|\u200c|\u200d)*/gu;

// Blanks out markup while preserving nothing but the prose. Unlike
// maskMarkup (used for highlighting) this keeps inline code *content* — "the
// `config` file has three keys" is a seven-word sentence to any writer — and
// strips list, task and blockquote prefixes, which highlighting does not care
// about but counting very much does.
// THE HTML TAG MASK, READ ONCE ALONG THE LINE (the writer's pick, 2026-10-22, tests/slow_input_test.js): /<[^>]+>/g read
// from every "<" with no ">" after it to the line's end, the square of a line of "a < b" comparisons or "<-" arrows
// (x52 for eight times the line). The same spans, found with indexOf: from a "<" to the next ">" with something
// between, the search ending at the last ">".
export function wsTagSpans(s: string, f: (m: string) => string): string {
	let out = '', at = 0, i = s.indexOf('<');
	while (i !== -1) {
		const j = s.indexOf('>', i + 1);
		if (j < 0) break;
		if (j === i + 1) { i = s.indexOf('<', i + 1); continue; }
		out += s.slice(at, i) + f(s.slice(i, j + 1));
		at = j + 1;
		i = s.indexOf('<', at);
	}
	return out + s.slice(at);
}

// A PATTERN THAT ENDS IN ITS CLOSER, READ ONLY UP TO THE TEXT'S LAST CLOSER (the writer's "Do all", 2026-10-22,
// ws-dev/regex-risk.js): every match of `![alt](target)` or `](target)` ends with ")", so nothing past the text's last
// ")" can match, and past it a try from every "](" reads on to the end and fails, the square of a line of them. Up to
// the last closer every try stops at a closer. The same matches; the tail kept as it was.
export function wsUpToLast(s: string, closer: string): string {
	const k = s.lastIndexOf(closer);
	return k < 0 ? '' : s.slice(0, k + closer.length);
}
export function wsReplaceToLast(s: string, closer: string, re: RegExp, to: string | ((m: string, ...groups: string[]) => string)): string {
	const head = wsUpToLast(s, closer);
	if (!head) return s;
	return (typeof to === 'string' ? head.replace(re, to) : head.replace(re, to)) + s.slice(head.length);
}
// spaces and tabs off the end, as /[ \t]+$/ took them, read once from the end (the pattern read a run of them
// inside the text from each of its spaces)
export function wsTrimSpacesEnd(s: string): string {
	let e = s.length;
	while (e > 0 && (s.charCodeAt(e - 1) === 32 || s.charCodeAt(e - 1) === 9)) e--;
	return s.slice(0, e);
}

export function maskForCounting(text: string) {
	const blank = (m: string) => ' '.repeat(m.length);
	let out = text;
	out = out.replace(/^\s*(?:>\s?)+/, blank);                    // blockquote markers
	out = out.replace(/^\s*[-*+]\s+\[[ xX-]\]\s*/, blank);      // task checkbox
	out = out.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, blank);         // list bullet / number
	out = out.replace(/`+/g, blank);                              // fences only; code text counts
	out = out.replace(/!\[\[[^[\]]*\]\]/g, blank);                 // embeds
	out = out.replace(/\[\[([^[\]|]*)\|/g, blank);                 // wikilink target + pipe
	out = out.replace(/\[\[|\]\]/g, blank);
	out = wsReplaceToLast(out, ')', /!\[[^[\]]*\]\([^)]*\)/g, blank);   // images
	out = wsReplaceToLast(out, ')', /\]\([^)]*\)/g, blank);            // link target
	out = out.replace(/https?:\/\/\S+/g, blank);                  // bare urls
	out = wsTagSpans(out, blank);                         // html tags
	out = out.replace(/\[\^[^[\]]*\]/g, blank);                    // footnote markers
	out = out.replace(/\$[^$\n]+\$/g, blank);                     // inline math
	return wsMaskCitations(out);
}

// A CITATION KEY (#75, Folkemunne: Søhr_1938 "won't export"): Pandoc's, a letter of ANY alphabet, a digit or _
// first, then those, a combining mark and its inner punctuation. Read with the u flag. These were [A-Za-z0-9_] and
// \w, ASCII alone: Søhr_1938 was read as @S, 209 keys of the reporter's 670. One writer for the finder, the mask
// and the [@ search.
export const WS_CITE_KEY_START = '[\\p{L}\\p{N}_]';
export const WS_CITE_KEY_CHAR = '[\\p{L}\\p{M}\\p{N}_:.#$%&+?<>~/-]';
// …OR ANY KEY IN BRACES, Pandoc's way for one with other punctuation in it: @{Räikkönen_1935.498–506}, a key ending
// in a full stop (@{Schweitz.}), no space and no brace inside. The finder's whole key, the braces with it.
export const WS_CITE_KEY_RE = '(?:\\{[^{}\\s]+\\}|' + WS_CITE_KEY_START + WS_CITE_KEY_CHAR + '*)';
/** A key as the text must carry it to be read back whole: as it is, or in braces where it would be cut. */
export function wsCiteKeyText(key: string): string {
	const k = String(key || '');
	return new RegExp('^' + WS_CITE_KEY_START + WS_CITE_KEY_CHAR + '*$', 'u').test(k) && !/[.:,;?!/-]$/.test(k) ? k : '{' + k + '}';
}
const WS_CITE_BRACKET_MASK = new RegExp('\\[[^[\\]]*?-?@(?:' + WS_CITE_KEY_START + '|\\{)[^[\\]]*\\](?!\\()', 'gu');
const WS_CITE_NARRATIVE_MASK = new RegExp('(^|[^\\p{L}\\p{N}_@[\\]`])@' + WS_CITE_KEY_RE, 'gu');
// CITATIONS ARE NOT PROSE (A572): Pandoc's [@key, p. 12] and a narrative @key blanked,
// for the count and for the marks; an email (a letter before its @) is left as it is.
export function wsMaskCitations(text: string) {
	return text
		.replace(WS_CITE_BRACKET_MASK, (m: string) => ' '.repeat(m.length))
		.replace(WS_CITE_NARRATIVE_MASK, (m: string, pre: string) => pre + ' '.repeat(m.length - pre.length));
}

// ── Markup masking ───────────────────────────────────────────────────────────

// Blanks out everything that is not prose, preserving string length so all
// offsets stay valid against the real line. Inline code, URLs, link targets,
// HTML tags and footnote markers are replaced by spaces; the visible text of
// a link is kept, because that text is prose the writer is responsible for.
export function maskMarkup(text: string) {
	const blank = (m: string) => ' '.repeat(m.length);
	let out = text;
	out = out.replace(/`[^`]*`?/g, blank);                        // inline code
	out = out.replace(/!\[\[[^[\]]*\]\]/g, blank);                 // embeds
	out = out.replace(/\[\[([^[\]|]*)\|/g, blank);                 // wikilink target + pipe
	out = out.replace(/\[\[|\]\]/g, blank);                       // wikilink brackets
	out = wsReplaceToLast(out, ')', /!\[[^[\]]*\]\([^)]*\)/g, blank);   // images
	out = wsReplaceToLast(out, ')', /\]\([^)]*\)/g, blank);            // md link target
	out = out.replace(/https?:\/\/\S+/g, blank);                  // bare urls
	out = wsTagSpans(out, blank);                         // html tags
	out = out.replace(/\[\^[^[\]]*\]/g, blank);                    // footnotes
	out = out.replace(/^\s{0,3}#{1,6}\s/, blank);                 // heading marker
	out = out.replace(/\{\{(?:[^{}]|\{(?!\{))*\}\}/g, blank);                   // templates
	return wsMaskCitations(out);
}
