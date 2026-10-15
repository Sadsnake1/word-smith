// ── LANGUAGE PACKS ─────────────────────────────────────────────────────────
//
// A pack is a note in the vault, `Word-Smith/ws-lang-<code>.md`, and this
// module reads it into the data the pack engine works from. Data only: nothing
// in a pack is ever run, so a pack downloaded from anywhere is as safe as a note.
//
// THE NOTE'S SHAPE. Its properties carry the facts: the language's code, its
// name, the pack's version and format, how its words are found (by spaces, or by
// the browser's word segmenter for a language written without them), its
// reading formula and its typography. Its `##` headings carry the parts, in
// English and fixed, so the reader knows them in every language: a list of words
// under a heading, pairs in a table, `name: value` lines where a part has
// settings of its own, a paragraph under `## Test`. `## Interface` is kept for
// the interface's own words one day and read as nothing today.
//
// THE READER FORGIVES. A heading it does not know, and a line that fits nothing
// under the heading it is in, are skipped and kept with their line numbers, so a
// typo shows on the Language page and never breaks the pack.

/** a pack, read: what the engine works from, and what the reader could not use */
export interface WsPack {
	/** the language code the pack is for, from its `language` property ('de', 'zh-Hans') */
	lang: string;
	/** the language's own name, from `name` ('Deutsch') */
	name: string;
	/** the pack's own version, from `pack` ('1.0'), shown beside the downloads' */
	version: string;
	/** the shape of the note this reader expects; a newer one is still read, as far as it goes */
	format: number;
	/** every property, as written */
	props: Record<string, string>;
	/** the word lists, by their heading in lower case */
	lists: Record<string, string[]>;
	/** the tables' rows (a pair, or more cells), by heading */
	tables: Record<string, string[][]>;
	/** the parts with settings of their own, `name: value`, by heading */
	keyed: Record<string, Record<string, string>>;
	/** the paragraph under `## Test`, marked up on the Language page and held by the gate */
	test: string;
	/** what the reader could not use, by line */
	skipped: { line: number; text: string; why: string }[];
}

/** the note format this reader is written for */
export const WS_PACK_FORMAT = 1;

// THE HEADINGS THE READER KNOWS, and the kind of part each one is. A list is
// words (comma separated, or one to a line); a table is rows; a keyed part is
// `name: value` lines; text is kept as written.
export const WS_PACK_PARTS: Record<string, 'list' | 'table' | 'keyed' | 'text' | 'reserved'> = {
	// the word classes, and the small closed sets that decide a word's class beside them
	'nouns': 'list', 'verbs': 'list', 'adjectives': 'list', 'adverbs': 'list', 'conjunctions': 'list',
	'articles': 'list', 'pronouns': 'list', 'prepositions': 'list', 'auxiliaries': 'list', 'particles': 'list',
	// how an unknown word's class is guessed: by its ending, and by what stands before it;
	// the endings a word sheds to be found in the lists ("schnelle" is "schnell"), and the
	// short words written onto the next with an apostrophe (French l', Italian dell')
	'endings': 'table', 'context': 'keyed', 'inflections': 'list', 'elisions': 'list', 'numbers': 'list', 'units': 'list',
	// the prose checks' words
	'filler words': 'list', 'soft filler': 'list', 'hedges': 'list', 'misused': 'table',
	'passive': 'keyed', 'speech verbs': 'list', 'repetition ignore': 'list',
	// sentences, and the reading grade
	'abbreviations': 'list', 'readability': 'keyed', 'common characters': 'list', 'loose pronouns': 'list',
	// what the reader marks up, and what the gate expects the engine to find in it
	'test': 'text', 'expect': 'keyed',
	// the spaces the language sets beside its marks, a row a mark (French's before ; : ! ? and inside « »)
	'spaces': 'table',
	// the category names Word-Smith shows while the pack is in use, by their English (A600)
	'names': 'keyed',
	// THE PACK'S FACTS (language, name, version, quotes…) in the body, not as properties:
	// a property in a note joins every property list in the vault (A606)
	'about': 'keyed',
	// kept for the interface's own words, one day
	'interface': 'reserved',
};

