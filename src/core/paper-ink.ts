// ── PAPER AND INK (GitHub #105, A901) ─────────────────────────────────────────────────────────────────────────────
//
// The issue: "a background that looks like old, textured paper … a few options"; the writer: "a drop down effect with
// multiple variants", "the paper effect subtle, really subtle", "i want the sliders too", then "think more on these
// paper and ink effects to make them premium". A PAPER is a texture under the note's text, an INK an effect on it,
// each at a strength. Both are SVG filters drawn into tiles (data URLs), built here at the strength set (a stylesheet
// cannot scale an image's alpha), for a light note and for a dark one: the stylesheet picks one by the theme's class.
//
// PAPER IS RELIEF, NOT SPECKS. A height map of noise is lit from the upper left (feDiffuseLighting), so the tooth
// reads as raised fibers, and slow noise mottles it as a sheet's fibers settle unevenly. Both come out as a grey
// around a flat 0.5, split into a black layer for what falls below it and a white one for what rises above, so any
// theme's color stays the paper's own (a blend mode would do nothing on Obsidian's pure white: soft-light and
// overlay leave white white). The noise is tiled AROUND the tile (feTile) before it is lit, so the light at an edge
// sees the next tile's relief and the tiles join without a seam (measured: rectangles on the first Parchment).
// INK IS DENSITY, NOT HOLES. A mask that varies smoothly (the paper's tooth taking the ink, a pen's flow, a ribbon's
// wear, a worn plate), a rim where ink pools, a feather where it spreads, a pressed edge, an aged tint. Plain CSS on
// the text, the mask composited: a keystroke repaints no more than it did.

export const WS_PAPER_TEXTURES = ['grain', 'laid', 'cotton', 'linen', 'parchment', 'newsprint', 'watercolor'];
export const WS_INK_EFFECTS = ['grain', 'inkwell', 'bleed', 'typewriter', 'letterpress', 'worn', 'faded'];
// the custom properties they are written into, on body; the stylesheet reads them (styles.css, PAPER AND INK)
export const WS_PAPER_INK_VARS = ['--ws-paper-img-light', '--ws-paper-img-dark', '--ws-paper-size', '--ws-paper-attach',
	'--ws-ink-mask', '--ws-ink-mask-size', '--ws-ink-shadow-light', '--ws-ink-shadow-dark', '--ws-ink-stroke-light', '--ws-ink-stroke-dark',
	'--ws-ink-filter', '--ws-ink-opacity'];

export interface WsPaperCss { img: string; size: string; attach: string }
export interface WsInkCss { mask: string; maskSize: string; shadow: string; stroke: string; filter: string; opacity: string }

const wsN = (n: number) => String(+n.toFixed(3));
const wsSvgUrl = (svg: string) => 'url("data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29') + '")';
// a tile: its filter's region reaches a quarter past each edge, in sRGB (in linearRGB a grey of 0.5 would come out
// as 0.735 and lighten every note)
const wsTile = (size: number, body: string) => wsSvgUrl('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">'
	+ '<filter id="p" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' + body
	+ '</filter><rect width="100%" height="100%" filter="url(#p)"/></svg>');
// noise stitched on the tile, then tiled around it, as `name`
const wsNoise = (name: string, freq: string | number, oct: number, seed: number, size: number) =>
	'<feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="' + oct + '" seed="' + seed + '" stitchTiles="stitch" x="0" y="0" width="'
	+ size + '" height="' + size + '" result="' + name + '0"/><feTile in="' + name + '0" result="' + name + '"/>';
// the noise lit from the upper left: flat at 0.5 (the light's constant set by its elevation), slopes above and below
const wsLit = (src: string, name: string, surface: number, elev: number) =>
	'<feDiffuseLighting in="' + src + '" surfaceScale="' + wsN(surface) + '" diffuseConstant="' + wsN(0.5 / Math.sin(elev * Math.PI / 180))
	+ '" lighting-color="#ffffff" result="' + name + '"><feDistantLight azimuth="225" elevation="' + elev + '"/></feDiffuseLighting>';
