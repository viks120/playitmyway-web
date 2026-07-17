# Homepage Refresh + Shared Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the Play It My Way homepage (new visual design, semantic accessible markup, zero third-party requests, no storage) and create a shared `tokens.css` design foundation that game pages can adopt later.

**Architecture:** Three units — `tokens.css` (design tokens + `@font-face` + shared base rules, importable by any page), `styles.css` (homepage-only styles consuming the tokens), and `index.html` (rewritten semantic body, cleaned head). Cards become plain `<a>` elements so no JavaScript is needed for navigation. Spec: `docs/superpowers/specs/2026-07-17-homepage-refresh-design.md`.

**Tech Stack:** Hand-written static HTML + CSS. No build step, no frameworks, no package manager. Git Bash for scripts. Verification via a shell check script + manual browser checks.

## Global Constraints

- The site is 100% static: no build step, no backend, nothing written to localStorage/cookies/anywhere.
- Zero third-party requests at page load (fonts self-hosted; the only external URL is the buymeacoffee.com *link*, which is not fetched at load).
- All navigation must work with JavaScript disabled.
- Game pages, `disclaimer.html`, `privacy-policy.html`, `robots.txt`, `favicon.svg` are NOT modified.
- Site URL in metadata: `https://playitmyway.com`.
- The repo root is the deployed site — do not commit dev scripts (`check-home.sh` stays untracked and is deleted in Task 4).
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Shared design foundation — self-hosted fonts + tokens.css

