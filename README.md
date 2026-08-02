# Word-Smith

A distraction-free writing suite for Obsidian: zen mode, letterbox masks, typewriter scrolling, a write-forward lock, syntax colouring, writing checks, smart typography, and a configurable status bar — each independent, each toggled on its own.

## Showcase

<img width="1920" height="1080" alt="1" src="https://github.com/user-attachments/assets/09866eb7-48b1-4004-bfbd-56a0cf5e6d60" />

<img width="1920" height="1080" alt="3" src="https://github.com/user-attachments/assets/41d1249f-ba39-4389-a19c-dff8893b52e0" />

<img width="1920" height="1080" alt="33" src="https://github.com/user-attachments/assets/6a0f3702-b311-4dce-ac49-12df2fbe6acc" />


## Features

Settings are organized into seven tabs: **Retro Bar**, **Zen**, **Typewriter**, **Hemingway**, **Syntax**, **Text Options**, and **Misc**.

### Where it applies

Word-Smith can be limited to specific folders and notes, in either direction — *only these* or *everywhere except these*. Leave the list empty and it applies to every note.

A single note can override all of it from its frontmatter, which takes precedence over the list:

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

There's also an optional **restore cursor position**, which reopens a note where you left the caret — including the scroll position, and in whichever pane you open it.

Everything is note-only by design: open a canvas, a base, a PDF or an empty tab and the bar stands down, Obsidian's own chrome comes back, and it all swaps again the moment you return to a note.

### Retro bar

A fixed bar at the bottom of the screen, sized to match the open note (not the full window). **One to three stacked rows**, each with independently formatted **left**, **center**, and **right** slots, each accepting any mix of tokens.

New vaults start on the **Mash** bar. Five more ship beside it — **Plain**, **DOS**, **Zero**, **Echo**, **Slant** — and you can save, share and load your own (see *Presets*, below).

#### Readouts

| Token | Shows |
|---|---|
| `{file}` | Current file — full path or filename only (configurable) |
| `{words}` | Word count (selection count if text is selected) |
| `{chars}` | Character count (selection count if text is selected) |
| `{ln:col}` | Caret position |
| `{paragraph}` | Current paragraph / total paragraphs |
| `{readtime}` | Estimated reading time, at a configurable words-per-minute |
| `{mode}` | Active modes as badges: **T** typewriter, **H** Hemingway, **Z** zen |
| `{time}` | Current time as text |
| `{clock}` | The same time, drawn as a dial |
| `{dd}` `{mm}` `{yyyy}` `{yy}` | Date parts — compose them with any separator you like |
| `{battery}` | Battery level (⚡︎ while charging) |
| `{caps}` | `CAPS LOCK` on two lines while it's on |
| `{num}` | `NUM LOCK` on two lines while it's on |
| `{vim}` | Current vim mode: `-- NORMAL --`, `-- INSERT --`, `-- VISUAL --`, `-- REPLACE --`, and `-- COMMAND --` wherever keystrokes drive an interface rather than the text — vim's `:` line, the command palette, search, the quick switcher |
| `{obsidian}` | A tiny Obsidian crystal, drawn in whatever ink its segment is using |

#### Buttons

These do something when clicked, and they're never dropped when the bar runs out of room.

| Token | Does |
|---|---|
| `{goal}` | Writing goal gauge. Click to set the target, or rebase it |
| `{filegoal}` | Word target for the open note. Click to set it |
| `{foldergoal}` | Word target for the current folder, counted across every note beneath it |
| `{syntax}` | Picker for the five word classes, each beside its own colour |
| `{prose}` | Picker for all seven writing checks, with the group's master switch |
| `{markers}` | Picker for spaces, tabs, paragraphs and line ends |
| `{font}` | Font picker — reads `Aa` in your current face |
| `{report}` | Opens the writing report |

Clicking a `{mode}` badge toggles that mode; inactive ones are faded. The **Z** badge moves the whole of Zen, both halves together.

#### Spacers

`{s}`, `{ss}`, `{sss}`… — a quarter-space per `s`. Empty room, nothing more. Give one a colour (`{s}:3`) and it becomes a solid sliver instead: edge shading beside a segment.

#### Powerline

Turn powerline on and the punctuation between your tokens becomes shape. **The character is the divider:**

