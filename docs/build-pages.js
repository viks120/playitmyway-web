/* Generates games/index.html, for-teachers.html and 404.html from
   catalogue.js. The site itself has no build step — these are committed as
   finished static files; this script just keeps them in sync with one
   source of truth. Re-run after adding a game:

       node docs/build-pages.js

   Then add the new game to sitemap.xml and the homepage by hand. */
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
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#c2410c" />

    <link rel="icon" type="image/svg+xml" href="${opts.up}favicon.svg" />

    <title>${esc(opts.title)}</title>
    <meta name="description" content="${esc(opts.description)}" />
    <meta name="keywords" content="${esc(opts.keywords)}" />
    <meta name="author" content="Play It My Way" />
    <meta name="robots" content="${opts.robots || 'index, follow, max-image-preview:large'}" />

    <meta property="og:title" content="${esc(opts.title)}" />
    <meta property="og:description" content="${esc(opts.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${opts.canonical}" />
    <meta property="og:site_name" content="Play It My Way" />
    <meta property="og:locale" content="en_US" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${esc(opts.title)}" />
    <meta name="twitter:description" content="${esc(opts.description)}" />

    <link rel="canonical" href="${opts.canonical}" />
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
        <a href="${up}disclaimer.html">Disclaimer</a>
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
  </body>
</html>
`;

const PAGE_CSS = `      .page-intro {
        max-width: 760px;
        margin: 0 auto 8px;
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
        table.games td.g { font-size: 1.1rem; padding-top: 12px; }
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
    <header class="hero">
      <h1>🎮 All Games</h1>
      <p class="tagline">${C.games.length} games. Every one worth playing.</p>
      <ul class="trust-badges">
        <li>No ads. Ever.</li>
        <li>No tracking. Ever.</li>
        <li>Nothing stored. Ever.</li>
        <li>Free. Actually free.</li>
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
            <span class="game-icon" aria-hidden="true">${g.emoji}</span>
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
    title: 'For Parents & Teachers — What Each Game Builds | Play It My Way',
    description: 'What every Play It My Way game actually practises, the age it suits, and how long it takes. Free, ad-free and storage-free games for home and the classroom.',
    keywords: 'educational games for teachers, free classroom games, what skills do kids games teach, ad free games for schools, safe games for kids',
    canonical: 'https://playitmyway.com/for-teachers.html',
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
          Every game here runs entirely in the browser. Nothing is saved — no scores,
          no names, no progress, no cookies, no accounts. Close the tab and it is gone.
          That is deliberate, and it has one consequence worth knowing: a child cannot
          pick up where they left off. Where a game has difficulty levels, they are
          chosen rather than earned, so you can put a child straight back where they were.
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
                <td class="g"><a href="games/${g.slug}/">${g.emoji} ${esc(g.name)}</a></td>
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
    canonical: 'https://playitmyway.com/404.html',
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
            <span class="game-icon" aria-hidden="true">${g.emoji}</span>
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

const n = buildGamesIndex();
const s = buildTeachers();
build404();
console.log('games/index.html  — ' + n + ' games across ' + C.bands.filter(b => C.games.some(g => g.age === b.id)).length + ' bands');
console.log('for-teachers.html — ' + s + ' skill groups');
console.log('404.html          — written');
