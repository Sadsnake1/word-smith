'use strict';

const { Plugin, PluginSettingTab, Setting, MarkdownView, TFile, TFolder, FuzzySuggestModal, Menu, Modal, setIcon } = require('obsidian');

// Path picker for the scope list. Defined conditionally because `class X
// extends undefined` throws at definition time, and FuzzySuggestModal is not
// present on very old API versions — there the Add buttons simply hide.
const WsPathSuggestModal = FuzzySuggestModal ? class extends FuzzySuggestModal {
	constructor(app, items, placeholder, onPick) {
		super(app);
		this._items = items;
		this._onPick = onPick;
		if (this.setPlaceholder) this.setPlaceholder(placeholder);
	}
	getItems() { return this._items; }
	getItemText(item) { return item; }
	onChooseItem(item) { this._onPick(item); }
} : null;

// Obsidian exposes its bundled CodeMirror 6 packages to plugins via require.
// Decorations registered through registerEditorExtension render inside CM6's
// own pipeline, which is the only glitch-free way to do per-line styling —
// any MutationObserver / direct-DOM approach races the editor's rendering
// and flickers (this is also how the reference typewriter-mode plugin works).
let CM = null;
try {
	const { ViewPlugin, Decoration, WidgetType, keymap, EditorView } = require('@codemirror/view');
	const { RangeSetBuilder, Prec } = require('@codemirror/state');
	CM = { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, keymap, EditorView, Prec };
	// Optional: only used to force the typography substitution into its own
	// undo step. Without it undo still works, it just takes the literal
	// characters with it.
	try { CM.isolateHistory = require('@codemirror/commands').isolateHistory; } catch (_) {}
} catch (_) {
	// Extremely old Obsidian build — dimming + hidden markers silently off.
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrow style presets
// ─────────────────────────────────────────────────────────────────────────────

const ARROW_STYLES = {
	'solid-triangle':   { top: '▲', bottom: '▼' },
	'outline-triangle': { top: '△', bottom: '▽' },
	'standard-arrow':   { top: '↑', bottom: '↓' },
	'chevron':          { top: '∧', bottom: '∨' },
	'double-chevron':   { top: '⇑', bottom: '⇓' },
	'custom':           { top: '',   bottom: ''  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Prose analysis — lexicon, tagger, detectors
//
// Everything here is deliberately dependency-free. A real POS tagger
// (compromise, wink, natural) is 200KB–2MB and would dwarf the plugin; this
// is a lexicon + suffix + context tagger in the Brill tradition, which gets
// roughly 90% of ordinary English prose right. That is the correct accuracy
// target for a *writing aid*: the highlighting is a nudge to look at a
// sentence, not a grammatical assertion, and a wrong colour costs the writer
// a glance. Anything that needs to be exact (word counts, goals) is computed
// elsewhere and never goes through here.
//
// Tags used internally:
//   DET PRON PREP CONJ AUX MOD ADV ADJ NOUN VERB NUM TO
// which collapse to five highlight classes (noun / verb / adj / adv / conj)
// mirroring syntax colouring.
// ─────────────────────────────────────────────────────────────────────────────

const POS_LEX = Object.create(null);
(function buildLexicon() {
	const add = (tag, words) => {
		for (const w of words.split(/\s+/)) if (w) POS_LEX[w] = tag;
	};

	add('DET', `a an the this that these those my your his her its our their
		some any each every no another both either neither all much many few
		little several enough such which whose what`);

	add('PRON', `i me you he him she it we us they them mine yours hers ours
		theirs myself yourself himself herself itself ourselves yourselves
		themselves who whom someone somebody something anyone anybody anything
		everyone everybody everything nobody nothing none one`);

	add('PREP', `of in for with on at by from about into over under above
		across against along among amid around before behind below beneath
		beside besides between beyond despite during except inside near off
		onto outside past since through throughout till toward towards
		underneath until unto upon within without via per unlike`);

	add('CONJ', `and but or nor yet so because although though while whereas
		unless if when whenever wherever whether than plus versus`);

	add('AUX', `am is are was were be been being have has had having do does
		did doing`);

	add('MOD', `will would shall should can could may might must ought`);

	add('TO', 'to');

	// Adverbs that do not end in -ly, plus the discourse connectives.
	add('ADV', `not never always often sometimes usually rarely seldom very
		quite rather too also just only even still already soon now then here
		there again once twice far away back together apart forward ahead
		almost nearly hardly barely scarcely somewhat somehow perhaps maybe
		indeed instead however therefore thus moreover nevertheless nonetheless
		anyway otherwise meanwhile furthermore hence why how well today
		tomorrow yesterday tonight later earlier ever else rather forth aside
		abroad anymore altogether upward downward inward outward`);

	add('ADJ', `good bad big small large little old new young long short high
		low great same different other own able early late main major minor
		real true false whole full empty free hard easy simple complex clear
		dark light heavy soft loud quiet strong weak rich poor deep shallow
		wide narrow thick thin clean dirty warm cool hot cold dry wet sharp
		dull fast slow safe next last first second third final total certain
		sure possible likely necessary important common general specific
		particular single double sorry ready open close public private local
		national international social political economic human natural best
		better worse worst less least more most difficult strange quick slight
		direct exact vast brief sudden silent distant ancient modern current
		recent obvious similar familiar popular regular various serious
		previous senior junior chief prime sole mere utter sheer stark plain
		vague subtle blunt harsh calm tense tight loose smooth rough steep
		flat round square straight curved hollow solid dense sparse lengthy
		tidy messy odd fine keen bold quiet sweet bitter sour tough gentle
		fierce eager weary alive alone aware alike`);

	// Common nouns that suffix rules would otherwise mis-tag.
	add('NOUN', `time way people man woman men women child children day year
		work place case point group number world life hand eye head word thing
		name home room door house water fire air book story line page thought
		idea money family friend school city country state night morning
		evening week month hour minute moment reason question answer problem
		sense mind heart voice face body kind sort part end side form order
		matter fact view level rate area field course result effect chance
		change nothing everything something anything`);

	// Base-form verbs. Many are also nouns (work, call, run, hold); context
	// rules below demote them to NOUN after a determiner or preposition.
	add('VERB', `go goes went gone going come comes came make makes made take
		takes took taken see sees saw seen know knows knew known think thinks
		say says said tell tells told give gives gave given find finds want
		wants need needs use uses try tries ask asks call calls feel feels felt
		seem seems leave leaves left keep keeps kept let lets begin begins
		began begun help helps show shows shown turn turns start starts run
		runs ran move moves live lives believe believes hold holds held bring
		brings brought happen happens write writes wrote written read stand
		stands stood hear hears heard mean means meant set sets meet meets met
		pay pays paid sit sits sat speak speaks spoke spoken lie lies lay lead
		leads led grow grows grew grown open opens win wins won offer offers
		remember remembers love loves consider considers appear appears buy
		buys bought wait waits serve serves die dies send sends build builds
		built stay stays fall falls fell cut cuts reach reaches remain remains
		put puts get gets got gotten become becomes became look looks like
		likes work works play plays walk walks talk talks check checks add adds
		note notes list lists click clicks press presses save saves load loads
		close closes choose chooses pick picks draw draws point points push
		pushes pull pulls carry carries follow follows lead include includes
		provide provides create creates allow allows report reports describe
		describes explain explains suggest suggests decide decides expect
		expects prefer prefers manage manages develop develops support
		supports require requires produce produces receive receives return
		returns continue continues change changes learn learns teach teaches
		spend spends watch watches listen listens forget forgets enjoy enjoys
		agree agrees accept accepts refuse refuses avoid avoids reduce reduces
		improve improves replace replaces remove removes apply applies`);
})();

// -ly words that are adjectives (or otherwise not the manner adverbs a
// writer is being asked to reconsider). Without this list "family",
// "reply" and "supply" all light up as adverbs.
const LY_NOT_ADVERB = new Set(`only family reply apply supply imply comply
	multiply rely rally ally july italy holy ugly silly early likely lonely
	lovely friendly deadly costly orderly elderly monthly weekly daily yearly
	nightly hourly timely lively unlikely ghastly ghostly homely jolly folly
	bully belly sally tally melancholy anomaly assembly bristly burly chilly
	crumbly curly dolly gully hilly jelly kindly lolly manly measly oily
	prickly rally scaly smelly steely surly wobbly wooly worldly italy sicily
	assembly panoply monopoly`.split(/\s+/).filter(Boolean));

// ── Tokenizer ────────────────────────────────────────────────────────────────

const WORD_RE = /[A-Za-z][A-Za-z'\u2019-]*/g;

function tokenizeLine(text) {
	const out = [];
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

function suffixTag(lw, raw, isFirstInSentence) {
	if (/^\d/.test(lw)) return 'NUM';
	if (lw.length > 3 && /ly$/.test(lw) && !LY_NOT_ADVERB.has(lw)) return 'ADV';
	if (lw.length > 4 && /(ing)$/.test(lw)) return 'VERB';
	if (lw.length > 3 && /(ed)$/.test(lw)) return 'VERB';
	if (lw.length > 4 && /(est)$/.test(lw)) return 'ADJ';
	if (lw.length > 4 && /(tion|sion|ment|ness|ity|ance|ence|ship|hood|dom|ism|ist|acy|age|ure|ery|ology|graphy|itis)$/.test(lw)) return 'NOUN';
	if (lw.length > 4 && /(ous|ful|less|ive|able|ible|ical|ic|ish|ary|ent|ant|ile|ory|some|like|ward|proof)$/.test(lw)) return 'ADJ';
	if (lw.length > 4 && /(ize|ise|ate|ify|fy)$/.test(lw)) return 'VERB';
	if (lw.length > 3 && /(er|or)$/.test(lw)) return 'NOUN';
	if (lw.length > 3 && /s$/.test(lw) && !/ss$/.test(lw)) {
		const base = lw.replace(/(ies|es|s)$/, m => (m === 'ies' ? 'y' : ''));
		if (POS_LEX[base] === 'VERB') return 'VERB';
		return 'NOUN';
	}
	// Capitalised mid-sentence → proper noun.
	if (!isFirstInSentence && /^[A-Z]/.test(raw)) return 'NOUN';
	return 'NOUN';
}

// ── Context rules ────────────────────────────────────────────────────────────

const SENT_END = /[.!?\u2026]$/;

function tagTokens(tokens, text) {
	// Pass 1 — lexicon, then suffix.
	let firstInSentence = true;
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const lex = POS_LEX[t.lw];
		t.first = firstInSentence;
		t.tag = lex || suffixTag(t.lw, t.w, firstInSentence);
		// A sentence ends when the character right after this token is a
		// terminator (the tokenizer never swallows punctuation).
		const after = text.slice(t.to, t.to + 2);
		firstInSentence = SENT_END.test(after.trim().charAt(0) || '');
	}

	// Pass 2 — context. Cheap, local, and in the order that matters:
	// determiner/preposition demotion before infinitive promotion, so
	// "the run" stays a noun but "to run" becomes a verb.
	for (let i = 0; i < tokens.length; i++) {
		const t    = tokens[i];
		const prev = i > 0 ? tokens[i - 1] : null;
		const next = i + 1 < tokens.length ? tokens[i + 1] : null;

		// "the work", "a call", "in place" → noun, not verb. An -ing word
		// in the same slot is a gerund ("the meeting") unless a noun
		// follows, which makes it a participial modifier ("the running
		// water"). -ed words after a determiner are always modifiers.
		if (t.tag === 'VERB' && prev && (prev.tag === 'DET' || prev.tag === 'PREP')) {
			if (/ed$/.test(t.lw))       t.tag = 'ADJ';
			else if (/ing$/.test(t.lw)) t.tag = (next && next.tag === 'NOUN') ? 'ADJ' : 'NOUN';
			else                        t.tag = 'NOUN';
		}
		// Determiner + adjective with no noun after it → the adjective is
		// carrying the noun slot ("the poor", "the best").
		if (t.tag === 'ADJ' && prev && prev.tag === 'DET' && (!next || next.tag !== 'NOUN')) {
			// leave adjectives that clearly modify something later
			if (!next || (next.tag !== 'ADJ' && next.tag !== 'NOUN')) t.tag = 'NOUN';
		}
		// "to write" → infinitive.
		if (prev && prev.tag === 'TO' && (t.tag === 'NOUN' || t.tag === 'ADJ') && POS_LEX[t.lw] !== 'NOUN') {
			t.tag = 'VERB';
		}
		// Auxiliary or modal followed by a candidate → verb.
		if (prev && (prev.tag === 'AUX' || prev.tag === 'MOD') && t.tag === 'NOUN' && /ing$|ed$|en$/.test(t.lw)) {
			t.tag = 'VERB';
		}
		// Noun immediately before a noun, where the first is also an
		// adjective by suffix, reads as a modifier.
		if (t.tag === 'NOUN' && next && next.tag === 'NOUN' && /(ic|al|ive|ous|ful)$/.test(t.lw)) {
			t.tag = 'ADJ';
		}
		// An unknown word between a determiner (or another adjective) and a
		// noun is filling the modifier slot: "her difficult book". Limited to
		// words the lexicon does not claim, so noun-noun compounds like "the
		// book cover" keep both nouns.
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next &&
			(prev.tag === 'DET' || prev.tag === 'ADJ') && next.tag === 'NOUN') {
			t.tag = 'ADJ';
		}
		// Sentence-initial word followed by a determiner or pronoun, with no
		// lexicon entry claiming it as a noun, is almost always an
		// imperative verb ("Check the file", "Open your notes").
		if (t.first && t.tag === 'NOUN' && !POS_LEX[t.lw] && next &&
			(next.tag === 'DET' || next.tag === 'PRON')) {
			t.tag = 'VERB';
		}
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
function posBucket(tag) {
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

// Hedges, intensifiers and vague quantifiers.
const FILLER_WORDS = new Set(`very really quite rather somewhat fairly pretty
	extremely incredibly absolutely totally completely utterly literally
	actually basically essentially virtually practically arguably apparently
	seemingly presumably supposedly relatively generally typically usually
	often sometimes frequently occasionally probably possibly perhaps maybe
	surely certainly clearly obviously definitely simply merely just almost
	nearly roughly approximately several various numerous many most some few
	much lots somehow truly honestly frankly interestingly notably importantly
	significantly substantially considerably slightly marginally overall
	ultimately effectively largely mostly partly rarely`
	.split(/\s+/).filter(Boolean));

const FILLER_PHRASES = new RegExp('\\b(' + [
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
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
	"isn't", "aren't", "wasn't", "weren't", 'get', 'gets', 'got', 'getting']);

const IRREGULAR_PP = new Set(`been done gone seen taken given made said known
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
const ED_NOT_PARTICIPLE = new Set(`need indeed hundred thousand sacred wicked
	naked embed exceed proceed succeed feed speed breed bleed agreed freed
	deed creed greed seed weed shed sled bed fled led red wed hatred ahead
	instead spread thread bread dread biped moped aged blessed rugged ragged
	wretched crooked jagged`.split(/\s+/).filter(Boolean));

const VERB_PREFIXES = ['re', 'over', 'under', 'out', 'mis', 'un', 'pre', 'dis',
	'fore', 'up', 'inter', 'trans', 'co', 'de'];

function isPastParticiple(tok) {
	const lw = tok.lw;
	if (IRREGULAR_PP.has(lw)) return true;
	if (lw.length > 5) {
		for (const pre of VERB_PREFIXES) {
			if (lw.startsWith(pre) && IRREGULAR_PP.has(lw.slice(pre.length))) return true;
		}
	}
	return lw.length > 3 && /ed$/.test(lw) && !ED_NOT_PARTICIPLE.has(lw);
}

function isLyAdverb(tok) {
	return tok.lw.length > 3 && /ly$/.test(tok.lw) && !LY_NOT_ADVERB.has(tok.lw);
}

function findPassive(tokens) {
	const hits = [];
	const skippable = t => t.tag === 'ADV' || isLyAdverb(t) || t.lw === 'been' || t.lw === 'being';
	for (let i = 0; i < tokens.length; i++) {
		if (!BE_FORMS.has(tokens[i].lw)) continue;
		let j = i + 1, hops = 0;
		while (j < tokens.length && hops < 4 && skippable(tokens[j])) { j++; hops++; }
		if (j < tokens.length && isPastParticiple(tokens[j])) {
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
function findIllusions(tokens) {
	const hits = [];
	for (let i = 1; i < tokens.length; i++) {
		if (tokens[i].lw !== tokens[i - 1].lw) continue;
		if (tokens[i].lw.length < 2) continue;               // "s s" in odd markup
		hits.push({ from: tokens[i - 1].from, to: tokens[i].to });
	}
	return hits;
}

// Pairs people reach for the wrong half of. Flagged for a look, never
// "corrected" — which half is right depends on the sentence.
const MISUSED_WORDS = new Set(`affect effect its it's their there they're your
	you're then than lose loose complement compliment principal principle
	discreet discrete farther further fewer less lay lie laid lain who whom
	whose who's accept except adverse averse allusion illusion capital capitol
	cite site sight elicit illicit eminent imminent ensure insure assure
	precede proceed stationary stationery than then to too two weather whether
	alot irregardless supposably could've would've should've
	comprised nauseous peruse literally bemused enormity`
	.split(/\s+/).filter(Boolean));

// A pronoun opening a sentence usually points at the previous one, and the
// reader has to guess which part. Mid-sentence pronouns are left alone.
const VAGUE_PRONOUNS = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'them', 'there']);

// ── Readability ──────────────────────────────────────────────────────────────

// Syllable counting by the standard heuristic: strip silent endings, then
// count vowel groups. Wrong on a minority of words ("fire", "poem"), which is
// fine — Flesch–Kincaid averages over a whole document and the error washes
// out long before it moves the grade.
function countSyllables(word) {
	let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
	if (!w) return 0;
	if (w.length <= 3) return 1;
	w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
	w = w.replace(/^y/, '');
	const groups = w.match(/[aeiouy]{1,2}/g);
	return groups ? groups.length : 1;
}

// Sentence ranges within one line. Markdown paragraphs are normally a single
// soft-wrapped line, so a sentence very rarely crosses a hard break; treating
// the line as the outer bound keeps this cheap and viewport-local.
const SENTENCE_SPLIT = /[^.!?\u2026]+[.!?\u2026]*\s*/g;

function splitSentences(text) {
	const out = [];
	SENTENCE_SPLIT.lastIndex = 0;
	let m;
	while ((m = SENTENCE_SPLIT.exec(text))) {
		if (!m[0].trim()) continue;
		// Trim the trailing whitespace back off so the tint stops at the
		// full stop rather than running into the next sentence.
		const raw  = m[0];
		const from = m.index;
		const to   = from + raw.replace(/\s+$/, '').length;
		if (to > from) out.push({ from, to, text: raw.trim() });
	}
	return out;
}

// Flesch–Kincaid grade level. Below ~9 reads easily; the Hemingway app calls
// 10–13 hard and 14+ very hard, which is where the two tints come from.
function fkGrade(words, sentences, syllables) {
	if (!words || !sentences) return 0;
	return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

// Grade for one sentence, from its own tokens.
function sentenceGrade(tokens) {
	if (!tokens.length) return 0;
	let syl = 0;
	for (const t of tokens) syl += countSyllables(t.w);
	return fkGrade(tokens.length, 1, syl);
}

// ── Repetition radar ─────────────────────────────────────────────────────────

// Words common enough that repeating them is invisible and unavoidable. Only
// words outside this list, and long enough to be noticed, are worth flagging.
const REPETITION_STOPWORDS = new Set(`the a an and or but if then than that this
	these those there here it its it's is are was were be been being am do does
	did have has had having will would shall should can could may might must
	i me my we us our you your he him his she her they them their who whom whose
	what which when where why how all any both each few more most other some such
	no nor not only own same so too very just also as at by for from in into of
	on to with about after before between during over under again once out up
	down off above below now new one two three way get got go went come came
	said say says like make made take took see saw know knew think thought`
	.split(/\s+/).filter(Boolean));

// A word is an echo when the same word appeared within `window` words behind
// it. Both occurrences are marked, because you cannot fix one without seeing
// the other.
function findRepetitions(tokens, windowSize, minLength) {
	const hits = [];
	const lastSeen = new Map();
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const w = t.lw.replace(/[^a-z']/g, '');
		if (w.length < minLength || REPETITION_STOPWORDS.has(w)) continue;
		// Crude stemming, so "writing" echoes "writes".
		const stem = w.replace(/(ing|ed|es|s)$/, '');
		const key  = stem.length >= 4 ? stem : w;
		const prev = lastSeen.get(key);
		if (prev !== undefined && i - prev.i <= windowSize) {
			hits.push({ from: prev.from, to: prev.to });
			hits.push({ from: t.from,   to: t.to   });
		}
		lastSeen.set(key, { i, from: t.from, to: t.to });
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
const TYPO_RULES = [
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

const TYPO_MAX_LOOKBACK = TYPO_RULES.reduce((n, r) => Math.max(n, r.text.length), 0);

// A quote opens when nothing meaningful precedes it — start of line,
// whitespace, an opening bracket, or a dash. It closes otherwise, which is
// what makes don't come out as don\u2019t with no apostrophe special case.
const TYPO_OPENS_AFTER = /[\s([{<\u2018\u201c\u2013\u2014\u2026-]/;

// ── Non-prose line scanning ──────────────────────────────────────────────────

// Line numbers (1-based) that are not prose: YAML frontmatter, fenced code
// (``` and ~~~), and $$ math blocks. Shared by the word counter, which works
// on a raw string, and the syntax highlighter, which works on a CodeMirror
// document — one implementation means the two can never disagree about which
// lines are text.
function scanNonProseLines(lines) {
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
const BLOCK_LINE_RE = /^\s{0,3}(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~|\[\^[^\]]*\]:|:\s)|^(?:\s{4,}|\t)\S/;

// Thematic breaks and setext underlines: --- *** ___ ===
const RULE_LINE_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|={2,})\s*$/;

function isParagraphLine(text) {
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
const CJK_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;

// A word is any run starting with a letter or digit. Requiring one of those
// is what keeps list bullets, table pipes, blockquote markers and emphasis
// asterisks from each counting as a word.
const WORDISH = /[\p{L}\p{N}][\p{L}\p{N}'\u2019_-]*/gu;

// Blanks out markup while preserving nothing but the prose. Unlike
// maskMarkup (used for highlighting) this keeps inline code *content* — "the
// `config` file has three keys" is a seven-word sentence to any writer — and
// strips list, task and blockquote prefixes, which highlighting does not care
// about but counting very much does.
function maskForCounting(text) {
	const blank = m => ' '.repeat(m.length);
	let out = text;
	out = out.replace(/^\s*(?:>\s?)+/, blank);                    // blockquote markers
	out = out.replace(/^\s*[-*+]\s+\[[ xX\-]\]\s*/, blank);      // task checkbox
	out = out.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, blank);         // list bullet / number
	out = out.replace(/`+/g, blank);                              // fences only; code text counts
	out = out.replace(/!\[\[[^\]]*\]\]/g, blank);                 // embeds
	out = out.replace(/\[\[([^\]|]*)\|/g, blank);                 // wikilink target + pipe
	out = out.replace(/\[\[|\]\]/g, blank);
	out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, blank);            // images
	out = out.replace(/\]\([^)]*\)/g, blank);                     // link target
	out = out.replace(/https?:\/\/\S+/g, blank);                  // bare urls
	out = out.replace(/<[^>]+>/g, blank);                         // html tags
	out = out.replace(/\[\^[^\]]*\]/g, blank);                    // footnote markers
	out = out.replace(/\$[^$\n]+\$/g, blank);                     // inline math
	return out;
}

// ── Markup masking ───────────────────────────────────────────────────────────

// Blanks out everything that is not prose, preserving string length so all
// offsets stay valid against the real line. Inline code, URLs, link targets,
// HTML tags and footnote markers are replaced by spaces; the visible text of
// a link is kept, because that text is prose the writer is responsible for.
function maskMarkup(text) {
	const blank = m => ' '.repeat(m.length);
	let out = text;
	out = out.replace(/`[^`]*`?/g, blank);                        // inline code
	out = out.replace(/!\[\[[^\]]*\]\]/g, blank);                 // embeds
	out = out.replace(/\[\[([^\]|]*)\|/g, blank);                 // wikilink target + pipe
	out = out.replace(/\[\[|\]\]/g, blank);                       // wikilink brackets
	out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, blank);            // images
	out = out.replace(/\]\([^)]*\)/g, blank);                     // md link target
	out = out.replace(/https?:\/\/\S+/g, blank);                  // bare urls
	out = out.replace(/<[^>]+>/g, blank);                         // html tags
	out = out.replace(/\[\^[^\]]*\]/g, blank);                    // footnotes
	out = out.replace(/^\s{0,3}#{1,6}\s/, blank);                 // heading marker
	out = out.replace(/\{\{[^}]*\}\}/g, blank);                   // templates
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
	// ── Master switch ─────────────────────────────────────────────────────────
	pluginEnabled:            true,
	restoreCursorPosition:    true,
	cursorMemory:             {},        // path -> {line, ch}, bounded on write

	// ── Scope ─────────────────────────────────────────────────────────────────
	// An empty list means every note, in either mode. That is the only sane
	// default: a scope feature that starts out excluding everything would look
	// exactly like a broken plugin.
	scopeMode:                'include',  // 'include' | 'exclude'
	scopePaths:               [

	],

	// ── Zen mode ──────────────────────────────────────────────────────────────
	// zenMode stays false as a default even though the author writes in zen:
	// it's a runtime mode, not a preference — defaulting it on would collapse
	// sidebars and hide the entire UI the moment a new user installs the
	// plugin, before they know what's happening or how to exit.
	zenMode:                  true,
	fullscreen:               false,
	leftSidebar:              true,       // saved state (was collapsed when entering zen)
	rightSidebar:             true,
	hideProperties:           true,
	hideInlineTitle:          true,
	hideStatusBar:            true,
	hideLinkedMentions:       true,
	hideScrollBar:            true,
	hideRibbon:               true,
	topPadding:               17,
	bottomPadding:            21,
	focusedFileMode:          false,

	// ── Typewriter / letterbox ────────────────────────────────────────────────
	enableTypewriter:         false,
	editorPaddingH:           0,
	// The Zen tab's master switch. Focus mode and letterbox are its two
	// halves; the Z badge in the bar toggles this, not focus mode alone.
	zenEnabled:               true,
	zenTitlebarMatch:         false,     // paint the window title bar like the editor
	enableLetterbox:          true,
	letterboxLines:           8,
	letterboxPx:              67,
	maskPaddingH:             193,
	maskOverhang:             4,
	arrowStyle:               'solid-triangle',
	arrowLineEnds:            false,     // cap each separator line with an arrow
	customArrowTop:           '^',
	customArrowBottom:        'v',
	arrowCount:               5,
	arrowScale:               1,
	separatorStyle:           'solid',
	separatorWeight:          2,
	highlightCurrentLine:     false,
	lineHighlightDarkColor:   '#3a3a2a',
	lineHighlightLightColor:  '#fff2b2',
	lineHighlightOpacity:     0.15,
	typewriterLinesAbove:     8,
	typewriterLinesBelow:     8,
	dimUnfocusedEnabled:      false,
	dimFocusMode:             'paragraph', // 'paragraph' | 'sentence'
	dimOpacity:               0.55,

	// ── Retro status bar ──────────────────────────────────────────────────────
	enableRetroStatus:        true,
	// Toggled by command rather than by hover. Three attempts at an
	// auto-hiding bar all foundered on the same thing: a full-width strip
	// living next to Obsidian's own chrome keeps colliding with it.
	retroBarHidden:           false,
	// statusRows is the source of truth for bar content. The old flat
	// statusFormatLeft/Center/Right keys are folded into row 0 on load and
	// then deleted, so there is never a second place holding the same text.
	statusBarRows:            2,
	statusRows: [
		{ left: '{file}', center: '{goal}', right: ' {paragraph} | {battery} | {date} {time} ' },
		{ left: '{num} {caps} {mode} ', center: '{words} words', right: '{markers} {syntax} {readtime} read' },
		{ left: '', center: '', right: '' }
	],
	readTimeWpm:              200,        // reading speed {readtime} divides by
	fileTokenFormat:          'path',     // 'path' (~/folder/name) | 'name' (basename only)
	statusBarBorderStyle:     'solid',     // matches the mask separator options
	statusBarBorderWidth:     2,           // 1–8 px; 'none' style hides it
	statusBarFontSize:        12,
	statusBarHeight:          27,
	statusBarPadTop:          5,         // breathing room above the rows
	statusBarPadBottom:       5,         // and below them
	// ── Goals ────────────────────────────────────────────────────────────────
	// Three of them, drawn the same way: the writing goal as a ring, the file
	// goal as a triangle, the folder goal as a square. One label mode and one
	// line weight across all three, so they never disagree about how they look.
	goalTarget:               1000,       // the writing goal, {goal}
	goalBaseline:             0,          // words already written when it was last rebased
	fileGoals:                {},         // note path   -> word target
	folderGoals:              {},         // folder path -> word target
	goalLabelMode:            'percent',  // 'percent' inside | 'fraction' beside | 'none'
	goalRingWeight:           12,         // gauge thickness, in viewBox units
	goalOrientation:          'vertical', // 'vertical' | 'horizontal'
	goalCustomColors:         false,      // off: all three inherit the bar's text colour
	goalShowGauge:            true,       // off: the label alone, no bar
	goalLenWriting:           90,         // horizontal length, in viewBox units
	goalLenFile:              90,
	goalLenFolder:            90,
	goalColor:                '#4caf7d',  // writing goal
	fileGoalColor:            '#4f9dde',  // file goal
	folderGoalColor:          '#d98cc4',  // folder goal

	dateFormat:               'dd/mm',
	// Off by default: the bar should look like part of the app it lives in,
	// not like a second app parked at the bottom of the window.
	retroCustomColors:        false,
	retroDarkBgColor:         '#050505',
	retroDarkTextColor:       '#fbfaf9',
	retroLightBgColor:        '#f5f0e8',
	retroLightTextColor:      '#050505',
	arrowDarkColor:           '#fbfaf9',
	arrowLightColor:          '#2b2b2b',
	lineDarkColor:            '#faf8f5',
	lineLightColor:           '#2b2b2b',

	// ── Misc options ──────────────────────────────────────────────────────────
	miscEnabled:              true,

	// ── Text options ──────────────────────────────────────────────────────────
	enableParagraphIndent:    true,
	paragraphIndentEm:        4,
	paragraphIndentMode:      'single',   // 'double' | 'single'
	lineSpacing:              1.5,
	editorFont:               '',        // '' = whatever the theme sets
	limitLineLength:          true,
	maxLineChars:             64,
	justifyText:              true,
	showHiddenMarkers:        false,
	markSpaces:               false,
	markTabs:                 false,
	markParagraphs:           false,
	markEndOfLines:           false,

	// ── Hemingway mode ────────────────────────────────────────────────────────
	// Every lock is individually switchable, but the defaults describe what
	// "Hemingway mode" means when you turn it on: you can type forward and
	// nothing else. Paste is the one exception — pulling in a quote or a note
	// is not self-editing, and blocking it mostly just breaks research.
	hemingwayEnabled:         false,
	hemBlockBackspace:        true,
	hemBlockDelete:           true,
	hemBlockUndo:             true,
	hemBlockCut:              true,
	hemBlockPaste:            true,
	hemBlockArrows:           false,
	hemBlockJumpKeys:         false,     // Home / End / PageUp / PageDown
	hemBlockSelectAll:        false,
	hemBlockMouse:            false,     // clicking to reposition the caret
	hemFlashTarget:           'retrobar',  // 'none' | 'screen' | 'retrobar' | 'both'

	// ── Syntax highlight ──────────────────────────────────────────────────────
	syntaxSkipCode:           true,
	syntaxStyle:              'text',     // 'text' | 'highlight' | 'squiggle' | 'line'
	checksEnabled:            false,      // master switch over the writing checks
	checkStyle:               'squiggle', // same options, for the writing checks
	checkFiller:              false,
	checkFillerColor:         '#8a7fd1',
	checkPassive:             false,
	checkPassiveColor:        '#c2544d',
	checkIllusion:            false,
	checkIllusionColor:       '#d98cc4',
	checkMisused:             false,
	checkMisusedColor:        '#e0913a',
	checkPronoun:             false,
	checkPronounColor:        '#4f9dde',
	checkRhythm:              false,
	checkRhythmHardColor:     '#d4a017',
	checkRhythmVeryHardColor: '#c2544d',
	checkRhythmHardGrade:     10,        // Flesch-Kincaid grade for "hard"
	checkRhythmVeryHardGrade: 14,        // and for "very hard"
	checkRepetition:          false,
	checkRepetitionColor:     '#4caf7d',
	repetitionWindow:         50,        // words
	repetitionMinLength:      5,         // ignore short words
	posEnabled:               false,
	posDimOthers:             true,
	posNoun:                  true,
	posNounColor:             '#4f9dde',
	posVerb:                  true,
	posVerbColor:             '#4caf7d',
	posAdjective:             true,
	posAdjectiveColor:        '#d98cc4',
	posAdverb:                true,
	posAdverbColor:           '#e0913a',
	posConjunction:           true,
	posConjunctionColor:      '#9aa0a6',

	// ── Typography ────────────────────────────────────────────────────────────
	// Off by default: it rewrites the document as you type, and that is not a
	// thing to start doing to someone's notes uninvited.
	typographyEnabled:        true,
	typoSmartQuotes:          true,
	typoCustomQuotes:         false,     // pick the characters yourself
	typoOpenDouble:           '\u201c',
	typoCloseDouble:          '\u201d',
	typoOpenSingle:           '\u2018',
	typoCloseSingle:          '\u2019',
	typoApostrophe:           '\u2019',
	typoEllipsis:             true,
	typoDashes:               true,
	typoArrows:               true,
	typoComparisons:          false,
	typoGuillemets:           false,
	typoFractions:            true,

	// ── Sidebar word counts ───────────────────────────────────────────────────
	enableFileTreeCounts:     true,
	enableOutlineCounts:      true,
};

// ─────────────────────────────────────────────────────────────────────────────
// Plugin
// ─────────────────────────────────────────────────────────────────────────────

module.exports = class WordSmith extends Plugin {

	// ════════════════════════════════════════════════════════════════════════
	// LIFECYCLE
	// ════════════════════════════════════════════════════════════════════════

	async onload() {
		// ── Mask / letterbox state ─────────────────────────────────────────────
		this.maskTopEl        = null;
		this.maskBottomEl     = null;
		this.arrowsTopEl      = null;
		this.arrowsBottomEl   = null;
		this.maskResizeObserver = null;
		this._maskRaf         = null;

		// ── Retro bar state ───────────────────────────────────────────────────
		this.retroStatusBarEl = null;
		this.clockInterval    = null;
		this.batteryLevel     = null;
		this.batteryCharging  = false;
		this._batteryManager  = null;   // kept so listeners can be detached on unload
		this._batteryHandler  = null;
		this._zgLastTotalWordCount = 0;
		this._docStatsCache   = null;   // { doc, totalWC, charCount, paras } keyed on CM doc identity
		this._lastFit         = null;   // fitStatusBarText memo { text, width, base }
		this._capsLockOn      = false;  // tracked from keyboard events for {caps}
		this._numLockOn       = false;  // tracked from keyboard events for {nump}
		this._statusRowEls    = [];     // per-row elements, for per-row text fitting
		this._goalWasMet      = null;   // previous goal state, to fire the celebration once
		this._fenceCache      = null;   // { doc, set } of non-prose line numbers
		this._paraCache       = null;   // { doc, val } paragraph geometry
		this._lastTypo        = null;   // last typography substitution, for backspace-to-revert
		this._barPicker       = null;   // open bar popup, if any
		this._barPickerDismiss = null;
		this._barPickerKey    = (e) => { if (e.key === 'Escape') this.closeBarPicker(); };
		this._cursorMemory    = {};     // path -> {line, ch, scroll}
		this._cursorLastFile  = null;   // note the poll is allowed to record for
		this._cursorLoading   = false;  // true while a restore is in flight
		this._cursorDirty     = false;  // memory changed since the last save
		this._fmCache         = {};     // path -> frontmatter overrides
		this._hemFlashTimer   = null;   // clears the blocked-key flash class
		this._scopeGen        = 0;      // bumped on file/layout change; keys the per-editor scope cache
		this._lastScopeInScope = null;  // last known scope state of the active file

		// ── Scroll / resize handlers ──────────────────────────────────────────
		this.currentScroller  = null;
		this.scrollHandler    = null;
		this.windowResizeHandler = null;

		// ── Paragraph tagger ──────────────────────────────────────────────────

		// ── Style injection ───────────────────────────────────────────────────
		this.styleEl          = null;

		// ── Word count cache ──────────────────────────────────────────────────
		this.explorerObserver = null;
		this.wordCountCache   = new Map();
		this._patchScheduled  = false;

		// ── Zen state ─────────────────────────────────────────────────────────
		this._isTogglingZen   = false;
		this._wasZenMode      = false;
		this._tabContainersCache = null;

		// ── Drag / refresh bookkeeping ────────────────────────────────────────
		this._activeDragCleanup = null;   // aborts an in-flight mask drag on unload
		this._refreshTimer      = null;   // debounced saveSettings → refresh

		// ── Live selection rAF ────────────────────────────────────────────────
		this._selectionRaf    = null;

		// ── Theme observer ────────────────────────────────────────────────────
		this._themeObserver   = null;

		await this.loadSettings();
		this._wasZenMode = this.settings.zenMode;

		// Zen mode persists across restarts, but _wasZenMode above makes
		// setSidebarVisibility() a no-op on the first refresh() — so a vault
		// relaunched in zen mode could come back with body classes applied yet
		// sidebars open. Force the sidebars into the zen state once the
		// workspace layout exists, without touching the saved pre-zen
		// leftSidebar/rightSidebar restore state.
		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.pluginEnabled || !this.settings.zenMode) return;
			const ws = this.app.workspace;
			if (ws.leftSplit  && !ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.collapse();
		});

		this.addSettingTab(new WordSmithSettingTab(this.app, this));
		this.setupBattery();

		// Commands
		this.addCommand({
			id: 'toggle-retro-bar',
			name: 'Show or hide the retro bar',
			callback: () => this.toggleSetting('retroBarHidden')
		});
		this.addCommand({
			id: 'toggle-wordsmith',
			name: 'Toggle Word-Smith on/off',
			callback: () => this.toggleFullPlugin()
		});
		// "WS" badge ribbon button — toggles the whole plugin on/off.
		// Obsidian's addRibbonIcon expects a Lucide icon name; we replace
		// the SVG it inserts with a text badge and use a class hook for
		// styling. The label doubles as the tooltip.
		this.wsRibbonEl = this.addRibbonIcon('type', 'Toggle Word-Smith on/off', () => this.toggleFullPlugin());
		this.wsRibbonEl.addClass('ws-ribbon-btn');
		this.wsRibbonEl.empty();
		this.wsRibbonEl.createSpan({ cls: 'ws-ribbon-badge', text: 'WS' });
		this.updateWsRibbonState();

		// Workspace events
		this.registerEvent(this.app.workspace.on('file-open', (file) => {
			this.syncScope();
			this.applyEditorFont();
			this.restoreCursorFor(file);
			this.updateWorkspaceAesthetics();
		}));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.flushCursorMemory();
			this.syncScope();
			this.applyEditorFont();
			this.updateWorkspaceAesthetics();
			this.scheduleExplorerPatch();
			if (this.settings.zenMode && this.settings.focusedFileMode) this.updateFocusedFileMode();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('editor-change', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('resize', () => this.scheduleMaskPosition()));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this._tabContainersCache = null;
			this._scopeGen++;
			if (this.settings.zenMode && this.settings.focusedFileMode) this.updateFocusedFileMode();
			// The explorer/outline observers are scoped to their leaf
			// containers, which layout changes can recreate — re-bind them.
			if (this.settings.pluginEnabled &&
				(this.settings.enableFileTreeCounts || this.settings.enableOutlineCounts)) {
				this.attachExplorerObserver();
				this.scheduleExplorerPatch();
			}
		}));

		// DOM events
		this.registerDomEvent(document, 'keyup', (evt) => {
			this.updateModifierState(evt);
			this.updateRetroStatusBar();
			this.typewriterScroll();
		});
		this.registerDomEvent(document, 'mouseup', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		});
		// Live selection word count. selectionchange fires only when the
		// selection actually changes (mouse drag, shift+arrows, double-click),
		// unlike the old document-wide mousemove listener that re-derived
		// word counts on every pointer frame even with no selection at all.
		this._selectionRaf = null;
		this.registerDomEvent(document, 'selectionchange', () => {
			if (this._selectionRaf) return;
			this._selectionRaf = requestAnimationFrame(() => {
				this._selectionRaf = null;
				this.updateRetroStatusBar();
			});
		});
		// Escape exits zen mode (from new zen plugin — respects vim mode and excalidraw)
		this.registerDomEvent(document, 'keydown', (evt) => {
			this.updateModifierState(evt);
			if (evt.key === 'Escape' && this.settings.zenMode) {
				const target = evt.target;
				if (target) {
					const cmEditor = target.closest('.cm-editor');
					if (cmEditor) {
						const vault = this.app.vault;
						if (vault.config && vault.config.vimMode === true) return;
					}
					if (target instanceof HTMLTextAreaElement && target.className && target.className.includes('excalidraw')) return;
				}
				const activeModal = document.querySelector('.modal');
				if (!activeModal) { this.toggleZenMode(); evt.preventDefault(); }
			}
		});

		// Track whether the note editor itself has focus. Used to gate the
		// elevated z-index (above Cursor Smith's canvas) so masks/arrows/bar
		// only float above everything while actually writing — not above the
		// command palette, settings, context menus, or other modals, which
		// take focus away from .cm-editor.
		const updateEditorFocusClass = () => {
			const active = document.activeElement;
			const inEditor = !!(active && active.closest && active.closest('.cm-editor'));
			document.body.classList.toggle('zg-editor-focused', inEditor);
		};
		this.registerDomEvent(document, 'focusin', updateEditorFocusClass);
		this.registerDomEvent(document, 'focusout', () => requestAnimationFrame(updateEditorFocusClass));
		updateEditorFocusClass();

		// Vault events
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (this.wordCountCache) this.wordCountCache.delete(file.path);
			this.scheduleExplorerPatch();
		}));
		// Cursor positions are polled rather than observed; see cursorMem().
		this.registerInterval(window.setInterval(() => this.checkCursorChanged(), 150));
		this.registerEvent(this.app.metadataCache.on('changed', (file) => {
			if (this._fmCache && file && file.path) delete this._fmCache[file.path];
			this._scopeGen++;
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (this.wordCountCache) this.wordCountCache.delete(oldPath);
			this.renameScopePath(oldPath, file.path);
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (this.wordCountCache) this.wordCountCache.delete(file.path);
			this.removeScopePath(file.path);
		}));

		// Theme observer. Guarded on pluginEnabled: disablePlugin() removes
		// body classes, which fires this very observer — without the guard
		// it would recreate the injected styles (line highlight etc.) and
		// re-stamp CSS variables immediately after they were removed.
		this._themeObserver = new MutationObserver(() => {
			if (!this.settings.pluginEnabled) return;
			this.applyCssVariables();
			this.updateStyleEl();
		});
		this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

		// CM6 decoration extensions (focus dimming + hidden markers)
		this.setupEditorExtensions();

		this.refresh();
	}

	onunload() {
		// Clean up retro bar
		this.removeCustomElements();
		this.stopClockTick();
		// Clean up style injection
		this.removeStyleEl();
		// Clean up para tagger
		// Clean up word count observer
		this.detachExplorerObserver();
		this.removeWordCounts();
		// Clean up scroll/resize handlers
		this.detachScrollHandler();
		this.detachResizeHandler();
		// Restore the native status bar (inline hide is not class-based)
		this.applyNativeStatusBarVisibility(false);
		// Clean up theme observer
		if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		// Abort an in-flight mask drag (its move/up listeners would otherwise
		// outlive the plugin)
		if (this._activeDragCleanup) this._activeDragCleanup();
		// Detach battery listeners — they hold a reference to this plugin
		// instance and would keep it alive after unload
		if (this._batteryManager && this._batteryHandler) {
			this._batteryManager.removeEventListener('levelchange',    this._batteryHandler);
			this._batteryManager.removeEventListener('chargingchange', this._batteryHandler);
			this._batteryManager = this._batteryHandler = null;
		}
		// Cancel a pending debounced refresh
		if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
		if (this._hemFlashTimer) { window.clearTimeout(this._hemFlashTimer); this._hemFlashTimer = null; }
		if (this._hemScreenTimer) { window.clearTimeout(this._hemScreenTimer); this._hemScreenTimer = null; }
		if (this._hemIconTimer) { window.clearTimeout(this._hemIconTimer); this._hemIconTimer = null; }
		if (this._hemScreenEl) { this._hemScreenEl.remove(); this._hemScreenEl = null; }
		this.closeBarPicker();
		document.querySelectorAll('.cm-editor.zg-hem-blocked')
			.forEach(el => el.classList.remove('zg-hem-blocked'));
		// Exit zen mode cleanly
		if (this.settings.zenMode) {
			this.settings.zenMode = false;
			this.applyBodyClasses();
			this.setSidebarVisibility();
		}
		this.clearAllBodyState();
		// Restore all tab containers
		document.querySelectorAll('.workspace-tabs').forEach(el => {
			el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
			el.style.display = '';
			el.style.width   = '';
			el.style.flex    = '';
		});
	}

	// ════════════════════════════════════════════════════════════════════════
	// SETTINGS: load, save, migrate
	// ════════════════════════════════════════════════════════════════════════

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Migrate old letterboxRatio
		if (this.settings.letterboxRatio != null) {
			if (this.settings.letterboxPx == null)
				this.settings.letterboxPx = this.settings.letterboxRatio * 200;
			delete this.settings.letterboxRatio;
		}
		// Migrate the old single-field retro bar format into the center slot
		// of the new left/center/right layout.
		if (this.settings.statusFormatText != null) {
			this.settings.statusFormatCenter = this.settings.statusFormatText;
			delete this.settings.statusFormatText;
		}
		// Fold the flat left/center/right keys into row 0 of the multi-row
		// model, then drop them. Done before the normalisation below so a
		// vault upgrading from either older shape lands in the same place.
		if (this.settings.statusFormatLeft   != null ||
			this.settings.statusFormatCenter != null ||
			this.settings.statusFormatRight  != null) {
			const rows = Array.isArray(this.settings.statusRows)
				? this.settings.statusRows.slice()
				: DEFAULT_SETTINGS.statusRows.map(r => Object.assign({}, r));
			const row0 = Object.assign({ left: '', center: '', right: '' }, rows[0] || {});
			if (this.settings.statusFormatLeft   != null) row0.left   = this.settings.statusFormatLeft;
			if (this.settings.statusFormatCenter != null) row0.center = this.settings.statusFormatCenter;
			if (this.settings.statusFormatRight  != null) row0.right  = this.settings.statusFormatRight;
			rows[0] = row0;
			this.settings.statusRows = rows;
			delete this.settings.statusFormatLeft;
			delete this.settings.statusFormatCenter;
			delete this.settings.statusFormatRight;
		}
		// {wpm} was removed. Scrub it from saved rows, or anyone who used it
		// is left staring at the literal text "{wpm}" in their bar forever.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right']) {
					if (typeof row[slot] === 'string' && row[slot].includes('{wpm}')) {
						row[slot] = row[slot].replace(/\s*\{wpm\}\s*(wpm)?/g, '').trim();
					}
				}
			}
		}
		delete this.settings.wpmWindowSec;
		// One symmetric padding became two, so the split starts from whatever
		// the single value was rather than snapping back to the default.
		// Settings arrive merged over DEFAULT_SETTINGS, so the two new keys are
		// never null by the time this runs — guarding on them would make the
		// whole migration a no-op. The presence of the retired key is the
		// signal, and it is enough on its own.
		if (this.settings.statusBarPadding != null) {
			const pad = this.settings.statusBarPadding;
			this.settings.statusBarPadTop    = pad;
			this.settings.statusBarPadBottom = pad;
			delete this.settings.statusBarPadding;
		}
		// The auto-hiding bar was replaced by a command.
		for (const dead of ['zenAutoHideBar', 'zenAutoHideDelay', 'zenAutoHideZone']) {
			delete this.settings[dead];
		}
		// {nump} became {num}; {toc}, {textview} and {lock} were removed — the
		// last of those because the H badge in {mode} already says the same
		// thing. Rewrite saved rows so nobody is left with literal token text.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right']) {
					if (typeof row[slot] !== 'string') continue;
					const before = row[slot];
					let v = before
						.split('{nump}').join('{num}')
						.replace(/\s*\{(toc|textview|lock)\}\s*/g, ' ')
						.replace(/[ \t]{2,}/g, ' ');
					// Only tidy the edges of a slot a token was actually
					// removed from: that slot's spacing is changing anyway, and
					// the substitution leaves a space of its own behind. Slots
					// left alone keep whatever padding was deliberately typed.
					if (v !== before) v = v.trim();
					row[slot] = v;
				}
			}
		}
		// Prose analysis (adverb / passive / hedge marking) was removed; only
		// its code-skipping preference carries over, since syntax highlight
		// wants the same answer.
		// The flash used to be a boolean that outlined the editor. Screen is
		// the closest equivalent of "on".
		if (this.settings.hemFlashOnBlock != null) {
			this.settings.hemFlashTarget = this.settings.hemFlashOnBlock ? 'screen' : 'none';
			delete this.settings.hemFlashOnBlock;
		}
		if (this.settings.proseSkipCode != null) {
			this.settings.syntaxSkipCode = !!this.settings.proseSkipCode;
		}
		for (const dead of ['proseEnabled', 'proseSkipCode', 'proseHighlightStyle',
			'proseAdverbs', 'proseAdverbColor', 'prosePassive', 'prosePassiveColor',
			'proseWeasel', 'proseWeaselColor']) {
			delete this.settings[dead];
		}
		// Always end up with exactly three well-formed row slots, whatever
		// was in data.json — hand-edited configs included.
		{
			const src = Array.isArray(this.settings.statusRows) ? this.settings.statusRows : [];
			this.settings.statusRows = [0, 1, 2].map(i =>
				Object.assign({ left: '', center: '', right: '' }, src[i] || {}));
		}
		// The old fill bar drew Unicode block characters in the interface font,
		// which is why it read as a terminal artifact. It has been replaced by
		// a drawn ring; goalBarCells is the marker that data.json predates the
		// change, so anyone who was on the block bar lands on the ring.
		// The border was a single on/off flag; width 0 is now the "off".
		// goalDisplay, goalRingPercent and goalShapeLabel collapsed into one
		// mode shared by all three goals. The block bar became a ring long
		// before that, so 'bar' resolves the same way 'ring' does: to the
		// default percentage mode.
		if (this.settings.goalShapeLabel != null || this.settings.goalRingPercent != null ||
			this.settings.goalDisplay != null) {
			if (this.settings.goalDisplay === 'fraction')     this.settings.goalLabelMode = 'fraction';
			else if (this.settings.goalShapeLabel != null)    this.settings.goalLabelMode = this.settings.goalShapeLabel;
			else if (this.settings.goalRingPercent === false) this.settings.goalLabelMode = 'none';
			delete this.settings.goalDisplay;
			delete this.settings.goalRingPercent;
			delete this.settings.goalShapeLabel;
		}
		if (this.settings.statusBarBorder != null) {
			if (!this.settings.statusBarBorder) this.settings.statusBarBorderWidth = 0;
			delete this.settings.statusBarBorder;
		}
		if (this.settings.goalBarCells != null) delete this.settings.goalBarCells;
		// The slim bar was dropped; the ring is the only indicator now.
		// goalLabel used to place text beside the indicator. The percentage
		// now lives inside the ring, so the old setting maps onto the toggle.
		if (this.settings.goalLabel != null) {
			if (this.settings.goalLabel === 'none') this.settings.goalLabelMode = 'none';
			delete this.settings.goalLabel;
		}
		// The ASCII arrow style was removed (too similar to Chevron) — carry
		// anyone still on it over to the closest replacement.
		if (this.settings.arrowStyle === 'ascii') {
			this.settings.arrowStyle = 'chevron';
		}
		// Transient UI state that older versions leaked into data.json, plus
		// settings for the removed exit button. Dropped on next save.
		delete this.settings._lastArrowCount;
		delete this.settings.exitButtonVisibility;
		delete this.settings.autoHideButtonOnDesktop;
	}

	// Persist settings. By default the full refresh() (mask/observer teardown
	// and rebuild) is debounced so a slider drag firing onChange every tick
	// doesn't rebuild the world per tick — only the trailing call applies.
	// Pass applyImmediately for state changes that must land now (zen toggle,
	// master switch).
	async saveSettings(applyImmediately = false) {
		await this.saveData(this.settings);
		if (applyImmediately) {
			if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
			this.refresh();
		} else {
			this.scheduleRefresh();
		}
	}

	scheduleRefresh() {
		if (this._refreshTimer) window.clearTimeout(this._refreshTimer);
		this._refreshTimer = window.setTimeout(() => {
			this._refreshTimer = null;
			this.refresh();
		}, 120);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Core refresh
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// APPLY: the single path from settings to the DOM
	// ════════════════════════════════════════════════════════════════════════

	refresh() {
		this.updateWsRibbonState();
		if (!this.settings.pluginEnabled) { this.disablePlugin(); this.reconfigureEditors(); return; }
		// Scope decides what the rest of this method may apply, and the list
		// may have just changed, so it is resolved first.
		this._scopeGen++;
		this._lastScopeInScope = this.isActiveFileInScope();
		this.applyBodyClasses();
		this.applyCssVariables();
		this.applyEditorFont();
		this.updateStyleEl();
		this.updateWorkspaceAesthetics();
		this.setSidebarVisibility();
		this.updateFocusedFileMode();
		this.typewriterScroll();
		// The dim/marker decorations read settings only when (re)built, so a
		// settings change needs the editors reconfigured to take effect.
		this.reconfigureEditors();
		if (this.settings.enableFileTreeCounts || this.settings.enableOutlineCounts) {
			this.attachExplorerObserver();
		} else {
			this.detachExplorerObserver();
			this.removeWordCounts();
		}
	}

	// Swaps the registered extension array's contents for freshly built
	// plugin instances, then reconfigures every open editor. Both halves are
	// required: updateOptions() alone with the same extension values is a
	// no-op (CM6 keeps the old instances), and swapping without
	// updateOptions() never reaches the editors. With the plugin disabled
	// the array is emptied, which fully removes the decorations.
	reconfigureEditors() {
		if (CM && this.editorExtensions) {
			this.editorExtensions.length = 0;
			this.editorExtensions.push(...this.buildEditorExtensions());
		}
		try { this.app.workspace.updateOptions(); } catch (_) {}
	}

	// Tear down everything without unloading the plugin
	// Everything the plugin puts on <body> or :root, in one place. onunload
	// used to keep its own shorter list, which had drifted seven classes and
	// every custom property behind this one — so disabling from Obsidian's
	// plugin page left the font override applied.
	clearAllBodyState() {
		document.body.classList.remove(
			'zenmode-active', 'zenmode-hide-properties', 'zenmode-hide-status-bar',
			'zenmode-hide-scroll-bar', 'zenmode-hide-title-bar', 'zenmode-hide-ribbon',
			'zenmode-hide-linked-mentions', 'zg-para-indent', 'zg-justify',
			'zg-masks-active', 'zg-retrobar-active', 'zg-pos-dim', 'zg-hemingway-active',
			'zg-line-limit', 'zg-editor-focused', 'zg-font-active', 'zg-rtl',
			'zg-bar-hidden', 'zg-titlebar-match'
		);
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// Custom properties are set on body and :root, not by class, so the
		// list above does not reach them.
		for (const prop of ['--zg-bg', '--zg-text', '--zg-font']) {
			document.body.style.removeProperty(prop);
		}
	}

	disablePlugin() {
		this.removeCustomElements();
		this.stopClockTick();
		this.removeStyleEl();
		this.detachExplorerObserver();
		this.removeWordCounts();
		this.detachScrollHandler();
		this.detachResizeHandler();
		this.applyNativeStatusBarVisibility(false);
		// Both caches hold a reference to a CodeMirror document; drop them so
		// a disabled plugin does not pin one.
		this._fenceCache = null;
		this._paraCache = null;
		this._docStatsCache = null;
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
		// Strip all body classes and attributes
		this.clearAllBodyState();
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// The horizontal padding rule is unscoped (applies always), so it
		// needs its own reset when the plugin itself is turned off.
		document.documentElement.style.removeProperty('--zg-editor-padding-h');
		// Restore tab containers
		document.querySelectorAll('.workspace-tabs').forEach(el => {
			el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
			el.style.display = ''; el.style.width = ''; el.style.flex = '';
		});
		// Restore sidebars
		const ws = this.app.workspace;
		if (ws.leftSplit && !ws.leftSplit.collapsed)   ws.leftSplit.expand();
		if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.expand();
		// Exit fullscreen
		if (document.fullscreenElement && document.exitFullscreen) {
			document.exitFullscreen().catch(() => {});
		}
	}

	applyBodyClasses() {
		const body = document.body;
		const zen  = this.zenActive();
		// Zen's own chrome is intentionally not scoped (see the Scope section
		// above); everything below it that touches the text is.
		const scoped = this.isActiveFileInScope();
		// The retro bar visually replaces the native status bar, so it always
		// hides it while active — independent of the separate "hide native
		// status bar in zen mode" toggle below. These used to share a single
		// setting, which meant flipping either one could silently flip the
		// other's effect (e.g. turning the retro bar on/off would overwrite
		// the zen-mode toggle's value, or vice versa).
		const hideNativeStatusBar = this.retroBarActive() || (zen && this.settings.hideStatusBar);
		body.classList.toggle('zenmode-active',             zen);
		body.classList.toggle('zenmode-hide-properties',    zen && this.settings.hideProperties);
		body.classList.toggle('zenmode-hide-status-bar',    hideNativeStatusBar);
		this.applyNativeStatusBarVisibility(hideNativeStatusBar);
		body.classList.toggle('zenmode-hide-scroll-bar',    zen && this.settings.hideScrollBar);
		body.classList.toggle('zenmode-hide-linked-mentions', zen && this.settings.hideLinkedMentions);
		body.classList.toggle('zenmode-hide-ribbon',        zen && this.settings.hideRibbon);
		body.classList.toggle('zg-para-indent',             scoped && this.settings.enableParagraphIndent);
		body.classList.toggle('zg-justify',                 scoped && this.settings.justifyText);
		body.classList.toggle('zg-line-limit',              scoped && this.settings.limitLineLength);
		body.classList.toggle('zg-rtl',                     this.isRightToLeft());
		body.classList.toggle('zg-bar-hidden', this.barIsHidden());
		body.classList.toggle('zg-titlebar-match', zen && this.settings.zenTitlebarMatch);
		body.classList.toggle('zg-masks-active',            scoped && this.letterboxActive());
		body.classList.toggle('zg-pos-dim',                 scoped && this.settings.posEnabled && this.settings.posDimOthers);
		body.classList.toggle('zg-hemingway-active',        scoped && this.settings.hemingwayEnabled);
		if (zen) {
			body.setAttribute('data-zen-hide-inline-title', String(this.settings.hideInlineTitle));
			body.setAttribute('data-zen-focused-file',      String(this.settings.focusedFileMode));
		} else {
			body.removeAttribute('data-zen-hide-inline-title');
			body.removeAttribute('data-zen-focused-file');
		}
	}

	// Hides/restores the native status bar via an inline
	// display:none!important. The class-based CSS rule alone proved
	// unreliable: themes and snippets commonly style .status-bar with
	// higher-specificity or !important rules that outrank a descendant
	// selector, which let the native bar show through the retro bar's
	// goal-met flash (whose strobe dips the retro bar's opacity). An inline
	// important declaration cannot be beaten by any stylesheet rule.
	applyNativeStatusBarVisibility(hide) {
		const nb = document.querySelector('.status-bar');
		if (!nb) return;
		if (hide) nb.style.setProperty('display', 'none', 'important');
		else nb.style.removeProperty('display');
	}

	applyCssVariables() {
		const root = document.documentElement.style;
		root.setProperty('--zg-editor-padding-h',    this.settings.editorPaddingH + 'px');
		// (z-index vars intentionally not stamped here — the stylesheet
		// defaults already provide them, and inline values on :root would
		// still lose to the elevated body.zg-masks-active values anyway.)
		root.setProperty('--zen-mode-top-padding',    this.settings.topPadding + 'px');
		root.setProperty('--zen-mode-bottom-padding', this.settings.bottomPadding + 'px');

		// Arrow size is a vw-based clamp() in styles.css so it tracks window
		// resizes with zero JS; only the user's scale multiplier is stamped.
		root.setProperty('--zg-arrow-scale',          String(this.settings.arrowScale || 1));
		root.setProperty('--zg-separator-style',      this.settings.separatorStyle);
		root.setProperty('--zg-separator-weight',     this.settings.separatorWeight + 'px');
		root.setProperty('--zg-status-bar-font-size', this.settings.statusBarFontSize + 'px');
		// Row height is what the user sets; the bar's own height is the
		// product, so mask positioning and the cm-panels-bottom offset keep
		// working unchanged against --zg-status-bar-height.
		const barRows = Math.max(1, Math.min(3, this.settings.statusBarRows || 1));
		root.setProperty('--zg-status-row-height',    this.settings.statusBarHeight + 'px');
		// Padding is added to the bar's own height rather than eating into it,
		// so the rows keep the height they were given and everything that
		// measures the bar — mask placement, the cm-panels offset — still gets
		// the true total.
		const clampPad = v => Math.max(0, Math.min(24, v != null ? v : 5));
		const padTop    = clampPad(this.settings.statusBarPadTop);
		const padBottom = clampPad(this.settings.statusBarPadBottom);
		root.setProperty('--zg-status-bar-pad-top',    padTop + 'px');
		root.setProperty('--zg-status-bar-pad-bottom', padBottom + 'px');
		root.setProperty('--zg-status-bar-height',
			(this.settings.statusBarHeight * barRows + padTop + padBottom) + 'px');
		root.setProperty('--zg-para-indent',          (this.settings.paragraphIndentEm || 2) + 'em');
		root.setProperty('--zg-mask-overhang',        (this.settings.maskOverhang || 4) + 'px');

		const isDark = document.body.classList.contains('theme-dark');
		// These two go on <body>, not <html>. Obsidian defines
		// --background-primary on body.theme-dark / body.theme-light, so
		// `var(--background-primary)` written at :root has nothing to resolve
		// against: the variable computes to invalid and the bar renders
		// transparent. On body the reference resolves normally.
		const barRoot = document.body.style;
		if (this.settings.retroCustomColors) {
			barRoot.setProperty('--zg-bg',   isDark ? this.settings.retroDarkBgColor   : this.settings.retroLightBgColor);
			barRoot.setProperty('--zg-text', isDark ? this.settings.retroDarkTextColor : this.settings.retroLightTextColor);
		} else {
			barRoot.setProperty('--zg-bg',   'var(--background-primary)');
			barRoot.setProperty('--zg-text', 'var(--text-normal)');
		}
		root.setProperty('--zg-arrow-color', isDark ? this.settings.arrowDarkColor      : this.settings.arrowLightColor);
		root.setProperty('--zg-line-color',  isDark ? this.settings.lineDarkColor       : this.settings.lineLightColor);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Injected styles
	// ─────────────────────────────────────────────────────────────────────────

	updateStyleEl() {
		if (!this.settings.pluginEnabled) { this.removeStyleEl(); return; }
		if (!this.styleEl) {
			this.styleEl = document.head.createEl('style');
			this.styleEl.id = 'zengrinder-injected';
		}
		const rules = [];
		if (this.settings.enableParagraphIndent) {
			const ind = 'var(--zg-para-indent)';
			// Source view is driven entirely by the paraPlugin decoration, so
			// these selectors never need to know what a list line looks like.
			//
			// Specificity, not !important. Leading with `body.` adds an element
			// to the count, and naming the editor chain outranks the theme
			// rules that set text-indent on .cm-line and p — while still
			// letting a user's own snippet win if they want it to.
			const srcLine = 'body.zg-para-indent .markdown-source-view.mod-cm6 .cm-content ';
			const prevAll = 'body.zg-para-indent .markdown-reading-view .markdown-preview-view ';
			if (this.settings.paragraphIndentMode === 'single') {
				rules.push(srcLine + '.zg-para-line { text-indent: ' + ind + '; }');
				rules.push(prevAll + 'p { text-indent: ' + ind + '; }');
			} else {
				rules.push(srcLine + '.zg-para-first { text-indent: ' + ind + '; }');
				rules.push(prevAll + 'p + p { text-indent: ' + ind + '; }');
			}
			// Reading view renders list items, quotes, callouts and table cells
			// as <p> too, so the rules above catch them. Rather than a fragile
			// :not() chain, indent every paragraph and then take it back from
			// the containers where it does not belong.
			// These have to outrank the rule directly above them, which they do
			// on element count alone — one more descendant each.
			rules.push([
				prevAll + 'li p',
				prevAll + 'blockquote p',
				prevAll + 'td p',
				prevAll + 'th p',
				prevAll + '.callout p',
				prevAll + 'figcaption'
			].join(',\n') + ' { text-indent: 0; }');
		}
		if (this.settings.editorFont || this.opt('editorFont')) {
			// The full chain plus the leading body class outranks the theme
			// rules that set font-family on these same elements, so this needs
			// no !important of its own.
			rules.push('body.zg-font-active .markdown-source-view.mod-cm6 .cm-content,\n' +
				'body.zg-font-active .markdown-reading-view .markdown-preview-view ' +
				'{ font-family: var(--zg-font); }');
		}
		if (this.settings.limitLineLength) {
			// ch is the width of a "0", which is the conventional stand-in for
			// a character in a proportional face. The horizontal padding is
			// added back on top so the measure is the *text* column rather
			// than the box, whatever the padding is set to.
			const measure = 'calc(' + Math.max(20, Math.min(200, this.settings.maxLineChars || 64))
				+ 'ch + (var(--zg-editor-padding-h) * 2))';
			// Zen mode sets max-width:100% on this very element in styles.css,
			// at equal specificity — which would leave the winner decided by
			// stylesheet order, and that is not guaranteed. Leading with
			// `body.` adds an element to the count and settles it.
			rules.push('body.zg-line-limit .markdown-source-view.mod-cm6 .cm-content ' +
				'{ max-width: ' + measure + '; margin-inline: auto; }');
			rules.push('body.zg-line-limit .markdown-reading-view .markdown-preview-view ' +
				'{ max-width: ' + measure + '; margin-inline: auto; }');
		}
		if (this.settings.justifyText) {
			// Justify in the source editor (skip code blocks and table cells).
			// The .cm-line selector is chained through .cm-content so it wins
			// over theme styles without !important in most cases.
			rules.push('.zg-justify .cm-content .cm-line { text-align: justify; text-align-last: left; }');
			// Reading view: paragraphs and list items.
			rules.push('.zg-justify .markdown-preview-view p, .zg-justify .markdown-preview-view li { text-align: justify; }');
		}
		if (this.settings.lineSpacing && this.settings.lineSpacing !== 1.5) {
			// A bare .cm-content selector loses to any theme rule that names a
			// parent, which is why this used to need !important. The full
			// chain wins on its own.
			const ls = String(this.settings.lineSpacing);
			rules.push('body .markdown-source-view.mod-cm6 .cm-content { line-height: ' + ls + '; }');
			rules.push('body .markdown-reading-view .markdown-preview-view { line-height: ' + ls + '; }');
		}
		if (this.settings.highlightCurrentLine) {
			const isDark = document.body.classList.contains('theme-dark');
			const hex     = isDark ? this.settings.lineHighlightDarkColor : this.settings.lineHighlightLightColor;
			const opacity = this.settings.lineHighlightOpacity != null ? this.settings.lineHighlightOpacity : 0.35;
			// Same reasoning: name the chain rather than shout over it.
			rules.push('body .markdown-source-view.mod-cm6 .cm-content .cm-active.cm-line ' +
				'{ background-color: ' + this.hexToRgba(hex, opacity) + '; }');
		}
		if (this.settings.dimUnfocusedEnabled) {
			const opacity = this.settings.dimOpacity != null ? this.settings.dimOpacity : 0.35;
			rules.push('.zg-dim-line, .zg-dim-text { opacity: ' + opacity + '; transition: opacity 0.15s ease; }');
		}
		// ── Syntax highlight + writing checks ─────────────────────────────
		if (this.settings.posEnabled || this.settings.checksEnabled) {
			// One painter for both groups. Colour is the only difference
			// between a noun and a passive phrase; how it is drawn is the
			// user's choice, and the same four options suit either job.
			const paint = (cls, color, style) => {
				switch (style) {
					case 'highlight':
						return '.' + cls + ' { background-color: ' + this.hexToRgba(color, 0.22) +
							'; border-radius: 2px; }';
					case 'squiggle':
						return '.' + cls + ' { text-decoration-line: underline; text-decoration-style: wavy;' +
							' text-decoration-color: ' + color + '; text-decoration-thickness: 1px;' +
							' text-underline-offset: 3px; text-decoration-skip-ink: none; }';
					case 'line':
						return '.' + cls + ' { text-decoration-line: underline; text-decoration-style: solid;' +
							' text-decoration-color: ' + color + '; text-decoration-thickness: 2px;' +
							' text-underline-offset: 3px; text-decoration-skip-ink: none; }';
					default:
						return '.' + cls + ' { color: ' + color + '; }';
				}
			};

			const posStyle = this.settings.syntaxStyle || 'text';
			const pos = this.settings.posEnabled ? [
				['noun', this.settings.posNoun,        this.settings.posNounColor],
				['verb', this.settings.posVerb,        this.settings.posVerbColor],
				['adj',  this.settings.posAdjective,   this.settings.posAdjectiveColor],
				['adv',  this.settings.posAdverb,      this.settings.posAdverbColor],
				['conj', this.settings.posConjunction, this.settings.posConjunctionColor]
			] : [];
			for (const entry of pos) {
				if (entry[1]) rules.push(paint('zg-pos-' + entry[0], entry[2], posStyle));
			}

			const ckStyle = this.settings.checkStyle || 'squiggle';
			const checks = this.settings.checksEnabled ? [
				['filler',   this.settings.checkFiller,   this.settings.checkFillerColor],
				['passive',  this.settings.checkPassive,  this.settings.checkPassiveColor],
				['illusion', this.settings.checkIllusion, this.settings.checkIllusionColor],
				['misused',  this.settings.checkMisused,  this.settings.checkMisusedColor],
				['pronoun',  this.settings.checkPronoun,  this.settings.checkPronounColor]
			] : [];
			checks.push(['repeat', this.settings.checkRepetition, this.settings.checkRepetitionColor]);
			for (const entry of checks) {
				if (entry[1]) rules.push(paint('zg-ck-' + entry[0], entry[2], ckStyle));
			}

			// Rhythm is forced to a background tint whatever checkStyle says.
			// A squiggle under a thirty-word sentence is noise; the point of
			// this one is seeing a wall of a single colour at a glance.
			if (this.settings.checksEnabled && this.settings.checkRhythm) {
				rules.push(paint('zg-ck-hard',     this.settings.checkRhythmHardColor,     'highlight'));
				rules.push(paint('zg-ck-veryhard', this.settings.checkRhythmVeryHardColor, 'highlight'));
			}

			// Muting everything else is what makes one class read as the
			// sentence's skeleton. The mark spans set their own colour and are
			// separate elements, so this ancestor rule never outranks them
			// however specific it is.
			if (this.settings.posEnabled && this.settings.posDimOthers) {
				rules.push('body.zg-pos-dim .markdown-source-view.mod-cm6 .cm-content .cm-line { color: var(--text-faint); }');
			}
		}

		this.styleEl.textContent = rules.join('\n');
		if (this.settings.enableParagraphIndent && this.settings.paragraphIndentMode !== 'single') {
		} else {
		}
	}

	removeStyleEl() {
		if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Paragraph tagger (double-enter indent)
	// ─────────────────────────────────────────────────────────────────────────

	// ─────────────────────────────────────────────────────────────────────────
	// Zen mode toggle (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// TOGGLES
	// ════════════════════════════════════════════════════════════════════════

	// Flip a boolean setting and apply it now (no debounce — these are
	// hotkey-driven). Pass ensurePos to also switch the master POS toggle on,
	// so "Syntax highlight: verbs" does what it says from a cold start.
	async toggleSetting(key, ensurePos) {
		this.settings[key] = !this.settings[key];
		if (ensurePos && this.settings[key]) this.settings.posEnabled = true;
		await this.saveSettings(true);
	}

	// What the Z badge does. toggleZenMode() only moves focus mode, which left
	// the badge flipping a master that had no visible effect of its own; this
	// moves both halves together and runs the same enter/exit work.
	async toggleZenFromBar() {
		if (this._isTogglingZen) return;
		this._isTogglingZen = true;
		try {
			if (!this.settings.pluginEnabled) this.settings.pluginEnabled = true;
			const entering = !this.zenActive();

			if (entering) {
				this.settings.zenEnabled = true;
				this.settings.zenMode    = true;
				if (this.settings.focusedFileMode) await this.revealPinnedTabIfExists();
				if (this.settings.fullscreen && document.documentElement.requestFullscreen) {
					try {
						await document.documentElement.requestFullscreen();
						await new Promise(r => requestAnimationFrame(r));
					} catch (_) {}
				}
			} else {
				if (document.fullscreenElement && document.exitFullscreen) {
					try {
						await document.exitFullscreen();
						await new Promise(r => requestAnimationFrame(r));
					} catch (_) {}
				}
				// The master goes down, taking the letterbox with it. zenMode
				// is left alone so the next press restores what was set up.
				this.settings.zenEnabled = false;
			}
			await this.saveSettings(true);
		} finally {
			this._isTogglingZen = false;
		}
	}

	async toggleZenMode() {
		if (this._isTogglingZen) return;
		this._isTogglingZen = true;
		try {
			// If the plugin is off, turn it on first — zen mode depends on the
			// body classes, masks, and observers that refresh()/applyBodyClasses()
			// set up, none of which run while pluginEnabled is false. Flipping
			// the flag here and letting saveSettings() → refresh() below handle
			// the wiring means the command works from either state.
			if (!this.settings.pluginEnabled) this.settings.pluginEnabled = true;
			const entering = !this.settings.zenMode;

			if (entering) {
				if (this.settings.focusedFileMode) await this.revealPinnedTabIfExists();
				if (this.settings.fullscreen && document.documentElement.requestFullscreen) {
					try {
						await document.documentElement.requestFullscreen();
						await new Promise(r => requestAnimationFrame(r));
					} catch (_) {}
				}
				this.settings.zenMode = true;
			} else {
				if (document.fullscreenElement && document.exitFullscreen) {
					try {
						await document.exitFullscreen();
						await new Promise(r => requestAnimationFrame(r));
					} catch (_) {}
				}
				this.settings.zenMode = false;
			}
			await this.saveSettings(true);
		} finally {
			this._isTogglingZen = false;
		}
	}

	async toggleFullPlugin() {
		const next = !this.settings.pluginEnabled;
		if (!next && this.settings.zenMode) {
			// Exit zen mode cleanly (fullscreen, sidebars, saved state) while
			// the plugin is still enabled — toggleZenMode() no-ops once
			// pluginEnabled is false.
			await this.toggleZenMode();
		}
		this.settings.pluginEnabled = next;
		await this.saveSettings(true); // refresh() tears everything down or re-applies it
	}

	updateWsRibbonState() {
		if (!this.wsRibbonEl) return;
		this.wsRibbonEl.classList.toggle('is-disabled', !this.settings.pluginEnabled);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Sidebar management (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// ZEN CHROME: sidebars, tabs, focused-file mode
	// ════════════════════════════════════════════════════════════════════════

	setSidebarVisibility() {
		if (this.settings.zenMode === this._wasZenMode) return;
		const ws = this.app.workspace;
		if (!ws.leftSplit || !ws.rightSplit) return;
		if (!this.settings.zenMode) {
			if (!this.settings.leftSidebar)  ws.leftSplit.expand();
			if (!this.settings.rightSidebar) ws.rightSplit.expand();
		} else {
			this.settings.rightSidebar = ws.rightSplit.collapsed;
			this.settings.leftSidebar  = ws.leftSplit.collapsed;
			if (!ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (!ws.rightSplit.collapsed) ws.rightSplit.collapse();
		}
		this._wasZenMode = this.settings.zenMode;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Focused file mode (from new zen plugin)
	// ─────────────────────────────────────────────────────────────────────────

	getTabContainerFromLeaf(leaf) {
		if (!leaf) return null;
		const el = leaf.containerEl || null;
		if (!el) return null;
		const tc = el.closest('.workspace-tabs');
		return (tc instanceof HTMLElement) ? tc : null;
	}

	async revealPinnedTabIfExists() {
		try {
			const leaves = this.app.workspace.getLeavesOfType('markdown');
			for (const leaf of leaves) {
				let pinned = leaf.pinned === true;
				if (!pinned && leaf.view && leaf.view.getState) {
					const s = leaf.view.getState();
					if (s.pinned === true) pinned = true;
				}
				if (!pinned && leaf.containerEl) {
					const th = leaf.containerEl.querySelector('.workspace-tab-header');
					if (th && (th.classList.contains('is-pinned') || th.hasAttribute('data-pinned'))) pinned = true;
				}
				if (pinned) {
					await this.app.workspace.revealLeaf(leaf);
					await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
					return;
				}
			}
		} catch (_) {}
	}

	findActiveTabContainerFromDOM() {
		const active = document.querySelector('.workspace-tab-header.is-active');
		if (active) {
			const tc = active.closest('.workspace-tabs');
			if (tc instanceof HTMLElement) return tc;
		}
		for (const c of Array.from(document.querySelectorAll('.workspace-tabs'))) {
			const el = c;
			if (el.offsetParent !== null && !el.classList.contains('zenmode-tab-hidden')) return el;
		}
		return null;
	}

	async updateFocusedFileMode() {
		if (!this.settings.zenMode || !this.settings.focusedFileMode) {
			document.querySelectorAll('.workspace-tabs').forEach(el => {
				el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
				el.style.display = ''; el.style.width = ''; el.style.flex = '';
			});
			return;
		}
		await this.revealPinnedTabIfExists();
		if (!this._tabContainersCache) {
			this._tabContainersCache = Array.from(document.querySelectorAll('.workspace-tabs'));
		}
		const all = this._tabContainersCache;
		let active = null;
		for (const c of all) {
			const pinned = c.querySelectorAll('.workspace-tab-header.is-pinned, .workspace-tab-header[data-pinned="true"]');
			if (pinned.length > 0) { active = c; break; }
		}
		if (!active) {
			const leaf = this.app.workspace.getMostRecentLeaf();
			if (leaf) active = this.getTabContainerFromLeaf(leaf);
		}
		if (!active) active = this.findActiveTabContainerFromDOM();
		if (!active) return;
		all.forEach(c => {
			if (c === active) {
				c.classList.remove('zenmode-tab-hidden');
				c.style.display = ''; c.style.width = '100%'; c.style.flex = '1 1 100%';
			} else {
				c.classList.add('zenmode-tab-hidden');
				c.style.display = 'none';
			}
		});
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Workspace aesthetics (letterbox + retro bar)
	// ─────────────────────────────────────────────────────────────────────────

	updateWorkspaceAesthetics() {
		// Event handlers (active-leaf-change etc.) call this unconditionally;
		// without this guard, opening a note rebuilds the retro bar and masks
		// even while the plugin is toggled off.
		if (!this.settings.pluginEnabled) return;
		// Retro status bar: independent of zen mode
		this.updateStatusBar();
		this.updateRetroStatusBar();

		// The paragraph tagger is scoped to the active editor's .cm-content,
		// so it needs re-binding whenever the active leaf changes.
		if (this.settings.enableParagraphIndent && this.settings.paragraphIndentMode !== 'single') {
		}
		// (Focus dimming and hidden markers are CM6 decorations registered
		// once via registerEditorExtension — they follow every editor
		// automatically and need no per-leaf re-binding here.)

		// Letterbox masks + typewriter: driven by enableTypewriter, not zenMode,
		// and only where the plugin is scoped to apply.
		const scoped = this.isActiveFileInScope();
		// Masks follow letterbox, not typewriter. They are separate features
		// and toggling one should never silently take the other with it.
		if (this.letterboxActive() && scoped) {
			this.buildMaskElements();
		} else {
			this.removeMaskElements();
		}

		// Positioning (masks AND/OR retro bar width) needs the scroll/resize
		// wiring whenever either feature is visible.
		if (((this.settings.enableTypewriter || this.letterboxActive()) && scoped) || this.retroBarActive()) {
			this.attachScrollHandler();
			this.attachResizeHandler();
			this.scheduleMaskPosition();
		} else {
			this.detachScrollHandler();
			this.detachResizeHandler();
		}
	}

	// Remove only mask/arrow elements (not the retro bar)
	removeMaskElements() {
		for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl]) {
			if (el) el.remove();
		}
		this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
		document.documentElement.style.setProperty('--zg-scroller-pad-top',    '0px');
		document.documentElement.style.setProperty('--zg-scroller-pad-bottom', '0px');
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Retro status bar
	// ─────────────────────────────────────────────────────────────────────────

	// The retro bar is one fixed element shared by every pane, so it follows
	// the active file's scope rather than any single editor's.
	// Slid out of view by command. The element stays in the DOM so the move
	// can animate; nothing else should treat it as occupying space.
	barIsHidden() {
		return !!(this.settings.retroBarHidden && this.retroBarActive());
	}

	retroBarActive() {
		return this.settings.enableRetroStatus && this.isActiveFileInScope();
	}

	updateStatusBar() {
		const wantBar = this.retroBarActive();
		if (wantBar && !this.retroStatusBarEl) {
			this.retroStatusBarEl = document.body.createEl('div', { cls: 'zengrinder-status-bar' });
			this.startClockTick();
		} else if (!wantBar && this.retroStatusBarEl) {
			this.retroStatusBarEl.remove();
			this.retroStatusBarEl = null;
			this.stopClockTick();
		}
		if (this.retroStatusBarEl) {
			const bw    = Math.max(1, Math.min(8, this.settings.statusBarBorderWidth || 2));
			const style = this.settings.statusBarBorderStyle || 'solid';
			this.retroStatusBarEl.style.borderTopWidth = style === 'none' ? '0' : bw + 'px';
			this.retroStatusBarEl.style.borderTopStyle = style;
			this.retroStatusBarEl.style.borderTopColor = 'var(--zg-text)';
		}
		// Body class lets CSS lift bottom editor panels (vim ":" command
		// line etc.) above the bar — see styles.css.
		document.body.classList.toggle('zg-retrobar-active', !!this.retroStatusBarEl);
		// Re-stamp on every call (runs on leaf changes) so a status bar
		// element created after plugin load is still caught.
		this.applyNativeStatusBarVisibility(
			wantBar || (this.settings.zenMode && this.settings.hideStatusBar));
		this.applyCssVariables();
	}

	startClockTick() {
		if (this.clockInterval) return;
		// registerInterval → Obsidian clears it automatically on unload
		this.clockInterval = this.registerInterval(window.setInterval(() => this.updateRetroStatusBar(), 15000));
	}

	stopClockTick() {
		if (this.clockInterval) { window.clearInterval(this.clockInterval); this.clockInterval = null; }
	}

	async setupBattery() {
		if (!navigator.getBattery) return;
		try {
			const bm = await navigator.getBattery();
			const update = () => {
				this.batteryLevel    = Math.round(bm.level * 100);
				this.batteryCharging = bm.charging;
				this.updateRetroStatusBar();
			};
			this._batteryManager = bm;
			this._batteryHandler = update;
			bm.addEventListener('levelchange', update);
			bm.addEventListener('chargingchange', update);
			update();
		} catch (_) {}
	}

	formatBattery() {
		if (this.batteryLevel === null) return '?%';
		return (this.batteryCharging ? '⚡︎' : '') + this.batteryLevel + '%';
	}

	// Converts a #rrggbb / #rgb hex color plus an alpha (0–1) into an
	// rgba() string, so a single color-picker + slider pair can produce a
	// translucent highlight without needing CSS color-mix() support.
	hexToRgba(hex, alpha) {
		if (!hex) return 'transparent';
		let h = hex.replace('#', '');
		if (h.length === 3) h = h.split('').map(c => c + c).join('');
		const r = parseInt(h.substring(0, 2), 16) || 0;
		const g = parseInt(h.substring(2, 4), 16) || 0;
		const b = parseInt(h.substring(4, 6), 16) || 0;
		const a = Math.max(0, Math.min(1, alpha != null ? alpha : 1));
		return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
	}

	formatDate(now) {
		const dd = String(now.getDate()).padStart(2, '0');
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const yyyy = String(now.getFullYear());
		const yy   = yyyy.slice(-2);
		return (this.settings.dateFormat || 'dd/mm/yyyy')
			.replace(/yyyy/g, yyyy).replace(/yy/g, yy).replace(/mm/g, mm).replace(/dd/g, dd);
	}

	formatTime(now) {
		return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
	}

	// ════════════════════════════════════════════════════════════════════════
	// CURSOR MEMORY
	// ════════════════════════════════════════════════════════════════════════

	// Modelled on dy-sh's Remember Cursor Position, which the reference plugin
	// also derives from. Two things make it work where an editor update
	// listener did not:
	//
	//   1. Recording is a poll, not an event. There is then no window in which
	//      Obsidian's own caret placement can be mistaken for the reader's,
	//      and no need to map an editor back to the file it is showing.
	//
	//   2. Restoring waits for currentMode.getScroll() to return a number,
	//      which is the first moment the view genuinely holds the new
	//      document. Frame counts and fixed delays are guesses; this is the
	//      actual readiness signal, and guessing is what failed twice.
	cursorMem() {
		if (!this._cursorMemory) {
			this._cursorMemory = Object.assign({}, (this.settings && this.settings.cursorMemory) || {});
		}
		return this._cursorMemory;
	}

	// Cursor plus scroll: restoring the caret without the scroll still leaves
	// you looking at the top of the note.
	captureCursorState() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return null;
		const out = {};
		if (view.editor && view.editor.getCursor) {
			const c = view.editor.getCursor();
			if (c) { out.line = c.line; out.ch = c.ch; }
		}
		try {
			if (view.currentMode && view.currentMode.getScroll) {
				const sc = view.currentMode.getScroll();
				if (sc != null) out.scroll = sc;
			}
		} catch (_) { /* preview mode may not expose it yet */ }
		return (out.line != null || out.scroll != null) ? out : null;
	}

	// Runs on an interval. Skipped entirely while a restore is in flight, and
	// while the active file is not the one we last restored — which is the
	// window where the editor still holds the outgoing document.
	checkCursorChanged() {
		if (!this.settings.restoreCursorPosition || this._cursorLoading) return;
		const file = this.app.workspace.getActiveFile();
		if (!file || !file.path || this._cursorLastFile !== file.path) return;
		const st = this.captureCursorState();
		if (!st) return;
		const prev = this.cursorMem()[file.path];
		if (prev && prev.line === st.line && prev.ch === st.ch && prev.scroll === st.scroll) return;
		this.cursorMem()[file.path] = st;
		this._cursorDirty = true;
	}

	flushCursorMemory() {
		if (!this.settings.restoreCursorPosition || !this._cursorDirty) return;
		const mem  = this.cursorMem();
		const keys = Object.keys(mem);
		// Bounded, or a long-lived vault turns data.json into a cursor log.
		if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete mem[k];
		this.settings.cursorMemory = mem;
		this._cursorDirty = false;
		this.saveSettings();
	}

	async restoreCursorFor(file) {
		if (!this.settings.restoreCursorPosition) return;
		const path = file && file.path;
		if (!path || this._cursorLastFile === path) return;

		this._cursorLoading = true;
		this._cursorLastFile = path;
		const saved = this.cursorMem()[path];
		if (saved) {
			// Poll for readiness rather than assuming a delay is enough.
			for (let i = 0; i < 25; i++) {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				let ready = false;
				try {
					ready = !!(view && view.file && view.file.path === path &&
						view.currentMode && view.currentMode.getScroll &&
						view.currentMode.getScroll() != null);
				} catch (_) { ready = false; }
				if (ready) break;
				await new Promise(r => window.setTimeout(r, 20));
			}
			this.applyCursorState(saved, path);
		}
		this._cursorLoading = false;
	}

	applyCursorState(st, path) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file || view.file.path !== path) return;
		if (st.line != null && view.editor) {
			const last = view.editor.lastLine();
			const line = Math.max(0, Math.min(st.line, last));
			const ch   = Math.max(0, Math.min(st.ch || 0, (view.editor.getLine(line) || '').length));
			view.editor.setCursor({ line, ch });
		}
		if (st.scroll != null && view.currentMode && view.currentMode.applyScroll) {
			try { view.currentMode.applyScroll(st.scroll); } catch (_) { /* not in this mode */ }
		}
	}


	// ─────────────────────────────────────────────────────────────────────────
	// Scope
	//
	// Scope gates the writing surface — masks, retro bar, text options, all
	// four editor decorations and the Hemingway lock. It deliberately does not
	// gate zen mode's workspace chrome or sidebar state: zen is a mode you
	// enter by hotkey for a session, and flinging the sidebars open every time
	// you glance at an out-of-scope note would be worse than useless. Sidebar
	// word counts stay vault-wide too — those are for navigating, not writing.
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// SCOPE: path lists + per-note frontmatter
	// ════════════════════════════════════════════════════════════════════════

	// ── Per-note overrides ───────────────────────────────────────────────────
	// Path lists handle projects; frontmatter handles this note today.
	//
	//   wordsmith: off       the plugin does nothing in this note
	//   ws-zen: true         override a mode for this note only
	//   ws-typewriter: false
	//   ws-hemingway: true
	//   ws-syntax: true
	//   ws-markers: false
	//   ws-typography: false
	//   ws-goal: 2000        word target for this note
	//
	// Cached per path and dropped whenever the metadata cache reports a
	// change, so editing the frontmatter takes effect on the next repaint.
	getOverrides(file) {
		if (!file || !file.path) return null;
		if (!this._fmCache) this._fmCache = {};
		if (Object.prototype.hasOwnProperty.call(this._fmCache, file.path)) {
			return this._fmCache[file.path];
		}
		let fm = null;
		try {
			const cache = this.app.metadataCache && this.app.metadataCache.getFileCache(file);
			fm = cache && cache.frontmatter;
		} catch (_) { fm = null; }

		let out = null;
		if (fm) {
			// YAML gives booleans for true/false but strings for on/off/yes/no,
			// and people write all of them.
			const isOff = v => v === false || /^(false|off|no)$/i.test(String(v));
			const isOn  = v => v === true  || /^(true|on|yes)$/i.test(String(v));
			const add   = (k, v) => { (out = out || {})[k] = v; };

			if ('wordsmith' in fm) add('__disabled', isOff(fm.wordsmith));
			const MAP = {
				'ws-zen':        'zenMode',
				'ws-typewriter': 'enableTypewriter',
				'ws-hemingway':  'hemingwayEnabled',
				'ws-syntax':     'posEnabled',
				'ws-markers':    'showHiddenMarkers',
				'ws-typography': 'typographyEnabled'
			};
			for (const key in MAP) {
				if (!(key in fm)) continue;
				if (isOn(fm[key]))       add(MAP[key], true);
				else if (isOff(fm[key])) add(MAP[key], false);
			}
			const goal = Number(fm['ws-goal']);
			if (!isNaN(goal) && goal > 0) add('goalTarget', Math.round(goal));
			// A font name, or an explicit empty string to fall back to the
			// theme for this one note.
			if ('ws-font' in fm) add('editorFont', String(fm['ws-font'] || '').trim());
		}
		this._fmCache[file.path] = out;
		return out;
	}

	// Effective value of a setting for a given note.
	optFor(file, key) {
		const o = this.getOverrides(file);
		if (o && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
		return this.settings[key];
	}

	// Same, for the note in the active pane.
	opt(key) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return this.optFor(view ? view.file : null, key);
	}

	// And for whichever note a given editor is showing.
	optForView(cmView, key) {
		return this.optFor(this.getFileForEditorView(cmView), key);
	}

	// Focus mode and letterbox are the two halves of Zen. Letterbox used to be
	// gated on typewriter instead, which is why turning typewriter off took
	// the masks with it — two unrelated features sharing one flag.
	zenActive() {
		return !!(this.opt('zenEnabled') && this.opt('zenMode'));
	}

	letterboxActive() {
		return !!(this.opt('zenEnabled') && this.settings.enableLetterbox);
	}

	// Obsidian keeps its right-to-left preference in appearance config, and
	// also sets it per note. Either is enough to mirror the text options.
	isRightToLeft() {
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view && view.editor && view.editor.cm && view.editor.cm.contentDOM) {
				const dir = view.editor.cm.contentDOM.getAttribute('dir');
				if (dir) return dir === 'rtl';
			}
		} catch (_) { /* editor not ready */ }
		try {
			if (this.app.vault.getConfig) return !!this.app.vault.getConfig('rightToLeft');
		} catch (_) {}
		return false;
	}

	hasScopeLimits() {
		return Array.isArray(this.settings.scopePaths) && this.settings.scopePaths.length > 0;
	}

	// True when the path is named by the list, either exactly (a note) or as
	// an ancestor (a folder). Prefix matching appends the separator so that
	// "Novel" does not also claim "Novel Ideas/draft.md".
	pathMatchesScope(path) {
		if (!path) return false;
		for (const entry of this.settings.scopePaths) {
			if (!entry) continue;
			if (entry === '/') return true;                 // vault root
			if (path === entry) return true;
			if (path.startsWith(entry.endsWith('/') ? entry : entry + '/')) return true;
		}
		return false;
	}

	isFileInScope(file) {
		// `wordsmith: off` in the frontmatter wins over any path list, and
		// `wordsmith: on` opts a note back in past an excluding one.
		const ov = this.getOverrides(file);
		if (ov && ov.__disabled === true)  return false;
		if (ov && ov.__disabled === false) return true;
		if (!this.hasScopeLimits()) return true;
		const exclude = this.settings.scopeMode === 'exclude';
		// No file at all (an empty pane, a non-markdown view): in scope only
		// when the list is naming things to leave out.
		if (!file || !file.path) return exclude;
		const hit = this.pathMatchesScope(file.path);
		return exclude ? !hit : hit;
	}

	isActiveFileInScope() {
		// No "no limits configured" shortcut here: frontmatter can disable a
		// note on its own, and the shortcut used to return true before the
		// override was ever read. getOverrides is cached, so this is cheap.
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return this.isFileInScope(view ? view.file : null);
	}

	// Which file a given CodeMirror view is showing. Needed because split
	// panes can hold one in-scope and one out-of-scope note at the same time,
	// and the decorations have to follow their own editor, not the active one.
	getFileForEditorView(cmView) {
		let found = null;
		try {
			this.app.workspace.iterateAllLeaves(leaf => {
				if (found) return;
				const v = leaf && leaf.view;
				if (v && v.editor && v.editor.cm === cmView) found = v.file || null;
			});
		} catch (_) {}
		return found;
	}

	// Memoised against a generation counter that every file/layout change
	// bumps, so the leaf walk above happens once per editor per change rather
	// than once per repaint.
	isEditorInScope(cmView) {
		if (!cmView) return true;
		// Same reasoning as isActiveFileInScope: the file has to be resolved
		// even with no path list, because its frontmatter may opt out. The
		// generation memo below keeps that to one leaf walk per editor per
		// file/layout change rather than one per repaint.
		if (cmView._zgScope && cmView._zgScope.gen === this._scopeGen) return cmView._zgScope.in;
		const val = this.isFileInScope(this.getFileForEditorView(cmView));
		cmView._zgScope = { gen: this._scopeGen, in: val };
		return val;
	}

	// Called on every leaf/file change. Cheap when no limits are configured.
	syncScope() {
		this._scopeGen++;
		if (!this.settings.pluginEnabled) return;
		const inScope = this.isActiveFileInScope();
		if (inScope === this._lastScopeInScope) return;
		this._lastScopeInScope = inScope;
		this.applyBodyClasses();
		this.reconfigureEditors();
	}

	// Keep the list pointing at real paths as notes and folders move. Without
	// this, renaming a folder silently orphans its entry and the plugin stops
	// applying somewhere the user still expects it.
	async renameScopePath(oldPath, newPath) {
		if (!this.hasScopeLimits() || !oldPath || !newPath) return;
		const list = this.settings.scopePaths;
		let changed = false;
		for (let i = 0; i < list.length; i++) {
			if (list[i] === oldPath) { list[i] = newPath; changed = true; }
			else if (list[i].startsWith(oldPath + '/')) {
				list[i] = newPath + list[i].slice(oldPath.length);
				changed = true;
			}
		}
		if (changed) await this.saveSettings(true);
	}

	async removeScopePath(path) {
		if (!this.hasScopeLimits() || !path) return;
		const list = this.settings.scopePaths;
		const next = list.filter(p => p !== path && !p.startsWith(path + '/'));
		if (next.length !== list.length) {
			this.settings.scopePaths = next;
			await this.saveSettings(true);
		}
	}

	// ════════════════════════════════════════════════════════════════════════
	// DOCUMENT ANALYSIS: counting, paragraphs, non-prose lines
	// ════════════════════════════════════════════════════════════════════════

	getFilePath(view) {
		const file = view && view.file;
		if (!file) return 'no file';
		if (this.settings.fileTokenFormat === 'name') return file.basename;
		const parts = file.path.split('/');
		return (parts.length <= 1 ? '~/' : '~/' + parts.slice(0, -1).join('/') + '/') + file.basename;
	}

	// Strip a leading YAML frontmatter block. Frontmatter inflates word
	// counts on heavily-tagged notes and makes goals inconsistent with
	// Obsidian's own counter.
	stripFrontmatter(text) {
		if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
			const m = text.match(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/);
			if (m) return text.slice(m[0].length);
		}
		return text;
	}

	// The single source of truth for every word figure in the plugin — the
	// goal ring, {readtime}, the sidebar counts and the explorer totals all
	// derive from it, so an approximation here is wrong in four places at once.
	//
	// Counted: sentence text, headings, list item text, table cells, link
	// display text, and inline code (it is usually part of the sentence).
	// Not counted: frontmatter, fenced code blocks, math, HTML tags, URLs and
	// link targets, footnote markers, comments, and markup characters.
	//
	// Both figures come out of one reduction so {words} and {chars} can never
	// end up measuring different documents.
	countProse(text) {
		// Same shape as the full return, or callers reading charsNoSpaces get
		// undefined on an empty note.
		if (!text) return { words: 0, chars: 0, charsNoSpaces: 0 };
		const lines = text.split('\n');
		const skip  = scanNonProseLines(lines);
		const kept  = [];
		for (let i = 0; i < lines.length; i++) {
			if (!skip.has(i + 1)) kept.push(maskForCounting(lines[i]));
		}
		// Comments can span lines, so they are stripped after rejoining.
		const prose = kept.join('\n').replace(/%%[\s\S]*?%%/g, ' ');

		CJK_CHAR.lastIndex = 0;
		const cjk = (prose.match(CJK_CHAR) || []).length;
		// Remove the per-character scripts before counting runs, or each
		// stretch of Han would also count once as a single "word".
		const rest = prose.replace(CJK_CHAR, ' ');
		WORDISH.lastIndex = 0;
		const runs = (rest.match(WORDISH) || []).length;

		const collapsed = prose.replace(/\s+/g, ' ').trim();
		return {
			words: cjk + runs,
			chars: collapsed.length,
			// Whitespace stripped entirely, which is the figure most word
			// processors label "characters excluding spaces".
			charsNoSpaces: collapsed.replace(/\s+/g, '').length
		};
	}

	// Everything the report shows, from one reduction. Words and chars come
	// from countProse so the report can never disagree with the status bar.
	analyzeText(text) {
		const base = this.countProse(text);
		const lines = String(text || '').split('\n');
		const skip  = scanNonProseLines(lines);
		let sentences = 0, syllables = 0, paragraphs = 0, lineCount = 0, inPara = false;
		for (let i = 0; i < lines.length; i++) {
			const raw = lines[i];
			if (skip.has(i + 1)) { inPara = false; continue; }
			if (!raw.trim()) { inPara = false; continue; }
			lineCount++;
			if (!inPara) { paragraphs++; inPara = true; }
			const masked = maskForCounting(raw);
			for (const sent of splitSentences(masked)) {
				const toks = tokenizeLine(sent.text);
				if (!toks.length) continue;
				sentences++;
				for (const t of toks) syllables += countSyllables(t.w);
			}
		}
		return {
			words:      base.words,
			chars:      base.chars,
			charsNoSpaces: base.charsNoSpaces,
			syllables,
			sentences,
			paragraphs,
			lines:      lineCount,
			// The manuscript convention: 250 words to a page.
			pages:      base.words ? Math.max(1, Math.round(base.words / 250)) : 0,
			grade:      fkGrade(base.words, sentences, syllables)
		};
	}

	countWords(text) {
		return this.countProse(text).words;
	}

	// Doc-derived stats (total word count, char count, paragraph ranges),
	// cached on the CodeMirror doc object — reference equality means the
	// cache only invalidates after actual edits, so the selection/cursor
	// paths never re-split a 50k-word note just to redraw the bar.
	getDocStats(view) {
		const editor = view.editor;
		const doc = editor && editor.cm && editor.cm.state ? editor.cm.state.doc : null;
		if (doc && this._docStatsCache && this._docStatsCache.doc === doc) {
			return this._docStatsCache;
		}
		const full      = view.getViewData();
		const prose     = this.countProse(full);
		const totalWC   = prose.words;
		// Was full.length, which counted the frontmatter that totalWC strips —
		// so {words} and {chars} described different documents.
		const charCount = prose.chars;
		// Paragraph ranges: contiguous runs of non-blank, non-heading lines.
		const lines = full.split('\n');
		const paras = [];
		let inPara = false;
		for (let i = 0; i < lines.length; i++) {
			const raw     = lines[i];
			const blank   = raw.trim() === '';
			const heading = /^\s{0,3}#{1,6}\s/.test(raw);
			if (!blank && !heading) {
				if (!inPara) { paras.push({ start: i, end: i }); inPara = true; }
				else paras[paras.length - 1].end = i;
			} else {
				inPara = false;
			}
		}
		const stats = { doc, totalWC, charCount, paras };
		if (doc) this._docStatsCache = stats; // only cache when identity is trackable
		return stats;
	}

	// Line numbers the prose analyser must not touch: YAML frontmatter, fenced
	// code (``` and ~~~), and $$ math blocks. Cached on CodeMirror doc
	// identity exactly like getDocStats, so it costs one scan per edit rather
	// than one per repaint.
	getNonProseLines(doc) {
		if (this._fenceCache && this._fenceCache.doc === doc) return this._fenceCache.set;
		// On very large notes the whole-document scan is not worth paying on
		// every keystroke. Per-line inline masking still applies, so the only
		// thing lost is multi-line fence awareness.
		const set = doc.length > 400000
			? new Set()
			: scanNonProseLines(doc.toString().split('\n'));
		this._fenceCache = { doc, set };
		return set;
	}

	// Which lines are body paragraphs, and which of those open one. Cached on
	// document identity like the fence map, and computed over the whole
	// document rather than the viewport: whether a paragraph is the *first*
	// one depends on lines that may be scrolled far out of sight.
	getParagraphLines(doc) {
		if (this._paraCache && this._paraCache.doc === doc) return this._paraCache.val;
		const body = new Set(), first = new Set();
		if (doc.length <= 400000) {
			const lines = doc.toString().split('\n');
			const skip  = scanNonProseLines(lines);
			let prevBlank = true, seenParagraph = false;
			for (let i = 0; i < lines.length; i++) {
				const n = i + 1, text = lines[i];
				// Code and frontmatter reset the run: prose directly after a
				// closing fence starts a new block.
				if (skip.has(n)) { prevBlank = true; continue; }
				if (!isParagraphLine(text)) { prevBlank = text.trim() === ''; continue; }
				body.add(n);
				// An opener only takes an indent once an earlier paragraph has
				// established the block it is being separated from — the first
				// paragraph of a note is never indented.
				if (prevBlank && seenParagraph) first.add(n);
				seenParagraph = true;
				prevBlank = false;
			}
		}
		const val = { body, first };
		this._paraCache = { doc, val };
		return val;
	}

	getParagraphInfo(view, stats) {
		if (!view || !view.editor) return '1/1';
		const paras = (stats || this.getDocStats(view)).paras;
		const total = paras.length;
		if (total === 0) return '1/1';
		const cursorLine = view.editor.getCursor('head').line;
		// The paragraph containing the cursor; on a blank line, the next one.
		let current = 0;
		for (let p = 0; p < total; p++) {
			if (cursorLine <= paras[p].end) { current = p + 1; break; }
		}
		if (!current) current = total;
		return current + '/' + total;
	}

	formatGoal(total) {
		const count  = Math.max(0, total - (this.settings.goalBaseline || 0));
		const target = this.settings.goalTarget || 1000;
		const ratio  = Math.min(count / target, 1);
		return {
			words:  count,
			target,
			ratio,
			met:    count >= target,
			text:   count.toLocaleString() + '/' + target.toLocaleString()
		};
	}

	// ════════════════════════════════════════════════════════════════════════
	// RETRO BAR: rows, modes, pickers
	// ════════════════════════════════════════════════════════════════════════

	// Normalised row list — always exactly statusBarRows entries, each with
	// left/center/right strings, regardless of what data.json holds.
	getStatusRows() {
		const n   = Math.max(1, Math.min(3, this.settings.statusBarRows || 1));
		const src = Array.isArray(this.settings.statusRows) ? this.settings.statusRows : [];
		const out = [];
		for (let i = 0; i < n; i++) {
			out.push(Object.assign({ left: '', center: '', right: '' }, src[i] || {}));
		}
		return out;
	}

	// The three modes that change how the editor behaves. Typewriter and
	// Hemingway are scope-gated because they genuinely stop applying on an
	// out-of-scope note; zen is not, because its chrome is workspace-wide.
	// An empty result is a real answer here — no modes on — not a failure.
	// All three, each with its live state. The bar shows every one of them so
	// the badges can double as switches — a mode you cannot see is a mode you
	// cannot turn back on from here.
	getAllModes() {
		const scoped = this.isActiveFileInScope();
		return [
			{ key: 'tw',  letter: 'T', label: 'Typewriter mode', setting: 'enableTypewriter',
			  on: !!this.opt('enableTypewriter') && scoped },
			{ key: 'hem', letter: 'H', label: 'Hemingway mode',  setting: 'hemingwayEnabled',
			  on: !!this.opt('hemingwayEnabled') && scoped },
			// Reports whether zen is actually on, not merely permitted. The
			// master alone is not zen: with focus mode off it lights the
			// letterbox and nothing else.
			{ key: 'zen', letter: 'Z', label: 'Zen',             setting: 'zenEnabled',
			  action: () => this.toggleZenFromBar(), on: this.zenActive() }
		];
	}

	getActiveModes() {
		return this.getAllModes().filter(m => m.on);
	}

	getModeLabel() {
		return this.getActiveModes().map(m => m.letter).join('');
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Bar pickers
	//
	// Obsidian's Menu cannot show a colour swatch beside a label or fade a row
	// that is switched off, and both are the whole point here — the syntax
	// picker has to be a legend as well as a control. So this is a small
	// popup of our own: rows of { dot, label }, anchored above the bar.
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// BAR PICKERS: the shared popup
	// ════════════════════════════════════════════════════════════════════════

	// items: [{ label, on, color?, icon?, onClick }]
	// mode 'toggle' keeps the popup open so several classes can be flipped in
	// one visit; 'choose' closes on the first pick, which is what a
	// three-way view switch wants.
	openBarPicker(anchorEl, items, mode) {
		this.closeBarPicker();
		const pop = document.createElement('div');
		pop.className = 'zg-picker';

		for (const item of items) {
			const row = document.createElement('div');
			// Sub-options indent under the master switch at the foot of the
			// list, so the popup reads as a group rather than a flat pile.
			row.className = 'zg-picker-row' + (item.on ? '' : ' is-off') + (item.sub ? ' is-sub' : '');

			// Only colour-bearing rows get a swatch. A hollow ring beside
			// "Spaces" said nothing except that a circle could have gone
			// there; without one the whole popup collapses to labels.
			if (item.color) {
				const dot = document.createElement('span');
				dot.className = 'zg-picker-dot';
				dot.style.backgroundColor = item.color;
				row.appendChild(dot);
			}

			const label = document.createElement('span');
			label.className = 'zg-picker-label';
			label.textContent = item.label;
			// A font list that does not show the fonts is a list of words.
			if (item.font) label.style.fontFamily = item.font;
			row.appendChild(label);

			// mousedown, not click. The bar rebuilds itself on edits, on the
			// clock tick and on scroll; if a rebuild lands between mousedown
			// and mouseup, the browser fires `click` on the nearest common
			// ancestor instead of the element, and the handler never runs.
			// That is why these buttons felt dead — the listener was correct
			// and simply never reached.
			row.addEventListener('mousedown', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				await item.onClick();
				if (mode === 'choose') this.closeBarPicker();
				else this.refreshBarPicker(pop);
			});
			pop.appendChild(row);
		}

		document.body.appendChild(pop);
		this._barPicker = pop;

		// Anchored to the token, flipped up, and nudged back inside the
		// viewport if the token sits near an edge.
		const a = anchorEl.getBoundingClientRect();
		const r = pop.getBoundingClientRect();
		let left = a.left + (a.width / 2) - (r.width / 2);
		left = Math.max(6, Math.min(left, window.innerWidth - r.width - 6));
		pop.style.left   = left + 'px';
		pop.style.bottom = (window.innerHeight - a.top + 6) + 'px';

		// Dismissal tests containment rather than relying on stopPropagation,
		// so a stray listener elsewhere cannot leave the popup stuck open.
		this._barPickerDismiss = (e) => {
			if (pop.contains && e && e.target && pop.contains(e.target)) return;
			this.closeBarPicker();
		};
		window.setTimeout(() => {
			document.addEventListener('mousedown', this._barPickerDismiss, true);
			document.addEventListener('keydown', this._barPickerKey);
		}, 0);
	}

	// Rebuild the rows in place. Re-opening the popup instead would move it
	// out from under the pointer between two clicks.
	refreshBarPicker(pop) {
		const live = pop._live;
		if (!live) return;
		const rows = pop.children;
		for (let i = 0; i < live.length && i < rows.length; i++) {
			rows[i].classList.toggle('is-off', !live[i].on());
		}
	}

	closeBarPicker() {
		if (this._barPickerDismiss) {
			document.removeEventListener('mousedown', this._barPickerDismiss, true);
			document.removeEventListener('keydown', this._barPickerKey);
			this._barPickerDismiss = null;
		}
		if (this._barPicker) { this._barPicker.remove(); this._barPicker = null; }
	}

	// A button in the bar: label or icon, click opens a picker.
	buildBarButton(cls, render, title, onClick) {
		const el = document.createElement('span');
		el.className = 'zg-barbtn is-clickable ' + cls;
		render(el);
		el.title = title;
		// mousedown for the same reason as the picker rows: a bar repaint
		// between press and release swallows `click` entirely.
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			onClick(el, e);
		});
		return el;
	}

	// ── Folder goals + report ────────────────────────────────────────────────

	// The folder a note lives in, '/' for the vault root.
	activeFolderPath() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file = view && view.file;
		if (!file || !file.path) return null;
		const i = file.path.lastIndexOf('/');
		return i < 0 ? '/' : file.path.slice(0, i);
	}

	// Frontmatter wins, so a note can carry its own target without touching
	// settings. The click-to-set modal writes to fileGoals.
	fileGoalFor(path) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view && view.file && view.file.path === path) {
			const ov = this.getOverrides(view.file);
			if (ov && ov.goalTarget) return ov.goalTarget;
		}
		const goals = this.settings.fileGoals || {};
		return Number(goals[path]) || 0;
	}

	folderGoalFor(path) {
		const goals = this.settings.folderGoals || {};
		return Number(goals[path]) || 0;
	}

	filesInFolder(path, recursive) {
		const all = this.app.vault.getMarkdownFiles ? this.app.vault.getMarkdownFiles() : [];
		if (path === '/') return recursive ? all : all.filter(f => f.path.indexOf('/') < 0);
		const prefix = path + '/';
		return all.filter(f => {
			if (!f.path.startsWith(prefix)) return false;
			return recursive || f.path.slice(prefix.length).indexOf('/') < 0;
		});
	}

	// Reads every note in the folder and below it. Cached on mtime in the same
	// map the explorer counts use, so an unchanged folder is free to re-open.
	async analyzeFolder(path) {
		// Lazily, because this is reachable from a bar token that can paint
		// before onload has finished initialising fields on a slow vault.
		if (!this.wordCountCache) this.wordCountCache = new Map();
		const files = this.filesInFolder(path, true);
		const total = { words: 0, chars: 0, charsNoSpaces: 0, syllables: 0, sentences: 0,
			paragraphs: 0, lines: 0, files: files.length };
		for (const file of files) {
			let stats = null;
			const hit = this.wordCountCache.get('stats:' + file.path);
			if (hit && hit.mtime === file.stat.mtime) stats = hit.stats;
			if (!stats) {
				try {
					const text = await this.app.vault.cachedRead(file);
					stats = this.analyzeText(text);
					this.wordCountCache.set('stats:' + file.path, { mtime: file.stat.mtime, stats });
				} catch (_) { continue; }
			}
			total.words      += stats.words;
			total.chars      += stats.chars;
			total.charsNoSpaces += stats.charsNoSpaces || 0;
			total.syllables  += stats.syllables;
			total.sentences  += stats.sentences;
			total.paragraphs += stats.paragraphs;
			total.lines      += stats.lines || 0;
		}
		total.pages = total.words ? Math.max(1, Math.round(total.words / 250)) : 0;
		total.grade = fkGrade(total.words, total.sentences, total.syllables);
		return total;
	}

	// A gauge that fills from one end: bottom-up when vertical, left-to-right
	// when horizontal. The fill is a plain rect whose far edge moves, exact at
	// every ratio where a stroked arc had rounding error.
	//
	// The viewBox grows with the thickness and, horizontally, with the length,
	// so the element's aspect ratio always matches the bar: cap one dimension
	// in CSS and the other follows without distorting anything inside.
	buildGoalBar(ratio, met, length, label) {
		const NS   = 'http://www.w3.org/2000/svg';
		const W    = Math.max(1, Math.min(16, this.settings.goalRingWeight || 12));
		const vert = (this.settings.goalOrientation || 'vertical') === 'vertical';
		const LONG = vert ? 24 : Math.max(30, Math.min(220, length || 90));
		const r    = Math.min(Math.max(ratio, 0), 1);
		const pad  = 1;
		const span = LONG - pad * 2;

		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-goal-bar is-' + (vert ? 'vertical' : 'horizontal'));
		svg.setAttribute('viewBox', vert ? '0 0 ' + (W + 2) + ' ' + LONG
		                                 : '0 0 ' + LONG + ' ' + (W + 2));
		svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
		svg.setAttribute('aria-hidden', 'true');

		const rect = (cls, x, y, w, h) => {
			const el = document.createElementNS(NS, 'rect');
			el.setAttribute('class', cls);
			el.setAttribute('x', String(x));
			el.setAttribute('y', String(y));
			el.setAttribute('width',  String(w));
			el.setAttribute('height', String(h));
			return el;
		};

		svg.appendChild(vert ? rect('zg-goal-bar-track', 1, pad, W, span)
		                     : rect('zg-goal-bar-track', pad, 1, span, W));

		if (r > 0) {
			const filled = span * r;
			// Vertical grows upward, horizontal rightward: in both cases the
			// far edge moves and the near edge stays put.
			svg.appendChild(vert
				? rect('zg-goal-bar-fill', 1, pad + span - filled, W, filled)
				: rect('zg-goal-bar-fill', pad, 1, filled, W));
		}

		// A horizontal bar has room along its length, so the label goes in it.
		// Vertical does not, and its label stays outside.
		if (!vert && label) {
			const t = document.createElementNS(NS, 'text');
			t.setAttribute('class', 'zg-goal-bar-label');
			t.setAttribute('x', String(LONG / 2));
			t.setAttribute('y', String(1 + W / 2));
			t.setAttribute('text-anchor', 'middle');
			t.setAttribute('dominant-baseline', 'central');
			t.setAttribute('font-size', String(Math.max(4, W * 0.62)));
			t.textContent = label;
			svg.appendChild(t);
		}
		return svg;
	}

	// Ten seconds of pixel fireworks over the report.
	//
	// The layer goes on the report body, not the gauge: the gauge band is
	// eighty pixels tall, so anchoring there crushed every burst into a strip
	// across the middle. The body is emptied on each render, so the layer
	// still dies with the tab that earned it — which was the point of moving
	// it off the modal in the first place.
	//
	// Three kinds, because one shape repeated reads as a loop: bursts throw
	// sparks radially, fountains spray upward, rockets climb before breaking.
	// Each spark is two nested elements — the outer carries its vector, the
	// inner carries gravity and the fade — because a second transform on one
	// element overwrites the first, and gravity is what stops it looking like
	// starburst clipart.
	celebrate(host) {
		if (!host || !host.createDiv) return;
		try {
			if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		} catch (_) { /* no matchMedia in this shell */ }

		const layer = host.createDiv({ cls: 'zg-fireworks' });
		const HUES  = [48, 12, 140, 200, 320, 275, 95, 175, 30, 260];
		const rand  = (a, b) => a + Math.random() * (b - a);
		const BURSTS = 28, JETS = 10, ROCKETS = 12;

		const spark = (parent, kind, angle, dist, hue, delay, px, life) => {
			const vec = parent.createDiv({ cls: 'zg-firework-vec is-' + kind });
			vec.style.setProperty('--a', angle + 'deg');
			vec.style.setProperty('--d', dist + 'px');
			vec.style.animationDelay    = delay + 's';
			vec.style.animationDuration = life + 's';
			const p = vec.createDiv({ cls: 'zg-firework-spark' });
			p.style.width  = px + 'px';
			p.style.height = px + 'px';
			p.style.background = 'hsl(' + (hue + rand(-14, 14)) + ', 95%, ' + rand(56, 84) + '%)';
			p.style.animationDelay    = delay + 's';
			p.style.animationDuration = life + 's';
		};

		// ── Bursts: full rings, spread across the whole panel ─────────────
		for (let b = 0; b < BURSTS; b++) {
			const burst = layer.createDiv({ cls: 'zg-firework' });
			burst.style.left = rand(6, 94) + '%';
			burst.style.top  = rand(8, 88) + '%';
			const hue = HUES[Math.floor(Math.random() * HUES.length)];
			const n = Math.floor(rand(14, 26)), reach = rand(22, 52);
			// Spread deterministically across the run and jitter within the
			// slot. Purely random delays clustered, so the tail went quiet.
			const delay = (b / BURSTS) * 8.6 + rand(0, 0.4);
			const px = Math.floor(rand(2, 5)), spin = rand(0, 360);
			for (let i = 0; i < n; i++) {
				spark(burst, 'fly', spin + (360 / n) * i,
					reach * rand(0.5, 1), hue, delay, px, rand(1.4, 2.2));
			}
		}

		// ── Fountains: narrow upward sprays along the foot ────────────────
		for (let f = 0; f < JETS; f++) {
			const jet = layer.createDiv({ cls: 'zg-firework' });
			jet.style.left = rand(6, 94) + '%';
			jet.style.bottom = '2%';
			const hue = HUES[Math.floor(Math.random() * HUES.length)];
			const delay = (f / JETS) * 8.2 + rand(0, 0.4);
			for (let i = 0; i < 24; i++) {
				spark(jet, 'jet', rand(165, 195),
					rand(50, 120), hue, delay + i * 0.045, Math.floor(rand(2, 4)), rand(1.6, 2.4));
			}
		}

		// ── Rockets: climb, then break where the climb ends ───────────────
		for (let r = 0; r < ROCKETS; r++) {
			const rocket = layer.createDiv({ cls: 'zg-firework' });
			rocket.style.left = rand(6, 94) + '%';
			rocket.style.bottom = '2%';
			const hue = HUES[Math.floor(Math.random() * HUES.length)];
			const delay = 0.4 + (r / ROCKETS) * 8.2 + rand(0, 0.3);
			const rise = rand(60, 130);
			spark(rocket, 'rocket', 180, rise, hue, delay, 3, 1.1);
			const head = rocket.createDiv({ cls: 'zg-firework zg-firework-head' });
			head.style.setProperty('--rise', rise + 'px');
			head.style.animationDelay = delay + 's';
			for (let i = 0; i < 18; i++) {
				spark(head, 'fly', (360 / 18) * i, rand(16, 38), hue,
					delay + 1.0, Math.floor(rand(2, 4)), rand(1.2, 1.8));
			}
		}

		window.setTimeout(() => { if (layer.remove) layer.remove(); }, 10400);
	}

	// The report's gauge: a ring with the number inside and a stroke that
	// warms from red through amber to green as it fills. The colour is the
	// point — a ring at 30% and one at 90% should not look alike.
	buildGoalCircle(ratio) {
		const NS = 'http://www.w3.org/2000/svg';
		const W  = 3.4;
		const R  = 12 - W / 2 - 0.5;
		const C  = 2 * Math.PI * R;
		const r  = Math.min(Math.max(ratio, 0), 1);
		const pct = Math.round(r * 100);

		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-goal-circle');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');
		// hue 0 is red, 140 is green; everything between is the ramp.
		svg.style.color = 'hsl(' + Math.round(r * 140) + ', 68%, 47%)';

		const g = document.createElementNS(NS, 'g');
		g.setAttribute('transform', 'rotate(-90 12 12)');
		for (const cls of ['zg-goal-circle-track', 'zg-goal-circle-fill']) {
			const c = document.createElementNS(NS, 'circle');
			c.setAttribute('class', cls);
			c.setAttribute('cx', '12'); c.setAttribute('cy', '12');
			c.setAttribute('r', String(R));
			c.setAttribute('stroke-width', String(W));
			if (cls === 'zg-goal-circle-fill') {
				c.setAttribute('stroke-dasharray', String(C));
				c.setAttribute('stroke-dashoffset', String(C * (1 - r)));
				if (r <= 0) c.setAttribute('visibility', 'hidden');
			}
			g.appendChild(c);
		}
		svg.appendChild(g);

		const t = document.createElementNS(NS, 'text');
		t.setAttribute('class', 'zg-goal-circle-pct');
		t.setAttribute('x', '12'); t.setAttribute('y', '12');
		t.setAttribute('text-anchor', 'middle');
		t.setAttribute('dominant-baseline', 'central');
		t.setAttribute('font-size', pct >= 100 ? '6.4' : '7.6');
		t.textContent = pct + '%';
		svg.appendChild(t);
		return svg;
	}

	// Shared by all three goals. They differ only in their colour, their
	// numbers, their length, and what the click opens.
	buildSubGoal(kind, path, words, target, noun) {
		const COLORS = { writing: 'goalColor',      file: 'fileGoalColor',  folder: 'folderGoalColor' };
		const LENS   = { writing: 'goalLenWriting', file: 'goalLenFile',    folder: 'goalLenFolder'   };
		const s = this.settings;
		const wrap = document.createElement('span');
		wrap.className = 'zg-goal zg-goal-' + kind + ' is-clickable';
		// currentColor drives track, fill and label together. Left unset, the
		// gauge inherits the bar's own text colour — which is what "no
		// colours" means here: not grey, just not special.
		if (s.goalCustomColors) wrap.style.color = s[COLORS[kind]] || 'currentColor';

		const vert   = (s.goalOrientation || 'vertical') === 'vertical';
		const length = s[LENS[kind]] || 90;
		const gauge  = s.goalShowGauge !== false;

		if (!path || !target) {
			wrap.classList.add('is-off');
			if (gauge) wrap.appendChild(this.buildGoalBar(0, false, length, null));
			else wrap.appendChild(this.makeGoalLabel('\u2014'));
			wrap.title = !path ? 'No ' + noun + ' \u2014 open a note first'
			                   : 'No ' + noun + ' set \u2014 click to set one, or edit them all '
			                     + 'under Settings \u2192 Word-Smith \u2192 Misc';
			return wrap;
		}

		const ratio = Math.min(words / target, 1);
		const met   = words >= target;
		if (met) wrap.classList.add('is-met');

		const mode = s.goalLabelMode || 'percent';
		const text = mode === 'none' ? null
			: mode === 'fraction' ? words.toLocaleString() + '/' + target.toLocaleString()
			: Math.round(ratio * 100) + '%';

		if (!gauge) {
			// Label only: no bar at all, just the number.
			if (text) wrap.appendChild(this.makeGoalLabel(text));
		} else if (!vert) {
			// Horizontal has room along its length, so the label rides inside.
			wrap.appendChild(this.buildGoalBar(ratio, met, length, text));
		} else {
			wrap.appendChild(this.buildGoalBar(ratio, met, length, null));
			if (text) wrap.appendChild(this.makeGoalLabel(text));
		}

		wrap.title = noun + ' \u2014 ' + words.toLocaleString() + '/' + target.toLocaleString()
			+ ' words \u2014 click to change';
		return wrap;
	}

	makeGoalLabel(text) {
		const el = document.createElement('span');
		el.className = 'zg-goal-text';
		el.textContent = text;
		return el;
	}

	buildFileGoalIndicator() {
		const view   = this.app.workspace.getActiveViewOfType(MarkdownView);
		const path   = view && view.file ? view.file.path : null;
		const target = path ? this.fileGoalFor(path) : 0;
		const words  = this._zgLastTotalWordCount || 0;
		const el = this.buildSubGoal('file', path, words, target, 'note goal');
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (path) this.openGoalModal('file', path);
		});
		return el;
	}

	buildFolderGoalIndicator() {
		const path   = this.activeFolderPath();
		const target = path ? this.folderGoalFor(path) : 0;
		const words  = this._folderWordCache && this._folderWordCache.path === path
			? this._folderWordCache.words : 0;
		const el = this.buildSubGoal('folder', path, words, target, 'folder goal');
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (path) this.openGoalModal('folder', path);
		});
		// Refresh the total in the background so the next repaint is current.
		if (path && target) this.refreshFolderWords(path);
		return el;
	}

	async refreshFolderWords(path) {
		if (this._folderWordBusy) return;
		this._folderWordBusy = true;
		try {
			const stats = await this.analyzeFolder(path);
			const prev  = this._folderWordCache;
			this._folderWordCache = { path, words: stats.words };
			if (!prev || prev.path !== path || prev.words !== stats.words) this.updateRetroStatusBar();
		} catch (_) {
		} finally { this._folderWordBusy = false; }
	}

	// One modal for all three. The writing goal additionally offers to rebase,
	// which is the only thing that used to require a click on the token.
	openGoalModal(kind, path) {
		if (!Modal) return;
		const plugin = this;
		const modal  = new Modal(this.app);
		const titles = {
			writing: 'Writing goal',
			file:    'Word goal for ' + path,
			folder:  'Word goal for ' + (path === '/' ? 'the vault root' : path)
		};
		modal.titleEl.setText(titles[kind] || 'Word goal');
		const body = modal.contentEl;
		const notes = {
			writing: 'Counts words written since the goal was last rebased, across every note.',
			file:    'Counts the words in this note. Set 0 to remove the goal.',
			folder:  'Counts every note in this folder and below it. Set 0 to remove the goal.'
		};
		body.createEl('p', { text: notes[kind], cls: 'ws-settings-note' });

		const current = kind === 'writing' ? plugin.settings.goalTarget
			: kind === 'file' ? plugin.fileGoalFor(path) : plugin.folderGoalFor(path);
		let value = String(current || '');
		new Setting(body).setName('Target').addText(t => {
			t.inputEl.type = 'number';
			t.inputEl.min = '0';
			t.setValue(value).onChange(v => { value = v; });
		});

		if (kind === 'writing') {
			new Setting(body).setName('Baseline')
				.setDesc('Start counting again from the current total.')
				.addButton(b => b.setButtonText('Reset').onClick(async () => {
					plugin.settings.goalBaseline = plugin._zgLastTotalWordCount || 0;
					plugin._goalWasMet = false;
					await plugin.saveSettings(true);
					modal.close();
				}));
		}

		new Setting(body).addButton(b => b.setButtonText('Save').setCta().onClick(async () => {
			const n = Math.max(0, Math.round(Number(value) || 0));
			if (kind === 'writing') {
				plugin.settings.goalTarget = n;
			} else {
				const store = kind === 'folder' ? 'folderGoals' : 'fileGoals';
				if (!plugin.settings[store]) plugin.settings[store] = {};
				if (n) plugin.settings[store][path] = n;
				else   delete plugin.settings[store][path];
				if (kind === 'folder') plugin._folderWordCache = null;
			}
			await plugin.saveSettings(true);
			modal.close();
		}));
		modal.open();
	}

	buildReportIndicator() {
		return this.buildBarButton('zg-barbtn-report',
			(node) => { node.textContent = 'Report'; },
			'Text analysis \u2014 click for the full report',
			() => this.openReportModal());
	}

	// A centred report rather than a bar popup: eight figures and a gauge,
	// twice over, is more than a strip above the status bar can hold legibly.
	openReportModal() {
		if (!Modal) return;
		const plugin = this;
		const modal  = new Modal(this.app);
		modal.titleEl.setText('Writing Report');
		modal.modalEl.addClass('zg-report-modal');

		const view       = this.app.workspace.getActiveViewOfType(MarkdownView);
		const file       = view && view.file ? view.file : null;
		const folderPath = this.activeFolderPath();
		const baseName   = file ? file.path.split('/').pop() : 'Current note';
		const folderName = folderPath && folderPath !== '/'
			? folderPath.split('/').pop() : 'Vault root';

		const nav  = modal.contentEl.createDiv({ cls: 'ws-tab-nav zg-report-nav' });
		const body = modal.contentEl.createDiv({ cls: 'zg-report-body' });

		const TABS = [
			{ id: 'note',   label: baseName   },
			{ id: 'folder', label: folderName }
		];
		let active = 'note';

		const render = async () => {
			nav.empty();
			for (const tab of TABS) {
				const btn = nav.createEl('button', {
					cls: 'ws-tab-btn' + (tab.id === active ? ' is-active' : ''),
					text: tab.label
				});
				btn.addEventListener('click', () => { active = tab.id; render(); });
			}
			body.empty();
			body.createDiv({ cls: 'zg-report-loading', text: 'Reading\u2026' });

			let stats = null, target = 0, scope = '';
			if (active === 'note') {
				if (!file) { body.empty(); body.createDiv({ text: 'No note open.' }); return; }
				let text = '';
				try { text = await plugin.app.vault.cachedRead(file); } catch (_) {}
				stats  = plugin.analyzeText(text);
				// The file's own goal, not the vault-wide writing goal — those
				// are different numbers and showing one under the other's name
				// made the ring meaningless.
				target = plugin.fileGoalFor(file.path);
				scope  = file.path;
			} else {
				if (!folderPath) { body.empty(); body.createDiv({ text: 'No folder.' }); return; }
				stats  = await plugin.analyzeFolder(folderPath);
				target = plugin.folderGoalFor(folderPath);
				scope  = (folderPath === '/' ? 'Vault root' : folderPath)
					+ ' \u2014 ' + stats.files + ' note' + (stats.files === 1 ? '' : 's');
			}

			// A tab switch mid-read must not paint stale numbers.
			body.empty();
			body.createDiv({ cls: 'zg-report-scope', text: scope });
			body.createEl('hr', { cls: 'zg-report-rule' });

			const ringWrap = body.createDiv({ cls: 'zg-report-ring' });
			if (target > 0) {
				const ratio = Math.min(stats.words / target, 1);
				const holder = ringWrap.createSpan({ cls: 'zg-goal' + (stats.words >= target ? ' is-met' : '') });
				holder.appendChild(plugin.buildGoalCircle(ratio));
				// Crossing the line in the report is the one place worth
				// making a fuss about, so it gets a fuss.
				// Over the whole report, not just the gauge — see celebrate().
				if (stats.words >= target) plugin.celebrate(body);
			} else {
				const none = ringWrap.createDiv({ cls: 'zg-report-ring-label is-muted' });
				none.createDiv({
					text: active === 'note' ? 'No word goal set for this note.'
						: 'No word goal set for this folder.'
				});
				none.createDiv({
					cls: 'zg-report-hint',
					text: 'Add one under Settings \u2192 Word-Smith \u2192 Misc, or by clicking the '
						+ (active === 'note' ? '{filegoal}' : '{foldergoal}') + ' token in the bar.'
				});
			}

			const grid = body.createDiv({ cls: 'zg-report-grid' });
			// Each figure carries its own explanation on hover, rather than a
			// block of footnotes below competing with the numbers for height.
			const cell = (label, value, tip) => {
				const c = grid.createDiv({ cls: 'zg-report-cell' + (tip ? ' has-tip' : '') });
				if (tip) c.setAttribute('title', tip);
				c.createDiv({ cls: 'zg-report-value', text: value });
				c.createDiv({ cls: 'zg-report-label', text: label });
			};
			// The fraction lives in the Words cell rather than beside the
			// gauge: it is a word count, and that is where a reader looks.
			cell(target > 0 ? 'of ' + target.toLocaleString() + ' words' : 'Words',
				stats.words.toLocaleString(),
				'Prose only. Frontmatter, code blocks, math and link targets are not counted. '
				+ 'Chinese and Japanese count per character; Korean counts by word.');
			cell('Characters', stats.chars.toLocaleString(),
				'Including spaces. Same exclusions as the word count.');
			cell('No spaces',  (stats.charsNoSpaces || 0).toLocaleString(),
				'Characters with all whitespace stripped \u2014 the figure most word processors '
				+ 'call "characters excluding spaces".');
			cell('Syllables',  stats.syllables.toLocaleString(),
				'Counted heuristically \u2014 a handful of unusual words will be off, which the '
				+ 'grade averages out.');
			cell('Sentences',  stats.sentences.toLocaleString(),
				'Split on full stops, question marks and exclamation marks.');
			cell('Paragraphs', stats.paragraphs.toLocaleString(),
				'Blocks of prose separated by a blank line. Lists, headings and code do not count.');
			cell('Lines',      (stats.lines || 0).toLocaleString(),
				'Non-empty lines of prose, as written \u2014 not as wrapped on screen.');
			cell('Pages',      (stats.pages || 0).toLocaleString(),
				'At 250 words to a page, the manuscript convention.');
			cell('Read time',  plugin.formatReadTime(stats.words),
				'At ' + (plugin.settings.readTimeWpm || 200) + ' words a minute, set under '
				+ 'Retro Bar \u2192 Token formats.');
			cell('Grade',      stats.sentences ? stats.grade.toFixed(1) : '\u2014',
				'Flesch\u2013Kincaid: roughly the years of schooling needed to read this '
				+ 'comfortably. Under 9 reads easily.');

		};
		render();
		modal.open();
	}

	// The fonts the user added under Appearance \u2192 Text font, not every font
	// installed on the machine. Obsidian keeps that list in appearance.json and
	// exposes it through vault.getConfig; the computed --font-text is the
	// fallback, and needs the generic stack filtered back out of it.
	getConfiguredFonts() {
		let raw = '';
		try {
			if (this.app.vault.getConfig) {
				const cfg = this.app.vault.getConfig('textFontFamily');
				raw = Array.isArray(cfg) ? cfg.join(',') : (cfg || '');
			}
		} catch (_) { raw = ''; }
		if (!raw) {
			try { raw = getComputedStyle(document.body).getPropertyValue('--font-text') || ''; }
			catch (_) { raw = ''; }
		}
		// Everything Obsidian appends as a fallback, plus the CSS generics.
		const GENERIC = new Set(['inherit', 'initial', 'unset', 'sans-serif', 'serif',
			'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif',
			'ui-monospace', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto',
			'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
			'Helvetica', 'Arial', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol']);
		const seen = new Set();
		const out  = [];
		for (const part of String(raw).split(',')) {
			const name = part.trim().replace(/^["']|["']$/g, '');
			if (!name || GENERIC.has(name) || seen.has(name)) continue;
			seen.add(name);
			out.push(name);
		}
		return out;
	}

	// Stamped separately from the rest of applyCssVariables because the value
	// can change per note, and so has to be re-applied on every file switch
	// rather than only on a settings change.
	applyEditorFont() {
		const font = this.settings.pluginEnabled && this.isActiveFileInScope()
			? (this.opt('editorFont') || '')
			: '';
		if (font) document.body.style.setProperty('--zg-font', font);
		else      document.body.style.removeProperty('--zg-font');
		document.body.classList.toggle('zg-font-active', !!font);
	}

	buildFontIndicator() {
		const current = this.opt('editorFont') || '';
		const el = this.buildBarButton(
			'zg-barbtn-font' + (current ? '' : ' is-off'),
			(node) => {
				node.textContent = 'Aa';
				// The button previews the choice too.
				if (current) node.style.fontFamily = current;
			},
			current ? 'Font: ' + current + ' \u2014 click to change' : 'Font \u2014 click to choose',
			(anchor) => this.openFontPicker(anchor)
		);
		return el;
	}

	openFontPicker(anchor) {
		const fonts   = this.getConfiguredFonts();
		const current = () => this.opt('editorFont') || '';
		const items = [{
			label: 'Theme default',
			on: () => !current(),
			onClick: async () => {
				this.settings.editorFont = '';
				await this.saveSettings(true);
				this.applyEditorFont();
			}
		}];
		for (const name of fonts) {
			items.push({
				label: name,
				font: name,
				on: () => current() === name,
				onClick: async () => {
					this.settings.editorFont = name;
					await this.saveSettings(true);
					this.applyEditorFont();
				}
			});
		}
		if (fonts.length === 0) {
			items.push({
				label: 'No fonts added yet',
				on: () => false,
				onClick: async () => {}
			});
		}
		this.openPickerLive(anchor, items, 'choose');
	}

	// The five syntax-highlight classes, in the order they appear everywhere
	// else. The settings keys keep their pos* names: renaming them would force
	// a migration on every existing vault, and nobody reads data.json.
	getSyntaxCategories() {
		return [
			{ key: 'posNoun',        color: 'posNounColor',        label: 'Nouns'        },
			{ key: 'posVerb',        color: 'posVerbColor',        label: 'Verbs'        },
			{ key: 'posAdjective',   color: 'posAdjectiveColor',   label: 'Adjectives'   },
			{ key: 'posAdverb',      color: 'posAdverbColor',      label: 'Adverbs'      },
			{ key: 'posConjunction', color: 'posConjunctionColor', label: 'Conjunctions' }
		];
	}

	// Reads "Syntax" in the bar; the colours live in the picker, where each
	// class sits beside its own swatch and fades when it is off.
	buildSyntaxIndicator() {
		const s = this.settings;
		const active = s.posEnabled ? this.getSyntaxCategories().filter(c => s[c.key]) : [];
		const title = active.length
			? 'Syntax highlight: ' + active.map(c => c.label.toLowerCase()).join(', ')
			: 'Syntax highlight is off';
		const el = this.buildBarButton(
			'zg-barbtn-syntax' + (active.length ? '' : ' is-off'),
			(node) => { node.textContent = 'Syntax'; },
			title,
			(anchor) => this.openSyntaxPicker(anchor)
		);
		return el;
	}

	openSyntaxPicker(anchor) {
		const s = this.settings;
		const items = this.getSyntaxCategories().map(c => ({
			label: c.label,
			color: s[c.color],
			on: () => !!(s.posEnabled && s[c.key]),
			onClick: async () => {
				s[c.key] = !s[c.key];
				// Ticking a class from the bar plainly means "show me this",
				// so it switches the feature on rather than changing a setting
				// with no visible effect.
				if (s[c.key]) s.posEnabled = true;
				// Turning the last one off turns the feature off with it,
				// rather than leaving it running over nothing.
				else if (!this.getSyntaxCategories().some(x => s[x.key])) s.posEnabled = false;
				await this.saveSettings(true);
			}
		}));
		// Master switch last, so the list reads as "these classes… and the
		// whole thing" rather than burying the classes under a header.
		items.push({
			label: 'Syntax highlight',
			on: () => !!s.posEnabled,
			onClick: async () => {
				s.posEnabled = !s.posEnabled;
				// Switching it on with nothing selected would highlight
				// nothing at all, so hand back the default class.
				if (s.posEnabled && !this.getSyntaxCategories().some(c => s[c.key])) s.posNoun = true;
				await this.saveSettings(true);
			}
		});
		this.openPickerLive(anchor, items, 'toggle');
	}

	// Both lock indicators are the key legend on two lines, unboxed. The
	// drawn key caps read as buttons you could press, which they are not —
	// plain stacked text says "this is on" without implying an action.
	buildKeyGlyph(top, bottom, title) {
		const wrap = document.createElement('span');
		wrap.className = 'zg-keycap';
		wrap.title = title;
		for (const text of [top, bottom]) {
			const row = document.createElement('span');
			row.className = 'zg-keycap-row';
			row.textContent = text;
			wrap.appendChild(row);
		}
		return wrap;
	}

	buildCapsIndicator() {
		return this.buildKeyGlyph('Caps', 'Lock', 'Caps Lock is on');
	}

	buildNumIndicator() {
		return this.buildKeyGlyph('Num', 'Lock', 'Num Lock is on');
	}

	// The writing checks get their own token, so the syntax picker can stay
	// one line about them rather than seven.
	getWriteChecks() {
		return [
			{ key: 'checkFiller',     color: 'checkFillerColor',     label: 'Filler words'      },
			{ key: 'checkPassive',    color: 'checkPassiveColor',    label: 'Passive voice'     },
			{ key: 'checkIllusion',   color: 'checkIllusionColor',   label: 'Lexical illusions' },
			{ key: 'checkMisused',    color: 'checkMisusedColor',    label: 'Commonly misused'  },
			{ key: 'checkPronoun',    color: 'checkPronounColor',    label: 'Loose pronouns'    },
			{ key: 'checkRhythm',     color: 'checkRhythmHardColor', label: 'Sentence rhythm'   },
			{ key: 'checkRepetition', color: 'checkRepetitionColor', label: 'Repetition radar'  }
		];
	}

	buildWriteChecksIndicator() {
		const s = this.settings;
		const active = s.checksEnabled ? this.getWriteChecks().filter(c => s[c.key]) : [];
		return this.buildBarButton(
			'zg-barbtn-writechecks' + (active.length ? '' : ' is-off'),
			(node) => { node.textContent = 'WriteChecks'; },
			active.length ? 'Writing checks: ' + active.map(c => c.label.toLowerCase()).join(', ')
				: 'Writing checks are off',
			(anchor) => this.openWriteChecksPicker(anchor)
		);
	}

	openWriteChecksPicker(anchor) {
		const s = this.settings;
		const items = this.getWriteChecks().map(c => ({
			label: c.label,
			color: s[c.color],
			on:    () => !!(s.checksEnabled && s[c.key]),
			onClick: async () => {
				s[c.key] = !s[c.key];
				if (s[c.key]) s.checksEnabled = true;
				else if (!this.getWriteChecks().some(x => s[x.key])) s.checksEnabled = false;
				await this.saveSettings(true);
			}
		}));
		items.push({
			label: 'Write checks',
			on: () => !!s.checksEnabled,
			onClick: async () => {
				s.checksEnabled = !s.checksEnabled;
				// Switching it on with nothing selected would mark nothing at
				// all, so hand back a default.
				if (s.checksEnabled && !this.getWriteChecks().some(c => s[c.key])) s.checkFiller = true;
				await this.saveSettings(true);
			}
		});
		this.openPickerLive(anchor, items, 'toggle');
	}

	// ¶ in the bar; the picker toggles which invisibles are drawn.
	buildMarkersIndicator() {
		const s = this.settings;
		const any = s.showHiddenMarkers &&
			(s.markSpaces || s.markTabs || s.markParagraphs || s.markEndOfLines);
		return this.buildBarButton(
			'zg-barbtn-markers' + (any ? '' : ' is-off'),
			(node) => { node.textContent = '\u00b6'; },
			any ? 'Hidden markers \u2014 click to change' : 'Hidden markers are off',
			(anchor) => this.openMarkersPicker(anchor)
		);
	}

	openMarkersPicker(anchor) {
		const s = this.settings;
		const defs = [
			{ key: 'markSpaces',     label: 'Spaces \u00b7'    },
			{ key: 'markTabs',       label: 'Tabs \u2192'      },
			{ key: 'markParagraphs', label: 'Paragraphs \u00b6' },
			{ key: 'markEndOfLines', label: 'Line ends \u21b5' }
		];
		const items = defs.map(d => ({
			label: d.label,
			sub:   true,
			on: () => !!(s.showHiddenMarkers && s[d.key]),
			onClick: async () => {
				s[d.key] = !s[d.key];
				if (s[d.key]) s.showHiddenMarkers = true;
				else if (!defs.some(x => s[x.key])) s.showHiddenMarkers = false;
				await this.saveSettings(true);
			}
		}));
		this.openPickerLive(anchor, items, 'toggle');
	}

	// Small wrapper so pickers can pass live getters rather than a snapshot.
	openPickerLive(anchor, items, mode) {
		// Copy the whole item and overwrite only `on`, rather than listing the
		// fields by hand — the hand-written version silently dropped `font`
		// the moment a picker started using it.
		const snapshot = items.map(i => Object.assign({}, i, { on: i.on() }));
		this.openBarPicker(anchor, snapshot, mode);
		if (this._barPicker) this._barPicker._live = items;
	}

	// Drawn rather than set in type. Centring a capital with flexbox centres
	// its line box, not the letter: capitals sit on the baseline with
	// descender space beneath, so they read high, and the nudge that used to
	// correct it was a guess that also pushed the T off-centre between its
	// rules.
	//
	// One 24x24 viewBox for all three puts every letter at exactly (12,12)
	// and every shape on the same centre, so they cannot drift apart.
	buildModeGlyph(kind, letter) {
		const NS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-mode-glyph is-' + kind);
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('aria-hidden', 'true');

		const el = (tag, attrs) => {
			const n = document.createElementNS(NS, tag);
			for (const k in attrs) n.setAttribute(k, String(attrs[k]));
			svg.appendChild(n);
			return n;
		};

		if (kind === 'zen') {
			el('circle', { class: 'zg-mode-shape', cx: 12, cy: 12, r: 10.4 });
		} else if (kind === 'hem') {
			el('rect', { class: 'zg-mode-shape', x: 1.6, y: 1.6,
				width: 20.8, height: 20.8, rx: 3.4 });
		} else {
			// Rules above and below, symmetric about the centre line, so the
			// T sits exactly between them.
			el('line', { class: 'zg-mode-shape', x1: 1.2, y1: 2.6, x2: 22.8, y2: 2.6 });
			el('line', { class: 'zg-mode-shape', x1: 1.2, y1: 21.4, x2: 22.8, y2: 21.4 });
		}

		const t = el('text', {
			class: 'zg-mode-letter',
			x: 12, y: 12,
			'text-anchor': 'middle',
			'dominant-baseline': 'central',
			'font-size': 13.5
		});
		t.textContent = letter;
		return svg;
	}

	buildModeIndicator() {
		const wrap = document.createElement('span');
		wrap.className = 'zg-mode';
		for (const mode of this.getAllModes()) {
			const badge = document.createElement('span');
			badge.className = 'zg-mode-badge is-clickable is-' + mode.key + (mode.on ? '' : ' is-off');
			badge.appendChild(this.buildModeGlyph(mode.key, mode.letter));
			badge.title = mode.label + (mode.on ? ' \u2014 click to turn off' : ' \u2014 click to turn on');
			// mousedown, like every other control in the bar: a repaint
			// between press and release swallows click entirely.
			badge.addEventListener('mousedown', async (e) => {
				e.preventDefault();
				e.stopPropagation();
				// Zen needs more than a flag flip — fullscreen, the pinned
				// tab, the sidebars — so it carries its own action.
				if (mode.action) await mode.action();
				else await this.toggleSetting(mode.setting);
			});
			wrap.appendChild(badge);
		}
		return wrap;
	}

	// ════════════════════════════════════════════════════════════════════════
	// BAR RENDERING: tokens to DOM
	// ════════════════════════════════════════════════════════════════════════

	formatReadTime(words) {
		const wpm = Math.max(50, this.settings.readTimeWpm || 200);
		if (!words) return '0 min';
		const mins = words / wpm;
		if (mins < 1) return '<1 min';
		const m = Math.round(mins);
		if (m < 60) return m + ' min';
		return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
	}

	// Reads CapsLock/NumLock state off a keyboard event and refreshes the
	// retro bar when either changes. Not every keyboard event supports
	// getModifierState (and NumLock has no meaning on keyboards/OSes without
	// a physical numpad concept, e.g. most Mac laptops), so this fails quiet.
	updateModifierState(evt) {
		if (!evt || typeof evt.getModifierState !== 'function') return;
		let changed = false;
		try {
			const caps = evt.getModifierState('CapsLock');
			if (caps !== this._capsLockOn) { this._capsLockOn = caps; changed = true; }
		} catch (_) { /* getModifierState with an unsupported key name can throw */ }
		try {
			const num = evt.getModifierState('NumLock');
			if (num !== this._numLockOn) { this._numLockOn = num; changed = true; }
		} catch (_) {}
		if (changed) this.updateRetroStatusBar();
	}

	// Best-effort Vim mode label for {vim}. Obsidian's Vim mode is backed by
	// @replit/codemirror-vim, which exposes its state on a CM5-compatible
	// facade at editor.cm.cm — not officially documented, but it's the same
	// access pattern community Vim-status plugins rely on. Falls back to ''
	// (token renders empty) any time the shape isn't what's expected, e.g.
	// Vim mode is off, or a future Obsidian version changes internals.
	getVimModeLabel() {
		try {
			const vault = this.app.vault;
			if (!vault.config || vault.config.vimMode !== true) return '';

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const cm6  = view && view.editor && view.editor.cm;
			const cm5  = cm6 && cm6.cm;
			const vim  = cm5 && cm5.state && cm5.state.vim;
			if (!vim) return '';

			// Replace mode (R) is represented as insert mode with the CM5
			// facade's overwrite flag set — vim.replaceMode alone is not
			// reliable across versions, which is why REPLACE never showed.
			if (vim.insertMode) {
				return (cm5.state.overwrite || vim.replaceMode) ? '-- REPLACE --' : '-- INSERT --';
			}
			if (vim.replaceMode) return '-- REPLACE --';
			if (vim.visualMode) {
				if (vim.visualBlock) return '-- VISUAL BLOCK --';
				if (vim.visualLine)  return '-- VISUAL LINE --';
				return '-- VISUAL --';
			}
			switch (vim.mode) {
				case 'insert':  return '-- INSERT --';
				case 'replace': return '-- REPLACE --';
				case 'visual':  return '-- VISUAL --';
			}
			// The ex command-line (":") prompt doesn't flip `mode` in every
			// version of the vim layer, so also check for its dialog in the DOM.
			if (document.querySelector('.cm-vim-panel, .CodeMirror-dialog')) return '-- COMMAND --';
			return '-- NORMAL --';
		} catch (_) {
			return '';
		}
	}

	updateRetroStatusBar() {
		if (!this.retroStatusBarEl) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const now  = new Date();
		let stats = null, totalWC = 0, charCount = 0, displayWC = 0, displayCC = 0;

		if (view) {
			stats     = this.getDocStats(view);
			totalWC   = stats.totalWC;
			charCount = stats.charCount;
			const editor = view.editor;
			const sel = editor ? editor.getSelection() : '';
			if (sel && sel.trim().length > 0) {
				const selProse = this.countProse(sel);
				displayWC = selProse.words;
				displayCC = selProse.chars;
			} else {
				displayWC = totalWC;
				displayCC = charCount;
			}
		}

		const goal = this.formatGoal(totalWC);
		const subs = {
			'{file}':      this.getFilePath(view),
			'{words}':     displayWC,
			'{chars}':     displayCC,
			'{time}':      this.formatTime(now),
			'{date}':      this.formatDate(now),
			'{battery}':   this.formatBattery(),
			'{paragraph}': this.getParagraphInfo(view, stats),
			'{caps}':      this._capsLockOn ? '\x00CAPS\x00' : '',
			'{num}':       this._numLockOn  ? '\x00NUM\x00'  : '',
			'{vim}':       this.getVimModeLabel(),
			'{mode}':      '\x00MODE\x00',
			'{syntax}':    '\x00SYNTAX\x00',
			'{markers}':   '\x00MARKERS\x00',
			'{writechecks}': '\x00WRITECHECKS\x00',
			'{font}':      '\x00FONT\x00',
			'{foldergoal}': '\x00FOLDERGOAL\x00',
			'{filegoal}':  '\x00FILEGOAL\x00',
			'{report}':    '\x00REPORT\x00',
			'{readtime}':  this.formatReadTime(totalWC),
			'{goal}':      '\x00GOAL\x00'
		};

		const rows   = this.getStatusRows();
		const allFmt = rows.map(r => r.left + r.center + r.right).join('');
		const hasGoal = allFmt.includes('{goal}');

		// Click-to-reset now lives on the {goal} element itself (see
		// buildGoalIndicator). It used to be a mousedown on the entire bar,
		// which meant any stray click near the bottom edge — including the
		// start of a drag — silently reset the baseline.
		this.retroStatusBarEl.style.cursor = '';
		this.retroStatusBarEl.title        = '';

		this._goalWasMet = hasGoal ? goal.met : null;

		this._zgLastTotalWordCount = totalWC;

		this.retroStatusBarEl.empty();
		this._statusRowEls = [];
		for (const row of rows) {
			const rowEl = this.retroStatusBarEl.createDiv({ cls: 'zg-status-row' });
			rowEl.createSpan({ cls: 'zg-status-section zg-status-left' })
				.appendChild(this.renderStatusSection(row.left, subs, goal));
			rowEl.createSpan({ cls: 'zg-status-section zg-status-center' })
				.appendChild(this.renderStatusSection(row.center, subs, goal));
			rowEl.createSpan({ cls: 'zg-status-section zg-status-right' })
				.appendChild(this.renderStatusSection(row.right, subs, goal));
			this._statusRowEls.push(rowEl);
		}
		this.retroStatusBarEl.classList.toggle('zg-status-multirow', rows.length > 1);

		// Flash the bar when goal is met (if enabled)
		this.retroStatusBarEl.classList.toggle('zg-goal-met', goal.met);

		// Shrink font size if the content overflows the bar's current width
		// (e.g. when a sidebar is open and the note pane narrows).
		this.fitStatusBarText();
	}

	// Turns one of the three format strings (left/center/right) into a DOM
	// fragment, substituting tokens and swapping in the live goal-bar element
	// where {goal} appeared (rather than plain text, when the bar display
	// style is chosen).
	renderStatusSection(formatStr, subs, goal) {
		const frag = document.createDocumentFragment();
		if (!formatStr) return frag;

		let out = formatStr;
		// Guarded on the brace so a future non-token entry on this object
		// cannot be substituted into the format string by accident.
		for (const token in subs) {
			if (token.charAt(0) !== '{') continue;
			out = out.split(token).join(String(subs[token]));
		}

		// Tokens that render as elements rather than text are substituted as
		// sentinels above and spliced back in as real nodes here. Splitting on
		// one combined pattern, rather than handling a single token, is what
		// makes repeats work: the previous version took parts[0] and parts[1]
		// only, so a second {goal} in the same slot silently swallowed
		// everything after it.
		const builders = {
			GOAL:     () => this.buildGoalIndicator(goal),
			MODE:     () => this.buildModeIndicator(),
			SYNTAX:   () => this.buildSyntaxIndicator(),
			MARKERS:  () => this.buildMarkersIndicator(),
			WRITECHECKS: () => this.buildWriteChecksIndicator(),
			FONT:     () => this.buildFontIndicator(),
			FOLDERGOAL: () => this.buildFolderGoalIndicator(),
			FILEGOAL: () => this.buildFileGoalIndicator(),
			REPORT:   () => this.buildReportIndicator(),
			CAPS:     () => this.buildCapsIndicator(),
			NUM:      () => this.buildNumIndicator()
		};
		// \x00 cannot appear in a note or a format string, so the split is
		// unambiguous. Odd indices are the captured sentinel names.
		const parts = out.split(/\x00(GOAL|FOLDERGOAL|FILEGOAL|MODE|SYNTAX|MARKERS|WRITECHECKS|FONT|REPORT|CAPS|NUM)\x00/);
		for (let i = 0; i < parts.length; i++) {
			const chunk = parts[i];
			if (!chunk) continue;
			if (i % 2 === 1) {
				if (builders[chunk]) frag.appendChild(builders[chunk]());
			} else {
				frag.appendChild(document.createTextNode(chunk));
			}
		}
		return frag;
	}

	// Reduce the retro bar's font size until the text fits its current width,
	// never going above the user's configured size. Resets to the configured
	// size first so it grows back when the bar has room again (sidebar closed).
	fitStatusBarText() {
		const el = this.retroStatusBarEl;
		if (!el) return;
		const baseSize = this.settings.statusBarFontSize || 13;
		// Resetting font-size forces a reflow; skip the whole measure when
		// nothing that affects fit has changed since the last call.
		// With several rows the widest one decides the size for all of them —
		// per-row font sizes would make the bar look ragged.
		const rowEls = (this._statusRowEls && this._statusRowEls.length) ? this._statusRowEls : [el];
		const text   = el.textContent;
		const width  = el.clientWidth;
		if (this._lastFit && this._lastFit.text === text && this._lastFit.width === width &&
			this._lastFit.base === baseSize && this._lastFit.rows === rowEls.length) return;
		this._lastFit = { text, width, base: baseSize, rows: rowEls.length };

		const overflows = () => rowEls.some(r => r.scrollWidth > r.clientWidth);
		el.style.fontSize = baseSize + 'px';
		if (!overflows()) return;

		const minSize = Math.max(7, Math.floor(baseSize * 0.5));
		let size = baseSize;
		while (overflows() && size > minSize) {
			size -= 1;
			el.style.fontSize = size + 'px';
		}
	}


	// ════════════════════════════════════════════════════════════════════════
	// GOAL INDICATOR
	// ════════════════════════════════════════════════════════════════════════

	// All three goals go through buildSubGoal: same shape code, same label
	// rules, same click. Only the outline and the numbers differ.
	buildGoalIndicator(goal) {
		const el = this.buildSubGoal('writing', 'writing goal',
			goal.words, goal.target, 'writing goal');
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.openGoalModal('writing', null);
		});
		return el;
	}




	// ─────────────────────────────────────────────────────────────────────────
	// Letterbox mask system
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// LETTERBOX MASKS + TYPEWRITER SCROLL
	// ════════════════════════════════════════════════════════════════════════

	buildMaskElements() {
		for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl]) {
			if (el) el.remove();
		}
		this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }

		if (!this.letterboxActive()) return;
		if (!this.app.workspace.getActiveViewOfType(MarkdownView)) return;

		this.maskTopEl    = document.body.createEl('div', { cls: 'zengrinder-mask zengrinder-mask-top' });
		this.maskBottomEl = document.body.createEl('div', { cls: 'zengrinder-mask zengrinder-mask-bottom' });

		const chars = this.getArrowChars();
		this.arrowsTopEl    = this.buildArrowLayer('top',    chars.top);
		this.arrowsBottomEl = this.buildArrowLayer('bottom', chars.bottom);

		const scroller = this.getActiveScroller();
		if (scroller && 'ResizeObserver' in window) {
			this.maskResizeObserver = new ResizeObserver(() => this.scheduleMaskPosition());
			this.maskResizeObserver.observe(scroller);
		}
		this.updateMaskVisibility();
	}

	stampMaskPositions() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) { this._maskRaf = null; return; }

		const scroller = view.contentEl.querySelector('.cm-scroller')
			|| view.contentEl.querySelector('.markdown-preview-view')
			|| view.contentEl;
		const sr = scroller.getBoundingClientRect();

		let statusH = 0;
		// An auto-hidden bar occupies no space: the mask has to reach the
		// window frame, not stop short at a bar that is not there. It rises
		// over the mask on hover, which is the right way round.
		if (this.barIsHidden()) {
			statusH = 0;
		} else if (this.settings.enableRetroStatus && this.retroStatusBarEl) {
			statusH = this.retroStatusBarEl.getBoundingClientRect().height || this.settings.statusBarHeight || 30;
		} else {
			const nb = document.querySelector('.status-bar');
			if (nb && getComputedStyle(nb).display !== 'none') statusH = nb.getBoundingClientRect().height || 0;
		}

		// Use the scroller's actual top — it already sits below whatever chrome is visible.
		// Do NOT clamp to an arbitrary drag-bar height; that was pushing the mask down.
		const sTop    = Math.max(0, sr.top);
		const sLeft   = Math.max(0, sr.left);
		const sWidth  = sr.width;
		// visualViewport.height is the honest bottom edge on mobile when the
		// on-screen keyboard is open; innerHeight ignores it.
		const vpH     = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
		const sBottom = vpH - statusH;
		const sHeight = Math.max(0, sBottom - sTop);

		let maskH = this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26;
		maskH = Math.min(maskH, Math.floor(sHeight * 0.45));
		maskH = Math.max(maskH, 34);

		const padH      = this.settings.maskPaddingH || 0;
		const arrowLeft = sLeft + padH;
		const arrowW    = Math.max(0, sWidth - padH * 2);
		const arrowH    = maskH;
		const overhang  = this.settings.maskOverhang != null ? this.settings.maskOverhang : 4;

		const S = (el, styles) => { if (el) Object.assign(el.style, styles); };
		S(this.maskTopEl,    { left: sLeft+'px', width: sWidth+'px', top: sTop+'px', height: (arrowH+overhang)+'px', bottom:'' });
		S(this.arrowsTopEl,  { left: arrowLeft+'px', width: arrowW+'px', top: sTop+'px', height: arrowH+'px', bottom:'' });
		S(this.maskBottomEl, { left: sLeft+'px', width: sWidth+'px', top: (sBottom-arrowH-overhang)+'px', height: (arrowH+overhang)+'px', bottom:'' });
		S(this.arrowsBottomEl, { left: arrowLeft+'px', width: arrowW+'px', top: (sBottom-arrowH)+'px', height: arrowH+'px', bottom:'' });

		// Retro status bar: match the note pane's width, not the full window —
		// keeps it clear of open sidebars instead of spanning edge to edge.
		S(this.retroStatusBarEl, { left: sLeft+'px', width: sWidth+'px' });
		this.fitStatusBarText();

		// Outside zen mode there's no big 50vh scroller padding to push the
		// first/last lines clear of the masks, so a brand-new or short note
		// starts hidden behind the top mask. Give the scroller just enough
		// top/bottom breathing room to clear the mask height, independent of
		// zen mode — zen mode's own 50vh padding (see styles.css) already
		// covers this and is left untouched.
		const scrollPad = this.letterboxActive() ? Math.round(arrowH + overhang + 24) : 0;
		document.documentElement.style.setProperty('--zg-scroller-pad-top',    scrollPad + 'px');
		document.documentElement.style.setProperty('--zg-scroller-pad-bottom', scrollPad + 'px');

		this._maskRaf = null;
	}

	scheduleMaskPosition() {
		if (this._maskRaf) return;
		this._maskRaf = requestAnimationFrame(() => this.stampMaskPositions());
	}

	buildArrowLayer(position, char) {
		const wrap   = document.body.createEl('div', { cls: 'zengrinder-arrows-wrap zengrinder-arrows-wrap-' + position + ' is-visible' });
		const line   = wrap.createEl('div', { cls: 'zengrinder-arrow-line' });
		const arrows = wrap.createEl('div', { cls: 'zengrinder-arrows' });
		// End caps are the first and last members of the arrow row, not
		// separate elements on the line. Two earlier attempts put them there —
		// the border drew straight through them, and once that was fixed they
		// still sat on a different baseline at a different line-height. As
		// siblings of the other arrows they inherit every one of those things
		// and cannot fall out of line.
		const caps = !!this.settings.arrowLineEnds;
		if (caps) {
			arrows.classList.add('has-caps');
			arrows.createEl('span', { cls: 'zengrinder-arrow-cap', text: char });
		}
		for (let i = 0; i < this.settings.arrowCount; i++) arrows.createEl('span', { text: char });
		if (caps) arrows.createEl('span', { cls: 'zengrinder-arrow-cap', text: char });
		if (position === 'top') wrap.insertBefore(arrows, line);

		// Pointer events (with capture) instead of mouse events: identical on
		// desktop, and tablet/mobile dragging works for free.
		line.style.cursor        = 'ns-resize';
		line.style.pointerEvents = 'auto';
		line.addEventListener('pointerdown', e => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault(); e.stopPropagation();
			this._startVerticalDrag(e, position, line);
		});

		arrows.style.cursor        = 'ew-resize';
		arrows.style.pointerEvents = 'auto';
		arrows.addEventListener('pointerdown', e => {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			e.preventDefault(); e.stopPropagation();
			this._startHorizontalDrag(e, arrows);
		});
		return wrap;
	}

	// Shared pointer-drag plumbing. setPointerCapture routes all move/up
	// events to the grabbed element, so no document-level listeners are
	// needed — and _activeDragCleanup lets onunload abort a drag that's
	// still in flight instead of leaking its listeners.
	_startPointerDrag(e, el, cursor, onMove) {
		if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (_) {} }
		document.body.style.cursor = cursor; document.body.style.userSelect = 'none';
		const finish = (save) => {
			el.removeEventListener('pointermove',   onMove);
			el.removeEventListener('pointerup',     onUp);
			el.removeEventListener('pointercancel', onCancel);
			if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
				try { el.releasePointerCapture(e.pointerId); } catch (_) {}
			}
			document.body.style.cursor = ''; document.body.style.userSelect = '';
			this._activeDragCleanup = null;
			if (save) this.saveSettings();
		};
		const onUp     = () => finish(true);
		const onCancel = () => finish(false);
		el.addEventListener('pointermove',   onMove);
		el.addEventListener('pointerup',     onUp);
		el.addEventListener('pointercancel', onCancel);
		this._activeDragCleanup = () => finish(false);
	}

	_startVerticalDrag(e, position, el) {
		const startY = e.clientY;
		const startH = (this.maskTopEl ? parseFloat(this.maskTopEl.style.height) : null)
			|| (this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26);
		this._startPointerDrag(e, el, 'ns-resize', me => {
			const dy = me.clientY - startY;
			this.settings.letterboxPx = Math.max(0, startH + dy * (position === 'top' ? 1 : -1));
			this.scheduleMaskPosition();
		});
	}

	_startHorizontalDrag(e, el) {
		const startX   = e.clientX;
		const startPad = this.settings.maskPaddingH || 0;
		const cx       = window.innerWidth / 2;
		this._startPointerDrag(e, el, 'ew-resize', me => {
			const dx = me.clientX - startX;
			this.settings.maskPaddingH = Math.max(0, Math.min(Math.round(cx) - 20, Math.round(startPad + dx * (startX < cx ? 1 : -1))));
			this.scheduleMaskPosition();
		});
	}

	getArrowChars() {
		if (this.settings.arrowStyle === 'custom') {
			return { top: this.settings.customArrowTop || '^', bottom: this.settings.customArrowBottom || 'v' };
		}
		return ARROW_STYLES[this.settings.arrowStyle] || ARROW_STYLES['solid-triangle'];
	}

	removeCustomElements() {
		// Tear down retro bar
		if (this.retroStatusBarEl) { this.retroStatusBarEl.remove(); this.retroStatusBarEl = null; }
		this._statusRowEls = [];
		document.body.classList.remove('zg-retrobar-active');
		this.stopClockTick();
		// Tear down masks
		this.removeMaskElements();
	}

	getActiveScroller() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return null;
		return view.contentEl.querySelector('.cm-scroller') || view.contentEl.querySelector('.markdown-preview-view') || null;
	}

	attachScrollHandler() {
		this.detachScrollHandler();
		const scroller = this.getActiveScroller();
		if (!scroller) return;
		this.currentScroller = scroller;
		this.scrollHandler   = () => this.updateMaskVisibility();
		scroller.addEventListener('scroll', this.scrollHandler, { passive: true });
		requestAnimationFrame(() => this.updateMaskVisibility());
	}

	detachScrollHandler() {
		if (this.currentScroller && this.scrollHandler) {
			this.currentScroller.removeEventListener('scroll', this.scrollHandler);
		}
		this.currentScroller = this.scrollHandler = null;
	}

	updateMaskVisibility() {
		const s = this.currentScroller || this.getActiveScroller();
		if (!s) return;
		const { scrollTop, scrollHeight, clientHeight } = s;
		if (this.arrowsTopEl)    this.arrowsTopEl.classList.toggle('is-visible',    scrollTop > 2);
		if (this.arrowsBottomEl) this.arrowsBottomEl.classList.toggle('is-visible', scrollTop + clientHeight < scrollHeight - 2);
	}

	attachResizeHandler() {
		if (this.windowResizeHandler) return;
		this.windowResizeHandler = () => this.scheduleMaskPosition();
		window.addEventListener('resize', this.windowResizeHandler);
	}

	detachResizeHandler() {
		if (!this.windowResizeHandler) return;
		window.removeEventListener('resize', this.windowResizeHandler);
		this.windowResizeHandler = null;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Typewriter scroll
	// ─────────────────────────────────────────────────────────────────────────

	typewriterScroll() {
		if (!this.settings.pluginEnabled || !this.settings.enableTypewriter) return;
		if (!this.isActiveFileInScope()) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const scroller = view.contentEl.querySelector('.cm-scroller');
		if (!scroller) return;
		let lineTop, lineHeight;
		const activeLine = view.contentEl.querySelector('.cm-active-line');
		if (activeLine) {
			const sr = scroller.getBoundingClientRect();
			const lr = activeLine.getBoundingClientRect();
			lineTop = lr.top - sr.top + scroller.scrollTop;
			lineHeight = lr.height;
		} else {
			const cm = view.editor && view.editor.cm;
			if (!cm) return;
			try {
				const coords = cm.coordsAtPos(cm.state.selection.main.head);
				if (!coords) return;
				const sr = scroller.getBoundingClientRect();
				lineTop = coords.top - sr.top + scroller.scrollTop;
				lineHeight = coords.bottom - coords.top;
			} catch (_) { return; }
		}
		// Cursor's vertical anchor within the scroller, expressed as a ratio
		// derived from "keep N lines above / M lines below" — defaults of 8/8
		// reproduce the previous fixed dead-center (0.5) behaviour.
		const linesAbove = Math.max(0, this.settings.typewriterLinesAbove != null ? this.settings.typewriterLinesAbove : 8);
		const linesBelow = Math.max(0, this.settings.typewriterLinesBelow != null ? this.settings.typewriterLinesBelow : 8);
		const totalLines = linesAbove + linesBelow;
		const ratioAbove  = totalLines > 0 ? linesAbove / totalLines : 0.5;
		const target = lineTop + lineHeight / 2 - scroller.clientHeight * ratioAbove;
		if (Math.abs(scroller.scrollTop - target) < 1) return;
		scroller.scrollTop = target;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// CM6 editor extensions: focus dimming + hidden markers
	// ─────────────────────────────────────────────────────────────────────────
	// Both features are implemented as CodeMirror decorations so they render
	// inside the editor's own pipeline — recomputed atomically with every
	// transaction, never racing CM6's DOM reconciliation the way the earlier
	// MutationObserver approach did (which is what caused the flicker).
	// The extensions read this.settings at build time, so they self-disable
	// when toggled off; refresh() calls workspace.updateOptions() to force a
	// rebuild whenever settings change.
	//
	// "Sentence" dim mode is approximated as the current line: decorations
	// could technically split a line into per-sentence marks, but Obsidian's
	// live-preview widgets (checkboxes, embeds, rendered links) sit inside
	// lines at unpredictable offsets, so line granularity is what's reliable.

	// ════════════════════════════════════════════════════════════════════════
	// CODEMIRROR EXTENSIONS
	// ════════════════════════════════════════════════════════════════════════

	setupEditorExtensions() {
		if (!CM) return; // @codemirror modules unavailable — features off
		// A mutable array is registered ONCE; reconfigureEditors() then swaps
		// its contents and calls workspace.updateOptions(), which is the
		// standard Obsidian pattern for dynamic editor extensions.
		this.editorExtensions = [];
		this.editorExtensions.push(...this.buildEditorExtensions());
		this.registerEditorExtension(this.editorExtensions);
	}

	// Factory that creates FRESH ViewPlugin values each call. This matters:
	// workspace.updateOptions() with unchanged extension values is a no-op —
	// CM6 keeps the existing plugin instances and never re-runs their
	// constructors — so settings toggles silently did nothing until some
	// unrelated edit/scroll happened to trigger an update(). Recreating the
	// plugins forces real reconfiguration and an immediate rebuild.
	buildEditorExtensions() {
		if (!CM || !this.settings.pluginEnabled) return [];
		const plugin = this;
		const { ViewPlugin, Decoration, WidgetType, RangeSetBuilder } = CM;

		class InvisibleWidget extends WidgetType {
			constructor(text) { super(); this.text = text; }
			eq(other) { return other.text === this.text; }
			toDOM() {
				const s = document.createElement('span');
				s.className = 'zg-invisible';
				s.textContent = this.text;
				return s;
			}
			ignoreEvent() { return true; }
		}
		const PILCROW  = Decoration.widget({ widget: new InvisibleWidget('¶'), side: 1 });
		const NEWLINE  = Decoration.widget({ widget: new InvisibleWidget('↵'), side: 1 });
		const dimDeco   = Decoration.line({ class: 'zg-dim-line' });
		const dimText   = Decoration.mark({ class: 'zg-dim-text' });
		const spaceDeco = Decoration.mark({ class: 'zg-ws-space' });
		const tabDeco   = Decoration.mark({ class: 'zg-ws-tab' });

		// ── Focus dimming ─────────────────────────────────────────────────────
		const dimPlugin = ViewPlugin.fromClass(class {
			constructor(view) { this.decorations = this.build(view); }
			update(u) {
				if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
					this.decorations = this.build(u.view);
				}
			}
			build(view) {
				const s = plugin.settings;
				if (!s.pluginEnabled || !s.enableTypewriter || !s.dimUnfocusedEnabled) return Decoration.none;
				if (!plugin.isEditorInScope(view)) return Decoration.none;
				// Nothing is "unfocused" when you are not in the editor at
				// all. Alt-tabbing away used to leave the whole note dimmed
				// around a cursor nobody was at; the plugin already rebuilds
				// on focusChanged, so this clears cleanly both ways.
				if (!view.hasFocus) return Decoration.none;
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
				const b = new RangeSetBuilder();
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
			constructor(view) { this.decorations = this.build(view); }
			update(u) {
				if (u.docChanged || u.viewportChanged) {
					this.decorations = this.build(u.view);
				}
			}
			build(view) {
				const s = plugin.settings;
				if (!s.pluginEnabled || !s.showHiddenMarkers) return Decoration.none;
				if (!plugin.isEditorInScope(view)) return Decoration.none;
				const showSp  = s.markSpaces, showTab = s.markTabs;
				const showPar = s.markParagraphs, showEol = s.markEndOfLines;
				if (!showSp && !showTab && !showPar && !showEol) return Decoration.none;
				const doc  = view.state.doc;
				const b    = new RangeSetBuilder();
				const wsRe = /[ \t]/g;
				for (const range of view.visibleRanges) {
					let pos = range.from;
					while (pos <= range.to) {
						const line = doc.lineAt(pos);
						if (showSp || showTab) {
							wsRe.lastIndex = 0;
							let m;
							while ((m = wsRe.exec(line.text))) {
								const isTab = m[0] === '\t';
								if (isTab ? showTab : showSp) {
									b.add(line.from + m.index, line.from + m.index + 1, isTab ? tabDeco : spaceDeco);
								}
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
			filler:   Decoration.mark({ class: 'zg-ck-filler'   }),
			passive:  Decoration.mark({ class: 'zg-ck-passive'  }),
			illusion: Decoration.mark({ class: 'zg-ck-illusion' }),
			hard:     Decoration.mark({ class: 'zg-ck-hard'     }),
			veryhard: Decoration.mark({ class: 'zg-ck-veryhard' }),
			repeat:   Decoration.mark({ class: 'zg-ck-repeat'   }),
			misused:  Decoration.mark({ class: 'zg-ck-misused'  }),
			pronoun:  Decoration.mark({ class: 'zg-ck-pronoun'  })
		};
		const posMark = {
			noun: Decoration.mark({ class: 'zg-pos-noun' }),
			verb: Decoration.mark({ class: 'zg-pos-verb' }),
			adj:  Decoration.mark({ class: 'zg-pos-adj'  }),
			adv:  Decoration.mark({ class: 'zg-pos-adv'  }),
			conj: Decoration.mark({ class: 'zg-pos-conj' })
		};

		const syntaxPlugin = ViewPlugin.fromClass(class {
			constructor(view) { this.decorations = this.build(view); }
			update(u) {
				if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
			}
			build(view) {
				const s = plugin.settings;
				if (!s.pluginEnabled) return Decoration.none;
				// Word classes and writing checks are independent now: either
				// can run without the other.
				const posOn = s.posEnabled ? {
					noun: s.posNoun, verb: s.posVerb, adj: s.posAdjective,
					adv:  s.posAdverb, conj: s.posConjunction
				} : {};
				const checksOn = s.checksEnabled && (s.checkFiller || s.checkPassive ||
					s.checkIllusion || s.checkMisused || s.checkPronoun ||
					s.checkRhythm || s.checkRepetition);
				if (!Object.keys(posOn).some(k => posOn[k]) && !checksOn) return Decoration.none;
				if (!plugin.isEditorInScope(view)) return Decoration.none;

				const doc  = view.state.doc;
				const skip = s.syntaxSkipCode ? plugin.getNonProseLines(doc) : null;
				const out  = [];
				// Repetition spans lines, so its tokens are collected across
				// the whole visible range and scanned once at the end.
				const seen = s.checkRepetition ? [] : null;

				for (const range of view.visibleRanges) {
					let pos = range.from;
					while (pos <= range.to) {
						const line = doc.lineAt(pos);
						pos = line.to + 1;
						if (skip && skip.has(line.number)) continue;
						if (!line.text.trim()) continue;

						const masked = maskMarkup(line.text);
						const tokens = tagTokens(tokenizeLine(masked), masked);
						const base   = line.from;

						for (const t of tokens) {
							const bucket = posBucket(t.tag);
							if (bucket && posOn[bucket]) {
								out.push(posMark[bucket].range(base + t.from, base + t.to));
							}
						}

						if (!checksOn) continue;

						if (s.checkPassive) {
							for (const r of findPassive(tokens)) {
								out.push(checkMark.passive.range(base + r.from, base + r.to));
							}
						}
						if (s.checkIllusion) {
							for (const r of findIllusions(tokens)) {
								out.push(checkMark.illusion.range(base + r.from, base + r.to));
							}
						}
						for (const t of tokens) {
							if (s.checkFiller && FILLER_WORDS.has(t.lw)) {
								out.push(checkMark.filler.range(base + t.from, base + t.to));
							}
							if (s.checkMisused && MISUSED_WORDS.has(t.lw)) {
								out.push(checkMark.misused.range(base + t.from, base + t.to));
							}
							// Only sentence-initial: a pronoun mid-sentence
							// almost always has its referent right there.
							if (s.checkPronoun && t.first && VAGUE_PRONOUNS.has(t.lw)) {
								out.push(checkMark.pronoun.range(base + t.from, base + t.to));
							}
						}
						if (s.checkFiller) {
							FILLER_PHRASES.lastIndex = 0;
							let m;
							while ((m = FILLER_PHRASES.exec(masked))) {
								out.push(checkMark.filler.range(base + m.index, base + m.index + m[0].length));
							}
						}

						// Sentence rhythm. Always a background tint, whatever
						// checkStyle says: a squiggle under thirty words is
						// noise, and the point is to see a wall of one colour.
						if (s.checkRhythm) {
							for (const sent of splitSentences(masked)) {
								const st = tokenizeLine(sent.text);
								if (st.length < 4) continue;      // fragments are not "hard"
								const grade = sentenceGrade(st);
								// != null, not ||: a threshold of 0 is a valid
								// setting and `|| 10` silently discarded it.
								const veryAt = s.checkRhythmVeryHardGrade != null ? s.checkRhythmVeryHardGrade : 14;
								const hardAt = s.checkRhythmHardGrade     != null ? s.checkRhythmHardGrade     : 10;
								const mark = grade >= veryAt ? checkMark.veryhard
									: grade >= hardAt        ? checkMark.hard
									: null;
								if (mark) out.push(mark.range(base + sent.from, base + sent.to));
							}
						}

						if (seen) {
							for (const t of tokens) {
								seen.push({ lw: t.lw, w: t.w, from: base + t.from, to: base + t.to });
							}
						}
					}
				}

				if (seen && seen.length) {
					const win = s.repetitionWindow    != null ? s.repetitionWindow    : 50;
					const min = s.repetitionMinLength != null ? s.repetitionMinLength : 5;
					for (const r of findRepetitions(seen, win, min)) {
						out.push(checkMark.repeat.range(r.from, r.to));
					}
				}
				return Decoration.set(out, true);
			}
		}, { decorations: v => v.decorations });

		// ── Paragraph indent ──────────────────────────────────────────────────
		// Previously a MutationObserver stamped .zg-para-first onto rendered
		// .cm-line nodes based only on blank-line adjacency, so bullets, tasks,
		// headings, quotes and table rows all got indented alongside prose.
		// As a decoration it works from the document instead of the DOM, which
		// also means it sees lines CodeMirror has scrolled out of existence.
		const paraFirstDeco = Decoration.line({ class: 'zg-para-first' });
		const paraBodyDeco  = Decoration.line({ class: 'zg-para-line'  });

		const paraPlugin = ViewPlugin.fromClass(class {
			constructor(view) { this.decorations = this.build(view); }
			update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
			build(view) {
				const s = plugin.settings;
				if (!s.pluginEnabled || !s.enableParagraphIndent) return Decoration.none;
				if (!plugin.isEditorInScope(view)) return Decoration.none;

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
				return Decoration.set(out, true);
			}
		}, { decorations: v => v.decorations });

		// Hemingway is concatenated ahead of the typography revert keymap so
		// that when the lock is on, Backspace is blocked rather than quietly
		// reverting a substitution.
		return [dimPlugin, markerPlugin, syntaxPlugin, paraPlugin]
			.concat(this.buildHemingwayExtensions())
			.concat(this.buildTypographyExtension())
			.concat(this.buildTypographyRevertKeymap());
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Hemingway mode — write forward only
	//
	// Two layers, deliberately. The keymap at highest precedence is the
	// primary: it sits above CodeMirror's own bindings and above Obsidian's,
	// so Backspace and Mod-z never reach the commands behind them. The DOM
	// handlers are the backstop, because a keymap only sees keystrokes — it
	// cannot see the Edit menu, a right-click Cut, an IME deletion, or a
	// mobile keyboard's delete, all of which arrive as beforeinput instead.
	// Blocking only the keys would leave those routes wide open.
	// ─────────────────────────────────────────────────────────────────────────

	// ─────────────────────────────────────────────────────────────────────────
	// Smart typography
	//
	// A CodeMirror input handler rather than a decoration: this rewrites the
	// document, so what gets exported, synced and read elsewhere is the real
	// character. The substitution is one transaction, so a single undo puts
	// back exactly what was typed.
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// TYPOGRAPHY
	// ════════════════════════════════════════════════════════════════════════

	buildTypographyExtension() {
		if (!CM || !CM.EditorView || !this.settings.typographyEnabled) return [];
		const plugin = this;

		// Prec.highest matters here. Obsidian's own "auto pair brackets" is an
		// input handler too, and it claims the quote keys — at default
		// precedence it ran first and inserted a straight pair, so curly
		// quotes never fired.
		const handler = CM.EditorView.inputHandler.of((view, from, to, text) => {
			if (text.length !== 1) return false;                 // paste, IME, multi-char
			const s = plugin.settings;
			if (!s.pluginEnabled || !plugin.isEditorInScope(view)) return false;

			const doc  = view.state.doc;
			const line = doc.lineAt(from);
			// Never rewrite inside code, math or frontmatter. The line scan
			// handles blocks; the backtick parity handles inline spans.
			if (plugin.getNonProseLines(doc).has(line.number)) return false;
			const before = doc.sliceString(line.from, from);
			if ((before.match(/`/g) || []).length % 2 === 1) return false;
			if ((before.match(/\$/g) || []).length % 2 === 1) return false;

			const groupOn = {
				ellipsis:    s.typoEllipsis,
				dashes:      s.typoDashes,
				arrows:      s.typoArrows,
				guillemets:  s.typoGuillemets,
				comparisons: s.typoComparisons,
				fractions:   s.typoFractions
			};

			const lookback = doc.sliceString(Math.max(line.from, from - TYPO_MAX_LOOKBACK), from);

			for (const rule of TYPO_RULES) {
				if (!groupOn[rule.group]) continue;
				if (rule.text.charAt(rule.text.length - 1) !== text) continue;
				const prefix = rule.text.slice(0, -1);
				if (!lookback.endsWith(prefix)) continue;
				if (rule.notAfter) {
					const preceding = lookback.charAt(lookback.length - prefix.length - 1);
					if (preceding && rule.notAfter.test(preceding)) continue;
				}
				plugin.applyTypography(view, from, to, text, rule.text, rule.insert);
				return true;
			}

			if (s.typoSmartQuotes && (text === '"' || text === "'")) {
				const prev  = lookback.charAt(lookback.length - 1);
				const opens = prev === '' || TYPO_OPENS_AFTER.test(prev);
				const custom = s.typoCustomQuotes;
				const pick = (key, fallback) => {
					const v = custom ? s[key] : '';
					return (typeof v === 'string' && v.length) ? v : fallback;
				};
				// After a letter, a single quote is either an apostrophe or the
				// end of a quotation, and the character alone cannot say which:
				// don't and 'b' look identical at the cursor. So look back for
				// an opening quote that has not been closed yet.
				const openCh  = pick('typoOpenSingle', '\u2018');
				const closeCh = pick('typoCloseSingle', '\u2019');
				const opens_  = before.split(openCh).length - 1;
				const closes_ = openCh === closeCh ? 0 : before.split(closeCh).length - 1;
				const inQuote = opens_ > closes_;
				const midWord = /[\p{L}\p{N}]/u.test(prev) && !inQuote;
				const glyph = text === '"'
					? (opens ? pick('typoOpenDouble', '\u201c') : pick('typoCloseDouble', '\u201d'))
					: (opens ? openCh : midWord ? pick('typoApostrophe', '\u2019') : closeCh);
				plugin.applyTypography(view, from, to, text, text, glyph);
				return true;
			}
			return false;
		});
		return [CM.Prec ? CM.Prec.highest(handler) : handler];
	}

	// Two transactions, not one. A single transaction that swapped "--" for an
	// en dash undid straight *past* the literal characters, because the state
	// it restored never contained the second dash — the input handler had
	// suppressed it. So the sequence is: insert exactly what was typed, then
	// replace it as a separate, history-isolated step. One undo now lands on
	// the characters, which is what "undo" is expected to mean here.
	applyTypography(view, from, to, typed, matched, glyph) {
		view.dispatch({
			changes: { from, to, insert: typed },
			selection: { anchor: from + typed.length },
			userEvent: 'input.type'
		});

		const end   = from + typed.length;
		const start = end - matched.length;
		const spec  = {
			changes: { from: start, to: end, insert: glyph },
			// Setting the cursor explicitly keeps it off the end of a glyph
			// that is shorter than the text it replaced.
			selection: { anchor: start + glyph.length },
			userEvent: 'input.typography'
		};
		if (CM.isolateHistory) spec.annotations = CM.isolateHistory.of('before');
		view.dispatch(spec);

		// Remembered so Backspace can undo it too — that is the key people
		// actually reach for, and it is what the reference plugin does.
		this._lastTypo = {
			from: start,
			to: start + glyph.length,
			glyph,
			original: matched,
			time: Date.now()
		};
	}

	// Backspace immediately after a substitution puts the typed characters
	// back rather than deleting the glyph. Guarded on the text still being
	// exactly what was inserted, the cursor still sitting after it, and the
	// substitution being recent — otherwise Backspace behaves normally.
	buildTypographyRevertKeymap() {
		if (!CM || !CM.keymap || !this.settings.typographyEnabled) return [];
		const plugin = this;
		const km = CM.keymap.of([{ key: 'Backspace', run: (view) => {
			const t = plugin._lastTypo;
			if (!t || Date.now() - t.time > 5000) return false;
			if (!plugin.isEditorInScope(view)) return false;
			const sel = view.state.selection.main;
			if (!sel.empty || sel.from !== t.to) return false;
			if (view.state.doc.sliceString(t.from, t.to) !== t.glyph) return false;
			view.dispatch({
				changes: { from: t.from, to: t.to, insert: t.original },
				selection: { anchor: t.from + t.original.length },
				userEvent: 'delete.typography'
			});
			plugin._lastTypo = null;
			return true;
		} }]);
		return [CM.Prec ? CM.Prec.highest(km) : km];
	}

	// ════════════════════════════════════════════════════════════════════════
	// HEMINGWAY LOCK
	// ════════════════════════════════════════════════════════════════════════

	buildHemingwayExtensions() {
		if (!CM || !CM.keymap || !this.settings.hemingwayEnabled) return [];
		const plugin = this;
		const s = () => plugin.settings;
		const { keymap, EditorView, Prec } = CM;

		// Returning false means "not handled", so the keystroke falls through
		// to normal editing — which is exactly what an out-of-scope note wants.
		const blocked = (view) => {
			if (view && !plugin.isEditorInScope(view)) return false;
			plugin.flashHemingway();
			return true;   // handled → CodeMirror calls preventDefault for us
		};
		const locked = (view) => plugin.isEditorInScope(view);

		// Collected in a Set because several keys belong to more than one lock
		// (Shift-Delete is both a delete and the legacy cut), and a duplicate
		// binding would just make CodeMirror try the same blocker twice.
		const keys = new Set();
		const addKeys = (...ks) => ks.forEach(k => keys.add(k));
		const c = this.settings;

		if (c.hemBlockBackspace) addKeys('Backspace', 'Shift-Backspace', 'Mod-Backspace', 'Alt-Backspace', 'Ctrl-h');
		if (c.hemBlockDelete)    addKeys('Delete', 'Mod-Delete', 'Alt-Delete', 'Ctrl-d');
		if (c.hemBlockUndo)      addKeys('Mod-z', 'Mod-Shift-z', 'Mod-y');
		if (c.hemBlockCut)       addKeys('Mod-x', 'Shift-Delete');
		if (c.hemBlockPaste)     addKeys('Mod-v', 'Mod-Shift-v');
		if (c.hemBlockSelectAll) addKeys('Mod-a');
		if (c.hemBlockArrows) {
			for (const dir of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
				addKeys(dir, 'Shift-' + dir, 'Mod-' + dir, 'Alt-' + dir,
					'Mod-Shift-' + dir, 'Alt-Shift-' + dir);
			}
		}
		if (c.hemBlockJumpKeys) {
			for (const k of ['Home', 'End', 'PageUp', 'PageDown']) {
				addKeys(k, 'Shift-' + k, 'Mod-' + k, 'Mod-Shift-' + k);
			}
		}

		const binds = [];
		keys.forEach(key => binds.push({ key, run: blocked, preventDefault: true }));

		const handlers = EditorView ? EditorView.domEventHandlers({
			// inputType is the honest signal: it names the *edit* rather than
			// the keystroke, so it catches menu actions, IME and mobile alike.
			beforeinput(e, view) {
				if (!locked(view)) return false;
				const t = (e && e.inputType) || '';
				const k = plugin.settings;
				if (k.hemBlockBackspace && /^delete(ContentBackward|WordBackward|SoftLineBackward|HardLineBackward)$/.test(t)) return blocked(view);
				if (k.hemBlockDelete    && /^delete(ContentForward|WordForward|SoftLineForward|HardLineForward)$/.test(t))   return blocked(view);
				if (k.hemBlockBackspace && t === 'deleteContent') return blocked(view);
				if (k.hemBlockUndo      && (t === 'historyUndo' || t === 'historyRedo')) return blocked(view);
				if (k.hemBlockCut       && t === 'deleteByCut')   return blocked(view);
				if (k.hemBlockPaste     && /^insertFromPaste/.test(t)) return blocked(view);
				if (k.hemBlockMouse     && t === 'deleteByDrag')  return blocked(view);
				// Typing over a selection is a deletion wearing a different
				// inputType. Without this, select-all-then-type still wipes the
				// note even with every delete key locked.
				if (k.hemBlockBackspace && /^insert/.test(t)) {
					try {
						if (view && !view.state.selection.main.empty) return blocked(view);
					} catch (_) { /* older CM state shape — fall through */ }
				}
				return false;
			},
			cut(e, view)   { return plugin.settings.hemBlockCut   ? blocked(view) : false; },
			paste(e, view) { return plugin.settings.hemBlockPaste ? blocked(view) : false; },
			mousedown(e, view) {
				if (!plugin.settings.hemBlockMouse || !locked(view)) return false;
				// Swallowing mousedown outright would also swallow the click
				// that focuses the editor, leaving no way back in after
				// visiting another pane. Focus explicitly instead — CodeMirror
				// restores the existing selection rather than moving the caret.
				if (!view.hasFocus) { view.focus(); return true; }
				return blocked(view);
			},
			contextmenu(e, view) { return plugin.settings.hemBlockMouse ? blocked(view) : false; },
			dragstart(e, view)   { return plugin.settings.hemBlockMouse ? blocked(view) : false; },
			drop(e, view)        { return plugin.settings.hemBlockMouse ? blocked(view) : false; }
		}) : null;

		const exts = [];
		const km = keymap.of(binds);
		exts.push(Prec ? Prec.highest(km) : km);
		if (handlers) exts.push(Prec ? Prec.highest(handlers) : handlers);
		return exts;
	}

	// Feedback for a blocked key. A screen flash has to sit above the
	// letterbox masks or it simply does not appear in the one mode most
	// likely to be running alongside Hemingway.
	flashHemingway() {
		const target = this.settings.hemFlashTarget || 'screen';
		if (target === 'none') return;
		if (target === 'icon')                          this.flashHemingwayIcon();
		if (target === 'screen'   || target === 'both') this.flashHemingwayScreen();
		if (target === 'retrobar' || target === 'both') this.flashHemingwayBar();
	}

	// The quietest of the three: only the H badge reddens. Needs {mode} in the
	// bar to show at all, which the setting says.
	flashHemingwayIcon() {
		const el = document.querySelector('.zg-mode-badge.is-hem');
		if (!el) return;
		el.classList.remove('zg-hem-blocked');
		void el.offsetWidth;   // reflow, so held keys restart the flash
		el.classList.add('zg-hem-blocked');
		if (this._hemIconTimer) window.clearTimeout(this._hemIconTimer);
		this._hemIconTimer = window.setTimeout(() => {
			const badge = document.querySelector('.zg-mode-badge.zg-hem-blocked');
			if (badge) badge.classList.remove('zg-hem-blocked');
			this._hemIconTimer = null;
		}, 500);
	}

	flashHemingwayScreen() {
		let el = this._hemScreenEl;
		if (!el || !el.isConnected) {
			el = document.createElement('div');
			el.className = 'zg-hem-screen';
			document.body.appendChild(el);
			this._hemScreenEl = el;
		}
		el.classList.remove('is-on');
		void el.offsetWidth;   // reflow, so held keys restart the animation
		el.classList.add('is-on');
		if (this._hemScreenTimer) window.clearTimeout(this._hemScreenTimer);
		this._hemScreenTimer = window.setTimeout(() => {
			// Removed, not just hidden. A full-window fixed element left in
			// the DOM keeps swallowing -webkit-app-region hit tests, which
			// ignore both opacity and pointer-events — so one blocked key
			// would cost you window dragging for the rest of the session.
			if (this._hemScreenEl) { this._hemScreenEl.remove(); this._hemScreenEl = null; }
			this._hemScreenTimer = null;
		}, 500);
	}

	flashHemingwayBar() {
		const el = this.retroStatusBarEl;
		if (!el) return;
		el.classList.remove('zg-hem-blocked');
		void el.offsetWidth;
		el.classList.add('zg-hem-blocked');
		if (this._hemFlashTimer) window.clearTimeout(this._hemFlashTimer);
		this._hemFlashTimer = window.setTimeout(() => {
			if (this.retroStatusBarEl) this.retroStatusBarEl.classList.remove('zg-hem-blocked');
			this._hemFlashTimer = null;
		}, 500);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Word count: file tree + outline
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// SIDEBAR WORD COUNTS
	// ════════════════════════════════════════════════════════════════════════

	attachExplorerObserver() {
		// Observe only the file-explorer and outline leaf containers — the
		// old body-wide observer scheduled a full explorer re-scan on any DOM
		// change anywhere (typing repaints, tooltips, …). Re-bound from the
		// layout-change handler since these leaves can be recreated.
		this.detachExplorerObserver();
		this.scheduleExplorerPatch();
		this.explorerObserver = new MutationObserver(() => this.scheduleExplorerPatch());
		const targets = document.querySelectorAll(
			'.workspace-leaf-content[data-type="file-explorer"], .workspace-leaf-content[data-type="outline"]');
		targets.forEach(t => this.explorerObserver.observe(t, { childList: true, subtree: true }));
	}

	detachExplorerObserver() {
		if (this.explorerObserver) { this.explorerObserver.disconnect(); this.explorerObserver = null; }
	}

	scheduleExplorerPatch() {
		if (this._patchScheduled) return;
		this._patchScheduled = true;
		requestAnimationFrame(() => { this._patchScheduled = false; this.patchExplorerDOM(); });
	}

	async patchExplorerDOM() {
		// Covers scheduleExplorerPatch() calls from active-leaf-change, vault
		// modify, and the mutation observer while the plugin is toggled off.
		if (!this.settings.pluginEnabled) return;
		if (this.settings.enableFileTreeCounts) {
			const roots = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
			for (let ri = 0; ri < roots.length; ri++) {
				const root  = roots[ri];
				const tiles = root.querySelectorAll('.nav-file-title');
				const jobs  = [];
				for (let i = 0; i < tiles.length; i++) {
					const path = tiles[i].dataset && tiles[i].dataset.path;
					if (path && path.endsWith('.md')) jobs.push(this.applyFileWordCount(tiles[i], path));
				}
				await Promise.all(jobs); // parallel reads, not one await per file
				this.applyFolderSums(root);
			}
		} else {
			document.querySelectorAll('.nav-file-title .zg-count, .nav-folder-title .zg-count').forEach(el => el.remove());
		}
		if (this.settings.enableOutlineCounts) {
			const oroots = document.querySelectorAll('.workspace-leaf-content[data-type="outline"]');
			await Promise.all(Array.from(oroots, r => this.applyOutlineWordCounts(r)));
		} else {
			document.querySelectorAll('.tree-item-self .zg-count').forEach(el => el.remove());
		}
	}

	async applyFileWordCount(el, path) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof TFile)) return;
		const hit = this.wordCountCache.get(path);
		if (hit && hit.mtime === file.stat.mtime) { this.setCountBadge(el, hit.count); return; }
		try {
			const text = await this.app.vault.cachedRead(file);
			const count = this.countWords(text); // frontmatter excluded, matching the status bar
			this.wordCountCache.set(path, { mtime: file.stat.mtime, count });
			this.setCountBadge(el, count);
		} catch (_) {}
	}

	applyFolderSums(root) {
		const folders = root.querySelectorAll('.nav-folder-title');
		for (let i = folders.length - 1; i >= 0; i--) {
			const fEl = folders[i].closest('.nav-folder');
			if (!fEl) continue;
			const children = fEl.querySelector('.nav-folder-children');
			if (!children) continue;
			let total = 0;
			children.querySelectorAll('.zg-count[data-wc]').forEach(b => total += parseInt(b.dataset.wc, 10) || 0);
			this.setCountBadge(folders[i], total);
		}
	}

	async applyOutlineWordCounts(outlineRoot) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		const cache = this.app.metadataCache.getFileCache(activeFile);
		if (!cache || !cache.headings) return;
		let text;
		try { text = await this.app.vault.cachedRead(activeFile); } catch (_) { return; }
		const counts = new Map();
		cache.headings.forEach((h, i) => {
			const start = h.position.end.offset;
			const end   = (i + 1 < cache.headings.length) ? cache.headings[i + 1].position.start.offset : text.length;
			const slice = text.slice(start, end).trim();
			counts.set('plain:' + h.heading, slice === '' ? 0 : slice.split(/\s+/).length);
		});
		outlineRoot.querySelectorAll('.tree-item-self').forEach(node => {
			const inner = node.querySelector('.tree-item-inner');
			if (!inner) return;
			const count = counts.get('plain:' + inner.textContent.trim());
			if (count != null) this.setCountBadge(node, count);
		});
	}

	setCountBadge(parentEl, count) {
		parentEl.style.display = 'flex'; parentEl.style.alignItems = 'center'; parentEl.style.justifyContent = 'space-between';
		const inner = parentEl.querySelector('.nav-file-title-content, .nav-folder-title-content, .tree-item-inner');
		if (inner) { inner.style.flex = '1'; inner.style.overflow = 'hidden'; inner.style.textOverflow = 'ellipsis'; inner.style.whiteSpace = 'nowrap'; }
		let badge = parentEl.querySelector('.zg-count');
		if (!badge) { badge = document.createElement('span'); badge.className = 'zg-count'; parentEl.appendChild(badge); }
		badge.dataset.wc = String(count);
		if (badge.textContent !== count.toLocaleString()) badge.textContent = count.toLocaleString();
	}

	removeWordCounts() {
		document.querySelectorAll('.zg-count').forEach(el => el.remove());
		if (this.wordCountCache) this.wordCountCache.clear();
	}
};

// =============================================================================
// Settings tab
// =============================================================================

class WordSmithSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Transient UI memory (last non-zero arrow count, active tab) lives here
		// — on the tab instance — so it never gets persisted into data.json.
		this._lastArrowCount = null;
		this._activeTab = 'zen';
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName('Word-Smith').setHeading();

		// ── Master on/off ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Enable Word-Smith')
			.setDesc('Master switch — turns the entire plugin on or off without uninstalling it.')
			.addToggle(t => t.setValue(this.plugin.settings.pluginEnabled)
				.onChange(async v => {
					this.plugin.settings.pluginEnabled = v;
					await this.plugin.saveSettings(true); // master switch lands immediately, not debounced
					this.display();
				}));

		if (!this.plugin.settings.pluginEnabled) return;

		this.toggle(containerEl, 'Restore cursor position',
			'Reopen notes where you left the caret.',
			'restoreCursorPosition');

		this.renderScopeSection(containerEl);

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// ── Tab bar ──────────────────────────────────────────────────────────────
		const TABS = [
			{ id: 'zen',        label: 'Zen',          render: this.displayZenTab },
			{ id: 'typewriter', label: 'Typewriter',   render: this.displayTypewriterTab },
			{ id: 'hemingway',  label: 'Hemingway',    render: this.displayHemingwayTab },
			{ id: 'retrobar',   label: 'Retro Bar',    render: this.displayRetroBarTab },
			{ id: 'syntax',     label: 'Syntax',       render: this.displaySyntaxTab },
			{ id: 'text',       label: 'Text Options', render: this.displayTextTab },
			{ id: 'misc',       label: 'Misc',         render: this.displayMiscTab }
		];
		if (!this._activeTab || !TABS.some(t => t.id === this._activeTab)) this._activeTab = TABS[0].id;

		const navEl = containerEl.createEl('div', { cls: 'ws-tab-nav' });
		TABS.forEach(tab => {
			const btn = navEl.createEl('button', {
				text: tab.label,
				cls: 'ws-tab-btn' + (this._activeTab === tab.id ? ' is-active' : '')
			});
			btn.addEventListener('click', () => {
				if (this._activeTab === tab.id) return;
				this._activeTab = tab.id;
				this.display();
			});
		});

		const bodyEl = containerEl.createEl('div', { cls: 'ws-tab-body' });
		const active = TABS.find(t => t.id === this._activeTab);
		active.render.call(this, bodyEl);
	}

	// ── Scope picker (sits directly under the master switch) ──────────────────
	renderScopeSection(containerEl) {
		const s = this.plugin.settings;
		if (!Array.isArray(s.scopePaths)) s.scopePaths = [];
		const paths   = s.scopePaths;
		const exclude = s.scopeMode === 'exclude';

		const desc = paths.length === 0
			? 'Empty — Word-Smith applies to every note. Add folders or notes to narrow it.'
			: (exclude
				? 'Applies everywhere except the paths below.'
				: 'Applies only to the paths below.');

		const setting = new Setting(containerEl)
			.setName('Where Word-Smith applies')
			.setDesc(desc)
			.addDropdown(d => d
				.addOption('include', 'Only these')
				.addOption('exclude', 'Everywhere except')
				.setValue(s.scopeMode || 'include')
				.onChange(async v => {
					s.scopeMode = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (WsPathSuggestModal) {
			setting
				.addButton(b => b.setButtonText('Add folder').onClick(() => this.pickScopePath('folder')))
				.addButton(b => b.setButtonText('Add note').onClick(() => this.pickScopePath('file')));
		}

		const help = containerEl.createEl('div', { cls: 'ws-fm-help' });
		help.createEl('p', {
			text: 'Frontmatter overrides the list above for a single note:',
			cls: 'ws-settings-note'
		});
		help.createEl('pre', {
			cls: 'ws-fm-sample',
			text: [
				'---',
				'wordsmith: off        # ignore this note entirely',
				'ws-zen: true          # or override one mode at a time',
				'ws-typewriter: false',
				'ws-hemingway: true',
				'ws-syntax: true',
				'ws-markers: false',
				'ws-typography: false',
				'ws-goal: 2000        # word target for this note',
				'ws-font: Literata    # font for this note only',
				'---'
			].join('\n')
		});

		if (!paths.length) return;

		const list = containerEl.createEl('div', { cls: 'ws-scope-list' });
		paths.forEach((path, i) => {
			const row = list.createEl('div', { cls: 'ws-scope-row' });
			row.createEl('span', {
				cls: 'ws-scope-path' + (path.endsWith('.md') ? '' : ' is-folder'),
				text: path === '/' ? 'Entire vault' : path
			});
			const btn = row.createEl('button', { cls: 'ws-scope-remove', text: '\u00d7' });
			btn.setAttribute('aria-label', 'Remove ' + path);
			btn.addEventListener('click', async () => {
				s.scopePaths.splice(i, 1);
				await this.plugin.saveSettings(true);
				this.display();
			});
		});
	}

	pickScopePath(kind) {
		if (!WsPathSuggestModal) return;
		const s = this.plugin.settings;
		const have = new Set(s.scopePaths || []);
		let items;
		if (kind === 'folder') {
			// TFolder is not on every API version; the children property is
			// the reliable way to tell a folder from a file either way.
			items = this.app.vault.getAllLoadedFiles()
				.filter(f => f && (TFolder ? f instanceof TFolder : f.children !== undefined))
				.map(f => f.path)
				.filter(path => path && path !== '/' && !have.has(path));
			if (!have.has('/')) items.unshift('/');
		} else {
			items = this.app.vault.getMarkdownFiles()
				.map(f => f.path)
				.filter(path => !have.has(path));
		}
		if (!items.length) return;
		new WsPathSuggestModal(
			this.app,
			items,
			kind === 'folder' ? 'Choose a folder\u2026' : 'Choose a note\u2026',
			async (picked) => {
				if (!Array.isArray(s.scopePaths)) s.scopePaths = [];
				if (!s.scopePaths.includes(picked)) s.scopePaths.push(picked);
				await this.plugin.saveSettings(true);
				this.display();
			}
		).open();
	}

	// ── Zen tab ────────────────────────────────────────────────────────────────
	displayZenTab(containerEl) {
		// One master switch over both halves, so there is a single thing
		// called "Zen" rather than two features that happen to be filed
		// together. The Z badge in the bar toggles this.
		new Setting(containerEl)
			.setName('Zen')
			.setDesc('Master switch for focus mode and letterbox.')
			.addToggle(t => t.setValue(this.plugin.settings.zenEnabled)
				.onChange(async v => {
					this.plugin.settings.zenEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (!this.plugin.settings.zenEnabled) return;

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		new Setting(containerEl)
			.setName('Focus mode')
			.setDesc('Hide UI chrome and collapse sidebars for distraction-free writing.')
			.addToggle(t => t.setValue(this.plugin.settings.zenMode)
				.onChange(async () => { await this.plugin.toggleZenMode(); this.display(); }));

		if (this.plugin.settings.zenMode) {
			const z = this.sub(containerEl);

			this.toggle(z, 'Full screen', 'Enter fullscreen when enabling zen mode.', 'fullscreen');

			this.toggle(z, 'Match the title bar',
				'Paints Obsidian\u2019s title bar the same colour as the editor, so the window has no seam. '
				+ 'Needs Obsidian\u2019s own window frame \u2014 a native OS title bar cannot be styled.',
				'zenTitlebarMatch');

			this.toggle(z, 'Focused file mode', 'Only show the active file — hide all other panes.', 'focusedFileMode');

			this.label(z, 'Hide in zen mode');
			const hide = this.sub(z);
			this.toggle(hide, 'Properties',       'Hide note properties / frontmatter.',   'hideProperties');
			this.toggle(hide, 'Inline title',      'Hide the inline note title.',            'hideInlineTitle');
			this.toggle(hide, 'Native status bar', 'Hide Obsidian\'s built-in status bar in zen mode. (The retro bar always hides it while active, regardless of this setting.)', 'hideStatusBar');
			this.toggle(hide, 'Linked mentions',   'Hide linked mentions panel.',            'hideLinkedMentions');
			this.toggle(hide, 'Scroll bar',        'Hide the editor scroll bar.',            'hideScrollBar');
			this.toggle(hide, 'Ribbon',            'Hide the left ribbon bar.',               'hideRibbon');

			this.label(z, 'Padding');
			const pad = this.sub(z);
			this.slider(pad, 'Top',    'Extra space above editor content (0–100 px).', 'topPadding',    0, 100, 1);
			this.slider(pad, 'Bottom', 'Extra space below editor content (0–100 px).', 'bottomPadding', 0, 100, 1);
		}

		// Letterbox lives here rather than in a tab of its own: it is the
		// other half of the same idea — one hides the app around the text,
		// the other hides the text around the line you are writing.
		containerEl.createEl('hr', { cls: 'ws-settings-hr' });
		this.displayLetterboxSection(containerEl);
	}
	// ── Typewriter tab ─────────────────────────────────────────────────────────
	displayTypewriterTab(containerEl) {
		new Setting(containerEl)
			.setName('Typewriter mode')
			.setDesc('Keep the cursor line vertically centred as you type.')
			.addToggle(t => t.setValue(this.plugin.settings.enableTypewriter)
				.onChange(async v => {
					this.plugin.settings.enableTypewriter = v;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enableTypewriter) {
			containerEl.createEl('p', { text: 'Letterbox masks and arrows have their own settings on the Mask tab. Horizontal text padding now lives on the Text Options tab.', cls: 'ws-settings-note' });

			const tw = this.sub(containerEl);

			// ── Current line highlight ─────────────────────────────────────────
			this.label(tw, 'Current line highlight');
			this.toggle(tw, 'Highlight current line', 'Tint the background of the line the cursor is on.', 'highlightCurrentLine', () => this.display());
			if (this.plugin.settings.highlightCurrentLine) {
				const hl = this.sub(tw);
				new Setting(hl).setName('Dark theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightDarkColor).onChange(async v => { this.plugin.settings.lineHighlightDarkColor = v; await this.plugin.saveSettings(); }));
				new Setting(hl).setName('Light theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightLightColor).onChange(async v => { this.plugin.settings.lineHighlightLightColor = v; await this.plugin.saveSettings(); }));
				this.slider(hl, 'Opacity', 'How strong the tint is.', 'lineHighlightOpacity', 0.05, 1, 0.05);
			}

			// ── Cursor position ─────────────────────────────────────────────────
			this.label(tw, 'Cursor position');
			tw.createEl('p', { text: 'How many lines of context to keep above/below the cursor. Equal values keep it dead-centre (the default).', cls: 'ws-settings-note' });
			const pos = this.sub(tw);
			this.numInput(pos, 'Lines above cursor', '', 'typewriterLinesAbove', 0, 40);
			this.numInput(pos, 'Lines below cursor', '', 'typewriterLinesBelow', 0, 40);

			// ── Focus dimming ────────────────────────────────────────────────────
			this.label(tw, 'Focus dimming');
			this.toggle(tw, 'Dim unfocused text', 'Fade everything outside the focus area while you write.', 'dimUnfocusedEnabled', () => this.display());
			if (this.plugin.settings.dimUnfocusedEnabled) {
				const dim = this.sub(tw);
				new Setting(dim).setName('Focus area')
					.addDropdown(d => d
						.addOption('paragraph', 'Paragraph')
						.addOption('sentence',  'Sentence')
						.setValue(this.plugin.settings.dimFocusMode || 'paragraph')
						.onChange(async v => { this.plugin.settings.dimFocusMode = v; await this.plugin.saveSettings(); }));
				this.slider(dim, 'Opacity', 'Opacity of the dimmed, unfocused text.', 'dimOpacity', 0.05, 1, 0.05);
			}
		} else {
			containerEl.createEl('p', {
				text: 'Turn this on to also use the letterbox masks on the Mask tab — they require typewriter mode to be active.',
				cls: 'ws-settings-note'
			});
		}
	}

	// ── Mask (arrows) tab ──────────────────────────────────────────────────────
	displayLetterboxSection(containerEl) {
		if (!this.plugin.settings.enableTypewriter) {
			containerEl.createEl('p', {
				text: 'Typewriter mode is off, so masks won\'t be visible yet. Enable it from the Typewriter tab.',
				cls: 'ws-settings-note'
			});
		}

		new Setting(containerEl)
			.setName('Letterbox')
			.setDesc('Top and bottom masks framing the writing area.')
			.addToggle(t => t.setValue(this.plugin.settings.enableLetterbox)
				.onChange(async v => {
					this.plugin.settings.enableLetterbox = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (this.plugin.settings.enableLetterbox) {
			const ls = this.sub(containerEl);

			new Setting(ls).setName('Mask height (px)').setDesc('Drag the separator line in zen mode to adjust live.')
				.addSlider(s => s.setLimits(0, 400, 4)
					.setValue(this.plugin.settings.letterboxPx != null
						? Math.round(this.plugin.settings.letterboxPx)
						: (this.plugin.settings.letterboxLines || 8) * 26)
					.setDynamicTooltip()
					.onChange(async v => { this.plugin.settings.letterboxPx = v; await this.plugin.saveSettings(); }));

			this.slider(ls, 'Horizontal inset', 'Insets the arrow/line layer. Drag the arrow row to adjust live.', 'maskPaddingH', 0, 400, 10);

			new Setting(ls).setName('Show arrows').setDesc('Arrow characters along the mask edges.')
				.addToggle(t => t.setValue(this.plugin.settings.arrowCount > 0)
					.onChange(async v => {
						if (!v) this._lastArrowCount = this.plugin.settings.arrowCount || 5;
						this.plugin.settings.arrowCount = v ? (this._lastArrowCount || 5) : 0;
						await this.plugin.saveSettings(); this.display();
					}));

			if (this.plugin.settings.arrowCount > 0) {
				const as = this.sub(ls);
				new Setting(as).setName('Arrow style')
					.addDropdown(d => d
						.addOption('solid-triangle',   '▲ / ▼  Solid triangles')
						.addOption('outline-triangle', '△ / ▽  Outline triangles')
						.addOption('standard-arrow',   '↑ / ↓  Standard arrows')
						.addOption('chevron',          '∧ / ∨  Chevrons')
						.addOption('double-chevron',   '⇑ / ⇓  Double chevrons')
						.addOption('custom',           'Custom characters')
						.setValue(this.plugin.settings.arrowStyle)
						.onChange(async v => { this.plugin.settings.arrowStyle = v; await this.plugin.saveSettings(); this.display(); }));
				if (this.plugin.settings.arrowStyle === 'custom') {
					new Setting(as).setName('Top char').addText(t => t.setValue(this.plugin.settings.customArrowTop).onChange(async v => { this.plugin.settings.customArrowTop = v || '^'; await this.plugin.saveSettings(); }));
					new Setting(as).setName('Bottom char').addText(t => t.setValue(this.plugin.settings.customArrowBottom).onChange(async v => { this.plugin.settings.customArrowBottom = v || 'v'; await this.plugin.saveSettings(); }));
				}
				this.numInput(as, 'Arrow count', 'Number per row (1–10).', 'arrowCount', 1, 10);
				this.slider(as, 'Arrow scale', 'Size multiplier.', 'arrowScale', 0.5, 3, 0.1);
				this.toggle(as, 'Cap the line ends',
					'An arrow at each end of the separator line, in the same style as the row.',
					'arrowLineEnds');
			}

			this.label(ls, 'Separator line');
			new Setting(ls).setName('Line style')
				.addDropdown(d => d
					.addOption('none',   'None (hidden)')
					.addOption('solid',  'Solid ——')
					.addOption('dashed', 'Dashed - - -')
					.addOption('dotted', 'Dotted · · ·')
					.addOption('double', 'Double ═══')
					.setValue(this.plugin.settings.separatorStyle)
					.onChange(async v => { this.plugin.settings.separatorStyle = v; await this.plugin.saveSettings(); }));
			this.slider(ls, 'Line weight', 'Thickness (1–8 px).', 'separatorWeight', 1, 8, 1);

			this.label(ls, 'Colors');
			ls.createEl('p', { text: 'Dark and light variants switch automatically with your theme.', cls: 'ws-settings-note' });
			this.label(ls, 'Dark theme');
			const cdk = this.sub(ls);
			new Setting(cdk).setName('Arrows color').addColorPicker(cp => cp.setValue(this.plugin.settings.arrowDarkColor).onChange(async v => { this.plugin.settings.arrowDarkColor = v; await this.plugin.saveSettings(); }));
			new Setting(cdk).setName('Separator line color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineDarkColor).onChange(async v => { this.plugin.settings.lineDarkColor = v; await this.plugin.saveSettings(); }));
			this.label(ls, 'Light theme');
			const clt = this.sub(ls);
			new Setting(clt).setName('Arrows color').addColorPicker(cp => cp.setValue(this.plugin.settings.arrowLightColor).onChange(async v => { this.plugin.settings.arrowLightColor = v; await this.plugin.saveSettings(); }));
			new Setting(clt).setName('Separator line color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineLightColor).onChange(async v => { this.plugin.settings.lineLightColor = v; await this.plugin.saveSettings(); }));
		}
	}

	// ── Retro Bar tab ──────────────────────────────────────────────────────────
	displayRetroBarTab(containerEl) {
		new Setting(containerEl)
			.setName('Retro status bar')
			.setDesc('Fixed retro-styled bar at the bottom. Auto-hides the native status bar while active.')
			.addToggle(t => t.setValue(this.plugin.settings.enableRetroStatus)
				.onChange(async v => {
					this.plugin.settings.enableRetroStatus = v;
					this.plugin.updateStatusBar();
					this.plugin.updateRetroStatusBar();
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.enableRetroStatus) {
			const rb = this.sub(containerEl);

			this.label(rb, 'Format');
			rb.createEl('p', {
				text: 'Tokens: {file} {words} {chars} {paragraph} {goal} {mode} {readtime} {time} {date} {battery} {caps} {num} {vim}\n'
					+ 'Buttons: {syntax} {writechecks} {markers} {font} {report} {filegoal} {foldergoal}',
				cls: 'ws-settings-note'
			});
			new Setting(rb).setName('Rows').setDesc('Stacked lines, each with left, center and right slots.')
				.addSlider(sl => sl.setLimits(1, 3, 1)
					.setValue(Math.max(1, Math.min(3, this.plugin.settings.statusBarRows || 1)))
					.setDynamicTooltip()
					.onChange(async v => {
						this.plugin.settings.statusBarRows = v;
						await this.plugin.saveSettings();
						this.display();
					}));

			const rows = this.plugin.getStatusRows();
			const SLOTS = [
				['left',   'Left',   'Aligned to the left edge.'],
				['center', 'Center', 'Centered in the row.'],
				['right',  'Right',  'Aligned to the right edge.']
			];
			rows.forEach((row, i) => {
				if (rows.length > 1) this.label(rb, 'Row ' + (i + 1));
				const fmt = this.sub(rb);
				SLOTS.forEach(slot => {
					new Setting(fmt).setName(slot[1]).setDesc(slot[2])
						.addText(t => t.setPlaceholder('e.g. {file}')
							.setValue(row[slot[0]])
							.onChange(async v => {
								this.plugin.settings.statusRows[i][slot[0]] = v;
								await this.plugin.saveSettings();
							}));
				});
			});
			// ── Appearance ────────────────────────────────────────────────
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Appearance');
			const ap = this.sub(rb);
			this.slider(ap, 'Font size',  'Text size in the bar (8\u201324 px).', 'statusBarFontSize', 8, 24, 1);
			this.slider(ap, 'Row height', 'Height of one row (20\u201360 px). The bar is this tall per row.',
				'statusBarHeight', 20, 60, 1);
			this.slider(ap, 'Padding top', 'Space above the rows (0\u201324 px).',
				'statusBarPadTop', 0, 24, 1);
			this.slider(ap, 'Padding bottom', 'Space below the rows (0\u201324 px).',
				'statusBarPadBottom', 0, 24, 1);

			this.label(ap, 'Top border');
			const bd = this.sub(ap);
			new Setting(bd).setName('Line style')
				.addDropdown(d => d
					.addOption('none',   'None')
					.addOption('solid',  'Solid')
					.addOption('dashed', 'Dashed')
					.addOption('dotted', 'Dotted')
					.addOption('double', 'Double')
					.addOption('groove', 'Groove')
					.addOption('ridge',  'Ridge')
					.setValue(this.plugin.settings.statusBarBorderStyle || 'solid')
					.onChange(async v => {
						this.plugin.settings.statusBarBorderStyle = v;
						await this.plugin.saveSettings();
						this.display();
					}));
			if ((this.plugin.settings.statusBarBorderStyle || 'solid') !== 'none') {
				this.slider(bd, 'Line weight', 'Thickness (1\u20138 px).', 'statusBarBorderWidth', 1, 8, 1);
			}


			// ── Goals ─────────────────────────────────────────────────────
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Goal gauges');
			const gs = this.sub(rb);
			gs.createEl('p', {
				text: 'Three goals, drawn the same way. Click any of them in the bar to set '
					+ 'its target \u2014 including the writing goal, which is why there is no '
					+ 'number to type here.',
				cls: 'ws-settings-note'
			});

			new Setting(gs).setName('Label')
				.setDesc('Shown beside the gauge \u2014 a vertical bar has no inside.')
				.addDropdown(d => d
					.addOption('percent',  'Percentage  42%')
					.addOption('fraction', 'Fraction  420/1,000')
					.addOption('none',     'Gauge only')
					.setValue(this.plugin.settings.goalLabelMode || 'percent')
					.onChange(async v => { this.plugin.settings.goalLabelMode = v; await this.plugin.saveSettings(); }));

			new Setting(gs).setName('Orientation')
				.setDesc('Horizontal gauges carry their label inside; vertical ones beside.')
				.addDropdown(d => d
					.addOption('vertical',   'Vertical, fills upward')
					.addOption('horizontal', 'Horizontal, fills rightward')
					.setValue(this.plugin.settings.goalOrientation || 'vertical')
					.onChange(async v => {
						this.plugin.settings.goalOrientation = v;
						await this.plugin.saveSettings();
						this.display();
					}));

			this.slider(gs, 'Thickness', 'Gauge thickness for all three (1\u201316).',
				'goalRingWeight', 1, 16, 1);

			this.toggle(gs, 'Show the gauge',
				'Off, only the label is shown \u2014 no bar at all.',
				'goalShowGauge', () => this.display());

			if (this.plugin.settings.goalShowGauge !== false &&
				(this.plugin.settings.goalOrientation || 'vertical') === 'horizontal') {
				this.label(gs, 'Lengths');
				const gl = this.sub(gs);
				gl.createEl('p', {
					text: 'Each gauge can run a different length \u2014 a folder target usually wants '
						+ 'more room than a note one.',
					cls: 'ws-settings-note'
				});
				this.slider(gl, 'Writing goal', '', 'goalLenWriting', 30, 220, 5);
				this.slider(gl, 'File goal',    '', 'goalLenFile',    30, 220, 5);
				this.slider(gl, 'Folder goal',  '', 'goalLenFolder',  30, 220, 5);
			}

			this.toggle(gs, 'Custom colours',
				'Off, all three take the bar\u2019s own text colour.',
				'goalCustomColors', () => this.display());
			if (this.plugin.settings.goalCustomColors) {
				const gc = this.sub(gs);
				this.colorRow(gc, 'Writing goal', '{goal}',       'goalColor');
				this.colorRow(gc, 'File goal',    '{filegoal}',   'fileGoalColor');
				this.colorRow(gc, 'Folder goal',  '{foldergoal}', 'folderGoalColor');
			}

			gs.createEl('p', {
				text: 'File and folder targets are set from the bar rather than here \u2014 they belong '
					+ 'to a particular note or folder, not to the vault.',
				cls: 'ws-settings-note'
			});

			// ── Token formats ─────────────────────────────────────────────
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Token formats');
			const tf = this.sub(rb);
			new Setting(tf).setName('{file}').setDesc('Full path, or the file name on its own.')
				.addDropdown(d => d
					.addOption('path', 'Full path  ~/folder/note')
					.addOption('name', 'File name only  note')
					.setValue(this.plugin.settings.fileTokenFormat || 'path')
					.onChange(async v => {
						this.plugin.settings.fileTokenFormat = v;
						await this.plugin.saveSettings();
						this.plugin.updateRetroStatusBar();
					}));
			this.numInput(tf, '{readtime}', 'Words per minute it divides by.', 'readTimeWpm', 50, 1000);
			
			const df = this.sub(tf);
			const preview = df.createEl('code');
			const refreshPreview = () => preview.setText(this.plugin.formatDate(new Date()));
			new Setting(df).setName('Format string').setDesc('Tokens: dd  mm  yy  yyyy')
				.addText(t => {
					t.setPlaceholder('dd/mm/yyyy').setValue(this.plugin.settings.dateFormat);
					t.onChange(async v => { this.plugin.settings.dateFormat = v || 'dd/mm/yyyy'; await this.plugin.saveSettings(); refreshPreview(); });
				});
			const fmtRow = df.createEl('div', { cls: 'ws-fmt-row' });
			for (const fmt of ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd.mm.yy', 'dd-mm-yyyy', 'yyyy/mm/dd']) {
				const btn = fmtRow.createEl('button', { text: fmt });
				btn.addEventListener('click', async () => { this.plugin.settings.dateFormat = fmt; await this.plugin.saveSettings(); this.display(); });
			}
			df.createEl('small', { text: 'Preview: ' }).appendChild(preview);
			refreshPreview();

			// ── Colours ───────────────────────────────────────────────────
			// Last, and at group level: sitting mid-tab with an expanding
			// toggle, everything after it read as nested underneath.
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Colours');
			rb.createEl('p', { text: 'Dark and light variants switch automatically with your theme.', cls: 'ws-settings-note' });

			this.toggle(rb, 'Custom colours',
				'Off, the bar follows your theme.',
				'retroCustomColors', () => this.display());
			if (!this.plugin.settings.retroCustomColors) return;

			this.label(rb, 'Dark theme');
			const dk = this.sub(rb);
			new Setting(dk).setName('Bar background').addColorPicker(cp => cp.setValue(this.plugin.settings.retroDarkBgColor).onChange(async v => { this.plugin.settings.retroDarkBgColor = v; await this.plugin.saveSettings(); }));
			new Setting(dk).setName('Bar text / accent').addColorPicker(cp => cp.setValue(this.plugin.settings.retroDarkTextColor).onChange(async v => { this.plugin.settings.retroDarkTextColor = v; await this.plugin.saveSettings(); }));

			this.label(rb, 'Light theme');
			const lt = this.sub(rb);
			new Setting(lt).setName('Bar background').addColorPicker(cp => cp.setValue(this.plugin.settings.retroLightBgColor).onChange(async v => { this.plugin.settings.retroLightBgColor = v; await this.plugin.saveSettings(); }));
			new Setting(lt).setName('Bar text / accent').addColorPicker(cp => cp.setValue(this.plugin.settings.retroLightTextColor).onChange(async v => { this.plugin.settings.retroLightTextColor = v; await this.plugin.saveSettings(); }));
		}
	}

	// ── Syntax tab ────────────────────────────────────────────────────────────
	displaySyntaxTab(containerEl) {
		const s = this.plugin.settings;

		containerEl.createEl('p', {
			text: 'Colour words by grammatical class, and flag the patterns worth a second look. '
				+ 'Everything runs on your machine \u2014 no network, no API, no data leaves the vault. '
				+ 'The tagger is a heuristic, so treat a mark as a prompt, not a verdict.',
			cls: 'ws-settings-note'
		});

		this.toggle(containerEl, 'Skip code and math',
			'Leave code, frontmatter and math unmarked. Applies to both groups below.',
			'syntaxSkipCode');

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// ── Word classes ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Syntax highlight')
			.setDesc('Colour words by grammatical class.')
			.addToggle(t => t.setValue(s.posEnabled)
				.onChange(async v => {
					s.posEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (s.posEnabled) {
			const ps = this.sub(containerEl);

			new Setting(ps).setName('Display style')
				.setDesc('How a coloured word is drawn.')
				.addDropdown(d => d
					.addOption('text',      'Coloured text')
					.addOption('highlight', 'Highlight')
					.addOption('squiggle',  'Squiggle')
					.addOption('line',      'Underline')
					.setValue(s.syntaxStyle || 'text')
					.onChange(async v => { s.syntaxStyle = v; await this.plugin.saveSettings(); }));

			ps.createEl('p', {
				text: 'One class at a time reads best. Everything at once is a rainbow.',
				cls: 'ws-settings-note'
			});
			this.catRow(ps, 'Nouns',        'Nouns and pronouns.',                  'posNoun',        'posNounColor');
			this.catRow(ps, 'Verbs',        'Verbs, auxiliaries and modals.',       'posVerb',        'posVerbColor');
			this.catRow(ps, 'Adjectives',   'Adjectives. Articles are excluded.',   'posAdjective',   'posAdjectiveColor');
			this.catRow(ps, 'Adverbs',      'All adverbs, including not and very.', 'posAdverb',      'posAdverbColor');
			this.catRow(ps, 'Conjunctions', 'Conjunctions and prepositions.',       'posConjunction', 'posConjunctionColor');
			this.toggle(ps, 'Mute everything else',
				'Fade everything outside the selected classes.', 'posDimOthers');
		}

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// ── Writing checks ────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Writing checks')
			.setDesc('Patterns worth rereading, not errors.')
			.addToggle(t => t.setValue(s.checksEnabled)
				.onChange(async v => {
					s.checksEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (!s.checksEnabled) return;

		const ck = this.sub(containerEl);
		new Setting(ck).setName('Display style')
			.setDesc('Drawn separately from the word classes above.')
			.addDropdown(d => d
				.addOption('squiggle',  'Squiggle')
				.addOption('line',      'Underline')
				.addOption('highlight', 'Highlight')
				.addOption('text',      'Coloured text')
				.setValue(s.checkStyle || 'squiggle')
				.onChange(async v => { s.checkStyle = v; await this.plugin.saveSettings(); }));

		this.catRow(ck, 'Filler words',
			'Hedges and intensifiers: very, really, basically, "kind of", "in order to".',
			'checkFiller', 'checkFillerColor');
		this.catRow(ck, 'Passive voice',
			'A form of "to be" plus a past participle \u2014 "was written", "is being considered".',
			'checkPassive', 'checkPassiveColor');
		this.catRow(ck, 'Lexical illusions',
			'The same word twice in a row. The eye skips them, which is why they survive proofreading.',
			'checkIllusion', 'checkIllusionColor');
		this.catRow(ck, 'Commonly misused',
			'Pairs people reach for the wrong half of: affect/effect, its/it\u2019s, fewer/less.',
			'checkMisused', 'checkMisusedColor');
		this.catRow(ck, 'Loose pronouns',
			'A pronoun opening a sentence, where the reader has to guess what it points at.',
			'checkPronoun', 'checkPronounColor');

		new Setting(ck).setName('Sentence rhythm')
			.setDesc('Tint sentences by reading difficulty. Always a background tint \u2014 a squiggle under thirty words is noise.')
			.addColorPicker(cp => cp.setValue(s.checkRhythmHardColor)
				.onChange(async v => { s.checkRhythmHardColor = v; await this.plugin.saveSettings(); }))
			.addColorPicker(cp => cp.setValue(s.checkRhythmVeryHardColor)
				.onChange(async v => { s.checkRhythmVeryHardColor = v; await this.plugin.saveSettings(); }))
			.addToggle(t => t.setValue(s.checkRhythm)
				.onChange(async v => { s.checkRhythm = v; await this.plugin.saveSettings(true); this.display(); }));
		if (s.checkRhythm) {
			const rh = this.sub(ck);
			this.slider(rh, 'Hard above grade', 'Flesch\u2013Kincaid grade for the first tint.', 'checkRhythmHardGrade', 6, 16, 1);
			this.slider(rh, 'Very hard above',  'And for the second.', 'checkRhythmVeryHardGrade', 8, 22, 1);
		}

		this.catRow(ck, 'Repetition radar',
			'The same uncommon word used twice close together \u2014 the echo you write and never see.',
			'checkRepetition', 'checkRepetitionColor');
		if (s.checkRepetition) {
			const rp = this.sub(ck);
			this.slider(rp, 'Window', 'How many words apart still counts as an echo.', 'repetitionWindow', 15, 150, 5);
			this.slider(rp, 'Minimum length', 'Ignore words shorter than this.', 'repetitionMinLength', 3, 10, 1);
		}

		ck.createEl('p', {
			text: 'Add {report} to the retro bar for full counts.',
			cls: 'ws-settings-note'
		});
	}

	// ── Hemingway tab (write-forward lock) ────────────────────────────────────
	displayHemingwayTab(containerEl) {
		const s = this.plugin.settings;

		containerEl.createEl('p', {
			text: 'Blocks the keys you use to go back and revise, so a draft can only move forward. '
				+ 'Nothing is permanent — switch it off here or with the "Hemingway mode" command at any time.',
			cls: 'ws-settings-note'
		});

		new Setting(containerEl)
			.setName('Hemingway mode')
			.setDesc('Lock the editor to typing forward.')
			.addToggle(t => t.setValue(s.hemingwayEnabled)
				.onChange(async v => {
					s.hemingwayEnabled = v;
					await this.plugin.saveSettings(true);   // a lock should land now, not in 120ms
					this.display();
				}));

		if (!s.hemingwayEnabled) return;

		const h = this.sub(containerEl);

		this.label(h, 'Removing text');
		this.toggle(h, 'Block backspace',     'And the word- and line-delete variants.', 'hemBlockBackspace');
		this.toggle(h, 'Block delete',        'Forward delete.',                                    'hemBlockDelete');
		this.toggle(h, 'Block undo and redo', 'Including from the Edit menu.',       'hemBlockUndo');
		this.toggle(h, 'Block cut',           'Keyboard, menu and right-click.',               'hemBlockCut');
		this.toggle(h, 'Block paste',         'Off by default — pasting a quote or a note is not self-editing.', 'hemBlockPaste');

		this.label(h, 'Moving the cursor');
		this.toggle(h, 'Block arrow keys',    'All four, including shift-selection.',    'hemBlockArrows');
		this.toggle(h, 'Block jump keys',     'Home, End, Page Up, Page Down.',                  'hemBlockJumpKeys');
		this.toggle(h, 'Block select all',    'A selection is one keystroke from a rewrite.',  'hemBlockSelectAll');
		this.toggle(h, 'Block mouse',         'Caret clicks, right-click and text dragging. Clicking into an unfocused editor still works.', 'hemBlockMouse');

		this.label(h, 'Feedback');
		new Setting(h).setName('Flash when blocked')
			.setDesc('Where to show that a key was refused. The badge option needs {mode} in the bar.')
			.addDropdown(d => d
				.addOption('none',     'None')
				.addOption('icon',     'The H badge only')
				.addOption('retrobar', 'Retro bar')
				.addOption('screen',   'Screen')
				.addOption('both',     'Screen and bar')
				.setValue(this.plugin.settings.hemFlashTarget || 'screen')
				.onChange(async v => { this.plugin.settings.hemFlashTarget = v; await this.plugin.saveSettings(); }));

		h.createEl('p', {
			text: 'The H badge in {mode} shows the lock while it is on.',
			cls: 'ws-settings-note'
		});
	}

	// ── Text Options tab (text options + typography + word counts) ────────────
	displayTextTab(containerEl) {
		new Setting(containerEl)
			.setName('Text options')
			.setDesc('Paragraph indent, line spacing, justification, and sidebar word counts.')
			.addToggle(t => t.setValue(this.plugin.settings.miscEnabled)
				.onChange(async v => { this.plugin.settings.miscEnabled = v; await this.plugin.saveSettings(); this.display(); }));

		if (this.plugin.settings.miscEnabled) {
			const mc = this.sub(containerEl);

			this.slider(mc, 'Horizontal padding', 'Left/right text padding inside the editor. Applies everywhere — not just zen mode.', 'editorPaddingH', 0, 400, 10);

			this.toggle(mc, 'Paragraph indent', 'Indent the first line of paragraphs.', 'enableParagraphIndent', () => this.display());
			if (this.plugin.settings.enableParagraphIndent) {
				const pi = this.sub(mc);
				new Setting(pi).setName('Indent trigger')
					.addDropdown(d => d
						.addOption('double', 'Blank line (double Enter)')
						.addOption('single', 'Every line (single Enter)')
						.setValue(this.plugin.settings.paragraphIndentMode || 'double')
						.onChange(async v => { this.plugin.settings.paragraphIndentMode = v; await this.plugin.saveSettings(); }));
				this.slider(pi, 'Indent size (em)', 'Width of the indent.', 'paragraphIndentEm', 0.5, 8, 0.5);
			}
			this.toggle(mc, 'Limit line length',
				'Fix the text column width regardless of window size.',
				'limitLineLength', () => this.display());
			if (this.plugin.settings.limitLineLength) {
				this.numInput(this.sub(mc), 'Characters per line',
					'Character widths (20\u2013200). 64 suits prose.',
					'maxLineChars', 20, 200);
			}

			new Setting(mc).setName('Line spacing').setDesc('Line height multiplier (e.g. 1, 1.5, 2).')
				.addText(t => {
					t.inputEl.type = 'number'; t.inputEl.min = '0.8'; t.inputEl.max = '4'; t.inputEl.step = '0.1'; t.inputEl.addClass('ws-num-input');
					t.setValue(String(this.plugin.settings.lineSpacing != null ? this.plugin.settings.lineSpacing : 1.5));
					t.onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0.8 && n <= 4) { this.plugin.settings.lineSpacing = n; await this.plugin.saveSettings(); } });
				});
			this.toggle(mc, 'Justify text', 'Full-justify paragraph text in both editing and reading views.', 'justifyText');

			this.label(mc, 'Hidden markers');
			this.toggle(mc, 'Show hidden markers', 'Reveal invisible whitespace and line breaks in the editor.', 'showHiddenMarkers', () => this.display());
			if (this.plugin.settings.showHiddenMarkers) {
				const hm = this.sub(mc);
				this.toggle(hm, 'Spaces', 'Mark every space with a middle dot (·).', 'markSpaces');
				this.toggle(hm, 'Tabs', 'Mark every tab with an arrow (→).', 'markTabs');
				this.toggle(hm, 'Paragraphs', 'Mark blank (paragraph-break) lines with a pilcrow (¶).', 'markParagraphs');
				this.toggle(hm, 'End of lines', 'Mark the end of every line with a return arrow (↵).', 'markEndOfLines');
			}

		}

		// Typography is its own master toggle, not a text option: it rewrites
		// the document as you type, where everything above only restyles it.
		containerEl.createEl('hr', { cls: 'ws-settings-hr' });
		this.renderTypographySection(containerEl);
	}
	// ── Misc tab ──────────────────────────────────────────────────────────────
	displayMiscTab(containerEl) {
		this.label(containerEl, 'Word goals');
		containerEl.createEl('p', {
			text: 'The writing goal counts across every note since it was last rebased. '
				+ 'File and folder goals count words against a target, with no baseline.',
			cls: 'ws-settings-note'
		});

		const g = this.sub(containerEl);
		new Setting(g).setName('Writing goal')
			.setDesc('Target for {goal}.')
			.addText(t => {
				t.inputEl.type = 'number'; t.inputEl.min = '1'; t.inputEl.addClass('ws-num-input');
				t.setValue(String(this.plugin.settings.goalTarget || 1000));
				t.onChange(async v => {
					const n = parseInt(v, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.goalTarget = n;
						await this.plugin.saveSettings();
					}
				});
			});

		this.renderGoalList(g, 'file',   'File goals',   'Add note');
		this.renderGoalList(g, 'folder', 'Folder goals', 'Add folder');

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		this.label(containerEl, 'Word counts');
		this.toggle(containerEl, 'File tree counts',
			'Word count per note in the file explorer, summed into folders.',
			'enableFileTreeCounts', () => this.display());
		this.toggle(containerEl, 'Outline counts',
			'Word count per heading in the outline panel.',
			'enableOutlineCounts', () => this.display());
	}

	// One list per kind. Each row is a path, its target, and a way to drop it —
	// the same targets the bar tokens set when you click them.
	renderGoalList(parent, kind, title, addLabel) {
		const store = kind === 'folder' ? 'folderGoals' : 'fileGoals';
		const s = this.plugin.settings;
		if (!s[store]) s[store] = {};
		const paths = Object.keys(s[store]).sort();

		const head = new Setting(parent).setName(title)
			.setDesc(paths.length
				? paths.length + (paths.length === 1 ? ' target set.' : ' targets set.')
				: 'None yet. They can also be set by clicking the token in the bar.');

		if (WsPathSuggestModal) {
			head.addButton(b => b.setButtonText(addLabel).onClick(() => this.pickGoalPath(kind)));
		}

		if (!paths.length) return;

		const list = parent.createEl('div', { cls: 'ws-scope-list' });
		for (const path of paths) {
			const row = list.createEl('div', { cls: 'ws-scope-row' });
			row.createEl('span', {
				cls: 'ws-scope-path' + (kind === 'folder' ? ' is-folder' : ''),
				text: path === '/' ? 'Vault root' : path
			});

			const num = row.createEl('input', { cls: 'ws-goal-input' });
			num.type = 'number';
			num.min = '1';
			num.value = String(s[store][path]);
			num.addEventListener('change', async () => {
				const n = parseInt(num.value, 10);
				if (!isNaN(n) && n > 0) s[store][path] = n;
				else delete s[store][path];
				this.plugin._folderWordCache = null;
				await this.plugin.saveSettings(true);
				this.display();
			});

			const del = row.createEl('button', { cls: 'ws-scope-remove', text: '\u00d7' });
			del.setAttribute('aria-label', 'Remove the goal for ' + path);
			del.addEventListener('click', async () => {
				delete s[store][path];
				this.plugin._folderWordCache = null;
				await this.plugin.saveSettings(true);
				this.display();
			});
		}
	}

	pickGoalPath(kind) {
		if (!WsPathSuggestModal) return;
		const store = kind === 'folder' ? 'folderGoals' : 'fileGoals';
		const s = this.plugin.settings;
		const have = new Set(Object.keys(s[store] || {}));
		let items;
		if (kind === 'folder') {
			items = this.app.vault.getAllLoadedFiles()
				.filter(f => f && (TFolder ? f instanceof TFolder : f.children !== undefined))
				.map(f => f.path)
				.filter(p => p && p !== '/' && !have.has(p));
			if (!have.has('/')) items.unshift('/');
		} else {
			items = this.app.vault.getMarkdownFiles().map(f => f.path).filter(p => !have.has(p));
		}
		if (!items.length) return;
		new WsPathSuggestModal(this.app, items,
			kind === 'folder' ? 'Choose a folder\u2026' : 'Choose a note\u2026',
			async (picked) => {
				if (!s[store]) s[store] = {};
				// A sensible starting number, editable in the row that appears.
				s[store][picked] = s.goalTarget || 1000;
				this.plugin._folderWordCache = null;
				await this.plugin.saveSettings(true);
				this.display();
			}).open();
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	sub(root) {
		return root.createEl('div', { cls: 'ws-settings-sub' });
	}

	label(root, text) {
		root.createEl('p', { text, cls: 'ws-settings-label' });
	}

	renderTypographySection(containerEl) {
		const s = this.plugin.settings;

		new Setting(containerEl)
			.setName('Typography')
			.setDesc('Replace typed shorthand with real characters. Undo restores what you typed.')
			.addToggle(t => t.setValue(s.typographyEnabled)
				.onChange(async v => {
					s.typographyEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (!s.typographyEnabled) return;

		const ty = this.sub(containerEl);
		ty.createEl('p', {
			text: 'Never applies inside code, math or frontmatter.',
			cls: 'ws-settings-note'
		});

		this.toggle(ty, 'Curly quotes', 'Straight quotes become curly. Apostrophes too: don\u2019t.',
			'typoSmartQuotes', () => this.display());
		if (s.typoSmartQuotes) {
			const q = this.sub(ty);
			this.toggle(q, 'Choose the characters',
				'Off, the English convention is used. On, pick your own \u2014 useful for German, French or Hebrew quoting.',
				'typoCustomQuotes', () => this.display());
			if (s.typoCustomQuotes) {
				const qc = this.sub(q);
				const charRow = (name, desc, key) => new Setting(qc).setName(name).setDesc(desc)
					.addText(t => {
						t.inputEl.addClass('ws-char-input');
						t.setValue(s[key] || '').onChange(async v => {
							s[key] = v; await this.plugin.saveSettings();
						});
					});
				charRow('Open double',  'Replaces " at the start of a quotation.', 'typoOpenDouble');
				charRow('Close double', 'Replaces " at the end.',                  'typoCloseDouble');
				charRow('Open single',  'Replaces the straight single quote at the start.', 'typoOpenSingle');
				charRow('Close single', 'And at the end.',                         'typoCloseSingle');
				charRow('Apostrophe',   'Used mid-word, where it is not a quote at all.',   'typoApostrophe');
			}
		}
		this.toggle(ty, 'Ellipsis',      '... becomes \u2026', 'typoEllipsis');
		this.toggle(ty, 'Dashes',        '-- \u2192 \u2013, --- \u2192 \u2014, ---- backs out to literal.', 'typoDashes');
		this.toggle(ty, 'Arrows',        '-> \u2192, <- \u2190, => \u21d2', 'typoArrows');
		this.toggle(ty, 'Comparisons',   '<= \u2264, >= \u2265, /= \u2260. Collides with <= in code.', 'typoComparisons');
		this.toggle(ty, 'Guillemets',    '<< \u00ab and >> \u00bb', 'typoGuillemets');
		this.toggle(ty, 'Fractions',     '1/2 \u00bd, 3/4 \u00be, and the rest.', 'typoFractions');
	}

	// A colour picker with no toggle beside it.
	colorRow(c, name, desc, colorKey) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addColorPicker(cp => cp.setValue(this.plugin.settings[colorKey])
				.onChange(async v => { this.plugin.settings[colorKey] = v; await this.plugin.saveSettings(); }));
	}

	// One row carrying both a colour picker and an on/off toggle — used by the
	// prose tab, where every category needs both and a row each would double
	// the tab's height.
	catRow(c, name, desc, onKey, colorKey) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addColorPicker(cp => cp.setValue(this.plugin.settings[colorKey])
				.onChange(async v => { this.plugin.settings[colorKey] = v; await this.plugin.saveSettings(); }))
			.addToggle(t => t.setValue(this.plugin.settings[onKey])
				.onChange(async v => { this.plugin.settings[onKey] = v; await this.plugin.saveSettings(); }));
	}

	toggle(c, name, desc, key, cb) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addToggle(t => t.setValue(this.plugin.settings[key]).onChange(async v => {
				this.plugin.settings[key] = v;
				await this.plugin.saveSettings();
				if (cb) cb.call(this, v);
			}));
	}

	slider(c, name, desc, key, min, max, step) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addSlider(s => s.setLimits(min, max, step || 1).setValue(this.plugin.settings[key]).setDynamicTooltip()
				.onChange(async v => { this.plugin.settings[key] = v; await this.plugin.saveSettings(); }));
	}

	numInput(c, name, desc, key, min, max) {
		return new Setting(c).setName(name).setDesc(desc || '')
			.addText(t => {
				t.inputEl.type = 'number'; t.inputEl.min = String(min); t.inputEl.max = String(max); t.inputEl.addClass('ws-num-input');
				t.setValue(String(this.plugin.settings[key]));
				t.onChange(async v => { const n = parseInt(v, 10); if (!isNaN(n) && n >= min && n <= max) { this.plugin.settings[key] = n; await this.plugin.saveSettings(); } });
			});
	}
}
/* nosourcemap */