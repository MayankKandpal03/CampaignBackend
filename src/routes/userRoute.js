import { Router } from "express";
import { createUserController, deleteUserController } from "../controllers/userController.js";
import  verifyJwt from "../middlewares/authMiddleware.js"
import authorize from "../middlewares/rbacMiddleware.js";

const router = Router();

router.post("/create",verifyJwt, authorize("process manager", "manager"), createUserController)
router.post("/delete",verifyJwt, authorize("process manager", "manager"), deleteUserController)

export default router;