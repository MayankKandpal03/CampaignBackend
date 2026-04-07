import {
  createUserService,
  deleteUserService,
} from "../services/userService.js";

import { asyncWrap } from "../utils/errorHandler.js";

// Create user controller
export const createUserController = asyncWrap(async (req, res) => {
  const creator = req.user;
  const { username, email, password, role, } = req.body;
  await createUserService(
    creator,
    username,
    email,
    password,
    role,
  );
  return res
    .status(200)
    .json({ success: true, message: "User created successfully" });
});

// Delete user controller
export const deleteUserController = asyncWrap(async (req, res) => {
  const creator = req.user;
  const { id } = req.body;
  const response = await deleteUserService(creator, id);
  if (!response)
    return res
      .status(400)
      .json({ success: false, message: "Not authorized to delete user" });
  return res.status(200).json({
    success: true,
    message: response.username + " deleted sucessfully",
  });
});
