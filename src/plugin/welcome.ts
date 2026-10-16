import { App, Modal, Setting, setIcon } from 'obsidian';
import type WordSmith from './plugin';
import { wsT } from '../core/ui-text';

// ── THE WELCOME (A743) ───────────────────────────────────────────────────────
// The writer: "add a new screen popup for new users saying welcome to Word-Smith", then "Discuss" twice and "Mock it
// up"; the copy is theirs, word for word, from ws-dev/mockups/welcome-mockup.html. Six tabs (Hello, Setup, Data, Write,
// Organize, Export), Next walks them and says Done on the last; Setup's four switches apply at once, through the
// settings tab's own writer (`applyKey`), so a switch here does what the same switch in Settings does. Shown once, to
// a new install (`welcomeShown`, plugin.ts); Settings → About opens it again. The links open in the browser, nothing
// is embedded or fetched (privacy.md).
// IN THE INTERFACE'S LANGUAGE since A797 (the writer: "translate the welcome too"; "translation: yes, later" before):
// every line in wsWelcomeText, through wsT, in the 20 tables.

export const WS_INTRO_URL = 'https://youtu.be/HLq91cDWx0s';
export const WS_README_URL = 'https://github.com/Sadsnake1/word-smith#readme';
export const WS_ISSUES_URL = 'https://github.com/Sadsnake1/word-smith/issues/new';
export const WS_CURSOR_SMITH_URL = 'https://www.youtube.com/watch?v=RQJtw-SdTc0';
export const WS_FUNDING_URL = 'https://buymeacoffee.com/sadsnake1';

// ── THE LANGUAGES ON HELLO (A799) ────────────────────────────────────────────
// The writer: "in the hello from welcome screen put an info card below that it's available in ... write the languages
// in a line with flags with language paks. something short", then "then don't put the flags" (Windows has no flag emoji,
// and the welcome fetches nothing): each language its own name, the README's list in its order; then (A801: "don't add
// the download links here", "say something like word-smith is translated (built-in) and has syntax and prose
// checks(lang packs) in 21 lang : ... then below say how to download a pack and where to put it") the names plain.
export const WS_WELCOME_LANGS: [string, string][] = [
	['en', 'English'], ['ar', 'العربية'], ['da', 'Dansk'], ['de', 'Deutsch'], ['es', 'Español'], ['fa', 'فارسی'],
	['fr', 'Français'], ['hi', 'हिन्दी'], ['id', 'Bahasa Indonesia'], ['it', 'Italiano'], ['ja', '日本語'],
	['ko', '한국어'], ['nl', 'Nederlands'], ['no', 'Norsk bokmål'], ['pl', 'Polski'],
	['pt', 'Português'], ['pt-BR', 'Português (Brasil)'], ['ro', 'Română'], ['ru', 'Русский'],
	['sv', 'Svenska'], ['tr', 'Türkçe'], ['uk', 'Українська'], ['zh-Hans', '简体中文'],
	['zh-Hant', '繁體中文'],
];

