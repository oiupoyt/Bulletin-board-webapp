/**
 * Admin panel: publish and manage announcements, syllabus, phase tests, answer keys,
 * contacts and categories. Row actions use data-action, never inline handlers, so the
 * CSP can forbid inline script.
 */
const { escapeHtml, icon: ICON, formatDate, isImage, readJson, cleanTitle } = window.UI;
const showToast = (message, type = 'success') => window.UI.toast(message, type);

const adminState = {
  categories: [],
  announcements: [],
  syllabusArchive: [],
  phaseTests: [],
  answerKeys: [],
  contacts: [],
  editingId: null,
  editingContactId: null,
};

// ── Helpers ──
async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await readJson(res);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Signed out');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function jsonBody(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function setCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = n ? String(n) : '';
}

function listEmpty(text) {
  return `<div class="empty-state"><p>${escapeHtml(text)}</p></div>`;
}

function listError(text) {
  return `<div class="empty-state is-error"><p>${escapeHtml(text)}</p></div>`;
}

function statusTag(archived) {
  return archived ? '<span class="tag">Archived</span>' : '<span class="tag tag-success">Active</span>';
}

function archiveButton(action, item) {
  return item.is_archived
    ? `<button type="button" class="btn btn-secondary btn-sm" data-action="${action}" data-id="${item.id}" data-value="0">Make active</button>`
    : `<button type="button" class="btn btn-secondary btn-sm" data-action="${action}" data-id="${item.id}" data-value="1">${ICON('archive', 14)}Archive</button>`;
}

function deleteButton(action, item, label) {
  return `<button type="button" class="btn btn-danger btn-sm btn-icon" data-action="${action}" data-id="${item.id}" aria-label="Delete ${escapeHtml(label)}" title="Delete">${ICON('trash', 14)}</button>`;
}

function meta(parts) {
  return parts.filter(Boolean).join(' · ');
}

async function withPending(button, pendingText, fn) {
  const idle = button.innerHTML;
  button.disabled = true;
  button.textContent = pendingText;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    if (button.textContent === pendingText) button.innerHTML = idle;
  }
}

// ── Auth guard ──
async function checkAuth() {
  try {
    const res = await fetch('/api/admin/check-auth');
    if (!res.ok) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  } catch {
    window.location.href = '/login.html';
    return false;
  }
}

// ── Categories ──
async function loadCategories() {
  try {
    const data = await api('/api/categories');
    adminState.categories = data.categories || [];
    renderCategoryDropdown();
    renderCategoryManager();
  } catch (err) {
    showToast('Could not load categories', 'error');
  }
}

function renderCategoryDropdown() {
  const select = document.getElementById('postCategory');
  if (!select) return;
  const current = select.value;
  select.innerHTML = adminState.categories
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');
  if (current) select.value = current;
}

function renderCategoryManager() {
  const list = document.getElementById('categoryList');
  if (!list) return;
  if (adminState.categories.length === 0) {
    list.innerHTML = '<p class="form-help" style="margin-top:16px">No categories yet.</p>';
    return;
  }
  list.innerHTML = `
    <div class="chip-list">
      ${adminState.categories.map((c) => `
        <span class="chip">
          ${escapeHtml(c.name)}
          <button type="button" class="chip-remove" data-action="deleteCategory" data-id="${c.id}" data-name="${escapeHtml(c.name)}" aria-label="Remove ${escapeHtml(c.name)}">${ICON('close', 12)}</button>
        </span>`).join('')}
    </div>`;
}

