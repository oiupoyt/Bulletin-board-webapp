/**
 * Public pages: announcements, weekly syllabus, phase test, answer keys, contacts.
 * Every list is drawn from state; filters keep the old cards on screen (dimmed) until the
 * new answer arrives, and a newer request always wins over a slower older one.
 */
const { escapeHtml, icon: ICON, formatDate, formatWeekday, timeTag, toTime, isImage, fileKind, cleanTitle, toast } = window.UI;

const state = {
  announcements: [],
  categories: [],
  selectedCategory: 'All',
  searchQuery: '',
  currentSyllabus: null,
  syllabusArchive: [],
  archiveOpen: false,
  currentPhaseTest: null,
  phaseTestsArchive: [],
  phaseArchiveOpen: false,
  answerKeys: [],
  answerKeysArchive: [],
  keysArchiveOpen: false,
  answerKeySearchQuery: '',
};

// ── Images fade in when they arrive ──
// Load and error events don't bubble, so one capturing listener sees every image the page draws
// later. CSS keeps an image transparent until it is marked; an error marks it too, so a broken
// image still shows its frame and alt text instead of nothing.
function markImageArrived(e) {
  if (e.target instanceof HTMLImageElement) e.target.classList.add('is-loaded');
}
document.addEventListener('load', markImageArrived, true);
document.addEventListener('error', markImageArrived, true);
// An image that is already complete when it is inserted is marked straight away.
new MutationObserver((records) => {
  for (const r of records) {
    r.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      const imgs = node instanceof HTMLImageElement ? [node] : node.querySelectorAll('img');
      imgs.forEach((img) => { if (img.complete) img.classList.add('is-loaded'); });
    });
  }
}).observe(document.getElementById('main') || document.body, { childList: true, subtree: true });

// ── What's new since your last visit ──
// Each section remembers when you last opened it. The value read on arrival is held for the
// session, so reloading keeps the markers. A first visit marks nothing: everything glowing
// would mean nothing.
const SEEN_KEY = (section) => `bulletin-seen:${section}`;
const FIRST_VISIT_KEY = 'bulletin-first-visit';

function storageGet(store, key) {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
}

function storageSet(store, key, value) {
  try {
    window[store].setItem(key, value);
  } catch {
    // storage disabled: markers simply don't persist
  }
}

const seen = (() => {
  const section = document.body.dataset.section || '';
  const now = Date.now();
  if (!storageGet('localStorage', FIRST_VISIT_KEY)) storageSet('localStorage', FIRST_VISIT_KEY, String(now));
  if (!section) return { section, baseline: null };
  let held = storageGet('sessionStorage', SEEN_KEY(section));
  if (held === null) {
    held = storageGet('localStorage', SEEN_KEY(section)) || 'none';
    storageSet('sessionStorage', SEEN_KEY(section), held);
  }
  storageSet('localStorage', SEEN_KEY(section), String(now));
  return { section, baseline: held === 'none' ? null : Number(held) };
})();

// Another section's baseline: your last visit there, or your first visit to the site.
function baselineFor(section) {
  const value = storageGet('localStorage', SEEN_KEY(section)) || storageGet('localStorage', FIRST_VISIT_KEY);
  return value ? Number(value) : null;
}

// Admin-written markdown is rendered to HTML, so it goes through DOMPurify before innerHTML.
function sanitizeHtml(html) {
  if (!html) return '';
  if (!window.DOMPurify) return escapeHtml(html);
  return window.DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'select', 'textarea'],
    FORBID_ATTR: ['style'],
  });
}

function renderMarkdown(rawText) {
  if (!rawText) return '';
  if (window.marked && typeof window.marked.parse === 'function') {
    try {
      return sanitizeHtml(window.marked.parse(rawText, { gfm: true, breaks: true }));
    } catch (e) {
      console.warn('Markdown parsing error:', e);
    }
  }
  return escapeHtml(rawText);
}

// "Updated Wed, 25 Nov" over the page title: the newest thing in this section. It stays hidden
// until the data has a date, so a page never claims freshness it can't show.
function setUpdated(items) {
  const el = document.getElementById('pageUpdated');
  if (!el) return;
  const latest = Math.max(0, ...items.filter(Boolean).map((it) => toTime(it.posted_at) || 0));
  if (!latest || (el.dataset.latest && Number(el.dataset.latest) >= latest)) return;
  el.dataset.latest = String(latest);
  el.textContent = `Updated ${formatDay(new Date(latest))}`;
  el.hidden = false;
}

// ── Shared fragments ──
function emptyState(iconName, title, text) {
  return `
    <div class="empty-state">
      ${iconName ? `<span class="empty-icon">${ICON(iconName, 24)}</span>` : ''}
      ${title ? `<h3>${escapeHtml(title)}</h3>` : ''}
      ${text ? `<p>${escapeHtml(text)}</p>` : ''}
    </div>`;
}

function errorState(text) {
  return `<div class="empty-state is-error"><p>${escapeHtml(text)}</p></div>`;
}

function skeletonEntries(count = 3) {
  return Array.from({ length: count }, (_, i) => `
    <div class="skeleton" aria-hidden="true">
      <span class="bar bar-meta"></span>
      <span class="bar bar-title" style="width:${[58, 46, 64][i % 3]}%"></span>
      <span class="bar" style="width:92%"></span>
      <span class="bar" style="width:${[70, 54, 62][i % 3]}%"></span>
    </div>`).join('');
}

function skeletonCurrent() {
  return `
    <div class="current-card" aria-hidden="true">
      <span class="bar bar-meta"></span>
      <span class="bar bar-title"></span>
      <span class="bar bar-current" style="margin-top:20px"></span>
    </div>`;
}

function loadingRegion(container, label, html) {
  container.innerHTML = `<span class="sr-only">${escapeHtml(label)}</span>${html}`;
}

// A file that is not an image: one row with its name, kind and a download button. `primary`
// makes the button the screen's one glossy call to action (the phase test timetable).
function fileRow(url, name, { primary = false } = {}) {
  return `
    <div class="attachment-box">
      <span class="file-tile">${ICON('doc', 16)}</span>
      <span class="attachment-info">
        <span class="attachment-name" title="${escapeHtml(name || '')}">${escapeHtml(name || 'Attached file')}</span>
        <span class="attachment-kind">${escapeHtml(fileKind(url))}</span>
      </span>
      <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-ghost ${primary ? '' : 'btn-sm'}">Open</a>
      <a href="${escapeHtml(url)}" download class="btn ${primary ? '' : 'btn-secondary btn-sm'}">${ICON('download', primary ? 16 : 14)}Download</a>
    </div>`;
}

