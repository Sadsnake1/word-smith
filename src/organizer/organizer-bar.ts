// Word-Smith — organizer-bar.
//
// THE BAR OVER THE TABLE: Sort, Filter, Properties, the fold-all door, undo and redo, and the chips
// under them, with the Sort and Filter menus they open. Lifted out of `drawOrg` (2026-10-30), which
// empties the panel and calls `wsOrgDrawBar` before it builds the table; nothing it makes is read
// after it returns, and what it hands on goes through `ctx` (`orgHistPaint`, `orgBarSayPaint`).

import { Menu, Notice, setIcon } from 'obsidian';
import type { MenuItem } from 'obsidian';
import type { WsFlagDef, WordSmithSettings } from '../core/settings';
import { WsPropSuggestModal, wsCatch, wsFlagSvg, wsMenu, wsModKeyName, wsSortArrow, wsSvgInto } from '../core/preamble';
import type { WsPropItem } from '../core/preamble';
import { wsT } from '../core/ui-text';
import type WordSmith from '../plugin/plugin';
import type { WsOrgCtx } from './org-ctx';
import type { WsOrgCol } from './organizer-cols';
import type { WsOrgRow } from './organizer-rows';

// THE SORT MENU, on the Sort button's click (lifted out of drawOrg, A488).
function wsOrgSortMenu(plugin: WordSmith, a: { cols: WsOrgCol[]; ctx: WsOrgCtx; menuUnder: (menu: Menu, btn: HTMLElement, ev: MouseEvent) => void; s: WordSmithSettings; sortBtn: HTMLButtonElement; sortByName: boolean; sortCol: WsOrgCol | null; sortDir: string }, ev: MouseEvent) {
	const { cols, ctx, menuUnder, s, sortBtn, sortByName, sortCol, sortDir } = a;
	const menu = wsMenu();
	menu.addItem((i) => i.setTitle(wsT('Custom order'))
		.setIcon('list-ordered')
		.setChecked(!ctx.orgLens.sort)
		.onClick(() => ctx.orgLensSet({ sort: null })));
	// NAME, ONE ROW LIKE THE COLUMNS': A to Z first, the way a name column
	// reads; the same row again turns it round. Under Custom order and
	// above the readings, because the Name is the column that is always
	// there.
	menu.addItem((i) => i.setTitle(wsT('Name') + (sortByName ? wsSortArrow(sortDir) : ''))
		.setIcon('case-sensitive')
		.setChecked(!!sortByName)
		.onClick(() => ctx.orgLensSet({ sort: { id: 'name',
			dir: sortByName && sortDir === 'asc' ? 'desc' : 'asc' } })));
	menu.addSeparator();
	// THE SORT MENU HAS AN ORDER OF ITS OWN. A column order says what you
	// want to READ side by side; a sort order says what you want to ARRANGE
	// by, and those are not the same ranking. Ordered by what a writer
	// steers on: the size of the thing and the size it is meant to be, then
	// what is outstanding and where it is up to, then time, then the
	// analytical readings, and last the metadata columns — which fall
	// through with rank `length`, so a writer's own property columns keep
	// their table order among themselves (array sort is stable).
	//
	// A NEW COLUMN NEEDS NO ENTRY HERE: an unnamed id ranks last rather
	// than throwing or vanishing.
	const SORT_RELEVANCE = ['words', 'vocab', 'goal', 'deadline', 'tasks', 'mark',
		'modified', 'created', 'grade', 'paras', 'tags'];
	const sortRank = (c: { id: string; }) => {
		const at = SORT_RELEVANCE.indexOf(c.id);
		return at === -1 ? SORT_RELEVANCE.length : at;
	};
	const sortMenuCols = cols.slice()
		.sort((a, b) => sortRank(a) - sortRank(b));
	for (const col of sortMenuCols) {
		menu.addItem((i) => {
			const here = sortCol && sortCol.id === col.id;
			i.setTitle(col.label + (here
				? wsSortArrow(sortDir) : ''));
			// ── AND EACH ROW WEARS ITS OWN GLYPH ────────
			//
			// LOOKED UP BY ID in `SORTS`, so `BUILTIN_SORTS` stays the ONE writer
			// of what each built-in reading looks like. A writer's own property
			// column gets one too: `sortDefs` concatenates the user columns with
			// `icon: 'tag'` — one glyph for "this is a property of yours".
			try {
				const def = ctx.SORTS.filter((s) => s.id === col.id)[0];
				if (def && def.icon && i.setIcon) i.setIcon(def.icon);
			} catch (_) { wsCatch('orgTableMake / drawOrg: const def = ctx.SORTS.filter((s) => s.id === col.id)[0];', _); }
			i.setChecked(!!here);
			// First pick sorts DESC (newest-biggest first, the
			// header's own opening move); picking it again
			// turns it round.
			i.onClick(() => ctx.orgLensSet({ sort: {
				id: col.id,
				dir: here && sortDir === 'desc' ? 'asc' : 'desc'
			} }));
		});
	}
	// ── ROW NUMBERS: a checkbox at the foot of the Sort menu, because
	// numbers are about the ORDER shown, which is what this menu is for.
	// Remembered with the table's other choices.
	menu.addSeparator();
	menu.addItem((i) => i.setTitle(wsT('Row numbers'))
		.setIcon('hash')
		.setChecked(!!s.uniRowNumbers)
		.onClick(() => {
			s.uniRowNumbers = !s.uniRowNumbers;
			plugin.saveSettings().catch(() => {});
			ctx.drawPanel();
		}));
	menuUnder(menu, sortBtn, ev);
}

