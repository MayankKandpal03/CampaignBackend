import { Server } from "socket.io";
import jwt  from "jsonwebtoken";
import User from "../models/userModel.js";

let io;

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

/**
 * Extract owner id, role, and managerId from campaign.createdBy.
 * Requires CREATOR_FIELDS in campaignService to include "managerId".
 */
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
  // Not populated — only id available
  return { ownerId: cb.toString(), ownerRole: null, ownerManagerId: null };
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

    // Every user gets a personal room for targeted delivery
    socket.join(`room:user_${user._id}`);

    if (user.role === "process manager") socket.join("room:all_pm");
    if (user.role === "it")              socket.join("room:it");

    // Team rooms kept for legacy delete events
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
//
// NOTE on socket.io v4 room targeting:
//   io.to(room).to(room2)  returns a NEW BroadcastOperator each call.
//   Storing the intermediate result and calling .to() again does NOT mutate
//   the stored reference — the extra room is silently lost.
//
//   CORRECT pattern: io.to(["room1", "room2", ...]).emit(...)
//   This is used exclusively below to avoid the stale-reference bug.
//
// ── Notification / update routing rules ──────────────────────────────────────
//
//   PPC creates or updates   → manager (personal room) + all PMs
//                              NOT back to PPC — their store action already
//                              applied the change locally, which also prevents
//                              the race-condition duplicate on the PPC dashboard.
//
//   Manager creates or updates → all PMs only
//                                NOT back to manager — local state handles it.
//                                NOT to campaign-owner PPCs.
//
//   PM acts (approve/cancel) → campaign owner + all PMs
//                              + owner's manager IF owner is PPC
//                              NOT to other team members.
//
//   IT acknowledges          → campaign owner + all PMs + all IT
//                              + owner's manager IF owner is PPC

/**
 * Campaign CREATED.
 */
export const emitCampaignCreated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    // Send to PPC's manager (personal room) + all PMs.
    // performer is the full User doc from authMiddleware, so managerId is available.
    const rooms = ["room:all_pm"];
    if (performer.managerId) rooms.push(`room:user_${performer.managerId}`);
    io.to(rooms).emit("campaign:created", payload);

  } else if (performer.role === "manager") {
    // Managers only notify PMs. Their own local state is already updated.
    io.to("room:all_pm").emit("campaign:created", payload);
  }
};

/**
 * Campaign UPDATED / CANCELLED.
 */
export const emitCampaignUpdated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    const rooms = ["room:all_pm"];
    if (performer.managerId) rooms.push(`room:user_${performer.managerId}`);
    io.to(rooms).emit("campaign:updated", payload);

  } else if (performer.role === "manager") {
    // Only PMs. No PPCs, not even the campaign owner.
    io.to("room:all_pm").emit("campaign:updated", payload);

  } else if (performer.role === "process manager") {
    const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);
    const rooms = ["room:all_pm"];
    // Always notify the campaign owner
    if (ownerId) rooms.push(`room:user_${ownerId}`);
    // If owner is PPC, also notify their manager
    if (ownerRole === "ppc" && ownerManagerId) rooms.push(`room:user_${ownerManagerId}`);
    io.to(rooms).emit("campaign:updated", payload);
  }
};

export const emitCampaignDeleted = (campaign, performer = {}) => {
  // Team room is fine here — deletion is visible to whole team
  io.to(`room:team_${campaign.teamId}`)
    .to("room:all_pm")
    .emit("campaign:deleted", {
      _id:           campaign._id,
      performerName: performer.username || "unknown",
    });
};

/**
 * Campaign APPROVED → forwarded to IT queue.
 * PM approves → owner + all PMs + all IT + owner's manager (if PPC).
 */
export const emitITQueued = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

  const rooms = ["room:all_pm", "room:it"];
  if (ownerId)                               rooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId) rooms.push(`room:user_${ownerManagerId}`);
  io.to(rooms).emit("campaign:it_queued", payload);
};

/**
 * IT ACKNOWLEDGED.
 * IT acks → owner + all PMs + all IT + owner's manager (if PPC).
 */
export const emitITAck = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);
  const { ownerId, ownerRole, ownerManagerId } = getOwnerInfo(campaign);

  const rooms = ["room:all_pm", "room:it"];
  if (ownerId)                               rooms.push(`room:user_${ownerId}`);
  if (ownerRole === "ppc" && ownerManagerId) rooms.push(`room:user_${ownerManagerId}`);
  io.to(rooms).emit("campaign:it_ack", payload);
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};