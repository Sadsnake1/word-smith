// Word-Smith — bar-themes: the bar's themes, each a named fill of the palette keys in a dark half and a light half, and the powerline's dividers.
// Out of preamble.ts on the writer's "Do all", 2026-10-22, the text as it was; preamble re-exports all of it, so
// a module that imports from preamble is unchanged.


// ── Themes ───────────────────────────────────────────────────────────────────
//
// A theme is a NAMED FILL of the palette keys and nothing else. Applying one
// writes the same twenty-two settings a writer would set by hand in the
// pickers, and nothing more; there is no theme layer at
// paint time, no second code path, and nothing here that the colour pickers
// cannot also produce. That is deliberate: a shelf of palettes is worth
// having, a parallel styling system is not.
//
// BOTH HALVES ARE MANDATORY. The palette comment above says why in one line —
// "a palette that merely survives the switch is not the same as one designed
// for it" — and it is the whole reason this is a table of pairs rather than a
// list of colour schemes. Obsidian's own light/dark state picks the half, so
// a writer who switches at dusk gets a bar that was designed for dusk.
//
// The BACKGROUNDS are the constraint, not the accents. A segment's ink is
// derived from its background (powerlineInk) unless the row says otherwise,
// so every c-slot has to be far enough from one of the two inks for that
// derivation to have a readable answer — which rules out the mid-tones most
// upstream palettes use for their accent colours. The values below are
// therefore the upstream palette's SURFACE family where one exists, and the
// upstream accent darkened (dark half) or tinted (light half) where it does
// not. theme_probe asserts the result rather than trusting this paragraph.
//
// Slot meanings, kept identical across every theme so switching does not
// rearrange a bar someone built:
//   c1 accent · c2 quiet mid · c3 quiet deep · c4 green · c5 warm ·
//   c6 violet · c7 alert
//   t1 ink · t2 reverse ink · t3 muted ink · t4 accent ink
//
// Palette VALUES are used as facts, with the source named per theme. No
// upstream code is copied.
// The hidden row now also restores ids it cannot name, so nothing a
// writer removes is ever unreachable again, whatever put it there.

