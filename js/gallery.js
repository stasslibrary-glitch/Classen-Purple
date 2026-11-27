
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

const CLOUDINARY_CLOUD_NAME = "acr8nu5e";
const CLOUDINARY_UPLOAD_PRESET = "classen_purple";
const CLOUDINARY_FOLDER = "classen-purple/gallery";

/* =====================================
   FIRESTORE
===================================== */

const galleryCollection = collection(
  db,
  "sharedGallery",
  "main",
  "items"
);

/* =====================================
   HTML ELEMENTS
===================================== */

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
  if (progressWrap) progressWrap.hidden = false;

  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }

  if (uploadStatus) {
    uploadStatus.textContent = message;
  }
}

function hideProgress() {
  if (progressWrap) progressWrap.hidden = true;
  if (progressBar) progressBar.style.width = "0%";
}

/* =====================================
   CLOUDINARY UPLOAD
===================================== */

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    if (
      !CLOUDINARY_CLOUD_NAME ||
      CLOUDINARY_CLOUD_NAME === "YOUR_CLOUDINARY_CLOUD_NAME" ||
      !CLOUDINARY_UPLOAD_PRESET ||
      CLOUDINARY_UPLOAD_PRESET === "YOUR_PRESET_NAME"
    ) {
      reject(
        new Error(
          "Please add your Cloudinary unsigned upload preset in gallery.js."
        )
      );
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
    formData.append("folder", CLOUDINARY_FOLDER);

    const xhr = new XMLHttpRequest();

    xhr.open("POST", endpoint);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;

      const percent = Math.round(
        (event.loaded / event.total) * 100
      );

      showProgress(percent, `Uploading... ${percent}%`);
    });

    xhr.onload = () => {
      let result;

      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Cloudinary returned an invalid response."));
        return;
      }

      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        result.secure_url
      ) {
        resolve({
          url: result.secure_url,
          resourceType,
          format: result.format || "",
          publicId: result.public_id || "",
          width: result.width || null,
          height: result.height || null,
          duration: result.duration || null
        });
      } else {
        reject(
          new Error(
            result.error?.message || "Cloudinary upload failed."
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new Error("Network error. Check your internet connection.")
      );
    };

    xhr.onabort = () => {
      reject(new Error("Upload was cancelled."));
    };

    xhr.send(formData);
  });
}

/* =====================================
   SELECT AND UPLOAD MEDIA
===================================== */

if (galleryFile) {
  galleryFile.addEventListener("change", async () => {
    const file = galleryFile.files?.[0];

    if (!file) return;

    if (!currentUser) {
      alert("Please sign in before adding a memory.");
      galleryFile.value = "";
      return;
    }

    if (
      !file.type.startsWith("image/") &&
      !file.type.startsWith("video/")
    ) {
      alert("Please select an image or video.");
      galleryFile.value = "";
      return;
    }

    const caption = galleryCaption?.value.trim() || "";

    try {
      galleryFile.disabled = true;

      showProgress(0, "Preparing your memory...");

      const uploaded = await uploadToCloudinary(file);

      showProgress(100, "Saving to our shared gallery...");

      await addDoc(galleryCollection, {
        url: uploaded.url,
        resourceType: uploaded.resourceType,
        format: uploaded.format,
        publicId: uploaded.publicId,
        width: uploaded.width,
        height: uploaded.height,
        duration: uploaded.duration,

        caption,

        uploadedBy: currentUser.uid,
        uploaderName: getDisplayName(currentUser),
        uploaderEmail: currentUser.email || "",

        createdAt: serverTimestamp()
      });

      if (galleryCaption) galleryCaption.value = "";

      galleryFile.value = "";

      showProgress(100, "Memory shared successfully ❤️");

      setTimeout(hideProgress, 1800);

    } catch (error) {
      console.error("Gallery upload error:", error);

      showProgress(
        0,
        error.message || "Could not upload this memory."
      );

      alert(error.message || "Something went wrong.");

    } finally {
      galleryFile.disabled = false;
    }
  });
}

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

  title.textContent =
    memory.caption || "A special memory";

  const details = document.createElement("small");

  details.textContent =
    `${memory.uploaderName || "One of us"} · ${formatDate(memory.createdAt)}`;

  info.append(title, details);
  item.appendChild(info);

  item.addEventListener("click", () => {
    openViewer(index);
  });

  return item;
}