// read when the welcome is drawn, so every line is in the interface's language (A797); the file names as they are
export function wsWelcomeText() {
	return {
		title: wsT('Welcome to Word-Smith'),
		hello: wsT('Hello'), setup: wsT('Setup'), data: wsT('Data'), write: wsT('Write'), organize: wsT('Organize'), export: wsT('Export'),
		next: wsT('Next'), done: wsT('Done'), close: wsT('Close'),
		hint: wsT('Settings → Word-Smith → About shows this again.'),
		helloBig: wsT('Write. Organize. Export.'),
		helloLead: wsT('A dedicated writing studio, working within the Vault you already have.'),
		helloBody: wsT('Writing modes, an outliner that works on ANY file, a compiler and a writing history. Inspired by other famous writing apps, but lightweight, free, and vastly more powerful.'),
		helloCard: wsT('Use it in the Vault you already have, with your notes right beside your creative writing. Or, if you like, give your writing a new Vault of its own.'),
		langs: wsT('Word-Smith is translated (built in) and has syntax and prose checks (language packs) in {n} languages:', { n: WS_WELCOME_LANGS.length }),
		langsHow: wsT('For the checks in yours, download its pack from Settings → Word-Smith → Language → Get packs, and put it in the Word-Smith folder in your Vault.'),
		happy: wsT('Happy writing!'),
		watch: wsT('Quick Walkthrough'), watchTitle: wsT('A quick walkthrough, on YouTube, in your browser'),
		docs: wsT('Documentation'), docsTitle: wsT('How to use Word-Smith: the README on GitHub, in your browser'),
		setupSub: wsT('Four quick choices'),
		setupNote: wsT('Change any of them later in Settings → Word-Smith.'),
		powerline: wsT('Powerline'),
		powerlineDesc: wsT('A status bar you “code” yourself: words, targets, the time, and a button for every menu. You’ll love it! I think...'),
		pane: wsT('Word-Smith pane'), paneDesc: wsT('The PowerMenu in your sidebar.'),
		keyboardCard: wsT('Keyboard person? The PowerMenu is made for you: a hotkey opens it, type to find, Enter to run. And yes, Word-Smith speaks Vim too.'),
		history: wsT('Writing history'), historyDesc: wsT('Your writing log, one row a day. It only counts from the day you turn it on, so don’t wait!'),
		hide: wsT('Hide the Word-Smith folder'), hideDesc: wsT('Out of the file explorer, the Organizer and Export. Still there, just out of sight.'),
		dataLead: wsT('Word-Smith keeps its data in a Word-Smith folder in your Vault, as plain Markdown files. Read them, edit them, move them. They’re yours.'),
		files: [
			['ws-settings.md', wsT('your settings'), wsT('Every tweak you made. Uninstall, reinstall, a bad sync or an update: Word-Smith comes back exactly as you left it. No more setting it up again.')],
			['ws-structure.md', wsT('your book’s order'), wsT('Your file order, targets, deadlines and those tiny flags, plus the tags and metadata of files that aren’t notes (PDFs, spreadsheets, images). Just a sidecar file. So don’t lose it!')],
			['ws-history.md', wsT('with Writing history on'), wsT('Your writing log: words added and deleted, one row a day.')],
			['ws-lang-de.md', wsT('language packs'), wsT('Download yours from GitHub, pop it into the Word-Smith folder, and it just works. Plain text too, so tweak away.')],
		],
		dataCard: wsT('Why .md? So Obsidian looks after them like any note: its Sync and File recovery cover them, and they travel with your Vault to every machine you sync. The Word-Smith folder can live anywhere in your Vault, even folders deep.'),
		writeFeats: [
			[wsT('Writing modes'), wsT('Zen, Letter box, Typewriter, Page mode, and Hemingway mode, which locks your backspace so a first draft can only go forward. Painful, but it works!')],
			[wsT('Themes'), wsT('Repaint the whole workspace, dark and light. Even your text cursor!')],
			[wsT('Fonts and typography'), wsT('Your fonts, smart quotes, proper dashes and the first-line indent. Settings → Word-Smith → Text.')],
			[wsT('Prose checks'), wsT('Nouns, verbs and adjectives in color. Too many adverbs reads as a rash (thank you, Mr. Stephen King!). Filler words, passive voice and doubled words get an underline.')],
		],
		writeCard: wsT('Want more fonts? Open Obsidian’s Settings → Appearance → Text font and make a list of your favorites (any font installed on your computer). Word-Smith will use those.'),
		organizeLead: wsT('The Organizer is your file explorer as a table. Use it like an outliner, a database, a task manager, and as a compiler.'),
		organizeBody: [
			wsT('Drag and drop to sort, and the order sticks: in your file tree, the table and the finished manuscript. No more “001-Preface” haunting your filenames.'),
			wsT('Every property is a column you edit right in the cell: targets, deadlines, flags, word count and more, with a Total row at the bottom.'),
		],
		organizeWhere: wsT('Open it from the Word-Smith menu, then click a folder in the file tree.'),
		organizeCard: wsT('It isn’t only for notes. Tag a PDF, put a checkbox on a spreadsheet, give a book cover a description. It works on ANY file type.'),
		exportFeats: [
			[wsT('Your book, out the door'), wsT('PDF, Word, EPUB, Markdown and HTML, with a fast print preview. Tick what goes in right in the file tree. Title page, running header, contents and footnotes are each a checkbox. Easy!')],
			[wsT('Expanded view'), wsT('Press Expand to read your whole book in one long column. Click any paragraph and its note opens beside it, with the cursor right where you clicked. Handy for last-minute edits.')],
			[wsT('Citations'), wsT('Write [@woolf1929] and Export turns it into APA, Chicago, Harvard, MLA, IEEE or your own style, with the list of sources at the back. Point it at your Zotero library (BibTeX or CSL-JSON).')],
		],
		exportWhere: wsT('Open it from the Word-Smith menu.'),
		exportCard: wsT('Export adds a timestamp to the file name, so no more “TheBook-final-final-v7.docx”.'),
	};
}

