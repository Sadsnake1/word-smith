// Word-Smith — core/revisions-core.
//
// REVISIONS (#118; the writer: "let's build snapshots too … so the file versions will sync on every device", named
// Revisions): a note's past, kept as plain notes in the plugin's own folder, `<Word-Smith>/ws-revisions/<the note's path>/`,
// one a moment, its text inside a code fence so nothing in it is read as a link, a tag, a task or a property; and the
// compare the Revisions view draws, paragraphs paired first and then words, so a sentence that grew shows only its new
// words and a revert brings back only what it marks. Pure: no vault, no DOM; the plugin's half is plugin/revisions.ts.

export const WS_REV_DIR = 'ws-revisions';
export type WsRevKind = 'yours' | 'auto';
export interface WsRevMeta { note: string; taken: number; kind: WsRevKind; name: string; words: number }

const pad = (n: number) => String(n).padStart(2, '0');
// THE STAMP A NAME CARRIES, an export's and a revision's alike (the writer: "the timestamp of notes need to be like the
// export timestamps"): the day, then the minute, dd-mm-yyyy hh-mm
export function wsNameStamp(d: Date): string {
	return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear() + ' ' + pad(d.getHours()) + '-' + pad(d.getMinutes());
}
// A REVISION'S FILE IS NAMED BY ITS MINUTE: 03-11-2026 15-30.md (a second one in the same minute takes -2, and so on)
export function wsRevStamp(d: Date): string { return wsNameStamp(d); }
const STAMP = /^(\d{2})-(\d{2})-(\d{4}) (\d{2})-(\d{2})(?:-(\d+))?\.md$/;
// (and the first form, before the export's stamp, still read: 2026-11-03 11.20.05.md)
const STAMP_FIRST = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})(?:-(\d+))?\.md$/;
function stampOf(name: string): { t: number; k: number } | null {
	const n = String(name || '');
	const m = STAMP.exec(n);
	if (m) return { t: new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]).getTime(), k: Number(m[6] || 1) };
	const o = STAMP_FIRST.exec(n);
	return o ? { t: new Date(+o[1], +o[2] - 1, +o[3], +o[4], +o[5], +o[6]).getTime(), k: Number(o[7] || 1) } : null;
}
export function wsRevStampTime(name: string): number | null { const s = stampOf(name); return s ? s.t : null; }
// NEWEST FIRST: by the moment (a day-first stamp does not sort as text), then the second one in the same minute after
// the first (-2 after none, -3 after -2)
export function wsRevNewestFirst(a: { name: string }, b: { name: string }): number {
	const x = stampOf(a.name), y = stampOf(b.name);
	if (!x || !y) return x ? -1 : y ? 1 : 0;
	return y.t - x.t || y.k - x.k;
}
// THE FOLDER OF A NOTE'S REVISIONS: the note's own path under ws-revisions, its .md left off
export function wsRevFolder(ownDir: string, notePath: string): string {
	return (ownDir ? ownDir + '/' : '') + WS_REV_DIR + '/' + String(notePath).replace(/\.md$/i, '');
}
// …and back: the note a folder of revisions belongs to, or '' for a path that is not one
export function wsRevNoteOf(ownDir: string, folder: string): string {
	const root = (ownDir ? ownDir + '/' : '') + WS_REV_DIR + '/';
	return String(folder).startsWith(root) && folder.length > root.length ? folder.slice(root.length) + '.md' : '';
}
// …and whether a path is inside the revisions at all
export function wsRevIsPath(ownDir: string, path: string): boolean {
	const root = (ownDir ? ownDir + '/' : '') + WS_REV_DIR;
	return path === root || String(path).startsWith(root + '/');
}

