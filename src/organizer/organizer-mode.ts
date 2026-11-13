// Word-Smith — organizer-mode: the fold chevron a row wears, and three doors
// for the tests.

import { setIcon } from 'obsidian';
import { wsCatch } from '../core/preamble';
import type WordSmith from '../plugin/plugin';
import type { WordSmithSettings } from '../core/settings';

// WHAT THE WINDOW LENDS THIS MODULE: the type of the object
// `openManuscriptModal` hands `wsOrgModeMake`, as the checker sees it at the
// call — a getter without a setter is readonly.
export interface OrgModeDeps {
	plugin: WordSmith;
	readonly drawPanel: () => void;
	readonly orgOpen: Set<string>;
	readonly orgOpenSet: (p: string, on: boolean) => void;
	readonly s: WordSmithSettings;
}

export const wsOrgModeMake = (d: OrgModeDeps) => {
// ── THE CHEVRON, AND IT IS THE FILE TREE'S ─────────────────
//
// Obsidian's own `right-triangle` inside `tree-item-icon collapse-icon
// nav-folder-collapse-indicator`, so it is the same glyph, size and colour
// as the explorer's rather than a › that resembles one.
//
// TWO VOCABULARIES ON ONE ELEMENT, and both are load-bearing.
// `is-collapsed` is the app's word and what its own rule ROTATES on — wear
// the class, ask for nothing, and a theme restyles this for free. `is-open`
// is ours and the fold handler reads it. They are written together here, in
// one place, so they cannot drift into disagreeing about which way a folder
// is.
//
// `setIcon` FAILS SILENTLY on a name this build's Lucide does not have, so
// the result is CHECKED and the text glyph is the fallback — a chevron that
// draws nothing at all would be worse than the one being replaced.
const orgChevron = (into: HTMLElement, open: boolean) => {
	const el = into.createSpan({
		cls: 'ws-org-twist tree-item-icon collapse-icon'
			+ ' nav-folder-collapse-indicator'
			+ (open ? ' is-open' : ' is-collapsed')
	});
	try { if (setIcon) setIcon(el, 'right-triangle'); } catch (_) { wsCatch('openManuscriptModal / orgChevron: if (setIcon) setIcon(el, \'right-triangle\');', _); }
	if (!el.childElementCount) el.setText(open ? '⌄' : '›');
	return el;
};
// A redraw of the panel, for the tests.
d.plugin._orgRedraw = () => d.drawPanel();

// AND ONE ONTO WHAT IS OPEN. `orgOpen` is a Set built from the store when
// the window opens — a SNAPSHOT — so writing `settings.organizerOpen` from
// outside changes the store and nothing else until the next open.
d.plugin._orgOpenSet = (p, on) => d.orgOpenSet(p, !!on);
d.plugin._orgOpen = () => Array.from(d.orgOpen);
// A RENAME CARRIES THE FOLDERS THAT WERE OPEN. `settings.organizerOpen`
// follows the path in `renameGoalPaths`; this is the open window's
// SNAPSHOT of it catching up, so the row does not come back folded after
// the folder it names has moved. The redraw is the same one the vault
// event already asks for, run after the store has the new path.
d.plugin._orgOpenRename = (oldPath, newPath) => {
	if (!oldPath || !newPath || oldPath === newPath) return;
	let moved = false;
	const next = new Set<string>();
	for (const p of d.orgOpen) {
		let q = p;
		if (p === oldPath) q = newPath;
		else if (p.startsWith(oldPath + '/')) q = newPath + p.slice(oldPath.length);
		if (q !== p) moved = true;
		next.add(q);
	}
	if (!moved) return;
	d.orgOpen.clear();
	for (const p of next) d.orgOpen.add(p);
	d.s.organizerOpen = Array.from(d.orgOpen);
	d.drawPanel();
};

	return { orgChevron };
};
