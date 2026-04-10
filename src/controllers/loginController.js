import loginService from "../services/loginService.js";
import { asyncWrap } from "../utils/errorHandler.js";
import cookieOptions from "../utils/cookieOptions.js";

const loginController = asyncWrap(async (req, res) => {
  const { email, password } = req.body;
  const response = await loginService(email, password);
  const { user, accessToken, refreshToken } = response;

  return res
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .status(200)
    .json({ success: true, user });
});

export default loginController;
