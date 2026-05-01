import { Router } from "express";
import {
  createCampaignController,
  getCampaignController,
  updateCampaignController,
  getITHistoryController,          // ← NEW
} from "../controllers/campaignController.js";
import verifyJWT  from "../middlewares/authMiddleware.js";
import authorize  from "../middlewares/rbacMiddleware.js";

const router = Router();

router.post("/create", verifyJWT, authorize("ppc", "manager"),           createCampaignController);
router.get ("/get",    verifyJWT,                                        getCampaignController);
router.post("/update", verifyJWT,                                        updateCampaignController);
router.get ("/history",verifyJWT, authorize("it"),                       getITHistoryController); // ← NEW

export default router;