/* =========================================
   CLASSEN PURPLE — ALL GAMES ENGINE
   Live-synced for both players via Firestore.
========================================= */

import "./theme.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  ensureSession, subscribeSession, patchState, resetSession, getPlayer
} from "./game-session.js";

const gameType = document.body.dataset.game;
const app = document.getElementById("gameApp");

const PLAYERS = ["Baby ❤️", "Hubby 💜"];
const PLAYER_KEYS = ["baby", "hubby"];
const DIFFICULTIES = ["easy", "medium", "hard", "random"];
const LIVE_GAMES = new Set([
  "truth-or-dare",
  "spin-wheel",
  "couples-quiz",
  "would-you-rather",
  "memory-game",
  "who-is-more-likely",
  "guess-the-song"
]);

let state = {};
let history = JSON.parse(localStorage.getItem("classenGameHistory") || "[]");
let selectedDifficulty = localStorage.getItem("classenGameDifficulty") || "random";

let currentUser = null;
let currentPlayer = null; // {key,label,email}
let remoteSession = null;
let unsubscribeSession = null;
let sessionReady = false;
let applyingRemote = false;
let localSpinToken = null;

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

  const candidates = [];
  const add = (p) => { if (p && !candidates.includes(p)) candidates.push(p); };

  add(path);
  if (!path.startsWith("./") && !path.startsWith("/")) add("./" + path);
  try { add(new URL(path, document.baseURI).href); } catch (_) {}
  try { add(new URL(path, window.location.href).href); } catch (_) {}

  let lastError = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const data = await res.json();
      dataCache[path] = data;
      return data;
    } catch (err) {
      lastError = err;
    }
  }

  const isFile = window.location.protocol === "file:";
  const hint = isFile
    ? "Games need to be opened over HTTP/localhost (not file://). Start a local server in the project folder, then open the game page."
    : `Could not load ${path}.`;
  throw new Error(hint + (lastError ? ` (${lastError.message})` : ""));
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
    intro: "Take turns choosing truth or dare. Dares must be confirmed by your partner."
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
    intro: "Both of you answer each question. Matches earn points."
  },
  "would-you-rather": {
    title: "Would You Rather?",
    subtitle: "Two choices. One decision.",
    icon: "fa-shuffle",
    intro: "Both of you choose an option and see whether you agree."
  },
  "memory-game": {
    title: "Memory Challenge",
    subtitle: "Match the hidden pairs!",
    icon: "fa-puzzle-piece",
    intro: "Take turns finding matching pairs. Most pairs wins."
  },
  "who-is-more-likely": {
    title: "Who Is More Likely?",
    subtitle: "Point fingers and have a laugh!",
    icon: "fa-people-arrows",
    intro: "Both of you vote and see the result together."
  },
  "guess-the-song": {
    title: "Guess the Song",
    subtitle: "Test your music knowledge!",
    icon: "fa-music",
    intro: "Take turns guessing the song from the clue."
  }
};

const truths = [];
const dares = [];
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function saveHistory(message) {
  history.unshift({
    game: gameInfo[gameType]?.title || "Game",
    message,
    date: new Date().toLocaleString()
  });
  history = history.slice(0, 8);
  localStorage.setItem("classenGameHistory", JSON.stringify(history));
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
        <p><strong>${escapeHtml(item.game)}:</strong> ${escapeHtml(item.message)}</p>
      `).join("")}
    </div>
  `;
}

function showLoadError(error) {
  console.error("Game data load failed:", error);
  const isFile = window.location.protocol === "file:";
  const detail = isFile
    ? "You opened the game as a local file. Browsers block game data loading from <code>file://</code>. Run a local server in this folder and open <code>http://localhost:5500/games.html</code>."
    : "The <code>data/</code> JSON files could not be loaded. Confirm the <code>data</code> folder is next to the game pages and refresh.";
  const errMsg = escapeHtml(String(error?.message || error || "Unknown error"));
  app.innerHTML = `
    <div class="game-page">
      <div class="game-panel game-center">
        <h2>Could not load game data</h2>
        <p class="game-muted">${detail}</p>
        <p class="game-muted" style="margin-top:8px;font-size:12px;opacity:.8">${errMsg}</p>
        <a href="games.html" class="game-btn" style="margin-top:12px;display:inline-flex">Back to Games</a>
      </div>
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
          <h1>${escapeHtml(info.title)}</h1>
        </div>
        <div class="game-header-icon">
          <i class="fa-solid ${info.icon}"></i>
        </div>
      </header>

      <p class="game-intro">${escapeHtml(info.intro)}</p>

      <div class="game-sync-status" id="gameSyncStatus">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
        <span>Connecting live game...</span>
      </div>

      ${difficultySelectorHTML()}

      ${content}

      ${historyHTML()}
    </div>
  `;

  updateSyncStatus();
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
  } else if (!LIVE_GAMES.has(gameType)) {
    html = `<i class="fa-solid fa-circle-info"></i><span>This game is local for now.</span>`;
  } else if (!sessionReady) {
    html = `<i class="fa-solid fa-circle-notch fa-spin"></i><span>Connecting live game...</span>`;
  } else {
    html = `<i class="fa-solid fa-wifi"></i><span>Live with ${escapeHtml(partner)} — synced in real time.</span>`;
  }
  if (message) html = `<i class="fa-solid fa-bolt"></i><span>${escapeHtml(message)}</span>`;
  el.innerHTML = html;
}

function myRoleIndex() { return currentPlayer?.key === "baby" ? 0 : 1; }
function isMyTurn(playerIndex) { return currentPlayer ? myRoleIndex() === Number(playerIndex) : false; }
function partnerLabel() { return currentPlayer?.key === "baby" ? "Hubby 💜" : "Baby ❤️"; }
function meLabel() { return currentPlayer?.label || "You"; }

function setDifficulty(level) {
  if (!DIFFICULTIES.includes(level)) return;
  selectedDifficulty = level;
  localStorage.setItem("classenGameDifficulty", level);
  startGame();
  if (sessionReady && remoteSession?.state) applyRemoteState(remoteSession.state);
}

