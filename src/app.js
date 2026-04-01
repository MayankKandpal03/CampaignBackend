import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

// Middlewares
app.use(cors({ origin: "*", credentials: true }));
app.use(cookieParser());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "16kb" }));

// Import routes
import loginRouter from "./routes/loginRoute.js";

// Use routes
app.use("/api/v1", loginRouter)