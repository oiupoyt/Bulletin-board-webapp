/**
 * Student Public Frontend Controller
 */

// State
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

// Utilities
const ICON = (name, size = 16) => window.AppIcons ? window.AppIcons.icon(name, size) : '';
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      const parsed = window.marked.parse(rawText, { gfm: true, breaks: true });
      return sanitizeHtml(parsed);
    } catch (e) {
      console.warn('Markdown parsing error:', e);
    }
  }
  return escapeHtml(rawText);
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isImageAttachment(url) {
  if (!url) return false;
  return /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
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

// ── Lightbox Modal ──
function openLightbox(imgSrc, title = 'Attachment') {
  const modal = document.getElementById('lightboxModal');
  const modalImg = document.getElementById('lightboxImg');
  if (!modal || !modalImg) return;
  modalImg.src = imgSrc;
  modalImg.alt = title;
  modal.classList.remove('hidden');
  // Flush styles so the transition starts from the hidden state, without waiting for a frame.
  void modal.offsetWidth;
  modal.classList.add('is-open');
}

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.remove('is-open');
  let done = false;
  const finish = () => {
    if (done || modal.classList.contains('is-open')) return;
    done = true;
    modal.classList.add('hidden');
  };
  modal.addEventListener('transitionend', finish, { once: true });
  window.setTimeout(finish, 260); // reduced motion or no transition: still close
}

// Lightbox click delegation for safe attribute handling
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-lightbox-src]');
  if (trigger) {
    const src = trigger.getAttribute('data-lightbox-src');
    const title = trigger.getAttribute('data-lightbox-title') || 'Attachment';
    openLightbox(src, title);
  }
});

// ── Feed Fetching & Rendering ──
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    state.categories = data.categories || [];
    renderCategoryPills();
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function renderCategoryPills() {
  const container = document.getElementById('categoryPills');
  if (!container) return;

  const allCategories = [{ name: 'All' }, ...state.categories];
  container.innerHTML = allCategories
    .map(
      (cat) => `
    <button class="cat-pill ${state.selectedCategory === cat.name ? 'active' : ''}" data-cat="${escapeHtml(cat.name)}">
      ${escapeHtml(cat.name)}
    </button>
  `
    )
    .join('');

  container.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.cat;
      renderCategoryPills();
      loadAnnouncements();
    });
  });
}

