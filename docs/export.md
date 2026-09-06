# Export

[← Back to the README](../README.md)

Pick a folder — or several, or a single note — and Word-Smith compiles it into one manuscript: **PDF**, **Word (.docx)**, a **web page (.html)** or **Markdown**. It opens from the Organiser's **Export** tab, the command palette, the menu, or `{export}` on the bar.

<img width="1570" alt="The Export tab with a paged preview" src="https://github.com/user-attachments/assets/99bc31c9-8781-469a-8446-22f89105dec7" />

## What goes in

The tree lists every note in the order it'll compile, grouped under its folders, each with its word count. **Tick what goes in**, drag a file to move it, drag a folder to move the whole chapter, and the total keeps up. Ticks and order are kept in `ws-structure.md`, so they survive closing the window.

**More than one folder can be one book.** Ctrl-click as many folders as you like — Part One and Part Three, or front matter kept apart from the chapters — and they compile together, in the order you picked them. A folder chosen along with a folder inside it is taken once, not twice.

**It remembers what you did last time** — how many files went out, as what, into where — with a button that puts the format, the folder and the scope back, so the usual export is one click of setting up and one of sending.

## The submission standard

It opens on it: title page, `Surname / Title / page` running header, each file starting a new page, a `#` between scenes, 12pt serif, double spaced, indented paragraphs, with widows and orphans controlled so no paragraph is left with one line stranded on a page of its own.

The **title** is the folder's name unless you type one; your **author** name goes on the title page and into the running header. Everything else is a switch, grouped as **Manuscript**, **Front matter**, **Structure**, **Typesetting** and **Also include**:

- **Front matter** — title page (with the word count, optionally rounded to the nearest hundred), running header, table of contents with working links.
- **Structure** — each file *starts a new page / follows a divider / runs straight on*; insert *the file's name / the note's own heading / nothing*; folder names as headings.
- **Typesetting** — paper, font, size (10–14pt), spacing (single, one and a half, double), indented paragraphs, curly quotes.
- **Also include** — properties, `%%` comments, `==highlights==`, images as `[Image: cover.png]` placeholders, footnotes (as endnotes). All off by default: a manuscript carries none of them until you ask.

**Paper** is nine sizes: US Letter, A4, US Legal, Executive, B5, A5, and the trim sizes a novel is actually printed at — trade paperback (6 × 9 in), digest (5.5 × 8.5 in) and mass market (4.25 × 6.87 in). The margin travels with the paper, because an inch of white on a 5.5-inch page is a third of the sheet.

**Font** searches the fonts installed on your machine, each name shown in its own face. Type a font this machine doesn't have and it's still accepted, with a line saying so — a manuscript set for somebody else's computer is a real thing to want.

**Indented paragraphs** is on, which is the manuscript convention. Turn it off and the prose is set block style — no first-line indent, a space between paragraphs — which is what most non-fiction uses.

A link's target is dropped and its text kept. Tables and code blocks come across as they are.

## The preview

Shows the manuscript as pages — the sheet you chose, at its own size and margins — before a single file is written. Page through it, zoom in and out, **Fit** the whole sheet, or **100%** for the size it'll print at. A **Light/Dark** button flips the paper for reading at night; printing always comes out ink on paper. Choose Markdown and it previews as the markdown file instead, since that's what you'd be getting.

## The formats

All four work everywhere, phones included.

- **PDF** is printed by Obsidian's own engine from the same document the preview draws, so pagination, margins and running header match what you saw.
- **Word** is a real `.docx` with styles, for anyone who asks for one.
- **The web page** is the same document with its page rules built in — printing it from any browser gives you the PDF again.
- **Markdown** is the plain compile, for wherever it goes next.
