import { db } from "./firebase.js";
import {
  doc, onSnapshot, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const THEME_KEY = "classenPurpleTheme";
const DEFAULT_THEME = "lavender-dream";
const themeRef = doc(db, "appSettings", "globalTheme");

export const THEMES = {
  "lavender-dream":    { name: "Lavender Dream",    description: "Soft lavender, pink glow and dreamy hearts",       decoration: "hearts",     start: "#5A3D82", end: "#E8B4D8", preview: ["#5A3D82","#8B6FB0","#B89FD4","#E8B4D8"] },
  "midnight-love":     { name: "Midnight Love",     description: "Dark plum, glowing purple and starlit elegance",   decoration: "sparkles",   start: "#1A0F2E", end: "#9B7FC4", preview: ["#1A0F2E","#4A2C6E","#6B4F96","#C4A8E0"] },
  "blush-romance":     { name: "Blush Romance",     description: "Blush pink, rose warmth and romantic softness",    decoration: "hearts",     start: "#A85570", end: "#F5C6D6", preview: ["#A85570","#D4849A","#F0A8BE","#F5C6D6"] },
  "royal-gold":        { name: "Royal Gold",        description: "Black luxury with champagne gold shimmer",         decoration: "sparkles",   start: "#0D0D0D", end: "#E8C96A", preview: ["#0D0D0D","#8B6914","#C9A84C","#E8C96A"] },
  "butterfly-bliss":   { name: "Butterfly Bliss",   description: "Pastel purple and pink with fluttering calm",      decoration: "butterflies",start: "#6E5F9A", end: "#F0B8D0", preview: ["#6E5F9A","#9B8EC4","#C8BEE0","#F0B8D0"] },
  "neon-galaxy":       { name: "Neon Galaxy",       description: "Dark cosmos, neon pink and electric purple",       decoration: "stars",      start: "#080312", end: "#FF4DB8", preview: ["#080312","#8A20A8","#C44FE0","#FF4DB8"] },
  "teddy-bear":        { name: "Teddy Bear",        description: "Warm beige, caramel comfort and cozy charm",       decoration: "hearts",     start: "#7A5A3A", end: "#D4B896", preview: ["#7A5A3A","#A07A5A","#C9A07A","#D4B896"] },
  "cloud-nine":        { name: "Cloud Nine",        description: "Sky blue, white clouds and peaceful air",          decoration: "clouds",     start: "#3A86C8", end: "#B8E0FF", preview: ["#3A86C8","#6AAFE6","#A8D4F5","#B8E0FF"] },
  "kawaii-paradise":   { name: "Kawaii Paradise",   description: "Pastel pink, lilac and playful cuteness",          decoration: "sparkles",   start: "#C85A90", end: "#C4A0E8", preview: ["#C85A90","#E88AB8","#F5B0D0","#C4A0E8"] },
  "cosmic-love":       { name: "Cosmic Love",       description: "Deep space purple, galaxy glow and stars",         decoration: "stars",      start: "#140C28", end: "#C4A0F5", preview: ["#140C28","#3A1A6A","#6840B8","#C4A0F5"] },
  "coquette-dream":    { name: "Coquette Dream",    description: "Soft pink, ribbons, bows and romantic elegance",   decoration: "ribbons",    start: "#B05078", end: "#F5C0D0", preview: ["#B05078","#D4789A","#F0A0BE","#F5C0D0"] },
  "ocean-breeze":      { name: "Ocean Breeze",      description: "Turquoise, aqua flow and calming sea tones",       decoration: "bubbles",    start: "#1E7A74", end: "#7DD4CE", preview: ["#1E7A74","#3AA8A0","#70CCC5","#7DD4CE"] },
  "cherry-blossom":    { name: "Cherry Blossom",    description: "Cherry red, burgundy and falling petals",          decoration: "petals",     start: "#8A2840", end: "#F4B0BC", preview: ["#8A2840","#C45068","#E88898","#F4B0BC"] },
  "peach-paradise":    { name: "Peach Paradise",    description: "Warm peach, coral and sunset softness",            decoration: "flowers",    start: "#C86848", end: "#FFD0B8", preview: ["#C86848","#E89070","#F5B898","#FFD0B8"] },
  "sage-garden":       { name: "Sage Garden",       description: "Sage green, natural cream and botanical calm",     decoration: "leaves",     start: "#567856", end: "#B8D4B0", preview: ["#567856","#7A9A7A","#A5C0A5","#B8D4B0"] },
  "vanilla-cream":     { name: "Vanilla Cream",     description: "Warm ivory, beige and minimalist luxury",          decoration: "sparkles",   start: "#8A7050", end: "#E0D0B8", preview: ["#8A7050","#B09878","#D4C0A0","#E0D0B8"] }
};

// Backward compatibility for old theme IDs
const LEGACY_MAP = {
  "pure-gold": "royal-gold",
  "glassy": "lavender-dream",
  "royal-purple": "lavender-dream",
  "royal-red": "cherry-blossom",
  "sky-blue": "cloud-nine",
  "midnight": "midnight-love",
  "emerald": "sage-garden",
  "rose-blush": "blush-romance"
};

function normalizeThemeId(id) {
  if (THEMES[id]) return id;
  if (LEGACY_MAP[id]) return LEGACY_MAP[id];
  return DEFAULT_THEME;
}

export function getCurrentThemeId() {
  return normalizeThemeId(localStorage.getItem(THEME_KEY));
}

export function applyTheme(themeId, opts = {}) {
  const id = normalizeThemeId(themeId);
  const theme = THEMES[id];
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.decor = theme.decoration || "hearts";
  if (document.body) {
    document.body.dataset.theme = id;
    document.body.dataset.decor = theme.decoration || "hearts";
  }

  // Also set legacy-ish vars some pages may read
  root.style.setProperty("--theme-start", theme.start);
  root.style.setProperty("--theme-end", theme.end);

  localStorage.setItem(THEME_KEY, id);

  if (opts.transition !== false && typeof window.cpThemeTransition === "function") {
    window.cpThemeTransition();
  }

  window.dispatchEvent(new CustomEvent("classen-theme-changed", {
    detail: { themeId: id, theme }
  }));

  return theme;
}

// Apply cached theme immediately (no transition on boot)
const cached = normalizeThemeId(localStorage.getItem(THEME_KEY));
applyTheme(cached, { transition: false });

let stopThemeSync = null;
let lastSyncedId = null;

export function startThemeSync() {
  if (stopThemeSync) return;
  stopThemeSync = onSnapshot(themeRef, (snapshot) => {
    const remote = snapshot.exists() ? normalizeThemeId(snapshot.data().themeId) : DEFAULT_THEME;
    if (remote === lastSyncedId) return;
    lastSyncedId = remote;
    const local = getCurrentThemeId();
    if (remote !== local) applyTheme(remote);
  }, (error) => {
    console.warn("Theme sync unavailable:", error?.message || error);
  });
}

export async function saveTheme(themeId) {
  const id = normalizeThemeId(themeId);
  applyTheme(id);
  lastSyncedId = id;
  try {
    await setDoc(themeRef, { themeId: id, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn("Theme saved locally; Firebase sync failed:", err?.message || err);
  }
}

startThemeSync();

/* =========================================
   CONFIRMATION DIALOG
========================================= */
(function initConfirmDialog() {
  if (window.cpConfirm) return;
  function ensureDialog() {
    let overlay = document.getElementById("cpConfirmOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "cpConfirmOverlay";
    overlay.className = "cp-confirm-overlay";
    overlay.innerHTML = `
      <div class="cp-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="cpConfirmTitle">
        <div class="cp-confirm-icon" id="cpConfirmIcon">!</div>
        <h3 id="cpConfirmTitle">Please confirm</h3>
        <p id="cpConfirmMessage"></p>
        <div class="cp-confirm-actions">
          <button type="button" class="cp-confirm-btn cancel" id="cpConfirmCancel">Cancel</button>
          <button type="button" class="cp-confirm-btn confirm" id="cpConfirmOk">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }
  window.cpConfirm = function cpConfirm(options = {}) {
    const opts = typeof options === "string" ? { message: options } : options;
    const { title="Please confirm", message="Are you sure?", confirmText="Confirm", cancelText="Cancel", danger=true, icon=danger?"🗑":"?" } = opts;
    const overlay = ensureDialog();
    overlay.querySelector("#cpConfirmTitle").textContent = title;
    overlay.querySelector("#cpConfirmMessage").textContent = message;
    const okBtn = overlay.querySelector("#cpConfirmOk");
    const cancelBtn = overlay.querySelector("#cpConfirmCancel");
    okBtn.textContent = confirmText; cancelBtn.textContent = cancelText;
    overlay.querySelector("#cpConfirmIcon").textContent = icon;
    okBtn.classList.toggle("primary", !danger);
    overlay.classList.add("show");
    return new Promise((resolve) => {
      const cleanup = (result) => { overlay.classList.remove("show"); okBtn.removeEventListener("click", onOk); cancelBtn.removeEventListener("click", onCancel); overlay.removeEventListener("click", onOverlay); document.removeEventListener("keydown", onKey); resolve(result); };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };
      const onKey = (e) => { if (e.key === "Escape") cleanup(false); if (e.key === "Enter") cleanup(true); };
      okBtn.addEventListener("click", onOk); cancelBtn.addEventListener("click", onCancel); overlay.addEventListener("click", onOverlay); document.addEventListener("keydown", onKey);
      okBtn.focus();
    });
  };
})();

/* =========================================
   PROMPT / EDIT DIALOG
========================================= */
(function initPromptDialog() {
  if (window.cpPrompt) return;
  function ensureDialog() {
    let overlay = document.getElementById("cpPromptOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "cpPromptOverlay";
    overlay.className = "cp-prompt-overlay";
    overlay.innerHTML = `
      <div class="cp-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="cpPromptTitle">
        <h3 id="cpPromptTitle">Edit</h3>
        <p id="cpPromptMessage" class="hidden"></p>
        <textarea id="cpPromptInput" class="cp-prompt-input" rows="3"></textarea>
        <div class="cp-prompt-actions">
          <button type="button" class="cp-prompt-btn cancel" id="cpPromptCancel">Cancel</button>
          <button type="button" class="cp-prompt-btn confirm" id="cpPromptOk">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }
  window.cpPrompt = function cpPrompt(options = {}) {
    const opts = typeof options === "string" ? { message: options } : options;
    const { title="Edit", message="", value="", placeholder="", confirmText="Save", cancelText="Cancel", multiline=true } = opts;
    const overlay = ensureDialog();
    overlay.querySelector("#cpPromptTitle").textContent = title;
    const msgEl = overlay.querySelector("#cpPromptMessage");
    msgEl.textContent = message; msgEl.classList.toggle("hidden", !message);
    const input = overlay.querySelector("#cpPromptInput");
    input.value = value ?? ""; input.placeholder = placeholder || ""; input.rows = multiline ? 3 : 1;
    const okBtn = overlay.querySelector("#cpPromptOk");
    const cancelBtn = overlay.querySelector("#cpPromptCancel");
    okBtn.textContent = confirmText; cancelBtn.textContent = cancelText;
    overlay.classList.add("show");
    return new Promise((resolve) => {
      const cleanup = (result) => { overlay.classList.remove("show"); okBtn.removeEventListener("click", onOk); cancelBtn.removeEventListener("click", onCancel); overlay.removeEventListener("click", onOverlay); document.removeEventListener("keydown", onKey); resolve(result); };
      const onOk = () => cleanup(input.value);
      const onCancel = () => cleanup(null);
      const onOverlay = (e) => { if (e.target === overlay) cleanup(null); };
      const onKey = (e) => { if (e.key === "Escape") cleanup(null); if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !multiline)) { e.preventDefault(); cleanup(input.value); } };
      okBtn.addEventListener("click", onOk); cancelBtn.addEventListener("click", onCancel); overlay.addEventListener("click", onOverlay); document.addEventListener("keydown", onKey);
      setTimeout(() => { input.focus(); const len = input.value.length; input.setSelectionRange(len, len); }, 30);
    });
  };
})();
