# The powerline bar

[← Back to the README](../README.md)

A status bar you write yourself. One to three rows, each with a left, centre and right slot. You type a row as text, and the punctuation between tokens becomes shape and colour.

<img width="1858" alt="A minimal powerline bar" src="https://github.com/user-attachments/assets/cadd2b38-a1f9-45f6-bad8-5a81ec4292a7" />
<img width="1862" alt="A full powerline bar with fades and dividers" src="https://github.com/user-attachments/assets/5e08b3eb-748d-482c-99e3-c418bbe07d39" />

Two bars ship with it, **Plain** and **Code**. Save your own as presets, and turn any preset into a share code you can send to someone. The full reference is also in the plugin, under **How to write a row** on the Powerline tab.

## Readouts

| | |
|---|---|
| `{file}` | The note's name. Click it to reveal the note in the explorer |
| `{words}` `{chars}` | The note, or your selection |
| `{ln:col}` `{paragraph}` | Where the cursor is |
| `{readtime}` | How long the note takes to read |
| `{backlinks}` | How many notes link here. Click to open the backlinks pane |
| `{time}` `{clock}` | The time, written or drawn as a dial |
| `{dd}` `{mm}` `{yyyy}` `{yy}` | Date parts, joined however you like |
| `{battery}` `{caps}` `{num}` | Battery; caps and num lock, only when on |
| `{vim}` | Which Vim mode you're in |
| `{mode}` | A Modes button: letter box, typewriter, Hemingway, right on the bar |
| `{flag}` | The flag of the note you're in. Click to change it |
| `{obsidian}` | A small Obsidian crystal |
| `{#>}` | The heading path: `Chapter 3 › The Ferry › Beat 2` |

## Buttons

`{syntax}` `{prose}` `{markers}` `{font}` `{theme}` are pickers. `{report}`, `{history}` and `{export}` open those panes. Buttons are never dropped, however narrow the window gets.

## Dividers

The character you type is the shape you get.

| | |
|---|---|
| `>` `<` | arrow |
| `\|` | straight |
| `)` `(` | curve |
| `~` | wave |
| `/` `\` | slanted cuts |

`{s}` is a quarter-space. `::` is a short thin line, `>>` and `<<` are the same line bent to a point. Dividers are drawn as SVG, so no patched font needed.

## Colour

Seven colours, a dark set and a light set. `:N` paints the background, `;N` paints the text. A token with no colour lies flush with the bar.

| | |
|---|---|
| `{words}:3` | Background colour 3 |
| `{words}:3;1` | And text colour 1 |
| `{words};vim` | Text follows your Vim mode |
| `{file}:b1` to `:b4` | Your theme's own surfaces |
| `{file}:bs` | The status line's own colour |
| `{file}:bc` | The caret's colour, live |
| `{file};t1` `;t2` `;t3` | Your theme's normal, muted and faint text |

Leave the `;` off and the text picks itself, light or dark, so it stays readable.

`{g}` is a fade, one colour stepping into the next. `{g}{g}{g}` is three narrow steps, `{ggg}` one wide one. Fades are the first thing dropped when the window gets narrow.

Put a colour at the very start of row 1 and the whole bar takes it:

```
:vim {vim} > {file} :: {ln:col}
```

## Sizing

Row height, font size, padding and the top and bottom rules are yours to set, in a dark and a light pair. The bar's text can follow your note's zoom. When the window narrows, the bar drops decoration first and the file name last, and everything comes back when it widens.