// ── Motion helpers ──
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function hasCards(container) {
  return Boolean(container.querySelector('.announcement-card'));
}

// Keeps the current cards on screen (dimmed) while a filter or search refetches.
function setBusy(container, busy) {
  container.setAttribute('aria-busy', busy ? 'true' : 'false');
}

// Staggers only the first few cards; the rest appear at once so long lists never feel slow.
function animateCards(container) {
  if (reducedMotion.matches) return;
  const cards = Array.from(container.querySelectorAll('.announcement-card, .contact-card'));
  cards.slice(0, 6).forEach((card, i) => {
    card.style.setProperty('--enter-delay', `${i * 30}ms`);
    card.classList.add('card-enter');
    card.addEventListener('animationend', () => card.classList.remove('card-enter'), { once: true });
  });
}

const fetchIds = {};
function nextRequestId(key) {
  fetchIds[key] = (fetchIds[key] || 0) + 1;
  return fetchIds[key];
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Lightbox Modal ──
let lightboxReturnFocus = null;

function setPageInert(inert) {
  document.querySelectorAll('body > header, body > main, body > footer').forEach((el) => {
    el.inert = inert;
  });
}

function openLightbox(imgSrc, title = 'Attachment') {
  const modal = document.getElementById('lightboxModal');
  const modalImg = document.getElementById('lightboxImg');
  if (!modal || !modalImg) return;
  lightboxReturnFocus = document.activeElement;
  modalImg.src = imgSrc;
  modalImg.alt = title;
  modal.setAttribute('aria-label', title);
  modal.classList.remove('hidden');
  // Flush styles so the transition starts from the hidden state, without waiting for a frame.
  void modal.offsetWidth;
  modal.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  setPageInert(true);
  const closeBtn = document.getElementById('lightboxCloseBtn');
  if (closeBtn) closeBtn.focus();
}

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.remove('is-open');
  document.body.style.overflow = '';
  setPageInert(false);
  let done = false;
  const finish = () => {
    if (done || modal.classList.contains('is-open')) return;
    done = true;
    modal.classList.add('hidden');
    if (lightboxReturnFocus && typeof lightboxReturnFocus.focus === 'function') lightboxReturnFocus.focus();
  };
  modal.addEventListener('transitionend', finish, { once: true });
  window.setTimeout(finish, 260); // reduced motion or no transition: still close
}

// Lightbox click delegation for safe attribute handling
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-lightbox-src]');
  if (trigger) {
    e.preventDefault();
    openLightbox(trigger.getAttribute('data-lightbox-src'), trigger.getAttribute('data-lightbox-title') || 'Attachment');
  }
});

