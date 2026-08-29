<div align="center">

  <a href="https://github.com/Sadsnake1/word-smith/stargazers"><img src="https://img.shields.io/github/stars/Sadsnake1/word-smith?style=flat-square&logo=github&logoColor=white&labelColor=1a1a1a&color=F5B301" alt="Stars"></a>
  <a href="https://github.com/Sadsnake1/word-smith/releases"><img src="https://img.shields.io/github/downloads/Sadsnake1/word-smith/total?style=flat-square&logo=github&logoColor=white&labelColor=1a1a1a&color=10B981" alt="Downloads"></a>
  <a href="https://github.com/Sadsnake1/word-smith/releases/latest"><img src="https://img.shields.io/github/v/release/Sadsnake1/word-smith?style=flat-square&logo=obsidian&logoColor=white&labelColor=1a1a1a&color=8B5CF6" alt="Version"></a>
  <a href="https://github.com/Sadsnake1/word-smith/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Sadsnake1/word-smith?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=1a1a1a&color=3B82F6" alt="License"></a>
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank"><img src="https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=000000&labelColor=FFDD00" alt="Buy Me a Coffee"></a>

</div>

# Word-Smith

A distraction-free writing suite for Obsidian. Zen mode, letterbox masks, typewriter scrolling, a write-forward lock, syntax colouring, prose checks, smart typography, a status bar you build yourself, twenty-five colour schemes for the whole workspace, a record of how much you write each day, and a compiler that turns a folder of scenes into a manuscript.

Every feature is separate. Use one, use all of them, or switch any of them off.

## Showcase
<img width="1920" height="1080" alt="33" src="https://github.com/user-attachments/assets/6a0f3702-b311-4dce-ac49-12df2fbe6acc" />



<img width="1920" height="1080" alt="3" src="https://github.com/user-attachments/assets/41d1249f-ba39-4389-a19c-dff8893b52e0" />

<img width="1476" height="857" alt="image" src="https://github.com/user-attachments/assets/cbd3aec7-6fdf-4318-8fd8-d9090bbfb815" />

<img width="1476" height="857" alt="image" src="https://github.com/user-attachments/assets/3039b88e-f9fd-498d-8778-0fd207d72c18" />

### Powerline

From minimal
<img width="1858" height="36" alt="image" src="https://github.com/user-attachments/assets/cadd2b38-a1f9-45f6-bad8-5a81ec4292a7" />

<img width="1393" height="30" alt="image" src="https://github.com/user-attachments/assets/e3a8de69-0445-4e88-9bc8-03a14899b3ca" />

<img width="1392" height="26" alt="image" src="https://github.com/user-attachments/assets/d147b2d3-b91a-4509-995b-9de184ca819e" />


To more complex

<img width="1862" height="40" alt="image" src="https://github.com/user-attachments/assets/5e08b3eb-748d-482c-99e3-c418bbe07d39" />

### Modal Menu
<img width="1920" height="1020" alt="image" src="https://github.com/user-attachments/assets/c851d326-50d3-46da-afa9-51f63204e275" />


## What it does

**Zen** hides everything except your words — the interface, the ribbon, the sidebars, the scroll bar, and if you like, every other pane and the status bar too. Press `Escape` to come back.

**Letter box** masks the top and bottom of the screen so you only see the part you're working on. Drag the line to resize the band, drag the arrows to change the inset. The arrows are yours to style — five built-in looks or your own characters, any number, any size.

**Typewriter** keeps the line you're writing in the middle of the screen. It can tint that line, and dim everything outside the paragraph or sentence you're in.

**Hemingway** locks the keys you'd use to go back and fiddle, so a first draft can only move forward. Each lock is separate — backspace, undo, cut, paste, arrows, clicks — and a blocked key can flash the screen, the bar, a badge, or nothing at all.

**Powerline** replaces Obsidian's status bar with one you build yourself, up to three rows. More on this below.

**Syntax** gives nouns, verbs, adjectives, adverbs and conjunctions each their own colour, and can mute everything else so one class carries the sentence.

**Prose checks** mark seven things worth a second look: filler words, passive voice, doubled words, easily confused pairs, vague pronouns, sentence rhythm, and repeated uncommon words.

Both of these run entirely on your machine, and both are guesswork — a mark is a nudge, not a verdict.

**Text options** cap the line length, indent paragraphs, adjust spacing and justify text. **Markers** — their own tab — draw the spaces, tabs and line breaks you normally can't see.

**Typography** turns what you type into the proper characters as you go: curly quotes, ellipses, en and em dashes, arrows, fractions. Never inside code, maths or frontmatter — and undo always gives back exactly what you typed.

**Themes** recolour the whole workspace — editor, sidebars, panels — with one of twenty-five schemes, each a matched dark/light pair that follows Obsidian's mode.

**The Manuscript window** is your whole book in one place: the vault as a
tree, every chapter's word count and target beside its name, the readings
you choose in columns beside it, and the compiler on a tab of its own. Drag a
chapter here and it moves in Obsidian's file tree and in the finished
manuscript too — one order, three places.

**Export** compiles a folder of scenes into one manuscript — Word, a web page, or Markdown.

**History** and **Export** get their own sections below; targets live in the Manuscript board.

## Getting started

A fresh install turns on only the bar and the menu. Everything else starts off, so there's nothing to undo while you look around.

1. Open **Settings → Word-Smith**. It opens on the **Powerline** tab.
2. Try one of the two shipped bars from the preset row before writing your own. They're worked examples — pull one apart to see how it's made.
3. Turn on **Zen** and **Letter box** from the settings, the command palette, or the **Modes** button if your bar has one.
4. Want the workspace recoloured? Open the **Theme** tab and pick a scheme. Nothing else changes.
5. Leave **History** for last. It's off until you switch it on, and it can only count from that day forward.

