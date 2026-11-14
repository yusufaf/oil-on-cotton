// Only the launch hostname is indexed; staging and previews carry noindex.
export const LAUNCH_HOSTNAME = 'oiloncotton.com';

// Pages that are not rooms, relative to the base, as the sitemap lists them. The 404 page is never indexed.
export const HALL_PAGES = ['', 'about/', 'privacy/', 'takedown/'];

// Old pages that now live elsewhere: each route, relative to the base, maps to the route its
// redirect page in src/pages refreshes to. A redirect page carries noindex and never enters the sitemap.
export const REDIRECTS: Record<string, string> = { 'floor-plan/': '' };
