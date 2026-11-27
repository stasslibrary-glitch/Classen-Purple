
import { auth, db } from "./firebase.js";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import "./theme.js";

/* =========================================
   CLASSEN PURPLE — SHARED CALENDAR
========================================= */

const calendarCollection = collection(db, "calendar");

const calendarDays = document.getElementById("calendarDays");
const currentMonth = document.getElementById("currentMonth");
const selectedDateTitle = document.getElementById("selectedDateTitle");
const selectedDateEvents = document.getElementById("selectedDateEvents");
const upcomingEvents = document.getElementById("upcomingEvents");

const eventModal = document.getElementById("eventModal");
const eventForm = document.getElementById("eventForm");

const openEventForm = document.getElementById("openEventForm");
const closeEventForm = document.getElementById("closeEventForm");

const previousMonth = document.getElementById("previousMonth");
const nextMonth = document.getElementById("nextMonth");

const moreNavBtn = document.getElementById("moreNavBtn");
const moreNavMenu = document.getElementById("moreNavMenu");

let currentUser = null;
let allEvents = [];
let unsubscribeEvents = null;

const today = new Date();

let displayedMonth = new Date(
  today.getFullYear(),
  today.getMonth(),
  1
);

let selectedDate = formatDate(today);

/* =========================================
   DATE HELPERS
========================================= */

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(dateString) {
  return parseDate(dateString).toLocaleDateString("en-UG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatShortDate(dateString) {
  return parseDate(dateString).toLocaleDateString("en-UG", {
    day: "numeric",
    month: "short"
  });
}

function getMonthName(date) {
  return date.toLocaleDateString("en-UG", {
    month: "long",
    year: "numeric"
  });
}

/* =========================================
   CATEGORY HELPERS
========================================= */

function categoryName(category) {
  const names = {
    special: "Special day",
    birthday: "Birthday",
    anniversary: "Anniversary",
    reminder: "Reminder",
    date: "Date together",
    other: "Other"
  };

  return names[category] || "Event";
}

/* =========================================
   CALENDAR DISPLAY
========================================= */

function renderCalendar() {
  calendarDays.innerHTML = "";

  currentMonth.textContent = getMonthName(displayedMonth);

  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay();

  const gridStart = new Date(year, month, 1 - startDay);

  const eventDates = new Set(
    allEvents.map(event => event.date)
  );

  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);

    const dateString = formatDate(date);

    const dayWrapper = document.createElement("div");
    dayWrapper.className = "calendar-day";

    if (date.getMonth() !== month) {
      dayWrapper.classList.add("other-month");
    }

    if (dateString === formatDate(today)) {
      dayWrapper.classList.add("today");
    }

    if (dateString === selectedDate) {
      dayWrapper.classList.add("selected");
    }

    if (eventDates.has(dateString)) {
      dayWrapper.classList.add("has-event");
    }

    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.textContent = date.getDate();
    dayButton.setAttribute("aria-label", formatLongDate(dateString));

    dayButton.addEventListener("click", () => {
      selectedDate = dateString;

      displayedMonth = new Date(
        date.getFullYear(),
        date.getMonth(),
        1
      );

      renderCalendar();
      renderSelectedDate();
    });

    dayWrapper.appendChild(dayButton);
    calendarDays.appendChild(dayWrapper);
  }
}

/* =========================================
   CREATE EVENT CARD
========================================= */

function createEventCard(event, showDate = false) {
  const card = document.createElement("article");
  card.className = "event-card";

  const color = document.createElement("div");
  color.className = `event-color ${event.category || "other"}`;

  const details = document.createElement("div");
  details.className = "event-details";

  const title = document.createElement("h3");
  title.textContent = event.title || "Untitled event";

  const description = document.createElement("p");
  description.textContent = event.description || "";

  const meta = document.createElement("div");
  meta.className = "event-meta";

  if (showDate) {
    const dateText = document.createElement("span");
    dateText.innerHTML = '<i class="fa-regular fa-calendar"></i>';

    const dateLabel = document.createElement("span");
    dateLabel.textContent = formatShortDate(event.date);

    meta.append(dateText, dateLabel);
  }

  if (event.time) {
    const timeLabel = document.createElement("span");
    timeLabel.innerHTML = '<i class="fa-regular fa-clock"></i>';

    const timeText = document.createElement("span");
    timeText.textContent = event.time;

    meta.append(timeLabel, timeText);
  }

  const category = document.createElement("span");
  category.className = "event-category";
  category.textContent = categoryName(event.category);

  details.appendChild(title);

  if (event.description) {
    details.appendChild(description);
  }

  if (meta.childNodes.length) {
    details.appendChild(meta);
  }

  details.appendChild(category);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "event-delete";
  deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i>';
  deleteButton.title = "Delete event";
  deleteButton.setAttribute("aria-label", "Delete event");

  deleteButton.addEventListener("click", async () => {
    const confirmed = await (window.cpConfirm ? window.cpConfirm({
      title: "Delete event",
      message: `Delete "${event.title}" from our calendar?`,
      confirmText: "Delete",
      cancelText: "Cancel",
      danger: true,
      icon: "🗑"
    }) : Promise.resolve(confirm(`Delete "${event.title}" from our calendar?`)));

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "calendar", event.id));
    } catch (error) {
      console.error("Event deletion failed:", error);
      alert("Could not delete this event. Please try again.");
    }
  });

  card.append(color, details, deleteButton);

  return card;
}

/* =========================================
   SELECTED DATE EVENTS
========================================= */