// ── THE FILE: a small header of properties (no link in it), then the note's text fenced ──
// THE FENCE IS LONGER than any run of backticks in the text, four at least, so a note holding code fences of its own
// is kept whole inside it.
export function wsRevSerialize(meta: WsRevMeta, text: string): string {
	const fence = '`'.repeat(Math.max(4, ...(String(text).match(/`+/g) || []).map((r) => r.length + 1)));
	return '---\n'
		+ 'ws-revision-of: ' + JSON.stringify(meta.note) + '\n'
		+ 'ws-taken: ' + new Date(meta.taken).toISOString() + '\n'
		+ 'ws-kind: ' + meta.kind + '\n'
		+ (meta.name ? 'ws-name: ' + JSON.stringify(meta.name) + '\n' : '')
		+ 'ws-words: ' + Math.max(0, Math.round(meta.words) || 0) + '\n'
		+ '---\n\n' + fence + 'ws-revision\n' + text + '\n' + fence + '\n';
}
export function wsRevParse(src: string): { meta: WsRevMeta; text: string } | null {
	const s = String(src || '').replace(/\r\n?/g, '\n');
	const head = /^---\n([\s\S]*?)\n---\n/.exec(s);
	if (!head) return null;
	const props: Record<string, string> = {};
	for (const line of head[1].split('\n')) {
		const m = /^([\w-]+):\s?(.*)$/.exec(line);
		if (m) props[m[1]] = m[2];
	}
	const str = (v: string | undefined) => { if (v == null) return ''; try { return /^"/.test(v) ? String(JSON.parse(v)) : v; } catch { return v; } };
	const rest = s.slice(head[0].length);
	const open = /^\n?(`{4,})ws-revision\n/.exec(rest);
	if (!open) return null;
	const body = rest.slice(open[0].length);
	const close = body.lastIndexOf('\n' + open[1]);
	if (close < 0) return null;
	const taken = Date.parse(str(props['ws-taken']));
	return {
		meta: { note: str(props['ws-revision-of']), taken: isNaN(taken) ? 0 : taken, kind: props['ws-kind'] === 'auto' ? 'auto' : 'yours', name: str(props['ws-name']), words: Number(props['ws-words']) || 0 },
		text: body.slice(0, close),
	};
}

// ── WHERE AUTOMATIC REVISIONS ARE TAKEN: the folders and notes chosen, less the exceptions ('/' the whole vault) ──
export function wsRevTracked(path: string, paths: string[], except: string[]): boolean {
	const under = (p: string, e: string) => e === '/' || p === e || p.startsWith(e.replace(/\/$/, '') + '/');
	return (paths || []).some((e) => e && under(path, e)) && !(except || []).some((e) => e && e !== '/' && under(path, e));
}

// ── THE COMPARE: paragraphs paired first, then words ──────────────────────────────────────────────────────────────
//
// A paragraph is a line that is not blank, as Obsidian draws one (A827: every line of a note a paragraph): a run of
// lines read as one block paired a block a writer had split or joined with nothing, and showed every line of it removed
// and added again (the writer's shot, 2026-11-03: two lines typed above a paragraph, a blank line taken out). THE SPANS
// ARE KEPT, start and end in the text, so a revert writes into the note where the change is and nothing else moves: the
// note's own blank lines, its spacing and its properties stay as they were.
export interface WsRevSpan { start: number; end: number; text: string }
export function wsRevParas(text: string): WsRevSpan[] {
	const out: WsRevSpan[] = [];
	const s = String(text || '');
	const re = /[^\n]*\S[^\n]*/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(s))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
	return out;
}
const WORD = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const TOK = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|\s+|[^\s\p{L}\p{M}\p{N}_]/gu;
export const wsRevWords = (t: string) => (String(t).match(WORD) || []).length;
const wordSet = (t: string) => new Set((String(t).toLowerCase().match(WORD) || []));
const bigOf = (s: Set<string>) => new Set(Array.from(s).filter((w) => w.length >= 4));
// HOW ALIKE TWO PARAGRAPHS ARE: their shared words; AND A PARAGRAPH THAT GREW OR SHRANK is still itself, nearly all
// the shorter one's words of four letters or more found in the longer (three of them at least, so "And so it went on."
// matches nothing by its little words)
interface ParaSig { words: Set<string>; big: Set<string> }
function sim(a: string, b: string, A: ParaSig, B: ParaSig): number {
	if (a === b) return 2;
	if (!A.words.size || !B.words.size) return 0;
	let n = 0; for (const w of A.words) if (B.words.has(w)) n++;
	const jac = n / (A.words.size + B.words.size - n);
	const small = Math.min(A.big.size, B.big.size);
	let n4 = 0; if (small >= 3) for (const w of A.big) if (B.big.has(w)) n4++;
	return Math.max(jac, small >= 3 ? 0.8 * n4 / small : 0);
}
// the longest common run of two token lists, as what went, what came and what stayed (the common start and end taken
// off first, which is most of a paragraph a writer touched; past four million cells, the middle is one change)
function tokenOps(a: string[], b: string[]): { t: 'eq' | 'del' | 'ins'; v: string }[] {
	let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
	let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
	const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e);
	const ops: { t: 'eq' | 'del' | 'ins'; v: string }[] = a.slice(0, s).map((v) => ({ t: 'eq' as const, v }));
	const n = A.length, m = B.length;
	if (n * m > 4e6) {
		for (const v of A) ops.push({ t: 'del', v });
		for (const v of B) ops.push({ t: 'ins', v });
	} else {
		const dp: Uint32Array[] = [];
		for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
		for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
		let i = 0, j = 0;
		while (i < n && j < m) {
			if (A[i] === B[j]) { ops.push({ t: 'eq', v: A[i] }); i++; j++; }
			else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'del', v: A[i] }); i++; }
			else { ops.push({ t: 'ins', v: B[j] }); j++; }
		}
		while (i < n) ops.push({ t: 'del', v: A[i++] });
		while (j < m) ops.push({ t: 'ins', v: B[j++] });
	}
	for (const v of a.slice(a.length - e)) ops.push({ t: 'eq', v });
	return ops;
}
// A CHANGE IS WHAT WENT AND WHAT CAME, whole words; a short run of spaces and marks between two changes (", " or " ")
// belongs to both, so one rewrite is one change and not three; a change of spaces alone is no change at all
export interface WsRevGroup { eq?: string; del?: string; ins?: string }
// what is drawn: a change of spaces alone is no change
export function wsRevGroups(a: string, b: string): WsRevGroup[] {
	return wsRevGroupsRaw(a, b).map((x) => (x.eq === undefined && !String(x.del).trim() && !String(x.ins).trim() ? { eq: x.ins } : x));
}
// …and the groups exactly as the two texts have them, so their lengths add up to both (the side by side's offsets)
export function wsRevGroupsRaw(a: string, b: string): WsRevGroup[] {
	const ops = tokenOps(String(a).match(TOK) || [], String(b).match(TOK) || []);
	const out: WsRevGroup[] = [];
	let g: { del: string; ins: string } | null = null;
	for (let k = 0; k < ops.length; k++) {
		const o = ops[k];
		if (o.t === 'eq') {
			if (g) {
				let e = k, run = '';
				while (e < ops.length && ops[e].t === 'eq' && /^[\s,;:.]+$/.test(ops[e].v)) { run += ops[e].v; e++; }
				// …only before a change with words in it: spaces alone after it (a line's trailing spaces) stay apart
				let f = e, next = '';
				while (f < ops.length && ops[f].t !== 'eq') { next += ops[f].v; f++; }
				if (run.length <= 3 && e > k && next.trim()) { g.del += run; g.ins += run; k = e - 1; continue; }
				out.push(g); g = null;
			}
			const last = out[out.length - 1];
			if (last && last.eq !== undefined) last.eq += o.v; else out.push({ eq: o.v });
		} else {
			if (!g) g = { del: '', ins: '' };
			g[o.t] += o.v;
		}
	}
	if (g) out.push(g);
	return out;
}
export type WsRevItem =
	| { type: 'same'; a: number; b: number; text: string }
	| { type: 'changed'; a: number; b: number; old: string; text: string; g: WsRevGroup[] }
	| { type: 'moved'; a: number; b: number; old: string; text: string; g: WsRevGroup[]; up: boolean }
	| { type: 'ghost'; a: number; to: number; up: boolean }
	| { type: 'added'; b: number; text: string }
	| { type: 'removed'; a: number; text: string; at: number };
