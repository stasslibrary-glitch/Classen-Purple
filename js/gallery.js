
import { auth, db } from "./firebase.js";

import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

/* =====================================
   CLOUDINARY CONFIGURATION
===================================== */

const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUDINARY_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";

/* =====================================
   FIRESTORE GALLERY
===================================== */

const galleryCollection = collection(db, "sharedGallery", "main", "items");

const $ = (id) => document.getElementById(id);

const galleryGrid = $("galleryGrid");
const galleryMessage = $("galleryMessage");
const galleryCount = $("galleryCount");
const galleryFile = $("galleryFile");
const galleryCaption = $("galleryCaption");

const progressWrap = $("uploadProgressWrap");
const progressBar = $("uploadProgressBar");
const uploadStatus = $("uploadStatus");

const viewer = $("galleryViewer");
const viewerMedia = $("viewerMedia");
const viewerCaption = $("viewerCaption");
const viewerUploader = $("viewerUploader");
const viewerDate = $("viewerDate");

let currentUser = null;
let memories = [];
let activeViewerIndex = 0;
let unsubscribeGallery = null;

/* =====================================
   ACCOUNT DISPLAY NAMES
===================================== */

function getDisplayName(user) {
  const email = (user.email || "").toLowerCase();

  if (email === "m.classen@gmail.com") return "Baby ❤️";
  if (email === "d.classen@gmail.com") return "Hubby 💜";

  return user.displayName || email || "Our account";
}

/* =====================================
   DATE FORMATTING
===================================== */

function formatDate(timestamp) {
  if (!timestamp) return "Just shared";

  const date = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Just shared";

  return date.toLocaleString("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* =====================================
   UPLOAD PROGRESS
===================================== */

function showProgress(percent, message) {
  progressWrap.hidden = false;
  progressBar.style.width = `${percent}%`;
  uploadStatus.textContent = message;
}

function hideProgress() {
  progressWrap.hidden = true;
  progressBar.style.width = "0%";
}

/* =====================================
   CLOUDINARY UPLOAD
===================================== */

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    if (
      CLOUDINARY_CLOUD_NAME === "YOUR_CLOUDINARY_CLOUD_NAME" ||
      CLOUDINARY_UPLOAD_PRESET === "YOUR_UNSIGNED_UPLOAD_PRESET"
    ) {
      reject(new Error("Add your Cloudinary cloud name and upload preset in gallery.js first."));
      return;
    }

    const resourceType = file.type.startsWith("video/")
      ? "video"
      : "image";

    const endpoint =
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();

    xhr.open("POST", endpoint);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round(
          (event.loaded / event.total) * 100
        );

        showProgress(percent, `Uploading... ${percent}%`);
      }
    });

    xhr.onload = () => {
      let result;

      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Cloudinary returned an unreadable response."));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && result.secure_url) {
        resolve({
          url: result.secure_url,
          resourceType,
          format: result.format || "",
          publicId: result.public_id || ""
        });
      } else {
        reject(
          new Error(result.error?.message || "Media upload failed.")
        );
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error while uploading. Check your connection."));
    };

    xhr.send(formData);
  });
}

/* =====================================
   SELECT AND UPLOAD MEDIA
===================================== */

galleryFile.addEventListener("change", async () => {
  const file = galleryFile.files?.[0];

  if (!file) return;

  if (!currentUser) {
    alert("Please sign in before adding a memory.");
    galleryFile.value = "";
    return;
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    alert("Please select an image or video.");
    galleryFile.value = "";
    return;
  }

  const caption = galleryCaption.value.trim();

  try {
    showProgress(0, "Preparing your memory...");

    const uploaded = await uploadToCloudinary(file);

    showProgress(100, "Saving to our shared gallery...");

    await addDoc(galleryCollection, {
      url: uploaded.url,
      resourceType: uploaded.resourceType,
      format: uploaded.format,
      publicId: uploaded.publicId,
      caption,
      uploadedBy: currentUser.uid,
      uploaderName: getDisplayName(currentUser),
      uploaderEmail: currentUser.email || "",
      createdAt: serverTimestamp()
    });

    galleryCaption.value = "";
    galleryFile.value = "";

    showProgress(100, "Memory shared successfully ❤️");

    setTimeout(hideProgress, 1800);

  } catch (error) {
    console.error("Gallery upload error:", error);

    showProgress(0, error.message || "Could not upload this memory.");
    alert(error.message || "Something went wrong while uploading.");
  }
});

/* =====================================
   CREATE GALLERY ITEM
===================================== */

