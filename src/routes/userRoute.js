import { Router } from "express";
import {
  createUserController,
  deleteUserController,
  listUsersController
} from "../controllers/userController.js";
import verifyJWT from "../middlewares/authMiddleware.js";
import authorize from "../middlewares/rbacMiddleware.js";

const router = Router();

router.post(
  "/create",
  verifyJWT,
  authorize("process manager", "manager"),
  createUserController,
);
router.post(
  "/delete",
  verifyJWT,
  authorize("process manager", "manager"),
  deleteUserController,
);

router.get(
  "/list",
  verifyJWT,
  authorize("process manager"),
  listUsersController,
);

export default router;
