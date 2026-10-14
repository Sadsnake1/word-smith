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

- **Front matter**: title page (with the word count, rounded if you like), running header, table of contents with working links.
- **Structure**: each file starts a new page, follows a divider, or runs straight on. Insert the file's name, the note's own heading, or nothing. Folder names as headings. **--- starts a new page**: a line of three dashes in a note breaks the page there, while `***` and `___` stay scene breaks (Word, PDF and web page).
- **Typesetting**: paper, font, size (10 to 24pt: past 14 is a large-print reading copy, with headings that grow with the text), spacing, indents, curly quotes.
- **Also include**: properties, `%%` comments, callouts, `#tags`, `==highlights==`, image placeholders, footnotes as endnotes. Tags and footnotes are on by default, the rest off. Turn Tags off to keep your tags in your notes and out of the manuscript.

Nine paper sizes: Letter, A4, Legal, Executive, B5, A5, plus the trim sizes a novel is actually printed at: trade paperback, digest and mass market. Margins scale with the paper.

**Font** searches the fonts on your machine, each shown in its own face. Type one you don't have and it's still accepted, because a manuscript set for someone else's computer is a real thing to want.

## The preview

The manuscript as pages, at the paper size you chose, before a single file is written. Page through it, zoom, **Fit** the whole sheet or **100%** for print size. Flip the paper dark for reading at night. Print still comes out ink on paper. **Refresh** redraws it after you edit and keeps your place.

Press **Expand** and the preview takes the whole pane as one long column of your pages: each keeps its width and its margins, and where one page ends and the next begins you see the page number and the running header as the file prints them. It opens fitted to the window; zoom in and it scrolls sideways rather than rewrapping. Click a paragraph and the note opens beside the reader with the caret on it. A drop-down at the foot jumps to any note in the manuscript, and `[` and `]` step through them. That's the fastest way to read your book back.

## The formats

Word, web page, e-book and Markdown work on phones too. For a PDF on a phone, export the web page and print it from the browser; the pane says so where the format would be.

- **PDF** is printed by Obsidian's own engine from the same document the preview draws, so it matches what you saw.
- **Word** is a real `.docx` with styles.
- **Web page** is the same document with its page rules built in. Print it from any browser and you get the PDF again.
- **E-book** is an EPUB for any e-reader: a file a chapter, the contents, the notes and the pictures inside. The reader sets the pages, the font and the line spacing, so paper, margins, the font and the spacing don't apply.
- **Markdown** is the plain compile. Also the way to glue a few notes into one file.

## Citations

Write Pandoc's citations in your notes, `[@woolf1929, p. 12]` or a narrative `@woolf1929`, and the export turns them into the style you pick under Settings → Word-Smith → Export → **Citations**: APA, Chicago (author-date or notes), Harvard, MLA, IEEE, or your own, built from tokens. Press **Customize** beside a style to start your own from it. Point it at your library, a BibTeX (`.bib`) or CSL-JSON file from Zotero, and the list of sources lands at the end.

A reprint or a translation keeps its original year (`origdate`, `original-date`): (1867; Paris: PUF, 1993) in a Chicago note, 1867/1993 in APA. Translators, editions, series and the day a web page was read come along too.

Harvard follows Cite Them Right: (Woolf, 1929, p. 108) in the text, Woolf, V. (1929) in the list. In Chicago notes, turn on **Ibid.** and a note citing the same source as the one before it says Ibid. (Ebd. in German, Там же in Russian). An export tells you which cited sources have no year or title.

The words around the fields follow your book's language (Settings → Word-Smith → **Language**): French gets "trad.", "2e éd.", "s.d." and « », German "übers. v." and „ “. A language pack can change any of them with a `cite-` line (`- cite-and: &`, `- cite-ibid: Id.`). IEEE stays in English.

## Where it stops

It does the submission standard and the handful of choices around it. It doesn't try to be a compile engine with a hundred switches. Once the draft is out, it's Word time with your editor. Comments come back in `.docx` or PDF, and there's no point round-tripping them into Obsidian.

Two nice things fall out of that. The `.docx` lands in your vault, one click from Word. And export is versioning: export today, write for a week, export again, and Word's Compare shows exactly what changed.
