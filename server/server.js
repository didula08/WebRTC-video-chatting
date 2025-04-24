const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  let currentRoom = null;

  socket.on("join-room", (roomId, username) => {
    console.log(`User ${socket.id} attempting to join room ${roomId}`);

    currentRoom = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    socket.join(roomId);
    const isHost = rooms[roomId].length === 0;
    rooms[roomId].push({
      id: socket.id,
      username: username || "Guest",
      isHost: isHost
    });

    socket.to(roomId).emit("user-connected", socket.id, username);

    socket.emit("room-users", {
      users: rooms[roomId].filter((user) => user.id !== socket.id),
      isHost: isHost
    });

    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on("send-message", (messageData) => {
    if (!currentRoom) return;
    
    // Add sender info to the message
    const user = rooms[currentRoom]?.find(u => u.id === socket.id);
    if (!user) return;
    
    const fullMessage = {
      ...messageData,
      senderId: socket.id,
      username: user.username,
      isHost: user.isHost,
      timestamp: new Date().toISOString()
    };

    // Broadcast to everyone in the room including sender
    io.to(currentRoom).emit("receive-message", fullMessage);
  });

  socket.on("offer", (offer, targetId) => {
    console.log(`Forwarding offer from ${socket.id} to ${targetId}`);
    socket.to(targetId).emit("offer", offer, socket.id);
  });

  socket.on("answer", (answer, targetId) => {
    console.log(`Forwarding answer from ${socket.id} to ${targetId}`);
    socket.to(targetId).emit("answer", answer, socket.id);
  });

  socket.on("ice-candidate", (candidate, targetId) => {
    console.log(`Forwarding ICE candidate from ${socket.id} to ${targetId}`);
    socket.to(targetId).emit("ice-candidate", candidate, socket.id);
  });

  socket.on("leave-room", () => {
    handleDisconnect();
  });

  const handleDisconnect = () => {
    if (currentRoom && rooms[currentRoom]) {
      console.log(`User ${socket.id} left room ${currentRoom}`);

      const user = rooms[currentRoom].find((u) => u.id === socket.id);
      const username = user ? user.username : "Guest";

      rooms[currentRoom] = rooms[currentRoom].filter((user) => user.id !== socket.id);

      if (rooms[currentRoom].length === 0) {
        delete rooms[currentRoom];
      } else {
        socket.to(currentRoom).emit("user-disconnected", socket.id, username);
      }

      socket.leave(currentRoom);
      currentRoom = null;
    }
  };

  socket.on("disconnect", handleDisconnect);
});

server.on("error", (error) => {
  console.error("Server error:", error);
});

const PORT = process.env.PORT || 3479;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});