// a grey (its red) around 0.5 as two layers: black where it falls, white where it rises, each alpha k × the distance
const wsSplit = (src: string, kDark: number, kLight: number, tag: string) =>
	'<feColorMatrix in="' + src + '" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ' + wsN(-kDark) + ' 0 0 0 ' + wsN(0.5 * kDark) + '" result="' + tag + 'd"/>'
	+ '<feColorMatrix in="' + src + '" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ' + wsN(kLight) + ' 0 0 0 ' + wsN(-0.5 * kLight) + '" result="' + tag + 'w"/>';
const wsMerge = (tags: string[]) => '<feMerge>' + tags.map((t) => '<feMergeNode in="' + t + 'd"/><feMergeNode in="' + t + 'w"/>').join('') + '</feMerge>';
// how much shows where: on a light note the shading falls (a highlight on white shows nothing), on a dark one it rises
const wsK = (k: number, dark: boolean): [number, number] => dark ? [k * 0.5, k * 1.0] : [k, k * 0.45];

// RELIEF: lit noise as one tile
const wsRelief = (freq: string | number, oct: number, seed: number, size: number, surface: number, k: number, dark: boolean, elev = 55) => {
	const [kd, kl] = wsK(k, dark);
	return wsTile(size, wsNoise('t', freq, oct, seed, size) + wsLit('t', 'g', surface, elev) + wsSplit('g', kd, kl, 'a') + wsMerge(['a']));
};
// MOTTLE: slow noise, unlit, as one tile (its red is a grey around 0.5)
const wsMottle = (freq: string | number, oct: number, seed: number, size: number, k: number, dark: boolean) => {
	const [kd, kl] = wsK(k, dark);
	return wsTile(size, wsNoise('t', freq, oct, seed, size) + wsSplit('t', kd, kl, 'a') + wsMerge(['a']));
};
// FLECKS: the noise's red and green peaks, sharp, dark and light: the fibers and dirt of cheap paper
const wsFlecks = (seed: number, size: number, a: number, dark: boolean) => {
	const ad = dark ? a * 0.6 : a, al = dark ? a * 0.9 : a * 0.5;
	return wsTile(size, wsNoise('t', 0.32, 2, seed, size)
		+ '<feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ' + wsN(9 * ad) + ' 0 0 0 ' + wsN(-6.66 * ad) + '" result="fd"/>'
		+ '<feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 ' + wsN(9 * al) + ' 0 0 ' + wsN(-6.66 * al) + '" result="fw"/>'
		+ '<feMerge><feMergeNode in="fd"/><feMergeNode in="fw"/></feMerge>');
};
const wsWash = (r: number, g: number, b: number, a: number) => 'linear-gradient(rgba(' + r + ', ' + g + ', ' + b + ', ' + wsN(a) + '), rgba(' + r + ', ' + g + ', ' + b + ', ' + wsN(a) + '))';

/** a paper's layers at a strength (the slider's share, 0 to 1: 1 is full, Settings starts at 0.6), for a light note or
 *  a dark one; null for none.
 *  Layers move with the text (local), an edge and a wash with the view (scroll). */
