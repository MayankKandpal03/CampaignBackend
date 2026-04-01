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
    requestedDate: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10),
    },
    requestedTime: {
      type: String,
      default: () => new Date().toISOString().slice(11, 19),
    },
    // PPC
    status: {
      type: String,
      enum: ["transfer", "cancel", "done", "not done"], // cancel permanent
      default: "transfer",
    },
    // Process manager
    action: {
      type: String,
      enum: ["approve", "cancel", "done"], // roll back
    },
    scheduleDate: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10),
    },
    scheduleTime: {
      type: String,
      default: () => new Date().toISOString().slice(11, 19),
    },
    pmMessage: {
      type: String,
      trim: true,
    },
    // It
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