function createGalleryItem(memory, index) {
  const item = document.createElement("button");

  item.type = "button";
  item.className = "gallery-item";
  item.setAttribute("aria-label", "Open memory");

  if (memory.resourceType === "video") {
    const placeholder = document.createElement("div");
    placeholder.className = "gallery-video-placeholder";

    const playIcon = document.createElement("span");
    playIcon.textContent = "▶";

    placeholder.appendChild(playIcon);
    item.appendChild(placeholder);
  } else {
    const image = document.createElement("img");
    image.src = memory.url;
    image.alt = memory.caption || "Shared memory";
    image.loading = "lazy";
    item.appendChild(image);
  }

  const info = document.createElement("div");
  info.className = "gallery-item-info";

  const title = document.createElement("strong");
  title.textContent = memory.caption || "A special memory";

  const details = document.createElement("small");
  details.textContent =
    `${memory.uploaderName || "One of us"} · ${formatDate(memory.createdAt)}`;

  info.append(title, details);
  item.appendChild(info);

  item.addEventListener("click", () => openViewer(index));

  return item;
}

/* =====================================
   DISPLAY SHARED GALLERY
===================================== */

function renderGallery() {
  galleryGrid.replaceChildren();

  galleryCount.textContent =
    `${memories.length} ${memories.length === 1 ? "memory" : "memories"}`;

  if (memories.length === 0) {
    galleryMessage.hidden = false;
    galleryMessage.textContent =
      "No memories yet. Add your first photo or video together ❤️";
    return;
  }

  galleryMessage.hidden = true;

  memories.forEach((memory, index) => {
    galleryGrid.appendChild(createGalleryItem(memory, index));
  });
}

/* =====================================
   FULL-SCREEN VIEWER
===================================== */

function openViewer(index) {
  if (!memories.length) return;

  activeViewerIndex =
    (index + memories.length) % memories.length;

  const memory = memories[activeViewerIndex];

  viewerMedia.replaceChildren();

  if (memory.resourceType === "video") {
    const video = document.createElement("video");

    video.src = memory.url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "auto";
    video.muted = true;

    viewerMedia.appendChild(video);

    video.play().catch(() => {
      // Some browsers may require the viewer to be tapped
      // before video playback can begin.
    });

  } else {
    const image = document.createElement("img");

    image.src = memory.url;
    image.alt = memory.caption || "Our memory";

    viewerMedia.appendChild(image);
  }

  viewerCaption.textContent =
    memory.caption || "A special memory ❤️";

  viewerUploader.textContent =
    `Shared by ${memory.uploaderName || "one of us"}`;

  viewerDate.textContent = formatDate(memory.createdAt);

  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeViewer() {
  viewer.classList.remove("open");
  viewer.setAttribute("aria-hidden", "true");

  const video = viewerMedia.querySelector("video");

  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  viewerMedia.replaceChildren();
  document.body.style.overflow = "";
}

function showPrevious() {
  openViewer(activeViewerIndex - 1);
}

function showNext() {
  openViewer(activeViewerIndex + 1);
}

$("viewerClose").addEventListener("click", closeViewer);
$("viewerPrevious").addEventListener("click", showPrevious);
$("viewerNext").addEventListener("click", showNext);

viewer.addEventListener("click", (event) => {
  if (event.target === viewer) closeViewer();
});

document.addEventListener("keydown", (event) => {
  if (!viewer.classList.contains("open")) return;

  if (event.key === "Escape") closeViewer();
  if (event.key === "ArrowLeft") showPrevious();
  if (event.key === "ArrowRight") showNext();
});

/* =====================================
   REAL-TIME FIRESTORE LISTENER
===================================== */

function startGalleryListener() {
  if (unsubscribeGallery) {
    unsubscribeGallery();
  }

  galleryMessage.hidden = false;
  galleryMessage.textContent = "Loading your memories...";

  const galleryQuery = query(
    galleryCollection,
    orderBy("createdAt", "desc")
  );

  unsubscribeGallery = onSnapshot(
    galleryQuery,
    (snapshot) => {
      memories = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      renderGallery();
    },
    (error) => {
      console.error("Gallery listener error:", error);

      galleryMessage.hidden = false;
      galleryMessage.textContent =
        "We couldn't load the gallery. Check your Firestore rules and internet connection.";
    }
  );
}

/* =====================================
   AUTHENTICATION
===================================== */

onAuthStateChanged(auth, (user) => {
  currentUser = user;

  if (user) {
    startGalleryListener();
  } else {
    if (unsubscribeGallery) {
      unsubscribeGallery();
      unsubscribeGallery = null;
    }

    memories = [];
    renderGallery();
    galleryMessage.textContent = "Please sign in to view your shared gallery.";
  }
});