async function loadAnnouncements() {
  const container = document.getElementById('announcementsList');
  if (!container) return;

  const requestId = nextRequestId('announcements');
  if (hasCards(container)) {
    setBusy(container, true);
  } else {
    container.innerHTML = '<div class="empty-state">Loading announcements...</div>';
  }

  try {
    const params = new URLSearchParams();
    if (state.selectedCategory && state.selectedCategory !== 'All') {
      params.append('category', state.selectedCategory);
    }
    if (state.searchQuery) {
      params.append('search', state.searchQuery);
    }

    const res = await fetch(`/api/announcements?${params.toString()}`);
    const data = await res.json();
    if (requestId !== fetchIds.announcements) return; // a newer filter/search already won
    state.announcements = data.announcements || [];
    renderAnnouncements();
    animateCards(container);
  } catch (err) {
    if (requestId !== fetchIds.announcements) return;
    container.innerHTML = `<div class="empty-state">Failed to load announcements: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (requestId === fetchIds.announcements) setBusy(container, false);
  }
}

function getCategoryEmbedClass(category) {
  const cat = (category || '').trim().toLowerCase();
  if (cat.includes('holiday')) return 'cat-holiday';
  if (cat.includes('exam') || cat.includes('test')) return 'cat-exam';
  if (cat.includes('academic') || cat.includes('syllabus')) return 'cat-academic';
  return 'cat-general';
}

function renderAnnouncements() {
  const container = document.getElementById('announcementsList');
  if (!container) return;

  if (state.announcements.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICON('megaphone', 38)}</div>
        <p>No announcements found matching the criteria.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.announcements
    .map((item) => {
      const isPinned = Boolean(item.pinned);
      const catClass = getCategoryEmbedClass(item.category);
      const isImg = isImageAttachment(item.attachment_url);

      let attachmentHtml = '';
      if (item.attachment_url) {
        if (isImg) {
          attachmentHtml = `
            <div class="attachment-img-preview" data-lightbox-src="${escapeHtml(item.attachment_url)}" data-lightbox-title="${escapeHtml(item.title)}">
              <img src="${escapeHtml(item.attachment_url)}" alt="${escapeHtml(item.attachment_name || 'Attachment')}" loading="lazy" />
            </div>
          `;
        } else {
          attachmentHtml = `
            <div class="attachment-box">
              <div class="attachment-info">
                <span>${ICON('paperclip', 26)}</span>
                <span>${escapeHtml(item.attachment_name || 'Attached File')}</span>
              </div>
              <a href="${escapeHtml(item.attachment_url)}" download class="btn btn-secondary btn-sm" target="_blank">Download</a>
            </div>
          `;
        }
      }

      return `
        <article class="announcement-card embed-card ${catClass} ${isPinned ? 'is-pinned' : ''}">
          <div class="card-top">
            <div class="badge-group">
              ${isPinned ? `<span class="badge-pinned"><span class="badge-pinned-icon">${ICON('pin', 13)}</span> Pinned</span>` : ''}
              <span class="badge-category ${catClass}">${escapeHtml(item.category)}</span>
            </div>
            <time class="card-date">${formatDate(item.posted_at)}</time>
          </div>

          <h2 class="card-title">${escapeHtml(item.title)}</h2>
          <div class="card-body markdown-body">${renderMarkdown(item.body)}</div>

          ${attachmentHtml}

          <div class="card-footer">
            <span class="card-author">Issued by ${escapeHtml(item.author || 'Administration')}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

// ── Weekly Syllabus Controller ──
async function loadSyllabusPage() {
  const currentBox = document.getElementById('currentSyllabusBox');
  if (!currentBox) return;

  currentBox.innerHTML = '<div class="empty-state">Loading weekly syllabus...</div>';

  try {
    const [currentRes, archiveRes] = await Promise.all([
      fetch('/api/syllabus/current'),
      fetch('/api/syllabus/archive'),
    ]);

    const currentData = await currentRes.json();
    const archiveData = await archiveRes.json();

    state.currentSyllabus = currentData.syllabus;
    state.syllabusArchive = archiveData.archive || [];

    renderCurrentSyllabus();
    renderSyllabusArchive();
  } catch (err) {
    currentBox.innerHTML = `<div class="empty-state">Failed to load syllabus: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCurrentSyllabus() {
  const box = document.getElementById('currentSyllabusBox');
  if (!box) return;

  const current = state.currentSyllabus;
  if (!current) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICON('calendar', 38)}</div>
        <h3>No active syllabus uploaded for this week.</h3>
        <p>Check back shortly or view past syllabus weeks in the archive below.</p>
      </div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="syllabus-current-card">
      <div class="card-top">
        <span class="badge-urgent" style="background: rgba(16, 185, 129, 0.12); color: #34d399; border-color: rgba(16, 185, 129, 0.4);">
          <span class="badge-urgent-dot" style="background: #10b981; box-shadow: 0 0 6px #10b981;"></span> Current Active Week
        </span>
        <time class="card-date">Uploaded: ${formatDate(current.posted_at)}</time>
      </div>

      <h2 style="font-size: 1.3rem; margin: 0.6rem 0 0.3rem;">${escapeHtml(current.week_label)}</h2>
      <p style="color: var(--text-muted); font-size: 0.85rem;">Click the image to expand to full size or download.</p>

      <div class="syllabus-hero-wrapper" data-lightbox-src="${escapeHtml(current.image_url)}" data-lightbox-title="${escapeHtml(current.week_label)}">
        <img class="syllabus-hero-img" src="${escapeHtml(current.image_url)}" alt="${escapeHtml(current.week_label)}" />
      </div>

      <div class="syllabus-actions">
        <a href="${escapeHtml(current.image_url)}" target="_blank" class="btn-open">
          <span>${ICON('externalLink', 15)} Open Full Resolution</span>
        </a>
        <a href="${escapeHtml(current.image_url)}" download class="btn-open">
          <span>${ICON('download', 15)} Download Image</span>
        </a>
      </div>
    </div>
  `;
}

function renderSyllabusArchive() {
  const container = document.getElementById('archiveGrid');
  if (!container) return;

  if (state.syllabusArchive.length === 0) {
    container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">No past syllabus archive records available.</div>';
    return;
  }

  container.innerHTML = state.syllabusArchive
    .map(
      (item) => `
      <div class="archive-item">
        <div class="archive-thumb" data-lightbox-src="${escapeHtml(item.image_url)}" data-lightbox-title="${escapeHtml(item.week_label)}">
          <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.week_label)}" loading="lazy" />
        </div>
        <div class="archive-body">
          <div class="archive-title">${escapeHtml(item.week_label)}</div>
          <div class="archive-meta">${formatDate(item.posted_at)}</div>
          <div style="margin-top: 0.5rem; display: flex; gap: 0.4rem;">
            <a href="${escapeHtml(item.image_url)}" target="_blank" class="btn btn-secondary btn-sm" style="flex: 1;">View</a>
            <a href="${escapeHtml(item.image_url)}" download class="btn btn-secondary btn-sm" aria-label="Download image">${ICON('download', 16)}</a>
          </div>
        </div>
      </div>
    `
    )
    .join('');
}

// ── Phase Test Controller (Major Exams Every 2-3 Months) ──
async function loadPhaseTestsPage() {
  const currentBox = document.getElementById('currentPhaseTestBox');
  if (!currentBox) return;

  currentBox.innerHTML = '<div class="empty-state">Loading phase test details...</div>';

  try {
    const [currentRes, archiveRes] = await Promise.all([
      fetch('/api/phase-tests/current'),
      fetch('/api/phase-tests/archive'),
    ]);
    const currentData = await currentRes.json();
    const archiveData = await archiveRes.json();

    state.currentPhaseTest = currentData.phaseTest || null;
    state.phaseTestsArchive = archiveData.archive || [];

    renderCurrentPhaseTest();
    renderPhaseTestsArchive();
  } catch (err) {
    currentBox.innerHTML = `<div class="empty-state">Failed to load phase test data: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCurrentPhaseTest() {
  const box = document.getElementById('currentPhaseTestBox');
  if (!box) return;

  const current = state.currentPhaseTest;
  if (!current) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICON('target', 38)}</div>
        <h3>No upcoming Phase Test announced yet.</h3>
        <p>Phase Tests occur every 2–3 months. When scheduled, full syllabi, timetables, and schedules will appear here.</p>
      </div>
    `;
    return;
  }

  const isImg = isImageAttachment(current.attachment_url);

  let attachmentHtml = '';
  if (current.attachment_url) {
    if (isImg) {
      attachmentHtml = `
        <div class="syllabus-hero-wrapper" data-lightbox-src="${escapeHtml(current.attachment_url)}" data-lightbox-title="${escapeHtml(current.title)}">
          <img class="syllabus-hero-img" src="${escapeHtml(current.attachment_url)}" alt="${escapeHtml(current.title)}" />
        </div>
        <div class="syllabus-actions">
          <a href="${escapeHtml(current.attachment_url)}" target="_blank" class="btn-open">${ICON('externalLink', 15)} Full Resolution</a>
          <a href="${escapeHtml(current.attachment_url)}" download class="btn-open">${ICON('download', 15)} Download Sheet</a>
        </div>
      `;
    } else {
      attachmentHtml = `
        <div class="attachment-box" style="margin-top: 1rem;">
          <div class="attachment-info">
            <span>${ICON('doc', 30)}</span>
            <span>${escapeHtml(current.attachment_name || 'Phase Test Timetable / Syllabus PDF')}</span>
          </div>
          <a href="${escapeHtml(current.attachment_url)}" download class="btn btn-secondary btn-sm" target="_blank">Download PDF</a>
        </div>
      `;
    }
  }

  box.innerHTML = `
    <div class="phase-test-card hero-card">
      <div class="card-top">
        <span class="badge-urgent">
          <span class="badge-urgent-dot"></span> ${escapeHtml(current.phase_label)}
        </span>
        ${current.exam_date ? `<span class="badge-category" style="background: rgba(245, 158, 11, 0.15); border-color: rgba(245, 158, 11, 0.4); color: #fbbf24;">${ICON('calendar', 13)} Exam: ${escapeHtml(current.exam_date)}</span>` : ''}
        <time class="card-date">Posted: ${formatDate(current.posted_at)}</time>
      </div>

      <h2 style="font-size: 1.4rem; margin: 0.6rem 0 0.5rem; color: #ffffff;">${escapeHtml(current.title)}</h2>
      
      ${current.description ? `<div class="card-body" style="margin-bottom: 0.8rem;">${escapeHtml(current.description)}</div>` : ''}

      ${attachmentHtml}
    </div>
  `;
}

function renderPhaseTestsArchive() {
  const container = document.getElementById('phaseArchiveGrid');
  if (!container) return;

  if (state.phaseTestsArchive.length === 0) {
    container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">No past Phase Test records archived.</div>';
    return;
  }

  container.innerHTML = state.phaseTestsArchive
    .map((item) => {
      const isImg = isImageAttachment(item.attachment_url);
      let thumbHtml = '';
      if (item.attachment_url && isImg) {
        thumbHtml = `
          <div class="archive-thumb" data-lightbox-src="${escapeHtml(item.attachment_url)}" data-lightbox-title="${escapeHtml(item.title)}">
            <img src="${escapeHtml(item.attachment_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />
          </div>
        `;
      }

      return `
        <div class="archive-item">
          ${thumbHtml}
          <div class="archive-body">
            <span class="badge-urgent" style="font-size: 0.68rem; margin-bottom: 0.35rem; display: inline-flex;">${escapeHtml(item.phase_label)}</span>
            <div class="archive-title">${escapeHtml(item.title)}</div>
            ${item.exam_date ? `<div class="archive-meta" style="color: #fbbf24; margin-bottom: 0.25rem;">Exam Date: ${escapeHtml(item.exam_date)}</div>` : ''}
            <div class="archive-meta">Posted: ${formatDate(item.posted_at)}</div>
            ${item.attachment_url ? `
              <div style="margin-top: 0.6rem; display: flex; gap: 0.4rem;">
                <a href="${item.attachment_url}" target="_blank" class="btn btn-secondary btn-sm" style="flex: 1;">View</a>
                <a href="${item.attachment_url}" download class="btn btn-secondary btn-sm" aria-label="Download attachment">${ICON('download', 16)}</a>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    })
    .join('');
}

// ── Answer Keys Controller ──
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
    container.innerHTML = '<div class="empty-state">Loading answer keys...</div>';
  }

  try {
    const params = new URLSearchParams();
    if (state.answerKeySearchQuery) {
      params.append('search', state.answerKeySearchQuery);
    }
    const res = await fetch(`/api/answer-keys?${params.toString()}`);
    const data = await res.json();
    if (requestId !== fetchIds.answerKeys) return;
    state.answerKeys = data.answerKeys || [];
    renderAnswerKeys();
    animateCards(container);
  } catch (err) {
    if (requestId !== fetchIds.answerKeys) return;
    container.innerHTML = `<div class="empty-state">Failed to load answer keys: ${escapeHtml(err.message)}</div>`;
  } finally {
    if (requestId === fetchIds.answerKeys) setBusy(container, false);
  }
}

async function loadAnswerKeysArchive() {
  const container = document.getElementById('keysArchiveGrid');
  if (!container) return;

  try {
    const res = await fetch('/api/answer-keys/archive');
    const data = await res.json();
    state.answerKeysArchive = data.archive || [];
    renderAnswerKeysArchive();
  } catch (err) {
    console.error('Failed to load answer keys archive:', err);
  }
}

function renderAnswerKeys() {
  const container = document.getElementById('answerKeysList');
  if (!container) return;

  if (state.answerKeys.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICON('key', 38)}</div>
        <h3>No active answer keys published yet.</h3>
        <p>Answer keys for recent tests and examinations will appear here as soon as they are uploaded.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.answerKeys
    .map((item) => {
      const sets = [
        { label: 'Set A', url: item.set_a_url, name: item.set_a_name },
        { label: 'Set B', url: item.set_b_url, name: item.set_b_name },
        { label: 'Set C', url: item.set_c_url, name: item.set_c_name },
        { label: 'Set D', url: item.set_d_url, name: item.set_d_name },
      ].filter((s) => Boolean(s.url));

      const setsHtml = sets
        .map((s) => {
          const isImg = isImageAttachment(s.url);
          const viewBtn = isImg
            ? `<button type="button" class="btn btn-secondary btn-sm" data-lightbox-src="${escapeHtml(s.url)}" data-lightbox-title="${escapeHtml(item.title)} - ${s.label}">View</button>`
            : `<a href="${escapeHtml(s.url)}" target="_blank" class="btn btn-secondary btn-sm">View</a>`;

          return `
            <div class="answer-set-badge">
              <div class="answer-set-label">
                <span class="set-indicator-pill">${s.label}</span>
                <span class="set-filename" title="${escapeHtml(s.name || '')}">${escapeHtml(s.name || 'Answer Key Sheet')}</span>
              </div>
              <div class="answer-set-actions">
                ${viewBtn}
                <a href="${escapeHtml(s.url)}" download class="btn btn-secondary btn-sm" aria-label="Download ${escapeHtml(s.label)}" title="Download ${s.label}">${ICON('download', 16)}</a>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <article class="announcement-card embed-card cat-exam">
          <div class="card-top">
            <div class="badge-group">
              <span class="badge-category cat-exam">${ICON('key', 12)} Answer Key</span>
              ${item.subject ? `<span class="badge-category" style="background:rgba(59,130,246,0.12); color:#60a5fa; border-color:rgba(59,130,246,0.3);">${escapeHtml(item.subject)}</span>` : ''}
            </div>
            ${item.test_date ? `<time class="card-date">Exam: ${escapeHtml(item.test_date)}</time>` : `<time class="card-date">${formatDate(item.posted_at)}</time>`}
          </div>

          <h2 class="card-title">${escapeHtml(item.title)}</h2>
          ${item.description ? `<div class="card-body markdown-body" style="margin-bottom:0.9rem;">${renderMarkdown(item.description)}</div>` : ''}

          <div class="answer-sets-container">
            <div class="answer-sets-heading">Available Sets (${sets.length}):</div>
            <div class="answer-sets-grid">
              ${setsHtml}
            </div>
          </div>

          <div class="card-footer">
            <span class="card-author">Uploaded on ${formatDate(item.posted_at)}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderAnswerKeysArchive() {
  const container = document.getElementById('keysArchiveGrid');
  if (!container) return;

  if (state.answerKeysArchive.length === 0) {
    container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">No archived answer keys found.</div>';
    return;
  }

  container.innerHTML = state.answerKeysArchive
    .map((item) => {
      const sets = [
        { label: 'Set A', url: item.set_a_url },
        { label: 'Set B', url: item.set_b_url },
        { label: 'Set C', url: item.set_c_url },
        { label: 'Set D', url: item.set_d_url },
      ].filter((s) => Boolean(s.url));

      const setBadges = sets
        .map(
          (s) => `
          <a href="${escapeHtml(s.url)}" target="_blank" class="archive-set-link" title="${s.label}">
            <span>${s.label} ${ICON('externalLink', 14)}</span>
          </a>
        `
        )
        .join('');

      return `
        <div class="archive-item">
          <div class="archive-body">
            <span class="badge-category cat-exam" style="font-size:0.68rem; margin-bottom:0.35rem; display:inline-flex;">${ICON('key', 12)} Archived Key</span>
            <div class="archive-title">${escapeHtml(item.title)}</div>
            ${item.subject ? `<div class="archive-meta" style="color:#60a5fa; margin-bottom:0.25rem;">${escapeHtml(item.subject)}</div>` : ''}
            ${item.test_date ? `<div class="archive-meta" style="color:#fbbf24; margin-bottom:0.25rem;">Exam Date: ${escapeHtml(item.test_date)}</div>` : ''}
            <div class="archive-meta">Posted: ${formatDate(item.posted_at)}</div>
            
            <div style="margin-top:0.75rem; display:flex; flex-wrap:wrap; gap:0.4rem;">
              ${setBadges}
            </div>
          </div>
        </div>
      `;
    })
    .join('');
}

// ── Contacts Page ──
// "9876543210" -> "+91 98765 43210"
function formatPhone(digits) {
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function announce(message, type = 'success') {
  if (typeof window.showToast === 'function') return window.showToast(message, type);
  const region = document.getElementById('toastRegion');
  if (region) region.textContent = message;
}

function contactCard(c) {
  const display = formatPhone(c.phone);
  return `
    <li class="contact-card">
      <div class="contact-info">
        <span class="contact-name">${escapeHtml(c.name)}${c.note ? ` <span class="contact-note">${escapeHtml(c.note)}</span>` : ''}</span>
        <span class="contact-phone" data-phone-text>${escapeHtml(display)}</span>
      </div>
      <div class="contact-actions">
        <a class="contact-action" href="https://wa.me/91${escapeHtml(c.phone)}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ${escapeHtml(c.name)}">${ICON('whatsapp', 18)}<span>WhatsApp</span></a>
        <button type="button" class="contact-action" data-copy="${escapeHtml(display)}" aria-label="Copy ${escapeHtml(c.name)}'s number">${ICON('copy', 18)}<span>Copy</span></button>
      </div>
    </li>`;
}

function renderContacts(contacts) {
  const container = document.getElementById('contactsList');
  if (!container) return;
  if (contacts.length === 0) {
    container.innerHTML = '<div class="empty-state">No contacts have been added yet.</div>';
    return;
  }
  const general = contacts.filter((c) => c.group !== 'transport');
  const transport = contacts.filter((c) => c.group === 'transport');
  container.innerHTML = `
    ${general.length ? `<ul class="contact-group">${general.map(contactCard).join('')}</ul>` : ''}
    ${transport.length ? `<h2 class="contact-group-title">Transport</h2><ul class="contact-group">${transport.map(contactCard).join('')}</ul>` : ''}
  `;
}

async function copyNumber(button) {
  const text = button.dataset.copy;
  const label = button.querySelector('span');
  try {
    await navigator.clipboard.writeText(text);
    button.classList.add('is-copied');
    if (label) label.textContent = 'Copied';
    announce(`Copied ${text}`);
    window.setTimeout(() => {
      button.classList.remove('is-copied');
      if (label) label.textContent = 'Copy';
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
    const res = await fetch('/api/contacts');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderContacts(data.contacts || []);
    animateCards(container);
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Could not load contacts. Check your connection and reload the page.</div>';
  }
  container.addEventListener('click', (e) => {
    const button = e.target.closest('[data-copy]');
    if (button) copyNumber(button);
  });
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

// ── Event Listeners ──
document.addEventListener('DOMContentLoaded', () => {
  const isFeedPage = document.getElementById('announcementsList');
  const isSyllabusPage = document.getElementById('currentSyllabusBox');
  const isPhaseTestPage = document.getElementById('currentPhaseTestBox');
  const isAnswerKeysPage = document.getElementById('answerKeysList');
  const isContactsPage = document.getElementById('contactsList');

  if (isContactsPage) loadContactsPage();

  // Lightbox Modal Setup
  const modalCloseBtn = document.getElementById('lightboxCloseBtn');
  const modalOverlay = document.getElementById('lightboxModal');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeLightbox);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeLightbox();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  if (isFeedPage) {
    loadCategories();
    loadAnnouncements();

    const searchInput = document.getElementById('searchInput');
    let searchTimer = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.searchQuery = e.target.value.trim();
          loadAnnouncements();
        }, 300);
      });
    }
  }

  if (isSyllabusPage) {
    loadSyllabusPage();

    setupArchiveToggle('archiveToggle', 'archiveArrow', 'archiveOpen');
  }

  if (isPhaseTestPage) {
    loadPhaseTestsPage();

    setupArchiveToggle('phaseArchiveToggle', 'phaseArchiveArrow', 'phaseArchiveOpen');
  }

  if (isAnswerKeysPage) {
    loadAnswerKeysPage();

    const searchInput = document.getElementById('answerKeySearchInput');
    let searchTimer = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          state.answerKeySearchQuery = e.target.value.trim();
          loadAnswerKeys();
        }, 300);
      });
    }

    setupArchiveToggle('keysArchiveToggle', 'keysArchiveArrow', 'keysArchiveOpen');
  }
});
