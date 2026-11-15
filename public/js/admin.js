/**
 * Admin Panel Client Controller
 */

const adminState = {
  categories: [],
  announcements: [],
  syllabusArchive: [],
  phaseTests: [],
  answerKeys: [],
  editingId: null,
};

// Toast notification helper
function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

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

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d)) return isoStr;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Auth Guard ──
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

// ── Categories Management ──
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    adminState.categories = data.categories || [];
    renderCategoryDropdown();
    renderCategoryManager();
  } catch (err) {
    showToast('Failed to load categories', 'error');
  }
}

function renderCategoryDropdown() {
  const select = document.getElementById('postCategory');
  if (!select) return;
  select.innerHTML = adminState.categories
    .map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');
}

function renderCategoryManager() {
  const list = document.getElementById('categoryList');
  if (!list) return;

  if (adminState.categories.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">No categories found.</p>';
    return;
  }

  list.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.75rem;">
      ${adminState.categories.map(c => `
        <div style="background:var(--bg); border:1px solid var(--border); padding:0.35rem 0.75rem; border-radius:var(--radius-sm); display:flex; align-items:center; gap:0.5rem; font-size:0.85rem;">
          <span>${escapeHtml(c.name)}</span>
          <button type="button" class="btn-reset-filters" style="color:#ef4444; font-weight:bold; cursor:pointer;" data-action="deleteCategory" data-id="${c.id}" data-name="${escapeHtml(c.name)}" aria-label="Delete category">${ICON('close', 15)}</button>
        </div>
      `).join('')}
    </div>
  `;
}

async function addCategory(name) {
  if (!name || !name.trim()) return;
  try {
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add category');
    showToast('Category added!');
    document.getElementById('newCategoryInput').value = '';
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.deleteCategory = async function(id, name) {
  if (!confirm(`Delete category "${name}"? Existing announcements will keep their current text.`)) return;
  try {
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete category');
    showToast('Category deleted');
    loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ── Announcements Management ──
async function loadAnnouncements() {
  const tbody = document.getElementById('announcementsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-dim);">Loading posts...</td></tr>';

  try {
    const res = await fetch('/api/announcements?limit=100');
    const data = await res.json();
    adminState.announcements = data.announcements || [];
    renderAnnouncementsTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444;">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderAnnouncementsTable() {
  const tbody = document.getElementById('announcementsTableBody');
  if (!tbody) return;

  if (adminState.announcements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:var(--text-dim);">No announcements published yet.</td></tr>';
    return;
  }

  tbody.innerHTML = adminState.announcements
    .map(item => `
      <tr>
        <td>
          <div style="font-weight:600;color:#ffffff;display:flex;align-items:center;gap:0.4rem;">
            ${item.pinned ? `<span style="color:#fbbf24;font-size:0.8rem;" title="Pinned">${ICON('pin', 13)}</span>` : ''}
            <span>${escapeHtml(item.title)}</span>
          </div>
          ${item.attachment_url ? `<div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;">${ICON('paperclip', 12)} Attachment: ${escapeHtml(item.attachment_name || 'File')}</div>` : ''}
        </td>
        <td><span class="badge-category">${escapeHtml(item.category)}</span></td>
        <td style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-dim);white-space:nowrap;">${formatDate(item.posted_at)}</td>
        <td>
          <div class="admin-actions">
            <button class="btn btn-secondary btn-sm" data-action="togglePinAnnouncement" data-id="${item.id}" data-value="${!item.pinned}" title="${item.pinned ? 'Unpin this announcement' : 'Pin this announcement to top'}">
              ${item.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button class="btn btn-secondary btn-sm" data-action="editAnnouncement" data-id="${item.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-action="deleteAnnouncement" data-id="${item.id}">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join('');
}

