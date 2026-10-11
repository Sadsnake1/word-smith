// ── WORD-SMITH'S SETTINGS IN OBSIDIAN'S LANGUAGE (A692) ──────────────────────
//
// The writer: "if the obsidian language is change we give the translations too
// for word-smith settings", "for the interface translations we add them in the
// main.js or the default thing to do, not in our language packs", then
// "translate all settings properly … and recheck them, we ship translation in
// main.js properly or how obsidian wants them".
//
// A586's lookup, kept: ENGLISH IS THE KEY. `wsT` looks a line up by its English
// and hands the English back when the language has no line for it, so a setting
// added later shows in English, never blank, never an error; ws-dev/ui-lines.js
// lists, language by language, the lines missing and the lines Word-Smith no
// longer has. `{name}` in a line is filled from what the caller passes, in the
// translation as in the English; a translation may give plural forms by the
// browser's rules (`one: {n} Zeile; other: {n} Zeilen`).
//
// WHAT CHANGED FROM A586 (built, then removed: "it's too much"): the tables are
// built into main.js (ts/src/locales), the language is Obsidian's own
// (`getLanguage()`, the API Obsidian gives a plugin since 1.8.7, so the settings
// change when Obsidian's language does), and only the settings are translated:
// the bar's words and the Report stay English (the writer, A586: "don't
// translate the words in the powerline near tokens").

import { WS_LOCALES } from './ui-locales';

let WS_UI: Map<string, string> | null = null;
// the translations themselves: a line already in the language is never a missing one
let WS_UI_DONE = new Set<string>();
let WS_UI_LANG = '';
const WS_UI_MISSED = new Set<string>();
const WS_PLURAL_CAT = /^\s*(zero|one|two|few|many|other)\s*:/;

/** Obsidian's language code to the table Word-Smith has for it, '' for English or a language it has none for:
 *  zh is Simplified Chinese (Obsidian's zh-TW is Traditional: English until it has a table), nn reads Bokmål,
 *  pt-BR falls back to European Portuguese where it has no line of its own */
export function wsUiPick(code: string): string {
	const c = String(code || '').trim();
	if (!c || /^en(-|$)/i.test(c)) return '';
	if (/^zh(-hans|-cn)?$/i.test(c)) return WS_LOCALES['zh-Hans'] ? 'zh-Hans' : '';
	if (/^nn$/i.test(c)) return WS_LOCALES.no ? 'no' : '';
	if (WS_LOCALES[c]) return c;
	const base = c.split('-')[0].toLowerCase();
	return /^zh$/i.test(base) ? '' : (WS_LOCALES[base] ? base : '');
}

/** the interface in a language (a code from wsUiPick), or English for '' */
export function wsUiSet(lang: string): void {
	const table = lang ? WS_LOCALES[lang] : null;
	// Brazilian Portuguese: its own lines over European Portuguese's
	const under = lang === 'pt-BR' ? WS_LOCALES.pt : null;
	WS_UI = null;
	if (table || under) {
		WS_UI = new Map<string, string>();
		for (const t of [under, table]) if (t) for (const k of Object.keys(t)) { const v = t[k]; if (v && v.trim()) WS_UI.set(k.normalize('NFC'), v.normalize('NFC')); }
		if (!WS_UI.size) WS_UI = null;
	}
	WS_UI_DONE = new Set(WS_UI ? WS_UI.values() : []);
	WS_UI_LANG = WS_UI ? lang : '';
	WS_UI_MISSED.clear();
}

/** the language the settings are in, '' for English */
export function wsUiLang(): string { return WS_UI_LANG; }

/** the lines asked for that the language does not have, since it was set */
export function wsUiMissed(): string[] { return Array.from(WS_UI_MISSED); }

// a translation's plural forms, the one the browser's rules pick for `n`
function wsUiPlural(s: string, n: number): string {
	if (!WS_PLURAL_CAT.test(s)) return s;
	const forms: Record<string, string> = {};
	for (const part of s.split(/;\s*(?=(?:zero|one|two|few|many|other)\s*:)/)) {
		const m = /^\s*(zero|one|two|few|many|other)\s*:\s*([\s\S]*)$/.exec(part);
		if (m) forms[m[1]] = m[2].trim();
	}
	let cat = 'other';
	try { cat = new Intl.PluralRules(wsUiLocale()).select(n); } catch { cat = 'other'; }
	return forms[cat] ?? forms.other ?? s;
}

