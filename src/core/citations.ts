// ── CITATIONS (A572) ─────────────────────────────────────────────────────────
//
// The writer: "Bibtex and csl-json. 2 only the most popular ones 3 our search no
// other plugins", then "Do citations too with those presets and a customizable
// token based thing with preview". A library file in the vault (BibTeX/BibLaTeX or
// CSL-JSON, as Zotero's Better BibTeX keeps either), read into one shape; Pandoc's
// citation syntax found in the text ([@key], [@key, p. 12], [@a; @b], [-@key],
// @key); the styles writers are asked for, by hand (APA 7, Chicago author-date and
// notes, MLA 9, IEEE: no citeproc), and a style of the writer's own written in
// tokens. Everything here is pure: the plugin reads the file, the editor marks, the
// export formats; this only answers.
import { wsBag, wsListOf, wsStr } from './preamble';
import { wsT, wsUiJoin } from './ui-text';
import type { WsExportSection } from './settings';

export interface WsName { family: string; given: string }
export interface WsRef {
	key: string;
	/** book, article, chapter, web, thesis, report or other */
	type: string;
	authors: WsName[];
	editors: WsName[];
	year: string;
	title: string;
	/** the journal, or the book a chapter is in */
	container: string;
	publisher: string;
	place: string;
	volume: string;
	issue: string;
	pages: string;
	edition: string;
	doi: string;
	url: string;
}
export interface WsCiteItem { key: string; locator: string; prefix: string; suppress: boolean }
export interface WsCite { from: number; to: number; items: WsCiteItem[]; narrative: boolean }
/** a style of the writer's own: one source in the text, what goes around them, one entry in the list */
export interface WsCiteCustom { inText: string; around: string; entry: string }

export const WS_CITE_STYLES: { id: string; name: string; heading: string }[] = [
	{ id: 'apa', name: 'APA 7', heading: 'References' },
	{ id: 'chicago-ad', name: 'Chicago (author-date)', heading: 'References' },
	{ id: 'chicago-notes', name: 'Chicago (notes)', heading: 'Bibliography' },
	{ id: 'mla', name: 'MLA 9', heading: 'Works Cited' },
	{ id: 'ieee', name: 'IEEE', heading: 'References' },
	{ id: 'custom', name: 'Your own (tokens)', heading: 'References' },
];
export const WS_CITE_CUSTOM_DEFAULT: WsCiteCustom = {
	inText: '{etal} {year}[, {page}]',
	around: 'parens',
	entry: '{authors-full}. {year}. {title*}.[ {place}:][ {publisher}.]',
};
// the tokens a custom style is written in, with what each draws: the settings' help and preview read this
export const WS_CITE_TOKENS: [string, string][] = [
	['{author}', 'the first author’s family name'],
	['{etal}', 'one or two family names, or the first and “et al.”'],
	['{authors}', 'every family name: Smith, Jones, and Lee'],
	['{authors-full}', 'Smith, John, and Ann Jones'],
	['{authors-initials}', 'J. Smith and A. Jones'],
	['{year}', 'the year'],
	['{title}', 'the title'],
	['{title*}', 'the title in italics'],
	['{title-quoted}', 'the title in quotation marks'],
	['{container}', 'the journal, or the book a chapter is in'],
	['{container*}', 'the same, in italics'],
	['{editors}', 'the editors'],
	['{publisher}', 'the publisher'],
	['{place}', 'where it was published'],
	['{edition}', 'the edition'],
	['{volume}', 'the volume'],
	['{issue}', 'the issue'],
	['{pages}', 'the pages of a chapter or an article'],
	['{page}', 'the page a citation points to'],
	['{n}', 'its number, in order of first citation'],
	['{doi}', 'the DOI, as a link'],
	['{url}', 'the web address'],
];

// ── BIBTEX ────────────────────────────────────────────────────────────────