window.editAnnouncement = function(id) {
  const post = adminState.announcements.find(a => a.id === id);
  if (!post) return;

  adminState.editingId = id;
  document.getElementById('announcementFormHeading').textContent = 'Edit Announcement';
  document.getElementById('postTitle').value = post.title;
  document.getElementById('postBody').value = post.body;
  document.getElementById('postCategory').value = post.category;
  document.getElementById('postAuthor').value = post.author || '';
  document.getElementById('postPinned').checked = Boolean(post.pinned);

  document.getElementById('btnSubmitPost').textContent = 'Save Changes';
  document.getElementById('btnCancelEdit').style.display = 'inline-flex';

  switchTab('tab-create-post');
};

function cancelEdit() {
  adminState.editingId = null;
  document.getElementById('announcementForm').reset();
  document.getElementById('announcementFormHeading').textContent = 'Create New Announcement';
  document.getElementById('btnSubmitPost').textContent = 'Publish Announcement';
  document.getElementById('btnCancelEdit').style.display = 'none';
}

window.deleteAnnouncement = async function(id) {
  if (!confirm('Are you sure you want to permanently delete this announcement?')) return;
  try {
    const res = await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete announcement');
    showToast('Announcement deleted');
    loadAnnouncements();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.togglePinAnnouncement = async function(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/announcements/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: newStatus })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update pin status');
    showToast(data.message || (newStatus ? 'Pinned to top!' : 'Unpinned!'));
    loadAnnouncements();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ── Weekly Syllabus Management ──
async function loadAdminSyllabus() {
  const container = document.getElementById('adminSyllabusList');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/syllabus');
    const data = await res.json();
    adminState.syllabusArchive = data.syllabusList || [];
    renderAdminSyllabus();
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444;">Error loading syllabus: ${escapeHtml(err.message)}</p>`;
  }
}

