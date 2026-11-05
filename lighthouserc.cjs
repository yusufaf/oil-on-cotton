// Lighthouse CI for DESIGN.md's performance budget, run by the lighthouse job in ci.yml after
// `pnpm build`. It measures the hall and every room in the sitemap on Lighthouse's default
// throttled mobile. check:dist enforces the JS, font and image budgets without a browser.
const { readFileSync } = require('node:fs');

// An uncommon port, so a dev server on Astro's default 4321 cannot be the one measured.
const PORT = 4329;
const ORIGIN = `http://localhost:${PORT}`;
const urls = [...readFileSync('dist/sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
	.map((m) => new URL(m[1]).pathname)
	.filter((path) => path === '/' || path.startsWith('/rooms/'))
	.map((path) => ORIGIN + path);
if (urls.length === 0) throw new Error('dist/sitemap.xml lists no hall or room pages to measure');

module.exports = {
	ci: {
		collect: {
			startServerCommand: `pnpm preview --port ${PORT}`,
			// astro preview moves to another port when this one is taken, and LHCI then only warns
			// and measures whatever is listening here. Keep the port free when running this locally.
			startServerReadyPattern: `localhost:${PORT}`,
			url: urls,
			numberOfRuns: 3,
			settings: { onlyCategories: ['performance'] },
		},
		assert: {
			assertions: {
				// Lantern simulates LCP from the page's requests, so the runner's speed barely moves it, with
				// one exception: when the visit counter finishes loading before the runner's first paint,
				// Lantern counts it as render blocking and LCP reads 150 ms (one simulated round trip) higher.
				// Getty reads about 1805 ms, or 1955 with that step, so a failure means a page got heavier.
				'largest-contentful-paint': ['error', { maxNumericValue: 2000, aggregationMethod: 'median' }],
				// The visit counter's 8 KB share of the 50 KB JS budget (2.8 KB today); check:dist holds
				// first-party JS, inline or served as files, under 42 KB. This is every request not from
				// localhost, and check:dist allows no remote script or image but the counter, so the counter
				// is all it holds. pessimistic: every run must pass, not just the best one.
				'resource-summary:third-party:size': ['error', { maxNumericValue: 8 * 1024, aggregationMethod: 'pessimistic' }],
				'resource-summary:font:count': ['error', { maxNumericValue: 4, aggregationMethod: 'pessimistic' }],
			},
		},
		upload: { target: 'filesystem', outputDir: 'lhci-reports' },
	},
};
