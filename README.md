# Word-Smith

A distraction-free writing suite for Obsidian: zen mode, typewriter scrolling, letterbox masks, focus dimming, and a retro status bar — each independent, each toggled on its own.

## Showcase

<img width="1482" height="916" alt="Word-Smith in action" src="https://github.com/user-attachments/assets/da3eae4e-53e4-4c72-8e18-86498ddbb37d" />

## Features

Settings are organized into five tabs: **Zen**, **Typewriter**, **Mask**, **Retro Bar**, and **Text Options**.

### Zen mode

Hides UI chrome (tabs, view headers, ribbon, properties, scroll bar, linked mentions, native status bar), collapses both sidebars, and can enter fullscreen. Optional focused-file mode hides every other pane so only the active note remains. Each hidden element has its own toggle, plus adjustable top/bottom editor padding. Press `Escape` to exit (respects vim mode and Excalidraw).

### Typewriter mode

Keeps the cursor line vertically anchored as you type — works with or without zen mode. Configure how many lines of context stay **above** and **below** the cursor (equal values keep it dead-center).

- **Current line highlight** — tint the line the cursor is on, with separate dark/light theme colors and an opacity slider.
- **Focus dimming** — fade everything outside your focus area while you write. Choose **paragraph** or **sentence** granularity (sentence mode dims other sentences even on the same line) and set the dim opacity. Rendered through CodeMirror's own decoration pipeline, so it never flickers while typing.

### Letterbox masks

Top and bottom masks frame the writing area, with adjustable height, horizontal inset, arrow style (solid/outline triangles, standard arrows, chevrons, double chevrons, or custom characters), arrow count and scale, and separator line style/weight. Separate dark/light colors for arrows and lines. Drag the separator line to resize the mask; drag the arrow row to adjust the horizontal inset — both live, right in the editor.

### Retro status bar

A fixed bar at the bottom of the screen, sized to match the open note (not the full window), with **three independently formatted sections** — left, center, and right — each accepting any mix of tokens:

| Token | Shows |
|---|---|
| `{file}` | Current file — full path or filename only (configurable) |
| `{words}` | Word count (selection count if text is selected) |
| `{chars}` | Character count (selection count if text is selected) |
| `{time}` | Current time |
| `{date}` | Current date (customizable format) |
| `{battery}` | Battery level (⚡︎ while charging) |
| `{paragraph}` | Current paragraph / total paragraphs |
| `{goal}` | Writing goal progress (fraction or fill-bar) |
| `{caps}` | `CAPS` while Caps Lock is on, otherwise empty |
| `{nump}` | `NUMP` while Num Lock is on, otherwise empty |
| `{vim}` | Current vim mode: `-- NORMAL --`, `-- INSERT --`, `-- VISUAL --`, `-- REPLACE --`, `-- COMMAND --` |

Click the bar to reset your word-goal baseline. Optional flash animation when the goal is met. Separate dark/light color pickers for the bar background and text. The bar auto-hides Obsidian's native status bar while active, and the vim `:` command line is lifted above it so it stays visible.

### Text options

- **Horizontal padding** — left/right text padding, applied everywhere (not just zen mode).
- **Paragraph indent** — first-line indent, triggered by a blank line or every new line, with adjustable width.
- **Line spacing** — line-height multiplier.
- **Justify text** — full justification in both editing and reading views.
- **Hidden markers** — reveal invisible characters, each with its own toggle: spaces (`·`), tabs (`→`), paragraph breaks (`¶`), and line endings (`↵`). Rendered as editor decorations, glitch-free.

### Word counts

Optional per-file word counts in the file explorer (summed into folders) and per-heading word counts in the outline panel.

## Commands

- **Word-Smith: Toggle Word-Smith on/off** — master switch for the whole plugin (also available as the "WS" ribbon badge)
- **Word-Smith: Zen mode** — toggles zen mode only

## Installation

1. Download `main.js`, `styles.css`, and `manifest.json` (or clone this repo).
2. Create a folder named `word-smith` inside your vault's `.obsidian/plugins/` directory.
3. Copy the files into that folder.
4. Reload Obsidian (or restart it), then enable **Word-Smith** under **Settings → Community plugins**.

## Feedback

Found a bug or have an idea? Open an issue!

## Pricing

Word-Smith is 100% free.

If you'd like to support the project and help me keep the updates coming, you're more than welcome to buy me a coffee. Your support means the world. Cheers!

<div align="center">
  <a href="https://www.buymeacoffee.com/sadsnake1" target="_blank">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" width="200">
  </a>
</div>

## License

MIT
