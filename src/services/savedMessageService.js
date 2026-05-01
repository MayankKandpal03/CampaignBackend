// src/services/savedMessageService.js  (backend)
import SavedMessage from "../models/savedMessageModel.js";
import { AppError } from "../utils/errorHandler.js";

/** Create a new saved message (PM only). */
export const createSavedMessageService = async (userId, message) => {
  if (!message?.trim()) throw new AppError("Message is required", 400);
  return await SavedMessage.create({ message: message.trim(), createdBy: userId });
};

/** Get all saved messages, newest first. Visible to every PM. */
export const getAllSavedMessagesService = async () => {
  return await SavedMessage.find()
    .populate("createdBy", "username email _id")
    .sort({ createdAt: -1 });
};

/** Update the text of an existing saved message. */
export const updateSavedMessageService = async (id, message) => {
  if (!message?.trim()) throw new AppError("Message is required", 400);
  const msg = await SavedMessage.findByIdAndUpdate(
    id,
    { $set: { message: message.trim() } },
    { returnDocument: "after" },
  );
  if (!msg) throw new AppError("Message not found", 404);
  return msg;
};

/** Permanently delete a saved message by ID. */
export const deleteSavedMessageService = async (id) => {
  const msg = await SavedMessage.findByIdAndDelete(id);
  if (!msg) throw new AppError("Message not found", 404);
  return msg;
};
