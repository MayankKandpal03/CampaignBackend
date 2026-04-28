// Import mongoose, bcrypt and jwt
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Create Schema -> new mongoose.Schema({field: properties})
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,   // type is used to set data type
      required: true, // It is used to set it required
      trim: true,     // trim whitespaces
    },
    email: {
      type: String,
      required: true,
      lowercase: true, // set everything to lowercase
      trim: true,
      unique: true,    // need unique entry and also indexes the fields
    },
    passwordHash: {    // Used to store hash password
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      required: true,
      default: "ppc",   // Used to set default value
      enum: ["ppc", "manager", "process manager", "it"], // Used to set allowed values
    },
    managerId: {
      type: mongoose.Schema.Types.ObjectId,  // It is used to set type to unique_id
      ref: "User",                           // Used to set refrence of that unique_id
      default: null,
    },
    teams: [      // Array with properties inside it as object
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
    refreshToken: {
      type: String,
      select: false, // It is used to not send this field back as data unless asked explicitlly 
      default: null,
    },
  },
  { timestamps: true }, // Create two fields -> created At and updated At
);

// Create pre middleware
userSchema.pre("save", async function () {     // A pre middleware that runs when document is saved or created
  if (!this.isModified("passwordHash")) return;

  // Hash password using bcrypt -> bcrypt.hash(this.passwordHash, salt)
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
});

// Custom methods -> We use .methods to create custom methods
// Custom methods -> matchPassword, jwt access token and refresh token generation
// Here userSchema is the schema we are attaching this method to and isPasswordCorrect is the name of method
userSchema.methods.isPasswordCorrect = async function (password) {   
  return bcrypt.compare(password, this.passwordHash); // We use bcrypt.compare to compare password accept two fields, (input password, stored password)
};

userSchema.methods.generateAccessToken = function () { 
  return jwt.sign(                                                 // We use jwt.sign({}) to create jwt tokens it takes
    { _id: this._id, username: this.username, email: this.email }, // Payload
    process.env.ACCESS_TOKEN_SECRET,                               // secret
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY },                // options -> here we have used expiresIn to set expiry
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, username: this.username, email: this.email },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY },
  );
};

// Create User model -> mongoose.model("modelName", schema)
const User = mongoose.model("User", userSchema);

// Export the model
export default User;
