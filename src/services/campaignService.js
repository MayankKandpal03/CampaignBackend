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
) => {
  if (!message) throw new AppError("Message is required", 400);
  if (!["ppc", "manager"].includes(user.role))
    throw new AppError("Not Authorized", 400);
  await Campaign.create({
    createdBy: user._id,
    message,
    requestedDate,
    requestedTime,
  });
  return;
};

// Get Campaign
export const getCampaignService = async (user) => {
  // Process manager
  if (user.role === "process manager") {
    const campaigns = await Campaign.find();
    return campaigns;
  }

  // manager
  if (user.role === "manager") {
    const teamDoc = await Team.findOne({ managerId: user._id });
    const campaigns = await Campaign.find({
      createdBy: { $in: [...teamDoc.members, user._id] },
    });
    return campaigns;
  }

  //ppc
  if (user.role === "ppc") {
    const campaigns = await Campaign.find({ createdBy: user._id });
    return campaigns;
  }

  //it
  if (user.role === "it") {
    const campaigns = await Campaign.find();
    if (
      (campaigns.action === "approve" &&
        campaigns.scheduleDate === Date().toISOString().slice(0, 10),
      campaigns.scheduleTime === Date().toISOString().slice(11, 19))
    ) {
      return campaigns;
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
  if (oldCampaign.status === "cancel")
    throw new AppError("Campaign is already cancelled", 400);
  if (["ppc", "manager"].includes(user.role)) {
    const campaigns = await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        message,
        status,
        requestedDate,
        requestedTime,
      },
    });
    return campaigns;
  }
  // Process manager
  if (user.role === "process manager") {
    if (!pmMessage) throw new AppError("Message not found", 400);
    const campaigns = await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        pmMessage,
        action,
        scheduleDate,
        scheduleTime,
      },
    });
    return campaigns;
  }

  if (user.role === "it") {
    if (acknowledgement === "not done") {
      const campaigns = await Campaign.findByIdAndUpdate(campaignId, {
        $set: { acknowledgement, itMessage },
      });
      return;
    }
    if (!itMessage) throw new AppError("Message not found", 400);
    const campaigns = await Campaign.findByIdAndUpdate(campaignId, {
      $set: {
        acknowledgement,
        itMessage,
        action: "done",
        status: "done",
      },
    });
    return campaigns;
  }
};