**Files:**
- Create: `fonts/fredoka-400.woff2`, `fonts/fredoka-600.woff2` (downloaded)
- Create: `tokens.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: CSS custom properties on `:root` used by Task 2's `styles.css`:
  `--color-bg`, `--color-surface`, `--color-ink`, `--color-ink-soft`,
  `--color-primary`, `--color-primary-deep`, `--color-focus`,
  `--color-teal`, `--color-teal-tint`, `--color-amber`, `--color-amber-tint`,
  `--color-violet`, `--color-violet-tint`, `--color-green`, `--color-green-tint`,
  `--font-display`, `--space-1`…`--space-7`, `--radius-md`, `--radius-lg`,
  `--radius-pill`, `--shadow-rest`, `--shadow-lift`, `--ease-quick`, `--ease-move`.
  Also the font-family name `"Fredoka"` (weights 400 and 600).

- [ ] **Step 1: Download the Fredoka font files (latin subset, weights 400 and 600)**

Run in Git Bash from the repo root:

```bash
mkdir -p fonts
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
for w in 400 600; do
  url=$(curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Fredoka:wght@$w&display=swap" \
    | grep -A 8 '/\* latin \*/' | grep -o 'https://fonts.gstatic.com/[^)]*' | head -1)
  echo "weight $w -> $url"
  curl -s -o "fonts/fredoka-$w.woff2" "$url"
done
```

Expected: two lines printing `weight 400 -> https://fonts.gstatic.com/...` and `weight 600 -> ...`, then two files in `fonts/`.

- [ ] **Step 2: Verify the downloads are real woff2 files**

```bash
head -c 4 fonts/fredoka-400.woff2; echo; head -c 4 fonts/fredoka-600.woff2; echo; ls -l fonts
```

Expected: both print the magic bytes `wOF2`, and each file is roughly 10–60 KB. If either file starts with `<` (an HTML error page), the URL extraction failed — stop and re-run Step 1, checking the printed URL.

- [ ] **Step 3: Create `tokens.css`**

Full file content:

```css
/* ==========================================================================
   Play It My Way — shared design tokens
   Link BEFORE the page stylesheet:
     homepage:   <link rel="stylesheet" href="tokens.css" />
     game pages: <link rel="stylesheet" href="../../tokens.css" />
   Font paths are relative to this file, so they work from any page.
   No page-specific rules belong in this file.
   ========================================================================== */

@font-face {
  font-family: "Fredoka";
  src: url("fonts/fredoka-400.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Fredoka";
  src: url("fonts/fredoka-600.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

:root {
  /* Base colors */
  --color-bg: #fff8ef;
  --color-surface: #ffffff;
  --color-ink: #33302e;
  --color-ink-soft: #5f5751;
  --color-primary: #ff6b57;
  --color-primary-deep: #9a3412;
  --color-focus: #2563eb;

  /* Age-band accents (AA-safe as text on white/tint) + soft tints */
  --color-teal: #0d9488;
  --color-teal-tint: #ccfbf1;
  --color-amber: #b45309;
  --color-amber-tint: #fef3c7;
  --color-violet: #7c3aed;
  --color-violet-tint: #ede9fe;
  --color-green: #15803d;
  --color-green-tint: #dcfce7;

  /* Typography */
  --font-display: "Fredoka", "Comic Sans MS", "Segoe UI", system-ui, sans-serif;

  /* Spacing scale */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  /* Corner radius */
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-pill: 999px;

  /* Shadows */
  --shadow-rest: 0 2px 8px rgba(51, 48, 46, 0.08);
  --shadow-lift: 0 10px 24px rgba(51, 48, 46, 0.16);

  /* Motion */
  --ease-quick: 150ms ease;
  --ease-move: 250ms ease;
}

:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add fonts/fredoka-400.woff2 fonts/fredoka-600.woff2 tokens.css
git commit -m "feat: add shared design tokens and self-hosted Fredoka font

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Homepage rewrite — check script, index.html, styles.css

**Files:**
- Create (untracked, temporary): `check-home.sh`
- Modify: `index.html` (full rewrite)
- Modify: `styles.css` (full rewrite)

**Interfaces:**
- Consumes: all `--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--ease-*`,
  `--font-display` custom properties and the `"Fredoka"` font from Task 1's `tokens.css`.
- Produces: the class names used by the homepage
  (`hero`, `tagline`, `trust-badges`, `age-section`, `band-3`, `band-5`, `band-7`,
  `band-14`, `game-grid`, `game-card`, `game-icon`, `game-card-name`,
  `game-card-age`, `support-banner`, `hide-mobile`, `support-section`,
  `support-btn`, `footer`, `footer-links`, `footer-contact`). Task 4 re-runs
  `check-home.sh` unchanged.

- [ ] **Step 1: Write the check script (the "failing test")**

Create `check-home.sh` at the repo root with exactly this content. Do NOT `git add` it.

```bash
#!/bin/sh
# Temporary checks for the redesigned homepage. Run: sh check-home.sh
fail() { echo "FAIL: $1"; exit 1; }

grep -qi "flaticon" index.html && fail "external Flaticon icons still referenced"
grep -q "cookie-banner" index.html && fail "cookie banner markup still present"
grep -q "cookieChoice" index.html && fail "cookie-consent JS still present"
grep -q "localStorage" index.html && fail "localStorage still used"
grep -q 'role="button"' index.html && fail "fake-button divs still present"
grep -qi "og:image" index.html && fail "og:image still references a missing file"
grep -q "<h1" index.html || fail "missing <h1>"
grep -q "<main" index.html || fail "missing <main> landmark"
grep -q "<footer" index.html || fail "missing <footer> landmark"
grep -q 'href="tokens.css"' index.html || fail "tokens.css not linked"
grep -q "application/ld+json" index.html || fail "JSON-LD structured data missing"

for href in $(grep -o 'href="games/[^"]*"' index.html | sed 's/^href="//; s/"$//'); do
  [ -f "$href" ] || fail "broken game link: $href"
done

count=$(grep -c 'class="game-card"' index.html)
[ "$count" -eq 16 ] || fail "expected 16 game cards, found $count"

echo "PASS: all homepage checks passed"
```

- [ ] **Step 2: Run it against the current homepage to verify it fails**

Run: `sh check-home.sh`
Expected: `FAIL: external Flaticon icons still referenced` with exit code 1.

- [ ] **Step 3: Rewrite `index.html`**

Full file content:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#ff6b57" />

    <link rel="icon" type="image/svg+xml" href="favicon.svg" />

    <title>
      Free Online Games for Kids | Educational Games for Toddlers & Children
      Ages 3-14 | Play It My Way
    </title>
    <meta
      name="description"
      content="Play free educational games for kids online! Memory games, math puzzles, word games, drawing pad & more. Safe, ad-free learning games for toddlers, preschoolers & children ages 3-14. No download required!"
    />
    <meta
      name="keywords"
      content="free games for kids, educational games for children, online games for toddlers, preschool learning games, kids memory games, math games for kids, free online kids games, safe games for children, brain games for kids, learning games online, educational games free, kids puzzle games, toddler games free, fun learning games, kindergarten games, elementary school games, counting games for kids, drawing games online, word games for children, science games for kids, geography games"
    />
    <meta name="author" content="Play It My Way" />
    <meta
      name="robots"
      content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    />

    <!-- Open Graph -->
    <meta
      property="og:title"
      content="Free Online Educational Games for Kids Ages 3-14 | Play It My Way"
    />
    <meta
      property="og:description"
      content="100% free educational games for kids! Memory match, math puzzles, word scramble, drawing & more. Safe, fun learning games for toddlers to teens. Play now - no download needed!"
    />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://playitmyway.com" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <!-- Twitter -->
    <meta name="twitter:card" content="summary" />
    <meta
      name="twitter:title"
      content="Free Educational Games for Kids | Play It My Way"
    />
    <meta
      name="twitter:description"
      content="Safe & fun educational games for kids ages 3-14. Memory, math, word games & more. 100% free, no ads, no download!"
    />

    <link rel="canonical" href="https://playitmyway.com" />
    <link rel="stylesheet" href="tokens.css" />
    <link rel="stylesheet" href="styles.css" />

    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": "Play It My Way",
        "url": "https://playitmyway.com/",
        "description": "Free, safe, ad-free educational games for kids ages 3-14."
      }
    </script>
  </head>
  <body>
    <div class="support-banner">
      ❤️ <span class="hide-mobile">Love our games? </span
      ><a href="https://buymeacoffee.com/viks120" target="_blank" rel="noopener"
        >Support us</a
      >
      to keep games free!
    </div>

    <header class="hero">
      <h1>🎮 Play It My Way</h1>
      <p class="tagline">
        Free educational games for kids ages 3 and up. Learn, play, smile!
      </p>
      <ul class="trust-badges">
        <li>🚫 No ads</li>
        <li>🔒 No tracking</li>
        <li>🍪 No cookies</li>
        <li>💯 100% free</li>
      </ul>
    </header>

    <main>
      <section class="age-section band-3" aria-labelledby="heading-ages-3">
        <h2 id="heading-ages-3">🐣 Ages 3+ · Little Learners</h2>
        <div class="game-grid">
          <a class="game-card" href="games/memory-game/index.html">
            <span class="game-icon" aria-hidden="true">🧠</span>
            <span class="game-card-name">Memory Match</span>
            <span class="game-card-age">3+</span>
          </a>
          <a class="game-card" href="games/color-matcher/index.html">
            <span class="game-icon" aria-hidden="true">🎨</span>
            <span class="game-card-name">Color Matcher</span>
            <span class="game-card-age">3+</span>
          </a>
          <a class="game-card" href="games/counting-game/index.html">
            <span class="game-icon" aria-hidden="true">🔢</span>
            <span class="game-card-name">Count With Me</span>
            <span class="game-card-age">3+</span>
          </a>
          <a class="game-card" href="games/drawing-pad/index.html">
            <span class="game-icon" aria-hidden="true">🖍️</span>
            <span class="game-card-name">Drawing Pad</span>
            <span class="game-card-age">3+</span>
          </a>
        </div>
      </section>

      <section class="age-section band-5" aria-labelledby="heading-ages-5">
        <h2 id="heading-ages-5">🌟 Ages 5+ · Fun &amp; Games</h2>
        <div class="game-grid">
          <a class="game-card" href="games/tic-tac-toe/index.html">
            <span class="game-icon" aria-hidden="true">⭕</span>
            <span class="game-card-name">Tic Tac Toe</span>
            <span class="game-card-age">5+</span>
          </a>
          <a class="game-card" href="games/catch-falling-object/index.html">
            <span class="game-icon" aria-hidden="true">🍎</span>
            <span class="game-card-name">Catch the Fruit</span>
            <span class="game-card-age">5+</span>
          </a>
          <a class="game-card" href="games/balloon-pop/index.html">
            <span class="game-icon" aria-hidden="true">🎈</span>
            <span class="game-card-name">Balloon Pop</span>
            <span class="game-card-age">5+</span>
          </a>
          <a class="game-card" href="games/whack-a-mole/index.html">
            <span class="game-icon" aria-hidden="true">🔨</span>
            <span class="game-card-name">Whack-a-Mole</span>
            <span class="game-card-age">5+</span>
          </a>
        </div>
      </section>

      <section class="age-section band-7" aria-labelledby="heading-ages-7">
        <h2 id="heading-ages-7">🚀 Ages 7+ · Brain Boosters</h2>
        <div class="game-grid">
          <a class="game-card" href="games/word-scramble/index.html">
            <span class="game-icon" aria-hidden="true">🔤</span>
            <span class="game-card-name">Word Scramble</span>
            <span class="game-card-age">7+</span>
          </a>
          <a class="game-card" href="games/math-puzzle/index.html">
            <span class="game-icon" aria-hidden="true">➕</span>
            <span class="game-card-name">Math Puzzle</span>
            <span class="game-card-age">7+</span>
          </a>
          <a class="game-card" href="games/geography-explorer/index.html">
            <span class="game-icon" aria-hidden="true">🌍</span>
            <span class="game-card-name">Geography Explorer</span>
            <span class="game-card-age">7+</span>
          </a>
          <a class="game-card" href="games/sentence-builder/index.html">
            <span class="game-icon" aria-hidden="true">📝</span>
            <span class="game-card-name">Sentence Builder</span>
            <span class="game-card-age">7+</span>
          </a>
        </div>
      </section>

      <section class="age-section band-14" aria-labelledby="heading-ages-14">
        <h2 id="heading-ages-14">🏆 Ages 14+ · Challenge Zone</h2>
        <div class="game-grid">
          <a class="game-card" href="games/science-trivia/index.html">
            <span class="game-icon" aria-hidden="true">🔬</span>
            <span class="game-card-name">Science Trivia</span>
            <span class="game-card-age">14+</span>
          </a>
          <a class="game-card" href="games/2048-slider/index.html">
            <span class="game-icon" aria-hidden="true">🧩</span>
            <span class="game-card-name">2048 Slider</span>
            <span class="game-card-age">14+</span>
          </a>
          <a class="game-card" href="games/minesweeper/index.html">
            <span class="game-icon" aria-hidden="true">💣</span>
            <span class="game-card-name">Minesweeper</span>
            <span class="game-card-age">14+</span>
          </a>
          <a class="game-card" href="games/sudoku/index.html">
            <span class="game-icon" aria-hidden="true">9️⃣</span>
            <span class="game-card-name">Sudoku</span>
            <span class="game-card-age">14+</span>
          </a>
        </div>
      </section>

      <section class="support-section" aria-labelledby="support-heading">
        <h2 id="support-heading">🎉 Thank You for Playing!</h2>
        <p>
          If you love our free educational games and want to support us,
          consider buying us a coffee ☕
        </p>
        <a
          class="support-btn"
          href="https://buymeacoffee.com/viks120"
          target="_blank"
          rel="noopener"
          >☕ Buy Us a Coffee</a
        >
      </section>
    </main>

    <footer class="footer">
      <p>© <span id="currentYear"></span> PlayItMyWay.com — Learn, Play, Smile 😊</p>
      <nav class="footer-links" aria-label="Site policies">
        <a href="disclaimer.html">Disclaimer</a>
        <a href="privacy-policy.html">Privacy Policy</a>
      </nav>
      <p class="footer-contact">
        📧 Advertise or reach us for any queries:
        <a href="mailto:contact@playitmyway.com">contact@playitmyway.com</a>
      </p>
    </footer>

    <script>
      document.getElementById("currentYear").textContent =
        new Date().getFullYear();
    </script>
  </body>
</html>
```

- [ ] **Step 4: Run the check script to verify it passes**

Run: `sh check-home.sh`
Expected: `PASS: all homepage checks passed`

- [ ] **Step 5: Rewrite `styles.css`**

Full file content:

```css
/* ==========================================================================
   Play It My Way — homepage styles
   Requires tokens.css to be linked first.
   ========================================================================== */

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  line-height: 1.5;
  color: var(--color-ink);
  background-color: var(--color-bg);
}

/* --- Support banner ------------------------------------------------------ */

.support-banner {
  background: var(--color-ink);
  color: #fff;
  text-align: center;
  padding: var(--space-2) var(--space-4);
  font-size: 0.85em;
}

.support-banner a {
  color: #ffd166;
  font-weight: 600;
}

/* --- Hero ---------------------------------------------------------------- */

.hero {
  text-align: center;
  color: #fff;
  background: linear-gradient(
    135deg,
    #ff9a5c 0%,
    var(--color-primary) 45%,
    #8b5cf6 100%
  );
  padding: var(--space-7) var(--space-4) var(--space-6);
  border-radius: 0 0 32px 32px;
}

.hero h1 {
  margin: 0;
  font-size: clamp(2.2em, 6vw, 3.2em);
  font-weight: 600;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.25);
}

.tagline {
  margin: var(--space-2) auto 0;
  max-width: 34em;
  font-size: clamp(1em, 3vw, 1.25em);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

.trust-badges {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  margin: var(--space-5) 0 0;
  padding: 0;
}

.trust-badges li {
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-ink);
  font-size: 0.78em;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
}

/* --- Age sections & game grid ------------------------------------------- */

.age-section {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4) 0;
}

.band-3 {
  --band-color: var(--color-teal);
  --band-tint: var(--color-teal-tint);
}
.band-5 {
  --band-color: var(--color-amber);
  --band-tint: var(--color-amber-tint);
}
.band-7 {
  --band-color: var(--color-violet);
  --band-tint: var(--color-violet-tint);
}
.band-14 {
  --band-color: var(--color-green);
  --band-tint: var(--color-green-tint);
}

.age-section h2 {
  margin: 0 0 var(--space-4);
  text-align: center;
  color: var(--band-color);
  font-size: clamp(1.4em, 4vw, 1.9em);
  font-weight: 600;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-4);
}

.game-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-5) var(--space-3);
  background: var(--color-surface);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-rest);
  text-decoration: none;
  text-align: center;
  color: var(--color-ink);
  transition: transform var(--ease-move), box-shadow var(--ease-move),
    border-color var(--ease-move);
}

.game-card:hover,
.game-card:focus-visible {
  transform: translateY(-4px);
  border-color: var(--band-color);
  box-shadow: var(--shadow-lift);
}

.game-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--band-tint);
  font-size: 2.4em;
  line-height: 1;
}

.game-card:hover .game-icon {
  animation: wiggle 0.4s ease;
}

@keyframes wiggle {
  0%,
  100% {
    transform: rotate(0);
  }
  25% {
    transform: rotate(-8deg);
  }
  75% {
    transform: rotate(8deg);
  }
}

.game-card-name {
  font-size: 1.05em;
  font-weight: 600;
  line-height: 1.3;
}

.game-card-age {
  font-size: 0.7em;
  font-weight: 600;
  color: var(--band-color);
  background: var(--band-tint);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}

/* --- Support section ----------------------------------------------------- */

.support-section {
  max-width: 700px;
  margin: var(--space-7) var(--space-4) 0;
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: #fff;
  background: linear-gradient(135deg, #ffb020, var(--color-primary));
  border-radius: var(--radius-lg);
}

@media (min-width: 732px) {
  .support-section {
    margin-left: auto;
    margin-right: auto;
  }
}

.support-section h2 {
  margin: 0 0 var(--space-3);
  font-size: clamp(1.4em, 4vw, 1.9em);
  font-weight: 600;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.25);
}

.support-section p {
  margin: 0 0 var(--space-4);
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
}

.support-btn {
  display: inline-block;
  padding: 14px 28px;
  background: #fff;
  color: var(--color-primary-deep);
  font-weight: 600;
  font-size: 1.05em;
  text-decoration: none;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-rest);
  transition: transform var(--ease-quick), box-shadow var(--ease-quick);
}

.support-btn:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-lift);
}

/* --- Footer -------------------------------------------------------------- */

.footer {
  margin-top: var(--space-6);
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-ink-soft);
  font-size: 0.9em;
}

.footer p {
  margin: 0 0 var(--space-2);
}

.footer-links {
  margin-bottom: var(--space-2);
}

.footer-links a {
  color: var(--color-primary-deep);
  font-weight: 600;
  text-decoration: none;
  margin: 0 var(--space-2);
}

.footer-links a:hover {
  text-decoration: underline;
}

.footer-contact a {
  color: var(--color-primary-deep);
}

/* --- Small screens ------------------------------------------------------- */

@media (max-width: 480px) {
  .hide-mobile {
    display: none;
  }

  .hero {
    padding: var(--space-6) var(--space-3) var(--space-5);
  }

  .game-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  .game-card {
    padding: var(--space-4) var(--space-2);
  }

  .game-icon {
    width: 60px;
    height: 60px;
    font-size: 2em;
  }
}
```

- [ ] **Step 6: Visual check in a browser**

Open the page: `powershell -Command "start index.html"` (or open the file in a browser manually).

Checklist:
- Hero gradient renders with title, tagline, and 4 trust badges.
- Fredoka font is applied (rounded letterforms, clearly not Comic Sans).
- 4 sections, each with a colored heading and 4 white cards with emoji bubbles.
- Hovering a card lifts it and wiggles the icon; the card border takes the band color.
- No cookie banner appears; DevTools console shows no errors; DevTools Network tab shows no requests to any domain other than local files.

- [ ] **Step 7: Commit (index.html and styles.css only — NOT check-home.sh)**

```bash
git add index.html styles.css
git commit -m "feat: redesign homepage with semantic markup, emoji icons, no cookie banner

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Remove dev utility pages + complete the sitemap

**Files:**
- Delete: `create-favicon.html`, `generate-favicon.html`
- Modify: `sitemap.xml` (add 4 missing games)

**Interfaces:**
- Consumes: nothing from other tasks (independent).
- Produces: nothing other tasks rely on.

- [ ] **Step 1: Delete the two favicon developer utilities**

```bash
git rm create-favicon.html generate-favicon.html
```

Expected: both files removed and staged.

- [ ] **Step 2: Add the 4 missing games to `sitemap.xml`**

The sitemap currently lists 12 of 16 games. Make these two edits:

After the `balloon-pop` entry (inside the "Games for Ages 5+" group), add:

```xml
  <url>
    <loc>https://playitmyway.com/games/whack-a-mole/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

After the `geography-explorer` entry (inside the "Games for Ages 7+" group), add:

```xml
  <url>
    <loc>https://playitmyway.com/games/sentence-builder/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

After the `2048-slider` entry (inside the "Games for Ages 14+" group), add:

```xml
  <url>
    <loc>https://playitmyway.com/games/minesweeper/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://playitmyway.com/games/sudoku/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

- [ ] **Step 3: Verify the sitemap**

```bash
grep -c "<loc>" sitemap.xml
```

Expected: `19` (1 homepage + 16 games + 2 legal pages).

- [ ] **Step 4: Commit**

```bash
git add sitemap.xml
git commit -m "chore: remove favicon dev utilities, add missing games to sitemap

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Final verification and cleanup

**Files:**
- Delete (untracked): `check-home.sh`

**Interfaces:**
- Consumes: `check-home.sh` from Task 2.
- Produces: nothing — final gate.

- [ ] **Step 1: Re-run the automated homepage checks**

Run: `sh check-home.sh`
Expected: `PASS: all homepage checks passed`

- [ ] **Step 2: Verify the homepage references no external resources**

```bash
grep -oE 'https?://[^"< ]+' index.html | sort -u
```

Expected output — exactly these, all of which are links or metadata, none fetched at page load:

```
https://buymeacoffee.com/viks120
https://playitmyway.com
https://playitmyway.com/
https://schema.org
```

- [ ] **Step 3: Verify nothing writes to storage**

```bash
grep -E "localStorage|sessionStorage|document\.cookie" index.html styles.css tokens.css; echo "exit: $?"
```

Expected: no matches, `exit: 1`.

- [ ] **Step 4: Manual browser checklist**

Open `index.html` in a browser and verify:
- Keyboard: Tab moves through banner link → all 16 cards in order → support button → footer links, each with a visible blue focus ring; Enter on a card opens the game.
- Responsive: sane layout at 360px (2-column grid), 768px, and 1200px widths (DevTools device toolbar).
- With JavaScript disabled (DevTools → Settings → Debugger → Disable JavaScript), all 16 cards still navigate; only the year is missing.
- Click 2–3 game cards: games load and play unchanged.

- [ ] **Step 5: Remove the temporary check script and confirm a clean tree**

```bash
rm check-home.sh
git status --porcelain
```

Expected: no output (clean working tree, nothing untracked).
