import { Router } from "express";
import {logoutController, refreshTokenController} from "../controllers/authController.js";
import verifyJWT from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/logout",verifyJWT, logoutController);
router.post("/refresh-token", verifyJWT, refreshTokenController)
export default router;