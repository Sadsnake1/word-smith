# Word-Smith

A distraction-free writing suite for Obsidian: zen mode, letterbox masks, typewriter scrolling, a write-forward lock, syntax colouring, writing checks, smart typography, and a configurable status bar — each independent, each toggled on its own.

## Showcase

<img width="1340" height="860" alt="123" src="https://github.com/user-attachments/assets/2480ee72-4f08-41d6-ab9c-1bed61203700" />

<img width="1340" height="860" alt="12331" src="https://github.com/user-attachments/assets/750db726-30d1-4a1f-9c9f-f09963c8af15" />

## Features

Settings are organized into seven tabs: **Zen**, **Typewriter**, **Hemingway**, **Retro Bar**, **Syntax**, **Text Options**, and **Misc**.

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

### Zen

A master switch over two halves.

**Focus mode** hides UI chrome (tabs, view headers, ribbon, properties, scroll bar, linked mentions, native status bar), collapses both sidebars, and can enter fullscreen. Optional focused-file mode hides every other pane so only the active note remains. Each hidden element has its own toggle, plus adjustable top/bottom editor padding. Press `Escape` to exit (respects vim mode and Excalidraw).

**Letterbox** frames the writing area with top and bottom masks — adjustable height, horizontal inset, arrow style (solid/outline triangles, standard arrows, chevrons, double chevrons, or custom characters), arrow count and scale, and separator line style and weight. Separate dark/light colours for arrows and lines. Drag the separator line to resize the mask; drag the arrow row to adjust the inset — both live, right in the editor.

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

Blocked keys can flash the **screen**, the **retro bar**, both, or nothing. Nothing is permanent — switch it off from the tab, or from the `H` badge in the bar, at any time.

The lock works at two levels: a high-precedence keymap for keystrokes, and a `beforeinput` layer that also catches the Edit menu, right-click, IME, and mobile keyboards.

### Retro bar

A fixed bar at the bottom of the screen, sized to match the open note (not the full window). **One to three stacked rows**, each with independently formatted **left**, **center**, and **right** slots, each accepting any mix of tokens.

**Readouts**

| Token | Shows |
|---|---|
| `{file}` | Current file — full path or filename only (configurable) |
| `{words}` | Word count (selection count if text is selected) |
| `{chars}` | Character count (selection count if text is selected) |
| `{paragraph}` | Current paragraph / total paragraphs |
| `{readtime}` | Estimated reading time, at a configurable words-per-minute |
| `{mode}` | Active modes as badges: **T** typewriter, **H** Hemingway, **Z** zen |
| `{lock}` | `LOCK` while Hemingway mode is on |
| `{time}` | Current time |
| `{date}` | Current date (customizable format) |
| `{battery}` | Battery level (⚡︎ while charging) |
| `{caps}` | `CAPS LOCK` on two lines while it's on |
| `{num}` | `NUM LOCK` on two lines while it's on |
| `{vim}` | Current vim mode: `-- NORMAL --`, `-- INSERT --`, `-- VISUAL --`, `-- REPLACE --`, `-- COMMAND --` |

**Buttons** — these do something when clicked.

| Token | Does |
|---|---|
| `{goal}` | Writing goal gauge. Click to set the target, or rebase it |
| `{filegoal}` | Word target for the open note. Click to set it |
| `{foldergoal}` | Word target for the current folder, counted across every note beneath it |
| `{syntax}` | Picker for the five word classes, each beside its own colour |
| `{writechecks}` | Picker for all seven writing checks, with the group's master switch |
| `{markers}` | Picker for spaces, tabs, paragraphs and line ends |
| `{font}` | Font picker — reads `Aa` in your current face |
| `{report}` | Opens the writing report |

Clicking a `{mode}` badge toggles that mode; inactive ones are faded.

**Goal gauges.** All three goals are drawn the same way: a bar that fills as you write, vertical or horizontal, with the percentage or a fraction beside it — or the label alone with no bar at all. Thickness, length and colour are configurable, and each goal can carry its own colour. Neither the file nor the folder goal has a baseline; they simply count words against a target.

The bar follows your theme's background and text colours by default, with an optional custom colour override (separate dark/light pickers). Configurable row height, font size, and top border style and weight. It auto-hides Obsidian's native status bar while active, and lifts the vim `:` command line above itself so it stays visible.

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

Optional per-file word counts in the file explorer (summed into folders), and per-heading word counts in the outline panel.

Word counting is markdown-aware: frontmatter, fenced code, math blocks, HTML, URLs, link targets and list markup are excluded, while headings, list text and link labels are counted. Chinese and Japanese count per character; Korean counts by word.

## Commands

- **Word-Smith: Toggle Word-Smith on/off** — master switch for the whole plugin (also available as the "WS" ribbon badge)

Everything else is reachable from the settings tabs or directly from the retro bar tokens.

## Installation

1. Download `main.js`, `styles.css`, and `manifest.json` (or clone this repo).
2. Create a folder named `word-smith` inside your vault's `.obsidian/plugins/` directory.
3. Copy the files into that folder.
4. Reload Obsidian (or restart it), then enable **Word-Smith** under **Settings → Community plugins**.

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

It holds your settings, plus any file and folder word targets you set. If you enable **Restore cursor position**, it also stores a line number, column and scroll offset per note path — capped at the 300 most recent notes. That's file *paths* and *positions*, never file contents. Turn the setting off and delete `data.json` to clear it.

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
