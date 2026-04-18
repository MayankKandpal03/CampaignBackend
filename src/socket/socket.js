import { Server } from "socket.io";
import jwt      from "jsonwebtoken";
import User     from "../models/userModel.js";
import Campaign from "../models/campaignModel.js";
import { scheduleDelivery } from "./campaignScheduler.js";

let io;

// ── Payload builder ──────────────────────────────────────────────────────────
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

// ── Extract owner info from populated createdBy ──────────────────────────────
const getOwnerInfo = (campaign) => {
  const cb = campaign.createdBy;
  if (!cb) return { ownerId: null, ownerRole: null, ownerManagerId: null };

  if (typeof cb === "object") {
    return {
      ownerId:        cb._id?.toString()        ?? null,
      ownerRole:      cb.role                   ?? null,
      ownerManagerId: cb.managerId?.toString()  ?? null,
    };
  }
  return { ownerId: cb.toString(), ownerRole: null, ownerManagerId: null };
};

// Fields populated on createdBy — must include managerId so getOwnerInfo works
const CREATOR_FIELDS = "username email role _id managerId";

// ── Socket server init ───────────────────────────────────────────────────────
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.cookie
          ?.split("; ")
          .find(c => c.startsWith("accessToken="))
          ?.split("=")[1];

      if (!token) return next(new Error("Not authenticated"));
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const user    = await User.findById(decoded._id);
      if (!user) return next(new Error("User not found"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.username} [${user.role}]`);

    socket.join(`room:user_${user._id}`);

    if (user.role === "process manager") socket.join("room:all_pm");
    if (user.role === "it")              socket.join("room:it");

    if (user.role === "manager" || user.role === "ppc") {
      user.teams.forEach(tid => socket.join(`room:team_${tid}`));
    }

    socket.on("disconnect", reason =>
      console.log(`❌ Disconnected: ${user.username} — ${reason}`)
    );
  });

  return io;
};

// ─────────────────────────────────────────────────────────────────────────────
//  Routing rules
//
//  PPC create/update    → manager's personal room + room:all_pm
//  Manager create       → room:all_pm only
//  Manager update       → room:all_pm + campaign owner's personal room  ← FIX
//  PM approve           → room:all_pm + owner + owner's manager (if PPC)
//                         IT: immediate if due now, setTimeout if future ← FIX
//  PM cancel            → room:all_pm + owner + owner's manager (if PPC)
//  IT ack               → room:all_pm + room:it + owner + owner's manager
//
//  io.to([array]).emit() used exclusively — avoids socket.io v4 stale
//  BroadcastOperator bug with chained .to() calls.
// ─────────────────────────────────────────────────────────────────────────────

export const emitCampaignCreated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const rooms = ["room:all_pm"];
    if (performer.managerId) rooms.push(`room:user_${performer.managerId}`);
    io.to(rooms).emit("campaign:created", payload);

  } else if (performer.role === "manager") {
    io.to("room:all_pm").emit("campaign:created", payload);
  }
};

/**
 * Campaign UPDATED or CANCELLED.
 *
 * FIX – Issue 1:
 *   manager role now also emits to the campaign owner's personal room.
 *   Before this fix the owner (PPC) only saw the change after a manual refresh.
 */
export const emitCampaignUpdated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const rooms = ["room:all_pm"];
    if (performer.managerId) rooms.push(`room:user_${performer.managerId}`);
    io.to(rooms).emit("campaign:updated", payload);

  } else if (performer.role === "manager") {
    // Include the campaign owner so they see manager edits in real-time
    const { ownerId } = getOwnerInfo(campaign);
    const rooms = ["room:all_pm"];
    if (ownerId) rooms.push(`room:user_${ownerId}`);
    io.to(rooms).emit("campaign:updated", payload);

  } else if (performer.role === "process manager") {
    const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);
    const rooms = ["room:all_pm"];
    if (ownerId)                               rooms.push(`room:user_${ownerId}`);
    if (ownerRole === "ppc" && ownerManagerId) rooms.push(`room:user_${ownerManagerId}`);
    io.to(rooms).emit("campaign:updated", payload);
  }
};

export const emitCampaignDeleted = (campaign, performer = {}) => {
  io.to([`room:team_${campaign.teamId}`, "room:all_pm"])
    .emit("campaign:deleted", {
      _id:           campaign._id,
      performerName: performer.username || "unknown",
    });
};

/**
 * Campaign APPROVED by PM.
 *
 * FIX – Issue 3:
 *   PMs and the campaign owner are always notified immediately (they need
 *   to see the "approved / sent to IT" status right away).
 *
 *   IT delivery:
 *     • scheduleAt ≤ now (or absent) → push to room:it immediately.
 *     • scheduleAt is in the future  → register a precise setTimeout via
 *       campaignScheduler so IT receives the campaign at the exact scheduled
 *       moment without any manual refresh or polling.
 */
export const emitITQueued = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

  const now          = Date.now();
  const scheduleTime = campaign.scheduleAt
    ? new Date(campaign.scheduleAt).getTime()
    : 0;
  const isFuture = campaign.scheduleAt && scheduleTime > now;

  // Always notify PMs and the campaign owner immediately
  const immediateRooms = ["room:all_pm"];
  if (ownerId)                               immediateRooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId) immediateRooms.push(`room:user_${ownerManagerId}`);
  io.to(immediateRooms).emit("campaign:it_queued", payload);

  if (isFuture) {
    const delay = scheduleTime - now;
    console.log(
      `⏰ Scheduling IT delivery for campaign ${campaign._id} in ${Math.round(delay / 1000)}s`
    );
    scheduleDelivery(campaign._id.toString(), delay, () => {
      console.log(`📤 Delivering scheduled campaign ${campaign._id} to IT`);
      io.to("room:it").emit("campaign:it_queued", payload);
    });
  } else {
    // Due now — deliver immediately
    io.to("room:it").emit("campaign:it_queued", payload);
  }
};

export const emitITAck = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

  const rooms = ["room:all_pm", "room:it"];
  if (ownerId)                               rooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId) rooms.push(`room:user_${ownerManagerId}`);
  io.to(rooms).emit("campaign:it_ack", payload);
};

/**
 * Restore scheduled IT delivery timers after a server restart.
 *
 * On startup: query all approved, not-yet-delivered, future-scheduled
 * campaigns and register a setTimeout for each. This means IT always
 * receives campaigns on time even if the server was restarted while a
 * timer was pending.
 *
 * Call from index.js AFTER initSocket() resolves and the DB is connected.
 */
export const restoreScheduledDeliveries = async () => {
  if (!io) {
    console.warn("restoreScheduledDeliveries: socket not ready — skipping");
    return;
  }
  try {
    const pending = await Campaign.find({
      action:          "approve",
      status:          { $ne: "cancel" },
      scheduleAt:      { $gt: new Date() },
      acknowledgement: { $exists: false },
    }).populate("createdBy", CREATOR_FIELDS);

    for (const campaign of pending) {
      const delay = new Date(campaign.scheduleAt).getTime() - Date.now();
      if (delay <= 0) continue;

      const payload = buildPayload(campaign, {});
      scheduleDelivery(campaign._id.toString(), delay, () => {
        console.log(`📤 [restored] Delivering scheduled campaign ${campaign._id} to IT`);
        io.to("room:it").emit("campaign:it_queued", payload);
      });
    }

    console.log(`♻️  Restored ${pending.length} scheduled delivery timer(s)`);
  } catch (err) {
    console.error("Failed to restore scheduled deliveries:", err);
  }
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};