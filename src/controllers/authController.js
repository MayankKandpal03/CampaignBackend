import {
  logoutService,
  refreshTokenService,
  changePasswordService,
} from "../services/authService.js";
import { asyncWrap } from "../utils/errorHandler.js";
import cookieOptions from "../utils/cookieOptions.js";

export const logoutController = asyncWrap(async (req, res) => {
  const user = req.user;
  await logoutService(user);

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json({ message: "User logged out sucessfully" });
});

export const refreshTokenController = asyncWrap(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken;
  const { accessToken, refreshToken } =
    await refreshTokenService(incomingRefreshToken);

  return res
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .status(200)
    .json({ success: true, accessToken });
});

export const changePasswordController = asyncWrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  await changePasswordService(req.user, oldPassword, newPassword);

  res
    .status(200)
    .json({ success: true, message: "Password changed successfully" });
});
