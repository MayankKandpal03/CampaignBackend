// Creating this file for authorization. Only the allowed person will be able to perform action

/**
 * Create a higher order function authorize (It is higher order because it needs to accept different role). Inside that function:
 * Return a function(req,res,next)
 * Verify if req.user exist, if not throw error not authenticated
 * Verify allowed roles using .include, if not verified throw error
 * export function
 */

import { AppError } from "../utils/errorHandler";

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) throw new AppError("Not authenticated", 401);
    if (!allowedRoles.includes(req.user.role))
      throw new AppError("Access Denied", 403);
    next();
  };
};

export default authorize;