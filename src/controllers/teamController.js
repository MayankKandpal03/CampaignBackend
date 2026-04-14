import Team from "../models/teamModel.js";
import { asyncWrap, AppError } from "../utils/errorHandler.js";

/**
 * GET /api/v1/team/my
 * Returns the manager's team with populated member details.
 * Only the manager whose _id matches managerId can access their team.
 */
export const getMyTeamController = asyncWrap(async (req, res) => {
  const team = await Team.findOne({ managerId: req.user._id }).populate(
    "members",
    "username email role _id createdAt",
  );

  if (!team) throw new AppError("Team not found", 404);

  res.status(200).json({
    success: true,
    data: team,
    message: "Team fetched successfully",
  });
});