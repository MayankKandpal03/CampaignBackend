import {
  createTask,
  setInactive,
  getAllTasksForPM,
  getDueTasksForIT,
  acknowledgeTask,
} from "../services/dailyTaskService.js";
import { AppError, asyncWrap } from "../utils/errorHandler.js";

// POST /api/v1/task/create  (PM only)
export const createTaskController = asyncWrap(async (req, res) => {
  const { task, time } = req.body;
  if (!task || !time) throw new AppError("Missing required fields", 400);

  const data = await createTask(req.user._id, task, time);
  res.status(200).json({ success: true, response: data });
});

// POST /api/v1/task/deactivate  (PM only)
export const setInactiveController = asyncWrap(async (req, res) => {
  const { id } = req.body;
  if (!id) throw new AppError("ID not found", 404);

  const data = await setInactive(id);
  res.status(200).json({ success: true, response: data });
});

// GET /api/v1/task/list
//   PM  → all tasks (active + inactive) for management
//   IT  → only tasks due right now, not yet acknowledged today
export const getTasksController = asyncWrap(async (req, res) => {
  const data =
    req.user.role === "process manager"
      ? await getAllTasksForPM()
      : await getDueTasksForIT();

  res.status(200).json({ success: true, data });
});

// POST /api/v1/task/acknowledge  (IT only)
export const acknowledgeTaskController = asyncWrap(async (req, res) => {
  const { id, message } = req.body;
  if (!id) throw new AppError("Task ID is required", 400);

  const data = await acknowledgeTask(id, message, req.user);
  res.status(200).json({ success: true, response: data });
});