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
import { cancelDelivery } from "../socket/campaignScheduler.js";

const CREATOR_FIELDS = "username email role _id managerId";

const findPopulated = (id) =>
  Campaign.findById(id).populate("createdBy", CREATOR_FIELDS);

// ── Create Campaign ────────────────────────────────────────────────────────────
export const createCampaignService = async (user, message, requestedAt, teamId) => {
  if (!message) throw new AppError("Message is required", 400);
  if (!teamId)  throw new AppError("Team is required", 400);
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

  const campaign = await findPopulated(raw._id);
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
    const approved = await Campaign.find({
      action: "approve",
      status: { $ne: "cancel" },
    }).populate("createdBy", CREATOR_FIELDS);

    const now = Date.now();
    return approved.filter((c) => {
      if (c.acknowledgement) return false;
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
    // Once the PM has approved (sent to IT), the campaign is locked.
    // PPC/Manager can no longer modify it regardless of whether schedule
    // time has passed or not.
    if (oldCampaign.action === "approve") {
      throw new AppError("Campaign has been sent to IT and can no longer be modified", 400);
    }

    const raw = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { message, status, requestedAt } },
      { returnDocument: "after" },
    );
    const campaign = await findPopulated(raw._id);
    emitCampaignUpdated(campaign, user);
    return campaign;
  }

  // ── Process Manager ──────────────────────────────────────────────────────────
  if (user.role === "process manager") {
    if (action !== "cancel" && !pmMessage)
      throw new AppError("Message required", 400);

    if (action === "cancel") {
      cancelDelivery(campaignId);
      const raw = await Campaign.findByIdAndUpdate(
        campaignId,
        { $set: { pmMessage, action, status: "cancel" } },
        { returnDocument: "after" },
      );
      const campaign = await findPopulated(raw._id);
      emitCampaignUpdated(campaign, user);
      return campaign;
    }

    // approve — schedule IT delivery
    const raw = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { pmMessage, action, scheduleAt } },
      { returnDocument: "after" },
    );
    const campaign = await findPopulated(raw._id);
    emitITQueued(campaign, user);
    return campaign;
  }

  // ── IT ───────────────────────────────────────────────────────────────────────
  if (user.role === "it") {
    // "not done": keep action as "approve", set status to "not done".
    if (acknowledgement === "not done") {
      cancelDelivery(campaignId);
      const raw = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $set: {
            acknowledgement,
            itMessage,
            status: "not done",
            // action intentionally kept as "approve"
          },
        },
        { returnDocument: "after" },
      );
      const campaign = await findPopulated(raw._id);
      emitITAck(campaign, user);
      return campaign;
    }

    // "done"
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