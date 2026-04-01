import loginService from "../services/loginService.js";
import { asyncWrap } from "../utils/errorHandler.js";

const loginController = asyncWrap(async (req, res) => {
  const { email, password } = req.body;
  const response = await loginService(email, password);
  const { user, accessToken, refreshToken } = response;
  const options = { httpOnly: true, secure: true };
  return res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .status(200)
    .json({ success: true, user });
});

export default loginController;
