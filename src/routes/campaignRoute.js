import { Router } from "express";
import { createCampaignController, getCampaignController } from "../controllers/campaignController.js";

const router = Router();

router.post("/create", verifyJWT, authorize("ppc", "manager"), createCampaignController);
router.post("/get", verifyJWT, getCampaignController);

export default router;