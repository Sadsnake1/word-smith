'use strict';
const { Plugin, PluginSettingTab, Setting, MarkdownView, TFile, TFolder, FuzzySuggestModal, Menu, Modal, Notice, setIcon, getAllTags, Platform, ItemView, addIcon, apiVersion } = require('obsidian');
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
const WsPropSuggestModal = FuzzySuggestModal ? class extends FuzzySuggestModal {
constructor(app, items, onPick, placeholder, newLabel, taken) {
super(app);
this._items = items;
this._onPick = onPick;
this._newLabel = newLabel || '';
this._taken = taken || items;
if (this.setPlaceholder) {
this.setPlaceholder(placeholder
|| 'Which property should become a column?');
}
}
getItems() {
if (!this._newLabel) return this._items;
let q = '';
try { q = String((this.inputEl && this.inputEl.value) || '').trim(); }
catch (_) { q = ''; }
if (!q) return this._items;
const lower = q.toLowerCase();
for (const it of this._taken) {
if (String(it && it.label || '').toLowerCase() === lower) return this._items;
if (String(it && it.key || '').toLowerCase() === lower) return this._items;
}
return this._items.concat([{
key: q, label: this._newLabel.replace('%s', q), isNew: true
}]);
}
getItemText(item) {
if (typeof item.n !== 'number') return item.label;
return item.label + '  ·  ' + item.n + (item.n === 1 ? ' note' : ' notes')
+ (item.spellings > 1 ? '  ·  ' + item.spellings + ' spellings' : '');
}
onChooseItem(item) { this._onPick(item); }
} : null;
const MENU_RULE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'none'];
const MENU_MAX_COLS = 5;
const ZG_MASK_MIN_PX = 60;
const ZG_MASK_MAX_FRAC = 0.45;
const ZG_ARROWS_MIN_PX = 34;
const ZG_ARROWS_MIN_W = 180;
let ZG_MENU_ESC = null;
const WS_MENU_VIEW = 'word-smith-menu';
const WS_OUTLINER_VIEW = 'word-smith-outliner';
const WS_EXPORT_VIEW = 'word-smith-export';
const WS_HISTORY_VIEW = 'word-smith-history';
const WS_PANE_VIEWS = { organizer: WS_OUTLINER_VIEW, export: WS_EXPORT_VIEW, history: WS_HISTORY_VIEW };
const WS_PANE_NAMES = { organizer: 'Organizer', export: 'Export', history: 'History' };
const WS_PANE_ICONS = { organizer: 'list-tree', export: 'file-output', history: 'history' };
const WS_ICON = 'word-smith-w';
const WS_ICON_SVG =
'<g fill="none" stroke="currentColor" stroke-width="9" ' +
'stroke-linecap="square" stroke-linejoin="miter">' +
'<path d="M18 26 L34 74 L50 38 L66 74 L82 26" />' +
'<path d="M8 26 H28" /><path d="M72 26 H92" />' +
'</g>';
const WsOutlinerView = ItemView ? class extends ItemView {
constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
paneTab() { return 'organizer'; }
getViewType() { return WS_OUTLINER_VIEW; }
getDisplayText() { return WS_PANE_NAMES[this.paneTab()]; }
getIcon() { return WS_PANE_ICONS[this.paneTab()]; }
async onOpen() {
this.plugin.app.workspace.onLayoutReady(() => {
if (this._built) return;
this._built = true;
try { this.build(); } catch (_) { zgCatch('onOpen: this.build();', _); }
});
}
build() {
this.contentEl.empty();
this.contentEl.setAttribute('tabindex', '-1');
this.host = this.plugin.leafHost(this);
this.plugin.openManuscriptModal({ host: this.host, tab: this.paneTab(), only: true });
}
async onClose() {
try { if (this.host) this.host.teardown(); } catch (_) { zgCatch('onClose: if (this.host) this.host.teardown();', _); }
this.contentEl.empty();
}
} : null;
const WsExportView = WsOutlinerView ? class extends WsOutlinerView {
paneTab() { return 'export'; }
getViewType() { return WS_EXPORT_VIEW; }
} : null;
const WsHistoryView = WsOutlinerView ? class extends WsOutlinerView {
paneTab() { return 'history'; }
getViewType() { return WS_HISTORY_VIEW; }
} : null;
const WS_PANE_CLASSES = { organizer: WsOutlinerView, export: WsExportView, history: WsHistoryView };
const WsMenuView = ItemView ? class extends ItemView {
constructor(leaf, plugin) { super(leaf); this.plugin = plugin; }
getViewType() { return WS_MENU_VIEW; }
getDisplayText() { return 'Word-Smith'; }
getIcon() { return WS_ICON; }
async onOpen() {
this.render();
this.contentEl.setAttribute('tabindex', '-1');
this.contentEl.addEventListener('pointerdown', () => {
this.plugin._panelPointerDown = true;
});
const release = () => {
if (!this.plugin._panelPointerDown) return;
this.plugin._panelPointerDown = false;
if (!this.plugin._panelRefreshPending) return;
this.plugin._panelRefreshPending = false;
setTimeout(() => this.plugin.refreshMenuPanelsNow(), 0);
};
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);
this._releasePanelPointer = release;
this.contentEl.addEventListener('keydown', (e) => {
const typing = this.contentEl.querySelector('.zg-menu-search')
=== document.activeElement;
const k = e.key;
const vim = !typing && 'hjkl'.includes(k);
if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter', 'Escape'].includes(k)
&& !vim) return;
const rows = this.navItems();
if (!rows.length) return;
const step = (d) => {
this._at = Math.max(0, Math.min((this._at || 0) + d, rows.length - 1));
this.paint(true);
};
if (k === 'ArrowDown' || k === 'j') { e.preventDefault(); step(1); return; }
if (k === 'ArrowUp' || k === 'k') { e.preventDefault(); step(-1); return; }
if (k === 'Enter' || k === 'ArrowRight' || k === 'l') {
e.preventDefault();
const cur = rows[this._at || 0];
if (cur) cur.click();
return;
}
if (k === 'ArrowLeft' || k === 'h') {
e.preventDefault();
const cur = rows[this._at || 0];
const owner = cur && cur.closest && cur.closest('.zg-menu-item');
const id = owner && owner.dataset ? owner.dataset.rowId : null;
if (id && this._openSet.has(id)) { this._openSet.delete(id); this.render(); }
return;
}
if (k === 'Escape') {
e.preventDefault();
if ((this._q || '').trim()) { this._q = ''; this.render(); return; }
if (this._openSet.size) { this._openSet.clear(); this.render(); }
}
});
}
async onClose() {
try {
if (this._releasePanelPointer) {
document.removeEventListener('pointerup', this._releasePanelPointer, true);
document.removeEventListener('pointercancel', this._releasePanelPointer, true);
}
} catch (_) { zgCatch('onClose: if (this._releasePanelPointer)', _); }
try { this.plugin._panelPointerDown = false; } catch (_) { zgCatch('onClose: this.plugin._panelPointerDown = false;', _); }
try {
if (this.plugin.barThemeOnCssChange) this.plugin.barThemeOnCssChange();
if (this.plugin.barThemeGuard) this.plugin.barThemeGuard();
} catch (_) { zgCatch('onClose: if (this.plugin.barThemeOnCssChange) …', _); }
}
returnFocus() {
try { if (this.plugin.refresh) this.plugin.refresh(); } catch (_) { zgCatch('returnFocus: if (this.plugin.refresh) this.plugin.refresh();', _); }
}
refreshStates() {
const specs = this.plugin.menuRowSpecs();
const label = (row) => (typeof row.label === 'function' ? row.label() : row.label);
for (const node of Array.from(this.contentEl.querySelectorAll('.zg-menu-item'))) {
const id = node.dataset ? node.dataset.rowId : null;
const row = specs.find(r => r.id === id);
if (!row) continue;
const el = node.querySelector('.zg-menu-row');
if (!el) continue;
const lab = el.querySelector('.zg-menu-label');
if (lab) lab.textContent = label(row);
const icon = el.querySelector('.zg-menu-icon');
if (icon && !icon.classList.contains('is-blank')) {
const def = (this.plugin.menuFeatureDefs() || [])
.filter(d => d.id === row.id)[0];
if (def && typeof def.icon === 'function') {
const want = this.plugin.menuIconFor(row.id);
if (want) {
icon.textContent = '';
try { if (setIcon) setIcon(icon, want); } catch (_) { zgCatch('refreshStates: if (setIcon) setIcon(icon, want);', _); }
}
}
}
const state = el.querySelector('.zg-menu-state');
if (row.items && state) {
const its = row.items();
if (row.count !== false) {
const on = its.filter(i => (typeof i.on === 'function' ? i.on() : i.on)).length;
state.textContent = on ? String(on) + ' on' : 'off';
} else {
const cur = its.find(i => (typeof i.on === 'function' ? i.on() : i.on));
if (cur) state.textContent = cur.label;
}
}
const subs = Array.from(node.querySelectorAll('.zg-menu-sub'));
if (subs.length && row.items) {
const its = row.items();
subs.forEach((sub, i) => {
const it = its[i];
if (!it) return;
const on = (typeof it.on === 'function' ? it.on() : it.on);
sub.toggleClass('is-off', !on);
});
}
}
this.paint();
}
drawDrawer(node, row) {
const box = node.createDiv({
cls: 'tree-item-children nav-folder-children zg-panel-drawer is-opening'
});
const done = () => {
box.removeClass('is-opening');
box.removeEventListener('animationend', done);
};
box.addEventListener('animationend', done);
setTimeout(done, 600);
return this.fillDrawer(box, row);
}
fillDrawer(box, row) {
for (const item of row.items()) {
const isOn = (typeof item.on === 'function' ? item.on() : item.on);
const kid = box.createDiv({ cls: 'tree-item nav-file' });
const sub = kid.createDiv({
cls: 'tree-item-self is-clickable nav-file-title'
+ ' zg-menu-sub zg-picker-row' + (isOn ? '' : ' is-off')
});
if (item.color) {
const dot = sub.createSpan({ cls: 'zg-picker-dot' });
if (item.color !== 'currentColor') dot.style.backgroundColor = item.color;
}
if (item.icon) {
const ic = item.icon();
ic.classList.add('zg-picker-icon');
sub.appendChild(ic);
}
const lab = sub.createSpan({ cls: 'zg-picker-label', text: item.label });
if (item.font) lab.style.fontFamily = item.font;
sub.addEventListener('click', async () => {
const idx = this.navItems().indexOf(sub);
if (idx >= 0) this._at = idx;
if (item.onClick) await item.onClick();
this.refreshStates();
this.returnFocus();
});
}
return box;
}
navItems() {
return [...this.contentEl.querySelectorAll('.zg-menu-row, .zg-menu-sub')];
}
paint(scroll) {
const rows = this.navItems();
rows.forEach((el, i) => el.toggleClass('is-active', i === (this._at || 0)));
if (!scroll) return;
const cur = rows[this._at || 0];
if (cur && cur.scrollIntoView) {
try { cur.scrollIntoView({ block: 'nearest' }); } catch (_) { zgCatch('paint: cur.scrollIntoView( block: \'nearest\' );', _); }
}
}
render() {
const plugin = this.plugin;
const root = this.contentEl;
root.empty();
if (this._at == null) this._at = 0;
if (!this._openSet) this._openSet = new Set();
root.addClass('zg-menu-panel');
const header = root.createDiv({ cls: 'zg-menu-header nav-header' });
const list = root.createDiv({
cls: 'zg-menu-list nav-files-container node-insert-event'
});
const rootItem = list.createDiv({ cls: 'tree-item nav-folder mod-root' });
const rows = rootItem.createDiv({ cls: 'tree-item-children nav-folder-children' });
const specs = plugin.menuRowSpecs();
const label = (row) => (typeof row.label === 'function' ? row.label() : row.label);
const q = (this._q || '').trim().toLowerCase();
for (const id of plugin.menuVisibleLayout()) {
if (id === 'search') {
const bar = header.createDiv({ cls: 'nav-buttons-container' });
const inp = zgMenuSearchInto(bar);
inp.value = this._q || '';
inp.addEventListener('input', () => {
this._q = inp.value;
this.render();
const next = (this.contentEl.querySelector('.zg-menu-search'));
if (next) {
try {
next.focus();
next.setSelectionRange(next.value.length, next.value.length);
} catch (_) { zgCatch('render: next.focus();', _); }
}
});
continue;
}
if (/^rule-\d+$/.test(id)) {
rows.createDiv({ cls: 'zg-menu-rule is-' + plugin.menuRuleStyle(id) });
continue;
}
if (q) continue;
const row = specs.find(r => r.id === id)
|| (plugin.menuIsCommand(id) && plugin.menuCommandFor(id) ? {
id,
label: plugin.menuAliasOf(id),
full: plugin.menuCommandName(id),
wide: true,
run: () => {
try { plugin.app.commands.executeCommandById(plugin.menuCommandId(id)); }
catch (_) { zgCatch('render / run: plugin.app.commands.executeCommandById(plugin.menuCommandId(id));', _); }
}
} : null);
if (!row) continue;
const node = rows.createDiv({ cls: 'tree-item nav-folder zg-menu-item' });
try { node.dataset.rowId = row.id; } catch (_) { zgCatch('render: node.dataset.rowId = row.id;', _); }
const el = node.createDiv({
cls: 'tree-item-self is-clickable zg-menu-row'
+ (row.items ? ' mod-collapsible nav-folder-title' : ' nav-file-title')
});
if (row.full) {
el.setAttribute('title', row.full);
el.setAttribute('aria-label', row.full);
}
if (row.items) {
const chev = el.createDiv({
cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator'
+ ' zg-menu-chev'
+ (this._openSet.has(row.id) ? '' : ' is-collapsed')
});
try { if (setIcon) setIcon(chev, 'right-triangle'); } catch (_) { zgCatch('render: if (setIcon) setIcon(chev, \'right-triangle\');', _); }
} else {
el.createDiv({
cls: 'tree-item-icon collapse-icon nav-folder-collapse-indicator'
+ ' zg-menu-chev is-blank'
});
}
{
plugin.menuDrawIcon(el, row.id);
}
el.createDiv({
cls: 'tree-item-inner nav-folder-title-content zg-menu-label',
text: label(row)
});
if (row.items && row.count !== false) {
const its = row.items();
const on = its.filter(i => (typeof i.on === 'function' ? i.on() : i.on)).length;
el.createSpan({ cls: 'zg-menu-state', text: on ? String(on) + ' on' : 'off' });
} else if (row.items) {
const cur = row.items().find(i => (typeof i.on === 'function' ? i.on() : i.on));
if (cur) el.createSpan({ cls: 'zg-menu-state', text: cur.label });
}
el.setAttribute('draggable', 'true');
el.addEventListener('dragstart', (ev) => {
this._dragRow = row.id;
el.addClass('is-dragging');
try { ev.dataTransfer.setData('text/plain', row.id); } catch (_) { zgCatch('render: ev.dataTransfer.setData(\'text/plain\', row.id);', _); }
});
el.addEventListener('dragend', () => {
this._dragRow = null;
el.removeClass('is-dragging');
for (const n of Array.from(rows.querySelectorAll('.zg-menu-row'))) {
n.removeClass('is-drop-above'); n.removeClass('is-drop-below');
}
});
el.addEventListener('dragover', (ev) => {
if (!this._dragRow || this._dragRow === row.id) return;
ev.preventDefault();
let above = true;
try {
const r = el.getBoundingClientRect();
above = (ev.clientY - r.top) < r.height / 2;
} catch (_) { zgCatch('render: const r = el.getBoundingClientRect();', _); }
el.toggleClass('is-drop-above', above);
el.toggleClass('is-drop-below', !above);
});
el.addEventListener('dragleave', () => {
el.removeClass('is-drop-above'); el.removeClass('is-drop-below');
});
el.addEventListener('drop', async (ev) => {
ev.preventDefault();
const moved = this._dragRow;
this._dragRow = null;
const above = el.classList.contains('is-drop-above');
el.removeClass('is-drop-above'); el.removeClass('is-drop-below');
if (!moved || moved === row.id) return;
const ids = plugin.menuLayout().filter(x => x !== moved);
const at = ids.indexOf(row.id);
plugin.menuMove(moved, at + (above ? 0 : 1));
await plugin.saveSettings();
this.render();
});
el.addEventListener('click', async () => {
const idx = this.navItems().indexOf(el);
if (idx >= 0) this._at = idx;
if (row.toggle) { row.toggle(); this.refreshStates(); this.returnFocus(); return; }
if (row.run) { row.run(); return; }
const opening = !this._openSet.has(row.id);
if (opening) this._openSet.add(row.id);
else this._openSet.delete(row.id);
const chev = el.querySelector('.zg-menu-chev');
if (chev) {
if (opening) chev.removeClass('is-collapsed');
else chev.addClass('is-collapsed');
}
if (opening) {
node.addClass('is-open');
this.drawDrawer(node, row);
} else {
node.removeClass('is-open');
const kids = node.querySelector('.tree-item-children');
if (kids) kids.remove();
}
this.paint();
});
if (this._openSet.has(row.id) && row.items) {
node.addClass('is-open');
this.drawDrawer(node, row);
}
}
if (q) {
const hits = [];
for (const id of plugin.menuVisibleLayout()) {
const row = specs.find(r => r.id === id);
if (!row) continue;
const lab = label(row);
if (row.run || row.toggle) {
const sc = Math.max(barMenuFuzzy(q, lab),
row.keywords ? barMenuFuzzy(q, row.keywords) - 1 : -1);
if (sc >= 0) hits.push({ sc, kind: 'row', row, label: lab });
}
if (!row.items) continue;
for (const item of row.items()) {
const sc = Math.max(barMenuFuzzy(q, item.label),
barMenuFuzzy(q, lab + ' ' + item.label) - 2);
if (sc >= 0) hits.push({ sc, kind: 'item', item, from: lab });
}
}
hits.sort((a, b) => b.sc - a.sc);
for (const h of hits.slice(0, 12)) {
const isOn = h.kind === 'item'
&& (typeof h.item.on === 'function' ? h.item.on() : h.item.on);
const sub = list.createDiv({
cls: 'zg-menu-sub zg-picker-row zg-menu-result'
+ (h.kind === 'item' && !isOn ? ' is-off' : '')
});
if (h.kind === 'item' && h.item.color) {
const dot = sub.createSpan({ cls: 'zg-picker-dot' });
if (h.item.color !== 'currentColor') dot.style.backgroundColor = h.item.color;
}
sub.createSpan({ cls: 'zg-picker-label',
text: h.kind === 'row' ? h.label : h.item.label });
if (h.kind === 'item') sub.createSpan({ cls: 'zg-menu-in', text: h.from });
sub.addEventListener('click', async () => {
if (h.kind === 'item') {
if (h.item.onClick) await h.item.onClick();
this.render();
this.returnFocus();
return;
}
if (h.row.toggle) { h.row.toggle(); this.render(); this.returnFocus(); return; }
if (h.row.run) h.row.run();
});
}
if (!hits.length) list.createDiv({ cls: 'zg-menu-empty', text: 'Nothing matches' });
}
const n = this.navItems().length;
if (n) this._at = Math.max(0, Math.min(this._at, n - 1));
this.paint();
}
} : null;
let CM = null;
try {
const { ViewPlugin, Decoration, WidgetType, keymap, EditorView } = require('@codemirror/view');
const { RangeSetBuilder, Prec } = require('@codemirror/state');
CM = { ViewPlugin, Decoration, WidgetType, RangeSetBuilder, keymap, EditorView, Prec, isolateHistory: null };
try { CM.isolateHistory = require('@codemirror/commands').isolateHistory; } catch (_) { zgCatch('module: CM.isolateHistory = require(\'@codemirror/commands\').isolateHistory;', _); }
} catch (_) {
}
const ARROW_STYLES = {
'solid-triangle': { top: '▲', bottom: '▼' },
'outline-triangle': { top: '△', bottom: '▽' },
'standard-arrow': { top: '↑', bottom: '↓' },
'chevron': { top: '∧', bottom: '∨' },
'double-chevron': { top: '⇑', bottom: '⇓' },
'custom': { top: '', bottom: '' }
};
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
add('NUM', `two three four five six seven eight nine ten eleven twelve
		thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty
		thirty forty fifty sixty seventy eighty ninety hundred thousand
		million billion dozen`);
add('ADV', `not never always often sometimes usually rarely seldom very
		quite rather too also just only even still already soon now then here
		there again once twice far away back together apart forward ahead
		almost nearly hardly barely scarcely somewhat somehow perhaps maybe
		indeed instead however therefore thus moreover nevertheless nonetheless
		anyway otherwise meanwhile furthermore hence why how well today
		tomorrow yesterday tonight later earlier ever else rather forth aside
		abroad anymore altogether upward downward inward outward up down out`);
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
add('AUX', `don't doesn't didn't isn't aren't wasn't weren't hasn't
		haven't hadn't i'm you're we're they're he's she's it's that's
		there's what's here's who's let's i've you've we've they've it'll
		that'll i'll you'll he'll she'll we'll they'll i'd you'd he'd she'd
		we'd they'd`);
add('MOD', `can't won't wouldn't shouldn't couldn't mustn't needn't
		oughtn't`);
})();
const LY_NOT_ADVERB = new Set(`only family reply apply supply imply comply
	multiply rely rally ally july italy holy ugly silly early likely lonely
	lovely friendly deadly costly orderly elderly monthly weekly daily yearly
	nightly hourly timely lively unlikely ghastly ghostly homely jolly folly
	bully belly sally tally melancholy anomaly assembly bristly burly chilly
	crumbly curly dolly gully hilly jelly kindly lolly manly measly oily
	prickly rally scaly smelly steely surly wobbly wooly worldly italy sicily
	assembly panoply monopoly`.split(/\s+/).filter(Boolean));
const WORD_RE = /[A-Za-z][A-Za-z'\u2019-]*|\d+(?:[.,:]\d+)*%?/g;
function tokenizeLine(text) {
const out = [];
WORD_RE.lastIndex = 0;
let m;
while ((m = WORD_RE.exec(text))) {
let w = m[0].replace(/[-'\u2019]+$/, '');
if (!w) continue;
out.push({ w, lw: w.toLowerCase().replace(/\u2019/g, "'"), from: m.index, to: m.index + w.length, tag: null });
}
return out;
}
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
if (!isFirstInSentence && /^[A-Z]/.test(raw)) return 'NOUN';
return 'NOUN';
}
const SENT_END = /[.!?\u2026]$/;
const DEGREE_ADVERBS = new Set(['very', 'so', 'too', 'quite', 'rather',
'really', 'extremely', 'incredibly', 'terribly', 'awfully', 'fairly',
'pretty', 'somewhat', 'deeply', 'highly', 'utterly', 'truly',
'remarkably', 'surprisingly', 'perfectly', 'entirely', 'completely']);
const FLAT_ADVERBS = new Set(['close', 'fast', 'hard', 'tight', 'straight',
'high', 'low', 'deep', 'long', 'far', 'near', 'early', 'late', 'slow',
'quick', 'loud', 'wide', 'right', 'wrong', 'first', 'last']);
const LINKING_VERBS = new Set(`seem seems seemed appear appears appeared
	look looks looked feel feels felt sound sounds sounded smell smells
	smelled taste tastes tasted grow grows grew turn turns turned remain
	remains remained stay stays stayed become becomes became get gets got
	getting`.split(/\s+/).filter(Boolean));
const ABBREVIATIONS = new Set(`mr mrs ms dr prof rev gen sen rep hon st mt
	ft vs etc al cf ca approx dept est fig vol ch pp no op ed inc ltd co
	corp univ assn bros jan feb mar apr jun jul aug sep sept oct nov dec
	mon tue tues wed thu thurs fri sat sun`.split(/\s+/).filter(Boolean));
const SUBJECT_PRONOUNS = new Set(['i', 'you', 'we', 'they', 'he', 'she', 'it', 'who']);
function tagTokens(tokens, text) {
let firstInSentence = true;
for (let i = 0; i < tokens.length; i++) {
const t = tokens[i];
const lex = POS_LEX[t.lw];
t.first = firstInSentence;
let dyn = null;
if (!lex && t.lw !== "ma'am") {
const cm = /'(ll|d|re|ve|m)$/.exec(t.lw);
if (cm) dyn = (cm[1] === 'll' || cm[1] === 'd') ? 'MOD' : 'AUX';
}
t.tag = lex || dyn || suffixTag(t.lw, t.w, firstInSentence);
const after = text.slice(t.to, t.to + 2);
const ch = after.trim().charAt(0) || '';
if (!SENT_END.test(ch)) { firstInSentence = false; continue; }
if (ch !== '.') { firstInSentence = true; continue; }
const nx = tokens[i + 1];
firstInSentence = !(ABBREVIATIONS.has(t.lw) || t.lw.length === 1) &&
(!nx || /^[A-Z]/.test(nx.w));
}
for (let i = 0; i < tokens.length; i++) {
const t = tokens[i];
const prev = i > 0 ? tokens[i - 1] : null;
const next = i + 1 < tokens.length ? tokens[i + 1] : null;
if (t.tag === 'VERB' && prev && (prev.tag === 'DET' || prev.tag === 'PREP')) {
const causative = prev.lw === 'her' && POS_LEX[t.lw] === 'VERB' &&
i >= 2 && tokens[i - 2].tag === 'VERB';
if (causative) { }
else if (/ed$/.test(t.lw)) t.tag = 'ADJ';
else if (/ing$/.test(t.lw)) {
if (prev.tag === 'DET') t.tag = (next && next.tag === 'NOUN') ? 'ADJ' : 'NOUN';
}
else t.tag = 'NOUN';
}
if (t.tag === 'ADV' && (t.lw === 'well' || t.lw === 'back') && prev &&
prev.tag === 'DET' && (!next || (next.tag !== 'NOUN' && next.tag !== 'ADJ'))) {
t.tag = 'NOUN';
}
if (t.tag === 'ADJ' && prev && prev.tag === 'DET' && (!next || next.tag !== 'NOUN')) {
if (!next || (next.tag !== 'ADJ' && next.tag !== 'NOUN')) t.tag = 'NOUN';
}
if (prev && prev.tag === 'TO' && (t.tag === 'NOUN' || t.tag === 'ADJ') && POS_LEX[t.lw] !== 'NOUN') {
t.tag = 'VERB';
}
if (prev && (prev.tag === 'AUX' || prev.tag === 'MOD') && t.tag === 'NOUN' &&
!POS_LEX[t.lw] && /ing$|ed$|en$/.test(t.lw)) {
t.tag = 'VERB';
}
if (t.lw === 'to' && next && next.tag === 'AUX' &&
/^(do|be|have)$/.test(next.lw)) {
t.tag = 'TO';
next.tag = 'VERB';
}
if (prev && /^(don't|doesn't|didn't)$/.test(prev.lw) &&
(t.tag === 'NOUN' || t.tag === 'ADJ')) {
t.tag = 'VERB';
}
if (prev && prev.tag === 'MOD' && (t.tag === 'NOUN' || t.tag === 'ADJ') &&
!POS_LEX[t.lw] && !(next && next.tag === 'AUX')) {
t.tag = 'VERB';
}
if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && DEGREE_ADVERBS.has(prev.lw) &&
(!next || next.tag !== 'NOUN')) {
t.tag = 'ADJ';
}
if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next !== undefined &&
(prev.lw === 'and' || prev.lw === 'or' || prev.lw === 'but') &&
i >= 2 && tokens[i - 2].tag === 'ADJ' && (!next || next.tag !== 'NOUN')) {
t.tag = 'ADJ';
}
if (t.tag === 'NOUN' && next && next.tag === 'NOUN' && /(ic|al|ive|ous|ful)$/.test(t.lw)) {
t.tag = 'ADJ';
}
if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && next &&
(prev.tag === 'DET' || prev.tag === 'ADJ' || prev.tag === 'PREP') && next.tag === 'NOUN') {
t.tag = 'ADJ';
}
if (t.first && t.tag === 'NOUN' && !POS_LEX[t.lw] && next &&
(next.tag === 'DET' || next.tag === 'PRON')) {
t.tag = 'VERB';
}
if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && prev.tag === 'PRON' &&
SUBJECT_PRONOUNS.has(prev.lw)) {
t.tag = 'VERB';
}
if (t.tag === 'NOUN' && !POS_LEX[t.lw] && prev && prev.tag === 'VERB' && LINKING_VERBS.has(prev.lw) &&
(!next || (next.tag !== 'NOUN' && next.tag !== 'DET'))) {
t.tag = 'ADJ';
}
if (prev && prev.tag === 'VERB' && FLAT_ADVERBS.has(t.lw) &&
(t.tag === 'ADJ' || t.tag === 'NOUN' || t.tag === 'VERB') &&
!(next && next.tag === 'NOUN')) {
t.tag = 'ADV';
}
if (t.lw === 'that' && t.tag === 'DET' && next &&
((next.tag === 'PRON' && SUBJECT_PRONOUNS.has(next.lw)) || next.tag === 'DET')) {
t.tag = 'CONJ';
}
if (t.lw === 'like' && prev &&
((prev.tag === 'PRON' && SUBJECT_PRONOUNS.has(prev.lw)) || prev.tag === 'MOD' ||
/^(do|does|did|don't|doesn't|didn't|won't|can't|couldn't|wouldn't|shouldn't)$/.test(prev.lw))) {
t.tag = 'VERB';
}
if (t.first && t.tag === 'VERB' && /ing$/.test(t.lw) && next &&
(next.tag === 'AUX' || next.tag === 'MOD')) {
t.tag = 'NOUN';
}
}
for (let i = 0; i < tokens.length; i++) {
if (tokens[i].tag !== 'TO') continue;
const next = tokens[i + 1];
if (!next || next.tag !== 'VERB') tokens[i].tag = 'PREP';
}
return tokens;
}
function posBucket(tag) {
switch (tag) {
case 'NOUN': case 'PRON': return 'noun';
case 'VERB': case 'AUX': case 'MOD': return 'verb';
case 'ADJ': return 'adj';
case 'ADV': return 'adv';
case 'CONJ': case 'PREP': return 'conj';
default: return null;
}
}
const FILLER_STRONG = new Set(`very really quite rather somewhat fairly pretty
	extremely incredibly absolutely totally completely utterly literally
	actually basically essentially virtually practically arguably apparently
	seemingly presumably supposedly perhaps maybe probably possibly surely
	certainly clearly obviously definitely simply merely just truly honestly
	frankly somehow interestingly notably importantly ultimately effectively`
.split(/\s+/).filter(Boolean));
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
const BE_FORMS = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
"isn't", "aren't", "wasn't", "weren't", 'get', 'gets', 'got', 'getting',
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
const pp = tokens[j];
const nxt = j + 1 < tokens.length ? tokens[j + 1] : null;
if (PARTICIPLE_ADJECTIVES.has(pp.lw) &&
(AGENTLESS_STATES.has(pp.lw) || !(nxt && nxt.lw === 'by'))) { i = j; continue; }
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
function findIllusions(tokens) {
const hits = [];
for (let i = 1; i < tokens.length; i++) {
if (tokens[i].lw !== tokens[i - 1].lw) continue;
if (tokens[i].lw.length < 2) continue;
if (tokens[i].lw === 'had') continue;
hits.push({ from: tokens[i - 1].from, to: tokens[i].to });
}
return hits;
}
const MISUSED_ALWAYS = new Set(['alot', 'irregardless', 'supposably',
'definately', 'seperate', 'occured', 'untill', 'recieve', 'alright']);
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
const t = tokens[i];
const p = i > 0 ? tokens[i - 1] : null;
const n = i + 1 < tokens.length ? tokens[i + 1] : null;
const lw = t.lw, nl = n ? n.lw : '', pl = p ? p.lw : '';
if (MISUSED_ALWAYS.has(lw)) { flag(t); continue; }
switch (lw) {
case 'of':
if (p && /^(could|would|should|must|might|may)$/.test(pl)) flag(p, t);
break;
case 'its':
if (n && (n.tag === 'DET' ||
(n.tag === 'AUX' && nl !== 'being' && nl !== 'having') ||
nl === 'not')) flag(t);
break;
case "it's":
if (nl === 'own') flag(t);
break;
case 'their':
if (n && ((n.tag === 'AUX' && nl !== 'being' && nl !== 'having') ||
nl === 'not')) flag(t);
break;
case 'there':
if (n && n.tag === 'NOUN' && POS_LEX[nl] === 'NOUN' &&
!(p && p.tag === 'AUX')) flag(t);
break;
case 'then':
if (p && n &&
(COMPARATIVES.has(pl) || (p.tag === 'ADJ' && /er$/.test(pl))) &&
(n.tag === 'DET' || n.tag === 'PRON' || n.tag === 'NOUN' ||
n.tag === 'ADJ' || n.tag === 'NUM' || n.tag === 'VERB')) flag(p, t);
break;
case 'to':
if ((nl === 'much' || nl === 'many') &&
(!p || p.tag === 'AUX' || p.tag === 'MOD' || pl === 'way' || pl === 'far')) flag(t, n);
break;
case 'loose':
if (p && (p.tag === 'MOD' || p.tag === 'TO' ||
/^(don't|doesn't|didn't|won't|not)$/.test(pl))) flag(t);
break;
case 'affect': case 'affects':
if (p && p.tag === 'DET') flag(t);
break;
case 'less':
if (n && n.tag === 'NOUN' && /s$/.test(nl) &&
!/(ss|us|is)$/.test(nl) && !MASS_S_NOUNS.has(nl)) flag(t, n);
break;
case "who's":
if (n && POS_LEX[nl] === 'NOUN') flag(t);
break;
case 'your':
if (nl === 'welcome' || nl === 'not' || nl === 'going' || nl === 'gonna' ||
(n && n.tag === 'DET') ||
(n && n.tag === 'AUX' && nl !== 'being' && nl !== 'having')) flag(t);
break;
case 'accept':
if (nl === 'for') flag(t, n);
break;
case 'quiet':
if (nl === 'a' || nl === 'an') flag(t, n);
break;
case 'chose':
if (p && (p.tag === 'MOD' || p.tag === 'TO' ||
/^(don't|doesn't|didn't|won't)$/.test(pl))) flag(t);
break;
case 'lead':
if ((p && /^(have|has|had)$/.test(pl)) ||
(p && BE_FORMS.has(pl) && nl === 'by')) flag(t);
break;
case 'passed':
if (p && p.tag === 'VERB' && n && n.tag === 'DET') flag(t);
break;
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
const VAGUE_PRONOUNS = new Set(['it', 'this', 'that', 'these', 'those', 'they', 'them', 'there']);
function isVaguePronoun(t, next) {
if (!t.first || !VAGUE_PRONOUNS.has(t.lw)) return false;
if ((t.lw === 'this' || t.lw === 'that' || t.lw === 'these' || t.lw === 'those') &&
next && (next.tag === 'NOUN' || next.tag === 'ADJ' || next.tag === 'NUM')) return false;
return true;
}
function countSyllables(word) {
let w = String(word).toLowerCase().replace(/[^a-z]/g, '');
if (!w) {
const d = String(word).replace(/[^0-9]/g, '').length;
return d ? Math.min(6, d + 1) : 0;
}
if (w.length <= 3) return 1;
w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
w = w.replace(/^y/, '');
const groups = w.match(/[aeiouy]{1,2}/g);
return groups ? groups.length : 1;
}
const SENTENCE_SPLIT = /[^.!?\u2026]+[.!?\u2026]*\s*/g;
function splitSentences(text) {
const out = [];
SENTENCE_SPLIT.lastIndex = 0;
let m;
while ((m = SENTENCE_SPLIT.exec(text))) {
if (!m[0].trim()) continue;
const raw = m[0];
const from = m.index;
const to = from + raw.replace(/\s+$/, '').length;
if (to <= from) continue;
const prev = out.length ? out[out.length - 1] : null;
if (prev) {
const tail = text.slice(prev.from, prev.to);
const am = /([A-Za-z]+)\.$/.exec(tail);
const falseEnd = (am && (am[1].length === 1 || ABBREVIATIONS.has(am[1].toLowerCase()))) ||
/\d\.$/.test(tail) || /^[a-z0-9]/.test(raw.trim());
if (falseEnd) {
prev.to = to;
prev.text = text.slice(prev.from, to).trim();
continue;
}
}
out.push({ from, to, text: raw.trim() });
}
return out;
}
function fkGrade(words, sentences, syllables) {
if (!words || !sentences) return 0;
return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}
function sentenceGrade(tokens) {
if (!tokens.length) return 0;
let syl = 0;
for (const t of tokens) syl += countSyllables(t.w);
return fkGrade(tokens.length, 1, syl);
}
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
function findDialogue(line) {
const text = String(line || '');
const out = [];
const PAIRS = {
'"': '"', "'": "'",
'\u201c': '\u201d', '\u2018': '\u2019',
'\u00ab': '\u00bb', '\u201e': '\u201c'
};
const isWordish = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
let i = 0;
while (i < text.length) {
const ch = text[i];
const close = PAIRS[ch];
if (!close) { i++; continue; }
if ((ch === "'" || ch === '\u2018' || ch === '\u2019')
&& isWordish(text[i - 1]) && isWordish(text[i + 1])) { i++; continue; }
let j = -1;
for (let k = i + 1; k < text.length; k++) {
const c = text[k];
if (c !== close) continue;
if ((close === "'" || close === '\u2019')
&& isWordish(text[k - 1]) && isWordish(text[k + 1])) continue;
j = k;
break;
}
const end = j === -1 ? text.length : j + 1;
if (end > i + 1) out.push({ from: i, to: end });
i = end;
}
return out;
}
function findRepetitions(tokens, windowSize, minLength) {
const hits = [];
const lastSeen = new Map();
for (let i = 0; i < tokens.length; i++) {
const t = tokens[i];
const w = t.lw.replace(/[^a-z']/g, '');
if (w.length < minLength || REPETITION_STOPWORDS.has(w)) continue;
const stem = w.replace(/(ing|ed|es|s)$/, '');
const key = stem.length >= 4 ? stem : w;
const prev = lastSeen.get(key);
if (prev !== undefined && i - prev.i <= windowSize) {
if (!prev.flagged) hits.push({ from: prev.from, to: prev.to });
hits.push({ from: t.from, to: t.to });
lastSeen.set(key, { i, from: t.from, to: t.to, flagged: true });
} else {
lastSeen.set(key, { i, from: t.from, to: t.to, flagged: false });
}
}
return hits;
}
const TYPO_RULES = [
{ group: 'ellipsis', text: '...', insert: '\u2026' },
{ group: 'dashes', text: '--', insert: '\u2013' },
{ group: 'dashes', text: '\u2013-', insert: '\u2014' },
{ group: 'dashes', text: '\u2014-', insert: '---' },
{ group: 'arrows', text: '->', insert: '\u2192' },
{ group: 'arrows', text: '<-', insert: '\u2190' },
{ group: 'arrows', text: '=>', insert: '\u21d2' },
{ group: 'guillemets', text: '<<', insert: '\u00ab' },
{ group: 'guillemets', text: '>>', insert: '\u00bb' },
{ group: 'comparisons', text: '<=', insert: '\u2264' },
{ group: 'comparisons', text: '>=', insert: '\u2265' },
{ group: 'comparisons', text: '/=', insert: '\u2260' },
{ group: 'fractions', text: '1/2', insert: '\u00bd', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/3', insert: '\u2153', notAfter: /[\d/]/ },
{ group: 'fractions', text: '2/3', insert: '\u2154', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/4', insert: '\u00bc', notAfter: /[\d/]/ },
{ group: 'fractions', text: '3/4', insert: '\u00be', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/5', insert: '\u2155', notAfter: /[\d/]/ },
{ group: 'fractions', text: '2/5', insert: '\u2156', notAfter: /[\d/]/ },
{ group: 'fractions', text: '3/5', insert: '\u2157', notAfter: /[\d/]/ },
{ group: 'fractions', text: '4/5', insert: '\u2158', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/6', insert: '\u2159', notAfter: /[\d/]/ },
{ group: 'fractions', text: '5/6', insert: '\u215a', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/7', insert: '\u2150', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/8', insert: '\u215b', notAfter: /[\d/]/ },
{ group: 'fractions', text: '3/8', insert: '\u215c', notAfter: /[\d/]/ },
{ group: 'fractions', text: '5/8', insert: '\u215d', notAfter: /[\d/]/ },
{ group: 'fractions', text: '7/8', insert: '\u215e', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/9', insert: '\u2151', notAfter: /[\d/]/ },
{ group: 'fractions', text: '1/10', insert: '\u2152', notAfter: /[\d/]/ }
];
TYPO_RULES.sort((a, b) => b.text.length - a.text.length);
const TYPO_MAX_LOOKBACK = TYPO_RULES.reduce((n, r) => Math.max(n, r.text.length), 0);
const TYPO_OPENS_AFTER = /[\s([{<\u2018\u201c\u2013\u2014\u2026-]/;
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
if (!inFence) { inFence = true; fenceChar = ch; set.add(n); continue; }
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
const BLOCK_LINE_RE = /^\s{0,3}(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|\||```|~~~|\[\^[^\]]*\]:|:\s)|^(?:\s{4,}|\t)\S/;
const RULE_LINE_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,}|={2,})\s*$/;
function isParagraphLine(text) {
if (!text || !text.trim()) return false;
if (RULE_LINE_RE.test(text)) return false;
if (BLOCK_LINE_RE.test(text)) return false;
return true;
}
const CJK_CHAR = /[\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/g;
const WORDISH = /[\p{L}\p{N}][\p{L}\p{N}'\u2019_-]*/gu;
function maskForCounting(text) {
const blank = m => ' '.repeat(m.length);
let out = text;
out = out.replace(/^\s*(?:>\s?)+/, blank);
out = out.replace(/^\s*[-*+]\s+\[[ xX\-]\]\s*/, blank);
out = out.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, blank);
out = out.replace(/`+/g, blank);
out = out.replace(/!\[\[[^\]]*\]\]/g, blank);
out = out.replace(/\[\[([^\]|]*)\|/g, blank);
out = out.replace(/\[\[|\]\]/g, blank);
out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, blank);
out = out.replace(/\]\([^)]*\)/g, blank);
out = out.replace(/https?:\/\/\S+/g, blank);
out = out.replace(/<[^>]+>/g, blank);
out = out.replace(/\[\^[^\]]*\]/g, blank);
out = out.replace(/\$[^$\n]+\$/g, blank);
return out;
}
function maskMarkup(text) {
const blank = m => ' '.repeat(m.length);
let out = text;
out = out.replace(/`[^`]*`?/g, blank);
out = out.replace(/!\[\[[^\]]*\]\]/g, blank);
out = out.replace(/\[\[([^\]|]*)\|/g, blank);
out = out.replace(/\[\[|\]\]/g, blank);
out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, blank);
out = out.replace(/\]\([^)]*\)/g, blank);
out = out.replace(/https?:\/\/\S+/g, blank);
out = out.replace(/<[^>]+>/g, blank);
out = out.replace(/\[\^[^\]]*\]/g, blank);
out = out.replace(/^\s{0,3}#{1,6}\s/, blank);
out = out.replace(/\{\{[^}]*\}\}/g, blank);
return out;
}
const ZG_COL_MIN_CH = 4, ZG_COL_MAX_CH = 20, ZG_COL_MAX_TEXT_CH = 14, ZG_COL_PAD_CH = 1;
function zgLabelCh(label) {
return Math.ceil(String(label || '').length * 1.12);
}
function zgColPrefCh(col, seenCh) {
const label = zgLabelCh(col && col.label);
const cap = Math.max(label + ZG_COL_PAD_CH,
(col && col.user) ? ZG_COL_MAX_TEXT_CH : ZG_COL_MAX_CH);
return Math.min(cap,
Math.max(ZG_COL_MIN_CH, label, Number(seenCh) || 0) + ZG_COL_PAD_CH);
}
function zgFitCols(o) {
const n = o.prefs.slice();
const gaps = Math.max(0, n.length - 1) * o.gapPx;
const floors = o.cols.map((c, i) => Math.min(n[i],
Math.max(ZG_COL_MIN_CH, zgLabelCh(c && c.label),
(Number(o.colCh[c.id]) || 0))));
const total = () => n.reduce((a, b) => a + b, 0) * o.chPx + gaps;
let guard = 4000;
while (total() > o.roomPx && guard-- > 0) {
let big = -1;
for (let i = 0; i < n.length; i++) {
if (n[i] <= floors[i]) continue;
if (big === -1 || n[i] > n[big]) big = i;
}
if (big === -1) break;
n[big] = Math.max(floors[big], n[big] - 0.5);
}
return { widths: n, clipped: total() > o.roomPx + 0.5 };
}
const ZG_CRC_TABLE = (() => {
const t = new Int32Array(256);
for (let n = 0; n < 256; n++) {
let c = n;
for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
t[n] = c;
}
return t;
})();
function zgCrc32(bytes) {
let c = 0 ^ (-1);
for (let i = 0; i < bytes.length; i++) {
c = (c >>> 8) ^ ZG_CRC_TABLE[(c ^ bytes[i]) & 0xFF];
}
return (c ^ (-1)) >>> 0;
}
function zgUtf8(str) {
const out = [];
for (let i = 0; i < str.length; i++) {
let c = str.charCodeAt(i);
if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
const d = str.charCodeAt(i + 1);
if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i++; }
}
if (c < 0x80) out.push(c);
else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
}
return out;
}
function zgZip(entries) {
const out = [];
const central = [];
const u16 = (v) => [v & 0xFF, (v >> 8) & 0xFF];
const u32 = (v) => [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >>> 24) & 0xFF];
let offset = 0;
for (const e of entries) {
const name = zgUtf8(e.name);
const data = e.bytes;
const crc = zgCrc32(data);
const local = [].concat(
u32(0x04034B50), u16(20), u16(0x0800), u16(0),
u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
u16(name.length), u16(0), name);
central.push([].concat(
u32(0x02014B50), u16(20), u16(20), u16(0x0800), u16(0),
u16(0), u16(0), u32(crc), u32(data.length), u32(data.length),
u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0),
u32(offset), name));
for (const b of local) out.push(b);
for (let i = 0; i < data.length; i++) out.push(data[i]);
offset += local.length + data.length;
}
const cdStart = offset;
let cdLen = 0;
for (const c of central) { for (const b of c) out.push(b); cdLen += c.length; }
const end = [].concat(u32(0x06054B50), u16(0), u16(0),
u16(central.length), u16(central.length), u32(cdLen), u32(cdStart), u16(0));
for (const b of end) out.push(b);
return new Uint8Array(out);
}
function zgRoundWords(n) {
const w = Math.max(0, Math.round(Number(n) || 0));
if (w < 100) return w;
if (w < 1500) return Math.round(w / 100) * 100;
if (w < 10000) return Math.round(w / 500) * 500;
return Math.round(w / 1000) * 1000;
}
function zgNarrowDecide(state, w, lim, now) {
if (!w) return { act: 'skip' };
const want = (state.isNarrow === true) ? (w < lim + 24) : (w < lim);
if (want === state.isNarrow) return { act: 'skip', want: want };
if (now - state.flipWindow > 1000) { state.flipWindow = now; state.flips = 0; }
if (++state.flips > ZG_NARROW_FLIPS) {
return { act: 'stop', want: want, width: w, limit: lim };
}
state.isNarrow = want;
return { act: 'flip', want: want };
}
function zgPassStorm(state, now) {
state.marks.push(now);
while (state.marks.length && now - state.marks[0] > ZG_STORM_MS) state.marks.shift();
return state.marks.length > ZG_STORM_PASSES;
}
function zgPassState() { return { marks: [] }; }
function zgSoon(fn) {
try { return window.setTimeout(fn, 0); }
catch (_) { try { return setTimeout(fn, 0); } catch (_e) { fn(); return 0; } }
}
const ZG_STORM_MS = 3000;
const ZG_STORM_PASSES = 150;
const ZG_GUARD_SEEN = new Set();
let ZG_GUARD_TOLD = false;
let ZG_GUARD_TELL = null;
function zgGuardTell(fn) { ZG_GUARD_TELL = fn; }
function zgGuardReset() { ZG_GUARD_SEEN.clear(); ZG_GUARD_TOLD = false; }
function zgGuardSeen() { return Array.from(ZG_GUARD_SEEN); }
function zgGuardReport(where, err) {
const first = !ZG_GUARD_SEEN.has(where);
if (first) {
ZG_GUARD_SEEN.add(where);
try {
console.error('Word-Smith: ' + where
+ ' threw and was contained; the rest of it did not run.', err);
} catch (_) { zgCatch('zgGuardReport: console.error(\'Word-Smith: \' + where', _); }
}
if (!ZG_GUARD_TOLD && ZG_GUARD_TELL) {
ZG_GUARD_TOLD = true;
try { ZG_GUARD_TELL(where, err); } catch (_) { zgCatch('zgGuardReport: ZG_GUARD_TELL(where, err);', _); }
}
return first;
}
function zgKindOf(v) {
if (v === null) return 'null';
if (Array.isArray(v)) return 'array';
return typeof v;
}
function zgRepairSettings(settings, defaults) {
const repaired = [];
for (const k of Object.keys(defaults)) {
const want = zgKindOf(defaults[k]);
if (want === 'null' || want === 'undefined') continue;
let bad = zgKindOf(settings[k]) !== want;
if (!bad && want === 'number' && !isFinite(settings[k])) bad = true;
if (!bad) continue;
const d = defaults[k];
settings[k] = (want === 'array' || want === 'object') ? JSON.parse(JSON.stringify(d)) : d;
repaired.push(k);
}
return repaired;
}
function zgSnippetOf(text) {
return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function zgPlainLine(line) {
return String(line || '')
.replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '')
.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
.replace(/\[\[([^\]|]*)\|?([^\]]*)\]\]/g, (m, a, b) => b || a)
.replace(/[*_~`]+/g, '')
.replace(/\s+/g, ' ').trim();
}
function zgLineOfSnippet(md, snippet) {
const want = zgSnippetOf(snippet);
if (!want) return -1;
const head = want.slice(0, 24);
const lines = String(md || '').split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
const plain = zgPlainLine(lines[i]);
if (!plain) continue;
if (plain === want || plain.indexOf(head) === 0) return i;
}
return -1;
}
const ZG_CATCH_SEEN = new Map();
function zgCatch(where, err) {
const rec = ZG_CATCH_SEEN.get(where);
const msg = String((err && err.message) || err || '');
if (rec) { rec.n++; rec.last = msg; return false; }
ZG_CATCH_SEEN.set(where, { n: 1, last: msg });
try { console.warn('Word-Smith: ' + where + ' threw and was contained: ' + msg); } catch (_) { }
return true;
}
function zgCatchSeen() {
return Array.from(ZG_CATCH_SEEN, ([where, r]) => ({ where, n: r.n, last: r.last }));
}
function zgCatchReset() { ZG_CATCH_SEEN.clear(); }
function zgCtxScope(ctx) {
try {
const s = ctx && ctx.scope;
return String((typeof s === 'function' ? s() : s) || '');
} catch (_) { return ''; }
}
function zgGuard(fn, where) {
if (typeof fn !== 'function') return fn;
return function (...args) {
try {
const out = fn.apply(this, args);
if (out && typeof out.then === 'function') {
return out.then(null, (err) => { zgGuardReport(where, err); });
}
return out;
} catch (err) {
zgGuardReport(where, err);
return undefined;
}
};
}
const ZG_NARROW_FLIPS = 8;
function zgNarrowState() { return { isNarrow: null, flips: 0, flipWindow: 0 }; }
const ZG_SESSION_KEYS = ['historyView', 'historySeries', 'historyCalMetric'];
const ZG_TAB_KEYS = {
menu: ['menuDock', 'menuHidden', 'menuJoined', 'menuOrder', 'menuRuleStyles'],
retrobar: ['barBottomGap', 'barPresets', 'barRuleDarkBottomColor', 'barRuleDarkTopColor', 'barRuleLightBottomColor', 'barRuleLightTopColor', 'enableRetroStatus', 'fileTokenFormat', 'flagTokenFormat', 'fontTokenFormat', 'markersTokenFormat', 'powerlineColor1', 'powerlineColor2', 'powerlineColor3', 'powerlineColor4', 'powerlineColor5', 'powerlineColor6', 'powerlineColor7', 'powerlineColorLight1', 'powerlineColorLight2', 'powerlineColorLight3', 'powerlineColorLight4', 'powerlineColorLight5', 'powerlineColorLight6', 'powerlineColorLight7', 'powerlineModeColors', 'statusBarBorderBottom', 'statusBarBorderStyle', 'statusBarBorderTop', 'statusBarBorderWidth', 'statusBarFontFollowNote', 'statusBarFontSize', 'statusBarHeight', 'statusBarPadBottom', 'statusBarPadTop', 'statusRows', 'vimColorCommand', 'vimColorCommandLight', 'vimColorInsert', 'vimColorInsertLight', 'vimColorNormal', 'vimColorNormalLight', 'vimColorReplace', 'vimColorReplaceLight', 'vimColorVisual', 'vimColorVisualLight', 'vimFollowCursorSmith', 'vimLabelCommand', 'vimLabelInsert', 'vimLabelNormal', 'vimLabelReplace', 'vimLabelVisual'],
theme: ['barTheme', 'barThemeBorderless', 'barThemeCheckbox', 'barThemeCode', 'barThemeCursor', 'barThemeEnabled', 'barThemeHeadings', 'barThemeHidden', 'barThemeMarkdown', 'barThemeOrder', 'barThemeSimplified', 'barThemeVim'],
zen: ['barPeekMs', 'caretMarginPx', 'focusedFileMode', 'fullscreen', 'hideInlineTitle', 'hideLinkedMentions', 'hideProperties', 'hideRibbon', 'hideScrollBar', 'hideStatusBar', 'zenEnabled', 'zenEscExits', 'zenHideBar', 'zenTitlebarMatch'],
letterbox: ['arrowCount', 'arrowDarkColor', 'arrowLightColor', 'arrowLineEnds', 'arrowScale', 'arrowStyle', 'enableLetterbox', 'letterboxCustomColors', 'letterboxPx', 'lineDarkColor', 'lineLightColor', 'maskMatchText', 'maskMatchTextPadded', 'separatorStyle', 'separatorWeight'],
typewriter: ['dimFocusMode', 'dimOpacity', 'dimUnfocusedEnabled', 'enableTypewriter', 'highlightCurrentLine', 'lineHighlightDarkColor', 'lineHighlightLightColor', 'lineHighlightOpacity', 'typewriterAnchor'],
hemingway: ['hemBlockArrows', 'hemBlockBackspace', 'hemBlockCut', 'hemBlockDelete', 'hemBlockJumpKeys', 'hemBlockMouse', 'hemBlockPaste', 'hemBlockSelectAll', 'hemBlockUndo', 'hemFlashTarget', 'hemingwayEnabled'],
syntax: ['posAdjective', 'posAdjectiveColor', 'posAdverb', 'posAdverbColor', 'posConjunction', 'posConjunctionColor', 'posDimOthers', 'posEnabled', 'posNoun', 'posNounColor', 'posVerb', 'posVerbColor', 'syntaxSkipCode', 'syntaxStyle'],
checks: ['checkDialogue', 'checkDialogueColor', 'checkDimOthers', 'checkFiller', 'checkFillerColor', 'checkFillerSoft', 'checkIllusion', 'checkIllusionColor', 'checkMisused', 'checkMisusedColor', 'checkPassive', 'checkPassiveColor', 'checkPronoun', 'checkPronounColor', 'checkRepetition', 'checkRepetitionColor', 'checkRhythm', 'checkRhythmHardColor', 'checkRhythmHardGrade', 'checkRhythmVeryHardColor', 'checkRhythmVeryHardGrade', 'checkStyle', 'checksEnabled', 'repetitionMinLength', 'repetitionWindow'],
text: ['editorPaddingH', 'enableParagraphIndent', 'justifyText', 'limitLineLength', 'lineSpacing', 'maxLineChars', 'miscEnabled', 'paragraphIndentEm', 'paragraphIndentMode', 'paragraphNumbers'],
markers: ['markBlankLines', 'markEndOfLines', 'markParagraphs', 'markSpaces', 'markTabs', 'markersEnabled'],
typography: ['typoApostrophe', 'typoArrows', 'typoCloseDouble', 'typoCloseSingle', 'typoComparisons', 'typoCustomQuotes', 'typoDashes', 'typoEllipsis', 'typoFractions', 'typoGuillemets', 'typoOpenDouble', 'typoOpenSingle', 'typoSmartQuotes', 'typographyEnabled'],
history: ['countExclude', 'historyPerFile', 'historyTracking'],
organizer: ['flagCount', 'flags', 'orgFolderIcons', 'orgTargetShow'],
filetree: ['enableFileTreeCounts', 'enableOutlineCounts', 'fileTreeFlags', 'fileTreeFolderIcons', 'fileTreeGoals', 'fileTreeTasks', 'treeOrder'],
misc: ['quickCycle', 'quickCycleCloseOnLeave', 'quickExplorer', 'quickOutline', 'settingsMirror', 'vimSoftWrapMotion'],
};
function zgSessionNew() {
return {
tab: null,
cursor: null,
lens: null,
panel: null,
scroll: 0,
flow: false,
flowZoom: 1,
flowScroll: 0,
folder: null,
treeShown: false,
zoom: 1
};
}
function zgSessionLens(lens, colIds, colKeys) {
if (!lens || typeof lens !== 'object') return null;
const ids = new Set(colIds || []);
const keys = new Set((colKeys || []).map(k => String(k).toLowerCase()));
const chips = (Array.isArray(lens.chips) ? lens.chips : []).filter(c => {
if (!c || typeof c !== 'object') return false;
if (c.axis) return true;
if (c.key === undefined || c.key === null) return false;
return keys.has(String(c.key).toLowerCase());
});
const sort = (lens.sort && lens.sort.id !== undefined && ids.has(lens.sort.id))
? lens.sort : null;
if (!sort && !chips.length) return null;
return { sort: sort, chips: chips };
}
function zgForDisk(settings) {
const out = Object.assign({}, settings || {});
for (const k of ZG_SESSION_KEYS) delete out[k];
return out;
}
function zgFormatHasPages(id) {
return id === 'docx' || id === 'pdf' || id === 'html';
}
function zgHeadSizeEm(o, n) {
const half = Math.round(((o && o.pt) || 12) * 2);
if (!(half > 0)) return 1;
return (half + (n <= 2 ? 4 : 2)) / half;
}
function zgTitleDropLines(o) {
const paper = zgPaperOf(o);
const textTw = Math.max(0, paper.h - 2 * paper.mar);
const lineTw = zgLineTwips(o) || 480;
const lines = Math.floor(textTw / lineTw);
let block = 1;
if (o.author) block += 1;
if (o.wordCount != null && o.wordCountOnTitle !== false) block += 2;
return Math.max(0, Math.round((lines - block) / 2));
}
function zgTitleWords(o) {
const n = (o && o.wordCount) || 0;
if (o && o.roundWordCount === false) return n.toLocaleString() + ' words';
return 'about ' + zgRoundWords(n).toLocaleString() + ' words';
}
function zgAnchorId(title, i) {
const base = String(title || 'section').toLowerCase()
.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
return 'ws_' + (base || 'section') + '_' + (i + 1);
}
function zgXml(str) {
return String(str == null ? '' : str)
.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
.replace(/"/g, '&quot;');
}
const ZG_PAPERS = [
{ id: 'letter', label: 'US Letter \u2014 8.5 \u00d7 11 in', w: 12240, h: 15840, mar: 1440 },
{ id: 'a4', label: 'A4 \u2014 210 \u00d7 297 mm', w: 11906, h: 16838, mar: 1440 },
{ id: 'legal', label: 'US Legal \u2014 8.5 \u00d7 14 in', w: 12240, h: 20160, mar: 1440 },
{ id: 'executive', label: 'Executive \u2014 7.25 \u00d7 10.5 in', w: 10440, h: 15120, mar: 1080 },
{ id: 'b5', label: 'B5 \u2014 176 \u00d7 250 mm', w: 9979, h: 14173, mar: 1080 },
{ id: 'a5', label: 'A5 \u2014 148 \u00d7 210 mm', w: 8391, h: 11906, mar: 1080 },
{ id: 'trade', label: 'Trade paperback \u2014 6 \u00d7 9 in', w: 8640, h: 12960, mar: 1080 },
{ id: 'digest', label: 'Digest \u2014 5.5 \u00d7 8.5 in', w: 7920, h: 12240, mar: 1080 },
{ id: 'pocket', label: 'Mass market \u2014 4.25 \u00d7 6.87 in', w: 6120, h: 9893, mar: 720 }
];
function zgPaperMicrons(paper) {
const mic = (twips) => Math.round(twips * 25400 / 1440);
const inch = (twips) => twips / 1440;
return {
width: mic(paper.w), height: mic(paper.h),
margin: inch(paper.mar)
};
}
function zgPaperOf(o) {
const oo = o || {};
const id = oo.paperId || (oo.a4 ? 'a4' : 'letter');
for (const p of ZG_PAPERS) if (p.id === id) return p;
return ZG_PAPERS[0];
}
function zgTwipIn(tw) {
return (Math.round((tw / 1440) * 100) / 100) + 'in';
}
const ZG_SAFE_FONTS = ['Times New Roman', 'Garamond', 'Georgia', 'Cambria',
'Courier Prime', 'Calibri', 'Arial'];
const ZG_FONT_CANDIDATES = [
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
function zgUniqueFonts(names) {
const seen = new Set();
const out = [];
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
function zgFontMeasureCtx() {
try {
const c = document.createElement('canvas');
return (c && c.getContext) ? c.getContext('2d') : null;
} catch (_) { return null; }
}
function zgProbeInstalledFonts(candidates, ctx) {
const c = ctx || zgFontMeasureCtx();
if (!c || typeof c.measureText !== 'function') return [];
const BASE = ['monospace', 'serif', 'sans-serif'];
const TXT = 'mmmmmmmmmmlliWWWW@0Oo';
const base = {};
for (const b of BASE) {
try {
c.font = '72px ' + b;
base[b] = c.measureText(TXT).width;
} catch (_) { return []; }
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
} catch (_) { w = 0; }
if (w && Math.abs(w - base[b]) > 0.5) { out.push(name); break; }
}
}
return out;
}
function zgFontMatches(q, all, limit) {
const list = all || [];
const lim = limit || 40;
const query = String(q == null ? '' : q).trim().toLowerCase();
if (!query) return list.slice(0, lim);
const starts = [], holds = [];
for (const name of list) {
const hay = String(name).toLowerCase();
const at = hay.indexOf(query);
if (at === 0) starts.push(name);
else if (at > 0) holds.push(name);
}
return starts.concat(holds).slice(0, lim);
}
function zgLineTwips(o) {
const oo = o || {};
if (oo.lineSpacing === 'single') return 240;
if (oo.lineSpacing === 'onehalf') return 360;
if (oo.lineSpacing === 'double') return 480;
return oo.doubleSpaced === false ? 240 : 480;
}
function zgJoinMark(o) {
const oo = o || {};
return oo.divider == null ? '#' : oo.divider;
}
function zgInlineRuns(text, opts) {
const o = opts || {};
let t = String(text == null ? '' : text);
if (o.smartQuotes) {
t = t.replace(/(\w)'(\w)/g, '$1\u2019$2')
.replace(/(^|[\s(\[{\u201c])'/g, '$1\u2018')
.replace(/'/g, '\u2019')
.replace(/(^|[\s(\[{\u2018])"/g, '$1\u201c')
.replace(/"/g, '\u201d');
}
t = t.replace(/!\[\[([^\]]*)\]\]/g, (m, p1) => o.dropImages ? '' : '[Image: ' + p1.split('|')[0] + ']');
t = t.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (m, alt, src) =>
o.dropImages ? '' : '[Image: ' + (alt || src) + ']');
t = t.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2');
t = t.replace(/\[\[([^\]]*)\]\]/g, '$1');
t = t.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1');
t = t.replace(/`([^`]*)`/g, '$1');
t = t.replace(/<[^>]+>/g, '');
if (!o.keepComments) t = t.replace(/%%[\s\S]*?%%/g, '');
if (o.footnotes === false) t = t.replace(/\[\^[^\]]*\]/g, '');
const runs = [];
const re = /(\*\*\*|\*\*|\*|==)/g;
let bold = false, ital = false, high = false, last = 0, m;
const push = (text) => { if (text) runs.push({ text, bold, ital, high: high && !!o.highlights }); };
while ((m = re.exec(t)) !== null) {
if (m.index > last) push(t.slice(last, m.index));
if (m[1] === '***') { bold = !bold; ital = !ital; }
else if (m[1] === '**') bold = !bold;
else if (m[1] === '==') high = !high;
else ital = !ital;
last = re.lastIndex;
}
if (last < t.length) push(t.slice(last));
return runs.filter(r => r.text.length);
}
function zgPara(runs, style, opts) {
const o = opts || {};
const pr = [];
if (style) pr.push('<w:pStyle w:val="' + style + '"/>');
if (o.pageBreakBefore) pr.push('<w:pageBreakBefore/>');
if (o.align) pr.push('<w:jc w:val="' + o.align + '"/>');
if (o.noIndent) pr.push('<w:ind w:firstLine="0"/>');
const body = (runs.length ? runs : [{ text: '' }]).map((r) => {
const rpr = [];
if (r.bold) rpr.push('<w:b/>');
if (r.ital) rpr.push('<w:i/>');
if (r.sup) rpr.push('<w:vertAlign w:val="superscript"/>');
if (r.mono) rpr.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
if (r.high) rpr.push('<w:highlight w:val="yellow"/>');
return '<w:r>' + (rpr.length ? '<w:rPr>' + rpr.join('') + '</w:rPr>' : '')
+ '<w:t xml:space="preserve">' + zgXml(r.text) + '</w:t></w:r>';
}).join('');
return '<w:p>' + (pr.length ? '<w:pPr>' + pr.join('') + '</w:pPr>' : '') + body + '</w:p>';
}
function zgTable(rows) {
const width = Math.max.apply(null, rows.map(r => r.length));
const grid = '<w:tblGrid>' + new Array(width).fill('<w:gridCol w:w="' + Math.floor(9360 / width) + '"/>').join('') + '</w:tblGrid>';
const body = rows.map((cells, ri) => '<w:tr>' + new Array(width).fill(0).map((_, ci) => {
const runs = zgInlineRuns(cells[ci] == null ? '' : cells[ci]);
if (ri === 0) runs.forEach(r => { r.bold = true; });
return '<w:tc><w:tcPr><w:tcW w:w="' + Math.floor(9360 / width) + '" w:type="dxa"/></w:tcPr>'
+ zgPara(runs, 'WsTableCell') + '</w:tc>';
}).join('') + '</w:tr>').join('');
return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>'
+ '<w:tblW w:w="0" w:type="auto"/>'
+ '<w:tblBorders>'
+ ['top','left','bottom','right','insideH','insideV']
.map(k => '<w:' + k + ' w:val="single" w:sz="4" w:color="auto"/>').join('')
+ '</w:tblBorders></w:tblPr>' + grid + body + '</w:tbl>';
}
function zgBlocksFromMarkdown(md, opts) {
const o = opts || {};
const lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
const out = [];
const notes = [];
let i = 0;
let firstPara = true;
if (lines.length && /^---\s*$/.test(lines[0])) {
let j = 1;
while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
if (o.keepFrontmatter) {
for (let k = 0; k <= Math.min(j, lines.length - 1); k++) {
out.push(zgPara([{ text: lines[k], mono: true }], 'WsCode', { noIndent: true }));
}
}
i = j + 1;
}
for (; i < lines.length; i++) {
const line = lines[i];
const t = line.trim();
if (!t) continue;
const fn = t.match(/^\[\^([^\]]+)\]:\s*(.*)$/);
if (fn) { if (o.footnotes !== false) notes.push({ id: fn[1], text: fn[2] }); continue; }
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
if (b.trim()) out.push(zgPara(zgInlineRuns(b.trim(), o), 'WsQuote', { noIndent: true }));
}
firstPara = true;
}
continue;
}
const fence = t.match(/^(`{3,}|~{3,})/);
if (fence) {
const ch = fence[1].charAt(0);
const buf = [];
for (i++; i < lines.length; i++) {
const ft = lines[i].trim();
if (ft.charAt(0) === ch && new RegExp('^' + ch + '{3,}').test(ft)) break;
buf.push(lines[i]);
}
for (const b of buf) out.push(zgPara([{ text: b, mono: true }], 'WsCode', { noIndent: true }));
continue;
}
if (/^\|/.test(t) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1].trim())) {
const cellsOf = (row) => {
const t2 = row.trim().replace(/^\||\|$/g, '');
const out2 = [];
let cur = '';
for (let k = 0; k < t2.length; k++) {
const ch = t2.charAt(k);
if (ch === '\\' && t2.charAt(k + 1) === '|') { cur += '|'; k++; continue; }
if (ch === '|') { out2.push(cur.trim()); cur = ''; continue; }
cur += ch;
}
out2.push(cur.trim());
return out2;
};
const rows = [cellsOf(t)];
i += 2;
for (; i < lines.length && /^\|/.test(lines[i].trim()); i++) rows.push(cellsOf(lines[i]));
i--;
out.push(zgTable(rows));
firstPara = true;
continue;
}
if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
out.push(zgPara([{ text: zgJoinMark(o) }], 'WsDivider',
{ align: 'center', noIndent: true }));
firstPara = true;
continue;
}
const head = t.match(/^(#{1,6})\s+(.*)$/);
if (head) {
if (o.keepHeadings === false) { firstPara = true; continue; }
out.push(zgPara(zgInlineRuns(head[2], o), 'WsHeading' + head[1].length,
{ noIndent: true }));
firstPara = true;
continue;
}
const quote = t.match(/^>\s?(.*)$/);
if (quote) {
out.push(zgPara(zgInlineRuns(quote[1], o), 'WsQuote', { noIndent: true }));
continue;
}
const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
if (li) {
const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, '    ').length / 2));
const mark = /^\d/.test(li[2]) ? li[2] + ' ' : '\u2022 ';
out.push(zgPara(zgInlineRuns(mark + li[3], o), 'WsList' + depth, { noIndent: true }));
continue;
}
const runs = [];
for (const r of zgInlineRuns(t, o)) {
const parts = String(r.text).split(/\[\^([^\]]+)\]/);
for (let k = 0; k < parts.length; k++) {
if (!parts[k]) continue;
if (k % 2) runs.push({ text: parts[k], sup: true });
else runs.push(Object.assign({}, r, { text: parts[k] }));
}
}
out.push(zgPara(runs, 'WsBody', { noIndent: firstPara === false ? false : true }));
firstPara = false;
}
return { blocks: out, notes };
}
function zgStylesXml(opt) {
const o = opt || {};
const font = o.font || 'Times New Roman';
const half = Math.round((o.pt || 12) * 2);
const line = zgLineTwips(o);
const ind = o.indent === false ? 0 : 720;
const gap = o.indent === false ? 120 : 0;
const widow = '<w:widowControl/>';
const st = (id, name, extra, rpr) =>
'<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/>'
+ '<w:pPr>' + extra + '</w:pPr>'
+ '<w:rPr>' + (rpr || '') + '</w:rPr></w:style>';
const spacing = '<w:spacing w:line="' + line + '" w:lineRule="auto" w:after="0"/>'
+ (o.justify ? '<w:jc w:val="both"/>' : '');
const bodySpacing = widow
+ '<w:spacing w:line="' + line + '" w:lineRule="auto" w:after="' + gap + '"/>'
+ (o.justify ? '<w:jc w:val="both"/>' : '');
return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+ '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
+ '<w:docDefaults><w:rPrDefault><w:rPr>'
+ '<w:rFonts w:ascii="' + zgXml(font) + '" w:hAnsi="' + zgXml(font) + '"/>'
+ '<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>'
+ '</w:rPr></w:rPrDefault>'
+ '<w:pPrDefault><w:pPr>' + widow + spacing + '</w:pPr></w:pPrDefault></w:docDefaults>'
+ st('WsBody', 'Body', bodySpacing + '<w:ind w:firstLine="' + ind + '"/>')
+ st('WsDivider', 'Scene divider', spacing + '<w:jc w:val="center"/>')
+ st('WsQuote', 'Quote', spacing + '<w:ind w:left="720" w:right="720"/>', '<w:i/>')
+ st('WsCode', 'Code', '<w:spacing w:line="240" w:lineRule="auto" w:after="0"/><w:ind w:left="360"/>',
'<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>')
+ st('WsTableCell', 'Table cell', '<w:spacing w:line="240" w:lineRule="auto" w:after="0"/>')
+ st('WsList0', 'List', spacing + '<w:ind w:left="360"/>')
+ st('WsList1', 'List 2', spacing + '<w:ind w:left="720"/>')
+ st('WsList2', 'List 3', spacing + '<w:ind w:left="1080"/>')
+ st('WsList3', 'List 4', spacing + '<w:ind w:left="1440"/>')
+ st('WsTitle', 'Title', spacing + '<w:jc w:val="center"/>')
+ [1,2,3,4,5,6].map(n => st('WsHeading' + n, 'heading ' + n,
spacing + '<w:keepNext/><w:outlineLvl w:val="' + (n - 1) + '"/>'
+ '<w:jc w:val="' + (n <= 2 ? 'center' : 'left') + '"/>'
+ '<w:spacing w:before="240" w:line="' + line + '" w:lineRule="auto"/>',
'<w:b/><w:sz w:val="' + Math.round(zgHeadSizeEm(o, n) * half) + '"/>')).join('')
+ '</w:styles>';
}
function zgHeaderXml(text, withPage) {
return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+ '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
+ '<w:p><w:pPr><w:jc w:val="right"/><w:ind w:firstLine="0"/></w:pPr>'
+ '<w:r><w:t xml:space="preserve">' + zgXml(text) + ' </w:t></w:r>'
+ (withPage === false ? ''
: '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>')
+ '</w:p></w:hdr>';
}
function zgBuildDocx(sections, opt) {
const o = opt || {};
const body = [];
const allNotes = [];
let folderOpenedPage = false;
if (o.titlePage) {
const t = o.title || 'Untitled';
body.push(zgPara([{ text: t, bold: true }], 'WsTitle', { noIndent: true, align: 'center' }));
if (o.author) body.push(zgPara([{ text: 'by ' + o.author }], 'WsTitle', { noIndent: true, align: 'center' }));
if (o.wordCount != null && o.wordCountOnTitle !== false) {
body.push(zgPara([{ text: zgTitleWords(o) }],
'WsTitle', { noIndent: true, align: 'center' }));
}
{
const tp = zgPaperOf(o);
body.push('<w:p><w:pPr><w:sectPr>'
+ '<w:pgSz w:w="' + tp.w + '" w:h="' + tp.h + '"/>'
+ '<w:pgMar w:top="' + tp.mar + '" w:right="' + tp.mar + '"'
+ ' w:bottom="' + tp.mar + '" w:left="' + tp.mar + '"'
+ ' w:header="720" w:footer="720" w:gutter="0"/>'
+ '<w:vAlign w:val="center"/>'
+ '</w:sectPr></w:pPr></w:p>');
}
if (sections.length) sections = sections.slice();
}
if (o.toc && sections.length > 1) {
body.push(zgPara([{ text: 'Contents', bold: true }], 'WsHeading2',
{ noIndent: true, pageBreakBefore: !!o.titlePage }));
body.push('<w:p><w:pPr><w:pStyle w:val="WsBody"/><w:ind w:firstLine="0"/></w:pPr>'
+ '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
+ '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-'
+ zgDeepestLevel(o, sections) + '" \\h \\z \\u </w:instrText></w:r>'
+ '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
+ '<w:r><w:t xml:space="preserve">Right-click here and choose '
+ 'Update Field to build the contents.</w:t></w:r>'
+ '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>');
}
sections.forEach((sec, idx) => {
if (sec.folder) {
const lv = Math.min(6, sec.depth || 1);
if (o.toc) {
body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="'
+ zgAnchorId(sec.title, idx) + '"/>');
}
const fbrk = (idx > 0 || o.toc) && o.pageBreaks !== false;
folderOpenedPage = fbrk;
body.push(zgPara([{ text: sec.title, bold: true }], 'WsHeading' + lv,
{ noIndent: true, pageBreakBefore: fbrk }));
if (o.toc) body.push('<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
return;
}
const first = idx === 0 && !o.titlePage;
const justAfterFolder = folderOpenedPage;
folderOpenedPage = false;
if (o.starBetween && idx > 0) {
body.push(zgPara([{ text: zgJoinMark(o) }], 'WsDivider',
{ align: 'center', noIndent: true }));
}
if (o.sectionTitles && sec.title) {
if (o.toc) {
const id = zgAnchorId(sec.title, idx);
body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="' + id + '"/>');
}
body.push(zgPara([{ text: sec.title, bold: true }],
'WsHeading' + zgFileHeadLevel(o, sec),
{ noIndent: true,
pageBreakBefore: o.pageBreaks !== false && !first && !justAfterFolder }));
if (o.toc) body.push('<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
} else if (o.toc) {
const id = zgAnchorId(sec.title, idx);
body.push('<w:bookmarkStart w:id="' + (idx + 100) + '" w:name="' + id + '"/>'
+ '<w:bookmarkEnd w:id="' + (idx + 100) + '"/>');
if (o.pageBreaks && !first) body.push(zgPara([], 'WsBody', { pageBreakBefore: true }));
} else if (o.pageBreaks && !first) {
body.push(zgPara([], 'WsBody', { pageBreakBefore: true }));
} else if (o.titlePage && idx === 0) {
body.push(zgPara([], 'WsBody', { pageBreakBefore: true }));
}
const built = zgBlocksFromMarkdown(
o.folderHeadings ? zgDemoteHeadings(sec.markdown, sec.depth || 0)
: sec.markdown, o);
for (const b of built.blocks) body.push(b);
for (const n of built.notes) allNotes.push(n);
});
if (allNotes.length) {
body.push(zgPara([{ text: 'Notes', bold: true }], 'WsHeading2',
{ noIndent: true, pageBreakBefore: true }));
for (const n of allNotes) {
body.push(zgPara([{ text: n.id + '. ', bold: true }].concat(zgInlineRuns(n.text, o)),
'WsBody', { noIndent: true }));
}
}
const wantFirst = false;
const paper = zgPaperOf(o);
const wantToc = !!(o.toc && sections.length > 1);
const headerRef = o.runningHeader
? '<w:headerReference w:type="default" r:id="rId3"/>'
+ (wantFirst ? '<w:headerReference w:type="first" r:id="rId4"/><w:titlePg/>' : '')
: '';
const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+ '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
+ ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
+ '<w:body>' + body.join('')
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
+ '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
+ '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
+ (o.runningHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '')
+ (wantFirst ? '<Override PartName="/word/header2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : '')
+ (wantToc ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : '')
+ '</Types>';
const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
+ '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
+ '</Relationships>';
const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+ '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
+ '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
+ (o.runningHeader ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>' : '')
+ (wantFirst ? '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>' : '')
+ (wantToc ? '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' : '')
+ '</Relationships>';
const settingsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
+ '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
+ '<w:updateFields w:val="true"/></w:settings>';
const entries = [
{ name: '[Content_Types].xml', bytes: zgUtf8(types) },
{ name: '_rels/.rels', bytes: zgUtf8(rootRels) },
{ name: 'word/document.xml', bytes: zgUtf8(doc) },
{ name: 'word/_rels/document.xml.rels', bytes: zgUtf8(docRels) },
{ name: 'word/styles.xml', bytes: zgUtf8(zgStylesXml(o)) }
];
if (wantToc) entries.push({ name: 'word/settings.xml', bytes: zgUtf8(settingsXml) });
if (o.runningHeader) {
entries.push({ name: 'word/header1.xml',
bytes: zgUtf8(zgHeaderXml(o.runningHeader, o.pageNumbers !== false)) });
}
if (wantFirst) {
entries.push({ name: 'word/header2.xml', bytes: zgUtf8(zgHeaderXml('', false)) });
}
return zgZip(entries);
}
const READ_WPM = 238;
const BAR_SECTION_GAP = 12;
const FIT_SLACK = 4;
const FIT_RESTORE_MARGIN = 24;
const FIT_CLASS_DECORATION = 0;
const FIT_CLASS_ORNAMENT = 1;
const FIT_CLASS_AMBIENT = 1.5;
const FIT_CLASS_READING = 2;
const FIT_CLASS_IDENTITY = 3;
const PL_BG_COUNT = 7;
const PL_TEXT_COUNT = PL_BG_COUNT;
const BAR_THEMES = [
{
id: 'modus', name: 'Modus',
names: { dark: 'Modus Vivendi', light: 'Modus Operandi' },
note: 'Protesilaos Stavrou \u2014 his own published palette',
dark: { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
c1: '#2f447f', c2: '#1e1e1e', c3: '#000000', c4: '#00422a',
c5: '#4a4000', c6: '#552f5f', c7: '#620f2a',
t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#00bcff',
sel: '#5a5a5a', bar: '#505050', cur: '#ffffff' },
light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
c1: '#c0deff', c2: '#f2f2f2', c3: '#ffffff', c4: '#b3fabf',
c5: '#fff576', c6: '#ffddff', c7: '#ffcfbf',
t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#0031a9',
sel: '#bdbdbd', bar: '#c8c8c8', cur: '#000000' }
},
{
id: 'quiet', name: 'Quiet',
note: 'vim\u2019s own quiet \u2014 monochrome by design, three colours allowed',
dark: { b1: '#000000', b2: '#1c1c1c', b3: '#303030', b4: '#585858',
c1: '#a8a8a8', c2: '#1c1c1c', c3: '#000000', c4: '#303030',
c5: '#3a3a3a', c6: '#444444', c7: '#4e4e4e',
t1: '#dadada', t2: '#000000', t3: '#a8a8a8', t4: '#dadada',
sel: '#ffaf00', bar: '#dadada' },
light: { b1: '#d7d7d7', b2: '#cccccc', b3: '#e4e4e4', b4: '#a8a8a8',
c1: '#9e9e9e', c2: '#cccccc', c3: '#d7d7d7', c4: '#c8c8c8',
c5: '#bcbcbc', c6: '#b4b4b4', c7: '#a8a8a8',
t1: '#000000', t2: '#d7d7d7', t3: '#626262', t4: '#000000',
sel: '#ffaf00', bar: '#000000' }
},
{
id: 'habamax', name: 'Habamax',
note: 'Vim\u2019s habamax \u2014 muted, warm-neutral',
dark: { b1: '#1c1c1c', b2: '#262626',
b3: '#303030', b4: '#3a3a3a',
c1: '#004f71', c2: '#303030', c3: '#1c1c1c', c4: '#005454',
c5: '#634500', c6: '#484867', c7: '#870000',
t1: '#bcbcbc', t2: '#1c1c1c', t3: '#808080', t4: '#87afaf', sel: '#454545', bar: '#9e9e9e' },
light: { b1: '#ffffff', b2: '#f0f0f0',
b3: '#e4e4e4', b4: '#d0d0d0',
c1: '#cfe4f0', c2: '#e4e4e4', c3: '#f2f2f2', c4: '#d0ecdc',
c5: '#f0e2c0', c6: '#ddd8f0', c7: '#f4d0d0',
t1: '#262626', t2: '#ffffff', t3: '#626262', t4: '#005f87', sel: '#c6c6c6' }
},
{
id: 'nord', name: 'Nord',
note: 'Arctic Ice Studio \u2014 polar night and snow storm',
dark: { b1: '#2e3440', b2: '#3b4252',
b3: '#434c5e', b4: '#4c566a',
c1: '#4c6a91', c2: '#3b4252', c3: '#2e3440', c4: '#3f6650',
c5: '#7a5f34', c6: '#6b5470', c7: '#8f4148',
t1: '#eceff4', t2: '#2e3440', t3: '#9aa4b6', t4: '#88c0d0', sel: '#434c5e', bar: '#4c566a' },
light: { b1: '#eceff4', b2: '#e5e9f0',
b3: '#d8dee9', b4: '#c8d0dc',
c1: '#c5d4e8', c2: '#d8dee9', c3: '#eceff4', c4: '#cfe0c8',
c5: '#f0e2bd', c6: '#e2d3e5', c7: '#f0cdd0',
t1: '#2e3440', t2: '#eceff4', t3: '#5c6779', t4: '#5e81ac', sel: '#d8dee9', bar: '#d8dee9' }
},
{
id: 'dracula', name: 'Dracula',
note: 'Zeno Rocha\u2019s Dracula, with Alucard for the light half',
dark: { b1: '#282a36', b2: '#343746',
b3: '#44475a', b4: '#565a72',
c1: '#4a3f7a', c2: '#44475a', c3: '#282a36', c4: '#2f6b46',
c5: '#7a6a2a', c6: '#6b3f6b', c7: '#8b3a3a',
t1: '#f8f8f2', t2: '#282a36', t3: '#a0a3b8', t4: '#bd93f9', sel: '#44475a', bar: '#44475a' },
light: { b1: '#f8f8f2', b2: '#eeeef0',
b3: '#e0e0e6', b4: '#cfcfd8',
c1: '#d9d0f5', c2: '#e8e8e2', c3: '#f8f8f2', c4: '#cdeed8',
c5: '#f2eec4', c6: '#f5d5e8', c7: '#f7cfcf',
t1: '#1f1f1f', t2: '#f8f8f2', t3: '#6c6c6c', t4: '#644ac9', sel: '#d8d0e8' }
},
{
id: 'gruvbox', name: 'Gruvbox',
note: 'Pavel Pertsev \u2014 retro groove, hard contrast',
dark: { b1: '#282828', b2: '#32302f',
b3: '#3c3836', b4: '#504945',
c1: '#376769', c2: '#504945', c3: '#282828', c4: '#65610c',
c5: '#825700', c6: '#8f3f71', c7: '#9d0006',
t1: '#ebdbb2', t2: '#282828', t3: '#a89984', t4: '#83a598', sel: '#504945', bar: '#504945' },
light: { b1: '#fbf1c7', b2: '#f2e5bc',
b3: '#ebdbb2', b4: '#d5c4a1',
c1: '#cfe0dd', c2: '#ebdbb2', c3: '#fbf1c7', c4: '#d5e6c0',
c5: '#f2e0b0', c6: '#ecd5e4', c7: '#f5d2c8',
t1: '#3c3836', t2: '#fbf1c7', t3: '#7c6f64', t4: '#076678', sel: '#d5c4a1', bar: '#d5c4a1' }
},
{
id: 'solarized', name: 'Solarized',
note: 'Ethan Schoonover \u2014 the light and dark halves are his own pairing',
dark: { b1: '#002b36', b2: '#073642',
b3: '#0a4653', b4: '#125666',
c1: '#196ba3', c2: '#073642', c3: '#002b36', c4: '#5a6a00',
c5: '#7a5c00', c6: '#94275e', c7: '#99231f',
t1: '#eee8d5', t2: '#002b36', t3: '#93a1a1', t4: '#2aa198', sel: '#073642', bar: '#839496' },
light: { b1: '#fdf6e3', b2: '#f5eed6',
b3: '#eee8d5', b4: '#ded8c5',
c1: '#cfe2f0', c2: '#eee8d5', c3: '#fdf6e3', c4: '#dfe8c0',
c5: '#f2e4bb', c6: '#f5d3e2', c7: '#f7d2cf',
t1: '#073642', t2: '#fdf6e3', t3: '#657b83', t4: '#268bd2', sel: '#eee8d5', bar: '#073642' }
},
{
id: 'catppuccin', name: 'Catppuccin',
note: 'the Catppuccin community \u2014 Mocha dark, Latte light',
dark: { b1: '#1e1e2e', b2: '#181825',
b3: '#313244', b4: '#45475a',
c1: '#3e5a8f', c2: '#313244', c3: '#1e1e2e', c4: '#39654d',
c5: '#795433', c6: '#6b4a8f', c7: '#8f3f55',
t1: '#cdd6f4', t2: '#1e1e2e', t3: '#9399b2', t4: '#89b4fa', sel: '#585b70', bar: '#181825' },
light: { b1: '#eff1f5', b2: '#e6e9ef',
b3: '#dce0e8', b4: '#ccd0da',
c1: '#cfdcf7', c2: '#dce0e8', c3: '#eff1f5', c4: '#d3ecd0',
c5: '#f5ddc8', c6: '#e6d5f7', c7: '#f7d3dc',
t1: '#4c4f69', t2: '#eff1f5', t3: '#6c6f85', t4: '#1e66f5', sel: '#ccd0da', bar: '#e6e9ef' }
},
{
id: 'tokyonight', name: 'Tokyo Night / Day',
names: { dark: 'Tokyo Night', light: 'Tokyo Day' },
note: 'enkia \u2014 Night when your mode is dark, Day when it is light',
dark: { b1: '#1a1b26', b2: '#16161e',
b3: '#24283b', b4: '#2f334d',
c1: '#385295', c2: '#292e42', c3: '#1a1b26', c4: '#3e5d37',
c5: '#6a5128', c6: '#5a4380', c7: '#8a3a4a',
t1: '#c0caf5', t2: '#1a1b26', t3: '#787c99', t4: '#7aa2f7', sel: '#33467c', bar: '#16161e' },
light: { b1: '#e1e2e7', b2: '#d5d6db',
b3: '#c8c9ce', b4: '#b6b7bd',
c1: '#ccd6f5', c2: '#d8dae5', c3: '#e9e9ec', c4: '#d3e8c8',
c5: '#f2e2c0', c6: '#e0d5f5', c7: '#f5d0d8',
t1: '#33374c', t2: '#e9e9ec', t3: '#5a6699', t4: '#2e7de9', sel: '#b7c1e3', bar: '#cfd5e3' }
},
{
id: 'rosepine', name: 'Ros\u00e9 Pine',
note: 'the Ros\u00e9 Pine team \u2014 Moon dark, Dawn light',
dark: { b1: '#232136', b2: '#2a273f',
b3: '#393552', b4: '#44415a',
c1: '#2d6a85', c2: '#2a273f', c3: '#232136', c4: '#3a5f54',
c5: '#795c32', c6: '#5f4580', c7: '#8a4155',
t1: '#e0def4', t2: '#232136', t3: '#908caa', t4: '#9ccfd8', sel: '#403d52', bar: '#393552' },
light: { b1: '#faf4ed', b2: '#fffaf3',
b3: '#f2e9e1', b4: '#e4dcd4',
c1: '#cfe2ea', c2: '#f2e9e1', c3: '#faf4ed', c4: '#d5e8dd',
c5: '#f5e2c2', c6: '#e5d8f0', c7: '#f7d5dd',
t1: '#575279', t2: '#faf4ed', t3: '#797593', t4: '#286983', sel: '#dfdad9', bar: '#f2e9e1' }
},
{
id: 'modus-tinted', name: 'Modus Tinted',
names: { dark: 'Modus Vivendi Tinted', light: 'Modus Operandi Tinted' },
note: 'the tinted pair \u2014 warm paper by day, deep indigo night',
dark: { b1: '#0d0e1c', b2: '#1d2235', b3: '#2b3045', b4: '#61647a',
c1: '#483d8a', c2: '#1d2235', c3: '#0d0e1c', c4: '#00422a',
c5: '#4a4000', c6: '#552f5f', c7: '#620f2a',
t1: '#ffffff', t2: '#0d0e1c', t3: '#989898', t4: '#b6a0ff',
sel: '#555a66', bar: '#484d67', cur: '#ff66ff' },
light: { b1: '#fbf7f0', b2: '#efe9dd', b3: '#dfd5cf', b4: '#9f9690',
c1: '#595959', c2: '#efe9dd', c3: '#fbf7f0', c4: '#b3fabf',
c5: '#fff576', c6: '#ffddff', c7: '#ffcfbf',
t1: '#000000', t2: '#fbf7f0', t3: '#595959', t4: '#a0132f',
sel: '#c2bcb5', bar: '#cab9b2', cur: '#d00000' }
},
{
id: 'modus-deuteranopia', name: 'Modus Deuteranopia',
names: { dark: 'Modus Vivendi Deuteranopia', light: 'Modus Operandi Deuteranopia' },
note: 'red\u2013green\u2013safe: it adds in blue and removes in yellow',
dark: { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
c1: '#2f447f', c2: '#1e1e1e', c3: '#000000', c4: '#003066',
c5: '#4a4000', c6: '#552f5f', c7: '#3d3d00',
t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#79a8ff',
sel: '#5a5a5a', bar: '#2a2a6a', cur: '#efef00' },
light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
c1: '#c0deff', c2: '#f2f2f2', c3: '#ffffff', c4: '#d5d7ff',
c5: '#fff576', c6: '#ffddff', c7: '#f4f099',
t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#3548cf',
sel: '#bdbdbd', bar: '#d0d6ff', cur: '#0000ff' }
},
{
id: 'modus-tritanopia', name: 'Modus Tritanopia',
names: { dark: 'Modus Vivendi Tritanopia', light: 'Modus Operandi Tritanopia' },
note: 'blue\u2013yellow\u2013safe: it adds in cyan and removes in red',
dark: { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
c1: '#004253', c2: '#1e1e1e', c3: '#000000', c4: '#004254',
c5: '#4a4000', c6: '#552f5f', c7: '#4f1119',
t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#00d3d0',
sel: '#5a5a5a', bar: '#003c52', cur: '#ff5f5f' },
light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
c1: '#afdfef', c2: '#f2f2f2', c3: '#ffffff', c4: '#b5e7ff',
c5: '#fff576', c6: '#ffddff', c7: '#ffd8d5',
t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#005e8b',
sel: '#bdbdbd', bar: '#afe0f2', cur: '#d00000' }
},
{
id: 'monokai', name: 'Monokai',
note: 'Wimer Hazenberg \u2014 the classic; light half is our adaptation',
dark: { b1: '#272822', b2: '#3e3d32', b3: '#49483e', b4: '#75715e',
c1: '#66d9ef', c2: '#3e3d32', c3: '#272822', c4: '#375a2e',
c5: '#7a5a1e', c6: '#6f5c9c', c7: '#8f2f3f',
t1: '#f8f8f2', t2: '#272822', t3: '#a59f85', t4: '#a6e22e', sel: '#49483e', bar: '#49483e' },
light: { b1: '#fafafa', b2: '#f0f0ee', b3: '#e6e6e2', b4: '#d0d0c8',
c1: '#cdeef5', c2: '#f0f0ee', c3: '#fafafa', c4: '#dcedc8',
c5: '#fde3b3', c6: '#e6dcf5', c7: '#f8ccd4',
t1: '#272822', t2: '#fafafa', t3: '#75715e', t4: '#f92672', sel: '#d8d8d0' }
},
{
id: 'onedark', name: 'One Dark / Light',
names: { dark: 'One Dark', light: 'One Light' },
note: 'Atom\u2019s pair \u2014 One Dark when dark, One Light when light',
dark: { b1: '#282c34', b2: '#2c313a', b3: '#333842', b4: '#3e4451',
c1: '#61afef', c2: '#2c313a', c3: '#282c34', c4: '#3e6845',
c5: '#7a5c26', c6: '#7e5f9e', c7: '#8f3a44',
t1: '#abb2bf', t2: '#282c34', t3: '#7f848e', t4: '#61afef', sel: '#3e4451', bar: '#2c323c' },
light: { b1: '#fafafa', b2: '#f0f0f1', b3: '#e5e5e6', b4: '#d3d3d4',
c1: '#cfe5fb', c2: '#f0f0f1', c3: '#fafafa', c4: '#d6e9cc',
c5: '#f5e3bd', c6: '#e6d9f2', c7: '#f6d0d4',
t1: '#383a42', t2: '#fafafa', t3: '#696c77', t4: '#4078f2', sel: '#d0d4da', bar: '#e5e5e6' }
},
{
id: 'nightfox', name: 'Nightfox / Dayfox',
names: { dark: 'Nightfox', light: 'Dayfox' },
note: 'EdenEast \u2014 Nightfox when dark, Dayfox when light',
dark: { b1: '#192330', b2: '#212e3f', b3: '#29394f', b4: '#39506d',
c1: '#2e4372', c2: '#212e3f', c3: '#192330', c4: '#2b4a3c',
c5: '#574a27', c6: '#4a3a63', c7: '#5c2f39',
t1: '#cdcecf', t2: '#192330', t3: '#738091', t4: '#86abdc', sel: '#2b3b51', bar: '#131a24' },
light: { b1: '#f6f2ee', b2: '#efe9e3', b3: '#e7e0d9', b4: '#d6cfc7',
c1: '#ccd7ee', c2: '#efe9e3', c3: '#f6f2ee', c4: '#cfe0ce',
c5: '#ecdcb8', c6: '#ded2ec', c7: '#f0cdd2',
t1: '#352c24', t2: '#f6f2ee', t3: '#766f68', t4: '#2848a9', sel: '#e2d9cd', bar: '#e4dcd4' }
},
{
id: 'kanagawa', name: 'Kanagawa',
names: { dark: 'Kanagawa Wave', light: 'Kanagawa Lotus' },
note: 'rebelot \u2014 Wave by night, Lotus by day',
dark: { b1: '#1f1f28', b2: '#2a2a37', b3: '#363646', b4: '#54546d',
c1: '#2d4f67', c2: '#2a2a37', c3: '#1f1f28', c4: '#33473d',
c5: '#5a4a2d', c6: '#453a62', c7: '#692f36',
t1: '#dcd7ba', t2: '#1f1f28', t3: '#727169', t4: '#7e9cd8', sel: '#2d4f67', bar: '#16161d' },
light: { b1: '#f2ecbc', b2: '#eae3ae', b3: '#e0d7a0', b4: '#b8b092',
c1: '#cbd8e6', c2: '#eae3ae', c3: '#f2ecbc', c4: '#d2dcae',
c5: '#ecd39a', c6: '#d8cadf', c7: '#ecc2c5',
t1: '#545464', t2: '#f2ecbc', t3: '#716e61', t4: '#4d699b', sel: '#c9d5de', bar: '#dcd5ac' }
},
{
id: 'github', name: 'GitHub',
note: 'Primer \u2014 the dark and light you read pull requests in',
dark: { b1: '#0d1117', b2: '#161b22', b3: '#21262d', b4: '#30363d',
c1: '#1c3b63', c2: '#161b22', c3: '#0d1117', c4: '#1f4529',
c5: '#544000', c6: '#3c2d69', c7: '#67232b',
t1: '#e6edf3', t2: '#0d1117', t3: '#8b949e', t4: '#4493f8', sel: '#264f78' },
light: { b1: '#ffffff', b2: '#f6f8fa', b3: '#eaeef2', b4: '#d0d7de',
c1: '#cfe4fb', c2: '#f6f8fa', c3: '#ffffff', c4: '#c9edd0',
c5: '#f3e29c', c6: '#e3d3f5', c7: '#f8cfcf',
t1: '#1f2328', t2: '#ffffff', t3: '#656d76', t4: '#0969da', sel: '#b6d9f8' }
},
{
id: 'everforest', name: 'Everforest',
note: 'sainnhe \u2014 the forest floor, by night and by day',
dark: { b1: '#2d353b', b2: '#343f44', b3: '#3d484d', b4: '#475258',
c1: '#384b55', c2: '#343f44', c3: '#2d353b', c4: '#425047',
c5: '#514d44', c6: '#4a3f55', c7: '#563a3f',
t1: '#d3c6aa', t2: '#2d353b', t3: '#859289', t4: '#a7c080', sel: '#543a48', bar: '#343f44' },
light: { b1: '#fdf6e3', b2: '#f4f0d9', b3: '#efebd4', b4: '#d8d3ba',
c1: '#d6e5dc', c2: '#f4f0d9', c3: '#fdf6e3', c4: '#d1e0c2',
c5: '#eee0b2', c6: '#e2d8e4', c7: '#f2d5d0',
t1: '#5c6a72', t2: '#fdf6e3', t3: '#7a877e', t4: '#6c8a00', sel: '#f0f1d2', bar: '#f2efdf' }
},
{
id: 'vimblue', name: 'Vim Blue / Darkblue',
names: { dark: 'Vim Darkblue', light: 'Vim Blue' },
note: ':colorscheme blue by day, darkblue by night \u2014 both as Vim ships them',
dark: { b1: '#000040', b2: '#000058', b3: '#10106e', b4: '#30309a',
c1: '#2a2a9e', c2: '#000058', c3: '#000040', c4: '#0f6b45',
c5: '#6b6b10', c6: '#4b2d9e', c7: '#8b1a3a',
t1: '#c0c0c0', t2: '#000040', t3: '#8080c0', t4: '#ffff60',
sel: '#2e3f9e', bar: '#00afaf' },
light: { b1: '#000087', b2: '#1c1c99', b3: '#2e2eab', b4: '#5555c4',
c1: '#2222dd', c2: '#1c1c99', c3: '#000087', c4: '#0f6b52',
c5: '#6b6b00', c6: '#4b2d9e', c7: '#8b1a3a',
t1: '#ffffff', t2: '#000087', t3: '#87afd7', t4: '#ffff00',
sel: '#2222dd', bar: '#00afaf' }
},
{
id: 'flexoki', name: 'Flexoki',
note: 'Steph Ango \u2014 an inky palette for prose, both halves his',
dark: { b1: '#100f0f', b2: '#1c1b1a', b3: '#282726', b4: '#343331',
c1: '#21344f', c2: '#1c1b1a', c3: '#100f0f', c4: '#2b3a1e',
c5: '#4a3a12', c6: '#362c52', c7: '#4d2220',
t1: '#cecdc3', t2: '#100f0f', t3: '#878580', t4: '#4385be', sel: '#282726', bar: '#403e3c' },
light: { b1: '#fffcf0', b2: '#f2f0e5', b3: '#e6e4d9', b4: '#dad8ce',
c1: '#d3e3f7', c2: '#f2f0e5', c3: '#fffcf0', c4: '#dbe6c4',
c5: '#f2e2b0', c6: '#e2d6f0', c7: '#f6d2cd',
t1: '#100f0f', t2: '#fffcf0', t3: '#6f6e69', t4: '#205ea6', sel: '#e6e4d9', bar: '#cecdc3' }
},
{
id: 'selenized', name: 'Selenized',
note: 'Jan Warcho\u0142 \u2014 Solarized rebuilt, both halves tuned together',
dark: { b1: '#103c48', b2: '#184956', b3: '#1c5460', b4: '#2d5b69',
c1: '#17455a', c2: '#184956', c3: '#103c48', c4: '#1c4a35',
c5: '#4a4520', c6: '#3f3560', c7: '#5c2330',
t1: '#cad8d9', t2: '#103c48', t3: '#adbcbc', t4: '#4695f7', sel: '#184956', bar: '#adbcbc' },
light: { b1: '#fbf3db', b2: '#ece3cc', b3: '#e0d7bf', b4: '#c3bba4',
c1: '#cddef2', c2: '#ece3cc', c3: '#fbf3db', c4: '#d7e6c4',
c5: '#f0e0a8', c6: '#ecd4e6', c7: '#f8cfc9',
t1: '#3a4d53', t2: '#fbf3db', t3: '#53676d', t4: '#0072d4', sel: '#e0d7bf', bar: '#53676d' }
},
{
id: 'iceberg', name: 'Iceberg',
note: 'cocopon \u2014 a bluish, low-glare pair from Vim',
dark: { b1: '#161821', b2: '#1e2132', b3: '#272c42', b4: '#3d425b',
c1: '#2a3a5c', c2: '#1e2132', c3: '#161821', c4: '#2c4030',
c5: '#4a3a24', c6: '#3a3352', c7: '#4d2833',
t1: '#c6c8d1', t2: '#161821', t3: '#6b7089', t4: '#84a0c6', sel: '#272c42', bar: '#818596' },
light: { b1: '#e8e9ec', b2: '#dcdfe7', b3: '#cad0de', b4: '#a7adba',
c1: '#c3d0e8', c2: '#dcdfe7', c3: '#e8e9ec', c4: '#cfe0c0',
c5: '#f0dcc0', c6: '#ded4ee', c7: '#f2ccd6',
t1: '#33374c', t2: '#e8e9ec', t3: '#7b8296', t4: '#2d539e', sel: '#cad0de' }
},
{
id: 'papercolor', name: 'PaperColor',
note: 'NLKNguyen \u2014 Material-ish, and light-first by design',
dark: { b1: '#1c1c1c', b2: '#262626', b3: '#303030', b4: '#444444',
c1: '#1f3a4a', c2: '#262626', c3: '#1c1c1c', c4: '#2b3a1a',
c5: '#4a4400', c6: '#3a2a4a', c7: '#4a1010',
t1: '#d0d0d0', t2: '#1c1c1c', t3: '#8a8a8a', t4: '#5fafd7', sel: '#303030', bar: '#5f8787' },
light: { b1: '#eeeeee', b2: '#e4e4e4', b3: '#d0d0d0', b4: '#bcbcbc',
c1: '#c6e2ee', c2: '#e4e4e4', c3: '#eeeeee', c4: '#cde8c0',
c5: '#f0e4b0', c6: '#e2d0ee', c7: '#f4cccc',
t1: '#444444', t2: '#eeeeee', t3: '#767676', t4: '#0087af', sel: '#d0d0d0', bar: '#005f87' }
},
{
id: 'ayu', name: 'Ayu',
note: 'ayu \u2014 warm accents on cool ground; light accent deepened by us',
dark: { b1: '#0b0e14', b2: '#131721', b3: '#1b1f2b', b4: '#2d3542',
c1: '#1e3a52', c2: '#131721', c3: '#0b0e14', c4: '#1c3a26',
c5: '#4a3c14', c6: '#33294a', c7: '#4a1f24',
t1: '#bfbdb6', t2: '#0b0e14', t3: '#6c7380', t4: '#e6b450', sel: '#253a5e', bar: '#14191f' },
light: { b1: '#fcfcfc', b2: '#f3f4f5', b3: '#e7e8e9', b4: '#d3d4d5',
c1: '#cfe3f7', c2: '#f3f4f5', c3: '#fcfcfc', c4: '#d6e8c6',
c5: '#f7e3b0', c6: '#e4d8f2', c7: '#f8d0cc',
t1: '#5c6166', t2: '#fcfcfc', t3: '#8a8f98', t4: '#d1650a', sel: '#e7e8e9',
bar: '#f8f9fa' }
},
];
const PL_DIVIDERS = { '>': 'arrow', '<': 'arrow', '|': 'straight',
')': 'round', '(': 'round', '~': 'wave', '/': 'angleF', '\\': 'angleB' };
const PL_DIR = { '<': 'left', '>': 'right', '(': 'left', ')': 'right' };
const ZG_OBSIDIAN_PATH = 'M172.7 461.6c73.6-149.1 2.1-217-43.7-246.9'
+ 'm72 96.7c71.6-17.3 141-16.3 189.8 88.5m-114-96.3c-69.6-174 44.6-181'
+ ' 16.3-273.6m97.7 370c1.6-3 3.3-5.8 5.1-8.6 20-29.9 34.2-53.2'
+ ' 41.4-65.3a16 16 0 0 0-1.2-17.7 342.1 342.1 0 0 1-40.2-66.1c-10.9-26'
+ '-12.5-66.5-12.6-86.2 0-7.4-2.4-14.7-7-20.6l-81.8-104a32 32 0 0'
+ ' 0-1.4-1.5m97.7 370a172.8 172.8 0 0 0-18 59c-2.9 21.5-24 38.4-45'
+ ' 32.6-30-8.3-64.5-21.1-95.7-23.5l-47.8-3.6c-7.7-.6-15-4-20.3-9.5'
+ 'l-82.3-84.8c-9-9.2-11.4-23-6.2-34.8 0 0 51-111.8 52.8-117.7l.7-3'
+ 'M293.1 30a31.5 31.5 0 0 0-44.4-2.3l-97.4 87.5c-5.4 5-9 11.5-10'
+ ' 18.8-3.7 24.5-9.7 68-12.3 80.7';
const zgObsidianSvg = (px) => '<svg class="svg-icon zg-obsidian-mark" '
+ 'viewBox="0 0 512 512" width="' + px + '" height="' + px + '" '
+ 'fill="none" stroke="currentColor" '
+ 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
+ '<path d="' + ZG_OBSIDIAN_PATH + '"/></svg>';
const ZG_EXPORT_FOLDER_HEADINGS_DEFAULT = false;
function zgExportRoot(paths, scope) {
const list = (paths || []).filter(Boolean).map(String);
if (!list.length) return '';
let acc = list[0].split('/').slice(0, -1);
for (const p of list) {
const bits = p.split('/').slice(0, -1);
let i = 0;
while (i < acc.length && i < bits.length && acc[i] === bits[i]) i++;
acc = acc.slice(0, i);
if (!acc.length) return '';
}
const root = acc.join('/');
if (root && scope && String(scope) === root) {
return acc.slice(0, -1).join('/');
}
return root;
}
function zgDemoteHeadings(md, by) {
const n = Math.max(0, Math.floor(Number(by) || 0));
if (!n) return String(md == null ? '' : md);
let fence = null;
return String(md == null ? '' : md).split('\n').map((line) => {
const f = /^\s*(```+|~~~+)/.exec(line);
if (f) {
if (!fence) fence = f[1][0];
else if (f[1][0] === fence) fence = null;
return line;
}
if (fence) return line;
const h = /^(#{1,6})(\s)/.exec(line);
if (!h) return line;
const want = Math.min(6, h[1].length + n);
return '#'.repeat(want) + line.slice(h[1].length);
}).join('\n');
}
function zgHostTint() {
try {
const v = getComputedStyle(document.body)
.getPropertyValue('--background-secondary');
if (v && v.trim()) return v.trim();
} catch (_) { zgCatch('zgHostTint: const v = getComputedStyle(document.body)', _); }
return '#ececec';
}
function zgFileHeadLevel(o, sec) {
if (!o || !o.folderHeadings) return 2;
return Math.min(6, ((sec && sec.depth) || 0) + 1);
}
function zgSecHeadLevel(o, sec) {
if (!o || !o.folderHeadings) return 2;
if (sec && sec.folder) return Math.min(6, sec.depth || 1);
return zgFileHeadLevel(o, sec);
}
function zgDeepestLevel(o, sections) {
let d = 1;
for (const sec of sections || []) d = Math.max(d, zgSecHeadLevel(o, sec));
return d;
}
function zgTocSteps(o, sections) {
let top = 6;
for (const sec of sections || []) top = Math.min(top, zgSecHeadLevel(o, sec));
return (sec) => Math.max(0, zgSecHeadLevel(o, sec) - top);
}
function zgTaskSay(done, all) {
if (!all) return '';
return '[' + done + '/' + all + ']';
}
function zgSortArrow(dir) {
return dir === 'desc' ? ' ↓' : ' ↑';
}
const ZG_STYLESHEET_VERSION = 523;
const ZG_INSTALLER_REFUSE = 1009;
const ZG_INSTALLER_REFUSE_TEXT = '1.9';
const ZG_INSTALLER_WARN = 1013;
const ZG_INSTALLER_WARN_TEXT = '1.13';
const WS_WRITE = Object.freeze({
goals: 'save the goals and the manuscript order',
mirror: 'write the settings mirror',
structure: 'save the manuscript structure',
prop: 'write that property',
stored: 'store that property',
rename: 'follow a rename in the export list',
forget: 'forget a deleted path in the export list',
move: 'follow the store to its new place',
settings: 'save your settings',
});
const ZG_PLUGIN_VERSION = '1.4.4';
const HISTORY_DEBOUNCE_MS = 2000;
const HISTORY_SAVE_MS = 30000;
const HISTORY_IDLE_MS = 8000;
const HISTORY_MAX_UNSAVED_MS = 120000;
const ZG_STATE_IDS = ['outline', 'draft', 'revise', 'blocked', 'done'];
let ZG_STATUSES = [
{ id: 'outline', label: 'Sketch' },
{ id: 'draft', label: 'Draft' },
{ id: 'revise', label: 'Revise' },
{ id: 'blocked', label: 'Blocked' },
{ id: 'done', label: 'Done' }
];
const ZG_FOLDER_COLOURS = [
{ id: '', label: 'Default', css: '' },
{ id: 'red', label: 'Red', css: 'var(--color-red, #c0503f)' },
{ id: 'orange', label: 'Orange', css: 'var(--color-orange, #c98a3c)' },
{ id: 'yellow', label: 'Yellow', css: 'var(--color-yellow, #c9a227)' },
{ id: 'green', label: 'Green', css: 'var(--color-green, #4f9a5c)' },
{ id: 'cyan', label: 'Cyan', css: 'var(--color-cyan, #3f9aa8)' },
{ id: 'blue', label: 'Blue', css: 'var(--color-blue, #4a7fc1)' },
{ id: 'purple', label: 'Purple', css: 'var(--color-purple, #8a63c9)' }
];
const ZG_FLAG_SHAPES = [
{ id: 'pennant', label: 'Pennant' },
{ id: 'hollow', label: 'Hollow pennant' },
{ id: 'swallow', label: 'Swallowtail' },
{ id: 'banner', label: 'Banner' },
{ id: 'alert', label: 'Alert triangle' },
{ id: 'dot', label: 'Dot' },
{ id: 'square', label: 'Square' },
{ id: 'check', label: 'Tick' },
{ id: 'bookmark', label: 'Bookmark' },
{ id: 'pause', label: 'Paused' }
];
const ZG_SHAPE_FOR = { outline: 'hollow', draft: 'pennant', revise: 'swallow',
blocked: 'alert', done: 'banner' };
function zgFlagShapeOf(id) {
for (const st of ZG_STATUSES) if (st.id === id) return st.shape || ZG_SHAPE_FOR[id] || 'pennant';
return ZG_SHAPE_FOR[id] || 'pennant';
}
const ZG_AXIS_PCT = 0.95;
const ZG_AXIS_MED_MULT = 3;
function zgQuantile(sorted, q) {
if (!sorted.length) return 0;
return sorted[Math.max(0, Math.min(sorted.length - 1,
Math.floor((sorted.length - 1) * q)))];
}
function zgAxisBound(values) {
const mags = [];
for (const v of (values || [])) {
const m = Math.abs(Number(v) || 0);
if (m > 0) mags.push(m);
}
if (!mags.length) return { bound: 0, clipped: [] };
mags.sort((a, b) => a - b);
const top = mags[mags.length - 1];
const want = Math.max(zgQuantile(mags, ZG_AXIS_PCT),
ZG_AXIS_MED_MULT * zgQuantile(mags, 0.5));
const bound = Math.max(1, Math.min(top, want));
return { bound: bound, clipped: mags.filter(m => m > bound) };
}
const ZG_HIST_LAB_GAP = 6;
function zgMenuSearchInto(parent) {
const wrap = parent.createDiv({ cls: 'zg-menu-searchwrap search-input-container' });
const inp = wrap.createEl('input', { cls: 'zg-menu-search' });
inp.type = 'search';
inp.placeholder = 'Search...';
return inp;
}
function zgFlagSvg(id, size) {
const px = size || 11;
const shape = zgFlagShapeOf(id);
const open = (body) => '<svg class="zg-flag is-' + id + '" viewBox="0 0 13 14" width="' + px
+ '" height="' + Math.round(px * 14 / 13) + '" aria-hidden="true">' + body + '</svg>';
const pole = '<path d="M2 1.5 L2 12.5" stroke="currentColor" stroke-width="1.6" '
+ 'stroke-linecap="round" fill="none"/>';
if (shape === 'pennant') return open(pole + '<path d="M2.8 2 L11.6 5.5 L2.8 9 Z" fill="currentColor"/>');
if (shape === 'hollow') {
return open(pole + '<path d="M2.8 2 L11.6 5.5 L2.8 9 Z" fill="none" stroke="currentColor" '
+ 'stroke-width="1.3" stroke-linejoin="round"/>');
}
if (shape === 'swallow') {
return open(pole + '<path d="M2.8 2 L11.6 2 L8.6 5.5 L11.6 9 L2.8 9 Z" fill="currentColor"/>');
}
if (shape === 'banner') return open(pole + '<path d="M2.8 2 L11.6 2 L11.6 9 L2.8 9 Z" fill="currentColor"/>');
if (shape === 'alert') {
return open('<path d="M6.5 1.6 L12.4 11.8 H0.6 Z" fill="currentColor"/>'
+ '<path d="M6.5 5 V8.4" stroke="var(--zg-flag-ink, #1b1b1b)" stroke-width="1.5" '
+ 'stroke-linecap="round"/>'
+ '<circle cx="6.5" cy="10.2" r="0.85" fill="var(--zg-flag-ink, #1b1b1b)"/>');
}
if (shape === 'dot') return open('<circle cx="6.5" cy="6.5" r="3.6" fill="currentColor"/>');
if (shape === 'square') return open('<rect x="3" y="3" width="7.2" height="7.2" rx="1.2" fill="currentColor"/>');
if (shape === 'check') {
return open('<path d="M2.4 7 L5.4 10 L11 3.6" fill="none" stroke="currentColor" '
+ 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
}
if (shape === 'bookmark') {
return open('<path d="M3.4 2 H10.2 A0.6 0.6 0 0 1 10.8 2.6 V12 L6.8 9.4 L2.8 12 V2.6 '
+ 'A0.6 0.6 0 0 1 3.4 2 Z" fill="currentColor"/>');
}
if (shape === 'pause') {
return open('<rect x="3.2" y="2.8" width="2.6" height="8.4" rx="0.8" fill="currentColor"/>'
+ '<rect x="7.6" y="2.8" width="2.6" height="8.4" rx="0.8" fill="currentColor"/>');
}
return open(pole + '<path d="M2.8 2 L11.6 5.5 L2.8 9 Z" fill="currentColor"/>');
}
function zgFolderSvg(open, size) {
const px = size || 12;
const body = open
? '<path d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5.4 L6.8 4.2 H10.5 '
+ 'A1 1 0 0 1 11.5 5.2 V5.8 H3.6 L1.5 11 Z" fill="currentColor"/>'
+ '<path d="M3.6 5.8 H13 L11 11 H1.5 Z" fill="currentColor" opacity="0.55"/>'
: '<path d="M1.5 3.5 A1 1 0 0 1 2.5 2.5 H5.4 L6.8 4.2 H11 '
+ 'A1 1 0 0 1 12 5.2 V10 A1 1 0 0 1 11 11 H2.5 '
+ 'A1 1 0 0 1 1.5 10 Z" fill="currentColor"/>';
return '<svg class="zg-folder' + (open ? ' is-open' : '') + '" viewBox="0 0 14 14" '
+ 'width="' + px + '" height="' + px + '" aria-hidden="true">' + body + '</svg>';
}
function zgManuscriptSvg(size) {
const px = size || 18;
return '<svg class="zg-mssort svg-icon" viewBox="0 0 24 24" '
+ 'width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" '
+ 'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" '
+ 'aria-hidden="true">'
+ '<path d="M4 6.5 H15"/>'
+ '<path d="M4 12 H11"/>'
+ '<path d="M4 17.5 H16.5"/>'
+ '<path d="M20 6.5 V17"/>'
+ '<path d="M17.6 14.6 L20 17.2 L22.4 14.6"/>'
+ '</svg>';
}
function zgStatusLabel(id) {
for (const st of ZG_STATUSES) if (st.id === id) return st.label;
return '';
}
function zgStatusNext(id) {
if (!ZG_STATUSES.length) return '';
const i = ZG_STATUSES.findIndex(st => st.id === id);
if (i === -1) return ZG_STATUSES[0].id;
return i + 1 < ZG_STATUSES.length ? ZG_STATUSES[i + 1].id : '';
}
const GOALS_MARK_START = '<!-- wordsmith:goals:start -->';
const GOALS_MARK_END = '<!-- wordsmith:goals:end -->';
const EXPORT_MARK_START = '<!-- wordsmith:export:start -->';
const EXPORT_MARK_END = '<!-- wordsmith:export:end -->';
const STRUCT_MARK_START = '<!-- wordsmith:structure:start -->';
const STRUCT_MARK_END = '<!-- wordsmith:structure:end -->';
const STRUCT_BASENAME = 'ws-structure.md';
const SETTINGS_MARK_START = '<!-- wordsmith:settings:start -->';
const SETTINGS_MARK_END = '<!-- wordsmith:settings:end -->';
const HISTORY_MARK_START = '<!-- wordsmith:history:start -->';
const HISTORY_MARK_END = '<!-- wordsmith:history:end -->';
const HISTORY_PX = 2;
const HISTORY_HEAT = 6;
const HISTORY_MAX_CELLS = 30000;
const MASK_MEASURE_RETRIES = 20;
const HISTORY_OVERLAB_PAD = 24;
const HISTORY_BAR_MAX = 34;
const HISTORY_CHART_W = 660;
const HISTORY_CHART_H = 184;
const HISTORY_DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HISTORY_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
'July', 'August', 'September', 'October', 'November', 'December'];
const BAR_DIRECTIVE_BG = {
b1: 'var(--background-primary)',
b2: 'var(--background-secondary, var(--background-primary))',
b3: 'var(--background-secondary-alt, var(--background-secondary, var(--background-primary)))',
b4: 'var(--background-tertiary, var(--background-primary-alt, var(--background-primary)))',
bs: 'var(--status-bar-background, var(--background-secondary, var(--background-primary)))',
};
const BAR_DIRECTIVE_TEXT = {
t1: 'var(--text-normal)',
t2: 'var(--text-muted, var(--text-normal))',
t3: 'var(--text-faint, var(--text-muted, var(--text-normal)))',
};
function readBarDirective(formatStr) {
let rest = String(formatStr == null ? '' : formatStr);
let bg = null, text = null, bgSlot = null, textSlot = null;
let bgTheme = null, textTheme = null;
for (;;) {
const m = /^\s*(?::(bs|bc|f|b\d+|vim|\d+)|;(t\d+|vim|bc|f|\d+))/i.exec(rest);
if (!m) break;
if (m[1] && bg === null && bgSlot === null) {
if (/^\d+$/.test(m[1])) bgSlot = parseInt(m[1], 10);
else if (/^(?:vim|bc|f)$/i.test(m[1])) bgSlot = m[1].toLowerCase();
else {
const k = m[1].toLowerCase();
bg = BAR_DIRECTIVE_BG[k] || null;
if (bg) bgTheme = k;
}
}
if (m[2] && text === null && textSlot === null) {
if (/^\d+$/.test(m[2])) textSlot = parseInt(m[2], 10);
else if (/^(?:vim|bc|f)$/i.test(m[2])) textSlot = m[2].toLowerCase();
else {
const k = m[2].toLowerCase();
text = BAR_DIRECTIVE_TEXT[k] || null;
if (text) textTheme = k;
}
}
rest = rest.slice(m[0].length);
}
return { bg, text, bgSlot, textSlot, bgTheme, textTheme, rest };
}
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
function mixColors(a, b, t) {
const ca = parseColorRGB(a), cb = parseColorRGB(b);
if (!ca && !cb) return 'transparent';
if (!ca) return String(b);
if (!cb) return String(a);
const m = i => Math.round(ca[i] + (cb[i] - ca[i]) * t);
return 'rgb(' + m(0) + ', ' + m(1) + ', ' + m(2) + ')';
}
function barMenuFuzzy(q, text) {
if (!q) return 0;
const t = text.toLowerCase();
let ti = 0, score = 0, streak = 0;
for (let qi = 0; qi < q.length; qi++) {
const c = q[qi];
let found = -1;
for (let i = ti; i < t.length; i++) {
if (t[i] === c) { found = i; break; }
}
if (found === -1) return -1;
const atWordStart = found === 0 || /[\s\/\-_(]/.test(t[found - 1]);
score += atWordStart ? 8 : 1;
streak = (found === ti && qi > 0) ? streak + 1 : 0;
score += streak * 4;
ti = found + 1;
}
return score - Math.min(t.length, 40) * 0.1;
}
function colorToHsl(str) {
const p = parseColorRGB(str);
if (!p) return null;
const r = p[0] / 255, g = p[1] / 255, b = p[2] / 255;
const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
const l = (mx + mn) / 2, d = mx - mn;
const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
let h = 0;
if (d !== 0) {
if (mx === r) h = ((g - b) / d) % 6;
else if (mx === g) h = (b - r) / d + 2;
else h = (r - g) / d + 4;
h *= 60; if (h < 0) h += 360;
}
return { h: h, s: sat, l: l };
}
function hslToHex(h, s, l) {
const c = (1 - Math.abs(2 * l - 1)) * s;
const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
const m = l - c / 2;
let r = 0, g = 0, b = 0;
if (h < 60) { r = c; g = x; }
else if (h < 120) { r = x; g = c; }
else if (h < 180) { g = c; b = x; }
else if (h < 240) { g = x; b = c; }
else if (h < 300) { r = x; b = c; }
else { r = c; b = x; }
const hx = (v) => ('0' + Math.round((v + m) * 255).toString(16)).slice(-2);
return '#' + hx(r) + hx(g) + hx(b);
}
const PL_SEP_ASPECT = 1.05;
const PL_THEME_BGS = {
b1: ['--background-primary'],
b2: ['--background-secondary', '--background-primary'],
b3: ['--background-secondary-alt', '--background-secondary', '--background-primary'],
b4: ['--background-tertiary', '--background-primary-alt', '--background-primary'],
bs: ['--status-bar-background', '--background-secondary', '--background-primary'],
bc: ['--caret-color', '--text-normal'],
};
const PL_THEME_INKS = {
t1: 'var(--text-normal)',
t2: 'var(--text-muted)',
t3: 'var(--text-faint)',
};
const BAR_THEME_INK_VARS = {
t1: ['--text-normal'],
t2: ['--text-muted', '--text-normal'],
t3: ['--text-faint', '--text-muted', '--text-normal'],
};
const OBSIDIAN_ICON_PATH = 'M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z';
const PL_SOFT = {
'::': 'zg-pl-soft',
'>>': 'zg-pl-soft zg-pl-chev-r',
'<<': 'zg-pl-soft zg-pl-chev-l'
};
const PL_SOFT_SPLIT = /(::|>>|<<)/;
const DEFAULT_SETTINGS = {
barThemeEnabled: true,
barTheme: 'custom',
barThemeOrder: [],
barThemeHidden: [],
menuOrder: [],
menuHidden: [],
menuAliases: {},
menuJoined: [],
menuRuleStyles: {},
menuDock: true,
orgTargetShow: 'ratio',
fileIconsOffOnce: false,
orgFolderIcons: true,
orgFileIcons: false,
barThemeHeadings: false,
barThemeCode: false,
barThemeSimplified: false,
barThemeCursor: false,
barThemeVim: false,
barThemeBorderless: false,
barThemeCheckbox: '',
barThemeGlassStash: null,
barThemeMarkdown: false,
pluginEnabled: true,
scopeMode: 'include',
scopePaths: [],
countExclude: null,
zenMode: true,
fullscreen: false,
leftSidebar: true,
rightSidebar: true,
hideProperties: true,
hideInlineTitle: true,
hideStatusBar: true,
hideLinkedMentions: true,
hideScrollBar: true,
hideRibbon: true,
zenHideBar: false,
barPeekMs: 2000,
caretMarginPx: 0,
zenEscExits: true,
vimPanelHeight: 23,
barBottomGap: 23,
focusedFileMode: false,
enableTypewriter: false,
editorPaddingH: 100,
zenEnabled: false,
zenTitlebarMatch: true,
enableLetterbox: false,
letterboxLines: 8,
letterboxPx: 95.81700000000001,
maskPaddingH: 194,
maskMatchText: false,
maskMatchTextPadded: true,
maskOverhang: 4,
arrowStyle: "solid-triangle",
arrowLineEnds: false,
customArrowTop: "^",
customArrowBottom: "v",
arrowCount: 5,
arrowScale: 0.7,
separatorStyle: "solid",
separatorWeight: 2,
highlightCurrentLine: false,
lineHighlightDarkColor: "#a8a8a4",
lineHighlightLightColor: "#707070",
lineHighlightOpacity: 0.15,
typewriterAnchor: 50,
dimUnfocusedEnabled: false,
dimFocusMode: 'paragraph',
dimOpacity: 0.55,
enableRetroStatus: true,
retroBarHidden: false,
statusBarRows: 1,
statusRows: [
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
fileTokenFormat: 'path',
flagTokenFormat: 'icon',
statusBarBorderStyle: 'none',
statusBarBorderWidth: 1,
statusBarBorderTop: true,
statusBarBorderBottom: false,
statusBarFontSize: 15,
statusBarFontFollowNote: true,
statusBarHeight: 16,
statusBarPadTop: 2,
statusBarPadBottom: 2,
powerlineEnabled: true,
powerlineModeColors: true,
powerlineSepWidth: 78,
powerlineColor1: "#4f9dde",
powerlineColor2: "#3f4550",
powerlineColor3: "#2f333c",
powerlineColor4: "#4caf7d",
powerlineColor5: "#307853",
powerlineColor6: "#8a7fd1",
powerlineColor7: "#cc141d",
powerlineText1: "#ffffff",
powerlineText2: "#16181d",
powerlineText3: "#9aa0a6",
powerlineText4: "#4f9dde",
powerlineColorLight1: "#2d6da4",
powerlineColorLight2: "#d9dce1",
powerlineColorLight3: "#eceef1",
powerlineColorLight4: "#2f8a5b",
powerlineColorLight5: "#b96f1e",
powerlineColorLight6: "#6a5cb8",
powerlineColorLight7: "#a2404f",
powerlineTextLight1: "#16181d",
powerlineTextLight2: "#f7f7f5",
powerlineTextLight3: "#5c636b",
powerlineTextLight4: "#2d6da4",
vimFollowCursorSmith: true,
vimColorNormal: "#4f9dde",
vimColorInsert: "#4caf7d",
vimColorVisual: "#8a7fd1",
vimColorReplace: "#c2544d",
vimColorCommand: "#e0913a",
vimColorNormalLight: "#2d6da4",
vimColorInsertLight: "#2f8a5b",
vimColorVisualLight: "#6a5cb8",
vimColorReplaceLight: "#a03c36",
vimColorCommandLight: "#b96f1e",
goalTarget: 200,
goalBaseline: 0,
goalsFile: true,
goalsPath: 'Word-Smith/ws-goals.md',
exportListPath: 'Word-Smith/ws-export.md',
structurePath: 'Word-Smith/ws-structure.md',
outlineFlagRenamed: false,
uniColOrder: [],
organizerFolder: '',
uniTypes: ['md', 'image', 'canvas', 'base', 'pdf', 'audio', 'video', 'other'],
historySeen: false,
settingsMirror: true,
settingsMirrorPath: 'Word-Smith/ws-settings.md',
fileGoals: {},
fileStatus: {},
goalLabelMode: 'fraction',
goalRingWeight: 16,
goalOrientation: 'vertical',
goalLenWriting: 30,
goalLenFile: 40,
goalLenFolder: 85,
retroCustomColors: false,
retroDarkBgColor: "#141010",
retroDarkTextColor: "#f2f2f2",
retroLightBgColor: "#e9e8e8",
retroLightTextColor: "#f7fb09",
barRuleDarkTopColor: "#fbfaf9",
barRuleDarkBottomColor: "#fbfaf9",
barRuleLightTopColor: "#16181d",
barRuleLightBottomColor: "#16181d",
fontTokenFormat: 'glyph',
markersTokenFormat: 'glyph',
letterboxCustomColors: false,
arrowDarkColor: "#fbfaf9",
arrowLightColor: "#080808",
lineDarkColor: "#faf8f5",
lineLightColor: "#030303",
miscEnabled: false,
enableParagraphIndent: false,
paragraphIndentEm: 4,
paragraphIndentMode: 'single',
lineSpacing: 1.5,
editorFont: '',
editorFontDefaultCleared: false,
limitLineLength: false,
maxLineChars: 64,
justifyText: true,
showHiddenMarkers: true,
paragraphNumbers: false,
markSpaces: false,
markersEnabled: false,
markTabs: false,
markParagraphs: false,
markEndOfLines: false,
markBlankLines: true,
hemingwayEnabled: false,
hemBlockBackspace: true,
hemBlockDelete: true,
hemBlockUndo: true,
hemBlockCut: true,
hemBlockPaste: true,
hemBlockArrows: false,
hemBlockJumpKeys: false,
hemBlockSelectAll: false,
hemBlockMouse: false,
hemFlashTarget: 'both',
syntaxSkipCode: true,
syntaxStyle: 'text',
checksEnabled: false,
checkStyle: 'squiggle',
checkFiller: true,
checkFillerSoft: false,
checkFillerColor: "#8a7fd1",
checkPassive: true,
checkPassiveColor: "#c2544d",
checkIllusion: true,
checkIllusionColor: "#d98cc4",
checkMisused: true,
checkMisusedColor: "#e0913a",
checkPronoun: true,
checkPronounColor: "#4f9dde",
checkDialogue: false,
checkDialogueColor: "#4f9dd9",
checkRhythm: false,
checkRhythmHardColor: "#d4a017",
checkRhythmVeryHardColor: "#c2544d",
checkRhythmHardGrade: 10,
checkRhythmVeryHardGrade: 14,
checkRepetition: true,
checkRepetitionColor: "#4caf7d",
repetitionWindow: 50,
repetitionMinLength: 5,
posEnabled: false,
posDimOthers: true,
checkDimOthers: false,
posNoun: false,
posNounColor: "#4f9dde",
posVerb: false,
posVerbColor: "#4caf7d",
posAdjective: false,
posAdjectiveColor: "#d98cc4",
posAdverb: false,
posAdverbColor: "#e0913a",
posConjunction: false,
posConjunctionColor: "#9aa0a6",
typographyEnabled: false,
typoSmartQuotes: true,
typoCustomQuotes: false,
typoOpenDouble: "\u201c",
typoCloseDouble: "\u201d",
typoOpenSingle: "\u2018",
typoCloseSingle: "\u2019",
typoApostrophe: "\u2019",
typoEllipsis: true,
typoDashes: true,
typoArrows: true,
typoComparisons: false,
typoGuillemets: false,
typoFractions: true,
quickExplorer: false,
quickOutline: false,
quickCycle: false,
quickCycleCloseOnLeave: false,
enableFileTreeCounts: false,
fileTreeFlags: false,
treeOrder: true,
treeOrderForcedOn: false,
fileTreeFolderIcons: false,
fileTreeKindIcons: false,
organizerRootShut: false,
organizerDateFormat: 'human',
folderColors: {},
flagCount: 5,
flags: [
{ id: 'outline', label: 'Sketch', shape: 'hollow', light: '#7b818c', dark: '#8a8f98' },
{ id: 'draft', label: 'Draft', shape: 'pennant', light: '#4b7bb5', dark: '#6f95c9' },
{ id: 'revise', label: 'Revise', shape: 'swallow', light: '#b8453c', dark: '#cf5b52' },
{ id: 'blocked', label: 'Blocked', shape: 'alert', light: '#c08a2a', dark: '#d9a441' },
{ id: 'done', label: 'Done', shape: 'banner', light: '#3f8a53', dark: '#5aa96c' }
],
fileTreeGoals: false,
fileTreeTasks: false,
enableOutlineCounts: false,
vimSoftWrapMotion: true,
vimLabelNormal: "NORMAL",
vimLabelInsert: "INSERT",
vimLabelVisual: "VISUAL",
vimLabelReplace: "REPLACE",
vimLabelCommand: "COMMAND",
barPresets: {},
barPresetsSeeded: false,
historyTracking: false,
historyView: 'day',
historyCalMetric: 'net',
historySeries: null,
historyFilePath: 'Word-Smith/ws-history.md',
historyPerFile: true,
historyBaselines: null,
};
const BAR_KEYS = [
'statusBarRows', 'statusRows', 'fileTokenFormat',
'powerlineEnabled', 'powerlineModeColors',
'powerlineColor1', 'powerlineColor2', 'powerlineColor3', 'powerlineColor4',
'powerlineColor5', 'powerlineColor6', 'powerlineColor7',
'powerlineText1', 'powerlineText2', 'powerlineText3', 'powerlineText4',
'statusBarBorderStyle', 'statusBarBorderWidth',
'statusBarBorderTop', 'statusBarBorderBottom',
'statusBarFontSize', 'statusBarHeight',
'statusBarPadTop', 'statusBarPadBottom',
'vimFollowCursorSmith',
'vimColorNormal', 'vimColorInsert', 'vimColorVisual',
'vimColorReplace', 'vimColorCommand',
'vimLabelNormal', 'vimLabelInsert', 'vimLabelVisual',
'vimLabelReplace', 'vimLabelCommand',
'retroCustomColors',
'retroDarkBgColor', 'retroDarkTextColor',
'retroLightBgColor', 'retroLightTextColor',
'powerlineColorLight1', 'powerlineColorLight2', 'powerlineColorLight3',
'powerlineColorLight4', 'powerlineColorLight5', 'powerlineColorLight6',
'powerlineColorLight7',
'powerlineTextLight1', 'powerlineTextLight2',
'powerlineTextLight3', 'powerlineTextLight4',
'vimColorNormalLight', 'vimColorInsertLight', 'vimColorVisualLight',
'vimColorReplaceLight', 'vimColorCommandLight',
'powerlineSepWidth',
'statusBarFontFollowNote',
'barRuleDarkTopColor', 'barRuleDarkBottomColor',
'barRuleLightTopColor', 'barRuleLightBottomColor',
'fontTokenFormat', 'markersTokenFormat',
'flagTokenFormat'
];
const BAR_KEYS_INERT = new Set([
'powerlineEnabled',
'retroCustomColors',
'retroDarkBgColor', 'retroDarkTextColor',
'retroLightBgColor', 'retroLightTextColor',
'powerlineText1', 'powerlineText2', 'powerlineText3', 'powerlineText4',
'powerlineTextLight1', 'powerlineTextLight2',
'powerlineTextLight3', 'powerlineTextLight4',
]);
const BAR_KEYS_LIVE = BAR_KEYS.filter(k => !BAR_KEYS_INERT.has(k));
const BAR_SHARE_VERSION = '1';
function barEnc(s) {
return encodeURIComponent(s).replace(/~/g, '%7E');
}
function barShareNum(n) {
if (Number.isInteger(n)) return String(n);
return String(Math.round(n * 1e6) / 1e6);
}
function barShareEncodeValue(v) {
if (typeof v === 'boolean') return 'b' + (v ? '1' : '0');
if (typeof v === 'number') return 'n' + barShareNum(v);
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
default: return undefined;
}
}
function pickBar(src) {
const out = {};
if (!src) return out;
for (const k of BAR_KEYS) {
if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
}
return out;
}
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
if (BAR_KEYS_INERT.has(k)) continue;
if (!(k in bar)) continue;
if (barSameValue(bar[k], defaults[k])) continue;
fields.push(i + barShareEncodeValue(bar[k]));
}
return fields.join('~');
}
function barParseFields(body) {
const snap = {};
if (!body) return snap;
for (const field of body.split('~')) {
if (!field) continue;
const m = /^(\d+)(.)([\s\S]*)$/.exec(field);
if (!m) continue;
const key = BAR_KEYS[Number(m[1])];
if (!key) continue;
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
const name = decodeURIComponent(parts[1] || '') || 'Imported preset';
return { name, snap: barParseFields(parts.slice(2).join('|')) };
} catch (_) {
return null;
}
}
function barPresetWithDefaults(preset) {
const out = {};
for (const k of BAR_KEYS) {
out[k] = barCloneValue(
Object.prototype.hasOwnProperty.call(preset || {}, k)
? preset[k] : DEFAULT_SETTINGS[k]);
}
return out;
}
const DEFAULT_BAR_PRESETS = {
"Plain": {
"statusBarRows": 1,
"statusRows": [{"left":"{vim}:b2|{file}:b1::{#>}","center":"","right":"{mode}:b1 {syntax} {prose} {report} :: {font} {markers} :: {words} words"},{"left":"","center":"","right":""},{"left":"","center":"","right":""}],
"fileTokenFormat": "name",
"flagTokenFormat": "both",
"powerlineModeColors": false,
"powerlineColor1": "#4f9dde",
"powerlineColor2": "#3f4550",
"powerlineColor3": "#2f333c",
"powerlineColor4": "#4caf7d",
"powerlineColor5": "#e0913a",
"powerlineColor6": "#8a7fd1",
"powerlineColor7": "#b5566b",
"statusBarBorderStyle": "solid",
"statusBarBorderWidth": 1,
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
"powerlineColorLight1": "#2d6da4",
"powerlineColorLight2": "#d9dce1",
"powerlineColorLight3": "#eceef1",
"powerlineColorLight4": "#2f8a5b",
"powerlineColorLight5": "#b96f1e",
"powerlineColorLight6": "#6a5cb8",
"powerlineColorLight7": "#a2404f",
"vimColorNormalLight": "#2d6da4",
"vimColorInsertLight": "#2f8a5b",
"vimColorVisualLight": "#6a5cb8",
"vimColorReplaceLight": "#a03c36",
"vimColorCommandLight": "#b96f1e",
"powerlineSepWidth": 78,
"statusBarFontFollowNote": false,
"barRuleDarkTopColor": "#fbfaf9",
"barRuleDarkBottomColor": "#fbfaf9",
"barRuleLightTopColor": "#16181d",
"barRuleLightBottomColor": "#16181d",
"fontTokenFormat": "word",
"markersTokenFormat": "word",
},
"Code": {
"statusBarRows": 1,
"statusRows": [{"left":":b4{obsidian}:b2;6|{vim}|{file}:b2>{#>}:b1>{ggg}>{gg}>{g}","center":"","right":"{mode}:b2 {syntax} {prose} {report}\\ {font}:b1 {markers}\\{words}:b2 words\\{clock}{time}:5"},{"left":"","center":"","right":""},{"left":"","center":"","right":""}],
"fileTokenFormat": "name",
"flagTokenFormat": "both",
"powerlineModeColors": true,
"powerlineColor1": "#4f9dde",
"powerlineColor2": "#3f4550",
"powerlineColor3": "#2f333c",
"powerlineColor4": "#4caf7d",
"powerlineColor5": "#e0913a",
"powerlineColor6": "#8a7fd1",
"powerlineColor7": "#b5566b",
"statusBarBorderStyle": "none",
"statusBarBorderWidth": 1,
"statusBarBorderTop": false,
"statusBarBorderBottom": false,
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
"vimLabelNormal": "NORMAL",
"vimLabelInsert": "INSERT",
"vimLabelVisual": "VISUAL",
"vimLabelReplace": "REPLACE",
"vimLabelCommand": "COMMAND",
"powerlineColorLight1": "#2d6da4",
"powerlineColorLight2": "#d9dce1",
"powerlineColorLight3": "#eceef1",
"powerlineColorLight4": "#2f8a5b",
"powerlineColorLight5": "#d79956",
"powerlineColorLight6": "#6a5cb8",
"powerlineColorLight7": "#a2404f",
"vimColorNormalLight": "#2d6da4",
"vimColorInsertLight": "#2f8a5b",
"vimColorVisualLight": "#6a5cb8",
"vimColorReplaceLight": "#a03c36",
"vimColorCommandLight": "#b96f1e",
"powerlineSepWidth": 78,
"statusBarFontFollowNote": true,
"barRuleDarkTopColor": "#fbfaf9",
"barRuleDarkBottomColor": "#fbfaf9",
"barRuleLightTopColor": "#16181d",
"barRuleLightBottomColor": "#16181d",
"fontTokenFormat": "glyph",
"markersTokenFormat": "glyph",
},
};
const zgOrgIndex = () => new Map();
const zgOrgPut = (ix, path, r) => {
if (!ix || !path) return null;
const src = r || {};
let props = null;
if (src.props && typeof src.props === 'object') {
props = {};
for (const k of Object.keys(src.props)) props[k] = src.props[k];
}
const entry = {
words: Number(src.words) || 0,
paras: Number(src.paras) || 0,
charsNoSpaces: Number(src.charsNoSpaces) || 0,
charsWithSpaces: Number(src.charsWithSpaces) || 0,
sentences: Number(src.sentences) || 0,
tasks: src.tasks && Number(src.tasks.all) > 0
? { all: Number(src.tasks.all) || 0, done: Number(src.tasks.done) || 0 }
: null,
grade: (typeof src.grade === 'number' && isFinite(src.grade))
? src.grade : null,
mtime: Number(src.mtime) || 0,
ctime: Number(src.ctime) || 0,
props
};
ix.set(String(path), entry);
return entry;
};
const zgOrgRemove = (ix, path) => ix.delete(String(path));
const zgOrgRename = (ix, from, to) => {
const r = ix.get(String(from));
if (r === undefined) return false;
ix.delete(String(from));
ix.set(String(to), r);
return true;
};
const zgOrgStale = (ix, path, mtime) => {
const r = ix.get(String(path));
return !r || r.mtime !== (Number(mtime) || 0);
};
const zgOrgPathsUnder = (ix, folder) => {
const out = [];
if (!ix) return out;
const f = String(folder || '');
const pre = f ? f + '/' : '';
for (const p of ix.keys()) {
if (!pre || p.startsWith(pre)) out.push(p);
}
return out;
};
const zgUnderIndex = (files) => {
const byFolder = new Map();
const seen = new Set();
const all = [];
for (const f of (files || [])) {
const p = f && f.path ? String(f.path) : (typeof f === 'string' ? f : '');
if (!p || seen.has(p)) continue;
seen.add(p); all.push(p);
let cut = p.lastIndexOf('/');
while (cut > -1) {
const dir = p.slice(0, cut);
let arr = byFolder.get(dir);
if (!arr) { arr = []; byFolder.set(dir, arr); }
arr.push(p);
cut = dir.lastIndexOf('/');
}
}
return { byFolder: byFolder, files: seen, all: all };
};
const zgUnderRow = (ix, path, kind) => {
if (!ix) return [];
const p = String(path == null ? '' : path);
if (kind === 'folder') return p === '' ? ix.all : (ix.byFolder.get(p) || []);
return ix.files.has(p) ? [p] : [];
};
const zgOrgAgg = (ix, paths) => {
const out = { files: 0, words: 0, paras: 0, tasksAll: 0, tasksDone: 0, newest: 0 };
if (!ix) return out;
for (const p of (paths || [])) {
const r = ix.get(String(p));
if (!r) continue;
out.files++;
out.words += r.words;
out.paras += r.paras;
if (r.tasks) { out.tasksAll += r.tasks.all; out.tasksDone += r.tasks.done; }
if (r.mtime > out.newest) out.newest = r.mtime;
}
return out;
};
const zgOrgDropBefore = (sibs, movedPath, ontoPath, below) => {
const rest = (sibs || []).filter(p => p !== movedPath);
const i = rest.indexOf(ontoPath);
if (i === -1) return null;
if (!below) return ontoPath;
return (i + 1 < rest.length) ? rest[i + 1] : null;
};
const zgOrgCounts = (ix, paths, key) => {
const n = new Map();
if (!ix || !key) return n;
for (const p of (paths || [])) {
const r = ix.get(String(p));
if (!r || !r.props || !Object.prototype.hasOwnProperty.call(r.props, key)) continue;
const v = r.props[key];
const here = new Set();
const take = (x) => {
if (x === null || x === undefined) return;
if (Array.isArray(x)) { x.forEach(take); return; }
if (typeof x === 'object') return;
const s = String(x).trim();
if (s) here.add(s);
};
take(v);
for (const s of here) n.set(s, (n.get(s) || 0) + 1);
}
return n;
};
const zgOrgDistinct = (ix, paths, key) => {
const seen = new Map();
if (!ix || !key) return [];
const take = (v) => {
if (v === null || v === undefined) return;
if (Array.isArray(v)) { v.forEach(take); return; }
if (typeof v === 'object') return;
const s = String(v).trim();
if (!s) return;
if (!seen.has(s)) seen.set(s, v);
};
for (const p of (paths || [])) {
const r = ix.get(String(p));
if (r && r.props && Object.prototype.hasOwnProperty.call(r.props, key)) {
take(r.props[key]);
}
}
return Array.from(seen.keys())
.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
.map(s => seen.get(s));
};
const ZG_INTERNALS = [
{
id: 'explorerSort',
kind: 'method',
what: 'getSortedFolderItems',
where: 'the file-explorer view',
without: 'manuscript order is not applied to the file tree; it keeps '
+ 'Obsidian’s own sort. Everything else still works.',
probe: (app) => zgInternalView(app, 'file-explorer',
(v) => typeof v.getSortedFolderItems === 'function')
},
{
id: 'explorerResort',
kind: 'method',
what: 'requestSort / tree.infinityScroll.compute / fileItems[/].updateChildren',
where: 'the file-explorer view',
without: 'a dragged row may not move until the folder is folded and '
+ 'opened again.',
probe: (app) => zgInternalView(app, 'file-explorer', (v) => {
if (typeof v.requestSort === 'function') return true;
const sc = v.tree && v.tree.infinityScroll;
if (sc && typeof sc.compute === 'function') return true;
const root = v.fileItems && v.fileItems['/'];
return !!(root && typeof root.updateChildren === 'function');
})
},
{
id: 'sortMenu',
kind: 'method',
what: 'onHeaderMenu',
where: 'the file-explorer view',
without: '“Manuscript order” is not added to the file tree’s own '
+ 'sort menu. The switch in Settings → File tree still works.',
probe: (app) => zgInternalView(app, 'file-explorer',
(v) => typeof v.onHeaderMenu === 'function')
},
{
id: 'sortOrder',
kind: 'method',
what: 'setSortOrder',
where: 'the file-explorer view',
without: 'picking a sort from that menu cannot hand the tree back to '
+ 'Obsidian’s ordering.',
probe: (app) => zgInternalView(app, 'file-explorer',
(v) => typeof v.setSortOrder === 'function')
},
{
id: 'deferredLeaves',
kind: 'flag',
what: 'leaf.isDeferred',
where: 'a workspace leaf',
without: 'a pane that has not been opened yet cannot be told apart '
+ 'from one that lacks a method, so a warning may name the wrong '
+ 'cause.',
probe: (app) => {
try {
const ls = app.workspace.getLeavesOfType('file-explorer') || [];
return ls.length ? typeof ls[0].isDeferred === 'boolean' : null;
} catch (_) { return null; }
}
},
{
id: 'propertyTypes',
kind: 'method',
what: 'app.metadataTypeManager',
where: 'the app',
without: 'a property’s type is guessed from its value rather than '
+ 'read from the vault’s registry, so a date typed as text may '
+ 'sort as text.',
probe: (app) => !!(app && app.metadataTypeManager)
},
{
id: 'explorerLeaf',
kind: 'selector',
what: '.workspace-leaf-content[data-type="file-explorer"]',
where: 'the workspace',
without: 'nothing this plugin draws in the file tree is drawn at all: '
+ 'no counts, no flags, no folder colours.',
probe: () => zgInternalSeen('.workspace-leaf-content[data-type="file-explorer"]')
},
{
id: 'treeRows',
kind: 'selector',
what: '.nav-file-title / .nav-folder-title',
where: 'the file tree',
without: 'counts, flags and goal badges have no row to attach to.',
probe: () => zgInternalSeen('.nav-file-title, .nav-folder-title')
},
{
id: 'treeChildren',
kind: 'selector',
what: '.tree-item-children',
where: 'the file tree',
without: 'a folder’s word count cannot be summed from the notes '
+ 'under it, and the selection accent has no guide line to sit on.',
probe: () => zgInternalSeen('.tree-item-children')
},
{
id: 'editorScroller',
kind: 'selector',
what: '.cm-scroller',
where: 'a markdown editor',
sometimes: true,
without: 'the letterbox masks and typewriter scrolling have nothing '
+ 'to measure.',
probe: () => zgInternalSeen('.cm-scroller')
},
{
id: 'menuLayer',
kind: 'selector',
what: '.menu',
where: 'an open menu',
sometimes: true,
without: 'a menu this plugin opens cannot be positioned or dismissed '
+ 'by the same rules as Obsidian’s own.',
probe: () => zgInternalSeen('.menu')
}
];
function zgInternalView(app, type, ask) {
try {
const leaves = app.workspace.getLeavesOfType(type) || [];
for (const l of leaves) {
if (!l || l.isDeferred) continue;
if (l.view) return !!ask(l.view);
}
} catch (_) { return null; }
return null;
}
function zgInternalSeen(sel) {
try { return !!document.querySelector(sel); } catch (_) { return null; }
}
function zgCompat(app) {
const caps = {};
const rows = [];
for (const item of ZG_INTERNALS) {
let ok = null;
try { ok = item.probe(app); } catch (_) { ok = null; }
caps[item.id] = ok;
const state = ok === true ? 'ok'
: ok === false ? (item.sometimes ? 'not open' : 'MISSING')
: 'unknown';
rows.push({
id: item.id,
what: item.what,
state: state,
without: state === 'MISSING' ? item.without : ''
});
}
return { caps: caps, rows: rows };
}
function zgCompatText(report) {
const out = [];
for (const r of (report && report.rows) || []) {
out.push(r.state.padEnd(10) + r.id.padEnd(16) + r.what);
if (r.without) out.push('         └ ' + r.without);
}
return out.join('\n');
}
module.exports = class WordSmith extends Plugin {
registerDomEvent(el, type, cb, opts) {
const w = zgGuard(cb, 'a ' + type + ' handler');
if (typeof super.registerDomEvent === 'function') {
return super.registerDomEvent(el, type, w, opts);
}
try { el.addEventListener(type, w, opts); } catch (_) { zgCatch('registerDomEvent: el.addEventListener(type, w, opts);', _); }
return undefined;
}
addCommand(cmd) {
const c = cmd;
try {
const id = (c && c.name) ? c.name : ((c && c.id) ? c.id : 'a command');
for (const k of ['callback', 'checkCallback',
'editorCallback', 'editorCheckCallback']) {
if (typeof c[k] === 'function') c[k] = zgGuard(c[k], 'the “' + id + '” command');
}
} catch (_) { zgCatch('addCommand: const id = (c && c.name) ? c.name : ((c && c.id) ? c.id : \'a …', _); }
if (typeof super.addCommand === 'function') return super.addCommand(c);
return c;
}
onAppEvent(emitter, name, cb) {
try {
return this.registerEvent(emitter.on(name, zgGuard(cb, 'the ' + name + ' handler')));
} catch (_) { return undefined; }
}
guardNotice(where, err) {
let frag = null;
try {
frag = document.createDocumentFragment();
const p = document.createElement('div');
p.textContent = 'Word-Smith: something went wrong in ' + where
+ '. The rest of Obsidian is unaffected. This is said once a session.';
frag.appendChild(p);
const b = document.createElement('button');
b.textContent = 'Copy details';
b.className = 'zg-guard-copy';
b.addEventListener('click', async (ev) => {
try { ev.stopPropagation(); } catch (_) { zgCatch('guardNotice: ev.stopPropagation();', _); }
let text = 'Word-Smith: ' + where + '\n' + ((err && err.stack) || String(err || '')) + '\n\n';
try { text += this.diagnostics(); } catch (_) { zgCatch('guardNotice: text += this.diagnostics();', _); }
try { await navigator.clipboard.writeText(text); b.textContent = 'Copied'; }
catch (_) { b.textContent = 'Could not copy'; }
});
frag.appendChild(b);
new Notice(frag, 20000);
} catch (_) { zgCatch('guardNotice: frag = document.createDocumentFragment();', _); }
return frag;
}
startStore() {
try { return window.localStorage || null; } catch (_) { return null; }
}
startGuardKey() {
const id = (this.app && this.app.appId) || 'vault';
return 'word-smith:starting:' + id;
}
startGuardBegin() {
let tripped = false;
try {
const st = this.startStore();
if (!st) return false;
const k = this.startGuardKey();
tripped = st.getItem(k) != null;
st.setItem(k, String(Date.now()));
} catch (_) { return false; }
return tripped;
}
startGuardEnd() {
try { const st = this.startStore(); if (st) st.removeItem(this.startGuardKey()); } catch (_) { zgCatch('startGuardEnd: const st = this.startStore();', _); }
}
installerVersion(ua) {
try {
const m = /obsidian\/(\d+\.\d+\.\d+)/.exec(String(ua != null ? ua : navigator.userAgent || ''));
return m ? m[1] : null;
} catch (_) { return null; }
}
installerVerdict(ver) {
const parts = String(ver || '').split('.').map((x) => parseInt(x, 10));
if (parts.length < 2 || parts.some((x) => !isFinite(x))) return { kind: 'ok', major: null, text: '' };
const key = parts[0] * 1000 + parts[1];
const major = parts[0] * 100 + parts[1];
const fix = ' Your app is up to date; the installer is the part that never updates itself.'
+ ' Uninstall Obsidian and install it again from obsidian.md \u2014 your vaults and settings are untouched.';
if (key < ZG_INSTALLER_REFUSE) {
return { kind: 'refuse', major,
text: 'Word-Smith did not start: your Obsidian installer is ' + ver
+ ', and Obsidian freezes on enable in installers before ' + ZG_INSTALLER_REFUSE_TEXT + '.' + fix };
}
if (key < ZG_INSTALLER_WARN) {
return { kind: 'warn', major,
text: 'Word-Smith: your Obsidian installer is ' + ver + ', older than the ' + ZG_INSTALLER_WARN_TEXT
+ ' this version was built in. If anything lags or looks broken, that is the first thing to change.' + fix };
}
return { kind: 'ok', major, text: '' };
}
startBlocked() {
const v = this.installerVerdict(this.installerVersion());
if (v.kind === 'refuse') return { kind: 'refuse', text: v.text };
if (this._startTripped) {
return { kind: 'safe', text: 'Word-Smith: the last start did not finish, so everything is off this time.'
+ ' Settings \u2192 Word-Smith has a button to try again; if it freezes again, check your installer version (Settings \u2192 General) and open an issue.' };
}
return null;
}
async startAgain() {
const id = (this.manifest && this.manifest.id) || 'word-smith';
const pl = this.app && this.app.plugins;
if (!pl || !pl.disablePlugin || !pl.enablePlugin) return false;
await pl.disablePlugin(id);
await pl.enablePlugin(id);
return true;
}
async onload() {
this.loadMark('start');
this._startTripped = this.startGuardBegin();
zgGuardTell((where, err) => this.guardNotice(where, err));
this.maskTopEl = null;
this.maskBottomEl = null;
this.arrowsTopEl = null;
this.arrowsBottomEl = null;
this.maskResizeObserver = null;
this._maskRaf = null;
this.retroStatusBarEl = null;
this._peekArmed = false;
this._peekZoneTop = Infinity;
this._barPeek = false;
this._barPeekTimer = null;
this._barBoxHeight = 0;
this.retroPlinthEl = null;
this.clockInterval = null;
this.batteryLevel = null;
this.batteryCharging = false;
this._batteryManager = null;
this._batteryHandler = null;
this._zgLastTotalWordCount = 0;
this._docStatsCache = null;
this._capsLockOn = false;
this._numLockOn = false;
this._statusRowEls = [];
this._goalWasMet = null;
this._fenceCache = null;
this._paraCache = null;
this._lastTypo = null;
this._barPicker = null;
this._barPickerDismiss = null;
this._barPickerKey = (e) => { if (e.key === 'Escape') this.closeBarPicker(); };
this._vimMapped = false;
this._fmCache = {};
this._hemFlashTimer = null;
this._scopeGen = 0;
this._lastScopeInScope = null;
this.currentScroller = null;
this.scrollHandler = null;
this.windowResizeHandler = null;
this.styleEl = null;
this.explorerObserver = null;
this.wordCountCache = new Map();
this._patchScheduled = false;
this._isTogglingZen = false;
this._wasZenMode = false;
this._tabContainersCache = null;
this._sidebarsSuspended = false;
this._suspendedLeft = false;
this._suspendedRight = false;
this._barReserve = null;
this._activeDragCleanup = null;
this._refreshTimer = null;
this._selectionRaf = null;
this._themeObserver = null;
this.loadMark('fields');
await this.loadSettings();
this.loadMark('loadSettings');
try {
const v = this.installerVerdict(this.installerVersion());
if (v.kind === 'warn' && this.settings.oldInstallerSaid !== v.major) {
this.settings.oldInstallerSaid = v.major;
this.saveSettings(true);
new Notice(v.text, 30000);
}
} catch (_) { zgCatch('onload: const v = this.installerVerdict(this.installerVersion());', _); }
if (this.startBlocked()) {
this._startBlocked = this.startBlocked();
this.startGuardEnd();
try { new Notice(this._startBlocked.text, 30000); } catch (_) { zgCatch('onload: new Notice(this._startBlocked.text, 30000);', _); }
this.addSettingTab(new WordSmithSettingTab(this.app, this));
this.loadMark('blocked');
return;
}
if (this.barThemeGlassRepay()) { try { await this.saveSettings(); } catch (_) { zgCatch('onload: await this.saveSettings();', _); } }
this._wasZenMode = this.zenOn();
this.app.workspace.onLayoutReady(() => {
try { this.caps = zgCompat(this.app).caps; } catch (_) { this.caps = {}; }
if (!this.settings.pluginEnabled || !this.settings.treeOrder) return;
this.treeOrderLoad().then(() => this.patchExplorerSort());
});
this.app.workspace.onLayoutReady(() => {
if (!this.settings.pluginEnabled || !this.zenOn()) return;
const ws = this.app.workspace;
if (ws.leftSplit && !ws.leftSplit.collapsed) ws.leftSplit.collapse();
if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.collapse();
});
try { this.flagsApply(); } catch (_) { zgCatch('onload: this.flagsApply();', _); }
this.addSettingTab(new WordSmithSettingTab(this.app, this));
this.loadMark('settings tab');
this.setupBattery();
if (this.settings.menuDock) this.registerMenuPanel();
this.registerOutlinerPane();
this.addCommand({
id: 'repair-display',
name: 'Repair the display (draw everything again)',
callback: () => { this.repairDisplay(); new Notice('Word-Smith: repaired.', 4000); }
});
this.addCommand({
id: 'copy-settings',
name: 'Copy your settings as text',
callback: async () => {
try { await navigator.clipboard.writeText(this.settingsCopyText()); new Notice('Word-Smith: settings copied.', 4000); }
catch (_) { new Notice('Word-Smith: could not reach the clipboard.', 6000); }
}
});
this.addCommand({
id: 'paste-settings',
name: 'Paste settings from the clipboard (replaces everything; Undo on the Misc tab)',
callback: async () => {
let text = '';
try { text = await navigator.clipboard.readText(); } catch (_) { new Notice('Word-Smith: could not read the clipboard.', 6000); return; }
const r = await this.settingsPasteText(text);
new Notice('Word-Smith: ' + (r.error || (r.applied + ' setting(s) pasted' + (r.repaired.length ? ', ' + r.repaired.length + ' reset' : '') + '.')), 8000);
}
});
this.addCommand({
id: 'copy-diagnostics',
name: 'Copy diagnostics for a bug report',
callback: async () => {
let text = '';
try { text = this.diagnostics(); }
catch (e) { text = 'Word-Smith: diagnostics failed — ' + ((e && e.message) || e); }
try {
await navigator.clipboard.writeText(text);
new Notice('Word-Smith: diagnostics copied. Paste them into the '
+ 'issue.', 6000);
} catch (_) {
try { console.log(text); } catch (_e) { zgCatch('onload / callback: console.log(text);', _e); }
new Notice('Word-Smith: could not reach the clipboard — the '
+ 'diagnostics are in the developer console instead.', 8000);
}
}
});
this.addCommand({
id: 'open-export',
name: 'Export a manuscript\u2026',
callback: () => this.openExportModal()
});
this.addCommand({
id: 'open-menu-panel',
name: 'Open the menu in a panel',
callback: async () => {
if (!this.settings.menuDock) {
new Notice('Word-Smith: switch on the panel in Settings \u2192 Menu first.');
return;
}
await this.openMenuPanel(true);
}
});
this.addCommand({
id: 'toggle-retro-bar',
name: 'Toggle the powerline bar',
callback: async () => {
this.settings.enableRetroStatus = !this.settings.enableRetroStatus;
this.updateStatusBar();
this.updateRetroStatusBar();
await this.saveSettings(true);
}
});
this.addCommand({
id: 'toggle-wordsmith',
name: 'Turn everything on or off',
callback: () => this.toggleFullPlugin()
});
this.addCommand({
id: 'cycle-bar-preset',
name: 'Cycle powerline presets',
callback: () => this.cycleBarPreset(1)
});
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
this.addCommand({
id: 'toggle-zen',
name: 'Toggle zen mode',
callback: () => this.toggleZen()
});
this.addCommand({
id: 'open-report',
name: 'Show the writing report',
callback: () => this.openReportModal()
});
this.addCommand({
id: 'open-history',
name: 'Show the writing history',
callback: () => this.openHistoryModal()
});
this.addCommand({
id: 'open-manuscript',
name: 'Open the Organizer',
callback: () => this.orgOpenTab('organizer')
});
const quickCmd = (id, name, key, viewType) => this.addCommand({
id, name,
checkCallback: (checking) => {
if (!this.settings[key]) return false;
if (!checking) this.toggleQuickPanel(viewType);
return true;
}
});
this.registerDomEvent(document, 'keydown', (e) => this.quickCycleVimKey(e), true);
quickCmd('quick-file-explorer', 'Quick file explorer',
'quickExplorer', 'file-explorer');
quickCmd('quick-outline', 'Quick outline', 'quickOutline', 'outline');
this.addCommand({
id: 'open-menu',
name: 'Open the menu',
callback: () => this.openBarMenu()
});
for (const dir of ['left', 'right', 'up', 'down']) {
this.addCommand({
id: 'quick-cycle-' + dir,
name: 'Quick cycle: focus ' + dir,
checkCallback: (checking) => {
if (!this.settings.quickCycle) return false;
if (!checking) this.quickCycleMove(dir);
return true;
}
});
}
try { if (addIcon) addIcon(WS_ICON, WS_ICON_SVG); } catch (_) { zgCatch('onload: if (addIcon) addIcon(WS_ICON, WS_ICON_SVG);', _); }
this.loadMark('commands');
this.registerWsIcon();
this.wsRibbonEl = this.addRibbonIcon('type', 'Open the Word-Smith menu', () => this.openBarMenu());
this.wsRibbonEl.addClass('ws-ribbon-btn');
this.wsRibbonEl.empty();
const badge = this.wsRibbonEl.createSpan({ cls: 'ws-ribbon-badge' });
let iconSet = false;
try {
if (setIcon) { setIcon(badge, WS_ICON); iconSet = !!badge.querySelector('svg'); }
} catch (_) { zgCatch('onload: if (setIcon) setIcon(badge, WS_ICON);', _); }
if (!iconSet) badge.createSpan({ cls: 'ws-ribbon-w', text: 'W' });
this.updateWsRibbonState();
this.onAppEvent(this.app.workspace, 'file-menu',
(menu, file, source) => {
if (source === 'word-smith-outliner') return;
this.fileMenuFor(menu, file);
});
this.onAppEvent(this.app.workspace, 'files-menu',
(menu, files, source) => {
if (source === 'word-smith-outliner') return;
this.filesMenuFor(menu, files);
});
this.onAppEvent(this.app.workspace, 'file-open', (file) => {
this.orgTreeFollow(file && file.path);
this.syncScope();
this.applyEditorFont();
this.applyVimMotionMaps();
this.updateWorkspaceAesthetics();
});
this.onAppEvent(this.app.workspace, 'active-leaf-change', () => {
this.syncScope();
this.applyEditorFont();
this.applyVimMotionMaps();
this.updateWorkspaceAesthetics();
this.scheduleExplorerPatch();
if (this.zenActive() && this.settings.focusedFileMode) this.updateFocusedFileMode();
this.typewriterScroll();
});
this.onAppEvent(this.app.workspace, 'editor-change', () => {
this.updateRetroStatusBar();
this.typewriterScroll();
});
this.onAppEvent(this.app.workspace, 'resize', () => {
this.scheduleMaskPosition();
this.scheduleFit();
});
this.onAppEvent(this.app.workspace, 'layout-change', () => {
this._tabContainersCache = null;
this._scopeGen++;
this.orgTicksSchedule();
this.applyBodyClasses();
this.scheduleMaskPosition();
if (this.zenActive() && this.settings.focusedFileMode) this.updateFocusedFileMode();
if (this.settings.pluginEnabled && this.explorerWanted()) {
this.attachExplorerObserver();
this.scheduleExplorerPatch();
}
if (this.settings.pluginEnabled) this.patchExplorerSort();
});
this.onAppEvent(this.app.workspace, 'active-leaf-change', () => {
this.rememberActiveMarkdown();
this.refreshMenuPanels();
});
this.onAppEvent(this.app.workspace, 'file-open', () => {
this.rememberActiveMarkdown();
});
this.onAppEvent(this.app.workspace, 'css-change', () => {
this.barThemeOnCssChange();
this.flagsApply();
});
this.onAppEvent(this.app.workspace, 'resize', () => this.barThemeGuard());
this.onAppEvent(this.app.workspace, 'active-leaf-change', () => this.barThemeGuard());
this.registerDomEvent(document, 'visibilitychange', () => {
if (!document.hidden) this.barThemeGuard();
});
this.registerDomEvent(document, 'keyup', (evt) => {
this.updateModifierState(evt);
this.updateRetroStatusBar();
this.typewriterScroll();
});
this.registerDomEvent(document, 'mousemove', (evt) => {
if (!this._peekArmed) return;
this.onPointerForBarPeek(evt.clientY);
});
this.registerDomEvent(document, 'mouseup', () => {
this.updateRetroStatusBar();
this.typewriterScroll();
});
this._selectionRaf = null;
this.registerDomEvent(document, 'selectionchange', () => {
if (this._selectionRaf) return;
this._selectionRaf = requestAnimationFrame(() => {
this._selectionRaf = null;
this.updateRetroStatusBar();
});
});
this.registerDomEvent(document, 'keydown', (evt) => {
this.updateModifierState(evt);
if (evt.key === 'Escape' && this.settings.zenEscExits !== false && this.zenActive()) {
const target = evt.target;
if (target) {
const cmEditor = target.closest('.cm-editor');
if (cmEditor) {
const vault = this.app.vault;
if (vault.config && vault.config.vimMode === true) {
if (this.getVimModeKey() !== 'normal') return;
}
}
if (target instanceof HTMLTextAreaElement && target.className && target.className.includes('excalidraw')) return;
}
const activeModal = document.querySelector('.modal');
if (!activeModal) { this.toggleZen(); evt.preventDefault(); }
}
});
const updateEditorFocusClass = () => {
const active = document.activeElement;
const inEditor = !!(active && active.closest && (
active.closest('.cm-editor') || active.closest('.zg-menu-panel')));
document.body.classList.toggle('zg-editor-focused', inEditor);
const blocked = !!(active && active.closest
&& active.closest('.modal-container, .prompt, .suggestion-container, .menu'));
document.body.classList.toggle('zg-drag-ok', !blocked);
this.updateRetroStatusBar();
};
const OVERLAYS = '.modal-container, .prompt, .suggestion-container, .menu';
const syncOverlayClass = () => {
let open = false;
try {
for (const el of Array.from(document.body.children)) {
if (el.matches && el.matches(OVERLAYS)) { open = true; break; }
}
} catch (_) { zgCatch('onload / syncOverlayClass: for (const el of Array.from(document.body.children))', _); }
document.body.classList.toggle('zg-overlay-open', open);
};
syncOverlayClass();
const overlayObserver = new MutationObserver(syncOverlayClass);
overlayObserver.observe(document.body, { childList: true });
this.register(() => {
overlayObserver.disconnect();
document.body.classList.remove('zg-overlay-open');
});
this.registerDomEvent(document, 'focusin', updateEditorFocusClass);
this.registerDomEvent(document, 'focusout', () => requestAnimationFrame(updateEditorFocusClass));
this.registerDomEvent(window, 'blur', () => requestAnimationFrame(() => {
if (!document.hasFocus()) {
document.body.classList.remove('zg-editor-focused');
document.body.classList.remove('zg-drag-ok');
this.updateRetroStatusBar();
}
}));
this.registerDomEvent(window, 'focus', () => requestAnimationFrame(updateEditorFocusClass));
updateEditorFocusClass();
this.onAppEvent(this.app.vault, 'modify', (file) => {
if (this.wordCountCache) this.wordCountCache.delete(file.path);
this.scheduleExplorerPatch();
this.historyNoteChange(file);
this.treeCountsChanged(file && file.path);
this.historyAdopt(file);
this.treeOrderAdopt(file);
});
this.onAppEvent(this.app.metadataCache, 'changed', (file) => {
if (this._fmCache && file && file.path) delete this._fmCache[file.path];
this._scopeGen++;
this._linkGen = (this._linkGen || 0) + 1;
if (file && this.app.workspace.getActiveFile()
&& file.path === this.app.workspace.getActiveFile().path) {
this.requestBarRebuild();
}
});
this.onAppEvent(this.app.metadataCache, 'resolved', () => {
this._linkGen = (this._linkGen || 0) + 1;
this.requestBarRebuild();
});
this.onAppEvent(this.app.vault, 'create', (file) => {
this.treeShapeChanged();
this.orgTicksSchedule();
if (this._historyPath || !this.settings.historyTracking) return;
this.historyAdopt(file);
});
this.onAppEvent(this.app.vault, 'rename', (file, oldPath) => {
if (this.wordCountCache) this.wordCountCache.delete(oldPath);
this.renameScopePath(oldPath, file.path);
this.historyRenamePath(oldPath, file.path);
const followed = this.storeRenameFollow(oldPath, file.path);
if (this.renameGoalPaths(oldPath, file.path) || followed) this.saveSettings(true);
this.structureRenameStore(oldPath, file.path);
this.orgTicksSchedule();
this.treeShapeChanged();
});
this.onAppEvent(this.app.vault, 'delete', (file) => {
if (this.wordCountCache) this.wordCountCache.delete(file.path);
this.removeScopePath(file.path);
this.historyForgetPath(file.path);
this.structureForgetStore(file.path);
if (this.forgetGoalPaths(file.path)) this.saveSettings(true);
this.treeShapeChanged();
});
this._themeObsBusy = false;
this._themeObserver = new MutationObserver(() => {
if (!this.settings.pluginEnabled) return;
if (this._themeObsBusy) return;
this._themeObsBusy = true;
try {
this.applyCssVariables();
this.updateStyleEl();
this.barThemeGuard();
} finally {
window.setTimeout(() => { this._themeObsBusy = false; }, 0);
}
});
this._themeObserver.observe(document.body,
{ attributes: true, attributeFilter: ['class', 'style'] });
this.loadMark('events + chrome');
this.setupEditorExtensions();
this.scheduleVimMotionMaps();
this.loadMark('editor extensions');
this.refresh();
this.loadMark('first refresh');
this.loadMark('onload done');
this.app.workspace.onLayoutReady(() => {
window.setTimeout(() => this.startGuardEnd(), 2000);
if (!this.settings.pluginEnabled) return;
const t0 = performance.now();
this.refresh();
this.checkStylesheetVersion();
this.checkManifestVersion();
window.setTimeout(() => {
if (this.settings && this.settings.pluginEnabled) this.refresh();
}, 0);
try {
if (!this._loadMarks) this._loadMarks = [];
this._loadMarks.push(['layout ready',
this._loadMarks[this._loadMarks.length - 1][1]
+ (performance.now() - t0)]);
} catch (_) { zgCatch('onload: if (!this._loadMarks) this._loadMarks = [];', _); }
if (this.settings.menuDock && !this.menuPanelLeaves().length) {
this.openMenuPanel(false);
}
if (this.settings.markersEnabled !== true
&& this.settings.showHiddenMarkers && this.settings.miscEnabled) {
this.settings.markersEnabled = true;
this.saveSettings();
}
this.settingsMirrorRestore(this._rawData)
.catch(() => false)
.then(() => this.goalsFileLoad())
.then(() => this.refresh())
.catch(() => {});
if (this.settings.menuDock) this.checkAppClasses();
if (this.settings.historyTracking) this.historyLoad();
});
}
checkAppClasses() {
if (this._appClassesChecked) return;
this._appClassesChecked = true;
let explorer = null;
try {
const leaves = this.app.workspace.getLeavesOfType('file-explorer') || [];
explorer = leaves.length && leaves[0].view ? leaves[0].view.containerEl : null;
} catch (_) { return; }
if (!explorer) return;
if (!explorer.querySelector('.tree-item')) return;
const need = [
'nav-files-container',
'tree-item',
'tree-item-self',
'tree-item-inner'
];
if (explorer.querySelector('.mod-collapsible, .nav-folder')) {
need.push('collapse-icon');
}
if (explorer.querySelector('.is-collapsed') === null
&& explorer.querySelector('.nav-folder, .mod-collapsible')) {
need.push('tree-item-children');
}
const missing = need.filter(c => !explorer.querySelector('.' + c));
if (!missing.length) return;
const what = 'Obsidian\u2019s file-explorer classes have changed ('
+ missing.join(', ') + ')';
console.warn('Word-Smith: ' + what
+ ' \u2014 the docked panel borrows them, so it may look wrong until '
+ 'the plugin is updated.');
new Notice('Word-Smith: ' + what + '.\nThe docked panel may look wrong '
+ 'until the plugin is updated.', 12000);
}
setWindowControlColours(on) {
let win = null;
const tries = [
() => window.require('@electron/remote').getCurrentWindow(),
() => window.require('electron').remote.getCurrentWindow(),
() => window.require('electron').getCurrentWindow(),
() => require('@electron/remote').getCurrentWindow()
];
for (const t of tries) {
try {
const w2 = t();
if (w2 && typeof w2.setTitleBarOverlay === 'function') { win = w2; break; }
} catch (_) { }
}
if (!win) return false;
try {
if (!on) {
if (this._wcoWas) win.setTitleBarOverlay(this._wcoWas);
return true;
}
const cs = getComputedStyle(document.body);
const pick = (name, fallback) => {
const v = (cs.getPropertyValue(name) || '').trim();
return v || fallback;
};
if (!this._wcoWas) {
this._wcoWas = { color: pick('--titlebar-background', '#1e1e1e'),
symbolColor: pick('--text-muted', '#888888') };
}
win.setTitleBarOverlay({
color: pick('--background-primary', '#1e1e1e'),
symbolColor: pick('--text-muted', '#888888')
});
return true;
} catch (_) { return false; }
}
readStylesheetVersion() {
try {
const raw = getComputedStyle(document.body)
.getPropertyValue('--zg-stylesheet-version').trim();
return raw === '' ? null : parseInt(raw, 10);
} catch (_) { return null; }
}
checkStylesheetVersion(attempt) {
const found = this.readStylesheetVersion();
if (found === ZG_STYLESHEET_VERSION) {
if (attempt) this.refresh();
return;
}
if (found == null) {
const waits = [0, 120, 400, 1200];
const next = (attempt || 0);
if (next < waits.length) {
window.setTimeout(() => {
if (this.settings && this.settings.pluginEnabled) {
this.checkStylesheetVersion(next + 1);
}
}, waits[next]);
return;
}
}
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
checkManifestVersion() {
let found = null;
try { found = this.manifest && this.manifest.version; } catch (_) { return; }
if (!found || found === ZG_PLUGIN_VERSION) return;
if (this._manifestWarned) return;
this._manifestWarned = true;
const what = 'manifest.json is out of date (says v' + found
+ ', this build is v' + ZG_PLUGIN_VERSION + ')';
console.warn('Word-Smith: ' + what
+ ' \u2014 copy main.js, styles.css AND manifest.json into '
+ '<vault>/.obsidian/plugins/word-smith/, then reload Obsidian.');
new Notice('Word-Smith: ' + what + '.\nCopy manifest.json into the plugin '
+ 'folder and reload Obsidian.', 12000);
}
wsModal() {
if (!Modal) return null;
const m = new Modal(this.app);
if (!this._openModals) this._openModals = new Set();
this._openModals.add(m);
const was = m.onClose ? m.onClose.bind(m) : null;
m.onClose = () => {
try { this._openModals.delete(m); } catch (_) { zgCatch('wsModal: this._openModals.delete(m);', _); }
if (was) was();
};
return m;
}
onunload() {
try {
if (this._openModals) {
for (const m of Array.from(this._openModals)) {
try {
if (m && m.containerEl && m.containerEl.isConnected) m.close();
} catch (_) { zgCatch('onunload: if (m && m.containerEl && m.containerEl.isConnected) m.close();', _); }
}
this._openModals.clear();
}
} catch (_) { zgCatch('onunload: if (this._openModals)', _); }
try { this.setWindowControlColours(false); } catch (_) { zgCatch('onunload: this.setWindowControlColours(false);', _); }
try { this.unpatchExplorerSort(); } catch (_) { zgCatch('onunload: this.unpatchExplorerSort();', _); }
try { for (const v of this.explorerViews()) this.unpatchExplorerSortMenu(v); } catch (_) { zgCatch('onunload: for (const v of this.explorerViews()) this.unpatchExplorerSortMenu(v);', _); }
try {
if (this.settings) this.settings.treeOrder = false;
this.paintExplorerSortIcon();
} catch (_) { zgCatch('onunload: if (this.settings) this.settings.treeOrder = false;', _); }
if (this._historyTimers) {
for (const t of this._historyTimers.values()) window.clearTimeout(t);
this._historyTimers.clear();
}
if (this.settings && this.settings.historyTracking) {
try { this.historyFlush(true); } catch (_) { zgCatch('onunload: this.historyFlush(true);', _); }
}
this.endBarPeek(true);
this.barThemeUndress();
try { this.startGuardEnd(); } catch (_) { zgCatch('onunload: this.startGuardEnd();', _); }
this.removeCustomElements();
this.stopClockTick();
this.removeStyleEl();
this.detachExplorerObserver();
this.removeWordCounts();
this.orgTreeHookDetach();
this.orgTicksClear();
this.detachScrollHandler();
this.detachResizeHandler();
if (this._themeObserver) { this._themeObserver.disconnect(); this._themeObserver = null; }
if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
if (this._activeDragCleanup) this._activeDragCleanup();
if (this._batteryManager && this._batteryHandler) {
this._batteryManager.removeEventListener('levelchange', this._batteryHandler);
this._batteryManager.removeEventListener('chargingchange', this._batteryHandler);
this._batteryManager = this._batteryHandler = null;
}
if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
if (this._hemFlashTimer) { window.clearTimeout(this._hemFlashTimer); this._hemFlashTimer = null; }
if (this._hemScreenTimer) { window.clearTimeout(this._hemScreenTimer); this._hemScreenTimer = null; }
if (this._hemIconTimer) { window.clearTimeout(this._hemIconTimer); this._hemIconTimer = null; }
if (this._hemScreenEl) { this._hemScreenEl.remove(); this._hemScreenEl = null; }
this.closeBarPicker();
document.querySelectorAll('.cm-editor.zg-hem-blocked')
.forEach(el => el.classList.remove('zg-hem-blocked'));
if (this.zenOn()) {
this.settings.zenEnabled = false;
this.applyBodyClasses();
this.setSidebarVisibility();
}
this.settings.vimSoftWrapMotion = false;
this.applyVimMotionMaps();
this.clearAllBodyState();
this._focusTabRestore();
this.applyNativeStatusBarVisibility(false);
}
settingsCopyText() {
return JSON.stringify(zgForDisk(this.settings), null, 2);
}
async settingsApplyRaw(raw) {
const merged = Object.assign({}, DEFAULT_SETTINGS, raw);
const repaired = zgRepairSettings(merged, DEFAULT_SETTINGS);
for (const k of ZG_SESSION_KEYS) delete merged[k];
this.settings = merged;
await this.saveSettings(true);
return repaired;
}
async settingsPasteText(text) {
let raw = null;
try { raw = JSON.parse(String(text || '')); } catch (_) { raw = null; }
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
return { error: 'the clipboard does not hold a settings object \u2014 copy one from this tab first.' };
}
this._settingsUndo = zgForDisk(this.settings);
const repaired = await this.settingsApplyRaw(raw);
return { applied: Object.keys(raw).length, repaired };
}
async settingsUndoPaste() {
const prev = this._settingsUndo;
if (!prev) return { error: 'there is nothing to undo.' };
this._settingsUndo = null;
const repaired = await this.settingsApplyRaw(prev);
return { applied: Object.keys(prev).length, repaired };
}
async settingsResetTab(tabId) {
const keys = (typeof ZG_TAB_KEYS !== 'undefined' && ZG_TAB_KEYS[tabId]) || [];
if (!keys.length) return { error: 'there is no tab called ' + tabId + '.' };
this._settingsUndo = zgForDisk(this.settings);
const raw = zgForDisk(this.settings);
let changed = 0;
for (const k of keys) {
if (JSON.stringify(raw[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])) changed++;
delete raw[k];
}
await this.settingsApplyRaw(raw);
return { changed, keys: keys.length };
}
repairDisplay() {
try { this.disablePlugin(); this.reconfigureEditors(); } catch (_) { zgCatch('repairDisplay: this.disablePlugin();', _); }
try { this.refresh(); } catch (_) { zgCatch('repairDisplay: this.refresh();', _); }
return true;
}
async loadSettings() {
const raw = (await this.loadData()) || {};
this._rawData = raw;
this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
this._repairedKeys = zgRepairSettings(this.settings, DEFAULT_SETTINGS);
if (this._repairedKeys.length) {
try {
console.warn('Word-Smith: ' + this._repairedKeys.length
+ ' setting(s) in data.json had the wrong shape and were reset to their defaults: '
+ this._repairedKeys.join(', '));
} catch (_) { zgCatch('loadSettings: console.warn(\'Word-Smith: \' + this._repairedKeys.length', _); }
}
for (const k of ZG_SESSION_KEYS) delete this.settings[k];
this.historyBaselines();
if (raw.letterboxCustomColors === undefined) {
this.settings.letterboxCustomColors = ['arrowDarkColor', 'arrowLightColor',
'lineDarkColor', 'lineLightColor']
.some(k => raw[k] !== undefined && raw[k] !== DEFAULT_SETTINGS[k]);
}
if (!this.settings.treeOrderForcedOn) {
this.settings.treeOrder = true;
this.settings.treeOrderForcedOn = true;
}
if (!this.settings.fileIconsOffOnce) {
this.settings.orgFileIcons = false;
this.settings.fileTreeKindIcons = false;
this.settings.fileIconsOffOnce = true;
}
if (!this.settings.editorFontDefaultCleared) {
if (this.settings.editorFont === 'JetBrainsMono Nerd Font') {
this.settings.editorFont = '';
}
this.settings.editorFontDefaultCleared = true;
}
if (!this.settings.outlineFlagRenamed) {
try {
for (const f of (this.settings.flags || [])) {
if (f && f.id === 'outline' && f.label === 'Outline') f.label = 'Sketch';
}
} catch (_) { zgCatch('loadSettings: for (const f of (this.settings.flags || []))', _); }
this.settings.outlineFlagRenamed = true;
}
if (raw.typewriterAnchor === undefined
&& (raw.typewriterLinesAbove !== undefined || raw.typewriterLinesBelow !== undefined)) {
const a = Math.max(0, Number(raw.typewriterLinesAbove) || 0);
const b = Math.max(0, Number(raw.typewriterLinesBelow) || 0);
const t = a + b;
this.settings.typewriterAnchor = t > 0 ? Math.round((a / t) * 100) : 50;
}
delete this.settings.barThemeMarginalia;
delete this.settings.marginaliaGutter;
delete this.settings.typewriterLinesAbove;
delete this.settings.typewriterLinesBelow;
if (this.settings.letterboxRatio != null) {
if (this.settings.letterboxPx == null)
this.settings.letterboxPx = this.settings.letterboxRatio * 200;
delete this.settings.letterboxRatio;
}
if (this.settings.statusFormatText != null) {
this.settings.statusFormatCenter = this.settings.statusFormatText;
delete this.settings.statusFormatText;
}
if (this.settings.statusFormatLeft != null ||
this.settings.statusFormatCenter != null ||
this.settings.statusFormatRight != null) {
const rows = Array.isArray(this.settings.statusRows)
? this.settings.statusRows.slice()
: DEFAULT_SETTINGS.statusRows.map(r => Object.assign({}, r));
const row0 = Object.assign({ left: '', center: '', right: '' }, rows[0] || {});
if (this.settings.statusFormatLeft != null) row0.left = this.settings.statusFormatLeft;
if (this.settings.statusFormatCenter != null) row0.center = this.settings.statusFormatCenter;
if (this.settings.statusFormatRight != null) row0.right = this.settings.statusFormatRight;
rows[0] = row0;
this.settings.statusRows = rows;
delete this.settings.statusFormatLeft;
delete this.settings.statusFormatCenter;
delete this.settings.statusFormatRight;
}
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
for (const dead of ['lineNumberGap', 'lineNumberWidth', 'showLineNumbers',
'lineNumberMode', 'lineNumberVisual', 'lineNumberSize']) {
delete this.settings[dead];
}
if (this.settings.statusBarPadding != null) {
const pad = this.settings.statusBarPadding;
this.settings.statusBarPadTop = pad;
this.settings.statusBarPadBottom = pad;
delete this.settings.statusBarPadding;
}
for (const dead of ['zenAutoHideBar', 'zenAutoHideDelay', 'zenAutoHideZone']) {
delete this.settings[dead];
}
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
if (v !== before) v = v.trim();
row[slot] = v;
}
}
}
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
for (const dead of ['uiColorsEnabled', 'uiBgColor', 'uiTextColor',
'uiUnifyChrome', 'presets']) {
delete this.settings[dead];
}
for (const dead of ['fileGoalHairline', 'folderGoalHairline',
'goalGaugeStyle', 'goalShowGauge', 'goalCustomColors',
'goalColor', 'fileGoalColor', 'folderGoalColor']) {
delete this.settings[dead];
}
for (const dead of ['noteCustomColors', 'noteDarkBgColor',
'noteDarkTextColor', 'noteLightBgColor', 'noteLightTextColor']) {
delete this.settings[dead];
}
delete this.settings.uniCols;
delete this.settings.folderGoals;
delete this.settings.uniColCh;
delete this.settings.exportTicksAlways;
delete this.settings.manuscriptRoots;
delete this.settings.organizerRoot;
delete this.settings.uniRootShut;
delete this.settings.uniTreeWidth;
delete this.settings.uniShut;
if (raw.organizerMode === 'outline') this.settings.organizerMode = 'table';
delete this.settings.organizerOutlineProps;
delete this.settings.synopsisKey;
delete this.settings.organizerOutlineProp;
delete this.settings.organizerOutlineReads;
delete this.settings.organizerLongFields;
if (raw.uniColPx === undefined) {
const px = Number(raw.organizerNameColPx);
if (isFinite(px) && px > 0) this.settings.uniColPx = { name: Math.round(px) };
}
delete this.settings.organizerNameColPx;
delete this.settings.folderStatus;
delete this.settings.uniScope;
delete this.settings.uniBoard;
delete this.settings.uniBoardTags;
delete this.settings.uniNameCh;
for (const dead of ['readTimeWpm', 'dateFormat', 'powerlineCapStyle',
'statusBarPadSide']) {
delete this.settings[dead];
}
delete this.settings.powerlineText5;
delete this.settings.powerlineText6;
if (typeof this.settings.statusBarHeight === 'number') {
this.settings.statusBarHeight =
Math.max(12, Math.min(30, this.settings.statusBarHeight));
}
if (this.settings.statusBarBorderStyle === 'groove'
|| this.settings.statusBarBorderStyle === 'ridge') {
this.settings.statusBarBorderStyle = 'solid';
}
for (const snap of Object.values(this.settings.barPresets || {})) {
if (snap && (snap.statusBarBorderStyle === 'groove'
|| snap.statusBarBorderStyle === 'ridge')) {
snap.statusBarBorderStyle = 'solid';
}
}
for (const row of (this.settings.statusRows || [])) {
for (const slot of ['left', 'center', 'right']) {
if (typeof row[slot] === 'string' && row[slot].includes('{date}')) {
row[slot] = row[slot].replace(/\{date\}/g, '{dd}/{mm}');
}
}
}
{
const src = Array.isArray(this.settings.statusRows) ? this.settings.statusRows : [];
this.settings.statusRows = [0, 1, 2].map(i =>
Object.assign({ left: '', center: '', right: '' }, src[i] || {}));
}
if (this.settings.goalShapeLabel != null || this.settings.goalRingPercent != null ||
this.settings.goalDisplay != null) {
if (this.settings.goalDisplay === 'fraction') this.settings.goalLabelMode = 'fraction';
else if (this.settings.goalShapeLabel != null) this.settings.goalLabelMode = this.settings.goalShapeLabel;
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
if (this.settings.goalLabel != null) {
if (this.settings.goalLabel === 'none') this.settings.goalLabelMode = 'none';
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
if (this.settings.arrowStyle === 'ascii') {
this.settings.arrowStyle = 'chevron';
}
if (this.settings.vimPanelHeight > 34) this.settings.vimPanelHeight = 0;
delete this.settings.restoreCursorPosition;
delete this.settings.cursorMemory;
delete this.settings._lastArrowCount;
delete this.settings.exitButtonVisibility;
delete this.settings.autoHideButtonOnDesktop;
delete this.settings.topPadding;
delete this.settings.bottomPadding;
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
if (Array.isArray(this.settings.statusRows)) {
for (const row of this.settings.statusRows) {
if (!row) continue;
for (const slot of ['left', 'center', 'right']) {
if (typeof row[slot] === 'string' && row[slot].includes('{outliner}')) {
row[slot] = row[slot].replace(/\{outliner\}/g, '{organizer}');
}
}
}
}
if (!this.settings.barPresets || typeof this.settings.barPresets !== 'object'
|| this.settings.barPresets === DEFAULT_SETTINGS.barPresets) {
this.settings.barPresets = {};
}
if (!this.settings.barPresetsSeeded) {
for (const [name, snap] of Object.entries(DEFAULT_BAR_PRESETS)) {
if (!(name in this.settings.barPresets)) {
this.settings.barPresets[name] = barCloneValue(snap);
}
}
this.settings.barPresetsSeeded = true;
}
if (!Object.keys(raw).length && DEFAULT_BAR_PRESETS.Plain) {
this.applyBarSnapshot(DEFAULT_BAR_PRESETS.Plain);
this._activeBarPreset = 'Plain';
}
}
loadMark(name) {
try {
if (!this._loadMarks) this._loadMarks = [];
this._loadMarks.push([name, performance.now()]);
} catch (_) { zgCatch('loadMark: if (!this._loadMarks) this._loadMarks = [];', _); }
}
loadPhases() {
const m = this._loadMarks || [];
if (m.length < 2) return [];
const out = [];
for (let i = 1; i < m.length; i++) {
out.push({ name: m[i][0], ms: Math.round((m[i][1] - m[i - 1][1]) * 10) / 10 });
}
out.push({ name: 'TOTAL', ms: Math.round((m[m.length - 1][1] - m[0][1]) * 10) / 10 });
return out;
}
diagnostics() {
const L = [];
const yn = (v) => (v === true ? 'on' : v === false ? 'off' : String(v));
try {
L.push('Word-Smith ' + (this.manifest ? this.manifest.version : '?')
+ ' diagnostics');
L.push('Obsidian api ' + (typeof apiVersion !== 'undefined' ? apiVersion : '?')
+ '   platform ' + (typeof Platform !== 'undefined'
? (Platform.isMobile ? 'mobile' : 'desktop') : '?')
+ '   ' + ((typeof navigator !== 'undefined' && navigator.platform) || ''));
let ss = '';
try {
ss = getComputedStyle(document.body)
.getPropertyValue('--zg-stylesheet-version').trim();
} catch (_) { zgCatch('diagnostics: ss = getComputedStyle(document.body)', _); }
L.push('stylesheet v' + (ss || '(absent)') + ', script expects v'
+ ZG_STYLESHEET_VERSION
+ (String(ZG_STYLESHEET_VERSION) === ss ? '  OK' : '  <-- STALE'));
let notes = '?';
try { notes = String(this.app.vault.getMarkdownFiles().length); } catch (_) { zgCatch('diagnostics: notes = String(this.app.vault.getMarkdownFiles().length);', _); }
L.push('vault: ' + notes + ' notes');
L.push('');
const s = this.settings || {};
L.push('file tree:  counts ' + yn(s.enableFileTreeCounts)
+ ' · flags ' + yn(s.fileTreeFlags)
+ ' · goals ' + yn(s.fileTreeGoals)
+ ' · tasks ' + yn(s.fileTreeTasks)
+ ' · folder icons ' + yn(s.fileTreeFolderIcons)
+ ' · order ' + yn(s.treeOrder));
try {
const leaf = document.querySelector(
'.workspace-leaf-content[data-type="file-explorer"]');
const sc = leaf && leaf.querySelector('.nav-files-container');
const box = sc || leaf;
const h = box ? box.clientHeight : 0;
L.push('explorer:   ' + (!box ? 'not open'
: !h ? 'not visible (sidebar collapsed or pane hidden)'
: box.scrollHeight > h
? 'SCROLLS (' + box.scrollHeight + ' in ' + h + ')'
: 'fits (' + box.scrollHeight + ' in ' + h + ')'));
} catch (_) { L.push('explorer:   (could not measure)'); }
try {
const marks = this._passState ? this._passState.marks.length : 0;
L.push('painter:    ' + marks + ' pass(es) in the last '
+ (ZG_STORM_MS / 1000) + 's window, budget ' + ZG_STORM_PASSES
+ (this.explorerObserver ? '' : '  <-- OBSERVER IS OFF'));
} catch (_) { zgCatch('diagnostics: const marks = this._passState ? this._passState.marks.length : 0;', _); }
try {
const ph = this.loadPhases();
if (ph.length) {
L.push('');
L.push('load, by phase:');
const total = ph.filter(p => p.name === 'TOTAL')[0];
const rest = ph.filter(p => p.name !== 'TOTAL')
.sort((a, b) => b.ms - a.ms);
for (const p of rest) {
L.push('  ' + (p.ms + 'ms').padStart(8) + '  ' + p.name);
}
if (total) L.push('  ' + (total.ms + 'ms').padStart(8) + '  TOTAL');
}
} catch (_) { zgCatch('diagnostics: const ph = this.loadPhases();', _); }
L.push('');
try {
const rep = zgCompat(this.app);
L.push('Obsidian internals this plugin leans on:');
L.push(zgCompatText(rep));
} catch (_) { L.push('(the capability table could not be built)'); }
try {
const seen = zgCatchSeen();
const guarded = zgGuardSeen();
L.push('');
L.push('contained this session: ' + seen.length + ' catch site'
+ (seen.length === 1 ? '' : 's') + ', ' + guarded.length + ' guard site'
+ (guarded.length === 1 ? '' : 's'));
for (const g of guarded) L.push('  guard: ' + g);
for (const c of seen.slice(0, 40)) {
L.push('  ' + c.where + '  x' + c.n + (c.last ? '  ' + c.last : ''));
}
if (seen.length > 40) L.push('  … and ' + (seen.length - 40) + ' more');
} catch (_) { L.push('(the contained list could not be read)'); }
} catch (e) {
L.push('diagnostics stopped early: ' + ((e && e.message) || e));
}
return L.join('\n');
}
barGeometry() {
const L = [];
const n = (v) => Math.round(v * 100) / 100;
try {
const bar = this.retroStatusBarEl;
if (!bar) return 'Word-Smith: the powerline bar is not up.';
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
const r = el.getBoundingClientRect();
const cs = getComputedStyle(el);
const shape = el.getAttribute && el.getAttribute('data-shape');
const cap = el.getAttribute && el.getAttribute('data-cap');
const fills = Array.from(el.querySelectorAll ? el.querySelectorAll('rect,path') : [])
.map(c => c.getAttribute('fill') + '@' + c.getAttribute('x'));
L.push('  ' + (shape ? 'SEP ' + shape + (cap ? '/' + cap : '') : 'SEG')
+ '  x ' + n(r.left - sr.left) + ' → ' + n(r.right - sr.left)
+ '  w ' + n(r.width));
L.push('      margin ' + cs.marginLeft + ' / ' + cs.marginRight
+ '   z ' + cs.zIndex + '   pos ' + cs.position
+ (shape ? '' : '   bg ' + cs.backgroundColor));
if (fills.length) L.push('      fills ' + fills.join('  '));
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
try { console.log(out); } catch (_) { zgCatch('barGeometry: console.log(out);', _); }
return out;
}
layoutDiagnostic() {
const L = [];
const px = (n) => (n == null ? '?' : Math.round(n * 10) / 10 + 'px');
try {
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (!view) return 'Word-Smith: no markdown view is active.';
const pane = view.contentEl.querySelector('.markdown-source-view')
|| view.contentEl.querySelector('.markdown-reading-view');
const editor = view.contentEl.querySelector('.cm-editor');
const scroller = view.contentEl.querySelector('.cm-scroller');
const leaf = pane && pane.closest ? pane.closest('.workspace-leaf') : null;
const bar = this.retroStatusBarEl;
L.push('Word-Smith ' + (this.manifest ? this.manifest.version : '?') + ' layout diagnostic');
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
const r = el.getBoundingClientRect();
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
barPeekArmed() {
return !!(this._peekArmed);
}
syncBarPeekState() {
const armed = !!(this.settings.pluginEnabled
&& this.retroStatusBarEl
&& this.barIsHidden()
&& (Number(this.settings.barPeekMs) || 0) > 0);
this._peekArmed = armed;
if (!armed) this.endBarPeek(true);
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
isVimKeysOn() {
try {
const vault = this.app.vault;
return !!(vault && vault.config && vault.config.vimMode === true);
} catch (_) { return false; }
}
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
} catch (_) { }
}
if (this.isVimKeysOn()) {
const gutter = this.vimGutterHeight();
if (gutter > 0 && bottom - gutter < limit) limit = bottom - gutter;
}
const mask = this.maskEdge(this.maskBottomEl, 'top');
if (mask != null && mask < limit) limit = mask;
return limit;
}
caretMargin() {
const n = Number(this.settings.caretMarginPx);
if (!isFinite(n) || n <= 0) return 0;
return Math.min(200, n);
}
caretFloorY() {
return this.chromeFloorY() - this.caretMargin();
}
caretCeilingY() {
const mask = this.maskEdge(this.maskTopEl, 'bottom');
return (mask != null && mask > 0 ? mask : 0) + this.caretMargin();
}
maskEdge(el, edge) {
if (!el || !this.letterboxActive()) return null;
try {
if (el.isConnected === false) return null;
const r = el.getBoundingClientRect();
if (!(r.height > 0)) return null;
return r[edge];
} catch (_) { return null; }
}
getBarPresets() {
if (!this.settings.barPresets || typeof this.settings.barPresets !== 'object') {
this.settings.barPresets = {};
}
return this.settings.barPresets;
}
async saveBarPreset(name) {
const snap = {};
for (const k of BAR_KEYS_LIVE) {
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
applyBarSnapshot(preset) {
const full = barPresetWithDefaults(preset);
for (const k of BAR_KEYS) this.settings[k] = full[k];
if (this.settings.statusBarBorderStyle === 'groove'
|| this.settings.statusBarBorderStyle === 'ridge') {
this.settings.statusBarBorderStyle = 'solid';
}
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
async cycleBarPreset(direction) {
const presets = this.getBarPresets();
const names = Object.keys(presets);
if (!names.length) {
new Notice('Word-Smith: no bar presets saved yet.');
return;
}
if (!this.settings.enableRetroStatus) {
new Notice('Word-Smith: the powerline bar is off.');
return;
}
const at = names.indexOf(this._activeBarPreset);
const next = names[(at + direction + names.length) % names.length];
await this.loadBarPreset(next);
new Notice('Bar preset: ' + next);
}
async deleteBarPreset(name) {
delete this.getBarPresets()[name];
await this.saveSettings(true);
}
async importBarPreset(code) {
const parsed = barCodeToPreset(code);
if (!parsed) return null;
const presets = this.getBarPresets();
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
async saveSettings(applyImmediately = false) {
try {
await this.saveData(zgForDisk(this.settings));
this.storeWriteOk(WS_WRITE.settings);
} catch (e) { this.settingsSaveFailed(e); }
try { this.flagsApply(); } catch (_) { zgCatch('saveSettings: this.flagsApply();', _); }
this.goalsFileSync();
this.settingsMirrorSync();
if (applyImmediately) {
if (this._refreshTimer) { window.clearTimeout(this._refreshTimer); this._refreshTimer = null; }
this.refresh();
} else {
this.scheduleRefresh();
}
}
settingsSaveFailed(e) {
return this.storeWriteFailed(WS_WRITE.settings, e,
'They are still set for this session, and are mirrored to '
+ 'ws-settings.md.');
}
scheduleRefresh() {
if (this._refreshTimer) window.clearTimeout(this._refreshTimer);
this._refreshTimer = window.setTimeout(() => {
this._refreshTimer = null;
this.refresh();
}, 120);
}
refresh() {
if (this._startBlocked) return;
this.updateWsRibbonState();
if (!this.settings.pluginEnabled) { this.disablePlugin(); this.reconfigureEditors(); return; }
try { if (this.wsRibbonEl) this.wsRibbonEl.style.display = ''; } catch (_) { zgCatch('refresh: if (this.wsRibbonEl) this.wsRibbonEl.style.display = \'\';', _); }
this.restoreMenuPanelSpot();
this._scopeGen++;
this._lastScopeInScope = this.isActiveFileInScope();
this.applyBodyClasses();
this.applyCssVariables();
this.applyEditorFont();
this.updateStyleEl();
this.updateWorkspaceAesthetics();
this.setSidebarVisibility();
this.syncSurfaceSidebars();
this.updateFocusedFileMode();
this.typewriterScroll();
this.reconfigureEditors();
if (this.explorerWanted()) {
this.attachExplorerObserver();
this.scheduleExplorerPatch();
} else {
this.detachExplorerObserver();
this.removeWordCounts();
}
this.patchExplorerSort();
}
reconfigureEditors() {
if (CM && this.editorExtensions) {
this.editorExtensions.length = 0;
this.editorExtensions.push(...this.buildEditorExtensions());
}
try { this.app.workspace.updateOptions(); } catch (_) { zgCatch('reconfigureEditors: this.app.workspace.updateOptions();', _); }
}
clearAllBodyState() {
document.body.classList.remove(
'zenmode-active', 'zenmode-hide-properties', 'zenmode-hide-status-bar',
'zenmode-hide-scroll-bar', 'zenmode-hide-title-bar', 'zenmode-hide-ribbon',
'zenmode-hide-linked-mentions', 'zg-text-pad', 'zg-para-indent', 'zg-justify', 'zg-typewriter', 'zg-margin-nums',
'zg-masks-active', 'zg-retrobar-active', 'zg-pos-dim', 'zg-ck-dim', 'zg-hemingway-active',
'zg-line-limit', 'zg-editor-focused', 'zg-font-active', 'zg-rtl', 'zg-vim-panel-open',
'zg-bar-hidden', 'zg-bar-anim', 'zg-bar-peek', 'zg-titlebar-match', 'zg-drag-ok'
);
document.body.removeAttribute('data-zen-hide-inline-title');
document.body.removeAttribute('data-zen-focused-file');
const mainTb = document.querySelector('.titlebar.zg-main-titlebar');
if (mainTb) mainTb.classList.remove('zg-main-titlebar');
for (const prop of ['--zg-bg', '--zg-text', '--zg-font',
'--zg-note-bg', '--zg-note-text', '--zg-note-bg-alt']) {
document.body.style.removeProperty(prop);
}
document.documentElement.style.removeProperty('--zg-bar-reserve');
document.documentElement.style.removeProperty('--zg-tw-pad-top');
document.documentElement.style.removeProperty('--zg-tw-pad-bottom');
for (const el of [document.documentElement, document.body]) {
if (!el || !el.style) continue;
const mine = [];
for (let i = 0; i < el.style.length; i++) {
const k = el.style[i];
if (k && k.indexOf('--zg-') === 0) mine.push(k);
}
for (const k of mine) el.style.removeProperty(k);
}
this._barReserve = null;
document.querySelectorAll('.zg-bar-overlap')
.forEach(el => el.classList.remove('zg-bar-overlap'));
}
disablePlugin() {
this.barThemeUndress();
this.clearChromeColors();
this.endBarPeek(true);
this._peekArmed = false;
this.clearBarBounds();
this.removeCustomElements();
this.stopClockTick();
this.removeStyleEl();
this.detachExplorerObserver();
this.removeWordCounts();
this.orgTreeHookDetach();
this.orgTicksClear();
this.detachScrollHandler();
this.detachResizeHandler();
this.applyNativeStatusBarVisibility(false);
this.rememberMenuPanelSpot();
this.closeMenuPanel();
try { if (this.wsRibbonEl) this.wsRibbonEl.style.display = 'none'; } catch (_) { zgCatch('disablePlugin: if (this.wsRibbonEl) this.wsRibbonEl.style.display = \'none\';', _); }
this._fenceCache = null;
this._paraCache = null;
this._docStatsCache = null;
if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
this.clearAllBodyState();
this.applyVimMotionMaps();
document.body.removeAttribute('data-zen-hide-inline-title');
document.body.removeAttribute('data-zen-focused-file');
document.documentElement.style.removeProperty('--zg-editor-padding-h');
document.documentElement.style.removeProperty('--zen-mode-top-padding');
document.documentElement.style.removeProperty('--zen-mode-bottom-padding');
this._focusTabRestore();
const ws = this.app.workspace;
if (ws.leftSplit && !ws.leftSplit.collapsed) ws.leftSplit.expand();
if (ws.rightSplit && !ws.rightSplit.collapsed) ws.rightSplit.expand();
if (document.fullscreenElement && document.exitFullscreen) {
document.exitFullscreen().catch(() => {});
}
}
applyBodyClasses() {
this.applyThemeClass();
this.applyThemeVars();
const body = document.body;
const zen = this.zenActive();
const scoped = this.isActiveFileInScope();
const hideNativeStatusBar = this.shouldHideNativeStatusBar();
body.classList.toggle('zenmode-active', zen);
body.classList.toggle('zenmode-hide-properties', zen && this.settings.hideProperties);
body.classList.toggle('zenmode-hide-status-bar', hideNativeStatusBar);
this.applyNativeStatusBarVisibility(hideNativeStatusBar);
body.classList.toggle('zenmode-hide-scroll-bar', this.shouldHideScrollBar());
body.classList.toggle('zenmode-hide-linked-mentions', zen && this.settings.hideLinkedMentions);
body.classList.toggle('zenmode-hide-ribbon', zen && this.settings.hideRibbon);
body.classList.toggle('zg-text-pad', scoped && !!this.settings.miscEnabled);
body.classList.toggle('zg-para-indent', scoped && this.textOpt('enableParagraphIndent', false));
body.classList.toggle('zg-margin-nums', scoped && !!this.settings.paragraphNumbers);
body.classList.toggle('zg-justify', scoped && this.textOpt('justifyText', false));
const twOn = scoped && !!this.opt('enableTypewriter');
body.classList.toggle('zg-typewriter', twOn);
if (twOn) {
const pct = this.typewriterAnchorRatio() * 100;
document.documentElement.style.setProperty('--zg-tw-pad-top', pct + 'vh');
document.documentElement.style.setProperty('--zg-tw-pad-bottom', (100 - pct) + 'vh');
} else {
document.documentElement.style.removeProperty('--zg-tw-pad-top');
document.documentElement.style.removeProperty('--zg-tw-pad-bottom');
}
body.classList.toggle('zg-line-limit', scoped && this.textOpt('limitLineLength', false));
body.classList.toggle('zg-rtl', this.isRightToLeft());
const hideBar = this.barIsHidden();
if (body.classList.contains('zg-bar-hidden') !== hideBar) {
body.classList.add('zg-bar-anim');
clearTimeout(this._barAnimT);
this._barAnimT = setTimeout(() => document.body.classList.remove('zg-bar-anim'), 350);
}
body.classList.toggle('zg-bar-hidden', hideBar);
this.syncBarPeekState();
const matchBar = zen && this.settings.zenTitlebarMatch;
body.classList.toggle('zg-titlebar-match', matchBar);
this.setWindowControlColours(matchBar);
body.classList.toggle('zg-masks-active', scoped && this.letterboxActive());
body.classList.toggle('zg-pos-dim', scoped && this.settings.posEnabled && this.settings.posDimOthers);
body.classList.toggle('zg-ck-dim', scoped && this.settings.checksEnabled && this.settings.checkDimOthers);
body.classList.toggle('zg-hemingway-active', scoped && this.settings.hemingwayEnabled);
if (zen) {
body.setAttribute('data-zen-hide-inline-title', String(this.settings.hideInlineTitle));
body.setAttribute('data-zen-focused-file', String(this.settings.focusedFileMode));
} else {
body.removeAttribute('data-zen-hide-inline-title');
body.removeAttribute('data-zen-focused-file');
}
this.tagMainTitlebar();
}
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
fitClassOf(el) {
if (!el || !el.classList) return FIT_CLASS_READING;
if (el.classList.contains('zg-fit-identity')
|| (el.querySelector && el.querySelector('.zg-fit-identity'))) {
return FIT_CLASS_IDENTITY;
}
const text = (el.textContent || '').trim();
if (!text) return FIT_CLASS_DECORATION;
if (el.querySelector && el.querySelector('svg') && text.length <= 2) {
return FIT_CLASS_ORNAMENT;
}
if (el.classList.contains('zg-fit-ambient')
|| (el.querySelector && el.querySelector('.zg-fit-ambient'))) {
return FIT_CLASS_AMBIENT;
}
return FIT_CLASS_READING;
}
fitCandidates(rowEl) {
const secs = this.fitSections(rowEl);
const pick = sec => Array.from(sec.querySelectorAll
? sec.querySelectorAll('.zg-pl-seg, .zg-fit-item') : [])
.filter(el => !el.querySelector('.zg-barbtn')
&& !el.classList.contains('zg-barbtn'))
.filter(el => el.classList.contains('zg-pl-seg')
|| !(el.closest && el.closest('.zg-pl-seg')))
.filter(el => el.classList.contains('zg-pl-seg')
|| (el.textContent || '').trim() !== '');
const byClass = c => secs.filter(s => s.classList && s.classList.contains(c));
const left = byClass('zg-status-left').flatMap(pick);
const right = byClass('zg-status-right').flatMap(pick).reverse();
const mid = byClass('zg-status-center').flatMap(pick).reverse();
const other = secs.filter(s => !s.classList
|| !(s.classList.contains('zg-status-left')
|| s.classList.contains('zg-status-right')
|| s.classList.contains('zg-status-center'))).flatMap(pick);
const edges = [];
for (let i = 0; i < Math.max(left.length, right.length); i++) {
if (left[i]) edges.push(left[i]);
if (right[i]) edges.push(right[i]);
}
const positional = edges.concat(other, mid);
return positional
.map((el, i) => ({ el, i, cls: this.fitClassOf(el) }))
.sort((a, b) => (a.cls - b.cls) || (a.i - b.i))
.map(x => x.el);
}
fadeCandidates(rowEl) {
const out = [];
const fades = rowEl.querySelectorAll
? Array.from(rowEl.querySelectorAll('.zg-pl-fade')) : [];
for (const fade of fades) {
out.push(fade);
for (const sib of [fade.previousElementSibling, fade.nextElementSibling]) {
if (sib && sib.classList && sib.classList.contains('zg-pl-sep')
&& out.indexOf(sib) === -1) {
out.push(sib);
}
}
}
return out;
}
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
return total + gaps <= (rowEl.clientWidth || 0) - FIT_SLACK;
}
fitStatusRow(rowEl, measure) {
if (!rowEl) return;
const fits = measure || (el => this.rowContentFits(el));
if (!rowEl.clientWidth) return;
this.clearFitHidden(rowEl);
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
const headCrumbs = this.headingCrumbCount();
if (headCrumbs > 1 && !fits(rowEl)
&& (this._fitShortenHead || 0) < headCrumbs - 1) {
this._fitShortenHead = (this._fitShortenHead || 0) + 1;
this._fitShortenHeadWidth = rowEl.clientWidth;
this.requestBarRebuild();
return;
}
if ((this._fitShortenHead || 0) > 0 && fits(rowEl)
&& rowEl.clientWidth > (this._fitShortenHeadWidth || 0) + FIT_RESTORE_MARGIN) {
this._fitShortenHead = 0;
this.requestBarRebuild();
return;
}
if (fits(rowEl)) return;
const fades = this.fadeCandidates(rowEl);
if (fades.length) {
for (const el of fades) el.classList.add('zg-fit-hidden');
if (fits(rowEl)) return;
}
const caps = rowEl.querySelectorAll('.zg-pl-cap');
if (caps.length) {
for (const cap of Array.from(caps)) cap.classList.add('zg-fit-hidden');
if (fits(rowEl)) return;
}
for (const el of this.fitCandidates(rowEl)) {
if (el.classList.contains('zg-fit-hidden')) continue;
el.classList.add('zg-fit-hidden');
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
barBorderStyle() {
const st = this.settings.statusBarBorderStyle || 'solid';
return (st === 'groove' || st === 'ridge') ? 'solid' : st;
}
barRuleWidths() {
const s = this.settings;
const style = this.barBorderStyle();
if (style === 'none') return { top: 0, bottom: 0, bandTop: 0, bandBottom: 0 };
const w = Math.max(1, Math.min(8, s.statusBarBorderWidth || 1));
const band = style === 'solid' ? Math.max(0, w - 1) : w;
const top = s.statusBarBorderTop !== false, bot = s.statusBarBorderBottom !== false;
return {
top: top ? w : 0,
bottom: bot ? w : 0,
bandTop: top ? band : 0,
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
if (rowH > 30) rowH -= 2;
return Math.max(12, rowH);
}
barBottomGapPx() {
const n = Number(this.settings.barBottomGap);
if (!isFinite(n)) return 23;
return Math.max(0, Math.min(30, Math.round(n)));
}
vimPanelReserve() {
const rowH = this.snappedRowHeight();
const measured = this.settings.vimPanelHeight || 0;
if (!(measured > 0)) return rowH;
return Math.max(rowH, Math.min(measured, 120));
}
vimGutterHeight() {
const gap = this.barBottomGapPx();
if (!this._vimPanelOpen) return gap;
return Math.max(gap, this.vimPanelReserve());
}
tagMainTitlebar() {
const tb = document.querySelector('.titlebar');
if (tb && !tb.classList.contains('zg-main-titlebar')) {
tb.classList.add('zg-main-titlebar');
}
}
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
'--zg-note-bg', '--zg-note-text', '--zg-note-bg-alt'];
}
clearChromeColors() {
const body = document.body.style;
const owned = new Set(this._themeVarKeys || []);
for (const p of this.chromeProps()) {
if (!owned.has(p)) body.removeProperty(p);
}
}
applyCssVariables() {
this.clearChromeColors();
const root = document.documentElement.style;
root.removeProperty('--zen-mode-top-padding');
root.removeProperty('--zen-mode-bottom-padding');
root.setProperty('--zg-editor-padding-h',
this.textOpt('editorPaddingH', DEFAULT_SETTINGS.editorPaddingH) + 'px');
root.setProperty('--zg-arrow-scale', String(this.settings.arrowScale || 1));
root.setProperty('--zg-separator-style', this.settings.separatorStyle);
root.setProperty('--zg-separator-weight', this.settings.separatorWeight + 'px');
root.setProperty('--zg-status-bar-font-size',
this.settings.statusBarFontFollowNote
? 'var(--font-text-size, 16px)'
: this.settings.statusBarFontSize + 'px');
const barRows = 1;
const rowH = this.snappedRowHeight();
root.setProperty('--zg-status-row-height', rowH + 'px');
root.setProperty('--zg-vim-gutter', this.vimGutterHeight() + 'px');
const { top: padTop, bottom: padBottom } = this.barPadding();
root.setProperty('--zg-status-bar-pad-top', padTop + 'px');
root.setProperty('--zg-status-bar-pad-bottom', padBottom + 'px');
const rules = this.barRuleWidths();
root.setProperty('--zg-bar-rule-band-top', rules.bandTop + 'px');
root.setProperty('--zg-bar-rule-band-bottom', rules.bandBottom + 'px');
root.setProperty('--zg-pl-sep-aspect', String(PL_SEP_ASPECT));
this._barBoxHeight = rowH * barRows + padTop + padBottom + rules.top + rules.bottom;
root.setProperty('--zg-status-bar-height', this._barBoxHeight + 'px');
root.setProperty('--zg-para-indent', (this.settings.paragraphIndentEm || 2) + 'em');
root.setProperty('--zg-mask-overhang', (this.settings.maskOverhang || 4) + 'px');
const isDark = document.body.classList.contains('theme-dark');
const barRoot = document.body.style;
const parsedDir = readBarDirective((this.getStatusRows()[0] || {}).left);
if (parsedDir.bg === null && parsedDir.bgSlot === null) {
parsedDir.bg = BAR_DIRECTIVE_BG.bs;
parsedDir.bgTheme = 'bs';
}
const dir = this.resolveBarDirective(parsedDir);
barRoot.setProperty('--zg-bg', dir.bg || 'var(--background-primary)');
barRoot.setProperty('--zg-text', dir.text || 'var(--text-normal)');
barRoot.setProperty('--zg-bar-rule-top-color',
this.settings[isDark ? 'barRuleDarkTopColor' : 'barRuleLightTopColor']
|| 'var(--zg-bar-rule-accent, var(--zg-text))');
barRoot.setProperty('--zg-bar-rule-bottom-color',
this.settings[isDark ? 'barRuleDarkBottomColor' : 'barRuleLightBottomColor']
|| 'var(--zg-bar-rule-accent, var(--zg-text))');
const lb = this.letterboxColors(isDark);
if (lb) {
root.setProperty('--zg-arrow-color', lb.arrow);
root.setProperty('--zg-line-color', lb.line);
} else {
root.removeProperty('--zg-arrow-color');
root.removeProperty('--zg-line-color');
}
}
letterboxColors(isDark) {
if (!this.settings.letterboxCustomColors) return null;
return {
arrow: isDark ? this.settings.arrowDarkColor : this.settings.arrowLightColor,
line: isDark ? this.settings.lineDarkColor : this.settings.lineLightColor,
};
}
firstPaintable(names) {
for (const n of names || []) {
const c = this.themeSurfaceColor(n);
if (c) return c;
}
return null;
}
barSurfaceColor(slot) {
const names = PL_THEME_BGS[slot];
if (!names) return '';
for (const name of names) {
const c = this.themeSurfaceColor(name);
if (c) return c;
}
return '';
}
resolveBarDirective(dir) {
let bg = dir.bg, text = dir.text;
if (dir.bgTheme) {
const c = this.barSurfaceColor(dir.bgTheme);
bg = c || 'var(--background-primary)';
}
if (dir.bgTheme && PL_THEME_BGS[dir.bgTheme]) {
const c = this.firstPaintable(PL_THEME_BGS[dir.bgTheme]);
if (c) bg = c;
}
if (dir.textTheme && BAR_THEME_INK_VARS[dir.textTheme]) {
const c = this.firstPaintable(BAR_THEME_INK_VARS[dir.textTheme]);
if (c) text = c;
}
if (dir.bgTheme === 'bs' && text === null && dir.textSlot == null) {
text = 'var(--status-bar-text-color, var(--text-normal))';
}
if (dir.bgSlot != null) {
let c = null;
if (dir.bgSlot === 'vim') {
c = this.vimModeColor();
} else if (dir.bgSlot === 'f') {
c = this.flagColor();
} else if (dir.bgSlot === 'bc') {
c = this.cursorColor();
} else {
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
: dir.textSlot === 'bc'
? (this.cursorColor() || text)
: dir.textSlot === 'f'
? (this.flagColor() || text)
: this.powerlineTextColor(dir.textSlot);
}
return { bg, text, bgSlot: dir.bgSlot, textSlot: dir.textSlot, rest: dir.rest };
}
coreFeatureCss() {
return [
'.zengrinder-mask-guard { -webkit-app-region: no-drag; }',
'body:not(.is-mobile).zenmode-active'
+ ':not(:has(.modal-container, .prompt, .suggestion-container, .menu))'
+ ' .zengrinder-arrows-wrap-bottom { -webkit-app-region: no-drag; }',
'body:not(.is-mobile) .zengrinder-status-bar,'
+ ' body:not(.is-mobile) .zengrinder-status-bar *,'
+ ' body:not(.is-mobile) .cm-editor .cm-panels.cm-panels-bottom,'
+ ' body:not(.is-mobile) .cm-editor .cm-panels.cm-panels-bottom *'
+ ' { -webkit-app-region: no-drag; }',
'body.zg-vim-panel-open .zg-bar-plinth { display: none; }',
'.zg-pl-sep[data-shape]:not([data-shape="straight"])'
+ ' { width: auto; aspect-ratio: var(--zg-pl-sep-aspect, 0.85); }',
'.zg-pl-sep { position: relative; z-index: 1; }',
'.zg-pl-seg { margin-inline: -1px; }',
'.zg-pl-sep[data-shape="straight"] { width: 0; margin-inline: 0; }',
'.zg-pl-sep[data-cap="lead"] { margin-inline-start: 0; }',
'.zg-pl-sep[data-cap="tail"] { margin-inline-end: 0; }',
'.markdown-source-view.mod-cm6 .cm-editor .cm-scroller { min-height: 0; }',
'body.zg-retrobar-active:not(.zg-bar-hidden) .workspace-leaf.zg-bar-overlap'
+ ' .markdown-source-view.mod-cm6 .cm-editor .cm-scroller'
+ ' { margin-bottom: var(--zg-bar-reserve,'
+ ' calc(var(--zg-status-bar-height, 30px) + var(--zg-vim-gutter, 0px))); }',
'body.zg-retrobar-active .cm-editor .cm-panels.cm-panels-bottom input,'
+ ' body.zg-masks-active .cm-editor .cm-panels.cm-panels-bottom input'
+ ' { color: var(--text-normal); -webkit-text-fill-color: var(--text-normal);'
+ ' caret-color: var(--text-normal); }',
'.zengrinder-status-bar.zg-powerline::after { content: \'\';'
+ ' position: absolute; inset: 0; pointer-events: none; z-index: 3;'
+ ' border-top: var(--zg-bar-rule-top-width, 0px) var(--zg-bar-rule-style, none)'
+ ' var(--zg-bar-rule-top-color, var(--zg-text));'
+ ' border-bottom: var(--zg-bar-rule-bottom-width, 0px) var(--zg-bar-rule-style, none)'
+ ' var(--zg-bar-rule-bottom-color, var(--zg-text)); }',
'.zengrinder-status-bar.zg-powerline { padding:'
+ ' var(--zg-bar-rule-band-top, 0px) 0'
+ ' var(--zg-bar-rule-band-bottom, 0px); }',
'.zengrinder-status-bar.zg-powerline .zg-pl-seg { box-sizing: border-box;'
+ ' padding-top: var(--zg-status-bar-pad-top, 0px);'
+ ' padding-bottom: var(--zg-status-bar-pad-bottom, 0px); }',
'.zengrinder-status-bar.zg-powerline .zg-pl-seg.zg-pl-blank { padding-inline: 0; }',
'.zg-pl-space, .zg-pl-grad { display: inline-block; flex: 0 0 auto; }',
'.zg-fit-hidden.zg-fit-hidden { display: none; }',
'.zg-clock-box { display: inline-block; flex: 0 0 auto; }',
'.zg-clock { display: inline-block;'
+ ' width: var(--zg-clock-size, 0.92em);'
+ ' height: var(--zg-clock-size, 0.92em);'
+ ' vertical-align: -0.1em; transform: none; }',
'@supports (vertical-align: 1cap) {'
+ ' .zg-clock { width: var(--zg-clock-size, 1.2cap);'
+ ' height: var(--zg-clock-size, 1.2cap);'
+ ' vertical-align: calc(0.5cap - var(--zg-clock-size, 1.2cap) / 2'
+ ' - var(--zg-clock-shift, 0em)); } }',
'.zg-obsidian-box { display: inline-block; flex: 0 0 auto; }',
'.zg-obsidian-icon { display: inline-block;'
+ ' width: var(--zg-obsidian-size, 0.8em);'
+ ' height: var(--zg-obsidian-size, 0.8em);'
+ ' vertical-align: -0.05em; transform: none; }',
'@supports (vertical-align: 1cap) {'
+ ' .zg-obsidian-icon { width: var(--zg-obsidian-size, 1.15cap);'
+ ' height: var(--zg-obsidian-size, 1.15cap);'
+ ' vertical-align: calc(0.5cap - var(--zg-obsidian-size, 1.15cap) / 2'
+ ' - var(--zg-obsidian-shift, 0em)); } }',
'.zg-pl-soft.zg-pl-chev-r, .zg-pl-soft.zg-pl-chev-l {'
+ ' width: auto; height: 55%; align-self: center; background: none;'
+ ' transform: none; margin: 0 7px; opacity: 0.45; flex: 0 0 auto;'
+ ' border: 0; display: block;'
+ ' aspect-ratio: var(--zg-pl-sep-aspect, 0.85); }',
'.zengrinder-status-bar.zg-powerline .zg-pl-inner {'
+ ' align-self: stretch; height: 100%; }',
'.zengrinder-status-bar .zg-pl-seg.zg-pl-blank { position: relative; z-index: 1; }',
'.zengrinder-status-bar .zg-pl-flagbg .zg-barbtn-flag.is-set,'
+ ' .zengrinder-status-bar .zg-pl-flagbg .zg-barbtn-flag.is-set'
+ ' .zg-flag { color: inherit; }',
'.zengrinder-status-bar .zg-barbtn-flag.is-draft { color: var(--zg-flag-draft); }',
'.zengrinder-status-bar .zg-barbtn-flag.is-revise { color: var(--zg-flag-revise); }',
'.zengrinder-status-bar .zg-barbtn-flag.is-done { color: var(--zg-flag-done); }',
'.zengrinder-status-bar.zg-powerline .zg-pl-seg.zg-pl-fade { padding: 0; }',
'.zg-pl-seg.zg-pl-fade .zg-pl-inner { display: flex; align-items: stretch; }',
'.zg-pl-seg.zg-pl-fade .zg-pl-grad { height: 100%; }',
'.zg-goal-liquid { position: relative; width: 100%; height: 76px;'
+ ' display: block; border-radius: 8px; overflow: hidden; }',
'.zg-liquid-canvas { display: block; width: 100%; height: 100%;'
+ ' image-rendering: pixelated; }',
'.zg-report-ring .zg-goal { display: block; width: 100%; padding: 0 2px; }',
'.zg-hist-find { position: relative; }',
'.zg-hist-findrow { display: flex; align-items: center; gap: 6px; }',
'.zg-hist-search { flex: 1; font-family: inherit; }',
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
+ ' font-family: inherit; font-variant-numeric: tabular-nums;'
+ ' font-size: var(--zg-h-small);'
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
'.zg-hist-px.is-now.is-added.h0 { fill: var(--zg-add-now-0, #1d5233); }',
'.zg-hist-px.is-now.is-added.h1 { fill: var(--zg-add-now-1, #276c4f); }',
'.zg-hist-px.is-now.is-added.h2 { fill: var(--zg-add-now-2, #358973); }',
'.zg-hist-px.is-now.is-added.h3 { fill: var(--zg-add-now-3, #49a8a2); }',
'.zg-hist-px.is-now.is-added.h4 { fill: var(--zg-add-now-4, #76bfcb); }',
'.zg-hist-px.is-now.is-added.h5 { fill: var(--zg-add-now-5, #b5d6ea); }',
'.zg-hist-px.is-now.is-removed.h0 { fill: var(--zg-del-now-0, #5e1a22); }',
'.zg-hist-px.is-now.is-removed.h1 { fill: var(--zg-del-now-1, #7e2824); }',
'.zg-hist-px.is-now.is-removed.h2 { fill: var(--zg-del-now-2, #a34530); }',
'.zg-hist-px.is-now.is-removed.h3 { fill: var(--zg-del-now-3, #c4683e); }',
'.zg-hist-px.is-now.is-removed.h4 { fill: var(--zg-del-now-4, #dd8e55); }',
'.zg-hist-px.is-now.is-removed.h5 { fill: var(--zg-del-now-5, #f0b67d); }',
'.zg-hist-px.is-now.is-net.h0 { fill: var(--zg-net-now-0, #1b3a63); }',
'.zg-hist-px.is-now.is-net.h1 { fill: var(--zg-net-now-1, #245884); }',
'.zg-hist-px.is-now.is-net.h2 { fill: var(--zg-net-now-2, #2f7ca8); }',
'.zg-hist-px.is-now.is-net.h3 { fill: var(--zg-net-now-3, #3ea5cb); }',
'.zg-hist-px.is-now.is-net.h4 { fill: var(--zg-net-now-4, #5fc9e4); }',
'.zg-hist-px.is-now.is-net.h5 { fill: var(--zg-net-now-5, #8fe5f4); }',
'.zg-hist-zeroed { fill: var(--text-faint); opacity: 0.28; }',
'.zg-hist-grid { fill: var(--background-modifier-border); opacity: 0.8; }',
'.zg-hist-axis { fill: var(--text-muted); }',
'.zg-hist-avgline { fill: var(--zg-hist-avg); }',
'.zg-hist-hit { fill: var(--background-modifier-hover); opacity: 0; }',
'.zg-hist-bargroup.is-hover .zg-hist-hit { opacity: 0.5; }',
'.zg-hist-xwrap { padding-left: 36px; }',
'.zg-hist-xaxis { display: grid; font-size: var(--zg-h-small);'
+ ' line-height: 1;'
+ ' text-align: center; color: var(--text-faint);'
+ ' font-family: inherit; font-variant-numeric: tabular-nums;'
+ ' overflow: hidden; }',
'.zg-hist-readout { min-height: 20px; font-size: var(--zg-h-body);'
+ ' font-family: inherit; font-variant-numeric: tabular-nums;'
+ ' white-space: nowrap;'
+ ' overflow: hidden; text-overflow: ellipsis; }',
'.zg-hist-series { display: flex; flex-wrap: wrap; gap: 4px; }',
'.zg-hist-series { display: flex; flex-wrap: wrap; gap: 4px; }',
'.zg-jar-pct { position: absolute; inset: 0; display: flex;'
+ ' pointer-events: none;'
+ ' align-items: center; justify-content: center;'
+ ' font-family: var(--zg-font, var(--font-text)), var(--font-interface, sans-serif);'
+ ' font-size: 30px; font-weight: 600; line-height: 1;'
+ ' font-variant-numeric: tabular-nums; color: var(--text-normal);'
+ ' text-shadow: 0 2px 3px var(--background-primary), 0 -2px 3px var(--background-primary),'
+ ' 2px 0 3px var(--background-primary), -2px 0 3px var(--background-primary);'
+ ' pointer-events: none; }',
'.zg-jar-pct-text { pointer-events: auto; cursor: pointer; }',
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
rules.push(this.coreFeatureCss());
if (this.textOpt('enableParagraphIndent', false)) {
const ind = 'var(--zg-para-indent)';
const srcLine = 'body.zg-para-indent .markdown-source-view.mod-cm6 .cm-content ';
const prevAll = 'body.zg-para-indent .markdown-reading-view .markdown-preview-view ';
if (this.settings.paragraphIndentMode === 'single') {
rules.push(srcLine + '.zg-para-line { text-indent: ' + ind + '; }');
rules.push(prevAll + 'p { text-indent: ' + ind + '; }');
} else {
rules.push(srcLine + '.zg-para-first { text-indent: ' + ind + '; }');
rules.push(prevAll + 'p + p { text-indent: ' + ind + '; }');
}
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
rules.push('body.zg-font-active .markdown-source-view.mod-cm6 .cm-content,\n' +
'body.zg-font-active .markdown-reading-view .markdown-preview-view ' +
'{ font-family: var(--zg-font), var(--font-text); }');
}
if (this.textOpt('limitLineLength', false)) {
const measure = 'calc(' + Math.max(20, Math.min(200, this.settings.maxLineChars || 64))
+ 'ch + (var(--zg-editor-padding-h) * 2))';
rules.push('body.zg-line-limit .markdown-source-view.mod-cm6 .cm-content ' +
'{ max-width: ' + measure + '; margin-inline: auto; }');
rules.push('body.zg-line-limit .markdown-reading-view .markdown-preview-view ' +
'{ max-width: ' + measure + '; margin-inline: auto; }');
}
if (this.textOpt('justifyText', false)) {
rules.push('.zg-justify .cm-content .cm-line { text-align: justify; text-align-last: left; }');
rules.push('.zg-justify .markdown-preview-view p, .zg-justify .markdown-preview-view li { text-align: justify; }');
}
if (this.textOpt('lineSpacing', 1.5) && this.textOpt('lineSpacing', 1.5) !== 1.5) {
const ls = String(this.textOpt('lineSpacing', 1.5));
rules.push('body .markdown-source-view.mod-cm6 .cm-content { line-height: ' + ls + '; }');
rules.push('body .markdown-reading-view .markdown-preview-view { line-height: ' + ls + '; }');
}
if (this.settings.highlightCurrentLine) {
const isDark = document.body.classList.contains('theme-dark');
const hex = isDark ? this.settings.lineHighlightDarkColor : this.settings.lineHighlightLightColor;
const opacity = this.settings.lineHighlightOpacity != null ? this.settings.lineHighlightOpacity : 0.35;
rules.push('body .markdown-source-view.mod-cm6 .cm-content .cm-active.cm-line ' +
'{ background-color: ' + this.hexToRgba(hex, opacity) + '; }');
}
if (this.settings.dimUnfocusedEnabled) {
const opacity = this.settings.dimOpacity != null ? this.settings.dimOpacity : 0.35;
rules.push('.zg-dim-line, .zg-dim-text { opacity: ' + opacity + '; transition: opacity 0.15s ease; }');
}
if (this.settings.posEnabled || this.settings.checksEnabled) {
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
['noun', this.settings.posNoun, this.settings.posNounColor],
['verb', this.settings.posVerb, this.settings.posVerbColor],
['adj', this.settings.posAdjective, this.settings.posAdjectiveColor],
['adv', this.settings.posAdverb, this.settings.posAdverbColor],
['conj', this.settings.posConjunction, this.settings.posConjunctionColor]
] : [];
for (const entry of pos) {
if (entry[1]) rules.push(paint('zg-pos-' + entry[0], entry[2], posStyle));
}
const ckStyle = this.settings.checkStyle || 'squiggle';
const checks = this.settings.checksEnabled ? [
['filler', this.settings.checkFiller, this.settings.checkFillerColor],
['passive', this.settings.checkPassive, this.settings.checkPassiveColor],
['illusion', this.settings.checkIllusion, this.settings.checkIllusionColor],
['misused', this.settings.checkMisused, this.settings.checkMisusedColor],
['pronoun', this.settings.checkPronoun, this.settings.checkPronounColor]
] : [];
checks.push(['repeat', this.settings.checkRepetition, this.settings.checkRepetitionColor]);
if (this.settings.checksEnabled) {
checks.push(['dialogue', this.settings.checkDialogue, this.settings.checkDialogueColor]);
}
for (const entry of checks) {
if (entry[1]) rules.push(paint('zg-ck-' + entry[0], entry[2], ckStyle));
}
if (this.settings.checksEnabled && this.settings.checkRhythm) {
rules.push(paint('zg-ck-hard', this.settings.checkRhythmHardColor, 'highlight'));
rules.push(paint('zg-ck-veryhard', this.settings.checkRhythmVeryHardColor, 'highlight'));
}
if (this.settings.posEnabled && this.settings.posDimOthers) {
rules.push('body.zg-pos-dim .markdown-source-view.mod-cm6 .cm-content .cm-line { color: var(--text-faint); }');
}
if (this.settings.checksEnabled && this.settings.checkDimOthers) {
rules.push('body.zg-ck-dim .markdown-source-view.mod-cm6 .cm-content .cm-line { color: var(--text-faint); }');
if (ckStyle !== 'text') {
const lit = [];
for (const entry of checks) if (entry[1]) lit.push('zg-ck-' + entry[0]);
if (this.settings.checkRhythm) { lit.push('zg-ck-hard'); lit.push('zg-ck-veryhard'); }
if (lit.length) {
rules.push(lit
.map(c => 'body.zg-ck-dim .markdown-source-view.mod-cm6 .cm-content .cm-line .' + c)
.join(', ') + ' { color: var(--text-normal); }');
}
}
}
}
const cssText = rules.join('\n');
this.styleEl.textContent = cssText;
try {
if (document.head.lastElementChild !== this.styleEl) {
document.head.appendChild(this.styleEl);
}
} catch (_) { zgCatch('updateStyleEl: if (document.head.lastElementChild !== this.styleEl)', _); }
if (this.textOpt('enableParagraphIndent', false)
&& this.settings.paragraphIndentMode !== 'single') {
} else {
}
}
removeStyleEl() {
if (this.styleEl) { this.styleEl.remove(); this.styleEl = null; }
}
async toggleSetting(key, ensurePos) {
this.settings[key] = !this.settings[key];
if (ensurePos && this.settings[key]) this.settings.posEnabled = true;
await this.saveSettings(true);
}
async toggleZen() {
if (this._isTogglingZen) return;
this._isTogglingZen = true;
try {
if (!this.settings.pluginEnabled) this.settings.pluginEnabled = true;
const entering = !this.zenActive();
if (entering) {
this.settings.zenEnabled = true;
this.settings.zenMode = true;
if (this.settings.focusedFileMode) await this.revealPinnedTabIfExists();
if (this.settings.fullscreen && document.documentElement.requestFullscreen) {
try {
await document.documentElement.requestFullscreen();
await new Promise(r => requestAnimationFrame(r));
} catch (_) { zgCatch('toggleZen: await document.documentElement.requestFullscreen();', _); }
}
} else {
if (document.fullscreenElement && document.exitFullscreen) {
try {
await document.exitFullscreen();
await new Promise(r => requestAnimationFrame(r));
} catch (_) { zgCatch('toggleZen: await document.exitFullscreen();', _); }
}
this.settings.zenEnabled = false;
}
await this.saveSettings(true);
} finally {
this._isTogglingZen = false;
}
}
toggleZenFromBar() { return this.toggleZen(); }
toggleZenMode() { return this.toggleZen(); }
async toggleFullPlugin() {
const next = !this.settings.pluginEnabled;
if (!next && this.zenActive()) {
await this.toggleZen();
}
this.settings.pluginEnabled = next;
await this.saveSettings(true);
}
updateWsRibbonState() {
if (!this.wsRibbonEl) return;
this.wsRibbonEl.classList.toggle('is-disabled', !this.settings.pluginEnabled);
}
zenOn() {
return !!(this.settings.zenEnabled && this.settings.zenMode);
}
quickPanelSplit(leaf) {
const ws = this.app.workspace;
const root = (leaf && leaf.getRoot) ? leaf.getRoot() : null;
if (root === ws.leftSplit) return ws.leftSplit;
if (root === ws.rightSplit) return ws.rightSplit;
const host = leaf && leaf.containerEl;
if (host) {
for (const split of [ws.leftSplit, ws.rightSplit]) {
if (split && split.containerEl && split.containerEl.contains(host)) return split;
}
}
return null;
}
quickCycleCurrentLeaf() {
const ws = this.app.workspace;
const active = document.activeElement;
let found = null;
if (active) {
try {
ws.iterateAllLeaves(leaf => {
if (found || !leaf.containerEl) return;
if (leaf.containerEl.contains(active)) found = leaf;
});
} catch (_) { zgCatch('quickCycleCurrentLeaf: ws.iterateAllLeaves(leaf =>', _); }
}
if (found) return found;
if (this._quickCycleHere && this._quickCycleHere.containerEl
&& this._quickCycleHere.containerEl.ownerDocument === document) {
const r = this._quickCycleHere.containerEl.getBoundingClientRect();
if (r.width > 0 && r.height > 0) return this._quickCycleHere;
}
return ws.activeLeaf || ws.getMostRecentLeaf() || null;
}
quickCycleVisibleLeaves() {
const out = [];
try {
this.app.workspace.iterateAllLeaves(leaf => {
const el = leaf && leaf.containerEl;
if (!el || el.ownerDocument !== document) return;
const r = el.getBoundingClientRect();
if (r.width < 1 || r.height < 1) return;
out.push({ leaf, r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
});
} catch (_) { zgCatch('quickCycleVisibleLeaves: this.app.workspace.iterateAllLeaves(leaf =>', _); }
return out;
}
quickCycleTarget(dir) {
const cur = this.quickCycleCurrentLeaf();
const host = cur && cur.containerEl;
if (!host) return null;
const from = host.getBoundingClientRect();
const fx = from.left + from.width / 2, fy = from.top + from.height / 2;
const horizontal = (dir === 'left' || dir === 'right');
const lo = horizontal ? from.top : from.left;
const hi = horizontal ? from.bottom : from.right;
let best = null, bestScore = Infinity, bestOverlaps = false;
for (const c of this.quickCycleVisibleLeaves()) {
if (c.leaf === cur) continue;
const dx = c.cx - fx, dy = c.cy - fy;
const along = dir === 'left' ? -dx : dir === 'right' ? dx
: dir === 'up' ? -dy : dy;
if (along <= 4) continue;
const cLo = horizontal ? c.r.top : c.r.left;
const cHi = horizontal ? c.r.bottom : c.r.right;
const overlaps = Math.min(hi, cHi) - Math.max(lo, cLo) > 4;
const across = horizontal ? Math.abs(dy) : Math.abs(dx);
const score = overlaps ? along : along + across * 2;
if (overlaps && !bestOverlaps) { bestOverlaps = true; bestScore = score; best = c.leaf; continue; }
if (!overlaps && bestOverlaps) continue;
if (score < bestScore) { bestScore = score; best = c.leaf; }
}
return best;
}
quickCycleSidebarLeaves(split) {
const out = [];
if (!split || !split.containerEl) return out;
try {
this.app.workspace.iterateAllLeaves(leaf => {
if (leaf.containerEl && split.containerEl.contains(leaf.containerEl)) out.push(leaf);
});
} catch (_) { zgCatch('quickCycleSidebarLeaves: this.app.workspace.iterateAllLeaves(leaf =>', _); }
return out;
}
async quickCycleEnterSidebar(side) {
const ws = this.app.workspace;
const split = side === 'left' ? ws.leftSplit : ws.rightSplit;
if (!split || !split.collapsed) return false;
const leaves = this.quickCycleSidebarLeaves(split);
if (!leaves.length) return false;
const remembered = this._quickCycleLast && this._quickCycleLast.get(split);
let target = (remembered && leaves.indexOf(remembered) !== -1) ? remembered : null;
if (!target) {
try {
for (const group of (split.children || [])) {
const kids = group && group.children;
if (!kids || !kids.length) continue;
const at = typeof group.currentTab === 'number' ? group.currentTab : 0;
const cand = kids[at] || kids[0];
if (cand && leaves.indexOf(cand) !== -1) { target = cand; break; }
}
} catch (_) { zgCatch('quickCycleEnterSidebar: for (const group of (split.children || []))', _); }
}
if (!target) target = leaves[0];
await this.quickCycleFocus(target);
return true;
}
focusLeafDom(leaf) {
const view = leaf && leaf.view;
const root = (view && view.containerEl) || (leaf && leaf.containerEl);
if (!root) return false;
const doc = root.ownerDocument || document;
const took = (el) => {
if (!el || typeof el.focus !== 'function') return false;
const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
if (r && (r.width < 1 || r.height < 1)) return false;
const FOCUSABLE = /^(INPUT|TEXTAREA|BUTTON|SELECT|A)$/;
if (!el.hasAttribute('tabindex') && !FOCUSABLE.test(el.tagName || '')) {
el.setAttribute('tabindex', '-1');
}
try { el.focus({ preventScroll: true }); } catch (_) {
try { el.focus(); } catch (_) { zgCatch('focusLeafDom / took: el.focus();', _); }
}
return doc.activeElement === el || root.contains(doc.activeElement);
};
const attempt = () => {
let list = [];
try { list = Array.from(root.querySelectorAll('[tabindex]')); } catch (_) { zgCatch('focusLeafDom / attempt: list = Array.from(root.querySelectorAll(\'[tabindex]\'));', _); }
for (const el of list) if (took(el)) return list.length;
return list.length;
};
if (attempt() > 0) return true;
const parked = (view && view.contentEl && took(view.contentEl)) || took(root);
const reaim = () => {
if (!root.contains(doc.activeElement)) return;
attempt();
};
try { window.requestAnimationFrame(reaim); } catch (_) { zgCatch('focusLeafDom: window.requestAnimationFrame(reaim);', _); }
window.setTimeout(reaim, 60);
return parked;
}
async revealAndFocusLeaf(leaf) {
const ws = this.app.workspace;
try { await ws.revealLeaf(leaf); } catch (_) { zgCatch('revealAndFocusLeaf: await ws.revealLeaf(leaf);', _); }
let landed = false;
try {
ws.setActiveLeaf(leaf, { focus: true });
const host = leaf.containerEl;
landed = !!(host && host.ownerDocument
&& host.contains(host.ownerDocument.activeElement));
} catch (_) { zgCatch('revealAndFocusLeaf: ws.setActiveLeaf(leaf, focus: true );', _); }
if (landed) return;
if (this.focusLeafDom(leaf)) return;
}
quickCycleVimKey(e) {
if (!this.settings.quickCycle || !this.isVimKeysOn()) return;
if (e.altKey || e.ctrlKey || e.metaKey) return;
const MAP = { h: 'ArrowLeft', j: 'ArrowDown', k: 'ArrowUp', l: 'ArrowRight' };
const arrow = MAP[e.key];
if (!arrow) return;
const target = e.target;
if (!target) return;
const tag = target.tagName || '';
if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
if (target.isContentEditable) return;
let leaf = null;
try {
this.app.workspace.iterateAllLeaves(l => {
if (leaf || !l.containerEl) return;
if (l.containerEl.contains(target)) leaf = l;
});
} catch (_) { zgCatch('quickCycleVimKey: this.app.workspace.iterateAllLeaves(l =>', _); }
if (!leaf) {
const here = this._quickCycleHere;
const host = here && here.containerEl;
if (!host || !this.quickPanelSplit(here)) return;
const r = host.getBoundingClientRect();
if (r.width < 1 || r.height < 1) return;
leaf = here;
}
if (!this.quickPanelSplit(leaf)) return;
e.preventDefault();
e.stopPropagation();
const win = (target.ownerDocument && target.ownerDocument.defaultView) || window;
if (!win || typeof win.KeyboardEvent !== 'function') return;
target.dispatchEvent(new win.KeyboardEvent('keydown', {
key: arrow, code: arrow, bubbles: true, cancelable: true
}));
}
revealInSidebarView(leaf) {
const type = leaf && leaf.view && leaf.view.getViewType && leaf.view.getViewType();
if (type !== 'file-explorer') return;
if (!this.app.workspace.getActiveFile()) return;
try { this.app.commands.executeCommandById('file-explorer:reveal-active-file'); } catch (_) { zgCatch('revealInSidebarView: this.app.commands.executeCommandById(\'file-explorer:reveal-active-file …', _); }
}
async quickCycleFocus(leaf) {
const ws = this.app.workspace;
const split = this.quickPanelSplit(leaf);
if (split) {
if (!this._quickCycleLast) this._quickCycleLast = new Map();
this._quickCycleLast.set(split, leaf);
}
await this.revealAndFocusLeaf(leaf);
this.revealInSidebarView(leaf);
this._quickCycleHere = leaf;
void ws;
}
quickCycleCloseBehind(fromSplit, target) {
if (!fromSplit || !this.settings.quickCycleCloseOnLeave) return;
if (target && this.quickPanelSplit(target) === fromSplit) return;
try { if (!fromSplit.collapsed) fromSplit.collapse(); } catch (_) { zgCatch('quickCycleCloseBehind: if (!fromSplit.collapsed) fromSplit.collapse();', _); }
}
async quickCycleMove(dir) {
const ws = this.app.workspace;
const cur = this.quickCycleCurrentLeaf();
const fromSplit = cur ? this.quickPanelSplit(cur) : null;
if ((dir === 'up' || dir === 'down') && cur) {
const split = this.quickPanelSplit(cur);
if (split) {
const leaves = this.quickCycleSidebarLeaves(split);
const at = leaves.indexOf(cur);
const next = leaves[at + (dir === 'down' ? 1 : -1)];
if (at !== -1) { if (next) await this.quickCycleFocus(next); return; }
}
}
const target = this.quickCycleTarget(dir);
if (target) {
await this.quickCycleFocus(target);
this.quickCycleCloseBehind(fromSplit, target);
return;
}
if (dir === 'left' || dir === 'right') {
const entered = await this.quickCycleEnterSidebar(dir);
if (entered) this.quickCycleCloseBehind(fromSplit, this.quickCycleCurrentLeaf());
}
void ws;
}
sidebarSideFor(viewType) {
return (viewType === 'outline' || viewType === 'backlink') ? 'right' : 'left';
}
async openSidebarPanel(viewType) {
const ws = this.app && this.app.workspace;
if (!ws || !ws.getLeavesOfType) return;
let leaf = null;
try { leaf = ws.getLeavesOfType(viewType)[0] || null; } catch (_) { return; }
if (leaf) {
const split = this.quickPanelSplit(leaf);
const host = leaf.containerEl || (leaf.view && leaf.view.containerEl);
if (split && !split.collapsed && host && host.offsetHeight > 0) {
split.collapse();
return;
}
}
if (!leaf) {
const right = this.sidebarSideFor(viewType) === 'right';
const side = right ? ws.getRightLeaf(false) : ws.getLeftLeaf(false);
if (!side) return;
leaf = side;
try { await leaf.setViewState({ type: viewType, active: true }); } catch (_) { return; }
}
try { await ws.revealLeaf(leaf); } catch (_) { zgCatch('openSidebarPanel: await ws.revealLeaf(leaf);', _); }
this.revealInSidebarView(leaf);
}
async toggleQuickPanel(viewType) {
const ws = this.app.workspace;
let leaf = ws.getLeavesOfType(viewType)[0] || null;
if (leaf) {
const split = this.quickPanelSplit(leaf);
const host = leaf.containerEl || (leaf.view && leaf.view.containerEl);
const shown = split && !split.collapsed && host && host.offsetHeight > 0;
if (shown) {
split.collapse();
return;
}
}
if (!leaf) {
const side = this.sidebarSideFor(viewType) === 'right'
? ws.getRightLeaf(false) : ws.getLeftLeaf(false);
if (!side) return;
leaf = side;
try { await leaf.setViewState({ type: viewType, active: true }); } catch (_) { return; }
}
await this.revealAndFocusLeaf(leaf);
}
setSidebarVisibility() {
const on = this.zenOn();
if (on === this._wasZenMode) return;
const ws = this.app.workspace;
if (!ws.leftSplit || !ws.rightSplit) return;
if (!on) {
if (!this.settings.leftSidebar) ws.leftSplit.expand();
if (!this.settings.rightSidebar) ws.rightSplit.expand();
} else {
this.settings.rightSidebar = ws.rightSplit.collapsed;
this.settings.leftSidebar = ws.leftSplit.collapsed;
if (!ws.leftSplit.collapsed) ws.leftSplit.collapse();
if (!ws.rightSplit.collapsed) ws.rightSplit.collapse();
}
this._wasZenMode = on;
}
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
this._suspendedLeft = !!ws.leftSplit.collapsed;
this._suspendedRight = !!ws.rightSplit.collapsed;
if (ws.leftSplit.collapsed) ws.leftSplit.expand();
if (ws.rightSplit.collapsed) ws.rightSplit.expand();
} else {
if (this._suspendedLeft) ws.leftSplit.collapse();
if (this._suspendedRight) ws.rightSplit.collapse();
}
} catch (_) { zgCatch('syncSurfaceSidebars: if (suspend)', _); }
}
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
} catch (_) { zgCatch('revealPinnedTabIfExists: const leaves = this.app.workspace.getLeavesOfType(\'markdown\');', _); }
}
_focusTabRemember(el) {
if (!this._focusTabPrev) this._focusTabPrev = new Map();
if (this._focusTabPrev.has(el)) return;
const s = el.style;
this._focusTabPrev.set(el, {
display: s.display,
width: s.width,
flexGrow: s.flexGrow,
flexShrink: s.flexShrink,
flexBasis: s.flexBasis
});
}
_focusTabRestore() {
if (!this._focusTabPrev || !this._focusTabPrev.size) return;
for (const [el, prev] of this._focusTabPrev) {
el.classList.remove('zenmode-tab-hidden', 'zenmode-tab-active');
el.style.display = prev.display;
el.style.width = prev.width;
el.style.flexGrow = prev.flexGrow;
el.style.flexShrink = prev.flexShrink;
el.style.flexBasis = prev.flexBasis;
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
updateWorkspaceAesthetics() {
if (!this.settings.pluginEnabled) return;
this.updateStatusBar();
this.updateRetroStatusBar();
if (this.textOpt('enableParagraphIndent', false)
&& this.settings.paragraphIndentMode !== 'single') {
}
const scoped = this.isActiveFileInScope();
if (this.letterboxActive() && scoped) {
this.buildMaskElements();
} else {
this.removeMaskElements();
}
if (((this.settings.enableTypewriter || this.letterboxActive()) && scoped) || this.retroBarActive()) {
this.attachScrollHandler();
this.attachResizeHandler();
this.scheduleMaskPosition();
} else {
this.detachScrollHandler();
this.detachResizeHandler();
}
}
removeMaskElements() {
for (const el of [this.maskTopEl, this.maskBottomEl, this.arrowsTopEl, this.arrowsBottomEl,
this.maskGuardLeftEl, this.maskGuardRightEl]) {
if (el) el.remove();
}
this.maskTopEl = this.maskBottomEl = this.arrowsTopEl = this.arrowsBottomEl = null;
this.maskGuardLeftEl = this.maskGuardRightEl = null;
document.documentElement.style.setProperty('--zg-scroller-pad-top', '0px');
document.documentElement.style.setProperty('--zg-scroller-pad-bottom', '0px');
if (this.maskResizeObserver) { this.maskResizeObserver.disconnect(); this.maskResizeObserver = null; }
}
barIsHidden() {
if (!this.retroBarActive()) return false;
if (this.settings.retroBarHidden) return true;
return !!(this.settings.zenHideBar && this.zenActive());
}
wsOwnViewActive() {
try {
const leaf = this.app.workspace.activeLeaf;
const t = leaf && leaf.view && leaf.view.getViewType ? leaf.view.getViewType() : null;
if (!t) return false;
for (const k of Object.keys(WS_PANE_VIEWS)) if (WS_PANE_VIEWS[k] === t) return true;
return false;
} catch (_) { zgCatch('wsOwnViewActive: const leaf = this.app.workspace.activeLeaf;', _); return false; }
}
retroBarActive() {
if (!this.settings.enableRetroStatus) return false;
if (this.isActiveFileInScope()) return true;
return !!(this.wsOwnViewActive() && this.isFileInScope(this.activeNoteFile()));
}
updateStatusBar() {
const wantBar = this.retroBarActive();
if (wantBar && !this.retroStatusBarEl) {
this.retroStatusBarEl = document.body.createEl('div', { cls: 'zengrinder-status-bar' });
this.retroPlinthEl = document.body.createEl('div', { cls: 'zg-bar-plinth' });
this.startClockTick();
} else if (!wantBar && this.retroStatusBarEl) {
this.retroStatusBarEl.remove();
this.retroStatusBarEl = null;
if (this.retroPlinthEl) { this.retroPlinthEl.remove(); this.retroPlinthEl = null; }
this.stopClockTick();
}
if (this.retroStatusBarEl) {
const bwSet = Math.max(1, Math.min(8, this.settings.statusBarBorderWidth || 2));
const stSet = this.barBorderStyle();
const onTop = stSet !== 'none' && this.settings.statusBarBorderTop !== false;
const onBot = stSet !== 'none' && this.settings.statusBarBorderBottom !== false;
const S = this.retroStatusBarEl.style;
S.setProperty('--zg-bar-rule-top-width', onTop ? bwSet + 'px' : '0px');
S.setProperty('--zg-bar-rule-bottom-width', onBot ? bwSet + 'px' : '0px');
S.setProperty('--zg-bar-rule-style', (onTop || onBot) ? stSet : 'none');
this.retroStatusBarEl.style.boxShadow = '';
this.retroStatusBarEl.style.borderTopWidth = '0';
this.retroStatusBarEl.style.borderTopStyle = 'none';
this.retroStatusBarEl.style.borderTopColor = 'var(--zg-text)';
this.retroStatusBarEl.style.borderBottomWidth = '0';
this.retroStatusBarEl.style.borderBottomStyle = 'none';
this.retroStatusBarEl.style.borderBottomColor = 'var(--zg-text)';
this.scheduleMaskPosition();
if (this.maskResizeObserver) {
try { this.maskResizeObserver.observe(this.retroStatusBarEl); } catch (_) { zgCatch('updateStatusBar: this.maskResizeObserver.observe(this.retroStatusBarEl);', _); }
}
}
document.body.classList.toggle('zg-retrobar-active', !!this.retroStatusBarEl);
this.applyNativeStatusBarVisibility(this.shouldHideNativeStatusBar());
this.applyCssVariables();
}
startClockTick() {
if (this.clockInterval) return;
this.clockInterval = this.registerInterval(window.setInterval(() => {
this.refreshBattery();
this.updateRetroStatusBar();
}, 15000));
}
stopClockTick() {
if (this.clockInterval) { window.clearInterval(this.clockInterval); this.clockInterval = null; }
}
refreshBattery() {
if (this.readBatteryFromOS()) return;
const bm = this._batteryManager;
if (!bm) return;
try {
if (typeof bm.level === 'number') this.batteryLevel = Math.round(bm.level * 100);
this.batteryCharging = !!bm.charging;
} catch (_) { zgCatch('refreshBattery: if (typeof bm.level === \'number\') this.batteryLevel = …', _); }
}
readBatteryFromOS() {
if (this._batteryOSOff) return false;
try {
if (Platform && Platform.isDesktopApp === false) { this._batteryOSOff = true; return false; }
if (typeof process === 'undefined' || process.platform !== 'linux') {
this._batteryOSOff = true; return false;
}
const fs = require('fs');
const base = this._batteryBase || '/sys/class/power_supply';
if (this._batteryPath === undefined) {
this._batteryPath = null;
for (const name of fs.readdirSync(base)) {
let kind = '';
try { kind = String(fs.readFileSync(base + '/' + name + '/type', 'utf8')).trim(); } catch (_) { zgCatch('readBatteryFromOS: kind = String(fs.readFileSync(base + \'/\' + name + \'/type\', …', _); }
if (kind !== 'Battery') continue;
if (!fs.existsSync(base + '/' + name + '/capacity')) continue;
this._batteryPath = base + '/' + name;
break;
}
}
if (!this._batteryPath) { this._batteryOSOff = true; return false; }
const pct = parseInt(String(fs.readFileSync(this._batteryPath + '/capacity', 'utf8')).trim(), 10);
if (!isFinite(pct)) return false;
this.batteryLevel = Math.max(0, Math.min(100, pct));
let state = '';
try { state = String(fs.readFileSync(this._batteryPath + '/status', 'utf8')).trim(); } catch (_) { zgCatch('readBatteryFromOS: state = String(fs.readFileSync(this._batteryPath + \'/status\', …', _); }
this.batteryCharging = state === 'Charging';
return true;
} catch (_) {
this._batteryOSOff = true;
return false;
}
}
async setupBattery() {
if (this.readBatteryFromOS()) this.updateRetroStatusBar();
if (!navigator.getBattery) return;
try {
const bm = await navigator.getBattery();
const update = () => {
this.refreshBattery();
this.updateRetroStatusBar();
};
this._batteryManager = bm;
this._batteryHandler = update;
bm.addEventListener('levelchange', update);
bm.addEventListener('chargingchange', update);
update();
} catch (_) { zgCatch('setupBattery: const bm = await navigator.getBattery();', _); }
}
formatBattery() {
if (this.batteryLevel === null) return '?%';
return (this.batteryCharging ? '⚡︎' : '') + this.batteryLevel + '%';
}
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
dateParts(now) {
const yyyy = String(now.getFullYear());
return {
dd: String(now.getDate()).padStart(2, '0'),
mm: String(now.getMonth() + 1).padStart(2, '0'),
yyyy: yyyy,
yy: yyyy.slice(-2),
hh: String(now.getHours()).padStart(2, '0'),
mi: String(now.getMinutes()).padStart(2, '0')
};
}
buildObsidianIcon() {
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('class', 'zg-obsidian-icon');
svg.setAttribute('viewBox', '0 0 24 24');
const p = document.createElementNS(NS, 'path');
p.setAttribute('d', OBSIDIAN_ICON_PATH);
p.setAttribute('fill', 'currentColor');
svg.appendChild(p);
const box = document.createElement('span');
box.className = 'zg-obsidian-box';
box.appendChild(svg);
return box;
}
buildClockFace(now) {
const t = now || new Date();
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('class', 'zg-clock');
svg.setAttribute('viewBox', '0 0 24 24');
svg.setAttribute('fill', 'none');
svg.setAttribute('stroke', 'currentColor');
svg.setAttribute('stroke-width', '2');
svg.setAttribute('stroke-linecap', 'round');
const ring = document.createElementNS(NS, 'circle');
ring.setAttribute('cx', '12');
ring.setAttribute('cy', '12');
ring.setAttribute('r', '9');
svg.appendChild(ring);
const mins = t.getMinutes();
const hours = t.getHours() % 12 + mins / 60;
const hand = (angleDeg, length) => {
const a = (angleDeg - 90) * Math.PI / 180;
const l = document.createElementNS(NS, 'line');
l.setAttribute('x1', '12');
l.setAttribute('y1', '12');
l.setAttribute('x2', (12 + Math.cos(a) * length).toFixed(2));
l.setAttribute('y2', (12 + Math.sin(a) * length).toFixed(2));
svg.appendChild(l);
};
hand(hours * 30, 4);
hand(mins * 6, 6.5);
svg.setAttribute('aria-label', this.formatTime(t));
const box = document.createElement('span');
box.className = 'zg-clock-box';
box.appendChild(svg);
return box;
}
formatTime(now) {
const p = this.dateParts(now);
return p.hh + ':' + p.mi;
}
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
const isOff = v => v === false || /^(false|off|no)$/i.test(String(v));
const isOn = v => v === true || /^(true|on|yes)$/i.test(String(v));
const add = (k, v) => { (out = out || {})[k] = v; };
if ('wordsmith' in fm) add('__disabled', isOff(fm.wordsmith));
const MAP = {
'ws-zen': 'zenMode',
'ws-typewriter': 'enableTypewriter',
'ws-hemingway': 'hemingwayEnabled',
'ws-syntax': 'posEnabled',
'ws-markers': 'showHiddenMarkers',
'ws-typography': 'typographyEnabled'
};
for (const key in MAP) {
if (!(key in fm)) continue;
if (isOn(fm[key])) add(MAP[key], true);
else if (isOff(fm[key])) add(MAP[key], false);
}
if ('ws-font' in fm) add('editorFont', String(fm['ws-font'] || '').trim());
}
this._fmCache[file.path] = out;
return out;
}
optFor(file, key) {
const o = this.getOverrides(file);
if (o && Object.prototype.hasOwnProperty.call(o, key)) return o[key];
return this.settings[key];
}
opt(key) {
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
return this.optFor(view ? view.file : null, key);
}
optForView(cmView, key) {
return this.optFor(this.getFileForEditorView(cmView), key);
}
zenActive() {
if (!this.isNoteSurfaceActive()) return false;
return !!(this.opt('zenEnabled') && this.opt('zenMode'));
}
letterboxActive() {
if (!this.settings.enableLetterbox) return false;
return !this.isReadingView();
}
isReadingView() {
try {
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (!view) return false;
const mode = view.getMode ? view.getMode() : null;
return mode === 'preview';
} catch (_) { return false; }
}
textOpt(key, whenOff) {
if (!this.settings.miscEnabled) return whenOff;
return this.settings[key];
}
markerOpt(key, whenOff) {
if (!this.settings.markersEnabled) return whenOff;
return this.settings[key];
}
isRightToLeft() {
try {
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (view && view.editor && view.editor.cm && view.editor.cm.contentDOM) {
const dir = view.editor.cm.contentDOM.getAttribute('dir');
if (dir) return dir === 'rtl';
}
} catch (_) { }
try {
if (this.app.vault.getConfig) return !!this.app.vault.getConfig('rightToLeft');
} catch (_) { zgCatch('isRightToLeft: if (this.app.vault.getConfig) return …', _); }
return false;
}
isNoteSurfaceActive() {
try {
const ws = this.app.workspace;
if (ws.getActiveViewOfType && ws.getActiveViewOfType(MarkdownView)) return true;
let leaf = null;
try { leaf = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : null; } catch (_) { zgCatch('isNoteSurfaceActive: leaf = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : null;', _); }
if (!leaf) leaf = ws.activeLeaf || null;
const view = leaf && leaf.view;
if (!view) return false;
const type = view.getViewType ? view.getViewType() : '';
if (type === WS_MENU_VIEW) {
return !!this.activeNoteFile();
}
return type === 'markdown' || type === 'empty';
} catch (_) { return true; }
}
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
countExcludeList() {
const s = this.settings;
if (!Array.isArray(s.countExclude)) s.countExclude = [];
return s.countExclude;
}
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
flagDefs() {
const stored = Array.isArray(this.settings.flags) ? this.settings.flags : [];
return ZG_STATE_IDS.map((id, i) => {
const was = stored.filter(f => f && f.id === id)[0] || {};
const def = (DEFAULT_SETTINGS.flags || [])[i] || {};
return {
id,
label: String(was.label || def.label || id),
shape: was.shape || def.shape || 'pennant',
light: was.light || def.light || '#888888',
dark: was.dark || def.dark || '#888888'
};
});
}
flagCount() {
const n = Number(this.settings.flagCount);
if (!isFinite(n) || n < 0) return ZG_STATE_IDS.length;
return Math.min(ZG_STATE_IDS.length, Math.floor(n));
}
flagsApply() {
const defs = this.flagDefs();
ZG_STATUSES = defs.slice(0, this.flagCount())
.map(f => ({ id: f.id, label: f.label, shape: f.shape }));
let dark = true;
try { dark = document.body.classList.contains('theme-dark'); } catch (_) { zgCatch('flagsApply: dark = document.body.classList.contains(\'theme-dark\');', _); }
try {
const root = document.body;
for (const f of defs) {
root.style.setProperty('--zg-flag-' + f.id, dark ? f.dark : f.light);
}
root.style.setProperty('--zg-flag-ink', dark ? '#1b1b1b' : '#ffffff');
} catch (_) { zgCatch('flagsApply: const root = document.body;', _); }
try {
const stamp = JSON.stringify(
ZG_STATUSES.map((st) => [st.id, st.shape, st.label]));
if (this._flagStamp !== stamp) {
this._flagStamp = stamp;
if (this.explorerWanted()) this.scheduleExplorerPatch();
}
} catch (_) { zgCatch('flagsApply: const stamp = JSON.stringify(', _); }
}
fileMenuReportRow(menu, path) {
if (!path) return;
menu.addItem((i) => i.setTitle('Report on this').setIcon('bar-chart-2')
.onClick(() => { try { this.openReportModal(path); } catch (_) { zgCatch('fileMenuReportRow: this.openReportModal(path);', _); } }));
}
fileMenuFor(menu, file) {
if (!file || !file.path) return;
const isFolder = !!file.children;
if (file.path === '/' || file.path === '') return;
const path = file.path;
this.fileMenuReportRow(menu, path);
try { this.fileMenuOrganizerRows(menu, file); } catch (_) { zgCatch('fileMenuFor: this.fileMenuOrganizerRows(menu, file);', _); }
const store = 'fileStatus';
const nowFlag = (this.settings[store] || {})[path] || '';
const setFlag = async (id) => {
const all = Object.assign({}, this.settings[store] || {});
if (id) all[path] = id; else delete all[path];
this.settings[store] = all;
await this.saveSettings(true);
try { this.patchExplorerDOM(); } catch (_) { zgCatch('fileMenuFor / setFlag: this.patchExplorerDOM();', _); }
};
const flagRows = (into) => {
for (const st of ZG_STATUSES) {
into.addItem((i) => {
const frag = document.createDocumentFragment();
const mark = document.createElement('span');
mark.className = 'zg-menuflag is-' + st.id;
mark.innerHTML = zgFlagSvg(st.id, 12);
frag.appendChild(mark);
frag.appendChild(document.createTextNode(st.label));
i.setTitle(frag);
i.setChecked(nowFlag === st.id);
i.onClick(() => setFlag(st.id));
});
}
into.addItem((i) => i.setTitle('No flag').setChecked(!nowFlag)
.onClick(() => setFlag('')));
};
const nowColour = (this.settings.folderColors || {})[path] || '';
const colourRow = (into) => {
into.addItem((i) => {
const frag = document.createDocumentFragment();
const row = document.createElement('span');
row.className = 'zg-folderdots';
for (const c of ZG_FOLDER_COLOURS) {
const dot = document.createElement('span');
dot.className = 'zg-folderdot' + (c.id ? '' : ' is-none')
+ (nowColour === c.id ? ' is-on' : '');
if (c.css) dot.style.backgroundColor = c.css;
dot.setAttribute('aria-label', c.label);
dot.title = c.label;
dot.addEventListener('click', async (ev2) => {
ev2.preventDefault();
ev2.stopPropagation();
const all = Object.assign({}, this.settings.folderColors || {});
if (c.id) all[path] = c.id; else delete all[path];
this.settings.folderColors = all;
await this.saveSettings();
try { this.patchExplorerDOM(); } catch (_) { zgCatch('fileMenuFor / colourRow: this.patchExplorerDOM();', _); }
try { this.treeOrderChanged(); } catch (_) { zgCatch('fileMenuFor / colourRow: this.treeOrderChanged();', _); }
try { menu.hide(); } catch (_) { zgCatch('fileMenuFor / colourRow: menu.hide();', _); }
});
row.appendChild(dot);
}
frag.appendChild(row);
i.setTitle(frag);
});
};
const folded = (title, icon, fill) => {
menu.addItem((i) => {
i.setTitle(title);
try { if (i.setIcon) i.setIcon(icon); } catch (_) { zgCatch('fileMenuFor / folded: if (i.setIcon) i.setIcon(icon);', _); }
let sub = null;
try { if (typeof i.setSubmenu === 'function') sub = i.setSubmenu(); } catch (_) { zgCatch('fileMenuFor / folded: if (typeof i.setSubmenu === \'function\') sub = i.setSubmenu();', _); }
if (sub) fill(sub);
else { i.setIsLabel(true); fill(menu); }
});
};
if (isFolder) folded('Folder colour', 'palette', colourRow);
if (!isFolder && ZG_STATUSES.length) folded('Flag', 'flag', flagRows);
}
isStoreFile(path) {
if (!path) return false;
try {
if (path === this._historyPath) return true;
if (path === this.structurePathNow()) return true;
if (path === this.goalsFilePath()) return true;
if (path === this.settingsMirrorPathFor()) return true;
} catch (_) { zgCatch('isStoreFile: if (path === this._historyPath) return true;', _); }
return false;
}
isFileCounted(file) {
if (!file || !file.path) return false;
if (this._historyPath && file.path === this._historyPath) return false;
if (this.isStoreFile(file.path)) return false;
if (!this.isFileInScope(file)) return false;
return !this.isPathExcludedFromCounts(file.path);
}
pathMatchesScope(path) {
if (!path) return false;
for (const entry of this.settings.scopePaths) {
if (!entry) continue;
if (entry === '/') return true;
if (path === entry) return true;
if (path.startsWith(entry.endsWith('/') ? entry : entry + '/')) return true;
}
return false;
}
isFileInScope(file) {
const ov = this.getOverrides(file);
if (ov && ov.__disabled === true) return false;
if (ov && ov.__disabled === false) return true;
if (!this.hasScopeLimits()) return true;
const exclude = this.settings.scopeMode === 'exclude';
if (!file || !file.path) return exclude;
const hit = this.pathMatchesScope(file.path);
return exclude ? !hit : hit;
}
isActiveFileInScope() {
if (!this.isNoteSurfaceActive()) return false;
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
return this.isFileInScope(view ? view.file : null);
}
getFileForEditorView(cmView) {
let found = null;
try {
this.app.workspace.iterateAllLeaves(leaf => {
if (found) return;
const v = leaf && leaf.view;
if (v && v.editor && v.editor.cm === cmView) found = v.file || null;
});
} catch (_) { zgCatch('getFileForEditorView: this.app.workspace.iterateAllLeaves(leaf =>', _); }
return found;
}
isEditorInScope(cmView) {
if (!cmView) return true;
if (cmView._zgScope && cmView._zgScope.gen === this._scopeGen) return cmView._zgScope.in;
const val = this.editorViewIsNote(cmView)
&& this.isFileInScope(this.getFileForEditorView(cmView));
cmView._zgScope = { gen: this._scopeGen, in: val };
return val;
}
syncScope() {
this._scopeGen++;
if (!this.settings.pluginEnabled) return;
const inScope = this.isActiveFileInScope();
if (inScope === this._lastScopeInScope) return;
this._lastScopeInScope = inScope;
this.applyBodyClasses();
this.reconfigureEditors();
this.applyVimMotionMaps();
this.syncSurfaceSidebars();
}
goalsFilePath() {
return this.storeResolve(this.settings.goalsPath, 'ws-goals.md');
}
goalsFileCompose() {
const out = [];
out.push('Word-Smith\u2019s writing goals. Edit the numbers freely \u2014 they are read');
out.push('back when Obsidian starts, and rewritten when you change a goal in the');
out.push('app. Everything between the markers is rewritten; keep your own notes');
out.push('outside them.');
out.push('');
const section = (title, goals, status) => {
const keys = Array.from(new Set(
Object.keys(goals || {}).concat(Object.keys(status || {})))).sort();
if (!keys.length) return;
out.push('### ' + title);
out.push('');
for (const k of keys) {
const v = parseInt((goals || {})[k], 10);
const st = (status || {})[k];
if (!v && !st) continue;
out.push('- ' + k + ' \u2014 ' + (v ? String(v) : '')
+ (v && st ? ' \u00b7 ' : '') + (st || ''));
}
out.push('');
};
section('Notes', this.settings.fileGoals, this.settings.fileStatus);
return GOALS_MARK_START + '\n' + out.join('\n') + '\n' + GOALS_MARK_END + '\n';
}
goalsFileParse(text) {
const res = { fileGoals: {}, fileStatus: {} };
const body = String(text || '');
const a = body.indexOf(GOALS_MARK_START);
const b = body.indexOf(GOALS_MARK_END);
if (a === -1 || b === -1 || b < a) return null;
let into = null;
for (const line of body.slice(a + GOALS_MARK_START.length, b).split('\n')) {
const h = line.match(/^###\s+(.*)$/);
if (h) {
const name = h[1].trim().toLowerCase();
into = name === 'notes' ? 'fileGoals' : null;
continue;
}
const r = line.match(/^\s*-\s*(.+?)\s*[\u2014\u2013:-]\s*(.*)$/);
if (r && into) {
const path = r[1];
const value = String(r[2] || '');
const num = value.match(/\d[\d,\s]*/);
const n = num ? parseInt(num[0].replace(/[,\s]/g, ''), 10) : 0;
if (n > 0) res[into][path] = n;
const word = (value.match(/[A-Za-z]+/) || [''])[0].toLowerCase();
if (word && zgStatusLabel(word)) {
res.fileStatus[path] = word;
}
}
}
return res;
}
goalsStoreApply(store) {
const all = this.structureStore(store);
const build = (goals, status) => {
const keys = Array.from(new Set(
Object.keys(goals || {}).concat(Object.keys(status || {})))).sort();
const rows = [];
for (const k of keys) {
const v = parseInt((goals || {})[k], 10);
const st = (status || {})[k];
if (!v && !st) continue;
rows.push({ path: k, on: true,
note: (v ? String(v) : '') + (v && st ? ' \u00b7 ' : '') + (st || '') });
}
return rows;
};
all[this.goalsSectionKey('file')] =
build(this.settings.fileGoals, this.settings.fileStatus);
return all;
}
goalsStoreAdopt(store) {
const all = this.structureStore(store);
const fileKey = this.goalsSectionKey('file');
const folderKey = this.goalsSectionKey('folder');
if (!Object.prototype.hasOwnProperty.call(all, fileKey)
&& !Object.prototype.hasOwnProperty.call(all, folderKey)) return null;
const res = { fileGoals: {}, fileStatus: {} };
const take = (rows, into, statusInto) => {
for (const r of (rows || [])) {
const value = String(r.note || '');
const num = value.match(/\d[\d,\s]*/);
const n = num ? parseInt(num[0].replace(/[,\s]/g, ''), 10) : 0;
if (n > 0) res[into][r.path] = n;
if (!statusInto) continue;
const word = (value.match(/[A-Za-z]+/) || [''])[0].toLowerCase();
if (word && zgStatusLabel(word)) res[statusInto][r.path] = word;
}
};
take(all[fileKey], 'fileGoals', 'fileStatus');
return res;
}
colorsSectionKey() { return 'colors: folders'; }
userColsSectionKey() { return 'columns: user'; }
userColsStoreApply(store) {
const all = this.structureStore(store);
const src = this.settings.uniUserCols || [];
const rows = [];
for (const c of src) {
const key = String((c && c.key) || '').trim();
if (!key) continue;
const type = String((c && c.type) || '').trim();
rows.push({ path: key, on: true, note: type });
}
all[this.userColsSectionKey()] = rows;
return all;
}
userColsStoreAdopt(store) {
const all = this.structureStore(store);
const key = this.userColsSectionKey();
if (!Object.prototype.hasOwnProperty.call(all, key)) return null;
const had = this.settings.uniUserCols || [];
const rows = all[key] || [];
const out = [];
for (const r of rows) {
const k = String(r.path || '').trim();
if (!k) continue;
const was = had.filter((c) => c && String(c.key) === k)[0] || null;
const col = was ? Object.assign({}, was) : { key: k, label: k };
const type = String(r.note || '').trim();
if (type) col.type = type;
else delete col.type;
out.push(col);
}
if (rows.length && !out.length) return null;
return out;
}
colorsStoreApply(store) {
const all = this.structureStore(store);
const src = this.settings.folderColors || {};
const rows = [];
for (const k of Object.keys(src).sort()) {
const v = String(src[k] || '').trim();
if (!v) continue;
rows.push({ path: k === '' ? '/' : k, on: true, note: v });
}
all[this.colorsSectionKey()] = rows;
return all;
}
colorsStoreAdopt(store) {
const all = this.structureStore(store);
const key = this.colorsSectionKey();
if (!Object.prototype.hasOwnProperty.call(all, key)) return null;
const rows = all[key] || [];
const res = {};
for (const r of rows) {
const v = String(r.note || '').trim();
if (!v) continue;
res[r.path === '/' ? '' : r.path] = v;
}
if (rows.length && !Object.keys(res).length) return null;
return res;
}
async goalsStoreWrite() {
await this.structureRead();
this.goalsStoreApply(this._structStore);
this.colorsStoreApply(this._structStore);
this.userColsStoreApply(this._structStore);
await this.structureWrite();
}
goalsSignature() {
try {
return JSON.stringify([this.settings.fileGoals,
this.settings.fileStatus,
this.settings.folderColors, this.settings.uniUserCols]);
} catch (_) { return ''; }
}
goalsFileSync() {
const sig = this.goalsSignature();
if (!sig) return;
if (sig === this._goalsSig) return;
if (sig === '[{},{},{},{}]' && !this._goalsWritten) return;
if (this._goalsTimer) return;
this._goalsTimer = window.setTimeout(() => {
this._goalsTimer = null;
const wrote = this.goalsSignature();
this.goalsStoreWrite().then(() => {
if (wrote) this._goalsSig = wrote;
this._goalsWritten = true;
this.storeWriteOk(WS_WRITE.goals);
}).catch((e) => {
this.storeWriteFailed(WS_WRITE.goals, e,
'They are still set here; the file will be tried again.');
});
}, 600);
}
storeWriteFailed(subject, e, tail) {
console.error('Word-Smith: could not ' + subject, e);
if (!this._storeFailSaid) this._storeFailSaid = {};
if (this._storeFailSaid[subject]) return false;
this._storeFailSaid[subject] = true;
const why = (e && e.message) ? String(e.message) : String(e || '');
try {
new Notice('Word-Smith: could not ' + subject
+ (why ? ' \u2014 ' + why : '')
+ (tail ? '. ' + tail : '.'), 12000);
} catch (_) { zgCatch('storeWriteFailed: new Notice(\'Word-Smith: could not \' + subject', _); }
return false;
}
storeWriteOk(subject) {
if (this._storeFailSaid) this._storeFailSaid[subject] = false;
return true;
}
async goalsFileLoad() {
try {
const store = await this.structureRead();
let parsed = this.goalsStoreAdopt(store);
if (!parsed) {
const found = await this.goalsFileFind();
const f = found ? this.app.vault.getAbstractFileByPath(found) : null;
if (f && !f.children) {
parsed = this.goalsFileParse(await this.app.vault.read(f));
if (parsed) this._goalsFoldedFrom = found;
}
}
if (!parsed) {
this._goalsSig = null;
this.goalsFileSync();
return;
}
this.settings.fileGoals = parsed.fileGoals;
this.settings.fileStatus = parsed.fileStatus || {};
const colors = this.colorsStoreAdopt(store);
if (colors) this.settings.folderColors = colors;
const ucols = this.userColsStoreAdopt(store);
if (ucols) this.settings.uniUserCols = ucols;
this._goalsSig = this.goalsSignature();
this._goalsWritten = true;
} catch (_) { zgCatch('goalsFileLoad: const store = await this.structureRead();', _); }
}
settingsMirrorPathFor() {
const want = String(this.settings.settingsMirrorPath || '').replace(/^\/+/, '');
return want || 'Word-Smith/ws-settings.md';
}
settingsMirrorMachineKeys() {
return ['editorFont', 'editorFontDefaultCleared'];
}
settingsMirrorVaultKeys() {
return ['goalsPath', 'exportListPath', 'structurePath',
'historyFilePath', 'settingsMirrorPath', 'scopePaths'];
}
vaultName() {
try { return String(this.app.vault.getName() || ''); } catch (_) { return ''; }
}
vaultWhole() {
return 'All of ' + (this.vaultName() || 'the vault');
}
settingsMirrorCompose() {
const stamp = new Date();
const p2 = (v) => String(v).padStart(2, '0');
const iso = stamp.getFullYear() + '-' + p2(stamp.getMonth() + 1)
+ '-' + p2(stamp.getDate()) + ' ' + p2(stamp.getHours())
+ ':' + p2(stamp.getMinutes()) + ':' + p2(stamp.getSeconds());
const out = [];
out.push('A readable copy of Word-Smith\u2019s settings, written whenever they');
out.push('change. It is a MIRROR: the plugin does not read it while it has');
out.push('settings of its own, so editing it here changes nothing. It exists so a');
out.push('reinstall \u2014 or a vault restored from a backup that kept the notes and');
out.push('not the plugin folder \u2014 can get everything back.');
out.push('');
out.push('- vault: ' + (this.vaultName() || '(unnamed)'));
out.push('- written: ' + iso);
out.push('');
let json = '{}';
try { json = JSON.stringify(this.settings, null, 2); } catch (_) { zgCatch('settingsMirrorCompose: json = JSON.stringify(this.settings, null, 2);', _); }
out.push('```json');
out.push(json);
out.push('```');
return SETTINGS_MARK_START + '\n' + out.join('\n') + '\n' + SETTINGS_MARK_END + '\n';
}
settingsMirrorParse(text) {
const body = String(text || '');
const a = body.indexOf(SETTINGS_MARK_START);
const b = body.indexOf(SETTINGS_MARK_END);
if (a === -1 || b === -1 || b < a) return null;
const inner = body.slice(a + SETTINGS_MARK_START.length, b);
const vault = (inner.match(/^-\s*vault:\s*(.*)$/m) || [])[1] || '';
const written = (inner.match(/^-\s*written:\s*(.*)$/m) || [])[1] || '';
const fence = inner.match(/```json\s*([\s\S]*?)```/);
if (!fence) return null;
let settings = null;
try { settings = JSON.parse(fence[1]); } catch (_) { return null; }
if (!settings || typeof settings !== 'object') return null;
return { vault: vault.trim(), written: written.trim(), settings };
}
settingsMirrorShouldRestore(raw) {
if (!raw || typeof raw !== 'object') return true;
return Object.keys(raw).length === 0;
}
settingsMirrorRestorable(parsed, intoVault) {
const out = {};
if (!parsed || !parsed.settings) return out;
const skip = new Set(this.settingsMirrorMachineKeys());
const sameVault = !!parsed.vault && parsed.vault === String(intoVault || '');
if (!sameVault) for (const k of this.settingsMirrorVaultKeys()) skip.add(k);
for (const k of Object.keys(parsed.settings)) {
if (skip.has(k)) continue;
out[k] = parsed.settings[k];
}
return out;
}
async settingsMirrorWrite() {
if (!this.settings.settingsMirror) return;
let sig = '';
try { sig = JSON.stringify(this.settings); } catch (_) { return; }
if (sig === this._mirrorSig) return;
const text = this.settingsMirrorCompose();
try {
const found = await this.storeFind(SETTINGS_MARK_START,
this.settings.settingsMirrorPath, [], this._mirrorFoundAt);
const f = found
? this.app.vault.getAbstractFileByPath(found) : null;
if (f && !f.children) {
await this.app.vault.modify(f, text);
this._mirrorFoundAt = found;
} else {
const path = this.settingsMirrorPathFor();
await this.storeEnsureFolder(path);
await this.app.vault.create(path, text);
this._mirrorFoundAt = path;
}
this._mirrorSig = sig;
this.storeWriteOk(WS_WRITE.mirror);
} catch (e) {
this.storeWriteFailed(WS_WRITE.mirror, e,
'data.json still has them; this file is the copy that '
+ 'survives an uninstall.');
}
}
settingsMirrorSync() {
if (!this.settings.settingsMirror) return;
if (this._mirrorTimer) return;
this._mirrorTimer = window.setTimeout(() => {
this._mirrorTimer = null;
this.settingsMirrorWrite().catch(() => {});
}, 4000);
}
async settingsMirrorRestore(raw) {
if (!this.settings.settingsMirror) return false;
if (!this.settingsMirrorShouldRestore(raw)) return false;
try {
const found = await this.storeFind(SETTINGS_MARK_START,
this.settings.settingsMirrorPath, [], null);
if (!found) return false;
const f = this.app.vault.getAbstractFileByPath(found);
if (!f || f.children) return false;
const parsed = this.settingsMirrorParse(await this.app.vault.read(f));
if (!parsed) return false;
const take = this.settingsMirrorRestorable(parsed, this.vaultName());
if (!Object.keys(take).length) return false;
Object.assign(this.settings, take);
this._mirrorFoundAt = found;
try { await this.saveData(this.settings); }
catch (e) {
this.storeWriteFailed(WS_WRITE.settings, e,
'They are back for this session and will be written again '
+ 'on the next change.');
}
return true;
} catch (_) { return false; }
}
propColId(key) { return 'fm:' + String(key || ''); }
propColKey(id) {
const s = String(id || '');
return s.indexOf('fm:') === 0 ? s.slice(3) : '';
}
propRaw(path, key) {
try {
const want = String(key || '');
if (!want) return undefined;
const f = this.app.vault.getAbstractFileByPath(String(path || ''));
if (!f || f.children) return undefined;
const cache = this.app.metadataCache
&& this.app.metadataCache.getFileCache(f);
const fm = cache && cache.frontmatter;
if (!fm) {
const sv = this.propStoreGetSync(String(path || ''), want);
return sv === '' ? undefined : sv;
}
if (Object.prototype.hasOwnProperty.call(fm, want)) return fm[want];
const low = want.toLowerCase();
for (const k of Object.keys(fm)) {
if (k.toLowerCase() === low) return fm[k];
}
return undefined;
} catch (_) { return undefined; }
}
propText(path, key) {
const v = this.propRaw(path, key);
if (v == null || v === '') return '';
if (Array.isArray(v)) {
const kept = v.filter(x => x != null && typeof x !== 'object');
return kept.length ? kept.map(String).join(', ') : '';
}
if (typeof v === 'object') return '\u2014';
if (typeof v === 'boolean') return v ? 'yes' : 'no';
return String(v);
}
propTitle(path, key) {
const v = this.propRaw(path, key);
if (Array.isArray(v)) {
return v.filter(x => x != null && typeof x !== 'object').map(String).join(', ');
}
if (v && typeof v === 'object') return 'Word-Smith cannot show a nested property in a column.';
return v == null ? '' : String(v);
}
propLooksLikeDate(v) {
if (v instanceof Date) return !isNaN(v.getTime());
if (typeof v !== 'string') return false;
const s = v.trim();
if (!s || /^-?[\d.,]+$/.test(s)) return false;
const shaped = /\d{4}-\d{2}-\d{2}/.test(s)
|| /\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/.test(s)
|| /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s);
if (!shaped) return false;
const t = Date.parse(s);
return !isNaN(t);
}
propSortAs(key, paths) {
const seen = [];
for (const p of (paths || [])) {
const v = this.propRaw(p, key);
if (v == null || v === '') continue;
if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date))) continue;
seen.push(v);
}
if (!seen.length) return 'text';
if (seen.every(v => typeof v === 'number'
|| (typeof v === 'string' && /^-?[\d.,]+$/.test(v.trim()) && v.trim() !== ''))) {
return 'number';
}
if (seen.every(v => this.propLooksLikeDate(v))) return 'date';
return 'text';
}
renameGoalPaths(oldPath, newPath) {
if (!oldPath || !newPath || oldPath === newPath) return false;
let changed = false;
for (const which of this.goalPathStores()) {
const map = this.settings[which];
if (!map || typeof map !== 'object') continue;
for (const key of Object.keys(map)) {
let next = null;
if (key === oldPath) next = newPath;
else if (key.startsWith(oldPath + '/')) next = newPath + key.slice(oldPath.length);
if (next === null || next === key) continue;
if (!Object.prototype.hasOwnProperty.call(map, next)) map[next] = map[key];
delete map[key];
changed = true;
}
}
return changed;
}
forgetGoalPaths(path) {
if (!path) return false;
let changed = false;
for (const which of this.goalPathStores()) {
const map = this.settings[which];
if (!map || typeof map !== 'object') continue;
for (const key of Object.keys(map)) {
if (key !== path && !key.startsWith(path + '/')) continue;
delete map[key];
changed = true;
}
}
return changed;
}
goalPathStores() {
return ['fileGoals', 'fileStatus', 'folderColors'];
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
uniTagsOf(path) {
try {
const f = this.app.vault.getAbstractFileByPath(path);
if (!f) return [];
const cache = this.app.metadataCache
&& this.app.metadataCache.getFileCache(f);
if (!cache) return [];
const all = (typeof getAllTags === 'function') ? getAllTags(cache) : null;
if (Array.isArray(all)) return all;
const out = [];
for (const t of (cache.tags || [])) {
if (t && t.tag) out.push(String(t.tag));
}
const fm = cache.frontmatter && cache.frontmatter.tags;
for (const t of (Array.isArray(fm) ? fm : (fm ? [fm] : []))) {
const v = String(t || '').trim();
if (v) out.push(v[0] === '#' ? v : '#' + v);
}
return out;
} catch (_) { return []; }
}
uniTagsInScope(paths) {
const seen = new Map();
for (const p of (paths || [])) {
for (const t of this.uniTagsOf(p)) {
seen.set(t, (seen.get(t) || 0) + 1);
}
}
return Array.from(seen.keys())
.sort((a, b) => (seen.get(b) - seen.get(a)) || a.localeCompare(b))
.map(t => ({ tag: t, n: seen.get(t) }));
}
uniTypeGroups() {
return [
{ id: 'md', label: 'Notes', icons: ['file-text', 'file'],
ext: ['md'] },
{ id: 'image', label: 'Images', icons: ['image', 'file-image', 'file'],
ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'] },
{ id: 'canvas', label: 'Canvas', icons: ['layout-dashboard', 'layout', 'file'],
ext: ['canvas'] },
{ id: 'base', label: 'Bases', icons: ['database', 'table', 'file'],
ext: ['base'] },
{ id: 'pdf', label: 'PDFs', icons: ['file'],
ext: ['pdf'] },
{ id: 'audio', label: 'Audio', icons: ['file-audio', 'music', 'file'],
ext: ['mp3', 'wav', 'm4a', 'ogg', 'flac', '3gp'] },
{ id: 'video', label: 'Video', icons: ['file-video', 'video', 'file'],
ext: ['mp4', 'mkv', 'mov', 'webm', 'ogv'] },
{ id: 'other', label: 'Other files', icons: ['file'], ext: null }
];
}
uniTypeGroupOf(file) {
const ext = String((file && file.extension)
|| String((file && file.path) || '').split('.').pop() || '')
.toLowerCase();
for (const g of this.uniTypeGroups()) {
if (g.ext && g.ext.indexOf(ext) !== -1) return g.id;
}
return 'other';
}
uniTypeSet() {
const raw = this.settings && this.settings.uniTypes;
const list = Array.isArray(raw) && raw.length ? raw : ['md'];
return new Set(list);
}
uniTypeAllows(file) {
return this.uniTypeSet().has(this.uniTypeGroupOf(file));
}
getFilePath(view) {
const file = view && view.file;
if (!file) return 'no file';
if ((this.settings || {}).fileTokenFormat === 'name' || this._fitShortenFile) {
return file.basename;
}
const parts = file.path.split('/');
return (parts.length <= 1 ? '~/' : '~/' + parts.slice(0, -1).join('/') + '/') + file.basename;
}
stripFrontmatter(text) {
if (text.startsWith('---\n') || text.startsWith('---\r\n')) {
const m = text.match(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/);
if (m) return text.slice(m[0].length);
}
return text;
}
countProse(text) {
if (!text) return { words: 0, chars: 0, charsNoSpaces: 0, charsWithSpaces: 0 };
const lines = text.split('\n');
const skip = scanNonProseLines(lines);
const kept = [];
for (let i = 0; i < lines.length; i++) {
if (!skip.has(i + 1)) kept.push(maskForCounting(lines[i]));
}
const prose = kept.join('\n').replace(/%%[\s\S]*?%%/g, ' ');
CJK_CHAR.lastIndex = 0;
const cjk = (prose.match(CJK_CHAR) || []).length;
const rest = prose.replace(CJK_CHAR, ' ');
WORDISH.lastIndex = 0;
const runs = (rest.match(WORDISH) || []).length;
const collapsed = prose.replace(/\s+/g, ' ').trim();
const raw = String(prose || '');
return {
words: cjk + runs,
chars: collapsed.replace(/\s+/g, '').length,
charsNoSpaces: collapsed.replace(/\s+/g, '').length,
charsWithSpaces: raw.length
};
}
analyzeText(text) {
const base = this.countProse(text);
const lines = String(text || '').split('\n');
const skip = scanNonProseLines(lines);
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
words: base.words,
chars: base.chars,
charsNoSpaces: base.charsNoSpaces,
charsWithSpaces: base.charsWithSpaces,
syllables,
sentences,
paragraphs,
lines: lineCount,
pages: base.words ? Math.max(1, Math.round(base.words / 250)) : 0,
grade: fkGrade(base.words, sentences, syllables)
};
}
exportKnownPaths() {
const files = [], folders = [];
const walk = (f) => {
for (const k of (f.children || [])) {
if (k.children) { folders.push(k.path); walk(k); }
else if (k.extension === 'md') files.push(k.path);
}
};
try { walk(this.app.vault.getRoot()); } catch (_) { zgCatch('exportKnownPaths: walk(this.app.vault.getRoot());', _); }
return { files, folders };
}
exportNearbyScopes(limit) {
const out = [];
const seen = new Set();
const add = (p2) => {
if (!p2 || seen.has(p2)) return;
seen.add(p2);
out.push({ path: p2, kind: 'folder', score: 0 });
};
try {
let up = this.app.workspace.getActiveFile();
up = up && up.parent ? up.parent : null;
while (up && up.path && up.path !== '/') { add(up.path); up = up.parent; }
} catch (_) { zgCatch('exportNearbyScopes: let up = this.app.workspace.getActiveFile();', _); }
const known = this.exportKnownPaths();
const count = {};
for (const p2 of known.files) {
const cut = p2.lastIndexOf('/');
if (cut > 0) count[p2.slice(0, cut)] = (count[p2.slice(0, cut)] || 0) + 1;
}
Object.keys(count).sort((a, b) => count[b] - count[a]).forEach(add);
return out.slice(0, limit || 8);
}
exportFinderMatches(query, limit) {
const known = this.exportKnownPaths();
const tag = (list, kind) => this.historyFuzzy(query, list)
.map(m => ({ path: m.path, score: m.score + (kind === 'folder' ? 1.5 : 0), kind }));
const all = tag(known.folders, 'folder').concat(tag(known.files, 'file'));
all.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
return all.slice(0, limit || 8);
}
exportGather(scopePath) {
const vault = this.app.vault;
const out = [];
const at = scopePath
? vault.getAbstractFileByPath(scopePath)
: (typeof vault.getRoot === 'function'
? vault.getRoot()
: vault.getAbstractFileByPath('/'));
const isMd = (f) => f && f.extension === 'md';
if (!at) return out;
if (isMd(at)) { out.push(at); return out; }
const ordered = (folder) => {
const kids = (folder.children || []).slice();
const stored = this.treeOrderFor(folder.path === '/' ? '' : folder.path);
if (stored.length) {
const rank = new Map();
for (let i = 0; i < stored.length; i++) if (!rank.has(stored[i])) rank.set(stored[i], i);
const known = [], rest = [];
for (const k of kids) (rank.has(k.path) ? known : rest).push(k);
known.sort((a, b) => rank.get(a.path) - rank.get(b.path));
rest.sort((a, b) => {
const af = !!(a.children), bf = !!(b.children);
if (af !== bf) return af ? 1 : -1;
return this.exportNatural(a.name, b.name);
});
return known.concat(rest);
}
kids.sort((a, b) => {
const af = !!(a.children), bf = !!(b.children);
if (af !== bf) return af ? 1 : -1;
return this.exportNatural(a.name, b.name);
});
return kids;
};
const walk = (folder) => {
for (const k of ordered(folder)) {
if (k.children) walk(k);
else if (isMd(k)) out.push(k);
}
};
if (at.children) walk(at);
return out;
}
exportNatural(a, b) {
const re = /(\d+)|(\D+)/g;
const ax = String(a).toLowerCase().match(re) || [];
const bx = String(b).toLowerCase().match(re) || [];
for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
const an = parseInt(ax[i], 10), bn = parseInt(bx[i], 10);
if (!isNaN(an) && !isNaN(bn)) { if (an !== bn) return an - bn; }
else if (ax[i] !== bx[i]) return ax[i] < bx[i] ? -1 : 1;
}
return ax.length - bx.length;
}
storeResolve(configured, legacy) {
const want = String(configured || legacy).replace(/^\/+/, '');
try {
const at = this.app.vault.getAbstractFileByPath(want);
if (at && !at.children) return want;
const old = this.app.vault.getAbstractFileByPath(legacy);
if (old && !old.children) return legacy;
} catch (_) { zgCatch('storeResolve: const at = this.app.vault.getAbstractFileByPath(want);', _); }
return want;
}
storeRenameFollow(oldPath, newPath) {
if (!oldPath || !newPath || oldPath === newPath) return false;
const moved = (p2) => {
const cur = String(p2 || '');
if (!cur) return null;
if (cur === oldPath) return newPath;
if (cur.indexOf(oldPath + '/') === 0) return newPath + cur.slice(oldPath.length);
return null;
};
let changed = false;
for (const key of ['goalsPath', 'exportListPath', 'structurePath',
'settingsMirrorPath', 'historyFilePath']) {
const next = moved(this.settings[key]);
if (!next) continue;
this.settings[key] = next;
changed = true;
}
const foundNext = moved(this._historyPath);
if (foundNext) { this._historyPath = foundNext; changed = true; }
const goalsNext = moved(this._goalsFoundAt);
if (goalsNext) { this._goalsFoundAt = goalsNext; changed = true; }
const exportNext = moved(this._structFoundAt);
if (exportNext) { this._structFoundAt = exportNext; changed = true; }
const mirrorNext = moved(this._mirrorFoundAt);
if (mirrorNext) { this._mirrorFoundAt = mirrorNext; changed = true; }
return changed;
}
async storeFind(marker, configured, legacy, remembered) {
const vault = this.app.vault;
const marks = [].concat(marker).filter(Boolean);
const olds = [].concat(legacy).filter(Boolean);
const check = async (file) => {
if (!file || file.children) return false;
try {
const text = String(await vault.cachedRead(file));
return marks.some(m => text.indexOf(m) !== -1);
}
catch (_) { return false; }
};
if (remembered) {
const f = vault.getAbstractFileByPath(remembered);
if (await check(f)) return f.path;
}
for (const want of [String(configured || '').replace(/^\/+/, '')].concat(olds)) {
if (!want) continue;
const at = vault.getAbstractFileByPath(want);
if (await check(at)) return at.path;
}
let all = [];
try { all = vault.getMarkdownFiles() || []; } catch (_) { return null; }
const bases = [String(configured || olds[0] || '')].concat(olds)
.map(p => String(p).split('/').pop().toLowerCase()).filter(Boolean);
const named = all.filter(f => bases.some(b =>
f.path.toLowerCase().endsWith('/' + b) || f.path.toLowerCase() === b));
for (const f of named) if (await check(f)) return f.path;
const rest = all.filter(f => named.indexOf(f) === -1)
.filter(f => !f.stat || f.stat.size < 400000)
.sort((a, b) => (a.stat ? a.stat.size : 0) - (b.stat ? b.stat.size : 0));
for (const f of rest) if (await check(f)) return f.path;
return null;
}
async goalsFileFind() {
if (this._goalsFoundAt) {
const at = this.app.vault.getAbstractFileByPath(this._goalsFoundAt);
if (at && !at.children) return this._goalsFoundAt;
this._goalsFoundAt = null;
}
const found = await this.storeFind(GOALS_MARK_START,
this.settings.goalsPath, 'ws-goals.md', this._goalsFoundAt);
if (found) {
this._goalsFoundAt = found;
if (this.settings.goalsPath !== found) {
this.settings.goalsPath = found;
try { await this.saveData(this.settings); }
catch (e) {
this.storeWriteFailed(WS_WRITE.settings, e,
'Word-Smith will look for the file again next time.');
}
}
}
return found;
}
async storeEnsureFolder(path) {
const cut = String(path || '').lastIndexOf('/');
if (cut <= 0) return;
const folder = path.slice(0, cut);
try {
const at = this.app.vault.getAbstractFileByPath(folder);
if (at && at.children) return;
await this.app.vault.createFolder(folder);
} catch (_) { }
}
structurePathNow() {
if (this._structFoundAt) return this._structFoundAt;
const legacy = this.structureLegacyPaths();
for (const p of legacy) {
try {
const f = this.app.vault.getAbstractFileByPath(p);
if (f && !f.children) return p;
} catch (_) { zgCatch('structurePathNow: const f = this.app.vault.getAbstractFileByPath(p);', _); }
}
return this.structureStorePath();
}
structureLegacyPaths() {
const out = [];
const add = (p) => {
const s = String(p || '').replace(/^\/+/, '');
if (s && out.indexOf(s) === -1) out.push(s);
};
add(this.settings.exportListPath);
add('Word-Smith/ws-export.md');
add('ws-export.md');
return out;
}
structureStorePath(from) {
const at = String(from || '');
if (at) {
const cut = at.lastIndexOf('/');
return (cut === -1 ? '' : at.slice(0, cut + 1)) + STRUCT_BASENAME;
}
const want = String(this.settings.structurePath || '').replace(/^\/+/, '');
return want || ('Word-Smith/' + STRUCT_BASENAME);
}
async structureSources() {
const vault = this.app.vault;
const seen = new Set();
const out = [];
const take = async (path) => {
if (!path || seen.has(path)) return;
seen.add(path);
let f = null;
try { f = vault.getAbstractFileByPath(path); } catch (_) { return; }
if (!f || f.children) return;
let text = '';
try { text = String(await vault.cachedRead(f)); } catch (_) { return; }
const isNew = text.indexOf(STRUCT_MARK_START) !== -1;
if (!isNew && text.indexOf(EXPORT_MARK_START) === -1) return;
out.push({
path: f.path, text, legacy: !isNew,
mtime: (f.stat && f.stat.mtime) || 0
});
};
await take(this._structFoundAt);
await take(this.structureStorePath());
for (const p of this.structureLegacyPaths()) await take(p);
if (!out.length) {
const found = await this.storeFind([STRUCT_MARK_START, EXPORT_MARK_START],
this.settings.structurePath, this.structureLegacyPaths(), this._structFoundAt);
await take(found);
}
out.sort((a, b) => (b.mtime - a.mtime) || (a.legacy - b.legacy));
return out;
}
async storeRetire(path, wentTo) {
try {
const f = this.app.vault.getAbstractFileByPath(path);
if (!f || f.children) return;
const text = String(await this.app.vault.read(f));
const note = 'Word-Smith kept what was here in [[' + wentTo + ']].';
let next = text;
for (const [s, e] of [[STRUCT_MARK_START, STRUCT_MARK_END],
[EXPORT_MARK_START, EXPORT_MARK_END], [GOALS_MARK_START, GOALS_MARK_END]]) {
const a = next.indexOf(s), b = next.indexOf(e);
if (a === -1 || b === -1 || b < a) continue;
next = next.slice(0, a) + note + next.slice(b + e.length);
}
if (next !== text) await this.app.vault.modify(f, next);
} catch (e) { console.error('Word-Smith: could not retire ' + path, e); }
}
async structureMigrate() {
let sources = this._structSources || [];
const gone = (p2) => {
try {
const f = this.app.vault.getAbstractFileByPath(String(p2 || ''));
return !f || !!f.children;
} catch (_) { return false; }
};
if (!sources.length || gone((sources[0] || {}).path)) {
try {
const again = await this.structureSources();
if (again && again.length) {
sources = again;
this._structSources = again;
}
} catch (_) { }
}
const primary = sources[0] || null;
let target = primary ? primary.path : this.structureStorePath();
if (primary && (primary.legacy || primary.path.split('/').pop() !== STRUCT_BASENAME)) {
const dest = this.structureStorePath(primary.path);
let taken = null;
try { taken = this.app.vault.getAbstractFileByPath(dest); } catch (_) { zgCatch('structureMigrate: taken = this.app.vault.getAbstractFileByPath(dest);', _); }
if (!taken) {
try {
const f = this.app.vault.getAbstractFileByPath(primary.path);
if (f && !f.children) {
if (this.app.fileManager && this.app.fileManager.renameFile) {
await this.app.fileManager.renameFile(f, dest);
} else {
await this.app.vault.rename(f, dest);
}
target = dest;
}
this.storeWriteOk(WS_WRITE.move);
} catch (e) {
this.storeWriteFailed(WS_WRITE.move, e,
'Word-Smith will look for it where it was.');
}
} else {
target = dest;
}
}
for (const s of sources) {
if (s.path !== target) await this.storeRetire(s.path, target);
}
if (this._goalsFoldedFrom && this._goalsFoldedFrom !== target) {
await this.storeRetire(this._goalsFoldedFrom, target);
this._goalsFoldedFrom = null;
}
this._structSources = [{ path: target, legacy: false, mtime: Date.now(), text: '' }];
this._structFoundAt = target;
if (this.settings.structurePath !== target) {
this.settings.structurePath = target;
try { await this.saveData(this.settings); }
catch (e) {
this.storeWriteFailed(WS_WRITE.settings, e,
'Word-Smith will look for the file again next time.');
}
}
return target;
}
goalsSectionKey(which) {
return 'goals: ' + (which === 'folder' ? 'folders' : 'notes');
}
structureCompose(scopes) {
const out = [];
out.push('This file is Word-Smith\u2019s manuscript structure \u2014 which files go');
out.push('into a book, in what order, and what each one is aiming at. Tick and');
out.push('untick freely, reorder the lines, or change a target; the plugin reads');
out.push('it back. Everything between the markers is rewritten, so keep your own');
out.push('notes outside them.');
out.push('');
for (const scope of Object.keys(scopes).sort()) {
const rows = scopes[scope];
if (!rows || !rows.length) continue;
out.push('### ' + scope);
out.push('');
const goals = scope.indexOf('goals: ') === 0;
const props = scope.indexOf('props: ') === 0;
const colors = scope.indexOf('colors: ') === 0;
const usercols = scope.indexOf('columns: ') === 0;
const plain = goals || props || colors || usercols
|| scope.indexOf('order: ') === 0;
for (const r of rows) {
if (usercols) {
const note = String(r.note || '').trim();
out.push(note
? '- ' + r.path + ' \u2014 ' + note
: '- ' + r.path);
} else if (goals || props || colors) {
const note = String(r.note || '').trim();
if (!note) continue;
out.push('- ' + r.path + ' \u2014 ' + note);
} else {
out.push(plain ? '- ' + r.path : '- [' + (r.on ? 'x' : ' ') + '] ' + r.path);
}
}
out.push('');
}
return STRUCT_MARK_START + '\n' + out.join('\n') + '\n' + STRUCT_MARK_END + '\n';
}
structureParse(text) {
const scopes = {};
const body = String(text || '');
let a = body.indexOf(STRUCT_MARK_START), b = body.indexOf(STRUCT_MARK_END);
let len = STRUCT_MARK_START.length;
if (a === -1 || b === -1 || b < a) {
a = body.indexOf(EXPORT_MARK_START); b = body.indexOf(EXPORT_MARK_END);
len = EXPORT_MARK_START.length;
}
if (a === -1 || b === -1 || b < a) return scopes;
let scope = null;
for (const line of body.slice(a + len, b).split('\n')) {
const h = line.match(/^###\s+(.*)$/);
if (h) { scope = h[1].trim(); scopes[scope] = scopes[scope] || []; continue; }
if (scope != null && (scope.indexOf('props: ') === 0
|| scope.indexOf('colors: ') === 0
|| scope.indexOf('columns: ') === 0)) {
const g = line.match(/^\s*-\s+(.*?)\s+[\u2014\u2013]\s+(.*)$/);
if (g) {
const note = String(g[2] || '').trim();
if (note) scopes[scope].push({ path: g[1].trim(), on: true, note });
continue;
}
}
if (scope != null && scope.indexOf('goals: ') === 0) {
const g = line.match(/^\s*-\s+(.*)\s+[\u2014\u2013]\s+(.*)$/)
|| line.match(/^\s*-\s+(.*)\s+[:-]\s+(.*)$/);
if (g) {
const note = String(g[2] || '').trim();
if (note) scopes[scope].push({ path: g[1].trim(), on: true, note });
continue;
}
}
const r = line.match(/^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/);
if (r && scope != null) { scopes[scope].push({ path: r[2], on: r[1] !== ' ' }); continue; }
const p = line.match(/^\s*-\s+(?!\[)(.+?)\s*$/);
if (p && scope != null) scopes[scope].push({ path: p[1], on: true });
}
return scopes;
}
async structureFind() {
if (this._structFoundAt) {
const at = this.app.vault.getAbstractFileByPath(this._structFoundAt);
if (at && !at.children) return this._structFoundAt;
this._structFoundAt = null;
}
const sources = await this.structureSources();
const found = sources.length ? sources[0].path : null;
if (found) this._structFoundAt = found;
return found;
}
structureStore(store) {
return store || this._structStore || {};
}
structureCached() {
return this._structStore || null;
}
structureRepair(store) {
const out = {};
const repaired = [];
for (const key of Object.keys(store || {})) {
const rows = store[key];
if (!Array.isArray(rows)) { out[key] = []; repaired.push(key); continue; }
const seen = new Set();
const clean = [];
let touched = false;
for (const r of rows) {
const path = r && typeof r === 'object' ? String(r.path == null ? '' : r.path).trim() : '';
if (!path || seen.has(path)) { touched = true; continue; }
seen.add(path);
const row = { path, on: r.on === undefined ? true : !!r.on };
if (r.note !== undefined && r.note !== null && r.note !== '') row.note = String(r.note);
if (typeof r.on !== 'boolean' || (r.note !== undefined && typeof r.note !== 'string') || path !== r.path) touched = true;
clean.push(row);
}
out[key] = clean;
if (touched) repaired.push(key);
}
return { store: out, repaired };
}
async structureRead() {
if (this._structStore) return this._structStore;
let sources = [];
try { sources = await this.structureSources(); } catch (_) { zgCatch('structureRead: sources = await this.structureSources();', _); }
this._structSources = sources;
if (sources.length) this._structFoundAt = sources[0].path;
const merged = {};
for (const s of sources) {
const parsed = this.structureParse(s.text);
for (const k of Object.keys(parsed)) {
if (!Object.prototype.hasOwnProperty.call(merged, k)) merged[k] = parsed[k];
}
}
const fixed = this.structureRepair(merged);
this._structRepaired = fixed.repaired;
if (fixed.repaired.length) {
try { console.warn('Word-Smith: ' + fixed.repaired.length + ' section(s) of ws-structure.md had the wrong shape and were repaired on read: ' + fixed.repaired.join(', ')); } catch (_) { zgCatch('structureRead: console.warn(\'Word-Smith: \' + fixed.repaired.length + \' section(s) of …', _); }
}
this._structStore = fixed.store;
return this._structStore;
}
async structureWriteSection(scope, rows) {
const all = await this.structureRead();
all[scope] = rows;
return await this.structureWrite();
}
structureWrite() {
this._structWriteQ = (this._structWriteQ || Promise.resolve())
.then(() => this.structureWriteNow());
return this._structWriteQ;
}
async structureWriteNow() {
const all = this.structureStore();
const text = this.structureCompose(all);
try {
const path = await this.structureMigrate();
const f = this.app.vault.getAbstractFileByPath(path);
this._structText = text;
if (f && !f.children) {
await this.app.vault.modify(f, text);
} else {
await this.storeEnsureFolder(path);
await this.app.vault.create(path, text);
this._structFoundAt = path;
this._structSources = [{ path, legacy: false, mtime: Date.now(), text }];
}
return this.storeWriteOk(WS_WRITE.structure);
} catch (e) {
return this.storeWriteFailed(WS_WRITE.structure, e,
'The order, goals and ticks are still set here; the file '
+ 'will be tried again.');
}
}
structureRenamePath(oldPath, newPath) {
if (!oldPath || !newPath || oldPath === newPath) return false;
const store = this.structureCached();
if (!store) return false;
const moved = (p2) => (p2 === oldPath ? newPath
: (p2.startsWith(oldPath + '/') ? newPath + p2.slice(oldPath.length) : null));
let changed = false;
for (const scope of Object.keys(store)) {
const rows = store[scope] || [];
for (const r of rows) {
const next = moved(r.path);
if (next) { r.path = next; changed = true; }
}
const ORDERKEY = 'order: ';
const movedScope = (sc) => {
const k = String(sc || '');
if (k.indexOf(ORDERKEY) !== 0) return moved(k);
const folder = k.slice(ORDERKEY.length);
if (!folder || folder === '/') return null;
const next = moved(folder);
return next === null ? null : ORDERKEY + next;
};
const nextScope = movedScope(scope);
if (nextScope && nextScope !== scope) {
if (!Object.prototype.hasOwnProperty.call(store, nextScope)) {
store[nextScope] = rows;
}
delete store[scope];
changed = true;
}
}
return changed;
}
exportApplyRemembered(files, remembered) {
const have = new Map(files.map(f => [f.path, f]));
const order = [];
const seen = new Set();
const chosen = new Set();
for (const r of (remembered || [])) {
if (!have.has(r.path)) continue;
if (seen.has(r.path)) continue;
seen.add(r.path);
order.push(r.path);
if (r.on) chosen.add(r.path);
}
for (const f of files) {
if (seen.has(f.path)) continue;
seen.add(f.path);
order.push(f.path);
chosen.add(f.path);
}
return { order, chosen };
}
structureForgetPath(gone) {
if (!gone) return false;
const store = this.structureCached();
if (!store) return false;
const hit = (p2) => {
const cur = String(p2 || '');
if (!cur) return false;
return cur === gone || cur.indexOf(gone + '/') === 0;
};
const ORDERKEY = 'order: ';
let changed = false;
for (const scope of Object.keys(store)) {
if (String(scope).indexOf(ORDERKEY) === 0) {
const folder = String(scope).slice(ORDERKEY.length);
if (folder && folder !== '/' && hit(folder)) {
delete store[scope];
changed = true;
continue;
}
}
const rows = store[scope] || [];
const keep = rows.filter(r => !hit(r && r.path));
if (keep.length !== rows.length) { store[scope] = keep; changed = true; }
}
return changed;
}
async structureForgetStore(gone) {
try {
await this.structureRead();
if (!this.structureForgetPath(gone)) return;
const path = this.structurePathNow();
const text = this.structureCompose(this._structStore);
const f = this.app.vault.getAbstractFileByPath(path);
if (f && !f.children) await this.app.vault.modify(f, text);
this.storeWriteOk(WS_WRITE.forget);
} catch (e) {
this.storeWriteFailed(WS_WRITE.forget, e,
'The list still holds a path that has gone.');
}
}
propStoreHolds(path) {
const p = String(path || '');
return !!p && !/\.md$/i.test(p);
}
propStoreSection(key) { return 'props: ' + String(key || '').trim(); }
propStoreEncode(value) {
if (Array.isArray(value)) {
return value.map((v) => String(v)).join(', ');
}
if (value === true) return 'true';
if (value === false) return 'false';
return String(value);
}
propStoreDecode(key, text) {
const raw = String(text === undefined || text === null ? '' : text);
let type = '';
try { type = (this.orgPropType && this.orgPropType(key)) || ''; } catch (_) { type = ''; }
const t = String(type).toLowerCase();
if (t === 'tags' || t === 'multitext' || t === 'aliases' || t === 'list') {
return raw.split(',').map((x) => x.trim()).filter((x) => x !== '');
}
if (t === 'checkbox') return raw === 'true';
if (t === 'number') {
const n = parseFloat(raw);
return isFinite(n) ? n : raw;
}
return raw;
}
propStoreAllSync(path) {
const out = {};
if (!this.propStoreHolds(path)) return out;
const store = this.structureCached();
if (!store) return out;
const want = String(path);
try {
for (const scope of Object.keys(store)) {
if (String(scope).indexOf('props: ') !== 0) continue;
const key = String(scope).slice(7).trim();
if (!key) continue;
for (const r of (store[scope] || [])) {
if (r && String(r.path) === want && r.note !== undefined) {
out[key] = this.propStoreDecode(key, r.note);
break;
}
}
}
} catch (_) { zgCatch('propStoreAllSync: for (const scope of Object.keys(store))', _); }
return out;
}
propStoreGetSync(path, key) {
const want = String(key || '');
if (!want) return undefined;
const all = this.propStoreAllSync(path);
if (Object.prototype.hasOwnProperty.call(all, want)) return all[want];
const low = want.toLowerCase();
for (const k of Object.keys(all)) {
if (k.toLowerCase() === low) return all[k];
}
return undefined;
}
async propStoreAll(path) {
const out = {};
if (!this.propStoreHolds(path)) return out;
const want = String(path);
try {
const store = await this.structureRead();
for (const scope of Object.keys(store || {})) {
if (String(scope).indexOf('props: ') !== 0) continue;
const key = String(scope).slice(7).trim();
if (!key) continue;
for (const r of (store[scope] || [])) {
if (r && String(r.path) === want && r.note !== undefined) {
out[key] = this.propStoreDecode(key, r.note);
break;
}
}
}
} catch (_) { zgCatch('propStoreAll: const store = await this.structureRead();', _); }
return out;
}
async propStoreGet(path, key) {
const want = String(key || '');
if (!want || !this.propStoreHolds(path)) return undefined;
const all = await this.propStoreAll(path);
if (Object.prototype.hasOwnProperty.call(all, want)) return all[want];
const low = want.toLowerCase();
for (const k of Object.keys(all)) {
if (k.toLowerCase() === low) return all[k];
}
return undefined;
}
async propStoreSet(path, key, value) {
const p = String(path || '');
const k = String(key || '').trim();
if (!k || !this.propStoreHolds(p)) return false;
if (/[\u2014\u2013]/.test(p)) {
return this.storeWriteFailed(WS_WRITE.stored,
new Error('the file name contains a dash separator (\u2014)'),
'Rename “' + p + '” without it and the property will save.');
}
const empty = value === undefined || value === null || String(value) === '';
try {
const store = await this.structureRead();
let section = this.propStoreSection(k);
const low = k.toLowerCase();
for (const scope of Object.keys(store || {})) {
if (String(scope).indexOf('props: ') !== 0) continue;
if (String(scope).slice(7).trim().toLowerCase() === low) { section = scope; break; }
}
const rows = (store[section] || []).filter(r => r && String(r.path) !== p);
if (!empty) rows.push({ path: p, on: true, note: this.propStoreEncode(value) });
if (!(await this.structureWriteSection(section, rows))) return false;
return this.storeWriteOk(WS_WRITE.stored);
} catch (e) {
return this.storeWriteFailed(WS_WRITE.stored, e,
'The cell has gone back to what the file says.');
}
}
async structureRenameStore(oldPath, newPath) {
try {
await this.structureRead();
if (!this.structureRenamePath(oldPath, newPath)) return;
const path = this.structurePathNow();
const text = this.structureCompose(this._structStore);
const f = this.app.vault.getAbstractFileByPath(path);
if (f && !f.children) await this.app.vault.modify(f, text);
this.storeWriteOk(WS_WRITE.rename);
} catch (e) {
this.storeWriteFailed(WS_WRITE.rename, e,
'The list still points at the old name.');
}
}
touchDrag(el, id, opts) {
const HOLD = 400;
const SLOP = 10;
let timer = null, dragging = false, startY = 0, startX = 0;
const marks = () => {
for (const r of opts.rows()) {
r.removeClass('is-over-top');
r.removeClass('is-over-bottom');
}
};
const stop = () => {
if (timer) { window.clearTimeout(timer); timer = null; }
if (dragging) el.removeClass('is-dragging');
dragging = false;
marks();
};
const under = (y) => {
for (const r of opts.rows()) {
const b = r.getBoundingClientRect();
if (y >= b.top && y <= b.bottom) return { row: r, below: (y - b.top) > b.height / 2 };
}
return null;
};
el.addEventListener('touchstart', (ev) => {
if (!ev.touches || ev.touches.length !== 1) return;
startY = ev.touches[0].clientY;
startX = ev.touches[0].clientX;
timer = window.setTimeout(() => {
dragging = true;
el.addClass('is-dragging');
try { if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(15); } catch (_) { zgCatch('touchDrag: if (window.navigator && window.navigator.vibrate) …', _); }
}, HOLD);
}, { passive: true });
el.addEventListener('touchmove', (ev) => {
if (!ev.touches || !ev.touches.length) return;
const y = ev.touches[0].clientY;
if (!dragging) {
if (Math.abs(y - startY) > SLOP || Math.abs(ev.touches[0].clientX - startX) > SLOP) stop();
return;
}
ev.preventDefault();
marks();
const hit = under(y);
if (hit && hit.row !== el) hit.row.addClass(hit.below ? 'is-over-bottom' : 'is-over-top');
}, { passive: false });
el.addEventListener('touchend', (ev) => {
if (!dragging) { stop(); return; }
const t = (ev.changedTouches && ev.changedTouches[0]) || null;
const hit = t ? under(t.clientY) : null;
stop();
if (!hit || hit.row === el) return;
const to = opts.idOf(hit.row);
if (to == null || to === id) return;
opts.drop(id, to, hit.below);
});
el.addEventListener('touchcancel', stop);
}
exportMove(list, fromPath, toPath, after) {
const from = list.indexOf(fromPath);
if (from === -1 || fromPath === toPath) return list;
const out = list.slice();
out.splice(from, 1);
let to = out.indexOf(toPath);
if (to === -1) return list;
out.splice(after ? to + 1 : to, 0, fromPath);
return out;
}
exportMoveFolder(list, fromFolder, toFolder, after, folderOf) {
if (fromFolder == null || toFolder == null || fromFolder === toFolder) return list;
const block = list.filter(p2 => folderOf(p2) === fromFolder);
if (!block.length) return list;
const rest = list.filter(p2 => folderOf(p2) !== fromFolder);
let at = -1;
for (let i = 0; i < rest.length; i++) {
if (folderOf(rest[i]) !== toFolder) continue;
if (at === -1) at = i;
if (after) at = i + 1;
}
if (at === -1) return list;
return rest.slice(0, at).concat(block, rest.slice(at));
}
exportFolderOf(path) {
const cut = String(path || '').lastIndexOf('/');
return cut === -1 ? '' : path.slice(0, cut);
}
exportFolderChain(path, scope) {
const dir = this.exportFolderOf(path);
if (!dir) return [''];
const segs = dir.split('/');
const base = String(scope || '');
const inScope = !!base && (dir === base || dir.indexOf(base + '/') === 0);
const startAt = inScope ? base.split('/').length - 1 : 0;
const out = [];
for (let i = startAt; i < segs.length; i++) out.push(segs.slice(0, i + 1).join('/'));
return out;
}
exportInFolder(path, folder) {
if (folder === '' || folder == null) return this.exportFolderOf(path) === '';
return String(path || '').indexOf(folder + '/') === 0;
}
async exportEnsureFolder(folder) {
const f = String(folder || '').replace(/^\/+|\/+$/g, '');
if (!f) return '';
try {
const at = this.app.vault.getAbstractFileByPath(f);
if (at && at.children) return f;
if (at) return '';
await this.app.vault.createFolder(f);
return f;
} catch (_) {
const at2 = this.app.vault.getAbstractFileByPath(f);
return at2 && at2.children ? f : '';
}
}
exportFileName(scopePath, ext) {
const base = String(scopePath || 'export').split('/').pop().replace(/\.md$/, '') || 'export';
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
return base.replace(/[\\/:*?"<>|]/g, '-') + ' '
+ p2(d.getHours()) + '-' + p2(d.getMinutes()) + ' '
+ p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear()
+ '.' + ext;
}
async exportSections(files, opts, onStep, scope) {
const secs = [];
let n = 0;
const wantFolders = !!(opts && opts.folderHeadings);
const root = wantFolders
? zgExportRoot(files.map((f) => f.path), scope) : '';
let seen = [];
for (const f of files) {
let text = '';
try { text = await this.app.vault.read(f); } catch (_) { continue; }
let depth = 0;
if (wantFolders) {
const rel = root ? String(f.path).slice(root.length + 1) : String(f.path);
const bits = rel.split('/').slice(0, -1);
let i = 0;
while (i < seen.length && i < bits.length && seen[i] === bits[i]) i++;
for (let k = i; k < bits.length; k++) {
secs.push({
folder: true,
depth: Math.min(6, k + 1),
title: bits[k],
markdown: '',
path: (root ? root + '/' : '') + bits.slice(0, k + 1).join('/')
});
}
seen = bits;
depth = Math.min(6, bits.length);
}
secs.push({ title: f.basename, markdown: text, path: f.path, depth });
n++;
if (onStep && (n % 5 === 0 || n === files.length)) {
onStep(n, files.length);
await new Promise((r) => window.setTimeout(r, 0));
}
}
return secs;
}
exportToMarkdown(sections, o) {
const parts = [];
if (o.titlePage) {
parts.push('# ' + (o.title || 'Untitled'));
if (o.author) parts.push('*by ' + o.author + '*');
if (o.wordCount != null) {
parts.push('*' + zgTitleWords(o) + '*');
}
parts.push('');
}
if (o.toc && sections.length > 1) {
parts.push('## Contents\n');
const stepOf = zgTocSteps(o, sections);
const seenSlug = {};
sections.forEach((sec) => {
const t = sec.title || 'Section';
const pad = '  '.repeat(stepOf(sec));
const base = String(t).toLowerCase()
.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const nth = seenSlug[base] || 0;
seenSlug[base] = nth + 1;
parts.push(pad + '- [' + t + '](#' + base
+ (nth ? '-' + nth : '') + ')');
});
parts.push('');
}
sections.forEach((sec, i) => {
if (sec.folder) {
parts.push('#'.repeat(Math.min(6, sec.depth || 1)) + ' ' + sec.title + '\n');
return;
}
if (o.sectionTitles && sec.title) {
parts.push('#'.repeat(zgFileHeadLevel(o, sec)) + ' ' + sec.title + '\n');
}
let md = String(sec.markdown || '');
if (!o.keepFrontmatter && /^---\s*\n/.test(md)) {
md = md.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}
if (!o.keepComments) md = md.replace(/%%[\s\S]*?%%/g, '');
if (o.folderHeadings) md = zgDemoteHeadings(md, sec.depth || 0);
parts.push(md.trim());
if (o.starBetween && i < sections.length - 1) {
parts.push('\n' + (o.divider == null ? '#' : o.divider) + '\n');
}
});
return parts.join('\n') + '\n';
}
countWords(text) {
return this.countProse(text).words;
}
getDocStats(view) {
const editor = view.editor;
const doc = editor && editor.cm && editor.cm.state ? editor.cm.state.doc : null;
if (doc && this._docStatsCache && this._docStatsCache.doc === doc) {
return this._docStatsCache;
}
const full = view.getViewData();
const prose = this.countProse(full);
const totalWC = prose.words;
const charCount = prose.charsWithSpaces;
const lines = full.split('\n');
const paras = [];
let inPara = false;
for (let i = 0; i < lines.length; i++) {
const raw = lines[i];
const blank = raw.trim() === '';
const heading = /^\s{0,3}#{1,6}\s/.test(raw);
if (!blank && !heading) {
if (!inPara) { paras.push({ start: i, end: i }); inPara = true; }
else paras[paras.length - 1].end = i;
} else {
inPara = false;
}
}
const stats = { doc, totalWC, charCount, paras };
if (doc) this._docStatsCache = stats;
return stats;
}
getNonProseLines(doc) {
if (this._fenceCache && this._fenceCache.doc === doc) return this._fenceCache.set;
const set = doc.length > 400000
? new Set()
: scanNonProseLines(doc.toString().split('\n'));
this._fenceCache = { doc, set };
return set;
}
getParagraphLines(doc) {
if (this._paraCache && this._paraCache.doc === doc) return this._paraCache.val;
const body = new Set(), first = new Set();
if (doc.length <= 400000) {
const lines = doc.toString().split('\n');
const skip = scanNonProseLines(lines);
let prevBlank = true, seenParagraph = false;
for (let i = 0; i < lines.length; i++) {
const n = i + 1, text = lines[i];
if (skip.has(n)) { prevBlank = true; continue; }
if (!isParagraphLine(text)) { prevBlank = text.trim() === ''; continue; }
body.add(n);
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
let current = 0;
for (let p = 0; p < total; p++) {
if (cursorLine <= paras[p].end) { current = p + 1; break; }
}
if (!current) current = total;
return current + '/' + total;
}
getStatusRows() {
const n = 1;
const src = Array.isArray(this.settings.statusRows) ? this.settings.statusRows : [];
const out = [];
for (let i = 0; i < n; i++) {
out.push(Object.assign({ left: '', center: '', right: '' }, src[i] || {}));
}
return out;
}
getAllModes() {
const scoped = this.isActiveFileInScope();
return [
{ key: 'tw', letter: 'T', label: 'Typewriter mode', setting: 'enableTypewriter',
on: !!this.opt('enableTypewriter') && scoped },
{ key: 'hem', letter: 'H', label: 'Hemingway mode', setting: 'hemingwayEnabled',
on: !!this.opt('hemingwayEnabled') && scoped },
{ key: 'zen', letter: 'Z', label: 'Zen', setting: 'zenEnabled',
action: () => this.toggleZenFromBar(), on: this.zenActive() }
];
}
getActiveModes() {
return this.getAllModes().filter(m => m.on);
}
getModeLabel() {
return this.getActiveModes().map(m => m.letter).join('');
}
openBarPicker(anchorEl, items, mode) {
this.closeBarPicker();
const pop = document.createElement('div');
pop.className = 'zg-picker';
for (const item of items) {
const row = document.createElement('div');
const isOn = typeof item.on === 'function' ? item.on() : !!item.on;
row.className = 'zg-picker-row' + (isOn ? '' : ' is-off') + (item.sub ? ' is-sub' : '');
if (item.color) {
const dot = document.createElement('span');
dot.className = 'zg-picker-dot';
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
if (item.font) label.style.fontFamily = item.font;
row.appendChild(label);
row.addEventListener('mousedown', async (e) => {
e.preventDefault();
e.stopPropagation();
await item.onClick();
if (mode === 'choose') this.closeBarPicker();
else this.refreshBarPicker(pop);
});
pop.appendChild(row);
}
pop._live = items;
document.body.appendChild(pop);
this._barPicker = pop;
const a = anchorEl.getBoundingClientRect();
const r = pop.getBoundingClientRect();
let left = a.left + (a.width / 2) - (r.width / 2);
left = Math.max(6, Math.min(left, window.innerWidth - r.width - 6));
pop.style.left = left + 'px';
pop.style.bottom = (window.innerHeight - a.top + 6) + 'px';
this._barPickerDismiss = (e) => {
if (pop.contains && e && e.target && pop.contains(e.target)) return;
this.closeBarPicker();
};
window.setTimeout(() => {
document.addEventListener('mousedown', this._barPickerDismiss, true);
document.addEventListener('keydown', this._barPickerKey);
}, 0);
}
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
plUnit() {
const size = Number((this.settings || {}).statusBarFontSize) || 13;
return Math.max(2, Math.round(size * 0.25));
}
buildBarButton(cls, render, title, onClick) {
const el = document.createElement('span');
el.className = 'zg-barbtn is-clickable ' + cls;
render(el);
el.title = title;
el.addEventListener('mousedown', (e) => {
e.preventDefault();
e.stopPropagation();
onClick(el, e);
});
return el;
}
activeFolderPath() {
const file = this.activeNoteFile();
if (!file || !file.path) return null;
const i = file.path.lastIndexOf('/');
return i < 0 ? '/' : file.path.slice(0, i);
}
celebrate(host) {
try {
if (!host) return;
if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
const burst = (x, y, count, dist, kind, delay, arcStart, arcSpan) => {
const a0 = arcStart == null ? 0 : arcStart;
const span = arcSpan == null ? 360 : arcSpan;
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
const crackle = (x, y) => {
burst(x, y, 10, 40, 'is-fly', 0);
for (let i = 0; i < 5; i++) {
window.setTimeout(() => { try {
burst(x + (Math.random() * 16 - 8), y + (Math.random() * 12 - 6),
6, 16, 'is-crackle', 0);
} catch (_) { zgCatch('celebrate / crackle: burst(x + (Math.random() * 16 - 8), y + (Math.random() * 12 - 6),', _); } }, 420 + i * 110);
}
};
const glitter = (n, over) => {
for (let i = 0; i < n; i++) {
const tw = div('zg-firework-twinkle', wrap);
tw.style.left = (4 + Math.random() * 92) + '%';
tw.style.top = (4 + Math.random() * 88) + '%';
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
} catch (_) { zgCatch('celebrate / rocket: burst(x, breakY, count || 14, dist || 56, kind || \'is-rocket\', 0);', _); } }, 950);
} catch (_) { zgCatch('celebrate / rocket: const rk = div(\'zg-firework\', wrap);', _); } }, at);
};
const shell = (x, y, delay) => {
at(delay, () => burst(x, y, 16, 58, 'is-chrys', 0));
at(delay + 480, () => burst(x, y, 12, 34, 'is-strobe', 0));
};
const barrage = (n, y, delay, spacing) => {
for (let i = 0; i < n; i++) {
const x = 12 + (76 / (n - 1)) * i;
at(delay + i * (spacing || 140),
() => burst(x, y + (i % 2 ? 6 : 0), 11, 46,
i % 2 ? 'is-fly' : 'is-strobe', 0));
}
};
const at = (ms, fn) => window.setTimeout(() => { try { fn(); } catch (_) { zgCatch('celebrate: fn();', _); } }, ms);
glitter(46, 7000);
burst(24, 26, 14, 50, 'is-fly', 0);
at(200, () => burst(76, 22, 14, 50, 'is-fly', 0));
at(430, () => burst(50, 34, 12, 44, 'is-strobe', 0));
at(650, () => ring(50, 28, 18, 46, 0));
at(900, () => burst(12, 40, 10, 40, 'is-comet', 0));
at(1020, () => burst(88, 38, 10, 40, 'is-comet', 0));
at(1250, () => burst(8, 96, 10, 72, 'is-jet', 0, 5, 70));
at(1400, () => burst(92, 96, 10, 72, 'is-jet', 0, -75, 70));
rocket(50, 32, 1550, 'is-chrys', 18, 62);
at(2500, () => burst(50, 97, 11, 64, 'is-jet', 0, -32, 64));
at(2800, () => burst(50, 97, 11, 72, 'is-jet', 0, -26, 52));
at(3050, () => burst(50, 97, 11, 80, 'is-jet', 0, -20, 40));
at(3300, () => burst(30, 28, 16, 54, 'is-willow', 0));
at(3550, () => burst(70, 24, 16, 54, 'is-willow', 0));
at(3850, () => burst(50, 20, 12, 66, 'is-comet', 0));
at(4100, () => crackle(26, 44));
at(4300, () => crackle(74, 40));
at(4550, () => ring(20, 36, 14, 38, 0));
at(4700, () => ring(80, 36, 14, 38, 0));
shell(34, 30, 4900);
shell(66, 26, 5250);
rocket(28, 30, 5400, 'is-chrys', 16, 58);
rocket(72, 26, 5700, 'is-chrys', 16, 58);
at(6200, () => glitter(22, 900));
barrage(6, 34, 6400, 150);
at(7400, () => burst(50, 30, 20, 60, 'is-chrys', 0));
at(8200, () => { crackle(20, 38); crackle(50, 30); crackle(80, 38); });
at(8500, () => burst(50, 97, 14, 90, 'is-jet', 0, -22, 44));
barrage(8, 28, 8700, 110);
shell(50, 26, 9600);
at(9800, () => burst(16, 34, 14, 52, 'is-willow', 0));
at(9950, () => burst(84, 34, 14, 52, 'is-willow', 0));
at(10200, () => glitter(30, 700));
at(10400, () => { burst(30, 32, 16, 56, 'is-strobe', 0);
burst(70, 32, 16, 56, 'is-strobe', 0); });
at(10800, () => ring(50, 30, 26, 62, 0));
at(11000, () => ring(50, 30, 20, 40, 0));
at(11300, () => burst(50, 30, 24, 74, 'is-chrys', 0));
at(11600, () => glitter(24, 600));
window.setTimeout(() => { try { wrap.remove(); } catch (_) { zgCatch('celebrate: wrap.remove();', _); } }, 15000);
} catch (_) { zgCatch('celebrate: if (!host) return;', _); }
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
folderTargetSums() {
const files = this.settings.fileGoals || {};
const sums = new Map();
let root = 0;
for (const p of Object.keys(files)) {
const n = Number(files[p]) || 0;
if (!n) continue;
root += n;
let cut = String(p).lastIndexOf('/');
while (cut > -1) {
const dir = p.slice(0, cut);
sums.set(dir, (sums.get(dir) || 0) + n);
cut = dir.lastIndexOf('/');
}
}
sums.set('', root);
sums.set('/', root);
return sums;
}
folderTargetRollup(path) {
const root = (path === '/' || path === '' || path == null);
const pre = root ? '' : path + '/';
const inside = (p) => root || String(p).indexOf(pre) === 0;
const files = this.settings.fileGoals || {};
let sum = 0;
for (const p of Object.keys(files)) {
if (!inside(p)) continue;
sum += Number(files[p]) || 0;
}
return { value: sum, derived: sum > 0 };
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
async analyzeFolder(path) {
if (!this.wordCountCache) this.wordCountCache = new Map();
const files = this.filesInFolder(path, true).filter(f => this.isFileCounted(f));
const total = { words: 0, chars: 0, charsNoSpaces: 0, charsWithSpaces: 0,
syllables: 0, sentences: 0, tasksDone: 0, tasksAll: 0,
paragraphs: 0, lines: 0, files: files.length };
for (const file of files) {
let stats = null, tasks = null;
const hit = this.wordCountCache.get('stats:' + file.path);
if (hit && hit.mtime === file.stat.mtime && hit.tasks) {
stats = hit.stats; tasks = hit.tasks;
}
if (!stats) {
try {
const text = await this.app.vault.cachedRead(file);
stats = this.analyzeText(text);
try { tasks = this.countTasks(text); } catch (_) { tasks = { done: 0, all: 0 }; }
this.wordCountCache.set('stats:' + file.path,
{ mtime: file.stat.mtime, stats, tasks });
} catch (_) { continue; }
}
if (tasks) { total.tasksDone += tasks.done || 0; total.tasksAll += tasks.all || 0; }
total.words += stats.words;
total.chars += stats.chars;
total.charsNoSpaces += stats.charsNoSpaces || 0;
total.charsWithSpaces += stats.charsWithSpaces || 0;
total.syllables += stats.syllables;
total.sentences += stats.sentences;
total.paragraphs += stats.paragraphs;
total.lines += stats.lines || 0;
}
total.pages = total.words ? Math.max(1, Math.round(total.words / 250)) : 0;
total.grade = fkGrade(total.words, total.sentences, total.syllables);
total.tasks = total.tasksAll ? { done: total.tasksDone, all: total.tasksAll } : null;
return total;
}
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
const pctText = document.createElement('span');
pctText.className = 'zg-jar-pct-text';
pctText.textContent = Math.round(r * 100) + '%';
pct.appendChild(pctText);
wrap.appendChild(pct);
const ctx = canvas.getContext ? canvas.getContext('2d') : null;
if (!ctx) return wrap;
const CELL = 5;
const LEVELS = 14;
const quant = (v) => Math.round(v * LEVELS) / LEVELS;
const quantA = (v) => Math.round(Math.max(0, Math.min(1, v)) * 8) / 8;
const band = (v) => Math.round(v / 3) * 3;
const reduce = !!(window.matchMedia
&& window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let baseHue = 8 + r * 122, baseSat = 62, baseLig = 44;
try {
const m = getComputedStyle(canvas).color.match(/[\d.]+/g);
if (m && m.length >= 3) {
const hsl = this._rgbToHsl(+m[0], +m[1], +m[2]);
baseHue = hsl[0]; baseSat = hsl[1]; baseLig = hsl[2];
}
} catch (_) { zgCatch('buildGoalLiquid: const m = getComputedStyle(canvas).color.match(/[\\d.]+/g);', _); }
let paperLig = 12;
try {
const cs2 = getComputedStyle(document.body);
const raw = (cs2.getPropertyValue('--modal-background') || '').trim()
|| (cs2.getPropertyValue('--background-primary') || '').trim();
const pc = parseColorRGB(raw);
if (pc) paperLig = this._rgbToHsl(pc[0], pc[1], pc[2])[2];
} catch (_) { zgCatch('buildGoalLiquid: const cs2 = getComputedStyle(document.body);', _); }
const lightPaper = paperLig > 55;
const HUE_STOPS = [
[0.00, 2],
[0.14, 28],
[0.26, 50],
[0.38, -40],
[0.50, -72],
[0.62, -102],
[0.74, -145],
[0.87, -180],
[1.00, -220]
];
const hueRamp = (f0) => {
const f = Math.max(0, Math.min(1, f0));
for (let i = 1; i < HUE_STOPS.length; i++) {
if (f > HUE_STOPS[i][0]) continue;
const [p1, h1] = HUE_STOPS[i - 1];
const [p2, h2] = HUE_STOPS[i];
const k = p2 === p1 ? 0 : (f - p1) / (p2 - p1);
return h1 + (h2 - h1) * k;
}
return HUE_STOPS[HUE_STOPS.length - 1][1];
};
const hueNow = () => {
const f = Math.max(0, Math.min(1, rNow));
for (let i = 1; i < HUE_STOPS.length; i++) {
const [p1, h1] = HUE_STOPS[i - 1];
const [p2, h2] = HUE_STOPS[i];
if (f > p2) continue;
const k = p2 === p1 ? 0 : (f - p1) / (p2 - p1);
return h1 + (h2 - h1) * k;
}
return HUE_STOPS[HUE_STOPS.length - 1][1];
};
let raf = null, last = 0, w = 0, h = 0, cols = 0, rows = 0, kick = () => {};
const t0 = performance.now();
const POUR_MS = 1900;
let pourFrom = 0, pourStart = t0;
let prevT = 0;
let surfaceNow = null;
let sloshPhase = 0;
const S_RISE = 480;
const S_SPLASH = 1150;
const S_LIVELY = 3400;
const S_CALM = 6400;
let stageStart = performance.now();
let splashed = false;
const BLOB_SHAPES = [
[[1, 0], [0, 1], [-1, 0], [0, -1]],
[[1, 0], [1, 1], [0, 1], [2, 1]],
[[1, 0], [2, 0], [0, 1], [1, 1]],
[[1, 0], [0, 1], [1, 1], [2, 0]]
];
const DROPS_MAX = 28;
const drops = [];
let auroraFront = null;
const POKES_MAX = 4;
const pokes = [];
const pokeEnergy = (now) => {
let e = 0;
for (const p2 of pokes) {
if (p2.still) continue;
e = Math.max(e, Math.exp(-(now - p2.t) / 620));
}
return e;
};
let agitAt = 0, agitLevel = 0;
let stirNow = 0;
const agitNow = (now) => agitLevel * Math.exp(-(now - agitAt) / 1100);
const DEEP_TOY = 'orb';
const INK_TOY = 'ink';
const toyHere = () => (r >= 1 ? 'aurora'
: r >= 0.67 ? INK_TOY
: r >= 0.34 ? DEEP_TOY
: 'wave');
const inks = [];
const INKS_MAX = 10;
const INK_LIFE = 3.4;
const INK_SPREAD = 1900;
const bubbles = [];
const BUBBLES_MAX = 9;
let bubbleAt = 0;
let inkRun = 0, inkAt = 0;
let inkCharge = 0;
let inkChargeX = 0;
let inkChargeAt = 0;
let inkHump = 0;
let inkVent = 0;
let tilt = 0;
let tiltV = 0;
const sloshW = () => 3.9 - Math.min(1, rNow) * 1.15;
const SLOSH_DAMP = 0.72;
const orb = {
amount: 0,
want: 0,
x: 0, y: 0,
spin: 0,
vel: 0,
last: 0,
vy: 0,
dropping: false,
falling: false
};
const waves = [];
let hold = null;
let restSeen = 0;
let springNow = 0;
const waveAmp = () => Math.min(8, h * 0.06 * (1 + rNow * 0.8));
const WAVES_MAX = 14;
const WAVE_SPEED = 305;
const WAVE_LIFE = 2.6;
const ORB_SPIN_CAP = 22;
const ORB_SPIN_MAX = 19;
const ORB_BITE = 0.045;
const ORB_LEAK = 0.03;
const ORB_RATE = 2.4;
const ORB_IDLE = 650;
const ORB_SHED = 0.09;
let orbShedAt = 0, lastRingAt = 0, lastSpillAt = 0;
let splashAt = 0, splashAmp = 0;
let airborne = 0;
const orbR = () => Math.sqrt(orb.amount) * Math.min(w, h) * 0.34;
const orbEcc = () => Math.min(0.16, (Math.abs(orb.vel) / ORB_SPIN_MAX) * 0.16);
const orbRAt = (ang) => {
const e = orbEcc();
if (e < 0.01) return orbR();
const k = Math.cos(2 * (ang - orb.spin));
return orbR() * (1 + e * k) / Math.sqrt(1 + e * e * 0.5);
};
const stageAt = (ms) => {
if (ms < S_RISE) {
const u = ms / S_RISE;
return { wave: 0.25 + 3.15 * u * u * u, over: ease(u) * 0.10, jet: 1 - u };
}
if (ms < S_SPLASH) {
const u = (ms - S_RISE) / (S_SPLASH - S_RISE);
void u;
return { wave: 3.4 - u * 1.6, over: 0.10 * (1 - u) };
}
if (ms < S_LIVELY) {
const u = (ms - S_SPLASH) / (S_LIVELY - S_SPLASH);
return { wave: 1.8 - u * 0.8, over: 0 };
}
if (ms < S_CALM) {
const u = (ms - S_LIVELY) / (S_CALM - S_LIVELY);
return { wave: (1 - u) * (1 - u), over: 0 };
}
return { wave: 0, over: 0 };
};
let swirlPhase = Math.random() * Math.PI * 2;
let flowPhase = Math.random() * Math.PI * 2;
let rNow = reduce ? r : 0;
const pour = () => {
if (reduce) { rNow = r; return; }
pourFrom = 0;
rNow = 0;
pourStart = performance.now();
sloshPhase = Math.random() * Math.PI * 2;
swirlPhase = Math.random() * Math.PI * 2;
flowPhase = Math.random() * Math.PI * 2;
stageStart = performance.now();
splashed = false;
drops.length = 0;
auroraFront = null;
kick();
};
const ease = (u) => u * u * (3 - 2 * u);
const resize = () => {
const rect = wrap.getBoundingClientRect();
const cw = Math.max(40, Math.round(rect.width || 300));
const ch = Math.max(24, Math.round(rect.height || 76));
if (cw === w && ch === h) return;
w = cw; h = ch;
cols = Math.ceil(w / CELL);
rows = Math.ceil(h / CELL);
canvas.width = w; canvas.height = h;
};
const S = (typeof this._auroraSeed === 'number') ? this._auroraSeed : Math.random();
const frac = (n) => { const v = S * n; return v - Math.floor(v); };
const rot = frac(1) * 360;
const p1 = frac(2.7) * 6.283;
const p2 = frac(5.1) * 6.283;
const p3 = frac(8.9) * 6.283;
const spread = 0.72 + frac(3.3) * 0.62;
const dir = frac(6.4) < 0.5 ? -1 : 1;
const zeal = 0.25 + frac(4.2) * 0.75;
const auroraCell = (u, v, t, ph, fire) => {
const T = t * 0.42;
const ph2 = ph || 0;
const warp =
Math.sin(v * 4.1 + T * 0.55 + u * 2.3 + p1) * 0.22 +
Math.sin(v * 7.3 - T * 0.38 + u * 3.7 + p2) * 0.12 +
Math.sin(u * 5.2 + T * 0.62 - v * 1.9 + p3) * 0.16 +
Math.sin((u + v) * 3.3 - T * 0.27 + p1) * 0.09;
let s = v * 0.6 - T * 0.14 + warp;
s = s - Math.floor(s);
const ray1 = 0.5 + 0.5 * Math.sin(u * 3.0 + warp * 6 + T * 0.30 + p2 + ph2);
const ray2 = 0.5 + 0.5 * Math.sin(u * 7.5 - warp * 4 - T * 0.22 + v * 2.0 + p3
+ ph2 * 1.6);
const zealNow = zeal;
const wander = Math.sin(T * 0.081 + p1) * 96
+ Math.sin(T * 0.047 + p2) * 71
+ Math.sin(T * 0.029 + p3) * 54;
const hue = rot
+ Math.sin(s * Math.PI * 2) * 70 * spread
+ Math.sin((s + 0.33) * Math.PI * 4) * 50 * spread
+ Math.sin((s + 0.66) * Math.PI * 6) * 28 * spread
+ wander * dir
+ T * 9 * dir;
const curtain = quant(ray1 * 0.65 + ray2 * 0.35);
const f2 = fire || 0;
const cur2 = f2 > 0 ? Math.min(1, curtain * (1 + f2 * 0.55)) : curtain;
const lig = 30 + cur2 * 34 + (1 - v) * 10 + f2 * 16;
const sat = 58 + cur2 * 30 + f2 * 8;
const alpha = quantA(0.62 + cur2 * 0.38 + f2 * 0.10);
return 'hsla(' + Math.round(((hue % 360) + 360) % 360) + ','
+ Math.round(Math.max(0, Math.min(100, sat))) + '%,'
+ Math.round(Math.max(0, Math.min(100, lig))) + '%,'
+ alpha.toFixed(2) + ')';
};
const draw = (now) => {
raf = null;
if (!canvas.isConnected) return;
resize();
const t = (now - t0) / 1000;
const dt = Math.min(0.05, prevT ? (now - prevT) / 1000 : 0.016);
prevT = now;
const stageMs = now - stageStart;
const stage = stageAt(stageMs);
if (!reduce && rNow !== r) {
const u = Math.min(1, Math.max(0, (now - pourStart) / POUR_MS));
rNow = pourFrom + (r - pourFrom) * ease(u);
if (u >= 1) rNow = r;
}
ctx.clearRect(0, 0, w, h);
const auroraMix = full
? Math.max(0, Math.min(1, (stageMs - S_SPLASH) / (S_CALM - S_SPLASH)))
: 0;
const auroraJitter = full ? quantA(1 - auroraMix) : 0;
let surfaceY = null;
let restNow = 0;
{
const pokeE = pokeEnergy(now);
const brimCalm = 1 - 0.80 * Math.max(0, Math.min(1, (r - 0.72) / 0.20));
const stirWant = Math.min(3.6,
Math.max(stage.wave * brimCalm, pokeE) + agitNow(now));
const stirRate = stirWant > stirNow ? 7.5 : 2.6;
stirNow += (stirWant - stirNow) * Math.min(1, stirRate * dt);
const stir = stirNow;
if (inkCharge > 0 && now - inkChargeAt > 400) {
inkCharge = Math.max(0, inkCharge - dt * 1.2);
}
{
const humpRate = inkCharge > inkHump ? 6.0
: ((now - inkVent) < 700 ? 7.0 : 4.6);
inkHump += (inkCharge - inkHump) * Math.min(1, humpRate * dt);
if (inkHump < 0.001 && inkCharge <= 0) inkHump = 0;
}
const calm = 1 - Math.min(1, stir);
const climb = t * 0.34 * (1 + 0.55 * calm)
+ Math.sin(t * 0.19 + flowPhase) * 0.9
+ Math.sin(t * 0.07 + flowPhase * 1.7) * 1.6;
const ampWant = Math.min(8, h * 0.06 * (1 + rNow * 0.8));
const skyShare = 0.30 + 8 * Math.max(0, (0.67 - rNow) / 0.67);
const depthSeen = Math.max(1, h - restSeen);
const amp = Math.min(ampWant * stir,
restSeen > 0 ? restSeen * skyShare : ampWant * stir,
depthSeen * 0.35);
const brimEase = Math.max(0, Math.min(1, (r - 0.72) / 0.20));
const calmRise = 1 - brimEase;
const shown = Math.min(1, rNow + stage.over * rNow * calmRise);
const sinceSplash = splashAt ? (now - splashAt) : 1e9;
const bounce = sinceSplash < 900
? Math.exp(-sinceSplash / 320) * Math.sin(sinceSplash / 62)
* splashAmp * calmRise
: 0;
if (splashAt && sinceSplash >= 900) { splashAt = 0; splashAmp = 0; }
const held = Math.min(1, orb.amount + airborne);
const inJar = Math.max(0, Math.min(1, shown * (1 - held) + bounce));
const SKY = 8;
const maxH = h - SKY;
const knee = maxH * 0.75;
const aimAt = Math.max(0.0001, Math.min(1, r));
const aimRaw = aimAt * (h + amp);
const aimSoft = aimRaw <= knee ? aimRaw
: knee + (maxH - knee) * (1 - Math.exp(-(aimRaw - knee) / (maxH - knee)));
const brim = Math.max(0, Math.min(1, (aimAt - 0.85) / 0.15));
const aimH = aimSoft + (aimRaw - aimSoft) * Math.pow(brim, 16);
const bodyH = aimH * (inJar / aimAt);
const restY = h - bodyH;
restNow = restY;
restSeen = restY;
const tank = Math.max(1, h - restY);
surfaceY = new Array(cols);
const jetNow = (stage.jet || 0) * calmRise;
const pourU = Math.max(0, Math.min(1,
(now - pourStart) / POUR_MS));
const spring = brimEase * Math.sin(Math.PI * Math.min(1, pourU * 1.06))
* (rNow > 0.02 ? 1 : 0);
springNow = spring;
const jetProfile = (x) => {
if (!jetNow) return 0;
const d = Math.abs(x + CELL / 2 - w / 2);
const gone = 1 - jetNow;
const half = CELL * 2 + Math.pow(gone, 1.7) * (w / 2);
if (d > half) return 0;
return Math.pow(
Math.cos((d / Math.max(1, half)) * Math.PI / 2), 2.6);
};
for (let gx = 0; gx < cols; gx++) {
const x = gx * CELL;
const jetK = jetProfile(x);
const rise = (h - 12) * 0.85
* (1 - Math.pow(1 - jetNow, 2));
const jetLift = jetK * rise;
let surf = restY
+ Math.sin(x * 0.055 + t * 1.15) * amp
+ Math.sin(x * 0.021 - t * 0.70) * amp * 0.7
+ Math.sin(x * 0.130 + t * 1.90) * amp * 0.22
+ Math.sin((x / Math.max(1, w)) * Math.PI
+ t * 2.6 + sloshPhase) * amp * 1.4
* Math.max(0, stage.wave - 0.6)
- jetLift
+ (() => {
let ring = 0;
for (const pk of pokes) {
const d = Math.abs(x - pk.x);
const age = (now - pk.t) / 1000;
if (age > 1.6) continue;
ring += Math.sin(d * 0.09 - age * 9.5)
* Math.exp(-d / 42)
* Math.exp(-age * 2.6);
}
return Math.max(-1.3, Math.min(1.3, ring)) * amp * 2.4;
})()
- (tilt !== 0 ? (() => {
const u = (x - w / 2) / (w / 2);
const bent = 0.55 * u + 0.45 * u * u * u;
return bent * tilt * Math.min(h * 0.34, tank * 0.5);
})() : 0)
- (spring > 0.01 ? (() => {
const dS = Math.abs(x - w / 2);
return Math.exp(-(dS * dS) / 2600) * spring
* Math.min(waveAmp() * 1.6, restNow * 0.42);
})() : 0)
- (inkHump > 0.01 ? (() => {
const d = Math.abs(x - inkChargeX);
const heap = Math.exp(-(d * d) / 1300);
const ring = d - 42;
const moat = Math.exp(-(ring * ring) / 1100) * 0.34;
const reach = Math.min(waveAmp() * 5.5, restNow * 0.62);
const sink = Math.min(waveAmp() * 4.6,
(h - restNow) * 0.34);
return heap * inkHump * reach
- moat * inkHump * sink;
})() : 0)
- (() => {
const ceil = waveAmp() * 3.4;
const raw = waves.reduce((sum, wv) => {
const d = x - wv.x;
const ad = Math.abs(d);
if (ad > 150) return sum;
const age = wv.born ? (now - wv.born) / 1000 : 0;
if (age > WAVE_LIFE) return sum;
const spend = Math.exp(-age / (WAVE_LIFE * 0.55));
const crest = Math.exp(-(ad * ad) / (wv.wid || 900));
const back = d * wv.dir;
const hollow = back < 0
? Math.exp(-(back * back) / ((wv.wid || 900) * 5.8))
* (wv.hollow || 0.42) : 0;
return sum + (crest - hollow) * wv.amp * spend;
}, 0);
if (raw <= ceil && raw >= -ceil) return raw;
const over = Math.abs(raw) - ceil;
const sign = raw < 0 ? -1 : 1;
return sign * (ceil + ceil * 0.45 * (1 - Math.exp(-over / (ceil * 0.9))));
})()
- (hold ? (() => {
const held = Math.min(1, (now - hold.t) / 1000);
const eased = Math.pow(held, 0.55);
const d = Math.abs(x - hold.x);
const heap = Math.exp(-(d * d) / 2600);
const moat = Math.exp(-(d * d) / 26000) * 0.30;
const reach = Math.min(waveAmp() * 7.5, restNow * 0.62,
(h - restNow) * 0.8);
return (heap - moat) * eased * reach;
})() : 0)
- (orb.amount > 0.01 ? (() => {
const d = Math.abs(x - orb.x);
const lift = Math.exp(-(d * d) / 3000) - Math.exp(-(d * d) / 30000) * 0.32;
const draw = lift * orb.amount * amp * 3;
const R = orbR() * (1 + orbEcc());
if (d >= R) return draw;
const chord = 2 * Math.sqrt(R * R - d * d);
const under = Math.max(0, Math.min(1,
((orb.y + R) - restNow) / (2 * R)));
return draw - chord * under * 0.22;
})() : 0);
{
const wallD = Math.min(gx, cols - 1 - gx);
if (wallD < 2 && restNow > 0) {
const kW = wallD === 0 ? 1 : 0.45;
const dev = restNow - surf;
surf -= dev * (dev > 0 ? 0.60 : 0.25) * kW;
}
}
const floorY = Math.max(restNow * 0.25,
restNow - (h - restNow) * 0.75, Math.min(6, restNow));
if (restNow > 0) surf = Math.max(floorY, surf);
surf = Math.max(1, Math.min(h, surf));
surfaceY[gx] = surf;
const lane = Math.sin(x * 0.031) * 2.1
+ Math.sin(x * 0.013 + 1.7) * 1.3;
const lane2 = Math.sin(x * 0.021 + 0.6) * 1.8;
for (let gy = 0; gy < rows; gy++) {
const y = gy * CELL;
if (y + CELL <= surf) continue;
const shaft = 0.5
+ 0.35 * Math.sin(y * 0.070 + lane2 * 0.7 + climb * 0.55)
+ 0.15 * Math.sin(x * 0.017);
const below = y - surf;
const tankCol = Math.min(h, Math.max(tank, h - surf));
const depth = quant(Math.max(0, Math.min(1, below / tankCol))
* (1 - 0.65 * jetK * jetNow));
const caus = quantA(0.5
+ 0.26 * Math.sin(y * 0.150 + lane + climb * 1.60)
+ 0.15 * Math.sin(y * 0.062 + lane2 + climb * 0.72)
+ 0.11 * Math.sin(y * 0.230 + lane * 1.6 + climb * 2.30)
+ 0.10 * Math.sin(x * 0.045));
const causS = quantA(0.5 + (caus - 0.5) * (1 + 1.15 * calm));
const causDepth = causS * (1 - depth * 0.65);
let inkH = 0, inkW = 0;
for (let ii = 0; ii < inks.length; ii++) {
const ik = inks[ii];
const iAge = (now - ik.t) / 1000;
if (iAge > INK_LIFE) continue;
let dx3 = x - ik.x, dy3 = y - ik.y;
const dist = Math.sqrt(dx3 * dx3 + dy3 * dy3);
if (dist > 0.5 && dist < 90) {
const curl = (ik.spin || 1) * 0.22
* Math.exp(-dist / 34)
* Math.exp(-iAge / 1.6);
if (curl > 0.004) {
const ca3 = Math.cos(curl), sa3 = Math.sin(curl);
const rx = dx3 * ca3 - dy3 * sa3;
dy3 = dx3 * sa3 + dy3 * ca3;
dx3 = rx;
}
}
const grow = 1 - Math.pow(1 - Math.min(1, iAge / INK_LIFE), 2.2);
const edge = grow * (56 + 74 * (ik.push || 1));
const band2 = 90 + 340 * grow;
const ring = Math.exp(-((dist - edge) * (dist - edge)) / band2);
const inside = dist < edge ? 0.34 : 0;
const near = Math.min(1, ring + inside);
if (near < 0.02) continue;
const life = Math.min(1, iAge / 0.2)
* Math.max(0, 1 - iAge / INK_LIFE);
const wgt = near * life;
inkH += ik.hue * wgt;
inkW += wgt;
}
const hue = (inkW > 0.001
? hueNow() + (inkH / inkW - hueNow()) * Math.min(0.85, inkW)
: hueNow())
+ Math.sin(t * 0.28 + depth * 2.4) * 7
+ Math.sin(y * 0.045 + climb * 0.30) * 4
+ causDepth * 4;
const wall = Math.min(gx, cols - 1 - gx);
const cling = 1 + (wall < 2
? (2 - wall) * 0.9 * (1 - 0.72 * calm) : 0);
const skin = 1 - 0.82 * calm;
const chop = (((gx * 5 + gy * 11) % 8) / 8 - 0.5)
* CELL * 1.2 * Math.min(1.35, stir);
const crest = below < CELL * cling * skin + chop;
const foam = below < CELL * (2.5 - 1.15 * calm);
let lig, sat, alpha;
if (crest) {
lig = baseLig + (lightPaper ? 34 : 22) + causDepth * 6;
sat = baseSat - (lightPaper ? 6 : 12);
alpha = 0.96;
} else if (foam) {
lig = baseLig + 14 + causDepth * 8;
sat = baseSat - 6;
alpha = quantA(0.80 + caus * 0.12);
} else {
const deepLig = lightPaper
? Math.max(22, paperLig - 60)
: Math.min(62, paperLig + 30);
lig = (baseLig + 12) + (deepLig - (baseLig + 12)) * depth
+ causDepth * (9 + 6 * calm) + shaft * 5;
sat = baseSat + depth * 16 - causDepth * 6;
alpha = quantA((lightPaper ? 0.70 : 0.48)
+ depth * (lightPaper ? 0.28 : 0.50)
+ caus * 0.06);
if (lightPaper) sat += 12;
}
if (depth > 0.62) {
const s2 = (depth - 0.62) / 0.38;
lig += (paperLig - lig) * s2 * 0.72;
sat -= s2 * (lightPaper ? 22 : -14);
const grit = ((gx * 3 + gy * 7) % 9) / 9;
if (grit < s2 * 0.55) {
lig += (paperLig > lig ? 1 : -1) * (4 + s2 * 5);
}
}
ctx.fillStyle = 'hsla(' + Math.round(hue) + ','
+ Math.round(Math.max(0, Math.min(100, sat))) + '%,'
+ band(Math.max(0, Math.min(100, lig))) + '%,'
+ alpha.toFixed(2) + ')';
ctx.fillRect(x, y, CELL, CELL);
}
}
}
surfaceNow = surfaceY;
if (springNow > 0.15 && !reduce && surfaceY && drops.length < DROPS_MAX
&& Math.random() < 0.28) {
const gxm = Math.round(cols / 2);
const topY = surfaceY[gxm] != null ? surfaceY[gxm] : h;
const many = 1 + Math.floor(Math.random() * 2);
for (let k = 0; k < many; k++) {
drops.push({
x: w / 2 + (Math.random() - 0.5) * CELL * 5,
y: topY - CELL,
vx: (Math.random() - 0.5) * 52,
vy: -(14 + Math.random() * 26),
life: 0, shed: true,
hue: hueNow() + (Math.random() - 0.5) * 16,
size: Math.random() < 0.45 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
}
const splashRoom = 1 - Math.max(0, Math.min(1, (r - 0.72) / 0.20));
if (!splashed && stageMs >= S_RISE && surfaceY && !reduce
&& splashRoom > 0.05) {
splashed = true;
const many = Math.min(DROPS_MAX,
Math.max(1, Math.round(Math.max(10, cols / 2.5) * splashRoom)));
for (let k = 0; k < many; k++) {
const gx = Math.floor((k + 0.5) * cols / many);
const off = Math.abs(gx / Math.max(1, cols - 1) - 0.5) * 2;
const roll = Math.random();
const size = roll > 0.86 ? 3 : (roll > 0.58 ? 2 : 1);
const heavy = 1 - (size - 1) * 0.16;
drops.push({
x: gx * CELL,
y: (surfaceY[gx] || h) - CELL,
vx: (gx < cols / 2 ? 1 : -1) * off * (22 + Math.random() * 26),
vy: -(170 + off * 120 + Math.random() * 120) * heavy,
size,
shape: Math.floor(Math.random() * 4),
spin: Math.random() * 6.283,
hue: hueNow() + (Math.random() - 0.5) * 68,
life: 0
});
}
}
if (airborne > 0.0002) {
airborne = Math.max(0, airborne - airborne * 4.2 * dt - 0.004);
if (airborne <= 0.02 && splashAmp > 0 && !splashAt) splashAt = now;
} else if (airborne !== 0) {
airborne = 0;
if (splashAmp > 0 && !splashAt) splashAt = now;
}
if (inks.length) {
for (let ii = inks.length - 1; ii >= 0; ii--) {
if ((now - inks[ii].t) / 1000 > INK_LIFE) inks.splice(ii, 1);
}
}
if (surfaceNow && rNow > 0.04) {
const busy = inks.length > 0 ? 1 : 0.18;
const body = 0.35 + Math.min(1, rNow) * 0.65;
if (now - bubbleAt > (620 / ((0.4 + busy) * body)) && bubbles.length < BUBBLES_MAX) {
bubbleAt = now;
const bx = Math.random() * w;
const gxb = Math.max(0, Math.min(cols - 1, Math.round(bx / CELL)));
const from = surfaceNow[gxb] || h;
const depthStart = from + (h - from) * (0.25 + Math.random() * 0.7);
bubbles.push({
x: bx,
y: Math.min(h - CELL, depthStart),
size: Math.random() < 0.3 ? 2 : 1,
rise: 16 + Math.random() * 26,
phase: Math.random() * 6.283,
wob: 0.6 + Math.random() * 1.4,
hue: hueNow() + (Math.random() - 0.5) * 40
});
}
for (let bi = bubbles.length - 1; bi >= 0; bi--) {
const bb = bubbles[bi];
bb.y -= bb.rise * (bb.size === 2 ? 1.5 : 1) * dt;
bb.phase += dt * 2.2;
const bx2 = bb.x + Math.sin(bb.phase) * bb.wob * 2.4;
const gxb = Math.max(0, Math.min(cols - 1, Math.round(bx2 / CELL)));
const line = surfaceNow[gxb] || h;
if (bb.y <= line + CELL * 0.5) {
if (pokes.length < POKES_MAX) {
pokes.push({ x: bx2, y: null, t: now, still: true, hue: bb.hue });
}
if (bb.size === 2 && drops.length < DROPS_MAX && Math.random() < 0.6) {
drops.push({
x: bx2, y: line - CELL,
vx: (Math.random() - 0.5) * 26,
vy: -(26 + Math.random() * 34),
life: 0, shed: true, pull: true,
hue: bb.hue, size: 1,
shape: Math.floor(Math.random() * 4)
});
}
bubbles.splice(bi, 1);
continue;
}
const px3 = Math.round(bx2 / CELL) * CELL;
const py3 = Math.round(bb.y / CELL) * CELL;
ctx.fillStyle = 'hsla(' + Math.round(bb.hue) + ','
+ Math.round(Math.max(0, baseSat - 18)) + '%,'
+ band(Math.min(96, baseLig + 30)) + '%,0.66)';
ctx.fillRect(px3, py3, CELL, CELL);
if (bb.size === 2) {
ctx.fillRect(px3 + CELL, py3, CELL, CELL);
ctx.fillRect(px3, py3 + CELL, CELL, CELL);
ctx.fillRect(px3 + CELL, py3 + CELL, CELL, CELL);
}
}
} else if (bubbles.length) {
bubbles.length = 0;
}
if (Math.abs(tilt) > 0.0005 || Math.abs(tiltV) > 0.0005) {
const wsq = sloshW() * sloshW();
tiltV += -wsq * tilt * dt - SLOSH_DAMP * tiltV * dt;
tilt += tiltV * dt;
const cap = 1.0;
if (Math.abs(tilt) > cap) {
tilt = tilt < 0 ? -cap : cap;
if (Math.abs(tiltV) > 0.35 && surfaceNow
&& drops.length < DROPS_MAX && now - lastSpillAt > 90) {
lastSpillAt = now;
const side = tilt > 0 ? cols - 1 : 0;
const sx = side * CELL;
const many = Math.min(DROPS_MAX - drops.length,
2 + Math.round(Math.abs(tiltV) * 4));
for (let k = 0; k < many; k++) {
drops.push({
x: sx + (Math.random() - 0.5) * CELL * 3,
y: (surfaceNow[side] || h) - CELL,
vx: (tilt > 0 ? 1 : -1) * (10 + Math.random() * 40),
vy: -(50 + Math.random() * 110),
life: 0,
shed: true,
hue: hueNow() + (Math.random() - 0.5) * 60,
size: Math.random() < 0.3 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
tiltV *= 0.72;
}
}
} else if (tilt !== 0 || tiltV !== 0) {
tilt = 0; tiltV = 0;
}
if (waves.length) {
const spray = (px2, many, upward, hue) => {
const gxs = Math.max(0, Math.min(cols - 1, Math.round(px2 / CELL)));
const from = (surfaceNow ? (surfaceNow[gxs] || h) : h) - CELL;
const room = Math.max(0, Math.min(DROPS_MAX - drops.length, many));
for (let k = 0; k < room; k++) {
drops.push({
x: px2 + (Math.random() - 0.5) * CELL * 3,
y: from,
vx: (Math.random() - 0.5) * 90 + upward * 0,
vy: -(70 + Math.random() * 130),
life: 0,
shed: true,
hue: hue + (Math.random() - 0.5) * 60,
size: Math.random() < 0.34 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
};
for (let i = waves.length - 1; i >= 0; i--) {
const wv = waves[i];
if (!wv.born) wv.born = now;
const age = (now - wv.born) / 1000;
wv.x += wv.dir * (wv.spd || WAVE_SPEED) * dt;
if (!wv.broke && (wv.x <= 1 || wv.x >= w - 1)) {
wv.broke = true;
wv.x = wv.x <= 1 ? 0 : w;
const left = Math.exp(-age / (WAVE_LIFE * 0.55));
const sp = wv.spray == null ? 1 : wv.spray;
spray(wv.x, Math.round((1 + left * 4) * sp), 0, wv.hue);
if (pokes.length >= POKES_MAX) pokes.shift();
const room2 = Math.min(1, restSeen / (h * 0.22));
const bite2 = Math.min(1, sp / 3) * room2;
pokes.push({ x: wv.x, y: null, t: now,
still: bite2 < 0.5, hue: wv.hue });
agitLevel = Math.min(0.75,
agitNow(now) + (0.04 + left * 0.10) * bite2);
agitAt = now;
}
if (age > WAVE_LIFE || (wv.broke && age > WAVE_LIFE * 0.4)) {
waves.splice(i, 1);
}
}
for (let i = waves.length - 1; i >= 0; i--) {
for (let j = i - 1; j >= 0; j--) {
const a = waves[i], b = waves[j];
if (!a || !b || a.broke || b.broke) continue;
if (a.dir === b.dir) continue;
if (Math.abs(a.x - b.x) > CELL * 2.2) continue;
if ((b.x - a.x) * a.dir < 0) continue;
const mid = (a.x + b.x) / 2;
const ageA = a.born ? (now - a.born) / 1000 : 0;
const ageB = b.born ? (now - b.born) / 1000 : 0;
const force = Math.exp(-ageA / (WAVE_LIFE * 0.55))
+ Math.exp(-ageB / (WAVE_LIFE * 0.55));
spray(mid, 6 + Math.round(force * 11), 0, (a.hue + b.hue) / 2);
if (pokes.length >= POKES_MAX) pokes.shift();
pokes.push({ x: mid, y: null, t: now, still: false,
hue: (a.hue + b.hue) / 2 });
agitLevel = Math.min(0.95, agitNow(now) + 0.08 + force * 0.16);
agitAt = now;
waves.splice(i, 1);
waves.splice(j, 1);
i = Math.min(i, waves.length);
break;
}
}
}
if (orb.amount > 0.001 || orb.want > 0.001) {
orb.vel *= Math.pow(0.36, dt);
orb.spin += orb.vel * dt;
if (!orb.falling) {
const spinN = Math.min(1, Math.abs(orb.vel) / ORB_SPIN_CAP);
const spinLoss = spinN * spinN * 1.6;
orb.want = Math.max(0, orb.want
- ORB_LEAK * spinLoss * dt * (0.35 + orb.want * 0.65));
orb.amount += (orb.want - orb.amount) * Math.min(1, ORB_RATE * dt);
if (orb.want > 0.02 && orb.vel > 0.8
&& drops.length < DROPS_MAX && Math.random() < 0.5) {
const a = Math.random() * Math.PI * 2;
const R2 = orbR();
drops.push({
x: orb.x + Math.cos(a) * R2,
y: orb.y + Math.sin(a) * R2,
vx: Math.cos(a) * 26 + (Math.random() - 0.5) * 30,
vy: Math.sin(a) * 20 + 25,
life: 0,
shed: true,
hue: hueNow() + (Math.random() - 0.5) * 70,
size: 1,
shape: Math.floor(Math.random() * 4)
});
}
}
if (!orb.falling && !orb.dropping && now - orb.last > ORB_IDLE) {
orb.dropping = true;
orb.vy = 0;
}
if (!orb.dropping && !orb.falling) {
const rr2 = orbR() * (1 + orbEcc());
if (orb.y - rr2 < 0) orb.y = rr2;
}
if (orb.dropping) {
orb.vy += 780 * dt;
orb.y += orb.vy * dt;
const col = Math.max(0, Math.min(cols - 1, Math.round(orb.x / CELL)));
const surf = surfaceNow ? (surfaceNow[col] || h) : h;
if (orb.y + orbR() >= surf || orb.y >= h) {
orb.dropping = false;
orb.last = 0;
}
}
if (!orb.falling && !orb.dropping && now - orb.last > ORB_IDLE) {
orb.falling = true;
orb.dropping = false;
orb.vy = 0;
orb.want = 0;
const held = Math.pow(orb.amount, 1.6) * (0.55 + rNow * 0.9);
agitLevel = Math.min(2.4, agitNow(now) + 0.03 + held * 2.6);
agitAt = now;
splashAmp = held * 0.17;
splashAt = 0;
airborne = Math.min(1, airborne + orb.amount);
const heavy = Math.min(DROPS_MAX - drops.length,
1 + Math.round(held * 44));
for (let k = 0; k < heavy; k++) {
const a = Math.random() * Math.PI * 2;
const r = orbR() * (0.25 + Math.random() * 0.75);
drops.push({
x: orb.x + Math.cos(a) * r,
y: orb.y + Math.sin(a) * r,
vx: Math.cos(a) * (90 + Math.random() * 210) + orb.vel * 12,
vy: Math.sin(a) * 130 - 120 - Math.random() * 90,
life: 0,
shed: true,
hue: hueNow() + (Math.random() - 0.5) * 90,
size: 1 + (Math.random() < 0.6 ? 1 : 0),
shape: Math.floor(Math.random() * 4)
});
}
for (const dir of [-1, 1]) {
if (waves.length >= WAVES_MAX) waves.shift();
waves.push({
x: orb.x,
dir,
born: 0,
amp: waveAmp() * (0.9 + held * 1.7),
wid: 1500,
spd: 250 + held * 90,
hollow: 0.5,
spray: 2,
hue: hueNow() + (Math.random() - 0.5) * 60,
broke: false
});
}
const hits = 1 + Math.round(held * 4);
const reach = w * (0.08 + held * 0.42);
for (let k = 0; k < hits; k++) {
if (pokes.length >= POKES_MAX) pokes.shift();
const off = hits === 1 ? 0
: ((k / (hits - 1)) - 0.5) * 2 * reach;
pokes.push({
x: Math.max(0, Math.min(w, orb.x + off)),
y: null,
t: now + Math.abs(off) / (w * 0.9) * 260,
still: false,
hue: hueNow() + (Math.random() - 0.5) * 120
});
}
}
if (orb.falling) {
orb.amount = Math.max(0, orb.amount - dt * (3.0 + 2.5 * (1 - orb.amount)));
orb.vel *= Math.pow(0.05, dt);
if (orb.amount <= 0.001) { orb.amount = 0; orb.vel = 0; orb.falling = false; }
}
if (!orb.falling && orb.vel > 1.2 && now - orbShedAt > ORB_SHED * 1000
&& drops.length < DROPS_MAX) {
orbShedAt = now;
const R = orbR();
const a = orb.spin + Math.random() * 0.9;
drops.push({
x: orb.x + Math.cos(a) * R,
y: orb.y + Math.sin(a) * R,
vx: -Math.sin(a) * orb.vel * R * 0.55,
vy: Math.cos(a) * orb.vel * R * 0.55 - 20,
life: 0,
shed: true,
hue: hueNow() + (Math.random() - 0.5) * 80,
size: Math.random() < 0.4 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
const R = orbR() * (1 + orbEcc());
if (R > CELL) {
const cx = orb.x, cy = orb.y;
const g0 = Math.max(0, Math.floor((cx - R) / CELL));
const g1 = Math.min(cols - 1, Math.ceil((cx + R) / CELL));
const r0 = Math.max(0, Math.floor((cy - R) / CELL));
const r1 = Math.min(rows - 1, Math.ceil((cy + R) / CELL));
for (let gy = r0; gy <= r1; gy++) {
for (let gx = g0; gx <= g1; gx++) {
const px2 = gx * CELL + CELL / 2;
const py2 = gy * CELL + CELL / 2;
const dx2 = px2 - cx, dy2 = py2 - cy;
const rr = Math.hypot(dx2, dy2);
const angC = Math.atan2(dy2, dx2);
const Rh = orbRAt(angC);
if (rr > Rh) continue;
const u = rr / Rh;
const thr = (((gx * 7 + gy * 13) % 16) / 16);
if (u > 0.72 && (u - 0.72) / 0.28 > 1 - thr) continue;
const ang = angC;
const arm = Math.sin(ang * 2 + orb.spin * 2.2 - u * 5.5);
const lit = arm > 0.15;
const dith = (((gx * 7 + gy * 13) % 8) / 8 - 0.5);
const litness = (arm + 1) * 0.5;
const oh0 = hueNow() + arm * 9 + (0.5 - u) * 10 + dith * 4;
let oh = oh0;
if (auroraMix > 0.01) {
const ca = Math.cos(orb.spin), sa = Math.sin(orb.spin);
const ru = (dx2 * ca - dy2 * sa) / w;
const rv = (dx2 * sa + dy2 * ca) / h;
const cellCol = auroraCell(0.5 + ru, 0.5 + rv, t);
const cellM = /^hsla?\((-?[\d.]+)/.exec(String(cellCol || ''));
const cellHue = cellM ? parseFloat(cellM[1]) : NaN;
if (isFinite(cellHue)) {
oh = oh0 + (cellHue - oh0) * auroraMix;
}
}
ctx.fillStyle = 'hsla(' + Math.round(oh) + ','
+ Math.round(Math.max(0, baseSat - 4 - litness * 16)) + '%,'
+ band(Math.min(96, baseLig + 6 + litness * 30 + (0.5 - u) * 10)) + '%,'
+ (0.86 + (1 - u) * 0.13).toFixed(2) + ')';
ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
}
}
}
}
if (drops.length) {
const sprayFill = 'hsla(' + Math.round(hueNow()) + ','
+ Math.round(Math.max(0, baseSat - 24)) + '%,'
+ band(Math.min(100, baseLig + 44)) + '%,0.95)';
ctx.fillStyle = sprayFill;
for (let i = drops.length - 1; i >= 0; i--) {
const d = drops[i];
if (d.hue != null) {
const j = ((d.shape || 0) * 7 % 5) / 5 - 0.4;
ctx.fillStyle = 'hsla(' + Math.round(d.hue) + ','
+ Math.round(Math.max(0, baseSat - 6 + j * 18)) + '%,'
+ band(Math.min(100, baseLig + 30 + j * 14)) + '%,0.95)';
} else {
ctx.fillStyle = sprayFill;
}
d.vy += 900 * dt;
d.x += d.vx * dt;
d.y += d.vy * dt;
d.life += dt;
const col = Math.max(0, Math.min(cols - 1, Math.round(d.x / CELL)));
const floorY = surfaceY ? surfaceY[col] : h;
const graced = d.shed && d.life < 0.15;
const landed = !graced && d.vy > 0 && d.y >= floorY;
if (d.life > 1.4 || d.x < -CELL || d.x > w || landed) {
if (landed && d.shed && !d.pull && d.vy > 90
&& now - lastRingAt > 55 && pokes.length < POKES_MAX) {
lastRingAt = now;
pokes.push({
x: d.x,
y: null,
t: now,
still: true,
hue: d.hue != null ? d.hue : hueNow()
});
}
drops.splice(i, 1);
continue;
}
const dx = Math.round(d.x / CELL) * CELL;
const dy = Math.round(d.y / CELL) * CELL;
const dthr = (((dx / CELL | 0) * 7 + (dy / CELL | 0) * 13) % 16) / 16;
if (1 - d.life / 1.4 <= dthr) continue;
const sz = d.size || 1;
ctx.fillRect(dx, dy, CELL, CELL);
if (sz > 1) {
const keep = 1 - d.life / 1.4;
const arms = BLOB_SHAPES[(d.shape || 0) % BLOB_SHAPES.length];
const take = sz === 3 ? arms.length : Math.min(2, arms.length);
for (let a = 0; a < take; a++) {
if (keep < (a + 1) / (take + 1) * 0.85) continue;
ctx.fillRect(dx + arms[a][0] * CELL,
dy + arms[a][1] * CELL, CELL, CELL);
}
}
}
}
if (auroraMix > 0 && surfaceY) {
for (let gx = 0; gx < cols; gx++) {
const top = surfaceY[gx] != null ? surfaceY[gx] : 0;
if (!auroraFront || auroraFront.length !== cols) {
auroraFront = new Array(cols).fill(-Infinity);
}
const from = Math.min(top, restNow);
const reach = from + (h + CELL * 12 - from) * (auroraMix * auroraMix);
if (reach > auroraFront[gx]) auroraFront[gx] = reach;
const front = auroraFront[gx];
for (let gy = 0; gy < rows; gy++) {
const y = gy * CELL;
if (y + CELL <= top) continue;
const seedX = gx * CELL / w, seedY = gy * CELL / h;
const lobes =
Math.sin(seedX * 5.1 + p1) * 0.16
+ Math.sin(seedY * 3.7 - p2 + seedX * 2.2) * 0.12
+ Math.sin((seedX + seedY) * 4.3 + p3) * 0.09;
const thr = Math.max(0, Math.min(1,
(((gx * 7 + gy * 13) % 16) + 0.5) / 16 + lobes));
const into = (front - y) / Math.max(CELL * 6, 1);
if (into <= thr) continue;
const depthA = quantA(Math.min(1, 0.35 + into * 0.9));
const u = gx / cols - 0.5, v2 = gy / rows - 0.5;
const rad = Math.sqrt(u * u + v2 * v2);
const turn = Math.sin(t * 0.42 + swirlPhase);
const pull = (1 - Math.min(1, rad * 2)) * 0.30 * auroraMix;
const ang = Math.atan2(v2, u) + turn * 1.1 * pull;
const draw = pull * (0.55 + 0.45 * Math.abs(turn));
let su = 0.5 + Math.cos(ang) * rad * (1 - draw);
let sv = 0.5 + Math.sin(ang) * rad * (1 - draw);
const fade = quantA(Math.min(1, (into - thr) * 2.2));
if (fade <= 0) continue;
ctx.globalAlpha = Math.min(1, depthA * fade);
let rot = 0;
let phase = 0, fire = 0;
if (auroraJitter > 0.01) {
const j = ((gx * 11 + gy * 17) % 32) / 32 - 0.5;
rot += j * 220 * auroraJitter;
}
if (orb.amount > 0.01) {
const cu = orb.x / w, cv = orb.y / h;
const du = su - cu, dv = sv - cv;
const dd = Math.hypot(du, dv);
const sw = Math.exp(-dd * 6) * orb.amount * 3.2
+ orb.spin * Math.exp(-dd * 9) * 0.35;
if (Math.abs(sw) > 0.03) {
const ca = Math.cos(sw), sa = Math.sin(sw);
su = cu + du * ca - dv * sa;
sv = cv + du * sa + dv * ca;
}
}
let newest = 1e9;
for (const pk of pokes) {
if (pk.hue == null) continue;
const a2 = (now - pk.t) / 1000;
if (a2 < newest) newest = a2;
}
for (const pk of pokes) {
if (pk.hue == null) continue;
const age = (now - pk.t) / 1000;
if (age > 2.4) continue;
const yield2 = 1 / (1 + Math.max(0, age - newest) * 2.2);
const d = pk.y != null
? Math.hypot(gx * CELL - pk.x, y - pk.y)
: Math.abs(gx * CELL - pk.x);
const reach = Math.exp(-d / 46) * Math.exp(-age / 1.5);
if (reach < 0.02) continue;
rot += (pk.hue - hueNow()) * reach * yield2;
if (pk.y != null) {
const cu = pk.x / w, cv = pk.y / h;
const du = su - cu, dv = sv - cv;
const dd = Math.hypot(du, dv);
const trav = dd * 7.5 - age * 2.4;
const grip = Math.min(1, age / 0.3)
* Math.exp(-age / 1.7);
phase += Math.sin(trav) * Math.exp(-dd * 3.6)
* grip * yield2 * 0.5;
fire += 0.6 * yield2 * Math.exp(-dd * 5.5)
* Math.min(1, age / 0.12)
* Math.exp(-age / 1.1);
}
}
rot = Math.max(-95, Math.min(95, rot));
if (rot !== 0) ctx.filter = 'hue-rotate(' + Math.round(rot) + 'deg)';
ctx.fillStyle = auroraCell(su, sv, t,
Math.max(-1.6, Math.min(1.6, phase)),
Math.min(1.15, fire));
ctx.fillRect(gx * CELL, y, CELL, CELL);
if (rot !== 0) ctx.filter = 'none';
ctx.globalAlpha = 1;
}
}
}
if (reduce) return;
last = now;
const busy = !reduce;
if (!busy) { raf = null; return; }
raf = requestAnimationFrame(step);
};
const step = (now) => {
if (now - last < 33) { raf = requestAnimationFrame(step); return; }
draw(now);
};
kick = () => {
if (reduce) { draw(performance.now()); return; }
if (raf == null) raf = requestAnimationFrame(step);
};
const pointAt = (ev) => {
let px = w / 2, py = h / 2;
try {
const box = canvas.getBoundingClientRect();
if (box && box.width > 0) px = (ev.clientX - box.left) * (w / box.width);
if (box && box.height > 0) py = (ev.clientY - box.top) * (h / box.height);
} catch (_) { zgCatch('buildGoalLiquid / pointAt: const box = canvas.getBoundingClientRect();', _); }
return {
x: Math.max(0, Math.min(w, px)),
y: Math.max(0, Math.min(h, py))
};
};
const inkPress = (p, now) => {
const BOX = [330, 340, 355, 8, 22, 36, 50, 265, 285, 300, 318];
const boxOdds = Math.max(0, Math.min(0.85, (rNow - 0.80) / 0.22));
const STEPS = [-155, -120, -85, -55, 55, 85, 120, 155, 180];
const hue = (Math.random() < boxOdds
? BOX[Math.floor(Math.random() * BOX.length)]
: hueNow() + STEPS[Math.floor(Math.random() * STEPS.length)])
+ (Math.random() - 0.5) * 22;
inkRun = (now - inkAt < 900) ? Math.min(8, inkRun + 1) : 1;
inkAt = now;
const push = 1 + (inkRun - 1) * 0.42;
if (inks.length >= INKS_MAX) inks.shift();
const gxi = Math.max(0, Math.min(cols - 1, Math.round(p.x / CELL)));
const line = surfaceNow ? (surfaceNow[gxi] || h) : h;
inks.push({ x: p.x, y: Math.max(p.y, line + CELL), t: now, hue, push,
spin: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.7) });
const wasVented = inkCharge >= 1;
if (inkCharge <= 0.01) inkChargeX = p.x;
else inkChargeX += (p.x - inkChargeX) * 0.45;
inkCharge = Math.min(1, inkCharge + 0.2);
inkChargeAt = now;
if (inkCharge >= 1 && !wasVented) {
inkCharge = 0;
inkVent = now;
const gxc = Math.max(0, Math.min(cols - 1, Math.round(inkChargeX / CELL)));
const surfC = surfaceNow ? (surfaceNow[gxc] || h) : h;
const room = Math.max(6, surfC);
const mid = Math.abs(inkChargeX - w / 2) < w * 0.09;
const dirs = mid ? [-1, 1] : [inkChargeX < w / 2 ? 1 : -1];
const swellAmp = Math.min(waveAmp() * 2.6, room * 0.62);
for (const dir of dirs) {
if (waves.length >= WAVES_MAX) waves.shift();
waves.push({
x: inkChargeX, dir, born: 0,
amp: swellAmp * (mid ? 0.78 : 1),
wid: 1700, spd: 240, hollow: 0.55, spray: 1.2,
hue, broke: false
});
}
agitLevel = Math.min(0.55, agitNow(now) + 0.10);
agitAt = now;
if (surfaceNow && drops.length < DROPS_MAX) {
const many2 = Math.min(DROPS_MAX - drops.length, 3 + Math.floor(Math.random() * 3));
for (let k = 0; k < many2; k++) {
drops.push({
x: inkChargeX + (Math.random() - 0.5) * CELL * 5,
y: surfC - CELL * 2,
vx: (Math.random() - 0.5) * 120 + (dirs.length === 1 ? dirs[0] * 40 : 0),
vy: -(55 + Math.random() * 90),
life: 0, shed: true,
hue: hue + (Math.random() - 0.5) * 40,
size: Math.random() < 0.3 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
}
}
if (surfaceNow) {
const bn = Math.min(BUBBLES_MAX - bubbles.length,
2 + Math.floor(Math.random() * 3));
for (let k = 0; k < bn; k++) {
bubbles.push({
x: p.x + (Math.random() - 0.5) * CELL * 5,
y: Math.min(h - CELL, line + CELL * (2 + Math.random() * 5)),
size: Math.random() < 0.4 ? 2 : 1,
rise: 22 + Math.random() * 30,
phase: Math.random() * 6.283,
wob: 0.6 + Math.random() * 1.3,
hue: hue + (Math.random() - 0.5) * 30
});
}
}
if (surfaceNow && drops.length < DROPS_MAX) {
const many = Math.min(DROPS_MAX - drops.length, 3 + Math.floor(Math.random() * 3));
for (let k = 0; k < many; k++) {
drops.push({
x: p.x + (Math.random() - 0.5) * CELL * 4,
y: line - CELL,
vx: (Math.random() - 0.5) * 105,
vy: -(48 + Math.random() * 78),
life: 0, shed: true,
hue: hue + (Math.random() - 0.5) * 40,
size: Math.random() < 0.3 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
}
if (pokes.length >= POKES_MAX) pokes.shift();
pokes.push({ x: p.x, y: null, t: now, still: true, hue });
kick();
};
const sloshPress = (p, now) => {
const u = Math.max(-1, Math.min(1, (p.x - w / 2) / (w / 2)));
const lever = Math.abs(u) < 0.06 ? 0 : u;
tiltV += lever * 2.6;
tiltV = Math.max(-5.5, Math.min(5.5, tiltV));
if (pokes.length >= POKES_MAX) pokes.shift();
pokes.push({
x: p.x, y: null, t: now, still: false,
hue: hueNow() + (Math.random() - 0.5) * 70
});
agitLevel = Math.min(0.55, agitNow(now) + (lever === 0 ? 0.12 : 0.04));
agitAt = now;
kick();
};
const orbPress = (p, now) => {
orb.falling = false;
orb.dropping = false;
orb.vy = 0;
orb.x = p.x;
orb.y = p.y;
const gap = Math.max(0, now - (orb.last || 0));
const urge = Math.max(0, Math.min(1, 1 - gap / 520));
orb.last = now;
const room = Math.max(0, 1 - orb.want);
orb.want = Math.min(1, orb.want
+ ORB_BITE * (0.45 + urge * 1.1) * (0.35 + room * 0.65));
orb.streak = urge > 0.15 ? Math.min(14, (orb.streak || 0) + 1) : 0;
const zeal = 1 + (orb.streak / 14) * 0.7;
orb.vel = Math.min(ORB_SPIN_CAP, orb.vel + (0.7 + urge * 2.4) * zeal);
if (surfaceNow) {
const many = Math.min(Math.max(0, DROPS_MAX - drops.length), 7);
for (let k = 0; k < many; k++) {
const gx2 = Math.floor(Math.random() * cols);
const sx = gx2 * CELL;
const sy = surfaceNow[gx2] || h;
const flight = 0.42;
drops.push({
x: sx,
y: sy - CELL,
vx: (p.x - sx) / flight,
vy: (p.y - sy) / flight - 900 * flight * 0.5,
life: 0,
shed: true,
pull: true,
hue: hueNow() + (Math.random() - 0.5) * 70,
size: Math.random() < 0.35 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
}
if (pokes.length >= POKES_MAX) pokes.shift();
pokes.push({
x: p.x, y: p.y, t: now, still: true,
hue: hueNow() + 40 + Math.random() * 220
});
kick();
};
const bite = (ev) => {
const p = pointAt(ev);
const now = performance.now();
if (full && (now - stageStart >= S_SPLASH)) { hold = null; return; }
const heldFor = hold ? Math.min(1, (now - hold.t) / 1100) : 0;
const eased = 1 - Math.pow(1 - heldFor, 3);
hold = null;
const gx = Math.max(0, Math.min(cols - 1, Math.round(p.x / CELL)));
const surf = surfaceNow ? (surfaceNow[gx] || h) : h;
const tank = Math.max(1, h - surf);
const under = (p.y - surf) / tank;
let kind = 'surface';
if (under < -0.06) kind = 'air';
else if (under < 0.10) kind = 'crest';
else kind = 'swell';
const room = Math.max(6, surf);
const base = waveAmp();
const wants = base * (kind === 'swell' ? 2.1 : kind === 'air' ? 3.4 : 2.8)
* (0.75 + eased * 1.5);
const height = Math.min(wants, room * 0.7);
const spilled = Math.max(0, wants - height) / Math.max(1, base);
const jitter = (v, by) => v * (1 - by + Math.random() * by * 2);
const shapes = {
air: { wid: 760, spd: 330, hollow: 0.30, spray: 5 },
crest: { wid: 900, spd: 305, hollow: 0.42, spray: 3 },
swell: { wid: 2100, spd: 215, hollow: 0.62, spray: 1 },
surface: { wid: 900, spd: 305, hollow: 0.42, spray: 3 }
};
const sh = shapes[kind] || shapes.crest;
const hue = hueNow() + (Math.random() - 0.5) * 70;
const mid = Math.abs(p.x - w / 2) < w * 0.09;
const dirs = mid ? [-1, 1] : [p.x < w / 2 ? 1 : -1];
for (const dir of dirs) {
if (waves.length >= WAVES_MAX) waves.shift();
waves.push({
x: p.x,
dir,
born: 0,
amp: jitter(height, 0.14) * (mid ? 0.78 : 1),
wid: jitter(sh.wid, 0.18),
spd: jitter(sh.spd, 0.10),
hollow: sh.hollow,
spray: sh.spray * (1 + spilled * 0.8) * (0.6 + eased),
hue,
broke: false
});
}
if (pokes.length >= POKES_MAX) pokes.shift();
pokes.push({ x: p.x, y: null, t: now, still: false, hue });
agitLevel = Math.min(0.55, agitNow(now) + 0.02 + eased * 0.05);
agitAt = now;
if (surfaceNow && (spilled > 0.2 || eased > 0.3)) {
const many = Math.min(DROPS_MAX - drops.length,
1 + Math.round(spilled * 5 + eased * 6));
for (let k = 0; k < many; k++) {
drops.push({
x: p.x + (Math.random() - 0.5) * CELL * 4,
y: surf - CELL,
vx: (Math.random() - 0.5) * 110,
vy: -(60 + Math.random() * 120),
life: 0,
shed: true,
hue: hue + (Math.random() - 0.5) * 50,
size: Math.random() < 0.3 ? 2 : 1,
shape: Math.floor(Math.random() * 4)
});
}
}
kick();
};
if (!(Platform && Platform.isMobile) && !reduce) {
wrap.addEventListener('pointerdown', (ev) => {
const p = pointAt(ev);
const now = performance.now();
try { if (wrap.setPointerCapture) wrap.setPointerCapture(ev.pointerId); } catch (_) { zgCatch('buildGoalLiquid: if (wrap.setPointerCapture) wrap.setPointerCapture(ev.pointerId);', _); }
if (full && (now - stageStart >= S_SPLASH)) return;
const toy = toyHere();
if (toy === 'orb') { orbPress(p, now); return; }
if (toy === 'slosh') { sloshPress(p, now); return; }
if (toy === 'ink') { inkPress(p, now); return; }
hold = { x: p.x, y: p.y, t: now };
kick();
});
wrap.addEventListener('pointermove', (ev) => {
const hasOrb = orb.amount > 0.001 && !orb.falling && !orb.dropping;
if (!hold && !hasOrb) return;
const p = pointAt(ev);
if (hold) { hold.x = p.x; hold.y = p.y; }
if (hasOrb) { orb.x = p.x; orb.y = p.y; }
});
wrap.addEventListener('pointerup', (ev) => { if (hold) bite(ev); });
wrap.addEventListener('pointercancel', (ev) => { if (hold) bite(ev); });
wrap.addEventListener('pointerleave', (ev) => { if (hold) bite(ev); });
}
wrap.zgPour = () => { pour(); kick(); };
pour();
raf = requestAnimationFrame(draw);
return wrap;
}
_rgbToHsl(r, g, b) {
r /= 255; g /= 255; b /= 255;
const max = Math.max(r, g, b), min = Math.min(r, g, b);
const l = (max + min) / 2;
let hue = 0, s = 0;
if (max !== min) {
const d = max - min;
s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0));
else if (max === g) hue = ((b - r) / d + 2);
else hue = ((r - g) / d + 4);
hue *= 60;
}
return [hue, s * 100, l * 100];
}
registerGoalStates() {
const s = this.settings;
if (!this._goalStates) this._goalStates = [];
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
const fpath = view && view.file ? view.file.path : null;
const ftarget = fpath ? this.fileGoalFor(fpath) : 0;
if (fpath && ftarget) {
const words = this._zgLastTotalWordCount || 0;
this._goalStates.push({
kind: 'file', ratio: Math.min(words / ftarget, 1), met: words >= ftarget
});
}
const dpath = this.activeFolderPath();
const dtarget = dpath ? this.folderTargetRollup(dpath).value : 0;
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
const prev = this._folderWordCache;
this._folderWordCache = { path, words: stats.words };
if (!prev || prev.path !== path || prev.words !== stats.words) this.updateRetroStatusBar();
} catch (_) {
} finally { this._folderWordBusy = false; }
}
historyLongDate(key) {
const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
if (!m) return String(key || '');
const month = HISTORY_MONTHS[parseInt(m[2], 10) - 1];
if (!month) return String(key);
return parseInt(m[3], 10) + ' ' + month + ' ' + m[1];
}
historyDateKey(d) {
const dt = d instanceof Date ? d : new Date();
const p = (n) => (n < 10 ? '0' : '') + n;
return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
}
historyEnsure() {
let h = this._history;
if (!h || typeof h !== 'object') h = {};
if (!h.days || typeof h.days !== 'object' || Array.isArray(h.days)) h.days = {};
if (h.started === undefined) h.started = null;
if (!h.paths || typeof h.paths !== 'object' || Array.isArray(h.paths)) h.paths = {};
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
historyBaselines() {
const s = this.settings;
if (!s.historyBaselines || typeof s.historyBaselines !== 'object'
|| Array.isArray(s.historyBaselines)) s.historyBaselines = {};
return s.historyBaselines;
}
historyCompact(h, key) {
if (!h.today || h.today.date === key) return false;
const t = h.today;
if (t.a || t.r) {
h.days[t.date] = { a: t.a, r: t.r, n: t.n };
if (Object.keys(t.by).length) h.paths[t.date] = t.by;
}
h.today = { date: key, a: 0, r: 0, n: 0, by: {} };
return true;
}
historyDefaultPath() {
let p = String(this.settings.historyFilePath || 'Word-Smith/ws-history.md').trim();
p = p.replace(/^\/+/, '');
if (!/\.md$/i.test(p)) p += '.md';
return this.storeResolve(p, 'history.md');
}
historyStorePath() { return this._historyPath || null; }
async historyMarkSeen() {
if (this.settings.historySeen) return;
this.settings.historySeen = true;
try { await this.saveData(this.settings); }
catch (e) {
this.storeWriteFailed(WS_WRITE.settings, e,
'Word-Smith will look for the file again next time.');
}
}
historyIsStoreFile(text) {
return String(text || '').indexOf(HISTORY_MARK_START) !== -1;
}
async historyTrackingOn() {
if (this.settings.historyTracking) return false;
this.settings.historyTracking = true;
await this.saveSettings();
await this.historyLoad();
await this.historyWrite(true);
return true;
}
async historyFindFile() {
const vault = this.app.vault;
const check = async (file) => {
if (!file || !(file instanceof TFile)) return false;
try { return this.historyIsStoreFile(await vault.cachedRead(file)); }
catch (_) { return false; }
};
if (this._historyPath) {
const f = vault.getAbstractFileByPath(this._historyPath);
if (await check(f)) return f;
}
const want = this.historyDefaultPath();
const at = vault.getAbstractFileByPath(want);
if (await check(at)) return at;
const base = want.split('/').pop().toLowerCase();
const all = vault.getMarkdownFiles();
const named = all.filter(f => f.path.toLowerCase().endsWith('/' + base)
|| f.path.toLowerCase() === base);
for (const f of named) if (await check(f)) return f;
const rest = all.filter(f => named.indexOf(f) === -1)
.filter(f => !f.stat || f.stat.size < 4000000)
.sort((a, b) => (a.stat ? a.stat.size : 0) - (b.stat ? b.stat.size : 0));
for (const f of rest) if (await check(f)) return f;
return null;
}
async historyLoad() {
if (this._historyLoading) return this._historyLoading;
this._historyLoading = (async () => {
let file = null;
try { file = await this.historyFindFile(); } catch (_) { zgCatch('historyLoad: file = await this.historyFindFile();', _); }
let parsed = { started: null, days: {} };
if (file) {
this._historyPath = file.path;
try { parsed = this.historyParse(await this.app.vault.read(file)); } catch (_) { zgCatch('historyLoad: parsed = this.historyParse(await this.app.vault.read(file));', _); }
}
const h = { started: parsed.started, days: parsed.days,
paths: parsed.paths || {},
today: { date: this.historyDateKey(), a: 0, r: 0, n: 0, by: {} } };
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
historyNoteChange(file) {
if (!this.settings.historyTracking) return;
if (!file || !file.path || !/\.md$/i.test(file.path)) return;
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
if (!this._historyReady) await this.historyLoad();
const file = this.app.vault.getAbstractFileByPath(path);
if (!file || !(file instanceof TFile)) return;
if (path === this._historyPath) return;
if (!this.isFileCounted(file)) return;
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
} catch (_) { }
}
historyRecord(path, count) {
const h = this.historyEnsure();
const base = this.historyBaselines();
const key = this.historyDateKey();
const rolled = this.historyCompact(h, key);
const had = Object.prototype.hasOwnProperty.call(base, path);
const prev = had ? base[path] : 0;
base[path] = count;
if (!had) { this.historyQueueSave(rolled); return; }
const delta = count - prev;
if (delta === 0) { if (rolled) this.historyQueueSave(true); return; }
const t = h.today;
if (delta > 0) t.a += delta; else t.r += -delta;
t.n += delta;
if (this.settings.historyPerFile !== false) {
const b = t.by[path] || (t.by[path] = { a: 0, r: 0, n: 0 });
if (delta > 0) b.a += delta; else b.r += -delta;
b.n += delta;
}
if (!h.started) h.started = key;
this.historyQueueSave(rolled);
}
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
try { await this.saveData(this.settings); }
catch (e) {
this.storeWriteFailed(WS_WRITE.settings, e,
'Word-Smith will look for the file again next time.');
}
return await this.historyWrite(force);
}
historyRenamePath(oldPath, newPath) {
if (this._historyPath && oldPath === this._historyPath) {
this._historyPath = newPath;
this.settings.historyFilePath = newPath;
this.saveSettings();
return;
}
let moved = this.historyRenameRecord(oldPath, newPath);
const base = this.historyBaselines();
for (const key of Object.keys(base)) {
const next = this.historyMovedPath(key, oldPath, newPath);
if (next === null) continue;
if (!Object.prototype.hasOwnProperty.call(base, next)) base[next] = base[key];
delete base[key];
moved = true;
}
if (moved) this.historyQueueSave();
}
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
historyForgetPath(path) {
if (this._historyPath && path === this._historyPath) { this._historyPath = null; return; }
const base = this.historyBaselines();
if (!Object.prototype.hasOwnProperty.call(base, path)) return;
delete base[path];
this.historyQueueSave();
}
historyDays(scope) {
const h = this.historyEnsure();
const t = h.today;
if (!scope || (Array.isArray(scope) && !scope.length)) {
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
historyPathUnder(scope) {
if (Array.isArray(scope)) {
const tests = scope.map(p => this.historyPathUnder(p));
if (!tests.length) return () => true;
return (p) => tests.some(t => t(p));
}
const base = String(scope || '').replace(/\/+$/, '');
if (!base) return () => true;
const prefix = base + '/';
return (p) => p === base || p.indexOf(prefix) === 0;
}
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
let cursor = this.historyDateKey();
if (!this.historyIsActive(days[cursor])) cursor = this.historyShiftKey(cursor, -1);
let current = 0;
while (this.historyIsActive(days[cursor])) { current++; cursor = this.historyShiftKey(cursor, -1); }
return {
total, best, bestKey, active, longest, current,
average: active ? Math.round(total / active) : 0,
days, keys
};
}
historyYears(scope) {
const days = this.historyDays(scope);
const set = new Set();
for (const k of Object.keys(days)) set.add(+k.slice(0, 4));
set.add(new Date().getFullYear());
const years = Array.from(set);
const lo = Math.min.apply(null, years), hi = Math.max.apply(null, years);
const out = [];
for (let y = lo; y <= hi; y++) out.push(y);
return out;
}
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
const by = this.historyPathRows();
if (by.length) {
out.push('### By note');
out.push('');
out.push('| Date | Note | Added | Deleted | Net |');
out.push('| --- | --- | ---: | ---: | ---: |');
for (const row of by) {
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
for (let i = out.length - 1; i >= 0 && out[i].date === h.today.date; i--) {
today.unshift(out.pop());
}
return today.concat(out);
}
return out;
}
historyCompose(existing) {
const block = HISTORY_MARK_START + '\n' + this.historyBody() + '\n' + HISTORY_MARK_END;
const text = String(existing || '');
const i = text.indexOf(HISTORY_MARK_START);
const j = text.indexOf(HISTORY_MARK_END);
if (i !== -1 && j !== -1 && j > i) {
return text.slice(0, i) + block + text.slice(j + HISTORY_MARK_END.length);
}
if (!text.trim()) return block + '\n';
return text.replace(/\s*$/, '') + '\n\n' + block + '\n';
}
historyParse(text) {
const src = String(text || '');
const i = src.indexOf(HISTORY_MARK_START);
const j = src.indexOf(HISTORY_MARK_END);
const body = (i !== -1 && j > i) ? src.slice(i + HISTORY_MARK_START.length, j) : src;
const days = {};
const ROW = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|\s*(-?\d+)\s*\|/;
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
await this.historyMarkSeen();
return true;
}
let seenAny = [];
try { seenAny = this.app.vault.getMarkdownFiles() || []; } catch (_) { zgCatch('historyWrite: seenAny = this.app.vault.getMarkdownFiles() || [];', _); }
if (!seenAny.length) return false;
if (this.settings.historySeen) {
new Notice('Word-Smith: could not find ws-history.md, so nothing was '
+ 'written. It has been moved or renamed \u2014 open it once, or set '
+ 'its path in Settings, and the record will carry on. A new one '
+ 'has NOT been made.');
return false;
}
const path = this.historyDefaultPath();
const slash = path.lastIndexOf('/');
if (slash > 0) {
const dir = path.slice(0, slash);
if (!this.app.vault.getAbstractFileByPath(dir)) {
try { await this.app.vault.createFolder(dir); } catch (_) { zgCatch('historyWrite: await this.app.vault.createFolder(dir);', _); }
}
}
const made = await this.app.vault.create(path, this.historyCompose(''));
this._historyPath = made ? made.path : path;
await this.historyMarkSeen();
return true;
} catch (e) {
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
await this.historyFlush(true);
}
async historyAdopt(file) {
try {
if (!this.settings.historyTracking || this._historyWriting) return;
if (!file || !file.path || !/\.md$/i.test(file.path)) return;
if (!(file instanceof TFile)) return;
if (this._historyDirtyAt) return;
const text = await this.app.vault.cachedRead(file);
if (!this.historyIsStoreFile(text)) return;
if (this._historyPath && this._historyPath !== file.path) return;
const parsed = this.historyParse(text);
const h = this.historyEnsure();
let gained = 0;
for (const k of Object.keys(parsed.days)) {
if (k === h.today.date) continue;
if (h.days[k]) continue;
h.days[k] = parsed.days[k];
if (parsed.paths && parsed.paths[k]) h.paths[k] = parsed.paths[k];
gained++;
}
this._historyPath = file.path;
if (!this._historyReady) this._historyReady = true;
if (gained) {
const keys = Object.keys(h.days).sort();
if (keys.length && (!h.started || keys[0] < h.started)) h.started = keys[0];
}
} catch (_) { }
}
historyEl(tag, cls, parent, text) {
const e = document.createElement(tag);
if (cls) e.className = cls;
if (text != null) e.textContent = text;
if (parent) parent.appendChild(e);
return e;
}
crumbLabel(name, max) {
const s = String(name == null ? '' : name);
const cap = Math.max(4, max || 18);
if (s.length <= cap) return s;
return s.slice(0, cap - 1).trimEnd() + '\u2026';
}
historySvg(tag, attrs, parent) {
const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
if (attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
if (parent) parent.appendChild(e);
return e;
}
historyBuckets(view, year, month, scope) {
const days = this.historyDays(scope);
const out = { view, buckets: [], label: '' };
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
for (let d = 1; d <= n; d++) {
const dt = new Date(year, month, d);
const key = this.historyDateKey(dt);
const b = blank(key, String(d));
b.title = HISTORY_DAYNAMES[dt.getDay()] + ' ' + d + ' '
+ HISTORY_MONTHS[month].slice(0, 3) + ' ' + year;
add(b, days[key]);
out.buckets.push(b);
}
} else if (view === 'month' || view === 'cal') {
out.label = String(year);
for (let m = 0; m < 12; m++) {
const b = blank(year + '-' + String(m + 1).padStart(2, '0'),
HISTORY_MONTHS[m].slice(0, 1));
b.title = HISTORY_MONTHS[m] + ' ' + year;
b.isNow = (year === nowY && m === nowM);
for (let d = 1; d <= daysIn(year, m); d++) {
add(b, days[this.historyDateKey(new Date(year, m, d))]);
}
out.buckets.push(b);
}
} else {
const years = this.historyYears(scope);
out.label = years.length > 1 ? years[0] + '\u2013' + years[years.length - 1] : String(years[0]);
for (const y of years) {
const b = blank(String(y), String(y));
b.title = String(y);
b.isNow = (y === nowY);
for (const k of Object.keys(days)) if (+k.slice(0, 4) === y) add(b, days[k]);
out.buckets.push(b);
}
}
const now = new Date();
for (const b of out.buckets) {
if (!b.title) b.title = b.key;
const tail = (b.a || 0).toLocaleString() + ' added \u00b7 '
+ (b.r || 0).toLocaleString() + ' deleted \u00b7 '
+ (b.n >= 0 ? '+' : '') + (b.n || 0).toLocaleString() + ' net'
+ (view === 'day' ? '' : ' \u00b7 ' + b.days + ' day' + (b.days === 1 ? '' : 's') + ' written'
+ (b.days > 0
? ' \u00b7 ' + Math.round((b.a || 0) / b.days).toLocaleString()
+ ' a day'
: ''));
b.readout = b.title + ' \u00b7 ' + ((b.a || b.r) ? tail : 'nothing written');
}
return out;
}
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
const boundary = i === 0 || lower[i - 1] === '/' || lower[i - 1] === ' '
|| lower[i - 1] === '-' || lower[i - 1] === '_';
score += 1 + run * 3 + (boundary ? 6 : 0);
last = i;
qi++;
}
if (qi < q.length) continue;
const after = lower[last + 1];
if (after === undefined || after === '/' || after === ' '
|| after === '-' || after === '_' || after === '.') score += 8;
score -= lower.length * 0.05;
out.push({ path, score });
}
out.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
return out;
}
reportFinderMatches(query, limit) {
const files = [];
const folders = new Set();
try {
for (const f of this.app.vault.getMarkdownFiles()) {
if (!this.isFileCounted(f)) continue;
files.push(f.path);
let cut = f.path.lastIndexOf('/');
while (cut > 0) {
folders.add(f.path.slice(0, cut));
cut = f.path.lastIndexOf('/', cut - 1);
}
}
} catch (_) { zgCatch('reportFinderMatches: for (const f of this.app.vault.getMarkdownFiles())', _); }
const tag = (list, kind) => this.historyFuzzy(query, list)
.map(m => ({ path: m.path, score: m.score + (kind === 'folder' ? 1.5 : 0), kind }));
const all = tag(Array.from(folders).sort(), 'folder').concat(tag(files.sort(), 'file'));
all.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
return all.slice(0, limit || 8);
}
historyFinderMatches(query, limit) {
const known = this.historyKnownPaths();
const tag = (list, kind) => this.historyFuzzy(query, list)
.map(m => ({ path: m.path, score: m.score + (kind === 'folder' ? 1.5 : 0), kind }));
const all = tag(known.folders, 'folder').concat(tag(known.files, 'file'));
all.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
return all.slice(0, limit || 8);
}
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
exportOptionDefaults() {
const o = this.settings.exportOpts || (this.settings.exportOpts = {});
const dflt = (k, v) => { if (o[k] === undefined) o[k] = v; };
dflt('format', 'docx'); dflt('titlePage', true);
dflt('sectionTitles', false); dflt('pageBreaks', true);
dflt('runningHeaderOn', true); dflt('author', '');
dflt('divider', '#'); dflt('a4', false);
dflt('starBetween', true);
dflt('folderHeadings', ZG_EXPORT_FOLDER_HEADINGS_DEFAULT);
o.wordCountOnTitle = true;
o.pageNumbers = true;
dflt('keepImages', false);
o.dropImages = !o.keepImages;
dflt('keepFrontmatter', false);
dflt('keepComments', false);
if (!o.joinMode) o.joinMode = o.pageBreaks ? 'page' : (o.starBetween ? 'divider' : 'run');
if (!o.chapterTitles) {
o.chapterTitles = o.sectionTitles ? 'file' : (o.keepHeadings === false ? 'none' : 'note');
}
o.pageBreaks = o.joinMode === 'page';
o.starBetween = o.joinMode === 'divider';
o.sectionTitles = o.chapterTitles === 'file';
o.keepHeadings = o.chapterTitles === 'note';
dflt('font', 'Times New Roman'); dflt('pt', 12);
dflt('justify', false); dflt('keepHeadings', true);
dflt('smartQuotes', false); dflt('wordCountOnTitle', true);
dflt('roundWordCount', true);
if (['words', 'flag', 'pct'].indexOf(o.listColumn) === -1) o.listColumn = 'words';
dflt('pageNumbers', true);
dflt('outFolder', ''); dflt('toc', false); dflt('lastScope', '');
dflt('titleText', '');
dflt('doubleSpaced', true); dflt('indent', true);
if (!o.lineSpacing) o.lineSpacing = o.doubleSpaced === false ? 'single' : 'double';
o.doubleSpaced = o.lineSpacing !== 'single';
o.pt = parseInt(o.pt, 10) || 12;
dflt('footnotes', true);
dflt('highlights', false);
if (!o.paperId) o.paperId = o.a4 ? 'a4' : 'letter';
return o;
}
openExportModal(scopeHint) {
return this.orgOpenTab('export');
}
exportFiguresText(fileCount, words, totalCount) {
const haveTotal = typeof totalCount === 'number' && totalCount > 0;
return (haveTotal
? fileCount + ' out of ' + totalCount.toLocaleString()
+ (totalCount === 1 ? ' note' : ' notes')
: fileCount + (fileCount === 1 ? ' file' : ' files'))
+ ' \u00b7 ' + words.toLocaleString() + ' words';
}
exportReaderClicks(doc, open) {
const root = doc && doc.documentElement;
if (!doc || !root || root.__wsReaderClicks) return;
root.__wsReaderClicks = true;
if (typeof open !== 'function') open = (path, snippet, ev) => this.openNoteAt(path, snippet, ev);
doc.addEventListener('click', (ev) => {
try {
const t = ev.target;
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
} catch (_) { zgCatch('exportReaderClicks: const sel = doc.getSelection && doc.getSelection();', _); }
const block = t.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
if (ev.preventDefault) ev.preventDefault();
open(path, zgSnippetOf(block ? block.textContent : ''), ev);
} catch (_) { zgCatch('exportReaderClicks: const t = ev.target;', _); }
});
}
exportReaderKeys(doc, act) {
const root = doc && doc.documentElement;
if (!doc || !root || root.__wsReaderKeys) return;
root.__wsReaderKeys = true;
act = act || {};
doc.addEventListener('keydown', (ev) => {
try {
if (!doc.documentElement || !doc.documentElement.classList.contains('is-flow')) return;
if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
const win = doc.defaultView;
if (!win) return;
const page = Math.max(120, Math.round((win.innerHeight || 800) * 0.88));
const step = 64;
const vim = !!(typeof act.vim === 'function' && act.vim());
let dy = null, to = null;
switch (ev.key) {
case ' ': dy = ev.shiftKey ? -page : page; break;
case 'PageDown': dy = page; break;
case 'PageUp': dy = -page; break;
case 'ArrowDown': dy = step; break;
case 'ArrowUp': dy = -step; break;
case 'j': if (!vim) return; dy = step; break;
case 'k': if (!vim) return; dy = -step; break;
case 'Home': to = 0; break;
case 'End': to = Math.max(1, (doc.documentElement && doc.documentElement.scrollHeight) || 1e9); break;
case 'Escape':
ev.preventDefault();
if (typeof act.collapse === 'function') act.collapse();
return;
case 'Enter': {
ev.preventDefault();
const secs = Array.from(doc.querySelectorAll('section[data-ws-note]'));
let hit = secs[0] || null;
for (const sec of secs) {
const r = sec.getBoundingClientRect();
if (r.top <= 12) hit = sec; else break;
}
if (hit && typeof act.open === 'function') {
const first = hit.querySelector('p, h1, h2, h3, h4, h5, h6, li, blockquote');
act.open(hit.getAttribute('data-ws-note'), zgSnippetOf(first ? first.textContent : ''));
}
return;
}
default: return;
}
ev.preventDefault();
if (to !== null) win.scrollTo(0, to);
else win.scrollBy(0, dy);
} catch (_) { zgCatch('exportReaderKeys: if (!doc.documentElement || !doc.documentElement.classList.contains(\'i …', _); }
});
}
async openNoteAt(path, snippet, ev) {
const newTab = !!(ev && (ev.ctrlKey || ev.metaKey));
let view = null;
let opened = false;
try {
const ws = this.app.workspace;
const file = this.app.vault.getAbstractFileByPath(path);
const root = ws.rootSplit;
let leaf = (root && ws.getMostRecentLeaf) ? ws.getMostRecentLeaf(root) : null;
if (leaf && file && typeof file.extension === 'string') {
if (newTab && leaf.parent && ws.createLeafInParent) {
leaf = ws.createLeafInParent(leaf.parent, leaf.parent.children.length);
}
await leaf.openFile(file, { active: true });
view = leaf.view && leaf.view.editor ? leaf.view : null;
opened = true;
}
} catch (_) { zgCatch('openNoteAt: the main window’s leaf', _); opened = false; }
if (!opened) {
try { await this.app.workspace.openLinkText(path, '', newTab ? 'tab' : false); }
catch (_) { return false; }
}
try {
if (!view) view = this.app.workspace.getActiveViewOfType(MarkdownView);
const ed = view && view.editor;
if (!ed || !snippet) return true;
const line = zgLineOfSnippet(ed.getValue(), snippet);
if (line < 0) return true;
ed.setCursor({ line, ch: 0 });
if (ed.scrollIntoView) ed.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
} catch (_) { zgCatch('openNoteAt: if (!view) view = this.app.workspace.getActiveViewOfType(MarkdownView) …', _); }
return true;
}
exportPreviewInto(host, sections, o, fileCount, words, onExport, headHost,
totalCount) {
if (!host) return null;
const body = host.createDiv({ cls: 'zg-export-prevbody' });
const head = (headHost || body).createDiv({ cls: 'zg-export-prevhead'
+ (headHost ? ' is-inact' : '') });
if (headHost) {
const goBtn = headHost.querySelector('.zg-export-go');
if (goBtn) headHost.insertBefore(head, goBtn);
}
head.createSpan({
text: this.exportFiguresText(fileCount, words, totalCount) });
const asText = o.format === 'md';
const frame = body.createEl('iframe',
{ cls: 'zg-export-paper' + (asText ? ' is-plain' : '') });
const html = asText
? this.exportPreviewMarkdown(this.exportToMarkdown(sections, o))
: this.exportToHtml(sections, o, true);
const paperPx = () => (zgPaperOf(o).w / 1440) * 96;
const paperHighPx = () => (zgPaperOf(o).h / 1440) * 96;
const fitZoom = () => {
const w = frame.clientWidth || 640;
const h = frame.clientHeight || 0;
const byW = (w - 28) / paperPx();
const byH = h > 40 ? (h - 24) / paperHighPx() : byW;
return Math.max(0.2, Math.min(1, Math.min(byW, byH)));
};
let zoom = 0;
let flowZoom = 1;
try {
const z0 = this._wsSession && this._wsSession.flowZoom;
if (typeof z0 === 'number' && z0 > 0) flowZoom = z0;
} catch (_) { zgCatch('exportPreviewInto: const z0 = this._wsSession && this._wsSession.flowZoom;', _); }
let pct = null;
let dark = !!((this.settings && this.settings.exportOpts
&& this.settings.exportOpts.previewDark) || false);
const applyDark = () => {
try {
const doc = frame.contentDocument
|| (frame.contentWindow && frame.contentWindow.document);
if (!doc || !doc.documentElement) return;
doc.documentElement.classList.toggle('is-dark', dark);
} catch (_) { zgCatch('exportPreviewInto / applyDark: const doc = frame.contentDocument', _); }
};
const apply = () => {
try {
const doc = frame.contentDocument
|| (frame.contentWindow && frame.contentWindow.document);
if (!doc || !doc.documentElement) return;
doc.documentElement.style.zoom = String(flow ? flowZoom : zoom);
} catch (_) { zgCatch('exportPreviewInto / apply: const doc = frame.contentDocument', _); }
if (pct) pct.setText(Math.round((flow ? flowZoom : zoom) * 100) + '%');
syncPages();
};
const setZoom = (z, keep) => {
if (flow) {
flowZoom = Math.max(0.5, Math.min(2.5, z));
try { if (this._wsSession) this._wsSession.flowZoom = flowZoom; } catch (_) { zgCatch('exportPreviewInto / setZoom: if (this._wsSession) this._wsSession.flowZoom = flowZoom;', _); }
apply();
return;
}
zoom = Math.max(0.25, Math.min(2, z));
if (keep !== false) this._exportZoom = zoom;
apply();
};
let pageAt = Math.max(0, Number(this._exportPage) || 0);
let pageNum = null, prevBtn = null, nextBtn = null;
let pageNow = null, pageEst = null;
let flow = false;
try { flow = !!(this._wsSession && this._wsSession.flow); } catch (_) { zgCatch('exportPreviewInto: flow = !!(this._wsSession && this._wsSession.flow);', _); }
let expandBtn = null, pageBox = null;
let readPage = null;
let pageOf = null, pagesTotal = 0;
let pool = [];
const docOf = () => {
try {
return frame.contentDocument
|| (frame.contentWindow && frame.contentWindow.document) || null;
} catch (_) { return null; }
};
const metrics = () => {
const doc = docOf();
const stack = doc && doc.querySelector('.stack');
const sheet = doc && (doc.querySelector('.sheet:not([hidden])')
|| doc.querySelector('.sheet'));
const flow = sheet && sheet.querySelector('.flow');
if (!doc || !stack || !sheet || !flow) return null;
const win = doc.defaultView;
let gap = 18;
try {
const g = parseFloat(win.getComputedStyle(doc.documentElement)
.getPropertyValue('--sheet-gap'));
if (isFinite(g)) gap = g;
} catch (_) { zgCatch('exportPreviewInto / metrics: const g = parseFloat(win.getComputedStyle(doc.documentElement)', _); }
let colGap = 0;
try {
const g = parseFloat(win.getComputedStyle(flow).columnGap);
if (isFinite(g)) colGap = g;
} catch (_) { zgCatch('exportPreviewInto / metrics: const g = parseFloat(win.getComputedStyle(flow).columnGap);', _); }
const sheetH = sheet.offsetHeight || 0;
const across = (flow.clientWidth || 0) + colGap;
if (!sheetH || (flow.clientWidth || 0) <= 0) return null;
const pages = across > 0
? Math.max(1, Math.round((flow.scrollWidth + colGap) / across)) : 1;
return { doc: doc, win: win, stack: stack, first: sheet,
gap: gap, across: across, down: sheetH + gap, pages: pages };
};
const topOf = (m, n) => n * m.down;
const wantPool = (m) => {
let visible = 1;
try {
const h = frame.clientHeight || 0;
const z = parseFloat(m.doc.documentElement.style.zoom) || 1;
if (h > 0 && m.down > 0) visible = Math.ceil(h / (m.down * z));
} catch (_) { zgCatch('exportPreviewInto / wantPool: const h = frame.clientHeight || 0;', _); }
return Math.max(2, Math.min(8, visible + 2));
};
const fillPool = (m) => {
const want = wantPool(m);
if (!pool.length || pool[0] !== m.first) pool = [m.first];
while (pool.length < want) {
const copy = m.first.cloneNode(true);
copy.dataset.pooled = '1';
m.stack.appendChild(copy);
pool.push(copy);
}
};
const windowStart = (m, n) => Math.max(0,
Math.min(n - 1, m.pages - pool.length));
const placeSheets = (m, from) => {
const need = [];
for (let i = 0; i < pool.length; i++) {
const n = from + i;
if (n >= 0 && n < m.pages) need.push(n);
}
const held = new Map();
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
if (hdr) {
const bare = !!o.titlePage && n === 0;
hdr.textContent = (!o.runningHeader || bare) ? ''
: (o.runningHeader + ' ' + (n + 1));
}
}
const placed = new Set(held.values());
for (const el of pool) if (!placed.has(el)) el.hidden = true;
};
const topNow = () => {
try {
const sheet = pool[0];
const fl = sheet && sheet.querySelector('.flow');
if (!fl) return null;
const kids = fl.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
if (!kids.length) return null;
if (flow) {
for (const k of kids) {
if (k.getBoundingClientRect().bottom > 0) return k;
}
return kids[kids.length - 1];
}
const m = metrics();
if (!m || !(m.across > 0)) return null;
for (const k of kids) {
if (Math.floor((k.offsetLeft + 1) / m.across) >= pageAt) return k;
}
return kids[kids.length - 1];
} catch (_) { return null; }
};
const topTo = (el) => {
if (!el) return;
const doc = el.ownerDocument;
const win = doc && doc.defaultView;
if (!win) return;
try {
if (flow) {
const y = el.getBoundingClientRect().top + (win.scrollY || 0);
win.scrollTo(0, Math.max(0, y - 12));
return;
}
const m = metrics();
if (!m || !(m.across > 0)) return;
showPage(Math.floor((el.offsetLeft + 1) / m.across));
} catch (_) { zgCatch('exportPreviewInto / topTo: if (flow)', _); }
};
let flowSay = null;
const flowApply = () => {
try {
const doc = docOf();
if (doc && doc.documentElement) {
doc.documentElement.classList.toggle('is-flow', flow);
}
} catch (_) { zgCatch('exportPreviewInto / flowApply: const doc = docOf();', _); }
try {
const split = host && host.closest && host.closest('.zg-export-split');
if (split) split.classList.toggle('is-flow', flow);
const body = split && split.closest && split.closest('.zg-uni-body');
if (body) body.classList.toggle('is-reader', flow);
} catch (_) { zgCatch('exportPreviewInto / flowApply: const split = host && host.closest && …', _); }
try { if (pageBox) pageBox.toggleClass('is-gone', flow); } catch (_) { zgCatch('exportPreviewInto / flowApply: if (pageBox) pageBox.toggleClass(\'is-gone\', flow);', _); }
try { apply(); } catch (_) { zgCatch('exportPreviewInto / flowApply: apply();', _); }
try { if (readPage) readPage.toggleClass('is-gone', !flow); } catch (_) { zgCatch('exportPreviewInto / flowApply: if (readPage) readPage.toggleClass(\'is-gone\', !flow);', _); }
if (flowSay) { try { flowSay(); } catch (_) { zgCatch('exportPreviewInto / flowApply: flowSay();', _); } }
};
const pageMap = () => {
try {
const m = metrics();
const sheet = pool[0];
const fl = sheet && sheet.querySelector('.flow');
if (!m || !fl || !(m.across > 0)) return;
const map = new WeakMap();
const kids = fl.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
for (const k of kids) {
map.set(k, Math.floor((k.offsetLeft + 1) / m.across));
}
pageOf = map;
pagesTotal = m.pages;
} catch (_) { zgCatch('exportPreviewInto / pageMap: const m = metrics();', _); }
};
const jumpTo = (path) => {
if (!flow || !path) return false;
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
const y = sec.getBoundingClientRect().top + (win.scrollY || 0);
win.scrollTo(0, Math.max(0, y - 12));
return true;
} catch (_) { return false; }
};
const readSay = () => {
if (!flow || !readPage) return;
try {
const sheet = pool[0];
const fl = sheet && sheet.querySelector('.flow');
const doc = fl && fl.ownerDocument;
const win = doc && doc.defaultView;
if (!win) return;
try {
if (this._wsSession) this._wsSession.flowScroll = win.scrollY || 0;
} catch (_) { zgCatch('exportPreviewInto / readSay: if (this._wsSession) this._wsSession.flowScroll = win.scrollY || 0;', _); }
const top = topNow();
const n = (top && pageOf && pageOf.has(top)) ? pageOf.get(top) : null;
readPage.setText(n === null || !pagesTotal
? '' : ('p. ' + (n + 1) + ' of ' + pagesTotal));
} catch (_) { zgCatch('exportPreviewInto / readSay: const sheet = pool[0];', _); }
};
const flowSet = (on) => {
const was = !!flow;
if (was === !!on) return;
if (!was) pageMap();
const keep = topNow();
flow = !!on;
try { if (this._wsSession) this._wsSession.flow = flow; } catch (_) { zgCatch('exportPreviewInto / flowSet: if (this._wsSession) this._wsSession.flow = flow;', _); }
flowApply();
const after = () => {
if (!flow) { try { syncPages(); } catch (_) { zgCatch('exportPreviewInto / after: syncPages();', _); } }
if (flow) {
try {
const d = docOf();
if (d && d.body) { d.body.setAttribute('tabindex', '-1'); d.body.focus(); }
} catch (_) { zgCatch('exportPreviewInto / after: const d = docOf();', _); }
}
if (flow) {
if (!keep) {
try {
const y0 = this._wsSession && this._wsSession.flowScroll;
const w0 = docOf() && docOf().defaultView;
if (w0 && typeof y0 === 'number' && y0 > 0) w0.scrollTo(0, y0);
} catch (_) { zgCatch('exportPreviewInto / after: const y0 = this._wsSession && this._wsSession.flowScroll;', _); }
}
try { readSay(); } catch (_) { zgCatch('exportPreviewInto / after: readSay();', _); }
}
const scroll = () => topTo(keep);
if (!flow && win0 && win0.requestAnimationFrame) {
win0.requestAnimationFrame(scroll);
} else { scroll(); }
};
let win0 = null;
try { const d = docOf(); win0 = d && d.defaultView; } catch (_) { zgCatch('exportPreviewInto / flowSet: const d = docOf();', _); }
if (win0 && win0.requestAnimationFrame) win0.requestAnimationFrame(after);
else after();
};
const syncPages = () => {
if (flow) return;
const m = metrics();
if (!m) return;
fillPool(m);
m.stack.style.height = (m.pages * m.down - m.gap) + 'px';
const z = parseFloat(m.doc.documentElement.style.zoom) || 1;
const y = (m.win.scrollY || 0) / (z || 1);
const at = m.down > 0 ? Math.round(y / m.down) : 0;
pageAt = Math.max(0, Math.min(m.pages - 1, at));
this._exportPage = pageAt;
placeSheets(m, windowStart(m, pageAt));
if (pageNow) pageNow.setText(String(pageAt + 1));
if (pageEst) pageEst.setText('~' + m.pages);
if (prevBtn) prevBtn.disabled = pageAt <= 0;
if (nextBtn) nextBtn.disabled = pageAt >= m.pages - 1;
};
const showPage = (n) => {
const m = metrics();
if (!m) return;
fillPool(m);
const at = Math.max(0, Math.min(m.pages - 1, n));
placeSheets(m, windowStart(m, at));
const z = parseFloat(m.doc.documentElement.style.zoom) || 1;
try { m.win.scrollTo(0, topOf(m, at) * z); } catch (_) { zgCatch('exportPreviewInto / showPage: m.win.scrollTo(0, topOf(m, at) * z);', _); }
syncPages();
};
let readSoon = false;
const onScroll = () => {
if (readSoon) return;
readSoon = true;
const doc = docOf();
const raf = (fn) => {
try { doc.defaultView.requestAnimationFrame(fn); } catch (_) { fn(); }
};
raf(() => {
readSoon = false;
syncPages();
readSay();
});
};
const onWheel = (ev) => {
if (!flow || !ev || !ev.ctrlKey) return;
try { ev.preventDefault(); } catch (_) { zgCatch('exportPreviewInto / onWheel: ev.preventDefault();', _); }
const dir = (ev.deltaY || 0) > 0 ? -1 : 1;
setZoom(flowZoom * (1 + dir * 0.1));
};
const armScroll = () => {
if (asText) return;
let win = null;
try { win = frame.contentWindow; } catch (_) { zgCatch('exportPreviewInto / armScroll: win = frame.contentWindow;', _); }
if (!win) return;
try { win.removeEventListener('scroll', onScroll); } catch (_) { zgCatch('exportPreviewInto / armScroll: win.removeEventListener(\'scroll\', onScroll);', _); }
try { win.addEventListener('scroll', onScroll, { passive: true }); } catch (_) { zgCatch('exportPreviewInto / armScroll: win.addEventListener(\'scroll\', onScroll, passive: true );', _); }
try { win.removeEventListener('wheel', onWheel); } catch (_) { zgCatch('exportPreviewInto / armScroll: win.removeEventListener(\'wheel\', onWheel);', _); }
try { win.addEventListener('wheel', onWheel, { passive: false }); } catch (_) { zgCatch('exportPreviewInto / armScroll: win.addEventListener(\'wheel\', onWheel, passive: false );', _); }
};
const paint = () => {
try {
const doc = frame.contentDocument
|| (frame.contentWindow && frame.contentWindow.document);
if (!doc) return;
doc.open(); doc.write(html); doc.close();
} catch (_) { zgCatch('exportPreviewInto / paint: const doc = frame.contentDocument', _); }
if (!zoom) zoom = asText ? 1 : (this._exportZoom || fitZoom());
apply();
applyDark();
try { this.exportReaderClicks(docOf()); } catch (_) { zgCatch('exportPreviewInto / paint: this.exportReaderClicks(docOf());', _); }
try { this.exportReaderKeys(docOf(), { collapse: () => flowSet(false), open: (p, sn) => this.openNoteAt(p, sn), vim: () => !!(this.app.vault.getConfig && this.app.vault.getConfig('vimMode')) }); } catch (_) { zgCatch('exportPreviewInto / paint: this.exportReaderKeys(docOf(), collapse: () => flowSet(false), open: …', _); }
if (flow) { try { flowApply(); } catch (_) { zgCatch('exportPreviewInto / paint: flowApply();', _); } }
armScroll();
try { window.requestAnimationFrame(() => syncPages()); } catch (_) { zgCatch('exportPreviewInto / paint: window.requestAnimationFrame(() => syncPages());', _); }
};
paint();
frame.addEventListener('load', paint);
window.setTimeout(paint, 0);
const foot = body.createDiv({ cls: 'zg-export-prevfoot' });
if (!asText) {
pageBox = foot.createDiv({ cls: 'zg-export-flip' });
const pgbtn = (label, aria, fn) => {
const b = pageBox.createEl('button', { cls: 'zg-export-mini', text: label });
b.setAttribute('aria-label', aria);
b.title = aria;
b.addEventListener('click', fn);
return b;
};
prevBtn = pgbtn('\u2039', 'Previous page', () => showPage(pageAt - 1));
pageNum = pageBox.createSpan({ cls: 'zg-export-pagenum' });
pageNow = pageNum.createSpan({ cls: 'zg-export-pagenow', text: '1' });
pageNum.createSpan({ cls: 'zg-export-pagesep', text: ' / ' });
pageEst = pageNum.createSpan({ cls: 'zg-export-pageest', text: '~1' });
pageEst.setAttribute('tabindex', '0');
pageEst.setAttribute('role', 'note');
pageEst.title = (o.format === 'html' || o.format === 'pdf')
? 'Roughly this many pages — the file breaks in near enough the '
+ 'same places.'
: 'Roughly this many pages — Word will break the .docx its own way.';
nextBtn = pgbtn('\u203a', 'Next page', () => showPage(pageAt + 1));
const zoomBox = foot.createDiv({ cls: 'zg-export-zoom' });
const zbtn = (label, aria, fn) => {
const b = zoomBox.createEl('button', { cls: 'zg-export-mini', text: label });
b.setAttribute('aria-label', aria);
b.title = aria;
b.addEventListener('click', fn);
return b;
};
const zoomNow = () => (flow ? flowZoom : zoom);
zbtn('\u2212', 'Zoom out', () => setZoom(zoomNow() - 0.1));
pct = zoomBox.createSpan({ cls: 'zg-export-zoompct', text: '100%' });
zbtn('+', 'Zoom in', () => setZoom(zoomNow() + 0.1));
zbtn('Fit', 'Fit the page to the window', () => {
this._exportZoom = null;
setZoom(flow ? 1 : fitZoom(), false);
});
zbtn('100%', 'Show the page at its printed size', () => setZoom(1));
const dk = zoomBox.createEl('button', { cls: 'zg-export-mini zg-export-prevdark' });
const sayDark = () => {
dk.setText(dark ? 'Light' : 'Dark');
dk.title = dark ? 'Show the page as paper' : 'Dim the page for reading';
};
dk.addEventListener('click', () => {
dark = !dark;
try {
if (this.settings && this.settings.exportOpts) {
this.settings.exportOpts.previewDark = dark;
this.saveSettings();
}
} catch (_) { zgCatch('exportPreviewInto: if (this.settings && this.settings.exportOpts)', _); }
applyDark();
sayDark();
});
sayDark();
readPage = zoomBox.createSpan({ cls: 'zg-export-readpage is-gone' });
expandBtn = zoomBox.createEl('button',
{ cls: 'zg-export-mini zg-export-expand' });
const sayFlow = () => {
expandBtn.setText(flow ? 'Collapse' : 'Expand');
expandBtn.title = flow
? 'Back to the page preview'
: 'Read the whole thing as one text';
expandBtn.setAttribute('aria-label', expandBtn.title);
expandBtn.setAttribute('aria-pressed', flow ? 'true' : 'false');
expandBtn.toggleClass('is-on', flow);
};
expandBtn.addEventListener('click', () => flowSet(!flow));
sayFlow();
flowSay = sayFlow;
if (flow) flowApply();
apply();
}
if (onExport) {
const go = foot.createEl('button', { cls: 'mod-cta zg-export-prevgo' });
go.setText(onExport.label || 'Export');
go.addEventListener('click', async () => {
go.disabled = true;
try { await onExport(); } finally { go.disabled = false; }
});
}
try { body.zgJumpTo = jumpTo; } catch (_) { zgCatch('exportPreviewInto: body.zgJumpTo = jumpTo;', _); }
return body;
}
exportPreviewMarkdown(md) {
const esc = (t) => String(t == null ? '' : t)
.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
let dark = false, bg = '#ffffff', ink = '#1f1f1f';
try {
dark = document.body.classList.contains('theme-dark');
const cs = getComputedStyle(document.body);
const b = cs.getPropertyValue('--background-primary');
const t2 = cs.getPropertyValue('--text-normal');
if (b && b.trim()) bg = b.trim();
if (t2 && t2.trim()) ink = t2.trim();
} catch (_) { zgCatch('exportPreviewMarkdown: dark = document.body.classList.contains(\'theme-dark\');', _); }
return '<!doctype html><html><head><meta charset="utf-8"><style>'
+ ':root { color-scheme: ' + (dark ? 'dark' : 'light') + '; }'
+ 'html, body { margin: 0; background: ' + bg + '; }'
+ 'pre { margin: 0; padding: 18px 20px; color: ' + ink + ';'
+ ' font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;'
+ ' font-size: 12px; line-height: 1.6;'
+ ' white-space: pre-wrap; word-break: break-word; }'
+ '</style></head><body><pre>' + esc(md) + '</pre></body></html>';
}
exportToHtml(sections, o, forScreen) {
const esc = (t) => String(t == null ? '' : t)
.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const parts = [];
let heldPage = false;
let pendingFolder = '';
let pendingBreak = false;
if (o.titlePage) {
parts.push('<section class="page tp"><div class="tpinner">'
+ '<h1>' + esc(o.title || 'Untitled') + '</h1>'
+ (o.author ? '<p>by ' + esc(o.author) + '</p>' : '')
+ (o.wordCount != null && o.wordCountOnTitle !== false
? '<p>' + esc(zgTitleWords(o)) + '</p>' : '')
+ '</div></section>');
}
if (o.toc && sections.length > 1) {
parts.push('<section class="page"><h2>Contents</h2><ol class="toc">');
const stepOf = zgTocSteps(o, sections);
sections.forEach((sec, i) => {
const lv = stepOf(sec);
parts.push('<li class="l' + lv + '"><a href="#'
+ zgAnchorId(sec.title, i) + '">'
+ esc(sec.title || ('Section ' + (i + 1))) + '</a></li>');
});
parts.push('</ol></section>');
}
sections.forEach((sec, i) => {
if (sec.folder) {
const lv = Math.min(6, sec.depth || 1);
const fbrk = (i > 0 || o.titlePage || o.toc) && o.pageBreaks !== false;
pendingFolder = '<h' + lv + ' class="folderhead" id="'
+ zgAnchorId(sec.title, i) + '">' + esc(sec.title) + '</h' + lv + '>';
pendingBreak = fbrk;
return;
}
if (o.starBetween && i > 0) {
parts.push('<p class="div">' + esc(zgJoinMark(o)) + '</p>');
}
const brk = pendingFolder
? pendingBreak
: (!heldPage
&& (i > 0 || o.titlePage || o.toc) && o.pageBreaks !== false);
heldPage = false;
const note = (forScreen && sec.path) ? (' data-ws-note="'
+ esc(sec.path) + '"') : '';
parts.push('<section class="' + (brk ? 'page' : 'run')
+ '" id="' + zgAnchorId(sec.title, i) + '"' + note + '>');
if (pendingFolder) {
const tight = !!(o.sectionTitles && sec.title);
parts.push(tight
? pendingFolder.replace('class="folderhead"',
'class="folderhead is-tight"')
: pendingFolder);
pendingFolder = '';
pendingBreak = false;
}
if (o.sectionTitles && sec.title) {
const fl = zgFileHeadLevel(o, sec);
parts.push('<h' + fl + '>' + esc(sec.title) + '</h' + fl + '>');
}
let md = String(sec.markdown || '');
if (o.folderHeadings) md = zgDemoteHeadings(md, sec.depth || 0);
const fm = md.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
if (fm) {
md = md.slice(fm[0].length);
if (o.keepFrontmatter) parts.push('<pre class="fm">' + esc(fm[0].trim()) + '</pre>');
}
let inComment = false;
let firstPara = true;
for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
const t = line.trim();
if (!t) continue;
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
if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
parts.push('<p class="div">' + esc(o.divider == null ? '#' : o.divider) + '</p>');
firstPara = true; continue;
}
const h = t.match(/^(#{1,6})\s+(.*)$/);
if (h) {
if (o.keepHeadings !== false) {
parts.push('<h' + Math.min(3, h[1].length) + '>' + esc(h[2])
+ '</h' + Math.min(3, h[1].length) + '>');
}
firstPara = true; continue;
}
const runs = zgInlineRuns(t, o).map(r => {
let x = esc(r.text);
if (r.bold) x = '<strong>' + x + '</strong>';
if (r.ital) x = '<em>' + x + '</em>';
if (r.high) x = '<mark>' + x + '</mark>';
return x;
}).join('');
parts.push('<p' + (firstPara ? ' class="first"' : '') + '>' + runs + '</p>');
firstPara = false;
}
parts.push('</section>');
});
if (pendingFolder) {
parts.push('<section class="' + (pendingBreak ? 'page' : 'run') + '">');
parts.push(pendingFolder);
parts.push('</section>');
pendingFolder = '';
pendingBreak = false;
}
const lineH = ({ 240: '1.45', 360: '1.7', 480: '2' }[zgLineTwips(o)] || '2');
const head = o.runningHeader ? esc(o.runningHeader) : '';
const font = JSON.stringify(o.font || 'Times New Roman');
const pt = o.pt || 12;
const paper = zgPaperOf(o);
const pw = zgTwipIn(paper.w), ph = zgTwipIn(paper.h), pm = zgTwipIn(paper.mar);
const cw = 'calc(' + pw + ' - 2 * ' + pm + ')';
const ch = 'calc(' + ph + ' - 2 * ' + pm + ')';
const pgap = o.indent === false ? '0.5em' : '0';
return '<!doctype html><html><head><meta charset="utf-8">'
+ '<title>' + esc(o.title || 'Manuscript') + '</title><style>'
+ '@page { size: ' + pw + ' ' + ph + '; margin: ' + pm + ';'
+ (head ? ' @top-right { content: "' + head + ' " counter(page); }' : '')
+ ' }'
+ ':root { color-scheme: light; }'
+ 'html { background: ' + (forScreen ? zgHostTint() : '#fff') + '; }'
+ 'body { margin: 0; padding: ' + (forScreen ? '18px 0' : '0') + ';'
+ ' font-family: ' + font + ', Times, serif; font-size: ' + pt + 'pt;'
+ ' line-height: ' + lineH + ';'
+ ' color: #111; }'
+ '.page, .run { background: #fff; }'
+ (head && forScreen
? '.hdr { position: absolute; top: calc(' + pm + ' / 2); right: ' + pm + ';'
+ ' font-size: 0.9em; color: inherit; }' : '')
+ (forScreen
? ':root { --sheet-gap: 18px; }'
+ '.stack { position: relative; width: ' + pw + '; margin: 0 auto; }'
+ '.sheet { position: absolute; left: 0; top: 0;'
+ ' box-sizing: border-box;'
+ ' width: ' + pw + '; height: ' + ph + '; padding: ' + pm + ';'
+ ' background: #fff;'
+ ' box-shadow: 0 2px 10px rgba(0,0,0,0.45); }'
+ '.hdr { position: absolute; }'
+ '.flow { height: 100%; column-width: ' + cw + ';'
+ ' column-gap: ' + pm + '; column-fill: auto;'
+ ' overflow: hidden; }'
+ '.page, .run { background: none; box-shadow: none;'
+ ' width: auto; margin: 0; padding: 0; min-height: 0; }'
+ '.page { break-before: column; }'
+ '.page:first-child { break-before: avoid; }'
+ '.tp { height: ' + ch + '; }'
+ 'html.is-flow .stack { width: auto; height: auto !important; }'
+ 'html.is-flow .sheet[data-pooled] { display: none; }'
+ 'html.is-flow .sheet { position: static; width: auto;'
+ ' height: auto; margin: 0; padding: 0;'
+ ' box-shadow: none; min-height: 100vh; }'
+ 'html.is-flow .hdr { display: none; }'
+ 'html.is-flow .flow { height: auto; columns: auto;'
+ ' overflow: visible; max-width: 68ch; margin: 0 auto;'
+ ' padding: ' + pm + ' 24px; }'
+ 'html.is-flow .page { break-before: auto; }'
+ 'html.is-flow section + section { margin-top: 4em; }'
+ 'html.is-flow section + section::before { content: "";'
+ ' display: block; border-top: 2px dashed currentColor;'
+ ' opacity: 0.28; margin: 0 0 3.2em; }'
+ 'html.is-flow section > p:first-child { text-indent: 0; }'
+ 'html.is-flow .tp { height: auto; padding: 2em 0 3em; }'
+ '@media print {'
+ ' html, html.is-dark { background: #fff; color-scheme: light; }'
+ ' html.is-dark body { color: #111; }'
+ ' html.is-dark .sheet, html.is-dark .page,'
+ ' html.is-dark .run { background: #fff; }'
+ ' body { padding: 0; }'
+ ' .stack { width: auto; height: auto !important; }'
+ ' .sheet { position: static; width: auto; height: auto;'
+ '   padding: 0; margin: 0; box-shadow: none; }'
+ ' .hdr { display: none; }'
+ ' .flow { height: auto; overflow: visible; columns: auto; }'
+ ' .tp { height: auto; }'
+ ' .page, .run { width: auto; margin: 0; padding: 0;'
+ '   min-height: 0; box-shadow: none; }'
+ ' .page { page-break-before: always; break-before: page; }'
+ ' .page:first-child { page-break-before: avoid;'
+ '   break-before: avoid; }'
+ '}'
: '.page { page-break-before: always; } .page:first-child { page-break-before: avoid; }')
+ 'p { margin: 0 0 ' + pgap + ' 0; text-indent: ' + (o.indent === false ? '0' : '0.5in') + ';'
+ (o.justify ? ' text-align: justify;' : '')
+ ' orphans: 2; widows: 2; }'
+ 'p.first, p.div { text-indent: 0; }'
+ 'html.is-dark { color-scheme: dark; background: #17181b; }'
+ 'html.is-dark body { color: #dcdcdc; }'
+ 'html.is-dark .sheet, html.is-dark .page,'
+ ' html.is-dark .run { background: #212327; }'
+ 'html.is-dark pre.fm { color: #b9b9b9; border-left-color: #55565a; }'
+ 'html.is-dark p.cmt { color: #b9b9b9; border-left-color: #55565a; }'
+ 'html.is-dark mark { background: #6c5a1e; color: #f4f0e2; }'
+ 'html.is-dark a { color: #9cc4ff; }'
+ 'pre.fm { font-family: ui-monospace, Menlo, Consolas, monospace;'
+ ' font-size: 0.8em; line-height: 1.35; white-space: pre-wrap;'
+ ' color: #444; border-left: 2px solid #bbb; padding-left: 8px; margin: 0 0 1em; }'
+ 'p.cmt { text-indent: 0; font-style: italic; color: #555;'
+ ' border-left: 2px solid #bbb; padding-left: 8px; margin: 0.4em 0; }'
+ 'p.div { text-align: center; margin: 1em 0; }'
+ 'h1, h2, h3 { text-align: center; page-break-after: avoid; font-weight: 700; }'
+ 'h1, h2 { font-size: ' + zgHeadSizeEm(o, 1).toFixed(4) + 'em; }'
+ 'h3, h4, h5, h6 { font-size: ' + zgHeadSizeEm(o, 3).toFixed(4) + 'em; }'
+ '.tp .tpinner h1 { font-size: 1em; }'
+ '.tp .tpinner p { text-indent: 0; }'
+ '.tp { display: flex; flex-direction: column; justify-content: center; }'
+ '.tp .tpinner { text-align: center; }'
+ '.tp .tpinner > * { margin-top: 0; margin-bottom: 0; }'
+ '.folderhead.is-tight { margin-bottom: 0; }'
+ '.folderhead.is-tight + h1, .folderhead.is-tight + h2,'
+ ' .folderhead.is-tight + h3, .folderhead.is-tight + h4,'
+ ' .folderhead.is-tight + h5, .folderhead.is-tight + h6'
+ ' { margin-top: 0; }'
+ '.folderhead { margin: 0 0 1em; text-align: center;'
+ ' font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;'
+ ' font-size: ' + zgHeadSizeEm(o, 1).toFixed(4) + 'em;'
+ ' page-break-after: avoid; }'
+ 'ol.toc { list-style: none; padding: 0; }'
+ 'ol.toc a { color: inherit; text-decoration: none; }'
+ 'ol.toc li.l1 { padding-left: 1.5em; }'
+ 'ol.toc li.l2 { padding-left: 3em; }'
+ 'ol.toc li.l3 { padding-left: 4.5em; }'
+ 'ol.toc li.l4 { padding-left: 6em; }'
+ 'ol.toc li.l5 { padding-left: 7.5em; }'
+ '</style></head><body>'
+ (forScreen
? '<div class="stack"><div class="sheet">'
+ '<div class="hdr"></div><div class="flow">'
+ parts.join('\n') + '</div></div></div>'
: parts.join('\n'))
+ '</body></html>';
}
exportDefaultScope() {
try {
const f = this.app.workspace.getActiveFile();
if (f && f.parent && f.parent.path && f.parent.path !== '/') return f.parent.path;
if (f && f.path) return f.path;
} catch (_) { zgCatch('exportDefaultScope: const f = this.app.workspace.getActiveFile();', _); }
return '';
}
exportRemember(scope, kind, opt, count, name) {
try {
if (!this.settings || !this.settings.exportOpts) return;
this.settings.exportOpts.lastRun = {
scope: String(scope || ''),
format: kind,
into: String((opt && opt.outFolder) || ''),
files: count || 0,
name: String(name || ''),
at: Date.now()
};
this.saveSettings();
} catch (_) { zgCatch('exportRemember: if (!this.settings || !this.settings.exportOpts) return;', _); }
}
exportWhen(at) {
const ms = Date.now() - (at || 0);
if (!at || ms < 0) return '';
const min = Math.floor(ms / 60000);
if (min < 2) return 'just now';
if (min < 60) return min + ' minutes ago';
const hr = Math.floor(min / 60);
if (hr < 2) return 'an hour ago';
if (hr < 24) return hr + ' hours ago';
const d = Math.floor(hr / 24);
if (d < 2) return 'yesterday';
if (d < 31) return d + ' days ago';
return 'a while ago';
}
countTasks(text) {
const out = { done: 0, all: 0 };
if (!text) return out;
const re = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[(.)\]/gm;
let m;
while ((m = re.exec(text)) !== null) {
out.all++;
if (m[1] !== ' ') out.done++;
}
return out;
}
tagsOf(path) { return this.tagsWithSource(path).map(t => t.tag); }
tagsWithSource(path) {
const out = [];
const seen = new Map();
const add = (raw, inText) => {
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
if (this.propStoreHolds && this.propStoreHolds(path)) {
let sv;
try { sv = this.propStoreGetSync(path, 'tags'); } catch (_) { sv = undefined; }
const kept = Array.isArray(sv)
? sv
: (typeof sv === 'string' && sv ? sv.split(/[,\s]+/) : []);
for (const t of kept) add(t, false);
return out;
}
if (!cache) return out;
for (const t of (cache.tags || [])) add(t && t.tag, true);
const fm = cache.frontmatter && (cache.frontmatter.tags || cache.frontmatter.tag);
const list = Array.isArray(fm) ? fm : (typeof fm === 'string' ? fm.split(/[,\s]+/) : []);
for (const t of list) add(t, false);
} catch (_) { zgCatch('tagsWithSource: const f = this.app.vault.getAbstractFileByPath(path);', _); }
return out;
}
exportWhenShort(at) {
if (!at) return '\u2013';
const ms = Date.now() - at;
if (ms < 0) return 'now';
const min = Math.floor(ms / 60000);
if (min < 60) return min < 2 ? 'now' : min + 'm';
const hr = Math.floor(min / 60);
if (hr < 24) return hr + 'h';
const d = Math.floor(hr / 24);
if (d < 31) return d + 'd';
try {
return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
} catch (_) { return d + 'd'; }
}
async exportFillCounts(files, listWrap, done, store) {
for (const f of files) {
let text = '';
try { text = await this.app.vault.cachedRead(f); } catch (_) { zgCatch('exportFillCounts: text = await this.app.vault.cachedRead(f);', _); }
const n = this.countWords(text);
if (store) store.set(f.path, n);
const el = listWrap.querySelector('[data-path="' + CSS.escape(f.path) + '"]');
if (el) { el.setAttribute('data-words', String(n)); el.setText(n.toLocaleString()); }
}
if (done) done();
}
exportOptsFor(scope, o, words) {
const typed = String(o.titleText || '').trim();
const title = typed
|| String(scope || '').split('/').pop().replace(/\.md$/, '')
|| 'Untitled';
return Object.assign({}, o, {
title, wordCount: words,
dropImages: !o.keepImages,
runningHeader: o.runningHeaderOn
? ((o.author ? o.author.split(/\s+/).pop() + ' / ' : '') + title + ' /')
: ''
});
}
buildExportAct(into, ctx) {
this.exportOptionDefaults();
const o = this.settings.exportOpts || (this.settings.exportOpts = {});
let exportProgress = null;
const fmt = into.createDiv({ cls: 'zg-export-fmt' });
fmt.createSpan({ cls: 'zg-export-fmtlabel', text: 'Export as' });
const FORMATS = [
{ id: 'docx', label: 'Word', ext: '.docx', pages: zgFormatHasPages('docx') },
{ id: 'pdf', label: 'PDF', ext: '.pdf', desktopOnly: true,
pages: zgFormatHasPages('pdf') },
{ id: 'html', label: 'Web page', ext: '.html', pages: zgFormatHasPages('html') },
{ id: 'md', label: 'Markdown', ext: '.md', pages: zgFormatHasPages('md') }
].filter(f => !f.desktopOnly || this.exportPdfAvailable());
let goBtn = null;
let fmtSel = null, intoInput = null;
const paintFmt = () => {
const f = FORMATS.filter(x => x.id === o.format)[0] || FORMATS[0];
if (goBtn) goBtn.setText('Export ' + f.ext);
if (fmtSel && fmtSel.value !== o.format) fmtSel.value = o.format;
if (intoInput && intoInput.value !== (o.outFolder || '')) {
intoInput.value = o.outFolder || '';
}
const scope = into.closest('.zg-uni-body') || into.ownerDocument;
for (const el of Array.from(
scope.querySelectorAll('.zg-export-pages'))) {
el.toggleClass('is-gone', !f.pages);
}
};
if (!FORMATS.some(f => f.id === o.format)) o.format = 'docx';
const sel = fmt.createEl('select', { cls: 'zg-export-fmtsel dropdown' });
fmtSel = sel;
for (const f of FORMATS) {
const opt2 = sel.createEl('option', { text: f.label + '  (' + f.ext + ')' });
opt2.value = f.id;
}
sel.value = o.format;
sel.addEventListener('change', () => {
o.format = sel.value; this.saveSettings(); paintFmt();
});
const compileList = () => ctx.compileList();
const runBtn = (label, kind) => {
const b = into.createEl('button', { cls: 'mod-cta zg-export-go', text: label });
b.addEventListener('click', async () => {
b.disabled = true;
try {
await this.runExport(o.format, ctx.scope(), compileList(), o, exportProgress);
}
finally { b.disabled = false; if (exportProgress) exportProgress.hide(); }
if (ctx.onDone) ctx.onDone();
});
return b;
};
{
const intoRow = into.createDiv({ cls: 'zg-export-into' });
intoRow.createSpan({ cls: 'zg-export-fmtlabel', text: 'into' });
const pick = intoRow.createDiv({ cls: 'zg-export-folderpick' });
const inp = pick.createEl('input', { cls: 'zg-export-text' });
inp.type = 'text';
inp.value = o.outFolder || '';
intoInput = inp;
inp.placeholder = 'Vault root';
const hits = pick.createDiv({ cls: 'zg-export-hits zg-export-foldhits' });
const paintHits = () => {
hits.textContent = '';
const q = inp.value.trim();
const found = q
? this.exportFinderMatches(q, 6).filter(h => h.kind === 'folder')
: this.exportNearbyScopes(6);
for (const h of found) {
const r = hits.createDiv({ cls: 'zg-export-hit' });
r.createSpan({ cls: 'zg-export-hitpath', text: h.path });
r.addEventListener('mousedown', (ev) => {
ev.preventDefault();
o.outFolder = h.path; inp.value = h.path;
hits.textContent = ''; this.saveSettings();
});
}
};
inp.addEventListener('input', paintHits);
inp.addEventListener('focus', paintHits);
inp.addEventListener('change', () => { o.outFolder = inp.value; this.saveSettings(); });
inp.addEventListener('blur', () => {
window.setTimeout(() => { hits.textContent = ''; }, 120);
});
}
goBtn = runBtn('Export', o.format);
paintFmt();
const prog = into.createDiv({ cls: 'zg-export-prog' });
const progBar = prog.createDiv({ cls: 'zg-export-progbar' });
const progTxt = prog.createDiv({ cls: 'zg-export-progtxt' });
exportProgress = {
show: (done, total, what) => {
prog.addClass('is-on');
progBar.style.width = (total ? Math.round((done / total) * 100) : 0) + '%';
progTxt.setText(what + (total ? '  ' + done + '/' + total : ''));
},
hide: () => { prog.removeClass('is-on'); progBar.style.width = '0%'; }
};
return { progress: exportProgress, repaint: () => paintFmt() };
}
buildExportOptions(into, ctx) {
this.exportOptionDefaults();
const o = this.settings.exportOpts || (this.settings.exportOpts = {});
const split = into.createDiv({ cls: 'zg-export-split' });
const optSide = split.createDiv({ cls: 'zg-export-optside' });
const prevCol = split.createDiv({ cls: 'zg-export-prevcol' });
const rightCol = optSide.createDiv({ cls: 'zg-export-right' });
let redrawOpts = () => {};
let prevTimer = null;
let prevRun = 0;
let prevSig = null;
let prevHandle = null;
const refreshPreview = (ev) => {
try {
const t = ev && ev.target;
if (t && t.closest && t.closest('.zg-export-prevfoot')) return;
} catch (_) { zgCatch('buildExportOptions / refreshPreview: const t = ev && ev.target;', _); }
if (prevTimer) { clearTimeout(prevTimer); prevTimer = null; }
prevTimer = setTimeout(async () => {
prevTimer = null;
const run = ++prevRun;
let picked = [];
try { picked = ctx.compileList ? ctx.compileList() : []; } catch (_) { zgCatch('buildExportOptions / refreshPreview: picked = ctx.compileList ? ctx.compileList() : [];', _); }
if (!picked.length) {
try {
const stale = into.querySelector('.zg-export-top .zg-export-prevhead');
if (stale) stale.remove();
const actRow0 = into.querySelector('.zg-export-top');
if (actRow0) {
const head0 = actRow0.createDiv({ cls: 'zg-export-prevhead' });
head0.createSpan({ text: this.exportFiguresText(
0, 0,
typeof ctx.total === 'function' ? ctx.total() : undefined) });
const go0 = actRow0.querySelector('.zg-export-go');
if (go0) actRow0.insertBefore(head0, go0);
}
} catch (_) { zgCatch('buildExportOptions / refreshPreview: const stale = into.querySelector(\'.zg-export-top …', _); }
prevCol.empty();
prevCol.createDiv({ cls: 'zg-export-prevnone',
text: 'Nothing ticked yet \u2014 the preview shows what will print.' });
return;
}
let secs = [];
let scope0 = '';
try { scope0 = (ctx && typeof ctx.scope === 'function')
? ctx.scope() : ''; } catch (_) { scope0 = ''; }
try { secs = await this.exportSections(picked, o, null, scope0); }
catch (_) { return; }
if (run !== prevRun) return;
let words = 0;
for (const sec of secs) words += this.countWords(sec.markdown);
let sig = null;
try {
sig = JSON.stringify(o) + '\u0002'
+ secs.map(x => (x.path || '') + '\u0000' + (x.title || '')
+ '\u0000' + (x.markdown || '')).join('\u0001');
} catch (_) { sig = null; }
if (sig !== null && sig === prevSig) {
try {
const row0 = into.querySelector('.zg-export-top');
const had = row0 && row0.querySelector('.zg-export-prevhead');
if (row0 && had) {
had.empty();
had.createSpan({ text: this.exportFiguresText(
picked.length, words,
typeof ctx.total === 'function' ? ctx.total() : undefined) });
}
} catch (_) { zgCatch('buildExportOptions / refreshPreview: const row0 = into.querySelector(\'.zg-export-top\');', _); }
return;
}
prevSig = sig;
prevCol.empty();
const actRow = into.querySelector('.zg-export-top');
if (actRow) {
const old = actRow.querySelector('.zg-export-prevhead');
if (old) old.remove();
}
prevHandle = this.exportPreviewInto(prevCol, secs,
this.exportOptsFor(ctx.scope(), o, words), picked.length, words,
null, actRow || null,
typeof ctx.total === 'function' ? ctx.total() : undefined);
}, 220);
};
into.addEventListener('change', refreshPreview);
into.addEventListener('click', refreshPreview);
into.addEventListener('input', refreshPreview);
let optPanel = null;
const optGroup = (label) => {
const into = optPanel || rightCol;
if (label) into.createDiv({ cls: 'zg-export-eyebrow', text: label });
return into.createDiv({ cls: 'zg-export-opts' });
};
const buildOpts = () => {
rightCol.empty();
const toggle = (parent, key, label, hint) => {
const row = parent.createEl('label', {
cls: 'zg-export-opt zg-export-toggle zg-export-check' });
const box = row.createEl('input', { cls: 'zg-export-checkbox' });
box.type = 'checkbox';
const on = !!o[key];
box.checked = on;
row.toggleClass('is-on', on);
row.createSpan({ cls: 'zg-export-checklabel', text: label });
if (hint) row.title = hint;
row.addEventListener('change', () => {
o[key] = !!box.checked;
this.saveSettings();
redrawOpts();
});
return row;
};
const fontOpt = (parent, key, label, inRow) => {
const row = parent.createDiv({ cls: 'zg-export-opt zg-export-textrow zg-export-fontrow'
+ (inRow ? ' is-inrow' : '') });
row.createEl('span', { cls: 'zg-export-optname', text: label });
const pick = row.createDiv({ cls: 'zg-export-fontpick' });
const inp = pick.createEl('input', { cls: 'zg-export-text zg-export-fontinput' });
inp.type = 'text';
inp.value = o[key] || '';
inp.placeholder = 'Times New Roman';
inp.setAttribute('spellcheck', 'false');
const noteHost = (inRow && parent.parentElement)
? parent.parentElement : pick;
const note = noteHost.createDiv({
cls: 'zg-export-fontnote' + (inRow ? ' is-wide' : '') });
const hits = pick.createDiv({ cls: 'zg-export-hits zg-export-fonthits' });
let rows = [], found = [], sel = -1;
const face = (n) => '"' + String(n).replace(/["\\]/g, '') + '"';
const wear = () => {
const n = String(inp.value || '').trim();
inp.style.fontFamily = n ? face(n) : '';
};
const sayNote = () => {
const n = String(inp.value || '').trim();
note.setText(this.fontIsInstalled(n) ? ''
: 'Not found on this machine \u2014 it goes into the file as written, '
+ 'and whatever opens it will substitute.');
};
const noteShow = () => note.toggleClass('is-under',
hits.childElementCount > 0);
const placeHits = () => {
if (!hits.childElementCount) return;
const r = inp.getBoundingClientRect();
const host2 = inp.closest('.zg-uni-modal, .workspace-leaf-content');
const hb = host2 ? host2.getBoundingClientRect() : null;
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
hits.style.width = Math.max(r.width, 220) + 'px';
hits.style.left = Math.round(r.left) + 'px';
hits.style.maxHeight = Math.round(room) + 'px';
if (up) {
hits.style.top = '';
hits.style.bottom = Math.round(winH - r.top + 2) + 'px';
} else {
hits.style.bottom = '';
hits.style.top = Math.round(r.bottom + 2) + 'px';
}
};
const onMove = () => placeHits();
const iwin = (inp.ownerDocument && inp.ownerDocument.defaultView)
|| window;
iwin.addEventListener('scroll', onMove, true);
iwin.addEventListener('resize', onMove);
const close = () => {
hits.textContent = ''; rows = []; found = []; sel = -1;
noteShow();
};
const mark = () => rows.forEach((r, i) => r.classList.toggle('is-selected', i === sel));
const take = (name) => {
o[key] = name; inp.value = name;
this.saveSettings(); wear(); sayNote(); close();
};
const paint = () => {
hits.textContent = ''; rows = []; sel = -1;
found = this.fontFinderMatches(inp.value, 40);
for (const name of found) {
const r = hits.createDiv({ cls: 'zg-export-hit zg-export-fonthit' });
const nm = r.createSpan({ cls: 'zg-export-fontname', text: name });
nm.style.fontFamily = face(name);
if (name === String(o[key] || '')) {
r.createSpan({ cls: 'zg-export-fonttag', text: 'in use' });
}
const i = rows.length;
r.addEventListener('mouseenter', () => { sel = i; mark(); });
r.addEventListener('mousedown', (ev) => { ev.preventDefault(); take(name); });
rows.push(r);
}
if (!found.length) hits.createDiv({ cls: 'zg-export-nohit', text: 'No font by that name.' });
noteShow();
placeHits();
};
const wake = () => {
paint();
const p2 = this.ensureSystemFonts();
if (p2 && p2.then) p2.then(() => { if (rows.length) paint(); sayNote(); });
};
inp.addEventListener('focus', wake);
inp.addEventListener('input', () => { wear(); sayNote(); paint(); });
inp.addEventListener('change', () => {
o[key] = String(inp.value || '').trim();
this.saveSettings(); wear(); sayNote();
});
inp.addEventListener('keydown', (ev) => {
if (ev.key === 'Escape') { close(); return; }
if (!found.length) return;
if (ev.key === 'ArrowDown') { sel = (sel + 1) % found.length; mark(); ev.preventDefault(); }
else if (ev.key === 'ArrowUp') { sel = (sel - 1 + found.length) % found.length; mark(); ev.preventDefault(); }
else if (ev.key === 'Enter') {
if (sel >= 0) { take(found[sel]); ev.preventDefault(); }
else close();
}
});
inp.addEventListener('blur', () => { window.setTimeout(close, 120); });
wear(); sayNote();
return inp;
};
const selOpt = (parent, key, label, items, after, inRow, whenMissing) => {
const row = parent.createDiv({ cls: 'zg-export-opt zg-export-textrow'
+ (inRow ? ' is-inrow' : '') });
row.createEl('span', { cls: 'zg-export-optname', text: label });
const sel = row.createEl('select', { cls: 'dropdown zg-export-sel' });
for (const it of items) {
const op = sel.createEl('option', { text: it.label });
op.value = it.id;
}
sel.value = String(o[key]);
if (whenMissing && !items.some((x) => String(x.id) === String(o[key]))) {
sel.value = String(whenMissing);
}
const sayHint = () => {
const it = items.filter(x => x.id === String(o[key]))[0];
if (it && it.hint) row.title = it.hint; else row.removeAttribute('title');
};
sayHint();
sel.addEventListener('change', () => {
o[key] = sel.value;
sayHint();
this.saveSettings();
if (after) after();
});
return sel;
};
const textOpt = (parent, key, label, ph, hint) => {
const row = parent.createDiv({ cls: 'zg-export-opt zg-export-textrow' });
row.createEl('span', { cls: 'zg-export-optname', text: label });
const inp = row.createEl('input', { cls: 'zg-export-text' });
inp.type = 'text'; inp.value = o[key] || ''; inp.placeholder = ph || '';
inp.addEventListener('change', () => { o[key] = inp.value; this.saveSettings(); });
if (hint) row.title = hint;
return inp;
};
{
optPanel = null;
const grp = optGroup('Manuscript');
const ti = textOpt(grp, 'titleText', 'Title',
String(zgCtxScope(ctx)).split('/').pop().replace(/\.md$/, '') || 'Untitled');
ti.addClass('zg-export-wideinput');
const au = textOpt(grp, 'author', 'Author', 'A. Writer');
au.addClass('zg-export-wideinput');
}
optPanel = rightCol.createDiv({ cls: 'zg-export-panel' });
{
const grp = optGroup('Front matter');
toggle(grp, 'titlePage', 'Title page',
'A page of its own at the front with the title, your name and the '
+ 'word count \u2014 what a submission opens with.');
toggle(grp, 'runningHeaderOn', 'Running header',
'Your surname, the title and the page number along the top of every '
+ 'page, so a printed manuscript can be put back in order.')
.addClass('zg-export-pages');
if (o.titlePage) {
toggle(grp, 'roundWordCount', 'Round the word count',
'\u201cAbout 90,000 words\u201d on the title page, which is what a '
+ 'publisher costing paper expects. Off prints the count exactly.');
}
toggle(grp, 'toc', 'Table of contents',
'A list of the files at the front, each one a link that jumps to it.');
const structGrp = optGroup('Structure');
structGrp.addClass('is-structure');
const pair = structGrp.createDiv({ cls: 'zg-export-pair' });
selOpt(pair, 'joinMode', 'Each file', [
{ id: 'page', label: 'Starts a new page',
hint: 'Every file begins at the top of a fresh page \u2014 how a book '
+ 'starts a chapter, and what a submission expects.' },
{ id: 'divider', label: 'Follows a divider',
hint: 'Files run on down the same page, with the mark below '
+ 'centred between them \u2014 a scene break.' },
{ id: 'run', label: 'Runs straight on',
hint: 'Nothing between one file and the next: the prose reads as '
+ 'though it were all one note.' }
].filter((c) => c.id !== 'page' || zgFormatHasPages(o.format)), () => {
o.pageBreaks = o.joinMode === 'page';
o.starBetween = o.joinMode === 'divider';
this.saveSettings();
redrawOpts();
}, true, 'run');
if (o.starBetween) {
textOpt(structGrp, 'divider', 'Its mark', '#',
'Centred on its own line between one file and the next.');
}
selOpt(pair, 'chapterTitles', 'Insert heading', [
{ id: 'file', label: 'The file\u2019s name',
hint: 'Each file opens with its own name as the heading. A '
+ '# heading inside the note is dropped, so the title is not '
+ 'set twice.' },
{ id: 'note', label: 'The note\u2019s own',
hint: 'Whatever the note already says \u2014 its # headings are kept '
+ 'as written, and nothing is added.' },
{ id: 'none', label: 'None',
hint: 'No headings at all: unbroken prose, with only the dividers '
+ 'or page breaks above to separate the files.' }
], () => {
o.sectionTitles = o.chapterTitles === 'file';
o.keepHeadings = o.chapterTitles !== 'none';
if (o.chapterTitles === 'file') o.keepHeadings = false;
this.saveSettings();
redrawOpts();
}, true);
toggle(structGrp, 'folderHeadings', 'Folder names as headings',
'A folder becomes a heading where it begins — the folders below the deepest one every file shares, one level per folder. A note’s own headings move down to sit under them.');
}
{
const grp = optGroup('Typesetting');
grp.addClass('zg-export-pages');
{
const eb = grp.previousElementSibling;
if (eb && eb.classList.contains('zg-export-eyebrow')) {
eb.addClass('zg-export-pages');
}
}
const trio = grp.createDiv({ cls: 'zg-export-trio' });
selOpt(trio, 'paperId', 'Paper',
ZG_PAPERS.map(p => ({ id: p.id, label: p.label })),
() => { o.a4 = o.paperId === 'a4'; this.saveSettings(); }, true);
fontOpt(trio, 'font', 'Font', true);
selOpt(trio, 'pt', 'Size', [
{ id: '10', label: '10 pt' },
{ id: '11', label: '11 pt' },
{ id: '12', label: '12 pt', hint: 'The manuscript standard.' },
{ id: '13', label: '13 pt' },
{ id: '14', label: '14 pt' }
], () => { o.pt = parseInt(o.pt, 10) || 12; this.saveSettings(); }, true);
selOpt(trio, 'lineSpacing', 'Spacing', [
{ id: 'single', label: 'Single' },
{ id: 'onehalf', label: 'One and a half' },
{ id: 'double', label: 'Double' }
], () => {
o.doubleSpaced = o.lineSpacing !== 'single';
this.saveSettings();
}, true);
toggle(grp, 'indent', 'Indent paragraphs',
'A half-inch first line on every paragraph but the first of a scene '
+ '\u2014 the manuscript convention. Off sets them block style, with a '
+ 'space between instead.');
toggle(grp, 'smartQuotes', 'Curly quotes',
'Turns \' and " into \u2018 \u2019 \u201c \u201d as it compiles. Only in the exported '
+ 'file \u2014 your notes keep what you typed.');
}
{
const grp = optGroup('Also include');
const ALSO = [
['keepFrontmatter', 'Properties',
'The --- block at the top of a note: status, tags, dates. '
+ 'Printed verbatim in monospace, because it is data rather '
+ 'than prose.'],
['keepComments', 'Comments',
'Your %% notes to self %%, kept where they sit and set apart '
+ 'from the prose so a query to yourself cannot be read as a '
+ 'sentence.'],
['keepImages', 'Image placeholders',
'[Image: cover.png] where a picture sits. The picture itself '
+ 'is not embedded \u2014 this is a mark that something belongs '
+ 'there.'],
['highlights', 'Highlights',
'Your ==marked== passages come through highlighted, the same '
+ 'yellow Word\u2019s own pen writes. Off keeps the words and '
+ 'drops the marks.'],
['footnotes', 'Footnotes',
'Your [^1] notes, gathered as endnotes at the back with their '
+ 'markers left in the text. Off removes both.']
];
for (const [key, lab, hint] of ALSO) toggle(grp, key, lab, hint);
}
};
redrawOpts = () => { buildOpts(); refreshPreview(); };
buildOpts();
refreshPreview();
return { el: rightCol, redraw: () => redrawOpts(),
refresh: () => refreshPreview(),
jumpTo: (path) => {
try {
return !!(prevHandle && prevHandle.zgJumpTo
&& prevHandle.zgJumpTo(path));
} catch (_) { return false; }
} };
}
async runExport(kind, scope, files, o, progress) {
if (!files.length) { new Notice('Word-Smith: nothing selected to export.'); return; }
const sections = await this.exportSections(files, o,
progress ? (d, t) => progress.show(d, t, 'Reading') : null,
scope);
if (progress) {
progress.show(files.length, files.length, 'Building');
await new Promise((r) => window.setTimeout(r, 0));
}
let words = 0;
for (const s of sections) words += this.countWords(s.markdown);
const folder = await this.exportEnsureFolder(o.outFolder);
const into = (n) => {
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
} catch (_) { zgCatch('runExport / into: if (!this.app.vault.getAbstractFileByPath(path)) return path;', _); }
return path;
};
const opt = this.exportOptsFor(scope, o, words);
try {
if (kind === 'md') {
const name = into(this.exportFileName(scope, 'md'));
await this.app.vault.create(name, this.exportToMarkdown(sections, opt));
this.exportRemember(scope, kind, opt, files.length, name);
new Notice('Word-Smith: exported ' + name);
return;
}
if (kind === 'pdf') {
const html = this.exportToHtml(sections, opt, false);
const pdfName = into(this.exportFileName(scope, 'pdf'));
try {
const bytes = await this.exportPdfRender(html, opt);
if (!bytes || !bytes.length) throw new Error('the engine returned nothing');
await this.app.vault.createBinary(pdfName, bytes.buffer || bytes);
this.exportRemember(scope, kind, opt, files.length, pdfName);
new Notice('Word-Smith: exported ' + pdfName);
return;
} catch (e) {
console.error('Word-Smith: PDF export failed', e);
new Notice('Word-Smith: could not make a PDF \u2014 '
+ (e && e.message ? e.message : String(e))
+ '. Nothing was written.');
return;
}
}
if (kind === 'html') {
const htmlName = into(this.exportFileName(scope, 'html'));
await this.app.vault.create(htmlName, this.exportToHtml(sections, opt, false));
this.exportRemember(scope, kind, opt, files.length, htmlName);
new Notice('Word-Smith: exported ' + htmlName);
return;
}
const bytes = zgBuildDocx(sections, opt);
const name = into(this.exportFileName(scope, 'docx'));
await this.app.vault.createBinary(name, bytes.buffer);
this.exportRemember(scope, kind, opt, files.length, name);
new Notice('Word-Smith: exported ' + name);
} catch (e) {
console.error('Word-Smith export failed', e);
new Notice('Word-Smith: export failed — ' + (e && e.message ? e.message : e));
}
}
exportPdfOptions(o) {
const paper = zgPaperOf(o);
const m = zgPaperMicrons(paper);
const opt = o || {};
return {
pageSize: { width: m.width, height: m.height },
margins: { top: m.margin, bottom: m.margin,
left: m.margin, right: m.margin },
preferCSSPageSize: true,
landscape: false,
printBackground: false,
displayHeaderFooter: false
};
}
exportPdfAvailable() {
try {
if (Platform && Platform.isMobile) return false;
if (Platform && Platform.isDesktopApp === false) return false;
} catch (_) { zgCatch('exportPdfAvailable: if (Platform && Platform.isMobile) return false;', _); }
try { return typeof window.require === 'function'; } catch (_) { return false; }
}
exportPdfWebview() {
if (!this.exportPdfAvailable()) return null;
try {
const el = document.createElement('webview');
if (typeof el.printToPDF !== 'function' && !('src' in el)) return null;
return el;
} catch (_) { return null; }
}
async exportPdfRender(html, o) {
const view = this.exportPdfWebview();
if (!view) throw new Error('this build has no print engine');
view.style.position = 'fixed';
view.style.left = '-9999px';
view.style.top = '-9999px';
view.style.width = '1px';
view.style.height = '1px';
view.setAttribute('nodeintegration', 'false');
view.setAttribute('webpreferences', 'contextIsolation=true');
view.setAttribute('src', 'data:text/html;charset=utf-8,' + encodeURIComponent(html));
document.body.appendChild(view);
const done = () => { try { view.remove(); } catch (_) { zgCatch('exportPdfRender: view.remove();', _); } };
return await new Promise((resolve, reject) => {
const bail = window.setTimeout(() => {
done();
reject(new Error('the print engine did not answer in time'));
}, 20000);
view.addEventListener('did-fail-load', () => {
window.clearTimeout(bail); done();
reject(new Error('the manuscript could not be loaded for printing'));
});
view.addEventListener('dom-ready', async () => {
try {
await new Promise((r) => window.setTimeout(r, 500));
const buf = await view.printToPDF(this.exportPdfOptions(o));
window.clearTimeout(bail); done();
if (!buf || !buf.length) {
reject(new Error('the print engine returned nothing'));
return;
}
resolve(new Uint8Array(buf));
} catch (e) {
window.clearTimeout(bail); done();
reject(e instanceof Error ? e : new Error(String(e)));
}
});
});
}
openHistoryModal() {
return this.orgOpenTab('history');
}
renderHistoryTab(body, state, rerender) {
const s = this.settings;
state.rerender = rerender;
if (typeof state.scope !== 'string' && !Array.isArray(state.scope)) state.scope = '';
if (typeof state.query !== 'string') state.query = '';
state.shiftPeriod = null;
if (!s.historyTracking) {
const off = this.historyEl('div', 'zg-report-ring-label is-muted', body);
this.historyEl('div', '', off, 'You\u2019re not tracking your writing yet.');
const act = this.historyEl('div', 'zg-hist-empty-act', off);
const go = this.historyEl('button', 'mod-cta', act,
'Start counting');
const hint = this.historyEl('div', 'zg-report-hint', off,
'Counts only \u2014 never your words, and never backwards. You can '
+ 'switch it off again in Settings.');
try {
this.historyFindFile().then((f) => {
if (!f || !hint.isConnected) return;
hint.textContent = 'Your record is still in ' + f.path
+ ' \u2014 switching this on reads it back.';
}).catch(() => {});
} catch (_) { zgCatch('renderHistoryTab: this.historyFindFile().then((f) =>', _); }
go.addEventListener('click', async () => {
if (go.disabled) return;
go.disabled = true;
go.textContent = 'Starting\u2026';
try { await this.historyTrackingOn(); } catch (_) { zgCatch('renderHistoryTab: await this.historyTrackingOn();', _); }
if (rerender) rerender();
});
return;
}
const h = this.historyEnsure();
const figs = this.historyFigures('net', state.scope);
const view = ['day', 'month', 'year', 'cal'].indexOf(s.historyView) !== -1 ? s.historyView : 'day';
const ser = this.historySeriesOn();
const years = this.historyYears(state.scope);
if (years.indexOf(state.year) === -1) state.year = years[years.length - 1];
let sinceFoot = null;
if (s.historyView !== 'cal') {
sinceFoot = this.historyEl('div', 'zg-report-scope zg-hist-sincefoot',
body, h.started
? '* Counting since ' + this.historyLongDate(h.started)
: '* Starts counting the next time you write');
}
const placeFoot = () => { if (sinceFoot) body.appendChild(sinceFoot); };
let topAnchor = sinceFoot;
const calOnly = s.historyView === 'cal' || !!state.hideScope;
const find = this.historyEl('div',
'zg-hist-find' + (calOnly ? ' zg-is-hidden' : ''), body);
if (!topAnchor) topAnchor = find;
const row = this.historyEl('div', 'zg-hist-findrow', find);
if (state.hideScope) {
} else if (state.scope) {
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
const pick = (hit) => {
state.scope = hit.path;
state.query = '';
Object.assign(state, this.historyOpeningPeriod(hit.path));
state.scope = hit.path;
rerender();
};
let hits = [], rows = [], sel = 0;
const mark = () => {
rows.forEach((r, i2) => r.classList.toggle('is-selected', i2 === sel));
if (rows[sel] && rows[sel].scrollIntoView) {
rows[sel].scrollIntoView({ block: 'nearest' });
}
};
const paint = () => {
list.textContent = '';
rows = []; hits = [];
const q = state.query.trim();
if (!q) return;
hits = this.historyFinderMatches(q, 8);
if (!hits.length) {
this.historyEl('div', 'zg-hist-nohit', list, 'Nothing by that name.');
return;
}
sel = Math.max(0, Math.min(sel, hits.length - 1));
hits.forEach((hit, i2) => {
const b = this.historyEl('button', 'zg-hist-hit-' + hit.kind + ' zg-hist-hitrow', list);
this.historyEl('span', 'zg-hist-hitkind', b, hit.kind === 'folder' ? 'folder' : 'note');
this.historyEl('span', 'zg-hist-hitpath', b, hit.path);
b.addEventListener('click', () => pick(hit));
b.addEventListener('mouseenter', () => { sel = i2; mark(); });
rows.push(b);
});
mark();
};
input.addEventListener('input', () => { state.query = input.value; sel = 0; paint(); });
input.addEventListener('keydown', (e) => {
if (e.key === 'ArrowDown' && hits.length) {
sel = Math.min(sel + 1, hits.length - 1);
mark();
e.preventDefault();
return;
}
if (e.key === 'ArrowUp' && hits.length) {
sel = Math.max(sel - 1, 0);
mark();
e.preventDefault();
return;
}
if (e.key === 'Escape') { state.query = ''; input.value = ''; paint(); return; }
if (e.key !== 'Enter') return;
if (hits.length) pick(hits[Math.max(0, Math.min(sel, hits.length - 1))]);
});
paint();
}
if (!calOnly) {
const noteF = this.activeNoteFile();
const chain = [];
if (noteF && noteF.path) {
const cut0 = noteF.path.lastIndexOf('/');
let cur = cut0 > 0 ? noteF.path.slice(0, cut0) : '';
while (cur) {
chain.push(cur);
const cut = cur.lastIndexOf('/');
cur = cut > 0 ? cur.slice(0, cut) : '';
}
}
const crumbs = this.historyEl('div', 'zg-report-crumbs', body);
let first = true;
const crumb = (label, scopePath, title, extra) => {
if (!first) this.historyEl('span', 'zg-crumb-sep', crumbs, '\u2039');
first = false;
const btn = this.historyEl('button',
'zg-crumb' + (extra || '')
+ (state.scope === scopePath ? ' is-active' : ''), crumbs,
this.crumbLabel(label));
btn.setAttribute('title', title);
btn.addEventListener('click', () => {
if (state.scope === scopePath) return;
state.scope = scopePath;
state.query = '';
Object.assign(state, this.historyOpeningPeriod(scopePath || undefined));
state.scope = scopePath;
rerender();
});
};
if (noteF && noteF.path) {
crumb(noteF.path.split('/').pop(), noteF.path, noteF.path, ' zg-crumb-note');
}
for (const p of chain) crumb(p.split('/').pop(), p, p);
crumb('Vault', '', this.vaultWhole() + ' \u2014 everything the record holds');
}
const scoped = Array.isArray(state.scope) ? state.scope.length > 0 : !!state.scope;
if (scoped) {
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
const dataView = view === 'cal' ? 'month' : view;
const data = this.historyBuckets(dataView, state.year, state.month, state.scope);
const showFigs = view !== 'cal';
const grid = this.historyEl('div',
'zg-report-grid zg-history-grid' + (showFigs ? '' : ' zg-is-hidden'), body);
const cell = (label, value, tip) => {
if (!showFigs) return;
const c = this.historyEl('div', 'zg-report-cell has-tip', grid);
c.setAttribute('title', tip);
this.historyEl('div', 'zg-report-value', c, value);
this.historyEl('div', 'zg-report-label', c, label);
};
const signed = (n) => (n > 0 ? '+' : '') + n.toLocaleString();
const activeB = data.buckets.filter(b => (b.a || 0) + (b.r || 0) > 0);
const netSum = data.buckets.reduce((a, b) => a + (b.n || 0), 0);
const bestB = activeB.reduce((m, b) => (!m || (b.n || 0) > (m.n || 0) ? b : m), null);
const streakTip = 'Days in a row you wrote or edited \u2014 cutting counts. '
+ 'A missed day resets it; today doesn\u2019t count until it\u2019s over. '
+ 'Best run: ' + figs.longest.toLocaleString() + '.';
if (view === 'day') {
cell('Words, net', signed(netSum),
'In ' + data.label + ' \u2014 what you wrote minus what you cut.');
cell('Daily average', (activeB.length ? Math.round(netSum / activeB.length) : 0).toLocaleString(),
'Over the ' + activeB.length + ' day' + (activeB.length === 1 ? '' : 's')
+ ' you wrote \u2014 days off don\u2019t drag it down. All-time: '
+ figs.average.toLocaleString() + '.');
cell('Best day', (bestB ? (bestB.n || 0) : 0).toLocaleString(),
bestB ? 'The best single day in ' + data.label + ' \u2014 '
+ (bestB.title || bestB.key) + '. All-time: '
+ figs.best.toLocaleString() + '.'
: 'Nothing here yet.');
cell('Active days', activeB.length + ' of ' + data.buckets.length,
'Days in ' + data.label + ' you wrote or edited \u2014 cutting counts.');
cell('Streak', figs.current.toLocaleString()
+ (figs.current === 1 ? ' day' : ' days'), streakTip);
} else if (view === 'month') {
const bestName = bestB && bestB.title ? bestB.title.split(' ')[0].slice(0, 3) : '';
cell('Words, net', signed(netSum),
'In ' + data.label + ' \u2014 what you wrote minus what you cut.');
cell('Monthly average', (activeB.length ? Math.round(netSum / activeB.length) : 0).toLocaleString(),
'Over the ' + activeB.length + ' month' + (activeB.length === 1 ? '' : 's')
+ ' of ' + data.label + ' you wrote in.');
cell(bestB ? 'Best month \u00b7 ' + bestName : 'Best month',
(bestB ? (bestB.n || 0) : 0).toLocaleString(),
bestB ? 'The best month of ' + data.label + ' \u2014 ' + (bestB.title || '') + '.'
: 'Nothing here yet.');
cell('Months active', activeB.length + ' of 12',
'Months of ' + data.label + ' you wrote in.');
cell('Streak', figs.current.toLocaleString()
+ (figs.current === 1 ? ' day' : ' days'), streakTip);
} else {
const bestName = bestB ? (bestB.label || bestB.key) : '';
cell('Words, net', signed(figs.total),
'Everything written, minus everything cut.');
cell('Yearly average', (activeB.length ? Math.round(netSum / activeB.length) : 0).toLocaleString(),
'Over the ' + activeB.length + ' year' + (activeB.length === 1 ? '' : 's')
+ ' you wrote in.');
cell(bestB ? 'Best year \u00b7 ' + bestName : 'Best year',
(bestB ? (bestB.n || 0) : 0).toLocaleString(),
bestB ? 'Your best year. Best single day: ' + figs.best.toLocaleString()
+ (figs.bestKey ? ', on ' + this.historyLongDate(figs.bestKey) : '') + '.'
: 'Nothing here yet.');
cell('Years active', activeB.length.toLocaleString(),
'Years you wrote in.');
cell('Streak', figs.current.toLocaleString()
+ (figs.current === 1 ? ' day' : ' days'), streakTip);
}
if (!figs.keys.length) {
const empty = this.historyEl('div', 'zg-report-ring-label is-muted zg-hist-empty', body);
this.historyEl('div', '', empty, 'Nothing here yet.');
this.historyEl('div', 'zg-report-hint', empty,
'The chart fills in as you write. There\u2019s no way to go back and work out what '
+ 'you did before today \u2014 a file only knows when it was touched, not how much '
+ 'went into it.');
placeFoot();
return;
}
const sub = this.historyEl('div',
'ws-tab-nav zg-hist-subnav' + (view === 'cal' ? ' zg-is-top' : ''), body);
const tab = (id, label) => {
const b = this.historyEl('button',
'ws-tab-btn zg-hist-subbtn' + (view === id ? ' is-active' : ''), sub, label);
b.addEventListener('click', () => {
if (view === id) return;
s.historyView = id;
rerender();
});
};
tab('day', 'Daily'); tab('month', 'Monthly'); tab('year', 'Yearly');
tab('cal', 'Calendar');
const step = this.historyEl('span', 'zg-hist-step', sub);
state.shiftPeriod = null;
if (view !== 'year') {
const stepArrow = (glyph, names) => {
const b = this.historyEl('button', 'ws-tab-btn zg-hist-arrow', step);
for (const nm of names) {
b.textContent = '';
try { if (setIcon) setIcon(b, nm); } catch (_) { zgCatch('renderHistoryTab / stepArrow: if (setIcon) setIcon(b, nm);', _); }
if (b.childElementCount > 0) { b.dataset.icon = nm; return b; }
}
b.dataset.icon = names[0];
b.setText(glyph);
return b;
};
const back = stepArrow('\u2039', ['chevron-left']);
const fwd = stepArrow('\u203a', ['chevron-right']);
this.historyEl('span', 'zg-hist-period', step, data.label);
const shift = (dir) => {
if (view === 'day') {
let m = state.month + dir, y = state.year;
if (m < 0) { m = 11; y--; }
if (m > 11) { m = 0; y++; }
if (years.indexOf(y) === -1) return;
state.year = y; state.month = m;
} else {
const i = years.indexOf(state.year) + dir;
if (i < 0 || i >= years.length) return;
state.year = years[i];
}
rerender();
};
state.shiftPeriod = shift;
const atStart = view === 'day'
? (state.year === years[0] && state.month === 0)
: state.year === years[0];
const atEnd = view === 'day'
? (state.year === years[years.length - 1] && state.month === 11)
: state.year === years[years.length - 1];
if (atStart) back.setAttribute('disabled', 'true');
if (atEnd) fwd.setAttribute('disabled', 'true');
back.addEventListener('click', () => shift(-1));
fwd .addEventListener('click', () => shift(1));
} else {
this.historyEl('span', 'zg-hist-period', step, data.label);
}
if (topAnchor && topAnchor.parentNode === body) {
body.insertBefore(sub, topAnchor);
}
if (view === 'cal') {
this.buildHistoryCalendar(body, state, rerender);
placeFoot();
return;
}
this.buildHistoryChart(body, data, ser);
const legend = this.historyEl('div', 'zg-hist-series is-underchart', body);
const pill = (id, label, tip) => {
const b = this.historyEl('button',
'zg-hist-pill is-' + id + (ser[id] ? ' is-on' : ''), legend);
this.historyEl('span', 'zg-hist-swatch', b);
this.historyEl('span', '', b, label);
b.setAttribute('title', tip);
b.addEventListener('click', () => {
const next = Object.assign({}, ser);
next[id] = !next[id];
if (!next.added && !next.removed && !next.net) return;
s.historySeries = next;
rerender();
});
};
pill('added', 'Added', 'What you wrote, going up from the line.');
pill('removed', 'Deleted', 'What you cut, going down from the same line \u2014 so a hard '
+ 'day of editing shows up as work instead of a gap.');
pill('net', 'Net', 'What\u2019s left after the cutting, laid over the bars.');
pill('average', 'Average', 'A flat line at your average, counting only the days you wrote.');
placeFoot();
}
historySeriesOn() {
const raw = this.settings.historySeries;
const def = { added: true, removed: true, net: false, average: false };
if (!raw || typeof raw !== 'object') return def;
const out = {};
for (const k of Object.keys(def)) out[k] = typeof raw[k] === 'boolean' ? raw[k] : def[k];
if (!out.added && !out.removed && !out.net) out.added = true;
return out;
}
historyNiceStep(rough) {
if (!(rough > 0)) return 1;
const mag = Math.pow(10, Math.floor(Math.log10(rough)));
const norm = rough / mag;
const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
return step * mag;
}
historyShortNum(v) {
const a = Math.abs(v);
if (a >= 1000000) return (v / 1000000).toFixed(a % 1000000 ? 1 : 0) + 'M';
if (a >= 1000) return (v / 1000).toFixed(a % 1000 && a < 10000 ? 1 : 0) + 'k';
return String(Math.round(v));
}
buildHistoryCalendar(host, state, rerender) {
const s = this.settings;
const year = state.year;
const days = this.historyDays(state.scope);
const metric = ['added', 'removed', 'net'].indexOf(s.historyCalMetric) !== -1
? s.historyCalMetric : 'net';
const valueOf = (rec) => {
if (!rec) return 0;
if (metric === 'added') return rec.a || 0;
if (metric === 'removed') return rec.r || 0;
return rec.n || 0;
};
const key = (y, m, d) => this.historyDateKey(new Date(y, m, d));
const read = this.historyEl('div', 'zg-cal-read', host);
const readDay = this.historyEl('span', 'zg-cal-read-day', read);
const readFig = this.historyEl('span', 'zg-cal-read-fig', read);
const signed = (v) => (v < 0 ? '\u2212' : '+') + Math.abs(v).toLocaleString();
const figOf = (a, r, n) => '+' + a.toLocaleString() + ' added \u00b7 \u2212'
+ r.toLocaleString() + ' cut \u00b7 ' + signed(n) + ' net';
let yAdd = 0, yCut = 0, yNet = 0, yDays = 0;
const clearRead = () => {
readDay.textContent = String(year);
readFig.textContent = figOf(yAdd, yCut, yNet) + ' \u00b7 '
+ yDays.toLocaleString() + (yDays === 1 ? ' day written' : ' days written');
readFig.classList.remove('is-idle');
};
const showRead = (k, rec) => {
const d = new Date(k + 'T00:00:00');
readDay.textContent = isNaN(d) ? k : d.toLocaleDateString(undefined,
{ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
readFig.classList.remove('is-idle');
if (!rec) { readFig.textContent = 'nothing written'; return; }
readFig.textContent = figOf(rec.a || 0, rec.r || 0, rec.n || 0);
};
const legend = this.historyEl('div', 'zg-hist-series zg-cal-legend', host);
const pick = (id, label) => {
const b = this.historyEl('button',
'zg-hist-pill is-' + (id === 'removed' ? 'removed' : id === 'added' ? 'added' : 'net')
+ (metric === id ? ' is-on' : ''), legend);
this.historyEl('span', 'zg-hist-swatch', b);
this.historyEl('span', '', b, label);
b.addEventListener('click', () => {
if (metric === id) return;
s.historyCalMetric = id;
rerender();
});
};
pick('added', 'Added'); pick('removed', 'Deleted'); pick('net', 'Net');
const mags = [];
for (let m = 0; m < 12; m++) {
const last = new Date(year, m + 1, 0).getDate();
for (let d = 1; d <= last; d++) {
const rec = days[key(year, m, d)];
if (!rec || !this.historyIsActive(rec)) continue;
const v = Math.abs(valueOf(rec));
if (v > 0) mags.push(v);
yAdd += rec.a || 0; yCut += rec.r || 0; yNet += rec.n || 0;
yDays++;
}
}
clearRead();
mags.sort((a, b) => a - b);
const top = mags.length
? Math.max(1, mags[Math.floor((mags.length - 1) * 0.9)])
: 1;
const STEPS = 5;
const stepOf = (v) => {
const a = Math.abs(v);
if (a <= 0) return -1;
return Math.min(STEPS, 1 + Math.floor((a / top) * STEPS));
};
const grid = this.historyEl('div', 'zg-cal-year', host);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const todayKey = this.historyDateKey(new Date());
const CAL_WEEK_ROWS = 6;
for (let m = 0; m < 12; m++) {
const box = this.historyEl('div', 'zg-cal-month', grid);
this.historyEl('div', 'zg-cal-name', box, MONTHS[m]);
const cells = this.historyEl('div', 'zg-cal-grid', box);
for (const w of DOW) this.historyEl('div', 'zg-cal-dow', cells, w);
const lead = (new Date(year, m, 1).getDay() + 6) % 7;
for (let i = 0; i < lead; i++) this.historyEl('div', 'zg-cal-pad', cells);
const last = new Date(year, m + 1, 0).getDate();
for (let d = 1; d <= last; d++) {
const k = key(year, m, d);
const rec = days[k];
const v = valueOf(rec);
const st = stepOf(v);
const fam = metric === 'removed' || (metric === 'net' && v < 0)
? 'is-removed' : 'is-added';
const cell = this.historyEl('div',
'zg-cal-day ' + (st < 0 ? 'is-empty' : fam + ' s' + st)
+ (k === todayKey ? ' is-today' : ''), cells, String(d));
cell.addEventListener('mouseenter', () => showRead(k, rec));
cell.addEventListener('focus', () => showRead(k, rec));
cell.addEventListener('click', () => showRead(k, rec));
}
const trail = (CAL_WEEK_ROWS * 7) - (lead + last);
for (let i = 0; i < trail; i++) this.historyEl('div', 'zg-cal-pad', cells);
}
grid.addEventListener('mouseleave', clearRead);
}
buildHistoryChart(body, data, ser) {
const W = HISTORY_CHART_W, H = HISTORY_CHART_H;
const PAD = HISTORY_PX * 3;
const buckets = data.buckets;
const n = buckets.length || 1;
const upVals = [], dnVals = [];
let maxUp = 0, maxDn = 0;
for (const b of buckets) {
if (ser.added && b.a > 0) { upVals.push(b.a); if (b.a > maxUp) maxUp = b.a; }
if (ser.removed && b.r > 0) { dnVals.push(b.r); if (b.r > maxDn) maxDn = b.r; }
if (ser.net && b.n > 0) { upVals.push(b.n); if (b.n > maxUp) maxUp = b.n; }
if (ser.net && b.n < 0) { dnVals.push(-b.n); if (-b.n > maxDn) maxDn = -b.n; }
}
const boundUp = zgAxisBound(upVals);
const boundDn = zgAxisBound(dnVals);
const capUp = boundUp.bound || maxUp;
const capDn = boundDn.bound || maxDn;
const active = buckets.filter(b => (b.a + b.r) > 0);
const avg = (ser.average && active.length)
? Math.round(active.reduce((t, b) => t + b.a - b.r, 0) / active.length)
: 0;
if (!maxUp && !maxDn) maxUp = 1;
const step = this.historyNiceStep(Math.max(capUp, capDn) / 3.2);
const topV = Math.max(step, Math.ceil(capUp / step) * step);
const botV = capDn > 0 ? Math.max(step, Math.ceil(capDn / step) * step) : 0;
let clippedN = 0, overUp = false, overDn = false;
for (const b of buckets) {
const up = (ser.added && b.a > topV)
|| (ser.net && b.n > 0 && b.n > topV);
const dn = (ser.removed && botV > 0 && b.r > botV)
|| (ser.net && b.n < 0 && botV > 0 && -b.n > botV);
if (up) overUp = true;
if (dn) overDn = true;
if (up || dn) clippedN++;
}
const padUp = PAD + (overUp ? HISTORY_OVERLAB_PAD : 0);
const padDn = PAD + (overDn ? HISTORY_OVERLAB_PAD : 0);
const plot = H - padUp - padDn;
const share = topV + botV || 1;
let zero = padUp + plot * (topV / share);
zero = Math.round(zero / HISTORY_PX) * HISTORY_PX;
const upH = zero - padUp, dnH = H - padDn - zero;
const yUp = (v) => zero - (topV ? (v / topV) * upH : 0);
const yDn = (v) => zero + (botV ? (v / botV) * dnH : 0);
const slot = W / n;
const ncol = 1;
let cell = HISTORY_PX, bw, gap;
for (;;) {
bw = Math.floor((slot * 0.82 / ncol) / cell) * cell;
bw = Math.max(cell * 2, Math.min(Math.floor(HISTORY_BAR_MAX / cell) * cell, bw));
gap = Math.max(0, (slot - ncol * bw) / (ncol + 1));
const worst = n * ncol * (bw / cell) * (plot / cell);
if (worst <= HISTORY_MAX_CELLS || cell >= HISTORY_PX * 4) break;
cell *= 2;
}
let ta = 0, tr = 0;
for (const b of buckets) { ta += b.a; tr += b.r; }
const summary = data.label + ' \u00b7 ' + ta.toLocaleString() + ' added \u00b7 '
+ tr.toLocaleString() + ' deleted \u00b7 ' + ((ta - tr) > 0 ? '+' : '')
+ (ta - tr).toLocaleString() + ' net'
+ (avg !== 0 ? ' \u00b7 averaging ' + avg.toLocaleString()
+ ' per active ' + (data.view === 'day' ? 'day' : data.view) : '');
const readout = this.historyEl('div', 'zg-hist-readout', body);
readout.setAttribute('aria-live', 'polite');
const setReadout = (html) => { readout.textContent = html; };
setReadout(summary);
const plotWrap = this.historyEl('div', 'zg-hist-plot', body);
const gutter = this.historyEl('div', 'zg-hist-gutter', plotWrap);
const svg = this.historySvg('svg', {
viewBox: '0 0 ' + W + ' ' + H, class: 'zg-hist-chart',
preserveAspectRatio: 'none', role: 'img'
}, plotWrap);
const todayKey = this.historyDateKey();
const rule = (v, y) => {
if (y < 1 || y > H - 1) return;
for (let x = 0; x < W; x += cell * 4) {
this.historySvg('rect', {
x: x.toFixed(2), y: (y - 0.5).toFixed(2),
width: Math.min(cell * 2, W - x).toFixed(2), height: 1, class: 'zg-hist-grid'
}, svg);
}
const lbl = this.historyEl('span', 'zg-hist-ylbl', gutter,
(v < 0 ? '\u2212' : '') + this.historyShortNum(Math.abs(v)));
lbl.style.top = ((y / H) * 100).toFixed(3) + '%';
};
for (let v = step; v <= topV + 0.001; v += step) rule(v, yUp(v));
for (let v = step; v <= botV + 0.001; v += step) rule(-v, yDn(v));
const px = (g, x, y, w, hh, cls) => this.historySvg('rect', {
x: x.toFixed(2), y: y.toFixed(2),
width: w.toFixed(2), height: hh.toFixed(2), class: cls
}, g);
const solidBar = (g, x, v, w, series, down, isNow) => {
const lim = down ? botV : topV;
const over = lim > 0 && v > lim;
const vv = over ? lim : v;
const span = Math.abs((down ? yDn(vv) : yUp(vv)) - zero);
const h = Math.max(cell, Math.round(span / cell) * cell);
const top = down ? zero : zero - h;
px(g, x, top, w, h, 'zg-hist-px ' + series
+ ' h' + (HISTORY_HEAT - 1) + (isNow ? ' is-now' : '')
+ (over ? ' is-over' : ''));
if (!over) return;
const t = this.historyEl('span',
'zg-hist-overlab ' + series + (down ? ' is-down' : ' is-up'),
plotWrap, (down ? '\u2212' : '+')
+ this.historyShortNum(Math.abs(v)));
const frac = ((x + w / 2) / W).toFixed(5);
t.style.left = 'calc(var(--zg-hist-gut, 0px) + (100% - var(--zg-hist-gut, 0px)) * ' + frac + ')';
t.style.top = ((((down ? zero + h + ZG_HIST_LAB_GAP * cell
: zero - h - ZG_HIST_LAB_GAP * cell) / H) * 100)).toFixed(3) + '%';
};
const groups = [];
for (let i = 0; i < n; i++) {
const b = buckets[i];
const g = this.historySvg('g', { class: 'zg-hist-bargroup' }, svg);
groups.push(g);
g.setAttribute('aria-label', b.readout);
this.historySvg('rect', {
x: (i * slot).toFixed(2), y: 0, width: slot.toFixed(2), height: H,
class: 'zg-hist-hit'
}, g);
const x = i * slot + gap;
const now = (b.key === this.historyDateKey()) || !!b.isNow;
if (ser.added && b.a > 0) solidBar(g, x, b.a, bw, 'is-added', false, now);
if (ser.removed && b.r > 0) solidBar(g, x, b.r, bw, 'is-removed', true, now);
if (!b.a && !b.r) px(g, x, zero - cell, bw, cell, 'zg-hist-zeroed');
}
if (ser.net) {
const netY = (v) => {
if (v > 0) return yUp(topV > 0 && v > topV ? topV : v);
if (v < 0) return yDn(botV > 0 && -v > botV ? botV : -v);
return zero;
};
const TH = HISTORY_PX;
const px = Array(buckets.length);
const py = Array(buckets.length);
for (let i = 0; i < buckets.length; i++) {
px[i] = i * slot + gap + bw / 2;
py[i] = netY(buckets[i].n || 0);
}
if (px.length === 1) {
this.historySvg('circle', {
cx: px[0].toFixed(2), cy: py[0].toFixed(2),
r: (TH / 2).toFixed(2), class: 'zg-hist-netdot'
}, svg);
} else if (px.length > 1) {
const nP = px.length;
const d = Array(nP - 1);
for (let i = 0; i < nP - 1; i++) d[i] = (py[i + 1] - py[i]) / (px[i + 1] - px[i]);
const m = Array(nP);
m[0] = d[0];
m[nP - 1] = d[nP - 2];
for (let i = 1; i < nP - 1; i++) {
m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
}
for (let i = 0; i < nP - 1; i++) {
if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
const a = m[i] / d[i], bq = m[i + 1] / d[i];
const sq = a * a + bq * bq;
if (sq > 9) {
const t2 = 3 / Math.sqrt(sq);
m[i] = t2 * a * d[i];
m[i + 1] = t2 * bq * d[i];
}
}
let nowFrom = Infinity, nowTo = -Infinity;
for (let i = 0; i < buckets.length; i++) {
const b2 = buckets[i];
if ((b2.key === this.historyDateKey()) || b2.isNow) {
nowFrom = Math.min(nowFrom, i * slot + gap);
nowTo = Math.max(nowTo, i * slot + gap + bw);
}
}
const seg3 = (i) => {
const h = px[i + 1] - px[i];
return 'C' + (px[i] + h / 3).toFixed(2)
+ ' ' + (py[i] + m[i] * h / 3).toFixed(2)
+ ' ' + (px[i + 1] - h / 3).toFixed(2)
+ ' ' + (py[i + 1] - m[i + 1] * h / 3).toFixed(2)
+ ' ' + px[i + 1].toFixed(2)
+ ' ' + py[i + 1].toFixed(2);
};
let d2 = 'M' + px[0].toFixed(2) + ' ' + py[0].toFixed(2);
for (let i = 0; i < nP - 1; i++) d2 += seg3(i);
this.historySvg('path', { d: d2, class: 'zg-hist-netline' }, svg);
if (nowTo >= nowFrom) {
let dN = '', open = false;
for (let i = 0; i < nP - 1; i++) {
if (px[i + 1] < nowFrom || px[i] > nowTo) { open = false; continue; }
if (!open) {
dN += 'M' + px[i].toFixed(2) + ' ' + py[i].toFixed(2);
open = true;
}
dN += seg3(i);
}
if (dN) {
this.historySvg('path',
{ d: dN, class: 'zg-hist-netline is-now' }, svg);
}
}
}
}
this.historySvg('rect', {
x: 0, y: (zero - 0.5).toFixed(2), width: W, height: 1, class: 'zg-hist-axis'
}, svg);
const dotted = (y, cls, thick) => {
const th = thick || 2;
for (let x = 0; x < W; x += cell * 3) {
this.historySvg('rect', {
x: x.toFixed(2), y: (y - th / 2).toFixed(2),
width: Math.min(cell * 2, W - x).toFixed(2), height: th, class: cls
}, svg);
}
};
const avgFits = avg > 0 ? (avg <= topV) : (avg < 0 && -avg <= botV);
if (avgFits) {
const ay = avg > 0 ? yUp(avg) : yDn(-avg);
dotted(ay, 'zg-hist-avgline', 1);
const lab = this.historyEl('span', 'zg-hist-avglab', plotWrap,
'avg. ' + Math.round(avg).toLocaleString() + ' words');
lab.style.top = ((ay / H) * 100).toFixed(3) + '%';
}
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
const axisWrap = this.historyEl('div', 'zg-hist-xwrap', body);
const axis = this.historyEl('div', 'zg-hist-xaxis', axisWrap);
axis.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
const spans = [];
for (let i = 0; i < n; i++) {
const isNowBucket = buckets[i].key === todayKey || !!buckets[i].isNow;
spans.push(this.historyEl('span',
isNowBucket ? 'is-now' : '', axis, buckets[i].label));
}
const fitAxis = () => {
try {
const w = axis.getBoundingClientRect().width;
if (!(w > 0) || !spans.length) return;
const cell = w / spans.length;
let need = 0;
const rng = axis.ownerDocument.createRange();
for (const sp of spans) {
rng.selectNodeContents(sp);
need = Math.max(need, rng.getBoundingClientRect().width);
}
if (!(need > 0)) { for (const sp of spans) sp.style.removeProperty('visibility'); return; }
let stride = 1;
while (stride < spans.length && cell * stride < need + 4) stride++;
const last = spans.length - 1;
for (let i = 0; i < spans.length; i++) {
if ((last - i) % stride === 0) spans[i].style.removeProperty('visibility');
else spans[i].style.visibility = 'hidden';
}
} catch (_) { zgCatch('buildHistoryChart / fitAxis: const w = axis.getBoundingClientRect().width;', _); }
};
const awin = (axis.ownerDocument && axis.ownerDocument.defaultView)
|| window;
try { awin.requestAnimationFrame(fitAxis); }
catch (_) { fitAxis(); }
try {
const RO = awin.ResizeObserver;
if (RO) {
let lastW = 0;
const ro = new RO(() => {
let w = 0;
try { w = Math.round(axis.getBoundingClientRect().width); } catch (_) { return; }
if (!w || w === lastW) return;
lastW = w;
fitAxis();
});
ro.observe(axis);
}
} catch (_) { zgCatch('buildHistoryChart: const RO = awin.ResizeObserver;', _); }
if (clippedN > 0) {
const unit = data.view === 'day' ? 'day'
: (data.view === 'month' ? 'month' : 'year');
const cap = this.historyEl('div', 'zg-hist-scalenote', body,
'scale fits ordinary ' + unit + 's \u00b7 '
+ clippedN + ' ' + unit + (clippedN === 1 ? '' : 's') + ' clipped');
cap.setAttribute('title',
'The scale fits the 95th percentile of ' + data.label
+ ' \u2014 or three times the median, whichever is larger \u2014 so an'
+ ' ordinary ' + unit + ' is readable. Anything past it is drawn'
+ ' full height with a hatched top and its real number above.');
}
}
buildHistoryIndicator() {
return this.buildBarButton('zg-barbtn-history',
(node) => { node.textContent = 'History'; },
'Your writing history \u2014 click to open it',
() => this.openHistoryModal());
}
buildExportIndicator() {
return this.buildBarButton('zg-barbtn-export',
(node) => { node.textContent = 'Export'; },
'Compile a manuscript \u2014 click to open the export window',
() => this.openExportModal());
}
buildOutlinerIndicator() {
return this.buildBarButton('zg-barbtn-outliner',
(node) => { node.textContent = 'Organizer'; },
'Arrange the manuscript \u2014 click to open the Organizer',
() => this.orgOpenTab('organizer'));
}
flagColor() {
const file = this.activeNoteFile();
const id = file && ((this.settings.fileStatus || {})[file.path] || '');
if (!id) return null;
try {
const v = getComputedStyle(document.body)
.getPropertyValue('--zg-flag-' + id).trim();
if (v) return v;
} catch (_) { zgCatch('flagColor: const v = getComputedStyle(document.body)', _); }
return { draft: '#6f95c9', revise: '#cf5b52', done: '#5aa96c' }[id] || null;
}
buildFlagIndicator() {
const file = this.activeNoteFile();
const path = file && file.path;
const now = path ? (this.settings.fileStatus || {})[path] || '' : '';
const shape = this.settings.flagTokenFormat || 'icon';
const wantIcon = shape !== 'name';
const wantWord = shape !== 'icon';
return this.buildBarButton('zg-barbtn-flag',
(node) => {
node.textContent = '';
if (!now) { node.textContent = wantWord ? 'flag' : '\u2691'; }
else {
if (wantIcon) {
const wrap = document.createElement('span');
wrap.className = 'zg-barflag';
wrap.innerHTML = zgFlagSvg(now, 11);
node.appendChild(wrap);
}
if (wantWord) {
const w = document.createElement('span');
w.textContent = zgStatusLabel(now);
node.appendChild(w);
}
}
node.classList.toggle('is-set', !!now);
node.classList.toggle('is-' + (now || 'unset'), true);
},
now ? 'This note is ' + zgStatusLabel(now).toLowerCase()
+ ' \u2014 click for the next flag'
: 'Flag where this note is up to \u2014 draft, revise, done',
async () => {
const f = this.activeNoteFile();
if (!f) return;
if (!this.settings.fileStatus) this.settings.fileStatus = {};
const next = zgStatusNext((this.settings.fileStatus || {})[f.path] || '');
if (next) this.settings.fileStatus[f.path] = next;
else delete this.settings.fileStatus[f.path];
this.updateStatusBar();
this.repaintExplorerFlag(f.path);
await this.saveSettings();
});
}
buildReportIndicator() {
return this.buildBarButton('zg-barbtn-report',
(node) => { node.textContent = 'Report'; },
'Word counts and more \u2014 click for the full report',
() => this.openReportModal());
}
scopeFinderMatches(query, limit, foldersOnly) {
const q = String(query || '').trim().toLowerCase();
const out = [];
const vaultWords = ['', 'vault', 'the whole vault', 'all', 'root', '/', 'everything'];
if (!q || vaultWords.some(w => w && w.indexOf(q) === 0)) {
out.push({ path: '', kind: 'folder', vault: true });
}
const hits = q ? this.exportFinderMatches(q, (limit || 8) + 2)
: this.exportNearbyScopes((limit || 8) + 2);
for (const h of hits) {
if (foldersOnly && h.kind !== 'folder') continue;
out.push(h);
}
return out.slice(0, limit || 8);
}
scopeNoteCount(path, kind) {
if (kind === 'file') return 0;
try {
const all = this.app.vault.getMarkdownFiles() || [];
if (!path) return all.length;
const pre = path + '/';
return all.filter(f => f.path.indexOf(pre) === 0).length;
} catch (_) { return 0; }
}
barScope(into, opts) {
const o = opts || {};
const wrap = into.createDiv({ cls: 'zg-scopebar' });
const crumbs = wrap.createDiv({ cls: 'zg-scopecrumbs' });
const quiet = !!o.noSearch;
const input = quiet ? null
: wrap.createEl('input', { cls: 'zg-export-text zg-scopeinput' });
if (input) {
input.type = 'text';
input.placeholder = o.placeholder || 'Search for a folder or a note\u2026';
}
const hits = quiet ? null
: wrap.createDiv({ cls: 'zg-export-hits zg-scopehits' });
if (quiet) wrap.addClass('is-quiet');
const norm = (p2) => (!p2 || p2 === '/' ? '' : String(p2).replace(/^\/+|\/+$/g, ''));
let at = norm(o.current);
let searching = false;
const take = (path, kind) => {
at = norm(path);
searching = false;
if (input) input.value = '';
if (hits) hits.textContent = '';
paint();
if (o.onPick) o.onPick(at, kind || 'folder');
};
const paintHits = () => {
if (!input || !hits) return;
hits.textContent = '';
const found = this.scopeFinderMatches(input.value, 10, o.foldersOnly);
if (!found.length) {
hits.createDiv({ cls: 'zg-export-nohit', text: 'Nothing by that name.' });
return;
}
for (const h of found) {
const r = hits.createDiv({ cls: 'zg-export-hit' });
r.createSpan({ cls: 'zg-export-hitkind',
text: h.vault ? 'vault' : (h.kind === 'folder' ? 'folder' : 'note') });
r.createSpan({ cls: 'zg-export-hitpath',
text: h.vault ? this.vaultWhole() : h.path });
const n = this.scopeNoteCount(h.path, h.kind);
if (h.kind === 'folder') {
r.createSpan({ cls: 'zg-scopecount',
text: n + (n === 1 ? ' note' : ' notes') });
}
r.addEventListener('mousedown', (ev) => {
ev.preventDefault();
take(h.path, h.kind);
});
}
};
const openSearch = (seed) => {
searching = true;
paint();
if (!input) return;
input.value = seed || '';
input.focus();
paintHits();
};
const paint = () => {
wrap.toggleClass('is-searching', searching);
crumbs.textContent = '';
const label = crumbs.createSpan({ cls: 'zg-scopename' });
label.setText(at ? at.replace(/\.md$/i, '') : this.vaultWhole());
label.title = at || this.vaultWhole();
if (quiet) return;
const find = crumbs.createEl('button', { cls: 'zg-crumb zg-crumb-find' });
find.title = 'Search for a folder or a note';
try { if (setIcon) setIcon(find, 'search'); } catch (_) { find.setText('\u2315'); }
find.addEventListener('click', () => openSearch(''));
};
if (input) {
input.addEventListener('input', paintHits);
input.addEventListener('focus', () => { searching = true; wrap.addClass('is-searching'); paintHits(); });
input.addEventListener('keydown', (ev) => {
if (ev.key === 'Escape') { searching = false; input.value = ''; hits.textContent = ''; paint(); }
});
input.addEventListener('blur', () => {
window.setTimeout(() => {
hits.textContent = '';
if (!input.value.trim()) { searching = false; paint(); }
}, 140);
});
}
paint();
return { el: wrap, set: (p2) => { at = norm(p2); paint(); }, at: () => at };
}
openReportModal(at) {
if (!Modal) return;
const plugin = this;
const modal = this.wsModal();
this._auroraSeed = Math.random();
modal.titleEl.setText('Writing Report');
modal.modalEl.addClass('zg-report-modal');
const view = this.activeMarkdownView();
void view;
let asked = null;
try { asked = at ? this.app.vault.getAbstractFileByPath(String(at)) : null; }
catch (_) { asked = null; }
const askedFolder = !!(asked && asked.children);
const openFile = (asked && !askedFolder) ? asked : this.activeNoteFile();
const openFolder = askedFolder ? asked.path
: (asked ? String(at).slice(0, String(at).lastIndexOf('/'))
: this.activeFolderPath());
const body = modal.contentEl.createDiv({ cls: 'zg-report-body' });
let active = askedFolder ? 'folder' : 'note';
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
let repFile = openFile;
let chain = chainOf(openFolder);
let folderSel = chain[0] || '/';
let picked = null;
let query = '';
const render = async () => { try {
body.empty();
body.createDiv({ cls: 'zg-report-loading', text: 'Reading\u2026' });
const buildFinder = (container) => {
plugin.barScope(container, {
noSearch: true,
current: active === 'folder' ? folderSel
: (repFile ? repFile.path : ''),
placeholder: 'Search for a folder or a note\u2026',
onPick: (path, kind) => {
if (kind === 'file') {
const f = plugin.app.vault.getAbstractFileByPath(path);
if (f) { repFile = f; active = 'note'; render(); }
return;
}
active = 'folder';
folderSel = path || '/';
render();
}
});
};
const repour = () => {
const jar = body.querySelector('.zg-goal-liquid');
if (jar && typeof jar.zgPour === 'function') jar.zgPour();
};
let stats = null, target = 0;
if (active === 'note') {
if (!repFile) {
body.empty();
buildFinder(body);
body.createDiv({ text: 'No note open \u2014 pick a folder above, '
+ 'or right-click a row in the Outliner and ask for a report.' });
return;
}
let text = '';
try { text = await plugin.app.vault.cachedRead(repFile); } catch (_) { zgCatch('openReportModal / render: text = await plugin.app.vault.cachedRead(repFile);', _); }
stats = plugin.analyzeText(text);
target = plugin.fileGoalFor(repFile.path);
} else {
stats = await plugin.analyzeFolder(folderSel);
target = plugin.folderTargetRollup(folderSel).value;
}
body.empty();
buildFinder(body);
body.createEl('hr', { cls: 'zg-report-rule' });
const ringWrap = body.createDiv({ cls: 'zg-report-ring' });
if (target > 0) {
const ratio = Math.min(stats.words / target, 1);
const holder = ringWrap.createSpan({ cls: 'zg-goal' + (stats.words >= target ? ' is-met' : '') });
holder.style.color = 'hsl(' + Math.round(8 + ratio * 122) + ', 62%, 44%)';
holder.appendChild(plugin.buildGoalLiquid(ratio));
} else {
const none = ringWrap.createDiv({ cls: 'zg-report-ring-label is-muted' });
none.createDiv({
text: active === 'note' ? 'No goal set for this note yet.'
: 'No goal set for this folder yet.'
});
none.createDiv({
cls: 'zg-report-hint',
text: 'Set one in the Organizer \u2014 in the table, on the '
+ 'Target column.'
});
}
plugin.buildReportFigures(body, stats, target);
} catch (e) {
body.empty();
body.createDiv({ text: 'Report failed \u2014 ' + (e && e.message ? e.message : String(e)) });
} };
render();
modal.contentEl.createDiv({ cls: 'zg-report-foot' });
modal.open();
return modal;
}
buildReportFigures(into, stats, target) {
const grid = into.createDiv({ cls: 'zg-report-grid' });
const cell = (label, value, tip) => {
const c = grid.createDiv({ cls: 'zg-report-cell' + (tip ? ' has-tip' : '') });
if (tip) c.setAttribute('title', tip);
c.createDiv({ cls: 'zg-report-value', text: value });
c.createDiv({ cls: 'zg-report-label', text: label });
};
cell(target > 0 ? 'of ' + target.toLocaleString() + ' words' : 'Words',
stats.words.toLocaleString(),
'Prose only. Frontmatter, code, maths and link targets don\u2019t count.');
cell('Characters', stats.chars.toLocaleString(),
'Without spaces. Skips whatever the word count skips.');
cell('With spaces', (stats.charsWithSpaces || 0).toLocaleString(),
'The word-processor figure \u2014 spaces and line breaks included.');
cell('Syllables', stats.syllables.toLocaleString(),
'A best guess. Unusual words trip it up.');
cell('Sentences', stats.sentences.toLocaleString(),
'Anything ending in . ? or !');
cell('Paragraphs', stats.paragraphs.toLocaleString(),
'Blocks with a blank line between them.');
cell('Pages', (stats.pages || 0).toLocaleString(),
'At 250 words a page \u2014 the manuscript standard.');
cell('Read time', this.formatReadTime(stats.words),
'At ' + READ_WPM + ' words a minute.');
cell('Grade', stats.sentences ? stats.grade.toFixed(1) : '\u2014',
'Years of school needed to read it easily. Under 9 is easy going.');
return grid;
}
modalHost() {
const modal = this.wsModal();
if (!modal) return null;
return {
kind: 'modal',
modal,
rootEl: modal.modalEl,
contentEl: modal.contentEl,
containerEl: modal.containerEl,
key: (mods, k, fn) => modal.scope.register(mods, k, fn),
contains: (el) => {
try { return !!(modal.containerEl && modal.containerEl.contains(el)); }
catch (_) { return false; }
},
onClose: (fn) => {
const was = modal.onClose ? modal.onClose.bind(modal) : null;
modal.onClose = () => { try { fn(); } catch (_) { zgCatch('modalHost / onClose: fn();', _); } if (was) was(); };
},
show: () => modal.open(),
blockClose: (test) => {
const real = modal.close.bind(modal);
modal.close = () => { if (test()) return; real(); };
},
handle: () => modal
};
}
orgIndexEnsure() {
if (this._orgIndex) return this._orgIndexBuild || Promise.resolve(this._orgIndex);
this._orgIndex = zgOrgIndex();
this._orgIndexWatch();
this._orgIndexBuild = this.orgIndexSweep()
.then((ix) => { this._orgIndexRing(); return ix; })
.finally(() => { this._orgIndexBuild = null; });
return this._orgIndexBuild;
}
orgIndexOnChange(cb) {
if (!this._orgIndexSubs) this._orgIndexSubs = new Set();
this._orgIndexSubs.add(cb);
return () => { this._orgIndexSubs.delete(cb); };
}
_orgIndexRing() {
for (const cb of (this._orgIndexSubs || [])) {
try { cb(); } catch (_) { zgCatch('_orgIndexRing: cb();', _); }
}
}
async orgIndexSweep() {
const ix = this._orgIndex;
const files = (this.app.vault.getMarkdownFiles
&& this.app.vault.getMarkdownFiles()) || [];
const seen = new Set();
for (const f of files) {
if (!f || !f.path) continue;
if (!this.isFileCounted(f)) continue;
seen.add(f.path);
const mt = (f.stat && f.stat.mtime) || 0;
if (!zgOrgStale(ix, f.path, mt)) continue;
try { await this.orgIndexRead(f); } catch (_) { zgCatch('orgIndexSweep: await this.orgIndexRead(f);', _); }
}
for (const p of Array.from(ix.keys())) {
if (!seen.has(p)) zgOrgRemove(ix, p);
}
return ix;
}
async orgIndexRead(f) {
if (!this._orgIndex || !f || !f.path) return null;
const text = await this.app.vault.cachedRead(f);
const st = this.analyzeText(text);
const tk = this.countTasks(text);
let props = null;
try {
const c = this.app.metadataCache.getFileCache(f);
props = (c && c.frontmatter) || null;
} catch (_) { zgCatch('orgIndexRead: const c = this.app.metadataCache.getFileCache(f);', _); }
return zgOrgPut(this._orgIndex, f.path, {
words: st.words, paras: st.paragraphs,
charsNoSpaces: st.charsNoSpaces,
charsWithSpaces: st.charsWithSpaces,
sentences: st.sentences,
tasks: tk, grade: st.sentences ? st.grade : null,
mtime: (f.stat && f.stat.mtime) || 0,
ctime: (f.stat && f.stat.ctime) || 0,
props
});
}
_orgIndexWatch() {
const md = (f) => f && f.path && /\.md$/i.test(f.path);
const reg = (bus, name, fn) => {
try {
if (!bus || typeof bus.on !== 'function') return;
const ref = bus.on(name, zgGuard(fn, 'the org index\u2019s ' + name + ' handler'));
try { this.registerEvent(ref); } catch (_) { zgCatch('_orgIndexWatch / reg: this.registerEvent(ref);', _); }
} catch (_) { zgCatch('_orgIndexWatch / reg: if (!bus || typeof bus.on !== \'function\') return;', _); }
};
reg(this.app.metadataCache, 'changed', (f) => {
if (!md(f) || !this._orgIndex) return;
if (!this.isFileCounted(f)) {
if (zgOrgRemove(this._orgIndex, f.path)) this._orgIndexRing();
return;
}
this.orgIndexRead(f).then(() => this._orgIndexRing()).catch(() => {});
});
reg(this.app.vault, 'delete', (f) => {
if (md(f) && this._orgIndex
&& zgOrgRemove(this._orgIndex, f.path)) this._orgIndexRing();
});
reg(this.app.vault, 'rename', (f, oldPath) => {
if (!md(f) || !this._orgIndex) return;
if (zgOrgRename(this._orgIndex, oldPath, f.path)) {
this._orgIndexRing();
} else {
this.orgIndexRead(f).then(() => this._orgIndexRing()).catch(() => {});
}
});
}
async orgPropWrite(path, key, value) {
const f = this.app.vault.getAbstractFileByPath(String(path || ''));
if (!f || f.children || !key) return false;
if (this.propStoreHolds(String(path || ''))) {
return await this.propStoreSet(String(path), key, value);
}
const empty = value === undefined || value === null || value === ''
|| (Array.isArray(value) && !value.length);
try {
await this.app.fileManager.processFrontMatter(f, (fm) => {
let real = String(key);
for (const k of Object.keys(fm || {})) {
if (k.toLowerCase() === String(key).toLowerCase()) { real = k; break; }
}
if (empty) delete fm[real];
else fm[real] = value;
});
return this.storeWriteOk(WS_WRITE.prop);
} catch (e) {
return this.storeWriteFailed(WS_WRITE.prop, e,
'The cell has gone back to what the note says.');
}
}
orgPropTypeChosen(key) {
const k = String(key || '').toLowerCase();
if (!k) return '';
try {
const cols = (this.settings && this.settings.uniUserCols) || [];
for (const c of cols) {
if (!c || !c.key || !c.type) continue;
if (String(c.key).toLowerCase() === k) return String(c.type);
}
} catch (_) { zgCatch('orgPropTypeChosen: const cols = (this.settings && this.settings.uniUserCols) || [];', _); }
return '';
}
orgPropType(key) {
const k = String(key || '').toLowerCase();
if (k === 'tags') return 'tags';
if (k === 'aliases') return 'multitext';
try {
const mt = this.app.metadataTypeManager;
if (mt) {
if (typeof mt.getAssignedWidget === 'function') {
const w = mt.getAssignedWidget(k);
if (w) return String(w);
}
const mine = this.orgPropTypeChosen(k);
if (mine) return mine;
if (typeof mt.getPropertyInfo === 'function') {
const pi = mt.getPropertyInfo(k);
if (pi && pi.widget) return String(pi.widget);
}
const info = mt.properties && mt.properties[k];
if (info && info.widget) return String(info.widget);
if (typeof mt.getAssignedType === 'function') {
const t = mt.getAssignedType(k);
if (t) return String(t);
}
if (info && info.type) return String(info.type);
}
} catch (_) { zgCatch('orgPropType: const mt = this.app.metadataTypeManager;', _); }
return '';
}
dateText(y, mo, d, hh, mi, style) {
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n) => (n < 10 ? '0' : '') + n;
const st = String(style || 'human');
let out;
if (st === 'iso') out = y + '-' + two(mo + 1) + '-' + two(d);
else if (st === 'dmy') out = two(d) + '/' + two(mo + 1) + '/' + y;
else if (st === 'mdy') out = two(mo + 1) + '/' + two(d) + '/' + y;
else out = d + ' ' + MONTHS[mo] + ' ' + y;
if (hh !== null && hh !== undefined) out += ' ' + two(hh) + ':' + two(mi);
return out;
}
dateStyle() {
try { return String((this.settings && this.settings.organizerDateFormat) || 'human'); }
catch (_) { return 'human'; }
}
orgStamp(ms) {
const n = Number(ms);
if (!n || !isFinite(n)) return '';
const dt = new Date(n);
return this.dateText(dt.getFullYear(), dt.getMonth(), dt.getDate(),
dt.getHours(), dt.getMinutes(), this.dateStyle());
}
formatValue(key, raw, type, style) {
const two = (n) => (n < 10 ? '0' : '') + n;
const done = (text, ok) => ({ text: text, ok: ok !== false });
if (raw === null || raw === undefined || raw === '') return done('', true);
const t = String(type || '').toLowerCase();
if (t === 'checkbox' || typeof raw === 'boolean') {
return done(raw === true ? '\u2713' : '', true);
}
if (Array.isArray(raw) || t === 'tags' || t === 'multitext' || t === 'aliases') {
const arr = Array.isArray(raw) ? raw : [raw];
const kept = arr.filter((x) => x !== null && x !== undefined && typeof x !== 'object');
return done(kept.map((x) => String(x).trim()).join(', '), true);
}
if (typeof raw === 'object' && !(raw instanceof Date)) return done('\u2014', false);
if (t === 'number') {
const n = Number(raw);
if (raw === true || raw === false || !isFinite(n)) return done(String(raw), false);
return done(n.toLocaleString(), true);
}
if (t === 'date' || t === 'datetime' || raw instanceof Date) {
let y, mo, d, hh = null, mi = null;
if (raw instanceof Date) {
if (isNaN(raw.getTime())) return done(String(raw), false);
y = raw.getUTCFullYear(); mo = raw.getUTCMonth(); d = raw.getUTCDate();
if (t === 'datetime') { hh = raw.getUTCHours(); mi = raw.getUTCMinutes(); }
} else {
const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(raw).trim());
if (!m) return done(String(raw).trim(), false);
y = Number(m[1]); mo = Number(m[2]) - 1; d = Number(m[3]);
if (m[4] !== undefined) { hh = Number(m[4]); mi = Number(m[5]); }
const LEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const max = (mo === 1 && leap) ? 29 : LEN[mo];
if (mo < 0 || mo > 11 || d < 1 || d > max) return done(String(raw).trim(), false);
if (hh !== null && (hh > 23 || mi > 59)) return done(String(raw).trim(), false);
}
return done(this.dateText(y, mo, d, hh, mi, style), true);
}
return done(String(raw).trim(), true);
}
orgKnownProps() {
const seen = new Map();
try {
const mt = this.app.metadataTypeManager;
const all = mt && mt.properties;
if (all) {
for (const k of Object.keys(all)) {
const name = (all[k] && all[k].name) || k;
if (!seen.has(String(name).toLowerCase())) {
seen.set(String(name).toLowerCase(), String(name));
}
}
}
} catch (_) { zgCatch('orgKnownProps: const mt = this.app.metadataTypeManager;', _); }
if (this._orgIndex) {
for (const r of this._orgIndex.values()) {
if (!r || !r.props) continue;
for (const k of Object.keys(r.props)) {
if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
}
}
}
return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
orgWordsOf(path) {
const r = this._orgIndex && this._orgIndex.get(String(path));
return r ? r.words : null;
}
orgAggUnder(folder) {
if (!this._orgIndex) return null;
return zgOrgAgg(this._orgIndex, zgOrgPathsUnder(this._orgIndex, folder));
}
orgDistinctUnder(folder, key) {
if (!this._orgIndex) return [];
return zgOrgDistinct(this._orgIndex,
zgOrgPathsUnder(this._orgIndex, folder), key);
}
orgCountsUnder(folder, key) {
if (!this._orgIndex) return new Map();
return zgOrgCounts(this._orgIndex,
zgOrgPathsUnder(this._orgIndex, folder), key);
}
openManuscriptModal(opts) {
const plugin = this;
const o = opts || {};
const host = o.host || this.modalHost();
if (!host) return;
host.rootEl.addClass('zg-uni-modal');
if (host.paneClass) host.rootEl.addClass(host.paneClass);
this._auroraSeed = Math.random();
const s = this.settings;
for (const k of ['fileGoals', 'fileStatus']) {
if (!s[k]) s[k] = {};
}
delete s.orgLenses;
delete s.uniSlimCol;
delete s.organizerView;
delete s.organizerDrawer;
const goalStore = () => 'fileGoals';
const statusStore = () => 'fileStatus';
const targetOf = (path) => Number(s[goalStore()][path]) || 0;
const markOf = (path, kind) => (kind === 'folder' ? ''
: (s[statusStore()][path] || ''));
const ownerDoc = () => {
try { return host.contentEl.ownerDocument || document; }
catch (_) { return document; }
};
const ownerWin = () => {
try { return ownerDoc().defaultView || window; }
catch (_) { return window; }
};
const body = host.contentEl.createDiv({ cls: 'zg-uni-body' });
const tabsRow = body.createDiv({ cls: 'zg-uni-tabs' });
const single = !!o.only;
if (single) body.addClass('is-single');
const cols = body.createDiv({ cls: 'zg-uni-cols' });
const right = cols.createDiv({ cls: 'zg-uni-right' });
const foot = body.createDiv({ cls: 'zg-uni-foot' });
const orgNarrowLimit = () => {
const fallback = single ? 420 : 700;
try {
const said = getComputedStyle(host.rootEl)
.getPropertyValue(single ? '--zg-uni-narrow-single' : '--zg-uni-narrow');
const n = parseInt(String(said).trim(), 10);
return isFinite(n) && n > 0 ? n : fallback;
} catch (_) { return fallback; }
};
const narrow = !!(Platform && Platform.isMobile);
if (narrow) host.rootEl.addClass('is-narrow');
let stopWidth = () => {};
if (!narrow && host.kind === 'modal'
&& typeof window.matchMedia === 'function') {
try {
const mq = window.matchMedia(
'(max-width: ' + orgNarrowLimit() + 'px)');
const apply = () => {
host.rootEl.toggleClass('is-narrow', !!mq.matches);
};
apply();
if (typeof mq.addEventListener === 'function') {
mq.addEventListener('change', apply);
stopWidth = () => {
try { mq.removeEventListener('change', apply); } catch (_) { zgCatch('openManuscriptModal: mq.removeEventListener(\'change\', apply);', _); }
};
} else if (typeof mq.addListener === 'function') {
mq.addListener(apply);
stopWidth = () => {
try { mq.removeListener(apply); } catch (_) { zgCatch('openManuscriptModal: mq.removeListener(apply);', _); }
};
}
} catch (_) { zgCatch('openManuscriptModal: const mq = window.matchMedia(', _); }
} else if (!narrow && typeof ResizeObserver !== 'undefined') {
try {
const narrow = zgNarrowState();
const ro = new ResizeObserver((entries) => {
for (const e of entries) {
const d = zgNarrowDecide(narrow,
e.contentRect && e.contentRect.width,
orgNarrowLimit(), Date.now());
if (d.act === 'skip') continue;
if (d.act === 'stop') {
try { ro.disconnect(); } catch (_) { zgCatch('openManuscriptModal: ro.disconnect();', _); }
try {
console.error('Word-Smith: the narrow-window '
+ 'measurement did not settle (width ' + Math.round(d.width)
+ ', limit ' + d.limit + '). The layout is left as it '
+ 'is rather than redrawn again.');
} catch (_) { zgCatch('openManuscriptModal: console.error(\'Word-Smith: the narrow-window \'', _); }
return;
}
host.rootEl.toggleClass('is-narrow', d.want);
}
});
ro.observe(host.rootEl);
stopWidth = () => { try { ro.disconnect(); } catch (_) { zgCatch('openManuscriptModal: ro.disconnect();', _); } };
} catch (_) { zgCatch('openManuscriptModal: const narrow = zgNarrowState();', _); }
}
const ses = this._wsSession || (this._wsSession = zgSessionNew());
const zoomApply = () => {
try { body.style.setProperty('--zg-uni-zoom', String(ses.zoom || 1)); } catch (_) { zgCatch('zoomApply: body.style.setProperty', _); }
};
zoomApply();
body.addEventListener('wheel', (ev) => {
if (!ev.ctrlKey && !ev.metaKey) return;
ev.preventDefault();
const step = ev.deltaY < 0 ? 0.1 : -0.1;
ses.zoom = Math.min(2, Math.max(0.6, Math.round(((ses.zoom || 1) + step) * 10) / 10));
zoomApply();
}, { passive: false });
this._orgZoom = () => ses.zoom || 1;
const sel = new Map();
const keyOf = (it) => it.kind + '\u0000' + it.path;
const itemOf = (key) => {
const cut = key.indexOf('\u0000');
return { kind: key.slice(0, cut), path: key.slice(cut + 1) };
};
const selRows = () => Array.from(sel.values());
let cursor = null;
if (ses.cursor) {
try {
const was = itemOf(ses.cursor);
if (was.path && this.app.vault.getAbstractFileByPath(was.path)) {
cursor = ses.cursor;
} else { ses.cursor = null; }
} catch (_) { ses.cursor = null; }
}
let lastPicked = null;
let cursorDrives = false;
let orgMany = null;
const subjectRows = () => (orgFolder ? [{ kind: 'folder', path: orgFolder }] : []);
let ticks = null;
let ticksFor = null;
const exportScopes = () => {
if (orgMany && orgMany.length) return orgMany.slice();
return orgFolder ? [orgFolder] : null;
};
const exportScope = () => {
const many = exportScopes();
if (many && many.length === 1) return many[0];
return '';
};
const exportFiles = () => {
const many = exportScopes();
if (!many || many.length < 2) return this.exportGather(exportScope());
const out = [], seen = new Set();
for (const p of many) {
for (const f of this.exportGather(p)) {
if (f && f.path && !seen.has(f.path)) { seen.add(f.path); out.push(f); }
}
}
return out;
};
const loadTicks = async () => {
const at = exportScope();
const many = exportScopes();
const cacheKey = (many && many.length > 1) ? many.join('\n') : at;
if (ticks && ticksFor === cacheKey) return ticks;
const list = exportFiles();
let remembered = null;
try {
const store = await this.structureRead();
if (many && many.length > 1) {
const merged = [];
for (const p of many) {
const part = store[p];
if (part && part.length) for (const r of part) merged.push(r);
}
remembered = merged.length ? merged : null;
} else {
remembered = store[at];
}
} catch (_) { zgCatch('openManuscriptModal / loadTicks: const store = await this.structureRead();', _); }
if (remembered && remembered.length) {
const applied = this.exportApplyRemembered(list, remembered);
ticks = applied.chosen;
} else {
ticks = new Set(list.map(f => f.path));
}
ticksFor = cacheKey;
try { this.orgTicksSchedule(); } catch (_) { zgCatch('loadTicks: this.orgTicksSchedule();', _); }
return ticks;
};
let tickTimer = null;
const rememberTicks = () => {
try { this.orgTicksSchedule(); } catch (_) { zgCatch('rememberTicks: this.orgTicksSchedule();', _); }
if (tickTimer) window.clearTimeout(tickTimer);
tickTimer = window.setTimeout(() => {
const many = exportScopes();
if (many && many.length > 1) {
for (const p of many) {
const rows = this.exportGather(p).map(f => ({
path: f.path, on: !ticks || ticks.has(f.path)
}));
this.structureWriteSection(p, rows);
}
return;
}
const at = exportScope();
const rows = this.exportGather(at).map(f => ({
path: f.path, on: !ticks || ticks.has(f.path)
}));
this.structureWriteSection(at, rows);
}, 400);
};
const showShape = () => {
const v = String(s.uniShow || 'all');
return (v === 'files' || v === 'folders') ? v : 'all';
};
const setShape = async (v) => {
s.uniShow = (v === 'files' || v === 'folders') ? v : 'all';
await this.saveSettings(true);
draw(); fill();
try { drawPanel(); } catch (_) { zgCatch('openManuscriptModal / setShape: drawPanel();', _); }
};
const typeLabel = () => {
const on = this.uniTypeSet();
const all = this.uniTypeGroups();
const shape = showShape();
if (shape === 'folders') return 'Folders only';
if (shape === 'files' && on.size === 1 && on.has('md')) return 'Notes only';
if (shape === 'files') return 'Files only';
if (on.size >= all.length) return 'All files';
if (on.size === 1 && on.has('md')) return 'Notes';
return on.size + ' kinds';
};
const typeRows = (into) => {
const groups = this.uniTypeGroups();
const setAnd = (list) => {
this.settings.uniTypes = list;
this.saveSettings(true);
draw(); fill();
try { drawPanel(); } catch (_) { zgCatch('openManuscriptModal / setAnd: drawPanel();', _); }
};
const on = this.uniTypeSet();
const shape = showShape();
const allOn = on.size >= groups.length;
const pick = (i, title, icon, isOn, fn) => {
into.addItem((i2) => {
i2.setTitle(title).setIcon(icon).onClick(fn);
try {
if (typeof i2.setChecked === 'function') i2.setChecked(isOn);
else if (isOn) i2.setTitle('✓ ' + title);
} catch (_) { zgCatch('openManuscriptModal / pick: if (typeof i2.setChecked === \'function\') i2.setChecked(isOn);', _); }
});
};
pick(0, 'Everything', 'files', shape === 'all' && allOn, async () => {
setAnd(groups.map(g => g.id));
await setShape('all');
});
pick(1, 'Notes only', 'file-text',
shape === 'files' && on.size === 1 && on.has('md'), async () => {
setAnd(['md']);
await setShape('files');
});
pick(2, 'Files only', 'file', shape === 'files' && allOn, async () => {
setAnd(groups.map(g => g.id));
await setShape('files');
});
pick(3, 'Folders only', 'folder', shape === 'folders', () => setShape('folders'));
into.addSeparator();
for (const g of groups) {
into.addItem((i) => {
i.setTitle(g.label).setIcon(g.icons[0])
.onClick(() => {
const next = new Set(this.uniTypeSet());
if (next.has(g.id)) next.delete(g.id); else next.add(g.id);
if (!next.size) next.add('md');
setAnd(Array.from(next));
});
try {
if (typeof i.setChecked === 'function') i.setChecked(on.has(g.id));
else if (on.has(g.id)) i.setTitle('\u2713 ' + g.label);
} catch (_) { zgCatch('openManuscriptModal / typeRows: if (typeof i.setChecked === \'function\') i.setChecked(on.has(g.id));', _); }
});
}
};
const colsMenu = (into) => {
into.addItem((i) => i.setTitle('Columns').setIsLabel(true));
const GROUPS = [
{ title: 'Size', ids: ['words', 'paras'] },
{ title: 'Progress', ids: ['goal', 'grade', 'tasks'] },
{ title: 'Dates', ids: ['modified', 'created'] },
{ title: 'Labels', ids: ['mark', 'tags'] }
];
{
const named = new Set(GROUPS.reduce((a, g) => a.concat(g.ids), []));
const rest = COLS.filter(c => !c.user && !named.has(c.id))
.map(c => c.id);
if (rest.length) GROUPS.push({ title: '', ids: rest });
}
for (const group of GROUPS) {
const cols = group.ids.map(colById).filter(Boolean);
if (!cols.length) continue;
into.addSeparator();
if (group.title) {
into.addItem((i) => i.setTitle(group.title).setIsLabel(true));
}
for (const c of cols) {
into.addItem((i) => i.setTitle(c.label).setChecked(!colOff.has(c.id))
.onClick(async () => {
if (colOff.has(c.id)) colOff.delete(c.id); else colOff.add(c.id);
s.uniColsOff = Array.from(colOff);
await this.saveSettings();
draw();
fill();
drawPanel();
}));
}
}
const userCols = COLS.filter(c => c.user);
if (userCols.length) {
into.addSeparator();
into.addItem((i) => i.setTitle('Your properties').setIsLabel(true));
const toggle = async (c) => {
if (colOff.has(c.id)) colOff.delete(c.id); else colOff.add(c.id);
s.uniColsOff = Array.from(colOff);
await this.saveSettings();
draw(); fill();
drawPanel();
};
let nests2 = false;
try {
const scratch = new Menu();
scratch.addItem((i2) => { nests2 = typeof i2.setSubmenu === 'function'; });
} catch (_) { nests2 = false; }
const propRows = (sub, c) => {
sub.addItem((i2) => i2
.setTitle(colOff.has(c.id) ? 'Show this column' : 'Hide this column')
.setIcon(colOff.has(c.id) ? 'eye' : 'eye-off')
.onClick(() => toggle(c)));
};
for (const c of userCols) {
if (nests2) {
into.addItem((i) => {
if (typeof i.setSubmenu !== 'function') {
i.setTitle(c.label).setChecked(!colOff.has(c.id))
.onClick(() => toggle(c));
return i;
}
i.setTitle(c.label);
try { if (i.setIcon) i.setIcon(colOff.has(c.id) ? 'eye-off' : 'tag'); }
catch (_) { zgCatch('openManuscriptModal: if (i.setIcon) i.setIcon(colOff.has(c.id) ? \'eye-off\' : \'tag\');', _); }
try { propRows(i.setSubmenu(), c); }
catch (e) { console.error('Word-Smith: property menu', e); }
return i;
});
} else {
into.addItem((i) => i.setTitle(c.label).setChecked(!colOff.has(c.id))
.onClick(() => toggle(c)));
}
}
}
into.addSeparator();
for (const door of ORG_PROP_DOORS) {
into.addItem((i) => i.setTitle(door.label).setIcon(door.icons[0])
.onClick((ev2) => door.open(ev2)));
}
};
const TABS = [
{ id: 'organizer', label: 'Organizer', icon: 'list-tree', tree: 'binder' },
{ id: 'export', label: 'Export', icon: 'file-output', tree: 'ticks' },
{ id: 'history', label: 'History', icon: 'history', tree: 'slim' }
];
let tab = TABS.some(t => t.id === o.tab) ? o.tab
: (TABS.some(t => t.id === ses.tab) ? ses.tab : 'organizer');
ses.tab = tab;
const orgFolderOk = (p) => {
if (!p) return false;
try {
const at = this.app.vault.getAbstractFileByPath(p);
return !!(at && at.children);
} catch (_) { return false; }
};
let orgFolder = orgFolderOk(String(s.organizerFolder || ''))
? String(s.organizerFolder) : '';
if (ses.folder !== null) orgFolder = String(ses.folder);
const orgFolderSet = (v) => {
orgFolder = orgFolderOk(v) ? String(v) : '';
try { if (this._wsSession) this._wsSession.folder = orgFolder; } catch (_) { zgCatch('openManuscriptModal / orgFolderSet: if (this._wsSession) this._wsSession.folder = orgFolder;', _); }
return orgFolder;
};
const orgNarrowNow = () => {
try { return host.rootEl.classList.contains('is-narrow'); }
catch (_) { return false; }
};
const orgSelect = (p) => {
orgMany = null;
orgFolderSet(p);
orgMark = 'folder';
if (orgNote && !orgFolderHolds(orgFolder, orgNote)) orgNote = '';
s.organizerFolder = orgFolder;
this.saveSettings().catch(() => {});
draw();
drawPanel();
};
let orgNote = '';
let orgMark = 'folder';
const orgFolderHolds = (folder, path) => !folder
|| String(path).indexOf(String(folder) + '/') === 0;
const orgScopeHolds = (path) => !!orgFolder
&& orgFolderHolds(orgFolder, path)
&& orgFolderOk(orgFolder);
const orgFollow = (it, keepScope, markOnly) => {
if (!it || !it.path) return;
if (it.kind === 'folder') {
orgNote = '';
orgFolderSet(it.path);
orgMark = 'folder';
} else {
orgNote = it.path;
orgMark = 'note';
if (markOnly) return;
if (keepScope && orgScopeHolds(it.path)) return;
const par = folderOf(it.path);
orgFolderSet(par);
}
};
const showItem = (it, markOnly) => {
if (!it || !it.path) return;
cursor = keyOf(it);
cursorDrives = true;
orgFollow(it, false, markOnly);
draw();
drawPanel();
};
let orgDrawTimer = null;
const orgIndexChanged = this.orgIndexOnChange(() => {
if (tab !== 'organizer') return;
if (orgDrawTimer) window.clearTimeout(orgDrawTimer);
orgDrawTimer = window.setTimeout(() => {
orgDrawTimer = null;
if (tab !== 'organizer') return;
draw();
drawPanel();
}, 150);
});
let orgLens = { sort: null, chips: [] };
const orgLensOn = () => !!(orgLens.sort
|| orgLens.chips.some(c => !c.off));
const orgLensSet = (patch) => {
orgLens = Object.assign({}, orgLens, patch);
ses.lens = orgLensOn() ? orgLens : null;
drawPanel();
};
const orgLensClear = () => {
orgLensSet({ sort: null, chips: [] });
};
const orgAt = () => orgFolder;
const orgSameChip = (a, b) =>
String(a.axis || '') === String(b.axis || '')
&& String(a.id || '') === String(b.id || '')
&& String(a.key || '').toLowerCase() === String(b.key || '').toLowerCase()
&& String(a.value || '').toLowerCase()
=== String(b.value || '').toLowerCase();
const orgAddChip = (chip) => {
if (orgLens.chips.some(c => orgSameChip(c, chip))) {
orgLensSet({ chips: orgLens.chips.map(c => (orgSameChip(c, chip)
? Object.assign({}, c, { off: false }) : c)) });
return;
}
orgLensSet({ chips: orgLens.chips.concat([chip]) });
};
const orgFilterByKey = (key, ev) => {
const at = orgAt();
let vals = [];
try { vals = this.orgDistinctUnder(at, key) || []; }
catch (_) { vals = []; }
if (!vals.length) {
try { new Notice('No values for ' + key); } catch (_) { zgCatch('openManuscriptModal / orgFilterByKey: new Notice(\'No values for \' + key);', _); }
return;
}
let counts = new Map();
try { counts = this.orgCountsUnder(at, key) || new Map(); }
catch (_) { counts = new Map(); }
const items = vals.map(v => {
const c = counts.get(String(v).trim());
return { value: v, label: String(v) + (c ? '   ' + c : '') };
});
const take = (it) => orgAddChip({ key: key, value: String(it.value) });
if (WsPropSuggestModal) {
try {
new WsPropSuggestModal(this.app, items, take,
'Which value of ' + key + '?').open();
return;
} catch (_) { zgCatch('openManuscriptModal / orgFilterByKey: new WsPropSuggestModal(this.app, items, take,', _); }
}
const pv = new Menu();
for (const it of items.slice(0, 20)) {
pv.addItem((i3) => i3.setTitle(it.label).onClick(() => take(it)));
}
try { pv.showAtMouseEvent(ev); }
catch (_) { try { pv.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('openManuscriptModal / orgFilterByKey: pv.showAtPosition( x: 0, y: 0 );', _e); } }
};
if (!Array.isArray(s.organizerOpen)) s.organizerOpen = [];
const orgOpen = new Set(s.organizerOpen);
const orgIsOpen = (p) => orgOpen.has(p);
const orgRootShut = () => !!s.organizerRootShut;
const orgRootShutSet = (on) => {
s.organizerRootShut = !!on;
this.saveSettings().catch(() => {});
drawPanel();
};
const orgOpenSetMany = (paths, on) => {
let moved = 0;
for (const p of paths) {
if (on ? orgOpen.has(p) : !orgOpen.has(p)) continue;
if (on) orgOpen.add(p); else orgOpen.delete(p);
moved++;
}
if (!moved) return;
s.organizerOpen = Array.from(orgOpen);
this.saveSettings().catch(() => {});
drawPanel();
};
const orgOpenSet = (p, on) => orgOpenSetMany([p], on);
const orgRowList = (at, flat) => {
const out = [];
const dive = (dir, depth) => {
for (const p of this.treeOrderCurrent(dir)) {
let node = null;
try { node = this.app.vault.getAbstractFileByPath(p); } catch (_) { zgCatch('openManuscriptModal / dive: node = this.app.vault.getAbstractFileByPath(p);', _); }
if (!node) continue;
const isFolder = !!node.children;
if (!(flat && isFolder)) {
out.push({
path: p, parent: dir,
kind: isFolder ? 'folder' : 'file',
group: isFolder ? 'folder' : this.uniTypeGroupOf(node),
depth: depth,
rel: dir === at ? '' : (at ? dir.slice(at.length + 1) : dir),
idx: out.length
});
}
if (isFolder && (flat || orgIsOpen(p))) dive(p, depth + 1);
}
};
if (!orgRootShut()) dive(at, 0);
return out;
};
let orgFilePathCache = null;
const orgAllFilePaths = () => {
if (orgFilePathCache) return orgFilePathCache;
try {
const all = this.app.vault.getFiles ? this.app.vault.getFiles() : [];
orgFilePathCache = all.map((f) => f && f.path).filter(Boolean);
} catch (_) { orgFilePathCache = []; }
return orgFilePathCache;
};
const orgUnder = (folder) => {
const pre = String(folder || '') ? String(folder) + '/' : '';
const out = [];
const seen = new Set();
const ix = this._orgIndex;
if (ix) {
for (const p of ix.keys()) {
if (pre && !p.startsWith(pre)) continue;
out.push(p); seen.add(p);
}
}
try {
for (const p of orgAllFilePaths()) {
if (seen.has(p)) continue;
if (pre && !p.startsWith(pre)) continue;
out.push(p);
}
} catch (_) { zgCatch('openManuscriptModal / orgUnder: for (const p of orgAllFilePaths())', _); }
return out;
};
const todayNetOf = (path, kind) => {
const h = this._history;
const by = h && h.today && h.today.by;
if (!by) return null;
if (kind === 'folder') {
let sum = 0, hit = false;
const pre = String(path) + '/';
for (const k of Object.keys(by)) {
if (k.indexOf(pre) === 0) { sum += Number(by[k].n) || 0; hit = true; }
}
return hit ? sum : null;
}
const b = by[path];
return b ? (Number(b.n) || 0) : null;
};
const orgBackMap = () => {
const gen = this._linkGen || 0;
const hit = this._orgBackMap;
if (hit && hit.gen === gen) return hit.map;
const map = new Map();
try {
const resolved = (this.app.metadataCache
&& this.app.metadataCache.resolvedLinks) || {};
for (const src of Object.keys(resolved)) {
const targets = resolved[src] || {};
for (const dest of Object.keys(targets)) {
if (dest === src) continue;
let arr = map.get(dest);
if (!arr) { arr = []; map.set(dest, arr); }
if (arr.indexOf(src) === -1) arr.push(src);
}
}
} catch (_) { zgCatch('openManuscriptModal / orgBackMap: const resolved = (this.app.metadataCache', _); }
this._orgBackMap = { gen, map };
return map;
};
const orgPend = new Map();
const ORG_PEND_MS = 4000;
const orgPendKey = (path, key) =>
String(path) + '\u0000' + String(key).toLowerCase();
const orgPendSet = (path, key, v) => {
orgPend.set(orgPendKey(path, key), { v: v, at: Date.now() });
};
const orgPendDrop = (path, key) => { orgPend.delete(orgPendKey(path, key)); };
const orgPendGet = (path, key) => {
const k = orgPendKey(path, key);
const e = orgPend.get(k);
if (!e) return null;
if (Date.now() - e.at > ORG_PEND_MS) { orgPend.delete(k); return null; }
return e;
};
const orgPendSame = (a, b) => {
if (Array.isArray(a) && Array.isArray(b)) {
return a.length === b.length
&& a.every((x, i) => String(x) === String(b[i]));
}
if (a === null || a === undefined) return b === null || b === undefined;
if (b === null || b === undefined) return false;
return String(a) === String(b);
};
const orgPropSet = async (path, key, value) => {
orgPendSet(path, key, value);
try {
return await this.orgPropWrite(path, key, value);
} catch (e) {
orgPendDrop(path, key);
throw e;
}
};
const orgColRaw = (col, path) => {
const r = this._orgIndex && this._orgIndex.get(path);
switch (col.id) {
case 'words': return r ? r.words : null;
case 'paras': return r ? r.paras : null;
case 'read': return r ? r.words : null;
case 'backlinks': {
const list = orgBackMap().get(String(path || ''));
return (list && list.length) ? list : null;
}
case 'ftype': {
const m = /\.([A-Za-z0-9]+)$/.exec(String(path || ''));
return m ? m[1].toLowerCase() : null;
}
case 'chars': return (r && r.charsNoSpaces) ? r.charsNoSpaces : null;
case 'charsall': return (r && r.charsWithSpaces) ? r.charsWithSpaces : null;
case 'sentences': return (r && r.sentences) ? r.sentences : null;
case 'grade': return (r && r.grade !== null) ? r.grade : null;
case 'modified': case 'created': {
const want = col.id === 'modified' ? 'mtime' : 'ctime';
if (r && r[want]) return r[want];
try {
const f2 = this.app.vault.getAbstractFileByPath(String(path || ''));
if (f2 && !f2.children && f2.stat && f2.stat[want]) return f2.stat[want];
} catch (_) { zgCatch('openManuscriptModal / orgColRaw: const f2 = this.app.vault.getAbstractFileByPath(String(path || \'\'));', _); }
return null;
}
case 'tasks': return (r && r.tasks) ? r.tasks : null;
case 'goal': {
const t = targetOf(path);
return t > 0 ? t : null;
}
case 'mark': return markOf(path, 'file') || null;
case 'tags': {
const tg = this.tagsOf(path);
return (tg && tg.length) ? tg : null;
}
default: {
const key = this.propColKey(col.id);
if (!key) return null;
let real = null;
let fromIndex = false;
if (r && r.props) {
fromIndex = true;
for (const k of Object.keys(r.props)) {
if (k.toLowerCase() !== key.toLowerCase()) continue;
const v = r.props[k];
real = (v === null || v === undefined || v === '') ? null : v;
break;
}
}
if (!fromIndex) {
const sv = this.propStoreGetSync(path, key);
real = (sv === null || sv === undefined || sv === '') ? null : sv;
}
const pend = orgPendGet(path, key);
if (!pend) return real;
const want = (pend.v === null || pend.v === undefined
|| pend.v === '') ? null : pend.v;
if (orgPendSame(real, want)) { orgPendDrop(path, key); return real; }
return want;
}
}
};
const orgColText = (col, path) => {
const v = orgColRaw(col, path);
if (v === null) return '';
switch (col.id) {
case 'words': case 'paras':
case 'chars': case 'charsall': case 'sentences':
return Number(v).toLocaleString();
case 'ftype': return String(v);
case 'backlinks':
return (Array.isArray(v) ? v : [v]).map(nameOf).join(', ');
case 'read': return this.formatReadTime(v);
case 'goal':
return this.orgTargetSay(orgColRaw({ id: 'words' }, path), v);
case 'grade': return (Math.round(v * 10) / 10).toFixed(1);
case 'modified': case 'created':
return this.orgStamp(v);
case 'tasks': return zgTaskSay(v.done, v.all);
case 'mark': {
const d = this.flagDefs().filter(f => f.id === v)[0];
return d ? d.label : String(v);
}
case 'tags': return v.join(', ');
default:
const pk = col.key || col.id;
return this.formatValue(pk, v, this.orgPropType(pk),
this.dateStyle()).text;
}
};
const orgFolderIcon = (into, path, open) =>
this.orgFolderIcon(into, path, open);
const ORG_AGG = {
words: 'sum', paras: 'sum', goal: 'sum',
today: 'sum', grade: 'avg', modified: 'newest',
created: 'oldest', tasks: 'tasks', mark: 'none',
read: 'sum', ftype: 'none',
chars: 'sum', charsall: 'sum', sentences: 'sum'
};
const orgAggHow = (col) => {
if (ORG_AGG[col.id]) return ORG_AGG[col.id];
try {
if (col.user && String(this.orgPropType(col.key || col.id))
.toLowerCase() === 'checkbox') return 'ticked';
} catch (_) { zgCatch('openManuscriptModal / orgAggHow: if (col.user && String(this.orgPropType(col.key || col.id))', _); }
return 'count';
};
const orgColAgg = (col, paths) => {
const how = orgAggHow(col);
if (how === 'none') return null;
let sum = 0, n = 0, newest = 0, oldest = 0, done = 0, all = 0;
let wsum = 0, wtot = 0;
let listy = false;
const seen = new Map();
for (const p of (paths || [])) {
const v = orgColRaw(col, p);
if (v === null || v === undefined) continue;
if (how === 'tasks') { done += v.done; all += v.all; n++; continue; }
if (how === 'ticked') { n++; if (v === true) done++; continue; }
if (how === 'count') {
const take = (x) => {
if (x === null || x === undefined) return;
if (Array.isArray(x)) { listy = true; x.forEach(take); return; }
if (typeof x === 'object') return;
const s2 = String(x).trim();
if (s2 && !seen.has(s2)) seen.set(s2, x);
};
take(v); n++; continue;
}
const num = Number(v);
if (!isFinite(num)) continue;
n++;
if (how === 'newest') { if (num > newest) newest = num; continue; }
if (how === 'oldest') { if (!oldest || num < oldest) oldest = num; continue; }
if (how === 'avg') {
let w = 0;
try { w = Number(orgColRaw({ id: 'words' }, p)) || 0; } catch (_) { w = 0; }
if (w > 0) { wsum += w; wtot += num * w; }
}
sum += num;
}
if (!n) return null;
if (how === 'ticked') {
return { text: done + '/' + n,
title: done + ' of ' + n + ' ticked'
+ ' \u2014 ' + n + (n === 1 ? ' file carries' : ' files carry')
+ ' this property' };
}
switch (how) {
case 'sum':
if (col.id === 'read') return { text: this.formatReadTime(sum) };
return { text: sum.toLocaleString() };
case 'avg': {
const a = wsum > 0 ? (wtot / wsum) : (sum / n);
return { text: (Math.round(a * 10) / 10).toFixed(1),
title: (wsum > 0 ? 'average of ' + n + ', weighted by length'
: 'average of ' + n) };
}
case 'newest':
return { text: this.orgStamp(newest),
title: 'newest of ' + n };
case 'oldest':
return { text: this.orgStamp(oldest),
title: 'oldest of ' + n };
case 'tasks':
return all ? { text: zgTaskSay(done, all) } : null;
default: {
const tot = (paths || []).length;
const vals2 = Array.from(seen.keys());
const many = vals2.join(', ');
const count = listy ? vals2.length : n;
return { text: String(count),
title: (listy
? vals2.length + (vals2.length === 1 ? ' value' : ' values')
+ ' across ' + n + (n === 1 ? ' note' : ' notes')
: n + ' of ' + tot + (tot === 1 ? ' note' : ' notes'))
+ (vals2.length && many.length <= 120
? ' \u00b7 ' + many : '') };
}
}
};
const orgColSortKey = (col, path) => {
const v = orgColRaw(col, path);
if (v === null) return null;
switch (col.id) {
case 'tasks': return v.all - v.done;
case 'tags': return v.length;
case 'mark': {
const ids = this.flagDefs().map(f => f.id);
const i = ids.indexOf(v);
return i === -1 ? ids.length : i;
}
default: {
if (typeof v === 'number') return v;
if (col.sortAs === 'number') {
const n = parseFloat(v);
return isFinite(n) ? n : null;
}
if (col.sortAs === 'date') {
const t = Date.parse(v);
return isFinite(t) ? t : null;
}
const s = Array.isArray(v) ? v.map(String).join(', ') : String(v);
const n = parseFloat(s);
return (isFinite(n) && String(n) === s.trim()) ? n : s.toLowerCase();
}
}
};
const orgChipHit = (chip, path) => {
const want = String(chip.value).trim().toLowerCase();
if (chip.axis === 'flag') {
return (markOf(path, 'file') || '') === String(chip.id || '');
}
if (chip.axis === 'tag') {
let tags = [];
try { tags = this.tagsOf(path) || []; } catch (_) { tags = []; }
return tags.some(t => String(t).replace(/^#/, '').toLowerCase()
=== want.replace(/^#/, ''));
}
if (chip.axis === 'tasks') {
const rr = this._orgIndex && this._orgIndex.get(path);
const t = rr && rr.tasks;
const all = t ? Number(t.all) || 0 : 0;
const done = t ? Number(t.done) || 0 : 0;
if (chip.id === 'none') return all === 0;
if (chip.id === 'any') return all > 0;
void done;
return false;
}
const rEmpty = this._orgIndex && this._orgIndex.get(path);
if (chip.op === 'empty' || chip.op === 'filled') {
const props = rEmpty && rEmpty.props;
let has = false;
if (props) {
for (const k of Object.keys(props)) {
if (k.toLowerCase() !== String(chip.key).toLowerCase()) continue;
const v = props[k];
const flat = Array.isArray(v) ? v : [v];
has = flat.some(x => x !== null && x !== undefined
&& typeof x !== 'object' && String(x).trim() !== '');
break;
}
}
return chip.op === 'empty' ? !has : has;
}
const r = this._orgIndex && this._orgIndex.get(path);
if (!r || !r.props) return false;
for (const k of Object.keys(r.props)) {
if (k.toLowerCase() !== String(chip.key).toLowerCase()) continue;
const v = r.props[k];
const flat = Array.isArray(v) ? v : [v];
return flat.some(x => x != null && typeof x !== 'object'
&& String(x).trim().toLowerCase() === want);
}
return false;
};
const orgPropKeys = (at) => {
const seen = new Map();
const ix = this._orgIndex;
if (!ix) return [];
for (const row of orgRowList(at, true)) {
const r = ix.get(row.path);
if (!r || !r.props) continue;
for (const k of Object.keys(r.props)) {
const lc = k.toLowerCase();
if (!seen.has(lc)) seen.set(lc, k);
}
}
return Array.from(seen.values())
.sort((a, b) => a.localeCompare(b));
};
const orgRenameRow = (item) => {
if (!item || !item.path) return;
const rowEl = panel.querySelector('tr[data-path="'
+ String(item.path).replace(/"/g, '\\"') + '"]');
const nameEl = rowEl && rowEl.querySelector('.zg-org-namelabel');
if (!nameEl) { said('That row is no longer on screen.', true); return; }
const parts = this.outlinerRenameParts(item.path, false);
rowEl.addClass('is-being-renamed');
nameEl.addClass('zg-uni-renaming');
nameEl.setAttribute('contenteditable', 'plaintext-only');
nameEl.setAttribute('spellcheck', 'false');
nameEl.textContent = parts.base;
orgEditGuard = { path: item.path, key: 'rename' };
let settled = false;
const finish = async (commit) => {
if (settled) return;
settled = true;
const typed = (nameEl.textContent || '');
try {
nameEl.removeAttribute('contenteditable');
nameEl.removeClass('zg-uni-renaming');
rowEl.removeClass('is-being-renamed');
} catch (_) { zgCatch('openManuscriptModal / finish: nameEl.removeAttribute(\'contenteditable\');', _); }
orgRedrawPending = true;
orgEditDone();
if (!commit) return;
const r = await this.outlinerRenameTo(item.path, false, typed);
if (r && !r.ok && r.said) said(r.said, true);
};
orgFieldEscape = () => { finish(false); };
nameEl.addEventListener('keydown', (ev) => {
if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
ev.stopPropagation();
});
nameEl.addEventListener('blur', () => { finish(true); });
nameEl.addEventListener('click', (ev) => ev.stopPropagation());
nameEl.addEventListener('mousedown', (ev) => ev.stopPropagation());
try {
nameEl.focus();
const range = ownerDoc().createRange();
range.selectNodeContents(nameEl);
const picksel = ownerWin().getSelection();
picksel.removeAllRanges();
picksel.addRange(range);
} catch (_) { zgCatch('openManuscriptModal / orgRenameRow: nameEl.focus();', _); }
};
const orgMenuCtx = {
said: (msg, bad) => { if (msg) said(msg, bad); },
reveal: () => {},
report: (item) => { try { this.openReportModal(item && item.path); } catch (_) { zgCatch('openManuscriptModal: this.openReportModal(item && item.path);', _); } },
rename: (item) => orgRenameRow(item)
};
const orgFlagSet = async (row, id, cell) => {
if (id) s[statusStore()][row.path] = id;
else delete s[statusStore()][row.path];
await this.saveSettings();
this.repaintExplorerFlag(row.path);
orgCellHint = cell ? { td: cell, path: row.path } : null;
drawPanel();
};
const orgFlagMenu = (ev, row, td) => {
const now = markOf(row.path, 'file');
const m = new Menu();
try { if (m.dom && m.dom.addClass) m.dom.addClass('zg-flag-menu'); } catch (_) { zgCatch('openManuscriptModal / orgFlagMenu: if (m.dom && m.dom.addClass) m.dom.addClass(\'zg-flag-menu\');', _); }
const row1 = (title, id) => m.addItem((i) => {
i.setTitle(title);
try { if (id && i.iconEl) i.iconEl.innerHTML = zgFlagSvg(id, 12); } catch (_) { zgCatch('openManuscriptModal / row1: if (id && i.iconEl) i.iconEl.innerHTML = zgFlagSvg(id, 12);', _); }
try { i.setChecked(now === id); } catch (_) { zgCatch('openManuscriptModal / row1: i.setChecked(now === id);', _); }
i.onClick(() => orgFlagSet(row, id, td));
});
row1('No flag', '');
for (const st of ZG_STATUSES) row1(st.label, st.id);
let at = null;
try {
const r = td && td.getBoundingClientRect && td.getBoundingClientRect();
if (r && (r.width || r.height)) at = { x: r.left, y: r.bottom };
} catch (_) { zgCatch('openManuscriptModal / orgFlagMenu: const r = td && td.getBoundingClientRect && …', _); }
try {
if (at) m.showAtPosition(at);
else m.showAtMouseEvent(ev);
} catch (_) { try { m.showAtPosition(at || { x: 0, y: 0 }); } catch (_e) { zgCatch('openManuscriptModal / orgFlagMenu: m.showAtPosition(at || x: 0, y: 0 );', _e); } }
};
const orgRepaintFlagCell = (td, path) => {
try {
if (!td || !td.isConnected) return false;
const col = (COLS || []).filter(c => c.id === 'mark')[0];
if (!col) return false;
const text = orgColText(col, path);
const more = td.querySelector('.zg-org-flagmore');
for (const kid of Array.from(td.childNodes)) {
if (kid !== more) td.removeChild(kid);
}
if (text) {
const v = orgColRaw({ id: 'mark' }, path);
const ic = td.createSpan({ cls: 'zg-org-flagic' });
ic.innerHTML = zgFlagSvg(String(v), 10);
td.createSpan({ text: text });
if (more) td.appendChild(more);
}
return true;
} catch (_) { return false; }
};
const orgFlagCell = (td, row, text) => {
if (text) {
const v = orgColRaw({ id: 'mark' }, row.path);
const ic = td.createSpan({ cls: 'zg-org-flagic' });
ic.innerHTML = zgFlagSvg(String(v), 10);
td.createSpan({ text: text });
}
td.addClass('is-flag');
td.title = 'Choose a flag';
td.addEventListener('click', (ev) => {
ev.stopPropagation();
orgFlagMenu(ev, row, td);
});
const more = td.createSpan({ cls: 'zg-org-flagmore', text: '\u25be' });
more.setAttribute('aria-label', 'Choose a flag');
more.title = 'Choose a flag';
more.addEventListener('click', (ev) => {
ev.stopPropagation();
orgFlagMenu(ev, row, td);
});
td.addEventListener('contextmenu', (ev) => {
ev.preventDefault();
ev.stopPropagation();
orgFlagMenu(ev, row, td);
});
};
const orgCanHoldProps = (path) => {
const p = String(path || '');
if (!p) return false;
try {
const f = this.app.vault.getAbstractFileByPath(p);
return !!f && !f.children;
} catch (_) { return false; }
};
const orgCanHoldGoal = (path) => /\.md$/i.test(String(path || ''));
const orgPropRefuse = (path) => {
const ext = String(path || '').split('.').pop();
try {
new Notice('A .' + ext + ' cannot hold properties — they live in a note\u2019s frontmatter.');
} catch (_) { zgCatch('openManuscriptModal / orgPropRefuse: new Notice(\'A .\' + ext + \' cannot hold properties — they live in a …', _); }
};
const orgPropCell = (td, row, col, text) => {
td.setText(text);
if (text) td.title = text;
const canEdit = orgCanHoldProps(row.path);
if (canEdit) td.addClass('is-prop');
td.addEventListener('click', (ev) => {
ev.stopPropagation();
if (!canEdit) { orgPropRefuse(row.path); return; }
{
const held = td.querySelector('.zg-org-shown')
|| td.querySelector('.zg-org-editor');
if (held) {
if (ev.target === td) {
try {
held.click();
if (held.focus) held.focus();
} catch (_) { zgCatch('openManuscriptModal / orgPropCell: held.click();', _); }
}
return;
}
}
if (orgOtherEditorOpen(td)) {
orgOpenAfter = { path: row.path, id: col.id, key: col.key };
drawOrg();
return;
}
td.textContent = '';
orgFieldEditor(td, row.path, col.key, false);
});
};
const orgGoalCell = (td, row, text) => {
td.setText(text);
const canGoal = orgCanHoldGoal(row.path);
if (canGoal) td.addClass('is-goal');
if (canGoal) {
td.title = text ? 'Click to change the target' : 'Click to set a target';
}
td.addEventListener('click', (ev) => {
ev.stopPropagation();
if (!canGoal) {
const ext = String(row.path || '').split('.').pop();
try {
new Notice('A .' + ext + ' has no word count, so a target has nothing to measure.');
} catch (_) { zgCatch('openManuscriptModal / orgGoalCell: new Notice(\'A .\' + ext + \' has no word count, so a target has nothing …', _); }
return;
}
if (td.querySelector('input')) return;
const was = targetOf(row.path);
td.textContent = '';
const inp = td.createEl('input', { cls: 'zg-org-editor zg-org-goaledit' });
inp.type = 'number';
inp.min = '0';
inp.value = was > 0 ? String(was) : '';
let settled = false;
inp.addEventListener('focus', () => {
orgEditGuard = { path: row.path, key: 'goal' };
orgFieldEscape = () => { settled = true; inp.blur(); };
});
inp.addEventListener('keydown', (ev2) => {
if (ev2.key === 'Enter') { ev2.preventDefault(); inp.blur(); }
ev2.stopPropagation();
});
inp.addEventListener('blur', async () => {
const commit = !settled;
settled = true;
if (commit) {
const n = parseFloat(inp.value);
const want = (isFinite(n) && n > 0) ? Math.round(n) : 0;
if (want !== was) {
if (want > 0) s[goalStore()][row.path] = want;
else delete s[goalStore()][row.path];
await this.saveSettings(true);
}
}
orgRedrawPending = true;
orgEditDone();
});
window.setTimeout(() => { try { inp.focus(); inp.select(); } catch (_) { zgCatch('openManuscriptModal / orgGoalCell: inp.focus();', _); } }, 0);
});
};
let orgDragPath = null;
let orgPropDrag = null;
let orgDragCol = null;
let orgLastGrouping = null;
const orgDropMarks = () => {
for (const el2 of panel.querySelectorAll(
'.zg-drop-above, .zg-drop-below, .zg-drop-into')) {
el2.removeClass('zg-drop-above');
el2.removeClass('zg-drop-below');
el2.removeClass('zg-drop-into');
}
};
const orgDropRun = async (movedPath, ontoPath, below) => {
if (!movedPath || !ontoPath || movedPath === ontoPath) return;
if (folderOf(movedPath) !== folderOf(ontoPath)) return;
const parent = folderOf(movedPath);
await this.treeOrderMove(parent, movedPath,
zgOrgDropBefore(this.treeOrderCurrent(parent),
movedPath, ontoPath, below));
};
const orgBackCell = (td, row) => {
const list = orgColRaw({ id: 'backlinks' }, row.path);
if (!list || !list.length) return;
td.title = list.map(nameOf).join(String.fromCharCode(10));
for (let i = 0; i < list.length; i++) {
const p = list[i];
if (i) td.createSpan({ cls: 'zg-org-backsep', text: ', ' });
const a = td.createSpan(
{ cls: 'zg-org-backlink', text: nameOf(p) });
a.setAttribute('role', 'link');
a.setAttribute('tabindex', '0');
a.title = 'Open ' + nameOf(p);
const go = (ev) => {
ev.stopPropagation();
ev.preventDefault();
openRow({ kind: 'file', path: p }, ev);
};
a.addEventListener('click', go);
a.addEventListener('keydown', (ev) => {
if (ev.key === 'Enter' || ev.key === ' ') go(ev);
});
}
};
const orgTagsCell = (td, row) => {
const list = this.tagsWithSource(row.path);
const canEdit = orgCanHoldProps(row.path);
if (canEdit) td.addClass('is-prop');
td.addEventListener('click', (ev) => {
ev.stopPropagation();
if (!canEdit) { orgPropRefuse(row.path); return; }
if (td.querySelector('.zg-org-editor')) return;
if (orgOtherEditorOpen(td)) {
orgOpenAfter = { path: row.path, id: 'tags', key: 'tags' };
drawOrg();
return;
}
td.textContent = '';
orgFieldEditor(td, row.path, 'tags', false);
});
for (const t of list) {
const chip = td.createSpan({
cls: 'zg-org-tagchip' + (t.inText ? ' is-intext' : '') });
chip.createSpan({ text: t.tag });
chip.title = t.inText
? '#' + t.tag + ' — written in the note’s text, so it is '
+ 'edited there, not here'
: '#' + t.tag + ' — a frontmatter tag';
}
};
const ORG_EDGE = 0.2;
const orgAtEdge = (el, ev) => {
const r = el.getBoundingClientRect();
if (!r.height) return true;
const at = (ev.clientY - r.top) / r.height;
return at <= ORG_EDGE || at >= 1 - ORG_EDGE;
};
const orgGroupDrop = (g, parentPath) => {
g.addEventListener('dragover', (ev) => {
orgDropMarks();
if (!orgDragPath) return;
if (folderOf(orgDragPath) === parentPath) return;
if (orgAtEdge(g, ev)) return;
ev.preventDefault();
g.addClass('zg-drop-into');
try { ev.dataTransfer.dropEffect = 'move'; } catch (_) { zgCatch('openManuscriptModal / orgGroupDrop: ev.dataTransfer.dropEffect = \'move\';', _); }
});
g.addEventListener('dragleave', () => g.removeClass('zg-drop-into'));
g.addEventListener('drop', async (ev) => {
if (orgAtEdge(g, ev)) return;
const moved = orgDragPath;
orgDropMarks();
g.removeClass('zg-drop-into');
orgDragPath = null;
if (!moved || folderOf(moved) === parentPath) return;
ev.preventDefault();
const done = await this.treeMoveInto(moved, parentPath);
if (done && !done.ok && done.said) said(done.said, true);
else if (done && done.ok) {
said('Moved “' + nameOf(moved) + '” into '
+ (parentPath ? nameOf(parentPath) : 'the vault root')
+ '.', false);
}
});
};
const orgRowDrag = (tr, row) => {
if (this.isStoreFile && this.isStoreFile(row.path)) return;
tr.setAttribute('draggable', 'true');
tr.addClass('is-draggable');
tr.addEventListener('dragstart', (ev) => {
orgDragPath = row.path;
tr.addClass('is-dragging');
try { ev.dataTransfer.setData('text/plain', row.path); } catch (_) { zgCatch('openManuscriptModal / orgRowDrag: ev.dataTransfer.setData(\'text/plain\', row.path);', _); }
});
tr.addEventListener('dragover', (ev) => {
orgDropMarks();
if (!orgDragPath || orgDragPath === row.path) return;
if (folderOf(orgDragPath) !== row.parent) return;
if (row.kind === 'folder' && !orgAtEdge(tr, ev)) return;
ev.preventDefault();
const r = tr.getBoundingClientRect();
const below = (ev.clientY - r.top) > r.height / 2;
tr.addClass(below ? 'zg-drop-below' : 'zg-drop-above');
try { ev.dataTransfer.dropEffect = 'move'; } catch (_) { zgCatch('openManuscriptModal / orgRowDrag: ev.dataTransfer.dropEffect = \'move\';', _); }
});
tr.addEventListener('drop', async (ev) => {
if (row.kind === 'folder' && !orgAtEdge(tr, ev)) return;
const moved = orgDragPath;
orgDropMarks();
orgDragPath = null;
if (!moved || folderOf(moved) !== row.parent) return;
ev.preventDefault();
const r = tr.getBoundingClientRect();
await orgDropRun(moved, row.path,
(ev.clientY - r.top) > r.height / 2);
});
tr.addEventListener('dragend', () => {
orgDragPath = null;
orgDropMarks();
tr.removeClass('is-dragging');
});
this.touchDrag(tr, row.path, {
rows: () => Array.from(panel.querySelectorAll(
'.zg-org-row[data-path]')),
idOf: (el2) => el2.getAttribute('data-path'),
drop: (from, to, below) => { orgDropRun(from, to, below); }
});
};
let orgMode = 'table';
const orgChevron = (into, open) => {
const el = into.createSpan({
cls: 'zg-org-twist tree-item-icon collapse-icon'
+ ' nav-folder-collapse-indicator'
+ (open ? ' is-open' : ' is-collapsed')
});
try { if (setIcon) setIcon(el, 'right-triangle'); } catch (_) { zgCatch('openManuscriptModal / orgChevron: if (setIcon) setIcon(el, \'right-triangle\');', _); }
if (!el.childElementCount) el.setText(open ? '⌄' : '›');
return el;
};
const orgModeSet = (mode) => {
const next = mode === 'outline' ? 'outline' : 'table';
if (next === orgMode) return;
orgMode = next;
s.organizerMode = orgMode;
this.saveSettings().catch(() => {});
drawPanel();
};
this._orgMode = () => orgMode;
this._orgModeSet = (m) => orgModeSet(m);
this._orgOpenSet = (p, on) => orgOpenSet(p, !!on);
this._orgOpen = () => Array.from(orgOpen);
const ORG_NAME_MIN = 120;
const ORG_NAME_MAX = 1200;
const ORG_COL_MIN = 48;
const ORG_COL_MAXFRAC = 0.6;
let orgScrollTop = Math.max(0, Number(ses.scroll) || 0);
let orgScrollLeft = 0;
let orgCeilHost = null;
let orgCeilVal = 0;
const orgColCeilReset = () => { orgCeilHost = null; };
const orgColCeil = (host) => {
if (host && orgCeilHost === host) return orgCeilVal;
const w = host && host.clientWidth;
const v = !(w > 0) ? ORG_NAME_MAX
: Math.max(ORG_COL_MIN, Math.round(w * ORG_COL_MAXFRAC));
if (host) { orgCeilHost = host; orgCeilVal = v; }
return v;
};
const orgColFit = () => {
if (!orgColFitNow) return;
orgColFitNow();
};
let orgColFitNow = null;
const orgColPx = () => {
const m = s.uniColPx;
return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
};
const orgColW = (id, host) => {
const n = Number(orgColPx()[String(id)]);
if (!isFinite(n) || n <= 0) return 0;
const lo = id === 'name' ? ORG_NAME_MIN : ORG_COL_MIN;
const hi = Math.min(ORG_NAME_MAX, orgColCeil(host));
return Math.round(Math.max(lo, Math.min(hi, n)));
};
const orgColWSet = (id, px) => {
const m = Object.assign({}, orgColPx());
if (px === null) delete m[String(id)];
else m[String(id)] = Math.round(px);
s.uniColPx = m;
this.saveSettings().catch(() => {});
};
const orgNameW = () => orgColW('name', null);
let orgNameLineNow = null;
let orgNameRO = null;
const orgNameStamp = (table) => {
const w = orgNameW();
if (!w) return;
table.addClass('is-namefixed');
table.style.setProperty('--zg-org-namew', w + 'px');
};
const orgColApply = (cell, w) => {
cell.style.boxSizing = 'border-box';
cell.style.width = w + 'px';
cell.style.minWidth = w + 'px';
cell.style.maxWidth = w + 'px';
};
const orgColUnfix = (cell) => {
cell.style.removeProperty('width');
cell.style.removeProperty('min-width');
cell.style.removeProperty('max-width');
};
const orgColLive = (host, id, w) => {
if (!host) return;
for (const cell of Array.from(host.querySelectorAll('th, td'))) {
if (cell.getAttribute('data-col') !== id) continue;
orgColApply(cell, w);
}
};
const orgColStamp = (cell, id, host) => {
const w = orgColW(id, host);
if (!w) return;
orgColApply(cell, w);
};
let orgGripReleasedAt = 0;
const ORG_GRIP_CLICK_MS = 300;
const ORG_GRIP_NEAR = 4;
const orgGripAt = (host, x, y) => {
if (!host) return null;
const hb = host.getBoundingClientRect();
if (y < hb.top || y > hb.bottom) return null;
for (const g of Array.from(host.querySelectorAll('.zg-org-colgrip'))) {
const r = g.getBoundingClientRect();
const mid = (r.left + r.right) / 2;
if (Math.abs(x - mid) <= ORG_GRIP_NEAR) return g;
}
return null;
};
const orgGripHover = (host) => {
if (!host || host.hasAttribute('data-zg-griphover')) return;
host.setAttribute('data-zg-griphover', '1');
let lit = null;
const light = (g) => {
if (lit === g) return;
if (lit) lit.removeClass('is-near');
lit = g;
if (lit) lit.addClass('is-near');
host.toggleClass('is-gripnear', !!lit);
};
host.addEventListener('pointermove', (ev) => {
light(orgGripAt(host, ev.clientX, ev.clientY));
});
host.addEventListener('pointerleave', () => light(null));
};
const orgColGripBind = (th, col, host) => {
const grip = th.createDiv({ cls: 'zg-org-colgrip' });
orgGripHover(host);
grip.setAttribute('data-col', col.id);
grip.title = 'Drag to set how wide “' + col.label + '” is — '
+ 'double-click to hand it back to the table';
let from = 0, base = 0, live = 0;
const move = (ev) => {
live = Math.max(ORG_COL_MIN, Math.min(orgColCeil(host),
base + (ev.clientX - from)));
orgColLive(host, col.id, Math.round(live));
};
const up = () => {
try {
ownerWin().removeEventListener('pointermove', move, true);
ownerWin().removeEventListener('pointerup', up, true);
} catch (_) { zgCatch('openManuscriptModal / up: ownerWin().removeEventListener(\'pointermove\', move, true);', _); }
orgGripReleasedAt = Date.now();
if (!live) return;
orgColWSet(col.id, live);
live = 0;
};
host.addEventListener('pointerdown', (ev) => {
if (orgGripAt(host, ev.clientX, ev.clientY) !== grip) return;
ev.preventDefault();
ev.stopPropagation();
from = ev.clientX;
base = th.getBoundingClientRect().width || ORG_COL_MIN;
live = 0;
try {
ownerWin().addEventListener('pointermove', move, true);
ownerWin().addEventListener('pointerup', up, true);
} catch (_) { zgCatch('openManuscriptModal / orgColGripBind: ownerWin().addEventListener(\'pointermove\', move, true);', _); }
});
grip.addEventListener('dragstart', (ev) => {
ev.preventDefault();
ev.stopPropagation();
});
host.addEventListener('dblclick', (ev) => {
if (orgGripAt(host, ev.clientX, ev.clientY) !== grip) return;
ev.preventDefault();
ev.stopPropagation();
orgColWSet(col.id, null);
drawPanel();
});
};
const orgNameGripBind = (host, th, table) => {
const grip = host.createDiv({ cls: 'zg-org-namegrip' });
grip.title = 'Drag to set how wide the Name column is '
+ '\u2014 double-click to hand it back to the table';
let from = 0, base = 0, live = 0;
const move = (ev) => {
live = Math.max(ORG_NAME_MIN, Math.min(orgColCeil(host),
base + (ev.clientX - from)));
table.addClass('is-namefixed');
table.style.setProperty('--zg-org-namew',
Math.round(live) + 'px');
try { if (orgNameLineNow) orgNameLineNow(); } catch (_) { zgCatch('openManuscriptModal / move: if (orgNameLineNow) orgNameLineNow();', _); }
};
const up = () => {
try {
ownerWin().removeEventListener('pointermove', move, true);
ownerWin().removeEventListener('pointerup', up, true);
} catch (_) { zgCatch('openManuscriptModal / up: ownerWin().removeEventListener(\'pointermove\', move, true);', _); }
if (!live) return;
orgColWSet('name', live);
live = 0;
};
grip.addEventListener('pointerdown', (ev) => {
ev.preventDefault();
ev.stopPropagation();
from = ev.clientX;
base = th.getBoundingClientRect().width || ORG_NAME_MIN;
live = 0;
try {
ownerWin().addEventListener('pointermove', move, true);
ownerWin().addEventListener('pointerup', up, true);
} catch (_) { zgCatch('openManuscriptModal / orgNameGripBind: ownerWin().addEventListener(\'pointermove\', move, true);', _); }
});
grip.addEventListener('click', (ev) => ev.stopPropagation());
grip.addEventListener('dblclick', (ev) => {
ev.preventDefault();
ev.stopPropagation();
orgColWSet('name', null);
drawPanel();
});
};
this._orgDraw = () => drawPanel();
this._orgFit = () => { if (orgColFitNow) orgColFitNow(); };
this._orgAt = () => orgFolder;
const treeDoor = {
kind: host.kind,
select: (p) => orgSelect(p == null || p === '/' ? '' : String(p)),
follow: (p) => {
if (!p) return;
orgFollow({ kind: 'file', path: String(p) }, true);
draw();
drawPanel();
if (exportOpts && exportOpts.jumpTo && tab === 'export') {
try { exportOpts.jumpTo(String(p)); } catch (_) { zgCatch('treeDoor.follow: exportOpts.jumpTo(String(p));', _); }
}
},
tab: () => tab,
single: () => single,
tabSet: (id) => tabSet(id),
many: (list) => {
const l = Array.isArray(list) ? list.filter((p) => typeof p === 'string' && p) : [];
if (l.length === 1) { orgMany = null; orgSelect(l[0]); return; }
orgMany = l.length ? l.slice() : null;
ticksFor = null;
draw();
drawPanel();
},
host: () => host,
ticks: {
wanted: () => tab === 'export',
state: (path, kind) => {
if (!ticks) return null;
const mine = zgUnderRow(underIndex(), path, kind);
if (!mine.length) return { mine: 0, all: false, some: false };
const on = mine.filter((p) => ticks.has(p)).length;
return { mine: mine.length, all: on === mine.length, some: on > 0 && on < mine.length };
},
toggle: (path, kind) => {
if (!ticks) return false;
const mine = zgUnderRow(underIndex(), path, kind);
if (!mine.length) return false;
const on = mine.filter((p) => ticks.has(p)).length;
const next = on !== mine.length;
for (const p of mine) { if (next) ticks.add(p); else ticks.delete(p); }
rememberTicks();
draw();
drawPanel();
return true;
}
}
};
this.orgWindowAdd(treeDoor);
this._orgNote = () => orgNote;
this._orgLens = () => JSON.parse(JSON.stringify(orgLens));
this._orgLensSet = (patch) => orgLensSet(patch);
const orgPropsByUse = () => {
const seen = new Map();
for (const p2 of liveFiles()) {
const f = this.app.vault.getAbstractFileByPath(p2);
const cache = f && this.app.metadataCache
&& this.app.metadataCache.getFileCache(f);
const fm = cache && cache.frontmatter;
if (!fm) continue;
for (const k of Object.keys(fm)) {
if (k === 'position') continue;
const low = k.toLowerCase();
const at = seen.get(low) || { label: k, n: 0 };
at.n += 1;
seen.set(low, at);
}
}
return Array.from(seen.values())
.sort((a, b) => (b.n - a.n) || a.label.localeCompare(b.label))
.map((x) => x.label);
};
const ORG_PROP_DEAD_TITLE = 'Outline shows frontmatter properties — '
+ 'this one is a reading the table works out';
const orgPropPopEl = () => {
try { return ownerDoc().querySelector('.zg-org-proppop'); }
catch (_) { return null; }
};
let orgPropPopQuery = '';
let orgPropPopOff = null;
const orgPropRowId = (r) => (r && r.col ? r.col.id
: (r && r.key ? this.propColId(r.key) : ''));
const orgPropPanelRows = () => {
const rows = [];
const taken = new Set();
const addRow = (col, key, name) => {
const low = String(key || '').toLowerCase();
if (low && taken.has(low)) return;
if (low) taken.add(low);
rows.push({ col: col || null, key: key || '',
name: name, dead: !key });
};
for (const c of COLS) {
if (c.user) continue;
addRow(c, (c.id === 'tags' ? 'tags' : ''), c.label);
}
for (const c of COLS) { if (c.user) addRow(c, c.key, c.label); }
for (const k of orgPropsByUse()) addRow(null, k, String(k));
for (const k of this.orgKnownProps()) addRow(null, k, String(k));
const saved = Array.isArray(s.uniColOrder) ? s.uniColOrder : [];
const at = new Map();
saved.forEach((id, i) => { if (!at.has(id)) at.set(id, i); });
const rank = (x) => (at.has(x.id) ? at.get(x.id) : saved.length + x.n);
return rows
.map((r, n) => ({ r: r, n: n, id: orgPropRowId(r) }))
.sort((a, b) => (rank(a) - rank(b)) || (a.n - b.n))
.map((x) => x.r);
};
let orgPropDragId = null;
const orgPropMoveTo = async (moved, target) => {
const here = orgPropPanelRows();
const ids = here.map(orgPropRowId).filter(Boolean);
const from = ids.indexOf(moved);
if (from !== -1) ids.splice(from, 1);
const to = ids.indexOf(target);
ids.splice(to === -1 ? ids.length : to, 0, moved);
const mattersId = new Set();
for (const r of here) {
const rid = orgPropRowId(r);
if (!rid) continue;
if (r.col) mattersId.add(rid);
}
mattersId.add(moved);
const keep = ids.filter((id) => mattersId.has(id));
const rest = (Array.isArray(s.uniColOrder) ? s.uniColOrder : [])
.filter((id) => keep.indexOf(id) === -1 && ids.indexOf(id) === -1);
s.uniColOrder = keep.concat(rest);
await this.saveSettings();
const idOfKey = new Map();
for (const r of here) {
if (r.key) idOfKey.set(String(r.key).toLowerCase(), orgPropRowId(r));
}
const rank2 = new Map();
s.uniColOrder.forEach((id, i) => { if (!rank2.has(id)) rank2.set(id, i); });
const rk = (k) => {
const id = idOfKey.get(String(k).toLowerCase());
return (id && rank2.has(id)) ? rank2.get(id) : s.uniColOrder.length;
};
draw(); fill(); drawPanel();
orgPropPopRender();
};
const orgPropKindOf = (r) => {
if (!r.key) return '';
try { return String(this.orgPropType(r.key) || ''); }
catch (_) { return ''; }
};
const orgRevealCol = (id) => {
try {
const host = panel.querySelector('.zg-org-panel');
const th = panel.querySelector('thead th[data-col="' + id + '"]');
if (!host || !th) return;
const hr = host.getBoundingClientRect();
const tr = th.getBoundingClientRect();
if (tr.right <= hr.right && tr.left >= hr.left) return;
host.scrollLeft += (tr.right - hr.right) + 12;
} catch (_) { zgCatch('openManuscriptModal / orgRevealCol: const host = panel.querySelector(\'.zg-org-panel\');', _); }
};
const orgPropColToggle = async (r) => {
if (r.col) {
const turningOn = colOff.has(r.col.id);
if (colOff.has(r.col.id)) colOff.delete(r.col.id);
else colOff.add(r.col.id);
s.uniColsOff = Array.from(colOff);
await this.saveSettings();
draw(); fill(); drawPanel();
if (turningOn) orgRevealCol(r.col.id);
} else {
await addProp({ key: String(r.key).toLowerCase(), label: r.key });
}
orgPropPopRender();
};
const orgPropSubEl = () => {
try { return ownerDoc().querySelector('.zg-org-propsub'); }
catch (_) { return null; }
};
const orgPropSubClose = () => {
try {
const d0 = ownerDoc();
for (const n of Array.from(
d0.querySelectorAll('.zg-org-propsub'))) n.remove();
} catch (_) { zgCatch('openManuscriptModal / orgPropSubClose: const d0 = ownerDoc();', _); }
};
const orgPropPopClose = () => {
orgPropSubClose();
if (orgPropPopOff) {
try { orgPropPopOff(); } catch (_) { zgCatch('openManuscriptModal / orgPropPopClose: orgPropPopOff();', _); }
orgPropPopOff = null;
}
try {
const d0 = ownerDoc();
const old = Array.from(d0.querySelectorAll('.zg-org-proppop'));
for (const n of old) n.remove();
} catch (_) { zgCatch('openManuscriptModal / orgPropPopClose: const d0 = ownerDoc();', _); }
};
const orgPropPopRender = () => {
const pop = orgPropPopEl();
if (!pop) return;
const box = pop.querySelector('.zg-org-propbody');
if (!box) return;
box.empty();
const q = orgPropPopQuery.trim().toLowerCase();
const rows = orgPropPanelRows()
.filter(r => !q || r.name.toLowerCase().indexOf(q) !== -1);
const tog = (into, on, dead, title, fn) => {
const t = into.createSpan({ cls: 'zg-org-ptog is-col'
+ (on ? ' is-on' : '') + (dead ? ' is-dead' : '') });
const pbox = t.createSpan({ cls: 'zg-org-pbox' });
t.title = title;
if (dead) { t.setAttribute('aria-disabled', 'true'); return t; }
t.setAttribute('role', 'checkbox');
t.setAttribute('aria-checked', on ? 'true' : 'false');
t.addEventListener('click', (ev) => {
ev.preventDefault();
ev.stopPropagation();
fn();
});
return t;
};
let drew = 0;
const clearAim = () => {
for (const el2 of Array.from(box.querySelectorAll('.zg-drop-above'))) {
el2.removeClass('zg-drop-above');
}
};
for (const r of rows) {
const row = box.createDiv({ cls: 'zg-org-prow' });
const rid = orgPropRowId(r);
if (rid) row.setAttribute('data-id', rid);
if (r.col) row.setAttribute('data-col', r.col.id);
if (r.key) row.setAttribute('data-key', r.key);
const grip = row.createSpan({ cls: 'zg-org-pgrip' });
for (const n2 of ['grip-vertical', 'grip', 'more-vertical']) {
grip.textContent = '';
try { if (setIcon) setIcon(grip, n2); } catch (_) { zgCatch('openManuscriptModal / orgPropPopRender: if (setIcon) setIcon(grip, n2);', _); }
if (grip.childElementCount > 0) { grip.dataset.icon = n2; break; }
}
if (!q && rid) {
grip.addClass('is-propdrag');
grip.title = 'Drag to reorder — this is the column order '
+ 'and the chip order';
row.setAttribute('draggable', 'true');
row.addEventListener('dragstart', (ev) => {
orgPropDragId = rid;
try { ev.dataTransfer.setData('text/plain', rid); } catch (_) { zgCatch('openManuscriptModal / orgPropPopRender: ev.dataTransfer.setData(\'text/plain\', rid);', _); }
});
row.addEventListener('dragover', (ev) => {
if (!orgPropDragId || orgPropDragId === rid) return;
ev.preventDefault();
clearAim();
row.addClass('zg-drop-above');
});
row.addEventListener('drop', async (ev) => {
ev.preventDefault();
const moved = orgPropDragId;
orgPropDragId = null;
clearAim();
if (!moved || moved === rid) return;
await orgPropMoveTo(moved, rid);
});
row.addEventListener('dragend', () => {
orgPropDragId = null;
clearAim();
});
}
const colOn = !!(r.col && !colOff.has(r.col.id));
tog(row, colOn, false,
r.col ? 'Show as a column in Table'
: 'Add “' + r.name + '” as a column',
() => orgPropColToggle(r));
const nm = row.createSpan({ cls: 'zg-org-pname' });
const ic = nm.createSpan({ cls: 'zg-org-piconslot' });
if (r.key) orgPropIcon(ic, r.key);
else if (r.col) {
try {
const def = SORTS.filter((sd) => sd.id === r.col.id)[0];
if (def && def.icon && setIcon) {
setIcon(ic, def.icon);
if (ic.childElementCount > 0) ic.dataset.icon = def.icon;
}
} catch (_) { zgCatch('openManuscriptModal / orgPropPopRender: const def = SORTS.filter((sd) => sd.id === r.col.id)[0];', _); }
}
nm.createSpan({ cls: 'zg-org-pnametext', text: r.name });
row.createSpan({ cls: 'zg-org-pkind', text: orgPropKindOf(r) });
const del = row.createSpan({ cls: 'zg-org-pdel is-dead' });
void del;
drew++;
}
if (!drew) {
box.createDiv({ cls: 'zg-org-propnone',
text: 'No property of that name' });
}
};
const orgPopBase = (el) => {
try {
const par = el && el.offsetParent;
if (!par || !par.getBoundingClientRect) return { left: 0, top: 0 };
const b = par.getBoundingClientRect();
return { left: b.left || 0, top: b.top || 0 };
} catch (_) { zgCatch('openManuscriptModal / orgPopBase: const par = el && el.offsetParent;', _); return { left: 0, top: 0 }; }
};
const orgPropSubOpen = (anchor, door) => {
const was = !!orgPropSubEl();
orgPropSubClose();
if (was) return null;
const d0 = ownerDoc();
const sub = (host.rootEl || d0.body)
.createDiv({ cls: 'menu zg-org-propsub' });
for (const t of (door.types || [])) {
const row = sub.createDiv({ cls: 'zg-org-propsubrow' });
row.createSpan({ text: t.label });
row.dataset.type = t.id;
row.addEventListener('click', (ev) => {
ev.preventDefault();
ev.stopPropagation();
orgPropSubClose();
try { door.pick(t.id, ev); } catch (_) { zgCatch('openManuscriptModal / orgPropSubOpen: door.pick(t.id, ev);', _); }
});
}
try {
const r = anchor.getBoundingClientRect();
const box = (orgPropPopEl() || anchor).getBoundingClientRect();
const w0 = ownerWin();
const wide = sub.offsetWidth || 0;
const tall = sub.offsetHeight || 0;
const vw = w0.innerWidth || 0;
const vh = w0.innerHeight || 0;
let x = box.right;
if (vw && x + wide > vw) x = Math.max(0, box.left - wide);
let y = r.top;
if (vh && y + tall > vh) y = Math.max(0, vh - tall);
const base = orgPopBase(sub);
sub.style.left = Math.round(x - base.left) + 'px';
sub.style.top = Math.round(y - base.top) + 'px';
} catch (_) { zgCatch('openManuscriptModal / orgPropSubOpen: const r = anchor.getBoundingClientRect();', _); }
return sub;
};
const orgPropPopOpen = (anchor) => {
orgPropPopClose();
const d0 = ownerDoc();
const pop = (host.rootEl || d0.body)
.createDiv({ cls: 'menu zg-org-proppop' });
const srch = pop.createEl('input', { cls: 'zg-org-propsearch' });
srch.type = 'text';
srch.placeholder = 'Search properties…';
srch.value = orgPropPopQuery;
srch.addEventListener('input', () => {
orgPropPopQuery = srch.value || '';
orgPropPopRender();
});
pop.createDiv({ cls: 'zg-org-propbody' });
{
const au = pop.createDiv({ cls: 'zg-org-propauto' });
const g = au.createSpan({ cls: 'zg-org-propautoicon' });
for (const n of ['move-horizontal', 'unfold-horizontal', 'maximize-2']) {
g.textContent = '';
try { if (setIcon) setIcon(g, n); } catch (_) { zgCatch('openManuscriptModal / orgPropPopOpen: if (setIcon) setIcon(g, n);', _); }
if (g.childElementCount > 0) { g.dataset.icon = n; break; }
}
au.createSpan({ text: 'Resize columns to fit' });
au.title = 'Set every column to the width of what it holds, '
+ 'up to six tenths of the pane. They stay draggable afterwards.';
au.addEventListener('click', (ev) => {
ev.preventDefault();
ev.stopPropagation();
orgColFit();
});
}
for (const door of ORG_PROP_DOORS) {
const add = pop.createDiv({ cls: 'zg-org-propadd' });
{
const g = add.createSpan({ cls: 'zg-org-propaddicon' });
for (const n of door.icons) {
g.textContent = '';
try { if (setIcon) setIcon(g, n); } catch (_) { zgCatch('openManuscriptModal / orgPropPopOpen: if (setIcon) setIcon(g, n);', _); }
if (g.childElementCount > 0) { g.dataset.icon = n; break; }
}
}
add.createSpan({ cls: 'zg-org-propaddname', text: door.label });
if (door.types) {
add.addClass('has-sub');
add.createSpan({ cls: 'zg-org-propmore',
text: '\u203a' });
}
add.addEventListener('click', (ev) => {
ev.preventDefault();
ev.stopPropagation();
if (door.types) { orgPropSubOpen(add, door); return; }
orgPropSubClose();
door.open(ev);
});
}
orgPropPopRender();
try {
const r = anchor.getBoundingClientRect();
const w0 = ownerWin();
const wide = pop.offsetWidth || 0;
const room = (w0.innerWidth || 0) - wide;
const base = orgPopBase(pop);
const x = Math.max(0, room > 0 ? Math.min(r.left, room) : r.left);
pop.style.left = Math.round(x - base.left) + 'px';
pop.style.top = Math.round(r.bottom - base.top) + 'px';
} catch (_) { zgCatch('openManuscriptModal / orgPropPopOpen: const r = anchor.getBoundingClientRect();', _); }
const onDown = (ev) => {
try {
if (pop.contains(ev.target)) return;
const sub0 = orgPropSubEl();
if (sub0 && sub0.contains(ev.target)) return;
const t = ev.target;
if (t && t.closest && t.closest('.zg-org-colsbtn')) return;
} catch (_) { zgCatch('openManuscriptModal / onDown: if (pop.contains(ev.target)) return;', _); }
orgPropPopClose();
};
try {
const w0 = ownerWin();
w0.addEventListener('mousedown', onDown, true);
orgPropPopOff = () => {
try { w0.removeEventListener('mousedown', onDown, true); } catch (_) { zgCatch('openManuscriptModal / orgPropPopOpen: w0.removeEventListener(\'mousedown\', onDown, true);', _); }
};
} catch (_) { zgCatch('openManuscriptModal / orgPropPopOpen: const w0 = ownerWin();', _); }
return pop;
};
let orgAddDraft = null;
let orgEditGuard = null;
let orgOpenAfter = null;
const orgOtherEditorOpen = (td) => {
try {
return Array.from(panel.querySelectorAll('.zg-org-editor'))
.some((e) => !td.contains(e));
} catch (_) { return false; }
};
let orgRedrawPending = false;
let orgFieldEscape = null;
const orgEditDone = () => {
orgEditGuard = null;
orgFieldEscape = null;
if (!orgRedrawPending) return;
window.setTimeout(() => {
if (orgEditGuard) return;
if (!orgRedrawPending) return;
orgRedrawPending = false;
drawPanel();
}, 0);
};
const orgPropValue = (path, key) => {
const entry = this._orgIndex && this._orgIndex.get(path);
if (entry && entry.props) {
for (const k of Object.keys(entry.props)) {
if (k.toLowerCase() === String(key).toLowerCase()) {
return entry.props[k];
}
}
return null;
}
const sv = this.propStoreGetSync(String(path || ''), key);
return sv === undefined ? null : sv;
};
const orgNoteKeys = (path) => {
const entry = this._orgIndex && this._orgIndex.get(path);
if (!entry || !entry.props) return [];
try { return Object.keys(entry.props).filter(Boolean); }
catch (_) { return []; }
};
const orgFieldEditor = (card, path, key, isDraft) => {
orgRedrawPending = true;
try { card.addClass('is-editing'); } catch (_) { zgCatch('openManuscriptModal / orgFieldEditor: card.addClass(\'is-editing\');', _); }
const v = orgPropValue(path, key);
const complex = (v !== null && typeof v === 'object' && !Array.isArray(v))
|| (Array.isArray(v) && v.some(x => x !== null && typeof x === 'object'));
if (complex) {
card.createDiv({ cls: 'zg-org-editor is-complex',
text: 'complex value — edit in note' });
return null;
}
let type = this.orgPropType(key);
if (!type && v !== null) {
if (typeof v === 'number') type = 'number';
else if (typeof v === 'boolean') type = 'checkbox';
else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v))) type = 'datetime';
else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) type = 'date';
}
const doneDraft = () => { if (isDraft) orgAddDraft = null; };
const engage = (el2, esc) => {
el2.addEventListener('focus', () => {
orgEditGuard = { path, key };
orgFieldEscape = esc;
});
};
const listKinds = type === 'tags' || type === 'multitext'
|| type === 'aliases' || Array.isArray(v)
|| String(key).toLowerCase() === 'tags';
if (type === 'checkbox') {
const box = card.createEl('input', { cls: 'zg-org-editor' });
box.type = 'checkbox';
box.checked = v === true;
engage(box, () => { box.checked = v === true; box.blur(); });
box.addEventListener('change', async () => {
await orgPropSet(path, key, box.checked);
doneDraft();
});
box.addEventListener('blur', () => {
doneDraft(); orgEditDone();
});
return box;
}
if (listKinds) {
const wrap2 = card.createDiv({ cls: 'zg-org-editor is-chips' });
const now = Array.isArray(v) ? v.filter(x => x !== null && typeof x !== 'object').map(String)
: (v === null || v === '' ? [] : [String(v)]);
let live = now.slice();
const commitList = async (list) => {
await orgPropSet(path, key, list);
live = list.slice();
doneDraft();
};
const mkChip = (val) => {
const chip = wrap2.createSpan({ cls: 'zg-org-tagchip' });
chip.createSpan({ text: String(val) });
const x = chip.createEl('button',
{ cls: 'zg-org-chipx', text: '×' });
x.title = 'Remove ' + String(val);
x.addEventListener('click', async (ev) => {
ev.stopPropagation();
await commitList(live.filter(z => z !== val));
chip.remove();
});
return chip;
};
for (const val of now) mkChip(val);
if (String(key).toLowerCase() === 'tags') {
const inText = new Set(now.map(t => String(t).replace(/^#/, '').toLowerCase()));
let bodyTags = [];
try {
const f2 = this.app.vault.getAbstractFileByPath(path);
const c2 = f2 && this.app.metadataCache.getFileCache(f2);
for (const t of ((c2 && c2.tags) || [])) {
const tag = String(t.tag || '').replace(/^#/, '');
if (tag && !inText.has(tag.toLowerCase())
&& bodyTags.indexOf(tag) === -1) bodyTags.push(tag);
}
} catch (_) { zgCatch('openManuscriptModal / orgFieldEditor: const f2 = this.app.vault.getAbstractFileByPath(path);', _); }
for (const tag of bodyTags) {
const chip = wrap2.createSpan({ cls: 'zg-org-tagchip is-intext' });
chip.createSpan({ text: tag });
chip.createSpan({ cls: 'zg-org-intext', text: 'in text' });
chip.title = 'Written in the note itself — edit it there';
}
}
const inp = wrap2.createEl('input', { cls: 'zg-org-chipval' });
inp.placeholder = '+';
const dlid = 'zg-org-fdl-' + Math.floor(Math.random() * 1e9);
const dl = wrap2.createEl('datalist'); dl.id = dlid;
for (const opt of this.orgDistinctUnder('', key).slice(0, 60)) {
dl.createEl('option', { value: String(opt) });
}
inp.setAttribute('list', dlid);
engage(inp, () => { inp.value = ''; inp.blur(); });
const isTagField = String(key).toLowerCase() === 'tags';
const tagClean = (raw) => String(raw)
.replace(/^#+/, '')
.replace(/\s+/g, '-')
.replace(/[^\p{L}\p{N}_\-/]/gu, '')
.replace(/\/{2,}/g, '/').replace(/^[-/]+|[-/]+$/g, '');
inp.addEventListener('keydown', async (ev) => {
if (ev.key !== 'Enter') return;
ev.preventDefault();
const typed = inp.value.trim();
if (!typed) { inp.blur(); return; }
const val = isTagField ? tagClean(typed) : typed;
if (isTagField && (!val || /^\p{N}/u.test(val))) {
try {
new Notice(val ? 'A tag cannot start with a number — Obsidian '
+ 'will not index “' + val + '”.'
: 'That is not a tag Obsidian can index.');
} catch (_) { zgCatch('openManuscriptModal / orgFieldEditor: new Notice(val ? \'A tag cannot start with a number — Obsidian \'', _); }
return;
}
if (live.indexOf(val) === -1) {
await commitList(live.concat([val]));
const at = wrap2.querySelector('.zg-org-tagchip.is-intext') || inp;
wrap2.insertBefore(mkChip(val), at);
}
inp.value = '';
});
inp.addEventListener('blur', () => {
doneDraft(); orgEditDone();
});
return inp;
}
const was = v === null ? '' : String(v);
let el2;
{
el2 = card.createEl('input', { cls: 'zg-org-editor' });
if (type === 'number') el2.type = 'number';
else if (type === 'date') el2.type = 'date';
else if (type === 'datetime') el2.type = 'datetime-local';
else el2.type = 'text';
el2.value = was;
try {
const n = String(was == null ? '' : was).length;
el2.size = Math.max(6, Math.min(60, n + 1));
} catch (_) { zgCatch('openManuscriptModal / orgFieldEditor: const n = String(was == null ? \'\' : was).length;', _); }
}
let settled = false;
const commit = async () => {
if (settled) return;
settled = true;
const raw = el2.value;
if (raw === was) { doneDraft(); orgEditDone(); return; }
let out = raw;
if (type === 'number') {
const n = parseFloat(raw);
out = raw.trim() === '' ? '' : (isFinite(n) ? n : raw);
}
const stored = this.propStoreHolds(path);
doneDraft();
orgEditDone();
await orgPropSet(path, key, out);
if (stored) drawPanel();
};
engage(el2, () => {
settled = true;
el2.value = was;
doneDraft();
el2.blur();
});
el2.addEventListener('keydown', (ev) => {
if (ev.key === 'Enter') {
if (ev.shiftKey && el2.tagName === 'TEXTAREA') return;
ev.preventDefault();
el2.blur();
}
});
el2.addEventListener('blur', () => {
if (settled) { settled = false; orgEditDone(); return; }
commit();
});
if ((type === 'date' || type === 'datetime') && !isDraft) {
const shown = card.createSpan({ cls: 'zg-org-shown' });
const sayDay = (raw) => {
const fmt2 = this.formatValue(key, raw, type, this.dateStyle());
shown.setText(fmt2.text || '—');
shown.toggleClass('is-empty', !fmt2.text);
shown.toggleClass('zg-org-badval', !fmt2.ok);
shown.title = fmt2.ok ? ''
: ('This is not a valid ' + type + ': ' + String(raw));
};
sayDay(v);
el2.addClass('is-editing-off');
shown.tabIndex = 0;
const open = () => {
shown.addClass('is-editing-off');
el2.removeClass('is-editing-off');
try { el2.focus(); } catch (_) { zgCatch('openManuscriptModal / open: el2.focus();', _); }
};
shown.addEventListener('click', open);
shown.addEventListener('focus', open);
shown.addEventListener('keydown', (ev) => {
if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
});
el2.addEventListener('blur', () => {
sayDay(el2.value);
el2.addClass('is-editing-off');
shown.removeClass('is-editing-off');
});
}
return el2;
};
const ORG_PROP_ICONS = {
tags: ['tags', 'tag'],
aliases: ['forward', 'corner-up-right', 'arrow-right'],
checkbox: ['check-square', 'square-check', 'check'],
number: ['binary', 'hash'],
date: ['calendar', 'calendar-days'],
datetime: ['clock', 'calendar-clock'],
list: ['list'],
text: ['text', 'align-left', 'list']
};
const orgPropIcon = (into, key) => {
const k = String(key || '').toLowerCase();
let names = null;
if (k === 'tags' || k === 'tag') names = ORG_PROP_ICONS.tags;
else if (k === 'aliases' || k === 'alias') names = ORG_PROP_ICONS.aliases;
if (!names) {
let t = '';
try { t = String(this.orgPropType(key) || ''); } catch (_) { t = ''; }
names = ORG_PROP_ICONS[t]
|| (t === 'multitext' ? ORG_PROP_ICONS.list : ORG_PROP_ICONS.text);
}
const g = into.createSpan({ cls: 'zg-org-propicon' });
for (const n of names) {
g.textContent = '';
try { if (setIcon) setIcon(g, n); } catch (_) { zgCatch('openManuscriptModal / orgPropIcon: if (setIcon) setIcon(g, n);', _); }
if (g.childElementCount > 0) { g.dataset.icon = n; break; }
}
return g;
};
const colDefs = () => [
{ id: 'goal', label: 'Target', def: 116, min: 78 },
{ id: 'words', label: 'Words', def: 66, min: 44 },
{ id: 'grade', label: 'Grade', def: 50, min: 34 },
{ id: 'mark', label: 'Flag', def: 104, min: 30 },
{ id: 'modified', label: 'Last modified', def: 132, min: 96 },
{ id: 'created', label: 'Created', def: 132, min: 96 },
{ id: 'paras', label: 'Paras', def: 60, min: 42 },
{ id: 'tasks', label: 'Tasks', def: 62, min: 44 },
{ id: 'tags', label: 'Tags', def: 62, min: 44 },
{ id: 'read', label: 'Read time', def: 84, min: 56 },
{ id: 'ftype', label: 'Type', def: 62, min: 40 },
{ id: 'backlinks', label: 'Backlinks', def: 170, min: 70 },
{ id: 'chars', label: 'Chars', def: 84, min: 56 },
{ id: 'charsall', label: 'Chars + spaces', def: 104, min: 60 },
{ id: 'sentences', label: 'Sentences', def: 84, min: 56 }
].concat(
(Array.isArray(s.uniUserCols) ? s.uniUserCols : [])
.filter(c => c && c.key)
.map(c => ({
id: this.propColId(c.key),
key: String(c.key),
label: String(c.label || c.key),
sortAs: String(c.sortAs || ''),
user: true,
def: Number(c.w) || 90,
min: 48
}))
);
if (!Array.isArray(s.uniColsOff)) {
s.uniColsOff = ['grade', 'modified', 'paras', 'tasks',
'tags', 'created', 'read', 'ftype', 'backlinks',
'chars', 'charsall', 'sentences'];
}
let COLS = colDefs();
{
const back = zgSessionLens(ses.lens, COLS.map(c => c.id),
COLS.map(c => c.key).filter(k => k));
if (back) orgLens = back;
ses.lens = back;
}
const colById = (id) => COLS.filter(c => c.id === id)[0];
const colOff = new Set(Array.isArray(s.uniColsOff) ? s.uniColsOff : []);
const colRank = () => {
const saved = Array.isArray(s.uniColOrder) ? s.uniColOrder : [];
const at = new Map();
saved.forEach((id, i) => { if (!at.has(id)) at.set(id, i); });
return (c) => (at.has(c.id) ? at.get(c.id) : saved.length + COLS.indexOf(c));
};
const colSort = (list) => {
const rank = colRank();
return list.slice().sort((a, b) => rank(a) - rank(b));
};
const setCols = () => colSort(COLS.filter(c => !colOff.has(c.id)));
const shownCols = () => [];
const ROW_BASE_PAD = 24;
const wordsBy = new Map();
const gradeBy = new Map();
const moreBy = new Map();
const paraOf = (p) => (moreBy.get(p) || {}).paras;
const seenOf = (p) => {
const m = (moreBy.get(p) || {}).mtime;
if (m) return m;
try {
const f = this.app.vault.getAbstractFileByPath(p);
return (f && f.stat && f.stat.mtime) || null;
} catch (_) { return null; }
};
const taskOf = (p) => (moreBy.get(p) || {}).tasks;
let query = '';
const sortDefs = () => BUILTIN_SORTS.concat(
COLS.filter(c => c.user).map(c => ({
id: c.id, label: c.label, icon: 'tag', prop: true
})));
const BUILTIN_SORTS = [
{ id: 'order', label: 'Custom sort', icon: 'list-ordered' },
{ id: 'name', label: 'Name', icon: 'case-sensitive' },
{ id: 'words', label: 'Words', icon: 'file-text' },
{ id: 'mark', label: 'Where it is up to', icon: 'flag' },
{ id: 'grade', label: 'Reading grade', icon: 'graduation-cap' },
{ id: 'pct', label: 'How close to target', icon: 'percent' },
{ id: 'goal', label: 'Target', icon: 'target' },
{ id: 'modified', label: 'Last modified', icon: 'clock' },
{ id: 'paras', label: 'Paragraphs', icon: 'pilcrow' },
{ id: 'read', label: 'Read time', icon: 'timer' },
{ id: 'ftype', label: 'Type', icon: 'file-type' },
{ id: 'backlinks', label: 'Backlinks', icon: 'link' },
{ id: 'chars', label: 'Chars', icon: 'case-sensitive' },
{ id: 'charsall', label: 'Chars + spaces', icon: 'case-sensitive' },
{ id: 'sentences', label: 'Sentences', icon: 'pilcrow' },
{ id: 'tasks', label: 'Tasks left', icon: 'check-square' },
{ id: 'created', label: 'Created', icon: 'calendar-plus' },
{ id: 'tags', label: 'Tags', icon: 'tags' }
];
let SORTS = sortDefs();
const rebuildCols = () => {
COLS = colDefs(); SORTS = sortDefs();
};
const propKeysInScope = () => {
const seen = new Map();
for (const p2 of liveFiles()) {
const f = this.app.vault.getAbstractFileByPath(p2);
const cache = f && this.app.metadataCache
&& this.app.metadataCache.getFileCache(f);
const fm = cache && cache.frontmatter;
if (!fm) continue;
for (const k of Object.keys(fm)) {
if (k === 'position') continue;
if (k === 'tags' || k === 'tag') continue;
const low = k.toLowerCase();
const at = seen.get(low) || { label: k, n: 0, spellings: new Map() };
at.n += 1;
at.spellings.set(k, (at.spellings.get(k) || 0) + 1);
if (at.spellings.get(k) >= (at.spellings.get(at.label) || 0)) {
at.label = k;
}
seen.set(low, at);
}
}
const already = new Set(COLS.filter(c => c.user)
.map(c => String(c.key).toLowerCase()));
return Array.from(seen.keys())
.filter(k => !already.has(k))
.sort((a, b) => (seen.get(b).n - seen.get(a).n) || a.localeCompare(b))
.map(k => ({
key: k, label: seen.get(k).label, n: seen.get(k).n,
spellings: seen.get(k).spellings.size
}));
};
const addProp = async (info) => {
const shown = info.label;
const list = Array.isArray(s.uniUserCols) ? s.uniUserCols.slice() : [];
if (list.some(c => c && String(c.key).toLowerCase() === info.key)) return;
const chosen = String((info && info.type) || '');
list.push(chosen
? { key: shown, label: shown, sortAs: '', type: chosen }
: { key: shown, label: shown, sortAs: '' });
s.uniUserCols = list;
colOff.delete(this.propColId(shown));
s.uniColsOff = Array.from(colOff);
await this.saveSettings();
rebuildCols();
draw(); fill(); drawPanel();
};
const PROP_TYPES = [
{ id: 'text', label: 'Text' },
{ id: 'multitext', label: 'List' },
{ id: 'number', label: 'Number' },
{ id: 'checkbox', label: 'Checkbox' },
{ id: 'date', label: 'Date' },
{ id: 'datetime', label: 'Date & time' }
];
const setPropType = async (key, type) => {
const t = String(type || '');
if (!t) return;
const k = String(key || '').toLowerCase();
const list = Array.isArray(s.uniUserCols) ? s.uniUserCols.slice() : [];
let hit = false;
for (const c of list) {
if (!c || String(c.key).toLowerCase() !== k) continue;
c.type = t; hit = true; break;
}
if (!hit) return;
s.uniUserCols = list;
await this.saveSettings();
rebuildCols();
draw(); fill(); drawPanel();
};
const askPropType = (ev2, done) => {
if (!Menu) { done(''); return; }
try {
const mm = new Menu();
for (const t of PROP_TYPES) {
mm.addItem((i) => i.setTitle(t.label)
.onClick(() => done(t.id)));
}
if (ev2 && typeof mm.showAtMouseEvent === 'function') {
mm.showAtMouseEvent(ev2);
} else if (typeof mm.showAtPosition === 'function') {
mm.showAtPosition({ x: 200, y: 200 });
} else { done(''); }
} catch (_) { done(''); }
};
const nameNewProp = (type, ev2) => {
const taken = propKeysInScope();
const named = (t2) => {
if (!WsPropSuggestModal) {
pickProp(ev2);
return;
}
try {
new WsPropSuggestModal(this.app, [], (info) => {
if (!info || !info.key) return;
const nk = String(info.key).toLowerCase();
addProp({ key: nk, label: String(info.key) });
if (type) setPropType(nk, type);
}, 'Name the new property', 'Create \u201c%s\u201d',
taken).open();
} catch (_) { pickProp(ev2); }
};
named(type);
};
const addNewProp = (ev2) => {
askPropType(ev2, (type) => nameNewProp(type, ev2));
};
const ORG_PROP_DOORS = [
{ label: 'Add a new property',
icons: ['plus', 'plus-circle', 'file-plus'],
types: PROP_TYPES,
pick: (type, ev2) => nameNewProp(type, ev2),
open: (ev2) => addNewProp(ev2) },
];
const pickProp = (ev2) => {
const found = propKeysInScope();
if (WsPropSuggestModal) {
try {
new WsPropSuggestModal(this.app, found, (info) => {
if (info.isNew) {
const nk = String(info.key).toLowerCase();
addProp({ key: nk, label: String(info.key) });
askPropType(ev2, (type) => { setPropType(nk, type); });
} else {
addProp(info);
}
}, null, 'Add “%s” as a new property').open();
return;
} catch (_) { zgCatch('openManuscriptModal / pickProp: new WsPropSuggestModal(this.app, found, (info) =>', _); }
}
if (!found.length) {
try { new Notice('No properties in these notes'); } catch (_) { zgCatch('openManuscriptModal / pickProp: new Notice(\'No properties in these notes\');', _); }
return;
}
const pick = new Menu();
pick.addItem((i2) => i2.setTitle('Add a property').setIsLabel(true));
for (const info of found.slice(0, 20)) {
pick.addItem((i2) => i2
.setTitle(info.label + '  ·  ' + info.n
+ (info.n === 1 ? ' note' : ' notes')
+ (info.spellings > 1 ? '  ·  ' + info.spellings + ' spellings' : ''))
.onClick(() => addProp(info)));
}
try { pick.showAtMouseEvent(ev2); }
catch (_) { try { pick.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('openManuscriptModal / pickProp: pick.showAtPosition( x: 0, y: 0 );', _e); } }
};
const allFiles = () => {
try {
const v = this.app.vault;
const raw = (v.getFiles ? v.getFiles() : v.getMarkdownFiles()) || [];
return raw
.filter(f => this.uniTypeAllows(f));
} catch (_) { return []; }
};
const folderOf = (path) => {
const cut = String(path).lastIndexOf('/');
return cut === -1 ? '' : path.slice(0, cut);
};
const nameOf = (path) => (path === '' ? 'Vault root'
: String(path).split('/').pop().replace(/\.md$/, ''));
{
const here = this.activeNoteFile && this.activeNoteFile();
if (here && here.path) cursor = keyOf({ path: here.path, kind: 'file' });
}
const NEEDS_READING = { words: 1, grade: 1, paras: 1, tasks: 1 };
const keptFiles = () => allFiles().map(f => f.path);
const liveFiles = () => keptFiles();
const MISSING = Number.POSITIVE_INFINITY;
const byName = (a, b) => this.exportNatural
? this.exportNatural(a.split('/').pop(), b.split('/').pop())
: a.localeCompare(b);
let orgDrawnSig = null;
let orgCellHint = null;
let underIn = null;
const underIndex = () => {
if (!underIn) underIn = zgUnderIndex(exportFiles());
return underIn;
};
const heatOf = (pct) => {
if (pct == null) return 'is-none';
if (pct >= 1) return 'is-met';
return 'h' + Math.min(5, Math.floor(pct * 6));
};
let draw = () => {};
let fill = async () => {};
let drawPanel = () => {};
let dragCol = null;
const spread = (it) => {
const k = keyOf(it);
if (!sel.has(k) || sel.size < 2) return [it];
return selRows();
};
const openRow = (it, ev) => {
if (!it || it.kind !== 'file') return;
const newTab = !!(ev && (ev.ctrlKey || ev.metaKey));
try { this.app.workspace.openLinkText(it.path, '', newTab ? 'tab' : false); }
catch (_) { zgCatch('openRow: this.app.workspace.openLinkText(it.path)', _); }
};
const forgetCounts = (paths) => {
let any = false;
for (const path of (paths || [])) {
const chain = [path, ''];
let cut = path.lastIndexOf('/');
while (cut > 0) {
chain.push(path.slice(0, cut));
cut = path.slice(0, cut).lastIndexOf('/');
}
for (const p2 of chain) {
if (wordsBy.delete(p2)) any = true;
gradeBy.delete(p2); moreBy.delete(p2);
}
}
return any;
};
const stopCounting = this.onTreeCountsChange((paths) => {
if (!forgetCounts(paths)) return;
draw();
fill();
});
if (host.kind === 'modal') {
const frame = host.rootEl || tabsRow;
const pop = frame.createEl('div',
{ cls: 'modal-header-button mod-raised clickable-icon zg-uni-topane' });
pop.title = 'Open in a pane \u2014 keeps the writing beside it';
pop.setAttribute('aria-label', pop.title);
{
let drew = false;
for (const n of ['picture-in-picture-2', 'app-window',
'external-link', 'panel-right']) {
pop.textContent = '';
try { if (setIcon) setIcon(pop, n); } catch (_) { zgCatch('openManuscriptModal: if (setIcon) setIcon(pop, n);', _); }
if (pop.childElementCount > 0) {
pop.dataset.icon = n; drew = true; break;
}
}
if (!drew) pop.setText('\u2750');
}
const popw = frame.createEl('div',
{ cls: 'modal-header-button mod-raised clickable-icon zg-uni-topopout' });
popw.title = 'Open in its own window \u2014 for a second screen';
popw.setAttribute('aria-label', popw.title);
{
let drew = false;
for (const n of ['picture-in-picture', 'monitor', 'app-window',
'external-link', 'maximize-2']) {
popw.textContent = '';
try { if (setIcon) setIcon(popw, n); } catch (_) { zgCatch('openManuscriptModal: if (setIcon) setIcon(popw, n);', _); }
if (popw.childElementCount > 0) {
popw.dataset.icon = n; drew = true; break;
}
}
if (!drew) popw.setText('\u29c9');
}
popw.addEventListener('click', async () => {
try { host.handle().close(); } catch (_) { zgCatch('openManuscriptModal: host.handle().close();', _); }
try { await this.openOutlinerPopout(); } catch (_) { zgCatch('openManuscriptModal: await this.openOutlinerPopout();', _); }
});
const xBtn = frame.querySelector(
'.modal-header-button:not(.zg-uni-topane):not(.zg-uni-topopout)');
if (xBtn) {
frame.insertBefore(popw, xBtn);
frame.insertBefore(pop, popw);
const place = () => {
try {
const w = xBtn.offsetWidth;
if (!w) return;
const doors = [pop, popw];
for (let i = 0; i < doors.length; i++) {
doors[i].style.insetInlineEnd = 'calc('
+ getComputedStyle(xBtn).insetInlineEnd
+ ' + ' + ((i + 1) * w) + 'px'
+ ' + ' + (i + 1) + ' * var(--size-2-2))';
}
} catch (_) { zgCatch('openManuscriptModal / place: const w = xBtn.offsetWidth;', _); }
};
if (typeof requestAnimationFrame === 'function') {
requestAnimationFrame(place);
}
for (const ms of [0, 250, 1000]) setTimeout(place, ms);
}
pop.addEventListener('click', async () => {
try { host.handle().close(); } catch (_) { zgCatch('openManuscriptModal: host.handle().close();', _); }
try { await this.openOutlinerPane(); } catch (_) { zgCatch('openManuscriptModal: await this.openOutlinerPane();', _); }
});
} else {
}
const subject = right.createDiv({ cls: 'zg-uni-subject' });
const panel = right.createDiv({ cls: 'zg-uni-panel' });
panel.addEventListener('click', () => {
if (panel.querySelector('.zg-org-editor')) drawOrg();
});
if (!this._structStore) {
this.structureRead()
.then(() => { try { drawPanel(); } catch (_) { zgCatch('openManuscriptModal: drawPanel();', _); } })
.catch(() => {});
}
const histState = Object.assign({}, this.historyOpeningPeriod());
histState.query = '';
histState.hideScope = true;
const drawTabs = () => {
for (const el of Array.from(tabsRow.querySelectorAll('.zg-uni-tab'))) el.remove();
for (const t of TABS) {
const b = tabsRow.createEl('button', {
cls: 'zg-export-mini zg-uni-tab'
+ (t.id === tab ? ' is-here' : '')
});
if (t.icon) {
const g = b.createSpan({ cls: 'zg-uni-tabicon' });
let drew = false;
let drewName = '';
for (const n of this.menuIconAlts(t.icon)) {
g.textContent = '';
try { if (setIcon) setIcon(g, n); } catch (_) { zgCatch('openManuscriptModal / drawTabs: if (setIcon) setIcon(g, n);', _); }
if (g.childElementCount > 0) { drew = true; drewName = n; break; }
}
if (drewName) g.dataset.icon = drewName;
if (drewName === 'file-output'
&& this.menuIconMirrored(t.id)) g.addClass('is-mirrored');
void drew;
}
b.createSpan({ cls: 'zg-uni-tablabel', text: t.label });
if (t.id === tab) { b.disabled = true; b.title = 'You are looking at this'; continue; }
b.addEventListener('click', () => tabSet(t.id));
}
};
const tabSet = (id) => {
if (single) return false;
if (!TABS.some((x) => x.id === id) || id === tab) return false;
tab = id;
ses.tab = tab;
body.toggleClass('is-organizer', tab === 'organizer');
body.removeClass('is-treewide');
body.removeClass('is-reader');
if (tab === 'organizer') cursor = null;
drawTabs();
try { this.orgTicksSchedule(); } catch (_) { zgCatch('tabSet: this.orgTicksSchedule();', _); }
said('');
drawPanel();
draw();
return true;
};
const subjectText = () => {
if (orgMany && orgMany.length > 1) return orgMany.length + ' folders';
return orgFolder ? nameOf(orgFolder) : this.vaultWhole();
};
const drawSubject = () => {
subject.textContent = '';
const crumbs = subject.createDiv({ cls: 'zg-uni-crumbs' });
const at = orgFolder;
const parts = at ? at.split('/') : [];
const many = orgMany && orgMany.length > 1;
const crumb = (text, path, current) => {
const c = crumbs.createEl(current ? 'span' : 'button',
{ cls: 'zg-uni-crumb' + (current ? ' is-current' : '') + (path === '' ? ' is-root' : ''), text });
if (!current) {
c.title = 'Show ' + text;
c.addEventListener('click', () => { orgMany = null; orgSelect(path); });
}
return c;
};
crumb(this.vaultName() || 'Vault', '', !parts.length && !many);
let acc = '';
parts.forEach((seg, i) => {
crumbs.createSpan({ cls: 'zg-uni-crumbsep', text: '›' });
acc = acc ? acc + '/' + seg : seg;
crumb(seg, acc, i === parts.length - 1 && !many);
});
if (many) {
crumbs.createSpan({ cls: 'zg-uni-crumbsep', text: '›' });
crumbs.createSpan({ cls: 'zg-uni-crumb is-current', text: orgMany.length + ' folders' });
}
const agg = this.orgAggUnder(at);
if (agg && agg.files) {
let said = agg.words.toLocaleString() + ' words · '
+ agg.files.toLocaleString() + ' notes';
if (agg.tasksAll) said += ' · ' + agg.tasksDone + '/' + agg.tasksAll + ' tasks';
subject.createSpan({ cls: 'zg-org-agg', text: said });
}
};
this._orgSubject = () => subject;
this._orgScope = () => exportScope();
this._orgScopes = () => exportScopes();
this._orgSubjectRows = () => subjectRows();
const tableCtx = {
get ORG_COL_MIN() { return ORG_COL_MIN; },
get ORG_GRIP_CLICK_MS() { return ORG_GRIP_CLICK_MS; },
get SORTS() { return SORTS; },
get colOff() { return colOff; },
get colTextish() { return colTextish; },
get draw() { return draw; },
get drawPanel() { return drawPanel; },
get fill() { return fill; },
get nameOf() { return nameOf; },
get openRow() { return openRow; },
get orgAddChip() { return orgAddChip; },
get orgAt() { return orgAt; },
get orgBackCell() { return orgBackCell; },
get orgCanHoldProps() { return orgCanHoldProps; },
get orgCellHint() { return orgCellHint; }, set orgCellHint(v) { orgCellHint = v; },
get orgChevron() { return orgChevron; },
get orgChipHit() { return orgChipHit; },
get orgColAgg() { return orgColAgg; },
get orgColCeil() { return orgColCeil; },
get orgColCeilReset() { return orgColCeilReset; },
get orgColFitNow() { return orgColFitNow; }, set orgColFitNow(v) { orgColFitNow = v; },
get orgColGripBind() { return orgColGripBind; },
get orgColPx() { return orgColPx; },
get orgColRaw() { return orgColRaw; },
get orgColSortKey() { return orgColSortKey; },
get orgColStamp() { return orgColStamp; },
get orgColText() { return orgColText; },
get orgColUnfix() { return orgColUnfix; },
get orgDragCol() { return orgDragCol; }, set orgDragCol(v) { orgDragCol = v; },
get orgDrawnSig() { return orgDrawnSig; }, set orgDrawnSig(v) { orgDrawnSig = v; },
get orgEditDone() { return orgEditDone; },
get orgEditGuard() { return orgEditGuard; },
get orgFieldEditor() { return orgFieldEditor; },
get orgFilePathCache() { return orgFilePathCache; }, set orgFilePathCache(v) { orgFilePathCache = v; },
get orgFilterByKey() { return orgFilterByKey; },
get orgFlagCell() { return orgFlagCell; },
get orgFolder() { return orgFolder; },
get orgFolderIcon() { return orgFolderIcon; },
get orgGoalCell() { return orgGoalCell; },
get orgGripReleasedAt() { return orgGripReleasedAt; },
get orgGroupDrop() { return orgGroupDrop; },
get orgIsOpen() { return orgIsOpen; },
get orgLastGrouping() { return orgLastGrouping; }, set orgLastGrouping(v) { orgLastGrouping = v; },
get orgLens() { return orgLens; },
get orgLensClear() { return orgLensClear; },
get orgLensOn() { return orgLensOn; },
get orgLensSet() { return orgLensSet; },
get orgMenuCtx() { return orgMenuCtx; },
get orgNameGripBind() { return orgNameGripBind; },
get orgNameLineNow() { return orgNameLineNow; }, set orgNameLineNow(v) { orgNameLineNow = v; },
get orgNameRO() { return orgNameRO; }, set orgNameRO(v) { orgNameRO = v; },
get orgNameStamp() { return orgNameStamp; },
get orgNarrowNow() { return orgNarrowNow; },
get orgNote() { return orgNote; },
get orgOpenAfter() { return orgOpenAfter; }, set orgOpenAfter(v) { orgOpenAfter = v; },
get orgOpenSet() { return orgOpenSet; },
get orgOpenSetMany() { return orgOpenSetMany; },
get orgPropCell() { return orgPropCell; },
get orgPropKeys() { return orgPropKeys; },
get orgPropPopClose() { return orgPropPopClose; },
get orgPropPopEl() { return orgPropPopEl; },
get orgPropPopOpen() { return orgPropPopOpen; },
get orgPropRefuse() { return orgPropRefuse; },
get orgPropSet() { return orgPropSet; },
get orgRedrawPending() { return orgRedrawPending; }, set orgRedrawPending(v) { orgRedrawPending = v; },
get orgRepaintFlagCell() { return orgRepaintFlagCell; },
get orgRootShut() { return orgRootShut; },
get orgRootShutSet() { return orgRootShutSet; },
get orgRowDrag() { return orgRowDrag; },
get orgRowList() { return orgRowList; },
get orgScrollTop() { return orgScrollTop; }, set orgScrollTop(v) { orgScrollTop = v; },
get orgScrollLeft() { return orgScrollLeft; }, set orgScrollLeft(v) { orgScrollLeft = v; },
get orgTagsCell() { return orgTagsCell; },
get orgUnder() { return orgUnder; },
get ownerWin() { return ownerWin; },
get panel() { return panel; },
get s() { return s; },
get ses() { return ses; },
get setCols() { return setCols; },
get setShape() { return setShape; },
get showItem() { return showItem; },
get showShape() { return showShape; },
get subject() { return subject; },
get drawSubject() { return drawSubject; },
get tab() { return tab; },
get typeLabel() { return typeLabel; },
get typeRows() { return typeRows; },
};
const { drawOrg } = this.orgTableMake(tableCtx);
const colTextish = (col) =>
col.id === 'mark' || col.id === 'tags' || col.id === 'ftype'
|| col.id === 'backlinks' || !!col.user
|| String(col.id).indexOf('fm:') === 0;
let panelGen = 0;
drawPanel = () => {
const gen = ++panelGen;
underIn = null;
panel.toggleClass('zg-org-host', tab === 'organizer');
subject.toggleClass('zg-org-strip', tab === 'organizer');
if (tab === 'organizer') { drawOrg(); return; }
const rows = subjectRows();
drawSubject();
if (tab === 'export' && exportOpts && panel.querySelector('.zg-export-split')) {
Promise.resolve(loadTicks()).then(() => {
if (gen !== panelGen) return;
try { if (exportOpts && exportOpts.refresh) exportOpts.refresh(); } catch (_) { zgCatch('openManuscriptModal: if (exportOpts && exportOpts.refresh) exportOpts.refresh();', _); }
try { draw(); } catch (_) { zgCatch('openManuscriptModal: draw();', _); }
}, () => {});
return;
}
exportOpts = null;
panel.textContent = '';
if (tab === 'export') { drawExport(); return; }
drawHistory(rows);
void gen;
};
const drawReport = async (rows, gen) => {
panel.createDiv({ cls: 'zg-report-loading', text: 'Reading\u2026' });
let stats = null;
try { stats = await plugin.analyzeSelection(rows); } catch (e) {
panel.textContent = '';
panel.createDiv({ text: 'Report failed \u2014 '
+ (e && e.message ? e.message : String(e)) });
return;
}
if (gen !== panelGen) return;
const target = plugin.selectionTarget(rows);
panel.textContent = '';
const ringWrap = panel.createDiv({ cls: 'zg-report-ring' });
if (target > 0) {
const ratio = Math.min(stats.words / target, 1);
const holder = ringWrap.createSpan({
cls: 'zg-goal' + (stats.words >= target ? ' is-met' : '') });
holder.style.color = 'hsl(' + Math.round(8 + ratio * 122) + ', 62%, 44%)';
holder.appendChild(plugin.buildGoalLiquid(ratio));
} else {
const none = ringWrap.createDiv({ cls: 'zg-report-ring-label is-muted' });
none.createDiv({ text: rows.length
? 'No target set for this yet.' : 'No target set for the vault yet.' });
none.createDiv({ cls: 'zg-report-hint',
text: 'Type one into the Target column beside any row.' });
}
plugin.buildReportFigures(panel, stats, target);
if (stats.files !== 1) {
panel.createDiv({ cls: 'zg-uni-count',
text: stats.files.toLocaleString() + ' notes counted' });
}
};
let exportOpts = null;
const drawExport = () => this.orgDrawExport({ panel, tab: () => tab, ticks: () => ticks,
draw: () => draw(), drawPanel: () => drawPanel(), exportFiles, exportScope, loadTicks,
setExportOpts: (o) => { exportOpts = o; } });
const drawHistory = (rows) => this.orgDrawHistory({ panel, tab: () => tab, drawPanel: () => drawPanel(), histState }, rows);
const say = foot.createDiv({ cls: 'zg-uni-say' });
let sayTimer = null;
const said = (msg, bad, offer) => {
if (sayTimer) { window.clearTimeout(sayTimer); sayTimer = null; }
say.empty();
say.toggleClass('is-bad', !!bad && !!msg);
foot.toggleClass('is-speaking', !!msg);
if (!msg) return;
say.createSpan({ text: msg });
if (offer && offer.run) {
const b = say.createEl('button', {
cls: 'zg-uni-undo', text: offer.label || 'Undo' });
b.addEventListener('mousedown', (ev) => {
ev.preventDefault();
ev.stopPropagation();
b.remove();
Promise.resolve(offer.run()).catch(() => {});
});
}
sayTimer = window.setTimeout(() => {
sayTimer = null; say.empty(); foot.removeClass('is-speaking');
}, 9000);
};
const typing = (fromSearch) => {
const el = ownerDoc().activeElement;
return !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
|| el.isContentEditable));
};
const cursorItem = () => (cursor ? itemOf(cursor) : null);
let panelTimer = null;
const schedulePanel = () => {
if (panelTimer) window.clearTimeout(panelTimer);
panelTimer = window.setTimeout(() => { panelTimer = null; drawPanel(); }, 140);
};
const tableOrder = () => {
const drawn = Array.from(panel.querySelectorAll('tr.zg-org-row:not(.is-folder)[data-path]'))
.map((r) => r.getAttribute('data-path')).filter(Boolean);
if (drawn.length) return drawn;
try { return this.exportGather(exportScope()).map((f) => f.path); }
catch (e) { zgGuardReport('the Organizer listing the notes the arrows walk', e); return []; }
};
const moveCursor = (by) => {
const order = tableOrder();
if (!order.length) return;
const here = cursor ? (itemOf(cursor) || {}).path : (orgNote || null);
const at = here ? order.indexOf(here) : -1;
const next = Math.max(0, Math.min(order.length - 1, at + by));
const it = { kind: 'file', path: order[at === -1 ? 0 : next] };
cursor = keyOf(it);
cursorDrives = true;
orgFollow(it, true, true);
drawPanel();
const el = panel.querySelector('tr.zg-org-row.zg-org-active');
if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
};
const key = (combo, fn, fromSearch) => host.key(combo[0], combo[1], (ev) => {
if (typing(fromSearch)) return;
fn();
ev.preventDefault();
return false;
});
key([[], 'ArrowDown'], () => moveCursor(1), true);
key([[], 'ArrowUp'], () => moveCursor(-1), true);
const nudge = async (by) => {
const it = cursorItem();
if (!it || !it.path) return;
const parent = folderOf(it.path);
let sibs = [];
try { sibs = this.treeOrderCurrent(parent) || []; } catch (_) { sibs = []; }
const at = sibs.indexOf(it.path);
if (at === -1) return;
const to = at + by;
if (to < 0 || to >= sibs.length) return;
const before = by < 0 ? sibs[to] : (sibs[to + 1] != null ? sibs[to + 1] : null);
await this.treeOrderMove(parent, it.path, before);
cursor = keyOf(it);
cursorDrives = true;
drawPanel();
};
key([['Alt'], 'ArrowUp'], () => { nudge(-1); });
key([['Alt'], 'ArrowDown'], () => { nudge(1); });
key([[], 'Enter'], () => { const it = cursorItem(); if (it) openRow(it); }, true);
key([[], ' '], async () => {
const it = cursorItem();
if (!it) return;
if (it.kind !== 'file') return;
const next = zgStatusNext(markOf(it.path, it.kind));
if (next) s[statusStore()][it.path] = next;
else delete s[statusStore()][it.path];
await this.saveSettings();
this.repaintExplorerFlag(it.path);
draw();
});
const escapeLadder = (ev) => {
if (ev.key !== 'Escape') return false;
if (tab === 'organizer') {
if (orgFieldEscape) {
const f2 = orgFieldEscape;
orgFieldEscape = null;
try { f2(); } catch (_) { zgCatch('openManuscriptModal / escapeLadder: f2();', _); }
return true;
}
if (orgPropPopEl()) { orgPropPopClose(); return true; }
if (orgLensOn()) { orgLensClear(); return true; }
if (host.closes === false) return true;
return false;
}
if (sel.size || cursorDrives) {
sel.clear();
lastPicked = null;
cursorDrives = false;
draw();
drawPanel();
return true;
}
if (host.closes === false) return true;
return false;
};
const onEscape = (ev) => {
const pop0 = (tab === 'organizer') ? orgPropPopEl() : null;
const sub0 = (tab === 'organizer') ? orgPropSubEl() : null;
if (!host.contains(ev.target)
&& !(pop0 && pop0.contains(ev.target))
&& !(sub0 && sub0.contains(ev.target))) return;
if (!escapeLadder(ev)) return;
ev.preventDefault();
ev.stopPropagation();
if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
};
if (host.blockClose) {
host.blockClose(() => {
if (tab === 'organizer' && orgPropSubEl()) {
orgPropSubClose();
return true;
}
if (tab === 'organizer' && orgPropPopEl()) {
orgPropPopClose();
return true;
}
if (tab === 'organizer' && orgFieldEscape) {
const f2 = orgFieldEscape;
orgFieldEscape = null;
try { f2(); } catch (_) { zgCatch('openManuscriptModal / blockClose: f2();', _); }
return true;
}
return false;
});
}
let stopEscape = () => {};
try {
const ew = ownerWin();
ew.addEventListener('keydown', onEscape, true);
stopEscape = () => {
try { ew.removeEventListener('keydown', onEscape, true); } catch (_) { zgCatch('openManuscriptModal: ew.removeEventListener(\'keydown\', onEscape, true);', _); }
};
} catch (_) { zgCatch('openManuscriptModal: const ew = ownerWin();', _); }
const stopWatching = this.onTreeOrderChange(() => {
draw();
fill();
if (tab === 'organizer') drawPanel();
});
host.onClose(() => {
try { this.orgWindowDrop(treeDoor); } catch (_) { zgCatch('openManuscriptModal: this.orgWindowDrop(treeDoor);', _); }
try { stopWatching(); } catch (_) { zgCatch('openManuscriptModal: stopWatching();', _); }
try { stopCounting(); } catch (_) { zgCatch('openManuscriptModal: stopCounting();', _); }
try { stopEscape(); } catch (_) { zgCatch('openManuscriptModal: stopEscape();', _); }
try { stopWidth(); } catch (_) { zgCatch('openManuscriptModal: stopWidth();', _); }
try { orgIndexChanged(); } catch (_) { zgCatch('openManuscriptModal: orgIndexChanged();', _); }
try { if (orgDrawTimer) window.clearTimeout(orgDrawTimer); } catch (_) { zgCatch('openManuscriptModal: if (orgDrawTimer) window.clearTimeout(orgDrawTimer);', _); }
try {
if (orgNameRO) { orgNameRO.disconnect(); orgNameRO = null; }
} catch (_) { zgCatch('openManuscriptModal: if (orgNameRO) orgNameRO.disconnect();', _); }
try { orgPropPopClose(); } catch (_) { zgCatch('openManuscriptModal: orgPropPopClose();', _); }
});
body.toggleClass('is-organizer', tab === 'organizer');
body.toggleClass('is-treeoff', !ses.treeShown);
if (tab === 'organizer') {
try {
const af = this.activeNoteFile ? this.activeNoteFile() : null;
if (af && af.path && /\.md$/i.test(af.path)
&& !(this.isStoreFile && this.isStoreFile(af.path))) {
let been = null;
try { been = this._wsSession ? this._wsSession.folder : null; } catch (_) { zgCatch('openManuscriptModal: been = this._wsSession ? this._wsSession.folder : null;', _); }
orgFollow({ path: af.path, kind: 'file' }, true, been !== null);
let dir = folderOf(af.path);
while (dir) {
orgOpen.add(dir);
dir = folderOf(dir);
}
s.organizerOpen = Array.from(orgOpen);
this.saveSettings().catch(() => {});
}
} catch (_) { zgCatch('openManuscriptModal: const af = this.activeNoteFile ? this.activeNoteFile() : null;', _); }
}
drawTabs();
draw();
fill();
drawPanel();
if (orgNote) {
try {
const el0 = panel.querySelector('tr.zg-org-row.zg-org-active');
if (el0 && el0.scrollIntoView) el0.scrollIntoView({ block: 'center' });
} catch (_) { zgCatch('openManuscriptModal: const el0 = panel.querySelector(tr.zg-org-row.zg-org-active);', _); }
}
host.show();
return host.handle();
}
orgVaultIcon(into) {
if (this.settings.orgFolderIcons === false) return null;
const ic = into.createSpan({ cls: 'zg-foldericon is-vault' });
ic.innerHTML = zgObsidianSvg(13);
ic.dataset.icon = 'obsidian';
return ic;
}
orgFolderIcon(into, path, open) {
if (this.settings.orgFolderIcons === false) return null;
const ic = into.createSpan({ cls: 'zg-foldericon' });
let drew = false;
for (const n of (open
? ['folder-open', 'folder'] : ['folder-closed', 'folder'])) {
ic.textContent = '';
try { if (setIcon) setIcon(ic, n); } catch (_) { zgCatch('orgFolderIcon: if (setIcon) setIcon(ic, n);', _); }
if (ic.childElementCount > 0) { drew = true; break; }
}
if (!drew) ic.innerHTML = zgFolderSvg(!!open, 12);
const cid = ((this.settings.folderColors || {})[path]) || '';
const cdef = ZG_FOLDER_COLOURS.filter(c => c.id === cid)[0];
if (cdef && cdef.css) ic.style.color = cdef.css;
return ic;
}
orgTargetSay(words, target) {
const t = Number(target) || 0;
if (t <= 0) return '';
const w = Number(words) || 0;
const how = (this.settings && this.settings.orgTargetShow)
|| 'ratio';
if (how === 'percent') {
const raw = (w / t) * 100;
const pct = (raw < 100) ? Math.min(99, Math.round(raw))
: Math.round(raw);
return pct + '%';
}
return w.toLocaleString() + '/' + t.toLocaleString();
}
orgKindIcon(into, path) {
if (this.settings.orgFileIcons === false) return null;
const isMd = /\.md$/i.test(String(path));
const kindIc = into.createSpan({ cls: 'zg-uni-kindicon' });
let names = ['file'];
if (isMd) names = ['file'];
else {
const grp = this.uniTypeGroups()
.filter(g => g.id === this.uniTypeGroupOf({ path }))[0];
names = (grp && grp.icons) || ['file'];
}
for (const n of names) {
kindIc.textContent = '';
try { if (setIcon) setIcon(kindIc, n); } catch (_) { zgCatch('orgKindIcon: if (setIcon) setIcon(kindIc, n);', _); }
kindIc.dataset.icon = n;
if (kindIc.childElementCount > 0) break;
}
return kindIc;
}
orgKindTag(into, path) {
const p = String(path || '');
if (/\.md$/i.test(p)) return null;
const bits = p.split('/').pop().split('.');
if (bits.length < 2) return null;
const ext = bits.pop().toLowerCase();
if (!ext) return null;
return into.createDiv({ cls: 'nav-file-tag', text: ext });
}
async orgDrawExport(ctx) {
const { panel, exportFiles, exportScope, loadTicks } = ctx;
const draw = () => ctx.draw();
const drawPanel = () => ctx.drawPanel();
const exportGoing = () => { const ticks = ctx.ticks(); return exportFiles().filter(
f => ticks && ticks.has(f.path)); };
panel.createDiv({ cls: 'zg-report-loading', text: 'Reading\u2026' });
await loadTicks();
if (ctx.tab() !== 'export') return;
panel.textContent = '';
try {
if (Platform && Platform.isPhone) {
panel.createEl('p', { cls: 'zg-export-note is-warning',
text: 'This is a small window for a phone. Everything works \u2014 all '
+ 'three formats, this one included \u2014 but choosing files and putting '
+ 'them in order is much easier on a tablet or a desktop.' });
}
} catch (_) { zgCatch('orgDrawExport: if (Platform && Platform.isPhone)', _); }
const act = panel.createDiv({ cls: 'zg-export-top zg-uni-act' });
const actHandle = this.buildExportAct(act, {
scope: () => exportScope(),
compileList: () => exportGoing(),
onDone: () => { draw(); drawPanel(); }
});
const gathered = exportFiles();
const all = gathered.length;
const ticked = exportGoing();
const inList = ticked.length;
const actRow = panel.querySelector('.zg-export-top');
const goEl = actRow ? actRow.querySelector('.zg-export-go') : null;
const countEl = (actRow || panel).createDiv({
cls: 'zg-uni-count' + (actRow ? ' is-besidego' : '') });
if (actRow && goEl) actRow.insertBefore(countEl, goEl);
const bits = [];
countEl.setText(bits.join('  \u00b7  '));
countEl.style.display = bits.length ? '' : 'none';
ctx.setExportOpts(this.buildExportOptions(panel, {
scope: () => exportScope(),
compileList: () => exportGoing(),
total: () => exportFiles().length
}));
try { if (actHandle && actHandle.repaint) actHandle.repaint(); } catch (_) { zgCatch('orgDrawExport: if (actHandle && actHandle.repaint) actHandle.repaint();', _); }
draw();
};
orgDrawHistory(ctx, rows) {
const { panel, histState } = ctx;
const plugin = this;
const drawPanel = () => ctx.drawPanel();
histState.scope = rows.map(r => r.path);
try {
if (plugin.settings.historyTracking && !plugin._historyReady) {
panel.createDiv({ cls: 'zg-report-loading', text: 'Reading\u2026' });
plugin.historyLoad().then(() => {
const at = plugin.historyOpeningPeriod();
histState.year = at.year;
histState.month = at.month;
if (ctx.tab() === 'history') drawPanel();
});
return;
}
plugin.renderHistoryTab(panel, histState, () => drawPanel());
} catch (e) {
panel.textContent = '';
panel.createDiv({ text: 'History failed \u2014 '
+ (e && e.message ? e.message : String(e)) });
}
}
orgTableMake(ctx) {
const s = ctx.s;
const fill = (...a) => ctx.fill(...a);
const drawOrg = () => {
ctx.orgFilePathCache = null;
ctx.orgColCeilReset();
if (ctx.orgEditGuard) { ctx.orgRedrawPending = true; return; }
const orgKeepScroll = ctx.orgScrollTop;
const orgKeepScrollX = ctx.orgScrollLeft || 0;
this.orgIndexEnsure();
const at = ctx.orgAt();
const cols = ctx.setCols();
const lensed = ctx.orgLensOn();
const shaped = ctx.showShape();
const kinds = this.uniTypeSet();
const list = ctx.orgRowList(at, lensed || shaped === 'files')
.filter(r0 => r0.kind === 'folder' || kinds.has(r0.group))
.filter(r0 => (shaped === 'folders' ? r0.kind === 'folder'
: shaped === 'files' ? r0.kind !== 'folder' : true));
const sortCol = ctx.orgLens.sort
? (cols.filter(c => c.id === ctx.orgLens.sort.id)[0] || null) : null;
const shown = list.filter(row => {
for (const c of ctx.orgLens.chips) {
if (!c.off && !ctx.orgChipHit(c, row.path)) return false;
}
if (sortCol && ctx.orgColRaw(sortCol, row.path) === null) return false;
return true;
});
let rows = shown;
if (sortCol) {
const dir = ctx.orgLens.sort.dir === 'asc' ? 1 : -1;
rows = shown.slice().sort((a, b) => {
const ka = ctx.orgColSortKey(sortCol, a.path);
const kb = ctx.orgColSortKey(sortCol, b.path);
let d = 0;
if (typeof ka === 'number' && typeof kb === 'number') d = ka - kb;
else d = String(ka).localeCompare(String(kb), undefined, { numeric: true });
if (d) return d * dir;
return a.idx - b.idx;
});
}
const sig = rows.map(r0 => r0.path).join('\n');
const hint = ctx.orgCellHint;
ctx.orgCellHint = null;
if (hint && ctx.orgDrawnSig !== null && sig === ctx.orgDrawnSig
&& ctx.orgRepaintFlagCell(hint.td, hint.path)) {
return;
}
ctx.orgDrawnSig = sig;
ctx.drawSubject();
if (this.settings.historyTracking && !this._historyReady) {
this.historyLoad().then(() => {
if (ctx.tab === 'organizer') ctx.drawPanel();
}).catch(() => {});
}
const orgCounted = (p0) => {
try {
const f0 = this.app.vault.getAbstractFileByPath(String(p0 || ''));
return !!f0 && !f0.children && this.isFileCounted(f0);
} catch (_) { return false; }
};
const noteCount = (rr) => rr.filter(r0 => r0.kind !== 'folder'
&& orgCounted(r0.path)).length;
const narrowed = noteCount(rows) < noteCount(list);
ctx.panel.textContent = '';
const bar = ctx.panel.createDiv({ cls: 'zg-org-bar' });
const menuUnder = (menu, btn, ev) => {
try {
const r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
if (r && (r.width || r.height)) {
menu.showAtPosition({ x: Math.round(r.left), y: Math.round(r.bottom) });
return;
}
} catch (_) { zgCatch('orgTableMake / menuUnder: const r = btn && btn.getBoundingClientRect', _); }
try { menu.showAtMouseEvent(ev); }
catch (_) { try { menu.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('orgTableMake / menuUnder: menu.showAtPosition( x: 0, y: 0 )', _e); } }
};
const lensIcon = (btn, names) => {
for (const n of names) {
try { if (setIcon) setIcon(btn, n); } catch (_) { zgCatch('orgTableMake / lensIcon: if (setIcon) setIcon(btn, n);', _); }
if (btn.childElementCount > 0) { btn.dataset.icon = n; return n; }
btn.textContent = '';
}
btn.dataset.icon = names[0];
return null;
};
const sortBtn = bar.createEl('button',
{ cls: 'zg-export-mini zg-org-sortby' });
lensIcon(sortBtn, ['arrow-up-down', 'arrow-down-up',
'arrow-up-narrow-wide', 'sort-asc']);
sortBtn.createSpan({ text: sortCol
? 'Sort: ' + sortCol.label + zgSortArrow(ctx.orgLens.sort.dir)
: 'Sort' });
sortBtn.title = 'Arrange the rows by a reading — Custom Order is a click away';
sortBtn.addEventListener('click', (ev) => {
const menu = new Menu();
menu.addItem((i) => i.setTitle('Custom Order')
.setIcon('list-ordered')
.setChecked(!ctx.orgLens.sort)
.onClick(() => ctx.orgLensSet({ sort: null })));
menu.addSeparator();
const SORT_RELEVANCE = ['words', 'goal', 'tasks', 'mark',
'modified', 'created', 'grade', 'paras', 'tags'];
const sortRank = (c) => {
const at = SORT_RELEVANCE.indexOf(c.id);
return at === -1 ? SORT_RELEVANCE.length : at;
};
const sortMenuCols = cols.slice()
.sort((a, b) => sortRank(a) - sortRank(b));
for (const col of sortMenuCols) {
menu.addItem((i) => {
const here = sortCol && sortCol.id === col.id;
i.setTitle(col.label + (here
? zgSortArrow(ctx.orgLens.sort.dir) : ''));
try {
const def = ctx.SORTS.filter((s) => s.id === col.id)[0];
if (def && def.icon && i.setIcon) i.setIcon(def.icon);
} catch (_) { zgCatch('orgTableMake / drawOrg: const def = ctx.SORTS.filter((s) => s.id === col.id)[0];', _); }
i.setChecked(!!here);
i.onClick(() => ctx.orgLensSet({ sort: {
id: col.id,
dir: here && ctx.orgLens.sort.dir === 'desc' ? 'asc' : 'desc'
} }));
});
}
menuUnder(menu, sortBtn, ev);
});
const addBtn = bar.createEl('button',
{ cls: 'zg-export-mini zg-org-addfilter' });
lensIcon(addBtn, ['list-filter', 'filter', 'funnel']);
addBtn.createSpan({ text: 'Filter' });
{
const on = ctx.orgLens.chips.filter(c => !c.off).length;
if (on) addBtn.createSpan({ cls: 'zg-org-filtercount', text: String(on) });
}
addBtn.title = 'Narrow by a property — type to search the folder’s own keys';
addBtn.addEventListener('click', (ev) => {
let nests = false;
try {
new Menu().addItem((i) => {
nests = typeof i.setSubmenu === 'function';
});
} catch (_) { nests = false; }
const menu = new Menu();
const group = (title, icon, fill) => {
if (nests) {
menu.addItem((i) => {
i.setTitle(title);
try { if (icon) i.setIcon(icon); } catch (_) { zgCatch('orgTableMake / group: if (icon) i.setIcon(icon);', _); }
try { fill(i.setSubmenu()); }
catch (e) { console.error('Word-Smith: filter menu', e); }
});
return;
}
menu.addSeparator();
menu.addItem((i) => i.setTitle(title).setIsLabel(true));
fill(menu);
};
const addChip = ctx.orgAddChip;
group('Kind', 'shapes', (into) => ctx.typeRows(into));
group('Tasks', 'check-square', (into) => {
for (const t of [
{ id: 'any', label: 'Has tasks' },
{ id: 'none', label: 'No tasks' }
]) {
into.addItem((i) => i.setTitle(t.label)
.onClick(() => addChip({ axis: 'tasks', id: t.id,
key: 'Tasks', value: t.label })));
}
});
group('Flag', 'flag', (into) => {
let defs = [];
try { defs = this.flagDefs() || []; } catch (_) { defs = []; }
const titled = (id, label) => {
const frag = document.createDocumentFragment();
const mark = document.createElement('span');
mark.className = 'zg-menuflag is-' + id;
mark.innerHTML = zgFlagSvg(id, 12);
frag.appendChild(mark);
frag.appendChild(document.createTextNode(label));
return frag;
};
for (const d of defs) {
into.addItem((i) => i.setTitle(titled(d.id, d.label))
.onClick(() => addChip({ axis: 'flag', id: d.id,
key: 'Flag', value: d.label })));
}
into.addItem((i) => i.setTitle(titled('', 'No flag'))
.onClick(() => addChip({ axis: 'flag', id: '',
key: 'Flag', value: 'none' })));
});
group('Tag', 'tag', (into) => {
into.addItem((i) => i.setTitle('Search tags…')
.onClick(() => {
let tags = [];
try {
tags = this.uniTagsInScope(
ctx.orgRowList(at, true).map(r => r.path)) || [];
} catch (_) { tags = []; }
if (!tags.length) {
try { new Notice('No tags in these notes'); } catch (_) { zgCatch('orgTableMake / drawOrg: new Notice(\'No tags in these notes\');', _); }
return;
}
const items = tags.map(t => ({ tag: t.tag,
label: '#' + t.tag, n: t.n }));
const take = (it) => addChip({ axis: 'tag',
key: 'Tag', value: it.tag });
if (WsPropSuggestModal) {
try {
new WsPropSuggestModal(this.app, items, take,
'Which tag?').open();
return;
} catch (_) { zgCatch('orgTableMake / drawOrg: new WsPropSuggestModal(this.app, items, take,', _); }
}
const pick = new Menu();
for (const it of items.slice(0, 20)) {
pick.addItem((i2) => i2.setTitle(it.label)
.onClick(() => take(it)));
}
try { pick.showAtMouseEvent(ev); }
catch (_) { try { pick.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('orgTableMake / drawOrg: pick.showAtPosition( x: 0, y: 0 );', _e); } }
}));
});
group('Property', 'table-properties', (into) => {
const askEmpty = (op) => {
const keys = ctx.orgPropKeys(at);
if (!keys.length) {
try { new Notice('No properties in these notes'); } catch (_) { zgCatch('orgTableMake / askEmpty: new Notice(\'No properties in these notes\');', _); }
return;
}
const items = keys.map(k => ({ key: k, label: k }));
const take = (it) => addChip({ key: it.key, op: op, value: '' });
if (WsPropSuggestModal) {
try {
new WsPropSuggestModal(this.app, items, take,
op === 'empty' ? 'Which property is empty?'
: 'Which property is filled in?').open();
return;
} catch (_) { zgCatch('orgTableMake / askEmpty: new WsPropSuggestModal(this.app, items, take,', _); }
}
const pk2 = new Menu();
for (const it of items.slice(0, 20)) {
pk2.addItem((i4) => i4.setTitle(it.label).onClick(() => take(it)));
}
try { pk2.showAtMouseEvent(ev); }
catch (_) { try { pk2.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('orgTableMake / askEmpty: pk2.showAtPosition( x: 0, y: 0 );', _e); } }
};
into.addItem((i) => i.setTitle('Is empty…')
.onClick(() => askEmpty('empty')));
into.addItem((i) => i.setTitle('Is not empty…')
.onClick(() => askEmpty('filled')));
into.addItem((i) => i.setTitle('Search properties…')
.onClick(() => {
const keys = ctx.orgPropKeys(at);
if (!keys.length) {
try { new Notice('No properties in these notes'); } catch (_) { zgCatch('orgTableMake / drawOrg: new Notice(\'No properties in these notes\');', _); }
return;
}
const pickValue = (key) => ctx.orgFilterByKey(key, ev);
const items = keys.map(k => ({ key: k, label: k }));
if (WsPropSuggestModal) {
try {
new WsPropSuggestModal(this.app, items,
(it) => pickValue(it.key),
'Which property?').open();
return;
} catch (_) { zgCatch('orgTableMake / drawOrg: new WsPropSuggestModal(this.app, items,', _); }
}
const pk = new Menu();
for (const it of items.slice(0, 20)) {
pk.addItem((i2) => i2.setTitle(it.label)
.onClick(() => pickValue(it.key)));
}
try { pk.showAtMouseEvent(ev); }
catch (_) { try { pk.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('orgTableMake / drawOrg: pk.showAtPosition( x: 0, y: 0 );', _e); } }
}));
});
menuUnder(menu, addBtn, ev);
});
const colsBtn = bar.createEl('button',
{ cls: 'zg-export-mini zg-org-colsbtn' });
lensIcon(colsBtn, ['table-properties', 'settings-2', 'list',
'columns-3']);
colsBtn.createSpan({ text: 'Properties' });
const foldBtn = bar.createEl('button',
{ cls: 'zg-export-mini zg-org-foldall' });
const foldable = () => {
const out = new Set();
for (const r0 of ctx.orgRowList(ctx.orgFolder, true)) {
out.add(r0.path);
const bits = String(r0.path).split('/');
bits.pop();
let acc = '';
for (const b of bits) {
acc = acc ? acc + '/' + b : b;
if (!ctx.orgFolder || acc === ctx.orgFolder
|| acc.indexOf(ctx.orgFolder + '/') === 0) out.add(acc);
}
}
return Array.from(out);
};
const anyOpen = foldable().some(p0 => ctx.orgIsOpen(p0));
lensIcon(foldBtn, anyOpen ? ['chevrons-down-up', 'fold-vertical', 'minimize-2']
: ['chevrons-up-down', 'unfold-vertical', 'maximize-2']);
const foldSay = anyOpen ? 'Collapse all \u2014 shut every folder and card'
: 'Expand all \u2014 open every folder and card';
foldBtn.title = foldSay;
foldBtn.setAttribute('aria-label', foldSay);
foldBtn.addEventListener('click', (ev) => {
ev.stopPropagation();
const want = !anyOpen;
ctx.orgOpenSetMany(foldable(), want);
});
colsBtn.title = 'Which properties this window shows — a column'
+ ' in the table, a field under every row in Outline';
colsBtn.addEventListener('click', () => {
if (ctx.orgPropPopEl()) { ctx.orgPropPopClose(); return; }
ctx.orgPropPopOpen(colsBtn);
});
let chipRowEl = null;
const chipHost = () => (chipRowEl
|| (chipRowEl = ctx.panel.createDiv({ cls: 'zg-org-chiprow' })));
const chipBtn = (label, undo) => {
const b = chipHost().createEl('button', { cls: 'zg-org-chip' });
b.createSpan({ text: label });
b.createSpan({ cls: 'zg-org-chipx', text: '×' });
b.title = 'Remove this';
b.addEventListener('click', undo);
};
if (sortCol) {
chipBtn(sortCol.label + zgSortArrow(ctx.orgLens.sort.dir),
() => ctx.orgLensSet({ sort: null }));
}
for (const c of ctx.orgLens.chips) {
const b = chipHost().createEl('button',
{ cls: 'zg-org-chip' + (c.off ? ' is-off' : '') });
const tick = b.createEl('input', { cls: 'zg-org-chiptick' });
tick.type = 'checkbox';
tick.checked = !c.off;
tick.title = c.off ? 'Tick to apply this filter again'
: 'Untick to set this filter aside';
tick.addEventListener('click', (ev) => {
ev.stopPropagation();
ctx.orgLensSet({ chips: ctx.orgLens.chips.map(x => x === c
? Object.assign({}, x, { off: !x.off }) : x) });
});
b.createSpan({ text: c.op === 'empty' ? c.key + ' is empty'
: c.op === 'filled' ? c.key + ' is not empty'
: c.key + ': ' + c.value });
b.createSpan({ cls: 'zg-org-chipx', text: '×' });
b.title = 'Remove this';
b.addEventListener('click', () => ctx.orgLensSet({
chips: ctx.orgLens.chips.filter(x => x !== c) }));
}
{
const onKinds = this.uniTypeSet();
const allKinds = this.uniTypeGroups();
if (onKinds.size < allKinds.length || ctx.showShape() !== 'all') {
const kc = chipHost().createEl('button',
{ cls: 'zg-org-chip zg-org-kindchip' });
kc.createSpan({ text: 'kind: ' + ctx.typeLabel() });
kc.createSpan({ cls: 'zg-org-chipx', text: '×' });
kc.title = 'Only some kinds of file are shown — press to show every kind again';
kc.addEventListener('click', async () => {
this.settings.uniTypes = allKinds.map(g => g.id);
await ctx.setShape('all');
ctx.drawPanel();
});
}
}
if (ctx.orgLensOn()) {
const tail = chipHost().createDiv({ cls: 'zg-org-chiptail' });
if (narrowed) {
tail.createSpan({ cls: 'zg-org-shownof',
text: noteCount(rows) + ' of ' + noteCount(list) + ' shown' });
}
const cl = tail.createEl('button', { cls: 'zg-org-clearlens' });
cl.setText('Clear all');
cl.title = 'Take the lens off — Escape does this too';
cl.addEventListener('click', (ev) => {
ev.stopPropagation();
ctx.orgLensClear();
});
}
const wrap = ctx.panel.createDiv({ cls: 'zg-org-panel' });
wrap.addEventListener('scroll', () => {
ctx.orgScrollTop = wrap.scrollTop;
ctx.ses.scroll = ctx.orgScrollTop;
ctx.orgScrollLeft = wrap.scrollLeft;
}, { passive: true });
const table = wrap.createEl('table', { cls: 'zg-org-table' });
ctx.orgNameStamp(table);
const thead = table.createEl('thead');
const hr = thead.createEl('tr');
const nameTh = hr.createEl('th',
{ cls: 'zg-org-name', text: 'Name' });
ctx.orgNameGripBind(ctx.panel, nameTh, table);
const orgZoomOf = (el) => {
let z = 1;
try {
const w0 = (el && el.ownerDocument && el.ownerDocument.defaultView) || window;
for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
const v = parseFloat(w0.getComputedStyle(n).zoom);
if (isFinite(v) && v > 0 && v !== 1) z *= v;
}
} catch (_) { zgCatch('orgTableMake / orgZoomOf: const w0 = el && el.ownerDocument', _); }
return (isFinite(z) && z > 0) ? z : 1;
};
const orgSnapAccent = () => {
const w0 = ctx.ownerWin();
const dpr = (w0 && w0.devicePixelRatio) || 1;
const scope = table.closest('.zg-uni-modal')
|| table.closest('.modal') || table.ownerDocument;
if (scope && scope.style) {
scope.style.setProperty('--zg-dpr', String(dpr));
}
const marks = [
table.querySelector('.zg-org-row.zg-org-active td.zg-org-name'),
null
];
for (const el of marks) {
if (!el) continue;
try {
el.style.setProperty('--zg-dpr', String(dpr));
el.style.setProperty('--zg-org-snap', '0px');
const off = parseFloat(
w0.getComputedStyle(el, '::before').insetInlineStart);
if (!isFinite(off)) continue;
const zoom = orgZoomOf(el);
const x = el.getBoundingClientRect().left / zoom + off;
const box = (typeof el.closest === 'function')
? el.closest('.tree-item-children') : null;
let want = null;
if (box) {
const bx = box.getBoundingClientRect().left / zoom;
if (isFinite(bx)) want = bx;
}
if (want === null) want = Math.round(x * dpr) / dpr;
el.style.setProperty('--zg-org-snap', (want - x).toFixed(3) + 'px');
} catch (_) { zgCatch('orgTableMake / orgSnapAccent: el.style.setProperty(\'--zg-dpr\', String(dpr));', _); }
}
};
const orgNameLine = () => {
try {
const host = wrap.parentElement;
if (!host) return;
host.style.removeProperty('--zg-org-outw');
const zoom = orgZoomOf(nameTh);
const w = nameTh.getBoundingClientRect().width / zoom;
if (!(w > 0)) return;
host.style.setProperty('--zg-org-nameline',
Math.round(wrap.offsetLeft + w) + 'px');
host.style.setProperty('--zg-org-nametop',
Math.round(wrap.offsetTop) + 'px');
const tall = Math.min(table.getBoundingClientRect().height / zoom,
wrap.clientHeight);
host.style.setProperty('--zg-org-nameend',
Math.max(0, tall).toFixed(2) + 'px');
} catch (_) { zgCatch('orgTableMake / orgNameLine: const host = wrap.parentElement;', _); }
try { orgSnapAccent(); } catch (_) { zgCatch('orgTableMake / orgNameLine: orgSnapAccent();', _); }
};
ctx.orgColFitNow = () => {
const ths = Array.from(table.querySelectorAll('thead th[data-col]'));
if (!ths.length) return;
for (const cell of Array.from(
table.querySelectorAll('th[data-col], td[data-col]'))) {
ctx.orgColUnfix(cell);
}
const ceil = ctx.orgColCeil(wrap);
const zoomC = orgZoomOf(table);
const got = ths.map((th2) => ({
id: th2.getAttribute('data-col'),
w: Math.round(th2.getBoundingClientRect().width / zoomC)
}));
const m = Object.assign({}, ctx.orgColPx());
for (const g of got) {
if (!g.id || !(g.w > 0)) continue;
m[g.id] = Math.max(ctx.ORG_COL_MIN, Math.min(ceil, g.w));
}
s.uniColPx = m;
this.saveSettings().catch(() => {});
ctx.drawPanel();
};
ctx.orgNameLineNow = orgNameLine;
orgNameLine();
try {
if (ctx.orgNameRO) { ctx.orgNameRO.disconnect(); ctx.orgNameRO = null; }
const w0 = ctx.ownerWin();
if (w0 && w0.ResizeObserver) {
ctx.orgNameRO = new w0.ResizeObserver(() => orgNameLine());
ctx.orgNameRO.observe(table);
ctx.orgNameRO.observe(wrap);
}
if (w0 && w0.setTimeout) w0.setTimeout(() => {
orgNameLine();
}, 0);
} catch (_) { zgCatch('orgTableMake / drawOrg: if (ctx.orgNameRO) ctx.orgNameRO.disconnect();', _); }
for (const col of cols) {
const th = hr.createEl('th', { cls: ctx.colTextish(col) ? 'is-text' : '' });
th.setAttribute('data-col', col.id);
th.createSpan({ cls: 'zg-org-headlabel', text: col.label });
ctx.orgColStamp(th, col.id, wrap);
ctx.orgColGripBind(th, col, wrap);
if (sortCol && sortCol.id === col.id) {
th.createSpan({ cls: 'zg-org-sortmark',
text: zgSortArrow(ctx.orgLens.sort.dir) });
}
th.title = 'Sort: newest-biggest first, then smallest, then the book’s order';
th.addEventListener('click', () => {
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
th.setAttribute('draggable', 'true');
th.addEventListener('dragstart', (ev) => {
ctx.orgDragCol = col.id;
try { ev.dataTransfer.setData('text/plain', col.id); } catch (_) { zgCatch('orgTableMake / drawOrg: ev.dataTransfer.setData(\'text/plain\', col.id);', _); }
});
th.addEventListener('dragover', (ev) => {
if (ctx.orgDragCol && ctx.orgDragCol !== col.id) ev.preventDefault();
});
th.addEventListener('drop', async (ev) => {
ev.preventDefault();
const moved = ctx.orgDragCol;
ctx.orgDragCol = null;
if (!moved || moved === col.id) return;
const now = cols.map(x => x.id);
const from = now.indexOf(moved);
if (from !== -1) now.splice(from, 1);
const at = now.indexOf(col.id);
now.splice(at === -1 ? now.length : at, 0, moved);
const rest = (Array.isArray(s.uniColOrder) ? s.uniColOrder : [])
.filter(id => now.indexOf(id) === -1);
s.uniColOrder = now.concat(rest);
await this.saveSettings();
ctx.drawPanel();
});
th.addEventListener('dragend', () => { ctx.orgDragCol = null; });
th.addEventListener('contextmenu', (ev) => {
ev.preventDefault();
ev.stopPropagation();
const menu = new Menu();
menu.addItem((i) => i.setTitle(col.label).setIsLabel(true));
menu.addItem((i) => i.setTitle('Sort \u2191')
.setIcon('arrow-up')
.onClick(() => ctx.orgLensSet({
sort: { id: col.id, dir: 'asc' } })));
menu.addItem((i) => i.setTitle('Sort \u2193')
.setIcon('arrow-down')
.onClick(() => ctx.orgLensSet({
sort: { id: col.id, dir: 'desc' } })));
const fkey = col.user ? String(col.key)
: (col.id === 'tags' ? 'tags' : '');
if (fkey) {
menu.addItem((i) => i.setTitle('Filter by this\u2026')
.setIcon('list-filter')
.onClick(() => ctx.orgFilterByKey(fkey, ev)));
}
menu.addSeparator();
menu.addItem((i) => i.setTitle('Hide this column')
.setIcon('eye-off')
.onClick(async () => {
ctx.colOff.add(col.id);
s.uniColsOff = Array.from(ctx.colOff);
await this.saveSettings();
ctx.draw(); fill(); ctx.drawPanel();
}));
try { menu.showAtMouseEvent(ev); }
catch (_) { try { menu.showAtPosition({ x: 0, y: 0 }); } catch (_e) { zgCatch('orgTableMake / drawOrg: menu.showAtPosition( x: 0, y: 0 );', _e); } }
});
}
hr.createEl('th', { cls: 'zg-org-headpick' });
const tbody = table.createEl('tbody');
const colspan = cols.length + 2;
if (ctx.orgLastGrouping !== null && lensed !== ctx.orgLastGrouping) {
table.addClass('is-melt');
}
ctx.orgLastGrouping = lensed;
const orgLensEmptied = !rows.length && !!list.length && !ctx.orgRootShut();
if (!orgLensEmptied) {
const subj = tbody.createEl('tr', { cls: 'zg-org-subrow' });
const std = subj.createEl('td', { cls: 'zg-org-name' });
const box = std.createDiv({ cls: 'zg-org-subject-in' });
const rootOpen = !ctx.orgRootShut();
const rtwist = ctx.orgChevron(box, rootOpen);
try { std.style.setProperty('--zg-org-depth', '0'); }
catch (_) { zgCatch('orgTableMake / drawOrg: std.style.setProperty(\'--zg-org-depth\', \'0\');', _); }
rtwist.title = rootOpen ? 'Fold everything' : 'Unfold everything';
rtwist.addEventListener('click', (ev) => {
ev.stopPropagation();
ctx.orgRootShutSet(rootOpen);
});
if (at) {
ctx.orgFolderIcon(box, at, rootOpen);
} else {
this.orgVaultIcon(box);
}
box.createSpan({ cls: 'zg-org-subjectname',
text: at ? ctx.nameOf(at)
: (this.vaultName() || 'Vault') });
const subUnder = ctx.orgUnder(at);
for (const col of cols) {
const td = subj.createEl('td',
{ cls: ctx.colTextish(col) ? 'is-text' : '' });
td.setAttribute('data-col', col.id);
ctx.orgColStamp(td, col.id, wrap);
const agg = ctx.orgColAgg(col, subUnder);
if (agg) {
td.setText(agg.text);
if (agg.title) td.title = agg.title;
}
}
subj.createEl('td', { cls: 'zg-org-pickcell' });
}
for (const row of rows) {
const isFolder = row.kind === 'folder';
const tr = tbody.createEl('tr',
{ cls: 'zg-org-row' + (isFolder ? ' is-folder' : '') });
tr.setAttribute('data-path', row.path);
if (row.path === ctx.orgNote) tr.addClass('zg-org-active');
const nameTd = tr.createEl('td', { cls: 'zg-org-name' });
try {
nameTd.style.setProperty('--zg-org-depth',
String(lensed ? 1 : (row.depth || 0) + 1));
} catch (_) { zgCatch('orgTableMake / drawOrg: nameTd.style.setProperty(\'--zg-org-depth\',', _); }
if (isFolder) {
const open = ctx.orgIsOpen(row.path);
const twist = ctx.orgChevron(nameTd, open);
twist.title = open ? 'Fold this folder' : 'Unfold this folder';
twist.addEventListener('click', (ev) => {
ev.stopPropagation();
ctx.orgOpenSet(row.path, !ctx.orgIsOpen(row.path));
});
} else {
nameTd.createSpan({ cls: 'zg-org-twistgap tree-item-icon'
+ ' collapse-icon nav-folder-collapse-indicator' });
}
if (isFolder) ctx.orgFolderIcon(nameTd, row.path, ctx.orgIsOpen(row.path));
else this.orgKindIcon(nameTd, row.path);
if (lensed && row.rel) {
nameTd.createDiv({ cls: 'zg-org-path', text: row.rel });
}
nameTd.createSpan({ cls: 'zg-org-namelabel', text: ctx.nameOf(row.path) });
if (!isFolder) this.orgKindTag(nameTd, row.path);
nameTd.title = (lensed && row.rel)
? row.rel + ' / ' + ctx.nameOf(row.path)
: ctx.nameOf(row.path);
for (const col of cols) {
const td = tr.createEl('td', { cls: ctx.colTextish(col) ? 'is-text' : '' });
td.setAttribute('data-col', col.id);
ctx.orgColStamp(td, col.id, wrap);
if (isFolder) {
const agg = ctx.orgColAgg(col, ctx.orgUnder(row.path));
if (agg) {
td.addClass('zg-org-aggcell');
td.setText(agg.text);
if (agg.title) td.title = agg.title;
}
continue;
}
const text = ctx.orgColText(col, row.path);
if (col.user) {
const raw = ctx.orgColRaw(col, row.path);
const pk = col.key || col.id;
const fmt = this.formatValue(pk, raw, this.orgPropType(pk),
this.dateStyle());
if (!fmt.ok) {
td.addClass('zg-org-badval');
td.title = 'This is not a valid ' + (this.orgPropType(pk) || 'value')
+ ': ' + String(raw);
}
}
if (col.id === 'mark') { ctx.orgFlagCell(td, row, text); continue; }
if (col.id === 'goal') { ctx.orgGoalCell(td, row, text); continue; }
if (col.id === 'tags') { ctx.orgTagsCell(td, row); continue; }
if (col.id === 'backlinks' && !isFolder) {
td.textContent = '';
ctx.orgBackCell(td, row);
continue;
}
if (col.user && !isFolder
&& String(this.orgPropType(col.key || col.id)).toLowerCase() === 'checkbox') {
const rawv = ctx.orgColRaw(col, row.path);
const has = rawv !== null && rawv !== undefined && rawv !== '';
td.textContent = '';
const canEdit = ctx.orgCanHoldProps(row.path);
if (canEdit) td.addClass('is-prop');
const bx = has
? td.createEl('input', { cls: 'zg-org-cellcheck' })
: null;
if (bx) {
bx.type = 'checkbox';
bx.checked = rawv === true;
bx.disabled = !canEdit;
}
td.title = !canEdit
? 'This kind of file cannot hold properties'
: (!has
? 'Not set \u2014 press to add it, ticked'
: (rawv === true
? 'Ticked \u2014 press to untick'
: 'Unticked \u2014 press to remove it from this file'));
const nextOf = (v) => {
if (v === null || v === undefined || v === '') return true;
if (v === true) return false;
return '';
};
const step = async () => {
if (!canEdit) { ctx.orgPropRefuse(row.path); return; }
const stored = this.propStoreHolds(row.path);
ctx.orgRedrawPending = true;
await ctx.orgPropSet(row.path,
col.key || col.id, nextOf(rawv));
if (stored) ctx.orgEditDone();
};
td.addEventListener('click', (ev) => {
ev.stopPropagation();
step();
});
if (bx) {
bx.addEventListener('click', (ev) => {
ev.stopPropagation();
ev.preventDefault();
step();
});
}
continue;
}
if (col.user) { ctx.orgPropCell(td, row, col, text); continue; }
td.setText(text);
if (text) td.title = text;
}
tr.createEl('td', { cls: 'zg-org-pickcell' });
const inCtl = (ev) => !!(ev.target && ev.target !== tr
&& ev.target.closest && ev.target.closest(
'input, select, button, textarea, .zg-goals-chip,'
+ ' .zg-goals-chev, .zg-org-twist'));
tr.addEventListener('click', (ev) => {
if (inCtl(ev)) return;
if (isFolder) {
if (ctx.orgNarrowNow()) ctx.orgOpenSet(row.path, !ctx.orgIsOpen(row.path));
return;
}
ctx.showItem({ path: row.path, kind: row.kind }, true);
});
tr.addEventListener('dblclick', (ev) => {
if (inCtl(ev) || isFolder) return;
ctx.openRow({ path: row.path, kind: row.kind });
});
tr.addEventListener('contextmenu', (ev) => {
ev.preventDefault();
ev.stopPropagation();
const menu = new Menu();
this.outlinerRowMenu(menu,
{ path: row.path, kind: row.kind }, ctx.orgMenuCtx);
menu.showAtMouseEvent(ev);
});
if (!lensed) {
ctx.orgRowDrag(tr, row);
if (isFolder) ctx.orgGroupDrop(tr, row.path);
}
}
if (orgLensEmptied || (!rows.length && !ctx.orgRootShut())) {
const tr0 = tbody.createEl('tr', { cls: 'zg-org-row is-empty' });
const td0 = tr0.createEl('td');
td0.setAttribute('colspan', String(colspan));
if (list.length) {
td0.createSpan({ text: 'Nothing passes the lens — ' });
const b0 = td0.createEl('button', {
cls: 'zg-export-mini zg-org-clearempty', text: 'clear it' });
b0.addEventListener('click', (ev) => {
ev.stopPropagation();
ctx.orgLensClear();
});
td0.createSpan({ text: ' to see the '
+ noteCount(list) + ' notes here.' });
} else {
td0.setText(shaped === 'folders'
? 'No folders under this folder.'
: 'No notes under this folder.');
}
}
if (ctx.orgOpenAfter) {
const want = ctx.orgOpenAfter;
ctx.orgOpenAfter = null;
try {
const td2 = ctx.panel.querySelector('.zg-org-row[data-path="'
+ want.path + '"] td[data-col="' + want.id + '"]');
if (td2 && !td2.querySelector('.zg-org-editor')) {
td2.textContent = '';
ctx.orgFieldEditor(td2, want.path, want.key, false);
}
} catch (_) { zgCatch('orgTableMake / drawOrg: const td2 = ctx.panel.querySelector(\'.zg-org-row[data-path="\'', _); }
}
if (orgKeepScroll > 0) {
try {
const w1 = ctx.panel.querySelector('.zg-org-panel');
if (w1) w1.scrollTop = orgKeepScroll;
} catch (_) { zgCatch('orgTableMake / drawOrg: const w1 = ctx.panel.querySelector(\'.zg-org-panel\');', _); }
}
if (orgKeepScrollX > 0) {
try {
const w2 = ctx.panel.querySelector('.zg-org-panel');
if (w2) w2.scrollLeft = orgKeepScrollX;
} catch (_) { zgCatch('orgTableMake / drawOrg: w2.scrollLeft = orgKeepScrollX;', _); }
}
};
return { drawOrg };
}
orgWindows() {
return (this._orgWindows || []).slice();
}
orgWindowAdd(door) {
this._orgWindows = this.orgWindows().filter((d) => d !== door);
this._orgWindows.push(door);
this.orgTreeHookAttach();
this.orgTicksSchedule();
}
orgWindowDrop(door) {
this._orgWindows = this.orgWindows().filter((d) => d !== door);
if (!this._orgWindows.length) this.orgTreeHookDetach();
this.orgTicksSchedule();
}
orgTicksDoor() {
for (const w of this.orgWindows()) {
try {
if (!w.ticks) continue;
if (w.ticks.wanted()) return w;
} catch (e) { zgGuardReport('the Organizer answering whether the tree wants ticks', e); }
}
return null;
}
orgTicksWanted() { return !!this.orgTicksDoor(); }
orgTicksSchedule() {
if (this._ticksScheduled) return;
this._ticksScheduled = true;
setTimeout(() => { this._ticksScheduled = false; this.orgTicksRepaint(); }, 0);
}
orgTicksRows() {
const out = [];
for (const view of this.explorerViews()) {
const items = view && view.fileItems;
if (items && typeof items === 'object') {
for (const path of Object.keys(items)) {
if (path === '/' || path === '') continue;
const it = items[path];
const el = it && (it.selfEl || it.titleEl);
if (!el) continue;
const kind = (it.file && it.file.children) || (el.classList && el.classList.contains('nav-folder-title')) ? 'folder' : 'file';
out.push({ path, el, kind });
}
continue;
}
const root = view && view.containerEl;
if (!root || !root.querySelectorAll) continue;
for (const el of Array.from(root.querySelectorAll('.nav-file-title[data-path], .nav-folder-title[data-path]'))) {
const path = el.getAttribute('data-path');
if (!path || path === '/') continue;
out.push({ path, el, kind: el.classList.contains('nav-folder-title') ? 'folder' : 'file' });
}
}
return out;
}
orgTicksRepaint() {
const door = this.orgTicksDoor();
if (!door) { this.orgTicksClear(); return 0; }
let n = 0;
for (const row of this.orgTicksRows()) {
try {
if (row.kind === 'file' && !/\.md$/i.test(row.path)) continue;
let box = row.el.querySelector(':scope > .zg-treetick');
if (!box) {
box = document.createElement('input');
box.type = 'checkbox';
box.className = 'zg-treetick zg-uni-check';
box.draggable = false;
box.addEventListener('mousedown', (ev) => ev.stopPropagation());
box.addEventListener('click', (ev) => ev.stopPropagation());
box.addEventListener('change', (ev) => {
ev.stopPropagation();
const d = this.orgTicksDoor();
try { if (d) d.ticks.toggle(row.path, row.kind); }
catch (e) { zgGuardReport('the tree ticking a row for Export', e); }
this.orgTicksSchedule();
});
const chev = row.el.querySelector(':scope > .tree-item-icon, :scope > .collapse-icon');
if (chev && chev.nextSibling) row.el.insertBefore(box, chev.nextSibling);
else if (chev) row.el.appendChild(box);
else row.el.insertBefore(box, row.el.firstChild);
}
const st = door.ticks.state(row.path, row.kind);
const dead = !st || !st.mine;
box.disabled = dead;
box.title = dead ? 'Outside what is being exported — choose this folder, or a folder above it, to include it' : '';
box.checked = !dead && st.all;
box.indeterminate = !dead && st.some;
box.classList.toggle('is-part', !dead && st.some);
n++;
} catch (e) { zgGuardReport('the tree painting an Export tick', e); }
}
return n;
}
orgTicksClear() {
try { document.querySelectorAll('.zg-treetick').forEach((el) => el.remove()); }
catch (_) { zgCatch('orgTicksClear: document.querySelectorAll(.zg-treetick)', _); }
}
async orgOpenAt(path, tabId, opts) {
const p = (path == null || path === '/') ? '' : String(path);
const o = opts || {};
const id = tabId || 'organizer';
let door = this.orgDoorFor(id);
if (!door) {
try { this._wsSession = this._wsSession || zgSessionNew(); } catch (_) { zgCatch('orgOpenAt: this._wsSession = this._wsSession || zgSessionNew();', _); }
if (this._wsSession) this._wsSession.tab = id;
try { await this.openOutlinerPane(id); } catch (e) { zgGuardReport('the tree opening the Organizer', e); }
door = this.orgDoorFor(id);
if (!door) return false;
}
try { if (door.tab() !== id && door.tabSet) door.tabSet(id); } catch (e) { zgGuardReport('the tree switching the Organizer’s tab', e); }
if (o.many && o.many.length > 1) {
try { if (door.many) door.many(o.many); } catch (e) { zgGuardReport('the tree handing the Organizer several folders', e); }
} else {
this.orgTreeSelect(p);
if (o.note) this.orgTreeFollow(o.note);
}
this.orgReveal(door);
return true;
}
orgOpenMany(folders, tabId) {
const list = (folders || []).map((f) => (typeof f === 'string' ? f : (f && f.path))).filter(Boolean);
const inside = (a, b) => a === b || a.indexOf(b + '/') === 0;
const top = list.filter((p) => !list.some((q) => q !== p && inside(p, q)));
return this.orgOpenAt(top[0] || '', tabId || 'export', { many: top });
}
orgReveal(door) {
try {
const host = door && door.host && door.host();
const h = host && host.handle && host.handle();
const leaf = h && h.leaf;
if (leaf && this.app.workspace.revealLeaf) this.app.workspace.revealLeaf(leaf);
} catch (e) { zgGuardReport('the tree bringing the Organizer forward', e); }
}
fileMenuOrganizerRows(menu, file) {
if (!file || !file.path) return;
const isFolder = !!file.children;
const path = String(file.path);
const here = isFolder ? path : (path.lastIndexOf('/') > 0 ? path.slice(0, path.lastIndexOf('/')) : '');
const note = isFolder ? null : path;
const row = (title, icon, tabId) => {
menu.addItem((i) => {
i.setTitle(title);
try { if (i.setIcon) i.setIcon(icon); } catch (_) { zgCatch('fileMenuOrganizerRows: if (i.setIcon) i.setIcon(icon);', _); }
i.onClick(() => { this.orgOpenAt(here, tabId, { note }); });
});
};
row('Organizer here', 'list-tree', 'organizer');
if (isFolder) row('Export this', 'file-output', 'export');
row('History here', 'history', 'history');
}
orgDoorFor(tabId) {
const doors = this.orgWindows();
for (const d of doors) { try { if (d.tab() === tabId) return d; } catch (_) { zgCatch('orgDoorFor: d.tab()', _); } }
for (const d of doors) { try { if (!(d.single && d.single())) return d; } catch (_) { zgCatch('orgDoorFor: d.single()', _); } }
return null;
}
async orgOpenTab(tabId) {
const id = tabId || 'organizer';
const door = this.orgDoorFor(id);
if (door) {
try { if (door.tab() !== id && door.tabSet) door.tabSet(id); } catch (e) { zgGuardReport('switching the Organizer’s tab', e); }
this.orgReveal(door);
return door;
}
try { this._wsSession = this._wsSession || zgSessionNew(); } catch (_) { zgCatch('orgOpenTab: this._wsSession = this._wsSession || zgSessionNew();', _); }
if (this._wsSession) this._wsSession.tab = id;
let leaf = null;
try { leaf = await this.openOutlinerPane(id); } catch (e) { zgGuardReport('opening the Organizer', e); leaf = null; }
if (leaf) return leaf;
return this.openManuscriptModal({ tab: id });
}
filesMenuFor(menu, files) {
const folders = (files || []).filter((f) => f && f.children && f.path && f.path !== '/').map((f) => f.path);
if (folders.length < 2) return;
menu.addItem((i) => {
i.setTitle('Export these');
try { if (i.setIcon) i.setIcon('file-output'); } catch (_) { zgCatch('filesMenuFor: if (i.setIcon) i.setIcon(file-output);', _); }
i.onClick(() => { this.orgOpenMany(folders, 'export'); });
});
}
orgTreeSelect(path) {
const p = (path == null || path === '/') ? '' : String(path);
let n = 0;
for (const w of this.orgWindows()) {
try { w.select(p); n++; }
catch (e) { zgGuardReport('the file tree choosing a folder for the Organizer', e); }
}
return n;
}
orgTreeFollow(path) {
if (!path) return 0;
let n = 0;
for (const w of this.orgWindows()) {
try { w.follow(String(path)); n++; }
catch (e) { zgGuardReport('the Organizer following the note you opened', e); }
}
return n;
}
orgTreeHookAttach() {
if (this._explorerClick) return;
this._explorerClick = (ev) => {
try {
if (!this.orgWindows().length) return;
const t = ev.target;
if (!t || !t.closest) return;
if (!t.closest('.workspace-leaf-content[data-type="file-explorer"]')) return;
if (t.closest('.zg-treetick, input, button')) return;
const row = t.closest('.nav-folder-title[data-path]');
if (!row) return;
const p = row.getAttribute('data-path');
if (p == null) return;
this.orgTreeSelect(p);
} catch (e) { zgGuardReport('the file tree choosing a folder for the Organizer', e); }
};
document.addEventListener('click', this._explorerClick, true);
}
orgTreeHookDetach() {
if (!this._explorerClick) return;
try { document.removeEventListener('click', this._explorerClick, true); }
catch (_) { zgCatch('orgTreeHookDetach: document.removeEventListener(click)', _); }
this._explorerClick = null;
}
selectionFiles(rows) {
const out = new Map();
const add = (f) => {
try { if (f && f.path && this.isFileCounted(f)) out.set(f.path, f); } catch (_) { zgCatch('selectionFiles / add: if (f && f.path && this.isFileCounted(f)) out.set(f.path, f);', _); }
};
const wholeVault = () => {
for (const f of this.filesInFolder('/', true)) {
add(f);
}
};
if (!rows || !rows.length) { wholeVault(); return Array.from(out.values()); }
for (const it of rows) {
if (!it) continue;
if (it.kind === 'folder') {
for (const f of this.filesInFolder(it.path ? it.path : '/', true)) add(f);
continue;
}
let f = null;
try { f = this.app.vault.getAbstractFileByPath(it.path); } catch (_) { zgCatch('selectionFiles: f = this.app.vault.getAbstractFileByPath(it.path);', _); }
add(f);
}
return Array.from(out.values());
}
async analyzeSelection(rows) {
if (!this.wordCountCache) this.wordCountCache = new Map();
const files = this.selectionFiles(rows);
const total = { words: 0, chars: 0, charsNoSpaces: 0, charsWithSpaces: 0,
syllables: 0, sentences: 0, paragraphs: 0, lines: 0, files: files.length };
for (const file of files) {
let stats = null;
const hit = this.wordCountCache.get('stats:' + file.path);
if (hit && file.stat && hit.mtime === file.stat.mtime) stats = hit.stats;
if (!stats) {
try {
stats = this.analyzeText(await this.app.vault.cachedRead(file));
if (file.stat) {
this.wordCountCache.set('stats:' + file.path,
{ mtime: file.stat.mtime, stats });
}
} catch (_) { continue; }
}
total.words += stats.words || 0;
total.chars += stats.chars || 0;
total.charsNoSpaces += stats.charsNoSpaces || 0;
total.charsWithSpaces += stats.charsWithSpaces || 0;
total.syllables += stats.syllables || 0;
total.sentences += stats.sentences || 0;
total.paragraphs += stats.paragraphs || 0;
total.lines += stats.lines || 0;
}
total.pages = total.words ? Math.max(1, Math.round(total.words / 250)) : 0;
total.grade = fkGrade(total.words, total.sentences, total.syllables);
return total;
}
selectionTarget(rows) {
if (!rows || !rows.length) {
return this.folderTargetRollup('/').value;
}
const folders = rows.filter(r => r && r.kind === 'folder').map(r => r.path);
const covered = (p, kind) => folders.some(f =>
!(kind === 'folder' && f === p)
&& (f === '' || f === '/' || p === f || String(p).indexOf(f + '/') === 0));
let sum = 0;
const sums = this.folderTargetSums();
for (const it of rows) {
if (!it || covered(it.path, it.kind)) continue;
sum += it.kind === 'folder'
? (sums.get(it.path) || 0)
: this.fileGoalFor(it.path);
}
return sum;
}
treeOrderKey(folder) {
return 'order: ' + (folder || '/');
}
treeOrderFor(folder) {
const store = this.structureCached();
if (!store) return [];
const rows = store[this.treeOrderKey(folder)];
if (!rows || !rows.length) return [];
return rows.map(r => r.path);
}
async treeOrderLoad() {
try { await this.structureRead(); } catch (_) { zgCatch('treeOrderLoad: await this.structureRead();', _); }
return this._structStore || {};
}
treeOrderAdopt(file) {
if (!file || !file.path) return;
if (!this.explorerSortWanted()
&& !(this._treeOrderWatchers && this._treeOrderWatchers.size)) return;
let mine = false;
try { mine = file.path === this.structurePathNow() || file.path === this._structFoundAt; }
catch (_) { return; }
if (!mine) return;
const was = this._structText;
this.structureReload().then(() => {
if (this._structText === was) return;
this.treeOrderChanged();
});
}
async structureReload() {
let text = '';
try {
const found = await this.structureFind();
const f = found ? this.app.vault.getAbstractFileByPath(found) : null;
if (f && !f.children) text = await this.app.vault.read(f);
} catch (_) { return this._structStore; }
this._structText = text;
if (!String(text || '').trim() && this._structStore
&& Object.keys(this._structStore).length) {
return this._structStore;
}
this._structStore = this.structureParse(text);
return this._structStore;
}
onTreeOrderChange(fn) {
if (!this._treeOrderWatchers) this._treeOrderWatchers = new Set();
this._treeOrderWatchers.add(fn);
return () => { try { this._treeOrderWatchers.delete(fn); } catch (_) { zgCatch('onTreeOrderChange: this._treeOrderWatchers.delete(fn);', _); } };
}
onTreeCountsChange(fn) {
if (!this._treeCountWatchers) this._treeCountWatchers = new Set();
this._treeCountWatchers.add(fn);
return () => { try { this._treeCountWatchers.delete(fn); } catch (_) { zgCatch('onTreeCountsChange: this._treeCountWatchers.delete(fn);', _); } };
}
treeCountsChanged(path) {
if (!path) return;
if (!this._treeCountWatchers || !this._treeCountWatchers.size) return;
if (!this._treeCountDirty) this._treeCountDirty = new Set();
this._treeCountDirty.add(path);
if (this._treeCountTimer) window.clearTimeout(this._treeCountTimer);
this._treeCountTimer = window.setTimeout(() => {
this._treeCountTimer = null;
const paths = Array.from(this._treeCountDirty || []);
this._treeCountDirty = new Set();
for (const fn of (this._treeCountWatchers || [])) {
try { fn(paths); } catch (_) { zgCatch('treeCountsChanged: fn(paths);', _); }
}
}, 2000);
}
treeShapeChanged() {
if (this._treeShapeQueued) return;
this._treeShapeQueued = true;
const run = () => {
this._treeShapeQueued = false;
this.treeOrderChanged();
};
try {
if (typeof window !== 'undefined' && window.requestAnimationFrame) {
window.requestAnimationFrame(run);
return;
}
} catch (_) { zgCatch('treeShapeChanged: if (typeof window !== \'undefined\' && window.requestAnimationFrame)', _); }
setTimeout(run, 0);
}
treeOrderChanged() {
try { this.repaintExplorerOrder(); } catch (e) {
console.error('Word-Smith: could not repaint the explorer order', e);
}
for (const fn of (this._treeOrderWatchers || [])) {
try { fn(); } catch (e) {
console.error('Word-Smith: a tree watcher failed', e);
}
}
}
async treeMoveInto(movedPath, intoFolder) {
const vault = this.app.vault;
let af = null;
try { af = vault.getAbstractFileByPath(movedPath); } catch (_) { zgCatch('treeMoveInto: af = vault.getAbstractFileByPath(movedPath);', _); }
if (!af) return { ok: false, said: 'That file is no longer there.' };
const name = String(movedPath).split('/').pop();
const dest = intoFolder ? intoFolder + '/' + name : name;
if (dest === movedPath) return { ok: false, said: '' };
if (af.children && (intoFolder === movedPath
|| String(intoFolder).indexOf(movedPath + '/') === 0)) {
return { ok: false, said: 'A folder cannot go inside itself.' };
}
let clash = null;
try { clash = vault.getAbstractFileByPath(dest); } catch (_) { zgCatch('treeMoveInto: clash = vault.getAbstractFileByPath(dest);', _); }
if (clash) {
return { ok: false, said: 'There is already something called \u201c' + name
+ '\u201d there, so nothing was moved.' };
}
const from = (() => {
const cut = String(movedPath).lastIndexOf('/');
return cut === -1 ? '' : movedPath.slice(0, cut);
})();
const wasAt = this.treeOrderCurrent(from).indexOf(movedPath);
try {
await this.app.fileManager.renameFile(af, dest);
} catch (e) {
return { ok: false, said: 'Could not move that \u2014 '
+ (e && e.message ? e.message : String(e)) };
}
try {
const after = this.treeOrderCurrent(intoFolder || '');
if (after.indexOf(dest) === -1) after.push(dest);
await this.treeOrderWrite(intoFolder || '', after);
if (from !== (intoFolder || '')) {
await this.treeOrderWrite(from, this.treeOrderCurrent(from));
}
} catch (_) { zgCatch('treeMoveInto: const after = this.treeOrderCurrent(intoFolder || \'\');', _); }
this.treeOrderChanged();
return { ok: true, said: '', moved: movedPath, from, dest, wasAt };
}
outlinerNewParent(sel) {
const rows = Array.from(sel || []);
const first = rows[0];
if (!first) {
try {
void 0;
} catch (_) { zgCatch('outlinerNewParent: void 0;', _); }
return '';
}
if (first.kind === 'folder') return first.path;
const cut = String(first.path).lastIndexOf('/');
return cut === -1 ? '' : first.path.slice(0, cut);
}
outlinerFreeName(parent, base, ext) {
const dir = parent ? parent + '/' : '';
const at = (n) => dir + base + (n > 1 ? ' ' + n : '') + (ext || '');
for (let n = 1; n < 500; n++) {
const want = at(n);
let taken = null;
try { taken = this.app.vault.getAbstractFileByPath(want); } catch (_) { zgCatch('outlinerFreeName: taken = this.app.vault.getAbstractFileByPath(want);', _); }
if (!taken) return want;
}
return dir + base + ' ' + Date.now() + (ext || '');
}
async outlinerJoinOrder(parent, path) {
try {
const now = this.treeOrderCurrent(parent || '');
if (now.indexOf(path) === -1) now.push(path);
await this.treeOrderWrite(parent || '', now);
} catch (_) { }
}
async outlinerAddNote(parent) {
const path = this.outlinerFreeName(parent, 'Untitled', '.md');
try {
await this.app.vault.create(path, '');
} catch (e) {
return { ok: false, said: 'Could not make that \u2014 '
+ (e && e.message ? e.message : String(e)) };
}
await this.outlinerJoinOrder(parent, path);
try { this.app.workspace.openLinkText(path, '', false); } catch (_) { zgCatch('outlinerAddNote: this.app.workspace.openLinkText(path, \'\', false);', _); }
this.treeShapeChanged();
return { ok: true, said: '', path, kind: 'file' };
}
async outlinerAddFolder(parent) {
const path = this.outlinerFreeName(parent, 'New folder', '');
try {
await this.app.vault.createFolder(path);
} catch (e) {
return { ok: false, said: 'Could not make that \u2014 '
+ (e && e.message ? e.message : String(e)) };
}
await this.outlinerJoinOrder(parent, path);
this.treeShapeChanged();
return { ok: true, said: '', path, kind: 'folder' };
}
confirmDelete(file) {
return new Promise((resolve) => {
if (!file || !Modal) { resolve(false); return; }
const isFolder = !!file.children;
const name = String(file.path).split('/').pop();
let answered = false;
const done = (v) => { if (!answered) { answered = true; resolve(v); } };
const m = this.wsModal();
m.titleEl.setText('Delete ' + (isFolder ? 'folder' : 'file'));
m.contentEl.createEl('p', { text: isFolder
? 'Delete \u201c' + name + '\u201d and everything in it?'
: 'Delete \u201c' + name + '\u201d?' });
m.contentEl.createEl('p', { cls: 'ws-settings-note', text:
'It goes wherever your \u201cDeleted files\u201d setting sends things.' });
const row = m.contentEl.createDiv({ cls: 'zg-confirm-row' });
const no = row.createEl('button', { text: 'Cancel' });
no.addEventListener('click', () => { done(false); m.close(); });
const yes = row.createEl('button', { cls: 'mod-warning', text: 'Delete' });
yes.addEventListener('click', () => { done(true); m.close(); });
const wasClose = m.onClose ? m.onClose.bind(m) : null;
m.onClose = () => { done(false); if (wasClose) wasClose(); };
m.open();
try { window.setTimeout(() => no.focus(), 0); } catch (_) { zgCatch('confirmDelete: window.setTimeout(() => no.focus(), 0);', _); }
});
}
outlinerRenameParts(path, isFolder) {
const full = String(path || '');
const cut = full.lastIndexOf('/');
const dir = cut === -1 ? '' : full.slice(0, cut);
const name = cut === -1 ? full : full.slice(cut + 1);
const dot = isFolder ? -1 : name.lastIndexOf('.');
return {
dir,
base: dot > 0 ? name.slice(0, dot) : name,
ext: dot > 0 ? name.slice(dot) : ''
};
}
async outlinerRenameTo(path, isFolder, typed) {
const parts = this.outlinerRenameParts(path, isFolder);
const want = String(typed == null ? '' : typed).trim();
if (!want || want === parts.base) return { ok: false, said: '' };
if (want.indexOf('/') !== -1) {
return { ok: false, said: 'A name cannot contain a slash \u2014 drag the row to move it.' };
}
const dest = (parts.dir ? parts.dir + '/' : '') + want + parts.ext;
if (dest === path) return { ok: false, said: '' };
let taken = null;
try { taken = this.app.vault.getAbstractFileByPath(dest); } catch (_) { zgCatch('outlinerRenameTo: taken = this.app.vault.getAbstractFileByPath(dest);', _); }
if (taken) {
return { ok: false, said: 'There is already something called \u201c' + want + '\u201d here.' };
}
try {
const f = this.app.vault.getAbstractFileByPath(path);
if (!f) return { ok: false, said: 'That has moved since \u2014 nothing was renamed.' };
if (this.app.fileManager && this.app.fileManager.renameFile) {
await this.app.fileManager.renameFile(f, dest);
} else {
await this.app.vault.rename(f, dest);
}
} catch (e) {
return { ok: false, said: 'Could not rename that \u2014 '
+ (e && e.message ? e.message : String(e)) };
}
this.treeShapeChanged();
return { ok: true, said: '', path: dest };
}
outlinerRowMenu(menu, item, ctx) {
const c = ctx || {};
const path = item && item.path;
const isFolder = !!(item && item.kind === 'folder');
const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
const parent = isFolder ? path : this.outlinerNewParent(item ? [item] : []);
const made = (r) => {
if (!r || !r.ok) {
if (c.said && r) c.said(r.said, true);
return;
}
if (c.reveal) c.reveal(r.path);
window.setTimeout(() => {
if (c.rename) c.rename({ path: r.path, kind: r.kind });
}, 0);
};
menu.addItem((i) => i.setTitle('New note').setIcon('file-text')
.onClick(async () => { made(await this.outlinerAddNote(parent)); }));
menu.addItem((i) => i.setTitle('New folder').setIcon('folder')
.onClick(async () => { made(await this.outlinerAddFolder(parent)); }));
if (!path) return menu;
menu.addSeparator();
if (!isFolder) {
menu.addItem((i) => i.setTitle('Open').setIcon('file')
.onClick(() => { try { this.app.workspace.openLinkText(path, '', false); } catch (_) { zgCatch('outlinerRowMenu: this.app.workspace.openLinkText(path, \'\', false);', _); } }));
menu.addItem((i) => i.setTitle('Open in new tab').setIcon('lucide-file-plus')
.onClick(() => { try { this.app.workspace.openLinkText(path, '', true); } catch (_) { zgCatch('outlinerRowMenu: this.app.workspace.openLinkText(path, \'\', true);', _); } }));
}
menu.addSeparator();
try { this.fileMenuFor(menu, file || { path, children: isFolder ? [] : undefined }); } catch (_) { zgCatch('outlinerRowMenu: this.fileMenuFor(menu, file || path, children: isFolder ? [] : …', _); }
menu.addSeparator();
const runFileCommand = async (id, fallback) => {
try {
if (file && !file.children && this.app.workspace.openLinkText) {
await this.app.workspace.openLinkText(file.path, '', false);
}
const cmds = this.app.commands;
if (cmds && cmds.executeCommandById && file && !file.children) {
if (cmds.executeCommandById(id)) return;
}
} catch (_) { zgCatch('outlinerRowMenu / runFileCommand: if (file && !file.children && this.app.workspace.openLinkText)', _); }
try { await fallback(); } catch (e) {
if (c.said) c.said('Could not do that \u2014 '
+ (e && e.message ? e.message : String(e)), true);
}
};
menu.addItem((i) => i.setTitle('Rename').setIcon('pencil')
.onClick(() => { if (c.rename) c.rename(item); }));
menu.addItem((i) => i.setTitle('Delete').setIcon('trash')
.onClick(() => {
runFileCommand('app:delete-file', async () => {
const ok2 = await this.confirmDelete(file);
if (!ok2) return;
if (this.app.fileManager.trashFile && file) {
await this.app.fileManager.trashFile(file);
} else if (file) {
await this.app.vault.trash(file, true);
}
});
}));
try {
if (file) this.app.workspace.trigger('file-menu', menu, file, 'word-smith-outliner');
} catch (_) { zgCatch('outlinerRowMenu: if (file) this.app.workspace.trigger(\'file-menu\', menu, file, …', _); }
return menu;
}
async treeMoveUndo(rec) {
if (!rec || !rec.ok || rec.undone) {
return { ok: false, said: 'There is nothing to undo.' };
}
rec.undone = true;
const vault = this.app.vault;
let af = null;
try { af = vault.getAbstractFileByPath(rec.dest); } catch (_) { zgCatch('treeMoveUndo: af = vault.getAbstractFileByPath(rec.dest);', _); }
if (!af) {
return { ok: false, said: 'That file has moved again since, so it '
+ 'was left where it is.' };
}
const name = String(rec.dest).split('/').pop();
const home = rec.from ? rec.from + '/' + name : name;
let clash = null;
try { clash = vault.getAbstractFileByPath(home); } catch (_) { zgCatch('treeMoveUndo: clash = vault.getAbstractFileByPath(home);', _); }
if (clash) {
return { ok: false, said: 'There is something called \u201c' + name
+ '\u201d back there now, so nothing was moved.' };
}
try {
await this.app.fileManager.renameFile(af, home);
} catch (e) {
return { ok: false, said: 'Could not put that back \u2014 '
+ (e && e.message ? e.message : String(e)) };
}
try {
const home2 = rec.from || '';
const rows = this.treeOrderCurrent(home2).filter(p2 => p2 !== home);
const at = Math.max(0, Math.min(rows.length,
typeof rec.wasAt === 'number' && rec.wasAt >= 0 ? rec.wasAt : rows.length));
rows.splice(at, 0, home);
await this.treeOrderWrite(home2, rows);
const leftBehind = (() => {
const cut = String(rec.dest).lastIndexOf('/');
return cut === -1 ? '' : rec.dest.slice(0, cut);
})();
if (leftBehind !== home2) {
await this.treeOrderWrite(leftBehind, this.treeOrderCurrent(leftBehind));
}
} catch (_) { zgCatch('treeMoveUndo: const home2 = rec.from || \'\';', _); }
this.treeOrderChanged();
return { ok: true, said: '', path: home };
}
async treeOrderWrite(folder, paths) {
const rows = (paths || [])
.filter(p => !(this.isStoreFile && this.isStoreFile(p)))
.map(p => ({ path: p, on: true }));
await this.structureWriteSection(this.treeOrderKey(folder), rows);
this.treeOrderChanged();
}
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
const GENERIC = new Set(['inherit', 'initial', 'unset', 'sans-serif', 'serif',
'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif',
'ui-monospace', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto',
'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
'Helvetica', 'Arial', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol']);
const seen = new Set();
const out = [];
for (const part of String(raw).split(',')) {
const name = part.trim().replace(/^["']|["']$/g, '');
if (!name || GENERIC.has(name) || seen.has(name)) continue;
seen.add(name);
out.push(name);
}
return out;
}
systemFontNames() {
const parts = [];
try {
const cur = this.settings && this.settings.exportOpts && this.settings.exportOpts.font;
if (cur) parts.push(cur);
} catch (_) { zgCatch('systemFontNames: const cur = this.settings && this.settings.exportOpts && …', _); }
try { for (const n of this.getConfiguredFonts()) parts.push(n); } catch (_) { zgCatch('systemFontNames: for (const n of this.getConfiguredFonts()) parts.push(n);', _); }
const found = (this._sysFonts && this._sysFonts.length)
? this._sysFonts.slice() : ZG_SAFE_FONTS.slice();
found.sort((a, b) => String(a).localeCompare(String(b)));
for (const n of found) parts.push(n);
for (const n of ZG_SAFE_FONTS) parts.push(n);
return zgUniqueFonts(parts);
}
fontIsInstalled(name) {
const key = String(name == null ? '' : name).trim().toLowerCase();
if (!key) return true;
const list = (this._sysFonts && this._sysFonts.length) ? this._sysFonts : ZG_SAFE_FONTS;
for (const n of list) if (String(n).toLowerCase() === key) return true;
try {
for (const n of this.getConfiguredFonts()) if (String(n).toLowerCase() === key) return true;
} catch (_) { zgCatch('fontIsInstalled: for (const n of this.getConfiguredFonts()) if (String(n).toLowerCase() …', _); }
return false;
}
fontFinderMatches(q, limit) {
return zgFontMatches(q, this.systemFontNames(), limit);
}
ensureSystemFonts() {
if (this._sysFontsFrom === 'local') return Promise.resolve(this._sysFonts || []);
if (this._sysFontsQ) return this._sysFontsQ;
const done = (names, from) => {
const list = zgUniqueFonts(names);
if (list.length) { this._sysFonts = list; this._sysFontsFrom = from; }
this._sysFontsQ = null;
return this._sysFonts || [];
};
this._sysFontsQ = (async () => {
try {
if (typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function') {
const data = await window.queryLocalFonts();
const fams = [];
for (const f of (data || [])) if (f && f.family) fams.push(f.family);
if (fams.length) return done(fams, 'local');
}
} catch (_) {
}
return done(zgProbeInstalledFonts(ZG_FONT_CANDIDATES), 'probe');
})().catch(() => { this._sysFontsQ = null; return this._sysFonts || []; });
return this._sysFontsQ;
}
applyEditorFont() {
const font = this.settings.pluginEnabled && this.isActiveFileInScope()
? (this.opt('editorFont') || '')
: '';
if (font) document.body.style.setProperty('--zg-font', font);
else document.body.style.removeProperty('--zg-font');
document.body.classList.toggle('zg-font-active', !!font);
}
buildThemeIndicator() {
const on = this.settings.barThemeEnabled !== false;
const id = this.settings.barTheme;
const theme = (on && id && id !== 'custom') ? this.barThemeById(id) : null;
const half = this.isDarkTheme() ? 'dark' : 'light';
const name = theme
? ((theme.names && theme.names[half]) || theme.name)
: null;
const el = this.buildBarButton(
'zg-barbtn-theme' + (theme ? '' : ' is-off'),
(node) => { node.textContent = 'Theme'; },
name ? 'Theme: ' + name + ' \u2014 click to change'
: 'Theme \u2014 click to choose',
(anchor2) => this.openThemePicker(anchor2)
);
return el;
}
buildFontIndicator() {
const current = this.opt('editorFont') || '';
const el = this.buildBarButton(
'zg-barbtn-font' + (current ? '' : ' is-off'),
(node) => {
node.textContent = this.settings.fontTokenFormat === 'word' ? 'Fonts' : 'Aa';
if (current) node.style.fontFamily = current;
},
current ? 'Font: ' + current + ' \u2014 click to change' : 'Font \u2014 click to choose',
(anchor) => this.openFontPicker(anchor)
);
return el;
}
menuDrawIcon(el, rowId) {
const glyph = this.menuIconFor(rowId)
|| (this.menuIsCommand(rowId) ? 'terminal' : '');
if (!glyph) return el.createDiv({ cls: 'zg-menu-icon is-blank' });
const g = el.createDiv({ cls: 'zg-menu-icon' });
let drew = false;
for (const n of this.menuIconAlts(glyph)) {
g.textContent = '';
try { if (setIcon) setIcon(g, n); } catch (_) { zgCatch('menuDrawIcon: if (setIcon) setIcon(g, n);', _); }
if (g.childElementCount > 0) { drew = true; break; }
}
if (drew && this.menuIconMirrored(rowId)) g.addClass('is-mirrored');
return g;
}
menuFeatureDefs() {
return [
{ id: 'search', name: 'Search', icon: 'search' },
{ id: 'modes', name: 'Modes', icon: 'feather' },
{ id: 'syntax', name: 'Syntax', icon: 'code' },
{ id: 'prose', name: 'Prose', icon: 'pen-tool' },
{ id: 'markers', name: 'Markers', icon: 'pilcrow' },
{ id: 'font', name: 'Font', icon: 'case-sensitive' },
{ id: 'lightdark', name: 'Light / Dark',
icon: () => (this.isDarkTheme() ? 'moon' : 'sun') },
{ id: 'theme', name: 'Theme', icon: 'palette' },
{ id: 'report', name: 'Report', icon: 'bar-chart-2' },
{ id: 'history', name: 'History', icon: 'history' },
{ id: 'export', name: 'Export', icon: 'file-output' },
{ id: 'organizer', name: 'Organizer', icon: 'list-tree' }
];
}
menuIconAlts(name) {
const ALTS = {
'file-output': ['file-output', 'file-symlink', 'file-up',
'external-link', 'share'],
'glasses': ['glasses', 'focus', 'sliders-horizontal'],
'terminal': ['terminal', 'terminal-square', 'square-terminal',
'chevron-right-circle']
};
return ALTS[name] || [name];
}
menuIconMirrored(id) { return id === 'export'; }
menuIconFor(id) {
const d = this.menuFeatureDefs().filter(x => x.id === id)[0];
const icon = d && d.icon;
if (typeof icon === 'function') {
try { return icon() || ''; } catch (_) { return ''; }
}
return icon || '';
}
menuLayout() {
const def = ['search', 'modes', 'syntax', 'prose', 'markers', 'font',
'lightdark', 'theme', 'rule-1', 'organizer', 'report', 'history',
'export'];
const out = [];
for (const id of (this.settings.menuOrder || [])) {
if (!out.includes(id)) out.push(id);
}
for (const id of def) if (!out.includes(id)) out.push(id);
return out;
}
menuVisibleLayout() {
const hidden = new Set(this.settings.menuHidden || []);
return this.menuLayout().filter(id => !hidden.has(id));
}
menuBands() {
const joined = new Set(this.settings.menuJoined || []);
const isRule = (id) => /^rule-\d+$/.test(id);
const out = [];
for (const id of this.menuVisibleLayout()) {
const band = out[out.length - 1];
const solo = (x) => isRule(x) || x === 'search';
const canJoin = band && joined.has(id) && band.length < MENU_MAX_COLS
&& !solo(id) && !solo(band[0]);
if (canJoin) band.push(id); else out.push([id]);
}
return out;
}
menuIsJoined(id) { return (this.settings.menuJoined || []).includes(id); }
menuSetJoined(id, on) {
const set = new Set(this.settings.menuJoined || []);
if (on) set.add(id); else set.delete(id);
this.settings.menuJoined = [...set];
}
menuJoinAfter(id, targetId) {
if (id === targetId) return;
const band = this.menuBands().find(b => b.includes(targetId));
const full = band && band.length >= MENU_MAX_COLS && !band.includes(id);
const ids = this.menuLayout().filter(x => x !== id);
const at = ids.indexOf(targetId);
ids.splice(at < 0 ? ids.length : at + 1, 0, id);
this.settings.menuOrder = ids;
this.menuSetJoined(id, !full && !/^rule-\d+$/.test(id));
}
menuBreakAt(id, toIdx) {
this.menuMove(id, toIdx);
this.menuSetJoined(id, false);
}
menuMove(id, toIdx) {
const ids = this.menuLayout().filter(x => x !== id);
const at = Math.max(0, Math.min(toIdx, ids.length));
ids.splice(at, 0, id);
this.settings.menuOrder = ids;
}
menuHide(id) {
const hidden = this.settings.menuHidden || [];
if (!hidden.includes(id)) hidden.push(id);
this.settings.menuHidden = hidden;
}
menuRestore(id) {
this.settings.menuHidden =
(this.settings.menuHidden || []).filter(h => h !== id);
}
menuAddRule(afterIdx) {
let n = 1;
for (const id of this.menuLayout()) {
const m = /^rule-(\d+)$/.exec(id);
if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
}
const ids = this.menuLayout();
const at = afterIdx == null ? ids.length : Math.max(0, Math.min(afterIdx, ids.length));
ids.splice(at, 0, 'rule-' + n);
this.settings.menuOrder = ids;
return 'rule-' + n;
}
menuIsCommand(id) { return typeof id === 'string' && id.startsWith('cmd:'); }
menuCommandId(id) { return this.menuIsCommand(id) ? id.slice(4) : null; }
menuCommandFor(id) {
const cid = this.menuCommandId(id);
if (!cid) return null;
try {
const cmds = this.app.commands;
if (!cmds) return null;
if (cmds.commands && cmds.commands[cid]) return cmds.commands[cid];
if (typeof cmds.listCommands === 'function') {
return cmds.listCommands().find(c => c && c.id === cid) || null;
}
} catch (_) { zgCatch('menuCommandFor: const cmds = this.app.commands;', _); }
return null;
}
menuDefaultAlias(name) {
const full = String(name == null ? '' : name).trim();
const cut = full.indexOf(': ');
const short = cut > 0 ? full.slice(cut + 2).trim() : full;
if (!short || short === full) return full;
const taken = new Set();
for (const f of this.menuFeatureDefs()) taken.add(f.name.toLowerCase());
taken.add('separator');
for (const v of Object.values(this.settings.menuAliases || {})) {
if (v) taken.add(String(v).toLowerCase());
}
return taken.has(short.toLowerCase()) ? full : short;
}
menuAliasOf(id) {
const saved = (this.settings.menuAliases || {})[id];
if (saved) return saved;
const cmd = this.menuCommandFor(id);
if (cmd && cmd.name) return this.menuDefaultAlias(cmd.name);
return this.menuCommandId(id) || id;
}
menuCommandName(id) {
const cmd = this.menuCommandFor(id);
return (cmd && cmd.name) ? cmd.name : (this.menuCommandId(id) || id);
}
menuPinCommand(cid) {
const id = 'cmd:' + cid;
const ids = this.menuLayout();
if (!ids.includes(id)) ids.push(id);
this.settings.menuOrder = ids;
this.settings.menuHidden =
(this.settings.menuHidden || []).filter(h => h !== id);
return id;
}
menuSetAlias(id, alias) {
const map = this.settings.menuAliases || {};
const val = String(alias == null ? '' : alias).trim();
if (val) map[id] = val; else delete map[id];
this.settings.menuAliases = map;
}
menuUnpin(id) {
this.settings.menuOrder = this.menuLayout().filter(x => x !== id);
this.settings.menuHidden = (this.settings.menuHidden || []).filter(h => h !== id);
const map = this.settings.menuAliases || {};
delete map[id];
this.settings.menuAliases = map;
this.menuSetJoined(id, false);
}
menuRuleStyle(id) {
const v = (this.settings.menuRuleStyles || {})[id];
return MENU_RULE_STYLES.includes(v) ? v : 'solid';
}
menuSetRuleStyle(id, style) {
const map = this.settings.menuRuleStyles || {};
if (MENU_RULE_STYLES.includes(style) && style !== 'solid') map[id] = style;
else delete map[id];
this.settings.menuRuleStyles = map;
}
menuDeleteRule(id) {
this.settings.menuOrder = this.menuLayout().filter(x => x !== id);
this.settings.menuHidden =
(this.settings.menuHidden || []).filter(h => h !== id);
const map = this.settings.menuRuleStyles || {};
delete map[id];
this.settings.menuRuleStyles = map;
}
menuRowSpecs() {
const plugin = this;
return [
{ id: 'modes', label: 'Modes', items: () => plugin.modesPickerItems() },
{ id: 'syntax', label: 'Syntax', items: () => plugin.syntaxPickerItems() },
{ id: 'prose', label: 'Prose', items: () => plugin.checksPickerItems() },
{ id: 'markers', label: 'Markers', items: () => plugin.markersPickerItems() },
{ id: 'font', label: 'Font', items: () => plugin.fontPickerItems(), count: false },
{
id: 'lightdark',
label: () => plugin.isDarkTheme() ? 'Dark' : 'Light',
keywords: 'light dark mode appearance',
toggle: () => plugin.barSetColorMode(!plugin.isDarkTheme())
},
{ id: 'theme', label: 'Theme', items: () => plugin.themesPickerItems(), count: false },
{ id: 'report', label: 'Report', wide: true, reopen: true,
run: () => plugin.openReportModal() },
{ id: 'history', label: 'History', wide: true, reopen: true,
run: () => plugin.openHistoryModal() },
{ id: 'export', label: 'Export', wide: true, reopen: true,
run: () => plugin.openExportModal() },
{ id: 'organizer', label: 'Organizer', wide: true, reopen: true,
run: () => plugin.orgOpenTab('organizer') },
];
}
rememberActiveMarkdown() {
try {
const v = this.app.workspace.getActiveViewOfType(MarkdownView);
if (v && v.file) this._lastMdView = v;
} catch (_) { zgCatch('rememberActiveMarkdown: const v = this.app.workspace.getActiveViewOfType(MarkdownView);', _); }
}
activeMarkdownView() {
try {
const v = this.app.workspace.getActiveViewOfType(MarkdownView);
if (v && v.file) { this._lastMdView = v; return v; }
} catch (_) { zgCatch('activeMarkdownView: const v = this.app.workspace.getActiveViewOfType(MarkdownView);', _); }
const last = this._lastMdView;
if (last && last.file) {
try {
const alive = this.app.workspace.getLeavesOfType('markdown')
.some(l => l.view === last);
if (alive) return last;
} catch (_) { return last; }
}
return null;
}
activeNoteFile() {
const v = this.activeMarkdownView();
if (v && v.file) return v.file;
try { return this.app.workspace.getActiveFile() || null; } catch (_) { return null; }
}
registerWsIcon() {
if (!addIcon || this._wsIconDone) return;
this._wsIconDone = true;
try {
addIcon(WS_ICON,
'<text x="50" y="76" text-anchor="middle" fill="currentColor" '
+ 'font-size="84" font-weight="500" '
+ 'font-family="\'Iowan Old Style\', Georgia, \'Times New Roman\', '
+ '\'Liberation Serif\', serif">W</text>');
} catch (_) { zgCatch('registerWsIcon: addIcon(WS_ICON,', _); }
}
leafHost(view) {
const teardowns = [];
return {
kind: 'leaf',
view,
rootEl: view.containerEl,
contentEl: view.contentEl,
closes: false,
paneClass: 'zg-uni-pane',
key: (mods, k, fn) => {
const want = Array.isArray(mods) ? mods : [];
const handler = (ev) => {
if (ev.key !== k) return;
const mod = ev.ctrlKey || ev.metaKey;
if (mod !== (want.indexOf('Mod') !== -1)) return;
if (ev.shiftKey !== (want.indexOf('Shift') !== -1)) return;
if (ev.altKey !== (want.indexOf('Alt') !== -1)) return;
if (fn(ev) === false) ev.preventDefault();
};
view.containerEl.addEventListener('keydown', handler);
teardowns.push(() => {
try { view.containerEl.removeEventListener('keydown', handler); } catch (_) { zgCatch('leafHost / key: view.containerEl.removeEventListener(\'keydown\', handler);', _); }
});
},
contains: (el) => {
try { return !!(view.containerEl && view.containerEl.contains(el)); }
catch (_) { return false; }
},
onClose: (fn) => { teardowns.push(fn); },
teardown: () => { for (const t of teardowns) { try { t(); } catch (_) { zgCatch('leafHost: t();', _); } } },
show: () => {},
handle: () => view
};
}
registerOutlinerPane() {
if (!WsOutlinerView || this._outlinerPaneRegistered) return;
try {
for (const id of Object.keys(WS_PANE_VIEWS)) {
const Cls = WS_PANE_CLASSES[id];
if (Cls) this.registerView(WS_PANE_VIEWS[id], (leaf) => new Cls(leaf, this));
}
this._outlinerPaneRegistered = true;
} catch (_) { zgCatch('registerOutlinerPane: this.registerView(WS_OUTLINER_VIEW, (leaf) => new WsOutlinerView(leaf, …', _); }
}
outlinerPaneLeaves(tabId) {
const type = WS_PANE_VIEWS[tabId || 'organizer'] || WS_OUTLINER_VIEW;
try { return this.app.workspace.getLeavesOfType(type) || []; }
catch (_) { return []; }
}
async openOutlinerPane(tabId) {
if (!WsOutlinerView) return null;
const type = WS_PANE_VIEWS[tabId || 'organizer'] || WS_OUTLINER_VIEW;
this.registerOutlinerPane();
let leaf = this.outlinerPaneLeaves(tabId)[0];
if (!leaf) {
try {
const sibling = Object.keys(WS_PANE_VIEWS).map((t) => this.outlinerPaneLeaves(t)[0]).filter(Boolean)[0];
const ws = this.app.workspace;
if (sibling && sibling.parent && typeof ws.createLeafInParent === 'function') {
leaf = ws.createLeafInParent(sibling.parent, sibling.parent.children.length);
} else {
leaf = ws.getLeaf('split', 'vertical');
}
if (leaf) await leaf.setViewState({ type, active: true });
} catch (_) { return null; }
}
try { this.app.workspace.revealLeaf(leaf); } catch (_) { zgCatch('openOutlinerPane: this.app.workspace.revealLeaf(leaf);', _); }
return leaf;
}
async openOutlinerPopout() {
const leaf = await this.openOutlinerPane();
if (!leaf) return null;
const w = this.app.workspace;
try {
if (typeof w.moveLeafToPopout === 'function') {
const out = w.moveLeafToPopout(leaf);
void out;
return leaf;
}
} catch (_) { zgCatch('openOutlinerPopout: if (typeof w.moveLeafToPopout === \'function\')', _); }
try {
if (typeof w.openPopoutLeaf === 'function') {
const pl = await w.openPopoutLeaf();
if (pl) {
await pl.setViewState({ type: WS_OUTLINER_VIEW, active: true });
try { if (pl !== leaf) leaf.detach(); } catch (_) { zgCatch('openOutlinerPopout: if (pl !== leaf) leaf.detach();', _); }
return pl;
}
}
} catch (_) { zgCatch('openOutlinerPopout: if (typeof w.openPopoutLeaf === \'function\')', _); }
return leaf;
}
registerMenuPanel() {
if (!WsMenuView || this._menuPanelRegistered) return;
try {
this.registerView(WS_MENU_VIEW, (leaf) => new WsMenuView(leaf, this));
this._menuPanelRegistered = true;
} catch (_) { zgCatch('registerMenuPanel: this.registerView(WS_MENU_VIEW, (leaf) => new WsMenuView(leaf, this));', _); }
}
rememberMenuPanelSpot() {
const leaf = this.menuPanelLeaves()[0];
if (!leaf) return;
this._panelWasOpen = true;
this._panelSide = 'left';
try {
const root = leaf.getRoot && leaf.getRoot();
if (root && root === this.app.workspace.rightSplit) this._panelSide = 'right';
} catch (_) { zgCatch('rememberMenuPanelSpot: const root = leaf.getRoot && leaf.getRoot();', _); }
}
async restoreMenuPanelSpot() {
if (!this._panelWasOpen || !this.settings.menuDock) return;
this._panelWasOpen = false;
try {
const leaf = this._panelSide === 'right'
? this.app.workspace.getRightLeaf(false)
: this.app.workspace.getLeftLeaf(false);
if (leaf) await leaf.setViewState({ type: WS_MENU_VIEW, active: false });
} catch (_) { zgCatch('restoreMenuPanelSpot: const leaf = this._panelSide === \'right\'', _); }
}
menuPanelLeaves() {
try { return this.app.workspace.getLeavesOfType(WS_MENU_VIEW) || []; }
catch (_) { return []; }
}
async openMenuPanel(reveal) {
if (!WsMenuView || this.settings.menuDock === false) return null;
this.registerMenuPanel();
let leaf = this.menuPanelLeaves()[0];
if (!leaf) {
try {
leaf = this.app.workspace.getLeftLeaf(false);
if (leaf) await leaf.setViewState({ type: WS_MENU_VIEW, active: true });
} catch (_) { return null; }
}
if (leaf && reveal) { try { this.app.workspace.revealLeaf(leaf); } catch (_) { zgCatch('openMenuPanel: this.app.workspace.revealLeaf(leaf);', _); } }
return leaf;
}
closeMenuPanel() {
for (const leaf of this.menuPanelLeaves()) {
try { leaf.detach(); } catch (_) { zgCatch('closeMenuPanel: leaf.detach();', _); }
}
}
refreshMenuPanels() {
if (this._panelPointerDown) { this._panelRefreshPending = true; return; }
this.refreshMenuPanelsNow();
}
rebuildMenuPanels() {
for (const leaf of this.menuPanelLeaves()) {
try { if (leaf.view && leaf.view.render) leaf.view.render(); } catch (_) { zgCatch('rebuildMenuPanels: if (leaf.view && leaf.view.render) leaf.view.render();', _); }
}
}
refreshMenuPanelsNow() {
let file = null;
try {
const v = this.activeMarkdownView();
file = v && v.file ? v.file.path : null;
} catch (_) { zgCatch('refreshMenuPanelsNow: const v = this.activeMarkdownView();', _); }
void file;
for (const leaf of this.menuPanelLeaves()) {
try {
const v = leaf.view;
if (v && v.refreshStates) v.refreshStates();
} catch (_) { zgCatch('refreshMenuPanelsNow: const v = leaf.view;', _); }
}
}
openBarMenu() {
const plugin = this;
const modal = this.wsModal();
modal.modalEl.addClass('zg-menu-modal');
try { modal.containerEl.addClass('zg-menu-container'); } catch (_) { zgCatch('openBarMenu: modal.containerEl.addClass(\'zg-menu-container\');', _); }
try { modal.bgEl.style.backgroundColor = 'transparent'; } catch (_) { zgCatch('openBarMenu: modal.bgEl.style.backgroundColor = \'transparent\';', _); }
modal.contentEl.addClass('zg-menu-content');
const list = modal.contentEl.createDiv({ cls: 'zg-menu-list' });
if (plugin.menuBands().some(b => b.length > 1)) {
try { modal.modalEl.addClass('is-tabular'); } catch (_) { zgCatch('openBarMenu: modal.modalEl.addClass(\'is-tabular\');', _); }
}
const search = zgMenuSearchInto(list);
const layout = plugin.menuVisibleLayout();
const searchShown = layout.includes('search');
if (!searchShown) (search.parentElement || search).style.display = 'none';
const FEATURES = plugin.menuRowSpecs();
const rowFor = (id) => {
const feat = FEATURES.find(f => f.id === id);
if (feat) return feat;
if (!plugin.menuIsCommand(id)) return null;
const cmd = plugin.menuCommandFor(id);
if (!cmd) return null;
const full = plugin.menuCommandName(id);
const cut = full.indexOf(': ');
return {
id,
label: plugin.menuAliasOf(id),
full,
keywords: full + ' ' + (cut > 0 ? full.slice(0, cut) : ''),
wide: true,
run: () => {
try { plugin.app.commands.executeCommandById(plugin.menuCommandId(id)); }
catch (_) { zgCatch('openBarMenu / run: plugin.app.commands.executeCommandById(plugin.menuCommandId(id));', _); }
}
};
};
const ROWS = layout.map(rowFor).filter(Boolean);
const RI = {};
ROWS.forEach((r, i) => { RI[r.id] = i; });
let open = -1;
let at = 0;
let flat = [];
const rowLabel = (row) =>
(typeof row.label === 'function' ? row.label() : row.label);
const clearList = () => {
for (const el of Array.from(list.children)) {
if (el !== search && !el.contains(search)) el.remove();
}
};
const render = () => {
clearList();
flat = [];
let pastSearch = !searchShown;
const searchBox = (search.parentElement && search.parentElement !== list)
? search.parentElement : search;
const place = (el) => { if (!pastSearch) list.insertBefore(el, searchBox); };
const q = (search.value || '').trim().toLowerCase();
if (q) {
const hits = [];
ROWS.forEach((row, ri) => {
if (row.run || row.toggle) {
const label = rowLabel(row);
const sc = Math.max(
barMenuFuzzy(q, label),
row.keywords ? barMenuFuzzy(q, row.keywords) - 1 : -1);
if (sc >= 0) hits.push({ sc, row: label, kind: 'row', ri });
}
if (!row.items) return;
for (const item of row.items()) {
const sc = Math.max(
barMenuFuzzy(q, item.label),
barMenuFuzzy(q, row.label + ' ' + item.label) - 2);
if (sc >= 0) hits.push({ sc, row: row.label, kind: 'item', item });
}
});
hits.sort((a, b) => b.sc - a.sc);
for (const h of hits.slice(0, 12)) {
const isOn = h.kind === 'item'
&& (typeof h.item.on === 'function' ? h.item.on() : h.item.on);
const sub = list.createDiv({
cls: 'zg-menu-sub zg-picker-row zg-menu-result'
+ (h.kind === 'item' && !isOn ? ' is-off' : '')
});
if (h.kind === 'item' && h.item.color) {
const dot = sub.createSpan({ cls: 'zg-picker-dot' });
if (h.item.color !== 'currentColor') dot.style.backgroundColor = h.item.color;
}
sub.createSpan({ cls: 'zg-picker-label',
text: h.kind === 'row' ? h.row : h.item.label });
if (h.kind === 'item') sub.createSpan({ cls: 'zg-menu-in', text: h.row });
const entry = h.kind === 'row'
? { el: sub, kind: 'row', ri: h.ri }
: { el: sub, kind: 'item', item: h.item };
flat.push(entry);
sub.addEventListener('click', () => {
at = flat.indexOf(entry); activate();
});
}
if (!flat.length) {
list.createDiv({ cls: 'zg-menu-empty', text: 'Nothing matches' });
}
at = Math.min(at, Math.max(0, flat.length - 1));
paint();
return;
}
plugin.menuBands().forEach((band) => {
if (band.length === 1 && band[0] === 'search') { pastSearch = true; return; }
const multi = band.length > 1;
let bandEl = null;
if (multi) {
bandEl = list.createDiv({ cls: 'zg-menu-band' });
try { bandEl.style.setProperty('--zg-menu-cells', String(band.length)); } catch (_) { zgCatch('openBarMenu / render: bandEl.style.setProperty(\'--zg-menu-cells\', String(band.length));', _); }
place(bandEl);
}
const drawers = [];
band.forEach((id) => {
if (id === 'search') { pastSearch = true; return; }
{
if (/^rule-\d+$/.test(id)) {
place(list.createDiv({
cls: 'zg-menu-rule is-' + plugin.menuRuleStyle(id)
}));
return;
}
const ri = RI[id];
if (ri == null) return;
const row = ROWS[ri];
const el = (bandEl || list).createDiv({
cls: 'zg-menu-row' + (row.wide && !multi ? ' is-wide' : '')
+ (multi ? ' zg-menu-cell' : '')
});
if (!multi) place(el);
if (row.full) {
el.setAttribute('title', row.full);
el.setAttribute('aria-label', row.full);
}
plugin.menuDrawIcon(el, id);
el.createSpan({ cls: 'zg-menu-label', text: rowLabel(row) });
if (row.items && row.count !== false) {
const its = row.items();
const on = its.filter(i => (typeof i.on === 'function' ? i.on() : i.on)).length;
el.createSpan({ cls: 'zg-menu-state', text: on ? String(on) + ' on' : 'off' });
} else if (row.items) {
const cur = row.items().find(i => (typeof i.on === 'function' ? i.on() : i.on));
if (cur) el.createSpan({ cls: 'zg-menu-state', text: cur.label });
}
flat.push({ el, kind: 'row', ri, band: bandEl });
el.addEventListener('click', () => { at = flat.findIndex(f => f.el === el); activate(); });
if (open === ri && row.items) {
for (const item of row.items()) {
const isOn = (typeof item.on === 'function' ? item.on() : item.on);
const sub = list.createDiv({
cls: 'zg-menu-sub zg-picker-row' + (isOn ? '' : ' is-off')
});
drawers.push(sub);
if (item.color) {
const dot = sub.createSpan({ cls: 'zg-picker-dot' });
if (item.color !== 'currentColor') dot.style.backgroundColor = item.color;
}
if (item.icon) {
const ic = item.icon();
ic.classList.add('zg-picker-icon');
sub.appendChild(ic);
}
const lab = sub.createSpan({ cls: 'zg-picker-label', text: item.label });
if (item.font) lab.style.fontFamily = item.font;
flat.push({ el: sub, kind: 'item', item });
sub.addEventListener('click', () => {
at = flat.findIndex(f => f.el === sub); activate();
});
}
}
}
});
if (drawers.length) {
const box = list.createDiv({ cls: 'zg-menu-drawer' });
for (const d of drawers) box.appendChild(d);
place(box);
}
if (bandEl) bandEl.toggleClass('is-open', drawers.length > 0);
});
paint();
};
const paint = () => {
flat.forEach((f, i) => f.el.toggleClass('is-active', i === at));
const cur = flat[at];
if (cur && cur.el && cur.el.scrollIntoView) {
try { cur.el.scrollIntoView({ block: 'nearest' }); } catch (_) { zgCatch('openBarMenu / paint: cur.el.scrollIntoView( block: \'nearest\' );', _); }
}
};
const activate = async () => {
const cur = flat[at];
if (!cur) return;
if (cur.kind === 'item') {
if (cur.item.onClick) await cur.item.onClick();
const keep = at;
render();
at = Math.min(keep, flat.length - 1);
paint();
return;
}
const row = ROWS[cur.ri];
if (row.toggle) {
row.toggle();
const keep = at;
render();
at = Math.min(keep, flat.length - 1);
paint();
return;
}
if (row.run) {
modal.close();
const opened = row.run();
if (row.reopen && opened && typeof opened === 'object') {
let came = false;
const back = () => {
if (came) return;
came = true;
plugin.openBarMenu();
};
const prevOnClose = opened.onClose;
opened.onClose = function () {
try { if (prevOnClose) prevOnClose.apply(this, arguments); }
finally { back(); }
};
const prevClose = opened.close;
if (typeof prevClose === 'function') {
opened.close = function () {
try { return prevClose.apply(this, arguments); }
finally { back(); }
};
}
}
return;
}
open = (open === cur.ri) ? -1 : cur.ri;
const keep = cur.ri;
render();
at = flat.findIndex(f => f.kind === 'row' && f.ri === keep);
paint();
};
const lines = () => {
const out = [];
let cur = null, curBand = undefined;
flat.forEach((f, i) => {
const b = f.band || null;
if (b && b === curBand) { cur.push(i); return; }
cur = [i]; curBand = b; out.push(cur);
});
return out;
};
const wheresAt = (ls) => {
for (let r = 0; r < ls.length; r++) {
const c = ls[r].indexOf(at);
if (c >= 0) return { r, c };
}
return { r: 0, c: 0 };
};
const move = (d) => {
const ls = lines();
if (!ls.length) return;
const { r, c } = wheresAt(ls);
const nr = Math.max(0, Math.min(r + d, ls.length - 1));
const line = ls[nr];
at = line[Math.min(c, line.length - 1)];
paint();
};
const sideways = (d, fallback) => {
const cur = flat[at];
if (cur && cur.kind === 'item') {
let lo = at, hi = at;
while (lo > 0 && flat[lo - 1].kind === 'item') lo--;
while (hi < flat.length - 1 && flat[hi + 1].kind === 'item') hi++;
const nx = at + d;
if (nx < lo) { fallback(); return; }
if (nx > hi) return;
at = nx;
paint();
return;
}
const ls = lines();
const { r, c } = wheresAt(ls);
const line = ls[r] || [];
if (line.length < 2) { fallback(); return; }
const nc = c + d;
if (nc < 0 || nc >= line.length) { fallback(); return; }
at = line[nc];
paint();
};
const collapse = () => {
if (open === -1) return false;
const keep = open; open = -1; render();
at = flat.findIndex(f => f.kind === 'row' && f.ri === keep);
paint();
return true;
};
const typing = () => document.activeElement === search;
const vimKeys = () => plugin.isVimKeysOn();
const letter = (fn) => () => {
if (typing() || !vimKeys()) return true;
fn(); return false;
};
const always = (fn) => () => { fn(); return false; };
modal.scope.register([], 'ArrowDown', always(() => move(1)));
modal.scope.register([], 'ArrowUp', always(() => move(-1)));
const enterDrawer = () => {
const cur = flat[at];
if (!cur || cur.kind !== 'row' || open !== cur.ri) return;
for (let i = at + 1; i < flat.length; i++) {
if (flat[i].kind === 'item') { at = i; paint(); return; }
if (flat[i].kind === 'row') return;
}
};
modal.scope.register([], 'ArrowRight', always(() => sideways(1, enterDrawer)));
modal.scope.register([], 'ArrowLeft', always(() => sideways(-1, collapse)));
modal.scope.register([], 'j', letter(() => move(1)));
modal.scope.register([], 'k', letter(() => move(-1)));
modal.scope.register([], 'l', letter(() => sideways(1, enterDrawer)));
modal.scope.register([], 'h', letter(() => sideways(-1, collapse)));
modal.scope.register([], 'Enter', () => { activate(); return false; });
modal.scope.register([], ' ', () => {
if (typing() || !vimKeys()) return true;
activate(); return false;
});
modal.scope.register(['Mod'], 'j', () => { move(1); return false; });
modal.scope.register(['Mod'], 'k', () => { move(-1); return false; });
const onEsc = (e) => {
if (e.key !== 'Escape') return;
if (ZG_MENU_ESC !== onEsc) return;
const stop = () => {
e.preventDefault();
e.stopPropagation();
if (e.stopImmediatePropagation) e.stopImmediatePropagation();
};
if ((search.value || '').trim()) {
stop();
search.value = ''; at = 0; render();
try { search.focus(); } catch (_) { zgCatch('openBarMenu / onEsc: search.focus();', _); }
return;
}
if (collapse()) { stop(); return; }
stop();
modal.close();
};
document.addEventListener('keydown', onEsc, true);
ZG_MENU_ESC = onEsc;
try {
if (modal.scope && Array.isArray(modal.scope.keys)) {
modal.scope.keys = modal.scope.keys.filter(k => k && k.key !== 'Escape');
}
} catch (_) { zgCatch('openBarMenu: if (modal.scope && Array.isArray(modal.scope.keys))', _); }
modal.scope.register([], 'Escape', () => {
onEsc({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
return false;
});
search.addEventListener('input', () => { at = 0; render(); });
modal.onClose = () => {
try { document.removeEventListener('keydown', onEsc, true); } catch (_) { zgCatch('openBarMenu: document.removeEventListener(\'keydown\', onEsc, true);', _); }
if (ZG_MENU_ESC === onEsc) ZG_MENU_ESC = null;
try { document.body.classList.remove('zg-menu-open'); } catch (_) { zgCatch('openBarMenu: document.body.classList.remove(\'zg-menu-open\');', _); }
this.barThemeOnCssChange();
this.barThemeGuard();
};
modal.onOpen = () => {
try { document.body.classList.add('zg-menu-open'); } catch (_) { zgCatch('openBarMenu: document.body.classList.add(\'zg-menu-open\');', _); }
list.setAttribute('tabindex', '-1');
if (searchShown) { try { search.focus(); } catch (_) { list.focus(); } }
else { try { list.focus(); } catch (_) { zgCatch('openBarMenu: list.focus();', _); } }
};
render();
modal.open();
return modal;
}
fontPickerItems() {
const fonts = this.getConfiguredFonts();
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
return items;
}
barThemeById(id) {
for (const t of BAR_THEMES) if (t.id === id) return t;
return null;
}
barThemeShelf() {
const hidden = new Set(this.settings.barThemeHidden || []);
const known = new Map(BAR_THEMES.map(t => [t.id, t]));
const out = [];
for (const id of (this.settings.barThemeOrder || [])) {
if (known.has(id) && !hidden.has(id)) { out.push(known.get(id)); known.delete(id); }
}
for (const t of BAR_THEMES) {
if (known.has(t.id) && !hidden.has(t.id)) out.push(t);
}
return out;
}
barThemeMove(id, to) {
const ids = this.barThemeShelf().map(t => t.id);
const from = ids.indexOf(id);
if (from === -1) return false;
ids.splice(from, 1);
ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
this.settings.barThemeOrder = ids;
return true;
}
barThemeHide(id) {
const hidden = this.settings.barThemeHidden || [];
if (hidden.indexOf(id) === -1) hidden.push(id);
this.settings.barThemeHidden = hidden;
if (this.settings.barTheme === id) this.applyBarTheme('custom');
}
barThemeShow(id) {
this.settings.barThemeHidden =
(this.settings.barThemeHidden || []).filter(h => h !== id);
}
themesPickerItems() {
const live = this.settings.barTheme;
const items = [{
id: 'custom',
label: 'Default',
note: 'No scheme \u2014 the workspace is your Obsidian theme\u2019s.',
swatches: [],
on: live === 'custom',
onClick: async () => {
this.applyBarTheme('custom');
this.updateStatusBar();
await this.saveSettings();
}
}];
const half = this.isDarkTheme() ? 'dark' : 'light';
const one = (t) => ({
id: t.id,
label: (t.names && t.names[half]) || t.name,
note: t.note,
color: this.barThemeHalf(t).c1,
swatches: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']
.map(k => this.barThemeHalf(t)[k]),
on: live === t.id,
onClick: async () => {
this.settings.barThemeEnabled = true;
this.applyBarTheme(t.id);
this.updateStatusBar();
await this.saveSettings();
}
});
return items.concat(this.barThemeShelf().map(t => one(t)));
}
applyBarTheme(id) {
if (id !== 'custom' && !this.barThemeById(id)) return false;
this.settings.barTheme = id;
this.applyThemeClass();
this.applyThemeVars();
this.barThemeCursorSync();
return true;
}
applyThemeClass() {
const body = document.body;
if (!body || !body.classList) return;
const want = (name, on) => {
const has = body.classList.contains(name);
if (on && !has) body.classList.add(name);
else if (!on && has) body.classList.remove(name);
};
const id = this.settings.barTheme;
const wantTheme = (this.settings.barThemeEnabled !== false
&& id && id !== 'custom') ? 'zg-theme-' + id : null;
for (const c of Array.from(body.classList)) {
if (c.indexOf('zg-theme-') === 0 && c !== wantTheme) {
body.classList.remove(c);
}
}
if (wantTheme) want(wantTheme, true);
for (const shape of ['circle', 'square', 'retro', 'markdown']) {
want('zg-cb-' + shape,
this.settings.barThemeEnabled !== false
&& this.settings.barThemeCheckbox === shape);
}
want('zg-borderless',
this.settings.barThemeEnabled !== false && !!this.settings.barThemeBorderless);
want('zg-marginalia', false);
document.documentElement.style.removeProperty('--zg-marg-gutter');
want('zg-glass', false);
want('zg-simpletabs', false);
}
barSelectionInks(h) {
return [h.t1, h.t2, '#ffffff', '#000000'];
}
barSelectionInk(bg, h) {
const cands = this.barSelectionInks(h);
for (const ink of cands) {
if (this.barContrast(ink, bg) >= 4.5) return ink;
}
let best = cands[0], bestC = -1;
for (const ink of cands) {
const c = this.barContrast(ink, bg);
if (c > bestC) { bestC = c; best = ink; }
}
return best;
}
barDeepenSelection(hex, paperHex, inks, amount) {
const c = parseColorRGB(hex);
const paper = parseColorRGB(paperHex);
if (!c || !paper) return hex;
const hx = (v) => ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
const toward = (t, k) => {
const m = (v) => Math.round(v + (t - v) * k);
return '#' + hx(m(c[0])) + hx(m(c[1])) + hx(m(c[2]));
};
const pl = (paper[0] * 0.2126 + paper[1] * 0.7152 + paper[2] * 0.0722) / 255;
const target = pl > 0.5 ? 0 : 255;
const best = (bg) => Math.max(...(inks || []).map(i => this.barContrast(i, bg)));
const steps = amount != null ? [amount] : [0.26, 0.20, 0.15, 0.10, 0.06];
for (const k of steps) {
const cand = toward(target, k);
if (best(cand) >= 4.5) return cand;
}
return hex;
}
barContrast(a, b) {
const lum = (c) => {
const p = parseColorRGB(c);
if (!p) return 0;
const f = (v) => {
v /= 255;
return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
};
const la = lum(a), lb = lum(b);
return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
barThemeInkify(color, bg, ink) {
for (let t = 0; t <= 10; t++) {
const c = t === 0 ? color : mixColors(color, ink, t / 10);
if (this.barContrast(c, bg) >= 4.5) return c;
}
return ink;
}
barThemeVivify(color, bg, ink, fixedHue) {
const src = colorToHsl(color);
if (!src) return this.barThemeInkify(color, bg, ink);
let hue = src.h, sat = Math.max(src.s, 0.8);
if (src.s < 0.15) {
if (fixedHue == null) return this.barThemeInkify(color, bg, ink);
hue = fixedHue; sat = 0.8;
}
const darkBg = this.barContrast('#ffffff', bg) > this.barContrast('#000000', bg);
const ladder = darkBg
? [0.72, 0.66, 0.78, 0.60, 0.84, 0.55, 0.88]
: [0.34, 0.40, 0.30, 0.46, 0.26, 0.50, 0.22];
for (const l of ladder) {
const c = hslToHex(hue, sat, l);
if (this.barContrast(c, bg) >= 4.5) return c;
}
return this.barThemeInkify(color, bg, ink);
}
barThemeHighlight(h, surface) {
const inkFor = (bg) =>
(this.barContrast(h.t1, bg) >= this.barContrast(h.t2, bg)) ? h.t1 : h.t2;
const ok = (bg) => this.barContrast(bg, surface) >= 1.6
&& this.barContrast(inkFor(bg), bg) >= 4.5;
let best = null, bestSeen = -1;
for (const bg of [h.sel, h.c1, h.b4, h.b3]) {
const seen = this.barContrast(bg, surface);
if (seen > bestSeen) { bestSeen = seen; best = bg; }
if (ok(bg)) return { bg: bg, ink: inkFor(bg) };
}
for (let k = 0.12; k <= 1.0001; k += 0.06) {
const bg = mixColors(surface, h.t1, k);
if (ok(bg)) return { bg: bg, ink: inkFor(bg) };
}
return { bg: best, ink: inkFor(best) };
}
barThemeCursorInk(h) {
const named = h.cur || h.t4;
if (this.barContrast(named, h.b1) >= 4.5) return named;
return this.barThemeVivify(named, h.b1, h.t1);
}
barThemeVividFor(h) {
const sred = this.barThemeVivify(h.c7, h.b1, h.t1);
const rh = colorToHsl(sred);
if (rh && rh.s >= 0.45 && (rh.h >= 320 || rh.h <= 25)) return sred;
const chroma = (str) => {
const p = parseColorRGB(str);
return p ? (Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2])) / 255 : 0;
};
const bH = colorToHsl(h.b1), aH = colorToHsl(h.t4);
const ref = chroma(h.b1) >= 0.12 ? bH.h
: (chroma(h.t4) >= 0.12 ? aH.h : null);
const dist = (x, y) => {
const d = Math.abs(x - y) % 360;
return d > 180 ? 360 - d : d;
};
let best = null, bestScore = -1;
let grey = null, greyScore = -1;
for (const k of ['c1', 'c4', 'c5', 'c6', 'c7', 't4']) {
const c = this.barThemeVivify(h[k], h.b1, h.t1);
const hs = colorToHsl(c);
const sat = hs ? hs.s : 0;
if (sat >= 0.45 && ref != null) {
const score = dist(hs.h, ref) + sat;
if (score > bestScore) { bestScore = score; best = c; }
}
const gs = sat + this.barContrast(c, h.b1) / 1000;
if (gs > greyScore) { greyScore = gs; grey = c; }
}
return best || grey || h.t4;
}
barSetColorMode(dark) {
const name = dark ? 'obsidian' : 'moonstone';
try {
if (typeof this.app.changeTheme === 'function') {
this.app.changeTheme(name);
return true;
}
if (this.app.vault && this.app.vault.setConfig) {
this.app.vault.setConfig('theme', name);
if (this.app.workspace && this.app.workspace.trigger) {
this.app.workspace.trigger('css-change');
}
return true;
}
} catch (_) { zgCatch('barSetColorMode: if (typeof this.app.changeTheme === \'function\')', _); }
return false;
}
barThemeGlassRepay() {
if (this.settings.barThemeGlassStash === null
|| this.settings.barThemeGlassStash === undefined) return false;
try {
const vault = this.app && this.app.vault;
if (vault && vault.setConfig) {
vault.setConfig('translucency', !!this.settings.barThemeGlassStash);
}
} catch (_) { zgCatch('barThemeGlassRepay: const vault = this.app && this.app.vault;', _); }
this.settings.barThemeGlassStash = null;
return true;
}
barThemeGuard() {
if (this._themeGuarding) return false;
if (!this.settings || this.settings.barThemeEnabled === false) return false;
const id = this.settings.barTheme;
if (!id || id === 'custom') return false;
const keys = this._themeVarKeys || [];
if (!keys.length) return false;
let missing = false;
try {
for (const k of keys) {
if (!document.body.style.getPropertyValue(k)) { missing = true; break; }
}
if (!missing && !document.body.classList.contains('zg-theme-' + id)) missing = true;
} catch (_) { return false; }
if (!missing) return false;
this._themeGuarding = true;
try {
this.applyThemeClass();
this.applyThemeVars();
} catch (_) { zgCatch('barThemeGuard: this.applyThemeClass();', _); }
this._themeGuarding = false;
return true;
}
barThemeUndress() {
try {
const body = document.body.style;
for (const k of (this._themeVarKeys || [])) body.removeProperty(k);
for (const k of this.themeVarUniverse()) body.removeProperty(k);
this._themeVarKeys = [];
for (const cls of Array.from(document.body.classList)) {
if (cls.indexOf('zg-theme-') === 0) document.body.classList.remove(cls);
}
document.body.classList.remove('zg-borderless', 'zg-glass', 'zg-simpletabs');
for (const shape of ['circle', 'square', 'retro', 'pill']) {
document.body.classList.remove('zg-cb-' + shape);
}
} catch (_) { zgCatch('barThemeUndress: const body = document.body.style;', _); }
try { this.barThemeCursorSync('undress'); } catch (_) { zgCatch('barThemeUndress: this.barThemeCursorSync(\'undress\');', _); }
}
barThemeOnCssChange() {
this.applyThemeClass();
this.applyThemeVars();
const repaint = () => {
try {
this.applyCssVariables();
this.updateRetroStatusBar();
} catch (_) { zgCatch('barThemeOnCssChange / repaint: this.applyCssVariables();', _); }
};
repaint();
try { window.requestAnimationFrame(repaint); } catch (_) { zgCatch('barThemeOnCssChange: window.requestAnimationFrame(repaint);', _); }
this.refreshMenuPanels();
}
barThemeVars() {
if (this.settings.barThemeEnabled === false) return null;
const id = this.settings.barTheme;
if (!id || id === 'custom') return null;
const theme = this.barThemeById(id);
if (!theme) return null;
const h = this.barThemeHalf(theme);
if (!h) return null;
const st = this.settings;
const simp = !!st.barThemeSimplified;
const S2 = simp ? h.b1 : h.b2;
const S3 = simp ? h.b2 : h.b3;
const ink = (c) => this.barThemeInkify(c, h.b1, h.t1);
const viv = this.barThemeVividFor(h);
const inkFor = (bg) =>
(this.barContrast(h.t1, bg) >= this.barContrast(h.t2, bg)) ? h.t1 : h.t2;
const navBg = (this.barContrast(inkFor(h.c1), h.c1) >= 4.5) ? h.c1 : h.sel;
const selBg = (this.settings.barTheme === 'quiet')
? h.sel
: this.barDeepenSelection(h.sel, h.b1, this.barSelectionInks(h));
const navInk = inkFor(navBg);
const darkPaper = this.barContrast('#ffffff', h.b1)
> this.barContrast('#000000', h.b1);
const hi = this.barThemeHighlight(h, S2);
let zenTb = false;
try { zenTb = !!(this.zenActive() && this.settings.zenTitlebarMatch); }
catch (_) { zenTb = false; }
const tbBg = (simp || zenTb) ? h.b1 : h.b2;
const barBg = simp ? S2 : (h.bar || h.b3);
const barInk = this.barContrast(h.t3, barBg) >= 4.5
? h.t3
: [h.t1, h.t2, '#000000', '#ffffff'].reduce((best, c) =>
this.barContrast(c, barBg) > this.barContrast(best, barBg) ? c : best);
const onAccent = ['#000000', '#ffffff', h.t1, h.t2]
.reduce((best, c) =>
this.barContrast(c, h.t4) > this.barContrast(best, h.t4) ? c : best);
const v = {
'--background-primary': h.b1,
'--background-primary-alt': S2,
'--background-secondary': S2,
'--background-secondary-alt': S3,
'--background-modifier-border': h.b4,
'--background-modifier-border-hover': h.b4,
'--background-modifier-active-hover': h.b4,
'--background-modifier-form-field': h.b2,
'--text-normal': h.t1,
'--text-muted': h.t3,
'--text-faint': h.t3,
'--text-on-accent': onAccent,
'--text-accent': h.t4,
'--text-accent-hover': h.t4,
'--interactive-accent': h.t4,
'--interactive-accent-hover': h.c1,
'--interactive-normal': S2,
'--interactive-hover': S3,
'--status-bar-background': barBg,
'--status-bar-text-color': barInk,
'--status-bar-border-color': h.bar || h.b4,
'--zg-bar-rule-accent': h.t4,
'--modal-background': S2,
'--prompt-background': S2,
'color-scheme': darkPaper ? 'dark' : 'light',
'--zg-selected-bg': hi.bg,
'--zg-selected-ink': hi.ink,
'--titlebar-background': tbBg,
'--titlebar-background-focused': tbBg,
'--ribbon-background': simp ? h.b1 : h.b2,
'--tab-container-background': simp ? h.b1 : h.b2,
'--divider-color': h.b4,
'--scrollbar-thumb-bg': h.b4,
'--background-modifier-hover': S3,
'--nav-item-background-hover': S3,
'--nav-item-background-active': navBg,
'--nav-item-color-active': navInk,
'--text-selection': selBg,
'--zg-selection-bg': selBg,
'--zg-selection-ink':
(this.settings.barTheme === 'quiet')
? ((this.barContrast(h.t1, selBg) >= 4.5
|| this.barContrast(h.t1, selBg) >= this.barContrast(h.t2, selBg))
? h.t1 : h.t2)
: this.barSelectionInk(selBg, h),
'--text-highlight-bg': h.c5,
'--background-modifier-border-focus': h.t4,
'--list-marker-color': h.t3,
'--color-base-00': h.b1,
'--color-base-05': h.b1,
'--color-base-15': S2,
'--color-base-10': S2,
'--color-base-20': S2,
'--color-base-25': S3,
'--color-base-30': h.b4,
'--color-base-35': h.b4,
'--color-base-40': h.b4,
'--color-base-45': h.t3,
'--color-base-50': h.t3,
'--color-base-55': h.t3,
'--color-base-60': h.t3,
'--color-base-65': h.t1,
'--color-base-70': h.t1,
'--color-base-80': h.t1,
'--color-base-90': h.t1,
'--color-base-100': h.t1,
'--color-accent': h.t4,
'--color-accent-1': h.t4,
'--color-accent-2': h.c1,
'--bg1': h.b1,
'--bg2': S2,
'--bg3': S3,
'--ui1': h.b4,
'--ui2': h.b4,
'--ui3': h.t3,
'--tx1': h.t1,
'--tx2': h.t3,
'--tx3': h.t3,
'--tx4': h.t4,
'--ax1': h.c1,
'--ax2': h.t4,
'--ax3': h.t4,
'--sp1': h.b1,
'--mono0': h.b1
};
if (st.barThemeHeadings) {
v['--h1-color'] = h.t4;
v['--h2-color'] = ink(h.c7);
v['--h3-color'] = ink(h.c4);
v['--h4-color'] = ink(h.c5);
v['--h5-color'] = ink(h.c6);
v['--h6-color'] = h.t3;
}
if (st.barThemeCode) {
v['--code-background'] = S2;
v['--code-normal'] = h.t1;
v['--code-comment'] = h.t3;
v['--code-punctuation'] = h.t3;
v['--code-operator'] = h.t3;
v['--code-function'] = h.t4;
v['--code-keyword'] = ink(h.c7);
v['--code-tag'] = ink(h.c7);
v['--code-important'] = ink(h.c7);
v['--code-string'] = ink(h.c4);
v['--code-value'] = ink(h.c5);
v['--code-property'] = ink(h.c6);
}
if (st.barThemeMarkdown) {
v['--bold-color'] = viv;
v['--italic-color'] = this.barThemeVivify(h.c6, h.b1, h.t1);
v['--link-color'] = h.t4;
v['--link-color-hover'] = viv;
v['--link-external-color'] = this.barThemeVivify(h.c4, h.b1, h.t1);
v['--link-unresolved-color'] = h.t3;
v['--tag-color'] = this.barThemeVivify(h.c5, h.b1, h.t1);
v['--tag-background'] = S3;
v['--blockquote-border-color'] = h.t4;
v['--hr-color'] = h.b4;
v['--checklist-done-color'] = h.t3;
}
const out = {};
for (const k of Object.keys(v)) {
if (typeof v[k] === 'string'
&& (/^#[0-9a-f]{3,8}$/i.test(v[k])
|| /^rgb\(\d+, \d+, \d+\)$/.test(v[k])
|| /^\d+(\.\d+)?px$/.test(v[k])
|| v[k] === 'dark' || v[k] === 'light')) {
out[k] = v[k];
}
}
return Object.keys(out).length ? out : null;
}
themeVarUniverse() {
if (this._themeVarUniverse) return this._themeVarUniverse;
let keys = [];
try {
const shelf = this.barThemeShelf();
const first = (shelf && shelf[0]) || this.barThemeById('nord');
if (first) {
const st = this.settings;
this.settings = Object.assign({}, st, {
barThemeEnabled: true, barTheme: first.id,
barThemeHeadings: true, barThemeCode: true, barThemeMarkdown: true
});
const v = this.barThemeVars();
this.settings = st;
if (v) keys = Object.keys(v);
}
} catch (_) { keys = []; }
this._themeVarUniverse = keys;
return keys;
}
applyThemeVars() {
const body = document.body;
if (!body || !body.style) return;
const vars = this.barThemeVars();
const prev = this._themeVarKeys || [];
for (const k of prev) body.style.removeProperty(k);
this._themeVarKeys = [];
if (!vars) {
for (const k of this.themeVarUniverse()) body.style.removeProperty(k);
return;
}
for (const k of Object.keys(vars)) {
body.style.setProperty(k, vars[k]);
this._themeVarKeys.push(k);
}
}
barThemeHueInk(hue, h) {
const hh = ((hue % 360) + 360) % 360;
const darkBg = this.barContrast('#ffffff', h.b1) > this.barContrast('#000000', h.b1);
const ladder = darkBg
? [0.72, 0.66, 0.78, 0.60, 0.84, 0.55, 0.88]
: [0.34, 0.40, 0.30, 0.46, 0.26, 0.50, 0.22];
for (const l of ladder) {
const c = hslToHex(hh, 0.85, l);
if (this.barContrast(c, h.b1) >= 4.5) return c;
}
return h.t1;
}
barThemeVimInks(h) {
const chroma = (str) => {
const p = parseColorRGB(str);
return p ? (Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2])) / 255 : 0;
};
const grey = chroma(h.t4) < 0.12
&& ['c4', 'c5', 'c6', 'c7'].every(k => chroma(h[k]) < 0.12);
if (grey) {
const usable = [];
for (let t = 0; t <= 0.85; t += 0.05) {
const c = mixColors(h.t1, h.b1, t);
if (this.barContrast(c, h.b1) >= 4.5) usable.push(c);
}
const shades = [];
if (usable.length) {
for (let i = 0; i < 4; i++) {
shades.push(usable[Math.round(i * (usable.length - 1) / 3)]);
}
}
while (shades.length < 4) shades.push(h.t1);
return { normal: this.barThemeCursorInk(h),
replace: shades[0], insert: shades[1],
visual: shades[2], command: shades[3] };
}
const dist = (a, b) => {
const d = Math.abs(a - b) % 360;
return d > 180 ? 360 - d : d;
};
const placed = [];
const place = (slot, fixed) => {
const tries = [];
const sv = this.barThemeVivify(h[slot], h.b1, h.t1);
const sh = colorToHsl(sv);
if (sh && sh.s >= 0.15) tries.push(sh.h);
tries.push(fixed, fixed + 40, fixed - 40, fixed + 80, fixed - 80);
for (const cand of tries) {
const hh = ((cand % 360) + 360) % 360;
if (placed.every(p => dist(p, hh) >= 35)) {
placed.push(hh);
return this.barThemeHueInk(hh, h);
}
}
placed.push(fixed);
return this.barThemeHueInk(fixed, h);
};
return {
normal: this.barThemeCursorInk(h),
replace: place('c7', 5),
insert: place('c4', 130),
visual: place('c6', 275),
command: place('c5', 45)
};
}
barThemeCursorDefaults() {
return {
global: {
colorDark: '#39ff14', colorLight: '#333333',
gradientDark1: '#39ff14', gradientDark2: '#00d4ff',
gradientDark3: '#b14aff', gradientDark4: '#ff2e88',
gradientLight1: '#1f8a3b', gradientLight2: '#0077b6',
gradientLight3: '#7028c8', gradientLight4: '#c2185b'
},
vim: {
normal: { colorDark: '#4aa3ff', colorLight: '#1e6fd0' },
insert: { colorDark: '#39ff14', colorLight: '#2a7d2e' },
visual: { colorDark: '#f5a623', colorLight: '#b26a00' },
replace: { colorDark: '#ff3b3b', colorLight: '#b30000' },
command: { colorDark: '#c792ea', colorLight: '#7d3fbf' }
}
};
}
barThemeCursorCapture(obj, keys) {
const out = {};
for (const k of keys) {
out[k] = (k in obj) ? { had: true, v: obj[k] } : { had: false };
}
return out;
}
barThemeCursorRestoreInto(obj, snap) {
for (const k of Object.keys(snap)) {
if (snap[k].had) obj[k] = snap[k].v;
else delete obj[k];
}
}
async barThemeCursorSync(force) {
const GLOBAL_KEYS = ['colorDark', 'colorLight',
'gradientDark1', 'gradientDark2', 'gradientDark3', 'gradientDark4',
'gradientLight1', 'gradientLight2', 'gradientLight3', 'gradientLight4'];
const MODES = ['normal', 'insert', 'visual', 'replace', 'command'];
const undress = async (reason) => {
const stash = this.settings.barThemeCursorStash;
let cs2 = null;
try { cs2 = this.app && this.app.plugins && this.app.plugins.plugins
&& this.app.plugins.plugins['cursor-smith']; } catch (_) { zgCatch('barThemeCursorSync / undress', _); }
if (!cs2 || !cs2.settings || cs2._settingsSwapped) return reason;
if (stash) {
if (stash.global) this.barThemeCursorRestoreInto(cs2.settings, stash.global);
if (stash.vim && cs2.settings.vimModes) {
for (const mode of Object.keys(stash.vim)) {
const m = cs2.settings.vimModes[mode];
if (m) this.barThemeCursorRestoreInto(m, stash.vim[mode]);
}
}
this.settings.barThemeCursorStash = null;
this.settings.barThemeCursorDressed = false;
try { await cs2.saveSettings(); } catch (_) { zgCatch('barThemeCursorSync / undress: await cs2.saveSettings();', _); }
return reason;
}
const wearsOurs = () => {
const cur = cs2.settings && cs2.settings.colorDark;
if (!cur) return false;
for (const t of BAR_THEMES) {
if (this.barThemeCursorInk(t.dark) === cur) return true;
if (this.barThemeCursorInk(t.light) === cur) return true;
}
return false;
};
if (!this.settings.barThemeCursorDressed && !wearsOurs()) return reason;
const def = this.barThemeCursorDefaults();
for (const k of Object.keys(def.global)) cs2.settings[k] = def.global[k];
if (cs2.settings.vimModes) {
for (const mode of Object.keys(def.vim)) {
const m = cs2.settings.vimModes[mode];
if (!m) continue;
for (const k of Object.keys(def.vim[mode])) m[k] = def.vim[mode][k];
}
}
this.settings.barThemeCursorDressed = false;
try { await cs2.saveSettings(); } catch (_) { zgCatch('barThemeCursorSync / undress: await cs2.saveSettings();', _); }
return reason;
};
if (force === 'undress') return undress('undressed');
if (this.settings.barThemeEnabled === false) return undress('disabled');
const wantCursor = !!this.settings.barThemeCursor;
const wantVim = wantCursor && !!this.settings.barThemeVim;
if (!wantCursor) return undress('off');
const id = this.settings.barTheme;
if (!id || id === 'custom') return undress('custom');
const theme = this.barThemeById(id);
if (!theme) return undress('custom');
let cs = null;
try { cs = this.app && this.app.plugins && this.app.plugins.plugins
&& this.app.plugins.plugins['cursor-smith']; } catch (_) { zgCatch('barThemeCursorSync: await cs2.saveSettings();', _); }
if (!cs || !cs.settings) return 'absent';
if (cs._settingsSwapped) return 'swapped';
if (!this.settings.barThemeCursorStash) {
const stash = { global: this.barThemeCursorCapture(cs.settings, GLOBAL_KEYS) };
if (cs.settings.vimModes && typeof cs.settings.vimModes === 'object') {
stash.vim = {};
for (const mode of MODES) {
const m = cs.settings.vimModes[mode];
if (m && typeof m === 'object') {
stash.vim[mode] = this.barThemeCursorCapture(m, GLOBAL_KEYS);
}
}
}
this.settings.barThemeCursorStash = stash;
}
if (this.settings.barThemeCursorStash.vim && cs.settings.vimModes) {
for (const mode of MODES) {
const m = cs.settings.vimModes[mode];
if (m && typeof m === 'object' && !this.settings.barThemeCursorStash.vim[mode]) {
this.settings.barThemeCursorStash.vim[mode] =
this.barThemeCursorCapture(m, GLOBAL_KEYS);
}
}
}
this.settings.barThemeCursorDressed = true;
if (!wantVim && this.settings.barThemeCursorStash.vim
&& cs.settings.vimModes) {
for (const mode of Object.keys(this.settings.barThemeCursorStash.vim)) {
const m = cs.settings.vimModes[mode];
if (m) this.barThemeCursorRestoreInto(m,
this.settings.barThemeCursorStash.vim[mode]);
}
delete this.settings.barThemeCursorStash.vim;
}
const d = theme.dark, l = theme.light;
const inkD = (c) => this.barThemeInkify(c, d.b1, d.t1);
const inkL = (c) => this.barThemeInkify(c, l.b1, l.t1);
const vivD = (c, hue) => this.barThemeVivify(c, d.b1, d.t1, hue);
const vivL = (c, hue) => this.barThemeVivify(c, l.b1, l.t1, hue);
const loudD = this.barThemeCursorInk(d);
const loudL = this.barThemeCursorInk(l);
if (wantCursor) {
cs.settings.colorDark = loudD;
cs.settings.colorLight = loudL;
cs.settings.gradientDark1 = loudD;
cs.settings.gradientDark2 = vivD(d.c4);
cs.settings.gradientDark3 = vivD(d.c7);
cs.settings.gradientDark4 = vivD(d.c6);
cs.settings.gradientLight1 = loudL;
cs.settings.gradientLight2 = vivL(l.c4);
cs.settings.gradientLight3 = vivL(l.c7);
cs.settings.gradientLight4 = vivL(l.c6);
}
const vmD = this.barThemeVimInks(d);
const vmL = this.barThemeVimInks(l);
if (wantVim && cs.settings.vimModes && typeof cs.settings.vimModes === 'object') {
for (const mode of ['normal', 'insert', 'visual', 'replace', 'command']) {
const m = cs.settings.vimModes[mode];
if (!m || typeof m !== 'object') continue;
const cd = vmD[mode], cl = vmL[mode];
m.colorDark = cd;
m.colorLight = cl;
m.gradientDark1 = cd;
m.gradientDark2 = vmD.insert;
m.gradientDark3 = vmD.replace;
m.gradientDark4 = vmD.visual;
m.gradientLight1 = cl;
m.gradientLight2 = vmL.insert;
m.gradientLight3 = vmL.replace;
m.gradientLight4 = vmL.visual;
}
}
try { await cs.saveSettings(); } catch (_) { zgCatch('barThemeCursorSync: await cs.saveSettings();', _); }
return 'synced';
}
barThemeHalf(theme) {
return this.isDarkTheme() ? theme.dark : theme.light;
}
openFontPicker(anchor) {
this.openPickerLive(anchor, this.fontPickerItems(), 'choose');
}
openThemePicker(anchor) {
this.openPickerLive(anchor, this.themesPickerItems(), 'choose');
}
getSyntaxCategories() {
return [
{ key: 'posNoun', color: 'posNounColor', label: 'Nouns' },
{ key: 'posVerb', color: 'posVerbColor', label: 'Verbs' },
{ key: 'posAdverb', color: 'posAdverbColor', label: 'Adverbs' },
{ key: 'posAdjective', color: 'posAdjectiveColor', label: 'Adjectives' },
{ key: 'posConjunction', color: 'posConjunctionColor', label: 'Conjunctions' }
];
}
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
syntaxPickerItems() {
const s = this.settings;
const items = this.getSyntaxCategories().map(c => ({
label: c.label,
color: s[c.color],
on: () => !!(s.posEnabled && s[c.key]),
onClick: async () => {
s[c.key] = !s[c.key];
if (s[c.key]) s.posEnabled = true;
else if (!this.getSyntaxCategories().some(x => s[x.key])) s.posEnabled = false;
await this.saveSettings(true);
}
}));
return items;
}
openSyntaxPicker(anchor) {
this.openPickerLive(anchor, this.syntaxPickerItems(), 'toggle');
}
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
getWriteChecks() {
return [
{ key: 'checkFiller', color: 'checkFillerColor', label: 'Filler words' },
{ key: 'checkPassive', color: 'checkPassiveColor', label: 'Passive voice' },
{ key: 'checkPronoun', color: 'checkPronounColor', label: 'Loose pronouns' },
{ key: 'checkRepetition', color: 'checkRepetitionColor', label: 'Repetition radar' },
{ key: 'checkMisused', color: 'checkMisusedColor', label: 'Commonly misused' },
{ key: 'checkIllusion', color: 'checkIllusionColor', label: 'Lexical illusions' },
{ key: 'checkDialogue', color: 'checkDialogueColor', label: 'Dialogue Focus' },
{ key: 'checkRhythm', color: 'checkRhythmHardColor', label: 'Sentence rhythm',
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
checksPickerItems() {
const s = this.settings;
const items = this.getWriteChecks().map(c => ({
label: c.label,
color: c.swatch === 'text' ? 'currentColor' : s[c.color],
on: () => !!(s.checksEnabled && s[c.key]),
onClick: async () => {
s[c.key] = !s[c.key];
if (s[c.key]) s.checksEnabled = true;
else if (!this.getWriteChecks().some(x => s[x.key])) s.checksEnabled = false;
await this.saveSettings(true);
}
}));
return items;
}
openWriteChecksPicker(anchor) {
this.openPickerLive(anchor, this.checksPickerItems(), 'toggle');
}
buildMarkersIndicator() {
const s = this.settings;
const any = this.markerOpt('showHiddenMarkers', false) &&
(s.markSpaces || s.markTabs || s.markParagraphs || s.markEndOfLines || s.markBlankLines);
return this.buildBarButton(
'zg-barbtn-markers' + (any ? '' : ' is-off'),
(node) => {
node.textContent = this.settings.markersTokenFormat === 'word'
? 'Markers' : '\u00b6';
},
any ? 'Hidden markers \u2014 click to change' : 'Hidden markers are off',
(anchor) => this.openMarkersPicker(anchor)
);
}
markersPickerItems() {
const s = this.settings;
const defs = [
{ key: 'markTabs', label: '\u2192 Tabs' },
{ key: 'markSpaces', label: '\u00b7 Spaces' },
{ key: 'markEndOfLines', label: '\u21b5 Line ends' },
{ key: 'markParagraphs', label: '\u00b6 Paragraphs' },
{ key: 'markBlankLines', label: '~ End of buffer' }
];
const items = defs.map(d => ({
label: d.label,
sub: true,
on: () => !!(this.markerOpt('showHiddenMarkers', false) && s[d.key]),
onClick: async () => {
s[d.key] = !s[d.key];
if (s[d.key]) {
s.showHiddenMarkers = true;
s.markersEnabled = true;
}
else if (!defs.some(x => s[x.key])) s.showHiddenMarkers = false;
await this.saveSettings(true);
}
}));
return items;
}
openMarkersPicker(anchor) {
this.openPickerLive(anchor, this.markersPickerItems(), 'toggle');
}
openPickerLive(anchor, items, mode) {
const snapshot = items.map(i => Object.assign({}, i,
{ on: (typeof i.on === 'function' ? i.on() : !!i.on) }));
this.openBarPicker(anchor, snapshot, mode);
if (this._barPicker) this._barPicker._live = items;
}
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
const fill = (d) => el('path', { class: 'zg-mode-fill', d });
if (kind === 'zen') {
el('circle', { class: 'zg-mode-shape', cx: 12, cy: 12, r: 10.4 });
stroke('M8.6 8.2 H15.4 L8.6 15.8 H15.4');
} else if (kind === 'hem') {
el('rect', { class: 'zg-mode-shape', x: 1.6, y: 1.6,
width: 20.8, height: 20.8, rx: 3.4 });
stroke('M8.4 7 V17 M15.6 7 V17 M8.4 12 H15.6');
} else if (kind === 'lb') {
stroke('M3.5 10 H20.5 M3.5 14 H20.5');
fill('M12 2.6 L15 6.6 H9 Z');
fill('M12 21.4 L9 17.4 H15 Z');
} else {
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
modesPickerItems() {
const defs = [
{ key: 'lb', label: 'Letter Box',
on: () => this.letterboxActive(),
onClick: async () => { await this.toggleSetting('enableLetterbox'); } },
{ key: 'tw', label: 'Typewriter',
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
icon: () => this.buildModeGlyph(d.key),
on: d.on,
onClick: d.onClick
}));
return items;
}
openModesPicker(anchor) {
this.openBarPicker(anchor, this.modesPickerItems(), 'toggle');
}
getLineColumn(view) {
try {
if (!view || !view.editor || !view.editor.getCursor) return '';
const c = view.editor.getCursor();
if (!c) return '';
return (c.line + 1) + ':' + (c.ch + 1);
} catch (_) { return ''; }
}
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
if (at > line) break;
const lv = Math.max(1, Math.min(6, h.level || 1));
out[lv - 1] = String(h.heading == null ? '' : h.heading);
for (let d = lv; d < 6; d++) out[d] = '';
}
} catch (_) { }
return out;
}
getBacklinkCount(view) {
try {
let f = view && view.file ? view.file : null;
if (!f) { try { f = this.activeNoteFile(); } catch (_) { f = null; } }
if (!f || !f.path) return '';
const gen = this._linkGen || 0;
const hit = this._backlinkCache;
if (hit && hit.path === f.path && hit.gen === gen) return hit.text;
const resolved = (this.app.metadataCache && this.app.metadataCache.resolvedLinks) || {};
let n = 0;
for (const src of Object.keys(resolved)) {
if (src === f.path) continue;
const targets = resolved[src];
if (targets && targets[f.path]) n++;
}
const text = String(n);
this._backlinkCache = { path: f.path, gen, text };
return text;
} catch (_) { return ''; }
}
formatCount(n) {
const v = Number(n);
if (!isFinite(v)) return String(n == null ? 0 : n);
try { return v.toLocaleString(); } catch (_) { return String(v); }
}
formatReadTime(words) {
const wpm = READ_WPM;
if (!words) return '0 min';
const mins = words / wpm;
if (mins < 1) return '<1 min';
const m = Math.round(mins);
if (m < 60) return m + ' min';
return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
}
updateModifierState(evt) {
if (!evt || typeof evt.getModifierState !== 'function') return;
let changed = false;
try {
const caps = evt.getModifierState('CapsLock');
if (caps !== this._capsLockOn) { this._capsLockOn = caps; changed = true; }
} catch (_) { }
try {
const num = evt.getModifierState('NumLock');
if (num !== this._numLockOn) { this._numLockOn = num; changed = true; }
} catch (_) { zgCatch('updateModifierState: const num = evt.getModifierState(\'NumLock\');', _); }
if (changed) this.updateRetroStatusBar();
}
editorHasFocus() {
try {
const a = document.activeElement;
return !!(a && a.closest && a.closest('.cm-editor'));
} catch (_) { return true; }
}
getVimModeKey() {
try {
const vault = this.app.vault;
if (!vault.config || vault.config.vimMode !== true) return '';
if (this._vimPanelOpen || !this.editorHasFocus()) return 'command';
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
const cm6 = view && view.editor && view.editor.cm;
const cm5 = cm6 && cm6.cm;
const vim = cm5 && cm5.state && cm5.state.vim;
if (!vim) return '';
if (vim.insertMode) return (cm5.state.overwrite || vim.replaceMode) ? 'replace' : 'insert';
if (vim.replaceMode) return 'replace';
if (vim.visualMode) return 'visual';
switch (vim.mode) {
case 'insert': return 'insert';
case 'replace': return 'replace';
case 'visual': return 'visual';
}
if (document.querySelector('.cm-panels-bottom, .cm-vim-panel, .CodeMirror-dialog')) return 'command';
return 'normal';
} catch (_) { return ''; }
}
getVimModeLabel() {
const L = (k, d) => {
const v = this.settings['vimLabel' + k];
return (v != null && String(v).trim() !== '') ? v : d;
};
try {
const vault = this.app.vault;
if (!vault.config || vault.config.vimMode !== true) return '';
if (this._vimPanelOpen || !this.editorHasFocus()) return L('Command', '-- COMMAND --');
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
const cm6 = view && view.editor && view.editor.cm;
const cm5 = cm6 && cm6.cm;
const vim = cm5 && cm5.state && cm5.state.vim;
if (!vim) return '';
if (vim.insertMode) {
return (cm5.state.overwrite || vim.replaceMode)
? L('Replace', '-- REPLACE --') : L('Insert', '-- INSERT --');
}
if (vim.replaceMode) return L('Replace', '-- REPLACE --');
if (vim.visualMode) {
if (vim.visualBlock) return L('Visual', '-- VISUAL BLOCK --');
if (vim.visualLine) return L('Visual', '-- VISUAL LINE --');
return L('Visual', '-- VISUAL --');
}
switch (vim.mode) {
case 'insert': return L('Insert', '-- INSERT --');
case 'replace': return L('Replace', '-- REPLACE --');
case 'visual': return L('Visual', '-- VISUAL --');
}
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
this._themeSurfaceCache = null;
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
const now = new Date();
let stats = null, totalWC = 0, charCount = 0, displayWC = 0, displayCC = 0;
if (view) {
stats = this.getDocStats(view);
totalWC = stats.totalWC;
charCount = stats.charCount;
const editor = view.editor;
const sel = editor ? editor.getSelection() : '';
if (sel && sel.trim().length > 0) {
const selProse = this.countProse(sel);
displayWC = selProse.words;
displayCC = selProse.charsWithSpaces;
} else {
displayWC = totalWC;
displayCC = charCount;
}
}
const dp = this.dateParts(now);
const hTrail = this.headingTrail(view);
const subs = {
'{file}': this.getFilePath(view),
'{words}': this.formatCount(displayWC),
'{chars}': this.formatCount(displayCC),
'{time}': this.formatTime(now),
'{clock}': '\x00CLOCK\x00',
'{obsidian}': '\x00OBSIDIAN\x00',
'{dd}': dp.dd,
'{mm}': dp.mm,
'{yyyy}': dp.yyyy,
'{yy}': dp.yy,
'{battery}': this.formatBattery(),
'{paragraph}': this.getParagraphInfo(view, stats),
'{ln:col}': this.getLineColumn(view),
'{backlinks}': this.getBacklinkCount(view),
'{#}': hTrail[0],
'{##}': hTrail[1],
'{###}': hTrail[2],
'{####}': hTrail[3],
'{#####}': hTrail[4],
'{######}': hTrail[5],
'{#>}': this.headingTrailText(hTrail),
'{caps}': this._capsLockOn ? '\x00CAPS\x00' : '',
'{num}': this._numLockOn ? '\x00NUM\x00' : '',
'{vim}': this.getVimModeLabel(),
'{mode}': '\x00MODE\x00',
'{syntax}': '\x00SYNTAX\x00',
'{markers}': '\x00MARKERS\x00',
'{prose}': '\x00WRITECHECKS\x00',
'{writechecks}': '\x00WRITECHECKS\x00',
'{font}': '\x00FONT\x00',
'{theme}': '\x00THEME\x00',
'{report}': '\x00REPORT\x00',
'{history}': '\x00HISTORY\x00',
'{export}': '\x00EXPORT\x00',
'{organizer}': '\x00OUTLINER\x00',
'{outliner}': '\x00OUTLINER\x00',
'{flag}': '\x00FLAG\x00',
'{readtime}': this.formatReadTime(totalWC)
};
const rows = this.getStatusRows();
const dir0 = readBarDirective((rows[0] || {}).left);
if (dir0.bgSlot != null || dir0.textSlot === 'vim' || dir0.textSlot === 'bc') {
const r = this.resolveBarDirective(dir0);
if (r.bg) document.body.style.setProperty('--zg-bg', r.bg);
if (r.text) document.body.style.setProperty('--zg-text', r.text);
}
this.retroStatusBarEl.style.cursor = '';
this.retroStatusBarEl.title = '';
this._zgLastTotalWordCount = totalWC;
this.registerGoalStates();
this.retroStatusBarEl.empty();
this._statusRowEls = [];
const pad = this.barPadding();
const rowH = this.snappedRowHeight() + pad.top + pad.bottom;
this.retroStatusBarEl.classList.add('zg-powerline');
let barColor = 'transparent';
try {
const c = getComputedStyle(this.retroStatusBarEl).backgroundColor;
if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') barColor = c;
} catch (_) { zgCatch('updateRetroStatusBar: const c = getComputedStyle(this.retroStatusBarEl).backgroundColor;', _); }
for (const row of rows) {
for (const slot of ['left', 'center', 'right']) {
const fmt = row && row[slot];
if (!fmt) continue;
const found = String(fmt).match(/\{s+\}/gi);
if (found) for (const tok of found) {
if (subs[tok] != null) continue;
subs[tok] = '\x00SP:' + Math.min(40, tok.length - 2) + '\x00';
}
const grads = String(fmt).match(/\{g+\}/gi);
if (grads) for (const tok of grads) {
if (subs[tok] != null) continue;
subs[tok] = '\x00GR:' + Math.min(40, tok.length - 2) + '\x00';
}
}
}
const section = (fmt, side) =>
this.renderPowerlineSection(fmt, subs, side, rowH, barColor);
for (let ri = 0; ri < rows.length; ri++) {
const row = rows[ri];
const rowEl = this.retroStatusBarEl.createDiv({ cls: 'zg-status-row' });
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
const anyGoalMet = (this._goalStates || []).some(gl => gl.met);
this.retroStatusBarEl.classList.toggle('zg-goal-met', anyGoalMet);
this._goalWasMet = anyGoalMet;
this.stampBarBounds();
this.scheduleFit();
}
isDarkTheme() {
try { return document.body.classList.contains('theme-dark'); }
catch (_) { return true; }
}
isDarkSurface() {
try {
if (this.settings && this.settings.barThemeEnabled !== false) {
const id = this.settings.barTheme;
if (id && id !== 'custom') {
const t = this.barThemeById(id);
const h = t && this.barThemeHalf(t);
if (h && h.b1) {
return this.barContrast('#ffffff', h.b1)
> this.barContrast('#000000', h.b1);
}
}
}
} catch (_) { zgCatch('isDarkSurface: if (this.settings && this.settings.barThemeEnabled !== false)', _); }
return this.isDarkTheme();
}
themedKey(darkKey, lightKey) {
return this.isDarkSurface() ? darkKey : lightKey;
}
powerlineColors() {
const s = this.settings;
const dark = this.isDarkSurface();
const out = [];
for (let n = 1; n <= PL_BG_COUNT; n++) {
const c = s[dark ? 'powerlineColor' + n : 'powerlineColorLight' + n];
out.push((typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c))
? c : (dark ? '#3f4550' : '#d9dce1'));
}
return out;
}
powerlineTextColor(n1) {
const list = this.powerlineColors();
return list[(((n1 - 1) % list.length) + list.length) % list.length];
}
powerlineActive() {
return !!this.retroStatusBarEl;
}
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
const dark = (L + 0.05) / 0.06, light = 1.05 / (L + 0.05);
return dark >= light ? '#16181d' : '#f7f7f5';
} catch (_) { return '#f5f5f5'; }
}
parsePowerlineSegments(formatStr) {
const texts = [], seps = [], dirs = [];
let buf = '';
const inTok = new Array(formatStr.length).fill(false);
{
const tokRe = /\{[^{}]*\}/g;
let tm;
while ((tm = tokRe.exec(formatStr))) {
for (let k = tm.index; k < tm.index + tm[0].length; k++) inTok[k] = true;
}
}
for (let i = 0; i < formatStr.length; i++) {
const c = formatStr[i];
if (inTok[i]) { buf += c; continue; }
if (c === '\\' && i + 1 < formatStr.length && PL_DIVIDERS[formatStr[i + 1]]) {
buf += formatStr[i + 1]; i++; continue;
}
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
let lead = null, tail = null, leadDir = null, tailDir = null;
const segs = [], keptSeps = [];
for (let i = 0; i < texts.length; i++) {
let slot = null;
let ink = null;
const text = texts[i].replace(/(\{[^{}]+\})(?:\s*:(\d+|vim|b[1-4]|bs|bc|f))?(?:\s*;\s*(\d+|vim|bc|t[1-3]|f))?/gi, (m, tok, n, t) => {
if (n != null && slot === null) {
slot = /^(?:vim|bc|f)$/i.test(n) ? n.toLowerCase()
: /^(?:b[1-4]|bs)$/i.test(n) ? n.toLowerCase()
: parseInt(n, 10);
}
if (t != null && ink === null) {
ink = /^(?:vim|bc|f)$/i.test(t) ? t.toLowerCase()
: /^t[1-3]$/i.test(t) ? t.toLowerCase()
: parseInt(t, 10);
}
return tok;
}).trim();
if (!text.length) {
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
buildSoftChevron(dir) {
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('class', 'zg-pl-soft '
+ (dir === 'right' ? 'zg-pl-chev-r' : 'zg-pl-chev-l'));
const w = 8, h = 16;
svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
svg.setAttribute('width', String(w));
svg.setAttribute('height', String(h));
svg.setAttribute('preserveAspectRatio', 'none');
const path = document.createElementNS(NS, 'path');
path.setAttribute('d', dir === 'right'
? 'M1,0 L' + (w - 1) + ',' + (h / 2) + ' L1,' + h
: 'M' + (w - 1) + ',0 L1,' + (h / 2) + ' L' + (w - 1) + ',' + h);
path.setAttribute('fill', 'none');
path.setAttribute('stroke', 'currentColor');
path.setAttribute('stroke-width', '1');
path.setAttribute('vector-effect', 'non-scaling-stroke');
path.setAttribute('stroke-linejoin', 'round');
svg.appendChild(path);
return svg;
}
buildSoftMark(mark) {
const cls = PL_SOFT[mark];
if (!cls) return null;
if (mark === '>>' || mark === '<<') {
return this.buildSoftChevron(mark === '>>' ? 'right' : 'left');
}
const i = document.createElement('i');
i.className = cls;
return i;
}
buildPowerlineSep(fromColor, toColor, dir, h, shape) {
const style = shape || 'arrow';
const paint = (c) => (typeof c === 'string' && c.trim()) ? c.trim() : 'transparent';
fromColor = paint(fromColor);
toColor = paint(toColor);
const pct = style === 'angleF' || style === 'angleB' ? 0.42
: style === 'wave' ? 0.62
: PL_SEP_ASPECT;
const w = style === 'straight' ? 2
: style === 'wave' ? Math.max(10, Math.round(h * Math.max(pct, 0.6)))
: Math.max(6, Math.round(h * pct));
const NS = 'http://www.w3.org/2000/svg';
const svg = document.createElementNS(NS, 'svg');
svg.setAttribute('class', 'zg-pl-sep');
svg.setAttribute('data-shape', style);
svg.setAttribute('width', String(w));
svg.setAttribute('height', String(h));
svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
svg.setAttribute('preserveAspectRatio', 'none');
svg.setAttribute('overflow', 'hidden');
if (style === 'straight') {
svg.setAttribute('width', '0');
svg.setAttribute('viewBox', '0 0 0 ' + h);
return svg;
}
const rect = document.createElementNS(NS, 'rect');
rect.setAttribute('x', '-1');
rect.setAttribute('y', '-1');
rect.setAttribute('width', String(w + 2));
rect.setAttribute('height', String(h + 2));
rect.setAttribute('fill', dir === 'right' ? toColor : fromColor);
svg.appendChild(rect);
const L = -1;
const R = w + 1;
const mid = h / 2;
const TIP = 0.34;
const tipR = w - TIP;
const tipL = TIP;
let d = '', fill = dir === 'right' ? fromColor : toColor;
const T = -1, B = h + 1;
if (style === 'angleF') {
d = 'M' + w + ',0 L' + L + ',' + h + ' L' + L + ',' + T + ' L' + w + ',' + T + ' Z';
fill = fromColor; rect.setAttribute('fill', toColor);
} else if (style === 'angleB') {
d = 'M' + L + ',0 L' + w + ',' + h + ' L' + w + ',' + B + ' L' + L + ',' + B + ' Z';
fill = fromColor; rect.setAttribute('fill', toColor);
} else if (style === 'wave') {
const c = w / 2;
const bow = w * 0.82, bowL = w * 0.18;
const y = f => Math.round(h * f * 100) / 100;
const bx = (v) => Math.round(v * 100) / 100;
d = dir === 'right'
? 'M' + L + ',' + T + ' L' + c + ',' + T + ' L' + c + ',0'
+ ' C' + bx(bow) + ',' + y(0.12) + ' ' + bx(bow) + ',' + y(0.38) + ' ' + c + ',' + mid
+ ' C' + bx(bowL) + ',' + y(0.62) + ' ' + bx(bowL) + ',' + y(0.88) + ' ' + c + ',' + h
+ ' L' + c + ',' + B + ' L' + L + ',' + B + ' Z'
: 'M' + R + ',' + T + ' L' + c + ',' + T + ' L' + c + ',0'
+ ' C' + bx(bowL) + ',' + y(0.12) + ' ' + bx(bowL) + ',' + y(0.38) + ' ' + c + ',' + mid
+ ' C' + bx(bow) + ',' + y(0.62) + ' ' + bx(bow) + ',' + y(0.88) + ' ' + c + ',' + h
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
powerlineSegColor(seg, index, colors, hasVim, barColor) {
const pick = (n1) => colors[(((n1 - 1) % colors.length) + colors.length) % colors.length];
if (seg.slot === 'vim') return this.vimModeColor();
if (seg.slot === 'bc') {
const c = this.cursorColor();
if (c) return c;
}
if (seg.slot === 'f') {
const c = this.flagColor();
if (c) return c;
}
if (typeof seg.slot === 'string' && seg.slot !== 'bc' && PL_THEME_BGS[seg.slot]) {
for (const name of PL_THEME_BGS[seg.slot]) {
const c = this.themeSurfaceColor(name);
if (c) return c;
}
} else if (seg.slot != null && seg.slot !== 'bc') {
return pick(seg.slot);
}
if (hasVim && /\{vim\}/.test(seg.text) && this.settings.powerlineModeColors) {
return this.vimModeColor();
}
if (barColor && barColor !== 'transparent') return barColor;
for (const name of PL_THEME_BGS.bs) {
const c = this.themeSurfaceColor(name);
if (c) return c;
}
return 'transparent';
}
powerlineSegInk(seg, bg, barColor) {
if (seg.slot === 'bs') return 'var(--status-bar-text-color, var(--text-normal))';
if (seg.slot === 'bc') return this.powerlineInk(bg);
if (seg.slot === 'f') return this.powerlineInk(bg);
if (typeof seg.slot === 'string' && PL_THEME_BGS[seg.slot]) return 'var(--text-normal)';
if (seg.slot == null && bg === barColor) return '';
return this.powerlineInk(bg);
}
themeSurfaceColor(varName) {
if (this._themeSurfaceCache && varName in this._themeSurfaceCache) {
return this._themeSurfaceCache[varName];
}
let val = '';
try {
const probe = this.colorProbeEl();
probe.style.backgroundColor = '';
probe.style.backgroundColor = 'var(' + varName + ')';
const out = (getComputedStyle(probe).backgroundColor || '').trim();
val = (!out || out === 'rgba(0, 0, 0, 0)' || out === 'transparent') ? '' : out;
} catch (_) { val = ''; }
if (!this._themeSurfaceCache) this._themeSurfaceCache = {};
this._themeSurfaceCache[varName] = val;
return val;
}
colorProbeEl() {
if (!this._colorProbeEl || !this._colorProbeEl.isConnected) {
const el = document.createElement('span');
el.className = 'zg-color-probe';
el.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;'
+ 'pointer-events:none;';
document.body.appendChild(el);
this._colorProbeEl = el;
}
return this._colorProbeEl;
}
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
return pick(snap) || pick(st);
}
vimModeColor() {
const key = this.getVimModeKey() || 'normal';
if (this.settings.vimFollowCursorSmith !== false) {
const cs = this.cursorSmithVimColor(key);
if (cs) return cs;
}
const name = 'vimColor' + key.charAt(0).toUpperCase() + key.slice(1);
const dark = this.isDarkSurface();
const c = this.settings[dark ? name : name + 'Light'];
return (typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c))
? c : (dark ? '#4f9dde' : '#2d6da4');
}
cursorColor() {
const st = this.cursorSmithSettings();
if (st) {
const key = this.getVimModeKey();
if (key) {
const c = this.cursorSmithVimColor(key);
if (c) return c;
}
const dark = document.body.classList.contains('theme-dark');
const flat = dark ? st.colorDark : st.colorLight;
if (typeof flat === 'string' && /^#[0-9a-f]{3,8}$/i.test(flat)) return flat;
}
for (const name of PL_THEME_BGS.bc) {
const c = this.themeSurfaceColor(name);
if (c) return c;
}
return null;
}
renderPowerlineSection(formatStr, subs, side, rowH, barColor) {
const frag = document.createDocumentFragment();
if (!formatStr) return frag;
const colors = this.powerlineColors();
const parsed = this.parsePowerlineSegments(formatStr);
if (!parsed.segs.length) return frag;
const hasVim = /\{vim\}/.test(formatStr);
const cap = parsed.seps.find(Boolean) || 'arrow';
const built = [], sepsFor = [];
for (let i = 0; i < parsed.segs.length; i++) {
const inner = document.createElement('span');
inner.className = 'zg-pl-inner';
const parts = parsed.segs[i].text.split(PL_SOFT_SPLIT);
for (let p = 0; p < parts.length; p++) {
const piece = parts[p];
const mark = this.buildSoftMark(piece);
if (mark) { inner.appendChild(mark); continue; }
inner.appendChild(this.renderStatusSection(piece.trim(), subs));
}
const hasContent = !!inner.textContent.trim()
|| !!inner.querySelector('*:not(.zg-pl-soft)');
if (!hasContent) continue;
if (built.length) sepsFor.push(parsed.seps[i - 1] || cap);
built.push({ inner, seg: parsed.segs[i] });
}
if (!built.length) return frag;
const isFade = built.map(b => b.seg.slot == null
&& /^(?:\{g+\}|\s)+$/i.test(b.seg.text));
const segColors = built.map((b, i) =>
isFade[i] ? null : this.powerlineSegColor(b.seg, i, colors, hasVim, barColor));
for (let r0 = 0; r0 < built.length; r0++) {
if (!isFade[r0]) continue;
let r1 = r0;
while (r1 + 1 < built.length && isFade[r1 + 1]) r1++;
const a = r0 > 0 ? segColors[r0 - 1] : barColor;
const b = r1 < built.length - 1 ? segColors[r1 + 1] : barColor;
const bands = [];
for (let j = r0; j <= r1; j++) {
for (const t of Array.from(built[j].inner.querySelectorAll('.zg-fit-item'))) {
if (!t.textContent.trim()) t.remove();
}
built[j]._bands = Array.from(built[j].inner.querySelectorAll('.zg-pl-grad'));
bands.push(...built[j]._bands);
}
const n = bands.length;
for (let k = 0; k < n; k++) {
const c = mixColors(a, b, (k + 1) / (n + 1));
bands[k].style.backgroundColor = c;
bands[k].style.boxShadow = '-1px 0 0 0 ' + c + ', 1px 0 0 0 ' + c;
}
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
const edgeL = (i) => isFade[i] ? built[i].fadeEdges[0] : segColors[i];
const edgeR = (i) => isFade[i] ? built[i].fadeEdges[1] : segColors[i];
const pivot = Math.ceil(built.length / 2);
const markCap = (sep, which) => {
sep.classList.add('zg-pl-cap');
sep.setAttribute('data-cap', which);
return sep;
};
for (let i = 0; i < built.length; i++) {
if (i === 0 && (side !== 'left' || parsed.lead)) {
frag.appendChild(markCap(this.buildPowerlineSep(barColor, edgeL(0),
parsed.leadDir || 'left', rowH,
parsed.lead || sepsFor[0] || cap), 'lead'));
}
const el = document.createElement('span');
el.className = 'zg-pl-seg'
+ (/^(?:\{[sg]+\}|\s)+$/i.test(built[i].seg.text) ? ' zg-pl-blank' : '')
+ (isFade[i] ? ' zg-pl-fade' : '');
if (isFade[i]) {
el.style.backgroundColor = 'transparent';
el.style.boxShadow = '-1px 0 0 0 ' + built[i].fadeEdges[0]
+ ', 1px 0 0 0 ' + built[i].fadeEdges[1];
} else {
el.style.backgroundColor = segColors[i];
if (built[i].seg.slot === 'f') el.classList.add('zg-pl-flagbg');
el.style.boxShadow = '-1px 0 0 0 ' + segColors[i]
+ ', 1px 0 0 0 ' + segColors[i];
const segInk = built[i].seg.ink;
el.style.color = segInk === 'vim' ? this.vimModeColor()
: segInk === 'bc' ? (this.cursorColor() || '')
: segInk === 'f' ? (this.flagColor() || '')
: (typeof segInk === 'string' && PL_THEME_INKS[segInk]) ? PL_THEME_INKS[segInk]
: segInk != null ? this.powerlineTextColor(segInk)
: this.powerlineSegInk(built[i].seg, segColors[i], barColor);
}
el.appendChild(built[i].inner);
frag.appendChild(el);
if (i < built.length - 1) {
const dir = side === 'left' ? 'right'
: side === 'right' ? 'left'
: ((i + 1) < pivot ? 'left' : 'right');
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
const keys = Object.keys(subs).filter(k => k.charAt(0) === '{')
.sort((a, b) => b.length - a.length);
const tokenRe = keys.length
? new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
: null;
const nodes = [];
let cur = null;
const IDENTITY_TOKENS = { '{file}': 1, '{vim}': 1 };
const AMBIENT_TOKENS = { '{time}': 1, '{clock}': 1 };
const TOKEN_ACTS = {
'{file}': { panel: 'file-explorer',
tip: 'Show this note in the file explorer' },
'{backlinks}': { panel: 'backlink',
tip: 'Show the notes that link to this one' }
};
const addText = (s, isTok, name) => {
if (!s) return;
if (!cur || (isTok && cur.tok)) { cur = { text: '', parts: [], tok: false }; nodes.push(cur); }
cur.text += s;
cur.parts.push({ text: s, act: (isTok && name && TOKEN_ACTS[name]) ? name : null });
if (isTok) cur.tok = true;
if (name && IDENTITY_TOKENS[name]) cur.identity = true;
if (name && AMBIENT_TOKENS[name]) cur.ambient = true;
};
const addEl = (name, tok) => { nodes.push({ el: name, tok }); cur = null; };
const addMark = (mark) => { nodes.push({ mark }); cur = null; };
for (const chunk of String(formatStr).split(PL_SOFT_SPLIT)) {
if (!chunk) continue;
if (PL_SOFT[chunk]) { addMark(chunk); continue; }
let last = 0;
if (tokenRe) {
tokenRe.lastIndex = 0;
let m;
while ((m = tokenRe.exec(chunk))) {
addText(chunk.slice(last, m.index), false);
const v = String(subs[m[0]]);
if (v.charCodeAt(0) === 0) addEl(v.slice(1, -1), m[0]);
else addText(v, true, m[0]);
last = m.index + m[0].length;
}
}
addText(chunk.slice(last), false);
}
const builders = {
MODE: () => this.buildModeIndicator(),
SYNTAX: () => this.buildSyntaxIndicator(),
MARKERS: () => this.buildMarkersIndicator(),
WRITECHECKS: () => this.buildWriteChecksIndicator(),
FONT: () => this.buildFontIndicator(),
THEME: () => this.buildThemeIndicator(),
REPORT: () => this.buildReportIndicator(),
HISTORY: () => this.buildHistoryIndicator(),
EXPORT: () => this.buildExportIndicator(),
OUTLINER: () => this.buildOutlinerIndicator(),
FLAG: () => this.buildFlagIndicator(),
CAPS: () => this.buildCapsIndicator(),
NUM: () => this.buildNumIndicator(),
CLOCK: () => this.buildClockFace(),
OBSIDIAN: () => this.buildObsidianIcon()
};
for (const n of nodes) {
if (n.mark !== undefined) {
const el = this.buildSoftMark(n.mark);
if (el) frag.appendChild(el);
continue;
}
if (n.el !== undefined) {
if (n.el.startsWith('SP:')) {
const sp = document.createElement('i');
sp.className = 'zg-pl-space';
sp.style.width = (Number(n.el.slice(3)) * this.plUnit()) + 'px';
frag.appendChild(sp);
} else if (n.el.startsWith('GR:')) {
const gr = document.createElement('i');
gr.className = 'zg-pl-grad';
gr.style.width = (Number(n.el.slice(3)) * this.plUnit()) + 'px';
frag.appendChild(gr);
} else if (builders[n.el]) {
const drawn = builders[n.el]();
if (drawn && drawn.classList && n.tok && AMBIENT_TOKENS[n.tok]) {
drawn.classList.add('zg-fit-ambient');
}
frag.appendChild(drawn);
}
continue;
}
if (!n.text) continue;
const t = document.createElement('span');
t.className = 'zg-fit-item'
+ (n.identity ? ' zg-fit-identity' : '')
+ (n.ambient ? ' zg-fit-ambient' : '');
const acts = (n.parts || []).filter(p2 => p2.act);
if (!acts.length) {
t.textContent = n.text;
} else {
for (const p2 of n.parts) {
if (!p2.act) { t.appendChild(document.createTextNode(p2.text)); continue; }
const spec = TOKEN_ACTS[p2.act];
const a = document.createElement('span');
a.className = 'zg-tokact';
a.textContent = p2.text;
a.setAttribute('title', spec.tip);
a.addEventListener('mousedown', (ev) => {
ev.preventDefault();
ev.stopPropagation();
this.openSidebarPanel(spec.panel);
});
t.appendChild(a);
}
}
frag.appendChild(t);
}
return frag;
}
headingCrumbCount() {
try {
const view = this.app.workspace.getActiveViewOfType(MarkdownView);
if (!view) return 0;
return this.headingTrail(view).filter(Boolean).length;
} catch (_) { return 0; }
}
headingTrailText(hTrail) {
const crumbs = hTrail.filter(Boolean);
if (!crumbs.length) return '';
const drop = Math.min(this._fitShortenHead || 0, crumbs.length - 1);
return crumbs.slice(drop).join(' \u203a ');
}
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
scheduleFit() {
if (this._fitPending) return;
this._fitPending = true;
const run = () => {
if (!this._fitPending) return;
this._fitPending = false;
this.fitStatusBarText();
};
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
el.style.fontSize = this.settings.statusBarFontFollowNote
? 'var(--font-text-size, 16px)'
: (this.settings.statusBarFontSize || 13) + 'px';
this.fitStatusBar();
}
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
this.maskTopEl = document.body.createEl('div', { cls: ['zengrinder-mask', 'zengrinder-mask-top'] });
this.maskBottomEl = document.body.createEl('div', { cls: ['zengrinder-mask', 'zengrinder-mask-bottom'] });
const chars = this.getArrowChars();
this.arrowsTopEl = this.buildArrowLayer('top', chars.top);
this.maskGuardLeftEl = document.body.createEl('div', { cls: ['zengrinder-mask-guard'] });
this.maskGuardRightEl = document.body.createEl('div', { cls: ['zengrinder-mask-guard'] });
for (const g of [this.maskGuardLeftEl, this.maskGuardRightEl]) {
g.style.cssText = 'position:fixed;display:none;pointer-events:none;';
}
this.arrowsBottomEl = this.buildArrowLayer('bottom', chars.bottom);
const scroller = this.getActiveScroller();
if ('ResizeObserver' in window) {
this.maskResizeObserver = new ResizeObserver(() => this.scheduleMaskPosition());
if (scroller) this.maskResizeObserver.observe(scroller);
if (this.retroStatusBarEl) this.maskResizeObserver.observe(this.retroStatusBarEl);
}
this.updateMaskVisibility();
}
titlebarAreaHeight() {
try {
const o = navigator.windowControlsOverlay;
if (o && o.visible && o.getTitlebarAreaRect) {
const r = o.getTitlebarAreaRect();
if (r && r.height) return Math.round(r.height);
}
} catch (_) { }
try {
for (const sel of ['.titlebar', '.workspace-drag-region', '.titlebar-button-container']) {
const el = document.querySelector(sel);
if (!el) continue;
const r = el.getBoundingClientRect();
if (r && r.height && r.top <= 0) return Math.round(r.height);
}
} catch (_) { zgCatch('titlebarAreaHeight: for (const sel of [\'.titlebar\', \'.workspace-drag-region\', …', _); }
return 0;
}
checkZoomChange() {
const z = this.zoomFactor();
if (this._lastZoom === z) return;
const first = this._lastZoom === undefined;
this._lastZoom = z;
if (first) return;
this._barBoundsL = this._barBoundsW = null;
this._barReserve = null;
this._fitShortenFile = false;
this._fitShortenWidth = 0;
this.afterReflow(() => {
this.scheduleMaskPosition();
this.requestBarRebuild();
});
}
afterReflow(fn) {
const go = () => { try { fn(); } catch (_) { zgCatch('afterReflow: fn();', _); } };
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
} catch (_) { }
return 1;
}
stampBarReserve(barTop) {
const root = document.documentElement.style;
const leaves = document.querySelectorAll('.workspace-split.mod-root .workspace-leaf');
if (!(barTop > 0)) {
if (this._barReserve !== 0) {
this._barReserve = 0;
root.removeProperty('--zg-bar-reserve');
}
leaves.forEach(l => l.classList.remove('zg-bar-overlap'));
return;
}
let bottom = 0;
try {
const rootEl = document.querySelector('.workspace-split.mod-root');
const rr = rootEl && rootEl.getBoundingClientRect();
if (rr && rr.height) bottom = rr.bottom;
} catch (_) { zgCatch('stampBarReserve: const rootEl = document.querySelector(\'.workspace-split.mod-root\');', _); }
if (!(bottom > barTop)) {
bottom = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 0;
}
const z = this.zoomFactor();
const reserve = Math.max(0, Math.round((Math.round(bottom - barTop) / z) * 1000) / 1000);
if (this._barReserve !== reserve) {
this._barReserve = reserve;
root.setProperty('--zg-bar-reserve', reserve + 'px');
}
leaves.forEach(leaf => {
let over = true;
try {
const r = leaf.getBoundingClientRect();
if (r && r.height) over = r.bottom > barTop + 1;
} catch (_) { zgCatch('stampBarReserve: const r = leaf.getBoundingClientRect();', _); }
leaf.classList.toggle('zg-bar-overlap', over);
});
}
isMobileApp() {
try {
if (Platform && typeof Platform.isMobile === 'boolean') return Platform.isMobile;
} catch (_) { zgCatch('isMobileApp: if (Platform && typeof Platform.isMobile === \'boolean\') return …', _); }
try { return !!(document.body && document.body.classList.contains('is-mobile')); }
catch (_) { return false; }
}
clearBarBounds() {
const el = this.retroStatusBarEl;
if (!el || !el.style || typeof el.style.removeProperty !== 'function') return;
if (this._barBoundsCleared) return;
this._barBoundsCleared = true;
this._barBoundsL = this._barBoundsW = null;
this._barBoundsEl = null;
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
if (!el || !el.style || typeof el.style.removeProperty !== 'function') return;
if (this.isMobileApp()) { this.clearBarBounds(); return; }
const root = document.querySelector('.workspace-split.mod-root');
const r = root && root.getBoundingClientRect();
if (!r || !r.width) {
this.clearBarBounds();
return;
}
const z = this.zoomFactor();
if (this._stampZoom !== undefined && this._stampZoom !== z) {
this._stampZoom = z;
this._barBoundsL = this._barBoundsW = null;
this.afterReflow(() => this.stampBarBounds());
return;
}
this._stampZoom = z;
const left = Math.round(r.left);
const width = Math.round(r.width);
const vw = Math.round(window.innerWidth || 0);
if (vw && (width <= 0 || left < -2 || left + width > vw + 2)) {
this.clearBarBounds();
return;
}
this._barBoundsCleared = false;
if (this._barBoundsL !== left || this._barBoundsW !== width
|| this._barBoundsEl !== el) {
this._barBoundsEl = el;
this._barBoundsL = left;
this._barBoundsW = width;
try {
const b = document.body && document.body.style;
if (b && b.setProperty) {
b.setProperty('--zg-col-left', left + 'px');
b.setProperty('--zg-col-width', width + 'px');
}
} catch (_) { zgCatch('stampBarBounds: const b = document.body && document.body.style;', _); }
el.style.setProperty('left', left + 'px', 'important');
el.style.setProperty('width', width + 'px', 'important');
el.style.removeProperty('right');
const pl = this.retroPlinthEl;
if (pl && pl.style && typeof pl.style.setProperty === 'function') {
pl.style.setProperty('left', left + 'px', 'important');
pl.style.setProperty('width', width + 'px', 'important');
}
this.scheduleFit();
}
}
maskTopClip(maskLeft, maskTop, maskWidth, maskHeight) {
this._maskNotches = null;
try {
const W = window.innerWidth;
const mL = maskLeft || 0;
const mT = maskTop || 0;
const mW = maskWidth || W;
const mH = maskHeight || 0;
let h = 0, leftEdge = 0, rightEdge = W;
const o = navigator.windowControlsOverlay;
if (o && o.visible && o.getTitlebarAreaRect) {
const r = o.getTitlebarAreaRect();
if (r && r.height) {
h = Math.ceil(r.height);
leftEdge = Math.max(leftEdge, Math.round(r.x));
rightEdge = Math.min(rightEdge, Math.round(r.x + r.width));
}
}
const groups = [
['.titlebar-button-container.mod-right', '.titlebar-button-container.mod-left'],
['.titlebar-button-container', '.titlebar .window-controls', '.titlebar-button']
];
for (const group of groups) {
let found = false;
for (const sel of group) {
for (const el of document.querySelectorAll(sel)) {
const r = el.getBoundingClientRect();
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
const leftW = leftEdge;
const rightW = W - rightEdge;
if (!h || (leftW <= 0 && rightW <= 0)) return '';
let nh = h - mT + 1;
let nl = leftW > 0 ? (leftEdge + 2) - mL : 0;
let nr = rightW > 0 ? (mL + mW) - (rightEdge - 2) : 0;
nl = Math.max(0, Math.min(nl, mW));
nr = Math.max(0, Math.min(nr, mW));
if (nh <= 0 || nh > Math.min(64, mH || 64)) return '';
if (nl > mW * 0.45 || nr > mW * 0.45) return '';
if (nl <= 0 && nr <= 0) return '';
this._maskNotches = { nl: Math.max(0, nl), nr: Math.max(0, nr), nh };
const xr = mW - nr;
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
this.stampBarBounds();
const view = this.activeMarkdownView();
if (!view) { this._maskRaf = null; return; }
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
if (!(sr.width > 0 && sr.height > 0)) {
this._maskRaf = null;
this._maskRetries = (this._maskRetries || 0) + 1;
if (this._maskRetries <= MASK_MEASURE_RETRIES) this.scheduleMaskPosition();
return;
}
this._maskRetries = 0;
let statusH = 0;
if (this.barIsHidden()) {
statusH = 0;
} else if (this.settings.enableRetroStatus && this.retroStatusBarEl) {
statusH = (this.retroStatusBarEl.getBoundingClientRect().height
|| this.snappedRowHeight())
+ this.vimGutterHeight();
} else {
const nb = document.querySelector('.status-bar');
if (nb && getComputedStyle(nb).display !== 'none') statusH = nb.getBoundingClientRect().height || 0;
}
const sTop = Math.max(0, sr.top);
const sLeft = Math.max(0, sr.left);
const sWidth = sr.width;
const vpH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
let sBottom = vpH - statusH;
let barMeasured = false;
if (!this.barIsHidden() && this.settings.enableRetroStatus && this.retroStatusBarEl) {
try {
const br = this.retroStatusBarEl.getBoundingClientRect();
if (br.height > 0 && br.top > 0 && br.top < vpH) { sBottom = br.top; barMeasured = true; }
} catch (_) { zgCatch('stampMaskPositions: const br = this.retroStatusBarEl.getBoundingClientRect();', _); }
}
const barTopEdge = sBottom;
let paneFoot = false;
if (sr.bottom > sTop && sr.bottom < sBottom) { sBottom = sr.bottom; paneFoot = true; }
const sHeight = Math.max(0, sBottom - sTop);
this.stampBarReserve(
(!this.barIsHidden() && this.settings.enableRetroStatus && this.retroStatusBarEl)
? barTopEdge : 0);
this.checkZoomChange();
let maskH = this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26;
maskH = Math.min(maskH, this._maskMaxPx(sHeight));
maskH = Math.max(maskH, ZG_MASK_MIN_PX);
let padH = this.settings.maskMatchText
? 0
: (this.settings.maskPaddingH || 0);
const innerW = scroller.clientWidth || sWidth;
let matchLeft = null, matchW = null;
if (this.settings.maskMatchText) {
try {
const sizer = scroller.querySelector('.cm-contentContainer .cm-content')
|| scroller.querySelector('.cm-sizer')
|| scroller.querySelector('.markdown-preview-sizer');
if (sizer) {
const r = sizer.getBoundingClientRect();
if (r && r.width > 0) {
matchLeft = r.left;
matchW = r.width;
if (!this.settings.maskMatchTextPadded) {
const cs = window.getComputedStyle(sizer);
const pl = parseFloat(cs.paddingLeft) || 0;
const pr = parseFloat(cs.paddingRight) || 0;
matchLeft += pl;
matchW -= (pl + pr);
}
}
}
} catch (_) { matchLeft = matchW = null; }
}
const baseLeft = matchLeft != null ? matchLeft : sLeft;
const baseWidth = matchW != null ? matchW : sWidth;
const padMax = Math.max(0, Math.floor((baseWidth - ZG_ARROWS_MIN_W) / 2));
padH = Math.min(padH, padMax);
const arrowLeft = (matchLeft != null ? matchLeft : sLeft) + padH;
const arrowW = Math.max(0, (matchW != null ? matchW : innerW) - padH * 2);
const arrowH = maskH;
const overhang = this.settings.maskOverhang != null ? this.settings.maskOverhang : 4;
const S = (el, styles) => { if (el) Object.assign(el.style, styles); };
S(this.maskTopEl, { left: baseLeft+'px', width: baseWidth+'px', top: sTop+'px', height: (arrowH+overhang)+'px', bottom:'' });
if (this.maskTopEl) {
try {
this.maskTopEl.style.clipPath =
this.maskTopClip(sLeft, sTop, sWidth, arrowH + overhang);
} catch (_) { try { this.maskTopEl.style.clipPath = ''; } catch (__) { zgCatch('stampMaskPositions: this.maskTopEl.style.clipPath = \'\';', __); } }
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
box(gl, sLeft, n.nl, n.nh);
box(gr, sLeft + sWidth - n.nr, n.nr, n.nh);
} else {
box(gl, 0, 0, 0); box(gr, 0, 0, 0);
}
} catch (_) { zgCatch('stampMaskPositions: const n = this._maskNotches;', _); }
}
const arrowsFit = maskH >= ZG_ARROWS_MIN_PX;
try {
this.arrowsTopEl.classList.toggle('is-hidden', !arrowsFit);
this.arrowsBottomEl.classList.toggle('is-hidden', !arrowsFit);
} catch (_) { zgCatch('stampMaskPositions: this.arrowsTopEl.classList.toggle(\'is-hidden\', !arrowsFit);', _); }
S(this.arrowsTopEl, { left: arrowLeft+'px', width: arrowW+'px', top: sTop+'px', height: arrowH+'px', bottom:'' });
const bottomMaskTop = Math.floor(sBottom - arrowH - overhang);
if (barMeasured && !paneFoot) {
S(this.maskBottomEl, { left: baseLeft+'px', width: baseWidth+'px',
top: bottomMaskTop+'px',
bottom: (this._vimPanelOpen ? this.vimGutterHeight() : 0) + 'px',
height: '' });
} else {
S(this.maskBottomEl, { left: baseLeft+'px', width: baseWidth+'px',
top: bottomMaskTop+'px',
height: Math.ceil(sBottom - bottomMaskTop)+'px', bottom:'' });
}
S(this.arrowsBottomEl, { left: arrowLeft+'px', width: arrowW+'px', top: (sBottom-arrowH)+'px', height: arrowH+'px', bottom:'' });
this.scheduleFit();
const scrollPad = this.letterboxActive() ? Math.round(arrowH + overhang + 24) : 0;
document.documentElement.style.setProperty('--zg-scroller-pad-top', scrollPad + 'px');
document.documentElement.style.setProperty('--zg-scroller-pad-bottom', scrollPad + 'px');
this._maskRaf = null;
}
scheduleMaskPosition() {
if (this._maskRaf) return;
this._maskRaf = requestAnimationFrame(() => this.stampMaskPositions());
}
buildArrowLayer(position, char) {
const wrap = document.body.createEl('div', { cls: 'zengrinder-arrows-wrap zengrinder-arrows-wrap-' + position + ' is-visible' });
const line = wrap.createEl('div', { cls: 'zengrinder-arrow-line' });
const arrows = wrap.createEl('div', { cls: 'zengrinder-arrows' });
const caps = !!this.settings.arrowLineEnds;
if (caps) {
arrows.classList.add('has-caps');
arrows.createEl('span', { cls: 'zengrinder-arrow-cap', text: char });
}
for (let i = 0; i < this.settings.arrowCount; i++) arrows.createEl('span', { text: char });
if (caps) arrows.createEl('span', { cls: 'zengrinder-arrow-cap', text: char });
if (position === 'top') wrap.insertBefore(arrows, line);
line.style.cursor = 'ns-resize';
line.style.pointerEvents = 'auto';
line.addEventListener('pointerdown', e => {
if (e.pointerType === 'mouse' && e.button !== 0) return;
e.preventDefault(); e.stopPropagation();
this._startVerticalDrag(e, position, line);
});
arrows.style.cursor = 'ew-resize';
arrows.style.pointerEvents = 'auto';
arrows.addEventListener('pointerdown', e => {
if (e.pointerType === 'mouse' && e.button !== 0) return;
e.preventDefault(); e.stopPropagation();
this._startHorizontalDrag(e, arrows);
});
return wrap;
}
_startPointerDrag(e, el, cursor, onMove) {
if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (_) { zgCatch('_startPointerDrag: el.setPointerCapture(e.pointerId);', _); } }
document.body.style.cursor = cursor; document.body.style.userSelect = 'none';
const finish = (save) => {
el.removeEventListener('pointermove', onMove);
el.removeEventListener('pointerup', onUp);
el.removeEventListener('pointercancel', onCancel);
if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
try { el.releasePointerCapture(e.pointerId); } catch (_) { zgCatch('_startPointerDrag / finish: el.releasePointerCapture(e.pointerId);', _); }
}
document.body.style.cursor = ''; document.body.style.userSelect = '';
this._activeDragCleanup = null;
if (save) this.saveSettings();
};
const onUp = () => finish(true);
const onCancel = () => finish(false);
el.addEventListener('pointermove', onMove);
el.addEventListener('pointerup', onUp);
el.addEventListener('pointercancel', onCancel);
this._activeDragCleanup = () => finish(false);
}
_maskMaxPx(h) {
const base = Number(h) > 0 ? Number(h) : (window.innerHeight || 0);
return Math.max(ZG_MASK_MIN_PX, Math.floor(base * ZG_MASK_MAX_FRAC));
}
_startVerticalDrag(e, position, el) {
const startY = e.clientY;
const startH = (this.maskTopEl ? parseFloat(this.maskTopEl.style.height) : null)
|| (this.settings.letterboxPx != null ? this.settings.letterboxPx : (this.settings.letterboxLines || 8) * 26);
this._startPointerDrag(e, el, 'ns-resize', me => {
const dy = me.clientY - startY;
this.settings.letterboxPx = Math.min(this._maskMaxPx(), Math.max(ZG_MASK_MIN_PX,
startH + dy * (position === 'top' ? 1 : -1)));
this.scheduleMaskPosition();
});
}
_startHorizontalDrag(e, el) {
if (this.settings.maskMatchText) return;
const startX = e.clientX;
const startPad = this.settings.maskPaddingH || 0;
const cx = window.innerWidth / 2;
this._startPointerDrag(e, el, 'ew-resize', me => {
const dx = me.clientX - startX;
const wide = (this.maskTopEl && this.maskTopEl.offsetWidth) || window.innerWidth;
const cap = Math.max(0, Math.floor((wide - ZG_ARROWS_MIN_W) / 2));
this.settings.maskPaddingH = Math.max(0,
Math.min(cap, Math.round(startPad + dx * (startX < cx ? 1 : -1))));
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
if (this.retroStatusBarEl) { this.retroStatusBarEl.remove(); this.retroStatusBarEl = null; }
if (this.retroPlinthEl) { this.retroPlinthEl.remove(); this.retroPlinthEl = null; }
this._statusRowEls = [];
if (this._colorProbeEl) { this._colorProbeEl.remove(); this._colorProbeEl = null; }
this._themeSurfaceCache = null;
document.body.classList.remove('zg-retrobar-active');
this.stopClockTick();
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
this.scrollHandler = () => this.updateMaskVisibility();
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
if (this.arrowsTopEl) this.arrowsTopEl.classList.toggle('is-visible', scrollTop > 2);
if (this.arrowsBottomEl) this.arrowsBottomEl.classList.toggle('is-visible', scrollTop + clientHeight < scrollHeight - 2);
}
attachResizeHandler() {
if (this.windowResizeHandler) return;
this.windowResizeHandler = () => this.scheduleMaskPosition();
window.addEventListener('resize', this.windowResizeHandler);
try {
if (typeof ResizeObserver === 'function') {
this._bodyResizeObs = new ResizeObserver(() => this.scheduleMaskPosition());
this._bodyResizeObs.observe(document.body);
}
} catch (_) { }
}
detachResizeHandler() {
if (this._bodyResizeObs) {
try { this._bodyResizeObs.disconnect(); } catch (_) { zgCatch('detachResizeHandler: this._bodyResizeObs.disconnect();', _); }
this._bodyResizeObs = null;
}
if (!this.windowResizeHandler) return;
window.removeEventListener('resize', this.windowResizeHandler);
this.windowResizeHandler = null;
}
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
const ratioAbove = this.typewriterAnchorRatio();
const target = lineTop + lineHeight / 2 - scroller.clientHeight * ratioAbove;
if (Math.abs(scroller.scrollTop - target) < 1) return;
scroller.scrollTop = target;
}
typewriterAnchorRatio() {
const raw = this.settings.typewriterAnchor;
const pct = (raw == null || isNaN(Number(raw))) ? 50 : Number(raw);
return Math.max(0, Math.min(100, pct)) / 100;
}
setupEditorExtensions() {
if (!CM) return;
this.editorExtensions = [];
this.editorExtensions.push(...this.buildEditorExtensions());
this.registerEditorExtension(this.editorExtensions);
}
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
const PILCROW = Decoration.widget({ widget: new InvisibleWidget('¶'), side: 1 });
const NEWLINE = Decoration.widget({ widget: new InvisibleWidget('↵'), side: 1 });
const dimDeco = Decoration.line({ class: 'zg-dim-line' });
const dimText = Decoration.mark({ class: 'zg-dim-text' });
const spaceDeco = Decoration.mark({ class: 'zg-ws-space' });
const tabDeco = Decoration.mark({ class: 'zg-ws-tab' });
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
if (!view.hasFocus) return Decoration.none;
const doc = view.state.doc;
const head = view.state.selection.main.head;
const cur = doc.lineAt(head);
let pStart = cur.number, pEnd = cur.number;
while (pStart > 1 && doc.line(pStart - 1).text.trim() !== '') pStart--;
while (pEnd < doc.lines && doc.line(pEnd + 1).text.trim() !== '') pEnd++;
let focusFrom = doc.line(pStart).from;
let focusTo = doc.line(pEnd).to;
if (s.dimFocusMode === 'sentence') {
const paraText = doc.sliceString(focusFrom, focusTo);
const rel = Math.min(Math.max(head - focusFrom, 0), paraText.length);
const re = /[.!?\u2026]+["'\u201d\u2019)\]]*(\s+|$)/g;
let sFrom = 0, sTo = paraText.length, m;
while ((m = re.exec(paraText))) {
const termEnd = m.index + m[0].replace(/\s+$/, '').length;
const boundEnd = m.index + m[0].length;
if (boundEnd <= rel) { sFrom = boundEnd; }
else { sTo = termEnd; break; }
}
focusTo = focusFrom + sTo;
focusFrom = focusFrom + sFrom;
}
const b = new RangeSetBuilder();
for (const range of view.visibleRanges) {
let pos = range.from;
while (pos <= range.to) {
const line = doc.lineAt(pos);
if (line.to < focusFrom || line.from > focusTo) {
b.add(line.from, line.from, dimDeco);
} else {
if (line.from < focusFrom) b.add(line.from, Math.min(focusFrom, line.to), dimText);
if (focusTo < line.to) b.add(Math.max(focusTo, line.from), line.to, dimText);
}
pos = line.to + 1;
}
}
return b.finish();
}
}, { decorations: v => v.decorations });
const markerPlugin = ViewPlugin.fromClass(class {
constructor(view) { this.decorations = this.build(view); }
update(u) {
if (u.docChanged || u.viewportChanged) {
this.decorations = this.build(u.view);
}
}
build(view) {
const s = plugin.settings;
if (!s.pluginEnabled || !plugin.markerOpt('showHiddenMarkers', false)) return Decoration.none;
if (!plugin.isEditorInScope(view)) return Decoration.none;
const showSp = s.markSpaces, showTab = s.markTabs;
const showPar = s.markParagraphs, showEol = s.markEndOfLines;
if (!showSp && !showTab && !showPar && !showEol) return Decoration.none;
const doc = view.state.doc;
const b = new RangeSetBuilder();
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
const checkMark = {
filler: Decoration.mark({ class: 'zg-ck-filler' }),
passive: Decoration.mark({ class: 'zg-ck-passive' }),
illusion: Decoration.mark({ class: 'zg-ck-illusion' }),
hard: Decoration.mark({ class: 'zg-ck-hard' }),
veryhard: Decoration.mark({ class: 'zg-ck-veryhard' }),
repeat: Decoration.mark({ class: 'zg-ck-repeat' }),
misused: Decoration.mark({ class: 'zg-ck-misused' }),
pronoun: Decoration.mark({ class: 'zg-ck-pronoun' }),
dialogue: Decoration.mark({ class: 'zg-ck-dialogue' })
};
const posMark = {
noun: Decoration.mark({ class: 'zg-pos-noun' }),
verb: Decoration.mark({ class: 'zg-pos-verb' }),
adj: Decoration.mark({ class: 'zg-pos-adj' }),
adv: Decoration.mark({ class: 'zg-pos-adv' }),
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
const posOn = s.posEnabled ? {
noun: s.posNoun, verb: s.posVerb, adj: s.posAdjective,
adv: s.posAdverb, conj: s.posConjunction
} : {};
const checksOn = s.checksEnabled && (s.checkFiller || s.checkPassive ||
s.checkIllusion || s.checkMisused || s.checkPronoun ||
s.checkRhythm || s.checkRepetition || s.checkDialogue);
if (!Object.keys(posOn).some(k => posOn[k]) && !checksOn) return Decoration.none;
if (!plugin.isEditorInScope(view)) return Decoration.none;
const doc = view.state.doc;
const skip = s.syntaxSkipCode ? plugin.getNonProseLines(doc) : null;
const out = [];
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
const base = line.from;
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
if (s.checkPronoun && isVaguePronoun(t, ti + 1 < tokens.length ? tokens[ti + 1] : null)) {
out.push(checkMark.pronoun.range(base + t.from, base + t.to));
}
}
if (s.checkDialogue) {
for (const q of findDialogue(line.text)) {
out.push(checkMark.dialogue.range(base + q.from, base + q.to));
}
}
if (s.checkRhythm) {
for (const sent of splitSentences(masked)) {
const st = tokenizeLine(sent.text);
if (st.length < 4) continue;
const grade = sentenceGrade(st);
const veryAt = s.checkRhythmVeryHardGrade != null ? s.checkRhythmVeryHardGrade : 14;
const hardAt = s.checkRhythmHardGrade != null ? s.checkRhythmHardGrade : 10;
const mark = grade >= veryAt ? checkMark.veryhard
: grade >= hardAt ? checkMark.hard
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
const win = s.repetitionWindow != null ? s.repetitionWindow : 50;
const min = s.repetitionMinLength != null ? s.repetitionMinLength : 5;
for (const r of findRepetitions(seen, win, min)) {
out.push(checkMark.repeat.range(r.from, r.to));
}
}
return Decoration.set(out, true);
}
}, { decorations: v => v.decorations });
const paraFirstDeco = Decoration.line({ class: 'zg-para-first' });
const paraBodyDeco = Decoration.line({ class: 'zg-para-line' });
const paraPlugin = ViewPlugin.fromClass(class {
constructor(view) { this.decorations = this.build(view); }
update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
build(view) {
const s = plugin.settings;
if (!s.pluginEnabled || !plugin.textOpt('enableParagraphIndent', false)) return Decoration.none;
if (!plugin.isEditorInScope(view)) return Decoration.none;
const doc = view.state.doc;
const info = plugin.getParagraphLines(doc);
const single = s.paragraphIndentMode === 'single';
const wanted = single ? info.body : info.first;
const deco = single ? paraBodyDeco : paraFirstDeco;
const out = [];
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
const panelWatcher = CM.ViewPlugin.fromClass(class {
constructor(view) { this.sync(view); }
update(u) { this.sync(u.view); }
destroy() { document.body.classList.remove('zg-vim-panel-open'); }
sync(view) {
let open = false, panel = null;
try { panel = view.dom.querySelector('.cm-panels-bottom'); open = !!panel; } catch (_) { zgCatch('buildEditorExtensions / sync: panel = view.dom.querySelector(\'.cm-panels-bottom\');', _); }
document.body.classList.toggle('zg-vim-panel-open', open);
if (open !== plugin._vimPanelOpen) {
plugin._vimPanelOpen = open;
try {
document.documentElement.style.setProperty(
'--zg-vim-gutter', plugin.vimGutterHeight() + 'px');
} catch (_) { zgCatch('buildEditorExtensions / sync: document.documentElement.style.setProperty(', _); }
plugin.updateRetroStatusBar();
}
plugin.scheduleMaskPosition();
if (!open) return;
requestAnimationFrame(() => {
try {
if (!panel.isConnected) return;
const h = Math.round(panel.getBoundingClientRect().height);
if (!(h > 0) || h > 120) return;
if (Math.abs((plugin.settings.vimPanelHeight || 0) - h) < 1) return;
plugin.settings.vimPanelHeight = h;
document.documentElement.style.setProperty(
'--zg-vim-gutter', plugin.vimGutterHeight() + 'px');
plugin.scheduleMaskPosition();
plugin.saveSettings(true);
} catch (_) { zgCatch('buildEditorExtensions / sync: if (!panel.isConnected) return;', _); }
});
}
});
const eofTildePlugin = ViewPlugin.fromClass(class {
constructor(view) {
this.view = view;
this.el = document.createElement('div');
this.el.className = 'zg-eof-tildes';
this.el.style.display = 'none';
view.dom.appendChild(this.el);
this.measure = { read: () => this.read(), write: (m) => this.write(m) };
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
read() {
const view = this.view;
const s = plugin.settings;
if (!s.pluginEnabled || !plugin.markerOpt('showHiddenMarkers', false)
|| !s.markBlankLines) return null;
if (!plugin.isEditorInScope(view)) return null;
const scRect = view.scrollDOM.getBoundingClientRect();
const cRect = view.contentDOM.getBoundingClientRect();
const cStyle = getComputedStyle(view.contentDOM);
let textBottom;
try {
textBottom = view.documentTop
+ view.lineBlockAt(view.state.doc.length).bottom;
} catch (_) {
textBottom = cRect.bottom - (parseFloat(cStyle.paddingBottom) || 0);
}
const lineH = view.defaultLineHeight || 24;
const startY = Math.max(textBottom, scRect.top);
const height = scRect.bottom - startY;
if (height < lineH * 0.5) return { hide: true };
const domRect = view.dom.getBoundingClientRect();
return {
top: startY - domRect.top,
left: (cRect.left - domRect.left) + (parseFloat(cStyle.paddingLeft) || 0),
lineH,
font: cStyle.fontFamily,
size: cStyle.fontSize,
weight: cStyle.fontWeight,
count: Math.min(500, Math.ceil(height / lineH))
};
}
write(m) {
if (!m || m.hide || !(m.count > 0)) { this.el.style.display = 'none'; return; }
const st = this.el.style;
st.display = '';
st.top = m.top + 'px';
st.left = m.left + 'px';
st.lineHeight = m.lineH + 'px';
st.fontFamily = m.font;
st.fontSize = m.size;
st.fontWeight = m.weight;
this.el.textContent = '~\n'.repeat(m.count);
}
});
const caretFloor = CM.EditorView.scrollMargins.of((view) => {
try {
if (!plugin.editorViewIsNote(view)) return null;
const r = view.scrollDOM.getBoundingClientRect();
const below = Math.round(r.bottom - plugin.caretFloorY());
const above = Math.round(plugin.caretCeilingY() - r.top);
const margins = {};
if (below > 1) margins.bottom = below;
if (above > 1) margins.top = above;
return (margins.top || margins.bottom) ? margins : null;
} catch (_) { return null; }
});
const numberPlugin = ViewPlugin.fromClass(class {
constructor(view) { this.decorations = this.build(view); }
update(u) {
if (u.docChanged || u.viewportChanged) {
this.decorations = this.build(u.view);
}
}
build(view) {
const b = new RangeSetBuilder();
if (!plugin.settings.paragraphNumbers || !plugin.isActiveFileInScope()) {
return b.finish();
}
const doc = view.state.doc;
const paraOf = new Map();
{
const lines = doc.toString().split('\n');
const skip = scanNonProseLines(lines);
let n = 0, open = false;
for (let i = 0; i < lines.length; i++) {
const ln = i + 1;
const raw = lines[i];
const t = raw.trim();
if (!t || skip.has(ln)) { open = false; continue; }
if (/^(#{1,6}\s|>|\||\s*([-*+]\s|\d+[.)]\s)|\s*(-{3,}|\*{3,}|_{3,})\s*$)/.test(raw)) {
open = false;
continue;
}
if (!open) { n++; open = true; paraOf.set(ln, n); }
}
}
for (const { from, to } of view.visibleRanges) {
let pos = from;
while (pos <= to) {
const line = doc.lineAt(pos);
if (paraOf.has(line.number)) {
b.add(line.from, line.from, Decoration.line({
attributes: { 'data-zg-pnum': String(paraOf.get(line.number)) }
}));
}
if (line.to + 1 <= pos) break;
pos = line.to + 1;
}
}
return b.finish();
}
}, { decorations: v => v.decorations });
return [dimPlugin, markerPlugin, syntaxPlugin, paraPlugin, panelWatcher, eofTildePlugin, caretFloor, numberPlugin]
.concat(this.buildHemingwayExtensions())
.concat(this.buildTypographyExtension())
.concat(this.buildTypographyRevertKeymap());
}
buildTypographyExtension() {
if (!CM || !CM.EditorView || !this.settings.typographyEnabled) return [];
const plugin = this;
const handler = CM.EditorView.inputHandler.of((view, from, to, text) => {
if (text.length !== 1) return false;
const s = plugin.settings;
if (!s.pluginEnabled || !plugin.isEditorInScope(view)) return false;
const doc = view.state.doc;
const line = doc.lineAt(from);
if (plugin.getNonProseLines(doc).has(line.number)) return false;
const before = doc.sliceString(line.from, from);
if ((before.match(/`/g) || []).length % 2 === 1) return false;
if ((before.match(/\$/g) || []).length % 2 === 1) return false;
const groupOn = {
ellipsis: s.typoEllipsis,
dashes: s.typoDashes,
arrows: s.typoArrows,
guillemets: s.typoGuillemets,
comparisons: s.typoComparisons,
fractions: s.typoFractions
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
const prev = lookback.charAt(lookback.length - 1);
if (from === to) {
const ahead = doc.sliceString(from, from + 1);
const cust = s.typoCustomQuotes;
const at = (k, f) => {
const v = cust ? s[k] : '';
return (typeof v === 'string' && v.length) ? v : f;
};
const closer = text === '"'
? at('typoCloseDouble', '\u201d')
: at('typoCloseSingle', '\u2019');
if (ahead && ahead === closer) {
view.dispatch({
selection: { anchor: from + 1 },
userEvent: 'select.typography'
});
return true;
}
}
const opens = prev === '' || TYPO_OPENS_AFTER.test(prev);
const custom = s.typoCustomQuotes;
const pick = (key, fallback) => {
const v = custom ? s[key] : '';
return (typeof v === 'string' && v.length) ? v : fallback;
};
const openCh = pick('typoOpenSingle', '\u2018');
const closeCh = pick('typoCloseSingle', '\u2019');
const opens_ = before.split(openCh).length - 1;
const closes_ = openCh === closeCh ? 0 : before.split(closeCh).length - 1;
const inQuote = opens_ > closes_;
const midWord = /[\p{L}\p{N}]/u.test(prev) && !inQuote;
const glyph = text === '"'
? (opens ? pick('typoOpenDouble', '\u201c') : pick('typoCloseDouble', '\u201d'))
: (opens ? openCh : midWord ? pick('typoApostrophe', '\u2019') : closeCh);
let tail = '';
if (opens) {
tail = text === '"'
? pick('typoCloseDouble', '\u201d')
: closeCh;
}
plugin.applyTypography(view, from, to, text, text, glyph, tail);
return true;
}
return false;
});
return [CM.Prec ? CM.Prec.highest(handler) : handler];
}
applyTypography(view, from, to, typed, matched, glyph, tail) {
const after = typeof tail === 'string' ? tail : '';
view.dispatch({
changes: { from, to, insert: typed },
selection: { anchor: from + typed.length },
userEvent: 'input.type'
});
const end = from + typed.length;
const start = end - matched.length;
const spec = {
changes: { from: start, to: end, insert: glyph + after },
selection: { anchor: start + glyph.length },
userEvent: 'input.typography'
};
if (CM.isolateHistory) spec.annotations = CM.isolateHistory.of('before');
view.dispatch(spec);
this._lastTypo = {
from: start,
to: start + glyph.length + after.length,
caret: start + glyph.length,
glyph: glyph + after,
original: matched,
time: Date.now()
};
}
buildTypographyRevertKeymap() {
if (!CM || !CM.keymap || !this.settings.typographyEnabled) return [];
const plugin = this;
const km = CM.keymap.of([{ key: 'Backspace', run: (view) => {
const t = plugin._lastTypo;
if (!t || Date.now() - t.time > 5000) return false;
if (!plugin.isEditorInScope(view)) return false;
const sel = view.state.selection.main;
if (!sel.empty || sel.from !== (t.caret != null ? t.caret : t.to)) return false;
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
buildHemingwayExtensions() {
if (!CM || !CM.keymap || !this.settings.hemingwayEnabled) return [];
const plugin = this;
const s = () => plugin.settings;
const { keymap, EditorView, Prec } = CM;
const blocked = (view, what) => {
if (view && !plugin.isEditorInScope(view)) return false;
plugin.flashHemingway();
plugin.hemingwaySay(what);
return true;
};
const keyWhat = (key) => {
if (/Backspace|Ctrl-h/.test(key)) return 'backspace';
if (/Delete|Ctrl-d/.test(key) && !/Shift-Delete/.test(key)) return 'delete';
if (/Mod-z|Mod-y/.test(key)) return 'undo';
if (/Mod-x|Shift-Delete/.test(key)) return 'cut';
if (/Mod-v|Mod-Shift-v/.test(key)) return 'paste';
if (/Mod-a/.test(key)) return 'select all';
if (/Arrow/.test(key)) return 'the arrow keys';
if (/Home|End|Page/.test(key)) return 'the jump keys';
return 'that key';
};
const locked = (view) => plugin.isEditorInScope(view);
const keys = new Set();
const addKeys = (...ks) => ks.forEach(k => keys.add(k));
const c = this.settings;
if (c.hemBlockBackspace) addKeys('Backspace', 'Shift-Backspace', 'Mod-Backspace', 'Alt-Backspace', 'Ctrl-h');
if (c.hemBlockDelete) addKeys('Delete', 'Mod-Delete', 'Alt-Delete', 'Ctrl-d');
if (c.hemBlockUndo) addKeys('Mod-z', 'Mod-Shift-z', 'Mod-y');
if (c.hemBlockCut) addKeys('Mod-x', 'Shift-Delete');
if (c.hemBlockPaste) addKeys('Mod-v', 'Mod-Shift-v');
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
keys.forEach(key => binds.push({ key, run: (view) => blocked(view, keyWhat(key)), preventDefault: true }));
const handlers = EditorView ? EditorView.domEventHandlers({
beforeinput(e, view) {
if (!locked(view)) return false;
const t = (e && e.inputType) || '';
const k = plugin.settings;
if (k.hemBlockBackspace && /^delete(ContentBackward|WordBackward|SoftLineBackward|HardLineBackward)$/.test(t)) return blocked(view, 'backspace');
if (k.hemBlockDelete && /^delete(ContentForward|WordForward|SoftLineForward|HardLineForward)$/.test(t)) return blocked(view, 'delete');
if (k.hemBlockBackspace && t === 'deleteContent') return blocked(view, 'backspace');
if (k.hemBlockUndo && (t === 'historyUndo' || t === 'historyRedo')) return blocked(view, 'undo');
if (k.hemBlockCut && t === 'deleteByCut') return blocked(view, 'cut');
if (k.hemBlockPaste && /^insertFromPaste/.test(t)) return blocked(view, 'paste');
if (k.hemBlockMouse && t === 'deleteByDrag') return blocked(view, 'dragging text');
if (k.hemBlockBackspace && /^insert/.test(t)) {
try {
if (view && !view.state.selection.main.empty) return blocked(view, 'typing over a selection');
} catch (_) { }
}
return false;
},
cut(e, view) { return plugin.settings.hemBlockCut ? blocked(view, 'cut') : false; },
paste(e, view) { return plugin.settings.hemBlockPaste ? blocked(view, 'paste') : false; },
mousedown(e, view) {
if (!plugin.settings.hemBlockMouse || !locked(view)) return false;
if (!view.hasFocus) { view.focus(); return true; }
return blocked(view, 'the mouse');
},
contextmenu(e, view) { return plugin.settings.hemBlockMouse ? blocked(view, 'the mouse') : false; },
dragstart(e, view) { return plugin.settings.hemBlockMouse ? blocked(view, 'the mouse') : false; },
drop(e, view) { return plugin.settings.hemBlockMouse ? blocked(view, 'the mouse') : false; }
}) : null;
const exts = [];
const km = keymap.of(binds);
exts.push(Prec ? Prec.highest(km) : km);
if (handlers) exts.push(Prec ? Prec.highest(handlers) : handlers);
return exts;
}
hemingwaySay(what) {
if (this._hemSaid) return false;
this._hemSaid = true;
try {
new Notice('Word-Smith: Hemingway mode is on — ' + (what || 'that key')
+ ' is blocked while it is. Settings → Hemingway to change what it blocks.', 8000);
} catch (_) { zgCatch('hemingwaySay: new Notice(\'Word-Smith: Hemingway mode is on — \' + (what || \'that …', _); }
return true;
}
flashHemingway() {
const target = this.settings.hemFlashTarget || 'screen';
if (target === 'none') return;
if (target === 'icon') this.flashHemingwayIcon();
if (target === 'screen' || target === 'both') this.flashHemingwayScreen();
if (target === 'retrobar' || target === 'both') this.flashHemingwayBar();
}
flashHemingwayIcon() {
const el = document.querySelector('.zg-barbtn-modes');
if (!el) return;
el.classList.remove('zg-hem-blocked');
void el.offsetWidth;
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
void el.offsetWidth;
el.classList.add('is-on');
if (this._hemScreenTimer) window.clearTimeout(this._hemScreenTimer);
this._hemScreenTimer = window.setTimeout(() => {
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
vimApi() {
const routes = [
() => this.isMobileApp() ? null : require('@replit/codemirror-vim').Vim,
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
} catch (_) { }
}
return null;
}
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
for (const [from] of PAIRS) {
Vim.unmap(from, 'normal');
Vim.unmap(from, 'visual');
}
this._vimMapped = false;
}
} catch (_) { return false; }
return true;
}
scheduleVimMotionMaps(tries) {
if (this.applyVimMotionMaps()) return;
const left = (tries == null ? 20 : tries) - 1;
if (left <= 0) return;
window.setTimeout(() => this.scheduleVimMotionMaps(left), 250);
}
explorerSortWanted() {
const s = this.settings || {};
return !!(s.pluginEnabled && s.treeOrder);
}
explorerViews() {
try {
return (this.app.workspace.getLeavesOfType('file-explorer') || [])
.filter(l => l && !l.isDeferred)
.map(l => l && l.view).filter(v => !!v);
} catch (_) { return []; }
}
capMissing(id) {
const item = ZG_INTERNALS.filter((i) => i.id === id)[0];
if (!item) return false;
if (!this.caps || typeof this.caps !== 'object') this.caps = {};
this.caps[id] = false;
this._capSaid = this._capSaid || {};
if (this._capSaid[id]) return true;
this._capSaid[id] = true;
try {
console.warn('Word-Smith: ' + item.where + ' did not offer ' + item.what
+ ', so ' + item.without);
} catch (_) { zgCatch('capMissing: console.warn(\'Word-Smith: \' + item.where + \' did not offer \' + …', _); }
return true;
}
patchExplorerSortMenu(view) {
if (view._zgMenuPatched) return;
if (typeof view.onHeaderMenu !== 'function') {
this.capMissing('sortMenu');
return;
}
view._zgMenuPatched = true;
const origMenu = view.onHeaderMenu;
view._zgMenuOrig = origMenu;
view.onHeaderMenu = (menu) => {
try { origMenu.call(view, menu); } catch (e) { throw e; }
try {
menu.addSeparator();
menu.addItem((i) => i
.setTitle('Custom sort')
.setChecked(!!this.settings.treeOrder)
.onClick(async () => {
this.settings.treeOrder = !this.settings.treeOrder;
await this.saveSettings();
this.patchExplorerSort();
}));
} catch (_) { zgCatch('patchExplorerSortMenu: menu.addSeparator();', _); }
};
if (typeof view.setSortOrder === 'function') {
const origSort = view.setSortOrder;
view._zgSortOrderOrig = origSort;
view.setSortOrder = (order) => {
if (this.settings.treeOrder) {
this.settings.treeOrder = false;
this.saveSettings();
this.unpatchExplorerSort();
}
return origSort.call(view, order);
};
}
}
attachSortMenuRow() {
if (this._zgSortRowBound) return;
this._zgSortRowBound = true;
this.registerDomEvent(document, 'click', (ev) => {
if (!this.settings || !this.settings.pluginEnabled) return;
const t = ev.target;
if (!t || !t.closest) return;
const btn = t.closest('.workspace-leaf-content[data-type="file-explorer"] '
+ '.nav-buttons-container .clickable-icon');
if (!btn) return;
const said = (btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('title') || '');
if (!/sort/i.test(said) && btn.getAttribute('data-zg-sort') !== '1') return;
let tries = 0;
const look = () => {
const menus = document.querySelectorAll('body > .menu');
const menu = menus.length ? menus[menus.length - 1] : null;
if (menu && !menu.querySelector('.zg-menu-msorder')) {
this.addSortMenuRow(menu);
return;
}
if (++tries < 8) window.requestAnimationFrame(look);
};
window.requestAnimationFrame(look);
}, true);
}
addSortMenuRow(menu) {
try {
const scroll0 = (menu.querySelector && menu.querySelector('.menu-scroll')) || menu;
const already = Array.from(scroll0.querySelectorAll('.menu-item-title'))
.some(t => (t.textContent || '').trim() === 'Custom sort');
if (already) return;
const scroll = (menu.querySelector && menu.querySelector('.menu-scroll')) || menu;
scroll.createDiv({ cls: 'menu-separator' });
const group = scroll.createDiv({ cls: 'menu-group' });
const on = !!this.settings.treeOrder;
const item = group.createDiv({
cls: 'menu-item tappable zg-menu-msorder' + (on ? ' mod-checked' : '') });
const icon = item.createDiv({ cls: 'menu-item-icon' });
icon.innerHTML = zgManuscriptSvg(16);
item.createDiv({ cls: 'menu-item-title', text: 'Custom sort' });
if (on) {
const tick = item.createDiv({ cls: 'menu-item-icon mod-checked' });
try { if (setIcon) setIcon(tick, 'check'); } catch (_) { tick.setText('\u2713'); }
for (const other of Array.from(scroll.querySelectorAll('.menu-item.mod-checked'))) {
if (other === item) continue;
try {
other.removeClass('mod-checked');
for (const t of Array.from(other.querySelectorAll('.menu-item-icon.mod-checked'))) {
t.detach ? t.detach() : t.remove();
}
} catch (_) { zgCatch('addSortMenuRow: other.removeClass(\'mod-checked\');', _); }
}
}
item.addEventListener('mouseenter', () => {
try {
for (const el of Array.from(scroll.querySelectorAll('.menu-item.selected'))) {
el.removeClass('selected');
}
} catch (_) { zgCatch('addSortMenuRow: for (const el of Array.from(scroll.querySelectorAll(\'.menu-item.select …', _); }
item.addClass('selected');
});
item.addEventListener('mouseleave', () => item.removeClass('selected'));
item.addEventListener('click', async (ev) => {
ev.preventDefault();
ev.stopPropagation();
this.settings.treeOrder = !this.settings.treeOrder;
await this.saveSettings();
this.patchExplorerSort();
try { menu.hide(); } catch (_) { zgCatch('addSortMenuRow: menu.hide();', _); }
});
} catch (_) { zgCatch('addSortMenuRow: const scroll0 = (menu.querySelector && …', _); }
}
unpatchExplorerSortMenu(view) {
if (!view._zgMenuPatched) return;
try { if (view._zgMenuOrig) view.onHeaderMenu = view._zgMenuOrig; } catch (_) { zgCatch('unpatchExplorerSortMenu: if (view._zgMenuOrig) view.onHeaderMenu = view._zgMenuOrig;', _); }
try { if (view._zgSortOrderOrig) view.setSortOrder = view._zgSortOrderOrig; } catch (_) { zgCatch('unpatchExplorerSortMenu: if (view._zgSortOrderOrig) view.setSortOrder = view._zgSortOrderOrig;', _); }
view._zgMenuPatched = false;
view._zgMenuOrig = null;
view._zgSortOrderOrig = null;
}
patchExplorerSort() {
if (this.settings && this.settings.pluginEnabled) {
for (const view of this.explorerViews()) {
try { this.patchExplorerSortMenu(view); } catch (_) { zgCatch('patchExplorerSort: this.patchExplorerSortMenu(view);', _); }
}
}
try { this.paintExplorerSortIcon(); } catch (_) { zgCatch('patchExplorerSort: this.paintExplorerSortIcon();', _); }
try { this.attachSortMenuRow(); } catch (_) { zgCatch('patchExplorerSort: this.attachSortMenuRow();', _); }
if (!this.explorerSortWanted()) { this.unpatchExplorerSort(); return; }
try { this.attachTreeDrag(); } catch (_) { zgCatch('patchExplorerSort: this.attachTreeDrag();', _); }
if (!this._structStore && !this._treeOrderLoading) {
this._treeOrderLoading = true;
this.treeOrderLoad().then(() => {
this._treeOrderLoading = false;
this.repaintExplorerOrder();
}).catch(() => { this._treeOrderLoading = false; });
}
for (const view of this.explorerViews()) {
if (view._zgSortPatched) continue;
if (typeof view.getSortedFolderItems !== 'function') {
this.capMissing('explorerSort');
continue;
}
view._zgSortOwn = Object.prototype.hasOwnProperty.call(view, 'getSortedFolderItems');
view._zgSortOrig = view.getSortedFolderItems;
const orig = view._zgSortOrig;
view.getSortedFolderItems = (folder) => {
let items = [];
try { items = orig.call(view, folder); } catch (e) { throw e; }
try { return this.sortFolderItems(folder, items); } catch (_) { return items; }
};
view._zgSortPatched = true;
}
this.repaintExplorerOrder();
}
unpatchExplorerSort() {
for (const view of this.explorerViews()) {
if (!view._zgSortPatched) continue;
try {
if (view._zgSortOwn) view.getSortedFolderItems = view._zgSortOrig;
else delete view.getSortedFolderItems;
} catch (_) { zgCatch('unpatchExplorerSort: if (view._zgSortOwn) view.getSortedFolderItems = view._zgSortOrig;', _); }
view._zgSortPatched = false;
view._zgSortOrig = null;
}
this.repaintExplorerOrder();
}
repaintExplorerOrder() {
for (const view of this.explorerViews()) {
let done = false;
try {
if (typeof view.requestSort === 'function') { view.requestSort(); done = true; }
} catch (_) { zgCatch('repaintExplorerOrder: if (typeof view.requestSort === \'function\') view.requestSort();', _); }
if (!done) {
try {
const scroll = view.tree && view.tree.infinityScroll;
if (scroll && typeof scroll.compute === 'function') { scroll.compute(); done = true; }
} catch (_) { zgCatch('repaintExplorerOrder: const scroll = view.tree && view.tree.infinityScroll;', _); }
}
if (!done) {
try {
const root = view.fileItems && view.fileItems['/'];
if (root && typeof root.updateChildren === 'function') {
root.updateChildren();
done = true;
}
} catch (_) { zgCatch('repaintExplorerOrder: const root = view.fileItems && view.fileItems[\'/\'];', _); }
}
if (!done) this.capMissing('explorerResort');
}
}
sortFolderItems(folder, items) {
const list = Array.isArray(items) ? items : [];
if (!list.length) return list;
const path = (folder && folder.path && folder.path !== '/') ? folder.path : '';
const order = this.treeOrderFor(path);
if (!order.length) return list;
const at = new Map();
for (let i = 0; i < order.length; i++) if (!at.has(order[i])) at.set(order[i], i);
const ranked = [], rest = [];
for (const it of list) {
const p = it && it.file && it.file.path;
if (p && at.has(p)) ranked.push(it); else rest.push(it);
}
ranked.sort((a, b) => at.get(a.file.path) - at.get(b.file.path));
return ranked.concat(rest);
}
treeOrderCurrent(folderPath) {
const out = [];
try {
const folder = this.app.vault.getAbstractFileByPath(folderPath || '/');
const kids = (folder && folder.children) || [];
const stored = this.treeOrderFor(folderPath || '');
const at = new Map();
for (let i = 0; i < stored.length; i++) if (!at.has(stored[i])) at.set(stored[i], i);
const ranked = [], rest = [];
for (const c of kids) {
if (!c || !c.path) continue;
if (at.has(c.path)) ranked.push(c.path); else rest.push(c.path);
}
ranked.sort((a, b) => at.get(a) - at.get(b));
rest.sort((a, b) => (this.exportNatural
? this.exportNatural(a.split('/').pop(), b.split('/').pop())
: a.localeCompare(b)));
out.push(...ranked, ...rest);
} catch (_) { zgCatch('treeOrderCurrent: const folder = this.app.vault.getAbstractFileByPath(folderPath || …', _); }
return out;
}
async treeOrderMove(folderPath, movedPath, beforePath) {
const now = this.treeOrderCurrent(folderPath);
const from = now.indexOf(movedPath);
if (from === -1) return false;
now.splice(from, 1);
let to = beforePath == null ? now.length : now.indexOf(beforePath);
if (to === -1) to = now.length;
now.splice(to, 0, movedPath);
await this.treeOrderWrite(folderPath || '', now);
return true;
}
treeDragZone() { return 0.2; }
attachTreeDrag() {
if (this._zgTreeDragBound) return;
this._zgTreeDragBound = true;
const inExplorer = (el) => !!(el && el.closest
&& el.closest('.workspace-leaf-content[data-type="file-explorer"]'));
const rowUnder = (ev) => {
const t = ev.target;
if (!t || !t.closest || !inExplorer(t)) return null;
return t.closest('.nav-file-title, .nav-folder-title');
};
this.registerDomEvent(document, 'dragstart', (ev) => {
this._zgDragPath = null;
if (!this.explorerSortWanted()) return;
const row = rowUnder(ev);
this._zgDragPath = (row && row.dataset && row.dataset.path) || null;
}, true);
this.registerDomEvent(document, 'dragover', (ev) => {
this.treeStopSpringLoad();
const aim = this.treeDropAim(ev, rowUnder(ev));
this.paintTreeDrop(aim);
if (!aim) return;
ev.preventDefault();
ev.stopPropagation();
try { ev.dataTransfer.dropEffect = 'move'; } catch (_) { zgCatch('attachTreeDrag: ev.dataTransfer.dropEffect = \'move\';', _); }
}, true);
this.registerDomEvent(document, 'drop', (ev) => {
const aim = this.treeDropAim(ev, rowUnder(ev));
this.paintTreeDrop(null);
if (!aim) return;
ev.preventDefault();
ev.stopPropagation();
const moved = this._zgDragPath;
this._zgDragPath = null;
this.treeOrderMove(aim.parent, moved, aim.before);
}, true);
this.registerDomEvent(document, 'dragend', () => {
this._zgDragPath = null;
this.paintTreeDrop(null);
}, true);
this.registerDomEvent(document, 'dragleave', (ev) => {
if (ev.target === document || !rowUnder(ev)) this.paintTreeDrop(null);
}, true);
}
treeStopSpringLoad() {
try {
for (const view of this.explorerViews()) {
if (view && 'lastDropTargetEl' in view) view.lastDropTargetEl = null;
}
} catch (_) { zgCatch('treeStopSpringLoad: for (const view of this.explorerViews())', _); }
}
treeDropAim(ev, row) {
if (!this.explorerSortWanted()) return null;
const moved = this._zgDragPath;
if (!moved || !row || !row.dataset) return null;
const over = row.dataset.path;
if (!over || over === moved) return null;
const parent = (p) => {
const cut = String(p).lastIndexOf('/');
return cut === -1 ? '' : p.slice(0, cut);
};
if (parent(moved) !== parent(over)) return null;
let rect = null;
try { rect = row.getBoundingClientRect(); } catch (_) { return null; }
if (!rect || !rect.height) return null;
const at = (ev.clientY - rect.top) / rect.height;
const edge = this.treeDragZone();
if (at > edge && at < 1 - edge) return null;
const above = at <= edge;
let before = over;
if (!above) {
const now = this.treeOrderCurrent(parent(over));
const next = now[now.indexOf(over) + 1];
before = next == null ? null : next;
}
return { parent: parent(over), row, above, before };
}
paintTreeDrop(aim) {
const was = this._zgDropRow;
if (was && was !== (aim && aim.row)) {
try { was.removeClass('zg-drop-above'); was.removeClass('zg-drop-below'); } catch (_) { zgCatch('paintTreeDrop: was.removeClass(\'zg-drop-above\');', _); }
this._zgDropRow = null;
}
if (!aim || !aim.row) return;
this._zgDropRow = aim.row;
try {
aim.row.toggleClass('zg-drop-above', !!aim.above);
aim.row.toggleClass('zg-drop-below', !aim.above);
} catch (_) { zgCatch('paintTreeDrop: aim.row.toggleClass(\'zg-drop-above\', !!aim.above);', _); }
}
attachExplorerObserver() {
this.detachExplorerObserver();
this.scheduleExplorerPatch();
this.explorerObserver = new MutationObserver((recs) => {
if (!this.explorerRecordsMatter(recs)) return;
this.scheduleExplorerPatch();
});
const targets = document.querySelectorAll(
'.workspace-leaf-content[data-type="file-explorer"], .workspace-leaf-content[data-type="outline"]');
targets.forEach(t => this.explorerObserver.observe(t, { childList: true, subtree: true }));
}
explorerRecordsMatter(recs) {
const ours = (n) => {
const c = n && n.classList;
if (!c) return false;
return c.contains('zg-count') || c.contains('zg-treeflag')
|| c.contains('zg-treepct') || c.contains('zg-tasks')
|| c.contains('zg-treemarks') || c.contains('zg-foldericon')
|| c.contains('zg-treetick');
};
for (const m of (recs || [])) {
const nodes = Array.from(m.addedNodes || [])
.concat(Array.from(m.removedNodes || []));
if (!nodes.length) return true;
for (const n of nodes) if (!ours(n)) return true;
}
return false;
}
detachExplorerObserver() {
if (this.explorerObserver) { this.explorerObserver.disconnect(); this.explorerObserver = null; }
}
explorerWanted() {
const s = this.settings || {};
const REASONS = [
() => s.enableFileTreeCounts,
() => s.enableOutlineCounts,
() => s.fileTreeFlags,
() => s.fileTreeFolderIcons,
() => s.fileTreeKindIcons,
() => s.fileTreeTasks,
() => s.fileTreeGoals,
() => s.folderColors && Object.keys(s.folderColors).length,
() => s.treeOrder
];
for (const why of REASONS) {
try { if (why()) return true; } catch (_) { zgCatch('explorerWanted: if (why()) return true;', _); }
}
return false;
}
repaintExplorerFlag(path) {
if (!path || !this.settings.fileTreeFlags) return;
try {
const sel = '.nav-file-title[data-path="' + String(path).replace(/"/g, '\\"') + '"]';
for (const el of Array.from(document.querySelectorAll(sel))) {
this.setFlagBadge(el, path, false);
}
} catch (_) { zgCatch('repaintExplorerFlag: const sel = \'.nav-file-title[data-path="\' + String(path).replace(/"/g, …', _); }
}
scheduleExplorerPatch() {
if (this._patchRunning) { this._patchAgain = true; return; }
if (this._patchScheduled) return;
this._patchScheduled = true;
zgSoon(() => {
this._patchScheduled = false;
if (!this._passState) this._passState = zgPassState();
if (zgPassStorm(this._passState, Date.now())) {
this._passState = zgPassState();
try { this.detachExplorerObserver(); } catch (_) { zgCatch('scheduleExplorerPatch: this.detachExplorerObserver();', _); }
try {
new Notice('Word-Smith: the file tree kept asking to be '
+ 'redrawn, so its counts and marks are paused. Reopen the '
+ 'pane to try again, or switch them off in Settings \u2192 '
+ 'File tree.', 15000);
} catch (_) { zgCatch('scheduleExplorerPatch: new Notice(\'Word-Smith: the file tree kept asking to be \'', _); }
try {
console.error('Word-Smith: the file-tree painter ran more than '
+ ZG_STORM_PASSES + ' times in ' + (ZG_STORM_MS / 1000)
+ 's and has been stopped.');
} catch (_) { zgCatch('scheduleExplorerPatch: console.error(\'Word-Smith: the file-tree painter ran more than \'', _); }
return;
}
this._patchRunning = true;
Promise.resolve()
.then(() => this.patchExplorerDOM())
.catch(() => {})
.then(() => {
this._patchRunning = false;
try {
if (this.explorerObserver) this.explorerObserver.takeRecords();
} catch (_) { zgCatch('scheduleExplorerPatch: if (this.explorerObserver) this.explorerObserver.takeRecords();', _); }
if (this._patchAgain) {
this._patchAgain = false;
this.scheduleExplorerPatch();
}
});
});
}
async patchExplorerDOM() {
if (!this.settings.pluginEnabled) return;
this.paintExplorerSortIcon();
this.paintExplorerFolderColours();
this.paintExplorerRoots();
if (this.settings.enableFileTreeCounts || this.settings.fileTreeFlags) {
const roots = document.querySelectorAll('.workspace-leaf-content[data-type="file-explorer"]');
for (let ri = 0; ri < roots.length; ri++) {
const root = roots[ri];
const tiles = root.querySelectorAll('.nav-file-title');
const jobs = [];
for (let i = 0; i < tiles.length; i++) {
const path = tiles[i].dataset && tiles[i].dataset.path;
if (!path) continue;
this.setFlagBadge(tiles[i], path, false);
if (this.settings.enableFileTreeCounts && path.endsWith('.md')) {
jobs.push(this.applyFileWordCount(tiles[i], path));
}
}
await Promise.all(jobs);
await this.paintExplorerTasks(root);
for (const fEl of Array.from(root.querySelectorAll('.nav-folder-title'))) {
const fp = fEl.dataset && fEl.dataset.path;
if (fp) this.setFlagBadge(fEl, fp, true);
}
if (this.settings.enableFileTreeCounts) this.applyFolderSums(root);
else {
root.querySelectorAll('.zg-count').forEach(el => el.remove());
}
this.paintExplorerGoals(root);
}
} else {
document.querySelectorAll('.nav-file-title .zg-count, .nav-folder-title .zg-count').forEach(el => el.remove());
}
if (!this.settings.fileTreeFlags) {
document.querySelectorAll('.zg-treeflag').forEach(el => el.remove());
}
if (this.settings.enableOutlineCounts) {
const oroots = document.querySelectorAll('.workspace-leaf-content[data-type="outline"]');
await Promise.all(Array.from(oroots, r => this.applyOutlineWordCounts(r)));
} else {
document.querySelectorAll(
'.workspace-leaf-content[data-type="outline"] .zg-count'
).forEach(el => el.remove());
}
}
paintExplorerSortIcon() {
const on = !!(this.settings && this.settings.treeOrder);
const hosts = document.querySelectorAll(
'.workspace-leaf-content[data-type="file-explorer"] .nav-buttons-container');
for (const host of Array.from(hosts)) {
let btn = null;
for (const b of Array.from(host.children)) {
const said = (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '');
if (/sort/i.test(said)) { btn = b; break; }
}
if (!btn) continue;
if (on) {
if (btn.getAttribute('data-zg-sort') !== '1') {
btn.setAttribute('data-zg-was', btn.innerHTML);
btn.setAttribute('data-zg-said', btn.getAttribute('aria-label') || '');
btn.setAttribute('data-zg-sort', '1');
btn.innerHTML = zgManuscriptSvg(18);
btn.setAttribute('aria-label', 'Sorted in custom order');
}
} else if (btn.getAttribute('data-zg-sort') === '1') {
btn.innerHTML = btn.getAttribute('data-zg-was') || '';
const said = btn.getAttribute('data-zg-said');
if (said) btn.setAttribute('aria-label', said);
btn.removeAttribute('data-zg-was');
btn.removeAttribute('data-zg-said');
btn.removeAttribute('data-zg-sort');
}
}
}
treeMarksBox(rowEl) {
if (!rowEl) return null;
try {
const how = rowEl.style.display;
if (how && how !== 'flex') rowEl.style.display = 'flex';
rowEl.style.alignItems = 'center';
const inner = rowEl.querySelector(
'.nav-file-title-content, .nav-folder-title-content, .tree-item-inner');
if (inner) {
inner.style.flex = '1';
inner.style.minWidth = '0';
inner.style.overflow = 'hidden';
inner.style.textOverflow = 'ellipsis';
inner.style.whiteSpace = 'nowrap';
}
let box = rowEl.querySelector(':scope > .zg-treemarks');
if (!box) {
box = document.createElement('span');
box.className = 'zg-treemarks';
rowEl.appendChild(box);
} else if (box !== rowEl.lastElementChild) {
rowEl.appendChild(box);
}
return box;
} catch (_) { return null; }
}
paintExplorerRoots() {
this.paintExplorerFolderIcons();
this.paintExplorerKindIcons();
}
async paintExplorerTasks(root) {
if (!this.settings.fileTreeTasks) {
for (const el of Array.from(document.querySelectorAll('.zg-tasks'))) el.remove();
return;
}
const rows = root.querySelectorAll('.nav-file-title');
for (const row of Array.from(rows)) {
const path = (row.dataset && row.dataset.path) || '';
if (!path || !path.endsWith('.md')) continue;
let t = null;
try {
const f = this.app.vault.getAbstractFileByPath(path);
if (!f) continue;
const key = 'tasks:' + path;
const hit = this.wordCountCache && this.wordCountCache.get(key);
if (hit && f.stat && hit.mtime === f.stat.mtime) t = hit.tasks;
else {
t = this.countTasks(await this.app.vault.cachedRead(f));
if (this.wordCountCache && f.stat) {
this.wordCountCache.set(key, { mtime: f.stat.mtime, tasks: t });
}
}
} catch (_) { continue; }
const box = this.treeMarksBox(row);
let badge = row.querySelector('.zg-tasks');
if (!t || !t.all) { if (badge) badge.remove(); continue; }
if (!badge) {
badge = document.createElement('span');
badge.className = 'zg-tasks';
(box || row).appendChild(badge);
}
const said = zgTaskSay(t.done, t.all);
if (badge.textContent !== said) {
badge.textContent = said;
badge.title = (t.all - t.done) + ' left of ' + t.all;
}
badge.toggleClass('is-done', t.done === t.all);
}
}
paintExplorerGoals(root) {
if (!this.settings.fileTreeGoals) {
for (const el of Array.from(document.querySelectorAll('.zg-treepct'))) el.remove();
return;
}
const rows = root.querySelectorAll('.nav-file-title, .nav-folder-title');
const sums = this.folderTargetSums();
for (const row of Array.from(rows)) {
const path = (row.dataset && row.dataset.path) || '';
if (!path) continue;
const folder = row.classList.contains('nav-folder-title');
const target = folder
? (sums.get(path) || 0)
: Number((this.settings.fileGoals || {})[path]) || 0;
let badge = row.querySelector('.zg-treepct');
if (!target) { if (badge) badge.remove(); continue; }
const have = row.querySelector('.zg-count');
const words = have ? (parseInt(have.dataset.wc, 10) || 0) : -1;
if (words < 0) { if (badge) badge.remove(); continue; }
const box = this.treeMarksBox(row);
if (!badge) {
badge = document.createElement('span');
badge.className = 'zg-treepct';
(box || row).appendChild(badge);
}
const pct = Math.round((words / target) * 100);
const said = pct + '%';
if (badge.textContent !== said) {
badge.textContent = said;
badge.title = words.toLocaleString() + ' of ' + target.toLocaleString() + ' words';
}
badge.toggleClass('is-met', words >= target);
}
}
paintExplorerFolderColours() {
const map = (this.settings && this.settings.folderColors) || {};
const rows = document.querySelectorAll(
'.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title');
for (const row of Array.from(rows)) {
const path = (row.dataset && row.dataset.path) || '';
const id = map[path === '/' ? '' : path] || '';
const def = ZG_FOLDER_COLOURS.filter(c => c.id === id)[0];
const want = (def && def.css) || '';
if ((row.getAttribute('data-zg-colour') || '') === id) continue;
row.setAttribute('data-zg-colour', id);
if (want) row.style.setProperty('--zg-folder-colour', want);
else row.style.removeProperty('--zg-folder-colour');
row.toggleClass('zg-has-colour', !!want);
}
}
paintExplorerKindIcons() {
const rows = document.querySelectorAll(
'.workspace-leaf-content[data-type="file-explorer"] .nav-file-title');
const on = !!(this.settings && this.settings.fileTreeKindIcons);
for (const row of Array.from(rows)) {
const path = (row.dataset && row.dataset.path) || '';
if (!on) {
const stray = row.querySelector(':scope > .zg-treekind');
if (stray) stray.remove();
continue;
}
const kindKey = path + '|' + ZG_STYLESHEET_VERSION;
let box = row.querySelector(':scope > .zg-treekind');
if (box && box.getAttribute('data-kindfor') === kindKey) continue;
if (!box) {
box = document.createElement('span');
box.className = 'zg-treekind';
const name = row.querySelector('.nav-file-title-content');
if (name && name.parentElement === row) row.insertBefore(box, name);
else row.appendChild(box);
}
box.textContent = '';
box.setAttribute('data-kindfor', kindKey);
this.orgKindIcon(box, path);
}
}
paintExplorerFolderIcons() {
const rows = document.querySelectorAll(
'.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title');
const iconsOn = !!(this.settings && this.settings.fileTreeFolderIcons);
for (const row of Array.from(rows)) {
const path = (row.dataset && row.dataset.path) || '';
if (!iconsOn) {
const stray = row.querySelector(':scope > .zg-treefolder');
if (stray) stray.remove();
continue;
}
let open = true;
try {
const holder = row.parentElement;
open = !(holder && holder.classList.contains('is-collapsed'));
} catch (_) { zgCatch('paintExplorerFolderIcons: const holder = row.parentElement;', _); }
let icon = row.querySelector(':scope > .zg-treefolder');
const cid = String((this.settings.folderColors || {})[path] || '');
const want = (open ? '1' : '0') + '|' + cid;
if (icon && icon.getAttribute('data-open') === want) continue;
if (!icon) {
icon = document.createElement('span');
icon.className = 'zg-treefolder';
const name = row.querySelector('.nav-folder-title-content');
if (name && name.parentElement === row) row.insertBefore(icon, name);
else row.appendChild(icon);
}
icon.setAttribute('data-open', want);
icon.textContent = '';
this.orgFolderIcon(icon, path, open);
}
}
async applyFileWordCount(el, path) {
const file = this.app.vault.getAbstractFileByPath(path);
if (!file || !(file instanceof TFile)) return;
if (!this.isFileCounted(file)) {
const had = el.querySelector('.zg-count');
if (had) had.remove();
return;
}
const hit = this.wordCountCache.get(path);
if (hit && hit.mtime === file.stat.mtime) { this.setCountBadge(el, hit.count); return; }
try {
const text = await this.app.vault.cachedRead(file);
const count = this.countWords(text);
this.wordCountCache.set(path, { mtime: file.stat.mtime, count });
this.setCountBadge(el, count);
} catch (_) { zgCatch('applyFileWordCount: const text = await this.app.vault.cachedRead(file);', _); }
}
applyFolderSums(root) {
const folders = root.querySelectorAll('.nav-folder-title');
for (let i = folders.length - 1; i >= 0; i--) {
const fEl = folders[i].closest('.nav-folder');
if (!fEl) continue;
const children = fEl.querySelector('.nav-folder-children');
if (!children) continue;
let total = 0;
children.querySelectorAll('.nav-file-title .zg-count[data-wc]')
.forEach(b => total += parseInt(b.dataset.wc, 10) || 0);
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
const end = (i + 1 < cache.headings.length) ? cache.headings[i + 1].position.start.offset : text.length;
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
setFlagBadge(parentEl, path, isFolder) {
if (isFolder) {
const stale = parentEl.querySelector('.zg-treeflag');
if (stale) stale.remove();
return;
}
const want = this.settings.fileTreeFlags
&& (this.settings.fileStatus || {})[path];
let flag = parentEl.querySelector('.zg-treeflag');
if (!want) { if (flag) flag.remove(); return; }
if (!flag) {
flag = document.createElement('span');
flag.className = 'zg-treeflag';
const box = this.treeMarksBox(parentEl);
if (box) box.insertBefore(flag, box.firstChild);
else parentEl.appendChild(flag);
}
const drew = JSON.stringify([want, zgFlagShapeOf(want), zgStatusLabel(want)]);
if (flag.getAttribute('data-drew') !== drew) {
flag.setAttribute('data-flag', want);
flag.setAttribute('data-drew', drew);
flag.innerHTML = zgFlagSvg(want, 11);
flag.title = zgStatusLabel(want);
}
}
setCountBadge(parentEl, count) {
this.treeMarksBox(parentEl);
let badge = parentEl.querySelector(':scope > .zg-count');
if (!badge) {
badge = document.createElement('span');
badge.className = 'zg-count';
parentEl.appendChild(badge);
}
badge.dataset.wc = String(count);
if (badge.textContent !== count.toLocaleString()) badge.textContent = count.toLocaleString();
}
removeWordCounts() {
for (const sel of ['.zg-count', '.zg-tasks', '.zg-treepct', '.zg-treeflag',
'.zg-treemarks', '.zg-treefolder', '.zg-treekind']) {
document.querySelectorAll(sel).forEach(el => el.remove());
}
const rows = document.querySelectorAll(
'.workspace-leaf-content[data-type="file-explorer"] .nav-folder-title,'
+ ' .workspace-leaf-content[data-type="file-explorer"] .nav-file-title');
for (const row of Array.from(rows)) {
try {
row.removeAttribute('data-zg-colour');
row.style.removeProperty('--zg-folder-colour');
row.classList.remove('zg-has-colour', 'zg-drop-above', 'zg-drop-below');
if (row.style.display === 'flex') row.style.removeProperty('display');
if (row.style.alignItems === 'center') row.style.removeProperty('align-items');
const inner = row.querySelector(
'.nav-file-title-content, .nav-folder-title-content, .tree-item-inner');
if (inner) {
const fx = inner.style.flex;
if (fx === '1' || fx === '1 1 0%' || fx === '1 1 0px') inner.style.removeProperty('flex');
const mine = { minWidth: '0', overflow: 'hidden',
textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
for (const k of Object.keys(mine)) {
if (inner.style[k] === mine[k]) inner.style[k] = '';
}
}
} catch (_) { zgCatch('removeWordCounts: row.removeAttribute(\'data-zg-colour\');', _); }
}
if (this.wordCountCache) this.wordCountCache.clear();
}
};
class WordSmithSettingTab extends PluginSettingTab {
constructor(app, plugin) {
super(app, plugin);
this.plugin = plugin;
this._lastArrowCount = null;
this._activeTab = null;
}
display() {
const { containerEl } = this;
const scroller = containerEl.closest('.vertical-tab-content')
|| containerEl.parentElement || containerEl;
const scrollTop = scroller.scrollTop;
const restoreScroll = () =>
requestAnimationFrame(() => { scroller.scrollTop = scrollTop; });
containerEl.empty();
new Setting(containerEl).setName('Word-Smith ' + ZG_PLUGIN_VERSION).setHeading();
if (this.plugin._startBlocked) {
const b = this.plugin._startBlocked;
const ban = containerEl.createEl('div', { cls: 'ws-start-banner is-' + b.kind });
ban.createEl('p', { text: b.text });
if (b.kind === 'safe') {
const btn = ban.createEl('button', { text: 'Try again', cls: 'mod-cta' });
btn.addEventListener('click', () => { this.plugin.startAgain(); });
}
restoreScroll();
return;
}
new Setting(containerEl)
.setName('Enable Word-Smith')
.setDesc('Turns everything below on or off.')
.addToggle(t => t.setValue(this.plugin.settings.pluginEnabled)
.onChange(async v => {
this.plugin.settings.pluginEnabled = v;
await this.plugin.saveSettings(true);
this.display();
}));
if (!this.plugin.settings.pluginEnabled) { restoreScroll(); return; }
this.renderScopeSection(containerEl);
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
const TABS = [
{ id: 'menu', label: 'Menu', render: this.displayMenuTab },
{ id: 'retrobar', label: 'Powerline', render: this.displayRetroBarTab },
{ id: 'theme', label: 'Theme', render: this.displayThemeTab },
{ id: 'zen', label: 'Zen', render: this.displayZenTab },
{ id: 'letterbox', label: 'Letter Box', render: this.displayLetterboxSection },
{ id: 'typewriter', label: 'Typewriter', render: this.displayTypewriterTab },
{ id: 'hemingway', label: 'Hemingway', render: this.displayHemingwayTab },
{ id: 'syntax', label: 'Syntax', render: this.displaySyntaxTab },
{ id: 'checks', label: 'Prose Checks', render: this.displayChecksTab },
{ id: 'text', label: 'Text Options', render: this.displayTextTab },
{ id: 'markers', label: 'Markers', render: this.displayMarkersTab },
{ id: 'typography', label: 'Typography', render: this.renderTypographySection },
{ id: 'history', label: 'History', render: this.displayHistoryTab },
{ id: 'organizer', label: 'Organizer', render: this.displayOrganizerTab },
{ id: 'filetree', label: 'File tree', render: this.displayFileTreeTab },
{ id: 'misc', label: 'Misc', render: this.displayMiscTab }
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
const searchRow = containerEl.createEl('div', { cls: 'ws-settings-search' });
const search = searchRow.createEl('input', { cls: 'ws-settings-search-input',
attr: { type: 'search', placeholder: 'Search every tab\u2026', spellcheck: 'false' } });
search.value = this._searchQuery || '';
search.addEventListener('input', () => {
this._searchQuery = search.value;
this._searchCaret = search.selectionStart;
this.display();
});
const q = String(this._searchQuery || '').trim();
const bodyEl = containerEl.createEl('div', { cls: 'ws-tab-body' + (q ? ' is-searching' : '') });
if (q) {
for (const tab of TABS) {
const wrap = bodyEl.createEl('div', { cls: 'ws-search-tab' });
wrap.createEl('h3', { cls: 'ws-search-tabname', text: tab.label });
try { tab.render.call(this, wrap); } catch (_) { zgCatch('display: tab.render.call(this, wrap);', _); }
}
const n = this.settingsSearchApply(bodyEl, q);
if (!n) bodyEl.createEl('p', { cls: 'ws-search-empty', text: 'Nothing says \u201c' + q + '\u201d.' });
try {
search.focus();
const c = typeof this._searchCaret === 'number' ? this._searchCaret : search.value.length;
search.setSelectionRange(c, c);
} catch (_) { zgCatch('display: search.focus();', _); }
} else {
const active = TABS.find(t => t.id === this._activeTab);
active.render.call(this, bodyEl);
const keys = (typeof ZG_TAB_KEYS !== 'undefined' && ZG_TAB_KEYS[active.id]) || [];
if (keys.length) {
new Setting(bodyEl).setClass('ws-settings-reset')
.setName('Reset this tab')
.setDesc('The ' + keys.length + ' settings on this tab go back to their defaults. Undo is on the Misc tab.')
.addButton((b) => b.setButtonText('Reset').setWarning().onClick(async () => {
const r = await this.plugin.settingsResetTab(active.id);
new Notice('Word-Smith: ' + (r.error || (r.changed
? r.changed + ' of ' + r.keys + ' settings on this tab were changed and are back to their defaults.'
: 'this tab was already at its defaults.')), 6000);
this.display();
}));
}
}
restoreScroll();
}
settingsSearchApply(bodyEl, query) {
const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
let shown = 0;
for (const it of Array.from(bodyEl.querySelectorAll('.setting-item'))) {
const text = (it.textContent || '').toLowerCase();
const hit = words.every((w) => text.indexOf(w) !== -1);
it.hidden = !hit;
if (hit) shown++;
}
for (const sec of Array.from(bodyEl.querySelectorAll('.ws-search-tab'))) {
const any = Array.from(sec.querySelectorAll('.setting-item')).some((it) => !it.hidden);
sec.hidden = !any;
}
return shown;
}
renderScopeSection(containerEl) {
const s = this.plugin.settings;
if (!Array.isArray(s.scopePaths)) s.scopePaths = [];
const paths = s.scopePaths;
const exclude = s.scopeMode === 'exclude';
const desc = paths.length === 0
? 'Leave empty to apply to every file.'
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
renderCountExclude(containerEl, where = 'your totals') {
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
text: 'One list. Leaving something out here leaves it out of the '
+ 'history AND of every folder total \u2014 they were never two lists. '
+ 'Words already recorded stay in the history; this stops new ones '
+ 'being added.',
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
displayZenTab(containerEl) {
new Setting(containerEl)
.setName('Zen')
.setDesc('Clears the workspace down to the words: panes, ribbon, titles and chrome '
+ 'all step out of the way until you leave.')
.addToggle(t => t.setValue(this.plugin.settings.zenEnabled)
.onChange(async v => {
this.plugin.settings.zenEnabled = v;
this.plugin.settings.zenMode = v;
await this.plugin.saveSettings(true);
this.display();
}));
if (!this.plugin.settings.zenEnabled) return;
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
{
const z = this.sub(containerEl);
this.toggle(z, 'Full screen', '', 'fullscreen');
this.toggle(z, 'Match the title bar',
'',
'zenTitlebarMatch');
this.toggle(z, 'Focused file mode', '', 'focusedFileMode');
this.label(z, 'Hide in zen mode');
const hide = this.sub(z);
this.toggle(hide, 'Properties', 'Properties and frontmatter.', 'hideProperties');
this.toggle(hide, 'Inline title', '', 'hideInlineTitle');
this.toggle(hide, 'Native status bar', '', 'hideStatusBar');
this.toggle(hide, 'Linked mentions', '', 'hideLinkedMentions');
this.toggle(hide, 'Scroll bar', '', 'hideScrollBar');
this.toggle(hide, 'Ribbon', '', 'hideRibbon');
this.toggle(hide, 'Powerline bar', '',
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
'',
'zenEscExits');
}
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
}
displayTypewriterTab(containerEl) {
new Setting(containerEl)
.setName('Typewriter mode')
.setDesc('Keeps the line you are writing at one height on screen: the page moves '
+ 'under the cursor instead of the cursor walking down the page.')
.addToggle(t => t.setValue(this.plugin.settings.enableTypewriter)
.onChange(async v => {
this.plugin.settings.enableTypewriter = v;
await this.plugin.saveSettings();
this.display();
}));
if (this.plugin.settings.enableTypewriter) {
const tw = this.sub(containerEl);
this.label(tw, 'Current line highlight');
this.toggle(tw, 'Highlight current line', '', 'highlightCurrentLine', () => this.display());
if (this.plugin.settings.highlightCurrentLine) {
const hl = this.sub(tw);
new Setting(hl).setName('Dark theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightDarkColor).onChange(async v => { this.plugin.settings.lineHighlightDarkColor = v; await this.plugin.saveSettings(); }));
new Setting(hl).setName('Light theme color').addColorPicker(cp => cp.setValue(this.plugin.settings.lineHighlightLightColor).onChange(async v => { this.plugin.settings.lineHighlightLightColor = v; await this.plugin.saveSettings(); }));
this.slider(hl, 'Opacity', '', 'lineHighlightOpacity', 0.05, 1, 0.05);
}
this.label(tw, 'Cursor position');
tw.createEl('p', {
text: '0% is the very top, 50% the middle, 100% the bottom.',
cls: 'ws-settings-note'
});
const pos = this.sub(tw);
this.slider(pos, 'Rests at', 'Percent of the editor\u2019s height.',
'typewriterAnchor', 0, 100, 5);
this.label(tw, 'Focus dimming');
this.toggle(tw, 'Dim unfocused text', '', 'dimUnfocusedEnabled', () => this.display());
if (this.plugin.settings.dimUnfocusedEnabled) {
const dim = this.sub(tw);
new Setting(dim).setName('Focus area')
.addDropdown(d => d
.addOption('paragraph', 'Paragraph')
.addOption('sentence', 'Sentence')
.setValue(this.plugin.settings.dimFocusMode || 'paragraph')
.onChange(async v => { this.plugin.settings.dimFocusMode = v; await this.plugin.saveSettings(); }));
this.slider(dim, 'Opacity', '', 'dimOpacity', 0.05, 1, 0.05);
}
} else {
}
}
displayLetterboxSection(containerEl) {
new Setting(containerEl)
.setName('Letterbox')
.setDesc('Dims the top and bottom of the screen so only the band you are working '
+ 'in stays lit \u2014 drag either edge to set how much.')
.addToggle(t => t.setValue(this.plugin.settings.enableLetterbox)
.onChange(async v => {
this.plugin.settings.enableLetterbox = v;
await this.plugin.saveSettings(true);
this.display();
}));
if (this.plugin.settings.enableLetterbox) {
const ls = this.sub(containerEl);
new Setting(ls).setName('Mask height (px)').setDesc('')
.addSlider(s => s.setLimits(ZG_MASK_MIN_PX, 400, 2)
.setValue(this.plugin.settings.letterboxPx != null
? Math.round(this.plugin.settings.letterboxPx)
: (this.plugin.settings.letterboxLines || 8) * 26)
.setDynamicTooltip()
.onChange(async v => { this.plugin.settings.letterboxPx = v; await this.plugin.saveSettings(); }));
this.toggle(ls, 'Match the text width',
'',
'maskMatchText', () => this.display());
if (this.plugin.settings.maskMatchText) {
this.toggle(this.sub(ls), 'Include the editor\u2019s padding',
'Off hugs the words; on takes the page.',
'maskMatchTextPadded');
}
if (!this.plugin.settings.maskMatchText) {
this.slider(ls, 'Horizontal inset', '',
'maskPaddingH', 0, 400, 10);
}
new Setting(ls).setName('Show arrows').setDesc('')
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
.addOption('solid-triangle', '▲ / ▼  Solid triangles')
.addOption('outline-triangle', '△ / ▽  Outline triangles')
.addOption('standard-arrow', '↑ / ↓  Standard arrows')
.addOption('chevron', '∧ / ∨  Chevrons')
.addOption('double-chevron', '⇑ / ⇓  Double chevrons')
.addOption('custom', 'Custom characters')
.setValue(this.plugin.settings.arrowStyle)
.onChange(async v => { this.plugin.settings.arrowStyle = v; await this.plugin.saveSettings(); this.display(); }));
if (this.plugin.settings.arrowStyle === 'custom') {
new Setting(as).setName('Top char').addText(t => t.setValue(this.plugin.settings.customArrowTop).onChange(async v => { this.plugin.settings.customArrowTop = v || '^'; await this.plugin.saveSettings(); }));
new Setting(as).setName('Bottom char').addText(t => t.setValue(this.plugin.settings.customArrowBottom).onChange(async v => { this.plugin.settings.customArrowBottom = v || 'v'; await this.plugin.saveSettings(); }));
}
this.numInput(as, 'Arrow count', '', 'arrowCount', 1, 10);
this.slider(as, 'Arrow scale', '', 'arrowScale', 0.5, 3, 0.1);
this.toggle(as, 'Cap the line ends',
'',
'arrowLineEnds');
}
this.label(ls, 'Separator line');
new Setting(ls).setName('Line style')
.addDropdown(d => d
.addOption('none', 'None (hidden)')
.addOption('solid', 'Solid ——')
.addOption('dashed', 'Dashed - - -')
.addOption('dotted', 'Dotted · · ·')
.addOption('double', 'Double ═══')
.setValue(this.plugin.settings.separatorStyle)
.onChange(async v => { this.plugin.settings.separatorStyle = v; await this.plugin.saveSettings(); }));
this.slider(ls, 'Line weight', '', 'separatorWeight', 1, 8, 1);
this.label(ls, 'Colours');
this.toggle(ls, 'Custom colours',
'Leave this off and they borrow your theme\u2019s text colour.',
'letterboxCustomColors', () => this.display());
if (this.plugin.settings.letterboxCustomColors) {
this.renderArrowColors(ls);
}
}
}
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
L('{#>}', 'the whole path: Chapter \u203a Scene \u203a Beat');
L('', 'Empty above the first heading. Leading crumbs drop first when');
L('', 'the row is tight, so the heading you are under survives longest.');
H('Buttons \u2014 you can click these, and they never get dropped');
L('{syntax} {prose} {markers} {font} {theme} {report} {history} {export}');
L('{organizer}', 'the Organizer, on the tab you arrange it in');
L('{flag}', 'where this note is up to \u2014 click for the next one.');
L('', 'Flag, word, or both: you choose above.');
L('{words}:f  {file};f', 'paint any segment in the flag\u2019s own colour, or ink it');
H('Spacers');
L('{s} {ss} {sss}\u2026', 'blank space \u2014 a quarter of a space for each s');
L('{s}:N', 'the same, but filled with colour N \u2014 a sliver beside a segment');
H('Dividers \u2014 the character you type is the shape you get');
L('>  <  |  )  (  ~  /  \\', 'arrow, straight line, curve, wave, and two slanted cuts');
L('\\|', 'a backslash first gives you a real | in the text');
L('<{file} \u2026 {words}>', 'at the very start or end, < and > point outwards');
H('Colouring one segment');
L('{file} > {words}', 'no colour written means no colour worn: the segment lies');
L('', 'flush with the bar, like an unhighlighted stretch of a Vim');
L('', 'status line. Colour is something you ask for, per segment:');
L('{words}:N', 'background colour N (1\u2013' + PL_BG_COUNT + ' \u2014 higher numbers start again at 1)');
L('{words}:N;M', 'add ;M for the text \u2014 the same palette, the same numbers');
L('', 'Leave the ; off and the text picks itself, light or dark,');
L('', 'so it stays readable on whatever background you chose.');
L('{words};vim', 'the text takes the colour of the Vim mode you\u2019re in');
L('{ln:col}:vim', 'the background does \u2014 a {vim} segment already does this');
L('{file}:b1 :b2 :b3 :b4', 'your theme\u2019s own surfaces: page, panel, alt panel,');
L('', 'tertiary \u2014 a segment that blends into the workspace');
L('{file}:bs', 'the status line\u2019s own colour \u2014 the bar\u2019s default surface,');
L('', 'which a scheme may name (Vim\u2019s blue pair paints it cyan)');
L('{file}:bc', 'the cursor\u2019s colour, live \u2014 with Cursor-Smith theming the');
L('', 'caret per Vim mode, this segment moves with it; ;bc is the');
L('', 'same colour as text');
L('{file};t1 ;t2 ;t3', 'and its normal, muted and faint text, to match');
L('{file}:f  {words};f', 'the flag on this note \u2014 blue while it\u2019s a draft, red while');
L('', 'it wants revising, green when it\u2019s done. A note with no');
L('', 'flag leaves the segment as it was.');
H('Colouring the bar itself \u2014 put this first, in row 1\u2019s left slot');
L('', 'Write nothing and the bar sits on your theme\u2019s status-line');
L('', 'colour (:bs), with the matching text. To choose instead:');
L(':b1\u2026:b4 :bs :bc :f  :N  :vim', 'the bar\u2019s background: a theme surface, the cursor,');
L('', 'this note\u2019s flag, one of yours, or the mode');
L(';t1\u2026;t3  ;N  ;vim ;bc ;f', 'and its text, the same five ways');
L(':3;2 {file}\u2026', 'both together. Leave the ; off and the text picks itself.');
H('Fades \u2014 a colour stepping into the next, written with {g}');
L('| {g}{g}{g} |', 'steps between the colours either side of it');
L('', 'One step per {g}: {g}{g}{g} is three narrow ones,');
L('', '{ggg} is one wide one.');
L('\u2026 | {g}{g}', 'at the end of a group it fades out into the bar');
L('> {g}>{g}>{g} >', 'dividers in the middle of a fade keep their shape \u2014 arrows,');
L('', 'curves, waves or cuts, cut out of one continuous fade');
L('', 'A fade is the FIRST thing dropped when the window narrows,');
L('', 'before the end points and long before any reading. Give a {g}');
L('', 'a colour of its own and it stops being a fade \u2014 it becomes a');
L('', 'solid sliver, and it stays.');
H('Marks inside a row \u2014 drawn in the text\u2019s own colour');
L('::', 'a short thin line');
L('>>  <<', 'the same line bent to a point, at the arrows\u2019 angle');
L('', 'A mark is drawn in the row\u2019s own foreground, not as a colour');
L('', 'boundary, so it needs no segment behind it. Type them doubled');
L('', '\u2014 a single > or < is a divider, and a single : starts a colour.');
H('Two rows to copy and pull apart');
L(':vim {vim} > {file} :: {ln:col}');
L('{file}:3 | {g}{g}{g}{g} | {words}:5 ) {readtime}');
}
displayThemeTab(containerEl) {
const plugin = this.plugin;
new Setting(containerEl)
.setName('Themes')
.setDesc('A colour scheme for the whole workspace \u2014 editor, sidebars and panels \u2014 '
+ 'with a dark and a light half that follow Obsidian\u2019s mode.')
.addToggle(t => t.setValue(plugin.settings.barThemeEnabled !== false)
.onChange(async (v) => {
plugin.settings.barThemeEnabled = v;
plugin.applyThemeClass();
plugin.applyThemeVars();
plugin.barThemeCursorSync();
await plugin.saveSettings();
}));
const redisplay = () => {
let scroller = containerEl;
try {
while (scroller && !(scroller.scrollHeight > scroller.clientHeight)) {
scroller = scroller.parentElement;
}
} catch (_) { scroller = null; }
const top = scroller ? scroller.scrollTop : 0;
this.display();
if (scroller) { try { scroller.scrollTop = top; } catch (_) { zgCatch('displayThemeTab / redisplay: scroller.scrollTop = top;', _); } }
};
const grid = containerEl.createDiv({ cls: 'zg-theme-grid' });
const items = plugin.themesPickerItems();
items.forEach((item, sIdx) => {
const isDefault = item.id === 'custom';
const idx = sIdx - 1;
const card = grid.createDiv({
cls: 'zg-theme-card' + (item.on ? ' is-active' : '')
+ (isDefault ? ' is-custom' : '') });
if (!isDefault) card.setAttribute('draggable', 'true');
card.addEventListener('dragstart', (e) => {
e.dataTransfer.setData('text/plain', item.id);
card.addClass('is-dragging');
});
card.addEventListener('dragend', () => card.removeClass('is-dragging'));
card.addEventListener('dragover', (e) => { e.preventDefault(); card.addClass('is-dropzone'); });
card.addEventListener('dragleave', () => card.removeClass('is-dropzone'));
card.addEventListener('drop', async (e) => {
e.preventDefault();
if (isDefault) return;
const dragged = e.dataTransfer.getData('text/plain');
if (!dragged || dragged === item.id || dragged === 'custom') return;
plugin.barThemeMove(dragged, idx);
await plugin.saveSettings();
redisplay();
});
const head = card.createDiv({ cls: 'zg-theme-head' });
head.createDiv({ cls: 'zg-theme-name', text: item.label });
const x = isDefault ? null
: head.createEl('button', { cls: 'zg-theme-remove', text: '\u2715' });
if (x) {
x.setAttribute('aria-label', 'Remove ' + item.label + ' from the shelf');
x.addEventListener('click', async (e) => {
e.stopPropagation();
plugin.barThemeHide(item.id);
await plugin.saveSettings();
redisplay();
});
}
card.createDiv({ cls: 'zg-theme-note', text: item.note });
const strip = card.createDiv({ cls: 'zg-theme-strip' });
for (const c of (item.swatches || [])) {
strip.createDiv({ cls: 'zg-theme-chip' }).style.background = c;
}
card.addEventListener('click', async () => {
await item.onClick();
redisplay();
});
});
const hiddenIds = plugin.settings.barThemeHidden || [];
if (hiddenIds.length) {
const row = containerEl.createDiv({ cls: 'zg-theme-hiddenrow' });
row.createSpan({ cls: 'zg-theme-hiddenlabel', text: 'Removed:' });
for (const id of hiddenIds) {
const t = plugin.barThemeById(id);
const chip = row.createEl('button', { cls: 'zg-theme-hiddenchip',
text: (t ? t.name : id) + ' +' });
chip.addEventListener('click', async () => {
plugin.barThemeShow(id);
await plugin.saveSettings();
redisplay();
});
}
}
containerEl.createEl('h4', { text: 'Options' });
const schemeOn = plugin.settings.barThemeEnabled !== false
&& !!plugin.settings.barTheme && plugin.settings.barTheme !== 'custom';
const NEEDS_SCHEME = 'Needs a scheme \u2014 under Default the workspace is '
+ 'your Obsidian theme\u2019s, and there are no inks to derive from.';
const opt = (name, desc, key, after, into, needsScheme) => {
const dead = !!needsScheme && !schemeOn;
const st = new Setting(into || containerEl).setName(name)
.setDesc(dead ? NEEDS_SCHEME : desc)
.addToggle(t => {
t.setValue(!!plugin.settings[key]);
if (dead) { try { t.setDisabled(true); } catch (_) { zgCatch('displayThemeTab / opt: t.setDisabled(true);', _); } return; }
t.onChange(async (v) => {
plugin.settings[key] = v;
plugin.applyThemeVars();
if (after) after();
await plugin.saveSettings();
});
});
if (dead) st.settingEl.addClass('zg-opt-dead');
return st;
};
opt('Colored headings',
'H1\u2013H6 take inks derived from the scheme\u2019s own accents, each '
+ 'pulled toward the text ink until it actually reads on the page.',
'barThemeHeadings', null, null, true);
opt('Colored code',
'Code blocks sit on the scheme\u2019s panel surface, with syntax inks '
+ 'derived the same way the headings are.',
'barThemeCode', null, null, true);
opt('Simplified theme',
'One wash: sidebars, header row and title bar all take the '
+ 'editor\u2019s colour, and the dividers are painted out. Off, each '
+ 'surface gets its own step of the scheme\u2019s ramp \u2014 editor, '
+ 'sidebars, panels and borders each distinct.',
'barThemeSimplified', null, null, true);
let csThere = false;
try { csThere = !!(plugin.app && plugin.app.plugins
&& plugin.app.plugins.plugins
&& plugin.app.plugins.plugins['cursor-smith']); } catch (_) { zgCatch('displayThemeTab: scroller.scrollTop = top;', _); }
new Setting(containerEl)
.setName('Checkbox shape')
.setDesc('')
.addDropdown(d => d
.addOption('', 'Theme\u2019s own')
.addOption('circle', 'Circle')
.addOption('square', 'Square')
.addOption('retro', 'Retro')
.addOption('markdown', 'Markdown')
.setValue(plugin.settings.barThemeCheckbox || '')
.onChange(async (v) => {
plugin.settings.barThemeCheckbox = v;
plugin.applyThemeClass();
await plugin.saveSettings();
}));
opt('Hide workspace borders',
'Empties the dividers between panes and the tab outlines, the way '
+ 'Minimal\u2019s own borders-none does. A look, not a scheme: it '
+ 'works under Default too, and needs no scheme to be worn.',
'barThemeBorderless',
() => { plugin.applyThemeClass(); });
opt('Colored markdown',
'Bold takes the scheme\u2019s loudest ink; italics, links, tags and '
+ 'structure take its accents. Off, the markdown is your theme\u2019s.',
'barThemeMarkdown', null, null, true);
opt('Color the cursor',
(csThere
? 'Hands the scheme\u2019s loudest ink to Cursor-Smith \u2014 flat '
+ 'colour and all four gradient stops, both halves. Its shape '
+ 'and effects stay yours, and choosing Default gives your '
+ 'own cursor colours back.'
: 'Needs the Cursor-Smith plugin, which isn\u2019t installed \u2014 the '
+ 'toggle will wait here until it is.'),
'barThemeCursor',
() => { plugin.barThemeCursorSync(); redisplay(); });
if (plugin.settings.barThemeCursor) {
const subEl = this.sub(containerEl);
opt('Color Vim modes',
(csThere
? 'Each Vim mode wears its own colour \u2014 Insert green, '
+ 'Visual purple, Replace red, Command yellow, Normal the '
+ 'scheme\u2019s loudest \u2014 so the cursor says what the '
+ 'next keystroke will do.'
: 'Needs the Cursor-Smith plugin, which isn\u2019t installed \u2014 '
+ 'the toggle will wait here until it is.'),
'barThemeVim',
() => { plugin.barThemeCursorSync(); },
subEl);
}
}
displayMenuTab(containerEl) {
const plugin = this.plugin;
this.toggle(containerEl, 'Dock it as a panel', '',
'menuDock', async () => {
if (plugin.settings.menuDock) {
plugin.registerMenuPanel();
await plugin.openMenuPanel(true);
} else {
plugin.closeMenuPanel();
}
});
const redisplay = () => {
let scroller = containerEl;
try {
while (scroller && !(scroller.scrollHeight > scroller.clientHeight)) {
scroller = scroller.parentElement;
}
} catch (_) { scroller = null; }
const top = scroller ? scroller.scrollTop : 0;
this.display();
if (scroller) { try { scroller.scrollTop = top; } catch (_) { zgCatch('displayMenuTab / redisplay: scroller.scrollTop = top;', _); } }
plugin.rebuildMenuPanels();
};
new Setting(containerEl).setName('Separators')
.setDesc('')
.addButton(b => b.setButtonText('Add separator').onClick(async () => {
plugin.menuAddRule();
await plugin.saveSettings();
redisplay();
}));
new Setting(containerEl).setName('Commands')
.setDesc('Pin ANY Obsidian command to the menu');
const finder = containerEl.createDiv({ cls: 'zg-cmd-finder' });
const cmdSearch = finder.createEl('input', { cls: 'zg-cmd-search' });
cmdSearch.type = 'text';
cmdSearch.placeholder = 'Search commands to pin…';
const cmdHits = finder.createDiv({ cls: 'zg-cmd-hits' });
const pinnedNow = new Set(plugin.menuLayout());
const drawHits = () => {
cmdHits.empty();
const q = (cmdSearch.value || '').trim();
if (!q) return;
let cmds = [];
try { cmds = plugin.app.commands.listCommands() || []; } catch (_) { zgCatch('displayMenuTab / drawHits: cmds = plugin.app.commands.listCommands() || [];', _); }
const hits = [];
for (const c of cmds) {
if (!c || !c.id || pinnedNow.has('cmd:' + c.id)) continue;
const sc = Math.max(barMenuFuzzy(q, c.name || ''),
barMenuFuzzy(q, c.id) - 1);
if (sc >= 0) hits.push({ sc, c });
}
hits.sort((a, b) => b.sc - a.sc);
if (!hits.length) {
cmdHits.createDiv({ cls: 'zg-cmd-empty', text: 'Nothing matches' });
return;
}
for (const h of hits.slice(0, 8)) {
const hit = cmdHits.createEl('button', {
cls: 'zg-cmd-hit', text: h.c.name || h.c.id
});
hit.addEventListener('click', async () => {
plugin.menuPinCommand(h.c.id);
await plugin.saveSettings();
redisplay();
});
}
};
cmdSearch.addEventListener('input', drawHits);
this.label(containerEl, 'What the menu holds');
containerEl.createEl('p', {
text: 'Drag to reorder. Drop a card on another to share a row. It\u2019s a table!',
cls: 'ws-settings-note'
});
const defs = plugin.menuFeatureDefs();
const nameOf = (id) => {
if (/^rule-\d+$/.test(id)) return 'Separator';
if (plugin.menuIsCommand(id)) return plugin.menuAliasOf(id);
const d = defs.find(f => f.id === id);
return d ? d.name : id;
};
const grid = containerEl.createDiv({ cls: 'zg-theme-grid zg-menu-shelf' });
const fullOrder = plugin.menuLayout();
const dropGap = (toIdx) => {
const gap = grid.createDiv({ cls: 'zg-menu-gap' });
gap.addEventListener('dragover', (e) => { e.preventDefault(); gap.addClass('is-dropzone'); });
gap.addEventListener('dragleave', () => gap.removeClass('is-dropzone'));
gap.addEventListener('drop', async (e) => {
e.preventDefault();
const dragged = e.dataTransfer.getData('text/plain');
if (!dragged) return;
plugin.menuBreakAt(dragged, toIdx);
await plugin.saveSettings();
redisplay();
});
return gap;
};
plugin.menuBands().forEach((band) => {
dropGap(fullOrder.indexOf(band[0]));
const bandEl = grid.createDiv({ cls: 'zg-menu-bandrow' });
if (band.length >= MENU_MAX_COLS) bandEl.addClass('is-full');
band.forEach((id) => {
const isRule = /^rule-\d+$/.test(id);
const isCmd = plugin.menuIsCommand(id);
const isDead = isCmd && !plugin.menuCommandFor(id);
const card = bandEl.createDiv({
cls: 'zg-theme-card zg-menu-card' + (isRule ? ' is-rule' : '')
+ (isCmd ? ' is-cmd' : '') + (isDead ? ' is-dead' : '')
});
if (isCmd) card.setAttribute('title', plugin.menuCommandName(id));
card.setAttribute('draggable', 'true');
card.addEventListener('dragstart', (e) => {
e.dataTransfer.setData('text/plain', id);
card.addClass('is-dragging');
});
card.addEventListener('dragend', () => card.removeClass('is-dragging'));
card.addEventListener('dragover', (e) => { e.preventDefault(); card.addClass('is-dropzone'); });
card.addEventListener('dragleave', () => card.removeClass('is-dropzone'));
card.addEventListener('drop', async (e) => {
e.preventDefault();
const dragged = e.dataTransfer.getData('text/plain');
if (!dragged || dragged === id) return;
plugin.menuJoinAfter(dragged, id);
await plugin.saveSettings();
redisplay();
});
card.setAttribute('data-menucard', id);
plugin.touchDrag(card, id, {
rows: () => Array.from(containerEl.querySelectorAll('.zg-menu-card')),
idOf: (el) => el.getAttribute('data-menucard'),
drop: async (from, to) => {
if (!from || from === to) return;
plugin.menuJoinAfter(from, to);
await plugin.saveSettings();
redisplay();
}
});
const head = card.createDiv({ cls: 'zg-theme-head' });
if (isRule) card.setAttribute('title', 'Separator');
const nameEl = head.createDiv({
cls: 'zg-theme-name'
+ (isRule ? ' is-rule-' + plugin.menuRuleStyle(id) : ''),
text: isRule ? '' : nameOf(id)
});
const tools = head.createDiv({ cls: 'zg-theme-tools' });
if (isCmd) {
const pen = tools.createEl('button', { cls: 'zg-theme-rename', text: '\u270e' });
pen.setAttribute('aria-label', 'Rename ' + nameOf(id));
pen.addEventListener('click', (e) => {
e.stopPropagation();
nameEl.empty();
card.setAttribute('draggable', 'false');
const inp = nameEl.createEl('input', { cls: 'zg-theme-nameinput' });
inp.type = 'text';
inp.value = nameOf(id);
let done = false;
const finish = async (save) => {
if (done) return;
done = true;
if (save) {
plugin.menuSetAlias(id, inp.value);
await plugin.saveSettings();
}
redisplay();
};
inp.addEventListener('click', (ev) => ev.stopPropagation());
inp.addEventListener('keydown', (ev) => {
if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
});
inp.addEventListener('blur', () => finish(true));
try { inp.focus(); inp.select(); } catch (_) { zgCatch('displayMenuTab: inp.focus();', _); }
});
}
const x = tools.createEl('button', { cls: 'zg-theme-remove', text: '\u2715' });
x.setAttribute('aria-label',
(isRule ? 'Delete this separator' : 'Set ' + nameOf(id) + ' aside'));
x.addEventListener('click', async (e) => {
e.stopPropagation();
if (isRule) plugin.menuDeleteRule(id);
else plugin.menuHide(id);
await plugin.saveSettings();
redisplay();
});
if (isRule) {
const sel = head.createEl('select', { cls: 'zg-rule-style' });
sel.setAttribute('aria-label', 'How this separator draws');
for (const s of MENU_RULE_STYLES) {
const o = sel.createEl('option', { text: s });
o.value = s;
}
sel.value = plugin.menuRuleStyle(id);
sel.addEventListener('click', (e) => e.stopPropagation());
sel.addEventListener('change', async () => {
plugin.menuSetRuleStyle(id, sel.value);
await plugin.saveSettings();
redisplay();
});
}
});
});
dropGap(fullOrder.length);
const hiddenIds = plugin.settings.menuHidden || [];
if (hiddenIds.length) {
this.label(containerEl, 'Removed');
const row = containerEl.createDiv({ cls: 'zg-theme-hiddenrow' });
for (const id of hiddenIds) {
const restore = async () => {
plugin.menuRestore(id);
await plugin.saveSettings();
redisplay();
};
if (plugin.menuIsCommand(id)) {
const wrap = row.createDiv({ cls: 'zg-theme-hiddenchip is-pair' });
wrap.setAttribute('title', plugin.menuCommandName(id));
const back = wrap.createEl('button', {
cls: 'zg-chip-back', text: nameOf(id)
});
back.setAttribute('aria-label', 'Put ' + nameOf(id) + ' back in the menu');
back.addEventListener('click', restore);
const off = wrap.createEl('button', { cls: 'zg-chip-unpin', text: '\u00d7' });
off.setAttribute('aria-label', 'Unpin ' + nameOf(id));
off.addEventListener('click', async (e) => {
e.stopPropagation();
plugin.menuUnpin(id);
await plugin.saveSettings();
redisplay();
});
continue;
}
const chip = row.createEl('button', {
cls: 'zg-theme-hiddenchip', text: nameOf(id)
});
chip.setAttribute('aria-label', 'Put ' + nameOf(id) + ' back in the menu');
chip.addEventListener('click', restore);
}
}
}
displayRetroBarTab(containerEl) {
new Setting(containerEl)
.setName('Powerline status bar')
.setDesc('Swaps the default status bar with the Powerline.')
.addToggle(t => t.setValue(this.plugin.settings.enableRetroStatus)
.onChange(async v => {
this.plugin.settings.enableRetroStatus = v;
this.plugin.updateStatusBar();
this.plugin.updateRetroStatusBar();
await this.plugin.saveSettings(true);
this.display();
}));
if (this.plugin.settings.enableRetroStatus) {
const rb = this.sub(containerEl);
const s0 = this.plugin.settings;
this.renderBarPresets(rb);
this.slider(rb, 'Gap under the bar',
'Pixels between the bar and the window edge.',
'barBottomGap', 0, 30, 1);
this.label(rb, 'Powerline');
const pw = this.sub(rb);
this.label(pw, 'Segment colours');
this.renderPowerlineColors(this.sub(pw));
this.label(rb, 'Format');
this.renderFormatReference(rb);
const rows = this.plugin.getStatusRows();
const SLOTS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
rows.forEach((row, i) => {
if (rows.length > 1) this.label(rb, 'Row ' + (i + 1));
const fmt = this.sub(rb);
SLOTS.forEach(slot => {
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
rb.createEl('hr', { cls: 'ws-settings-hr' });
this.label(rb, 'Appearance');
const ap = this.sub(rb);
this.toggle(ap, 'Match the note\u2019s text size',
'',
'statusBarFontFollowNote', () => {
if (this.plugin.applyCssVariables) this.plugin.applyCssVariables();
if (this.plugin.fitStatusBarText) this.plugin.fitStatusBarText();
this.display();
});
if (!s0.statusBarFontFollowNote) {
this.slider(ap, 'Font size', '',
'statusBarFontSize', 8, 24, 1);
}
this.slider(ap, 'Row height', '',
'statusBarHeight', 12, 30, 1);
this.slider(ap, 'Space above', '',
'statusBarPadTop', 0, 24, 1);
this.slider(ap, 'Space below', '',
'statusBarPadBottom', 0, 24, 1);
this.label(ap, 'Borders');
const bd = this.sub(ap);
this.toggle(bd, 'Top rule', '',
'statusBarBorderTop', () => this.plugin.saveSettings(true));
this.toggle(bd, 'Bottom rule', '',
'statusBarBorderBottom', () => this.plugin.saveSettings(true));
new Setting(bd).setName('Line style').setDesc('"None" hides the borders.')
.addDropdown(d => d
.addOption('none', 'None')
.addOption('solid', 'Solid')
.addOption('dashed', 'Dashed')
.addOption('dotted', 'Dotted')
.addOption('double', 'Double')
.setValue(this.plugin.settings.statusBarBorderStyle || 'solid')
.onChange(async v => {
this.plugin.settings.statusBarBorderStyle = v;
await this.plugin.saveSettings();
this.display();
}));
if ((this.plugin.settings.statusBarBorderStyle || 'solid') !== 'none') {
this.slider(bd, 'Line weight', '',
'statusBarBorderWidth', 1, 8, 1);
bd.createEl('p', {
text: 'Top/Bottom',
cls: 'ws-settings-note'
});
this.colorPairRow(bd, 'Dark theme', '',
'barRuleDarkTopColor', 'barRuleDarkBottomColor');
this.colorPairRow(bd, 'Light theme', '',
'barRuleLightTopColor', 'barRuleLightBottomColor');
}
rb.createEl('hr', { cls: 'ws-settings-hr' });
this.renderVimModeLabels(rb);
rb.createEl('hr', { cls: 'ws-settings-hr' });
this.label(rb, 'Token formats');
const tf = this.sub(rb);
new Setting(tf).setName('{file}').setDesc('')
.addDropdown(d => d
.addOption('path', 'Full path  ~/folder/note')
.addOption('name', 'File name only  note')
.setValue(this.plugin.settings.fileTokenFormat || 'path')
.onChange(async v => {
this.plugin.settings.fileTokenFormat = v;
await this.plugin.saveSettings();
this.plugin.updateRetroStatusBar();
}));
new Setting(tf).setName('{flag}').setDesc('')
.addDropdown(d => d
.addOption('both', 'Flag and word  \u2691 revise')
.addOption('icon', 'Flag only  \u2691')
.addOption('name', 'Word only  revise')
.setValue(this.plugin.settings.flagTokenFormat || 'icon')
.onChange(async v => {
this.plugin.settings.flagTokenFormat = v;
await this.plugin.saveSettings();
this.plugin.updateRetroStatusBar();
}));
const btnFmt = (name, desc, key, glyph, word) =>
new Setting(tf).setName(name).setDesc(desc)
.addDropdown(d => d
.addOption('glyph', glyph)
.addOption('word', word)
.setValue(this.plugin.settings[key] || 'glyph')
.onChange(async v => {
this.plugin.settings[key] = v;
await this.plugin.saveSettings();
this.plugin.updateRetroStatusBar();
}));
btnFmt('{font}', 'The specimen, or the word. Either one still renders in the '
+ 'font you have chosen.', 'fontTokenFormat', 'Aa', 'Fonts');
btnFmt('{markers}', 'The pilcrow, or the word.',
'markersTokenFormat', '\u00b6  Pilcrow', 'Markers');
const df = this.sub(tf);
df.createEl('p', {
text: 'Format dates like {dd}.{mm}.{yy}',
cls: 'ws-settings-note'
});
}
}
renderBarPresets(containerEl) {
const plugin = this.plugin;
this.label(containerEl, 'Presets');
const box = this.sub(containerEl);
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
async loadPresetIntoPanel(name) {
await this.plugin.loadBarPreset(name);
this.plugin._pendingBarPresetName = name;
this.display();
}
renderBarPresetRow(containerEl, name, snap) {
const plugin = this.plugin;
const code = barPresetToCode(name, snap);
const setting = new Setting(containerEl).setName(name);
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
copyBtn.textContent = 'Select it';
}
setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
});
setting
.addButton(b => b.setButtonText('Load').onClick(async () => {
await this.loadPresetIntoPanel(name);
}))
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
renderVimModeLabels(containerEl) {
this.label(containerEl, 'Vim mode labels');
const vl = this.sub(containerEl);
vl.createEl('p', {
text: 'How {vim} renders each mode \u2014 \u201cNORMAL\u201d, \u201cN\u201d, an icon, whatever reads.\n'
+ 'The two swatches \u2014 dark theme, then light \u2014 paint any segment\n'
+ 'suffixed :vim, and the {vim} block when mode colours are on.',
cls: 'ws-settings-note'
});
this.toggle(vl, 'Follow the Vim mode',
'Recolours the {vim} segment as the mode changes.',
'powerlineModeColors', () => this.plugin.saveSettings(true));
const cs = this.plugin.cursorSmithSettings();
if (cs && cs.vimModeEnabled && this.plugin.settings.vimFollowCursorSmith !== false) {
vl.createEl('p', {
text: 'Cursor-Smith is picking these at the moment. Switch it off below to choose your own.',
cls: 'ws-settings-note'
});
}
this.toggle(vl, 'Follow Cursor-Smith',
'Borrow its caret colours instead of picking the five below. '
+ 'A :bc segment follows the caret regardless \u2014 that is what :bc is for.',
'vimFollowCursorSmith', () => this.plugin.saveSettings(true));
for (const [key, name, dflt, colorKey] of [
['vimLabelNormal', 'Normal', '-- NORMAL --', 'vimColorNormal'],
['vimLabelInsert', 'Insert', '-- INSERT --', 'vimColorInsert'],
['vimLabelVisual', 'Visual', '-- VISUAL --', 'vimColorVisual'],
['vimLabelReplace', 'Replace', '-- REPLACE --', 'vimColorReplace'],
['vimLabelCommand', 'Command', '-- COMMAND --', 'vimColorCommand']
]) {
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
colorPairRow(root, name, desc, bgKey, textKey) {
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
this.plugin.settings[bgKey] = DEFAULT_SETTINGS[bgKey];
this.plugin.settings[textKey] = DEFAULT_SETTINGS[textKey];
await this.plugin.saveSettings(true);
this.display();
}));
return row;
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
pick(a, 'Arrows \u2014 dark theme', 'arrowDarkColor');
pick(a, 'Arrows \u2014 light theme', 'arrowLightColor');
pick(a, 'Lines \u2014 dark theme', 'lineDarkColor');
pick(a, 'Lines \u2014 light theme', 'lineLightColor');
}
renderPowerlineColors(root) {
const s0 = this.plugin.settings;
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
text: 'One palette, in a dark set and a light one. Word-Smith swaps with your theme.',
cls: 'ws-settings-note'
});
swatchRow('Palette \u2014 dark mode', '', 'powerlineColor', PL_BG_COUNT);
swatchRow('Palette \u2014 light mode', '', 'powerlineColorLight', PL_BG_COUNT);
}
displayMarkersTab(containerEl) {
const s = this.plugin.settings;
containerEl.createEl('p', {
text: 'Draws the characters you cannot normally see \u2014 tabs, spaces, '
+ 'line ends. Nothing here changes your text, only how it is drawn.',
cls: 'ws-settings-note'
});
this.toggle(containerEl, 'Show hidden markers',
'The master switch for everything below.',
'markersEnabled', () => this.display());
if (!s.markersEnabled) return;
const hm = this.sub(containerEl);
this.toggle(hm, 'Tabs', 'Shown as \u2192', 'markTabs');
this.toggle(hm, 'Spaces', 'Shown as \u00b7', 'markSpaces');
this.toggle(hm, 'End of lines', 'Shown as \u21b5', 'markEndOfLines');
this.toggle(hm, 'Paragraphs', 'Shown as \u00b6', 'markParagraphs');
this.toggle(hm, 'End of buffer',
'Tildes down the empty space after your last line.', 'markBlankLines');
containerEl.createEl('p', {
text: 'Line width, indents, spacing and justification live under Text '
+ 'Options \u2014 a separate switch, so turning a marker on can never '
+ 'change the shape of your page.',
cls: 'ws-settings-note'
});
}
displayHistoryTab(containerEl) {
const s = this.plugin.settings;
new Setting(containerEl).setName('Writing history')
.setDesc('Day by day, month by month, or year by year.')
.addButton(b => b.setButtonText('Open history')
.onClick(() => this.plugin.openHistoryModal()));
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
new Setting(containerEl).setName('Track writing history')
.setDesc('Counts only, never your words.')
.addToggle(t => t.setValue(s.historyTracking)
.onChange(async v => {
if (v) { await this.plugin.historyTrackingOn(); }
else {
s.historyTracking = false;
await this.plugin.saveSettings();
}
this.display();
}));
if (!s.historyTracking) return;
const hs = this.sub(containerEl);
this.toggle(hs, 'Remember which notes',
'A rename or a move takes its history along.',
'historyPerFile');
this.renderCountExclude(hs, 'the history');
hs.createEl('p', {
text: 'Counts whatever \u201cWhere Word-Smith applies\u201d is set to.',
cls: 'ws-settings-note'
});
new Setting(hs).setName('Delete all history')
.setDesc('Wipes every day on record. No second copy, no undo. '
+ 'The file itself is listed in the Misc tab.')
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
this._histArmed = window.setTimeout(() => {
this._histArmed = null;
try { b.setButtonText('Delete'); } catch (_) { zgCatch('displayHistoryTab: b.setButtonText(\'Delete\');', _); }
}, 5000);
});
});
}
displaySyntaxTab(containerEl) {
const s = this.plugin.settings;
this.toggle(containerEl, 'Skip code and math',
'Leaves code, frontmatter and maths alone.',
'syntaxSkipCode');
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
new Setting(containerEl)
.setName('Syntax highlight')
.setDesc('Focus parts of speech \u2014 fully local.')
.addToggle(t => t.setValue(s.posEnabled)
.onChange(async v => {
s.posEnabled = v;
await this.plugin.saveSettings(true);
this.display();
}));
if (s.posEnabled) {
const ps = this.sub(containerEl);
new Setting(ps).setName('Display style')
.setDesc('')
.addDropdown(d => d
.addOption('text', 'Coloured text')
.addOption('highlight', 'Highlight')
.addOption('squiggle', 'Squiggle')
.addOption('line', 'Underline')
.setValue(s.syntaxStyle || 'text')
.onChange(async v => { s.syntaxStyle = v; await this.plugin.saveSettings(); }));
this.catRow(ps, 'Nouns', 'Nouns and pronouns.', 'posNoun', 'posNounColor');
this.catRow(ps, 'Verbs', 'Verbs, auxiliaries and modals.', 'posVerb', 'posVerbColor');
this.catRow(ps, 'Adverbs', 'All adverbs, including not and very.', 'posAdverb', 'posAdverbColor');
this.catRow(ps, 'Adjectives', 'Adjectives. Articles are excluded.', 'posAdjective', 'posAdjectiveColor');
this.catRow(ps, 'Conjunctions', 'Conjunctions and prepositions.', 'posConjunction', 'posConjunctionColor');
this.toggle(ps, 'Mute everything else',
'Fades everything you didn\u2019t tick.', 'posDimOthers');
}
}
displayChecksTab(containerEl) {
const s = this.plugin.settings;
containerEl.createEl('p', {
text: 'Marks patterns worth a second look. Fully local.',
cls: 'ws-settings-note'
});
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
.setDesc('')
.addDropdown(d => d
.addOption('squiggle', 'Squiggle')
.addOption('line', 'Underline')
.addOption('highlight', 'Highlight')
.addOption('text', 'Coloured text')
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
this.catRow(ck, 'Dialogue Focus',
'Everything inside quotes.',
'checkDialogue', 'checkDialogueColor');
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
this.slider(rh, 'Very hard above', 'And for the second.', 'checkRhythmVeryHardGrade', 8, 22, 1);
}
this.toggle(ck, 'Mute everything else',
'Fades everything you didn\u2019t tick, so the marks stand out.', 'checkDimOthers');
}
displayHemingwayTab(containerEl) {
const s = this.plugin.settings;
new Setting(containerEl)
.setName('Hemingway mode')
.setDesc('Blocks the keys you would use to go back \u2014 backspace, undo, the arrows \u2014 '
+ 'so a first draft can only move forward.')
.addToggle(t => t.setValue(s.hemingwayEnabled)
.onChange(async v => {
s.hemingwayEnabled = v;
this.plugin._hemSaid = false;
await this.plugin.saveSettings(true);
this.display();
}));
if (!s.hemingwayEnabled) return;
const h = this.sub(containerEl);
this.label(h, 'Removing text');
this.toggle(h, 'Block backspace', '', 'hemBlockBackspace');
this.toggle(h, 'Block delete', '', 'hemBlockDelete');
this.toggle(h, 'Block undo and redo', '', 'hemBlockUndo');
this.toggle(h, 'Block cut', '', 'hemBlockCut');
this.toggle(h, 'Block paste', '', 'hemBlockPaste');
this.label(h, 'Moving the cursor');
this.toggle(h, 'Block arrow keys', '', 'hemBlockArrows');
this.toggle(h, 'Block jump keys', 'Home, End, Page Up and Page Down.', 'hemBlockJumpKeys');
this.toggle(h, 'Block select all', '', 'hemBlockSelectAll');
this.toggle(h, 'Block mouse', 'Clicking, right-clicking and dragging.', 'hemBlockMouse');
this.label(h, 'Feedback');
new Setting(h).setName('Flash when blocked')
.setDesc('')
.addDropdown(d => d
.addOption('none', 'None')
.addOption('icon', 'The Modes button only')
.addOption('retrobar', 'Powerline bar')
.addOption('screen', 'Screen')
.addOption('both', 'Screen and bar')
.setValue(this.plugin.settings.hemFlashTarget || 'screen')
.onChange(async v => { this.plugin.settings.hemFlashTarget = v; await this.plugin.saveSettings(); }));
}
displayTextTab(containerEl) {
new Setting(containerEl)
.setName('Text options')
.setDesc('How the note itself is set: margins, indents, line length and spacing, '
+ 'justification, and the marks you normally can\u2019t see. Off leaves the '
+ 'note exactly as your theme draws it.')
.addToggle(t => t.setValue(this.plugin.settings.miscEnabled)
.onChange(async v => { this.plugin.settings.miscEnabled = v; await this.plugin.saveSettings(); this.display(); }));
if (this.plugin.settings.miscEnabled) {
const mc = this.sub(containerEl);
this.slider(mc, 'Horizontal padding',
'How far the text sits from the left and right edges of the pane. '
+ 'Applies all the time, not just in zen.', 'editorPaddingH', 0, 400, 10);
this.toggle(mc, 'Paragraph indent',
'Sets the first line of each paragraph in, the way a printed book does. '
+ 'Reading view only \u2014 lists, quotes and table cells are left alone.',
'enableParagraphIndent', () => this.display());
if (this.plugin.settings.enableParagraphIndent) {
const pi = this.sub(mc);
new Setting(pi).setName('Indent trigger')
.setDesc('What starts a new paragraph in your writing: a blank line between '
+ 'them, or every new line. Match this to how you actually type.')
.addDropdown(d => d
.addOption('double', 'Blank line (double Enter)')
.addOption('single', 'Every line (single Enter)')
.setValue(this.plugin.settings.paragraphIndentMode || 'double')
.onChange(async v => { this.plugin.settings.paragraphIndentMode = v; await this.plugin.saveSettings(); }));
this.slider(pi, 'Indent size (em)',
'',
'paragraphIndentEm', 0.5, 8, 0.5);
}
this.toggle(mc, 'Limit line length',
'',
'limitLineLength', () => this.display());
if (this.plugin.settings.limitLineLength) {
this.numInput(this.sub(mc), 'Characters per line',
'20\u2013200. 64 suits prose.',
'maxLineChars', 20, 200);
}
new Setting(mc).setName('Line spacing')
.setDesc('')
.addText(t => {
t.inputEl.type = 'number'; t.inputEl.min = '0.8'; t.inputEl.max = '4'; t.inputEl.step = '0.1'; t.inputEl.addClass('ws-num-input');
t.setValue(String(this.plugin.settings.lineSpacing != null ? this.plugin.settings.lineSpacing : 1.5));
t.onChange(async v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0.8 && n <= 4) { this.plugin.settings.lineSpacing = n; await this.plugin.saveSettings(); } });
});
this.toggle(mc, 'Justify text',
'',
'justifyText');
this.label(mc, 'Paragraph numbers');
const pn = this.sub(mc);
pn.createEl('p', {
text: 'Numbers in the left margin, on prose paragraphs only \u2014 not list '
+ 'items, tasks, headings, quotes, callouts, tables or code. They hang '
+ 'into the margin your padding already leaves, and only widen it if '
+ 'there is no room at all.',
cls: 'ws-settings-note'
});
this.toggle(pn, 'Paragraph numbers', 'Works in reading view too.',
'paragraphNumbers', () => { this.plugin.reconfigureEditors(); });
}
}
displayOrganizerTab(containerEl) {
this.label(containerEl, 'What the columns say');
new Setting(containerEl).setName('Target column shows')
.addDropdown(d => d
.addOption('ratio', 'Words and target (2,145/5,000)')
.addOption('percent', 'Percentage (43%)')
.setValue(this.plugin.settings.orgTargetShow || 'ratio')
.onChange(async v => {
this.plugin.settings.orgTargetShow = v;
await this.plugin.saveSettings(true);
}));
this.label(containerEl, 'Icons in the Organizer');
this.toggle(containerEl, 'Folder icons',
'A glyph beside each folder name in this window.',
'orgFolderIcons', () => this.plugin.saveSettings(true));
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
this.label(containerEl, 'How dates are written');
{
const SAMPLE = Date.UTC(1999, 0, 22, 9, 30);
const show = (id) => this.plugin.dateText(1999, 0, 22, null, null, id);
const row = new Setting(containerEl).setName('Date format')
.setDesc('Used by every date the Organizer shows.');
row.addDropdown(d => {
for (const id of ['human', 'iso', 'dmy', 'mdy']) d.addOption(id, show(id));
d.setValue(this.plugin.dateStyle());
d.onChange(async (v) => {
this.plugin.settings.organizerDateFormat = v;
await this.plugin.saveSettings();
this.display();
});
});
containerEl.createEl('p', { cls: 'ws-settings-note',
text: 'A file time reads: ' + this.plugin.orgStamp(SAMPLE) });
}
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
this.label(containerEl, 'How many states your manuscript has');
new Setting(containerEl)
.setName('Flags')
.setDesc('None takes the column and the chip with it.')
.addDropdown(d => {
d.addOption('0', 'None');
for (let i = 1; i <= ZG_STATE_IDS.length; i++) {
d.addOption(String(i), i === 1 ? '1 flag' : i + ' flags');
}
d.setValue(String(this.plugin.flagCount()));
d.onChange(async (v) => {
this.plugin.settings.flagCount = Number(v);
await this.plugin.saveSettings();
this.display();
});
});
const count = this.plugin.flagCount();
if (!count) {
containerEl.createDiv({ cls: 'setting-item-description',
text: 'Flags are off. Nothing is lost \u2014 anything you had already '
+ 'flagged keeps its flag, and turning them back on brings it back.' });
return;
}
this.label(containerEl, 'What each one is');
const defs = this.plugin.flagDefs();
for (let i = 0; i < count; i++) {
const f = defs[i];
const row = new Setting(containerEl);
row.settingEl.addClass('zg-flagrow');
const write = async (patch) => {
const all = this.plugin.flagDefs().map(x => Object.assign({}, x));
Object.assign(all.filter(x => x.id === f.id)[0], patch);
this.plugin.settings.flags = all;
await this.plugin.saveSettings();
};
row.addText(t => t
.setPlaceholder(f.id)
.setValue(f.label)
.onChange(async (v) => {
await write({ label: String(v || '').trim() || f.id });
}));
const icon = row.controlEl.createSpan({ cls: 'zg-flagrow-icon' });
icon.innerHTML = zgFlagSvg(f.id, 13);
row.addDropdown(d => {
for (const sh of ZG_FLAG_SHAPES) d.addOption(sh.id, sh.label);
d.setValue(f.shape);
d.onChange(async (v) => { await write({ shape: v }); this.display(); });
});
row.addColorPicker(cp => cp.setValue(f.light)
.onChange(async (v) => { await write({ light: v }); }));
row.addColorPicker(cp => cp.setValue(f.dark)
.onChange(async (v) => { await write({ dark: v }); }));
}
this.label(containerEl, 'Putting them back');
new Setting(containerEl)
.setName('Restore the flags Word-Smith ships with')
.setDesc('Names, shapes and colours. Your flags are untouched.')
.addButton(b => b.setButtonText('Restore').onClick(async () => {
this.plugin.settings.flags = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.flags));
await this.plugin.saveSettings();
this.display();
}));
}
displayFileTreeTab(containerEl) {
this.label(containerEl, 'Obsidian\u2019s file explorer');
this.toggle(containerEl, 'File tree counts',
'Next to each note, added up for folders.',
'enableFileTreeCounts', () => this.display());
this.toggle(containerEl, 'File tree flags',
'A tiny flag on anything flagged in the Organizer.',
'fileTreeFlags', () => this.display());
this.toggle(containerEl, 'Tasks left',
'Unticked boxes beside the count. Folders sum their children.',
'fileTreeTasks', () => this.display());
this.toggle(containerEl, 'Goal percentage',
'How close each note is to its target. Turns the counts on too.',
'fileTreeGoals', (v) => {
if (v) {
this.plugin.settings.enableFileTreeCounts = true;
this.plugin.settings.enableOutlineCounts = true;
this.plugin.saveSettings();
}
this.display();
});
this.toggle(containerEl, 'Folder icons',
'A glyph beside each folder name.',
'fileTreeFolderIcons', () => this.display());
this.toggle(containerEl, 'Custom order in the file tree',
'Off, the tree sorts as Obsidian does. Your order is kept.',
'treeOrder', () => this.display());
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
this.label(containerEl, 'The outline');
this.toggle(containerEl, 'Outline counts',
'Next to each heading in the outline.',
'enableOutlineCounts', () => this.display());
}
displayMiscTab(containerEl) {
const plugin = this.plugin;
this.label(containerEl, 'Your settings');
const ys = this.sub(containerEl);
new Setting(ys)
.setName('As text')
.setDesc('Copy every setting to the clipboard as JSON, or paste a copy back in. A paste replaces everything; Undo puts the previous settings back.')
.addButton((b) => b.setButtonText('Copy').onClick(async () => {
try { await navigator.clipboard.writeText(plugin.settingsCopyText()); new Notice('Word-Smith: settings copied.', 4000); }
catch (_) { new Notice('Word-Smith: could not reach the clipboard.', 6000); }
}))
.addButton((b) => b.setButtonText('Paste').onClick(async () => {
let text = '';
try { text = await navigator.clipboard.readText(); }
catch (_) { new Notice('Word-Smith: could not read the clipboard.', 6000); return; }
const r = await plugin.settingsPasteText(text);
if (r.error) { new Notice('Word-Smith: ' + r.error, 8000); return; }
new Notice('Word-Smith: ' + r.applied + ' setting' + (r.applied === 1 ? '' : 's') + ' pasted'
+ (r.repaired.length ? ', ' + r.repaired.length + ' reset to the default (' + r.repaired.join(', ') + ')' : '')
+ '. Undo is on the Misc tab.', 8000);
this.display();
}))
.addButton((b) => {
b.setButtonText('Undo').setDisabled(!plugin._settingsUndo).onClick(async () => {
const r = await plugin.settingsUndoPaste();
new Notice('Word-Smith: ' + (r.error || 'the previous settings are back.'), 6000);
this.display();
});
});
new Setting(ys)
.setName('Repair the display')
.setDesc('Tears every surface down and draws it again \u2014 the bar, the masks, the file tree\u2019s icons and counts. Nothing you set changes.')
.addButton((b) => b.setButtonText('Repair').onClick(() => {
plugin.repairDisplay();
new Notice('Word-Smith: repaired.', 4000);
}));
this.label(containerEl, 'Quick panels');
const qp = this.sub(containerEl);
qp.createEl('p', {
text: 'Opens the sidebar on that panel and focuses it so you can arrow around fast.',
cls: 'ws-settings-note'
});
this.toggle(qp, 'Quick file explorer', 'Adds the command to the palette.',
'quickExplorer');
this.toggle(qp, 'Quick outline', 'And one for the outline.',
'quickOutline');
this.toggle(qp, 'Quick cycle',
'Adds four commands for directional jumps.',
'quickCycle');
if (this.plugin.settings.quickCycle) {
this.sub(qp).createEl('p', {
text: 'The fastest way to navigate Obsidian. Bind them to Alt+arrows, or Alt+H/J/K/L if you think in Vim \u2014 Alt is free in every Vim mode. It picks the nearest panel in that direction, and opens a closed sidebar when there is nothing else that way. Inside a sidebar, up and down step through its tabs. With Vim keys on, H/J/K/L walk the file tree and the outline just as the arrows do.',
cls: 'ws-settings-note'
});
this.toggle(this.sub(qp), 'Close a sidebar when you leave it',
'Only when you move out with a direction key, never when you pick something.',
'quickCycleCloseOnLeave');
}
containerEl.createEl('hr', { cls: 'ws-settings-hr' });
this.label(containerEl, 'Vim');
const vg = this.sub(containerEl);
this.toggle(vg, 'Motions follow wrapped lines',
'Maps j, k, 0 and $ to their g-prefixed forms. Needs Obsidian\u2019s vim mode on.',
'vimSoftWrapMotion', () => this.display());
if (this.plugin.settings.vimSoftWrapMotion) {
const found = !!this.plugin.vimApi();
this.sub(vg).createEl('p', {
text: found
? 'Vim keymap found \u2014 j and k are mapped to gj and gk.'
: 'No vim keymap found. Turn on Editor \u2192 Vim key bindings in '
+ 'Obsidian\u2019s settings, then reopen this tab.',
cls: 'ws-settings-note' + (found ? '' : ' is-warning')
});
}
containerEl.createEl('p', {
text: 'Vim mode labels and colours are in the Powerline tab.',
cls: 'ws-settings-note'
});
this.label(containerEl, 'Files Word-Smith keeps in your vault');
containerEl.createEl('p', { cls: 'ws-settings-note', text:
'Ordinary notes in your vault. Move or rename them freely \u2014 '
+ 'Word-Smith finds them by what is inside, not by where they sit.' });
{
const at = plugin.structurePathNow();
const exists = !!(plugin.app.vault.getAbstractFileByPath(at));
new Setting(containerEl).setName('Custom order file')
.setDesc(exists
? 'Right now it\u2019s at: ' + at
: 'Not made yet \u2014 it\u2019ll appear the first time you tick, '
+ 'reorder or set a target.');
containerEl.createEl('p', { cls: 'ws-settings-note', text:
'Holds the order, the ticks, the flags, the folder colours, the '
+ 'targets and which properties are columns. Delete it and those '
+ 'go; your notes are untouched.' });
}
containerEl.createEl('h3', { text: 'A readable copy of your settings' });
containerEl.createEl('p', { cls: 'ws-settings-note', text:
'A copy of your settings in the vault, read back only when there are '
+ 'none to read \u2014 a reinstall, or a restore that kept the notes and not '
+ 'the plugin folder. Editing it changes nothing.' });
new Setting(containerEl).setName('Keep a copy of my settings in the vault')
.setDesc('Written a few seconds after anything changes.')
.addToggle(t => t.setValue(plugin.settings.settingsMirror !== false)
.onChange(async v => {
plugin.settings.settingsMirror = v;
await plugin.saveSettings();
this.display();
}));
if (plugin.settings.settingsMirror !== false) {
const at = plugin.settingsMirrorPathFor();
const exists = !!(plugin.app.vault.getAbstractFileByPath(at));
new Setting(containerEl).setName('Settings copy file')
.setDesc(exists ? 'Right now it\u2019s at: ' + at
: 'Not made yet \u2014 it\u2019ll appear the next time a setting changes.');
containerEl.createEl('p', { cls: 'ws-settings-note', text:
'Restoring skips what describes this machine rather than your '
+ 'writing, and file paths only come back into the same vault.' });
}
{
const at = plugin.historyStorePath();
new Setting(containerEl).setName('History file')
.setDesc(at
? 'Right now it\u2019s at: ' + at
: 'Not made yet \u2014 it\u2019ll appear the first time you write '
+ 'something with counting switched on.');
containerEl.createEl('p', { cls: 'ws-settings-note', text:
'Every day you have written, and the only copy. Deleting it is in '
+ 'the History tab.' });
}
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
+ 'ws-font: Courier Prime'
});
}
pickGoalPath(kind) {
if (!WsPathSuggestModal) return;
void kind;
const s = this.plugin.settings;
const have = new Set(Object.keys(s.fileGoals || {}));
const items = this.app.vault.getMarkdownFiles()
.map(f => f.path).filter(p => !have.has(p));
if (!items.length) return;
new WsPathSuggestModal(this.app, items, 'Choose a note\u2026',
async (picked) => {
if (!s.fileGoals) s.fileGoals = {};
s.fileGoals[picked] = 1000;
this.plugin._folderWordCache = null;
await this.plugin.saveSettings(true);
this.display();
}).open();
}
sub(root) {
return root.createEl('div', { cls: 'ws-settings-sub' });
}
label(root, text) {
root.createEl('p', { text, cls: 'ws-settings-label' });
}
scrollPanelToTop() {
try {
const { containerEl } = this;
const scroller = containerEl.closest('.vertical-tab-content')
|| containerEl.parentElement || containerEl;
requestAnimationFrame(() => requestAnimationFrame(() => {
scroller.scrollTop = 0;
}));
} catch (_) { }
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
'',
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
charRow('Open double', 'Replaces " at the start of a quotation.', 'typoOpenDouble');
charRow('Close double', 'Replaces " at the end.', 'typoCloseDouble');
charRow('Open single', 'Replaces the straight single quote at the start.', 'typoOpenSingle');
charRow('Close single', 'And at the end.', 'typoCloseSingle');
charRow('Apostrophe', 'Used mid-word, where it is not a quote at all.', 'typoApostrophe');
}
}
this.toggle(ty, 'Ellipsis', '... becomes \u2026', 'typoEllipsis');
this.toggle(ty, 'Dashes', '-- \u2192 \u2013, --- \u2192 \u2014', 'typoDashes');
this.toggle(ty, 'Arrows', '-> \u2192, <- \u2190, => \u21d2', 'typoArrows');
this.toggle(ty, 'Comparisons', '<= \u2264, >= \u2265, /= \u2260', 'typoComparisons');
this.toggle(ty, 'Guillemets', '<< \u00ab and >> \u00bb', 'typoGuillemets');
this.toggle(ty, 'Fractions', '1/2 \u00bd, 3/4 \u00be, and the rest.', 'typoFractions');
}
colorRow(c, name, desc, colorKey) {
return new Setting(c).setName(name).setDesc(desc || '')
.addColorPicker(cp => cp.setValue(this.plugin.settings[colorKey])
.onChange(async v => { this.plugin.settings[colorKey] = v; await this.plugin.saveSettings(); }));
}
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
module.exports.zgStatusNext = zgStatusNext;
module.exports.zgStatusLabel = zgStatusLabel;
module.exports.zgFlagSvg = zgFlagSvg;
module.exports.zgRepairSettings = zgRepairSettings;
module.exports.zgLineOfSnippet = zgLineOfSnippet;
module.exports.zgCtxScope = zgCtxScope;
module.exports.HISTORY_HEAT = HISTORY_HEAT;
module.exports.ZG_STATE_IDS = ZG_STATE_IDS;
module.exports.zgLabelCh = zgLabelCh;
module.exports.zgNarrowDecide = zgNarrowDecide;
module.exports.zgPassStorm = zgPassStorm;
module.exports.zgGuard = zgGuard;
module.exports.zgGuardReset = zgGuardReset;
module.exports.zgGuardSeen = zgGuardSeen;
module.exports.zgGuardTell = zgGuardTell;
module.exports.zgGuardReport = zgGuardReport;
module.exports.zgCatch = zgCatch;
module.exports.zgCatchSeen = zgCatchSeen;
module.exports.zgCatchReset = zgCatchReset;
module.exports.zgCompat = zgCompat;
module.exports.zgCompatText = zgCompatText;
module.exports.ZG_INTERNALS = ZG_INTERNALS;
module.exports.zgPassState = zgPassState;
module.exports.ZG_STORM_PASSES = ZG_STORM_PASSES;
module.exports.zgNarrowState = zgNarrowState;
module.exports.ZG_NARROW_FLIPS = ZG_NARROW_FLIPS;
module.exports.zgColPrefCh = zgColPrefCh;
module.exports.zgFitCols = zgFitCols;
module.exports.zgExportRoot = zgExportRoot;
module.exports.zgDemoteHeadings = zgDemoteHeadings;
module.exports.zgFileHeadLevel = zgFileHeadLevel;
module.exports.zgSecHeadLevel = zgSecHeadLevel;
module.exports.zgDeepestLevel = zgDeepestLevel;
module.exports.zgTocSteps = zgTocSteps;
module.exports.WsMenuView = WsMenuView;
module.exports.zgSessionLens = zgSessionLens;
module.exports.zgSessionNew = zgSessionNew;
module.exports.zgForDisk = zgForDisk;
