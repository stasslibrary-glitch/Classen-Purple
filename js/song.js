
import { auth, db } from "./firebase.js";

import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// =====================================
// CLASSEN PURPLE - OUR SONG
// =====================================

const $ = (id) => document.getElementById(id);

const songCollection = collection(db, "sharedSongs", "library", "items");
const recentCollection = collection(db, "sharedSongs", "library", "recent");
const playerDocument = doc(db, "sharedSongs", "player", "current");

let currentUser = null;
let songs = [];
let recentSongs = [];
let currentSongId = null;
let currentSong = null;
let slideIndex = 0;
let slideTimer = null;
let unsubscribeSongs = null;
let unsubscribePlayer = null;
let unsubscribeRecent = null;
let changingFromRemote = false;

const audio = $("audioPlayer");

// =====================================
// SLIDESHOW
// Replace these paths with your photos.
// =====================================

const slides = [
  "slideshow/photo1.jpg",
  "slideshow/photo2.jpg",
  "slideshow/photo3.jpg",
  "slideshow/photo4.jpg"
];

function startSlideshow() {
  const dots = $("slideDots");

  dots.innerHTML = slides.map((_, index) => `
    <button class="slide-dot ${index === 0 ? "active" : ""}"
      data-slide="${index}" aria-label="Show photo ${index + 1}">
    </button>
  `).join("");

  dots.querySelectorAll(".slide-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      showSlide(Number(dot.dataset.slide));
      restartSlideshow();
    });
  });

  $("previousSlide").addEventListener("click", () => {
    showSlide((slideIndex - 1 + slides.length) % slides.length);
    restartSlideshow();
  });

  $("nextSlide").addEventListener("click", () => {
    showSlide((slideIndex + 1) % slides.length);
    restartSlideshow();
  });

  showSlide(0);
  restartSlideshow();
}

function showSlide(index) {
  slideIndex = index;
  const image = $("slideImage");

  image.classList.add("changing");

  const nextImage = new Image();

  nextImage.onload = () => {
    image.src = slides[index];
    image.classList.remove("changing");
  };

  nextImage.onerror = () => {
    image.classList.remove("changing");
    image.alt = "Add your photos to the slideshow folder";
  };

  nextImage.src = slides[index];

  document.querySelectorAll(".slide-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}

function restartSlideshow() {
  clearInterval(slideTimer);

  slideTimer = setInterval(() => {
    showSlide((slideIndex + 1) % slides.length);
  }, 5000);
}

// =====================================
// DAILY SONG
// Uses Kampala's calendar date so both
// accounts get the same daily selection.
// =====================================

function getKampalaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function hashString(value) {
  let hash = 0;

  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }

  return Math.abs(hash);
}

function getDailySong() {
  if (!songs.length) return null;

  const sorted = [...songs].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  const date = getKampalaDate();
  const index = hashString(date) % sorted.length;

  return sorted[index];
}

function renderDailySong() {
  const date = getKampalaDate();
  const daily = getDailySong();

  $("dailyDate").textContent = date;

  if (!daily) {
    $("dailyTitle").textContent = "Our next song is waiting";
    $("dailyArtist").textContent = "Add songs to our library";
    $("dailyDedication").textContent =
      "Every day deserves its own soundtrack. 💜";

    $("dailyArtwork").innerHTML =
      '<i class="fa-solid fa-music"></i>';

    $("dailyPlayButton").disabled = true;
    return;
  }

  $("dailyTitle").textContent = daily.title;
  $("dailyArtist").textContent = daily.artist;
  $("dailyDedication").textContent =
    daily.dedication || "A special song for the two of us. ❤️";

  setArtwork($("dailyArtwork"), daily.cover);
  $("dailyPlayButton").disabled = false;

  $("dailyPlayButton").onclick = () => playSong(daily);
}

// =====================================
// ARTWORK
// =====================================

function setArtwork(element, cover) {
  if (cover) {
    element.innerHTML = "";

    const image = document.createElement("img");
    image.src = cover;
    image.alt = "Song cover";

    image.onerror = () => {
      element.innerHTML = '<i class="fa-solid fa-music"></i>';
    };

    element.appendChild(image);
  } else {
    element.innerHTML = '<i class="fa-solid fa-music"></i>';
  }
}

// =====================================
// SHARED PLAYLIST
// =====================================

function listenToSongs() {
  if (unsubscribeSongs) unsubscribeSongs();

  const songsQuery = query(songCollection, orderBy("createdAt", "asc"));

  unsubscribeSongs = onSnapshot(songsQuery, snapshot => {
    songs = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderPlaylist();
    renderDailySong();
    renderPlayerFromCurrent();
  }, error => {
    console.error("Playlist error:", error);
    showMessage("Could not load the shared playlist. Check your Firestore rules.");
  });
}

function renderPlaylist() {
  const container = $("playlistList");

  if (!songs.length) {
    container.innerHTML = `
      <div class="empty-library">
        <i class="fa-solid fa-music"></i>
        <h3>Our playlist starts here</h3>
        <p>Add your first song and let it become part of our story.</p>
        <button id="emptyAddSong">Add our first song</button>
      </div>
    `;

    $("emptyAddSong").addEventListener("click", openAddSong);
    return;
  }

  container.innerHTML = "";

  songs.forEach(song => {
    const item = document.createElement("div");
    item.className = "playlist-item";

    const cover = document.createElement("div");
    cover.className = "playlist-cover";

    if (song.cover) {
      const img = document.createElement("img");
      img.src = song.cover;
      img.alt = "";
      img.onerror = () => {
        cover.innerHTML = '<i class="fa-solid fa-music"></i>';
      };
      cover.appendChild(img);
    } else {
      cover.innerHTML = '<i class="fa-solid fa-music"></i>';
    }

    const details = document.createElement("div");
    details.className = "playlist-text";

    const title = document.createElement("h3");
    title.textContent = song.title;

    const artist = document.createElement("p");
    artist.textContent = song.artist;

    details.append(title, artist);

    const play = document.createElement("button");
    play.innerHTML = '<i class="fa-solid fa-play"></i>';
    play.setAttribute("aria-label", `Play ${song.title}`);
    play.addEventListener("click", () => playSong(song));

    const remove = document.createElement("button");
    remove.className = "remove-song";
    remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
    remove.setAttribute("aria-label", `Remove ${song.title}`);
    remove.addEventListener("click", () => removeSong(song));

    item.append(cover, details, play, remove);
    container.appendChild(item);
  });
}

async function removeSong(song) {
  const confirmed = confirm(`Remove "${song.title}" from our shared playlist?`);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(songCollection, song.id));
    showMessage("Song removed from our playlist.");
  } catch (error) {
    console.error(error);
    showMessage("Could not remove this song. Check Firestore rules.");
  }
}