export interface WsRevComparison { A: WsRevSpan[]; B: WsRevSpan[]; items: WsRevItem[] }
// THE ITEMS IN THE ORDER OF THE NEWER TEXT, a removed paragraph where it stood. The pairing keeps order (a paragraph
// is matched with its old self, never with whatever stands beside it); what is left over on both sides and alike is a
// paragraph that moved.
export function wsRevCompare(oldText: string, newText: string): WsRevComparison {
	const A = wsRevParas(oldText), B = wsRevParas(newText);
	// the paragraphs alike at both ends are paired as they stand, which is most of a long note
	let pre = 0; while (pre < A.length && pre < B.length && A[pre].text === B[pre].text) pre++;
	let suf = 0; while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf].text === B[B.length - 1 - suf].text) suf++;
	const sigA = A.map((p) => { const w = wordSet(p.text); return { words: w, big: bigOf(w) }; });
	const sigB = B.map((p) => { const w = wordSet(p.text); return { words: w, big: bigOf(w) }; });
	const a0 = pre, a1 = A.length - suf, b0 = pre, b1 = B.length - suf;
	const n = a1 - a0, m = b1 - b0;
	const S: number[][] = [];
	for (let i = 0; i < n; i++) { const row: number[] = []; for (let j = 0; j < m; j++) row.push(sim(A[a0 + i].text, B[b0 + j].text, sigA[a0 + i], sigB[b0 + j])); S.push(row); }
	const dp: Float64Array[] = [];
	for (let i = 0; i <= n; i++) dp.push(new Float64Array(m + 1));
	for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
		let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
		if (S[i][j] >= 0.5) best = Math.max(best, S[i][j] + dp[i + 1][j + 1]);
		dp[i][j] = best;
	}
	const pairs: [number, number][] = [];
	for (let k = 0; k < pre; k++) pairs.push([k, k]);
	{
		let i = 0, j = 0;
		while (i < n && j < m) {
			if (S[i][j] >= 0.5 && Math.abs(dp[i][j] - (S[i][j] + dp[i + 1][j + 1])) < 1e-9) { pairs.push([a0 + i, b0 + j]); i++; j++; }
			else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
		}
	}
	for (let k = 0; k < suf; k++) pairs.push([a1 + k, b1 + k]);
	const pa = new Map(pairs.map(([i, j]) => [i, j])), pb = new Map(pairs.map(([i, j]) => [j, i]));
	const remA = A.map((_, i) => i).filter((i) => !pa.has(i)), addB = B.map((_, j) => j).filter((j) => !pb.has(j));
	const moves = new Map<number, number>(), movedFrom = new Map<number, number>();
	for (const i of remA) {
		let best = -1, bs = 0.5;
		for (const j of addB) {
			if (movedFrom.has(j)) continue;
			const v = sim(A[i].text, B[j].text, sigA[i], sigB[j]);
			if (v >= bs) { bs = v; best = j; }
		}
		if (best >= 0) { moves.set(i, best); movedFrom.set(best, i); }
	}
	const anchor = (i: number) => { for (let k = i - 1; k >= 0; k--) { const j = pa.get(k); if (j !== undefined) return j + 1; } return 0; };
	const before = new Map<number, number[]>();
	for (const i of remA) { const at = anchor(i); const l = before.get(at) || []; l.push(i); before.set(at, l); }
	const items: WsRevItem[] = [];
	const emitBefore = (j: number) => {
		for (const i of before.get(j) || []) {
			const to = moves.get(i);
			items.push(to !== undefined ? { type: 'ghost', a: i, to, up: to < j } : { type: 'removed', a: i, text: A[i].text, at: j });
		}
	};
	for (let j = 0; j < B.length; j++) {
		emitBefore(j);
		const i = pb.get(j);
		if (i !== undefined) {
			items.push(A[i].text === B[j].text ? { type: 'same', a: i, b: j, text: B[j].text }
				: { type: 'changed', a: i, b: j, old: A[i].text, text: B[j].text, g: wsRevGroups(A[i].text, B[j].text) });
			continue;
		}
		const from = movedFrom.get(j);
		if (from !== undefined) {
			items.push({ type: 'moved', a: from, b: j, old: A[from].text, text: B[j].text, g: A[from].text === B[j].text ? [{ eq: B[j].text }] : wsRevGroups(A[from].text, B[j].text), up: j < anchor(from) });
		} else items.push({ type: 'added', b: j, text: B[j].text });
	}
	emitBefore(B.length);
	return { A, B, items };
}

