import Campaign from "../models/campaignModel.js";
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
  if (!message) throw new AppError("Message is required", 400);
  if (!teamId)  throw new AppError("Team is required", 400);
  if (!["ppc", "manager"].includes(user.role)) throw new AppError("Not authorized", 403);

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

  // Pass managerId so socket can target manager's personal room, not whole team room
  emitCampaignCreated(campaign, user, team.managerId);
  return campaign;
};

// ── Get Campaign ───────────────────────────────────────────────────────────────
export const getCampaignService = async (user) => {
  if (user.role === "process manager") {
    // FIX: populate createdBy so PM table can display creator's username
    return await Campaign.find()
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 })
      .lean();
  }

  if (user.role === "manager") {
    const teamDoc = await Team.findOne({ managerId: user._id });
    const query   = teamDoc
      ? { createdBy: { $in: [...teamDoc.members, user._id] } }
      : { createdBy: user._id };
    // FIX: populate createdBy so manager table can display creator's username
    return await Campaign.find(query)
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 })
      .lean();
  }

  if (user.role === "ppc") {
    return await Campaign.find({ createdBy: user._id })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (user.role === "it") {
    return await Campaign.find({ action: "approve" })
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 })
      .lean();
  }
};

// ── Update Campaign ────────────────────────────────────────────────────────────
export const updateCampaignService = async (
  user,
  campaignId,
  { message, status, requestedAt, pmMessage, action, scheduleAt, itMessage, acknowledgement },
) => {
  const oldCampaign = await Campaign.findById(campaignId);
  if (!oldCampaign) throw new AppError("Campaign not found", 404);
  if (oldCampaign.status === "cancel") throw new AppError("Campaign is already cancelled", 400);

  // Fetch team once so we can pass managerId to socket helpers
  const team = await Team.findById(oldCampaign.teamId).select("managerId").lean();
  const managerId = team?.managerId;

  // ── PPC / Manager ────────────────────────────────────────────────────────────
  if (["ppc", "manager"].includes(user.role)) {
    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { message, status, requestedAt } },
      { returnDocument: "after" },
    );
    emitCampaignUpdated(campaign, user, managerId);
    return campaign;
  }

  // ── Process Manager ──────────────────────────────────────────────────────────
  if (user.role === "process manager") {
    if (action !== "cancel" && !pmMessage) throw new AppError("Message required", 400);

    const updateFields = { pmMessage, action, scheduleAt };

    // FIX: When PM cancels, also set status to "cancel" so PPC can no longer edit.
    // Before this fix, status stayed "transfer" meaning PPC still saw the UPDATE button.
    if (action === "cancel") {
      updateFields.status = "cancel";
    }

    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: updateFields },
      { returnDocument: "after" },
    );

    if (action === "approve") {
      emitITQueued(campaign, user);
    } else {
      emitCampaignUpdated(campaign, user, managerId);
    }
    return campaign;
  }

  // ── IT ───────────────────────────────────────────────────────────────────────
  if (user.role === "it") {
    if (acknowledgement === "not done") {
      if (!itMessage) throw new AppError("Message not found", 400);
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { $set: { acknowledgement, itMessage } },
        { returnDocument: "after" },
      );
      emitITAck(campaign, user);
      return campaign;
    }

    if (!itMessage) throw new AppError("Message not found", 400);

    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { acknowledgement, itMessage, action: "done", status: "done" } },
      { returnDocument: "after" },
    );
    emitITAck(campaign, user);
    return campaign;
  }
};