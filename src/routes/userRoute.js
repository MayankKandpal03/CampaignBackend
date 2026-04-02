import { Router } from "express";
import { createUserController, deleteUserController } from "../controllers/userController.js";
import  verifyJWT from "../middlewares/authMiddleware.js"
import authorize from "../middlewares/rbacMiddleware.js";

const router = Router();

router.post("/create",verifyJWT, authorize("process manager", "manager"), createUserController)
router.post("/delete",verifyJWT, authorize("process manager", "manager"), deleteUserController)

export default router;