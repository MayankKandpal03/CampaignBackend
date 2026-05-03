// src/app.js
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

const app = express();

const configuredOrigins = process.env.CLIENT_URL?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = configuredOrigins?.length
  ? configuredOrigins
  : [
      "http://localhost:5173",
      "https://satkartarcampaign.vercel.app",
    ];
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));

import loginRouter from "./routes/loginRoute.js";
import logoutRouter from "./routes/authRoute.js";
import userRouter from "./routes/userRoute.js";
import campaignRouter from "./routes/campaignRoute.js";
import teamRouter from "./routes/teamRoute.js";
import taskRouter from "./routes/dailyTaskRoute.js";
import pushRouter from "./routes/pushRoute.js";
import savedMessageRouter from "./routes/savedMessageRoute.js"; // ← NEW

app.use("/api/v1", loginRouter);
app.use("/api/v1", logoutRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/campaign", campaignRouter);
app.use("/api/v1/team", teamRouter);
app.use("/api/v1/task", taskRouter);
app.use("/api/v1/push", pushRouter);
app.use("/api/v1/saved-messages", savedMessageRouter); // ← NEW

app.use((err, req, res, next) => {
  res
    .status(err.statusCode || 500)
    .json({ success: false, message: err.message });
});

export default app;
