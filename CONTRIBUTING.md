# Contributing to Word-Smith

Thanks for wanting to help! Word-Smith is made by one writer, for writers, and it tries hard to stay lean. Here's what helps most and how to send it.

## Welcome any time

- **Bug fixes.** One fix per pull request, with the steps that show the bug.
- **Language fixes.** If you write in one of Word-Smith's languages, corrections to the packs (`packs/ws-lang-<code>.md`) and the interface (`locales/<code>.json`) are gold. Issue #59 is the place for them.
- **Docs.** Anything in `README.md` or `docs/` that's wrong, unclear, or out of date.

## Ask first

- **New features, new settings, or a change to how something works.** Open an issue, or comment on one, before you write code. A quick yes or no saves you a weekend.
- **Bigger reworks** (how files are stored, the Organizer, the bar). Describe the shape you have in mind first and I'll say what fits.

Questions and ideas go in issues too.

## Not a fit

- No runtime dependencies. The plugin ships with none.
- No network calls, telemetry, or AI features. See [docs/privacy.md](docs/privacy.md).
- No code, word lists, or text that isn't MIT-compatible.

## Build it

```
npm install
npm run check     # TypeScript
npm run lint      # Obsidian's plugin review rules
npm run build     # main.js and build/styles.css
npm test          # the smoke test
```

To try it, copy `main.js`, `build/styles.css` and `manifest.json` into `<vault>/.obsidian/plugins/word-smith/`. Use a spare vault, not the one you write in. [BUILDING.md](BUILDING.md) maps the source.

## Ground rules for code

- `npm run check` and `npm run lint` come back clean. The lint is Obsidian's own review: no `any`, no `innerHTML`, no disable comments for its rules.
- Every word the plugin shows goes through `wsT('...')`, in US English. Your writing never goes through it: only Word-Smith's own words are translated.
- A new setting gets a default that changes nothing for people who already use Word-Smith. Renaming or reshaping a setting needs a migration in `loadSettings`.
- Word-Smith runs on phones and tablets too, so no Node or Electron APIs (`fs`, `path`, `require`, `child_process`). If you change a layout, check it at phone width.
- Wear Obsidian's own classes and CSS variables, so themes keep working. Check the default theme in light and dark.
- Fix the thing. Don't build a framework around it.

## Translations

The interface's languages live in `locales/`, one file per language.

- The key is the English line exactly as `wsT` gets it; the value is the translation.
- Keep `{placeholders}` as they are, untranslated.
- A line with `{n}` can carry plural forms, in the categories the language has: `"one: {n} note; other: {n} notes"` in English terms, `one: …; few: …; many: …; other: …` in Russian.
- Keep the file's own formatting: tab indents, one line per entry.
- To see it, switch Obsidian's language (Settings → General → Language) and reload.

## Language packs

A pack is one Markdown file of word lists and rules. [docs/language-packs.md](docs/language-packs.md) shows how they work; to start a new language, copy the closest pack and rename it `ws-lang-<code>.md`. Say where your lists came from, and keep them MIT-compatible.

## Your pull request

- Say what it changes and why, and how you tested it: your Obsidian version, desktop or phone, which theme.
- A before and after screenshot for anything you can see.
- `check`, `lint` and `test` clean.
- Leave the version numbers and `main.js` alone. Releases are versioned and built from the tag.

I read every pull request myself. Before a release it also runs against a larger test suite that lives outside this repo, so I may adjust your change, port it by hand, or ask for changes. You're credited by name in the release notes (and maybe I'll send some cake too).

## Reporting a bug

- Your Word-Smith and Obsidian versions
- Your system or device, and your theme
- The steps that make it happen, and a screenshot if it's something you see
- For anything about settings: Settings → Word-Smith → Vault → Backup and repair → **Copy**, then paste the JSON (take out anything private)

## License

By contributing, you agree your work is released under the MIT license, like the rest of Word-Smith.
