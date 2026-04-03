import dotenv from "dotenv";
import app from "./app.js";
import connection from "./db/connectionDB.js";

dotenv.config();

connection()
  .then(() => {
    app.listen(process.env.PORT, () => {
      console.log("Server is running");
    });
  })
  .catch((e) => {
    console.log("Connection failure:", e);
  });

app.use((err, req, res, next) => {
  res
    .status(err.statusCode || 500)
    .json({ success: false, message: err.message });
});
