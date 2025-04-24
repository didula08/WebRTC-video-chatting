const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// State variables
let localStream;
let peerConnections = {};
let roomId;
let username;
let isHost = false;
let peerUsernames = {};
let screenStream = null;
let isScreenSharing = false;
let participants = [];

// DOM Elements
const videosGrid = document.getElementById("videos-grid");
const micButton = document.getElementById("micButton");
const cameraButton = document.getElementById("cameraButton");
const screenShareButton = document.getElementById("screenShareButton");
const participantsButton = document.getElementById("participantsButton");
const chatButton = document.getElementById("chatButton");
const leaveButton = document.getElementById("leaveButton");
const chatContainer = document.getElementById("chat-container");
const participantsContainer = document.getElementById("participants-container");
const chatbox = document.getElementById("chatbox");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const closeChat = document.getElementById("close-chat");
const closeParticipants = document.getElementById("close-participants");
const participantsList = document.getElementById("participants-list");
const participantsCount = document.getElementById("participants-count");
const participantsCountHeader = document.getElementById("participants-count-header");
const screenShareStatus = document.getElementById("screen-share-status");
const createMeetingButton = document.getElementById("createMeetingButton");

// ICE Servers configuration
const iceServers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    {
      urls: "turn:numb.viagenie.ca",
      username: "your-turn-username",
      credential: "your-turn-password",
    },
  ],
};

// Initialize the application
window.onload = async () => {
  // Get room ID from URL
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);
  roomId = urlParams.get("room");

  // Get user settings from localStorage
  username = localStorage.getItem("username") || "Guest";
  const enableVideo = localStorage.getItem("enableVideo") !== "false";
  const enableAudio = localStorage.getItem("enableAudio") !== "false";

  // Set up event listeners
  setupEventListeners();

  try {
    // Initialize media devices
    localStream = await navigator.mediaDevices.getUserMedia({
      video: enableVideo,
      audio: enableAudio,
    });

    // Create local video element
    createVideoElement(socket.id, localStream, username, true);

    // Update UI based on media states
    updateMediaButtons(enableAudio, enableVideo);

    // Join the room
    socket.emit("join-room", roomId, username);

    // Add self to participants list
    addParticipant({
      id: socket.id,
      username: username,
      isHost: isHost,
    });
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert(
      "Could not access camera or microphone. Please check permissions or try again."
    );

    // Join room without media
    socket.emit("join-room", roomId, username);
    addParticipant({
      id: socket.id,
      username: username,
      isHost: isHost,
    });
  }
};

// Set up all event listeners
function setupEventListeners() {
  // Control buttons
  micButton.addEventListener("click", toggleMic);
  cameraButton.addEventListener("click", toggleCamera);
  screenShareButton.addEventListener("click", toggleScreenShare);
  participantsButton.addEventListener("click", toggleParticipants);
  chatButton.addEventListener("click", toggleChat);
  leaveButton.addEventListener("click", endCall);
  createMeetingButton.addEventListener("click", createNewMeeting);

  // Chat elements
  closeChat.addEventListener("click", toggleChat);
  sendButton.addEventListener("click", sendMessage);
  messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Participants elements
  closeParticipants.addEventListener("click", toggleParticipants);
}

