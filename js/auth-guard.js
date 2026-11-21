// js/auth-guard.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getProfileForEmail,
  ensureUserProfile
} from "./auth.js";

export function requireAuth() {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};

    unsubscribe = onAuthStateChanged(auth, async user => {
      unsubscribe();

      if (!user) {
        window.location.replace("./index.html");
        resolve(null);
        return;
      }

      if (!getProfileForEmail(user.email)) {
        await signOut(auth);
        window.location.replace("./index.html");
        resolve(null);
        return;
      }

      try {
        const profile = await ensureUserProfile(user);
        resolve({ user, profile });
      } catch (error) {
        reject(error);
      }
    }, reject);
  });
}