import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
    teamName:{
        type:String
    },
    managerId:{
        type: mongoose.Schema.Types.ObjectId,
        ref:"User"
    }
}, { timestamps: true });
