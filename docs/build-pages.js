/* Generates games/index.html, for-teachers.html, 404.html, sitemap.xml and
   sw.js from catalogue.js, and the generated parts of each game page (its
   structured data and its "More games like this" section). The site itself
   has no build step — these are committed as finished static files; this
   script just keeps them in sync with one source of truth. Re-run after
   adding a game, and after changing a page, so its sitemap date moves:

       node docs/build-pages.js

   Then add the new game to the homepage by hand. */
const fs = require('fs');
const path = require('path');
const C = require('./catalogue.js');

const ROOT = path.join(__dirname, '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const bandOf = (age) => C.bands.find(b => b.id === age);
const skillsOf = (g) => g.skills.map(id => C.skills.find(s => s.id === id));

function head(opts) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <!-- light-only, and "only" withdraws the browser's permission to invent a
         dark version of its own (Chrome's Auto Dark Theme) -->
    <meta name="color-scheme" content="only light" />
    <!-- and the same to the Dark Reader extension, which darkens pages itself -->
    <meta name="darkreader-lock" />
    <meta name="theme-color" content="#2b2a5e" />

    <link rel="icon" type="image/svg+xml" href="${opts.up}favicon.svg" />

    <title>${esc(opts.title)}</title>
    <meta name="description" content="${esc(opts.description)}" />
    <meta name="keywords" content="${esc(opts.keywords)}" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="${opts.robots || 'index, follow, max-image-preview:large'}" />

    <meta property="og:title" content="${esc(opts.title)}" />
    <meta property="og:description" content="${esc(opts.description)}" />
    <meta property="og:type" content="website" />
${opts.canonical ? `    <meta property="og:url" content="${opts.canonical}" />\n` : ''}
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(opts.title)}" />
    <meta name="twitter:description" content="${esc(opts.description)}" />

${opts.canonical ? `    <link rel="canonical" href="${opts.canonical}" />\n` : ''}
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="${opts.up}tokens.css" />
    <link rel="stylesheet" href="${opts.up}styles.css" />
    <link rel="stylesheet" href="${opts.up}components.css" />
${opts.jsonld ? '\n    <script type="application/ld+json">\n' + JSON.stringify(opts.jsonld, null, 6).replace(/^/gm, '      ') + '\n    </script>\n' : ''}    <style>
${opts.css}    </style>
  </head>
  <body>`;
}

const FOOT = (up) => `
    <footer class="footer">
      <p>© <span id="currentYear">2026</span> PlayItMyWay.com — Learn, Play, Smile 😊</p>
      <nav class="footer-links" aria-label="Site policies">
        <a href="${up || './'}">Home</a>
        <a href="${up}games/">All games</a>
        <a href="${up}for-teachers.html">For grown-ups</a>
        <a href="${up}disclaimer.html">Terms of Use &amp; Disclaimer</a>
        <a href="${up}privacy-policy.html">Privacy Policy</a>
      </nav>
      <p class="footer-contact">
        📧 <a href="mailto:contact@playitmyway.com">contact@playitmyway.com</a>
      </p>
    </footer>

    <script>
      document.getElementById("currentYear").textContent =
        new Date().getFullYear();
    </script>

    <nav class="pimw-appbar" aria-label="App navigation">
      <button type="button" class="pimw-appbar-btn" onclick="pimwBack()">
        <span class="pimw-appbar-ic" aria-hidden="true">←</span>
        <span class="pimw-appbar-label">Back</span>
      </button>
      <a class="pimw-appbar-btn" href="/">
        <span class="pimw-appbar-ic" aria-hidden="true">🏠</span>
        <span class="pimw-appbar-label">Home</span>
      </a>
      <a class="pimw-appbar-btn" href="/games/">
        <span class="pimw-appbar-ic" aria-hidden="true">🎮</span>
        <span class="pimw-appbar-label">Games</span>
      </a>
    </nav>
    <script>
      /* Installed-app flag: drives the bottom bar. display-mode covers Android
         and modern iOS; navigator.standalone is the older iOS signal. */
      if (
        (window.matchMedia && matchMedia("(display-mode: standalone)").matches) ||
        navigator.standalone
      ) {
        document.documentElement.classList.add("pimw-installed");
      }
      /* Back, with a floor: a game opened directly from a search result has no
         history to go back to, so fall through to the games index. */
      function pimwBack() {
        if (history.length > 1) history.back();
        else location.href = "/games/";
      }
      /* offline support; skipped over file:// where service workers do not run */
      if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
        addEventListener("load", function () {
          navigator.serviceWorker.register("/sw.js").catch(function () {});
        });
      }
    </script>
  </body>