// Create a video element for a participant
function createVideoElement(userId, stream, username, isLocal = false) {
  // Remove existing video element if it exists
  const existingContainer = document.getElementById(`video-container-${userId}`);
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create new video container
  const videoContainer = document.createElement("div");
  videoContainer.id = `video-container-${userId}`;
  videoContainer.className = "video-container";

  // Create video element
  const videoElement = document.createElement("video");
  videoElement.id = `video-${userId}`;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  videoElement.srcObject = stream;

  // Create video info overlay
  const videoInfo = document.createElement("div");
  videoInfo.className = "video-info";

  // Add mute icon if audio is not available
  if (!stream.getAudioTracks()[0]?.enabled) {
    const muteIcon = document.createElement("i");
    muteIcon.className = "fas fa-microphone-slash";
    videoInfo.appendChild(muteIcon);
  }

  // Add username
  const usernameSpan = document.createElement("span");
  usernameSpan.className = "username";
  usernameSpan.textContent = username;
  videoInfo.appendChild(usernameSpan);

  // Add "You" badge for local video
  if (isLocal) {
    const youBadge = document.createElement("span");
    youBadge.className = "you-badge";
    youBadge.textContent = "You";
    videoInfo.appendChild(youBadge);
  }

  // Add video muted overlay if video is not available
  if (!stream.getVideoTracks()[0]?.enabled) {
    const videoMutedOverlay = document.createElement("div");
    videoMutedOverlay.className = "video-muted-overlay";
    const userIcon = document.createElement("i");
    userIcon.className = "fas fa-user";
    videoMutedOverlay.appendChild(userIcon);
    videoContainer.appendChild(videoMutedOverlay);
  }

  // Add elements to container
  videoContainer.appendChild(videoElement);
  videoContainer.appendChild(videoInfo);

  // Add click handler to focus video
  videoContainer.addEventListener("click", () => {
    document.querySelectorAll(".video-container").forEach((container) => {
      container.classList.remove("focused");
    });
    videoContainer.classList.add("focused");
  });

  // Add to videos grid
  videosGrid.appendChild(videoContainer);

  // Update grid layout
  updateVideoGridLayout();
}

// Update the video grid layout based on number of participants
function updateVideoGridLayout() {
  const videoContainers = document.querySelectorAll(".video-container");
  const count = videoContainers.length;

  // Reset all containers
  videoContainers.forEach((container) => {
    container.style.gridColumn = "";
    container.style.gridRow = "";
    container.classList.remove("focused");
  });

  // If more than 4 participants, use smaller grid
  if (count > 4) {
    videosGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(250px, 1fr))";
  } else {
    videosGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
  }
}

// Toggle microphone mute/unmute
function toggleMic() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;

    // Update button icon
    const micIcon = micButton.querySelector("i");
    micIcon.className = audioTrack.enabled ? "fas fa-microphone" : "fas fa-microphone-slash";

    // Update UI
    micButton.setAttribute("data-tooltip", audioTrack.enabled ? "Mute" : "Unmute");

    // Update video element
    updateVideoElementMuteState(socket.id, !audioTrack.enabled);

    // Notify other participants
    socket.emit("media-state-changed", {
      audio: audioTrack.enabled,
      video: localStream.getVideoTracks()[0]?.enabled || false,
    });
  }
}

// Toggle camera on/off
function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;

    // Update button icon
    const cameraIcon = cameraButton.querySelector("i");
    cameraIcon.className = videoTrack.enabled ? "fas fa-video" : "fas fa-video-slash";

    // Update UI
    cameraButton.setAttribute("data-tooltip", videoTrack.enabled ? "Stop Video" : "Start Video");

    // Update video element
    updateVideoElementVideoState(socket.id, !videoTrack.enabled);

    // Notify other participants
    socket.emit("media-state-changed", {
      audio: localStream.getAudioTracks()[0]?.enabled || false,
      video: videoTrack.enabled,
    });
  }
}

// Update video element when mute state changes
function updateVideoElementMuteState(userId, isMuted) {
  const videoContainer = document.getElementById(`video-container-${userId}`);
  if (!videoContainer) return;
  const videoInfo = videoContainer.querySelector(".video-info");
  if (!videoInfo) return;

  // Remove existing mute icon
  const existingMuteIcon = videoInfo.querySelector(".fa-microphone-slash");
  if (existingMuteIcon) {
    existingMuteIcon.remove();
  }

  // Add mute icon if muted
  if (isMuted) {
    const muteIcon = document.createElement("i");
    muteIcon.className = "fas fa-microphone-slash";
    videoInfo.insertBefore(muteIcon, videoInfo.firstChild);
  }
}