async function handleGlobalAction(event) {
  const diffBtn = event.target.closest("[data-action='set-difficulty']");
  if (diffBtn) {
    setDifficulty(diffBtn.dataset.difficulty);
    return true;
  }
  const resetBtn = event.target.closest("[data-action='reset-game']");
  if (resetBtn) {
    if (!currentPlayer || !sessionReady) return true;
    const ok = await (window.cpConfirm ? window.cpConfirm({ title: "Reset game", message: "Reset this game for both of you?", confirmText: "Reset", cancelText: "Cancel", danger: true, icon: "↺" }) : Promise.resolve(confirm("Reset this game for both of you?")));
    if (ok) {
      resetSession(gameType, () => initialStateForGame(gameType)).catch(console.error);
    }
    return true;
  }
  return false;
}

let activeActionHandler = null;
function bindAction(handler) {
  if (activeActionHandler) app.removeEventListener("click", activeActionHandler);
  activeActionHandler = handler;
  app.addEventListener("click", activeActionHandler);
}

async function pushState(updater) {
  if (applyingRemote || !currentPlayer || !sessionReady) return;
  const initialFactory = () => initialStateForGame(gameType);
  await patchState(gameType, (current) => {
    const base = (current && typeof current === "object" && Object.keys(current).length)
      ? current
      : initialFactory();
    const next = updater({ ...base });
    next.lastActionBy = currentPlayer.label;
    next.lastActionRole = currentPlayer.key;
    next.lastActionAt = Date.now();
    return next;
  }, initialFactory);
}

function applyRemoteState(nextState) {
  if (!nextState) return;
  applyingRemote = true;
  const prevAction = state?.lastActionAt;
  state = { ...nextState };
  const renderer = getRenderer();
  if (renderer) renderer();
  applyingRemote = false;
  if (state.lastActionBy && state.lastActionAt && state.lastActionAt !== prevAction && state.lastActionRole !== currentPlayer?.key) {
    updateSyncStatus(`${state.lastActionBy} made a move.`);
    setTimeout(() => updateSyncStatus(), 2500);
  } else {
    updateSyncStatus();
  }
}

function getRenderer() {
  return ({
    "truth-or-dare": renderTruthDareFromState,
    "spin-wheel": renderWheelFromState,
    "couples-quiz": renderQuizFromState,
    "would-you-rather": renderWyrFromState,
    "memory-game": renderMemoryFromState,
    "who-is-more-likely": renderLikelyFromState,
    "guess-the-song": renderSongFromState
  })[gameType];
}

function sampleQuestions(list, count, difficulty) {
  return pickByDifficulty(list, difficulty).slice(0, count).map(q => ({ ...q }));
}

function currentQuestion(stateObj) {
  const qs = stateObj?.questions || [];
  return qs[stateObj?.index] || null;
}

function initialTruthDareState() {
  return {
    player: 0,
    phase: "choose",
    promptType: null,
    promptText: "",
    promptId: null,
    result: "Choose your challenge to begin.",
    usedTruthIds: [],
    usedDareIds: [],
    confirmations: { baby: false, hubby: false },
    completedBy: null
  };
}

function initialWheelState() {
  return {
    player: 0,
    spinning: false,
    wheelOptions: buildWheelOptions(),
    result: "Ready to spin?",
    spinId: 0,
    angle: 0,
    lastSpinner: null
  };
}

function initialQuizState() {
  const questions = sampleQuestions(quizQuestions, 10, selectedDifficulty).map(q => ({
    id: q.id, question: q.question, options: [...(q.options || [])]
  }));
  return {
    questions, index: 0,
    answers: { baby: null, hubby: null },
    revealed: false,
    scores: { baby: 0, hubby: 0 },
    status: "Both of you answer privately. Results reveal when both choose.",
    lastResult: null
  };
}

function initialWyrState() {
  const questions = sampleQuestions(wouldYouRather, 12, selectedDifficulty).map(q => ({
    id: q.id, optionA: q.optionA, optionB: q.optionB
  }));
  return {
    questions, index: 0,
    answers: { baby: null, hubby: null },
    revealed: false, matches: 0,
    status: "Both of you choose one option."
  };
}

function initialLikelyState() {
  const questions = sampleQuestions(likelyQuestions, 15, selectedDifficulty).map(q => ({
    id: q.id, question: q.question
  }));
  return {
    questions, index: 0,
    votes: { baby: null, hubby: null },
    revealed: false,
    status: "Vote for who is more likely."
  };
}

function initialSongState() {
  const questions = sampleQuestions(songs, 10, selectedDifficulty).map(q => ({
    id: q.id, clue: q.clue, options: shuffle([...(q.options || [])]),
    answer: q.answer, songTitle: q.songTitle, artist: q.artist
  }));
  return {
    questions, index: 0, player: 0, answered: false, lastCorrect: null,
    scores: { baby: 0, hubby: 0 },
    status: "Choose the correct song title."
  };
}

function initialMemoryState() {
  const set = pickMemorySet();
  const emojis = Array.isArray(set?.pairs) ? set.pairs.slice(0, 6) : ["❤️","🌹","💜","🎵","⭐","🐻"];
  const cards = shuffle([...emojis, ...emojis]).map((emoji, index) => ({ id: index, emoji, matched: false }));
  return {
    cards, player: 0, firstCardId: null, secondCardId: null, locked: false,
    scores: { baby: 0, hubby: 0 }, moves: 0, status: "Find two matching cards.", winner: null
  };
}

function initialStateForGame(type) {
  switch (type) {
    case "truth-or-dare": return initialTruthDareState();
    case "spin-wheel": return initialWheelState();
    case "couples-quiz": return initialQuizState();
    case "would-you-rather": return initialWyrState();
    case "memory-game": return initialMemoryState();
    case "who-is-more-likely": return initialLikelyState();
    case "guess-the-song": return initialSongState();
    default: return { initialized: true };
  }
}

/* =========================================
   TRUTH OR DARE
========================================= */

