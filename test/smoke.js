'use strict';
// The smoke test over the built plugin: what the release workflow runs after
// `npm run build`, and what a reviewer can run on the assets of a release.
//
//   npm test
//
// It asks nothing of a browser. main.js is loaded with a stand-in for the
// `obsidian` package, which is how the file behaves in the app: the packages
// are asked of Obsidian at run time, never bundled.
//
// TWO PAIRS (A487): `main.js` and `styles.css` beside the manifest are the
// source build, comments and all; `build/main.js` and `build/styles.css` are
// what the release attaches — the same code without its comments. Every
// check below runs on both, and the last section proves the second pair is
// the first minus comments: esbuild minifies each to the same bytes.
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

let pass = 0, fail = 0;
const is = (what, got, want) => {
	if (got === want) { pass++; return; }
	fail++;
	console.log('  FAIL ' + what + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));
};

// ── the files, as bytes ────────────────────────────────────────────────────
for (const name of ['main.js', 'styles.css', 'manifest.json', 'versions.json', 'build/main.js', 'build/styles.css']) {
	const there = fs.existsSync(path.join(ROOT, name));
	is(name + ' is there' + (/main\.js|build\//.test(name) && !there ? ' (run npm run build first)' : ''), there, true);
}
if (fail) { console.log(pass + ' passed, ' + fail + ' failed'); process.exit(1); }

// A control byte in a stylesheet reads as U+FFFD, and a run of those outside
// a block joins the next rule's selector, which then never matches. The sheet
// shipped that way once, unnoticed, for nine days.
const control = (buf) => { for (let k = 0; k < buf.length; k++) { const c = buf[k]; if (c < 32 && c !== 9 && c !== 10 && c !== 13) return k; } return -1; };
for (const name of ['styles.css', 'build/styles.css', 'manifest.json', 'versions.json']) {
	const at = control(fs.readFileSync(path.join(ROOT, name)));
	is(name + ' holds no control byte' + (at >= 0 ? ' (one at byte ' + at + ')' : ''), at, -1);
}

// ── the manifest, the versions, the package ───────────────────────────────
const manifest = JSON.parse(read('manifest.json'));
const versions = JSON.parse(read('versions.json'));
const pkg = JSON.parse(read('package.json'));
is('the manifest names the plugin', manifest.id, 'word-smith');
is('the manifest has a version', typeof manifest.version === 'string' && /^\d+\.\d+\.\d+$/.test(manifest.version), true);
is('the package carries the same version', pkg.version, manifest.version);
is('versions.json names this version and the app it needs', versions[manifest.version], manifest.minAppVersion);
is('the plugin runs on desktop and phone alike', manifest.isDesktopOnly, false);

// ── the bundle, both of them ───────────────────────────────────────────────
const stub = {
	Plugin: class {}, PluginSettingTab: class {}, Setting: class {}, Modal: class {}, Menu: class {},
	MarkdownView: class {}, TFile: class {}, TFolder: class {}, ItemView: class {}, FuzzySuggestModal: class {},
	Notice: class {}, Component: class {}, Events: class {},
	setIcon() {}, addIcon() {}, sanitizeHTMLToDom() {}, normalizePath: (p) => p, Platform: {},
};
const load = Module._load;
Module._load = function (request) {
	if (request === 'obsidian') return stub;
	if (/^@codemirror\//.test(request)) return {};
	return load.apply(this, arguments);
};
for (const [js, css] of [['main.js', 'styles.css'], ['build/main.js', 'build/styles.css']]) {
	const src = read(js);
	for (const name of ['obsidian', '@codemirror/view', '@codemirror/state', '@codemirror/commands']) {
		is(js + ' asks Obsidian for ' + name + ' at run time', src.indexOf('require("' + name + '")') !== -1, true);
	}
	is(js + ' bundles no copy of a package', /^\/\/ node_modules\//m.test(src), false);
	// regex lookbehind is refused by iOS below 16.4, and a refused regex is a
	// SyntaxError for the whole file: the plugin would not load at all
	const behind = /\(\?<[=!]/.exec(src);
	is(js + ' carries no regex lookbehind' + (behind ? ' (at ' + behind.index + ')' : ''), !behind, true);
	// the stylesheet and the bundle move together
	const inSheet = (/--ws-stylesheet-version:\s*(\d+)/.exec(read(css)) || [])[1];
	const inBundle = (/WS_STYLESHEET_VERSION = (\d+);/.exec(src) || [])[1];
	is(js + ' and ' + css + ' carry one version (' + inSheet + ')', inBundle, inSheet);
	let plugin = null, error = '';
	try { plugin = require(path.join(ROOT, js)); } catch (e) { error = String(e && e.message || e); }
	is(js + ' loads' + (error ? ' (' + error.slice(0, 80) + ')' : ''), error, '');
	const cls = plugin && plugin.default;
	is(js + ' default-exports the plugin class, which is what Obsidian loads', typeof cls === 'function' && cls.name === 'WordSmith', true);
	for (const m of ['onload', 'onunload', 'loadSettings', 'saveSettings']) {
		is(js + ': the class has ' + m, !!(cls && typeof cls.prototype[m] === 'function'), true);
	}
}

// ── the shipped pair is the source minus its comments ────────────────────
//
// Minified by esbuild — whitespace and syntax, the names kept as written, so
// the comparison cannot hide behind a renamed variable — each pair gives one
// output, byte for byte. Anything but a comment or its whitespace removed,
// added or changed would show here.
(async () => {
	const esbuild = require('esbuild');
	const min = async (code, loader) => (await esbuild.transform(code, { loader, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, legalComments: 'none', charset: 'utf8' })).code;
	for (const [a, b, loader] of [['main.js', 'build/main.js', 'js'], ['styles.css', 'build/styles.css', 'css']]) {
		const [ma, mb] = await Promise.all([min(read(a), loader), min(read(b), loader)]);
		let at = -1; if (ma !== mb) { at = 0; while (ma[at] === mb[at]) at++; }
		is(b + ' is ' + a + ' without its comments' + (at >= 0 ? ' (first difference at ' + at + ')' : ''), at, -1);
		const blocks = (read(b).match(/\/\*(?!\s*@__PURE__\s*\*\/)[\s\S]*?\*\//g) || []).length;
		const lines = loader === 'js' ? (read(b).match(/^\s*\/\/[^\n]*$/gm) || []).length : 0;
		is(b + ' carries no comment of the source\'s', blocks + lines, 0);
	}
	const kb = (f) => Math.round(fs.statSync(path.join(ROOT, f)).size / 1024);
	console.log(pass + ' passed, ' + fail + ' failed  (shipped: main.js ' + kb('build/main.js') + ' KB of ' + kb('main.js') + ', styles.css ' + kb('build/styles.css') + ' KB of ' + kb('styles.css') + ')');
	process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('  FAIL the comparison threw: ' + (e && e.message)); process.exit(1); });
