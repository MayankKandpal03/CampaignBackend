import Campaign from "../models/campaignModel.js";
import User from "../models/userModel.js";
import Team from "../models/teamModel.js";
import { AppError } from "../utils/errorHandler.js";

// Create Campaign
// set default value as undefined in case requested date and time is not shared and we want the default value
export const createCampaignService = async (
  user,
  message,
  requestedDate = undefined,
  requestedTime = undefined,
  teamId
) => {
  if (!message) throw new AppError("Message is required", 400);
  if(!teamId) throw new AppError("Not in the team")
  if (!["ppc", "manager"].includes(user.role))
    throw new AppError("Not Authorized", 400);
  await Campaign.create({
    createdBy: user._id,
    message,
    requestedDate,
    requestedTime,
    teamId,
  });
  return;
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
    const campaign = await Campaign.find();
    if (
      (campaign.action === "approve" &&
        campaign.scheduleDate === Date().toISOString().slice(0, 10),
      campaign.scheduleTime === Date().toISOString().slice(11, 19))
    ) {
      return campaign;
    }
  }
};

// Update Campaign
export const updateCampaignService = async (
  user,
  campaignId,
  {
    message,
    status,
    requestedDate,
    requestedTime,
    pmMessage,
    action,
    scheduleDate,
    scheduleTime,
    itMessage,
    acknowledgement,
  },
) => {
  // ppc or managers update message
  const oldCampaign = await Campaign.findByIdAndUpdate(campaignId);
  if (!oldCampaign) throw new AppError("Campaign not found", 404);
  if (oldCampaign.status === "cancel")
    throw new AppError("Campaign is already cancelled", 400);
  if (["ppc", "manager"].includes(user.role)) {
    const campaign = await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        message,
        status,
        requestedDate,
        requestedTime,
      },
    }, {returnDocument: "after"});
    return campaign;
  }
  // Process manager
  if (user.role === "process manager") {
    if (!pmMessage) throw new AppError("Message not found", 400);
    const campaign = await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        pmMessage,
        action,
        scheduleDate,
        scheduleTime,
      },
    }, {returnDocument: "after"});
    return campaign;
  }

  if (user.role === "it") {
    if (acknowledgement === "not done") {
      const campaign = await Campaign.findByIdAndUpdate(campaignId, {
        $set: { acknowledgement, itMessage },
      }, {returnDocument: "after"});
      return campaign;
    }
    if (!itMessage) throw new AppError("Message not found", 400);
    const campaign = await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        acknowledgement,
        itMessage,
        action: "done",
        status: "done",
      },
    }, {returnDocument: "after"});
    return campaign;
  }
};
