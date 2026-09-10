# The Organizer

[← Back to the README](../README.md)

The big boy. Obsidian's file explorer is the tree, the Organizer is the table. Click a folder in the explorer and every file under it becomes a row, with any property as a column.

<img width="1573" alt="The Organizer: a folder as a table of chapters" src="https://github.com/user-attachments/assets/d1fa8dc0-21cb-475b-81a2-11a012c086f0" />

Run **Open the Organizer** from the command palette or the menu. It's a pane, so dock it next to the note you're writing. It follows whatever note you open, and the arrow keys walk the table without changing the folder.

No project file, no special folder. Your folders and files, as they are.

## Any file

Notes keep their properties in their own frontmatter, and the Organizer edits them there. Everything else (PDFs, spreadsheets, images, canvases, audio, epubs) gets its properties written to `ws-structure.md`, a plain note in your vault. Same table, same columns.

So a note tagged `#birds` and a PDF tagged `#birds` sit in one filtered list. A spreadsheet can carry a checkbox. A book cover can carry the editions of the book. You can run an e-book database with real epub files, or a contracts folder, or a research archive. Bases does this for notes. The Organizer does it for every file.

## The table

Readings the frontmatter can't give you: word count, target, flag, reading grade, paragraphs, tasks, tags, created, last modified. Turn on the ones you want. Then add any property in your vault as a column and edit it right there.

- Click a header to sort. Click again to flip. Again to go back to book order.
- **Filter** is a text search plus chips: pick a property, pick a value. Chips stack. No query language. The same button picks which kinds of file show up.
- Click a row to look at it, click again to open it.
- Folder rows add up what's inside them, folded or not.
- A cell you're editing never gets redrawn under you.

## Properties

One button, **Properties**, one flat list. Tick to show, drag to reorder, search at the top. Add a new property by picking its type first: text, list, number, checkbox, date, or date and time. Editors come from Obsidian's own registry, so a list is chips with autocomplete and a checkbox is a toggle.

Edits go through Obsidian's frontmatter writer. Your other keys are safe. The first write might tidy the formatting of that note's frontmatter, but not the values.

## Targets and flags

Give a note a word count to aim for. A folder's target is the sum of its notes, so a book laid out as folders carries a target at every level for free.

Five flags to start: **Sketch**, **Draft**, **Revise**, **Blocked**, **Done**. Each has a little shape beside the word, so they read at any size. Settings → Organizer sets how many you have, their names, one of ten shapes, and a colour for dark and light. Click a flag to cycle it, or press space on the row. Turn on **File tree → File tree flags** and the same flag shows in Obsidian's explorer.

Targets and flags follow your files when you rename or move them. They live in `ws-structure.md`. See [Privacy and your files](privacy.md).

## Export

Select several folders in the explorer, right-click, **Export these**. Or tick boxes in the explorer while the Export pane is open. See [Export](export.md).

## Your own order

Obsidian sorts by name, which is why manuscripts end up as `01 - Opening`, `02 - The Ferry`. Turn on **File tree → Custom order in the file tree** and drag your chapters into the order the book reads in instead.

- Drag to the top or bottom edge of a row to put something above or below it. Drop on a folder and it still moves the file in, like always.
- New notes go to the end until you move them.
- The table draws that order. The manuscript compiles in it. One order, three places.
- It's kept in `ws-structure.md`, one path per line. Edit it by hand if you like.
- Switch it off and Obsidian's order comes back. Yours isn't thrown away.

## In Obsidian's explorer

Under **Settings → File tree**: word counts (folders total what's inside), flags, tasks left, goal percentage, folder icons, file-kind icons. **Outline counts** put a word count beside each heading, so you can see which scene ran long.