## Where it applies

You can limit Word-Smith to certain folders and notes — *only these*, or *everywhere except these*. Leave the list empty and it applies everywhere.

Any single note can override it from its frontmatter:

```yaml
---
wordsmith: off        # ignore this note entirely
ws-zen: true          # or override one thing at a time
ws-typewriter: false
ws-hemingway: true
ws-syntax: true
ws-markers: false
ws-typography: false
ws-font: Literata     # font for this note only
---
```

Open a canvas, a PDF or an empty tab and everything stands down — the bar disappears, Obsidian's own chrome returns. It all comes back the moment you're on a note again.

## Zen and the letter box
<img width="1476" height="857" alt="image" src="https://github.com/user-attachments/assets/98f54322-b68e-42e0-9c04-c8e68d0c1d5c" />

Zen is a list of things to hide, not one big switch: properties, the inline title, Obsidian's status bar, linked mentions, the scroll bar, the ribbon and the powerline bar each have their own toggle — plus **full screen**, **focused file mode** (close every other pane, so only this note is open), and a title bar painted to match the editor. "Zen" ends up meaning whatever you decide it means.

`Escape` leaves it — except in Vim's insert, visual and replace modes, where escape means "back to normal mode" and shouldn't also mean "give me my tabs back". There it costs one extra press.

**Hide the bar, and it comes back on hover.** With the bar hidden by zen, move the pointer to the bottom of the window and it slides up, lingering a moment so you can actually read it. Set the linger to 0 and it never comes back — that's the off switch.

The letter box is two masks in the note's own background colour, so it reads as a narrowing page, not a black bar laid over one. Both bands are draggable — the line resizes the mask, the arrows set the inset — and on desktop the top band moves the window, like a title bar, with the window buttons still clickable. It turns itself off in reading view, where there's no caret to frame.

You can cap the separator lines with arrows, give arrows and lines their own colours for dark and light themes, and set how much room the caret keeps from whatever sits at the edge of the window.

## The powerline bar

A bar at the bottom, sized to match your note rather than the window. One to three rows, each with a left, centre and right slot, each taking any mix of tokens.

Two bars ship with it — **Plain** and **Code**. Save your own as presets, and turn any preset into a **share code** you can send to someone else.

### Readouts

| | |
|---|---|
| `{file}` | The note's name, or its folders too. **Click it** to show the note in the file explorer |
| `{words}` `{chars}` | How much is in the note, or in your selection |
| `{ln:col}` `{paragraph}` | Where the cursor is; which paragraph of how many |
| `{readtime}` | How long the note takes to read |
| `{backlinks}` | How many other notes link here — `0` when nothing does. **Click it** to open the backlinks pane |
| `{time}` `{clock}` | The time, written out or drawn as a dial |
| `{dd}` `{mm}` `{yyyy}` `{yy}` | Date parts — join them however you like |
| `{battery}` `{caps}` `{num}` | Battery; CAPS and NUM, which only show when they're on |
| `{vim}` | Which Vim mode you're in |
| `{mode}` | A **Modes** button — letter box, typewriter, Hemingway and the rest, right on the bar |
| `{obsidian}` | A small Obsidian crystal, in the segment's own colour |

### Where you are in the note

| | |
|---|---|
| `{#>}` | The whole heading path: `Chapter 3 › The Ferry › Beat 2` |

It's empty above the first heading. When the row runs out of room the leading crumbs drop first, so the heading you're actually under is the last to go.

(Six older per-level tokens, `{#}` through `{######}`, were retired in 1.2.7. They still work and always will — removing them would break every saved bar that uses one.)

### Buttons

Click these. They're never dropped, however narrow the window gets.

`{syntax}` `{prose}` `{markers}` `{font}` `{theme}` — pickers for word classes, prose checks, hidden characters, your font, and your colour scheme.

`{font}` shows **Aa** and `{markers}` shows **¶** by default; either can show its name instead, under Token formats. The font button renders in the face you chose.

`{theme}` reads **Theme** and opens the scheme picker. The name stays fixed — your current scheme is in the tooltip and lit up in the popup — so picking a long-named scheme never reflows the row.

`{report}` opens the writing report. `{history}` opens your writing history. `{export}` opens the export window.

### Spacers and dividers

`{s}`, `{ss}`, `{sss}`… is a quarter-space each. Give one a colour and it becomes a solid sliver.

The punctuation between tokens becomes shape — **the character you type is the shape you get**:

| | |
|---|---|
| `>` `<` | arrow |
| `\|` | straight |
| `)` `(` | curve |
| `~` | wave |
| `/` `\` | the two slanted cuts |

Write `\|` for a real pipe. At the very start or end of a row, `<` and `>` point the end cap outwards.

Dividers are drawn as SVG, so you don't need a patched font.

### Colour

One palette of seven, in a dark set and a light one. `:N` paints a background, `;N` paints text — same numbers, same colours.

A token with **no colour lies flush with the bar**, like an unhighlighted stretch of a Vim status line. Colour is something you ask for, one segment at a time:

| | |
|---|---|
| `{words}:N` | Background colour N |
| `{words}:N;M` | And text colour M |
| `{words};vim` `{ln:col}:vim` | Text, or background, follows your Vim mode |
| `{file}:b1` … `:b4` | Your theme's page, panel, alt panel and tertiary surfaces |
| `{file}:bs` | The status line's own colour — the bar's default surface, which a scheme may name (Vim Blue paints it cyan, Quiet inverts it to black) |
| `{file}:bc` `;bc` | The cursor's colour, live, as background or text. With Cursor-Smith theming the caret per Vim mode it moves with the mode; without it, your theme's own caret |
| `{file};t1` `;t2` `;t3` | Your theme's normal, muted and faint text |

Leave the `;` off and the text picks itself, light or dark, so it stays readable on whatever background you chose.

The bar itself takes the same grammar at the very start of row 1's left slot:

```
:vim {vim} > {file} :: {ln:col}
```

There's no picker for the bar's colour, on purpose: write nothing and it sits on your theme's status-line colour (`:bs`) with matching text; write a directive and your choice is right there at the front of the row, where you can see it.

`{g}` is a fade — one colour stepping into the next, or out into the bar at a group's end. One step per token, so `{g}{g}{g}` is three narrow steps and `{ggg}` is one wide one. Put dividers between them and they keep their shape:

```
{file}:3 > {g}>{g}>{g} > {words}:5
```

A fade is decoration, and the bar treats it that way: it's the first thing dropped when the window runs out of room.

### Marks

`::` is a short thin line, and `>>` `<<` are the same line bent to a point. They're drawn in the text's own colour, not as a colour boundary, so they need no segment behind them. Type them doubled — a single `>` is a divider, and a single `:` starts a colour.

All of this is also in the plugin, under **How to write a row** in the Powerline tab.

### Sizing

Row height, font size, padding and edge rules are all yours to set. The top and bottom rules each take a style, a thickness and a colour — separately, with a dark and a light pair. The bar's text can also match your note's own size, so it follows Ctrl+scroll zoom.

When the window narrows, the bar sheds content by **what a thing is worth**, not where it sits. The file path shortens to just the name; a long heading trail drops its leading crumbs. Then the fades, then the shaped end points, then decoration, then the clock — the time is on your system clock and the wall too — then the other readouts, and last the things that say where you are: the file name and the Vim mode. Buttons always survive, and everything comes straight back when the window widens.

## Themes

Twenty-five colour schemes for the whole workspace, each a **matched pair** that follows Obsidian's light/dark mode and names the half you're looking at.

**Modus Vivendi / Operandi** (plain, Tinted, Deuteranopia, Tritanopia — Protesilaos Stavrou's, value for value from [his published palette](https://protesilaos.com/emacs/modus-themes-colors)), **Quiet**, **Habamax**, **Nord**, **Dracula**, **Gruvbox**, **Solarized**, **Catppuccin**, **Tokyo Night / Day**, **Rosé Pine**, **Monokai**, **One Dark / Light**, **Nightfox / Dayfox**, **Kanagawa Wave / Lotus**, **GitHub**, **Everforest**, **Vim Blue / Darkblue**.

Where a scheme's authors never made a light half, the light half is an adaptation rather than a survived dark palette — and the theme's card says so.

**Vim Blue is both of Vim's stock blue schemes, verbatim**: `blue.vim` (white on `#000087`, yellow Statements) by day, `darkblue.vim` by night. Its day face is a *dark* palette in the light slot — the one scheme where that's right, because that navy is the whole identity.

Where a scheme publishes its own selection, status-line or caret colour, Word-Smith uses it rather than inventing one — most of the twenty-five carry their real status-line colour, read from each project's own source.

A scheme writes Obsidian's own CSS variables and **touches none of your bar colours** — your palette, presets and share codes stay exactly as you left them. The bar follows along anyway, because `:b1`–`:b4` and `:bs` read the very surfaces a theme rewrites.

### The shelf

The Theme tab is a list you curate, like Obsidian's font list: **drag a card and its position is its priority**, in the tab and the menu alike. `✕` moves a scheme to a *Removed* row below; one click brings it back. Nothing is ever deleted.

At the top is a master switch. Off, nothing is painted and nothing is forgotten — your shelf, options and chosen scheme all wait for it to come back on. Picking a scheme from the bar switches it on; picking **Default** switches it off.

### Options

Each one separate, each off unless it says otherwise:

| | |
|---|---|
| **Colored headings** | H1–H6 take inks from the scheme's own accents, pulled toward the text ink until they actually read |
| **Colored code** | Code blocks sit on the scheme's panel surface, with syntax inks derived the same way |
| **Colored markdown** | Bold takes the scheme's loudest ink; italics, links and tags take its accents |
| **Simplified theme** | One wash — sidebars, header and title bar all take the editor's colour. Off, each surface gets its own step of the ramp |
| **Hide workspace borders** | Empties the dividers and tab outlines, like Minimal's borders-none. Composes with the wash above: either, or both |
| **Color the cursor** | Hands the scheme's accent to Cursor-Smith, if you have it |
| **↳ Color Vim modes** | Each Vim mode gets its own cursor colour, so the caret says what the next keystroke will do |

Selection, hover, the selected file and the focus outline follow the scheme in every case.

### Cursor-Smith

