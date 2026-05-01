// src/models/savedMessageModel.js
import mongoose from "mongoose";

const savedMessageSchema = new mongoose.Schema(
  {
    message: {
      type:     String,
      required: true,
      trim:     true,
    },
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
  },
  { timestamps: true },
);

const SavedMessage = mongoose.model("SavedMessage", savedMessageSchema);

export default SavedMessage;