// ── THE SAME COMPARE AS OFFSETS, for the side by side (a merge view of the two texts) ──
// every difference, in order in both texts: paragraphs paired as above, their words changed one by one inside them,
// and what lies between two pairs (a paragraph gone, one new, one moved, the blank lines) as one change, its common
// ends taken off; whatever is not in a change is the same in both, character for character
export interface WsRevChange { fromA: number; toA: number; fromB: number; toB: number }
export function wsRevChanges(oldText: string, newText: string): WsRevChange[] {
	const a = String(oldText || ''), b = String(newText || '');
	const cmp = wsRevCompare(a, b);
	const out: WsRevChange[] = [];
	const between = (fa: number, ta: number, fb: number, tb: number) => {
		let s = 0; while (fa + s < ta && fb + s < tb && a[fa + s] === b[fb + s]) s++;
		let e = 0; while (ta - e > fa + s && tb - e > fb + s && a[ta - 1 - e] === b[tb - 1 - e]) e++;
		if (fa + s < ta - e || fb + s < tb - e) out.push({ fromA: fa + s, toA: ta - e, fromB: fb + s, toB: tb - e });
	};
	let pa = 0, pb = 0;
	for (const it of cmp.items) {
		if (it.type !== 'same' && it.type !== 'changed') continue;
		const A = cmp.A[it.a], B = cmp.B[it.b];
		between(pa, A.start, pb, B.start);
		if (it.type === 'changed') {
			let oa = A.start, ob = B.start;
			for (const g of wsRevGroupsRaw(A.text, B.text)) {
				if (g.eq !== undefined) { oa += g.eq.length; ob += g.eq.length; continue; }
				const d = String(g.del || '').length, n = String(g.ins || '').length;
				out.push({ fromA: oa, toA: oa + d, fromB: ob, toB: ob + n });
				oa += d; ob += n;
			}
		}
		pa = A.end; pb = B.end;
	}
	between(pa, a.length, pb, b.length);
	return out;
}

