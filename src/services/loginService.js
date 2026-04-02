import User from "../models/userModel.js";
import { AppError } from "../utils/errorHandler.js";

const loginService = async (email, password) => {
  /**
   * Validate input
   * Verify user existance by fetching User using email
   * Verify password -> use custom method created in userModel
   * Generate access and refresh token using custom methods created in userModel
   * Store refresh token in user model
   * Send secure response
   */

  // Validate Input
  if (!email || !password) throw new AppError("Fill all fields", 400);

  // Verify user
  const user = await User.findOne({ email });
  if (!user) throw new AppError("Invalid Credentials", 401);

  // Verify password
  const isMatch = await user.isPasswordCorrect(password);
  if (!isMatch) throw new AppError("Invalid Credentials", 401);

  // Generate Access and refresh token
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Store refresh token in user model
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return {
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    accessToken,
    refreshToken,
  };
};

export default loginService;
