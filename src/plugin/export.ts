// Word-Smith — Export: the manuscript export: the ticks, the window, the preview, the writers.
//
// Part of the plugin class, cut out by area: the
// methods below are assigned onto WordSmith.prototype at the end of plugin.ts
// and declared on the class there, so every `this.x()` reaches them exactly
// as before, from any file. `this` is the plugin.

import { MarkdownView, TFile, TFolder, Notice, Platform } from 'obsidian';
import type { WorkspaceLeaf, TAbstractFile } from 'obsidian';
import type { WsExportOpts, WsExportRun, WsExportBoolKey, WsExportStringKey, WsExportSection, WsImage } from '../core/settings';
import { wsIsRtl, wsPageNumAt, wsTocTitle, wsPageBoxesCss, wsTocPagesMeasure, wsTocPagesFill, wsFootNotes, wsIndentSize, wsHeadNumbers, wsNumbered, wsNoteHeadings, wsPageOfPart, wsHeadFill, wsHeadSide, wsContactLines, WS_SUBTITLE_SIZE_EM, wsParaSpacing, wsDropHeadings } from '../core/preamble';
import { WS_IMAGE_MIME, wsImageRefRe, wsParseImageRef, wsMdImageLink, wsRelPath, wsFootnoteDefs, wsNotesKept, wsRunsHtml, wsEpubCheck, wsWheelStep } from '../core/preamble';
import type { WsWheelAcc } from '../core/preamble';
import { wsCiteMissing, wsCiteMissingText, wsCiteSections, wsCiteThin, wsCiteThinText } from '../core/citations';
import { wsT, wsTIn, wsUiJoin } from '../core/ui-text';
import { wsPageStarts, WS_FRAME_SHELL, WS_TITLE_SIZE_EM, WS_EXPORT_FOLDER_HEADINGS_DEFAULT, WS_EXPORT_PREVIEW_AUTO_BYTES, wsHtmlBlocks, wsDropCallouts, wsDropTags, WS_PAPERS, wsAnchorId, wsBuildDocx, wsBuildEpub, wsCatch, wsCtxScope, wsExportRoot, wsFileHeadLevel, wsFormatHasPages, wsHeadSizeEm, wsHostTint, wsJoinMark, wsLineOfSnippet, wsLineTwips, wsPaperMicrons, wsPaperOf, wsSnippetOf, wsTitleWords, wsTocSteps, wsTwipIn, wsGlyphWord, wsIconInto, wsIsFile, wsIsFolder, wsStr, wsErrMsg, wsElOf } from '../core/preamble';
import type WordSmith from './plugin';

// ── DRAWING A PICTURE (A568), with the engine Obsidian runs ─────────────
//
// THE LONGEST SIDE A PICTURE TRAVELS AT: 3,000 pixels is past 300 dpi across
// any page this exports (a Letter column is 6.5 inches), and the bound on
// what a phone holds while a book of photographs is assembled. Longer is
// redrawn at this size; shorter travels as it is.
const WS_IMAGE_MAX_SIDE = 3000;
// The picture's own size, by drawing it. Null when it cannot be drawn here.
async function wsImageSize(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<{ w: number; h: number } | null> {
	const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const w = img.naturalWidth, h = img.naturalHeight;
		return w > 0 && h > 0 ? { w, h } : null;
	} catch { return null; }
	finally { URL.revokeObjectURL(url); }
}
// Redrawn at a size and into a format: the bytes, or null when the engine
// would not draw it.
async function wsImageRedraw(bytes: Uint8Array<ArrayBuffer>, mime: string, w: number, h: number, into: string): Promise<Uint8Array<ArrayBuffer> | null> {
	const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const canvas = createEl('canvas');
		canvas.width = w; canvas.height = h;
		const g = canvas.getContext('2d');
		if (!g) return null;
		// a photograph has no transparency to keep: white under it, not black
		if (into === 'image/jpeg') { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); }
		g.drawImage(img, 0, 0, w, h);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, into, 0.92));
		return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
	} catch { return null; }
	finally { URL.revokeObjectURL(url); }
}
// The bytes as a data address, for a document that must stand alone.
async function wsDataUrl(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<string> {
	const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
	return await new Promise<string>((res, rej) => {
		const fr = new FileReader();
		fr.onload = () => res(typeof fr.result === 'string' ? fr.result : '');
		fr.onerror = () => rej(fr.error || new Error('the picture could not be read'));
		fr.readAsDataURL(blob);
	});
}
import type { WsModEvent } from './plugin';

// the reader's page pool, measured: its document and window, the stack and the
// first sheet, the gap, the pitch across and down, and how many pages there are
// THE FIGURES AFTER TICK ALL (A627, the writer: "put the 1 folder 1 notes... after tick
// button, then the export button after export as"): what is ticked, how much it comes to,
// then the format and the button. Still before the button in the DOM, so the figures are
// read before the act; where there is no Tick all, before the button as they were.
function wsPlaceFigures(row: Element, head: Element) {
	const tick = row.querySelector('.ws-export-tickall');
	if (tick) { tick.after(head); return; }
	const go = row.querySelector('.ws-export-go');
	// BESIDE IT WHEREVER IT LIVES: in the format's group since A715, no longer a child of the row
	if (go) go.before(head);
}
// THE PAPER'S LINE IN THE INTERFACE'S WORDS (A695): the unit routed with the line, the size
// as the table writes it, the name kept where it is one (A4, US Letter, Executive); the three
// trim sizes are publishing's words rather than names, so a table may have them. In English
// it reads exactly as WS_PAPERS writes it.
function wsPaperLine(p: { id: string; label: string }): string {
	const m = /^(.*) — (.*) (in|mm)$/.exec(p.label);
	if (!m) return p.label;
	const paper = p.id === 'trade' ? wsT('Trade paperback') : p.id === 'digest' ? wsT('Digest')
		: p.id === 'pocket' ? wsT('Mass market') : m[1];
	return m[3] === 'in' ? wsT('{paper} — {size} in', { paper, size: m[2] })
		: wsT('{paper} — {size} mm', { paper, size: m[2] });
}
// a row of an Export list (A617, A625): its switch, name, hint and icons
type WsPickRow = [WsExportBoolKey, string, string, string[]];
// each list button's own saying, so a format change can have it said again (paintFmt)
const wsPickSay = new WeakMap<HTMLElement, () => void>();
type WsPoolMetrics = { doc: Document; win: Window; stack: HTMLElement; first: HTMLElement; gap: number; across: number; down: number; pages: number };

// The preview's page metrics, read from the sheet (lifted out of exportPreviewInto, A488).
function wsPreviewMetrics(a: { docOf: () => Document | null }) {
	const { docOf } = a;
	const doc = docOf();
	const stack = doc && doc.querySelector('.stack');
	// ── NOT A HIDDEN ONE ───────────────────────────────────────
	//
	// AT THE END OF THE BOOK THE POOL RUNS OUT OF PAGES TO SHOW: two of
	// four sheets are wanted, the other two are hidden — and the FIRST
	// sheet in the document is one of them. `querySelector('.sheet')` then
	// hands back a `display: none` element, whose flow measures ZERO wide,
	// so the book measures ONE PAGE, the stack is resized to one page
	// tall, and the frame has nowhere left to be scrolled to.
	//
	// A HIDDEN ELEMENT DOES NOT ANSWER, IT DECLINES — and a zero read off
	// it is not the number zero, it is the absence of a reading. Both
	// halves are fixed here: ask a sheet that is showing, and refuse to
	// answer at all if the width comes back zero.
	const sheet = doc && (doc.querySelector('.sheet:not([hidden])')
		|| doc.querySelector('.sheet'));
	const flow = sheet && sheet.querySelector('.flow');
	if (!doc || !stack || !sheet || !flow) return null;
	const win = doc.defaultView;
	if (!win) return null;
	let gap = 18;
	try {
		const g = parseFloat(win.getComputedStyle(doc.documentElement)
			.getPropertyValue('--sheet-gap'));
		if (isFinite(g)) gap = g;
	} catch (_) { wsCatch('exportPreviewInto / metrics: const g = parseFloat(win.getComputedStyle(doc.documentElement)', _); }
	let colGap = 0;
	try {
		const g = parseFloat(win.getComputedStyle(flow).columnGap);
		if (isFinite(g)) colGap = g;
	} catch (_) { wsCatch('exportPreviewInto / metrics: const g = parseFloat(win.getComputedStyle(flow).columnGap);', _); }
	const sheetH = sheet.offsetHeight || 0;
	const across = (flow.clientWidth || 0) + colGap;
	// NOTHING TO MEASURE IS NOT A MEASUREMENT OF NOTHING. A sheet with
	// no height or no width has been hidden, or detached, or has not
	// been laid out yet — and every caller of this reads `pages` and
	// RESIZES THE STACK from it, so one bad answer collapses the book
	// and throws the reader to the top.
	if (!sheetH || (flow.clientWidth || 0) <= 0) return null;
	// THE LAST PAGE CARRIES NO TRAILING GUTTER, so one is added back
	// before dividing. Without it a two-page manuscript measures 1.9
	// pages and reads as two only because `round` was kind.
	const pages = across > 0
		? Math.max(1, Math.round((flow.scrollWidth + colGap) / across)) : 1;
	return { doc: doc, win: win, stack: stack, first: sheet,
		gap: gap, across: across, down: sheetH + gap, pages: pages };
}

// The sheets laid out in the preview's frame (lifted out of exportPreviewInto, A488).
function wsPreviewPlaceSheets(a: { o: WsExportRun; pool: HTMLElement[]; topOf: (m: WsPoolMetrics, n: number) => number }, m: WsPoolMetrics, from: number) {
	const { o, pool, topOf } = a;
	const need = [];
	for (let i = 0; i < pool.length; i++) {
		const n = from + i;
		if (n >= 0 && n < m.pages) need.push(n);
	}
	const held = new Map<number, HTMLElement>();
	for (const el of pool) {
		const at = el.dataset.page === undefined ? null : Number(el.dataset.page);
		if (at != null && need.indexOf(at) !== -1 && !held.has(at)) held.set(at, el);
	}
	const spare = pool.filter(el => {
		const at = el.dataset.page === undefined ? null : Number(el.dataset.page);
		return !(at != null && held.get(at) === el);
	});
	for (const n of need) {
		if (held.has(n)) continue;
		const el = spare.shift();
		if (!el) break;
		el.dataset.page = String(n);
		held.set(n, el);
	}
	for (const [n, el] of held) {
		el.style.top = topOf(m, n) + 'px';
		el.hidden = false;
		const flow = el.querySelector('.flow');
		if (flow) flow.scrollLeft = n * m.across;
		const hdr = el.querySelector('.hdr');
		// NOT ON THE TITLE PAGE, because the .docx does not put it
		// there: `w:titlePg` writes a separate empty first-page
		// header, and the preview is meant to be the sheet in the
		// file. The number is the PAGE — it was `counter(sheet)`,
		// which counted FILES, so a forty-page chapter said the same
		// number on all forty of its pages.
		// THE NUMBER WHERE IT WAS ASKED (A751): beside the header top right, else in a box of its own
		// (the header's side and its own {page}, #81)
		const at = wsPageNumAt(o, true), mine = 'top-' + wsHeadSide(o);
		const bare = !!o.titlePage && n === 0;
		if (hdr) {
			hdr.textContent = bare ? ''
				: o.runningHeader ? (o.runningHeader.split('{page}').join(String(n + 1)) + (at === mine ? ' ' + (n + 1) : ''))
				: (at === mine ? String(n + 1) : '');
		}
		const pn = el.querySelector('.pnum');
		if (pn) pn.textContent = (bare || at === mine || at === 'none') ? '' : String(n + 1);
	}
	// A SHEET WITH NO PAGE IS HIDDEN rather than left showing page one
	// somewhere down the stack — at the end of a short book the pool is
	// bigger than the book. Built once, not once per sheet.
	const placed = new Set(held.values());
	for (const el of pool) if (!placed.has(el)) el.hidden = true;
}

// Where the reader is, as a page (lifted out of exportPreviewInto, A488).
function wsPreviewTopNow(a: { metrics: () => WsPoolMetrics | null; pool: HTMLElement[]; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; } }) {
	const { metrics, pool, pv } = a;
	try {
		const sheet = pool[0];
		const fl = sheet && sheet.querySelector('.flow');
		if (!fl) return null;
		const kids = fl.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
		if (!kids.length) return null;
		if (pv.flow) {
			// ── ASKED OF THE VIEWPORT, NOT OF AN ANCESTOR ───────────
			//
			// `getBoundingClientRect` answers in the same units the scroll does,
			// so nothing here has to know the zoom — and nothing depends on WHICH
			// ancestor happens to be positioned. `offsetTop` would: `.sheet` is
			// `position: absolute` in pages and `static` in flow, so the offset
			// parent CHANGES with the very class this function exists to survive.
			for (const k of kids) {
				if (k.getBoundingClientRect().bottom > 0) return k;
			}
			return kids[kids.length - 1];
		}
		// PAGED: the first thing in the column the reader is on.
		// `offsetLeft` inside a multicol is the column's own offset, so
		// dividing by `across` names the page without measuring anything
		// this file does not already measure.
		const m = metrics();
		if (!m || !(m.across > 0)) return null;
		for (const k of kids) {
			if (Math.floor((k.offsetLeft + 1) / m.across) >= pv.pageAt) return k;
		}
		return kids[kids.length - 1];
	} catch { return null; }
}

// The reader moved to a page (lifted out of exportPreviewInto, A488).
function wsPreviewTopTo(a: { metrics: () => WsPoolMetrics | null; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; showPage: (n: number) => void }, el: HTMLElement | null) {
	const { metrics, pv, showPage } = a;
	if (!el) return;
	const doc = el.ownerDocument;
	const win = doc && doc.defaultView;
	if (!win) return;
	// CALLED WITH THE LAYOUT ALREADY SETTLED — `flowSet` owns the frame,
	// because the page arithmetic has to be redone in the SAME frame as
	// the scroll and doing it here would be one rAF too late.
	try {
		if (pv.flow) {
			// THE VIEWPORT'S OWN UNITS, both of them: a rect and a scroll
			// offset are in the same space `scrollTo` takes, so nothing
			// here has to know the zoom. A LINE OF AIR ABOVE IT, so the
			// paragraph is not welded to the top edge of the frame.
			const y = el.getBoundingClientRect().top + (win.scrollY || 0);
			win.scrollTo(0, Math.max(0, y - 12));
			return;
		}
		// ── AND COLLAPSING LANDS WHERE IT LEFT ──
		//
		// The second frame in `flowSet` is what makes this exact: the
		// scrollbar leaves with the flow class and `clientWidth` is half the
		// divisor. THE ONE CASE THAT MISSES IS ON THE OTHER SIDE OF THE TRIP:
		// flip back before the EXPAND has restored and this reads a position
		// the writer never saw. Nothing here waits that out — a settle loop
		// was tried for it and taken back out, because it missed too.
		const m = metrics();
		if (!m || !(m.across > 0)) return;
		showPage(Math.floor((el.offsetLeft + 1) / m.across));
	} catch (_) { wsCatch('exportPreviewInto / topTo: if (flow)', _); }
}

// The flow (one long page) switched on or off (lifted out of exportPreviewInto, A488).
function wsPreviewFlowApply(a: { apply: () => void; docOf: () => Document | null; host: HTMLElement; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; readFileSay: () => void }) {
	const { apply, docOf, host, pv, readFileSay } = a;
	try {
		const doc = docOf();
		if (doc && doc.documentElement) {
			// WHERE EACH PRINTED PAGE BEGINS (A569, look 4), read off the pages before they flow,
			// and once more on the next frame for a document the engine had not laid out yet
			if (pv.flow) {
				wsPageStarts(doc);
				try { wsTocPagesFill(doc); } catch (_) { wsCatch('flowApply: the contents\' pages', _); }
				try { window.requestAnimationFrame(() => { try { if (pv.flow) wsPageStarts(doc); } catch (_) { wsCatch('flowApply: page starts, next frame', _); } }); } catch (_) { wsCatch('flowApply: requestAnimationFrame', _); }
			}
			doc.documentElement.classList.toggle('is-flow', pv.flow);
		}
	} catch (_) { wsCatch('exportPreviewInto / flowApply: const doc = docOf();', _); }
	// THE PANE IS NOT OURS TO EMPTY, so the class goes on the split and
	// the stylesheet decides what that means — the same arrangement the
	// narrow layout already uses, rather than this function reaching in
	// and hiding somebody else's column.
	try {
		const split = host && host.closest && host.closest('.ws-export-split');
		if (split) split.classList.toggle('is-flow', pv.flow);
		// THE READER TAKES THE WINDOW: the split's own flip folds the options
		// away, and one class on the body has the stylesheet give the reader
		// every column — the same shape the narrow layout draws with the
		// panel up.
		const body = split && split.closest && split.closest('.ws-uni-body');
		if (body) body.classList.toggle('is-reader', pv.flow);
	} catch (_) { wsCatch('exportPreviewInto / flowApply: const split = host && host.closest && …', _); }
	// THE PAGE CONTROLS DESCRIBE A THING THAT IS NOT THERE. Hidden
	// rather than removed: they come back on collapse, and they are the
	// elements `syncPages` writes into.
	try { if (pv.pageBox) pv.pageBox.toggleClass('is-gone', pv.flow); } catch (_) { wsCatch('exportPreviewInto / flowApply: if (pageBox) pageBox.toggleClass(\'is-gone\', flow);', _); }
	// THE ZOOM CHANGES MEANING WITH THE MODE, so it is re-written here:
	// a fit of 0.51 is right for a page and half-size for a reader.
	try { apply(); } catch (_) { wsCatch('exportPreviewInto / flowApply: apply();', _); }
	// THE RAIL IS THE READER'S, so it is raised with it and taken down
	// with it. BUILT ON FIRST USE rather than with the pane: a writer
	// who never expands never pays for it.
	// THE POSITION READ-OUT IS THE READER'S, and leaves with it. It is
	// in the footer beside the zoom, not on a rail of its own.
	try { if (pv.readPage) pv.readPage.toggleClass('is-gone', !pv.flow); } catch (_) { wsCatch('exportPreviewInto / flowApply: if (readPage) readPage.toggleClass(\'is-gone\', !flow);', _); }
	// …and its page arrows (a desktop's) with it
	try { if (pv.readPage && pv.readPage.parentElement) for (const b of Array.from(pv.readPage.parentElement.querySelectorAll('.ws-export-readstep'))) b.toggleClass('is-gone', !pv.flow); } catch (_) { wsCatch('exportPreviewInto / flowApply: the page arrows', _); }
	try { if (pv.readFile) { pv.readFile.toggleClass('is-gone', !pv.flow); if (pv.flow) readFileSay(); } } catch (_) { wsCatch('exportPreviewInto / flowApply: readFile.toggleClass(is-gone)', _); }
	// THE ZOOM AFTER THE PAGE ARROWS (the writer: "in expanded view put the zoom dropdown after the page arrows to be more in
	// line with the normal export tab"): the paged row reads ‹ 1 / ~259 › and the zoom; the reader's, the file list,
	// ‹ 6 / 766 › and the zoom, Collapse last. Its group moved into the reader's before Collapse, and back on the way out
	try {
		const zoomBox = pv.pct ? pv.pct.closest<HTMLElement>('.ws-export-zoom') : null;
		const view = pv.readPage ? pv.readPage.parentElement : null;
		const xb = view ? view.querySelector('.ws-export-expand') : null;
		if (zoomBox && view && xb && view.parentElement) {
			if (pv.flow) view.insertBefore(zoomBox, xb);
			else if (zoomBox.parentElement === view) view.parentElement.insertBefore(zoomBox, view);
		}
	} catch (_) { wsCatch('exportPreviewInto / flowApply: the zoom after the page arrows', _); }
	if (pv.flowSay) { try { pv.flowSay(); } catch (_) { wsCatch('exportPreviewInto / flowApply: flowSay();', _); } }
}

// PAGE BY PAGE IN THE READER (the writer: "put arrows on desktop for pages in expanded view", then the pick "Keys for
// pages"): the next page's top, or back to this page's own top and then the one before; a page's top is its seam's head.
// In the viewport's own units, so no zoom enters into it. False where the document has no pages to turn
function wsReadStep(doc: Document | null, by: number): boolean {
	const win = doc && doc.defaultView;
	if (!doc || !win) return false;
	const heads = Array.from(doc.querySelectorAll<HTMLElement>('.sheet:not([data-pooled]) .seam-head'));
	if (!heads.length) return false;
	const tops = heads.map((h) => h.getBoundingClientRect().top);
	let cur = 0;
	for (let i = 0; i < tops.length; i++) if (tops[i] <= (win.innerHeight || 0) / 3) cur = i;
	const to = Math.max(0, Math.min(heads.length - 1, by < 0 && tops[cur] < -2 ? cur : cur + by));
	win.scrollTo(0, Math.max(0, tops[to] + (win.scrollY || 0)));
	return true;
}

// The reader's read-out: which file, which page (lifted out of exportPreviewInto, A488).
function wsPreviewReadSay(plugin: WordSmith, a: { docOf: () => Document | null; pageOf: WeakMap<HTMLElement, number> | null; pagesTotal: number; pool: HTMLElement[]; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; readFileSay: () => void; restoring: boolean; topNow: () => HTMLElement | null }) {
	const { docOf, pageOf, pagesTotal, pool, pv, readFileSay, restoring, topNow } = a;
	readFileSay();
	if (!pv.flow || !pv.readPage) return;
	try {
		// THE SHEET AS `metrics` FINDS IT: the pool is filled by the page
		// sync, and the read-out has a place to record before that.
		const doc0 = docOf();
		const sheet = pool[0] || (doc0 && (doc0.querySelector('.sheet:not([hidden])') || doc0.querySelector('.sheet')));
		const fl = sheet && sheet.querySelector('.flow');
		const doc = fl && fl.ownerDocument;
		const win = doc && doc.defaultView;
		if (!win) return;
		// WHERE YOU HAD READ TO, recorded on the same event that moves it —
		// written on every change rather than on close: a deploy orphans this
		// window.
		const top = topNow();
		if (!restoring) {
			try {
				if (plugin._wsSession) {
					plugin._wsSession.flowScroll = win.scrollY || 0;
					if (top) {
						const kids = fl.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
						plugin._wsSession.flowTop = { idx: Array.prototype.indexOf.call(kids, top), off: top.getBoundingClientRect().top };
					}
				}
			} catch (_) { wsCatch('exportPreviewInto / readSay: if (this._wsSession) this._wsSession.flowScroll = win.scrollY || 0;', _); }
		}
		let n = (top && pageOf && pageOf.has(top)) ? pageOf.get(top) : null;
		// …a paragraph's later part, cut where a page begins, by its first part's page (the writer: "when im in the middle of
		// last page the page numbers dissapear": the part at the top was one the map had never seen)
		if (n == null && top && pageOf) n = wsPageOfPart(top, pageOf);
		// NOTHING RATHER THAN A GUESS. A paragraph the map does not know
		// — one drawn after the map was taken — has no page, and saying a
		// wrong one is worse than saying none.
		// NUMBERS ONLY, as the paged view's `1 / ~259` (the writer: "just 6/766"; it read "p. 6 of 766")
		pv.readPage.setText(n == null || !pagesTotal ? '' : (n + 1) + ' / ' + pagesTotal);
	} catch (_) { wsCatch('exportPreviewInto / readSay: const sheet = pool[0];', _); }
}

// THE FLOW, SET: sheets or one long page (lifted out of exportPreviewInto, A488).
function wsPreviewFlowSet(plugin: WordSmith, a: { docOf: () => Document | null; flowApply: () => void; flowY0: number; pageMap: () => void; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; readSay: () => void; syncPages: () => void; topNow: () => HTMLElement | null; topTo: (el: HTMLElement | null) => void }, on: boolean) {
	const { docOf, flowApply, flowY0, pageMap, pv, readSay, syncPages, topNow, topTo } = a;
	const was = !!pv.flow;
	if (was === !!on) return;
	// TAKEN ON THE WAY IN, while the columns are still there to divide
	// by. Going the other way there is nothing to capture and nothing
	// that needs it — the pager answers for itself in pages.
	if (!was) pageMap();
	// TAKEN BEFORE THE FLIP, read after it: `topNow` answers in the
	// units of the side it is on, and `topTo` in the units of the side
	// it has arrived at.
	const keep = topNow();
	pv.flow = !!on;
	// SESSION STATE, written on the change rather than on close: a deploy
	// orphans this window and Obsidian can close it under us.
	try { if (plugin._wsSession) plugin._wsSession.flow = pv.flow; } catch (_) { wsCatch('exportPreviewInto / flowSet: if (this._wsSession) this._wsSession.flow = flow;', _); }
	flowApply();
	// ── ONE FRAME LATER, AND BOTH THINGS IN IT ──────────────────────
	//
	// The class was flipped a moment ago and the engine has not re-laid
	// the document out; measuring now reads the shape that is going away.
	// And the two have to be in the SAME frame, in this order: `syncPages`
	// run while the document is still one column sets the stack to the
	// FLOW-shaped height, and a `showPage` after it scrolls past the end
	// of that height and is CLAMPED — half a page short. So: settle,
	// restore the height, THEN scroll into it.
	const after = () => {
		if (!pv.flow) { try { syncPages(); } catch (_) { wsCatch('exportPreviewInto / after: syncPages();', _); } }
		// THE KEYS REACH THE FRAME ONLY IF IT HAS FOCUS: Expand hands it over,
		// so Space pages down at once rather than after a click on the paper.
		if (pv.flow) {
			try {
				const d = docOf();
				if (d && d.body) { d.body.setAttribute('tabindex', '-1'); d.body.focus(); }
			} catch (_) { wsCatch('exportPreviewInto / after: const d = docOf();', _); }
		}
		// THE TICKS ARE PLACED FROM THE FLOWED LAYOUT, so they cannot be
		// worked out until it exists — the same frame the scroll waits
		// for, and for the same reason. And the read-out is said once on
		// arrival: riding the scroll alone leaves it empty until the
		// reader happens to move.
		if (pv.flow) {
			// AND BACK WHERE YOU HAD READ TO — but only when this is a fresh
			// reader. `keep` is the paragraph the writer was looking at a moment
			// ago, and it beats a remembered offset from an earlier session every
			// time: one is where they ARE, the other is where they were.
			if (!keep) {
				try {
					// THE NUMBER TAKEN AT ENTRY, not the session's now — the new frame's
					// first scroll event has zeroed that.
					const y0 = flowY0;
					const d0 = docOf();
					const w0 = d0 && d0.defaultView;
					if (w0 && typeof y0 === 'number' && y0 > 0) {
						w0.scrollTo(0, y0);
						try { if (plugin._wsSession) plugin._wsSession.flowScroll = y0; } catch (_) { wsCatch('exportPreviewInto / after: this._wsSession.flowScroll = y0;', _); }
					}
				} catch (_) { wsCatch('exportPreviewInto / after: const y0 = flowY0;', _); }
			}
			try { readSay(); } catch (_) { wsCatch('exportPreviewInto / after: readSay();', _); }
		}
		// ── AND A SECOND FRAME BEFORE THE SCROLL ────────────────────
		//
		// COLLAPSING SETTLES IN TWO STEPS, not one. The class comes off and
		// the document goes back to columns; that removes the vertical
		// SCROLLBAR, which changes `clientWidth`, which is half of the `across`
		// the column arithmetic divides by — fifteen pixels of scrollbar on
		// the divisor turns 39.1 pages into 38. Expanding needs none of this —
		// it measures a RECT, which is not divided by anything. The second
		// frame is the price of the one direction that has to count columns.
		// (A settle loop that waited for `across` to answer the same twice was
		// tried here and taken back out: it fixed nothing measurable, and a
		// correction pass that does not correct is machinery somebody later
		// trusts.)
		const scroll = () => topTo(keep);
		if (!pv.flow && win0 && win0.requestAnimationFrame) {
			win0.requestAnimationFrame(scroll);
		} else { scroll(); }
	};
	let win0: Window | null = null;
	try { const d = docOf(); win0 = d && d.defaultView; } catch (_) { wsCatch('exportPreviewInto / flowSet: const d = docOf();', _); }
	if (win0 && win0.requestAnimationFrame) win0.requestAnimationFrame(after);
	else after();
}

// The page count and the flipper kept in step (lifted out of exportPreviewInto, A488).
function wsPreviewSyncPages(plugin: WordSmith, a: { fillPool: (m: WsPoolMetrics) => void; metrics: () => WsPoolMetrics | null; placeSheets: (m: WsPoolMetrics, from: number) => void; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; windowStart: (m: WsPoolMetrics, n: number) => number }) {
	const { fillPool, metrics, placeSheets, pv, windowStart } = a;
	if (pv.flow) return;
	const m = metrics();
	if (!m) return;
	// THE CONTENTS' PAGE NUMBERS (A751), read once off this document's own pages, before its sheets are copied
	try { wsTocPagesFill(m.doc); } catch (_) { wsCatch('syncPages: the contents\' pages', _); }
	fillPool(m);
	m.stack.style.height = (m.pages * m.down - m.gap) + 'px';
	const z = parseFloat(m.doc.documentElement.style.zoom) || 1;
	const y = (m.win.scrollY || 0) / (z || 1);
	// ROUNDED, so the page named is the one MOST on screen: halfway
	// between two, the number turns over, which is the moment a
	// reader would say they had reached the next one.
	const at = m.down > 0 ? Math.round(y / m.down) : 0;
	pv.pageAt = Math.max(0, Math.min(m.pages - 1, at));
	plugin._exportPage = pv.pageAt;
	// ONE EITHER SIDE, so the page above and below are already drawn —
	// and SHIFTED BACK at the end of the book rather than left half
	// empty, so the last screen is as fully drawn as any other and no
	// sheet is hidden merely for being near the end.
	placeSheets(m, windowStart(m, pv.pageAt));
	// `~` ON THE TOTAL, NOT ON THE PAGE YOU ARE ON. Which page is on
	// screen is exact — it is the sheet in front of them. How many there
	// are is this engine's answer for this paper and this type, and the
	// file may be laid out by another. One character, in the one place
	// that is actually uncertain.
	// WRITTEN TO THE TWO HALVES, never to the container: `setText` on the
	// parent would replace the estimate span — mark, title, focus and
	// all — with a text node on the first page turn.
	if (pv.pageNow) pv.pageNow.setText(String(pv.pageAt + 1));
	if (pv.pageEst) pv.pageEst.setText('~' + m.pages);
	// A DOOR THAT LEADS NOWHERE IS SHUT. At the ends of the book the
	// arrow that cannot move says so, rather than clicking and
	// leaving a reader wondering whether the preview is stuck.
	if (pv.prevBtn) pv.prevBtn.disabled = pv.pageAt <= 0;
	if (pv.nextBtn) pv.nextBtn.disabled = pv.pageAt >= m.pages - 1;
}

