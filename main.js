'use strict';

// `Platform` is destructured with the rest and used only through
// isMobileApp(), which falls back to the body class: the harness stubs
// `obsidian` with a fixed list of exports, so anything new arrives here as
// `undefined` rather than as a throw, and must be treated as absent.
const { Plugin, PluginSettingTab, Setting, MarkdownView, TFile, TFolder, FuzzySuggestModal, Menu, Modal, Notice, setIcon, Platform } = require('obsidian');

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
		underneath until unto upon within without via per unlike like`);

	add('CONJ', `as and but or nor yet so because although though while whereas
		unless if when whenever wherever whether than plus versus`);

	add('AUX', `am is are was were be been being have has had having do does
		did doing`);

	add('MOD', `will would shall should can could may might must ought`);

	add('TO', 'to');

	// 'one' stays a pronoun; the rest count things. NUM has no highlight
	// bucket, so numbers stay uncoloured — which is itself the point:
	// they stop being mistaken for nouns and verbs around them.
	add('NUM', `two three four five six seven eight nine ten eleven twelve
		thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty
		thirty forty fifty sixty seventy eighty ninety hundred thousand
		million billion dozen`);

	// Adverbs that do not end in -ly, plus the discourse connectives.
	add('ADV', `not never always often sometimes usually rarely seldom very
		quite rather too also just only even still already soon now then here
		there again once twice far away back together apart forward ahead
		almost nearly hardly barely scarcely somewhat somehow perhaps maybe
		indeed instead however therefore thus moreover nevertheless nonetheless
		anyway otherwise meanwhile furthermore hence why how well today
		tomorrow yesterday tonight later earlier ever else rather forth aside
		abroad anymore altogether upward downward inward outward up down out`);

	// Interjections take no highlight at all — "Oh dear!" is neither a
	// noun nor anything else worth a colour.
	add('INTJ', `oh ah aha alas hey hello ha hmm hush wow oops ouch yay
		hurrah phew ugh er um`);

	add('ADJ', `worth dear good bad big small large little old new young long short high
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
		change nothing everything something anything president student
		resident agent parent patient client moment accident incident
		continent talent tenant servant assistant consultant restaurant
		elephant infant merchant giant opponent component ingredient
		event government department apartment argument statement movement
		environment equipment treatment agreement`);

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
		put puts get gets got gotten become becomes became look looks 
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

	// Contracted auxiliaries and modals. The tokenizer keeps apostrophes,
	// so these arrive as single tokens and the plain forms above never
	// match them — without these, "don't" and "i'm" fell through to the
	// suffix rules and tagged as nouns, which broke every context rule
	// keyed on a neighbouring AUX.
	add('AUX', `don't doesn't didn't isn't aren't wasn't weren't hasn't
		haven't hadn't i'm you're we're they're he's she's it's that's
		there's what's here's who's let's i've you've we've they've it'll
		that'll i'll you'll he'll she'll we'll they'll i'd you'd he'd she'd
		we'd they'd`);

	add('MOD', `can't won't wouldn't shouldn't couldn't mustn't needn't
		oughtn't`);
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

// Numbers are tokens too — "the 747 carried 416 passengers" is a
// five-word sentence, not a three-word one, and the rhythm grade was
// quietly wrong on any prose with figures in it. The separator part
// only continues into another digit, so the full stop after "in 1984."
// stays outside the token and sentence detection still sees it.
const WORD_RE = /[A-Za-z][A-Za-z'\u2019-]*|\d+(?:[.,:]\d+)*%?/g;

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

// Adverbs that grade a quality rather than modify an action.
const DEGREE_ADVERBS = new Set(['very', 'so', 'too', 'quite', 'rather',
	'really', 'extremely', 'incredibly', 'terribly', 'awfully', 'fairly',
	'pretty', 'somewhat', 'deeply', 'highly', 'utterly', 'truly',
	'remarkably', 'surprisingly', 'perfectly', 'entirely', 'completely']);

// Words that go flat after a verb — same form as the adjective, adverb
// duty: "ran close", "went straight on", "held tight", "fell hard".
const FLAT_ADVERBS = new Set(['close', 'fast', 'hard', 'tight', 'straight',
	'high', 'low', 'deep', 'long', 'far', 'near', 'early', 'late', 'slow',
	'quick', 'loud', 'wide', 'right', 'wrong', 'first', 'last']);

// Verbs that link a subject to a description rather than an object.
const LINKING_VERBS = new Set(`seem seems seemed appear appears appeared
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
const ABBREVIATIONS = new Set(`mr mrs ms dr prof rev gen sen rep hon st mt
	ft vs etc al cf ca approx dept est fig vol ch pp no op ed inc ltd co
	corp univ assn bros jan feb mar apr jun jul aug sep sept oct nov dec
	mon tue tues wed thu thurs fri sat sun`.split(/\s+/).filter(Boolean));

const SUBJECT_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'who']);

function tagTokens(tokens, text) {
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
		t.tag = lex || dyn || suffixTag(t.lw, t.w, firstInSentence);
		// A sentence ends when the character right after this token is a
		// terminator (the tokenizer never swallows punctuation).
		const after = text.slice(t.to, t.to + 2);
		const ch = after.trim().charAt(0) || '';
		if (!SENT_END.test(ch)) { firstInSentence = false; continue; }
		if (ch !== '.') { firstInSentence = true; continue; }
		const nx = tokens[i + 1];
		firstInSentence = !(ABBREVIATIONS.has(t.lw) || t.lw.length === 1) &&
			(!nx || /^[A-Z]/.test(nx.w));
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
		if (t.tag === 'ADJ' && prev && prev.tag === 'DET' && (!next || next.tag !== 'NOUN')) {
			// leave adjectives that clearly modify something later
			if (!next || (next.tag !== 'ADJ' && next.tag !== 'NOUN')) t.tag = 'NOUN';
		}
		// "to write" → infinitive.
		if (prev && prev.tag === 'TO' && (t.tag === 'NOUN' || t.tag === 'ADJ') && POS_LEX[t.lw] !== 'NOUN') {
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
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next !== undefined &&
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
		// book cover" keep both nouns.
		if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next &&
			(prev.tag === 'DET' || prev.tag === 'ADJ' || prev.tag === 'PREP') && next.tag === 'NOUN') {
			t.tag = 'ADJ';
		}
		// Sentence-initial word followed by a determiner or pronoun, with no
		// lexicon entry claiming it as a noun, is almost always an
		// imperative verb ("Check the file", "Open your notes").
		if (t.first && t.tag === 'NOUN' && !POS_LEX[t.lw] && next &&
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

// Hedges and intensifiers — filler in any register, always flagged.
const FILLER_STRONG = new Set(`very really quite rather somewhat fairly pretty
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
const FILLER_SOFT = new Set(`almost nearly roughly approximately several
	various numerous many most some few much lots often sometimes frequently
	occasionally usually generally typically relatively significantly
	substantially considerably slightly marginally overall largely mostly
	partly rarely`.split(/\s+/).filter(Boolean));

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
	"isn't", "aren't", "wasn't", "weren't", 'get', 'gets', 'got', 'getting',
	// Contractions that can only be "be". The 's forms stay out: "he's
	// taken" is usually "he has taken" — perfect tense, active — and
	// flagging it would be wrong more often than right.
	"i'm", "you're", "we're", "they're"]);

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

// Participles that are almost always predicate adjectives after a be-form:
// "she was tired", "we're excited", "he got dressed" are states, not
// passives. A following "by" reinstates the flag — an explicit agent
// ("was surprised by the news") is passive enough to look at. "used" and
// "broken" are deliberately absent: "the tool was used" and "the window
// was broken" are the genuine article.
// States that never take an agent, so even a following "by" is temporal
// or spatial ("was gone by midnight", "was born by the river") and must
// not re-flag them the way it re-flags "was worried by the news".
const AGENTLESS_STATES = new Set(['gone', 'born']);

const PARTICIPLE_ADJECTIVES = new Set(`tired excited interested worried
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

function findPassive(tokens) {
	const hits = [];
	const skippable = t => t.tag === 'ADV' || isLyAdverb(t) || t.lw === 'been' || t.lw === 'being';
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
function findIllusions(tokens) {
	const hits = [];
	for (let i = 1; i < tokens.length; i++) {
		if (tokens[i].lw !== tokens[i - 1].lw) continue;
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
const MISUSED_ALWAYS = new Set(['alot', 'irregardless', 'supposably',
	'definately', 'seperate', 'occured', 'untill', 'recieve', 'alright']);

// s-final nouns that are not plurals, so "less" before them stays legal.
const MASS_S_NOUNS = new Set(['news', 'means', 'series', 'species',
	'physics', 'economics', 'politics', 'mathematics', 'ethics',
	'linguistics', 'measles', 'diabetes', 'chaos', 'gas', 'lens',
	'progress', 'los', 'las']);

const COMPARATIVES = new Set(['more', 'less', 'fewer', 'better', 'worse',
	'rather', 'other', 'greater', 'higher', 'lower', 'larger', 'smaller',
	'bigger', 'older', 'younger', 'faster', 'slower', 'stronger', 'weaker',
	'earlier', 'later', 'longer', 'shorter', 'easier', 'harder', 'sooner',
	'farther', 'further', 'closer', 'cheaper', 'deeper', 'wider']);

function findMisused(tokens) {
	const hits = [];
	const flag = (a, b) => hits.push({ from: a.from, to: (b || a).to });
	for (let i = 0; i < tokens.length; i++) {
		const t  = tokens[i];
		const p  = i > 0 ? tokens[i - 1] : null;
		const n  = i + 1 < tokens.length ? tokens[i + 1] : null;
		const lw = t.lw, nl = n ? n.lw : '', pl = p ? p.lw : '';

		if (MISUSED_ALWAYS.has(lw)) { flag(t); continue; }

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

// A pronoun opening a sentence usually points at the previous one, and the
// reader has to guess which part. Mid-sentence pronouns are left alone.
const VAGUE_PRONOUNS = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'them', 'there']);

// ...but "This chapter shows" and "Those results held" are determiners
// with the referent standing right next to them — nothing loose there.
function isVaguePronoun(t, next) {
	if (!t.first || !VAGUE_PRONOUNS.has(t.lw)) return false;
	if ((t.lw === 'this' || t.lw === 'that' || t.lw === 'these' || t.lw === 'those') &&
		next && (next.tag === 'NOUN' || next.tag === 'ADJ' || next.tag === 'NUM')) return false;
	return true;
}

// ── Readability ──────────────────────────────────────────────────────────────

// Syllable counting by the standard heuristic: strip silent endings, then
// count vowel groups. Wrong on a minority of words ("fire", "poem"), which is
// fine — Flesch–Kincaid averages over a whole document and the error washes
// out long before it moves the grade.
function countSyllables(word) {
	let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
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
		if (to <= from) continue;
		// Merge with the previous segment when the split was a false one:
		// the previous "sentence" ended in an abbreviation, an initial or a
		// decimal ("Dr.", "J.", "3."), or this one opens in lowercase — a
		// capital letter is what an actual sentence start looks like.
		// Splitting at "Dr. Smith" halves the sentence and halves the
		// rhythm grade with it.
		const prev = out.length ? out[out.length - 1] : null;
		if (prev) {
			const tail = text.slice(prev.from, prev.to);
			const am   = /([A-Za-z]+)\.$/.exec(tail);
			const falseEnd = (am && (am[1].length === 1 || ABBREVIATIONS.has(am[1].toLowerCase()))) ||
				/\d\.$/.test(tail) || /^[a-z0-9]/.test(raw.trim());
			if (falseEnd) {
				prev.to   = to;
				prev.text = text.slice(prev.from, to).trim();
				continue;
			}
		}
		out.push({ from, to, text: raw.trim() });
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

// Powerline separator shapes, chosen per boundary by the character used to
// divide the row. The divider you type IS the shape:
//
//   >   arrow        )   rounded
//   |   straight     /   angle, cutting up to the right
//                    \   angle, cutting down to the right
//
// A backslash immediately followed by one of these is an escape, so \| is a
// literal pipe and a lone \ between spaces is still a divider.
// Reading speed for {readtime}. Fixed, not a setting: 200 wpm is the standard
// silent-reading estimate for adult prose, and it is not a number anyone has
// a calibrated opinion about.
const READ_WPM = 200;

// How many addressable colours each row offers. Backgrounds carry the
// palette, so there are more of them; text on a coloured block only needs a
// light, a dark and an accent or two. Both lookups wrap, so an out-of-range
// :N or ;N folds back rather than failing.
// The gap `.zg-status-row` puts between its sections. Mirrored here because
// the fit test has to know how much room the sections need BETWEEN them, not
// only how wide they are: without it the bar reported a fit while the
// sections were already touching. Keep in step with the stylesheet.
const BAR_SECTION_GAP = 12;

// Breathing room demanded before a row counts as fitting. Without it a row
// balanced on the exact boundary oscillates: drop a token, now it fits,
// restore it, now it does not — once per frame, which reads as flicker.
const FIT_SLACK = 4;

// How much wider than the width that forced a reduction the row must get
// before the reduction is undone. Pure hysteresis: restoring the moment the
// shortened row fits would overflow it again immediately.
const FIT_RESTORE_MARGIN = 24;

const PL_BG_COUNT = 7;
const PL_TEXT_COUNT = 4;

const PL_DIVIDERS = { '>': 'arrow', '<': 'arrow', '|': 'straight',
	')': 'round', '(': 'round', '~': 'wave', '/': 'angleF', '\\': 'angleB' };

// Two dividers carry a DIRECTION as well as a shape. Between segments the
// direction is dictated by which way the group runs, so it is ignored there;
// at the two ends there is nothing dictating it, and this is what lets a row
// open with an arrow pointing out of the bar or into it. `<{file}` starts
// with a left-pointing point, `>{file}` with a right-pointing one.
const PL_DIR = { '<': 'left', '>': 'right', '(': 'left', ')': 'right' };

// What --zg-stylesheet-version in styles.css must read for this build. See
// the comment beside that variable: a stale stylesheet in a vault is
// indistinguishable from a broken feature — the rules are absent, the script
// works, and the report is "your fix did nothing". Bump both together.
const ZG_STYLESHEET_VERSION = 34;

// ── Writing history ─────────────────────────────────────────────────────────
// One measurement per typing pause, not one per autosave.
const HISTORY_DEBOUNCE_MS = 2000;
// How long a tally may sit unsaved. Deliberately long: this path writes
// data.json WITHOUT the refresh() that saveSettings triggers, and half a
// minute of tally is a cheaper thing to lose than a bar rebuild per pause.
const HISTORY_SAVE_MS     = 30000;
// How long a pause counts as "stopped writing". Long enough that it does not
// fire between two sentences, short enough that the file is current whenever
// you look away from the editor.
const HISTORY_IDLE_MS     = 8000;
// And the ceiling, for a session that never pauses.
const HISTORY_MAX_UNSAVED_MS = 120000;
// Everything between these markers in the ledger note belongs to the plugin
// and is rewritten wholesale. Everything outside them belongs to the user and
// is never touched.
const HISTORY_MARK_START  = '<!-- wordsmith:history:start -->';
const HISTORY_MARK_END    = '<!-- wordsmith:history:end -->';
// One pixel block, in chart viewBox units. Every bar height, every line and
// the centre line itself snap to this grid — that snapping IS the pixelated
// look, and it is why nothing in the panel is allowed to be a stroked path.
const HISTORY_PX          = 2;
// Steps in the heat ramp each bar is shaded with, cool at the axis and hot at
// the far end. Six is enough to read as a gradient and few enough to dither
// between cleanly.
const HISTORY_HEAT        = 6;
// Above this the cell is coarsened rather than the chart drawing a rect per
// square of a very large grid.
const HISTORY_MAX_CELLS   = 30000;

// How many frames the mask pass will wait for a pane to have a box before it
// gives up. A leaf that never gets one — a background tab, a collapsed
// sidebar — must not spin a repaint loop for the rest of the session.
const MASK_MEASURE_RETRIES = 20;
// Few buckets must not become slabs: two years of data on the Year tab would
// otherwise draw two bars a third of the panel wide each.
const HISTORY_BAR_MAX     = 34;
// The chart's viewBox. Chosen to land close to 1:1 against the modal's real
// width so a 4-unit block renders as a roughly 4-pixel square — the whole
// pixel idiom depends on the two scales not drifting far apart.
const HISTORY_CHART_W     = 660;
const HISTORY_CHART_H     = 184;
const HISTORY_DAYNAMES    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HISTORY_MONTHS      = ['January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'];

// Theme surfaces, addressable as :b1 and :b2 instead of a number.
//
// The seven :N backgrounds are colours the writer picked; these two are
// whatever the current theme is already using for the page and the panels
// beside it. That makes them the only way to write a segment that DISAPPEARS
// into the bar — a label with no block behind it, between two that have one —
// and it keeps working when the theme changes or the vault flips dark to
// light, which a picked colour cannot.
//
// Values are resolved from the live computed style rather than written as
// `var(--background-primary)`: a separator's colour ends up in an SVG `fill`
// ATTRIBUTE, and custom properties do not resolve in presentation attributes.
// The resolved token works everywhere — background-color, box-shadow and fill
// all accept whatever syntax the theme declared it in.
// A directive at the very START of row 1's left slot, setting the BAR's own
// colours from the theme, the palette, or the live mode rather than a
// segment's.
//
//   :b1  page colour      :b2  panel colour     (--background-primary/secondary)
//   :N   palette background N (wrapping, like a segment's :N)
//   :vim the live vim mode colour, restamped on every repaint
//   ;t1  normal text      ;t2  muted text       (--text-normal/--text-muted)
//   ;N   palette text N (wrapping, like a segment's ;N)
//
// Same grammar as the powerline suffixes on purpose — ":" is a background and
// ";" is text everywhere in a row — but a different position: the suffix form
// always follows a token (`{file}:b1`), so nothing here can be mistaken for
// it. Both may appear, in either order, and the pair may be followed by
// ordinary content.
//
// The palette and vim forms return a SLOT rather than a value: they need the
// plugin (settings, theme, live mode) to resolve, and this is a module
// function. resolveBarDirective() on the plugin turns a slot into paint.
//
// Returns the stripped string alongside the values so the caller cannot
// render one without honouring the other.
const BAR_DIRECTIVE_BG   = { b1: 'var(--background-primary)', b2: 'var(--background-secondary)' };
const BAR_DIRECTIVE_TEXT = { t1: 'var(--text-normal)',        t2: 'var(--text-muted)' };

function readBarDirective(formatStr) {
	let rest = String(formatStr == null ? '' : formatStr);
	let bg = null, text = null, bgSlot = null, textSlot = null;
	// Looped rather than one regex with two optional groups: that form only
	// accepts the pair in the order it was written, and a writer who types
	// ;t2:b2 has said exactly the same thing.
	for (;;) {
		const m = /^\s*(?::(b\d+|vim|\d+)|;(t\d+|vim|\d+))/i.exec(rest);
		if (!m) break;
		if (m[1] && bg === null && bgSlot === null) {
			if (/^\d+$/.test(m[1]))        bgSlot = parseInt(m[1], 10);
			else if (/^vim$/i.test(m[1]))  bgSlot = 'vim';
			else bg = BAR_DIRECTIVE_BG[m[1].toLowerCase()] || null;
		}
		if (m[2] && text === null && textSlot === null) {
			if (/^\d+$/.test(m[2]))       textSlot = parseInt(m[2], 10);
			else if (/^vim$/i.test(m[2])) textSlot = 'vim';
			else text = BAR_DIRECTIVE_TEXT[m[2].toLowerCase()] || null;
		}
		// Consumed whether or not it was recognised: :b7 is a typo for a
		// directive, and leaving it in the row would print ":b7" in the bar
		// rather than showing the writer that it did nothing.
		rest = rest.slice(m[0].length);
	}
	return { bg, text, bgSlot, textSlot, rest };
}

// Parse a colour into [r, g, b]. Handles the two syntaxes that can actually
// reach a fade: the palette's hex (3/4/6/8 digit) and getComputedStyle's
// rgb()/rgba() for the bar's own read-back colour. Anything else — including
// the literal 'transparent' an unset bar leaves behind — is null, and the
// mixer falls back to the other end rather than guessing.
function parseColorRGB(str) {
	try {
		const s = String(str).trim();
		if (s[0] === '#') {
			let h = s.slice(1);
			if (h.length === 3 || h.length === 4) h = h.split('').map(c => c + c).join('');
			if (h.length < 6) return null;
			return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
		}
		const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/.exec(s);
		if (m) return [1, 2, 3].map(i => Math.round(parseFloat(m[i])));
		return null;
	} catch (_) { return null; }
}

// A stepped mix for the fade bands. Plain sRGB interpolation on purpose:
// the bands are DISCRETE steps (the p10k pixel look), so the perceptual
// smoothness a Lab-space mix buys is invisible at three to eight bands,
// and sRGB round-trips exactly through the hex the palette stores.
function mixColors(a, b, t) {
	const ca = parseColorRGB(a), cb = parseColorRGB(b);
	if (!ca && !cb) return 'transparent';
	if (!ca) return String(b);
	if (!cb) return String(a);
	const m = i => Math.round(ca[i] + (cb[i] - ca[i]) * t);
	return 'rgb(' + m(0) + ', ' + m(1) + ', ' + m(2) + ')';
}

// Separator width as a fraction of the row's height, which is the same thing
// as the arrow's sharpness: a triangle's nose is 2·atan((h/2)/w). 0.85 gives
// about 61°.
//
// A constant, not a setting. It was briefly a slider, and a slider was the
// wrong shape for it: there is one right answer for "does this read as an
// arrow", the writer has no way to judge the number without dragging it, and
// it put a wire-format key (BAR_KEYS index 56) behind a question nobody
// wanted asked. That key stays in the table — it cannot be removed, only
// stopped being read.
const PL_SEP_ASPECT = 0.85;

const PL_THEME_BGS = {
	b1: '--background-primary',
	b2: '--background-secondary',
};

// Doubling turns a character into a SOFT mark: drawn in the segment's own
// foreground, inside one colour block instead of between two — the hairline
// short and faint, the chevrons at the segment's full height as an outline
// stroke (buildSoftChevron), the way p10k's thin dividers sit inside a
// block. Only three
// exist, and the set is deliberately short rather than symmetric — (( )) || ~~
// were tried and removed. A soft mark has to stay legible at a few pixels of
// foreground colour, and the round, twin and wave forms did not: they read as
// specks. Chevrons keep a clear direction and the hairline is unmistakable at
// any size, so those are what remain. Backslash is excluded regardless: a
// doubled backslash already means a literal one.
//
// Note this means doubling is NOT universal. A doubled character with no
// entry here falls through to the tokenizer, which splits on each half as a
// hard divider — the empty segment between them is then dropped by the
// collapse pass, so `{a} )) {b}` renders as a single round join rather than
// as an error. That is the intended degradation.
// The official Obsidian crystal as one path, its four facets separate
// subpaths so the facet lines are gaps in the fill. From simple-icons
// (CC0 path data); see buildObsidianIcon for the trademark note.
const OBSIDIAN_ICON_PATH = 'M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z';

const PL_SOFT = {
	'::': 'zg-pl-soft',
	'>>': 'zg-pl-soft zg-pl-chev-r',
	'<<': 'zg-pl-soft zg-pl-chev-l'
};
const PL_SOFT_SPLIT = /(::|>>|<<)/;

const DEFAULT_SETTINGS = {
	// ── Master switch ─────────────────────────────────────────────────────────
	pluginEnabled:            true,

	// ── Scope ─────────────────────────────────────────────────────────────────
	// An empty list means every note, in either mode. That is the only sane
	// default: a scope feature that starts out excluding everything would look
	// exactly like a broken plugin.
	scopeMode:                'include',  // 'include' | 'exclude'
	scopePaths:               [],
	// Notes and folders that Word-Smith still WORKS in but never COUNTS: an
	// outline, a research folder, a scratch file inside the manuscript. Kept
	// separate from scopePaths because the two answer different questions —
	// that one is "leave this note alone entirely", this one is "help me write
	// it, just do not put it in the total". NULL rather than [] for the reason
	// every nested default here is: the merge in loadSettings is shallow.
	countExclude:             null,

	// ── Zen mode ──────────────────────────────────────────────────────────────
	// zenEnabled ships off while zenMode ships on. That is not a contradiction:
	// the plugin installs quietly, and the Zen tab's single switch — or the Z
	// badge — then brings up focus mode and the letterbox together, already
	// configured. Turning focus mode on at install would collapse
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
	// Zen sub-options that hide things this plugin owns, rather than
	// Obsidian's. Kept beside the rest of the hide group so the tab reads as
	// one list, but note they are NOT bar presets: a preset describes how the
	// bar looks, and whether zen hides it is a property of zen.
	zenHideBar:               false,
	// How long the bar lingers after the pointer leaves the strip it hides
	// in. 0 turns peeking off entirely, which is the off switch — a separate
	// toggle for it would be a second control for one decision.
	barPeekMs:                2000,
	// Breathing room between the caret and whatever occupies the edge of the
	// window: the bar, the vim command line, the letterbox. Enforced through
	// CodeMirror's scrollMargins (see caretFloorY), which is the one route
	// that has ever reached the editor — the zen padding sliders that tried
	// to do this with CSS are a tombstone in ARCHITECTURE.md.
	caretMarginPx:            0,
	// Escape leaves zen. Off-limits in vim's insert/visual/replace modes
	// whatever this says — see the keydown handler — so it costs a vim user
	// one extra keystroke rather than a keybinding.
	zenEscExits:              true,
	// Measured height of the vim command line, so the gutter can be
	// reserved at the right size before the first `:` of a session.
	vimPanelHeight:           23,
	focusedFileMode:          false,

	// ── Typewriter / letterbox ────────────────────────────────────────────────
	enableTypewriter:         false,
	editorPaddingH:           100,
	// The Zen tab's master switch. Focus mode and letterbox are its two
	// halves; the Z badge in the bar toggles this, not focus mode alone.
	zenEnabled:               false,
	zenTitlebarMatch:         true,     // paint the window title bar like the editor
	enableLetterbox:          false,
	letterboxLines:           8,
	letterboxPx:              95.81700000000001,
	maskPaddingH:             194,
	maskOverhang:             4,
	arrowStyle:               "solid-triangle",
	arrowLineEnds:            false,     // cap each separator line with an arrow
	customArrowTop:           "^",
	customArrowBottom:        "v",
	arrowCount:               5,
	arrowScale:               0.7,
	separatorStyle:           "solid",
	separatorWeight:          2,
	highlightCurrentLine:     false,
	lineHighlightDarkColor:   "#a8a8a4",
	lineHighlightLightColor:  "#707070",
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
	statusBarRows:            1,
	statusRows:               [
		{ left: ':b2{obsidian}:6>{ggggg}{ggggg}{ggggg}|{file}:vim>{ggggg}>{ggggg}>{ggggg}>{ggggg}~',
		  center: '<{ss}{mode}:7/{syntax}::{prose}:2|{font}\\{report}:vim<',
		  right: '~{markers}{paragraph}~{words} words){clock}{time}' },
		{ left: '',
		  center: '',
		  right: '' },
		{ left: '',
		  center: '',
		  right: '' },
	],
	fileTokenFormat:          'path',     // 'path' (~/folder/name) | 'name' (basename only)
	statusBarBorderStyle:     'none',     // matches the mask separator options
	statusBarBorderWidth:     1,           // 1–8 px; 'none' style hides it
	// Which edges the rule is drawn on. The style dropdown turns BOTH off
	// at once; these pick one. Default to the old behaviour, which drew
	// both regardless of the setting being labelled "Top border".
	statusBarBorderTop:       true,
	statusBarBorderBottom:    false,
	statusBarFontSize:        15,
	// The bar's type follows the editor's own size (--font-text-size),
	// Ctrl+scroll zoom included, instead of the fixed slider above.
	statusBarFontFollowNote:  true,
	statusBarHeight:          16,
	statusBarPadTop:          2,         // breathing room above the rows
	statusBarPadBottom:       2,         // and below them
	// ── Powerline ──────────────────────────────────────────────────────────
	// Segments are split on a divider character, and the character chosen
	// sets that boundary's shape (see PL_DIVIDERS). Inside a segment, ::
	// draws a soft divider. A colour is chosen per segment by suffixing any
	// token in it with :N — {file}:2, or {file} :2 if you want the space.
	powerlineEnabled:         true,
	powerlineModeColors:      true,
	// Vestigial. The separator's angle was briefly a slider and is now the
	// PL_SEP_ASPECT constant — there is one right answer for "does this read
	// as an arrow", and it was not a question worth asking. The key stays
	// because it is BAR_KEYS index 56 and share codes already carry it; it
	// is written, encoded and decoded, and read by nothing.
	powerlineSepWidth:        78,
	// Six, numbered 1-6 the way they are written in a row. Defaults are a
	// muted spread rather than six shouts: the loud bar is the classic way
	// a homemade statusline becomes unreadable at 13px.
	powerlineColor1:          "#4f9dde",
	powerlineColor2:          "#3f4550",
	powerlineColor3:          "#2f333c",
	powerlineColor4:          "#4caf7d",
	powerlineColor5:          "#307853",
	powerlineColor6:          "#8a7fd1",
	powerlineColor7:          "#cc141d",
	// Mode colours, set beside the mode labels in the Vim tab. A segment
	// suffixed :vim follows whichever of these matches the live mode.
	// Text colours, addressed as ;N after the background number.
	powerlineText1:           "#ffffff",
	powerlineText2:           "#16181d",
	powerlineText3:           "#9aa0a6",
	powerlineText4:           "#4f9dde",
	// Light-theme variants of all eleven, added in 1.12. The originals above
	// are the DARK set — they keep their names, their values and their
	// BAR_KEYS indices, because both the key order and those default values
	// are a share-code wire format.
	//
	// Not copies of the dark set: on a light bar the two quiet neutrals have
	// to be light greys rather than slates, and the near-white default ink
	// has to become near-black. A palette that merely survives the switch is
	// not the same as one designed for it.
	powerlineColorLight1:     "#2d6da4",
	powerlineColorLight2:     "#d9dce1",
	powerlineColorLight3:     "#eceef1",
	powerlineColorLight4:     "#2f8a5b",
	powerlineColorLight5:     "#b96f1e",
	powerlineColorLight6:     "#6a5cb8",
	powerlineColorLight7:     "#a2404f",
	powerlineTextLight1:      "#16181d",
	powerlineTextLight2:      "#f7f7f5",
	powerlineTextLight3:      "#5c636b",
	powerlineTextLight4:      "#2d6da4",
	// When Cursor-Smith is installed and theming the caret per vim mode, take
	// its colours instead of the five below, so the bar and the cursor agree.
	vimFollowCursorSmith:     true,
	vimColorNormal:           "#4f9dde",
	vimColorInsert:           "#4caf7d",
	vimColorVisual:           "#8a7fd1",
	vimColorReplace:          "#c2544d",
	vimColorCommand:          "#e0913a",
	// The same five for a light theme. A mode colour is read at a glance
	// against the bar behind it, so the dark set's brightness is exactly
	// what makes it wrong on a pale bar.
	vimColorNormalLight:      "#2d6da4",
	vimColorInsertLight:      "#2f8a5b",
	vimColorVisualLight:      "#6a5cb8",
	vimColorReplaceLight:     "#a03c36",
	vimColorCommandLight:     "#b96f1e",
	// ── Goals ────────────────────────────────────────────────────────────────
	// Three of them, drawn the same way: the writing goal as a ring, the file
	// goal as a triangle, the folder goal as a square. One label mode and one
	// line weight across all three, so they never disagree about how they look.
	goalTarget:               200,       // legacy vault-wide goal; kept so old data loads
	goalBaseline:             0,          // words already written when it was last rebased
	fileGoals:                {},         // note path   -> word target
	folderGoals:              {},         // folder path -> word target
	goalLabelMode:            'fraction',  // 'percent' inside | 'fraction' beside | 'none'
	goalRingWeight:           16,         // gauge thickness, in viewBox units
	goalOrientation:          'vertical', // 'vertical' | 'horizontal'
	goalLenWriting:           30,         // horizontal length, in viewBox units
	goalLenFile:              40,
	goalLenFolder:            85,

	// Off by default: the bar should look like part of the app it lives in,
	// not like a second app parked at the bottom of the window.
	retroCustomColors:        false,
	retroDarkBgColor:         "#141010",
	retroDarkTextColor:       "#f2f2f2",
	retroLightBgColor:        "#e9e8e8",
	retroLightTextColor:      "#f7fb09",
	// Off, the arrows and the separator lines take the theme's text colour —
	// they are furniture around the writing, not a feature that should be
	// announcing itself in a colour of its own. The four pickers below are
	// what "on" reaches.
	letterboxCustomColors:    false,
	arrowDarkColor:           "#fbfaf9",
	arrowLightColor:          "#080808",
	lineDarkColor:            "#faf8f5",
	lineLightColor:           "#030303",

	// ── Misc options ──────────────────────────────────────────────────────────
	miscEnabled:              false,

	// ── Text options ──────────────────────────────────────────────────────────
	enableParagraphIndent:    false,
	paragraphIndentEm:        4,
	paragraphIndentMode:      'single',   // 'double' | 'single'
	lineSpacing:              1.5,
	// '' = whatever the theme sets, and that is the only defensible shipped
	// value. This held a real font name for eleven releases (issues #4 and
	// #6): installing the plugin restyled every note in a face the writer had
	// not chosen and, because the only control for it was the {font} button
	// on the bar, a preset without that token left no way to find the switch.
	// A plugin may add things to Obsidian. It may not quietly redecorate what
	// was already there.
	editorFont:               '',
	// One-shot: see the migration in loadSettings.
	editorFontDefaultCleared: false,
	limitLineLength:          false,
	maxLineChars:             64,
	justifyText:              true,
	showHiddenMarkers:        true,
	markSpaces:               false,
	markTabs:                 false,
	markParagraphs:           false,
	markEndOfLines:           false,
	markBlankLines:           true,

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
	hemFlashTarget:           'both',  // 'none' | 'screen' | 'retrobar' | 'both'

	// ── Syntax highlight ──────────────────────────────────────────────────────
	syntaxSkipCode:           true,
	syntaxStyle:              'text',     // 'text' | 'highlight' | 'squiggle' | 'line'
	checksEnabled:            false,      // master switch over the writing checks
	checkStyle:               'squiggle', // same options, for the writing checks
	checkFiller:              true,
	checkFillerSoft:          false,     // also flag quantifiers/frequency words
	checkFillerColor:         "#8a7fd1",
	checkPassive:             true,
	checkPassiveColor:        "#c2544d",
	checkIllusion:            true,
	checkIllusionColor:       "#d98cc4",
	checkMisused:             true,
	checkMisusedColor:        "#e0913a",
	checkPronoun:             true,
	checkPronounColor:        "#4f9dde",
	checkRhythm:              false,
	checkRhythmHardColor:     "#d4a017",
	checkRhythmVeryHardColor: "#c2544d",
	checkRhythmHardGrade:     10,        // Flesch-Kincaid grade for "hard"
	checkRhythmVeryHardGrade: 14,        // and for "very hard"
	checkRepetition:          true,
	checkRepetitionColor:     "#4caf7d",
	repetitionWindow:         50,        // words
	repetitionMinLength:      5,         // ignore short words
	posEnabled:               false,
	posDimOthers:             true,
	posNoun:                  false,
	posNounColor:             "#4f9dde",
	posVerb:                  false,
	posVerbColor:             "#4caf7d",
	posAdjective:             false,
	posAdjectiveColor:        "#d98cc4",
	posAdverb:                false,
	posAdverbColor:           "#e0913a",
	posConjunction:           false,
	posConjunctionColor:      "#9aa0a6",

	// ── Typography ────────────────────────────────────────────────────────────
	// Off by default: it rewrites the document as you type, and that is not a
	// thing to start doing to someone's notes uninvited.
	typographyEnabled:        false,
	typoSmartQuotes:          true,
	typoCustomQuotes:         false,     // pick the characters yourself
	typoOpenDouble:           "\u201c",
	typoCloseDouble:          "\u201d",
	typoOpenSingle:           "\u2018",
	typoCloseSingle:          "\u2019",
	typoApostrophe:           "\u2019",
	typoEllipsis:             true,
	typoDashes:               true,
	typoArrows:               true,
	typoComparisons:          false,
	typoGuillemets:           false,
	typoFractions:            true,

	// ── Sidebar word counts ───────────────────────────────────────────────────
	enableFileTreeCounts:     false,
	enableOutlineCounts:      false,

	// ── Vim and gutters ───────────────────────────────────────────────────────
	vimSoftWrapMotion:        true,      // j/k move by visual line, not logical
	vimLabelNormal:           "NORMAL",
	vimLabelInsert:           "INSERT",
	vimLabelVisual:           "VISUAL",
	vimLabelReplace:          "REPLACE",
	vimLabelCommand:          "COMMAND",

	// ── Bar presets ───────────────────────────────────────────────────────────
	// name -> partial snapshot of BAR_KEYS. Lives in settings so saveSettings
	// persists it with everything else. NOT itself a BAR_KEY: a preset must
	// never carry the preset library, or loading one would delete the others.
	barPresets:               {},
	// Whether the shipped presets have been seeded into that library. A flag
	// rather than a per-name check, so deleting a built-in makes it stay
	// deleted instead of returning on the next launch.
	//
	// FALSE as the default, which is the whole point of it: a fresh vault
	// has not been seeded, so the seeder runs once and the shipped presets
	// arrive. Defaulting it true meant new installs declared themselves
	// already seeded and started with an empty library. A vault that has
	// run the seeder holds `true` in its own data.json and is untouched,
	// so nothing a user deleted comes back.
	barPresetsSeeded:         false,

	// ── Writing history ──────────────────────────────────────────────────────
	// The first behavioural data this plugin has ever stored, so it is OFF
	// until asked for, and every value here is AUTHORED — none of it came from
	// the donor vault the rest of the 1.25 defaults were taken from. Shipping
	// the maintainer's own writing history as everyone's day one would be
	// absurd, and these keys join zenMode/fullscreen/scopePaths/fileGoals on
	// the list of things a donor snapshot must never supply.
	//
	// None of these are BAR_KEYS. A bar preset must not carry a writing
	// history any more than it carries someone's word targets.
	historyTracking:          false,
	historyDailyGoal:         0,          // 0 = no goal line and no projection
	// Which of Day / Month / Year the report opens on, and which series are
	// drawn. Both are remembered rather than reset per opening: a writer who
	// looks at months every morning should not have to say so every morning.
	historyView:              'day',      // 'day' | 'month' | 'year'
	historySeries:            null,       // filled by historySeriesOn(); see there
	// Where the store is CREATED if none exists yet, and the first place it is
	// looked for. Not a lock: the plugin finds the file by its marker anywhere
	// in the vault, so moving or renaming it is expected rather than tolerated,
	// and this key follows the file when it moves.
	historyFilePath:          'history.md',
	// Whether the store also records WHICH notes each day's words happened in.
	// On, because without it the finder in the history window has nothing to
	// find. It is the one thing in the record that is not purely a number, and
	// it is what makes the file grow with the notes you touch rather than only
	// with the days you write.
	historyPerFile:           true,
	// The one history-adjacent thing left in data.json, and it is not history:
	// path -> last known word count, the cache that turns a save into a delta.
	// Worthless to a human, a kilobyte of JSON in the middle of a note if it
	// were stored there, and rebuilt automatically. NULL rather than {} — the
	// merge in loadSettings is shallow, and an object literal here would be
	// shared by reference with every vault that has never written a word.
	historyBaselines:         null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Retro bar presets: the key table and the share-code codec
// ─────────────────────────────────────────────────────────────────────────────

// Everything the Retro Bar tab can set — the whole tab, and nothing outside
// it. A preset is a snapshot containing exactly these keys.
//
// Deliberately excluded, and why:
//   enableRetroStatus  the master switch. Loading a preset must never turn
//                      the bar off, and a preset saved with it off would.
//   retroBarHidden     transient — the slide-away toggle, not a look.
//   goalTarget, goalBaseline, fileGoals, folderGoals
//                      personal data. Sharing a bar must not ship someone
//                      else's word targets or their folder names.
//   goalRingWeight and the other goal geometry
//                      bar presentation, but no tab renders it, so it is not
//                      part of "every option in the Retro Bar tab". Append
//                      it below if that changes.
//   arrow*/line* colours
//                      letterbox furniture, set in the Letter Box tab.
//
// ═══ APPEND-ONLY BELOW THE MARKER. ═══
// A share code stores each field as its INDEX into this array, so inserting
// or reordering anything reinterprets every code already posted. Appending is
// safe: older codes simply don't mention the new indices, and barParseFields
// skips indices it doesn't recognise.
//
// The same freeze now applies to these keys' DEFAULT_SETTINGS *values*.
// barShareFields emits only what DIFFERS from the defaults and the recipient
// fills the rest back in from their own copy — so retuning a default here
// silently changes what every existing code decodes to. That is a new
// constraint on this file: before this feature, a default was just a default.
const BAR_KEYS = [
	// Layout
	'statusBarRows', 'statusRows', 'fileTokenFormat',
	// Powerline
	'powerlineEnabled', 'powerlineModeColors',
	'powerlineColor1', 'powerlineColor2', 'powerlineColor3', 'powerlineColor4',
	'powerlineColor5', 'powerlineColor6', 'powerlineColor7',
	'powerlineText1', 'powerlineText2', 'powerlineText3', 'powerlineText4',
	// Borders
	'statusBarBorderStyle', 'statusBarBorderWidth',
	'statusBarBorderTop', 'statusBarBorderBottom',
	// Appearance
	'statusBarFontSize', 'statusBarHeight',
	'statusBarPadTop', 'statusBarPadBottom',
	// Vim labels and their colours (they live in this tab, not the Vim tab)
	'vimFollowCursorSmith',
	'vimColorNormal', 'vimColorInsert', 'vimColorVisual',
	'vimColorReplace', 'vimColorCommand',
	'vimLabelNormal', 'vimLabelInsert', 'vimLabelVisual',
	'vimLabelReplace', 'vimLabelCommand',
	// Bar colours
	'retroCustomColors',
	'retroDarkBgColor', 'retroDarkTextColor',
	'retroLightBgColor', 'retroLightTextColor',
	// ═══ APPEND ONLY BELOW THIS LINE ═══
	// 1.12: light-theme variants. Appended rather than interleaved with the
	// dark ones they pair with — grouping them by slot would read better and
	// would silently reinterpret every share code in the wild, which is what
	// the marker above is for. An older code simply does not mention these
	// indices and lands on the light defaults.
	'powerlineColorLight1', 'powerlineColorLight2', 'powerlineColorLight3',
	'powerlineColorLight4', 'powerlineColorLight5', 'powerlineColorLight6',
	'powerlineColorLight7',
	'powerlineTextLight1', 'powerlineTextLight2',
	'powerlineTextLight3', 'powerlineTextLight4',
	'vimColorNormalLight', 'vimColorInsertLight', 'vimColorVisualLight',
	'vimColorReplaceLight', 'vimColorCommandLight',
	// 1.14
	'powerlineSepWidth',
	// 1.21
	'statusBarFontFollowNote',
];

const BAR_SHARE_VERSION = '1';

// Share code format (version "1"):
//   1|<name>|<i><type><value>~<i><type><value>~…
//   • the name is percent-encoded, so a literal "|" or "~" in it cannot
//     split the code.
//   • each field is an index into BAR_KEYS, a one-char type tag, then a value:
//       b0 / b1   boolean
//       n<num>    number
//       c<hex>    colour, "#" dropped — by far the most common value here
//       s<enc>    string, percent-encoded (token rows, label text)
//       j<enc>    JSON, percent-encoded — statusRows is an array of objects
//                 and has no shorter honest representation
//   • only fields differing from DEFAULT_SETTINGS are emitted.
//
// Codes are long compared with Cursor-Smith's because a bar carries token
// strings rather than numbers. That is the format doing its job: the rows ARE
// the preset, and abbreviating them would mean a second grammar to keep in
// step with the one the writer types into the panel.

// encodeURIComponent leaves "~" alone — it is an unreserved character — and
// "~" is the field separator here. That is fine in a plugin whose values are
// numbers and colours; it is not fine in this one, where "~" is a legal
// powerline divider (the wave) and therefore appears in ordinary row text. A
// row of `{words}~{time}` encoded straight would split into two malformed
// fields and the whole preset would decode as the defaults. Escaped by hand
// on the way out; decodeURIComponent already understands %7E coming back.
function barEnc(s) {
	return encodeURIComponent(s).replace(/~/g, '%7E');
}

function barShareNum(n) {
	if (Number.isInteger(n)) return String(n);
	return String(Math.round(n * 1e6) / 1e6);
}

function barShareEncodeValue(v) {
	if (typeof v === 'boolean') return 'b' + (v ? '1' : '0');
	if (typeof v === 'number')  return 'n' + barShareNum(v);
	if (typeof v === 'string') {
		if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return 'c' + v.slice(1);
		return 's' + barEnc(v);
	}
	return 'j' + barEnc(JSON.stringify(v));
}

function barShareDecodeValue(tag, raw) {
	switch (tag) {
		case 'b': return raw === '1';
		case 'n': return Number(raw);
		case 'c': return '#' + raw;
		case 's': return decodeURIComponent(raw);
		case 'j': try { return JSON.parse(decodeURIComponent(raw)); } catch (_) { return undefined; }
		default:  return undefined;
	}
}

// Just the bar keys out of a settings object, and only those it actually has.
function pickBar(src) {
	const out = {};
	if (!src) return out;
	for (const k of BAR_KEYS) {
		if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
	}
	return out;
}

// Structural values (statusRows) compare and copy by VALUE, never by
// reference. Two vaults' rows are equal when they read the same, and a loaded
// preset must not hand the live settings the same array the library holds —
// editing a row in the panel would then silently rewrite the preset it came
// from.
function barSameValue(a, b) {
	if (a === b) return true;
	if (typeof a === 'number' && typeof b === 'number') return barShareNum(a) === barShareNum(b);
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return false; }
	}
	return false;
}

function barCloneValue(v) {
	if (!v || typeof v !== 'object') return v;
	try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; }
}

function barShareFields(bar, defaults) {
	const fields = [];
	for (let i = 0; i < BAR_KEYS.length; i++) {
		const k = BAR_KEYS[i];
		if (!(k in bar)) continue;
		if (barSameValue(bar[k], defaults[k])) continue;
		fields.push(i + barShareEncodeValue(bar[k]));
	}
	return fields.join('~');
}

// Always returns an object, never null: an empty body legitimately means
// "identical to the defaults", which is not the same as a missing body.
function barParseFields(body) {
	const snap = {};
	if (!body) return snap;
	for (const field of body.split('~')) {
		if (!field) continue;
		const m = /^(\d+)(.)([\s\S]*)$/.exec(field);
		if (!m) continue;
		const key = BAR_KEYS[Number(m[1])];
		if (!key) continue;              // index from a newer version: skip it
		const val = barShareDecodeValue(m[2], m[3]);
		if (val !== undefined) snap[key] = val;
	}
	return snap;
}

function barPresetToCode(name, snap) {
	const body = barShareFields(pickBar(snap), DEFAULT_SETTINGS);
	return [BAR_SHARE_VERSION, barEnc(name || ''), body].join('|');
}

function barCodeToPreset(code) {
	const trimmed = (code || '').trim();
	if (trimmed.slice(0, 2) !== BAR_SHARE_VERSION + '|') return null;
	try {
		const parts = trimmed.split('|');
		// parts[0] is the version, already matched. A literal "|" cannot reach
		// the name field (it is percent-encoded), so everything from parts[2]
		// on is body and is rejoined rather than truncated.
		const name = decodeURIComponent(parts[1] || '') || 'Imported preset';
		return { name, snap: barParseFields(parts.slice(2).join('|')) };
	} catch (_) {
		return null;
	}
}

// A preset saved before some setting existed should land on that setting's
// DEFAULT, not on whatever this vault happened to have set beforehand. Without
// this, loading an old preset leaves a stray value from the previous look and
// the result matches neither.
function barPresetWithDefaults(preset) {
	const out = {};
	for (const k of BAR_KEYS) {
		out[k] = barCloneValue(
			Object.prototype.hasOwnProperty.call(preset || {}, k)
				? preset[k] : DEFAULT_SETTINGS[k]);
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shipped presets
// ─────────────────────────────────────────────────────────────────────────────
// Sparse on purpose: each lists only what it changes, and barPresetWithDefaults
// fills the rest in. That keeps them readable as *statements of intent* — you
// can see at a glance that Plain is "one row, no powerline" rather than reading
// forty keys to find the three that matter — and it means a preset written
// today does not pin values it never had an opinion about.
//
// Seeded into the library once (see barPresetsSeeded), never re-seeded, so a
// deleted one stays deleted.
const DEFAULT_BAR_PRESETS = {
	"Mash": {
		"statusBarRows": 1,
		"statusRows": [{"left": ":b2{obsidian}:6>{ggggg}{ggggg}{ggggg}|{file}:vim>{ggggg}>{ggggg}>{ggggg}>{ggggg}~", "center": "<{ss}{mode}:7/{syntax}::{prose}:2|{font}\\{report}:vim<", "right": "~{markers}{paragraph}~{words} words){clock}{time}"}, {"left": "", "center": "", "right": ""}, {"left": "", "center": "", "right": ""}],
		"fileTokenFormat": "path",
		"powerlineEnabled": true,
		"powerlineModeColors": true,
		"powerlineColor1": "#4f9dde",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#2f333c",
		"powerlineColor4": "#4caf7d",
		"powerlineColor5": "#307853",
		"powerlineColor6": "#8a7fd1",
		"powerlineColor7": "#cc141d",
		"powerlineText1": "#ffffff",
		"powerlineText2": "#16181d",
		"powerlineText3": "#9aa0a6",
		"powerlineText4": "#4f9dde",
		"statusBarBorderStyle": "none",
		"statusBarBorderWidth": 1,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": false,
		"statusBarFontSize": 15,
		"statusBarHeight": 16,
		"statusBarPadTop": 2,
		"statusBarPadBottom": 2,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "NORMAL",
		"vimLabelInsert": "INSERT",
		"vimLabelVisual": "VISUAL",
		"vimLabelReplace": "REPLACE",
		"vimLabelCommand": "COMMAND",
		"retroCustomColors": false,
		"retroDarkBgColor": "#141010",
		"retroDarkTextColor": "#f2f2f2",
		"retroLightBgColor": "#e9e8e8",
		"retroLightTextColor": "#f7fb09",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#b96f1e",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"powerlineTextLight1": "#16181d",
		"powerlineTextLight2": "#f7f7f5",
		"powerlineTextLight3": "#5c636b",
		"powerlineTextLight4": "#2d6da4",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": true,
	},
	"Plain": {
		"statusBarRows": 1,
		"statusRows": [{"left": "{file}", "center": "{mode} {syntax} {prose} {report} ", "right": "{words} words"}, {"left": "", "center": "", "right": ""}, {"left": "", "center": "", "right": ""}],
		"fileTokenFormat": "path",
		"powerlineEnabled": false,
		"powerlineModeColors": true,
		"powerlineColor1": "#4f9dde",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#2f333c",
		"powerlineColor4": "#4caf7d",
		"powerlineColor5": "#e0913a",
		"powerlineColor6": "#8a7fd1",
		"powerlineColor7": "#b5566b",
		"powerlineText1": "#f7f7f5",
		"powerlineText2": "#16181d",
		"powerlineText3": "#9aa0a6",
		"powerlineText4": "#4f9dde",
		"statusBarBorderStyle": "solid",
		"statusBarBorderWidth": 2,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": true,
		"statusBarFontSize": 14,
		"statusBarHeight": 20,
		"statusBarPadTop": 4,
		"statusBarPadBottom": 4,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "-- NORMAL --",
		"vimLabelInsert": "-- INSERT --",
		"vimLabelVisual": "-- VISUAL --",
		"vimLabelReplace": "-- REPLACE --",
		"vimLabelCommand": "-- COMMAND --",
		"retroCustomColors": false,
		"retroDarkBgColor": "#000000",
		"retroDarkTextColor": "#fbfaf9",
		"retroLightBgColor": "#f5f0e8",
		"retroLightTextColor": "#000000",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#b96f1e",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"powerlineTextLight1": "#16181d",
		"powerlineTextLight2": "#f7f7f5",
		"powerlineTextLight3": "#5c636b",
		"powerlineTextLight4": "#2d6da4",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": false,
	},
	"DOS": {
		"statusBarRows": 1,
		"statusRows": [{"left": "|Ln {ln:col}:1 Col|{s}:6|", "center": "{s}:6|file path = {file}:1|{s}:6|{font}:3|{s}:6|", "right": "|{s}:6|{s}:1^P=Command ^O=Files"}, {"left": "", "center": "", "right": ""}, {"left": "", "center": "", "right": ""}],
		"fileTokenFormat": "path",
		"powerlineEnabled": true,
		"powerlineModeColors": true,
		"powerlineColor1": "#00aaaa",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#000000",
		"powerlineColor4": "#fff700",
		"powerlineColor5": "#001eff",
		"powerlineColor6": "#ffffff",
		"powerlineColor7": "#ff0000",
		"powerlineText1": "#f7f7f5",
		"powerlineText2": "#16181d",
		"powerlineText3": "#9aa0a6",
		"powerlineText4": "#4f9dde",
		"statusBarBorderStyle": "solid",
		"statusBarBorderWidth": 2,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": true,
		"statusBarFontSize": 19,
		"statusBarHeight": 20,
		"statusBarPadTop": 4,
		"statusBarPadBottom": 4,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "-- NORMAL --",
		"vimLabelInsert": "-- INSERT --",
		"vimLabelVisual": "-- VISUAL --",
		"vimLabelReplace": "-- REPLACE --",
		"vimLabelCommand": "-- COMMAND --",
		"retroCustomColors": true,
		"retroDarkBgColor": "#00aaaa",
		"retroDarkTextColor": "#e3e0de",
		"retroLightBgColor": "#f5f0e8",
		"retroLightTextColor": "#000000",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#b96f1e",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"powerlineTextLight1": "#16181d",
		"powerlineTextLight2": "#f7f7f5",
		"powerlineTextLight3": "#5c636b",
		"powerlineTextLight4": "#2d6da4",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": false,
	},
	"Zero": {
		"statusBarRows": 1,
		"statusRows": [{"left": ":b2{vim}:b2;vim | {file}:b2;t1", "center": "", "right": "{ln:col}:b2;t1"}, {"left": "", "center": "", "right": ""}, {"left": "", "center": "", "right": ""}],
		"fileTokenFormat": "name",
		"powerlineEnabled": true,
		"powerlineModeColors": true,
		"powerlineColor1": "#cf1717",
		"powerlineColor2": "#d06106",
		"powerlineColor3": "#dade17",
		"powerlineColor4": "#21b552",
		"powerlineColor5": "#2a72cf",
		"powerlineColor6": "#1a1a1a",
		"powerlineColor7": "#f2eef1",
		"powerlineText1": "#ffffff",
		"powerlineText2": "#16181d",
		"powerlineText3": "#9aa0a6",
		"powerlineText4": "#4f9dde",
		"statusBarBorderStyle": "none",
		"statusBarBorderWidth": 1,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": false,
		"statusBarFontSize": 15,
		"statusBarHeight": 16,
		"statusBarPadTop": 2,
		"statusBarPadBottom": 2,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "NORMAL",
		"vimLabelInsert": "INSERT",
		"vimLabelVisual": "VISUAL",
		"vimLabelReplace": "REPLACE",
		"vimLabelCommand": "COMMAND",
		"retroCustomColors": false,
		"retroDarkBgColor": "#141010",
		"retroDarkTextColor": "#f2f2f2",
		"retroLightBgColor": "#e9e8e8",
		"retroLightTextColor": "#f7fb09",
		"powerlineColorLight1": "#c44040",
		"powerlineColorLight2": "#c47b40",
		"powerlineColorLight3": "#cacb6c",
		"powerlineColorLight4": "#21b584",
		"powerlineColorLight5": "#6294d5",
		"powerlineColorLight6": "#828282",
		"powerlineColorLight7": "#4d4c4c",
		"powerlineTextLight1": "#16181d",
		"powerlineTextLight2": "#f7f7f5",
		"powerlineTextLight3": "#5c636b",
		"powerlineTextLight4": "#2d6da4",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": false,
	},
	"Echo": {
		"statusBarRows": 1,
		"statusRows": [{"left": ":b2|{gggg}|{gggg}{gggg}|{file}:5", "center": "{vim}:vim", "right": "{ln:col}:~{clock}:7{ggg}~{ggg}~{ggg}~{ggg}"}, {"left": "", "center": "", "right": ""}, {"left": "", "center": "", "right": ""}],
		"fileTokenFormat": "path",
		"powerlineEnabled": true,
		"powerlineModeColors": true,
		"powerlineColor1": "#4f9dde",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#2f333c",
		"powerlineColor4": "#4caf7d",
		"powerlineColor5": "#cfa32a",
		"powerlineColor6": "#8a7fd1",
		"powerlineColor7": "#cc141d",
		"powerlineText1": "#ffffff",
		"powerlineText2": "#16181d",
		"powerlineText3": "#9aa0a6",
		"powerlineText4": "#4f9dde",
		"statusBarBorderStyle": "none",
		"statusBarBorderWidth": 1,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": false,
		"statusBarFontSize": 15,
		"statusBarHeight": 16,
		"statusBarPadTop": 2,
		"statusBarPadBottom": 2,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "NORMAL",
		"vimLabelInsert": "INSERT",
		"vimLabelVisual": "VISUAL",
		"vimLabelReplace": "REPLACE",
		"vimLabelCommand": "COMMAND",
		"retroCustomColors": false,
		"retroDarkBgColor": "#141010",
		"retroDarkTextColor": "#f2f2f2",
		"retroLightBgColor": "#e9e8e8",
		"retroLightTextColor": "#f7fb09",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#b96f1e",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"powerlineTextLight1": "#16181d",
		"powerlineTextLight2": "#f7f7f5",
		"powerlineTextLight3": "#5c636b",
		"powerlineTextLight4": "#2d6da4",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": true,
	},
	"Slant": {
		"statusBarRows": 1,
		"statusRows": [{"left": ":b2/{vim}:vim|{file}:b1>{ln:col}/", "center": "/{report}:vim", "right": ">{words}:b1w<<{chars}c"}, {"left": "", "center": "", "right": ""}, {"left": "", "center": "", "right": ""}],
		"fileTokenFormat": "path",
		"powerlineEnabled": true,
		"powerlineModeColors": true,
		"powerlineColor1": "#4f9dde",
		"powerlineColor2": "#3f4550",
		"powerlineColor3": "#2f333c",
		"powerlineColor4": "#4caf7d",
		"powerlineColor5": "#307853",
		"powerlineColor6": "#8a7fd1",
		"powerlineColor7": "#cc141d",
		"powerlineText1": "#ffffff",
		"powerlineText2": "#16181d",
		"powerlineText3": "#9aa0a6",
		"powerlineText4": "#4f9dde",
		"statusBarBorderStyle": "none",
		"statusBarBorderWidth": 1,
		"statusBarBorderTop": true,
		"statusBarBorderBottom": false,
		"statusBarFontSize": 15,
		"statusBarHeight": 16,
		"statusBarPadTop": 2,
		"statusBarPadBottom": 2,
		"vimFollowCursorSmith": true,
		"vimColorNormal": "#4f9dde",
		"vimColorInsert": "#4caf7d",
		"vimColorVisual": "#8a7fd1",
		"vimColorReplace": "#c2544d",
		"vimColorCommand": "#e0913a",
		"vimLabelNormal": "NORMAL",
		"vimLabelInsert": "INSERT",
		"vimLabelVisual": "VISUAL",
		"vimLabelReplace": "REPLACE",
		"vimLabelCommand": "COMMAND",
		"retroCustomColors": false,
		"retroDarkBgColor": "#141010",
		"retroDarkTextColor": "#f2f2f2",
		"retroLightBgColor": "#e9e8e8",
		"retroLightTextColor": "#f7fb09",
		"powerlineColorLight1": "#2d6da4",
		"powerlineColorLight2": "#d9dce1",
		"powerlineColorLight3": "#eceef1",
		"powerlineColorLight4": "#2f8a5b",
		"powerlineColorLight5": "#b96f1e",
		"powerlineColorLight6": "#6a5cb8",
		"powerlineColorLight7": "#a2404f",
		"powerlineTextLight1": "#16181d",
		"powerlineTextLight2": "#f7f7f5",
		"powerlineTextLight3": "#5c636b",
		"powerlineTextLight4": "#2d6da4",
		"vimColorNormalLight": "#2d6da4",
		"vimColorInsertLight": "#2f8a5b",
		"vimColorVisualLight": "#6a5cb8",
		"vimColorReplaceLight": "#a03c36",
		"vimColorCommandLight": "#b96f1e",
		"powerlineSepWidth": 78,
		"statusBarFontFollowNote": true,
	},
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
		// Peek state for a hidden bar (see syncBarPeekState).
		this._peekArmed    = false;
		this._peekZoneTop  = Infinity;
		this._barPeek      = false;
		this._barPeekTimer = null;
		this._barBoxHeight = 0;
		this.retroPlinthEl = null;
		this.clockInterval    = null;
		this.batteryLevel     = null;
		this.batteryCharging  = false;
		this._batteryManager  = null;   // kept so listeners can be detached on unload
		this._batteryHandler  = null;
		this._zgLastTotalWordCount = 0;
		this._docStatsCache   = null;   // { doc, totalWC, charCount, paras } keyed on CM doc identity
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
		this._vimMapped       = false;  // whether our vim motion maps are installed
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

		// ── Surface gate ──────────────────────────────────────────────────────
		// Whether zen's sidebar collapse is currently suspended because the
		// active pane is not a note, and what to put back when it is again.
		this._sidebarsSuspended = false;
		this._suspendedLeft     = false;
		this._suspendedRight    = false;
		// Last value written to --zg-bar-reserve, so the mask pass (which
		// runs on scroll) only touches :root when the strip actually
		// changes depth.
		this._barReserve        = null;

		// ── Drag / refresh bookkeeping ────────────────────────────────────────
		this._activeDragCleanup = null;   // aborts an in-flight mask drag on unload
		this._refreshTimer      = null;   // debounced saveSettings → refresh

		// ── Live selection rAF ────────────────────────────────────────────────
		this._selectionRaf    = null;

		// ── Theme observer ────────────────────────────────────────────────────
		this._themeObserver   = null;

		await this.loadSettings();
		this._wasZenMode = this.zenOn();

		// Zen mode persists across restarts, but _wasZenMode above makes
		// setSidebarVisibility() a no-op on the first refresh() — so a vault
		// relaunched in zen mode could come back with body classes applied yet
		// sidebars open. Force the sidebars into the zen state once the
		// workspace layout exists, without touching the saved pre-zen
		// leftSidebar/rightSidebar restore state.
		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.pluginEnabled || !this.zenOn()) return;
			const ws = this.app.workspace;
			if (ws.leftSplit  && !ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.collapse();
		});

		this.addSettingTab(new WordSmithSettingTab(this.app, this));
		this.setupBattery();

		// Commands
		this.addCommand({
			id: 'toggle-retro-bar',
			name: 'Toggle the retro bar on/off',
			// Mirrors the settings-tab switch: flip the master, repaint, and
			// save with a full refresh — the refresh is what lifts/reapplies
			// the inline display:none on Obsidian's native status bar.
			callback: async () => {
				this.settings.enableRetroStatus = !this.settings.enableRetroStatus;
				this.updateStatusBar();
				this.updateRetroStatusBar();
				await this.saveSettings(true);
			}
		});
		this.addCommand({
			id: 'toggle-wordsmith',
			name: 'Toggle Word-Smith on/off',
			callback: () => this.toggleFullPlugin()
		});
		this.addCommand({
			id: 'cycle-bar-preset',
			name: 'Cycle retrobar presets',
			callback: () => this.cycleBarPreset(1)
		});

		// ── Feature toggles ───────────────────────────────────────────────
		// One shape for all of them: flip the master flag, save with an
		// immediate refresh so the change is on screen before the palette
		// has finished closing, and say which way it went. The Notice is
		// not decoration — several of these are invisible on a note that
		// happens not to trigger them (no passive voice, no long sentences),
		// and a toggle you cannot confirm reads as a toggle that did nothing.
		const featureToggle = (id, name, key, label) => {
			this.addCommand({
				id, name,
				callback: async () => {
					this.settings[key] = !this.settings[key];
					await this.saveSettings(true);
					new Notice(label + (this.settings[key] ? ' on' : ' off'));
				}
			});
		};
		featureToggle('toggle-letterbox', 'Toggle letter box mode',
			'enableLetterbox', 'Letter box mode');
		featureToggle('toggle-typewriter', 'Toggle typewriter mode',
			'enableTypewriter', 'Typewriter mode');
		featureToggle('toggle-hemingway', 'Toggle Hemingway mode',
			'hemingwayEnabled', 'Hemingway mode');
		featureToggle('toggle-syntax', 'Toggle syntax highlighting',
			'posEnabled', 'Syntax highlighting');
		featureToggle('toggle-prose-checks', 'Toggle prose checks',
			'checksEnabled', 'Prose checks');

		// Zen is not a plain flag — it collapses sidebars, hides chrome and
		// records what to put back — so it routes through its own method
		// rather than being flipped here.
		this.addCommand({
			id: 'toggle-zen',
			name: 'Toggle zen mode',
			callback: () => this.toggleZen()
		});

		this.addCommand({
			id: 'open-report',
			name: 'Show the text report',
			callback: () => this.openReportModal()
		});

		// Its own command, not a mode of the report's: they are two windows
		// now, and one of them works with no note open.
		this.addCommand({
			id: 'open-history',
			name: 'Show the writing history',
			callback: () => this.openHistoryModal()
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
			this.applyVimMotionMaps();
			this.updateWorkspaceAesthetics();
		}));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			this.syncScope();
			this.applyEditorFont();
			// Vim state is rebuilt with the editor, taking our maps with it.
			this.applyVimMotionMaps();
			this.updateWorkspaceAesthetics();
			this.scheduleExplorerPatch();
			if (this.zenActive() && this.settings.focusedFileMode) this.updateFocusedFileMode();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('editor-change', () => {
			this.updateRetroStatusBar();
			this.typewriterScroll();
		}));
		this.registerEvent(this.app.workspace.on('resize', () => {
			this.scheduleMaskPosition();
			// Re-measure: a narrower window drops tokens, a wider one puts
			// them back.
			this.scheduleFit();
		}));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			this._tabContainersCache = null;
			this._scopeGen++;
			// The masks come off in reading view, and that is a refresh rather
			// than a re-measure: letterboxActive() changes answer, so the body
			// classes and the Modes popup have to change with it.
			this.applyBodyClasses();
			// Switching between editing and reading is a layout change, and
			// nothing else re-measures the masks when it happens. Without
			// this the geometry stamped before the swap is what stays on
			// screen until an unrelated event happens to run the pass —
			// which is why issue #1 could be cleared by changing note or
			// toggling zen, and by nothing you would think to try.
			this.scheduleMaskPosition();
			if (this.zenActive() && this.settings.focusedFileMode) this.updateFocusedFileMode();
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
		// Peeking at a hidden bar. Deliberately the whole handler: everything
		// it could need is precomputed by syncBarPeekState, so a pointer move
		// with peeking disarmed costs one property read.
		this.registerDomEvent(document, 'mousemove', (evt) => {
			if (!this._peekArmed) return;
			this.onPointerForBarPeek(evt.clientY);
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
			// zenActive(), not settings.zenMode: the two disagree whenever the
			// master is off, and `zenMode` alone stays true after a bar-badge
			// exit — so this fired on Escape in a note that was not in zen,
			// and toggleZen() would then have taken it as a request to ENTER.
			if (evt.key === 'Escape' && this.settings.zenEscExits !== false && this.zenActive()) {
				const target = evt.target;
				if (target) {
					const cmEditor = target.closest('.cm-editor');
					if (cmEditor) {
						const vault = this.app.vault;
						if (vault.config && vault.config.vimMode === true) {
							// In vim, Escape belongs to vim: it is how you
							// leave insert, visual and replace, and taking it
							// meant zen simply could not be left from the
							// keyboard — the guard here used to return
							// unconditionally.
							//
							// So it is taken only in NORMAL mode, where vim
							// has nothing left to do with it. The first
							// Escape drops you to normal as always; a second
							// one leaves zen. Nothing is stolen, and the
							// habit still works.
							if (this.getVimModeKey() !== 'normal') return;
						}
					}
					if (target instanceof HTMLTextAreaElement && target.className && target.className.includes('excalidraw')) return;
				}
				const activeModal = document.querySelector('.modal');
				if (!activeModal) { this.toggleZen(); evt.preventDefault(); }
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
			// The drag handles (the titlebar strip and the top mask) are
			// gated the OTHER way round from the z-index band: not "focus
			// is in the editor" but "focus is not inside anything that must
			// own its clicks". Two field reports shaped this. Gated on
			// editor focus alone, zen had NO drag handle whenever focus sat
			// elsewhere — "I can't drag the window". Widened to focus-on-
			// <body>, it STILL failed, because Obsidian parks focus on a
			// workspace container after ordinary clicks, not on body — a
			// whitelist here is a guess about Obsidian's focus routing that
			// each release can invalidate. The blacklist is the actual
			// invariant: dragging is wrong exactly while a modal, prompt,
			// suggestion popover or menu has focus, and those are stable,
			// purpose-named containers. Menus that take no focus at all are
			// covered separately: they carry their own no-drag later in the
			// DOM than the masks, which by invariant 12 (last element wins
			// the overlap) subtracts their rectangles from any grant
			// beneath.
			const blocked = !!(active && active.closest
				&& active.closest('.modal-container, .prompt, .suggestion-container, .menu'));
			document.body.classList.toggle('zg-drag-ok', !blocked);
			// {vim} reads focus, so the bar has to repaint on it — otherwise
			// the label lags by up to a second behind the palette opening.
			this.updateRetroStatusBar();
		};
		this.registerDomEvent(document, 'focusin', updateEditorFocusClass);
		this.registerDomEvent(document, 'focusout', () => requestAnimationFrame(updateEditorFocusClass));
		// Since 1.13 settings open in a separate window, which deactivates
		// this one WITHOUT firing focusin/focusout — activeElement keeps
		// reporting .cm-editor while the user is over in settings, so the
		// class stayed set and the masks/strip kept claiming
		// -webkit-app-region: drag, which is what made the settings window
		// un-draggable. Window blur is the event that does fire for it.
		//
		// hasFocus() is consulted here and ONLY here, and only to CLEAR.
		// Folding it into updateEditorFocusClass as a requirement for
		// setting the class turned out to break the letterbox outright:
		// hasFocus() reads false with DevTools focused (and misreports in
		// other Electron corner cases), and with it gating focusin the
		// class could stay off during ordinary typing — the masks then
		// never rose above full-viewport overlays (Cursor-Smith's canvas
		// at z 10000), which reads as "the letterbox doesn't display".
		// Clear-only means the worst a misreport can do is nothing.
		this.registerDomEvent(window, 'blur', () => requestAnimationFrame(() => {
			if (!document.hasFocus()) {
				document.body.classList.remove('zg-editor-focused');
				// And the drag class: this window's regions must not stay
				// claimed while another window (1.13 settings, a pop-out)
				// is the one being used — the original un-draggable
				// settings bug, on a second path.
				document.body.classList.remove('zg-drag-ok');
				this.updateRetroStatusBar();
			}
		}));
		this.registerDomEvent(window, 'focus', () => requestAnimationFrame(updateEditorFocusClass));
		updateEditorFocusClass();

		// Vault events
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (this.wordCountCache) this.wordCountCache.delete(file.path);
			this.scheduleExplorerPatch();
			// Same event, one more reader. The history is debounced and gated
			// on its own opt-in inside historyNoteChange, so this line costs a
			// function call in a vault that has never turned it on.
			this.historyNoteChange(file);
			// The store changing under us — synced from another device, or
			// edited by hand — is read back rather than ignored. This is what
			// replaces the "find it again" button: there is nothing to press,
			// because the plugin notices.
			this.historyAdopt(file);
		}));
		this.registerEvent(this.app.metadataCache.on('changed', (file) => {
			if (this._fmCache && file && file.path) delete this._fmCache[file.path];
			this._scopeGen++;
			// {backlinks} caches a walk of the whole vault against this.
			this._linkGen = (this._linkGen || 0) + 1;
		}));
		// Fired once when the vault's links have all been resolved at startup,
		// and again after a batch of changes settles. Without it the first
		// backlink count of a session is whatever was resolvable at load.
		this.registerEvent(this.app.metadataCache.on('resolved', () => {
			this._linkGen = (this._linkGen || 0) + 1;
		}));
		// A store that appears in the vault — first sync of a new install, or a
		// file the user pasted in — is picked up without being asked for.
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (this._historyPath || !this.settings.historyTracking) return;
			this.historyAdopt(file);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (this.wordCountCache) this.wordCountCache.delete(oldPath);
			this.renameScopePath(oldPath, file.path);
			this.historyRenamePath(oldPath, file.path);
			// Folders fire this too, so a folder rename carries the goals of
			// everything inside it.
			if (this.renameGoalPaths(oldPath, file.path)) this.saveSettings(true);
		}));
		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (this.wordCountCache) this.wordCountCache.delete(file.path);
			this.removeScopePath(file.path);
			this.historyForgetPath(file.path);
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
		this.scheduleVimMotionMaps();

		this.refresh();

		// The surface gate reads the most recent leaf in the MAIN area, and
		// during onload there is not one: every pane the workspace is about
		// to restore is still to come, so the refresh above necessarily
		// answers "not a note" and stands the whole plugin down. Ask again
		// once there is something to ask about.
		//
		// Registered here, at the end of onload, and not beside the zen
		// sidebar collapse near the top: onLayoutReady fires SYNCHRONOUSLY
		// when the layout is already ready, which is exactly what happens
		// when the plugin is switched on from the settings page — a refresh
		// registered up there would run against a half-built plugin.
		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.pluginEnabled) return;
			this.refresh();
			this.checkStylesheetVersion();
			// Read the store once the vault's file list exists — finding the
			// file means looking through it. Nothing is recorded until this
			// resolves; historyCapture waits on the same promise, so an edit
			// made during startup is counted rather than dropped.
			if (this.settings.historyTracking) this.historyLoad();
		});
	}

	// Whether styles.css in the vault matches this build.
	//
	// Deploying means copying main.js, styles.css AND manifest.json, and
	// copying only the first is a silent, total failure of every rule the
	// stylesheet holds — which reads as "the feature does nothing" and is
	// indistinguishable from a bug in the code. It has cost this project
	// several rounds. The check runs once at layout-ready and says the one
	// thing that would have saved them.
	//
	// Read from a probe rather than from :root directly: a custom property is
	// inherited, so any element resolves it, and body is guaranteed present.
	checkStylesheetVersion() {
		let found = null;
		try {
			const raw = getComputedStyle(document.body)
				.getPropertyValue('--zg-stylesheet-version').trim();
			found = raw === '' ? null : parseInt(raw, 10);
		} catch (_) { return; }
		if (found === ZG_STYLESHEET_VERSION) return;
		// Never nag twice in a session, and never at all if it is somehow
		// NEWER than the script expects — that is a half-finished upgrade in
		// the other direction and the stylesheet is not the thing at fault.
		if (this._styleWarned || (found != null && found > ZG_STYLESHEET_VERSION)) return;
		this._styleWarned = true;
		const what = found == null
			? 'styles.css looks missing or out of date'
			: 'styles.css is out of date (v' + found + ', expected v' + ZG_STYLESHEET_VERSION + ')';
		console.warn('Word-Smith: ' + what
			+ ' — copy main.js, styles.css AND manifest.json into '
			+ '<vault>/.obsidian/plugins/word-smith/, then reload Obsidian.');
		new Notice('Word-Smith: ' + what + '.\nCopy styles.css into the plugin '
			+ 'folder and reload Obsidian.', 12000);
	}

	onunload() {
		// Anything counted since the last lazy save, before the timers that
		// would have written it are torn down. Synchronous-looking on purpose:
		// the promise is not awaited because onunload cannot await, but the
		// saveData call is issued before anything else is dismantled.
		if (this._historyTimers) {
			for (const t of this._historyTimers.values()) window.clearTimeout(t);
			this._historyTimers.clear();
		}
		if (this.settings && this.settings.historyTracking) {
			try { this.historyFlush(true); } catch (_) {}
		}
		// The linger timer holds a reference to this plugin instance and
		// would keep it alive past unload.
		this.endBarPeek(true);
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
		// Leave zen cleanly. The MASTER goes down, matching how toggleZen()
		// leaves — and nothing is saved here, so data.json keeps both flags
		// and zen resumes when the plugin is loaded again.
		if (this.zenOn()) {
			this.settings.zenEnabled = false;
			this.applyBodyClasses();
			this.setSidebarVisibility();
		}
		this.settings.vimSoftWrapMotion = false;
		this.applyVimMotionMaps();
		this.clearAllBodyState();
		// Only the containers focused-file mode actually wrote to, and back to
		// what they held before. See _focusTabRestore.
		this._focusTabRestore();
	}

	// ════════════════════════════════════════════════════════════════════════
	// SETTINGS: load, save, migrate
	// ════════════════════════════════════════════════════════════════════════

	async loadSettings() {
		// The RAW file is kept alongside the merged copy: a migration that
		// asks "did this vault ever have an opinion about X" cannot ask the
		// merged object, where every key is present because the defaults put
		// it there.
		const raw = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);

		// Immediately, not lazily. That merge is SHALLOW, so every nested
		// default is shared by reference with DEFAULT_SETTINGS until something
		// replaces it — and the baseline cache is written on a hot path.
		// Building the real object here means no later code path can be the
		// first to touch it and mutate the table.
		this.historyBaselines();

		// letterboxCustomColors arrived in 1.11, and the four arrow/line
		// pickers it now gates were unconditional before it. A vault that had
		// picked its own colours WAS using them, so the toggle comes up on
		// for that vault and its letterbox looks the same after the upgrade
		// as before. One still on the shipped four gets the new default,
		// which is to follow the theme's text colour.
		//
		// Guarded on the key being absent from the raw file, so this decides
		// exactly once and can never overrule a choice made later.
		if (raw.letterboxCustomColors === undefined) {
			this.settings.letterboxCustomColors = ['arrowDarkColor', 'arrowLightColor',
				'lineDarkColor', 'lineLightColor']
				.some(k => raw[k] !== undefined && raw[k] !== DEFAULT_SETTINGS[k]);
		}
		// 1.43.4: editorFont shipped with a real font name as its default, so
		// every vault that ever saved its settings has that name written into
		// data.json whether or not anyone chose it. Changing the default alone
		// would therefore fix nothing for the people who reported it.
		//
		// Cleared exactly once, and only when the value is still character-for
		// -character the old default: a writer who picked "JetBrains Mono" from
		// their own list has a different string and is not touched. Someone who
		// deliberately chose the identical face loses it once and re-picks it
		// from the Text Options tab — the wrong side of that trade is the one
		// where a plugin keeps overriding a font nobody asked it to.
		if (!this.settings.editorFontDefaultCleared) {
			if (this.settings.editorFont === 'JetBrainsMono Nerd Font') {
				this.settings.editorFont = '';
			}
			this.settings.editorFontDefaultCleared = true;
		}
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
		// Positioning the gutter against the text column was more trouble
		// than the distance it saved; the numbers sit where CodeMirror puts
		// them again.
		for (const dead of ['lineNumberGap', 'lineNumberWidth', 'showLineNumbers',
			'lineNumberMode', 'lineNumberVisual', 'lineNumberSize']) {
			delete this.settings[dead];
		}
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
		// The unified-colours feature and the preset system (saved looks +
		// share codes) were removed. Their keys are dropped from data.json
		// so a hand-read config does not suggest features that no longer
		// exist; any override an older version left inline on body.style is
		// wiped by clearChromeColors() on the first apply pass.
		for (const dead of ['uiColorsEnabled', 'uiBgColor', 'uiTextColor',
			'uiUnifyChrome', 'presets']) {
			delete this.settings[dead];
		}
		// The file-goal hairline (a progress line on the bar's top edge) was
		// removed. Its toggle, its gauge-style selector and the three goal
		// colours went with it — those colours tinted the hairline and
		// nothing else, so keeping pickers for them would have meant
		// controls that change nothing. folderGoalHairline was already dead
		// before this and is swept up here too.
		for (const dead of ['fileGoalHairline', 'folderGoalHairline',
			'goalGaugeStyle', 'goalShowGauge', 'goalCustomColors',
			'goalColor', 'fileGoalColor', 'folderGoalColor']) {
			delete this.settings[dead];
		}
		// The note mini-theme ("Customise background and text") was removed
		// outright. It repainted the whole window from two picked colours
		// and never became reliable across themes; what survives is the
		// cleanup below, because the two colours it stamped lived inline on
		// body.style and an inline custom property outlives an upgrade.
		for (const dead of ['noteCustomColors', 'noteDarkBgColor',
			'noteDarkTextColor', 'noteLightBgColor', 'noteLightTextColor']) {
			delete this.settings[dead];
		}
		// readTimeWpm: {readtime} is fixed at 200 wpm now.
		// dateFormat:  {date} became {dd} {mm} {yyyy} {yy}, composed in the
		//              row format, so there is no format string to store.
		// powerlineCapStyle: the end cap follows the row's own dividers.
		// statusBarPadSide (a left/right inset for the bar) never took effect
		// in the field across three implementations — margin, left/right from
		// a custom property, and an inline write on the element — so it was
		// removed rather than left as a control that does nothing.
		for (const dead of ['readTimeWpm', 'dateFormat', 'powerlineCapStyle',
			'statusBarPadSide']) {
			delete this.settings[dead];
		}
		// Row height range moved from 20-60 to 12-30. A saved value outside
		// the new bounds has to be clamped here: the slider would render
		// pinned at an end while the bar kept drawing at the old size, and
		// nothing the user did to the control would change anything until
		// they happened to drag past the stored value.
		// Text colours went from six to four. A saved ;5 or ;6 in a row now
		// wraps to ;1/;2 rather than failing, so the format strings are left
		// alone; only the dead keys are swept.
		delete this.settings.powerlineText5;
		delete this.settings.powerlineText6;
		if (typeof this.settings.statusBarHeight === 'number') {
			this.settings.statusBarHeight =
				Math.max(12, Math.min(30, this.settings.statusBarHeight));
		}
		// {date} in saved rows would otherwise render as the literal text
		// "{date}" forever. Rewritten to the pair it almost always meant;
		// anyone wanting a different order edits the row.
		for (const row of (this.settings.statusRows || [])) {
			for (const slot of ['left', 'center', 'right']) {
				if (typeof row[slot] === 'string' && row[slot].includes('{date}')) {
					row[slot] = row[slot].replace(/\{date\}/g, '{dd}/{mm}');
				}
			}
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
			// Goal tokens are gone from the bar — goals live in settings and
			// on the hairline edges now. Saved bars that still carry the old
			// tokens would otherwise print them as literal text.
			if (Array.isArray(this.settings.statusRows)) {
				for (const r of this.settings.statusRows) {
					for (const k of ['left', 'center', 'right']) {
						if (r && typeof r[k] === 'string' && /\{(?:goal|filegoal|foldergoal)\}/.test(r[k])) {
							r[k] = r[k].replace(/\{(?:goal|filegoal|foldergoal)\}/g, '').replace(/  +/g, ' ').trim();
						}
					}
				}
			}
			delete this.settings.goalLabel;
		}
		// The ASCII arrow style was removed (too similar to Chevron) — carry
		// anyone still on it over to the closest replacement.
		if (this.settings.arrowStyle === 'ascii') {
			this.settings.arrowStyle = 'chevron';
		}
		// The vim command line was restyled shorter, so any height measured
		// under the old rules over-reserves the gutter and leaves the bar
		// floating above the panel until the next `:` re-measures. Drop it
		// once and let it be taken again; 0 simply means "not measured yet"
		// and falls back to a snapped row.
		if (this.settings.vimPanelHeight > 34) this.settings.vimPanelHeight = 0;
		// The cursor-position memory was removed. It kept a growing
		// path -> {line, ch, scroll} map in data.json, so drop it rather
		// than leave a dead table there forever.
		delete this.settings.restoreCursorPosition;
		delete this.settings.cursorMemory;
		// Transient UI state that older versions leaked into data.json, plus
		// settings for the removed exit button. Dropped on next save.
		delete this.settings._lastArrowCount;
		delete this.settings.exitButtonVisibility;
		delete this.settings.autoHideButtonOnDesktop;
		// Zen padding, removed. The bottom half never worked in the field
		// (five attempts — see the tombstone in ARCHITECTURE.md) and the
		// top half went with it rather than leaving half a group behind.
		// Dropped from data.json on the next save so nobody carries two
		// settings that nothing reads.
		delete this.settings.topPadding;
		delete this.settings.bottomPadding;
		// {writechecks} became {prose} in 1.10. Rewritten in place so the
		// panel shows the current spelling; the substitution table still
		// accepts the old one, which is what keeps a share code or a preset
		// written before the rename working. Both halves are needed — this
		// reaches only this vault's rows, and the alias reaches everything
		// that arrives later.
		if (Array.isArray(this.settings.statusRows)) {
			for (const row of this.settings.statusRows) {
				if (!row) continue;
				for (const slot of ['left', 'center', 'right']) {
					if (typeof row[slot] === 'string' && row[slot].includes('{writechecks}')) {
						row[slot] = row[slot].replace(/\{writechecks\}/g, '{prose}');
					}
				}
			}
		}

		// Seed the shipped bar presets into the library, exactly once. The
		// flag is what makes a deleted built-in stay deleted — the obvious
		// version of this (add any name that is missing) resurrects them on
		// every launch, so "delete" would only ever mean "until restart".
		// The identity check is the third clause for the usual reason: the
		// merge in loadSettings is shallow, so on a vault that has never saved
		// one, `settings.barPresets` IS the literal in DEFAULT_SETTINGS, and
		// the seeding below would write the shipped presets into the defaults
		// table rather than into this vault's copy.
		if (!this.settings.barPresets || typeof this.settings.barPresets !== 'object'
			|| this.settings.barPresets === DEFAULT_SETTINGS.barPresets) {
			this.settings.barPresets = {};
		}
		if (!this.settings.barPresetsSeeded) {
			for (const [name, snap] of Object.entries(DEFAULT_BAR_PRESETS)) {
				// Never overwrite: an upgrade from a version that predates the
				// flag may already hold a user's own preset under one of these
				// names.
				if (!(name in this.settings.barPresets)) {
					this.settings.barPresets[name] = barCloneValue(snap);
				}
			}
			this.settings.barPresetsSeeded = true;
		}

		// The bar a brand-new vault comes up with.
		//
		// The DEFAULT_SETTINGS values for BAR_KEYS are frozen — barShareFields
		// emits only what DIFFERS from them and the recipient fills the rest
		// back in from their own copy, so retuning one silently changes what
		// every share code already in the wild decodes to (see the note above
		// BAR_KEYS). The defaults therefore stay exactly as they are, and the
		// opening bar is chosen by APPLYING a preset over them instead. Same
		// result on screen, no reinterpretation of anyone's code, and the
		// presets that leave a key unstated still inherit what they always
		// did.
		//
		// Guarded on the saved file being empty, not on a flag: an empty
		// data.json means this vault has never expressed an opinion about
		// anything, which is the only case where overwriting the bar is
		// certainly safe. An upgrading vault — including one that never
		// touched the Retro Bar tab — keeps the bar it has.
		if (!Object.keys(raw).length && DEFAULT_BAR_PRESETS.Plain) {
			this.applyBarSnapshot(DEFAULT_BAR_PRESETS.Plain);
			this._activeBarPreset = 'Plain';
		}
	}

	// Every box in a powerline row, with the colour it paints and where its
	// edges actually land.
	//
	// Written because this hairline has now survived two fixes that were
	// reasoned out rather than measured. Both were real bugs and neither was
	// this one. What is missing is not another theory: it is the rendered
	// geometry of the joint — which element covers which pixel, in what
	// colour, at what fractional offset.
	//
	// Console only:
	//   app.plugins.plugins['word-smith'].barGeometry()
	barGeometry() {
		const L = [];
		const n = (v) => Math.round(v * 100) / 100;
		try {
			const bar = this.retroStatusBarEl;
			if (!bar) return 'Word-Smith: the retro bar is not up.';
			L.push('Word-Smith ' + (this.manifest ? this.manifest.version : '?') + ' bar geometry');
			const ss = getComputedStyle(document.body)
				.getPropertyValue('--zg-stylesheet-version').trim();
			L.push('styles.css: v' + (ss || '(absent)') + ' — script expects v'
				+ ZG_STYLESHEET_VERSION
				+ (String(ZG_STYLESHEET_VERSION) === ss ? '  OK' : '  <-- STALE, fix this first'));
			const bs = getComputedStyle(bar);
			L.push('bar: ' + n(bar.getBoundingClientRect().width) + 'px wide, bg ' + bs.backgroundColor);
			L.push('rows: ' + this.getStatusRows().map(r => JSON.stringify(r.left)).join(' | '));

			for (const section of Array.from(bar.querySelectorAll('.zg-status-section'))) {
				const kids = Array.from(section.children);
				if (!kids.length) continue;
				L.push('');
				L.push(section.className.replace('zg-status-section ', '') + ':');
				const sr = section.getBoundingClientRect();
				let prevRight = null, prevPaint = null;
				for (const el of kids) {
					const r  = el.getBoundingClientRect();
					const cs = getComputedStyle(el);
					const shape = el.getAttribute && el.getAttribute('data-shape');
					const cap   = el.getAttribute && el.getAttribute('data-cap');
					// For an SVG the paint is in its rects, not its own style.
					const fills = Array.from(el.querySelectorAll ? el.querySelectorAll('rect,path') : [])
						.map(c => c.getAttribute('fill') + '@' + c.getAttribute('x'));
					L.push('  ' + (shape ? 'SEP ' + shape + (cap ? '/' + cap : '') : 'SEG')
						+ '  x ' + n(r.left - sr.left) + ' → ' + n(r.right - sr.left)
						+ '  w ' + n(r.width));
					L.push('      margin ' + cs.marginLeft + ' / ' + cs.marginRight
						+ '   z ' + cs.zIndex + '   pos ' + cs.position
						+ (shape ? '' : '   bg ' + cs.backgroundColor));
					if (fills.length) L.push('      fills ' + fills.join('  '));
					// The joint itself: where this box starts against where
					// the last one ended. A gap means bar showing through; an
					// overlap means one of them is covering the other, and
					// WHICH one is covering is the whole question.
					if (prevRight != null) {
						const d = n(r.left - prevRight);
						L.push('      joint: ' + (d === 0 ? 'flush'
							: d > 0 ? 'GAP of ' + d + 'px' : 'overlap of ' + (-d) + 'px')
							+ (Number.isInteger(d) ? '' : '   <-- fractional'));
					}
					prevRight = r.right; prevPaint = cs.backgroundColor;
				}
			}
		} catch (e) {
			L.push('threw: ' + (e && e.message));
		}
		const out = L.join('\n');
		try { console.log(out); } catch (_) {}
		return out;
	}

	// Everything the bottom-inset rules read, as it actually resolved.
	//
	// No longer a palette command — it was one while the zen padding bug was
	// being chased and is clutter now that the feature is gone. Kept because
	// it is the tool that finally answered a question three rounds of
	// reasoning could not, and it costs nothing sitting here. Call it from
	// the developer console when a geometry report is needed:
	//
	//   app.plugins.plugins['word-smith'].layoutDiagnostic()
	//
	// Deliberately reports the CHAIN — pane, editor, scroller — rather than
	// just the element a rule targets: the failure both previous attempts hit
	// was a rule applying correctly to a box that turned out not to be the one
	// constraining the editor's height. That only shows up when the boxes are
	// compared against each other.
	layoutDiagnostic() {
		const L = [];
		const px = (n) => (n == null ? '?' : Math.round(n * 10) / 10 + 'px');
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return 'Word-Smith: no markdown view is active.';
			const pane     = view.contentEl.querySelector('.markdown-source-view')
				|| view.contentEl.querySelector('.markdown-reading-view');
			const editor   = view.contentEl.querySelector('.cm-editor');
			const scroller = view.contentEl.querySelector('.cm-scroller');
			const leaf     = pane && pane.closest ? pane.closest('.workspace-leaf') : null;
			const bar      = this.retroStatusBarEl;

			L.push('Word-Smith ' + (this.manifest ? this.manifest.version : '?') + ' layout diagnostic');
			// First line after the header, because it invalidates everything
			// below it: with a stale stylesheet the rules simply are not
			// loaded, and every computed inset here will read 0 for that
			// reason rather than for any reason worth debugging.
			const ss = getComputedStyle(document.body)
				.getPropertyValue('--zg-stylesheet-version').trim();
			L.push('styles.css: v' + (ss || '(absent)')
				+ ' — script expects v' + ZG_STYLESHEET_VERSION
				+ (String(ZG_STYLESHEET_VERSION) === ss ? '  OK' : '  <-- STALE, fix this first'));
			L.push('body: ' + Array.from(document.body.classList)
				.filter(c => /^(zg-|zenmode|theme-)/.test(c)).join(' '));
			L.push('leaf: ' + (leaf ? Array.from(leaf.classList).join(' ') : '(none)'));
			L.push('pane: ' + (pane ? pane.className : '(none)'));

			const rootStyle = getComputedStyle(document.documentElement);
			for (const v of ['--zg-bar-reserve',
				'--zg-status-bar-height', '--zg-vim-gutter']) {
				L.push('  ' + v + ' = ' + (rootStyle.getPropertyValue(v).trim() || '(unset)'));
			}
			L.push('  zenActive = ' + this.zenActive()
				+ ', barIsHidden = ' + this.barIsHidden());

			const box = (name, el) => {
				if (!el) { L.push(name + ': (none)'); return; }
				const cs = getComputedStyle(el);
				const r  = el.getBoundingClientRect();
				L.push(name + ':');
				L.push('  rect      top ' + px(r.top) + '  bottom ' + px(r.bottom)
					+ '  height ' + px(r.height));
				L.push('  padding-bottom ' + cs.paddingBottom
					+ '   margin-bottom ' + cs.marginBottom);
				L.push('  min-height ' + cs.minHeight
					+ '  height ' + cs.height + '  box-sizing ' + cs.boxSizing
					+ '  position ' + cs.position
					+ '  display ' + cs.display
					+ (cs.display.includes('flex') ? ' (' + cs.flexDirection + ')' : '')
					+ '  flex ' + cs.flex + '  overflow-y ' + cs.overflowY);
			};
			box('pane', pane);
			box('.cm-editor', editor);
			box('.cm-scroller', scroller);

			if (bar) {
				const r = bar.getBoundingClientRect();
				L.push('bar: top ' + px(r.top) + '  height ' + px(r.height));
			} else {
				L.push('bar: (not present)');
			}
			L.push('injected <style>: ' + (this.styleEl && this.styleEl.isConnected
				? this.styleEl.textContent.length + ' chars, min-height rule '
					+ (/cm-scroller \{ min-height: 0/.test(this.styleEl.textContent) ? 'present' : 'MISSING')
				: 'ABSENT'));
			L.push('caretFloorY = ' + px(this.caretFloorY())
				+ '   viewport height = ' + px(window.innerHeight));

			// The question both failed fixes were really asking. If this is
			// positive the editor still reaches under the bar, whatever the
			// stylesheet says, and no CSS inset on an ancestor is reaching it.
			if (scroller) {
				const over = scroller.getBoundingClientRect().bottom - this.caretFloorY();
				L.push('scroller reaches ' + px(over) + ' PAST the caret floor'
					+ (over > 1 ? '  <-- the inset is not shortening the editor'
						: '  <-- the editor stops clear, as intended'));
			}
		} catch (e) {
			L.push('threw: ' + (e && e.message));
		}
		return L.join('\n');
	}

	// The lowest point on screen the caret may occupy: whichever of the retro
	// bar's top edge and the bottom letterbox mask's top edge is higher,
	// lifted further by zen's own bottom inset so the caret stops above the
	// padding rather than inside it.
	//
	// Measured from the elements themselves rather than rebuilt from
	// settings, for the same reason as --zg-bar-reserve: the plain bar's
	// borders are stamped inline and are not in --zg-status-bar-height, and
	// the mask's height is clamped against the pane at paint time. With
	// nothing down there (bar off or slid away, letterbox off) the floor is
	// the window's own bottom edge, so zen padding alone still holds the
	// caret up.
	//
	// visualViewport rather than innerHeight: on mobile the on-screen
	// keyboard takes the bottom of the window and innerHeight does not know.
	// ── Peeking at a hidden bar ───────────────────────────────────────────
	// Bring the bar back while the pointer is near the strip it hides in, and
	// let it linger a moment after the pointer leaves.
	//
	// Driven by pointer COORDINATES, not by an element. The comment on the
	// slide-away rule in styles.css records three attempts at a screen-edge
	// hover strip, all of which ended up fighting Obsidian's own chrome: an
	// invisible full-width element at the window edge is a bad neighbour to
	// the status bar, the window controls and anything else living there,
	// however carefully it is layered. A comparison against clientY has no
	// neighbours at all.
	//
	// The handler is on document mousemove, which this codebase has removed
	// once before on cost grounds — so everything expensive is hoisted out of
	// it. The common case (peeking not armed) is one boolean read, and the
	// zone's top edge is cached rather than measured per frame.
	barPeekArmed() {
		return !!(this._peekArmed);
	}

	// Recomputed wherever the bar's height or hidden state can change, so the
	// move handler never measures anything.
	syncBarPeekState() {
		const armed = !!(this.settings.pluginEnabled
			&& this.retroStatusBarEl
			&& this.barIsHidden()
			&& (Number(this.settings.barPeekMs) || 0) > 0);
		this._peekArmed = armed;
		if (!armed) this.endBarPeek(true);
		// The strip the bar occupies when it is out, plus a little reach so
		// the pointer does not have to land exactly on a 28px band.
		const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
		const box = (this._barBoxHeight || 0) + this.vimGutterHeight();
		this._peekZoneTop = Math.max(0, vh - box - 26);
	}

	onPointerForBarPeek(clientY) {
		if (!this._peekArmed) return;
		if (clientY >= this._peekZoneTop) this.beginBarPeek();
		else if (this._barPeek) this.scheduleBarPeekEnd();
	}

	beginBarPeek() {
		if (this._barPeekTimer) { window.clearTimeout(this._barPeekTimer); this._barPeekTimer = null; }
		if (this._barPeek) return;
		this._barPeek = true;
		this.setBarPeekClass(true);
	}

	// Leaving the zone starts the linger rather than ending it: the bar is
	// most useful in the second after you have glanced away from it, and a
	// bar that vanishes the instant the pointer moves is one you cannot read.
	scheduleBarPeekEnd() {
		if (!this._barPeek || this._barPeekTimer) return;
		const ms = Math.max(0, Number(this.settings.barPeekMs) || 0);
		this._barPeekTimer = window.setTimeout(() => {
			this._barPeekTimer = null;
			this.endBarPeek();
		}, ms);
	}

	endBarPeek(immediate) {
		if (this._barPeekTimer) { window.clearTimeout(this._barPeekTimer); this._barPeekTimer = null; }
		if (!this._barPeek) return;
		this._barPeek = false;
		this.setBarPeekClass(false, immediate);
	}

	// The slide is the same one the hide command uses, so it borrows the same
	// transition class — which exists only while something is moving, because
	// a permanent `transition: transform` promotes the bar to its own layer
	// and its text loses subpixel antialiasing (see styles.css).
	setBarPeekClass(on, skipAnim) {
		const body = document.body;
		if (!skipAnim) {
			body.classList.add('zg-bar-anim');
			window.clearTimeout(this._barAnimT);
			this._barAnimT = window.setTimeout(
				() => document.body.classList.remove('zg-bar-anim'), 350);
		}
		body.classList.toggle('zg-bar-peek', !!on);
	}

	// ─────────────────────────────────────────────────────────────────────────

	// Whether Obsidian's Vim key bindings are on. The vim ":" line only
	// exists when they are, and it is the reason the gutter is reserved.
	isVimKeysOn() {
		try {
			const vault = this.app.vault;
			return !!(vault && vault.config && vault.config.vimMode === true);
		} catch (_) { return false; }
	}

	// Where the chrome starts: the top of whatever opaque thing occupies the
	// bottom of the window, or the window's own edge if nothing does.
	chromeFloorY() {
		let limit = 0;
		try {
			limit = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
		} catch (_) { return 0; }
		const bottom = limit;
		if (!this.barIsHidden() && this.settings.enableRetroStatus && this.retroStatusBarEl) {
			try {
				const r = this.retroStatusBarEl.getBoundingClientRect();
				if (r.height > 0 && r.top > 0 && r.top < limit) limit = r.top;
			} catch (_) { /* not laid out yet — the window edge will do */ }
		}
		// The vim ":" line opens into the gutter at the very bottom of the
		// window, INDEPENDENTLY of the bar: it is fixed to bottom: 0 and the
		// bar sits above it. So the gutter has to come off even when the bar
		// does not — with the bar hidden (by command or by zen's option) the
		// floor was the window edge, and the caret went straight under the
		// command line. A no-op while the bar is showing, since the bar's own
		// top edge is already a gutter's height further up.
		if (this.isVimKeysOn()) {
			const gutter = this.vimGutterHeight();
			if (gutter > 0 && bottom - gutter < limit) limit = bottom - gutter;
		}
		// The letterbox band is opaque, so a caret under it is as hidden as
		// one under the bar — and worse, because the mask is the feature that
		// is meant to be framing the writing rather than covering it.
		const mask = this.maskEdge(this.maskBottomEl, 'top');
		if (mask != null && mask < limit) limit = mask;
		return limit;
	}

	// Breathing room, clamped. The caret sitting exactly on the chrome's edge
	// is legible but reads as crowded, and at the bottom of a note the last
	// line ends up flush against the bar.
	caretMargin() {
		const n = Number(this.settings.caretMarginPx);
		if (!isFinite(n) || n <= 0) return 0;
		return Math.min(200, n);
	}

	caretFloorY() {
		return this.chromeFloorY() - this.caretMargin();
	}

	// The same line at the top of the window: the top letterbox mask's lower
	// edge, plus the same breathing room. With no letterbox there is nothing
	// up there, so this is the margin alone — which is still worth having,
	// because in zen the editor runs to the top of the window.
	caretCeilingY() {
		const mask = this.maskEdge(this.maskTopEl, 'bottom');
		return (mask != null && mask > 0 ? mask : 0) + this.caretMargin();
	}

	// One edge of a mask, or null when it is absent, off or unmeasured.
	// Guarded rather than trusted: the masks are torn down and rebuilt on
	// layout changes, so this can be called against an element that has just
	// been detached.
	maskEdge(el, edge) {
		if (!el || !this.letterboxActive()) return null;
		try {
			if (el.isConnected === false) return null;
			const r = el.getBoundingClientRect();
			if (!(r.height > 0)) return null;
			return r[edge];
		} catch (_) { return null; }
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Bar preset CRUD
	// ─────────────────────────────────────────────────────────────────────────
	// The library lives on this.settings, so saveSettings persists it with
	// everything else and there is no second store to keep in step.

	getBarPresets() {
		if (!this.settings.barPresets || typeof this.settings.barPresets !== 'object') {
			this.settings.barPresets = {};
		}
		return this.settings.barPresets;
	}

	// Saves under `name`, overwriting silently if it exists — that is what
	// makes Edit work: load, adjust, save under the same name.
	async saveBarPreset(name) {
		const snap = {};
		for (const k of BAR_KEYS) {
			// Deep-copied. statusRows is an array of objects, and storing the
			// live reference would make every later edit in the panel rewrite
			// the preset it was saved from.
			snap[k] = barCloneValue(this.settings[k]);
		}
		this.getBarPresets()[name] = snap;
		await this.saveSettings(true);
	}

	async loadBarPreset(name) {
		const preset = this.getBarPresets()[name];
		if (!preset) return false;
		this.applyBarSnapshot(preset);
		await this.saveSettings(true);
		this._activeBarPreset = name;
		return true;
	}

	// Writes a snapshot over the live settings. Only BAR_KEYS are touched, so
	// nothing outside the Retro Bar tab can be reached by a preset — including
	// one that arrived as a share code from a stranger, which is the case
	// worth being strict for.
	applyBarSnapshot(preset) {
		const full = barPresetWithDefaults(preset);
		for (const k of BAR_KEYS) this.settings[k] = full[k];
		// getStatusRows() and the panel both assume three row objects exist
		// whatever statusBarRows says, so a code carrying a short (or absent)
		// array must not leave the panel reading row 2 of undefined.
		if (!Array.isArray(this.settings.statusRows)) this.settings.statusRows = [];
		while (this.settings.statusRows.length < 3) {
			this.settings.statusRows.push({ left: '', center: '', right: '' });
		}
		for (const row of this.settings.statusRows) {
			for (const slot of ['left', 'center', 'right']) {
				if (typeof row[slot] !== 'string') row[slot] = '';
			}
		}
	}

	// Step through the preset library from whichever one was loaded last.
	//
	// Names it out loud. A bar preset can change one colour or the whole
	// layout, and stepping past a subtle one with no feedback reads as the
	// command having done nothing — so the Notice is the confirmation, not a
	// courtesy.
	//
	// `_activeBarPreset` is set by loadBarPreset and is deliberately NOT
	// persisted: after a restart the first press starts from the top of the
	// list, which is honest, rather than resuming from a preset the settings
	// may no longer match because the writer edited the bar by hand since.
	async cycleBarPreset(direction) {
		const presets = this.getBarPresets();
		const names = Object.keys(presets);
		if (!names.length) {
			new Notice('Word-Smith: no bar presets saved yet.');
			return;
		}
		if (!this.settings.enableRetroStatus) {
			new Notice('Word-Smith: the retro bar is off.');
			return;
		}
		// indexOf returns -1 for an unknown or absent name, which is exactly
		// what makes the first forward step land on index 0.
		const at = names.indexOf(this._activeBarPreset);
		const next = names[(at + direction + names.length) % names.length];
		await this.loadBarPreset(next);
		new Notice('Bar preset: ' + next);
	}

	async deleteBarPreset(name) {
		delete this.getBarPresets()[name];
		await this.saveSettings(true);
	}

	// Adds an imported code to the library without loading it — the writer
	// decides when to switch. Returns the name it was filed under, or null if
	// the code was not one of ours.
	async importBarPreset(code) {
		const parsed = barCodeToPreset(code);
		if (!parsed) return null;
		const presets = this.getBarPresets();
		// Never silently overwrite something the writer built. A colliding
		// name gets a suffix instead, and the row that appears carries it, so
		// the collision is visible rather than a preset quietly changing.
		let name = parsed.name;
		if (name in presets) {
			let n = 2;
			while ((parsed.name + ' ' + n) in presets) n++;
			name = parsed.name + ' ' + n;
		}
		presets[name] = parsed.snap;
		await this.saveSettings(true);
		return name;
	}

	// ─────────────────────────────────────────────────────────────────────────

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
		// After setSidebarVisibility, never before: that is the zen toggle's
		// own pass and it must see the sidebars as the toggle left them.
		this.syncSurfaceSidebars();
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
			'zenmode-hide-linked-mentions', 'zg-text-pad', 'zg-para-indent', 'zg-justify',
			'zg-masks-active', 'zg-retrobar-active', 'zg-pos-dim', 'zg-hemingway-active',
			'zg-line-limit', 'zg-editor-focused', 'zg-font-active', 'zg-rtl', 'zg-vim-panel-open',
				'zg-bar-hidden', 'zg-bar-anim', 'zg-bar-peek', 'zg-titlebar-match', 'zg-drag-ok'
		);
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// The titlebar marker lives on the element, not on body, so the
		// class list above does not reach it.
		const mainTb = document.querySelector('.titlebar.zg-main-titlebar');
		if (mainTb) mainTb.classList.remove('zg-main-titlebar');
		// Custom properties are set on body and :root, not by class, so the
		// list above does not reach them.
		for (const prop of ['--zg-bg', '--zg-text', '--zg-font',
			// Left behind by the removed note mini-theme: inline custom
			// properties on body survive a plugin upgrade, so a vault that
			// once had the palette on would keep a recoloured mask and
			// title bar forever without this sweep.
			'--zg-note-bg', '--zg-note-text', '--zg-note-bg-alt']) {
			document.body.style.removeProperty(prop);
		}
		// The pane reservation is a :root property plus a class on each
		// covered leaf — neither reachable from the body list above. Left
		// behind, the class is inert (its rule is gated on
		// zg-retrobar-active) but the padding would survive a disable in
		// any vault whose snippet happens to match on it.
		document.documentElement.style.removeProperty('--zg-bar-reserve');
		this._barReserve = null;
		document.querySelectorAll('.zg-bar-overlap')
			.forEach(el => el.classList.remove('zg-bar-overlap'));
	}

	disablePlugin() {
		// The chrome override lives on body, not in the stylesheet, so it
		// outlives removeStyleEl() unless it is cleared by hand.
		this.clearChromeColors();
		this.endBarPeek(true);
		this._peekArmed = false;
		this.clearBarBounds();
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
		// Vim maps live on a global adapter, not in our extensions, so they
		// have to be released by hand.
		this.applyVimMotionMaps();
		document.body.removeAttribute('data-zen-hide-inline-title');
		document.body.removeAttribute('data-zen-focused-file');
		// The horizontal padding rule is unscoped (applies always), so it
		// needs its own reset when the plugin itself is turned off. The
		// vertical pair is zen-scoped and would stop applying anyway once
		// the body classes are cleared above, but clearing them keeps a
		// disabled plugin from leaving any of its variables on :root.
		document.documentElement.style.removeProperty('--zg-editor-padding-h');
		// Left behind by the removed zen padding. An inline custom property
		// on :root outlives the stylesheet that read it, so a vault that had
		// the feature keeps the value forever unless it is actively cleared
		// — the same failure mode as the note mini-theme's three.
		document.documentElement.style.removeProperty('--zen-mode-top-padding');
		document.documentElement.style.removeProperty('--zen-mode-bottom-padding');
		// Restore tab containers — only the ones we changed, and to their own
		// previous values. This line used to reach every .workspace-tabs in
		// the workspace and blank its inline flex, which is where a sidebar's
		// pane sizes went. See _focusTabRestore.
		this._focusTabRestore();
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
		const hideNativeStatusBar = this.shouldHideNativeStatusBar();
		body.classList.toggle('zenmode-active',             zen);
		body.classList.toggle('zenmode-hide-properties',    zen && this.settings.hideProperties);
		body.classList.toggle('zenmode-hide-status-bar',    hideNativeStatusBar);
		this.applyNativeStatusBarVisibility(hideNativeStatusBar);
		body.classList.toggle('zenmode-hide-scroll-bar',    this.shouldHideScrollBar());
		body.classList.toggle('zenmode-hide-linked-mentions', zen && this.settings.hideLinkedMentions);
		body.classList.toggle('zenmode-hide-ribbon',        zen && this.settings.hideRibbon);
		// The horizontal padding is applied by an otherwise unscoped rule, so
		// this class is what makes both kill switches able to reach it — the
		// plugin's own, and Text Options'.
		body.classList.toggle('zg-text-pad',                scoped && !!this.settings.miscEnabled);
		body.classList.toggle('zg-para-indent',             scoped && this.textOpt('enableParagraphIndent', false));
		body.classList.toggle('zg-justify',                 scoped && this.textOpt('justifyText', false));
		body.classList.toggle('zg-line-limit',              scoped && this.textOpt('limitLineLength', false));
		body.classList.toggle('zg-rtl',                     this.isRightToLeft());
		// The slide transition only exists while the bar is actually
		// moving. Left on permanently, `transition: transform` promotes
		// the bar to its own compositing layer and its text loses subpixel
		// antialiasing — the "slightly fuzzy bar" effect.
		const hideBar = this.barIsHidden();
		if (body.classList.contains('zg-bar-hidden') !== hideBar) {
			body.classList.add('zg-bar-anim');
			clearTimeout(this._barAnimT);
			this._barAnimT = setTimeout(() => document.body.classList.remove('zg-bar-anim'), 350);
		}
		body.classList.toggle('zg-bar-hidden', hideBar);
		// Whether the bar can be peeked at, and where the strip is. Here
		// because this is the one place that decides the bar is hidden.
		this.syncBarPeekState();
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
		this.tagMainTitlebar();
	}

	// Drops tokens that no longer fit, lowest priority first, so the bar
	// degrades instead of clipping or spilling.
	//
	// Measured PER SECTION, not per row. Each of the three sections is
	// `flex: 1 1 0; min-width: 0; overflow: hidden`, so a section clips its
	// own content and the row's scrollWidth NEVER exceeds its clientWidth —
	// measuring the row (the first version of this) could not detect
	// overflow at all, which is why nothing was ever dropped. It also means
	// the sections are independent: a crowded centre must not cost the left
	// section its file name.
	//
	// Buttons are never dropped. They are the only parts of the bar that DO
	// something — syntax, prose checks, markers, font, report — and a
	// control that vanishes when the window narrows is worse than a reading
	// that does: the reading is still in the note, the control is not.
	// Everything else goes in reverse document order, so a section sheds
	// from its far end and keeps its leading readings longest.
	//
	// Powerline segments take their separator with them. A hidden segment
	// whose arrow stayed behind reads as a colour glitch, and the emptiness
	// collapse that normally handles that runs at BUILD time, before any of
	// this is measurable.
	fitSections(rowEl) {
		const secs = rowEl.querySelectorAll
			? Array.from(rowEl.querySelectorAll('.zg-status-section'))
			: [];
		return secs.length ? secs : [rowEl];
	}

	clearFitHidden(rowEl) {
		if (!rowEl || !rowEl.querySelectorAll) return;
		for (const el of Array.from(rowEl.querySelectorAll('.zg-fit-hidden'))) {
			el.classList.remove('zg-fit-hidden');
		}
	}

	// Everything a row may drop, ordered worst-first: from the two window
	// margins inward, alternating sides, with the centre last.
	//
	// The order is what makes "buttons have priority" actually hold. Dropping
	// per section could not deliver it: sections are laid out as equal
	// thirds, so a right section holding three buttons gets a third of the
	// row however empty the left section is — and having nothing droppable of
	// its own, it clipped them. Judging the whole row at once means a
	// crowded left section sheds text so the buttons on the right keep
	// their room.
	fitCandidates(rowEl) {
		const secs = this.fitSections(rowEl);
		const pick = sec => Array.from(sec.querySelectorAll
			? sec.querySelectorAll('.zg-pl-seg, .zg-fit-item') : [])
			.filter(el => !el.querySelector('.zg-barbtn')
				&& !el.classList.contains('zg-barbtn'));
		const byClass = c => secs.filter(s => s.classList && s.classList.contains(c));
		const left  = byClass('zg-status-left').flatMap(pick);
		const right = byClass('zg-status-right').flatMap(pick).reverse();
		const mid   = byClass('zg-status-center').flatMap(pick).reverse();
		// Sections with none of the three classes (the no-section fallback
		// used in tests, and any future layout) behave like the centre.
		const other = secs.filter(s => !s.classList
			|| !(s.classList.contains('zg-status-left')
				|| s.classList.contains('zg-status-right')
				|| s.classList.contains('zg-status-center'))).flatMap(pick);

		// Alternate margins so the bar contracts evenly instead of eating
		// one end to the middle before touching the other.
		const edges = [];
		for (let i = 0; i < Math.max(left.length, right.length); i++) {
			if (left[i])  edges.push(left[i]);
			if (right[i]) edges.push(right[i]);
		}
		return edges.concat(other, mid);
	}

	// True when the row's content fits — which is the same question as
	// "do the sections still clear one another". Nothing degrades until
	// they actually touch: a centre with air either side of it, or a left
	// and a right with a gap between them when there is no centre, is a bar
	// that has room and must be left alone.
	//
	// The row itself can never overflow (its sections clip), so the section
	// widths are summed. The GAPS count too: `.zg-status-row` sets
	// `gap: 12px`, and ignoring it declared a fit while the sections were
	// already shoulder to shoulder. Only occupied sections take part —
	// an empty centre neither occupies width nor separates anything, so a
	// left and a right meet across one gap, not two.
	// How much room a section's contents actually need. Summed from the
	// CHILDREN, never from the section's own scrollWidth: scrollWidth is
	// never smaller than clientWidth, and the centre section stretches to
	// fill the leftover room, so its scrollWidth reported the whole gap
	// between its neighbours however little text it held. Summing sections
	// that way put the row over its width at EVERY size, and the margins
	// were shed immediately at full width.
	// How wide a section's contents actually are.
	//
	// getBoundingClientRect, NOT offsetWidth. `offsetWidth` is a property of
	// HTMLElement; SVGElement does not implement it, so every separator
	// measured as `undefined || 0` — ZERO — and the fit pass was blind to
	// them. Measured in the field: a row whose children summed to 948px in
	// an 890px bar, with nothing dropped, because 174px of that was
	// separators the count could not see. The overflow went where overflow
	// goes when `.zg-status-section` is `overflow: hidden`: the outermost
	// shapes were clipped, which is a group's lead and tail caps.
	//
	// It also explains why the artefact moved when a divider character
	// changed and not when the window did. Swapping `|` (2px) for `<` (a
	// full arrow) moves the total by 13px per divider, so it changes what
	// gets cut; a zoom step scales the overflow and the clip together, so
	// the cut looks the same.
	//
	// Fractional widths are kept rather than rounded: three sections each
	// losing up to half a pixel is most of FIT_SLACK.
	sectionContentWidth(sec) {
		if (!sec || !sec.children) return 0;
		let w = 0;
		for (const child of Array.from(sec.children)) {
			if (child.classList && child.classList.contains('zg-fit-hidden')) continue;
			if (child.getBoundingClientRect) {
				w += child.getBoundingClientRect().width || 0;
			} else {
				w += (child.offsetWidth || 0);
			}
		}
		return w;
	}

	rowContentFits(rowEl) {
		const secs = this.fitSections(rowEl);
		let total = 0, occupied = 0;
		for (const sec of secs) {
			const w = this.sectionContentWidth(sec);
			total += w;
			if (w > 0) occupied++;
		}
		const gaps = Math.max(0, occupied - 1) * BAR_SECTION_GAP;
		// FIT_SLACK, not a bare comparison. A row sitting exactly on the
		// boundary would drop a token, which frees width, which lets the
		// next measure restore it, which overflows again — a loop that
		// shows as tokens blinking. A few pixels of slack means the state
		// that follows a drop is comfortably a fit, so it settles.
		return total + gaps <= (rowEl.clientWidth || 0) - FIT_SLACK;
	}

	fitStatusRow(rowEl, measure) {
		if (!rowEl) return;
		const fits = measure || (el => this.rowContentFits(el));
		// Nothing is measurable until layout has happened. clientWidth is 0
		// while the bar is hidden or mid-teardown, and the row would look
		// hopelessly overfull against a zero width and strip itself bare.
		if (!rowEl.clientWidth) return;
		this.clearFitHidden(rowEl);

		// Rule one, before any token is hidden: collapse a full path to the
		// file name. The name identifies the note; the folders are context
		// the pane already gives you, and dropping them is far cheaper than
		// dropping a reading.
		//
		// Both directions are latched against the width that triggered them,
		// not against the current fit. Without that the bar oscillates: a
		// shortened row fits, so the name is restored, so it overflows, so
		// it shortens — once per frame. It only lengthens again once the
		// window is meaningfully wider than it was when it gave up.
		// Defensive: this runs from stampMaskPositions among others, and can
		// be reached before settings are loaded. A throw here would take
		// mask placement down with it.
		const canShorten = (this.settings || {}).fileTokenFormat !== 'name';
		if (canShorten && !fits(rowEl) && !this._fitShortenFile) {
			this._fitShortenFile = true;
			this._fitShortenWidth = rowEl.clientWidth;
			this.requestBarRebuild();
			return;
		}
		if (this._fitShortenFile && fits(rowEl)
			&& rowEl.clientWidth > (this._fitShortenWidth || 0) + FIT_RESTORE_MARGIN) {
			this._fitShortenFile = false;
			this.requestBarRebuild();
			return;
		}

		if (fits(rowEl)) return;

		// Rule two: shed the caps before any token goes.
		//
		// A cap is the shape where a group meets the bar — the point at the
		// very start or end of a run. It carries nothing: no reading, no
		// label, not even a boundary between two segments, since the thing
		// on its far side is the bar itself. At the current default it is
		// about 0.78 of a row height EACH, so a three-group row gets six
		// caps back, which is frequently the whole overflow.
		//
		// Before tokens, therefore, and not after: dropping a word count to
		// keep a decoration would be the wrong way round. They come back on
		// their own, because clearFitHidden above unhides everything at the
		// start of every pass — so a widened window restores the points in
		// the same frame it restores the tokens.
		const caps = rowEl.querySelectorAll('.zg-pl-cap');
		if (caps.length) {
			for (const cap of Array.from(caps)) cap.classList.add('zg-fit-hidden');
			if (fits(rowEl)) return;
		}

		for (const el of this.fitCandidates(rowEl)) {
			el.classList.add('zg-fit-hidden');
			// The separator facing the rest of the row goes with it: left
			// behind, the shape hangs off nothing and reads as a glitch.
			const sib = el.previousElementSibling || el.nextElementSibling;
			if (sib && sib.classList && sib.classList.contains('zg-pl-sep')) {
				sib.classList.add('zg-fit-hidden');
			}
			if (fits(rowEl)) return;
		}
	}

	fitStatusBar(measure) {
		for (const rowEl of (this._statusRowEls || [])) this.fitStatusRow(rowEl, measure);
	}

	// Row height with the pixel-parity snap applied — shared between the
	// variable stamping and the geometry that has to agree with it.
	// The bar's vertical padding, clamped once so the stamping, the height
	// and the separator geometry cannot disagree about it.
	// How much vertical room the bar's rules occupy. Zero unless powerline
	// is on AND that edge is enabled AND the style draws something — the
	// overlay only paints under those conditions, so reserving space in any
	// other case would leave a bare strip.
	//
	// Two numbers per edge now, and the difference is the fix for a zoom
	// hairline. `top`/`bottom` are what the rule DRAWS and what the bar's
	// height carries; `bandTop`/`bandBottom` are what the padding RESERVES,
	// and for a solid rule that is one pixel LESS. The segments therefore
	// run one pixel under the rule, and the rule — the ::after overlay at
	// z-index 3 — paints over the overlap. Reserving the full width made
	// the rule's inner edge and the row's outer edge meet EXACTLY, and two
	// edges that meet exactly are two edges that round to device pixels
	// independently: at any fractional page zoom (Ctrl+= app zoom, OS
	// display scaling) a one-device-pixel line of bare bar opened between
	// them — top or bottom, wandering with the zoom and the bar's own
	// fractional position. Measured, not reasoned: a 45-case grid in a
	// real Chromium was flush at zoom 1.0 and broke in 39/45 cases at 0.9.
	// Same invariant as the separator rect's overdraw and the segment
	// bleed: overlaps are whole pixels, and the later painter wins.
	//
	// Solid only. Dashed, dotted and double rules have see-through gaps,
	// and what shows through them must be the BAR, not the top sliver of
	// every segment — those styles keep the full band and, with it, the
	// theoretical hairline, which inside a broken line pattern has nothing
	// to read as.
	barRuleWidths() {
		const s = this.settings;
		if (!s.powerlineEnabled) return { top: 0, bottom: 0, bandTop: 0, bandBottom: 0 };
		const style = s.statusBarBorderStyle || 'solid';
		if (style === 'none') return { top: 0, bottom: 0, bandTop: 0, bandBottom: 0 };
		const w = Math.max(1, Math.min(8, s.statusBarBorderWidth || 1));
		const band = style === 'solid' ? Math.max(0, w - 1) : w;
		const top = s.statusBarBorderTop !== false, bot = s.statusBarBorderBottom !== false;
		return {
			top:        top ? w : 0,
			bottom:     bot ? w : 0,
			bandTop:    top ? band : 0,
			bandBottom: bot ? band : 0,
		};
	}

	barPadding() {
		const c = v => Math.max(0, Math.min(24, v != null ? v : 5));
		return {
			top: c(this.settings.statusBarPadTop),
			bottom: c(this.settings.statusBarPadBottom)
		};
	}

	snappedRowHeight() {
		let rowH = this.settings.statusBarHeight;
		if ((rowH - (this.settings.statusBarFontSize || 13)) % 2 !== 0) rowH += 1;
		// The parity snap adds a pixel, which at the bottom of the range
		// would let a 12px row round up and never actually reach 12. Snap
		// DOWN instead once that would happen, so both ends of the slider
		// are reachable and the parity still holds.
		if (rowH > 30) rowH -= 2;
		return Math.max(12, rowH);
	}

	// The gutter reserved beneath the raised bar for the vim command line.
	//
	// One snapped row was a guess at how tall a command line is, and it was
	// usually wrong: the panel's height comes from the theme's own input
	// metrics. Being wrong in either direction was visible — too small and
	// the bar sat on top of the command line, too large and lifting the bar
	// to compensate made it JUMP whenever `:` was pressed.
	//
	// So the gutter is reserved at the real height instead, permanently:
	// once a panel has been measured, the space is always there, the panel
	// fills it exactly when it opens, and the bar never moves. The
	// measurement is persisted (vimPanelHeight) so the reservation is
	// already correct on the next launch rather than settling after the
	// first `:`. Clamped, so one bad read cannot push the bar up the screen.
	vimGutterHeight() {
		const rowH = this.snappedRowHeight();
		const measured = this.settings.vimPanelHeight || 0;
		if (!(measured > 0)) return rowH;
		return Math.max(rowH, Math.min(measured, 120));
	}

	// Marks the MAIN window's title bar so the strip rules in styles.css can
	// target it and only it. Body classes are mirrored into pop-out windows
	// (the 1.13 settings window included), so a bare `.titlebar` selector
	// gated on those classes reached the settings window's title bar and
	// broke its dragging. An element class in this document cannot leak.
	// Called from applyBodyClasses, which runs on every refresh — including
	// the layout-change and theme-observer paths — so a recreated title bar
	// is re-stamped without its own observer.
	tagMainTitlebar() {
		const tb = document.querySelector('.titlebar');
		if (tb && !tb.classList.contains('zg-main-titlebar')) {
			tb.classList.add('zg-main-titlebar');
		}
	}

	// Hides/restores the native status bar via an inline
	// display:none!important. The class-based CSS rule alone proved
	// unreliable: themes and snippets commonly style .status-bar with
	// higher-specificity or !important rules that outrank a descendant
	// selector, which let the native bar show through the retro bar's
	// goal-met flash (whose strobe dips the retro bar's opacity). An inline
	// important declaration cannot be beaten by any stylesheet rule.
	// Whether Obsidian's own status bar should be hidden right now.
	//
	// One predicate, because there were two and they did not agree. The body
	// class was decided by zenActive() — which respects the zenEnabled
	// switch AND a per-note ws-zen override — while the inline style was
	// decided by the raw settings.zenMode flag. Both run during a refresh,
	// the inline one second, so whichever disagreed last won: toggling zen
	// could leave the class saying "show" and the inline style saying
	// "hide", or the reverse, with no way to talk either of them round.
	// The scroll bar goes when zen is told to hide it — and ALWAYS while the
	// letterbox is up, whatever the zen toggle says.
	//
	// It is the one piece of chrome the letterbox cannot cover. The masks are
	// bands across the top and bottom of the pane; the scroll bar runs the
	// full height beside them, straight past both, so it sits there as a lit
	// strip down the edge of a frame whose whole purpose is to close the page
	// off. And it moves while you write, which is precisely what the mode is
	// for getting rid of.
	//
	// Not folded into the zen toggle's own setting: that setting still means
	// what it says for zen, and a writer who has it off does not want it
	// silently flipped on by turning the letterbox on. Two reasons, one
	// answer, which is why this is a predicate rather than a longer condition
	// at the call site.
	shouldHideScrollBar() {
		if (this.zenActive() && this.settings.hideScrollBar) return true;
		return !!(this.letterboxActive() && this.isActiveFileInScope());
	}

	shouldHideNativeStatusBar() {
		return !!(this.retroBarActive() || (this.zenActive() && this.settings.hideStatusBar));
	}

	applyNativeStatusBarVisibility(hide) {
		const nb = document.querySelector('.status-bar');
		if (!nb) return;
		if (hide) nb.style.setProperty('display', 'none', 'important');
		else nb.style.removeProperty('display');
	}

	// ════════════════════════════════════════════════════════════════════════
	// CHROME CLEANUP
	// ════════════════════════════════════════════════════════════════════════
	// Two removed features left inline properties behind: the unified-colours
	// feature (one background/text pair painted across the editor and the
	// chrome) and, later, the note mini-theme. What stays is the ability to
	// take it back OFF: the old versions wrote these properties inline onto
	// body.style, where they outlive both the plugin's stylesheet and its
	// settings — a vault upgraded mid-session would keep the override until
	// something removed it by hand. clearChromeColors() runs on every apply
	// pass and on disable, so any leftover from an older install is wiped
	// the first time this version paints.
	chromeProps() {
		return ['--background-primary', '--background-primary-alt',
			'--background-secondary', '--background-secondary-alt',
			'--titlebar-background', '--titlebar-background-focused',
			'--tab-container-background', '--ribbon-background',
			'--text-normal', '--text-muted', '--text-faint',
			'--background-modifier-hover', '--background-modifier-active-hover',
			'--background-modifier-border', '--background-modifier-border-hover',
			'--background-modifier-border-focus', '--background-modifier-form-field',
			'--nav-item-background-active', '--nav-item-background-hover',
			'--interactive-normal', '--interactive-hover',
			'--tab-background-active', '--modal-background',
			// Same story, second removal: the note mini-theme stamped these
			// three inline on body. Identical failure mode, identical fix —
			// swept on every apply pass so an upgraded vault loses the
			// leftover the first time this version paints, rather than
			// keeping a recoloured mask and title bar with no setting left
			// to turn them off.
			'--zg-note-bg', '--zg-note-text', '--zg-note-bg-alt'];
	}

	clearChromeColors() {
		const body = document.body.style;
		for (const p of this.chromeProps()) body.removeProperty(p);
	}

	applyCssVariables() {
		// Not applied any more, only ever cleared — see CHROME CLEANUP above.
		this.clearChromeColors();
		const root = document.documentElement.style;
		// Same story, and swept on every pass rather than only on disable:
		// an upgraded vault would otherwise keep the removed zen padding's
		// inline values on :root with no setting left to change them.
		root.removeProperty('--zen-mode-top-padding');
		root.removeProperty('--zen-mode-bottom-padding');
		// DEFAULT_SETTINGS' own value when the tab is off, not zero: zero would
		// jam the text against the window edge, which is not "no text options",
		// it is a different text option.
		root.setProperty('--zg-editor-padding-h',
			this.textOpt('editorPaddingH', DEFAULT_SETTINGS.editorPaddingH) + 'px');
		// (z-index vars intentionally not stamped here — the stylesheet
		// defaults already provide them, and inline values on :root would
		// still lose to the elevated body.zg-masks-active values anyway.)

		// Arrow size is a fixed-px calc() in styles.css so it holds its size
		// resizes with zero JS; only the user's scale multiplier is stamped.
		root.setProperty('--zg-arrow-scale',          String(this.settings.arrowScale || 1));
		root.setProperty('--zg-separator-style',      this.settings.separatorStyle);
		root.setProperty('--zg-separator-weight',     this.settings.separatorWeight + 'px');
		// When the bar follows the note, the stamped value is a var()
		// REFERENCE, not a resolved number: --font-text-size is what
		// Ctrl+scroll zoom moves, and the reference re-resolves at the bar
		// on every zoom step with no plugin involvement. It resolves there
		// rather than here because a custom property stores its tokens
		// unsubstituted — the inner var() is looked up against the BAR's
		// own inherited scope when font-size finally uses it, and the bar
		// lives inside <body>, where Obsidian defines the variable.
		root.setProperty('--zg-status-bar-font-size',
			this.settings.statusBarFontFollowNote
				? 'var(--font-text-size, 16px)'
				: this.settings.statusBarFontSize + 'px');
		// Row height is what the user sets; the bar's own height is the
		// product, so mask positioning and the cm-panels-bottom offset keep
		// working unchanged against --zg-status-bar-height.
		// One row, always: the bar reads as an instrument line, and the row
		// beneath it now belongs to the vim command gutter.
		// One, matching getStatusRows. The pair has to move together —
		// reserving height for rows that do not render leaves a bare strip.
		const barRows = 1;
		// Centring a font in a row leaves (row - font) / 2 above and below;
		// when that difference is odd the text sits on a half pixel and
		// renders soft. One extra pixel of row buys whole-pixel baselines.
		const rowH = this.snappedRowHeight();
		root.setProperty('--zg-status-row-height',    rowH + 'px');
		// The bar sits one row above the window edge; the vim command line
		// gets that row, and the bar's own plinth masks it while closed.
		// The row is as tall as a real command line (see vimGutterHeight),
		// so the panel fits without the bar having to move for it.
		root.setProperty('--zg-vim-gutter',           this.vimGutterHeight() + 'px');
		// Padding is added to the bar's own height rather than eating into it,
		// so the rows keep the height they were given and everything that
		// measures the bar — mask placement, the cm-panels offset — still gets
		// the true total.
		const { top: padTop, bottom: padBottom } = this.barPadding();
		root.setProperty('--zg-status-bar-pad-top',    padTop + 'px');
		root.setProperty('--zg-status-bar-pad-bottom', padBottom + 'px');
		// Padding is part of the bar's height in BOTH modes now. It used to
		// be dropped under powerline because the CSS zeroed the padding
		// there; leaving it in the height then made the bar taller than its
		// rows and left a strip of bare bar at the bottom. Powerline keeps
		// its vertical padding now, so the height must carry it again or
		// the rows would be squeezed by exactly padTop+padBottom and the
		// segments would stop short of the rules (invariant 9: the padding,
		// the height and the rows all have to agree).
		// The rules need a BAND OF THEIR OWN under powerline. The overlay
		// that draws them is `inset: 0` at z-index 3, so its border paints
		// over whatever is beneath. The band is now one pixel NARROWER than
		// a solid rule (see barRuleWidths): the segments deliberately run
		// that pixel under the rule and the rule overdraws them, because
		// stopping them exactly at the rule's edge left the joint to
		// device-pixel rounding, which any fractional zoom broke into a
		// hairline. The HEIGHT still carries the full rule widths — the
		// overlap trades a pixel of hidden segment, never a pixel of bar
		// geometry, so masks and the editor reserve see nothing change.
		const rules = this.barRuleWidths();
		root.setProperty('--zg-bar-rule-band-top',    rules.bandTop + 'px');
		root.setProperty('--zg-bar-rule-band-bottom', rules.bandBottom + 'px');
		// Cached as well as stamped: the peek zone needs the bar's height on
		// every pointer move, and measuring it there would be a style read
		// per frame.
		root.setProperty('--zg-pl-sep-aspect', String(PL_SEP_ASPECT));
		this._barBoxHeight = rowH * barRows + padTop + padBottom + rules.top + rules.bottom;
		root.setProperty('--zg-status-bar-height', this._barBoxHeight + 'px');
		root.setProperty('--zg-para-indent',          (this.settings.paragraphIndentEm || 2) + 'em');
		root.setProperty('--zg-mask-overhang',        (this.settings.maskOverhang || 4) + 'px');

		const isDark = document.body.classList.contains('theme-dark');
		// These two go on <body>, not <html>. Obsidian defines
		// --background-primary on body.theme-dark / body.theme-light, so
		// `var(--background-primary)` written at :root has nothing to resolve
		// against: the variable computes to invalid and the bar renders
		// transparent. On body the reference resolves normally.
		const barRoot = document.body.style;
		// The row's directive outranks the colour pickers, per slot: writing
		// :b2 is a deliberate, visible instruction sitting at the front of
		// the format, and a picker two tabs away should not silently win
		// against it. Each half is independent — :b2 alone keeps the custom
		// TEXT, which is the combination that makes the directive worth
		// having on a bar that is otherwise hand-coloured.
		const dir = this.resolveBarDirective(
			readBarDirective((this.getStatusRows()[0] || {}).left));
		if (this.settings.retroCustomColors) {
			barRoot.setProperty('--zg-bg',   dir.bg
				|| (isDark ? this.settings.retroDarkBgColor   : this.settings.retroLightBgColor));
			barRoot.setProperty('--zg-text', dir.text
				|| (isDark ? this.settings.retroDarkTextColor : this.settings.retroLightTextColor));
		} else {
			barRoot.setProperty('--zg-bg',   dir.bg   || 'var(--background-primary)');
			barRoot.setProperty('--zg-text', dir.text || 'var(--text-normal)');
		}
		// The note surface. Written on body for the same reason as the bar's
		// pair above, and cleared rather than left at a stale value when the
		// toggle goes off — an inline custom property outlives the
		// stylesheet, so "off" has to actively remove it.
		const lb = this.letterboxColors(isDark);
		if (lb) {
			root.setProperty('--zg-arrow-color', lb.arrow);
			root.setProperty('--zg-line-color',  lb.line);
		} else {
			// REMOVED, not set to var(--text-normal): the stylesheet already
			// declares that as the fallback on both properties, so taking the
			// override away is the whole of "follow the theme" — and one
			// place says what the default is rather than two.
			root.removeProperty('--zg-arrow-color');
			root.removeProperty('--zg-line-color');
		}
	}

	// The arrow and separator-line colours, or null for "follow the theme".
	//
	// Its own method rather than four ternaries inside applyCssVariables:
	// null is a real answer here and it means REMOVE the properties, which
	// is easy to lose in a stamping pass that otherwise only ever writes.
	letterboxColors(isDark) {
		if (!this.settings.letterboxCustomColors) return null;
		return {
			arrow: isDark ? this.settings.arrowDarkColor : this.settings.arrowLightColor,
			line:  isDark ? this.settings.lineDarkColor  : this.settings.lineLightColor,
		};
	}

	// The bar directive's two halves, resolved to paintable values.
	//
	// :b1/:b2 stay as var() — they must follow the theme live, and they only
	// ever land in CSS properties, where a var() resolves. :N and :vim
	// resolve to a real colour here instead, for two reasons: the derived
	// ink (powerlineInk) needs actual channels to measure, and vimModeColor
	// is a per-call read of live state that no variable can express.
	//
	// The ink is DERIVED when a palette or vim background is set and no ;N
	// was written. The custom text pickers are a choice made against the
	// custom BACKGROUND pickers; a directive background the writer typed
	// separately has no reason to be readable under that choice, and an
	// unreadable bar is a worse answer than an overridden picker. ;N (or
	// ;t1/;t2) still wins — written text is written text.
	resolveBarDirective(dir) {
		let bg = dir.bg, text = dir.text;
		if (dir.bgSlot != null) {
			let c = null;
			if (dir.bgSlot === 'vim') {
				c = this.vimModeColor();
			} else {
				// Same 1-based wrap as a segment's :N — a saved :9 folds
				// into the palette rather than failing.
				const list = this.powerlineColors();
				c = list[(((dir.bgSlot - 1) % list.length) + list.length) % list.length];
			}
			if (c) {
				bg = c;
				if (text === null && dir.textSlot == null) text = this.powerlineInk(c);
			}
		}
		if (dir.textSlot != null) {
			text = dir.textSlot === 'vim'
				? (this.vimModeColor() || text)
				: this.powerlineTextColor(dir.textSlot);
		}
		return { bg, text, bgSlot: dir.bgSlot, textSlot: dir.textSlot, rest: dir.rest };
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Injected styles
	// ─────────────────────────────────────────────────────────────────────────

	// The entire note mini-theme, injected rather than shipped in styles.css.
	// It lived in the stylesheet first, and a stale styles.css reproduced
	// every symptom of the palette being broken — invisible tab labels, a
	// flat title row — while the sources were correct (verified by computing
	// the full cascade against Obsidian's markup, cascade_check.js in the
	// dev harness). Same lesson as invariant 3, at feature scale: anything
	// whose absence looks like a bug in the plugin ships WITH the plugin.
	coreFeatureCss() {
		return [
			// The bar must stay clickable over the bottom mask's drag
			// region in zen mode. A stale styles.css without this makes
			// every bar click a window drag — invisible, unreproducible,
			// and reported as "the bar does nothing". Self-carried for
			// exactly that reason.
			// Self-carried: without this a stale stylesheet leaves the
			// window controls unclickable, which is a broken window, not
			// a style drift.
			'.zengrinder-mask-guard { -webkit-app-region: no-drag; }',
			'body:not(.is-mobile) .zengrinder-status-bar,'
				+ ' body:not(.is-mobile) .zengrinder-status-bar *,'
				+ ' body:not(.is-mobile) .cm-editor .cm-panels.cm-panels-bottom,'
				+ ' body:not(.is-mobile) .cm-editor .cm-panels.cm-panels-bottom *'
				+ ' { -webkit-app-region: no-drag; }',
			// The gutter plinth must not be on screen while the vim ":"
			// line is. It is an opaque fixed child of body sized to
			// exactly the gutter, and the panel — inside a workspace
			// leaf, and therefore inside its own stacking context —
			// cannot raise itself above it whatever z-index it carries.
			// Without this the command line opens, takes focus, accepts
			// what you type, and is painted over by a page-coloured
			// strip: "the command line shows no text". Self-carried for
			// the same reason as the rule above — its absence is a
			// vanished feature, not a cosmetic drift.
			'body.zg-vim-panel-open .zg-bar-plinth { display: none; }',
			// The separator's apex angle. Carried with the script because
			// without it the arrows fall back to a width computed from a row
			// height the JS only assumed, which is what made them blunt.
			'.zg-pl-sep[data-shape]:not([data-shape="straight"])'
				+ ' { width: auto; aspect-ratio: var(--zg-pl-sep-aspect, 0.85); }',
			// A cap has nothing to overlap on its outward side, and the
			// section clips there — so the -1px took the point off the first
			// arrow of a group.
			// Without this the following segment paints over a right-facing
			// arrow's point, which is the whole of "the arrows are blunt".
			'.zg-pl-sep { position: relative; z-index: 1; }',
			// A half-pixel margin puts every segment edge on a half-pixel
			// boundary, which antialiases into a moving, colour-dependent
			// hairline. Whole pixels only.
			'.zg-pl-seg { margin-inline: -1px; }',
			// A straight divider takes no space and pulls nothing together.
			'.zg-pl-sep[data-shape="straight"] { width: 0; margin-inline: 0; }',
			'.zg-pl-sep[data-cap="lead"] { margin-inline-start: 0; }',
			'.zg-pl-sep[data-cap="tail"] { margin-inline-end: 0; }',
			// The editing viewport's bottom inset, carried with the script.
			//
			// This is the fourth attempt at this feature and the first three
			// were invisible for two different reasons stacked on each other:
			// a flex item's default min-height is its min-content height, so
			// zen's 50vh scroller padding was a 100vh floor no inset could
			// get under — and the stylesheet holding the fix was never
			// copied into the vault, so none of it was even loaded. The
			// second failure is the one this block exists for. A rule whose
			// absence looks exactly like "the feature does nothing" belongs
			// with the code, not in a file that has to be copied correctly.
			'.markdown-source-view.mod-cm6 .cm-editor .cm-scroller { min-height: 0; }',
			'body.zg-retrobar-active:not(.zg-bar-hidden) .workspace-leaf.zg-bar-overlap'
				+ ' .markdown-source-view.mod-cm6 .cm-editor .cm-scroller'
				+ ' { margin-bottom: var(--zg-bar-reserve,'
				+ ' calc(var(--zg-status-bar-height, 30px) + var(--zg-vim-gutter, 0px))); }',
			// Same story, second surface: an <input> takes the UA's
			// fieldtext colour unless told otherwise, and fieldtext
			// follows color-scheme rather than the theme.
			'body.zg-retrobar-active .cm-editor .cm-panels.cm-panels-bottom input,'
				+ ' body.zg-masks-active .cm-editor .cm-panels.cm-panels-bottom input'
				+ ' { color: var(--text-normal); -webkit-text-fill-color: var(--text-normal);'
				+ ' caret-color: var(--text-normal); }',
			// The bar's top/bottom rules in powerline mode. An overlay, not
			// borders (which shrink the box) and not inset shadows (which
			// paint below the segment children and never show). Duplicated
			// from styles.css per the stale-stylesheet rule below.
			'.zengrinder-status-bar.zg-powerline::after { content: \'\';'
				+ ' position: absolute; inset: 0; pointer-events: none; z-index: 3;'
				+ ' border-top: var(--zg-bar-rule-top-width, 0px) var(--zg-bar-rule-style, none) var(--zg-text);'
				+ ' border-bottom: var(--zg-bar-rule-bottom-width, 0px) var(--zg-bar-rule-style, none) var(--zg-text); }',
			// Powerline: the bar keeps no padding of its own — the segments
			// carry it, so their colour reaches the bar's edges.
			// Vertical padding equal to the rule widths, so the segments end
			// exactly where the rules begin instead of being painted over.
			// Horizontal stays 0: the end segments must still reach the
			// bar's own edges.
			'.zengrinder-status-bar.zg-powerline { padding:'
				+ ' var(--zg-bar-rule-band-top, 0px) 0'
				+ ' var(--zg-bar-rule-band-bottom, 0px); }',
			'.zengrinder-status-bar.zg-powerline .zg-pl-seg { box-sizing: border-box;'
				+ ' padding-top: var(--zg-status-bar-pad-top, 0px);'
				+ ' padding-bottom: var(--zg-status-bar-pad-bottom, 0px); }',
			'.zengrinder-status-bar.zg-powerline .zg-pl-seg.zg-pl-blank { padding-inline: 0; }',
			'.zg-pl-space, .zg-pl-grad { display: inline-block; flex: 0 0 auto; }',
			// Dropped by the fit pass. display:none rather than visibility,
			// so the element gives its width back — hiding it while it still
			// occupies space would defeat the entire point.
			'.zg-fit-hidden { display: none !important; }',
			// Sized in em so the dial tracks the bar's font size, and shifted
			// down a hair: a circle's optical centre sits above a text
			// baseline, so aligning it geometrically leaves it floating.
			'.zg-clock { width: 1.05em; height: 1.05em; display: inline-block;'
				+ ' vertical-align: -0.15em; flex: 0 0 auto; }',
			// {obsidian}'s box, sized like the clock and for the same
			// reason: a drawn token tracks the bar's font size, and a
			// stone's optical centre sits above a text baseline.
			'.zg-obsidian-icon { width: 1.05em; height: 1.05em;'
				+ ' display: inline-block; vertical-align: -0.15em; flex: 0 0 auto; }',
			// Chevron soft dividers: SVG strokes at the segment's FULL
			// height (buildSoftChevron), pinned to the same rendered
			// aspect as the hard arrows so both carry one angle. The
			// hairline's width/background/scale are reset — this mark is
			// a shape, not a rule. Self-carried because a stale stylesheet
			// would otherwise leave a 10x28 fallback chevron floating mid
			// row, which reads as a broken glyph, not as a style drift.
			'.zg-pl-soft.zg-pl-chev-r, .zg-pl-soft.zg-pl-chev-l {'
				+ ' width: auto; height: 100%; align-self: auto; background: none;'
				+ ' transform: none; margin: 0 7px; opacity: 0.55; flex: 0 0 auto;'
				+ ' border: 0; display: block;'
				+ ' aspect-ratio: var(--zg-pl-sep-aspect, 0.85); }',
			// The inner needs a definite full height for the chevron's 100%
			// (and the fade bands') to resolve against. Contents stay
			// centred — align-items is unchanged.
			'.zengrinder-status-bar.zg-powerline .zg-pl-inner {'
				+ ' align-self: stretch; height: 100%; }',
			// A fade segment is painted by its BANDS. The segment's own
			// vertical padding would leave bare bar above and below every
			// band, so it goes, and everything inside stretches to the
			// full row. Self-carried: a stale stylesheet turns a fade into
			// an invisible gap, which is a vanished feature.
			// Blank slivers are raised so their width stops depending on
			// their neighbours' paint (see styles.css). Self-carried: a
			// stale stylesheet brings back visibly unequal {s}:N marks.
			'.zengrinder-status-bar .zg-pl-seg.zg-pl-blank { position: relative; z-index: 1; }',
			'.zengrinder-status-bar.zg-powerline .zg-pl-seg.zg-pl-fade { padding: 0; }',
			'.zg-pl-seg.zg-pl-fade .zg-pl-inner { display: flex; align-items: stretch; }',
			'.zg-pl-seg.zg-pl-fade .zg-pl-grad { height: 100%; }',

			'.zg-goal-liquid { position: relative; width: 100%; height: 76px;'
				+ ' display: block; border-radius: 8px; overflow: hidden; }',
			'.zg-liquid-canvas { display: block; width: 100%; height: 100%;'
				+ ' image-rendering: pixelated; }',
			'.zg-report-ring .zg-goal { display: block; width: 100%; padding: 0 2px; }',

			// The history chart's STRUCTURE only — the rest of its look lives
			// in styles.css. Here for the same reason the chevrons are:
			// without them a stale stylesheet does not make the panel plain,
			// it makes an unsized SVG collapse to nothing and the window reads
			// as a broken feature rather than as a missing file.
			// Change together with the .zg-hist- block in styles.css.
			'.zg-hist-find { position: relative; }',
			'.zg-hist-findrow { display: flex; align-items: center; gap: 6px; }',
			'.zg-hist-search { flex: 1; font-family: var(--font-monospace, monospace); }',
			'.zg-hist-hits { position: absolute; left: 0; right: 0; top: 100%; z-index: 5;'
				+ ' max-height: 232px; overflow-y: auto; background: var(--background-primary);'
				+ ' border: 1px solid var(--background-modifier-border); }',
			'.zg-hist-hits:empty { display: none; }',
			'.zg-hist-hitrow { display: flex; gap: 8px; width: 100%; text-align: left; }',
			'.zg-report-cross { margin-left: auto; background: transparent; border-style: dashed; }',
			'.zg-history-modal { width: 92vw; max-width: 760px;'
				+ ' --zg-h-num: 21px; --zg-h-body: 12px; --zg-h-small: 10px;'
				+ ' --zg-hist-add: #49a862; --zg-hist-del: #c4423e;'
				+ ' --zg-hist-net: #3e8bcb;'
				+ ' --zg-hist-goal: var(--color-yellow, #c9a227);'
				+ ' --zg-hist-avg: var(--text-muted); }',
			'.zg-hist-chart { display: block; width: 100%; height: 184px;'
				+ ' shape-rendering: crispEdges; }',
			'.zg-hist-plot { position: relative; padding-left: 36px; }',
			'.zg-hist-gutter { position: absolute; left: 0; top: 0; bottom: 0; width: 33px; }',
			'.zg-hist-ylbl { position: absolute; right: 5px; transform: translateY(-50%);'
				+ ' font-family: var(--font-monospace, monospace); font-size: 10px;'
				+ ' line-height: 1; color: var(--text-faint); white-space: nowrap; }',
			'.zg-hist-px.is-added.h0 { fill: var(--zg-add-0, #1d5233); }',
			'.zg-hist-px.is-added.h1 { fill: var(--zg-add-1, #276c41); }',
			'.zg-hist-px.is-added.h2 { fill: var(--zg-add-2, #35894f); }',
			'.zg-hist-px.is-added.h3 { fill: var(--zg-add-3, #49a862); }',
			'.zg-hist-px.is-added.h4 { fill: var(--zg-add-4, #6bc77c); }',
			'.zg-hist-px.is-added.h5 { fill: var(--zg-add-5, #99e29c); }',
			'.zg-hist-px.is-removed.h0 { fill: var(--zg-del-0, #5e1a22); }',
			'.zg-hist-px.is-removed.h1 { fill: var(--zg-del-1, #7e242a); }',
			'.zg-hist-px.is-removed.h2 { fill: var(--zg-del-2, #a33033); }',
			'.zg-hist-px.is-removed.h3 { fill: var(--zg-del-3, #c4423e); }',
			'.zg-hist-px.is-removed.h4 { fill: var(--zg-del-4, #dd6055); }',
			'.zg-hist-px.is-removed.h5 { fill: var(--zg-del-5, #f08d7d); }',
			'.zg-hist-px.is-net.h0 { fill: var(--zg-net-0, #1b3a63); }',
			'.zg-hist-px.is-net.h1 { fill: var(--zg-net-1, #245084); }',
			'.zg-hist-px.is-net.h2 { fill: var(--zg-net-2, #2f6ba8); }',
			'.zg-hist-px.is-net.h3 { fill: var(--zg-net-3, #3e8bcb); }',
			'.zg-hist-px.is-net.h4 { fill: var(--zg-net-4, #5fabe4); }',
			'.zg-hist-px.is-net.h5 { fill: var(--zg-net-5, #8fcbf4); }',
			'.zg-hist-band.is-now { fill: var(--interactive-accent); opacity: 0.1; }',
			'.zg-hist-zeroed { fill: var(--text-faint); opacity: 0.28; }',
			'.zg-hist-grid { fill: var(--background-modifier-border); opacity: 0.8; }',
			'.zg-hist-axis { fill: var(--text-muted); }',
			'.zg-hist-avgline { fill: var(--zg-hist-avg); }',
			'.zg-hist-goalline { fill: var(--zg-hist-goal); }',
			'.zg-hist-hit { fill: var(--background-modifier-hover); opacity: 0; }',
			'.zg-hist-bargroup.is-hover .zg-hist-hit { opacity: 0.5; }',
			'.zg-hist-xwrap { padding-left: 36px; }',
			'.zg-hist-xaxis { display: grid; font-size: 10px; line-height: 1;'
				+ ' text-align: center; color: var(--text-faint);'
				+ ' font-family: var(--font-monospace, monospace); overflow: hidden; }',
			'.zg-hist-readout { min-height: 20px; font-size: 12px;'
				+ ' font-family: var(--font-monospace, monospace); white-space: nowrap;'
				+ ' overflow: hidden; text-overflow: ellipsis; }',
			'.zg-hist-series { display: flex; flex-wrap: wrap; gap: 4px; }',
			'.zg-hist-series { display: flex; flex-wrap: wrap; gap: 4px; }',
			'.zg-jar-pct { position: absolute; inset: 0; display: flex;'
				+ ' align-items: center; justify-content: center;'
				+ ' font-family: var(--zg-font, var(--font-text)), var(--font-interface, sans-serif);'
				+ ' font-size: 30px; font-weight: 600; line-height: 1;'
				+ ' font-variant-numeric: tabular-nums; color: var(--text-normal);'
				+ ' text-shadow: 0 2px 3px var(--background-primary), 0 -2px 3px var(--background-primary),'
				+ ' 2px 0 3px var(--background-primary), -2px 0 3px var(--background-primary);'
				+ ' pointer-events: none; }',
			'.zg-firework-vec.is-ring   { animation: zg-spark-fly 1.5s cubic-bezier(0.18,0.70,0.30,1) forwards; }',
			'.zg-firework-vec.is-willow { animation: zg-spark-fly 2.9s cubic-bezier(0.15,0.80,0.30,1) forwards; }',
			'.zg-firework-vec.is-willow .zg-firework-spark { animation-duration: 3.4s; }',
			'.zg-firework-vec.is-comet  { animation: zg-spark-fly 2.4s cubic-bezier(0.35,0.45,0.55,1) forwards; }',
			'.zg-firework-vec.is-comet .zg-firework-spark { animation: zg-spark-comet 2.4s ease-out forwards; }',
			'.zg-firework-vec.is-chrys  { animation: zg-spark-fly 2.6s cubic-bezier(0.10,0.85,0.25,1) forwards; }',
			'.zg-firework-vec.is-chrys .zg-firework-spark { animation-duration: 3.1s; }',
			'.zg-firework-vec.is-strobe { animation: zg-spark-fly 1.9s cubic-bezier(0.15,0.75,0.30,1) forwards; }',
			'.zg-firework-vec.is-strobe .zg-firework-spark { animation: zg-spark-strobe 1.9s steps(1) forwards; }',
			'@keyframes zg-spark-comet { 0% { opacity: 0; transform: translateY(0) scale(1.8); }'
				+ ' 5% { opacity: 1; } 80% { opacity: 1; transform: translateY(6px) scale(1); }'
				+ ' 100% { opacity: 0; transform: translateY(20px) scale(0.5); } }',
			'@keyframes zg-spark-strobe { 0%,14%,30%,46%,62% { opacity: 1; }'
				+ ' 7%,22%,38%,54% { opacity: 0.15; }'
				+ ' 100% { opacity: 0; transform: translateY(18px) scale(0.4); } }',
			'.zg-firework-vec.is-crackle { animation: zg-spark-fly 0.9s cubic-bezier(0.20,0.75,0.35,1) forwards; }',
			'.zg-firework-twinkle { position: absolute; border-radius: 0; opacity: 0;'
				+ ' animation: zg-twinkle 1.4s ease-in-out forwards; }',
			'@keyframes zg-twinkle { 0% { opacity: 0; } 35% { opacity: 1; } 100% { opacity: 0; } }',
			'@media (prefers-reduced-motion: reduce) {'
				+ ' .zg-firework-twinkle { animation: none; } }'
		].join('\n');
	}

	updateStyleEl() {
		if (!this.settings.pluginEnabled) { this.removeStyleEl(); return; }
		if (!this.styleEl) {
			this.styleEl = document.head.createEl('style');
			this.styleEl.id = 'zengrinder-injected';
		}
		const rules = [];
		// Presentation the features cannot live without travels with the
		// script. Twice now a stale styles.css in a vault has zeroed out a
		// shipped feature — the liquid gauge with no width, firework kinds
		// with no keyframes — and "nothing changed" was the honest report
		// from the other side. These duplicate the stylesheet on purpose;
		// identical rules cost nothing, missing ones cost a feature.
		rules.push(this.coreFeatureCss());
		if (this.textOpt('enableParagraphIndent', false)) {
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
			// The theme's own font is named as a fallback: a font can be
			// chosen and then uninstalled, or arrive from another machine's
			// settings, and without this the browser drops to its default
			// rather than to what the vault would otherwise use.
			rules.push('body.zg-font-active .markdown-source-view.mod-cm6 .cm-content,\n' +
				'body.zg-font-active .markdown-reading-view .markdown-preview-view ' +
				'{ font-family: var(--zg-font), var(--font-text); }');
		}
		if (this.textOpt('limitLineLength', false)) {
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
		if (this.textOpt('justifyText', false)) {
			// Justify in the source editor (skip code blocks and table cells).
			// The .cm-line selector is chained through .cm-content so it wins
			// over theme styles without !important in most cases.
			rules.push('.zg-justify .cm-content .cm-line { text-align: justify; text-align-last: left; }');
			// Reading view: paragraphs and list items.
			rules.push('.zg-justify .markdown-preview-view p, .zg-justify .markdown-preview-view li { text-align: justify; }');
		}
		if (this.textOpt('lineSpacing', 1.5) && this.textOpt('lineSpacing', 1.5) !== 1.5) {
			// A bare .cm-content selector loses to any theme rule that names a
			// parent, which is why this used to need !important. The full
			// chain wins on its own.
			const ls = String(this.textOpt('lineSpacing', 1.5));
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

		const cssText = rules.join('\n');
		this.styleEl.textContent = cssText;
		// Source order is half of the cascade: an equal-specificity contest
		// is decided by whichever rule comes LAST. Theme reloads and
		// snippet toggles append new sheets to head after this one, so it
		// is moved back to the end whenever anything has slipped past it.
		// (appendChild on an attached node is a move, not a copy.)
		try {
			if (document.head.lastElementChild !== this.styleEl) {
				document.head.appendChild(this.styleEl);
			}
		} catch (_) {}
		if (this.textOpt('enableParagraphIndent', false)
			&& this.settings.paragraphIndentMode !== 'single') {
		} else {
		}
	}

	removeStyleEl() {
		if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
	}

	// Releases the measured bar geometry. Inline left/width outlive the
	// stylesheet, so a disabled plugin would otherwise leave the bar pinned
	// to a rectangle that no longer describes anything.
	clearBarBounds() {
		this._barBoundsL = this._barBoundsW = null;
		const el = this.retroStatusBarEl;
		if (!el || !el.style || typeof el.style.removeProperty !== 'function') return;
		el.style.removeProperty('left');
		el.style.removeProperty('width');
		const pl = this.retroPlinthEl;
		if (pl && pl.style && typeof pl.style.removeProperty === 'function') {
			pl.style.removeProperty('left');
			pl.style.removeProperty('width');
		}
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

	// Zen, on and off. ONE implementation, because there were two and they
	// disagreed about what zen is.
	//
	// `zenEnabled` is the master and `zenMode` is the state, and
	// `zenActive()` needs BOTH. The Z badge moved the pair; the older
	// toggleZenMode() moved only `zenMode`, so from a vault with the master
	// off — which is the shipped default — the palette command and the
	// Escape key flipped a flag nothing reads and appeared to do nothing at
	// all. Two ways to leave zen also left the two flags in different states
	// depending on which one you used.
	//
	// So: enter sets both, leave drops the master and leaves `zenMode` where
	// it was, so the next entry restores what was set up. Everything that
	// toggles zen comes through here.
	async toggleZen() {
		if (this._isTogglingZen) return;
		this._isTogglingZen = true;
		try {
			// If the plugin is off, turn it on first — zen depends on the
			// body classes, masks and observers that refresh() sets up, none
			// of which run while pluginEnabled is false. Flipping the flag
			// here and letting saveSettings() → refresh() do the wiring means
			// this works from either state.
			if (!this.settings.pluginEnabled) this.settings.pluginEnabled = true;
			// Read from zenActive(), not from either flag: it is the question
			// the rest of the plugin asks, and answering a different one here
			// is exactly how the two implementations drifted.
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
				// is left alone so the next entry restores what was set up.
				this.settings.zenEnabled = false;
			}
			await this.saveSettings(true);
		} finally {
			this._isTogglingZen = false;
		}
	}

	// Kept as names, not as second implementations: the Z badge and the
	// commands read better calling something that says where it came from,
	// and there is exactly one behaviour behind them.
	toggleZenFromBar() { return this.toggleZen(); }
	toggleZenMode()    { return this.toggleZen(); }

	async toggleFullPlugin() {
		const next = !this.settings.pluginEnabled;
		if (!next && this.zenActive()) {
			// Leave zen cleanly (fullscreen, sidebars, saved state) while the
			// plugin is still enabled — toggleZen() turns it back ON once
			// pluginEnabled is false, which is the opposite of what is wanted
			// here.
			//
			// Guarded on zenActive() rather than on settings.zenMode: the two
			// disagree whenever the master is off, and toggleZen() reads the
			// former, so guarding on the latter could call a toggle that then
			// decided it was ENTERING zen on the way to disabling the plugin.
			await this.toggleZen();
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

	// Zen as a switch, without asking what kind of pane is in front. The
	// surface gate is a separate question and syncSurfaceSidebars owns it.
	zenOn() {
		return !!(this.settings.zenEnabled && this.settings.zenMode);
	}

	setSidebarVisibility() {
		// zenOn(), not settings.zenMode. Leaving zen drops the MASTER and
		// leaves zenMode where it was, so that raw flag does not change on
		// the way out — this compared it against its own last value, saw no
		// change, and returned. The sidebars stayed collapsed after leaving
		// zen, and never collapsed again on the way back in, because by then
		// zenMode had been true the whole time.
		const on = this.zenOn();
		if (on === this._wasZenMode) return;
		const ws = this.app.workspace;
		if (!ws.leftSplit || !ws.rightSplit) return;
		if (!on) {
			if (!this.settings.leftSidebar)  ws.leftSplit.expand();
			if (!this.settings.rightSidebar) ws.rightSplit.expand();
		} else {
			this.settings.rightSidebar = ws.rightSplit.collapsed;
			this.settings.leftSidebar  = ws.leftSplit.collapsed;
			if (!ws.leftSplit.collapsed)  ws.leftSplit.collapse();
			if (!ws.rightSplit.collapsed) ws.rightSplit.collapse();
		}
		this._wasZenMode = on;
	}

	// The other half of the surface gate. Zen's body classes come off on a
	// canvas by themselves (zenActive() is false there), but the collapsed
	// sidebars are workspace state, not CSS — nothing lifts them, and a
	// canvas with no sidebars and no way to tell why is exactly the "the
	// plugin is still here" complaint the gate exists to answer.
	//
	// Keeps its own record rather than touching leftSidebar/rightSidebar.
	// Those two belong to the zen TOGGLE — they are what the sidebars go
	// back to when zen is turned off — and overwriting them on a tab change
	// would make "leave zen" restore whatever happened to be true the last
	// time a canvas was open.
	//
	// Transition-guarded: it acts when the answer changes, never on every
	// leaf change, so a sidebar the writer opens by hand on a canvas is not
	// fought with.
	syncSurfaceSidebars() {
		const ws = this.app.workspace;
		if (!ws || !ws.leftSplit || !ws.rightSplit) return;
		const suspend = !!(this.settings.pluginEnabled
			&& this.zenOn()
			&& !this.isNoteSurfaceActive());
		if (suspend === !!this._sidebarsSuspended) return;
		this._sidebarsSuspended = suspend;
		try {
			if (suspend) {
				this._suspendedLeft  = !!ws.leftSplit.collapsed;
				this._suspendedRight = !!ws.rightSplit.collapsed;
				if (ws.leftSplit.collapsed)  ws.leftSplit.expand();
				if (ws.rightSplit.collapsed) ws.rightSplit.expand();
			} else {
				if (this._suspendedLeft)  ws.leftSplit.collapse();
				if (this._suspendedRight) ws.rightSplit.collapse();
			}
		} catch (_) {}
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

	// Focused-file mode writes inline display/width/flex onto tab containers.
	// Putting those back is NOT the same as blanking them, and blanking them
	// is the bug reported as "zen mode breaks side tabs layouts" (#2):
	//
	//   document.querySelectorAll('.workspace-tabs').forEach(el => {
	//     el.style.display = ''; el.style.width = ''; el.style.flex = '';
	//   });
	//
	// `.workspace-tabs` is EVERY tab container in the workspace, including the
	// ones stacked inside the left and right sidedocks — and Obsidian stores
	// the size of stacked leaves as inline `flex-grow` on exactly those
	// elements. So the restore reached past everything focused-file mode had
	// touched, wiped the sizes Obsidian had written, and the flex container
	// then shared the space out evenly: two differently-sized panes in a
	// sidebar came back the same height. It fired on leaving zen whether or
	// not focused-file mode had ever been on, because the clear branch runs
	// whenever the mode is inactive.
	//
	// So: remember an element's inline values the first time we touch it, put
	// exactly those back, and touch nothing we did not write to.
	_focusTabRemember(el) {
		if (!this._focusTabPrev) this._focusTabPrev = new Map();
		if (this._focusTabPrev.has(el)) return;
		this._focusTabPrev.set(el, {
			display: el.style.display,
			width:   el.style.width,
			flex:    el.style.flex
		});
	}

	_focusTabRestore() {
		if (!this._focusTabPrev || !this._focusTabPrev.size) return;
		for (const [el, prev] of this._focusTabPrev) {
			el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
			el.style.display = prev.display;
			el.style.width   = prev.width;
			el.style.flex    = prev.flex;
		}
		this._focusTabPrev.clear();
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
		// zenActive() rather than settings.zenMode: on a canvas or a base
		// zen is suspended, and hiding every tab container but one there
		// would leave the writer no way back to their note.
		if (!this.zenActive() || !this.settings.focusedFileMode) {
			this._focusTabRestore();
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
			this._focusTabRemember(c);
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
		if (this.textOpt('enableParagraphIndent', false)
			&& this.settings.paragraphIndentMode !== 'single') {
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
		for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl,
			this.maskGuardLeftEl, this.maskGuardRightEl]) {
			if (el) el.remove();
		}
		this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
		this.maskGuardLeftEl = this.maskGuardRightEl = null;
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
		if (!this.retroBarActive()) return false;
		// Two independent reasons, either sufficient: the slide-away command,
		// and zen's own "hide the bar too" sub-option. Both route through
		// here rather than through separate paths, so everything that reads
		// "is the bar occupying the bottom of the window" — the gutter
		// reservation, the caret floor, the mask geometry — gets the same
		// answer without knowing why.
		if (this.settings.retroBarHidden) return true;
		return !!(this.settings.zenHideBar && this.zenActive());
	}

	retroBarActive() {
		return this.settings.enableRetroStatus && this.isActiveFileInScope();
	}

	updateStatusBar() {
		const wantBar = this.retroBarActive();
		if (wantBar && !this.retroStatusBarEl) {
			this.retroStatusBarEl = document.body.createEl('div', { cls: 'zengrinder-status-bar' });
			// The gutter plinth is its OWN element, not a shadow and not a
			// pseudo. A pseudo-element is clipped by the bar's overflow
			// (needed for text ellipsis), and a box-shadow cannot be
			// confined: covering the gutter under a short bar needs spread,
			// and spread grows sideways too — once the bar stopped being
			// full-width that poked past both of its ends, over the sidebar
			// and the pane divider. A sibling has exact geometry and no
			// bleed in any direction.
			this.retroPlinthEl = document.body.createEl('div', { cls: 'zg-bar-plinth' });
			this.startClockTick();
		} else if (!wantBar && this.retroStatusBarEl) {
			this.retroStatusBarEl.remove();
			this.retroStatusBarEl = null;
			if (this.retroPlinthEl) { this.retroPlinthEl.remove(); this.retroPlinthEl = null; }
			this.stopClockTick();
		}
		if (this.retroStatusBarEl) {
			// Powerline segments are the bar's surface, so the bar's own
			// rules are dropped while it is on: a 2px line in the text
			// colour along the top and bottom is exactly the strip the
			// segment colour was stopping short of. The segments carry
			// their own edges — that is what the shapes are for.
			const pl    = !!this.settings.powerlineEnabled;
			const bwSet = Math.max(1, Math.min(8, this.settings.statusBarBorderWidth || 2));
			const stSet = this.settings.statusBarBorderStyle || 'solid';
			// Each edge can be turned off on its own; the style dropdown's
			// "None" still turns both off at once.
			const onTop = stSet !== 'none' && this.settings.statusBarBorderTop    !== false;
			const onBot = stSet !== 'none' && this.settings.statusBarBorderBottom !== false;
			// In powerline the rules are drawn by an ::after OVERLAY rather
			// than borders. A border is part of the box, so it took its
			// width out of the row and the segment colour stopped short of
			// the bar's edge. The first replacement — inset box-shadows —
			// never showed at all: even an inset shadow paints BELOW the
			// element's children, and the segments fill the whole bar box,
			// so the rules were drawn and then covered every frame. The
			// pseudo-element sits above the segments (see styles.css,
			// .zg-powerline::after), takes the width and style the settings
			// ask for through the variables stamped here, and the segment
			// colour still runs to the edge underneath it. Borders on an
			// overlay also honour dashed/dotted, which a shadow never could.
			if (pl) {
				const S = this.retroStatusBarEl.style;
				S.setProperty('--zg-bar-rule-top-width',    onTop ? bwSet + 'px' : '0px');
				S.setProperty('--zg-bar-rule-bottom-width', onBot ? bwSet + 'px' : '0px');
				S.setProperty('--zg-bar-rule-style',        (onTop || onBot) ? stSet : 'none');
			} else {
				for (const v of ['--zg-bar-rule-top-width', '--zg-bar-rule-bottom-width',
					'--zg-bar-rule-style']) {
					this.retroStatusBarEl.style.removeProperty(v);
				}
			}
			// The stylesheet's box-shadow (the gutter plinth) is left alone
			// in both modes now that no inline shadow is written — an inline
			// value would replace it outright and silently remove the mask
			// under the bar (see invariant 4).
			this.retroStatusBarEl.style.boxShadow = '';
			this.retroStatusBarEl.style.borderTopWidth = (!pl && onTop) ? bwSet + 'px' : '0';
			this.retroStatusBarEl.style.borderTopStyle = (!pl && onTop) ? stSet : 'none';
			this.retroStatusBarEl.style.borderTopColor = 'var(--zg-text)';
			// And the same rule along the bottom, closing the bar off from
			// the vim gutter beneath it.
			this.retroStatusBarEl.style.borderBottomWidth = (!pl && onBot) ? bwSet + 'px' : '0';
			this.retroStatusBarEl.style.borderBottomStyle = (!pl && onBot) ? stSet : 'none';
			this.retroStatusBarEl.style.borderBottomColor = 'var(--zg-text)';
			// Those borders change the bar's height, and the bottom mask
			// ends at the bar's top edge — so the mask has to be restamped
			// after they land, not before. The ResizeObserver catches this
			// too; this is the cheap direct path for the common case.
			this.scheduleMaskPosition();
			// A bar rebuilt after the observer was created is a new element
			// and is not being watched yet.
			if (this.maskResizeObserver) {
				try { this.maskResizeObserver.observe(this.retroStatusBarEl); } catch (_) {}
			}
		}
		// Body class lets CSS lift bottom editor panels (vim ":" command
		// line etc.) above the bar — see styles.css.
		document.body.classList.toggle('zg-retrobar-active', !!this.retroStatusBarEl);
		// Re-stamp on every call (runs on leaf changes) so a status bar
		// element created after plugin load is still caught.
		this.applyNativeStatusBarVisibility(this.shouldHideNativeStatusBar());
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

	// Date parts, not a formatted string. {dd} {mm} {yyyy} {yy} compose in
	// the row format itself, so any separator or order works — dd/mm, mm-dd,
	// yyyy.mm.dd — without a format-string setting to parse, validate and
	// preview. The row format was already the place users arrange things.
	dateParts(now) {
		const yyyy = String(now.getFullYear());
		return {
			dd:   String(now.getDate()).padStart(2, '0'),
			mm:   String(now.getMonth() + 1).padStart(2, '0'),
			yyyy: yyyy,
			yy:   yyyy.slice(-2)
		};
	}

	// An analogue clock face: a circle and two hands, nothing else. No
	// numerals, no tick marks, no second hand — at bar sizes those become
	// noise, and a second hand would also force a per-second repaint of the
	// whole bar for a reading nobody takes from a 12px dial.
	//
	// SVG rather than a glyph, for the same reason the separators are: no
	// patched font to depend on, and it scales with the bar's font size.
	// currentColor throughout, so it inherits whatever the segment or the
	// bar is using and needs no colour setting of its own.
	// {obsidian} — the OFFICIAL crystal, at last.
	//
	// Fourth form, and the lesson of the first three is why it is this
	// one. A hand-drawn stone silhouette was a featureless spot; redrawn
	// as strokes it smeared into a scribble at 13px; rebuilt as a fill
	// with hand-cut facet grooves it was legible but still not THE icon.
	// The actual mark solves all three at once, because its designers
	// solved them first: the crystal's four facets are separate SUBPATHS,
	// so the facet lines are built-in gaps in the fill — the knockout
	// structure, drawn by the people who drew the logo, proven at favicon
	// size in every browser tab the app has ever sat in. One path, fill
	// currentColor, nothing else.
	//
	// Path data via the simple-icons library (CC0). The mark itself is
	// Obsidian's trademark, used here to depict Obsidian inside a
	// personal-use plugin, which their brand guidelines expressly allow.
	buildObsidianIcon() {
		const NS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-obsidian-icon');
		svg.setAttribute('viewBox', '0 0 24 24');
		const p = document.createElementNS(NS, 'path');
		p.setAttribute('d', OBSIDIAN_ICON_PATH);
		p.setAttribute('fill', 'currentColor');
		svg.appendChild(p);
		return svg;
	}

	buildClockFace(now) {
		const t = now || new Date();
		const NS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-clock');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		// Non-scaling stroke would keep the ring hairline-thin while the
		// hands stayed heavy; a plain width scales with the box instead.
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');

		const ring = document.createElementNS(NS, 'circle');
		ring.setAttribute('cx', '12');
		ring.setAttribute('cy', '12');
		ring.setAttribute('r', '9');
		svg.appendChild(ring);

		// Hours advance with the minutes — a hand that jumps between whole
		// hours reads as broken twice an hour, at :59 and :00.
		const mins  = t.getMinutes();
		const hours = t.getHours() % 12 + mins / 60;
		const hand = (angleDeg, length) => {
			// -90 so that 0 points up; SVG angles start at three o'clock.
			const a = (angleDeg - 90) * Math.PI / 180;
			const l = document.createElementNS(NS, 'line');
			l.setAttribute('x1', '12');
			l.setAttribute('y1', '12');
			l.setAttribute('x2', (12 + Math.cos(a) * length).toFixed(2));
			l.setAttribute('y2', (12 + Math.sin(a) * length).toFixed(2));
			svg.appendChild(l);
		};
		hand(hours * 30, 4);   // 30 degrees an hour, short hand
		hand(mins * 6,  6.5);  // 6 degrees a minute, long hand
		svg.setAttribute('aria-label', this.formatTime(t));
		return svg;
	}

	formatTime(now) {
		return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
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
		// Zen's chrome hiding is the one part of the plugin that is
		// deliberately NOT scoped to the path list (see the Scope section in
		// ARCHITECTURE.md) — but it is still scoped to notes. Hiding the
		// ribbon, the properties row and the status bar around a canvas
		// removes controls that canvas actually needs and hides nothing
		// distracting, since none of it is text.
		//
		// zenMode stays true underneath: this suspends the effect, it does
		// not turn the mode off, so tabbing back to the note restores it
		// without the writer having to re-enter zen.
		if (!this.isNoteSurfaceActive()) return false;
		return !!(this.opt('zenEnabled') && this.opt('zenMode'));
	}

	letterboxActive() {
		// A mode of its own since it joined the Modes popup. Gating it on
		// zenEnabled meant leaving Focus killed the letterbox and made the
		// popup's Letterbox toggle a dead switch whenever zen was off.
		if (!this.settings.enableLetterbox) return false;
		// Not in reading view. The masks exist to hide the strip above and
		// below the LINE YOU ARE WRITING — they are the frame around a moving
		// caret, and reading has no caret. In preview they are two bands
		// covering the top and bottom of something you are trying to read,
		// with arrows pointing at nothing.
		return !this.isReadingView();
	}

	// Reading mode, asked of the view rather than the DOM. Obsidian keeps both
	// containers alive and toggles which is shown (see stampMaskPositions), so
	// "is there a .markdown-preview-view" is not the question — getMode() is.
	isReadingView() {
		try {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return false;
			const mode = view.getMode ? view.getMode() : null;
			return mode === 'preview';
		} catch (_) { return false; }
	}

	// Obsidian keeps its right-to-left preference in appearance config, and
	// also sets it per note. Either is enough to mirror the text options.
	// The Text Options master switch, honoured at RUNTIME rather than only in
	// the settings pane.
	//
	// It used to hide the controls and nothing else: `miscEnabled` appeared
	// exactly once outside the settings tab, in its own default. So switching
	// the tab off left the horizontal padding, the paragraph indent, the line
	// limit, the justification, the line spacing and the hidden markers all
	// still applied, with no visible control left to turn any of them off
	// again. A master switch that only hides its own controls is worse than no
	// master switch, because it lies about what it did.
	//
	// Everything the tab owns is read through this one accessor, so a new
	// setting added to that tab cannot forget to be gated — it is gated by the
	// only route there is to its value.
	textOpt(key, whenOff) {
		if (!this.settings.miscEnabled) return whenOff;
		return this.settings[key];
	}

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

	// ── Surface gate ─────────────────────────────────────────────────────
	// Word-Smith is a writing suite: everything it does — the bar, the
	// masks, zen's chrome hiding, the type options — is about a note being
	// written. On a canvas, a base, a PDF, the graph or an empty tab there
	// is no note, so it all stands down and Obsidian comes back exactly as
	// it was, native status bar included. This is the FIRST question every
	// scope check asks; the path list and frontmatter overrides only decide
	// between notes.
	//
	// Read from the most recent leaf in the main area, NOT from
	// workspace.activeLeaf: clicking the file explorer, the outline or a
	// search box makes a sidebar leaf active, and gating on that would tear
	// the bar down and put it back every time the pointer left the editor.
	// getMostRecentLeaf() ignores the sidebars, which is exactly the
	// question being asked.
	//
	// getViewType() rather than `instanceof MarkdownView`: since 1.7
	// Obsidian defers unopened tabs, and a deferred view is not an instance
	// of anything useful while still reporting the type it will become.
	//
	// Fails OPEN on a throw. A future API change that breaks this should
	// leave the plugin working everywhere, not disable it everywhere.
	isNoteSurfaceActive() {
		try {
			const ws = this.app.workspace;
			// Fast path, and the only one that can see a markdown view in
			// a pop-out window: if the active view IS a note, it is a note.
			if (ws.getActiveViewOfType && ws.getActiveViewOfType(MarkdownView)) return true;
			let leaf = null;
			try { leaf = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : null; } catch (_) {}
			if (!leaf) leaf = ws.activeLeaf || null;
			const view = leaf && leaf.view;
			if (!view) return false;   // no pane at all
			const type = view.getViewType ? view.getViewType() : '';
			return type === 'markdown';
		} catch (_) { return true; }
	}

	// Whether a given CodeMirror view belongs to a markdown leaf. Canvas
	// cards, base formula fields and embedded editors are real CM6 views
	// that no leaf walk can identify — getFileForEditorView returns null
	// for them, which is indistinguishable from "a note whose leaf is not
	// wired up yet". The leaf container's data-type answers it directly.
	//
	// Fails OPEN for the same reason as above, and specifically so that an
	// editor in some container this does not recognise keeps its
	// decorations rather than silently losing them.
	editorViewIsNote(cmView) {
		try {
			const dom = cmView && cmView.dom;
			if (!dom || !dom.closest) return true;
			const host = dom.closest('.workspace-leaf-content[data-type]');
			if (!host) return true;
			return host.getAttribute('data-type') === 'markdown';
		} catch (_) { return true; }
	}

	hasScopeLimits() {
		return Array.isArray(this.settings.scopePaths) && this.settings.scopePaths.length > 0;
	}

	// True when the path is named by the list, either exactly (a note) or as
	// an ancestor (a folder). Prefix matching appends the separator so that
	// "Novel" does not also claim "Novel Ideas/draft.md".
	countExcludeList() {
		const s = this.settings;
		if (!Array.isArray(s.countExclude)) s.countExclude = [];
		return s.countExclude;
	}

	// Whole path segments only, so excluding "Book/Notes" does not also
	// exclude "Book/Notebook.md". The same rule the goal renames and the
	// history scoping use.
	isPathExcludedFromCounts(path) {
		if (!path) return false;
		for (const entry of this.countExcludeList()) {
			if (!entry) continue;
			const base = String(entry).replace(/\/+$/, '');
			if (!base) continue;
			if (path === base || path.indexOf(base + '/') === 0) return true;
		}
		return false;
	}

	// The single question every counting surface should ask: the writing
	// history, the folder totals behind a goal, and the badges in the file
	// explorer. Scope first, because "ignore this note entirely" outranks
	// "count it or not".
	isFileCounted(file) {
		if (!file || !file.path) return false;
		// The history store is a note in the vault, and the History tab tells
		// people to keep it beside their manuscript — so without this it lands
		// INSIDE the folder whose goal it would then inflate, growing by a row
		// a day while it does so. It is already excluded from the history
		// itself by path; this is the same exclusion for every other total.
		if (this._historyPath && file.path === this._historyPath) return false;
		if (!this.isFileInScope(file)) return false;
		return !this.isPathExcludedFromCounts(file.path);
	}

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
		// Surface first: a canvas or a base is out of scope before any path
		// list or frontmatter is consulted, because there is no note to
		// consult them about.
		if (!this.isNoteSurfaceActive()) return false;
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
		// Not a note's editor at all — a canvas card, a base field — so no
		// decoration belongs in it, whatever file the pane behind it holds.
		const val = this.editorViewIsNote(cmView)
			&& this.isFileInScope(this.getFileForEditorView(cmView));
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
		this.applyVimMotionMaps();
		// Crossing into or out of a note is also what suspends and restores
		// zen's collapsed sidebars.
		this.syncSurfaceSidebars();
	}

	// Keep the list pointing at real paths as notes and folders move. Without
	// this, renaming a folder silently orphans its entry and the plugin stops
	// applying somewhere the user still expects it.
	// A goal is attached to a manuscript, not to a string. Until now it was
	// stored under a path and nothing moved it, so dragging a chapter into a
	// folder — or renaming the folder above it — silently dropped every target
	// underneath. Both maps are rewritten on rename, and a FOLDER rename has
	// to rewrite the file goals nested inside it as well as its own entry,
	// which is why this walks prefixes rather than looking for an exact key.
	renameGoalPaths(oldPath, newPath) {
		if (!oldPath || !newPath || oldPath === newPath) return false;
		let changed = false;
		for (const which of ['fileGoals', 'folderGoals']) {
			const map = this.settings[which];
			if (!map || typeof map !== 'object') continue;
			for (const key of Object.keys(map)) {
				let next = null;
				if (key === oldPath) next = newPath;
				else if (key.startsWith(oldPath + '/')) next = newPath + key.slice(oldPath.length);
				if (next === null || next === key) continue;
				// If something already sits at the destination it wins: the
				// user set that one deliberately and more recently.
				if (!Object.prototype.hasOwnProperty.call(map, next)) map[next] = map[key];
				delete map[key];
				changed = true;
			}
		}
		return changed;
	}

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
		// _fitShortenFile is set by the fit pass and read HERE, at build
		// time. The first version of this rewrote the rendered element
		// instead, and the bar re-renders every second — the two fought and
		// the name visibly flipped back and forth. Deciding it while the
		// text is being produced means every render is self-consistent and
		// there is nothing to undo.
		if ((this.settings || {}).fileTokenFormat === 'name' || this._fitShortenFile) {
			return file.basename;
		}
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


	// ════════════════════════════════════════════════════════════════════════
	// RETRO BAR: rows, modes, pickers
	// ════════════════════════════════════════════════════════════════════════

	// Normalised row list: left/center/right strings, regardless of what
	// data.json holds.
	//
	// ONE row, deliberately, and `statusBarRows` is vestigial — the bar's
	// height reserves for one too (see barRows in applyCssVariables), so the
	// two agree and nothing is half-drawn. What was left behind is the
	// setting itself, which is still in DEFAULT_SETTINGS and still carried
	// by share codes at index 0, and this comment, which used to claim it
	// was honoured.
	//
	// Restoring multi-row means changing both counts together; changing one
	// gives either rows with no space to draw in or a bar with an empty
	// strip at the bottom.
	getStatusRows() {
		const n   = 1;
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
			// `on` is a live function on most pickers; testing it as a value
			// made every row read as on, which is why toggled-off modes
			// never faded until now.
			const isOn = typeof item.on === 'function' ? item.on() : !!item.on;
			row.className = 'zg-picker-row' + (isOn ? '' : ' is-off') + (item.sub ? ' is-sub' : '');

			// Only colour-bearing rows get a swatch. A hollow ring beside
			// "Spaces" said nothing except that a circle could have gone
			// there; without one the whole popup collapses to labels.
			if (item.color) {
				const dot = document.createElement('span');
				dot.className = 'zg-picker-dot';
				// 'currentColor' means "whatever this row is drawn in",
				// which is already the stylesheet's default for the dot —
				// so it is a request for a ball, not for a colour, and
				// writing it inline would be a second copy of that default.
				// It also keeps fading with the row when the check is off,
				// which a fixed value does not.
				if (item.color !== 'currentColor') dot.style.backgroundColor = item.color;
				row.appendChild(dot);
			}

			if (item.icon) {
				const ic = item.icon();
				ic.classList.add('zg-picker-icon');
				row.appendChild(ic);
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

		// Live handles for refreshBarPicker — never wired before, so click
		// toggles repainted nothing.
		pop._live = items;

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
			const fn = live[i].on;
			rows[i].classList.toggle('is-off', !(typeof fn === 'function' ? fn() : fn));
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
	// Pixel fireworks over the report when a goal is crossed. Rebuilt after
	// the gauge cleanup accidentally took the original with it. Two nested
	// elements per spark — the outer flies along its own angle, the inner
	// falls and fades — and the CSS drives all of the motion; this only
	// stamps positions, angles, distances and colours.
	celebrate(host) {
		try {
			if (!host) return;
			if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
			// Plain DOM throughout. Obsidian's createDiv throws on a cls string
			// containing a space, and one throw here kills the whole show
			// silently — createElement cannot be broken that way.
			const div = (cls, parent) => {
				const d = document.createElement('div');
				d.className = cls;
				(parent || host).appendChild(d);
				return d;
			};
			const wrap = div('zg-fireworks');
			const colors = ['#ffd166', '#ef476f', '#06d6a0', '#4f9dde', '#e347e6', '#fbfaf9', '#e0913a'];
			const spark = (parent, size, color, delay) => {
				const sp = div('zg-firework-spark', parent);
				sp.style.width = sp.style.height = size + 'px';
				sp.style.background = color;
				sp.style.animationDelay = delay + 'ms';
			};
			// arcStart/arcSpan aim a burst: full circle by default, a narrow
			// upward fan for fountains, inward fans for the corner jets.
			const burst = (x, y, count, dist, kind, delay, arcStart, arcSpan) => {
				const a0   = arcStart == null ? 0   : arcStart;
				const span = arcSpan  == null ? 360 : arcSpan;
				const fw = div('zg-firework', wrap);
				fw.style.left = x + '%'; fw.style.top = y + '%';
				for (let i = 0; i < count; i++) {
					const vec = div('zg-firework-vec ' + kind, fw);
					vec.style.setProperty('--a', Math.round(a0 + (span / count) * i + Math.random() * (span / count) * 0.6) + 'deg');
					vec.style.setProperty('--d', String(-Math.round(dist * (0.6 + Math.random() * 0.7))) + 'px');
					vec.style.animationDelay = delay + 'ms';
					spark(vec, 2 + Math.floor(Math.random() * 3), colors[(i + delay) % colors.length], delay);
				}
				return fw;
			};
			// A crackle bursts, then pops a handful of micro-bursts around
			// its own rim a beat later.
			const crackle = (x, y) => {
				burst(x, y, 10, 40, 'is-fly', 0);
				for (let i = 0; i < 5; i++) {
					window.setTimeout(() => { try {
						burst(x + (Math.random() * 16 - 8), y + (Math.random() * 12 - 6),
							6, 16, 'is-crackle', 0);
					} catch (_) {} }, 420 + i * 110);
				}
			};
			// Glitter: lone pixels twinkling anywhere on the layer.
			const glitter = (n, over) => {
				for (let i = 0; i < n; i++) {
					const tw = div('zg-firework-twinkle', wrap);
					tw.style.left = (4 + Math.random() * 92) + '%';
					tw.style.top  = (4 + Math.random() * 88) + '%';
					tw.style.width = tw.style.height = (1 + Math.round(Math.random())) + 'px';
					tw.style.background = colors[i % colors.length];
					tw.style.animationDelay = Math.round(Math.random() * over) + 'ms';
				}
			};
			const ring = (x, y, count, dist, delay) => {
				const fw = div('zg-firework', wrap);
				fw.style.left = x + '%'; fw.style.top = y + '%';
				const c = colors[Math.floor(Math.random() * colors.length)];
				for (let i = 0; i < count; i++) {
					const vec = div('zg-firework-vec is-ring', fw);
					// No jitter: uniform angles and one distance make a circle.
					vec.style.setProperty('--a', Math.round((360 / count) * i) + 'deg');
					vec.style.setProperty('--d', String(-dist) + 'px');
					vec.style.animationDelay = delay + 'ms';
					spark(vec, 3, c, delay);
				}
			};
			const rocket = (x, breakY, at, kind, count, dist) => {
				window.setTimeout(() => { try {
					const rk = div('zg-firework', wrap);
					rk.style.left = x + '%'; rk.style.top = '94%';
					const head = div('zg-firework-head', rk);
					head.style.setProperty('--rise', '150px');
					spark(head, 3, '#fbfaf9', 0);
					window.setTimeout(() => { try {
						burst(x, breakY, count || 14, dist || 56, kind || 'is-rocket', 0);
						rk.remove();
					} catch (_) {} }, 950);
				} catch (_) {} }, at);
			};
			// A shell that breaks, then breaks AGAIN a beat later from the
			// same point in a second colour — the classic double-break.
			const shell = (x, y, delay) => {
				at(delay,       () => burst(x, y, 16, 58, 'is-chrys', 0));
				at(delay + 480, () => burst(x, y, 12, 34, 'is-strobe', 0));
			};
			// A barrage: n shells walked across the report on a stagger.
			const barrage = (n, y, delay, spacing) => {
				for (let i = 0; i < n; i++) {
					const x = 12 + (76 / (n - 1)) * i;
					at(delay + i * (spacing || 140),
						() => burst(x, y + (i % 2 ? 6 : 0), 11, 46,
							i % 2 ? 'is-fly' : 'is-strobe', 0));
				}
			};
			const at = (ms, fn) => window.setTimeout(() => { try { fn(); } catch (_) {} }, ms);

			// Thirteen seconds, choreographed in five movements. Glitter
			// underlies the whole show; over it, each movement is louder
			// than the one before and the finale is a wall.
			glitter(46, 7000);

			// I — openers
			burst(24, 26, 14, 50, 'is-fly', 0);
			at(200,  () => burst(76, 22, 14, 50, 'is-fly', 0));
			at(430,  () => burst(50, 34, 12, 44, 'is-strobe', 0));
			at(650,  () => ring(50, 28, 18, 46, 0));
			at(900,  () => burst(12, 40, 10, 40, 'is-comet', 0));
			at(1020, () => burst(88, 38, 10, 40, 'is-comet', 0));

			// II — jets from the floor, a rocket, a fountain
			at(1250, () => burst(8,  96, 10, 72, 'is-jet', 0, 5, 70));
			at(1400, () => burst(92, 96, 10, 72, 'is-jet', 0, -75, 70));
			rocket(50, 32, 1550, 'is-chrys', 18, 62);
			at(2500, () => burst(50, 97, 11, 64, 'is-jet', 0, -32, 64));
			at(2800, () => burst(50, 97, 11, 72, 'is-jet', 0, -26, 52));
			at(3050, () => burst(50, 97, 11, 80, 'is-jet', 0, -20, 40));

			// III — willows and comets over the top
			at(3300, () => burst(30, 28, 16, 54, 'is-willow', 0));
			at(3550, () => burst(70, 24, 16, 54, 'is-willow', 0));
			at(3850, () => burst(50, 20, 12, 66, 'is-comet', 0));
			at(4100, () => crackle(26, 44));
			at(4300, () => crackle(74, 40));
			at(4550, () => ring(20, 36, 14, 38, 0));
			at(4700, () => ring(80, 36, 14, 38, 0));

			// IV — double-break shells, walked across
			shell(34, 30, 4900);
			shell(66, 26, 5250);
			rocket(28, 30, 5400, 'is-chrys', 16, 58);
			rocket(72, 26, 5700, 'is-chrys', 16, 58);
			at(6200, () => glitter(22, 900));
			barrage(6, 34, 6400, 150);
			at(7400, () => burst(50, 30, 20, 60, 'is-chrys', 0));

			// V — the finale: everything at once, then a wide ring over it
			at(8200, () => { crackle(20, 38); crackle(50, 30); crackle(80, 38); });
			at(8500, () => burst(50, 97, 14, 90, 'is-jet', 0, -22, 44));
			barrage(8, 28, 8700, 110);
			shell(50, 26, 9600);
			at(9800,  () => burst(16, 34, 14, 52, 'is-willow', 0));
			at(9950,  () => burst(84, 34, 14, 52, 'is-willow', 0));
			at(10200, () => glitter(30, 700));
			at(10400, () => { burst(30, 32, 16, 56, 'is-strobe', 0);
			                  burst(70, 32, 16, 56, 'is-strobe', 0); });
			at(10800, () => ring(50, 30, 26, 62, 0));
			at(11000, () => ring(50, 30, 20, 40, 0));
			at(11300, () => burst(50, 30, 24, 74, 'is-chrys', 0));
			at(11600, () => glitter(24, 600));
			window.setTimeout(() => { try { wrap.remove(); } catch (_) {} }, 15000);
		} catch (_) {}
	}

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
		// Only the notes Word-Smith applies to.
		//
		// This counted every markdown file under the folder, which put the
		// goals at odds with everything else in the plugin: a research note
		// inside a book folder carrying `wordsmith: off` was excluded from the
		// writing history and from the word count in the bar, and then counted
		// in full towards the folder's target. "Ignore this note entirely" has
		// to mean that everywhere, or it does not mean anything.
		//
		// Anyone using a scope list will see folder totals fall the first time
		// they open the report after updating. The smaller number is the one
		// they asked for.
		const files = this.filesInFolder(path, true).filter(f => this.isFileCounted(f));
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

	// The report's ink tank, drawn on a CANVAS rather than as SVG shapes.
	//
	// Why the change: the look wanted here — water on a coarse pixel
	// lattice, a hue that drifts, and an aurora field at 100% — is
	// per-cell colour over a 2D grid. SVG can fake the first with a
	// <pattern> and cannot do the third at all: a linearGradient varies
	// colour along ONE axis, so every band stays a straight line however
	// hard its sample position is warped. A field that ripples sideways
	// needs colour to be a function of x AND y, which means writing
	// pixels. (Same reasoning, and the same warp, as Cursor-Smith's
	// auroraPattern.)
	//
	// The lattice is the point, not an artefact: cell size is fixed in
	// CSS pixels and every cell takes ONE quantised colour, so the water
	// reads as chunky and deliberate rather than as a soft gradient that
	// happens to be low-resolution.
	//
	// The percentage is a DOM element on top, not SVG text: it inherits
	// the chosen editor font by CSS, sits dead centre, and does not move.
	buildGoalLiquid(ratio) {
		const r = Math.min(Math.max(ratio || 0, 0), 1);
		const full = r >= 1;

		const wrap = document.createElement('div');
		wrap.className = 'zg-goal-liquid' + (full ? ' is-full' : '');

		const canvas = document.createElement('canvas');
		canvas.className = 'zg-liquid-canvas';
		wrap.appendChild(canvas);

		const pct = document.createElement('div');
		pct.className = 'zg-jar-pct';
		pct.textContent = Math.round(r * 100) + '%';
		wrap.appendChild(pct);

		const ctx = canvas.getContext ? canvas.getContext('2d') : null;
		if (!ctx) return wrap;

		// Cell size in CSS px. 5 is coarse enough to read as pixel art at
		// the tank's ~76px height without turning the surface into steps.
		const CELL   = 5;
		// Discrete shade steps. Quantising is what keeps the edges crunchy;
		// without it the depth ramp is just a smooth gradient again.
		const LEVELS = 14;
		const quant  = (v) => Math.round(v * LEVELS) / LEVELS;
		// Opacity gets its own, much coarser ladder. Alpha varying on the
		// same fine steps as colour just reads as noise; on eight steps it
		// reads as distinct layers of water at different densities.
		const quantA = (v) => Math.round(Math.max(0, Math.min(1, v)) * 8) / 8;
		// Lightness is banded to whole steps as well, so the depth ramp
		// shows as a stack of visible strata rather than a smooth fade —
		// the banding IS the look here, not an artefact to be dithered out.
		const band   = (v) => Math.round(v / 3) * 3;

		const reduce = !!(window.matchMedia
			&& window.matchMedia('(prefers-reduced-motion: reduce)').matches);

		// The heat ramp lives on the holder as a colour; reading it back
		// keeps ONE source of truth for the ember→amber→green climb
		// (and picks up a custom goal colour for free). Parsed to a hue.
		let baseHue = 8 + r * 122, baseSat = 62, baseLig = 44;
		try {
			const m = getComputedStyle(canvas).color.match(/[\d.]+/g);
			if (m && m.length >= 3) {
				const hsl = this._rgbToHsl(+m[0], +m[1], +m[2]);
				baseHue = hsl[0]; baseSat = hsl[1]; baseLig = hsl[2];
			}
		} catch (_) {}

		let raf = null, last = 0, w = 0, h = 0, cols = 0, rows = 0;
		const t0 = performance.now();

		const resize = () => {
			const rect = wrap.getBoundingClientRect();
			const cw = Math.max(40, Math.round(rect.width  || 300));
			const ch = Math.max(24, Math.round(rect.height || 76));
			if (cw === w && ch === h) return;
			w = cw; h = ch;
			cols = Math.ceil(w / CELL);
			rows = Math.ceil(h / CELL);
			// Backing store is one device pixel per CSS pixel — the cells
			// are already the resolution, so a dpr-scaled buffer would cost
			// 4x the fill for a lattice that cannot show the difference.
			canvas.width = w; canvas.height = h;
		};

		// Aurora: colour as a warped 2D field. Four incommensurate
		// frequencies, each mixing u and v — a term in v alone is what
		// produces flat horizontal banding, and the cross terms are what
		// let a curtain bend as it crosses the tank.
		//
		// The palette is DEALT, once per opening of the report (see the
		// seed in openReportModal). One seed feeds several derived values,
		// taken as the fractional parts of multiples of it so they are
		// independent of one another rather than all sliding together:
		//   rot    — where on the wheel the palette starts, so one report
		//            opens cold blue-violet and the next opens gold-green
		//   p1..p3 — phase offsets INTO the warp terms, so the curtains
		//            hang in different places too. Rotating hue alone gives
		//            the same aurora repainted; moving the phases makes it
		//            a different sky.
		//   spread — how far the harmonics swing, i.e. whether this one is
		//            a tight two-colour shimmer or the whole wheel at once
		const S      = (typeof this._auroraSeed === 'number') ? this._auroraSeed : Math.random();
		const frac   = (n) => { const v = S * n; return v - Math.floor(v); };
		const rot    = frac(1) * 360;
		const p1     = frac(2.7) * 6.283;
		const p2     = frac(5.1) * 6.283;
		const p3     = frac(8.9) * 6.283;
		const spread = 0.72 + frac(3.3) * 0.62;
		// Which way the whole palette rotates as it runs — half the reports
		// drift warm-to-cold and half the other way.
		const dir    = frac(6.4) < 0.5 ? -1 : 1;

		const auroraCell = (u, v, t) => {
			// Its own slower clock. The aurora is the resting state of a
			// finished goal; at the water's tempo it read as agitated.
			const T = t * 0.42;
			const warp =
				Math.sin(v * 4.1 + T * 0.55 + u * 2.3 + p1) * 0.22 +
				Math.sin(v * 7.3 - T * 0.38 + u * 3.7 + p2) * 0.12 +
				Math.sin(u * 5.2 + T * 0.62 - v * 1.9 + p3) * 0.16 +
				Math.sin((u + v) * 3.3 - T * 0.27 + p1) * 0.09;
			let s = v * 0.6 - T * 0.14 + warp;
			s = s - Math.floor(s);
			// A cold ramp deliberately unlike the heat ramp: this is the
			// reward state, so it should not look like more of the same
			// green. Three harmonics put several distinct colours on
			// screen AT ONCE — teal, green, violet, magenta, ice blue —
			// instead of one hue sweeping through them; the last term
			// rotates the whole palette slowly, so the same curtain is a
			// different colour a minute later.
			const hue = rot
				+ Math.sin(s * Math.PI * 2) * 70 * spread
				+ Math.sin((s + 0.33) * Math.PI * 4) * 50 * spread
				+ Math.sin((s + 0.66) * Math.PI * 6) * 28 * spread
				+ T * 9 * dir;
			// Two ray systems at different scales: broad curtains with a
			// finer structure inside them, which is what keeps the field
			// from reading as a single soft cloud.
			const ray1 = 0.5 + 0.5 * Math.sin(u * 3.0 + warp * 6 + T * 0.30 + p2);
			const ray2 = 0.5 + 0.5 * Math.sin(u * 7.5 - warp * 4 - T * 0.22 + v * 2.0 + p3);
			const curtain = quant(ray1 * 0.65 + ray2 * 0.35);
			const lig = 30 + curtain * 34 + (1 - v) * 10;
			const sat = 58 + curtain * 30;
			// Banded transparency: the tank's own background shows through
			// the gaps between curtains, so the aurora hangs IN the glass
			// rather than filling it like paint.
			const alpha = quantA(0.42 + curtain * 0.58);
			return 'hsla(' + Math.round(((hue % 360) + 360) % 360) + ','
				+ Math.round(Math.max(0, Math.min(100, sat))) + '%,'
				+ Math.round(Math.max(0, Math.min(100, lig))) + '%,'
				+ alpha.toFixed(2) + ')';
		};

		const draw = (now) => {
			raf = null;
			// The modal empties its body on every tab switch and on close,
			// which detaches this canvas — that is the teardown signal. No
			// listener to leak, and nothing keeps rendering behind a closed
			// report.
			if (!canvas.isConnected) return;
			resize();
			const t = (now - t0) / 1000;
			ctx.clearRect(0, 0, w, h);

			if (full) {
				for (let gy = 0; gy < rows; gy++) {
					const v = gy / rows;
					for (let gx = 0; gx < cols; gx++) {
						ctx.fillStyle = auroraCell(gx / cols, v, t);
						ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
					}
				}
			} else {
				// Surface height per COLUMN, so the wave is sampled on the
				// lattice too — the crest steps rather than curving, which
				// is what makes it read as pixel water instead of as a
				// smooth path that happens to be drawn in blocks.
				//
				// Three components, deliberately incommensurate: a primary
				// swell, a slower counter-swell drifting the other way, and
				// a small fast chop on top. Two waves beat against each
				// other on a visible cycle; three do not, so the surface
				// never looks like it is repeating.
				const restY = h - 6 - r * (h - 16);
				const amp   = Math.min(5, h * 0.06);
				const tank  = Math.max(1, h - restY);
				for (let gx = 0; gx < cols; gx++) {
					const x = gx * CELL;
					const surf = restY
						+ Math.sin(x * 0.055 + t * 1.15) * amp
						+ Math.sin(x * 0.021 - t * 0.70) * amp * 0.7
						+ Math.sin(x * 0.130 + t * 1.90) * amp * 0.22;
					// Slow, wide columns of light drifting across the tank —
					// the same trick as a light shaft through water, and
					// what stops the fill from being uniform side to side.
					const shaft = 0.5 + 0.5 * Math.sin(x * 0.017 + t * 0.22);
					for (let gy = 0; gy < rows; gy++) {
						const y = gy * CELL;
						if (y + CELL <= surf) continue;
						const below = y - surf;
						// Depth below the surface, normalised on the tank. The
						// cell the surface passes through is only partly wet,
						// so this goes negative there — clamped, because a
						// negative depth would brighten the ramp backwards.
						const depth = quant(Math.max(0, Math.min(1, below / tank)));
						// Caustics: two diagonal ripple fields crossing, which
						// is what throws the wobbling net of light through real
						// water. Quantised coarsely so it lands as blocks of
						// brightness rather than a smooth sheen, and faded with
						// depth because the light does not reach the bottom.
						const caus = quantA((
							Math.sin(x * 0.090 + y * 0.130 - t * 1.60) +
							Math.sin(x * 0.050 - y * 0.070 + t * 1.10)
						) / 4 + 0.5);
						const causDepth = caus * (1 - depth * 0.65);
						// Hue drift: a few degrees, moving with time, depth and
						// the caustic field. Big enough to notice on a slow
						// look, small enough that it never reads as a cycle.
						const hue = baseHue
							+ Math.sin(t * 0.28 + depth * 2.4) * 7
							+ Math.sin(x * 0.01 + t * 0.16) * 4
							+ causDepth * 4;
						// Four bands down the column, each with its own
						// treatment rather than one continuous ramp: the
						// crest cap, the foam under it, open water, and the
						// sediment at the floor.
						const crest = below < CELL;
						const foam  = below < CELL * 2.5;
						let lig, sat, alpha;
						if (crest) {
							// The lit edge of the wave. Nearly white, barely
							// saturated, and the most opaque thing in the tank.
							lig   = baseLig + 34 + causDepth * 6;
							sat   = baseSat - 26;
							alpha = 0.96;
						} else if (foam) {
							lig   = baseLig + 19 + causDepth * 8;
							sat   = baseSat - 10;
							alpha = quantA(0.80 + caus * 0.12);
						} else {
							lig   = baseLig + 12 - depth * 28
								+ causDepth * 9 + shaft * 5;
							sat   = baseSat + depth * 16 - causDepth * 6;
							// Deep water is denser: the background reads
							// clearly through the shallows and not at all
							// through the floor. The range is wide on
							// purpose — a narrow one lands on two steps of
							// the ladder and the layering disappears.
							alpha = quantA(0.48 + depth * 0.50 + caus * 0.06);
						}
						// Sediment: the last fifth of the tank darkens and
						// saturates further, so the fill has a floor instead
						// of fading out at the bottom edge.
						if (depth > 0.8) {
							const s2 = (depth - 0.8) / 0.2;
							lig -= s2 * 12;
							sat += s2 * 8;
						}
						ctx.fillStyle = 'hsla(' + Math.round(hue) + ','
							+ Math.round(Math.max(0, Math.min(100, sat))) + '%,'
							+ band(Math.max(0, Math.min(100, lig))) + '%,'
							+ alpha.toFixed(2) + ')';
						ctx.fillRect(x, y, CELL, CELL);
					}
				}
			}
			// ~30fps. The lattice cannot show more, and this is a modal
			// that may sit open for minutes.
			if (reduce) return;
			last = now;
			raf = requestAnimationFrame(step);
		};

		const step = (now) => {
			if (now - last < 33) { raf = requestAnimationFrame(step); return; }
			draw(now);
		};

		// First frame synchronously-ish, so the tank is never briefly blank.
		raf = requestAnimationFrame(draw);
		return wrap;
	}

	// rgb → hsl, hue in degrees, s/l in percent. Only used by the gauge to
	// read the heat ramp back off the holder.
	_rgbToHsl(r, g, b) {
		r /= 255; g /= 255; b /= 255;
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		const l = (max + min) / 2;
		let hue = 0, s = 0;
		if (max !== min) {
			const d = max - min;
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
			if (max === r)      hue = ((g - b) / d + (g < b ? 6 : 0));
			else if (max === g) hue = ((b - r) / d + 2);
			else                hue = ((r - g) / d + 4);
			hue *= 60;
		}
		return [hue, s * 100, l * 100];
	}


	// Goals render nowhere in the bar. Their state exists for the met flash
	// and the report only — the top-edge hairline that used to read from it
	// was removed, along with the per-goal colours that only ever tinted
	// that line. The folder total still refreshes in the background and
	// repaints when it lands.
	registerGoalStates() {
		const s = this.settings;
		if (!this._goalStates) this._goalStates = [];

		const view    = this.app.workspace.getActiveViewOfType(MarkdownView);
		const fpath   = view && view.file ? view.file.path : null;
		const ftarget = fpath ? this.fileGoalFor(fpath) : 0;
		if (fpath && ftarget) {
			const words = this._zgLastTotalWordCount || 0;
			this._goalStates.push({
				kind: 'file', ratio: Math.min(words / ftarget, 1), met: words >= ftarget
			});
		}

		const dpath   = this.activeFolderPath();
		const dtarget = dpath ? this.folderGoalFor(dpath) : 0;
		if (dpath && dtarget) {
			const words = this._folderWordCache && this._folderWordCache.path === dpath
				? this._folderWordCache.words : 0;
			this._goalStates.push({
				kind: 'folder', ratio: Math.min(words / dtarget, 1), met: words >= dtarget
			});
			this.refreshFolderWords(dpath);
		}
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

	// ════════════════════════════════════════════════════════════════════════
	// Writing history
	// ════════════════════════════════════════════════════════════════════════
	//
	// The first thing Word-Smith stores about BEHAVIOUR rather than about
	// configuration, which is why it is opt-in and why the settings row says
	// in plain words what is kept: counts per day, never text.
	//
	// One record per local calendar day. Months and years roll up on READ and
	// are never stored — a stored rollup is a second copy of the truth, and
	// two copies of an answer is how the settings pane opened on the wrong
	// tab for several releases.

	// Local time, never UTC: a writer working at 23:40 is writing today,
	// wherever today is. Building the key by hand rather than through
	// toISOString(), which converts to UTC and hands back yesterday for half
	// the planet every evening.
	historyDateKey(d) {
		const dt = d instanceof Date ? d : new Date();
		const p  = (n) => (n < 10 ? '0' : '') + n;
		return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
	}

	// ════════════════════════════════════════════════════════════════════════
	// The store: history.md IS the record
	// ════════════════════════════════════════════════════════════════════════
	//
	// Until 1.28 the record lived in data.json and the note was a mirror. That
	// is backwards for something a writer will want to keep: data.json is
	// invisible, is deleted with the plugin, and is not a thing you can put in
	// a folder with the manuscript it describes. So the note is now the store,
	// and the plugin FINDS it — by its marker, anywhere in the vault, under
	// any name. Move it, rename it, put it in a subfolder: it is still yours
	// and it is still found.
	//
	// data.json keeps exactly one history-related thing, and it is not
	// history: `historyBaselines`, the "what did this file weigh last time I
	// looked" cache. It is worthless to a human reader, it would be a kilobyte
	// of JSON in the middle of somebody's note, and it rebuilds itself. Delete
	// data.json and you lose the first edit of each file in the next session.
	// Delete history.md and you have lost the record — which is the honest
	// shape of the thing, and is said in the settings pane in those words.

	historyEnsure() {
		let h = this._history;
		if (!h || typeof h !== 'object') h = {};
		if (!h.days || typeof h.days !== 'object' || Array.isArray(h.days)) h.days = {};
		if (h.started === undefined) h.started = null;
		if (!h.paths || typeof h.paths !== 'object' || Array.isArray(h.paths)) h.paths = {};
		// Switching "Remember which notes" off means the note names go, not
		// merely that no new ones are added. Anything else leaves a file full
		// of paths that a person has just asked not to keep, and a finder
		// still offering them.
		if (this.settings.historyPerFile === false) {
			if (Object.keys(h.paths).length) h.paths = {};
			if (h.today && h.today.by && Object.keys(h.today.by).length) h.today.by = {};
		}
		if (!h.today || typeof h.today !== 'object' || !h.today.date) {
			h.today = { date: this.historyDateKey(), a: 0, r: 0, n: 0, by: {} };
		}
		if (!h.today.by || typeof h.today.by !== 'object') h.today.by = {};
		for (const k of ['a', 'r', 'n']) if (typeof h.today[k] !== 'number') h.today[k] = 0;
		this._history = h;
		return h;
	}

	// The baseline cache. Lives on settings, because it IS configuration-
	// adjacent bookkeeping rather than a record of anything.
	historyBaselines() {
		const s = this.settings;
		if (!s.historyBaselines || typeof s.historyBaselines !== 'object'
			|| Array.isArray(s.historyBaselines)) s.historyBaselines = {};
		return s.historyBaselines;
	}

	// No midnight timer. The date is recomputed on every event, so a laptop
	// asleep across midnight compacts correctly on the first keystroke of the
	// morning — which is the case a timer gets wrong.
	historyCompact(h, key) {
		if (!h.today || h.today.date === key) return false;
		const t = h.today;
		// A day with no activity is not stored. Absent means "did not write",
		// which is what every reader of the chart assumes a gap means.
		if (t.a || t.r) {
			h.days[t.date] = { a: t.a, r: t.r, n: t.n };
			if (Object.keys(t.by).length) h.paths[t.date] = t.by;
		}
		h.today = { date: key, a: 0, r: 0, n: 0, by: {} };
		return true;
	}

	// ── Finding the file ────────────────────────────────────────────────────

	historyDefaultPath() {
		let p = String(this.settings.historyFilePath || 'history.md').trim();
		p = p.replace(/^\/+/, '');
		if (!/\.md$/i.test(p)) p += '.md';
		return p;
	}

	// What the settings pane shows, and null before anything has been found.
	historyStorePath() { return this._historyPath || null; }

	historyIsStoreFile(text) {
		return String(text || '').indexOf(HISTORY_MARK_START) !== -1;
	}

	// Cheapest first, and a full scan only as a last resort. The marker is an
	// HTML comment, so the metadata cache cannot help and the contents have to
	// be read — but cachedRead is warm for anything Obsidian has already
	// opened, and this runs once per session unless the file goes missing.
	async historyFindFile() {
		const vault = this.app.vault;
		const check = async (file) => {
			if (!file || !(file instanceof TFile)) return false;
			try { return this.historyIsStoreFile(await vault.cachedRead(file)); }
			catch (_) { return false; }
		};

		// 1. The one we were using, if it is still there and still ours.
		if (this._historyPath) {
			const f = vault.getAbstractFileByPath(this._historyPath);
			if (await check(f)) return f;
		}
		// 2. Where the setting says it should be.
		const want = this.historyDefaultPath();
		const at = vault.getAbstractFileByPath(want);
		if (await check(at)) return at;

		// 3. Anything with the same FILENAME elsewhere in the vault. This is
		//    the move-it-to-a-folder case, and it is the common one, so it is
		//    tried before reading the whole vault.
		const base = want.split('/').pop().toLowerCase();
		const all  = vault.getMarkdownFiles();
		const named = all.filter(f => f.path.toLowerCase().endsWith('/' + base)
			|| f.path.toLowerCase() === base);
		for (const f of named) if (await check(f)) return f;

		// 4. Renamed as well as moved. Read everything, smallest first — the
		//    store is a table of short rows, so a 2MB note is not it.
		const rest = all.filter(f => named.indexOf(f) === -1)
			.filter(f => !f.stat || f.stat.size < 4000000)
			.sort((a, b) => (a.stat ? a.stat.size : 0) - (b.stat ? b.stat.size : 0));
		for (const f of rest) if (await check(f)) return f;
		return null;
	}

	// ── Loading ─────────────────────────────────────────────────────────────

	async historyLoad() {
		if (this._historyLoading) return this._historyLoading;
		this._historyLoading = (async () => {
			let file = null;
			try { file = await this.historyFindFile(); } catch (_) {}
			let parsed = { started: null, days: {} };
			if (file) {
				this._historyPath = file.path;
				try { parsed = this.historyParse(await this.app.vault.read(file)); } catch (_) {}
			}

			const h = { started: parsed.started, days: parsed.days,
				paths: parsed.paths || {},
				today: { date: this.historyDateKey(), a: 0, r: 0, n: 0, by: {} } };
			// Today may already be in the table from earlier in the day, so it
			// is lifted back out and carries on rather than restarting at zero
			// because Obsidian was restarted at lunchtime.
			const t = h.days[h.today.date];
			if (t) {
				h.today.a = t.a; h.today.r = t.r; h.today.n = t.n;
				delete h.days[h.today.date];
			}
			if (h.paths[h.today.date]) {
				h.today.by = h.paths[h.today.date];
				delete h.paths[h.today.date];
			}
			this._history = h;
			this.historyEnsure();

			// One-time migration off data.json. 1.28 and earlier kept the
			// record there; those days are real and must not be dropped on the
			// floor by an upgrade.
			const legacy = this.settings.historyData;
			if (legacy && legacy.days && Object.keys(legacy.days).length) {
				let moved = 0;
				for (const k of Object.keys(legacy.days)) {
					if (h.days[k] || k === h.today.date) continue;
					h.days[k] = legacy.days[k];
					moved++;
				}
				if (legacy.started && (!h.started || legacy.started < h.started)) h.started = legacy.started;
				if (legacy.fileCounts && !Object.keys(this.historyBaselines()).length) {
					this.settings.historyBaselines = legacy.fileCounts;
				}
				delete this.settings.historyData;
				await this.saveSettings();
				if (moved) {
					await this.historyWrite(true);
					new Notice('Word-Smith: moved ' + moved + ' day'
						+ (moved === 1 ? '' : 's') + ' of writing history into '
						+ (this._historyPath || this.historyDefaultPath()) + '.');
				}
			}

			const keys = Object.keys(h.days).sort();
			if (keys.length && (!h.started || keys[0] < h.started)) h.started = keys[0];
			this._historyReady = true;
			return h;
		})();
		try { return await this._historyLoading; }
		finally { this._historyLoading = null; }
	}

	// ── Capture ─────────────────────────────────────────────────────────────

	historyNoteChange(file) {
		if (!this.settings.historyTracking) return;
		if (!file || !file.path || !/\.md$/i.test(file.path)) return;
		// Before the scope check, and unconditional: writing the store fires
		// modify ON the store, and without this the history would record
		// itself recording, forever.
		if (file.path === this._historyPath) return;
		if (!this.isFileCounted(file)) return;
		if (!this._historyTimers) this._historyTimers = new Map();
		const prev = this._historyTimers.get(file.path);
		if (prev) window.clearTimeout(prev);
		this._historyTimers.set(file.path, window.setTimeout(() => {
			this._historyTimers.delete(file.path);
			this.historyCapture(file.path);
		}, HISTORY_DEBOUNCE_MS));
	}

	async historyCapture(path) {
		try {
			if (!this.settings.historyTracking) return;
			// Nothing is recorded before the store has been read. Recording
			// first would build an empty record and then have the load
			// overwrite it — losing whatever was typed in the meantime.
			if (!this._historyReady) await this.historyLoad();
			const file = this.app.vault.getAbstractFileByPath(path);
			if (!file || !(file instanceof TFile)) return;
			if (path === this._historyPath) return;
			if (!this.isFileCounted(file)) return;
			// countWords → countProse, the single counting authority. The
			// history must never be able to disagree with the status bar.
			let count;
			const hit = this.wordCountCache && this.wordCountCache.get(path);
			if (hit && hit.mtime === file.stat.mtime) {
				count = hit.count;
			} else {
				const text = await this.app.vault.cachedRead(file);
				count = this.countWords(text);
				if (this.wordCountCache) this.wordCountCache.set(path, { mtime: file.stat.mtime, count });
			}
			this.historyRecord(path, count);
		} catch (_) { /* a note deleted mid-debounce; nothing to record */ }
	}

	historyRecord(path, count) {
		const h    = this.historyEnsure();
		const base = this.historyBaselines();
		const key  = this.historyDateKey();
		const rolled = this.historyCompact(h, key);
		const had  = Object.prototype.hasOwnProperty.call(base, path);
		const prev = had ? base[path] : 0;
		base[path] = count;

		// A file with no baseline records NOTHING — it only establishes one.
		// This is what stops a fresh sync dump, or the first open of a
		// five-year-old note, from arriving as today's heroic word count.
		if (!had) { this.historyQueueSave(rolled); return; }

		const delta = count - prev;
		if (delta === 0) { if (rolled) this.historyQueueSave(true); return; }

		const t = h.today;
		if (delta > 0) t.a += delta; else t.r += -delta;
		t.n += delta;
		// The per-note breakdown, which is what the search box searches. Kept
		// beside the totals rather than replacing them: the totals are what a
		// person reads in the file, and deriving them from this every time
		// would make the readable half of the store a computation.
		if (this.settings.historyPerFile !== false) {
			const b = t.by[path] || (t.by[path] = { a: 0, r: 0, n: 0 });
			if (delta > 0) b.a += delta; else b.r += -delta;
			b.n += delta;
		}
		if (!h.started) h.started = key;
		this.historyQueueSave(rolled);
	}

	// The store is a note in the vault, so it is written at a human cadence,
	// not once per keystroke pause. The baseline cache rides along on the same
	// debounce through saveData — never saveSettings, which would run the full
	// refresh() and rebuild the mask while somebody is typing.
	// Written when you STOP, not on a clock. A fixed interval either writes in
	// the middle of a sentence or leaves the record stale for its whole length;
	// the moment that is actually free is the pause between paragraphs, and
	// that is a timer which RESETS on every change rather than one that runs
	// down regardless. The ceiling is the safety net: if the pauses never come
	// — a long dictated burst, a paste-heavy session — the file is written
	// anyway rather than holding an hour of work in memory.
	historyQueueSave(immediate) {
		if (immediate) { this.historyFlush(true); return; }
		if (!this._historyDirtyAt) this._historyDirtyAt = Date.now();
		if (Date.now() - this._historyDirtyAt >= HISTORY_MAX_UNSAVED_MS) {
			this.historyFlush(true);
			return;
		}
		if (this._historySaveTimer) window.clearTimeout(this._historySaveTimer);
		this._historySaveTimer = window.setTimeout(() => {
			this._historySaveTimer = null;
			this.historyFlush(true);
		}, HISTORY_IDLE_MS);
	}

	async historyFlush(force) {
		if (this._historySaveTimer) {
			window.clearTimeout(this._historySaveTimer);
			this._historySaveTimer = null;
		}
		this._historyDirtyAt = 0;
		try { await this.saveData(this.settings); } catch (_) {}
		return await this.historyWrite(force);
	}

	historyRenamePath(oldPath, newPath) {
		// The store moving is the whole point of the feature: follow it.
		if (this._historyPath && oldPath === this._historyPath) {
			this._historyPath = newPath;
			this.settings.historyFilePath = newPath;
			this.saveSettings();
			return;
		}
		// The RECORD first, and unconditionally.
		//
		// This used to move the baseline cache and nothing else, and returned
		// early when there was no baseline to move — so a note renamed in a
		// session where it had not been edited skipped everything. With the
		// per-note breakdown added in 1.41 that meant the history kept the old
		// path forever: the finder offered a note that no longer existed, the
		// renamed one looked like it had never been written in, and a folder
		// scope silently missed every file that had ever been moved into it.
		//
		// Folders fire this event too, so it walks PREFIXES rather than
		// looking for an exact key — a folder rename has to carry every note
		// beneath it. Whole segments only, so renaming "Book" does not drag
		// "Bookmarks" along. Same rule, same reason, as renameGoalPaths.
		let moved = this.historyRenameRecord(oldPath, newPath);

		const base = this.historyBaselines();
		for (const key of Object.keys(base)) {
			const next = this.historyMovedPath(key, oldPath, newPath);
			if (next === null) continue;
			// The destination wins if something is already there: it is the
			// more recent measurement of whatever now lives at that path.
			if (!Object.prototype.hasOwnProperty.call(base, next)) base[next] = base[key];
			delete base[key];
			moved = true;
		}
		if (moved) this.historyQueueSave();
	}

	// The new path for a key when `from` moves to `to`, or null if untouched.
	// Whole path segments only: "Book" moving is not "Bookmarks" moving.
	historyMovedPath(key, from, to) {
		if (key === from) return to;
		if (key.indexOf(from + '/') === 0) return to + key.slice(from.length);
		return null;
	}

	historyRenameRecord(oldPath, newPath) {
		const h = this.historyEnsure();
		let changed = false;
		const rewrite = (by) => {
			if (!by) return;
			for (const key of Object.keys(by)) {
				const next = this.historyMovedPath(key, oldPath, newPath);
				if (next === null || next === key) continue;
				const there = by[next];
				if (there) {
					// A note moved onto a path that already has history for
					// that day: both lots of words were really written, so
					// they are summed rather than one being dropped.
					there.a += by[key].a || 0;
					there.r += by[key].r || 0;
					there.n = there.a - there.r;
				} else {
					by[next] = by[key];
				}
				delete by[key];
				changed = true;
			}
		};
		for (const date of Object.keys(h.paths)) rewrite(h.paths[date]);
		if (h.today) rewrite(h.today.by);
		return changed;
	}

	// A delete records NOTHING. Removing a 5,000-word file is housekeeping,
	// not "deleted 5,000 words today".
	//
	// It also leaves the note's PAST in the record, deliberately. Those words
	// were written; deleting the file does not unwrite them, and a total that
	// shrinks when you tidy up is a total nobody can trust. The finder will go
	// on offering the name, which is the right answer for anyone asking how
	// much went into a draft they have since cut.
	historyForgetPath(path) {
		if (this._historyPath && path === this._historyPath) { this._historyPath = null; return; }
		const base = this.historyBaselines();
		if (!Object.prototype.hasOwnProperty.call(base, path)) return;
		delete base[path];
		this.historyQueueSave();
	}

	// ── Reading ─────────────────────────────────────────────────────────────

	// Everything, or only what happened under one note or folder.
	//
	// A scope of '' is the whole vault and returns the stored totals directly.
	// A scope with a path in it rebuilds each day from the per-note breakdown,
	// so a day where you wrote 900 words across three notes contributes only
	// the part that happened inside the scope. Days recorded before the
	// breakdown existed have none, and are absent from a scoped view rather
	// than being counted in full — which is the honest answer, and is said in
	// words on screen rather than left for the reader to notice.
	historyDays(scope) {
		const h   = this.historyEnsure();
		const t   = h.today;
		if (!scope) {
			const out = Object.assign({}, h.days);
			if (t && (t.a || t.r)) out[t.date] = { a: t.a, r: t.r, n: t.n };
			return out;
		}
		const under = this.historyPathUnder(scope);
		const out = {};
		const add = (date, by) => {
			let a = 0, r = 0;
			for (const p of Object.keys(by)) {
				if (!under(p)) continue;
				a += by[p].a || 0;
				r += by[p].r || 0;
			}
			if (a || r) out[date] = { a, r, n: a - r };
		};
		for (const date of Object.keys(h.paths)) add(date, h.paths[date]);
		if (t && t.by && Object.keys(t.by).length) add(t.date, t.by);
		return out;
	}

	// Whole path segments only, so scoping to "Book" does not sweep in
	// "Bookmarks" — the same rule the goal renames use, and for the same
	// reason. A scope that is a note matches only that note.
	historyPathUnder(scope) {
		const base = String(scope || '').replace(/\/+$/, '');
		if (!base) return () => true;
		const prefix = base + '/';
		return (p) => p === base || p.indexOf(prefix) === 0;
	}

	// Every note and every folder the record has ever seen, for the finder.
	historyKnownPaths() {
		const h = this.historyEnsure();
		const files = new Set();
		const seen = (by) => { for (const p of Object.keys(by || {})) files.add(p); };
		for (const d of Object.keys(h.paths)) seen(h.paths[d]);
		if (h.today) seen(h.today.by);
		const folders = new Set();
		for (const p of files) {
			let cut = p.lastIndexOf('/');
			while (cut > 0) {
				folders.add(p.slice(0, cut));
				cut = p.lastIndexOf('/', cut - 1);
			}
		}
		return {
			files: Array.from(files).sort(),
			folders: Array.from(folders).sort()
		};
	}

	historyValue(rec, mode) {
		if (!rec) return 0;
		return mode === 'gross' ? (rec.a || 0) : (rec.n || 0);
	}

	// An ACTIVE day is one with any activity at all (a + r > 0), not one with
	// a positive net. A day spent cutting 2,000 words is a day you showed up,
	// and a streak that breaks on your hardest editing day is a metric that
	// punishes the work it claims to measure.
	historyIsActive(rec) {
		return !!rec && ((rec.a || 0) + (rec.r || 0)) > 0;
	}

	historyShiftKey(key, deltaDays) {
		const parts = String(key).split('-');
		const d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
		d.setDate(d.getDate() + deltaDays);
		return this.historyDateKey(d);
	}

	historyFigures(mode, scope) {
		const days = this.historyDays(scope);
		const keys = Object.keys(days).sort();
		let total = 0, best = 0, bestKey = '', active = 0;
		for (const k of keys) {
			const v = this.historyValue(days[k], mode);
			total += v;
			if (v > best) { best = v; bestKey = k; }
			if (this.historyIsActive(days[k])) active++;
		}
		let longest = 0, run = 0, prevKey = null;
		for (const k of keys) {
			if (!this.historyIsActive(days[k])) { run = 0; prevKey = k; continue; }
			run = (prevKey && this.historyShiftKey(prevKey, 1) === k && run > 0) ? run + 1 : 1;
			if (run > longest) longest = run;
			prevKey = k;
		}
		// The current streak walks back from today — but starts at yesterday
		// when today is still empty, because at nine in the morning a streak
		// has not been broken, it has not been continued yet.
		let cursor = this.historyDateKey();
		if (!this.historyIsActive(days[cursor])) cursor = this.historyShiftKey(cursor, -1);
		let current = 0;
		while (this.historyIsActive(days[cursor])) { current++; cursor = this.historyShiftKey(cursor, -1); }
		return {
			total, best, bestKey, active, longest, current,
			// Averaged over days you WROTE, not over calendar days. Dividing by
			// the calendar punishes anyone who takes days off — and note that
			// no weekday is special here either: an active day is any day with
			// activity on it, so Saturday counts exactly as Tuesday does and a
			// skipped Tuesday is excluded exactly as a skipped Sunday is. The
			// chart makes the same promise by refusing to shade weekends; this
			// is the arithmetic half of it.
			average: active ? Math.round(total / active) : 0,
			days, keys
		};
	}

	// The RANGE, not the years that happen to hold data: a writer who stopped
	// for all of 2025 has a 2025, and a stepper that jumps from 2024 to 2026
	// hides the fallow year instead of showing it.
	historyYears(scope) {
		const days = this.historyDays(scope);
		const set  = new Set();
		for (const k of Object.keys(days)) set.add(+k.slice(0, 4));
		set.add(new Date().getFullYear());
		const years = Array.from(set);
		const lo = Math.min.apply(null, years), hi = Math.max.apply(null, years);
		const out = [];
		for (let y = lo; y <= hi; y++) out.push(y);
		return out;
	}

	// ── The file format ─────────────────────────────────────────────────────

	historyBody() {
		const days = this.historyDays();
		const keys = Object.keys(days).sort().reverse();
		const byYear = new Map();
		for (const k of keys) {
			const y = k.slice(0, 4);
			if (!byYear.has(y)) byYear.set(y, []);
			byYear.get(y).push(k);
		}
		const out = [];
		out.push('This file IS your writing history \u2014 Word-Smith reads it back from here,');
		out.push('so keep it if you keep anything. Move it or rename it freely; the plugin');
		out.push('finds it by the markers below, anywhere in the vault. Counts only, never');
		out.push('your text. Everything between the markers is rewritten; write what you');
		out.push('like outside them.');
		out.push('');
		for (const [year, ks] of byYear) {
			let a = 0, r = 0;
			for (const k of ks) { a += days[k].a || 0; r += days[k].r || 0; }
			out.push('### ' + year + ' \u2014 ' + ks.length + ' day' + (ks.length === 1 ? '' : 's') + ', '
				+ (a - r > 0 ? '+' : '') + (a - r).toLocaleString('en-GB') + ' net');
			out.push('');
			out.push('| Date | Added | Deleted | Net |');
			out.push('| --- | ---: | ---: | ---: |');
			for (const k of ks) {
				const d = days[k];
				out.push('| ' + k + ' | ' + (d.a || 0) + ' | ' + (d.r || 0)
					+ ' | ' + (d.n || 0) + ' |');
			}
			out.push('');
		}

		// The per-note breakdown, under its own heading and after the totals,
		// because the totals are the half a person reads. This is the half the
		// search box reads, and it is the reason the file grows with the number
		// of notes you touch rather than only with the days you write.
		const by = this.historyPathRows();
		if (by.length) {
			out.push('### By note');
			out.push('');
			out.push('| Date | Note | Added | Deleted | Net |');
			out.push('| --- | --- | ---: | ---: | ---: |');
			for (const row of by) {
				// A pipe in a filename would end the cell early. Rare, legal,
				// and silent when it goes wrong.
				out.push('| ' + row.date + ' | ' + row.path.replace(/\|/g, '\\|')
					+ ' | ' + row.a + ' | ' + row.r + ' | ' + row.n + ' |');
			}
			out.push('');
		}
		return out.join('\n');
	}

	historyPathRows() {
		const h = this.historyEnsure();
		const out = [];
		const push = (date, by) => {
			for (const p of Object.keys(by).sort()) {
				const v = by[p];
				if (!v || (!v.a && !v.r)) continue;
				out.push({ date, path: p, a: v.a || 0, r: v.r || 0, n: v.n || 0 });
			}
		};
		const dates = Object.keys(h.paths).sort().reverse();
		for (const d of dates) push(d, h.paths[d]);
		if (h.today && h.today.by && Object.keys(h.today.by).length) {
			const today = [];
			push(h.today.date, h.today.by);
			// Today belongs at the top with the newest dates.
			for (let i = out.length - 1; i >= 0 && out[i].date === h.today.date; i--) {
				today.unshift(out.pop());
			}
			return today.concat(out);
		}
		return out;
	}

	historyCompose(existing) {
		const block = HISTORY_MARK_START + '\n' + this.historyBody() + '\n' + HISTORY_MARK_END;
		const text  = String(existing || '');
		const i = text.indexOf(HISTORY_MARK_START);
		const j = text.indexOf(HISTORY_MARK_END);
		if (i !== -1 && j !== -1 && j > i) {
			return text.slice(0, i) + block + text.slice(j + HISTORY_MARK_END.length);
		}
		if (!text.trim()) return block + '\n';
		return text.replace(/\s*$/, '') + '\n\n' + block + '\n';
	}

	// Tolerant on purpose: a file half-merged by sync, or hand-edited, should
	// give back every row that is still legible rather than nothing at all.
	historyParse(text) {
		const src  = String(text || '');
		const i    = src.indexOf(HISTORY_MARK_START);
		const j    = src.indexOf(HISTORY_MARK_END);
		const body = (i !== -1 && j > i) ? src.slice(i + HISTORY_MARK_START.length, j) : src;
		const days = {};
		// Three numbers now; files-touched and active-minutes were dropped in
		// 1.29 because nothing displayed them and they were two columns of
		// arithmetic in somebody's note. Files written by 1.26–1.28 carry five,
		// so the two extra are matched and thrown away rather than making the
		// whole row unreadable.
		const ROW = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|/;
		// The by-note row: a date, a path, then three numbers anchored at the
		// end of the line, which is what keeps a path containing a pipe from
		// swallowing a column.
		const PATH_ROW = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|$/;
		const paths = {};
		for (const line of body.split('\n')) {
			const t = line.trim();
			const pm = PATH_ROW.exec(t);
			if (pm) {
				const date = pm[1];
				const p = pm[2].replace(/\\\|/g, '|');
				(paths[date] || (paths[date] = {}))[p] = { a: +pm[3], r: +pm[4], n: +pm[5] };
				continue;
			}
			const m = ROW.exec(t);
			if (!m) continue;
			days[m[1]] = { a: +m[2], r: +m[3], n: +m[4] };
		}
		const keys = Object.keys(days).sort();
		return { started: keys.length ? keys[0] : null, days, paths };
	}

	// ── Writing ─────────────────────────────────────────────────────────────

	async historyWrite(force) {
		if (!this.settings.historyTracking) return false;
		if (!this._historyReady) return false;
		if (this._historyWriting) return false;
		this._historyWriting = true;
		try {
			let file = this.app.vault.getAbstractFileByPath(this._historyPath || '');
			if (!file || !(file instanceof TFile)) file = await this.historyFindFile();
			if (file) {
				this._historyPath = file.path;
				const text = await this.app.vault.read(file);
				const next = this.historyCompose(text);
				if (next !== text) await this.app.vault.modify(file, next);
				return true;
			}
			// Nowhere to write yet: make it where the setting says.
			const path  = this.historyDefaultPath();
			const slash = path.lastIndexOf('/');
			if (slash > 0) {
				const dir = path.slice(0, slash);
				if (!this.app.vault.getAbstractFileByPath(dir)) {
					try { await this.app.vault.createFolder(dir); } catch (_) {}
				}
			}
			const made = await this.app.vault.create(path, this.historyCompose(''));
			this._historyPath = made ? made.path : path;
			return true;
		} catch (e) {
			// Losing this write means losing the record, so it is said out
			// loud rather than swallowed the way a cache write would be.
			new Notice('Word-Smith: could not write the writing history \u2014 '
				+ (e && e.message ? e.message : String(e)));
			return false;
		} finally {
			this._historyWriting = false;
		}
	}

	async historyClear() {
		this._history = null;
		this.settings.historyBaselines = {};
		this.historyEnsure();
		// force, or the write cadence can swallow the erase and the next
		// launch reads the old days straight back out of the file.
		await this.historyFlush(true);
	}

	// Notices the store, wherever it turns up. Called from the vault's modify
	// and create events, so moving the file on another device, restoring it
	// from a backup, or hand-editing a row all reach the plugin without the
	// user having to tell it anything.
	//
	// The guard that makes this safe is `_historyWriting`: our own write fires
	// modify on our own file, and re-reading in the middle of writing would
	// race the write and could hand back a half-saved table.
	async historyAdopt(file) {
		try {
			if (!this.settings.historyTracking || this._historyWriting) return;
			if (!file || !file.path || !/\.md$/i.test(file.path)) return;
			if (!(file instanceof TFile)) return;
			// Something we have unsaved beats something on disk: an external
			// edit is adopted only when there is nothing of our own to lose.
			if (this._historyDirtyAt) return;
			const text = await this.app.vault.cachedRead(file);
			if (!this.historyIsStoreFile(text)) return;
			// A second file carrying the markers is a copy, a conflicted sync
			// duplicate or a backup. Ours stays ours.
			if (this._historyPath && this._historyPath !== file.path) return;
			const parsed = this.historyParse(text);
			const h = this.historyEnsure();
			let gained = 0;
			for (const k of Object.keys(parsed.days)) {
				if (k === h.today.date) continue;
				if (h.days[k]) continue;
				h.days[k] = parsed.days[k];
				// The per-note rows for that day come with it. Merging the
				// totals and dropping these left a day that existed in the
				// chart and in no scoped view — present in the whole vault,
				// absent from every folder and note inside it.
				if (parsed.paths && parsed.paths[k]) h.paths[k] = parsed.paths[k];
				gained++;
			}
			this._historyPath = file.path;
			if (!this._historyReady) this._historyReady = true;
			if (gained) {
				const keys = Object.keys(h.days).sort();
				if (keys.length && (!h.started || keys[0] < h.started)) h.started = keys[0];
			}
		} catch (_) { /* unreadable right now; the next event will try again */ }
	}



	// ════════════════════════════════════════════════════════════════════════
	// History tab — the drawing
	// ════════════════════════════════════════════════════════════════════════
	//
	// Three zoom levels answering three different questions. The year grid
	// answers "am I showing up", and streaks appear in it as unbroken runs
	// without anything having to compute them. The month answers "what is my
	// rhythm". The year curve answers "will I finish", which is why it is a
	// cumulative line against a projection and not twelve bars: twelve bars
	// are a scoreboard, the curve is a forecast.
	//
	// Everything is drawn by hand — rects, paths and block glyphs — in the
	// same no-library idiom as the goal gauges, so both Obsidian themes are
	// carried by var() rather than by a palette this file invents.

	// Plain DOM rather than createDiv/createEl throughout, for the reason
	// celebrate() gives: one throw inside a renderer kills the whole view
	// silently, and createElement cannot be broken by a class string.
	historyEl(tag, cls, parent, text) {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		if (parent) parent.appendChild(e);
		return e;
	}

	historySvg(tag, attrs, parent) {
		const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
		if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
		if (parent) parent.appendChild(e);
		return e;
	}

	// ── Buckets ─────────────────────────────────────────────────────────────
	//
	// One function feeds all three tabs. Day, Month and Year are the SAME
	// chart over a different bucket size, which is the whole reason the view
	// reads as one idea rather than three: the bars mean the same thing at
	// every zoom, and only the width of a bar changes.

	historyBuckets(view, year, month, scope) {
		const days = this.historyDays(scope);
		const goal = this.settings.historyDailyGoal || 0;
		const out  = { view, buckets: [], label: '', goal: 0 };
		const rightNow = new Date();
		const nowY = rightNow.getFullYear(), nowM = rightNow.getMonth();
		const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
		const yearLen = (y) => (((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365);

		const blank = (key, label) => ({ key, label, a: 0, r: 0, n: 0, days: 0 });
		const add = (b, rec) => {
			if (!rec) return;
			b.a += rec.a || 0; b.r += rec.r || 0; b.n += rec.n || 0;
			if ((rec.a || 0) + (rec.r || 0) > 0) b.days++;
		};

		if (view === 'day') {
			const n = daysIn(year, month);
			out.label = HISTORY_MONTHS[month] + ' ' + year;
			out.goal  = goal;
			for (let d = 1; d <= n; d++) {
				const dt  = new Date(year, month, d);
				const key = this.historyDateKey(dt);
				const b = blank(key, String(d));
				b.title = HISTORY_DAYNAMES[dt.getDay()] + ' ' + d + ' '
					+ HISTORY_MONTHS[month].slice(0, 3) + ' ' + year;
				add(b, days[key]);
				out.buckets.push(b);
			}
		} else if (view === 'month') {
			out.label = String(year);
			for (let m = 0; m < 12; m++) {
				const b = blank(year + '-' + String(m + 1).padStart(2, '0'),
					HISTORY_MONTHS[m].slice(0, 1));
				b.title = HISTORY_MONTHS[m] + ' ' + year;
				b.isNow = (year === nowY && m === nowM);
				// The goal scales with the bucket, or a 750-a-day line drawn
				// across a month of totals is a line at nothing.
				b.goal = goal * daysIn(year, m);
				for (let d = 1; d <= daysIn(year, m); d++) {
					add(b, days[this.historyDateKey(new Date(year, m, d))]);
				}
				out.buckets.push(b);
			}
			out.goal = goal * 30;   // the dashed line is a typical month
		} else {
			// The scope this pass was CALLED with, not a window's state:
			// historyBuckets is a pure reader and knows nothing about the
			// modal. Reaching for `state` here threw the moment the Year tab
			// was drawn, which the render probe caught on its first run.
			const years = this.historyYears(scope);
			out.label = years.length > 1 ? years[0] + '\u2013' + years[years.length - 1] : String(years[0]);
			for (const y of years) {
				const b = blank(String(y), String(y));
				b.title = String(y);
				b.isNow = (y === nowY);
				b.goal  = goal * yearLen(y);
				for (const k of Object.keys(days)) if (+k.slice(0, 4) === y) add(b, days[k]);
				out.buckets.push(b);
			}
			out.goal = goal * 365;
		}

		const now = new Date();
		for (const b of out.buckets) {
			if (!b.title) b.title = b.key;
			// The native tooltip stays for accessibility and for touch, and
			// the readout carries the same numbers on one line for the eye.
			const tail = (b.a || 0).toLocaleString() + ' added \u00b7 '
				+ (b.r || 0).toLocaleString() + ' deleted \u00b7 '
				+ (b.n >= 0 ? '+' : '') + (b.n || 0).toLocaleString() + ' net'
				+ (view === 'day' ? '' : ' \u00b7 ' + b.days + ' day' + (b.days === 1 ? '' : 's') + ' written');
			b.readout = b.title + ' \u00b7 ' + ((b.a || b.r) ? tail : 'nothing written');
			b.tip = b.title + '\n' + tail.replace(/ \u00b7 /g, '\n');
		}
		return out;
	}

	// ── The tab ─────────────────────────────────────────────────────────────

	// Subsequence matching, ranked. Not a substring search: a writer who
	// types "ch3scene" should find "My Book/Part One/Ch 03/Scene 2.md", and a
	// substring match finds nothing there at all.
	//
	// The score rewards the two things that separate a match you meant from a
	// match that merely contains the right letters, in this order: how much of
	// the query landed in one unbroken run, and how close to the START of a
	// path segment it began. That is why typing "scene" ranks the scene files
	// above a folder that happens to contain those letters mid-word.
	historyFuzzy(query, candidates) {
		const q = String(query || '').toLowerCase().replace(/\s+/g, '');
		if (!q) return [];
		const out = [];
		for (const path of candidates) {
			const lower = path.toLowerCase();
			let qi = 0, score = 0, run = 0, last = -2;
			for (let i = 0; i < lower.length && qi < q.length; i++) {
				if (lower[i] !== q[qi]) continue;
				run = (i === last + 1) ? run + 1 : 0;
				// A character right after a separator, or at the very start,
				// is the beginning of a word a person was aiming at.
				const boundary = i === 0 || lower[i - 1] === '/' || lower[i - 1] === ' '
					|| lower[i - 1] === '-' || lower[i - 1] === '_';
				score += 1 + run * 3 + (boundary ? 6 : 0);
				last = i;
				qi++;
			}
			if (qi < q.length) continue;
			// Did the match END on a word boundary as well as start on one?
			// This is what separates "Scene 2.md" from "old-scenery-notes.md"
			// when the query is "scene": both contain the letters contiguously
			// after a boundary, so without this the shorter path wins on the
			// length penalty alone and the writer's actual scene files rank
			// below an archived note. A query that consumes a whole word was
			// almost certainly aimed at that word.
			const after = lower[last + 1];
			if (after === undefined || after === '/' || after === ' '
				|| after === '-' || after === '_' || after === '.') score += 8;
			// A shorter path that matched is a tighter match than a long one
			// that happened to have the letters spread through it.
			score -= lower.length * 0.05;
			out.push({ path, score });
		}
		out.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
		return out;
	}

	// Folders first when they score alike: picking a folder is the broader
	// question, and it is the one a writer usually wants from a short query.
	historyFinderMatches(query, limit) {
		const known = this.historyKnownPaths();
		const tag = (list, kind) => this.historyFuzzy(query, list)
			.map(m => ({ path: m.path, score: m.score + (kind === 'folder' ? 1.5 : 0), kind }));
		const all = tag(known.folders, 'folder').concat(tag(known.files, 'file'));
		all.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
		return all.slice(0, limit || 8);
	}

	// ── The modal ───────────────────────────────────────────────────────────
	//
	// Its own window rather than a third tab in the report. Three reasons, and
	// the first is the one that decided it: the report is 460px because eight
	// figures and a gauge is all it has to say about one file, and a month of
	// day bars needs three times that to be readable at all. The second is
	// that the report is about the text in front of you and asks for a file;
	// the history is about a span of months and asks for nothing. The third is
	// that the zoom tabs and the report's own tabs were two rows of tabs
	// stacked on each other, which reads as one confused control.

	// This month if you have written in it, otherwise the most recent month
	// you did. Opening on a blank current month — the 1st, or after a fallow
	// spell — puts an empty chart in front of someone whose record is full,
	// and an empty chart reads as a broken feature rather than as a quiet
	// week. The period label always says which month is on screen, so this
	// cannot mislead anyone about what they are looking at.
	historyOpeningPeriod(scope) {
		const now = new Date();
		const state = { year: now.getFullYear(), month: now.getMonth() };
		const days = this.historyDays(scope);
		const keys = Object.keys(days).sort();
		if (!keys.length) return state;
		const here = state.year + '-' + String(state.month + 1).padStart(2, '0');
		if (keys.some(k => k.slice(0, 7) === here)) return state;
		const last = keys[keys.length - 1];
		return { year: +last.slice(0, 4), month: +last.slice(5, 7) - 1 };
	}

	openHistoryModal() {
		if (!Modal) return;
		const plugin = this;
		const modal  = new Modal(this.app);
		modal.titleEl.setText('Writing History');
		modal.modalEl.addClass('zg-history-modal');

		const body = modal.contentEl.createDiv({ cls: 'zg-report-body' });

		// Which period is on screen belongs to this window and is forgotten
		// when it closes; which ZOOM is on screen lives in settings and is
		// not. Opening the history should show you the view you use, at the
		// month you are in.
		const state = this.historyOpeningPeriod();
		state.scope = '';
		state.query = '';

		const render = () => {
			try {
				body.empty();
				// Opened before the store has been read — from the command
				// palette during startup, or with tracking just switched on.
				// Draw the wait, then draw the history, rather than drawing a
				// blank record and correcting it a moment later.
				if (plugin.settings.historyTracking && !plugin._historyReady) {
					body.createDiv({ cls: 'zg-report-loading', text: 'Reading\u2026' });
					plugin.historyLoad().then(() => {
						Object.assign(state, plugin.historyOpeningPeriod());
						render();
					});
					return;
				}
				plugin.renderHistoryTab(body, state, render);
			} catch (e) {
				// A renderer swallows its own exceptions and leaves the modal
				// sitting on nothing. Same guard, same reason, as the report.
				body.empty();
				body.createDiv({ text: 'History failed \u2014 '
					+ (e && e.message ? e.message : String(e)) });
			}
		};
		render();
		modal.open();
	}

	renderHistoryTab(body, state, rerender) {
		const s = this.settings;
		state.rerender = rerender;
		// The window seeds these, but the renderer is reachable from anywhere
		// and must not throw on a state that predates them. Same repair-in-
		// place idiom as historySeriesOn().
		if (typeof state.scope !== 'string') state.scope = '';
		if (typeof state.query !== 'string') state.query = '';

		if (!s.historyTracking) {
			const off = this.historyEl('div', 'zg-report-ring-label is-muted', body);
			this.historyEl('div', '', off, 'You\u2019re not tracking your writing yet.');
			this.historyEl('div', 'zg-report-hint', off,
				'Switch it on under Settings \u2192 Word-Smith \u2192 History and it\u2019ll start '
				+ 'counting how much you write each day. Counts only \u2014 never your words.');
			return;
		}

		const h    = this.historyEnsure();
		const figs = this.historyFigures('net', state.scope);

		// The view and the series live in settings, not in the modal's state:
		// closing the report and opening it again should show you the thing
		// you were looking at, not the thing the code prefers.
		const view = ['day', 'month', 'year'].indexOf(s.historyView) !== -1 ? s.historyView : 'day';
		const ser  = this.historySeriesOn();

		const years = this.historyYears(state.scope);
		if (years.indexOf(state.year) === -1) state.year = years[years.length - 1];

		this.historyEl('div', 'zg-report-scope', body, h.started
			? 'Counting since ' + h.started
			: 'Starts counting the next time you write');
		this.historyEl('hr', 'zg-report-rule', body);

		// ── Figures ─────────────────────────────────────────────────────────
		// ── The finder ──────────────────────────────────────────────────────
		// Above the figures, because it changes what every one of them says.
		const find = this.historyEl('div', 'zg-hist-find', body);
		const row  = this.historyEl('div', 'zg-hist-findrow', find);

		if (state.scope) {
			const chip = this.historyEl('div', 'zg-hist-chip', row);
			this.historyEl('span', 'zg-hist-chipname', chip, state.scope);
			const clear = this.historyEl('button', 'zg-hist-chipx', chip, '\u00d7');
			clear.setAttribute('aria-label', 'Show the whole vault again');
			clear.addEventListener('click', () => {
				state.scope = ''; state.query = '';
				Object.assign(state, this.historyOpeningPeriod());
				rerender();
			});
		} else {
			const input = this.historyEl('input', 'zg-hist-search', row);
			input.setAttribute('type', 'text');
			input.setAttribute('placeholder', 'Search a note or folder\u2026');
			input.value = state.query || '';
			const list = this.historyEl('div', 'zg-hist-hits', find);

			const paint = () => {
				list.textContent = '';
				const q = state.query.trim();
				if (!q) return;
				const hits = this.historyFinderMatches(q, 8);
				if (!hits.length) {
					this.historyEl('div', 'zg-hist-nohit', list, 'Nothing by that name.');
					return;
				}
				for (const hit of hits) {
					const b = this.historyEl('button', 'zg-hist-hit-' + hit.kind + ' zg-hist-hitrow', list);
					this.historyEl('span', 'zg-hist-hitkind', b, hit.kind === 'folder' ? 'folder' : 'note');
					this.historyEl('span', 'zg-hist-hitpath', b, hit.path);
					b.addEventListener('click', () => {
						state.scope = hit.path;
						state.query = '';
						Object.assign(state, this.historyOpeningPeriod(hit.path));
						state.scope = hit.path;
						rerender();
					});
				}
			};

			input.addEventListener('input', () => { state.query = input.value; paint(); });
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Escape') { state.query = ''; input.value = ''; paint(); return; }
				if (e.key !== 'Enter') return;
				const hits = this.historyFinderMatches(state.query.trim(), 1);
				if (!hits.length) return;
				state.scope = hits[0].path;
				state.query = '';
				Object.assign(state, this.historyOpeningPeriod(hits[0].path));
				state.scope = hits[0].path;
				rerender();
			});
			paint();
		}

		// A record that started before the per-note detail did has days that
		// cannot be attributed to anything. Saying so is the difference
		// between an honest chart and one that looks like you stopped writing.
		if (state.scope) {
			const all = Object.keys(this.historyDays()).length;
			const attributed = Object.keys(this.historyDays(state.scope)).length;
			const h = this.historyEnsure();
			const detail = Object.keys(h.paths).length + (Object.keys(h.today.by).length ? 1 : 0);
			if (all > detail) {
				this.historyEl('div', 'zg-hist-partial', body,
					(all - detail) + ' earlier day' + (all - detail === 1 ? '' : 's')
					+ ' were recorded before Word-Smith started noting which note you were in, '
					+ 'so they cannot be shown per note. They are still in the whole-vault view.');
				void attributed;
			}
		}

		const grid = this.historyEl('div', 'zg-report-grid zg-history-grid', body);
		const cell = (label, value, tip) => {
			const c = this.historyEl('div', 'zg-report-cell has-tip', grid);
			c.setAttribute('title', tip);
			this.historyEl('div', 'zg-report-value', c, value);
			this.historyEl('div', 'zg-report-label', c, label);
		};
		cell('Words, net', (figs.total > 0 ? '+' : '') + figs.total.toLocaleString(),
			'Everything you\u2019ve written, minus what you cut \u2014 how much it actually grew.');
		cell('Daily average', figs.average.toLocaleString(),
			'Across the ' + figs.active + ' day' + (figs.active === 1 ? '' : 's') + ' you actually '
			+ 'wrote, not every day on the calendar \u2014 so days off don\u2019t drag it down, '
			+ 'whichever days those are.');
		cell('Best day', figs.best.toLocaleString(),
			figs.bestKey ? 'The most you\u2019ve ever gained in one day, back on ' + figs.bestKey + '.'
				: 'Nothing yet \u2014 this fills in after your first writing session.');
		cell('Streak', figs.current.toLocaleString() + (figs.current === 1 ? ' day' : ' days'),
			'Days in a row you wrote or edited. A day spent cutting still counts \u2014 you '
			+ 'turned up. And today won\u2019t break it until it\u2019s over. Your best run so far: '
			+ figs.longest.toLocaleString() + '.');

		if (!figs.keys.length) {
			const empty = this.historyEl('div', 'zg-report-ring-label is-muted zg-hist-empty', body);
			this.historyEl('div', '', empty, 'Nothing here yet.');
			this.historyEl('div', 'zg-report-hint', empty,
				'The chart fills in as you write. There\u2019s no way to go back and work out what '
				+ 'you did before today \u2014 a file only knows when it was touched, not how much '
				+ 'went into it.');
			return;
		}

		// ── Day | Month | Year ──────────────────────────────────────────────
		// UNDER the figures, not above them. The four numbers are the answer to
		// "how am I doing"; the zoom is how you interrogate that answer, and a
		// control placed above the thing it controls asks to be used first.
		const sub = this.historyEl('div', 'ws-tab-nav zg-hist-subnav', body);
		const tab = (id, label) => {
			const b = this.historyEl('button',
				'ws-tab-btn zg-hist-subbtn' + (view === id ? ' is-active' : ''), sub, label);
			b.addEventListener('click', () => {
				if (view === id) return;
				s.historyView = id;
				// Redraw FIRST, persist after. The user asked for the other
				// zoom; remembering the choice is bookkeeping, and awaiting a
				// disk write before repainting puts lag on every click for a
				// reason the click does not care about.
				rerender();
				this.saveSettings();
			});
		};
		tab('day', 'Day'); tab('month', 'Month'); tab('year', 'Year');

		// ── Period stepper ──────────────────────────────────────────────────
		const data = this.historyBuckets(view, state.year, state.month, state.scope);
		const head = this.historyEl('div', 'zg-hist-periodbar', body);
		this.historyEl('span', 'zg-hist-period', head, data.label);
		if (view !== 'year') {
			const nav  = this.historyEl('span', 'zg-hist-step', head);
			const back = this.historyEl('button', 'zg-hist-arrow', nav, '\u2039');
			const fwd  = this.historyEl('button', 'zg-hist-arrow', nav, '\u203a');
			// One stepper, two meanings: months inside a year on the Day tab,
			// years on the Month tab. Stepping off the end of a year rolls
			// into the next rather than stopping, because a manuscript does
			// not stop at 31 December.
			const shift = (dir) => {
				if (view === 'day') {
					let m = state.month + dir, y = state.year;
					if (m < 0)  { m = 11; y--; }
					if (m > 11) { m = 0;  y++; }
					if (years.indexOf(y) === -1) return;
					state.year = y; state.month = m;
				} else {
					const i = years.indexOf(state.year) + dir;
					if (i < 0 || i >= years.length) return;
					state.year = years[i];
				}
				rerender();
			};
			const atStart = view === 'day'
				? (state.year === years[0] && state.month === 0)
				: state.year === years[0];
			const atEnd = view === 'day'
				? (state.year === years[years.length - 1] && state.month === 11)
				: state.year === years[years.length - 1];
			if (atStart) back.setAttribute('disabled', 'true');
			if (atEnd)   fwd.setAttribute('disabled', 'true');
			back.addEventListener('click', () => shift(-1));
			fwd .addEventListener('click', () => shift(1));
		}

		// ── Series toggles ──────────────────────────────────────────────────
		const legend = this.historyEl('div', 'zg-hist-series', body);
		const pill = (id, label, tip) => {
			const b = this.historyEl('button',
				'zg-hist-pill is-' + id + (ser[id] ? ' is-on' : ''), legend);
			this.historyEl('span', 'zg-hist-swatch', b);
			this.historyEl('span', '', b, label);
			b.setAttribute('title', tip);
			b.addEventListener('click', () => {
				const next = Object.assign({}, ser);
				next[id] = !next[id];
				// Turning the last one off leaves an empty box that reads as a
				// broken chart, so the last one on cannot be turned off.
				if (!next.added && !next.removed && !next.net) return;
				s.historySeries = next;
				rerender();          // same reasoning as the zoom tabs above
				this.saveSettings();
			});
		};
		pill('added',   'Added',   'What you wrote, going up from the line.');
		pill('removed', 'Deleted', 'What you cut, going down from the same line \u2014 so a hard '
			+ 'day of editing shows up as work instead of a gap.');
		pill('net',     'Net',     'What\u2019s left after the cutting, laid over the bars.');
		pill('average', 'Average', 'A flat line at your average, counting only the days you wrote.');
		if (this.settings.historyDailyGoal > 0) {
			pill('goal', 'Goal', 'Your daily goal, sized to match whichever view you\u2019re on.');
		}

		this.buildHistoryChart(body, data, ser);

		// Crossing today's goal is the one moment in the report worth a fuss,
		// same as the gauge.
		const goal  = s.historyDailyGoal || 0;
		const today = figs.days[this.historyDateKey()];
		if (goal > 0 && today && (today.n || 0) >= goal) this.celebrate(body);
	}

	// Which series are drawn. Defaulted here rather than in DEFAULT_SETTINGS
	// so a vault upgrading from 1.26 — which had no such key — gets a sensible
	// chart instead of an empty one.
	historySeriesOn() {
		const raw = this.settings.historySeries;
		const def = { added: true, removed: true, net: false, average: false, goal: true };
		if (!raw || typeof raw !== 'object') return def;
		const out = {};
		for (const k of Object.keys(def)) out[k] = typeof raw[k] === 'boolean' ? raw[k] : def[k];
		if (!out.added && !out.removed && !out.net) out.added = true;
		return out;
	}

	// ── The chart ───────────────────────────────────────────────────────────
	//
	// One chart, three bucket sizes, drawn on a pixel grid: every bar is a
	// stack of whole blocks and every line is a run of whole blocks, so the
	// panel matches the ink tank and the goal gauges rather than looking like
	// a dashboard that wandered in from another application.
	//
	// Added rises from the centre line and deleted falls from it — the same
	// line, not two charts stacked. That is the point of the pairing: a week
	// of hard cutting has bars, and reads as work.
	//
	// What makes it legible rather than merely decorative, in order of how
	// much each one earns:
	//
	//   A SCALE. Until 1.28 there was none, and a bar could be 300 words or
	//   3,000 with nothing on screen to tell you which — the chart looked like
	//   data without carrying any. Gridlines at round numbers, labelled.
	//   ZERO STUBS. A day you did not write draws one faint block on the axis,
	//   so a gap is a visible absence rather than a hole where the eye cannot
	//   tell chart from margin.
	//   CAPPED BARS. The top block of every bar is lighter. That is the whole
	//   difference between a flat rectangle and something that reads as drawn.
	//   A READOUT rather than a native tooltip, which arrives after a second,
	//   in the system font, in the wrong place.

	// Round numbers a person actually thinks in: 1, 2, 2.5, 5, 10 and their
	// decades. A gridline at 3,847 is arithmetic, not a scale.
	historyNiceStep(rough) {
		if (!(rough > 0)) return 1;
		const mag  = Math.pow(10, Math.floor(Math.log10(rough)));
		const norm = rough / mag;
		const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
		return step * mag;
	}

	historyShortNum(v) {
		const a = Math.abs(v);
		if (a >= 1000000) return (v / 1000000).toFixed(a % 1000000 ? 1 : 0) + 'M';
		if (a >= 1000)    return (v / 1000).toFixed(a % 1000 && a < 10000 ? 1 : 0) + 'k';
		return String(Math.round(v));
	}

	buildHistoryChart(body, data, ser) {
		const W = HISTORY_CHART_W, H = HISTORY_CHART_H;
		const PAD = HISTORY_PX * 3;
		const buckets = data.buckets;
		const n = buckets.length || 1;

		let maxUp = 0, maxDn = 0;
		for (const b of buckets) {
			if (ser.added   && b.a > maxUp) maxUp = b.a;
			if (ser.removed && b.r > maxDn) maxDn = b.r;
			if (ser.net) { if (b.n > maxUp) maxUp = b.n; if (-b.n > maxDn) maxDn = -b.n; }
		}
		// The average and the goal are drawn INSIDE the existing scale rather
		// than being allowed to stretch it. A 5,000-word goal against a month
		// of 200s would otherwise flatten every real bar to nothing to make
		// room for a line whose position you already know.
		const active = buckets.filter(b => (b.a + b.r) > 0);
		const avg = (ser.average && active.length)
			? Math.round(active.reduce((t, b) => t + b.a, 0) / active.length) : 0;
		if (!maxUp && !maxDn) maxUp = 1;

		// Round the top of the scale UP to a whole gridline, so the topmost
		// line is a number rather than a crop mark.
		const step  = this.historyNiceStep(Math.max(maxUp, maxDn) / 3.2);
		const topV  = Math.max(step, Math.ceil(maxUp / step) * step);
		const botV  = maxDn > 0 ? Math.max(step, Math.ceil(maxDn / step) * step) : 0;

		const plot  = H - PAD * 2;
		const share = topV + botV || 1;
		let zero = PAD + plot * (topV / share);
		zero = Math.round(zero / HISTORY_PX) * HISTORY_PX;
		const upH = zero - PAD, dnH = H - PAD - zero;
		const yUp = (v) => zero - (topV ? (v / topV) * upH : 0);
		const yDn = (v) => zero + (botV ? (v / botV) * dnH : 0);

		const slot = W / n;
		// One column for the added/deleted pair, one more if net is on. Every
		// bar in the chart is then the same width, which is the only way the
		// heights can honestly be compared by eye.
		// One column per bucket. Net is drawn OVER the pair rather than beside
		// it, at the same width, and that overlap is the point: net is always
		// smaller than added (it is added minus deleted), so the blue covers
		// the lower part of the green and what stays green is exactly the part
		// that got cut again. The two readings are the same picture.
		const ncol = 1;
		// The drawing cell, the bar width and the gap between columns are
		// solved together, because each depends on the other two. The cell is
		// coarsened only if the view would otherwise ask for an unreasonable
		// number of rects — and the estimate below is the WORST case, every
		// bar full height, which is why the threshold is generous. An earlier
		// version estimated the whole plot area as filled, which is never true
		// and quietly doubled the cell on every chart in the plugin: the
		// pixels were four units wide everywhere and nothing said so.
		let cell = HISTORY_PX, bw, gap;
		for (;;) {
			bw = Math.floor((slot * 0.82 / ncol) / cell) * cell;
			// Both bounds snapped to the cell as well, or the cap reintroduces
			// a width that is not a whole number of pixels and the right-hand
			// column of every bar sits half off the grid.
			bw = Math.max(cell * 2, Math.min(Math.floor(HISTORY_BAR_MAX / cell) * cell, bw));
			gap = Math.max(0, (slot - ncol * bw) / (ncol + 1));
			const worst = n * ncol * (bw / cell) * ((H - PAD * 2) / cell);
			if (worst <= HISTORY_MAX_CELLS || cell >= HISTORY_PX * 4) break;
			cell *= 2;
		}

		// ── The readout ─────────────────────────────────────────────────────
		// Above the chart, not floating over it: a value that moves under the
		// pointer is a value you cannot read while pointing at something else.
		let ta = 0, tr = 0;
		for (const b of buckets) { ta += b.a; tr += b.r; }
		const summary = data.label + ' \u00b7 ' + ta.toLocaleString() + ' added \u00b7 '
			+ tr.toLocaleString() + ' deleted \u00b7 ' + ((ta - tr) > 0 ? '+' : '')
			+ (ta - tr).toLocaleString() + ' net'
			+ (avg > 0 ? ' \u00b7 averaging ' + avg.toLocaleString()
				+ ' per active ' + (data.view === 'day' ? 'day' : data.view) : '');
		const readout = this.historyEl('div', 'zg-hist-readout', body);
		const setReadout = (html) => { readout.textContent = html; };
		setReadout(summary);

		// ── Plot ────────────────────────────────────────────────────────────
		const plotWrap = this.historyEl('div', 'zg-hist-plot', body);
		const gutter   = this.historyEl('div', 'zg-hist-gutter', plotWrap);

		const svg = this.historySvg('svg', {
			viewBox: '0 0 ' + W + ' ' + H, class: 'zg-hist-chart',
			preserveAspectRatio: 'none', role: 'img'
		}, plotWrap);

		// One background column, and only one: the bucket you are in now. A
		// week is seven days. Shading two of them because a calendar calls
		// them a weekend is the chart telling a writer when they ought to be
		// working, in a panel whose whole job is to show what they did.
		const todayKey = this.historyDateKey();
		for (let i = 0; i < n; i++) {
			const b = buckets[i];
			if (b.key !== todayKey && !b.isNow) continue;
			this.historySvg('rect', {
				x: (i * slot).toFixed(2), y: 0, width: slot.toFixed(2), height: H,
				class: 'zg-hist-band is-now'
			}, svg);
		}

		// Gridlines, drawn as dotted runs of blocks like everything else. The
		// labels go in the HTML gutter beside the SVG, because the viewBox is
		// stretched horizontally and any text inside it stretches with it.
		const rule = (v, y) => {
			if (y < 1 || y > H - 1) return;
			for (let x = 0; x < W; x += cell * 4) {
				this.historySvg('rect', {
					x: x.toFixed(2), y: (y - 0.5).toFixed(2),
					// Clipped at the right edge: a fixed-width dash starting
					// near the end of the run overshoots the viewBox, which is
					// invisible on screen and a failed assertion in the probe.
					width: Math.min(cell * 2, W - x).toFixed(2), height: 1, class: 'zg-hist-grid'
				}, svg);
			}
			const lbl = this.historyEl('span', 'zg-hist-ylbl', gutter,
				(v < 0 ? '\u2212' : '') + this.historyShortNum(Math.abs(v)));
			lbl.style.top = ((y / H) * 100).toFixed(3) + '%';
		};
		for (let v = step; v <= topV + 0.001; v += step) rule(v, yUp(v));
		for (let v = step; v <= botV + 0.001; v += step) rule(-v, yDn(v));

		// ── Bars ────────────────────────────────────────────────────────────
		// Drawn cell by cell, out of tiny squares, with an ordered dither
		// between the steps of a heat ramp. Three earlier attempts got this
		// wrong in the same way: a stack of blocks with gaps between them
		// reads as an LED meter, and ONE quantised rectangle with a lighter
		// top row is just a rectangle with a lighter top row. Neither is a
		// pixel. A pixel is small, it has neighbours, and the shading between
		// it and its neighbours is where the texture comes from — which is
		// what the 2x2 Bayer threshold below is for. It is the same thing the
		// ink tank does with a canvas at low resolution; this does it with
		// rects because an SVG cannot be scaled up from a small buffer.
		const px = (g, x, y, w, hh, cls) => this.historySvg('rect', {
			x: x.toFixed(2), y: y.toFixed(2),
			width: w.toFixed(2), height: hh.toFixed(2), class: cls
		}, g);

		const BAYER = [[0.20, 0.70], [0.95, 0.45]];
		const pixelBar = (g, x, v, w, series, down) => {
			const span = Math.abs((down ? yDn(v) : yUp(v)) - zero);
			// Whole cells, never fewer than one: a day of forty words is still
			// a day that happened, and rounding it away would be the chart
			// tidying itself at the writer's expense.
			const h    = Math.max(cell, Math.round(span / cell) * cell);
			const rows = Math.round(h / cell);
			const cols = Math.max(1, Math.round(w / cell));
			const top  = down ? zero : zero - h;
			for (let r = 0; r < rows; r++) {
				// Hot at the far end, cool at the axis — in BOTH directions, so
				// a bar of deleted words reads the same way upside down as a
				// bar of added ones reads the right way up.
				const away = down ? (r + 0.5) / rows : (rows - r - 0.5) / rows;
				const t    = away * (HISTORY_HEAT - 1);
				const base = Math.floor(t), frac = t - base;
				for (let c = 0; c < cols; c++) {
					let lv = base;
					// Ordered dither: the transition between two steps is a
					// checker of both rather than a hard seam, which is what
					// makes the individual cells visible at all.
					if (frac > BAYER[r & 1][c & 1]) lv++;
					// The trailing column one step cooler: light from the left,
					// the same bevel the goal gauges are drawn with. Skipped on
					// a bar too narrow to spare a column.
					if (c === cols - 1 && cols > 2) lv--;
					lv = Math.max(0, Math.min(HISTORY_HEAT - 1, lv));
					px(g, x + c * cell, top + r * cell, cell, cell,
						'zg-hist-px ' + series + ' h' + lv);
				}
			}
		};

		const groups = [];
		for (let i = 0; i < n; i++) {
			const b = buckets[i];
			const g = this.historySvg('g', { class: 'zg-hist-bargroup' }, svg);
			groups.push(g);
			this.historySvg('title', {}, g).textContent = b.tip;
			this.historySvg('rect', {
				x: (i * slot).toFixed(2), y: 0, width: slot.toFixed(2), height: H,
				class: 'zg-hist-hit'
			}, g);

			// Every bar in the chart is the same width. Added rises and deleted
			// falls from the one line; net is laid over whichever of the two
			// it shares a sign with, LAST so it sits on top.
			const x = i * slot + gap;
			if (ser.added   && b.a > 0) pixelBar(g, x, b.a, bw, 'is-added', false);
			if (ser.removed && b.r > 0) pixelBar(g, x, b.r, bw, 'is-removed', true);
			if (ser.net && b.n !== 0)   pixelBar(g, x, Math.abs(b.n), bw, 'is-net', b.n < 0);
			if (!b.a && !b.r) px(g, x, zero - cell, bw, cell, 'zg-hist-zeroed');
		}

		// The axis over the bars, so it stays readable at every scale.
		this.historySvg('rect', {
			x: 0, y: (zero - 0.5).toFixed(2), width: W, height: 1, class: 'zg-hist-axis'
		}, svg);

		const dotted = (y, cls) => {
			for (let x = 0; x < W; x += cell * 3) {
				this.historySvg('rect', {
					x: x.toFixed(2), y: (y - 1).toFixed(2),
					width: Math.min(cell * 2, W - x).toFixed(2), height: 2, class: cls
				}, svg);
			}
		};
		if (avg > 0 && avg <= topV) dotted(yUp(avg), 'zg-hist-avgline');
		if (ser.goal && data.goal > 0 && data.goal <= topV) dotted(yUp(data.goal), 'zg-hist-goalline');

		// ── Hover ───────────────────────────────────────────────────────────
		// ONE listener on the svg, and the bucket worked out from the pointer's
		// position across it. The previous version put mouseenter on a
		// transparent rect per bucket and it never fired in the app: an SVG
		// shape only receives pointer events under the default
		// `pointer-events: visiblePainted` if it is actually painted, and a
		// fill of `transparent` is not — so the readout sat on the period
		// total however carefully you pointed at a bar. Working out the index
		// from one rect's geometry needs nothing to be painted at all, is one
		// listener instead of thirty-one, and cannot be broken by whatever a
		// theme decides to do to `pointer-events`.
		let lastIdx = -1;
		svg.addEventListener('mousemove', (ev) => {
			const box = svg.getBoundingClientRect();
			if (!box.width) return;
			const idx = Math.floor(((ev.clientX - box.left) / box.width) * n);
			if (idx === lastIdx) return;
			lastIdx = idx;
			setReadout(idx >= 0 && idx < n ? buckets[idx].readout : summary);
			for (let k = 0; k < groups.length; k++) groups[k].classList.toggle('is-hover', k === idx);
		});
		svg.addEventListener('mouseleave', () => {
			lastIdx = -1;
			setReadout(summary);
			for (const gg of groups) gg.classList.remove('is-hover');
		});

		// ── X axis ──────────────────────────────────────────────────────────
		const axisWrap = this.historyEl('div', 'zg-hist-xwrap', body);
		const axis = this.historyEl('div', 'zg-hist-xaxis', axisWrap);
		axis.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
		// Stride from the FIRST bucket, not from the first multiple: the old
		// form special-cased index 0 and then also matched index 1, so a long
		// month printed 1, 2, 4, 6 rather than 1, 3, 5.
		const every = data.view === 'day' ? (n > 16 ? 2 : 1) : 1;
		for (let i = 0; i < n; i++) {
			const show = data.view === 'day' ? (i % every === 0) : true;
			const sp = this.historyEl('span',
				buckets[i].key === todayKey ? 'is-now' : '', axis, show ? buckets[i].label : '');
			void sp;
		}
	}


	// Straight to the History tab rather than to the report's first tab: a
	// writer who put {history} on the bar asked for the history, and making
	// them click through the note counts first would make the token pointless.
	buildHistoryIndicator() {
		return this.buildBarButton('zg-barbtn-history',
			(node) => { node.textContent = 'History'; },
			'Your writing history \u2014 click to open it',
			() => this.openHistoryModal());
	}

	buildReportIndicator() {
		return this.buildBarButton('zg-barbtn-report',
			(node) => { node.textContent = 'Report'; },
			'Word counts and more \u2014 click for the full report',
			() => this.openReportModal());
	}

	// A centred report rather than a bar popup: eight figures and a gauge,
	// twice over, is more than a strip above the status bar can hold legibly.
	openReportModal() {
		if (!Modal) return;
		const plugin = this;
		const modal  = new Modal(this.app);
		// One aurora palette per opening of the report. Seeded here rather
		// than inside buildGoalLiquid because the modal rebuilds its body
		// on every tab switch — seeding there would re-roll the colours
		// each time you looked at a different tab and back, which reads as
		// a glitch rather than as a thing that was dealt you.
		this._auroraSeed = Math.random();
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

		// Two tabs, both about the text in front of you. The writing HISTORY is
		// a different question asked over a different span, it needs three
		// times the width to answer, and it does not depend on a file being
		// open at all — so it has its own modal rather than a third tab here.
		const TABS = [
			{ id: 'note',   label: baseName   },
			{ id: 'folder', label: folderName }
		];
		let active = 'note';

		// The chain of folders above the note, root last. A manuscript is not
		// one folder: it is scenes inside a chapter inside a part inside the
		// book, and "how long is this chapter" and "how long is the book" are
		// both real questions that the single active folder could not answer.
		// The chain is offered as a breadcrumb inside the Folder tab, so the
		// tab count does not grow with the depth of somebody's outline.
		const chainOf = (p) => {
			const out = [];
			let cur = (p && p !== '/') ? p : '';
			while (cur) {
				out.push(cur);
				const cut = cur.lastIndexOf('/');
				cur = cut > 0 ? cur.slice(0, cut) : '';
			}
			out.push('/');
			return out;
		};
		const chain = chainOf(folderPath);
		let folderSel = chain[0] || '/';

		const render = async () => { try {
			nav.empty();
			for (const tab of TABS) {
				const btn = nav.createEl('button', {
					cls: 'ws-tab-btn' + (tab.id === active ? ' is-active' : ''),
					text: tab.label
				});
				btn.addEventListener('click', () => { active = tab.id; render(); });
			}

			// The way across to the history, on the right of the tab strip.
			// NOT a third tab: the two on the left are two views of the same
			// question — how long is this — and a control that leaves for a
			// different window entirely should not be sitting in that row
			// pretending to be a sibling of them. Pushed to the far end by
			// margin-left: auto, which is what separates going somewhere from
			// switching between what is already here.
			const cross = nav.createEl('button', {
				cls: 'ws-tab-btn zg-report-cross',
				text: 'History \u2192'
			});
			cross.setAttribute('title',
				'How much you have written each day \u2014 opens in its own window.');
			cross.addEventListener('click', () => {
				modal.close();
				plugin.openHistoryModal();
			});

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
				stats  = await plugin.analyzeFolder(folderSel);
				target = plugin.folderGoalFor(folderSel);
				scope  = (folderSel === '/' ? 'Vault root' : folderSel)
					+ ' \u2014 ' + stats.files + ' note' + (stats.files === 1 ? '' : 's');
			}

			// A tab switch mid-read must not paint stale numbers.
			body.empty();

			// Scene -> Chapter -> Part -> Book -> Vault, each one clickable.
			// Nearest first, because that is the one you were just editing.
			if (active === 'folder' && chain.length > 1) {
				const crumbs = body.createDiv({ cls: 'zg-report-crumbs' });
				chain.forEach((p, i) => {
					if (i) crumbs.createSpan({ cls: 'zg-crumb-sep', text: '\u2039' });
					const name = p === '/' ? 'Vault' : p.split('/').pop();
					const btn = crumbs.createEl('button', {
						cls: 'zg-crumb' + (p === folderSel ? ' is-active' : ''),
						text: name
					});
					btn.setAttribute('title', p === '/' ? 'The whole vault' : p);
					btn.addEventListener('click', () => {
						if (p === folderSel) return;
						folderSel = p;
						render();
					});
				});
			}

			body.createDiv({ cls: 'zg-report-scope', text: scope });
			body.createEl('hr', { cls: 'zg-report-rule' });

			const ringWrap = body.createDiv({ cls: 'zg-report-ring' });
			if (target > 0) {
				const ratio = Math.min(stats.words / target, 1);
				const holder = ringWrap.createSpan({ cls: 'zg-goal' + (stats.words >= target ? ' is-met' : '') });
				// Heat ramp: ember red at nothing, amber in the middle, green
				// at the goal. currentColor carries it into the liquid.
				holder.style.color = 'hsl(' + Math.round(8 + ratio * 122) + ', 62%, 44%)';
				holder.appendChild(plugin.buildGoalLiquid(ratio));
				// Crossing the line in the report is the one place worth
				// making a fuss about, so it gets a fuss.
				// Over the whole report, not just the gauge — see celebrate().
				if (stats.words >= target) plugin.celebrate(body);
			} else {
				const none = ringWrap.createDiv({ cls: 'zg-report-ring-label is-muted' });
				none.createDiv({
					text: active === 'note' ? 'No goal set for this note yet.'
						: 'No goal set for this folder yet.'
				});
				none.createDiv({
					cls: 'zg-report-hint',
					text: 'You can set one under Settings \u2192 Word-Smith \u2192 Goals.'
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
				'Prose only \u2014 frontmatter, code blocks, maths and link targets don\u2019t count. '
				+ 'Chinese and Japanese are counted per character, Korean by word.');
			cell('Characters', stats.chars.toLocaleString(),
				'Spaces included. Skips the same things the word count does.');
			cell('Syllables',  stats.syllables.toLocaleString(),
				'A best guess \u2014 the odd unusual word gets counted wrong, but the reading '
				+ 'grade below evens that out.');
			cell('Sentences',  stats.sentences.toLocaleString(),
				'Anything ending in a full stop, question mark or exclamation mark.');
			cell('Paragraphs', stats.paragraphs.toLocaleString(),
				'Blocks of text with a blank line between them. Lists, headings and code don\u2019t count.');
			cell('Pages',      (stats.pages || 0).toLocaleString(),
				'At 250 words a page, which is the manuscript standard.');
			cell('Read time',  plugin.formatReadTime(stats.words),
				'At ' + READ_WPM + ' words a minute, set under '
				+ 'Retro Bar \u2192 Token formats.');
			cell('Grade',      stats.sentences ? stats.grade.toFixed(1) : '\u2014',
				'Roughly how many years of school someone needs to read this comfortably. '
				+ 'Under 9 is easy going.');

		} catch (e) {
			// An async renderer swallows its own exceptions; without this the
			// modal just sat on "Reading\u2026" forever — which is exactly how the
			// missing celebrate() presented.
			body.empty();
			body.createDiv({ text: 'Report failed \u2014 ' + (e && e.message ? e.message : String(e)) });
		} };
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
				// "Aa" rather than the word "Font": it is the specimen every
				// word processor uses for a type control, it reads at a
				// glance without being read, and because the button renders
				// in the chosen face it SHOWS the font instead of naming it.
				// Also the narrowest label of the five buttons, which
				// matters now that buttons are the last thing dropped when
				// the bar runs out of room.
				node.textContent = 'Aa';
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
			{ key: 'posAdverb',      color: 'posAdverbColor',      label: 'Adverbs'      },
			{ key: 'posAdjective',   color: 'posAdjectiveColor',   label: 'Adjectives'   },
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
		// Order here drives the picker, the bar tooltip and the settings
		// tab, so there is one sequence to remember rather than three.
		// The master switch stays at the foot of the picker; everything
		// above is in reading order.
		return [
			{ key: 'checkFiller',     color: 'checkFillerColor',     label: 'Filler words'      },
			{ key: 'checkPassive',    color: 'checkPassiveColor',    label: 'Passive voice'     },
			{ key: 'checkPronoun',    color: 'checkPronounColor',    label: 'Loose pronouns'    },
			{ key: 'checkRepetition', color: 'checkRepetitionColor', label: 'Repetition radar'  },
			{ key: 'checkMisused',    color: 'checkMisusedColor',    label: 'Commonly misused'  },
			{ key: 'checkIllusion',   color: 'checkIllusionColor',   label: 'Lexical illusions' },
			// No colour of its own in the picker. Sentence rhythm paints in
			// TWO (hard and very hard, and it is a background tint rather
			// than a mark), so a single swatch picked one of them and told
			// the writer something untrue about the other. `swatch: 'text'`
			// keeps the ball — the rows still line up — and takes the row's
			// own colour, so it reads as the toggle it is.
			{ key: 'checkRhythm',     color: 'checkRhythmHardColor', label: 'Sentence rhythm',
			  swatch: 'text' }
		];
	}

	buildWriteChecksIndicator() {
		const s = this.settings;
		const active = s.checksEnabled ? this.getWriteChecks().filter(c => s[c.key]) : [];
		return this.buildBarButton(
			'zg-barbtn-writechecks' + (active.length ? '' : ' is-off'),
			(node) => { node.textContent = 'Prose'; },
			active.length ? 'Prose checks: ' + active.map(c => c.label.toLowerCase()).join(', ')
				: 'Prose checks are off',
			(anchor) => this.openWriteChecksPicker(anchor)
		);
	}

	openWriteChecksPicker(anchor) {
		const s = this.settings;
		const items = this.getWriteChecks().map(c => ({
			label: c.label,
			// currentColor rather than a fixed value, so the ball fades with
			// the row when the check is off exactly as the label does.
			color: c.swatch === 'text' ? 'currentColor' : s[c.color],
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
		const any = this.textOpt('showHiddenMarkers', false) &&
			(s.markSpaces || s.markTabs || s.markParagraphs || s.markEndOfLines || s.markBlankLines);
		return this.buildBarButton(
			'zg-barbtn-markers' + (any ? '' : ' is-off'),
			(node) => { node.textContent = '\u00b6'; },
			any ? 'Hidden markers \u2014 click to change' : 'Hidden markers are off',
			(anchor) => this.openMarkersPicker(anchor)
		);
	}

	openMarkersPicker(anchor) {
		const s = this.settings;
		// Glyph first, then the word. With the symbol trailing, each row
		// began at a different place and ended at a different one, so the
		// list had no edge to read down — the marks are what the writer is
		// scanning for and they now line up in a column.
		const defs = [
			{ key: 'markTabs',       label: '\u2192 Tabs'          },
			{ key: 'markSpaces',     label: '\u00b7 Spaces'        },
			{ key: 'markEndOfLines', label: '\u21b5 Line ends'     },
			{ key: 'markParagraphs', label: '\u00b6 Paragraphs'    },
			{ key: 'markBlankLines', label: '~ End of buffer'  }
		];
		const items = defs.map(d => ({
			label: d.label,
			sub:   true,
			on: () => !!(this.textOpt('showHiddenMarkers', false) && s[d.key]),
			onClick: async () => {
				s[d.key] = !s[d.key];
				if (s[d.key]) {
					s.showHiddenMarkers = true;
					// Turning a marker on from the bar has to turn the tab that
					// owns it on too, or the click sets a flag and nothing
					// appears. Same reason the write-checks picker hands back a
					// default rather than switching on with nothing selected.
					s.miscEnabled = true;
				}
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
	// All bar iconography is drawn, not typeset: an SVG letter set in the
	// bar's font inherits that font's quirks, and a serif face made the H
	// look bent and the pilcrow lopsided. Strokes in a 24-unit box are the
	// same in every font, and take the bar's colour through currentColor.
	buildModeGlyph(kind) {
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
		const stroke = (d) => el('path', { class: 'zg-mode-stroke', d });
		const fill   = (d) => el('path', { class: 'zg-mode-fill',   d });

		if (kind === 'zen') {
			// Circle with a drawn Z.
			el('circle', { class: 'zg-mode-shape', cx: 12, cy: 12, r: 10.4 });
			stroke('M8.6 8.2 H15.4 L8.6 15.8 H15.4');
		} else if (kind === 'hem') {
			// Rounded card with a sans-serif H.
			el('rect', { class: 'zg-mode-shape', x: 1.6, y: 1.6,
				width: 20.8, height: 20.8, rx: 3.4 });
			stroke('M8.4 7 V17 M15.6 7 V17 M8.4 12 H15.6');
		} else if (kind === 'lb') {
			// Letterbox: two close rules, arrows pressing in from above and
			// below — the masks, in miniature.
			stroke('M3.5 10 H20.5 M3.5 14 H20.5');
			fill('M12 2.6 L15 6.6 H9 Z');
			fill('M12 21.4 L9 17.4 H15 Z');
		} else {
			// Typewriter: rules above and below, a serifed T between them.
			el('line', { class: 'zg-mode-shape', x1: 1.2, y1: 2.6, x2: 22.8, y2: 2.6 });
			el('line', { class: 'zg-mode-shape', x1: 1.2, y1: 21.4, x2: 22.8, y2: 21.4 });
			stroke('M6.6 7.4 H17.4 M6.6 7.4 V9 M17.4 7.4 V9 M12 7.4 V16.6 M9.9 16.6 H14.1');
		}
		return svg;
	}


	buildModeIndicator() {
		const anyOn = this.getActiveModes().length > 0 || this.letterboxActive();
		return this.buildBarButton(
			'zg-barbtn-modes' + (anyOn ? '' : ' is-off'),
			(node) => { node.textContent = 'Modes'; },
			anyOn ? 'Writing modes \u2014 click to change' : 'Writing modes are off',
			(anchor) => this.openModesPicker(anchor)
		);
	}

	openModesPicker(anchor) {
		const defs = [
			{ key: 'lb',  label: 'Letter Box',
			  on: () => this.letterboxActive(),
			  onClick: async () => { await this.toggleSetting('enableLetterbox'); } },
			{ key: 'tw',  label: 'Typewriter',
			  on: () => !!this.opt('enableTypewriter') && this.isActiveFileInScope(),
			  onClick: async () => { await this.toggleSetting('enableTypewriter'); } },
			{ key: 'hem', label: 'Hemingway',
			  on: () => !!this.opt('hemingwayEnabled') && this.isActiveFileInScope(),
			  onClick: async () => { await this.toggleSetting('hemingwayEnabled'); } },
			{ key: 'zen', label: 'Zen',
			  on: () => this.zenActive(),
			  onClick: async () => { await this.toggleZenFromBar(); } }
		];
		const items = defs.map(d => ({
			label: d.label,
			icon:  () => this.buildModeGlyph(d.key),
			on:    d.on,
			onClick: d.onClick
		}));
		this.openBarPicker(anchor, items, 'toggle');
	}

	// ════════════════════════════════════════════════════════════════════════
	// BAR RENDERING: tokens to DOM
	// ════════════════════════════════════════════════════════════════════════

	// Caret position as line:column, both counted from 1 — what every other
	// editor's status line shows, and what a :N jump in vim expects. The
	// editor's own coordinates are 0-based on both axes.
	//
	// Column is counted in characters, not bytes and not display columns: a
	// tab reads as one column, which matches how the caret moves through it
	// with the arrow keys. Reading mode has no editor, so this is blank
	// there rather than stale or zero.
	getLineColumn(view) {
		try {
			if (!view || !view.editor || !view.editor.getCursor) return '';
			const c = view.editor.getCursor();
			if (!c) return '';
			return (c.line + 1) + ':' + (c.ch + 1);
		} catch (_) { return ''; }
	}

	// Where the caret is in the note's OUTLINE, one slot per heading level.
	//
	// Obsidian's metadata cache already holds every heading with its level and
	// line, so this costs a walk over a short array rather than a parse — and
	// it is the same list the outline pane draws, so the bar can never disagree
	// with it.
	//
	// The rule that makes it a trail rather than a list: a heading CLOSES every
	// level deeper than itself. Walking down the file, an H2 clears whatever H3
	// and H4 were set under the previous H2, so the six slots always describe
	// one path from the top of the document rather than the last heading seen
	// at each level anywhere in it.
	headingTrail(view) {
		const out = ['', '', '', '', '', ''];
		try {
			if (!view || !view.file || !view.editor || !view.editor.getCursor) return out;
			const cache = this.app.metadataCache && this.app.metadataCache.getFileCache
				? this.app.metadataCache.getFileCache(view.file) : null;
			const heads = cache && cache.headings;
			if (!heads || !heads.length) return out;
			const line = view.editor.getCursor().line;
			for (const h of heads) {
				const at = h && h.position && h.position.start ? h.position.start.line : -1;
				if (at < 0) continue;
				// The cache is in document order, so the first heading past the
				// caret ends the walk.
				if (at > line) break;
				const lv = Math.max(1, Math.min(6, h.level || 1));
				out[lv - 1] = String(h.heading == null ? '' : h.heading);
				for (let d = lv; d < 6; d++) out[d] = '';
			}
		} catch (_) { /* no cache yet for a note just created */ }
		return out;
	}

	// How many OTHER notes link here. Distinct notes, not link instances: a
	// note that mentions this one four times is one note that points at you,
	// which is what the backlinks pane counts and what the reading means.
	//
	// resolvedLinks is a map of the whole vault, so this is a walk over every
	// note — cheap enough once, ruinous at the bar's update rate. Cached
	// against the path and a generation the metadata cache bumps, so it is
	// recomputed when the links actually change and not on every keystroke.
	getBacklinkCount(view) {
		try {
			const f = view && view.file ? view.file : null;
			if (!f || !f.path) return '';
			const gen = this._linkGen || 0;
			const hit = this._backlinkCache;
			if (hit && hit.path === f.path && hit.gen === gen) return hit.text;
			const resolved = (this.app.metadataCache && this.app.metadataCache.resolvedLinks) || {};
			let n = 0;
			for (const src of Object.keys(resolved)) {
				// A note linking to itself is not a backlink to itself.
				if (src === f.path) continue;
				const targets = resolved[src];
				if (targets && targets[f.path]) n++;
			}
			const text = String(n);
			this._backlinkCache = { path: f.path, gen, text };
			return text;
		} catch (_) { return ''; }
	}

	// Integers shown to the reader get thousands separators. Centralised so
	// the bar, the sidebar counts and the report cannot drift apart on it,
	// and locale-driven rather than comma-hardcoded. Guarded: a NaN slipping
	// into the bar as "NaN" is worse than showing the raw number.
	formatCount(n) {
		const v = Number(n);
		if (!isFinite(v)) return String(n == null ? 0 : n);
		try { return v.toLocaleString(); } catch (_) { return String(v); }
	}

	formatReadTime(words) {
		// 200 wpm, fixed. It was a setting; a number nobody has a calibrated
		// opinion about is a decision the writer should not have to make,
		// and 200 is the standard silent-reading estimate for adult prose.
		const wpm = READ_WPM;
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
	// The caret is in the note itself, rather than in some dialog over it.
	editorHasFocus() {
		try {
			const a = document.activeElement;
			return !!(a && a.closest && a.closest('.cm-editor'));
		} catch (_) { return true; }
	}

	// The vim mode as a stable key, independent of the label the writer chose
	// for it. Powerline colours the mode segment off this: matching on the
	// rendered label would break the moment someone shortens "-- INSERT --"
	// to "I", which is a normal thing to want and would silently fall back
	// to the normal-mode colour forever.
	//
	// Mirrors getVimModeLabel's precedence exactly, including command state
	// winning over insert.
	getVimModeKey() {
		try {
			const vault = this.app.vault;
			if (!vault.config || vault.config.vimMode !== true) return '';
			if (this._vimPanelOpen || !this.editorHasFocus()) return 'command';
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const cm6  = view && view.editor && view.editor.cm;
			const cm5  = cm6 && cm6.cm;
			const vim  = cm5 && cm5.state && cm5.state.vim;
			if (!vim) return '';
			if (vim.insertMode) return (cm5.state.overwrite || vim.replaceMode) ? 'replace' : 'insert';
			if (vim.replaceMode) return 'replace';
			if (vim.visualMode)  return 'visual';
			switch (vim.mode) {
				case 'insert':  return 'insert';
				case 'replace': return 'replace';
				case 'visual':  return 'visual';
			}
			if (document.querySelector('.cm-panels-bottom, .cm-vim-panel, .CodeMirror-dialog')) return 'command';
			return 'normal';
		} catch (_) { return ''; }
	}

	getVimModeLabel() {
		// Each mode's text is the writer's to set (Settings \u2192 Vim).
		const L = (k, d) => {
			const v = this.settings['vimLabel' + k];
			return (v != null && String(v).trim() !== '') ? v : d;
		};
		try {
			const vault = this.app.vault;
			if (!vault.config || vault.config.vimMode !== true) return '';

			// Anywhere the next keystroke drives a command interface rather
			// than the text: vim's own ":" line, the command palette, search,
			// the quick switcher, a settings dialog. Vim's mode says nothing
			// about any of those — it still reads normal or insert — but from
			// the writer's side they are one state, and reporting the mode
			// you left behind is worse than naming the one you are in.
			//
			// Checked before the vim state, so it wins over insert: with the
			// palette open, typing does not insert anything.
			if (this._vimPanelOpen || !this.editorHasFocus()) return L('Command', '-- COMMAND --');

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const cm6  = view && view.editor && view.editor.cm;
			const cm5  = cm6 && cm6.cm;
			const vim  = cm5 && cm5.state && cm5.state.vim;
			if (!vim) return '';

			// Replace mode (R) is represented as insert mode with the CM5
			// facade's overwrite flag set — vim.replaceMode alone is not
			// reliable across versions, which is why REPLACE never showed.
			//
			// Every branch goes through L(): these flag checks are the path
			// that actually fires at runtime (the vim.mode switch below is
			// a rarely-taken fallback), and hardcoded strings here were why
			// custom labels only ever showed for NORMAL and COMMAND.
			if (vim.insertMode) {
				return (cm5.state.overwrite || vim.replaceMode)
					? L('Replace', '-- REPLACE --') : L('Insert', '-- INSERT --');
			}
			if (vim.replaceMode) return L('Replace', '-- REPLACE --');
			if (vim.visualMode) {
				// The block/line variants have no label field of their own:
				// a custom Visual label covers all three, and only the
				// defaults distinguish the sub-modes.
				if (vim.visualBlock) return L('Visual', '-- VISUAL BLOCK --');
				if (vim.visualLine)  return L('Visual', '-- VISUAL LINE --');
				return L('Visual', '-- VISUAL --');
			}
			switch (vim.mode) {
				case 'insert':  return L('Insert',  '-- INSERT --');
				case 'replace': return L('Replace', '-- REPLACE --');
				case 'visual':  return L('Visual',  '-- VISUAL --');
			}
			// Fallback for the instant before the panel watcher has run.
			if (document.querySelector('.cm-panels-bottom, .cm-vim-panel, .CodeMirror-dialog')) {
				return L('Command', '-- COMMAND --');
			}
			return L('Normal', '-- NORMAL --');
		} catch (_) {
			return '';
		}
	}

	updateRetroStatusBar() {
		if (!this.retroStatusBarEl) return;
		this._goalStates = [];
		// One repaint, one read of each theme surface. Dropped here rather
		// than invalidated on theme change: the bar repaints every second for
		// the clock anyway, so a per-pass cache is both cheaper and incapable
		// of going stale across a theme switch.
		this._themeSurfaceCache = null;

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

		const dp = this.dateParts(now);
		const hTrail = this.headingTrail(view);
		const subs = {
			'{file}':      this.getFilePath(view),
			// Grouped, so a five-figure manuscript reads as 12,480 rather
			// than as a serial number. toLocaleString picks the separator
			// the reader's own locale uses — a dot or a space in much of
			// Europe — instead of hard-coding a comma.
			'{words}':     this.formatCount(displayWC),
			'{chars}':     this.formatCount(displayCC),
			'{time}':      this.formatTime(now),
			// A DRAWN token, so it goes through the sentinel path like the
			// buttons rather than substituting to text.
			'{clock}':     '\x00CLOCK\x00',
			// Another drawn token: the app's own crystal, in whatever ink
			// the segment or bar is using.
			'{obsidian}':  '\x00OBSIDIAN\x00',
			'{dd}':        dp.dd,
			'{mm}':        dp.mm,
			'{yyyy}':      dp.yyyy,
			'{yy}':        dp.yy,
			'{battery}':   this.formatBattery(),
			'{paragraph}': this.getParagraphInfo(view, stats),
			// {s}, {ss}, {sss}… — a spacer as wide as the number of s's.
			// Built below rather than listed here, because the token's name
			// carries its own argument and there is no fixed set of them.
			'{ln:col}':    this.getLineColumn(view),
			'{backlinks}': this.getBacklinkCount(view),
			// {#} through {######}: the heading the caret sits under at each
			// level, and {#>} for the whole trail. Listed rather than built,
			// because six is a fixed set — markdown has no seventh level.
			'{#}':         hTrail[0],
			'{##}':        hTrail[1],
			'{###}':       hTrail[2],
			'{####}':      hTrail[3],
			'{#####}':     hTrail[4],
			'{######}':    hTrail[5],
			'{#>}':        hTrail.filter(Boolean).join(' \u203a '),
			'{caps}':      this._capsLockOn ? '\x00CAPS\x00' : '',
			'{num}':       this._numLockOn  ? '\x00NUM\x00'  : '',
			'{vim}':       this.getVimModeLabel(),
			'{mode}':      '\x00MODE\x00',
			'{syntax}':    '\x00SYNTAX\x00',
			'{markers}':   '\x00MARKERS\x00',
			'{prose}':     '\x00WRITECHECKS\x00',
			// Called {writechecks} until 1.10 and still accepted: a share
			// code or a preset written before the rename carries the old
			// spelling, and the migration below only reaches rows in THIS
			// vault. Both map to the same button.
			'{writechecks}': '\x00WRITECHECKS\x00',
			'{font}':      '\x00FONT\x00',
			'{report}':    '\x00REPORT\x00',
			'{history}':   '\x00HISTORY\x00',
			'{readtime}':  this.formatReadTime(totalWC)
		};

		const rows = this.getStatusRows();

		// A palette or :vim bar directive is restamped on EVERY repaint —
		// :vim follows the live mode, and the numeric slots follow a theme
		// flip that may land between applyCssVariables runs. It has to
		// happen before barColor is read back below, or the caps would
		// blend the separators into the colour of the previous mode.
		const dir0 = readBarDirective((rows[0] || {}).left);
		if (dir0.bgSlot != null || dir0.textSlot === 'vim') {
			const r = this.resolveBarDirective(dir0);
			if (r.bg)   document.body.style.setProperty('--zg-bg',   r.bg);
			if (r.text) document.body.style.setProperty('--zg-text', r.text);
		}

		// Goal clicks live on the gauge elements themselves; the bar itself
		// stays inert so a stray click near the bottom edge does nothing.
		this.retroStatusBarEl.style.cursor = '';
		this.retroStatusBarEl.title        = '';

		this._zgLastTotalWordCount = totalWC;
		this.registerGoalStates();

		this.retroStatusBarEl.empty();
		this._statusRowEls = [];
		const pl   = this.settings.powerlineEnabled;
		// Powerline segments own the whole bar box including its padding, so
		// a row is that much taller and the separators have to be drawn at
		// the same height — an SVG built for the unpadded row and stretched
		// by CSS comes out distorted.
		const pad  = this.barPadding();
		const rowH = this.snappedRowHeight() + (pl ? pad.top + pad.bottom : 0);
		this.retroStatusBarEl.classList.toggle('zg-powerline', !!pl);
		// The colour a separator transitions OUT of at the end of a group is
		// the bar's own, read back rather than assumed: the bar may be on the
		// theme colours or on the retro custom pair, and a hardcoded guess
		// would leave a visible step at every cap.
		let barColor = 'transparent';
		if (pl) {
			try {
				const c = getComputedStyle(this.retroStatusBarEl).backgroundColor;
				if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') barColor = c;
			} catch (_) {}
		}
		// Spacer tokens. Every distinct {s+} written anywhere in the bar gets
		// an entry, so the existing substitution machinery does the work and
		// they behave like any other token — including taking a :N colour,
		// which is the whole point: a coloured spacer is a design element.
		//
		// An ELEMENT with a CSS width, not a run of space characters. Figure
		// spaces (U+2007) were used first and were both too wide and not
		// actually fixed: a monospace or duospace face maps every space
		// codepoint to one full cell, so the "narrow" spaces are all the
		// same width as a digit and there is no way to ask for less. A span
		// sized in em is the same width in every font and scales with the
		// bar's font size.
		for (const row of rows) {
			for (const slot of ['left', 'center', 'right']) {
				const fmt = row && row[slot];
				if (!fmt) continue;
				const found = String(fmt).match(/\{s+\}/gi);
				if (found) for (const tok of found) {
					if (subs[tok] != null) continue;
					subs[tok] = '\x00SP:' + Math.min(40, tok.length - 2) + '\x00';
				}
				// {g}, {gg}… — a gradient BAND, one unit of width per g,
				// exactly the spacer grammar. Its own token rather than a
				// mode of {s}: a spacer is empty space and a band is paint,
				// and one token meaning either depending on its neighbours
				// made every {s} a potential surprise.
				const grads = String(fmt).match(/\{g+\}/gi);
				if (grads) for (const tok of grads) {
					if (subs[tok] != null) continue;
					subs[tok] = '\x00GR:' + Math.min(40, tok.length - 2) + '\x00';
				}
			}
		}
		const section = (fmt, side) => pl
			? this.renderPowerlineSection(fmt, subs, side, rowH, barColor)
			: this.renderStatusSection(fmt, subs);
		for (let ri = 0; ri < rows.length; ri++) {
			const row = rows[ri];
			const rowEl = this.retroStatusBarEl.createDiv({ cls: 'zg-status-row' });
			// Row 1's left slot may open with a bar directive. It is stripped
			// here rather than in the section renderer so that exactly one
			// row can carry it: the bar has one background, and a second row
			// quietly setting a third colour would be a rule nobody could
			// see the effect of.
			const left = ri === 0 ? readBarDirective(row.left).rest : row.left;
			rowEl.createSpan({ cls: 'zg-status-section zg-status-left' })
				.appendChild(section(left, 'left'));
			rowEl.createSpan({ cls: 'zg-status-section zg-status-center' })
				.appendChild(section(row.center, 'center'));
			rowEl.createSpan({ cls: 'zg-status-section zg-status-right' })
				.appendChild(section(row.right, 'right'));
			this._statusRowEls.push(rowEl);
		}
		this.retroStatusBarEl.classList.toggle('zg-status-multirow', rows.length > 1);

		// Flash the bar when any registered goal is met (if enabled).
		const anyGoalMet = (this._goalStates || []).some(gl => gl.met);
		this.retroStatusBarEl.classList.toggle('zg-goal-met', anyGoalMet);
		this._goalWasMet = anyGoalMet;


		// Shrink font size if the content overflows the bar's current width
		// (e.g. when a sidebar is open and the note pane narrows).
		// The mask pass is not the only trigger: it is gated on masks being
		// active, and the bar has to stay inside the panes regardless.
		this.stampBarBounds();
		this.scheduleFit();
	}

	// Turns one of the three format strings (left/center/right) into a DOM
	// fragment, substituting tokens and swapping in the live goal-bar element
	// where a gauge token appeared (rather than plain text, when the bar
	// style is chosen).
	// ════════════════════════════════════════════════════════════════════════
	// POWERLINE
	// ════════════════════════════════════════════════════════════════════════

	// The six segment colours, in the order they are written in a row.
	// Every colour in the bar comes in a dark and a light variant, and this
	// is the one place that decides which is in play. Read live rather than
	// cached: Obsidian swaps the class on the body, and the bar repaints
	// every second anyway.
	isDarkTheme() {
		try { return document.body.classList.contains('theme-dark'); }
		catch (_) { return true; }
	}

	// The key holding a colour for the current theme. The DARK key is the
	// original name and the light one is that name with a suffix — a rename
	// to a matched pair would have been tidier and would have reinterpreted
	// every share code ever posted, since BAR_KEYS stores fields by index.
	themedKey(darkKey, lightKey) {
		return this.isDarkTheme() ? darkKey : lightKey;
	}

	powerlineColors() {
		const s = this.settings;
		const dark = this.isDarkTheme();
		const out = [];
		for (let n = 1; n <= PL_BG_COUNT; n++) {
			const c = s[dark ? 'powerlineColor' + n : 'powerlineColorLight' + n];
			// The fallback follows the theme too: a slate default on a pale
			// bar is the same mistake the light palette exists to avoid.
			out.push((typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c))
				? c : (dark ? '#3f4550' : '#d9dce1'));
		}
		return out;
	}

	// The four text colours, addressed as ;N. Separate from the backgrounds
	// so that ":2;2" is legal and means what it says rather than being a
	// same-colour-on-itself trap. Fewer than the backgrounds on purpose:
	// text on a coloured block only ever needs a light, a dark and an
	// accent or two, and the index wraps, so ;5 lands on ;1 rather than
	// failing.
	powerlineTextColor(n1) {
		const s = this.settings;
		const dark = this.isDarkTheme();
		const list = [];
		for (let n = 1; n <= PL_TEXT_COUNT; n++) {
			const c = s[dark ? 'powerlineText' + n : 'powerlineTextLight' + n];
			list.push((typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c))
				? c : (dark ? '#f7f7f5' : '#16181d'));
		}
		return list[(((n1 - 1) % list.length) + list.length) % list.length];
	}

	powerlineActive() {
		return !!(this.settings.powerlineEnabled && this.retroStatusBarEl);
	}

	// Text colour for a segment, derived rather than picked.
	//
	// Six background pickers means twelve controls if the foreground is also
	// chosen, and eleven of those decisions are the same decision: is this
	// fill dark or light. Relative luminance answers it correctly for every
	// hue, including the ones where eyeballing it goes wrong — saturated
	// yellow and cyan look "dark" in a picker and need black text.
	powerlineInk(bg) {
		try {
			let h = String(bg).trim().replace('#', '');
			if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
			if (h.length < 6) return '#f5f5f5';
			const ch = [0, 2, 4].map(i => {
				const v = parseInt(h.substr(i, 2), 16) / 255;
				return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
			});
			const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
			// Contrast against near-black vs near-white, and take the winner.
			const dark = (L + 0.05) / 0.06, light = 1.05 / (L + 0.05);
			return dark >= light ? '#16181d' : '#f7f7f5';
		} catch (_) { return '#f5f5f5'; }
	}

	// Split one row slot into segments and the shaped boundaries between them.
	//
	// Returns { segs: [{text, slot}], seps: [shape] } with seps[i] describing
	// the boundary between segs[i] and segs[i+1].
	//
	// Done by hand rather than with a split/regex because the escape and the
	// divider set overlap: a backslash is itself a divider (the \ angle cut),
	// so \| has to mean "literal pipe" while a lone \ still divides. The rule
	// is positional — a backslash directly before another divider escapes it —
	// and that is not expressible as a lookbehind.
	parsePowerlineSegments(formatStr) {
		const texts = [], seps = [], dirs = [];
		let buf = '';
		for (let i = 0; i < formatStr.length; i++) {
			const c = formatStr[i];
			if (c === '\\' && i + 1 < formatStr.length && PL_DIVIDERS[formatStr[i + 1]]) {
				buf += formatStr[i + 1]; i++; continue;
			}
			// A doubled shape character is a SOFT mark, handled later inside
			// the segment. It has to survive tokenising as ordinary text:
			// this loop splits on single characters, so without the skip a
			// doubled one becomes two hard dividers with an empty segment
			// wedged between them. Backslash is not in the set — \\ already
			// means a literal backslash.
			if (formatStr[i + 1] === c && PL_SOFT[c + c]) {
				buf += c + c; i++; continue;
			}
			if (PL_DIVIDERS[c]) {
				texts.push(buf);
				seps.push(PL_DIVIDERS[c]);
				dirs.push(PL_DIR[c] || null);
				buf = '';
				continue;
			}
			buf += c;
		}
		texts.push(buf);

		// A divider written BEFORE the first segment or AFTER the last one has
		// no segment on one side, so it is not a join — it is the shape of
		// that end of the group. That is the only way to put a ) or a \ on
		// the first and last blocks, which otherwise always took the default.
		let lead = null, tail = null, leadDir = null, tailDir = null;
		const segs = [], keptSeps = [];
		for (let i = 0; i < texts.length; i++) {
			let slot = null;
			// {token}:N, or {token} :N — the space is allowed because it reads
			// better in a row and someone will type it either way.
			// {token}:2 picks background 2; {token}:2;3 also picks text
			// colour 3. {token}:vim follows the live vim mode instead of a
			// fixed background, and :vim;3 pins the text while the
			// background moves. {token}:b1 and :b2 take the theme's own
			// page and panel colours (PL_THEME_BGS). The space in
			// {token} :2 is allowed because it reads better in a row and
			// someone will type it either way.
			//
			// Only b1 and b2 are matched, not b<any>. An unrecognised one is
			// left in the text where the writer can see it, which is how they
			// find out it is not a thing — silently swallowing :b7 would make
			// it look like a colour that happens to render as the auto pick.
			let ink = null;
			// Both suffixes are OPTIONAL and independent now: {file};vim is
			// legal (the ink follows the live mode while the background
			// keeps its auto colour), and so is a bare ;N. A token with
			// neither matches with both groups empty and is put back
			// untouched, which is what makes the optionality safe.
			const text = texts[i].replace(/(\{[a-z:]+\})(?:\s*:(\d+|vim|b[12]))?(?:\s*;\s*(\d+|vim|t[12]))?/gi, (m, tok, n, t) => {
				if (n != null && slot === null) {
					slot = /^vim$/i.test(n) ? 'vim'
						: /^b[12]$/i.test(n) ? n.toLowerCase()
						: parseInt(n, 10);
				}
				// The ink channel mirrors the background one, value for
				// value: ;vim follows the live mode as :vim does, and
				// ;t1/;t2 are the theme's normal and muted text as :b1/:b2
				// are its surfaces. Anything else (;t3, ;x) is LEFT VISIBLE,
				// the segment convention for a suffix that means nothing —
				// which is exactly how ;t1 was found missing here: it
				// worked as a bar directive and printed as a suffix.
				if (t != null && ink === null) {
					ink = /^vim$/i.test(t) ? 'vim'
						: /^t[12]$/i.test(t) ? t.toLowerCase()
						: parseInt(t, 10);
				}
				return tok;
			}).trim();
			if (!text.length) {
				// Empty because it is the space before a leading divider or
				// after a trailing one: remember the shape, drop the segment.
				if (!segs.length && seps[i] && lead === null) {
					lead = seps[i]; leadDir = dirs[i];
				} else if (seps[i - 1] && segs.length) {
					tail = seps[i - 1]; tailDir = dirs[i - 1];
				}
				continue;
			}
			if (segs.length) keptSeps.push(seps[i - 1] || 'arrow');
			segs.push({ text, slot, ink });
		}
		return { segs, seps: keptSeps, lead, tail, leadDir, tailDir };
	}

	// A soft chevron at the segment's FULL height — the outline twin of the
	// arrow separator, the way p10k draws its thin dividers between blocks
	// of one colour.
	//
	// An SVG stroke rather than the old border triangle: borders cannot make
	// a LINE that spans the row, only a filled wedge, and a wedge at full
	// height is a hard separator in the wrong colour. Stretched by
	// preserveAspectRatio="none" like the hard shapes, with
	// vector-effect="non-scaling-stroke" so the line stays the same weight
	// however tall the row paints — a scaled stroke fattens with the bar and
	// reads as a smear at large row heights.
	//
	// Same aspect as the hard arrows (--zg-pl-sep-aspect, via the
	// stylesheet), so a soft chevron and a hard arrow in one row carry the
	// same angle and read as two weights of one mark, not two marks.
	buildSoftChevron(dir) {
		const NS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-pl-soft '
			+ (dir === 'right' ? 'zg-pl-chev-r' : 'zg-pl-chev-l'));
		// Nominal only — the stylesheet stretches it. Kept as the fallback
		// geometry for a stale stylesheet, exactly like the hard shapes.
		const w = 10, h = 28;
		svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
		svg.setAttribute('width', String(w));
		svg.setAttribute('height', String(h));
		svg.setAttribute('preserveAspectRatio', 'none');
		const path = document.createElementNS(NS, 'path');
		// Inset a unit from the vertical edges so the stroke's own width is
		// not halved by the viewport clip at the point.
		path.setAttribute('d', dir === 'right'
			? 'M1,0 L' + (w - 1) + ',' + (h / 2) + ' L1,' + h
			: 'M' + (w - 1) + ',0 L1,' + (h / 2) + ' L' + (w - 1) + ',' + h);
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '1.5');
		path.setAttribute('vector-effect', 'non-scaling-stroke');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);
		return svg;
	}

	// One separator, drawn as SVG rather than set as a Nerd Font glyph.
	//
	// Drawn, because the shapes have to meet the segments they sit between
	// exactly: a font glyph is sized by its own metrics and leaves a sliver
	// of bar showing at some font sizes, which is the same class of hairline
	// the letterbox mask cost three rounds. It also means the bar does not
	// require a patched font to look right.
	//
	// `dir` is which way an arrow or curve points; the two angle cuts carry
	// their own direction because the writer picked / or \ to say so.
	buildPowerlineSep(fromColor, toColor, dir, h, shape) {
		const style = shape || 'arrow';
		// The width IS the apex angle: a triangle from (0,0) to (w,h/2) to
		// (0,h) has a nose of 2·atan((h/2)/w), so a narrow separator is a
		// blunt one. 0.55 gave 95°, which is what "not pointy" meant.
		const pct = PL_SEP_ASPECT;
		const w = style === 'straight' ? 2
			// Amplitude is w/2 to each side of the centre line, so a wave
			// needs more width than a shape that only reaches one way.
			: style === 'wave' ? Math.max(10, Math.round(h * Math.max(pct, 0.6)))
			: Math.max(6, Math.round(h * pct));
		const NS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(NS, 'svg');
		svg.setAttribute('class', 'zg-pl-sep');
		// The rendered aspect, not the viewBox's, is what sets the apex
		// angle: the element is height:100% with preserveAspectRatio="none",
		// so the shape is stretched to whatever the row actually paints at
		// and `h` here is only a guess at that. The stylesheet gives shaped
		// separators `width: auto; aspect-ratio`, which pins the angle to the
		// painted height directly and makes the guess irrelevant. The width
		// attribute stays as the fallback for that rule not applying.
		svg.setAttribute('data-shape', style);
		svg.setAttribute('width', String(w));
		svg.setAttribute('height', String(h));
		svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
		svg.setAttribute('preserveAspectRatio', 'none');
		// The viewBox is the clip: without this the overdrawn rect below
		// would paint outside the element and cover its neighbours.
		svg.setAttribute('overflow', 'hidden');
		// A straight divider PAINTS NOTHING, and that is the fix rather than
		// a shortcut.
		//
		// It drew a 2px rect and sat on top of two segments that already
		// overlap each other by a pixel on each side. Whatever it painted
		// had to line up with a boundary underneath that it does not control
		// and cannot see — so any disagreement showed as a 1px stripe of the
		// wrong colour just inside the join. One colour across the whole 2px
		// put the stripe on one side; splitting it in half moved the stripe
		// rather than removing it, because the split is at the ELEMENT's
		// midpoint and the segments meet wherever the flex layout put them.
		//
		// The seam it was meant to close is already closed without it: the
		// two segments overlap, and the later one paints over the earlier,
		// which is a boundary with no third party to misalign. Zero width
		// and zero margin, so it takes no space and pulls nothing together —
		// `|` means "these two blocks touch", and touching is the absence of
		// a shape, not a 2px drawing of one.
		if (style === 'straight') {
			svg.setAttribute('width', '0');
			svg.setAttribute('viewBox', '0 0 0 ' + h);
			return svg;
		}

		const rect = document.createElementNS(NS, 'rect');
		// Overdrawn by a pixel on every side. The rect is the separator's
		// backing colour, and drawn exactly to the viewBox its edges land on
		// the box boundary — where the browser antialiases against whatever
		// is behind, which is the bar. At fractional device pixels (any
		// zoom, any HiDPI scale) that shows as a pale hairline down the edge
		// of a segment. The SVG clips to its viewport, so bleeding past it
		// costs nothing and leaves no edge to soften.
		rect.setAttribute('x', '-1');
		rect.setAttribute('y', '-1');
		rect.setAttribute('width', String(w + 2));
		rect.setAttribute('height', String(h + 2));
		rect.setAttribute('fill', dir === 'right' ? toColor : fromColor);
		svg.appendChild(rect);

		// The shape's FLAT side must start outside the viewBox.
		//
		// The rect behind the path is the other segment's colour — for a cap
		// it is the bar itself, white in a light theme. Drawing the path's
		// flat edge exactly on the boundary means the browser antialiases it
		// against that rect INSIDE this raster, so the outermost column is a
		// blend and reads as a pale hairline against the segment it meets.
		// Nothing outside the SVG can cover that: it is not a gap between
		// elements, it is a soft edge within one image. Pushing the flat
		// side a unit past the edge moves the blend off-canvas, where the
		// viewport clip discards it and the boundary column is solid.
		//
		// Only the FLAT side moves. The point, apex or arc is the shape and
		// must stay exactly where it was.
		const L = -1;        // just outside the left edge
		const R = w + 1;     // just outside the right edge
		const mid = h / 2;
		// …and the POINT sits just inside it.
		//
		// The apex used to be exactly on the boundary, where the SVG's own
		// viewport clip cuts it: the last fraction of the tip is lost and
		// what remains is a short vertical edge. On a cap the same thing
		// happens a second time and much more visibly, because
		// `margin-inline: -1px` pulls that edge outside `.zg-status-section`,
		// which is `overflow: hidden` — the first arrow of a left group lost
		// a clear 1px of its nose and read as chopped off.
		//
		// Pulling the apex in by a third of a unit keeps the whole point
		// inside the raster. Nothing is lost visually: the sliver beyond it
		// is the rect, and the rect is by definition the colour of the
		// segment the point is reaching into.
		const TIP = 0.34;
		const tipR = w - TIP;   // a right-facing point
		const tipL = TIP;       // a left-facing one
		let d = '', fill = dir === 'right' ? fromColor : toColor;
		// The HORIZONTAL flat edges move off-canvas too — to y = -1 and
		// y = h+1 — for exactly the reason the vertical ones did. The angle
		// cuts and the wave are the only shapes with flat runs along the
		// top or bottom boundary (an arrow's extremes are vertices), and a
		// run sitting exactly on y=0 or y=h antialiases against the rect
		// inside the raster once the element is stretched to a fractional
		// painted height — which it always is, because height:100% follows
		// the row. Measured in the field as a segment-coloured hairline
		// along the bottom of every \ cut. Only the flats move: the
		// hypotenuse and the wave's cubics stay exactly where they were.
		const T = -1, B = h + 1;
		if (style === 'angleF') {
			// "/" — the cut runs bottom-left to top-right, whichever side it
			// sits on, because the writer chose the character for its shape.
			d = 'M' + w + ',0 L' + L + ',' + h + ' L' + L + ',' + T + ' L' + w + ',' + T + ' Z';
			fill = fromColor; rect.setAttribute('fill', toColor);
		} else if (style === 'angleB') {
			d = 'M' + L + ',0 L' + w + ',' + h + ' L' + w + ',' + B + ' L' + L + ',' + B + ' Z';
			fill = fromColor; rect.setAttribute('fill', toColor);
		} else if (style === 'wave') {
			// A full sine period: the boundary leaves the top edge at the
			// halfway line, bulges out to one side, crosses BACK through
			// that same halfway line at the vertical midpoint, bulges the
			// other way, and returns to it at the bottom. The crossing is
			// the inflection, and putting it exactly at (w/2, h/2) is what
			// makes the shape read as a wave rather than as a bulge with a
			// dent in it.
			//
			// Two cubics rather than the previous quadratics: a quadratic
			// has one control point and cannot hold its tangent vertical on
			// both sides of the crossing, so the halves met at an angle and
			// the join showed as a kink. Cubic control points at 0.12h and
			// 0.38h either side keep the tangent vertical THROUGH the
			// midpoint, so the two bows flow into one another.
			const c = w / 2;
			// Rounded: h * 0.12 lands on values like 3.5999999999999996,
			// and a path attribute full of float noise is unreadable in
			// devtools for no benefit at these sizes.
			const y = f => Math.round(h * f * 100) / 100;
			// The flat runs between the edge and the curve's endpoints ride
			// at y = -1 and y = h+1; the short verticals at x = c that
			// connect them to the cubics are off-canvas except for their
			// endpoint, which IS the curve's own start.
			d = dir === 'right'
				? 'M' + L + ',' + T + ' L' + c + ',' + T + ' L' + c + ',0'
					+ ' C' + w + ',' + y(0.12) + ' ' + w + ',' + y(0.38) + ' ' + c + ',' + mid
					+ ' C0,' + y(0.62) + ' 0,' + y(0.88) + ' ' + c + ',' + h
					+ ' L' + c + ',' + B + ' L' + L + ',' + B + ' Z'
				: 'M' + R + ',' + T + ' L' + c + ',' + T + ' L' + c + ',0'
					+ ' C0,' + y(0.12) + ' 0,' + y(0.38) + ' ' + c + ',' + mid
					+ ' C' + w + ',' + y(0.62) + ' ' + w + ',' + y(0.88) + ' ' + c + ',' + h
					+ ' L' + c + ',' + B + ' L' + R + ',' + B + ' Z';
		} else if (dir === 'right') {
			d = style === 'arrow'
				? 'M' + L + ',0 L' + tipR + ',' + mid + ' L' + L + ',' + h + ' Z'
				: 'M' + L + ',0 L0,0 A' + w + ',' + mid + ' 0 0 1 0,' + h
					+ ' L' + L + ',' + h + ' Z';
		} else {
			d = style === 'arrow'
				? 'M' + R + ',0 L' + tipL + ',' + mid + ' L' + R + ',' + h + ' Z'
				: 'M' + R + ',0 L' + w + ',0 A' + w + ',' + mid + ' 0 0 0 ' + w + ',' + h
					+ ' L' + R + ',' + h + ' Z';
		}
		const path = document.createElementNS(NS, 'path');
		path.setAttribute('d', d);
		path.setAttribute('fill', fill);
		svg.appendChild(path);
		return svg;
	}

	// Which colour a segment gets: an explicit :N wins, then the live vim
	// mode, then the colours in order. Numbering is 1-based because that is
	// how it is written in a row; out-of-range wraps rather than failing.
	powerlineSegColor(seg, index, colors, hasVim) {
		const pick = (n1) => colors[(((n1 - 1) % colors.length) + colors.length) % colors.length];
		if (seg.slot === 'vim') return this.vimModeColor();
		// Checked before the numeric branch: pick() does arithmetic, and 'b1'
		// through it is NaN, which is a segment painted nothing at all.
		if (typeof seg.slot === 'string' && PL_THEME_BGS[seg.slot]) {
			const c = this.themeSurfaceColor(PL_THEME_BGS[seg.slot]);
			// An empty read means the theme does not define it (or the style
			// is not resolvable yet). Fall through to the auto colour rather
			// than returning '' — an empty fill paints black, which is a
			// worse answer than the colour the segment would have had.
			if (c) return c;
		} else if (seg.slot != null) {
			return pick(seg.slot);
		}
		// A segment holding {vim} follows the mode without being asked to:
		// that is what the block is for. Suffixing it :vim is the same
		// thing said explicitly, and :N still overrides both.
		if (hasVim && /\{vim\}/.test(seg.text) && this.settings.powerlineModeColors) {
			return this.vimModeColor();
		}
		return pick(2 + (index % (colors.length - 1)));
	}

	// The ink for a segment with no explicit ;N.
	//
	// On a theme surface the theme's own text colour is right by
	// construction, and deriving one from luminance would be second-guessing
	// the theme with a worse answer — `--text-normal` is what every other
	// piece of text on that background already uses. Everywhere else the
	// background is a colour the writer picked, and the readable foreground
	// is derived (see powerlineInk).
	//
	// This one CAN be a var(): it is set as the `color` property, not as an
	// SVG attribute.
	powerlineSegInk(seg, bg) {
		if (typeof seg.slot === 'string' && PL_THEME_BGS[seg.slot]) return 'var(--text-normal)';
		return this.powerlineInk(bg);
	}

	// A theme variable's resolved value. Read from the computed style, which
	// substitutes any var() the theme wrote inside it, and returned in
	// whatever colour syntax it was declared in — hex, rgb(), hsl() — all of
	// which are valid everywhere this is used.
	//
	// Cached per repaint. The bar rebuilds every second for the clock, and
	// this would otherwise be a style read per segment per tick.
	themeSurfaceColor(varName) {
		if (this._themeSurfaceCache && varName in this._themeSurfaceCache) {
			return this._themeSurfaceCache[varName];
		}
		let val = '';
		try {
			val = getComputedStyle(document.body).getPropertyValue(varName).trim();
		} catch (_) { val = ''; }
		if (!this._themeSurfaceCache) this._themeSurfaceCache = {};
		this._themeSurfaceCache[varName] = val;
		return val;
	}

	// ── Cursor-Smith bridge ───────────────────────────────────────────────
	//
	// Cursor-Smith themes the caret per vim mode; this plugin colours the bar
	// per vim mode. Two sources of truth for "what colour is insert mode"
	// is one too many, so when Cursor-Smith is present and driving the caret,
	// its colours win and the bar follows the cursor.
	//
	// Found by SHAPE rather than by plugin id. The id is not something this
	// plugin can know reliably — it is whatever the manifest says, and has
	// no relationship to the CSS class prefixes — so instead we look for a
	// loaded plugin whose settings carry a vimModes map and a colorDark, a
	// combination nothing else has. Ids mentioning "cursor" are preferred so
	// the search is stable if something else ever matches.
	cursorSmithSettings() {
		try {
			const reg = this.app.plugins && this.app.plugins.plugins;
			if (!reg) return null;
			let fallback = null;
			for (const id of Object.keys(reg)) {
				const st = reg[id] && reg[id].settings;
				if (!st || typeof st !== 'object') continue;
				if (!st.vimModes || typeof st.vimModes !== 'object') continue;
				if (typeof st.colorDark !== 'string') continue;
				if (/cursor/i.test(id)) return st;
				if (!fallback) fallback = st;
			}
			return fallback;
		} catch (_) { return null; }
	}

	// The caret colour Cursor-Smith is using for a given mode, or null if it
	// is not installed, not driving vim, or has nothing set for that mode.
	// Null rather than a guess: the caller falls back to this plugin's own
	// pickers, which is the right answer when there is nothing to defer to.
	cursorSmithVimColor(modeKey) {
		const st = this.cursorSmithSettings();
		if (!st || !st.vimModeEnabled) return null;
		const dark = document.body.classList.contains('theme-dark');
		const snap = st.vimModes && st.vimModes[modeKey];
		const pick = (o) => {
			if (!o) return null;
			const c = dark ? o.colorDark : o.colorLight;
			return (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c)) ? c : null;
		};
		// The mode's own snapshot first, then Cursor-Smith's global caret
		// colour — a mode that has never been customised still has a colour
		// on screen, and matching it is the point.
		return pick(snap) || pick(st);
	}

	// The colour for the mode vim is in right now. Falls back to normal:
	// outside vim mode getVimModeKey() returns empty, and a segment marked
	// :vim should still have a colour rather than disappearing.
	vimModeColor() {
		const key = this.getVimModeKey() || 'normal';
		if (this.settings.vimFollowCursorSmith !== false) {
			const cs = this.cursorSmithVimColor(key);
			if (cs) return cs;
		}
		const name = 'vimColor' + key.charAt(0).toUpperCase() + key.slice(1);
		const dark = this.isDarkTheme();
		const c = this.settings[dark ? name : name + 'Light'];
		return (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c))
			? c : (dark ? '#4f9dde' : '#2d6da4');
	}

	// Build one slot of one row as powerline segments.
	//
	// `side` decides which way arrows and curves point: left-hand groups run
	// rightwards into the bar, right-hand groups run leftwards, and the
	// centre group radiates outward from its own middle — the first half
	// points left, the second half points right — because a centred group
	// has no single direction that reads as correct.
	renderPowerlineSection(formatStr, subs, side, rowH, barColor) {
		const frag = document.createDocumentFragment();
		if (!formatStr) return frag;
		const colors = this.powerlineColors();
		const parsed = this.parsePowerlineSegments(formatStr);
		if (!parsed.segs.length) return frag;
		const hasVim = /\{vim\}/.test(formatStr);
		// The end cap follows the row's own dividers instead of a setting.
		// Once the divider CHARACTER became the shape, a separate "end
		// shape" dropdown could disagree with the row it capped — you write
		// {a} ) {b} and get round joins with an arrow foot. The outer edge
		// now takes the nearest divider's shape, so a row is self-consistent
		// by construction and there is nothing to keep in sync.
		const cap    = parsed.seps.find(Boolean) || 'arrow';

		// Content first, colour second: a segment whose tokens all resolve to
		// nothing must vanish along with its separators. {vim} is empty
		// outside vim mode and {caps} is empty most of the time, so without
		// this the bar grows and sheds coloured stubs as you type.
		const built = [], sepsFor = [];
		for (let i = 0; i < parsed.segs.length; i++) {
			const inner = document.createElement('span');
			inner.className = 'zg-pl-inner';
			// Soft dividers live INSIDE a segment, drawn in its own
			// foreground rather than as a colour boundary: they group
			// related readings within one block instead of setting them
			// against each other. Three of them now:
			//   ::  hairline
			//   >>  chevron pointing right
			//   <<  chevron pointing left
			// Doubled characters, because the single forms are the arrow
			// dividers and a soft marker has to be distinguishable from a
			// hard one at a glance in the format string. Split on all three
			// at once, keeping the delimiter so the renderer knows which
			// mark to draw.
			const parts = parsed.segs[i].text.split(PL_SOFT_SPLIT);
			for (let p = 0; p < parts.length; p++) {
				const piece = parts[p];
				if (PL_SOFT[piece]) {
					// The hairline stays an <i>; the chevrons are drawn
					// SVG at the segment's full height (buildSoftChevron).
					if (piece === '>>' || piece === '<<') {
						inner.appendChild(this.buildSoftChevron(piece === '>>' ? 'right' : 'left'));
					} else {
						inner.appendChild(document.createElement('i')).className = PL_SOFT[piece];
					}
					continue;
				}
				inner.appendChild(this.renderStatusSection(piece.trim(), subs));
			}
			// A segment is empty when it holds no text and no elements. The
			// element half of that test is load-bearing for spacers: when
			// {s} substituted to figure spaces it was TEXT, and trim() eats
			// U+2007 (Unicode Zs), so a spacer-only segment measured empty
			// and was dropped along with its separators — which is why
			// spacers vanished under powerline while working in the plain
			// bar, which has no collapse step. As an element it counts.
			const hasContent = !!inner.textContent.trim()
				|| !!inner.querySelector('*:not(.zg-pl-soft)');
			if (!hasContent) continue;
			if (built.length) sepsFor.push(parsed.seps[i - 1] || cap);
			built.push({ inner, seg: parsed.segs[i] });
		}
		if (!built.length) return frag;

		// A segment holding ONLY spacers and NO explicit :N is a FADE — the
		// p10k stepped degradé. Each {s}/{ss}… element becomes one band, and
		// the bands step from the colour on one side to the colour on the
		// other: the nearest real segment, or the bar itself at a group's
		// end. One band per element, so {s}{s}{s}{s} is four narrow steps
		// and {ssss} is one wide one — the writer picks the grain.
		//
		// An explicit :N keeps the old meaning (a solid sliver — edge
		// shading), so nothing already written changes under anyone.
		// A segment holding ONLY {g} gradient tokens and NO explicit :N is a
		// FADE — the p10k stepped degradé. Each {g}/{gg}… element becomes one
		// band, and the bands step from the colour on one side to the colour
		// on the other: the nearest real segment, or the bar itself at a
		// group's end. One band per token, so {g}{g}{g} is three narrow steps
		// and {ggg} one wide one — the writer picks the grain.
		//
		// {g} with an explicit :N degrades to what {s}:N is — a solid sliver
		// — and {s} itself is only ever empty space again.
		const isFade = built.map(b => b.seg.slot == null
			&& /^(?:\{g+\}|\s)+$/i.test(b.seg.text));

		// Real segments first, fades second: a fade's colours are DERIVED
		// from its neighbours', so they have to exist. Indexing for the
		// auto walk stays positional, exactly as before.
		const segColors = built.map((b, i) =>
			isFade[i] ? null : this.powerlineSegColor(b.seg, i, colors, hasVim));

		// CONSECUTIVE fades are one gradient RUN. The writer reaches this by
		// putting dividers between {g} tokens — {g}>{g}>{g} parses as three
		// fade segments with arrows between them — and the run steps its
		// colours a→b across ALL its bands, so the shapes cut through a
		// single continuous gradient rather than each little fade privately
		// fading into the bar. Divider-less runs ({g}{g}{g}) are simply a
		// run of one segment; nothing here is a special case of the other.
		for (let r0 = 0; r0 < built.length; r0++) {
			if (!isFade[r0]) continue;
			let r1 = r0;
			while (r1 + 1 < built.length && isFade[r1 + 1]) r1++;
			const a = r0 > 0 ? segColors[r0 - 1] : barColor;
			const b = r1 < built.length - 1 ? segColors[r1 + 1] : barColor;
			const bands = [];
			for (let j = r0; j <= r1; j++) {
				// Whitespace the writer typed between gradient tokens would
				// show the bar through as gaps between bands. A fade is one
				// graded block; the gaps go.
				for (const t of Array.from(built[j].inner.querySelectorAll('.zg-fit-item'))) {
					if (!t.textContent.trim()) t.remove();
				}
				built[j]._bands = Array.from(built[j].inner.querySelectorAll('.zg-pl-grad'));
				bands.push(...built[j]._bands);
			}
			const n = bands.length;
			for (let k = 0; k < n; k++) {
				// Strictly BETWEEN the two ends — (k+1)/(n+1) — so no band
				// duplicates a neighbour's own colour. A band equal to the
				// segment beside it is a step that reads as none.
				const c = mixColors(a, b, (k + 1) / (n + 1));
				bands[k].style.backgroundColor = c;
				// The same whole-pixel bleed the segments use (invariant:
				// overlaps are whole pixels, seams are closed in the
				// meeting colour). Band widths are em-fractions, so each
				// edge rounds independently and the sliver between two
				// bands shows the bar through. ±1px in the band's own
				// colour closes it; real neighbours paint over the bleed
				// wherever they actually meet.
				bands[k].style.boxShadow = '-1px 0 0 0 ' + c + ', 1px 0 0 0 ' + c;
			}
			// Per-segment edge colours — what a separator or cap standing
			// against this segment blends with — and a mid-run representative
			// for anything that still wants "the fade's colour".
			for (let j = r0; j <= r1; j++) {
				const own = built[j]._bands;
				built[j].fadeEdges = own.length
					? [own[0].style.backgroundColor, own[own.length - 1].style.backgroundColor]
					: [a, b];
				segColors[j] = own.length
					? own[Math.floor(own.length / 2)].style.backgroundColor
					: mixColors(a, b, 0.5);
			}
			r0 = r1;
		}
		// The colour a shape actually stands against, per side. For a fade
		// that is its outermost band, not the mid-run representative — an
		// arrow drawn against the middle of a gradient would carry a colour
		// no box beside it wears.
		const edgeL = (i) => isFade[i] ? built[i].fadeEdges[0] : segColors[i];
		const edgeR = (i) => isFade[i] ? built[i].fadeEdges[1] : segColors[i];
		const pivot = Math.ceil(built.length / 2);
		// The outermost shapes — where the group meets the bar rather than
		// another segment. Marked at build time rather than found later by
		// position: once the fit pass has hidden things, "first child" is no
		// longer the same element as "the cap", and a run of hidden tokens
		// would make an inner separator look like one.
		const markCap = (sep, which) => {
			sep.classList.add('zg-pl-cap');
			// Which END it is, not which way it points: the outward side of a
			// lead cap is always the start of the row, whichever direction
			// the shape faces, and that is the side with no neighbour to
			// overlap and a clipping section edge instead.
			sep.setAttribute('data-cap', which);
			return sep;
		};

		for (let i = 0; i < built.length; i++) {
			// Leading cap: only where the group meets the bar rather than the
			// window edge. A left group starts flush at the edge. Its shape
			// follows the group's first divider, so a bar written entirely
			// with ) does not sprout one arrow at the end.
			// A left group is flush at the window edge unless a divider was
			// written before it, which is a request for a shaped opening.
			if (i === 0 && (side !== 'left' || parsed.lead)) {
				// < and > at the very start choose which way the opening
				// points; anything else keeps the default inward shape.
				// Against a fade the cap blends with the OUTERMOST band —
				// which sits close to the bar's own colour, so a cap on a
				// fade-out is as quiet as the fade it stands on.
				frag.appendChild(markCap(this.buildPowerlineSep(barColor, edgeL(0),
					parsed.leadDir || 'left', rowH,
					parsed.lead || sepsFor[0] || cap), 'lead'));
			}
			const el = document.createElement('span');
			// A segment holding nothing but spacers is a rule, not a label:
			// it drops the 9px of side padding every other segment carries,
			// which otherwise set an 18px floor on how narrow a coloured
			// sliver could be. This is what makes {s}:N usable as an edge
			// shading against the segment beside it.
			el.className = 'zg-pl-seg'
				+ (/^(?:\{[sg]+\}|\s)+$/i.test(built[i].seg.text) ? ' zg-pl-blank' : '')
				+ (isFade[i] ? ' zg-pl-fade' : '');
			if (isFade[i]) {
				// The BANDS paint the box; the segment stays transparent so
				// no single colour peeks around them, and its edge bleed is
				// per-side — the outermost band's own colour on each.
				el.style.backgroundColor = 'transparent';
				el.style.boxShadow = '-1px 0 0 0 ' + built[i].fadeEdges[0]
					+ ', 1px 0 0 0 ' + built[i].fadeEdges[1];
			} else {
			el.style.backgroundColor = segColors[i];
			// Bleed the segment's own colour one pixel left and right.
			//
			// Segment widths depend on their TEXT, so they are fractional —
			// which is why the hairline came and went as a line number
			// gained a digit. Each box's paint edges round independently, and
			// the sliver between two of them shows the BAR through, which in
			// a light theme is white. An outer box-shadow paints behind the
			// element but above the bar, so it fills any such gap in the
			// right colour while the real neighbours paint over it wherever
			// they actually meet. Horizontal only: a vertical bleed would
			// reach into the rules the bar draws along its edges.
			//
			// This covers the case the separator's own overlap cannot — two
			// segments left adjacent after an empty one collapsed, with no
			// separator between them to do the overlapping.
			el.style.boxShadow = '-1px 0 0 0 ' + segColors[i]
				+ ', 1px 0 0 0 ' + segColors[i];
			// An explicit ;N or ;vim wins; otherwise the readable one is
			// derived. ;vim reads the live mode at paint time, exactly as
			// :vim does for the background — the bar repaints on the same
			// events either way.
			const segInk = built[i].seg.ink;
			el.style.color = segInk === 'vim' ? this.vimModeColor()
				: segInk === 't1' ? 'var(--text-normal)'
				: segInk === 't2' ? 'var(--text-muted)'
				: segInk != null ? this.powerlineTextColor(segInk)
				: this.powerlineSegInk(built[i].seg, segColors[i]);
			}
			el.appendChild(built[i].inner);
			frag.appendChild(el);
			if (i < built.length - 1) {
				const dir = side === 'left' ? 'right'
					: side === 'right' ? 'left'
					: ((i + 1) < pivot ? 'left' : 'right');
				// The WRITTEN shape, fades included: an arrow beside (or
				// inside) a gradient run blends with the outermost band on
				// each side, which is a colour a real box is wearing. A |
				// stays invisible, so a flat fade is written with pipes and
				// a sawtooth one with arrows — the divider says which.
				frag.appendChild(this.buildPowerlineSep(edgeR(i), edgeL(i + 1), dir, rowH, sepsFor[i]));
			}
		}
		if (side !== 'right' || parsed.tail) {
			frag.appendChild(markCap(this.buildPowerlineSep(edgeR(built.length - 1), barColor,
				parsed.tailDir || 'right', rowH,
				parsed.tail || sepsFor[sepsFor.length - 1] || cap), 'tail'));
		}
		return frag;
	}

	renderStatusSection(formatStr, subs) {
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
		// only, so a second gauge token in the same slot silently swallowed
		// everything after it.
		const builders = {
			MODE:     () => this.buildModeIndicator(),
			SYNTAX:   () => this.buildSyntaxIndicator(),
			MARKERS:  () => this.buildMarkersIndicator(),
			WRITECHECKS: () => this.buildWriteChecksIndicator(),
			FONT:     () => this.buildFontIndicator(),
			REPORT:   () => this.buildReportIndicator(),
			HISTORY:  () => this.buildHistoryIndicator(),
			CAPS:     () => this.buildCapsIndicator(),
			NUM:      () => this.buildNumIndicator(),
			CLOCK:    () => this.buildClockFace(),
			OBSIDIAN: () => this.buildObsidianIcon()
		};
		// \x00 cannot appear in a note or a format string, so the split is
		// unambiguous. Odd indices are the captured sentinel names.
		const parts = out.split(/\x00(GOAL|FOLDERGOAL|FILEGOAL|MODE|SYNTAX|MARKERS|WRITECHECKS|FONT|REPORT|HISTORY|CAPS|NUM|CLOCK|OBSIDIAN|SP:\d+|GR:\d+)\x00/);
		for (let i = 0; i < parts.length; i++) {
			const chunk = parts[i];
			if (!chunk) continue;
			if (i % 2 === 1) {
				// {s}, {ss}… — one unit of width per s. An element rather
				// than characters, so the width is the same in every font.
				if (chunk.startsWith('SP:')) {
					const sp = document.createElement('i');
					sp.className = 'zg-pl-space';
					sp.style.width = (Number(chunk.slice(3)) * 0.25) + 'em';
					frag.appendChild(sp);
				// {g} — a gradient band. Same sizing as a spacer, its own
				// class: the fade pass paints .zg-pl-grad and must never
				// touch a spacer, which is empty space by contract.
				} else if (chunk.startsWith('GR:')) {
					const gr = document.createElement('i');
					gr.className = 'zg-pl-grad';
					gr.style.width = (Number(chunk.slice(3)) * 0.25) + 'em';
					frag.appendChild(gr);
				} else if (builders[chunk]) frag.appendChild(builders[chunk]());
			} else {
				// Wrapped rather than appended as a bare text node: the fit
				// pass drops ELEMENTS, and a text node cannot be hidden or
				// selected. In powerline the segment is already the unit, so
				// this only matters in the plain bar.
				const t = document.createElement('span');
				t.className = 'zg-fit-item';
				t.textContent = chunk;
				frag.appendChild(t);
			}
		}
		return frag;
	}

	// Reduce the retro bar's font size until the text fits its current width,
	// never going above the user's configured size. Resets to the configured
	// size first so it grows back when the bar has room again (sidebar closed).
	// Deferred to the next frame, never run inline. The bar rebuilds its DOM
	// on every tick (the clock alone guarantees one a second), and measuring
	// immediately after inserting nodes reads the layout from BEFORE they
	// were placed — so the same bar measured as fitting on one tick and
	// overflowing on the next, and tokens flickered in and out. One pending
	// frame at a time; a burst of updates collapses into a single measure.
	// A reduction that changes the TEXT has to be re-rendered, not patched
	// in place. Guarded: the rebuild schedules another fit, and without the
	// flag a mistake in the latch above would spin.
	requestBarRebuild() {
		if (this._barRebuilding) return;
		this._barRebuilding = true;
		const run = () => {
			this._barRebuilding = false;
			if (this.retroStatusBarEl) this.updateRetroStatusBar();
		};
		if (typeof window !== 'undefined' && window.requestAnimationFrame) {
			window.requestAnimationFrame(run);
		} else {
			setTimeout(run, 0);
		}
	}

	// A MICROTASK, not an animation frame — and that one word is the whole
	// fix for the bar flickering on every keystroke.
	//
	// updateRetroStatusBar rebuilds the row synchronously: every token back,
	// every cap back, the file path back to its full length. The fit pass then
	// takes the width away again. Scheduling that pass with requestAnimationFrame
	// put a PAINT between the two, so on any window narrow enough for the fit
	// to actually cut something — sidebars open, a small window — every
	// keystroke painted one frame of the over-full bar before the fitted one.
	// That is the flash, and it looked like the bar trying to wrap itself
	// because that is very nearly what it was doing: the row overflowing its
	// sections for exactly one frame.
	//
	// A microtask runs after the current task and BEFORE the frame is painted,
	// so the rebuild and the fit land in the same paint and the over-full state
	// is never on screen. Measurement is available immediately either way:
	// getBoundingClientRect forces layout on demand, and never needed a frame
	// to become accurate — the frame only ever delayed it.
	//
	// The rAF path stays for the case it was really protecting: a bar with no
	// layout box yet (first build, mid-teardown, hidden pane), where
	// clientWidth is 0 and fitStatusRow would bail out anyway. There it costs
	// nothing to wait, and waiting is what makes the first paint correct.
	scheduleFit() {
		if (this._fitPending) return;
		this._fitPending = true;
		const run = () => {
			if (!this._fitPending) return;
			this._fitPending = false;
			this.fitStatusBarText();
		};
		// Guarded: this is called from stampMaskPositions among others, and
		// an exception here would take mask placement down with it.
		const el = this.retroStatusBarEl;
		if (el && el.clientWidth && typeof Promise !== 'undefined') {
			Promise.resolve().then(run).catch(() => { this._fitPending = false; });
			return;
		}
		if (typeof window !== 'undefined' && window.requestAnimationFrame) {
			window.requestAnimationFrame(run);
		} else {
			setTimeout(run, 0);
		}
	}

	fitStatusBarText() {
		const el = this.retroStatusBarEl;
		if (!el) return;
		// The type NEVER shrinks. It used to, and the result was a bar that
		// answered a narrow window by becoming unreadable rather than
		// shorter — 7px prose is present without being legible, and it also
		// meant the drop pass never ran, because the font search always
		// found some size that fit. The size the writer chose is the size
		// the bar uses; if the content will not fit at that size, content
		// goes.
		// The size the writer chose — or, following the note, whatever the
		// editor is at right now, Ctrl+scroll included. Either way the rule
		// below holds: if the content will not fit at that size, content
		// goes; the type never shrinks.
		el.style.fontSize = this.settings.statusBarFontFollowNote
			? 'var(--font-text-size, 16px)'
			: (this.settings.statusBarFontSize || 13) + 'px';
		this.fitStatusBar();
	}


	// ════════════════════════════════════════════════════════════════════════
	// GOAL INDICATOR
	// ════════════════════════════════════════════════════════════════════════






	// ─────────────────────────────────────────────────────────────────────────
	// Letterbox mask system
	// ─────────────────────────────────────────────────────────────────────────

	// ════════════════════════════════════════════════════════════════════════
	// LETTERBOX MASKS + TYPEWRITER SCROLL
	// ════════════════════════════════════════════════════════════════════════

	buildMaskElements() {
		for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl,
			this.maskGuardLeftEl, this.maskGuardRightEl]) {
			if (el) el.remove();
		}
		this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
		this.maskGuardLeftEl = this.maskGuardRightEl = null;
		if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }

		if (!this.letterboxActive()) return;
		if (!this.app.workspace.getActiveViewOfType(MarkdownView)) return;

		// Arrays, not space-separated strings (invariant 11). The modifier
		// class is now load-bearing — the drag-region rule in styles.css
		// targets the TOP mask only — so it must not depend on how createEl
		// happens to parse a string this release.
		this.maskTopEl    = document.body.createEl('div', { cls: ['zengrinder-mask', 'zengrinder-mask-top'] });

		this.maskBottomEl = document.body.createEl('div', { cls: ['zengrinder-mask', 'zengrinder-mask-bottom'] });

		const chars = this.getArrowChars();
		this.arrowsTopEl    = this.buildArrowLayer('top',    chars.top);
		// Window-control guards. The mask grants `drag` over the whole
		// band, and it is appended AFTER Obsidian's title bar — so by DOM
		// order its grant RE-UNIONED the minimize/maximize/close corner
		// that the buttons had subtracted, and the buttons stopped being
		// clickable. Regions cannot be defended by whoever comes first;
		// the corner has to be subtracted by something LATER. These are
		// that something: two no-drag rectangles sized from the same
		// notch numbers as the visual carve-out, appended after the arrow
		// layers so nothing in the mask stack follows them. Invariant 12
		// in its plainest form — last element wins the overlap.
		this.maskGuardLeftEl  = document.body.createEl('div', { cls: ['zengrinder-mask-guard'] });
		this.maskGuardRightEl = document.body.createEl('div', { cls: ['zengrinder-mask-guard'] });
		// Taken out of flow AT CREATION, not at the first positioning pass:
		// between the two they would be ordinary block children of <body>,
		// and an element in the flow is a layout shift however briefly it
		// lasts. They are revealed by stampMaskPositions once they have
		// real geometry.
		for (const g of [this.maskGuardLeftEl, this.maskGuardRightEl]) {
			g.style.cssText = 'position:fixed;display:none;pointer-events:none;';
		}
		this.arrowsBottomEl = this.buildArrowLayer('bottom', chars.bottom);

		const scroller = this.getActiveScroller();
		if ('ResizeObserver' in window) {
			this.maskResizeObserver = new ResizeObserver(() => this.scheduleMaskPosition());
			if (scroller) this.maskResizeObserver.observe(scroller);
			// The BAR is watched too. The mask stops at the bar's measured
			// top edge, and that edge moves for reasons this code does not
			// otherwise hear about: the border width is stamped inline
			// (up to 8px on each edge, and NOT included in
			// --zg-status-bar-height), the vertical padding is a setting,
			// the row height is a setting, and the font size changes the
			// row. Any of those repainting after the mask was last stamped
			// left the hairline of bare editor between the two. Observing
			// the element means the mask re-stamps whenever its box
			// actually changes, whatever caused it.
			if (this.retroStatusBarEl) this.maskResizeObserver.observe(this.retroStatusBarEl);
		}
		this.updateMaskVisibility();
	}

	// How much of the top of the window belongs to the frame rather than to
	// the note.
	//
	// Not used to push the mask down — that was the first attempt at Obsidian
	// 1.13 hiding the window controls, and it left a bare strip above the
	// letterbox the height of the title bar. The mask covers the top edge as
	// it always did; the controls are lifted above it in CSS instead. This is
	// kept because knowing where the frame ends is genuinely useful and the
	// probe is the awkward part.
	//
	// The overlay API is asked first because it is exact and version-proof:
	// getTitlebarAreaRect() returns the strip the page may use, and its height
	// is the band the frame reserves. The element lookup is a fallback for
	// builds without it, and tries more than one class — the one Obsidian uses
	// has changed before.
	titlebarAreaHeight() {
		try {
			const o = navigator.windowControlsOverlay;
			if (o && o.visible && o.getTitlebarAreaRect) {
				const r = o.getTitlebarAreaRect();
				if (r && r.height) return Math.round(r.height);
			}
		} catch (_) { /* not an Electron build with the overlay */ }
		try {
			for (const sel of ['.titlebar', '.workspace-drag-region', '.titlebar-button-container']) {
				const el = document.querySelector(sel);
				if (!el) continue;
				const r = el.getBoundingClientRect();
				if (r && r.height && r.top <= 0) return Math.round(r.height);
			}
		} catch (_) {}
		return 0;
	}

	// Confines the bar to the editor area instead of the whole window.
	//
	// The bar is `position: fixed; left: 0; width: 100%`, which is right in
	// zen mode — the side panes are hidden there and the bar is the full
	// instrument line. With the panes open it painted straight across them,
	// covering the file tree's footer and the right pane's bottom edge.
	//
	// The root split is the editor area by definition, so the bar simply
	// takes its horizontal bounds. In zen that rect IS the window, so the
	// same code covers both cases with no mode check. Written inline, since
	// this is measured geometry rather than a setting: nothing in the
	// stylesheet knows where the panes happen to be.
	// Obsidian's zoom level, as a factor. Everything measured with
	// getBoundingClientRect comes back in ZOOMED coordinates, while an
	// inline px value is interpreted before the zoom is applied — so a
	// measurement written straight back is off by exactly this factor.
	//
	// This is the bug behind two separate "inline geometry does nothing"
	// reports: at 120% a measured 1118.4px editor was written as 1118.4px
	// and painted 1342px, spilling the bar across the side panes, and a
	// 40px side inset became 48 painted px. Divide before writing.
	// Everything the bar caches is measured in CSS pixels, and a zoom step
	// changes what a CSS pixel is worth. Three of those caches then hold
	// values that were right at the old scale and are wrong at the new one:
	//
	//   _barBoundsL/W   the stamped left and width, skipped as "unchanged"
	//                   because the numbers match even though the pane moved
	//   _barReserve     the same, for the strip under the bar
	//   _fitShortenFile the path-shortening latch, which only lets go once
	//                   the row is FIT_RESTORE_MARGIN wider than the width
	//                   that triggered it — a width in the old scale's px,
	//                   so zooming out could leave it latched forever
	//
	// Hence a full reset rather than a re-measure: the caches are not stale
	// by a little, they are answers to a question that has changed. Called
	// from the mask pass, which the ResizeObserver now drives on zoom.
	checkZoomChange() {
		const z = this.zoomFactor();
		if (this._lastZoom === z) return;
		const first = this._lastZoom === undefined;
		this._lastZoom = z;
		if (first) return;   // startup, not a change
		this._barBoundsL = this._barBoundsW = null;
		this._barReserve = null;
		this._fitShortenFile = false;
		this._fitShortenWidth = 0;
		// The re-measure is stampBarBounds's own business — it guards the
		// mid-transition frame itself, because every caller has that problem
		// and only it knows the factor. This just gets the bar rebuilt at
		// the new scale once the layout has settled.
		this.afterReflow(() => {
			this.scheduleMaskPosition();
			this.requestBarRebuild();
		});
	}

	// Run once the browser has laid out whatever just changed. Two frames,
	// not one: the first is where the pending style change is applied, the
	// second is the first that can measure the result of it.
	afterReflow(fn) {
		const go = () => { try { fn(); } catch (_) {} };
		if (typeof window === 'undefined' || !window.requestAnimationFrame) {
			setTimeout(go, 32);
			return;
		}
		window.requestAnimationFrame(() => window.requestAnimationFrame(go));
	}

	zoomFactor() {
		try {
			const raw = getComputedStyle(document.body).getPropertyValue('--zoom-factor');
			const z = parseFloat(raw);
			if (z && isFinite(z) && z > 0) return z;
		} catch (_) { /* no computed style yet */ }
		return 1;
	}

	// ── The pane reservation ──────────────────────────────────────────────
	// Nothing in the workspace is resized for the bar — it is a fixed
	// overlay — so without this the last lines of a note scroll underneath
	// it, and the caret goes with them: you keep typing into a line you
	// cannot see. Reserving the strip as PANE padding (see styles.css,
	// .zg-bar-overlap) shrinks the editor's box, so CodeMirror's own
	// scroll-into-view keeps the caret above the bar because there is
	// nowhere else for it to be. Scroller padding cannot do this — it only
	// lets the last line be scrolled clear, while every line still passes
	// under the bar on the way.
	//
	// Two things are stamped here, both measured rather than rebuilt from
	// settings (invariant 8):
	//
	// - `--zg-bar-reserve`, the depth of the strip, taken from the bar's
	//   own top edge down to the bottom of the editor area. The settings
	//   arithmetic in the stylesheet's fallback is short by the plain
	//   bar's border widths, which are stamped inline and are NOT in
	//   --zg-status-bar-height. Divided by the zoom factor before it is
	//   written: the measurement is in zoomed coordinates and a px value
	//   is read unzoomed (invariant 2).
	//
	// - `.zg-bar-overlap`, on the panes the bar actually covers. The bar
	//   spans the whole root split, so a left/right split has the strip in
	//   both panes — but in a top/bottom split the upper pane never
	//   reaches the bar, and padding it would open a dead band across the
	//   middle of the window.
	//
	// No feedback loop: pane padding is inside `.workspace-leaf`, so
	// nothing measured here moves when it is applied. The bar's own rect
	// is where the strip comes from, and that is laid out from the
	// window's bottom edge.
	//
	// Fails toward RESERVING. A leaf whose rect cannot be read keeps the
	// strip: a needless gap at the bottom of a pane is visible and
	// harmless, while a missing one hides the caret, which is the bug.
	stampBarReserve(barTop) {
		const root   = document.documentElement.style;
		const leaves = document.querySelectorAll('.workspace-split.mod-root .workspace-leaf');
		// No bar, or slid away by the toggle: give the space back. The
		// stylesheet drops the padding on `.zg-bar-hidden` as well, so this
		// is belt and braces for the case where the bar is gone entirely.
		if (!(barTop > 0)) {
			if (this._barReserve !== 0) {
				this._barReserve = 0;
				root.removeProperty('--zg-bar-reserve');
			}
			leaves.forEach(l => l.classList.remove('zg-bar-overlap'));
			return;
		}
		// Down to the bottom of the editor area, not the viewport: they are
		// the same while the native status bar is hidden (which the retro
		// bar always does), and this stays right if it ever is not.
		let bottom = 0;
		try {
			const rootEl = document.querySelector('.workspace-split.mod-root');
			const rr = rootEl && rootEl.getBoundingClientRect();
			if (rr && rr.height) bottom = rr.bottom;
		} catch (_) {}
		if (!(bottom > barTop)) {
			bottom = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
		}
		const z = this.zoomFactor();
		// Rounded in the space it will be PAINTED in, like stampBarBounds:
		// round the measurement, then divide.
		const reserve = Math.max(0, Math.round((Math.round(bottom - barTop) / z) * 1000) / 1000);
		if (this._barReserve !== reserve) {
			this._barReserve = reserve;
			root.setProperty('--zg-bar-reserve', reserve + 'px');
		}
		leaves.forEach(leaf => {
			let over = true;
			try {
				const r = leaf.getBoundingClientRect();
				// A pane is covered when its bottom edge is past the bar's
				// top. The 1px slack keeps a pane that ends exactly on that
				// line from flickering between the two answers as
				// fractional geometry rounds one way and then the other.
				if (r && r.height) over = r.bottom > barTop + 1;
			} catch (_) {}
			leaf.classList.toggle('zg-bar-overlap', over);
		});
	}

	// Phone or tablet. `Platform` is the app's own answer and is preferred;
	// the body class is the fallback for an API old enough not to export it,
	// and for the harness, where neither exists and the answer is false.
	isMobileApp() {
		try {
			if (Platform && typeof Platform.isMobile === 'boolean') return Platform.isMobile;
		} catch (_) {}
		try { return !!(document.body && document.body.classList.contains('is-mobile')); }
		catch (_) { return false; }
	}

	// Hands the bar back to the stylesheet — `.zengrinder-status-bar` is
	// `left: 0; width: 100%` until something says otherwise, and that is the
	// correct answer whenever the measurement is unavailable or untrustworthy.
	//
	// Idempotent, and it has to be: this is reached from the mask pass, which
	// runs on scroll. It also drops the bounds cache, which the old inline
	// version of this did not — so a root split that comes back at exactly
	// the geometry it left at is stamped again instead of being mistaken for
	// "no change" and left full width forever.
	clearBarBounds() {
		const el = this.retroStatusBarEl;
		if (!el || !el.style || typeof el.style.removeProperty !== 'function') return;
		if (this._barBoundsCleared) return;
		this._barBoundsCleared = true;
		this._barBoundsL = this._barBoundsW = null;
		el.style.removeProperty('left');
		el.style.removeProperty('width');
		el.style.removeProperty('right');
		const pl = this.retroPlinthEl;
		if (pl && pl.style && typeof pl.style.removeProperty === 'function') {
			pl.style.removeProperty('left');
			pl.style.removeProperty('width');
		}
		this.scheduleFit();
	}

	stampBarBounds() {
		const el = this.retroStatusBarEl;
		// Guarded on the style object as well as the element: this runs from
		// stampMaskPositions, and a throw here would take mask placement
		// down with it — the bar being a pixel wide is a blemish, the
		// letterbox failing is the feature gone.
		if (!el || !el.style || typeof el.style.removeProperty !== 'function') return;

		// A phone has no side-by-side panes. The root split IS the window, so
		// everything below can only agree with the stylesheet or be wrong —
		// and on Android in portrait it was wrong: the bar was stamped most
		// of a screen-width to the right, with `!important` on it, so nothing
		// downstream could argue it back. Landscape looked fine because the
		// offset there was small enough to read as a margin.
		//
		// Measuring nothing is the fix, not measuring better. There is no
		// geometry on a phone that the stylesheet does not already have.
		if (this.isMobileApp()) { this.clearBarBounds(); return; }

		const root = document.querySelector('.workspace-split.mod-root');
		const r = root && root.getBoundingClientRect();
		if (!r || !r.width) {
			// No root split (or not laid out): fall back to the stylesheet's
			// full width rather than pinning the bar to a stale rectangle.
			this.clearBarBounds();
			return;
		}
		// NOT divided by the zoom factor.
		//
		// Invariant 2 says measured geometry is divided before it is written
		// as px, and that is right for anything written INTO the zoomed
		// subtree — --zg-bar-reserve becomes a margin on .cm-scroller, and
		// still divides. It is wrong here. The bar is a fixed child of
		// <body>, overlaying the editor from outside it, and a rect measured
		// off the pane is already in the coordinate space it paints in.
		//
		// The masks are the proof, and they were sitting beside this the
		// whole time: same kind of element, same job, same rects — stamped
		// raw, and correct at every zoom level. Dividing here made the bar
		// too narrow zoomed in (right end walking left) and too wide zoomed
		// out (running off the right of the window), by exactly the zoom
		// ratio in each direction.
		const z = this.zoomFactor();
		// The zoom factor is still read, but only to know WHEN the layout
		// changed, never to scale anything here.
		//
		// --zoom-factor moves the instant Ctrl+/- is pressed; the reflow it
		// causes has not happened yet. A pass landing in that frame measures
		// the pane at its OLD size and caches it — and the cache below then
		// holds the bar at the old geometry, because the pass after that
		// sees no change and writes nothing.
		//
		// So a pass that arrives mid-transition measures nothing. It drops
		// the cache and comes back two frames later, when the two agree.
		// The guard lives here rather than at the call sites because every
		// caller has the same problem and only this one knows the factor.
		if (this._stampZoom !== undefined && this._stampZoom !== z) {
			this._stampZoom = z;
			this._barBoundsL = this._barBoundsW = null;
			this.afterReflow(() => this.stampBarBounds());
			return;
		}
		this._stampZoom = z;
		const left  = Math.round(r.left);
		const width = Math.round(r.width);

		// A rectangle that does not fit in the window is not a pane, it is a
		// bad measurement, and stamping it `!important` is how a bar ends up
		// somewhere its own stylesheet can no longer reach it. The window is
		// the one bound this is always allowed to assume: the root split is a
		// child of it and cannot honestly be wider or start outside it.
		//
		// innerWidth rather than visualViewport.width on purpose — a fixed
		// element at `width: 100%` is sized by the LAYOUT viewport, so that is
		// the width this is really being compared against. visualViewport
		// shrinks under pinch-zoom and would reject a perfectly good pane.
		// 2px of slack for fractional geometry rounded twice.
		const vw = Math.round(window.innerWidth || 0);
		if (vw && (width <= 0 || left < -2 || left + width > vw + 2)) {
			this.clearBarBounds();
			return;
		}
		this._barBoundsCleared = false;

		// Only touched when it actually changes: writing left/width on every
		// mask pass would invalidate layout continuously, and the mask pass
		// runs on scroll.
		if (this._barBoundsL !== left || this._barBoundsW !== width) {
			this._barBoundsL = left;
			this._barBoundsW = width;
			// setProperty with priority, not `style.left = …`. Plain inline
			// styles already beat any stylesheet, so in principle the simple
			// form is enough — but this is the SECOND feature whose inline
			// left/width had no visible effect in the field (the removed
			// side inset was the first), and the two share nothing else.
			// Whatever wins that contest, an important inline declaration
			// is above it. `right` is cleared with them: the stylesheet does
			// not set it, but the removed side inset did, and a stale value
			// would fight the width.
			el.style.setProperty('left',  left + 'px',  'important');
			el.style.setProperty('width', width + 'px', 'important');
			el.style.removeProperty('right');
			// The plinth sits directly beneath the bar, so it takes the same
			// horizontal bounds — otherwise it is the thing hanging over the
			// panes instead.
			const pl = this.retroPlinthEl;
			if (pl && pl.style && typeof pl.style.setProperty === 'function') {
				pl.style.setProperty('left',  left + 'px',  'important');
				pl.style.setProperty('width', width + 'px', 'important');
			}
			// The usable width just changed, so what fits changed with it.
			this.scheduleFit();
		}
	}

	// A clip path for the top mask that carves out the window-control corner,
	// or '' when there is nothing to avoid.
	//
	// getTitlebarAreaRect() reports the strip the *page* may use; the controls
	// occupy whatever is left of the title bar band, on the right under
	// Windows and Linux and on the left under macOS. Cutting exactly that
	// corner keeps the letterbox at the top of the window — pushing the whole
	// mask down cleared the buttons but left a bare strip the width of the
	// title bar, and raising the buttons in CSS only works if you know what
	// Obsidian calls their container this release.
	maskTopClip(maskLeft, maskTop, maskWidth, maskHeight) {
		// The notch geometry is exported for the CONTROL GUARDS (see
		// stampMaskPositions): cleared here, set only on the success path,
		// so the guards and the visual carve-out can never disagree.
		this._maskNotches = null;
		try {
			const W = window.innerWidth;
			// Everything below is computed in VIEWPORT coordinates first and
			// translated into the mask's own box at the end — clip-path
			// coordinates are element-local, and the mask spans the note
			// pane (left: sLeft, width: sWidth), not the window. The first
			// version of this carve-out skipped the translation, which was
			// harmless only because it almost never ran.
			const mL = maskLeft   || 0;
			const mT = maskTop    || 0;
			const mW = maskWidth  || W;
			const mH = maskHeight || 0;
			let h = 0, leftEdge = 0, rightEdge = W; // controls occupy [0..leftEdge] and [rightEdge..W]

			// Window Controls Overlay, when the frame actually uses it.
			// `o.visible` is false under Obsidian's own HTML frame — the
			// common case — which is why this can never be the only source:
			// relying on it alone left the carve-out empty on 1.13 and the
			// mask painted straight over minimize/close.
			const o = navigator.windowControlsOverlay;
			if (o && o.visible && o.getTitlebarAreaRect) {
				const r = o.getTitlebarAreaRect();
				if (r && r.height) {
					h         = Math.ceil(r.height);
					leftEdge  = Math.max(leftEdge, Math.round(r.x));
					rightEdge = Math.min(rightEdge, Math.round(r.x + r.width));
				}
			}

			// DOM fallback (and cross-check): measure the control buttons
			// themselves. This survives Obsidian renaming or restacking its
			// frame, because it never needs to out-z-index anything — the
			// mask simply does not cover the measured rectangles. Both
			// sources are merged, so whichever reports the larger corner
			// wins and a half-covered button cannot happen because one
			// probe under-measured. Sided containers are measured together
			// (controls can sit on either side, or both); the generic names
			// are only consulted if neither sided container exists.
			const groups = [
				['.titlebar-button-container.mod-right', '.titlebar-button-container.mod-left'],
				['.titlebar-button-container', '.titlebar .window-controls', '.titlebar-button']
			];
			for (const group of groups) {
				let found = false;
				for (const sel of group) {
					for (const el of document.querySelectorAll(sel)) {
						const r = el.getBoundingClientRect();
						// Only things actually sitting in the top band count
						// — getBoundingClientRect on a hidden element is all
						// zeroes, and a stray match lower in the page must
						// not carve the mask.
						if (!r || !r.width || !r.height || r.top > 48) continue;
						found = true;
						h = Math.max(h, Math.ceil(r.bottom));
						if (r.left + r.width / 2 > W / 2) {
							rightEdge = Math.min(rightEdge, Math.floor(r.left));
						} else {
							leftEdge = Math.max(leftEdge, Math.ceil(r.right));
						}
					}
				}
				if (found) break;
			}

			const leftW  = leftEdge;
			const rightW = W - rightEdge;
			if (!h || (leftW <= 0 && rightW <= 0)) return '';

			// Into the mask's local space, with breathing room so a
			// hairline of mask never clips an icon edge after rounding.
			let nh = h - mT + 1;
			let nl = leftW  > 0 ? (leftEdge + 2) - mL            : 0; // local x of the left notch's inner edge
			let nr = rightW > 0 ? (mL + mW) - (rightEdge - 2)    : 0; // width of the right notch inside the mask
			nl = Math.max(0, Math.min(nl, mW));
			nr = Math.max(0, Math.min(nr, mW));

			// Hard sanity clamps: window controls occupy a shallow corner of
			// a title bar. Anything bigger means a probe measured the wrong
			// element, and a mask sitting over the buttons is strictly
			// better than a letterbox that has been clipped away — so skip
			// the carve-out rather than trust the numbers.
			if (nh <= 0 || nh > Math.min(64, mH || 64)) return '';
			if (nl > mW * 0.45 || nr > mW * 0.45) return '';
			if (nl <= 0 && nr <= 0) return '';

			this._maskNotches = { nl: Math.max(0, nl), nr: Math.max(0, nr), nh };
			const xr = mW - nr; // local x where the right notch starts
			if (nl > 0 && nr > 0) {
				return 'polygon(' + nl + 'px 0, ' + xr + 'px 0, ' + xr + 'px ' + nh +
					'px, 100% ' + nh + 'px, 100% 100%, 0 100%, 0 ' + nh + 'px, ' + nl + 'px ' + nh + 'px)';
			}
			if (nr > 0) {
				return 'polygon(0 0, ' + xr + 'px 0, ' + xr + 'px ' + nh +
					'px, 100% ' + nh + 'px, 100% 100%, 0 100%)';
			}
			return 'polygon(' + nl + 'px 0, 100% 0, 100% 100%, 0 100%, 0 ' + nh +
				'px, ' + nl + 'px ' + nh + 'px)';
		} catch (_) { return ''; }
	}

	stampMaskPositions() {
		// The bar's horizontal bounds follow the editor area, and this is
		// the pass that already runs whenever that geometry can change.
		this.stampBarBounds();
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) { this._maskRaf = null; return; }

		// The VISIBLE container, not the first one that matches.
		//
		// Issue #1: the masks jam to the left edge of the window after
		// switching to reading mode, and stay there until something else
		// re-stamps them. The cause is that Obsidian keeps BOTH the source
		// view and the reading view in the DOM and toggles which is shown —
		// so in reading mode `.cm-scroller` is still found by this query, and
		// still answers getBoundingClientRect, with every value zero. Zero
		// left, zero width: the masks were stamped exactly where they were
		// told to go.
		//
		// Existence was never the question. Each candidate is measured and
		// skipped unless it has a box, so the fallback chain falls through a
		// hidden editor to the reading view behind it.
		const pick = (sel) => {
			const el = view.contentEl.querySelector(sel);
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return (r.width > 0 && r.height > 0) ? el : null;
		};
		const scroller = pick('.cm-scroller')
			|| pick('.markdown-preview-view')
			|| pick('.markdown-reading-view')
			|| view.contentEl;
		const sr = scroller.getBoundingClientRect();

		// And if NOTHING has a box yet — mid-swap, a pane still opening, a
		// leaf in a collapsed sidebar — do not stamp a degenerate rectangle
		// and leave it there. Keep whatever is on screen and try again on the
		// next frame. Bounded, because a leaf that never gets a box (a
		// background tab) must not spin a repaint loop forever.
		if (!(sr.width > 0 && sr.height > 0)) {
			this._maskRaf = null;
			this._maskRetries = (this._maskRetries || 0) + 1;
			if (this._maskRetries <= MASK_MEASURE_RETRIES) this.scheduleMaskPosition();
			return;
		}
		this._maskRetries = 0;

		let statusH = 0;
		// An auto-hidden bar occupies no space: the mask has to reach the
		// window frame, not stop short at a bar that is not there. It rises
		// over the mask on hover, which is the right way round.
		if (this.barIsHidden()) {
			statusH = 0;
		} else if (this.settings.enableRetroStatus && this.retroStatusBarEl) {
			// Height plus the vim gutter beneath the raised bar: everything
			// above must stop at the bar's top edge, not reach down behind
			// it. getBoundingClientRect includes the inline borders and the
			// padding; the settings-derived fallback beside it does not, so
			// the borders are added back there — --zg-status-bar-height is
			// only the row plus its vertical padding.
			// Only the edges actually drawn add to the fallback height, and
			// only in the plain bar — powerline draws its rules as an
			// overlay, which takes no space in the box at all.
			const st = this.settings.statusBarBorderStyle || 'solid';
			const one = (st === 'none' || this.settings.powerlineEnabled)
				? 0 : Math.max(1, Math.min(8, this.settings.statusBarBorderWidth || 2));
			const borderTotal = (this.settings.statusBarBorderTop    !== false ? one : 0)
				+ (this.settings.statusBarBorderBottom !== false ? one : 0);
			// The fallback uses the SNAPPED height, not the raw setting: the
			// parity snap can add a pixel, and a mask placed one pixel short
			// of the bar leaves a hairline of editor showing. One row,
			// always (see applyCssVariables). Only reached when the rect
			// measures zero — bar hidden or not yet laid out — but that is
			// exactly when a wrong number persists unnoticed.
			statusH = (this.retroStatusBarEl.getBoundingClientRect().height
				|| (this.snappedRowHeight() + borderTotal))
				+ this.vimGutterHeight();
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
		let   sBottom = vpH - statusH;
		// Prefer the bar's MEASURED top edge over that arithmetic. Both
		// should agree, but they are reached by different routes: the bar
		// is laid out from the window's bottom edge by CSS, while this
		// reconstructs the same line from a viewport height, a measured
		// height and a gutter. Fractional values round differently for a
		// bottom-anchored box than for a top-anchored one, and that
		// disagreement is the hairline still showing under the mask.
		// Measuring both edges in one coordinate space removes it.
		let barMeasured = false;
		if (!this.barIsHidden() && this.settings.enableRetroStatus && this.retroStatusBarEl) {
			try {
				const br = this.retroStatusBarEl.getBoundingClientRect();
				if (br.height > 0 && br.top > 0 && br.top < vpH) { sBottom = br.top; barMeasured = true; }
			} catch (_) {}
		}
		const sHeight = Math.max(0, sBottom - sTop);

		// The bar's top edge is exactly what the pane reservation needs, and
		// it has just been established in this coordinate space — measured
		// where possible, reconstructed from the viewport height and the
		// gutter where not. Zero unless the RETRO bar is what occupies the
		// strip: with it off, sBottom is measured from Obsidian's own
		// status bar, and reserving pane space for that is not this
		// feature's business.
		this.stampBarReserve(
			(!this.barIsHidden() && this.settings.enableRetroStatus && this.retroStatusBarEl)
				? sBottom : 0);
		this.checkZoomChange();

		let maskH = this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26;
		maskH = Math.min(maskH, Math.floor(sHeight * 0.45));
		maskH = Math.max(maskH, 34);

		const padH      = this.settings.maskPaddingH || 0;
		// The arrows centre on the text, so they measure the content box.
		// sr.width is the border box and includes the vertical scrollbar,
		// which the text column does not — centring on it put the arrow row
		// half a scrollbar to the right of the text. The masks themselves
		// stay on the border box: they are a backdrop and should cover the
		// scrollbar too.
		const innerW    = scroller.clientWidth || sWidth;
		const arrowLeft = sLeft + padH;
		const arrowW    = Math.max(0, innerW - padH * 2);
		const arrowH    = maskH;
		const overhang  = this.settings.maskOverhang != null ? this.settings.maskOverhang : 4;

		const S = (el, styles) => { if (el) Object.assign(el.style, styles); };
		S(this.maskTopEl,    { left: sLeft+'px', width: sWidth+'px', top: sTop+'px', height: (arrowH+overhang)+'px', bottom:'' });
		// Only the top mask can reach the window controls. Guarded twice
		// over: null when the positioner runs for the retro bar alone, and
		// isolated so nothing thrown in here can abort the bottom mask,
		// arrow and retro-bar positioning below — half-positioned chrome is
		// the plugin visibly "not displaying".
		if (this.maskTopEl) {
			try {
				// Always ask for the carve-out; maskTopClip decides.
				//
				// This used to be gated on sTop <= 2, i.e. "only bother when
				// the mask starts at the very top of the window". That held
				// only while zen's top padding did nothing. Now that the
				// padding works, the scroller starts ~17px down, the gate
				// stopped firing, and the mask went on covering the LOWER
				// part of a ~30px title bar with no notches cut — which is
				// a full-width element over the drag region, so the window
				// could no longer be dragged or its controls clicked.
				//
				// The gate was never load-bearing: maskTopClip computes
				// `h - maskTop` and returns '' when that is negative, so a
				// mask sitting below the controls already declined to carve.
				this.maskTopEl.style.clipPath =
					this.maskTopClip(sLeft, sTop, sWidth, arrowH + overhang);
			} catch (_) { try { this.maskTopEl.style.clipPath = ''; } catch (__) {} }
			// The guards follow the same notches. Viewport coordinates:
			// they are fixed children of body, not of the mask, precisely
			// so the mask's clip-path cannot trim them away.
			try {
				const n = this._maskNotches;
				const gl = this.maskGuardLeftEl, gr = this.maskGuardRightEl;
				const box = (el, left, width, height) => {
					if (!el) return;
					el.style.cssText = width > 0 && height > 0
						? 'position:fixed;top:0;left:' + left + 'px;width:' + width
							+ 'px;height:' + height + 'px;pointer-events:none;z-index:0;'
						: 'display:none;';
				};
				if (n) {
					// nl/nr are mask-local; the mask starts at sLeft.
					box(gl, sLeft, n.nl, n.nh);
					box(gr, sLeft + sWidth - n.nr, n.nr, n.nh);
				} else {
					box(gl, 0, 0, 0); box(gr, 0, 0, 0);
				}
			} catch (_) {}
		}
		S(this.arrowsTopEl,  { left: arrowLeft+'px', width: arrowW+'px', top: sTop+'px', height: arrowH+'px', bottom:'' });
		// The bottom mask is pinned to the WINDOW EDGE, not sized to stop at
		// the bar. Chasing the bar's top edge kept leaving a hairline
		// however carefully it was measured and however much overlap was
		// added, because two independently-rounded fixed elements meeting
		// on a fractional device pixel is a boundary that can always show
		// a seam. So the boundary is removed: top is set, bottom is set,
		// and the compositor stretches the element between them — its
		// bottom edge is not a number this code computes at all.
		//
		// Nothing is lost by covering the strip behind the bar. The bar
		// (z-index 22, or 10006 elevated) and the vim panel (24) both sit
		// above the masks (20 / 10003), so they paint over it exactly as
		// before, and the editor text under there was never meant to show.
		//
		// Only when the retro bar is what occupies that strip. With the
		// bar off, Obsidian's own status bar is down there and covering it
		// would be a regression, so that case keeps an exact height.
		//
		// EXCEPT while the vim ":" panel is open. The panel lives inside a
		// workspace leaf, which establishes its own stacking context, so
		// its z-index (10008) cannot lift it above a mask that is a fixed
		// child of body (10003) — raising it does nothing, which is why
		// the command line was invisible in zen mode rather than merely
		// dim. The stylesheet comment promised the mask "stands down"
		// here; nothing implemented it. So the mask's bottom edge is
		// pulled up to the top of the gutter while the panel is up,
		// leaving the strip the panel occupies uncovered.
		//
		// This reintroduces a computed bottom edge, which invariant 7
		// warns about — but harmlessly: that edge lands at the bar's own
		// bottom edge, underneath an opaque bar that paints above the
		// mask, so a rounding sliver has nowhere to show. When the panel
		// closes it goes back to bottom: 0, where there is no edge at all.
		const bottomMaskTop = Math.floor(sBottom - arrowH - overhang);
		if (barMeasured) {
			S(this.maskBottomEl, { left: sLeft+'px', width: sWidth+'px',
				top: bottomMaskTop+'px',
				bottom: (this._vimPanelOpen ? this.vimGutterHeight() : 0) + 'px',
				height: '' });
		} else {
			S(this.maskBottomEl, { left: sLeft+'px', width: sWidth+'px',
				top: bottomMaskTop+'px',
				height: Math.ceil(sBottom - bottomMaskTop)+'px', bottom:'' });
		}
		S(this.arrowsBottomEl, { left: arrowLeft+'px', width: arrowW+'px', top: (sBottom-arrowH)+'px', height: arrowH+'px', bottom:'' });

		// The bar is NOT stamped here. Its horizontal bounds have exactly
		// one owner — stampBarBounds(), called at the top of this pass —
		// and this line used to be a second one: `sLeft`/`sWidth` are the
		// ACTIVE SCROLLER's rect, so with two notes side by side the bar
		// shrank to whichever pane had focus, while the plinth beneath it
		// (stamped only from stampBarBounds) stayed the full editor width.
		//
		// Both implementations were reaching for the same thing — keep the
		// bar clear of the sidebars — and their comments said so in almost
		// the same words. One pane is not the editor area the moment a
		// pane is split; the root split is, always. Running later, this one
		// won, and it also dropped the `important` flag that stampBarBounds
		// sets (assigning through style.left clears the priority), so the
		// bounds cache then believed the correct value was still in place
		// and never corrected it.
		this.scheduleFit();

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
		if (this.retroPlinthEl) { this.retroPlinthEl.remove(); this.retroPlinthEl = null; }
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

		// …and a ResizeObserver on the body, because `resize` does not cover
		// zoom. Obsidian's Ctrl+/- restyles the app rather than changing the
		// window, so the event never fires: the bar kept the left/width it
		// had stamped at the old scale and sat visibly off its pane, and the
		// fit pass kept a verdict measured against a width that no longer
		// meant the same thing. An observer answers the question the bar
		// actually has — "has my box changed size" — and catches window
		// resizes, zoom steps and sidebar toggles with one hook.
		try {
			if (typeof ResizeObserver === 'function') {
				this._bodyResizeObs = new ResizeObserver(() => this.scheduleMaskPosition());
				this._bodyResizeObs.observe(document.body);
			}
		} catch (_) { /* the resize listener above still covers the common case */ }
	}

	detachResizeHandler() {
		if (this._bodyResizeObs) {
			try { this._bodyResizeObs.disconnect(); } catch (_) {}
			this._bodyResizeObs = null;
		}
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
				// Through textOpt, not off `s` directly: the hidden markers are
				// a Text Options setting, and reading the raw value here would
				// keep drawing them after that tab's master switch is off.
				if (!s.pluginEnabled || !plugin.textOpt('showHiddenMarkers', false)) return Decoration.none;
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
						if (s.checkMisused) {
							for (const r of findMisused(tokens)) {
								out.push(checkMark.misused.range(base + r.from, base + r.to));
							}
						}
						// Phrases first, so word hits inside a phrase can be
						// skipped rather than double-painted at double
						// opacity ("a lot of" already covers "lots").
						let phraseHits = null;
						if (s.checkFiller) {
							phraseHits = [];
							FILLER_PHRASES.lastIndex = 0;
							let m;
							while ((m = FILLER_PHRASES.exec(masked))) {
								phraseHits.push([m.index, m.index + m[0].length]);
								out.push(checkMark.filler.range(base + m.index, base + m.index + m[0].length));
							}
						}
						for (let ti = 0; ti < tokens.length; ti++) {
							const t = tokens[ti];
							if (s.checkFiller &&
								(FILLER_STRONG.has(t.lw) || (s.checkFillerSoft && FILLER_SOFT.has(t.lw))) &&
								!phraseHits.some(pr => t.from >= pr[0] && t.to <= pr[1])) {
								out.push(checkMark.filler.range(base + t.from, base + t.to));
							}
							// Only sentence-initial: a pronoun mid-sentence
							// almost always has its referent right there.
							if (s.checkPronoun && isVaguePronoun(t, ti + 1 < tokens.length ? tokens[ti + 1] : null)) {
								out.push(checkMark.pronoun.range(base + t.from, base + t.to));
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
				if (!s.pluginEnabled || !plugin.textOpt('enableParagraphIndent', false)) return Decoration.none;
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
		// Watches for a CodeMirror bottom panel — the vim ":" command line is
		// one — so the bar and the bottom mask can stand down while it is up.
		// Panels open through a state effect, so an update fires with them;
		// reading the DOM rather than guessing at vim internals keeps this
		// working whatever creates the panel.
		const panelWatcher = CM.ViewPlugin.fromClass(class {
			constructor(view) { this.sync(view); }
			update(u) { this.sync(u.view); }
			destroy() { document.body.classList.remove('zg-vim-panel-open'); }
			sync(view) {
				let open = false, panel = null;
				try { panel = view.dom.querySelector('.cm-panels-bottom'); open = !!panel; } catch (_) {}
				document.body.classList.toggle('zg-vim-panel-open', open);
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
				if (open !== plugin._vimPanelOpen) {
					plugin._vimPanelOpen = open;
					plugin.updateRetroStatusBar();
				}
				// What sits at the bottom of the window just changed, so the
				// mask geometry that stops at the bar's top edge has to be
				// recomputed either way — opening AND closing.
				plugin.scheduleMaskPosition();
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
				requestAnimationFrame(() => {
					try {
						if (!panel.isConnected) return;
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
							'--zg-vim-gutter', plugin.vimGutterHeight() + 'px');
						plugin.scheduleMaskPosition();
						plugin.saveSettings(true);
					} catch (_) {}
				});
			}
		});

		// ── EOF tildes (vim's ~) ──────────────────────────────────────────────
		// Vim draws a ~ on every VISIBLE screen row past the end of the
		// buffer. Those rows are not document positions — no decoration can
		// reach them — so this plugin owns a real element, absolutely
		// positioned over the empty space between the last line and the
		// bottom of the scroll viewport, and repainted on scroll/resize/
		// edit. It lives in view.dom (.cm-editor is position:relative in
		// CM's base theme), so like vim's the tildes hold their screen rows
		// while the text scrolls beneath them.
		const eofTildePlugin = ViewPlugin.fromClass(class {
			constructor(view) {
				this.view = view;
				this.el = document.createElement('div');
				this.el.className = 'zg-eof-tildes';
				this.el.style.display = 'none';
				view.dom.appendChild(this.el);
				this.measure = { read: () => this.read(), write: (m) => this.write(m) };
				// CM only produces a plugin update when the viewport set
				// actually changes, which small scrolls inside the render
				// margin don't — an own scroll listener keeps the tildes
				// glued to their rows. requestMeasure is scheduler-safe.
				this.onScroll = () => view.requestMeasure(this.measure);
				view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
				view.requestMeasure(this.measure);
			}
			update(u) {
				if (u.docChanged || u.viewportChanged || u.geometryChanged) {
					u.view.requestMeasure(this.measure);
				}
			}
			destroy() {
				this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
				this.el.remove();
			}
			// All layout reads happen here, inside CM's measure phase.
			read() {
				const view = this.view;
				const s = plugin.settings;
				if (!s.pluginEnabled || !plugin.textOpt('showHiddenMarkers', false)
					|| !s.markBlankLines) return null;
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
				} catch (_) {
					// Older CM without those accessors: fall back to boxes.
					textBottom = cRect.bottom - (parseFloat(cStyle.paddingBottom) || 0);
				}
				const lineH   = view.defaultLineHeight || 24;
				// Scrolled far past the end, the last line can sit above the
				// viewport; then every visible row is past EOF (clamp to top).
				const startY  = Math.max(textBottom, scRect.top);
				const height  = scRect.bottom - startY;
				if (height < lineH * 0.5) return { hide: true };
				const domRect = view.dom.getBoundingClientRect();
				return {
					top:   startY - domRect.top,
					left:  (cRect.left - domRect.left) + (parseFloat(cStyle.paddingLeft) || 0),
					lineH,
					// The face is READ from the content element rather than
					// inherited through .cm-editor. The overlay is a sibling
					// of .cm-scroller, so the font rules that target
					// .cm-content (and the --zg-font stamp that drives them)
					// never reached it — which is why the tildes came out in
					// the interface font instead of the chosen one. Copying
					// the computed value cannot miss whatever set it.
					font:  cStyle.fontFamily,
					size:  cStyle.fontSize,
					weight: cStyle.fontWeight,
					count: Math.min(500, Math.ceil(height / lineH))
				};
			}
			write(m) {
				if (!m || m.hide || !(m.count > 0)) { this.el.style.display = 'none'; return; }
				const st = this.el.style;
				st.display    = '';
				st.top        = m.top + 'px';
				st.left       = m.left + 'px';
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
		// nothing without needing to know about `.zg-bar-overlap`.
		const caretFloor = CM.EditorView.scrollMargins.of((view) => {
			try {
				if (!plugin.editorViewIsNote(view)) return null;
				const r = view.scrollDOM.getBoundingClientRect();
				const below = Math.round(r.bottom - plugin.caretFloorY());
				const above = Math.round(plugin.caretCeilingY() - r.top);
				// A pixel of slack at each edge: fractional geometry
				// otherwise asks for a 1px margin forever and every scroll
				// fights the last one.
				const margins = {};
				if (below > 1) margins.bottom = below;
				if (above > 1) margins.top = above;
				return (margins.top || margins.bottom) ? margins : null;
			} catch (_) { return null; }
		});

		return [dimPlugin, markerPlugin, syntaxPlugin, paraPlugin, panelWatcher, eofTildePlugin, caretFloor]
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

	// The quietest of the three: the Modes button reddens. If {mode} is not
	// in the bar there is nothing to flash, and nothing flashes.
	flashHemingwayIcon() {
		const el = document.querySelector('.zg-barbtn-modes');
		if (!el) return;
		el.classList.remove('zg-hem-blocked');
		void el.offsetWidth;   // reflow, so held keys restart the flash
		el.classList.add('zg-hem-blocked');
		if (this._hemIconTimer) window.clearTimeout(this._hemIconTimer);
		this._hemIconTimer = window.setTimeout(() => {
			const badge = document.querySelector('.zg-barbtn-modes.zg-hem-blocked');
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

	// ═══════════════════════════════════════════════════════════════════════════
	// VIM SUPPORT: motion mapping
	// ═══════════════════════════════════════════════════════════════════════════

	// Obsidian's vim mode is CodeMirror's own. Which object it hangs off has
	// moved between versions, so every known route is tried rather than
	// betting on one and failing silently.
	vimApi() {
		const routes = [
			() => require('@replit/codemirror-vim').Vim,
			() => window.CodeMirrorAdapter && window.CodeMirrorAdapter.Vim,
			() => window.CodeMirror && window.CodeMirror.Vim,
			() => this.app.workspace.activeEditor
				&& this.app.workspace.activeEditor.editor
				&& this.app.workspace.activeEditor.editor.cm
				&& this.app.workspace.activeEditor.editor.cm.cm
				&& this.app.workspace.activeEditor.editor.cm.cm.constructor.Vim
		];
		for (const get of routes) {
			try {
				const Vim = get();
				if (Vim && typeof Vim.map === 'function' && typeof Vim.unmap === 'function') return Vim;
			} catch (_) { /* route not available in this build */ }
		}
		return null;
	}

	// Normal and visual both: mapping only normal leaves v-j jumping over
	// wrapped lines, which is more confusing than not mapping at all.
	//
	// Mapping is re-applied every time rather than guarded on a flag. It is
	// idempotent, and Obsidian rebuilds its vim state when the editor is
	// recreated — a leaf change, a vault reload, toggling vim mode off and on
	// — each of which drops whatever we set. Applying once and remembering we
	// had was why this appeared to do nothing.
	applyVimMotionMaps() {
		const Vim = this.vimApi();
		if (!Vim) return false;
		const want = !!(this.settings.pluginEnabled && this.settings.vimSoftWrapMotion);
		const PAIRS = [['j', 'gj'], ['k', 'gk'], ['0', 'g0'], ['$', 'g$']];
		try {
			if (want) {
				for (const [from, to] of PAIRS) {
					Vim.map(from, to, 'normal');
					Vim.map(from, to, 'visual');
				}
				this._vimMapped = true;
			} else if (this._vimMapped) {
				// Only ever released if we installed it. Unmapping a key we
				// never claimed would tear out a binding the user set through
				// a vimrc plugin.
				for (const [from] of PAIRS) {
					Vim.unmap(from, 'normal');
					Vim.unmap(from, 'visual');
				}
				this._vimMapped = false;
			}
		} catch (_) { return false; }
		return true;
	}

	// The adapter does not exist until vim mode has started, which can be well
	// after onload. Retry briefly rather than silently doing nothing.
	scheduleVimMotionMaps(tries) {
		if (this.applyVimMotionMaps()) return;
		const left = (tries == null ? 20 : tries) - 1;
		if (left <= 0) return;
		window.setTimeout(() => this.scheduleVimMotionMaps(left), 250);
	}

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
		// A note Word-Smith has been told to leave alone gets no badge, and
		// loses one it already had. The folder sums are built by adding up the
		// badges below them, so this is also what keeps the explorer's totals
		// agreeing with the report's — and both agreeing with the history.
		// The missing badge is worth something on its own: it is how you see,
		// at a glance, which notes are outside the scope you set.
		if (!this.isFileCounted(file)) {
			const had = el.querySelector('.zg-count');
			if (had) had.remove();
			return;
		}
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
		// null, not a tab id: display() falls back to TABS[0], and that
		// list's own comment ("Retro Bar first…") is where the choice of
		// opening tab lives. A second copy of the answer here is how the
		// pane spent several releases opening on Zen while the tab order
		// said Retro Bar — the two disagreed, and this one ran last.
		this._activeTab = null;
	}

	display() {
		const { containerEl } = this;
		// Rebuilding the pane resets its scroll, so every toggle used to
		// bounce the settings back to the top. Remember the scroller's
		// position and put it back once the new content is in — one frame
		// later, after layout has given it its height back.
		const scroller = containerEl.closest('.vertical-tab-content')
			|| containerEl.parentElement || containerEl;
		const scrollTop = scroller.scrollTop;
		const restoreScroll = () =>
			requestAnimationFrame(() => { scroller.scrollTop = scrollTop; });
		containerEl.empty();
		new Setting(containerEl).setName('Word-Smith').setHeading();

		// ── Master on/off ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Enable Word-Smith')
			.setDesc('Turns everything below on or off.')
			.addToggle(t => t.setValue(this.plugin.settings.pluginEnabled)
				.onChange(async v => {
					this.plugin.settings.pluginEnabled = v;
					await this.plugin.saveSettings(true); // master switch lands immediately, not debounced
					this.display();
				}));

		if (!this.plugin.settings.pluginEnabled) { restoreScroll(); return; }

		this.renderScopeSection(containerEl);

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// ── Tab bar ──────────────────────────────────────────────────────────────
		// Retro Bar first: it is the tab with the most in it, the one a new
		// writer is most likely to have come here for, and — since TABS[0]
		// is what a fresh install opens on — the best first thing to see.
		const TABS = [
			{ id: 'retrobar',   label: 'Retro Bar',    render: this.displayRetroBarTab },
			{ id: 'zen',        label: 'Zen',          render: this.displayZenTab },
			{ id: 'letterbox',  label: 'Letter Box',   render: this.displayLetterboxSection },
			{ id: 'typewriter', label: 'Typewriter',   render: this.displayTypewriterTab },
			{ id: 'hemingway',  label: 'Hemingway',    render: this.displayHemingwayTab },
			{ id: 'syntax',     label: 'Syntax',       render: this.displaySyntaxTab },
			{ id: 'checks',     label: 'Prose Checks', render: this.displayChecksTab },
			{ id: 'text',       label: 'Text Options', render: this.displayTextTab },
			{ id: 'typography', label: 'Typography',   render: this.renderTypographySection },
			// Goals and History sit together and last-but-two: they are about
			// what you are writing rather than how the editor looks, and the
			// two of them read as a pair.
			{ id: 'goals',      label: 'Goals',        render: this.displayGoalsTab },
			{ id: 'history',    label: 'History',      render: this.displayHistoryTab },
			{ id: 'misc',       label: 'Misc',         render: this.displayMiscTab },
			// Vim last. It is the one tab most people will never open, and a
			// tab nobody opens belongs at the end rather than in the middle of
			// the ones they do.
			{ id: 'vim',        label: 'Vim',          render: this.displayVimTab }
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
		restoreScroll();
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

	// Rendered in BOTH the Goals tab and the History tab, on purpose, because
	// it is one list and a writer excluding their outline from the book's
	// target almost always wants it out of the history too. Two lists would
	// drift, and the first thing anyone would ask is which one won.
	renderCountExclude(containerEl, where) {
		const s = this.plugin.settings;
		if (!Array.isArray(s.countExclude)) s.countExclude = [];
		const paths = s.countExclude;

		const setting = new Setting(containerEl)
			.setName('Never counted')
			.setDesc(paths.length
				? 'These are left out of ' + where + ', and out of the word counts in the '
					+ 'file explorer. Word-Smith still works in them normally.'
				: 'Leave an outline, a research folder or a scratch note out of your totals '
					+ 'without switching Word-Smith off in it. Nothing excluded yet.');

		if (WsPathSuggestModal) {
			setting
				.addButton(b => b.setButtonText('Add folder').onClick(() => this.pickCountExclude('folder')))
				.addButton(b => b.setButtonText('Add note').onClick(() => this.pickCountExclude('file')));
		}

		if (paths.length) {
			const list = containerEl.createEl('div', { cls: 'ws-scope-list' });
			paths.forEach((path, i) => {
				const row = list.createEl('div', { cls: 'ws-scope-row' });
				row.createEl('span', {
					cls: 'ws-scope-path' + (path.endsWith('.md') ? '' : ' is-folder'),
					text: path
				});
				const btn = row.createEl('button', { cls: 'ws-scope-remove', text: '\u00d7' });
				btn.setAttribute('aria-label', 'Stop excluding ' + path);
				btn.addEventListener('click', async () => {
					s.countExclude.splice(i, 1);
					await this.plugin.saveSettings(true);
					this.display();
				});
			});
		}

		containerEl.createEl('p', {
			text: 'One list, shared with the ' + (where.indexOf('history') === 0 ? 'Goals' : 'History')
				+ ' tab \u2014 excluding something here excludes it there too. Words already '
				+ 'recorded stay in the history; this stops new ones being added.',
			cls: 'ws-settings-note'
		});
	}

	pickCountExclude(kind) {
		if (!WsPathSuggestModal) return;
		const s = this.plugin.settings;
		const have = new Set(s.countExclude || []);
		let items;
		if (kind === 'folder') {
			items = this.app.vault.getAllLoadedFiles()
				.filter(f => f && (TFolder ? f instanceof TFolder : f.children !== undefined))
				.map(f => f.path)
				.filter(path => path && path !== '/' && !have.has(path));
		} else {
			items = this.app.vault.getMarkdownFiles()
				.map(f => f.path)
				.filter(path => !have.has(path));
		}
		if (!items.length) return;
		new WsPathSuggestModal(
			this.app, items,
			kind === 'folder' ? 'Never count this folder\u2026' : 'Never count this note\u2026',
			async (picked) => {
				if (!Array.isArray(s.countExclude)) s.countExclude = [];
				if (!s.countExclude.includes(picked)) s.countExclude.push(picked);
				await this.plugin.saveSettings(true);
				this.display();
			}
		).open();
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
			.setDesc('Clears everything away but your words.')
			.addToggle(t => t.setValue(this.plugin.settings.zenEnabled)
				.onChange(async v => {
					// One switch moves both flags. A separate "Focus mode"
					// toggle under a "Zen" master was two names for the same
					// idea, and Letter Box left this tab long ago.
					this.plugin.settings.zenEnabled = v;
					this.plugin.settings.zenMode    = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (!this.plugin.settings.zenEnabled) return;

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		{
			const z = this.sub(containerEl);

			this.toggle(z, 'Full screen', 'Go fullscreen whenever you enter zen.', 'fullscreen');

			this.toggle(z, 'Match the title bar',
				'Paint it to match the editor.'
				+ 'Needs Obsidian\u2019s own window frame \u2014 a native OS title bar cannot be styled.',
				'zenTitlebarMatch');

			this.toggle(z, 'Focused file mode', 'Hides every other pane so only this note is open.', 'focusedFileMode');

			this.label(z, 'Hide in zen mode');
			const hide = this.sub(z);
			this.toggle(hide, 'Properties',       'Properties and frontmatter.',   'hideProperties');
			this.toggle(hide, 'Inline title',      'The title above the note.',            'hideInlineTitle');
			this.toggle(hide, 'Native status bar', 'The retro bar covers it anyway while it\u2019s on.', 'hideStatusBar');
			this.toggle(hide, 'Linked mentions',   'The list of links at the bottom of a note.',            'hideLinkedMentions');
			this.toggle(hide, 'Scroll bar',        'The editor scroll bar. The letterbox hides it '
				+ 'regardless \u2014 it runs straight past both masks.', 'hideScrollBar');
			this.toggle(hide, 'Ribbon',            'The strip of icons down the left.',               'hideRibbon');
			// The one thing in this list that belongs to this plugin rather
			// than to Obsidian. It sits here anyway: from the writer's side
			// "what does zen hide" is one question, and splitting it by whose
			// element each one is would be an implementation detail on
			// display. saveSettings(true) because the bar has to move now,
			// not on the next debounce.
			this.toggle(hide, 'Retro bar',         'The one this plugin draws.',
				'zenHideBar', () => this.plugin.saveSettings(true));
			if (this.plugin.settings.zenHideBar) {
				this.slider(this.sub(hide), 'Bring it back on hover',
					'Milliseconds it lingers after the pointer leaves the bottom of the '
						+ 'window. 0 never brings it back.',
					'barPeekMs', 0, 6000, 250);
			}

			this.label(z, 'Caret');
			this.slider(this.sub(z), 'Breathing room',
				'Pixels the caret keeps clear of the bar, the letterbox and the Vim '
					+ 'command line, top and bottom. Applies outside zen too.',
				'caretMarginPx', 0, 120, 2);

			this.label(z, 'Leaving');
			const leave = this.sub(z);
			this.toggle(leave, 'Escape exits zen',
				'With Vim keys on, only from Normal mode \\u2014 the first Escape is '
					+ 'still Vim\\u2019s, the second leaves zen.',
				'zenEscExits');

		}

		// Letterbox lives here rather than in a tab of its own: it is the
		// other half of the same idea — one hides the app around the text,
		// the other hides the text around the line you are writing.
		containerEl.createEl('hr', { cls: 'ws-settings-hr' });
	}
	// ── Typewriter tab ─────────────────────────────────────────────────────────
	displayTypewriterTab(containerEl) {
		new Setting(containerEl)
			.setName('Typewriter mode')
			.setDesc('Keeps the line you\u2019re writing in the middle of the screen.')
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
			this.toggle(tw, 'Highlight current line', 'Puts a soft tint behind whichever line you\u2019re on.', 'highlightCurrentLine', () => this.display());
			if (this.plugin.settings.highlightCurrentLine) {
				const hl = this.sub(tw);
				new Setting(hl).setName('Dark theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightDarkColor).onChange(async v => { this.plugin.settings.lineHighlightDarkColor = v; await this.plugin.saveSettings(); }));
				new Setting(hl).setName('Light theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightLightColor).onChange(async v => { this.plugin.settings.lineHighlightLightColor = v; await this.plugin.saveSettings(); }));
				this.slider(hl, 'Opacity', 'How strong that tint is.', 'lineHighlightOpacity', 0.05, 1, 0.05);
			}

			// ── Cursor position ─────────────────────────────────────────────────
			this.label(tw, 'Cursor position');
			tw.createEl('p', { text: 'How many lines of context to keep above/below the cursor. Equal values keep it dead-centre (the default).', cls: 'ws-settings-note' });
			const pos = this.sub(tw);
			this.numInput(pos, 'Lines above cursor', '', 'typewriterLinesAbove', 0, 40);
			this.numInput(pos, 'Lines below cursor', '', 'typewriterLinesBelow', 0, 40);

			// ── Focus dimming ────────────────────────────────────────────────────
			this.label(tw, 'Focus dimming');
			this.toggle(tw, 'Dim unfocused text', 'Fades everything outside the lines you\u2019re working on.', 'dimUnfocusedEnabled', () => this.display());
			if (this.plugin.settings.dimUnfocusedEnabled) {
				const dim = this.sub(tw);
				new Setting(dim).setName('Focus area')
					.addDropdown(d => d
						.addOption('paragraph', 'Paragraph')
						.addOption('sentence',  'Sentence')
						.setValue(this.plugin.settings.dimFocusMode || 'paragraph')
						.onChange(async v => { this.plugin.settings.dimFocusMode = v; await this.plugin.saveSettings(); }));
				this.slider(dim, 'Opacity', 'How much it fades.', 'dimOpacity', 0.05, 1, 0.05);
			}
		} else {
			containerEl.createEl('p', {
				text: 'The masks need typewriter mode switched on to work.',
				cls: 'ws-settings-note'
			});
		}
	}

	// ── Mask (arrows) tab ──────────────────────────────────────────────────────
	displayLetterboxSection(containerEl) {
		new Setting(containerEl)
			.setName('Letterbox')
			.setDesc('Dims the top and bottom of the screen so you only see what you\u2019re working on.')
			.addToggle(t => t.setValue(this.plugin.settings.enableLetterbox)
				.onChange(async v => {
					this.plugin.settings.enableLetterbox = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (this.plugin.settings.enableLetterbox) {
			const ls = this.sub(containerEl);

			new Setting(ls).setName('Mask height (px)').setDesc('Or just drag the edge of the mask itself.')
				.addSlider(s => s.setLimits(0, 400, 4)
					.setValue(this.plugin.settings.letterboxPx != null
						? Math.round(this.plugin.settings.letterboxPx)
						: (this.plugin.settings.letterboxLines || 8) * 26)
					.setDynamicTooltip()
					.onChange(async v => { this.plugin.settings.letterboxPx = v; await this.plugin.saveSettings(); }));

			this.slider(ls, 'Horizontal inset', 'Or drag the row of arrows itself.', 'maskPaddingH', 0, 400, 10);

			new Setting(ls).setName('Show arrows').setDesc('Little arrows along the edge of each mask.')
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
				this.numInput(as, 'Arrow count', '1–10 per row.', 'arrowCount', 1, 10);
				this.slider(as, 'Arrow scale', 'Bigger or smaller.', 'arrowScale', 0.5, 3, 0.1);
				this.toggle(as, 'Cap the line ends',
					'Puts an arrow on each end of the line.',
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
			this.slider(ls, 'Line weight', '1–8 px.', 'separatorWeight', 1, 8, 1);

			// Through renderArrowColors, not a second copy. There WAS a
			// second copy here — four pickers hand-written inline, while the
			// shared method sat with no callers at all — which is invariant
			// 19's exact failure mode, caught only because this block had to
			// be touched to add the toggle.
			this.label(ls, 'Colours');
			this.toggle(ls, 'Custom colours',
				'Leave this off and they borrow your theme\u2019s text colour.',
				'letterboxCustomColors', () => this.display());
			if (this.plugin.settings.letterboxCustomColors) {
				this.renderArrowColors(ls);
			}
		}
	}

	// ── Format reference ──────────────────────────────────────────────────────
	// The whole row grammar in one <details>, CLOSED by default. Structured
	// lines instead of one wrapped paragraph: the reference is scanned for
	// one thing at a time ("what was the fade syntax again"), and a code
	// column with a gloss beside it is what makes that scan possible. The
	// code half is monospace (styles.css) — the grammar is a little
	// language, and | :: {s} need their characters told apart.
	renderFormatReference(containerEl) {
		const box = containerEl.createEl('details', { cls: 'ws-token-help' });
		box.createEl('summary', { text: 'How to write a row \u2014 what you can put in, and how to colour it' });
		const H = (t) => box.createEl('p', { cls: 'ws-help-h', text: t });
		const L = (code, gloss) => {
			const row = box.createEl('div', { cls: 'ws-help-line' });
			if (code) row.createEl('span', { cls: 'ws-help-code', text: code });
			if (gloss) row.createEl('span', { cls: 'ws-help-gloss', text: gloss });
		};

		H('Readings \u2014 they update as you write');
		L('{file}', 'the note\u2019s name, or its folders too \u2014 you choose above');
		L('{words} {chars}', 'how much is in the note, or in your selection');
		L('{ln:col} {paragraph}', 'which line and column you\u2019re on; which paragraph of how many');
		L('{readtime}', 'how long the note takes to read');
		L('{backlinks}', 'how many other notes link to this one');
		L('{time} {clock}', 'the time, written out or drawn as a little dial');
		L('{dd} {mm} {yyyy} {yy}', 'the date, a piece at a time \u2014 join them however you like');
		L('{battery} {caps} {num}', 'battery; CAPS and NUM, which show only when they\u2019re on');
		L('{vim} {mode}', 'which Vim mode you\u2019re in; a button to switch editing mode');
		L('{obsidian}', 'a small Obsidian crystal, in whatever colour the segment is');

		H('Headings \u2014 where you are in the note');
		L('{#} {##} {###}', 'the heading above your cursor, at that level');
		L('{####} {#####} {######}', 'and the three deeper ones');
		L('{#>}', 'the whole path: Chapter \u203a Scene \u203a Beat');
		L('', 'Each heading clears the ones below it, so you always get one');
		L('', 'path down the note. Empty above the first heading, and empty');
		L('', 'at any level your cursor isn\u2019t inside.');

		H('Buttons \u2014 you can click these, and they never get dropped');
		L('{syntax} {prose} {markers} {font} {report} {history}');

		H('Spacers');
		L('{s} {ss} {sss}\u2026', 'blank space \u2014 a quarter of a space for each s');
		L('{s}:N', 'the same, but filled with colour N \u2014 a sliver beside a segment');

		H('Dividers \u2014 the character you type is the shape you get');
		L('>  <  |  )  (  ~  /  \\', 'arrow, straight line, curve, wave, and two slanted cuts');
		L('\\|', 'a backslash first gives you a real | in the text');
		L('<{file} \u2026 {words}>', 'at the very start or end, < and > point outwards');

		H('Colouring one segment');
		L('{words}:N', 'background colour N (1\u2013' + PL_BG_COUNT + ' \u2014 higher numbers start again at 1)');
		L('{words}:N;M', 'add ;M to pick the text colour too (1\u2013' + PL_TEXT_COUNT + ')');
		L('', 'Leave the ; off and the text picks itself, light or dark,');
		L('', 'so it stays readable on whatever background you chose.');
		L('{words};vim', 'the text takes the colour of the Vim mode you\u2019re in');
		L('{ln:col}:vim', 'the background does \u2014 a {vim} segment already does this');
		L('{file}:b1   {file}:b2', 'your theme\u2019s page and panel colours \u2014 a segment that');
		L('', 'blends into the bar instead of standing out from it');
		L('{file};t1  {file};t2', 'and your theme\u2019s normal and faded text, to match');

		H('Colouring the bar itself \u2014 put this first, in row 1\u2019s left slot');
		L(':b1 :b2 :N :vim', 'the bar\u2019s background: a theme colour, one of yours, or the Vim mode');
		L(';t1 ;t2 ;N ;vim', 'and its text, the same four ways');
		L(':3;2 {file}\u2026', 'both together. Leave the ; off and the text picks itself.');

		H('Fades \u2014 a colour stepping into the next, written with {g}');
		L('| {g}{g}{g} |', 'steps between the colours either side of it');
		L('', 'One step per {g}: {g}{g}{g} is three narrow ones,');
		L('', '{ggg} is one wide one.');
		L('\u2026 | {g}{g}', 'at the end of a group it fades out into the bar');
		L('> {g}>{g}>{g} >', 'dividers in the middle of a fade keep their shape \u2014 arrows,');
		L('', 'curves, waves or cuts, cut out of one continuous fade');

		H('Marks inside a segment \u2014 drawn in that segment\u2019s own colour');
		L('::', 'a short thin line');
		L('>>  <<', 'tall chevrons, at the same angle as the arrows');

		H('Two rows to copy and pull apart');
		L(':vim {vim} > {file} :: {ln:col}');
		L('{file}:3 | {g}{g}{g}{g} | {words}:5 ) {readtime}');
	}

	// ── Retro Bar tab ──────────────────────────────────────────────────────────
	displayRetroBarTab(containerEl) {
		new Setting(containerEl)
			.setName('Retro status bar')
			.setDesc('Swaps Obsidian\u2019s status bar for one you put together yourself.')
			.addToggle(t => t.setValue(this.plugin.settings.enableRetroStatus)
				.onChange(async v => {
					this.plugin.settings.enableRetroStatus = v;
					this.plugin.updateStatusBar();
					this.plugin.updateRetroStatusBar();
					// The `true` is the fix for the native bar never returning:
					// without the full refresh, the inline display:none that
					// hides Obsidian's own status bar was never lifted.
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (this.plugin.settings.enableRetroStatus) {
			const rb = this.sub(containerEl);

			this.renderBarPresets(rb);

			this.label(rb, 'Powerline');
			const s0 = this.plugin.settings;
			new Setting(rb)
				.setName('Powerline segments')
				.setDesc('Draws each group as a coloured block, with a shaped join between them.')
				.addToggle(t => t.setValue(s0.powerlineEnabled)
					.onChange(async v => {
						s0.powerlineEnabled = v;
						await this.plugin.saveSettings(true);
						this.display();
					}));
			if (s0.powerlineEnabled) {
				const pw = this.sub(rb);
				this.toggle(pw, 'Follow the Vim mode',
					'Recolour the {vim} segment as the mode changes. The five colours are below.',
					'powerlineModeColors', () => this.plugin.saveSettings(true));

				this.label(pw, 'Segment colours');
				this.renderPowerlineColors(this.sub(pw));
				// The divider/colour grammar lives in the Format reference
				// below, NOT here: this block only renders while powerline
				// is on, and keeping half the grammar inside it meant the
				// reference lost that half whenever the toggle was off.
				pw.createEl('p', {
					text: 'Everything about writing rows \u2014 dividers, colours, fades \u2014 is under '
						+ '\u201CFormat reference\u201D further down.',
					cls: 'ws-settings-note'
				});
			}

			this.label(rb, 'Format');
			// ── Format reference ──────────────────────────────────────────
			// One collapsible block, CLOSED by default. The grammar is a
			// page of material; as a paragraph it was one wrapped line
			// nobody could scan, and open by default it buried the fields
			// it documents. Everything lives here — including the divider
			// and colour grammar that used to sit in the powerline block,
			// which only rendered while powerline was on, so half the
			// reference vanished with the toggle.
			this.renderFormatReference(rb);
			const rows = this.plugin.getStatusRows();
			// No per-slot descriptions: three rows reading "aligned to the
			// left/centre/right edge" is one fact stated three times, and it
			// is already carried by the names. The note above the group says
			// what a slot is; the fields say where.
			const SLOTS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
			rows.forEach((row, i) => {
				if (rows.length > 1) this.label(rb, 'Row ' + (i + 1));
				const fmt = this.sub(rb);
				SLOTS.forEach(slot => {
					// ws-row-fmt: the control takes the row's spare width
					// and the input fills it (styles.css). A format string
					// is a whole powerline row; the default ~180px control
					// showed a third of one.
					const st = new Setting(fmt).setName(slot[1])
						.addText(t => t.setPlaceholder('e.g. {file}')
							.setValue(row[slot[0]])
							.onChange(async v => {
								this.plugin.settings.statusRows[i][slot[0]] = v;
								await this.plugin.saveSettings();
							}));
					st.settingEl.addClass('ws-row-fmt');
				});
			});
			// ── Appearance ────────────────────────────────────────────────
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Appearance');
			const ap = this.sub(rb);
			// The ranges are not repeated in the descriptions: the slider
			// shows its value on drag, and "8-24 px" told the writer nothing
			// they could not see. What each one moves is the useful part.
			this.toggle(ap, 'Match the note\u2019s text size',
				'The bar follows the editor\u2019s font size \u2014 Ctrl+scroll zoom included \u2014 '
					+ 'so the whole view stays homogeneous. Raise Row height if you zoom large.',
				'statusBarFontFollowNote', () => {
					// Both application sites restamped immediately: the var
					// reference in applyCssVariables and the inline size the
					// fit pass pins. Then re-render, so the slider below
					// appears or goes with the choice it defers to.
					if (this.plugin.applyCssVariables) this.plugin.applyCssVariables();
					if (this.plugin.fitStatusBarText) this.plugin.fitStatusBarText();
					this.display();
				});
			if (!s0.statusBarFontFollowNote) {
				this.slider(ap, 'Font size', 'Text size for the whole bar.',
					'statusBarFontSize', 8, 24, 1);
			}
			this.slider(ap, 'Row height', 'How tall one row is.',
				'statusBarHeight', 12, 30, 1);
			this.slider(ap, 'Space above', 'Gap above the first row.',
				'statusBarPadTop', 0, 24, 1);
			this.slider(ap, 'Space below', 'Gap below the last row.',
				'statusBarPadBottom', 0, 24, 1);

			this.label(ap, 'Borders');
			const bd = this.sub(ap);
			bd.createEl('p', {
				text: 'A line along the top and bottom of the bar. You can switch either edge off '
					+ 'on its own, but the style and thickness apply to both.',
				cls: 'ws-settings-note'
			});
			this.toggle(bd, 'Top rule', 'A line across the top.',
				'statusBarBorderTop', () => this.plugin.saveSettings(true));
			this.toggle(bd, 'Bottom rule', 'And one across the bottom.',
				'statusBarBorderBottom', () => this.plugin.saveSettings(true));
			new Setting(bd).setName('Line style').setDesc('Pick \u201cNone\u201d to drop both edges at once.')
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
				this.slider(bd, 'Line weight', 'How thick those lines are.',
					'statusBarBorderWidth', 1, 8, 1);
			}


			// The {vim} token's labels and colours. Bar presentation, so
			// they live here rather than in the Vim tab.
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.renderVimModeLabels(rb);

			// ── Token formats ─────────────────────────────────────────────
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Token formats');
			const tf = this.sub(rb);
			new Setting(tf).setName('{file}').setDesc('Just the name, or the folders it sits in as well.')
				.addDropdown(d => d
					.addOption('path', 'Full path  ~/folder/note')
					.addOption('name', 'File name only  note')
					.setValue(this.plugin.settings.fileTokenFormat || 'path')
					.onChange(async v => {
						this.plugin.settings.fileTokenFormat = v;
						await this.plugin.saveSettings();
						this.plugin.updateRetroStatusBar();
					}));

			const df = this.sub(tf);
			df.createEl('p', {
				text: 'Dates have no format setting \u2014 write the parts you want in a row, '
					+ 'with any separator.\n'
					+ '{dd} {mm} {yyyy} {yy}\n'
					+ 'Examples:  {dd}/{mm}/{yyyy}   {yyyy}-{mm}-{dd}   {dd}.{mm}.{yy}',
				cls: 'ws-settings-note'
			});

			// ── Colours ───────────────────────────────────────────────────
			// Last, and at group level: sitting mid-tab with an expanding
			// toggle, everything after it read as nested underneath.
			rb.createEl('hr', { cls: 'ws-settings-hr' });
			this.label(rb, 'Colours');
			rb.createEl('p', {
				text: 'Every colour here comes in a dark and a light version, and Word-Smith '
					+ 'swaps between them when your theme does.',
				cls: 'ws-settings-note'
			});

			this.toggle(rb, 'Custom bar colours',
				'Choose the bar\u2019s background and text yourself. Off, it follows your theme.',
				'retroCustomColors', () => this.display());
			if (this.plugin.settings.retroCustomColors) this.renderBarThemeColors(rb);
		}
	}

	// ── Bar presets ──────────────────────────────────────────────────────────
	// Sits directly under the master toggle, above everything it can change,
	// so the panel reads as "pick a bar, or build one below".
	renderBarPresets(containerEl) {
		const plugin = this.plugin;
		this.label(containerEl, 'Presets');
		const box = this.sub(containerEl);

		// Held on the plugin, not in a local: display() rebuilds this whole
		// panel on every change, so a local would lose what has been typed
		// the moment anything else on the page redraws.
		if (plugin._pendingBarPresetName === undefined) plugin._pendingBarPresetName = '';

		new Setting(box)
			.setName('Save this bar as a preset')
			.setDesc('Give it a name and press Save. Same name again replaces the old one.')
			.addText(t => {
				t.setPlaceholder('My bar');
				t.setValue(plugin._pendingBarPresetName);
				t.onChange(v => { plugin._pendingBarPresetName = v; });
			})
			.addButton(b => {
				b.setButtonText('Save').setCta();
				b.onClick(async () => {
					const name = (plugin._pendingBarPresetName || '').trim();
					if (!name) {
						b.setButtonText('Name it first');
						setTimeout(() => b.setButtonText('Save'), 1600);
						return;
					}
					await plugin.saveBarPreset(name);
					this.display();
				});
			});

		let importCode = '';
		new Setting(box)
			.setName('Import a preset')
			.setDesc('Paste a code someone sent you. It just joins the list below \u2014 nothing '
				+ 'changes until you press Load.')
			.addText(t => {
				t.setPlaceholder('Paste code here\u2026');
				t.onChange(v => { importCode = v.trim(); });
				t.inputEl.addClass('ws-preset-import');
			})
			.addButton(b => {
				b.setButtonText('Import').onClick(async () => {
					if (!importCode) return;
					const added = await plugin.importBarPreset(importCode);
					if (added) {
						this.display();
					} else {
						b.setButtonText('Invalid code');
						setTimeout(() => b.setButtonText('Import'), 2000);
					}
				});
			});

		const presets = plugin.getBarPresets();
		const names = Object.keys(presets);
		if (names.length === 0) {
			box.createEl('p', {
				text: 'Nothing saved yet. Build a bar below, then save it up here.',
				cls: 'ws-settings-note'
			});
			return;
		}
		for (const name of names) this.renderBarPresetRow(box, name, presets[name]);
	}

	// Apply a preset and leave the panel describing it: the settings below
	// become the preset's, and the name box above becomes its name, so Save
	// updates this entry rather than creating a near-duplicate.
	//
	// Its own method because two buttons need it and they drifted once
	// already — Load applied the preset without the name, which is the half
	// that is invisible until the writer saves.
	async loadPresetIntoPanel(name) {
		await this.plugin.loadBarPreset(name);
		this.plugin._pendingBarPresetName = name;
		this.display();
	}

	// name · code · copy · load · edit · delete, on one row.
	renderBarPresetRow(containerEl, name, snap) {
		const plugin = this.plugin;
		const code = barPresetToCode(name, snap);
		const setting = new Setting(containerEl).setName(name);

		// The code is shown rather than hidden behind the Copy button so it is
		// obvious there IS one to share, and it is selectable (user-select:
		// all) so it can be dragged out by hand where the clipboard API is
		// unavailable — which it is in some Electron/Wayland setups, and the
		// failure there is silent.
		const codeEl = setting.controlEl.createEl('code', {
			text: code, cls: 'ws-preset-code'
		});
		codeEl.title = code;

		const copyBtn = setting.controlEl.createEl('button', {
			text: 'Copy', cls: 'ws-preset-copy'
		});
		copyBtn.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(code);
				copyBtn.textContent = 'Copied';
			} catch (_) {
				// Say so rather than showing "Copied" over a clipboard that
				// never received anything; the code is selectable beside it.
				copyBtn.textContent = 'Select it';
			}
			setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
		});

		setting
			// Load fills the name box as well as applying the preset. Without
			// it the box keeps whatever was typed last, so the obvious next
			// action — tweak something below, press Save — silently wrote a
			// second copy under the old name instead of updating the one just
			// loaded.
			// Both go through loadPresetIntoPanel, which is what keeps the
			// name box in step. Load used to skip that: the box kept
			// whatever was typed last, so the obvious next action — tweak
			// something below, press Save — wrote a second copy under the
			// old name instead of updating the one just loaded.
			.addButton(b => b.setButtonText('Load').onClick(async () => {
				await this.loadPresetIntoPanel(name);
			}))
			// Edit is Load plus putting the name box back in view. There is
			// no separate editing surface: the whole tab below IS the editor,
			// and the Save that commits the change is at the top, which is
			// where a long preset list has just scrolled away from.
			.addButton(b => b.setButtonText('Edit').onClick(async () => {
				await this.loadPresetIntoPanel(name);
				this.scrollPanelToTop();
			}))
			.addButton(b => b.setButtonText('Delete').setWarning().onClick(async () => {
				await plugin.deleteBarPreset(name);
				if (plugin._pendingBarPresetName === name) plugin._pendingBarPresetName = '';
				this.display();
			}));

		return setting;
	}

	// ── Vim mode labels ──────────────────────────────────────────────────────
	// Lives in the Retro Bar tab, not the Vim tab: these set how the {vim}
	// token renders and what colour a :vim segment takes, which is bar
	// presentation. The Vim tab keeps what actually changes editing (the
	// soft-wrap motion mapping).
	renderVimModeLabels(containerEl) {
		this.label(containerEl, 'Vim mode labels');
		const vl = this.sub(containerEl);
		vl.createEl('p', {
			text: 'How {vim} renders each mode \u2014 \u201cNORMAL\u201d, \u201cN\u201d, an icon, whatever reads.\n'
				+ 'The two swatches \u2014 dark theme, then light \u2014 paint any segment\n'
				+ 'suffixed :vim, and the {vim} block when mode colours are on.',
			cls: 'ws-settings-note'
		});
		const cs = this.plugin.cursorSmithSettings();
		if (cs && cs.vimModeEnabled && this.plugin.settings.vimFollowCursorSmith !== false) {
			vl.createEl('p', {
				text: 'Cursor-Smith is picking these at the moment. Switch it off below to choose your own.',
				cls: 'ws-settings-note'
			});
		}
		this.toggle(vl, 'Follow Cursor-Smith',
			'Borrow its caret colours instead of picking the five below.',
			'vimFollowCursorSmith', () => this.plugin.saveSettings(true));

		for (const [key, name, dflt, colorKey] of [
			['vimLabelNormal',  'Normal',  '-- NORMAL --', 'vimColorNormal'],
			['vimLabelInsert',  'Insert',  '-- INSERT --', 'vimColorInsert'],
			['vimLabelVisual',  'Visual',  '-- VISUAL --', 'vimColorVisual'],
			['vimLabelReplace', 'Replace', '-- REPLACE --', 'vimColorReplace'],
			['vimLabelCommand', 'Command', '-- COMMAND --', 'vimColorCommand']
		]) {
			// Two swatches, dark then light, in the order the colour rows
			// above use. Kept on the mode's own row rather than split into a
			// second list: the question is "what does this mode look like",
			// and answering half of it ten rows away is worse than a row
			// with three controls on it.
			// Label and colour on one row: they are two halves of the same
			// answer to "what does this mode look like", and splitting them
			// into two lists would mean scrolling between them to compare.
			const swatch = (row, k) => row.addColorPicker(cp => cp
				.setValue(this.plugin.settings[k] || DEFAULT_SETTINGS[k])
				.onChange(async v => {
					this.plugin.settings[k] = v;
					await this.plugin.saveSettings(true);
				}));
			const modeRow = new Setting(vl).setName(name);
			swatch(modeRow, colorKey);
			swatch(modeRow, colorKey + 'Light');
			modeRow
				.addText(t => t
					.setPlaceholder(dflt)
					.setValue(this.plugin.settings[key] != null ? String(this.plugin.settings[key]) : dflt)
					.onChange(async v => {
						this.plugin.settings[key] = v;
						await this.plugin.saveSettings(true);
					}));
		}
	}

	// ── Shared colour blocks ─────────────────────────────────────────────────
	// Kept as methods rather than inlined into their owning tabs. They used
	// to render in two places (the owning tab and the removed Presets tab);
	// the method form is still the right shape — anything that ever shows a
	// colour group in a second place gets it from here, never as a copy.

	// Background and text on ONE row per theme. They are read together —
	// the question is always "does this pair have contrast", never "what is
	// the background alone" — and two swatches side by side answer that at
	// a glance, where two stacked rows made you look twice. Halves the
	// height of every colour block too, which is most of what made this tab
	// scroll.
	bgTextRow(root, name, desc, bgKey, textKey) {
		const row = new Setting(root).setName(name);
		if (desc) row.setDesc(desc);
		row.settingEl.addClass('zg-color-row');
		row.settingEl.addClass('zg-color-pair');
		for (const key of [bgKey, textKey]) {
			row.addColorPicker(cp => cp.setValue(this.plugin.settings[key] || DEFAULT_SETTINGS[key])
				.onChange(async v => { this.plugin.settings[key] = v; await this.plugin.saveSettings(true); }));
		}
		row.addExtraButton(b => b.setIcon('rotate-ccw').setTooltip('Reset both')
			.onClick(async () => {
				this.plugin.settings[bgKey]   = DEFAULT_SETTINGS[bgKey];
				this.plugin.settings[textKey] = DEFAULT_SETTINGS[textKey];
				await this.plugin.saveSettings(true);
				this.display();
			}));
		return row;
	}

	renderBarThemeColors(root) {
		const b = this.sub(root);
		b.createEl('p', { text: 'Background first, then text \u2014 same order as the label.',
			cls: 'ws-settings-note' });
		this.bgTextRow(b, 'Dark theme',  '', 'retroDarkBgColor',  'retroDarkTextColor');
		this.bgTextRow(b, 'Light theme', '', 'retroLightBgColor', 'retroLightTextColor');
	}


	renderArrowColors(root) {
		const pick = (c, name, key) => new Setting(c).setName(name)
			.addColorPicker(cp => cp.setValue(this.plugin.settings[key])
				.onChange(async v => { this.plugin.settings[key] = v; await this.plugin.saveSettings(); }));
		this.label(root, 'Arrows and separator lines');
		const a = this.sub(root);
		a.createEl('p', {
			text: 'Each one has a dark and a light version. Word-Smith swaps with your theme.',
			cls: 'ws-settings-note'
		});
		pick(a, 'Arrows \u2014 dark theme',  'arrowDarkColor');
		pick(a, 'Arrows \u2014 light theme', 'arrowLightColor');
		pick(a, 'Lines \u2014 dark theme',   'lineDarkColor');
		pick(a, 'Lines \u2014 light theme',  'lineLightColor');
	}

	// The six-swatch rows, plus the vim mode colours the :vim suffix reads.
	renderPowerlineColors(root) {
		const s0 = this.plugin.settings;
		// Counts differ by row and are read from PL_SWATCH_COUNTS rather
		// than hardcoded here, so the pickers, the runtime lookup and the
		// help text cannot disagree about how many there are.
		const swatchRow = (name, desc, prefix, count) => {
			const row = new Setting(root).setName(name).setDesc(desc);
			row.settingEl.addClass('zg-color-row');
			for (let n = 1; n <= count; n++) {
				const key = prefix + n;
				row.addColorPicker(cp => cp.setValue(s0[key] || DEFAULT_SETTINGS[key])
					.onChange(async v => { s0[key] = v; await this.plugin.saveSettings(true); }));
			}
		};
		root.createEl('p', {
			text: 'Each slot has a dark swatch and a light one. Word-Smith picks whichever suits '
				+ 'your theme, so the same row reads properly either way.',
			cls: 'ws-settings-note'
		});
		// Dark first in both pairs, because the dark set is the original —
		// its keys, values and BAR_KEYS indices are the ones share codes
		// already carry, and reading the panel top to bottom in that order
		// keeps the panel and the wire format telling the same story.
		swatchRow('Backgrounds \u2014 dark theme',
			'1\u2013' + PL_BG_COUNT + ', written as :N after a token.',
			'powerlineColor', PL_BG_COUNT);
		swatchRow('Backgrounds \u2014 light theme', '', 'powerlineColorLight', PL_BG_COUNT);
		swatchRow('Text \u2014 dark theme',
			'1\u2013' + PL_TEXT_COUNT + ', written as ;N after the background.',
			'powerlineText', PL_TEXT_COUNT);
		swatchRow('Text \u2014 light theme', '', 'powerlineTextLight', PL_TEXT_COUNT);
		// The five vim mode swatches used to sit here as a bare row of
		// pickers. They are set in the Retro Bar tab's mode-label block,
		// beside the label each one colours and with its text box — one
		// place, with the context that makes a colour choice meaningful.
	}

	// ── Goals tab ────────────────────────────────────────────────────────────
	displayGoalsTab(containerEl) {
		containerEl.createEl('p', {
			text: 'Give a note or a folder a word count to aim for. You\u2019ll see how close you '
				+ 'are on the bar and in the report.',
			cls: 'ws-settings-note'
		});

		// FIRST, not last. It is the thing this tab is FOR — the targets below
		// are how you configure it — and it had been sitting under a screen of
		// configuration, which is the wrong way round for the one control here
		// that a writer presses daily rather than once.
		new Setting(containerEl).setName('Report')
			.setDesc('Word and character counts, reading level, and how your goals are going.')
			.addButton(b => b.setButtonText('Open report')
				.onClick(() => this.plugin.openReportModal()));

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		this.label(containerEl, 'Targets');
		const g = this.sub(containerEl);
		this.renderGoalList(g, 'file',   'File goals',   'Add note');
		this.renderGoalList(g, 'folder', 'Folder goals', 'Add folder');

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });
		this.renderCountExclude(containerEl, 'every folder total');

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });
		this.label(containerEl, 'Recommended use');
		const rec = this.sub(containerEl);
		rec.createEl('p', {
			text: 'A folder goal counts everything inside it, however deep. So if your book is '
				+ 'folders inside folders, you can set a target at every level at once.',
			cls: 'ws-settings-note'
		});
		const eg = rec.createEl('ul', { cls: 'ws-settings-note zg-goal-eg' });
		[
			['My Book/', '90,000 \u2014 the whole thing. The only number that says whether you\u2019re done.'],
			['My Book/Part One/', '30,000 \u2014 a part. This is the one that warns you it\u2019s bloating.'],
			['My Book/Part One/Ch 03/', '4,000 \u2014 a chapter. Small enough to finish in a sitting or two.'],
			['My Book/Part One/Ch 03/Scene 2.md', '900 \u2014 a single note, for a scene you can already see.']
		].forEach(([path, why]) => {
			const li = eg.createEl('li');
			li.createEl('code', { text: path });
			li.createSpan({ text: ' \u2014 ' + why });
		});
		rec.createEl('p', {
			text: 'Open the report on any note and the Folder tab lets you step up the chain \u2014 '
				+ 'scene, chapter, part, book \u2014 so you can check the chapter and the whole '
				+ 'book without changing a thing.',
			cls: 'ws-settings-note'
		});
		rec.createEl('p', {
			text: 'Two things worth knowing. Set the big target first and add the smaller ones as '
				+ 'you get to them \u2014 a chapter target you invent before the chapter exists is '
				+ 'just a guess you\u2019ll end up writing towards. And move your files about as '
				+ 'much as you like: goals follow them, along with anything inside.',
			cls: 'ws-settings-note'
		});

	}

	// ── History tab ───────────────────────────────────────────────────────────
	// Its own tab rather than a section under Goals: it carries a store
	// that lives in the vault, a path, and a delete, which is more than a
	// heading inside somebody else's tab can hold legibly.
	displayHistoryTab(containerEl) {
		const s = this.plugin.settings;

		containerEl.createEl('p', {
			text: 'Word-Smith can keep count of how much you write each day. '
				+ 'Words you added go above the line, words you cut go below it.',
			cls: 'ws-settings-note'
		});

		new Setting(containerEl).setName('Writing history')
			.setDesc('See your writing day by day, month by month, or year by year.')
			.addButton(b => b.setButtonText('Open history')
				.onClick(() => this.plugin.openHistoryModal()));

		containerEl.createEl('p', {
			text: 'Tip: put {history} in a retro bar row and you get a button that opens this.',
			cls: 'ws-settings-note'
		});

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		new Setting(containerEl).setName('Track writing history')
			.setDesc('Counts only \u2014 never a word of what you wrote. It all stays on your '
				+ 'machine. There\u2019s no way to work out what you did before today, so the '
				+ 'record starts the moment you switch this on.')
			.addToggle(t => t.setValue(s.historyTracking)
				.onChange(async v => {
					s.historyTracking = v;
					await this.plugin.saveSettings();
					// Find or create the file now, so the pane can say where
					// it is instead of "not created yet" until the next save.
					if (v) { await this.plugin.historyLoad(); await this.plugin.historyWrite(true); }
					this.display();
				}));

		if (!s.historyTracking) return;

		const hs = this.sub(containerEl);
		this.toggle(hs, 'Remember which notes',
			'Also records which note each day\u2019s words happened in, so you can search '
			+ 'your history for one note or one folder. Still counts only \u2014 never a word '
			+ 'of what you wrote. Switch it off and the note names already recorded are '
			+ 'dropped, the search box has nothing to find, and the file stops growing with '
			+ 'the notes you touch. Your daily totals are untouched either way.',
			'historyPerFile');

		hs.createEl('p', {
			text: 'A note\u2019s history belongs to the note, so moving or renaming one takes '
				+ 'all of it along \u2014 including the part written before the move. Search a '
				+ 'folder and you get what is in it now, not what was in it at the time.',
			cls: 'ws-settings-note'
		});

		this.renderCountExclude(hs, 'the history');

		hs.createEl('p', {
			text: 'Counts the same notes the rest of the plugin works on \u2014 whatever you set '
				+ 'under \u201cWhere Word-Smith applies\u201d.',
			cls: 'ws-settings-note'
		});

		this.numInput(hs, 'Daily goal',
			'How many words a day you\u2019re aiming for. Draws a line across the chart, and '
			+ 'sets off fireworks on the days you beat it. Leave it at 0 for neither.',
			'historyDailyGoal', 0, 100000);

		// ── The file ─────────────────────────────────────────────────────────
		this.label(hs, 'Where it lives');
		hs.createEl('p', {
			text: 'Your history is an ordinary note in your vault, not something hidden away. '
				+ 'Move it, rename it, keep it next to the book \u2014 Word-Smith will still find '
				+ 'it. It\u2019s the only copy, so hang on to it.',
			cls: 'ws-settings-note'
		});

		const where = this.plugin.historyStorePath();
		new Setting(hs).setName('History file')
			.setDesc(where
				? 'Right now it\u2019s at: ' + where
				: 'Not made yet \u2014 it\u2019ll appear the first time you write something.')
			.addText(t => {
				t.inputEl.addClass('ws-row-fmt');
				t.setValue(s.historyFilePath || 'history.md')
					.onChange(async v => {
						s.historyFilePath = v;
						await this.plugin.saveSettings();
					});
			});
		hs.createEl('p', {
			text: 'This is only where the file gets made if you don\u2019t have one yet. If it '
				+ 'already exists, Word-Smith finds it wherever you\u2019ve put it.',
			cls: 'ws-settings-note'
		});

		hs.createEl('p', {
			text: 'It saves itself whenever you take a break, and again when you close Obsidian. '
				+ 'Move it and it\u2019ll be found again on its own.',
			cls: 'ws-settings-note'
		});

		// ── Deleting it ──────────────────────────────────────────────────────
		// Opt-in data the user chose to create is data the user can destroy,
		// and the button says exactly what it will not touch.
		new Setting(hs).setName('Delete all history')
			.setDesc('Wipes every day on record, here and in the file. There\u2019s no second '
				+ 'copy and no undo.')
			.addButton(b => {
				b.setButtonText('Delete').setWarning();
				b.onClick(async () => {
					if (this._histArmed) {
						window.clearTimeout(this._histArmed);
						this._histArmed = null;
						await this.plugin.historyClear();
						new Notice('Word-Smith: writing history deleted.');
						this.display();
						return;
					}
					b.setButtonText('Really delete?');
					// Disarms itself, so a button left armed on a settings pane
					// nobody closed cannot be pressed by accident an hour later.
					this._histArmed = window.setTimeout(() => {
						this._histArmed = null;
						try { b.setButtonText('Delete'); } catch (_) {}
					}, 5000);
				});
			});
	}

	// ── Syntax tab ────────────────────────────────────────────────────────────
	displaySyntaxTab(containerEl) {
		const s = this.plugin.settings;

		containerEl.createEl('p', {
			text: 'Gives nouns, verbs and the rest their own colour. It all happens on your '
				+ 'machine, and it\u2019s guesswork \u2014 so treat a mark as a nudge, not a verdict.',
			cls: 'ws-settings-note'
		});

		this.toggle(containerEl, 'Skip code and math',
			'Leaves code, frontmatter and maths alone.',
			'syntaxSkipCode');

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// ── Word classes ──────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Syntax highlight')
			.setDesc('Gives nouns, verbs and the rest their own colour.')
			.addToggle(t => t.setValue(s.posEnabled)
				.onChange(async v => {
					s.posEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (s.posEnabled) {
			const ps = this.sub(containerEl);

			new Setting(ps).setName('Display style')
				.setDesc('How a marked word looks.')
				.addDropdown(d => d
					.addOption('text',      'Coloured text')
					.addOption('highlight', 'Highlight')
					.addOption('squiggle',  'Squiggle')
					.addOption('line',      'Underline')
					.setValue(s.syntaxStyle || 'text')
					.onChange(async v => { s.syntaxStyle = v; await this.plugin.saveSettings(); }));

			ps.createEl('p', {
				text: 'One at a time reads best. All of them at once is a rainbow.',
				cls: 'ws-settings-note'
			});
			this.catRow(ps, 'Nouns',        'Nouns and pronouns.',                  'posNoun',        'posNounColor');
			this.catRow(ps, 'Verbs',        'Verbs, auxiliaries and modals.',       'posVerb',        'posVerbColor');
			this.catRow(ps, 'Adverbs',      'All adverbs, including not and very.', 'posAdverb',      'posAdverbColor');
			this.catRow(ps, 'Adjectives',   'Adjectives. Articles are excluded.',   'posAdjective',   'posAdjectiveColor');
			this.catRow(ps, 'Conjunctions', 'Conjunctions and prepositions.',       'posConjunction', 'posConjunctionColor');
			this.toggle(ps, 'Mute everything else',
				'Fades everything you didn\u2019t tick.', 'posDimOthers');
		}

	}

	// ── Writing Checks tab ───────────────────────────────────────────────────
	displayChecksTab(containerEl) {
		const s = this.plugin.settings;

		// The same promise the Syntax tab makes, and for the same reason: both
		// tabs read your prose and mark it up, and a reader has every right to
		// wonder where that text is going. It is going nowhere.
		containerEl.createEl('p', {
			text: 'Marks patterns worth a second look \u2014 filler, passive voice, repetition. '
				+ 'It all happens on your machine; nothing is sent anywhere. And it\u2019s '
				+ 'guesswork, so treat a mark as a nudge, not a verdict.',
			cls: 'ws-settings-note'
		});

		// ── Writing checks ────────────────────────────────────────────────────
		new Setting(containerEl)
			.setName('Prose checks')
			.setDesc('Things worth a second look \u2014 not mistakes.')
			.addToggle(t => t.setValue(s.checksEnabled)
				.onChange(async v => {
					s.checksEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (!s.checksEnabled) return;

		const ck = this.sub(containerEl);
		new Setting(ck).setName('Display style')
			.setDesc('Set on its own, separately from the word colours.')
			.addDropdown(d => d
				.addOption('squiggle',  'Squiggle')
				.addOption('line',      'Underline')
				.addOption('highlight', 'Highlight')
				.addOption('text',      'Coloured text')
				.setValue(s.checkStyle || 'squiggle')
				.onChange(async v => { s.checkStyle = v; await this.plugin.saveSettings(); }));

		new Setting(ck).setName('Filler words')
			.setDesc('Words like very, really, basically, \u201ckind of\u201d.')
			.addColorPicker(cp => cp.setValue(s.checkFillerColor)
				.onChange(async v => { s.checkFillerColor = v; await this.plugin.saveSettings(); }))
			.addToggle(t => t.setValue(s.checkFiller)
				.onChange(async v => { s.checkFiller = v; await this.plugin.saveSettings(true); this.display(); }));
		if (s.checkFiller) {
			const fl = this.sub(ck);
			new Setting(fl).setName('Also flag vague quantifiers')
				.setDesc('Also many, most, some, often. Stricter, and it will flag more.')
				.addToggle(t => t.setValue(!!s.checkFillerSoft)
					.onChange(async v => { s.checkFillerSoft = v; await this.plugin.saveSettings(true); }));
		}
		this.catRow(ck, 'Passive voice',
			'"was written", "is being considered".',
			'checkPassive', 'checkPassiveColor');
		this.catRow(ck, 'Loose pronouns',
			'A sentence opening with an unclear it or this.',
			'checkPronoun', 'checkPronounColor');

		this.catRow(ck, 'Repetition radar',
			'The same uncommon word twice, close together.',
			'checkRepetition', 'checkRepetitionColor');
		if (s.checkRepetition) {
			const rp = this.sub(ck);
			this.slider(rp, 'Window', 'How far apart two words can be and still count as a repeat.', 'repetitionWindow', 15, 150, 5);
			this.slider(rp, 'Minimum length', 'Skips words shorter than this.', 'repetitionMinLength', 3, 10, 1);
		}

		this.catRow(ck, 'Commonly misused',
			'affect/effect, its/it\u2019s, fewer/less.',
			'checkMisused', 'checkMisusedColor');


		this.catRow(ck, 'Lexical illusions',
			'The same word twice in a row.',
			'checkIllusion', 'checkIllusionColor');

		new Setting(ck).setName('Sentence rhythm')
			.setDesc('Shades each sentence by how hard it is to read.')
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


		ck.createEl('p', {
			text: 'Tip: add {report} to your retro bar to get at the full counts.',
			cls: 'ws-settings-note'
		});
	}

	// ── Hemingway tab (write-forward lock) ────────────────────────────────────
	displayHemingwayTab(containerEl) {
		const s = this.plugin.settings;

		containerEl.createEl('p', {
			text: 'Blocks the keys you\u2019d use to go back and fiddle, so a first draft can only '
				+ 'move forward. Switch it off here or with the command.',
			cls: 'ws-settings-note'
		});

		new Setting(containerEl)
			.setName('Hemingway mode')
			.setDesc('Stops you going back, so a first draft can only move forward.')
			.addToggle(t => t.setValue(s.hemingwayEnabled)
				.onChange(async v => {
					s.hemingwayEnabled = v;
					await this.plugin.saveSettings(true);   // a lock should land now, not in 120ms
					this.display();
				}));

		if (!s.hemingwayEnabled) return;

		const h = this.sub(containerEl);

		this.label(h, 'Removing text');
		this.toggle(h, 'Block backspace',     'And the delete-a-word and delete-a-line shortcuts.', 'hemBlockBackspace');
		this.toggle(h, 'Block delete',        'The forward delete key too.',                                    'hemBlockDelete');
		this.toggle(h, 'Block undo and redo', 'From the keyboard and the Edit menu.',       'hemBlockUndo');
		this.toggle(h, 'Block cut',           'From the keyboard, the menu or a right-click.',               'hemBlockCut');
		this.toggle(h, 'Block paste',         'You might still want this on \u2014 pasting a quote isn\u2019t really editing yourself.', 'hemBlockPaste');

		this.label(h, 'Moving the cursor');
		this.toggle(h, 'Block arrow keys',    'All four of them, and shift-selecting with them.',    'hemBlockArrows');
		this.toggle(h, 'Block jump keys',     'Home, End, Page Up and Page Down.',                  'hemBlockJumpKeys');
		this.toggle(h, 'Block select all',    'Once it\u2019s all selected you\u2019re one keystroke from losing it.',  'hemBlockSelectAll');
		this.toggle(h, 'Block mouse',         'Clicking, right-clicking and dragging.', 'hemBlockMouse');

		this.label(h, 'Feedback');
		new Setting(h).setName('Flash when blocked')
			.setDesc('The badge option only shows if you have {mode} in your bar.')
			.addDropdown(d => d
				.addOption('none',     'None')
				.addOption('icon',     'The Modes button only')
				.addOption('retrobar', 'Retro bar')
				.addOption('screen',   'Screen')
				.addOption('both',     'Screen and bar')
				.setValue(this.plugin.settings.hemFlashTarget || 'screen')
				.onChange(async v => { this.plugin.settings.hemFlashTarget = v; await this.plugin.saveSettings(); }));

		h.createEl('p', {
			text: 'The H badge in {mode} lights up while the lock is on.',
			cls: 'ws-settings-note'
		});
	}

	// ── Text Options tab (text options + typography + word counts) ────────────
	displayTextTab(containerEl) {
		new Setting(containerEl)
			.setName('Text options')
			.setDesc('Indents, spacing, justified text, counts in the sidebar.')
			.addToggle(t => t.setValue(this.plugin.settings.miscEnabled)
				.onChange(async v => { this.plugin.settings.miscEnabled = v; await this.plugin.saveSettings(); this.display(); }));

		if (this.plugin.settings.miscEnabled) {
			const mc = this.sub(containerEl);

			this.slider(mc, 'Horizontal padding', 'Applies all the time, not just in zen.', 'editorPaddingH', 0, 400, 10);

			this.toggle(mc, 'Paragraph indent', 'Indents the first line of every paragraph.', 'enableParagraphIndent', () => this.display());
			if (this.plugin.settings.enableParagraphIndent) {
				const pi = this.sub(mc);
				new Setting(pi).setName('Indent trigger')
					.addDropdown(d => d
						.addOption('double', 'Blank line (double Enter)')
						.addOption('single', 'Every line (single Enter)')
						.setValue(this.plugin.settings.paragraphIndentMode || 'double')
						.onChange(async v => { this.plugin.settings.paragraphIndentMode = v; await this.plugin.saveSettings(); }));
				this.slider(pi, 'Indent size (em)', 'How far in it goes.', 'paragraphIndentEm', 0.5, 8, 0.5);
			}
			this.toggle(mc, 'Limit line length',
				'Keeps lines from running the full width of the window.',
				'limitLineLength', () => this.display());
			if (this.plugin.settings.limitLineLength) {
				this.numInput(this.sub(mc), 'Characters per line',
					'20\u2013200. 64 suits prose.',
					'maxLineChars', 20, 200);
			}

			new Setting(mc).setName('Line spacing').setDesc('A multiplier \u2014 1.5 is a comfortable place to start.')
				.addText(t => {
					t.inputEl.type = 'number'; t.inputEl.min = '0.8'; t.inputEl.max = '4'; t.inputEl.step = '0.1'; t.inputEl.addClass('ws-num-input');
					t.setValue(String(this.plugin.settings.lineSpacing != null ? this.plugin.settings.lineSpacing : 1.5));
					t.onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0.8 && n <= 4) { this.plugin.settings.lineSpacing = n; await this.plugin.saveSettings(); } });
				});
			this.toggle(mc, 'Justify text', 'In both editing and reading views.', 'justifyText');

			this.label(mc, 'Hidden markers');
			this.toggle(mc, 'Show hidden markers', 'Shows the spaces and line breaks you normally can\u2019t see.', 'showHiddenMarkers', () => this.display());
			if (this.plugin.settings.showHiddenMarkers) {
				const hm = this.sub(mc);
				this.toggle(hm, 'Tabs', 'Shown as →', 'markTabs');
				this.toggle(hm, 'Spaces', 'Shown as ·', 'markSpaces');
				this.toggle(hm, 'End of lines', 'Shown as ↵', 'markEndOfLines');
				this.toggle(hm, 'Paragraphs', 'Shown as ¶', 'markParagraphs');
				this.toggle(hm, 'End of buffer', 'Tildes down the empty space after your last line.', 'markBlankLines');
			}

		}

		// Typography is its own master toggle, not a text option: it rewrites
		// the document as you type, where everything above only restyles it.
		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		// Font is its own group, not a text option, and deliberately outside
		// the master above: `miscEnabled` ships OFF, so gating the font on it
		// would take the font away from everyone already using it through the
		// {font} button. It sits on this tab because this is where the note's
		// own type lives, next to spacing and measure.
		//
		// It exists at all because the {font} button was the ONLY control:
		// a bar preset without that token, or the bar switched off, left a
		// writer with a font they could not change from inside the plugin
		// (issue #6 — the reporter ended up overriding --zg-font in a CSS
		// snippet, which is a bug report written in CSS).
		this.label(containerEl, 'Font');
		const fg = this.sub(containerEl);
		const fonts = this.plugin.getConfiguredFonts();
		new Setting(fg)
			.setName('Note font')
			.setDesc(fonts.length
				? 'Applies to the note in both editing and reading views. The list is your own \u2014 add faces under Appearance \u2192 Font.'
				: 'No fonts added yet. Add them under Appearance \u2192 Font and they will appear here.')
			.addDropdown(d => {
				d.addOption('', 'Theme default');
				for (const name of fonts) d.addOption(name, name);
				// A font can be chosen and then removed from the Appearance
				// list, or arrive from another machine. Without this the
				// dropdown would silently show "Theme default" while the note
				// was still being restyled — the exact complaint this whole
				// change is about, one level down.
				const cur = this.plugin.settings.editorFont || '';
				if (cur && !fonts.includes(cur)) d.addOption(cur, cur + ' (not in your list)');
				d.setValue(cur);
				d.onChange(async v => {
					this.plugin.settings.editorFont = v || '';
					await this.plugin.saveSettings();
					this.display();
				});
			});
		fg.createEl('p', {
			text: 'A single note can override this with ws-font in its frontmatter, and the {font} token puts the same picker on the bar.',
			cls: 'ws-settings-note'
		});
	}
	// ── Misc tab ──────────────────────────────────────────────────────────────
	// ── Vim tab ──────────────────────────────────────────────────────────────
	displayVimTab(containerEl) {
		this.label(containerEl, 'Vim');
		const vg = this.sub(containerEl);
		this.toggle(vg, 'Motions follow wrapped lines',
			'Maps j, k, 0 and $ to their g-prefixed forms.'
			+ 'rather than by paragraph. Needs Obsidian\u2019s vim mode on.',
			'vimSoftWrapMotion', () => this.display());

		if (this.plugin.settings.vimSoftWrapMotion) {
			// Whether the mapping actually landed is otherwise invisible: a
			// missing vim API and a working one look identical from here.
			const found = !!this.plugin.vimApi();
			this.sub(vg).createEl('p', {
				text: found
					? 'Vim keymap found \u2014 j and k are mapped to gj and gk.'
					: 'No vim keymap found. Turn on Editor \u2192 Vim key bindings in Obsidian\u2019s '
					  + 'settings, then reopen this tab.',
				cls: 'ws-settings-note' + (found ? '' : ' is-warning')
			});
		}

		containerEl.createEl('p', {
			text: 'Mode labels and their colours live in the Retro Bar tab now \u2014 they\u2019re '
				+ 'about how the {vim} token looks, so that\u2019s where they belong.',
			cls: 'ws-settings-note'
		});
	}

	displayMiscTab(containerEl) {
		this.label(containerEl, 'Word counts');
		this.toggle(containerEl, 'File tree counts',
			'Next to each note, added up for folders.',
			'enableFileTreeCounts', () => this.display());
		this.toggle(containerEl, 'Outline counts',
			'Next to each heading in the outline.',
			'enableOutlineCounts', () => this.display());

		containerEl.createEl('hr', { cls: 'ws-settings-hr' });

		this.label(containerEl, 'Frontmatter overrides');
		const fmEl = this.sub(containerEl);
		fmEl.createEl('p', {
			text: 'Frontmatter in a note overrides these settings, just for that note.',
			cls: 'ws-settings-note'
		});
		fmEl.createEl('pre', {
			cls: 'ws-fm-block',
			text: 'wordsmith: off       the plugin does nothing in this note\n'
				+ 'ws-zen: true         override a mode for this note only\n'
				+ 'ws-typewriter: false\n'
				+ 'ws-hemingway: true\n'
				+ 'ws-syntax: true\n'
				+ 'ws-markers: false\n'
				+ 'ws-typography: false\n'
				+ 'ws-goal: 2000        word target for this note\n'
				+ 'ws-font: Courier Prime'
		});
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
				: 'None yet.');

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
				s[store][picked] = 1000;
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

	// Put the panel back at the top after a display() that must not preserve
	// scroll. Two frames, not one, and on the same element display() uses:
	// its own restore runs one frame after the rebuild, so anything zeroed
	// before that is simply undone. The scroller is the tab content, never
	// containerEl — containerEl does not scroll, and setting scrollTop on it
	// is a silent no-op that looks like the timing being wrong.
	scrollPanelToTop() {
		try {
			const { containerEl } = this;
			const scroller = containerEl.closest('.vertical-tab-content')
				|| containerEl.parentElement || containerEl;
			requestAnimationFrame(() => requestAnimationFrame(() => {
				scroller.scrollTop = 0;
			}));
		} catch (_) { /* the panel is closed; nothing to scroll */ }
	}

	renderTypographySection(containerEl) {
		const s = this.plugin.settings;

		new Setting(containerEl)
			.setName('Typography')
			.setDesc('Turns what you type into the proper characters as you go.')
			.addToggle(t => t.setValue(s.typographyEnabled)
				.onChange(async v => {
					s.typographyEnabled = v;
					await this.plugin.saveSettings(true);
					this.display();
				}));

		if (!s.typographyEnabled) return;

		const ty = this.sub(containerEl);
		ty.createEl('p', {
			text: 'Never touches code, maths or frontmatter.',
			cls: 'ws-settings-note'
		});

		this.toggle(ty, 'Curly quotes', 'Straight quotes turn curly as you type.',
			'typoSmartQuotes', () => this.display());
		if (s.typoSmartQuotes) {
			const q = this.sub(ty);
			this.toggle(q, 'Choose the characters',
				'For German, French or Hebrew quote marks.',
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
		this.toggle(ty, 'Dashes',        '-- \u2192 \u2013, --- \u2192 \u2014', 'typoDashes');
		this.toggle(ty, 'Arrows',        '-> \u2192, <- \u2190, => \u21d2', 'typoArrows');
		this.toggle(ty, 'Comparisons',   '<= \u2264, >= \u2265, /= \u2260', 'typoComparisons');
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