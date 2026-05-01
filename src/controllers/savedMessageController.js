// src/controllers/savedMessageController.js
import { asyncWrap, AppError } from "../utils/errorHandler.js";
import {
  createSavedMessageService,
  getAllSavedMessagesService,
  updateSavedMessageService,
  deleteSavedMessageService,
} from "../services/savedMessageService.js";

/** POST /api/v1/saved-messages/create */
export const createSavedMessageController = asyncWrap(async (req, res) => {
  const { message } = req.body;
  if (!message) throw new AppError("Message is required", 400);
  const data = await createSavedMessageService(req.user._id, message);
  res.status(201).json({ success: true, data, message: "Message saved successfully" });
});

/** GET /api/v1/saved-messages/list */
export const getAllSavedMessagesController = asyncWrap(async (req, res) => {
  const data = await getAllSavedMessagesService();
  res.status(200).json({ success: true, data });
});

/** POST /api/v1/saved-messages/update */
export const updateSavedMessageController = asyncWrap(async (req, res) => {
  const { id, message } = req.body;
  if (!id) throw new AppError("Message ID is required", 400);
  const data = await updateSavedMessageService(id, message);
  res.status(200).json({ success: true, data, message: "Message updated successfully" });
});

/** POST /api/v1/saved-messages/delete */
export const deleteSavedMessageController = asyncWrap(async (req, res) => {
  const { id } = req.body;
  if (!id) throw new AppError("Message ID is required", 400);
  await deleteSavedMessageService(id);
  res.status(200).json({ success: true, message: "Message deleted successfully" });
});
