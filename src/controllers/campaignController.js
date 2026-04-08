import Campaign from "../models/campaignModel.js";
import {
  createCampaignService,
  getCampaignService,
  updateCampaignService,
} from "../services/campaignService.js";
import { asyncWrap, AppError } from "../utils/errorHandler.js";

export const createCampaignController = asyncWrap(async (req, res) => {
  const user = req.user;
  const { message, requestedDate, requestedTime, teamId } = req.body;
  if (!message || !teamId) throw new AppError("Missing fields", 400);
  const result = await createCampaignService(user, message, requestedDate, requestedTime, teamId);
  res.status(200).json({
    success: true,
    data:result,
    message: "Campaign Created successfully",
  });
});

export const getCampaignController = asyncWrap(async (req, res) => {
  const user = req.user;
  const data = await getCampaignService(user);
  res.status(200).json({
    success: true,
    data,
    message: "Campaign fetched successfully",
  });
});

export const updateCampaignController = asyncWrap(async (req, res) => {
  const user = req.user;
  const {
    campaignId,
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
  } = req.body;
  const data = await updateCampaignService(user, campaignId, {
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
  });
  res.status(200).json({
    success: true,
    data,
    message: "Campaign updated successfully",
  });
});
