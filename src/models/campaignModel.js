// ppc-> username message date-time (if null use created at) status
import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    username: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    requestedTime: {
      type: Date,
      default: Date.now,
    },
    // PPC 
    status:{
        type: String,
        enum:["transfer, update, cancel"], // cancel permanent 
        default:"transfer"
    },
    // Process manager
    action:{
        type: String,
        enum:["transfer, cancel, done"] // roll back
    },
    // It
    acknowledgement:{
        type:String,
        enum:["Done", "Not_Done  "]
    }
  },
  { timestamps: true },
);
