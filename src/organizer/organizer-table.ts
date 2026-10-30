// Word-Smith — organizer-table.
//
// THE TABLE UNDER THE BAR: the scroller, the header row, the root row, the rows, the total row and the
// empty-lens line, and the scroll put back where the writer was. Lifted out of `drawOrg` (2026-10-30)
// with the seven helpers only it calls; `drawOrg` computes the rows and the bar, then hands them here.

import type { WordSmithSettings } from '../core/settings';
import { wsCatch, wsFlagSvg, wsListOf, wsMenu, wsSortArrow, wsStr, wsSvgInto } from '../core/preamble';
import { wsT, wsTq, wsUiJoin } from '../core/ui-text';
import type WordSmith from '../plugin/plugin';
import type { WsOrgCtx } from './org-ctx';
import { wsOrgCountsLine } from './organizer-chrome';
import type { WsOrgCol } from './organizer-cols';
import type { WsOrgColAgg } from './organizer-readings';
import type { WsOrgRow } from './organizer-rows';

// A SENTENCE WITH A CONTROL IN IT (A695): the line is one key, with `slot` where the button stands, so a
// translation puts the button where its grammar wants it; this cuts it in two around the slot. The tools' echo
// marks the whole line, so each half keeps the marks (ws-dev/ui-pseudo-panes.js reads a text node at a time).
function wsOrgAround(line: string, slot: string): [string, string] {
	const marked = line.startsWith('⟦') && line.endsWith('⟧');
	const body = marked ? line.slice(1, -1) : line;
	const at = body.indexOf(slot);
	const a = at === -1 ? body : body.slice(0, at);
	const b = at === -1 ? '' : body.slice(at + slot.length);
	return marked ? [a ? '⟦' + a + '⟧' : '', b ? '⟦' + b + '⟧' : ''] : [a, b];
}

// The name column's accent snapped to whole device pixels (lifted out of drawOrg, A488).
function wsOrgSnapAccent(a: { ctx: WsOrgCtx; orgZoomOf: (el: HTMLElement) => number; table: HTMLTableElement }) {
	const { ctx, orgZoomOf, table } = a;
	const w0 = ctx.ownerWin();
	const dpr = (w0 && w0.devicePixelRatio) || 1;
	// FROM THE WINDOW, AND WALKED UP FROM THE TABLE. NOT FROM `host`: the
	// `host` in scope here is the window's, which is not always an element
	// (`orgNameLine` has its own, `wrap.parentElement`). `table` is an
	// element in both.
	const scope: HTMLElement | null = table.closest('.ws-uni-modal')
		|| table.closest('.modal') || table.ownerDocument.documentElement;
	// THE RATIO GOES ON THE WINDOW, THE SNAP ON THE MARK. They are two
	// different facts knowable at different times: the ratio is true of
	// the whole window from the first paint, while the snap needs the mark
	// to EXIST and be laid out. Inherited from here, the width is right on
	// both surfaces from the start; the position follows on the next draw.
	if (scope && scope.style) {
		scope.style.setProperty('--ws-dpr', String(dpr));
	}
	// EVERY MARKED ROW: the active one and each selected one wear the bar,
	// and a bar not snapped straddles two device columns.
	const marks = Array.from<HTMLElement>(table.querySelectorAll(
		'.ws-org-row.ws-org-active td.ws-org-name, .ws-org-row.is-selected td.ws-org-name'));
	for (const el of marks) {
		if (!el) continue;
		try {
			el.setCssProps({ '--ws-dpr': String(dpr), '--ws-org-snap': '0px' });
			const off = parseFloat(
				w0.getComputedStyle(el, '::before').insetInlineStart);
			if (!isFinite(off)) continue;
			// IN THE FRAME THE SNAP IS WRITTEN IN. `off` is a computed length —
			// the element's own frame — and the rect is the zoomed one, so at any
			// zoom but 1 the sum of the two would be of two different units.
			const zoom = orgZoomOf(el);
			const x = el.getBoundingClientRect().left / zoom + off;
			// ── SNAP TO THE GUIDE, NOT TO THE PIXEL GRID ──
			//
			// The guide is Obsidian's own border and lands where its layout puts
			// it — not on the device grid — so snapping to the grid moves the bar
			// AWAY from the line it exists to sit on. SO THE GUIDE IS THE TARGET
			// WHEN THERE IS ONE: the `- 4.8px` in the stylesheet gets the bar close
			// from a measurement taken once; this puts it exactly there, per row,
			// at whatever depth and whatever that inset really is today. The
			// constant is the first guess and the measurement is the answer.
			const box = (typeof el.closest === 'function')
				? el.closest('.tree-item-children') : null;
			let want = null;
			if (box) {
				const bx = box.getBoundingClientRect().left / zoom;
				if (isFinite(bx)) want = bx;
			}
			// NO GUIDE, NO TARGET. The table's mark has no indentation line beside
			// it, so it keeps the device grid — a hairline with nothing to align
			// to should at least be crisp.
			if (want === null) want = Math.round(x * dpr) / dpr;
			el.style.setProperty('--ws-org-snap', (want - x).toFixed(3) + 'px');
		} catch (_) { wsCatch('orgTableMake / orgSnapAccent: el.style.setProperty(\'--ws-dpr\', String(dpr));', _); }
	}
}

// The name column's ruled line, measured and placed (lifted out of drawOrg, A488).
function wsOrgNameLine(a: { ctx: WsOrgCtx; nameTh: HTMLTableCellElement; orgSnapAccent: () => void; orgZoomOf: (el: HTMLElement) => number; table: HTMLTableElement; wrap: HTMLDivElement }) {
	const { ctx, nameTh, orgSnapAccent, orgZoomOf, table, wrap } = a;
	try {
		const host = wrap.parentElement;
		if (!host) return;
		// The variables are REMOVED rather than zeroed: the host keeps its
		// style attribute across a redraw, so a stale width left behind would
		// put a line down the pane the moment anything else repainted it.
		host.style.removeProperty('--ws-org-outw');
		const zoom = orgZoomOf(nameTh);
		let w = nameTh.getBoundingClientRect().width / zoom;
		if (!(w > 0)) return;
		// ── THE NAME TAKES THE ROOM THE READINGS LEAVE ──
		//
		// On a narrow pane the stylesheet caps the name at 150px so six
		// readings can share a phone. With TWO readings that cap leaves half
		// the screen empty while every name truncates. So the room is measured
		// — the wrap's width less what the other columns take — and handed to
		// the sheet as the FLOOR of that cap; 32ch stays the ceiling, as on the
		// desktop.
		//
		// The readings' width is the table less the name, which does not
		// depend on the name, so this does not chase its own tail; and the
		// name is re-measured after the stamp, so the seam below is drawn from
		// the width the column actually ends up with.
		try {
			const narrow = !!(ctx.orgNarrowNow && ctx.orgNarrowNow());
			if (narrow) {
				const tableW = table.getBoundingClientRect().width / zoom;
				const room = Math.floor(wrap.clientWidth - Math.max(0, tableW - w));
				const was = table.style.getPropertyValue('--ws-org-nameroom');
				const now = room > 0 ? room + 'px' : '';
				// AND THE CEILING A DRAG MAY REACH. A dragged width wins on a narrow
				// pane, and a width dragged on the DESKTOP is in the same store — so
				// the sheet is told where the grip would have stopped, from the same
				// host the grip asks: the SCROLLER, whose client width is the table's
				// room. The host beside it is 20px wider — the vertical bar and the
				// inset — and a name at that ceiling put the table 12px over.
				const ceil = ctx.orgColCeil(wrap);
				const ceilNow = ceil > 0 ? ceil + 'px' : '';
				const ceilWas = table.style.getPropertyValue('--ws-org-nameceil');
				if (was !== now || ceilWas !== ceilNow) {
					if (now) table.style.setProperty('--ws-org-nameroom', now);
					else table.style.removeProperty('--ws-org-nameroom');
					if (ceilNow) table.style.setProperty('--ws-org-nameceil', ceilNow);
					else table.style.removeProperty('--ws-org-nameceil');
					w = nameTh.getBoundingClientRect().width / zoom;
				}
			} else if (table.style.getPropertyValue('--ws-org-nameroom')
				|| table.style.getPropertyValue('--ws-org-nameceil')) {
				table.style.removeProperty('--ws-org-nameroom');
				table.style.removeProperty('--ws-org-nameceil');
				w = nameTh.getBoundingClientRect().width / zoom;
			}
		} catch (_) { wsCatch('orgNameLine / nameroom: const narrow = !!(ctx.orgNarrowNow && ctx.orgNarrowNow());', _); }
		// THE WRAP'S OWN INSET COUNTS. The seam is positioned against the HOST
		// and the column is measured inside the WRAP, and the wrap does not
		// start at the host's left edge.
		host.style.setProperty('--ws-org-nameline',
			Math.round(wrap.offsetLeft + w) + 'px');
		host.style.setProperty('--ws-org-nametop',
			Math.round(wrap.offsetTop) + 'px');
		// AND THE HEADER'S OWN HEIGHT, for a finger's Name grip to be exactly
		// as tall as the header it lives on. Measured, not the token: the
		// heading is `height: 44px` under a finger and measures 49 — a table
		// cell's height is a minimum, and the narrow pane's padding-block adds
		// to it.
		host.style.setProperty('--ws-org-headh',
			(nameTh.getBoundingClientRect().height / zoom).toFixed(2) + 'px');
		// AND IT STOPS WITH THE ROWS: the logical stop is the last row,
		// because that is where the columns it separates end. CLAMPED TO THE
		// PANE, or a table taller than its pane would stamp a height that
		// reaches past the bottom of the window.
		//
		// AND NOT ROUNDED. Every row height here is fractional (23.6px rows, a
		// 24.4px header), so rounding to a whole pixel cannot land on a row
		// edge except by accident — and the grip takes this as its height. TWO
		// DECIMALS, NOT NONE: the raw double would stamp a seventeen-digit
		// string into a style attribute on every draw; hundredths are finer
		// than a device pixel at any ratio this runs at.
		//
		// (A SILENT CATCH AROUND A WHOLE FUNCTION BODY IS A PLACE A MISSING
		// LINE CAN HIDE: `tall` once went missing here, and the symptom was a
		// grip 23.6px tall with no error anywhere.)
		const tall = Math.min(table.getBoundingClientRect().height / zoom,
			wrap.clientHeight);
		host.style.setProperty('--ws-org-nameend',
			Math.max(0, tall).toFixed(2) + 'px');
	} catch (_) { wsCatch('orgTableMake / orgNameLine: const host = wrap.parentElement;', _); }
	// WITH THE SEAM, so the accent is re-snapped by every trigger the
	// seam already has — the synchronous stamp, the ResizeObserver on
	// the table, and the task queued after the build. A pane dragged
	// narrower moves the cell, which moves the bar off the grid.
	// GUARDED ON ITS OWN. This is decoration; the seam and the grip
	// height above are structure. A throw in here must not take them
	// with it — which it can, because the stamp above sits in a try
	// whose catch is silent, so the failure would show up as a grip
	// with no height and no error anywhere.
	try { orgSnapAccent(); } catch (_) { wsCatch('orgTableMake / orgNameLine: orgSnapAccent();', _); }
}

