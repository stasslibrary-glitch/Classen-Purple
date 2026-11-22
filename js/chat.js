import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  getDocs,
  where
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  startPresence,
  setMyActivity,
  clearMyActivity
} from "./presence.js";

import "./theme.js";

/* =====================================
   CLASSEN PURPLE CHAT
===================================== */

const USERS = {
  "m.classen@gmail.com": {
    name: "Baby",
    emoji: "❤️",
    partnerEmail: "d.classen@gmail.com"
  },

  "d.classen@gmail.com": {
    name: "Hubby",
    emoji: "💜",
    partnerEmail: "m.classen@gmail.com"
  }
};

const PROFILE_PHOTOS = {
  "d.classen@gmail.com": "cruz1.jpg",
  "m.classen@gmail.com": "slideshow/photo2.jpg"
};

const CHAT_ID = "classen-purple-private";

let currentUser = null;
let currentProfile = null;
let partnerUID = null;
let partnerName = "Your person";
let partnerEmail = "";

let messagesUnsubscribe = null;
let presenceCleanup = null;

let replyTo = null;
let typingTimeout = null;
let messagesCache = [];
let activityQueue = Promise.resolve();
let chatStarted = false;
let initialMessagesLoaded = false;

const messageSound = new Audio("sounds/message.mp3");
messageSound.preload = "auto";

function playMessageSound() {
  try {
    messageSound.currentTime = 0;
    const p = messageSound.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

/* =====================================
   VOICE NOTE CONFIG
===================================== */

const VOICE_UPLOAD = {
  provider: "cloudinary",
  cloudName: "YOUR_CLOUDINARY_CLOUD_NAME",
  uploadPreset: "YOUR_UNSIGNED_UPLOAD_PRESET",
  folder: "classen-purple/voice-notes",
  customUploadUrl: ""
};

const VOICE_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg"
];

let mediaRecorder = null;
let mediaStream = null;
let recordingChunks = [];
let recordingTimerId = null;
let recordingStartedAt = 0;
let recordingDurationMs = 0;
let recordedBlob = null;
let recordedMimeType = "";
let recordedObjectUrl = null;
let recordedAudioDuration = 0;
let voiceState = "idle";
let activeVoiceAudio = null;
let activeVoiceButton = null;
let pendingVoiceStop = null;

const $ = id => document.getElementById(id);

const messagesContainer = $("messagesContainer");
const messageInput = $("messageInput");
const sendButton = $("sendMessageBtn");
const microphoneBtn = $("microphoneBtn");
const stopRecordingBtn = $("stopRecordingBtn");
const cancelRecordingBtn = $("cancelRecordingBtn");
const sendVoiceBtn = $("sendVoiceBtn");
const attachmentBtn = $("attachmentBtn");
const partnerStatus = $("partnerStatus");

/* =====================================
   PROFILE PHOTOS
===================================== */

function getProfilePhoto(email) {
  return PROFILE_PHOTOS[email?.toLowerCase()] || "";
}

function createAvatar(container, email, fallback = "💜") {
  if (!container) return;

  container.innerHTML = "";
  container.classList.add("profile-avatar");

  const photo = getProfilePhoto(email);

  if (!photo) {
    container.textContent = fallback;
    return;
  }

  const img = document.createElement("img");

  img.src = photo;
  img.alt = "Profile picture";
  img.className = "chat-profile-photo";

  img.onerror = () => {
    img.remove();
    container.textContent = fallback;
  };

  container.appendChild(img);
}

function updateHeaderAvatar() {
  createAvatar(
    $("chatAvatar"),
    partnerEmail,
    USERS[partnerEmail]?.emoji || "💜"
  );
}

/* =====================================
   ACCOUNT INITIALIZATION
===================================== */

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.replace("index.html");
    return;
  }

  if (chatStarted) return;

  const email = user.email?.toLowerCase();

  if (!USERS[email]) {
    await signOut(auth);
    location.replace("index.html");
    return;
  }

  currentUser = user;
  currentProfile = USERS[email];

  partnerEmail = currentProfile.partnerEmail;
  partnerName = USERS[partnerEmail]?.name || "Your person";

  try {
    await setDoc(
      doc(db, "users", user.uid),
      {
        email,
        name: currentProfile.name,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    if ($("partnerName")) {
      $("partnerName").textContent = partnerName;
    }

    updateHeaderAvatar();

    await findPartner();
    await startChat();

    chatStarted = true;

  } catch (error) {
    console.error("Chat startup error:", error);

    if ($("partnerStatus")) {
      $("partnerStatus").textContent =
        "Unable to connect. Check Firebase rules.";
    }
  }
});

/* =====================================
   FIND PARTNER
===================================== */

async function findPartner() {
  const usersQuery = query(
    collection(db, "users"),
    where("email", "==", partnerEmail),
    limit(1)
  );

  const result = await getDocs(usersQuery);

  if (result.empty) {
    partnerUID = null;

    if ($("partnerStatus")) {
      $("partnerStatus").textContent =
        "Waiting for your person to sign in";
    }

    return;
  }

  partnerUID = result.docs[0].id;

  if ($("partnerStatus")) {
    $("partnerStatus").textContent = "Connecting...";
  }
}

/* =====================================
   START CHAT
===================================== */

