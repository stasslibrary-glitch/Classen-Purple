import { auth, db } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    signOut,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const USERS = {
    "m.classen@gmail.com": {
        displayName: "Baby",
        identity: "Baby ❤️",
        partnerName: "Hubby",
        partnerEmail: "d.classen@gmail.com"
    },

    "d.classen@gmail.com": {
        displayName: "Hubby",
        identity: "Hubby 💜",
        partnerName: "Baby",
        partnerEmail: "m.classen@gmail.com"
    }
};

export function getProfileForEmail(email) {
    return USERS[email?.toLowerCase()] || null;
}

export async function ensureUserProfile(user) {
    const email = user?.email?.toLowerCase();
    const details = getProfileForEmail(email);
    if (!details) throw new Error("This account is not authorised.");

    const userRef = doc(db, "users", user.uid);
    const payload = {
        email,
        ...details,
        updatedAt: serverTimestamp()
    };

    const existing = await getDoc(userRef);
    if (!existing.exists()) {
        payload.createdAt = serverTimestamp();
        payload.theme = "lavender-dream";
    }

    await setDoc(userRef, payload, { merge: true });
    return { email, uid: user.uid, ...details, ...(existing.data() || {}) };
}

export async function login(email, password) {
    email = email.trim().toLowerCase();

    if (!USERS[email]) {
        throw new Error("This account is not authorised.");
    }

    await setPersistence(auth, browserLocalPersistence);

    const result = await signInWithEmailAndPassword(
        auth,
        email,
        password
    );

    await ensureUserProfile(result.user);

    return result.user;
}

export async function logout() {
    await signOut(auth);
    window.location.href = "index.html";
}
