---
version: alpha
name: Oil on Cotton
description: An independent index of museum shop apparel, staged as an exhibition. Each shop is a painted room; its clothing hangs as labels and an exhibition checklist.
colors:
  wall-getty: "#841B2D"
  wall-whitney: "#3A4B47"
  wall-met: "#1B4D3E"
  wall-lacma: "#36454F"
  wall-moma: "#5B504F"
  hall: "#B9B8B5"
  label: "#E9ECEB"
  label-hover: "#DEE3E1"
  ink: "#171B1A"
  plan-ink: "#22262A"
  rule: "#C9D0CE"
  on-wall: "#F1F3F2"
  on-wall-warm: "#F6F1F1"
typography:
  wall-title:
    fontFamily: Besley
    fontSize: 76px
    fontWeight: 400
    lineHeight: 1.04
    letterSpacing: -0.02em
  hall-title:
    fontFamily: Besley
    fontSize: 56px
    fontWeight: 400
    lineHeight: 1.05
  wall-lede:
    fontFamily: Schibsted Grotesk
    fontSize: 24px
    fontWeight: 400
    lineHeight: 1.4
  sheet-title:
    fontFamily: Besley
    fontSize: 34px
    fontWeight: 400
    lineHeight: 1.1
  artwork-title:
    fontFamily: Besley
    fontSize: 19px
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: Schibsted Grotesk
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.5
  item:
    fontFamily: Schibsted Grotesk
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.5
  meta:
    fontFamily: Schibsted Grotesk
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.55
  label-text:
    fontFamily: Schibsted Grotesk
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.45
  credit:
    fontFamily: Schibsted Grotesk
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  price:
    fontFamily: Schibsted Grotesk
    fontSize: 17px
    fontWeight: 400
    fontFeature: '"tnum" 1'
rounded:
  none: 0px
spacing:
  gutter: 48px
  gutter-phone: 20px
  wall-top: 96px
  sheet-x: 48px
  sheet-y: 44px
  row-y: 13px
  hang-gap: 104px
components:
  checklist-sheet:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: 44px 48px 52px
  checklist-row:
    textColor: "{colors.ink}"
    typography: "{typography.item}"
    padding: 13px 0
  checklist-row-hover:
    backgroundColor: "{colors.label-hover}"
  hang-label:
    backgroundColor: "{colors.label}"
    textColor: "{colors.ink}"
    typography: "{typography.label-text}"
    rounded: "{rounded.none}"
    padding: 18px 20px 20px
    width: 256px
  room-wall:
    textColor: "{colors.on-wall}"
    typography: "{typography.wall-title}"
  plan-room:
    textColor: "{colors.on-wall}"
    rounded: "{rounded.none}"
---

# Oil on Cotton: design language

The spike canvas that this document records is at https://claude.ai/artifact/PKWhGdaGNXYaCWdVEyrUoa. It has seven boards, and its data is real shop data read on 2026-10-25. The user signed off on the direction ("love the direction"), on type pairing A, and on the floor-plan home page. An outside review by Gemini scored it 20% likely to read as AI-made, with "the concept reads as 100% human art direction". The execution fixes it asked for are already applied.

The site is called **Oil on Cotton** (named 2026-10-25). The name bends the medium line of a museum label ("Oil on canvas") to fit clothing. Its .com was free, a USPTO knockout search found no identical mark, and no brand of that name turned up on the web. The nearest mark is the unrelated apparel brand COTTON ON. The concept is still "The Hang".

## Overview

The index is staged as an exhibition about museum shop apparel.

- **Rooms.** Each shop is a room, and each room has its own painted wall.
- **The checklist.** Most clothing is listed on a printed exhibition checklist mounted on the wall. That is the typed list of works that every real show produces.
- **Hung works.** Some garments reproduce a public-domain artwork, and a curator has verified the match. Those are grouped under the artwork itself. The artwork hangs once, and its museum label lists "Made after this painting", the way a real wall label would.
- **The hall and home page.** The home page is a drawn floor plan on a light grey hall.

Three ideas carry everything:

1. **Painted walls, not themes.** Colour comes from a real historical colour standard, and each wall says what it is painted with ("Wall: Dull Blackish Green, after Ridgway, 1912").
2. **Labels, not cards.** Information sits on label stock: flat, square, cool-white board. Labels are mounted on walls; they never tile into a grid of cards.
3. **Facts, not pitch.** Copy states counts, prices, artists and dates. It never sells.

