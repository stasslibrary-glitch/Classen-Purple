import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const PLAYERS = {
  "m.classen@gmail.com": { key: "baby", label: "Baby ❤️", email: "m.classen@gmail.com" },
  "d.classen@gmail.com": { key: "hubby", label: "Hubby 💜", email: "d.classen@gmail.com" }
};

export function getPlayer(email) {
  return PLAYERS[email?.toLowerCase()] || null;
}

export function coupleRoomId(email) {
  // Single authorized couple - stable room id.
  return "classen-purple-couple";
}

export function sessionRef(gameType) {
  return doc(db, "gameSessions", `${coupleRoomId()}_${gameType}`);
}

export function waitForUser() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (!user) { location.replace("index.html"); resolve(null); return; }
      resolve(user);
    }, reject);
  });
}

export async function ensureSession(gameType, initialStateFactory) {
  const ref = sessionRef(gameType);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;
    tx.set(ref, {
      gameType,
      roomId: coupleRoomId(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      state: initialStateFactory(),
      version: 1
    });
  });
  return ref;
}

export function subscribeSession(gameType, cb) {
  return onSnapshot(sessionRef(gameType), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => {
    console.error("Game session listener failed", err);
    cb(null, err);
  });
}

export async function patchState(gameType, updater, initialStateFactory) {
  const ref = sessionRef(gameType);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? snap.data() : {
      gameType, roomId: coupleRoomId(), createdAt: serverTimestamp(), state: initialStateFactory(), version: 0
    };
    const nextState = updater(current.state || initialStateFactory(), current);
    tx.set(ref, {
      ...current,
      state: nextState,
      updatedAt: serverTimestamp(),
      version: (current.version || 0) + 1
    }, { merge: true });
  });
}

export async function resetSession(gameType, initialStateFactory) {
  const ref = sessionRef(gameType);
  await setDoc(ref, {
    gameType,
    roomId: coupleRoomId(),
    state: initialStateFactory(),
    updatedAt: serverTimestamp(),
    resetAt: serverTimestamp(),
    version: 1
  }, { merge: true });
}
