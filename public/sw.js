/**
 * sw.js — Service Worker for Web Push Notifications
 *
 * MUST be placed at /public/sw.js (project root of the static folder).
 * Express serves it via express.static("public"), so the browser can
 * register it at scope "/", which covers all pages.
 *
 * This is what makes push notifications work when:
 *  - The tab is in the background
 *  - The browser is minimised
 *  - The device screen is locked (Android Chrome)
 *  - The browser is fully closed (Android Chrome with "background sync" allowed)
 *
 * iOS Safari (16.4+) supports Web Push on installed PWAs only.
 */

const APP_ORIGIN = self.location.origin;

// ── Push event ────────────────────────────────────────────────────────────────
// Fired by the browser when the server sends a Web Push message via web-push.
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "OPS Suite", body: event.data.text() };
  }

  const { title = "OPS Suite", body = "", url = "/", tag, role } = data;

  // Pick an icon based on role so IT and PM see different visuals
  const icon = "/favicon.ico";
  const badge = "/favicon.ico";

  const options = {
    body,
    icon,
    badge,
    // tag groups notifications — same tag replaces the previous one
    tag: tag || `ops-${role || "general"}-${Date.now()}`,
    renotify: true,          // vibrate/sound even if tag already exists
    requireInteraction: true, // notification stays until user acts (Android)
    silent: false,
    data: { url },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ── Notification click ────────────────────────────────────────────────────────
// Fired when the user taps the notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // Focus an existing window if one is already open for this app
        for (const client of windowClients) {
          if (
            (client.url.startsWith(APP_ORIGIN) ||
              client.url.startsWith("https://campaign-frontend-swart.vercel.app")) &&
            "focus" in client
          ) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Notification close ────────────────────────────────────────────────────────
// Optional: fires when user explicitly dismisses the notification.
self.addEventListener("notificationclose", () => {
  // Can log analytics here if needed
});

// ── Activate ──────────────────────────────────────────────────────────────────
// Take control of all pages immediately (no waiting for reload).
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});