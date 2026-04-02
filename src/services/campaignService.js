import Campaign from "../models/campaignModel.js";
import User from "../models/userModel.js";
import Team from "../models/teamModel.js"
// Create Campaign
// set default value as undefined in case requested date and time is not shared and we want the default value
export const createCampaignService = async (
  user,
  message,
  requestedDate = undefined,
  requestedTime = undefined,
) => {
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
  if (user.role === "process manager") {
    const campaigns = await Campaign.find();
    return campaigns;
  }

  if (user.role === "manager") {
    const teamDoc = await Team.findOne({ managerId: user._id });
    const campaigns = await Campaign.find({
      createdBy: { $in: [...teamDoc.members, user._id] },
    });
    return campaigns;
  }

  if (user.role === "ppc") {
    const campaigns = await Campaign.find({ createdBy: user._id });
    return campaigns;
  }
};