Most rooms are contemporary museums whose merchandise reproduces in-copyright work. In those rooms the checklist is the whole room, and that is expected. The Whitney spike room has 97 wearable pieces and no hung works. Design the checklist as the primary surface; the hang is the occasional highlight.

## Colors

**Wall names** come from Robert Ridgway, *Color Standards and Color Nomenclature* (1912, public domain). The current hex values are provisional ISCC-NBS centroid approximations, taken from Jaffer's NBS/ISCC "R" dictionary. They are not measured from the plates. Before launch, each wall is recomputed from Hamly's 1949 Munsell key for the Ridgway standards (JOSA 39:592-599), converted to sRGB through the Munsell renotation data, and cross-checked against two plate scans: the Science History Institute and BHL. Publish the ΔE2000 between source and shipped value. Any wall with ΔE above 5 is labelled "after Ridgway's <name>".

| Token | Ridgway name | Hex (provisional) | Luminance | Light text contrast | Room |
|---|---|---|---|---|---|
| wall-getty | Ox-blood Red | #841B2D | 0.059 | 8.63:1 (#F6F1F1) | Getty Museum Store |
| wall-whitney | Dull Blackish Green | #3A4B47 | 0.064 | 8.27:1 | Whitney Shop |
| wall-met | Bottle Green | #1B4D3E | 0.059 | 8.65:1 | The Met Store (hand-listed) |
| wall-lacma | Dark Payne's Gray | #36454F | 0.056 | 8.88:1 | LACMA Store |
| wall-moma | Bone Brown | #5B504F | 0.085 | 6.97:1 | MoMA Design Store (hand-listed) |
| hall | Light Gull Gray | #B9B8B5 | 0.479 | ink 8.76:1 | Floor plan, room list |