| | |
|---|---|
| `>` `<` | arrow |
| `\|` | straight |
| `)` `(` | round |
| `~` | wave |
| `/` `\` | the two angle cuts |

Write `\|` for a literal pipe. At the very start or end of a row, `<` and `>` also choose which way the cap points — `<{file}` opens pointing left, `{words}>` closes pointing right.

Separators are drawn as SVG, so nothing needs a patched Nerd Font, and they scale with the bar's height.

**Segment colours** — a palette of seven backgrounds and four text colours, each with its own dark and light variant:

| Written | Does |
|---|---|
| `{words}:N` | background N (1–7, wraps) |
| `{words}:N;M` | `;M` picks text M (1–4); otherwise the ink derives itself for contrast |
| `{ln:col}:vim` | background follows the live vim mode — a `{vim}` segment does this on its own |
| `{words};vim` | the *text* follows the mode — alone, or beside any `:N` |
| `{file}:b1` `{file}:b2` | the theme's page / panel colour — a segment that melts into the bar |
| `{file};t1` `{file};t2` | the theme's normal / muted text — `:b1`/`:b2`'s twins |

**The bar itself** takes the same grammar, written at the very start of row 1's left slot: `:b1` `:b2` `:N` `:vim` set its background, `;t1` `;t2` `;N` `;vim` its text. Either or both, in either order. With `:N` or `:vim` and no text written, the ink derives itself, so the bar stays readable on any background.

```
:vim {vim} > {file} :: {ln:col}
```

**Fades** — the stepped gradient, written with `{g}`:

```
{file}:3 | {g}{g}{g}{g} | {words}:5
```

A run of `{g}` with no colour of its own steps between its neighbours' colours — or into the bar itself at a group's end. One band per token, so `{g}{g}{g}` is three narrow steps and `{ggg}` is one wide one; you pick the grain. Put dividers *between* the `{g}` tokens and they keep their shape, drawn through one continuous gradient:

```
{file}:3 > {g}>{g}>{g} > {words}:5
```

**Soft marks** sit inside a single segment, drawn in its own colour rather than between two blocks: `::` is a short hairline, `>>` and `<<` are full-height chevrons matching the arrows' angle.

#### Presets

Save any bar as a named preset, and load it back with one click. Each preset carries the whole look — rows, colours, separator style, dimensions — and turns into a **share code** you can paste to someone else, or keep as a backup before you start experimenting.

#### Sizing and behaviour

Configurable row height, font size, top and bottom padding, and rule style and weight on either edge. The bar's type can instead **match the note's own text size**, so it follows Ctrl+scroll zoom and the whole view stays homogeneous.

When the window narrows, the bar sheds content in a fixed order rather than wrapping or shrinking the type: the file path shortens first, then readings drop from the edges inward. Buttons always survive.

It follows your theme's background and text colours by default, with an optional custom colour override (separate dark/light pickers), and takes whatever font you pick with `{font}`. It auto-hides Obsidian's native status bar while active, and stands aside for the vim `:` command line so that stays visible.

**Goal gauges.** All three goals are drawn the same way: a bar that fills as you write, vertical or horizontal, with the percentage or a fraction beside it — or the label alone with no bar at all. Thickness, length and colour are configurable, and each goal can carry its own colour. Neither the file nor the folder goal has a baseline; they simply count words against a target.

### Zen

A master switch over two halves.

**Focus mode** hides UI chrome (tabs, view headers, ribbon, properties, scroll bar, linked mentions, native status bar), collapses both sidebars, and can enter fullscreen. Optional focused-file mode hides every other pane so only the active note remains. Each hidden element has its own toggle. Obsidian's own title bar can be painted to match the editor, so the window has no seam. Press `Escape` to exit (respects vim mode and Excalidraw).

**Letterbox** frames the writing area with top and bottom masks — adjustable height, horizontal inset, arrow style (solid/outline triangles, standard arrows, chevrons, double chevrons, or custom characters), arrow count and scale, optional arrows capping each end of the row, and separator line style and weight. Separate dark/light colours for arrows and lines. Drag the separator line to resize the mask; drag the arrow row to adjust the inset — both live, right in the editor. The band stays a window drag handle, so a hidden title bar costs you nothing.

Letterbox is independent of typewriter scrolling: you can run either without the other.

### Typewriter

Keeps the cursor line vertically anchored as you type. Configure how many lines of context stay **above** and **below** the cursor (equal values keep it dead-centre).

- **Current line highlight** — tint the line the cursor is on, with separate dark/light colours and an opacity slider.
- **Focus dimming** — fade everything outside your focus area while you write. Choose **paragraph** or **sentence** granularity (sentence mode dims other sentences even on the same line) and set the dim opacity. Dimming lifts automatically when the editor loses focus.

Both are rendered through CodeMirror's own decoration pipeline, so they never flicker while typing.

### Hemingway

Blocks the keys you use to go back and revise, so a draft can only move forward. Every lock is individually switchable:

**Removing text** — backspace (and its word/line variants), forward delete, undo and redo, cut, paste.
**Moving the cursor** — arrow keys, Home/End/Page Up/Page Down, select all, mouse clicks.

A blocked key can flash the **H badge** alone, the **retro bar**, the **screen**, screen and bar together, or nothing. Nothing is permanent — switch it off from the tab, or from the `H` badge in the bar, at any time.

The lock works at two levels: a high-precedence keymap for keystrokes, and a `beforeinput` layer that also catches the Edit menu, right-click, IME, and mobile keyboards.

### Writing report

`{report}` opens a panel with two tabs — the current note and its folder — each showing ten figures:

**Words**, **Characters**, **No spaces**, **Syllables**, **Sentences**, **Paragraphs**, **Lines**, **Pages**, **Read time**, and a **Flesch–Kincaid grade**.

Above them sits a gauge of your progress against that note's or folder's goal, coloured on a ramp that warms from red to green as it fills. Every figure explains itself on hover — what's excluded, how it's counted, what counts as a page.

Hit a target and the report throws fireworks at you.

### Syntax

Two groups, both running entirely on your machine.

**Word classes** — nouns, verbs, adjectives, adverbs, conjunctions, each with its own colour and toggle. Optionally mutes everything else, so one class carries the sentence. Turn on one at a time to read a paragraph for it; everything at once is a rainbow.

**Writing checks** — patterns worth rereading, not errors:

| Check | Catches |
|---|---|
| Filler words | Hedges and intensifiers — *very*, *really*, *basically*, *kind of*, *in order to* |
| Passive voice | A form of *to be* plus a past participle — *was written*, *is being considered* |
| Lexical illusions | The same word twice in a row. The eye skips them, which is why they survive proofreading |
| Commonly misused | Pairs people reach for the wrong half of — *affect/effect*, *its/it's*, *fewer/less* |
| Loose pronouns | A pronoun opening a sentence, where the reader has to guess what it points at |
| Sentence rhythm | Tints sentences by reading difficulty, so monotonous prose shows as a wall of one colour |
| Repetition radar | The same uncommon word twice close together — the echo you write and never see |

Both groups can be drawn as **coloured text**, a **highlight**, a **squiggle**, or an **underline**, chosen independently. Code, frontmatter and math are skipped.

Misused pairs are flagged whichever half you used — which one is right depends on the sentence, and the point is to look, not to be corrected.

### Text options

Two independent master toggles.

**Text options**

- **Limit line length** — cap the text column at a fixed character measure regardless of window width.
- **Horizontal padding** — left/right text padding, applied everywhere.
- **Paragraph indent** — first-line indent, triggered by a blank line or every line, with adjustable width. Applies to paragraphs only: lists, tasks, headings, quotes, tables and code are left alone.
- **Line spacing** — line-height multiplier.
- **Justify text** — full justification in both editing and reading views.
- **Hidden markers** — reveal invisible characters, each with its own toggle: spaces (`·`), tabs (`→`), paragraph breaks (`¶`) and line endings (`↵`).

**Typography** — replaces typed shorthand with real characters as you write: curly quotes and apostrophes, ellipsis, en/em dashes, arrows, guillemets, comparison operators, and fractions. Each group toggles separately. Never fires inside code, math or frontmatter, and undo restores exactly what you typed.

The quote characters themselves are configurable, so `"` and `'` can produce German „…“, French « … », or anything else. The apostrophe is a separate setting from the closing single quote, and the plugin works out which you meant by looking back for an unclosed quotation — so *don't* and *'word'* both come out right.

