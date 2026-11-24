# Design system

The rule: **a real product, simplified to what the reader needs, framed with intent, every motion with a cause.**

All values live as tokens at the top of `public/css/style.css`. Change the token, not the component.

## Brand

- **The mark is |M|:** the name written as a modulus, the magnitude without the sign. As a theme,
  it means only what matters, no noise, which is the restraint the whole UI follows.
- **Drawing:** a yellow (#f5c518) M with round ends, between two thin light bars, on a dark tile
  (#141416, radius 112 at 512). The bars are thinner and taller than the letter, with clear
  air between, as typeset maths sets them; equal-weight bars read as "IMI".
- **No text in the SVG:** the mark is paths only, so it never depends on a font.
- **Sources:** `public/favicon.svg` (the mark), `public/icon-maskable.svg` (full-bleed, mark at
  78% inside the safe zone), `public/og-card.svg` (share card). Regenerate every PNG and the `.ico`
  with `scripts/build-brand.mjs`.
- **Rejected in exploration:**
  - an answer-sheet bubble grid (generic, and only about exams);
  - a pinned sheet (any notes app);
  - a weekly-cycle ring (reads as a spinner);
  - a dot-matrix M (noise at 16px);
  - yellow bars around a white M (the accent framed the name instead of being it).

## Colour

- **One neutral family.** The warm-grey canvas (`--canvas` #f6f5f4) is the page; white
  (`--surface`, `--raised`) appears only where something is lifted on purpose: the pinned
  announcement, this week's syllabus, the current phase test, sheets of rows, fields.
- **Five inks:** `--text-strong` (titles), `--text-body` (reading), `--text` (secondary),
  `--text-muted` (meta, AA on canvas), `--text-faint` (placeholders and fine print only).
- **One accent: the brand yellow** of the M mark (`--primary` #f5c518). It fills primary buttons
  with near-black text; as text it uses its dark step `--primary-text`. No other hue decorates.
- **Status means status:** green only for "Active", red only for errors and delete.
- **Dark mode** follows the OS (`prefers-color-scheme`). Depth comes from lighter surface steps,
  not shadows; recessed blocks inside a lifted card use `--inset`, never a near-black hole.

## Type

- System font stack, one family. Weights 400 (reading), 500 (controls, labels), 600 (titles).
- Scale: 12 caption · 13 meta · 14 UI · 15 body · 17 card title · 20 lead · 26 page title.
- Sentence case everywhere. Mono only for code; numbers use `tabular-nums` instead.

## Space and shape

- 4px grid. Words keep at least 12px from any edge (cards use 16–24px).
- Title to its meta: 4–6px. Item to the next item: 24px (a hairline between).
- Radii: 6 small controls · 8 fields and buttons · 10 tiles and toasts · 12 cards and sheets.
- Controls are 36px (30px small); touch actions on contacts and the footer are 44px.
- Reading column 720px; admin 1040px.

## Composition rules we hold to

- Navbar: brand, then the section links beside it, the bell anchoring the right edge. No borders
  on links: hover is an inset rounded fill (12px clear of the bar's edges), the current page is a
  2px bar flush on the header's bottom rule. Hover styles apply only on real pointers
  (`@media (hover: hover) and (pointer: fine)`), so taps never leave them stuck.
- The page title is a label, not a hero: filters and search share one toolbar row, so posts start
  high on the screen.
- The feed is a changelog: date and weekday in a 96px gutter, the post beside it. Pinned posts use
  the same grid on a lifted card; on phones the gutter folds into the meta line. Bodies longer
  than seven lines fold to five behind "Show more".
- Titles are type, not pictures: emoji typed into a title are dropped when rendered.
- **This week rail:**
  - On desktop (1100px and up) it sits beside the reading column, in a 1104px frame shared by the
    header and footer. It is one sheet, sections divided by hairlines, never a box inside a box.
  - The lead is chosen from the data: an upcoming or running phase test, else this week's
    syllabus, else the latest key. Each page leaves out its own section.
  - On narrower screens only home keeps it, as a compact two-row lead above the feed.
  - It only points to what the pages already do. No new actions, no backend.
- **New since your last visit:** per-section timestamps in the browser. "New" goes in the date
  gutter, an "Earlier" rule follows the run of new posts, and nav links get a 5px dot. A first
  visit marks nothing.
- **Numerals:** Martian Mono (OFL, self-hosted in `public/fonts/`), only for dates, the
  countdown and the exam-date figure, never for words.
- **Timestamps:** the server stores local time with no zone (`datetime('now', 'localtime')`).
  The UI reads it as local time. Never append `Z`.
- Pinned and current items are lifted; everything else sits on the page, divided by hairlines.
  Not every object gets a box.
- Meta lines are one line: items shrink with an ellipsis, dates never do.
- Category is a word in the meta line, not a coloured badge.
- One number gets to be big: the phase test's exam dates.
- Selected states (nav, filter chip, admin tab) are a solid step: white surface plus a ring.
- Icons: Phosphor only, regular at 16px and up, fill at 14px and under. Brand marks are the
  real Simple Icons paths. Never hand-draw a glyph. `scripts/build-icons.mjs` generates `icons.js`.
- Skeletons sit at the content's own geometry; filters dim the old list instead of flashing.

## Motion

Short (≤ 240ms), transform and opacity only, never looping, all off under reduced motion:
the first six cards rise in, archives open with their height, the lightbox fades and settles
from 96%, presses scale to 0.98, pages cross-fade with a view transition.

## Shipping changes

Static assets are cached as immutable. Any change to CSS or JS must bump `?v=` in the pages
(`scripts/build-pages.mjs`, `login.html`, `admin.html`), in `sw.js` (`VERSION` and the precache
list) and in the manifest, and the tests that pin it.