function renderSelectedDate() {
  selectedDateTitle.textContent = formatLongDate(selectedDate);

  selectedDateEvents.innerHTML = "";

  const events = allEvents
    .filter(event => event.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-calendar";

    empty.innerHTML = `
      <i class="fa-regular fa-calendar"></i>
      <h3>No events yet</h3>
      <p>Add something special to this day.</p>
    `;

    selectedDateEvents.appendChild(empty);
    return;
  }

  events.forEach(event => {
    selectedDateEvents.appendChild(
      createEventCard(event)
    );
  });
}

/* =========================================
   UPCOMING EVENTS
========================================= */

function renderUpcomingEvents() {
  upcomingEvents.innerHTML = "";

  const todayString = formatDate(today);

  const upcoming = allEvents
    .filter(event => event.date >= todayString)
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);

      if (dateCompare !== 0) return dateCompare;

      return (a.time || "").localeCompare(b.time || "");
    })
    .slice(0, 5);

  if (!upcoming.length) {
    const empty = document.createElement("div");
    empty.className = "empty-calendar";

    empty.innerHTML = `
      <i class="fa-regular fa-heart"></i>
      <h3>Nothing coming up</h3>
      <p>Let's plan our next special moment.</p>
    `;

    upcomingEvents.appendChild(empty);
    return;
  }

  upcoming.forEach(event => {
    const card = document.createElement("article");
    card.className = "event-card";

    const date = parseDate(event.date);

    const dateBox = document.createElement("div");
    dateBox.className = "upcoming-date";

    const day = document.createElement("strong");
    day.textContent = date.getDate();

    const month = document.createElement("span");
    month.textContent = date.toLocaleDateString("en-UG", {
      month: "short"
    });

    dateBox.append(day, month);

    const content = document.createElement("div");
    content.className = "upcoming-card-content";

    const title = document.createElement("h3");
    title.textContent = event.title || "Untitled event";

    const info = document.createElement("p");
    info.textContent = [
      categoryName(event.category),
      event.time || ""
    ].filter(Boolean).join(" • ");

    content.append(title, info);

    card.append(dateBox, content);
    upcomingEvents.appendChild(card);
  });
}

/* =========================================
   RENDER EVERYTHING
========================================= */

function renderAll() {
  renderCalendar();
  renderSelectedDate();
  renderUpcomingEvents();
}

/* =========================================
   FIRESTORE LIVE EVENTS
========================================= */

function listenForEvents() {
  if (unsubscribeEvents) {
    unsubscribeEvents();
  }

  unsubscribeEvents = onSnapshot(
    calendarCollection,

    snapshot => {
      allEvents = snapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
      }));

      allEvents.sort((a, b) => {
        const dateCompare = (a.date || "").localeCompare(b.date || "");

        if (dateCompare !== 0) return dateCompare;

        return (a.time || "").localeCompare(b.time || "");
      });

      renderAll();
    },

    error => {
      console.error("Calendar listener error:", error);
      alert("Could not load our shared calendar. Check your Firestore rules.");
    }
  );
}

/* =========================================
   ADD EVENT
========================================= */

function openModal() {
  eventModal.classList.remove("hidden");

  document.getElementById("eventDate").value = selectedDate;

  document.getElementById("eventTitle").focus();
}

function closeModal() {
  eventModal.classList.add("hidden");
}

openEventForm.addEventListener("click", openModal);
closeEventForm.addEventListener("click", closeModal);

eventModal.addEventListener("click", event => {
  if (event.target === eventModal) {
    closeModal();
  }
});

eventForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    alert("Please sign in before adding an event.");
    return;
  }

  const title = document.getElementById("eventTitle").value.trim();
  const date = document.getElementById("eventDate").value;
  const time = document.getElementById("eventTime").value;
  const category = document.getElementById("eventCategory").value;
  const description = document.getElementById("eventDescription").value.trim();

  if (!title || !date) {
    alert("Please enter an event title and date.");
    return;
  }

  const saveButton = eventForm.querySelector(".save-event-btn");
  saveButton.disabled = true;
  saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

  try {
    await addDoc(calendarCollection, {
      title,
      date,
      time,
      category,
      description,
      createdBy: currentUser.email,
      createdAt: serverTimestamp()
    });

    selectedDate = date;

    const chosenDate = parseDate(date);

    displayedMonth = new Date(
      chosenDate.getFullYear(),
      chosenDate.getMonth(),
      1
    );

    eventForm.reset();
    closeModal();
    renderAll();

  } catch (error) {
    console.error("Could not save event:", error);
    alert("Could not save your event. Please check your internet connection and Firestore rules.");

  } finally {
    saveButton.disabled = false;
    saveButton.innerHTML = '<i class="fa-solid fa-heart"></i> Save Our Event';
  }
});

/* =========================================
   MONTH NAVIGATION
========================================= */

previousMonth.addEventListener("click", () => {
  displayedMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() - 1,
    1
  );

  renderCalendar();
});

nextMonth.addEventListener("click", () => {
  displayedMonth = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + 1,
    1
  );

  renderCalendar();
});

/* =========================================
   MORE MENU
========================================= */

moreNavBtn?.addEventListener("click", () => {
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
   AUTHENTICATION
========================================= */

onAuthStateChanged(auth, user => {
  if (!user) {
    if (unsubscribeEvents) {
      unsubscribeEvents();
      unsubscribeEvents = null;
    }

    return;
  }

  currentUser = user;

  listenForEvents();
  renderAll();
});

/* =========================================
   INITIAL DISPLAY
========================================= */

document.getElementById("eventDate").value = selectedDate;

renderAll();

console.log("Classen Purple Calendar ready 💜");
