// Each language pack's version and downloads, for the two badges under each pack in the README, written as
// small files in shields.io's endpoint format:
//   · <pack>.downloads.json, added up over every release (GitHub counts a file only when a release carries
//     it, so the Release workflow attaches packs/);
//   · <pack>.version.json, the `- pack:` line of the copy the newest release carries (what the README's link
//     downloads), or of packs/ while no release carries one yet.
//
//   node .github/pack-counts.mjs <dir>     writes the files into <dir> (the Pack counts workflow)
//   node .github/pack-counts.mjs --print   prints each pack's version and downloads
import fs from 'node:fs';
import path from 'node:path';

const repo = process.env.GITHUB_REPOSITORY || 'Sadsnake1/word-smith';
const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'word-smith-pack-counts' };
if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
const versionOf = (text) => { const m = /^- pack:\s*(\S+)/m.exec(text); return m ? m[1] : ''; };

const packs = {};
for (const f of fs.readdirSync('packs').filter((n) => /^ws-lang-.+\.md$/.test(n)).sort()) {
	packs[f] = { downloads: 0, version: versionOf(fs.readFileSync(path.join('packs', f), 'utf8')) };
}
let latest = null;
for (let page = 1; ; page++) {
	const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers });
	if (!r.ok) throw new Error('GitHub answered ' + r.status + ' for the releases');
	const list = await r.json();
	for (const rel of list) {
		if (!rel.draft && !rel.prerelease && (!latest || rel.published_at > latest.published_at)) latest = rel;
		for (const a of rel.assets || []) if (a.name in packs) packs[a.name].downloads += a.download_count;
	}
	if (list.length < 100) break;
}
for (const a of (latest && latest.assets) || []) {
	if (!(a.name in packs)) continue;
	try {
		const r = await fetch(a.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } });
		const v = r.ok ? versionOf(await r.text()) : '';
		if (v) packs[a.name].version = v;
	} catch { /* the repository's copy stands */ }
}

if (process.argv[2] === '--print') {
	for (const [f, p] of Object.entries(packs)) console.log(f.padEnd(22) + ('v' + p.version).padEnd(8) + p.downloads);
	process.exit(0);
}

// 950, 1.2k, 12k, 1.3M: as the badges up top write a number
const short = (n) => {
	if (n < 1000) return String(n);
	if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
	return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
};
const out = process.argv[2] || 'badges';
fs.mkdirSync(out, { recursive: true });
const write = (name, message, color) => fs.writeFileSync(path.join(out, name),
	JSON.stringify({ schemaVersion: 1, label: '', message, color, cacheSeconds: 3600 }) + '\n');
for (const [f, p] of Object.entries(packs)) {
	const base = f.replace(/\.md$/, '');
	write(base + '.downloads.json', short(p.downloads), '10B981');
	write(base + '.version.json', p.version ? 'v' + p.version : 'v?', '8B5CF6');
}
for (const [f, p] of Object.entries(packs)) console.log(f + ' v' + p.version + ' ' + p.downloads);