// The preview painted at the current zoom (lifted out of exportPreviewInto, A488).
function wsPreviewPaint(plugin: WordSmith, a: { apply: () => void; applyDark: () => void; armScroll: () => void; asText: boolean; docOf: () => Document | null; fileStep: (by: number) => boolean; fitZoom: () => number; flowApply: () => void; flowSet: (on: boolean) => void; footSoon: () => void; frame: HTMLIFrameElement; html: string; pv: { zoom: number; flowZoom: number; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; restoreArm: () => void; syncPages: () => void; topTo: (el: HTMLElement | null) => void }) {
	const { apply, applyDark, armScroll, asText, docOf, fileStep, fitZoom, flowApply, flowSet, footSoon, frame, html, pv, restoreArm, syncPages, topTo } = a;
	try {
		const doc = frame.contentDocument
			|| (frame.contentWindow && frame.contentWindow.document);
		if (!doc) return;
		// THE ROOT IS SWAPPED, NOT THE DOCUMENT WRITTEN. The page is parsed
		// apart and its root adopted in place of the frame's: one step, no
		// blank beat, and the document — with its listeners — stays what it
		// was. (`document.write` is deprecated, and the review refuses it.)
		const fresh = new (doc.defaultView || window).DOMParser().parseFromString(html, 'text/html');
		const root = doc.adoptNode(fresh.documentElement);
		if (doc.documentElement) doc.replaceChild(root, doc.documentElement); else doc.appendChild(root);
	} catch (_) { wsCatch('exportPreviewInto / paint: const doc = frame.contentDocument', _); }
	// After every paint, because the swap replaces the root the zoom
	// and the colour were set on.
	if (!pv.zoom) pv.zoom = asText ? 1 : (plugin._exportZoom || fitZoom());
	apply();
	applyDark();
	try { plugin.exportReaderClicks(docOf(), null, frame); } catch (_) { wsCatch('exportPreviewInto / paint: this.exportReaderClicks(docOf(), null, frame);', _); }
	try { plugin.exportAnchorClicks(docOf(), (el: HTMLElement) => topTo(el)); } catch (_) { wsCatch('exportPreviewInto / paint: this.exportAnchorClicks(docOf(), topTo)', _); }
	try { plugin.exportReaderKeys(docOf(), { collapse: () => flowSet(false), open: (p: string, sn: string | null) => plugin.openNoteAt(p, sn), step: (by: number) => fileStep(by), vim: () => !!(plugin.app.vault.getConfig && plugin.app.vault.getConfig('vimMode')) }); } catch (_) { wsCatch('exportPreviewInto / paint: this.exportReaderKeys(docOf(), collapse: () => flowSet(false), open: …', _); }
	// ── AND THE READER, RE-APPLIED ──────────────────────────
	//
	// `is-flow` LIVES ON THE DOCUMENT'S ROOT, and the swap replaces the
	// root: without this every recompile dropped an expanded pane back
	// into PAGE layout — inside a pane still sized for the reader, which
	// shows sheet one and sheet one alone.
	if (pv.flow) { try { flowApply(); } catch (_) { wsCatch('exportPreviewInto / paint: flowApply();', _); } }
	armScroll();
	try { restoreArm(); } catch (_) { wsCatch('exportPreviewInto / paint: restoreArm();', _); }
	// A COUNT NEEDS A LAYOUT. `doc.close()` above has parsed the
	// document but the engine has not necessarily flowed it, and
	// `scrollWidth` on an unflowed multicol is one page. `apply` asks
	// once for the common case; this asks again on the next frame, for
	// the manuscript long enough that it did not.
	try { window.requestAnimationFrame(() => syncPages()); } catch (_) { wsCatch('exportPreviewInto / paint: window.requestAnimationFrame(() => syncPages());', _); }
	// …and a Word file's notes to the foot of their page, once the paints settle (#72)
	footSoon();
}

// THE FLIPPER, first in the preview's foot: previous, the page, next, the
// zoom and the flow (lifted out of exportPreviewInto, A488).
function wsPreviewFlipper(plugin: WordSmith, a: { apply: () => void; applyDark: () => void; asText: boolean; docOf: () => Document | null; fitZoom: () => number; flowApply: () => void; flowSet: (on: boolean) => void; foot: HTMLDivElement; iconBtn: (into: HTMLElement, cls: string, names: string[], glyph: string, aria: string, fn: (ev: MouseEvent) => void) => HTMLButtonElement; jumpTo: (path: string) => boolean; o: WsExportRun; onRefresh: () => void; pv: { zoom: number; flowZoom: number; flowFit?: boolean; pct: HTMLElement | null; fitSay: (() => void) | null; dark: boolean; pageAt: number; pageNum: HTMLElement | null; prevBtn: { disabled: boolean; } | null; nextBtn: { disabled: boolean; } | null; pageNow: HTMLElement | null; pageEst: HTMLElement | null; flow: boolean; pageBox: HTMLElement | null; readPage: HTMLElement | null; flowSay: (() => void) | null; readFile: HTMLSelectElement | null; }; setZoom: (z: number, keep?: boolean) => void; showPage: (n: number) => void }) {
	const { apply, applyDark, asText, docOf, fitZoom, flowApply, flowSet, foot, iconBtn, jumpTo, o, onRefresh, pv, setZoom, showPage } = a;
	if (!asText) {
		// ── THE FLIPPER, FIRST IN THE ROW ────────────────────
		//
		// Reading the footer left to right is the order the controls are used
		// in, and which page you are on is the question a paginated preview
		// is answered by. The zoom follows it; the Export button ends the
		// looking. NOT `ws-export-pages`, WHICH IS TAKEN: that class means
		// "this control only applies to a format that has pages" and is swept
		// with `is-gone` by the format table.
		pv.pageBox = foot.createDiv({ cls: 'ws-export-flip' });
		pv.prevBtn = iconBtn(pv.pageBox, 'ws-export-prev', ['chevron-left'], '\u2039', wsT('Previous page'), () => showPage(pv.pageAt - 1));
		// TWO PARTS, BECAUSE ONLY ONE OF THEM IS UNCERTAIN. The page you are
		// on is a fact; the total is an estimate, and the `~` is attached to
		// that half alone. Splitting them is what lets the mark below sit on
		// the estimate rather than on the whole read-out.
		pv.pageNum = pv.pageBox.createSpan({ cls: 'ws-export-pagenum' });
		pv.pageNow = pv.pageNum.createSpan({ cls: 'ws-export-pagenow', text: '1' });
		pv.pageNum.createSpan({ cls: 'ws-export-pagesep', text: ' / ' });
		// ── A VISIBLE DOOR ON THE ESTIMATE ───────────────────
		//
		// A gesture is not a door. The `~` signals "estimate" to somebody who
		// already knows; nobody hovers a number they have no reason to
		// suspect. A dotted underline and a help cursor are the web's oldest
		// word for "there is more here", which beats inventing a second
		// vocabulary for one number.
		pv.pageEst = pv.pageNum.createSpan({ cls: 'ws-export-pageest', text: '~1' });
		pv.pageEst.setAttribute('tabindex', '0');
		pv.pageEst.setAttribute('role', 'note');
		// WHAT THE `~` MEANS, on the thing wearing it: a hover costs no room
		// and is where a reader who wonders about the tilde would put the
		// pointer. ONE CLAUSE: the count is approximate; how the preview
		// relates to the file is the mark's own business.
		pv.pageEst.title = (o.format === 'html' || o.format === 'pdf')
			? wsT('Roughly this many pages — the file breaks in near enough the same places.')
			: o.format === 'epub' ? wsT('Roughly this many pages — an e-reader sets its own.')
			: wsT('Roughly this many pages — Word will break the .docx its own way.');
		pv.nextBtn = iconBtn(pv.pageBox, 'ws-export-next', ['chevron-right'], '\u203a', wsT('Next page'), () => showPage(pv.pageAt + 1));
		const zoomBox = foot.createDiv({ cls: 'ws-export-zoom' });
		// ── THE BUTTONS READ THE ACTIVE ZOOM ─────────────────
		//
		// In the reader `zoom` is the page fit — a constant — so `+` computed
		// the same number from it every press and the text jumped once and
		// then never moved again. `setZoom` writes to the right number; it has
		// to be handed the right one to start from.
		const zoomNow = () => (pv.flow ? pv.flowZoom : pv.zoom);
		// ── ONE BUTTON AND ITS LIST (A628) ───────────────────
		//
		// The writer: "these buttons below needs to be simplified somehow (too
		// many buttons)", and of three ways, "do b, but add page next, before
		// buttons, and add the refresh button after expand". The zoom figure IS
		// the button; its list holds what were five controls: in and out (the
		// list stays open, so a step after a step is a press after a press),
		// the two sizes that matter as two rows, the one you are at lit, and
		// the dark page. FIT HAS NO PAGE TO FIT IN THE READER, so there it
		// means life size, the writer's own point size, which the reader opens at.
		const zb = zoomBox.createEl('button', { cls: 'ws-export-mini ws-export-zoombtn' });
		pv.pct = zb.createSpan({ cls: 'ws-export-zoompct', text: '100%' });
		wsIconInto(zb.createSpan({ cls: 'ws-export-pick-chev' }), ['chevron-down'], '\u25be');
		zb.title = wsT('The zoom and the page: press for the list');
		zb.setAttribute('aria-label', zb.title);
		const fitted = () => (pv.flow ? !!pv.flowFit : plugin._exportZoom == null);
		const printed = () => !fitted() && Math.abs(zoomNow() - 1) < 0.001;
		// LIGHT OR DARK, a property of the READING rather than of the document:
		// the sheet is white because paper is, right for proofing and a lamp in
		// the face for the hour before that spent reading. Print resets to ink on
		// paper regardless, so this cannot reach a file. Remembered on the
		// WINDOW's options, not on this compiled copy: a reader who wants a dark
		// page wants it next time too.
		const toggleDark = () => {
			pv.dark = !pv.dark;
			try {
				if (plugin.settings && plugin.settings.exportOpts) {
					plugin.settings.exportOpts.previewDark = pv.dark;
					void plugin.saveSettings();
				}
			} catch (_) { wsCatch('exportPreviewInto: if (this.settings && this.settings.exportOpts)', _); }
			applyDark();
		};
		const ico = (names: string[]) => () => { const el = createSpan(); wsIconInto(el, names, '\u2022'); return el; };
		zb.addEventListener('click', () => {
			plugin.openPickerLive(zb, [
				{ label: wsT('Zoom in'), icon: ico(['zoom-in']), on: () => true, onClick: () => setZoom(zoomNow() + 0.1) },
				{ label: wsT('Zoom out'), icon: ico(['zoom-out']), on: () => true, onClick: () => setZoom(zoomNow() - 0.1) },
				{ label: wsT('Fit to the window'), icon: ico(['shrink', 'minimize-2']), on: () => fitted(),
					onClick: () => {
						// (in the reader: back to the window's width, A804; the session forgets the chosen zoom)
						if (pv.flow) { pv.flowFit = true; try { if (plugin._wsSession) plugin._wsSession.flowZoom = 0; } catch { /* a session or none */ } apply(); return; }
						plugin._exportZoom = null; setZoom(fitZoom(), false);
					} },
				{ label: wsT('Printed size (100%)'), icon: ico(['square-dimensions', 'scan']), on: () => printed(), onClick: () => setZoom(1) },
				// THE ROW SAYS ITS ACT, as the button did: a moon to dim a white page, a sun to bring it back
				{ label: pv.dark ? wsT('Light page') : wsT('Dark page'), labelOf: () => (pv.dark ? wsT('Light page') : wsT('Dark page')),
					note: wsT('Dims the page for reading; a print is ink on paper still'),
					icon: ico(pv.dark ? ['sun'] : ['moon']), iconOf: () => ico(pv.dark ? ['sun'] : ['moon'])(),
					on: () => true, onClick: toggleDark },
			], 'toggle');
		});
		const viewBox = foot.createDiv({ cls: 'ws-export-view' });

		// ── EXPAND ─────────────────────────────────────────────────
		//
		// Not another window — the options column folds away and the preview
		// takes the tab. A second window is an orphan, and a hidden pane that
		// goes on recompiling is waste. LAST IN THE ROW, after Light, because
		// it is the only control here that changes the SHAPE of the pane
		// rather than what is drawn in it.
		//
		// IT DOES NOT RECOMPILE. The refresh is hung on delegated listeners
		// over the whole options container, and this button is inside the
		// preview foot — which `refreshPreview` returns early for. So the flip
		// is a class and nothing else.
		//
		// WHERE YOU ARE, IN THE ROW THAT SAYS IT: the paged read-out is three
		// controls to the left of here; this is its opposite number. Before
		// the Expand button, so the button that changes the mode stays at the
		// end of the row. THE FILE LIST: a drop-down of the compiled files in
		// their order, the one at the top ticked, following the scroll as the
		// page read-out does; picking one jumps there. Only in the reader.
		const rfile = viewBox.createEl('select', { cls: 'ws-export-readfile dropdown is-gone' });
		pv.readFile = rfile;
		rfile.title = wsT('Go to a file \u2014 {prev} and {next} step through them', { prev: '[', next: ']' });
		rfile.setAttribute('aria-label', wsT('Go to a file'));
		rfile.addEventListener('change', () => {
			try { jumpTo(rfile.value); } catch (_) { wsCatch('exportPreviewInto / readFile change: jumpTo(readFile.value);', _); }
		});
		// PAGE BY PAGE IN THE READER TOO, on a desktop (`wsReadStep`, the keys' step as well)
		const readStep = (by: number) => { if (pv.flow) wsReadStep(docOf(), by); };
		// …AND FROM THE TOOLBAR, where a click on an arrow leaves the focus (the writer's pick "Keys for pages"): Left and
		// Right, Page Up and Page Down turn pages there too, Escape collapses; the file list keeps its own keys
		viewBox.addEventListener('keydown', (ev: KeyboardEvent) => {
			if (!pv.flow || ev.ctrlKey || ev.metaKey || ev.altKey) return;
			if (ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLInputElement) return;
			const by = ev.key === 'ArrowRight' || ev.key === 'PageDown' ? 1 : ev.key === 'ArrowLeft' || ev.key === 'PageUp' ? -1 : 0;
			if (by) { ev.preventDefault(); readStep(by); return; }
			if (ev.key === 'Escape') { ev.preventDefault(); flowSet(false); }
		});
		if (!Platform.isMobile) iconBtn(viewBox, 'ws-export-readstep is-prev is-gone', ['chevron-left'], '\u2039', wsT('Previous page'), () => readStep(-1));
		pv.readPage = viewBox.createSpan({ cls: 'ws-export-readpage is-gone' });
		if (!Platform.isMobile) iconBtn(viewBox, 'ws-export-readstep is-next is-gone', ['chevron-right'], '\u203a', wsT('Next page'), () => readStep(1));
		const xb = viewBox.createEl('button',
			{ cls: 'ws-export-mini ws-export-expand' });
		const expandIcon = xb.createSpan({ cls: 'ws-export-ico-in' });
		const expandWord = xb.createSpan({ cls: 'ws-export-word' });
		const sayFlow = () => {
			wsIconInto(expandIcon, pv.flow ? ['book-open'] : ['scroll-text', 'align-justify'], '');
			// PAIRED WITH ITS OWN OTHER HALF: "Pages" named the DESTINATION while
			// "Expand" named the ACTION, so one control said two different kinds
			// of thing depending on which way round it was. Both are actions now.
			expandWord.setText(pv.flow ? wsT('Collapse') : wsT('Expand'));
			xb.title = pv.flow
				? wsT('Back to the page preview')
				: wsT('Read the whole thing as one text');
			xb.setAttribute('aria-label', xb.title);
			// A TOGGLE SAYS WHICH WAY IT IS, to anything that cannot see it.
			xb.setAttribute('aria-pressed', pv.flow ? 'true' : 'false');
			xb.toggleClass('is-on', pv.flow);
		};
		xb.addEventListener('click', () => flowSet(!pv.flow));
		sayFlow();
		pv.flowSay = sayFlow;
		// ── REFRESH. The preview follows every change made IN THE PANE (a
		// tick, an option) 220ms behind; a change made in the NOTE reaches it
		// only on the next of those. This is the door for that: it runs the
		// same recompile, through the same `refreshPreview`, which the foot's
		// own clicks are otherwise excused from. Beside Expand, in both views
		// — a stale page is stale whichever way it is read.
		if (typeof onRefresh === 'function') {
			// ITS WORD BESIDE ITS GLYPH, as Expand has: the two acts in the row
			// are read, the adjustments beside them are glyphs.
			const rf = viewBox.createEl('button', { cls: 'ws-export-mini ws-export-refresh' });
			wsGlyphWord(rf, ['refresh-cw'], wsT('Refresh'));
			rf.title = wsT('Compile again, with what the notes say now');
			rf.setAttribute('aria-label', rf.title);
			rf.addEventListener('click', (ev: MouseEvent) => {
				ev.preventDefault();
				ev.stopPropagation();
				rf.disabled = true;
				try { onRefresh(); } finally { window.setTimeout(() => { rf.disabled = false; }, 400); }
			});
		}
		// AND IF THE SESSION SAYS EXPANDED, IT OPENS EXPANDED. The class
		// goes on after the foot exists, because `flowApply` speaks to the
		// button as well as to the document.
		if (pv.flow) flowApply();
		apply();   // the read-outs exist now, so they can be told
	}
}

// THE FONT FINDER: a box that searches the machine's fonts as you type (lifted out of buildExportOptions, A669).
function wsExportFontOpt(plugin: WordSmith, a: { o: WsExportOpts }, parent: HTMLElement, key: WsExportStringKey, label: string, inRow: boolean) {
	const { o } = a;
	const row = parent.createDiv({ cls: 'ws-export-opt ws-export-textrow ws-export-fontrow'
		+ (inRow ? ' is-inrow' : '') });
	row.createSpan({ cls: 'ws-export-optname', text: label });
	const pick = row.createDiv({ cls: 'ws-export-fontpick' });
	const inp = pick.createEl('input', { cls: 'ws-export-text ws-export-fontinput' });
	inp.type = 'text';
	inp.value = o[key] || '';
	inp.placeholder = 'Times New Roman';
	// A font name is not prose: a red underline under "Alegreya" is
	// the editor calling a correct answer a mistake.
	inp.setAttribute('spellcheck', 'false');
	// ── THE CAVEAT IS NOT PART OF THE ANCHOR ────────────────────
	//
	// Inside the trio `pick` is 151px wide, so six lines of prose in it
	// would make the box 126px tall — centring the LABEL halfway down its
	// own row and dropping the results list, which is `top: 100%` of this
	// box, a hundred pixels below the field it belongs to. SO IT GOES
	// OUTSIDE, on its own full-width line under the trio. `pick` is the
	// FIELD and nothing else, which is what an anchor has to be.
	const noteHost = (inRow && parent.parentElement)
		? parent.parentElement : pick;
	const note = noteHost.createDiv({
		cls: 'ws-export-fontnote' + (inRow ? ' is-wide' : '') });
	const hits = pick.createDiv({ cls: 'ws-export-hits ws-export-fonthits' });
	let rows: HTMLElement[] = [], found: string[] = [], sel = -1;
	const face = (n: string) => '"' + String(n).replace(/["\\]/g, '') + '"';
	const wear = () => {
		const n = String(inp.value || '').trim();
		inp.style.fontFamily = n ? face(n) : '';
	};
	const sayNote = () => {
		const n = String(inp.value || '').trim();
		note.setText(plugin.fontIsInstalled(n) ? ''
			: wsT('Not found on this machine \u2014 it goes into the file as written, and whatever opens it will substitute.'));
	};
	// THE CAVEAT STANDS DOWN WHILE THE LIST IS UP. They sit on the
	// same strip of screen now that the note has the full column
	// width, and an open list covered the middle of its own warning.
	// It is a statement about what has been TYPED, so it has nothing
	// to say while a list of real families is open and the answer is
	// still being chosen.
	const noteShow = () => note.toggleClass('is-under',
		hits.childElementCount > 0);
	// ── WHERE THE LIST GOES, IN SCREEN COORDINATES ──────────────
	//
	// It is `position: fixed`, so it escapes `.ws-export-right`'s scroll
	// clip — and so it has no layout parent to take its place from. Written
	// from the field's own rect, every time anything could have moved. AND
	// IT IS CLAMPED TO THE ROOM THERE ACTUALLY IS, then flipped above the
	// field when there is more room up than down.
	const placeHits = () => {
		if (!hits.childElementCount) return;
		const r = inp.getBoundingClientRect();
		// CLAMPED TO THE WINDOW IT BELONGS TO, not to the screen: `position:
		// fixed` escapes every ancestor's overflow — which is the whole point
		// of it here — and that includes the modal's own edge. A FLOOR AND A
		// CEILING ARE Y COORDINATES; A CAP IS A HEIGHT — `42vh` taken off a
		// coordinate looks right only while the window starts near the top of
		// the screen. THE FIELD'S OWN WINDOW, not the app's: in a popout
		// `window` is still the main one, so the list would be sized against
		// a screen the writer is not looking at
		const host2 = inp.closest('.ws-uni-modal, .workspace-leaf-content');
		const hb = host2 ? host2.getBoundingClientRect() : null;
		// .
		const fwin = (inp.ownerDocument && inp.ownerDocument.defaultView)
			|| window;
		const winH = fwin.innerHeight || 800;
		const floorY = Math.min(winH, hb ? hb.bottom : Infinity);
		const ceilY = hb ? hb.top : 0;
		const below = floorY - r.bottom - 8;
		const above = r.top - ceilY - 8;
		const up = below < 160 && above > below;
		const cap = winH * 0.42;
		const room = Math.max(96, Math.min(up ? above : below, cap));
		// AND IT STAYS ON THE SCREEN: on a phone the font field sits at the
		// right edge, so width is capped to the window and the left is pulled
		// back until the box fits, in that order.
		const winW = fwin.innerWidth || 0;
		let boxW = Math.max(r.width, 220);
		if (winW > 8) boxW = Math.min(boxW, winW - 8);
		let boxL = Math.round(r.left);
		if (winW > 0) boxL = Math.max(4, Math.min(boxL, winW - boxW - 4));
		hits.style.width = boxW + 'px';
		hits.style.left = boxL + 'px';
		hits.style.maxHeight = Math.round(room) + 'px';
		if (up) {
			hits.style.removeProperty('top');
			hits.style.bottom = Math.round(winH - r.top + 2) + 'px';
		} else {
			hits.style.removeProperty('bottom');
			hits.style.top = Math.round(r.bottom + 2) + 'px';
		}
	};
	// A FIXED BOX DOES NOT TRAVEL WITH ITS FIELD. Scrolling the
	// options column moves the input and leaves the list behind, so
	// the list is re-placed on any scroll anywhere (capture, because
	// the scroll happens on an ancestor) and on any resize, while it
	// is open (`listen` below).
	// ON THE FIELD'S OWN WINDOW, for the reason `placeHits` gives: a
	// popout scrolls and resizes in its own window, and listeners on
	// the main one would never hear it - the list would sit where it
	// was first put while its field moved out from under it.
	const iwin = (inp.ownerDocument && inp.ownerDocument.defaultView)
		|| window;
	// ONLY WHILE THE LIST IS OPEN. This row is built again on every
	// redraw of the options and every visit to the tab, and a pair of
	// listeners added per build and never taken off piled up on the
	// window (two more each time, each holding a row that was gone).
	let listening = false;
	const listen = (on: boolean) => {
		if (on === listening) return;
		listening = on;
		if (on) {
			iwin.addEventListener('scroll', onMove, true);
			iwin.addEventListener('resize', onMove);
		} else {
			iwin.removeEventListener('scroll', onMove, true);
			iwin.removeEventListener('resize', onMove);
		}
	};
	const onMove = () => { if (inp.isConnected) placeHits(); else listen(false); };
	const close = () => {
		hits.textContent = ''; rows = []; found = []; sel = -1;
		listen(false);
		noteShow();
	};
	const mark = () => rows.forEach((r, i) => r.classList.toggle('is-selected', i === sel));
	const take = (name: string) => {
		o[key] = name; inp.value = name;
		void plugin.saveSettings(); wear(); sayNote(); close();
	};
	const paint = () => {
		hits.textContent = ''; rows = []; sel = -1;
		found = plugin.fontFinderMatches(inp.value, 40);
		for (const name of found) {
			const r  = hits.createDiv({ cls: 'ws-export-hit ws-export-fonthit' });
			const nm = r.createSpan({ cls: 'ws-export-fontname', text: name });
			nm.style.fontFamily = face(name);
			if (name === String(o[key] || '')) {
				r.createSpan({ cls: 'ws-export-fonttag', text: wsT('in use') });
			}
			const i = rows.length;
			r.addEventListener('mouseenter', () => { sel = i; mark(); });
			// mousedown, not click: the box blurs first, blur closes
			// the list, and a click landing on a row that has already
			// gone is a click that does nothing.
			r.addEventListener('mousedown', (ev: Event) => { ev.preventDefault(); take(name); });
			rows.push(r);
		}
		if (!found.length) hits.createDiv({ cls: 'ws-export-nohit', text: wsT('No font by that name.') });
		noteShow();
		listen(true);
		placeHits();
	};
	// The real list arrives asynchronously; the box opens on whatever
	// is known and repaints when it lands.
	const wake = () => {
		paint();
		void (async () => { await plugin.ensureSystemFonts(); if (rows.length) paint(); sayNote(); })();
	};
	inp.addEventListener('focus', wake);
	inp.addEventListener('input', () => { wear(); sayNote(); paint(); });
	// Saved on change, like every other box here: a keystroke is not
	// a decision, and blurring or pressing Enter is.
	inp.addEventListener('change', () => {
		o[key] = String(inp.value || '').trim();
		void plugin.saveSettings(); wear(); sayNote();
	});
	inp.addEventListener('keydown', (ev: KeyboardEvent) => {
		if (ev.key === 'Escape') { close(); return; }
		if (!found.length) return;
		if (ev.key === 'ArrowDown') { sel = (sel + 1) % found.length; mark(); ev.preventDefault(); }
		else if (ev.key === 'ArrowUp') { sel = (sel - 1 + found.length) % found.length; mark(); ev.preventDefault(); }
		else if (ev.key === 'Enter') {
			// Enter takes the row ON SCREEN, and only if one is
			// picked out: Enter on a name typed in full must keep
			// that name rather than swap it for the nearest match.
			if (sel >= 0) { take(found[sel]); ev.preventDefault(); }
			else close();
		}
	});
	// A moment, because a click on a row is a blur first.
	inp.addEventListener('blur', () => { window.setTimeout(close, 120); });
	wear(); sayNote();
	return inp;
}

// FRONT MATTER AND STRUCTURE: the title page, the running header, the contents; how files and folders meet (lifted out of buildExportOptions, A669).
function wsExportOptsStructure(plugin: WordSmith, a: { o: WsExportOpts; optGroup: (label: string) => HTMLDivElement; pickList: (grp: HTMLElement, cls: string, rows: () => WsPickRow[], none: string, what: (list: string | null) => string, after?: () => void) => HTMLButtonElement; redrawOpts: () => void; selOpt: (parent: HTMLElement, key: "pt" | WsExportStringKey, label: string, items: { id: string | number; label: string; hint?: string | undefined; }[], after: () => void, inRow: boolean, whenMissing?: string) => HTMLSelectElement; textOpt: (parent: HTMLElement, key: WsExportStringKey, label: string, ph: string, hint?: string, inRow?: boolean) => HTMLInputElement; toggle: (parent: HTMLElement, key: WsExportBoolKey, label: string, hint: string) => HTMLLabelElement }) {
	const { o, optGroup, pickList, redrawOpts, selOpt, textOpt } = a;
	{
		// The title page, the running header, the contents page, and how the
		// word count on the title page reads. Publishing's own word for the
		// pages before the text, which is what three of the four are; the
		// rounding belongs here because the number it rounds is printed on
		// the title page and nowhere else.
		const grp = optGroup(wsT('Front matter'));
		// ONE BUTTON AND ITS LIST since A625, the three switches its rows.
		// "Contents page" named the paper it lands on; "Table of contents" is
		// what the thing is called, in Word's own menus and in every book.
		const FRONT: WsPickRow[] = [
			['titlePage', wsT('Title page'), wsT('A page of its own at the front with the title, your name and the word count \u2014 what a submission opens with.'), ['file-type', 'file-text']],
			// A LINE PRINTED AT THE TOP OF A PAGE: a row only where there are pages
			// (the title page and the contents Markdown really does produce)
			['runningHeaderOn', wsT('Running header'), wsT('Your surname, the title and the page number along the top of every page, so a printed manuscript can be put back in order.'), ['panel-top', 'arrow-up-to-line']],
			['toc', wsT('Table of contents'), wsT('A list of the files at the front, each one a link that jumps to it.'),
				['table-of-contents', 'list-ordered']],
			// (TOMBSTONE: A751's Contents page numbers; the writer: "table of contents always have page numbers, so remove that
			// extra page numbers option for toc". `exportOpts.tocPages` is deleted on load)
		];
		pickList(grp, 'ws-export-front', () => FRONT.filter(([k]) => (k !== 'runningHeaderOn' || wsFormatHasPages(o.format || 'docx'))),
			wsT('No front matter'), (list) => (list ? wsT('Before the text: {list}. Press for the list.', { list }) : wsT('Before the text: nothing. Press for the list.')));
		// (TOMBSTONE: A751's Header text, Page numbers and Contents title rows (moved to Settings › Export on the writer's word, "Six plus paragraph look": they are decided once)
		// ONE QUESTION, THREE ANSWERS: how does one file join the next? As two
		// booleans it allowed both at once — a page break AND a divider —
		// which no manuscript wants. TWO ROWS THAT READ AS SENTENCES: the
		// LABEL is a subject and the ANSWER is its predicate — "Each file —
		// starts a new page", "Its heading — the file's name" — so both labels
		// fit the column and both rows read left to right in one go.
		//
		// THE TWO OF THEM ON ONE ROW: they are one question asked twice — what
		// separates one file from the next, and what is printed at the top of
		// it — and `.ws-export-pair` is the trio's shape with two columns. THE
		// LAST ARGUMENT IS LOAD-BEARING: without `true` each row spans its
		// container, so the pair would be two stacked rows inside a new box.
		//
		// A GROUP OF THEIR OWN: these three decide the SHAPE of the book
		// itself — where one file ends, what is printed at the top of the
		// next, and whether a folder announces itself — where Front matter is
		// what is printed BEFORE the book.
		const structGrp = optGroup(wsT('Structure'));
		// BY MEANING (A844, the writer: "think on better organization for the buttons and more clear"): what heads each
		// part and how it is numbered side by side, each with its name, Numbers beside the headings it numbers; how one file
		// meets the next on the line under, in the same two columns. MARKED, because a narrow column gives its long answers
		// the whole line before it does any other group's.
		structGrp.addClass('is-structure');
		const pair = structGrp.createDiv({ cls: 'ws-export-pair' });
		// (the list wears a row's name like a drop-down: "Headings" was a button with no label)
		const hrow = pair.createDiv({ cls: 'ws-export-opt ws-export-textrow is-inrow ws-export-headsrow' });
		hrow.createSpan({ cls: 'ws-export-optname', text: wsT('Headings') });
		// HEADINGS, ONE LIST (the writer: "also add an option to add the folder names as heading too", the pick "One list"): the
		// folders, the files' names, the notes' own headings, any of them together (TOMBSTONE: Insert heading's four answers and
		// the Folder names as headings switch). With File names and Note headings both, the note's headings sit under the name
		// and a first one of the same name goes; with Folders, everything moves down a level a folder
		const HEADS: WsPickRow[] = [
			['folderHeadings', wsT('Folders'), wsT('A folder becomes a heading where it begins, one level a folder, the book\u2019s own folder aside.'), ['folder-tree', 'folder']],
			['sectionTitles', wsT('File names'), wsT('Each file opens with its own name as a heading.'), ['file-text', 'file']],
			['keepHeadings', wsT('Note headings'), wsT('The note\u2019s own # headings, as written; under the file\u2019s name when that is on.'), ['heading', 'hash']],
		];
		pickList(hrow, 'ws-export-heads', () => HEADS, wsT('No headings'),
			(list) => (list ? wsT('Headings: {list}. Press for the list.') : wsT('Headings: none. Press for the list.')));
		// NUMBERS, THE PAIR'S SECOND HALF (#79; the writer: "drop the suffix thing - add some options to display them (popular
		// ones)", the picks "1.1.2, 1.1.2., I. A. 1., Chapter 1"): each answer what it prints, from the file tree
		selOpt(pair, 'numberStyle', wsT('Numbers'), [
			{ id: 'none', label: wsT('None'), hint: wsT('No numbers before the headings.') },
			{ id: 'decimal', label: '1.1.2', hint: wsT('Each folder and file by its place in your folders: 1, 1.1, 1.1.2.') },
			{ id: 'decimalDot', label: '1.1.2.', hint: wsT('The same, each with a closing point: 1., 1.1., 1.1.2.') },
			{ id: 'outline', label: wsT('I. A. 1.'), hint: wsT('An outline: a Roman numeral, then a capital letter, then a number, one a level.') },
			{ id: 'chapter', label: wsT('Chapter 1'), hint: wsT('Files Chapter 1, 2, 3 through the book; folders at the top Part I, II.') }
		], () => { void plugin.saveSettings(); redrawOpts(); }, true, 'none');
		const joins = structGrp.createDiv({ cls: 'ws-export-pair' });
		// ── AND A PAGELESS FORMAT IS NOT OFFERED A PAGE ─────────────
		//
		// `exportToMarkdown` reads `starBetween` and never `pageBreaks`, so
		// for .md "starts a new page" does LITERALLY NOTHING while the other
		// two both work. THE STORED VALUE IS LEFT ALONE and `run` is shown
		// instead, which is also what .md actually does with `page`. Flick to
		// Markdown and back and the Word setting is exactly where it was.
		// …BUT AN E-BOOK HAS ITS PAGE (A866, Fable's review: it showed Runs straight on while the book still began a file a
		// chapter): `wsBuildEpub` opens a file for every section that opens a page, and the reader begins each file on a new
		// page, so it is offered the page and says what its book does
		selOpt(joins, 'joinMode', wsT('Each file'), [
			{ id: 'page',    label: wsT('Starts a new page'),
				hint: wsT('Every file begins at the top of a fresh page \u2014 how a book starts a chapter, and what a submission expects.') },
			{ id: 'divider', label: wsT('Follows a divider'),
				hint: wsT('Files run on down the same page, with the mark below centered between them \u2014 a scene break.') },
			{ id: 'run',     label: wsT('Runs straight on'),
				hint: wsT('Nothing between one file and the next: the prose reads as though it were all one note.') }
		].filter((c) => c.id !== 'page' || wsFormatHasPages(o.format || '') || o.format === 'epub'), () => {
			o.pageBreaks = o.joinMode === 'page';
			o.starBetween = o.joinMode === 'divider';
			void plugin.saveSettings();
			redrawOpts();
		}, true, 'run');
		// THE MARK, DIRECTLY UNDER THE ANSWER THAT ASKS FOR IT. It was
		// written last in this group, so it appeared beneath the
		// HEADING row and its caption \u2014 a box called "Divider" sitting
		// under a sentence about chapter headings, which reads as a
		// setting for the wrong thing entirely. A control that exists
		// only because of another control has to sit against it.
		//
		// It still only exists when there IS a divider to name: a field
		// for a mark that is switched off is a control that does
		// nothing, sitting where a writer reads it as one that does.
		if (o.starBetween) {
			// INTO STRUCTURE WITH THE ROW IT ANSWERS, and AFTER "Each file": a
			// mark box first was read as a setting for the heading above it.
			textOpt(structGrp, 'divider', wsT('Its mark'), '#',
				wsT('Centered on its own line between one file and the next.'));
		}
		// (TOMBSTONE: Center headings, #76, and "--- starts a new page", A502 (moved to Settings › Export on the writer's word, "Six plus paragraph look": they are decided once)
	}
}

// TYPESETTING: paper, font, size, spacing (lifted out of buildExportOptions, A669; the paragraphs' switches in Settings › Export since the writer's "Six plus paragraph look").
function wsExportOptsTypesetting(plugin: WordSmith, a: { fontOpt: (parent: HTMLElement, key: WsExportStringKey, label: string, inRow: boolean) => HTMLInputElement; o: WsExportOpts; optGroup: (label: string) => HTMLDivElement; selOpt: (parent: HTMLElement, key: "pt" | WsExportStringKey, label: string, items: { id: string | number; label: string; hint?: string | undefined; }[], after: () => void, inRow: boolean, whenMissing?: string) => HTMLSelectElement; toggle: (parent: HTMLElement, key: WsExportBoolKey, label: string, hint: string) => HTMLLabelElement }) {
	const { fontOpt, o, optGroup, selOpt, toggle } = a;
	{
		const grp = optGroup(wsT('Typesetting'));
		// BOTH HALVES OF THE SECTION. `optGroup` makes an eyebrow and then
		// the options box, and returns only the box — so the heading is
		// the element immediately before it. Hiding one and not the other
		// leaves a title over nothing, which reads as a section that
		// failed to draw rather than one that does not apply.
		//
		// CHECKED BY CLASS, not taken on faith: if the shape of `optGroup`
		// ever changes, this marks the box alone rather than hiding
		// whatever happens to sit above it.
		//
		// A CLASS RATHER THAN A VARIABLE, because `paintFmt` — which does
		// the hiding — is in another method entirely, and a name assigned
		// across that boundary is a global, not a shared reference.
		grp.addClass('ws-export-pages');
		{
			const eb = grp.previousElementSibling;
			if (eb && eb.classList.contains('ws-export-eyebrow')) {
				eb.addClass('ws-export-pages');
			}
		}
		// PAPER FIRST, then the face it is set in. NINE SIZES, from one table
		// (WS_PAPERS), because "A4 or not" only answers the submission
		// question: a writer setting a proof of their own novel is working to
		// a TRIM SIZE — 6 x 9, digest, mass market — and those are pages in
		// their own right, not variants of Letter. The margin travels with the
		// paper: an inch on a 5.5-inch page is a third of the sheet.
		//
		// A SEARCH BOX OVER THE MACHINE'S OWN FAMILIES for the font, the way
		// Obsidian's font setting does it (see WS_SAFE_FONTS). Plain
		// substring, not fuzzy: a font list is a thing you READ, and fuzzy
		// matching puts "Times New Roman" three rows below something that
		// merely contains a t, an i and an m. THE PAPER, THE FACE, THE SIZE
		// AND THE SPACING ARE ONE QUESTION, so they are one row; the class
		// still says trio, because it is the ROW SHAPE beside
		// `.ws-export-pair`, the same shape for two.
		const trio = grp.createDiv({ cls: 'ws-export-trio' });
		// PAPER FIRST, and creation order is DOM order — the sheet is
		// chosen before the face that is set on it, the size of that face,
		// and the space between its lines. Reading the row left to right
		// is reading the decisions in the order they are made.
		selOpt(trio, 'paperId', wsT('Paper'),
			WS_PAPERS.map(p => ({ id: p.id, label: wsPaperLine(p) })),
			() => { o.a4 = o.paperId === 'a4'; void plugin.saveSettings(); }, true);
		fontOpt(trio, 'font', wsT('Font'), true);
		// SIZE, which was pinned at 12pt. That is the manuscript
		// convention and it is still the default \u2014 but the paper is
		// nine sizes now, and 12pt double spaced on a 6 \u00d7 9 page is
		// about a hundred and ninety words to the page, which is a
		// proof nobody would set on purpose.
		// THE UNIT ROUTED, the figure as it is (A695)
		const ptLine = (size: number) => wsT('{size} pt', { size });
		selOpt(trio, 'pt', wsT('Size'), [
			{ id: '10', label: ptLine(10) },
			{ id: '11', label: ptLine(11) },
			// THE CAPTION IS A HINT, NOT PART OF THE LABEL: spelled out in the
			// closed box it made this the widest of the five by more than double,
			// and it sets the width of a control that shares its line with three
			// others. `selOpt` puts an item's hint on the row as a title when that
			// item is the chosen one.
			{ id: '12', label: ptLine(12), hint: wsT('The manuscript standard.') },
			{ id: '13', label: ptLine(13) },
			{ id: '14', label: ptLine(14) },
			// PAST 14, A READING COPY: 16 and 18 are large print, 20 and 24 for
			// tired eyes or a tablet held at arm's length. Steps, not a number box.
			{ id: '16', label: ptLine(16) },
			{ id: '18', label: ptLine(18) },
			{ id: '20', label: ptLine(20) },
			{ id: '24', label: ptLine(24) }
		], () => { o.pt = parseInt(String(o.pt), 10) || 12; void plugin.saveSettings(); }, true);
		// THREE ANSWERS, where a boolean could only give two. Double is
		// what a submission expects and stays the default; single is
		// closer to a finished book; one and a half is what a reader
		// who is not an editor actually prefers, and it was the answer
		// the switch could not give.
		// NO CAPTIONS on this one. The other two drop-downs describe a
		// LAYOUT — what lands on the page, which cannot be guessed from
		// three words — and single, one and a half and double are three
		// words everyone already knows. A line of explanation under a
		// self-evident answer teaches a reader to stop reading the
		// lines under the ones that are not.
		selOpt(trio, 'lineSpacing', wsT('Spacing'), [
			{ id: 'single',  label: wsT('Single') },
			{ id: 'onehalf', label: wsT('One and a half') },
			{ id: 'double',  label: wsT('spacing::Double') }
		], () => {
			// The boolean the builders and older vaults still read is
			// written from the answer, in one place, on every change.
			o.doubleSpaced = o.lineSpacing !== 'single';
			void plugin.saveSettings();
		}, true);
		// (TOMBSTONE: Indent paragraphs, Paragraph spacing, A756, and Keep line breaks, #77 (moved to Settings › Export on the writer's word, "Six plus paragraph look": they are decided once)
		// JUSTIFY, BESIDE THE TYPE (#77, davidepicatto: contests ask for a font, a size and justified text; the writer's pick,
		// a tick here after Spacing): straight edges in Word, the PDF, the web page, the e-book and the preview
		toggle(grp, 'justify', wsT('Justify text'), wsT('Straight edges on both sides.'));
	}
}

// WHAT A FORMAT HIDES: every row that needs pages (`ws-export-pages`). Run by the format's change AND after every
// redraw of the options, which builds them afresh: found with #76, a press on any switch under Markdown brought
// Typesetting and the paper back. (`ws-export-styled` went with Center headings to Settings › Export.)
function wsExportSweep(scope: ParentNode, format: string) {
	for (const el of Array.from(scope.querySelectorAll<HTMLElement>('.ws-export-pages'))) el.toggleClass('is-gone', !wsFormatHasPages(format));
}

// ALSO INCLUDE: properties, comments, callouts, tags, highlights, footnotes (lifted out of buildExportOptions, A669).
function wsExportOptsAlso(a: { optGroup: (label: string) => HTMLDivElement; pickList: (grp: HTMLElement, cls: string, rows: () => WsPickRow[], none: string, what: (list: string | null) => string) => HTMLButtonElement }) {
	const { optGroup, pickList } = a;
	{
		// Named "Also include", and on the pane rather than behind a button
		// reading "0 of 5": a count is not a control — it is a promise that
		// there is one somewhere else. THE HINTS are each switch's own title,
		// which is where every other switch on this pane keeps its explanation.
		const grp = optGroup(wsT('Also include'));
		// Marked so a wide column lays these six three or four across.
		grp.addClass('is-also');
		const ALSO: [WsExportBoolKey, string, string][] = [
			['keepFrontmatter', wsT('Properties'),
				wsT('The --- block at the top of a note: status, tags, dates. Printed verbatim in monospace, because it is data rather than prose.')],
			['keepComments', wsT('Comments'),
				wsT('Your %% notes to self %%, kept where they sit and set apart from the prose so a query to yourself cannot be read as a sentence.')],
			['keepCallouts', wsT('Callouts'),
				wsT('Your > [!note] boxes, printed as a quote under their title. Off by default, because a callout is usually a note to self.')],
			// ON, like Footnotes: tags always printed. Off keeps them in the note only.
			['keepTags', wsT('Tags'),
				wsT('Your #tags in the text. Off takes them out of the manuscript; your notes keep them.')],
			// HIGHLIGHTS is a bug fix wearing an option's clothes:
			// `==marked==` text matched nothing in the converter, so it
			// travelled into the manuscript as literal equals signs. The
			// marks are consumed either way now; this decides whether the
			// highlight survives, and off is the default because a
			// highlight is usually a note to self about the prose.
			['highlights', wsT('Highlights'),
				wsT('Your ==marked== passages come through highlighted, the same yellow Word\u2019s own pen writes. Off keeps the words and drops the marks.')],
			// THE ONE HERE THAT IS ON. Footnotes were unconditional, so
			// absent has to mean on — which breaks this group's "off until
			// you ask" promise. It sits here anyway: what happens to the
			// notes in a file is the same question as what happens to its
			// properties and its comments. Off drops the markers too,
			// because a `[^3]` pointing at a note that is no longer in the
			// document is worse than either having them or not.
			['footnotes', wsT('Footnotes'),
				wsT('Your [^1] notes: in Word at the foot of each page or at the end (Settings, Export), in a PDF and a web page at the end. Off removes both.')]
		];
		// ── ONE BUTTON AND ITS LIST, AN ICON FOR EACH (A617; pickList above) ──
		const ICON: Record<string, string[]> = {
			keepFrontmatter: ['info', 'list'], keepComments: ['message-square', 'message-circle'],
			keepCallouts: ['quote', 'message-square-quote'], keepTags: ['tag', 'hash'],
			highlights: ['highlighter', 'pen-line'], footnotes: ['superscript', 'list-ordered'],
		};
		pickList(grp, 'ws-export-also', () => ALSO.map(([key, lab, hint]): WsPickRow => [key, lab, hint, ICON[key] || ['circle']]),
			wsT('Nothing else'), (list) => (list ? wsT('What else comes along: {list}. Press for the list.', { list }) : wsT('What else comes along: nothing. Press for the list.')));
	}
}

// HOW LONG THE PRINT WAITS FOR A PICTURE THAT NEVER LOADS (#84): then it prints what it has, rather than wait for ever
const WS_PDF_PICTURE_WAIT_MS = 5000;

export const exportMethods = {

	// ── Export ──────────────────────────────────────────────────────────────

	// Everything in scope, in the order it will be compiled. A folder is
	// walked depth-first so the structure a writer built is the structure
	// they get; a single note is a one-item list.
	//
	// NATURAL sort, not alphabetical, and this is not a nicety: plain
	// sorting puts "Ch 10" before "Ch 2", which silently reorders a novel.
	// It is the first thing that would be reported and the last thing
	// anyone would suspect, because the file list LOOKS right in the
	// explorer, which sorts the same wrong way.
	// Every folder and markdown note in the vault, fuzzy-matched — the same
	// scorer the report and the history use, so the three finders behave
	// identically. It cannot reuse `historyKnownPaths` though, and the
	// difference matters: that lists only paths the HISTORY has seen, and a
	// writer exporting a book they have not written in since installing the
	// plugin would find nothing at all.
	exportKnownPaths(this: WordSmith) {
		const files: string[] = [], folders: string[] = [];
		const walk = (f: TFolder) => {
			for (const k of (f.children || [])) {
				// (the plugin's own folder, on the switch, A733)
				if (this.isOwnHidden(k.path)) continue;
				if (wsIsFolder(k)) { folders.push(k.path); walk(k); }
				else if (k.extension === 'md') files.push(k.path);
			}
		};
		try { walk(this.app.vault.getRoot()); } catch (_) { wsCatch('exportKnownPaths: walk(this.app.vault.getRoot());', _); }
		return { files, folders };
	},

	// What to offer before anything is typed: the folder of the note in
	// hand and its parents, then the folders holding the most notes. A
	// picker that shows nothing until it is typed at makes the writer
	// guess what it will accept.
	exportNearbyScopes(this: WordSmith, limit: number) {
		const out: { path: string; kind: string; score: number; }[] = [];
		const seen = new Set();
		const add = (p2: string) => {
			if (!p2 || seen.has(p2)) return;
			seen.add(p2);
			out.push({ path: p2, kind: 'folder', score: 0 });
		};
		try {
			let up: TFile | TFolder | null = this.app.workspace.getActiveFile();
			up = up && up.parent ? up.parent : null;
			while (up && up.path && up.path !== '/') { add(up.path); up = up.parent; }
		} catch (_) { wsCatch('exportNearbyScopes: let up = this.app.workspace.getActiveFile();', _); }
		const known = this.exportKnownPaths();
		const count: Record<string, number> = {};
		for (const p2 of known.files) {
			const cut = p2.lastIndexOf('/');
			if (cut > 0) count[p2.slice(0, cut)] = (count[p2.slice(0, cut)] || 0) + 1;
		}
		Object.keys(count).sort((a, b) => count[b] - count[a]).forEach(add);
		return out.slice(0, limit || 8);
	},

	exportFinderMatches(this: WordSmith, query: string, limit: number) {
		const known = this.exportKnownPaths();
		// Folders score above files: exporting a folder is the common case,
		// and a folder named like its first scene should not be buried
		// under it.
		const tag = (list: string[], kind: string) => this.historyFuzzy(query, list)
			.map(m => ({ path: m.path, score: m.score + (kind === 'folder' ? 1.5 : 0), kind }));
		const all = tag(known.folders, 'folder').concat(tag(known.files, 'file'));
		all.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
		return all.slice(0, limit || 8);
	},

	exportGather(this: WordSmith, scopePath: string) {
		const vault = this.app.vault;
		const out: TFile[] = [];
		// THE EMPTY PATH MEANS THE WHOLE VAULT, AND THE APP DOES NOT AGREE:
		// `getAbstractFileByPath('')` returns null on 1.13.7 while `'/'`
		// returns the root — so the whole-vault scope once gathered NOTHING,
		// and every tick in the tree was inert. `getRoot()` first because it is
		// the API that MEANS the root; the '/' form is the fallback for a build
		// without it.
		const at = scopePath
			? vault.getAbstractFileByPath(scopePath)
			: (typeof vault.getRoot === 'function'
				? vault.getRoot()
				: vault.getAbstractFileByPath('/'));
		// a note, by shape: a stub file may be a plain object
		const isMd = (f: TAbstractFile | null): f is TFile => !!f && (f as { extension?: string }).extension === 'md';
		if (!at) return out;
		if (isMd(at)) { out.push(at); return out; }
		// THE TREE'S ORDER, WHERE THERE IS ONE. This is what putting the file
		// tree's order in `ws-export.md` was for: a writer who has dragged
		// their chapters into the order the book is in has already answered
		// "what order does this compile in", and asking them again — in a
		// second list, with a second drag — is the two-answers-to-one-question
		// fault this plugin keeps removing.
		//
		// PER FOLDER, so it composes: a folder with a stored order uses it and
		// a folder without one falls back to natural sort, in the same tree.
		// Nothing has to be ordered for this to be safe, and a vault that has
		// never switched the feature on compiles exactly as it did.
		const ordered = (folder: TFolder) => {
			const kids = (folder.children || []).slice();
			// NOT GATED ON THE MISC TOGGLE. That switch decides whether
			// OBSIDIAN'S explorer is patched — a question about somebody
			// else's tree. The order itself is a fact about the manuscript,
			// set by dragging in either tree, and the compile follows it
			// wherever it was set from. A writer who turns the explorer patch
			// off has not said their book is in a different order.
			const stored = this.treeOrderFor(folder.path === '/' ? '' : folder.path);
			if (stored.length) {
				const rank = new Map();
				for (let i = 0; i < stored.length; i++) if (!rank.has(stored[i])) rank.set(stored[i], i);
				const known: TAbstractFile[] = [], rest: TAbstractFile[] = [];
				for (const k of kids) (rank.has(k.path) ? known : rest).push(k);
				known.sort((a, b) => rank.get(a.path) - rank.get(b.path));
				// What has no stored place falls in behind, sorted the way the
				// whole list used to be — the same rule the tree draws by, so
				// a new note is in the same place in both.
				rest.sort((a, b) => {
					const af = !!(a.children), bf = !!(b.children);
					if (af !== bf) return af ? 1 : -1;
					return this.exportNatural(a.name, b.name);
				});
				return known.concat(rest);
			}
			kids.sort((a, b) => {
				// Folders after files at the same level: a chapter's own
				// notes come before its sub-scenes, which is the order a
				// reader of the tree expects.
				const af = !!(a.children), bf = !!(b.children);
				if (af !== bf) return af ? 1 : -1;
				return this.exportNatural(a.name, b.name);
			});
			return kids;
		};
		const walk = (folder: TFolder) => {
			for (const k of ordered(folder)) {
				// (the plugin's own folder, on the switch, A733)
				if (this.isOwnHidden(k.path)) continue;
				if (wsIsFolder(k)) walk(k);
				else if (isMd(k)) out.push(k);
			}
		};
		if (wsIsFolder(at)) walk(at);
		return out;
	},

	// "Ch 2" before "Ch 10". Digit runs compare as numbers, everything else
	// as lower-cased text.
	exportNatural(this: WordSmith, a: string, b: string) {
		const re = /(\d+)|(\D+)/g;
		const ax = String(a).toLowerCase().match(re) || [];
		const bx = String(b).toLowerCase().match(re) || [];
		for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
			const an = parseInt(ax[i], 10), bn = parseInt(bx[i], 10);
			if (!isNaN(an) && !isNaN(bn)) { if (an !== bn) return an - bn; }
			else if (ax[i] !== bx[i]) return ax[i] < bx[i] ? -1 : 1;
		}
		return ax.length - bx.length;
	},

	// Apply a remembered list to what is on disk NOW. Both halves matter:
	// a file added to the folder since last time must appear (at the end,
	// where a new scene usually belongs), and a file deleted since must not
	// linger as a row pointing at nothing.
	//
	// A SET, NOT `indexOf`, so a manuscript of n scenes costs n lookups and
	// not n²/2 comparisons (251ms at 8,000 notes). A SEPARATE SET, AND NOT
	// `chosen`: a remembered file the writer UNTICKED is in `order` and not
	// in `chosen`, so the second loop would find it missing, append it a
	// second time and tick it back on.
	exportApplyRemembered(this: WordSmith, files: { path: string }[], remembered: { path: string; on?: boolean }[] | null | undefined) {
		const have = new Map(files.map((f) => [f.path, f]));
		const order = [];
		const seen = new Set();
		const chosen = new Set<string>();
		for (const r of (remembered || [])) {
			if (!have.has(r.path)) continue;
			// A STORE CAN NAME ONE PATH TWICE — synced, or hand-edited — and
			// `indexOf` used to make that harmless by accident. Kept on
			// purpose now.
			if (seen.has(r.path)) continue;
			seen.add(r.path);
			order.push(r.path);
			if (r.on) chosen.add(r.path);
		}
		// NEW SINCE LAST TIME: IN WHERE THE MANUSCRIPT IS. A scene written today
		// and silently left out of tonight's export is the worse mistake, so it
		// joins its folder; but the export gathers the whole vault, and "every
		// new note is in" put today's journal entry into the book. A new note is
		// in when the nearest folder above it that holds remembered notes has one
		// of them ticked. At the vault's top only the top's own notes count, or
		// one ticked book would claim every new top-level note.
		const dirOf = (p: string) => { const k = p.lastIndexOf('/'); return k === -1 ? '' : p.slice(0, k); };
		const inFolder = new Map<string, boolean>();   // a folder with remembered notes under it → any ticked
		for (const p of seen) {
			const on = chosen.has(String(p));
			let d = dirOf(String(p));
			if (!d) { inFolder.set('', !!inFolder.get('') || on); continue; }
			for (; d; d = dirOf(d)) inFolder.set(d, !!inFolder.get(d) || on);
		}
		const joins = (p: string) => {
			for (let d = dirOf(p); d; d = dirOf(d)) { const v = inFolder.get(d); if (v !== undefined) return v; }
			return !!inFolder.get('');
		};
		for (const f of files) {
			if (seen.has(f.path)) continue;
			seen.add(f.path);
			order.push(f.path);
			if (joins(f.path)) chosen.add(f.path);
		}
		return { order, chosen };
	},

	exportMove(this: WordSmith, list: string[], fromPath: string, toPath: string, after: boolean) {
		const from = list.indexOf(fromPath);
		if (from === -1 || fromPath === toPath) return list;
		const out = list.slice();
		out.splice(from, 1);
		let to = out.indexOf(toPath);
		if (to === -1) return list;
		out.splice(after ? to + 1 : to, 0, fromPath);
		return out;
	},

	// Move a whole folder's run of files to another folder's place. Its own
	// function beside exportMove for the same reason: dragging cannot be
	// tested headlessly, and what matters is that a chapter arrives whole
	// and in its own order — the way a block move goes wrong is by
	// scattering, dropping or duplicating the files it carries.
	exportMoveFolder(this: WordSmith, list: string[], fromFolder: string | null, toFolder: string | null, after: string | null, folderOf: (p: string) => string) {
		if (fromFolder == null || toFolder == null || fromFolder === toFolder) return list;
		const block = list.filter((p2) => folderOf(p2) === fromFolder);
		if (!block.length) return list;
		const rest = list.filter((p2) => folderOf(p2) !== fromFolder);
		// The target's own run, in what is LEFT — computing the insertion
		// point against the original list would be off by the block just
		// removed whenever the folder moves downward.
		let at = -1;
		for (let i = 0; i < rest.length; i++) {
			if (folderOf(rest[i]) !== toFolder) continue;
			if (at === -1) at = i;
			if (after) at = i + 1;
		}
		if (at === -1) return list;
		return rest.slice(0, at).concat(block, rest.slice(at));
	},

	// The folder each row belongs to, for the headings in the list. A row
	// whose parent differs from the row above opens a new group — which
	// means a file dragged out of its chapter takes a heading with it and
	// the writer can SEE that it has moved, rather than finding out from
	// the compiled manuscript.
	exportFolderOf(this: WordSmith, path: string) {
		const cut = String(path || '').lastIndexOf('/');
		return cut === -1 ? '' : path.slice(0, cut);
	},

	// EVERY folder between the scope and the file, outermost first. The list
	// used to show ONE heading per file — its immediate parent — which is
	// the whole truth for `Book/Ch 01.md` and a lie for
	// `Book/Part One/Ch 03.md`: two parts with a "Ch 03" in each drew two
	// headings called the same thing, one after another, with no way to see
	// which was which or to fold either away.
	//
	// STARTS AT THE SCOPE, not at the vault root. A writer exporting
	// `Novels/Book Two/Manuscript` does not need three headings restating
	// where they already told the window to look; the chain begins where
	// their attention does.
	//
	// A file at the vault root gets `['']`, which is the empty-string folder
	// the list has always drawn as "Vault root" — the one path through here
	// that must not return an empty chain, or such a file would be drawn
	// with no heading at all and could not be folded.
	exportFolderChain(this: WordSmith, path: string, scope: string) {
		const dir = this.exportFolderOf(path);
		if (!dir) return [''];
		const segs = dir.split('/');
		const base = String(scope || '');
		const inScope = !!base && (dir === base || dir.indexOf(base + '/') === 0);
		const startAt = inScope ? base.split('/').length - 1 : 0;
		const out = [];
		for (let i = startAt; i < segs.length; i++) out.push(segs.slice(0, i + 1).join('/'));
		return out;
	},

	// Is this file anywhere INSIDE that folder — not merely directly in it?
	// A parent's tick, its total and its drag all cover everything beneath
	// it, which is what a folder means once folders can nest.
	exportInFolder(this: WordSmith, path: string, folder: string | null) {
		if (folder === '' || folder == null) return this.exportFolderOf(path) === '';
		return String(path || '').indexOf(folder + '/') === 0;
	},

	// A file name that will not collide and will not surprise: the scope's
	// own name, the date, and the right extension.
	// The folder the file lands in, made if it is not there. A writer who
	// exports a book six times in an afternoon gets six files, and six
	// files loose in the vault root is how a vault stops being tidy — but
	// a chosen folder that does not exist should be created rather than
	// reported, because the writer has already said what they want.
	async exportEnsureFolder(this: WordSmith, folder: string) {
		const f = String(folder || '').replace(/^\/+|\/+$/g, '');
		if (!f) return '';
		try {
			const at = this.app.vault.getAbstractFileByPath(f);
			if (at && at.children) return f;
			if (at) return '';           // a NOTE by that name: use the root
			await this.app.vault.createFolder(f);
			return f;
		} catch {
			// Already there, or not creatable. Either way the write below
			// will tell the writer more usefully than a guess here.
			const at2 = this.app.vault.getAbstractFileByPath(f);
			return at2 && at2.children ? f : '';
		}
	},

	// NAMED FOR THE BOOK: the title its title page carries (the Title typed in
	// Export, else the folder's name, else the vault's), handed in by the run.
	// Without it an export of ticks across the vault has no folder to be named
	// after, and every file was called "export".
	exportFileName(this: WordSmith, scopePath: string, ext: string, title?: string) {
		// A title can be typed with the characters a path cannot hold, a slash
		// among them.
		const named = String(title || '').trim()
			|| (String(scopePath || '').split('/').pop() || '').replace(/\.md$/, '');
		const base = named.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
		const d = new Date();
		const p2 = (n: number) => String(n).padStart(2, '0');
		// dd-mm-yyyy and the time, by request. The clock matters more than
		// it looks: a writer exports the same manuscript three times in an
		// afternoon, and with only a date the second export collides with
		// the first — `vault.create` throws on an existing path, so the
		// export failed rather than making a second file. Minutes are
		// enough to tell those apart and short enough to read.
		// THE DATE FIRST, then the time, on the writer's word: the book's
		// name, the day, the minute.
		return base + ' '
			+ p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear() + ' '
			+ p2(d.getHours()) + '-' + p2(d.getMinutes())
			+ '.' + ext;
	},

	// Read every chosen file and hand back the sections the builders take.
	// `onStep` is called with (done, total) as each file is read. Worth the
	// parameter: a novel is three hundred files and JavaScript is
	// single-threaded, so without a yield between them the window freezes
	// for the whole compile and the writer's only evidence that anything is
	// happening is that nothing is.
	async exportSections(this: WordSmith, files: TFile[], opts: WsExportOpts, onStep: ((done: number, total: number) => void) | null, scope: string) {
		const secs = [];
		let n = 0;
		// ── A HEADING WHERE A FOLDER BEGINS ─────────────────────────────
		//
		// HERE RATHER THAN IN THE THREE TARGETS. Markdown, HTML and .docx
		// each walk this list; emitting the boundary once means they all
		// get it, and a fourth target would too. The alternative is the
		// same walk written three times and drifting.
		//
		// ORDER IS ALREADY ANSWERED: the compile follows the book's order,
		// so the folders arrive in sequence and a boundary is simply the
		// point where this file's folders stop matching the last one's.
		//
		// AN EMPTY LEVEL IS STILL A HEADING, and that is deliberate. A
		// folder holding only folders emits its name with the next level
		// directly beneath it — which is exactly what a Part/Chapter split
		// looks like, and is the shape the user asking for this described.
		//
		// `depth` TRAVELS ON EVERY SECTION, folder and file alike, because
		// the targets need it twice over: to set the folder's own level, and
		// to know how far to push a file's heading down beneath it.
		const wantFolders = !!(opts && opts.folderHeadings);
		// THE SCOPE REACHES THE ROOT READER: a folder the writer picked is not
		// common context, so it keeps its name (`wsExportRoot`). AND THE TICKS'
		// OWN FOLDER IS THE PICK: the export is the vault and no caller has a
		// scope, so the reader would strip the folder every ticked file shares
		// — and a manuscript kept in one folder would get no heading at all
		// with the switch on. The folder the ticks fill is the folder the
		// writer chose; it steps up one and keeps its name.
		const paths = files.map((f: TAbstractFile) => f.path);
		const picked = scope || wsExportRoot(paths, '');
		// THE TREE'S ROOT whether the folders print or not: the numbers count them either way (#79, "From the tree")
		const treeRoot = wsExportRoot(paths, picked);
		const root = wantFolders ? treeRoot : '';
		// THE BOOK'S OWN FOLDER (A848, the writer: "the first main folder name should not appear in contents- think on
		// this"): the folder the root stepped up from, the one every file sits in, keeps its heading in the text (A424, "when
		// i tick folder names as heading they are not there") and is marked `book`, which every contents passes by
		// (wsTocSteps counts the levels without it). The numbers never counted it (wsHeadNumbers)
		const book = wantFolders && treeRoot !== wsExportRoot(paths, '');
		let seen: string[] = [];
		for (const f of files) {
			let text = '';
			try { text = await this.app.vault.read(f); } catch { continue; }
			let depth = 0;
			if (wantFolders) {
				const rel = root ? String(f.path).slice(root.length + 1) : String(f.path);
				const bits = rel.split('/').slice(0, -1);
				let i = 0;
				while (i < seen.length && i < bits.length && seen[i] === bits[i]) i++;
				for (let k = i; k < bits.length; k++) {
					secs.push({
						folder: true,
						book: book && k === 0,
						depth: Math.min(6, k + 1),
						dirs: bits.slice(0, k + 1),
						title: bits[k],
						markdown: '',
						path: (root ? root + '/' : '') + bits.slice(0, k + 1).join('/')
					});
				}
				seen = bits;
				depth = Math.min(6, bits.length);
			}
			const dirs = (treeRoot ? String(f.path).slice(treeRoot.length + 1) : String(f.path)).split('/').slice(0, -1);
			secs.push({ title: f.basename, markdown: text, path: f.path, depth, dirs });
			n++;
			if (onStep && (n % 5 === 0 || n === files.length)) {
				onStep(n, files.length);
				// A REAL yield, not a microtask: awaiting an already
				// resolved promise never lets the frame paint, so the bar
				// would fill in one jump at the end — a bar that lies
				// about the one thing it exists to say.
				await new Promise((r) => window.setTimeout(r, 0));
			}
		}
		return secs;
	},

	// ── THE PICTURES, READ BEFORE THE BUILD (A568) ───────────────────────────
	//
	// The walkers are synchronous and reading a picture is not, so every
	// picture the notes reference is read here first and put on its note's
	// section, keyed by the reference as written. THREE WAYS:
	// · 'preview' reads nothing: the frame shows the vault's own file through
	//   its resource address, so a recompile on every switch costs no bytes.
	// · 'page' (the web page and the PDF) carries each picture inside the
	//   document as a data address, so the file stands alone.
	// · 'docx' keeps the bytes for Word's media parts and the size in pixels
	//   Word needs written down; WebP, SVG, AVIF and BMP become PNG, which
	//   every Word reads.
	// A picture longer than WS_IMAGE_MAX_SIDE on a side is redrawn at that
	// size first. Each file is read once however often it appears. What cannot
	// be found, read or drawn stays a placeholder; nothing is fetched from the
	// web.
	// THE PICTURES WHERE THEY ARE (A842, a reader: "…creates links in the markdown", for pandoc's sizes; the writer: "Dont
	// make a book attachments folder. Just embed the pictures from their original place"): each embed a plain Markdown
	// link to the picture where it lives in the vault, its path from the exported file; nothing is copied. A picture off
	// the web or not in the vault stays as written. The sections come back rewritten, the notes untouched.
	exportMdImages(this: WordSmith, sections: WsExportSection[], mdPath: string): WsExportSection[] {
		const out: WsExportSection[] = [];
		for (const sec of sections) {
			if (sec.folder || !sec.markdown || sec.markdown.indexOf('![') === -1) { out.push(sec); continue; }
			const swaps = new Map<string, string>();
			const re = wsImageRefRe();
			let m;
			while ((m = re.exec(sec.markdown)) !== null) {
				const raw = m[0];
				if (swaps.has(raw)) continue;
				const ref = wsParseImageRef(raw);
				if (!ref || ref.remote) continue;
				let file: TFile | null = null;
				try { file = this.app.metadataCache.getFirstLinkpathDest(ref.target, sec.path); }
				catch (_) { wsCatch('exportMdImages: getFirstLinkpathDest', _); }
				if (!file) continue;
				swaps.set(raw, wsMdImageLink(ref.alt, wsRelPath(mdPath, file.path)));
			}
			let md = sec.markdown;
			for (const [raw, link] of swaps) md = md.split(raw).join(link);
			out.push(Object.assign({}, sec, { markdown: md }));
		}
		return out;
	},

	async exportImages(this: WordSmith, sections: WsExportSection[], mode: 'preview' | 'page' | 'docx') {
		const ready = new Map<string, Omit<WsImage, 'name' | 'alt' | 'width'> | null>();
		for (const sec of sections) {
			if (sec.folder || !sec.markdown || sec.markdown.indexOf('![') === -1) continue;
			const imgs = new Map<string, WsImage>();
			const re = wsImageRefRe();
			let m;
			while ((m = re.exec(sec.markdown)) !== null) {
				const raw = m[0];
				if (imgs.has(raw)) continue;
				const ref = wsParseImageRef(raw);
				if (!ref || ref.remote) continue;
				// a lookup that throws is a picture that stays the mark, never a failed export
				let file: TFile | null = null;
				try { file = this.app.metadataCache.getFirstLinkpathDest(ref.target, sec.path); }
				catch (_) { wsCatch('exportImages: getFirstLinkpathDest', _); }
				if (!file) continue;
				let prep = ready.get(file.path);
				if (prep === undefined) {
					prep = mode === 'preview'
						? { src: this.app.vault.getResourcePath(file), bytes: null, ext: file.extension.toLowerCase(), mime: '', w: 0, h: 0 }
						: await this.exportImageRead(file, mode);
					ready.set(file.path, prep);
				}
				if (!prep) continue;
				imgs.set(raw, Object.assign({ name: file.name, alt: ref.alt, width: ref.width }, prep));
			}
			if (imgs.size) sec.images = imgs;
		}
	},

	// One file, read and made ready to travel: its size measured by drawing it,
	// redrawn when it is too long or a format Word cannot read, and for the page
	// carried as a data address. Null when no engine here can draw it (a HEIC,
	// a TIFF), which leaves the placeholder.
	async exportImageRead(this: WordSmith, file: TFile, mode: 'page' | 'docx') {
		try {
			const ext = file.extension.toLowerCase();
			let bytes = new Uint8Array(await this.app.vault.readBinary(file));
			let mime = WS_IMAGE_MIME[ext] || '';
			const size = await wsImageSize(bytes, mime);
			if (!size) return null;
			let w = size.w, h = size.h, outExt = ext;
			const longest = Math.max(w, h);
			const wordReads = ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'gif';
			if (longest > WS_IMAGE_MAX_SIDE || (mode === 'docx' && !wordReads)) {
				const k = Math.min(1, WS_IMAGE_MAX_SIDE / longest);
				const photo = ext === 'jpg' || ext === 'jpeg';
				const tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(h * k));
				const drawn = await wsImageRedraw(bytes, mime, tw, th, photo ? 'image/jpeg' : 'image/png');
				if (!drawn) return null;
				bytes = drawn; w = tw; h = th;
				mime = photo ? 'image/jpeg' : 'image/png';
				outExt = photo ? 'jpg' : 'png';
			}
			const src = mode === 'page' ? await wsDataUrl(bytes, mime) : '';
			return { src, bytes: mode === 'docx' ? bytes : null, ext: outExt, mime, w, h };
		} catch (_) { wsCatch('exportImageRead: ' + file.path, _); return null; }
	},

	// The Markdown target. Built first and kept, because it proves the join
	// — the order, the dividers, the section titles — with nothing binary in
	// the way, and because a writer who wants their own pipeline wants this
	// file rather than a .docx.
	// THE E-BOOK'S CHECK (A654): see wsEpubCheck; a check that throws is no fault of the book
	exportEpubCheck(this: WordSmith, bytes: Uint8Array) {
		try { return wsEpubCheck(bytes); } catch (_) { wsCatch('exportEpubCheck', _); return []; }
	},

	// an export's notice, "Word-Smith: " and the text, held `ms` long (0: Obsidian's own time)
	exportNotice(this: WordSmith, text: string, ms: number) {
		new Notice('Word-Smith: ' + text, ms || undefined);
	},

	// THE CITATIONS IN AN EXPORT (A572 step 4): the style and the library the settings name, over the sections
	// (see wsCiteSections). Called after the words are counted, so the list at the back is no word of the book;
	// a Markdown export never calls it and keeps [@key] as written.
	// …and answers the keys the library does not hold (A670), which print as typed
	exportCite(this: WordSmith, sections: WsExportSection[]): string[] {
		let missing: string[] = [];
		try { missing = wsCiteMissing(sections, this.citeLibrary()); wsCiteSections(sections, this.citer()); } catch (_) { wsCatch('exportCite', _); }
		return missing;
	},

	exportToMarkdown(this: WordSmith, sections: WsExportSection[], o: WsExportRun) {
		const parts = [];
		if (o.titlePage) {
			parts.push('# ' + (o.title || wsTIn(o.lang, 'Untitled')));
			// (the subtitle, #81)
			if (String(o.subtitleText || '').trim()) parts.push('## ' + String(o.subtitleText).trim());
			if (o.author) parts.push('*' + wsTIn(o.lang, 'by {author}', { author: o.author }) + '*');
			if (o.wordCount != null) {
				parts.push('*' + wsTitleWords(o) + '*');
			}
			parts.push('');
		}
		if (o.toc && sections.length > 1) {
			parts.push('## ' + wsTocTitle(o) + '\n');
			// Markdown's own heading anchors: lower case, spaces to
			// hyphens. They work in Obsidian and on GitHub, which is where
			// a compiled .md actually gets read.
			// INDENTED BY THE LEVEL THE ENTRY WILL CARRY. Two spaces per level,
			// which is what every markdown renderer reads as a nested list item.
			// With folder headings off every section is level 2 and the list comes
			// out flat.
			//
			// ── TWO SECTIONS CAN SHARE A NAME, AND THE LINKS MUST NOT ───────
			//
			// A slug of the title is the anchor here, and a NESTED contents is
			// where sibling chapters reuse scene names as a matter of course. The
			// other two targets never had it: `wsAnchorId(title, i)` takes the
			// index. Markdown cannot borrow that id — its anchors are whatever the
			// renderer derives from the heading text — so it follows the renderers'
			// own rule, which GitHub and Obsidian share: the second `Scene 3` is
			// `scene-3-1`, the third `scene-3-2`.
			const stepOf = wsTocSteps(o, sections);
			const seenSlug: Record<string, number> = {};
			// (the structure's numbers, #79: the slug read off the heading as it is printed)
			const tocNums = wsHeadNumbers(o, sections);
			sections.forEach((sec: WsExportSection, i: number) => {
				const t = wsNumbered(tocNums[i], sec.title || 'Section');
				const pad = '  '.repeat(stepOf(sec));
				const base = String(t).toLowerCase()
					.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
				const nth = seenSlug[base] || 0;
				seenSlug[base] = nth + 1;
				// (the book's own folder in the text, never in the contents: A848)
				if (sec.book) return;
				parts.push(pad + '- [' + t + '](#' + base
					+ (nth ? '-' + nth : '') + ')');
			});
			parts.push('');
		}
		const mdNums = wsHeadNumbers(o, sections);
		sections.forEach((sec: WsExportSection, i: number) => {
			// A FOLDER IS A HEADING AND NOTHING ELSE — no divider above it, no
			// prose under it, and it does not answer to `sectionTitles`, which
			// is about whether a FILE contributes its name.
			if (sec.folder) {
				parts.push('#'.repeat(Math.min(6, sec.depth || 1)) + ' ' + wsNumbered(mdNums[i], sec.title) + '\n');
				return;
			}
			if (o.sectionTitles && sec.title) {
				parts.push('#'.repeat(wsFileHeadLevel(o, sec)) + ' ' + wsNumbered(mdNums[i], sec.title) + '\n');
			}
			// Frontmatter travels only if the writer asked for it — see the
			// note in wsBlocksFromMarkdown.
			let md = String(sec.markdown || '');
			if (!o.keepFrontmatter && /^---\s*\n/.test(md)) {
				md = md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
			}
			if (!o.keepComments) md = md.replace(/%%[\s\S]*?%%/g, '');
			// CALLOUTS travel only when kept; kept, as written (this target is Markdown).
			if (!o.keepCallouts && /\[!/.test(md)) md = wsDropCallouts(md);
			// TAGS stay in the note; off, they leave the manuscript too.
			if (o.keepTags === false) md = wsDropTags(md);
			// THE NOTE'S OWN HEADINGS LEFT OUT where the page and Word leave them out: the file's name the heading, or none
			if (o.keepHeadings === false) md = wsDropHeadings(md);
			// AND THE NOTE'S OWN HEADINGS MOVE DOWN UNDER THE FOLDER'S, or under the file's name with Both. See
			// `wsNoteHeadings`: a scene opening `# The Sea` under a folder
			// heading `# Chapter 1` would outrank the chapter it is in.
			md = wsNoteHeadings(o, sec, md);
			parts.push(md.trim());
			// Only when asked for. This used to divide EVERY pair of files
			// unconditionally, which put a divider where a writer had asked
			// for a page break and nothing else — the markdown target
			// should compile what the options say, or it stops being a
			// preview of the others.
			if (o.starBetween && i < sections.length - 1) {
				parts.push('\n' + (o.divider == null ? '#' : o.divider) + '\n');
			}
		});
		return parts.join('\n') + '\n';
	},

	// ── THE EXPORT OPTIONS' DEFAULTS ────────────────────────────────────────
	//
	// CALLED BY EVERYTHING THAT READS THE OPTIONS, not by one window: the
	// Export tab, the act line, the options panel and the compile itself.
	// A default that lives inside a drawing routine is a default that a
	// caller can skip — the compile once read `undefined` for the format,
	// the divider and the running header when the window that set them
	// was not open.
	// WHAT A FRESH EXPORT STARTS WITH (A855: the Settings › Export resets): the defaults above, filled into an empty set and
	// handed back, the writer's own put back as they were
	exportDefaultsOf(this: WordSmith) {
		const keep = this.settings.exportOpts;
		this.settings.exportOpts = {};
		try { return Object.assign({}, this.exportOptionDefaults()); } finally { this.settings.exportOpts = keep; }
	},

	exportOptionDefaults(this: WordSmith) {
		const o = this.settings.exportOpts || (this.settings.exportOpts = {});
		const bag = o as Record<string, unknown>;
		const dflt = (k: string, v: string | boolean | number) => { if (bag[k] === undefined) bag[k] = v; };
		// MANUSCRIPT IS THE DEFAULT, rather than a preset to choose. These
		// are the values the "Manuscript" button used to write, which is
		// what nearly every writer wanted from it.
		dflt('format', 'docx');   dflt('titlePage', true);
		dflt('sectionTitles', false); dflt('pageBreaks', true);
		dflt('runningHeaderOn', true); dflt('author', '');
		dflt('divider', '#');     dflt('a4', false);
		dflt('starBetween', true);
		dflt('dashPageBreak', false);
		// Folder names as headings — off, because it changes the shape of
		// every existing export and a flat folder of scenes gains nothing.
		dflt('folderHeadings', WS_EXPORT_FOLDER_HEADINGS_DEFAULT);
		// …and these two are pinned, because the convention decides them
		// and a switch nobody moves is a switch that only takes up room.
		o.wordCountOnTitle = true;
		o.pageNumbers = true;
		// PICTURES TRAVEL, ALWAYS (A568): a note with pictures exports with
		// them, so the "Image placeholders" switch is gone and its keys with
		// it. Deleted, not written back: a phone on an older version may put
		// one back, and it reads nothing here.
		delete bag.keepImages;
		delete bag.dropImages;
		dflt('keepFrontmatter', false);
		dflt('keepComments', false);
		dflt('keepCallouts', false);
		// ON, because tags always printed: off is a writer's choice, never a surprise
		dflt('keepTags', true);
		// The two merged controls read from the booleans they write, so a
		// vault that predates them opens on whatever it already had.
		if (!o.joinMode) o.joinMode = o.pageBreaks ? 'page' : (o.starBetween ? 'divider' : 'run');
		// …AND THEN WRITTEN BACK FROM IT, on the way in. Reading was only
		// half the job: the drop-downs write the booleans when they CHANGE,
		// so a vault could hold joinMode 'page' beside a stale
		// starBetween: true — one saying "start a new page" and the other
		// still saying "put a mark between them". The window drew a
		// Divider box for a divider nothing would draw, and the compile
		// took the booleans. One answer decides both, from the moment the
		// window opens.
		o.pageBreaks  = o.joinMode === 'page';
		o.starBetween = o.joinMode === 'divider';
		dflt('font', 'Times New Roman'); dflt('pt', 12);
		dflt('justify', false);   dflt('keepHeadings', true);
		dflt('numberStyle', 'none'); dflt('indentAfterHeads', false); dflt('keepBlankLines', false);
		dflt('centerHeads', true);
		dflt('smartQuotes', false); dflt('wordCountOnTitle', true);
		dflt('roundWordCount', true);
		dflt('pageNumbers', true);
		dflt('outFolder', '');  dflt('toc', false);
		// A751: the contents' page numbers on; the header's words and the contents' title empty (the defaults)
		dflt('headerText', ''); dflt('tocTitle', '');
		// (#81)
		dflt('headerLeft', false); dflt('address', ''); dflt('phone', ''); dflt('email', ''); dflt('contactOnTitle', false); dflt('subtitleText', '');
		dflt('titleText', '');
		dflt('doubleSpaced', true); dflt('indent', true);
		// SPACING, from the boolean it replaced — and written back to it on
		// the way in, for the same reason the join and heading answers are:
		// two keys saying the same thing must not be able to disagree.
		if (!o.lineSpacing) o.lineSpacing = o.doubleSpaced === false ? 'single' : 'double';
		o.doubleSpaced = o.lineSpacing !== 'single';
		// The size is stored as a number and a <select> hands back a
		// string, so it is coerced here as well as at the control: a vault
		// that has been through one is read by builders that multiply it.
		o.pt = parseInt(String(o.pt), 10) || 12;
		// Footnotes were unconditional, so absent means on.
		dflt('footnotes', true);
		// where Word puts them: at the foot of each page (#46), or at the end (Settings → Export)
		dflt('footnotePlace', 'foot');
		// the space between paragraphs, one choice (A834): what the two switches it replaced said, else Auto
		dflt('paraSpacing', wsParaSpacing(o));
		dflt('highlights', false);
		// Which tab the column opens on, remembered: a writer setting up a
		// proof is in Typesetting for six exports in a row.
		// PAPER, from the boolean it replaced: a vault saved before the
		// table opens on the paper it already had rather than on Letter.
		if (!o.paperId) o.paperId = o.a4 ? 'a4' : 'letter';
		return o;
	},

	openExportModal(this: WordSmith, scopeHint?: undefined) {
		// The pane is the one door in.
		return this.orgOpenTab('export');
	},

	// ── THE FIGURES LINE HAS ONE WRITER ────────────────────
	//
	// It is written from TWO places — the preview, and the early return
	// that runs when nothing is ticked — and a line that says how much is
	// going out must not be able to disagree with itself. "notes", NOT
	// "files": what goes out is notes. "n folders · m notes · w words": the
	// folders are the ones the tree shows ticked — every note under them
	// going out; the notes are the ticked notes. No folder ticked, no
	// folder figure.
	// THE NOTES ALONE (the writer, a circled shot of "1 note · 2,685 w…" beside Tick all: "here only show number of
	// notes"): A414's folders and words are gone from the line, and the folder count that fed it with them (TOMBSTONE:
	// exportFoldersTicked). The figure as `toLocaleString` writes it (`count`), the number itself (`n`) for the plural.
	exportFiguresText(this: WordSmith, fileCount: number) {
		return fileCount === 1 ? wsT('{count} note', { n: fileCount, count: fileCount.toLocaleString() })
			: wsT('{count} notes', { n: fileCount, count: fileCount.toLocaleString() });
	},

	// "Tick all" until everything is, then "Untick all". One element,
	// re-said wherever the figures are.
	exportTickAllSay(this: WordSmith, row: HTMLElement | null, picked: number, total: number) {
		const b = row && row.querySelector('.ws-export-tickall');
		if (!b) return;
		const all = total > 0 && picked >= total;
		// A GLYPH BEFORE THE WORD: a ticked box to tick all, an empty one to
		// untick all — the state the press leads to, as the word says.
		wsGlyphWord(b, all ? ['square'] : ['check-square', 'list-checks'], all ? wsT('Untick all') : wsT('Tick all'));
		b.dataset.all = all ? '1' : '0';
	},

	// CLICK A PARAGRAPH, OPEN THE NOTE THERE, so a writer sees how their
	// text flows. ON THE FRAME'S DOCUMENT, not the pane: the paragraphs
	// live inside the iframe, and a listener outside it hears nothing.
	// READS THE STAMP the screen render puts on a section (`data-ws-note`,
	// never in a delivered file). READER ONLY: in pages a click is a click
	// on paper. A link stays a link, a selection stays a selection — a
	// writer dragging to copy a line is not leaving.
	exportReaderClicks(this: WordSmith, doc: Document | null, open: ((path: string, snippet: string, ev: MouseEvent) => unknown) | null, frame: HTMLIFrameElement) {
		// THE MEMORY LIVES ON THE DOCUMENT, WITH THE LISTENER. A paint swaps
		// the root and keeps the document AND its listeners, so the flag goes
		// where the listener is: on the root it would wire again at every
		// paint.
		if (!doc || !doc.documentElement || doc.__wsReaderClicks) return;
		doc.__wsReaderClicks = true;
		if (typeof open !== 'function') open = (path, snippet, ev) => this.openNoteAt(path, snippet, ev, frame);
		doc.addEventListener('click', (ev: MouseEvent) => {
			try {
				const t = ev.target as HTMLElement | null;
				if (!t || !t.closest) return;
				if (!doc.documentElement || !doc.documentElement.classList.contains('is-flow')) return;
				if (t.closest('a')) return;
				const sec = t.closest('section[data-ws-note]');
				if (!sec) return;
				const path = sec.getAttribute('data-ws-note');
				if (!path) return;
				try {
					const sel = doc.getSelection && doc.getSelection();
					if (sel && String(sel).length) return;
				} catch (_) { wsCatch('exportReaderClicks: const sel = doc.getSelection && doc.getSelection();', _); }
				const block = t.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
				if (ev.preventDefault) ev.preventDefault();
				// LIT: the block the reader is in stays marked while the note is open
				// beside it — one at a time.
				try {
					doc.querySelectorAll('.is-here').forEach((el: HTMLElement) => el.classList.remove('is-here'));
					if (block) block.classList.add('is-here');
				} catch (_) { wsCatch('exportReaderClicks: block.classList.add(is-here)', _); }
				open(path, wsSnippetOf(block ? block.textContent : ''), ev);
			} catch (_) { wsCatch('exportReaderClicks: const t = ev.target;', _); }
		});
	},

	// THE BOOK'S OWN LINKS (A805, the writer on the phone: "clicking on the pages in contents leave the page preview
	// blank"): the frame's document is written into a doctype shell, so "#ch-3" resolved against Obsidian's own address
	// and the frame navigated away to nothing. A press on an in-book link (the contents, a footnote's mark) turns to its
	// target instead, through the preview's own `topTo`: its page in pages, the place in the reader. The target the eye
	// can see when the pool holds copies of the page. On the document, once, as the clicks are.
	exportAnchorClicks(this: WordSmith, doc: Document | null, go: (el: HTMLElement) => void) {
		if (!doc || !doc.documentElement || doc.__wsAnchorClicks) return;
		doc.__wsAnchorClicks = true;
		doc.addEventListener('click', (ev: MouseEvent) => {
			try {
				const t = ev.target as HTMLElement | null;
				const a = t && t.closest ? t.closest('a[href^="#"]') : null;
				if (!a) return;
				ev.preventDefault();
				let id = String(a.getAttribute('href') || '').slice(1);
				try { id = decodeURIComponent(id); } catch { /* as written */ }
				if (!id) return;
				const all = Array.from(doc.querySelectorAll<HTMLElement>('[id="' + id.replace(/["\\]/g, '\\$&') + '"]'));
				const el = all.find((e) => e.getClientRects().length > 0) || all[0];
				if (el) go(el);
			} catch (_) { wsCatch('exportAnchorClicks', _); }
		}, true);
	},

	// THE KEYS A READER EXPECTS. On the frame's document, reader only,
	// wired once per written document like the clicks. Space pages
	// down, Shift+Space up; PgDn and PgUp, Left and Right turn a page; Up and Down step, Home and End go
	// to the ends, Escape collapses, Enter opens the section under the top
	// edge, j/k step under Obsidian's Vim and only then. A chorded key
	// belongs to whoever owns the chord; a plain letter is not ours.
	exportReaderKeys(this: WordSmith, doc: Document | null, act: { collapse?: () => void; open?: (path: string, snippet: string) => unknown; step?: (by: number) => void; vim?: () => boolean }) {
		// ON THE DOCUMENT, as the clicks are: see exportReaderClicks.
		if (!doc || !doc.documentElement || doc.__wsReaderKeys) return;
		doc.__wsReaderKeys = true;
		act = act || {};
		doc.addEventListener('keydown', (ev: KeyboardEvent) => {
			try {
				if (!doc.documentElement || !doc.documentElement.classList.contains('is-flow')) return;
				if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
				const win = doc.defaultView;
				if (!win) return;
				const page = Math.max(120, Math.round((win.innerHeight || 800) * 0.88));
				const step = 64;
				const vim = !!(typeof act.vim === 'function' && act.vim());
				let dy: number | null = null, to: number | null = null;
				switch (ev.key) {
					case ' ': dy = ev.shiftKey ? -page : page; break;
					// PAGE UP AND DOWN TURN A PAGE where the reader has them, a screen where it has none; LEFT AND RIGHT turn one
					// too (the writer's pick "Keys for pages")
					case 'PageDown': if (wsReadStep(doc, 1)) { ev.preventDefault(); return; } dy = page; break;
					case 'PageUp': if (wsReadStep(doc, -1)) { ev.preventDefault(); return; } dy = -page; break;
					case 'ArrowRight': case 'ArrowLeft':
						if (wsReadStep(doc, ev.key === 'ArrowRight' ? 1 : -1)) ev.preventDefault();
						return;
					case 'ArrowDown': dy = step; break;
					case 'ArrowUp': dy = -step; break;
					case 'j': if (!vim) return; dy = step; break;
					case 'k': if (!vim) return; dy = -step; break;
					case 'Home': to = 0; break;
					case 'End': to = Math.max(1, (doc.documentElement && doc.documentElement.scrollHeight) || 1e9); break;
					// PREVIOUS AND NEXT FILE: the same jump the foot's file list and the
					// tree make, one file either way from the one at the top.
					case '[': case ']':
						ev.preventDefault();
						if (typeof act.step === 'function') act.step(ev.key === ']' ? 1 : -1);
						return;
					case 'Escape':
						ev.preventDefault();
						if (typeof act.collapse === 'function') act.collapse();
						return;
					case 'Enter': {
						ev.preventDefault();
						// THE SECTION UNDER THE TOP EDGE: the last one whose top is
						// at or above the fold, which is the one being read.
						const secs = Array.from<HTMLElement>(doc.querySelectorAll('section[data-ws-note]'));
						let hit = secs[0] || null;
						for (const sec of secs) {
							const r = sec.getBoundingClientRect();
							if (r.top <= 12) hit = sec; else break;
						}
						if (hit && typeof act.open === 'function') {
							const first = hit.querySelector('p, h1, h2, h3, h4, h5, h6, li, blockquote');
							act.open(hit.getAttribute('data-ws-note') || '', wsSnippetOf(first ? first.textContent : ''));
						}
						return;
					}
					default: return;
				}
				ev.preventDefault();
				if (to !== null) win.scrollTo(0, to);
				else win.scrollBy(0, dy || 0);
			} catch (_) { wsCatch('exportReaderKeys: if (!doc.documentElement || !doc.documentElement.classList.contains(\'i …', _); }
		});
	},

	// The note, in the pane the tree's own row click uses (`openRow`: the
	// active leaf, or a tab with a modifier), and then the caret on the
	// paragraph — the first line of the note that reads the same as the
	// clicked words. Words the note does not hold move no caret: the note
	// still opens, at the top. `frame`: the reader's own frame, when the
	// click came from one — the note opens BESIDE the reader, in one leaf
	// every next click reuses, and the reader stays where it is.
	async openNoteAt(this: WordSmith, path: string, snippet: string | null, ev?: WsModEvent, frame?: Node) {
		const newTab = !!(ev && (ev.ctrlKey || ev.metaKey));
		// THE NOTE LANDS IN THE MAIN WINDOW. `openLinkText` opens beside the
		// most recent leaf, which, when the reader lives in a pop-out, is the
		// pop-out's own — so the note opened inside the reader's window, on
		// top of the reader. The main window's most recent leaf is asked for
		// by its root; a modifier makes a tab beside it. Where the workspace
		// cannot say (an older API, a stub), the old door is the fallback.
		let view = null;
		let opened = false;
		try {
			const ws = this.app.workspace;
			const file = this.app.vault.getAbstractFileByPath(path);
			const root = ws.rootSplit;
			// THE READER’S OWN LEAF, found by the frame the click came from. The
			// most recent leaf IS the reader when the reader is a docked pane —
			// which is how the note used to land on top of it.
			let readerLeaf: WorkspaceLeaf | null = null;
			try {
				if (frame && ws.iterateAllLeaves) ws.iterateAllLeaves((l) => { if (!readerLeaf && l && l.containerEl && l.containerEl.contains && l.containerEl.contains(frame)) readerLeaf = l; });
			} catch (_) { wsCatch('openNoteAt: ws.iterateAllLeaves((l) => l.containerEl.contains(frame))', _); readerLeaf = null; }
			let leaf = null;
			if (readerLeaf && !newTab) {
				// ONE LEAF BESIDE IT, reused while it lives; split again once it is
				// closed. Never the reader itself.
				const kept = this._readerBeside;
				const alive = !!(kept && kept !== readerLeaf && ws.getLeafById && ws.getLeafById(kept.id || '') === kept);
				if (alive) leaf = kept;
				else if (ws.createLeafBySplit) { leaf = ws.createLeafBySplit(readerLeaf, 'vertical'); this._readerBeside = leaf; }
			}
			if (!leaf) leaf = (root && ws.getMostRecentLeaf) ? ws.getMostRecentLeaf(root) : null;
			if (leaf && readerLeaf && leaf === readerLeaf && !newTab && ws.createLeafBySplit) { leaf = ws.createLeafBySplit(readerLeaf, 'vertical'); this._readerBeside = leaf; }
			if (leaf && wsIsFile(file) && typeof file.extension === 'string') {
				if (newTab && leaf.parent && ws.createLeafInParent) {
					leaf = ws.createLeafInParent(leaf.parent, (leaf.parent.children || []).length);
				}
				await leaf.openFile(file, { active: true });
				view = leaf.view && leaf.view.editor ? leaf.view : null;
				opened = true;
			}
		} catch (_) { wsCatch('openNoteAt: the main window’s leaf', _); opened = false; }
		if (!opened) {
			try { await this.app.workspace.openLinkText(path, '', newTab ? 'tab' : false); }
			catch { return false; }
		}
		try {
			if (!view) view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const ed = view && view.editor;
			if (!ed || !snippet) return true;
			const line = wsLineOfSnippet(ed.getValue(), snippet);
			if (line < 0) return true;
			ed.setCursor({ line, ch: 0 });
			if (ed.scrollIntoView) ed.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
		} catch (_) { wsCatch('openNoteAt: if (!view) view = this.app.workspace.getActiveViewOfType(MarkdownView) …', _); }
		return true;
	},

	exportPreviewInto(this: WordSmith, host: HTMLElement, sections: WsExportSection[], o: WsExportRun, fileCount: number, headHost: HTMLElement | null,
		onRefresh: () => void) {
		if (!host) return null;
		// WHERE THE READER WAS, TAKEN NOW. The session's `flowScroll` is
		// written on the reader's every scroll event — and a NEW frame fires
		// one as it lays out, at zero, before `after` reads the number back.
		// So the number is read once, here, before the new frame exists, and
		// `after` restores THAT.
		const flowY0 = (this._wsSession && typeof this._wsSession.flowScroll === 'number')
			? this._wsSession.flowScroll : 0;
		// AND THE PARAGRAPH AT THE TOP, with its offset. A refresh rebuilds
		// through `paint()`, three writes of the frame's document, each at
		// scroll zero — so every paint re-arms a restore that waits for the
		// frame to be tall enough, puts the remembered paragraph back where it
		// stood (pixels when there is none — the text may have moved, a
		// paragraph index moves with it), and the read-out does not write the
		// session while that is pending, so a fresh frame's zero cannot
		// overwrite the place.
		const flowTop0 = (this._wsSession && this._wsSession.flowTop && typeof this._wsSession.flowTop.idx === 'number')
			? { idx: this._wsSession.flowTop.idx, off: Number(this._wsSession.flowTop.off) || 0 } : null;
		let restoring = false;
		const body = host.createDiv({ cls: 'ws-export-prevbody' });

		const head = (headHost || body).createDiv({ cls: 'ws-export-prevhead'
			+ (headHost ? ' is-inact' : '') });
		// BEFORE THE BUTTON IN THE DOM, not merely to its left on screen.
		// Appended, it came out last in the row and rendered third of four,
		// so a screen reader met the button before the figures it is about to
		// act on. Reading order is the order it is READ in.
		if (headHost) {
			wsPlaceFigures(headHost, head);
		}
		head.createSpan({
			text: this.exportFiguresText(fileCount) });
		// A MARKDOWN EXPORT PREVIEWS AS MARKDOWN. Showing a typeset page for
		// a .md file is a preview of a document that will not exist: none
		// of the paper, the margins or the running header survives into
		// the file, and the one thing that DOES — where the dividers and
		// the headings fall — is exactly what a page hides. The preview
		// should be of the thing being made.
		// Markdown previews as text because that is what it IS; .html and
		// .docx both preview as pages, and for .html the preview and the
		// file are literally the same document.
		const asText = o.format === 'md';
		// BORN FROM A DOCTYPE SHELL (`srcdoc`), so the frame's document is in
		// standards mode; the page itself never goes through srcdoc — it would
		// have to be HTML-escaped whole, and a manuscript is full of quotes and
		// ampersands, one mistake there turning a page of prose into markup.
		// IN A BOX OF ITS OWN (#72): the box takes the column's room and clips; the frame fills it, and below the zoom floor
		// is laid out larger and shrunk to it (`apply`). Sizes are the box's: the frame's may be the shrunk one's
		const paperBox = body.createDiv({ cls: 'ws-export-paperbox' + (asText ? ' is-plain' : '') });
		const frame = paperBox.createEl('iframe',
			{ cls: 'ws-export-paper' + (asText ? ' is-plain' : ''), attr: { srcdoc: WS_FRAME_SHELL } });
		const html = asText
			? this.exportPreviewMarkdown(this.exportToMarkdown(sections, o))
			: this.exportToHtml(sections, o, true);

		// ── ZOOM ────────────────────────────────────────────────────────
		//
		// The sheet was drawn at its true size — 8.5 inches is 816 CSS
		// pixels — inside a frame about seven hundred wide, so a writer met
		// the page already cropped: the right margin was past the edge, and
		// the FIRST thing a preview has to show is that there are margins
		// at all. The whole point of looking is the shape of the page.
		//
		// FIT IS THE DEFAULT and it is computed, not guessed: the frame's
		// own width against the paper's own width, from the same table the
		// .docx reads, less a little air so the sheet does not touch the
		// sides. Capped at 1 — a 4.25-inch mass-market page would otherwise
		// open at 180% and look like a bug.
		const paperPx = () => (wsPaperOf(o).w / 1440) * 96;
		// ── FIT MEANS THE WHOLE PAGE ─────────────────────────────────
		//
		// Fitting by width alone is right in a tall modal and wrong in a side
		// column: the sheet comes out as wide as the frame and twice as tall,
		// so "what will page one look like" shows its top third. A page has
		// two dimensions and the smaller ratio is the one that fits both. THE
		// HEIGHT COMES FROM THE SAME TABLE AS THE WIDTH — `wsPaperOf`, which
		// the .docx reads — so the two never disagree about what US Letter is.
		const paperHighPx = () => (wsPaperOf(o).h / 1440) * 96;
		// THE READER'S FIT (A804): the page's width and its ground's air (36px a side) across the frame's width, a scrollbar's
		// worth spared
		const flowFitZoom = () => Math.max(0.2, Math.min(2.5, ((paperBox.clientWidth || 640) - 72 - 16) / paperPx()));
		const fitZoom = () => {
			const w = paperBox.clientWidth || 640;
			const h = paperBox.clientHeight || 0;
			const byW = (w - 28) / paperPx();
			// A frame with no measured height yet must not fit to nothing.
			const byH = h > 40 ? (h - 24) / paperHighPx() : byW;
			return Math.max(0.2, Math.min(1, Math.min(byW, byH)));
		};
		// ── A CHOSEN ZOOM HAS TO OUTLIVE THE REDRAW ────────────────────
		//
		// `zoom` is a local of this method, and the pane calls this method
		// again on every option change — debounced 220ms, on change AND click
		// AND input. A zoom held only here is fitted again at the next redraw.
		//
		// A RUNTIME FIELD, NOT A SETTING. It is deliberately forgotten when
		// Obsidian restarts: a zoom is about the window you are looking at
		// now, and fit is the right answer on opening a pane you have not seen
		// yet. Nothing is written to the vault, so nothing is owed a migration.
		//
		// `null` MEANS FOLLOW THE FIT, a number means the writer chose it —
		// which is why Fit clears it rather than storing what it computed.
		// Storing the fitted number would freeze the page at whatever size the
		// pane happened to be when Fit was pressed, and it would stop
		// following the pane on the next resize.
		// THE FACTORY'S SHARED STATE, one object (A488): its inner functions write
		// these, and a function lifted out of the factory writes them through it.
		const pv: {
			zoom: number;
			flowZoom: number;
			// the reader follows the window's width (A804) until a zoom is chosen
			flowFit: boolean;
			pct: HTMLElement | null;
			fitSay: (() => void) | null;
			dark: boolean;
			pageAt: number;
			pageNum: HTMLElement | null;
			prevBtn: { disabled: boolean; } | null;
			nextBtn: { disabled: boolean; } | null;
			pageNow: HTMLElement | null;
			pageEst: HTMLElement | null;
			flow: boolean;
			pageBox: HTMLElement | null;
			readPage: HTMLElement | null;
			flowSay: (() => void) | null;
			readFile: HTMLSelectElement | null;
		} = {
			zoom: 0,   // 0 = not measured yet
			flowZoom: 1,
			flowFit: true,
			pct: null,   // the read-out, once the foot exists
			fitSay: null,   // the Fit/100% toggle's word, once it exists
			dark: !!((this.settings && this.settings.exportOpts
			&& this.settings.exportOpts.previewDark) || false),
			pageAt: Math.max(0, Number(this._exportPage) || 0),
			pageNum: null,
			prevBtn: null,
			nextBtn: null,
			pageNow: null,
			pageEst: null,
			flow: false,
			pageBox: null,
			readPage: null,
			flowSay: null,
			readFile: null,
		};
		// ── AND THE READER HAS ITS OWN ───────────────────────────
		//
		// THE PAGE ZOOM IS A PAGE-FITTING DEVICE. It exists to get 8.5 inches
		// of paper into a 445px column, and in flow there is no page to fit,
		// so there is nothing for that number to be the answer to — the reader
		// would inherit half-size type. ONE, MEANING LIFE SIZE: the writer's
		// own point size, at the size they chose it. And `zoom` STAYS the
		// mechanism — scaling the document scales the type and the `ch`
		// measure together, so the column holds the same number of characters
		// at any setting, which is the one thing a reading measure must not
		// lose.
		//
		// SEPARATE FROM THE PAGE ZOOM, not shared: coming back to pages must
		// find the fit the writer left, and going back to the reader must find
		// the reading size — they are answers to different questions.
		// REMEMBERED FOR THE SESSION, on the session rather than on `this`,
		// because it is a way of LOOKING: back when you reopen the window,
		// gone when Obsidian restarts.
		try {
			const z0 = this._wsSession && this._wsSession.flowZoom;
			if (typeof z0 === 'number' && z0 > 0) { pv.flowZoom = z0; pv.flowFit = false; }
		} catch (_) { wsCatch('exportPreviewInto: const z0 = this._wsSession && this._wsSession.flowZoom;', _); }
		const applyDark = () => {
			try {
				const doc = frame.contentDocument
					|| (frame.contentWindow && frame.contentWindow.document);
				if (!doc || !doc.documentElement) return;
				doc.documentElement.classList.toggle('is-dark', pv.dark);
			} catch (_) { wsCatch('exportPreviewInto / applyDark: const doc = frame.contentDocument', _); }
		};
		const apply = () => {
			try {
				const doc = frame.contentDocument
					|| (frame.contentWindow && frame.contentWindow.document);
				if (!doc || !doc.documentElement) return;
				// (the reader at the page's width, fitted to the window's while no zoom is chosen, A804)
				if (pv.flow && pv.flowFit) pv.flowZoom = flowFitZoom();
				// THE FRAME SCALED, THE PAGE NEVER ZOOMED (#72): laid out 1/zoom of its box and scaled to fill it, so the page
				// inside is set at 100%, as the file is, at every zoom. A CSS zoom on the page relaid its text: 58 pages at 110%
				// to 150% where the book has 61, and a phone draws no text under 8px, so its fit, a fifth, ran twice as long.
				// (TOMBSTONE: "`zoom` rather than a transform", for a transform on the DOCUMENT, which leaves its scrollable
				// area the size it was; this one is on the frame, which scrolls inside itself, so the book's foot is reached.
				// And WS_PREVIEW_ZOOM_FLOOR, a zoom down to three quarters and a shrink below: the half that zoomed is gone.)
				const z = pv.flow ? pv.flowZoom : pv.zoom;
				doc.documentElement.style.removeProperty('zoom');
				if (Math.abs(z - 1) > 0.001) frame.setCssStyles({ width: (100 / z) + '%', height: (100 / z) + '%', transform: 'scale(' + z + ')' });
				else frame.setCssStyles({ width: '', height: '', transform: '' });
			} catch (_) { wsCatch('exportPreviewInto / apply: const doc = frame.contentDocument', _); }
			if (pv.pct) pv.pct.setText(Math.round((pv.flow ? pv.flowZoom : pv.zoom) * 100) + '%');
			if (pv.fitSay) pv.fitSay();
			// A ZOOM RELAYS OUT, so the page the writer was on is at a different
			// `scrollLeft` than it was a moment ago. The PAGE does not change —
			// every length on the sheet scales by the same factor, so the same
			// words fall on the same page — only the number of pixels to it does.
			syncPages();
		};
		// `keep` is false only for Fit, which is a request to stop choosing.
		const setZoom = (z: number, keep?: boolean) => {
			// THE SAME BUTTONS, THE OTHER NUMBER. `+`, `−`, Fit and 100% all come
			// through here, so the reader gets working zoom controls without a
			// second row of them. AND THE READER'S SIZE IS NOT REMEMBERED ON THE
			// PLUGIN: `_exportZoom` is the FIT the writer chose for a page; a
			// reading size is about the text, and storing it there would have one
			// of them overwrite the other every time the reader was opened.
			if (pv.flow) {
				pv.flowZoom = Math.max(0.2, Math.min(2.5, z));
				pv.flowFit = false;
				try { if (this._wsSession) this._wsSession.flowZoom = pv.flowZoom; } catch (_) { wsCatch('exportPreviewInto / setZoom: if (this._wsSession) this._wsSession.flowZoom = flowZoom;', _); }
				apply();
				return;
			}
			pv.zoom = Math.max(0.25, Math.min(2, z));
			if (keep !== false) this._exportZoom = pv.zoom;
			apply();
		};
		// THE FIT FOLLOWS THE FRAME (A803, the writer on the phone: "export doesn't fit the page preview properly when i first
		// open it"): the first paint fits a frame not yet given its size (its column's height comes a frame later, a pane
		// still opening has no width and fits a 640px guess), and nothing fitted again until Fit was pressed. While the
		// writer has not chosen a size (`_exportZoom` null), a change to the frame's box fits the page again; a size they
		// chose stays, and the reader keeps its own
		try {
			const fw = frame.ownerDocument.defaultView || window;
			if (!asText && typeof fw.ResizeObserver === 'function') {
				let box = '';
				const refit = new fw.ResizeObserver(() => {
					if (!frame.isConnected) { refit.disconnect(); return; }
					const now = paperBox.clientWidth + 'x' + paperBox.clientHeight;
					if (now === box) return;
					box = now;
					if (!(paperBox.clientWidth > 0)) return;
					// (the reader follows the window's width the same way, A804)
					if (pv.flow) { if (pv.flowFit) apply(); return; }
					if (this._exportZoom != null || !pv.zoom) return;
					const z = fitZoom();
					if (Math.abs(z - pv.zoom) > 0.005) setZoom(z, false);
				});
				refit.observe(paperBox);
			}
		} catch (_) { wsCatch('exportPreviewInto: the fit follows the frame', _); }

		// ── A STACK OF PAGES, SCROLLED ─────────────────────────────
		//
		// THE DOCUMENT PAGINATES ITSELF: `.flow` is a box one page tall with
		// columns one page wide, so the engine breaks the manuscript and
		// queues the pages sideways. What the reader gets is a STACK, and the
		// two are reconciled here — a pool of sheets, each a copy of that flow
		// scrolled to its own column, laid down the stack in order.
		//
		// WHY COPIES, WHICH IS THE ONE EXPENSIVE THING HERE. A multicol box
		// shows one of its columns at a time and its columns are not elements
		// — there is no arrangement of a single flow that puts two of its
		// pages on screen at once. So a sheet needs its own flow, and the pool
		// is sized to what FITS plus a margin either side: a 213-page book
		// costs a handful of copies, never 213.
		//
		// AND THE SCROLLING IS THE BROWSER'S. The stack is as tall as the
		// book, the frame scrolls it, and nothing here listens for a wheel —
		// better than any handler: keyboard, scrollbar, trackpad momentum and
		// all.
		// ── THE READER ─────────────────────────────────────────────
		//
		// Expanded is SESSION STATE: the reader you left open is open when you
		// come back to the window, and is not after a restart. Read here
		// rather than defaulted, so a pane rebuilt by a redraw comes back the
		// way the writer left it.
		try { pv.flow = !!(this._wsSession && this._wsSession.flow); } catch (_) { wsCatch('exportPreviewInto: flow = !!(this._wsSession && this._wsSession.flow);', _); }
		// ── THE RAIL ───────────────────────────────────────────────
		//
		// IN THE PANE, NOT THE FRAME. Three reasons, in order of weight:
		//
		// • it must not scroll with the text — inside the document it would
		// ride up the page with everything else;
		// • it is furniture, so it wants the plugin's own theme variables,
		// and the frame's stylesheet is a manuscript's, not an app's;
		// • nothing that belongs to the READER should be able to reach the
		// exported file, and the frame's document is what gets written.
		//
		// It reads across the boundary the way the pager already does.
		// WHICH PAGE EACH PARAGRAPH IS ON, captured WHILE THE PAGES EXIST.
		// In flow there are no columns to measure, so the mapping cannot be
		// worked out there — it is taken on the way in, in one pass, and it is
		// EXACT rather than a fraction of the scroll.
		let pageOf: WeakMap<HTMLElement, number> | null = null;
		let pagesTotal = 0;
		let pool: HTMLElement[] = [];
		const docOf = () => {
			try {
				return frame.contentDocument
					|| (frame.contentWindow && frame.contentWindow.document) || null;
			} catch { return null; }
		};
		// ONE PAGE PLUS ONE GUTTER, DOWN the stack and ACROSS the flow. Both
		// are read off the document rather than carried from the stylesheet
		// that wrote them: `--sheet-gap` has one writer, and a second copy of
		// it here would drift the day it changes.
		const metrics = (): WsPoolMetrics | null => wsPreviewMetrics({ docOf });
		// WHERE A SHEET SITS IN THE STACK — in the document's own CSS pixels,
		// which is what `top` takes. The zoom scales the result and leaves
		// these numbers alone, so nothing here has to know about it.
		const topOf = (m: WsPoolMetrics, n: number) => n * m.down;
		// ── THE POOL ────────────────────────────────────────────────────
		//
		// Enough sheets to fill the frame plus one either side, so a page is
		// already drawn before it is scrolled into view. Grown, never shrunk
		// within a paint: a reader who zooms out to see four pages and back
		// in should not pay for the copies twice.
		const wantPool = (m: WsPoolMetrics) => {
			let visible = 1;
			try {
				const h = frame.clientHeight || 0;
				const z = parseFloat(m.doc.documentElement.style.zoom) || 1;
				if (h > 0 && m.down > 0) visible = Math.ceil(h / (m.down * z));
			} catch (_) { wsCatch('exportPreviewInto / wantPool: const h = frame.clientHeight || 0;', _); }
			// CAPPED. Somebody at 25% on a tall screen can see a dozen pages,
			// and a dozen copies of a manuscript is a cost with no reader
			// behind it — beyond the cap the sheets past the pool simply are
			// not there, which reads as blank paper rather than as a hang.
			return Math.max(2, Math.min(8, visible + 2));
		};
		const fillPool = (m: WsPoolMetrics) => {
			const want = wantPool(m);
			// ── THE POOL DIES WITH THE DOCUMENT ──────────────────────
			//
			// `paint` writes the document up to three times, and every write
			// throws away the sheets in it. A pool that only checks whether it is
			// EMPTY then keeps a list of DETACHED nodes for ever — every clone
			// alive in an array and in no document. Anything holding on to what
			// is inside that frame is reapplied after every write, and the test is
			// IDENTITY, not emptiness.
			if (!pool.length || pool[0] !== m.first) pool = [m.first];
			while (pool.length < want) {
				// A CLONE OF THE FIRST, which already holds the manuscript —
				// so the document carries the bytes once however many sheets
				// are on screen. The layout is the cost, and it is paid once
				// per sheet rather than once per page.
				const copy = m.first.cloneNode(true) as HTMLElement;
				copy.dataset.pooled = '1';
				m.stack.appendChild(copy);
				pool.push(copy);
			}
		};
		// THE FIRST PAGE THE POOL SHOWS. One before the reader's, so the page
		// above is already drawn — but never so far along that the pool hangs
		// off the end of the book with half its sheets showing nothing.
		const windowStart = (m: WsPoolMetrics, n: number) => Math.max(0,
			Math.min(n - 1, m.pages - pool.length));

		// ── WHICH PAGE EACH SHEET SHOWS ─────────────────────────────────
		//
		// Recycled by index: a sheet already showing the page it is wanted
		// for is left alone, which is what keeps a scroll from re-laying
		// anything out. Only the sheets that have to move are touched.
		const placeSheets = (m: WsPoolMetrics, from: number) => wsPreviewPlaceSheets({ o, pool, topOf }, m, from);
		// ── THE READ-OUT FOLLOWS THE SCROLL ─────────────────────────────
		//
		// The scroll is the truth: it is the reader's hand, and a read-out
		// that moved it would fight them mid-gesture. `showPage` below is the
		// other direction — the buttons, which land exactly on a page.
		// ── THE PARAGRAPH AT THE TOP, AS AN ELEMENT ──────────────
		//
		// Pages and flow measure position in different units: one is a column
		// index across a box one page wide, the other is a pixel offset down a
		// single column. A NUMBER carried across the flip means nothing on the
		// other side. An element means the same thing in both — and it is the
		// thing the writer is actually looking at.
		//
		// FROM `pool[0]` AND NOWHERE ELSE. The pooled copies are clones with
		// the same content at different scroll offsets, so asking one of them
		// would answer about a page the reader may not be on.
		const topNow = () => wsPreviewTopNow({ metrics, pool, pv });
		// AND PUT THEM BACK ON IT, on the other side of the flip. Read after
		// `flow` has already changed, so each branch is the destination's.
		const topTo = (el: HTMLElement | null) => wsPreviewTopTo({ metrics, pv, showPage }, el);
		// ── THE FLIP. Two classes and nothing else ───────────────
		//
		// One on the iframe's root, which takes away the column rules and the
		// page frame; one on the pane's split, which folds the options column
		// away. NO RENDER, no rewrite of the frame, no second document — the
		// nodes on screen after the flip are the nodes that were there before.
		const flowApply = () => wsPreviewFlowApply({ apply, docOf, host, pv, readFileSay });
		// ── THE PAGE OF EVERY PARAGRAPH, TAKEN ONCE ──────────────
		//
		// `offsetLeft` inside a multicol is the column's own offset, so one
		// division names the page. Read in a single pass with no writes
		// between, so the engine lays out once and every read after that is
		// off the same measurement — 2,000 paragraphs cost one reflow, not two
		// thousand. A WeakMap, so nothing here keeps a document alive after
		// the pane has thrown it away.
		const pageMap = () => {
			try {
				const m = metrics();
				const sheet = pool[0];
				const fl = sheet && sheet.querySelector('.flow');
				if (!m || !fl || !(m.across > 0)) return;
				const map = new WeakMap<HTMLElement, number>();
				const kids = fl.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
				for (const k of kids) {
					map.set(k, Math.floor((k.offsetLeft + 1) / m.across));
				}
				pageOf = map;
				pagesTotal = m.pages;
			} catch (_) { wsCatch('exportPreviewInto / pageMap: const m = metrics();', _); }
		};
		// ── WHICH PAGE THE READER IS ON ──────────────────────────
		//
		// The read-out is in the footer beside the zoom — the same row that
		// says `1 / ~259` in pages. One place for "where am I", whichever
		// mode is up. THE PAGE COUNT IS EXACT AND WEARS NO TILDE: the `~` on
		// the footer is about the DELIVERED FILE — Word lays a .docx out with
		// its own engine — and this number is about the thing on screen, which
		// the preview counted itself. NO OBSERVER: the frame's own scroll
		// event is already listened to, and this rides it.
		//
		// ── JUMPING TO A NOTE ────────────────────────────────────
		//
		// THE TREE IS THE NAVIGATION: it is where the writer already is, it
		// already shows which files are going out, and it is a list of names.
		// BY PATH, not by index: a section's position changes with the sort,
		// the scope and the tick list, and a number captured when the tree was
		// drawn would point at the wrong chapter the moment any of those moved.
		const jumpTo = (path: string) => {
			if (!pv.flow || !path) return false;
			try {
				const doc = docOf();
				const sheet = pool[0];
				const fl = sheet && sheet.querySelector('.flow');
				if (!doc || !fl) return false;
				const esc2 = String(path).replace(/"/g, '\\"');
				const sec = fl.querySelector('section[data-ws-note="' + esc2 + '"]');
				if (!sec) return false;
				const win = doc.defaultView;
				if (!win) return false;
				// THE VIEWPORT'S OWN UNITS, the way the scroll carry does it: a
				// rect and a scroll offset are in the same space `scrollTo` takes,
				// so nothing here has to know the zoom.
				const y = sec.getBoundingClientRect().top + (win.scrollY || 0);
				win.scrollTo(0, Math.max(0, y - 12));
				return true;
			} catch { return false; }
		};
		// ── BACK TO THE PLACE, ONCE THE FRAME IS TALL ENOUGH ─────────
		//
		// The frame's document is written and laid out over a few frames; a
		// `scrollTo` before the text is there is clamped to the top and the
		// place is gone. So the restore waits — up to a dozen short beats —
		// for the document to be tall enough to hold the target, then scrolls
		// once and lets the read-out write the session again.
		const restorePlace = (tries: number) => {
			if (!restoring || !pv.flow) { restoring = false; return; }
			try {
				const doc = docOf();
				const win = doc && doc.defaultView;
				const sheet = pool[0] || (doc && (doc.querySelector('.sheet:not([hidden])') || doc.querySelector('.sheet')));
				const fl = sheet && sheet.querySelector('.flow');
				if (!win || !fl) {
					if (tries > 0) { window.setTimeout(() => restorePlace(tries - 1), 80); return; }
					restoring = false; return;
				}
				let target = flowY0;
				if (flowTop0 && flowTop0.idx >= 0) {
					const kids = fl.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
					const k = kids[flowTop0.idx];
					if (k) target = k.getBoundingClientRect().top + (win.scrollY || 0) - flowTop0.off;
				}
				const max = Math.max(0, ((doc.documentElement && doc.documentElement.scrollHeight) || 0) - (win.innerHeight || 0));
				if (target > max + 2 && tries > 0) { window.setTimeout(() => restorePlace(tries - 1), 80); return; }
				win.scrollTo(0, Math.max(0, Math.min(target, max)));
				restoring = false;
				try { if (this._wsSession) this._wsSession.flowScroll = win.scrollY || 0; } catch (_) { wsCatch('exportPreviewInto / restorePlace: this._wsSession.flowScroll = win.scrollY', _); }
				try { readSay(); } catch (_) { wsCatch('exportPreviewInto / restorePlace: readSay();', _); }
			} catch (_) { restoring = false; wsCatch('exportPreviewInto / restorePlace: const doc = docOf();', _); }
		};
		const restoreArm = () => {
			if (!pv.flow || !(flowY0 > 0 || (flowTop0 && flowTop0.idx >= 0))) return;
			restoring = true;
			let w = null;
			try { const d0 = docOf(); w = d0 && d0.defaultView; } catch { w = null; }
			if (w && w.requestAnimationFrame) w.requestAnimationFrame(() => restorePlace(12));
			else window.setTimeout(() => restorePlace(12), 0);
		};
		// ── WHICH FILE IS AT THE TOP, AND THE FILE LIST ──────────────
		//
		// The sections carry `data-ws-note` (the tree's `jumpTo` reads it), so
		// the file at the top is the last section whose top is at or above the
		// viewport's, and the list is the sections in order. One scroller —
		// `jumpTo` — serves the list, the keys and the tree. THE SHEET AS
		// `metrics` FINDS IT, not as the pool holds it: the pool is filled by
		// the page sync, which needs a laid-out frame, while the file list only
		// needs the sections — and they are in the document the moment it is
		// written.
		const fileSecs = () => {
			try {
				const doc = docOf();
				const sheet = pool[0] || (doc && (doc.querySelector('.sheet:not([hidden])') || doc.querySelector('.sheet')));
				const fl = sheet && sheet.querySelector('.flow');
				return fl ? Array.from<HTMLElement>(fl.querySelectorAll('section[data-ws-note]')) : [];
			} catch { return []; }
		};
		const fileAtTop = () => {
			const secs = fileSecs();
			let hit = secs[0] || null;
			for (const sec of secs) {
				try { if (sec.getBoundingClientRect().top <= 12) hit = sec; else break; } catch { break; }
			}
			return hit ? hit.getAttribute('data-ws-note') : null;
		};
		const fileStep = (by: number) => {
			const secs = fileSecs().map((s) => s.getAttribute('data-ws-note'));
			if (!secs.length) return false;
			const at = secs.indexOf(fileAtTop());
			const to = Math.max(0, Math.min(secs.length - 1, (at === -1 ? 0 : at) + by));
			return jumpTo(secs[to] || '');
		};
		const readFileSay = () => {
			if (!pv.flow || !pv.readFile) return;
			try {
				const secs = fileSecs();
				const want = secs.map((s) => s.getAttribute('data-ws-note')).join('\n');
				if (pv.readFile.getAttribute('data-ws-list') !== want) {
					pv.readFile.empty();
					for (const s of secs) {
						const p = s.getAttribute('data-ws-note');
						const o = pv.readFile.createEl('option', { text: (String(p).split('/').pop() || '').replace(/\.md$/i, '') });
						o.value = p || '';
					}
					pv.readFile.setAttribute('data-ws-list', want);
				}
				const top = fileAtTop();
				if (top !== null && pv.readFile.value !== top) pv.readFile.value = top;
				pv.readFile.toggleClass('is-gone', !secs.length);
			} catch (_) { wsCatch('exportPreviewInto / readFileSay: const secs = fileSecs();', _); }
		};
		const readSay = () => wsPreviewReadSay(this, { docOf, pageOf, pagesTotal, pool, pv, readFileSay, restoring, topNow });
		const flowSet = (on: boolean) => wsPreviewFlowSet(this, { docOf, flowApply, flowY0, pageMap, pv, readSay, syncPages, topNow, topTo }, on);
		const syncPages = () => wsPreviewSyncPages(this, { fillPool, metrics, placeSheets, pv, windowStart });
		const showPage = (n: number) => {
			const m = metrics();
			if (!m) return;
			fillPool(m);
			// CLAMPED AGAINST THE COUNT AS IT IS NOW. An option change can
			// make the book shorter — turning off the title page, or a
			// smaller font — and a remembered page 300 of 240 is a blank
			// frame with no way back.
			const at = Math.max(0, Math.min(m.pages - 1, n));
			// DRAWN BEFORE IT IS SCROLLED TO, or the frame lands on a sheet
			// that has not been given its page yet and shows blank paper for
			// a frame.
			placeSheets(m, windowStart(m, at));
			const z = parseFloat(m.doc.documentElement.style.zoom) || 1;
			try { m.win.scrollTo(0, topOf(m, at) * z); } catch (_) { wsCatch('exportPreviewInto / showPage: m.win.scrollTo(0, topOf(m, at) * z);', _); }
			syncPages();
		};
		// ── AND THE FRAME'S OWN SCROLLBAR DRIVES IT ─────────────────────
		//
		// RE-ARMED AFTER EVERY WRITE, NOT ONCE. `paint` runs three times, and
		// the first runs against a frame still loading `about:blank`; when
		// that load completes the browser swaps the inner window for a fresh
		// one and every listener on it goes with it. The `WindowProxy` the
		// parent holds looks the same, so nothing says so. Removing first is
		// what makes re-arming safe: the same function reference cannot be
		// bound twice, so three paints leave one listener rather than three.
		let readSoon = false;
		const onScroll = () => {
			// ONCE A FRAME, not once an event: a scroll fires dozens of times
			// a second and each read of `scrollWidth` forces the engine to
			// settle the layout before answering.
			if (readSoon) return;
			readSoon = true;
			const doc = docOf();
			const raf = (fn: () => void) => {
				const w = doc && doc.defaultView;
				try { if (w) w.requestAnimationFrame(fn); else fn(); } catch { fn(); }
			};
			raf(() => {
				readSoon = false;
				syncPages();
				// THE READ-OUT RIDES THE SAME EVENT: the scroll is already listened
				// to, already throttled to a frame, and already the moment both
				// read-outs are wrong.
				readSay();
			});
		};
		// ONE STEP PER NOTCH, and the step is proportional: 10% of where you
		// are, so the same gesture feels the same at 60% and at 200%. A fixed
		// 0.1 is a fifth of the way at the bottom of the range and a twentieth
		// at the top.
		// …AND CMD ON A MAC, as the Organizer's zoom and the settings card say;
		// a trackpad's small deltas add up to a notch first (wsWheelStep)
		const wheelAcc: WsWheelAcc = { sum: 0, at: 0 };
		const onWheel = (ev: WheelEvent) => {
			if (!pv.flow || !ev || !(ev.ctrlKey || ev.metaKey)) return;
			try { ev.preventDefault(); } catch (_) { wsCatch('exportPreviewInto / onWheel: ev.preventDefault();', _); }
			const dir = wsWheelStep(wheelAcc, ev.deltaY || 0, Date.now());
			if (!dir) return;
			setZoom(pv.flowZoom * (1 + dir * 0.1));
		};
		const armScroll = () => {
			if (asText) return;
			let win = null;
			try { win = frame.contentWindow; } catch (_) { wsCatch('exportPreviewInto / armScroll: win = frame.contentWindow;', _); }
			if (!win) return;
			try { win.removeEventListener('scroll', onScroll); } catch (_) { wsCatch('exportPreviewInto / armScroll: win.removeEventListener(\'scroll\', onScroll);', _); }
			try { win.addEventListener('scroll', onScroll, { passive: true }); } catch (_) { wsCatch('exportPreviewInto / armScroll: win.addEventListener(\'scroll\', onScroll, passive: true );', _); }
			// ── CTRL+WHEEL SIZES THE TEXT ────────────────────────────
			//
			// The gesture every reader already has in their hands. NOT PASSIVE,
			// and it has to be: without `preventDefault` the browser takes the
			// gesture and zooms its own page instead — the one case this file's
			// rule about passive listeners does not cover. AND ONLY WITH CTRL, AND
			// ONLY IN THE READER. A bare wheel is scrolling and must stay
			// scrolling; in pages the zoom is a page FIT, and a writer nudging it
			// by accident would lose the fit they chose with no way of knowing
			// what happened.
			try { win.removeEventListener('wheel', onWheel); } catch (_) { wsCatch('exportPreviewInto / armScroll: win.removeEventListener(\'wheel\', onWheel);', _); }
			try { win.addEventListener('wheel', onWheel, { passive: false }); } catch (_) { wsCatch('exportPreviewInto / armScroll: win.addEventListener(\'wheel\', onWheel, passive: false );', _); }
		};

		// Written through the document rather than `srcdoc`: srcdoc has to be
		// HTML-escaped whole, and a manuscript is full of quotes and
		// ampersands — one escaping mistake there turns a page of prose into
		// markup on screen. The click wiring goes on the frame's document,
		// once — the document persists across paints (the swap below keeps
		// it), so the wiring's latch lives on it.
		// THE NOTES AT THE FOOT OF THEIR PAGE (#72), placed once the paints below have settled: each swaps the page in, and
		// placing is the costly part (0.64 s for 375 pages and 520 notes, measured in Edge). The pooled copies were made
		// from the page before the notes moved: they go first (a copy is a whole book every layout would pay for), and
		// the pool fills again from the page as it now stands; the reader's seams and the contents' pages are read again
		let footTimer = 0;
		const footSoon = () => {
			if (footTimer) window.clearTimeout(footTimer);
			footTimer = window.setTimeout(() => {
				footTimer = 0;
				const doc = docOf();
				if (!doc || !doc.documentElement || !doc.documentElement.hasAttribute('data-ws-fnfoot')) return;
				for (const c of pool.slice(1)) c.remove();
				pool = [];
				try { wsFootNotes(doc); } catch (_) { wsCatch('exportPreviewInto / footSoon: wsFootNotes(doc)', _); }
				pageMap();
				syncPages();
				if (pv.flow) { try { wsPageStarts(doc); wsTocPagesFill(doc); } catch (_) { wsCatch('exportPreviewInto / footSoon: the reader', _); } }
			}, 40);
		};
		const paint = () => wsPreviewPaint(this, { apply, applyDark, armScroll, asText, docOf, fileStep, fitZoom, flowApply, flowSet, footSoon, frame, html, pv, restoreArm, syncPages, topTo });
		// ── WRITTEN BEFORE THE EMPTY FRAME CAN BE PAINTED ───────────────
		//
		// An option change rebuilds the pane, so a NEW iframe is created, and
		// handing the writing of its document to a later tick lets the browser
		// paint the blank one in between — a flash on every change. An iframe
		// that is already in the document has a `contentDocument` the moment
		// it exists, so there is nothing to wait for. SO IT IS WRITTEN NOW.
		//
		// THE OTHER TWO STAY: `load` fires when the doctype shell lands — a
		// fresh, standards-mode document in place of the about:blank one the
		// first paint went into — and paints it; the timeout covers a browser
		// that hands back a document only after a tick. `paint` is idempotent
		// — it swaps in the same page — so running it three times costs a
		// swap and guarantees the frame is never left empty by whichever of
		// the three does not fire.
		paint();
		frame.addEventListener('load', paint);
		window.setTimeout(paint, 0);

		// THREE GROUPS, LEFT TO RIGHT: the PAGES (‹ 1 / ~4 ›), the ZOOM (−
		// 100% + and one Fit/100% toggle), the VIEW (Dark, Expand, Refresh,
		// and the file list the reader shows). A glyph on every control but
		// the two that name an act — Expand/Collapse keeps its word and Export
		// is the CTA — and every glyph-only button says its name for the
		// pointer and the reader (`title`, `aria-label`); the toggles say
		// which way they are (`aria-pressed`).
		const foot = body.createDiv({ cls: 'ws-export-prevfoot' });
		const iconBtn = (into: HTMLElement, cls: string, names: string[], glyph: string, aria: string, fn: (ev: MouseEvent) => void) => {
			const b = into.createEl('button', { cls: 'ws-export-mini ws-export-ico ' + cls });
			wsIconInto(b, names, glyph);
			b.setAttribute('aria-label', aria);
			b.title = aria;
			b.addEventListener('click', fn);
			return b;
		};
		// A MARKDOWN PREVIEW HAS NO PAGE TO FIT, so it has no zoom: the
		// controls would be there to shrink a column of plain text, which
		// is a thing a reader can do to no purpose.
		wsPreviewFlipper(this, { apply, applyDark, asText, docOf, fitZoom, flowApply, flowSet, foot, iconBtn, jumpTo, o, onRefresh, pv, setZoom, showPage });
		// (TOMBSTONE (A872): the preview's own Export button, drawn only for a caller that passed `onExport`, and none did:
		// the pane has its own, and one act offered twice on a screen asks which one is the real one)
		// ── AND A WAY IN ─────────────────────────────────────────
		//
		// This returns the body element, and it carries the jump as well, so
		// the file tree can ask the reader to go to a note.
		try { body.wsJumpTo = jumpTo; } catch (_) { wsCatch('exportPreviewInto: body.wsJumpTo = jumpTo;', _); }
		return body;
	},

	// The compiled markdown, shown as the file it will be: monospaced,
	// wrapped, on the editor's own surface. Not rendered — a rendered
	// preview would hide the `#` dividers and the heading marks, which are
	// the whole of what a writer checks in a compiled .md.
	// ── AND IT FOLLOWS THE THEME ───────────────────────
	//
	// An iframe is a document of its own and inherits none of the host's
	// custom properties, so the value is READ OFF THE HOST and written
	// in: the theme's own editor surface and text colour, which is what a
	// writer looking at Markdown source expects to see it in. A literal
	// dark surface was a black box in a light window.
	//
	// `color-scheme` GOES WITH THEM, so the frame's scrollbar and any
	// default-coloured chrome match the sheet rather than the app's idea
	// of a fresh document.
	exportPreviewMarkdown(this: WordSmith, md: string) {
		const esc = (t: string) => String(t == null ? '' : t)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		let dark = false, bg = '#ffffff', ink = '#1f1f1f';
		try {
			dark = document.body.classList.contains('theme-dark');
			const cs = getComputedStyle(document.body);
			const b = cs.getPropertyValue('--background-primary');
			const t2 = cs.getPropertyValue('--text-normal');
			if (b && b.trim()) bg = b.trim();
			if (t2 && t2.trim()) ink = t2.trim();
		} catch (_) { wsCatch('exportPreviewMarkdown: dark = document.body.classList.contains(\'theme-dark\');', _); }
		return '<!doctype html><html><head><meta charset="utf-8"><style>'
			+ ':root { color-scheme: ' + (dark ? 'dark' : 'light') + '; }'
			+ 'html, body { margin: 0; background: ' + bg + '; }'
			+ 'pre { margin: 0; padding: 18px 20px; color: ' + ink + ';'
			+ ' font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;'
			+ ' font-size: 12px; line-height: 1.6;'
			+ ' white-space: pre-wrap; word-break: break-word; }'
			+ '</style></head><body><pre>' + esc(md) + '</pre></body></html>';
	},

	// AN E-BOOK (A612): the web page's document, cut into a book by `wsBuildEpub`. Its
	// contents are the entries the web page's own Contents lists, at the same levels, and
	// its language is the one Word-Smith reads (Prose → Language).
	exportToEpub(this: WordSmith, sections: WsExportSection[], o: WsExportRun) {
		const stepOf = wsTocSteps(o, sections), nums = wsHeadNumbers(o, sections);
		// (the book's own folder in the text, never in the contents: A848)
		const nav = sections.map((sec: WsExportSection, i: number) => ({ id: wsAnchorId(sec.title, i), label: sec.title && !sec.book ? wsNumbered(nums[i], sec.title) : '', level: stepOf(sec) }))
			.filter((e) => !!e.label);
		return wsBuildEpub(this.exportToHtml(sections, o, false), {
			title: o.title || wsTIn(o.lang, 'Untitled'), author: o.author || '', lang: this.settings.language || 'en',
			nav, indent: o.indent !== false, paraBlank: wsParaSpacing(o) === 'line', paraHalf: wsParaSpacing(o) === 'half', tocTitle: wsTocTitle(o), centerHeads: o.centerHeads !== false,
		});
	},

	exportToHtml(this: WordSmith, sections: WsExportSection[], o: WsExportRun, forScreen: boolean) {
		const esc = (t: string) => String(t == null ? '' : t)
			.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		const parts: string[] = [];
		// TRUE FOR EXACTLY ONE SECTION: the file that comes straight after a
		// folder heading, which is already on a page of its own.
		let heldPage = false;
		// A FOLDER'S HEADING, CARRIED to the top of the next file rather than
		// printed on a sheet of its own. `pendingBreak` is whether that file
		// should open a page — the folder decided it, and the file is the one
		// that acts on it.
		let pendingFolder = '';
		let pendingBreak = false;
		// the notes gathered for the back, in the order the text first cites them
		const notesOut: string[] = [];
		if (o.titlePage) {
			// your contact lines in its top left corner (#81, the writer's pick "Contact block"); not in an e-book, a reading copy
			const contact = o.format === 'epub' ? [] : wsContactLines(o), sub = String(o.subtitleText || '').trim();
			parts.push('<section class="page tp">'
				+ (contact.length ? '<div class="tpcontact">' + contact.map((l) => '<p>' + esc(l) + '</p>').join('') + '</div>' : '')
				+ '<div class="tpinner">'
				+ '<h1>' + esc(o.title || wsTIn(o.lang, 'Untitled')) + '</h1>'
				// the subtitle under it (the writer: "also add subtitle for the title page")
				+ (sub ? '<p class="tpsub">' + esc(sub) + '</p>' : '')
				+ (o.author ? '<p>' + esc(wsTIn(o.lang, 'by {author}', { author: o.author })) + '</p>' : '')
				+ (o.wordCount != null && o.wordCountOnTitle !== false
					? '<p>' + esc(wsTitleWords(o)) + '</p>' : '')
				+ '</div></section>');
		}
		if (o.toc && sections.length > 1) {
			parts.push('<section class="page"><h2>' + esc(wsTocTitle(o)) + '</h2><ol class="toc">');
			// EACH ENTRY'S PAGE (A751), where there are pages: measured before a file is written, filled in by the preview
			const tocPg = wsFormatHasPages(o.format || 'docx');
			const pageOf = o.tocPageOf || {};
			// INDENTED BY THE LEVEL THE ENTRY WILL CARRY. A CLASS, not an
			// inline style: this markup is also what the print path lays out,
			// and an indent a stylesheet cannot reach is one a page size
			// cannot adjust.
			const stepOf = wsTocSteps(o, sections);
			// (the structure's numbers, #79)
			const tocNums = wsHeadNumbers(o, sections);
			sections.forEach((sec: WsExportSection, i: number) => {
				// (the book's own folder in the text, never in the contents: A848)
				if (sec.book) return;
				const lv = stepOf(sec);
				parts.push('<li class="l' + lv + '"><a href="#'
					+ wsAnchorId(sec.title, i) + '">'
					+ esc(wsNumbered(tocNums[i], sec.title || ('Section ' + (i + 1)))) + '</a>'
					+ (tocPg ? '<span class="lead"></span><span class="pg">' + (pageOf[wsAnchorId(sec.title, i)] || '') + '</span>' : '')
					+ '</li>');
			});
			parts.push('</ol></section>');
		}
		let bibAt = -1;
		// (the structure's numbers, #79)
		const nums = wsHeadNumbers(o, sections);
		sections.forEach((sec: WsExportSection, i: number) => {
			// the list of sources waits for the notes (A572 step 4)
			if (sec.bib) { bibAt = i; return; }
			// ── A FOLDER HEADING OPENS A PAGE, AND KEEPS ITS FIRST CHAPTER ──
			//
			// THREE STATES, AND EACH FIXED THE LAST ONE'S REAL FAULT:
			//
			// 1. no break at all — "Part Two" printed under the last
			// paragraph of the previous chapter.
			// 2. a section of its own — which broke correctly, but `.page`
			// carries `min-height: 11in`, so the heading got a whole sheet
			// and the chapter began on the next one. Two near-empty pages.
			// 3. this: the break happens, and the heading is emitted INSIDE
			// the following file's section, at the top of it.
			//
			// `heldPage` does half of this: it exists so the file after a folder
			// does not open a SECOND page. The heading is carried rather than
			// printed, and the section that would have held it alone is never
			// opened. A FOLDER WITH NOTHING UNDER IT still gets its heading — see
			// the flush after the loop. Losing a heading because a folder happened
			// to be last would be a silent hole in the manuscript.
			if (sec.folder) {
				const lv = Math.min(6, sec.depth || 1);
				const fbrk = !!(i > 0 || o.titlePage || o.toc) && o.pageBreaks !== false;
				// A FOLDER OF FOLDERS (A848): the headings carried ADD UP, each tight against the one below it, and the first
				// decides the page. One written over the last lost "Part One" above its first chapter's folder
				if (pendingFolder) pendingFolder = pendingFolder.replace(/class="folderhead"/g, 'class="folderhead is-tight"');
				else pendingBreak = fbrk;
				pendingFolder += '<h' + lv + ' class="folderhead" id="'
					+ wsAnchorId(sec.title, i) + '">' + esc(wsNumbered(nums[i], sec.title)) + '</h' + lv + '>';
				return;
			}
			if (o.starBetween && i > 0) {
				parts.push('<p class="div">' + esc(wsJoinMark(o)) + '</p>');
			}
			// Each file opens a page when page breaks are on; otherwise the prose
			// simply runs on, which is what "continuous" means. …EXCEPT THE FILE
			// THAT FOLLOWS A FOLDER HEADING, which has just had a page opened for
			// it. A CARRIED HEADING DECIDES THE BREAK: the folder worked out
			// whether a page was owed; this section is the one that opens it, and
			// then prints the heading at the top of itself.
			const brk = pendingFolder
				? pendingBreak
				: (!heldPage
					&& (i > 0 || o.titlePage || o.toc) && o.pageBreaks !== false);
			heldPage = false;
			// ── AND WHICH NOTE IT IS, ON SCREEN ONLY ─────────────
			//
			// The tree knows a path; the reader has to be able to find the section
			// that path became. `forScreen` ONLY, and that is the whole care here:
			// this one function renders the preview AND the file, so an attribute
			// added without the gate would put vault paths into every .html and
			// .pdf a writer sends anybody. The exported bytes are unchanged, and a
			// test checks that rather than trusting this comment.
			const note = (forScreen && sec.path) ? (' data-ws-note="'
				+ esc(sec.path) + '"') : '';
			parts.push('<section class="' + (brk ? 'page' : 'run')
				+ '" id="' + wsAnchorId(sec.title, i) + '"' + note + '>');
			// what a --- opens when it starts a new page (A502): a page-section, the
			// break the preview and every page target already know
			const pageOpen = '<section class="page"' + note + '>';
			if (pendingFolder) {
				// ── AND IT SITS TIGHT AGAINST THE HEADING BELOW IT ──────────
				//
				// A folder heading's bottom margin collapsing with the file heading's
				// top one left 11px of air between them. MARKED HERE RATHER THAN ASKED
				// IN CSS, because the question is "is a heading about to follow" and
				// only this line knows: the stylesheet has no previous-sibling
				// selector, and `:has()` is banned in this repo. A FOLDER HEADING
				// FOLLOWED BY PROSE KEEPS ITS AIR: the class is only added when a file
				// heading really comes next.
				const tight = !!(o.sectionTitles && sec.title);
				parts.push(tight
					? pendingFolder.replace('class="folderhead"',
						'class="folderhead is-tight"')
					: pendingFolder);
				pendingFolder = '';
				pendingBreak = false;
			}
			if (o.sectionTitles && sec.title) {
				const fl = wsFileHeadLevel(o, sec);
				parts.push('<h' + fl + '>' + esc(wsNumbered(nums[i], sec.title)) + '</h' + fl + '>');
			}
			let md = String(sec.markdown || '');
			// The note's own headings move down under the folder's, or under the file's name with Both — see
			// `wsNoteHeadings`, and the markdown target, which does the same.
			md = wsNoteHeadings(o, sec, md);
			const fm = md.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
			if (fm) {
				md = md.slice(fm[0].length);
				// Verbatim and monospaced, because it is data — the same
				// decision the .docx makes.
				if (o.keepFrontmatter) parts.push('<pre class="fm">' + esc(fm[0].trim()) + '</pre>');
			}
			o.imgs = sec.images || null;
			// NOTES (#46): a marker numbered in order of first use across the
			// book, its note gathered for the back; a label is its note's own.
			const defs = wsNotesKept(wsFootnoteDefs(md), o);
			const ids = new Map<string, number>();
			o.noteRef = (label: string) => {
				const text = defs.get(label);
				if (text == null) return null;
				let n = ids.get(label);
				if (!n) {
					n = notesOut.length + 1;
					ids.set(label, n);
					notesOut.push('<li id="fn-' + n + '">' + wsRunsHtml(text, Object.assign({}, o, { noteRef: null })) + '</li>');
				}
				return { n, end: true };
			};
			wsHtmlBlocks(md, o, pageOpen, parts);
			o.noteRef = null;
			// a --- with nothing after it opens no empty page
			if (parts[parts.length - 1] === pageOpen && parts[parts.length - 2] === '</section>') parts.length -= 2;
			parts.push('</section>');
		});
		// A FOLDER WITH NOTHING AFTER IT still prints its heading. The heading
		// is carried to the next file, and if there is no next file the carrier
		// would simply be dropped — a folder silently missing from the
		// manuscript, which is worse than the sheet-of-its-own this replaced.
		if (pendingFolder) {
			parts.push('<section class="' + (pendingBreak ? 'page' : 'run') + '">');
			parts.push(pendingFolder);
			parts.push('</section>');
			pendingFolder = '';
			pendingBreak = false;
		}
		// THE NOTES, at the back on a page of their own, each where its number
		// in the text links to (#46). A PDF keeps them here: notes at the foot of
		// a printed page would mean laying the pages out ourselves.
		if (notesOut.length) {
			parts.push('<section class="page notes"><h2>' + esc(wsTIn(o.lang, 'Notes')) + '</h2><ol class="notes">' + notesOut.join('') + '</ol></section>');
		}
		// THE LIST OF SOURCES (A572 step 4), after the notes as Chicago has it: a page of its own under the style's
		// heading, each entry hanging, its titles in italics
		if (bibAt >= 0) {
			const b = sections[bibAt];
			parts.push('<section class="page bib" id="' + wsAnchorId(b.title, bibAt) + '"><h2>' + esc(b.title) + '</h2>'
				+ (b.entries || []).map((e) => '<p class="bib">' + wsRunsHtml(e, o) + '</p>').join('') + '</section>');
		}

		// ONE LINE HEIGHT, read twice: by the body and by the title page's
		// drop, which is eight of these lines because the .docx drops eight
		// empty paragraphs. Two copies of this number would put the title in
		// two places.
		const lineH = ({ 240: '1.45', 360: '1.7', 480: '2' }[wsLineTwips(o)] || '2');
		const head = o.runningHeader ? esc(o.runningHeader) : '';
		const pnAt = wsPageNumAt(o, true), side = wsHeadSide(o);
		const font = JSON.stringify(o.font || 'Times New Roman');
		const pt = o.pt || 12;
		// The same table the .docx and the RTF read, so the sheet on screen
		// is the sheet in the file — including its margins, which travel
		// with the paper because an inch of white on a 5.5-inch page is a
		// different decision from an inch on Letter.
		const paper = wsPaperOf(o);
		const pw = wsTwipIn(paper.w), ph = wsTwipIn(paper.h), pm = wsTwipIn(paper.mar);
		// THE CONTENT BOX, which is the page the preview paginates into.
		// Written as a `calc` off the same three lengths rather than worked
		// out here: one writer for the paper, and a margin changed in
		// `WS_PAPERS` cannot leave a stale number behind in this file.
		const cw = 'calc(' + pw + ' - 2 * ' + pm + ')';
		const ch = 'calc(' + ph + ' - 2 * ' + pm + ')';
		// Air between paragraphs when there is no indent to separate them —
		// see wsStylesXml. Half a line, matching the .docx's 120 twips.
		// (a whole line when asked, A756: `lh`, the paragraph's own line height)
		// (your blank lines past the first are paragraphs of their own, `p.blank`: the writer, "show the blank lines in preview
		// and expanded view too"; always since A849)
		// (the space between paragraphs, `wsParaSpacing`: one line, half of one, or Auto)
		const paraSp = wsParaSpacing(o);
		const pgap = paraSp === 'line' ? '1lh' : paraSp === 'half' ? '0.5lh' : o.indent === false ? '0.5em' : '0';
		// (THE READER'S SEAMS read the running header, where the number goes and whether a title page leads, A804: on the
		// preview's root, never in a file)
		return '<!doctype html><html' + (forScreen ? ' data-ws-head="' + (o.runningHeader ? esc(o.runningHeader).replace(/"/g, '&quot;') : '') + '" data-ws-pn="' + pnAt + '"' + (side === 'left' ? ' data-ws-hside="left"' : '') + (o.titlePage ? ' data-ws-tp=""' : '')
			// A WORD FILE'S NOTES AT THE FOOT OF THEIR PAGE (#72): `wsFootNotes` moves them there once the page is laid out
			+ ((o.format || 'docx') === 'docx' && o.footnotePlace !== 'end' && notesOut.length ? ' data-ws-fnfoot=""' : '') : '')
			// (A846: the book's language, and right to left where it is written so)
			+ (o.lang ? ' lang="' + esc(o.lang) + '"' : '') + (wsIsRtl(o.lang) ? ' dir="rtl"' : '')
			+ '><head><meta charset="utf-8">'
			+ '<title>' + esc(o.title || 'Manuscript') + '</title><style>'
			// ── THE MARGIN BOX IS THE PRINTED HEADER ────────────────────
			//
			// A MARGIN BOX IS THE ONLY THING THAT CAN PAINT IN THE MARGIN. The
			// `.page::before` below is `position: absolute` inside `.page`, and in
			// the PRINTED document `.page` carries no padding — the sheet's white
			// space is the `@page` margin, which is outside the element — so a
			// header drawn there lands half a margin DOWN INTO THE PROSE. And a
			// margin box renders ONLY when printing. SO EACH MEDIUM KEEPS THE ONE
			// THAT WORKS IN IT, and neither document carries both: this box prints
			// and is inert on screen; the `::before` is emitted only for the
			// preview, where `.page` IS a padded sheet and the header lands in its
			// white space. `size` and `margin` are what makes the document
			// printable at the manuscript's paper from any browser, and
			// `preferCSSPageSize` in `exportPdfOptions` reads them.
			// (the margin boxes in a rule of their own at the foot of the sheet, A751: see there)
			+ '@page { size: ' + pw + ' ' + ph + '; margin: ' + pm + '; }'
			// DECLARED LIGHT. A page is white, and an iframe inherits the
			// app's colour scheme — so under a dark theme the engine was
			// treating this document as dark and everything that had not
			// been given an explicit colour came out inverted: form
			// controls, scrollbars, the default canvas behind a page that
			// had not painted yet. Saying so once here stops a manuscript
			// being previewed in a colour nobody chose.
			+ ':root { color-scheme: light; }'
			// ── THE DESK THE SHEET SITS ON ─────────────────────────
			//
			// THE THEME'S OWN SECONDARY SURFACE, so the frame belongs to the
			// window it is inset into rather than to a photograph of a desk — and
			// it follows a writer who changes theme, which a literal hex never
			// did. RESOLVED HERE, NOT PASSED AS A VARIABLE: the preview is an
			// IFRAME, a document of its own, and inherits none of the host's
			// custom properties, so `var(--background-secondary)` inside it is
			// simply unset. Read it off the host and write the value in.
			+ 'html { background: ' + (forScreen ? wsHostTint() : '#fff') + '; }'
			// THE LIT BLOCK, on screen only: the file never carries it.
			+ (forScreen ? 'html.is-flow .is-here { background: rgba(127, 127, 127, 0.14); box-shadow: 0 0 0 4px rgba(127, 127, 127, 0.14); border-radius: 2px; }' : '')
			+ 'body { margin: 0; padding: ' + (forScreen ? '18px 0' : '0') + ';'
			+ ' font-family: ' + font + ', Times, serif; font-size: ' + pt + 'pt;'
			// The same three answers the .docx sets, as CSS multiples: 240
			// twips is one line, so the ratio is the twips over 240 — with
			// a little air added to single, because a printed page at a
			// flat 1 is tighter than any word processor actually sets it.
			+ ' line-height: ' + lineH + ';'
			+ ' color: #111; }'
			// THE PAGE ITSELF, on screen: a letter-width sheet with inch
			// margins and a shadow. It is the same box print uses, so the
			// preview is not an impression of the output — it is the
			// output, shown on a desk instead of on paper.
			+ '.page, .run { background: #fff; }'
			// ── THE RUNNING HEADER, AS SOMETHING THAT ACTUALLY DRAWS ───
			//
			// The `@page` margin box above is a PRINT box: Chromium draws none of
			// them on screen, so the preview needs a header of its own. It is one
			// element, told the real page by the pane that scrolls it — a
			// per-section pseudo-element would draw the header inside the prose,
			// once per file, wherever that file happened to start, and a
			// `counter(sheet)` counted FILES, so a forty-page chapter said the
			// same number on all forty of its pages.
			//
			// NOT ON THE TITLE PAGE, because the .docx does not put it there:
			// `wantFirst = runningHeader && titlePage` writes `w:titlePg` and a
			// separate empty first-page header. SCREEN ONLY: in the printed
			// document it has no padding to sit in and lands in the prose.
			// NOT ON THE TITLE PAGE, which is why the pane empties it rather than
			// hiding the box: `w:titlePg` in the .docx gives the first sheet a
			// separate empty header, and the preview is meant to be the sheet in
			// the file.
			// THE NUMBER IN A BOX OF ITS OWN when it is not beside the header (A751), where it prints
			+ (forScreen && pnAt !== 'top-' + side && pnAt !== 'none'
				? '.pnum { position: absolute; ' + (pnAt.startsWith('top') ? 'top' : 'bottom') + ': calc(' + pm + ' / 2);'
					+ (pnAt.endsWith('center') ? ' left: 0; right: 0; text-align: center;' : pnAt.endsWith('left') ? ' left: ' + pm + ';' : ' right: ' + pm + ';')
					+ ' font-size: 0.9em; color: inherit; }' : '')
			+ ((head || pnAt === 'top-' + side) && forScreen
				? '.hdr { position: absolute; top: calc(' + pm + ' / 2); ' + side + ': ' + pm + ';'
					// INHERITED, NOT PINNED: a pinned #111 on a dark sheet is the header
					// present and unreadable. One writer for the ink: `inherit` walks to
					// the sheet and on to the body, which is the element the dark toggle
					// moves.
					+ ' font-size: 0.9em; color: inherit; }' : '')
			// ── PAGES, NOT ONE VERY LONG SHEET ───────────────────────
			//
			// A `min-height` is a floor, not a page: each file as one `.page`
			// section given the paper's width and AT LEAST its height is a
			// forty-page chapter on one sheet forty pages tall. NO BROWSER RENDERS
			// PAGED MEDIA ON SCREEN, so nothing paginates unless this plugin does.
			//
			// SO THE ENGINE IS ASKED TO DO THE BREAKING, which it can: a box
			// exactly one content-height tall, with columns exactly one
			// content-width wide and `column-fill: auto`, fills column one to the
			// bottom of the page and starts column two. EVERY COLUMN IS A PAGE,
			// and orphans, widows and `break-before` come with it for nothing. The
			// pane scrolls the box sideways to show one. AND IT COSTS ONE LAYOUT
			// OF THE TEXT — the measuring alternative, a hidden galley with block
			// heights summed, is a second layout engine to keep.
			//
			// SCREEN ONLY. `forScreen` is false for the .html file and for the
			// .docx's source, and both keep the page-break rules at the foot of
			// this branch. A column rule reaching a file is a manuscript in
			// columns.
			+ (forScreen
				// ── A STACK OF SHEETS, SCROLLED ────────
				//
				// THE STACK IS THE SCROLLER. Its height is the whole book, the sheets
				// are positioned inside it, and the FRAME'S OWN SCROLLBAR moves
				// through them — it costs no wheel handler at all: the browser scrolls
				// a document better than any listener can.
				//
				// ONLY THE SHEETS IN VIEW EXIST. A multicol box shows ONE of its
				// columns at a time and its columns cannot be pulled apart, so two
				// pages side by side means two flows. The pane therefore keeps a small
				// POOL of sheets, each a copy of the flow scrolled to its own column,
				// and recycles them as the reader moves. A 213-page book is a handful
				// of copies, not 213.
				//
				// `--sheet-gap` IS DECLARED HERE AND READ BY THE PANE, so the air
				// between sheets has one writer.
				// (and `--page-ch`, the text's height on a page, which the reader's pages are made up to: `wsSeamFill`)
				? ':root { --sheet-gap: 18px; --page-ch: ' + ch + '; }'
					// THE NOTES AT THE FOOT OF THEIR PAGE (#72) as Word's FootnoteText sets them: single spaced (this sheet's
					// single), two points smaller, the number raised, under Word's short rule; a page's block closing its
					// page. A paragraph cut for them goes on unindented, its first half's last line set full
					+ '.fnfoot { break-after: column; text-indent: 0; font-size: ' + (Math.max(8, pt - 2) / pt).toFixed(4) + 'em; line-height: 1.45; }'
					+ '.fnfoot::before { content: ""; display: block; width: 2in; max-width: 33%; border-top: 1px solid currentColor; opacity: 0.6; margin: 0 0 0.35em; }'
					+ '.fnfoot p.fn { margin: 0; text-indent: 0; }'
					// (and a paragraph cut where a page begins, for the reader, `wsPageCut`: the same, and joined again)
					+ 'p.fncont, p.pgcont { text-indent: 0; } p.fnsplit, p.pgsplit { margin-bottom: 0;' + (o.justify ? ' text-align-last: justify;' : '') + ' }'
					// (the placing's own: a box of the column's width to weigh a block in, a sheet out of sight to lay pages in)
					+ '.fnmeasure { position: absolute; left: 0; top: 0; visibility: hidden; width: ' + cw + '; }'
					+ '.sheet[data-ws-scratch] { visibility: hidden; left: -30000px; } .flow.is-placing { display: none; }'
					+ '.seam-probe { position: absolute; visibility: hidden; width: 1px; height: var(--page-ch); }'
					+ '.stack { position: relative; width: ' + pw + '; margin: 0 auto; }'
					+ '.sheet { position: absolute; left: 0; top: 0;'
					+ ' box-sizing: border-box;'
					+ ' width: ' + pw + '; height: ' + ph + '; padding: ' + pm + ';'
					+ ' background: #fff;'
					+ ' box-shadow: 0 2px 10px rgba(0,0,0,0.45); }'
					// OUT OF FLOW WHETHER OR NOT THERE IS A HEADER TO DRAW, and the box is
					// in the markup either way so the pane has one thing to find. An empty
					// block is zero tall, so the rule is about the LAYOUT rather than the
					// contents: the flow box begins at the top of the sheet's content area
					// whatever the overlay ever comes to hold, and `height: 100%` resolves
					// against the sheet rather than against what is left of it.
					+ '.hdr, .pnum { position: absolute; }'
					// THE COLUMN IS THE PAGE. `height: 100%` of a parent with a
					// definite height is itself definite, which is what
					// `column-fill: auto` requires — without it the engine
					// BALANCES, and a balanced column is a page as tall as the
					// manuscript divided by however many columns it felt like.
					//
					// NO `column-count`. Count is left auto so the used count is
					// one and the rest of the pages overflow to the right, where
					// the pane can scroll to them. Setting it to 1 would put the
					// whole manuscript in one column and paginate nothing.
					//
					// `overflow: hidden` AND NOT `clip`: hidden still makes a
					// scroll container, so `scrollLeft` moves it; clip does not,
					// and the flipper would have nothing to hold on to.
					+ '.flow { height: 100%; column-width: ' + cw + ';'
					+ ' column-gap: ' + pm + '; column-fill: auto;'
					+ ' overflow: hidden; }'
					// THE SECTIONS STOP BEING SHEETS. They keep their identity —
					// `.page` still means "this file opens a page" — and hand the
					// paper, the margins and the shadow to the one box above.
					+ '.page, .run { background: none; box-shadow: none;'
					+ ' width: auto; margin: 0; padding: 0; min-height: 0; }'
					+ '.page { break-before: column; }'
					+ '.page:first-child { break-before: avoid; }'
					// A TITLE PAGE IS A WHOLE PAGE, and it centres its three
					// lines in one — which needs a height to centre in. It had
					// `min-height` from `.page`; now it is told the content box
					// AS A LENGTH, because a percentage height inside a multicol
					// resolves against nothing an engine agrees about.
					+ '.tp { height: ' + ch + '; }'
					// (the contact lines in the page's corner, the title still centered in the page: #81)
					+ '.tp { position: relative; } .tp > .tpcontact { position: absolute; top: 0; inset-inline-start: 0; margin: 0; }'
					// ── AND THE SAME DOCUMENT, READ AS ONE TEXT ──────
					//
					// The reader is not a second render. Everything above stays exactly
					// as it is and `html.is-flow` takes two things away: the column rules
					// and the page frame. Nothing is rebuilt, no node is replaced, and
					// collapsing puts both back. THIS IS THE PRINT LAYOUT ON SCREEN: the
					// print block below does the same three things for paper. What flow
					// adds is a measure and the dark ground — print wants neither.
					+ 'html.is-flow .stack { width: auto; height: auto !important; }'
					// THE CLONES GO. The pane keeps up to eight copies of this flow, each
					// scrolled to its own column, because a multicol box shows one column
					// at a time. In flow there are no columns, so the copies are eight
					// identical manuscripts down the page. HIDDEN, NOT REMOVED: the pane
					// owns that pool and removing them here would leave it holding
					// detached nodes it still counts. `[data-pooled]` is the stamp
					// `fillPool` puts on every copy it makes, so the original is the one
					// that stays.
					+ 'html.is-flow .sheet[data-pooled] { display: none; }'
					// ONE LONG SHEET (A569, the writer's look 4): the paper's width, its own
					// margins and a shadow, on a darker ground, as page mode draws a note; a
					// narrow pane narrows it rather than scrolling sideways. The paper keeps
					// its colour (`background: none` once put #111 text on the frame's dark).
					+ 'html.is-flow { --ground: #6b6e72; background: var(--ground); } html.is-dark.is-flow { --ground: #121315; }'
					// THE PAGE'S WIDTH KEPT (A804, the writer: "the expanded view doesn't care about what page I set it just wraps
					// the text to the zoom size"): no cap at the window, so a line holds what the page's line holds at every zoom;
					// the reader opens fitted to the window's width, and a zoom past that scrolls sideways
					+ 'html.is-flow .sheet { position: static; width: ' + pw + '; max-width: none;'
					+ ' height: auto; margin: 36px auto; padding: 0; box-sizing: border-box; min-height: 0;'
					+ ' box-shadow: 0 1px 3px rgba(0,0,0,0.22), 0 10px 30px rgba(0,0,0,0.28); }'
					// A RUNNING HEADER IS A PROPERTY OF A PAGE. With no pages there
					// is nothing for it to head, and it would sit once at the top of
					// the whole text reading as a title.
					+ 'html.is-flow .hdr, html.is-flow .pnum { display: none; }'
					// THE PAPER'S OWN TEXT COLUMN (A569): its margins inside the sheet, so a line
					// holds what a printed line holds
					+ 'html.is-flow .flow { height: auto; columns: auto;'
					+ ' overflow: visible; max-width: none; margin: 0;'
					// (the sides only: a page's top and bottom margins are its seams, so each page is the paper's height)
					+ ' padding: 0 ' + pm + '; }'

					// …AND WHERE EACH PRINTED PAGE BEGINS: the page's seam (A804, below; a faint rule and the bare number
					// until then), on the block `wsPageStarts` stamped
					// ONE RULE, NOT TWO (A618): a file that opens a printed page wears the page's
					// rule, so the dashed one between files stands down there
					+ 'html.is-flow section[data-ws-page-open]::before { content: none; }'
					// THE PAGE'S OWN FOOT AND HEAD AT EACH SEAM (A804, the writer: "make the expanded view with all the headers
					// page numbers and everything to match the actual export"): where a page ends its number as the file prints it
					// (at the foot, left, centre or right), a dashed cut, and the next page's running header with its number as
					// the file heads it; none on a title page. `wsPageStarts` puts the seams in; they show in the reader alone
					+ '.seam { display: none; }'
					// A SHEET A PAGE (the writer: "for expanded view add those spaces between pages. So the preview and expanded
					// look the same"): the seam is the page's bottom margin with its number, the paged view's air between two
					// sheets, and the next page's top margin with its header, each where the sheet in pages draws it (half a
					// margin in); the fill before it makes the page the paper's height (`wsSeamFill`). TOMBSTONE: the dashed cut
					// between two rows of text (A804), a page break drawn on one long sheet.
					+ 'html.is-flow .seam { display: block; margin: 0 -' + pm + '; text-indent: 0; font-size: 0.9em; line-height: 1.3; }'
					+ 'html.is-flow .seam-foot, html.is-flow .seam-head { position: relative; height: ' + pm + '; }'
					+ 'html.is-flow .seam-foot > span { position: absolute; bottom: calc(' + pm + ' / 2); }'
					+ 'html.is-flow .seam-head > span { position: absolute; top: calc(' + pm + ' / 2); }'
					+ 'html.is-flow .seam .is-left { left: ' + pm + '; }'
					+ 'html.is-flow .seam .is-center { left: 0; right: 0; text-align: center; }'
					+ 'html.is-flow .seam .is-right, html.is-flow .seam-hdr { right: ' + pm + '; }'
					// the air: the ground, wider than the sheet so the sheet's shadow does not run through it, its edges shaded
					// the air: the ground, THE PAPER'S WIDTH EXACTLY, its edges shaded. Wider (48px past the paper each side, to hide
					// the sheet's side shadow) it read as a grey bar, then, unshaded, as two light notches in the shadow beside the
					// paper (the writer's two circled shots); two real sheets cast that shadow there too
					+ 'html.is-flow .seam-cut { height: var(--sheet-gap); background: var(--ground);'
					+ ' box-shadow: inset 0 7px 8px -7px rgba(0,0,0,0.45), inset 0 -7px 8px -7px rgba(0,0,0,0.45); }'
					// where the engine broke inside a file, the next block's top margin goes, as the page drops it
					+ 'html.is-flow .seam.is-soft + * { margin-top: 0; }'
					// A SECTION NO LONGER OPENS A PAGE, because there are none.
					// `break-before` has to go here or the engine keeps a column break in
					// a document with one column and drops everything after it.
					+ 'html.is-flow .page { break-before: auto; }'
					// ── AND ONE FILE ENDS WHERE THE NEXT BEGINS ──────
					//
					// In pages the page break IS the delimiter; take the pages away and
					// every file runs into the next with one blank line between them. AIR
					// FIRST, because that is what a book uses — a chapter opening is
					// mostly white space and a reader knows it without being told.
					// TOMBSTONE (the writer: "So the preview and expanded look the same"): `section + section { margin-top: 4em }`
					// and a two-pixel dashed line above each file. The reader has pages now, and a file that opens one opens it
					// as in the paged view; one that runs on runs on there too, after its divider if the export has one.
					// ── AND A DASHED LINE BETWEEN FILES ──────────────
					//
					// `currentColor` at low strength, so the mark belongs to the page and
					// needs no second declaration for the other theme.
					// THE FIRST LINE AFTER A BREAK IS NOT INDENTED, which is the
					// same typographic rule `p.first` already states for the top of
					// a page — it just has nothing to key on here, because in flow
					// there is no page for a paragraph to be first on.
					+ 'html.is-flow section > p:first-child { text-indent: 0; }'
					// A TITLE PAGE IS A PAGE TALL HERE TOO (A723, the writer, a circled shot: "title page in expanded view
					// is too short"). It was `height: auto` and a little padding, so the reader did not open on a
					// page of nothing above the first line; read as one text, the first chapter then started half a page
					// down the title's sheet. The paged view's content height, its three lines centred in it as there.
					// (#72: the centring moves onto its inner block, a page tall, so the page's top margin, the seam that heads
					// it, stands above the page rather than centred with its three lines)
					+ 'html.is-flow .tp { height: auto; padding: 0; }'
					+ 'html.is-flow .tp > .tpinner { height: ' + ch + '; display: flex; flex-direction: column; justify-content: center; }'
					// …AND THE CONTACT LINES BELOW THAT SEAM (A860, the writer: "in expanded view this is too high"): the title
					// page's top margin is the seam inside it here, so its corner is a margin down, as the pages set it
					+ 'html.is-flow .tp > .tpcontact { top: ' + pm + '; }'
					// THE PRINTED DOCUMENT IS NOT THE SCREEN ONE: a drop shadow is a
					// compositing effect, and asked to print one Chromium rasterises the
					// page it cannot describe in vector terms — a PDF that is a picture of
					// the text. The screen decoration is switched off for print rather
					// than the document being rebuilt — one document, two media. AND THE
					// COLUMNS GO WITH IT: print HAS paged media; asking it to also flow
					// through a fixed box would paginate twice and print one page of a
					// manuscript.
					+ '@media print {'
					// INK ON PAPER, whatever the screen was set to. The dark
					// sheet is a reading light, not a document: a manuscript
					// printed white-on-black is a ream of toner.
					+ ' html, html.is-dark { background: #fff; color-scheme: light; }'
					+ ' html.is-dark body { color: #111; }'
					+ ' html.is-dark .sheet, html.is-dark .page,'
					+ ' html.is-dark .run { background: #fff; }'
					+ ' body { padding: 0; }'
					+ ' .stack { width: auto; height: auto !important; }'
					+ ' .sheet { position: static; width: auto; height: auto;'
					+ '   padding: 0; margin: 0; box-shadow: none; }'
					+ ' .hdr, .pnum { display: none; }'
					+ ' .flow { height: auto; overflow: visible; columns: auto; }'
					+ ' .tp { height: auto; }'
					+ ' .page, .run { width: auto; margin: 0; padding: 0;'
					+ '   min-height: 0; box-shadow: none; }'
					+ ' .page { page-break-before: always; break-before: page; }'
					+ ' .page:first-child { page-break-before: avoid;'
					+ '   break-before: avoid; }'
					+ '}'
				: '.page { page-break-before: always; } .page:first-child { page-break-before: avoid; }'
					// THE PRINTED TITLE PAGE A PAGE TALL, its block centered as the preview and Word center it (the writer's pick
					// "Center the PDF title page": its `.tp` had no height in print, so the block sat at the page's top), a point short of
					// the content box so it never spills a blank page; the contact lines in its corner, as on screen
					+ '@media print { .tp { height: calc(' + ch + ' - 1pt); position: relative; } .tp > .tpcontact { position: absolute; top: 0; inset-inline-start: 0; margin: 0; } }')
			+ 'p { margin: 0 0 ' + pgap + ' 0; text-indent: ' + (o.indent === false ? '0' : wsIndentSize(o)) + ';'
			+ (o.justify ? ' text-align: justify;' : '')
			// Widows and orphans are the whole reason to print rather than
			// draw: one line of a paragraph alone on a page is what makes a
			// generated manuscript look generated.
			+ ' orphans: 2; widows: 2; }'
			+ 'p.first, p.div { text-indent: 0; }'
			// A KEPT BLANK LINE IS ONE LINE (A851): no spacing of its own, so it adds one line to the gap whatever the
			// Paragraph spacing; as an ordinary paragraph it added two under One line
			+ 'p.blank { margin: 0; }'
			// THE LIST OF SOURCES HANGS (A572 step 4): half an inch, as the .docx does
			+ 'section.bib p.bib { padding-left: 0.5in; text-indent: -0.5in; margin: 0 0 0.5em; }'
			// A DARK SHEET, for reading rather than for proofing. It is not
			// what the file looks like and it does not pretend to be — the
			// point is the hour spent reading the preview before sending
			// it, and a white page at that size is a lamp. Print always
			// resets to ink on paper (below), so nothing here can reach
			// the .docx or a PDF.
			+ 'html.is-dark { color-scheme: dark; background: #17181b; }'
			+ 'html.is-dark body { color: #dcdcdc; }'
			// `.sheet` LEADS, because on screen it is the only one of the three
			// that paints paper. `.page` and `.run` keep the colour for the
			// exported .html, which has no sheet around it.
			+ 'html.is-dark .sheet, html.is-dark .page,'
			+ ' html.is-dark .run { background: #212327; }'
			+ 'html.is-dark pre.fm { color: #b9b9b9; border-left-color: #55565a; }'
			+ 'html.is-dark p.cmt { color: #b9b9b9; border-left-color: #55565a; }'
			+ 'html.is-dark mark { background: #6c5a1e; color: #f4f0e2; }'
			// Obsidian 1.14's highlight colors: the .docx's tints on paper
			// (WS_HL_DOCX), the same hues deeper on the dark page
			+ 'mark.hl-red { background: #f8c1c8; } mark.hl-orange { background: #f9d6b2; }'
			+ ' mark.hl-green { background: #b5eaca; } mark.hl-blue { background: #b5d3f5; }'
			+ ' mark.hl-purple { background: #d6cbfa; }'
			+ 'html.is-dark mark.hl-red { background: #672832; } html.is-dark mark.hl-orange { background: #684019; }'
			+ ' html.is-dark mark.hl-green { background: #185835; } html.is-dark mark.hl-blue { background: #183d67; }'
			+ ' html.is-dark mark.hl-purple { background: #3f336d; }'
			+ 'html.is-dark a { color: #9cc4ff; }'
			// The two things that only appear when a writer asks for them,
			// and both are set so they cannot be mistaken for the prose
			// they sit beside: properties as data, comments as an aside.
			+ 'pre.fm { font-family: ui-monospace, Menlo, Consolas, monospace;'
			+ ' font-size: 0.8em; line-height: 1.35; white-space: pre-wrap;'
			+ ' color: #444; border-left: 2px solid #bbb; padding-left: 8px; margin: 0 0 1em; }'
			+ 'p.cmt { text-indent: 0; font-style: italic; color: #555;'
			+ ' border-left: 2px solid #bbb; padding-left: 8px; margin: 0.4em 0; }'
			+ 'p.div { text-align: center; margin: 1em 0; }'
			// THE BLOCKS (wsHtmlBlocks): a quote set in from both sides, a callout
			// the same with a rule beside it, list lines by their depth, code and math
			// in monospace, a table ruled.
			+ 'blockquote { margin: 0.6em 0.5in; padding: 0; }'
			+ 'blockquote p { text-indent: 0; margin: 0 0 0.3em; }'
			+ 'blockquote.callout { border-left: 2px solid #bbb; padding-left: 10px; margin-left: 0.4in; }'
			+ 'html.is-dark blockquote.callout { border-left-color: #55565a; }'
			+ 'p.li { text-indent: 0; margin: 0 0 0.2em 0.25in; }'
			+ 'p.li.l1 { margin-left: 0.5in; } p.li.l2 { margin-left: 0.75in; } p.li.l3 { margin-left: 1in; }'
			+ 'pre.code, pre.math { font-family: ui-monospace, Menlo, Consolas, monospace;'
			+ ' font-size: 0.85em; line-height: 1.35; white-space: pre-wrap; margin: 0.6em 0; }'
			// A TABLE AS WORD SETS IT (the writer: "i think we need to resize tables to fit"): the text's width, its columns equal
			// and fixed, a cell's words wrapped inside it (a long one broken), single spaced (Word's table cell); a table wider
			// than the page ran into the next page's column
			+ 'table.tbl { border-collapse: collapse; margin: 0.8em auto; width: 100%; table-layout: fixed; }'
			// (a table cut where a page begins in it, for the reader: the two halves meet with no air, `wsTableSplit`)
			+ 'table.tbl.tbsplit { margin-bottom: 0; } table.tbl.tbcont { margin-top: 0; }'
			// A ROW NEVER SPLIT ACROSS TWO PAGES (Word's `cantSplit` on each, the same): a row broken by a page, part here
			// and part there, could not be cut between rows in the reader, which held it whole and ran its page long
			+ 'table.tbl tr { break-inside: avoid; page-break-inside: avoid; }'
			// A PICTURE (A568): centered on the column, its own size, never wider
			// than the column nor taller than 85% of the page (so its caption fits
			// under it), and never split across a page or a column.
			+ 'figure.fig { margin: 0.8em 0; text-align: center; text-indent: 0; break-inside: avoid; page-break-inside: avoid; }'
			+ 'figure.fig img { max-width: 100%; max-height: calc(0.85 * ' + ch + '); height: auto; }'
			+ 'figure.fig figcaption { font-style: italic; font-size: 0.9em; margin-top: 0.3em; }'
			// A NOTE: its number raised in the text, the notes at the back a list.
			+ 'sup.fnref a { color: inherit; text-decoration: none; }'
			// A RAISED MARK TAKES NO HEIGHT FROM ITS LINE (#72): a line holding a note's number stood a pixel or two taller
			// than its neighbours, by an amount that changed with the zoom, so the preview's pages broke differently at each
			// size; the lines are even now, as Word sets them
			+ 'sup, sub { line-height: 0; }'
			+ 'ol.notes { padding-left: 1.6em; } ol.notes li { text-indent: 0; margin: 0 0 0.4em; font-size: 0.92em; }'
			+ 'table.tbl th, table.tbl td { border: 1px solid #888; padding: 2px 8px; text-indent: 0; line-height: 1.45; vertical-align: top; overflow-wrap: anywhere; }'
			+ 'html.is-dark table.tbl th, html.is-dark table.tbl td { border-color: #55565a; }'
			// CENTERED unless the writer turned Center headings off (#76: "the headings insist on being centered"), then at
			// the line's start whatever the text's justification; the title page keeps its own centering below
			+ 'h1, h2, h3 { text-align: ' + (o.centerHeads === false ? 'start' : 'center') + '; page-break-after: avoid; font-weight: 700; }'
			// THE SAME SIZES THE FILE USES, from the same helper — see
			// `wsHeadSizeEm`. These were 1.5em / 1.15em / 1em, which matched the
			// .docx at exactly one level out of three.
			+ 'h1, h2 { font-size: ' + wsHeadSizeEm(1).toFixed(4) + 'em; }'
			+ 'h3, h4, h5, h6 { font-size: ' + wsHeadSizeEm(3).toFixed(4) + 'em; }'
			// AND THE TITLE PAGE'S TITLE IS ONE AND A HALF TIMES THE BODY, as the
			// .docx sets its run (`WS_TITLE_SIZE_EM`); the name and the count under it
			// stay the body size.
			+ '.tp .tpinner h1 { font-size: ' + WS_TITLE_SIZE_EM + 'em; }'
			// THE SUBTITLE a quarter larger than the text, as Word's run (#81); THE CONTACT LINES single spaced at the left,
			// over the title in the file's flow (a printed title page sets its block at the top), in its corner on screen
			+ '.tp .tpinner .tpsub { font-size: ' + WS_SUBTITLE_SIZE_EM + 'em; }'
			+ '.tp .tpcontact { text-align: start; line-height: 1.2; margin: 0 0 2em; }'
			+ '.tp .tpcontact p { margin: 0; text-indent: 0; }'
			// AND NO FIRST-LINE INDENT ON THE TITLE PAGE. `text-align: center`
			// centres the LINE BOX; `text-indent` moves the first line inside it,
			// so the base rule's half-inch indent pushed the author and the word
			// count right of the centred title. The .docx has no such indent on
			// WsTitle.
			+ '.tp .tpinner p { text-indent: 0; }'
			// AND NEVER JUSTIFIED (the writer: "the justiify text justifies the title page too"): Justify text sets the body's
			// paragraphs, and a `p` rule outranks the alignment a title page's lines inherit, centered or, in its corner, left
			+ '.tp p { text-align: inherit; }'
			// ── THE TITLE SITS WHERE WORD PUTS IT ──────
			//
			// The .docx drops EIGHT EMPTY PARAGRAPHS before the title, so its drop
			// is eight lines of the body style and moves with the font size and
			// the spacing (`wsTitleDropLines`). A WHOLE-LINE DROP CANNOT CENTRE
			// THIS BLOCK on screen: 27 text lines less a 4-line block leaves an
			// ODD number to split, and the `h1` carries a top margin the line
			// count does not model. SO THE SCREEN STOPS COUNTING: the sheet is a
			// flex column and the block is centred in it, which is exact and
			// cannot drift when the paper, the point size or the spacing change.
			// `wsTitleDropLines` STAYS for the .docx — Word has no other way to
			// place a block. The two differ by less than a line, which is the
			// trade for a sheet that is never visibly off-centre.
			+ '.tp { display: flex; flex-direction: column; justify-content: center; }'
			+ '.tp .tpinner { text-align: center; }'
			// AND THE TITLE BRINGS NO MARGIN INTO THE CENTRING. The h1 carries a
			// top margin from the base rules; inside a centred flex item that
			// margin is part of the BOX, so the box centres and the words sit
			// half of it low. EVENLY SPACED, LIKE THE FILE: the .docx is three
			// consecutive paragraphs of one style, spaced by the document's line
			// height and nothing else. Zeroing the margins here says the same
			// thing in CSS. `> *` and not `> :first-child`: the h1's BOTTOM margin
			// does the same thing one line down.
			+ '.tp .tpinner > * { margin-top: 0; margin-bottom: 0; }'
			// ── A PART TITLE LOOKS LIKE ONE ────────────────────
			//
			// Letterspaced small caps, centred, at a heading's size from the same
			// helper as the rest (`wsHeadSizeEm` — a size of its own here would
			// beat the helper by specificity and the preview would differ from the
			// file). It sits at the top of its chapter's page, not on a sheet of
			// its own. 1em BELOW, WHICH IS WHAT THE .docx LEAVES: `WsHeading*`
			// carries one line of the text above it (`w:before`, the body's size
			// in twips). AND NOTHING AT ALL WHEN A HEADING FOLLOWS — BOTH SIDES, because
			// adjacent margins collapse to the LARGER: zeroing only the folder's
			// would leave the heading's own top margin and read as no change.
			+ '.folderhead.is-tight { margin-bottom: 0; }'
			+ '.folderhead.is-tight + h1, .folderhead.is-tight + h2,'
			+ ' .folderhead.is-tight + h3, .folderhead.is-tight + h4,'
			+ ' .folderhead.is-tight + h5, .folderhead.is-tight + h6'
			+ ' { margin-top: 0; }'
			+ '.folderhead { margin: 0 0 1em; text-align: ' + (o.centerHeads === false ? 'start' : 'center') + ';'
			+ ' font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;'
			+ ' font-size: ' + wsHeadSizeEm(1).toFixed(4) + 'em;'
			+ ' page-break-after: avoid; }'
			+ 'ol.toc { list-style: none; padding: 0; }'
			+ 'ol.toc a { color: inherit; text-decoration: none; }'
			// THE PAGE AT THE RIGHT, a dotted leader to it (A751)
			+ 'ol.toc li { display: flex; align-items: baseline; }'
			+ 'ol.toc li .lead { flex: 1 1 auto; margin: 0 0.4em; border-bottom: 1px dotted currentColor; opacity: 0.45; }'
			+ 'ol.toc li .pg { flex: none; }'
			// One rule per level rather than a calc: this stylesheet is
			// inlined into a file a writer may open in Word or a browser, and
			// six literal rules survive anything that reads CSS at all.
			// l0 IS THE MARGIN and gets no rule at all — the class counts
			// steps in from the top of this list, not heading levels, so a
			// flat contents is every entry at l0 and no padding is emitted.
			+ 'ol.toc li.l1 { padding-left: 1.5em; }'
			+ 'ol.toc li.l2 { padding-left: 3em; }'
			+ 'ol.toc li.l3 { padding-left: 4.5em; }'
			+ 'ol.toc li.l4 { padding-left: 6em; }'
			+ 'ol.toc li.l5 { padding-left: 7.5em; }'
			// ── THE SHEET IS MARKUP, NOT A SECTION ───────────────
			//
			// One paper-sized box, one header overlay in its top margin, one
			// paginating flow inside it — around the SAME sections the file gets.
			// The preview is a paginator over the export's own HTML, so there is
			// no second compile to keep in step with the first. THE FILE GETS NONE
			// OF IT: `forScreen` is false there, and the sections are the
			// document.
			// THE PRINTED HEADER AND PAGE NUMBER, the page's margin boxes (A751: the number where it was asked), and NOTHING
			// IN THE MARGINS OF THE TITLE PAGE, as the .docx and the preview have it. LAST IN THE SHEET: a parser that cannot
			// read margin boxes (jsdom's) loses its place in one and takes the rule after it with it; here there is none
			+ (wsPageBoxesCss(o.runningHeader || '', pnAt, false, side) ? '@page {' + wsPageBoxesCss(o.runningHeader || '', pnAt, false, side) + ' }' : '')
			+ (o.titlePage && (head || pnAt !== 'none') ? '@page :first {' + wsPageBoxesCss(o.runningHeader || '', pnAt, true, side) + ' }' : '')
			+ '</style></head><body>'
			+ (forScreen
				// ONE SHEET IS EMITTED AND THE PANE CLONES IT. The document
				// carries the manuscript once; every other sheet in the pool is
				// a `cloneNode` of this one with a different column showing, so
				// the bytes are written once however many pages are on screen.
				? '<div class="stack"><div class="sheet">'
					+ '<div class="hdr"></div><div class="pnum"></div><div class="flow">'
					+ parts.join('\n') + '</div></div></div>'
				: parts.join('\n'))
			+ '</body></html>';
	},

	// THE CONTENTS' PAGE NUMBERS FOR A FILE (A751): the preview's own pages (a column a page), laid out once in a
	// frame out of sight and read the way the preview reads them; none where the contents carries none. The frame
	// is filled as the preview's is, its root swapped, never written.
	async exportTocPagesFor(this: WordSmith, sections: WsExportSection[], o: WsExportRun): Promise<Record<string, number>> {
		if (!o.toc || sections.length < 2 || !wsFormatHasPages(o.format || 'docx')) return {};
		const frame = document.body.createEl('iframe', { cls: 'ws-export-measure', attr: { srcdoc: WS_FRAME_SHELL, 'aria-hidden': 'true', tabindex: '-1' } });
		try {
			await new Promise<void>((done) => { frame.addEventListener('load', () => done(), { once: true }); window.setTimeout(done, 1500); });
			const doc = frame.contentDocument;
			if (!doc) return {};
			const fresh = new (doc.defaultView || window).DOMParser().parseFromString(this.exportToHtml(sections, o, true), 'text/html');
			const root = doc.adoptNode(fresh.documentElement);
			if (doc.documentElement) doc.replaceChild(root, doc.documentElement); else doc.appendChild(root);
			await new Promise<void>((done) => { window.requestAnimationFrame(() => window.requestAnimationFrame(() => done())); window.setTimeout(done, 400); });
			try { await doc.fonts.ready; } catch (_) { wsCatch('exportTocPagesFor: fonts', _); }
			// the notes at the foot of their page first, as Word sets them, or every page after the first note is counted short (#72)
			if (doc.documentElement.hasAttribute('data-ws-fnfoot')) wsFootNotes(doc);
			return wsTocPagesMeasure(doc);
		} catch (_) { wsCatch('exportTocPagesFor', _); return {}; }
		finally { frame.remove(); }
	},

	exportDefaultScope(this: WordSmith) {
		try {
			const f = this.app.workspace.getActiveFile();
			if (f && f.parent && f.parent.path && f.parent.path !== '/') return f.parent.path;
			if (f && f.path) return f.path;
		} catch (_) { wsCatch('exportDefaultScope: const f = this.app.workspace.getActiveFile();', _); }
		return '';
	},

	// (TOMBSTONE (A872): `exportRemember` and the `lastRun` it wrote, for a "Set up again" never built; nothing read them)

	// TASKS IN A NOTE: `- [ ]` open, anything else in the box done.
	//
	// ANYTHING ELSE, deliberately. Obsidian's own tasks are `[ ]` and `[x]`,
	// but half the community uses `[/]` for in-progress, `[-]` for dropped,
	// `[?]` for a question — and a count that called those "open" would tell
	// a writer they had work left on a scene they had finished with. Open is
	// the empty box; everything else has been touched.
	countTasks(this: WordSmith, text: string) {
		const out = { done: 0, all: 0 };
		if (!text) return out;
		const re = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[(.)\]/gm;
		let m;
		while ((m = re.exec(text)) !== null) {
			out.all++;
			if (m[1] !== ' ') out.done++;
		}
		return out;
	},

	// THE TAGS ON A NOTE, from the cache Obsidian already keeps — frontmatter
	// and inline both, because a writer who tags in one place should not find
	// half of them missing.
	tagsOf(this: WordSmith, path: string) { return this.tagsWithSource(path).map(t => t.tag); },

	// ── AND WHERE EACH ONE LIVES ───────────────────────────
	//
	// The two sources are not interchangeable to a writer: a frontmatter
	// tag can be edited from this plugin, and one written mid-sentence
	// cannot be, because removing it means editing the sentence.
	//
	// ONE READER OF THE CACHE. `tagsOf` derives from this rather than
	// reading the cache a second time, so the merged list and the sourced
	// list can never disagree about what a note carries. IN-PROSE WINS A
	// TIE: a tag in both places is ONE tag; marking it editable when half
	// of it is welded into a sentence would be a promise the editor cannot
	// keep.
	tagsWithSource(this: WordSmith, path: string) {
		const out: { tag: string; inText: boolean; }[] = [];
		const seen = new Map<string, { tag: string; inText: boolean }>();
		const add = (raw: string, inText: boolean) => {
			const tag = String(raw || '').replace(/^#/, '').trim();
			if (!tag) return;
			const had = seen.get(tag);
			if (had) { if (inText) had.inText = true; return; }
			const rec = { tag, inText: !!inText };
			seen.set(tag, rec);
			out.push(rec);
		};
		try {
			const f = this.app.vault.getAbstractFileByPath(path);
			const cache = f ? this.app.metadataCache.getFileCache(f) : null;
			// ── AND A FILE WITH NO CACHE MAY STILL HAVE TAGS ──────
			//
			// A PDF never has a metadata cache; its tags live in the store, and
			// the tags column reaches them through here. NOT `inText`: a tag in
			// the store was TYPED INTO THE ROW, not written in prose, so it is
			// ours to remove and must carry the same × as a frontmatter tag. AND
			// `!cache` IS NOT THE TEST: on a .pdf `getFileCache` returns an EMPTY
			// OBJECT, not null — truthy — so a guard written that way never fires.
			// The predicate is the one every other reader asks (`propStoreHolds`),
			// which is also why it cannot drift from them.
			if (this.propStoreHolds && this.propStoreHolds(path)) {
				let sv;
				try { sv = this.propStoreGetSync(path, 'tags'); } catch { sv = undefined; }
				const kept: string[] = Array.isArray(sv)
					? sv.map(String)
					: (typeof sv === 'string' && sv ? sv.split(/[,\s]+/) : []);
				for (const t of kept) add(t, false);
				return out;
			}
			if (!cache) return out;
			for (const t of (cache.tags || [])) add(t && t.tag, true);
			const fm: unknown = cache.frontmatter && (cache.frontmatter.tags || cache.frontmatter.tag);
			const list: string[] = Array.isArray(fm) ? fm.map(String) : (typeof fm === 'string' ? fm.split(/[,\s]+/) : []);
			for (const t of list) add(t, false);
		} catch (_) { wsCatch('tagsWithSource: const f = this.app.vault.getAbstractFileByPath(path);', _); }
		return out;
	},

	async exportFillCounts(this: WordSmith, files: TAbstractFile[], listWrap: HTMLElement, done: () => void, store: Map<string, number> | null) {
		for (const f of files) {
			let text = '';
			try { text = await this.app.vault.cachedRead(f); } catch (_) { wsCatch('exportFillCounts: text = await this.app.vault.cachedRead(f);', _); }
			const n = this.countWords(text);
			if (store) store.set(f.path, n);
			const el = listWrap.querySelector('[data-path="' + CSS.escape(f.path) + '"]');
			if (el) { el.setAttribute('data-words', String(n)); el.setText(n.toLocaleString()); }
		}
		if (done) done();
	},

	// The options a target actually receives: the window's, plus the three
	// derived from the scope. Split out because the preview must be given
	// EXACTLY what the export will be \u2014 a preview assembled separately is
	// a preview of something else, and the running header drifted first.
	exportOptsFor(this: WordSmith, scope: string, o: WsExportOpts, words: number): WsExportRun {
		// The writer's title if they gave one, the folder's name if not.
		// Trimmed, because a box someone tabbed through holding a space is
		// a title of one space, and it would go on the title page.
		const typed = String(o.titleText || '').trim();
		// The vault's name when there is no folder to be named after (the
		// export is the vault), before 'Untitled'.
		const title = typed
			|| (String(scope || '').split('/').pop() || '').replace(/\.md$/, '')
			|| (this.vaultName && this.vaultName())
			|| wsTIn(this.settings && this.settings.language, 'Untitled');
		// THE HEADER'S TOKENS FILLED (#81, A845): the title, the time on a 12- and a 24-hour clock, the day's date in parts
		const dp = this.dateParts(new Date()), hr = Number(dp.hh);
		const typedHead = wsHeadFill(String(o.headerText || '').trim(), { title,
			time12: String(hr % 12 || 12) + ':' + dp.mi + ' ' + (hr < 12 ? 'AM' : 'PM'), time24: dp.hh + ':' + dp.mi,
			dd: dp.dd, mm: dp.mm, yyyy: dp.yyyy, yy: dp.yy });
		const runningHeader = o.runningHeaderOn
			// THE WRITER'S OWN WORDS when they gave some (A751)
			? (typedHead || ((o.author ? o.author.split(/\s+/).pop() + ' / ' : '') + title + ' /'))
			: '';
		return Object.assign({}, o, {
			title, wordCount: words, runningHeader, lang: (this.settings && this.settings.language) || 'en',
			// A HEADER WITH ITS OWN {page} carries the number: none a second time where Page numbers would put it
			...(runningHeader.includes('{page}') ? { pageNumberAt: 'none' } : {})
		});
	},

	// ── THE ACT, as a line anybody can ask for ──────────────────────────────
	//
	// What to make, where to put it, look at it, make it — the top line of
	// the Export tab. `ctx` is what belongs to the WINDOW rather than to
	// the act:
	//
	// scope()        the folder this export is about — the compiled file's
	// name, and what the store remembers ticks against
	// compileList()  the files, in order, ticked only. ONE function, because
	// Export and Preview must be handed the same list: a
	// preview of a different book is worse than no preview,
	// and it is a bug nobody reports because it looks like
	// the export working
	// onDone()       what the window does afterwards
	//
	// The progress handle comes back out, because the caller owns the
	// container this was drawn into.
	//
	// ── THE PREVIEW COLUMN IS AS TALL AS THE PANEL SHOWS ────────
	//
	// A sticky column as tall as the thing it is meant to stay beside
	// never sticks: it scrolls away with the options and its foot is off
	// screen whenever they are taller than the pane. So the column takes
	// the height the panel SHOWS, from where it stands at scroll 0 to the
	// panel's bottom, and the stylesheet lets it stand at its own height
	// (`is-fit`) rather than the row's. A ResizeObserver on the panel
	// keeps the number true as the window and the pane move; the page
	// frame inside is `flex: 1` and fills what it is given. Read in the
	// body's zoom: rects are in window pixels, the height is in the
	// column's own.
	exportPrevColFit(this: WordSmith, panel: HTMLElement, split: HTMLElement, prevCol: HTMLElement) {
		const win = (panel && panel.ownerDocument && panel.ownerDocument.defaultView) || window;
		if (!win || typeof win.ResizeObserver !== 'function') return;
		const fit = () => {
			if (!split.isConnected) { try { ro.disconnect(); } catch { /* gone */ } return; }
			try {
				const body = split.closest('.ws-uni-body');
				const z = Number(body && win.getComputedStyle(body).zoom) || 1;
				const pr = panel.getBoundingClientRect();
				const sr = split.getBoundingClientRect();
				// THE RISE IS MEASURED (A635): to the act block's top, two lines now, so the page starts
				// level with Tick all beside the options; stacked, the sheet takes the rise away whatever
				// this says. It was a fixed 47px, the destination's one line, measured once.
				const act = panel.querySelector<HTMLElement>('.ws-export-top');
				if (act) split.style.setProperty('--ws-export-riseup', Math.max(0, Math.round((sr.top - act.getBoundingClientRect().top) / z)) + 'px');
				const rise = parseFloat(win.getComputedStyle(prevCol).marginTop) || 0;
				const padB = parseFloat(win.getComputedStyle(panel).paddingBottom) || 0;
				const top0 = (sr.top - pr.top) / z + panel.scrollTop + rise;
				const h = Math.floor(panel.clientHeight - top0 - padB);
				if (!(h > 0)) { split.classList.remove('is-fit'); return; }
				split.style.setProperty('--ws-export-prevh', h + 'px');
				split.classList.add('is-fit');
			} catch (_) { wsCatch('exportPrevColFit / fit', _); }
		};
		const ro = new win.ResizeObserver(() => fit());
		try { ro.observe(panel); ro.observe(split); } catch (_) { wsCatch('exportPrevColFit: ro.observe(panel);', _); }
		// …and the act block, whose height is the rise (A635): a wrap there moves the split without resizing it
		try { const act = panel.querySelector('.ws-export-top'); if (act) ro.observe(act); } catch (_) { wsCatch('exportPrevColFit: ro.observe(act);', _); }
		// AND BY HAND after every preview (`_wsFit`): the observer answers
		// only while the window renders — an occluded window gets no frame and
		// no callback — and the first sync reading below can land on a pane
		// that is not yet sized.
		split._wsFit = fit;
		fit();
	},

	buildExportAct(this: WordSmith, into: HTMLElement, ctx: { scope: () => string; compileList: () => TFile[]; total: () => number; tickAll: (on: boolean) => void; onDone: () => void }) {
		// THE DEFAULTS ARE ENSURED HERE, not by whoever opened a window. See
		// `exportOptionDefaults`.
		this.exportOptionDefaults();
		const o = this.settings.exportOpts || (this.settings.exportOpts = {});
		let exportProgress: { show: (done: number, total: number, what: string) => void; hide: () => void } | null = null;
		const fmt = into.createDiv({ cls: 'ws-export-fmt' });
		// TICK ALL / UNTICK ALL, left of "Export as". Says which it will do;
		// the figures' writer re-says it on every change of what is ticked.
		const tickAll = fmt.createEl('button', { cls: 'ws-export-tickall ws-export-mini', text: wsT('Tick all') });
		tickAll.addEventListener('click', () => {
			if (!ctx.tickAll) return;
			ctx.tickAll(tickAll.dataset.all !== '1');
		});
		this.exportTickAllSay(into,
			(ctx.compileList ? ctx.compileList() : []).length,
			typeof ctx.total === 'function' ? ctx.total() : 0);
		fmt.createSpan({ cls: 'ws-export-fmtlabel', text: wsT('Export as') });
		// FIVE FORMATS, and each one is a different question answered: Word
		// for the person who asked for the manuscript, PDF for a page that is
		// final, HTML for anyone with a browser, the e-book for a reader's
		// device, Markdown for the writer's own pipeline. PDF is desktop only — ABSENT rather than present-and-
		// refusing where there is no engine: a choice that fails when taken is
		// worse than a choice that was never offered, and this is the one
		// format whose availability is a fact about the machine rather than
		// about the manuscript.
		//
		// ── WHICH CONTROLS APPLY, AS A TABLE ───────
		//
		// THE FACT IS PAGES. A .docx, a PDF and a printed web page all have
		// them; Markdown does not, and everything hidden for it is hidden for
		// that one reason: paper size, the face it is set in, the margins, and
		// a running header, which is a line printed at the top of a page that
		// does not exist. One question asked once. THE WEB PAGE HAS PAGES, and
		// that is not a technicality — the HTML carries its own @page rule,
		// which is what makes it printable and what the PDF is produced from.
		const FORMATS = [
			// `pages` READ FROM THE SHARED HELPER, not restated here: the
			// Structure group needs the same fact and cannot see this table.
			{ id: 'docx', label: 'Word', ext: '.docx', pages: wsFormatHasPages('docx') },
			{ id: 'pdf',  label: 'PDF',  ext: '.pdf', desktopOnly: true,
				pages: wsFormatHasPages('pdf') },
			// (Word, PDF and Markdown are names, and stay theirs; the two that are words are routed, A695)
			{ id: 'html', label: wsT('Web page'), ext: '.html', pages: wsFormatHasPages('html') },
			// AN E-BOOK (A612): no pages of its own, a reader sets them; a phone makes one too
			{ id: 'epub', label: wsT('E-book'), ext: '.epub', pages: wsFormatHasPages('epub') },
			{ id: 'md',   label: 'Markdown', ext: '.md', pages: wsFormatHasPages('md') }
		].filter(f => !f.desktopOnly || this.exportPdfAvailable());
		// Held so that paintFmt can put them back when the options are written
		// from outside the controls that normally own them.
		let fmtSel: { value: string; } | null = null, intoInput: { value: string; } | null = null;
		const paintFmt = () => {
			const f = FORMATS.filter(x => x.id === o.format)[0] || FORMATS[0];
			// THE DROP-DOWN ITSELF: a write from outside it reaches `o.format`
			// too, and a window whose menu says Word while the options say .html is
			// worse than one that had never offered to help.
			if (fmtSel && fmtSel.value !== o.format) fmtSel.value = o.format || 'docx';
			if (intoInput && intoInput.value !== (o.outFolder || '')) {
				intoInput.value = o.outFolder || '';
			}
			// ── AND TYPESETTING IS ONLY SHOWN WHERE IT APPLIES ─────────
			//
			// HIDDEN, NOT CLEARED. The paper size and the spacing a writer set for
			// their PDF are still in the settings and still apply the moment they
			// pick PDF again; a writer who flicks to Markdown to check something
			// must not come back to defaults.
			//
			// FOUND BY CLASS, NOT HELD IN A VARIABLE: THE SECTION IS BUILT IN A
			// DIFFERENT METHOD (`buildExportOptions`), and a `let` here cannot be
			// assigned there. SCOPED TO THIS WINDOW, not the document: a second
			// window open on another format must not have its section hidden by
			// this one.
			const scope = into.closest('.ws-uni-body') || into.ownerDocument;
			// EVERYTHING THAT NEEDS PAGES, in one sweep (`wsExportSweep`, which the options' redraw runs too). The class
			// is stamped where each control is built.
			wsExportSweep(scope, f.id);
			// …and each list's button says again what is on: no running header where there are no pages (A625)
			for (const el of Array.from<HTMLElement>(scope.querySelectorAll('.ws-export-picklist'))) {
				const say = wsPickSay.get(el);
				if (say) say();
			}
		};
		// A vault whose saved format no longer exists comes back to Word
		// rather than to a choice that is not on the list. Written as a
		// whitelist for that reason: naming the formats that DO exist cannot
		// go stale. AND PDF IS ON THE LIST ONLY WHERE IT EXISTS: a writer who
		// chose PDF on the desktop and opens the same synced vault on a phone
		// gets Word, not a button for a format that machine cannot make.
		// `FORMATS` is already filtered, so asking it is asking one question.
		if (!FORMATS.some(f => f.id === o.format)) o.format = 'docx';
		// A DROP-DOWN, not a third row of segmented buttons. The layout and
		// the paper are already that control, and the format answers a
		// categorically different question — WHAT FILE comes out, not how
		// it is set — so wearing the same idiom made three unrelated
		// choices look like one bank of settings. A select beside the
		// button reads as part of the act: choose the thing, press the
		// thing.
		const sel = fmt.createEl('select', { cls: 'ws-export-fmtsel dropdown' });
		fmtSel = sel;
		for (const f of FORMATS) {
			const opt2 = sel.createEl('option', { text: f.label + '  (' + f.ext + ')' });
			opt2.value = f.id;
		}
		sel.value = o.format || 'docx';
		sel.addEventListener('change', () => {
			o.format = sel.value; void this.saveSettings(); paintFmt();
		});
		// ── WHERE PDF IS ABSENT, SAY HOW TO GET ONE ──
		//
		// The writer's question on a phone is still "can I have a PDF", and
		// the answer is yes: the Web page carries its paper size, margins and
		// running header as an `@page` rule — the very thing the desktop PDF
		// is printed from — and Safari and Chrome honour the same rule. One
		// sentence here beats a second typesetting engine in the bundle. ASKED
		// OF THE SAME TEST THAT HIDES THE FORMAT, so the two cannot disagree.
		if (!this.exportPdfAvailable()) {
			fmt.addClass('has-note');
			fmt.createDiv({ cls: 'ws-export-fmtnote',
				text: wsT('For a PDF, export the web page, open it in your browser and print it. Same pages, saved as PDF.') });
		}
		// WHAT ACTUALLY GETS COMPILED, in one place. ORDER, not the gathered
		// list — a manual move is the whole point of the drag, and reading
		// `files` here would throw it away silently at the last step. One
		// function because the Export button and the Preview must be given
		// the same list: a preview of a different book is worse than none.
		const compileList = () => ctx.compileList();
		const runBtn = (label: string, kind: string) => {
			// IN THE FORMAT'S GROUP, AFTER ITS MENU (A715, the writer: "the wrapped export button that goes on the
			// second line"). A child of the row beside the group, it was the one thing the row could break before, and
			// a real book's figures inside the group sent it down alone; a sibling of the figures, it keeps the line
			// while they give way (the sheet's A715).
			const b = fmt.createEl('button', { cls: 'mod-cta ws-export-go' });
			wsGlyphWord(b, ['file-output', 'download'], label);
			b.addEventListener('click', () => { void (async () => {
				b.disabled = true;
				// ORDER, not the gathered list — a manual move is the whole
				// point of the drag, and compiling from `files` would throw
				// it away silently at the last step.
				try {
					await this.runExport(o.format || 'docx', ctx.scope(), compileList(), o, exportProgress);
				}
				finally { b.disabled = false; if (exportProgress) exportProgress.hide(); }
				if (ctx.onDone) ctx.onDone();
			})(); });
			return b;
		};
		// WHERE IT LANDS, beside what it will be. A folder picker rather
		// than a path to type: every other place in this window that wants
		// a folder searches for one, and a bare box meant typing a path
		// exactly and getting silence when it was wrong.
		{
			// `intoRow`, not `into`: the argument this act draws into is called
			// `into`, and a local of the same name here would shadow it — the row
			// would try to build itself out of itself.
			const intoRow = into.createDiv({ cls: 'ws-export-into' });
			// "EXPORT AS" LEFT OF THE EXPORT BUTTON (A680, the writer, a shot with an arrow from it to the top
			// line: "put the export as in the left of the export button"; A635 had moved it here): the first line
			// reads Tick all, the figures, Export as and its menu, Export; this one where the file lands, and
			// opening its line the word wears a capital
			intoRow.createSpan({ cls: 'ws-export-fmtlabel', text: wsT('Into') });
			const pick = intoRow.createDiv({ cls: 'ws-export-folderpick' });
			// THE PHONE'S PDF NOTE UNDER THE LINE, a line of its own (A657: inside it, on a line that never wraps,
			// its sentence took the room: "Export as" on two lines and a folder box of 72px on a tablet)
			const pdfNote = fmt.querySelector('.ws-export-fmtnote');
			if (pdfNote) into.appendChild(pdfNote);
			const inp = pick.createEl('input', { cls: 'ws-export-text' });
			inp.type = 'text';
			inp.value = o.outFolder || '';
			intoInput = inp;
			inp.placeholder = wsT('Vault root');
			const hits = pick.createDiv({ cls: 'ws-export-hits ws-export-foldhits' });
			const paintHits = () => {
				hits.textContent = '';
				const q = inp.value.trim();
				const found = q
					? this.exportFinderMatches(q, 6).filter(h => h.kind === 'folder')
					: this.exportNearbyScopes(6);
				for (const h of found) {
					const r = hits.createDiv({ cls: 'ws-export-hit' });
					r.createSpan({ cls: 'ws-export-hitpath', text: h.path });
					r.addEventListener('mousedown', (ev: Event) => {
						ev.preventDefault();
						o.outFolder = h.path; inp.value = h.path;
						hits.textContent = ''; void this.saveSettings();
					});
				}
			};
			inp.addEventListener('input', paintHits);
			inp.addEventListener('focus', paintHits);
			// A typed path is still honoured — the list is help, not a gate.
			inp.addEventListener('change', () => { o.outFolder = inp.value; void this.saveSettings(); });
			inp.addEventListener('blur', () => {
				window.setTimeout(() => { hits.textContent = ''; }, 120);
			});
		}
		runBtn(wsT('Export'), o.format || 'docx');
		paintFmt();
		// The progress line sits in the footer beside the button that
		// starts the work, not over the list a writer may still be reading.
		// THE PROGRESS LINE RIDES THE TOP BAR'S BOTTOM EDGE, absolutely
		// positioned, so that a bar appearing mid-export cannot move a
		// single control on the row it belongs to. It replaces the border
		// under the bar while it runs, which is a rule already drawn there.
		const prog = into.createDiv({ cls: 'ws-export-prog' });
		const progBar = prog.createDiv({ cls: 'ws-export-progbar' });
		const progTxt = prog.createDiv({ cls: 'ws-export-progtxt' });
		exportProgress = {
			show: (done: number, total: number, what: string) => {
				prog.addClass('is-on');
				progBar.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
				progTxt.setText(what + (total ? '  ' + done + '/' + total : ''));
			},
			hide: () => { prog.removeClass('is-on'); progBar.style.removeProperty('width'); }
		};
		return { progress: exportProgress, repaint: () => paintFmt() };
	},

	// ── THE EXPORT'S OPTIONS, as a panel anybody can ask for ────────────────
	//
	// Six hundred lines of switches, three drop-downs that rewrite each
	// other — one copy, so nothing can fall behind and be the one
	// somebody's manuscript comes out of. Everything here is
	// `settings.exportOpts`, which is where these belong: a writer sets
	// their manuscript up once, and it is the CHOICE OF FILES that belongs
	// to the export in front of them. `ctx` is an object rather than bare
	// arguments because a second positional one added later is how a
	// shared builder starts growing callers that pass them in the wrong
	// order.
	buildExportOptions(this: WordSmith, into: HTMLElement, ctx: { scope: () => string; compileList?: () => TFile[]; total?: () => number }) {
		// Same reason as the act line: a panel that draws switches for options
		// that have no value draws them all off.
		this.exportOptionDefaults();
		const o = this.settings.exportOpts || (this.settings.exportOpts = {});
		// ── THE PRINTING, BESIDE THE SWITCHES THAT DECIDE IT ────────────────
		//
		// The compile is cheap — reading, sectioning, counting and rendering
		// a whole vault in tens of milliseconds. THE LAYOUT IS NOT: the same
		// nodes cost five times as much laid out inline in this window as
		// inside an IFRAME, because the frame carries none of Obsidian's
		// cascade. So the preview is a frame, and nothing is truncated or
		// counted out. THE PREVIEW COLUMN IS A SIBLING OF THE OPTIONS, not
		// inside them: `buildOpts` empties its own column on every change, and
		// an iframe rebuilt on every toggle would flash and re-lay-out for
		// nothing.
		const split = into.createDiv({ cls: 'ws-export-split' });
		const optSide = split.createDiv({ cls: 'ws-export-optside' });
		const prevCol = split.createDiv({ cls: 'ws-export-prevcol' });
		this.exportPrevColFit(into, split, prevCol);
		const rightCol = optSide.createDiv({ cls: 'ws-export-right' });
		// The options redraw themselves, because three of them CHANGE what
		// the others should say: a layout rewrites five switches, the
		// paper choice moves a segment, and the divider's text box only
		// exists while there is a divider. Rebuilding the block keeps one
		// description of what is on screen — hand-updating each control
		// from every other is where a panel starts telling small lies
		// about itself.
		let redrawOpts = () => {};
		// ── AND IT FOLLOWS EVERY CHANGE, ON A DELAY ─────────────────────────
		//
		// DEBOUNCED AT 220ms: a refresh costs about 45ms of compile plus 70ms
		// of frame layout, so a slider dragged across its range would
		// otherwise recompile the manuscript forty times on the way. 220 is
		// longer than a keystroke and shorter than a thought.
		//
		// ONE LISTENER ON THE PANEL, delegated, rather than a hook in every
		// control. There are about twenty switches, four drop-downs, two text
		// boxes and a file list here; hooking each is twenty chances to miss
		// one, and a preview that is right except after the divider box is
		// worse than none. `redrawOpts` calls it too, for the changes that
		// rebuild the column rather than firing an event.
		let prevTimer: number | null = null;
		let prevRun = 0;
		// ── WHAT THE PREVIEW IS CURRENTLY SHOWING ────────────────
		//
		// A SELECTION IS NOT ALWAYS A CHANGE. Picking a different folder can
		// leave the compiled list exactly as it was — same notes, same order,
		// same options — and rewriting a document to produce the same document
		// is a flash for nothing.
		let prevSig: string | null = null;
		// THE READER'S OWN HANDLE, so a caller outside this panel can ask it
		// to go somewhere. Replaced on every recompile: an older one points
		// into a document that has been written over.
		let prevHandle: HTMLElement | null = null;
		// A LONG MANUSCRIPT IS PREVIEWED WHEN ASKED. `previewAsked` makes the next
		// refresh an ask (the notice's button, the foot's refresh); `drawnListSig` is
		// the notes and options the preview on screen was drawn from, so a click that
		// changes neither leaves it alone instead of compiling it again.
		let previewAsked = false;
		let drawnListSig: string | null = null;
		// ── THE PREVIEW'S OWN CONTROLS MUST NOT RECOMPILE IT ──────────────
		//
		// The refresh is hung on delegated `change`/`click`/`input` listeners
		// over the entire options container, and the zoom foot is built INSIDE
		// the preview column, which is inside that container. So pressing +
		// would gather the files, compile every section, rebuild the HTML and
		// rewrite the iframe — to set one CSS property that is already being
		// set directly. THE WHOLE FOOT, not just the zoom buttons: Dark/Light
		// only toggles a class on the frame's `documentElement`.
		const refreshPreview = (ev?: Event) => {
			try {
				const t = wsElOf(ev && ev.target);
				if (t && t.closest('.ws-export-prevfoot')) return;
			} catch (_) { wsCatch('buildExportOptions / refreshPreview: const t = ev && ev.target;', _); }
			if (prevTimer) { window.clearTimeout(prevTimer); prevTimer = null; }
			prevTimer = window.setTimeout(async () => {
				prevTimer = null;
				const run = ++prevRun;
				let picked: TFile[] = [];
				try { picked = ctx.compileList ? ctx.compileList() : []; } catch (_) { wsCatch('buildExportOptions / refreshPreview: picked = ctx.compileList ? ctx.compileList() : [];', _); }
				// NOTHING TICKED IS A SENTENCE, NOT AN EMPTY FRAME. An empty
				// preview reads as a broken preview.
				if (!picked.length) {
					// ── NOTHING TICKED STILL READS ZERO ────
					//
					// The row beside the Export button must say something about a compile
					// that would produce an empty file. The preview column does say
					// "Nothing ticked yet", and that is not the same thing: it is inches
					// away, and the only place a writer with the preview scrolled would
					// not be looking. The figure belongs beside the button it describes.
					try {
						const stale = into.querySelector('.ws-export-top .ws-export-prevhead');
						if (stale) stale.remove();
						const actRow0 = into.querySelector('.ws-export-top');
						if (actRow0) {
							const head0 = actRow0.createDiv({ cls: 'ws-export-prevhead' });
							head0.createSpan({ text: this.exportFiguresText(0) });
							wsPlaceFigures(actRow0, head0);
							this.exportTickAllSay(actRow0, 0,
								typeof ctx.total === 'function' ? ctx.total() : 0);
						}
					} catch (_) { wsCatch('buildExportOptions / refreshPreview: const stale = into.querySelector(\'.ws-export-top …', _); }
					prevCol.empty();
					prevCol.createDiv({ cls: 'ws-export-prevnone',
						text: wsT('Nothing ticked yet \u2014 the preview shows what will print.') });
					// THE FRAME IS GONE, SO THE SIGNATURE GOES TOO. Untick all empties the
					// column; Tick all brings back the same set, whose signature would
					// match the last frame's, and the early return below would re-say the
					// figures over an empty column.
					prevSig = null;
					prevHandle = null;
					drawnListSig = null;
					return;
				}
				const asked = previewAsked;
				previewAsked = false;
				let listSig: string | null = null;
				try { listSig = JSON.stringify(o) + '\u0002' + picked.map((f) => f.path).join('\u0001'); } catch { listSig = null; }
				const bytes = picked.reduce((n, f) => n + ((f && f.stat && f.stat.size) || 0), 0);
				if (bytes > WS_EXPORT_PREVIEW_AUTO_BYTES && !asked) {
					// the preview on screen is of these notes and these options: leave it
					if (prevHandle && listSig !== null && listSig === drawnListSig) return;
					try {
						const actRow0 = into.querySelector('.ws-export-top');
						if (actRow0) {
							const stale = actRow0.querySelector('.ws-export-prevhead');
							if (stale) stale.remove();
							const head0 = actRow0.createDiv({ cls: 'ws-export-prevhead' });
							head0.createSpan({ text: this.exportFiguresText(picked.length) });
							wsPlaceFigures(actRow0, head0);
							this.exportTickAllSay(actRow0, picked.length,
								typeof ctx.total === 'function' ? ctx.total() : 0);
						}
					} catch (_) { wsCatch('buildExportOptions / refreshPreview: the long manuscript\'s figures', _); }
					prevCol.empty();
					const wait0 = prevCol.createDiv({ cls: 'ws-export-prevnone ws-export-prevbig' });
					// ONE KEY, as the English has one ("notes" whatever the count); `n` lets a table give its plural forms
					wait0.createDiv({ text: wsT('{count} notes ticked. A preview this long holds Obsidian while it is drawn, so it is drawn when you ask.', { n: picked.length, count: picked.length.toLocaleString() }) });
					const ask = wait0.createEl('button', { cls: 'ws-export-mini', text: wsT('Show the preview') });
					ask.addEventListener('click', () => { previewAsked = true; refreshPreview(); });
					prevSig = null; prevHandle = null; drawnListSig = null;
					return;
				}
				let secs = [];
				// THE SAME SCOPE THE EXPORT USES, or the preview would show a heading
				// the file does not get — and the preview exists to say what will
				// print.
				let scope0 = '';
				try { scope0 = (ctx && typeof ctx.scope === 'function')
					? ctx.scope() : ''; } catch { scope0 = ''; }
				try { secs = await this.exportSections(picked, o, null, scope0); await this.exportImages(secs, 'preview'); }
				catch { return; }
				// A SLOWER RUN MUST NOT LAND ON A NEWER ONE. Two changes inside
				// one compile and the first to finish is not the first started.
				if (run !== prevRun) return;
				let words = 0;
				for (const sec of secs) words += this.countWords(sec.markdown);
				// the citations as the export will write them, the list at the back (A572 step 4); after the count
				// …AND A MARKDOWN EXPORT WRITES NONE (A867, Fable's review): it keeps [@key] for whoever compiles it next, so its
				// preview shows the keys as the file will have them
				if (o.format !== 'md') this.exportCite(secs);
				// ── THE SAME DOCUMENT IS NOT REDRAWN ─────────────────
				//
				// THE PROSE ITSELF, not a count of it. Lengths collide — an edit that
				// swaps two words leaves every number identical — and the one thing
				// this must never do is hold a stale preview over a changed
				// manuscript. The compile has already read every file by this line,
				// so joining what it read costs nothing beside it. THE OPTIONS ARE IN
				// IT TOO: paper, font, spacing and the rest change the document
				// without changing a word of the text.
				let sig = null;
				try {
					sig = JSON.stringify(o) + '\u0002'
						+ secs.map(x => (x.path || '') + '\u0000' + (x.title || '')
							+ '\u0000' + (x.markdown || '')).join('\u0001');
				} catch { sig = null; }
				// THE FIGURES STILL MOVE. “11 out of 47” has a second number in
				// it that the compiled list knows nothing about — the notes in
				// SCOPE — and choosing a different folder changes it while the
				// ticked list stays as it was. So the head is rewritten and only
				// the document is left alone.
				if (sig !== null && sig === prevSig) {
					try {
						const row0 = into.querySelector('.ws-export-top');
						const had = row0 && row0.querySelector('.ws-export-prevhead');
						if (row0 && had) {
							had.empty();
							had.createSpan({ text: this.exportFiguresText(picked.length) });
							this.exportTickAllSay(row0, picked.length,
								typeof ctx.total === 'function' ? ctx.total() : 0);
						}
					} catch (_) { wsCatch('buildExportOptions / refreshPreview: const row0 = into.querySelector(\'.ws-export-top\');', _); }
					return;
				}
				prevSig = sig;
				prevCol.empty();
				// THE ACT ROW IF THERE IS ONE, and the old line goes first: the
				// preview column is emptied on every refresh, but the act row is
				// not ours to empty — it holds the format, the folder, the count
				// and the button. Removing exactly what we put there last time is
				// the only safe way to write into somebody else's row.
				const actRow = into.querySelector('.ws-export-top');
				if (actRow) {
					const old = actRow.querySelector('.ws-export-prevhead');
					if (old) old.remove();
				}
				this.exportTickAllSay(actRow, picked.length,
					typeof ctx.total === 'function' ? ctx.total() : 0);
				prevHandle = this.exportPreviewInto(prevCol, secs,
					this.exportOptsFor(ctx.scope(), o, words), picked.length,
					actRow || null,
					// THE FOOT'S REFRESH: the same recompile, asked for by hand.
					// `refreshPreview` excuses the foot's clicks, so this is the one way a
					// press there reaches it.
					() => { previewAsked = true; refreshPreview(); });
				drawnListSig = listSig;
				try { if (split._wsFit) split._wsFit(); } catch (_) { wsCatch('buildExportOptions / refreshPreview: split._wsFit();', _); }
			}, 220);
		};
		// (…and a change in Settings › Export redraws it, while this pane is on the page: `exportOptsChanged`)
		const fromSettings = () => {
			if (!into.isConnected) { if (this._exportRefreshers) this._exportRefreshers.delete(fromSettings); return; }
			refreshPreview();
		};
		(this._exportRefreshers || (this._exportRefreshers = new Set())).add(fromSettings);
		into.addEventListener('change', refreshPreview);
		into.addEventListener('click', refreshPreview);
		into.addEventListener('input', refreshPreview);
		// ── ONE VIEW, NOT TABS ──────────────────────────────────────
		//
		// Setting up a PDF means visiting what the document is MADE OF and how
		// the words are SET every time, so a tab between them costs a click per
		// export and hides half the state behind the other half. One column
		// fits because the switches sit several to a row, the drop-down
		// captions are titles rather than a permanent line each, and ALSO
		// INCLUDE is behind one control.
		//
		// TITLE AND AUTHOR still come first: they are what the manuscript
		// IS, and the two boxes most likely to be wrong on any export.
		let optPanel: HTMLDivElement | null = null;
		const optGroup = (label: string) => {
			// Sub-headings WITHIN a tab, for the run of switches that answer
			// a narrower question than the tab does — "Also include" earns
			// one because off-by-default is a promise worth naming.
			const into = optPanel || rightCol;
			if (label) into.createDiv({ cls: 'ws-export-eyebrow', text: label });
			return into.createDiv({ cls: 'ws-export-opts' });
		};
		const buildOpts = () => {
		rightCol.empty();
		// ── The options ─────────────────────────────────────────────────
		//
		// ── THE NAME IS THE CONTROL ─────────────────────────────────────
		//
		// One pressable block that says what it is, accented when on — not a
		// switch and not a checkbox. (The helper is still named `toggle`;
		// export_probe pins the spelling against the source.)
		//
		// `aria-pressed`, BECAUSE A CHECKBOX GAVE THAT AWAY FREE. An
		// `input[type=checkbox]` announces itself as checked or unchecked; a
		// button announces nothing about its state unless told to. The colour
		// says "on" to anyone who can see it; this says it to anyone who
		// cannot.
		//
		// `type="button"` IS NOT DECORATION: a button defaults to `submit`
		// inside a form. These sit in a pane today, and naming the type keeps
		// that true if one is ever wrapped in one.
		const toggle = (parent: HTMLElement, key: WsExportBoolKey, label: string, hint: string) => {
			// A CHECKBOX, NOT AN ACCENT BUTTON: five toggles ON at once, in a
			// column, beside an accent Export button, had the accent saying three
			// things on one screen — "this is on", "this is the action", and "this
			// is the highlight colour". An input says what it is without being
			// told to. A LABEL WRAPPING THE INPUT, so the whole row is the hit
			// target rather than a 13px square. `.ws-export-toggle` stays on it —
			// tests find these by that class and read their text, and the layout
			// rules that size the row are hung on it too.
			const row = parent.createEl('label', {
				cls: 'ws-export-opt ws-export-toggle ws-export-check' });
			const box = row.createEl('input', { cls: 'ws-export-checkbox' });
			box.type = 'checkbox';
			const on = !!o[key];
			box.checked = on;
			row.toggleClass('is-on', on);
			row.createSpan({ cls: 'ws-export-checklabel', text: label });
			if (hint) row.title = hint;
			row.addEventListener('change', () => {
				o[key] = !!box.checked;
				void this.saveSettings();
				// STILL REDRAWS: `titlePage` decides whether `roundWordCount`
				// is available, and the two selects rewrite their own captions.
				// The new state is painted from the store by that redraw rather
				// than set on the element here — one writer for what is on.
				redrawOpts();
			});
			return row;
		};
		// ── A GROUP AS ONE BUTTON AND ITS LIST (A617 Also include, A625 Front matter) ──
		//
		// The writer: "the also includes in the export tab needs to be a submenu with
		// icons for each", then "the frontmatter in export should also be a submenu".
		// A fold was asked for once (2026-08-23) and taken back (2026-08-28): it said
		// how many were on and nothing said WHICH. So the button names them ("Tags,
		// Footnotes"), and a press opens the list: each row its icon and its name, lit
		// when on, switched without the list closing, its hint on hover; the preview
		// follows each switch. `rows` is asked at every press and every saying, so a
		// row that does not apply (a running header where there are no pages) is in
		// neither, and a format change has the button say it again (paintFmt).
		const pickList = (grp: HTMLElement, cls: string, rows: () => WsPickRow[], none: string, what: (list: string | null) => string) => {
			const btn = grp.createEl('button', { cls: 'ws-export-mini ws-export-picklist ' + cls, attr: { type: 'button' } });
			const say = () => {
				btn.empty();
				const on = rows().filter(([k]) => !!o[k]).map(([, lab]) => lab);
				btn.createSpan({ cls: 'ws-export-pick-text', text: on.length ? wsUiJoin(on) : none });
				wsIconInto(btn.createSpan({ cls: 'ws-export-pick-chev' }), ['chevron-down'], '\u25be');
				// the whole sentence a caller's own (A695): "Before the text: Title page. Press for the list."
				btn.title = what(on.length ? wsUiJoin(on) : null);
			};
			say();
			wsPickSay.set(btn, say);
			btn.addEventListener('click', () => {
				this.openPickerLive(btn, rows().map(([key, lab, hint, icon]) => ({
					label: lab, note: hint,
					icon: () => { const el = createSpan(); wsIconInto(el, icon, '\u2022'); return el; },
					on: () => !!o[key],
					onClick: () => { o[key] = !o[key]; void this.saveSettings(); say(); refreshPreview(); },
				})), 'toggle');
			});
			return btn;
		};
		// THE FONT BOX: type to search, click to take, and every name is set
		// in its own face.
		//
		//   A SPECIMEN, NOT A WORD. A font is a shape; a column of names all
		//   set in the interface face is a list of words, and the writer has
		//   to pick, export and open the file to find out what they chose.
		//   A TYPED NAME IS STILL TAKEN. The list is help, not a gate — the
		//   same rule the folder box keeps — because a writer setting a
		//   manuscript for someone ELSE'S machine has a reason to name a
		//   face this one does not have.
		//   …AND IT SAYS SO, quietly, underneath. That is the whole argument
		//   the fixed list was built on, kept as a warning instead of as a
		//   wall.
		const fontOpt = (parent: HTMLElement, key: WsExportStringKey, label: string, inRow: boolean) => wsExportFontOpt(this, { o }, parent, key, label, inRow);

		// A DROP-DOWN for anything with a small fixed set of answers. Paper
		// was two segmented buttons, which is a control shaped like a
		// choice between equals — but nobody switches paper twice in a
		// session, and it was taking a row and a half to say so.
		//
		// AND A LINE UNDER IT SAYING WHAT THE ANSWER MEANS. "Between files:
		// divider, same page" is precise and it is not an explanation —
		// vault feedback was, in as many words, "I don't understand what
		// these do", and re-reading them shows why: they name the SETTING
		// and leave the writer to imagine the page. Six words of plain
		// English under the box costs one line and removes the guess. The
		// caption belongs to the CHOICE, not to the control, so it changes
		// as the drop-down does — a tooltip could not do that, and neither
		// could a hint on the label.
		// `inRow` stops the row spanning its grid, so several can share a line
		// inside a `.ws-export-trio`. Last argument on purpose: a dozen tests
		// pin the FIRST three arguments of these calls against the source
		// text, so anything new goes on the end.
		// `whenMissing` IS FOR A CHOICE THE FORMAT DOES NOT OFFER. A stored
		// value that is not in `items` leaves a `<select>` showing its first
		// option while reporting an empty value — so the box would say one
		// thing and the manuscript do another. Naming the fallback keeps the
		// STORED choice untouched: a writer whose Word export starts each file
		// on a new page must not have that rewritten by looking at Markdown.
		const selOpt = (parent: HTMLElement, key: WsExportStringKey | 'pt', label: string, items: { id: string | number; label: string; hint?: string }[], after: () => void, inRow: boolean, whenMissing?: string) => {
			const row = parent.createDiv({ cls: 'ws-export-opt ws-export-textrow'
				+ (inRow ? ' is-inrow' : '') });
			row.createSpan({ cls: 'ws-export-optname', text: label });
			const sel = row.createEl('select', { cls: 'dropdown ws-export-sel' });
			for (const it of items) {
				const op = sel.createEl('option', { text: it.label });
				op.value = String(it.id);
			}
			sel.value = String(o[key]);
			if (whenMissing && !items.some((x) => String(x.id) === String(o[key]))) {
				sel.value = String(whenMissing);
			}
			// THE CAPTION IS THE ROW'S TITLE, NOT A ROW OF ITS OWN. ON THE ROW,
			// not the select: the label is half the row and a reader hovering
			// 'Each file' is asking the same question as one hovering the box
			// beside it.
			const sayHint = () => {
				const it = items.filter((x) => x.id === String(o[key]))[0];
				if (it && it.hint) row.title = it.hint; else row.removeAttribute('title');
			};
			sayHint();
			sel.addEventListener('change', () => {
				// a select answers a string; the size's `after` parses it to the number it is
				(o as Record<string, string | number | boolean | undefined>)[key] = sel.value;
				sayHint();
				void this.saveSettings();
				if (after) after();
			});
			return sel;
		};
		const textOpt = (parent: HTMLElement, key: WsExportStringKey, label: string, ph: string, hint?: string, inRow?: boolean) => {
			const row = parent.createDiv({ cls: 'ws-export-opt ws-export-textrow'
				+ (inRow ? ' is-inrow' : '') });
			row.createSpan({ cls: 'ws-export-optname', text: label });
			const inp = row.createEl('input', { cls: 'ws-export-text' });
			inp.type = 'text'; inp.value = o[key] || ''; inp.placeholder = ph || '';
			inp.addEventListener('change', () => { o[key] = inp.value; void this.saveSettings(); });
			// A box can need help as much as a drop-down can - "Scene break"
			// is a field whose whole meaning is which of two marks it sets, and
			// that cannot be said in a label. It is a TITLE now, for the same
			// reason selOpt's is: this row only appears when a star divider is
			// chosen, and a caption that costs a line the moment a writer picks
			// an option is a page that grows as it is used.
			if (hint) row.title = hint;
			return inp;
		};


		// ── Who and what it is ──────────────────────────────────────────
		// The author FIRST, because it is the one field a writer fills in
		// by hand and the one that ends up on the title page and in the
		// running header — it was at the bottom, under a dozen switches
		// nobody needs to read to type their own name.
		{
			// NO EYEBROW ON THE FIRST GROUP. A heading over the top of a
			// column names the column, not a section of it — "The
			// manuscript" sat above three fields in a panel that is
			// entirely about the manuscript, so it said nothing and cost
			// a line. The groups below it divide something; this one is
			// just where the column starts.
			optPanel = null;                      // above the tabs
			// NAMED: the groups divide the column, and a group that does not say
			// what it is divides nothing.
			const grp = optGroup(wsT('Manuscript'));
			// (TOMBSTONE: Title and Author shared a line, the pair's shape; Author went to Settings › Export, then Title and Subtitle
			// shared it, and the writer put Subtitle under Title, each a line of its own)
			// TITLE, and the folder's name is what it falls back to rather
			// than a switch saying so. "Use the folder name" as a toggle
			// would be a control for the case where the writer has
			// nothing to say — an empty box already means that, and it
			// shows what it will use in the placeholder, so the default
			// is visible instead of merely documented.
			textOpt(grp, 'titleText', wsT('Title'),
				(String(wsCtxScope(ctx)).split('/').pop() || '').replace(/\.md$/, '') || wsT('Untitled'));
			// THE SUBTITLE UNDER IT, a line of its own as Title has (the writer: "also add subtitle for the title page", then "put
			// subtitle under title in export tab")
			textOpt(grp, 'subtitleText', wsT('Subtitle'), '');
			// DECIDED ONCE (A574, and the writer's "Six plus paragraph look"): your name, the header, the page numbers, the
			// headings and the paragraphs in Settings → Export; ONE SHORT LINE under the title says so (the writer: "Remove that
			// comment under title. Say more option in export settings something like that")
			grp.createDiv({ cls: 'ws-export-moved', text: wsT('More options in Settings → Export.') });
		}

		// THE PANEL EVERYTHING BELOW DRAWS INTO. `optGroup` routes through it —
		// Title and Author set `optPanel = null` to sit above.
		optPanel = rightCol.createDiv({ cls: 'ws-export-panel' });

		// ── How it is put together ──────────────────────────────────────
		// Every switch here decides where one thing ENDS and the next begins —
		// a title page before the text, a header across the top, a heading or
		// a break or a mark between files. That is structure, and a writer
		// looking for "should each chapter start a new page" looks under
		// structure.
		// the redraw read when it runs, not as it was at the call (lift-snapshots: a let written after)
		wsExportOptsStructure(this, { o, optGroup, pickList, redrawOpts: () => redrawOpts(), selOpt, textOpt, toggle });

		// ── The words ───────────────────────────────────────────────────
		// …and these decide how the prose itself is set, which is the other
		// question entirely — which is why they are the other tab.
		wsExportOptsTypesetting(this, { fontOpt, o, optGroup, selOpt, toggle });

		// ── What comes along ────────────────────────────────────────────
		// Everything here is OFF, and everything here is something the
		// compile deliberately leaves behind: the note's plumbing, the
		// writer's asides, the pictures. Off is right — a manuscript is
		// prose and none of this is prose — but "right by default" is not
		// the same as "never wanted", and the alternative a writer had was
		// to strip these by hand from the note and put them back after.
		//
		// Its own group, and named for the question rather than for the
		// items, because what these three share is not what they ARE but
		// that the export drops them.
		wsExportOptsAlso({ optGroup, pickList });
		// what the format hides, hidden again in the rows just built
		wsExportSweep(rightCol, o.format || 'docx');

		// ("Save into" is in the footer,
		// beside "Export as": where a file lands is part of the ACT of
		// exporting, not a property of the manuscript, and it was the only
		// row in this column that answered a question about the export
		// rather than about the book.)
		};
		// THE REDRAW REFRESHES THE PREVIEW TOO. Three options rewrite the
		// whole column rather than firing a change event on one control — a
		// layout writes five switches, the paper choice moves a segment — so
		// the delegated listener never sees them.
		redrawOpts = () => { buildOpts(); refreshPreview(); };
		buildOpts();
		// AND IT PAINTS ONCE ON OPEN, or the pane offers an empty frame until
		// the writer happens to touch something. The debounce makes this the
		// same 220ms every other refresh takes.
		refreshPreview();
		// The redraw is handed back: three of these options CHANGE what the
		// others should say, and a caller drawing its own furniture around
		// this panel has to be able to ask for it.
		// AND A REFRESH THAT BUILDS NOTHING. `redraw` rewrites the options
		// column; this only recompiles the preview, which is what a caller
		// wants when the SCOPE moved and the controls did not.
		return { el: rightCol, redraw: () => redrawOpts(),
			refresh: () => refreshPreview(),
			// ASKED OF THE HANDLE THAT EXISTS NOW, not of one captured when this
			// object was made: the preview is rebuilt on every real change, and a
			// caller holding the old one would scroll a document nobody can see.
			jumpTo: (path: string) => {
				try {
					if (!prevHandle || typeof prevHandle.wsJumpTo !== 'function') return false;
					prevHandle.wsJumpTo(path);
					return true;
				} catch { return false; }
			} };
	},

	async runExport(this: WordSmith, kind: string, scope: string, files: TFile[], o: WsExportOpts, progress: { show: (done: number, total: number, what: string) => void; hide: () => void } | null) {
		if (!files.length) { new Notice('Word-Smith: ' + wsT('nothing selected to export.')); return; }
		const sections = await this.exportSections(files, o,
			progress ? (d: number, t: number) => progress.show(d, t, wsT('Reading')) : null,
			scope);
		if (progress) {
			progress.show(files.length, files.length, wsT('Building'));
			// One frame for "Building" to appear before the synchronous
			// build blocks everything — otherwise the label changes and
			// the UI repaints in the same moment, which is after the work.
			await new Promise((r) => window.setTimeout(r, 0));
		}
		let words = 0;
		for (const s of sections) words += this.countWords(s.markdown);
		const folder = await this.exportEnsureFolder(o.outFolder || '');
		// A FREE NAME, ALWAYS. The stamp is dd-mm-yyyy hh-mm, so two
		// exports inside the same minute asked the vault for a path that
		// already existed — and `vault.create` throws on that, so the
		// second one FAILED with "File already exists" rather than making
		// a file. Tweaking one option and pressing Export again is the
		// most ordinary thing to do in this window, which made it the
		// most ordinary way to see an error.
		//
		// Counting up rather than overwriting: the first file may be the
		// one already sent to somebody, and no export is worth silently
		// replacing it.
		const into = (n: string) => {
			let path = folder ? folder + '/' + n : n;
			try {
				if (!this.app.vault.getAbstractFileByPath(path)) return path;
				const dot = n.lastIndexOf('.');
				const stem = dot === -1 ? n : n.slice(0, dot);
				const ext = dot === -1 ? '' : n.slice(dot);
				for (let i = 2; i < 200; i++) {
					const next = (folder ? folder + '/' : '') + stem + ' ' + i + ext;
					if (!this.app.vault.getAbstractFileByPath(next)) return next;
				}
			} catch (_) { wsCatch('runExport / into: if (!this.app.vault.getAbstractFileByPath(path)) return path;', _); }
			return path;
		};
		const opt = this.exportOptsFor(scope, o, words);
		if (kind !== 'md') {
			// A KEY THE LIBRARY DOES NOT HOLD (A670, the writer's pick 3): MEASURED, it printed as typed
			// ("[@nobody2020]") and its group whole with it, and nothing said so; the file is made all the same
			// …AND A SOURCE CITED WITHOUT A YEAR OR A TITLE (#60's rest), read before the citations are written in
			let thin: string[] = [];
			try { thin = wsCiteThin(sections, this.citeLibrary()); } catch (_) { wsCatch('exportCiteThin', _); }
			const missing = this.exportCite(sections);
			const lib = this.settings.citeLibrary || '';
			const said = [missing.length ? wsCiteMissingText(missing, lib) : '', thin.length ? wsCiteThinText(thin, lib) : ''].filter(Boolean);
			if (said.length) this.exportNotice(said.join(' '), 12000);
			if (progress) progress.show(files.length, files.length, wsT('Pictures'));
			await this.exportImages(sections, kind === 'docx' ? 'docx' : 'page');
		}
		try {
			if (kind === 'md') {
				const name = into(this.exportFileName(scope, 'md', opt.title));
				// (each picture linked where it lives, A842)
				await this.app.vault.create(name, this.exportToMarkdown(this.exportMdImages(sections, name), opt));
				new Notice('Word-Smith: ' + wsT('exported {name}', { name }));
				return;
			}

			if (kind === 'pdf') {
				// THE SAME HTML THE WEB PAGE EXPORT WRITES, handed to the
				// engine Obsidian is already running. One builder, so a PDF
				// cannot drift from the pages the preview drew — and no page
				// layout of our own, which is the part that would mean owning
				// line breaking, font metrics and font embedding.
				opt.tocPageOf = await this.exportTocPagesFor(sections, opt);
				const html = this.exportToHtml(sections, opt, false);
				const pdfName = into(this.exportFileName(scope, 'pdf', opt.title));
				try {
					const bytes = await this.exportPdfRender(html, opt);
					if (!bytes || !bytes.length) throw new Error(wsT('the engine returned nothing'));
					// `.buffer` is the whole file: the render resolves with a fresh
					// `new Uint8Array(buf)`, offset 0, no pool behind it.
					await this.app.vault.createBinary(pdfName, bytes.buffer);
					new Notice('Word-Smith: ' + wsT('exported {name}', { name: pdfName }));
					return;
				} catch (e) {
					// ── NO CONSOLATION FILE ─────────────────────────────────
					//
					// It says what went wrong and stops — it does not write the web page
					// instead: a file nobody asked for costs more than pressing Export twice.
					console.error('Word-Smith: PDF export failed', e);
					new Notice('Word-Smith: ' + wsT('could not make a PDF \u2014 {reason}. Nothing was written.', { reason: wsErrMsg(e) }));
					return;
				}
			}

			if (kind === 'html') {
				// THE SAME DOCUMENT THE PREVIEW DRAWS, with the screen
				// decoration off: one builder, so the file cannot drift
				// from the thing the writer just looked at. Plain text,
				// so `create` rather than `createBinary` — there is no
				// container to malform, no relationship to dangle and no
				// part to leave out, which are the three ways a .docx
				// breaks. It also carries the @page rules, which is why
				// printing it from any browser gives a PDF with the
				// pagination, the margins and the running header intact.
				const htmlName = into(this.exportFileName(scope, 'html', opt.title));
				opt.tocPageOf = await this.exportTocPagesFor(sections, opt);
				await this.app.vault.create(htmlName, this.exportToHtml(sections, opt, false));
				new Notice('Word-Smith: ' + wsT('exported {name}', { name: htmlName }));
				return;
			}
			if (kind === 'epub') {
				const epubName = into(this.exportFileName(scope, 'epub', opt.title));
				const book = this.exportToEpub(sections, opt);
				await this.app.vault.createBinary(epubName, book.buffer);
				// THE BOOK CHECKED (A654): written either way, and what a store would refuse said, the first in the
				// notice and every one in the console
				const wrong = this.exportEpubCheck(book);
				if (wrong.length) console.warn('Word-Smith: the e-book ' + epubName + ' would be refused for:', wrong);
				this.exportNotice(!wrong.length ? wsT('exported {name}', { name: epubName })
					: wrong.length === 1 ? wsT('exported {name}, but {n} thing a store would refuse: {first}', { name: epubName, n: 1, first: wrong[0] })
					: wsT('exported {name}, but {n} things a store would refuse: {first} (and {more} more, in the console)', { name: epubName, n: wrong.length, first: wrong[0], more: wrong.length - 1 }),
					wrong.length ? 15000 : 0);
				return;
			}
			// (each contents entry's page, as the PDF's: written into Word's field, A806)
			opt.tocPageOf = await this.exportTocPagesFor(sections, opt);
			const bytes = wsBuildDocx(sections, opt);
			const name = into(this.exportFileName(scope, 'docx', opt.title));
			await this.app.vault.createBinary(name, bytes.buffer);
			// Word is the default format, so the export a writer actually repeats
			// is the one that most needs remembering.
			new Notice('Word-Smith: ' + wsT('exported {name}', { name }));
		} catch (e) {
			console.error('Word-Smith export failed', e);
			new Notice('Word-Smith: ' + wsT('export failed — {reason}', { reason: wsErrMsg(e) }));
		}
	},

	// ── PDF, THROUGH A WEBVIEW'S OWN printToPDF ────────────────────────────
	//
	// Rendering the manuscript to HTML and printing it gets real
	// pagination, widow and orphan control and a running header from CSS —
	// all the hard parts of a page layout engine, for free. Writing a PDF
	// by hand would mean owning line breaking, font metrics and page
	// geometry, and embedding a font for anything outside WinAnsi.
	//
	// · NO DIALOG. A print dialog needs a hand on it; `printToPDF` returns
	// bytes, so the PDF lands beside the .docx with the same name and no
	// questions.
	// · THE HALF THAT CAN BE PROVED IS SPLIT OUT. The mapping from a writer's
	// options to Chromium's is pure (`exportPdfOptions`); only the call
	// itself cannot run headlessly, and that is one function with one
	// job.
	//
	// It is desktop only, and the format is absent on a phone rather than
	// present and failing.
	// A CHANGE IN SETTINGS › EXPORT REACHES AN OPEN EXPORT TAB (eight options moved there on the writer's word): each
	// pane hands its preview's refresh in (`buildExportOptions`), and one gone from the page drops itself out
	exportOptsChanged(this: WordSmith) {
		const set = this._exportRefreshers;
		if (!set) return;
		for (const fn of Array.from(set)) { try { fn(); } catch (_) { wsCatch('exportOptsChanged', _); } }
	},

	exportPdfOptions(this: WordSmith, o: WsExportRun) {
		const paper = wsPaperOf(o);
		const m = wsPaperMicrons(paper);
		// ── NO HEADER OF OURS. THE DOCUMENT ALREADY HAS ONE ─────────────────
		//
		// Chromium honours the HTML's own `@page { @top-right { … } }` rule. One
		// document, one header, and it is the document's — which is also what
		// makes the PDF and the browser-printed page the same pages rather
		// than two arrangements that agree.
		//
		// If the header ever needs suppressing on the title page, that is the
		// HTML's @page rule to fix, and fixing it there fixes both outputs.
		return {
			// INCHES (A841, a reader on a MacBook: "The pdf export did not work for me"). This was microns, the unit
			// Electron read before version 21; since then an object here is in inches, so Letter asked for a page 215,900
			// inches wide, past the 200 a PDF page may be. The document's @page rule (below) won on Windows; a print
			// pipeline that sets the page up before the CSS has every reason to refuse. Obsidian ships Electron 43.
			pageSize: { width: m.width / 25400, height: m.height / 25400 },
			// …and INCHES, in the same object.
			margins: { top: m.margin, bottom: m.margin,
				left: m.margin, right: m.margin },
			// …AND THE DOCUMENT'S OWN @page WINS OVER BOTH.
			//
			// The HTML this prints already carries `@page { size: …; margin: …; }`
			// built from the same paper table — it is what makes the Web page
			// export printable from any browser. With this on, Chromium honours
			// it, so the PDF and the browser-printed page are the same pages
			// rather than two arrangements that happen to agree. The two fields
			// above stay as the answer for a document without an @page rule.
			preferCSSPageSize: true,
			landscape: false,
			// A MANUSCRIPT IS BLACK ON WHITE. Without this the page carries
			// whatever the theme's background is, which on a dark theme is a
			// PDF nobody can print and an agent cannot read.
			printBackground: false,
			displayHeaderFooter: false
		};
	},

	// IS THERE AN ENGINE HERE AT ALL. Asked once and answered honestly: a
	// phone has no Electron, and neither answer is more useful to the writer
	// than the other, because their question is "can I have a PDF".
	//
	// `window.require` IS THE WHOLE TEST. It exists in Obsidian's desktop
	// renderer and nowhere else, and it is what makes the `<webview>` tag
	// available — see `exportPdfRender` for why that tag is the engine.
	exportPdfAvailable(this: WordSmith) {
		try {
			if (Platform && Platform.isMobile) return false;
			if (Platform && Platform.isDesktopApp === false) return false;
		} catch (_) { wsCatch('exportPdfAvailable: if (Platform && Platform.isMobile) return false;', _); }
		try { return typeof window.require === 'function'; } catch { return false; }
	},

	// ── THE ENGINE IS A <webview>, NOT A BrowserWindow ──────────────────────
	//
	// A `<webview>` tag carries its OWN `printToPDF`. It needs no remote, no
	// main-process call and no permission: it is an element, it goes in the
	// document, it loads a page and prints it. That is why it works.
	//
	// With thanks to StoryLine (PixeroJan, MIT), whose export settled which of
	// the two mechanisms Obsidian actually permits.
	exportPdfWebview(this: WordSmith) {
		// The tag only exists when Electron's webview integration is on, which
		// is the same condition as `window.require`.
		if (!this.exportPdfAvailable()) return null;
		try {
			const el = createEl('webview');
			if (typeof el.printToPDF !== 'function' && !('src' in el)) return null;
			return el;
		} catch { return null; }
	},

	// Render HTML to PDF bytes. Resolves with a Uint8Array, or throws with a
	// reason the writer can act on.
	async exportPdfRender(this: WordSmith, html: string, o: WsExportRun) {
		const view = this.exportPdfWebview();
		// THE REASONS BELOW ARE THE WRITER'S TO READ: each ends up in the notice (A695)
		if (!view) throw new Error(wsT('this build has no print engine'));
		// HIDDEN, NOT DISPLAY:NONE. A webview that is not laid out does not
		// render, and a page that has not rendered prints blank — so it is
		// moved off screen at one pixel rather than removed from the flow —
		// `.ws-print-webview` in styles.css.
		view.addClass('ws-print-webview');
		// NOTHING FROM THE PAGE RUNS. The document is the writer's own prose,
		// but it is HTML we assembled and it is being loaded into a real
		// browser context: a note carrying a script tag must not execute
		// inside Obsidian's process.
		view.setAttribute('nodeintegration', 'false');
		view.setAttribute('webpreferences', 'contextIsolation=true');
		// A BLANK PAGE, THE DOCUMENT WRITTEN INTO IT (A583). It used to load as one
		// data address, and Chromium refuses an address over 2 MB: measured, the
		// engine took 1 MB of HTML and failed at 1.9 (2.5 once encoded) with "could
		// not be loaded for printing". A long book reached that alone, a Polish or
		// Russian one sooner (every letter encoded six bytes long), and a single
		// picture always. Written through the page's own script call there is no
		// limit: 12 MB measured, and a picture inside.
		view.setAttribute('src', 'about:blank');
		document.body.appendChild(view);

		const done = () => { try { view.remove(); } catch (_) { wsCatch('exportPdfRender: view.remove();', _); } };
		return await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
			// A TIMEOUT, because `dom-ready` is not promised. A webview that
			// never loads would otherwise leave the export waiting for ever
			// with nothing on screen to say so, and leave the element in the
			// document for the rest of the session.
			// A big book takes longer: twenty seconds, and two more a megabyte
			// (12 MB measured at 15 s).
			// THE LOAD'S LIMIT, NOT THE PRINT'S (the writer, 2026-10-15: "the export ended in an error"). It ran on through
			// the print, and a print takes as long as its book, not as long as a load: the showcase's 40 notes, 444 pages
			// with 24,000 Chinese, Japanese and Korean letters in them, printed in 22.8 s of a 23 s limit (17.5 s headless,
			// 2.9 s with those letters taken out: the fonts embedded for them). Once printing starts the engine answers by
			// itself; the guard it is given then is only for one that never does.
			// (THE STEP IT CAME IN, #84: logged with a timeout, so a report from a machine not here can say where it stopped)
			let step = 'loading the blank page';
			const late = () => {
				done();
				wsCatch('exportPdfRender: no answer while ' + step + ' (' + Math.round(html.length / 1024) + ' KB)', new Error('timeout'));
				reject(new Error(wsT('the print engine did not answer in time')));
			};
			let bail = window.setTimeout(late, 20000 + Math.round(html.length / 524288) * 1000);
			let written = false;
			view.addEventListener('did-fail-load', () => {
				window.clearTimeout(bail); done();
				reject(new Error(wsT('the manuscript could not be loaded for printing')));
			});
			view.addEventListener('dom-ready', () => { void (async () => {
				// the blank page's ready, once: writing the document fires it again
				if (written) return;
				written = true;
				try {
					if (typeof view.executeJavaScript !== 'function') throw new Error(wsT('the print engine cannot take a document'));
					// THE DOCUMENT, AND ITS PICTURES LOADED: the call answers once every picture has loaded, or failed to, OR
					// FIVE SECONDS ON. NOT DECODED (#84, phil31753: "after a substantial delay … did not answer in time"): a decode
					// is answered when Chromium draws, and this view sits off screen: measured, one small inline picture loaded at
					// once and decoded 23.9 s later, past the load's 20 s. The print draws a loaded picture itself
					step = 'writing the document and loading its pictures';
					await view.executeJavaScript('document.open();document.write(' + JSON.stringify(html) + ');document.close();'
						+ 'Promise.race([Promise.all(Array.from(document.images).map(function (i) { return i.complete ? null : new Promise(function (r) { i.addEventListener("load", r); i.addEventListener("error", r); }); })),'
						+ ' new Promise(function (r) { setTimeout(r, ' + WS_PDF_PICTURE_WAIT_MS + '); })])'
						+ '.then(function () { return document.images.length; })');
					step = 'laying the document out';
					// AND A BEAT AFTER IT. `dom-ready` means the document
					// exists, not that Chromium has laid it out — and printing
					// mid-layout is the other way this returns "Printing
					// failed". Half a second is what StoryLine settled on and
					// it costs nothing next to a compile.
					await new Promise((r) => window.setTimeout(r, 500));
					if (typeof view.printToPDF !== 'function') throw new Error(wsT('the print engine has no {call}', { call: 'printToPDF' }));
					// (printing: ten minutes for a print that never answers, the load's limit done with)
					step = 'printing';
					window.clearTimeout(bail);
					bail = window.setTimeout(late, 600000);
					const buf = await view.printToPDF(this.exportPdfOptions(o));
					window.clearTimeout(bail); done();
					if (!buf || !buf.length) {
						reject(new Error(wsT('the print engine returned nothing')));
						return;
					}
					resolve(new Uint8Array(buf));
				} catch (e) {
					window.clearTimeout(bail); done();
					reject(e instanceof Error ? e : new Error(wsStr(e)));
				}
			})(); });
		});
	},
};
export type ExportMethods = typeof exportMethods;
