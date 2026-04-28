//   See user model to understand syntax properly
import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    // PPC and Manager
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
      default: () => new Date().toISOString(), // Stores UTC ISO string — set by frontend or defaults to createdAt
    },
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
    },
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