// THE HEADER ROW: one <th> per column (lifted out of drawOrg, A488).
function wsOrgDrawHeads(plugin: WordSmith, a: { cols: WsOrgCol[]; ctx: WsOrgCtx; fill: () => Promise<void>; hr: HTMLTableRowElement; s: WordSmithSettings; sortCol: WsOrgCol | null; sortDir: string; wrap: HTMLDivElement }) {
	const { cols, ctx, fill, hr, s, sortCol, sortDir, wrap } = a;
	for (const col of cols) {
		const th = hr.createEl('th', { cls: ctx.colTextish(col) ? 'is-text' : '' });
		th.setAttribute('data-col', col.id);
		// NAMED, so it can be given a box of its own to be clipped in.
		// The `th` cannot do it: the resize grip is a CHILD of this cell
		// and hangs 3px past its right edge and the whole height of the
		// table, so `overflow: hidden` here would clip the control the
		// writer just asked to be able to grab.
		th.createSpan({ cls: 'ws-org-headlabel', text: col.label });
		// ── THE STORED WIDTH, IF THERE IS ONE ──────────────────
		//
		// Absent means "the table decides", which is what every
		// column has always got and what a double-click hands back.
		// All three properties, because a `<table>` treats `width` as
		// a suggestion and will overrule it from the content alone.
		ctx.orgColStamp(th, col.id, wrap);
		ctx.orgColGripBind(th, col, wrap);
		if (sortCol && sortCol.id === col.id) {
			th.createSpan({ cls: 'ws-org-sortmark',
				text: wsSortArrow(sortDir) });
		}
		// desc → asc → custom. A click is a LENS, so it goes through the
		// lens's one writer.
		th.title = wsT('Sort: newest-biggest first, then smallest, then the book’s order');
		th.addEventListener('click', () => {
			// NOT THE ONE THAT ENDS A DRAG. See `orgGripReleasedAt`: the
			// click a grip release synthesises lands here, because the
			// grip itself takes no pointer events.
			if (Date.now() - ctx.orgGripReleasedAt < ctx.ORG_GRIP_CLICK_MS) return;
			const cur = ctx.orgLens.sort;
			if (!cur || cur.id !== col.id) {
				ctx.orgLensSet({ sort: { id: col.id, dir: 'desc' } });
			} else if (cur.dir === 'desc') {
				ctx.orgLensSet({ sort: { id: col.id, dir: 'asc' } });
			} else {
				ctx.orgLensSet({ sort: null });
			}
		});
		// ── AND A DRAG MOVES IT ──────
		// A drop TAKES THE TARGET'S PLACE (not a swap), the hidden columns keep
		// their rank, `uniColOrder` is the one store. The NAME header is
		// outside this loop on purpose — it is the sticky first column and does
		// not move.
		th.setAttribute('draggable', 'true');
		th.addEventListener('dragstart', (ev: DragEvent) => {
			ctx.orgDragCol = col.id;
			try { if (ev.dataTransfer) ev.dataTransfer.setData('text/plain', col.id); } catch (_) { wsCatch('orgTableMake / drawOrg: ev.dataTransfer.setData(\'text/plain\', col.id);', _); }
		});
		th.addEventListener('dragover', (ev: Event) => {
			if (ctx.orgDragCol && ctx.orgDragCol !== col.id) ev.preventDefault();
		});
		// the column lands before this one; the order is saved and the table redrawn
		const dropCol = async (moved: string) => {
			const now: string[] = cols.map((x) => x.id);
			const from = now.indexOf(moved);
			if (from !== -1) now.splice(from, 1);
			const at = now.indexOf(col.id);
			now.splice(at === -1 ? now.length : at, 0, moved);
			const rest = (Array.isArray(s.uniColOrder) ? s.uniColOrder : [])
				.filter((id) => now.indexOf(id) === -1);
			s.uniColOrder = now.concat(rest);
			await plugin.saveSettings();
			ctx.drawPanel();
		};
		th.addEventListener('drop', (ev: Event) => {
			ev.preventDefault();
			const moved = ctx.orgDragCol;
			ctx.orgDragCol = null;
			if (!moved || moved === col.id) return;
			void dropCol(moved);
		});
		th.addEventListener('dragend', () => { ctx.orgDragCol = null; });
		// ── AND A RIGHT-CLICK ON THE HEADER ─────────────────────────
		//
		// A gesture is not a door, and this is not the only door to any of
		// these: Sort and Filter are bar buttons, the columns are the
		// Properties panel. It is an extra ENTRY POINT into the same state.
		// The header is still the sort control on a plain click, which is
		// why the two sort rows say ↑ and ↓ rather than repeating the
		// cycle: the click cycles, the menu picks.
		th.addEventListener('contextmenu', (ev: MouseEvent) => {
			ev.preventDefault();
			ev.stopPropagation();
			const menu = wsMenu();
			menu.addItem((i) => i.setTitle(col.label).setIsLabel(true));
			menu.addItem((i) => i.setTitle(wsT('Sort \u2191'))
				.setIcon('arrow-up')
				.onClick(() => ctx.orgLensSet({
					sort: { id: col.id, dir: 'asc' } })));
			menu.addItem((i) => i.setTitle(wsT('Sort \u2193'))
				.setIcon('arrow-down')
				.onClick(() => ctx.orgLensSet({
					sort: { id: col.id, dir: 'desc' } })));
			// FILTER ONLY WHERE THERE ARE VALUES TO ENUMERATE. A reading
			// is arithmetic over the note, not a value the note carries,
			// and `orgDistinctUnder` has nothing to answer with — a row
			// that always ends in "No values for Words" is a control
			// that only ever apologises.
			const fkey = col.user ? String(col.key)
				: (col.id === 'tags' ? 'tags' : '');
			if (fkey) {
				menu.addItem((i) => i.setTitle(wsT('Filter by this\u2026'))
					.setIcon('list-filter')
					.onClick(() => ctx.orgFilterByKey(fkey, ev)));
			}
			menu.addSeparator();
			// This plugin shows and hides columns; Obsidian deletes properties.
			menu.addItem((i) => i.setTitle(wsT('Hide this column'))
				.setIcon('eye-off')
				.onClick(async () => {
					ctx.colOff.add(col.id);
					s.uniColsOff = Array.from<string>(ctx.colOff);
					await plugin.saveSettings();
					void fill(); ctx.drawPanel();
				}));
			// RIGHT UNDER IT: the same act the Properties panel's row calls — one
			// fit, two doors — with the panel row's own words.
			menu.addItem((i) => i.setTitle(wsT('Resize columns to fit'))
				.setIcon('move-horizontal')
				.onClick(() => { if (ctx.orgColFitNow) ctx.orgColFitNow(); }));
			// WHERE DELETION LIVES NOW: a note's property is removed in
			// Obsidian's own Properties view or by editing the
			// frontmatter; a non-md file's is removed by CLEARING ITS
			// CELL, which drops the row from `ws-structure.md`.
			try { menu.showAtMouseEvent(ev); }
			catch { try { menu.showAtPosition({ x: 0, y: 0 }); } catch (_e) { wsCatch('orgTableMake / drawOrg: menu.showAtPosition( x: 0, y: 0 );', _e); } }
		});
	}
}

