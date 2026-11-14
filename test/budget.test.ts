import { describe, expect, it } from 'vitest';
import { blockingRemoteScripts, fontFiles, imageUrls, pageCss, parseUnicodeRange, scriptBytes } from '../src/lib/budget';

const reader = (files: Record<string, string>) => (url: string) => files[url];

describe('parseUnicodeRange', () => {
	it('reads ranges, wildcards, lists and lower case', () => {
		expect(parseUnicodeRange('U+0-FF')).toEqual([[0, 0xff]]);
		expect(parseUnicodeRange('U+??')).toEqual([[0, 0xff]]);
		expect(parseUnicodeRange('U+4??')).toEqual([[0x400, 0x4ff]]);
		expect(parseUnicodeRange('U+131,U+152-153')).toEqual([
			[0x131, 0x131],
			[0x152, 0x153],
		]);
		expect(parseUnicodeRange(' u+20ac ')).toEqual([[0x20ac, 0x20ac]]);
	});

	it('throws on anything else', () => {
		expect(() => parseUnicodeRange('latin')).toThrow();
	});
});

describe('fontFiles', () => {
	const besley =
		'@font-face{font-family:Besley;font-style:normal;src:url(/_astro/besley.woff2)format("woff2"),url(/_astro/besley.woff)format("woff")}';
	const css =
		besley +
		'@font-face{font-family:Schibsted;src:url(/_astro/latin-ext.woff2)format("woff2-variations");unicode-range:U+100-2BA,U+1E00-1E9F}' +
		'@font-face{font-family:Schibsted;src:url(/_astro/latin.woff2)format("woff2-variations");unicode-range:U+??,U+2000-206F}';

	it('counts the first src of faces the text can use', () => {
		expect(fontFiles(css, 'Irises, 1889 – Getty')).toEqual(['/_astro/besley.woff2', '/_astro/latin.woff2']);
	});

	it('counts a subset the text needs', () => {
		const files = fontFiles(css, 'Ōtsuka');
		expect(files).toContain('/_astro/latin-ext.woff2');
		expect(files).toHaveLength(3);
	});

	it('decodes numeric character references', () => {
		expect(fontFiles(css, '&#x14C;tsuka')).toContain('/_astro/latin-ext.woff2');
		expect(fontFiles(css, '&#332;tsuka')).toContain('/_astro/latin-ext.woff2');
	});

	it('counts a repeated face once', () => {
		expect(fontFiles(besley + besley, 'a')).toEqual(['/_astro/besley.woff2']);
	});

	it('reads spaced, quoted CSS', () => {
		const spaced = '@font-face {\n  font-family: "X";\n  src: url("/a.woff2") format("woff2");\n}';
		expect(fontFiles(spaced, 'a')).toEqual(['/a.woff2']);
	});

	it('skips inline data fonts', () => {
		expect(fontFiles('@font-face{font-family:X;src:url(data:font/woff2;base64,AAAA)}', 'a')).toEqual([]);
	});
});

describe('pageCss', () => {
	const html =
		'<style>a{}</style><link rel="stylesheet" href="/_astro/s.css"><link rel="icon" href="/favicon.svg">';

	it('joins style blocks and linked stylesheets', () => {
		const { css, missing } = pageCss(html, reader({ '/_astro/s.css': 'b{}' }));
		expect(css).toContain('a{}');
		expect(css).toContain('b{}');
		expect(missing).toEqual([]);
	});

	it('lists stylesheets it cannot read', () => {
		expect(pageCss(html, reader({})).missing).toEqual(['/_astro/s.css']);
	});
});

describe('scriptBytes', () => {
	it('counts inline scripts in UTF-8 bytes', () => {
		expect(scriptBytes('<script type="module">abc</script>', '/', reader({})).bytes).toBe(3);
		expect(scriptBytes('<script>é</script>', '/', reader({})).bytes).toBe(2);
	});

	it('skips data scripts', () => {
		expect(scriptBytes('<script type="application/ld+json">{"a":1}</script>', '/', reader({})).bytes).toBe(0);
	});

	it('lists remote scripts without counting them', () => {
		const result = scriptBytes(
			'<script async src="https://analytics.oiloncotton.com/s.js" data-website-id="x"></script>',
			'/',
			reader({}),
		);
		expect(result.remote).toEqual(['https://analytics.oiloncotton.com/s.js']);
		expect(result.bytes).toBe(0);
	});

	it('follows local files, their imports and modulepreloads, each once', () => {
		const a = 'import"./b.js";1';
		const b = 'import{x}from"./a.js";';
		const c = '2';
		const result = scriptBytes(
			'<script type="module" src="/_astro/a.js"></script><link rel="modulepreload" href="/_astro/c.js">',
			'/',
			reader({ '/_astro/a.js': a, '/_astro/b.js': b, '/_astro/c.js': c }),
		);
		expect(result.bytes).toBe(a.length + b.length + c.length);
		expect(result.missing).toEqual([]);
	});

	it('lists local files it cannot read', () => {
		expect(scriptBytes('<script type="module" src="/_astro/gone.js"></script>', '/', reader({})).missing).toEqual([
			'/_astro/gone.js',
		]);
	});

	it('resolves imports under a base path', () => {
		const result = scriptBytes(
			'<script type="module" src="/preview/_astro/a.js"></script>',
			'/preview/rooms/getty/',
			reader({ '/preview/_astro/a.js': 'import"./b.js"', '/preview/_astro/b.js': '' }),
		);
		expect(result.missing).toEqual([]);
	});
});

describe('blockingRemoteScripts', () => {
	it('lists remote scripts that load deferred, as modules or parser-blocking', () => {
		const html =
			'<script defer src="https://a.example/s.js"></script><script src="https://b.example/s.js"></script><script type="module" src="https://c.example/m.js"></script>';
		expect(blockingRemoteScripts(html)).toEqual(['https://a.example/s.js', 'https://b.example/s.js', 'https://c.example/m.js']);
	});

	it('passes async remote scripts, local scripts and data scripts', () => {
		const html =
			'<script async src="https://analytics.oiloncotton.com/s.js" data-website-id="x"></script><script defer src="/_astro/a.js"></script><script type="module">1</script><script type="application/ld+json" src="https://a.example/d.json"></script>';
		expect(blockingRemoteScripts(html)).toEqual([]);
	});
});

describe('imageUrls', () => {
	it('reads src and srcset of picture sources and images', () => {
		const html =
			'<picture><source type="image/avif" srcset="/x-640.avif 640w, /x-960.avif 960w, /x-1280.avif 1280w" sizes="(max-width: 720px) calc(100vw - 40px), 640px">' +
			'<img src="/x-960.webp" srcset="/x-640.webp 640w, /x-960.webp 960w" alt="Irises, a bed"></picture>';
		expect(imageUrls(html).sort()).toEqual(
			['/x-640.avif', '/x-960.avif', '/x-1280.avif', '/x-960.webp', '/x-640.webp'].sort(),
		);
	});

	it('ignores scripts and data attributes', () => {
		expect(imageUrls('<script src="/a.js"></script><img data-src="/lazy.png" src="/b.png">')).toEqual(['/b.png']);
	});
});