// ── WRITING A CHANGE BACK, into the newer text where it stands ──
// one change of a paragraph brought back: its old words where its new ones are, the rest of the paragraph as it is
// THE COUNT OF A COMPARISON: its changes (a group of words, a paragraph added or removed), the words added and removed, the
// paragraphs moved. One count, for the compare's header and for the list's changes from now
export function wsRevTally(cmp: WsRevComparison | null): { n: number; add: number; rem: number; mov: number } {
	let n = 0, add = 0, rem = 0, mov = 0;
	for (const it of cmp ? cmp.items : []) {
		if ('g' in it) for (const x of it.g) if (x.eq === undefined) { n++; add += wsRevWords(String(x.ins || '')); rem += wsRevWords(String(x.del || '')); }
		if (it.type === 'added') { n++; add += wsRevWords(it.text); }
		if (it.type === 'removed') { n++; rem += wsRevWords(it.text); }
		if (it.type === 'moved') mov++;
	}
	return { n, add, rem, mov };
}
export function wsRevBringBack(text: string, cmp: WsRevComparison, b: number, groups: WsRevGroup[], gi: number): string {
	const p = cmp.B[b];
	if (!p) return text;
	const para = groups.map((x, k) => (x.eq !== undefined ? x.eq : k === gi ? String(x.del) : String(x.ins))).join('');
	return text.slice(0, p.start) + para + text.slice(p.end);
}
// a whole paragraph as it was
export function wsRevRestorePara(text: string, cmp: WsRevComparison, b: number, old: string): string {
	const p = cmp.B[b];
	return p ? text.slice(0, p.start) + old + text.slice(p.end) : text;
}
// a paragraph out, with the blank lines after it (before it, at the note's end), so no gap is left
export function wsRevRemovePara(text: string, cmp: WsRevComparison, b: number): string {
	const p = cmp.B[b];
	if (!p) return text;
	const next = cmp.B[b + 1], prev = cmp.B[b - 1];
	if (next) return text.slice(0, p.start) + text.slice(next.start);
	if (prev) return text.slice(0, prev.end) + text.slice(p.end);
	return text.slice(0, p.start) + text.slice(p.end);
}
// a paragraph in, before the newer paragraph `at` (after the last, at the end), a blank line either side
export function wsRevInsertPara(text: string, cmp: WsRevComparison, at: number, para: string): string {
	// …parted from its neighbors as the note parts its paragraphs: a blank line, or (lines one under another) a newline
	const gap = (i: number) => { const x = cmp.B[i - 1], y = cmp.B[i]; return x && y ? text.slice(x.end, y.start) : ''; };
	const near = gap(at) || gap(at - 1) || gap(at + 1);
	const sep = near && !/\n[ \t]*\n/.test(near) ? '\n' : '\n\n';
	const p = cmp.B[at];
	if (p) return text.slice(0, p.start) + para + sep + text.slice(p.start);
	const last = cmp.B[cmp.B.length - 1];
	if (!last) return para + (text.trim() ? sep + text : text);
	return text.slice(0, last.end) + sep + para + text.slice(last.end);
}
