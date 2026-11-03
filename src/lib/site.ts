// Only the launch hostname is indexed; staging and previews carry noindex.
export const LAUNCH_HOSTNAME = 'oiloncotton.com';

// Pages that are not rooms, relative to the base, as the sitemap lists them. The 404 page is never indexed.
export const HALL_PAGES = ['', 'about/', 'privacy/', 'takedown/'];

// Built but unlisted and noindex, even on the launch hostname. The floor plan waits here for its
// task test (DESIGN.md, Floor plan).
export const PREVIEW_PAGES = ['floor-plan/'];
// Where the floor plan is served; '' once it becomes the home page.
export const PLAN_PAGE = 'floor-plan/';
