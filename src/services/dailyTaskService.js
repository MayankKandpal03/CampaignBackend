import DailyTask from "../models/dailyTaskModel.js";
import { AppError } from "../utils/errorHandler.js";
import {
  initDailyTaskDelivery,
  cancelDailyTaskDelivery,
  emitDailyTaskAck,
} from "../socket/socket.js";

/**
 * TIMEZONE FIX:
 * All time comparisons use IST (UTC+5:30).
 * The Railway server runs UTC, so Date.now() is UTC.
 * We shift by IST_OFFSET_MS to derive the current IST wall-clock time,
 * then compare against the stored "HH:MM" task time (which is IST).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m

/** Returns the current IST date as a "YYYY-MM-DD" string. */
const todayIST = () => {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const y = nowIST.getUTCFullYear();
  const m = String(nowIST.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowIST.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** Returns the current IST time as "HH:MM". */
const currentTimeIST = () => {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const hh = String(nowIST.getUTCHours()).padStart(2, "0");
  const mm = String(nowIST.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

/** Format a Date as "DD/MM/YYYY, HH:MM" in IST. */
const formatIST = (date) =>
  date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// ── Create a new daily task (PM only) ─────────────────────────────────────────
export const createTask = async (createdBy, task, time) => {
  if (!task || !time) throw new AppError("Task description and time are required", 400);

  const newTask = await DailyTask.create({ createdBy, task, time });

  initDailyTaskDelivery(newTask);

  return newTask;
};

// ── Deactivate a task (PM only) ────────────────────────────────────────────
export const setInactive = async (id) => {
  const updTask = await DailyTask.findById(id);
  if (!updTask) throw new AppError("Task not found", 400);

  updTask.isSchedule = false;
  await updTask.save();

  cancelDailyTaskDelivery(id);

  return updTask;
};

// ── Get all tasks for PM (full list with response history) ─────────────────
export const getAllTasksForPM = async () => {
  return await DailyTask.find()
    .populate("createdBy", "username email role")
    .sort({ createdAt: -1 });
};

// ── Get tasks due right now for IT (active + time passed + not acked today) ─
export const getDueTasksForIT = async () => {
  const tasks = await DailyTask.find({ isSchedule: true }).populate(
    "createdBy",
    "username email role",
  );

  /**
   * FIX: Compare task.time (IST "HH:MM") against the current IST wall-clock
   * time, not server UTC time. On Railway (UTC), new Date().getHours() is UTC
   * and would report the wrong hour by 5:30.
   */
  const currentTime = currentTimeIST(); // e.g. "14:30" IST
  const todayStr = todayIST();          // e.g. "2024-01-15" IST date

  return tasks.filter((task) => {
    // Task hasn't reached its scheduled IST time yet
    if (task.time > currentTime) return false;

    // Check if IT already acknowledged this task today (IST day)
    const ackedToday = (task.itResponse || []).some((r) => {
      if (!r.acknowledgedAt) return false;
      // Convert acknowledgement timestamp to IST date
      const ackIST = new Date(new Date(r.acknowledgedAt).getTime() + IST_OFFSET_MS);
      const ackDate = `${ackIST.getUTCFullYear()}-${String(ackIST.getUTCMonth() + 1).padStart(2, "0")}-${String(ackIST.getUTCDate()).padStart(2, "0")}`;
      return ackDate === todayStr;
    });

    return !ackedToday;
  });
};

// ── IT acknowledges a daily task ──────────────────────────────────────────
export const acknowledgeTask = async (id, message, itUser) => {
  const task = await DailyTask.findById(id);
  if (!task) throw new AppError("Task not found", 404);
  if (!task.isSchedule) throw new AppError("Task is no longer active", 400);

  const now = new Date();

  /**
   * FIX: Use timeZone: "Asia/Kolkata" so the "Done at" timestamp
   * shows IST regardless of server timezone (UTC on Railway).
   */
  const doneAt = formatIST(now);

  const finalMessage = message
    ? `${message}\n\nDone at ${doneAt}`
    : `Done at ${doneAt}`;

  task.itResponse.push({ message: finalMessage, acknowledgedAt: now });
  await task.save();

  emitDailyTaskAck(task, itUser);

  return task;
};