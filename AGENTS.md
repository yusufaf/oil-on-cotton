## Project rules

- Read `DESIGN.md` before touching anything visual. Its Do's and Don'ts are hard rules, not suggestions.
- `data/museums.yaml` records the terms review for each shop. Never automate a shop unless its verdict is `listed` or `listed-noncommercial`; `test/museums.test.ts` enforces this.
- Ingest stores facts only (name, price, sizes, URL). Never store product descriptions or images, and never call a Shopify API or MCP endpoint (including `products.json` and `.js` endpoints): Shopify's API Terms §2.3.14 forbid building a product index. `catalogItemSchema` is strict so new fields need a deliberate schema change.
- Every crawler request goes through `Crawler` in `ingest/crawler.ts`, which signs it, checks robots.txt and spaces requests. Never add an unsigned or unspaced fetch to a shop.
- `bot/` is the Fly app that serves the key directory and the bot's about page. It has no dependencies; `test/bot.test.ts` checks it against `web-bot-auth`.
- Site copy is drafted from per-room fact ledgers. No em dashes, and none of the banned words listed in `DESIGN.md`.
- Use pnpm. Commits follow Conventional Commits; data updates use `chore(data): ...`.
- Hosting is GitHub Pages (`deploy-pages.yml`). Until launch the site is served at `yusufaf.dev/oil-on-cotton/`, so build internal links with `href()` from `src/lib/paths.ts`, never a bare `/`.
- `main` is protected: work on a branch and merge through a PR once the `build` check passes.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
