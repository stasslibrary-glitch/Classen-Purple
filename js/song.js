
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
const LOCAL_SONGS = [
  {
    id: "local-perfect",
    title: "Perfect",
    artist: "Ed Sheeran",
    audioURL: "music/Ed Sheeran - Perfect.mp3",
    cover: "slideshow/song-info.jpg",
    dedication: "Our little world, in one song. ❤️",
    local: true
  },
  {
    id: "local-yoyo",
    title: "Yoyo",
    artist: "Joshua Baraka",
    audioURL: "music/Joshua Baraka - Yoyo.mp3",
    cover: "slideshow/111.jpg",
    dedication: "For the vibes we share. 💜",
    local: true
  },
  {
    id: "local-chap-chap",
    title: "Chap Chap",
    artist: "Lutty Neika",
    audioURL: "music/Lutty Neika - Chap Chap.mp3",
    cover: "slideshow/123.jpg",
    dedication: "A sweet beat for us. ❤️",
    local: true
  }
];

const audio = $("audioPlayer");

// =====================================
// SLIDESHOW
// =====================================

const slides = [
  { type: "image", src: "slideshow/photo2.jpg" },
  { type: "image", src: "slideshow/couple.png" },
  { type: "image", src: "slideshow/cruz1.jpg" },
  { type: "video", src: "slideshow/video1.mp4" },
  { type: "image", src: "slideshow/photo1.jpg" },
  { type: "image", src: "slideshow/111.jpg" },
  { type: "video", src: "slideshow/video2.mp4" },
  { type: "image", src: "slideshow/123.jpg" },
  { type: "image", src: "slideshow/cruz3.jpg" },
  { type: "video", src: "slideshow/video3.mp4" },
  { type: "image", src: "slideshow/slide4.jpg" },
  { type: "image", src: "slideshow/header-bg.jpg" }
];

