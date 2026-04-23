import dotenv from "dotenv";
import app from "./app.js";
import connection from "./db/connectionDB.js";
import { createServer } from "http";
import {
  initSocket,
  restoreScheduledDeliveries,
  restoreDailyTaskDeliveries,   // ← NEW
} from "./socket/socket.js";

dotenv.config();

connection()
  .then(() => {
    const httpServer = createServer(app);
    initSocket(httpServer);

    // Re-register campaign timers that were pending before restart
    restoreScheduledDeliveries();

    // Re-register recurring daily task timers after restart  ← NEW
    restoreDailyTaskDeliveries();

    httpServer.listen(process.env.PORT, () => {
      console.log("Server is running");
    });
  })
  .catch((e) => {
    console.log("Connection failure:", e);
  });