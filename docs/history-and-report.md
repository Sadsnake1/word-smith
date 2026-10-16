# History and the writing report

[← Back to the README](../README.md)

## Writing history

<table>
  <tr>
    <td width="50%"><img alt="History, day view" src="https://github.com/user-attachments/assets/5a751b82-0882-4d7b-95b8-7cf6dc35e8d0" /></td>
    <td width="50%"><img alt="History, calendar view" src="https://github.com/user-attachments/assets/a8c415e5-0768-4289-984b-54ab9bf4951c" /></td>
  </tr>
</table>

Off until you switch it on, under **Settings → Word-Smith → Manuscript → History**, or with the **Start counting** button in the History pane.

Then it counts how much you write each day and draws it at four zooms: day, month, year, and a calendar. Words you added rise from the center line, words you cut fall below it. A hard day of editing shows as work, not a gap. Above the chart, for the zoom you're on: the net words, the average, the best day (or month, or year), how many were active, and by day and by month the streak.

It counts whatever the Organizer is on: pick a folder or a note there, or a folder in the line at the top, and History follows.

Two kindnesses in the numbers. A day counts if you wrote or cut, so cutting won't break your streak. And the average divides by the days you actually wrote, so days off don't drag it down.

Pasted and cut text are left out, so moving text around doesn't show as writing. If you paste in work you wrote elsewhere, say a handwritten page you scanned, turn on **Count pasted text** in the History settings and pasted words count as written. A note you create empty starts at zero, so everything you write into it counts. A note that arrives with words already in it, from a sync, an import or Make a copy, is taken as it is, not as today's writing.

## Your history is an ordinary note

A table for each year, one row per day:

```markdown
| Date | Added | Deleted | Net |
| --- | ---: | ---: | ---: |
| 2026-08-01 | 912 | 142 | 770 |
```

With **Remember which notes** on, a **By note** table follows, a row per note per day.

A new vault gets it at `Word-Smith/ws-history.md`. Move it, rename it, keep it next to the manuscript. Word-Smith finds it by the markers inside it and leaves anything you write outside them alone. Word-Smith keeps a copy in its own folder too (`backup/`), but back it up with your vault.

Nothing before the day you switch it on can be reconstructed. A file only knows when it was touched, not how much went into it.

## Never counted

One list of notes and folders is left out of your totals. An outline, a research folder, a scratch file. Word-Smith still works in them. They just don't count.

## What counts as a word

Prose only. Frontmatter, `%%` and HTML comments, code blocks, maths, link targets, URLs and markup are stripped first. Headings, lists, quotes and footnotes count. The bar, the report, the Organizer and the history all use this one counter, so the numbers agree everywhere.

## The writing report

<img width="570" alt="The writing report" src="https://github.com/user-attachments/assets/809fc7a8-1d85-4a8e-9ea4-a03e6bff0cfd" />

`{report}` on the bar, the menu, or right-click a row in the Organizer. Words against the note's target, with a gauge (a note with none under a folder that has one shows the folder's, named), then characters, syllables, sentences, paragraphs, pages, read time and a reading grade. Hover a figure and it explains itself.

For a folder's numbers, right-click the folder in the file explorer or the Organizer and choose **Report on this**.

Under the figures, **Words frequency**: every word in the note, how often it appears, and its share as a bar in the same colors the Organizer's target cells use. Common words (the, and, of) stay out until you tick **Common words**. Type in **Find a word** to narrow the list to the words that contain it — "walk" shows walk, walked and walking with their counts — and click **Word**, **Count** or **Frequency** to sort by it; a second click turns the order around. A share too small for two decimals shows as many as it needs, so a word that is there never reads as 0.00%.
