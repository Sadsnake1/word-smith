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
import { wsBag, wsListOf, wsStr, WS_CITE_KEY_START, WS_CITE_KEY_RE, wsUpToLast, wsTrimSpacesEnd } from './preamble';
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
	/** the year it first came out, a reprint's or a translation's (A713): BibLaTeX origdate, CSL original-date */
	origYear?: string;
	translators?: WsName[];
	series?: string;
	/** the day a web page was read, YYYY-MM-DD: BibLaTeX urldate, CSL accessed */
	accessed?: string;
}
export interface WsCiteItem { key: string; locator: string; prefix: string; suppress: boolean }
export interface WsCite { from: number; to: number; items: WsCiteItem[]; narrative: boolean }
/** a style of the writer's own: one source in the text, what goes around them, one entry in the list */
export interface WsCiteCustom { inText: string; around: string; entry: string }

export const WS_CITE_STYLES: { id: string; name: string; heading: string }[] = [
	{ id: 'apa', name: 'APA 7', heading: 'References' },
	{ id: 'chicago-ad', name: 'Chicago (author-date)', heading: 'References' },
	{ id: 'chicago-notes', name: 'Chicago (notes)', heading: 'Bibliography' },
	// #60's rest: Harvard as Cite Them Right sets it, the one most British universities ask for
	{ id: 'harvard', name: 'Harvard', heading: 'Reference list' },
	{ id: 'mla', name: 'MLA 9', heading: 'Works Cited' },
	{ id: 'ieee', name: 'IEEE', heading: 'References' },
	{ id: 'custom', name: 'Custom (tokens)', heading: 'References' },
];
export const WS_CITE_CUSTOM_DEFAULT: WsCiteCustom = {
	inText: '{etal} {year}[, {page}]',
	around: 'parens',
	entry: '{authors-full}. {year}. {title*}.[ {place}:][ {publisher}.]',
};
// EACH STYLE IN TOKENS (A739, the writer: "i don't see the customize option"): what Customize starts Your own from,
// citing and listing a book as the style does; one template for every kind of source, so an article or a chapter
// reads as a book does. Chicago's notes have none: a note is not written in tokens.
export const WS_CITE_PRESET_TOKENS: Record<string, WsCiteCustom> = {
	apa: { inText: '{etal-amp}, {year}[, {locator}]', around: 'parens', entry: '{authors-apa} ({year}). {title*}.[ {publisher}.][ {doi}]' },
	'chicago-ad': { inText: '{etal} {year}[, {page}]', around: 'parens', entry: '{authors-full}. {year}. {title*}.[ {place}:][ {publisher}.]' },
	harvard: { inText: '{etal}, {year}[, {locator}]', around: 'parens', entry: '{authors-harvard} ({year}) {title*}.[ {place}:][ {publisher}.]' },
	mla: { inText: '{etal}[ {page}]', around: 'parens', entry: '{authors-full}. {title*}.[ {publisher},] {year}.' },
	ieee: { inText: '{n}[, {locator}]', around: 'brackets', entry: '\\[{n}\\] {authors-initials}, {title*}.[ {place}:][ {publisher},] {year}.' },
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
	// A713, issue #60
	['{origyear}', 'the year it first came out, for a reprint or a translation'],
	['{translators}', 'the translators'],
	['{series}', 'the series'],
	['{accessed}', 'the day a web page was read'],
	// A739: what the styles write that no token said (APA's names and its "&", a page with its word)
	['{etal-amp}', 'like {etal}, with “&”: Smith & Jones'],
	['{authors-apa}', 'Smith, J., & Jones, A., as APA lists them'],
	['{locator}', 'the page with its word: p. 12, pp. 3–5, chap. 2'],
	// #60's rest: Harvard's names
	['{authors-harvard}', 'Smith, J. and Lee, M., as Harvard lists them'],
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
			origYear: (tx(f.origyear) || tx(f.origdate)).slice(0, 4), translators: wsBibNames(f.translator || ''),
			series: tx(f.series), accessed: tx(f.urldate).slice(0, 10),
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

// a CSL date as YYYY, YYYY-MM or YYYY-MM-DD (A713): its date-parts, else the first such run in its raw form
function wsCslDay(v: unknown): string {
	const d = wsRec(v);
	const p = wsListOf(wsListOf(d['date-parts'])[0]).map((x) => wsStr(x)).filter(Boolean);
	if (p.length) return [p[0]].concat(p.slice(1).map((x) => x.padStart(2, '0'))).join('-');
	return (wsStr(d.raw).match(/\d{4}(?:-\d{2}(?:-\d{2})?)?/) || [''])[0];
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
			origYear: wsCslDay(r['original-date']).slice(0, 4), translators: wsCslNames(r.translator),
			series: wsStr(r['collection-title']), accessed: wsCslDay(r.accessed),
		});
	}
	return out;
}

/** A library by its file's name: .json is CSL-JSON, anything else BibTeX. */
export function wsParseLibrary(path: string, text: string): Map<string, WsRef> {
	return /\.json$/i.test(String(path || '')) ? wsParseCslJson(text) : wsParseBibtex(text);
}

// ── IN THE TEXT ───────────────────────────────────────────────────────────

