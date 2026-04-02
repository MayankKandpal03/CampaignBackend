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
) => {
  // ───────────────── PM FLOW ─────────────────
  if (creator.role === "process manager") {
    // PM can create only manager, process manager, it
    if (!["manager", "process manager", "it"].includes(role)) {
      throw new AppError("Invalid role assignment", 400);
    }

    const newUser = await User.create({
      username,
      email,
      passwordHash: password,
      role,
    });

    // If creating manager → create team
    if (role === "manager") {
      const team = await Team.create({
        teamName: username,
        managerId: newUser._id,
        members: [newUser._id], // manager is part of team
      });

      // Link team to manager
      newUser.teams.push(team._id);
      await newUser.save({ validateBeforeSave: false });
    }

    return newUser;
  }

  // ──────────────── MANAGER FLOW ────────────────
  if (creator.role === "manager") {
    // Manager can only create PPC
    const newUser = await User.create({
      username,
      email,
      passwordHash: password,
      managerId: creator._id,
      // role defaults to "ppc" :contentReference[oaicite:0]{index=0}
    });

    // Find or create team
    const team = await Team.findOneAndUpdate(
      { managerId: creator._id },
      {
        $addToSet: {
          members: { $each: [creator._id, newUser._id] },
        },
      },
      { upsert: true, new: true },
    );

    // Link PPC to team
    newUser.teams.push(team._id);
    await newUser.save({ validateBeforeSave: false });

    // Ensure manager also has this team
    if (!creator.teams.includes(team._id)) {
      creator.teams.push(team._id);
      await creator.save({ validateBeforeSave: false });
    }

    return newUser;
  }

  throw new AppError("Not authorized to create user", 403);
};

// Delete user
export const deleteUserService = async (user, id) => {
  const delUser = await User.findById(id);
  if (!delUser) throw new AppError("User not found", 404);

  // ──────────────── PM DELETE ────────────────
  if (user.role === "process manager") {
    await User.findByIdAndDelete(id);

    // Remove from teams
    await Team.updateMany({ members: id }, { $pull: { members: id } });

    return delUser;
  }

  // ──────────────── MANAGER DELETE ────────────────
  if (user.role === "manager" && delUser.role === "ppc") {
    await User.findByIdAndDelete(id);

    // Remove PPC from team
    await Team.updateMany({ members: id }, { $pull: { members: id } });

    return delUser;
  }

  throw new AppError("Not authorized to delete user", 403);
};
