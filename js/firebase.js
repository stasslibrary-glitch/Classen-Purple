
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

/* =====================================
   CLASSEN PURPLE FIREBASE CONFIG
===================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDD4riTyBDWKNBYrGTIjIEEMXDJKs7qWDg",
  authDomain: "classenp-a805f.firebaseapp.com",
  databaseURL: "https://classenp-a805f-default-rtdb.firebaseio.com",
  projectId: "classenp-a805f",
  storageBucket: "classenp-a805f.firebasestorage.app",
  messagingSenderId: "53984301250",
  appId: "1:53984301250:web:14c9aefab64492d418ab5b"
};

/* =====================================
   INITIALIZE FIREBASE
===================================== */

const app = initializeApp(firebaseConfig);

/* =====================================
   FIREBASE SERVICES
===================================== */

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

/* =====================================
   EXPORT SERVICES
===================================== */

export {
  app,
  auth,
  db,
  storage
};

console.log("Classen Purple Firebase connected 💜");