// Update video element when video state changes
function updateVideoElementVideoState(userId, isVideoOff) {
  const videoContainer = document.getElementById(`video-container-${userId}`);
  if (!videoContainer) return;

  // Remove existing overlay
  const existingOverlay = videoContainer.querySelector(".video-muted-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Add overlay if video is off
  if (isVideoOff) {
    const videoMutedOverlay = document.createElement("div");
    videoMutedOverlay.className = "video-muted-overlay";
    const userIcon = document.createElement("i");
    userIcon.className = "fas fa-user";
    videoMutedOverlay.appendChild(userIcon);
    videoContainer.appendChild(videoMutedOverlay);
  }
}

// Toggle screen sharing
async function toggleScreenShare() {
  try {
    if (!isScreenSharing) {
      // Start screen sharing
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          logicalSurface: true,
          cursor: "always",
        },
        audio: true,
      });

      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      Object.values(peerConnections).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      // Update local video element
      const localVideoContainer = document.getElementById(`video-container-${socket.id}`);
      if (localVideoContainer) {
        const videoElement = localVideoContainer.querySelector("video");
        videoElement.srcObject = screenStream;
        localVideoContainer.classList.add("screen-sharing");
      }

      // Update UI
      screenShareButton.classList.add("active");
      isScreenSharing = true;

      // Show status
      showScreenShareStatus(`${username} is sharing screen`, true);

      // Notify other participants
      socket.emit("screen-sharing-started");

      // Handle when screen sharing is stopped
      videoTrack.onended = () => {
        stopScreenSharing();
      };
    } else {
      // Stop screen sharing
      stopScreenSharing();
    }
  } catch (error) {
    console.error("Error sharing screen:", error);
    if (error.name !== "NotAllowedError") {
      alert("Failed to share screen. Please try again.");
    }
  }
}

// Stop screen sharing
function stopScreenSharing() {
  if (!screenStream) return;

  // Stop all tracks
  screenStream.getTracks().forEach((track) => track.stop());
  screenStream = null;

  // Restore camera track in all peer connections
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    Object.values(peerConnections).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && videoTrack) {
        sender.replaceTrack(videoTrack);
      }
    });

    // Restore local video element
    const localVideoContainer = document.getElementById(`video-container-${socket.id}`);
    if (localVideoContainer) {
      const videoElement = localVideoContainer.querySelector("video");
      videoElement.srcObject = localStream;
      localVideoContainer.classList.remove("screen-sharing");
    }
  }

  // Update UI
  screenShareButton.classList.remove("active");
  isScreenSharing = false;

  // Hide status
  showScreenShareStatus("", false);

  // Notify other participants
  socket.emit("screen-sharing-stopped");
}

// Show screen share status
function showScreenShareStatus(message, show) {
  screenShareStatus.textContent = message;
  screenShareStatus.style.display = show ? "block" : "none";
}

// Toggle chat visibility
function toggleChat() {
  chatContainer.classList.toggle("visible");
  if (chatContainer.classList.contains("visible")) {
    participantsContainer.classList.remove("visible");
    messageInput.focus();
  }
}

// Toggle participants list visibility
function toggleParticipants() {
  participantsContainer.classList.toggle("visible");
  if (participantsContainer.classList.contains("visible")) {
    chatContainer.classList.remove("visible");
  }
}

// Add participant to the list
function addParticipant(participant) {
  // Check if participant already exists
  const existingIndex = participants.findIndex((p) => p.id === participant.id);
  if (existingIndex >= 0) {
    participants[existingIndex] = participant;
  } else {
    participants.push(participant);
  }
  updateParticipantsList();
}

// Remove participant from the list
function removeParticipant(userId) {
  participants = participants.filter((p) => p.id !== userId);
  updateParticipantsList();
}

