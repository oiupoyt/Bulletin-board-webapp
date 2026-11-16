/**
 * Install prompt and offline support.
 * Registers the service worker on every public page and offers installation on the first visit:
 * a one-tap Install button where the browser allows it (beforeinstallprompt), otherwise a short
 * how-to for the browser in use. The bottom bar hides for good once dismissed; the footer
 * "Install as app" button stays available until the app is installed.
 */
(function () {
  const DISMISS_KEY = 'bulletin-install-dismissed-at';
  // Chrome on Android fires beforeinstallprompt only after some engagement; show the menu hint
  // meanwhile and swap in the Install button if the event arrives.
  const HINT_DELAY_MS = 1500;
  const BAR_TEXT = 'Install Modulus-bulletin for one-tap access and alerts.';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[install] SW registration failed:', err));
    });
  }

  function read(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null; // storage disabled: treat as never dismissed
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // storage disabled: dismissal lasts for this page only
    }
  }

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isFirefox = /Firefox|FxiOS/.test(ua);

  let deferredPrompt = null;
  let bar = null;
  let dismissedThisPage = false;
  let installed = false;
  let footerBtn = null;

  function canShow() {
    if (isStandalone || installed || dismissedThisPage) return false;
    return !read(DISMISS_KEY);
  }

  function hide() {
    if (!bar) return;
    bar.remove();
    bar = null;
    document.body.classList.remove('has-install-prompt');
  }

  function dismiss() {
    dismissedThisPage = true;
    write(DISMISS_KEY, String(Date.now()));
    hide();
  }

  function button(className, label, onClick) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  // Builds the bar, or rewrites it in place when the hint is upgraded to a real Install button.
  // force: requested from the footer button, so a past dismissal does not block it.
  function show({ text, action, force = false }) {
    if (!force && !canShow()) return;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'install-prompt';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Install app');
      document.body.appendChild(bar);
      document.body.classList.add('has-install-prompt');
    }
    bar.replaceChildren();

    const icon = document.createElement('img');
    icon.className = 'install-prompt-icon';
    icon.src = '/favicon-192x192.png?v=8.4';
    icon.alt = '';
    icon.width = 32;
    icon.height = 32;

    const copy = document.createElement('p');
    copy.className = 'install-prompt-text';
    copy.textContent = text;

    const actions = document.createElement('div');
    actions.className = 'install-prompt-actions';
    const closeBtn = button('install-prompt-later', action ? 'Not now' : 'Got it', dismiss);
    actions.appendChild(closeBtn);
    if (action) actions.appendChild(button('install-prompt-install', 'Install', action));

    bar.append(icon, copy, actions);
    if (force) closeBtn.focus();
  }

  async function runNativePrompt() {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    hide();
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'dismissed') dismiss();
  }

  function hintText() {
    if (isIOS) return 'Install on iPhone: tap Share, then Add to Home Screen. Alerts need this on iOS.';
    if (isAndroid && isFirefox) return 'Install: open the Firefox menu, then tap Add app to Home screen.';
    if (isAndroid) return 'Install: open the browser menu, then tap Install app or Add to Home screen.';
    return null; // desktop without beforeinstallprompt (Firefox, Safari): no reliable install path
  }

  function showHint({ force }) {
    if (deferredPrompt || (bar && !force)) return;
    const text = hintText();
    if (text) show({ text, force });
  }

  function updateFooter() {
    if (!footerBtn) return;
    footerBtn.hidden = isStandalone || installed || !(deferredPrompt || hintText());
  }

  // Chromium (Android, desktop Chrome/Edge, Samsung Internet): one-tap install.
  // The event is always kept so the footer button can use it; the bar still respects dismissal.
  window.addEventListener('beforeinstallprompt', (event) => {
    if (isStandalone || installed) return;
    event.preventDefault();
    deferredPrompt = event;
    updateFooter();
    if (canShow()) show({ text: BAR_TEXT, action: runNativePrompt });
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    write(DISMISS_KEY, String(Date.now()));
    hide();
    if (footerBtn) footerBtn.hidden = true;
  });

  function initFooter() {
    footerBtn = document.getElementById('footerInstallBtn');
    if (!footerBtn) return;
    footerBtn.addEventListener('click', () => {
      if (deferredPrompt) {
        runNativePrompt();
      } else {
        showHint({ force: true });
      }
    });
    updateFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooter);
  } else {
    initFooter();
  }

  if (!isStandalone) {
    window.addEventListener('load', () => window.setTimeout(() => showHint({ force: false }), HINT_DELAY_MS));
  }
})();
