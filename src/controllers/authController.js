import logoutService from "../services/authService.js";
import { asyncWrap } from "../utils/errorHandler.js";

const logoutController = asyncWrap(async (req, res) => {
  const user = req.user;
  console.log(user);
  await logoutService(user);
  const options = { httpOnly: true, secure: true };
 
  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json({message:"User logged out sucessfully"})
});

export default logoutController