/* =====================================
   DISPLAY SHARED GALLERY
===================================== */

function renderGallery() {
  if (!galleryGrid) return;

  galleryGrid.replaceChildren();

  if (galleryCount) {
    galleryCount.textContent =
      `${memories.length} ${memories.length === 1 ? "memory" : "memories"}`;
  }

  if (memories.length === 0) {
    if (galleryMessage) {
      galleryMessage.hidden = false;
      galleryMessage.textContent =
        "No memories yet. Add your first photo or video together ❤️";
    }

    return;
  }

  if (galleryMessage) galleryMessage.hidden = true;

  memories.forEach((memory, index) => {
    galleryGrid.appendChild(
      createGalleryItem(memory, index)
    );
  });
}

/* =====================================
   FULL-SCREEN VIEWER
===================================== */

function openViewer(index) {
  if (!memories.length || !viewer || !viewerMedia) return;

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

    // Muted autoplay is more widely supported by browsers.
    video.muted = true;

    viewerMedia.appendChild(video);

    video.play().catch(() => {
      // User can press play if autoplay is blocked.
    });

  } else {
    const image = document.createElement("img");

    image.src = memory.url;
    image.alt = memory.caption || "Our memory";

    viewerMedia.appendChild(image);
  }

  if (viewerCaption) {
    viewerCaption.textContent =
      memory.caption || "A special memory ❤️";
  }

  if (viewerUploader) {
    viewerUploader.textContent =
      `Shared by ${memory.uploaderName || "one of us"}`;
  }

  if (viewerDate) {
    viewerDate.textContent = formatDate(memory.createdAt);
  }

  viewer.classList.add("open");
  viewer.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";
}

function closeViewer() {
  if (!viewer || !viewerMedia) return;

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

/* =====================================
   VIEWER BUTTONS
===================================== */

$("viewerClose")?.addEventListener("click", closeViewer);

$("viewerPrevious")?.addEventListener("click", showPrevious);

$("viewerNext")?.addEventListener("click", showNext);

if (viewer) {
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) closeViewer();
  });
}

document.addEventListener("keydown", (event) => {
  if (!viewer?.classList.contains("open")) return;

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
    unsubscribeGallery = null;
  }

  if (galleryMessage) {
    galleryMessage.hidden = false;
    galleryMessage.textContent = "Loading your memories...";
  }

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

      // Keep the viewer on the same memory if possible.
      if (viewer?.classList.contains("open")) {
        const currentMemoryId = memories[activeViewerIndex]?.id;

        const updatedIndex = memories.findIndex(
          (memory) => memory.id === currentMemoryId
        );

        if (updatedIndex !== -1) {
          activeViewerIndex = updatedIndex;
        }
      }
    },

    (error) => {
      console.error("Gallery listener error:", error);

      if (galleryMessage) {
        galleryMessage.hidden = false;
        galleryMessage.textContent =
          "We couldn't load the gallery. Check your Firestore rules and internet connection.";
      }
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

    closeViewer();
    renderGallery();

    if (galleryMessage) {
      galleryMessage.hidden = false;
      galleryMessage.textContent =
        "Please sign in to view your shared gallery.";
    }
  }
});

/* =====================================
   CLEANUP
===================================== */

window.addEventListener("pagehide", () => {
  if (unsubscribeGallery) {
    unsubscribeGallery();
    unsubscribeGallery = null;
  }
});