// THE VAULT'S TOTAL ROW COUNTS WHAT IT CANNOT ADD (A752, the writer: "in the total row show the numer of deadline x
// deadlines", "in the total row say x targets", "in the total row say how many file types, same for footnotes,
// backlinks, outgoing links"): with no target or deadline of the vault's own, how many are set in it (a note's and a
// folder's, of files that are there); how many kinds of file, each kind on the hover; every link in, every link out.
// (Footnotes already add up.) A folder's root row keeps its own target and deadline (A700).
function wsOrgTotalSay(plugin: WordSmith, ctx: WsOrgCtx, id: string, paths: string[]): WsOrgColAgg | null {
	const there = (p: string) => !!p && !!plugin.app.vault.getAbstractFileByPath(p);
	if (id === 'goal' || id === 'deadline') {
		const goals = plugin.settings.fileGoals || {}, folders = plugin.settings.folderTargets || {}, days = plugin.settings.goalDeadlines || {};
		const keys = id === 'goal'
			? Object.keys(goals).filter((p) => Number(goals[p]) > 0).concat(Object.keys(folders).filter((p) => Number(folders[p]) > 0))
			: Object.keys(days).filter((p) => !!days[p]);
		const n = new Set(keys.filter(there)).size;
		if (!n) return null;
		if (id === 'goal') return { text: n === 1 ? wsT('{n} target', { n }) : wsT('{n} targets', { n }) };
		return { text: n === 1 ? wsT('{n} deadline', { n }) : wsT('{n} deadlines', { n }) };
	}
	if (id === 'ftype') {
		const kinds = new Map<string, number>();
		for (const p of paths) { const m = /\.([A-Za-z0-9]+)$/.exec(p); if (m) { const k = m[1].toLowerCase(); kinds.set(k, (kinds.get(k) || 0) + 1); } }
		const n = kinds.size;
		if (!n) return null;
		const each = Array.from(kinds.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, c]) => c.toLocaleString() + ' ' + k);
		return { text: n === 1 ? wsT('{n} file type', { n }) : wsT('{n} file types', { n }), title: wsUiJoin(each) };
	}
	if (id === 'backlinks' || id === 'outlinks') {
		let n = 0;
		for (const p of paths) n += wsListOf(ctx.orgColRaw({ id }, p)).length;
		return n ? { text: n.toLocaleString() } : null;
	}
	return null;
}

// THE ROOT ROW at the head of the table, or at the vault the Total row at its
// foot (lifted out of drawOrg).
function wsOrgDrawRoot(plugin: WordSmith, a: { at: string; cols: WsOrgCol[]; ctx: WsOrgCtx; orgLensEmptied: boolean; tbody: HTMLTableSectionElement; wrap: HTMLDivElement }) {
	const { at, cols, ctx, orgLensEmptied, tbody, wrap } = a;
	if (!orgLensEmptied) {
		// A FOLDER YOU OPENED IS THE FIRST ROW: its glyph, its name and its
		// figures (everything under it, read from the index), the rows under it
		// one step in. Pinned under the column headings, so the figures stay in
		// view however far the table scrolls. Its menu is the folder's own.
		//
		// THE VAULT IS NOT A ROW: opened on the whole vault, the same figures
		// stand in a Total row at the foot, as they did before the root row came
		// back, and the rows stand at the edge with nothing to hang from.
		const isRoot = !!at;
		const subj = tbody.createEl('tr', { cls: 'ws-org-subrow ' + (isRoot ? 'is-root' : 'is-total') });
		subj.remove();
		const std = subj.createEl('td', { cls: 'ws-org-name' });
		const box = std.createDiv({ cls: 'ws-org-subject-in' });
		try { std.setCssProps({ '--ws-org-depth': '0' }); }
		catch (_) { wsCatch('orgTableMake / drawOrg: std.setCssProps({ --ws-org-depth: 0 });', _); }
		const rootName = isRoot ? ctx.nameOf(at) : wsT('Total');
		if (isRoot) {
			// ITS CHEVRON FOLDS THE WHOLE TABLE UNDER IT, as a folder row's folds
			// its own: shut, only this row and its figures stay. The session holds
			// it (`ses.rootShut`), so a fresh window opens with everything shown.
			const rootOpen = !(ctx.ses && ctx.ses.rootShut);
			const twist = ctx.orgChevron(box, rootOpen);
			twist.title = rootOpen ? wsT('Fold everything under this folder') : wsT('Unfold everything under this folder');
			twist.addEventListener('click', (ev: Event) => {
				ev.stopPropagation();
				if (ctx.ses) ctx.ses.rootShut = rootOpen;
				ctx.drawPanel();
			});
			// The folder's own glyph, open or shut with its chevron, in its colour.
			plugin.orgFolderIcon(box, at, rootOpen);
			subj.addEventListener('contextmenu', (ev: MouseEvent) => {
				ev.preventDefault();
				ev.stopPropagation();
				const menu = wsMenu();
				plugin.outlinerRowMenu(menu, { path: at, kind: 'folder' }, ctx.orgMenuCtx);
				try { menu.showAtMouseEvent(ev); } catch (_) { wsCatch('wsOrgDrawRoot: menu.showAtMouseEvent(ev);', _); }
			});
		}
		box.createSpan({ cls: 'ws-org-subjectname', text: rootName });
		// THE COUNTS THE PATH LINE CARRIED, on the hover: the notes, the other
		// files beside them, the tasks.
		const under0 = ctx.orgUnder(at);
		const agg0 = plugin.orgAggUnder(at);
		const counts = wsOrgCountsLine(agg0, agg0 ? Math.max(0, under0.length - agg0.files) : 0);
		std.title = isRoot
			? (counts ? wsT('Everything under {name}: {counts}', { name: rootName, counts }) : wsT('Everything under {name}', { name: rootName }))
			: (counts ? wsT('Everything in the vault: {counts}', { counts }) : wsT('Everything in the vault'));
		const subUnder = ctx.orgUnder(at);
		// ONE DRAWER FOR AN AGGREGATE, the total row's and the folder rows'
		// alike: text for most, and for the Flag column a number and the
		// flag's own glyph per flag — `2 ▸ 3 ▸`, each pair one span so the gap
		// between pairs is the sheet's and not a space character's.
		const aggInto = (td: HTMLElement, agg: WsOrgColAgg) => {
			if (!agg) return;
			if (agg.flags) {
				td.addClass('ws-org-aggflags');
				for (const f of agg.flags) {
					const pair = td.createSpan({ cls: 'ws-org-aggflag' });
					pair.createSpan({ cls: 'ws-org-aggflagn', text: String(f.n) });
					const ic = pair.createSpan({ cls: 'ws-org-flagic' });
					wsSvgInto(ic, wsFlagSvg(String(f.id), 10));
					pair.title = f.n === 1 ? wsT('{n} file {flag}', { n: f.n, flag: f.label }) : wsT('{n} files {flag}', { n: f.n, flag: f.label });
				}
			} else {
				td.setText(agg.text);
			}
			// a folder's target wears the band its notes wear
			if (agg.goal) ctx.orgGoalBand(td, agg.goal.words, agg.goal.target);
			if (agg.title) td.title = agg.title;
		};
		ctx.orgAggInto = aggInto;
		for (const col of cols) {
			const td = subj.createEl('td',
				{ cls: ctx.colTextish(col) ? 'is-text' : '' });
			td.setAttribute('data-col', col.id);
			// THE WIDTH REACHES THE CELL, not only the header — see
			// `orgColStamp`. Without this the column is as wide as its
			// widest cell whatever the header asks for.
			ctx.orgColStamp(td, col.id, wrap);
			// (its own target, deadline and plan: the folder the window is opened on, or the vault's, A700)
			const agg = ctx.orgColAgg(col, subUnder, at || '');
			// …AND SET WHERE THEY ARE READ (A700, the writer: "let me hove on the root folder too"): the folder the window is
			// opened on, or the vault's own on the Total row. A row of its own, `idx` -1: never a selection's.
			// (the vault's Total row: what it cannot add, counted, A752)
			const many = isRoot ? null : wsOrgTotalSay(plugin, ctx, col.id, subUnder);
			if (col.id === 'goal' || col.id === 'deadline') {
				const self: WsOrgRow = { path: at || '', parent: '', kind: 'folder', group: '', depth: 0, rel: '', idx: -1 };
				// (its own first; the count only while the vault has none, a click still setting it)
				const say = agg ? agg.text : (many ? many.text : '');
				if (col.id === 'goal') ctx.orgGoalCell(td, self, say, agg && agg.goal ? agg.goal : null);
				else ctx.orgDeadlineCell(td, self, say, agg && agg.title ? agg.title : '');
				if (!agg && many) td.title = col.id === 'goal' ? wsT('Click to set a target') : wsT('Click to set a deadline');
				continue;
			}
			// THE FOLDER THE WINDOW IS OPENED ON COUNTS ITS VOCABULARY TOO (the writer: "sometimes the vocabulary for the
			// folder wont show up", 2026-10-22): a folder like the ones under it, its notes' words counted once and drawn
			// when they are read (A792); it was left to the vault's Total row's rule, which never asks
			if (col.id === 'vocab' && isRoot) {
				const put = (v: WsOrgColAgg) => { td.empty(); td.addClass('ws-org-aggcell'); td.setText(v.text); if (v.title) td.title = v.title; };
				const now = ctx.orgFolderVocab(at, ctx.orgUnder(at), (v) => { if (td.isConnected) put(v); });
				if (now) put(now);
				continue;
			}
			if (many) aggInto(td, many);
			else if (agg) aggInto(td, agg);
		}
		// AND THE PICKER’S COLUMN, so the row is not one cell short
		// and the table draws level - the same trailing cell every
		// other row emits, for the same reason. In Outline the subject
		// spans instead, exactly as the rows under it do.
		subj.createEl('td', { cls: 'ws-org-pickcell' });
		ctx.orgRootRow = subj;
	}
}

