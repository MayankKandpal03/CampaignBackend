import dotenv from "dotenv";
import app from "./app.js";
import connection from "./db/connectionDB.js";
import { createServer } from "http";
import { initSocket, restoreScheduledDeliveries } from "./socket/socket.js";

dotenv.config();

connection()
  .then(() => {
    const httpServer = createServer(app);
    initSocket(httpServer);

    // Re-register any scheduled IT deliveries that were pending before this
    // process started (handles server restarts gracefully).
    restoreScheduledDeliveries();

    httpServer.listen(process.env.PORT, () => {
      console.log("Server is running");
    });
  })
  .catch((e) => {
    console.log("Connection failure:", e);
  });