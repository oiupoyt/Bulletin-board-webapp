// Generates the public HTML pages from one template so the shell stays identical everywhere.
// Usage: node scripts/build-pages.mjs public
// When V changes, change it too in public/sw.js (VERSION and precache), public/manifest.webmanifest,
// public/js/install.js, public/admin.html, public/login.html and the tests that pin it.
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/build-pages.mjs <public dir>');
const V = '12.3';
const ORIGIN = 'https://mod.oiupoyt.space';
const DESCRIPTION = 'Announcements, weekly syllabus, phase tests and answer keys for the college campus.';

const NAV = [
  { href: '/', label: 'Announcements', section: 'announcements' },
  { href: '/syllabus', label: 'Syllabus', section: 'syllabus' },
  { href: '/phase-test', label: 'Phase test', section: 'phase' },
  { href: '/answer-keys', label: 'Answer keys', section: 'keys' },
];

function archive({ toggleId, arrowId, gridId, label, list }) {
  return `
    <section class="archive-section">
      <button id="${toggleId}" class="archive-toggle" type="button" aria-expanded="false" aria-controls="${gridId}Region">
        <span>${label}</span>
        <span class="archive-count" data-archive-count="${gridId}"></span>
        <span id="${arrowId}" class="archive-arrow-icon" data-icon="caretDown" data-icon-size="16"></span>
      </button>
      <div class="archive-collapse" id="${gridId}Region" inert>
        <div class="archive-collapse-inner">
          <div id="${gridId}" class="archive-grid${list ? ' as-list' : ''}"></div>
        </div>
      </div>
    </section>`;
}

function searchBox(id, placeholder, label) {
  return `
      <div class="search-box">
        <span class="search-icon" data-icon="search" data-icon-size="16"></span>
        <input type="search" id="${id}" class="search-input" placeholder="${placeholder}" aria-label="${label}" autocomplete="off" enterkeyhint="search" />
      </div>`;
}

const PAGES = [
  {
    file: 'index.html',
    section: 'announcements',
    path: '/',
    title: 'Announcements · Modulus Bulletin',
    h1: 'Announcements',
    sub: 'Circulars, test notices and holidays from campus.',
    markdown: true,
    side: `
      <section class="filter-card toolbar" aria-label="Search and filter">
        <div class="category-pills" id="categoryPills" role="group" aria-label="Category"></div>${searchBox('searchInput', 'Search', 'Search announcements')}
      </section>`,
    body: `
    <section id="announcementsList" class="feed-list" aria-label="Announcements"></section>`,
  },
  {
    file: 'syllabus.html',
    section: 'syllabus',
    path: '/syllabus',
    title: 'Weekly syllabus · Modulus Bulletin',
    h1: 'Weekly syllabus',
    sub: 'Portions for this week’s test. Earlier weeks are kept below.',
    body: `
    <section id="currentSyllabusBox" aria-label="This week’s syllabus"></section>
${archive({ toggleId: 'archiveToggle', arrowId: 'archiveArrow', gridId: 'archiveGrid', label: 'Past weeks' })}`,
  },
  {
    file: 'phase-test.html',
    section: 'phase',
    path: '/phase-test',
    title: 'Phase test · Modulus Bulletin',
    h1: 'Phase test',
    sub: 'The major exam held every two to three months: dates, scope and timetable.',
    body: `
    <section id="currentPhaseTestBox" aria-label="Current phase test"></section>
${archive({ toggleId: 'phaseArchiveToggle', arrowId: 'phaseArchiveArrow', gridId: 'phaseArchiveGrid', label: 'Past phase tests', list: true })}`,
  },
  {
    file: 'answer-keys.html',
    section: 'keys',
    path: '/answer-keys',
    title: 'Answer keys · Modulus Bulletin',
    h1: 'Answer keys',
    sub: 'Keys for recent tests, by set.',
    markdown: true,
    side: `
      <section class="filter-card" aria-label="Search">${searchBox('answerKeySearchInput', 'Search keys', 'Search answer keys by subject, test or date')}
      </section>`,
    body: `
    <section id="answerKeysList" class="feed-list" aria-label="Answer keys"></section>
${archive({ toggleId: 'keysArchiveToggle', arrowId: 'keysArchiveArrow', gridId: 'keysArchiveGrid', label: 'Older answer keys', list: true })}`,
  },
  {
    file: 'contacts.html',
    section: 'contacts',
    path: '/contacts',
    title: 'College contacts · Modulus Bulletin',
    h1: 'College contacts',
    sub: 'Message on WhatsApp or copy a number to call.',
    body: `
    <section id="contactsList" class="contacts-list" aria-live="polite">
      <div class="empty-state"><p>Loading contacts…</p></div>
    </section>`,
  },
];