</html>
`;

const PAGE_CSS = `      .page-intro {
        max-width: 760px;
        margin: 12px auto 8px;
        padding: 0 20px;
        text-align: center;
        color: var(--color-ink-soft);
        font-size: 1.1rem;
        line-height: 1.65;
      }
      .game-card-mins {
        display: block;
        font-size: 0.78rem;
        color: var(--color-ink-soft);
        margin-top: 2px;
      }
`;

const TEACHER_CSS = `      .tbl-wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 0 20px;
      }
      table.games {
        width: 100%;
        border-collapse: collapse;
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        overflow: hidden;
        box-shadow: var(--shadow-rest);
        font-size: 0.97rem;
      }
      table.games th, table.games td {
        text-align: left;
        vertical-align: top;
        padding: 12px 14px;
        border-bottom: 1px solid #f0e6d8;
      }
      table.games thead th {
        background: var(--color-bg);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-ink-soft);
        white-space: nowrap;
      }
      table.games tbody tr:last-child td { border-bottom: none; }
      table.games td.g { white-space: nowrap; font-weight: 600; }
      table.games td.g a { color: var(--color-primary-deep); text-decoration: none; }
      table.games td.g a:hover { text-decoration: underline; }
      table.games .row-icon { width: 22px; height: 22px; vertical-align: -5px; margin-right: 4px; }
      td.age { white-space: nowrap; font-variant-numeric: tabular-nums; }
      .note {
        max-width: 760px;
        margin: 0 auto 26px;
        padding: 18px 22px;
        background: var(--color-surface);
        border-left: 5px solid var(--color-teal);
        border-radius: 0 var(--radius-md) var(--radius-md) 0;
        box-shadow: var(--shadow-rest);
        line-height: 1.65;
      }
      .note h2 { margin: 0 0 8px; font-size: 1.15rem; }
      .note p { margin: 0 0 8px; }
      .note p:last-child { margin-bottom: 0; }
      @media (max-width: 640px) {
        table.games, table.games tbody, table.games tr, table.games td { display: block; width: 100%; }
        table.games thead { display: none; }
        table.games tr { border-bottom: 2px solid #f0e6d8; padding: 6px 0; }
        table.games td { border: none; padding: 4px 14px; }
        /* nowrap + the table's overflow:hidden silently clipped the longest
           game names ("Trace Letters & Numbers") on a 320px screen */
        table.games { overflow: visible; }
        table.games td.g { font-size: 1.1rem; padding-top: 12px; white-space: normal; }
      }
`;

/* ---------------- /games/ index ---------------- */
function buildGamesIndex() {
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'All Games',
    url: 'https://playitmyway.com/games/',
    description: 'Every free educational game on Play It My Way, grouped by age.',
    isPartOf: { '@type': 'WebSite', name: 'Play It My Way', url: 'https://playitmyway.com/' },
    hasPart: C.games.map(g => ({
      '@type': 'Game',
      name: g.name,
      url: 'https://playitmyway.com/games/' + g.slug + '/',
      description: g.practises,
      typicalAgeRange: g.age + '-'
    }))
  };

  let h = head({
    up: '../',
    title: 'All Games — ' + C.games.length + ' Free Educational Games for Kids | Play It My Way',
    description: 'Browse all ' + C.games.length + ' free educational games for kids ages 2-14 — phonics, maths, tracing, logic, geography and more. No ads, no tracking, nothing saved.',
    keywords: 'all educational games for kids, free kids games list, learning games by age, phonics games, maths games for kids, tracing games',
    canonical: 'https://playitmyway.com/games/',
    css: PAGE_CSS,
    jsonld
  });

  h += `
    <header class="hero has-critters">
      <h1><img class="hero-mark" src="../icons/mark.svg" alt="" width="44" height="44">All Games</h1>
      <p class="tagline">${C.games.length} games. Every one worth playing.</p>
      <ul class="trust-badges">
        <li>No ads. Ever.</li>
        <li>No tracking. Ever.</li>
        <li>Nothing stored. Ever.</li>
        <li>Free. Actually free.</li>
      </ul>
      <ul class="hero-critters" aria-hidden="true">
        <li><img src="../icons/critters/clover.svg" alt="" width="72" height="68"></li>
        <li><img src="../icons/critters/pip.svg" alt="" width="72" height="68"></li>
        <li><img src="../icons/critters/plum.svg" alt="" width="72" height="68"></li>
        <li><img src="../icons/critters/mango.svg" alt="" width="72" height="68"></li>
      </ul>
    </header>

    <p class="page-intro">
      Pick the age band closest to your child and let them choose by picture —
      that is how children pick anyway. Grown-ups looking for a specific skill
      can use <a href="../for-teachers.html">the skills list</a>.
    </p>

    <main>`;

  for (const band of C.bands) {
    const games = C.games.filter(g => g.age === band.id);
    if (!games.length) continue;
    const hid = 'band-' + band.id;
    h += `
      <section class="age-section ${band.band}" aria-labelledby="${hid}">
        <p class="age-eyebrow">${band.label}</p>
        <h2 id="${hid}">${band.title}</h2>
        <p class="age-outcome">${esc(band.outcome)}</p>
        <div class="game-grid">`;
    for (const g of games) {
      h += `
          <a class="game-card" href="${g.slug}/">
            <span class="game-icon" aria-hidden="true"><img src="../icons/games/${g.slug}.svg" alt="" width="44" height="44"></span>
            <span class="game-card-name">${esc(g.name)}</span>
            <span class="game-card-age">${g.age}+</span>
            <span class="game-card-mins">${g.mins === 'open' ? 'open-ended' : '~' + g.mins + ' min'}</span>
          </a>`;
    }
    h += `
        </div>
      </section>`;
  }

  h += `
    </main>
` + FOOT('../');
  fs.writeFileSync(path.join(ROOT, 'games', 'index.html'), h);
  return C.games.length;
}

/* ---------------- /for-teachers.html ---------------- */
function buildTeachers() {
  let h = head({
    up: '',
    title: 'Parents & Teachers — What Each Game Builds | Play It My Way',
    description: 'What every Play It My Way game actually practises, the age it suits, and how long it takes. Free, ad-free and storage-free games for home and the classroom.',
    keywords: 'educational games for teachers, free classroom games, what skills do kids games teach, ad free games for schools, safe games for kids',
    // no .html: the host 308s that spelling, and a canonical pointing at a
    // redirect is a signal Google has to resolve rather than obey
    canonical: 'https://playitmyway.com/for-teachers',
    css: TEACHER_CSS
  });

  h += `
    <header class="hero">
      <h1>👋 For Grown-Ups</h1>
      <p class="tagline">Guilt-free screen time. We can prove it.</p>
      <ul class="trust-badges">
        <li>No ads. Ever.</li>
        <li>No tracking. Ever.</li>
        <li>Nothing stored. Ever.</li>
        <li>Free. Actually free.</li>
      </ul>
    </header>

    <main>
      <div class="note">
        <h2>What this site does and doesn't do</h2>
        <p>
          Every game here runs entirely in the browser. Nothing about your child is
          saved — no scores, no names, no progress, no cookies, no accounts. Close the
          tab and it is gone. That is deliberate, and it has one consequence worth
          knowing: a child cannot pick up where they left off. Where a game has
          difficulty levels, they are chosen rather than earned, so you can put a child
          straight back where they were.
        </p>
        <p>
          You can also add the games to a phone or tablet home screen, and they will
          work with no internet at all — on a plane, in a car, anywhere. Installing
          saves a copy of the games themselves onto the device; it still saves nothing
          about your child.
        </p>
        <p>
          There are no ads and no third-party scripts of any kind, so nothing follows
          your child around the internet afterwards. Games work offline once loaded and
          need no installation.
        </p>
        <p>
          Some games teach a specific skill. A few are simply fun — the table says which
          is which, honestly.
        </p>
      </div>
`;

  for (const skill of C.skills) {
    const games = C.games.filter(g => g.skills.includes(skill.id));
    if (!games.length) continue;
    h += `
      <section class="age-section" aria-labelledby="skill-${skill.id}">
        <h2 id="skill-${skill.id}">${skill.emoji} ${esc(skill.name)}</h2>
        <div class="tbl-wrap">
          <table class="games">
            <thead>
              <tr><th scope="col">Game</th><th scope="col">Age</th><th scope="col">Time</th><th scope="col">What it practises</th></tr>
            </thead>
            <tbody>`;
    for (const g of games) {
      h += `
              <tr>
                <td class="g"><a href="games/${g.slug}/"><img class="row-icon" src="icons/games/${g.slug}.svg" alt="" width="22" height="22"> ${esc(g.name)}</a></td>
                <td class="age">${g.age}+</td>
                <td class="age">${g.mins === 'open' ? 'open' : '~' + g.mins + 'm'}</td>
                <td>${esc(g.practises)}</td>
              </tr>`;
    }
    h += `
            </tbody>
          </table>
        </div>
      </section>`;
  }

  h += `
    </main>
` + FOOT('');
  fs.writeFileSync(path.join(ROOT, 'for-teachers.html'), h);
  return C.skills.length;
}

/* ---------------- /404.html ---------------- */
function build404() {
  let h = head({
    up: '',
    title: 'Page Not Found | Play It My Way',
    description: 'That page does not exist. Browse all free educational games for kids instead.',
    keywords: 'play it my way, free educational games for kids',
    // deliberately no canonical: this page is noindex, and pairing noindex
    // with a canonical asks the crawler to honour two contradictory rules
    canonical: '',
    robots: 'noindex, follow',
    css: PAGE_CSS
  });

  const picks = ['sound-it-out', 'counting-game', 'trace-letters', 'sort-it-out', 'clock-shop', 'code-the-robot']
    .map(s => C.games.find(g => g.slug === s));

  h += `
    <header class="hero">
      <h1>🧭 That page went missing</h1>
      <p class="tagline">The link may be old, or we may have moved something. Nothing is broken — let's find a game instead.</p>
    </header>

    <main>
      <section class="age-section band-5" aria-labelledby="try-these">
        <h2 id="try-these">✨ Try one of these</h2>
        <div class="game-grid">`;
  for (const g of picks) {
    h += `
          <a class="game-card" href="games/${g.slug}/">
            <span class="game-icon" aria-hidden="true"><img src="icons/games/${g.slug}.svg" alt="" width="44" height="44"></span>
            <span class="game-card-name">${esc(g.name)}</span>
            <span class="game-card-age">${g.age}+</span>
          </a>`;
  }
  h += `
        </div>
      </section>

      <section class="support-section">
        <h2>Looking for something specific?</h2>
        <p>
          <a class="support-btn" href="games/">🎮 See all ${C.games.length} games</a>
        </p>
      </section>
    </main>
` + FOOT('');
  fs.writeFileSync(path.join(ROOT, '404.html'), h);
}

/* ---------------- /sw.js ----------------
   The precache list is generated from what is actually on disk, so it can
   never drift from the real site. Re-run this script after adding a game. */
// ---------------------------------------------------------------------------
// Game pages are hand-written, but two parts of each are generated here so they
// stay in step with the catalogue: structured data in the head (the game and
// its breadcrumb trail, for search engines) and a "More games like this"
// section above the trust footer. Each sits between pimw: markers; a re-run
// replaces what is between them and leaves the rest of the page alone.
const SITE = 'https://playitmyway.com/';
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Four neighbours per game: shared skills count most, then the closest age
// band; catalogue order breaks ties, so the choice is stable between runs.
function relatedTo(g) {
  const bandIx = (x) => C.bands.findIndex(b => b.id === x.age);
  return C.games
    .filter(o => o !== g)
    .map((o, i) => ({ o, i, score: o.skills.filter(s => g.skills.includes(s)).length * 3 - Math.abs(bandIx(o) - bandIx(g)) * 2 }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 4)
    .map(r => r.o);
}

function placeBlock(page, name, block, before) {
  const open = `<!-- pimw:${name}`, close = `<!-- /pimw:${name} -->`;
  const a = page.indexOf(open);
  if (a !== -1) {
    const lineStart = page.lastIndexOf('\n', a) + 1;
    const b = page.indexOf(close, a) + close.length;
    return page.slice(0, lineStart) + block + page.slice(b);
  }
  const at = page.indexOf(before);
  if (at === -1) throw new Error(`no ${before.trim()} to place pimw:${name} before`);
  const lineStart = page.lastIndexOf('\n', at) + 1;
  return page.slice(0, lineStart) + block + '\n' + page.slice(lineStart);
}

function buildGamePages() {
  for (const g of C.games) {
    const file = path.join(ROOT, 'games', g.slug, 'index.html');
    let page = fs.readFileSync(file, 'utf8');
    const url = SITE + 'games/' + g.slug + '/';
    const band = bandOf(g.age);
    const skills = skillsOf(g);
    const desc = page.match(/<meta\s+name="description"\s+content="([^"]*)"/);

    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': ['VideoGame', 'LearningResource'],
          name: g.name,
          url,
          description: desc ? unesc(desc[1]) : g.practises,
          teaches: g.practises,
          about: skills.map(s => s.name),
          learningResourceType: 'Educational game',
          inLanguage: 'en',
          isAccessibleForFree: true,
          gamePlatform: 'Web browser',
          applicationCategory: 'GameApplication',
          operatingSystem: 'Any',
          typicalAgeRange: g.age + '-',
          audience: { '@type': 'PeopleAudience', suggestedMinAge: Number(g.age) },
          ...(g.mins === 'open' ? {} : { timeRequired: 'PT' + g.mins + 'M' }),
          publisher: { '@type': 'Organization', name: 'Play It My Way', url: SITE }
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
            { '@type': 'ListItem', position: 2, name: 'All games', item: SITE + 'games/' },
            { '@type': 'ListItem', position: 3, name: g.name, item: url }
          ]
        }
      ]
    };
    // "</" never appears in the output, so no text can close the script early
    const ld = JSON.stringify(jsonld, null, 2).replace(/<\//g, '<\\/').replace(/^/gm, '      ');
    page = placeBlock(page, 'seo', `    <!-- pimw:seo — written by docs/build-pages.js from docs/catalogue.js; edits here are overwritten -->
    <script type="application/ld+json">
${ld}
    </script>
    <!-- /pimw:seo -->`, '</head>');

    const mins = g.mins === 'open' ? 'open-ended' : 'about ' + g.mins + ' minutes';
    let more = `    <!-- pimw:more — written by docs/build-pages.js from docs/catalogue.js; edits here are overwritten -->
    <section class="game-more" aria-labelledby="game-more-h">
      <nav class="game-crumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="../../">Home</a></li>
          <li><a href="../">All games</a></li>
          <li aria-current="page">${esc(g.name)}</li>
        </ol>
      </nav>
      <p class="game-facts">${band.label} · ${skills.map(s => esc(s.name)).join(' · ')} · ${mins}</p>
      <h2 id="game-more-h">More games like this</h2>
      <ul class="game-more-list">`;
    for (const o of relatedTo(g)) {
      more += `
        <li><a href="../${o.slug}/"><img src="../../icons/games/${o.slug}.svg" alt="" width="40" height="40"><span class="game-more-name">${esc(o.name)}</span><span class="game-more-age">${bandOf(o.age).label}</span></a></li>`;
    }
    more += `
      </ul>
      <p class="game-more-all"><a href="../">See all ${C.games.length} games</a></p>
    </section>
    <!-- /pimw:more -->`;
    page = placeBlock(page, 'more', more, '<footer class="site-footer">');

    fs.writeFileSync(file, page);
  }
  return C.games.length;
}

// The sitemap lists every public page with the date it last changed: the last
// commit that touched it, or today for a page with uncommitted edits. Google
// reads lastmod when it is accurate and ignores priority and changefreq, so
// those are left out. Without git (a copied folder), lastmod is left out too.
function buildSitemap() {
  const { execFileSync } = require('child_process');
  const git = (args) => {
    try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (e) { return null; }
  };
  const d = new Date();
  const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const changed = (p) => {
    const dirty = git(['status', '--porcelain', '--', p]);
    if (dirty === null) return null;
    return dirty ? today : (git(['log', '-1', '--format=%cs', '--', p]) || today);
  };

  const pages = [
    ['', 'index.html'],
    ['games/', 'games/index.html'],
    ['for-teachers', 'for-teachers.html'],
    ...C.games.map(g => ['games/' + g.slug + '/', 'games/' + g.slug + '/']),
    ['privacy-policy', 'privacy-policy.html'],
    ['disclaimer', 'disclaimer.html']
  ];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- written by docs/build-pages.js; edits here are overwritten -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const [loc, src] of pages) {
    const mod = changed(src);
    xml += `  <url>\n    <loc>${SITE}${loc}</loc>\n${mod ? `    <lastmod>${mod}</lastmod>\n` : ''}  </url>\n`;
  }
  xml += '</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  return pages.length;
}

function buildServiceWorker() {
  const skip = new Set(['sw.js', 'manifest.json', 'robots.txt', 'sitemap.xml', 'CNAME']);
  const urls = [];

  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir || '.'), { withFileTypes: true })) {
      const rel = (prefix ? prefix + '/' : '') + entry.name;
      if (entry.name.startsWith('.') || entry.name === 'docs' || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (!skip.has(rel) && /\.(html|css|js|woff2|svg|png)$/.test(entry.name)) {
        urls.push(
          '/' + rel.replace(/\\/g, '/')
            .replace(/(^|\/)index\.html$/, '$1')
            // The host serves /page for page.html and 308s the .html form.
            // cache.add() rejects on a redirect, so precaching the .html
            // spelling silently cached nothing at all — including the offline
            // fallback page. Ask for the URL that actually answers 200.
            .replace(/\.html$/, '')
        );
      }
    }
  };
  walk('', '');

  urls.sort();
  // The version tracks the SHAPE of the cache and the CONTENT of the shared
  // kit under games/shared/. Edited pages refresh themselves on the next visit
  // (stale-while-revalidate), but a page can start loading a shared file its
  // old version never asked for while an older copy of that file still sits in
  // the cache, and the new page would run against the old kit. So a changed
  // kit file changes the version, and returning visitors get one fresh,
  // consistent precache; edits elsewhere cost them nothing extra. Line endings
  // are normalised so a Windows and a Linux checkout stamp the same.
  const kit = urls.filter((u) => u.startsWith('/games/shared/')).map((u) => {
    const bytes = fs.readFileSync(path.join(ROOT, u.slice(1)));
    return /\.(js|css|svg|html)$/.test(u) ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes.toString('base64');
  });
  const stamp = require('crypto').createHash('sha1').update(urls.join('|') + '\n' + kit.join('\n')).digest('hex').slice(0, 8);

  const sw = `/* Play It My Way — offline service worker (generated by docs/build-pages.js)
 *
 * Caches the SITE'S OWN FILES so the games work with no connection. It stores
 * nothing about the child: no scores, no progress, no identifiers, no
 * analytics. There is deliberately no push code here — push would require a
 * per-device subscription held by a third party, which this site does not do.
 */
const CACHE = 'pimw-${stamp}';

const PRECACHE = ${JSON.stringify(urls, null, 2).replace(/\n/g, '\n')};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // individually, so one bad URL cannot fail the whole install
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Stale-while-revalidate: answer instantly from cache, then quietly refresh it
   so the next visit has the newest version. No deploy step has to remember to
   bump anything. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch third parties

  /* Pages are cached under the spelling the host serves (/for-teachers) but
     linked as for-teachers.html, because the .html links are what let the site
     open straight off a memory stick over file://. So either spelling can
     arrive here; a miss checks the other one before giving up on the cache. */
  const leaf = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  const alt = url.pathname.endsWith('.html')
    ? url.pathname.slice(0, -5)
    : leaf && leaf.indexOf('.') === -1 ? url.pathname + '.html' : null;

  event.respondWith(
    caches.match(req)
      .then((hit) => hit || (alt ? caches.match(alt) : undefined))
      .then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => null);

        if (hit) return hit;
        return fresh.then((res) => {
          if (res) return res;
          // offline and never cached: hand back a friendly page, not a browser
          // error. respondWith(undefined) throws, so this must always resolve
          // to a real Response even if the fallback page is missing too.
          if (req.mode === 'navigate') {
            return caches.match('/404')
              .then((r) => r || caches.match('/404.html'))
              .then((r) => r || OFFLINE());
          }
          return new Response('', { status: 504, statusText: 'Offline' });
        });
      })
  );
});

