# Export

[← Back to the README](../README.md)

Pick a folder, or several, or one note, and Word-Smith compiles it into one manuscript: **PDF**, **Word (.docx)**, **web page (.html)**, **e-book (.epub)** or **Markdown**.

It's a pane of its own. Open it from the command palette (**Export a manuscript…**), the menu, `{export}` on the bar, or select folders in Obsidian's explorer, right-click, **Export these**.

<img width="1570" alt="The Export tab with a paged preview" src="https://github.com/user-attachments/assets/99bc31c9-8781-469a-8446-22f89105dec7" />

## What goes in

While the Export pane is open, every note and folder in Obsidian's explorer gets a tick box. Tick what goes in, from anywhere in the vault: a note in another folder joins the manuscript, a folder ticked from outside comes in whole, and a folder with only some of its notes in shows a half tick. The count keeps up. Order is the file tree's order, so drag a file to move it, drag a folder to move the whole chapter. Ticks and order are saved in `ws-structure.md`, so they survive closing the pane.

Several folders can be one book. Select Part One and Part Three, right-click, Export these, and they compile together in the order you picked them.

It remembers your last export: how many files, what format, where to. One click sets it up again.

## The submission standard

It opens on it. Title page, `Surname / Title / page` running header, each file on a new page, a `#` between scenes, 12pt serif, double spaced, indented paragraphs, no widows or orphans.

Everything else is a switch:

- **Front matter**: title page (with a subtitle if you give one, and the word count, rounded if you like), running header, table of contents with working links.
- **Structure**: each file starts a new page, follows a divider, or runs straight on. **Headings** is one list: Folders (a folder becomes a heading where it begins; the book's own folder opens the text but is left out of the contents), File names, and Note headings (your own `#` headings, under the file's name when both are on), any of them together or none. **Numbers** puts 1.1.2, 1.1.2., I. A. 1. or Chapter 1 (with Part I for a top folder) before the folder and file headings, counted by your folders whether they print or not, in the contents too; a note's own headings are never numbered.
- **Typesetting**: paper, font, size (10 to 24pt: past 14 is a large-print reading copy, with headings that grow with the text), spacing, and **Justify text** for straight edges on both sides.
- **Also include**: properties, `%%` comments, callouts, `#tags`, `==highlights==`, image placeholders, footnotes as endnotes. Tags and footnotes are on by default, the rest off. Turn Tags off to keep your tags in your notes and out of the manuscript.

What you decide once lives in **Settings → Export**: your name, your address (a box of up to four lines), phone and email (**Contact on the title page** puts them in its top left corner), the header text, written with tokens (`{title}` `{page}` `{time12}` `{time24}` `{dd}` `{mm}` `{yyyy}` `{yy}`, so `Doe | {title} | {page}` or `{dd}-{mm}-{yy}` read as you type them; a `{page}` of its own puts the number there), **Header on the left**, where the page numbers go, the contents' title, **Center headings in exports** (on by default; off, headings start at the left like the text, and the title page stays centered), **--- starts a new page** (a line of three dashes in a note breaks the page there, while `***` and `___` stay scene breaks), **Indent paragraphs** and its **First-line indent** (a quarter inch to one inch, or 0.5 to 2 cm), **Indent after headings** (the first paragraph under a heading indented too, as French books set it), **Paragraph spacing** (Auto, Half a line or One line; every line of a note is its own paragraph, and each blank line past the first between two paragraphs is kept as one empty line, the paragraph after it starting flush), **Keep every blank line** (the first blank line too, for notes written one paragraph a line), curly quotes, and where Word puts the footnotes. A change there shows in an open preview at once.

Nine paper sizes: Letter, A4, Legal, Executive, B5, A5, plus the trim sizes a novel is actually printed at: trade paperback, digest and mass market. Margins scale with the paper.

**Font** searches the fonts on your machine, each shown in its own face. Type one you don't have and it's still accepted, because a manuscript set for someone else's computer is a real thing to want.

## The preview

The manuscript as pages, at the paper size you chose, before a single file is written. Page through it, zoom, **Fit** the whole sheet or **100%** for print size. Flip the paper dark for reading at night. Print still comes out ink on paper. **Refresh** redraws it after you edit and keeps your place.

For a Word file, footnotes sit at the foot of the page that cites them, under a short rule, the way Word sets them, so the pages you see are the pages Word prints. With **Notes at the end** (Settings → Word-Smith → Export), and for a PDF or a web page, they're at the back.

Press **Expand** and the preview takes the whole pane, your pages one under the other with a little space between them, the same as the preview: each page the paper's size, with its margins, running header, page number and footnotes where the file prints them. It opens fitted to the window; zoom in and it scrolls sideways rather than rewrapping. Click a paragraph and the note opens beside the reader with the caret on it. A drop-down at the foot jumps to any note in the manuscript, and `[` and `]` step through them. Left and Right, or Page Up and Page Down, turn a page; Home and End go to the ends; Escape collapses. That's the fastest way to read your book back.

## The formats

Word, web page, e-book and Markdown work on phones too. For a PDF on a phone, export the web page and print it from the browser; the pane says so where the format would be.

- **PDF** is printed by Obsidian's own engine from the same document the preview draws, so it matches what you saw.
- **Word** is a real `.docx` with styles.
- **Web page** is the same document with its page rules built in. Print it from any browser and you get the PDF again.
- **E-book** is an EPUB for any e-reader: a file a chapter, the contents, the notes and the pictures inside. The reader sets the pages, the font and the line spacing, so paper, margins, the font and the spacing don't apply.
- **Markdown** is the plain compile. Also the way to glue a few notes into one file. Your pictures stay where they are, and the Markdown links to each one there, so pandoc can find and size them.

## Citations

Write Pandoc's citations in your notes, `[@woolf1929, p. 12]` or a narrative `@woolf1929`, and the export turns them into the style you pick under Settings → Word-Smith → Export → **Citations**: APA, Chicago (author-date or notes), Harvard, MLA, IEEE, or your own, built from tokens. Press **Customize** beside a style to start your own from it. Point it at your library, a BibTeX (`.bib`) or CSL-JSON file from Zotero, and the list of sources lands at the end.

Keys can use any alphabet (`@Søhr_1938`). A key with other punctuation in it, or one ending in a full stop, goes in braces: `[@{Räikkönen_1935.498–506}]`. Type `[@` to search your library; a key that needs braces gets them.

A reprint or a translation keeps its original year (`origdate`, `original-date`): (1867; Paris: PUF, 1993) in a Chicago note, 1867/1993 in APA. Translators, editions, series and the day a web page was read come along too.

Harvard follows Cite Them Right: (Woolf, 1929, p. 108) in the text, Woolf, V. (1929) in the list. In Chicago notes, turn on **Ibid.** and a note citing the same source as the one before it says Ibid. (Ebd. in German, Там же in Russian). An export tells you which cited sources have no year or title.

The words around the fields follow your book's language (Settings → Word-Smith → **Language**): French gets "trad.", "2e éd.", "s.d." and « », German "übers. v." and „ “. A language pack can change any of them with a `cite-` line (`- cite-and: &`, `- cite-ibid: Id.`). IEEE stays in English.

## Where it stops

It does the submission standard and the handful of choices around it. It doesn't try to be a compile engine with a hundred switches. Once the draft is out, it's Word time with your editor. Comments come back in `.docx` or PDF, and there's no point round-tripping them into Obsidian.

Two nice things fall out of that. The `.docx` lands in your vault, one click from Word. And export is versioning: export today, write for a week, export again, and Word's Compare shows exactly what changed.