// =====================================
// ADD A SONG
// =====================================

function openAddSong() {
  $("addSongPanel").classList.remove("hidden");
  $("songName").focus();
}

function closeAddSong() {
  $("addSongPanel").classList.add("hidden");
  $("addSongForm").reset();
}

$("showAddSong").addEventListener("click", openAddSong);
$("cancelAddSong").addEventListener("click", closeAddSong);
$("emptyAddSong")?.addEventListener("click", openAddSong);

$("addSongForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    showMessage("Please sign in first.");
    return;
  }

  const title = $("songName").value.trim();
  const artist = $("songArtist").value.trim();
  const audioURL = $("songAudio").value.trim();
  const cover = $("songCover").value.trim();
  const dedication = $("songMessage").value.trim();

  try {
    const parsedURL = new URL(audioURL);

    if (!["https:", "http:"].includes(parsedURL.protocol)) {
      throw new Error("Invalid audio URL");
    }

    $("saveSongButton").disabled = true;
    $("saveSongButton").innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

    await addDoc(songCollection, {
      title,
      artist,
      audioURL,
      cover,
      dedication,
      addedBy: currentUser.uid,
      addedByEmail: currentUser.email,
      createdAt: serverTimestamp()
    });

    closeAddSong();
    showMessage("Your song has been added for both of you! ❤️");

  } catch (error) {
    console.error(error);
    showMessage("Could not save the song. Check the URL and Firestore rules.");
  } finally {
    $("saveSongButton").disabled = false;
    $("saveSongButton").innerHTML =
      '<i class="fa-solid fa-heart"></i> Save song';
  }
});

// =====================================
// SHARED PLAYER SELECTION
// This synchronizes which song is selected.
// Browsers may require each person to press
// Play on their own device.
// =====================================

async function playSong(song) {
  if (!song?.audioURL) return;

  try {
    const url = new URL(song.audioURL);

    if (!["https:", "http:"].includes(url.protocol)) {
      throw new Error("Invalid audio URL");
    }

    await setDoc(playerDocument, {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      audioURL: song.audioURL,
      cover: song.cover || "",
      selectedBy: currentUser.uid,
      selectedByEmail: currentUser.email,
      selectedAt: serverTimestamp()
    });

    await addDoc(recentCollection, {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      cover: song.cover || "",
      playedBy: currentUser.uid,
      playedByEmail: currentUser.email,
      playedAt: serverTimestamp()
    });

    loadSongLocally(song);

    try {
      await audio.play();
    } catch {
      showMessage("Song selected! Press Play to start listening.");
    }

  } catch (error) {
    console.error(error);
    showMessage("Could not select this song. Check its audio URL.");
  }
}

function listenToPlayer() {
  if (unsubscribePlayer) unsubscribePlayer();

  unsubscribePlayer = onSnapshot(playerDocument, snapshot => {
    if (!snapshot.exists()) return;

    const data = snapshot.data();

    const song = songs.find(item => item.id === data.songId) || {
      id: data.songId,
      title: data.title,
      artist: data.artist,
      audioURL: data.audioURL,
      cover: data.cover
    };

    if (!song.audioURL) return;

    if (currentSongId !== song.id) {
      loadSongLocally(song);
    }
  }, error => {
    console.error("Shared player error:", error);
  });
}

function renderPlayerFromCurrent() {
  if (!currentSongId) return;

  const latest = songs.find(song => song.id === currentSongId);
  if (latest && currentSong?.audioURL !== latest.audioURL) {
    loadSongLocally(latest);
  }
}

