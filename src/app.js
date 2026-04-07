import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

// Middlewares
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(cookieParser());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));

// Import routes
import loginRouter from "./routes/loginRoute.js";
import logoutRouter from "./routes/authRoute.js";
import userRouter from "./routes/userRoute.js";
import campaignRouter from "./routes/campaignRoute.js";
// Use routes
app.use("/api/v1", loginRouter);
app.use("/api/v1", logoutRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1/campaign", campaignRouter);

// Global error handler
app.use((err, req, res, next) => {
  res
    .status(err.statusCode || 500)
    .json({ success: false, message: err.message });
});

export default app;
