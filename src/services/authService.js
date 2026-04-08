import User from "../models/userModel.js";
import { AppError } from "../utils/errorHandler.js";
import jwt from "jsonwebtoken";
export const logoutService = async (user) => {
  await User.findByIdAndUpdate(
    user._id,
    { $set: { refreshToken: null } },
    { returnDocument: "after" }, // We set new = true to get new value in return
  );
};

export const refreshTokenService = async (incomingRefreshToken) => {
  if (!incomingRefreshToken) throw new AppError("Unauthorized", 401);
  let decoded;
  try {
    decoded = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET,
    );
  } catch (error) {
    throw new AppError("Invalid refresh token", 401);
  }

  const user = await User.findById(decoded._id).select("+refreshToken");

  if (!user || user.refreshToken !== incomingRefreshToken)
    throw new AppError("Invalid refresh token", 401);

  const accessToken = user.generateAccessToken();
  const newRefreshToken = user.generateRefreshToken();
  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });
  return { accessToken, refreshToken: newRefreshToken };
};

export const changePasswordService = async (user, oldPassword, newPassword) => {
  if (!oldPassword || !newPassword) throw new AppError("Fill all fields", 400);

  // Fetch with passwordHash (select: false isn't set but good practice)
  const foundUser = await User.findById(user._id);
  if (!foundUser) throw new AppError("User not found", 404);

  // Use your existing custom method
  const isMatch = await foundUser.isPasswordCorrect(oldPassword);
  if (!isMatch) throw new AppError("Invalid old password", 401);

  // Assigning triggers the pre("save") bcrypt hook in userModel.js
  foundUser.passwordHash = newPassword;
  await foundUser.save({ validateBeforeSave: false });
};