// ── Announcements ──
async function loadCategories() {
  try {
    const data = await getJson('/api/categories');
    state.categories = data.categories || [];
    renderCategoryPills();
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

// Chips render once; selecting one moves the highlight instead of redrawing the row, so the
// highlight can glide (and retarget mid-way) rather than reappear.
function renderCategoryPills() {
  const container = document.getElementById('categoryPills');
  if (!container) return;
  const all = [{ name: 'All' }, ...state.categories];
  container.innerHTML = `<span class="cat-highlight" aria-hidden="true"><span class="cat-highlight-fill is-placing"></span></span>${all
    .map((cat) => {
      const active = state.selectedCategory === cat.name;
      return `<button type="button" class="cat-pill${active ? ' active' : ''}" aria-pressed="${active}" data-cat="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</button>`;
    })
    .join('')}`;
  container.classList.add('has-highlight');
  placeHighlight(container, { instant: true });
}

function selectCategory(container, name) {
  state.selectedCategory = name;
  container.querySelectorAll('.cat-pill').forEach((btn) => {
    const active = btn.dataset.cat === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  placeHighlight(container, { instant: false });
}

function placeHighlight(container, { instant }) {
  const layer = container.querySelector('.cat-highlight');
  const fill = layer && layer.firstElementChild;
  const active = container.querySelector('.cat-pill.active');
  if (!fill || !active) return;
  const width = container.scrollWidth;
  const height = container.clientHeight;
  layer.style.setProperty('--hl-w', `${width}px`);
  fill.style.setProperty('--hl-t', `${active.offsetTop}px`);
  fill.style.setProperty('--hl-b', `${height - active.offsetTop - active.offsetHeight}px`);
  fill.style.setProperty('--hl-l', `${active.offsetLeft}px`);
  fill.style.setProperty('--hl-r', `${width - active.offsetLeft - active.offsetWidth}px`);
  if (instant) {
    fill.classList.add('is-placing');
    void fill.offsetWidth; // commit the position before transitions come back on
    fill.classList.remove('is-placing');
  }
  if (!instant) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

// ── View transitions: things keep their identity while the list changes ──
const canTransition = () => typeof document.startViewTransition === 'function' && !reducedMotion.matches;

function namePosts(container, skip) {
  container.querySelectorAll('.entry[data-id]').forEach((post) => {
    if (post === skip) return;
    post.style.viewTransitionName = `post-${post.dataset.id}`;
    post.style.viewTransitionClass = 'post';
  });
}

function unnamePosts(container) {
  container.querySelectorAll('.entry[data-id]').forEach((post) => {
    post.style.viewTransitionName = '';
    post.style.viewTransitionClass = '';
  });
}

// Runs a DOM change inside a view transition; names exist only for its duration, so page
// navigations (which have their own transition) never see dozens of named posts.
function transitionPosts(container, change, skip) {
  if (!canTransition()) {
    change();
    return;
  }
  namePosts(container, skip);
  const vt = document.startViewTransition(() => {
    change();
    namePosts(container, skip);
  });
  vt.finished.finally(() => unnamePosts(container));
}

async function loadAnnouncements() {
  const container = document.getElementById('announcementsList');
  if (!container) return;

  const requestId = nextRequestId('announcements');
  if (hasCards(container)) {
    setBusy(container, true);
  } else {
    loadingRegion(container, 'Loading announcements', skeletonEntries(3));
  }

  try {
    const params = new URLSearchParams();
    if (state.selectedCategory && state.selectedCategory !== 'All') params.append('category', state.selectedCategory);
    if (state.searchQuery) params.append('search', state.searchQuery);

    const data = await getJson(`/api/announcements?${params.toString()}`);
    if (requestId !== fetchIds.announcements) return; // a newer filter/search already won
    const firstLoad = !hasCards(container);
    const apply = () => {
      state.announcements = data.announcements || [];
      if (state.selectedCategory === 'All' && !state.searchQuery) setUpdated(state.announcements);
      renderAnnouncements();
      setBusy(container, false);
    };
    if (firstLoad) {
      apply();
      animateCards(container); // the first arrival staggers in
    } else {
      transitionPosts(container, apply); // later changes: kept posts slide, others fade
    }
  } catch (err) {
    if (requestId !== fetchIds.announcements) return;
    container.innerHTML = errorState('Could not load announcements. Check your connection and try again.');
  } finally {
    if (requestId === fetchIds.announcements) setBusy(container, false);
  }
}

function announcementAttachment(item) {
  if (!item.attachment_url) return '';
  if (isImage(item.attachment_url)) {
    return `
      <button type="button" class="attachment-img-preview" data-lightbox-src="${escapeHtml(item.attachment_url)}" data-lightbox-title="${escapeHtml(item.title)}" aria-label="Open image: ${escapeHtml(item.attachment_name || item.title)}">
        <img src="${escapeHtml(item.attachment_url)}" alt="" loading="lazy" decoding="async" />
      </button>`;
  }
  return fileRow(item.attachment_url, item.attachment_name);
}

function isNewPost(item) {
  return seen.baseline !== null && (toTime(item.posted_at) || 0) > seen.baseline;
}

// The date lives in the gutter on wide screens and folds into the meta line on phones.
function announcementCard(item) {
  const pinned = Boolean(item.pinned);
  const fresh = isNewPost(item);
  const weekday = formatWeekday(item.posted_at);
  return `
    <article class="announcement-card entry${fresh ? ' is-new' : ''}" data-id="${Number(item.id)}">
      <div class="entry-aside">
        <span class="entry-date">${timeTag(item.posted_at)}</span>
        ${weekday ? `<span class="entry-weekday">${escapeHtml(weekday)}</span>` : ''}
        ${pinned ? `<span class="entry-pin">${ICON('pin', 12)}Pinned</span>` : ''}
        ${fresh ? '<span class="entry-new">New</span>' : ''}
      </div>
      <div class="entry-main">
        <div class="card-meta">
          ${fresh ? '<span class="meta-new only-compact">New</span>' : ''}
          ${pinned ? `<span class="pinned-label only-compact">${ICON('pin', 12)}Pinned</span>` : ''}
          <span class="tag">${escapeHtml(item.category)}</span>
          ${item.author ? `<span class="meta-author"><span class="mini-avatar" aria-hidden="true">${escapeHtml(initials(item.author))}</span>${escapeHtml(item.author)}</span>` : ''}
          <span class="only-compact">${timeTag(item.posted_at)}</span>
        </div>
        <h2 class="card-title">${escapeHtml(cleanTitle(item.title))}</h2>
        <div class="card-body markdown-body" data-clamp>${renderMarkdown(item.body)}</div>
        <button type="button" class="show-more" aria-expanded="false" hidden>Show more</button>
        ${announcementAttachment(item)}
      </div>
    </article>`;
}

// Long bodies fold to five lines; only bodies that actually overflow get the toggle.
function clampBodies(container) {
  container.querySelectorAll('[data-clamp]').forEach((body) => {
    const toggle = body.nextElementSibling;
    if (!toggle || !toggle.classList.contains('show-more')) return;
    const lineHeight = parseFloat(getComputedStyle(body).lineHeight) || 24;
    // Fold only when it saves at least two lines; folding one line away is noise. Seven lines
    // show, because notices open with a greeting that would otherwise fill the preview.
    if (body.scrollHeight > lineHeight * 9) {
      body.classList.add('is-clamped');
      toggle.hidden = false;
    }
  });
}

document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.show-more');
  if (!toggle) return;
  const body = toggle.previousElementSibling;
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  const post = toggle.closest('.entry');
  const list = toggle.closest('.feed-list') || document.body;
  // The posts below are carried to their new place; the post itself is left out so its
  // unchanged first lines don't cross-fade over themselves.
  transitionPosts(list, () => {
    body.classList.toggle('is-clamped', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Show less' : 'Show more';
  }, post);
});

function renderAnnouncements() {
  const container = document.getElementById('announcementsList');
  if (!container) return;

  if (state.announcements.length === 0) {
    const filtered = state.searchQuery || state.selectedCategory !== 'All';
    container.innerHTML = filtered
      ? emptyState('search', 'Nothing matches', 'Try another word or a different category.')
      : emptyState('megaphone', 'No announcements yet', 'New circulars and notices will appear here.');
    return;
  }

  const pinned = state.announcements.filter((a) => a.pinned);
  const rest = state.announcements.filter((a) => !a.pinned);
  // One "Earlier" rule after the last new post, only when there are both new and old posts.
  const firstOld = rest.findIndex((a) => !isNewPost(a));
  const entries = rest
    .map((item, i) => (i === firstOld && firstOld > 0 ? '<div class="feed-divider" role="separator">Earlier</div>' : '') + announcementCard(item))
    .join('');
  container.innerHTML = `
    ${pinned.length ? `<div class="feed-pinned">${pinned.map(announcementCard).join('')}</div>` : ''}
    ${rest.length ? `<div class="feed-entries">${entries}</div>` : ''}`;
  clampBodies(container);
}

// ── Weekly syllabus ──
async function loadSyllabusPage() {
  const currentBox = document.getElementById('currentSyllabusBox');
  if (!currentBox) return;
  loadingRegion(currentBox, 'Loading this week’s syllabus', skeletonCurrent());

  try {
    const [currentData, archiveData] = await Promise.all([
      getJson('/api/syllabus/current'),
      getJson('/api/syllabus/archive'),
    ]);
    state.currentSyllabus = currentData.syllabus || null;
    state.syllabusArchive = archiveData.archive || [];
    setUpdated([state.currentSyllabus, ...state.syllabusArchive]);
    renderCurrentSyllabus();
    renderSyllabusArchive();
    // No syllabus this week: the past weeks are what there is to see, so they open on arrival.
    if (!state.currentSyllabus && state.syllabusArchive.length && !state.archiveOpen) {
      document.getElementById('archiveToggle')?.click();
    }
  } catch (err) {
    currentBox.innerHTML = errorState('Could not load the syllabus. Check your connection and try again.');
  }
}

function renderCurrentSyllabus() {
  const box = document.getElementById('currentSyllabusBox');
  if (!box) return;
  const current = state.currentSyllabus;
  if (!current) {
    box.innerHTML = emptyState('calendar', 'No syllabus for this week yet', 'It usually goes up before the weekly test. Past weeks are below.');
    return;
  }

  box.innerHTML = `
    <article class="current-card">
      <div class="card-meta">
        <span class="eyebrow">This week</span>
        ${timeTag(current.posted_at, 'Uploaded ')}
      </div>
      <h2 class="current-title">${escapeHtml(current.week_label)}</h2>
      <button type="button" class="figure" data-lightbox-src="${escapeHtml(current.image_url)}" data-lightbox-title="${escapeHtml(current.week_label)}" aria-label="Open full size: ${escapeHtml(current.week_label)}">
        <img src="${escapeHtml(current.image_url)}" alt="" decoding="async" />
      </button>
      <div class="figure-actions">
        <a href="${escapeHtml(current.image_url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">${ICON('externalLink', 14)}Open full size</a>
        <a href="${escapeHtml(current.image_url)}" download class="btn btn-secondary btn-sm">${ICON('download', 14)}Download</a>
      </div>
    </article>`;
}

function setArchiveCount(id, count) {
  const el = document.querySelector(`[data-archive-count="${id}"]`);
  if (el) el.textContent = count ? String(count) : '';
}

function renderSyllabusArchive() {
  const container = document.getElementById('archiveGrid');
  if (!container) return;
  setArchiveCount('archiveGrid', state.syllabusArchive.length);

  if (state.syllabusArchive.length === 0) {
    container.innerHTML = emptyState(null, null, 'No past weeks yet.');
    return;
  }

  container.innerHTML = state.syllabusArchive
    .map((item) => `
      <div class="archive-item">
        <button type="button" class="archive-thumb" data-lightbox-src="${escapeHtml(item.image_url)}" data-lightbox-title="${escapeHtml(item.week_label)}" aria-label="Open ${escapeHtml(item.week_label)}">
          <img src="${escapeHtml(item.image_url)}" alt="" loading="lazy" decoding="async" />
        </button>
        <div class="archive-body">
          <div class="archive-text">
            <span class="archive-title" title="${escapeHtml(item.week_label)}">${escapeHtml(item.week_label)}</span>
            <span class="archive-meta">${timeTag(item.posted_at)}</span>
          </div>
          <a href="${escapeHtml(item.image_url)}" download class="btn btn-ghost btn-sm btn-icon" aria-label="Download ${escapeHtml(item.week_label)}">${ICON('download', 16)}</a>
        </div>
      </div>`)
    .join('');
}

// ── Phase test ──
async function loadPhaseTestsPage() {
  const currentBox = document.getElementById('currentPhaseTestBox');
  if (!currentBox) return;
  loadingRegion(currentBox, 'Loading the phase test', skeletonCurrent());

  try {
    const [currentData, archiveData] = await Promise.all([
      getJson('/api/phase-tests/current'),
      getJson('/api/phase-tests/archive'),
    ]);
    state.currentPhaseTest = currentData.phaseTest || null;
    state.phaseTestsArchive = archiveData.archive || [];
    setUpdated([state.currentPhaseTest, ...state.phaseTestsArchive]);
    renderCurrentPhaseTest();
    renderPhaseTestsArchive();
  } catch (err) {
    currentBox.innerHTML = errorState('Could not load the phase test. Check your connection and try again.');
  }
}

function renderCurrentPhaseTest() {
  const box = document.getElementById('currentPhaseTestBox');
  if (!box) return;
  const current = state.currentPhaseTest;
  if (!current) {
    box.innerHTML = emptyState('exam', 'No phase test announced yet', 'When one is scheduled, its dates, scope and timetable appear here.');
    return;
  }

  let attachment = '';
  if (current.attachment_url) {
    attachment = isImage(current.attachment_url)
      ? `
        <button type="button" class="figure" data-lightbox-src="${escapeHtml(current.attachment_url)}" data-lightbox-title="${escapeHtml(current.title)}" aria-label="Open full size: ${escapeHtml(current.title)}">
          <img src="${escapeHtml(current.attachment_url)}" alt="" decoding="async" />
        </button>
        <div class="figure-actions">
          <a href="${escapeHtml(current.attachment_url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">${ICON('externalLink', 14)}Open full size</a>
          <a href="${escapeHtml(current.attachment_url)}" download class="btn btn-secondary btn-sm">${ICON('download', 14)}Download</a>
        </div>`
      : fileRow(current.attachment_url, current.attachment_name || 'Timetable and syllabus', { primary: true });
  }

  // The exam dates, read: formatted when the typed text parses, as typed otherwise. The typed text
  // stays in small print, since admins put times and notes in it.
  const range = parseDateRange(current.exam_date);
  const ps = phaseState(current);
  const shown = range ? formatRange(range) : current.exam_date;

  // Two zones: a header (what and when, beside the countdown) and the content (scope, timetable).
  // The exam dates are the one big, highlighted figure on the page.
  box.innerHTML = `
    <article class="current-card phase-card">
      <header>
        <div class="current-head">
          <span class="eyebrow eyebrow-star">${escapeHtml(current.phase_label)}</span>
          <span class="card-meta">${timeTag(current.posted_at, 'Posted ')}</span>
        </div>
        <div class="phase-hero${ps && ps.range ? ' has-count' : ''}">
          <div class="phase-what">
            ${shown ? `<p class="phase-date${range ? '' : ' is-typed'}"><span class="sr-only">Exam dates: </span><span class="hl">${escapeHtml(shown)}</span></p>` : ''}
            <h2 class="phase-title">${escapeHtml(cleanTitle(current.title))}</h2>
            ${range && current.exam_date.trim() !== shown ? `<p class="phase-typed">From the notice: ${escapeHtml(current.exam_date)}</p>` : ''}
          </div>
          ${countdown(ps)}
        </div>
      </header>
      ${current.description ? `
        <section class="phase-section">
          <h3 class="section-heading">Scope</h3>
          <div class="prose">${formatPlainText(current.description)}</div>
        </section>` : ''}
      ${attachment ? `
        <section class="phase-section">
          <h3 class="section-heading">Timetable</h3>
          ${attachment}
        </section>` : ''}
    </article>`;
}

// Plain admin text, shaped for reading: blank lines split paragraphs, and lines that start with
// "•", "-" or "*" become a real list with hanging indents. Everything is escaped.
function formatPlainText(text) {
  const blocks = String(text).replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return '';
      const bullet = /^[•\-*]\s+/;
      if (lines.every((l) => bullet.test(l))) {
        return `<ul>${lines.map((l) => `<li>${escapeHtml(l.replace(bullet, ''))}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.map(escapeHtml).join('<br>')}</p>`;
    })
    .join('');
}

