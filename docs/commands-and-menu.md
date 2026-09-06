# Commands, the menu and the settings map

[← Back to the README](../README.md)

## Commands

Obsidian lists these under **Word-Smith**, so search the palette for what you want to do rather than for "Word-Smith".

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
| Open the Organiser | Also the book icon in the ribbon |
| Open the Organiser in a pane | The same window as a tab you can dock beside the note you're writing |
| Open the Organiser in its own window | Pop it out onto a second screen |
| Export a manuscript… | Opens the export window |
| Open the menu | Modes, syntax, prose, font and markers in one pop-up |
| Open the menu in a panel | The same menu docked. Switch the panel on in **Menu** first |
| Quick file explorer | Switch it on in **Misc** first |
| Quick outline | |
| Quick cycle: focus left / right / up / down | Also **Misc**. No default keys — see below |

## The menu

<img width="1920" alt="The Word-Smith menu" src="https://github.com/user-attachments/assets/c851d326-50d3-46da-afa9-51f63204e275" />

One pop-up for everything you change while writing: **modes**, **syntax**, **prose checks**, **markers**, **font**, **theme**, and a **light/dark toggle** that names what pressing it will do. **Report**, **History** and **Export** sit together at the foot of it. The rows read from the same lists the bar's buttons use, so the menu never drifts from the bar.

**Any command can live in it.** Add rows for any Obsidian command — other plugins' commands included — and lay them out in a table of your own. Bind the menu to one key and it becomes a which-key for your whole setup.

**Type to search.** The field at the top searches everything at once, fuzzily — `nord` finds the Nord scheme without your knowing it lives under Theme, `tky` finds Tokyo Night.

It's **keyboard-only** — nothing in it needs the mouse. Rows expand in place: arrows move, Enter opens and toggles, Escape backs out a level at a time. Changes apply live behind the panel, so there's nothing to confirm. `h`/`j`/`k`/`l` steer only while Obsidian's Vim mode is on.

Bind the menu in Obsidian's Hotkeys settings — most people use `Ctrl+M`. It matters most on a narrow window, where the bar has shed its buttons.

## Quick panels

Two optional commands, off until you enable them in **Misc**. Each opens the sidebar on that panel and focuses it, so you can arrow around and press Enter without the mouse. Run it again to close. It finds the panel wherever it lives, so moving the outline to the other sidebar doesn't break it.

## Quick cycle

Move focus between panes with a direction key — **sidebars included**, which Obsidian's own `focus-left` and friends won't do.

Four commands, off until enabled in **Misc**, with no default keys: bind `Alt`+arrows, or `Alt+H/J/K/L` if you think in Vim. `Alt` is free in every Vim mode, so nothing clashes.

It works by geometry, not a fixed order, so it does the right thing in any layout — two sidebars on one side, a vertical split, stacked tab groups. It takes the nearest pane that actually sits in that direction, opens a closed sidebar when there's nothing else that way, and stops at the edges rather than wrapping. Inside a sidebar, up and down step through its tabs. One sub-option, off by default: close a sidebar when you leave it with a direction key.

## Settings map

Seventeen tabs, each a feature with its own master switch:

| | |
|---|---|
| **Menu** | What the pop-up and the docked panel show, and their rows |
| **Powerline** | Rows, presets, share codes, colours, token formats, and the full format reference |
| **Theme** | The scheme shelf, its order, and the options |
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
| **Export** | Opens the export window |
| **Organiser** | What the Target column shows, date format, and your flags |
| **File tree** | What Word-Smith adds to Obsidian's own explorer: counts, flags, tasks left, goal percentage, folder icons and file-kind icons; custom order |
| **Misc** | Quick panels, quick cycle, outline counts, frontmatter overrides, wrapped-line Vim motions, and where the three notes live |