function OFFLINE() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Offline</title><body style="font-family:system-ui;text-align:center;padding:3em 1.5em;color:#2b2a5e">' +
    '<h1>No connection</h1><p>This page has not been saved for offline play yet.</p>' +
    '<p><a href="/games/" style="color:#2b2a5e">Back to the games</a></p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
`;
  /* sw.js is built inside a template literal, so a stray backslash in the
     worker's own source is eaten before it ever reaches the file — that once
     turned a regex into a line comment and silently disabled the fetch
     handler. Parse the result before writing it. */
  try {
    new Function(sw);
  } catch (e) {
    throw new Error('generated sw.js does not parse: ' + e.message);
  }

  fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);
  return urls.length;
}

const n = buildGamesIndex();
const s = buildTeachers();
build404();
const gp = buildGamePages();
const cached = buildServiceWorker();
const sm = buildSitemap();
console.log('games/index.html  — ' + n + ' games across ' + C.bands.filter(b => C.games.some(g => g.age === b.id)).length + ' bands');
console.log('for-teachers.html — ' + s + ' skill groups');
console.log('404.html          — written');
console.log('game pages        — ' + gp + ' given structured data and related games');
console.log('sw.js             — precaching ' + cached + ' files');
console.log('sitemap.xml       — ' + sm + ' pages');
