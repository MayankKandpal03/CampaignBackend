import Campaign from "../models/campaignModel.js";
import User from "../models/userModel.js";
import Team from "../models/teamModel.js";
import { AppError } from "../utils/errorHandler.js";
import {
  emitCampaignCreated,
  emitCampaignUpdated,
  emitITQueued,
  emitITAck,
} from "../socket/socket.js";
// Create Campaign
// set default value as undefined in case requestedAt is not shared and we want the default value
export const createCampaignService = async (
  user,
  message,
  requestedAt,
  teamId,
) => {
  if (!message) throw new AppError("Message is required", 400);
  if (!teamId) throw new AppError("Team is required", 400);
  if (!["ppc", "manager"].includes(user.role)) {
    throw new AppError("Not authorized", 403);
  }

  const team =
    user.role === "manager"
      ? await Team.findOne({ _id: teamId, managerId: user._id })
      : await Team.findOne({ _id: teamId, members: user._id });

  if (!team) {
    throw new AppError("Not authorized for this team", 403);
  }

  const campaign = await Campaign.create({
    createdBy: user._id,
    message,
    requestedAt,
    teamId: team._id,
  });
  
  emitCampaignCreated(campaign);
  return campaign;
};

// Get Campaign
export const getCampaignService = async (user) => {
  // Process manager
  if (user.role === "process manager") {
    const campaign = await Campaign.find();
    return campaign;
  }

  // manager
  if (user.role === "manager") {
    const teamDoc = await Team.findOne({ managerId: user._id });
    if (!teamDoc) {
      const campaign = await Campaign.find({
        createdBy: { $in: [user._id] },
      });
      return campaign;
    }
    const campaign = await Campaign.find({
      createdBy: { $in: [...teamDoc.members, user._id] },
    });
    return campaign;
  }

  //ppc
  if (user.role === "ppc") {
    const campaign = await Campaign.find({ createdBy: user._id });
    return campaign;
  }

  //it
  if (user.role === "it") {
    const campaign = await Campaign.find({
      action: "approve",
    });
    return campaign;
  }
};

// Update Campaign
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
  // ppc or managers update message
  const oldCampaign = await Campaign.findById(campaignId);
  if (!oldCampaign) throw new AppError("Campaign not found", 404);
  if (oldCampaign.status === "cancel")
    throw new AppError("Campaign is already cancelled", 400);
  if (["ppc", "manager"].includes(user.role)) {
    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      {
        $set: {
          message,
          status,
          requestedAt,
        },
      },
      { returnDocument: "after" },
    );
    emitCampaignUpdated(campaign);
    return campaign;
  }
  // Process manager
  if (user.role === "process manager") {
    if (action !== "cancel" && !pmMessage)
      throw new AppError("Message required", 400);
    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      {
        $set: {
          pmMessage,
          action,
          scheduleAt,
        },
      },
      { returnDocument: "after" },
    );
    if (action === "approve") emitITQueued(campaign);
    else emitCampaignUpdated(campaign);
    return campaign;
  }

  if (user.role === "it") {
    if (acknowledgement === "not done") {
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $set: { acknowledgement, itMessage },
        },
        { returnDocument: "after" },
      );
      emitITAck(campaign);
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
    emitITAck(campaign);
    return campaign;
  }
};