async function addCategory(name) {
  const clean = (name || '').trim();
  if (!clean) return;
  try {
    await api('/api/admin/categories', jsonBody('POST', { name: clean }));
    showToast(`Added ${clean}`);
    document.getElementById('newCategoryInput').value = '';
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCategory(id, name) {
  if (!confirm(`Remove the category "${name}"? Existing announcements keep their label.`)) return;
  try {
    await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
    showToast(`Removed ${name}`);
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Announcements ──
async function loadAnnouncements() {
  const list = document.getElementById('announcementsTableBody');
  if (!list) return;
  if (!adminState.announcements.length) list.innerHTML = listEmpty('Loading…');
  try {
    const data = await api('/api/announcements?limit=100');
    adminState.announcements = data.announcements || [];
    renderAnnouncementsTable();
  } catch (err) {
    list.innerHTML = listError(`Could not load announcements: ${err.message}`);
  }
}

function renderAnnouncementsTable() {
  const list = document.getElementById('announcementsTableBody');
  if (!list) return;
  setCount('announcementsCount', adminState.announcements.length);
  if (adminState.announcements.length === 0) {
    list.innerHTML = listEmpty('Nothing published yet.');
    return;
  }
  list.innerHTML = adminState.announcements
    .map((item) => `
      <div class="row">
        <div class="row-main">
          <span class="row-title-line">
            ${item.pinned ? `<span class="row-pin" title="Pinned">${ICON('pin', 12)}</span>` : ''}
            <span class="row-title">${escapeHtml(cleanTitle(item.title))}</span>
          </span>
          <span class="row-meta">${meta([escapeHtml(item.category), formatDate(item.posted_at), item.attachment_url ? escapeHtml(item.attachment_name || 'Attachment') : ''])}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-action="togglePinAnnouncement" data-id="${item.id}" data-value="${!item.pinned}">${item.pinned ? 'Unpin' : 'Pin'}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-action="editAnnouncement" data-id="${item.id}">Edit</button>
          ${deleteButton('deleteAnnouncement', item, item.title)}
        </div>
      </div>`)
    .join('');
}

function editAnnouncement(id) {
  const post = adminState.announcements.find((a) => a.id === id);
  if (!post) return;
  adminState.editingId = id;
  document.getElementById('announcementFormHeading').textContent = 'Edit announcement';
  document.getElementById('postTitle').value = post.title;
  document.getElementById('postBody').value = post.body;
  document.getElementById('postCategory').value = post.category;
  document.getElementById('postAuthor').value = post.author || '';
  document.getElementById('postPinned').checked = Boolean(post.pinned);
  document.getElementById('btnSubmitPost').textContent = 'Save changes';
  document.getElementById('btnCancelEdit').hidden = false;
  switchTab('tab-announcements');
  const form = document.getElementById('announcementForm');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('postTitle').focus({ preventScroll: true });
}

function cancelEdit() {
  adminState.editingId = null;
  document.getElementById('announcementForm').reset();
  document.getElementById('announcementFormHeading').textContent = 'New announcement';
  document.getElementById('btnSubmitPost').textContent = 'Publish';
  document.getElementById('btnCancelEdit').hidden = true;
}

async function deleteAnnouncement(id) {
  const post = adminState.announcements.find((a) => a.id === id);
  if (!confirm(`Delete "${post ? post.title : 'this announcement'}"? This cannot be undone.`)) return;
  try {
    await api(`/api/admin/announcements/${id}`, { method: 'DELETE' });
    showToast('Announcement deleted');
    if (adminState.editingId === id) cancelEdit();
    loadAnnouncements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function togglePinAnnouncement(id, newStatus) {
  try {
    await api(`/api/admin/announcements/${id}/pin`, jsonBody('PATCH', { pinned: newStatus }));
    showToast(newStatus ? 'Pinned to the top' : 'Unpinned');
    loadAnnouncements();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Weekly syllabus ──
async function loadAdminSyllabus() {
  const list = document.getElementById('adminSyllabusList');
  if (!list) return;
  try {
    const data = await api('/api/admin/syllabus');
    adminState.syllabusArchive = data.syllabusList || [];
    renderAdminSyllabus();
  } catch (err) {
    list.innerHTML = listError(`Could not load the syllabus history: ${err.message}`);
  }
}

function renderAdminSyllabus() {
  const list = document.getElementById('adminSyllabusList');
  if (!list) return;
  setCount('syllabusCount', adminState.syllabusArchive.length);
  if (adminState.syllabusArchive.length === 0) {
    list.innerHTML = listEmpty('No syllabus uploaded yet.');
    return;
  }
  list.innerHTML = adminState.syllabusArchive
    .map((item) => `
      <div class="row">
        <img class="row-thumb" src="${escapeHtml(item.image_url)}" alt="" loading="lazy" />
        <div class="row-main">
          <span class="row-title-line"><span class="row-title">${escapeHtml(item.week_label)}</span>${statusTag(item.is_archived)}</span>
          <span class="row-meta">${formatDate(item.posted_at)}</span>
        </div>
        <div class="row-actions">
          <a href="${escapeHtml(item.image_url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">View</a>
          ${archiveButton('toggleSyllabusArchive', item)}
          ${deleteButton('deleteSyllabus', item, item.week_label)}
        </div>
      </div>`)
    .join('');
}

async function toggleSyllabusArchive(id, targetArchived) {
  try {
    await api(`/api/admin/syllabus/${id}/archive`, jsonBody('PATCH', { is_archived: targetArchived }));
    showToast(targetArchived ? 'Moved to the archive' : 'Now the active week');
    loadAdminSyllabus();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSyllabus(id) {
  if (!confirm('Delete this syllabus upload? This cannot be undone.')) return;
  try {
    await api(`/api/admin/syllabus/${id}`, { method: 'DELETE' });
    showToast('Syllabus deleted');
    loadAdminSyllabus();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Phase tests ──
async function loadAdminPhaseTests() {
  const list = document.getElementById('adminPhaseTestList');
  if (!list) return;
  try {
    const data = await api('/api/admin/phase-tests');
    adminState.phaseTests = data.phaseTests || [];
    renderAdminPhaseTests();
  } catch (err) {
    list.innerHTML = listError(`Could not load phase tests: ${err.message}`);
  }
}

function renderAdminPhaseTests() {
  const list = document.getElementById('adminPhaseTestList');
  if (!list) return;
  setCount('phaseCount', adminState.phaseTests.length);
  if (adminState.phaseTests.length === 0) {
    list.innerHTML = listEmpty('No phase tests published yet.');
    return;
  }
  list.innerHTML = adminState.phaseTests
    .map((item) => `
      <div class="row">
        ${item.attachment_url && isImage(item.attachment_url) ? `<img class="row-thumb" src="${escapeHtml(item.attachment_url)}" alt="" loading="lazy" />` : ''}
        <div class="row-main">
          <span class="row-title-line"><span class="row-title">${escapeHtml(cleanTitle(item.title))}</span>${statusTag(item.is_archived)}</span>
          <span class="row-meta">${meta([escapeHtml(item.phase_label), item.exam_date ? escapeHtml(item.exam_date) : '', formatDate(item.posted_at)])}</span>
        </div>
        <div class="row-actions">
          ${item.attachment_url ? `<a href="${escapeHtml(item.attachment_url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">View</a>` : ''}
          ${archiveButton('togglePhaseTestArchive', item)}
          ${deleteButton('deletePhaseTest', item, item.title)}
        </div>
      </div>`)
    .join('');
}

async function togglePhaseTestArchive(id, targetArchived) {
  try {
    await api(`/api/admin/phase-tests/${id}/archive`, jsonBody('PATCH', { is_archived: targetArchived }));
    showToast(targetArchived ? 'Moved to the archive' : 'Now the active phase test');
    loadAdminPhaseTests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePhaseTest(id) {
  if (!confirm('Delete this phase test? This cannot be undone.')) return;
  try {
    await api(`/api/admin/phase-tests/${id}`, { method: 'DELETE' });
    showToast('Phase test deleted');
    loadAdminPhaseTests();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Answer keys ──
async function loadAdminAnswerKeys() {
  const list = document.getElementById('adminAnswerKeysList');
  if (!list) return;
  try {
    const data = await api('/api/admin/answer-keys');
    adminState.answerKeys = data.answerKeys || [];
    renderAdminAnswerKeys();
  } catch (err) {
    list.innerHTML = listError(`Could not load answer keys: ${err.message}`);
  }
}

function renderAdminAnswerKeys() {
  const list = document.getElementById('adminAnswerKeysList');
  if (!list) return;
  setCount('keysCount', adminState.answerKeys.length);
  if (adminState.answerKeys.length === 0) {
    list.innerHTML = listEmpty('No answer keys published yet.');
    return;
  }
  list.innerHTML = adminState.answerKeys
    .map((item) => {
      const sets = ['a', 'b', 'c', 'd']
        .map((k) => ({ label: k.toUpperCase(), url: item[`set_${k}_url`], name: item[`set_${k}_name`] }))
        .filter((s) => s.url);
      return `
        <div class="row">
          <div class="row-main">
            <span class="row-title-line"><span class="row-title">${escapeHtml(cleanTitle(item.title))}</span>${statusTag(item.is_archived)}</span>
            <span class="row-meta">${meta([item.subject ? escapeHtml(item.subject) : '', item.test_date ? escapeHtml(item.test_date) : '', formatDate(item.posted_at)])}</span>
          </div>
          <div class="set-links">
            ${sets.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener" class="archive-set-link" title="${escapeHtml(s.name || '')}" aria-label="Open set ${s.label}">${s.label}</a>`).join('')}
          </div>
          <div class="row-actions">
            ${archiveButton('toggleAnswerKeyArchive', item)}
            ${deleteButton('deleteAnswerKey', item, item.title)}
          </div>
        </div>`;
    })
    .join('');
}

async function toggleAnswerKeyArchive(id, targetArchived) {
  try {
    await api(`/api/admin/answer-keys/${id}/archive`, jsonBody('PATCH', { is_archived: targetArchived }));
    showToast(targetArchived ? 'Moved to the archive' : 'Restored');
    loadAdminAnswerKeys();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAnswerKey(id) {
  if (!confirm('Delete these answer keys and every set file? This cannot be undone.')) return;
  try {
    await api(`/api/admin/answer-keys/${id}`, { method: 'DELETE' });
    showToast('Answer keys deleted');
    loadAdminAnswerKeys();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Contacts ──
async function loadAdminContacts() {
  const list = document.getElementById('adminContactsList');
  if (!list) return;
  try {
    const data = await api('/api/contacts');
    adminState.contacts = data.contacts || [];
    setCount('contactsCount', adminState.contacts.length);
    if (adminState.contacts.length === 0) {
      list.innerHTML = listEmpty('No contacts yet. Add the first one above.');
      return;
    }
    list.innerHTML = adminState.contacts
      .map((c) => `
        <div class="row">
          <div class="row-main">
            <span class="row-title">${escapeHtml(c.name)}${c.note ? ` <span class="contact-note">${escapeHtml(c.note)}</span>` : ''}</span>
            <span class="row-meta">${meta([`+91 ${escapeHtml(c.phone.slice(0, 5))} ${escapeHtml(c.phone.slice(5))}`, c.group === 'transport' ? 'Transport' : 'General'])}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-action="editContact" data-id="${c.id}">Edit</button>
            ${deleteButton('deleteContact', c, c.name)}
          </div>
        </div>`)
      .join('');
  } catch (err) {
    list.innerHTML = listError(`Could not load contacts: ${err.message}`);
  }
}

function resetContactForm() {
  adminState.editingContactId = null;
  document.getElementById('contactForm').reset();
  document.getElementById('contactFormHeading').textContent = 'Add a contact';
  document.getElementById('btnSaveContact').textContent = 'Add contact';
  document.getElementById('btnCancelContact').hidden = true;
}

function editContact(id) {
  const c = adminState.contacts.find((x) => x.id === id);
  if (!c) return;
  adminState.editingContactId = id;
  document.getElementById('contactName').value = c.name;
  document.getElementById('contactPhone').value = c.phone;
  document.getElementById('contactGroup').value = c.group;
  document.getElementById('contactNote').value = c.note || '';
  document.getElementById('contactFormHeading').textContent = 'Edit contact';
  document.getElementById('btnSaveContact').textContent = 'Save changes';
  document.getElementById('btnCancelContact').hidden = false;
  document.getElementById('contactForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('contactName').focus({ preventScroll: true });
}

async function deleteContact(id) {
  const c = adminState.contacts.find((x) => x.id === id);
  if (!confirm(`Delete ${c ? c.name : 'this contact'}?`)) return;
  try {
    await api(`/api/admin/contacts/${id}`, { method: 'DELETE' });
    showToast('Contact deleted');
    if (adminState.editingContactId === id) resetContactForm();
    loadAdminContacts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function setupContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  document.getElementById('btnCancelContact').addEventListener('click', resetContactForm);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    const id = adminState.editingContactId;
    await withPending(document.getElementById('btnSaveContact'), 'Saving…', async () => {
      try {
        await api(id ? `/api/admin/contacts/${id}` : '/api/admin/contacts', jsonBody(id ? 'PUT' : 'POST', body));
        showToast(id ? 'Contact updated' : 'Contact added');
        resetContactForm();
        loadAdminContacts();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// ── Tabs ──
function switchTab(targetId) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    const active = b.dataset.target === targetId;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.admin-panel-content').forEach((p) => {
    p.hidden = p.id !== targetId;
  });
}

// Upload forms share one shape: FormData to an endpoint, reset, reload the list.
function setupUploadForm(formId, buttonId, url, pendingText, successText, reload) {
  const form = document.getElementById(formId);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = document.getElementById(buttonId);
    await withPending(button, pendingText, async () => {
      try {
        await api(url, { method: 'POST', body: new FormData(form) });
        showToast(successText);
        form.reset();
        reload();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  loadCategories();
  loadAnnouncements();
  loadAdminSyllabus();
  loadAdminPhaseTests();
  loadAdminAnswerKeys();
  loadAdminContacts();
  setupContactForm();

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.target));
  });
  const form = document.getElementById('announcementForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editing = adminState.editingId;
    await withPending(document.getElementById('btnSubmitPost'), editing ? 'Saving…' : 'Publishing…', async () => {
      try {
        const formData = new FormData(form);
        formData.set('pinned', document.getElementById('postPinned').checked ? 'true' : 'false');
        await api(editing ? `/api/admin/announcements/${editing}` : '/api/admin/announcements', {
          method: editing ? 'PUT' : 'POST',
          body: formData,
        });
        showToast(editing ? 'Changes saved' : 'Announcement published');
        cancelEdit();
        loadAnnouncements();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
  document.getElementById('btnCancelEdit').addEventListener('click', cancelEdit);

  setupUploadForm('syllabusForm', 'btnUploadSyllabus', '/api/admin/syllabus', 'Uploading…', 'Syllabus uploaded', loadAdminSyllabus);
  setupUploadForm('phaseTestForm', 'btnUploadPhaseTest', '/api/admin/phase-tests', 'Publishing…', 'Phase test published', loadAdminPhaseTests);
  setupUploadForm('answerKeyForm', 'btnUploadAnswerKey', '/api/admin/answer-keys', 'Publishing…', 'Answer keys published', loadAdminAnswerKeys);

  document.getElementById('categoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addCategory(document.getElementById('newCategoryInput').value);
  });

  document.getElementById('btnLogout').addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login.html';
    }
  });
});

const ROW_ACTIONS = {
  deleteCategory: (el) => deleteCategory(Number(el.dataset.id), el.dataset.name),
  togglePinAnnouncement: (el) => togglePinAnnouncement(Number(el.dataset.id), el.dataset.value === 'true'),
  editAnnouncement: (el) => editAnnouncement(Number(el.dataset.id)),
  deleteAnnouncement: (el) => deleteAnnouncement(Number(el.dataset.id)),
  toggleSyllabusArchive: (el) => toggleSyllabusArchive(Number(el.dataset.id), Number(el.dataset.value)),
  deleteSyllabus: (el) => deleteSyllabus(Number(el.dataset.id)),
  togglePhaseTestArchive: (el) => togglePhaseTestArchive(Number(el.dataset.id), Number(el.dataset.value)),
  deletePhaseTest: (el) => deletePhaseTest(Number(el.dataset.id)),
  toggleAnswerKeyArchive: (el) => toggleAnswerKeyArchive(Number(el.dataset.id), Number(el.dataset.value)),
  deleteAnswerKey: (el) => deleteAnswerKey(Number(el.dataset.id)),
  editContact: (el) => editContact(Number(el.dataset.id)),
  deleteContact: (el) => deleteContact(Number(el.dataset.id)),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !ROW_ACTIONS[el.dataset.action]) return;
  e.preventDefault();
  ROW_ACTIONS[el.dataset.action](el);
});