async function startChat() {
  const chatMessagesRef = collection(
    db,
    "chats",
    CHAT_ID,
    "messages"
  );

  const messagesQuery = query(
    chatMessagesRef,
    orderBy("createdAt", "asc"),
    limit(300)
  );

  messagesUnsubscribe = onSnapshot(
    messagesQuery,
    snapshot => {
      messagesCache = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

      renderMessages();

      snapshot.docChanges().forEach(change => {
        if (change.type !== "added") return;

        const message = change.doc.data();

        if (message.senderUID !== currentUser.uid) {
          markMessageDelivered(change.doc.id, message);

          if (initialMessagesLoaded) {
            playMessageSound();
          }
        }
      });

      initialMessagesLoaded = true;

      if (document.visibilityState === "visible") {
        markIncomingMessagesRead();
      }
    },
    error => {
      console.error("Message listener error:", error);

      if ($("partnerStatus")) {
        $("partnerStatus").textContent =
          "Unable to load messages";
      }
    }
  );

  if (partnerUID) {
    presenceCleanup = await startPresence(
      currentUser.uid,
      partnerUID,
      updatePartnerStatus
    );
  }

  $("messageLoader")?.remove();
}

/* =====================================
   PARTNER STATUS
===================================== */

function updatePartnerStatus(status) {
  const statusText = $("partnerStatus");
  const dot = $("onlineDot");

  dot?.classList.toggle("is-online", status.online === true);

  if (!statusText) return;

  if (status.recording) {
    statusText.textContent = "recording a voice note...";
    return;
  }

  if (status.typing) {
    statusText.textContent = "typing...";
    return;
  }

  statusText.textContent = status.online
    ? "online"
    : formatLastSeen(status.lastSeen);
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "offline";

  let date;

  if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    date = new Date(timestamp);
  }

  if (Number.isNaN(date.getTime())) return "offline";

  const today = new Date().toDateString();

  const label = date.toDateString() === today
    ? "today"
    : date.toLocaleDateString([], {
        day: "numeric",
        month: "short"
      });

  return `last seen ${label} at ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

/* =====================================
   ACTIVITY CONTROL
===================================== */

function queueActivity(activity) {
  if (!currentUser) return;

  const uid = currentUser.uid;

  activityQueue = activityQueue
    .catch(() => {})
    .then(() => {
      if (activity.typing || activity.recording) {
        return setMyActivity(uid, activity);
      }

      return clearMyActivity(uid);
    });
}
function stopTyping() {
  clearTimeout(typingTimeout);

  if (currentUser) {
    queueActivity({
      typing: false,
      recording: false
    });
  }
}

/* =====================================
   SEND MESSAGES
===================================== */

async function sendMessage() {
  const text = messageInput?.value.trim();

  if (!text || !currentUser || !sendButton) return;

  sendButton.disabled = true;

  try {
    await addDoc(
      collection(db, "chats", CHAT_ID, "messages"),
      {
        senderUID: currentUser.uid,
        senderEmail: currentUser.email.toLowerCase(),
        senderName: currentProfile.name,
        text,
        type: "text",

        replyTo: replyTo ? {
          id: replyTo.id,
          senderUID: replyTo.senderUID,
          senderName: replyTo.senderName || "Message",
          text: replyTo.text ||
            (replyTo.type === "voice" ? "Voice note" : "Message")
        } : null,

        status: "sent",
        createdAt: serverTimestamp(),
        deliveredAt: null,
        readAt: null,
        reactions: {}
      }
    );

    messageInput.value = "";

    resizeInput();
    cancelReply();
    stopTyping();
    scrollToLatest();

  } catch (error) {
    console.error("Send message error:", error);
    alert("Message could not be sent. Please try again.");
  } finally {
    sendButton.disabled = false;
    messageInput?.focus();
  }
}

sendButton?.addEventListener("click", sendMessage);

messageInput?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

/* =====================================
   TYPING INDICATOR
===================================== */

messageInput?.addEventListener("input", () => {
  resizeInput();

  if (!currentUser) return;

  queueActivity({
    typing: true,
    recording: false
  });

  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    stopTyping();
  }, 1800);
});

messageInput?.addEventListener("blur", stopTyping);

function resizeInput() {
  if (!messageInput) return;

  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 100) + "px";
}

/* =====================================
   RENDER MESSAGES
===================================== */

function renderMessages() {
  if (!messagesContainer || !currentUser) return;

  const wasNearBottom =
    messagesContainer.scrollHeight -
    messagesContainer.scrollTop -
    messagesContainer.clientHeight < 130;

  stopActiveVoicePlayback();
  messagesContainer.innerHTML = "";

  let lastDate = "";

  const searchTerm = $("messageSearchInput")
    ?.value.trim().toLowerCase() || "";

  messagesCache.forEach(message => {
    const date = message.createdAt?.toDate
      ? message.createdAt.toDate()
      : null;

    const dateKey = date
      ? date.toLocaleDateString()
      : "Sending...";

    if (dateKey !== lastDate) {
      lastDate = dateKey;

      const separator = document.createElement("div");

      separator.className = "date-separator";

      separator.textContent = date
        ? date.toLocaleDateString([], {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
          })
        : "Today";

      messagesContainer.appendChild(separator);
    }

    const searchableText = [
      message.text || "",
      message.fileName || "",
      message.senderName || ""
    ].join(" ").toLowerCase();

    if (searchTerm && !searchableText.includes(searchTerm)) {
      return;
    }

    messagesContainer.appendChild(
      createMessageElement(message, date)
    );
  });

  if (wasNearBottom) {
    scrollToLatest();
  }

  updateUnreadButton();
}

/* =====================================
   CREATE MESSAGE ELEMENT
===================================== */

function stopActiveVoicePlayback(exceptAudio = null) {
  if (activeVoiceAudio && activeVoiceAudio !== exceptAudio) {
    try {
      activeVoiceAudio.pause();
    } catch (_) {}
  }

  if (
    activeVoiceButton &&
    (!activeVoiceAudio || activeVoiceAudio !== exceptAudio)
  ) {
    activeVoiceButton.innerHTML =
      '<i class="fa-solid fa-play"></i>';
  }

  if (!exceptAudio) {
    activeVoiceAudio = null;
    activeVoiceButton = null;
  }
}

function createVoiceNoteElement(message, mine) {
  const wrapper = document.createElement("div");
  wrapper.className = "voice-note";

  const avatar = document.createElement("div");
  avatar.className = "voice-note-avatar";

  const whoEmail = mine ? currentUser?.email : partnerEmail;

  const fallback = mine
    ? (currentProfile?.emoji || "💜")
    : (USERS[partnerEmail]?.emoji || "💜");

  const photo = getProfilePhoto(whoEmail);

  if (photo) {
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "Profile";
    img.onerror = () => {
      avatar.textContent = fallback;
    };
    avatar.appendChild(img);
  } else {
    avatar.textContent = fallback;
  }

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "voice-note-play";
  playBtn.setAttribute("aria-label", "Play voice note");
  playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';

  const body = document.createElement("div");
  body.className = "voice-note-body";

  const track = document.createElement("div");
  track.className = "voice-note-track";

  const progress = document.createElement("div");
  progress.className = "voice-note-progress";

  track.appendChild(progress);

  const meta = document.createElement("div");
  meta.className = "voice-note-meta";

  const timeEl = document.createElement("span");
  const durEl = document.createElement("span");

  const duration = Math.max(
    0,
    Math.round(Number(message.duration) || 0)
  );

  timeEl.textContent = "00:00";
  durEl.textContent = formatDuration(duration);

  meta.append(timeEl, durEl);

  const audio = document.createElement("audio");
  audio.preload = "metadata";
  audio.src = message.audioUrl;
  audio.className = "voice-note-audio";

  const err = document.createElement("div");
  err.className = "voice-note-error hidden";
  err.textContent = "Voice note unavailable.";

  playBtn.addEventListener("click", () => {
    if (!message.audioUrl) return;

    if (audio.paused) {
      stopActiveVoicePlayback(audio);

      audio.play().then(() => {
        playBtn.innerHTML =
          '<i class="fa-solid fa-pause"></i>';

        activeVoiceAudio = audio;
        activeVoiceButton = playBtn;

      }).catch(() => {
        err.classList.remove("hidden");
      });

    } else {
      audio.pause();

      playBtn.innerHTML =
        '<i class="fa-solid fa-play"></i>';

      if (activeVoiceAudio === audio) {
        activeVoiceAudio = null;
        activeVoiceButton = null;
      }
    }
  });

  track.addEventListener("click", event => {
    if (!audio.duration) return;

    const rect = track.getBoundingClientRect();

    const pct = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );

    audio.currentTime = pct * audio.duration;
  });

  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      durEl.textContent = formatDuration(audio.duration);
    }
  });

  audio.addEventListener("timeupdate", () => {
    const current = audio.currentTime || 0;
    const total = audio.duration || duration || 0;

    timeEl.textContent = formatDuration(current);

    if (total > 0) {
      progress.style.width =
        Math.min(100, (current / total) * 100) + "%";
    }
  });

  audio.addEventListener("ended", () => {
    playBtn.innerHTML =
      '<i class="fa-solid fa-play"></i>';

    progress.style.width = "0%";
    timeEl.textContent = "00:00";

    if (activeVoiceAudio === audio) {
      activeVoiceAudio = null;
      activeVoiceButton = null;
    }
  });

  audio.addEventListener("error", () => {
    err.classList.remove("hidden");
    playBtn.disabled = true;
  });

  body.append(track, meta, err, audio);
  wrapper.append(avatar, playBtn, body);

  return wrapper;
}

function createMessageElement(message, date) {
  const mine = message.senderUID === currentUser.uid;

  const row = document.createElement("div");
  row.className = `message-row ${mine ? "mine" : "theirs"}`;
  row.dataset.messageId = message.id;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  // Reply preview
  if (message.replyTo) {
    const quote = document.createElement("div");
    quote.className = "message-quote";

    const quoteName = document.createElement("strong");
    quoteName.textContent =
      message.replyTo.senderName || "Message";

    const quoteText = document.createElement("p");
    quoteText.textContent = message.replyTo.text || "";

    quote.append(quoteName, quoteText);
    bubble.appendChild(quote);
  }

  // Voice note
  if (message.type === "voice" && message.audioUrl) {
    bubble.appendChild(
      createVoiceNoteElement(message, mine)
    );

  } else if (message.text) {
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.text;
    bubble.appendChild(text);
  }

  if (message.edited) {
    const edited = document.createElement("small");
    edited.textContent = "edited";
    edited.style.opacity = ".65";
    bubble.appendChild(edited);
  }

  // Message time and receipts
  const meta = document.createElement("div");
  meta.className = "message-meta";

  const time = document.createElement("span");

  time.textContent = date
    ? date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Sending";

  meta.appendChild(time);

  if (mine) {
    const receipt = document.createElement("span");

    receipt.className =
      `message-status ${message.status || "sent"}`;

    receipt.textContent = receiptEmoji(message.status);
    receipt.title = receiptTitle(message.status);

    meta.appendChild(receipt);
  }

  bubble.appendChild(meta);

  // Reactions
  if (message.reactions) {
    const reactionArea = document.createElement("div");
    reactionArea.className = "message-reactions";

    Object.entries(message.reactions).forEach(([emoji, users]) => {
      const count = Array.isArray(users) ? users.length : 0;

      if (!count) return;

      const chip = document.createElement("span");
      chip.className = "reaction-chip";
      chip.textContent = `${emoji} ${count}`;

      reactionArea.appendChild(chip);
    });

    bubble.appendChild(reactionArea);
  }

  // Message tools
  const tools = document.createElement("div");
  tools.className = "message-tools";

  tools.append(
    makeTool("↩", "Reply", () => setReply(message)),
    makeTool("❤️", "React", () => addReaction(message, "❤️"))
  );

  if (mine) {
    if (message.type !== "voice") {
      tools.append(
        makeTool("✎", "Edit", () => editMessage(message))
      );
    }

    tools.append(
      makeTool("🗑", "Delete", () => removeMessage(message))
    );
  }

  // Incoming avatar
  if (!mine) {
    const avatar = document.createElement("div");
    avatar.className = "message-avatar";

    createAvatar(
      avatar,
      partnerEmail,
      USERS[partnerEmail]?.emoji || "💜"
    );

    row.appendChild(avatar);
  }

  row.append(bubble, tools);

  return row;
}

function receiptEmoji(status) {
  if (status === "read") return "💜";
  if (status === "delivered") return "✓✓";
  return "✓";
}

function receiptTitle(status) {
  if (status === "read") return "Read";
  if (status === "delivered") return "Delivered";
  return "Sent";
}

function makeTool(symbol, title, action) {
  const button = document.createElement("button");

  button.type = "button";
  button.textContent = symbol;
  button.title = title;

  button.addEventListener("click", action);

  return button;
}
/* =====================================
   MESSAGE RECEIPTS
===================================== */

async function markMessageDelivered(messageID, message) {
  if (!currentUser || message.senderUID === currentUser.uid) return;

  if (
    message.status === "delivered" ||
    message.status === "read"
  ) return;

  try {
    await updateDoc(
      doc(db, "chats", CHAT_ID, "messages", messageID),
      {
        status: "delivered",
        deliveredAt: serverTimestamp()
      }
    );

  } catch (error) {
    console.warn("Delivery receipt error:", error);
  }
}

async function markIncomingMessagesRead() {
  if (
    !currentUser ||
    document.visibilityState !== "visible"
  ) return;

  const unread = messagesCache.filter(message =>
    message.senderUID !== currentUser.uid &&
    message.status !== "read"
  );

  for (const message of unread) {
    try {
      await updateDoc(
        doc(db, "chats", CHAT_ID, "messages", message.id),
        {
          status: "read",
          readAt: serverTimestamp()
        }
      );

    } catch (error) {
      console.warn("Read receipt error:", error);
    }
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    markIncomingMessagesRead();
  }
});

/* =====================================
   REPLY
===================================== */

function setReply(message) {
  replyTo = message;

  if ($("replySender")) {
    $("replySender").textContent =
      message.senderUID === currentUser.uid
        ? "You"
        : partnerName;
  }

  if ($("replyText")) {
    $("replyText").textContent =
      message.text ||
      (message.type === "voice" ? "Voice note" : "Message");
  }

  $("replyPreview")?.classList.remove("hidden");

  messageInput?.focus();
}

function cancelReply() {
  replyTo = null;
  $("replyPreview")?.classList.add("hidden");
}

$("cancelReplyBtn")?.addEventListener("click", cancelReply);

/* =====================================
   EDIT MESSAGE
===================================== */

async function editMessage(message) {
  if (
    message.senderUID !== currentUser.uid ||
    !message.text
  ) return;

  const updatedText = prompt(
    "Edit your message:",
    message.text
  );

  if (updatedText === null || !updatedText.trim()) return;

  try {
    await updateDoc(
      doc(db, "chats", CHAT_ID, "messages", message.id),
      {
        text: updatedText.trim(),
        edited: true,
        editedAt: serverTimestamp()
      }
    );

  } catch (error) {
    console.error(error);
    alert("Could not edit this message.");
  }
}

/* =====================================
   DELETE MESSAGE
===================================== */

async function removeMessage(message) {
  if (message.senderUID !== currentUser.uid) return;

  if (!confirm("Delete this message for both of you?")) {
    return;
  }

  try {
    await deleteDoc(
      doc(db, "chats", CHAT_ID, "messages", message.id)
    );

  } catch (error) {
    console.error(error);
    alert("Could not delete this message.");
  }
}

/* =====================================
   REACTIONS
===================================== */

async function addReaction(message, emoji) {
  const reactions = {
    ...(message.reactions || {})
  };

  const users = Array.isArray(reactions[emoji])
    ? [...reactions[emoji]]
    : [];

  const index = users.indexOf(currentUser.uid);

  if (index >= 0) {
    users.splice(index, 1);
  } else {
    users.push(currentUser.uid);
  }

  reactions[emoji] = users;

  try {
    await updateDoc(
      doc(db, "chats", CHAT_ID, "messages", message.id),
      { reactions }
    );

  } catch (error) {
    console.error("Reaction failed:", error);
  }
}

/* =====================================
   ATTACHMENTS - DISABLED FOR NOW
===================================== */

attachmentBtn?.addEventListener("click", () => {
  alert("Photo, video and document sharing will be enabled later.");
});

/* =====================================
   VOICE NOTES
===================================== */

function voicePanel() {
  return $("voicePanel");
}

function voiceLabel() {
  return $("voicePanelLabel");
}

function voiceTimer() {
  return $("recordingTimer");
}

function voiceDot() {
  return $("voiceRecordingDot");
}

function voiceStopBtn() {
  return stopRecordingBtn;
}

function voiceCancelBtn() {
  return cancelRecordingBtn;
}

function voiceSendBtn() {
  return sendVoiceBtn;
}

function voicePreviewPlayBtn() {
  return $("voicePreviewPlayBtn");
}

function voicePreviewTrack() {
  return $("voicePreviewTrack");
}

function voicePreviewProgress() {
  return $("voicePreviewProgress");
}

function voicePreviewAudio() {
  return $("voicePreviewAudio");
}

function showChatNotice(message, isError = false) {
  if (!message) return;

  const status = partnerStatus;

  if (status) {
    status.textContent = message;
    status.style.color = isError ? "#ffd1d9" : "";

    clearTimeout(showChatNotice._t);

    showChatNotice._t = setTimeout(() => {
      status.style.color = "";
    }, 3500);
  }

  if (isError) console.warn(message);
}

function formatDuration(msOrSeconds) {
  const total = Math.max(
    0,
    Math.floor(
      msOrSeconds > 1000
        ? msOrSeconds / 1000
        : msOrSeconds
    )
  );

  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");

  return `${m}:${s}`;
}

function canRecordAudio() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.MediaRecorder
  );
}

function pickSupportedVoiceMimeType() {
  if (
    !window.MediaRecorder ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) return "";

  for (const type of VOICE_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch (_) {}
  }

  return "";
}

function voiceExtensionForMime(mime) {
  const m = (mime || "").toLowerCase();

  if (m.includes("mp4") || m.includes("m4a")) return "m4a";
  if (m.includes("ogg")) return "ogg";

  return "webm";
}

function isSecureRecordingContext() {
  return (
    window.isSecureContext ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function resetVoicePreview() {
  const audio = voicePreviewAudio();

  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  if (recordedObjectUrl) {
    URL.revokeObjectURL(recordedObjectUrl);
    recordedObjectUrl = null;
  }

  recordedBlob = null;
  recordedMimeType = "";
  recordedAudioDuration = 0;
  recordingDurationMs = 0;

  if (voicePreviewProgress()) {
    voicePreviewProgress().style.width = "0%";
  }

  if (voicePreviewPlayBtn()) {
    voicePreviewPlayBtn().innerHTML =
      '<i class="fa-solid fa-play"></i>';
  }
}

function stopMediaTracks() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => {
      try {
        track.stop();
      } catch (_) {}
    });

    mediaStream = null;
  }
}

function clearRecordingTimer() {
  if (recordingTimerId) {
    clearInterval(recordingTimerId);
    recordingTimerId = null;
  }
}

function setVoiceUiState(state, opts = {}) {
  voiceState = state;

  const panel = voicePanel();

  if (!panel) return;

  panel.classList.remove("hidden", "sending", "error");
  panel.classList.toggle("sending", state === "sending");
  panel.classList.toggle("error", !!opts.error);

  const recording = state === "recording";
  const preview = state === "preview";
  const sending = state === "sending";

  voiceDot()?.classList.toggle("hidden", !recording);
  voiceStopBtn()?.classList.toggle("hidden", !recording);
  voiceSendBtn()?.classList.toggle("hidden", !preview);
  voicePreviewPlayBtn()?.classList.toggle("hidden", !preview);
  voicePreviewTrack()?.classList.toggle("hidden", !preview);

  if (voiceCancelBtn()) {
    voiceCancelBtn().disabled = sending;
  }

  if (voiceStopBtn()) {
    voiceStopBtn().disabled = sending;
  }

  if (voiceSendBtn()) {
    voiceSendBtn().disabled = sending;
  }

  if (voicePreviewPlayBtn()) {
    voicePreviewPlayBtn().disabled = sending;
  }

  if (voiceLabel()) {
    if (opts.label) {
      voiceLabel().textContent = opts.label;
    } else if (recording) {
      voiceLabel().textContent = "Recording voice note...";
    } else if (preview) {
      voiceLabel().textContent = "Preview your voice note";
    } else if (sending) {
      voiceLabel().textContent = "Sending voice note...";
    }
  }

  if (state === "idle") {
    panel.classList.add("hidden");
  }
}

function updateRecordingTimer() {
  if (voiceTimer()) {
    voiceTimer().textContent =
      formatDuration(Date.now() - recordingStartedAt);
  }
}

function setRecordingPresence(active) {
  if (!currentUser) return;

  queueActivity({
    typing: false,
    recording: active === true
  });
}
/* =====================================
   START VOICE RECORDING
===================================== */

async function startVoiceRecording() {
  if (voiceState === "recording" || voiceState === "sending") {
    return;
  }

  if (!currentUser) {
    showChatNotice("Please wait for chat to connect.", true);
    return;
  }

  if (!isSecureRecordingContext()) {
    alert(
      "Voice recording needs HTTPS or localhost. " +
      "Microphone access is blocked on insecure pages."
    );
    return;
  }

  if (!canRecordAudio()) {
    alert(
      "This browser does not support voice recording."
    );
    return;
  }

  const mimeType = pickSupportedVoiceMimeType();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    if (voiceState === "recording" || voiceState === "sending") {
      stream.getTracks().forEach(track => track.stop());
      return;
    }

    resetVoicePreview();

    mediaStream = stream;
    recordingChunks = [];
    recordingDurationMs = 0;
    recordedMimeType = mimeType || "";

    const options = mimeType ? { mimeType } : undefined;

    mediaRecorder = new MediaRecorder(stream, options);

    recordedMimeType =
      mediaRecorder.mimeType || mimeType || "audio/webm";

    pendingVoiceStop = null;

    mediaRecorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size > 0) {
        recordingChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", () => {
      clearRecordingTimer();
      stopMediaTracks();
      setRecordingPresence(false);

      const duration = Math.max(
        1,
        Math.round((Date.now() - recordingStartedAt) / 1000)
      );

      recordingDurationMs = duration * 1000;

      const blob = new Blob(recordingChunks, {
        type: recordedMimeType || "audio/webm"
      });

      recordingChunks = [];
      mediaRecorder = null;

      if (pendingVoiceStop === "cancel") {
        pendingVoiceStop = null;
        resetVoicePreview();
        setVoiceUiState("idle");
        return;
      }

      pendingVoiceStop = null;

      if (!blob || blob.size < 256) {
        resetVoicePreview();
        setVoiceUiState("idle");

        alert(
          "Recording was empty or invalid. Please try again."
        );

        return;
      }

      recordedBlob = blob;
      recordedObjectUrl = URL.createObjectURL(blob);

      const audio = voicePreviewAudio();

      if (audio) {
        audio.src = recordedObjectUrl;

        audio.onloadedmetadata = () => {
          const d = Number.isFinite(audio.duration)
            ? Math.round(audio.duration)
            : duration;

          recordedAudioDuration = d > 0 ? d : duration;

          if (voiceTimer() && voiceState === "preview") {
            voiceTimer().textContent =
              formatDuration(recordedAudioDuration);
          }
        };

        audio.ontimeupdate = () => {
          if (!audio.duration) return;

          const pct = Math.min(
            100,
            (audio.currentTime / audio.duration) * 100
          );

          if (voicePreviewProgress()) {
            voicePreviewProgress().style.width = pct + "%";
          }

          if (voiceTimer() && voiceState === "preview") {
            voiceTimer().textContent =
              formatDuration(audio.currentTime) +
              " / " +
              formatDuration(audio.duration);
          }
        };

        audio.onended = () => {
          if (voicePreviewPlayBtn()) {
            voicePreviewPlayBtn().innerHTML =
              '<i class="fa-solid fa-play"></i>';
          }

          if (voicePreviewProgress()) {
            voicePreviewProgress().style.width = "0%";
          }

          if (voiceTimer()) {
            voiceTimer().textContent =
              formatDuration(recordedAudioDuration || duration);
          }
        };
      }

      recordedAudioDuration = duration;

      if (voiceTimer()) {
        voiceTimer().textContent = formatDuration(duration);
      }

      setVoiceUiState("preview", {
        label: "Preview your voice note"
      });
    });

    mediaRecorder.addEventListener("error", () => {
      clearRecordingTimer();
      stopMediaTracks();
      setRecordingPresence(false);
      resetVoicePreview();
      setVoiceUiState("idle");

      alert("Recording failed. Please try again.");
    });

    recordingStartedAt = Date.now();

    if (voiceTimer()) {
      voiceTimer().textContent = "00:00";
    }

    setVoiceUiState("recording", {
      label: "Recording voice note..."
    });

    setRecordingPresence(true);

    mediaRecorder.start(250);

    clearRecordingTimer();

    recordingTimerId = setInterval(
      updateRecordingTimer,
      250
    );

  } catch (error) {
    console.error("Microphone error:", error);

    stopMediaTracks();
    setRecordingPresence(false);
    setVoiceUiState("idle");

    const name = error?.name || "";

    if (
      name === "NotAllowedError" ||
      name === "PermissionDeniedError"
    ) {
      alert(
        "Microphone permission was denied. " +
        "Please allow microphone access and try again."
      );

    } else if (
      name === "NotFoundError" ||
      name === "DevicesNotFoundError"
    ) {
      alert("No microphone was found on this device.");

    } else if (
      name === "NotReadableError" ||
      name === "TrackStartError"
    ) {
      alert(
        "Your microphone is already in use by another app " +
        "or cannot be accessed."
      );

    } else if (name === "SecurityError") {
      alert(
        "Microphone access was blocked by browser security. " +
        "Use HTTPS or localhost."
      );

    } else {
      alert(
        "Could not start voice recording. " +
        "Please check microphone access."
      );
    }
  }
}

/* =====================================
   STOP VOICE RECORDING
===================================== */

function stopVoiceRecording() {
  if (voiceState !== "recording" || !mediaRecorder) {
    return;
  }

  try {
    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

  } catch (error) {
    console.error("Stop recording error:", error);

    clearRecordingTimer();
    stopMediaTracks();
    setRecordingPresence(false);
    resetVoicePreview();
    setVoiceUiState("idle");
  }
}

/* =====================================
   CANCEL VOICE RECORDING
===================================== */

function cancelVoiceRecording() {
  if (voiceState === "sending") return;

  if (voiceState === "recording" && mediaRecorder) {
    pendingVoiceStop = "cancel";

    try {
      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();

      } else {
        clearRecordingTimer();
        stopMediaTracks();
        setRecordingPresence(false);
        resetVoicePreview();
        setVoiceUiState("idle");
      }

    } catch (_) {
      clearRecordingTimer();
      stopMediaTracks();
      setRecordingPresence(false);
      resetVoicePreview();
      setVoiceUiState("idle");
    }

    return;
  }

  if (voiceState === "preview") {
    resetVoicePreview();
    setVoiceUiState("idle");
  }
}

/* =====================================
   CLOUDINARY UPLOAD CONFIGURATION
===================================== */

function getVoiceUploadConfigIssue() {
  if (VOICE_UPLOAD.provider === "cloudinary") {
    if (
      !VOICE_UPLOAD.cloudName ||
      VOICE_UPLOAD.cloudName === "YOUR_CLOUDINARY_CLOUD_NAME"
    ) {
      return (
        "Cloudinary cloud name is missing in js/chat.js " +
        "(VOICE_UPLOAD.cloudName)."
      );
    }

    if (
      !VOICE_UPLOAD.uploadPreset ||
      VOICE_UPLOAD.uploadPreset === "YOUR_UNSIGNED_UPLOAD_PRESET"
    ) {
      return (
        "Cloudinary unsigned upload preset is missing " +
        "in js/chat.js (VOICE_UPLOAD.uploadPreset)."
      );
    }

    return "";
  }

  if (VOICE_UPLOAD.provider === "custom") {
    if (!VOICE_UPLOAD.customUploadUrl) {
      return (
        "Custom voice upload URL is missing in js/chat.js " +
        "(VOICE_UPLOAD.customUploadUrl)."
      );
    }

    return "";
  }

  return "Unsupported voice upload provider in js/chat.js.";
}

function extractUploadUrl(result) {
  return (
    result?.secure_url ||
    result?.url ||
    result?.audioUrl ||
    result?.data?.secure_url ||
    result?.data?.url ||
    ""
  );
}

async function uploadVoiceBlob(blob, mimeType, durationSeconds) {
  const issue = getVoiceUploadConfigIssue();

  if (issue) throw new Error(issue);

  const ext = voiceExtensionForMime(mimeType || blob.type);

  const filename =
    "voice-" +
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2, 8) +
    "." +
    ext;

  const file = new File(
    [blob],
    filename,
    {
      type: mimeType || blob.type || "audio/webm"
    }
  );

  if (VOICE_UPLOAD.provider === "cloudinary") {
    const endpoint =
      "https://api.cloudinary.com/v1_1/" +
      encodeURIComponent(VOICE_UPLOAD.cloudName) +
      "/video/upload";

    const fd = new FormData();

    fd.append("file", file);
    fd.append("upload_preset", VOICE_UPLOAD.uploadPreset);

    if (VOICE_UPLOAD.folder) {
      fd.append("folder", VOICE_UPLOAD.folder);
    }

    const res = await fetch(endpoint, {
      method: "POST",
      body: fd
    });

    let data = {};

    try {
      data = await res.json();
    } catch (_) {}

    if (!res.ok) {
      throw new Error(
        data?.error?.message ||
        ("Cloudinary upload failed (" + res.status + ").")
      );
    }

    const url = extractUploadUrl(data);

    if (!url) {
      throw new Error(
        "Cloudinary upload succeeded but no audio URL was returned."
      );
    }

    return {
      url,
      duration: Number(data?.duration)
        ? Math.round(data.duration)
        : durationSeconds,
      mimeType: mimeType || blob.type || "audio/webm",
      fileName: filename,
      size: blob.size
    };
  }

  const fd = new FormData();

  fd.append("file", file);
  fd.append("mimeType", mimeType || blob.type || "audio/webm");
  fd.append("duration", String(durationSeconds));

  const res = await fetch(
    VOICE_UPLOAD.customUploadUrl,
    {
      method: "POST",
      body: fd
    }
  );

  let data = {};

  try {
    data = await res.json();
  } catch (_) {}

  if (!res.ok) {
    throw new Error(
      data?.error?.message ||
      data?.message ||
      ("Voice upload failed (" + res.status + ").")
    );
  }

  const url = extractUploadUrl(data);

  if (!url) {
    throw new Error(
      "Voice upload succeeded but no audio URL was returned."
    );
  }

  return {
    url,
    duration: Number(data?.duration)
      ? Math.round(data.duration)
      : durationSeconds,
    mimeType: mimeType || blob.type || "audio/webm",
    fileName: filename,
    size: blob.size
  };
}

/* =====================================
   SEND VOICE NOTE
===================================== */

async function sendVoiceNote() {
  if (
    voiceState !== "preview" ||
    !recordedBlob ||
    !currentUser
  ) return;

  const uploadIssue = getVoiceUploadConfigIssue();

  if (uploadIssue) {
    alert(
      uploadIssue +
      "\n\nFirebase Storage is not used because of billing. " +
      "Configure Cloudinary (free unsigned preset) or a custom " +
      "upload endpoint in js/chat.js. Do not use a local blob URL " +
      "as a shared voice note."
    );

    return;
  }

  const durationSeconds = Math.max(
    1,
    Math.round(
      recordedAudioDuration ||
      (recordingDurationMs / 1000) ||
      1
    )
  );

  const mimeType =
    recordedMimeType ||
    recordedBlob.type ||
    "audio/webm";

  setVoiceUiState("sending", {
    label: "Uploading voice note..."
  });

  try {
    const uploaded = await uploadVoiceBlob(
      recordedBlob,
      mimeType,
      durationSeconds
    );

    await addDoc(
      collection(db, "chats", CHAT_ID, "messages"),
      {
        senderUID: currentUser.uid,
        senderEmail: currentUser.email.toLowerCase(),
        senderName: currentProfile.name,
        text: "",
        type: "voice",
        audioUrl: uploaded.url,
        duration: uploaded.duration || durationSeconds,
        mimeType: uploaded.mimeType || mimeType,
        fileName: uploaded.fileName || "",
        size: uploaded.size || recordedBlob.size || 0,

        replyTo: replyTo ? {
          id: replyTo.id,
          senderUID: replyTo.senderUID,
          senderName: replyTo.senderName || "Message",
          text: replyTo.text ||
            (replyTo.type === "voice" ? "Voice note" : "Message")
        } : null,

        status: "sent",
        createdAt: serverTimestamp(),
        deliveredAt: null,
        readAt: null,
        reactions: {}
      }
    );

    cancelReply();
    resetVoicePreview();
    setVoiceUiState("idle");
    scrollToLatest();

  } catch (error) {
    console.error("Voice note send failed:", error);

    setVoiceUiState("preview", {
      label: "Send failed. Tap send to retry.",
      error: true
    });

    alert(
      error?.message ||
      "Voice note could not be sent. Please try again."
    );
  }
}

/* =====================================
   CONNECT VOICE NOTE BUTTONS
===================================== */

function bindVoiceUi() {
  microphoneBtn?.addEventListener(
    "click",
    startVoiceRecording
  );

  stopRecordingBtn?.addEventListener(
    "click",
    stopVoiceRecording
  );

  cancelRecordingBtn?.addEventListener(
    "click",
    cancelVoiceRecording
  );

  sendVoiceBtn?.addEventListener(
    "click",
    sendVoiceNote
  );

  voicePreviewPlayBtn()?.addEventListener("click", () => {
    const audio = voicePreviewAudio();

    if (!audio || !audio.src) return;

    if (audio.paused) {
      audio.play().catch(() => {});

      voicePreviewPlayBtn().innerHTML =
        '<i class="fa-solid fa-pause"></i>';

    } else {
      audio.pause();

      voicePreviewPlayBtn().innerHTML =
        '<i class="fa-solid fa-play"></i>';
    }
  });

  voicePreviewTrack()?.addEventListener("click", event => {
    const audio = voicePreviewAudio();

    if (!audio || !audio.duration) return;

    const rect = voicePreviewTrack().getBoundingClientRect();

    const pct = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width)
    );

    audio.currentTime = pct * audio.duration;
  });
}

bindVoiceUi();

/* =====================================
   EMOJI PICKER
===================================== */

$("emojiBtn")?.addEventListener("click", () => {
  $("emojiPicker")?.classList.toggle("hidden");
});

document.querySelectorAll("#emojiPicker button").forEach(button => {
  button.addEventListener("click", () => {
    if (!messageInput) return;

    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const value = messageInput.value;

    messageInput.value =
      value.slice(0, start) +
      button.textContent +
      value.slice(end);

    messageInput.focus();

    messageInput.selectionStart =
      messageInput.selectionEnd =
      start + button.textContent.length;

    $("emojiPicker")?.classList.add("hidden");

    resizeInput();
  });
});

/* =====================================
   SEARCH
===================================== */

$("searchChatBtn")?.addEventListener("click", () => {
  $("chatSearch")?.classList.toggle("hidden");
  $("messageSearchInput")?.focus();
});

$("closeSearchBtn")?.addEventListener("click", () => {
  $("chatSearch")?.classList.add("hidden");

  if ($("messageSearchInput")) {
    $("messageSearchInput").value = "";
  }

  renderMessages();
});

$("messageSearchInput")?.addEventListener(
  "input",
  renderMessages
);

/* =====================================
   JUMP TO LATEST
===================================== */

function scrollToLatest() {
  messagesContainer?.scrollTo({
    top: messagesContainer.scrollHeight,
    behavior: "smooth"
  });

  $("jumpLatestBtn")?.classList.add("hidden");
}

function updateUnreadButton() {
  if (!currentUser) return;

  const unread = messagesCache.filter(message =>
    message.senderUID !== currentUser.uid &&
    message.status !== "read"
  ).length;

  if ($("unreadCount")) {
    $("unreadCount").textContent = unread;
  }

  $("jumpLatestBtn")?.classList.toggle(
    "hidden",
    unread === 0
  );
}

$("jumpLatestBtn")?.addEventListener("click", () => {
  scrollToLatest();
  markIncomingMessagesRead();
});

messagesContainer?.addEventListener("scroll", () => {
  const atBottom =
    messagesContainer.scrollHeight -
    messagesContainer.scrollTop -
    messagesContainer.clientHeight < 60;

  if (atBottom) {
    markIncomingMessagesRead();
  }
});

/* =====================================
   CHAT MENU
===================================== */

$("chatMenuBtn")?.addEventListener("click", () => {
  const choice = prompt(
    "Chat options:\n1. Change wallpaper\n2. Clear search\n3. Scroll to latest"
  );

  if (choice === "1") {
    const wallpaper = prompt(
      "Enter a wallpaper image URL:"
    );

    if (wallpaper && $("chatBackground")) {
      $("chatBackground").style.backgroundImage =
        `linear-gradient(rgba(20,10,30,.12), rgba(20,10,30,.12)), url("${wallpaper}")`;

      $("chatBackground").style.backgroundSize = "cover";
      $("chatBackground").style.backgroundPosition = "center";
    }
  }

  if (choice === "2") {
    if ($("messageSearchInput")) {
      $("messageSearchInput").value = "";
    }

    renderMessages();
  }

  if (choice === "3") {
    scrollToLatest();
  }
});

/* =====================================
   CLEANUP
===================================== */

function cleanupVoiceResources() {
  try {
    if (voiceState === "recording" && mediaRecorder) {
      pendingVoiceStop = "cancel";

      if (mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    }
  } catch (_) {}

  try {
    clearRecordingTimer();
  } catch (_) {}

  try {
    stopMediaTracks();
  } catch (_) {}

  try {
    resetVoicePreview();
  } catch (_) {}

  try {
    stopActiveVoicePlayback();
  } catch (_) {}

  try {
    setRecordingPresence(false);
  } catch (_) {}

  voiceState = "idle";
  voicePanel()?.classList.add("hidden");
}

window.addEventListener("beforeunload", () => {
  messagesUnsubscribe?.();
  presenceCleanup?.();
  clearTimeout(typingTimeout);
  cleanupVoiceResources();

  if (currentUser) {
    clearMyActivity(currentUser.uid);
  }
});

window.addEventListener("pagehide", cleanupVoiceResources);