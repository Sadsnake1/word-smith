// Word-Smith — export-page: Export's page: the paper, the fonts on the machine, line spacing, the marks between things, highlight colors, pictures, the page a note's body becomes, page numbers, the header's words and the contents.
// Out of preamble.ts on the writer's "Do all", 2026-10-22, the text as it was; preamble re-exports all of it, so
// a module that imports from preamble is unchanged.

import type { WsExportOpts, WsExportRun, WsExportSection, WsExportBuild, WsImage } from './settings';
import { wsTIn } from './ui-text';
import { wsTagSpans, wsReplaceToLast, wsUtf8, wsZip, wsColumnOf, wsHeadSizeEm, wsTitleWords, wsAnchorId, wsXml, wsHeadNumbers, wsNumbered, wsNoteHeadings, wsFileHeadLevel, wsDeepestLevel, wsTocSteps } from './preamble';

// ── Paper ───────────────────────────────────────────────────────────────────
//
// One table, three consumers: the .docx section properties, the preview's
// page CSS and the .html file that preview is made of. It was a BOOLEAN — `a4`, true or false — which
// is a fine way to ask "which hemisphere" and no way at all to ask "what am
// I making". A submission goes on Letter or A4; a proof of a novel goes on
// the trim size it will be printed at, and 6 × 9 is not a variant of Letter.
//
// TWIPS ARE THE SOURCE, because two of the three consumers want them
// (a twip is a twentieth of a point, 1440 to the inch) and the third can be
// derived: inches for CSS come back out at two decimals, which is exactly
// what the hand-written A4 numbers here used to say.
//
// THE MARGIN TRAVELS WITH THE PAPER. An inch on Letter is the manuscript
// convention; an inch on a 5.5 × 8.5 digest page leaves a 3.5-inch measure
// with a third of the sheet as white space, which does not read as a book —
// it reads as a mistake. Small trims get three quarters of an inch, and the
// mass-market page half an inch.
// a sheet the export can be set on: twips wide and high, and its margin
export interface WsPaper { id: string; label: string; w: number; h: number; mar: number }
export const WS_PAPERS: WsPaper[] = [
	{ id: 'letter',    label: 'US Letter \u2014 8.5 \u00d7 11 in',        w: 12240, h: 15840, mar: 1440 },
	{ id: 'a4',        label: 'A4 \u2014 210 \u00d7 297 mm',              w: 11906, h: 16838, mar: 1440 },
	{ id: 'legal',     label: 'US Legal \u2014 8.5 \u00d7 14 in',         w: 12240, h: 20160, mar: 1440 },
	{ id: 'executive', label: 'Executive \u2014 7.25 \u00d7 10.5 in',     w: 10440, h: 15120, mar: 1080 },
	{ id: 'b5',        label: 'B5 \u2014 176 \u00d7 250 mm',              w:  9979, h: 14173, mar: 1080 },
	{ id: 'a5',        label: 'A5 \u2014 148 \u00d7 210 mm',              w:  8391, h: 11906, mar: 1080 },
	{ id: 'trade',     label: 'Trade paperback \u2014 6 \u00d7 9 in',     w:  8640, h: 12960, mar: 1080 },
	{ id: 'digest',    label: 'Digest \u2014 5.5 \u00d7 8.5 in',          w:  7920, h: 12240, mar: 1080 },
	{ id: 'pocket',    label: 'Mass market \u2014 4.25 \u00d7 6.87 in',   w:  6120, h:  9893, mar:  720 }
];

// THE SAME TABLE, IN THE UNITS CHROMIUM WANTS. Word measures in twips (1440
// to the inch) and Electron's `printToPDF` takes its page size in MICRONS and
// its margins in INCHES — two different units in one options object, which is
// the kind of thing that is wrong once and then wrong for ever.
//
// Derived from WS_PAPERS rather than written out again. Nine sizes in a second
// list is nine chances for a size to disagree with itself, and the last time
// this plugin kept one list in two places the Blocked flag was grey in the file
// explorer for a release.
export function wsPaperMicrons(paper: WsPaper) {
	const mic = (twips: number) => Math.round(twips * 25400 / 1440);
	const inch = (twips: number) => twips / 1440;
	return {
		width: mic(paper.w), height: mic(paper.h),
		margin: inch(paper.mar)
	};
}

// The paper an options object means. Falls back through the boolean it
// replaced, so a vault saved before this table opens on the paper it had
// rather than on whatever happens to be first in the list — and an id from
// a later version, or a typo, still gets a page rather than a crash.
export function wsPaperOf(o: WsExportOpts | null | undefined) {
	const oo = o || {};
	const id = oo.paperId || (oo.a4 ? 'a4' : 'letter');
	for (const p of WS_PAPERS) if (p.id === id) return p;
	return WS_PAPERS[0];
}

// Twips to CSS inches, two decimals: 11906 → "8.27in", which is what the
// A4 rule in the preview said when it was written out by hand.
export function wsTwipIn(tw: number) {
	return (Math.round((tw / 1440) * 100) / 100) + 'in';
}

// ── The fonts on the machine ────────────────────────────────────────────────
//
// TWO SOURCES, in this order:
//   queryLocalFonts() — the Local Font Access API, which the Electron under
//   Obsidian's desktop app has. Every installed family, by name, including
//   the ones nobody thought to list. Asynchronous, and it wants a transient
//   activation behind it, which is why it is asked for when the export window
//   OPENS (the click that opened it is the gesture) and again the first time
//   the box takes focus.
//   A CANVAS MEASUREMENT for everywhere else — mobile, an older build, a
//   refused permission. Naming a family that is installed changes the width
//   of a measured string; naming one that is not falls back to the generic
//   and measures identically. It cannot DISCOVER a face nobody named, which
//   is why it is second.
export const WS_SAFE_FONTS = ['Times New Roman', 'Garamond', 'Georgia', 'Cambria',
	'Courier Prime', 'Calibri', 'Arial'];

// What the canvas sieve asks after: not what a writer may CHOOSE — that is
// whatever the machine reports — but what is worth measuring for when the
// machine will not report anything. A name here that is not installed simply
// does not survive the sieve.
export const WS_FONT_CANDIDATES = [
	'Arial', 'Arial Black', 'Arial Narrow', 'Aptos', 'Bahnschrift', 'Book Antiqua',
	'Bookman Old Style', 'Calibri', 'Cambria', 'Candara', 'Century Gothic',
	'Century Schoolbook', 'Comic Sans MS', 'Consolas', 'Constantia', 'Corbel',
	'Courier New', 'Franklin Gothic Book', 'Garamond', 'Georgia', 'Impact',
	'Lucida Bright', 'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype',
	'Perpetua', 'Rockwell', 'Segoe UI', 'Sitka Text', 'Sylfaen', 'Tahoma',
	'Times New Roman', 'Trebuchet MS', 'Verdana',
	'American Typewriter', 'Andale Mono', 'Avenir', 'Avenir Next', 'Baskerville',
	'Big Caslon', 'Bodoni 72', 'Charter', 'Cochin', 'Copperplate', 'Didot',
	'Futura', 'Geneva', 'Gill Sans', 'Helvetica', 'Helvetica Neue', 'Hoefler Text',
	'Iowan Old Style', 'Lucida Grande', 'Menlo', 'Monaco', 'New York', 'Optima',
	'Palatino', 'SF Mono', 'SF Pro', 'Seravek', 'Skia', 'Superclarendon', 'Times',
	'Cantarell', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'FreeSans',
	'FreeSerif', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif',
	'Nimbus Roman', 'Nimbus Sans', 'Noto Sans', 'Noto Serif', 'Ubuntu', 'Ubuntu Mono',
	'Alegreya', 'Atkinson Hyperlegible', 'Bitter', 'Cardo', 'Cascadia Code',
	'Charis SIL', 'Crimson Pro', 'Crimson Text', 'Courier Prime', 'EB Garamond',
	'Fira Code', 'Fira Sans', 'Gentium Book Plus', 'Hack', 'IBM Plex Mono',
	'IBM Plex Sans', 'IBM Plex Serif', 'Inconsolata', 'Inter', 'Iosevka',
	'JetBrains Mono', 'Junicode', 'Lato', 'Libre Baskerville', 'Literata', 'Lora',
	'Merriweather', 'Montserrat', 'Open Sans', 'OpenDyslexic', 'PT Mono', 'PT Sans',
	'PT Serif', 'Roboto', 'Roboto Mono', 'Source Code Pro', 'Source Sans Pro',
	'Source Serif Pro', 'Spectral', 'Vollkorn'
];

