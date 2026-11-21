
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
    emoji: "â¤ï¸",
    partnerEmail: "d.classen@gmail.com"
  },

  "d.classen@gmail.com": {
    name: "Hubby",
    emoji: "ðŸ’œ",
    partnerEmail: "m.classen@gmail.com"
  }
};

const PROFILE_PHOTOS = {
  "d.classen@gmail.com": "slideshow/cruz1.jpg",
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

const messageSound = new Audio('sounds/message.mp3');
messageSound.preload = 'auto';

function playMessageSound() {
  try {
    messageSound.currentTime = 0;
    const p = messageSound.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (_) {}
}

const $ = id => document.getElementById(id);

const messagesContainer = $("messagesContainer");
const messageInput = $("messageInput");
const sendButton = $("sendMessageBtn");

/* =====================================
   PROFILE PHOTOS
===================================== */

function getProfilePhoto(email) {
  return PROFILE_PHOTOS[email?.toLowerCase()] || "";
}

function createAvatar(container, email, fallback = "ðŸ’œ") {
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
    USERS[partnerEmail]?.emoji || "ðŸ’œ"
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
    // Ensure this account has a searchable profile.
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
          if (initialMessagesLoaded) playMessageSound();
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
          text: replyTo.text || "Message"
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

  // Message text
  if (message.text) {
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
    makeTool("â†©", "Reply", () => setReply(message)),
    makeTool("â¤ï¸", "React", () => addReaction(message, "â¤ï¸"))
  );

  if (mine) {
    tools.append(
      makeTool("âœŽ", "Edit", () => editMessage(message)),
      makeTool("ðŸ—‘", "Delete", () => removeMessage(message))
    );
  }

  // Incoming avatar
  if (!mine) {
    const avatar = document.createElement("div");

    avatar.className = "message-avatar";

    createAvatar(
      avatar,
      partnerEmail,
      USERS[partnerEmail]?.emoji || "ðŸ’œ"
    );

    row.appendChild(avatar);
  }

  row.append(bubble, tools);

  return row;
}

function receiptEmoji(status) {
  if (status === "read") return "ðŸ’œ";
  if (status === "delivered") return "â¤ï¸â€ðŸ”¥";
  return "ðŸ‘Œ";
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
      message.text || "Message";
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

$("attachmentBtn")?.addEventListener("click", () => {
  alert(
    "Photo, video and document sharing will be enabled later."
  );
});

$("microphoneBtn")?.addEventListener("click", () => {
  alert(
    "Voice notes will be enabled later."
  );
});

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

window.addEventListener("beforeunload", () => {
  messagesUnsubscribe?.();
  presenceCleanup?.();

  clearTimeout(typingTimeout);

  if (currentUser) {
    clearMyActivity(currentUser.uid);
  }
});


