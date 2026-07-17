# Homepage Refresh + Shared Design Foundation

**Date:** 2026-07-17
**Status:** Approved by user

## Goal

Modernize the Play It My Way homepage UI and clean up its code, and establish a
shared design foundation the 16 game pages can adopt gradually later. The site
stays 100% static: no build step, no backend, no storage of any kind, zero
third-party requests.

## Decisions made with user

- **Scope:** Homepage + shared foundation. Game pages are NOT restyled in this
  round; they may adopt the foundation later, one at a time.
- **Visual direction:** Modern playful — kid-friendly spirit, professional to
  parents. Not a full arcade theme, not a minimal polish.
- **Approach:** Hand-written static HTML + CSS design tokens. No JS-rendered
  lists, no static site generator.
- **Cookie banner:** Removed entirely. It was the site's only localStorage use
  and its "we use essential cookies" claim was untrue. Replaced by a static
  trust-badge row.
- **Card icons:** Emoji in colored bubbles, replacing Flaticon CDN images
  (currently the homepage's only third-party requests).
- **Dev files:** `create-favicon.html` and `generate-favicon.html` are deleted
  from the repo (they were deployed as public pages; git history retains them).

## Architecture

Three units, each with one clear purpose:

### 1. `tokens.css` (new) — shared design foundation

CSS custom properties only, plus a handful of shared base rules. Importable by
any game page later via a single `<link>`. Contains:

- **Palette:** soft cream page background, dark warm ink for text, coral
  primary, and one accent color per age band: teal (3+), amber (5+), violet
  (7+), green (14+). All text/background pairs meet WCAG AA contrast.
- **Typography tokens:** display font stack (self-hosted Fredoka with rounded
  system fallbacks), base font sizes.
- **Scales:** spacing, border radius (cards ~20px), shadows (soft resting +
  raised hover), transition durations.
- **Shared base rules:** `:focus-visible` ring style, and a
  `prefers-reduced-motion` block that disables decorative animation.

No homepage-specific rules live here — that is the boundary: tokens.css must
make sense linked from any page on the site.

### 2. `styles.css` (rewritten) — homepage styles only

Consumes tokens. Contains hero, trust badges, section headings, game grid,
cards, support section, footer, responsive rules. Homepage layout can change
without touching tokens.css; tokens can be tuned without touching markup.

### 3. `index.html` (rewritten body, cleaned head)

Semantic structure:

```
<body>
  support banner (restyled, kept)
  <header>  — hero: h1 site title, tagline, trust-badge row
            ("No ads · No tracking · No cookies · 100% free")
  <main>
    <section> per age band (3+, 5+, 7+, 14+), each:
      h2 heading (emoji + accent color for the band)
      grid of game cards
    support section (restyled, kept)
  </main>
  <footer>  — copyright, Disclaimer / Privacy Policy links, contact email
  one <script>: set current year
</body>
```

**Game card = one `<a>` element** containing an emoji icon bubble, the game
name, and a small age chip. This removes the current fake-button pattern
(`div[role=button][tabindex]` wrapping an `<a>`) and all card click/keydown
JavaScript. Cards work with JS disabled and are natively keyboard-accessible.

## Assets

- `fonts/` (new): Fredoka woff2, weights 400 and 600, self-hosted
  (~25KB each), loaded with `font-display: swap`. Zero third-party requests.

## Head cleanup (index.html)

- One favicon `<link>` (favicon.svg) instead of four (incl. base64 duplicate).
- Remove dead meta tags: `revisit-after`, `distribution`, `rating`,
  `classification`, `audience`, `coverage`, `target`, `language`, `googlebot`.
- Remove `og:image` / `twitter:image` tags — they point to
  `/images/og-image.jpg` and `/images/twitter-card.jpg`, which do not exist
  (404 today). Creating real OG images is a possible future task.
- Keep: title, description, keywords, canonical, theme-color, remaining OG and
  Twitter tags.
- Add JSON-LD `WebSite` structured data block.

## Visual design (modern playful)

- Clean cream background; playful gradient hero panel with rounded bottom
  corners; white cards with large radius and soft shadow.
- Card hover/focus: gentle lift + shadow raise, slight icon wiggle. All motion
  disabled under `prefers-reduced-motion`.
- Section headings color-coded to their age band accent.
- Support button as a warm gradient pill.
- Responsive: existing `auto-fit` grid behavior kept; 2 columns on small
  phones.

## Files changed

| File | Action |
|---|---|
| `tokens.css` | new |
| `styles.css` | rewritten |
| `index.html` | rewritten body, cleaned head |
| `fonts/fredoka-400.woff2`, `fonts/fredoka-600.woff2` | new |
| `create-favicon.html`, `generate-favicon.html` | deleted |
| `sitemap.xml` | update only if it references deleted pages |

Game pages, `disclaimer.html`, `privacy-policy.html`, `robots.txt`: untouched.

## Error handling

Static page — the failure modes are asset failures, all with graceful
fallbacks: font fails → system rounded fallback stack renders; CSS fails →
semantic HTML still reads in order; JS fails → only the year span is empty,
all navigation still works (cards are plain links).

## Testing / verification

Manual, in a local browser:

1. Network tab: zero external requests, no 404s, no console errors.
2. Keyboard: tab reaches every card in order with a visible focus ring; Enter
   activates.
3. Responsive: layouts sane at 360px, 768px, 1200px.
4. JS disabled: all 16 cards still navigate.
5. All 16 links resolve to their game pages.
6. Confirm no localStorage/cookie writes occur on the homepage.