export function wsPaperCss(kind: string, s: number, dark: boolean): WsPaperCss | null {
	if (!(s > 0) || WS_PAPER_TEXTURES.indexOf(kind) < 0) return null;
	const L: [string, string, string][] = [];   // image, size, attachment
	const tooth = (k: number) => L.push([wsRelief(0.75, 3, 2, 200, 1.4, k * s, dark), '200px', 'local']);
	if (kind === 'grain') {
		tooth(0.5);
		L.push([wsMottle(0.012, 3, 3, 400, 0.12 * s, dark), '400px', 'local']);
	} else if (kind === 'laid') {
		// a laid sheet's lines, each a ridge lit from above (a pale line, a dark one), and its chain lines
		const lw = wsN((dark ? 0.05 : 0.09) * s), ld = wsN((dark ? 0.06 : 0.05) * s), cd = wsN((dark ? 0.08 : 0.06) * s);
		L.push(['repeating-linear-gradient(0deg, rgba(255, 255, 255, ' + lw + ') 0 1px, rgba(0, 0, 0, ' + ld + ') 1px 2px, transparent 2px 5px)', 'auto', 'local']);
		L.push(['repeating-linear-gradient(90deg, transparent 0 106px, rgba(0, 0, 0, ' + cd + ') 106px 108px, transparent 108px 110px)', 'auto', 'local']);
		tooth(0.3);
		L.push([wsMottle(0.012, 3, 3, 400, 0.14 * s, dark), '400px', 'local']);
	} else if (kind === 'cotton') {
		// rag paper: soft fibers lying every way (mostly along the sheet), a soft tooth, a cloudy sheet
		L.push([wsRelief('0.012 0.15', 2, 7, 360, 1.6, 0.25 * s, dark), '360px', 'local']);
		L.push([wsRelief('0.15 0.012', 2, 8, 360, 1.6, 0.12 * s, dark), '360px', 'local']);
		L.push([wsRelief(0.42, 3, 4, 200, 1.1, 0.35 * s, dark), '200px', 'local']);
		L.push([wsMottle(0.015, 3, 9, 400, 0.2 * s, dark), '400px', 'local']);
	} else if (kind === 'linen') {
		// a weave: threads across and threads down, each lit
		L.push([wsRelief('0.05 1', 2, 3, 240, 1.2, 0.28 * s, dark), '240px', 'local']);
		L.push([wsRelief('1 0.05', 2, 5, 240, 1.2, 0.28 * s, dark), '240px', 'local']);
		L.push([wsMottle(0.012, 2, 11, 400, 0.1 * s, dark), '400px', 'local']);
	} else if (kind === 'parchment') {
		// skin: a warm cast, edges darkened by age, blotches at two sizes, a fine tooth
		L.push([wsWash(196, 150, 80, (dark ? 0.05 : 0.07) * s), '100% 100%', 'scroll']);
		L.push(['radial-gradient(ellipse at center, transparent 58%, ' + (dark ? 'rgba(0, 0, 0, ' + wsN(0.3 * s) : 'rgba(90, 55, 15, ' + wsN(0.18 * s)) + ') 100%)', '100% 100%', 'scroll']);
		L.push([wsMottle(0.005, 4, 13, 480, 0.55 * s, dark), '480px', 'local']);
		L.push([wsMottle(0.03, 3, 15, 300, 0.2 * s, dark), '300px', 'local']);
		tooth(0.3);
	} else if (kind === 'newsprint') {
		// cheap and grey: a grey cast, sparse flecks, a faint cloud, almost no tooth
		L.push([wsWash(128, 128, 128, (dark ? 0.05 : 0.07) * s), '100% 100%', 'scroll']);
		L.push([wsFlecks(17, 220, 0.3 * s, dark), '220px', 'local']);
		L.push([wsMottle(0.02, 2, 19, 400, 0.12 * s, dark), '400px', 'local']);
		L.push([wsRelief(1.3, 2, 21, 200, 0.8, 0.25 * s, dark), '200px', 'local']);
	} else if (kind === 'watercolor') {
		// cold-pressed: broad bumps, lit low so they cast, and a faint cloud
		L.push([wsRelief(0.04, 4, 23, 300, 3.6, 0.55 * s, dark, 45), '300px', 'local']);
		L.push([wsMottle(0.01, 3, 25, 400, 0.12 * s, dark), '400px', 'local']);
	}
	return { img: L.map((l) => l[0]).join(', '), size: L.map((l) => l[1]).join(', '), attach: L.map((l) => l[2]).join(', ') };
}

// AN INK'S MASK: white, its alpha 1 - k(noise - c), clamped: the ink thins where the noise rises, smoothly
const wsThin = (name: string, src: string, k: number, c: number) =>
	'<feColorMatrix in="' + src + '" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ' + wsN(-k) + ' 0 0 0 ' + wsN(1 + k * c) + '" result="' + name + '"/>';
const wsMask = (size: number, body: string) => wsTile(size, body);
// …and two of them at once, multiplied
const wsBoth = (a: string, b: string) => '<feComposite in="' + a + '" in2="' + b + '" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>';
const wsMix = (pct: number, to: string) => 'color-mix(in srgb, currentColor ' + Math.round(pct) + '%, ' + to + ')';

// the slider's 100% for an ink, against its tuning: the tuning sits at 67%, a little under the 60% Settings starts at
export const WS_INK_FULL = 1.5;

/** an ink at a strength (the slider's share, 0 to 1; its tuning at 1 / WS_INK_FULL), for a light note or a dark one;
 *  null for none */
