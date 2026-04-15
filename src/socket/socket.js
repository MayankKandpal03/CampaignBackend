import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

let io;

/**
 * Convert a Mongoose document or plain object into a serialisable plain object
 * and attach the performer's username + role for frontend notification messages.
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
    cors: {
      origin:      process.env.CLIENT_URL,
      credentials: true,
    },
  });

  // ── Auth Middleware ──────────────────────────────────────────────────────────
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

  // ── Connection Handler ───────────────────────────────────────────────────────
  io.on("connection", async (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.username} [${user.role}]`);

    // Personal room — always joined
    socket.join(`room:user_${user._id}`);

    if (user.role === "process manager") socket.join("room:all_pm");
    if (user.role === "it")              socket.join("room:it");

    if (user.role === "manager" || user.role === "ppc") {
      user.teams.forEach(teamId => socket.join(`room:team_${teamId}`));
    }

    socket.on("disconnect", reason => {
      console.log(`❌ Disconnected: ${user.username} — ${reason}`);
    });
  });

  return io;
};

// ── Emit Helpers ──────────────────────────────────────────────────────────────

/**
 * Campaign CREATED.
 *
 * PPC creates:     notify PPC themselves + their manager + all PMs
 *                  → room:team + room:all_pm
 *
 * Manager creates: notify manager themselves + all PMs
 *                  → room:user_{manager._id} + room:all_pm
 *                  (intentionally does NOT notify all PPCs in team)
 */
export const emitCampaignCreated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    io.to(`room:team_${campaign.teamId}`)
      .to("room:all_pm")
      .emit("campaign:created", payload);
  } else {
    // manager, or any other role creating a campaign
    io.to(`room:user_${performer._id}`)
      .to("room:all_pm")
      .emit("campaign:created", payload);
  }
};

/**
 * Campaign UPDATED / CANCELLED.
 *
 * PPC updates their own:           notify PPC + manager + all PMs
 *                                  → room:team + room:all_pm
 *
 * Manager updates a PPC campaign:  notify the specific PPC (owner) + all PMs
 *                                  + manager themselves
 *                                  → room:user_{createdBy} + room:all_pm
 *                                    + room:user_{manager._id}
 *
 * Manager updates their own:       same two rooms collapse to same person
 *
 * PM cancels:                      notify team (owner + manager) + all PMs
 *                                  → room:team + room:all_pm
 */
export const emitCampaignUpdated = (campaign, performer = {}) => {
  const payload = buildPayload(campaign, performer);

  if (performer.role === "ppc") {
    io.to(`room:team_${campaign.teamId}`)
      .to("room:all_pm")
      .emit("campaign:updated", payload);

  } else if (performer.role === "manager") {
    io.to(`room:user_${campaign.createdBy}`)
      .to(`room:user_${performer._id}`)
      .to("room:all_pm")
      .emit("campaign:updated", payload);

  } else {
    // process manager (cancel) or any other role
    io.to(`room:team_${campaign.teamId}`)
      .to("room:all_pm")
      .emit("campaign:updated", payload);
  }
};

export const emitCampaignDeleted = (campaign, performer = {}) => {
  const payload = { _id: campaign._id, performerName: performer.username || "unknown" };
  io.to(`room:team_${campaign.teamId}`)
    .to("room:all_pm")
    .emit("campaign:deleted", payload);
};

/**
 * Campaign APPROVED by PM → forwarded to IT.
 * Notify: campaign team (owner + manager) + all PMs + all IT.
 * FIX: previously only notified room:it — team and PMs missed the event.
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
 * Notify: campaign team (owner + manager) + all PMs + all IT (incl. performer).
 * FIX: previously did not include room:it so IT performer had no self-notification.
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