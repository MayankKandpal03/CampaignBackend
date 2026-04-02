import User from "../models/userModel.js";
import { AppError } from "../utils/errorHandler.js";
import jwt from "jsonwebtoken"
export const logoutService = async (user) => {
  await User.findByIdAndUpdate(
    user._id,
    { $set: { refreshToken: null } },
    { returnDocument: "after" }, // We set new = true to get new value in return
  );
};

export const refreshTokenService = async (incomingRefreshToken) => {
  if (!incomingRefreshToken) throw new AppError("Unauthorized", 401)
  
  const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
  const user = await User.findById(decoded._id).select("+refreshToken")
  
  if (!user || user.refreshToken !== incomingRefreshToken)
    throw new AppError("Invalid refresh token", 401)

  const accessToken = user.generateAccessToken()
  return { accessToken }
}

  