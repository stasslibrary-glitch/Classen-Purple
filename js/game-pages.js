
/* =========================================
   CLASSEN PURPLE — ALL GAMES ENGINE
   Games: Truth or Dare, Wheel, Quiz,
   Would You Rather, Memory, More Likely,
   Guess the Song
========================================= */

import "./theme.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  ensureSession, subscribeSession, patchState, resetSession, getPlayer, coupleRoomId
} from "./game-session.js";

const gameType = document.body.dataset.game;
const app = document.getElementById("gameApp");

const PLAYERS = ["Baby ❤️", "Hubby 💜"];
const DIFFICULTIES = ["easy", "medium", "hard", "random"];

let state = {};
let history = JSON.parse(localStorage.getItem("classenGameHistory") || "[]");
let selectedDifficulty = localStorage.getItem("classenGameDifficulty") || "random";

let currentUser = null;
let currentPlayer = null; // {key,label,email}
let currentRole = null; // 'baby' | 'hubby' | 'spectator'
let remoteSession = null;
let unsubscribeSession = null;
let sessionReady = false;
let applyingRemote = false;

const SUPPORTED_LIVE_GAMES = ["truth-or-dare"];

const dataCache = {};

const DATA_FILES = {
  "truth-or-dare": ["data/truth-questions.json", "data/dare-tasks.json"],
  "couples-quiz": ["data/couples-questions.json"],
  "would-you-rather": ["data/would-you-rather.json"],
  "who-is-more-likely": ["data/more-likely-questions.json"],
  "guess-the-song": ["data/song-questions.json"],
  "memory-game": ["data/memory-items.json"],
  "spin-wheel": ["data/dare-tasks.json", "data/truth-questions.json"]
};

async function loadJSON(path) {
  if (dataCache[path]) return dataCache[path];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  dataCache[path] = data;
  return data;
}

async function loadGameData(type) {
  const files = DATA_FILES[type] || [];
  const entries = await Promise.all(files.map(async path => [path, await loadJSON(path)]));
  return Object.fromEntries(entries);
}

function filterByDifficulty(items, difficulty) {
  if (!difficulty || difficulty === "random") return [...items];
  const filtered = items.filter(item => item.difficulty === difficulty);
  return filtered.length ? filtered : [...items];
}

function pickByDifficulty(items, difficulty) {
  const pool = filterByDifficulty(items, difficulty);
  return shuffle(pool);
}

function getDifficultyLabel(value) {
  return ({ easy: "Easy", medium: "Medium", hard: "Hard", random: "Random" })[value] || "Random";
}

function difficultySelectorHTML() {
  return `
    <div class="game-difficulty-row" aria-label="Difficulty">
      ${DIFFICULTIES.map(level => `
        <button
          type="button"
          class="game-difficulty-btn ${selectedDifficulty === level ? "active" : ""}"
          data-action="set-difficulty"
          data-difficulty="${level}"
        >${getDifficultyLabel(level)}</button>
      `).join("")}
    </div>
  `;
}

const gameInfo = {
  "truth-or-dare": {
    title: "Truth or Dare",
    subtitle: "Be honest or take the challenge!",
    icon: "fa-fire",
    intro: "Take turns choosing truth or dare. No skipping the fun!"
  },
  "spin-wheel": {
    title: "Spin the Wheel",
    subtitle: "Let the wheel decide!",
    icon: "fa-dharmachakra",
    intro: "Take turns spinning for a random couple challenge."
  },
  "couples-quiz": {
    title: "Couples Quiz",
    subtitle: "How well do you know each other?",
    icon: "fa-brain",
    intro: "Each person predicts what their partner would choose. Match answers to earn points."
  },
  "would-you-rather": {
    title: "Would You Rather?",
    subtitle: "Two choices. One decision.",
    icon: "fa-shuffle",
    intro: "Both of you choose your favourite option and see whether you agree."
  },
  "memory-game": {
    title: "Memory Challenge",
    subtitle: "Match the hidden pairs!",
    icon: "fa-puzzle-piece",
    intro: "Take turns finding matching emoji pairs. The player with the most pairs wins."
  },
  "who-is-more-likely": {
    title: "Who Is More Likely?",
    subtitle: "Point fingers and have a laugh!",
    icon: "fa-people-arrows",
    intro: "Read each question and decide who is more likely to do it."
  },
  "guess-the-song": {
    title: "Guess the Song",
    subtitle: "Test your music knowledge!",
    icon: "fa-music",
    intro: "Read the clue and choose the correct song title. No lyrics are used."
  }
};

function showLoadError(error) {
  console.error("Game data load failed:", error);
  app.innerHTML = `
    <div class="game-page">
      <div class="game-panel game-center">
        <h2>Could not load game data</h2>
        <p class="game-muted">Please refresh and make sure the <code>data/</code> files are available.</p>
        <a href="games.html" class="game-btn">Back to Games</a>
      </div>
    </div>
  `;
}

const truths = [];
const dares = [];
const wheelOptions = [];
const quizQuestions = [];
const wouldYouRather = [];
const likelyQuestions = [];
const songs = [];
const memorySets = [];

const FALLBACK_WHEEL = [
  "Give a compliment",
  "Do a funny dance",
  "Share a favourite memory",
  "Send a sweet message",
  "Tell a truth",
  "Give a warm hug",
  "Sing a song",
  "Choose the next game"
];

/* =========================================
   COMMON HELPERS
========================================= */

