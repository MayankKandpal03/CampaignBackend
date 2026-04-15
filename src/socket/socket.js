import { Server } from "socket.io";
import jwt  from "jsonwebtoken";
import User from "../models/userModel.js";

let io;

/**
 * Attach performerName + performerRole to every outgoing payload.
 * The frontend uses performerName for human-readable notification messages.
 */
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

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });

  // ── Auth middleware ──────────────────────────────────────────────────────────
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
    } catch { next(new Error("Invalid token")); }
  });

  // ── Connection handler ───────────────────────────────────────────────────────
  io.on("connection", async (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.username} [${user.role}]`);

    // Every user has a personal room
    socket.join(`room:user_${user._id}`);

    if (user.role === "process manager") socket.join("room:all_pm");
    if (user.role === "it")              socket.join("room:it");

    // Managers and PPCs join their team rooms (used for manager-level events only)
    if (user.role === "manager" || user.role === "ppc") {
      user.teams.forEach(tid => socket.join(`room:team_${tid}`));
    }

    socket.on("disconnect", reason =>
      console.log(`❌ Disconnected: ${user.username} — ${reason}`)
    );
  });

  return io;
};

// ── Emit helpers ─────────────────────────────────────────────────────────────
// Each helper receives the campaign, the acting user, and an optional managerId
// so we can target rooms precisely without querying the DB here.

/**
 * Campaign CREATED.
 *
 * PPC creates    → only the PPC themselves + their manager + all PMs
 *                  FIX: was emitting to room:team which notified ALL PPCs in team
 *
 * Manager creates → manager themselves + all PMs
 */
export const emitCampaignCreated = (campaign, performer = {}, managerId = null) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const emit = io
      .to(`room:user_${performer._id}`)   // PPC themselves
      .to("room:all_pm");                 // All process managers

    if (managerId) emit.to(`room:user_${managerId}`); // Their manager only

    emit.emit("campaign:created", payload);
  } else {
    // Manager (or any other role) creating
    io.to(`room:user_${performer._id}`)
      .to("room:all_pm")
      .emit("campaign:created", payload);
  }
};

/**
 * Campaign UPDATED / CANCELLED.
 *
 * PPC updates     → PPC + their manager + all PMs
 * Manager updates → the campaign owner (PPC) + manager + all PMs
 * PM cancels/acts → campaign owner + manager (via team room) + all PMs
 */
export const emitCampaignUpdated = (campaign, performer = {}, managerId = null) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const emit = io
      .to(`room:user_${performer._id}`)
      .to("room:all_pm");
    if (managerId) emit.to(`room:user_${managerId}`);
    emit.emit("campaign:updated", payload);

  } else if (performer.role === "manager") {
    io.to(`room:user_${campaign.createdBy}`)  // Campaign owner
      .to(`room:user_${performer._id}`)       // Manager themselves
      .to("room:all_pm")
      .emit("campaign:updated", payload);

  } else {
    // Process manager cancel / IT — notify team + all PMs
    io.to(`room:team_${campaign.teamId}`)
      .to("room:all_pm")
      .emit("campaign:updated", payload);
  }
};

export const emitCampaignDeleted = (campaign, performer = {}) => {
  io.to(`room:team_${campaign.teamId}`)
    .to("room:all_pm")
    .emit("campaign:deleted", {
      _id:          campaign._id,
      performerName: performer.username || "unknown",
    });
};

/**
 * Campaign APPROVED → sent to IT queue.
 * Notify: team (owner + manager) + all PMs + all IT.
 */
export const emitITQueued = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  io.to(`room:team_${campaign.teamId}`)
    .to("room:all_pm")
    .to("room:it")
    .emit("campaign:it_queued", payload);
};

/**
 * IT ACKNOWLEDGED.
 * Notify: team (owner + manager) + all PMs + all IT (incl. performer).
 */
export const emitITAck = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  io.to(`room:team_${campaign.teamId}`)
    .to("room:all_pm")
    .to("room:it")
    .emit("campaign:it_ack", payload);
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};