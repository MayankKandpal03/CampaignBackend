// PM can create and delete managers, pm and it.
// Managers can create ppc and delete ppc.

import User from "../models/userModel.js";
import Team from "../models/teamModel.js";
import { AppError } from "../utils/errorHandler.js";
// Create user
export const createUserService = async (
  creator,
  username,
  email,
  password,
  role,
  managerId,
  team,
) => {
  if (creator.role === "process manager") {
    if (!["manager", "process manager", "it"].includes(role)) {
      throw new AppError("Invalid role assignment", 400);
    }
    const manager = await User.create({
      username,
      email,
      passwordHash: password,
      role,
    });
    const teamDoc = await Team.create({
      teamName: username,
      managerId: manager._id,
    });
    manager.teams.push(teamDoc._id);
    await manager.save({ validateBeforeSave: false });
  }
  if (creator.role === "manager") {
    const user = await User.create({
      username,
      email,
      passwordHash: password,
      managerId: creator._id,
    });

    await Team.findOneAndUpdate(
      { managerId: creator._id },
      { $push: { members: user._id } },
      { upsert: true, new: true },
    );
  }
};

// Delete user
export const deleteUserService = async (user, id) => {
  const delUser = await User.findById(id);
  if (!delUser) throw new AppError("Bad request",400);
 
  if (user.role === "process manager") {
    await User.findByIdAndDelete(id);
    return delUser;
  }
  if (user.role === "manager" && delUser.role === "ppc") {
    await User.findByIdAndDelete(id);
    return delUser;
  }
  return;
};

// export const changeTeam = async()=>{}