function shuffle(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function saveHistory(message) {
  history.unshift({
    game: gameInfo[gameType]?.title || "Game",
    message,
    date: new Date().toLocaleString()
  });

  history = history.slice(0, 8);

  localStorage.setItem(
    "classenGameHistory",
    JSON.stringify(history)
  );
}

function historyHTML() {
  if (!history.length) {
    return `
      <div class="game-history">
        <h3><i class="fa-solid fa-clock-rotate-left"></i> Recent games</h3>
        <p>Your game results will appear here.</p>
      </div>
    `;
  }

  return `
    <div class="game-history">
      <h3><i class="fa-solid fa-clock-rotate-left"></i> Recent games</h3>
      ${history.slice(0, 4).map(item => `
        <p><strong>${item.game}:</strong> ${item.message}</p>
      `).join("")}
    </div>
  `;
}

function commonLayout(content) {
  const info = gameInfo[gameType];

  app.innerHTML = `
    <div class="game-page">

      <header class="game-header">
        <a class="game-back" href="games.html" aria-label="Back to games">
          <i class="fa-solid fa-arrow-left"></i>
        </a>

        <div class="game-heading">
          <p>CLASSEN PURPLE • GAME TIME</p>
          <h1>${info.title}</h1>
        </div>

        <div class="game-header-icon">
          <i class="fa-solid ${info.icon}"></i>
        </div>
      </header>

      <p class="game-intro">${info.intro}</p>

      <div class="game-sync-status" id="gameSyncStatus">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
        <span>Connecting live game...</span>
      </div>

      ${difficultySelectorHTML()}

      ${content}

      ${historyHTML()}

      <nav class="app-bottom-nav">
        <a href="home.html" class="nav-link">
          <i class="fa-solid fa-house"></i><span>Home</span>
        </a>
        <a href="chat.html" class="nav-link">
          <i class="fa-solid fa-comments"></i><span>Chat</span>
        </a>
        <a href="calendar.html" class="nav-link">
          <i class="fa-solid fa-calendar-days"></i><span>Calendar</span>
        </a>
        <a href="todo.html" class="nav-link">
          <i class="fa-solid fa-list-check"></i><span>To-Do</span>
        </a>
        <a href="games.html" class="nav-link active">
          <i class="fa-solid fa-gamepad"></i><span>Games</span>
        </a>
        <button class="nav-link" id="moreNavBtn" type="button">
          <i class="fa-solid fa-ellipsis"></i><span>More</span>
        </button>
      </nav>

      <div class="more-nav-menu hidden" id="moreNavMenu">
        <a href="song.html"><i class="fa-solid fa-music"></i> Our Song</a>
        <a href="gallery.html"><i class="fa-solid fa-images"></i> Gallery</a>
        <a href="settings.html"><i class="fa-solid fa-gear"></i> Settings</a>
      </div>

    </div>
  `;

  const moreBtn = document.getElementById("moreNavBtn");
  const moreMenu = document.getElementById("moreNavMenu");

  moreBtn?.addEventListener("click", event => {
    event.stopPropagation();
    moreMenu.classList.toggle("hidden");
  });

  document.addEventListener("click", event => {
    if (
      moreMenu &&
      moreBtn &&
      !moreMenu.contains(event.target) &&
      !moreBtn.contains(event.target)
    ) {
      moreMenu.classList.add("hidden");
    }
  });

  updateSyncStatus();
}

function setDifficulty(level) {
  if (!DIFFICULTIES.includes(level)) return;
  selectedDifficulty = level;
  localStorage.setItem("classenGameDifficulty", level);
  // Difficulty is local preference for content filtering; live state remains authoritative.
  startGame();
  if (sessionReady && remoteSession?.state) applyRemoteState(remoteSession.state);
}

function handleGlobalAction(event) {
  const button = event.target.closest("[data-action='set-difficulty']");
  if (!button) return false;
  setDifficulty(button.dataset.difficulty);
  return true;
}

function updateSyncStatus(message) {
  const el = document.getElementById("gameSyncStatus");
  if (!el) return;
  const partner = currentPlayer?.key === "baby" ? "Hubby 💜" : currentPlayer?.key === "hubby" ? "Baby ❤️" : "your partner";
  let html = "";
  if (!currentUser) {
    html = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Connecting...</span>`;
  } else if (!currentPlayer) {
    html = `<i class="fa-solid fa-triangle-exclamation"></i><span>Signed in account is not an authorized player.</span>`;
  } else if (!SUPPORTED_LIVE_GAMES.includes(gameType)) {
    html = `<i class="fa-solid fa-circle-info"></i><span>Live sync is enabled for Truth or Dare first. Other games still run locally for now.</span>`;
  } else if (!sessionReady) {
    html = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Connecting live game...</span>`;
  } else {
    html = `<i class="fa-solid fa-wifi"></i><span>Live with ${partner} — choices sync instantly.</span>`;
  }
  if (message) html = `<i class="fa-solid fa-bolt"></i><span>${message}</span>`;
  el.innerHTML = html;
}

function myRoleIndex() { return currentPlayer?.key === "baby" ? 0 : 1; }
function isMyTurn(playerIndex) { return currentPlayer ? myRoleIndex() === playerIndex : false; }

function initialTruthDareState() {
  return {
    player: 0,
    phase: "choose", // choose | prompt | passed
    promptType: null, // truth | dare
    promptText: "",
    result: "Choose your challenge to begin.",
    usedTruthIds: [],
    usedDareIds: [],
    lastActionBy: null
  };
}

function ensureLocalStateDefaults() {
  if (gameType === "truth-or-dare") {
    state = { ...initialTruthDareState(), ...state };
  }
}

async function pushState(updater, initialFactory) {
  if (applyingRemote || !currentPlayer) return;
  await patchState(gameType, (current) => {
    const base = (current && typeof current === "object" && Object.keys(current).length) ? current : initialFactory();
    const next = updater({ ...base });
    next.lastActionBy = currentPlayer.label;
    next.lastActionAt = Date.now();
    return next;
  }, initialFactory);
}

function applyRemoteState(nextState) {
  if (!nextState) return;
  applyingRemote = true;
  const prevAction = state?.lastActionAt;
  state = { ...nextState };
  if (gameType === "truth-or-dare") renderTruthDareFromState();
  // other games: fallback render
  if (gameType !== "truth-or-dare") {
    const r = getRenderer(); if (r) r();
  }
  applyingRemote = false;
  if (state.lastActionBy && state.lastActionAt && state.lastActionAt !== prevAction && state.lastActionBy !== currentPlayer?.label) {
    updateSyncStatus(`${state.lastActionBy} just made a move.`);
    setTimeout(updateSyncStatus, 2500);
  } else {
    updateSyncStatus();
  }
}

function getRenderer() {
  return ({
    "truth-or-dare": renderTruthDareFromState,
    "spin-wheel": renderWheel,
    "couples-quiz": renderQuiz,
    "would-you-rather": renderWouldYouRather,
    "memory-game": renderMemory,
    "who-is-more-likely": renderMoreLikely,
    "guess-the-song": renderGuessSong
  })[gameType];
}

function initialStateForGame(type) {
  if (type === "truth-or-dare") return initialTruthDareState();
  return { initialized: true, player: 0 };
}

/* =========================================
   1. TRUTH OR DARE
========================================= */

function renderTruthDare() {
  // Initial render shell; state comes from Firestore.
  state = { ...initialTruthDareState(), ...state };
  commonLayout(`
    <section class="game-panel game-center">
      <span class="game-player-pill" id="tdPlayer"></span>

      <div class="game-big-icon">
        <i class="fa-solid fa-fire"></i>
      </div>

      <p class="game-panel-label">MAKE YOUR CHOICE</p>
      <h2 class="game-question" id="tdPrompt">Truth or dare?</h2>

      <div class="game-buttons" id="tdChoiceButtons">
        <button class="game-btn" data-action="truth">💬 Truth</button>
        <button class="game-btn gold" data-action="dare">🔥 Dare</button>
      </div>

      <div id="tdResult" class="game-status">Choose your challenge to begin.</div>

      <button class="game-btn secondary full" data-action="td-next" id="tdNextBtn">
        Next player's turn
      </button>
    </section>
  `);

  bindAction(truthDareAction);
  renderTruthDareFromState();
}

function renderTruthDareFromState() {
  if (gameType !== "truth-or-dare") return;
  const s = { ...initialTruthDareState(), ...state };
  const playerEl = document.getElementById("tdPlayer");
  const promptEl = document.getElementById("tdPrompt");
  const resultEl = document.getElementById("tdResult");
  const nextBtn = document.getElementById("tdNextBtn");
  const choiceWrap = document.getElementById("tdChoiceButtons");
  if (!playerEl || !promptEl || !resultEl) {
    // Layout not rendered yet
    state = s;
    renderTruthDare();
    return;
  }
  state = s;
  const turnLabel = PLAYERS[s.player] || PLAYERS[0];
  const mine = isMyTurn(s.player);
  playerEl.textContent = mine ? `${turnLabel}'s turn (You)` : `${turnLabel}'s turn`;

  if (s.phase === "choose") {
    promptEl.textContent = "Truth or dare?";
  } else {
    promptEl.textContent = s.promptText || "Truth or dare?";
  }

  resultEl.textContent = s.result || "Choose your challenge to begin.";

  if (choiceWrap) {
    choiceWrap.style.display = s.phase === "choose" ? "grid" : "none";
    choiceWrap.querySelectorAll("button").forEach(btn => {
      btn.disabled = !mine || !sessionReady || !currentPlayer;
    });
  }
  if (nextBtn) {
    nextBtn.disabled = !mine || !sessionReady || !currentPlayer || s.phase === "choose";
    nextBtn.textContent = mine ? "Next player's turn" : `Waiting for ${turnLabel}...`;
  }
}

function nextPromptFromState(list, usedIds) {
  let available = list.filter(item => !usedIds.includes(item.id));
  let nextUsed = [...usedIds];
  if (!available.length) {
    nextUsed = [];
    available = [...list];
  }
  const item = available[Math.floor(Math.random() * available.length)];
  nextUsed.push(item.id);
  return { item, nextUsed };
}

function truthDareAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (!currentPlayer || !sessionReady) return;

  const action = button.dataset.action;
  const s = { ...initialTruthDareState(), ...state };
  if (!isMyTurn(s.player)) {
    updateSyncStatus(`It's ${PLAYERS[s.player]}'s turn. Wait for their move.`);
    setTimeout(updateSyncStatus, 2000);
    return;
  }

  if (action === "td-next") {
    if (s.phase === "choose") return;
    pushState((curr) => {
      const n = { ...initialTruthDareState(), ...curr };
      n.player = 1 - n.player;
      n.phase = "choose";
      n.promptType = null;
      n.promptText = "";
      n.result = `${PLAYERS[n.player]}, choose truth or dare.`;
      return n;
    }, initialTruthDareState).catch(console.error);
    return;
  }

  if (action === "truth" || action === "dare") {
    if (s.phase !== "choose") return;
    const list = action === "truth" ? pickByDifficulty(truths, selectedDifficulty) : pickByDifficulty(dares, selectedDifficulty);
    const usedIds = action === "truth" ? [...(s.usedTruthIds || [])] : [...(s.usedDareIds || [])];
    if (!list.length) {
      updateSyncStatus("No prompts found for this difficulty.");
      return;
    }
    const { item, nextUsed } = nextPromptFromState(list, usedIds);
    const promptText = action === "truth" ? item.question : item.task;

    pushState((curr) => {
      const n = { ...initialTruthDareState(), ...curr };
      n.phase = "prompt";
      n.promptType = action;
      n.promptText = promptText;
      n.result = `${PLAYERS[n.player]} chose ${action.toUpperCase()}!`;
      if (action === "truth") n.usedTruthIds = nextUsed;
      else n.usedDareIds = nextUsed;
      return n;
    }, initialTruthDareState).then(() => {
      saveHistory(`${PLAYERS[s.player]} played ${action}.`);
    }).catch(console.error);
  }
}

