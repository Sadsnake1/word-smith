# Writing modes

[← Back to the README](../README.md)

Each of these is its own switch. Turn on one, or all of them.

## Zen

Zen is a list of things to hide, not one big switch: properties, the inline title, Obsidian's status bar, linked mentions, the scroll bar, the ribbon and the powerline bar each have their own toggle — plus **full screen**, **focused file mode** (close every other pane, so only this note is open), and a title bar painted to match the editor. "Zen" ends up meaning whatever you decide it means.

`Escape` leaves it — except in Vim's insert, visual and replace modes, where escape means "back to normal mode" and shouldn't also mean "give me my tabs back". There it costs one extra press.

**Hide the bar, and it comes back on hover.** With the bar hidden by zen, move the pointer to the bottom of the window and it slides up, lingering a moment so you can read it. Set the linger to 0 and it never comes back — that's the off switch.

## Letter box

Two masks in the note's own background colour, so it reads as a narrowing page rather than a black bar laid over one.

- **Drag the line** to resize the mask; **drag the arrows** to change the inset.
- On desktop the top band moves the window, like a title bar, with the window buttons still clickable.
- The arrows are yours to style — five built-in looks or your own characters, any number, any size — with separate colours for dark and light themes.
- Set how much room the caret keeps from whatever sits at the edge of the window.
- It turns itself off in reading view, where there's no caret to frame.

## Typewriter

Keeps the line you're writing in the middle of the screen. It can tint that line, and dim everything outside the paragraph or sentence you're in.

## Hemingway

Locks the keys you'd use to go back and fiddle, so a first draft can only move forward. Each lock is separate — backspace, undo, cut, paste, arrows, clicks — and a blocked key can flash the screen, the bar, a badge, or nothing at all.

## Typography

Turns what you type into the proper characters as you go: curly quotes, ellipses, en and em dashes, arrows, fractions. Never inside code, maths or frontmatter — and undo always gives back exactly what you typed.

## Text options and markers

**Text options** cap the line length, indent paragraphs, adjust spacing and justify text.

**Markers** — a tab of their own — draw the spaces, tabs and line breaks you normally can't see.

## Fonts

Word-Smith reads the font list you keep under **Obsidian → Appearance → Text font**. Add as many as you like there, then switch between them from `{font}` on the bar or from the menu — a serif for drafting, a monospace for editing, a bitmap face for the MS-DOS look. `ws-font:` in a note's frontmatter pins one to that note.

## Where it applies

Limit Word-Smith to certain folders and notes — *only these*, or *everywhere except these*. Leave the list empty and it applies everywhere.

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

## Vim

If Obsidian's Vim mode is on, Word-Smith stays out of its way and fills a few gaps:

- **Motions can follow wrapped lines** — `j` and `k` move by what you see, not by what the file calls a line. On a long paragraph that's the difference between one keystroke and twenty.
- **The `:` command line gets a reserved row** under the bar, so opening it doesn't shove the bar or the letterbox upward. A slider in settings sets how much room — 0 to 30px.
- **`H` `J` `K` `L` work in the sidebars**, if quick cycle is on — the file tree and outline only listen to arrow keys, so the letters are translated.

`{vim}` puts the current mode on the bar; `:vim` / `;vim` recolour a segment or the whole bar as the mode changes; and `:bc` follows the caret itself. With a theme on and Cursor-Smith installed, the caret can carry the mode's colour too — see [Themes](themes.md).

## Right-to-left

If Obsidian or the note is right-to-left, the text options mirror: indents and padding follow the text direction, justified text sets its last line to the right, the markers point the other way. Word counting handles Hebrew, Arabic and Persian.

Syntax colouring and prose checks are English-only. In a right-to-left script they mark nothing, rather than marking it wrongly.
