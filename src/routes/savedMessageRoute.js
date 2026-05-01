// src/routes/savedMessageRoute.js
import { Router } from "express";
import verifyJWT  from "../middlewares/authMiddleware.js";
import authorize  from "../middlewares/rbacMiddleware.js";
import {
  createSavedMessageController,
  getAllSavedMessagesController,
  updateSavedMessageController,
  deleteSavedMessageController,
} from "../controllers/savedMessageController.js";

const router = Router();

// All routes: JWT-protected + PM only
router.post("/create", verifyJWT, authorize("process manager"), createSavedMessageController);
router.get ("/list",   verifyJWT, authorize("process manager"), getAllSavedMessagesController);
router.post("/update", verifyJWT, authorize("process manager"), updateSavedMessageController);
router.post("/delete", verifyJWT, authorize("process manager"), deleteSavedMessageController);

export default router;
