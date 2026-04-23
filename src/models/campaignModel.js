// ppc-> username message date-time (if null use created at) status
import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    requestedAt: {
      type: String,
      // Stores UTC ISO string — set by frontend or defaults to createdAt
      default: () => new Date().toISOString(),
    },
    // PPC
    status: {
      type: String,
      enum: ["transfer", "cancel", "done", "not done"],
      default: "transfer",
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
    },
    // Process manager
    action: {
      type: String,
      enum: ["approve", "cancel", "done"],
      // NO default — must remain unset until PM acts
    },
    /**
     * FIX: scheduleAt MUST have no default.
     * Previously `default: () => new Date()` caused every campaign to get
     * a scheduleAt on creation, hiding it from IT immediately.
     * Now it stays undefined until the PM explicitly sets it.
     * Always stored as a UTC ISO string (e.g. "2024-01-15T09:00:00.000Z").
     */
    scheduleAt: {
      type: String,
      default: undefined,
    },
    pmMessage: {
      type: String,
      trim: true,
    },
    // IT
    acknowledgement: {
      type: String,
      enum: ["done", "not done"],
    },
    itMessage: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;