export function wsInkCss(kind: string, share: number, dark: boolean): WsInkCss | null {
	if (!(share > 0) || WS_INK_EFFECTS.indexOf(kind) < 0) return null;
	const t = share * WS_INK_FULL;
	const out: WsInkCss = { mask: 'none', maskSize: 'auto', shadow: 'none', stroke: '0px transparent', filter: 'none', opacity: '1' };
	// the paper's tooth taking the ink: thinner on the fibers' tops
	const dry = (k: number) => { out.mask = wsMask(180, wsNoise('n', 0.7, 3, 41, 180) + wsThin('m', 'n', k * t, 0.45)); out.maskSize = '180px'; };
	if (kind === 'grain') dry(0.9);
	else if (kind === 'inkwell') {
		// INKWELL (named Fountain pen until the writer: "the names should be one word"): a wet line, a dip pen's or a fountain pen's: the ink pools at the stroke's edge, feathers a little, and its flow rises and falls word to word
		out.mask = wsMask(400, wsNoise('n', 0.025, 2, 43, 400) + wsThin('m', 'n', 0.7 * t, 0.4)); out.maskSize = '400px';
		out.stroke = wsN(0.22 * t) + 'px ' + (dark ? wsMix(78, '#ffffff') : wsMix(65, '#000000'));
		out.shadow = '0 0 ' + wsN(0.6 * t) + 'px ' + wsMix(25, 'transparent');
	} else if (kind === 'bleed') {
		// ink into soft paper: a feather close to the stroke and a fainter one past it
		out.shadow = '0 0 ' + wsN(0.5 * t) + 'px ' + wsMix(50, 'transparent') + ', 0 0 ' + wsN(1.3 * t) + 'px ' + wsMix(20, 'transparent');
		dry(0.35);
	} else if (kind === 'typewriter') {
		// a ribbon: letters struck harder and softer (broad patches), the ribbon's weave in each (fine), a faint
		// second strike beside the first
		out.mask = wsMask(200, wsNoise('a', 0.07, 1, 45, 200) + wsThin('ma', 'a', 1.0 * t, 0.42) + wsNoise('b', 0.9, 2, 47, 200) + wsThin('mb', 'b', 0.6 * t, 0.45) + wsBoth('ma', 'mb'));
		out.maskSize = '200px';
		out.shadow = wsN(0.45 * t) + 'px ' + wsN(0.05 * t) + 'px 0 ' + wsMix(25, 'transparent') + ', 0 0 ' + wsN(0.3 * t) + 'px ' + wsMix(35, 'transparent');
	} else if (kind === 'letterpress') {
		// type pressed into the sheet: the lower lip catches the light on a light note, the upper casts on a dark one;
		// the ink squeezed to the edge
		out.shadow = dark
			? '0 -1px 0 rgba(0, 0, 0, ' + wsN(Math.min(1, 0.85 * t)) + '), 0 1px 0 rgba(255, 255, 255, ' + wsN(Math.min(1, 0.08 * t)) + ')'
			: '0 1px 0 rgba(255, 255, 255, ' + wsN(Math.min(1, 0.8 * t)) + '), 0 -0.5px 0 rgba(0, 0, 0, ' + wsN(Math.min(1, 0.12 * t)) + ')';
		out.stroke = dark ? '0px transparent' : wsN(0.15 * t) + 'px ' + wsMix(80, '#000000');
		dry(0.3);
	} else if (kind === 'worn') {
		// a worn plate: sharp spots where the ink did not take, whole stretches lighter than others
		out.mask = wsMask(200, wsNoise('a', 1.2, 2, 49, 200) + wsThin('ma', 'a', 6 * t, 0.66) + wsNoise('b', 0.03, 2, 51, 200) + wsThin('mb', 'b', 0.6 * t, 0.4) + wsBoth('ma', 'mb'));
		out.maskSize = '200px';
		out.shadow = '0 0 ' + wsN(0.35 * t) + 'px ' + wsMix(40, 'transparent');
	} else if (kind === 'faded') {
		// old ink: browned, a little paler, the paper's tooth in it
		out.filter = 'sepia(' + wsN(Math.min(1, 0.55 * t)) + ') saturate(' + wsN(Math.max(0.3, 1 - 0.3 * t)) + ')';
		out.opacity = wsN(Math.max(0.5, 1 - 0.12 * t));
		dry(0.5);
	}
	return out;
}
