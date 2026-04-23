/**
 * dailyTaskScheduler.js
 *
 * In-memory timer registry for daily-recurring IT task delivery.
 *
 * TIMEZONE FIX:
 * The Railway server runs in UTC. Task times (e.g. "14:30") are stored as
 * IST (UTC+5:30). Without correction, setHours(14, 30) fires at 14:30 UTC
 * = 20:00 IST — 5.5 hours late.
 *
 * Fix: compute the next UTC epoch for a given IST HH:MM by adding the IST
 * offset to a UTC "today at HH:MM" epoch, then subtracting the IST offset.
 * This is equivalent to: UTC_epoch = IST_wall_epoch - IST_OFFSET.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in ms

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const timers = new Map();

/**
 * Compute milliseconds from NOW until the next occurrence of `timeStr` in IST.
 *
 * Algorithm:
 *   1. Get current time in IST by shifting UTC epoch by +5:30.
 *   2. Build "today at HH:MM IST" as a UTC epoch in IST space.
 *   3. Subtract IST offset to get the real UTC epoch.
 *   4. If that moment is already past, add 24 h for tomorrow.
 *
 * @param {string} timeStr  "HH:MM" (24-hour IST)
 * @returns {number}        delay in ms (always > 0)
 */
const msUntilTime = (timeStr) => {
  const [hours, minutes] = timeStr.split(":").map(Number);

  const nowUTC = Date.now();

  // Express "now" in IST wall-clock coordinates using UTC methods
  const nowIST = new Date(nowUTC + IST_OFFSET_MS);

  // Build "today HH:MM IST" as if it were a UTC timestamp in IST space
  const targetISTspace = Date.UTC(
    nowIST.getUTCFullYear(),
    nowIST.getUTCMonth(),
    nowIST.getUTCDate(),
    hours,
    minutes,
    0,
    0,
  );

  // Convert back to real UTC epoch
  let targetUTC = targetISTspace - IST_OFFSET_MS;

  // If that moment has already passed today, schedule for tomorrow
  if (targetUTC <= nowUTC) {
    targetUTC += 24 * 60 * 60 * 1000;
  }

  return targetUTC - nowUTC;
};

/**
 * Start a recurring daily delivery for a task.
 * Cancels any existing timer for the same taskId first.
 *
 * @param {string}   taskId   Unique identifier (DailyTask._id as string)
 * @param {string}   timeStr  "HH:MM" IST daily trigger time
 * @param {Function} fn       Callback executed at each delivery
 */
export const startDailyTask = (taskId, timeStr, fn) => {
  const key = String(taskId);
  cancelDailyTask(taskId);

  const scheduleNext = () => {
    const delay = msUntilTime(timeStr);
    console.log(
      `⏰ Daily task "${key}" scheduled in ${Math.round(delay / 1000 / 60)} min (IST time: ${timeStr})`,
    );
    const id = setTimeout(() => {
      fn();
      scheduleNext();
    }, delay);
    timers.set(key, id);
  };

  scheduleNext();
};

/**
 * Cancel all pending deliveries for a task.
 *
 * @param {string} taskId
 */
export const cancelDailyTask = (taskId) => {
  const key = String(taskId);
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
};

/** Number of currently-active daily task timers (for logging). */
export const activeDailyCount = () => timers.size;