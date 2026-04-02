import { Router } from "express";
import logoutController from "../controllers/authController.js";
import verifyJWT from "../middlewares/authMiddleware.js";

const router = Router();

router.post("/logout",verifyJWT, logoutController);

export default router;