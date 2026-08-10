# Word-Smith

A distraction-free writing suite for Obsidian. Zen mode, letterbox masks, typewriter scrolling, a write-forward lock, syntax colouring, prose checks, smart typography, a status bar you build yourself, twenty colour schemes for the whole workspace, and a record of how much you write each day.

Everything is separate, and everything can be switched off on its own.

## Showcase
<img width="1920" height="1080" alt="33" src="https://github.com/user-attachments/assets/6a0f3702-b311-4dce-ac49-12df2fbe6acc" />



<img width="1920" height="1080" alt="3" src="https://github.com/user-attachments/assets/41d1249f-ba39-4389-a19c-dff8893b52e0" />

<img width="1920" height="1080" alt="1" src="https://github.com/user-attachments/assets/09866eb7-48b1-4004-bfbd-56a0cf5e6d60" />

## What it does

**Zen** clears everything away but your words — chrome, ribbon, sidebars, the scroll bar, and optionally every other pane and the powerline bar itself. Press `Escape` to come back.

**Letter box** masks the top and bottom of the screen so you only see what you're working on. Drag the line to resize the band, drag the arrows to change the inset. The arrows are yours to shape — five styles or your own characters, one to ten of them, any size. It stands down in reading view, where there is no caret to frame.

**Typewriter** keeps the line you're writing in the middle of the screen. It can tint that line and fade everything outside the paragraph or sentence you're in.

**Hemingway** blocks the keys you'd use to go back and fiddle, so a first draft can only move forward. Every lock is separate — backspace, undo, cut, paste, arrows, clicks. A blocked key can flash the screen, the bar, a badge, or nothing.

**Powerline** replaces Obsidian's status bar with one to three rows you compose yourself. More on this below.

**Syntax** gives nouns, verbs, adjectives, adverbs and conjunctions their own colour, and can mute everything else so one class carries the sentence.

**Prose checks** mark seven patterns worth a second look: filler words, passive voice, doubled words, commonly confused pairs, vague pronouns, sentence rhythm, and repeated uncommon words.

Both of those run entirely on your machine, and both are guesswork — a mark is a nudge, not a verdict.

**Text options** cap the line length, indent paragraphs, adjust line spacing, justify text, and show the spaces and line breaks you normally can't see.

**Typography** turns what you type into the proper characters as you go: curly quotes, ellipses, en and em dashes, arrows, fractions. Never inside code, maths or frontmatter, and undo gives back exactly what you typed.

**Themes** dress the whole workspace — editor, sidebars, panels — in one of twenty colour schemes, each a matched dark/light pair that follows Obsidian's mode. Your bar palette is left alone.

**Goals** and **History** are below.

## Getting started

Only the powerline bar and the menu are on when you install it. Zen, letter box, typewriter, Hemingway, syntax, prose checks, typography and history all start off, so there is nothing to undo while you find your way around.

1. Open **Settings → Word-Smith**. It opens on the **Powerline** tab, which is the one with the most in it.
2. Try one of the two shipped bars from the preset row before writing your own — they are worked examples of the row grammar, and you can pull one apart to see how it is put together.
3. Turn on **Zen** and **Letter box** from the same settings, from the command palette, or from the **Modes** button if your bar carries one.
4. If you want the workspace recoloured, open the **Theme** tab and pick a scheme — or press the theme row in the menu. Everything else stays as you set it.
5. Leave **History** for last. It is off until you switch it on, and it can only count from the day you do.

## Where it applies

Limit Word-Smith to certain folders and notes — *only these*, or *everywhere except these*. Leave the list empty and it applies everywhere.

