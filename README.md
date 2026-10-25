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

A weekly job reads public product pages from a small number of museum shops whose terms allow it. Here is what it does and what it never does.

**What it does:**
- It identifies itself, and signs every request with [Web Bot Auth](https://datatracker.ietf.org/doc/draft-ietf-webbotauth-httpsig-protocol/). The `Signature-Agent` header in each request points to the public key directory.
- It reads only each shop's `/sitemap.xml` and the public product pages it lists.
- It honors `robots.txt`, waits at least one second between requests to the same shop, and backs off on `429` responses, following `Retry-After`.
- It keeps only facts: the product name, price, available sizes and URL.

**What it never does:**
- It never stores product descriptions or images.
- It never calls any shop's or platform's API.
- It never rotates user agents or uses proxies.

Shops whose terms prohibit automated collection are not crawled.

To ask for a listing to be removed, or for a shop to be excluded, open an issue on this repository. Takedown requests are handled within 48 hours.

## License

Code is MIT licensed. Product names, prices and links belong to the shops that publish them.
