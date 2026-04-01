import User from "../models/userModel.js";
import { AppError } from "../utils/errorHandler.js";

const logoutService = async (user) => {
  await User.findByIdAndUpdate(
    user._id,
    { $set: { refreshToken: undefined } },
    { new: true }, // We set new = true to get new value in return
  );
};

export default logoutService;