function loadSongLocally(song) {
  if (!song?.audioURL) return;

  changingFromRemote = true;
  currentSong = song;
  currentSongId = song.id;

  if (audio.src !== song.audioURL) {
    audio.src = song.audioURL;
    audio.load();
  }

  $("playerTitle").textContent = song.title;
  $("playerArtist").textContent = song.artist;

  setArtwork($("playerArtwork"), song.cover);

  $("mainPlayButton").innerHTML =
    '<i class="fa-solid fa-play"></i>';

  changingFromRemote = false;
}

// =====================================
// PLAYER CONTROLS
// =====================================

$("mainPlayButton").addEventListener("click", async () => {
  if (!currentSong) {
    const daily = getDailySong();

    if (daily) {
      await playSong(daily);
    } else {
      showMessage("Add a song to our playlist first. 💜");
    }

    return;
  }

  if (audio.paused) {
    try {
      await audio.play();
    } catch {
      showMessage("This audio link could not be played.");
    }
  } else {
    audio.pause();
  }
});

audio.addEventListener("play", () => {
  $("mainPlayButton").innerHTML =
    '<i class="fa-solid fa-pause"></i>';
});

audio.addEventListener("pause", () => {
  $("mainPlayButton").innerHTML =
    '<i class="fa-solid fa-play"></i>';
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration || !Number.isFinite(audio.duration)) return;

  $("songProgress").value =
    (audio.currentTime / audio.duration) * 100;

  $("currentTime").textContent = formatTime(audio.currentTime);
  $("duration").textContent = formatTime(audio.duration);
});

audio.addEventListener("loadedmetadata", () => {
  $("duration").textContent = formatTime(audio.duration);
});

$("songProgress").addEventListener("input", () => {
  if (audio.duration && Number.isFinite(audio.duration)) {
    audio.currentTime =
      (Number($("songProgress").value) / 100) * audio.duration;
  }
});

$("nextSong").addEventListener("click", () => changeSong(1));
$("previousSong").addEventListener("click", () => changeSong(-1));

function changeSong(direction) {
  if (!songs.length) {
    showMessage("Add songs to your playlist first.");
    return;
  }

  let index = songs.findIndex(song => song.id === currentSongId);

  if (index < 0) index = 0;
  else index = (index + direction + songs.length) % songs.length;

  playSong(songs[index]);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

// =====================================
// RECENTLY PLAYED
// =====================================

function listenToRecent() {
  if (unsubscribeRecent) unsubscribeRecent();

  const recentQuery = query(
    recentCollection,
    orderBy("playedAt", "desc"),
    limit(8)
  );

  unsubscribeRecent = onSnapshot(recentQuery, snapshot => {
    recentSongs = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));

    renderRecent();
  }, error => {
    console.error("Recent songs error:", error);
  });
}

function renderRecent() {
  const container = $("recentList");

  if (!recentSongs.length) {
    container.innerHTML =
      '<p class="empty-recent">Our listening memories will appear here. 💜</p>';
    return;
  }

  container.innerHTML = "";

  recentSongs.forEach(song => {
    const item = document.createElement("div");
    item.className = "recent-item";

    const cover = document.createElement("div");
    cover.className = "playlist-cover";

    if (song.cover) {
      const img = document.createElement("img");
      img.src = song.cover;
      img.alt = "";
      cover.appendChild(img);
    } else {
      cover.innerHTML = '<i class="fa-solid fa-music"></i>';
    }

    const details = document.createElement("div");
    details.className = "playlist-text";

    const title = document.createElement("h3");
    title.textContent = song.title;

    const artist = document.createElement("p");
    artist.textContent = song.artist;

    details.append(title, artist);
    item.append(cover, details);

    container.appendChild(item);
  });
}

// =====================================
// MESSAGE HELPER
// =====================================

let messageTimer;

function showMessage(message) {
  let toast = document.getElementById("songToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "songToast";

    Object.assign(toast.style, {
      position: "fixed",
      left: "50%",
      bottom: "90px",
      transform: "translateX(-50%)",
      zIndex: "9999",
      maxWidth: "85%",
      padding: "12px 17px",
      borderRadius: "14px",
      background: "#38204f",
      color: "#fff",
      fontSize: "12px",
      textAlign: "center",
      boxShadow: "0 8px 25px rgba(0,0,0,.3)"
    });

    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(messageTimer);

  messageTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

// =====================================
// AUTHENTICATION AND INITIALIZATION
// =====================================

onAuthStateChanged(auth, user => {
  if (!user) return;

  currentUser = user;

  if (!unsubscribeSongs) listenToSongs();
  if (!unsubscribePlayer) listenToPlayer();
  if (!unsubscribeRecent) listenToRecent();
});

startSlideshow();

// Display date immediately, even before songs load.
$("dailyDate").textContent = getKampalaDate();

// Cleanup listeners when leaving page.
window.addEventListener("pagehide", () => {
  unsubscribeSongs?.();
  unsubscribePlayer?.();
  unsubscribeRecent?.();
  clearInterval(slideTimer);
});
