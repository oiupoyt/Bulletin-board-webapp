/**
 * Shared helpers for every page: escaping, dates, icons and the toast.
 * Loaded after icons.js and before the page controller.
 */
(function () {
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name, size = 16, opts) {
    return window.AppIcons ? window.AppIcons.icon(name, size, opts) : '';
  }

  function toDate(iso) {
    if (!iso) return null;
    // The server stores "2026-03-12 10:30:00" in its own local time (datetime('now', 'localtime')),
    // with no zone. Read it as local time, as the original UI did; the campus and the server share
    // one timezone. ISO strings with a zone (seed data) are read as written.
    const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(iso) ? iso.replace(' ', 'T') : iso;
    const d = new Date(normalised);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // "12 Mar" this year, "12 Mar 2025" otherwise. The full stamp goes in the title attribute.
  function formatDate(iso) {
    const d = toDate(iso);
    if (!d) return '';
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    });
  }

  function formatDateTime(iso) {
    const d = toDate(iso);
    if (!d) return '';
    return d.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatWeekday(iso) {
    const d = toDate(iso);
    return d ? d.toLocaleDateString(undefined, { weekday: 'long' }) : '';
  }

  // Titles are set in type, not pictures: drop emoji an author typed into a title.
  const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  function cleanTitle(title) {
    return String(title || '').replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
  }

  function timeTag(iso, prefix = '') {
    const d = toDate(iso);
    if (!d) return '';
    return `<time datetime="${escapeHtml(d.toISOString())}" title="${escapeHtml(formatDateTime(iso))}">${escapeHtml(prefix)}${escapeHtml(formatDate(iso))}</time>`;
  }

  // SVG counts: shown through <img>, an SVG cannot run script, so inline display is safe.
  function isImage(url) {
    return Boolean(url) && /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(url);
  }

  function fileKind(url) {
    const m = /\.([a-z0-9]+)(\?.*)?$/i.exec(url || '');
    if (!m) return 'File';
    const ext = m[1].toLowerCase();
    if (ext === 'pdf') return 'PDF';
    if (ext === 'doc' || ext === 'docx') return 'Word document';
    if (ext === 'xls' || ext === 'xlsx') return 'Spreadsheet';
    if (ext === 'txt') return 'Text file';
    return ext.toUpperCase();
  }

  // One toast region per page; at most three on screen.
  function toast(message, type = 'success') {
    let region = document.getElementById('toastRegion');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toastRegion';
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const el = document.createElement('div');
    el.className = `app-toast ${type === 'error' ? 'error' : 'success'}`;
    el.innerHTML = icon(type === 'error' ? 'close' : 'check', 16, { fill: false });
    const text = document.createElement('span');
    text.textContent = message;
    el.appendChild(text);
    region.appendChild(el);
    while (region.children.length > 3) region.removeChild(region.firstElementChild);
    // Leave the way it came: fade and drop a few pixels, then unmount (fallback if no transition runs).
    window.setTimeout(() => {
      el.classList.add('is-leaving');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
      window.setTimeout(() => el.remove(), 220);
    }, 3600);
  }

  async function readJson(res) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  function toTime(iso) {
    const d = toDate(iso);
    return d ? d.getTime() : null;
  }

  window.UI = { escapeHtml, icon, formatDate, formatDateTime, formatWeekday, cleanTitle, timeTag, toTime, isImage, fileKind, toast, readJson };
})();
