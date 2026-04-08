import {
  logoutService,
  refreshTokenService,
  changePasswordService,
} from "../services/authService.js";
import { asyncWrap } from "../utils/errorHandler.js";

export const logoutController = asyncWrap(async (req, res) => {
  const user = req.user;
  console.log(user);
  await logoutService(user);
  const options = { httpOnly: true, secure: true };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json({ message: "User logged out sucessfully" });
});

export const refreshTokenController = asyncWrap(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken;
  const { accessToken, refreshToken } =
    await refreshTokenService(incomingRefreshToken);
  const options = { httpOnly: true, secure: true };
  return res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
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