// THE ROWS: one <tr> per file or folder (lifted out of drawOrg, A488).
function wsOrgDrawRows(plugin: WordSmith, a: { cols: WsOrgCol[]; ctx: WsOrgCtx; lensed: boolean; nums: Map<string, string> | null; rooted: boolean; rows: WsOrgRow[]; tbody: HTMLTableSectionElement; wrap: HTMLDivElement }) {
	const { cols, ctx, lensed, nums, rooted, rows, tbody, wrap } = a;
	let prevRuled = true;
	for (const row of rows) {
		const isFolder = row.kind === 'folder';
		// KEEPS `ws-org-row`, and that is a decision rather than a convenience:
		// it is the class the first-column freeze, the touch-drag row list and
		// the measurements all select on.
		const tr = tbody.createEl('tr',
			{ cls: 'ws-org-row' + (isFolder ? ' is-folder' : '') + (isFolder && !prevRuled ? ' is-topline' : '') });
		prevRuled = isFolder;
		tr.setAttribute('data-path', row.path);
		// The followed note is marked HERE too: the table is where the folder
		// is read.
		if (row.path === ctx.orgNote) tr.addClass('ws-org-active');
		// A ROW IN THE SELECTION WEARS IT, across a redraw too.
		if (!isFolder && ctx.orgSelHas(row.path)) tr.addClass('is-selected');
		const nameTd = tr.createEl('td', { cls: 'ws-org-name' });
		// A TABLE CELL AGAIN, WITH THE FLEX ROW INSIDE IT. A cell that is
		// itself `display: flex` is a flex box in an anonymous cell rather than
		// a cell: it stops at its own content while a taller cell sets the row
		// (a checkbox property makes the row 25px, a phone-sized hit 44), and
		// the guide painted on the cell — and the cell's own opaque background
		// — ends short of every such row. `height: 100%` and `align-self` do
		// nothing for a flex box in that position. So the chevron, the glyph,
		// the label and the tag sit in this wrapper, which is the flex row, and
		// the cell stretches with its row as cells do.
		//
		// THE NUMBER FIRST, at the cell's left edge before the indent — a
		// column of its own inside the sticky Name, so the seam and the guides
		// need not learn about a second column.
		if (nums && nums.has(row.path)) {
			nameTd.createSpan({ cls: 'ws-org-num', text: nums.get(row.path) });
		}
		const nameIn = nameTd.createDiv({ cls: 'ws-org-namein' });
		// THE ROW'S KIND, drawn by the tree's own builder — same dropdown, same
		// checked names, so a note reads as a note and a PDF as a PDF in both
		// places. BEFORE the label, which is where the tree puts it and where
		// the eye looks for it.
		// THE INDENT, as a depth the stylesheet turns into padding:
		// the step is read from Obsidian's own --nested-item-* vars
		// there, which is where the tree beside this table reads it,
		// so both panes step by the same amount under any theme. A top-level
		// row is depth 0. A lens draws no folder rows, so the guide lines a
		// depth would draw point at rows that are not on screen: under a
		// lens every row is at 0.
		// ONE STEP IN, UNDER A FOLDER'S ROOT ROW: every row drawn sits under it,
		// a lensed row too, so its guide leads back to it. At the vault there is
		// no root row, and the top level stands at the edge.
		try {
			nameTd.style.setProperty('--ws-org-depth',
				String((rooted ? 1 : 0) + (lensed ? 0 : (row.depth || 0))));
		} catch (_) { wsCatch('orgTableMake / drawOrg: nameTd.style.setProperty(\'--ws-org-depth\',', _); }
		// A FOLDER'S CHEVRON IS ITS DOOR. Every control needs a visible one,
		// and folding is the only thing here that has no other way in.
		if (isFolder) {
			const open = ctx.orgIsOpen(row.path);
			const twist = ctx.orgChevron(nameIn, open);
			twist.title = open ? wsT('Fold this folder') : wsT('Unfold this folder');
			twist.addEventListener('click', (ev: Event) => {
				ev.stopPropagation();
				ctx.orgOpenSet(row.path, !ctx.orgIsOpen(row.path));
			});
		} else {
			// ── AND A NOTE RESERVES THE SLOT ───────────────────────────
			//
			// A folder row spends 16px of chevron plus 2px of margin that a note
			// row would spend nothing on, and the indent step is only 16px — so
			// without the spacer a note's glyph drew LEFT of its parent folder's.
			// Obsidian's explorer reserves it, and the menu pane draws the same
			// spacer for the same reason.
			//
			// IT WEARS THE APP'S CHEVRON BOX TOO, empty: that is how it is
			// guaranteed to be exactly as wide as the real one under any theme. A
			// DIFFERENT CLASS FROM THE REAL ONE, deliberately: seven places reach
			// for the first `.ws-org-twist` in a row and click it, and a blank one
			// answering them would be a dead door reporting as a live one.
			nameIn.createSpan({ cls: 'ws-org-twistgap tree-item-icon'
				+ ' collapse-icon nav-folder-collapse-indicator' });
		}
		// A FOLDER WEARS THE TREE'S FOLDER GLYPH, drawn open or shut
		// to match its own state; a note wears its kind glyph.
		// `orgKindIcon` tests for `.md` and would give a folder the
		// generic file glyph, which is the sort of miss that reads
		// as a theme problem rather than a wiring one.
		if (isFolder) ctx.orgFolderIcon(nameIn, row.path, ctx.orgIsOpen(row.path));
		else plugin.orgKindIcon(nameIn, row.path);
		// The label wears a class because the rename finds it by one:
		// a bare span would make the lookup positional, and the first
		// markup change would point the rename at the wrong element.
		// ── THE FOLDER LEADS, THE FILE FOLLOWS ──────────────────
		//
		// Folder paths vary in length, so the file names no longer align down
		// a left edge; the order is what was asked for. ORDER IN THE DOM, NOT
		// `order:` IN THE SHEET. The cell is a flex row and CSS could reorder
		// it — but the tick box and the kind glyph are flex items here too,
		// and an `order` that only mentions two of four is a rule the next
		// item silently joins the wrong side of. It also keeps reading order
		// and paint order the same thing, which is what a screen reader gets.
		if (lensed && row.rel) {
			nameIn.createDiv({ cls: 'ws-org-path', text: row.rel });
		}
		nameIn.createSpan({ cls: 'ws-org-namelabel', text: ctx.nameOf(row.path) });
		// AND THE FORMAT IS SAID IN WORDS, AFTER THE NAME — the labels
		// Obsidian's own explorer draws. A note gets none, because every row
		// in a vault would carry the same word.
		if (!isFolder) plugin.orgKindTag(nameIn, row.path);
		// THE WHOLE LOCATION ON HOVER, now that the row shows both
		// halves: a truncated cell is exactly when a writer asks.
		nameTd.title = (lensed && row.rel)
			? row.rel + ' / ' + ctx.nameOf(row.path)
			: ctx.nameOf(row.path);
		// THE FLAG IS STILL A FILE'S — see below. `markOf` returns '' for a
		// folder, so a flag there would be a control that cycles nothing.
		for (const col of cols) {
			const td = tr.createEl('td', { cls: ctx.colTextish(col) ? 'is-text' : '' });
			td.setAttribute('data-col', col.id);
			ctx.orgColStamp(td, col.id, wrap);
			// A FOLDER'S CELLS ARE ITS SUBTREE'S TOTAL, the way Scrivener's Total
			// columns do it. Taken from the INDEX via `orgUnder`, never from the
			// drawn rows: read off what is on screen, shutting a folder would
			// change its own number, and a fold that moves a total is a fold
			// acting as a filter.
			if (isFolder) {
				const agg = ctx.orgColAgg(col, ctx.orgUnder(row.path), row.path);
				// A FOLDER'S OWN TARGET AND DEADLINE ARE ITS OWN, set where they are read (A700): no summary weight
				if (col.id === 'goal') { ctx.orgGoalCell(td, row, agg ? agg.text : '', agg && agg.goal ? agg.goal : null); continue; }
				if (col.id === 'deadline') { ctx.orgDeadlineCell(td, row, agg ? agg.text : '', agg && agg.title ? agg.title : ''); continue; }
				// A FOLDER'S VOCABULARY (A792): its notes' words counted once, drawn when they are read (orgFolderVocab);
				// the Total row never asks
				if (col.id === 'vocab') {
					const put = (a: WsOrgColAgg) => { td.empty(); td.addClass('ws-org-aggcell'); td.setText(a.text); if (a.title) td.title = a.title; };
					const now = ctx.orgFolderVocab(row.path, ctx.orgUnder(row.path), (a) => { if (td.isConnected) put(a); });
					if (now) put(now);
					continue;
				}
				if (agg) {
					// A SUMMARY IS NOT A MEASUREMENT: folder aggregate cells render in a
					// visibly different weight from note values, so nobody reads a
					// folder's average as a measurement. It matters most for the weighted
					// grade, which is a figure no note actually carries.
					td.addClass('ws-org-aggcell');
					// THE TOTAL ROW'S DRAWER: a folder's flags are a number and a glyph
					// per flag, drawn the same in both.
					if (ctx.orgAggInto) ctx.orgAggInto(td, agg);
					else { td.setText(agg.text); if (agg.title) td.title = agg.title; }
				}
				continue;
			}
			const text = ctx.orgColText(col, row.path);
			// ── MALFORMED FRONTMATTER IS VISIBLE, NOT PLAUSIBLE ──────
			//
			// A value that does not parse as its DECLARED type is drawn muted with
			// the raw string on hover — `28 07` sitting in a date. ASKED ONLY OF
			// THE PROPERTY COLUMNS, which is what `col.user` marks. The built-in
			// readings are computed by this plugin, not typed by a person, so there
			// is nothing there to be malformed — and parse-checking them would
			// invent a way for a word count to look broken.
			if (col.user) {
				const raw = ctx.orgColRaw(col, row.path);
				const pk = col.key || col.id;
				const fmt = plugin.formatValue(pk, raw, plugin.orgPropType(pk),
					plugin.dateStyle());
				if (!fmt.ok) {
					td.addClass('ws-org-badval');
					td.title = plugin.orgPropType(pk)
						? wsT('This is not a valid {type}: {value}', { type: wsTq(plugin.orgPropType(pk)), value: wsStr(raw) })
						: wsT('This is not a valid value: {value}', { value: wsStr(raw) });
				}
			}
			// The mark and goal cells are CONTROLS as well as readings: the flag
			// cycles, the target edits.
			if (col.id === 'mark') { ctx.orgFlagCell(td, row, text); continue; }
			if (col.id === 'goal') { ctx.orgGoalCell(td, row, text); continue; }
			if (col.id === 'deadline') { ctx.orgDeadlineCell(td, row, text, ctx.orgPlanTitle('deadline', row.path)); continue; }
			if (col.id === 'tags') { ctx.orgTagsCell(td, row); continue; }
			// A FILE ROW ONLY. A folder has no backlinks of its own; its cell
			// is the aggregate over the notes beneath it, which is a count and
			// not a list of doors.
			if (col.id === 'backlinks' && !isFolder) {
				td.textContent = '';
				ctx.orgBackCell(td, row);
				continue;
			}
			if (col.id === 'outlinks' && !isFolder) {
				td.textContent = '';
				ctx.orgOutCell(td, row);
				continue;
			}
			// ── A PROPERTY IS WRITTEN WHERE IT IS READ ──────
			//
			// A property COLUMN's cell edits in place like the flag and the target
			// beside it.
			//
			// ── A CHECKBOX IS A BOX, NOT A TICK GLYPH ────
			//
			// `formatValue` answers '✓' for true and THE EMPTY STRING for false, so
			// the cell would be a tick or nothing at all — and an unticked box and
			// an empty cell are different facts: one says "not done", the other
			// "never answered". OBSIDIAN'S OWN INPUT, undressed: a bare
			// `input[type=checkbox]` is what the app styles for every other
			// checkbox a theme sees, so this takes the theme's look for free and
			// follows it when the theme changes. NOT DRAWN FOR A FOLDER ROW: that
			// cell is the aggregate over what is beneath it, a count and not a
			// state.
			if (col.user && !isFolder
				&& String(plugin.orgPropType(col.key || col.id)).toLowerCase() === 'checkbox') {
				// ── AND ABSENT IS NOT FALSE ──────
				//
				// A CHECKBOX HAS TWO STATES AND A PROPERTY HAS THREE. A box on every
				// row would make a note that has never carried the key look exactly
				// like one deliberately left unticked. SO THE CELL CYCLES, which is
				// this window's own grammar (the flag cell has always cycled):
				//
				// nothing  ->  ticked  ->  unticked  ->  nothing
				//
				// AND THAT IS THE ONLY WAY "DISPLAY NOTHING UNTIL I ADD IT" CAN HOLD:
				// once empty means absent, there has to be a road back to empty, or a
				// property could be added and never removed. The third press is that
				// road.
				const raw0 = ctx.orgColRaw(col, row.path);
				const rawv = (typeof raw0 === 'boolean' || typeof raw0 === 'string') ? raw0 : (raw0 == null ? '' : wsStr(raw0));
				const has = rawv !== null && rawv !== undefined && rawv !== '';
				td.textContent = '';
				const canEdit = ctx.orgCanHoldProps(row.path);
				if (canEdit) td.addClass('is-prop');
				const bx = has
					? td.createEl('input', { cls: 'ws-org-cellcheck' })
					: null;
				if (bx) {
					bx.type = 'checkbox';
					bx.checked = rawv === true;
					bx.disabled = !canEdit;
				}
				td.title = !canEdit
					? wsT('This kind of file cannot hold properties')
					: (!has
						? wsT('Not set \u2014 press to add it, ticked')
						: (rawv === true
							? wsT('Ticked \u2014 press to untick')
							: wsT('Unticked \u2014 press to remove it from this file')));
				// THE WHOLE CELL IS THE TARGET, which is the other half
				// of the report: a 13px box in a 24px row is a thing to
				// aim at, and the cell is not.
				// ONE WRITER FOR THE CYCLE, whichever element was pressed.
				// The box and the cell both land in `step`, and the next
				// state is worked out from the VALUE — not from what the
				// input is showing. A checkbox toggled by the browser has
				// already changed itself, and reading that back would
				// lose the third state before it was ever written.
				const nextOf = (v: string|boolean) => {
					if (v === null || v === undefined || v === '') return true;
					if (v === true) return false;
					return '';
				};
				const step = async () => {
					if (!canEdit) { ctx.orgPropRefuse(row.path); return; }
					const stored = plugin.propStoreHolds(row.path);
					ctx.orgRedrawPending = true;
					await ctx.orgPropSet(row.path,
						col.key || col.id, nextOf(rawv));
					if (stored) ctx.orgEditDone();
				};
				td.addEventListener('click', (ev: Event) => {
					ev.stopPropagation();
					void step();
				});
				if (bx) {
					// THE BROWSER'S OWN TOGGLE IS REFUSED. Left to itself the input would
					// flip to a state the cycle may not be going to — unticked is not what
					// follows unticked — and the redraw would then correct it in front of
					// the writer.
					bx.addEventListener('click', (ev: Event) => {
						ev.stopPropagation();
						ev.preventDefault();
						void step();
					});
				}
				// ── ONE REDRAW, AND NOT BEFORE THE WRITE LANDS ──────
				//
				// On-off-on is two redraws racing one write: the click sets the box
				// (on); a redraw reads the value BACK before `processFrontMatter` has
				// landed and Obsidian's cache has caught up, so it paints the old state
				// (off); the cache updates and it paints on again. A NOTE ALREADY GETS
				// ITS REDRAW FOR FREE — writing frontmatter changes the file, Obsidian
				// fires a metadata event and the index ring redraws — so asking for
				// another here is the second of the two. A STORE-HELD FILE FIRES
				// NOTHING, so that one still has to be asked. (`step` above is the one
				// writer; a `change` handler beside it would write twice for one
				// press.)
				continue;
			}
			if (col.user) { ctx.orgPropCell(td, row, col, text); continue; }
			td.setText(text);
			// The cap cuts, the hover answers — same trade the old
			// table made, kept because it is the right one. The plan's two readings say what they are for (A705).
			if (text) td.title = text;
		}
		// THE PICKER'S COLUMN, kept level: the header carries a cell, so every
		// row does.
		//
		// THE PICK CELL IS THE TABLE'S: the header picker needs a column to
		// sit in, and every row emits one so the table draws level.
		tr.createEl('td', { cls: 'ws-org-pickcell' });
		// SINGLE CLICK SHOWS, DOUBLE CLICK OPENS. FILES ONLY: a folder row
		// already has the one door folding has — its twist — and making the
		// row body navigate into the folder is a second act nobody asked for.
		//
		// GUARDED THE WAY THE BINDER ROW IS, and the same list. Every control
		// in these cells already stops propagation itself, so this changes
		// nothing TODAY — it is here so the next cell to grow a handler does
		// not have to remember. A TAG CHIP IS NOT ON THE LIST: it carries no
		// handler — it is text in a cell — so excluding it would make one
		// patch of the row inert for no reason a writer could see.
		const inCtl = (ev: Event) => !!(ev.target && ev.target !== tr
			&& (ev.target as HTMLElement).closest && (ev.target as HTMLElement).closest(
				'input, select, button, textarea, .ws-goals-chip,'
				+ ' .ws-goals-chev, .ws-org-twist'));
		tr.addEventListener('click', (ev: MouseEvent) => {
			if (inCtl(ev)) return;
			// ── A FOLDER ROW FOLDS ITSELF ON A NARROW SCREEN ────────
			//
			// The twist is 16 x 15.6px, the smallest control in the window and
			// the one that opens a folder. It reaches 28 x 44 under `is-narrow`
			// and no further, because its width IS the tree's indent per level —
			// at 44 a three-deep folder would spend 132px of a 390px screen on
			// indent alone. The row is 44 tall and costs nothing: the SAME act as
			// the twist, with a bigger target.
			//
			// NARROW ONLY. On a desktop the twist is a good target for a mouse,
			// and a whole row that folds on any stray click is worse than a small
			// one you aim at. `orgNarrowNow` reads the CLASS the ResizeObserver
			// maintains, not the platform flag — a docked 300px pane on a desktop
			// is narrow too. AND THE TWIST IS NOT DOUBLE-FIRED: `inCtl` already
			// names `.ws-org-twist`, so a tap on the chevron returns above.
			if (isFolder) {
				if (ctx.orgNarrowNow()) ctx.orgOpenSet(row.path, !ctx.orgIsOpen(row.path));
				return;
			}
			// ── A CLICK HERE SELECTS. IT DOES NOT NAVIGATE ─────────
			//
			// The way into a folder is Obsidian's explorer; a click on a note row
			// here selects it and shows it, a double click opens it. A MODIFIED
			// CLICK SELECTS: Ctrl/Cmd toggles the row, Shift takes the range over
			// the rows shown; the table is repainted for the tint and the note is
			// NOT shown — a click that gathers rows is not a click that opens one.
			// A plain click clears the selection and shows the note.
			if (ctx.orgSelClick(ev, row, rows.map((r0) => r0.path))) {
				if (ctx.orgSelPaint) ctx.orgSelPaint(tbody);
				return;
			}
			if (ctx.orgSelPaint) ctx.orgSelPaint(tbody);
			ctx.showItem({ path: row.path, kind: row.kind }, true);
		});
		tr.addEventListener('dblclick', (ev: MouseEvent) => {
			if (inCtl(ev) || isFolder) return;
			ctx.openRow({ path: row.path, kind: row.kind });
		});
		// The right-click is the tree's own menu — see orgMenuCtx.
		tr.addEventListener('contextmenu', (ev: MouseEvent) => {
			ev.preventDefault();
			ev.stopPropagation();
			const menu = wsMenu();
			plugin.outlinerRowMenu(menu,
				{ path: row.path, kind: row.kind }, ctx.orgMenuCtx);
			menu.showAtMouseEvent(ev);
		});
		// Drag exists only while the book's own order is showing — under any
		// lens this call is simply never made. A FOLDER ROW CARRIES BOTH:
		// reorder at its edges, and the move-into, so a note can be moved
		// between folders from the right pane.
		if (!lensed) {
			ctx.orgRowDrag(tr, row);
			if (isFolder) ctx.orgGroupDrop(tr, row.path);
		}
	}
	return prevRuled;
}