// The code a pack can be named and chosen by: letters, digits and dashes, as
// language tags are ('de', 'pt', 'zh-Hans', 'nb').
export function wsPackCode(s: unknown): string {
	const t = typeof s === 'string' ? s.trim() : '';
	return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(t) ? t : '';
}

// One list line's words: split on commas (and the full-width and ideographic
// ones a Chinese or Japanese pack writes), each trimmed and in one Unicode form.
function wsPackWords(line: string): string[] {
	return line.split(/[,\uFF0C\u3001]/).map((w) => w.trim().normalize('NFC')).filter((w) => w.length > 0);
}

// A PACK'S FILE, BY ITS NAME: `ws-lang-<code>.md`, in any folder. Known by
// the name alone, so a pack is never counted or marked up from the first
// moment, before any scan has read it.
export function wsIsPackPath(path: string | null | undefined): boolean {
	const base = String(path == null ? '' : path).split('/').pop() || '';
	return /^ws-lang-[A-Za-z0-9-]+\.md$/.test(base);
}

// Where the packs are downloaded from.
// THE DOWNLOADS PAGE (A683, the writer: "we need a page on github where people can download these language packs"):
// every pack, a link to download it, its reading grade and how well it colors, on the repository's docs
export const WS_PACKS_URL = 'https://github.com/Sadsnake1/word-smith/blob/main/docs/language-packs.md';

// The pack's quote marks, as its `quotes` property writes them: open and close
// double, open and close single; two marks serve both.
export function wsPackQuotes(pack: WsPack | null | undefined): { od: string; cd: string; os: string; cs: string } | null {
	if (!pack) return null;
	const q = String(pack.props.quotes || '').trim().split(/\s+/).filter(Boolean);
	if (q.length >= 4) return { od: q[0], cd: q[1], os: q[2], cs: q[3] };
	if (q.length >= 2) return { od: q[0], cd: q[1], os: q[0], cs: q[1] };
	return null;
}

// (TOMBSTONE, A776: wsPackQuoteSpace, a pack's `quote-space` line; the writer: "we do the leaner version", the space with
// « » typed in Custom quote marks)

// THE SPACES A LANGUAGE SETS BESIDE ITS MARKS (the writer, 2026-10-15: "do the french spaces toggle"): `## Spaces`, a row
// a mark, `| ; | before | narrow |`, the space `nbsp` (U+00A0) or `narrow` (U+202F). French's: a narrow one before ; ! ?,
// a no-break one before : and inside « ». Typed by Typography's Language spacing (`typoLanguageSpaces`), off by default.
// AND AFTER A WORD (the writer's pick, "Those plus Polish"): `| a, i, o, u, w, z | word | nbsp |`, the space after
// each of those words, so a one-letter word never ends a line (Russian's and Ukrainian's: before the dash, a mark)
export interface WsPackSpaces { before: Record<string, string>; after: Record<string, string>; words: Record<string, string> }
export const WS_PACK_SPACE_CHARS: Record<string, string> = { nbsp: '\u00a0', narrow: '\u202f' };
export function wsPackSpaces(pack: WsPack | null | undefined): WsPackSpaces | null {
	const rows = pack ? pack.tables.spaces : null;
	if (!rows || !rows.length) return null;
	const out: WsPackSpaces = { before: {}, after: {}, words: {} };
	let any = false;
	for (const r of rows) {
		const mark = (r[0] || '').trim(), side = (r[1] || '').trim().toLowerCase(), sp = WS_PACK_SPACE_CHARS[(r[2] || '').trim().toLowerCase()];
		// the words, a comma or a space between them, kept in lower case ("W domu" is w)
		if (side === 'word' && sp) {
			for (const w of mark.split(/[,\s]+/)) if (/^\p{L}+$/u.test(w)) { out.words[w.toLowerCase()] = sp; any = true; }
			continue;
		}
		// one mark, a side, a space this reader knows; anything else is passed over
		if (Array.from(mark).length !== 1 || !sp || (side !== 'before' && side !== 'after')) continue;
		out[side][mark] = sp;
		any = true;
	}
	return any ? out : null;
}

