// @ts-check
import { defineConfig } from 'astro/config';

// Staging lives at yusufaf.dev/oil-on-cotton/ (a GitHub Pages project page under the
// user site's custom domain). At launch: site https://oiloncotton.com, base '/', add public/CNAME.
// https://astro.build/config
export default defineConfig({
	site: 'https://yusufaf.dev',
	base: '/oil-on-cotton',
});
