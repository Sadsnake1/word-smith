# The Organiser

[← Back to the README](../README.md)

Your manuscript down the left, described on the right. The tree is the book's own order, and the folder you light up in it opens as a table.

<img width="1573" alt="The Organiser: tree on the left, table of chapters on the right" src="https://github.com/user-attachments/assets/d1fa8dc0-21cb-475b-81a2-11a012c086f0" />

Open it from the book icon in the ribbon or **Open the Organiser** in the command palette. It can also open as a pane you dock beside the note you're writing, or in its own window on a second screen.

## The tree

**One tree, on every tab.** Names and folds, and nothing else — the readings live in the table, where they can be sorted and filtered. History keeps the same tree beside it, Export grows a tick box on every row, and the file-tree button at the left of the tabs puts it away when you want the panel to have the window.

- **It's Obsidian's own tree.** The same chevrons, indent guides, open and close. Every kind of file appears — notes, images, canvases, bases, PDFs, audio, video — each with its own glyph and its extension in a small tag beside the name. Which kinds appear is a filter of its own, and it keeps a chip in the toolbar when you've narrowed it.
- **Search prunes it.** The box in the sidebar header cuts the tree down by name on every tab; empty folders are findable by their own name, the search survives switching tabs, and Escape clears it. It hides rows, never data.
- **Click a folder** and the right pane is its notes — everything under it, flat, however deep the folders go.
- **Drag a row** to put it where it belongs in the book. That's the same order Obsidian's file tree draws and the same order the manuscript compiles in — one order, three places. Drag it into another folder and the file moves.

## The table

Nine readings, three of them on to begin with — **Target**, **Words** and **Flag** — with **Grade**, **Last modified**, **Created**, **Paras**, **Tasks** and **Tags** one press away, because a column costs every row in your vault.

- **Any property in your vault can be a column.** Pick one and it takes its place beside the readings, editable where it sits. Right-click its header to sort by it, filter on it, hide it, or take it out again. Drag headers to reorder them.
- **A header click cycles** descending, ascending, back to the book's order. Ties break by book order, so a sort never scrambles two scenes that agree.
- **With no sort or filter up**, rows sit under their folder headings in book order. Put a lens on and the groups dissolve into one flat list, each row carrying its path faintly. Clear the lens and the groups come back.
- **Filter** is a text search (name and content) plus chips — pick a property, pick or type a value. Chips combine with AND, each is dismissible. No query language.
- **Click a row to look at it, click again to open it.** Enter opens the row under the cursor.
- **Folder rows add up** what's under them — words summed, grade averaged, tasks summed — counting folded rows and undrawn ones alike. A shut folder is never an empty one.
- **A cell being edited is never redrawn.** Something else touching that note while you're typing patches around your cell rather than through it. The edit commits when you leave the cell.

## Properties

One button in the bar, **Properties**, opens one flat list: every reading and every property you've made a column, in the order they appear. Search at the top, drag a row to reorder, tick to show, and remove a property from its own row.

- **Add a new property** — pick its type first (text, list, number, checkbox, date, date & time), then name it. Nothing is created until the name is typed.
- **Add an existing property** — search what your notes already carry.
- **The editors are typed from Obsidian's own registry**: text becomes an input, a list becomes chips with autocomplete from the values already in your vault, a checkbox a toggle, a date a date box. Frontmatter tags are chips you can remove; `#tags` in the body are drawn dimmed and marked *in text*, because they're prose. A nested value is shown read-only rather than flattened into something it isn't.
- **Properties work on any file** — a PDF or a spreadsheet in your manuscript can carry them. Word targets stay markdown-only, which is what a target means.

**A note on YAML:** property edits go through Obsidian's own frontmatter writer, which is atomic and keeps your other keys — but the first write to a note may normalise that note's frontmatter formatting (quoting style, key spacing). The values are untouched.

## Targets and flags

Give a note a word count to aim for, and a mark for where it's up to. Both are columns in the table, editable where they sit.

**The target cell takes a number** and keeps it. It reads either `2,145/5,000` or `43%` — Settings → Organiser → **Target column shows**. **A folder's target is the sum of its notes**, so a book laid out as folders carries a target at every level without your typing one. A row doesn't need a target; a note with none is in the table precisely so you can give it one.

**Up to five flags, and they're yours.** *Sketch*, *Draft*, *Revise*, *Blocked* and *Done* to begin with, each with a tiny flag beside the word — a hollow outline, a pennant, a swallowtail, an alert, a banner. They're told apart by shape, not only colour, so they read at any size and for anyone. Settings → Organiser sets how many states you have, and for each its name, its shape from ten, and a colour for light and dark. Renaming a flag never changes what's written in your vault.

Click a flag to cycle it, or press space on the row. Switch on **File tree → File tree flags** and the same flag appears in Obsidian's own file explorer. `{flag}` on the bar shows the flag of the note you're in and changes it with a click.

**The reading grade** is years of school needed to read it easily, under 9 being easy going. A folder's is every word in it over every sentence, so a two-line scene doesn't count for as much as a four-thousand-word chapter.

**Targets follow your files.** Rename a note or move a folder and its target moves with it. They're kept in `ws-structure.md`, a plain note you can read and edit — see [Privacy and your files](privacy.md).

## The Export tab

Every row grows a tick box while that tab is up — tick what goes in, untick what doesn't — and the format, the destination and the preview are the export window's own. There's no drag on that tab: the order is already answered. See [Export](export.md).

**Several folders can be one compile.** Ctrl-click Part One and Part Three and both go out, in the order you picked them. A folder chosen along with a folder inside it is taken once, not twice. Each folder remembers its own ticks.

## Your own order in the file tree

Obsidian sorts the file tree by name, which is why manuscripts end up called `01 - Opening`, `02 - The Ferry` — numbers you then live with in every link, tab title and search result.

Switch on **File tree → Custom order in the file tree** and drag your notes and folders into the order the book is in instead.

- **Drag to the top or bottom edge of a row** to put something above or below it; a line shows where it'll land. **Drop on the middle of a folder** and it still moves the file into that folder, exactly as it always did.
- Reordering works **within a folder**. Dragging between folders is a move, which is Obsidian's own gesture and unchanged.
- **New notes go to the end**, alphabetically among themselves, until you move them.
- **The Organiser's tree drags the same way**, and it's the same order: move a chapter in either tree and it moves in both. **Your manuscript compiles in that order too.**
- The order is kept in `ws-structure.md`, one path per line. You can reorder those lines by hand and the tree will follow.
- Switching this off puts Obsidian's tree back to its own order. It doesn't throw the order away.
- **Folder icons** — a switch of its own — puts a small folder beside each folder name in Obsidian's tree, the same glyph the Organiser draws.

## In Obsidian's own file tree

Under **Settings → File tree**, Word-Smith can add to the explorer: word counts (folders totalling what's inside), flags, tasks left, goal percentage, folder icons and file-kind icons. **Outline counts** put each heading's word count beside it — the fastest way to see which scene ran long.