let activeActionHandler = null;
function bindAction(handler) {
  if (activeActionHandler) {
    app.removeEventListener("click", activeActionHandler);
  }
  activeActionHandler = handler;
  app.addEventListener("click", activeActionHandler);
}

/* =========================================
   2. SPIN THE WHEEL
========================================= */

function buildWheelOptions() {
  const pool = pickByDifficulty(dares, selectedDifficulty).slice(0, 8);
  if (pool.length >= 8) return pool.map(item => item.task);
  const mixed = shuffle([
    ...pickByDifficulty(dares, selectedDifficulty).map(d => d.task),
    ...pickByDifficulty(truths, selectedDifficulty).map(t => `Truth: ${t.question}`)
  ]).slice(0, 8);
  return mixed.length ? mixed : FALLBACK_WHEEL;
}

function renderWheel() {
  state = { spinning: false, player: 0, wheelOptions: buildWheelOptions() };

  commonLayout(`
    <section class="game-panel game-center">
      <span class="game-player-pill" id="wheelPlayer">Baby ❤️'s turn</span>

      <div class="wheel-wrap">
        <i class="fa-solid fa-caret-down wheel-pointer"></i>
        <div class="wheel" id="wheel">
          <div class="wheel-center">
            <i class="fa-solid fa-heart"></i>
          </div>
        </div>
      </div>

      <h2 class="game-question" id="wheelResult">
        Ready to spin?
      </h2>

      <p class="game-muted">The wheel has ${state.wheelOptions.length} surprise challenges.</p>

      <button class="game-btn gold full" id="spinButton" data-action="spin">
        <i class="fa-solid fa-rotate"></i> SPIN THE WHEEL
      </button>

      <button class="game-btn secondary full" data-action="wheel-next">
        Switch player
      </button>
    </section>
  `);

  bindAction(wheelAction);
}

function wheelAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "wheel-next") {
    state.player = 1 - state.player;
    document.getElementById("wheelPlayer").textContent =
      `${PLAYERS[state.player]}'s turn`;
    return;
  }

  if (button.dataset.action !== "spin" || state.spinning) return;

  state.spinning = true;
  button.disabled = true;

  const result = state.wheelOptions[
    Math.floor(Math.random() * state.wheelOptions.length)
  ];

  const wheel = document.getElementById("wheel");
  const turns = 5 + Math.floor(Math.random() * 4);
  const angle = turns * 360 + Math.floor(Math.random() * 360);

  wheel.style.transform = `rotate(${angle}deg)`;

  document.getElementById("wheelResult").textContent = "Spinning...";

  setTimeout(() => {
    document.getElementById("wheelResult").textContent = result;
    saveHistory(`${PLAYERS[state.player]} spun: ${result.slice(0, 60)}.`);
    state.spinning = false;
    button.disabled = false;
  }, 4100);
}

/* =========================================
   3. COUPLES QUIZ
========================================= */

function renderQuiz() {
  const pool = pickByDifficulty(quizQuestions, selectedDifficulty);
  state = {
    questions: pool.slice(0, 10),
    index: 0,
    player: 0,
    firstAnswer: null,
    scores: [0, 0]
  };

  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score">
          <strong id="quizBabyScore">0</strong>
          <span>Baby ❤️</span>
        </div>
        <div class="game-score">
          <strong id="quizHubbyScore">0</strong>
          <span>Hubby 💜</span>
        </div>
      </div>

      <div class="game-center">
        <span class="game-player-pill" id="quizPlayer">Baby ❤️ answers first</span>
        <p class="game-panel-label" style="margin-top:15px" id="quizProgress">QUESTION 1</p>
        <h2 class="game-question" id="quizQuestion"></h2>
      </div>

      <div class="game-choice-list" id="quizOptions"></div>
      <div class="game-status" id="quizStatus">Choose what you think your partner would pick.</div>

      <button class="game-btn secondary full" data-action="quiz-next" id="quizNext" hidden>
        Next question
      </button>
    </section>
  `);

  bindAction(quizAction);
  showQuizQuestion();
}

function showQuizQuestion() {
  const question = state.questions[state.index];
  if (!question) return;

  document.getElementById("quizQuestion").textContent = question.question;
  document.getElementById("quizProgress").textContent =
    `QUESTION ${state.index + 1} OF ${state.questions.length}`;

  document.getElementById("quizPlayer").textContent =
    `${PLAYERS[state.player]}: predict your partner's answer`;

  document.getElementById("quizStatus").textContent =
    state.player === 0
      ? "Baby, choose what you think Hubby would pick."
      : "Hubby, choose what you think Baby would pick.";

  document.getElementById("quizNext").hidden = true;

  document.getElementById("quizOptions").innerHTML =
    question.options.map((option, index) => `
      <button class="game-choice" data-action="quiz-answer" data-value="${index}">
        ${String.fromCharCode(65 + index)}. ${option}
      </button>
    `).join("");
}

function quizAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const question = state.questions[state.index];

  if (button.dataset.action === "quiz-answer") {
    const answer = Number(button.dataset.value);

    if (state.player === 0) {
      state.firstAnswer = answer;
      state.player = 1;

      document.getElementById("quizPlayer").textContent =
        "Hubby's turn 💜";

      document.getElementById("quizOptions").innerHTML = `
        <div class="game-status">Baby has answered. Pass the phone to Hubby!</div>
        <button class="game-btn full" data-action="quiz-reveal">
          Hubby, I'm ready!
        </button>
      `;
      document.getElementById("quizStatus").textContent = "Keep your answer secret and pass the phone.";
      return;
    }

    return;
  }

  if (button.dataset.action === "quiz-reveal") {
    document.getElementById("quizOptions").innerHTML =
      question.options.map((option, index) => `
        <button class="game-choice" data-action="quiz-second-answer" data-value="${index}">
          ${String.fromCharCode(65 + index)}. ${option}
        </button>
      `).join("");

    document.getElementById("quizStatus").textContent =
      "Hubby, predict Baby's answer.";
    return;
  }

  if (button.dataset.action === "quiz-second-answer") {
    const answer = Number(button.dataset.value);

    if (answer === state.firstAnswer) {
      state.scores[0]++;
      state.scores[1]++;
      document.getElementById("quizStatus").textContent =
        "💜 MATCH! You both predicted the same answer.";
    } else {
      document.getElementById("quizStatus").textContent =
        "Different answers! That's what makes you interesting.";
    }

    document.getElementById("quizBabyScore").textContent = state.scores[0];
    document.getElementById("quizHubbyScore").textContent = state.scores[1];

    document.getElementById("quizOptions").innerHTML = `
      <div class="game-status">
        Baby chose: ${question.options[state.firstAnswer]}<br>
        Hubby chose: ${question.options[answer]}
      </div>
    `;

    document.getElementById("quizNext").hidden = false;
  }

  if (button.dataset.action === "quiz-next") {
    state.index++;

    if (state.index >= state.questions.length) {
      const message = `Quiz finished. ${state.scores[0]} matching answers.`;
      saveHistory(message);

      document.getElementById("quizQuestion").textContent = "Quiz complete! 💜";
      document.getElementById("quizProgress").textContent = "FINAL SCORE";
      document.getElementById("quizOptions").innerHTML = `
        <div class="game-status">
          You got ${state.scores[0]} matching answers out of ${state.questions.length}.
        </div>
        <button class="game-btn full" data-action="quiz-restart">Play again</button>
      `;
      document.getElementById("quizNext").hidden = true;
      return;
    }

    state.player = 0;
    state.firstAnswer = null;
    showQuizQuestion();
  }

  if (button.dataset.action === "quiz-restart") {
    renderQuiz();
  }
}

/* =========================================
   4. WOULD YOU RATHER
========================================= */

