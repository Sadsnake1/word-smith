# Themes

[← Back to the README](../README.md)

Twenty-five colour schemes for the whole workspace, editor, sidebars and panels. Each one is a matched pair that follows Obsidian's light and dark mode.

<table>
  <tr>
    <td width="50%"><img alt="A colour scheme applied to the whole workspace" src="https://github.com/user-attachments/assets/cbd3aec7-6fdf-4318-8fd8-d9090bbfb815" /></td>
    <td width="50%"><img alt="Another scheme" src="https://github.com/user-attachments/assets/3039b88e-f9fd-498d-8778-0fd207d72c18" /></td>
  </tr>
</table>

## The schemes

Modus (plain, Tinted, Deuteranopia, Tritanopia, value for value from Protesilaos Stavrou's published palette), Quiet, Habamax, Nord, Dracula, Gruvbox, Solarized, Catppuccin, Tokyo Night and Day, Rosé Pine, Monokai, One Dark and Light, Nightfox and Dayfox, Kanagawa, GitHub, Everforest, Vim Blue and Darkblue, Flexoki, Selenized, Iceberg, PaperColor, Ayu.

Where a scheme never had a light half, the light half is an adaptation and the card says so. Vim Blue is both of Vim's stock blue schemes verbatim: `blue.vim` by day, `darkblue.vim` by night.

A scheme writes Obsidian's own CSS variables and touches none of your bar colours. The bar follows along anyway, because `:b1` to `:b4` and `:bs` read the surfaces a theme paints.

## The shelf

The Theme tab is a list you curate. Drag a card and its position is its priority, in the tab and the menu alike. `✕` moves a scheme to a Removed row below. One click brings it back. Nothing is ever deleted.

A master switch at the top. Off, nothing is painted and nothing is forgotten. Picking a scheme from the bar switches it on. Picking **Default** switches it off.

## Options

Each one separate, each off to start.

- **Coloured headings**: H1 to H6 take inks from the scheme's accents.
- **Coloured code**: code blocks sit on the scheme's panel surface.
- **Coloured markdown**: bold takes the loudest ink, italics and links take the accents.
- **Simplified theme**: one wash for sidebars, header and title bar.
- **Hide workspace borders**: empties the dividers and tab outlines.
- **Colour the cursor**: hands the scheme's accent to Cursor-Smith, if you have it.
- **Colour Vim modes**: each mode gets its own caret colour.

## Cursor-Smith

If [Cursor-Smith](https://github.com/sadsnake1/cursor-smith) is installed, a scheme can colour the caret with the same ink an H1 takes. With the Vim option on, each mode gets its own colour: insert green, visual purple, replace red, command yellow, normal the accent. On a monochrome scheme like Quiet they're shades of grey, because a scheme chosen for having no colour shouldn't get a neon cursor.

Only colour is touched. Shape and effects stay yours. Turn it off and your own colours come back.

## A community theme still shows through?

Word-Smith writes Obsidian's own variables, so anything a theme paints with a hard-coded colour stays its own. [Open an issue](https://github.com/Sadsnake1/word-smith/issues) with the theme's name. The fix is usually one more variable.
