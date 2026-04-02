// PM can create and delete managers, pm and it.
// Managers can create ppc and delete ppc.

import User from "../models/userModel.js";
import Team from "../models/teamModel.js";

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
    await User.create({
      username,
      email,
      passwordHash: password,
      role,
      teams: team,
    });
  }
  if (creator.role === "manager") {
    await User.create({
      username,
      email,
      passwordHash: password,
      managerId: creator._id,
    });
  }
};

// Delete user
export const deleteUserService = async (user, id) => {
  const delUser = User.findById(id);
  if (user.role === "process manager") {
    await User.findByIdAndDelete(id);
    return {
      delUser,
    };
  }
  if (user.role === "manager" && delUser.role === "ppc") {
    await User.findByIdAndDelete(id);
    return {
      delUser,
    };
  }
  return;
};

// export const changeTeam = async()=>{}