function archiveRowActions(url, label) {
  if (!url) return '';
  const view = isImage(url)
    ? `<button type="button" class="btn btn-ghost btn-sm" data-lightbox-src="${escapeHtml(url)}" data-lightbox-title="${escapeHtml(label)}">View</button>`
    : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">View</a>`;
  return `
    <div class="row-actions">
      ${view}
      <a href="${escapeHtml(url)}" download class="btn btn-ghost btn-sm btn-icon" aria-label="Download ${escapeHtml(label)}">${ICON('download', 16)}</a>
    </div>`;
}

function renderPhaseTestsArchive() {
  const container = document.getElementById('phaseArchiveGrid');
  if (!container) return;
  setArchiveCount('phaseArchiveGrid', state.phaseTestsArchive.length);

  if (state.phaseTestsArchive.length === 0) {
    container.innerHTML = emptyState(null, null, 'No past phase tests yet.');
    return;
  }

  container.innerHTML = `
    <div class="sheet">
      ${state.phaseTestsArchive.map((item) => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${escapeHtml(cleanTitle(item.title))}</span>
            <span class="row-meta">${[escapeHtml(item.phase_label), item.exam_date ? escapeHtml(readableDate(item.exam_date, item.posted_at)) : ''].filter(Boolean).join(' · ')}</span>
          </div>
          ${archiveRowActions(item.attachment_url, item.title)}
        </div>`).join('')}
    </div>`;
}

// ── Answer keys ──
async function loadAnswerKeysPage() {
  await Promise.all([loadAnswerKeys(), loadAnswerKeysArchive()]);
}

async function loadAnswerKeys() {
  const container = document.getElementById('answerKeysList');
  if (!container) return;

  const requestId = nextRequestId('answerKeys');
  if (hasCards(container)) {
    setBusy(container, true);
  } else {
    loadingRegion(container, 'Loading answer keys', skeletonEntries(2));
  }

  try {
    const params = new URLSearchParams();
    if (state.answerKeySearchQuery) params.append('search', state.answerKeySearchQuery);
    const data = await getJson(`/api/answer-keys?${params.toString()}`);
    if (requestId !== fetchIds.answerKeys) return;
    state.answerKeys = data.answerKeys || [];
    if (!state.answerKeySearchQuery) setUpdated(state.answerKeys);
    renderAnswerKeys();
    animateCards(container);
  } catch (err) {
    if (requestId !== fetchIds.answerKeys) return;
    container.innerHTML = errorState('Could not load answer keys. Check your connection and try again.');
  } finally {
    if (requestId === fetchIds.answerKeys) setBusy(container, false);
  }
}

async function loadAnswerKeysArchive() {
  const container = document.getElementById('keysArchiveGrid');
  if (!container) return;
  try {
    const data = await getJson('/api/answer-keys/archive');
    state.answerKeysArchive = data.archive || [];
    setUpdated(state.answerKeysArchive);
    renderAnswerKeysArchive();
  } catch (err) {
    console.error('Failed to load answer keys archive:', err);
  }
}

function keySets(item) {
  return ['a', 'b', 'c', 'd']
    .map((k) => ({ label: `Set ${k.toUpperCase()}`, url: item[`set_${k}_url`], name: item[`set_${k}_name`] }))
    .filter((s) => Boolean(s.url));
}

function renderAnswerKeys() {
  const container = document.getElementById('answerKeysList');
  if (!container) return;

  if (state.answerKeys.length === 0) {
    container.innerHTML = state.answerKeySearchQuery
      ? emptyState('search', 'Nothing matches', 'Try the subject, the test name or the date.')
      : emptyState('key', 'No answer keys yet', 'Keys for recent tests appear here as soon as they are uploaded.');
    return;
  }

  container.innerHTML = `<div class="feed-entries">${state.answerKeys
    .map((item) => {
      const sets = keySets(item);
      // Image keys are shown, not just named: a preview per set that opens in the lightbox.
      const gallery = sets
        .filter((s) => isImage(s.url))
        .map((s) => {
          const title = `${item.title}, ${s.label}`;
          return `
            <figure class="key-set">
              <button type="button" class="key-thumb" data-lightbox-src="${escapeHtml(s.url)}" data-lightbox-title="${escapeHtml(title)}" aria-label="Open ${escapeHtml(title)}">
                <img src="${escapeHtml(s.url)}" alt="" loading="lazy" decoding="async" />              </button>
              <figcaption>
                <span class="set-label" aria-hidden="true">${s.label.replace('Set ', '')}</span>
                <span class="key-set-name">${s.label}</span>
                <a href="${escapeHtml(s.url)}" download class="btn btn-ghost btn-sm btn-icon" aria-label="Download ${escapeHtml(title)}">${ICON('download', 15)}</a>
              </figcaption>
            </figure>`;
        })
        .join('');
      const rows = sets
        .filter((s) => !isImage(s.url))
        .map((s) => {
          const title = `${item.title}, ${s.label}`;
          const view = `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">View</a>`;
          return `
            <div class="answer-set-row">
              <span class="set-label"><span class="sr-only">Set </span>${s.label.replace('Set ', '')}</span>
              <span class="set-filename" title="${escapeHtml(s.name || '')}">${escapeHtml(s.name || fileKind(s.url))}</span>
              <span class="row-actions">
                ${view}
                <a href="${escapeHtml(s.url)}" download class="btn btn-secondary btn-sm btn-icon" aria-label="Download ${escapeHtml(title)}">${ICON('download', 14)}</a>
              </span>
            </div>`;
        })
        .join('');

      const fresh = isNewPost(item);
      return `
        <article class="announcement-card${fresh ? ' is-new' : ''}">
          <div class="card-meta">
            ${item.subject ? `<span class="meta-strong">${escapeHtml(item.subject)}</span>` : ''}
            ${item.test_date ? `<span>Exam ${escapeHtml(readableDate(item.test_date, item.posted_at))}</span>` : ''}
            ${timeTag(item.posted_at, 'Posted ')}
          </div>
          <h2 class="card-title">${escapeHtml(cleanTitle(item.title))}${fresh ? '<span class="tag tag-new">New</span>' : ''}</h2>
          ${item.description ? `<div class="card-body markdown-body">${renderMarkdown(item.description)}</div>` : ''}
          ${gallery ? `<div class="key-sets">${gallery}</div>` : ''}
          ${rows ? `<div class="answer-sets sheet">${rows}</div>` : ''}
        </article>`;
    })
    .join('')}</div>`;
}

function renderAnswerKeysArchive() {
  const container = document.getElementById('keysArchiveGrid');
  if (!container) return;
  setArchiveCount('keysArchiveGrid', state.answerKeysArchive.length);

  if (state.answerKeysArchive.length === 0) {
    container.innerHTML = emptyState(null, null, 'No archived answer keys yet.');
    return;
  }

  container.innerHTML = `
    <div class="sheet">
      ${state.answerKeysArchive.map((item) => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${escapeHtml(cleanTitle(item.title))}</span>
            <span class="row-meta">${[item.subject ? escapeHtml(item.subject) : '', item.test_date ? escapeHtml(readableDate(item.test_date, item.posted_at)) : formatDate(item.posted_at)].filter(Boolean).join(' · ')}</span>
          </div>
          <div class="set-links">
            ${keySets(item).map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="archive-set-link"${isImage(s.url) ? ` data-lightbox-src="${escapeHtml(s.url)}" data-lightbox-title="${escapeHtml(`${item.title}, ${s.label}`)}"` : ''} aria-label="Open ${escapeHtml(item.title)}, ${s.label}">${s.label.replace('Set ', '')}${ICON('arrowUpRight', 12)}</a>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Contacts ──
// "9876543210" -> "+91 98765 43210"
function formatPhone(digits) {
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function announce(message, type = 'success') {
  toast(message, type);
}

// Two letters for the avatar tile: the first letters of the first two words ("Exam cell" -> "EC").
function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  return words.slice(0, 2).map((w) => w.match(/[A-Za-z0-9]/)[0].toUpperCase()).join('');
}

function contactCard(c) {
  const display = formatPhone(c.phone);
  return `
    <li class="contact-card">
      <span class="contact-avatar" aria-hidden="true">${escapeHtml(initials(c.name))}</span>
      <div class="contact-info">
        <span class="contact-name">${escapeHtml(c.name)}${c.note ? ` <span class="contact-note">${escapeHtml(c.note)}</span>` : ''}</span>
        <span class="contact-phone" data-phone-text>${escapeHtml(display)}</span>
      </div>
      <div class="contact-actions">
        <a class="contact-action" href="https://wa.me/91${escapeHtml(c.phone)}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ${escapeHtml(c.name)}">${ICON('whatsapp', 16)}<span>WhatsApp</span></a>
        <button type="button" class="contact-action" data-copy="${escapeHtml(display)}" aria-label="Copy ${escapeHtml(c.name)}'s number">${ICON('copy', 16)}<span>Copy</span></button>
      </div>
    </li>`;
}

function renderContacts(contacts) {
  const container = document.getElementById('contactsList');
  if (!container) return;
  if (contacts.length === 0) {
    container.innerHTML = emptyState('phone', 'No contacts yet', 'Numbers will be listed here once they are added.');
    return;
  }
  const general = contacts.filter((c) => c.group !== 'transport');
  const transport = contacts.filter((c) => c.group === 'transport');
  container.innerHTML = `
    ${general.length ? `<ul class="contact-group">${general.map(contactCard).join('')}</ul>` : ''}
    ${transport.length ? `<h2 class="contact-group-title">Transport</h2><ul class="contact-group">${transport.map(contactCard).join('')}</ul>` : ''}`;
}

async function copyNumber(button) {
  const text = button.dataset.copy;
  const label = button.querySelector('span');
  const glyph = button.querySelector('svg');
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add('is-copied');
    if (label) label.textContent = 'Copied';
    if (glyph) glyph.outerHTML = ICON('check', 16);
    announce(`Copied ${text}`);
    window.setTimeout(() => {
      button.classList.remove('is-copied');
      if (label) label.textContent = 'Copy';
      const current = button.querySelector('svg');
      if (current) current.outerHTML = ICON('copy', 16);
    }, 1600);
  } catch {
    // No clipboard access (older browser, insecure context, or denied): select the number instead.
    const phoneEl = button.closest('.contact-card').querySelector('[data-phone-text]');
    const range = document.createRange();
    range.selectNodeContents(phoneEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    announce('Press and hold to copy the selected number.', 'error');
  }
}

async function loadContactsPage() {
  const container = document.getElementById('contactsList');
  try {
    const data = await getJson('/api/contacts');
    renderContacts(data.contacts || []);
    animateCards(container);
  } catch (err) {
    container.innerHTML = errorState('Could not load contacts. Check your connection and reload the page.');
  }
  container.addEventListener('click', (e) => {
    const button = e.target.closest('[data-copy]');
    if (button) copyNumber(button);
  });
}

// ── This week: the rail ──
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_MS = 86400000;

// Exam dates are free text ("Oct 20 – Oct 25, 2026", "14–19 Dec 2026", "Mar 24, 2026").
// Returns { start, end } as local dates, or null when the text doesn't say a date clearly.
// A countdown is only shown for text that parses; otherwise the words are shown as written.
function parseDateRange(text, today = new Date()) {
  // Day-first numeric dates come first: "30/11/26", "28-09-2026", "16.11.2026" (one or two of them).
  const numeric = [...String(text || '').matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)]
    .map(([, d, m, y]) => {
      const dt = new Date(y.length === 2 ? 2000 + Number(y) : Number(y), Number(m) - 1, Number(d));
      // Rejects impossible dates (31/02 would roll over into March).
      return dt.getDate() === Number(d) && dt.getMonth() === Number(m) - 1 ? dt : null;
    })
    .filter(Boolean);
  if (numeric.length) {
    const rest = String(text).replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](\d{4}|\d{2})\b/g, ' ');
    // A partial numeric date beside a full one ("30/11 - 04/12/2026") can't be read safely:
    // show the text as typed rather than a wrong start day.
    if (/\b\d{1,2}[/-]\d{1,2}\b/.test(rest)) return null;
    let start = numeric[0];
    let end = numeric.reduce((max, d) => (d > max ? d : max), start);
    // A month-name date beside it ("30/11/26 to 4 Dec") widens the range; the same date written
    // twice ("30/11/26 (November 30th)") changes nothing.
    const named = parseDateRange(rest, start);
    if (named) {
      if (named.start < start) start = named.start;
      if (named.end > end) end = named.end;
    }
    return { start, end };
  }
  const tokens = String(text || '').match(/[A-Za-z]{3,}|\d{1,4}/g) || [];
  const months = [];
  const days = [];
  let year = null;
  tokens.forEach((tok, i) => {
    const m = MONTHS.indexOf(tok.slice(0, 3).toLowerCase());
    if (m !== -1 && /^[A-Za-z]+$/.test(tok)) months.push({ m, i });
    else if (/^\d{4}$/.test(tok)) year = year ?? Number(tok);
    else if (/^\d{1,2}$/.test(tok) && Number(tok) >= 1 && Number(tok) <= 31) days.push({ d: Number(tok), i });
  });
  if (!months.length || !days.length) return null;
  // "Oct 20" writes the month first, "20 Oct" after; ties go to the side the text uses.
  const monthFirst = months[0].i < days[0].i;
  const monthOf = (dayIndex) => {
    let best = null;
    for (const mo of months) {
      const dist = Math.abs(mo.i - dayIndex);
      const preferred = monthFirst ? mo.i < dayIndex : mo.i > dayIndex;
      if (!best || dist < best.dist || (dist === best.dist && preferred)) best = { m: mo.m, dist };
    }
    return best.m;
  };
  const first = days[0];
  const last = days[days.length - 1];
  const y = year ?? today.getFullYear();
  const start = new Date(y, monthOf(first.i), first.d);
  let end = new Date(y, monthOf(last.i), last.d);
  if (end < start) end = new Date(y + 1, end.getMonth(), end.getDate());
  // No year written and the dates sit well in the past: they mean next year.
  if (year === null && end.getTime() < today.getTime() - 180 * DAY_MS) {
    start.setFullYear(y + 1);
    end.setFullYear(end.getFullYear() + 1);
  }
  return { start, end };
}

