# Privacy and your files

[← Back to the README](../README.md)

## Privacy

Word-Smith is fully local. No network calls of any kind — no `fetch`, no `XMLHttpRequest`, no `WebSocket`, no `requestUrl`. No telemetry. No third-party dependencies. No filesystem access outside Obsidian's own API.

**What it reads:** your note's text, in memory, while the note is open — for counts, colouring and paragraph detection. The report reads a folder's notes when you open that tab, to total them. An export reads the notes you ticked, to compile them.

**What it stores:**

- `data.json`, in the plugin's own folder — your settings and saved bars. With history on it also keeps each note's last word count, so a save can be turned into a difference. That cache rebuilds itself and can be deleted freely.
- **Your history file**, only if you switch history on: one row per day — the date, and how many words you added, cut and netted. If **Remember which notes** is on, it also records which notes each day's words happened in, so history is searchable; switch it off and those names are dropped. Counts only, either way — never a word of what you wrote.
- **Your targets, flags and export list**, which hold note and folder names and numbers, and no prose.

An exported manuscript is the exception, and an obvious one: you asked for your words in a file, so that file has your words in it.

Nothing else, anywhere. Don't take my word for it:

```bash
grep -nE "fetch\(|XMLHttpRequest|WebSocket|requestUrl|sendBeacon" main.js
```

That returns nothing.

## The three notes Word-Smith keeps

Three plain notes, all in `Word-Smith/` on a new vault, all yours to read, edit, move or delete:

| | |
|---|---|
| `ws-history.md` | One row per day — added, deleted, net |
| `ws-structure.md` | The order you put your book in, your word targets, flags, folder colours, which properties are columns, and which scenes are in an export |
| `ws-settings.md` | A readable mirror of your settings — so a new machine can be handed the bar, the theme and the rest without `data.json` |

Each is found by the markers inside it rather than by its name, so moving or renaming one is safe. Their locations are shown under **Misc**, not typed: the plugin finds them by what's inside them. If you already have these in your vault's root, they stay exactly where they are — nothing is moved for you.

`ws-structure.md` is one path per line, nothing clever, so a sync engine or git can merge it line by line — a conflict is one scene misplaced, not a broken structure. The reader repairs rather than rejects: duplicate lines are dropped, unknown paths ignored, missing notes appended to the end of their folder.

**Your history file is the only copy.** Back it up with your vault, and don't delete it expecting the plugin to have another one.
