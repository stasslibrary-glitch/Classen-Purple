
/* =========================================
   CLASSEN PURPLE — GAMES HUB
========================================= */

import "./theme.js";

const gameSearch = document.getElementById("gameSearch");
const gamesGrid = document.getElementById("gamesGrid");
const noGames = document.getElementById("noGames");

const moreNavBtn = document.getElementById("moreNavBtn");
const moreNavMenu = document.getElementById("moreNavMenu");

/* =========================================
   GAME SEARCH
========================================= */

gameSearch.addEventListener("input", () => {
  const searchTerm = gameSearch.value
    .trim()
    .toLowerCase();

  const cards = gamesGrid.querySelectorAll(".game-card");

  let visibleCount = 0;

  cards.forEach(card => {
    const gameName = card.dataset.name || "";
    const gameText = card.textContent.toLowerCase();

    const matches =
      gameName.includes(searchTerm) ||
      gameText.includes(searchTerm);

    card.style.display = matches ? "" : "none";

    if (matches) visibleCount++;
  });

  noGames.classList.toggle("hidden", visibleCount !== 0);
});

/* =========================================
   MORE NAVIGATION
========================================= */

moreNavBtn?.addEventListener("click", event => {
  event.stopPropagation();
  moreNavMenu.classList.toggle("hidden");
});

document.addEventListener("click", event => {
  if (
    moreNavMenu &&
    moreNavBtn &&
    !moreNavMenu.contains(event.target) &&
    !moreNavBtn.contains(event.target)
  ) {
    moreNavMenu.classList.add("hidden");
  }
});

/* =========================================
   GAME CARD INTERACTIONS
========================================= */

document.querySelectorAll(".game-card").forEach(card => {
  card.addEventListener("click", () => {
    card.classList.add("opening");
  });
});

console.log("Classen Purple Games Hub ready 🎮💜");
