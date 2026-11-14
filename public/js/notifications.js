/**
 * Web Push & Notification Client Manager
 */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

let swRegistration = null;

async function initNotifications() {
  const notifBtn = document.getElementById('btnToggleNotifications');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (notifBtn) notifBtn.style.display = 'none';
    return;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');

    // Check existing subscription
    const existingSub = await swRegistration.pushManager.getSubscription();
    updateNotifButtonUI(Boolean(existingSub));

    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        const sub = await swRegistration.pushManager.getSubscription();
        if (sub) {
          await unsubscribeUser(sub);
        } else {
          await subscribeUser();
        }
      });
    }
  } catch (err) {
    console.warn('[notifications] SW registration error:', err);
  }
}

function showToast(message, type = 'success') {
  const region = document.getElementById('toastRegion');
  if (!region) return;
  const toast = document.createElement('div');
  toast.className = 'app-toast' + (type === 'error' ? ' error' : '');
  toast.textContent = message;
  region.appendChild(toast);
  while (region.children.length > 3) region.removeChild(region.firstElementChild);
  window.setTimeout(() => toast.remove(), 3500);
}

function setBellIcon(btn) {
  const target = btn.querySelector('.notif-bell');
  if (target && window.AppIcons) {
    target.innerHTML = window.AppIcons.icon('bell', 20);
  }
}

function updateNotifButtonUI(isSubscribed) {
  const btn = document.getElementById('btnToggleNotifications');
  if (!btn) return;

  setBellIcon(btn);
  btn.setAttribute('aria-pressed', isSubscribed ? 'true' : 'false');

  const label = btn.querySelector('.notif-btn-label');
  if (isSubscribed) {
    if (label) label.textContent = 'Alerts On';
    btn.classList.add('active');
    btn.title = 'Alerts are on. Click to turn off.';
  } else {
    if (label) label.textContent = 'Enable Alerts';
    btn.classList.remove('active');
    btn.title = 'Click to receive exam schedules and circular alerts';
  }
}

async function subscribeUser() {
  const btn = document.getElementById('btnToggleNotifications');
  if (btn) btn.disabled = true;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Permission was blocked. Allow notifications in browser settings.', 'error');
      return;
    }

    // Get public VAPID key
    const res = await fetch('/api/push/public-key');
    const { publicKey } = await res.json();
    if (!publicKey) throw new Error('VAPID public key unavailable.');

    const sub = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });

    updateNotifButtonUI(true);
    showToast('Alerts are on. You will get exam and circular updates.');

    // Optional confirmation notification
    if (swRegistration && swRegistration.showNotification) {
      swRegistration.showNotification('Notifications Enabled!', {
        body: "You'll now receive alerts for new circulars, weekly syllabus, and phase tests.",
        tag: 'welcome-alert',
      });
    }
  } catch (err) {
    console.error('[notifications] Subscribe error:', err);
    showToast('Could not enable alerts: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function unsubscribeUser(sub) {
  const btn = document.getElementById('btnToggleNotifications');
  if (btn) btn.disabled = true;

  try {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });

    await sub.unsubscribe();
    updateNotifButtonUI(false);
    showToast('Alerts are off.');
  } catch (err) {
    showToast('Could not turn alerts off: ' + err.message, 'error');
    console.error('[notifications] Unsubscribe error:', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Auto initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}
