<div align="center">

  <a href="https://github.com/Sadsnake1/word-smith/stargazers"><img src="https://img.shields.io/github/stars/Sadsnake1/word-smith?style=flat-square&logo=github&logoColor=white&labelColor=1a1a1a&color=F5B301" alt="Stars"></a>
  <a href="https://github.com/Sadsnake1/word-smith/releases"><img src="https://img.shields.io/github/downloads/Sadsnake1/word-smith/total?style=flat-square&logo=github&logoColor=white&labelColor=1a1a1a&color=10B981" alt="Downloads"></a>
  <a href="https://github.com/Sadsnake1/word-smith/releases/latest"><img src="https://img.shields.io/github/v/release/Sadsnake1/word-smith?style=flat-square&logo=obsidian&logoColor=white&labelColor=1a1a1a&color=8B5CF6" alt="Version"></a>
  <a href="https://github.com/Sadsnake1/word-smith/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Sadsnake1/word-smith?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=1a1a1a&color=3B82F6" alt="License"></a>
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank"><img src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=000000&labelColor=FFDD00" alt="Buy Me a Coffee"></a>

  <h1>Word-Smith</h1>

  <p><strong>A writing room inside Obsidian.</strong><br>
  Hide everything but your words, see your book as a whole, and send it out as a manuscript.</p>

  <img width="1920" alt="Word-Smith in zen mode with the letter box and a powerline bar" src="https://github.com/user-attachments/assets/6a0f3702-b311-4dce-ac49-12df2fbe6acc" />

</div>

Word-Smith started as a way to make Obsidian quiet enough to draft in. It grew into the things a novelist keeps reaching for: a binder for the book, a daily word count, and a compiler that turns a folder of scenes into a `.pdf`, `.docx`, web page or Markdown file.

Every feature is its own switch. A fresh install turns on almost nothing, so there's nothing to undo while you look around. It runs entirely on your machine — no network, no telemetry, nothing sent anywhere.

## What's in the box

| | | Read more |
|---|---|---|
| **Zen** | Hides the interface, one piece at a time. `Escape` brings it back. | [Writing modes](docs/writing-modes.md) |
| **Letter box** | Masks the top and bottom of the screen so only the part you're working on shows. | [Writing modes](docs/writing-modes.md) |
| **Typewriter** | Keeps the line you're writing in the middle of the screen, and can dim everything around it. | [Writing modes](docs/writing-modes.md) |
| **Hemingway** | Locks backspace, undo and the arrows so a first draft can only move forward. | [Writing modes](docs/writing-modes.md) |
| **Typography** | Curly quotes, dashes, ellipses and fractions as you type. Never inside code. | [Writing modes](docs/writing-modes.md) |
| **Syntax & prose checks** | Colours nouns, verbs and adjectives; flags filler, passive voice and doubled words. Local, and honest about being a guess. | [Syntax and prose](docs/syntax-and-prose.md) |
| **Powerline** | A status bar you build yourself — up to three rows of counts, clocks, buttons and colour. | [Powerline](docs/powerline.md) |
| **Themes** | Twenty-five colour schemes for the whole workspace, each a matched dark/light pair. | [Themes](docs/themes.md) |
| **The Organiser** | Your book as a tree, with word counts, targets, flags and any property as a column. Drag a chapter and it moves everywhere. | [Organiser](docs/organiser.md) |
| **History & report** | How much you wrote each day, charted; and a report on any note or folder. | [History and report](docs/history-and-report.md) |
| **Export** | Compile a folder of scenes into a manuscript — PDF, Word, web page or Markdown — with a paged preview. | [Export](docs/export.md) |

There's also a keyboard-only [menu](docs/commands-and-menu.md), Vim niceties, right-to-left support, and word counts in Obsidian's own file tree. All of it is in the docs.

## Install

