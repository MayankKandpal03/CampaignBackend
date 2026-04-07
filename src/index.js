import dotenv from "dotenv";
import app from "./app.js";
import connection from "./db/connectionDB.js";
import http from "http"

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