// One half of a scheme: the four surfaces, the seven accents and the four inks, by
// slot name — and readable by any slot name, which is how the picker walks them.
export interface WsThemeHalf { b1: string; b2: string; b3: string; b4: string; c1: string; c2: string; c3: string; c4: string; c5: string; c6: string; c7: string; t1: string; t2: string; t3: string; t4: string; [slot: string]: string }
export interface WsBarTheme { id: string; name: string; names?: { dark: string; light: string }; note: string; dark: WsThemeHalf; light: WsThemeHalf }
export const BAR_THEMES: WsBarTheme[] = [
	{
		// EVERY VALUE BELOW IS UPSTREAM'S, from Protesilaos Stavrou's own
		// published palette (protesilaos.com/emacs/modus-themes-colors,
		// released CC0). The mapping is the interesting part, because the
		// Modus palettes name the exact roles this table needs:
		//
		//   b1-b4  bg-main, bg-dim, bg-inactive, border
		//   t1/t3  fg-main, fg-dim
		//   t4     accent-0
		//   sel    bg-region     bar  bg-mode-line-active
		//   c1     bg-completion — the surface a chosen candidate wears,
		//          which is what our selected-file slot IS
		//   c4/c7  bg-added / bg-removed, NOT green/red by name: that pair
		//          is where each variant states its own semantics, and on
		//          the colour-vision variants it is deliberately not
		//          red-and-green. Deuteranopia adds in blue and removes in
		//          yellow; tritanopia adds in cyan and removes in red. Our
		//          slots follow the MEANING rather than the hue, so those
		//          variants stay legible to the eyes they were built for.
		//   c5/c6  bg-yellow-subtle, bg-magenta-subtle
		//
		// Guessed approximations sat here until the palette was fetched.
		id: 'modus', name: 'Modus',
		names: { dark: 'Modus Vivendi', light: 'Modus Operandi' },
		note: 'Protesilaos Stavrou \u2014 his own published palette',
		dark:  { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
		         c1: '#2f447f', c2: '#1e1e1e', c3: '#000000', c4: '#00422a',
		         c5: '#4a4000', c6: '#552f5f', c7: '#620f2a',
		         t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#00bcff',
		         sel: '#5a5a5a', bar: '#505050', cur: '#ffffff' },
		light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
		         c1: '#c0deff', c2: '#f2f2f2', c3: '#ffffff', c4: '#b3fabf',
		         c5: '#fff576', c6: '#ffddff', c7: '#ffcfbf',
		         t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#0031a9',
		         sel: '#bdbdbd', bar: '#c8c8c8', cur: '#000000' }
	},

	{
		// EVERY VALUE FROM vim's own quiet.vim, both backgrounds. The papers
		// were approximations before and both were wrong in the direction
		// that matters most: quiet's dark half is PURE BLACK (#000000) and
		// its light half is a definite GREY (#d7d7d7), not the near-white
		// this table had. A monochrome scheme is nothing but its greys, so
		// getting the paper approximately right is getting it wrong.
		//
		// Its accents are the three colours quiet allows itself, and each
		// is a REVERSE pairing, so the rendered surface is the guifg:
		// Visual is orange (#ffaf00), Search blue (#00afff), Todo mint
		// (#00ffaf). They live in the accent slots; the ramp stays grey,
		// which is why the Vim modes still come out as shades of grey.
		id: 'quiet', name: 'Quiet',
		note: 'vim\u2019s own quiet \u2014 monochrome by design, three colors allowed',
		dark:  { b1: '#000000', b2: '#1c1c1c', b3: '#303030', b4: '#585858',
		         c1: '#a8a8a8', c2: '#1c1c1c', c3: '#000000', c4: '#303030',
		         c5: '#3a3a3a', c6: '#444444', c7: '#4e4e4e',
		         t1: '#dadada', t2: '#000000', t3: '#a8a8a8', t4: '#dadada',
		         sel: '#ffaf00', bar: '#dadada' },
		light: { b1: '#d7d7d7', b2: '#cccccc', b3: '#e4e4e4', b4: '#a8a8a8',
		         // Seven steps of quiet's own grey ladder, each distinct:
		         // on a monochrome scheme the ladder IS the palette, so two
		         // slots landing on one value costs a whole accent.
		         c1: '#9e9e9e', c2: '#cccccc', c3: '#d7d7d7', c4: '#c8c8c8',
		         c5: '#bcbcbc', c6: '#b4b4b4', c7: '#a8a8a8',
		         t1: '#000000', t2: '#d7d7d7', t3: '#626262', t4: '#000000',
		         sel: '#ffaf00', bar: '#000000' }
	},

	{
		id: 'habamax', name: 'Habamax',
		note: 'Vim\u2019s habamax \u2014 muted, warm-neutral',
		dark:  { b1: '#1c1c1c', b2: '#262626',
		         b3: '#303030', b4: '#3a3a3a',
		         c1: '#004f71', c2: '#303030', c3: '#1c1c1c', c4: '#005454',
		         c5: '#634500', c6: '#484867', c7: '#870000',
		         t1: '#bcbcbc', t2: '#1c1c1c', t3: '#808080', t4: '#87afaf', sel: '#454545', bar: '#9e9e9e' },
		light: { b1: '#ffffff', b2: '#f0f0f0',
		         b3: '#e4e4e4', b4: '#d0d0d0',
		         c1: '#cfe4f0', c2: '#e4e4e4', c3: '#f2f2f2', c4: '#d0ecdc',
		         c5: '#f0e2c0', c6: '#ddd8f0', c7: '#f4d0d0',
		         t1: '#262626', t2: '#ffffff', t3: '#626262', t4: '#005f87', sel: '#c6c6c6' }
	},
	{
		id: 'nord', name: 'Nord',
		note: 'Arctic Ice Studio \u2014 polar night and snow storm',
		dark:  { b1: '#2e3440', b2: '#3b4252',
		         b3: '#434c5e', b4: '#4c566a',
		         c1: '#4c6a91', c2: '#3b4252', c3: '#2e3440', c4: '#3f6650',
		         c5: '#7a5f34', c6: '#6b5470', c7: '#8f4148',
		         t1: '#eceff4', t2: '#2e3440', t3: '#9aa4b6', t4: '#88c0d0', sel: '#434c5e', bar: '#4c566a' },
		light: { b1: '#eceff4', b2: '#e5e9f0',
		         b3: '#d8dee9', b4: '#c8d0dc',
		         c1: '#c5d4e8', c2: '#d8dee9', c3: '#eceff4', c4: '#cfe0c8',
		         c5: '#f0e2bd', c6: '#e2d3e5', c7: '#f0cdd0',
		         t1: '#2e3440', t2: '#eceff4', t3: '#5c6779', t4: '#5e81ac', sel: '#d8dee9', bar: '#d8dee9' }
	},
	{
		// The light half's mode line stays DERIVED: Alucard's open-source
		// release ships no editor port yet (the request is an open issue
		// on dracula/visual-studio-code), so there is no upstream value
		// to take.
		id: 'dracula', name: 'Dracula',
		note: 'Zeno Rocha\u2019s Dracula, with Alucard for the light half',
		dark:  { b1: '#282a36', b2: '#343746',
		         b3: '#44475a', b4: '#565a72',
		         c1: '#4a3f7a', c2: '#44475a', c3: '#282a36', c4: '#2f6b46',
		         c5: '#7a6a2a', c6: '#6b3f6b', c7: '#8b3a3a',
		         t1: '#f8f8f2', t2: '#282a36', t3: '#a0a3b8', t4: '#bd93f9', sel: '#44475a', bar: '#44475a' },
		light: { b1: '#f8f8f2', b2: '#eeeef0',
		         b3: '#e0e0e6', b4: '#cfcfd8',
		         c1: '#d9d0f5', c2: '#e8e8e2', c3: '#f8f8f2', c4: '#cdeed8',
		         c5: '#f2eec4', c6: '#f5d5e8', c7: '#f7cfcf',
		         t1: '#1f1f1f', t2: '#f8f8f2', t3: '#6c6c6c', t4: '#644ac9', sel: '#d8d0e8' }
	},
	{
		id: 'gruvbox', name: 'Gruvbox',
		note: 'Pavel Pertsev \u2014 retro groove, hard contrast',
		dark:  { b1: '#282828', b2: '#32302f',
		         b3: '#3c3836', b4: '#504945',
		         c1: '#376769', c2: '#504945', c3: '#282828', c4: '#65610c',
		         c5: '#825700', c6: '#8f3f71', c7: '#9d0006',
		         t1: '#ebdbb2', t2: '#282828', t3: '#a89984', t4: '#83a598', sel: '#504945', bar: '#504945' },
		light: { b1: '#fbf1c7', b2: '#f2e5bc',
		         b3: '#ebdbb2', b4: '#d5c4a1',
		         c1: '#cfe0dd', c2: '#ebdbb2', c3: '#fbf1c7', c4: '#d5e6c0',
		         c5: '#f2e0b0', c6: '#ecd5e4', c7: '#f5d2c8',
		         t1: '#3c3836', t2: '#fbf1c7', t3: '#7c6f64', t4: '#076678', sel: '#d5c4a1', bar: '#d5c4a1' }
	},
	{
		id: 'solarized', name: 'Solarized',
		note: 'Ethan Schoonover \u2014 the light and dark halves are his own pairing',
		dark:  { b1: '#002b36', b2: '#073642',
		         b3: '#0a4653', b4: '#125666',
		         c1: '#196ba3', c2: '#073642', c3: '#002b36', c4: '#5a6a00',
		         c5: '#7a5c00', c6: '#94275e', c7: '#99231f',
		         t1: '#eee8d5', t2: '#002b36', t3: '#93a1a1', t4: '#2aa198', sel: '#073642', bar: '#839496' },
		light: { b1: '#fdf6e3', b2: '#f5eed6',
		         b3: '#eee8d5', b4: '#ded8c5',
		         c1: '#cfe2f0', c2: '#eee8d5', c3: '#fdf6e3', c4: '#dfe8c0',
		         c5: '#f2e4bb', c6: '#f5d3e2', c7: '#f7d2cf',
		         t1: '#073642', t2: '#fdf6e3', t3: '#657b83', t4: '#268bd2', sel: '#eee8d5', bar: '#073642' }
	},
	{
		id: 'catppuccin', name: 'Catppuccin',
		note: 'the Catppuccin community \u2014 Mocha dark, Latte light',
		dark:  { b1: '#1e1e2e', b2: '#181825',
		         b3: '#313244', b4: '#45475a',
		         c1: '#3e5a8f', c2: '#313244', c3: '#1e1e2e', c4: '#39654d',
		         c5: '#795433', c6: '#6b4a8f', c7: '#8f3f55',
		         t1: '#cdd6f4', t2: '#1e1e2e', t3: '#9399b2', t4: '#89b4fa', sel: '#585b70', bar: '#181825' },
		light: { b1: '#eff1f5', b2: '#e6e9ef',
		         b3: '#dce0e8', b4: '#ccd0da',
		         c1: '#cfdcf7', c2: '#dce0e8', c3: '#eff1f5', c4: '#d3ecd0',
		         c5: '#f5ddc8', c6: '#e6d5f7', c7: '#f7d3dc',
		         t1: '#4c4f69', t2: '#eff1f5', t3: '#6c6f85', t4: '#1e66f5', sel: '#ccd0da', bar: '#e6e9ef' }
	},
	{
		id: 'tokyonight', name: 'Tokyo Night / Day',
		names: { dark: 'Tokyo Night', light: 'Tokyo Day' },
		note: 'enkia \u2014 Night when your mode is dark, Day when it is light',
		dark:  { b1: '#1a1b26', b2: '#16161e',
		         b3: '#24283b', b4: '#2f334d',
		         c1: '#385295', c2: '#292e42', c3: '#1a1b26', c4: '#3e5d37',
		         c5: '#6a5128', c6: '#5a4380', c7: '#8a3a4a',
		         t1: '#c0caf5', t2: '#1a1b26', t3: '#787c99', t4: '#7aa2f7', sel: '#33467c', bar: '#16161e' },
		light: { b1: '#e1e2e7', b2: '#d5d6db',
		         b3: '#c8c9ce', b4: '#b6b7bd',
		         c1: '#ccd6f5', c2: '#d8dae5', c3: '#e9e9ec', c4: '#d3e8c8',
		         c5: '#f2e2c0', c6: '#e0d5f5', c7: '#f5d0d8',
		         t1: '#33374c', t2: '#e9e9ec', t3: '#5a6699', t4: '#2e7de9', sel: '#b7c1e3', bar: '#cfd5e3' }
	},
	{
		id: 'rosepine', name: 'Ros\u00e9 Pine',
		note: 'the Ros\u00e9 Pine team \u2014 Moon dark, Dawn light',
		dark:  { b1: '#232136', b2: '#2a273f',
		         b3: '#393552', b4: '#44415a',
		         c1: '#2d6a85', c2: '#2a273f', c3: '#232136', c4: '#3a5f54',
		         c5: '#795c32', c6: '#5f4580', c7: '#8a4155',
		         t1: '#e0def4', t2: '#232136', t3: '#908caa', t4: '#9ccfd8', sel: '#403d52', bar: '#393552' },
		light: { b1: '#faf4ed', b2: '#fffaf3',
		         b3: '#f2e9e1', b4: '#e4dcd4',
		         c1: '#cfe2ea', c2: '#f2e9e1', c3: '#faf4ed', c4: '#d5e8dd',
		         c5: '#f5e2c2', c6: '#e5d8f0', c7: '#f7d5dd',
		         t1: '#575279', t2: '#faf4ed', t3: '#797593', t4: '#286983', sel: '#dfdad9', bar: '#f2e9e1' }
	},
	{
		id: 'modus-tinted', name: 'Modus Tinted',
		names: { dark: 'Modus Vivendi Tinted', light: 'Modus Operandi Tinted' },
		note: 'the tinted pair \u2014 warm paper by day, deep indigo night',
		dark:  { b1: '#0d0e1c', b2: '#1d2235', b3: '#2b3045', b4: '#61647a',
		         c1: '#483d8a', c2: '#1d2235', c3: '#0d0e1c', c4: '#00422a',
		         c5: '#4a4000', c6: '#552f5f', c7: '#620f2a',
		         t1: '#ffffff', t2: '#0d0e1c', t3: '#989898', t4: '#b6a0ff',
		         sel: '#555a66', bar: '#484d67', cur: '#ff66ff' },
		// c1 IS UPSTREAM'S bg-completion, as the rest of the family reads it.
		// A dark grey (fg-dim, the scheme's t3) carries white ink at 4.5:1, so
		// the selected-file rule would take it for the nav surface and every
		// selected note would go charcoal on paper.
		light: { b1: '#fbf7f0', b2: '#efe9dd', b3: '#dfd5cf', b4: '#9f9690',
		         c1: '#f0c1cf', c2: '#efe9dd', c3: '#fbf7f0', c4: '#b3fabf',
		         c5: '#fff576', c6: '#ffddff', c7: '#ffcfbf',
		         t1: '#000000', t2: '#fbf7f0', t3: '#595959', t4: '#a0132f',
		         sel: '#c2bcb5', bar: '#cab9b2', cur: '#d00000' }
	},

	{
		// c4/c7 are bg-added/bg-removed, which upstream puts on the
		// blue\u2013yellow axis here. Copying green and red into those slots
		// would have undone the entire point of the variant.
		id: 'modus-deuteranopia', name: 'Modus Deuteranopia',
		names: { dark: 'Modus Vivendi Deuteranopia', light: 'Modus Operandi Deuteranopia' },
		note: 'red\u2013green\u2013safe: it adds in blue and removes in yellow',
		dark:  { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
		         c1: '#2f447f', c2: '#1e1e1e', c3: '#000000', c4: '#003066',
		         c5: '#4a4000', c6: '#552f5f', c7: '#3d3d00',
		         t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#79a8ff',
		         sel: '#5a5a5a', bar: '#2a2a6a', cur: '#efef00' },
		light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
		         c1: '#c0deff', c2: '#f2f2f2', c3: '#ffffff', c4: '#d5d7ff',
		         c5: '#fff576', c6: '#ffddff', c7: '#f4f099',
		         t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#3548cf',
		         sel: '#bdbdbd', bar: '#d0d6ff', cur: '#0000ff' }
	},

	{
		// c4/c7 are bg-added/bg-removed on the red\u2013cyan axis, upstream's
		// own answer for this deficiency.
		id: 'modus-tritanopia', name: 'Modus Tritanopia',
		names: { dark: 'Modus Vivendi Tritanopia', light: 'Modus Operandi Tritanopia' },
		note: 'blue\u2013yellow\u2013safe: it adds in cyan and removes in red',
		dark:  { b1: '#000000', b2: '#1e1e1e', b3: '#303030', b4: '#646464',
		         c1: '#004253', c2: '#1e1e1e', c3: '#000000', c4: '#004254',
		         c5: '#4a4000', c6: '#552f5f', c7: '#4f1119',
		         t1: '#ffffff', t2: '#000000', t3: '#989898', t4: '#00d3d0',
		         sel: '#5a5a5a', bar: '#003c52', cur: '#ff5f5f' },
		light: { b1: '#ffffff', b2: '#f2f2f2', b3: '#e0e0e0', b4: '#9f9f9f',
		         c1: '#afdfef', c2: '#f2f2f2', c3: '#ffffff', c4: '#b5e7ff',
		         c5: '#fff576', c6: '#ffddff', c7: '#ffd8d5',
		         t1: '#000000', t2: '#ffffff', t3: '#595959', t4: '#005e8b',
		         sel: '#bdbdbd', bar: '#afe0f2', cur: '#d00000' }
	},

	{
		// The dark half is Monokai; the light half is OUR adaptation of it
		// onto paper \u2014 upstream never shipped one, and a survived dark
		// palette on white is worse than a designed light one.
		//
		// The mode line: the TextMate original names none \u2014 a TextMate
		// scheme colours text, not chrome \u2014 so the value is the canonical
		// Emacs port's (oneKelvinSmith/monokai-emacs, mode-line background
		// = monokai-highlight #49483E), which is Monokai's own selection
		// grey and so still Wimer's colour, worn where Emacs wears it.
		// The light half stays derived: no upstream light Monokai exists
		// to name one.
		id: 'monokai', name: 'Monokai',
		note: 'Wimer Hazenberg \u2014 the classic; light half is our adaptation',
		dark:  { b1: '#272822', b2: '#3e3d32', b3: '#49483e', b4: '#75715e',
		         c1: '#66d9ef', c2: '#3e3d32', c3: '#272822', c4: '#375a2e',
		         c5: '#7a5a1e', c6: '#6f5c9c', c7: '#8f2f3f',
		         t1: '#f8f8f2', t2: '#272822', t3: '#a59f85', t4: '#a6e22e', sel: '#49483e', bar: '#49483e' },
		light: { b1: '#fafafa', b2: '#f0f0ee', b3: '#e6e6e2', b4: '#d0d0c8',
		         c1: '#cdeef5', c2: '#f0f0ee', c3: '#fafafa', c4: '#dcedc8',
		         c5: '#fde3b3', c6: '#e6dcf5', c7: '#f8ccd4',
		         t1: '#272822', t2: '#fafafa', t3: '#75715e', t4: '#f92672', sel: '#d8d8d0' }
	},
	{
		// One Light names no StatusLine of its own — onedark.vim ships the
		// dark half only — so its bar is OURS, one step off the paper,
		// like every scheme that names none.
		id: 'onedark', name: 'One Dark / Light',
		names: { dark: 'One Dark', light: 'One Light' },
		note: 'Atom\u2019s pair \u2014 One Dark when dark, One Light when light',
		dark:  { b1: '#282c34', b2: '#2c313a', b3: '#333842', b4: '#3e4451',
		         c1: '#61afef', c2: '#2c313a', c3: '#282c34', c4: '#3e6845',
		         c5: '#7a5c26', c6: '#7e5f9e', c7: '#8f3a44',
		         t1: '#abb2bf', t2: '#282c34', t3: '#7f848e', t4: '#61afef', sel: '#3e4451', bar: '#2c323c' },
		light: { b1: '#fafafa', b2: '#f0f0f1', b3: '#e5e5e6', b4: '#d3d3d4',
		         c1: '#cfe5fb', c2: '#f0f0f1', c3: '#fafafa', c4: '#d6e9cc',
		         c5: '#f5e3bd', c6: '#e6d9f2', c7: '#f6d0d4',
		         t1: '#383a42', t2: '#fafafa', t3: '#696c77', t4: '#4078f2', sel: '#d0d4da', bar: '#e5e5e6' }
	},
	{
		id: 'nightfox', name: 'Nightfox / Dayfox',
		names: { dark: 'Nightfox', light: 'Dayfox' },
		note: 'EdenEast \u2014 Nightfox when dark, Dayfox when light',
		dark:  { b1: '#192330', b2: '#212e3f', b3: '#29394f', b4: '#39506d',
		         c1: '#2e4372', c2: '#212e3f', c3: '#192330', c4: '#2b4a3c',
		         c5: '#574a27', c6: '#4a3a63', c7: '#5c2f39',
		         t1: '#cdcecf', t2: '#192330', t3: '#738091', t4: '#86abdc', sel: '#2b3b51', bar: '#131a24' },
		light: { b1: '#f6f2ee', b2: '#efe9e3', b3: '#e7e0d9', b4: '#d6cfc7',
		         c1: '#ccd7ee', c2: '#efe9e3', c3: '#f6f2ee', c4: '#cfe0ce',
		         c5: '#ecdcb8', c6: '#ded2ec', c7: '#f0cdd2',
		         t1: '#352c24', t2: '#f6f2ee', t3: '#766f68', t4: '#2848a9', sel: '#e2d9cd', bar: '#e4dcd4' }
	},
	{
		// Wave for the dark half, Lotus for the light — the upstream ink
		// pairing on Lotus paper sits at 6.25:1, past AA and short of AAA; a
		// measured exception in the theme test, like Rosé Pine Dawn.
		id: 'kanagawa', name: 'Kanagawa',
		names: { dark: 'Kanagawa Wave', light: 'Kanagawa Lotus' },
		note: 'rebelot \u2014 Wave by night, Lotus by day',
		dark:  { b1: '#1f1f28', b2: '#2a2a37', b3: '#363646', b4: '#54546d',
		         c1: '#2d4f67', c2: '#2a2a37', c3: '#1f1f28', c4: '#33473d',
		         c5: '#5a4a2d', c6: '#453a62', c7: '#692f36',
		         t1: '#dcd7ba', t2: '#1f1f28', t3: '#727169', t4: '#7e9cd8', sel: '#2d4f67', bar: '#16161d' },
		light: { b1: '#f2ecbc', b2: '#eae3ae', b3: '#e0d7a0', b4: '#b8b092',
		         c1: '#cbd8e6', c2: '#eae3ae', c3: '#f2ecbc', c4: '#d2dcae',
		         c5: '#ecd39a', c6: '#d8cadf', c7: '#ecc2c5',
		         t1: '#545464', t2: '#f2ecbc', t3: '#716e61', t4: '#4d699b', sel: '#c9d5de', bar: '#dcd5ac' }
	},
	{
		// GITHUB NAMES A MODE LINE AND IT IS THE PAGE. Primer's own
		// github-vscode-theme sets statusBar.background to color.bg.canvas
		// — the editor surface itself — and a maintainer confirms the
		// theme deliberately has no distinct status colour. A strip equal
		// to the page is the one thing this table's invariant refuses
		// (“the strip is not the page”), and the popular Neovim port's
		// blue strip is that port's computed invention, not Primer's. So
		// GitHub derives, like every scheme that names none.
		id: 'github', name: 'GitHub',
		note: 'Primer \u2014 the dark and light you read pull requests in',
		dark:  { b1: '#0d1117', b2: '#161b22', b3: '#21262d', b4: '#30363d',
		         c1: '#1c3b63', c2: '#161b22', c3: '#0d1117', c4: '#1f4529',
		         c5: '#544000', c6: '#3c2d69', c7: '#67232b',
		         t1: '#e6edf3', t2: '#0d1117', t3: '#8b949e', t4: '#4493f8', sel: '#264f78' },
		light: { b1: '#ffffff', b2: '#f6f8fa', b3: '#eaeef2', b4: '#d0d7de',
		         c1: '#cfe4fb', c2: '#f6f8fa', c3: '#ffffff', c4: '#c9edd0',
		         c5: '#f3e29c', c6: '#e3d3f5', c7: '#f8cfcf',
		         t1: '#1f2328', t2: '#ffffff', t3: '#656d76', t4: '#0969da', sel: '#b6d9f8' }
	},
	{
		// The light half needed two ADAPTATIONS to be usable as an interface:
		// upstream's muted grey (#939f91) and green accent (#8da101) both sit
		// under 3:1 on the paper, so the muted ink is darkened to #7a877e and
		// the accent to #6c8a00 \u2014 the same hue, deep enough to read. The
		// body-ink pairing itself (#5c6a72 on #fdf6e3, 5.16:1) is upstream's
		// own and is carried as a named exception rather than re-inked.
		id: 'everforest', name: 'Everforest',
		note: 'sainnhe \u2014 the forest floor, by night and by day',
		dark:  { b1: '#2d353b', b2: '#343f44', b3: '#3d484d', b4: '#475258',
		         c1: '#384b55', c2: '#343f44', c3: '#2d353b', c4: '#425047',
		         c5: '#514d44', c6: '#4a3f55', c7: '#563a3f',
		         t1: '#d3c6aa', t2: '#2d353b', t3: '#859289', t4: '#a7c080', sel: '#543a48', bar: '#343f44' },
		light: { b1: '#fdf6e3', b2: '#f4f0d9', b3: '#efebd4', b4: '#d8d3ba',
		         c1: '#d6e5dc', c2: '#f4f0d9', c3: '#fdf6e3', c4: '#d1e0c2',
		         c5: '#eee0b2', c6: '#e2d8e4', c7: '#f2d5d0',
		         t1: '#5c6a72', t2: '#fdf6e3', t3: '#7a877e', t4: '#6c8a00', sel: '#f0f1d2', bar: '#f2efdf' }
	},
	{
		// Vim ships TWO stock blue schemes and this pair is BOTH of them,
		// verbatim: blue.vim (white on #000087, yellow Statements) by day,
		// darkblue.vim (#c0c0c0 on #000040) by night. The day face is a
		// DARK palette in the light slot, which every other scheme on this
		// shelf would be wrong to do — and this one is right to, because
		// blue.vim's whole identity is that navy.
		//
		// Everything Word-Smith colours for itself picks a dark or a light
		// variant, and choosing by the APP's mode would, in light mode, paint
		// dark inks onto navy. See isDarkSurface, which is the general rule:
		// the plugin's own colours follow the PAPER, the pair's half still
		// follows the app.
		//
		// The theme test carries this as the one NAMED exception to "a light
		// half is light", beside the measured contrast exceptions. An
		// exception with a reason and a test is a decision; an exception
		// without one is a bug nobody noticed.
		id: 'vimblue', name: 'Vim Blue / Darkblue',
		names: { dark: 'Vim Darkblue', light: 'Vim Blue' },
		note: ':colorscheme blue by day, darkblue by night \u2014 both as Vim ships them',
		dark:  { b1: '#000040', b2: '#000058', b3: '#10106e', b4: '#30309a',
		         c1: '#2a2a9e', c2: '#000058', c3: '#000040', c4: '#0f6b45',
		         c5: '#6b6b10', c6: '#4b2d9e', c7: '#8b1a3a',
		         t1: '#c0c0c0', t2: '#000040', t3: '#8080c0', t4: '#ffff60',
		         // The same cyan as the day face (the reference shows both windows
		         // wearing it); a darker cyan measures 4.48 against this half's ink,
		         // under the floor.
		         sel: '#2e3f9e', bar: '#00afaf' },
		light: { b1: '#000087', b2: '#1c1c99', b3: '#2e2eab', b4: '#5555c4',
		         // c1 is blue.vim's CursorLine — the vivid blue band the
		         // reference shows under the cursor — so the selected file
		         // and the selection wear the colour the scheme uses to say
		         // "here".
		         c1: '#2222dd', c2: '#1c1c99', c3: '#000087', c4: '#0f6b52',
		         c5: '#6b6b00', c6: '#4b2d9e', c7: '#8b1a3a',
		         // t3 is Comment's pale blue; t4 is Statement's yellow, which
		         // is also what the caret takes.
		         t1: '#ffffff', t2: '#000087', t3: '#87afd7', t4: '#ffff00',
		         sel: '#2222dd', bar: '#00afaf' }
	},
	{
		// Steph Ango's — the author of Minimal, and designed light-first
		// with a dark twin rather than the other way round, which is why
		// both halves are upstream's own.
		//
		// The mode line: the spec names no status role and the Obsidian
		// theme sets none, but the OFFICIAL Neovim port — kepano/
		// flexoki-neovim, the one the Flexoki README links — does:
		// `StatusLine = { fg = tx, bg = ui-3 }`. ui-3 is flexoki-800
		// (#403E3C) on the dark half and flexoki-200 (#CECDC3) on the
		// light — spec colours, worn where Neovim wears them.
		id: 'flexoki', name: 'Flexoki',
		note: 'Steph Ango \u2014 an inky palette for prose, both halves his',
		dark:  { b1: '#100f0f', b2: '#1c1b1a', b3: '#282726', b4: '#343331',
		         c1: '#21344f', c2: '#1c1b1a', c3: '#100f0f', c4: '#2b3a1e',
		         c5: '#4a3a12', c6: '#362c52', c7: '#4d2220',
		         t1: '#cecdc3', t2: '#100f0f', t3: '#878580', t4: '#4385be', sel: '#282726', bar: '#403e3c' },
		light: { b1: '#fffcf0', b2: '#f2f0e5', b3: '#e6e4d9', b4: '#dad8ce',
		         c1: '#d3e3f7', c2: '#f2f0e5', c3: '#fffcf0', c4: '#dbe6c4',
		         c5: '#f2e2b0', c6: '#e2d6f0', c7: '#f6d2cd',
		         t1: '#100f0f', t2: '#fffcf0', t3: '#6f6e69', t4: '#205ea6', sel: '#e6e4d9', bar: '#cecdc3' }
	},
	{
		// Jan Warcho\u0142's Solarized successor: the same idea \u2014 one pair,
		// tuned together \u2014 with the contrast complaint answered.
		//
		// The mode line is UPSTREAM'S OWN vim port (editors/vim in
		// jan-warchol/selenized): `StatusLine gui=reverse` with both
		// halves NONE, so the RENDERED strip is Normal inverted \u2014 the
		// body ink as the surface, the paper as the text. Read as
		// rendered, exactly as the other reverse schemes in this table
		// are: dark wears fg_0 #adbcbc, light wears fg_0 #53676d, and
		// each carries an ink well past the floor (6.07 and 5.37).
		id: 'selenized', name: 'Selenized',
		note: 'Jan Warcho\u0142 \u2014 Solarized rebuilt, both halves tuned together',
		dark:  { b1: '#103c48', b2: '#184956', b3: '#1c5460', b4: '#2d5b69',
		         c1: '#17455a', c2: '#184956', c3: '#103c48', c4: '#1c4a35',
		         c5: '#4a4520', c6: '#3f3560', c7: '#5c2330',
		         // fg_1, not fg_0: Selenized ships both, and the brighter one
		         // is what clears AAA on its own paper and carries an ink on
		         // its own selection. fg_0 becomes the muted ink, which is
		         // what it reads as anyway.
		         t1: '#cad8d9', t2: '#103c48', t3: '#adbcbc', t4: '#4695f7', sel: '#184956', bar: '#adbcbc' },
		light: { b1: '#fbf3db', b2: '#ece3cc', b3: '#e0d7bf', b4: '#c3bba4',
		         c1: '#cddef2', c2: '#ece3cc', c3: '#fbf3db', c4: '#d7e6c4',
		         c5: '#f0e0a8', c6: '#ecd4e6', c7: '#f8cfc9',
		         t1: '#3a4d53', t2: '#fbf3db', t3: '#53676d', t4: '#0072d4', sel: '#e0d7bf', bar: '#53676d' }
	},
	{
		// ICEBERG NAMES A MODE LINE AND DOES NOT GET ONE. Its StatusLine is
		// `reverse`, so the rendered strip is #757ca3 on the light half — a
		// mid slate that carries neither of this scheme's inks at 4.5:1
		// (3.35 at best, which is what upstream itself puts there). A
		// terminal statusline can live at that contrast; a strip we promise
		// is legible cannot. It derives instead, and the dark half keeps
		// its published colour, which does clear the floor.
		id: 'iceberg', name: 'Iceberg',
		note: 'cocopon \u2014 a bluish, low-glare pair from Vim',
		dark:  { b1: '#161821', b2: '#1e2132', b3: '#272c42', b4: '#3d425b',
		         c1: '#2a3a5c', c2: '#1e2132', c3: '#161821', c4: '#2c4030',
		         c5: '#4a3a24', c6: '#3a3352', c7: '#4d2833',
		         t1: '#c6c8d1', t2: '#161821', t3: '#6b7089', t4: '#84a0c6', sel: '#272c42', bar: '#818596' },
		light: { b1: '#e8e9ec', b2: '#dcdfe7', b3: '#cad0de', b4: '#a7adba',
		         c1: '#c3d0e8', c2: '#dcdfe7', c3: '#e8e9ec', c4: '#cfe0c0',
		         c5: '#f0dcc0', c6: '#ded4ee', c7: '#f2ccd6',
		         t1: '#33374c', t2: '#e8e9ec', t3: '#7b8296', t4: '#2d539e', sel: '#cad0de' }
	},
	{
		id: 'papercolor', name: 'PaperColor',
		note: 'NLKNguyen \u2014 Material-ish, and light-first by design',
		dark:  { b1: '#1c1c1c', b2: '#262626', b3: '#303030', b4: '#444444',
		         c1: '#1f3a4a', c2: '#262626', c3: '#1c1c1c', c4: '#2b3a1a',
		         c5: '#4a4400', c6: '#3a2a4a', c7: '#4a1010',
		         t1: '#d0d0d0', t2: '#1c1c1c', t3: '#8a8a8a', t4: '#5fafd7', sel: '#303030', bar: '#5f8787' },
		light: { b1: '#eeeeee', b2: '#e4e4e4', b3: '#d0d0d0', b4: '#bcbcbc',
		         c1: '#c6e2ee', c2: '#e4e4e4', c3: '#eeeeee', c4: '#cde8c0',
		         c5: '#f0e4b0', c6: '#e2d0ee', c7: '#f4cccc',
		         t1: '#444444', t2: '#eeeeee', t3: '#767676', t4: '#0087af', sel: '#d0d0d0', bar: '#005f87' }
	},
	{
		// The light half's accent is OURS: upstream's orange (#fa8d3e)
		// measures 2.4:1 on that paper and would fail the accent gate, so
		// it is deepened to the same hue at 3.8:1. Same treatment, same
		// disclosure, as Everforest's.
		id: 'ayu', name: 'Ayu',
		note: 'ayu \u2014 warm accents on cool ground; light accent deepened by us',
		dark:  { b1: '#0b0e14', b2: '#131721', b3: '#1b1f2b', b4: '#2d3542',
		         c1: '#1e3a52', c2: '#131721', c3: '#0b0e14', c4: '#1c3a26',
		         c5: '#4a3c14', c6: '#33294a', c7: '#4a1f24',
		         t1: '#bfbdb6', t2: '#0b0e14', t3: '#6c7380', t4: '#e6b450', sel: '#253a5e', bar: '#14191f' },
		light: { b1: '#fcfcfc', b2: '#f3f4f5', b3: '#e7e8e9', b4: '#d3d4d5',
		         c1: '#cfe3f7', c2: '#f3f4f5', c3: '#fcfcfc', c4: '#d6e8c6',
		         c5: '#f7e3b0', c6: '#e4d8f2', c7: '#f8d0cc',
		         t1: '#5c6166', t2: '#fcfcfc', t3: '#8a8f98', t4: '#d1650a', sel: '#e7e8e9',
		         // statusBar.background from ayu-theme's own vscode-ayu
		         // (ayu-light.json) — the panel shade, one visible step off
		         // the page. The ink is measured as ever; upstream's own
		         // #8a9199 sits under the floor and is not taken.
		         bar: '#f8f9fa' }
	},
];

// Powerline separator shapes, chosen per boundary by the character used to
// divide the row. The divider you type IS the shape:
//
//   >   arrow        )   rounded
//   |   straight     /   angle, cutting up to the right
//                    \   angle, cutting down to the right
//
// A backslash immediately followed by one of these is an escape, so \| is a
// literal pipe and a lone \ between spaces is still a divider.
export const PL_DIVIDERS: Record<string, string> = { '>': 'arrow', '<': 'arrow', '|': 'straight',
	')': 'round', '(': 'round', '~': 'wave', '/': 'angleF', '\\': 'angleB' };

// Two dividers carry a DIRECTION as well as a shape. Between segments the
// direction is dictated by which way the group runs, so it is ignored there;
// at the two ends there is nothing dictating it, and this is what lets a row
// open with an arrow pointing out of the bar or into it. `<{file}` starts
// with a left-pointing point, `>{file}` with a right-pointing one.
export const PL_DIR: Record<string, string> = { '<': 'left', '>': 'right', '(': 'left', ')': 'right' };
