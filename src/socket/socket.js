// src/socket/socket.js
//
// CHANGES:
//  Added Web Push calls alongside every socket emit so that IT and PM users
//  receive OS-level notifications even when the browser tab is in the
//  background, minimised, or fully closed.
//
//  Push is sent via sendPushToRole() / sendPushToUsers() from pushService.js.
//  If VAPID keys are not configured, sendPushToRole() is a no-op — safe to deploy.
//
//  Push targets per event:
//    campaign:created         → process manager
//    campaign:updated         → process manager
//    campaign:it_queued       → process manager (approval notification)
//    IT delivery (immediate)  → it
//    IT delivery (scheduled)  → it  (fires from setTimeout)
//    campaign:it_ack          → process manager
//    dailytask:queued         → it  (fires from daily timer)
//    dailytask:acked          → process manager

import { Server }    from "socket.io";
import jwt           from "jsonwebtoken";
import User          from "../models/userModel.js";
import Campaign      from "../models/campaignModel.js";
import DailyTask     from "../models/dailyTaskModel.js";
import { scheduleDelivery }                  from "./campaignScheduler.js";
import { startDailyTask, cancelDailyTask as cancelDailyTimer } from "./dailyTaskScheduler.js";
import {
  sendPushToRole,
  sendPushToUsers,
} from "../services/pushService.js";

let io;

// ── Payload helpers ──────────────────────────────────────────────────────────
const buildPayload = (campaign, performer = {}) => {
  const base = campaign.toJSON
    ? campaign.toJSON()
    : campaign.toObject
      ? campaign.toObject()
      : { ...campaign };
  return {
    ...base,
    performerName: performer.username || "unknown",
    performerRole: performer.role    || "unknown",
  };
};

const getOwnerInfo = (campaign) => {
  const cb = campaign.createdBy;
  if (!cb) return { ownerId: null, ownerRole: null, ownerManagerId: null };
  if (typeof cb === "object") {
    return {
      ownerId:        cb._id?.toString()      ?? null,
      ownerRole:      cb.role                 ?? null,
      ownerManagerId: cb.managerId?.toString() ?? null,
    };
  }
  return { ownerId: cb.toString(), ownerRole: null, ownerManagerId: null };
};

const CREATOR_FIELDS = "username email role _id managerId";

// ── Truncate helper ───────────────────────────────────────────────────────────
const trunc = (str = "", len = 100) =>
  str.length > len ? str.slice(0, len) + "…" : str;