// THE READING FORMULAS the engine knows, by the name a pack's `## Readability`
// gives under `formula`, with the coefficients each starts from; a pack writes a
// coefficient under its own name to change it (lang-engine.ts says what each is).
export const WS_PACK_FORMULAS: Record<string, Record<string, number>> = {
	flesch: { base: 206.835, sentence: 1.015, word: 84.6 },
	wstf: { ms: 0.1935, sl: 0.1672, iw: 0.1297, es: 0.0327, c: 0.875 },
	gulpease: { base: 89, sentence: 300, letter: 10 },
	lix: { scale: 0.25 },
	'fog-pl': { scale: 0.4 },
	tateisi: { base: 115.79, ls: 0.12, la: 1.37, lh: 7.4, lc: 23.18, lk: 5.4, cp: 4.67 },
	zh: { length: 0.12, rare: 0.3, base: 1 },
};

// WHAT A PACK COVERS, by the feature each part feeds: shown on the Language
// page, and how a feature with nothing to go on knows to stay quiet.
export function wsPackCovers(pack: WsPack): { feature: string; on: boolean }[] {
	const has = (k: string) => !!(pack.lists[k] && pack.lists[k].length);
	const syntax = ['nouns', 'verbs', 'adjectives', 'adverbs', 'conjunctions', 'articles', 'pronouns', 'prepositions'].some(has) || !!(pack.tables.endings && pack.tables.endings.length);
	// by its helpers, or by its marks where a language makes the passive with a suffix (Japanese) (A614)
	const passive = !!(pack.keyed.passive && (pack.keyed.passive.helpers || pack.keyed.passive.marks));
	return [
		{ feature: 'Syntax', on: syntax },
		{ feature: 'Filler words', on: has('filler words') || has('soft filler') || has('hedges') },
		{ feature: 'Passive voice', on: passive },
		// named as the Prose checks are, so the page and the checks say one name (A603)
		{ feature: 'Commonly misused', on: !!(pack.tables.misused && pack.tables.misused.length) },
		{ feature: 'Loose pronouns', on: has('loose pronouns') },
		// the Report's most used words, its common words set aside (A598)
		{ feature: 'Common words', on: ['articles', 'pronouns', 'prepositions', 'conjunctions', 'auxiliaries', 'repetition ignore'].some(has) },
		{ feature: 'Sentence rhythm', on: !!(pack.keyed.readability && WS_PACK_FORMULAS[String(pack.keyed.readability.formula || '').trim().toLowerCase()]) },
		{ feature: 'Typography', on: !!wsPackQuotes(pack) },
	];
}