function renderAdminSyllabus() {
  const container = document.getElementById('adminSyllabusList');
  if (!container) return;

  if (adminState.syllabusArchive.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">No syllabus images uploaded yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:1rem;">
      ${adminState.syllabusArchive.map((item) => `
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); overflow:hidden; position:relative;">
          <div style="height:120px; background:#000; overflow:hidden;">
            <img src="${item.image_url}" alt="${escapeHtml(item.week_label)}" style="width:100%; height:100%; object-fit:cover;" />
          </div>
          <div style="padding:0.75rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
              ${item.is_archived
                ? '<span class="badge-category" style="font-size:0.68rem; background:rgba(113,113,122,0.2); color:#a1a1aa;">Archived</span>'
                : '<span class="badge-urgent" style="font-size:0.68rem; background:rgba(16,185,129,0.15); color:#34d399; border-color:rgba(16,185,129,0.4);"><span class="badge-urgent-dot" style="background:#10b981;"></span> Active</span>'
              }
              <span style="font-size:0.75rem; color:var(--text-dim);">${formatDate(item.posted_at)}</span>
            </div>
            <div style="font-weight:700; font-size:0.88rem; color:#ffffff; margin-bottom:0.6rem;">${escapeHtml(item.week_label)}</div>
            <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
              <a href="${item.image_url}" target="_blank" class="btn btn-secondary btn-sm" style="flex:1;">View</a>
              ${item.is_archived
                ? `<button type="button" class="btn btn-secondary btn-sm" data-action="toggleSyllabusArchive" data-id="${item.id}" data-value="0">${ICON('star', 13)} Set Active</button>`
                : `<button type="button" class="btn btn-secondary btn-sm" data-action="toggleSyllabusArchive" data-id="${item.id}" data-value="1">${ICON('archive', 14)} Archive</button>`
              }
              <button type="button" class="btn btn-danger btn-sm" data-action="deleteSyllabus" data-id="${item.id}">Delete</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.toggleSyllabusArchive = async function(id, targetArchived) {
  try {
    const res = await fetch(`/api/admin/syllabus/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: targetArchived })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update archive status');
    showToast(targetArchived ? 'Syllabus moved to archive' : 'Syllabus restored as active');
    loadAdminSyllabus();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteSyllabus = async function(id) {
  if (!confirm('Are you sure you want to delete this syllabus post?')) return;
  try {
    const res = await fetch(`/api/admin/syllabus/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete syllabus');
    showToast('Syllabus post deleted');
    loadAdminSyllabus();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ── Phase Test Management ──
async function loadAdminPhaseTests() {
  const container = document.getElementById('adminPhaseTestList');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/phase-tests');
    const data = await res.json();
    adminState.phaseTests = data.phaseTests || [];
    renderAdminPhaseTests();
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444;">Error loading phase tests: ${escapeHtml(err.message)}</p>`;
  }
}

function renderAdminPhaseTests() {
  const container = document.getElementById('adminPhaseTestList');
  if (!container) return;

  if (adminState.phaseTests.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">No Phase Tests published yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:0.85rem;">
      ${adminState.phaseTests.map(item => `
        <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.9rem; display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
          <div style="flex:1; min-width:240px;">
            <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
              ${item.is_archived
                ? '<span class="badge-category" style="font-size:0.68rem; background:rgba(113,113,122,0.2); color:#a1a1aa;">Archived</span>'
                : '<span class="badge-urgent" style="font-size:0.68rem; background:rgba(245,158,11,0.15); color:#fbbf24;"><span class="badge-urgent-dot"></span> Active</span>'
              }
              <span class="badge-urgent" style="font-size:0.7rem;">${escapeHtml(item.phase_label)}</span>
              ${item.exam_date ? `<span style="color:#fbbf24; font-size:0.78rem;">${ICON('calendar', 12)} ${escapeHtml(item.exam_date)}</span>` : ''}
            </div>
            <div style="font-weight:700; color:#ffffff; font-size:0.95rem;">${escapeHtml(item.title)}</div>
            ${item.description ? `<div style="font-size:0.84rem; color:#a1a1aa; margin-top:4px;">${escapeHtml(item.description)}</div>` : ''}
            ${item.attachment_url ? `<div style="font-size:0.78rem; color:var(--primary); margin-top:4px;">${ICON('paperclip', 12)} Attachment: <a href="${item.attachment_url}" target="_blank" style="color:var(--primary); text-decoration:underline;">${escapeHtml(item.attachment_name || 'File')}</a></div>` : ''}
            <div style="font-size:0.75rem; color:var(--text-dim); margin-top:4px;">Posted: ${formatDate(item.posted_at)}</div>
          </div>
          <div style="display:flex; gap:0.45rem; align-items:center;">
            ${item.is_archived
              ? `<button type="button" class="btn btn-secondary btn-sm" data-action="togglePhaseTestArchive" data-id="${item.id}" data-value="0">${ICON('star', 13)} Set Active</button>`
              : `<button type="button" class="btn btn-secondary btn-sm" data-action="togglePhaseTestArchive" data-id="${item.id}" data-value="1">${ICON('archive', 14)} Archive</button>`
            }
            <button type="button" class="btn btn-danger btn-sm" data-action="deletePhaseTest" data-id="${item.id}">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.togglePhaseTestArchive = async function(id, targetArchived) {
  try {
    const res = await fetch(`/api/admin/phase-tests/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: targetArchived })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update archive status');
    showToast(targetArchived ? 'Phase Test moved to archive' : 'Phase Test restored as active');
    loadAdminPhaseTests();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deletePhaseTest = async function(id) {
  if (!confirm('Are you sure you want to delete this Phase Test record?')) return;
  try {
    const res = await fetch(`/api/admin/phase-tests/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete phase test');
    showToast('Phase Test deleted');
    loadAdminPhaseTests();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ── Answer Keys Management ──
async function loadAdminAnswerKeys() {
  const container = document.getElementById('adminAnswerKeysList');
  if (!container) return;

  try {
    const res = await fetch('/api/admin/answer-keys');
    const data = await res.json();
    adminState.answerKeys = data.answerKeys || [];
    renderAdminAnswerKeys();
  } catch (err) {
    container.innerHTML = `<p style="color:#ef4444;">Error loading answer keys: ${escapeHtml(err.message)}</p>`;
  }
}

function renderAdminAnswerKeys() {
  const container = document.getElementById('adminAnswerKeysList');
  if (!container) return;

  if (adminState.answerKeys.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;">No Answer Keys published yet.</p>';
    return;
  }

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:0.85rem;">
      ${adminState.answerKeys.map(item => {
        const sets = [
          { label: 'Set A', url: item.set_a_url, name: item.set_a_name },
          { label: 'Set B', url: item.set_b_url, name: item.set_b_name },
          { label: 'Set C', url: item.set_c_url, name: item.set_c_name },
          { label: 'Set D', url: item.set_d_url, name: item.set_d_name },
        ].filter(s => Boolean(s.url));

        const setsList = sets.map(s => `
          <a href="${escapeHtml(s.url)}" target="_blank" class="set-admin-pill" title="${escapeHtml(s.name || '')}">
            <span>${s.label}</span>
          </a>
        `).join('');

        return `
          <div style="background:var(--bg); border:1px solid var(--border); border-radius:var(--radius-sm); padding:0.9rem; display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
            <div style="flex:1; min-width:240px;">
              <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                ${item.is_archived
                  ? '<span class="badge-category" style="font-size:0.68rem; background:rgba(113,113,122,0.2); color:#a1a1aa;">Archived</span>'
                  : '<span class="badge-urgent" style="font-size:0.68rem; background:rgba(245,158,11,0.15); color:#fbbf24;"><span class="badge-urgent-dot"></span> Active</span>'
                }
                ${item.subject ? `<span class="badge-category" style="font-size:0.7rem; background:rgba(59,130,246,0.15); color:#60a5fa; border-color:rgba(59,130,246,0.3);">${escapeHtml(item.subject)}</span>` : ''}
                ${item.test_date ? `<span style="color:#fbbf24; font-size:0.78rem;">${ICON('calendar', 12)} ${escapeHtml(item.test_date)}</span>` : ''}
              </div>
              <div style="font-weight:700; color:#ffffff; font-size:0.95rem;">${escapeHtml(item.title)}</div>
              ${item.description ? `<div style="font-size:0.84rem; color:#a1a1aa; margin-top:4px;">${escapeHtml(item.description)}</div>` : ''}
              <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; margin-top:6px;">
                <span style="font-size:0.75rem; color:var(--text-dim); margin-right:2px;">Uploaded Sets:</span>
                ${setsList}
              </div>
              <div style="font-size:0.75rem; color:var(--text-dim); margin-top:6px;">Posted: ${formatDate(item.posted_at)}</div>
            </div>
            <div style="display:flex; gap:0.45rem; align-items:center;">
              ${item.is_archived
                ? `<button type="button" class="btn btn-secondary btn-sm" data-action="toggleAnswerKeyArchive" data-id="${item.id}" data-value="0">${ICON('star', 13)} Set Active</button>`
                : `<button type="button" class="btn btn-secondary btn-sm" data-action="toggleAnswerKeyArchive" data-id="${item.id}" data-value="1">${ICON('archive', 14)} Archive</button>`
              }
              <button type="button" class="btn btn-danger btn-sm" data-action="deleteAnswerKey" data-id="${item.id}">Delete</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

window.toggleAnswerKeyArchive = async function(id, targetArchived) {
  try {
    const res = await fetch(`/api/admin/answer-keys/${id}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_archived: targetArchived })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update archive status');
    showToast(targetArchived ? 'Answer Key moved to archive' : 'Answer Key restored as active');
    loadAdminAnswerKeys();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.deleteAnswerKey = async function(id) {
  if (!confirm('Are you sure you want to delete this Answer Key record and all attached set files?')) return;
  try {
    const res = await fetch(`/api/admin/answer-keys/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete answer key');
    showToast('Answer Key deleted');
    loadAdminAnswerKeys();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ── Tab Navigation ──
function switchTab(targetId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.target === targetId);
  });
  document.querySelectorAll('.admin-panel-content').forEach(p => {
    p.style.display = p.id === targetId ? 'block' : 'none';
  });
}

// ── Initialization ──
document.addEventListener('DOMContentLoaded', async () => {
  const isAuthed = await checkAuth();
  if (!isAuthed) return;

  loadCategories();
  loadAnnouncements();
  loadAdminSyllabus();
  loadAdminPhaseTests();
  loadAdminAnswerKeys();

  // Tab Buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.target));
  });

  // Announcement Form Submit
  const form = document.getElementById('announcementForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnSubmitPost');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const formData = new FormData(form);
        const isPinned = document.getElementById('postPinned')?.checked || false;
        formData.set('pinned', isPinned ? 'true' : 'false');

        const url = adminState.editingId
          ? `/api/admin/announcements/${adminState.editingId}`
          : '/api/admin/announcements';
        const method = adminState.editingId ? 'PUT' : 'POST';

        const res = await fetch(url, { method, body: formData });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to save announcement');

        showToast(adminState.editingId ? 'Announcement updated!' : 'Announcement published!');
        cancelEdit();
        loadAnnouncements();
        switchTab('tab-manage-posts');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = adminState.editingId ? 'Save Changes' : 'Publish Announcement';
      }
    });
  }

  // Cancel edit button
  const cancelBtn = document.getElementById('btnCancelEdit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelEdit);
  }

  // Syllabus Upload Form Submit
  const syllabusForm = document.getElementById('syllabusForm');
  if (syllabusForm) {
    syllabusForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnUploadSyllabus');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';

      try {
        const formData = new FormData(syllabusForm);
        const res = await fetch('/api/admin/syllabus', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to upload syllabus');

        showToast('Weekly syllabus uploaded!');
        syllabusForm.reset();
        loadAdminSyllabus();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Weekly Syllabus';
      }
    });
  }

  // Phase Test Form Submit
  const phaseTestForm = document.getElementById('phaseTestForm');
  if (phaseTestForm) {
    phaseTestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnUploadPhaseTest');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publishing...';

      try {
        const formData = new FormData(phaseTestForm);
        const res = await fetch('/api/admin/phase-tests', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to publish Phase Test');

        showToast('Phase Test published!');
        phaseTestForm.reset();
        loadAdminPhaseTests();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish Phase Test';
      }
    });
  }

  // Answer Key Form Submit
  const answerKeyForm = document.getElementById('answerKeyForm');
  if (answerKeyForm) {
    answerKeyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btnUploadAnswerKey');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Publishing...';

      try {
        const formData = new FormData(answerKeyForm);
        const res = await fetch('/api/admin/answer-keys', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to publish Answer Key');

        showToast('Answer Keys published!');
        answerKeyForm.reset();
        loadAdminAnswerKeys();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Publish Answer Keys';
      }
    });
  }

  // Add Category Button
  const btnAddCategory = document.getElementById('btnAddCategory');
  if (btnAddCategory) {
    btnAddCategory.addEventListener('click', () => {
      const val = document.getElementById('newCategoryInput').value;
      addCategory(val);
    });
  }

  // Logout button
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
});