function daysBetween(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / DAY_MS);
}

// What the phase test means today: upcoming (a countdown), under way, or nothing to show.
function phaseState(phase, today = new Date()) {
  if (!phase) return null;
  const range = parseDateRange(phase.exam_date, today);
  if (!range) return phase.exam_date ? { kind: 'text', phase } : null;
  const toStart = daysBetween(today, range.start);
  const toEnd = daysBetween(today, range.end);
  if (toStart > 0) return { kind: 'upcoming', phase, range, days: toStart };
  if (toEnd >= 0) return { kind: 'underway', phase, range, day: 1 - toStart, total: daysBetween(range.start, range.end) + 1 };
  return null; // over: it is history, not this week
}

// "Mon, 30 Nov"; a range in one month reads "20–25 Oct", across months "30 Nov – 2 Dec".
const DAY_FMT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const DM_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
function formatDay(d) {
  return DAY_FMT.format(d).replace(/^(\w+) /, '$1, ');
}
function formatRange({ start, end }) {
  if (daysBetween(start, end) === 0) return formatDay(start);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${DM_FMT.format(end)}`;
  return `${DM_FMT.format(start)} – ${DM_FMT.format(end)}`;
}

// A typed date shown readably when it parses ("16-11-2026" -> "Mon, 16 Nov"), as typed otherwise.
function readableDate(text, postedAt) {
  // Past dates are read against the day they were posted, so a typed "28 Dec" without a year
  // gets the right year (and weekday) long after it was posted.
  const ref = postedAt ? new Date(toTime(postedAt) || Date.now()) : new Date();
  const range = parseDateRange(text, ref);
  return range ? formatRange(range) : text;
}

// The week grid: Monday-first weeks from this week to the exam's week. Today is ringed blue, the
// days between are counted out, exam days carry the highlighter. Cells land in reading order and
// the exam cell is marked last. Past five weeks it is a calendar, not a glance, so it is left out.
function weekGrid(range, today = new Date()) {
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const t = day(today);
  const first = new Date(t);
  first.setDate(t.getDate() - ((t.getDay() + 6) % 7));
  const last = day(range.end);
  last.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
  const total = daysBetween(first, last) + 1;
  if (total > 35) return '';
  const cells = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    const fromToday = daysBetween(t, d);
    const inExam = daysBetween(range.start, d) >= 0 && daysBetween(d, range.end) >= 0;
    const cls = [
      inExam ? 'is-exam' : '',
      inExam && fromToday < 0 ? 'is-done' : '',
      fromToday === 0 ? 'is-today' : '',
      !inExam && fromToday < 0 ? 'is-past' : '',
      !inExam && fromToday > 0 && daysBetween(d, range.start) > 0 ? 'is-ahead' : '',
      !inExam && daysBetween(range.end, d) > 0 ? 'is-after' : '',
    ].filter(Boolean).join(' ');
    cells.push(`<span class="cal-day ${cls}" style="--cell-delay:${Math.min(i * 18, 420)}ms">${d.getDate()}</span>`);
  }
  const wipe = Math.min(total * 18, 420) + 120;
  const label = `Today is ${formatDay(t)}. ${range.start - range.end === 0 ? 'Exam' : 'Exams'} on ${formatRange(range)}.`;
  return `
    <div class="cal" role="img" aria-label="${escapeHtml(label)}" style="--wipe-delay:${wipe}ms">
      <div class="cal-head" aria-hidden="true"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
      <div class="cal-grid" aria-hidden="true">${cells.join('')}</div>
    </div>`;
}

// The countdown block shared by the rail and the phase test page.
function countdown(ps) {
  if (!ps || (ps.kind !== 'upcoming' && ps.kind !== 'underway')) return '';
  const number = ps.kind === 'upcoming' ? ps.days : ps.day;
  const unit = ps.kind === 'upcoming'
    ? (ps.days === 1 ? 'day to go' : 'days to go')
    : `of ${ps.total} ${ps.total === 1 ? 'day' : 'days'}`;
  return `
    <div class="countdown">
      <div class="rail-stat"><span class="rail-number">${number}</span><span class="rail-unit">${unit}</span></div>
      ${weekGrid(ps.range)}
    </div>`;
}

function phaseSection(ps, lead) {
  const p = ps.phase;
  const label = escapeHtml(p.phase_label || 'Phase test');
  let body;
  if (ps.kind === 'upcoming' || ps.kind === 'underway') {
    body = `
      <div class="rail-kicker">${label}</div>
      <div class="rail-sub">${ps.kind === 'upcoming' ? '' : 'Under way · '}${escapeHtml(formatRange(ps.range))}</div>
      ${countdown(ps)}`;
  } else {
    body = `
      <div class="rail-kicker">${label}</div>
      <div class="rail-title">${escapeHtml(p.exam_date)}</div>
      <div class="rail-meta">${escapeHtml(cleanTitle(p.title))}</div>`;
  }
  return `<a class="rail-section${lead ? ' is-lead' : ''}" href="/phase-test" aria-label="Phase test: ${escapeHtml(cleanTitle(p.title))}, ${escapeHtml(p.exam_date || '')}">${body}</a>`;
}

function syllabusSection(s, lead) {
  return `
    <div class="rail-section${lead ? ' is-lead' : ''}">
      <div class="rail-kicker">This week’s syllabus</div>
      <a class="rail-title" href="/syllabus">${escapeHtml(s.week_label)}</a>
      <button type="button" class="rail-thumb" data-lightbox-src="${escapeHtml(s.image_url)}" data-lightbox-title="${escapeHtml(s.week_label)}" aria-label="Open the syllabus: ${escapeHtml(s.week_label)}">
        <img src="${escapeHtml(s.image_url)}" alt="" loading="lazy" decoding="async" />
      </button>
    </div>`;
}

// A pointer to the Answer keys page, not a second way to open files: the sets live there.
function keySection(k, lead) {
  const meta = [k.subject ? escapeHtml(k.subject) : '', formatDate(k.posted_at)].filter(Boolean).join(' · ');
  return `
    <a class="rail-section${lead ? ' is-lead' : ''}" href="/answer-keys">
      <div class="rail-kicker">Latest answer key</div>
      <div class="rail-title">${escapeHtml(cleanTitle(k.title))}</div>
      <div class="rail-meta">${meta}</div>
    </a>`;
}

function renderRail(week) {
  const rail = document.getElementById('weekRail');
  if (!rail) return;
  const here = seen.section;
  const ps = here === 'phase' ? null : phaseState(week.phase);
  const syllabus = here === 'syllabus' ? null : week.syllabus;
  const key = here === 'keys' ? null : week.keys[0];

  // The lead is whatever is most true this week: a test coming up beats the syllabus, which
  // beats the latest key. Order after the lead stays fixed so the rail doesn't reshuffle.
  const live = ps && (ps.kind === 'upcoming' || ps.kind === 'underway');
  const lead = live ? 'phase' : syllabus ? 'syllabus' : key ? 'keys' : ps ? 'phase' : null;
  if (!lead) {
    rail.hidden = true;
    return;
  }
  const parts = {
    phase: ps ? (l) => phaseSection(ps, l) : null,
    syllabus: syllabus ? (l) => syllabusSection(syllabus, l) : null,
    keys: key ? (l) => keySection(key, l) : null,
  };
  const order = [lead, ...['phase', 'syllabus', 'keys'].filter((k) => k !== lead)];
  const html = order.filter((k) => parts[k]).map((k) => parts[k](k === lead)).join('');
  rail.innerHTML = `<div class="rail-sheet"><p class="rail-label">This week</p>${html}</div>`;
  rail.hidden = false;
  // Sections rise in once, in reading order, 100ms apart.
  if (!reducedMotion.matches) {
    rail.querySelectorAll('.rail-section').forEach((el, i) => {
      el.style.setProperty('--enter-delay', `${i * 100}ms`);
      el.classList.add('card-enter');
      el.addEventListener('animationend', () => el.classList.remove('card-enter'), { once: true });
    });
  }
}

// A dot on a nav link whose section has something newer than your last visit there.
function markNav(section, latestIso) {
  if (!latestIso || section === seen.section) return;
  const latest = toTime(latestIso);
  const baseline = baselineFor(section);
  if (!latest || !baseline || latest <= baseline) return;
  const link = document.querySelector(`.nav-link[data-section="${section}"]`);
  if (!link || link.querySelector('.nav-dot')) return;
  link.insertAdjacentHTML('beforeend', '<span class="nav-dot" aria-hidden="true"></span><span class="sr-only"> (new)</span>');
}

const newest = (items) => items.reduce((max, it) => ((toTime(it.posted_at) || 0) > (toTime(max) || 0) ? it.posted_at : max), null);

async function loadWeek() {
  if (!document.getElementById('weekRail')) return;
  // This page's own section is left out of the rail, so its data isn't fetched twice.
  const skipOn = (section, url) => (seen.section === section ? Promise.resolve({}) : getJson(url).catch(() => ({})));
  const [syl, phase, keys, posts] = await Promise.all([
    skipOn('syllabus', '/api/syllabus/current'),
    skipOn('phase', '/api/phase-tests/current'),
    skipOn('keys', '/api/answer-keys'),
    skipOn('announcements', '/api/announcements?limit=20'),
  ]);
  const week = { syllabus: syl.syllabus || null, phase: phase.phaseTest || null, keys: keys.answerKeys || [] };
  renderRail(week);
  markNav('syllabus', week.syllabus && week.syllabus.posted_at);
  markNav('phase', week.phase && week.phase.posted_at);
  markNav('keys', newest(week.keys));
  markNav('announcements', newest(posts.announcements || []));
}

// Archive sections open with a height + fade transition; collapsed content leaves the tab order.
function setupArchiveToggle(toggleId, arrowId, stateKey) {
  const toggle = document.getElementById(toggleId);
  const region = toggle && toggle.parentElement.querySelector('.archive-collapse');
  const arrow = document.getElementById(arrowId);
  if (!toggle || !region) return;
  toggle.addEventListener('click', () => {
    state[stateKey] = !state[stateKey];
    const open = state[stateKey];
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    region.classList.toggle('is-open', open);
    region.inert = !open;
    if (arrow) arrow.classList.toggle('open', open);
  });
}

function debounceInput(input, onValue, delay = 250) {
  if (!input) return;
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => onValue(input.value.trim()), delay);
  });
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  loadWeek();

  // Lightbox
  const modalCloseBtn = document.getElementById('lightboxCloseBtn');
  const modalOverlay = document.getElementById('lightboxModal');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeLightbox);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay || e.target.classList.contains('modal-content')) closeLightbox();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  if (document.getElementById('announcementsList')) {
    loadCategories();
    loadAnnouncements();
    const pills = document.getElementById('categoryPills');
    pills?.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-pill');
      if (!btn || btn.dataset.cat === state.selectedCategory) return;
      selectCategory(pills, btn.dataset.cat);
      loadAnnouncements();
    });
    if (pills && 'ResizeObserver' in window) {
      new ResizeObserver(() => placeHighlight(pills, { instant: true })).observe(pills);
    }
    debounceInput(document.getElementById('searchInput'), (value) => {
      if (value === state.searchQuery) return;
      state.searchQuery = value;
      loadAnnouncements();
    });
  }

  if (document.getElementById('currentSyllabusBox')) {
    loadSyllabusPage();
    setupArchiveToggle('archiveToggle', 'archiveArrow', 'archiveOpen');
  }

  if (document.getElementById('currentPhaseTestBox')) {
    loadPhaseTestsPage();
    setupArchiveToggle('phaseArchiveToggle', 'phaseArchiveArrow', 'phaseArchiveOpen');
  }

  if (document.getElementById('answerKeysList')) {
    loadAnswerKeysPage();
    debounceInput(document.getElementById('answerKeySearchInput'), (value) => {
      if (value === state.answerKeySearchQuery) return;
      state.answerKeySearchQuery = value;
      loadAnswerKeys();
    });
    setupArchiveToggle('keysArchiveToggle', 'keysArchiveArrow', 'keysArchiveOpen');
  }

  if (document.getElementById('contactsList')) loadContactsPage();
});