// WHICH COPY WINS when a vault holds two packs for one language (a sync's
// copy, a second download): the one in Word-Smith's own folder, else the
// shortest path, else the first by name. The rest are named on the Language
// page, never mixed in.
export function wsPackPick<T extends { path: string }>(list: T[], home: string): { use: T; dupes: string[] } {
	const inHome = (p: string) => !!home && p.startsWith(home + '/') && p.slice(home.length + 1).indexOf('/') === -1;
	const sorted = list.slice().sort((a, b) => (Number(inHome(b.path)) - Number(inHome(a.path)))
		|| (a.path.length - b.path.length) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { use: sorted[0], dupes: sorted.slice(1).map((x) => x.path) };
}

export function wsParsePack(text: string | null | undefined): WsPack {
	const pack: WsPack = { lang: '', name: '', version: '', format: 0, props: {}, lists: {}, tables: {}, keyed: {}, test: '', skipped: [] };
	const lines = String(text == null ? '' : text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
	let i = 0;
	// THE PROPERTIES: a frontmatter block, `name: value` a line, quotes taken off
	if (lines.length && /^---\s*$/.test(lines[0])) {
		for (i = 1; i < lines.length && !/^---\s*$/.test(lines[i]); i++) {
			const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(lines[i]);
			if (m) pack.props[m[1].toLowerCase()] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
			else if (lines[i].trim()) pack.skipped.push({ line: i + 1, text: lines[i].trim(), why: 'not name: value' });
		}
		i++;
	}
	// THE PARTS
	let part = '', kind: string = '';
	let tableRow = 0;
	const test: string[] = [];
	for (; i < lines.length; i++) {
		const raw = lines[i];
		const t = raw.trim();
		const h = /^##\s+(.+?)\s*#*$/.exec(t);
		if (h && !/^###/.test(t)) {
			part = h[1].trim().toLowerCase().replace(/\s+/g, ' ');
			// the part's old name, still read: Loose pronouns was "Vague pronouns" (A603)
			part = part.replace(/\bvague pronouns\b/, 'loose pronouns');
			kind = WS_PACK_PARTS[part] || '';
			// A HEADING IN THE PACK'S OWN LANGUAGE, the English beside it (A600):
			// "Substantive (Nouns)" is Nouns, and so is "Nouns (Substantive)"
			if (!kind) {
				const m = /^(.*?)\s*\(([^)]+)\)$/.exec(part);
				const inner = m ? m[2].trim() : '', outer = m ? m[1].trim() : '';
				if (inner && WS_PACK_PARTS[inner]) { part = inner; kind = WS_PACK_PARTS[inner]; }
				else if (outer && WS_PACK_PARTS[outer]) { part = outer; kind = WS_PACK_PARTS[outer]; }
			}
			tableRow = 0;
			if (!kind) pack.skipped.push({ line: i + 1, text: t, why: 'unknown heading' });
			continue;
		}
		// a title, a smaller heading inside a part, a comment: never content
		if (/^#{1,6}\s/.test(t) || /^%%/.test(t) || /^<!--/.test(t)) continue;
		if (kind === 'text') { test.push(raw); continue; }
		if (!t) continue;
		if (!part) continue;   // what stands before the first part is the pack's own note to its readers
		if (!kind || kind === 'reserved') continue;   // reported once, at its heading
		if (kind === 'list') {
			const words = wsPackWords(t.replace(/^[-*+]\s+/, ''));
			if (words.length) (pack.lists[part] || (pack.lists[part] = [])).push(...words);
			continue;
		}
		if (kind === 'table') {
			if (!/^\|.*\|$/.test(t)) { pack.skipped.push({ line: i + 1, text: t, why: 'not a table row' }); continue; }
			if (/^\|[\s:|-]+\|$/.test(t)) continue;   // the line under the head row
			tableRow++;
			const cells = t.slice(1, -1).split('|').map((c) => c.trim().normalize('NFC'));
			// THE HEAD ROW names the columns, and is the first row whose next line is the rule
			if (tableRow === 1 && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) continue;
			if (cells.every((c) => !c)) continue;
			(pack.tables[part] || (pack.tables[part] = [])).push(cells);
			continue;
		}
		if (kind === 'keyed') {
			const m = /^(?:[-*+]\s+)?([^:]+?)\s*:\s*(.*)$/.exec(t);
			if (!m) { pack.skipped.push({ line: i + 1, text: t, why: 'not name: value' }); continue; }
			(pack.keyed[part] || (pack.keyed[part] = {}))[m[1].trim().toLowerCase()] = m[2].trim().normalize('NFC');
		}
	}
	pack.test = test.join('\n').trim();
	// THE FACTS: the ## About part's, the frontmatter's where a pack was written that way
	const about = pack.keyed.about || {};
	for (const k of Object.keys(about)) if (!(k in pack.props)) pack.props[k] = about[k];
	pack.lang = wsPackCode(pack.props.language);
	pack.name = pack.props.name || pack.lang;
	pack.version = pack.props.pack || '';
	pack.format = Number(pack.props.format) || WS_PACK_FORMAT;
	if (!pack.lang) pack.skipped.unshift({ line: 1, text: String(pack.props.language || ''), why: 'no language code (language: de)' });
	return pack;
}