// Update participants list UI
function updateParticipantsList() {
  participantsList.innerHTML = "";
  participantsCount.textContent = participants.length;
  participantsCountHeader.textContent = participants.length;
  participants.forEach((participant) => {
    const participantItem = document.createElement("div");
    participantItem.className = "participant-item";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = participant.username.charAt(0).toUpperCase();
    participantItem.appendChild(avatar);
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = participant.username;
    participantItem.appendChild(name);
    if (participant.id === socket.id) {
      const youBadge = document.createElement("span");
      youBadge.className = "you-badge";
      youBadge.textContent = "You";
      participantItem.appendChild(youBadge);
    }
    participantsList.appendChild(participantItem);
  });
}

function sendMessage() {
  const messageText = messageInput.value.trim();
  if (!messageText) return;

  // Create message object
  const messageData = {
    text: messageText,
    timestamp: new Date().toISOString()
  };

  // Send to server
  socket.emit("send-message", messageData);

  // Display locally immediately
  displayMessage({
    senderId: socket.id,
    username: username,
    text: messageText,
    timestamp: messageData.timestamp,
    isLocal: true
  });

  // Clear input
  messageInput.value = "";
  messageInput.focus();
}

// Display chat message
function displayMessage(message) {
  try {
    if (!chatbox) return;

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${message.isLocal ? "sent" : "received"}`;

    // Sender info with host indicator if applicable
    const senderDiv = document.createElement("div");
    senderDiv.className = "sender";
    senderDiv.textContent = message.username + (message.isHost ? " (Host)" : "");
    messageDiv.appendChild(senderDiv);

    // Message text
    const textDiv = document.createElement("div");
    textDiv.className = "message-text";
    textDiv.textContent = message.text;
    messageDiv.appendChild(textDiv);

    // Timestamp
    const timeDiv = document.createElement("div");
    timeDiv.className = "time";
    timeDiv.textContent = new Date(message.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    messageDiv.appendChild(timeDiv);

    chatbox.appendChild(messageDiv);
    chatbox.scrollTop = chatbox.scrollHeight;
  } catch (error) {
    console.error("Error displaying message:", error);
  }
}

// Update media control buttons
function updateMediaButtons(audioEnabled, videoEnabled) {
  // Mic button
  const micIcon = micButton.querySelector("i");
  micIcon.className = audioEnabled ? "fas fa-microphone" : "fas fa-microphone-slash";
  micButton.setAttribute("data-tooltip", audioEnabled ? "Mute" : "Unmute");

  // Camera button
  const cameraIcon = cameraButton.querySelector("i");
  cameraIcon.className = videoEnabled ? "fas fa-video" : "fas fa-video-slash";
  cameraButton.setAttribute("data-tooltip", videoEnabled ? "Stop Video" : "Start Video");
}

// Create a peer connection
function createPeerConnection(userId) {
  const peerConnection = new RTCPeerConnection(iceServers);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", event.candidate, userId);
    }
  };
  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    const username = peerUsernames[userId] || "Participant";
    createVideoElement(userId, stream, username);
  };

  // Add tracks to the connection
  const streamToUse = isScreenSharing ? screenStream : localStream;
  if (streamToUse) {
    streamToUse.getTracks().forEach((track) => {
      peerConnection.addTrack(track, streamToUse);
    });
  }

  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state with ${userId}: ${peerConnection.connectionState}`);
    if (
      peerConnection.connectionState === "disconnected" ||
      peerConnection.connectionState === "failed"
    ) {
      removeParticipant(userId);
      const videoContainer = document.getElementById(`video-container-${userId}`);
      if (videoContainer) {
        videoContainer.remove();
      }
    }
  };

  peerConnections[userId] = peerConnection;
  return peerConnection;
}

// Add this new function to your existing code
function createNewMeeting() {
  // Stop any existing media streams
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  // Close all peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};
  
  // Notify server we're leaving (if in a room)
  if (roomId) {
    socket.emit("leave-room");
  }
  
  // Redirect to lobby
  window.location.href = "lobby.html";
}

