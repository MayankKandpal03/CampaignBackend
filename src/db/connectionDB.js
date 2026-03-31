import mongoose from "mongoose";

const connection = async () => {
  try {
    await mongoose.connect(`${process.env.MONGODB_URI}campaign`);
    console.log("Successfully connected to database");
  } catch (error) {
    console.log("Mongoose Connection Error:", error);
    process.exit(1);
  }
};

export default connection;