// Names in, clean unique names out: trimmed of the quotes a CSS stack carries,
// unique without being case-sensitive about it, and without the hidden system
// faces macOS reports (".SF NS Text" and its family) — a writer cannot use one
// and would have to scroll past a dozen to reach a font they can.
export function wsUniqueFonts(names: (string | null | undefined)[] | null | undefined) {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of (names || [])) {
		const name = String(raw == null ? '' : raw).trim().replace(/^["']|["']$/g, '').trim();
		if (!name || name.charAt(0) === '.' || name.length > 64) continue;
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(name);
	}
	return out;
}

// A 2D context to measure in, or null where there is none (a DOM
// without canvas).
export function wsFontMeasureCtx() {
	try {
		const c = createEl('canvas');
		return (c && c.getContext) ? c.getContext('2d') : null;
	} catch { return null; }
}

// The sieve. A family is installed if naming it changes the measured width of
// a string — checked against all THREE generics, because a face that IS the
// platform's serif measures the same as `serif` and would otherwise be
// reported missing while sitting right there in the menu.
export function wsProbeInstalledFonts(candidates: string[], ctx?: CanvasRenderingContext2D) {
	const c = ctx || wsFontMeasureCtx();
	if (!c || typeof c.measureText !== 'function') return [];
	const BASE = ['monospace', 'serif', 'sans-serif'];
	const TXT  = 'mmmmmmmmmmlliWWWW@0Oo';
	const base: Record<string, number> = {};
	for (const b of BASE) {
		try {
			c.font = '72px ' + b;
			base[b] = c.measureText(TXT).width;
		} catch { return []; }
		// A headless canvas measures everything as zero. It cannot answer this
		// question, and answering it anyway reports every font on the machine
		// as missing — a worse lie than saying nothing.
		if (!base[b]) return [];
	}
	const out = [];
	for (const name of (candidates || [])) {
		const clean = String(name).replace(/["\\]/g, '');
		if (!clean) continue;
		for (const b of BASE) {
			let w = 0;
			try {
				c.font = '72px "' + clean + '", ' + b;
				w = c.measureText(TXT).width;
			} catch { w = 0; }
			if (w && Math.abs(w - base[b]) > 0.5) { out.push(name); break; }
		}
	}
	return out;
}

// The search itself: PLAIN, not fuzzy. A fuzzy scorer earns its keep on
// commands, where a writer half-remembers a name; a font list is a thing you
// read, and fuzzy matching on it puts "Times New Roman" three rows below
// something that merely contains a t, an i and an m. Substring, case-blind,
// with names that START with what was typed first — which is how Obsidian's
// own font setting behaves, and the behaviour a writer typing "gar" expects.
export function wsFontMatches(q: string | null | undefined, all: string[], limit: number) {
	const list  = all || [];
	const lim   = limit || 40;
	const query = String(q == null ? '' : q).trim().toLowerCase();
	if (!query) return list.slice(0, lim);
	const starts = [], holds = [];
	for (const name of list) {
		const hay = String(name).toLowerCase();
		const at  = hay.indexOf(query);
		if (at === 0) starts.push(name);
		else if (at > 0) holds.push(name);
	}
	return starts.concat(holds).slice(0, lim);
}

// ── Line spacing ────────────────────────────────────────────────────────────
//
// Three answers where there was a boolean. Double is the submission
// convention and stays the default; single is closer to a finished book;
// one-and-a-half is what a reader who is not an editor actually prefers, and
// it was the answer the boolean could not give. In twips: 240 is one line at
// 12pt, and Word's `w:line` is a multiple of that.
//
// THE BOOLEAN STILL ANSWERS, for a vault saved before the three: only an
// explicit `doubleSpaced: false` means single, because the key is absent in
// a default document and absent must not mean single.
export function wsLineTwips(o: WsExportOpts | null | undefined) {
	const oo = o || {};
	if (oo.lineSpacing === 'single') return 240;
	if (oo.lineSpacing === 'onehalf') return 360;
	if (oo.lineSpacing === 'double') return 480;
	return oo.doubleSpaced === false ? 240 : 480;
}

// ── The mark between things ─────────────────────────────────────────────────
//
// ONE MARK, for both places it can appear: between two files that run on
// down the same page, and where a `***` line sits inside a file. They were
// briefly two settings (`sceneMark` fell back to this one) on the reasoning
// that a writer might want a different mark inside a chapter from the one
// between chapters — which is true of about nobody, and cost a second text
// box in a column already asking two questions in a row.
export function wsJoinMark(o: WsExportOpts | null | undefined) {
	const oo = o || {};
	return oo.divider == null ? '#' : oo.divider;
}

// a run of a paragraph: text and how it is set
export interface WsRun { text: string; bold?: boolean; ital?: boolean; high?: boolean; hl?: string; sup?: boolean; mono?: boolean; sz?: number; note?: number; noteEnd?: boolean; noteMark?: string }
// THE TITLE PAGE'S TITLE, one and a half times the body size, bold. A MULTIPLE,
// as `wsHeadSizeEm` is, so both readers take it from here: the .docx turns it
// into half-points on the title's run, the page writes it as em. Bigger than
// the chapter heading under it (the body plus 2pt), which it opens the book above.
export const WS_TITLE_SIZE_EM = 1.5;
// the title page's subtitle, a quarter larger than the text (#81, the writer: "also add subtitle for the title page")
export const WS_SUBTITLE_SIZE_EM = 1.25;
export function wsTitleHalfPoints(o: WsExportOpts | null | undefined) {
	return Math.round(((o && o.pt) || 12) * 2 * WS_TITLE_SIZE_EM);
}
// ── OBSIDIAN 1.14'S HIGHLIGHT COLORS ───────────────────────────────────
// `==\u{1F534}words==` is a red highlight: ONE emoji straight after the `==`,
// a circle or a square, as 1.14.4's own parser reads it, and nothing after
// it is taken, a space included. The emoji names the color and is never text.
export const WS_HL_EMOJI: Record<string, string> = {
	'\u{1F534}': 'red', '\u{1F7E5}': 'red', '\u{1F7E0}': 'orange', '\u{1F7E7}': 'orange',
	'\u{1F7E1}': 'yellow', '\u{1F7E8}': 'yellow', '\u{1F7E2}': 'green', '\u{1F7E9}': 'green',
	'\u{1F535}': 'blue', '\u{1F7E6}': 'blue', '\u{1F7E3}': 'purple', '\u{1F7EA}': 'purple'
};
// The .docx shades a colored highlight in a light tint of Obsidian's own color,
// so black type stays readable on paper; yellow is Word's own highlight, as a
// plain one is. The page wears the same tints (exportToHtml's sheet).
export const WS_HL_DOCX: Record<string, string> = { red: 'F8C1C8', orange: 'F9D6B2', green: 'B5EACA', blue: 'B5D3F5', purple: 'D6CBFA' };
export function wsHighlightColorAt(text: string, at: number) {
	const cp = text.codePointAt(at);
	const ch = cp === undefined ? '' : String.fromCodePoint(cp);
	const color = WS_HL_EMOJI[ch] || '';
	return { color, length: color ? ch.length : 0 };
}
// ── PICTURES (A568) ────────────────────────────────────────────────────
//
// A picture in a note travels into Word, the PDF and the web page as itself:
// centered on the page's text column at its own size, never wider than the
// column nor taller than the page, never enlarged, a width written in the
// note (|300) kept up to the column, and its alt text, when it has one, its
// caption. Markdown keeps the reference exactly as written. A picture that
// cannot travel (not in the vault, on the web, inside a quote or a list) is
// the visible placeholder, never nothing.
//
// Read BEFORE the build (exportImages, which is async), and handed to these
// synchronous walkers one map per note, keyed by the reference as written:
// the same ![[map.png]] resolves from the note it sits in.
export const WS_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
// A PICTURE'S PLAIN MARKDOWN LINK (A842): its alt text, the path beside the exported file, each part URL-encoded so a
// space or a parenthesis never ends the link early, as pandoc and every Markdown reader read one
// A FILE'S PATH FROM ANOTHER'S FOLDER (A842): 'Out/Book.md' to 'img/a.png' is '../img/a.png', both in the vault
export function wsRelPath(fromFile: string, toPath: string): string {
	const from = String(fromFile).split('/').slice(0, -1), to = String(toPath).split('/');
	let i = 0;
	while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
	return from.slice(i).map(() => '..').concat(to.slice(i)).join('/');
}
export function wsMdImageLink(alt: string, rel: string): string {
	return '![' + String(alt || '').replace(/[[\]]/g, '') + '](' + String(rel).split('/').map((p) => encodeURIComponent(p).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))).join('/') + ')';
}
export function wsImageRefRe() { return /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)]*)\)/g; }
// One reference read: its target, its alt text, the width the note asked for,
// and whether it points off the vault. Null when the embed is not a picture by
// its extension (a note, a PDF), which keeps its placeholder.
export function wsParseImageRef(raw: string): { target: string; alt: string; width: number | null; remote: boolean } | null {
	const m = /^!\[\[([^\]]+)\]\]$|^!\[([^\]]*)\]\(([^)]*)\)$/.exec(String(raw || '').trim());
	if (!m) return null;
	const size = (s: string) => { const d = /^\s*(\d+)(?:\s*x\s*\d+)?\s*$/.exec(s); return d ? Number(d[1]) : null; };
	let target = '', alt = '', width: number | null = null;
	if (m[1] != null) {
		const bits = m[1].split('|');
		target = bits[0].trim();
		for (const piece of bits.slice(1)) {
			const w = size(piece);
			if (w != null) width = w;
			else if (!alt && piece.trim()) alt = piece.trim();
		}
	} else {
		const bits = String(m[2]).split('|');
		alt = bits[0].trim();
		for (const piece of bits.slice(1)) { const w = size(piece); if (w != null) width = w; }
		target = String(m[3]).trim().replace(/^<(.*)>$/, '$1').replace(/\s+"[^"]*"$/, '');
		try { target = decodeURI(target); } catch { /* kept as written */ }
	}
	const remote = /^[a-z][a-z0-9+.-]*:/i.test(target);
	target = target.replace(/[#?].*$/, '');
	const ext = (/\.([a-z0-9]+)$/i.exec(target) || ['', ''])[1].toLowerCase();
	if (WS_IMAGE_EXTS.indexOf(ext) === -1) return null;
	return { target, alt, width: width && width > 0 ? width : null, remote };
}
// One line cut at each picture that travels: the text either side and the
// pictures in their places. Null when nothing on it travels, so the caller's
// own paragraph stands.
export function wsSplitFigures(line: string, imgs: Map<string, WsImage> | null | undefined): (string | WsImage)[] | null {
	if (!imgs || !imgs.size) return null;
	const out: (string | WsImage)[] = [];
	const re = wsImageRefRe();
	let last = 0, any = false, m;
	while ((m = re.exec(line)) !== null) {
		const img = imgs.get(m[0]);
		if (!img) continue;
		any = true;
		if (m.index > last) out.push(line.slice(last, m.index));
		out.push(img);
		last = re.lastIndex;
	}
	if (!any) return null;
	if (last < line.length) out.push(line.slice(last));
	return out;
}
// The page's figure: the picture centered (the sheet's figure.fig rules cap it
// to the column and the page), the width the note asked for, the alt text
// under it when there is one.
export function wsFigureHtml(img: WsImage) {
	const attr = (s: string) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return '<figure class="fig"><img src="' + attr(img.src) + '" alt="' + attr(img.alt) + '"'
		+ (img.width ? ' style="width: ' + img.width + 'px"' : '') + '>'
		+ (img.alt ? '<figcaption>' + attr(img.alt) + '</figcaption>' : '') + '</figure>';
}
// Word's picture: inline in its own run, its size in EMU, its file through
// the relationship the build gave it. The id is the drawing's own, unique in
// the document; the name is what Word shows when a reader asks.
export function wsDocxPicture(rid: string, id: number, descr: string, cx: number, cy: number) {
	const d = wsXml(descr);
	return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">'
		+ '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
		+ '<wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + d + '"/>'
		+ '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>'
		+ '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
		+ '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
		+ '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
		+ '<pic:nvPicPr><pic:cNvPr id="' + id + '" name="Picture ' + id + '" descr="' + d + '"/><pic:cNvPicPr/></pic:nvPicPr>'
		+ '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
		+ '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>'
		+ '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
		+ '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}
// The content type a picture part is filed under.
export const WS_IMAGE_MIME: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
	svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif'
};

// MARKS THAT ARE TEXT. A backslash before \ * _ = makes it a character, as
// Obsidian shows it, and every mark inside code is code. Each is held as a
// private-use stand-in while the runs are cut (so no emphasis rule can see it)
// and given back in the run's text.
const WS_SHIELDED = '\\*_=';
const WS_SHIELD_AT = 0xE010;
const WS_SHIELD_RE = new RegExp('[' + String.fromCharCode(WS_SHIELD_AT) + '-' + String.fromCharCode(WS_SHIELD_AT + WS_SHIELDED.length - 1) + ']', 'g');
function wsShieldMark(c: string) {
	const i = WS_SHIELDED.indexOf(c);
	return i === -1 ? c : String.fromCharCode(WS_SHIELD_AT + i);
}
function wsUnshield(s: string) {
	return s.replace(WS_SHIELD_RE, (ch: string) => WS_SHIELDED.charAt(ch.charCodeAt(0) - WS_SHIELD_AT));
}
export function wsInlineRuns(text: string, opts?: (WsExportOpts & WsExportBuild) | null) {
	const o = opts || {};
	let t = String(text == null ? '' : text);
	// CURLY QUOTES AT COMPILE TIME, never in the writer's files. Which way
	// a quote curls depends on what is beside it: an apostrophe inside a
	// word is always a right single, an opening quote follows a space or a
	// line start, and everything else closes. Done here rather than by the
	// typography feature because that one edits the note and this must not.
	if (o.smartQuotes) {
		t = t.replace(/(\w)'(\w)/g, '$1\u2019$2')          // don't
			.replace(/(^|[\s([{\u201c])'/g, '$1\u2018')    // opening single
			.replace(/'/g, '\u2019')                        // the rest close
			.replace(/(^|[\s([{\u2018])"/g, '$1\u201c')    // opening double
			.replace(/"/g, '\u201d');
	}
	// Order matters: images before links, or the image's own ](…) is eaten.
	// code first, where a backslash is a backslash; then the escapes outside it
	t = t.replace(/`([^`]*)`/g, (m: string, c: string) => c.replace(/[\\*_=]/g, wsShieldMark));
	t = t.replace(/\\([\\*_=])/g, (m: string, c: string) => wsShieldMark(c));
	// A PICTURE THAT DID NOT TRAVEL is a visible mark, never nothing: one not
	// in the vault, on the web, or inside a quote, a list or a table (only a
	// line of prose is cut into figures). A note embedded is named the same way.
	t = t.replace(/!\[\[([^[\]]*)\]\]/g, (m: string, p1: string) => '[Image: ' + p1.split('|')[0] + ']');
	t = wsReplaceToLast(t, ')', /!\[([^[\]]*)\]\(([^)]*)\)/g, (m: string, alt: string, src: string) =>
		'[Image: ' + (alt.split('|')[0] || src) + ']');
	t = t.replace(/\[\[([^[\]|]*)\|([^[\]]*)\]\]/g, '$2');   // wikilink, shown text
	t = t.replace(/\[\[([^[\]]*)\]\]/g, '$1');
	t = wsReplaceToLast(t, ')', /\[([^[\]]*)\]\(([^)]*)\)/g, '$1');   // md link, label
	t = wsTagSpans(t, () => '');                         // html tags
	// COMMENTS, unless the writer asked for them. `%%like this%%` is a note
	// to self, and the whole point of it is that it does not travel — but
	// "does not travel" is a DEFAULT, not a law: a draft going to a reader
	// with the queries in it ("check this date") is a real thing to want,
	// and the alternative was deleting the marks by hand and putting them
	// back. Kept WITH their marks: a comment printed as plain prose is
	// indistinguishable from prose, which is the one way this could do harm.
	if (!o.keepComments) t = t.replace(/%%[\s\S]*?%%/g, '');

	// FOOTNOTE MARKERS, when the notes themselves are not travelling. The
	// definitions are dropped where they are collected; leaving `[^3]`
	// standing in the prose would point at a note that is no longer in the
	// document, which is worse than either having them or not.
	if (o.footnotes === false) t = t.replace(/\[\^(?!ws-cite-\d+\])[^\]]*\]/g, '');

	// Split into runs on **, * and ==, and on underscores where they can be
	// emphasis (below), keeping the text between.
	//
	// `==` IS NEW, and fixes a leak rather than adding a flourish: highlight
	// marks were matched by nothing here, so they travelled into the
	// manuscript as literal equals signs — `==like this==` printed exactly
	// like that in the .docx. They are consumed either way now; whether the
	// highlight itself survives (yellow in Word, <mark> on the page) is the
	// Highlights switch, and off is still the default because a highlight is
	// usually a note to self about the prose rather than part of it.
	const runs: WsRun[] = [];
	const re = /(\*\*\*|\*\*|\*|==|_+)/g;
	let bold = false, ital = false, high = false, hl = '', last = 0, m;
	// UNDERSCORES ARE EMPHASIS AT A WORD'S EDGE, CommonMark's rule: a run opens
	// with no letter or digit before it and no space after it, closes with no
	// space before it and no letter or digit after it, and opens only when its
	// closer is ahead. So _this_ and __this__ lean and bold, and snake_case,
	// file_names and an opener with no closer stay as typed. Their own pair of
	// switches: an underscore never closes a star, nor a star an underscore.
	let uBold = false, uItal = false;
	const wordy = (c: string) => !!c && /[\p{L}\p{N}]/u.test(c);
	const blank = (c: string) => !c || /\s/.test(c);
	const canOpen = (at: number, n: number) => !blank(t.charAt(at + n)) && !wordy(t.charAt(at - 1));
	const canClose = (at: number, n: number) => !blank(t.charAt(at - 1)) && !wordy(t.charAt(at + n));
	const closerAhead = (from: number, n: number) => {
		const u = /_+/g;
		u.lastIndex = from;
		let k;
		while ((k = u.exec(t)) !== null) if (k[0].length === n && canClose(k.index, n)) return true;
		return false;
	};
	const push = (text: string) => {
		if (!text) return;
		const run: WsRun = { text: wsUnshield(text), bold: bold || uBold, ital: ital || uItal, high: high && !!o.highlights };
		if (run.high && hl && hl !== 'yellow') run.hl = hl;
		runs.push(run);
	};
	while ((m = re.exec(t)) !== null) {
		if (m[1].charAt(0) === '_') {
			const n = m[1].length, at = m.index;
			const isOpen = n === 1 ? uItal : n === 2 ? uBold : (uBold && uItal);
			const acts = n <= 3 && (isOpen
				? canClose(at, n)
				: !(n === 3 && (uBold || uItal)) && canOpen(at, n) && closerAhead(at + n, n));
			// a plain underscore stays in the text the next run carries
			if (!acts) continue;
			if (at > last) push(t.slice(last, at));
			if (n !== 2) uItal = !uItal;
			if (n !== 1) uBold = !uBold;
			last = re.lastIndex;
			continue;
		}
		if (m.index > last) push(t.slice(last, m.index));
		if (m[1] === '***') { bold = !bold; ital = !ital; }
		else if (m[1] === '**') bold = !bold;
		else if (m[1] === '==') {
			high = !high;
			hl = '';
			// the color emoji that opens a highlight goes, whether or not the
			// highlight itself is printed
			if (high) { const c = wsHighlightColorAt(t, re.lastIndex); if (c.color) { hl = c.color; re.lastIndex += c.length; } }
		}
		else ital = !ital;
		last = re.lastIndex;
	}
	if (last < t.length) push(t.slice(last));
	// FOOTNOTE MARKERS BECOME NOTES (#46), in every block a run is cut for:
	// the build's numbering (`noteRef`) gives a marker whose note is defined
	// its number, and the run carries it; one with no definition, or with no
	// build to number it, stays its label, raised, as a superscript.
	const out: WsRun[] = [];
	for (const r of runs) {
		const bits = r.text.split(/\[\^([^[\]]+)\]/);
		if (bits.length === 1) { out.push(r); continue; }
		for (let k = 0; k < bits.length; k++) {
			if (!bits[k]) continue;
			if (k % 2 === 0) { out.push(Object.assign({}, r, { text: bits[k] })); continue; }
			const num = o.noteRef ? o.noteRef(bits[k]) : null;
			out.push(num ? Object.assign({}, r, { text: String(num.n), note: num.n, noteEnd: num.end })
				: Object.assign({}, r, { text: bits[k], sup: true }));
		}
	}
	return out.filter(r => r.text.length);
}
// A note's definitions, `[^label]: text` one line each, the first of a label
// kept: what the walkers skip and the builds number.
// A CITATION'S OWN NOTE (Chicago's notes, A572 step 4) is labelled ws-cite-N by wsCiteSections, and it travels
// even with the footnotes switch off: that switch is about the writer's own notes, and a citation is not one
export const WS_CITE_NOTE = /^ws-cite-\d+$/;
// the notes an export carries: every one, or with the switch off a citation's own only
export function wsNotesKept(defs: Map<string, string>, o: { footnotes?: boolean }) {
	return o.footnotes !== false ? defs : new Map(Array.from(defs).filter(([k]) => WS_CITE_NOTE.test(k)));
}

export function wsFootnoteDefs(md: string | null | undefined) {
	const defs = new Map<string, string>();
	for (const line of String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n')) {
		const m = /^\s*\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
		if (m && !defs.has(m[1])) defs.set(m[1], m[2]);
	}
	return defs;
}

// One paragraph of OOXML. `style` names a style defined in styles.xml.
export function wsPara(runs: WsRun[], style: string, opts?: { noIndent?: boolean; align?: string; pageBreakBefore?: boolean; hanging?: boolean; bodyLevel?: boolean; noSpace?: boolean }) {
	const o = opts || {};
	const pr = [];
	if (style) pr.push('<w:pStyle w:val="' + style + '"/>');
	if (o.pageBreakBefore) pr.push('<w:pageBreakBefore/>');
	// no space before or after (a kept blank line, A851: one line, whatever the body's spacing)
	if (o.noSpace) pr.push('<w:spacing w:before="0" w:after="0"/>');
	if (o.align) pr.push('<w:jc w:val="' + o.align + '"/>');
	// a hanging paragraph (the list of sources, A572 step 4): half an inch in, its first line out
	if (o.hanging) pr.push('<w:ind w:left="720" w:hanging="720"/>');
	else if (o.noIndent) pr.push('<w:ind w:firstLine="0"/>');
	// a heading's look at the body's outline level (A848): no contents field collects it
	if (o.bodyLevel) pr.push('<w:outlineLvl w:val="9"/>');
	const body = (runs.length ? runs : [{ text: '' }]).map((r: WsRun) => {
		// A NOTE'S REFERENCE in the text, and the note's own mark at its start:
		// Word numbers both itself, from the id and the place.
		if (r.note) {
			const kind = r.noteEnd ? 'endnote' : 'footnote';
			return '<w:r><w:rPr><w:rStyle w:val="' + (r.noteEnd ? 'Endnote' : 'Footnote') + 'Reference"/></w:rPr><w:' + kind + 'Reference w:id="' + r.note + '"/></w:r>';
		}
		if (r.noteMark) {
			const end = r.noteMark === 'end';
			return '<w:r><w:rPr><w:rStyle w:val="' + (end ? 'Endnote' : 'Footnote') + 'Reference"/></w:rPr><w:' + (end ? 'endnoteRef' : 'footnoteRef') + '/></w:r>';
		}
		const rpr = [];
		if (r.bold) rpr.push('<w:b/>');
		if (r.ital) rpr.push('<w:i/>');
		if (r.sz) rpr.push('<w:sz w:val="' + r.sz + '"/><w:szCs w:val="' + r.sz + '"/>');
		if (r.sup)  rpr.push('<w:vertAlign w:val="superscript"/>');
		if (r.mono) rpr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
		// Word's own highlight, not a shaded background: it is what the
		// yellow pen in Word's toolbar writes, so a reader can clear it
		// with the same button rather than hunting through styles.
		if (r.high) rpr.push(r.hl && WS_HL_DOCX[r.hl]
			? '<w:shd w:val="clear" w:color="auto" w:fill="' + WS_HL_DOCX[r.hl] + '"/>'
			: '<w:highlight w:val="yellow"/>');
		return '<w:r>' + (rpr.length ? '<w:rPr>' + rpr.join('') + '</w:rPr>' : '')
			// xml:space, or Word eats the spaces at either end of a run and
			// "**bold** word" comes out as "boldword".
			+ '<w:t xml:space="preserve">' + wsXml(r.text) + '</w:t></w:r>';
	}).join('');
	return '<w:p>' + (pr.length ? '<w:pPr>' + pr.join('') + '</w:pPr>' : '') + body + '</w:p>';
}

// A table, plainly. Verbose but entirely static — no relationships, no binary
// parts, nothing that can fall out of sync with another file in the package,
// which is why this is cheap and images are not.
// THE PAPER'S TEXT WIDTH, ITS COLUMNS EQUAL AND FIXED (the writer: "i think we need to resize tables to fit"): Word wraps a
// cell's text inside its column, as the preview does. 9,360 twips stood here, Letter's text width, on every paper: an A5
// table ran past the margin.
export function wsTable(rows: string[][], o?: WsExportOpts | null) {
	const width = Math.max.apply(null, rows.map((r) => r.length));
	const paper = wsPaperOf(o), textW = Math.max(1440, paper.w - 2 * paper.mar), colW = Math.floor(textW / width);
	const grid = '<w:tblGrid>' + new Array(width).fill('<w:gridCol w:w="' + colW + '"/>').join('') + '</w:tblGrid>';
	// (a row never split across two pages, as the preview and the PDF set it: `cantSplit`)
	const body = rows.map((cells, ri) => '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + new Array(width).fill(0).map((_, ci) => {
		const runs = wsInlineRuns(cells[ci] == null ? '' : cells[ci]);
		if (ri === 0) runs.forEach(r => { r.bold = true; });
		return '<w:tc><w:tcPr><w:tcW w:w="' + colW + '" w:type="dxa"/></w:tcPr>'
			+ wsPara(runs, 'WsTableCell') + '</w:tc>';
	}).join('') + '</w:tr>').join('');
	return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>'
		+ '<w:tblW w:w="' + colW * width + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
		+ '<w:tblBorders>'
		+ ['top','left','bottom','right','insideH','insideV']
			.map(k => '<w:' + k + ' w:val="single" w:sz="4" w:color="auto"/>').join('')
		+ '</w:tblBorders></w:tblPr>' + grid + body + '</w:tbl>';
}

// A CALLOUT'S FIRST LINE: `> [!kind] Title`, the fold marks (+ or -) read past.
export function wsCalloutHead(line: string): { kind: string; title: string } | null {
	const m = /^\s*(?:>\s?)+\[!([^\]\s]+)\][+-]?\s*(.*)$/.exec(line);
	return m ? { kind: m[1].toLowerCase(), title: m[2].trim() } : null;
}
// What a callout is called when it has no title of its own: its kind, capitalized.
export function wsCalloutTitle(head: { kind: string; title: string }) {
	return head.title || (head.kind.charAt(0).toUpperCase() + head.kind.slice(1));
}
// THE CALLOUTS OUT OF A NOTE, for the Markdown target with "Callouts" off: each
// from its first line to the last `>` line under it.
export function wsDropCallouts(md: string) {
	const lines = md.split('\n');
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (wsCalloutHead(lines[i])) { while (i + 1 < lines.length && /^\s*>/.test(lines[i + 1])) i++; continue; }
		out.push(lines[i]);
	}
	return out.join('\n');
}
// THE NOTE'S #TAGS OUT OF ITS TEXT, for an export with "Tags" off: a reader keeps
// them in the note (they help with the sequels) and not in the Word document. A
// tag is Obsidian's: a # at a line's start or after a space, then letters, digits,
// _ - / with at least one that is not a digit, so #3 is not one. Left alone: the
// properties block (Properties decides it), a code fence, a $$ block, `inline
// code`. A tag takes the space before it; a line that held only tags goes too.
export const WS_TAG_RE = /(^|\s)#(?=[\p{L}\p{N}_\-/]*[\p{L}_\-/])[\p{L}\p{N}_\-/]+/gu;
export function wsDropTags(md: string) {
	const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	let i = 0;
	if (/^---\s*$/.test(lines[0] || '')) {
		const end = lines.findIndex((l, k) => k > 0 && /^---\s*$/.test(l));
		for (; end > 0 && i <= end; i++) out.push(lines[i]);
	}
	let fence = false, math = false;
	for (; i < lines.length; i++) {
		const line = lines[i];
		const t = line.trim();
		if (/^(```|~~~)/.test(t)) { fence = !fence; out.push(line); continue; }
		if (!fence && t === '$$') { math = !math; out.push(line); continue; }
		if (fence || math) { out.push(line); continue; }
		let kept = line.split(/(`[^`]*`)/).map((seg, k) => (k % 2 ? seg : seg.replace(WS_TAG_RE, ''))).join('');
		if (kept === line) { out.push(line); continue; }
		// a line of tags alone goes WITH the blank line after it, as a dropped heading does (wsDropHeadings): left, the
		// blank lines either side of it would be a run of two, and the export keeps a blank line past the first (A849)
		if (!kept.trim()) { if (i + 1 < lines.length && !lines[i + 1].trim()) i++; continue; }
		if (!/^\s/.test(line)) kept = kept.replace(/^\s+/, '');
		out.push(kept);
	}
	return out.join('\n');
}
// INLINE MATH, $…$, as Obsidian reads it (#102): no space just inside either dollar, none escaped, no digit right after
// the closing one, so "$5 and $10" stays prose. Global, for matchAll: [1] the character before the opening dollar
// (or none at a line's start), [2] the TeX. NO LOOKBEHIND: iOS below 16.4 refuses one, a SyntaxError for the whole
// bundle (ts/test/smoke.js), so the character before is captured and the last token holds the closing condition.
export const WS_INLINE_MATH = /(^|[^\\$])\$(?=[^\s$])((?:\\.|[^$\\\n])*?(?:\\[^\s\\]|[^\s$\\]))\$(?![\d$])/g;
// THE FIGURES A NOTE HOLDS (#102): its $$ blocks, its inline math outside code spans, its ```mermaid fences, found as
// wsHtmlBlocks finds them, so each is rendered once before the page is built
export function wsFigureSources(md: string) {
	const out = { display: [] as string[], inline: [] as string[], mermaid: [] as string[] };
	const lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i].trim();
		const fence = t.match(/^(`{3,}|~{3,})/);
		if (fence) {
			const ch = fence[1].charAt(0);
			const info = t.slice(fence[1].length).trim().toLowerCase();
			const buf: string[] = [];
			for (i++; i < lines.length; i++) {
				const ft = lines[i].trim();
				if (ft.charAt(0) === ch && new RegExp('^' + ch + '{3,}').test(ft)) break;
				buf.push(lines[i]);
			}
			if (info === 'mermaid') out.mermaid.push(buf.join('\n'));
			continue;
		}
		if (/^\$\$/.test(t)) { const mb = wsMathBlock(lines, i); i = mb.end; if (mb.text) out.display.push(mb.text); continue; }
		lines[i].split(/(`[^`]*`)/).forEach((seg, k) => {
			if (k % 2) return;
			for (const m of seg.matchAll(WS_INLINE_MATH)) out.inline.push(m[2]);
		});
	}
	return out;
}
// A $$ MATH BLOCK, from the line at `i`: on one line, or over several. Set
// apart as written, in monospace, like code, wherever no figure was rendered
// for it (#102: the .docx; a formula MathJax refused). `end` is the block's last line.
export function wsMathBlock(lines: string[], i: number) {
	const t = lines[i].trim();
	if (t.length > 4 && /^\$\$[\s\S]*\$\$$/.test(t)) return { text: t.slice(2, -2).trim(), end: i };
	const buf: string[] = [];
	if (t.slice(2).trim()) buf.push(t.slice(2).trim());
	let j = i + 1;
	for (; j < lines.length; j++) {
		const mt = lines[j].trim();
		if (/\$\$$/.test(mt)) { if (mt.slice(0, -2).trim()) buf.push(mt.slice(0, -2).trim()); break; }
		buf.push(lines[j]);
	}
	return { text: buf.join('\n').trim(), end: Math.min(j, lines.length - 1) };
}
// A TABLE ROW'S CELLS. A PIPE CAN BE IN A CELL, written `\\|` — which is how
// anyone writes a table containing a pipe, and splitting on every pipe turned
// one two-column row into three ragged ones with a stray backslash. Split on
// UNESCAPED pipes only, then unescape what is left. The .docx and the page
// both read rows through this.
export function wsTableCells(row: string) {
	const t2 = row.trim().replace(/^\||\|$/g, '');
	const out2: string[] = [];
	let cur = '';
	for (let k = 0; k < t2.length; k++) {
		const ch = t2.charAt(k);
		if (ch === '\\' && t2.charAt(k + 1) === '|') { cur += '|'; k++; continue; }
		if (ch === '|') { out2.push(cur.trim()); cur = ''; continue; }
		cur += ch;
	}
	out2.push(cur.trim());
	return out2;
}

// ── THE PAGE A NOTE'S BODY BECOMES: the .html, the PDF and the preview ──────
// The block walk the .docx has below, for the page, pushed onto the caller's
// `parts`: a --- that opens a page closes the caller's section and asks
// whether it stands at the top of one. Quotes, lists, tasks (boxes, no
// switch), tables, code and math come out as themselves, as they do in the
// .docx; a callout only with "Callouts" kept, as a quote under its title in
// bold, its [!kind] tag never printed.
// The page's runs: emphasis, highlights, and a footnote as its number,
// raised and linked to its note (the notes at the back carry the ids).
export function wsRunsHtml(text: string, o: WsExportOpts & WsExportBuild): string {
	// INLINE MATH, AS MATHML where the build rendered it (#102): the text cut at each $…$ outside a code span, the pieces
	// between read as before; one with no figure stays as written, and text with none takes the old road whole
	const figs = o.figures;
	if (figs && figs.math.size && String(text).indexOf('$') !== -1) {
		const out: string[] = [];
		let buf = '', hit = false;
		String(text).split(/(`[^`]*`)/).forEach((seg, k) => {
			if (k % 2) { buf += seg; return; }
			let last = 0;
			for (const m of seg.matchAll(WS_INLINE_MATH)) {
				const mml = figs.math.get('I\n' + m[2]);
				if (!mml) continue;
				buf += seg.slice(last, (m.index || 0) + m[1].length);
				if (buf) out.push(wsRunsHtmlPlain(buf, o));
				buf = '';
				out.push('<span class="math">' + mml + '</span>');
				hit = true;
				last = (m.index || 0) + m[0].length;
			}
			buf += seg.slice(last);
		});
		if (hit) { if (buf) out.push(wsRunsHtmlPlain(buf, o)); return out.join(''); }
	}
	return wsRunsHtmlPlain(text, o);
}
function wsRunsHtmlPlain(text: string, o: WsExportOpts & WsExportBuild) {
	const esc = (t: string) => String(t == null ? '' : t)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	return wsInlineRuns(text, o).map((r) => {
		// no id on the marker: a note cited twice would give two elements one id
		if (r.note) return '<sup class="fnref"><a href="#fn-' + r.note + '">' + r.note + '</a></sup>';
		if (r.sup) return '<sup>' + esc(r.text) + '</sup>';
		let x = esc(r.text);
		if (r.bold) x = '<strong>' + x + '</strong>';
		if (r.ital) x = '<em>' + x + '</em>';
		// <mark>, which is what the element is FOR, and which prints and reads as
		// the yellow the .docx sets.
		if (r.high) x = (r.hl ? '<mark class="hl-' + r.hl + '">' : '<mark>') + x + '</mark>';
		return x;
	}).join('');
}
// (TOMBSTONE: wsProseGoesOn and wsProseBlock, Keep line breaks' first meaning, lines joined into one paragraph with line
// breaks: davidepicatto then wanted every line indented, "first line indentation only works after a blank line", and
// the writer picked every line a paragraph, a blank line kept as one)

// THE FIRST LINE'S INDENT, a size with its unit: a quarter, a half (the manuscript's, the default), three quarters and one
// inch; and centimeters, as Europe sets them (the writer: "something that the europeans will use too"), 1.25 Word's own
// there. The page reads the size as it is; Word in twips
export const WS_INDENT_SIZES = ['0.25in', '0.5in', '0.75in', '1in', '0.5cm', '1cm', '1.25cm', '1.5cm', '2cm'];
export function wsIndentSize(o: WsExportOpts | null | undefined): string {
	const v = String((o && o.indentSize) || '');
	return WS_INDENT_SIZES.includes(v) ? v : '0.5in';
}
// THE SPACE BETWEEN PARAGRAPHS, ONE CHOICE (the writer: "keep lines brakes just adds spacings for paragraphs. let me have
// multiple options for paragraph spacings", the pick "One dropdown"): Auto (none when indented, 6pt when not, as always),
// half a line or one line. A run without the choice reads the switch it replaced. (TOMBSTONE, A849: Your blank lines,
// 'note', a blank line kept as one, which spaced every paragraph of a note that separates them by blank lines; the
// writer: "your blank lines should be always kept. i a person adds more blank lines than one, they should be in export.
// it should not matter for paragraph spacings". The blank lines past the first are kept always: wsHtmlBlocks)
export const WS_PARA_SPACINGS = ['auto', 'half', 'line'];
export function wsParaSpacing(o: WsExportOpts | null | undefined): string {
	const v = String((o && o.paraSpacing) || '');
	if (WS_PARA_SPACINGS.includes(v)) return v;
	return o && o.paraBlank ? 'line' : 'auto';
}
export function wsIndentIn(o: WsExportOpts | null | undefined): number {
	const v = wsIndentSize(o), n = parseFloat(v);
	return v.endsWith('cm') ? n / 2.54 : n;
}

export function wsHtmlBlocks(md: string, o: WsExportOpts & WsExportBuild, pageOpen: string, parts: string[]) {
	if (o.keepTags === false) md = wsDropTags(md);
	const esc = (t: string) => String(t == null ? '' : t)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const runsHtml = (text: string) => wsRunsHtml(text, o);
	const lines = md.replace(/\r\n?/g, '\n').split('\n');
	let inComment = false;
	let firstPara = !o.indentAfterHeads;
	// (FLUSH AT THE START AND UNDER A HEADING, as an English book sets it; indented too with Indent after headings, as a
	// French one does, the writer's pick. A scene break, a table, a kept blank line stay flush either way)
	// YOUR BLANK LINES, ALWAYS (A849, the writer: "if a person adds more blank lines than one, they should be in export. it
	// should not matter for paragraph spacings"): the first blank line between two paragraphs only parts them, as
	// Markdown reads it, and the Paragraph spacing sets that space; each one past it is kept as an empty line, the
	// paragraph after them flush, as a book sets a space break (#77). Never after a heading, a list or a picture (the
	// paragraph pushed last must be prose), never at a file's start. `blankRun` counts the run, `lineRun` hands this
	// line's run to its first paragraph
	let lastProseAt = -1, blankRun = 0, lineRun = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const t = line.trim();
		if (!t) { blankRun++; continue; }   // …and the same in the printed target.
		lineRun = blankRun; blankRun = 0;
		// A COMMENT BLOCK — opened on its own line, closed lines later, and
		// therefore invisible to the inline stripper, which is why one used to
		// leak into the manuscript a line at a time. Set apart when kept, so a
		// note to self can never be mistaken for prose.
		if (inComment) {
			if (/%%\s*$/.test(t)) inComment = false;
			if (o.keepComments) {
				const inner = t.replace(/^%%/, '').replace(/%%\s*$/, '').trim();
				if (inner) parts.push('<p class="cmt">' + esc(inner) + '</p>');
			}
			continue;
		}
		if (/^%%/.test(t)) {
			const oneLine = /^%%.*%%\s*$/.test(t);
			if (!oneLine) inComment = true;
			if (o.keepComments) {
				const inner = t.replace(/^%%/, '').replace(/%%\s*$/, '').trim();
				if (inner) parts.push('<p class="cmt">' + esc(inner) + '</p>');
			}
			firstPara = true;
			continue;
		}
		// A NOTE'S DEFINITION is not prose here: the build gathers it into the
		// notes at the back, or the Footnotes switch has dropped it.
		if (/^\[\^[^\]]+\]:/.test(t)) continue;
		// CODE, kept exactly: monospace, its line breaks, no curly quotes.
		const fence = t.match(/^(`{3,}|~{3,})/);
		if (fence) {
			const ch = fence[1].charAt(0);
			const buf: string[] = [];
			for (i++; i < lines.length; i++) {
				const ft = lines[i].trim();
				if (ft.charAt(0) === ch && new RegExp('^' + ch + '{3,}').test(ft)) break;
				buf.push(lines[i]);
			}
			// a Mermaid diagram as the SVG it was rendered to (#102); as code where none was
			const info = t.slice(fence[1].length).trim().toLowerCase();
			const svg = info === 'mermaid' && o.figures ? o.figures.mermaid.get(buf.join('\n')) : undefined;
			parts.push(svg ? '<div class="mermaid">' + svg + '</div>' : '<pre class="code">' + esc(buf.join('\n')) + '</pre>');
			continue;
		}
		if (/^\$\$/.test(t)) {
			const mb = wsMathBlock(lines, i);
			i = mb.end;
			// as MathML where it was rendered (#102), as written where not
			const mml = o.figures ? o.figures.math.get('D\n' + mb.text) : undefined;
			parts.push(mml ? '<div class="math">' + mml + '</div>' : '<pre class="math">' + esc(mb.text) + '</pre>');
			continue;
		}
		// A TABLE: its head row, its body rows.
		if (/^\|/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
			const head = wsTableCells(t);
			const body: string[][] = [];
			for (i += 2; i < lines.length && /^\|/.test(lines[i].trim()); i++) body.push(wsTableCells(lines[i]));
			i--;
			parts.push('<table class="tbl"><thead><tr>' + head.map((c) => '<th>' + runsHtml(c) + '</th>').join('')
				+ '</tr></thead><tbody>' + body.map((r) => '<tr>' + r.map((c) => '<td>' + runsHtml(c) + '</td>').join('') + '</tr>').join('')
				+ '</tbody></table>');
			firstPara = true;
			continue;
		}
		if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
			// --- STARTS A NEW PAGE when asked; *** and ___ stay scene breaks. Not
			// at the top of a section: that is a page start already.
			if (o.dashPageBreak && /^(-\s*){3,}$/.test(t)) {
				if (!/^<section /.test(parts[parts.length - 1])) parts.push('</section>', pageOpen);
				firstPara = true; continue;
			}
			parts.push('<p class="div">' + esc(o.divider == null ? '#' : o.divider) + '</p>');
			firstPara = true; continue;
		}
		const h = t.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			if (o.keepHeadings !== false) {
				parts.push('<h' + Math.min(3, h[1].length) + '>' + esc(h[2])
					+ '</h' + Math.min(3, h[1].length) + '>');
			}
			firstPara = !o.indentAfterHeads; continue;
		}
		// QUOTES, AND CALLOUTS: a run of `>` lines, the marks taken off.
		if (/^>/.test(t)) {
			const ch = wsCalloutHead(t);
			const block: string[] = [];
			for (; i < lines.length && /^>/.test(lines[i].trim()); i++) block.push(lines[i].trim().replace(/^(>\s?)+/, '').trim());
			i--;
			const body = (ch ? block.slice(1) : block).filter(Boolean).map((b) => '<p>' + runsHtml(b) + '</p>').join('');
			if (!ch) parts.push('<blockquote>' + body + '</blockquote>');
			else if (o.keepCallouts) parts.push('<blockquote class="callout"><p class="ctitle"><strong>' + runsHtml(wsCalloutTitle(ch)) + '</strong></p>' + body + '</blockquote>');
			continue;
		}
		// LISTS AND TASKS: a line each, its marker in the text and its depth in
		// the class, as the .docx sets them; a task is a box, open or ticked.
		const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
		if (li) {
			const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, '    ').length / 2));
			const task = /^\[([ xX])\]\s+(.*)$/.exec(li[3]);
			const mark = task ? (task[1] === ' ' ? '\u2610 ' : '\u2611 ') : (/^\d/.test(li[2]) ? li[2] + ' ' : '\u2022 ');
			parts.push('<p class="li l' + depth + '">' + esc(mark) + runsHtml(task ? task[2] : li[3]) + '</p>');
			continue;
		}
		// PICTURES: a line cut at each picture that travels (wsSplitFigures);
		// the text either side stays a paragraph.
		const figs = wsSplitFigures(t, o.imgs);
		if (figs) {
			for (const piece of figs) {
				if (typeof piece !== 'string') { parts.push(wsFigureHtml(piece)); continue; }
				if (!piece.trim()) continue;
				parts.push('<p' + (firstPara ? ' class="first"' : '') + '>' + runsHtml(piece.trim()) + '</p>');
				firstPara = false;
			}
			continue;
		}
		// (KEEP EVERY BLANK LINE, A851: the first too, for a note written a paragraph a line)
		const owed = parts.length === lastProseAt ? Math.max(0, o.keepBlankLines ? lineRun : lineRun - 1) : 0;
		lineRun = 0;
		for (let b = 0; b < owed; b++) parts.push('<p class="blank">\u00a0</p>');
		parts.push('<p' + (firstPara || owed ? ' class="first"' : '') + '>' + runsHtml(t) + '</p>');
		firstPara = false;
		lastProseAt = parts.length;
	}
}

// Block walk: markdown → an array of OOXML blocks. Footnotes are COLLECTED
// rather than embedded — a real Word footnote needs its own part, a
// content-type entry, a relationship and matching ids, and an id mismatch is
// the kind of fault Word reports as "this file is corrupt" with no clue. What
// a manuscript actually wants is endnotes, so the markers stay superscript in
// the text and the definitions are gathered into a section at the end.
export function wsBlocksFromMarkdown(md: string | null | undefined, opts: (WsExportOpts & WsExportBuild) | null | undefined) {
	const o = opts || {};
	// LINE ENDINGS FIRST, once, for the whole document. A vault synced from
	// Windows has CRLF in it, and splitting on 
	// alone leaves a carriage
	// return at the end of every line — invisible in the editor, harmless
	// in prose (the lines are trimmed), and NOT harmless inside a code
	// fence, which is kept verbatim: the CR would travel into the .docx and
	// Word would draw it.
	const text = o.keepTags === false ? wsDropTags(String(md == null ? '' : md)) : String(md == null ? '' : md);
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const out: string[] = [];
	const notes = [];
	let i = 0;
	let firstPara = !o.indentAfterHeads;
	// (flush at the start and under a heading unless Indent after headings; see wsHtmlBlocks)
	// (your blank lines past the first kept as empty paragraphs, always since A849; see wsHtmlBlocks)
	let lastProseAt = -1, blankRun = 0, lineRun = 0;
	// where a --- asked for a new page: the index of the block that opens it
	const breaks = new Set<number>();

	// FRONTMATTER, which does not travel unless it is asked for. It is the
	// note's plumbing — status, tags, the day it was started — and a
	// manuscript opening with a YAML block is nobody's manuscript. But a
	// writer proofing what a note actually CONTAINS wants it, so it is a
	// switch, off by default, and what it prints is the block verbatim in
	// monospace: it is data, not prose, and setting it as prose would be a
	// lie about what it is.
	if (lines.length && /^---\s*$/.test(lines[0])) {
		let j = 1;
		while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
		if (o.keepFrontmatter) {
			for (let k = 0; k <= Math.min(j, lines.length - 1); k++) {
				out.push(wsPara([{ text: lines[k], mono: true }], 'WsCode', { noIndent: true }));
			}
		}
		i = j + 1;
	}
	for (; i < lines.length; i++) {
		const line = lines[i];
		const t = line.trim();
		// A BLANK LINE IS NOT A PARAGRAPH, and it must not clear this flag.
		// It did, and that is why every paragraph came out indented: a
		// heading sets `firstPara`, markdown puts a blank line between the
		// heading and the prose, and that blank line reset it before the
		// paragraph could be drawn. What ends “this is the first paragraph
		// of a scene” is a paragraph being WRITTEN, nothing else.
		//
		// The rule matters more than it looks: a manuscript indents every
		// paragraph EXCEPT the first of a chapter or a scene, and getting it
		// wrong is one of the few things an editor sees before reading a word.
		if (!t) { blankRun++; continue; }
		lineRun = blankRun; blankRun = 0;

		// A footnote definition: collected, not printed here.
		const fn = t.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
		// Collected, not printed here — or dropped outright when the switch
		// says the notes are not coming. Either way the definition line
		// never appears in the prose where it was written.
		if (fn) { if (o.footnotes !== false || WS_CITE_NOTE.test(fn[1])) notes.push({ id: fn[1], text: fn[2] }); continue; }

		// A COMMENT BLOCK. wsInlineRuns handles `%%inline%%` because it can
		// see both marks on one line; a block comment opens on its own line
		// and closes lines later, so the stripper never matched it and the
		// note LEAKED into the manuscript one line at a time. It is dropped
		// here, or kept as a quote — set apart from the prose, since a
		// comment that reads as prose is the one way this option could put
		// a note to self into a submission unnoticed.
		if (/^%%/.test(t)) {
			const buf = [];
			const oneLine = /^%%.*%%\s*$/.test(t);
			if (oneLine) buf.push(t.replace(/^%%/, '').replace(/%%\s*$/, ''));
			else {
				buf.push(t.replace(/^%%/, ''));
				for (i++; i < lines.length; i++) {
					const ct = lines[i];
					if (/%%\s*$/.test(ct.trim())) { buf.push(ct.replace(/%%\s*$/, '')); break; }
					buf.push(ct);
				}
			}
			if (o.keepComments) {
				for (const b of buf) {
					if (b.trim()) out.push(wsPara(wsInlineRuns(b.trim(), o), 'WsQuote', { noIndent: true }));
				}
				firstPara = true;
			}
			continue;
		}

		// Fenced code: kept as monospace lines. Novels rarely have any, and
		// dropping a block a writer deliberately included is worse than
		// carrying it plainly.
		const fence = t.match(/^(`{3,}|~{3,})/);
		if (fence) {
			const ch = fence[1].charAt(0);
			const buf = [];
			for (i++; i < lines.length; i++) {
				const ft = lines[i].trim();
				if (ft.charAt(0) === ch && new RegExp('^' + ch + '{3,}').test(ft)) break;
				buf.push(lines[i]);
			}
			for (const b of buf) out.push(wsPara([{ text: b, mono: true }], 'WsCode', { noIndent: true }));
			continue;
		}

		// MATH: set apart as written, in monospace, like code (wsMathBlock).
		if (/^\$\$/.test(t)) {
			const mb = wsMathBlock(lines, i);
			i = mb.end;
			for (const ml of mb.text.split('\n')) out.push(wsPara([{ text: ml, mono: true }], 'WsCode', { noIndent: true }));
			continue;
		}

		// A table: header, separator, body.
		if (/^\|/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
			// A PIPE CAN BE IN A CELL, written `\\|` — which is how anyone
			// writes a table containing a pipe, and splitting on every
			// pipe turned one two-column row into three ragged ones with
			// a stray backslash. Split on UNESCAPED pipes only, then
			// unescape what is left.
			const cellsOf = wsTableCells;
			const rows = [cellsOf(t)];
			i += 2;
			for (; i < lines.length && /^\|/.test(lines[i].trim()); i++) rows.push(cellsOf(lines[i]));
			i--;
			out.push(wsTable(rows, opts));
			firstPara = true;
			continue;
		}

		// A scene divider. This is the one piece of markup a manuscript
		// really depends on, so it is centred and spaced rather than drawn
		// as a rule: agents expect a # on its own line between scenes.
		if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
			// --- STARTS A NEW PAGE when the writer asks (A502); *** and ___
			// stay scene breaks, so a book can have both
			if (o.dashPageBreak && /^(-\s*){3,}$/.test(t)) { breaks.add(out.length); firstPara = true; continue; }
			out.push(wsPara([{ text: wsJoinMark(o) }], 'WsDivider',
				{ align: 'center', noIndent: true }));
			firstPara = true;
			continue;
		}

		const head = t.match(/^(#{1,6})\s+(.*)$/);
		if (head) {
			// Dropped ENTIRELY when headings are off, rather than demoted to
			// a paragraph: a writer whose chapter titles are the file names
			// has "# Chapter One" in the note as a working label, and
			// leaving it in the manuscript as prose is worse than either
			// keeping it as a heading or losing it.
			if (o.keepHeadings === false) { firstPara = !o.indentAfterHeads; continue; }
			out.push(wsPara(wsInlineRuns(head[2], o), 'WsHeading' + head[1].length,
				{ noIndent: true }));
			firstPara = !o.indentAfterHeads;
			continue;
		}

		// A CALLOUT: `> [!kind] Title` and the `>` lines under it. Out unless
		// "Callouts" is kept; kept, a quote under its title in bold, the [!kind]
		// tag never printed.
		const callout = wsCalloutHead(t);
		if (callout) {
			const body: string[] = [];
			for (i++; i < lines.length && /^\s*>/.test(lines[i]); i++) body.push(lines[i].trim().replace(/^(>\s?)+/, '').trim());
			i--;
			if (o.keepCallouts) {
				out.push(wsPara(wsInlineRuns(wsCalloutTitle(callout), o).map((r) => Object.assign({}, r, { bold: true })), 'WsQuote', { noIndent: true }));
				for (const b of body) if (b) out.push(wsPara(wsInlineRuns(b, o), 'WsQuote', { noIndent: true }));
				firstPara = true;
			}
			continue;
		}

		const quote = t.match(/^(?:>\s?)+(.*)$/);
		if (quote) {
			out.push(wsPara(wsInlineRuns(quote[1], o), 'WsQuote', { noIndent: true }));
			continue;
		}

		// Lists: rendered as indented paragraphs carrying their own marker.
		// Real Word numbering needs numbering.xml and a definition per list,
		// which is a lot of machinery for something a manuscript rarely has
		// and an editor will not miss.
		const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
		if (li) {
			const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, '    ').length / 2));
			// a task is a box, open or ticked: always printed, never a switch
			const task = /^\[([ xX])\]\s+(.*)$/.exec(li[3]);
			const mark = task ? (task[1] === ' ' ? '\u2610 ' : '\u2611 ') : (/^\d/.test(li[2]) ? li[2] + ' ' : '\u2022 ');
			out.push(wsPara(wsInlineRuns(mark + (task ? task[2] : li[3]), o), 'WsList' + depth, { noIndent: true }));
			continue;
		}

		// Ordinary prose. Manuscript format indents every paragraph EXCEPT
		// the first of a scene — that is the convention, and getting it
		// wrong is the tell that a manuscript was machine-made.
		// Ordinary prose, a paragraph: its runs as the parser cut them, footnote
		// markers already notes (wsInlineRuns), every flag a run arrived with kept.
		const prose = (text: string) => {
			// (each blank line past the first kept as an empty paragraph, the one after them flush: A849)
			const owed = out.length === lastProseAt ? Math.max(0, o.keepBlankLines ? lineRun : lineRun - 1) : 0;
			lineRun = 0;
			// (one line each, no spacing of its own: A851)
			for (let b = 0; b < owed; b++) out.push(wsPara([], 'WsBody', { noIndent: true, noSpace: true }));
			out.push(wsPara(wsInlineRuns(text, o), 'WsBody', { noIndent: firstPara === false && !owed ? false : true }));
			firstPara = false;
			lastProseAt = out.length;
		};
		// PICTURES: a line cut at each picture that travels (wsSplitFigures);
		// the text either side stays prose, each picture its own centered
		// paragraph from the build's figure writer.
		const figs = wsSplitFigures(t, o.imgs);
		if (!figs) { prose(t); continue; }
		for (const piece of figs) {
			if (typeof piece === 'string') { if (piece.trim()) prose(piece.trim()); continue; }
			const fig = o.docxFigure ? o.docxFigure(piece) : [wsPara([{ text: '[Image: ' + piece.name + ']' }], 'WsBody', { noIndent: true })];
			for (const x of fig) out.push(x);
		}
	}
	// THE BLOCK AFTER A --- OPENS THE PAGE: the break goes on that paragraph's
	// own properties, after its style as OOXML orders them, so the page starts
	// with the prose and not with an empty line. A table there gets an empty
	// paragraph to carry it; a --- with nothing after it is dropped rather
	// than printing a blank last page. …HERE: the file reports it, and the next
	// file opens the page (#103, a chapter ended by a --- on its last scene).
	let breakAfter = false;
	for (const at of Array.from(breaks).sort((a, b) => b - a)) {
		if (at >= out.length) { breakAfter = true; continue; }
		const p = String(out[at]);
		if (p.indexOf('<w:pageBreakBefore/>') !== -1) continue;
		if (/^<w:p><w:pPr><w:pStyle w:val="[^"]*"\/>/.test(p)) out[at] = p.replace(/^(<w:p><w:pPr><w:pStyle w:val="[^"]*"\/>)/, '$1<w:pageBreakBefore/>');
		else out.splice(at, 0, wsPara([], 'WsBody', { pageBreakBefore: true, noIndent: true }));
	}
	return { blocks: out, notes, breakAfter };
}

// The styles part. Manuscript standard (Shunn) is the default because it is
// what a novelist submitting work actually needs and the thing every other
// tool makes you assemble by hand: 12pt serif, double spaced, half-inch first
// line indent, ragged right.
export function wsStylesXml(opt: WsExportOpts | null | undefined) {
	const o = opt || {};
	const font = o.font || 'Times New Roman';
	const half = Math.round((o.pt || 12) * 2);            // half-points
	const line = wsLineTwips(o);                          // 240 = single
	// (the first line's indent in twips: the writer's size, half an inch unless chosen, Settings › Export › Paragraphs)
	const ind  = o.indent === false ? 0 : Math.round(wsIndentIn(o) * 1440);
	// A PARAGRAPH NEEDS ONE BOUNDARY: an indent, or air. Turn the indent
	// off with double spacing on — the pairing a manuscript uses — and
	// there is nothing between one paragraph and the next at all, and the
	// result reads as a broken file rather than as block-set prose. That
	// is why the indent switch was removed once; the switch was never the
	// problem, the missing second boundary was. Body prose only: a list or
	// a table cell already has its own separation.
	// …AND A WHOLE EMPTY LINE WHEN ASKED (A756): the line at the font's size and the chosen spacing, in twentieths of a point
	// (the space between paragraphs, `wsParaSpacing`: a line at the size and spacing, half of one, or Auto)
	const paraSp = wsParaSpacing(o), lineGap = Math.round((o.pt || 12) * line / 12);
	const gap  = paraSp === 'line' ? lineGap : paraSp === 'half' ? Math.round(lineGap / 2) : o.indent === false ? 120 : 0;
	// ── WIDOWS AND ORPHANS ──────────────────────────────────────────────
	//
	// An ORPHAN is the first line of a paragraph left alone at the foot of
	// a page; a WIDOW is the last line carried over alone to the top of the
	// next. Both read as a fault in the file rather than as typesetting —
	// a page that opens with four words and half an inch of white is the
	// first thing an agent sees, and it is the sort of thing that gets a
	// manuscript put down. The fix is to make two lines travel together:
	// if only one would fit, the whole paragraph goes over.
	//
	// SAID OUT LOUD, because Word's default lives in the APPLICATION and
	// not in the file. A document that does not carry `w:widowControl` is
	// trusting whatever opens it — usually on in Word, off in a few
	// converters, and unknowable in whatever a publisher runs. The preview
	// and the .html target have said `orphans: 2; widows: 2` since they
	// were written; this is the one target that was silent, and it is the
	// one an agent actually opens.
	//
	// NOT keepLines, which forces a whole paragraph onto one page: that is
	// right for a heading and disastrous for prose, where a long paragraph
	// would leave half a page blank rather than break at all.
	//
	// FIRST IN THE pPr, because OOXML's paragraph properties are a
	// SEQUENCE, not a bag: widowControl belongs before spacing and
	// indentation, and elements out of order are one of the faults Word
	// reports as a corrupt document rather than as a style it ignored.
	const widow = '<w:widowControl/>';
	const st = (id: string, name: string, extra: string, rpr?: string) =>
		'<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/>'
		+ '<w:pPr>' + extra + '</w:pPr>'
		+ '<w:rPr>' + (rpr || '') + '</w:rPr></w:style>';
	// (THE LINE ALONE for a style that sets its own alignment, the title page's, the scene divider's, the headings': with
	// Justify text their pPr held two w:jc, "both" and their own, and the title page came out justified; the writer: "the
	// justiify text justifies the title page too")
	const lineOnly = '<w:spacing w:line="' + line + '" w:lineRule="auto" w:after="0"/>';
	const spacing = lineOnly + (o.justify ? '<w:jc w:val="both"/>' : '');
	const rtl = wsIsRtl(o.lang);
	const bodySpacing = widow
		+ '<w:spacing w:line="' + line + '" w:lineRule="auto" w:after="' + gap + '"/>'
		+ (o.justify ? '<w:jc w:val="both"/>' : '');
	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ '<w:docDefaults><w:rPrDefault><w:rPr>'
		// (A846: a right-to-left book's runs right to left, in the face Word sets Arabic and Persian in, its complex-script one)
		+ '<w:rFonts w:ascii="' + wsXml(font) + '" w:hAnsi="' + wsXml(font) + '"' + (rtl ? ' w:cs="' + wsXml(font) + '"' : '') + '/>'
		+ (rtl ? '<w:rtl/>' : '')
		+ '<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>'
		+ '</w:rPr></w:rPrDefault>'
		// In the DEFAULTS as well as on the body style, so that every
		// paragraph this writer emits — quotes, lists, the notes at the
		// back — inherits it without each style having to remember.
		+ '<w:pPrDefault><w:pPr>' + (rtl ? '<w:bidi/>' : '') + widow + spacing + '</w:pPr></w:pPrDefault></w:docDefaults>'
		+ st('WsBody', 'Body', bodySpacing + '<w:ind w:firstLine="' + ind + '"/>')
		+ st('WsDivider', 'Scene divider', lineOnly + '<w:jc w:val="center"/>')
		+ st('WsQuote', 'Quote', spacing + '<w:ind w:left="720" w:right="720"/>', '<w:i/>')
		+ st('WsCode', 'Code', '<w:spacing w:line="240" w:lineRule="auto" w:after="0"/><w:ind w:left="360"/>',
			'<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>')
		+ st('WsTableCell', 'Table cell', '<w:spacing w:line="240" w:lineRule="auto" w:after="0"/>')
		+ st('WsList0', 'List', spacing + '<w:ind w:left="360"/>')
		+ st('WsList1', 'List 2', spacing + '<w:ind w:left="720"/>')
		+ st('WsList2', 'List 3', spacing + '<w:ind w:left="1080"/>')
		+ st('WsList3', 'List 4', spacing + '<w:ind w:left="1440"/>')
		// THE STYLE IS NOT BOLD; THE TITLE RUN IS. All three paragraphs of the
		// title page wear WsTitle, so a <w:b/> in the STYLE would bold the
		// author and the word count too; the title run sets bold: true itself.
		// That is what the preview draws: an h1 and two ordinary paragraphs.
		+ st('WsTitle', 'Title', lineOnly + '<w:jc w:val="center"/>')
		// A PICTURE'S PARAGRAPH, centered and single spaced so the line holds the
		// picture and nothing else; its caption under it, italic, with a line of
		// air before the prose resumes.
		+ st('WsFigure', 'Figure', '<w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>')
		+ st('WsCaption', 'Caption', '<w:spacing w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:i/>')
		// NOTES, under Word's own style names (footnote text, footnote reference
		// and the endnote pair), so Word's numbering and its notes pane know
		// them: the text single spaced, a size smaller; the reference raised.
		+ st('FootnoteText', 'footnote text', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/>', '<w:sz w:val="' + Math.max(16, half - 4) + '"/><w:szCs w:val="' + Math.max(16, half - 4) + '"/>')
		+ st('EndnoteText', 'endnote text', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/>', '<w:sz w:val="' + Math.max(16, half - 4) + '"/><w:szCs w:val="' + Math.max(16, half - 4) + '"/>')
		+ '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
		+ '<w:style w:type="character" w:styleId="EndnoteReference"><w:name w:val="endnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>'
		// OUTLINE LEVELS, or Word's own table of contents cannot see these
		// headings at all. A TOC field collects by outline level, not by
		// style name — a custom style without one is invisible to it, and
		// the field comes back "no table of contents entries found",
		// which reads as a broken document rather than a missing setting.
		// ONE LINE OF THE TEXT ABOVE A HEADING, at any size: `half` half-points
		// is `half * 10` twips, 240 at 12pt, which is the 1em the page leaves.
		+ [1,2,3,4,5,6].map(n => st('WsHeading' + n, 'heading ' + n,
			lineOnly + '<w:keepNext/><w:outlineLvl w:val="' + (n - 1) + '"/>'
			// levels 1 and 2 centered, unless the writer turned Center headings off (#76)
			+ '<w:jc w:val="' + (n <= 2 && o.centerHeads !== false ? 'center' : 'left') + '"/>'
			+ '<w:spacing w:before="' + half * 10 + '" w:line="' + line + '" w:lineRule="auto"/>',
			'<w:b/><w:sz w:val="' + Math.round(wsHeadSizeEm(n) * half) + '"/>')).join('')
		+ '</w:styles>';
}

// The running header: Surname / Title / page, which is what an agent's
// guidelines ask for. It is its own part with its own relationship — the one
// place this writer has to keep two files agreeing, so the id is a constant
// rather than a generated value.
// THE HEADER'S TOKENS (#81, davidepicatto: "Export header"; the writer: "will be making this with tokens", "so add {dd}
// {mm} {yyyy} and {yy}", "also add as options phone, adress, email"): the writer types the words and the dividers
// around them. {page} is left for the page to fill; a token not in the list stays as it was typed
// (the writer, 2026-10-15: "The tokens for header should be title page time12 time24 dd mm yyyy and yy. That's it. No
// phone, email address and all")
export const WS_HEAD_TOKENS = ['title', 'page', 'time12', 'time24', 'dd', 'mm', 'yyyy', 'yy'];
export function wsHeadFill(text: string, v: Record<string, string | undefined>): string {
	return String(text || '').replace(/\{([a-z]+\d*)\}/g, (m: string, k: string) =>
		(k === 'page' || !WS_HEAD_TOKENS.includes(k) ? m : String(v[k] || '').replace(/\s+/g, ' ').trim()));
}
// A LANGUAGE WRITTEN RIGHT TO LEFT (A846, the writer: "A new user wants Persian lang pack and some rtl fixes"): Arabic,
// Persian, Hebrew, Urdu and their neighbors; the exports set their direction by it
export const wsIsRtl = (lang: string | null | undefined): boolean => /^(ar|fa|he|iw|ur|ps|sd|ug|yi|dv|ckb|syr)(-|$)/i.test(String(lang || '').trim());
// the header's side: the right, as a manuscript has it, or the left (#81, the writer: "a toggle for the header left or right")
export const wsHeadSide = (o: WsExportOpts | null | undefined): 'left' | 'right' => (o && o.headerLeft ? 'left' : 'right');
// THE TITLE PAGE'S CONTACT LINES (#81, the writer's pick "Contact block"): your name, address, phone and email, the
// ones you gave, each a line, while Contact on the title page is on
export function wsContactLines(o: WsExportOpts | null | undefined): string[] {
	if (!o || !o.contactOnTitle) return [];
	// (the address one box, a line each: the writer, "just a text box that can have 3,4 lines for the adress")
	return [o.author, ...String(o.address || '').split(/\r?\n/), o.phone, o.email].map((x) => String(x || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}
// A HEADER'S WORDS IN WORD, each {page} a PAGE field (a number Word counts, never a literal one)
const WS_PAGE_FIELD = '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>';
export function wsHeadRunsXml(text: string): string {
	return String(text || '').split('{page}').map((s) => (s ? '<w:r><w:t xml:space="preserve">' + wsXml(s) + '</w:t></w:r>' : '')).join(WS_PAGE_FIELD);
}
export function wsHeaderXml(text: string, withPage: boolean) {
	// (a header with its own {page}, #81: the number where the writer put it, and no second one after it)
	if (String(text || '').includes('{page}')) {
		return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
			+ '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
			+ '<w:p><w:pPr><w:jc w:val="right"/><w:ind w:firstLine="0"/></w:pPr>' + wsHeadRunsXml(text) + '</w:p></w:hdr>';
	}
	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ '<w:p><w:pPr><w:jc w:val="right"/><w:ind w:firstLine="0"/></w:pPr>'
		+ '<w:r><w:t xml:space="preserve">' + wsXml(text) + ' </w:t></w:r>'
		// The page number is a FIELD, not a number: Word recomputes it per
		// page, and writing a literal would put "1" on every page of the
		// manuscript.
		+ (withPage === false ? ''
			: '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>')
		+ '</w:p></w:hdr>';
}

// ── PAGE NUMBERS ANYWHERE, THE HEADER'S OWN WORDS, THE CONTENTS' TITLE AND ITS PAGES (A751) ─────────────────
//
// The writer: "do 12 too with a contents text input" (a reader's asks, A696: page numbers where I choose, my own
// header text, page numbers in the contents). Where the page number goes: a corner or the middle, top or bottom;
// top right sits beside the running header, as it always has; none, nowhere. NOT CHOSEN YET, it is what it always
// was: beside the header, and nowhere while the header is off.
// A TARGET'S CEILING (A752, the writer: "limit it to 1 milion"), a note's and a folder's, typed in the Organizer or
// in ws-structure.md by hand
export const WS_TARGET_MAX = 1000000;
export const WS_PAGE_NUM_AT = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'none'];
export function wsPageNumAt(o: WsExportRun | null | undefined, asRun?: boolean) {
	const v = String((o && o.pageNumberAt) || '');
	if (WS_PAGE_NUM_AT.includes(v)) return v;
	// (beside a running header when there is one: a run's own words, which `exportOptsFor` always writes; the panel's
	// switch while it is still being set; else none, as before)
	if (!o) return 'none';
	return (asRun ? !!o.runningHeader : !!o.runningHeaderOn) ? 'top-right' : 'none';
}
// the contents' title: the writer's own words, else "Contents" in the book's language (A864)
export function wsTocTitle(o: WsExportOpts | null | undefined) {
	return String((o && o.tocTitle) || '').trim() || wsTIn(o && o.lang, 'Contents');
}
// A HEADER OR A FOOTER LINE IN WORD, three places on one line: a centre tab stop at the column's middle and a
// right one at its edge; the running header on the right, the page number (a field, so Word counts it) where
// it was asked. The header with its number top right keeps `wsHeaderXml`, the shape it has always had.
// THE HEADER ON THE LEFT (#81): the header's words at the line's start, the number where it was asked (beside them when
// that is the left too); a {page} of the header's own is a field where it stands
export function wsHdrFtrXml(tag: 'hdr' | 'ftr', right: string, pageAt: string, contentW: number, side?: 'left' | 'right') {
	const page = '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>';
	const run = (s: string) => (s ? '<w:r><w:t xml:space="preserve">' + wsXml(s) + '</w:t></w:r>' : '');
	const tab = '<w:r><w:tab/></w:r>';
	const headAt = (slot: string) => (!right ? '' : right.includes('{page}') ? wsHeadRunsXml(right) : run(right + (pageAt === slot ? ' ' : '')));
	return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:' + tag + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ '<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="' + Math.round(contentW / 2) + '"/><w:tab w:val="right" w:pos="' + contentW + '"/></w:tabs><w:ind w:firstLine="0"/></w:pPr>'
		+ (side === 'left' ? headAt('left') : '') + (pageAt === 'left' ? page : '') + tab + (pageAt === 'center' ? page : '') + tab
		+ (side === 'left' ? '' : headAt('right')) + (pageAt === 'right' ? page : '')
		+ '</w:p></w:' + tag + '>';
}
// THE PRINTED PAGE'S MARGIN BOXES: the running header top right, the page number where it was asked (beside the
// header when that is top right too); `blank`, the same boxes emptied (the title page). The header's own words as a
// CSS string: a quote or a backslash a writer types is escaped, and an ampersand stays an ampersand
export function wsPageBoxesCss(header: string, at: string, blank?: boolean, side?: 'left' | 'right') {
	const flat = String(header || '').replace(/[\r\n]+/g, ' ');
	const q = (s: string) => '"' + s.replace(/[\\"]/g, (c) => '\\' + c) + '"';
	// (the header's box, top right or, with Header on the left, top left: #81)
	const own = side === 'left' ? 'top-left' : 'top-right';
	const boxes: Record<string, string> = {};
	// (a {page} of the header's own, #81: the page's number where the writer put it, their words around it)
	if (flat.includes('{page}')) boxes[own] = flat.split('{page}').map((s, i) => (i ? 'counter(page)' + (s ? ' ' + q(s) : '') : (s ? q(s) : ''))).filter(Boolean).join(' ');
	else if (flat) boxes[own] = q(flat + (at === own ? ' ' : '')) + (at === own ? ' counter(page)' : '');
	else if (at === own) boxes[own] = 'counter(page)';
	if (at !== own && at !== 'none') boxes[at] = 'counter(page)';
	return Object.keys(boxes).map((k) => ' @' + k + ' { content: ' + (blank ? 'none' : boxes[k]) + '; }').join('');
}
// THE PAGE EACH CONTENTS ENTRY LANDS ON, read off the paginating flow the preview draws (a column is a page, the
// title page the first): for each entry, the column its target starts in. The expanded view's flowing sheet is
// set aside while it is read, as `wsPageStarts` does.
export function wsTocPagesMeasure(doc: Document): Record<string, number> {
	const out: Record<string, number> = {};
	const view = doc.defaultView;
	const flow = doc.querySelector<HTMLElement>('.sheet:not([data-pooled]) .flow');
	if (!flow || !view || !doc.documentElement) return out;
	const root = doc.documentElement;
	const was = root.classList.contains('is-flow');
	if (was) root.classList.remove('is-flow');
	try {
		// (the column in one unit at every zoom, `wsColumnOf`: a preview at a fitted zoom numbered its contents short)
		const colOf = wsColumnOf(view, flow);
		if (!colOf) return out;
		for (const a of Array.from(flow.querySelectorAll('ol.toc a'))) {
			const id = decodeURIComponent((a.getAttribute('href') || '').replace(/^#/, ''));
			const t = id ? doc.getElementById(id) : null;
			if (t) out[id] = colOf(t.getBoundingClientRect()) + 1;
		}
	} finally { if (was) root.classList.add('is-flow'); }
	return out;
}
// …and written beside each entry, in every sheet that carries the contents
export function wsTocPagesApply(doc: Document, pages: Record<string, number>) {
	for (const li of Array.from(doc.querySelectorAll('ol.toc li'))) {
		const a = li.querySelector('a'), pg = li.querySelector('.pg');
		if (!a || !pg) continue;
		const id = decodeURIComponent((a.getAttribute('href') || '').replace(/^#/, ''));
		pg.textContent = pages[id] ? String(pages[id]) : '';
	}
}
// the preview's: once a document, when its contents has numbers to show
export function wsTocPagesFill(doc: Document | null) {
	if (!doc || !doc.documentElement || doc.documentElement.hasAttribute('data-ws-toc-pages') || !doc.querySelector('ol.toc .pg')) return;
	// NOT BEFORE A WORD FILE'S NOTES ARE AT THE FOOT OF THEIR PAGES (#72): they move the text, so every chapter after the
	// first note begins later; read before, the numbers are latched short
	if (doc.documentElement.hasAttribute('data-ws-fnfoot') && !doc.documentElement.hasAttribute('data-ws-fn-placed')) return;
	wsTocPagesApply(doc, wsTocPagesMeasure(doc));
	doc.documentElement.setAttribute('data-ws-toc-pages', '');
}

// Assemble the whole package. `sections` is [{ title, markdown }].
export function wsBuildDocx(sections: WsExportSection[], opt: WsExportRun | null | undefined) {
	const o = opt || {};
	// ── PICTURES: one part per file, its relationship, its content type ───
	//
	// THE SIZE, in EMU (914,400 to the inch, 635 to the twip, 9,525 to a pixel
	// at 96 to the inch): the width the note asked for, else the picture's
	// own; never wider than the column nor taller than 85% of the page, so a
	// caption fits under it on the same page. A file used twice is one part.
	const sheet = wsPaperOf(o);
	const colW = (sheet.w - 2 * sheet.mar) * 635;
	const colH = Math.round((sheet.h - 2 * sheet.mar) * 635 * 0.85);
	const media: { rid: string; name: string; ext: string; bytes: Uint8Array<ArrayBuffer> }[] = [];
	const ridOf = new Map<Uint8Array<ArrayBuffer>, string>();
	let picId = 0;
	o.docxFigure = (img: WsImage) => {
		if (!img.bytes || !img.w || !img.h) return [wsPara([{ text: '[Image: ' + img.name + ']' }], 'WsBody', { noIndent: true })];
		let rid = ridOf.get(img.bytes);
		if (!rid) {
			const n = media.length + 1;
			rid = 'rIdImg' + n;
			media.push({ rid, name: 'image' + n + '.' + img.ext, ext: img.ext, bytes: img.bytes });
			ridOf.set(img.bytes, rid);
		}
		let cx = (img.width || img.w) * 9525;
		let cy = Math.round(cx * img.h / img.w);
		if (cx > colW) { cy = Math.round(cy * colW / cx); cx = colW; }
		if (cy > colH) { cx = Math.round(cx * colH / cy); cy = colH; }
		picId++;
		const out = ['<w:p><w:pPr><w:pStyle w:val="WsFigure"/>' + (img.alt ? '<w:keepNext/>' : '') + '</w:pPr>'
			+ wsDocxPicture(rid, picId, img.alt || img.name, cx, cy) + '</w:p>'];
		if (img.alt) out.push(wsPara([{ text: img.alt }], 'WsCaption', { noIndent: true }));
		return out;
	};
	const body = [];
	// ── NOTES (#46): Word's own footnotes or endnotes ──────────────────────
	//
	// A marker whose note is defined in the same note becomes a reference, in
	// order of first use; its note goes into footnotes.xml or endnotes.xml
	// (the Export settings say which), and Word numbers both. A label is a
	// note's own: two notes that both say [^1] are two notes. Ids from 1;
	// -1 and 0 are the separators Word asks for.
	const noteEnd = o.footnotePlace === 'end';
	const noteXml: string[] = [];
	const noteTag = noteEnd ? 'endnote' : 'footnote';
	// A FOLDER HEADING HANDS ITS PAGE TO THE FILE BELOW IT. The folder
	// heading breaks a page so it stops trailing the previous chapter — and
	// if the FILE heading after it broke too, the folder name would get a
	// sheet of its own with nothing under it. The preview holds the heading
	// in `pendingFolder` and flushes it onto the next page WITH the content;
	// this is the same idea in the only form Word has — the folder opens
	// the page, and the file that follows is told the page is already open.
	let folderOpenedPage = false;

	if (o.titlePage) {
		const t = o.title || wsTIn(o.lang, 'Untitled');
		// NO DROP: the preview centres the block in the sheet, and a count of
		// lines down to it cannot centre — 27 text lines less a 4-line block
		// leaves 23, an odd number — so the title page is its own SECTION and
		// Word centres it.
		// YOUR CONTACT LINES IN THE TOP LEFT CORNER (#81, the writer's pick "Contact block"): a frame held to the margin's
		// corner, single spaced, so the section still centers the title; one frame, as Word joins paragraphs framed alike
		for (const line of wsContactLines(o)) {
			body.push('<w:p><w:pPr><w:pStyle w:val="WsBody"/><w:framePr w:wrap="around" w:vAnchor="margin" w:hAnchor="margin" w:xAlign="' + (wsIsRtl(o.lang) ? 'right' : 'left') + '" w:yAlign="top"/>'
				+ '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="' + (wsIsRtl(o.lang) ? 'right' : 'left') + '"/></w:pPr>'
				+ '<w:r><w:t xml:space="preserve">' + wsXml(line) + '</w:t></w:r></w:p>');
		}
		body.push(wsPara([{ text: t, bold: true, sz: wsTitleHalfPoints(o) }], 'WsTitle', { noIndent: true, align: 'center' }));
		// THE SUBTITLE under it (the writer: "also add subtitle for the title page"), a size between the title's and the text's
		const sub = String(o.subtitleText || '').trim();
		if (sub) body.push(wsPara([{ text: sub, sz: Math.round((o.pt || 12) * 2 * WS_SUBTITLE_SIZE_EM) }], 'WsTitle', { noIndent: true, align: 'center' }));
		if (o.author) body.push(wsPara([{ text: wsTIn(o.lang, 'by {author}', { author: o.author }) }], 'WsTitle', { noIndent: true, align: 'center' }));
		if (o.wordCount != null && o.wordCountOnTitle !== false) {
			// NO BLANK LINE BEFORE THE COUNT: the preview's markup is three
			// elements with no spacer between them. (A spacer once padded the drop
			// when the block was placed by counting lines — `wsTitleDropLines`
			// counts the word count as TWO, the blank and the text — but the
			// section centres the block, so there is nothing left to pad.)
			body.push(wsPara([{ text: wsTitleWords(o) }],
				'WsTitle', { noIndent: true, align: 'center' }));
		}
		// THE SECTION BREAK THAT CENTRES IT. In OOXML a section's properties
		// live in the LAST paragraph of that section, so this empty paragraph
		// IS the break — it carries `w:vAlign center`, which is Word's own
		// vertical centring for a page's content and the only mechanism it
		// has. No header reference: a manuscript's running head starts on the
		// first page of TEXT, which is what `w:titlePg` used to arrange and
		// what a separate section arranges more plainly.
		//
		// Page numbering is untouched: sections continue the count unless
		// told otherwise, so the first text page is still 2 and the running
		// header still reads it.
		{
			const tp = wsPaperOf(o);
			body.push('<w:p><w:pPr><w:sectPr>'
				+ '<w:pgSz w:w="' + tp.w + '" w:h="' + tp.h + '"/>'
				+ '<w:pgMar w:top="' + tp.mar + '" w:right="' + tp.mar + '"'
				+ ' w:bottom="' + tp.mar + '" w:left="' + tp.mar + '"'
				+ ' w:header="720" w:footer="720" w:gutter="0"/>'
				+ '<w:vAlign w:val="center"/>'
				+ '</w:sectPr></w:pPr></w:p>');
		}
		// The first real section starts a page, not a paragraph.
		if (sections.length) sections = sections.slice();
	}

	// THE CONTENTS, with links. Internal hyperlinks need no relationship —
	// `w:anchor` points at a bookmark inside the same document — which is
	// why this costs a few lines rather than another part in the package.
	// Deliberately not Word's own TOC field: that renders as "right-click
	// to update" until the reader does, and a manuscript arriving with an
	// instruction where its contents should be is worse than no contents.
	// WORD'S OWN TABLE OF CONTENTS, not a list of links. The list was
	// honest and could not do the one thing a contents page is for on
	// paper: PAGE NUMBERS. A field knows them, and recomputes them when
	// the manuscript changes rather than lying after the first edit.
	//
	// The old objection — that a field renders as "right-click to update"
	// until a reader refreshes it — is answered by settings.xml below,
	// which asks Word to update fields on open, and since A806 by the
	// entries written inside the field, which every app shows as they are.
	if (o.toc && sections.length > 1) {
		body.push(wsPara([{ text: wsTocTitle(o), bold: true }], 'WsHeading2',
			{ noIndent: true, pageBreakBefore: !!o.titlePage }));
		// THE ENTRIES INSIDE THE FIELD (A806, the writer: "cant we make the table contents in word a real word TOC?"): it
		// was one, Word's TOC field, but it carried only "Right-click here and choose Update Field", which is all Word on a
		// phone, Google Docs or LibreOffice show until somebody updates it. The field's result is written in now, as Word
		// writes it: an entry a paragraph, a link to its chapter's bookmark, stepped in by its level, its page (the
		// preview's, which the PDF prints) after a dotted tab at the text's right edge; Word recomputes them on update
		const tp = wsPaperOf(o), tabAt = Math.max(1440, tp.w - 2 * tp.mar);
		const stepOf = wsTocSteps(o, sections), pageOf = o.tocPageOf || {};
		// (the structure's numbers, #79)
		const tocNums = wsHeadNumbers(o, sections);
		const instr = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
			// \o collects a RANGE of outline levels, \h makes the entries
			// links, \z hides the page numbers in web layout, \u uses the
			// outline levels declared above.
			//
			// THE RANGE IS COMPUTED, NOT FIXED. Folder headings produce as many
			// levels as the folders nest, and a Part three deep would vanish from a
			// fixed "1-2". It is NOT a flat "1-6" either: the notes' own headings
			// are demoted BELOW the structural ones, so a fixed 6 would pull every
			// heading inside every chapter into the table. The deepest structural
			// level is exactly the line between the two, and with folder headings
			// off it computes to 2.
			+ '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-'
			// (always its page numbers: A751's \n, "no page numbers", gone with its switch, the writer's word)
			+ wsDeepestLevel(o, sections) + '" \\h \\z \\u </w:instrText></w:r>'
			+ '<w:r><w:fldChar w:fldCharType="separate"/></w:r>';
		// (the book's own folder in the text, never in the contents: A848; the field opens on the first entry, ends on the last)
		const listed = sections.map((sec, i) => ({ sec, i })).filter((e) => !e.sec.book);
		listed.forEach(({ sec, i }, n) => {
			const id = wsAnchorId(sec.title, i), pg = pageOf[id] ? String(pageOf[id]) : '';
			body.push('<w:p><w:pPr><w:pStyle w:val="WsBody"/><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="' + tabAt + '"/></w:tabs>'
				+ '<w:ind w:left="' + (stepOf(sec) * 440) + '" w:firstLine="0"/></w:pPr>'
				+ (n === 0 ? instr : '')
				+ '<w:hyperlink w:anchor="' + wsXml(id) + '" w:history="1"><w:r><w:t xml:space="preserve">' + wsXml(wsNumbered(tocNums[i], sec.title || ('Section ' + (i + 1)))) + '</w:t></w:r>'
				+ (pg ? '<w:r><w:tab/></w:r><w:r><w:t>' + pg + '</w:t></w:r>' : '') + '</w:hyperlink>'
				+ (n === listed.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '') + '</w:p>');
		});
	}

	let bibAt = -1;
	// A PAGE OWED (#103): the last file ended on a --- that asked for a new page, which its own blocks could not give
	let owed = false;
	// (the structure's numbers, #79)
	const nums = wsHeadNumbers(o, sections);
	sections.forEach((sec, idx) => {
		// the list of sources goes at the end (A572 step 4)
		if (sec.bib) { bibAt = idx; return; }
		// ── A FOLDER IS A HEADING AND NOTHING ELSE ───────────────────
		//
		// No divider, no page of its own, no body. It does NOT answer to
		// `sectionTitles`, which is about whether a FILE contributes its
		// own name — a different question with its own control.
		//
		// `WsHeading1`..`WsHeading6` are all declared in the style table,
		// so Word gets a real outline level and the TOC field collects it.
		if (sec.folder) {
			const lv = Math.min(6, sec.depth || 1);
			if (o.toc) {
				body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="'
					+ wsAnchorId(sec.title, idx) + '"/>');
			}
			// AND IT OPENS A PAGE, like every other section — the preview breaks
			// there too. THE PREVIEW'S RULE IS `(i > 0 || o.titlePage || o.toc) &&
			// o.pageBreaks !== false`, and this is it MINUS the title-page term: a
			// `.page` in the preview is an element, so 'break' there just means
			// start another one; in Word the title page is its own SECTION and a
			// section break already ends the page. A page break on top of it would
			// insert a blank sheet.
			// A FOLDER STRAIGHT AFTER A FOLDER (A848) stays on the page the first opened, as the page targets carry both
			// headings onto one; it gave "Novel" a page with nothing else on it
			const afterFolder = idx > 0 && !!sections[idx - 1].folder;
			const fbrk = (!afterFolder && !!(idx > 0 || o.toc) && o.pageBreaks !== false) || owed;
			owed = false;
			if (!afterFolder) folderOpenedPage = fbrk;
			body.push(wsPara([{ text: wsNumbered(nums[idx], sec.title), bold: true }], 'WsHeading' + lv,
				{ noIndent: true, pageBreakBefore: fbrk, bodyLevel: !!sec.book }));
			if (o.toc) body.push('<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
			return;
		}
		const first = idx === 0 && !o.titlePage;
		// Read once and cleared here, so it cannot leak past the section
		// immediately below the folder — a second file must break normally.
		const justAfterFolder = folderOpenedPage;
		folderOpenedPage = false;
		const brkOwed = owed;
		owed = false;
		// A DIVIDER BETWEEN FILES, for scenes that run on rather than each
		// starting a page. Deliberately independent of the page break: a
		// manuscript that breaks pages between chapters still wants a
		// divider between the scenes INSIDE one, and a writer who has each
		// scene in its own file wants exactly this and no page breaks at
		// all. Both on is legal and simply means both.
		if (o.starBetween && idx > 0 && !brkOwed) {
			body.push(wsPara([{ text: wsJoinMark(o) }], 'WsDivider',
				{ align: 'center', noIndent: true }));
		}
		if (o.sectionTitles && sec.title) {
			// The bookmark wraps the heading, so a link lands on the title
			// rather than a line above it. Word requires the id twice —
			// start carries the name, end only the number — and a mismatch
			// there is one of the faults it reports as a corrupt file.
			if (o.toc) {
				const id = wsAnchorId(sec.title, idx);
				body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="' + id + '"/>');
			}
			// THE HEADING DOES NOT DECIDE THE PAGE. `pageBreakBefore: !first`
			// broke a page before every heading whatever the join answer
			// said — so "Each file: follows a divider" put a divider at the
			// top of a fresh page, and "runs straight on" ran straight on to
			// page two. The bug hid because the two commonest settings are
			// page breaks ON (where it is right) and headings OFF (where it
			// never runs), and it needed both of the other answers at once
			// to show.
			// ONE LEVEL BELOW ITS FOLDER when folder headings are on, and
			// `WsHeading2` when they are off — which is what every export
			// has done since this option existed.
			body.push(wsPara([{ text: wsNumbered(nums[idx], sec.title), bold: true }],
				'WsHeading' + wsFileHeadLevel(o, sec),
				{ noIndent: true,
					pageBreakBefore: (o.pageBreaks !== false && !first && !justAfterFolder) || brkOwed }));
			if (o.toc) body.push('<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
		} else if (o.toc) {
			// No heading to hang it on, so the bookmark sits on an empty
			// paragraph at the section's start — a link that lands in the
			// right place beats a contents entry that does nothing.
			const id = wsAnchorId(sec.title, idx);
			body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="' + id + '"/>'
				+ '<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
			if ((o.pageBreaks && !first) || brkOwed) body.push(wsPara([], 'WsBody', { pageBreakBefore: true }));
		} else if ((o.pageBreaks && !first) || brkOwed) {
			body.push(wsPara([], 'WsBody', { pageBreakBefore: true }));
		} else if (o.titlePage && idx === 0) {
			body.push(wsPara([], 'WsBody', { pageBreakBefore: true }));
		}
		// The note's own headings move down under the folder's, or under the file's name with Both — see
		// `wsNoteHeadings`. The other two targets do the same.
		o.imgs = sec.images || null;
		const defs = wsNotesKept(wsFootnoteDefs(sec.markdown), o);
		const ids = new Map<string, number>();
		o.noteRef = (label: string) => {
			const text = defs.get(label);
			if (text == null) return null;
			let n = ids.get(label);
			if (!n) {
				n = noteXml.length + 1;
				ids.set(label, n);
				// the note's own text, its markers left as labels (a note in a note is not a note)
				const runs = wsInlineRuns(text, Object.assign({}, o, { noteRef: null }));
				noteXml.push('<w:' + noteTag + ' w:id="' + n + '">'
					+ wsPara(([{ text: '', noteMark: noteEnd ? 'end' : 'foot' }, { text: ' ' }] as WsRun[]).concat(runs), noteEnd ? 'EndnoteText' : 'FootnoteText')
					+ '</w:' + noteTag + '>');
			}
			return { n, end: noteEnd };
		};
		const built = wsBlocksFromMarkdown(wsNoteHeadings(o, sec, sec.markdown), o);
		for (const b of built.blocks) body.push(b);
		owed = built.breakAfter;
	});
	o.noteRef = null;
	// THE LIST OF SOURCES (A572 step 4): a page of its own under the style's heading, each entry hanging half an
	// inch, its titles in italics; Word puts its endnotes, when they are endnotes, after everything
	if (bibAt >= 0) {
		const b = sections[bibAt];
		if (o.toc) body.push('<w:bookmarkStart w:id="' + (bibAt + 100) + '" w:name="' + wsAnchorId(b.title, bibAt) + '"/>');
		body.push(wsPara([{ text: b.title, bold: true }], 'WsHeading' + wsFileHeadLevel(o, b), { noIndent: true, pageBreakBefore: true }));
		if (o.toc) body.push('<w:bookmarkEnd w:id="' + (bibAt + 100) + '"/>');
		for (const e of b.entries || []) body.push(wsPara(wsInlineRuns(e, o), 'WsBody', { hanging: true }));
	}


	// THE TITLE PAGE CARRIES NO HEADER. A manuscript's running head starts
	// on the first page of TEXT — "Surname / Title / 1" printed across the
	// title page is one of the tells that a document was generated rather
	// than set. `w:titlePg` says "this section's first page is different",
	// and the first-page header it then looks for is deliberately empty.
	// THE TITLE PAGE IS ITS OWN SECTION NOW and carries no header of its
	// own, so `w:titlePg` has nothing left to arrange — it says "this
	// section's first page differs", and this section's first page is the
	// first page of TEXT, which SHOULD wear the running head. Kept only for
	// the case it still describes: a running header with no title page.
	const wantFirst = false;   // see above: nothing left for it to arrange
	const paper = wsPaperOf(o);
	const wantToc = !!(o.toc && sections.length > 1);
	const wantSettings = wantToc || noteXml.length > 0;
	// THE NUMBER WHERE IT WAS ASKED (A751): a header for the running head or a number at the top, a footer for one at
	// the foot; neither on the title page, its own section with none
	const pnAt = wsPageNumAt(o, true);
	const wantHeader = !!o.runningHeader || pnAt.startsWith('top-');
	const wantFooter = pnAt.startsWith('bottom-');
	const headerRef = (wantHeader
		? '<w:headerReference w:type="default" r:id="rId3"/>'
			+ (wantFirst ? '<w:headerReference w:type="first" r:id="rId4"/><w:titlePg/>' : '')
		: '') + (wantFooter ? '<w:footerReference w:type="default" r:id="rId7"/>' : '');
	const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
		+ ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
		+ ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
		+ '<w:body>' + body.join('')
		// The paper, its margins and the manuscript default — Letter with
		// an inch all round — all come out of WS_PAPERS now, because a
		// book's trim size is a page and not a variant of Letter.
		+ '<w:sectPr>' + headerRef
		+ '<w:pgSz w:w="' + paper.w + '" w:h="' + paper.h + '"/>'
		+ '<w:pgMar w:top="' + paper.mar + '" w:right="' + paper.mar + '"'
		+ ' w:bottom="' + paper.mar + '" w:left="' + paper.mar + '"'
		+ ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
		+ '</w:body></w:document>';

	const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
		+ '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
		+ '<Default Extension="xml" ContentType="application/xml"/>'
		+ Array.from(new Set(media.map((m) => m.ext))).map((x) => '<Default Extension="' + x + '" ContentType="' + (WS_IMAGE_MIME[x] || 'image/png') + '"/>').join('')
		+ '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
		+ '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
		+ (wantHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '')
		+ (wantFooter ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : '')
		+ (wantFirst ? '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '')
		+ (wantSettings ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : '')
		+ (noteXml.length ? '<Override PartName="/word/' + noteTag + 's.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + noteTag + 's+xml"/>' : '')
		+ '</Types>';

	const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		+ '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
		+ '</Relationships>';

	const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
		+ '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
		+ (wantHeader ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '')
		+ (wantFooter ? '<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' : '')
		+ (wantFirst ? '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>' : '')
		+ (wantSettings ? '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' : '')
		+ (noteXml.length ? '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + noteTag + 's" Target="' + noteTag + 's.xml"/>' : '')
		+ media.map((m) => '<Relationship Id="' + m.rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + m.name + '"/>').join('')
		+ '</Relationships>';

	// The part that turns "right-click to update" into a contents page a
	// reader never has to think about. Only shipped when there IS a field
	// to update: a document with nothing dirty in it should not ask. AND
	// WHEN THERE ARE NOTES: it names their two separators, in the order
	// Word's schema keeps (updateFields before footnotePr before endnotePr).
	const settingsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
		+ (wantToc ? '<w:updateFields w:val="true"/>' : '')
		+ (noteXml.length ? '<w:' + noteTag + 'Pr><w:' + noteTag + ' w:id="-1"/><w:' + noteTag + ' w:id="0"/></w:' + noteTag + 'Pr>' : '')
		+ '</w:settings>';
	// The notes' own part: the two separators Word draws above them, then the notes.
	const sep = (id: number, el: string) => '<w:' + noteTag + ' w:type="' + el + '" w:id="' + id + '"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:' + el + '/></w:r></w:p></w:' + noteTag + '>';
	const notesPart = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
		+ '<w:' + noteTag + 's xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
		+ sep(-1, 'separator') + sep(0, 'continuationSeparator') + noteXml.join('')
		+ '</w:' + noteTag + 's>';

	const entries: { name: string; bytes: number[] | Uint8Array }[] = [
		{ name: '[Content_Types].xml', bytes: wsUtf8(types) },
		{ name: '_rels/.rels',         bytes: wsUtf8(rootRels) },
		{ name: 'word/document.xml',   bytes: wsUtf8(doc) },
		{ name: 'word/_rels/document.xml.rels', bytes: wsUtf8(docRels) },
		{ name: 'word/styles.xml',     bytes: wsUtf8(wsStylesXml(o)) }
	];
	if (wantSettings) entries.push({ name: 'word/settings.xml', bytes: wsUtf8(settingsXml) });
	if (noteXml.length) entries.push({ name: 'word/' + noteTag + 's.xml', bytes: wsUtf8(notesPart) });
	const contentW = paper.w - 2 * paper.mar;
	if (wantHeader) {
		entries.push({ name: 'word/header1.xml',
			bytes: wsUtf8(wsHeadSide(o) === 'left'
				// (on the left, #81: the words at the line's start, a number at the top where it was asked)
				? wsHdrFtrXml('hdr', o.runningHeader || '', pnAt.startsWith('top-') ? pnAt.slice(4) : '', contentW, 'left')
				: pnAt === 'top-left' || pnAt === 'top-center'
				? wsHdrFtrXml('hdr', o.runningHeader || '', pnAt.slice(4), contentW)
				: wsHeaderXml(o.runningHeader || '', pnAt === 'top-right' && o.pageNumbers !== false)) });
	}
	if (wantFooter) entries.push({ name: 'word/footer1.xml', bytes: wsUtf8(wsHdrFtrXml('ftr', '', pnAt.slice(7), contentW)) });
	if (wantFirst) {
		// An EMPTY header, not a missing one: Word needs the part the
		// reference names, and a reference pointing at nothing is the kind
		// of fault it reports as a corrupt file rather than as a missing
		// header.
		entries.push({ name: 'word/header2.xml', bytes: wsUtf8(wsHeaderXml('', false)) });
	}
	for (const m of media) entries.push({ name: 'word/media/' + m.name, bytes: m.bytes });
	o.docxFigure = null;
	o.imgs = null;
	return wsZip(entries);
}