// THE TABLE ITSELF, drawn into `ctx.panel` under the bar on every draw (lifted out of drawOrg, 2026-10-30).
export function wsOrgDrawTable(plugin: WordSmith, a: { at: string; cols: WsOrgCol[]; ctx: WsOrgCtx; fill: () => Promise<void>; lensed: boolean; list: WsOrgRow[]; noteCount: (rr: WsOrgRow[]) => number; numW: number; nums: Map<string, string> | null; orgKeepScroll: number; orgKeepScrollX: number; rows: WsOrgRow[]; s: WordSmithSettings; shaped: ReturnType<WsOrgCtx['showShape']>; sortCol: WsOrgCol | null; sortDir: string }) {
	const { at, cols, ctx, fill, lensed, list, noteCount, numW, nums, orgKeepScroll, orgKeepScrollX, rows, s, shaped, sortCol, sortDir } = a;
	const wrap = ctx.panel.createDiv({ cls: 'ws-org-panel' });
	// AND IT REPORTS WHERE IT IS. A fresh box every draw means a fresh
	// listener every draw — which is right, not wasteful: the old box is
	// discarded with its listener, so nothing accumulates. `passive`
	// because this never calls `preventDefault`, and a non-passive scroll
	// listener makes the browser wait for it.
	wrap.addEventListener('scroll', () => {
		ctx.orgScrollTop = wrap.scrollTop;
		ctx.ses.scroll = ctx.orgScrollTop;
		// Sideways too: a sort rebuilds this box and must not throw the
		// columns back to the left edge.
		ctx.orgScrollLeft = wrap.scrollLeft;
	}, { passive: true });
	// Everything that differs between arrangements is in the stylesheet,
	// keyed off stamped classes — not in a second renderer, which is how a
	// window ends up with two descriptions of a row that have to be kept
	// in step.
	const table = wrap.createEl('table', { cls: 'ws-org-table' });
	ctx.orgNameStamp(table);
	// NAME ALONE: with no column ticked the Name cells are the table's
	// rounded corner cells, and the seam, a straight line down the host at
	// their right edge, would run past both curves. The stylesheet hands
	// that edge to the cells' own border, as it does for the last column.
	const nameAlone = cols.length === 0;
	table.toggleClass('is-namealone', nameAlone);
	ctx.panel.toggleClass('ws-org-namealone', nameAlone);
	if (nums) {
		table.addClass('has-num');
		table.style.setProperty('--ws-org-numw', 'calc(' + Math.max(1, numW) + 'ch + 8px)');
	}
	const thead = table.createEl('thead');
	const hr = thead.createEl('tr');
	// THE HEADER'S RIGHT-CLICK is an extra entry point, never a second copy
	// of a list: sort up, sort down, filter by this, hide the column. The
	// columns themselves are the Properties panel and the kinds are behind
	// Filter by, so nothing is reachable only from the gesture. Built beside
	// the drag, below.
	// THE NAME HEADING, AND THE EDGE THAT SIZES IT.
	const nameTh = hr.createEl('th',
		{ cls: 'ws-org-name', text: wsT('Name') });
	// THE HEADING SAYS # OVER THE NUMBERS, at the cell's left, where the
	// numbers are; the word stays centred over the names.
	if (nums) nameTh.createSpan({ cls: 'ws-org-numhead', text: '#' });
	ctx.orgNameGripBind(ctx.panel, nameTh, table);
	// A CLICK SORTS BY NAME: A to Z first — the way a name column reads —
	// then Z to A, then the book's order; the lens's one writer, and the
	// same guard against the click a grip release synthesises.
	nameTh.title = wsT('Sort: ascending, then descending, then the book’s order');
	if (ctx.orgLens.sort && ctx.orgLens.sort.id === 'name') {
		nameTh.createSpan({ cls: 'ws-org-sortmark',
			text: wsSortArrow(ctx.orgLens.sort.dir) });
	}
	nameTh.addEventListener('click', () => {
		if (Date.now() - ctx.orgGripReleasedAt < ctx.ORG_GRIP_CLICK_MS) return;
		const cur = ctx.orgLens.sort;
		if (!cur || cur.id !== 'name') ctx.orgLensSet({ sort: { id: 'name', dir: 'asc' } });
		else if (cur.dir === 'asc') ctx.orgLensSet({ sort: { id: 'name', dir: 'desc' } });
		else ctx.orgLensSet({ sort: null });
	});
	// ── AND THE SEAM RUNS THE PANE, NOT THE ROWS ──────────────
	//
	// A column separator that ends with the data reads as a fragment. SO
	// IT IS THE HOST'S, NOT THE CELLS': the Name column is sticky at the
	// wrap's left edge, so its right edge is at the SAME screen x whatever
	// the table is scrolled to — which is exactly what lets one line
	// outside the scroller stand in for a border on every cell. The cells'
	// own `border-right` comes off with this: two writers of one line is
	// how a seam ends up doubled or stepped.
	//
	// MEASURED IN A FRAME, not at build time. The width is the table's
	// answer to its own content and there is no layout to ask until the
	// rows are in.
	// ── ONE DEVICE PIXEL, NOT ONE CSS PIXEL ────────────────────────
	//
	// A 1px CSS bar at a fractional device position lights two device
	// columns partly and reads as a soft two-pixel line (at a ratio of
	// 1.25, CSS x 441.8 is device 552.25 to 553.5). SO IT IS SNAPPED ONTO
	// THE DEVICE GRID and given exactly one device pixel of width — both
	// numbers read from the machine at draw time, so nothing here is a
	// literal that a different display would make wrong.
	//
	// THE OFFSET IS READ FROM THE PSEUDO-ELEMENT, which is the one writer
	// of where the bar is: `getComputedStyle(el, '::before')` resolves the
	// `calc(guidex + (depth - 1) * step)` the stylesheet owns, so this
	// never restates that expression and cannot drift from it. THE SNAP IS
	// ZEROED BEFORE READING, or the second call would measure a position
	// that already includes the first call's correction and double it.
	//
	// BOTH SURFACES — the tree and the table — or they come to disagree.
	const orgZoomOf = (el: HTMLElement) => {
		let z = 1;
		try {
			const w0 = (el && el.ownerDocument && el.ownerDocument.defaultView) || window;
			for (let n: HTMLElement | null = el; n && n.nodeType === 1; n = n.parentElement) {
				const v = parseFloat(w0.getComputedStyle(n).zoom);
				if (isFinite(v) && v > 0 && v !== 1) z *= v;
			}
		} catch (_) { wsCatch('orgTableMake / orgZoomOf: const w0 = el && el.ownerDocument', _); }
		return (isFinite(z) && z > 0) ? z : 1;
	};
	const orgSnapAccent = () => wsOrgSnapAccent({ ctx, orgZoomOf, table });
	// ── A RECT IS IN THE ZOOMED FRAME; A STAMP IS NOT ─────
	//
	// `getBoundingClientRect` answers in the zoomed frame and `offsetLeft`
	// in the element's own; a seam stamped as `wrap.offsetLeft +
	// rect.width` was written at zoom 0.8 as 246 for a column that ends at
	// 304. NOT `offsetWidth`, the obvious swap: it is rounded to a whole
	// pixel, and the seam's end is kept to two decimals below — a table is
	// not a whole number of pixels tall. The rect keeps its decimals and is
	// divided back into the frame it will be read in.
	//
	// UP THE TREE, MULTIPLYING: zoom nests. The pane sets one on
	// `.ws-uni-body` and a theme may set another above it.
	const orgNameLine = () => wsOrgNameLine({ ctx, nameTh, orgSnapAccent, orgZoomOf, table, wrap });
	// THE FIT MEASURES THIS TABLE. Installed beside the seam’s own
	// closure and for the same reason: both are built here and read
	// from somewhere else.
	//
	// READ EVERYTHING, THEN WRITE. The stamps come off, one layout is
	// forced by the first read, every width is taken, and only then is
	// anything set — interleaving makes the browser lay the table out
	// again on every column.
	ctx.orgColFitNow = () => {
		const ths = Array.from<HTMLElement>(table.querySelectorAll('thead th[data-col]'));
		// THE NAME IS NOT IN `ths` — its heading carries no `data-col`, and on
		// a wide pane the fit never touches it. On a NARROW one it is the way
		// back: a dragged width wins there, so this is what returns the column
		// to the room the readings leave. A pane with no readings still has a
		// name to hand back, hence the second half of the guard.
		const narrow = !!(ctx.orgNarrowNow && ctx.orgNarrowNow());
		if (!ths.length && !narrow) return;
		// EVERY CELL, not every header — `orgColLive` writes a column by
		// walking `th, td`, and this is the same walk undone. Measuring
		// after clearing only the headers is what made this button a
		// round trip; see `orgColUnfix`.
		for (const cell of Array.from<HTMLElement>(
			table.querySelectorAll('th[data-col], td[data-col]'))) {
			ctx.orgColUnfix(cell);
		}
		const ceil = ctx.orgColCeil(wrap);
		// MEASURED IN THE FRAME THE WIDTH IS WRITTEN BACK IN: a stored column
		// width is applied as a CSS length inside the zoom, so measuring the
		// zoomed rect would shrink every column by the zoom each time the
		// writer dragged one — and again the next time.
		const zoomC = orgZoomOf(table);
		const got = ths.map((th2) => ({
			id: th2.getAttribute('data-col'),
			w: Math.round(th2.getBoundingClientRect().width / zoomC)
		}));
		const m = Object.assign({}, ctx.orgColPx());
		for (const g of got) {
			if (!g.id || !(g.w > 0)) continue;
			// THE CEILING BINDS HERE TOO: a Description holding a sentence is
			// exactly the column that would take the pane.
			m[g.id] = Math.max(ctx.ORG_COL_MIN, Math.min(ceil, g.w));
		}
		// CLEARED, NOT WRITTEN AT THE CAP. The undragged state IS the cap on a
		// phone, and a stored 150 would open the desktop on a width the writer
		// never chose.
		if (narrow) delete m.name;
		s.uniColPx = m;
		plugin.saveSettings().catch(() => {});
		ctx.drawPanel();
	};
	ctx.orgNameLineNow = orgNameLine;
	// STAMPED NOW, BY AN OBSERVER, AND ONCE MORE AFTER THE BUILD. A seam
	// that shows NOTHING when its stamp has not run is one missed frame
	// away from that state at any time, so reading the width here forces
	// the layout synchronously. At this instant the cell can measure 0 —
	// the call runs between creating the Name heading and the loop that
	// adds the other columns — so a ResizeObserver is the answer, not a
	// later call site: it fires once as soon as the cell HAS a size, and
	// again whenever it changes, so the seam follows a pane being dragged
	// narrower. ONE AT A TIME: an observer per draw would hold every dead
	// table in the session and stamp from all of them.
	orgNameLine();
	try {
		if (ctx.orgNameRO) { ctx.orgNameRO.disconnect(); ctx.orgNameRO = null; }
		const w0 = ctx.ownerWin();
		if (w0 && w0.ResizeObserver) {
			// THE TABLE, NOT THE HEADING. Observing the cell alone fired once while
			// the header held only the Name column, stamped from that, and had no
			// reason to fire again — adding rows does not resize a cell. The TABLE
			// changes size as it is built, so it is the thing to watch.
			ctx.orgNameRO = new w0.ResizeObserver(() => orgNameLine());
			ctx.orgNameRO.observe(table);
			ctx.orgNameRO.observe(wrap);
		}
		// AND ONCE MORE AFTER THE BUILD, unconditionally. The panel is
		// drawn in one synchronous pass, so a task queued here runs
		// with the finished table in front of it — which is the one
		// moment every number this needs is knowable. The observer is
		// what keeps it true afterwards; this is what makes it true.
		if (w0 && w0.setTimeout) w0.setTimeout(() => {
			orgNameLine();
		}, 0);
	} catch (_) { wsCatch('orgTableMake / drawOrg: if (ctx.orgNameRO) ctx.orgNameRO.disconnect();', _); }
	wsOrgDrawHeads(plugin, { cols, ctx, fill, hr, s, sortCol, sortDir, wrap });
	// THE PICK CELL IS A COLUMN WITH NO BUTTON IN IT. Every row builds a
	// matching `ws-org-pickcell`, and the drawer rows' colspan is
	// `cols.length + 2`, the second of which is this cell: a header one
	// cell short is a ragged table. Dropping the column would move the
	// colspan with it.
	//
	// NOT DRAGGABLE AND NOT A SORT, still: every other th in this row
	// is both, and this one never was, because it is not a column.
	hr.createEl('th', { cls: 'ws-org-headpick' });
	const tbody = table.createEl('tbody');
	// +2, NOT +1: the Name column and the picker's own header cell.
	// A drawer row that spans one column short leaves the picker's
	// column drawing a stray vertical rule down the whole table.
	const colspan = cols.length + 2;
	// THE ONE TRANSITION the table allows: a ~150ms fade when the binder
	// dissolves into the flat list or comes back — it teaches "my folders
	// melted because I sorted". Only on the CHANGE, never on an ordinary
	// repaint, and the stylesheet stands down under prefers-reduced-motion.
	if (ctx.orgLastGrouping !== null && lensed !== ctx.orgLastGrouping) {
		table.addClass('is-melt');
	}
	ctx.orgLastGrouping = lensed;
	// A FOLDER IS A ROW. It sits in the one interleaved order its parent
	// already stores, it carries the same cells every other row carries,
	// and it folds — the folder glyph, the folder's context menu, being a
	// drop target that MOVES a note in, the row does on itself.
	// ── THE TOTAL ROW ─────────────────────────────────────────
	//
	// One row for the whole table, emitted once, HERE — outside the loop
	// below — so that it cannot become a run-break header. THE COUNT COMES
	// FROM THE INDEX, not from `rows`: `rows` is what is DRAWN — folded
	// folders keep their contents out of it — so a caption counting them
	// would say "2 notes" about a folder holding forty, and change when a
	// writer folded something.
	// ── THE LENS EMPTIED IT, OR A FOLD DID ────────────────────
	//
	// The total row hides when a LENS emptied the table and stays when a
	// FOLD did. THE TERMS: `!rows.length` — nothing is drawn; `list.length`
	// — but there was something to draw. `list` is post-SHAPE and
	// pre-LENS, so "Folders only" over a folder with no subfolders leaves
	// it 0 and this stays false: that is a scope with nothing in it, not a
	// filter that hid things.
	//
	// ONE WRITER: the empty-state block below asks the same question to
	// choose its own words, and reads this rather than repeating the terms.
	const orgLensEmptied = !rows.length && !!list.length;
	wsOrgDrawRoot(plugin, { at, cols, ctx, orgLensEmptied, tbody, wrap });
	// A FOLDER'S ROOT ROW, FIRST: the header's rule is the line over it.
	// (The vault's Total row waits for the foot, below.)
	const rooted = !!ctx.orgRootRow && ctx.orgRootRow.classList.contains('is-root');
	if (ctx.orgRootRow && rooted) {
		ctx.orgRootRow.classList.add('is-ruled');
		tbody.appendChild(ctx.orgRootRow);
		ctx.orgRootRow = null;
	}
	// THE SELECTION'S TINT, repainted in place on a modified click: a full
	// redraw for a class on a row would rebuild the table for every
	// Ctrl-click of a long selection.
	ctx.orgSelPaint = (body: HTMLElement) => {
		for (const tr0 of Array.from<HTMLElement>(body.querySelectorAll('tr.ws-org-row'))) {
			const p = tr0.getAttribute('data-path') || '';
			tr0.toggleClass('is-selected', !tr0.classList.contains('is-folder') && ctx.orgSelHas(p));
		}
		table.toggleClass('has-sel', ctx.orgSelCount() >= 2);
		// THE BAR ON EACH, snapped to the device grid as the active one's is —
		// the click painted the class, the snap follows.
		try { orgSnapAccent(); } catch (_) { wsCatch('orgSelPaint: orgSnapAccent();', _); }
		// AND THE COUNT BESIDE UNDO.
		try { if (ctx.orgBarSayPaint) ctx.orgBarSayPaint(); } catch (_) { wsCatch('orgSelPaint: ctx.orgBarSayPaint();', _); }
	};
	// A RULE OVER A FOLDER ROW — unless the row above already draws one
	// under itself (a folder row), which would make two. The draw knows the
	// order; the sheet does not. The first row has the header's rule over
	// it.
	// THE ROOT ROW FOLDED SHUT draws nothing under it, and says nothing
	// about it either: its chevron is the way back, and "no notes under
	// this folder" would be untrue.
	const rootShut = rooted && !orgLensEmptied && !!(ctx.ses && ctx.ses.rootShut);
	const prevRuled = wsOrgDrawRows(plugin, { cols, ctx, lensed, nums, rooted, rows: rootShut ? [] : rows, tbody, wrap });
	// THE VAULT'S TOTAL ROW, LAST. Under a folder row it is stamped
	// `is-ruled` and draws no top rule of its own: the folder row's bottom
	// rule is the line between them.
	if (ctx.orgRootRow) {
		if (prevRuled) ctx.orgRootRow.classList.add('is-ruled');
		tbody.appendChild(ctx.orgRootRow);
		ctx.orgRootRow = null;
	}
	// A FOLD IS NOT AN EMPTY RESULT. "Nothing passes the lens — clear it"
	// whenever there are no rows and the list is not empty would be a LIE
	// when a fold did the emptying — offering a button that would fix
	// nothing. SAME QUESTION, ONE WRITER: `orgLensEmptied` decides, and
	// the `if` one line down reads `list.length` to choose between the two
	// sentences.
	if (!rootShut && (orgLensEmptied || !rows.length)) {
		// A DEAD END MUST SPEAK AND OFFER THE WAY OUT — the clearing is a
		// BUTTON here, not a sentence about one.
		const tr0 = tbody.createEl('tr', { cls: 'ws-org-row is-empty' });
		const td0 = tr0.createEl('td');
		td0.setAttribute('colspan', String(colspan));
		if (list.length) {
			const [say0, say1] = wsOrgAround(wsT('Nothing passes the lens — {clear} to see the {n} notes here.', { n: noteCount(list) }), '{clear}');
			if (say0) td0.createSpan({ text: say0 });
			const b0 = td0.createEl('button', {
				cls: 'ws-export-mini ws-org-clearempty', text: wsT('Clear it') });
			b0.addEventListener('click', (ev: Event) => {
				ev.stopPropagation();
				ctx.orgLensClear();
			});
			// `noteCount`, the strip's own counter, so this and the strip say the
			// same number.
			if (say1) td0.createSpan({ text: say1 });
		} else {
			// IT NAMES WHAT IT WENT LOOKING FOR. With "Folders only" up,
			// a scope holding no subfolder is not a scope holding no
			// notes, and saying the second sends a writer to check the
			// wrong thing.
			td0.setText(shaped === 'folders'
				? wsT('No folders under this folder.')
				: wsT('No notes under this folder.'));
		}
	}
	// ── THE CELL THE WRITER ACTUALLY PRESSED ────────────────────
	//
	// A click on a cell while another editor was open rebuilds the
	// pane rather than opening a second box, and the `td` it was
	// pressed on does not survive that. This re-opens the one that
	// was asked for, so the redraw is invisible to the writer: they
	// pressed a cell and that cell is open.
	//
	// TAKEN BEFORE IT IS USED, so a failure to find the cell cannot
	// leave the request standing and re-open it on the NEXT redraw,
	// which would be a box appearing from nothing.
	if (ctx.orgOpenAfter) {
		const want = ctx.orgOpenAfter;
		ctx.orgOpenAfter = null;
		try {
			const td2 = ctx.panel.querySelector('.ws-org-row[data-path="'
				+ want.path + '"] td[data-col="' + want.id + '"]');
			if (td2 && !td2.querySelector('.ws-org-editor')) {
				td2.textContent = '';
				ctx.orgFieldEditor(td2, want.path, want.key, false);
			}
		} catch (_) { wsCatch('orgTableMake / drawOrg: const td2 = ctx.panel.querySelector(\'.ws-org-row[data-path="\'', _); }
	}
	// AND THE WRITER IS PUT BACK WHERE THEY WERE. LAST, because the rows
	// have to exist first: a scroller whose content is not in yet clamps
	// the assignment to whatever fits, which is usually zero — the same
	// fault, silently.
	if (orgKeepScroll > 0) {
		try {
			const w1 = ctx.panel.querySelector('.ws-org-panel');
			// WRITTEN, NEVER READ BACK. Setting it is a layout write and costs
			// nothing here; reading it to check would force a layout.
			if (w1) w1.scrollTop = orgKeepScroll;
		} catch (_) { wsCatch('orgTableMake / drawOrg: const w1 = ctx.panel.querySelector(\'.ws-org-panel\');', _); }
	}
	// AND THE COLUMNS: the sideways position the last box reported, put
	// back on the new one.
	if (orgKeepScrollX > 0) {
		try {
			const w2 = ctx.panel.querySelector('.ws-org-panel');
			if (w2) w2.scrollLeft = orgKeepScrollX;
		} catch (_) { wsCatch('orgTableMake / drawOrg: w2.scrollLeft = orgKeepScrollX;', _); }
	}
}