1. Download `main.js`, `styles.css` and `manifest.json` from the [latest release](https://github.com/Sadsnake1/word-smith/releases/latest).
2. Put them in `.obsidian/plugins/word-smith/` inside your vault.
3. Reload Obsidian and enable **Word-Smith** under **Settings → Community plugins**.

Copy all three files when you update. The plugin checks they match and tells you at startup if they don't.

## Five minutes in

1. Open **Settings → Word-Smith**. It lands on the **Powerline** tab — try one of the two shipped bars before building your own.
2. Turn on **Zen** and **Letter box**, from settings or the command palette.
3. Want the workspace recoloured? **Theme** tab, pick a scheme. Nothing else changes.
4. Open the Organiser (book icon in the ribbon) and click a folder. That's your book.
5. Switch on **History** last. It can only count from the day you turn it on.

## A look around

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

**The Organiser** — the tree is the book's order; the folder you click opens as a table.

<img width="1573" alt="The Organiser: tree on the left, table of chapters on the right" src="https://github.com/user-attachments/assets/d1fa8dc0-21cb-475b-81a2-11a012c086f0" />

**Export** — tick what goes in, choose the paper, and preview the pages before a file is written.

<img width="1570" alt="The Export tab with a paged preview" src="https://github.com/user-attachments/assets/99bc31c9-8781-469a-8446-22f89105dec7" />

**History** — words added rise from the centre line, words cut fall below it.

<table>
  <tr>
    <td width="50%"><img alt="History, day view" src="https://github.com/user-attachments/assets/5a751b82-0882-4d7b-95b8-7cf6dc35e8d0" /></td>
    <td width="50%"><img alt="History, calendar view" src="https://github.com/user-attachments/assets/a8c415e5-0768-4289-984b-54ab9bf4951c" /></td>
  </tr>
</table>

**The powerline** — from a single readout to a full row, and you write it as text.

<img width="1858" alt="A minimal powerline bar" src="https://github.com/user-attachments/assets/cadd2b38-a1f9-45f6-bad8-5a81ec4292a7" />
<img width="1393" alt="A short bar with a few colours" src="https://github.com/user-attachments/assets/e3a8de69-0445-4e88-9bc8-03a14899b3ca" />
<img width="1392" alt="Another short bar" src="https://github.com/user-attachments/assets/d147b2d3-b91a-4509-995b-9de184ca819e" />
<img width="1862" alt="A full powerline bar with fades and dividers" src="https://github.com/user-attachments/assets/5e08b3eb-748d-482c-99e3-c418bbe07d39" />

**The menu** — everything you change while writing, in one keyboard-driven pop-up.

<img width="1920" alt="The Word-Smith menu" src="https://github.com/user-attachments/assets/c851d326-50d3-46da-afa9-51f63204e275" />

## Docs

| | |
|---|---|
| [Writing modes](docs/writing-modes.md) | Zen, letter box, typewriter, Hemingway, typography, text options, markers, per-note overrides, Vim, right-to-left |
| [Powerline](docs/powerline.md) | Every token, divider, colour and sizing rule, with examples |
| [Themes](docs/themes.md) | The twenty-five schemes, the shelf, the options, Cursor-Smith |
| [Organiser](docs/organiser.md) | The tree, the table, properties, targets and flags, custom order in the file tree |
| [History and report](docs/history-and-report.md) | The chart, the streak, the report, what's never counted |
| [Export](docs/export.md) | Formats, paper sizes, the submission standard, the preview |
| [Syntax and prose](docs/syntax-and-prose.md) | How the tagger works and what it gets wrong |
| [Commands and menu](docs/commands-and-menu.md) | Every command, the menu, quick panels, quick cycle, the settings map |
| [Privacy and your files](docs/privacy.md) | What it reads, what it stores, the three notes it keeps |
| [Troubleshooting](docs/troubleshooting.md) | If something looks wrong |

## Feedback and support

Found a bug or have an idea? [Open an issue](https://github.com/Sadsnake1/word-smith/issues). A screenshot and your Obsidian version go a long way.

Word-Smith is free and MIT-licensed. If it's earned a coffee, thank you.

<div align="center">
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="200">
  </a>
</div>