If [Cursor-Smith](https://github.com/sadsnake1/cursor-smith) is installed, a scheme can colour the caret: the flat colour and all four gradient stops, both halves, using **the same ink an H1 takes**.

With the Vim option on, each mode gets its own colour — Insert green, Visual purple, Replace red, Command yellow, Normal the accent — resolved so no two modes land on the same hue. On a monochrome scheme like Quiet they're shades of grey instead: a scheme chosen for having no colour doesn't get a neon cursor.

Only colour is touched — the cursor's shape and effects stay yours. Turn it off and your own cursor colours come back: Word-Smith records what Cursor-Smith looked like before its first write, and hands it back on the way out.

And it works the other way too: put `:bc` in a row and the bar wears whatever colour the caret does, mode by mode.

## Your own order in the file tree

Obsidian sorts the file tree by name, which is why manuscripts end up called
`01 - Opening`, `02 - The Ferry` — numbers you then live with in every link,
tab title and search result.

Switch on **File tree → Custom order in the file tree** and drag
your notes and folders into the order the book is in instead.

- **Drag to the top or bottom edge of a row** to put something above or below
  it; a line shows where it will land. **Drop on the middle of a folder** and
  it still moves the file into that folder, exactly as it always did.
- Reordering works **within a folder**. Dragging between folders is a move,
  which is Obsidian's own gesture and unchanged.
- **New notes go to the end**, alphabetically among themselves, until you
  move them.
- The order is kept in **`ws-structure.md`**, under an `order:` heading per
  folder. You can reorder those lines by hand and the tree will follow.
- **The Manuscript window's tree drags the same way**, and it is the same
  order: move a chapter in either tree and it moves in both.
- **Your manuscript compiles in that order too.** Nothing else to set — the
  order you can see in the file tree is the order the chapters come out in.
  A folder you have never dragged compiles exactly as it always did.
- Switching this off puts **Obsidian's** tree back to its own order. It does
  not throw the order away, and the compile still follows it.
- **Folder icons** — a switch of its own in the same tab — puts a small
  folder beside each folder name in Obsidian's tree, open or shut with the
  folder. It is the same glyph the Manuscript window draws, so a folder is
  one shape wherever you see your vault.


## The Manuscript window

*The book icon in the ribbon, or **Open the Manuscript window** in the command
palette.*

### The Organizer

Your manuscript down the left, described on the right. The tree is the
book’s own order; the folder you light up in it opens as a **Table** or an
**Outline**.

**One tree, on every tab.** Names and folds, and nothing else — the readings
live in the table, where they can be sorted and filtered. History leaves the
same tree beside it, Export grows a tick box on every row, and the file-tree
button at the left of the tabs puts it away entirely when you want the panel
to have the window.

- **The tree is Obsidian’s own.** The same chevrons, the same indent guides,
  the same open and close. Every kind of file appears in it — notes, images,
  canvases, bases, PDFs, audio, video — each with its own glyph and its
  extension in a small tag beside the name, the way the file explorer writes
  it. Notes get no tag: every row would carry the same word. Which kinds
  appear is a filter of its own, and it keeps a chip in the toolbar when you
  have narrowed it — half a vault vanishing is what an invisible filter files
  itself under.
- **Search prunes it.** The box in the sidebar header cuts the tree down by
  name on every tab; empty folders are findable by their own name, the
  search survives switching tabs, and Escape clears it. It hides rows, never
  data.
- **Click a folder** and the right pane is its notes — everything under it,
  flat, however deep the folders go.
- **Drag a row** to put it where it belongs in the book. That is the same
  order Obsidian’s file tree draws and the same order the manuscript
  compiles in — one order, three places. Drag it into another folder and the
  file moves.
- **Set one manuscript root** under Settings → Organizer and the tree, the
  totals and the compile all start there. Leave it empty and it is the whole
  vault. Unlike the folder scopes it replaces, it is on screen every time the
  tab is — there is no invisible narrowing to forget you set.

**The Table** is nine readings, three of them on to begin with — **Target**,
**Words** and **Flag** — with **Grade**, **Last modified**, **Created**,
**Paras**, **Tasks** and **Tags** one press away, because a column costs
every row in your vault.

- **Any property in your vault can be a column.** The columns menu offers the
  keys you already use; pick one and it takes its place beside the readings,
  editable where it sits. Right-click its header to sort by it, filter on it,
  hide it, or take it out again. Drag headers to reorder them.
- **A header click cycles** descending, ascending, back to the book’s order.
  Ties break by book order, so a sort never scrambles two scenes that agree.
- **With no sort or filter up**, rows sit under their folder headings in book
  order. Put a lens on and the groups dissolve into one flat list, each row
  carrying its path faintly — groups pin rows to folders, a sort claims the
  order, and both cannot hold. Clear the lens and the groups come back.
- **The target cell takes a number** and keeps it. It reads either
  `2,145/5,000` or `43%` — Settings → Organizer → **Target column shows**.
- **Click a row to look at it, click again to open it.** Enter opens the row
  under the cursor.

**The Outline** is the same rows with a card under each one, carrying a set
of properties you choose — the same set for every row, because a drawer
showing different properties per file would be a table with no columns. The
synopsis to begin with; click the property’s name to show others.

- **The + on a row adds a property to that note**, suggesting the names your
  vault already uses before offering to make a new one.
- **The editors are typed from Obsidian’s own registry**: text becomes an
  input, a long field a textarea that grows, a list becomes chips with
  autocomplete from the values already in your vault, a checkbox a toggle, a
  date a date box. Frontmatter tags are chips you can remove; `#tags` in the
  body are drawn dimmed and marked *in text*, because they are prose. A
  nested value is shown read-only rather than flattened into something it
  is not.
- **Folder rows add up** what is under them — words summed, grade averaged,
  tasks summed — counting folded rows and undrawn ones alike. A shut folder
  is never an empty one.
- **A card being edited is never redrawn.** Something else touching that note
  while you are typing in it patches around your card rather than through it.

**Expand all and collapse all** is one button beside the properties control,
in both views, and its label says which you are about to get. It opens notes
as well as folders — a note’s own chevron shows its property card — and it
reads the whole subtree, not only what happens to be on screen.

**Select several and act once.** Ctrl-click adds a row, shift takes a run, a
plain click takes one, and Escape clears it. Set a flag or type a target and
it happens to all of them.

**A note on YAML:** property edits are written through Obsidian’s own
frontmatter writer, which is atomic and keeps your other keys — but the
first write to a note may normalize that note’s frontmatter formatting
(quoting style, key spacing). The values are untouched; only the punctuation
around them may settle into Obsidian’s house style.

**The Export tab compiles what the tree says.** Every row grows a tick box
while that tab is up — tick what goes in, untick what does not — and the
format, the destination, Preview and Export are the export window’s own,
because they are literally the same controls. There is no drag on that tab:
the order is already answered.

**Several folders can be one compile.** Ctrl-click Part One and Part Three
and both go out, in the order you picked them, with the line above the
figures naming them so you can check. A folder chosen along with a folder
inside it is taken once, not twice. Each folder remembers its own ticks.

## Goals and the Manuscript board

Give a note or a folder a word count to aim for, and a mark for where it is up to.

**The Manuscript board** — the button at the foot of the report, or the Organizer window — draws your notes as the same tree the export window uses: folders, notes and chevrons. Every row carries a percentage, its word count, its reading grade, a target box and a flag, all inline and all editable where they sit. Open it while a note is in front of you and it starts at that note's own folder; search from the bar above it to go anywhere else, the whole vault included. Click a row to select it, ctrl-click to add another, shift-click for a run — then set a flag or type a target once and it happens to all of them.

**Every window leads to the others.** Report, Manuscript, History and Export each carry one row at the foot — the one you are in is shown and greyed, the other three are a click away.

**Up to five flags, and they are yours.** Settings → Organizer sets how many
states your manuscript has (none through five), and for each one its name, its
shape from ten, and two colours — one for light themes and one for dark.
Renaming a flag never changes what is written in your vault.

**Five flags and unflagged:** *Sketch*, *Draft*, *Revise*, *Blocked* and
*Done*, each with a tiny flag beside the word — a hollow outline for a
sketch, a pennant for a draft, a swallowtail for revise, an alert for
blocked, a banner for done. They are told apart by their SHAPE, not only by
colour, so they read at any size and for anyone, and each carries two
colours: one for light themes and one for dark. Switch on **File tree →
File tree flags** and the same flag appears beside the word count in
Obsidian’s own file explorer. Click a flag to cycle it, or press space on
the row. Folders take one too, so a part can be finished while a stray note
inside it is not. `{flag}` on the bar shows the flag of the note you are in
and changes it with a click — as the flag, the word, or both, chosen under
Powerline → Token formats.

**The keyboard drives it**, with the file explorer's own keys: up and down to move, right and left to open and shut a folder, Enter to open the note, and space to flag the row you are on.

**Drive it from the keyboard:** arrows to move, right and left to open and shut a folder, Enter to open the note, space to flag it.

**The filter icon** holds both lenses: show Everything, With a goal, Marked, Needs revision or Done — and sort by name, words, where it is up to, or reading grade. The search box finds anything in the vault and opens the folders it is hiding in.

**Select several and flag them at once.** Tick the boxes — ticking a folder takes everything inside it — or ctrl/cmd click to add a row, shift to extend, a plain click to take one — then Draft, Revise, Done, Unmark or Clear target applies to all of them. Escape clears the selection.

**Each row shows its reading grade** — years of school needed to read it easily, under 9 being easy going. A folder's is every word in it over every sentence, so a two-line scene doesn't count for as much as a four-thousand-word chapter.

A row does not need a target: marking a scene finished should not mean inventing a word count for it, and a note with no target is on the board precisely so you can give it one.

**Folder goals nest.** A folder goal counts everything inside it, however deep, so a book laid out as folders can carry a target at every level:

```
My Book/                              90,000
My Book/Part One/                     30,000
My Book/Part One/Ch 03/                4,000
My Book/Part One/Ch 03/Scene 2.md        900
```

**Goals follow your files.** Rename a note or move a folder and its target moves with it, along with everything nested inside.

Progress shows as a gauge in the report, and the bar's edges pulse green when you cross a target.

Your targets and flags are kept in `Word-Smith/ws-structure.md`, a plain note you can read and edit:

```
- My Book/Part One/Ch 03.md — 4,000 · revise
- My Book/Part One/Ch 04.md — done
```

Change a number or a word there and Word-Smith picks it up next time Obsidian starts — so a reinstall doesn't lose what you were aiming for, and moving or renaming the file is safe: it is found by what is written inside it. It reads what a person actually types: a hyphen or a colon for the dash, commas in the number, the word in any case, either half on its own.

## Writing report

<img width="570" height="508" alt="image" src="https://github.com/user-attachments/assets/809fc7a8-1d85-4a8e-9ea4-a03e6bff0cfd" />


`{report}` opens a panel with two tabs — this note, and its folder — each showing **words**, **characters**, **syllables**, **sentences**, **paragraphs**, **pages**, **read time** and a **reading grade**. Hover any figure and it explains itself.

The Folder tab has a breadcrumb of every folder above the note. Click one to total that level instead — *how long is this chapter* and *will the book land* are one click apart.

Hit a target and the figure turns and stays turned — the gauge fills and the
status bar marks it. It does not throw a party: the burst it used to throw
landed again every time the tab was opened, which is a celebration of an
event that happened once.

## Writing history

<img width="942" height="697" alt="image" src="https://github.com/user-attachments/assets/07b209d7-972f-406e-bc34-10aecaae5c21" />

<img width="946" height="748" alt="image" src="https://github.com/user-attachments/assets/c510afa2-d1e6-4418-964c-d021d6f5c653" />

Off until you switch it on, under **Settings → Word-Smith → History**.

Once on, Word-Smith counts how much you write each day and draws it as one chart at four zooms — **Day**, **Month**, **Year** and a **Calendar**. Words you added rise from the centre line, words you cut fall below it, so a hard day of editing shows as work instead of a gap. Above the chart: total words, daily average, best day, active days, current streak.

**Search it.** Type a note or folder name and the whole window scopes to it — figures, chart, streak. `ch3scene` finds `My Book/Part One/Ch 03/Scene 2.md`.

Two kindnesses in the numbers: a day counts if you wrote *or* cut, so a day spent cutting won't break your streak; and the average divides by the days you actually wrote, so days off don't drag it down. A missed day does take the streak back to zero — but today, unfinished, is never a missed day.

**Your history is an ordinary note in your vault** — a table, one row per day:

```markdown
| Date | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| 2026-08-01 | 912 | 142 | 770 |
```

A new vault gets it at `Word-Smith/ws-history.md`. Move it, rename it, keep it beside the manuscript — Word-Smith finds it by the markers inside it, and leaves anything you write outside them alone. It saves when you pause and when you close Obsidian. It's the only copy, so back it up with the rest of your vault.

Nothing before the day you switch it on can be reconstructed. A file only knows when it was touched, not how much went into it.

### Never counted

One list of notes and folders is left out of your totals — an outline, a research folder, a scratch file. Word-Smith still works in them; they just don't count.

## Export

Pick a folder — or a single note — and Word-Smith compiles it into one manuscript: **Word (.docx)**, a **web page (.html)** or **Markdown**. It opens from the **Export** tab, the command palette, the menu, or `{export}` on the bar.

**More than one folder can be one book.** In the Manuscript window's Export tab, ctrl-click as many folders as you like — Part One and Part Three, or front matter kept apart from the chapters — and they compile together, in the order you picked them, with a line above the figures naming them so you can check before you send. Pick a folder along with a folder inside it and it is taken once, not twice. Each folder keeps its own ticks, so a folder remembers the same thing whether you compiled it alone or beside another.

The window lists every note in the folder in the order it will compile, grouped under its folders, each with its word count. Tick what goes in, drag a file to move it, drag a folder to move the whole chapter, and the total underneath keeps up. It remembers what you ticked, the order you put things in, and the folder you last exported.

**It opens on the submission standard** — title page, `Surname / Title / page` running header, each file starting a new page, a `#` between scenes, 12pt serif, double spaced, indented paragraphs, with widows and orphans controlled so no paragraph is left with one line stranded on a page of its own.

**Paper** is nine sizes, not two: US Letter, A4, US Legal, Executive, B5, A5, and the trim sizes a novel is actually printed at — trade paperback (6 × 9 in), digest (5.5 × 8.5 in) and mass market (4.25 × 6.87 in). The margin travels with the paper, because an inch of white on a 5.5-inch page is a third of the sheet.

The **title** is the folder's name unless you type one, and your **author** name goes on the title page and into the running header. Every other part is a switch: a table of contents with working links, a running header, footnotes, curly quotes, indented paragraphs, and which folder the file lands in. **Font** is a search box over the fonts actually installed on your machine — type a few letters, and every name is shown in its own face so you can see what you are choosing. Type a font this machine does not have and it is still accepted, with a line saying so, because a manuscript set for somebody else's computer is a real thing to want. **Size** runs 10 to 14pt and **spacing** is single, one and a half, or double. The options sit in two tabs — **Structure** for what the document is made of and in what order, **Typesetting** for how the words are set — with the title and the author above both, always visible. Two of them are questions with three answers, and each reads as a sentence with a line underneath saying what that answer puts on the page — **Each file** *starts a new page / follows a divider / runs straight on*, and **Its heading** *is the file's name / the note's own / none*. Choose the divider and the box for its mark appears directly beneath, where it belongs.

**Indented paragraphs** is on, which is the manuscript convention. Turn it off and the prose is set block style — no first-line indent, a space between paragraphs instead — which is what most non-fiction and every blog post uses.

**Nothing disappears quietly.** Your properties, your `%%` comments, your images and your `==highlights==` stay behind — a manuscript carries none of them — but all four are switches under **Also include**, off until you want them. Highlights come through as the same yellow Word's own pen writes. Properties print verbatim in monospace because they're data; comments print set apart from the prose, so a note to self can never be read as a sentence; images become a visible `[Image: cover.png]` mark. A link's target is dropped and its text kept. Footnotes become endnotes with their markers left in the text. Tables and code blocks come across as they are.

**The file list is a tree**, as deep as your folders go — a book kept as `Book/Part One/Ch 03` shows the part and the chapter, each stepped in from the one above, and folding a part folds everything in it. Ticking one, dragging one or reading its word count all cover everything beneath it. Each folder has a triangle to shut it, and a collapse-all button sits where the file explorer puts one — a hundred scenes read as twelve chapters. Collapsing only hides; a shut folder still exports, and still counts. Files and whole folders drag to reorder, both showing a line where they will land, and a folder that is only partly ticked is drawn as half a box rather than a dash.

**It remembers what you did last time.** A line under the top bar says how many files went out, as what, and into where — with a button that puts the format, the folder and the scope back, so the usual export is one click of setting up and one of sending. It sets up and stops there; writing the file is still your decision.

A band names the two columns, and the icon beside **Mark all** cycles what the right-hand one shows: word counts, flags, or how close each file is to its target.

**Preview** shows the manuscript as pages — the sheet you chose, at its own size and margins — before a single file is written. It opens with the whole sheet in view, margins and all, and zooms: in, out, **Fit**, or **100%** for the size it will actually print at. The page is white, because paper is — there is a **Dark** button for the reading you do before the proofing, and printing always comes out ink on paper. It sits beside **Export** on the top line, next to the format and the folder the file lands in, so everything about the act is in one place. Choose Markdown and it previews as the markdown file instead, since that is what you would be getting.

Your ticks and your ordering are kept in `Word-Smith/ws-structure.md`, so they survive closing the window — and can be reordered in the editor if you'd rather. Rename a note or a folder and the list follows it.

All three work everywhere, phones included. The **web page** is the one to reach for when something refuses a .docx, and it is the same document the preview draws — it carries its own page rules, so printing it from any browser gives a PDF with the pagination, the margins and the running header intact. You can also save one from Word once you have the .docx; either way a browser or a word processor makes a better PDF than a plugin can.

## Word counts elsewhere

Two more places the count can show, both optional, both under **Misc**:

- **File tree counts** — every note and folder in the explorer carries its word count, folders totalling what's inside.
- **Outline counts** — each heading carries the count of its section, which is the fastest way to see which scene ran long.

## Vim

If Obsidian's Vim mode is on, Word-Smith stays out of its way and fills a few gaps:

- **Motions can follow wrapped lines** — `j` and `k` move by what you see, not by what the file calls a line. On a long paragraph that's the difference between one keystroke and twenty.
- **The `:` command line gets a reserved row** under the bar, so opening it doesn't shove the bar or the letterbox upward.
- **`H` `J` `K` `L` work in the sidebars**, if quick cycle is on — the file tree and outline only listen to arrow keys, so the letters are translated.

`{vim}` puts the current mode on the bar; `:vim` / `;vim` recolour a segment or the whole bar as the mode changes; and `:bc` follows the caret itself. With a theme on and Cursor-Smith installed, the caret can carry the mode's colour too — see **Themes**.

## Commands

| | |
|---|---|
| Turn everything on or off | The master switch, also the "WS" ribbon badge |
| Toggle zen mode | |
| Toggle letter box mode | |
| Toggle typewriter mode | |
| Toggle Hemingway mode | |
| Toggle syntax highlighting | |
| Toggle prose checks | |
| Toggle the powerline bar | Slides it away without switching it off |
| Cycle powerline presets | Steps through your saved bars |
| Show the writing report | |
| Show the writing history | |
| Open the Manuscript window | Also the book icon in the ribbon |
| Open the Manuscript window in a pane | The same window as a tab you can dock, or drag out beside the note you are writing |
| Export a manuscript… | Opens the export window |
| Open the menu | Modes, syntax, prose, font and markers in one pop-up |
| Open the menu in a panel | The same menu docked, rather than as a pop-up. Switch the panel on in **Menu** first |
| Quick file explorer | Switch it on in **Misc** first |
| Quick outline | |
| Quick cycle: focus left / right / up / down | Also **Misc**. No default keys — see below |

Obsidian lists these under **Word-Smith**, so the plugin's name is not repeated
in any of them — search the palette for what you want to do rather than for
"Word-Smith".

### Menu

One pop-up for everything you change while writing: **modes**, **syntax**, **prose checks**, **markers**, **font**, **theme**, and a **light/dark toggle** that names what pressing it will do. **Report**, **History** and **Export** sit together at the foot of it. The rows read from the same lists the bar's buttons use, so the menu never drifts from the bar.

**Type to search.** The field at the top searches everything at once, fuzzily — `nord` finds the Nord scheme without your knowing it lives under Theme, `tky` finds Tokyo Night. Each result names the row it came from, so finding a thing also tells you where it lives.

It's **keyboard-only** — nothing in it needs the mouse. Rows expand in place: arrows move, Enter opens and toggles, Escape backs out a level at a time. Changes apply live behind the panel, so there's nothing to confirm.

`h`/`j`/`k`/`l` steer only while Obsidian's Vim mode is on — otherwise they're letters, and the search field is full of schemes spelled with them.

Bind the menu in Obsidian's Hotkeys settings — most people use `Ctrl+M`. It matters most on a narrow window, where the bar has shed its buttons.

### Quick panels

Two optional commands, off until you enable them in **Misc**. Each opens the sidebar on that panel and focuses it, so you can arrow around and press Enter without the mouse. Run it again to close. It finds the panel wherever it lives, so moving the outline to the other sidebar doesn't break it.

### Quick cycle

Move focus between panes with a direction key — **sidebars included**, which Obsidian's own `focus-left` and friends won't do.

Four commands, off until enabled in **Misc**, with no default keys: bind `Alt`+arrows, or `Alt+H/J/K/L` if you think in Vim. `Alt` is free in every Vim mode, so nothing clashes.

It works by geometry, not a fixed order, so it does the right thing in any layout — two sidebars on one side, a vertical split, stacked tab groups. It takes the nearest pane that actually sits in that direction, opens a closed sidebar when there's nothing else that way, and stops at the edges rather than wrapping.

Inside a sidebar, up and down step through its tabs. Landing in the file tree reveals the note you're in. One sub-option, off by default: close a sidebar when you leave it with a direction key.

## Settings map

Seventeen tabs, each a feature with its own master switch:

| | |
|---|---|
| **Menu** | What the pop-up and the docked panel show, and their rows |
| **Powerline** | Rows, presets, share codes, colours, token formats, and the full format reference |
| **Theme** | The scheme shelf, its order, and the options above |
| **Zen** | What to hide, what `Escape` does, caret margin |
| **Letter Box** | Mask height, arrows, separator lines, colours |
| **Typewriter** | Where the line sits, focus area, current-line tint |
| **Hemingway** | Which keys are locked, and what a blocked key does |
| **Syntax** | Which word classes are coloured, and how loudly |
| **Prose Checks** | The seven checks, each on its own switch |
| **Text Options** | Line width, indents, spacing, justification |
| **Markers** | Tabs, spaces, line ends and paragraph marks, drawn |
| **Typography** | Which substitutions run as you type |
| **History** | Tracking, the history file, and deleting it |
| **Export** | Opens the export window, and where the export list lives |
| **Organizer** | The manuscript root, what the Target column shows, date format, and your flags — how many, their names, their shapes and their colours |
| **File tree** | What Word-Smith adds to Obsidian’s own explorer: counts, flags, tasks left, goal percentage, folder icons and file-kind icons |
| **Misc** | Quick panels, quick cycle, tree and outline counts, frontmatter overrides, and wrapped-line Vim motions |

## The notes Word-Smith keeps

Three plain notes, all in `Word-Smith/` on a new vault, all yours to read, edit, move or delete:

| | |
|---|---|
| `ws-history.md` | One row per day — added, deleted, net |
| `ws-structure.md` | Your word targets and flags, which scenes are in an export, and the order you put them in |

Each is found by the markers inside it rather than by its name, so moving or renaming one is safe. If you already have these in your vault's root, they stay exactly where they are — nothing is moved for you.

## Right-to-left

If Obsidian or the note is right-to-left, the text options mirror: indents and padding follow the text direction, justified text sets its last line to the right, the markers point the other way. Word counting handles Hebrew, Arabic and Persian.

Syntax colouring and prose checks are English-only. In a right-to-left script they mark nothing, rather than marking it wrongly.

## Installation

1. Download `main.js`, `styles.css` and `manifest.json`.
2. Put them in `.obsidian/plugins/word-smith/` in your vault.
3. Reload Obsidian, then enable **Word-Smith** under **Settings → Community plugins**.

Copy all three when you update, not just `main.js` — the plugin checks they match and warns you at startup if they don't.

## If something looks wrong

**"Word-Smith says styles.css is out of date."** Exactly what it says: `main.js` was updated and `styles.css` wasn't. A stale stylesheet looks like a broken feature — the rules are simply missing. Copy all three files and reload.

**The bar looks unstyled, or a mask is the wrong colour.** Same cause, same fix.

**A row prints `{sometoken}` instead of a number.** That token doesn't exist. Unknown tokens stay visible on purpose, so a typo shows itself instead of silently rendering blank.

**A segment vanished.** A segment whose tokens all resolve to nothing is dropped, dividers and all — `{vim}` outside Vim mode, `{caps}` with caps lock off. That's the bar refusing to show you an empty coloured stub.

**A theme changed nothing.** Check the master switch at the top of the Theme tab — off, a scheme is remembered but never painted.

**A community theme still shows through.** Word-Smith writes Obsidian's own variables, so anything a theme paints with a hard-coded colour stays its own. Open an issue with the theme's name — the fix is usually one more variable.

**Your history file is the only copy.** It's an ordinary note. Back it up with your vault, and don't delete it expecting the plugin to have another one.

## Privacy

Word-Smith is fully local. No network calls of any kind — no `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `requestUrl`. No telemetry. No third-party dependencies. No filesystem access outside Obsidian's own API.

**What it reads:** your note's text, in memory, while the note is open — for counts, colouring and paragraph detection. The report also reads a folder's notes when you open that tab, to total them. An export reads the notes you ticked, to compile them.

**What it stores:**

`data.json`, in the plugin's own folder — your settings, saved bars and word targets. With history on it also keeps each note's last word count, so a save can be turned into a difference. That cache rebuilds itself and can be deleted freely.

**Your history file**, only if you switch history on: one row per day — the date, and how many words you added, cut and netted. If **Remember which notes** is on, it also records which notes each day's words happened in, so history is searchable; switch it off and those names are dropped. Counts only, either way — never a word of what you wrote.

**Your goals and export list**, which hold note and folder names and numbers, and no prose.

An exported manuscript is the exception, and an obvious one: you asked for your words in a file, so that file has your words in it.

Nothing else, anywhere. Don't take my word for it:

```bash
grep -nE "fetch\(|XMLHttpRequest|WebSocket|requestUrl|sendBeacon" main.js
```

That returns nothing.

## How syntax highlighting works

A hand-written part-of-speech tagger. No API, no model, no bundled NLP library. Each visible line is tagged in three passes.

**Lexicon** — about 800 words that suffix rules can't be trusted with: determiners, pronouns, prepositions, auxiliaries, irregular verbs, and common words that would otherwise be mis-tagged.

**Suffix rules** — anything not in the lexicon is guessed from its ending, in order of reliability:

| Ending | Tag | |
|---|---|---|
| `-ly` | adverb | minus ~90 exceptions — `family`, `reply`, `early` |
| `-ing` `-ed` | verb | |
| `-est` | adjective | |
| `-tion` `-ment` `-ness` `-ity` `-ism` | noun | |
| `-ous` `-ful` `-less` `-ive` `-able` | adjective | |
| `-ize` `-ate` `-ify` | verb | |
| `-s` | noun or verb | depending on whether the singular is a known verb |

**Context** — the pass that fixes what the first two get wrong, using the words either side:

- After a determiner or preposition, a verb becomes a noun — *the **work***, *in **place***.
- An unknown word between a determiner and a noun is an adjective — *her **difficult** book*.
- After `to`, a candidate becomes an infinitive — *to **write***.
- A sentence-initial word followed by a determiner is an imperative — ***Check** the file*.

Results are drawn as CodeMirror decorations, so they render in the editor's own pipeline and never flicker while you type.

Articles and possessive determiners are deliberately left uncoloured — highlighting adjectives shouldn't light up every `the`, `a` and `her`. Pronouns count as nouns, prepositions as conjunctions.

**Accuracy** is roughly nine words in ten on ordinary prose, in my own testing — not benchmarked against a tagged corpus. It's weakest on dialogue-heavy fiction, sentence fragments, and unusual proper nouns. That's why it's a writing aid and not a grammar checker.

**Performance:** only the lines on screen are tagged, and code, frontmatter and maths are skipped. About 2ms per repaint on a 110,000-word note.

## Feedback

Found a bug or have an idea? Open an issue.

## Pricing

Word-Smith is free.

If you'd like to support it, you're welcome to buy me a coffee. Cheers!

<div align="center">
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="200">
  </a>
</div>

## License

MIT
