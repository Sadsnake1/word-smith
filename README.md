<div align="center">

  <a href="https://github.com/Sadsnake1/word-smith/stargazers"><img src="https://img.shields.io/github/stars/Sadsnake1/word-smith?style=flat-square&logo=github&logoColor=white&labelColor=1a1a1a&color=F5B301" alt="Stars"></a>
  <a href="https://github.com/Sadsnake1/word-smith/releases"><img src="https://img.shields.io/github/downloads/Sadsnake1/word-smith/total?style=flat-square&logo=github&logoColor=white&labelColor=1a1a1a&color=10B981" alt="Downloads"></a>
  <a href="https://github.com/Sadsnake1/word-smith/releases/latest"><img src="https://img.shields.io/github/v/release/Sadsnake1/word-smith?style=flat-square&logo=obsidian&logoColor=white&labelColor=1a1a1a&color=8B5CF6" alt="Version"></a>
  <a href="https://github.com/Sadsnake1/word-smith/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Sadsnake1/word-smith?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=1a1a1a&color=3B82F6" alt="License"></a>
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank"><img src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=000000&labelColor=FFDD00" alt="Buy Me a Coffee"></a>

  <h1>Word-Smith</h1>

  <p><strong>Dedicated Writing Studio inside Obsidian.</strong><br>
  Novels, poems, articles, journals, on top of the most powerful binder-outliner-database of every file in your vault.</p>

  <img width="1920" alt="Word-Smith in zen mode with the letter box and a powerline bar" src="https://github.com/user-attachments/assets/6a0f3702-b311-4dce-ac49-12df2fbe6acc" />

</div>

Word-Smith turns Obsidian into a writing app. It hides everything but your words while you draft, shows you the whole work when you step back, counts what you wrote each day, and sends the finished thing out as a PDF, a Word file, a web page or Markdown.

It is free, it runs only on your machine, and it never asks you to set up a project. No wizard, no special folder, no project file, no AI reading or writing your text. Use folders. Put files in folders. Put words in files. Word-Smith works with whatever shape that takes.

It's built for long books: a binder, targets per chapter, one manuscript compiled from a folder of scenes. But it's just as much for a poem you're ordering into a collection, an article with a word limit, or a journal you keep every morning and want to see grow.

Every feature is its own switch. A fresh install turns on almost nothing, so there's nothing to undo while you look around.

## Any file, as a database

This is the part that surprised people. The Organiser gives properties to **any file in your vault**: PDFs, spreadsheets, Word documents, images, canvases, audio, epubs, not just notes. Add a tag to a PDF, a checkbox to an `.xlsx`, a rating to a movie file, a description to a book cover. Then sort and filter the lot by any column, like a database, and open anything with a click.

Notes are untouched. Their properties stay in their own frontmatter, and the Organiser reads and edits them there. Files that can't carry frontmatter get theirs written to `ws-structure.md`, a plain note in your vault.

Some ways it's already being used:

- **An outliner.** Add `Description` and `POV` as columns, treat each note as a scene, drag them into order. That order is the order the manuscript compiles in.
- **A task manager.** `Tasks` and `Tags` columns: every note carrying `#work` and its `12/25` of tasks done, sortable.
- **A contracts folder.** Word files, PDFs and spreadsheets tagged and sorted by last modified, straight in the vault.
- **A research archive.** Scans, PDFs and transcriptions with the properties a citation needs, beside the notes that cite them.
- **A library.** Editions of a book as properties on its cover image, instead of a note per edition.

Did I just build Bases? Kinda, but no. Bases is for notes. The Organiser takes every file, and adds custom order, word targets, status flags, task counts, reading grade and a compiler on top.

## What's in the box

