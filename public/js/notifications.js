/**
 * Web push: the bell in the header subscribes and unsubscribes this browser.
 * aria-pressed carries the state; the icon and the hidden label follow it.
 *
 * The click asks for permission before anything else is awaited, so the browser's prompt
 * appears at once; the service worker may still be installing at that point.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

let subscribed = false;

function showToast(message, type = 'success') {
  window.UI.toast(message, type);
}

function updateNotifButtonUI(isSubscribed) {
  subscribed = isSubscribed;
  const btn = document.getElementById('btnToggleNotifications');
  if (!btn) return;
  btn.setAttribute('aria-pressed', isSubscribed ? 'true' : 'false');
  btn.classList.toggle('active', isSubscribed);
  btn.title = isSubscribed ? 'Alerts are on. Select to turn them off.' : 'Turn on alerts for new notices';

  const bell = btn.querySelector('.notif-bell');
  if (bell && window.AppIcons) {
    bell.innerHTML = isSubscribed
      ? window.AppIcons.icon('bellRinging', 18, { fill: true })
      : window.AppIcons.icon('bell', 18, { fill: false });
  }
  // The visible label is hidden on phones, so the button carries its name in aria-label too.
  const name = isSubscribed ? 'Alerts on' : 'Turn on alerts';
  btn.setAttribute('aria-label', name);
  const label = btn.querySelector('.notif-btn-label');
  if (label) label.textContent = name;
}

async function publicKey() {
  const res = await fetch('/api/push/public-key');
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  const { publicKey: key } = await res.json();
  if (!key) throw new Error('alerts are not set up on the server');
  return key;
}

async function subscribeUser(btn) {
  btn.disabled = true;
  // The key is fetched while the person answers the prompt.
  const key = publicKey();
  key.catch(() => {}); // handled below; avoids an unhandled rejection if permission is refused
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notifications are blocked. Allow them in your browser settings.', 'error');
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await key),
    });
    const saved = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (!saved.ok) {
      await sub.unsubscribe();
      throw new Error(`the server answered ${saved.status}`);
    }
    updateNotifButtonUI(true);
    showToast('Alerts on. New notices will reach this device.');
  } catch (err) {
    console.error('[notifications] Subscribe error:', err);
    showToast(`Could not turn on alerts: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function unsubscribeUser(btn) {
  btn.disabled = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    updateNotifButtonUI(false);
    showToast('Alerts off.');
  } catch (err) {
    console.error('[notifications] Unsubscribe error:', err);
    showToast(`Could not turn off alerts: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

function initNotifications() {
  const btn = document.getElementById('btnToggleNotifications');
  if (!btn) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    btn.hidden = true;
    return;
  }
  // Listen at once: nothing is awaited between the click and the permission prompt.
  btn.addEventListener('click', () => {
    if (subscribed) unsubscribeUser(btn);
    else subscribeUser(btn);
  });
  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => registration.pushManager.getSubscription())
    .then((existing) => updateNotifButtonUI(Boolean(existing)))
    .catch((err) => console.warn('[notifications] SW registration error:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}
