// Import mongoose, bcrypt and jwt
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Create Schema
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      match: /^[^\s@]+@(satkartar|skinrange)\.(com|in)$/,
    },
    passwordHash: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      default: "ppc",
      enum: ["ppc", "manager", "process_manager", "it"],
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
    refreshToken: {
      type: String,
      select: false,
      default: null,
    },
  },
  { timestamps: true },
);

// Create pre middleware
userSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;

  // Hash password
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

// Custom methods -> We use .methods to create custom methods
// Custom methods -> matchPassword, jwt access token and refresh token generation
userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, username: this.username, email: this.email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY },
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, username: this.username, email: this.email },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY },
  );
};

// Create User model
const User = mongoose.model("User", userSchema);

export default User;
