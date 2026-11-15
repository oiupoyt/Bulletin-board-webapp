const form = document.getElementById('loginForm');
const errBox = document.getElementById('loginError');
const btn = document.getElementById('btnLogin');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  const password = document.getElementById('adminPassword').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (res.ok) {
      window.location.href = '/admin.html';
    } else {
      errBox.textContent = data.error || 'Authentication failed.';
      errBox.style.display = 'block';
    }
  } catch (err) {
    errBox.textContent = 'Network or server error: ' + err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Unlock Admin Panel';
  }
});

// Check if already authenticated
fetch('/api/admin/check-auth').then(r => {
  if (r.ok) window.location.href = '/admin.html';
}).catch(() => {});
