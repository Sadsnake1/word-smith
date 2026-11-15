# Manuscript inclusion

## Plan

Word-Smith gives each file one **Include in manuscript** value. It is
available as an editable column in the Organizer, hidden by default. A missing
value means included. Flags remain status labels and no longer change counts,
history, targets, or row numbers.

The value applies consistently to the file's contribution to writing statistics,
writing history, goal progress, and manuscript row numbering. Excluding a file
does not delete or alter its content, target, flag, frontmatter, or other
Organizer metadata. An excluded note remains visible and can still be inspected
in its own report, labeled as excluded; aggregate reports omit it.

The value is stored by file path in Word-Smith's structure store so it works for
Markdown and other vault files without adding or rewriting user frontmatter.
File and folder rename, move, deletion, and structure-store sync must preserve
or remove the value with the corresponding path.

Files and folders expose `data-manuscript-state` for styling:

- Files are `included` or `excluded`.
- Folders derive `included`, `excluded`, `mixed`, or `empty` from eligible
  descendant files. They have no stored inclusion value.
- Toggling a folder applies the chosen value to its current eligible descendant
  files. A mixed folder's first toggle includes all its current descendants; an
  empty folder has a disabled control. The action does not establish a rule for
  future files.

Flags remain status labels and never control inclusion or numbering. On upgrade,
existing path-based `Never counted` rules are converted to file values for
eligible files currently in the vault. After those values have been written
successfully to the structure store, the old rules are cleared and a one-time
notice reports paths with no current files. Those paths are dropped, so future
files default to included. If the store cannot be written, the old rules remain
active and conversion retries on a later load.
Conversion is idempotent and does not edit note content or rewrite existing
history.

The saved inclusion value and its row styling are independent of manuscript
scope. A file outside the active scope may be marked included while still not
contributing to that scope's totals. Calculated folder targets use the same
effective inclusion-and-scope rule as the current-word numerator.

## Folder targets

A Manuscript setting chooses **Manual folder targets** or **Sum descendant note
targets**. Manual remains the default. Note targets are always user-defined.
In calculated mode, a folder's target is the sum of included descendant note
targets, counted once across nested folders. The folder target is read-only in
that mode. The stored manual folder target is retained and returns when manual
mode is restored. The same effective folder target is used by the Organizer,
Report, goal calculations, and status bar. A calculated zero is a real zero; it
does not fall back to a stored manual target. The vault root is a folder too.

## Acceptance

- New and upgraded vaults show the inclusion column hidden by default; users can
  enable it and retain that choice.
- A file toggle updates aggregate data, goals, history recording, numbering,
  row attributes, and folder states without changing its flag or metadata.
- Excluded files remain visible. Exclusion cancels queued or in-flight history
  captures; re-inclusion snapshots current editor content before recording
  resumes, so edits made while excluded are not counted. This also holds after
  restart, store sync, and folder bulk changes.
- Folder state reflects all eligible vault files regardless of collapse or
  filtering, excluding Word-Smith's own store files. Empty folders are distinct
  from excluded folders. Scope rules still limit current writing totals
  independently of the saved inclusion value.
- Folder toggles affect current descendants only; future files default to
  included.
- Manual folder targets survive mode changes. Calculated targets sum included
  descendant notes once and are consistent across all target surfaces.