function renderWouldYouRather() {
  const pool = pickByDifficulty(wouldYouRather, selectedDifficulty);
  state = {
    questions: pool.slice(0, 12),
    index: 0,
    answers: [null, null],
    player: 0,
    matches: 0
  };

  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score">
          <strong id="wyrMatches">0</strong>
          <span>Matching choices</span>
        </div>
        <div class="game-score">
          <strong id="wyrNumber">1</strong>
          <span>Question</span>
        </div>
      </div>

      <div class="game-center">
        <span class="game-player-pill" id="wyrPlayer">Baby ❤️ chooses first</span>
        <p class="game-panel-label" style="margin-top:15px">WOULD YOU RATHER...</p>
      </div>

      <div class="game-choice-list" id="wyrOptions"></div>
      <div class="game-status" id="wyrStatus">Baby, make your choice!</div>

      <button class="game-btn secondary full" id="wyrNext" data-action="wyr-next" hidden>
        Next question
      </button>
    </section>
  `);

  bindAction(wyrAction);
  showWyrQuestion();
}

function showWyrQuestion() {
  const q = state.questions[state.index];
  if (!q) return;

  document.getElementById("wyrNumber").textContent = state.index + 1;
  document.getElementById("wyrPlayer").textContent =
    `${PLAYERS[state.player]} chooses`;

  document.getElementById("wyrStatus").textContent =
    `${PLAYERS[state.player]}, choose one option.`;

  document.getElementById("wyrNext").hidden = true;

  document.getElementById("wyrOptions").innerHTML = `
    <button class="game-choice" data-action="wyr-answer" data-value="0">
      A · ${q.optionA}
    </button>
    <button class="game-choice" data-action="wyr-answer" data-value="1">
      B · ${q.optionB}
    </button>
  `;
}

function wyrAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const q = state.questions[state.index];

  if (button.dataset.action === "wyr-answer") {
    const answer = Number(button.dataset.value);

    if (state.player === 0) {
      state.answers[0] = answer;
      state.player = 1;

      document.getElementById("wyrPlayer").textContent = "Hubby's turn 💜";
      document.getElementById("wyrStatus").textContent =
        "Baby has chosen. Pass the phone to Hubby.";

      document.getElementById("wyrOptions").innerHTML = `
        <button class="game-btn full" data-action="wyr-ready">
          Hubby, I'm ready!
        </button>
      `;
      return;
    }

    return;
  }

  if (button.dataset.action === "wyr-ready") {
    document.getElementById("wyrOptions").innerHTML = `
      <button class="game-choice" data-action="wyr-second" data-value="0">
        A · ${q.optionA}
      </button>
      <button class="game-choice" data-action="wyr-second" data-value="1">
        B · ${q.optionB}
      </button>
    `;

    document.getElementById("wyrStatus").textContent =
      "Hubby, make your choice.";
    return;
  }

  if (button.dataset.action === "wyr-second") {
    state.answers[1] = Number(button.dataset.value);

    if (state.answers[0] === state.answers[1]) {
      state.matches++;
      document.getElementById("wyrStatus").textContent =
        "💜 MATCH! You both picked the same option.";
    } else {
      document.getElementById("wyrStatus").textContent =
        "Different choices! Tell each other why.";
    }

    document.getElementById("wyrMatches").textContent = state.matches;

    document.getElementById("wyrOptions").innerHTML = `
      <div class="game-status">
        Baby: ${state.answers[0] === 0 ? q.optionA : q.optionB}<br>
        Hubby: ${state.answers[1] === 0 ? q.optionA : q.optionB}
      </div>
    `;

    document.getElementById("wyrNext").hidden = false;
  }

  if (button.dataset.action === "wyr-next") {
    state.index++;

    if (state.index >= state.questions.length) {
      saveHistory(`Would You Rather finished with ${state.matches} matching choices.`);

      document.getElementById("wyrStatus").textContent =
        `Game complete! You matched ${state.matches} times. 💜`;

      document.getElementById("wyrOptions").innerHTML = `
        <button class="game-btn full" data-action="wyr-restart">Play again</button>
      `;
      document.getElementById("wyrNext").hidden = true;
      return;
    }

    state.player = 0;
    state.answers = [null, null];
    showWyrQuestion();
  }

  if (button.dataset.action === "wyr-restart") {
    renderWouldYouRather();
  }
}

/* =========================================
   5. MEMORY CHALLENGE
========================================= */

function pickMemorySet() {
  const pool = pickByDifficulty(memorySets, selectedDifficulty);
  return pool[Math.floor(Math.random() * pool.length)] || { pairs: ["❤️","🌹","💜","🎵","⭐","🐻"] };
}

function renderMemory() {
  const set = pickMemorySet();
  const emojis = set.pairs;

  state = {
    cards: shuffle([...emojis, ...emojis]).map((emoji, index) => ({
      id: index,
      emoji,
      revealed: false,
      matched: false
    })),
    player: 0,
    firstCard: null,
    locked: false,
    scores: [0, 0],
    moves: 0
  };

  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score">
          <strong id="memoryBaby">0</strong>
          <span>Baby ❤️ pairs</span>
        </div>
        <div class="game-score">
          <strong id="memoryHubby">0</strong>
          <span>Hubby 💜 pairs</span>
        </div>
      </div>

      <div class="game-center">
        <span class="game-player-pill" id="memoryPlayer">Baby ❤️'s turn</span>
        <p class="game-muted" id="memoryMoves">Moves: 0</p>
      </div>

      <div class="memory-grid" id="memoryGrid"></div>

      <div class="game-status" id="memoryStatus">
        Find two matching cards!
      </div>

      <button class="game-btn secondary full" data-action="memory-restart">
        Restart game
      </button>
    </section>
  `);

  bindAction(memoryAction);
  drawMemory();
}

function drawMemory() {
  const grid = document.getElementById("memoryGrid");

  grid.innerHTML = state.cards.map(card => `
    <button
      class="memory-card ${card.revealed ? "revealed" : ""} ${card.matched ? "matched" : ""}"
      data-action="memory-card"
      data-value="${card.id}"
      aria-label="Memory card"
      ${card.matched || card.revealed || state.locked ? "disabled" : ""}
    >
      ${card.revealed || card.matched ? card.emoji : "?"}
    </button>
  `).join("");

  document.getElementById("memoryBaby").textContent = state.scores[0];
  document.getElementById("memoryHubby").textContent = state.scores[1];
  document.getElementById("memoryPlayer").textContent =
    `${PLAYERS[state.player]}'s turn`;

  document.getElementById("memoryMoves").textContent =
    `Moves: ${state.moves}`;
}

function memoryAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "memory-restart") {
    renderMemory();
    return;
  }

  if (button.dataset.action !== "memory-card" || state.locked) return;

  const card = state.cards.find(item =>
    item.id === Number(button.dataset.value)
  );

  if (!card || card.matched || card.revealed) return;

  card.revealed = true;

  if (!state.firstCard) {
    state.firstCard = card;
    drawMemory();
    return;
  }

  state.moves++;

  if (state.firstCard.emoji === card.emoji) {
    state.firstCard.matched = true;
    card.matched = true;

    state.scores[state.player]++;
    state.firstCard = null;

    drawMemory();

    if (state.cards.every(item => item.matched)) {
      const winner = state.scores[0] === state.scores[1]
        ? "It's a tie!"
        : `${PLAYERS[state.scores[0] > state.scores[1] ? 0 : 1]} wins!`;

      document.getElementById("memoryStatus").textContent =
        `All pairs found! ${winner}`;

      saveHistory(`Memory Challenge: ${winner}`);
    } else {
      document.getElementById("memoryStatus").textContent =
        "Great match! You get another turn.";
    }

    return;
  }

  state.locked = true;
  drawMemory();

  document.getElementById("memoryStatus").textContent =
    "Not a match. Passing the turn...";

  setTimeout(() => {
    state.firstCard.revealed = false;
    card.revealed = false;
    state.firstCard = null;
    state.player = 1 - state.player;
    state.locked = false;

    drawMemory();

    document.getElementById("memoryStatus").textContent =
      `${PLAYERS[state.player]}, your turn!`;
  }, 1000);
}

/* =========================================
   6. WHO IS MORE LIKELY?
========================================= */

function renderMoreLikely() {
  const pool = pickByDifficulty(likelyQuestions, selectedDifficulty);
  state = {
    questions: pool.slice(0, 15),
    index: 0
  };

  commonLayout(`
    <section class="game-panel game-center">
      <div class="game-big-icon">
        <i class="fa-solid fa-people-arrows"></i>
      </div>

      <p class="game-panel-label" id="likelyProgress">QUESTION 1</p>

      <h2 class="game-question" id="likelyQuestion"></h2>

      <div class="game-choice-list">
        <button class="game-choice" data-action="likely-vote" data-value="0">
          ❤️ Baby
        </button>

        <button class="game-choice" data-action="likely-vote" data-value="1">
          💜 Hubby
        </button>

        <button class="game-choice" data-action="likely-vote" data-value="2">
          😂 Both of us
        </button>
      </div>

      <div class="game-status" id="likelyStatus">
        Point to your answer!
      </div>

      <button class="game-btn secondary full" data-action="likely-next">
        Next question
      </button>
    </section>
  `);

  bindAction(likelyAction);
  showLikelyQuestion();
}

function showLikelyQuestion() {
  if (state.index >= state.questions.length) {
    document.getElementById("likelyQuestion").textContent =
      "You've reached the end! 💜";

    document.getElementById("likelyProgress").textContent = "GAME COMPLETE";
    document.getElementById("likelyStatus").textContent =
      "You have answered all the questions.";

    saveHistory("Finished Who Is More Likely.");
    return;
  }

  const q = state.questions[state.index];
  document.getElementById("likelyProgress").textContent =
    `QUESTION ${state.index + 1} OF ${state.questions.length}`;

  document.getElementById("likelyQuestion").textContent = q.question;

  document.getElementById("likelyStatus").textContent =
    "Point to your answer!";
}

function likelyAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "likely-vote") {
    const choice = Number(button.dataset.value);

    const result = [
      "Baby ❤️",
      "Hubby 💜",
      "Both of you 😂"
    ][choice];

    document.getElementById("likelyStatus").textContent =
      `Your answer: ${result}. Now explain why!`;

    saveHistory(`Who is more likely: ${result}.`);
  }

  if (button.dataset.action === "likely-next") {
    state.index++;
    showLikelyQuestion();
  }
}

/* =========================================
   7. GUESS THE SONG
========================================= */