/** Pandoc's citations in a text: bracketed ([@a, p. 12; -@b]) and narrative (@a). An email is not one. */
export function wsFindCitations(text: string): WsCite[] {
	const src = String(text || '');
	const out: WsCite[] = [];
	const BR = new RegExp('\\[([^[\\]]*?-?@(?:' + WS_CITE_KEY_START + '|\\{)[^[\\]]*)\\]', 'gu');
	let m: RegExpExecArray | null;
	while ((m = BR.exec(src))) {
		if (src.charAt(m.index + m[0].length) === '(' || src.charAt(m.index - 1) === '[' || src.charAt(m.index + m[0].length) === ']') continue;
		const items: WsCiteItem[] = [];
		let ok = true;
		for (const part of m[1].split(';')) {
			const pm = new RegExp('^([\\s\\S]*?)(-?)@(' + WS_CITE_KEY_RE + ')([\\s\\S]*)$', 'u').exec(part);
			// a letter before the @ in any alphabet is an email's (jø@post.no), not a citation
			if (!pm || /\S/.test(pm[1]) && /[\p{L}\p{N}_]$/u.test(pm[1])) { ok = false; break; }
			let key = pm[3];
			let rest = pm[4];
			// a key in braces is all of what they hold; a bare one leaves its last punctuation to the sentence
			const tail = key.startsWith('{') ? null : /[.:,;?!/-]+$/.exec(key);
			if (key.startsWith('{')) key = key.slice(1, -1);
			else if (tail) { rest = tail[0] + rest; key = key.slice(0, -tail[0].length); }
			items.push({ key, prefix: pm[1].trim(), suppress: pm[2] === '-', locator: rest.replace(/^\s*,\s*/, '').trim() });
		}
		if (ok && items.length) out.push({ from: m.index, to: m.index + m[0].length, items, narrative: false });
	}
	// a wikilink and a link's own text are not prose to cite in. The two kinds as one pattern with both found them (the
	// first to start wins, the wikilink where both start), each read only up to the text's last closer of its own, where
	// every one ends (wsUpToLast: past it a try from every "[[" or "[x](" read on to the end, the square of a line of
	// them, and the editor reads every line through here)
	const links: [number, number][] = [];
	const WL = /\[\[[^\]]*\]\]/g, LN = /\[[^[\]]*\]\([^)]*\)/g;
	const wlText = wsUpToLast(src, ']]'), lnText = wsUpToLast(src, ')');
	const next = (re: RegExp, s: string, from: number) => { re.lastIndex = from; return re.exec(s); };
	let w = next(WL, wlText, 0), l = next(LN, lnText, 0);
	while (w || l) {
		const t = w && (!l || w.index <= l.index) ? w : l;
		if (!t) break;
		const end = t.index + t[0].length;
		links.push([t.index, end]);
		if (w && w.index < end) w = next(WL, wlText, end);
		if (l && l.index < end) l = next(LN, lnText, end);
	}
	const NR = new RegExp('(^|[^\\p{L}\\p{N}_@\\[\\]`])@(' + WS_CITE_KEY_RE + ')', 'gu');
	while ((m = NR.exec(src))) {
		const at = m.index + m[1].length;
		if (out.some((c) => at >= c.from && at < c.to) || links.some(([a, b]) => at >= a && at < b)) continue;
		const braced = m[2].startsWith('{');
		const key = braced ? m[2].slice(1, -1) : m[2].replace(/[.:,;?!/-]+$/, '');
		out.push({ from: at, to: at + 1 + (braced ? m[2].length : key.length), items: [{ key, locator: '', prefix: '', suppress: false }], narrative: true });
	}
	return out.sort((a, b) => a.from - b.from);
}

