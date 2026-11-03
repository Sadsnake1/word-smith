# Revisions

[← Back to the README](../README.md)

Earlier versions of your notes, kept in your vault. Save one by hand, let Word-Smith take one every so often, and compare it with the note as it is now, word by word. Bring back the sentence you cut last Tuesday without losing what you wrote since.

Off until you switch it on, under **Settings → Word-Smith → Revisions**.

## Saving one

**Save a revision** in the Powermenu's Revisions row (with **Compare revisions** and **Deleted notes**), on the `{revisions}` token in the bar, in the command palette or on a note's right-click. A small window opens with the note's name and the time, ready to keep or to rename ("Before the big cut", "Sent to Anna"). Yours are kept until you delete them.

A folder's right-click saves every note in it at once, under one name.

Nothing is saved twice: if the note hasn't changed since its last revision, there's nothing to save.

## Automatic revisions

Pick the folders and notes that get them under **Notes with revisions**, with exceptions under **Except**. The first time you switch Revisions on, the folder the Organizer is on is chosen for you (the whole vault if it's on none). The right-click on a note or a folder adds it or leaves it out, too.

Then pick how often: every 10 minutes, every 30, every hour, or once a day. Only a note that changed gets a new one.

**Keep automatic revisions** decides how many stay: 20, 50 or 100 per note, or all of them. Older ones go to Obsidian's trash. Yours are never pruned.

## Comparing

**Compare revisions** opens a tab beside your note, comparing a revision with the note as it is now. Pick the revision in the header's list (by day, each with its name or its time, its words, and the words added and removed since it), or step through them with ← and →. Each row's pencil renames it and its bin deletes it. Then come how many changes, Undo and Redo, and Restore. The note's name opens the note.

Every line of the note is a paragraph, as Obsidian shows it. Paragraphs are paired first, then their words, so a sentence that grew shows only its new words, not a whole paragraph removed and added. A paragraph you moved shows as moved, with where it came from. A run of paragraphs that didn't change folds away.

**Inline** shows one text with the changes marked, like track changes. Rest the pointer on a change and its Accept and Reject show in the margin beside its line. On each change:

- **Accept** keeps the new words and clears the mark. **Reject** puts the old words back.
- **Restore paragraph** puts the whole old paragraph back.
- **Move it back** returns a moved paragraph to where it was.
- **Bring it back** returns a paragraph you deleted. **Remove it** takes out one that's new.

**Side by side** puts the revision on the left and the note itself on the right, where you can write: what you type goes into the note. The header splits the same way, each side with its own buttons. The arrow between the two sides puts a paragraph back, and resting the pointer on a change in your note offers **Reject** for just its words.

Switch between them in the header; the tab remembers your choice. **Restore this revision** makes the whole note what it was. Your text as it is now is saved first, as a revision named "Before restoring…", so a restore can always be undone.

**Undo** and **Redo** take back what the tab did to the note, and Ctrl+Z (Cmd+Z) works too. Side by side, they're the note's own editing history.

The keys: ↑ and ↓ walk the changes, A accepts one, R rejects it (inline). Rest the pointer on the count to see them.

With **Include File recovery** on, Obsidian's own snapshots of the last days are listed after yours, read only.

## Where they live

In Word-Smith's folder, under `ws-revisions/`, one folder per note, following the note's own path. Each revision is a plain note: a few properties (which note, when, whose, its name, its words) and the text inside one code block, so its links, tags and tasks never show up in your graph or your searches. The folder is added to Obsidian's **Excluded files** while Revisions is on, so search, the graph and the quick switcher leave it alone.

They're part of your vault, so they go wherever your vault goes.

Rename or move a note and its revisions follow it. Delete a note and its revisions stay: **Deleted notes** lists them, and **Restore** brings the note back where it was, as its last revision.

## Cleaning up

**Settings → Word-Smith → Revisions → Clean up…** shows how many there are and how much room they take, and offers three ways to make it less: automatic revisions older than a week, a month or three months; the revisions of deleted notes; or everything. The list in the compare tab deletes one revision, or a note's automatic ones. Everything goes to Obsidian's trash, never straight out.

On a phone the compare is inline, with the header on three lines.

## In the Organizer

Turn on the **Revisions** column to see how many each note has. A folder row adds up its notes.
