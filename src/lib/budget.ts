// DESIGN.md, Accessibility and performance. A KB is 1024 bytes.
// The 50 KB JS budget is split: first-party JS stays under 42 KB here, and lighthouserc.cjs holds
// the visit counter's transfer to at most 8 KB.
export const JS_BUDGET = 42 * 1024;
export const FONT_FILE_BUDGET = 4; // font files a page can load, at most
export const IMAGE_BUDGET = 200 * 1024; // each image file, at most

export const isRemote = (url: string) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url);
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const resolve = (url: string, from: string) => new URL(url, `http://localhost${from}`).pathname;

// 'U+0-FF, U+4??' -> [[0, 255], [1024, 1279]]
export function parseUnicodeRange(value: string): Array<[number, number]> {
	return value.split(',').map((part) => {
		const m = part.trim().match(/^U\+([\da-f?]{1,6})(?:-([\da-f]{1,6}))?$/i);
		if (!m) throw new Error(`Cannot read unicode-range "${part.trim()}"`);
		const [, start, end] = m;
		return [parseInt(start.replace(/\?/g, '0'), 16), parseInt((end ?? start).replace(/\?/g, 'f'), 16)];
	});
}

// The font files a page can request: the first src of each @font-face whose unicode-range, if
// any, covers a character of the page's text. It ignores which family the text is set in, so it
// can only overcount.
export function fontFiles(css: string, text: string): string[] {
	const decoded = text.replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) =>
		String.fromCodePoint(/^x/i.test(n) ? parseInt(n.slice(1), 16) : Number(n)),
	);
	const points = [...new Set([...decoded].map((c) => c.codePointAt(0)!))];
	const files = new Set<string>();
	for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
		const url = body.match(/url\(\s*["']?([^"')]+)/)?.[1];
		if (!url || url.startsWith('data:')) continue;
		const range = body.match(/unicode-range\s*:\s*([^;]+)/)?.[1];
		const ranges = range === undefined ? undefined : parseUnicodeRange(range);
		if (!ranges || points.some((p) => ranges.some(([a, b]) => p >= a && p <= b))) files.add(url);
	}
	return [...files];
}

// A page's CSS: its <style> blocks and the stylesheets it links, read through `read`.
export function pageCss(html: string, read: (url: string) => string | undefined) {
	const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
	const missing: string[] = [];
	for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
		const href = attr(tag, 'href');
		if (attr(tag, 'rel') !== 'stylesheet' || !href) continue;
		const text = read(href);
		if (text === undefined) missing.push(href);
		else css.push(text);
	}
	return { css: css.join('\n'), missing };
}

const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);
const SPECIFIER = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\b(?:from|import)\s*["']([^"']+)["']/g;

// The first-party JS a page runs, in UTF-8 bytes: inline scripts, local script and modulepreload
// files, and each local module they import, once. Remote scripts are listed, not counted.
export function scriptBytes(html: string, pageUrl: string, read: (url: string) => string | undefined) {
	const result = { bytes: 0, remote: [] as string[], missing: [] as string[] };
	const seen = new Set<string>();
	const run = (code: string, from: string) => {
		result.bytes += Buffer.byteLength(code);
		for (const m of code.matchAll(SPECIFIER)) {
			const spec = m[1] ?? m[2];
			if (isRemote(spec)) result.remote.push(spec);
			else if (/^\.{0,2}\//.test(spec)) load(resolve(spec, from));
		}
	};
	const load = (url: string) => {
		if (seen.has(url)) return;
		seen.add(url);
		const code = read(url);
		if (code === undefined) result.missing.push(url);
		else run(code, url);
	};
	for (const [, open, body] of html.matchAll(/(<script\b[^>]*>)([\s\S]*?)<\/script>/g)) {
		if (!JS_TYPES.has(attr(open, 'type') ?? '')) continue;
		const src = attr(open, 'src');
		if (src === undefined) run(body, pageUrl);
		else if (isRemote(src)) result.remote.push(src);
		else load(resolve(src, pageUrl));
	}
	for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
		const href = attr(tag, 'href');
		if (attr(tag, 'rel') !== 'modulepreload' || !href) continue;
		if (isRemote(href)) result.remote.push(href);
		else load(resolve(href, pageUrl));
	}
	return result;
}

// Remote scripts the page's own scripts wait for. Without async, a remote script is either
// parser-blocking or deferred (defer, or a module), and the page's module scripts and
// DOMContentLoaded run only after it, so if it stalls they never run.
export function blockingRemoteScripts(html: string): string[] {
	const urls: string[] = [];
	// Pair each tag with its </script>, as scriptBytes does, so a tag quoted inside a script body
	// isn't read as one.
	for (const [, open] of html.matchAll(/(<script\b[^>]*>)[\s\S]*?<\/script>/g)) {
		const src = attr(open, 'src');
		if (!JS_TYPES.has(attr(open, 'type') ?? '') || src === undefined || !isRemote(src)) continue;
		// Empty the quoted values first, so "async" inside another attribute's value doesn't count.
		if (!/\sasync(?=[\s=>])/.test(open.replace(/"[^"]*"/g, '""'))) urls.push(src);
	}
	return urls;
}

// Every image URL a page's <img> and <source> tags name, in src or srcset.
export function imageUrls(html: string): string[] {
	const urls = new Set<string>();
	for (const [tag] of html.matchAll(/<(?:img|source)\b[^>]*>/g)) {
		const src = attr(tag, 'src');
		if (src) urls.add(src);
		for (const entry of (attr(tag, 'srcset') ?? '').split(',')) {
			const url = entry.trim().split(/\s+/)[0];
			if (url) urls.add(url);
		}
	}
	return [...urls];
}
