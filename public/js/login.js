const form = document.getElementById('loginForm');
const errBox = document.getElementById('loginError');
const btn = document.getElementById('btnLogin');
const input = document.getElementById('adminPassword');

function showError(message) {
  errBox.textContent = message;
  errBox.hidden = false;
  input.setAttribute('aria-invalid', 'true');
  input.focus();
  input.select();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  input.removeAttribute('aria-invalid');

  const password = input.value;
  if (!password) {
    showError('Enter the admin password.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      // non-JSON error page
    }
    if (res.ok) {
      window.location.href = '/admin.html';
      return;
    }
    showError(data.error || 'That password did not work.');
  } catch (err) {
    showError(`Could not reach the server: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

// Already signed in: go straight to the panel.
fetch('/api/admin/check-auth')
  .then((r) => {
    if (r.ok) window.location.href = '/admin.html';
  })
  .catch(() => {});
