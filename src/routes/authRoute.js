import { Router } from "express";
import logoutController from "../controllers/authController.js";

const router = Router();

router.post("/logout", logoutController);

export default router;