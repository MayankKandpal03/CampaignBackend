// src/services/pushService.js
//
// CHANGES FROM PREVIOUS VERSION:
//  1. Subscriptions now store { subscription, role } so we can push by role.
//  2. Added sendPushToRole()  — send to all users of a specific role.
//  3. Added sendPushToRoles() — send to all users matching any of several roles.
//  4. saveSubscription() now accepts `role` as a third argument.
//  5. push route passes req.user.role when saving (see pushRoute.js).
//
// SETUP (one-time):
//   npm install web-push
//   npx web-push generate-vapid-keys
//   Add to .env:
//     VAPID_PUBLIC_KEY=<public key from above>
//     VAPID_PRIVATE_KEY=<private key from above>
//     VAPID_EMAIL=mailto:admin@yourcompany.com

import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL       || "mailto:admin@example.com",
  process.env.VAPID_PUBLIC_KEY  || "",
  process.env.VAPID_PRIVATE_KEY || "",
);

/**
 * In-memory store.
 * Key:   userId (string)
 * Value: { subscription: PushSubscription, role: string }
 *
 * NOTE: This resets on server restart. For production persistence,
 * store subscriptions in a MongoDB collection instead.
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
      // Subscription is no longer valid — clean up
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
  if (!process.env.VAPID_PUBLIC_KEY) return; // VAPID not configured — skip silently
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