### Right-to-left

If Obsidian is set to right-to-left, or the note is, the text options mirror: indentation and padding follow the text direction, justified text sets its last line to the right, and the tab and line-end markers point the other way. Word counting already works for Hebrew, Arabic and Persian.

Syntax colouring and the writing checks are English-only. In a right-to-left script they simply mark nothing, rather than marking it wrongly.

### Misc

**Vim** — an option that maps `j`, `k`, `0` and `$` to their `g`-prefixed forms so motions follow wrapped lines rather than paragraphs.

**Word goals** — the writing goal's target, plus every file and folder target you've set, all editable in one list. The same targets the `{filegoal}` and `{foldergoal}` tokens set when you click them.

Optional per-file word counts in the file explorer (summed into folders), and per-heading word counts in the outline panel.

Word counting is markdown-aware: frontmatter, fenced code, math blocks, HTML, URLs, link targets and list markup are excluded, while headings, list text and link labels are counted. Chinese and Japanese count per character; Korean counts by word.

## Commands

- **Word-Smith: Toggle Word-Smith on/off** — master switch for the whole plugin (also available as the "WS" ribbon badge)
- **Word-Smith: Show or hide the retro bar** — slides the bar away and back, without turning it off
- **Word-Smith: Copy bar layout diagnostic** — copies the bar's measured geometry to the clipboard, for bug reports

Everything else is reachable from the settings tabs or directly from the retro bar tokens.

## Installation

1. Download `main.js`, `styles.css`, and `manifest.json` (or clone this repo).
2. Create a folder named `word-smith` inside your vault's `.obsidian/plugins/` directory.
3. Copy the files into that folder.
4. Reload Obsidian (or restart it), then enable **Word-Smith** under **Settings → Community plugins**.

