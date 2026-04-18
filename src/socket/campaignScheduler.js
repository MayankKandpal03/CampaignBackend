/**
 * campaignScheduler.js
 *
 * In-memory timer registry for scheduling the exact-time socket push
 * that delivers an approved campaign to the IT room.
 *
 * Why a separate file?
 *   socket.js needs to schedule deliveries.
 *   campaignService.js needs to cancel them (PM cancels after approving,
 *   or IT marks "not done").
 *   Keeping the Map here avoids any circular-import between the two.
 */

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map();

/**
 * Schedule a delivery callback after `delayMs` milliseconds.
 * Cancels any previously-registered timer for the same campaign first.
 *
 * @param {string}   campaignId
 * @param {number}   delayMs    - must be > 0
 * @param {Function} fn         - called when the timer fires
 */
export const scheduleDelivery = (campaignId, delayMs, fn) => {
  const key = String(campaignId);
  if (timers.has(key)) clearTimeout(timers.get(key));

  const id = setTimeout(() => {
    timers.delete(key);
    fn();
  }, delayMs);

  timers.set(key, id);
};

/**
 * Cancel a pending delivery (e.g. PM cancels an approved campaign, or
 * IT marks "not done" before the timer fires).
 *
 * @param {string} campaignId
 */
export const cancelDelivery = (campaignId) => {
  const key = String(campaignId);
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
};

/** How many timers are currently live (useful for logging). */
export const pendingCount = () => timers.size;