const WS_TEX_ACCENTS: Record<string, Record<string, string>> = {
	'"': { a: 'ä', o: 'ö', u: 'ü', e: 'ë', i: 'ï', y: 'ÿ', A: 'Ä', O: 'Ö', U: 'Ü', E: 'Ë', I: 'Ï' },
	'\'': { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', c: 'ć', n: 'ń', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', C: 'Ć', N: 'Ń', S: 'Ś', Z: 'Ź' },
	'`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
	'^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
	'~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
	'=': { a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū' },
	'.': { z: 'ż', Z: 'Ż', I: 'İ' },
	c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş', t: 'ţ', T: 'Ţ' },
	v: { c: 'č', s: 'š', z: 'ž', r: 'ř', e: 'ě', n: 'ň', C: 'Č', S: 'Š', Z: 'Ž', R: 'Ř', E: 'Ě', N: 'Ň' },
	u: { a: 'ă', g: 'ğ', A: 'Ă', G: 'Ğ' },
	k: { a: 'ą', e: 'ę', A: 'Ą', E: 'Ę' },
	H: { o: 'ő', u: 'ű', O: 'Ő', U: 'Ű' },
	r: { a: 'å', u: 'ů', A: 'Å' },
};
const WS_TEX_LETTERS: Record<string, string> = { ss: 'ß', ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', o: 'ø', O: 'Ø', l: 'ł', L: 'Ł', i: 'ı' };
const WS_BIB_MONTHS: Record<string, string> = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };

/** A BibTeX value as plain text: its accents, dashes, ties and commands decoded, its braces gone. */
export function wsTexText(s: string): string {
	let t = String(s || '');
	t = t.replace(/\\([`'"^~=.])\s*\{?\\?([A-Za-z])\}?/g, (m: string, a: string, ch: string) => (WS_TEX_ACCENTS[a] && WS_TEX_ACCENTS[a][ch]) || ch);
	t = t.replace(/\\([cvukHr])(?:\s*\{\\?([A-Za-z])\}|\s+([A-Za-z]))/g, (m: string, a: string, c1: string, c2: string) => { const ch = c1 || c2; return (WS_TEX_ACCENTS[a] && WS_TEX_ACCENTS[a][ch]) || ch; });
	t = t.replace(/\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L|i)(?![A-Za-z])\s?/g, (m: string, w: string) => WS_TEX_LETTERS[w] || w);
	t = t.replace(/\\([&%$#_{}])/g, '$1');
	t = t.replace(/\\(?:emph|textit|textbf|textsc|mkbibemph|mkbibquote|textrm|textsf|texttt|url|href)\s*/g, '');
	t = t.replace(/\\[A-Za-z]+\s*/g, '');
	t = t.replace(/---/g, '—').replace(/--/g, '–').replace(/~/g, '\u00a0');
	// spaces collapsed, but not the no-break space a ~ made
	return t.replace(/[{}]/g, '').replace(/[ \t\r\n]+/g, ' ').trim();
}

/** Names as BibTeX writes them: "Family, Given and Given Family and {A Corporate Name}". */
export function wsBibNames(s: string): WsName[] {
	const raw = String(s || '');
	const parts: string[] = [];
	let depth = 0, cur = '';
	for (let i = 0; i < raw.length; i++) {
		const c = raw[i];
		if (c === '{') depth++;
		else if (c === '}') depth--;
		if (depth === 0) {
			const m = /^\s+and\s+/i.exec(raw.slice(i));
			if (m) { parts.push(cur); cur = ''; i += m[0].length - 1; continue; }
		}
		cur += c;
	}
	if (cur.trim()) parts.push(cur);
	return parts.map((p) => p.trim()).filter(Boolean).map((p) => {
		if (/^\{[^{}]*\}$/.test(p)) return { family: wsTexText(p), given: '' };
		const bits = p.split(/,(?![^{]*\})/).map((x) => x.trim());
		if (bits.length > 1) return { family: wsTexText(bits[0]), given: wsTexText(bits[bits.length - 1]) };
		const words = p.split(/\s+(?![^{]*\})/);
		if (words.length === 1) return { family: wsTexText(p), given: '' };
		// the family begins at the first lowercase word (von, de, van der), else it is the last word
		let at = words.findIndex((w, k) => k > 0 && k < words.length - 1 && /^[a-z]/.test(w));
		if (at < 0) at = words.length - 1;
		return { family: wsTexText(words.slice(at).join(' ')), given: wsTexText(words.slice(0, at).join(' ')) };
	});
}

// one entry's fields: name = {value} | "value" | number | macro, joined by #
function wsBibFields(body: string, strings: Record<string, string>): Record<string, string> {
	const f: Record<string, string> = {};
	const n = body.length;
	let i = 0;
	while (i < n) {
		const head = /\s*,?\s*([A-Za-z][\w-]*)\s*=\s*/y;
		head.lastIndex = i;
		const h = head.exec(body);
		if (!h) break;
		i = head.lastIndex;
		let val = '';
		while (i < n) {
			const c = body[i];
			if (c === '{') {
				let d = 1, k = i + 1;
				for (; k < n && d > 0; k++) { if (body[k] === '\\') { k++; continue; } if (body[k] === '{') d++; else if (body[k] === '}') d--; }
				val += body.slice(i + 1, k - 1);
				i = k;
			} else if (c === '"') {
				let d = 0, k = i + 1;
				for (; k < n; k++) { if (body[k] === '\\') { k++; continue; } if (body[k] === '{') d++; else if (body[k] === '}') d--; else if (body[k] === '"' && d === 0) break; }
				val += body.slice(i + 1, k);
				i = k + 1;
			} else {
				const w = /[^,#\s}]+/y;
				w.lastIndex = i;
				const r = w.exec(body);
				if (!r) break;
				const word = r[0], low = word.toLowerCase();
				val += /^\d+$/.test(word) ? word : (strings[low] != null ? strings[low] : word);
				i = w.lastIndex;
			}
			const hash = /\s*#\s*/y;
			hash.lastIndex = i;
			if (hash.exec(body)) { i = hash.lastIndex; continue; }
			break;
		}
		f[h[1].toLowerCase()] = val;
	}
	return f;
}

function wsBibType(kind: string, f: Record<string, string>): string {
	if (kind === 'article') return 'article';
	if (/^(book|mvbook|booklet)$/.test(kind)) return 'book';
	if (/^(incollection|inbook|inproceedings|conference)$/.test(kind)) return 'chapter';
	if (/^(phdthesis|mastersthesis|thesis)$/.test(kind)) return 'thesis';
	if (/^(techreport|report)$/.test(kind)) return 'report';
	if (kind === 'online' || ((kind === 'misc' || kind === 'electronic') && f.url)) return 'web';
	return 'other';
}

/** A BibTeX or BibLaTeX file, read into references by key. */
export function wsParseBibtex(text: string): Map<string, WsRef> {
	const out = new Map<string, WsRef>();
	const src = String(text || '');
	const strings: Record<string, string> = Object.assign({}, WS_BIB_MONTHS);
	let i = 0;
	for (;;) {
		const at = src.indexOf('@', i);
		if (at < 0) break;
		const m = /^@\s*([A-Za-z]+)\s*([({])/.exec(src.slice(at, at + 40));
		if (!m) { i = at + 1; continue; }
		const kind = m[1].toLowerCase();
		const paren = m[2] === '(';
		const start = at + m[0].length;
		let depth = 1, k = start;
		for (; k < src.length; k++) {
			const c = src[k];
			if (c === '\\') { k++; continue; }
			if (c === '{') depth++;
			else if (c === '}') { depth--; if (depth === 0 && !paren) break; }
			else if (c === ')' && paren && depth === 1) break;
		}
		const body = src.slice(start, k);
		i = k + 1;
		if (kind === 'comment' || kind === 'preamble') continue;
		if (kind === 'string') { const s = wsBibFields(body, strings); for (const key of Object.keys(s)) strings[key] = s[key]; continue; }
		const comma = body.indexOf(',');
		if (comma < 0) continue;
		const key = body.slice(0, comma).trim();
		if (!key) continue;
		const f = wsBibFields(body.slice(comma + 1), strings);
		const tx = (x: string | undefined) => wsTexText(x || '');
		out.set(key, {
			key, type: wsBibType(kind, f),
			authors: wsBibNames(f.author || ''), editors: wsBibNames(f.editor || ''),
			year: tx(f.year) || tx(f.date).slice(0, 4),
			title: tx(f.title), container: tx(f.journal || f.journaltitle || f.booktitle),
			publisher: tx(f.publisher || f.institution || f.school || f.organization), place: tx(f.address || f.location),
			volume: tx(f.volume), issue: tx(f.number || f.issue), pages: tx(f.pages).replace(/\s*[-–]+\s*/g, '–'),
			edition: tx(f.edition), doi: tx(f.doi), url: tx(f.url),
		});
	}
	return out;
}

// ── CSL-JSON ──────────────────────────────────────────────────────────────

const wsRec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? wsBag(v) : {});
function wsCslNames(v: unknown): WsName[] {
	return wsListOf(v).map((x) => {
		const r = wsRec(x);
		const lit = wsStr(r.literal);
		return lit ? { family: lit, given: '' } : { family: [wsStr(r['non-dropping-particle']), wsStr(r.family)].filter(Boolean).join(' '), given: wsStr(r.given) };
	}).filter((n) => n.family || n.given);
}
function wsCslType(t: string): string {
	if (/^(article|article-journal|article-magazine|article-newspaper)$/.test(t)) return 'article';
	if (t === 'book') return 'book';
	if (/^(chapter|paper-conference|entry-encyclopedia|entry-dictionary)$/.test(t)) return 'chapter';
	if (t === 'thesis') return 'thesis';
	if (t === 'report') return 'report';
	if (/^(webpage|post|post-weblog)$/.test(t)) return 'web';
	return 'other';
}

/** A CSL-JSON file (an array of items, Zotero's export), read into references by key. */
export function wsParseCslJson(text: string): Map<string, WsRef> {
	const out = new Map<string, WsRef>();
	let data: unknown = null;
	try { data = JSON.parse(String(text || '')); } catch { return out; }
	const items = Array.isArray(data) ? data : wsListOf(wsRec(data).items);
	for (const it of items) {
		const r = wsRec(it);
		const key = wsStr(r.id) || wsStr(r['citation-key']);
		if (!key) continue;
		const issued = wsRec(r.issued);
		const parts = wsListOf(issued['date-parts']);
		const first = wsListOf(parts[0]);
		const year = first.length ? wsStr(first[0]) : (wsStr(issued.raw).match(/\d{4}/) || [''])[0];
		out.set(key, {
			key, type: wsCslType(wsStr(r.type)),
			authors: wsCslNames(r.author), editors: wsCslNames(r.editor),
			year, title: wsStr(r.title), container: wsStr(r['container-title']),
			publisher: wsStr(r.publisher), place: wsStr(r['publisher-place']),
			volume: wsStr(r.volume), issue: wsStr(r.issue), pages: wsStr(r.page).replace(/\s*[-–]+\s*/g, '–'),
			edition: wsStr(r.edition), doi: wsStr(r.DOI), url: wsStr(r.URL),
		});
	}
	return out;
}

/** A library by its file's name: .json is CSL-JSON, anything else BibTeX. */
export function wsParseLibrary(path: string, text: string): Map<string, WsRef> {
	return /\.json$/i.test(String(path || '')) ? wsParseCslJson(text) : wsParseBibtex(text);
}

// ── IN THE TEXT ───────────────────────────────────────────────────────────

const WS_CITE_KEY = '[A-Za-z0-9_][\\w:.#$%&+?<>~/-]*';
/** Pandoc's citations in a text: bracketed ([@a, p. 12; -@b]) and narrative (@a). An email is not one. */
export function wsFindCitations(text: string): WsCite[] {
	const src = String(text || '');
	const out: WsCite[] = [];
	const BR = /\[([^[\]]*?-?@[A-Za-z0-9_][^[\]]*)\]/g;
	let m: RegExpExecArray | null;
	while ((m = BR.exec(src))) {
		if (src.charAt(m.index + m[0].length) === '(' || src.charAt(m.index - 1) === '[' || src.charAt(m.index + m[0].length) === ']') continue;
		const items: WsCiteItem[] = [];
		let ok = true;
		for (const part of m[1].split(';')) {
			const pm = new RegExp('^([\\s\\S]*?)(-?)@(' + WS_CITE_KEY + ')([\\s\\S]*)$').exec(part);
			if (!pm || /\S/.test(pm[1]) && /[A-Za-z0-9_]$/.test(pm[1])) { ok = false; break; }
			let key = pm[3];
			let rest = pm[4];
			const tail = /[.:,;?!/-]+$/.exec(key);
			if (tail) { rest = tail[0] + rest; key = key.slice(0, -tail[0].length); }
			items.push({ key, prefix: pm[1].trim(), suppress: pm[2] === '-', locator: rest.replace(/^\s*,\s*/, '').trim() });
		}
		if (ok && items.length) out.push({ from: m.index, to: m.index + m[0].length, items, narrative: false });
	}
	// a wikilink and a link's own text are not prose to cite in
	const links: [number, number][] = [];
	const LK = /\[\[[^\]]*\]\]|\[[^[\]]*\]\([^)]*\)/g;
	while ((m = LK.exec(src))) links.push([m.index, m.index + m[0].length]);
	const NR = new RegExp('(^|[^\\w@\\[\\]`])@(' + WS_CITE_KEY + ')', 'g');
	while ((m = NR.exec(src))) {
		const at = m.index + m[1].length;
		if (out.some((c) => at >= c.from && at < c.to) || links.some(([a, b]) => at >= a && at < b)) continue;
		const key = m[2].replace(/[.:,;?!/-]+$/, '');
		out.push({ from: at, to: at + 1 + key.length, items: [{ key, locator: '', prefix: '', suppress: false }], narrative: true });
	}
	return out.sort((a, b) => a.from - b.from);
}

// ── THE STYLES ────────────────────────────────────────────────────────────

const fam = (n: WsName) => n.family || n.given;
const initials = (g: string) => g.split(/[\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + '.').join(' ');
const full = (n: WsName) => [n.given, n.family].filter(Boolean).join(' ');
const inverted = (n: WsName) => n.given ? n.family + ', ' + n.given : n.family;
const join = (xs: string[], and: string, comma = true) => xs.length <= 1 ? (xs[0] || '')
	: xs.length === 2 ? xs[0] + ' ' + and + ' ' + xs[1]
		: xs.slice(0, -1).join(', ') + (comma ? ',' : '') + ' ' + and + ' ' + xs[xs.length - 1];
const ital = (s: string) => (s ? '*' + s + '*' : '');
const quoted = (s: string) => (s ? '“' + s + '”' : '');
const end = (s: string) => (s && !/[.?!]$/.test(s) ? s + '.' : s);
const doiLink = (r: WsRef) => (r.doi ? 'https://doi.org/' + r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : r.url);
// a title in italics with its full stop outside them: *A Room of One's Own*.
const italEnd = (s: string) => (s ? ital(s) + (/[.?!]$/.test(s) ? '' : '.') : '');
// the list's names: the first inverted, a comma before the "and" (Smith, Jane, and Min Lee)
const listInverted = (a: WsName[]) => a.length === 2 ? inverted(a[0]) + ', and ' + full(a[1])
	: join(a.map((x, k) => (k === 0 ? inverted(x) : full(x))), 'and');

/** a locator's label and value: "p. 12" is p 12, "pp. 3-5" pp 3–5, a bare number a page */
function wsLocator(loc: string): { label: string; value: string } {
	const t = String(loc || '').trim();
	if (!t) return { label: '', value: '' };
	const m = /^(pp?|pages?|chap|chapter|ch|sec|section|vol|fig|line|para|n)\.?\s+(.+)$/i.exec(t);
	if (m) return { label: m[1].toLowerCase(), value: m[2].replace(/\s*-+\s*/g, '–') };
	return { label: /^\d+\s*[-–]\s*\d+$/.test(t) ? 'pp' : 'p', value: t.replace(/\s*-+\s*/g, '–') };
}
// A LOCATOR AS CHICAGO AND MLA PRINT IT (A572 step 4): a page bare, anything else with its word ("chap. 2", MLA's
// "ch. 2"); the sampler printed "chap. 2" as a bare "2"
const LOC_WORDS: Record<string, [string, string]> = { chap: ['chap.', 'ch.'], chapter: ['chap.', 'ch.'], ch: ['chap.', 'ch.'], sec: ['sec.', 'sec.'], section: ['sec.', 'sec.'], vol: ['vol.', 'vol.'], fig: ['fig.', 'fig.'], line: ['line', 'line'], para: ['para.', 'par.'], n: ['n.', 'n.'] };
const isPage = (l: { label: string }) => /^(p|pp|page|pages)$/.test(l.label);
const bareLoc = (l: { label: string; value: string }, mla = false) => (!l.value ? '' : isPage(l) ? l.value : (LOC_WORDS[l.label] || [l.label + '.', l.label + '.'])[mla ? 1 : 0] + ' ' + l.value);
const pageWord = (l: { label: string; value: string }) => (!l.value ? '' : l.label === 'p' || l.label === 'page' ? 'p. ' + l.value : l.label === 'pp' || l.label === 'pages' ? 'pp. ' + l.value : l.label + '. ' + l.value);

function etal(r: WsRef, two: string, max = 2) {
	const a = (r.authors.length ? r.authors : r.editors).map(fam);
	if (!a.length) return r.title;
	if (a.length > max) return a[0] + ' et al.';
	return join(a, two, false);
}

// the in-text answer of each style, for one source
function inTextOf(style: string, r: WsRef, it: WsCiteItem, n: number, narrative: boolean): string {
	const loc = wsLocator(it.locator);
	if (style === 'apa') {
		const who = etal(r, narrative ? 'and' : '&');
		if (narrative) return who + ' (' + [r.year || 'n.d.', pageWord(loc)].filter(Boolean).join(', ') + ')';
		return [it.suppress ? '' : who, r.year || 'n.d.', pageWord(loc)].filter(Boolean).join(', ');
	}
	if (style === 'chicago-ad') {
		const who = etal(r, 'and', 3);
		const tail = [r.year || 'n.d.'].join('') + (loc.value ? ', ' + bareLoc(loc) : '');
		if (narrative) return who + ' (' + tail + ')';
		return (it.suppress ? '' : who + ' ') + tail;
	}
	if (style === 'mla') {
		const who = etal(r, 'and');
		const at = bareLoc(loc, true);
		if (narrative) return who + (at ? ' (' + at + ')' : '');
		// a page follows the name bare, anything else after a comma: (Woolf 108), (Woolf, ch. 2)
		return (it.suppress ? '' : who) + (at ? (it.suppress ? '' : isPage(loc) ? ' ' : ', ') + at : '');
	}
	if (style === 'ieee') return String(n) + (loc.value ? ', ' + pageWord(loc) : '');
	return '';
}

// the list entry of each style, in Markdown (its italics as *)
function entryOf(style: string, r: WsRef, n: number): string {
	const a = r.authors.length ? r.authors : r.editors;
	const eds = !r.authors.length && r.editors.length;
	const link = doiLink(r);
	if (style === 'apa') {
		const names = a.map((x) => x.given ? x.family + ', ' + initials(x.given) : x.family);
		const who = names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
		const head = (who ? end(who) + (eds ? ' (Ed' + (a.length > 1 ? 's' : '') + '.).' : '') + ' ' : '') + '(' + (r.year || 'n.d.') + '). ';
		if (r.type === 'article') return head + end(r.title) + ' ' + ital(r.container) + (r.volume ? ', ' + ital(r.volume) + (r.issue ? '(' + r.issue + ')' : '') : '') + (r.pages ? ', ' + r.pages : '') + '.' + (link ? ' ' + link : '');
		if (r.type === 'chapter') return head + end(r.title) + ' In ' + (r.editors.length ? join(r.editors.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family), '&', false) + ' (Ed' + (r.editors.length > 1 ? 's' : '') + '.), ' : '') + ital(r.container) + (r.pages ? ' (pp. ' + r.pages + ')' : '') + '. ' + end(r.publisher) + (link ? ' ' + link : '');
		// a book or a web page: no stray space where there is no publisher (the sampler: "Obsidian Help.  https://")
		return [head + ital(r.title) + (r.edition ? ' (' + r.edition + ' ed.)' : '') + '.', end(r.publisher), link].filter(Boolean).join(' ');
	}
	if (style === 'chicago-ad' || style === 'chicago-notes') {
		const who = end(listInverted(a));
		const pub = [r.place, r.publisher].filter(Boolean).join(': ');
		if (style === 'chicago-ad') {
			const head = (who ? who + ' ' : '') + end(r.year || 'n.d.') + ' ';
			if (r.type === 'article') return head + quoted(end(r.title)) + ' ' + ital(r.container) + (r.volume ? ' ' + r.volume : '') + (r.issue ? ' (' + r.issue + ')' : '') + (r.pages ? ': ' + r.pages : '') + '.' + (link ? ' ' + link + '.' : '');
			if (r.type === 'chapter') return head + quoted(end(r.title)) + ' In ' + ital(r.container) + (r.editors.length ? ', edited by ' + join(r.editors.map(full), 'and') : '') + (r.pages ? ', ' + r.pages : '') + '. ' + end(pub);
			if (r.type === 'web') return head + quoted(end(r.title)) + (link ? ' ' + link + '.' : '');
			return [head + italEnd(r.title), end(pub)].filter(Boolean).join(' ');
		}
		if (r.type === 'article') return (who ? who + ' ' : '') + quoted(end(r.title)) + ' ' + ital(r.container) + (r.volume ? ' ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.year ? ' (' + r.year + ')' : '') + (r.pages ? ': ' + r.pages : '') + '.' + (link ? ' ' + link + '.' : '');
		if (r.type === 'chapter') return (who ? who + ' ' : '') + quoted(end(r.title)) + ' In ' + ital(r.container) + (r.editors.length ? ', edited by ' + join(r.editors.map(full), 'and') : '') + (r.pages ? ', ' + r.pages : '') + '. ' + end([pub, r.year].filter(Boolean).join(', '));
		if (r.type === 'web') return (who ? who + ' ' : '') + quoted(end(r.title)) + (r.year ? ' ' + end(r.year) : '') + (link ? ' ' + link + '.' : '');
		return [(who ? who + ' ' : '') + italEnd(r.title), end([pub, r.year].filter(Boolean).join(', '))].filter(Boolean).join(' ');
	}
	if (style === 'mla') {
		const who = a.length > 2 ? inverted(a[0]) + ', et al.' : end(listInverted(a));
		const head = who ? (who.endsWith('.') ? who : who + '.') + ' ' : '';
		if (r.type === 'article') return head + quoted(end(r.title)) + ' ' + ital(r.container) + (r.volume ? ', vol. ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.year ? ', ' + r.year : '') + (r.pages ? ', pp. ' + r.pages : '') + '.' + (link ? ' ' + link.replace(/^https?:\/\//, '') + '.' : '');
		if (r.type === 'chapter') return head + quoted(end(r.title)) + ' ' + ital(r.container) + (r.editors.length ? ', edited by ' + join(r.editors.map(full), 'and') : '') + ', ' + [r.publisher, r.year].filter(Boolean).join(', ') + (r.pages ? ', pp. ' + r.pages : '') + '.';
		if (r.type === 'web') return head + quoted(end(r.title)) + (r.year ? ' ' + r.year + ',' : '') + (link ? ' ' + link.replace(/^https?:\/\//, '') + '.' : '');
		return [head + italEnd(r.title), end([r.publisher, r.year].filter(Boolean).join(', '))].filter(Boolean).join(' ');
	}
	if (style === 'ieee') {
		const names = a.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family);
		const who = names.length > 6 ? names[0] + ' et al.' : join(names, 'and');
		const head = '[' + n + '] ' + (who ? who + ', ' : '');
		if (r.type === 'article') return head + quoted(r.title + ',') + ' ' + ital(r.container) + (r.volume ? ', vol. ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.pages ? ', pp. ' + r.pages : '') + (r.year ? ', ' + r.year : '') + '.' + (r.doi ? ' doi: ' + r.doi + '.' : '');
		if (r.type === 'chapter') return head + quoted(r.title + ',') + ' in ' + ital(r.container) + (r.editors.length ? ', ' + join(r.editors.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family), 'and') + ', Ed' + (r.editors.length > 1 ? 's' : '') + '.' : '') + ' ' + end([[r.place, r.publisher].filter(Boolean).join(': '), r.year, r.pages ? 'pp. ' + r.pages : ''].filter(Boolean).join(', '));
		if (r.type === 'web') return head + quoted(r.title + '.') + (link ? ' [Online]. Available: ' + link : '');
		return [head + ital(r.title) + '.', end([[r.place, r.publisher].filter(Boolean).join(': '), r.year].filter(Boolean).join(', '))].filter(Boolean).join(' ');
	}
	return r.title;
}

// Chicago's note: the first in full, then short
function noteOf(r: WsRef, it: WsCiteItem, first: boolean): string {
	const a = r.authors.length ? r.authors : r.editors;
	const loc = bareLoc(wsLocator(it.locator));
	// THE SHORT TITLE: its first words up to the subtitle, an opening article dropped, four at most ("A Room of
	// One's Own" is "Room of One's Own", not "A Room of One's")
	const short = r.title.split(/[:.?!]/)[0].trim().replace(/^(a|an|the)\s+/i, '').split(/\s+/).slice(0, 4).join(' ');
	const whoShort = a.length > 3 ? fam(a[0]) + ' et al.' : join(a.map(fam), 'and');
	if (!first) {
		// a title in quotes takes the comma or the full stop inside them: “Sentence Length,” 50. / “Sentence Length.”
		if (r.type === 'article' || r.type === 'chapter' || r.type === 'web') return [whoShort, loc ? quoted(short + ',') + ' ' + loc + '.' : quoted(short + '.')].filter(Boolean).join(', ');
		return end([whoShort, ital(short), loc].filter(Boolean).join(', '));
	}
	const who = a.length > 3 ? full(a[0]) + ' et al.' : join(a.map(full), 'and');
	const pub = [r.place, r.publisher].filter(Boolean).join(': ');
	if (r.type === 'article') return (who ? who + ', ' : '') + quoted(r.title + ',') + ' ' + ital(r.container) + (r.volume ? ' ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.year ? ' (' + r.year + ')' : '') + (loc ? ': ' + loc : r.pages ? ': ' + r.pages : '') + '.';
	if (r.type === 'chapter') return (who ? who + ', ' : '') + quoted(r.title + ',') + ' in ' + ital(r.container) + (r.editors.length ? ', ed. ' + join(r.editors.map(full), 'and') : '') + ' (' + [pub, r.year].filter(Boolean).join(', ') + ')' + (loc ? ', ' + loc : '') + '.';
	// A WEB PAGE: its title in quotes and its address (the sampler: "Obsidian, *Obsidian Help* ().")
	if (r.type === 'web') {
		const tail = [r.year, doiLink(r), loc].filter(Boolean).join(', ');
		return (who ? who + ', ' : '') + (tail ? quoted(r.title + ',') + ' ' + tail + '.' : quoted(r.title + '.'));
	}
	// no empty brackets where there is no publisher, place or year
	const py = [pub, r.year].filter(Boolean).join(', ');
	return (who ? who + ', ' : '') + ital(r.title) + (py ? ' (' + py + ')' : '') + (loc ? ', ' + loc : '') + '.';
}

// ── A STYLE OF ONE'S OWN, IN TOKENS ───────────────────────────────────────

function tokenValue(tok: string, r: WsRef, it: WsCiteItem | null, n: number): string {
	const a = r.authors.length ? r.authors : r.editors;
	switch (tok) {
		case 'author': return a.length ? fam(a[0]) : '';
		case 'etal': return a.length ? etal(r, 'and') : '';
		case 'authors': return join(a.map(fam), 'and');
		case 'authors-full': return listInverted(a);
		case 'authors-initials': return join(a.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family), 'and');
		case 'year': return r.year;
		case 'title': return r.title;
		case 'title*': return ital(r.title);
		case 'title-quoted': return quoted(r.title);
		case 'container': return r.container;
		case 'container*': return ital(r.container);
		case 'editors': return join(r.editors.map(full), 'and');
		case 'publisher': return r.publisher;
		case 'place': return r.place;
		case 'edition': return r.edition;
		case 'volume': return r.volume;
		case 'issue': return r.issue;
		case 'pages': return r.pages;
		case 'page': return it ? wsLocator(it.locator).value : '';
		case 'n': return n ? String(n) : '';
		case 'doi': return r.doi ? doiLink(r) : '';
		case 'url': return r.url;
		default: return '{' + tok + '}';
	}
}

/** A template in tokens: {token} for a field, [ … ] dropped whole when any token inside is empty. */
export function wsCiteTemplate(tpl: string, r: WsRef, it: WsCiteItem | null, n: number): string {
	const fill = (s: string) => s.replace(/\{([a-z*-]+)\}/g, (m: string, t: string) => tokenValue(t, r, it, n));
	const groups = String(tpl || '').replace(/\[([^[\]]*)\]/g, (m: string, inner: string) => {
		const toks = inner.match(/\{([a-z*-]+)\}/g) || [];
		return toks.some((t) => !tokenValue(t.slice(1, -1), r, it, n)) ? '' : fill(inner);
	});
	return fill(groups).replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// ── THE CITER: one book's citations in order ─────────────────────────────

export interface WsCiter {
	/** one citation's text in the style: in the text, or a note's text where notes is true; `lead`, a
	 * narrative note's names, which stay in the text before the mark */
	cite(c: WsCite): { text: string; note: boolean; lead?: string } | null;
	/** the list at the back: every source cited, in the style's order */
	list(): string[];
	heading(): string;
}

export function wsCiter(style: string, lib: Map<string, WsRef>, custom?: WsCiteCustom | null, heading?: string): WsCiter {
	const order: string[] = [];
	const noted = new Set<string>();
	const cu = custom || WS_CITE_CUSTOM_DEFAULT;
	const numbered = style === 'ieee' || (style === 'custom' && /\{n\}/.test(cu.entry + cu.inText));
	const num = (key: string) => { let i = order.indexOf(key); if (i < 0) { order.push(key); i = order.length - 1; } return i + 1; };
	const wrap = (s: string) => (style === 'ieee' ? '[' + s + ']' : style === 'custom' ? (cu.around === 'brackets' ? '[' + s + ']' : cu.around === 'none' ? s : '(' + s + ')') : '(' + s + ')');
	const def = WS_CITE_STYLES.find((x) => x.id === style) || WS_CITE_STYLES[0];
	return {
		cite(c: WsCite) {
			// a key the library does not hold: nothing, so the text keeps what was written and the editor marks it
			if (!c.items.length || c.items.some((it) => !lib.has(it.key))) return null;
			const found = c.items;
			if (style === 'chicago-notes') {
				const parts = found.map((it) => {
					const r = lib.get(it.key);
					if (!r) return '';
					num(it.key);
					const first = !noted.has(it.key);
					noted.add(it.key);
					return (it.prefix ? it.prefix + ' ' : '') + noteOf(r, it, first);
				});
				// SOURCES IN ONE NOTE: a semicolon between them and one full stop at the end; a full stop inside a
				// closing quote gives way to the semicolon outside it
				const ps = parts.filter(Boolean);
				const text = ps.map((p, i) => (i < ps.length - 1 ? p.replace(/\.(\u201d?)$/, '$1') : p)).join('; ');
				// A NARRATIVE ONE KEEPS ITS NAMES IN THE TEXT, the note's mark after them (A572 step 4)
				const r0 = c.narrative ? lib.get(found[0].key) : undefined;
				return { text, note: true, lead: r0 ? tokenValue('etal', r0, found[0], 0) : undefined };
			}
			const pieces = found.map((it) => {
				const r = lib.get(it.key);
				if (!r) return '';
				const n = num(it.key);
				const body = style === 'custom'
					? (c.narrative ? '' : wsCiteTemplate(it.suppress ? cu.inText.replace(/\{(etal|author|authors)\}\s*,?\s*/g, '') : cu.inText, r, it, n))
					: inTextOf(style, r, it, n, c.narrative);
				return (it.prefix ? it.prefix + ' ' : '') + body;
			});
			if (c.narrative) {
				const it = found[0];
				const r = lib.get(it.key);
				if (!r) return null;
				// IEEE keeps the names in the text: "Woolf [1] says", not "[1] says"
				if (style === 'ieee') return { text: etal(r, 'and') + ' [' + inTextOf(style, r, it, num(it.key), false) + ']', note: false };
				if (style === 'custom') return { text: tokenValue('etal', r, it, num(it.key)) + ' ' + wrap(wsCiteTemplate('{year}[, {page}]', r, it, num(it.key))), note: false };
				return { text: pieces[0], note: false };
			}
			// IEEE: each source in its own brackets, a prefix outside them ("see [1, p. 5]"), in the numbers' order
			if (style === 'ieee') {
				const ns = found.map((it) => num(it.key));
				const each = found.map((it, k) => { const r = lib.get(it.key); return { n: ns[k], s: r ? (it.prefix ? it.prefix + ' ' : '') + '[' + inTextOf(style, r, it, ns[k], false) + ']' : '' }; });
				return { text: each.sort((x, y) => x.n - y.n).map((e) => e.s).filter(Boolean).join(', '), note: false };
			}
			// NOTHING LEFT TO SAY (an author left out and no page: MLA's "Woolf herself [-@woolf1929]"): no "()"
			if (pieces.every((p) => !p.trim())) return { text: '', note: false };
			return { text: wrap(pieces.join('; ')), note: false };
		},
		list() {
			const keys = numbered ? order.slice() : order.slice().sort((x, y) => {
				const a = lib.get(x), b = lib.get(y);
				const k = (r: WsRef | undefined) => r ? ((r.authors[0] || r.editors[0] || { family: r.title, given: '' }).family + ' ' + r.year + ' ' + r.title).toLowerCase() : '';
				return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0;
			});
			return keys.map((key) => {
				const r = lib.get(key);
				if (!r) return '';
				const n = order.indexOf(key) + 1;
				return style === 'custom' ? wsCiteTemplate(cu.entry, r, null, n) : entryOf(style, r, n);
			}).filter(Boolean);
		},
		heading() { return heading && heading.trim() ? heading.trim() : def.heading; },
	};
}

// ── IN AN EXPORT (A572 step 4) ───────────────────────────────────────────

// what a citation is never looked for in: the frontmatter, code (fenced and inline) and comments, blanked to
// spaces so every place keeps its offset
function wsCiteMask(s: string): string {
	const blank = (m: string) => m.replace(/[^\n]/g, ' ');
	return s.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*(?=\n|$)/, blank)
		.replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*|$)/g, blank)
		.replace(/`[^`\n]+`/g, blank)
		.replace(/%%[\s\S]*?%%/g, blank)
		.replace(/<!--[\s\S]*?-->/g, blank);
}

/** The book's citations in the style, in reading order across its sections: each in the text as the style
 * writes it, or (Chicago's notes) a footnote of its own, its mark after the sentence's punctuation, which every
 * export already makes a real note; a key the library does not hold, code, frontmatter and comments left as
 * written. The list at the back joins the sections as one of its own (`bib`, its entries), after every count.
 * True when a citation was resolved. */
/** THE KEYS AN EXPORT CANNOT CITE (A670): every key the sections cite that the library does not hold, once
 * each, in the order they come. A citation naming one prints as typed, and its whole group with it. */
export function wsCiteMissing(sections: WsExportSection[], lib: Map<string, WsRef>): string[] {
	const out: string[] = [];
	for (const sec of sections) {
		if (sec.folder || sec.bib || !sec.markdown) continue;
		for (const c of wsFindCitations(wsCiteMask(sec.markdown))) for (const it of c.items) if (!lib.has(it.key) && !out.includes(it.key)) out.push(it.key);
	}
	return out;
}

/** …and what the export says of them: how many, the library by name (or that none is set), the first five */
export function wsCiteMissingText(keys: string[], library: string): string {
	// the Export pane's notice alone says it, in the interface's language (A695): a whole sentence a key, the
	// keys themselves the writer's own
	const n = keys.length, name = String(library || '').split('/').pop() || '';
	const five = wsUiJoin(keys.slice(0, 5));
	const list = n > 5 ? wsT('{list} and {more} more', { list: five, more: n - 5 }) : five;
	if (name) return n === 1 ? wsT('{n} citation key is not in {library}, so it prints as typed: {list}.', { n, library: name, list })
		: wsT('{n} citation keys are not in {library}, so they print as typed: {list}.', { n, library: name, list });
	return n === 1 ? wsT('no citation library is set (Settings \u2192 Export \u2192 Citations), so it prints as typed: {list}.', { list })
		: wsT('no citation library is set (Settings \u2192 Export \u2192 Citations), so they print as typed: {list}.', { n, list });
}

export function wsCiteSections(sections: WsExportSection[], citer: WsCiter): boolean {
	let n = 0, any = false;
	for (const sec of sections) {
		if (sec.folder || sec.bib || !sec.markdown) continue;
		const src = sec.markdown;
		const cites = wsFindCitations(wsCiteMask(src));
		if (!cites.length) continue;
		let out = '', at = 0;
		const defs: string[] = [];
		for (const c of cites) {
			const said = citer.cite(c);
			if (!said) continue;
			any = true;
			// nothing to print (an author left out, no page): the citation goes, and the space before it
			if (!said.note) { out += said.text ? src.slice(at, c.from) + said.text : src.slice(at, c.from).replace(/[ \t]+$/, ''); at = c.to; continue; }
			// A CITATION INSIDE A FOOTNOTE is written into it: a note in a note is no note (the sampler printed
			// "Flesch's.ws-cite-13"); its full stop gives way to the sentence's own
			const ls = src.lastIndexOf('\n', c.from - 1) + 1;
			if (/^\s*\[\^[^\]]+\]:/.test(src.slice(ls, c.from))) {
				// the note's full stop ends the sentence when one follows (inside a closing quote too: "Reading.”");
				// before a comma or the like it gives way
				const nx = src.charAt(c.to);
				const own = !said.lead && nx === '.' && /\.\u201d?$/.test(said.text);
				const t = /^[,;:!?.]$/.test(nx) && !own ? said.text.replace(/\.(\u201d?)$/, '$1') : said.text;
				out += src.slice(at, c.from) + (said.lead ? said.lead + ' (' + t.replace(/\.(\u201d?)$/, '$1') + ')' : t);
				at = c.to + (own ? 1 : 0);
				continue;
			}
			const label = '[^ws-cite-' + (++n) + ']';
			// a note opens with a capital: "See George D. Gopen …"
			defs.push(label + ': ' + said.text.charAt(0).toUpperCase() + said.text.slice(1));
			if (said.lead) { out += src.slice(at, c.from) + said.lead + label; at = c.to; continue; }
			// the mark after the sentence's own punctuation, no space before it: "as she says.¹"
			const p = (/^[.,;:!?]+/.exec(src.slice(c.to)) || [''])[0];
			out += src.slice(at, c.from).replace(/[ \t]+$/, '') + p + label;
			at = c.to + p.length;
		}
		sec.markdown = out + src.slice(at) + (defs.length ? '\n\n' + defs.join('\n\n') + '\n' : '');
	}
	const list = citer.list();
	if (list.length) sections.push({ title: citer.heading(), markdown: list.join('\n\n'), path: '', depth: 0, bib: true, entries: list });
	return any;
}

/** One source as the style lists it, as plain text: what a citation's hover shows while writing. */
export function wsCiteEntryText(style: string, r: WsRef, custom?: WsCiteCustom | null): string {
	const md = style === 'custom' ? wsCiteTemplate((custom || WS_CITE_CUSTOM_DEFAULT).entry, r, null, 0) : entryOf(style, r, 1);
	return md.replace(/^\[\d+\]\s*/, '').replace(/\*/g, '');
}

/** a pair of sources for the settings' preview when no library is set */
export const WS_CITE_SAMPLES: WsRef[] = [
	{ key: 'woolf1929', type: 'book', authors: [{ family: 'Woolf', given: 'Virginia' }], editors: [], year: '1929', title: 'A Room of One’s Own', container: '', publisher: 'Hogarth Press', place: 'London', volume: '', issue: '', pages: '', edition: '', doi: '', url: '' },
	{ key: 'smith2020', type: 'article', authors: [{ family: 'Smith', given: 'Jane' }, { family: 'Lee', given: 'Min' }], editors: [], year: '2020', title: 'Sentence Length and Reading Ease', container: 'Journal of Prose', publisher: '', place: '', volume: '12', issue: '3', pages: '45–67', edition: '', doi: '10.1000/jp.2020.12', url: '' },
];