// ── THE BOOK'S LANGUAGE (A713, issue #60) ────────────────────────────────
//
// brg-2000: the footnote "uses English formatting (not French)". The words a style writes around the fields, per
// language: "and", "ed.", "trans.", "In", "n.d.", the edition, the title's quotation marks and whether a comma
// goes inside them. English is the styles' own; the language is the book's (Settings → Language), and a pack may
// set any of them with a `cite-<term>` line (cite-and: et). IEEE keeps its English: a technical style.
export interface WsCiteTerms { code?: string; and: string; ed: string; editedBy: string; trans: string; translatedBy: string; in: string; nd: string; accessed: string; firstPublished: string; apaOriginal: string; edition: string; ibid: string; availableAt: string; open: string; close: string; inside: boolean }
export const WS_CITE_TERMS_EN: WsCiteTerms = { and: 'and', ed: 'ed.', editedBy: 'edited by', trans: 'trans.', translatedBy: 'Translated by', in: 'In', nd: 'n.d.', accessed: 'accessed', firstPublished: 'First published', apaOriginal: 'Original work published', edition: '{n} ed.', ibid: 'Ibid.', availableAt: 'Available at:', open: '\u201c', close: '\u201d', inside: true };
export const WS_CITE_TERMS: Record<string, Partial<WsCiteTerms>> = {
	'en-GB': { open: '\u2018', close: '\u2019', inside: false },
	fr: { ibid: 'Ibid.', availableAt: 'Disponible sur\u00a0:', and: 'et', ed: '\u00e9d.', editedBy: 'sous la direction de', trans: 'trad.', translatedBy: 'Traduit par', in: 'Dans', nd: 's.d.', accessed: 'consult\u00e9 le', firstPublished: 'Premi\u00e8re publication en', apaOriginal: '\u0152uvre originale publi\u00e9e en', edition: '{n}e \u00e9d.', open: '\u00ab\u00a0', close: '\u00a0\u00bb', inside: false },
	de: { ibid: 'Ebd.', availableAt: 'Verfügbar unter:', and: 'und', ed: 'hg. v.', editedBy: 'herausgegeben von', trans: '\u00fcbers. v.', translatedBy: '\u00dcbersetzt von', in: 'In', nd: 'o. J.', accessed: 'abgerufen am', firstPublished: 'Erstver\u00f6ffentlichung', apaOriginal: 'Originalwerk ver\u00f6ffentlicht', edition: '{n}. Aufl.', open: '\u201e', close: '\u201c', inside: false },
	es: { ibid: 'Ibid.', availableAt: 'Disponible en:', and: 'y', ed: 'ed.', editedBy: 'editado por', trans: 'trad.', translatedBy: 'Traducido por', in: 'En', nd: 's. f.', accessed: 'consultado el', firstPublished: 'Publicado originalmente en', apaOriginal: 'Obra original publicada en', edition: '{n}.\u00aa ed.', open: '\u00ab', close: '\u00bb', inside: false },
	it: { ibid: 'Ibid.', availableAt: 'Disponibile su:', and: 'e', ed: 'a cura di', editedBy: 'a cura di', trans: 'trad.', translatedBy: 'Traduzione di', in: 'In', nd: 's.d.', accessed: 'consultato il', firstPublished: 'Prima edizione', apaOriginal: 'Opera originale pubblicata nel', edition: '{n}\u00aa ed.', open: '\u00ab', close: '\u00bb', inside: false },
	pt: { ibid: 'Ibid.', availableAt: 'Disponível em:', and: 'e', ed: 'ed.', editedBy: 'editado por', trans: 'trad.', translatedBy: 'Traduzido por', in: 'In', nd: 's.d.', accessed: 'consultado em', firstPublished: 'Publicado originalmente em', apaOriginal: 'Obra original publicada em', edition: '{n}.\u00aa ed.', open: '\u00ab', close: '\u00bb', inside: false },
	'pt-BR': { ibid: 'Ibid.', availableAt: 'Disponível em:', and: 'e', ed: 'ed.', editedBy: 'editado por', trans: 'trad.', translatedBy: 'Traduzido por', in: 'In', nd: 's.d.', accessed: 'acesso em', firstPublished: 'Publicado originalmente em', apaOriginal: 'Obra original publicada em', edition: '{n}.\u00aa ed.', open: '\u201c', close: '\u201d', inside: false },
	ro: { ibid: 'Ibidem', availableAt: 'Disponibil la:', and: '\u0219i', ed: 'ed.', editedBy: 'editat de', trans: 'trad.', translatedBy: 'Traducere de', in: '\u00cen', nd: 'f.a.', accessed: 'accesat la', firstPublished: 'Prima edi\u021bie', apaOriginal: 'Lucrare original\u0103 publicat\u0103 \u00een', edition: 'ed. a {n}-a', open: '\u201e', close: '\u201d', inside: false },
	nl: { ibid: 'Ibid.', availableAt: 'Beschikbaar via:', and: 'en', ed: 'red.', editedBy: 'onder redactie van', trans: 'vert.', translatedBy: 'Vertaald door', in: 'In', nd: 'z.j.', accessed: 'geraadpleegd op', firstPublished: 'Oorspronkelijk verschenen in', apaOriginal: 'Origineel werk gepubliceerd in', edition: '{n}e dr.', open: '\u201c', close: '\u201d', inside: false },
	pl: { ibid: 'Tamże', availableAt: 'Dostępny w internecie:', and: 'i', ed: 'red.', editedBy: 'pod redakcj\u0105', trans: 't\u0142um.', translatedBy: 'Przek\u0142ad', in: 'W', nd: 'b.r.', accessed: 'dost\u0119p', firstPublished: 'Pierwsze wydanie', apaOriginal: 'Orygina\u0142 opublikowany w', edition: 'wyd. {n}', open: '\u201e', close: '\u201d', inside: false },
	sv: { ibid: 'Ibid.', availableAt: 'Tillgänglig:', and: 'och', ed: 'red.', editedBy: 'redigerad av', trans: '\u00f6vers.', translatedBy: '\u00d6versatt av', in: 'I', nd: 'u.\u00e5.', accessed: 'h\u00e4mtad', firstPublished: 'F\u00f6rst utgiven', apaOriginal: 'Originalverket publicerat', edition: '{n} uppl.', open: '\u201d', close: '\u201d', inside: false },
	da: { ibid: 'Ibid.', availableAt: 'Tilgængelig på:', and: 'og', ed: 'red.', editedBy: 'redigeret af', trans: 'overs.', translatedBy: 'Oversat af', in: 'I', nd: 'u.\u00e5.', accessed: 'bes\u00f8gt', firstPublished: 'F\u00f8rst udgivet', apaOriginal: 'Originalv\u00e6rket udgivet', edition: '{n}. udg.', open: '\u00bb', close: '\u00ab', inside: false },
	no: { ibid: 'Ibid.', availableAt: 'Tilgjengelig fra:', and: 'og', ed: 'red.', editedBy: 'redigert av', trans: 'overs.', translatedBy: 'Oversatt av', in: 'I', nd: 'u.\u00e5.', accessed: 'lest', firstPublished: 'F\u00f8rst utgitt', apaOriginal: 'Originalverket utgitt', edition: '{n}. utg.', open: '\u00ab', close: '\u00bb', inside: false },
	ru: { ibid: 'Там же', availableAt: 'Режим доступа:', and: '\u0438', ed: '\u043f\u043e\u0434 \u0440\u0435\u0434.', editedBy: '\u043f\u043e\u0434 \u0440\u0435\u0434\u0430\u043a\u0446\u0438\u0435\u0439', trans: '\u043f\u0435\u0440.', translatedBy: '\u041f\u0435\u0440\u0435\u0432\u043e\u0434:', in: '\u0412', nd: '\u0431. \u0433.', accessed: '\u0434\u0430\u0442\u0430 \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u044f', firstPublished: '\u0412\u043f\u0435\u0440\u0432\u044b\u0435 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e \u0432', apaOriginal: '\u041e\u0440\u0438\u0433\u0438\u043d\u0430\u043b \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d \u0432', edition: '{n}-\u0435 \u0438\u0437\u0434.', open: '\u00ab', close: '\u00bb', inside: false },
	uk: { ibid: 'Там само', availableAt: 'Режим доступу:', and: '\u0456', ed: '\u0437\u0430 \u0440\u0435\u0434.', editedBy: '\u0437\u0430 \u0440\u0435\u0434\u0430\u043a\u0446\u0456\u0454\u044e', trans: '\u043f\u0435\u0440.', translatedBy: '\u041f\u0435\u0440\u0435\u043a\u043b\u0430\u0434:', in: '\u0423', nd: '\u0431. \u0440.', accessed: '\u0434\u0430\u0442\u0430 \u0437\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f', firstPublished: '\u0423\u043f\u0435\u0440\u0448\u0435 \u043e\u043f\u0443\u0431\u043b\u0456\u043a\u043e\u0432\u0430\u043d\u043e', apaOriginal: '\u041e\u0440\u0438\u0433\u0456\u043d\u0430\u043b \u043e\u043f\u0443\u0431\u043b\u0456\u043a\u043e\u0432\u0430\u043d\u043e', edition: '{n}-\u0433\u0435 \u0432\u0438\u0434.', open: '\u00ab', close: '\u00bb', inside: false },
	ja: { ibid: '同上', availableAt: '入手先：', and: '\u30fb', ed: '\u7de8', editedBy: '\u7de8', trans: '\u8a33', translatedBy: '\u7ffb\u8a33\uff1a', in: '\u6240\u53ce', nd: '\u520a\u884c\u5e74\u4e0d\u660e', accessed: '\u95b2\u89a7\u65e5', firstPublished: '\u521d\u7248', apaOriginal: '\u539f\u8457', edition: '\u7b2c{n}\u7248', open: '\u300c', close: '\u300d', inside: false },
	'zh-Hans': { ibid: '同上', availableAt: '网址：', and: '\u548c', ed: '\u7f16', editedBy: '\u7f16', trans: '\u8bd1', translatedBy: '\u8bd1\u8005\uff1a', in: '\u8f7d\u4e8e', nd: '\u65e0\u65e5\u671f', accessed: '\u8bbf\u95ee\u65e5\u671f', firstPublished: '\u521d\u7248\u4e8e', apaOriginal: '\u539f\u8457\u51fa\u7248\u4e8e', edition: '\u7b2c{n}\u7248', open: '\u201c', close: '\u201d', inside: false },
	// A767: the three new languages' (the packs' builders, checked against their style guides)
	tr: { ibid: 'A.g.e.', availableAt: 'Erişim adresi:', and: 've', ed: 'ed.', editedBy: 'yay. haz.', trans: 'çev.', translatedBy: 'Çeviren:', in: 'İçinde:', nd: 't.y.', accessed: 'erişim tarihi', firstPublished: 'İlk basım', apaOriginal: 'Özgün eserin yayım yılı', edition: '{n}. bs.', open: '“', close: '”', inside: false },
	id: { ibid: 'Ibid.', availableAt: 'Tersedia di:', and: 'dan', ed: 'ed.', editedBy: 'disunting oleh', trans: 'terj.', translatedBy: 'Diterjemahkan oleh', in: 'Dalam', nd: 't.t.', accessed: 'diakses pada', firstPublished: 'Pertama kali diterbitkan tahun', apaOriginal: 'Karya asli diterbitkan tahun', edition: 'ed. ke-{n}', open: '“', close: '”', inside: false },
	'zh-Hant': { ibid: '同上', availableAt: '網址：', and: '與', ed: '編', editedBy: '編', trans: '譯', translatedBy: '譯者：', in: '載於', nd: '無日期', accessed: '檢索日期', firstPublished: '初版於', apaOriginal: '原著出版於', edition: '第{n}版', open: '「', close: '」', inside: false },
	ko: { ibid: '위의 책', availableAt: 'URL:', and: '\ubc0f', ed: '\ud3b8', editedBy: '\ud3b8', trans: '\uc5ed', translatedBy: '\ubc88\uc5ed:', in: '\uc218\ub85d', nd: '\uc5f0\ub3c4 \ubbf8\uc0c1', accessed: '\uc811\uc18d\uc77c', firstPublished: '\ucd08\ud310', apaOriginal: '\uc6d0\uc800 \ucd9c\ud310', edition: '\uc81c{n}\ud310', open: '\u201c', close: '\u201d', inside: false },
};
/** a language's terms: English, the language's own over them, then a pack's `cite-<term>` lines (cite-edited-by) */
export function wsCiteTermsFor(lang: string, props?: Record<string, string> | null): WsCiteTerms {
	const code = String(lang || 'en');
	const out: WsCiteTerms = Object.assign({}, WS_CITE_TERMS_EN, WS_CITE_TERMS[code.split('-')[0]] || {}, WS_CITE_TERMS[code] || {});
	if (props) for (const k of Object.keys(WS_CITE_TERMS_EN) as (keyof WsCiteTerms)[]) {
		const v = props['cite-' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())];
		if (typeof v !== 'string' || !v.trim()) continue;
		if (k === 'inside') out.inside = /^(yes|true|inside)$/i.test(v.trim());
		else out[k] = v.trim();
	}
	out.code = code;
	return out;
}
// THE TERMS IN FORCE: set by the citer around every answer (all synchronous), English otherwise
let T: WsCiteTerms = WS_CITE_TERMS_EN;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// the year it first came out, when it is not the year of this edition
const origOf = (r: WsRef) => (r.origYear && r.origYear !== r.year ? r.origYear : '');
const ord = (n: string) => { const k = Number(n) % 100; return n + (k > 10 && k < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][Number(n) % 10] || 'th'); };
// an edition: "2" is "2nd ed." ("2e \u00e9d." in French), anything else as written
const editionOf = (e: string) => (!e ? '' : /^\d+$/.test(e) ? T.edition.replace('{n}', T.code && T.code !== 'en' && !T.code.startsWith('en-') ? e : ord(e)) : e);
// a day, YYYY-MM-DD, in the book's language: October 13, 2026 / 13 octobre 2026
const dayOf = (d: string) => {
	const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(d || ''));
	if (!m) return String(d || '');
	if (!m[2]) return m[1];
	try { return new Intl.DateTimeFormat(T.code === 'zh-Hans' ? 'zh' : (T.code || 'en'), m[3] ? { year: 'numeric', month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long' }).format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] || 1))); }
	catch { return d; }
};
const tNames = (r: WsRef) => (r.translators || []).map((x) => [x.given, x.family].filter(Boolean).join(' '));

// ── THE STYLES ────────────────────────────────────────────────────────────

const fam = (n: WsName) => n.family || n.given;
const initials = (g: string) => g.split(/[\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + '.').join(' ');
const full = (n: WsName) => [n.given, n.family].filter(Boolean).join(' ');
const inverted = (n: WsName) => n.given ? n.family + ', ' + n.given : n.family;
const join = (xs: string[], and: string, comma = T.and === 'and') => xs.length <= 1 ? (xs[0] || '')
	: xs.length === 2 ? xs[0] + ' ' + and + ' ' + xs[1]
		: xs.slice(0, -1).join(', ') + (comma ? ',' : '') + ' ' + and + ' ' + xs[xs.length - 1];
const ital = (s: string) => (s ? '*' + s + '*' : '');
// A TITLE IN QUOTATION MARKS, the language's (A713): a comma or a full stop that American style puts inside them goes
// outside where the language does (« Titre », / \u201eTitel\u201c,)
const quoted = (s: string) => {
	if (!s) return '';
	if (!T.inside) { const m = /^([\s\S]*?)([.,])$/.exec(s); if (m) return T.open + m[1] + T.close + m[2]; }
	return T.open + s + T.close;
};
const end = (s: string) => (s && !/[.?!]$/.test(s) ? s + '.' : s);
const doiLink = (r: WsRef) => (r.doi ? 'https://doi.org/' + r.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : r.url);
// a title in italics with its full stop outside them: *A Room of One's Own*.
const italEnd = (s: string) => (s ? ital(s) + (/[.?!]$/.test(s) ? '' : '.') : '');
// the list's names: the first inverted, a comma before the "and" (Smith, Jane, and Min Lee)
// APA's names: Smith, J., & Jones, A. (its list, and {authors-apa} since A739)
const apaNames = (a: WsName[]) => {
	const names = a.map((x) => x.given ? x.family + ', ' + initials(x.given) : x.family);
	return names.length <= 1 ? (names[0] || '') : names.slice(0, -1).join(', ') + ', & ' + names[names.length - 1];
};
const listInverted = (a: WsName[]) => a.length === 2 ? inverted(a[0]) + (T.and === 'and' ? ', and ' : ' ' + T.and + ' ') + full(a[1])
	: join(a.map((x, k) => (k === 0 ? inverted(x) : full(x))), T.and);

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
		const who = etal(r, narrative ? T.and : '&');
		// a reprint: (Marx, 1867/1993)
		const yr = (origOf(r) ? origOf(r) + '/' : '') + (r.year || T.nd);
		if (narrative) return who + ' (' + [yr, pageWord(loc)].filter(Boolean).join(', ') + ')';
		return [it.suppress ? '' : who, yr, pageWord(loc)].filter(Boolean).join(', ');
	}
	if (style === 'chicago-ad') {
		const who = etal(r, T.and, 3);
		// a reprint: (Marx [1867] 1993, 45)
		const tail = (origOf(r) ? '[' + origOf(r) + '] ' : '') + (r.year || T.nd) + (loc.value ? ', ' + bareLoc(loc) : '');
		if (narrative) return who + ' (' + tail + ')';
		return (it.suppress ? '' : who + ' ') + tail;
	}
	// HARVARD (#60's rest, Cite Them Right): (Woolf, 1929, p. 108); three names before "et al."; Woolf (1929)
	if (style === 'harvard') {
		const who = etal(r, T.and, 3);
		const yr = r.year || harvNd();
		if (narrative) return who + ' (' + [yr, pageWord(loc)].filter(Boolean).join(', ') + ')';
		return [it.suppress ? '' : who, yr, pageWord(loc)].filter(Boolean).join(', ');
	}
	if (style === 'mla') {
		const who = etal(r, T.and);
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
		const who = apaNames(a);
		const head = (who ? end(who) + (eds ? ' (Ed' + (a.length > 1 ? 's' : '') + '.).' : '') + ' ' : '') + '(' + (r.year || T.nd) + '). ';
		if (r.type === 'article') return head + end(r.title) + ' ' + ital(r.container) + (r.volume ? ', ' + ital(r.volume) + (r.issue ? '(' + r.issue + ')' : '') : '') + (r.pages ? ', ' + r.pages : '') + '.' + (link ? ' ' + link : '');
		if (r.type === 'chapter') return head + end(r.title) + ' ' + T.in + ' ' + (r.editors.length ? join(r.editors.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family), '&', false) + ' (Ed' + (r.editors.length > 1 ? 's' : '') + '.), ' : '') + ital(r.container) + (r.pages ? ' (pp. ' + r.pages + ')' : '') + '. ' + end(r.publisher) + (link ? ' ' + link : '');
		// a book or a web page: no stray space where there is no publisher (the sampler: "Obsidian Help.  https://")
		// (2nd ed.; J. Roy, Trans.) after the title; (Original work published 1867) at the end (A713)
		const trA = (r.translators || []).map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family);
		const paren = [r.edition ? editionOf(r.edition) : '', trA.length ? join(trA, '&', false) + ', ' + cap(T.trans) : ''].filter(Boolean).join('; ');
		return [head + ital(r.title) + (paren ? ' (' + paren + ')' : '') + '.', end(r.publisher), link, origOf(r) ? '(' + T.apaOriginal + ' ' + origOf(r) + ')' : ''].filter(Boolean).join(' ');
	}
	if (style === 'chicago-ad' || style === 'chicago-notes') {
		const who = end(listInverted(a));
		const pub = [r.place, r.publisher].filter(Boolean).join(': ');
		if (style === 'chicago-ad') {
			const head = (who ? who + ' ' : '') + end((origOf(r) ? '(' + origOf(r) + ') ' : '') + (r.year || T.nd)) + ' ';
			if (r.type === 'article') return head + quoted(end(r.title)) + ' ' + ital(r.container) + (r.volume ? ' ' + r.volume : '') + (r.issue ? ' (' + r.issue + ')' : '') + (r.pages ? ': ' + r.pages : '') + '.' + (link ? ' ' + link + '.' : '');
			if (r.type === 'chapter') return head + quoted(end(r.title)) + ' ' + T.in + ' ' + ital(r.container) + (r.editors.length ? ', ' + T.editedBy + ' ' + join(r.editors.map(full), T.and) : '') + (r.pages ? ', ' + r.pages : '') + '. ' + end(pub);
			if (r.type === 'web') return head + quoted(end(r.title)) + (link ? ' ' + link + '.' : '');
			return [head + italEnd(r.title), bibAfterTitle(r), end(pub)].filter(Boolean).join(' ');
		}
		if (r.type === 'article') return (who ? who + ' ' : '') + quoted(end(r.title)) + ' ' + ital(r.container) + (r.volume ? ' ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.year ? ' (' + r.year + ')' : '') + (r.pages ? ': ' + r.pages : '') + '.' + (link ? ' ' + link + '.' : '');
		if (r.type === 'chapter') return (who ? who + ' ' : '') + quoted(end(r.title)) + ' ' + T.in + ' ' + ital(r.container) + (r.editors.length ? ', ' + T.editedBy + ' ' + join(r.editors.map(full), T.and) : '') + (r.pages ? ', ' + r.pages : '') + '. ' + end([pub, r.year].filter(Boolean).join(', '));
		if (r.type === 'web') return (who ? who + ' ' : '') + quoted(end(r.title)) + (r.year ? ' ' + end(r.year) : '') + (r.accessed ? ' ' + end(cap(T.accessed) + ' ' + dayOf(r.accessed)) : '') + (link ? ' ' + link + '.' : '');
		// a book: its translator, edition and series after the title; a reprint's first year last ("First published 1867.")
		return [(who ? who + ' ' : '') + italEnd(r.title), bibAfterTitle(r), end([pub, r.year].filter(Boolean).join(', ')), origOf(r) ? end(T.firstPublished + ' ' + origOf(r)) : ''].filter(Boolean).join(' ');
	}
	if (style === 'harvard') return harvardEntry(r);
	if (style === 'mla') {
		const who = a.length > 2 ? inverted(a[0]) + ', et al.' : end(listInverted(a));
		const head = who ? (who.endsWith('.') ? who : who + '.') + ' ' : '';
		if (r.type === 'article') return head + quoted(end(r.title)) + ' ' + ital(r.container) + (r.volume ? ', vol. ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.year ? ', ' + r.year : '') + (r.pages ? ', pp. ' + r.pages : '') + '.' + (link ? ' ' + link.replace(/^https?:\/\//, '') + '.' : '');
		if (r.type === 'chapter') return head + quoted(end(r.title)) + ' ' + ital(r.container) + (r.editors.length ? ', ' + T.editedBy + ' ' + join(r.editors.map(full), T.and) : '') + ', ' + [r.publisher, r.year].filter(Boolean).join(', ') + (r.pages ? ', pp. ' + r.pages : '') + '.';
		if (r.type === 'web') return head + quoted(end(r.title)) + (r.year ? ' ' + r.year + ',' : '') + (link ? ' ' + link.replace(/^https?:\/\//, '') + '.' : '');
		const trM = tNames(r);
		return [head + italEnd(r.title), origOf(r) ? end(origOf(r)) : '', trM.length ? T.translatedBy + ' ' + join(trM, T.and) + ',' : '', end([r.publisher, r.year].filter(Boolean).join(', '))].filter(Boolean).join(' ');
	}
	if (style === 'ieee') {
		const names = a.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family);
		const who = names.length > 6 ? names[0] + ' et al.' : join(names, T.and);
		const head = '[' + n + '] ' + (who ? who + ', ' : '');
		if (r.type === 'article') return head + quoted(r.title + ',') + ' ' + ital(r.container) + (r.volume ? ', vol. ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.pages ? ', pp. ' + r.pages : '') + (r.year ? ', ' + r.year : '') + '.' + (r.doi ? ' doi: ' + r.doi + '.' : '');
		if (r.type === 'chapter') return head + quoted(r.title + ',') + ' ' + lc(T.in) + ' ' + ital(r.container) + (r.editors.length ? ', ' + join(r.editors.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family), T.and) + ', Ed' + (r.editors.length > 1 ? 's' : '') + '.' : '') + ' ' + end([[r.place, r.publisher].filter(Boolean).join(': '), r.year, r.pages ? 'pp. ' + r.pages : ''].filter(Boolean).join(', '));
		if (r.type === 'web') return head + quoted(r.title + '.') + (link ? ' [Online]. Available: ' + link : '');
		return [head + ital(r.title) + '.', end([[r.place, r.publisher].filter(Boolean).join(': '), r.year].filter(Boolean).join(', '))].filter(Boolean).join(' ');
	}
	return r.title;
}

// HARVARD'S LIST, as Cite Them Right sets it (#60's rest): Woolf, V. (1929) *A Room of One's Own*. London: Hogarth
// Press. Initials close up (White, E.B.), no comma before the "and", "(ed.)" after an editor who leads; the title
// first where nobody wrote it (*Our Story* (1999)); an article's title in single quotes in English, the language's
// own marks otherwise; "Available at:" before a link and "(Accessed: …)" after it
const harvInitials = (g: string) => initials(g).replace(/\. /g, '.');
const harvNames = (a: WsName[]) => join(a.map((x) => (x.given ? x.family + ', ' + harvInitials(x.given) : x.family)), T.and, false);
// Cite Them Right writes "no date" out; a language keeps its own abbreviation
const harvNd = () => (T.nd === WS_CITE_TERMS_EN.nd ? 'no date' : T.nd);
function harvardEntry(r: WsRef): string {
	const a = r.authors.length ? r.authors : r.editors;
	const eds = (n: number) => '(' + (n > 1 && T.ed === WS_CITE_TERMS_EN.ed ? 'eds' : T.ed) + ')';
	const who = a.length ? harvNames(a) + (r.authors.length ? '' : ' ' + eds(a.length)) : '';
	const yr = '(' + (r.year || harvNd()) + ')';
	const head = (title: string) => (who ? who + ' ' + yr + ' ' + title : title + ' ' + yr);
	const q = (s: string) => (!T.code || /^en/.test(T.code) ? '‘' + s + '’' : quoted(s));
	const link = doiLink(r);
	const online = [link ? T.availableAt + (/：$/.test(T.availableAt) ? '' : ' ') + link : '',
		r.accessed ? '(' + cap(T.accessed) + (T.accessed === WS_CITE_TERMS_EN.accessed ? ':' : '') + ' ' + dayOf(r.accessed) + ')' : ''].filter(Boolean).join(' ');
	const tail = online ? ' ' + online + '.' : '';
	const pub = [r.place, r.publisher].filter(Boolean).join(': ');
	if (r.type === 'article') return head(q(r.title)) + ', ' + ital(r.container) + (r.volume ? ', ' + r.volume + (r.issue ? '(' + r.issue + ')' : '') : '') + (r.pages ? ', pp. ' + r.pages : '') + '.' + tail;
	if (r.type === 'chapter') {
		const where = [pub, r.pages ? 'pp. ' + r.pages : ''].filter(Boolean).join(', ');
		return head(q(r.title)) + ', ' + lc(T.in) + ' ' + (r.editors.length ? harvNames(r.editors) + ' ' + eds(r.editors.length) + ' ' : '') + italEnd(r.container) + (where ? ' ' + end(where) : '') + tail;
	}
	const title = who ? italEnd(r.title) : ital(r.title);
	if (r.type === 'web') return head(title) + tail;
	// a book, and what reads as one (a thesis, a report): its edition (2nd edn.), its translator, where and by whom
	// with its series, a reprint's first year
	const ed = r.edition ? end(T.edition === WS_CITE_TERMS_EN.edition ? editionOf(r.edition).replace(/ ed\.$/, ' edn') : editionOf(r.edition)) : '';
	const tr = (r.translators || []).map((x) => (x.given ? harvInitials(x.given) + ' ' : '') + x.family);
	const where = [pub, r.series ? '(' + r.series + ')' : ''].filter(Boolean).join(' ');
	return [head(title), ed, tr.length ? end(T.translatedBy + ' ' + join(tr, T.and, false)) : '', where ? end(where) : '', origOf(r) ? end(T.firstPublished + ' ' + origOf(r)) : ''].filter(Boolean).join(' ') + tail;
}

// after a book's title in a list: its translator, its edition, its series (A713)
function bibAfterTitle(r: WsRef): string {
	const tr = tNames(r);
	return [tr.length ? end(T.translatedBy + ' ' + join(tr, T.and)) : '', r.edition ? end(editionOf(r.edition)) : '', r.series ? end(r.series) : ''].filter(Boolean).join(' ');
}

// Chicago's note: the first in full, then short
function noteOf(r: WsRef, it: WsCiteItem, first: boolean): string {
	const a = r.authors.length ? r.authors : r.editors;
	const loc = bareLoc(wsLocator(it.locator));
	// THE SHORT TITLE: its first words up to the subtitle, an opening article dropped, four at most ("A Room of
	// One's Own" is "Room of One's Own", not "A Room of One's")
	const short = r.title.split(/[:.?!]/)[0].trim().replace(/^(a|an|the)\s+/i, '').split(/\s+/).slice(0, 4).join(' ');
	const whoShort = a.length > 3 ? fam(a[0]) + ' et al.' : join(a.map(fam), T.and);
	if (!first) {
		// a title in quotes takes the comma or the full stop inside them: “Sentence Length,” 50. / “Sentence Length.”
		if (r.type === 'article' || r.type === 'chapter' || r.type === 'web') return [whoShort, loc ? quoted(short + ',') + ' ' + loc + '.' : quoted(short + '.')].filter(Boolean).join(', ');
		return end([whoShort, ital(short), loc].filter(Boolean).join(', '));
	}
	const who = a.length > 3 ? full(a[0]) + ' et al.' : join(a.map(full), T.and);
	const pub = [r.place, r.publisher].filter(Boolean).join(': ');
	if (r.type === 'article') return (who ? who + ', ' : '') + quoted(r.title + ',') + ' ' + ital(r.container) + (r.volume ? ' ' + r.volume : '') + (r.issue ? ', no. ' + r.issue : '') + (r.year ? ' (' + r.year + ')' : '') + (loc ? ': ' + loc : r.pages ? ': ' + r.pages : '') + '.';
	if (r.type === 'chapter') return (who ? who + ', ' : '') + quoted(r.title + ',') + ' ' + lc(T.in) + ' ' + ital(r.container) + (r.editors.length ? ', ' + T.ed + ' ' + join(r.editors.map(full), T.and) : '') + ' (' + [pub, r.year].filter(Boolean).join(', ') + ')' + (loc ? ', ' + loc : '') + '.';
	// A WEB PAGE: its title in quotes and its address (the sampler: "Obsidian, *Obsidian Help* ().")
	if (r.type === 'web') {
		const tail = [r.year, r.accessed ? T.accessed + ' ' + dayOf(r.accessed) : '', doiLink(r), loc].filter(Boolean).join(', ');
		return (who ? who + ', ' : '') + (tail ? quoted(r.title + ',') + ' ' + tail + '.' : quoted(r.title + '.'));
	}
	// no empty brackets where there is no publisher, place or year; A REPRINT'S FIRST YEAR FIRST (A713, issue #60: "the
	// original date, which better reflects the chronology"): (1867; Paris: PUF, 1993); a translator and an edition
	// after the title: *Le Capital*, trans. Joseph Roy, 2nd ed.
	const py = [origOf(r), [pub, r.year].filter(Boolean).join(', ')].filter(Boolean).join('; ');
	const tr = tNames(r);
	const after = (tr.length ? ', ' + T.trans + ' ' + join(tr, T.and) : '') + (r.edition ? ', ' + editionOf(r.edition) : '');
	return (who ? who + ', ' : '') + ital(r.title) + after + (py ? ' (' + py + ')' : '') + (loc ? ', ' + loc : '') + '.';
}

// ── A STYLE OF ONE'S OWN, IN TOKENS ───────────────────────────────────────

function tokenValue(tok: string, r: WsRef, it: WsCiteItem | null, n: number): string {
	const a = r.authors.length ? r.authors : r.editors;
	switch (tok) {
		case 'author': return a.length ? fam(a[0]) : '';
		case 'etal': return a.length ? etal(r, T.and) : '';
		case 'authors': return join(a.map(fam), T.and);
		case 'authors-full': return listInverted(a);
		case 'authors-initials': return join(a.map((x) => (x.given ? initials(x.given) + ' ' : '') + x.family), T.and);
		case 'year': return r.year;
		case 'title': return r.title;
		case 'title*': return ital(r.title);
		case 'title-quoted': return quoted(r.title);
		case 'container': return r.container;
		case 'container*': return ital(r.container);
		case 'editors': return join(r.editors.map(full), T.and);
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
		case 'origyear': return r.origYear || '';
		case 'translators': return join(tNames(r), T.and);
		case 'series': return r.series || '';
		case 'accessed': return r.accessed ? dayOf(r.accessed) : '';
		// A739: APA's "&" in the text, its names in the list (with their full stop), a page with its word
		case 'etal-amp': return a.length ? etal(r, '&') : '';
		case 'authors-apa': return a.length ? end(apaNames(a)) : '';
		case 'locator': return it ? pageWord(wsLocator(it.locator)) : '';
		case 'authors-harvard': return a.length ? harvNames(a) : '';
		default: return '{' + tok + '}';
	}
}

/** A template in tokens: {token} for a field, [ … ] dropped whole when any token inside is empty, \[ and \] a
 * bracket printed (A739: IEEE's [1]). */
export function wsCiteTemplate(tpl: string, r: WsRef, it: WsCiteItem | null, n: number): string {
	const fill = (s: string) => s.replace(/\{([a-z*-]+)\}/g, (m: string, t: string) => tokenValue(t, r, it, n));
	const groups = String(tpl || '').replace(/\\\[/g, '\u0001').replace(/\\\]/g, '\u0002').replace(/\[([^[\]]*)\]/g, (m: string, inner: string) => {
		const toks = inner.match(/\{([a-z*-]+)\}/g) || [];
		return toks.some((t) => !tokenValue(t.slice(1, -1), r, it, n)) ? '' : fill(inner);
	});
	return fill(groups).replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim().split('\u0001').join('[').split('\u0002').join(']');
}

// ── THE CITER: one book's citations in order ─────────────────────────────

export interface WsCiter {
	/** one citation's text in the style: in the text, or a note's text where notes is true; `lead`, a
	 * narrative note's names, which stay in the text before the mark. `at`, where it stands: inside a note of the
	 * writer's own, or after one (or a section's start), either of which no Ibid. reaches across */
	cite(c: WsCite, at?: WsCiteAt): { text: string; note: boolean; lead?: string } | null;
	/** the list at the back: every source cited, in the style's order */
	list(): string[];
	heading(): string;
}

export interface WsCiteAt { inNote?: boolean; fresh?: boolean }

export function wsCiter(style: string, lib: Map<string, WsRef>, custom?: WsCiteCustom | null, heading?: string, terms?: WsCiteTerms | null, opts?: { ibid?: boolean } | null): WsCiter {
	// THE BOOK'S LANGUAGE (A713) for every answer this citer gives; IEEE keeps its English
	const use = style === 'ieee' || !terms ? WS_CITE_TERMS_EN : terms;
	const within = <R>(fn: () => R): R => { const was = T; T = use; try { return fn(); } finally { T = was; } };
	const order: string[] = [];
	const noted = new Set<string>();
	const cu = custom || WS_CITE_CUSTOM_DEFAULT;
	const numbered = style === 'ieee' || (style === 'custom' && /\{n\}/.test(cu.entry + cu.inText));
	const num = (key: string) => { let i = order.indexOf(key); if (i < 0) { order.push(key); i = order.length - 1; } return i + 1; };
	const wrap = (s: string) => (style === 'ieee' ? '[' + s + ']' : style === 'custom' ? (cu.around === 'brackets' ? '[' + s + ']' : cu.around === 'none' ? s : '(' + s + ')') : '(' + s + ')');
	const def = WS_CITE_STYLES.find((x) => x.id === style) || WS_CITE_STYLES[0];
	// IBID. (#60's rest, a switch, off by default): a note citing one source, the source the note before cited alone,
	// says Ibid., with its page where that differs. No page where the last had one is no Ibid. (it would point at
	// that page); a note between, the writer's own or a section's break, and the chain starts again
	const ibid = !!(opts && opts.ibid);
	let last: { key: string; loc: string } | null = null;
	const ibidOf = (it: WsCiteItem) => {
		const loc = bareLoc(wsLocator(it.locator));
		if (!last || last.key !== it.key || (!loc && last.loc)) return '';
		return loc && loc !== last.loc ? T.ibid + ', ' + loc + '.' : end(T.ibid);
	};
	return {
		cite(c: WsCite, at?: WsCiteAt) { return within(() => citeIn(c, at)); },
		list() { return within(() => listIn()); },
		heading() { return heading && heading.trim() ? heading.trim() : def.heading; },
	};
	function citeIn(c: WsCite, at?: WsCiteAt): { text: string; note: boolean; lead?: string } | null {
			// a key the library does not hold: nothing, so the text keeps what was written and the editor marks it
			if (!c.items.length || c.items.some((it) => !lib.has(it.key))) return null;
			const found = c.items;
			if (style === 'chicago-notes') {
				if (at && (at.fresh || at.inNote)) last = null;
				const solo = found.length === 1 && !(at && at.inNote) ? found[0] : null;
				const parts = found.map((it) => {
					const r = lib.get(it.key);
					if (!r) return '';
					num(it.key);
					const first = !noted.has(it.key);
					noted.add(it.key);
					// after a prefix, lower case: "see ibid., 45."
					const again = ibid && solo ? ibidOf(it) : '';
					if (again) return it.prefix ? it.prefix + ' ' + lc(again) : again;
					return (it.prefix ? it.prefix + ' ' : '') + noteOf(r, it, first);
				});
				last = solo ? { key: solo.key, loc: bareLoc(wsLocator(solo.locator)) } : null;
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
					? (c.narrative ? '' : wsCiteTemplate(it.suppress ? cu.inText.replace(/\{(etal|etal-amp|author|authors)\}\s*,?\s*/g, '') : cu.inText, r, it, n))
					: inTextOf(style, r, it, n, c.narrative);
				return (it.prefix ? it.prefix + ' ' : '') + body;
			});
			if (c.narrative) {
				const it = found[0];
				const r = lib.get(it.key);
				if (!r) return null;
				// IEEE keeps the names in the text: "Woolf [1] says", not "[1] says"
				if (style === 'ieee') return { text: etal(r, T.and) + ' [' + inTextOf(style, r, it, num(it.key), false) + ']', note: false };
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
	}
	function listIn(): string[] {
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
	}
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

/** THE SOURCES CITED WITHOUT A YEAR OR A TITLE (#60's rest): once each, in the order they come, a group the export
 * cannot cite left out (it prints as typed); their entries read broken, so the export says which. */
export function wsCiteThin(sections: WsExportSection[], lib: Map<string, WsRef>): string[] {
	const out: string[] = [];
	for (const sec of sections) {
		if (sec.folder || sec.bib || !sec.markdown) continue;
		for (const c of wsFindCitations(wsCiteMask(sec.markdown))) {
			if (c.items.some((it) => !lib.has(it.key))) continue;
			for (const it of c.items) {
				const r = lib.get(it.key);
				if (r && (!String(r.year || '').trim() || !String(r.title || '').trim()) && !out.includes(it.key)) out.push(it.key);
			}
		}
	}
	return out;
}

/** …and what the export says of them, in the interface's language, the keys the writer's own */
export function wsCiteThinText(keys: string[], library: string): string {
	const n = keys.length, name = String(library || '').split('/').pop() || '';
	const five = wsUiJoin(keys.slice(0, 5));
	const list = n > 5 ? wsT('{list} and {more} more', { list: five, more: n - 5 }) : five;
	return n === 1 ? wsT('{n} cited source in {library} lacks a year or a title: {list}.', { n, library: name, list })
		: wsT('{n} cited sources in {library} lack a year or a title: {list}.', { n, library: name, list });
}

export function wsCiteSections(sections: WsExportSection[], citer: WsCiter): boolean {
	let n = 0, any = false;
	for (const sec of sections) {
		if (sec.folder || sec.bib || !sec.markdown) continue;
		const src = sec.markdown;
		const cites = wsFindCitations(wsCiteMask(src));
		if (!cites.length) continue;
		let out = '', at = 0, prevTo = -1;
		const defs: string[] = [];
		for (const c of cites) {
			// WHERE IT STANDS, for Ibid. (#60's rest): inside a footnote of the writer's, or after one of theirs since the
			// citation before (a section's first starts afresh too: notes may restart with a chapter)
			const ls = src.lastIndexOf('\n', c.from - 1) + 1;
			const inNote = /^\s*\[\^[^\]]+\]:/.test(src.slice(ls, c.from));
			const fresh = prevTo < 0 || /\[\^[^[\]\s]+\](?!:)|\^\[/.test(src.slice(prevTo, c.from));
			prevTo = c.to;
			const said = citer.cite(c, { inNote, fresh });
			if (!said) continue;
			any = true;
			// nothing to print (an author left out, no page): the citation goes, and the space before it
			if (!said.note) { out += said.text ? src.slice(at, c.from) + said.text : wsTrimSpacesEnd(src.slice(at, c.from)); at = c.to; continue; }
			// A CITATION INSIDE A FOOTNOTE is written into it: a note in a note is no note (the sampler printed
			// "Flesch's.ws-cite-13"); its full stop gives way to the sentence's own
			if (inNote) {
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
			out += wsTrimSpacesEnd(src.slice(at, c.from)) + p + label;
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