function page(p) {
  const url = `${ORIGIN}${p.path}`;
  const nav = NAV.map((n) => {
    const active = n.href === p.path;
    return `<a href="${n.href}" class="nav-link${active ? ' active' : ''}" data-section="${n.section}"${active ? ' aria-current="page"' : ''}>${n.label}${active ? '<span class="nav-indicator" aria-hidden="true"></span>' : ''}</a>`;
  }).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${p.title}</title>
  <meta name="description" content="${DESCRIPTION}">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=${V}">
  <link rel="alternate icon" href="/favicon.ico?v=${V}">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=${V}">
  <link rel="manifest" href="/manifest.webmanifest?v=${V}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Modulus-bulletin">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="theme-color" content="#fafafb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#111113" media="(prefers-color-scheme: dark)">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Modulus Bulletin">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="Modulus Bulletin">
  <meta property="og:description" content="${DESCRIPTION}">
  <meta property="og:image" content="${ORIGIN}/og-image.png?v=${V}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="Modulus Bulletin: the |M| mark beside the title">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${url}">
  <meta name="twitter:title" content="Modulus Bulletin">
  <meta name="twitter:description" content="${DESCRIPTION}">
  <meta name="twitter:image" content="${ORIGIN}/og-image.png?v=${V}">
  <!-- The two text fonts are fetched first, so a new page draws with them, not a stand-in. -->
  <link rel="preload" href="/fonts/inter.woff2?v=1" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/css/style.min.css?v=${V}">
</head>
<body data-section="${p.section}">
  <a class="skip-link" href="#main">Skip to content</a>

  <header class="navbar">
    <div class="nav-container">
      <a href="/" class="brand" aria-label="Modulus Bulletin home">
        <img class="brand-mark" src="/mark.svg?v=${V}" alt="" width="26" height="24">
        <span>Modulus</span>
      </a>
      <nav class="nav-links" aria-label="Sections">
        ${nav}
      </nav>
      <button id="btnToggleNotifications" class="notif-toggle-btn" type="button" title="Turn on alerts for new notices" aria-label="Turn on alerts" aria-pressed="false">
        <span class="notif-bell" data-icon="bell" data-icon-size="18" data-icon-fill="false"></span><span class="notif-btn-label">Turn on alerts</span>
      </button>
    </div>
  </header>

  <div id="toastRegion" class="toast-region" aria-live="polite" role="status"></div>

  <main id="main" class="container">
    <div class="layout${p.side ? ' has-side' : ''}">
      <header class="page-header layout-head">
        <p class="page-updated eyebrow eyebrow-star" id="pageUpdated" hidden></p>
        <h1 class="page-title">${p.h1}</h1>
        <p class="page-subtitle">${p.sub}</p>
      </header>${p.side ? `
      <aside class="layout-side" aria-label="Search and filters">${p.side}
      </aside>` : ''}
      <aside class="rail" id="weekRail" aria-label="This week" hidden></aside>
      <div class="layout-body">${p.body}
      </div>
    </div>
  </main>

  <div id="lightboxModal" class="modal-overlay hidden" role="dialog" aria-modal="true" aria-label="Image">
    <button id="lightboxCloseBtn" class="modal-close-btn" type="button" aria-label="Close image" data-icon="close" data-icon-size="18"></button>
    <div class="modal-content">
      <img id="lightboxImg" class="modal-img" src="data:," alt="">
    </div>
  </div>

  <footer class="site-footer">
    <div class="footer-container">
      <div class="footer-main">
        <div class="footer-brand">
          <a href="/" class="footer-mark" aria-label="Modulus Bulletin home"><img src="/mark.svg?v=${V}" alt="" width="44" height="40"></a>
          <p class="footer-line">Modulus Bulletin. <span>Notices, portions, phase tests and answer keys, in one place.</span></p>
        </div>
        <div class="footer-links">
          <div class="footer-instagram-center">
            <a href="https://instagram.com/oiupoyt" target="_blank" rel="noopener noreferrer" class="footer-ig-link" title="Contact on Instagram"><span data-icon="instagram" data-icon-size="14"></span><span>@oiupoyt</span></a>
          </div>
          <a href="/contacts" class="footer-contacts-link">College contacts</a>
          <button type="button" id="footerInstallBtn" class="footer-install-link" hidden>Install as app</button>
        </div>
      </div>
      <div class="footer-fine">
        <p class="disclaimer-text">An unofficial bulletin made by a student. Not an official college portal.</p>
      </div>
    </div>
    <div class="footer-word" aria-hidden="true">Modulus</div>
  </footer>

  <script src="/js/icons.js?v=${V}"></script>
  <script src="/js/core.js?v=${V}"></script>
${p.markdown ? `  <script src="/js/marked.umd.js?v=${V}"></script>\n  <script src="/js/purify.min.js?v=${V}"></script>\n` : ''}  <script src="/js/app.js?v=${V}"></script>
  <script src="/js/notifications.js?v=${V}"></script>
  <script src="/js/install.js?v=${V}"></script>
</body>
</html>
`;
}

for (const p of PAGES) {
  fs.writeFileSync(path.join(out, p.file), page(p));
  console.log('wrote', p.file);
}
