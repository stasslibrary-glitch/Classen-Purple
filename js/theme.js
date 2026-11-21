import { db } from "./firebase.js";

import {
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const THEME_KEY = "classenPurpleTheme";
const themeRef = doc(db, "appSettings", "globalTheme");

export const THEMES = {
  "pure-gold": {
    name: "Real Gold",
    description: "Liquid gold foil · luminous shimmer",
    effect: "gold-shimmer",
    start: "#6B4A0E",
    end: "#E3B341",
    colors: {
      primary: "#B8860B",
      primaryDark: "#5C3A00",
      primaryLight: "#F2C14E",
      accent: "#FFE8A3",
      background: "#FBF5E6",
      surface: "#FFFDF5",
      surfaceSoft: "#F5E8C8",
      text: "#3A2A0A",
      muted: "#8A7652",
      border: "#E6D3A3",
      nav: "#FFFDF5"
    }
  },

  "glassy": {
    name: "Glassy",
    description: "Adaptive glassmorphism · frosted depth",
    effect: "adaptive-glass",
    start: "#392951",
    end: "#A78BD1",
    colors: {
      primary: "#7E63B3",
      primaryDark: "#342348",
      primaryLight: "#C7B0F0",
      accent: "#E8DCFF",
      background: "#E8E0F3",
      surface: "rgba(255,255,255,.52)",
      surfaceSoft: "rgba(255,255,255,.30)",
      text: "#2E2040",
      muted: "#756887",
      border: "rgba(255,255,255,.62)",
      nav: "rgba(255,255,255,.62)"
    }
  },

  "royal-purple": {
    name: "Royal Purple",
    description: "Kinetic typography · royal bloom",
    effect: "kinetic-typography",
    start: "#32154F",
    end: "#8652B6",
    colors: {
      primary: "#7041A0",
      primaryDark: "#3D1D60",
      primaryLight: "#A77BD2",
      accent: "#E0C4FA",
      background: "#F5F0FA",
      surface: "#FFFFFF",
      surfaceSoft: "#EEE5F7",
      text: "#30213E",
      muted: "#8D7D9B",
      border: "#E9DFF1",
      nav: "#FFFFFF"
    }
  },

  "royal-red": {
    name: "Royal Red",
    description: "Ember pulse · crimson warmth",
    effect: "ember-pulse",
    start: "#3A0B16",
    end: "#D6455D",
    colors: {
      primary: "#C12F48",
      primaryDark: "#5A1222",
      primaryLight: "#F07A8A",
      accent: "#FFD3DA",
      background: "#FFF1F3",
      surface: "#FFFFFF",
      surfaceSoft: "#FCE4E8",
      text: "#4A2028",
      muted: "#A17980",
      border: "#F2D7DC",
      nav: "#FFFFFF"
    }
  },

  "sky-blue": {
    name: "Sky Blue",
    description: "Aurora drift · airy light flow",
    effect: "aurora-drift",
    start: "#123B62",
    end: "#3799D5",
    colors: {
      primary: "#2787BD",
      primaryDark: "#183A5B",
      primaryLight: "#75BDE8",
      accent: "#C3EAFF",
      background: "#EDF7FD",
      surface: "#FFFFFF",
      surfaceSoft: "#DCEFFA",
      text: "#20394E",
      muted: "#7893A7",
      border: "#D8E9F4",
      nav: "#FFFFFF"
    }
  },

  "midnight": {
    name: "Midnight",
    description: "Neon constellation · starlit glow",
    effect: "neon-constellation",
    start: "#090711",
    end: "#6747A1",
    colors: {
      primary: "#9668E8",
      primaryDark: "#100D1D",
      primaryLight: "#C2A3FF",
      accent: "#D9C6FF",
      background: "#171323",
      surface: "#241D32",
      surfaceSoft: "#302641",
      text: "#F5EFFF",
      muted: "#B0A3C2",
      border: "#40344F",
      nav: "#211A2E"
    }
  },

  "emerald": {
    name: "Emerald",
    description: "Aurora jade · living green shimmer",
    effect: "aurora-jade",
    start: "#123426",
    end: "#36896B",
    colors: {
      primary: "#2F8A68",
      primaryDark: "#174B3A",
      primaryLight: "#76C5A2",
      accent: "#B9EFD7",
      background: "#EFF8F3",
      surface: "#FFFFFF",
      surfaceSoft: "#E0F1E8",
      text: "#234335",
      muted: "#78998A",
      border: "#D8E9DF",
      nav: "#FFFFFF"
    }
  },

  "rose-blush": {
    name: "Rose Blush",
    description: "Bokeh bloom · soft romantic light",
    effect: "bokeh-bloom",
    start: "#492338",
    end: "#D67DA3",
    colors: {
      primary: "#BD668B",
      primaryDark: "#71344F",
      primaryLight: "#E69ABB",
      accent: "#FFD0E4",
      background: "#FFF1F6",
      surface: "#FFFFFF",
      surfaceSoft: "#FBE2EC",
      text: "#492B3B",
      muted: "#A17D8E",
      border: "#F1D9E4",
      nav: "#FFFFFF"
    }
  }
};

export function applyTheme(themeId) {
  const theme = THEMES[themeId] || THEMES["royal-purple"];
  const root = document.documentElement;
  const c = theme.colors;

  root.dataset.theme = themeId;
  root.dataset.themeEffect = theme.effect || "";
  if (document.body) document.body.dataset.theme = themeId;

  const variables = {
    "--primary": c.primary,
    "--primary-dark": c.primaryDark,
    "--primary-light": c.primaryLight,
    "--accent": c.accent,
    "--background": c.background,
    "--surface": c.surface,
    "--surface-soft": c.surfaceSoft,
    "--text": c.text,
    "--muted": c.muted,
    "--border": c.border,
    "--home-bg": c.background,
    "--home-header": c.primaryDark,
    "--home-header-end": c.primary,
    "--home-card": c.surface,
    "--home-tile": c.surfaceSoft,
    "--home-text": c.text,
    "--home-muted": c.muted,
    "--home-border": c.border,
    "--home-accent": c.primaryLight,
    "--home-nav": c.nav,
    "--theme-start": theme.start,
    "--theme-end": theme.end
  };

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  localStorage.setItem(THEME_KEY, themeId);
  ensureThemeFxLayer(themeId, theme.effect);

  window.dispatchEvent(new CustomEvent("classen-theme-changed", {
    detail: { themeId, theme }
  }));

  return theme;
}

function ensureThemeFxLayer(themeId, effect) {
  const apply = () => {
    const host = document.querySelector(".phone-screen") || document.body;
    if (!host) return;
    let layer = host.querySelector(".theme-fx-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "theme-fx-layer";
      layer.setAttribute("aria-hidden", "true");
      layer.innerHTML = '<span class="fx-a"></span><span class="fx-b"></span><span class="fx-c"></span><span class="fx-d"></span>';
      host.prepend(layer);
    }
    layer.dataset.theme = themeId;
    layer.dataset.effect = effect || "";
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply, { once: true });
  } else {
    apply();
  }
}

// Apply cached theme immediately.
const cached = localStorage.getItem(THEME_KEY);

if (cached && THEMES[cached]) {
  applyTheme(cached);
}

// Synchronise the shared theme from Firebase.
let stopThemeSync = null;

export function startThemeSync() {
  if (stopThemeSync) return;

  stopThemeSync = onSnapshot(
    themeRef,
    (snapshot) => {
      const themeId = snapshot.exists()
        ? snapshot.data().themeId
        : "royal-purple";

      applyTheme(THEMES[themeId] ? themeId : "royal-purple");
    },
    (error) => {
      console.error("Shared theme sync failed:", error);
    }
  );
}

export async function saveTheme(themeId) {
  if (!THEMES[themeId]) {
    throw new Error("Invalid theme.");
  }

  applyTheme(themeId);

  await setDoc(themeRef, {
    themeId,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

startThemeSync();