// THE FILTER MENU, on the Filter button's click (lifted out of drawOrg, A488).
function wsOrgFilterMenu(plugin: WordSmith, a: { addBtn: HTMLButtonElement; at: string; ctx: WsOrgCtx; menuUnder: (menu: Menu, btn: HTMLElement, ev: MouseEvent) => void }, ev: MouseEvent) {
	const { addBtn, at, ctx, menuUnder } = a;
	let nests = false;
	try {
		wsMenu().addItem((i) => {
			nests = typeof i.setSubmenu === 'function';
		});
	} catch { nests = false; }
	const menu = wsMenu();
	// One check for all five: a build with submenus has them
	// everywhere, and asking per group could give one nested
	// heading beside two flattened ones.
	const group = (title: string, icon: string, fill: (into: Menu) => void) => {
		if (nests) {
			menu.addItem((i) => {
				i.setTitle(title);
				try { if (icon) i.setIcon(icon); } catch (_) { wsCatch('orgTableMake / group: if (icon) i.setIcon(icon);', _); }
				// FILLED INSIDE A GUARD: Obsidian pushes the item
				// AFTER the callback returns, so a throw in here
				// loses the whole row and the menu comes back
				// silently missing a fifth of itself.
				try { fill(i.setSubmenu()); }
				catch (e) { console.error('Word-Smith: filter menu', e); }
			});
			return;
		}
		menu.addSeparator();
		menu.addItem((i) => i.setTitle(title).setIsLabel(true));
		fill(menu);
	};
	// `orgAddChip`, kept local so the call sites in this handler read short.
	const addChip = ctx.orgAddChip;

	// KIND writes the store, not a chip: `uniTypes` already holds
	// this and already draws its own chip in the bar. A second
	// copy in the lens would be two writers of one fact.
	group(wsT('Kind'), 'shapes', (into) => ctx.typeRows(into));

	// TASKS is a question, not a value - there is nothing to
	// enumerate, so the four answers are named here. They are the
	// only axis whose reading is an OBJECT, which is why
	// orgChipHit has to know about it.
	// TWO ROWS: has tasks, no tasks.
	group(wsT('Tasks'), 'check-square', (into) => {
		for (const t of [
			{ id: 'any',  label: 'Has tasks', title: wsT('Has tasks') },
			{ id: 'none', label: 'No tasks', title: wsT('No tasks') }
		]) {
			into.addItem((i: MenuItem) => i.setTitle(t.title)
				.onClick(() => addChip({ axis: 'tasks', id: t.id,
					key: 'Tasks', value: t.label })));
		}
	});

	// FLAG carries the ID and shows the LABEL: a writer can rename
	// a flag in settings, and a chip holding the old word would
	// quietly stop matching the rows it used to.
	// ── AND EACH ROW WEARS ITS FLAG ────────────────────────
	//
	// A DocumentFragment holding a `.ws-menuflag` span with `wsFlagSvg`
	// inside it, then the label as a text node — a menu title takes a
	// fragment, and no Lucide name draws these shapes, so `setIcon` is not
	// an option here. ONE WRITER: `wsFlagSvg` is the only thing that knows
	// what a flag looks like.
	group(wsT('Flag'), 'flag', (into: Menu) => {
		let defs: WsFlagDef[] = [];
		try { defs = plugin.flagDefs() || []; } catch { defs = []; }
		const titled = (id: string, label: string) => {
			const frag = createFragment();
			const mark = createSpan();
			mark.className = 'ws-menuflag is-' + id;
			wsSvgInto(mark, wsFlagSvg(id, 12));
			frag.appendChild(mark);
			frag.appendChild(document.createTextNode(label));
			return frag;
		};
		for (const d of defs) {
			into.addItem((i: MenuItem) => i.setTitle(titled(d.id, d.label))
				.onClick(() => addChip({ axis: 'flag', id: d.id,
					key: 'Flag', value: d.label })));
		}
		// "No flag" GETS THE SLOT AND NO SHAPE. It is the absence
		// of a flag, so drawing one would be a lie — but without
		// the span its label starts at a different x from the six
		// above it, which is the ragged column this window keeps
		// removing. `wsFlagSvg('')` returns the outline mark, and
		// the stylesheet's `.ws-menuflag.is-` holds the width.
		into.addItem((i: MenuItem) => i.setTitle(titled('', wsT('No flag')))
			.onClick(() => addChip({ axis: 'flag', id: '',
				key: 'Flag', value: 'none' })));
	});

	// TAG is unbounded, so it opens the picker. `uniTagsInScope`
	// is the enumerator whose own header says it is "the list the
	// filter menu offers" - scope-scoped and commonest-first, and
	// its counts are real, so the picker's count line is not a
	// number nobody counted.
	group(wsT('Tag'), 'tag', (into) => {
		into.addItem((i: MenuItem) => i.setTitle(wsT('Search tags…'))
			.onClick(() => {
				let tags: { tag: string; n: number }[] = [];
				try {
					tags = plugin.uniTagsInScope(
						ctx.orgRowList(at, true).map((r) => r.path)) || [];
				} catch { tags = []; }
				if (!tags.length) {
					try { new Notice(wsT('Word-Smith: no tags in these notes.')); } catch (_) { wsCatch('orgTableMake / drawOrg: new Notice(\'Word-Smith: no tags in these notes.\');', _); }
					return;
				}
				const items = tags.map(t => ({ tag: t.tag,
					label: '#' + t.tag, n: t.n }));
				const take = (it: WsPropItem) => addChip({ axis: 'tag',
					key: 'Tag', value: it.tag });
				if (WsPropSuggestModal) {
					try {
						new WsPropSuggestModal(plugin.app, items, take,
							wsT('Which tag?')).open();
						return;
					} catch (_) { wsCatch('orgTableMake / drawOrg: new WsPropSuggestModal(this.app, items, take,', _); }
				}
				const pick = wsMenu();
				for (const it of items.slice(0, 20)) {
					pick.addItem((i2) => i2.setTitle(it.label)
						.onClick(() => take(it)));
				}
				try { pick.showAtMouseEvent(ev); }
				catch { try { pick.showAtPosition({ x: 0, y: 0 }); } catch (_e) { wsCatch('orgTableMake / drawOrg: pick.showAtPosition( x: 0, y: 0 );', _e); } }
			}));
	});

	// PROPERTY: two long lists, so two pickers - the key, then its
	// values under this selection. `orgPropKeys` is the right
	// enumerator rather than `propKeysInScope`, which is built for
	// COLUMNS: it drops tags and drops keys already shown, and a
	// writer may well want to filter on a column they can see.
	group(wsT('Property'), 'table-properties', (into: Menu) => {
		// ── THE TWO QUESTIONS THAT NEED NO VALUE ───────────────────
		//
		// They come FIRST because they are the ones a writer arrives wanting —
		// "which scenes have no synopsis" cannot be asked by picking a value:
		// there is no value to pick. ONE KEY PICKER, TWO ROWS, rather than a
		// value picker with two special entries hidden in it: the value list is
		// built from what EXISTS under the selection, so a key nobody has
		// filled in has an empty list — and that is exactly the key this
		// question is for.
		const askEmpty = (op: string) => {
			const keys = ctx.orgPropKeys(at);
			if (!keys.length) {
				try { new Notice(wsT('Word-Smith: no properties in these notes.')); } catch (_) { wsCatch('orgTableMake / askEmpty: new Notice(\'Word-Smith: no properties in these notes.\');', _); }
				return;
			}
			const items = keys.map((k: string) => ({ key: k, label: k }));
			const take = (it: WsPropItem) => addChip({ key: it.key, op: op, value: '' });
			if (WsPropSuggestModal) {
				try {
					new WsPropSuggestModal(plugin.app, items, take,
						op === 'empty' ? wsT('Which property is empty?')
							: wsT('Which property is filled in?')).open();
					return;
				} catch (_) { wsCatch('orgTableMake / askEmpty: new WsPropSuggestModal(this.app, items, take,', _); }
			}
			const pk2 = wsMenu();
			for (const it of items.slice(0, 20)) {
				pk2.addItem((i4) => i4.setTitle(it.label).onClick(() => take(it)));
			}
			try { pk2.showAtMouseEvent(ev); }
			catch { try { pk2.showAtPosition({ x: 0, y: 0 }); } catch (_e) { wsCatch('orgTableMake / askEmpty: pk2.showAtPosition( x: 0, y: 0 );', _e); } }
		};
		into.addItem((i: MenuItem) => i.setTitle(wsT('Is empty…'))
			.onClick(() => askEmpty('empty')));
		into.addItem((i: MenuItem) => i.setTitle(wsT('Is not empty…'))
			.onClick(() => askEmpty('filled')));
		into.addItem((i: MenuItem) => i.setTitle(wsT('Search properties…'))
			.onClick(() => {
				const keys = ctx.orgPropKeys(at);
				if (!keys.length) {
					try { new Notice(wsT('Word-Smith: no properties in these notes.')); } catch (_) { wsCatch('orgTableMake / drawOrg: new Notice(\'Word-Smith: no properties in these notes.\');', _); }
					return;
				}
				// `orgFilterByKey`, so the header's "Filter by this…" and this one
				// enumerate the same values from the same subject.
				const pickValue = (key: string) => ctx.orgFilterByKey(key, ev);
				const items = keys.map((k) => ({ key: k, label: k }));
				if (WsPropSuggestModal) {
					try {
						new WsPropSuggestModal(plugin.app, items,
							(it) => pickValue(it.key || ''),
							wsT('Which property?')).open();
						return;
					} catch (_) { wsCatch('orgTableMake / drawOrg: new WsPropSuggestModal(this.app, items,', _); }
				}
				const pk = wsMenu();
				for (const it of items.slice(0, 20)) {
					pk.addItem((i2) => i2.setTitle(it.label)
						.onClick(() => pickValue(it.key)));
				}
				try { pk.showAtMouseEvent(ev); }
				catch { try { pk.showAtPosition({ x: 0, y: 0 }); } catch (_e) { wsCatch('orgTableMake / drawOrg: pk.showAtPosition( x: 0, y: 0 );', _e); } }
			}));
	});
	menuUnder(menu, addBtn, ev);
}

