import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/userModel.js";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true,
    },
  });

  // ── Auth Middleware ──
  // Runs before every connection. Verifies JWT and attaches user to socket.
  io.use(async (socket, next) => {
    try {
      // Client sends token via: socket({ auth: { token } }) or as cookie
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

      socket.user = user; // attach user to socket for use in events
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // ── Connection Handler ──
  io.on("connection", async (socket) => {
    const user = socket.user;
    console.log(`🔌 Connected: ${user.username} [${user.role}]`);

    // ── Join role-based rooms ──
    // Every user joins their personal room
    socket.join(`room:user_${user._id}`);

    if (user.role === "process manager") {
      socket.join("room:all_pm"); // sees all campaigns
    }

    if (user.role === "it") {
      socket.join("room:it"); // receives approved campaigns
    }

    if (user.role === "manager") {
      // Join all teams this manager belongs to
      user.teams.forEach((teamId) => {
        socket.join(`room:team_${teamId}`);
      });
    }

    if (user.role === "ppc") {
      // PPC joins their team rooms
      user.teams.forEach((teamId) => {
        socket.join(`room:team_${teamId}`);
      });
    }

    socket.on("disconnect", (reason) => {
      console.log(`❌ Disconnected: ${user.username} — ${reason}`);
    });
  });

  return io;
};

// ── Emit Helpers ──
// Call these from your service layer after DB operations.

export const emitCampaignCreated = (campaign) => {
  // Notify the creator's team + all process managers
  io.to(`room:team_${campaign.teamId}`).to("room:all_pm").emit("campaign:created", campaign);
};

export const emitCampaignUpdated = (campaign) => {
  io.to(`room:team_${campaign.teamId}`).to("room:all_pm").emit("campaign:updated", campaign);
};

export const emitCampaignDeleted = (campaign) => {
  io.to(`room:team_${campaign.teamId}`).to("room:all_pm").emit("campaign:deleted", { _id: campaign._id });
};

export const emitITQueued = (campaign) => {
  // Notify IT room when Process Manager marks campaign as "approve"
  io.to("room:it").emit("campaign:it_queued", campaign);
};

export const emitITAck = (campaign) => {
  // Notify team + PM when IT sends acknowledgement
  io.to(`room:team_${campaign.teamId}`).to("room:all_pm").emit("campaign:it_ack", campaign);
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};