// Row actions use data-action instead of inline onclick, so the CSP can forbid inline script.
const ROW_ACTIONS = {
  deleteCategory: (el) => window.deleteCategory(Number(el.dataset.id), el.dataset.name),
  togglePinAnnouncement: (el) => window.togglePinAnnouncement(Number(el.dataset.id), el.dataset.value === 'true'),
  editAnnouncement: (el) => window.editAnnouncement(Number(el.dataset.id)),
  deleteAnnouncement: (el) => window.deleteAnnouncement(Number(el.dataset.id)),
  toggleSyllabusArchive: (el) => window.toggleSyllabusArchive(Number(el.dataset.id), Number(el.dataset.value)),
  deleteSyllabus: (el) => window.deleteSyllabus(Number(el.dataset.id)),
  togglePhaseTestArchive: (el) => window.togglePhaseTestArchive(Number(el.dataset.id), Number(el.dataset.value)),
  deletePhaseTest: (el) => window.deletePhaseTest(Number(el.dataset.id)),
  toggleAnswerKeyArchive: (el) => window.toggleAnswerKeyArchive(Number(el.dataset.id), Number(el.dataset.value)),
  deleteAnswerKey: (el) => window.deleteAnswerKey(Number(el.dataset.id)),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !ROW_ACTIONS[el.dataset.action]) return;
  e.preventDefault();
  ROW_ACTIONS[el.dataset.action](el);
});