// WHAT'S NEW, AS ABOUT SHOWS IT: the release notes' own shape (### a group, - a line) drawn as headings and lists,
// text only; anything else is a paragraph
export function wsWhatsNewInto(box: HTMLElement, md: string) {
	let list: HTMLElement | null = null;
	for (const raw of md.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) { list = null; continue; }
		const h = /^#{1,6}\s+(.*)$/.exec(line);
		if (h) { box.createEl('h4', { text: h[1] }); list = null; continue; }
		const li = /^[-*]\s+(.*)$/.exec(line);
		if (li) { if (!list) list = box.createEl('ul'); list.createEl('li', { text: li[1] }); continue; }
		box.createEl('p', { text: line });
		list = null;
	}
}

// A link that opens in the browser: Obsidian hands an outside href to the system's browser
function wsLinkButton(parent: HTMLElement, cls: string, icon: string, text: string, href: string, title: string) {
	const a = parent.createEl('a', { cls, attr: { href, target: '_blank', rel: 'noopener', title } });
	setIcon(a.createSpan({ cls: 'ws-welcome-link-icon' }), icon);
	a.createSpan({ text });
	return a;
}

// an info card, the settings' own look
function wsWelcomeCard(parent: HTMLElement, text: string) {
	const d = parent.createDiv({ cls: 'ws-welcome-card' });
	setIcon(d.createSpan({ cls: 'ws-welcome-card-icon' }), 'info');
	d.createSpan({ text });
	return d;
}

export class WsWelcomeModal extends Modal {
	plugin: WordSmith;
	at = 0;
	constructor(app: App, plugin: WordSmith) { super(app); this.plugin = plugin; }

	// A SETUP SWITCH, THE SETTINGS' OWN WRITE: the tab's hooks (the pane opened or closed, the history file made) and
	// the save; the bare write and save only when the tab is not there (a start that blocked)
	async apply(key: 'enableRetroStatus' | 'menuDock' | 'historyTracking' | 'hideOwnFolder', value: boolean) {
		const tab = this.plugin._settingsTab;
		if (tab) { await tab.applyKey(key, value); return; }
		this.plugin.settings[key] = value;
		await this.plugin.saveSettings(true);
	}

	onOpen() {
		const T = wsWelcomeText();
		this.modalEl.addClass('ws-welcome');
		this.titleEl.setText(T.title);
		const c = this.contentEl;
		const rail = c.createDiv({ cls: 'ws-welcome-rail', attr: { role: 'tablist' } });
		const panes = c.createDiv({ cls: 'ws-welcome-panes' });
		const foot = c.createDiv({ cls: 'ws-welcome-foot' });
		foot.createSpan({ cls: 'ws-welcome-hint', text: T.hint });
		const close = foot.createEl('button', { cls: 'ws-welcome-close', text: T.close });
		close.addEventListener('click', () => { this.close(); });
		const next = foot.createEl('button', { cls: 'mod-cta ws-welcome-next', text: T.next });
		// (the Write tab the Modes' feather, Organize the Organizer's list-tree, Export the menu's file-output turned
		// to point away, as the menu draws them)
		const tabs: { id: string; name: string; icon: string; flip?: boolean; draw: (el: HTMLElement) => void }[] = [
			{ id: 'hello', name: T.hello, icon: 'sparkles', draw: (el) => { this.drawHello(el); } },
			{ id: 'setup', name: T.setup, icon: 'sliders-horizontal', draw: (el) => { this.drawSetup(el); } },
			{ id: 'data', name: T.data, icon: 'database', draw: (el) => { this.drawData(el); } },
			{ id: 'write', name: T.write, icon: 'feather', draw: (el) => { this.drawFeats(el, T.writeFeats, '', T.writeCard); } },
			{ id: 'organize', name: T.organize, icon: 'list-tree', draw: (el) => { this.drawOrganize(el); } },
			{ id: 'export', name: T.export, icon: 'file-output', flip: true, draw: (el) => { this.drawFeats(el, T.exportFeats, T.exportWhere, T.exportCard); } },
		];
		const pills: HTMLElement[] = [], bodies: HTMLElement[] = [];
		const pick = (i: number) => {
			this.at = i;
			pills.forEach((p, k) => { p.toggleClass('is-picked', k === i); p.setAttribute('aria-selected', String(k === i)); });
			bodies.forEach((b, k) => { b.toggleClass('is-shown', k === i); });
			next.setText(i === tabs.length - 1 ? T.done : T.next);
		};
		tabs.forEach((t, i) => {
			// (the settings' own pills: the rails' look, `is-picked` the accent)
			const p = rail.createEl('button', { cls: 'ws-pill ws-welcome-pill', attr: { role: 'tab', 'data-tab': t.id } });
			const ic = p.createSpan({ cls: 'ws-pill-icon' + (t.flip ? ' is-mirrored' : '') });
			setIcon(ic, t.icon);
			p.createSpan({ cls: 'ws-pill-name', text: t.name });
			p.addEventListener('click', () => { pick(i); });
			pills.push(p);
			const b = panes.createDiv({ cls: 'ws-welcome-pane', attr: { 'data-pane': t.id, role: 'tabpanel' } });
			t.draw(b);
			bodies.push(b);
		});
		next.addEventListener('click', () => { if (this.at === tabs.length - 1) this.close(); else pick(this.at + 1); });
		pick(0);
	}