function renderTruthDareShell() {
  commonLayout(`
    <section class="game-panel game-center">
      <span class="game-player-pill" id="tdPlayer"></span>
      <div class="game-big-icon"><i class="fa-solid fa-fire"></i></div>
      <p class="game-panel-label" id="tdModeLabel">MAKE YOUR CHOICE</p>
      <h2 class="game-question" id="tdPrompt">Truth or dare?</h2>
      <div class="game-buttons" id="tdChoiceButtons">
        <button class="game-btn" data-action="td-truth">💬 Truth</button>
        <button class="game-btn gold" data-action="td-dare">🔥 Dare</button>
      </div>
      <div class="game-buttons hidden" id="tdConfirmButtons">
        <button class="game-btn" data-action="td-confirm">✅ Partner confirms done</button>
      </div>
      <div id="tdResult" class="game-status">Choose your challenge to begin.</div>
      <button class="game-btn secondary full" data-action="td-next" id="tdNextBtn">Next player's turn</button>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(truthDareAction);
}

function renderTruthDareFromState() {
  if (!document.getElementById("tdPlayer")) renderTruthDareShell();
  const s = { ...initialTruthDareState(), ...state };
  state = s;
  const playerEl = document.getElementById("tdPlayer");
  const promptEl = document.getElementById("tdPrompt");
  const resultEl = document.getElementById("tdResult");
  const nextBtn = document.getElementById("tdNextBtn");
  const choiceWrap = document.getElementById("tdChoiceButtons");
  const confirmWrap = document.getElementById("tdConfirmButtons");
  const modeLabel = document.getElementById("tdModeLabel");
  if (!playerEl) return;

  const turnLabel = PLAYERS[s.player] || PLAYERS[0];
  const mine = isMyTurn(s.player);
  const partner = !currentPlayer ? "Partner" : partnerLabel();
  playerEl.textContent = mine ? `${turnLabel}'s turn (You)` : `${turnLabel}'s turn`;

  if (s.phase === "choose") {
    promptEl.textContent = "Truth or dare?";
    modeLabel.textContent = "MAKE YOUR CHOICE";
  } else {
    promptEl.textContent = s.promptText || "Truth or dare?";
    modeLabel.textContent = s.promptType === "dare" ? "DARE" : "TRUTH";
  }

  let status = s.result || "Choose your challenge to begin.";
  if (s.phase === "confirm_dare") {
    status = mine ? `Waiting for ${partner} to confirm you completed this dare.` : `${turnLabel} says the dare is done. Tap confirm when you agree.`;
  } else if (s.phase === "completed") {
    status = `Dare confirmed. You can move to the next turn.`;
  }
  resultEl.textContent = status;

  choiceWrap.classList.toggle("hidden", s.phase !== "choose");
  choiceWrap.querySelectorAll("button").forEach(btn => { btn.disabled = !mine || !sessionReady || !currentPlayer; });
  confirmWrap.classList.toggle("hidden", !(s.phase === "confirm_dare" && !mine));
  confirmWrap.querySelectorAll("button").forEach(btn => { btn.disabled = mine || !sessionReady || !currentPlayer; });

  const canNext = mine && sessionReady && currentPlayer && (s.phase === "prompt" || s.phase === "completed");
  nextBtn.disabled = !canNext;
  nextBtn.textContent = canNext ? "Next player's turn" : (s.phase === "choose" ? "Choose truth or dare first" : (mine ? "Waiting for confirmation..." : `Waiting for ${turnLabel}...`));
}

function nextPromptFromState(list, usedIds) {
  let available = list.filter(item => !usedIds.includes(item.id));
  let nextUsed = [...usedIds];
  if (!available.length) { nextUsed = []; available = [...list]; }
  const item = available[Math.floor(Math.random() * available.length)];
  nextUsed.push(item.id);
  return { item, nextUsed };
}

async function truthDareAction(event) {
  if (await handleGlobalAction(event)) return;
  const button = event.target.closest("[data-action]");
  if (!button || !currentPlayer || !sessionReady) return;
  const action = button.dataset.action;
  const s = { ...initialTruthDareState(), ...state };

  if (action === "td-truth" || action === "td-dare") {
    if (!isMyTurn(s.player) || s.phase !== "choose") return;
    const isTruth = action === "td-truth";
    const list = isTruth ? pickByDifficulty(truths, selectedDifficulty) : pickByDifficulty(dares, selectedDifficulty);
    if (!list.length) { updateSyncStatus("No prompts available for this difficulty."); return; }
    const usedIds = isTruth ? [...(s.usedTruthIds || [])] : [...(s.usedDareIds || [])];
    const { item, nextUsed } = nextPromptFromState(list, usedIds);
    const promptText = isTruth ? (item.question || item.text || "") : (item.task || item.text || "");
    pushState(curr => {
      const n = { ...initialTruthDareState(), ...curr };
      n.phase = isTruth ? "prompt" : "confirm_dare";
      n.promptType = isTruth ? "truth" : "dare";
      n.promptText = promptText;
      n.promptId = item.id;
      n.result = isTruth ? `${PLAYERS[n.player]} chose TRUTH. Answer honestly!` : `${PLAYERS[n.player]} chose DARE. Partner must confirm when it's done.`;
      if (isTruth) n.usedTruthIds = nextUsed; else n.usedDareIds = nextUsed;
      n.confirmations = { baby: false, hubby: false };
      return n;
    }).then(() => saveHistory(`${PLAYERS[s.player]} chose ${isTruth ? "truth" : "dare"}.`)).catch(console.error);
    return;
  }

  if (action === "td-confirm") {
    if (isMyTurn(s.player) || s.phase !== "confirm_dare" || s.promptType !== "dare") return;
    pushState(curr => {
      const n = { ...initialTruthDareState(), ...curr };
      n.phase = "completed";
      n.confirmations = { ...n.confirmations, [currentPlayer.key]: true };
      n.completedBy = currentPlayer.label;
      n.result = `${currentPlayer.label} confirmed the dare is completed.`;
      return n;
    }).catch(console.error);
    return;
  }

  if (action === "td-next") {
    if (!isMyTurn(s.player)) return;
    if (!(s.phase === "prompt" || s.phase === "completed")) return;
    pushState(curr => {
      const n = { ...initialTruthDareState(), ...curr };
      n.player = 1 - n.player;
      n.phase = "choose";
      n.promptType = null;
      n.promptText = "";
      n.promptId = null;
      n.result = `${PLAYERS[n.player]}, choose truth or dare.`;
      n.confirmations = { baby: false, hubby: false };
      n.completedBy = null;
      return n;
    }).catch(console.error);
  }
}

/* =========================================
   SPIN THE WHEEL
========================================= */

