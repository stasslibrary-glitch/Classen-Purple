
import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const allowedProfiles = {
  "m.classen@gmail.com": { name: "Baby ❤️" },
  "d.classen@gmail.com": { name: "Hubby 💜" }
};

const CHAT_ID = "classen-purple-private";
let unreadChatUnsubscribe = null;
let initialUnreadLoaded = false;
let lastUnreadCount = 0;
const homeMessageSound = new Audio("sounds/message.mp3");
homeMessageSound.preload = "auto";

function playHomeMessageSound() {
  try {
    homeMessageSound.currentTime = 0;
    const p = homeMessageSound.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (_) {}
}

function ensureChatBadges() {
  const chatCard = document.querySelector('.home-card[href="chat.html"]');
  if (chatCard && !chatCard.querySelector(".home-chat-badge")) {
    const badge = document.createElement("span");
    badge.className = "home-chat-badge hidden";
    badge.textContent = "0";
    chatCard.style.position = "relative";
    chatCard.appendChild(badge);
  }
  const bottomChat = document.querySelector('.bottom-link[href="chat.html"]');
  if (bottomChat && !bottomChat.querySelector(".home-chat-badge")) {
    const badge = document.createElement("span");
    badge.className = "home-chat-badge home-chat-badge-nav hidden";
    badge.textContent = "0";
    bottomChat.style.position = "relative";
    bottomChat.appendChild(badge);
  }
}

function setUnreadBadge(count) {
  ensureChatBadges();
  document.querySelectorAll(".home-chat-badge").forEach((badge) => {
    badge.textContent = String(count);
    badge.classList.toggle("hidden", count <= 0);
  });
}

function startUnreadChatListener(user) {
  unreadChatUnsubscribe?.();
  initialUnreadLoaded = false;
  lastUnreadCount = 0;
  const messagesRef = collection(db, "chats", CHAT_ID, "messages");
  const q = query(messagesRef, where("senderUID", "!=", user.uid));
  unreadChatUnsubscribe = onSnapshot(q, (snapshot) => {
    let unread = 0;
    snapshot.docs.forEach((d) => {
      const msg = d.data();
      if (msg.status !== "read") unread += 1;
    });
    setUnreadBadge(unread);
    if (initialUnreadLoaded && unread > lastUnreadCount) playHomeMessageSound();
    initialUnreadLoaded = true;
    lastUnreadCount = unread;
  }, (error) => {
    console.warn("Home unread chat listener error:", error);
  });
}

// Relationship start date
const relationshipStart = new Date(2026, 5, 26);

function updateCounter() {
  const today = new Date();

  const start = new Date(
    relationshipStart.getFullYear(),
    relationshipStart.getMonth(),
    relationshipStart.getDate()
  );

  const current = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const days = Math.max(
    0,
    Math.floor((current - start) / 86400000)
  );

  document.getElementById("relationshipDays").textContent =
    days.toLocaleString();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }

  const email = (user.email || "").toLowerCase();
  const profile = allowedProfiles[email];

  if (!profile) {
    await signOut(auth);
    window.location.replace("index.html");
    return;
  }

  const nameElement = document.getElementById("userName");
  nameElement.textContent = profile.name;

  try {
    const profileSnapshot = await getDoc(
      doc(db, "users", user.uid)
    );

    if (profileSnapshot.exists()) {
      const savedName = profileSnapshot.data().displayName;

      if (savedName) {
        nameElement.textContent = savedName;
      }
    }
  } catch (error) {
    console.error("Profile loading error:", error);
  }

  updateCounter();
  startUnreadChatListener(user);
});

