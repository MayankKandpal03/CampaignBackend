// src/services/pushService.js
// npm install web-push  →  then run: npx web-push generate-vapid-keys
// Put the output keys in your .env:
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
//   VAPID_EMAIL=mailto:admin@yourcompany.com

import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL      || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY  || '',
  process.env.VAPID_PRIVATE_KEY || '',
);

// In-memory store (swap for MongoDB collection in production)
/** @type {Map<string, PushSubscription>} userId → subscription */
const subscriptions = new Map();

/** Save a subscription for a user */
export const saveSubscription = (userId, subscription) => {
  subscriptions.set(String(userId), subscription);
};

/** Remove subscription on logout */
export const removeSubscription = (userId) => {
  subscriptions.delete(String(userId));
};

/**
 * Send a push to specific userIds.
 * @param {string[]} userIds
 * @param {{ title: string, body: string, url?: string }} payload
 */
export const sendPushToUsers = async (userIds, payload) => {
  const json = JSON.stringify(payload);
  await Promise.allSettled(
    userIds.flatMap(id => {
      const sub = subscriptions.get(String(id));
      if (!sub) return [];
      return [webpush.sendNotification(sub, json).catch(err => {
        if (err.statusCode === 410) subscriptions.delete(String(id)); // expired
        console.warn('[Push] Failed for', id, err.message);
      })];
    })
  );
};

/** Send push to ALL subscribed IT users */
export const sendPushToAll = async (payload) => {
  await sendPushToUsers([...subscriptions.keys()], payload);
};

export const getVapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';