//   See user model to understand syntax properly
import mongoose from "mongoose";

const dailyTaskSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    task: {
      type: String,
      required: true,
      trim: true,
    },
    // "HH:MM" 24-hour string — the daily delivery time
    time: {
      type: String,
      required: true,
    },
    // Each entry is one IT acknowledgement
    itResponse: [
      {
        message:       { type: String },
        acknowledgedAt:{ type: Date, default: Date.now },
      },
    ],
    isSchedule: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const DailyTask = mongoose.model("DailyTask", dailyTaskSchema);

export default DailyTask;