// ── Init ─────────────────────────────────────────────────────────────────────
export const initSocket = (httpServer) => {
  const configuredOrigins = process.env.CLIENT_URL?.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const allowedOrigins = configuredOrigins?.length
    ? configuredOrigins
    : ["http://localhost:5173", "https://campaign-frontend-swart.vercel.app"];

  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.cookie
          ?.split("; ")
          .find((c) => c.startsWith("accessToken="))
          ?.split("=")[1];

      if (!token) return next(new Error("Not authenticated"));
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(decoded._id);
      if (!user) return next(new Error("User not found"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.username} [${user.role}]`);

    socket.join(`room:user_${user._id}`);
    if (user.role === "process manager") socket.join("room:all_pm");
    if (user.role === "it")              socket.join("room:it");
    if (user.role === "manager" || user.role === "ppc") {
      user.teams.forEach((tid) => socket.join(`room:team_${tid}`));
    }

    socket.on("disconnect", (reason) =>
      console.log(`❌ Disconnected: ${user.username} — ${reason}`)
    );
  });

  return io;
};

// ── Campaign emitters ─────────────────────────────────────────────────────────

export const emitCampaignCreated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const rooms = ["room:all_pm"];
    if (performer.managerId) rooms.push(`room:user_${performer.managerId}`);
    io.to(rooms).emit("campaign:created", payload);
  } else if (performer.role === "manager") {
    io.to("room:all_pm").emit("campaign:created", payload);
  }

  // Push — notify PM regardless of creator role
  sendPushToRole("process manager", {
    title: "📋 New Campaign Created",
    body:  `${performer.username || "Someone"}: ${trunc(campaign.message)}`,
    url:   "/pm-dashboard",
    tag:   `campaign-created-${campaign._id}`,
    role:  "process manager",
  });
};

export const emitCampaignUpdated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const rooms = ["room:all_pm"];
    if (performer.managerId) rooms.push(`room:user_${performer.managerId}`);
    io.to(rooms).emit("campaign:updated", payload);
  } else if (performer.role === "manager") {
    const { ownerId } = getOwnerInfo(campaign);
    const rooms = ["room:all_pm"];
    if (ownerId) rooms.push(`room:user_${ownerId}`);
    io.to(rooms).emit("campaign:updated", payload);
  } else if (performer.role === "process manager") {
    const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);
    const rooms = ["room:all_pm"];
    if (ownerId) rooms.push(`room:user_${ownerId}`);
    if (ownerRole === "ppc" && ownerManagerId)
      rooms.push(`room:user_${ownerManagerId}`);
    io.to(rooms).emit("campaign:updated", payload);
  }

  // Push — notify PM when PPC/Manager edits or cancels
  if (["ppc", "manager"].includes(performer.role)) {
    const isCancelled =
      campaign.status === "cancel" || campaign.action === "cancel";
    sendPushToRole("process manager", {
      title: isCancelled ? "❌ Campaign Cancelled" : "✏️ Campaign Updated",
      body:  `${performer.username || "Someone"}: ${trunc(campaign.message)}`,
      url:   "/pm-dashboard",
      tag:   `campaign-updated-${campaign._id}`,
      role:  "process manager",
    });
  }
};

export const emitITQueued = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

  const now         = Date.now();
  const scheduleTime = campaign.scheduleAt
    ? new Date(campaign.scheduleAt).getTime()
    : 0;
  const isFuture = campaign.scheduleAt && scheduleTime > now;

  // Notify PMs + campaign owner immediately on approval
  const immediateRooms = ["room:all_pm"];
  if (ownerId) immediateRooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId)
    immediateRooms.push(`room:user_${ownerManagerId}`);
  io.to(immediateRooms).emit("campaign:it_queued", payload);

  if (isFuture) {
    // ── Scheduled delivery ──────────────────────────────────────────────────
    const delay = scheduleTime - now;
    console.log(
      `⏰ Scheduling IT delivery for campaign ${campaign._id} in ${Math.round(delay / 1000)}s`
    );

    scheduleDelivery(campaign._id.toString(), delay, () => {
      console.log(`📤 Delivering scheduled campaign ${campaign._id} to IT`);

      io.to("room:it").emit("campaign:it_queued", payload);

      const firedRooms = ["room:all_pm"];
      if (ownerId) firedRooms.push(`room:user_${ownerId}`);
      if (ownerRole === "ppc" && ownerManagerId)
        firedRooms.push(`room:user_${ownerManagerId}`);
      io.to(firedRooms).emit("campaign:schedule_fired", payload);

      // Push IT when the scheduled time arrives
      sendPushToRole("it", {
        title: "📋 New Task Assigned",
        body:  trunc(campaign.pmMessage || campaign.message, 120),
        url:   "/it-dashboard",
        tag:   `campaign-it-${campaign._id}`,
        role:  "it",
      });
    });

  } else {
    // ── Immediate delivery ──────────────────────────────────────────────────
    io.to("room:it").emit("campaign:it_queued", payload);

    // Push IT immediately
    sendPushToRole("it", {
      title: "📋 New Task Assigned",
      body:  trunc(campaign.pmMessage || campaign.message, 120),
      url:   "/it-dashboard",
      tag:   `campaign-it-${campaign._id}`,
      role:  "it",
    });
  }
};

export const emitITAck = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

  const rooms = ["room:all_pm", "room:it"];
  if (ownerId) rooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId)
    rooms.push(`room:user_${ownerManagerId}`);
  io.to(rooms).emit("campaign:it_ack", payload);

  // Push PM when IT responds
  const isDone = campaign.acknowledgement === "done";
  sendPushToRole("process manager", {
    title: isDone ? "✅ Task Completed" : "⚠️ Task Not Done",
    body:  trunc(campaign.itMessage || campaign.message, 120),
    url:   "/pm-dashboard",
    tag:   `campaign-ack-${campaign._id}`,
    role:  "process manager",
  });
};

// ── Restore pending campaign timers after server restart ─────────────────────
export const restoreScheduledDeliveries = async () => {
  if (!io) {
    console.warn("restoreScheduledDeliveries: socket not ready");
    return;
  }
  try {
    const nowISO = new Date().toISOString();

    const pending = await Campaign.find({
      action:          "approve",
      status:          { $ne: "cancel" },
      scheduleAt:      { $gt: nowISO },
      acknowledgement: { $exists: false },
    }).populate("createdBy", CREATOR_FIELDS);

    for (const campaign of pending) {
      const delay = new Date(campaign.scheduleAt).getTime() - Date.now();
      if (delay <= 0) continue;

      const payload = buildPayload(campaign, {});
      const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

      scheduleDelivery(campaign._id.toString(), delay, () => {
        console.log(
          `📤 [restored] Delivering scheduled campaign ${campaign._id} to IT`
        );

        io.to("room:it").emit("campaign:it_queued", payload);

        const firedRooms = ["room:all_pm"];
        if (ownerId) firedRooms.push(`room:user_${ownerId}`);
        if (ownerRole === "ppc" && ownerManagerId)
          firedRooms.push(`room:user_${ownerManagerId}`);
        io.to(firedRooms).emit("campaign:schedule_fired", payload);

        // Push IT on restored scheduled delivery
        sendPushToRole("it", {
          title: "📋 New Task Assigned",
          body:  trunc(campaign.pmMessage || campaign.message, 120),
          url:   "/it-dashboard",
          tag:   `campaign-it-${campaign._id}`,
          role:  "it",
        });
      });
    }

    console.log(
      `♻️  Restored ${pending.length} scheduled campaign delivery timer(s)`
    );
  } catch (err) {
    console.error("Failed to restore scheduled deliveries:", err);
  }
};

// ── Daily Task emitters ───────────────────────────────────────────────────────

const buildTaskPayload = (task, performer = {}) => ({
  _id:          task._id,
  task:         task.task,
  time:         task.time,
  isSchedule:   task.isSchedule,
  createdBy:    task.createdBy,
  itResponse:   task.itResponse ?? [],
  performerName: performer.username || "unknown",
  performerRole: performer.role    || "unknown",
});

export const initDailyTaskDelivery = (task) => {
  const payload = buildTaskPayload(task);

  startDailyTask(task._id.toString(), task.time, () => {
    if (!io) return;
    console.log(`📋 Delivering daily task "${task.task.slice(0, 30)}" to IT`);

    io.to("room:it").emit("dailytask:queued", payload);

    // Push IT every time the daily timer fires
    sendPushToRole("it", {
      title: "⏰ Daily Task Due Now",
      body:  trunc(task.task, 120),
      url:   "/it-dashboard",
      tag:   `dailytask-${task._id}`,   // same tag each day = replaces yesterday's
      role:  "it",
    });
  });
};

export const cancelDailyTaskDelivery = (taskId) => {
  cancelDailyTimer(taskId);
};

export const emitDailyTaskAck = (task, performer = {}) => {
  if (!io) return;

  io.to("room:all_pm").emit("dailytask:acked", buildTaskPayload(task, performer));

  // Push PM when IT acknowledges a daily task
  sendPushToRole("process manager", {
    title: "✅ Daily Task Acknowledged",
    body:  `${performer.username || "IT"} completed: ${trunc(task.task, 100)}`,
    url:   "/pm-dashboard",
    tag:   `dailytask-ack-${task._id}-${Date.now()}`,
    role:  "process manager",
  });
};

export const restoreDailyTaskDeliveries = async () => {
  if (!io) {
    console.warn("restoreDailyTaskDeliveries: socket not ready");
    return;
  }
  try {
    const tasks = await DailyTask.find({ isSchedule: true });
    for (const task of tasks) {
      initDailyTaskDelivery(task);
    }
    console.log(
      `♻️  Restored ${tasks.length} daily task delivery timer(s)`
    );
  } catch (err) {
    console.error("Failed to restore daily task deliveries:", err);
  }
};