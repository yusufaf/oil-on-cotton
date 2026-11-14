// Plans this deploy's IndexNow submission. IndexNow tells Bing and the other engines that share it
// which pages changed, so they recrawl them soon instead of whenever they next read the sitemap;
// Google ignores it. Runs in deploy-pages.yml after `pnpm build` and `pnpm check:dist`:
// - hashes each sitemap page (src/lib/indexnow.ts) into dist/indexnow-pages.json, which deploys
//   with the site
// - writes the changed, new and removed pages, against the copy the live site still serves, to
//   indexnow-request.json; the live copy records what was last deployed, so no Actions cache is
//   needed
// - the workflow's indexnow job POSTs that request once the deploy succeeds
// Only a launch build plans, and a failure here submits nothing rather than failing the deploy.
// Usage: node scripts/indexnow.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST, planSubmission } from '../src/lib/indexnow.ts';

const DIST = 'dist';
const REQUEST = 'indexnow-request.json';

try {
	const { request, manifest, skipped } = await planSubmission(DIST);
	writeFileSync(REQUEST, JSON.stringify(request));
	// Last, so a failure above ships no manifest and the next deploy submits every page.
	if (manifest) writeFileSync(join(DIST, MANIFEST), JSON.stringify(manifest));
	console.log(
		skipped
			? `IndexNow: ${skipped}, nothing to submit`
			: `IndexNow: ${request.urlList.length} URLs to submit (${Object.keys(manifest ?? {}).length} pages)`,
	);
} catch (error) {
	// A crawl hint must never stop a deploy: warn and submit nothing.
	console.log(`::warning title=IndexNow::${error instanceof Error ? error.message : String(error)}`);
	writeFileSync(REQUEST, JSON.stringify({ urlList: [] }));
}
