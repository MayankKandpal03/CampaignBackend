// src/socket/socket.js
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

const trunc = (str = "", len = 100) =>
  str.length > len ? str.slice(0, len) + "…" : str;

// ── Init ─────────────────────────────────────────────────────────────────────
export const initSocket = (httpServer) => {
  const DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "https://satkartarcampaign.vercel.app",
    "https://campaign-frontend-swart.vercel.app",
  ];

  const configuredOrigins = process.env.CLIENT_URL?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

  // Always include defaults — a misconfigured CLIENT_URL won't lock out known origins
  const allowedOrigins = [...new Set([...DEFAULT_ORIGINS, ...configuredOrigins])];

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

  const now          = Date.now();
  const scheduleTime = campaign.scheduleAt
    ? new Date(campaign.scheduleAt).getTime()
    : 0;
  const isFuture = campaign.scheduleAt && scheduleTime > now;

  const immediateRooms = ["room:all_pm"];
  if (ownerId) immediateRooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId)
    immediateRooms.push(`room:user_${ownerManagerId}`);
  io.to(immediateRooms).emit("campaign:it_queued", payload);

  if (isFuture) {
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

      sendPushToRole("it", {
        title: "📋 New Task Assigned",
        body:  trunc(campaign.pmMessage || campaign.message, 120),
        url:   "/it-dashboard",
        tag:   `campaign-it-${campaign._id}`,
        role:  "it",
      });
    });

  } else {
    io.to("room:it").emit("campaign:it_queued", payload);

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
  _id:           task._id,
  task:          task.task,
  time:          task.time,
  isSchedule:    task.isSchedule,
  createdBy:     task.createdBy,
  itResponse:    task.itResponse ?? [],
  performerName: performer.username || "unknown",
  performerRole: performer.role    || "unknown",
});

export const initDailyTaskDelivery = (task) => {
  const payload = buildTaskPayload(task);

  startDailyTask(task._id.toString(), task.time, () => {
    if (!io) return;
    console.log(`📋 Delivering daily task "${task.task.slice(0, 30)}" to IT`);

    io.to("room:it").emit("dailytask:queued", payload);

    sendPushToRole("it", {
      title: "⏰ Daily Task Due Now",
      body:  trunc(task.task, 120),
      url:   "/it-dashboard",
      tag:   `dailytask-${task._id}`,
      role:  "it",
    });
  });
};

export const cancelDailyTaskDelivery = (taskId) => {
  cancelDailyTimer(taskId);
};

export const emitDailyTaskAck = (task, performer = {}) => {
  if (!io) return;

  const payload = buildTaskPayload(task, performer);

  // PM dashboards — for the acknowledgement log
  io.to("room:all_pm").emit("dailytask:acked", payload);

  // IT room — so every other IT user's dashboard removes the task immediately
  io.to("room:it").emit("dailytask:acked", payload);

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