function buildWheelOptions() {
  const pool = pickByDifficulty(dares, selectedDifficulty).slice(0, 8);
  if (pool.length >= 8) return pool.map(item => item.task || item.text || String(item));
  const mixed = shuffle([
    ...pickByDifficulty(dares, selectedDifficulty).map(d => d.task || d.text),
    ...pickByDifficulty(truths, selectedDifficulty).map(t => `Truth: ${t.question || t.text}`)
  ]).slice(0, 8);
  return mixed.length ? mixed : FALLBACK_WHEEL;
}

function renderWheelShell() {
  commonLayout(`
    <section class="game-panel game-center">
      <span class="game-player-pill" id="wheelPlayer"></span>
      <div class="wheel-wrap">
        <i class="fa-solid fa-caret-down wheel-pointer"></i>
        <div class="wheel" id="wheel">
          <div class="wheel-center"><i class="fa-solid fa-heart"></i></div>
        </div>
      </div>
      <h2 class="game-question" id="wheelResult">Ready to spin?</h2>
      <p class="game-muted" id="wheelHint"></p>
      <button class="game-btn gold full" id="spinButton" data-action="wheel-spin"><i class="fa-solid fa-rotate"></i> SPIN THE WHEEL</button>
      <button class="game-btn secondary full" data-action="wheel-next" id="wheelNextBtn">Next player's turn</button>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(wheelAction);
}

function renderWheelFromState() {
  if (!document.getElementById("wheelPlayer")) renderWheelShell();
  const s = { ...initialWheelState(), ...state };
  state = s;
  const turnLabel = PLAYERS[s.player] || PLAYERS[0];
  const mine = isMyTurn(s.player);
  document.getElementById("wheelPlayer").textContent = mine ? `${turnLabel}'s turn (You)` : `${turnLabel}'s turn`;
  document.getElementById("wheelResult").textContent = s.result || "Ready to spin?";
  document.getElementById("wheelHint").textContent = s.spinning ? "The wheel is spinning..." : "The wheel has surprise challenges.";
  const wheel = document.getElementById("wheel");
  wheel.style.transition = s.spinId === 0 ? "none" : "transform 4s cubic-bezier(.12,.75,.15,1)";
  wheel.style.transform = `rotate(${Number(s.angle) || 0}deg)`;
  const spinBtn = document.getElementById("spinButton");
  const nextBtn = document.getElementById("wheelNextBtn");
  spinBtn.disabled = !mine || !sessionReady || s.spinning;
  nextBtn.disabled = !mine || !sessionReady || s.spinning || s.result === "Ready to spin?";
}

async function wheelAction(event) {
  if (await handleGlobalAction(event)) return;
  const btn = event.target.closest("[data-action]");
  if (!btn || !currentPlayer || !sessionReady) return;
  const action = btn.dataset.action;
  const s = { ...initialWheelState(), ...state };
  if (action === "wheel-spin") {
    if (!isMyTurn(s.player) || s.spinning) return;
    const options = Array.isArray(s.wheelOptions) && s.wheelOptions.length ? s.wheelOptions : buildWheelOptions();
    const result = options[Math.floor(Math.random() * options.length)];
    const turns = 5 + Math.floor(Math.random() * 4);
    const angle = (Number(s.angle) || 0) + turns * 360 + Math.floor(Math.random() * 360);
    const spinId = Date.now();
    pushState(curr => {
      const n = { ...initialWheelState(), ...curr };
      n.spinning = true; n.wheelOptions = options; n.angle = angle; n.spinId = spinId; n.result = "Spinning..."; n.lastSpinner = currentPlayer.key;
      return n;
    }).catch(console.error);
    setTimeout(() => {
      pushState(curr => {
        const n = { ...initialWheelState(), ...curr };
        if (n.spinId !== spinId) return n;
        n.spinning = false; n.result = result;
        return n;
      }).then(() => saveHistory(`${PLAYERS[s.player]} spun: ${String(result).slice(0, 60)}.`)).catch(console.error);
    }, 4100);
    return;
  }
  if (action === "wheel-next") {
    if (!isMyTurn(s.player) || s.spinning || s.result === "Ready to spin?") return;
    pushState(curr => {
      const n = { ...initialWheelState(), ...curr };
      n.player = 1 - n.player; n.spinning = false; n.result = "Ready to spin?";
      return n;
    }).catch(console.error);
  }
}
function renderQuizShell() {
  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score"><strong id="quizBabyScore">0</strong><span>Baby ❤️</span></div>
        <div class="game-score"><strong id="quizHubbyScore">0</strong><span>Hubby 💜</span></div>
      </div>
      <div class="game-center">
        <span class="game-player-pill" id="quizPlayer"></span>
        <p class="game-panel-label" style="margin-top:15px" id="quizProgress">QUESTION 1</p>
        <h2 class="game-question" id="quizQuestion"></h2>
      </div>
      <div class="game-choice-list" id="quizOptions"></div>
      <div class="game-status" id="quizStatus"></div>
      <button class="game-btn secondary full" data-action="quiz-next" id="quizNext" hidden>Next question</button>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(quizAction);
}

function renderQuizFromState() {
  if (!document.getElementById("quizQuestion")) renderQuizShell();
  const s = { ...initialQuizState(), ...state };
  state = s;
  const q = currentQuestion(s);
  if (!q) {
    document.getElementById("quizQuestion").textContent = "Quiz complete! 💜";
    document.getElementById("quizProgress").textContent = "FINAL SCORE";
    document.getElementById("quizOptions").innerHTML = `<div class="game-status">You finished all questions.</div>`;
    document.getElementById("quizNext").hidden = true;
    return;
  }
  const mineKey = currentPlayer?.key;
  const myAnswer = mineKey ? s.answers?.[mineKey] : null;
  const partnerKey = mineKey === "baby" ? "hubby" : "baby";
  const partnerAnswer = mineKey ? s.answers?.[partnerKey] : null;
  document.getElementById("quizBabyScore").textContent = s.scores?.baby || 0;
  document.getElementById("quizHubbyScore").textContent = s.scores?.hubby || 0;
  document.getElementById("quizProgress").textContent = `QUESTION ${s.index + 1} OF ${s.questions.length}`;
  document.getElementById("quizQuestion").textContent = q.question;
  document.getElementById("quizPlayer").textContent = s.revealed ? "Both answered" : "Both answer privately";
  document.getElementById("quizStatus").textContent = s.revealed
    ? (s.lastResult || "Revealed.")
    : (myAnswer === null ? "Pick your answer." : `Waiting for ${partnerLabel()}...`);

  if (!s.revealed) {
    document.getElementById("quizOptions").innerHTML = q.options.map((option, index) => `
      <button class="game-choice ${myAnswer === index ? "selected" : ""}" data-action="quiz-answer" data-value="${index}" ${myAnswer !== null || !currentPlayer ? "disabled" : ""}>
        ${String.fromCharCode(65 + index)}. ${escapeHtml(option)}
      </button>
    `).join("") + (myAnswer !== null && partnerAnswer === null ? `<div class="game-status">Your answer is locked in. Waiting for ${escapeHtml(partnerLabel())}.</div>` : "");
    document.getElementById("quizNext").hidden = true;
  } else {
    document.getElementById("quizOptions").innerHTML = `
      <div class="game-status">
        Baby ❤️: ${escapeHtml(q.options[s.answers.baby] ?? "—")}<br>
        Hubby 💜: ${escapeHtml(q.options[s.answers.hubby] ?? "—")}
      </div>
    `;
    document.getElementById("quizNext").hidden = false;
  }
}

async function quizAction(event) {
  if (await handleGlobalAction(event)) return;
  const btn = event.target.closest("[data-action]");
  if (!btn || !currentPlayer || !sessionReady) return;
  const action = btn.dataset.action;
  const s = { ...initialQuizState(), ...state };
  const q = currentQuestion(s);
  if (!q) return;

  if (action === "quiz-answer") {
    if (s.revealed) return;
    const answer = Number(btn.dataset.value);
    if (!Number.isInteger(answer)) return;
    pushState(curr => {
      const n = { ...initialQuizState(), ...curr };
      const cq = currentQuestion(n);
      if (!cq || n.revealed) return n;
      if (n.answers[currentPlayer.key] !== null) return n;
      n.answers = { ...n.answers, [currentPlayer.key]: answer };
      const a = n.answers.baby;
      const b = n.answers.hubby;
      if (a !== null && b !== null) {
        n.revealed = true;
        const match = a === b;
        if (match) {
          n.scores = { baby: (n.scores.baby || 0) + 1, hubby: (n.scores.hubby || 0) + 1 };
          n.lastResult = "💜 Match! You both chose the same answer.";
        } else {
          n.lastResult = "Different answers — fun to compare!";
        }
      }
      return n;
    }).catch(console.error);
    return;
  }

  if (action === "quiz-next") {
    if (!s.revealed) return;
    pushState(curr => {
      const n = { ...initialQuizState(), ...curr };
      if (!n.revealed) return n;
      const nextIndex = n.index + 1;
      if (nextIndex >= n.questions.length) {
        return { ...n, index: nextIndex, answers: { baby: null, hubby: null }, revealed: false, lastResult: "Quiz complete." };
      }
      n.index = nextIndex;
      n.answers = { baby: null, hubby: null };
      n.revealed = false;
      n.lastResult = null;
      n.status = "Both of you answer privately. Results reveal when both choose.";
      return n;
    }).then(() => {
      const latest = state;
      if (latest.index >= (latest.questions?.length || 0)) saveHistory(`Quiz finished. ${latest.scores?.baby || 0} matching answers.`);
    }).catch(console.error);
  }
}

/* =========================================
   WOULD YOU RATHER
========================================= */

function renderWyrShell() {
  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score"><strong id="wyrMatches">0</strong><span>Matches</span></div>
        <div class="game-score"><strong id="wyrNumber">1</strong><span>Question</span></div>
      </div>
      <div class="game-center">
        <span class="game-player-pill" id="wyrPlayer">Both choose</span>
        <p class="game-panel-label" style="margin-top:15px">WOULD YOU RATHER...</p>
        <h2 class="game-question" id="wyrQuestion"></h2>
      </div>
      <div class="game-choice-list" id="wyrOptions"></div>
      <div class="game-status" id="wyrStatus"></div>
      <button class="game-btn secondary full" id="wyrNext" data-action="wyr-next" hidden>Next question</button>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(wyrAction);
}

function renderWyrFromState() {
  if (!document.getElementById("wyrQuestion")) renderWyrShell();
  const s = { ...initialWyrState(), ...state };
  state = s;
  const q = currentQuestion(s);
  if (!q) {
    document.getElementById("wyrQuestion").textContent = "Game complete! 💜";
    document.getElementById("wyrStatus").textContent = `You matched ${s.matches || 0} times.`;
    document.getElementById("wyrOptions").innerHTML = "";
    document.getElementById("wyrNext").hidden = true;
    return;
  }
  const myKey = currentPlayer?.key;
  const myAnswer = myKey ? s.answers?.[myKey] : null;
  const partnerKey = myKey === "baby" ? "hubby" : "baby";
  const partnerAnswer = myKey ? s.answers?.[partnerKey] : null;

  document.getElementById("wyrMatches").textContent = s.matches || 0;
  document.getElementById("wyrNumber").textContent = `${s.index + 1}/${s.questions.length}`;
  document.getElementById("wyrQuestion").textContent = "Pick the one you prefer";
  document.getElementById("wyrPlayer").textContent = s.revealed ? "Both answered" : "Both choose privately";
  document.getElementById("wyrStatus").textContent = s.revealed
    ? (s.answers.baby === s.answers.hubby ? "💜 Match! Same choice." : "Different choices — talk about it!")
    : (myAnswer === null ? "Make your choice." : `Waiting for ${partnerLabel()}...`);

  if (!s.revealed) {
    document.getElementById("wyrOptions").innerHTML = `
      <button class="game-choice ${myAnswer === 0 ? "selected" : ""}" data-action="wyr-answer" data-value="0" ${myAnswer !== null || !currentPlayer ? "disabled" : ""}>A · ${escapeHtml(q.optionA)}</button>
      <button class="game-choice ${myAnswer === 1 ? "selected" : ""}" data-action="wyr-answer" data-value="1" ${myAnswer !== null || !currentPlayer ? "disabled" : ""}>B · ${escapeHtml(q.optionB)}</button>
      ${myAnswer !== null && partnerAnswer === null ? `<div class="game-status">Your answer is locked in. Waiting for ${escapeHtml(partnerLabel())}.</div>` : ""}
    `;
    document.getElementById("wyrNext").hidden = true;
  } else {
    document.getElementById("wyrOptions").innerHTML = `
      <div class="game-status">
        Baby ❤️: ${escapeHtml(s.answers.baby === 0 ? q.optionA : q.optionB)}<br>
        Hubby 💜: ${escapeHtml(s.answers.hubby === 0 ? q.optionA : q.optionB)}
      </div>
    `;
    document.getElementById("wyrNext").hidden = false;
  }
}

async function wyrAction(event) {
  if (await handleGlobalAction(event)) return;
  const btn = event.target.closest("[data-action]");
  if (!btn || !currentPlayer || !sessionReady) return;
  const action = btn.dataset.action;
  const s = { ...initialWyrState(), ...state };
  if (action === "wyr-answer") {
    if (s.revealed) return;
    const answer = Number(btn.dataset.value);
    if (!(answer === 0 || answer === 1)) return;
    pushState(curr => {
      const n = { ...initialWyrState(), ...curr };
      if (n.revealed) return n;
      if (n.answers[currentPlayer.key] !== null) return n;
      n.answers = { ...n.answers, [currentPlayer.key]: answer };
      if (n.answers.baby !== null && n.answers.hubby !== null) {
        n.revealed = true;
        if (n.answers.baby === n.answers.hubby) n.matches = (n.matches || 0) + 1;
      }
      return n;
    }).catch(console.error);
    return;
  }
  if (action === "wyr-next") {
    if (!s.revealed) return;
    pushState(curr => {
      const n = { ...initialWyrState(), ...curr };
      if (!n.revealed) return n;
      const nextIndex = n.index + 1;
      if (nextIndex >= n.questions.length) {
        return { ...n, index: nextIndex, answers: { baby: null, hubby: null }, revealed: false };
      }
      n.index = nextIndex;
      n.answers = { baby: null, hubby: null };
      n.revealed = false;
      n.status = "Both of you choose one option.";
      return n;
    }).then(() => {
      if (state.index >= (state.questions?.length || 0)) saveHistory(`Would You Rather finished with ${state.matches || 0} matches.`);
    }).catch(console.error);
  }
}

/* =========================================
   WHO IS MORE LIKELY
========================================= */

function renderLikelyShell() {
  commonLayout(`
    <section class="game-panel game-center">
      <div class="game-big-icon"><i class="fa-solid fa-people-arrows"></i></div>
      <p class="game-panel-label" id="likelyProgress">QUESTION 1</p>
      <h2 class="game-question" id="likelyQuestion"></h2>
      <div class="game-choice-list" id="likelyOptions"></div>
      <div class="game-status" id="likelyStatus"></div>
      <button class="game-btn secondary full" data-action="likely-next" id="likelyNext" hidden>Next question</button>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(likelyAction);
}

function renderLikelyFromState() {
  if (!document.getElementById("likelyQuestion")) renderLikelyShell();
  const s = { ...initialLikelyState(), ...state };
  state = s;
  const q = currentQuestion(s);
  if (!q) {
    document.getElementById("likelyQuestion").textContent = "You've reached the end! 💜";
    document.getElementById("likelyProgress").textContent = "GAME COMPLETE";
    document.getElementById("likelyStatus").textContent = "All questions answered.";
    document.getElementById("likelyOptions").innerHTML = "";
    document.getElementById("likelyNext").hidden = true;
    return;
  }
  const myKey = currentPlayer?.key;
  const myVote = myKey ? s.votes?.[myKey] : null;
  const partnerKey = myKey === "baby" ? "hubby" : "baby";
  const partnerVote = myKey ? s.votes?.[partnerKey] : null;
  const labels = ["Baby ❤️", "Hubby 💜", "Both 😂"];

  document.getElementById("likelyProgress").textContent = `QUESTION ${s.index + 1} OF ${s.questions.length}`;
  document.getElementById("likelyQuestion").textContent = q.question;
  document.getElementById("likelyStatus").textContent = s.revealed
    ? `Baby: ${labels[s.votes.baby] ?? "—"} · Hubby: ${labels[s.votes.hubby] ?? "—"}`
    : (myVote === null ? "Cast your vote." : `Waiting for ${partnerLabel()}...`);

  if (!s.revealed) {
    document.getElementById("likelyOptions").innerHTML = labels.map((label, idx) => `
      <button class="game-choice ${myVote === idx ? "selected" : ""}" data-action="likely-vote" data-value="${idx}" ${myVote !== null || !currentPlayer ? "disabled" : ""}>${escapeHtml(label)}</button>
    `).join("") + (myVote !== null && partnerVote === null ? `<div class="game-status">Vote locked in. Waiting for ${escapeHtml(partnerLabel())}.</div>` : "");
    document.getElementById("likelyNext").hidden = true;
  } else {
    document.getElementById("likelyOptions").innerHTML = `<div class="game-status">Votes revealed. Talk about it!</div>`;
    document.getElementById("likelyNext").hidden = false;
  }
}

async function likelyAction(event) {
  if (await handleGlobalAction(event)) return;
  const btn = event.target.closest("[data-action]");
  if (!btn || !currentPlayer || !sessionReady) return;
  const action = btn.dataset.action;
  const s = { ...initialLikelyState(), ...state };
  if (action === "likely-vote") {
    if (s.revealed) return;
    const vote = Number(btn.dataset.value);
    if (![0,1,2].includes(vote)) return;
    pushState(curr => {
      const n = { ...initialLikelyState(), ...curr };
      if (n.revealed) return n;
      if (n.votes[currentPlayer.key] !== null) return n;
      n.votes = { ...n.votes, [currentPlayer.key]: vote };
      if (n.votes.baby !== null && n.votes.hubby !== null) n.revealed = true;
      return n;
    }).catch(console.error);
    return;
  }
  if (action === "likely-next") {
    if (!s.revealed) return;
    pushState(curr => {
      const n = { ...initialLikelyState(), ...curr };
      if (!n.revealed) return n;
      const nextIndex = n.index + 1;
      if (nextIndex >= n.questions.length) {
        return { ...n, index: nextIndex, votes: { baby: null, hubby: null }, revealed: false };
      }
      n.index = nextIndex;
      n.votes = { baby: null, hubby: null };
      n.revealed = false;
      n.status = "Vote for who is more likely.";
      return n;
    }).then(() => {
      if (state.index >= (state.questions?.length || 0)) saveHistory("Finished Who Is More Likely.");
    }).catch(console.error);
  }
}

/* =========================================
   GUESS THE SONG
========================================= */

function renderSongShell() {
  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score"><strong id="songBabyScore">0</strong><span>Baby ❤️</span></div>
        <div class="game-score"><strong id="songHubbyScore">0</strong><span>Hubby 💜</span></div>
      </div>
      <div class="game-center">
        <span class="game-player-pill" id="songPlayer"></span>
        <div class="game-big-icon"><i class="fa-solid fa-music"></i></div>
        <p class="game-panel-label" id="songProgress">SONG 1</p>
        <h2 class="game-question" id="songClue"></h2>
      </div>
      <div class="game-choice-list" id="songOptions"></div>
      <div class="game-status" id="songStatus"></div>
      <button class="game-btn secondary full" data-action="song-next" id="songNext" hidden>Next song</button>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(songAction);
}

function renderSongFromState() {
  if (!document.getElementById("songClue")) renderSongShell();
  const s = { ...initialSongState(), ...state };
  state = s;
  const q = currentQuestion(s);
  document.getElementById("songBabyScore").textContent = s.scores?.baby || 0;
  document.getElementById("songHubbyScore").textContent = s.scores?.hubby || 0;

  if (!q) {
    document.getElementById("songPlayer").textContent = "Complete";
    document.getElementById("songProgress").textContent = "FINAL SCORE";
    document.getElementById("songClue").textContent = "Game complete! 🎵";
    const winner = s.scores.baby === s.scores.hubby ? "It's a tie! 💜" : (s.scores.baby > s.scores.hubby ? "Baby ❤️ wins!" : "Hubby 💜 wins!");
    document.getElementById("songStatus").textContent = winner;
    document.getElementById("songOptions").innerHTML = `<div class="game-status">Baby ${s.scores.baby} · Hubby ${s.scores.hubby}</div>`;
    document.getElementById("songNext").hidden = true;
    return;
  }

  const mine = isMyTurn(s.player);
  document.getElementById("songPlayer").textContent = mine ? `${PLAYERS[s.player]}'s turn (You)` : `${PLAYERS[s.player]}'s turn`;
  document.getElementById("songProgress").textContent = `SONG ${s.index + 1} OF ${s.questions.length}`;
  document.getElementById("songClue").textContent = q.clue;
  document.getElementById("songStatus").textContent = s.answered
    ? (s.lastCorrect ? `Correct! 🎉 ${q.songTitle} — ${q.artist}` : `Not quite. Answer: ${q.songTitle} — ${q.artist}`)
    : (mine ? "Choose the correct song title." : `Waiting for ${PLAYERS[s.player]} to answer...`);

  if (!s.answered) {
    document.getElementById("songOptions").innerHTML = (q.options || []).map(option => `
      <button class="game-choice" data-action="song-answer" data-value="${escapeHtml(option)}" ${!mine || !currentPlayer ? "disabled" : ""}>${escapeHtml(option)}</button>
    `).join("");
    document.getElementById("songNext").hidden = true;
  } else {
    document.getElementById("songOptions").innerHTML = `<div class="game-status">${escapeHtml(q.songTitle)} — ${escapeHtml(q.artist)}</div>`;
    document.getElementById("songNext").hidden = !mine;
  }
}

async function songAction(event) {
  if (await handleGlobalAction(event)) return;
  const btn = event.target.closest("[data-action]");
  if (!btn || !currentPlayer || !sessionReady) return;
  const action = btn.dataset.action;
  const s = { ...initialSongState(), ...state };
  const q = currentQuestion(s);
  if (!q) return;

  if (action === "song-answer") {
    if (!isMyTurn(s.player) || s.answered) return;
    const answer = btn.dataset.value;
    const correct = answer === q.answer;
    pushState(curr => {
      const n = { ...initialSongState(), ...curr };
      if (!isMyTurn(n.player) || n.answered) return n;
      n.answered = true;
      n.lastCorrect = correct;
      if (correct) {
        const key = PLAYER_KEYS[n.player];
        n.scores = { ...n.scores, [key]: (n.scores[key] || 0) + 1 };
      }
      n.status = correct ? "Correct!" : "Not quite.";
      return n;
    }).catch(console.error);
    return;
  }

  if (action === "song-next") {
    if (!isMyTurn(s.player) || !s.answered) return;
    pushState(curr => {
      const n = { ...initialSongState(), ...curr };
      if (!n.answered) return n;
      n.index += 1;
      n.player = 1 - n.player;
      n.answered = false;
      n.lastCorrect = null;
      n.status = "Choose the correct song title.";
      return n;
    }).then(() => {
      if (state.index >= (state.questions?.length || 0)) saveHistory(`Guess the Song: Baby ${state.scores.baby} - Hubby ${state.scores.hubby}.`);
    }).catch(console.error);
  }
}

/* =========================================
   MEMORY CHALLENGE
========================================= */

function pickMemorySet() {
  const pool = pickByDifficulty(memorySets, selectedDifficulty);
  return pool[Math.floor(Math.random() * pool.length)] || { pairs: ["❤️","🌹","💜","🎵","⭐","🐻"] };
}

function renderMemoryShell() {
  commonLayout(`
    <section class="game-panel">
      <div class="game-score-row">
        <div class="game-score"><strong id="memoryBaby">0</strong><span>Baby ❤️</span></div>
        <div class="game-score"><strong id="memoryHubby">0</strong><span>Hubby 💜</span></div>
      </div>
      <div class="game-center">
        <span class="game-player-pill" id="memoryPlayer"></span>
        <p class="game-muted" id="memoryMoves">Moves: 0</p>
      </div>
      <div class="memory-grid" id="memoryGrid"></div>
      <div class="game-status" id="memoryStatus"></div>
      <button class="game-btn secondary full" data-action="reset-game">Reset game</button>
    </section>
  `);
  bindAction(memoryAction);
}

function renderMemoryFromState() {
  if (!document.getElementById("memoryGrid")) renderMemoryShell();
  const s = { ...initialMemoryState(), ...state };
  state = s;
  const mine = isMyTurn(s.player);
  document.getElementById("memoryBaby").textContent = s.scores?.baby || 0;
  document.getElementById("memoryHubby").textContent = s.scores?.hubby || 0;
  document.getElementById("memoryPlayer").textContent = mine ? `${PLAYERS[s.player]}'s turn (You)` : `${PLAYERS[s.player]}'s turn`;
  document.getElementById("memoryMoves").textContent = `Moves: ${s.moves || 0}`;
  document.getElementById("memoryStatus").textContent = s.winner ? s.winner : (s.status || "Find two matching cards.");

  const grid = document.getElementById("memoryGrid");
  grid.innerHTML = (s.cards || []).map(card => {
    const revealed = card.matched || s.firstCardId === card.id || s.secondCardId === card.id;
    const disabled = !mine || !sessionReady || s.locked || card.matched || revealed;
    return `
      <button
        class="memory-card ${revealed ? "revealed" : ""} ${card.matched ? "matched" : ""}"
        data-action="memory-card"
        data-value="${card.id}"
        aria-label="Memory card"
        ${disabled ? "disabled" : ""}
      >${revealed ? escapeHtml(card.emoji) : "?"}</button>
    `;
  }).join("");
}

async function memoryAction(event) {
  if (await handleGlobalAction(event)) return;
  const btn = event.target.closest("[data-action]");
  if (!btn || !currentPlayer || !sessionReady) return;
  if (btn.dataset.action !== "memory-card") return;
  const s = { ...initialMemoryState(), ...state };
  if (!isMyTurn(s.player) || s.locked) return;
  const cardId = Number(btn.dataset.value);
  const card = (s.cards || []).find(c => c.id === cardId);
  if (!card || card.matched || s.firstCardId === cardId || s.secondCardId === cardId) return;

  // First pick: reveal and wait.
  if (s.firstCardId === null) {
    pushState(curr => {
      const n = { ...initialMemoryState(), ...curr };
      if (!isMyTurn(n.player) || n.locked || n.firstCardId !== null) return n;
      n.firstCardId = cardId;
      n.status = "Pick another card.";
      return n;
    }).catch(console.error);
    return;
  }

  // Second pick: reveal, evaluate, schedule resolve if mismatch.
  const first = (s.cards || []).find(c => c.id === s.firstCardId);
  if (!first) return;
  const isMatch = first.emoji === card.emoji;

  pushState(curr => {
    const n = { ...initialMemoryState(), ...curr };
    if (!isMyTurn(n.player) || n.locked || n.firstCardId === null || n.secondCardId !== null) return n;
    const firstCard = n.cards.find(c => c.id === n.firstCardId);
    const secondCard = n.cards.find(c => c.id === cardId);
    if (!firstCard || !secondCard || secondCard.matched) return n;
    n.secondCardId = cardId;
    n.moves = (n.moves || 0) + 1;
    n.locked = true;
    if (firstCard.emoji === secondCard.emoji) {
      n.cards = n.cards.map(c => (c.id === firstCard.id || c.id === secondCard.id) ? { ...c, matched: true } : c);
      const key = PLAYER_KEYS[n.player];
      n.scores = { ...n.scores, [key]: (n.scores[key] || 0) + 1 };
      n.status = "Great match! You get another turn.";
      n.firstCardId = null;
      n.secondCardId = null;
      n.locked = false;
      if (n.cards.every(c => c.matched)) {
        n.winner = n.scores.baby === n.scores.hubby ? "It's a tie! 💜" : (n.scores.baby > n.scores.hubby ? "Baby ❤️ wins!" : "Hubby 💜 wins!");
        n.status = n.winner;
      }
    } else {
      n.status = "Not a match. Passing turn...";
    }
    return n;
  }).then(() => {
    if (!isMatch) {
      setTimeout(() => {
        pushState(curr => {
          const n = { ...initialMemoryState(), ...curr };
          if (!n.locked || n.secondCardId === null) return n;
          n.firstCardId = null;
          n.secondCardId = null;
          n.locked = false;
          n.player = 1 - n.player;
          n.status = `${PLAYERS[n.player]}, your turn!`;
          return n;
        }).catch(console.error);
      }, 1000);
    } else {
      if (state.cards?.every(c => c.matched)) saveHistory(`Memory Challenge: ${state.winner}`);
    }
  }).catch(console.error);
}

/* =========================================
   START / SYNC / INIT
========================================= */

function assignData(type, loaded) {
  if (type === "truth-or-dare" || type === "spin-wheel") {
    truths.splice(0, truths.length, ...(loaded["data/truth-questions.json"] || []));
    dares.splice(0, dares.length, ...(loaded["data/dare-tasks.json"] || []));
  }
  if (type === "couples-quiz") quizQuestions.splice(0, quizQuestions.length, ...(loaded["data/couples-questions.json"] || []));
  if (type === "would-you-rather") wouldYouRather.splice(0, wouldYouRather.length, ...(loaded["data/would-you-rather.json"] || []));
  if (type === "who-is-more-likely") likelyQuestions.splice(0, likelyQuestions.length, ...(loaded["data/more-likely-questions.json"] || []));
  if (type === "guess-the-song") songs.splice(0, songs.length, ...(loaded["data/song-questions.json"] || []));
  if (type === "memory-game") memorySets.splice(0, memorySets.length, ...(loaded["data/memory-items.json"] || []));
}

function startGame() {
  const renderer = getRenderer();
  if (!renderer) return;
  commonLayout(`<section class="game-panel game-center"><h2>Loading game...</h2></section>`);
  // Render shell from current/initial state
  state = { ...initialStateForGame(gameType), ...state };
  renderer();
}

async function startMultiplayer() {
  if (!currentPlayer) { updateSyncStatus(); return; }
  if (!LIVE_GAMES.has(gameType)) { sessionReady = false; updateSyncStatus(); return; }
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
    state = initialStateForGame(gameType);
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

window.addEventListener("beforeunload", () => {
  try { unsubscribeSession?.(); } catch (_) {}
});

init();
console.log("Classen Purple Games Engine ready 🎮💜");
