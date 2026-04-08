import { Router } from "express";
import {logoutController, refreshTokenController,changePasswordController} from "../controllers/authController.js";
import verifyJWT from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/logout",verifyJWT, logoutController);
router.post("/refresh-token", refreshTokenController)
router.post("/change-password", verifyJWT, changePasswordController);

export default router;