| | | Read more |
|---|---|---|
| **The Organiser** | Your work as a tree and a table. Any property of any file as a column: sort it, filter it, edit it where it sits. Targets, flags, word counts, tasks. Drag a chapter and it moves in the file tree, the table and the manuscript. | [Organiser](docs/organiser.md) |
| **Export** | Compile a folder into one manuscript, as PDF, Word, web page or Markdown, with a paged preview and the submission standard built in. Or just glue some notes together. | [Export](docs/export.md) |
| **Zen** | Hides the interface, one piece at a time. `Escape` brings it back. | [Writing modes](docs/writing-modes.md) |
| **Letter box** | Masks the top and bottom of the screen so only the part you're working on shows. | [Writing modes](docs/writing-modes.md) |
| **Typewriter** | Keeps the line you're writing in the middle of the screen, and can dim everything around it. | [Writing modes](docs/writing-modes.md) |
| **Hemingway** | Locks backspace, undo and the arrows so a first draft can only move forward. | [Writing modes](docs/writing-modes.md) |
| **Typography** | Curly quotes, dashes, ellipses and fractions as you type. Never inside code. | [Writing modes](docs/writing-modes.md) |
| **Syntax & prose checks** | Colours nouns, verbs and adjectives; flags filler, passive voice, doubled words. Rules, not a model. Local, and honest about being a guess. | [Syntax and prose](docs/syntax-and-prose.md) |
| **Powerline** | A status bar you build yourself, up to three rows of counts, clocks, buttons and colour. Written as text, in the terminal style. | [Powerline](docs/powerline.md) |
| **Themes** | Twenty-five colour schemes for the whole workspace, each a matched dark/light pair, taken value for value from the editors that made them. | [Themes](docs/themes.md) |
| **History & report** | How much you wrote each day, charted, with streaks. And a report on any note or folder. | [History and report](docs/history-and-report.md) |
| **The menu** | One keyboard-driven pop-up, or a docked panel, for all of the above. Add any Obsidian command to it, other plugins included. | [Commands and menu](docs/commands-and-menu.md) |

Also: Vim niceties, keyboard-only jumps between panes and sidebars, right-to-left support, and word counts in Obsidian's own file tree. It pairs well with [Cursor-Smith](https://github.com/Sadsnake1/cursor-smith) for the caret, and with Fountain or Longform if you use them. The whole thing keeps Obsidian's own look, so it feels like home.

## Install

**Settings → Community plugins → Browse**, search for **Word-Smith**, install, enable.

