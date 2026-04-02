import { createCampaignService, getCampaignService } from "../services/campaignService.js";
import { asyncWrap } from "../utils/errorHandler.js";

export const createCampaignController = asyncWrap(async(req,res)=>{
    const user=  req.user 
    const {message, requestedDate, requestedTime} =req.body
     await createCampaignService(user, message, requestedDate, requestedTime)
     res.status(200).json({
        success: true,
        message: "User Created successfully"
     })
})

export const getCampaignController = asyncWrap(async(req,res)=>{
     const user =req.user
     const data = await getCampaignService(user, message, requestedDate, requestedTime)
     res.status(200).json({
        success: true,
        data,
        message: "Campaign fetched successfully"
     })
})