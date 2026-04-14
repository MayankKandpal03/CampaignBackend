import { Router } from "express";
import verifyJWT from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/rbacMiddleware.js";
import { getMyTeamController } from "../controllers/teamController.js";

const router = Router();

// Only managers may query their own team
router.get("/my", verifyJWT, authorize("manager"), getMyTeamController);

export default router;