A single note can override all of it from its frontmatter:

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
ws-goal: 2000         # word target for this note
---
```

Open a canvas, a PDF or an empty tab and the bar stands down and Obsidian's own chrome comes back. It all returns the moment you're on a note again.

## Zen and the letter box

Zen is a list of things to hide, not a single mode: properties, the inline title, Obsidian's own status bar, linked mentions, the scroll bar, the ribbon and the powerline bar, each with its own switch — plus **full screen**, **focused file mode** (hide every other pane so only this note is open), and a title bar painted to match the editor. So "zen" ends up meaning whatever you decide it means.

`Escape` leaves it. In Vim's insert, visual and replace modes it doesn't — a writer mid-sentence pressing escape wants normal mode, not their tabs back — so there it costs one extra keystroke instead of a keybinding.

**Hide the bar, and it comes back on hover.** With the powerline bar hidden by zen, moving the pointer to the bottom of the window slides it up, and it lingers a moment after you move away so you can actually read it. Set that linger to 0 and it never comes back, which is the off switch.

The letter box is two masks in the note's own background colour, so it reads as a narrowing page rather than a black bar laid over one. Both bands are draggable — the line resizes the mask, the arrows set the horizontal inset — and on desktop the top band moves the window itself, the way a title bar would, with the window controls left clickable.

You can cap the ends of the separator lines with an arrow, give the arrows and lines their own colours for dark and light themes, and set how far the caret is kept from whatever occupies the edge of the window — the bar, the letterbox, or the Vim command line.

## The powerline bar

A bar at the bottom sized to match your note, not the window. One to three rows, each with a left, centre and right slot, each taking any mix of tokens.

Two bars ship with it — **Plain** and **Code**. Plain is what you get on a fresh install. Save your own as a preset, and turn any preset into a **share code** you can send to someone else.

### Readouts

| | |
|---|---|
| `{file}` | The note's name, or its folders too |
| `{words}` `{chars}` | How much is in the note, or in your selection |
| `{ln:col}` `{paragraph}` | Where the cursor is; which paragraph of how many |
| `{readtime}` | How long the note takes to read |
| `{backlinks}` | How many other notes link here |
| `{time}` `{clock}` | The time, written out or drawn as a dial |
| `{dd}` `{mm}` `{yyyy}` `{yy}` | Date parts — join them however you like |
| `{battery}` `{caps}` `{num}` | Battery; CAPS and NUM, which show only when they're on |
| `{vim}` | Which Vim mode you're in |
| `{mode}` | A **Modes** button — letter box, typewriter, Hemingway and the rest, switched from the bar |
| `{obsidian}` | A small Obsidian crystal, in whatever colour the segment is |

### Where you are in the note

| | |
|---|---|
| `{#>}` | The whole path: `Chapter 3 › The Ferry › Beat 2` |

It is empty above the first heading, and the leading crumbs drop first when the row runs out of room, so the heading you are actually under survives longest.

Six per-level tokens — `{#}` through `{######}` — were retired in 1.2.7 and are no longer listed anywhere. They still resolve, and they always will: an unrecognised token stays visible as text, so removing them outright would make every saved bar and posted share code holding one start printing `{##}` instead of a heading.

### Buttons

Click these. They're never dropped when the bar runs out of room.

`{syntax}` `{prose}` `{markers}` `{font}` `{theme}` — pickers for word classes, prose checks, hidden characters, your font, and your colour scheme.

`{font}` shows **Aa** and `{markers}` shows **¶** by default; either can be set to show its name instead, under Token formats. The font button renders in the face you have chosen either way.

`{theme}` reads **Theme** and opens the scheme picker. It names the button, not its value — the scheme you're wearing is in the tooltip and lit in the popup — so choosing a long-named scheme never reflows the row. With themes switched off it dims.

`{report}` — the writing report. `{history}` — your writing history.

### Spacers and dividers

`{s}`, `{ss}`, `{sss}`… is a quarter-space each. Give one a colour and it becomes a solid sliver instead.

The punctuation between tokens becomes shape — **the character you type is the shape you get**:

| | |
|---|---|
| `>` `<` | arrow |
| `\|` | straight |
| `)` `(` | curve |
| `~` | wave |
| `/` `\` | the two slanted cuts |

Write `\|` for a real pipe. At the very start or end of a row, `<` and `>` also point the end cap outwards.

Dividers are drawn as SVG, so nothing needs a patched font.

### Colour

One palette of seven, in a dark set and a light one. `:N` paints a background and `;N` paints text — same numbers, same colours.

| | |
|---|---|
| `{words}:N` | Background colour N |
| `{words}:N;M` | And text colour M |
| `{words};vim` `{ln:col}:vim` | Text, or background, follows your vim mode |
| `{file}:b1` … `:b4` | Your theme's page, panel, alt panel and tertiary surfaces |
| `{file};t1` `;t2` `;t3` | Your theme's normal, muted and faint text |

Leave the `;` off and the text picks itself, light or dark, so it stays readable on whatever background you chose.

The bar itself takes the same grammar at the very start of row 1's left slot:

```
:vim {vim} > {file} :: {ln:col}
```

That directive is the only way to give the bar a background and text of its own. There is no picker for it: the bar takes your theme's colours unless a row says otherwise, and a row saying so is visible, sits at the front of the format it applies to, and applies per row.

`{g}` is a fade — a colour stepping into the next, or out into the bar at a group's end. One step per token, so `{g}{g}{g}` is three narrow ones and `{ggg}` is one wide one. Put dividers between them and they keep their shape:

```
{file}:3 > {g}>{g}>{g} > {words}:5
```

A fade is decoration and the bar treats it as such: it is the first thing dropped when the window runs out of room. See **Sizing** below.

### Marks

Marks are drawn in the text's own colour rather than as a colour boundary: `::` is a short thin line, and `>>` `<<` are the same line bent to a point, at the same angle as the arrow dividers.

They are drawn in the row's own foreground and need no segment behind them. Type them doubled: a single `>` or `<` is a divider, and a single `:` starts a colour.

All of this is also in the plugin, under **How to write a row** in the Powerline tab.

### Sizing

Row height, font size, padding and edge rules are all configurable. The top and bottom rules take a style (solid, dashed, dotted or double), a thickness, and a colour each — top and bottom separately, with a dark-theme and a light-theme pair, so a bar sitting against the window edge can carry weight on one edge only. The bar's text can instead match your note's own size, so it follows Ctrl+scroll zoom.

When the window narrows it sheds content by **what a thing is worth**, not by where it sits. The file path shortens to just the note's name first, and a long `{#>}` trail drops its leading crumbs one at a time — the deepest heading is the one that says where you are, so the chapter above it goes first. Then the fades, all at once, since a half-dropped gradient looks worse than none. Then the shaped end points.

Only then does anything with meaning go, and in order: decoration first (rules and slivers), then lone glyphs, then the clock — the time is on your system clock and the wall too, so the bar gives it up before anything about the work — then the rest of the readouts, and last of all the things that say where you are: the file name and the Vim mode. Within each of those, dropping still works from the edges inward. Buttons always survive, and everything comes straight back when the window widens.

Give a `{g}` a colour of its own and it stops being a fade — it is a solid sliver you asked for, and it sheds in the ordinary order with everything else.

It can also be slid away without being switched off — from the command palette, or automatically as part of zen — and brought back by putting the pointer near the bottom of the window.

## Themes

Twenty-five colour schemes for the whole workspace — editor, sidebars, panels — each a **matched pair** that follows Obsidian's own light/dark mode and names the half you're looking at.

**Modus Vivendi / Operandi** (plain, Tinted, Deuteranopia, Tritanopia — Protesilaos Stavrou's, value for value from [his published palette](https://protesilaos.com/emacs/modus-themes-colors)), **Quiet**, **Habamax**, **Nord**, **Dracula**, **Gruvbox**, **Solarized**, **Catppuccin**, **Tokyo Night / Day**, **Rosé Pine**, **Monokai**, **One Dark / Light**, **Nightfox / Dayfox**, **Kanagawa Wave / Lotus**, **GitHub**, **Everforest**, **Vim Blue / Darkblue**.

Where a scheme's authors never shipped a light half, the light half is an adaptation rather than a survived dark palette, and the theme's card says so.

**Vim Blue is both of Vim's stock blue schemes, verbatim**: `blue.vim` (white on `#000087`, yellow Statements) by day, `darkblue.vim` by night. Its day face is a *dark* palette in the light slot — the one scheme on the shelf where that's right, because that navy is the whole identity. It works because everything Word-Smith colours for itself follows the **paper** it's painting on rather than Obsidian's light/dark setting.

Where a scheme publishes its own selection colour, mode-line colour or caret colour, Word-Smith uses that rather than deriving one — fifteen of the twenty-five carry their real status-bar colour, read from each project's source.

A scheme writes Obsidian's own CSS variables and **touches no bar colour** — your palette, your presets and your share codes are exactly as you left them. The bar follows along anyway, because `:b1`–`:b4` already read the surfaces a theme rewrites.

### The shelf

The Theme tab is a list you curate, the same way Obsidian's font list works: **drag a card and its position is its priority**, in the tab and in the menu alike. `✕` removes a scheme to a *Removed* row below; one click brings it back. Nothing is ever deleted.

At the top is a master switch. Off, no scheme is applied and nothing is written anywhere — and nothing is forgotten either: your shelf, your options and your chosen scheme all wait there for it to come back on. Choosing a scheme from the bar switches it on; choosing **Default** switches it off.

### Options

Each one is separate, and each is off unless it says otherwise:

| | |
|---|---|
| **Colored headings** | H1–H6 take inks derived from the scheme's own accents, each pulled toward the text ink until it actually reads |
| **Colored code** | Code blocks sit on the scheme's panel surface, syntax inks derived the same way |
| **Colored markdown** | Bold takes the scheme's loudest ink; italics, links and tags take its accents |
| **Simplified theme** | One wash — sidebars, header row and title bar all take the editor's colour. Off, each surface gets its own step of the scheme's ramp |
| **Hide workspace borders** | Empties the dividers and tab outlines, the way Minimal's own borders-none does. Separate from the wash above, and they compose: either alone, or both |
| **Color the cursor** | Hands the scheme's accent to Cursor-Smith, if you have it |
| **↳ Color Vim modes** | Under the above: each Vim mode gets its own colour, so the cursor says what the next keystroke will do |

Selection, hover, the selected file and the focus outline follow the scheme in every case. Selection uses each scheme's own selection colour, with the text on it inverted to whichever ink actually reads.

### Cursor-Smith

If [Cursor-Smith](https://github.com/sadsnake1/cursor-smith) is installed, the scheme can colour the caret: the flat colour and all four gradient stops, in both halves, taking **the same ink an H1 takes** — Vim Darkblue's yellow, Nord's frost blue, Everforest's green.

With the Vim option on, each mode gets a colour of its own — Insert green, Visual purple, Replace red, Command yellow, Normal the accent — resolved so no two modes in a scheme land on the same hue. On a monochrome scheme like Quiet they're shades of grey instead, told apart by weight: a scheme chosen for having no colour doesn't get a neon cursor.

The cursor's *shape* and effects stay yours; only colour is touched. Turning the option off — or choosing **Default**, or the master switch — gives your own cursor colours back: Word-Smith records what Cursor-Smith looked like before its first write and hands it back on the way out. If the caret was coloured by a version that predates that record, it returns to Cursor-Smith's own defaults instead.

## Goals

Give a note or a folder a word count to aim for.

**Folder goals nest.** A folder goal counts everything inside it, however deep — so a book laid out as folders inside folders can carry a target at every level:

```
My Book/                              90,000
My Book/Part One/                     30,000
My Book/Part One/Ch 03/                4,000
My Book/Part One/Ch 03/Scene 2.md        900
```

**Goals follow your files.** Rename a note or drag a folder somewhere else and its target goes along, with everything nested inside it.

Progress shows as a gauge in the report, and the bar's edges pulse green when you cross a target.

## Writing report

`{report}` opens a panel with two tabs — this note, and its folder — each showing **words**, **characters**, **syllables**, **sentences**, **paragraphs**, **pages**, **read time** and a **reading grade**. Every figure explains itself when you hover it.

The Folder tab has a breadcrumb of every folder above the note, up to the vault root. Click any of them to total that level instead, so *how long is this chapter* and *will the book land* are one click apart.

Hit a target and it throws fireworks at you.

## Writing history

Off until you switch it on, under **Settings → Word-Smith → History**.

Once it's on, Word-Smith counts how much you write each day and draws it as one chart at three zooms — **Day**, **Month**, **Year**. Words you added rise from the centre line and words you cut fall from it, so a hard day of editing shows as work rather than a gap. Above it: total words, your daily average, your best day, and your current streak.

**Search it.** Type a note or folder name and the whole window scopes to it — figures, chart, streak. `ch3scene` will find `My Book/Part One/Ch 03/Scene 2.md`.

Two things the numbers mean: a day counts if you wrote **or** cut, so a day spent cutting won't break your streak; and the daily average divides by the days you actually wrote, so days off don't drag it down.

**Your history is an ordinary note in your vault** — a table, one row per day:

```markdown
| Date | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| 2026-08-01 | 912 | 142 | 770 |
```

Move it, rename it, keep it beside the manuscript — Word-Smith finds it again by the markers inside it. Anything you write outside those markers is left alone. It saves itself when you pause and when you close Obsidian. It's the only copy, so hang on to it.

Nothing before the day you switch it on can be worked out. A file only knows when it was touched, not how much went into it.

### Never counted

Goals and History share one list of notes and folders to leave out of your totals — an outline, a research folder, a scratch file. Word-Smith still works in them normally; they just don't count.

## Word counts elsewhere

Two more places the count can show, both optional and both under **Misc**:

- **File tree counts** — every note and folder in the file explorer carries its word count, folders totalling what's inside them.
- **Outline counts** — each heading in the outline pane carries the count of the section under it, which is the fastest way to see which scene ran long.

## Vim

If Obsidian's Vim mode is on, Word-Smith stays out of its way and fills two gaps:

- **Motions follow wrapped lines**, optionally — `j` and `k` move by what you see rather than by what the file thinks a line is, which is the difference between a long paragraph being one keystroke tall or twenty.
- **The `:` command line gets a reserved row** under the bar, sized to what it actually measures, so opening it doesn't shove the bar or the letterbox upward. The masks stand down over it rather than covering it.

- **`H` `J` `K` `L` work in the sidebars**, if quick cycle is on. Obsidian's file tree and outline navigate by arrow keys and nothing else; this translates the letters, so everything the arrows do still happens.

`{vim}` puts the current mode on the bar, and `:vim` / `;vim` recolour a segment or the whole bar as the mode changes. With a theme on and Cursor-Smith installed, the caret can carry the mode's colour too — see **Themes**.

In the Word-Smith menu, `h`/`j`/`k`/`l` navigate only while Vim mode is on.

## Commands

| | |
|---|---|
| Toggle Word-Smith on/off | The master switch, also the "WS" ribbon badge |
| Toggle zen mode | |
| Toggle letter box mode | |
| Toggle typewriter mode | |
| Toggle Hemingway mode | |
| Toggle syntax highlighting | |
| Toggle prose checks | |
| Toggle the powerline bar on/off | Slides it away without switching it off |
| Cycle powerline presets | Steps through your saved bars |
| Show the writing report | |
| Show the writing history | |
| Menu | Modes, syntax, prose, font and markers in one pop-up |
| Quick file explorer | Switch it on in **Misc** first |
| Quick outline | |
| Quick cycle: focus left / right / up / down | Four commands, also **Misc**. No default keys — see below |

Everything else is in the settings tabs, or on the bar itself.

### Menu

One pop-up for everything you change while writing: **modes**, **syntax**, **prose checks**, **markers**, **font**, **theme**, and a **light/dark toggle** that names what pressing it does — *Light Mode* while you're dark, *Dark Mode* the moment you aren't. The rows read from the same lists the bar's buttons use, so there's one place these are defined and the menu never drifts from the bar.

**Type to search.** The field at the top searches rows and their contents at once, fuzzily — `nord` finds the Nord scheme without your knowing it lives under Theme, `tky` finds Tokyo Night, `theme kan` finds Kanagawa. Each result names the row it came from, so finding something also tells you where it lives. Escape clears the query; Escape again closes the menu.

It's **keyboard-only** — nothing in it needs the mouse. Rows expand in place rather than opening a second popup: the arrows move, Enter opens a row and toggles what's inside it, and Escape backs out one level at a time. Changes apply live behind the panel, so there's nothing to confirm.

**`h`/`j`/`k`/`l` steer only when Obsidian's Vim mode is on** — otherwise they're letters, because the search field is full of schemes spelled with them. Even with Vim on they type while the search field has focus, and `Ctrl+J`/`Ctrl+K` move without leaving it.

Below a divider sit the **writing report** and **history**, which open rather than set.

Bind it in Obsidian's Hotkeys settings — most people use `Ctrl+M`.

It matters most on a narrow window. The bar sheds its buttons when there isn't room for them, and without the menu those pickers were reachable only at widths that happened to fit.

### Quick panels

Two optional commands, off until you switch them on in **Misc**. Each opens the sidebar on that panel and focuses it, so you can arrow around and press Enter without reaching for the mouse. Run the command again to close it.

It finds the panel wherever it lives, so dragging the outline to the left sidebar doesn't break it. Give each one a hotkey in Obsidian's Hotkeys settings.

### Quick cycle

Move focus between panes with a direction key — **sidebars included**, which Obsidian's own `focus-left` and friends won't do.

Four commands, off until you switch them on in **Misc**, with no default keys: bind them to `Alt`+arrows, or `Alt+H/J/K/L` if you think in Vim. `Alt` is free in every Vim mode, so neither clashes.

It works by geometry rather than a fixed order, so it does the right thing whatever your layout — two sidebars docked the same side, a vertical split, stacked tab groups. It takes the nearest panel that actually sits in that direction, opens a closed sidebar when there's nothing else that way, and stops at the edges rather than wrapping around.

Inside a sidebar, up and down step through its tabs. Landing in the file tree reveals the note you're in. A sidebar you've visited before reopens on the tab you left it on.

With Obsidian's Vim mode on, **`H` `J` `K` `L` walk the file tree and the outline** exactly as the arrow keys do — the letters are translated, so folders, collapsing and multi-select all behave as they always did. Text fields are left alone, so typing in the search box still types.

There's one sub-option: **close a sidebar when you leave it**. Off by default. It fires only when you move out with a direction key, never when you pick something.

## Settings map

Fourteen tabs, each one a feature with its own master switch:

| | |
|---|---|
| **Powerline** | Rows, presets, share codes, powerline and rule colours, token formats, and the full format reference |
| **Theme** | The scheme shelf, its order, and the options above |
| **Zen** | What to hide, what to do with `Escape`, caret margin |
| **Letter Box** | Mask height, arrows, separator lines, colours |
| **Typewriter** | Where the line sits, focus area, current-line tint |
| **Hemingway** | Which keys are locked, and what a blocked key does |
| **Syntax** | Which word classes are coloured, and how loudly |
| **Prose Checks** | The seven checks, each on its own |
| **Text Options** | Line width, indents, spacing, justification, hidden characters |
| **Typography** | Which substitutions run as you type |
| **Goals** | Targets per note and folder, and what to leave out |
| **History** | Tracking, the history file, and deleting it |
| **Misc** | The menu, quick panels, quick cycle, word counts in the file tree and outline, frontmatter overrides |
| **Vim** | Wrapped-line motions |

## Right-to-left

If Obsidian or the note is right-to-left, the text options mirror: indents and padding follow the text direction, justified text sets its last line to the right, and the markers point the other way. Word counting already handles Hebrew, Arabic and Persian.

Syntax colouring and prose checks are English-only. In a right-to-left script they mark nothing, rather than marking it wrongly.

## Installation

1. Download `main.js`, `styles.css` and `manifest.json`.
2. Put them in `.obsidian/plugins/word-smith/` in your vault.
3. Reload Obsidian, then enable **Word-Smith** under **Settings → Community plugins**.

Copy all three when you update, not just `main.js` — the plugin checks they match and warns you at startup if they don't.

## If something looks wrong

**"Word-Smith says styles.css is out of date."** Exactly what it says: `main.js` was updated and `styles.css` wasn't. A stale stylesheet is indistinguishable from a broken feature — the rules are simply absent, everything else works, and the fix you installed appears to have done nothing. Copy all three files and reload.

**The bar looks unstyled, or a mask is the wrong colour.** Same cause, same fix.

**A row prints `{sometoken}` instead of a number.** That token doesn't exist. Unknown tokens are left visible on purpose, so a typo shows itself instead of silently rendering as blank.

**A segment vanished.** A segment whose tokens all resolve to nothing is dropped along with its dividers — `{vim}` outside Vim mode, `{caps}` with caps lock off. That is the bar refusing to show you a coloured stub, not a bug.

**A theme changed nothing.** Check the master switch at the top of the Theme tab — with it off, a scheme is remembered but never painted. Picking a scheme from the menu switches it back on.

**A community theme still shows through.** Word-Smith writes Obsidian's own variables, so anything a theme paints with a hard-coded colour instead of a variable stays its own. Open an issue with the theme's name — the fix is usually one more variable.

**Your history file is the only copy.** It's an ordinary note in your vault. Back it up with the rest of your vault, and don't delete it expecting the plugin to have another one.

## Privacy

Word-Smith is fully local. No network calls of any kind — no `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `requestUrl`. No telemetry. No third-party dependencies. No filesystem access outside Obsidian's own API.

**What it reads:** your note's text, in memory, while the note is open — for word counts, colouring and paragraph detection. It's read from the editor and discarded. The report also reads the notes in a folder when you open that tab, to total them.

**What it stores:**

`data.json`, in the plugin's own folder — your settings, your saved bars, your word targets. With the history on it also keeps each note's last word count, so a save can be turned into a difference. That cache rebuilds itself and can be deleted freely.

**Your history file**, only if you switch the history on. It's a note in your vault holding one row per day: the date, and how many words you added, cut and netted. If **Remember which notes** is on it also records which note each day's words happened in, so you can search your history — that's the one part of the record that isn't purely a number. Switch it off and those names are dropped. Counts only, either way: never a word of what you wrote.

Nothing else, anywhere.

Don't take my word for it:

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
