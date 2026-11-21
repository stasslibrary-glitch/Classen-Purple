
import { db } from "./firebase.js";

import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

/* =====================================
   CLASSEN PURPLE FIRESTORE PRESENCE
===================================== */

const HEARTBEAT_INTERVAL = 15000;
const ONLINE_TIMEOUT = 45000;
const TYPING_TIMEOUT = 5000;

/* =====================================
   TIMESTAMP CONVERTER
===================================== */

function timestampToMillis(timestamp) {
  if (!timestamp) return 0;

  if (typeof timestamp.toMillis === "function") {
    return timestamp.toMillis();
  }

  if (typeof timestamp === "number") {
    return timestamp;
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? 0
    : date.getTime();
}

/* =====================================
   START PRESENCE
===================================== */

export async function startPresence(myUID, partnerUID, onStatus) {
  if (!myUID || !partnerUID) {
    throw new Error("Missing user ID for presence.");
  }

  const myPresenceRef = doc(db, "presence", myUID);
  const partnerPresenceRef = doc(db, "presence", partnerUID);

  let partnerData = {};
  let heartbeatTimer = null;
  let statusTimer = null;
  let active = true;

  async function heartbeat() {
    if (!active) return;

    try {
      await setDoc(myPresenceRef, {
        uid: myUID,
        online: true,
        heartbeatAt: serverTimestamp()
      }, { merge: true });

    } catch (error) {
      console.error("Presence heartbeat failed:", error);
    }
  }

  function publishStatus() {
    clearTimeout(statusTimer);

    const now = Date.now();

    const heartbeatTime = timestampToMillis(
      partnerData.heartbeatAt
    );

    const activityTime = timestampToMillis(
      partnerData.activityAt
    );

    const online =
      partnerData.online === true &&
      heartbeatTime > 0 &&
      now - heartbeatTime < ONLINE_TIMEOUT;

    const activityIsRecent =
      activityTime > 0 &&
      now - activityTime < TYPING_TIMEOUT;

    const typing =
      online &&
      partnerData.typing === true &&
      activityIsRecent;

    const recording =
      online &&
      partnerData.recording === true &&
      activityIsRecent;

    onStatus({
      online,
      lastSeen: online
        ? null
        : partnerData.lastSeen || partnerData.heartbeatAt || null,
      typing,
      recording
    });

    // Recheck when the online heartbeat expires.
    if (online) {
      const remaining = Math.max(
        500,
        ONLINE_TIMEOUT - (now - heartbeatTime) + 100
      );

      statusTimer = setTimeout(publishStatus, remaining);
    }

    // Recheck when the typing signal expires.
    if (typing || recording) {
      const remaining = Math.max(
        500,
        TYPING_TIMEOUT - (now - activityTime) + 100
      );

      clearTimeout(statusTimer);
      statusTimer = setTimeout(publishStatus, remaining);
    }
  }

  // Listen to the partner's Firestore presence document.
  const unsubscribe = onSnapshot(
    partnerPresenceRef,
    snapshot => {
      partnerData = snapshot.exists()
        ? snapshot.data()
        : {};

      publishStatus();
    },
    error => {
      console.error("Presence listener failed:", error);

      onStatus({
        online: false,
        lastSeen: null,
        typing: false,
        recording: false
      });
    }
  );

  // Mark this account online immediately.
  await setDoc(myPresenceRef, {
    uid: myUID,
    online: true,
    heartbeatAt: serverTimestamp(),
    lastSeen: null,
    typing: false,
    recording: false,
    activityAt: serverTimestamp()
  }, { merge: true });

  // Keep the account online while the page is active.
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);

  // Cleanup function returned to chat.js.
  return async function cleanup() {
    active = false;

    clearInterval(heartbeatTimer);
    clearTimeout(statusTimer);

    unsubscribe();

    try {
      await setDoc(myPresenceRef, {
        online: false,
        lastSeen: serverTimestamp(),
        typing: false,
        recording: false,
        activityAt: serverTimestamp()
      }, { merge: true });

    } catch (error) {
      console.warn("Presence cleanup failed:", error);
    }
  };
}

/* =====================================
   SET TYPING / RECORDING ACTIVITY
===================================== */

export async function setMyActivity(uid, activity = {}) {
  if (!uid) return;

  try {
    await updateDoc(doc(db, "presence", uid), {
      typing: activity.typing === true,
      recording: activity.recording === true,
      activityAt: serverTimestamp()
    });

  } catch (error) {
    console.warn("Could not update activity:", error);
  }
}

/* =====================================
   CLEAR TYPING / RECORDING ACTIVITY
===================================== */

export async function clearMyActivity(uid) {
  if (!uid) return;

  try {
    await updateDoc(doc(db, "presence", uid), {
      typing: false,
      recording: false,
      activityAt: serverTimestamp()
    });

  } catch (error) {
    console.warn("Could not clear activity:", error);
  }
}
