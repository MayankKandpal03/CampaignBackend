import Campaign from "../models/campaignModel.js";
import User     from "../models/userModel.js";
import Team     from "../models/teamModel.js";
import { AppError } from "../utils/errorHandler.js";
import {
  emitCampaignCreated,
  emitCampaignUpdated,
  emitITQueued,
  emitITAck,
} from "../socket/socket.js";

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

  const campaign = await Campaign.create({
    createdBy:   user._id,
    message,
    requestedAt,
    teamId:      team._id,
  });

  // FIX: pass `user` as performer so socket payload includes performerName
  emitCampaignCreated(campaign, user);
  return campaign;
};

// ── Get Campaign ───────────────────────────────────────────────────────────────
export const getCampaignService = async (user) => {
  if (user.role === "process manager") {
    return await Campaign.find();
  }

  if (user.role === "manager") {
    const teamDoc = await Team.findOne({ managerId: user._id });
    if (!teamDoc) {
      return await Campaign.find({ createdBy: { $in: [user._id] } });
    }
    return await Campaign.find({
      createdBy: { $in: [...teamDoc.members, user._id] },
    });
  }

  if (user.role === "ppc") {
    return await Campaign.find({ createdBy: user._id });
  }

  if (user.role === "it") {
    return await Campaign.find({ action: "approve" });
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
    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { message, status, requestedAt } },
      { returnDocument: "after" },
    );
    // FIX: pass `user` as performer
    emitCampaignUpdated(campaign, user);
    return campaign;
  }

  // ── Process Manager ──────────────────────────────────────────────────────────
  if (user.role === "process manager") {
    if (action !== "cancel" && !pmMessage)
      throw new AppError("Message required", 400);

    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { pmMessage, action, scheduleAt } },
      { returnDocument: "after" },
    );

    // FIX: pass `user` as performer for correct notification text
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
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { $set: { acknowledgement, itMessage } },
        { returnDocument: "after" },
      );
      // FIX: pass `user` as performer
      emitITAck(campaign, user);
      return campaign;
    }

    if (!itMessage) throw new AppError("Message not found", 400);

    const campaign = await Campaign.findByIdAndUpdate(
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
    // FIX: pass `user` as performer
    emitITAck(campaign, user);
    return campaign;
  }
};