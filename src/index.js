import dotenv from "dotenv";
import app from "./app.js";
import connection from "./db/connectionDB.js";
import {createServer} from "http"
import { Server } from "socket.io";

dotenv.config();

connection()
  .then(() => {
    const httpServer = createServer()
    
    // Create socket instance 
    const io = new Server(httpServer)
    io.on('connection', (socket)=>{
      console.log('Socket id:', socket);


      socket.on('disconnect',(reason)=>{
        console.log('Disconnected:', reason)
      })
    })

    // Listen to server
    httpServer.listen(process.env.PORT, () => {
      console.log("Server is running");
    });
  })
  .catch((e) => {
    console.log("Connection failure:", e);
  });