// THE BAR ITSELF, drawn into `ctx.panel` on every draw (lifted out of drawOrg, 2026-10-30).
export function wsOrgDrawBar(plugin: WordSmith, a: { at: string; cols: WsOrgCol[]; ctx: WsOrgCtx; list: WsOrgRow[]; narrowed: boolean; noteCount: (rr: WsOrgRow[]) => number; rows: WsOrgRow[]; s: WordSmithSettings; sortByName: boolean; sortCol: WsOrgCol | null; sortDir: string; sortLabel: string }) {
	const { at, cols, ctx, list, narrowed, noteCount, rows, s, sortByName, sortCol, sortDir, sortLabel } = a;
	const bar = ctx.panel.createDiv({ cls: 'ws-org-bar' });
	// ── A BAR MENU OPENS UNDER ITS BUTTON ─────────────
	//
	// `showAtMouseEvent` puts the menu's corner where the click landed, so
	// a wide button like "Sort: Words ↓" opened its menu anywhere along its
	// own width — the same list arriving in a different place each time.
	// NO BASE CONVERSION HERE: an Obsidian `Menu` hangs off the document,
	// not off our host, so a viewport point is the right frame. The mouse
	// event stays as the fallback — a rect of all zeros is what a fixture
	// hands back, and a menu at the origin would be worse than one at the
	// pointer.
	const menuUnder = (menu: Menu, btn: HTMLElement, ev: MouseEvent) => {
		try {
			const r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
			if (r && (r.width || r.height)) {
				// THE ANCHOR'S WIDTH AND `overlap`, which is how Obsidian places its
				// own dropdowns. Without them the positioner adds 2px to the LEFT as
				// well as the top, so the menu sat a hair right of its button; with
				// them it lines up on the button's left edge and opens 2px under it,
				// the same 2px the Properties flyout uses.
				menu.showAtPosition({ x: Math.round(r.left), y: Math.round(r.bottom), width: Math.round(r.width), overlap: true });
				return;
			}
		} catch (_) { wsCatch('orgTableMake / menuUnder: const r = btn && btn.getBoundingClientRect', _); }
		try { menu.showAtMouseEvent(ev); }
		catch { try { menu.showAtPosition({ x: 0, y: 0 }); } catch (_e) { wsCatch('orgTableMake / menuUnder: menu.showAtPosition( x: 0, y: 0 )', _e); } }
	};
	// ── SORT BY ────────────────────────────────────────────────
	// The header click still cycles; this menu is the same lens through a
	// control a writer can FIND. One writer underneath: everything goes
	// through orgLensSet.
	// ── THE THREE LENSES WEAR BASES' OWN ICONS ──────────────────
	//
	// A writer who has used Bases already knows what these three do, and
	// this window is dressed as Obsidian everywhere else — borrowing the
	// app's vocabulary is cheaper than teaching our own.
	//
	// TRIED IN ORDER AND CHECKED, and the chosen name is RECORDED on the
	// element: `setIcon` with a name this build's Lucide does not know
	// leaves the element empty instead of throwing. `data-icon` records the
	// name that DREW, or the first candidate when none did — never the word
	// 'none', so a test can assert a real name where nothing can draw.
	const lensIcon = (btn: HTMLElement, names: string[]) => {
		for (const n of names) {
			try { if (setIcon) setIcon(btn, n); } catch (_) { wsCatch('orgTableMake / lensIcon: if (setIcon) setIcon(btn, n);', _); }
			if (btn.childElementCount > 0) { btn.dataset.icon = n; return n; }
			btn.textContent = '';
		}
		btn.dataset.icon = names[0];
		return null;
	};
	const sortBtn = bar.createEl('button',
		{ cls: 'ws-export-mini ws-org-sortby' });
	lensIcon(sortBtn, ['arrow-up-down', 'arrow-down-up',
		'arrow-up-narrow-wide', 'sort-asc']);
	// A LABEL SPAN, not `setText`: setText replaces every child, so
	// it would take the icon straight back out again.
	sortBtn.createSpan({ text: sortLabel ? wsT('Sort: {sort}', { sort: sortLabel }) : wsT('Sort') });
	sortBtn.title = wsT('Arrange the rows by a reading — custom order is a click away');
	sortBtn.addEventListener('click', (ev: MouseEvent) => wsOrgSortMenu(plugin, { cols, ctx, menuUnder, s, sortBtn, sortByName, sortCol, sortDir }, ev));
	// ── FILTER BY ──────────────────────────────────────────────
	const addBtn = bar.createEl('button',
		{ cls: 'ws-export-mini ws-org-addfilter' });
	lensIcon(addBtn, ['list-filter', 'filter', 'funnel']);
	addBtn.createSpan({ text: wsT('Filter') });
	// ── AND HOW MANY ARE ON ────────────────────────────────
	//
	// The chips beside it already say WHICH filters are on; this says HOW
	// MANY without reading them, and it is the half that still shows when
	// the strip is narrow. COUNTS THE APPLIED ONES ONLY. A chip can be
	// unticked and left in place — that is what its checkbox is for — and
	// a badge counting those would say the view is narrowed when it is not.
	{
		const on = ctx.orgLens.chips.filter((c) => !c.off).length;
		if (on) addBtn.createSpan({ cls: 'ws-org-filtercount', text: String(on) });
	}
	addBtn.title = wsT('Narrow by a property — type to search the folder’s own keys');
	addBtn.addEventListener('click', (ev: MouseEvent) => wsOrgFilterMenu(plugin, { addBtn, at, ctx, menuUnder }, ev));
	// PROPERTIES, not Columns: the menu lists the readings AND the writer's
	// own frontmatter keys, which is what Obsidian calls properties —
	// "Columns" named the container rather than the contents.
	const colsBtn = bar.createEl('button',
		{ cls: 'ws-export-mini ws-org-colsbtn' });
	lensIcon(colsBtn, ['table-properties', 'settings-2', 'list',
		'columns-3']);
	colsBtn.createSpan({ text: wsT('Properties') });
	// ── AND ONE DOOR THAT SHUTS EVERYTHING ────────────────────
	//
	// ONE BUTTON, TWO JOBS, so its label is the only thing telling a writer
	// which they are about to get — and the test is whether ANY folder is
	// open, not whether all are. With nine folders and one open, "Expand
	// all" would be a lie about the eight that are shut and would do
	// nothing to the one that is not. IT WRITES THROUGH `orgOpenSet`, the
	// one writer of the fold, so a folded-away row and a hidden row cannot
	// come to mean two different things.
	const foldBtn = bar.createEl('button',
		{ cls: 'ws-export-mini ws-org-foldall' });
	// EVERY ROW THAT CAN BE OPENED, note or folder: a note's open state is
	// its property card. `orgOpen` holds both, and `orgIsOpen` is the same
	// question asked of either.
	//
	// ── AND IT READS THE WHOLE SUBTREE, NOT WHAT IS ON SCREEN ───────
	//
	// NEITHER FLAG ALONE IS "EVERYTHING": `flat` dives through every folder
	// regardless of its fold but OMITS the folders from what it returns,
	// and `!flat` returns both kinds but walks only what is open. So the
	// files come from the flat walk and the folders from their own paths —
	// no second tree walk, and no chance of a second walker disagreeing
	// with the first about what is under a folder.
	//
	// A FOLDER WITH NO NOTES UNDER IT IS NOT IN THE LIST, because no file
	// names it. Opening it would reveal nothing, so the only difference is
	// its own chevron.
	const foldable = () => {
		const out = new Set<string>();
		for (const r0 of ctx.orgRowList(ctx.orgFolder, true)) {
			out.add(r0.path);
			const bits = String(r0.path).split('/');
			bits.pop();
			let acc = '';
			for (const b of bits) {
				acc = acc ? acc + '/' + b : b;
				// Only what is at or under the scope: an ancestor above it
				// is not a row in this view and is not ours to fold.
				if (!ctx.orgFolder || acc === ctx.orgFolder
					|| acc.indexOf(ctx.orgFolder + '/') === 0) out.add(acc);
			}
		}
		return Array.from<string>(out);
	};
	const anyOpen = foldable().some(p0 => ctx.orgIsOpen(p0));
	lensIcon(foldBtn, anyOpen ? ['chevrons-down-up', 'fold-vertical', 'minimize-2']
		: ['chevrons-up-down', 'unfold-vertical', 'maximize-2']);
	// THE GLYPH ALONE: it sits in a row of four labelled controls and was
	// the widest of them for the least-used job. SO THE TITLE CARRIES THE
	// WHOLE NAME, and it has to: the icon flips with the state, which means
	// the picture is the only thing on screen saying which of two jobs a
	// click will do. An `aria-label` as well, because a button whose only
	// text is a drawing has no name at all to a screen reader.
	const foldSay = anyOpen ? wsT('Collapse all \u2014 shut every folder and card')
		: wsT('Expand all \u2014 open every folder and card');
	foldBtn.title = foldSay;
	foldBtn.setAttribute('aria-label', foldSay);
	foldBtn.addEventListener('click', (ev: Event) => {
		ev.stopPropagation();
		const want = !anyOpen;
		// ONE CALL, NOT ONE PER FOLDER — see `orgOpenSetMany`.
		ctx.orgOpenSetMany(foldable(), want);
	});
	// UNDO AND REDO: two buttons at the bar's end, greyed when there is
	// nothing to do, their titles saying what they would do — "Undo: Flag
	// Draft on Chapter Two (Ctrl+Z)" — repainted by the journal whenever
	// it moves.
	if (ctx.orgHist) {
		const histBtn = (kind: 'undo' | 'redo', names: string[], keySay: string) => {
			const b = bar.createEl('button', { cls: 'ws-export-mini ws-org-hist ws-org-' + kind });
			lensIcon(b, names);
			const paint = () => {
				const h = ctx.orgHist;
				const has = kind === 'undo' ? h.canUndo() : h.canRedo();
				const lab = kind === 'undo' ? h.undoLabel() : h.redoLabel();
				const say = has
					? (kind === 'undo' ? wsT('Undo: {label} ({key})', { label: lab, key: keySay }) : wsT('Redo: {label} ({key})', { label: lab, key: keySay }))
					: (kind === 'undo' ? wsT('Nothing to undo ({key})', { key: keySay }) : wsT('Nothing to redo ({key})', { key: keySay }));
				b.disabled = !has;
				b.title = say;
				b.setAttribute('aria-label', say);
			};
			paint();
			b.addEventListener('click', (ev: Event) => {
				ev.stopPropagation();
				void ctx.orgHist.run(kind);
			});
			return paint;
		};
		const paintUndo = histBtn('undo', ['undo-2', 'undo', 'corner-up-left'], wsModKeyName() + '+Z');
		const paintRedo = histBtn('redo', ['redo-2', 'redo', 'corner-up-right'], wsModKeyName() + '+Shift+Z');
		ctx.orgHistPaint = () => { paintUndo(); paintRedo(); };
		// THE WORD BESIDE THEM. One slot: what the journal just did, for six
		// seconds, and otherwise how many rows the selection holds when it
		// holds two or more. The message lives on the context, since the bar
		// is rebuilt by the draw an undo ends with.
		const sayEl = bar.createSpan({ cls: 'ws-org-barsay' });
		let sayTimer: number | null = null;
		const paintSay = () => {
			const held = ctx.orgBarSaid;
			const live = held && held.msg && Date.now() < held.until;
			const n = ctx.orgSelCount ? ctx.orgSelCount() : 0;
			sayEl.setText(live ? held.msg : (n >= 2 ? wsT('{n} selected', { n }) : ''));
			sayEl.toggleClass('is-sel', !live && n >= 2);
			if (sayTimer) { window.clearTimeout(sayTimer); sayTimer = null; }
			if (live) sayTimer = window.setTimeout(paintSay, Math.max(50, held.until - Date.now()));
		};
		paintSay();
		ctx.orgBarSayPaint = paintSay;
	}
	// ── ONE DOOR ONTO THE PROPERTIES ────────────────────────────
	colsBtn.title = wsT('Which properties this window shows — a column in the table, a field under every row in Outline');
	// IT TOGGLES. A second press on an open panel shuts it, which is what
	// a writer expects of a button that opened one — and what a test
	// driving this door has to know, because re-reading the list after a
	// tick would otherwise CLOSE the panel and read nothing at all.
	colsBtn.addEventListener('click', () => {
		if (ctx.orgPropPopEl()) { ctx.orgPropPopClose(); return; }
		ctx.orgPropPopOpen(colsBtn);
	});
	
	// ── THE ACTIVE CHIPS, UNDER THE CONTROLS THAT MADE THEM ──
	//
	// Under the buttons is where a writer looks. A SIBLING OF THE BAR, NOT
	// A CHILD OF IT: `.ws-org-bar` is `flex-wrap`, so chips appended into
	// it would sit BESIDE the buttons until the line filled, which is not
	// "under". Built LAZILY so a lens-free window pays no empty row and no
	// gap for it.
	let chipRowEl: HTMLDivElement | null = null;
	const chipHost = () => (chipRowEl
		|| (chipRowEl = ctx.panel.createDiv({ cls: 'ws-org-chiprow' })));
	// The active lens, as dismissible chips — pressing one takes
	// only ITS narrowing away.
	const chipBtn = (label: string, undo: () => void) => {
		const b = chipHost().createEl('button', { cls: 'ws-org-chip' });
		b.createSpan({ text: label });
		b.createSpan({ cls: 'ws-org-chipx', text: '×' });
		b.title = wsT('Remove this');
		b.addEventListener('click', undo);
	};
	if (sortLabel) {
		chipBtn(sortLabel, () => ctx.orgLensSet({ sort: null }));
	}
	for (const c of ctx.orgLens.chips) {
		// A filter chip carries a CHECKBOX: unticking sets the filter aside
		// without losing what was typed; the × still removes it for good. A
		// sort chip has no box — there is nothing of its to keep while off.
		const b = chipHost().createEl('button',
			{ cls: 'ws-org-chip' + (c.off ? ' is-off' : '') });
		const tick = b.createEl('input', { cls: 'ws-org-chiptick' });
		tick.type = 'checkbox';
		tick.checked = !c.off;
		tick.title = c.off ? wsT('Tick to apply this filter again')
			: wsT('Untick to set this filter aside');
		tick.addEventListener('click', (ev: Event) => {
			ev.stopPropagation();
			ctx.orgLensSet({ chips: ctx.orgLens.chips.map((x) => x === c
				? Object.assign({}, x, { off: !x.off }) : x) });
		});
		// A CHIP SAYS WHAT IT ASKS. `synopsis: ` with nothing after the
		// colon would be an empty-looking chip for a filter that is
		// precisely ABOUT emptiness — unreadable, and indistinguishable
		// from a filter whose value had been lost.
		// THE AXES' OWN WORDS IN THE INTERFACE'S LANGUAGE (A695); the chip itself keeps the English it was made with,
		// the tasks' answer is matched by its id and a flag by its id, and a property's key and value are the writer's
		const ckey = c.axis === 'tasks' ? wsT('Tasks') : c.axis === 'flag' ? wsT('Flag') : c.axis === 'tag' ? wsT('Tag') : String(c.key);
		const cval = c.axis === 'tasks' ? (c.id === 'none' ? wsT('No tasks') : wsT('Has tasks'))
			: (c.axis === 'flag' && !c.id) ? wsT('none') : String(c.value);
		b.createSpan({ text: c.op === 'empty' ? wsT('{key} is empty', { key: ckey })
			: c.op === 'filled' ? wsT('{key} is not empty', { key: ckey })
			: wsT('{key}: {value}', { key: ckey, value: cval }) });
		b.createSpan({ cls: 'ws-org-chipx', text: '×' });
		b.title = wsT('Remove this');
		b.addEventListener('click', () => ctx.orgLensSet({
			chips: ctx.orgLens.chips.filter((x) => x !== c) }));
	}
	// ── WHAT THE LENS COSTS, AND THE WAY OUT, BESIDE THE CHIPS ──
	//
	// THE COUNT ONLY WHEN SOMETHING IS HIDDEN: "5 of 5 shown" is a sentence
	// about nothing. THE WAY OUT WHENEVER THE LENS IS ON: a filter matching
	// every note still has to come off.
	// ── THE KIND NARROWING, IN THE SAME ROW AND THE SAME SHAPE ──
	//
	// A BUTTON, not a div, dismissed by pressing it anywhere rather than by
	// hitting the × alone — which is what every chip beside it does. The ×
	// stays as the sign that it can be dismissed. NOT `chipBtn`, though it
	// is its twin: this one carries a second class so `selectors.js` can
	// name it, and its undo is async.
	//
	// OUTSIDE `orgLensOn()`, deliberately: the kinds are narrowed by
	// the shape picker, not by the lens, so this chip must appear with
	// no lens on at all. `chipHost()` builds the row lazily, so asking
	// for it here is what makes the row exist in that case.
	{
		const onKinds = plugin.uniTypeSet();
		const allKinds = plugin.uniTypeGroups();
		if (onKinds.size < allKinds.length || ctx.showShape() !== 'all') {
			const kc = chipHost().createEl('button',
				{ cls: 'ws-org-chip ws-org-kindchip' });
			kc.createSpan({ text: wsT('kind: {kinds}', { kinds: ctx.typeLabel() }) });
			kc.createSpan({ cls: 'ws-org-chipx', text: '×' });
			kc.title = wsT('Only some kinds of file are shown — press to show every kind again');
			// BOTH STORES, as the old chip's × learnt the hard way:
			// on "Folders only" (every kind, one shape) undoing the
			// kinds alone changed nothing at all.
			const showEvery = async () => {
				plugin.settings.uniTypes = allKinds.map((g) => g.id);
				await ctx.setShape('all');
				ctx.drawPanel();
			};
			kc.addEventListener('click', () => { void showEvery(); });
		}
	}
	if (ctx.orgLensOn()) {
		const tail = chipHost().createDiv({ cls: 'ws-org-chiptail' });
		if (narrowed) {
			tail.createSpan({ cls: 'ws-org-shownof',
				text: wsT('{count} of {n} shown', { count: noteCount(rows), n: noteCount(list) }) });
		}
		const cl = tail.createEl('button', { cls: 'ws-org-clearlens' });
		cl.setText(wsT('Clear all'));
		cl.title = wsT('Take the lens off — Escape does this too');
		cl.addEventListener('click', (ev: Event) => {
			ev.stopPropagation();
			ctx.orgLensClear();
		});
	}
}