function renderGuessSong() {
  const pool = pickByDifficulty(songs, selectedDifficulty);
  state = {
    questions: pool.slice(0, 10),
    index: 0,
    scores: [0, 0],
    player: 0
  };

  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score">
          <strong id="songBabyScore">0</strong>
          <span>Baby ❤️</span>
        </div>
        <div class="game-score">
          <strong id="songHubbyScore">0</strong>
          <span>Hubby 💜</span>
        </div>
      </div>

      <div class="game-center">
        <span class="game-player-pill" id="songPlayer">Baby ❤️'s turn</span>
        <div class="game-big-icon">
          <i class="fa-solid fa-music"></i>
        </div>
        <p class="game-panel-label" id="songProgress">SONG 1</p>
        <h2 class="game-question" id="songClue"></h2>
      </div>

      <div class="game-choice-list" id="songOptions"></div>

      <div class="game-status" id="songStatus">
        Which song are we describing?
      </div>

      <button class="game-btn secondary full" data-action="song-next" id="songNext" hidden>
        Next song
      </button>
    </section>
  `);

  bindAction(songAction);
  showSongQuestion();
}

function showSongQuestion() {
  if (state.index >= state.questions.length) {
    document.getElementById("songClue").textContent = "Game complete! 🎵";
    document.getElementById("songProgress").textContent = "FINAL SCORE";
    document.getElementById("songOptions").innerHTML = `
      <div class="game-status">
        Baby scored ${state.scores[0]} points.<br>
        Hubby scored ${state.scores[1]} points.
      </div>
      <button class="game-btn full" data-action="song-restart">Play again</button>
    `;

    document.getElementById("songStatus").textContent =
      state.scores[0] === state.scores[1]
        ? "It's a tie! 💜"
        : `${PLAYERS[state.scores[0] > state.scores[1] ? 0 : 1]} wins!`;

    saveHistory(`Guess the Song: Baby ${state.scores[0]} - Hubby ${state.scores[1]}.`);
    document.getElementById("songNext").hidden = true;
    return;
  }

  const song = state.questions[state.index];
  const options = shuffle([...song.options]);

  state.correctTitle = song.answer;

  document.getElementById("songPlayer").textContent =
    `${PLAYERS[state.player]}'s turn`;

  document.getElementById("songProgress").textContent =
    `SONG ${state.index + 1} OF ${state.questions.length}`;

  document.getElementById("songClue").textContent = song.clue;

  document.getElementById("songStatus").textContent =
    "Choose the correct song title.";

  document.getElementById("songNext").hidden = true;

  document.getElementById("songOptions").innerHTML =
    options.map(option => `
      <button class="game-choice" data-action="song-answer" data-value="${escapeHtml(option)}">
        ${option}
      </button>
    `).join("");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function songAction(event) {
  if (handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "song-answer") {
    const answer = button.dataset.value;
    const song = state.questions[state.index];
    const correct = answer === state.correctTitle;

    if (correct) {
      state.scores[state.player]++;
      document.getElementById("songStatus").textContent =
        `Correct! 🎉 The song is "${state.correctTitle}".`;
    } else {
      document.getElementById("songStatus").textContent =
        `Not quite! The answer is "${state.correctTitle}".`;
    }

    document.getElementById("songBabyScore").textContent = state.scores[0];
    document.getElementById("songHubbyScore").textContent = state.scores[1];

    document.getElementById("songOptions").innerHTML = `
      <div class="game-status">
        ${song.songTitle} — ${song.artist}
      </div>
    `;

    document.getElementById("songNext").hidden = false;
  }

  if (button.dataset.action === "song-next") {
    state.index++;
    state.player = 1 - state.player;
    showSongQuestion();
  }

  if (button.dataset.action === "song-restart") {
    renderGuessSong();
  }
}

/* =========================================
   START THE SELECTED GAME
========================================= */

function assignData(type, loaded) {
  if (type === "truth-or-dare" || type === "spin-wheel") {
    truths.splice(0, truths.length, ...(loaded["data/truth-questions.json"] || []));
    dares.splice(0, dares.length, ...(loaded["data/dare-tasks.json"] || []));
  }
  if (type === "couples-quiz") {
    quizQuestions.splice(0, quizQuestions.length, ...(loaded["data/couples-questions.json"] || []));
  }
  if (type === "would-you-rather") {
    wouldYouRather.splice(0, wouldYouRather.length, ...(loaded["data/would-you-rather.json"] || []));
  }
  if (type === "who-is-more-likely") {
    likelyQuestions.splice(0, likelyQuestions.length, ...(loaded["data/more-likely-questions.json"] || []));
  }
  if (type === "guess-the-song") {
    songs.splice(0, songs.length, ...(loaded["data/song-questions.json"] || []));
  }
  if (type === "memory-game") {
    memorySets.splice(0, memorySets.length, ...(loaded["data/memory-items.json"] || []));
  }
}

function startGame() {
  const gameRenderers = {
    "truth-or-dare": renderTruthDare,
    "spin-wheel": renderWheel,
    "couples-quiz": renderQuiz,
    "would-you-rather": renderWouldYouRather,
    "memory-game": renderMemory,
    "who-is-more-likely": renderMoreLikely,
    "guess-the-song": renderGuessSong
  };

  const render = gameRenderers[gameType];
  if (!render) return;
  render();
}


async function startMultiplayer() {
  if (!currentPlayer) {
    updateSyncStatus();
    return;
  }
  if (!SUPPORTED_LIVE_GAMES.includes(gameType)) {
    sessionReady = false;
    updateSyncStatus();
    return;
  }

  const initialFactory = () => initialStateForGame(gameType);
  try {
    await ensureSession(gameType, initialFactory);
    unsubscribeSession?.();
    unsubscribeSession = subscribeSession(gameType, (doc, err) => {
      if (err) { updateSyncStatus("Live connection error. Retrying..."); return; }
      if (!doc) return;
      sessionReady = true;
      remoteSession = doc;
      applyRemoteState(doc.state || initialFactory());
    });
  } catch (err) {
    console.error("Failed to start multiplayer session", err);
    updateSyncStatus("Could not connect live game. Check Firestore rules/config.");
  }
}
async function init() {
  if (!gameInfo[gameType]) {
    app.innerHTML = `
      <div class="game-page">
        <div class="game-panel game-center">
          <h2>Game not found</h2>
          <p class="game-muted">Please return to the Games Hub.</p>
          <a href="games.html" class="game-btn">Back to Games</a>
        </div>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <div class="game-page">
      <div class="game-panel game-center">
        <div class="game-big-icon"><i class="fa-solid fa-heart"></i></div>
        <h2>Loading game...</h2>
        <p class="game-muted">Getting your questions ready.</p>
      </div>
    </div>
  `;

  try {
    const loaded = await loadGameData(gameType);
    assignData(gameType, loaded);
    startGame();

    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      currentPlayer = getPlayer(user?.email);
      sessionReady = false;
      updateSyncStatus();
      if (user && currentPlayer) {
        await startMultiplayer();
      }
    });
  } catch (error) {
    showLoadError(error);
  }
}

init();
console.log("Classen Purple Games Engine ready 🎮💜");









