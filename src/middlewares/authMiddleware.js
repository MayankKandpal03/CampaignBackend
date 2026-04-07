import { AppError, asyncWrap } from "../utils/errorHandler.js";
import User from "../models/userModel.js";
import jwt from "jsonwebtoken";

/**
 * Create a function to verify json web token
 * Access the token from req.cookie or req.header
 * If it doesn't exist throw error
 * If it exist then verify it with the Access token secret
 * Extract id from the token to check if user exist
 * If doesn't exist throw error otherwise call next()
 */

const verifyJWT = asyncWrap(async (req, res, next) => {
  // ?. prevents runtime error when accessing nested properties that may be null or undefined
  // Cookies are not always available that is why we use req.header to read value sent in HTTP request header
  // Authorization is a dedicated header for authentication credentials.
  const token =
    req.cookies?.accessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  // Check if the token exist
  if (!token) throw new AppError("Not authorized", 401);

  // Verify the token and store the token data in decoded token
  let decodedToken;
  try {
    decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch {
    throw new AppError("Invalid or expired token", 401);
  }

  // Extract id to find user
  const user = await User.findById(decodedToken?._id);
  if (!user) throw new AppError("Invalid Request", 401);
  req.user = user;
  next();
});

export default verifyJWT;
