// Word-Smith — ext-page: the page around the text: a bottom panel watched, the tildes after the end, the caret's floor. One of the editor's extensions, out of
// wsEditorExtensions (editor-extensions.ts, which assembles them in their order) on the writer's "Do all", 2026-10-22.

import { CM, wsCatch } from '../core/preamble';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import type WordSmith from '../plugin/plugin';
import type { Extension } from '@codemirror/state';

// what the tildes' measure phase hands its write phase: nothing, a hide, or
// where the rows are and what face they wear
type TildeMeasure = null | { hide: true } | { hide?: false; top: number; left: number; height: number; lineH: number; font: string; size: string; weight: string; count: number };

export function wsPageExtensions(plugin: WordSmith, cm: NonNullable<typeof CM>): Extension[] {
	const { ViewPlugin } = cm;

	// Watches for a CodeMirror bottom panel — the vim ":" command line is
	// one — so the bar and the bottom mask can stand down while it is up.
	// Panels open through a state effect, so an update fires with them;
	// reading the DOM rather than guessing at vim internals keeps this
	// working whatever creates the panel.
	const panelWatcher = cm.ViewPlugin.fromClass(class {
		constructor(view: EditorView) { this.sync(view, true); }
		// A keystroke or a caret move is not a reason to re-measure the
		// window: only the panel opening or closing, or the editor's own size
		// changing without an edit (a sidebar, a font, a line that grew a row
		// once it was measured).
		update(u: ViewUpdate) { this.sync(u.view, u.geometryChanged && !u.docChanged); }
		destroy() { document.body.classList.remove('ws-vim-panel-open'); }
		sync(view: EditorView, resized: boolean) {
			let open = false, panel: Element | null = null;
			try { panel = view.dom.querySelector('.cm-panels-bottom'); open = !!panel; } catch (_) { wsCatch('buildEditorExtensions / sync: panel = view.dom.querySelector(\'.cm-panels-bottom\');', _); }
			document.body.classList.toggle('ws-vim-panel-open', open);
			// The {vim} COMMAND state is driven from this flag, and it has
			// to be updated on the way OUT as well as in. It used to sit
			// below the early return, so pressing Esc closed the panel and
			// left the flag stuck true — the bar reported COMMAND forever,
			// and with mode colours on the segment stayed that colour too.
			//
			// Set BEFORE the re-stamp below, not after: the bottom mask
			// now reads this flag to decide whether to clear the gutter
			// (see stampMaskPositions). The rAF defer means the old order
			// happened to work, but geometry that depends on which side
			// of a scheduling call an assignment falls on is a trap.
			const turned = open !== plugin._vimPanelOpen;
			if (turned) {
				plugin._vimPanelOpen = open;
				// ── AND THE GAP MOVES WITH IT ──────────────────────
				//
				// The reserve is the writer’s gap, lifted to fit the
				// line while it is open — so BOTH transitions have to
				// re-stamp, not just the measuring one below. Without
				// this the bar would rise on the next refresh and come
				// back down on the one after that.
				//
				// STAMPED HERE rather than through `refresh()`: the
				// same reasoning the measure path already carries a
				// paragraph about — a refresh behind an await leaves
				// the bar moved and the mask still at the old edge.
				try {
					document.documentElement.style.setProperty(
						'--ws-vim-gutter', plugin.vimGutterHeight() + 'px');
				} catch (_) { wsCatch('buildEditorExtensions / sync: document.documentElement.style.setProperty(', _); }
				plugin.updateRetroStatusBar();
			}
			// What sits at the bottom of the window just changed, so the
			// mask geometry that stops at the bar's top edge has to be
			// recomputed either way — opening AND closing.
			if (turned || resized) plugin.scheduleMaskPosition();
			if (!open) return;
			// Measured AFTER layout — panels open through a state effect,
			// so this update can run before the fixed positioning has
			// been applied and the height read at that instant is the
			// in-flow one.
			//
			// The measurement does NOT move the bar. It is recorded as
			// the height to reserve, so the gutter is already the right
			// size the next time `:` is pressed (and on every later
			// launch) and the bar can stay exactly where it is. Only a
			// changed value costs a save.
			window.requestAnimationFrame(() => {
				try {
					if (!panel || !panel.isConnected) return;
					const h = Math.round(panel.getBoundingClientRect().height);
					if (!(h > 0) || h > 120) return;
					if (Math.abs((plugin.settings.vimPanelHeight || 0) - h) < 1) return;
					plugin.settings.vimPanelHeight = h;
					// Stamp the variable NOW rather than waiting for the
					// refresh inside saveSettings — that refresh sits
					// behind an await on a disk write, and until it lands
					// the bar has moved to the new gutter while the mask
					// still ends at the old one. That gap is the strip
					// left uncovered under the mask the first time `:`
					// was pressed. Setting it here closes the window;
					// the save then only persists what is already true.
					document.documentElement.style.setProperty(
						'--ws-vim-gutter', plugin.vimGutterHeight() + 'px');
					plugin.scheduleMaskPosition();
					void plugin.saveSettings(true);
				} catch (_) { wsCatch('buildEditorExtensions / sync: if (!panel.isConnected) return;', _); }
			});
		}
	});

	// ── EOF tildes (vim's ~) ──────────────────────────────────────────────
	// Vim draws a ~ on every screen row past the end of the buffer. Those
	// rows are not document positions — no decoration can reach them — so
	// this plugin owns a real element over the empty space after the last
	// line.
	//
	// A LAYER OF THE SCROLLED CONTENT, inside .cm-scroller (the rerender
	// audit, 2026-09-25). It lived in view.dom, over the scroller, and was
	// placed again on every scroll — but Obsidian scrolls the note on the
	// compositor a frame before the page runs, so on each wheel tick the
	// tildes sat a whole scroll step off the last line for a frame (91px,
	// measured): the jitter Cursor-Smith's caret had. In the scrolled
	// content they move with the text and a scroll does not touch them.
	// The block runs from the last line to the end of what the scroller
	// holds, measured WITHOUT the block, and clips there: an absolute child
	// adds to what a scroller can scroll, and a block reaching past the end
	// would give the note room it could never lose.
	const eofTildePlugin = ViewPlugin.fromClass(class {
		view: EditorView;
		el: HTMLElement;
		measure: { read: () => TildeMeasure; write: (m: TildeMeasure) => void };
		constructor(view: EditorView) {
			this.view = view;
			this.el = createDiv();
			this.el.className = 'ws-eof-tildes';
			view.scrollDOM.appendChild(this.el);
			this.measure = { read: () => this.read(), write: (m) => this.write(m) };
			view.requestMeasure(this.measure);
		}
		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged || u.geometryChanged || u.heightChanged) {
				u.view.requestMeasure(this.measure);
			}
		}
		destroy() {
			this.el.remove();
		}
		// All layout reads happen here, inside CM's measure phase.
		read() {
			const view = this.view;
			const s = plugin.settings;
			if (!s.pluginEnabled || !s.markersEnabled || !s.markBlankLines) return null;
			if (!plugin.isEditorInScope(view)) return null;
			const scRect  = view.scrollDOM.getBoundingClientRect();
			const cRect   = view.contentDOM.getBoundingClientRect();
			const cStyle  = getComputedStyle(view.contentDOM);
			// The bottom of the LAST DOCUMENT LINE, from CodeMirror's own
			// line geometry. The earlier box arithmetic (content bottom
			// minus padding) drifted in zen mode — the scroller carries
			// 50vh pads there and Obsidian stacks its own slack on the
			// content — which parked the tildes on the note's trailing
			// blank lines. lineBlockAt() knows exactly where the final
			// line ends; a line holding only a return is still a line,
			// so, as in vim, it gets no tilde — only the void after it.
			let textBottom;
			try {
				textBottom = view.documentTop
					+ view.lineBlockAt(view.state.doc.length).bottom;
			} catch {
				// Older CM without those accessors: fall back to boxes.
				textBottom = cRect.bottom - (parseFloat(cStyle.paddingBottom) || 0);
			}
			const lineH   = view.defaultLineHeight || 24;
			const sd = view.scrollDOM;
			// in the scrolled content's own coordinates
			const top = textBottom - scRect.top + sd.scrollTop;
			// THE END OF WHAT THE SCROLLER HOLDS, from the children in its flow
			// and its own bottom padding (the 50vh pads in zen) — never from its
			// scrollHeight, which counts this block, and never from a layer.
			// Cursor-Smith's caret layer sits in here too, absolute and as tall
			// as the scroll height: read, it fed this block its own height back
			// and the note gained 32px of room on every measure (measured).
			let end = sd.clientHeight;
			for (const c of Array.from(sd.children)) {
				const e = c as HTMLElement;
				if (e === this.el || typeof e.offsetTop !== 'number') continue;
				const pos = getComputedStyle(e).position;
				if (pos === 'absolute' || pos === 'fixed') continue;
				end = Math.max(end, e.offsetTop + e.offsetHeight);
			}
			end += parseFloat(getComputedStyle(sd).paddingBottom) || 0;
			const height = end - top;
			if (height < lineH * 0.5) return { hide: true as const };
			return {
				top,
				left:  (cRect.left - scRect.left) + sd.scrollLeft + (parseFloat(cStyle.paddingLeft) || 0),
				height,
				lineH,
				// The face is READ from the content element rather than
				// inherited. The overlay sits in .cm-scroller but outside
				// .cm-content, so the font rules that target
				// .cm-content (and the --ws-font stamp that drives them)
				// never reached it — which is why the tildes came out in
				// the interface font instead of the chosen one. Copying
				// the computed value cannot miss whatever set it.
				font:  cStyle.fontFamily,
				size:  cStyle.fontSize,
				weight: cStyle.fontWeight,
				count: Math.min(500, Math.ceil(height / lineH))
			};
		}
		write(m: TildeMeasure) {
			if (!m || m.hide === true || !(m.count > 0)) { this.el.classList.remove('is-on'); return; }
			const st = this.el.style;
			this.el.classList.add('is-on');
			st.top        = m.top + 'px';
			st.left       = m.left + 'px';
			st.height     = m.height + 'px';
			st.overflow   = 'hidden';
			st.lineHeight = m.lineH + 'px';
			st.fontFamily = m.font;
			st.fontSize   = m.size;
			st.fontWeight = m.weight;
			this.el.textContent = '~\n'.repeat(m.count);
		}
	});

	// ── The caret's floor ─────────────────────────────────────────────────
	// CodeMirror's own answer to "keep the cursor this far from the edge".
	// scrollMargins is consulted every time the editor scrolls something
	// into view, so the caret is never placed inside the returned margin —
	// and unlike every layout approach, this depends on no assumption
	// about how Obsidian sizes the editor. Two attempts at doing it with
	// CSS insets (pane padding, then a scroller margin) both looked
	// correct and both let the caret go on hiding under the bar.
	//
	// MEASURED, not reserved, and that is what makes it safe to run
	// alongside the CSS margin rather than instead of it. The margin
	// asked for is exactly how far the scroller's own bottom edge
	// currently reaches PAST the line the caret must stay above. If the
	// stylesheet already lifted that edge clear, the overlap is zero or
	// negative and nothing is added — so the two cannot double up. If the
	// stylesheet did nothing, this covers the whole distance on its own.
	//
	// It also gets splits right for free: the upper pane of a top/bottom
	// split has its scroller bottom above the bar already, so it asks for
	// nothing without needing to know about `.ws-bar-overlap`.
	const caretFloor = cm.EditorView.scrollMargins.of((view) => {
		try {
			if (!plugin.editorViewIsNote(view)) return null;
			const r = view.scrollDOM.getBoundingClientRect();
			const below = Math.round(r.bottom - plugin.caretFloorY());
			const above = Math.round(plugin.caretCeilingY() - r.top);
			// A pixel of slack at each edge: fractional geometry
			// otherwise asks for a 1px margin forever and every scroll
			// fights the last one.
			const margins: { top?: number; bottom?: number } = {};
			if (below > 1) margins.bottom = below;
			if (above > 1) margins.top = above;
			return (margins.top || margins.bottom) ? margins : null;
		} catch { return null; }
	});

	return [panelWatcher, eofTildePlugin, caretFloor];
}
