import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { THEMES, applyTheme, saveTheme } from "./theme.js";

const grid = document.getElementById("themeGrid");
const status = document.getElementById("themeStatus");

let saving = false;

function renderThemes() {
  grid.innerHTML = "";

  Object.entries(THEMES).forEach(([id, theme]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-option";
    button.dataset.theme = id;

    button.innerHTML = `
      <div class="theme-preview" data-effect="${theme.effect || ""}"
           style="--preview-start:${theme.start};--preview-end:${theme.end}">
        <span></span>
        <span></span>
        <span></span>
        <i class="theme-preview-sheen" aria-hidden="true"></i>
      </div>

      <div class="theme-info">
        <strong>${theme.name}</strong>
        <small>${theme.description}</small>
      </div>

      <span class="theme-check" aria-hidden="true">✓</span>
    `;

    grid.appendChild(button);
  });
}

function markSelected(themeId) {
  grid.querySelectorAll(".theme-option").forEach((button) => {
    const selected = button.dataset.theme === themeId;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function setStatus(message) {
  if (status) status.textContent = message;
}

renderThemes();

const cachedTheme = localStorage.getItem("classenPurpleTheme");
const initialTheme = THEMES[cachedTheme] ? cachedTheme : "royal-purple";
applyTheme(initialTheme);
markSelected(initialTheme);

window.addEventListener("classen-theme-changed", (event) => {
  const themeId = event.detail?.themeId;
  if (!THEMES[themeId]) return;
  markSelected(themeId);
  setStatus(`${THEMES[themeId].name} is our current theme.`);
});

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.replace("index.html");
});

grid?.addEventListener("click", async (event) => {
  const button = event.target.closest(".theme-option");
  if (!button || saving) return;

  const themeId = button.dataset.theme;
  if (!THEMES[themeId]) return;

  saving = true;
  grid.querySelectorAll(".theme-option").forEach((item) => { item.disabled = true; });

  applyTheme(themeId);
  markSelected(themeId);
  setStatus(`Applying ${THEMES[themeId].name}...`);

  try {
    await saveTheme(themeId);
    setStatus(`✓ ${THEMES[themeId].name} is now our shared theme.`);
  } catch (error) {
    console.error("Theme save failed:", error);
    setStatus("Theme changed on this device, but Firebase sync failed.");
  } finally {
    saving = false;
    grid.querySelectorAll(".theme-option").forEach((item) => { item.disabled = false; });
  }
});
