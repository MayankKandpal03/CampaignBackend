import { Router } from "express";
import { createCampaignController, getCampaignController } from "../controllers/campaignController.js";

const router = Router();

router.post("/create", createCampaignController);
router.post("/get", getCampaignController);

export default router;