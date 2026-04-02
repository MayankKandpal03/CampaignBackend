import Campaign from "../models/campaignModel.js"
import User from "../models/userModel.js"
// Create Campaign
// set default value as undefined in case requested date and time is not shared and we want the default value
export const createCampaignService = async(user,message, requestedDate =undefined, requestedTime=undefined)=>{
    await Campaign.create({createdBy:user, message, requestedDate, requestedTime})
    return
}

// Get Campaign
export const getCampaignService = async(user)=>{
    if (user.role === "process manager"){
        const campaigns = await Campaign.find()
        return campaigns
    }

    if(user.role === "manager"){
        
    }

    if(user.role === "ppc"){
        const campaigns = await Campaign.find({id:user.id})
        return campaigns
    }
}