	onClose() { this.contentEl.empty(); }

	drawHello(el: HTMLElement) {
		const T = wsWelcomeText();
		el.createDiv({ cls: 'ws-welcome-big', text: T.helloBig });
		el.createEl('p', { cls: 'ws-welcome-lead', text: T.helloLead });
		el.createEl('p', { text: T.helloBody });
		wsWelcomeCard(el, T.helloCard);
		// THE LANGUAGES (A799, A801): a card of its own, its line, the names in their own words, then how to get a pack
		const lc = el.createDiv({ cls: 'ws-welcome-card ws-welcome-langcard' });
		setIcon(lc.createSpan({ cls: 'ws-welcome-card-icon' }), 'languages');
		const lb = lc.createDiv({ cls: 'ws-welcome-langbody' });
		lb.createSpan({ text: T.langs });
		const line = lb.createDiv({ cls: 'ws-welcome-langs' });
		for (const [code, name] of WS_WELCOME_LANGS) line.createSpan({ cls: 'ws-welcome-lang', text: name, attr: { 'data-lang': code } });
		lb.createDiv({ cls: 'ws-welcome-langhow', text: T.langsHow });
		el.createEl('p', { text: T.happy });
		const links = el.createDiv({ cls: 'ws-welcome-links' });
		wsLinkButton(links, 'ws-welcome-yt', 'play', T.watch, WS_INTRO_URL, T.watchTitle);
		wsLinkButton(links, 'ws-welcome-guide', 'book-open', T.docs, WS_README_URL, T.docsTitle);
	}

	drawSetup(el: HTMLElement) {
		const T = wsWelcomeText(), s = this.plugin.settings;
		el.createEl('p', { cls: 'ws-welcome-sub', text: T.setupSub });
		el.createEl('p', { cls: 'ws-welcome-subnote', text: T.setupNote });
		const sw = (key: 'enableRetroStatus' | 'menuDock' | 'historyTracking' | 'hideOwnFolder', name: string, desc: string) => {
			new Setting(el).setName(name).setDesc(desc).addToggle((t) => t.setValue(!!s[key]).onChange((v) => { void this.apply(key, v); }));
		};
		sw('enableRetroStatus', T.powerline, T.powerlineDesc);
		sw('menuDock', T.pane, T.paneDesc);
		wsWelcomeCard(el, T.keyboardCard);
		sw('historyTracking', T.history, T.historyDesc);
		sw('hideOwnFolder', T.hide, T.hideDesc);
	}

	drawData(el: HTMLElement) {
		const T = wsWelcomeText();
		el.createEl('p', { cls: 'ws-welcome-lead', text: T.dataLead });
		const ul = el.createEl('ul', { cls: 'ws-welcome-files' });
		for (const [name, when, desc] of T.files) {
			const li = ul.createEl('li');
			setIcon(li.createSpan({ cls: 'ws-welcome-file-icon' }), 'file-text');
			const head = li.createSpan({ cls: 'ws-welcome-file-head' });
			head.createEl('code', { text: name });
			head.createSpan({ cls: 'ws-welcome-file-when', text: when });
			li.createEl('p', { text: desc });
		}
		wsWelcomeCard(el, T.dataCard);
	}

	drawOrganize(el: HTMLElement) {
		const T = wsWelcomeText();
		el.createEl('p', { cls: 'ws-welcome-lead', text: T.organizeLead });
		for (const p of T.organizeBody) el.createEl('p', { text: p });
		el.createEl('p', { cls: 'ws-welcome-where', text: T.organizeWhere });
		wsWelcomeCard(el, T.organizeCard);
	}

	drawFeats(el: HTMLElement, feats: string[][], where: string, card: string) {
		for (const [name, desc] of feats) {
			const f = el.createDiv({ cls: 'ws-welcome-feat' });
			f.createSpan({ cls: 'ws-welcome-feat-name', text: name });
			f.createSpan({ cls: 'ws-welcome-feat-desc', text: desc });
		}
		if (where) el.createEl('p', { cls: 'ws-welcome-where', text: where });
		wsWelcomeCard(el, card);
	}
}