Copy all three files when you update, not just `main.js` — the plugin checks that the stylesheet matches the script and warns you at startup if it doesn't.

## Privacy

Word-Smith is fully local.

- **No network access.** There are no `fetch`, `XMLHttpRequest`, `WebSocket`, or `requestUrl` calls anywhere in the plugin. The only URLs in the source are SVG namespace strings.
- **No telemetry, analytics, or crash reporting.**
- **No third-party dependencies.** Nothing is bundled. The only imports are `obsidian` and `@codemirror/*`, both provided by Obsidian itself.
- **No filesystem access outside Obsidian's own API.** No `require('fs')`, no `child_process`, no Electron escapes.

### What it reads

Your note content, in memory, while the note is open — for word counts, syntax colouring and paragraph detection. It's read from the editor and discarded. It is never copied, cached, or written anywhere.

The writing report additionally reads the notes in a folder when you open that tab, to total them up. Those totals are held in memory and recomputed when a file changes.

It also reads a note's frontmatter, to honour the `wordsmith:` and `ws-*` overrides.

### What it stores

One file: `data.json`, inside the plugin's own folder in your vault.

It holds your settings and saved bar presets, plus any file and folder word targets you set. If you enable **Restore cursor position**, it also stores a line number, column and scroll offset per note path — capped at the 300 most recent notes. That's file *paths* and *positions*, never file contents. Turn the setting off and delete `data.json` to clear it.

Nothing else is stored, anywhere.

### Verify it yourself

The plugin is a single readable file. Don't take my word for it:

```bash
grep -nE "fetch\(|XMLHttpRequest|WebSocket|requestUrl|sendBeacon" main.js
```

That returns nothing. Word-Smith is MIT licensed and the full source is in this repo.

---

## How syntax highlighting works

No API, no model, no bundled NLP library — it's a hand-written part-of-speech tagger that runs entirely inside your vault.

Each visible line is tagged in three passes.

**1. Lexicon.** A table of ~800 words that suffix rules can't be trusted with: determiners, pronouns, prepositions, conjunctions, auxiliaries and modals, irregular verbs, and the common nouns and adjectives that would otherwise be mis-tagged. `the`, `is`, `went`, `difficult`.

**2. Suffix rules.** Anything not in the lexicon is guessed from its ending, in order of reliability:

| Ending | Tag | Notes |
|---|---|---|
| `-ly` | adverb | minus ~90 exceptions — `family`, `reply`, `early`, `friendly` |
| `-ing` `-ed` | verb | |
| `-est` | adjective | |
| `-tion` `-ment` `-ness` `-ity` `-ism` `-ology` | noun | |
| `-ous` `-ful` `-less` `-ive` `-able` `-ical` `-ish` | adjective | |
| `-ize` `-ate` `-ify` | verb | |
| `-s` | noun or verb | depending on whether the singular is a known verb |

**3. Context.** The pass that fixes what the first two get wrong, using the words on either side:

- After a determiner or preposition, a verb becomes a noun — *the **work***, *in **place***. An `-ing` word becomes a gerund (*the **meeting***) unless a noun follows, which makes it a modifier (*the **running** water*).
- An unknown word between a determiner and a noun is filling the adjective slot — *her **difficult** book*.
- After `to`, a candidate becomes an infinitive — *to **write***.
- `to` itself is a preposition unless a verb follows, which distinguishes *to **the** shop* from *to **write***.
- A sentence-initial word followed by a determiner is an imperative verb — ***Check** the file*.

The five results — noun, verb, adjective, adverb, conjunction — are drawn as CodeMirror decorations, so they render in the editor's own pipeline and never flicker while you type.

The writing checks run on the same tagged tokens. Passive voice, filler words and the rest are list-and-rule based; sentence rhythm scores each sentence with Flesch–Kincaid; repetition radar keeps a sliding window of uncommon words.

### What it deliberately doesn't colour

Articles and possessive determiners. Highlighting adjectives shouldn't light up every `the`, `a` and `her` — they behave like articles, not descriptions.

Pronouns are counted as nouns, and prepositions as conjunctions.

### Accuracy

Roughly nine words in ten on ordinary prose, in my own testing — this isn't benchmarked against a tagged corpus. It's weakest on dialogue-heavy fiction and sentence fragments, where the context rules have less to work with, and on unusual proper nouns.

That's why it's a writing aid rather than a grammar checker: a colour is a prompt to look at the sentence again, not a verdict. Turning on one class at a time — all your verbs, or all your adjectives — is what it's for.

### Performance

Only the lines currently on screen are tagged, and code blocks, frontmatter and math are skipped entirely. About 2ms per repaint on a 110,000-word note, so it doesn't lag typing.

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
