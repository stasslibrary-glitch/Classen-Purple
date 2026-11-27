import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { THEMES, applyTheme, saveTheme, getCurrentThemeId } from "./theme.js";

const grid = document.getElementById("themeGrid");
const status = document.getElementById("themeStatus");
const countEl = document.getElementById("themeCount");
const searchInput = document.getElementById("themeSearch");

let saving = false;
let activeFilter = "all";

function renderThemes(filter = "") {
  if (!grid) return;
  const q = filter.trim().toLowerCase();
  const entries = Object.entries(THEMES).filter(([id, t]) => {
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || id.includes(q);
  });

  grid.innerHTML = "";
  if (countEl) countEl.textContent = `${Object.keys(THEMES).length} THEMES`;

  if (!entries.length) {
    grid.innerHTML = `<div class="theme-empty">No themes match "${q.replace(/</g,"&lt;")}"</div>`;
    return;
  }

  entries.forEach(([id, theme]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-option";
    btn.dataset.theme = id;
    btn.setAttribute("aria-label", `Apply ${theme.name} theme`);
    const swatches = (theme.preview || [theme.start, theme.end]).map(c => `<span style="background:${c}"></span>`).join("");
    btn.innerHTML = `
      <div class="theme-preview" style="--preview-start:${theme.start};--preview-end:${theme.end};background:linear-gradient(135deg,var(--preview-start),var(--preview-end))">
        <div class="theme-preview-swatches">${swatches}</div>
      </div>
      <div class="theme-info">
        <strong>${theme.name}</strong>
        <small>${theme.description}</small>
      </div>
      <span class="theme-check" aria-hidden="true">✓</span>
    `;
    grid.appendChild(btn);
  });

  markSelected(getCurrentThemeId());
}

function markSelected(themeId) {
  grid?.querySelectorAll(".theme-option").forEach((btn) => {
    const selected = btn.dataset.theme === themeId;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", String(selected));
  });
}

function setStatus(msg) { if (status) status.textContent = msg; }

renderThemes();

const initial = getCurrentThemeId();
markSelected(initial);
setStatus(`${THEMES[initial]?.name || "Theme"} is our current theme.`);

window.addEventListener("classen-theme-changed", (e) => {
  const id = e.detail?.themeId;
  if (!THEMES[id]) return;
  markSelected(id);
  setStatus(`${THEMES[id].name} is our current theme.`);
});

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.replace("index.html");
});

grid?.addEventListener("click", async (e) => {
  const btn = e.target.closest(".theme-option");
  if (!btn || saving) return;
  const id = btn.dataset.theme;
  if (!THEMES[id]) return;

  saving = true;
  grid.querySelectorAll(".theme-option").forEach(b => b.disabled = true);
  markSelected(id);
  setStatus(`Applying ${THEMES[id].name}...`);

  try {
    await saveTheme(id);
    setStatus(`✓ ${THEMES[id].name} is now our shared theme.`);
  } catch (err) {
    console.error("Theme save failed:", err);
    setStatus("Theme changed on this device, but sync failed.");
  } finally {
    saving = false;
    grid.querySelectorAll(".theme-option").forEach(b => b.disabled = false);
  }
});

searchInput?.addEventListener("input", (e) => renderThemes(e.target.value));
