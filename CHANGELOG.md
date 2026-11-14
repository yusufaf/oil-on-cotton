# Changelog

## [1.0.0](https://github.com/yusufaf/oil-on-cotton/compare/oil-on-cotton-v0.0.1...oil-on-cotton-v1.0.0) (2026-11-14)


### ⚠ BREAKING CHANGES

* **site:** the site is served from oiloncotton.com at the root; yusufaf.dev/oil-on-cotton/ redirects there once the Pages custom domain is set.

### Features

* **artists:** match catalog pieces to artists from a sourced artists.yaml ([#9](https://github.com/yusufaf/oil-on-cotton/issues/9)) ([d647c00](https://github.com/yusufaf/oil-on-cotton/commit/d647c00eb1a0120ac7347fba240ec1dd7581ebad))
* **bot:** point the user agent at bot.oiloncotton.com and list a contact email ([#8](https://github.com/yusufaf/oil-on-cotton/issues/8)) ([a1d7188](https://github.com/yusufaf/oil-on-cotton/commit/a1d7188fec1af3fe8450c05c8f234fd07d3c9a46))
* **home:** draw the floor plan with a phone enfilade at /floor-plan/ ([#25](https://github.com/yusufaf/oil-on-cotton/issues/25)) ([c1fef7e](https://github.com/yusufaf/oil-on-cotton/commit/c1fef7e2a7bb3faf6295d95d792b72ccee43ab76))
* **home:** make the floor plan the home page ([#28](https://github.com/yusufaf/oil-on-cotton/issues/28)) ([7898293](https://github.com/yusufaf/oil-on-cotton/commit/7898293ed36013e5ddbdad4a00114df724bd8bed))
* **ingest:** add signed crawler and key directory ([#2](https://github.com/yusufaf/oil-on-cotton/issues/2)) ([aa752a0](https://github.com/yusufaf/oil-on-cotton/commit/aa752a05d4dbc152712aa092e9a249d4822f8640))
* **ingest:** weekly crawl that rereads pieces and rechecks skips monthly ([#6](https://github.com/yusufaf/oil-on-cotton/issues/6)) ([1ac7acb](https://github.com/yusufaf/oil-on-cotton/commit/1ac7acba04dce18b9c341d4494b803f2a00245ad))
* **rooms:** hang Caillebotte's Young Man at His Window in the Getty room ([#31](https://github.com/yusufaf/oil-on-cotton/issues/31)) ([ca0da40](https://github.com/yusufaf/oil-on-cotton/commit/ca0da40f86938bb8ec36fa89c011c8b85bdb659d)), closes [#30](https://github.com/yusufaf/oil-on-cotton/issues/30)
* **rooms:** hang Cézanne's Still Life with Apples in the Getty room ([#42](https://github.com/yusufaf/oil-on-cotton/issues/42)) ([c5bdc04](https://github.com/yusufaf/oil-on-cotton/commit/c5bdc04f69520e29765989796f40582f4f9e73f9)), closes [#41](https://github.com/yusufaf/oil-on-cotton/issues/41)
* **rooms:** hang curated public-domain works with museum labels ([#19](https://github.com/yusufaf/oil-on-cotton/issues/19)) ([bfbdc0f](https://github.com/yusufaf/oil-on-cotton/commit/bfbdc0f9939f8b37d11ced5148509c47b53ee721))
* **rooms:** hang Manet's Jeanne (Spring) in the Getty room ([#35](https://github.com/yusufaf/oil-on-cotton/issues/35)) ([f84a787](https://github.com/yusufaf/oil-on-cotton/commit/f84a78778873c457ed23c4d804a94eccf866d466)), closes [#32](https://github.com/yusufaf/oil-on-cotton/issues/32)
* **rooms:** hang Redon's Baronne de Domecy in the Getty room ([#39](https://github.com/yusufaf/oil-on-cotton/issues/39)) ([280c5f8](https://github.com/yusufaf/oil-on-cotton/commit/280c5f8683ebd3bc0106f031bef65741535ae65e)), closes [#38](https://github.com/yusufaf/oil-on-cotton/issues/38)
* **rooms:** room pages with the checklist, built from the catalog ([#10](https://github.com/yusufaf/oil-on-cotton/issues/10)) ([f23aca1](https://github.com/yusufaf/oil-on-cotton/commit/f23aca119b4e1ec69a82ae2aac359dd5c2b8ed43))
* **site:** about, privacy and takedown pages, removals and visit counting ([#13](https://github.com/yusufaf/oil-on-cotton/issues/13)) ([30a85e8](https://github.com/yusufaf/oil-on-cotton/commit/30a85e85ede98ba4cd352cfd9fe569f9a10de901))
* **site:** move the site to oiloncotton.com ([#14](https://github.com/yusufaf/oil-on-cotton/issues/14)) ([4739c26](https://github.com/yusufaf/oil-on-cotton/commit/4739c26f855813628e410287199f92f24eae1d79))
* **walls:** paint each wall from Hamly's 1949 Munsell key ([#29](https://github.com/yusufaf/oil-on-cotton/issues/29)) ([a3020db](https://github.com/yusufaf/oil-on-cotton/commit/a3020dbb3d14835b908d403a4c27b7436503a3e2))


### Bug Fixes

* **ingest:** classify tank tops as tops and knitted crewnecks as sweaters ([#12](https://github.com/yusufaf/oil-on-cotton/issues/12)) ([f26faf2](https://github.com/yusufaf/oil-on-cotton/commit/f26faf292e2c0411c83aefccc168f7e6f5a0fbec))
* **ingest:** read kids and combined sizes, add ties, gloves and onesies ([#5](https://github.com/yusufaf/oil-on-cotton/issues/5)) ([a64a878](https://github.com/yusufaf/oil-on-cotton/commit/a64a878e49163d9c1e6af51c6cf03606b83e193e))
* **rooms:** let a shop takedown keep its room's lede ([#21](https://github.com/yusufaf/oil-on-cotton/issues/21)) ([205fe7b](https://github.com/yusufaf/oil-on-cotton/commit/205fe7b156962786040166d50eada90ca4b2aa9e))
* **rooms:** load the visit counter async so a stall can't hide the filters ([#44](https://github.com/yusufaf/oil-on-cotton/issues/44)) ([2202738](https://github.com/yusufaf/oil-on-cotton/commit/22027382c1a16309d6f24f97ecdf2599258667bd))


### Performance Improvements

* **rooms:** load later hung works after the page has loaded ([#37](https://github.com/yusufaf/oil-on-cotton/issues/37)) ([7364777](https://github.com/yusufaf/oil-on-cotton/commit/7364777a355d7dc59af3d251a2cde72b70780636))