// THE ECHO (ws-dev/ui-pseudo.js, a tool's, never the plugin's): every line asked for is kept, and comes back
// between ⟦ ⟧, so a page drawn with it shows at a glance, and a tool reads off, every word that never passed here
let WS_UI_ECHO: Set<string> | null = null;
/** the tools' door: on, `wsT` keeps each line asked for and wraps what it returns in ⟦ ⟧; the lines asked so far */
export function wsUiEcho(on: boolean): string[] {
	const was = WS_UI_ECHO ? Array.from(WS_UI_ECHO) : [];
	WS_UI_ECHO = on ? new Set<string>() : null;
	return was;
}

/** the echo on: the settings tree is walked even in English */
export function wsUiEchoOn(): boolean { return !!WS_UI_ECHO; }

/** a line of Word-Smith's own, in the settings' language; `{name}` filled from `vars` */
export function wsT(en: string, vars?: Record<string, string | number>): string {
	// (a line already through here, the settings tree's second look at a description, is passed as it is)
	if (WS_UI_ECHO && en && en.trim() && en.indexOf('⟦') < 0) { WS_UI_ECHO.add(en.trim().normalize('NFC')); return '⟦' + wsTPlain(en, vars) + '⟧'; }
	return wsTPlain(en, vars);
}
const WS_UI_CTX = /^(\s*)[a-z][a-z-]*::/;
function wsTPlain(en: string, vars?: Record<string, string | number>): string {
	let s = en;
	if (WS_UI && en) {
		// the line's own space kept around its translation ("Put " + a name)
		const core = en.trim().normalize('NFC');
		const hit = WS_UI.get(core);
		if (hit) s = en.slice(0, en.length - en.trimStart().length) + hit + en.slice(en.trimEnd().length);
		else if (core && !WS_UI_DONE.has(core)) WS_UI_MISSED.add(core);
	}
	// A CONTEXT before '::' keeps apart two lines English writes alike ('spacing::Double' is Export's line spacing,
	// 'Double' the band's line style, two words in Japanese): a table keys each its own, English shows what follows
	if (s === en) s = en.replace(WS_UI_CTX, '$1');
	if (vars) {
		if (typeof vars.n === 'number') s = wsUiPlural(s, vars.n);
		s = s.replace(/\{(\w+)\}/g, (m: string, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
	}
	return s;
}

/** the interface's language as Intl reads it: 'en' where Word-Smith draws English (A695) */
// the browser's code for the table: 'pt' alone is Brazil's rules to Intl (0 takes the singular, "0 nota"), so
// European Portuguese asks for pt-PT ("0 notas", its own dates and figures)
export function wsUiLocale(): string { return WS_UI_LANG === 'pt' ? 'pt-PT' : (WS_UI_LANG || 'en'); }

/** A DATE IN THE INTERFACE'S LANGUAGE (A695): `english`, exactly as Word-Smith has always written it, while the
 *  interface is English; Intl's own month and weekday names in any other (`opts` says which parts). The echo marks it as
 *  routed, never as a line: a date is data, not a line to translate. */
export function wsUiDate(english: string, d: Date, opts: Intl.DateTimeFormatOptions): string {
	let s = english;
	if (WS_UI_LANG) { try { s = new Intl.DateTimeFormat(wsUiLocale(), opts).format(d); } catch { s = english; } }
	return WS_UI_ECHO && s ? '⟦' + s + '⟧' : s;
}

/** a list as the settings' language writes one: 、 between items in Chinese and Japanese, a comma and a space
 * elsewhere (the reviewer of the Chinese: "Covers: {list} is joined with ', '; Chinese wants '、'") */
export function wsUiJoin(items: string[]): string {
	return items.join(/^(ja|zh-Hans)$/.test(WS_UI_LANG) ? '、' : ', ');
}

/** a line in the settings' language where it has one, never counted as missing: for a value that may be a name
 *  the writer gave (a page's value, a font, a pack's own name) */
export function wsTq(s: string): string {
	const hit = WS_UI && s ? WS_UI.get(s.trim().normalize('NFC')) : undefined;
	const out = hit ? s.slice(0, s.length - s.trimStart().length) + hit + s.slice(s.trimEnd().length) : s;
	// the echo marks a name it could translate (a line of Word-Smith's, kept), never a name the writer gave
	if (WS_UI_ECHO && s && s.trim()) { WS_UI_ECHO.add('?' + s.trim().normalize('NFC')); return '⟦' + out + '⟧'; }
	return out;
}