function startSlideshow() {
  const dots = $("slideDots");
  dots.innerHTML = slides.map((_, index) => `
    <button class="slide-dot ${index === 0 ? "active" : ""}"
      data-slide="${index}" aria-label="Show slide ${index + 1}">
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
  const currentImg = $("slideImage");
  const currentVideo = $("slideVideo");
  const item = slides[index];

  currentImg?.classList.add("changing");
  currentVideo?.classList.add("changing");

  const onReady = () => {
    currentImg.classList.remove("changing");
    currentVideo?.classList.remove("changing");
  };

  if (item.type === "video") {
    if (currentImg) currentImg.style.display = "none";
    let video = currentVideo;
    if (!video) {
      video = document.createElement("video");
      video.id = "slideVideo";
      video.className = "slide-media";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = "metadata";
      currentImg.insertAdjacentElement("afterend", video);
    }
    video.style.display = "block";
    video.src = item.src;
    video.onloadeddata = onReady;
    video.onerror = onReady;
    video.play().catch(() => {});
  } else {
    if (currentVideo) {
      currentVideo.pause();
      currentVideo.style.display = "none";
    }
    currentImg.style.display = "block";
    const nextImage = new Image();
    nextImage.onload = () => {
      currentImg.src = item.src;
      onReady();
    };
    nextImage.onerror = onReady;
    nextImage.src = item.src;
  }

  document.querySelectorAll(".slide-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
}

function restartSlideshow() {
  clearInterval(slideTimer);
  slideTimer = setInterval(() => {
    showSlide((slideIndex + 1) % slides.length);
  }, 6000);
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
  if (!songs.length) songs = [...LOCAL_SONGS];
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
  // Render local songs immediately so the page never looks empty.
  songs = [...LOCAL_SONGS];
  renderPlaylist();
  renderDailySong();

  if (unsubscribeSongs) unsubscribeSongs();

  const songsQuery = query(songCollection, orderBy("createdAt", "asc"));

  unsubscribeSongs = onSnapshot(songsQuery, snapshot => {
    const remote = snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }));
    const remoteUrls = new Set(remote.map(s => (s.audioURL || "").trim()));
    const localOnly = LOCAL_SONGS.filter(s => !remoteUrls.has(s.audioURL));
    songs = [...localOnly, ...remote];

    renderPlaylist();
    renderDailySong();
    renderPlayerFromCurrent();
  }, error => {
    console.error("Playlist error:", error);
    songs = [...LOCAL_SONGS];
    renderPlaylist();
    renderDailySong();
    renderPlayerFromCurrent();
    showMessage("Showing local songs. Shared playlist unavailable.");
  });
}
function renderPlaylist() {
  const container = $("playlistList");
  if (!container) return;

  if (!songs.length) {
    songs = [...LOCAL_SONGS];
  }

  if (!songs.length) {
    container.innerHTML = `
      <div class="empty-library">
        <i class="fa-solid fa-music"></i>
        <h3>Our playlist starts here</h3>
        <p>Add your first song and let it become part of our story.</p>
        <button id="emptyAddSong">Add our first song</button>
      </div>
    `;
    $("emptyAddSong")?.addEventListener("click", openAddSong);
    return;
  }


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

    item.append(cover, details, play);

    if (!song.local) {
      const remove = document.createElement("button");
      remove.className = "remove-song";
      remove.innerHTML = '<i class="fa-solid fa-trash"></i>';
      remove.setAttribute("aria-label", `Remove ${song.title}`);
      remove.addEventListener("click", () => removeSong(song));
      item.appendChild(remove);
    } else {
      const badge = document.createElement("span");
      badge.className = "local-song-badge";
      badge.textContent = "Local";
      item.appendChild(badge);
    }
    container.appendChild(item);
  });
}

async function removeSong(song) {
  const confirmed = await (window.cpConfirm ? window.cpConfirm({ title: "Remove song", message: `Remove "${song.title}" from our shared playlist?`, confirmText: "Remove", cancelText: "Cancel", danger: true, icon: "🗑" }) : Promise.resolve(confirm(`Remove "${song.title}" from our shared playlist?`)));
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

  const rawUrl = String(song.audioURL || "").trim();
  const isLocalPath = song.local === true || /^(music|slideshow|images|assets)\//i.test(rawUrl) || rawUrl.startsWith("./") || rawUrl.startsWith("../");

  try {
    let resolvedUrl = rawUrl;
    if (!isLocalPath) {
      const url = new URL(rawUrl, window.location.href);
      if (!["https:", "http:"].includes(url.protocol)) {
        throw new Error("Invalid audio URL");
      }
      resolvedUrl = url.href;
    } else {
      resolvedUrl = new URL(rawUrl, window.location.href).href;
    }

    const songToPlay = { ...song, audioURL: resolvedUrl };

    if (!song.local && currentUser) {
      try {
        await setDoc(playerDocument, {
          songId: song.id,
          title: song.title,
          artist: song.artist,
          audioURL: rawUrl,
          cover: song.cover || "",
          selectedBy: currentUser.uid,
          selectedByEmail: currentUser.email,
          selectedAt: serverTimestamp()
        });
      } catch (err) {
        console.warn("Shared player update failed:", err);
      }

      try {
        await addDoc(recentCollection, {
          songId: song.id,
          title: song.title,
          artist: song.artist,
          cover: song.cover || "",
          playedBy: currentUser?.uid || "",
          playedByEmail: currentUser?.email || "",
          playedAt: serverTimestamp()
        });
      } catch (_) {}
    }

    loadSongLocally(songToPlay);

    try {
      await audio.play();
    } catch (playErr) {
      console.warn("Autoplay/play blocked:", playErr);
      showMessage("Song selected! Press Play to start listening.");
    }

  } catch (error) {
    console.error("Could not play song:", error, song);
    showMessage("Could not play this song. Check the file path or audio URL.");
  }
}
function listenToPlayer() {
  if (unsubscribePlayer) unsubscribePlayer();

  unsubscribePlayer = onSnapshot(playerDocument, snapshot => {
    if (!snapshot.exists()) return;

    const data = snapshot.data();
    const byId = songs.find(item => item.id === data.songId);
    const byUrl = songs.find(item => (item.audioURL || "").trim() === (data.audioURL || "").trim());
    const song = byId || byUrl || {
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

  const resolved = new URL(song.audioURL, window.location.href).href;
  if (audio.src !== resolved) {
    audio.src = resolved;
    audio.load();
  }

  $("playerTitle").textContent = song.title || "Unknown song";
  $("playerArtist").textContent = song.artist || "Unknown artist";

  setArtwork($("playerArtwork"), song.cover);

  $("mainPlayButton").innerHTML =
    '<i class="fa-solid fa-play"></i>';

  changingFromRemote = false;
}
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
  if (!user) {
    if (!songs.length) {
      songs = [...LOCAL_SONGS];
      renderPlaylist();
      renderDailySong();
    }
    return;
  }

  currentUser = user;
  if (!unsubscribeSongs) listenToSongs();
  if (!unsubscribePlayer) listenToPlayer();
  if (!unsubscribeRecent) listenToRecent();
});

// Render local songs immediately in case auth is delayed.
if (!songs.length) {
  songs = [...LOCAL_SONGS];
  renderPlaylist();
  renderDailySong();
}

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
