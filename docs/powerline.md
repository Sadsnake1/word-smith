# The powerline bar

[← Back to the README](../README.md)

A bar at the bottom, sized to match your note rather than the window. One to three rows, each with a left, centre and right slot, each taking any mix of tokens. You write a row as text, and the punctuation between tokens becomes shape and colour.

<img width="1858" alt="A minimal powerline bar" src="https://github.com/user-attachments/assets/cadd2b38-a1f9-45f6-bad8-5a81ec4292a7" />
<img width="1862" alt="A full powerline bar with fades and dividers" src="https://github.com/user-attachments/assets/5e08b3eb-748d-482c-99e3-c418bbe07d39" />

Two bars ship with it, **Plain** and **Code**. Save your own as presets, and turn any preset into a **share code** you can send to someone else. Everything here is also in the plugin, under **How to write a row** in the Powerline tab.

## Readouts

| | |
|---|---|
| `{file}` | The note's name, or its folders too. **Click it** to show the note in the file explorer |
| `{words}` `{chars}` | How much is in the note, or in your selection |
| `{ln:col}` `{paragraph}` | Where the cursor is; which paragraph of how many |
| `{readtime}` | How long the note takes to read |
| `{backlinks}` | How many other notes link here, `0` when nothing does. **Click it** to open the backlinks pane |
| `{time}` `{clock}` | The time, written out or drawn as a dial |
| `{dd}` `{mm}` `{yyyy}` `{yy}` | Date parts. Join them however you like |
| `{battery}` `{caps}` `{num}` | Battery; CAPS and NUM, which only show when they're on |
| `{vim}` | Which Vim mode you're in |
| `{mode}` | A **Modes** button: letter box, typewriter, Hemingway and the rest, right on the bar |
| `{flag}` | The flag of the note you're in; click to change it |
| `{obsidian}` | A small Obsidian crystal, in the segment's own colour |
| `{#>}` | The whole heading path: `Chapter 3 › The Ferry › Beat 2`. Empty above the first heading; when the row runs out of room the leading crumbs drop first |

## Buttons

Click these. They're never dropped, however narrow the window gets.

`{syntax}` `{prose}` `{markers}` `{font}` `{theme}` are pickers for word classes, prose checks, hidden characters, your font, and your colour scheme.

`{font}` shows **Aa** and `{markers}` shows **¶** by default; either can show its name instead, under Token formats. The font button renders in the face you chose.

`{theme}` reads **Theme** and opens the scheme picker. The name stays fixed, with your current scheme in the tooltip and lit up in the popup, so picking a long-named scheme never reflows the row.

`{report}` opens the writing report. `{history}` opens your writing history. `{export}` opens the export window.

## Spacers and dividers

`{s}`, `{ss}`, `{sss}`… is a quarter-space each. Give one a colour and it becomes a solid sliver.

The punctuation between tokens becomes shape. **The character you type is the shape you get**:

| | |
|---|---|
| `>` `<` | arrow |
| `\|` | straight |
| `)` `(` | curve |
| `~` | wave |
| `/` `\` | the two slanted cuts |

Write `\|` for a real pipe. At the very start or end of a row, `<` and `>` point the end cap outwards. Dividers are drawn as SVG, so you don't need a patched font.

## Colour

One palette of seven, in a dark set and a light one. `:N` paints a background, `;N` paints text. Same numbers, same colours.

A token with **no colour lies flush with the bar**, like an unhighlighted stretch of a Vim status line. Colour is something you ask for, one segment at a time:

| | |
|---|---|
| `{words}:N` | Background colour N |
| `{words}:N;M` | And text colour M |
| `{words};vim` `{ln:col}:vim` | Text, or background, follows your Vim mode |
| `{file}:b1` … `:b4` | Your theme's page, panel, alt panel and tertiary surfaces |
| `{file}:bs` | The status line's own colour, the bar's default surface, which a scheme may name |
| `{file}:bc` `;bc` | The cursor's colour, live, as background or text |
| `{file};t1` `;t2` `;t3` | Your theme's normal, muted and faint text |

Leave the `;` off and the text picks itself, light or dark, so it stays readable on whatever background you chose.

The bar itself takes the same grammar at the very start of row 1's left slot:

```
:vim {vim} > {file} :: {ln:col}
```

There's no picker for the bar's colour, on purpose: write nothing and it sits on your theme's status-line colour (`:bs`) with matching text; write a directive and your choice is right there at the front of the row, where you can see it.

### Fades

`{g}` is a fade: one colour stepping into the next, or out into the bar at a group's end. One step per token, so `{g}{g}{g}` is three narrow steps and `{ggg}` is one wide one. Put dividers between them and they keep their shape:

```
{file}:3 > {g}>{g}>{g} > {words}:5
```

A fade is decoration, and the bar treats it that way: it's the first thing dropped when the window runs out of room.

### Marks

`::` is a short thin line, and `>>` `<<` are the same line bent to a point. They're drawn in the text's own colour, not as a colour boundary, so they need no segment behind them. Type them doubled. A single `>` is a divider, and a single `:` starts a colour.

## Sizing

Row height, font size, padding and edge rules are all yours to set. The top and bottom rules each take a style, a thickness and a colour, separately, with a dark and a light pair. The bar's text can also match your note's own size, so it follows Ctrl+scroll zoom. A slider sets how far the bar sits from the bottom of the window.

When the window narrows, the bar sheds content by **what a thing is worth**, not where it sits. The file path shortens to just the name; a long heading trail drops its leading crumbs. Then the fades, then the shaped end points, then decoration, then the clock, then the other readouts, and last the things that say where you are: the file name and the Vim mode. Buttons always survive, and everything comes straight back when the window widens.