Or by hand: download `main.js`, `styles.css` and `manifest.json` from the [latest release](https://github.com/Sadsnake1/word-smith/releases/latest) into `.obsidian/plugins/word-smith/`, reload, enable. Copy all three when you update. The plugin checks they match.

Desktop, tablet and phone. The Organiser wants a bigger screen; everything else is happy on a phone.

## Five minutes in

1. Open the Organiser (the book icon in the ribbon) and click a folder. That's your book, your collection, or your archive, as a table.
2. Press **Properties** and add a column: something your files already carry, or a new one. Click a cell to edit it.
3. Open **Settings → Word-Smith**. It lands on the **Powerline** tab. Try one of the two shipped bars before building your own.
4. Turn on **Zen** and **Letter box**. Write something.
5. Switch on **History** last. It can only count from the day you turn it on.

## A look around

**The Organiser.** The tree is the order of the work; the folder you click opens as a table. Every file, every property. Open it as a tab and dock it above or beside the note you're writing.

<img width="1573" alt="The Organiser: tree on the left, table of chapters on the right" src="https://github.com/user-attachments/assets/d1fa8dc0-21cb-475b-81a2-11a012c086f0" />

**Export.** Tick what goes in, choose the paper, and preview the pages before a file is written.

<img width="1570" alt="The Export tab with a paged preview" src="https://github.com/user-attachments/assets/99bc31c9-8781-469a-8446-22f89105dec7" />

**Writing modes and themes.** Zen, the letter box, and a workspace recoloured in one click.

<table>
  <tr>
    <td width="50%"><img alt="Zen mode with the powerline bar" src="https://github.com/user-attachments/assets/41d1249f-ba39-4389-a19c-dff8893b52e0" /></td>
    <td width="50%"><img alt="A colour scheme applied to the whole workspace" src="https://github.com/user-attachments/assets/cbd3aec7-6fdf-4318-8fd8-d9090bbfb815" /></td>
  </tr>
  <tr>
    <td width="50%"><img alt="Another scheme, with the letter box" src="https://github.com/user-attachments/assets/3039b88e-f9fd-498d-8778-0fd207d72c18" /></td>
    <td width="50%"><img alt="The letter box narrowing the page" src="https://github.com/user-attachments/assets/98f54322-b68e-42e0-9c04-c8e68d0c1d5c" /></td>
  </tr>
</table>

**History.** Words added rise from the centre line, words cut fall below it. A journal's best friend.

<table>
  <tr>
    <td width="50%"><img alt="History, day view" src="https://github.com/user-attachments/assets/5a751b82-0882-4d7b-95b8-7cf6dc35e8d0" /></td>
    <td width="50%"><img alt="History, calendar view" src="https://github.com/user-attachments/assets/a8c415e5-0768-4289-984b-54ab9bf4951c" /></td>
  </tr>
</table>

**The powerline.** From a single readout to a full row, and you write it as text.

<img width="1858" alt="A minimal powerline bar" src="https://github.com/user-attachments/assets/cadd2b38-a1f9-45f6-bad8-5a81ec4292a7" />
<img width="1393" alt="A short bar with a few colours" src="https://github.com/user-attachments/assets/e3a8de69-0445-4e88-9bc8-03a14899b3ca" />
<img width="1392" alt="Another short bar" src="https://github.com/user-attachments/assets/d147b2d3-b91a-4509-995b-9de184ca819e" />
<img width="1862" alt="A full powerline bar with fades and dividers" src="https://github.com/user-attachments/assets/5e08b3eb-748d-482c-99e3-c418bbe07d39" />

**The menu.** Everything you change while writing, in one keyboard-driven pop-up.

<img width="1920" alt="The Word-Smith menu" src="https://github.com/user-attachments/assets/c851d326-50d3-46da-afa9-51f63204e275" />

## Local, and only local

No network calls of any kind. No telemetry. No AI. No third-party dependencies. The syntax colouring and prose checks are a hand-written tagger and a set of rules that live in `main.js`. Your history is a note in your vault; your targets and order are another. [Don't take my word for it.](docs/privacy.md)

## Docs

| | |
|---|---|
| [Organiser](docs/organiser.md) | The tree, the table, properties on any file, targets and flags, custom order in the file tree |
| [Export](docs/export.md) | Formats, paper sizes, the submission standard, the preview, versioning with `.docx` |
| [Writing modes](docs/writing-modes.md) | Zen, letter box, typewriter, Hemingway, typography, fonts, per-note overrides, Vim, right-to-left |
| [Powerline](docs/powerline.md) | Every token, divider, colour and sizing rule, with examples |
| [Themes](docs/themes.md) | The twenty-five schemes, the shelf, the options, Cursor-Smith |
| [History and report](docs/history-and-report.md) | The chart, the streak, the report, what counts as a word |
| [Syntax and prose](docs/syntax-and-prose.md) | How the tagger works and what it gets wrong |
| [Commands and menu](docs/commands-and-menu.md) | Every command, the menu, quick panels, quick cycle, the settings map |
| [Privacy and your files](docs/privacy.md) | What it reads, what it stores, the three notes it keeps |
| [Troubleshooting](docs/troubleshooting.md) | If something looks wrong. Start with your installer version |

## Feedback and support

Found a bug or have an idea? [Open an issue](https://github.com/Sadsnake1/word-smith/issues). Your OS, Obsidian version and installer version (Settings → General) go a long way, and a screenshot goes further.

Word-Smith is free and MIT-licensed. If it's earned a coffee, thank you. And thanks to everyone on r/ObsidianMD who reported bugs and sent ideas. Most of what's here started as one of those.

<div align="center">
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="200">
  </a>
</div>
