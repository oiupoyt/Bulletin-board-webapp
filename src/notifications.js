import webpush from 'web-push';
import { config } from './config.js';
import { dbQueries } from './db.js';

// Initialize web-push with VAPID keys
if (config.vapidPublicKey && config.vapidPrivateKey) {
  try {
    webpush.setVapidDetails(config.vapidEmail, config.vapidPublicKey, config.vapidPrivateKey);
  } catch (err) {
    console.warn('[notifications] Failed to initialize VAPID details:', err.message);
  }
}

/**
 * Broadcast push notification to all active subscribers
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.url]
 * @param {string} [options.tag]
 */
export async function broadcastNotification({ title, body, url = '/', tag = 'notice' }) {
  const subscriptions = dbQueries.getAllPushSubscriptions();
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const payload = JSON.stringify({
    title,
    body,
    url,
    tag,
    timestamp: Date.now(),
  });

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushConfig, payload);
        sent++;
      } catch (err) {
        failed++;
        // If subscription is expired or unsubscribed, remove from DB
        if (err.statusCode === 404 || err.statusCode === 410) {
          try {
            dbQueries.deletePushSubscription(sub.endpoint);
          } catch {}
        }
      }
    })
  );

  return { sent, failed, total: subscriptions.length };
}
