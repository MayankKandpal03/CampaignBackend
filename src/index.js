import dotenv from "dotenv";
import app from "./app.js";
import connection from "./db/connectionDB.js";
import { createServer } from "http";
import { initSocket } from "./socket/socket.js";

dotenv.config();

connection()
  .then(() => {
    const httpServer = createServer(app);
    initSocket(httpServer);
    httpServer.listen(process.env.PORT, () => {
      console.log("Server is running");
    });
  })
  .catch((e) => {
    console.log("Connection failure:", e);
  }
);