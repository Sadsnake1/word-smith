# Themes

[← Back to the README](../README.md)

Twenty-five colour schemes for the whole workspace — editor, sidebars, panels — each a **matched pair** that follows Obsidian's light/dark mode and names the half you're looking at.

<table>
  <tr>
    <td width="50%"><img alt="A colour scheme applied to the whole workspace" src="https://github.com/user-attachments/assets/cbd3aec7-6fdf-4318-8fd8-d9090bbfb815" /></td>
    <td width="50%"><img alt="Another scheme" src="https://github.com/user-attachments/assets/3039b88e-f9fd-498d-8778-0fd207d72c18" /></td>
  </tr>
</table>

## The schemes

**Modus Vivendi / Operandi** (plain, Tinted, Deuteranopia, Tritanopia — Protesilaos Stavrou's, value for value from [his published palette](https://protesilaos.com/emacs/modus-themes-colors)), **Quiet**, **Habamax**, **Nord**, **Dracula**, **Gruvbox**, **Solarized**, **Catppuccin**, **Tokyo Night / Day**, **Rosé Pine**, **Monokai**, **One Dark / Light**, **Nightfox / Dayfox**, **Kanagawa Wave / Lotus**, **GitHub**, **Everforest**, **Vim Blue / Darkblue**, **Flexoki**, **Selenized**, **Iceberg**, **PaperColor** and **Ayu**.

Where a scheme's authors never made a light half, the light half is an adaptation rather than a survived dark palette — and the theme's card says so.

**Vim Blue is both of Vim's stock blue schemes, verbatim**: `blue.vim` (white on `#000087`, yellow Statements) by day, `darkblue.vim` by night. Its day face is a *dark* palette in the light slot — the one scheme where that's right, because that navy is the whole identity.

Where a scheme publishes its own selection, status-line or caret colour, Word-Smith uses it rather than inventing one.

A scheme writes Obsidian's own CSS variables and **touches none of your bar colours** — your palette, presets and share codes stay exactly as you left them. The bar follows along anyway, because `:b1`–`:b4` and `:bs` read the very surfaces a theme rewrites.

## The shelf

The Theme tab is a list you curate, like Obsidian's font list: **drag a card and its position is its priority**, in the tab and the menu alike. `✕` moves a scheme to a *Removed* row below; one click brings it back. Nothing is ever deleted.

At the top is a master switch. Off, nothing is painted and nothing is forgotten — your shelf, options and chosen scheme all wait for it to come back on. Picking a scheme from the bar switches it on; picking **Default** switches it off.

## Options

Each one separate, each off unless it says otherwise. The first four need a scheme to derive their inks from, so under **Default** they're dimmed rather than pretending to work.

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

## Cursor-Smith

If [Cursor-Smith](https://github.com/sadsnake1/cursor-smith) is installed, a scheme can colour the caret: the flat colour and all four gradient stops, both halves, using **the same ink an H1 takes**.

With the Vim option on, each mode gets its own colour — Insert green, Visual purple, Replace red, Command yellow, Normal the accent — resolved so no two modes land on the same hue. On a monochrome scheme like Quiet they're shades of grey instead: a scheme chosen for having no colour doesn't get a neon cursor.

Only colour is touched — the cursor's shape and effects stay yours. Turn it off and your own cursor colours come back: Word-Smith records what Cursor-Smith looked like before its first write, and hands it back on the way out.

And it works the other way too: put `:bc` in a row and the bar wears whatever colour the caret does, mode by mode.

## A community theme still shows through?

Word-Smith writes Obsidian's own variables, so anything a theme paints with a hard-coded colour stays its own. [Open an issue](https://github.com/Sadsnake1/word-smith/issues) with the theme's name — the fix is usually one more variable.
