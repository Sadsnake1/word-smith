// Two builds. `node esbuild.config.mjs` bundles src/main.ts into main.js, the
// file Obsidian loads. `node esbuild.config.mjs test` bundles src/test-entry.ts
// into ../ws-dev/main.js, the file the probes require (the class with the
// harness's helpers as statics). Both leave obsidian, electron and the
// CodeMirror packages external: Obsidian resolves them at run time.
//
// `options(test)` is exported so the harness (ws-dev/bundle_probe.js) builds
// with exactly these and not a second copy of them. Paths are relative to
// this file, whatever the working directory.
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const options = (test) => ({
	absWorkingDir: HERE,
	entryPoints: [test ? 'src/test-entry.ts' : 'src/main.ts'],
	bundle: true,
	format: 'cjs',
	platform: 'browser',
	target: 'es2020',
	outfile: test ? '../ws-dev/main.js' : 'main.js',
	external: ['obsidian', 'electron', '@electron/remote', '@codemirror/*', '@lezer/*', '@replit/codemirror-vim'],
	logLevel: 'info',
	legalComments: 'none',
	sourcemap: false,
	// The probes `require('./main.js')` and expect the class itself, with the
	// helpers as statics — not `{ default: … }`. The shipped file keeps the
	// `default` export: Obsidian's loader reads it.
	footer: test ? { js: 'module.exports = module.exports.default;' } : undefined,
});

// ── THE SHIPPED PAIR, WITHOUT THEIR COMMENTS (A487) ──────────────────────
//
// The source explains itself at length — half its characters are comments —
// and every install downloaded all of it: 369 KB of main.js and 535 KB of
// styles.css were comments, 900 KB of a 2.3 MB plugin. The files here stay
// as they are (the source, read by every test); the release attaches
// `build/main.js` and `build/styles.css`, the same code without them.
//
// main.js goes through TypeScript's own printer with `removeComments`: the
// code is re-emitted from its syntax tree, not cut by pattern, so a `//` in
// a string or a regex cannot be taken for a comment. styles.css through a
// scanner that steps over strings and `url(…)`. The smoke test proves both
// are the source minus comments: esbuild minifies each pair to one output.
export function stripCss(css) {
	let out = '', i = 0, q = '';
	while (i < css.length) {
		const c = css[i];
		if (q) { out += c; if (c === '\\') { out += css[i + 1] || ''; i += 2; continue; } if (c === q) q = ''; i++; continue; }
		if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
		if (c === '/' && css[i + 1] === '*') { const end = css.indexOf('*/', i + 2); i = end === -1 ? css.length : end + 2; continue; }
		out += c; i++;
	}
	// the lines a comment stood on, gone; one blank line between blocks at most
	return out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}
export async function stripJs(js) {
	const ts = (await import('typescript')).default;
	// …and back through esbuild's own printer, unminified: TypeScript prints
	// with four-space indents where the bundle had two, and would have given
	// back in whitespace most of what the comments cost.
	return (await esbuild.transform(stripJsTs(ts, js), { loader: 'js', target: 'es2020', legalComments: 'none', charset: 'utf8' })).code;
}
function stripJsTs(ts, js) {
	return ts.transpileModule(js, {
		fileName: 'main.js',
		reportDiagnostics: false,
		compilerOptions: {
			allowJs: true, removeComments: true, alwaysStrict: false, noEmitHelpers: true, importHelpers: false,
			// the bundle is already es2020 (esbuild's target): nothing is lowered
			target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, newLine: ts.NewLineKind.LineFeed,
		},
	}).outputText;
}
export async function writeShipped() {
	const dir = path.join(HERE, 'build');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'main.js'), await stripJs(fs.readFileSync(path.join(HERE, 'main.js'), 'utf8')));
	fs.writeFileSync(path.join(dir, 'styles.css'), stripCss(fs.readFileSync(path.join(HERE, 'styles.css'), 'utf8')));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const test = process.argv.includes('test');
	await esbuild.build(options(test));
	if (!test) await writeShipped();
}