// End the call
function endCall() {
  // Stop screen sharing if active
  if (isScreenSharing) {
    stopScreenSharing();
  }

  // Close all peer connections
  Object.values(peerConnections).forEach((pc) => pc.close());
  peerConnections = {};

  // Stop local stream
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  // Notify server
  socket.emit("leave-room");

  // Redirect to lobby
  window.location.href = "lobby.html";
}

// Socket event handlers
socket.on("user-connected", async (userId, userName) => {
  console.log(`User connected: ${userId} (${userName})`);
  peerUsernames[userId] = userName;

  // Add to participants list
  addParticipant({
    id: userId,
    username: userName,
    isHost: false,
  });

  try {
    const peerConnection = createPeerConnection(userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("offer", offer, userId);
  } catch (error) {
    console.error("Error in user-connected handler:", error);
  }
});

socket.on("room-users", (users) => {
  setupPageUI(users.length === 0);
  users.forEach((user) => {
    peerUsernames[user.id] = user.username;
    addParticipant({
      id: user.id,
      username: user.username,
      isHost: user.isHost,
    });
  });
});

socket.on("offer", async (offer, senderId) => {
  try {
    let peerConnection = peerConnections[senderId];
    if (!peerConnection) {
      peerConnection = createPeerConnection(senderId);
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", answer, senderId);
  } catch (error) {
    console.error("Error handling offer:", error);
  }
});

socket.on("answer", async (answer, senderId) => {
  const peerConnection = peerConnections[senderId];
  if (peerConnection) {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }
});

socket.on("ice-candidate", async (candidate, senderId) => {
  const peerConnection = peerConnections[senderId];
  if (peerConnection) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }
});

socket.on("user-disconnected", (userId) => {
  console.log(`User disconnected: ${userId}`);
  removeParticipant(userId);
  if (peerConnections[userId]) {
    peerConnections[userId].close();
    delete peerConnections[userId];
  }
  const videoContainer = document.getElementById(`video-container-${userId}`);
  if (videoContainer) {
    videoContainer.remove();
  }
  const username = peerUsernames[userId] || "A participant";
  displayMessage({
    username: "System",
    text: `${username} has left the meeting`,
    timestamp: new Date().toISOString(),
    isLocal: false,
  });
});

// Socket.IO server code
// Server-side (Node.js with Socket.io)
socket.on('send-message', (data) => {
  // Just broadcast the message to the room
  socket.to(data.roomId).emit('receive-message', data);
});

socket.on("receive-message", (message) => {
  // Only display if not from ourselves (since we already displayed it locally)
  if (message.senderId !== socket.id) {
    displayMessage({
      ...message,
      isLocal: false
    });
  }
});

socket.on("screen-sharing-started", (userId) => {
  const username = peerUsernames[userId] || "A participant";
  displayMessage({
    username: "System",
    text: `${username} started screen sharing`,
    timestamp: new Date().toISOString(),
    isLocal: false,
  });
  const videoContainer = document.getElementById(`video-container-${userId}`);
  if (videoContainer) {
    videoContainer.classList.add("screen-sharing");
  }
});

socket.on("screen-sharing-stopped", (userId) => {
  const username = peerUsernames[userId] || "A participant";
  displayMessage({
    username: "System",
    text: `${username} stopped screen sharing`,
    timestamp: new Date().toISOString(),
    isLocal: false,
  });
  const videoContainer = document.getElementById(`video-container-${userId}`);
  if (videoContainer) {
    videoContainer.classList.remove("screen-sharing");
  }
});

socket.on("media-state-changed", ({ userId, audio, video }) => {
  const videoContainer = document.getElementById(`video-container-${userId}`);
  if (videoContainer) {
    updateVideoElementMuteState(userId, !audio);
    updateVideoElementVideoState(userId, !video);
  }
});

function setupPageUI(isFirstUser) {
  isHost = isFirstUser;
  if (isFirstUser) {
    console.log("You are the host of this room");
  }
}

// Handle beforeunload event
window.addEventListener("beforeunload", () => {
  socket.emit("leave-room");
});