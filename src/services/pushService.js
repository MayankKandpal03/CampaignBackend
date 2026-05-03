// src/services/pushService.js
//
// SETUP (one-time):
//   npm install web-push
//   npx web-push generate-vapid-keys
//   Add to .env:
//     VAPID_PUBLIC_KEY=<public key from above>
//     VAPID_PRIVATE_KEY=<private key from above>
//     VAPID_EMAIL=mailto:admin@yourcompany.com

import webpush from "web-push";

// Guard: only configure web-push when valid VAPID keys are present.
// Calling setVapidDetails with empty strings throws and can crash the server.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL       || "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  console.warn(
    "[Push] VAPID keys not configured — push notifications disabled. " +
    "Run `npx web-push generate-vapid-keys` and add the keys to your .env file."
  );
}

/**
 * In-memory store.
 * Key:   userId (string)
 * Value: { subscription: PushSubscription, role: string }
 *
 * NOTE: Resets on server restart. Frontend re-registers on every page load
 * so subscriptions are always restored within one page visit.
 */
/** @type {Map<string, { subscription: object, role: string }>} */
const subscriptions = new Map();

// ── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Save (or overwrite) a push subscription for a user.
 * @param {string} userId
 * @param {object} subscription - PushSubscription JSON from the browser
 * @param {string} role         - e.g. "it", "process manager"
 */
export const saveSubscription = (userId, subscription, role) => {
  subscriptions.set(String(userId), { subscription, role });
  console.log(`[Push] Subscribed: ${userId} (${role}) — total: ${subscriptions.size}`);
};

/**
 * Remove a subscription (call on logout).
 */
export const removeSubscription = (userId) => {
  subscriptions.delete(String(userId));
  console.log(`[Push] Unsubscribed: ${userId} — total: ${subscriptions.size}`);
};

// ── Send helpers ──────────────────────────────────────────────────────────────

/**
 * Internal: send a JSON payload to a single subscription entry.
 * Removes the entry on 410 Gone (subscription expired / revoked).
 */
const _send = (userId, entry, json) =>
  webpush.sendNotification(entry.subscription, json).catch((err) => {
    if (err.statusCode === 410 || err.statusCode === 404) {
      subscriptions.delete(String(userId));
      console.warn(`[Push] Removed expired subscription for ${userId}`);
    } else {
      console.warn(`[Push] Failed for ${userId}:`, err.message);
    }
  });

/**
 * Send a push notification to specific user IDs.
 * @param {string[]} userIds
 * @param {object}   payload  - { title, body, url, tag, role }
 */
export const sendPushToUsers = async (userIds, payload) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const json = JSON.stringify(payload);
  await Promise.allSettled(
    userIds.map((id) => {
      const entry = subscriptions.get(String(id));
      if (!entry) return Promise.resolve();
      return _send(id, entry, json);
    })
  );
};

/**
 * Send a push notification to ALL subscribed users with a specific role.
 * @param {string} role     - e.g. "it" or "process manager"
 * @param {object} payload  - { title, body, url, tag, role }
 */
export const sendPushToRole = async (role, payload) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const json = JSON.stringify(payload);
  const targets = [...subscriptions.entries()].filter(
    ([, entry]) => entry.role === role
  );
  if (targets.length === 0) return;
  await Promise.allSettled(
    targets.map(([id, entry]) => _send(id, entry, json))
  );
};

/**
 * Send a push notification to ALL subscribed users matching any of the roles.
 * @param {string[]} roles   - e.g. ["it", "process manager"]
 * @param {object}   payload
 */
export const sendPushToRoles = async (roles, payload) => {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  const json = JSON.stringify(payload);
  const targets = [...subscriptions.entries()].filter(([, entry]) =>
    roles.includes(entry.role)
  );
  if (targets.length === 0) return;
  await Promise.allSettled(
    targets.map(([id, entry]) => _send(id, entry, json))
  );
};

export const getVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || "";