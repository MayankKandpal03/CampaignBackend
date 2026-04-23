// src/services/campaignService.js  (backend)
import Campaign from "../models/campaignModel.js";
import Team from "../models/teamModel.js";
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
  if (!teamId) throw new AppError("Team is required", 400);
  if (!["ppc", "manager"].includes(user.role)) {
    throw new AppError("Not authorized", 403);
  }

  const team =
    user.role === "manager"
      ? await Team.findOne({ _id: teamId, managerId: user._id })
      : await Team.findOne({ _id: teamId, members: user._id });

  if (!team) throw new AppError("Not authorized for this team", 403);

  const raw = await Campaign.create({
    createdBy: user._id,
    message,
    // FIX: always store as UTC ISO string. requestedAt comes from the frontend
    // already converted to UTC ISO (see formatters.localToUTC).
    // Falls back to now() if not provided.
    requestedAt: requestedAt || new Date().toISOString(),
    teamId: team._id,
    // scheduleAt intentionally NOT set here — must remain empty until PM approves
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
    /**
     * FIX: IT only sees campaigns where:
     *  - action === "approve"
     *  - status is NOT "cancel"
     *  - not already acknowledged
     *  - scheduleAt is either not set (deliver immediately) OR has passed
     *
     * All scheduleAt values are UTC ISO strings so Date.now() comparison is correct.
     */
    const approved = await Campaign.find({
      action: "approve",
      status: { $ne: "cancel" },
    }).populate("createdBy", CREATOR_FIELDS);

    const now = Date.now();
    return approved.filter((c) => {
      if (c.acknowledgement) return false;
      if (!c.scheduleAt) return true; // no schedule → visible immediately
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
    if (oldCampaign.action === "approve") {
      const now = Date.now();
      const scheduleTime = oldCampaign.scheduleAt
        ? new Date(oldCampaign.scheduleAt).getTime()
        : 0;

      /**
       * FIX: If the schedule time has already passed, the campaign has been
       * delivered to IT — lock it completely.
       * If it has NOT passed yet, allow the edit/cancel but:
       *   - Cancel the pending delivery timer
       *   - Reset PM fields (scheduleAt, pmMessage, action) so PM must re-approve
       */
      const schedulePassed = !oldCampaign.scheduleAt || scheduleTime <= now;

      if (schedulePassed) {
        throw new AppError(
          "Campaign has been sent to IT and can no longer be modified",
          400,
        );
      }

      // Cancel the scheduled IT delivery before making changes
      cancelDelivery(campaignId);

      if (status === "cancel") {
        // PPC/Manager is cancelling before the schedule fires — allow it
        const raw = await Campaign.findByIdAndUpdate(
          campaignId,
          { $set: { status: "cancel" }, $unset: { action: 1, scheduleAt: 1 } },
          { returnDocument: "after" },
        );
        const campaign = await findPopulated(raw._id);
        emitCampaignUpdated(campaign, user);
        return campaign;
      }

      /**
       * PPC/Manager is editing before schedule time:
       * Reset PM fields so the PM must review and re-approve.
       * $unset removes scheduleAt, pmMessage, action entirely.
       */
      const raw = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $set: {
            message: message || oldCampaign.message,
            status: "transfer",
            requestedAt: requestedAt || oldCampaign.requestedAt,
          },
          $unset: { scheduleAt: 1, pmMessage: 1, action: 1 },
        },
        { returnDocument: "after" },
      );
      const campaign = await findPopulated(raw._id);
      emitCampaignUpdated(campaign, user);
      return campaign;
    }

    // Normal edit (not yet approved by PM)
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

    /**
     * PM approve — scheduleAt comes from the frontend already as a UTC ISO
     * string (via new Date(localValue).toISOString()).
     * Default to requestedAt if PM didn't change the schedule.
     */
    const resolvedScheduleAt =
      scheduleAt || oldCampaign.requestedAt || new Date().toISOString();

    const raw = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: { pmMessage, action, scheduleAt: resolvedScheduleAt } },
      { returnDocument: "after" },
    );
    const campaign = await findPopulated(raw._id);
    emitITQueued(campaign, user);
    return campaign;
  }

  // ── IT ───────────────────────────────────────────────────────────────────────
  if (user.role === "it") {
    if (acknowledgement === "not done") {
      cancelDelivery(campaignId);
      const raw = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $set: {
            acknowledgement,
            itMessage,
            status: "not done",
          },
        },
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