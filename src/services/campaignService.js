// src/services/campaignService.js  (backend)
import Campaign from "../models/campaignModel.js";
import Team     from "../models/teamModel.js";
import { AppError } from "../utils/errorHandler.js";
import {
  emitCampaignCreated,
  emitCampaignUpdated,
  emitITQueued,
  emitITAck,
} from "../socket/socket.js";

// ── managerId is included so socket.js can identify the owner's manager
//    and route PM / IT events to the correct personal room.
const CREATOR_FIELDS = "username email role _id managerId";

/**
 * Helper: fetch a campaign by id with createdBy populated.
 * Used after every create / findByIdAndUpdate so socket payloads
 * and API responses always carry { _id, username, email, role, managerId }
 * instead of a raw ObjectId.
 */
const findPopulated = (id) =>
  Campaign.findById(id).populate("createdBy", CREATOR_FIELDS);

// ── Create Campaign ────────────────────────────────────────────────────────────
export const createCampaignService = async (user, message, requestedAt, teamId) => {
  if (!message)  throw new AppError("Message is required", 400);
  if (!teamId)   throw new AppError("Team is required", 400);
  if (!["ppc", "manager"].includes(user.role)) {
    throw new AppError("Not authorized", 403);
  }

  const team =
    user.role === "manager"
      ? await Team.findOne({ _id: teamId, managerId: user._id })
      : await Team.findOne({ _id: teamId, members: user._id });

  if (!team) throw new AppError("Not authorized for this team", 403);

  const raw = await Campaign.create({
    createdBy:   user._id,
    message,
    requestedAt,
    teamId:      team._id,
  });

  // Populate before emitting so the socket payload has createdBy.username + managerId
  const campaign = await findPopulated(raw._id);
  // performer (user) carries managerId from authMiddleware for PPC routing
  emitCampaignCreated(campaign, user);
  return campaign;
};

// ── Get Campaign ───────────────────────────────────────────────────────────────
export const getCampaignService = async (user) => {
  if (user.role === "process manager") {
    return await Campaign.find().populate("createdBy", CREATOR_FIELDS);
  }

  if (user.role === "manager") {
    const teamDoc = await Team.findOne({ managerId: user._id });
    if (!teamDoc) {
      return await Campaign.find({ createdBy: user._id })
        .populate("createdBy", CREATOR_FIELDS);
    }
    return await Campaign.find({
      createdBy: { $in: [...teamDoc.members, user._id] },
    }).populate("createdBy", CREATOR_FIELDS);
  }

  if (user.role === "ppc") {
    return await Campaign.find({ createdBy: user._id })
      .populate("createdBy", CREATOR_FIELDS);
  }

  if (user.role === "it") {
    // Only approved campaigns whose scheduleAt has arrived (or has no scheduleAt),
    // and not cancelled by PPC/Manager after PM approved.
    const approved = await Campaign.find({
      action: "approve",
      status: { $ne: "cancel" },
    }).populate("createdBy", CREATOR_FIELDS);

    const now = Date.now();
    return approved.filter((c) => {
      if (!c.scheduleAt) return true;
      return new Date(c.scheduleAt).getTime() <= now;
    });
  }
};

// ── Update Campaign ────────────────────────────────────────────────────────────
export const updateCampaignService = async (
  user,
  campaignId,
  {
    message,
    status,
    requestedAt,
    pmMessage,
    action,
    scheduleAt,
    itMessage,
    acknowledgement,
  },
) => {
  const oldCampaign = await Campaign.findById(campaignId);
  if (!oldCampaign) throw new AppError("Campaign not found", 404);
  if (oldCampaign.status === "cancel")
    throw new AppError("Campaign is already cancelled", 400);

  // ── PPC / Manager ────────────────────────────────────────────────────────────
  if (["ppc", "manager"].includes(user.role)) {
    const raw = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { message, status, requestedAt } },
      { returnDocument: "after" },
    );
    const campaign = await findPopulated(raw._id);
    // performer (user) carries managerId for PPC routing in socket.js
    emitCampaignUpdated(campaign, user);
    return campaign;
  }

  // ── Process Manager ──────────────────────────────────────────────────────────
  if (user.role === "process manager") {
    if (action !== "cancel" && !pmMessage)
      throw new AppError("Message required", 400);

    const raw = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { pmMessage, action, scheduleAt } },
      { returnDocument: "after" },
    );
    // createdBy is populated with managerId so socket can route to owner's manager
    const campaign = await findPopulated(raw._id);

    if (action === "approve") {
      emitITQueued(campaign, user);
    } else {
      emitCampaignUpdated(campaign, user);
    }
    return campaign;
  }

  // ── IT ───────────────────────────────────────────────────────────────────────
  if (user.role === "it") {
    if (acknowledgement === "not done") {
      const raw = await Campaign.findByIdAndUpdate(
        campaignId,
        { $set: { acknowledgement, itMessage } },
        { returnDocument: "after" },
      );
      const campaign = await findPopulated(raw._id);
      emitITAck(campaign, user);
      return campaign;
    }

    if (!itMessage) throw new AppError("Message not found", 400);

    const raw = await Campaign.findByIdAndUpdate(
      campaignId,
      {
        $set: {
          acknowledgement,
          itMessage,
          action: "done",
          status: "done",
        },
      },
      { returnDocument: "after" },
    );
    const campaign = await findPopulated(raw._id);
    emitITAck(campaign, user);
    return campaign;
  }
};