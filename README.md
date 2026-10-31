# Oil on Cotton

An independent, non-commercial index of clothing sold by museum shops. Each shop is a room. Every piece links to the shop that sells it, and nothing is sold here.

Oil on Cotton is not affiliated with or endorsed by any museum. Shop and museum names identify the shops; trademarks belong to their owners.

## Develop

```sh
pnpm install
pnpm dev       # http://localhost:4321
pnpm test      # astro check + vitest
pnpm build
```

The design language is in [DESIGN.md](DESIGN.md). The museum list, and the terms review behind each entry, is in [data/museums.yaml](data/museums.yaml).

## Crawler

OilOnCottonBot reads public pages from the few museum shops whose terms allow it. It runs every Monday and opens or updates a pull request with the results. Its about page and public key are at [bot.oiloncotton.com](https://bot.oiloncotton.com).

**What it does:**
- It identifies itself as `OilOnCottonBot`, and signs every request with [Web Bot Auth](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/). The `Signature-Agent` header points to the key directory, which is itself signed.
- It reads each shop's `robots.txt`, its clothing collection pages, and the product pages those collections link to. Product pages it has found not to be clothing are rechecked monthly, not weekly.
- It honors `robots.txt` and `Crawl-delay`, waits at least one second between requests to the same shop, and follows `Retry-After` on `429`. If a shop keeps throttling, it stops and keeps the previous week's data.
- It keeps only facts: the product name, price, sizes in stock and URL.

**What it never does:**
- It never stores product descriptions or images.
- It never calls any shop's or platform's API.
- It never rotates user agents or uses proxies.

Shops whose terms prohibit automated collection are not crawled.

To ask for a listing to be removed, or for a shop to be excluded, email bot@oiloncotton.com or open an issue on this repository. Takedown requests are handled within 48 hours.

### Running it

The signing key is an Ed25519 seed held in two secret stores: `WEB_BOT_AUTH_KEY` on this repository for the crawler, and on the `oil-on-cotton-bot` Fly app for the key directory (`bot/`). `pnpm keygen` prints a new seed on stdout, to be piped into both.

```sh
pnpm ingest --smoke            # a few signed requests per shop
pnpm ingest --museum getty --limit 5 --dry-run
pnpm ingest                    # writes data/catalog.json and data/hosts.json
```

In Actions, the `ingest` workflow runs a full crawl weekly; run it by hand in `smoke` mode to check access, or `full` mode to crawl now (with `refresh` to also recheck pages skipped as not clothing, after classifier changes). GitHub disables the schedule after 60 days without a commit, which merging the data PRs prevents; if it lapses, re-enable it with `gh workflow enable ingest.yml`.

## License

Code is MIT licensed. Product names, prices and links belong to the shops that publish them.
