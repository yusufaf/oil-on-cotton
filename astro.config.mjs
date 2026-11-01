// @ts-check
import { defineConfig } from 'astro/config';

// Served by GitHub Pages at oiloncotton.com. The custom domain is set in the repository's Pages
// settings (an Actions deploy ignores public/CNAME). Only this hostname is indexed: see
// LAUNCH_HOSTNAME in src/lib/site.ts.
// https://astro.build/config
export default defineConfig({
	site: 'https://oiloncotton.com',
});