**Rules:**
- **Wall luminance.** Every wall has relative luminance at or below 0.10, so light text passes 4.5:1 at any size. A new wall must meet this, or sit at or above 0.40 with ink text. Nothing in between: mid-tone walls make text marginal.
- **No brand colours.** No room uses its museum's own brand colour. Getty Blue, SFMOMA red and the Met's red are excluded.
- **Label stock** (#E9ECEB) is a cool foam-board white. It is deliberately not a Ridgway colour, and **never cream**.
- **Ink.** Ink (#171B1A) on label stock is 14.62:1. Plan walls use plan-ink (#22262A).
- **Rules** (#C9D0CE) on label stock are decorative separators only (1.32:1). Never use them to carry meaning.
- **Text colour.** No grey text on coloured walls. Text on a wall is on-wall at full strength, or on-wall-warm for red walls.

## Typography

Pairing A won against B (Brygada 1918 + Familjen Grotesk) and C (Sofia Sans Extra Condensed + Familjen Grotesk). It uses two families, both OFL and both on Google Fonts and Fontsource:

- **Besley.** An antique Clarendon, the face of 19th-century labels and posters. Use it for titles on walls, sheet headings, and artwork titles on labels.
- **Schibsted Grotesk.** A plain grotesk that reads cleanly at 13 to 17px on label stock. Use it for everything else.

**Rules:**
- Wall titles are lettered on the wall at 44 to 76px (`clamp(44px, 6vw, 76px)`), with letter-spacing -0.02em.
- Artwork titles are italic Besley, because the titles of works are italicised by convention: *Irises*, 1889. Use italic for nothing else.
- Prices always use tabular figures.
- Sentence case everywhere. No all-caps labels, eyebrows or headings.
- Two weights of Schibsted (400, 500), plus 600 for the wordmark and for active filters. Besley 400 only, roman and italic. Self-host subset files in production, with at most 4 font files.

## Layout

- **Container.** Content sits in a max-width 1280px container with a 48px gutter, or 20px under 720px.
- **Room page order:**
  1. header: wordmark, then Floor plan, All rooms, Guides, About
  2. wall title block: H1, lede, a meta line with the check date and the independence statement, and the paint note at the bottom right
  3. hung works, if any
  4. checklist sheet
  5. footer
- **Wall title block** is a 7:3 grid. The paint note sits bottom-right, and stacks under the text on phones.
- **Checklist rows** use four columns: Piece (5fr), Artist (3fr), Kind (2fr), Price (88px, right-aligned). Under 720px a row becomes the name and price on one line, with artist and kind beneath.
- **Hang.** The artwork is at most 640px wide. The label is 256px wide, vertically centred on the artwork, with a 104px gap. Real labels are small next to the work, so the painting needs wall around it.
- **Floor plan:**
  - **Fixed layout, not data-driven.** Rooms come in three size classes: L (518 × 318), M (452 × 318) and S (about 240 × 232). Counts are shown as text.
  - **Shell.** The outer wall is 14px poché and the inner walls are 6px.
  - **Doorways.** A doorway is a gap in the wall. **No door-swing arcs**; they read as clip art.
  - **Closed rooms.** A shop under terms review is a hatched "Closed" room.
  - **Phones.** The rooms stack as a vertical corridor (enfilade), in the same order. This is not yet drawn.
  - **Plain list.** A plain-text room list sits directly under the plan, for keyboard users, screen readers and crawlers.

## Elevation & Depth

Flat. Labels and the checklist sheet sit flush on the wall, with no shadow. The only shadow in the system belongs to hung artworks, as a physical object casting onto the wall: `0 1px 0 rgba(0,0,0,0.25), 0 18px 28px -18px rgba(0,0,0,0.55)`. Never apply it to labels, sheets or controls.

## Shapes

Everything is square (`rounded.none`). Label stock is cut board; walls are walls. There are no pills, no rounded cards and no rounded buttons. Focus outlines may use a 1px radius.

## Components

- **checklist-sheet.** A label-stock panel holding the room's full list.
  - Header: "Checklist" in sheet-title, with "Showing N of M" on the right.
  - Below the header, the filters, then the sort. Each is a row of text buttons with counts, for example "T-shirts 37".
  - Filter groups, as on the spike: All, T-shirts ("T-shirts and tops" in a room with a tank top or camisole), Sweatshirts (with sweaters), Hoodies, Jackets and shirts, Hats, Scarves and ties, Socks, Other. Empty groups are left out. Sort: "Price, low to high" (default), "Price, high to low", "Name".
  - Without JavaScript the whole list shows in the default order and the buttons stay hidden.
  - The active filter is weight 600 with a 2px underline. Filter buttons are real `<button>` elements with `aria-pressed`, at least 44px tall.
- **checklist-row.**
  - **Link.** The piece name is the link to the shop (`target=_blank`, `rel="nofollow noopener"`, later routed through `/go/`). It has no underline at rest; it gets an underline on row hover and on focus.
  - **Separators.** Rows are separated by 1px rule lines.
  - **Optional fields.** Artist and kind are optional, and a blank artist cell stays blank, never filled with a dash. Kids' sizes read "T-shirt (kids)".
  - **Sizes line.** Under the piece name, in meta size: sizes in stock, then the sold-out ones ("S, M, L · 2XL sold out"). One-size and sold-out pieces have no sizes line.
  - **Unavailable items.** A sold-out item shows "Sold out" in the price column.
  - **Sales.** Only a single price with a higher compare-at price counts as a sale. The price column shows the price with "was $65" beneath it, and the sizes line opens with "On sale as of 26 October". The sale marks drop after 14 days without a fresh check. That is 14, not 7, because the crawl is weekly and data PRs merge days later. The site rebuilds daily so the expiry applies.
- **hang-label.** A museum tombstone in a fixed order:
  1. artist name (600)
  2. nationality and dates
  3. artwork title (italic Besley) and year
  4. owning collection and accession number, then "Image in the public domain."
  5. a divider, then "Made after this painting" with one line per piece: the name as a link, the price or "Sold out" on the right
  6. "Sold by <shop>" in credit size

  Accession numbers must be verified against the owning museum before shipping.
- **room-wall.** A room lives at `/rooms/<museum id>/`, for automated shops with at least 8 pieces. The H1 reads "Apparel from the <shop name>". The lede is facts from the ledger. The meta line carries the check date and the independence sentence, naming the museum. The paint note reads "Wall: <Ridgway name>" on one line and "after Ridgway, 1912" on the next.
- **plan-room.** The whole room is one link, with its accessible name taken from its text. It shows the shop name (Besley) and a meta line with the count and wall name. It is filled with the room's wall colour. The room name underlines on hover.
- **Independence line.** It appears on every page: in the room meta line, and in the footer of the hall pages. Standard text: "An independent, non-commercial index. It is not affiliated with or endorsed by any museum. Names identify the shops; trademarks belong to their owners."

## Do's and Don'ts

**Do:**
- Name the paint.
- State counts and prices.
- Let rooms with no public-domain work be all checklist.
- Credit every artwork image fully.
- Keep museum names to plain text.

**Don't use these fonts:** Inter, Geist, Space Grotesk, Fraunces, Instrument Serif, DM Sans, IBM Plex Mono, Playfair, Bricolage Grotesque, Manrope, Plus Jakarta Sans, Satoshi, General Sans, Clash. No monospace anywhere.

**Don't use these colours or effects:** indigo or purple, gradient text, glow, aurora, blobs, glassmorphism, cream grounds, terracotta accents.

**Don't use these layout patterns:**
- cards nested in cards, or identical card grids
- accent edge bars
- pill badges, or a pill above the H1
- emoji as icons, or an icon above each heading
- ALL-CAPS eyebrows
- numbering on anything that is not a fixed sequence: no catalogue numbers on a filterable list, no "Room I/II"
- an arrow on every link, dot leaders
- everything centred
- a hero stat number
- the same zoom on every hover
- underlines on every link at rest. In lists and nav, underline on hover or for the current item. Underline inline links in running text.

**Don't use these named clichés:**
- navy + teal + mono numbered headings
- cream + serif + terracotta with hairline broadsheet rules
- near-black + one acid accent

**Affiliation guard.** Nothing may echo a museum identity:
- the Whitney's Responsive W or tight Neue Haas
- MoMA's Franklin Gothic
- the Met's red stacked wordmark
- the Guggenheim's Inter-derived face, or Playfair
- SFMOMA red
- Getty Blue
- a single bold monogram

Never use logos. The test is whether someone who has seen a room page for 5 seconds answers "who runs this site?" with "a museum". If they do, the styling fails.

## Voice and copy

Claude drafts all copy from each hub's fact ledger: counts, price spread, size gaps, the cheapest piece per kind, and one sourced fact with its URL. The user approves every line.

- **Traceable.** Every sentence must trace to a ledger entry.
- **No AI vocabulary.** Banned words: delve, crafting, passionate, seamless, leverage, robust, journey, elevate, empower, unlock, transform, showcase, testament, pivotal, vibrant, meticulous, multifaceted, curated (as a boast).
- **No AI patterns.** Banned: "not just X, but Y", reflexive groups of three, exclamation marks, em dashes in site copy.
- **Swap test.** Every intro must fail the swap test, meaning it contains something true only of that room. No two intros share an opening move.
- **Tone.** Dry and specific. For example: "97 pieces to wear, from a $16 hair clip to a $500 Carol Bove scarf. Basquiat turns up on 13 of them, Calder on 9."

## Imagery

- Only public-domain or CC0 artwork images. Never product photos, museum logos or shop imagery.
- An artwork hangs only when a curator has verified that the garment reproduces that exact work.
- Prefer the owning museum's open-access image, and record its source URL, licence and retrieval date. The spike uses a Wikimedia Commons public-domain copy of *Irises*; production replaces it with the Getty Open Content file.
- No AI-generated imagery. Wall texture, if used at all, is a real CC0 plaster scan (Poly Haven or ambientCG), under 40KB.

## Motion

None by default. No scroll-triggered animation and no fade-ups. Hover changes are instant: underline on, row tint on. A single room-entry transition may be added later, but only if it respects `prefers-reduced-motion`.

## Accessibility and performance

- Every text pair passes WCAG AA, as shown in the contrast table above.
- Rooms are named in text, never by colour alone.
- Focus is visible everywhere: a 2px outline in the current colour (3px on the hall).
- Floor-plan rooms are links with accessible names, and decorative plan parts are `aria-hidden`.
- Budget, enforced with Lighthouse CI:
  - LCP under 2.0s on throttled mobile
  - under 50KB of JS per room (the filter island only)
  - at most 4 subset font files
  - each artwork image under 200KB at display size

## Open items

- Measured Ridgway values via Munsell, with ΔE recorded.
- Draw the phone enfilade for the floor plan.
- Replace the working wordmark "The Hang" with "Oil on Cotton" on the canvas and in the build.
- Read Brooklyn and Guggenheim terms in a browser before their rooms open.
- Add LACMA, Met and MoMA room boards when their data is in.
