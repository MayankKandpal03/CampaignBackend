import { Router } from "express";
import {
  createTaskController,
  setInactiveController,
  getTasksController,
  acknowledgeTaskController,
} from "../controllers/dailyTaskController.js";
import verifyJWT  from "../middlewares/authMiddleware.js";
import authorize  from "../middlewares/rbacMiddleware.js";

const router = Router();

// PM creates a daily recurring task
router.post(
  "/create",
  verifyJWT,
  authorize("process manager"),
  createTaskController,
);

// PM deactivates a task (stops daily delivery)
router.post(
  "/deactivate",
  verifyJWT,
  authorize("process manager"),
  setInactiveController,
);

// PM → all tasks; IT → due tasks not yet acknowledged today
router.get(
  "/list",
  verifyJWT,
  authorize("process manager", "it"),
  getTasksController,
);

// IT acknowledges a daily task
router.post(
  "/acknowledge",
  verifyJWT,
  authorize("it"),
  acknowledgeTaskController,
);

export default router;