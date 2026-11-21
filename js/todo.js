
import { auth, db } from "./firebase.js";

import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import "./theme.js";

/* =========================================
   CLASSEN PURPLE — SHARED TO-DO SYSTEM
========================================= */

const todosRef = collection(db, "todos");

const todoForm = document.getElementById("todoForm");
const todoList = document.getElementById("todoList");

const taskTitle = document.getElementById("taskTitle");
const taskDescription = document.getElementById("taskDescription");
const taskAssignee = document.getElementById("taskAssignee");
const taskPriority = document.getElementById("taskPriority");
const taskDate = document.getElementById("taskDate");

const addTaskBtn = document.getElementById("addTaskBtn");

const progressPercent = document.getElementById("progressPercent");
const progressFill = document.getElementById("progressFill");

const completedCount = document.getElementById("completedCount");
const pendingCount = document.getElementById("pendingCount");
const totalCount = document.getElementById("totalCount");

const todayCount = document.getElementById("todayCount");
const overdueCount = document.getElementById("overdueCount");

const visibleTaskCount = document.getElementById("visibleTaskCount");

const todoFilters = document.getElementById("todoFilters");
const todoSort = document.getElementById("todoSort");

const moreNavBtn = document.getElementById("moreNavBtn");
const moreNavMenu = document.getElementById("moreNavMenu");

let currentUser = null;
let allTasks = [];
let currentFilter = "all";
let unsubscribeTasks = null;

/* =========================================
   HELPERS
========================================= */

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function assigneeName(value) {
  const names = {
    baby: "Baby ❤️",
    hubby: "Hubby 💜",
    both: "Both of us 💜"
  };

  return names[value] || "Both of us 💜";
}

function priorityName(value) {
  const names = {
    high: "High priority",
    normal: "Normal",
    low: "Low priority"
  };

  return names[value] || "Normal";
}

function isCompleted(task) {
  return task.completed === true;
}

/* =========================================
   PROGRESS AND STATISTICS
========================================= */

function updateStatistics() {
  const total = allTasks.length;

  const completed = allTasks.filter(isCompleted).length;
  const pending = total - completed;

  const percent = total
    ? Math.round((completed / total) * 100)
    : 0;

  const today = localDateString();

  const dueToday = allTasks.filter(task =>
    !isCompleted(task) && task.dueDate === today
  ).length;

  const overdue = allTasks.filter(task =>
    !isCompleted(task) &&
    task.dueDate &&
    task.dueDate < today
  ).length;

  progressPercent.textContent = `${percent}% completed`;
  progressFill.style.width = `${percent}%`;

  completedCount.textContent = completed;
  pendingCount.textContent = pending;
  totalCount.textContent = total;

  todayCount.textContent = dueToday;
  overdueCount.textContent = overdue;
}

/* =========================================
   FILTERING AND SORTING
========================================= */

function getVisibleTasks() {
  let tasks = [...allTasks];

  if (currentFilter === "pending") {
    tasks = tasks.filter(task => !isCompleted(task));
  }

  if (currentFilter === "completed") {
    tasks = tasks.filter(isCompleted);
  }

  const sort = todoSort.value;

  if (sort === "newest") {
    tasks.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
  }

  if (sort === "oldest") {
    tasks.sort((a, b) => (a.createdAtMillis || 0) - (b.createdAtMillis || 0));
  }

  if (sort === "due") {
    tasks.sort((a, b) => {
      const dateA = a.dueDate || "9999-12-31";
      const dateB = b.dueDate || "9999-12-31";

      return dateA.localeCompare(dateB);
    });
  }

  if (sort === "priority") {
    const rank = {
      high: 1,
      normal: 2,
      low: 3
    };

    tasks.sort((a, b) =>
      (rank[a.priority] || 2) - (rank[b.priority] || 2)
    );
  }

  return tasks;
}

/* =========================================
   CREATE TASK CARD
========================================= */

function createTaskCard(task) {
  const item = document.createElement("article");

  item.className = `todo-item ${isCompleted(task) ? "completed" : ""}`;

  const checkButton = document.createElement("button");
  checkButton.type = "button";
  checkButton.className = "todo-check";
  checkButton.setAttribute(
    "aria-label",
    isCompleted(task) ? "Mark as pending" : "Mark as completed"
  );

  checkButton.innerHTML = isCompleted(task)
    ? '<i class="fa-solid fa-check"></i>'
    : "";

  checkButton.addEventListener("click", () => {
    toggleTask(task);
  });

  const content = document.createElement("div");
  content.className = "todo-item-content";

  const title = document.createElement("h3");
  title.className = "todo-item-title";
  title.textContent = task.title || "Untitled task";

  content.appendChild(title);

  if (task.description) {
    const description = document.createElement("p");
    description.className = "todo-item-description";
    description.textContent = task.description;
    content.appendChild(description);
  }

  const meta = document.createElement("div");
  meta.className = "todo-item-meta";

  const assignee = document.createElement("span");
  assignee.className = "todo-tag";
  assignee.textContent = assigneeName(task.assignee);
  meta.appendChild(assignee);

  const priority = document.createElement("span");
  priority.className = `todo-tag priority-${task.priority || "normal"}`;
  priority.textContent = priorityName(task.priority);
  meta.appendChild(priority);

  if (task.dueDate) {
    const due = document.createElement("span");
    due.className = "todo-tag";

    const today = localDateString();

    const dueDate = new Date(`${task.dueDate}T00:00:00`);

    due.textContent = `Due ${dueDate.toLocaleDateString("en-UG", {
      day: "numeric",
      month: "short"
    })}`;

    if (!isCompleted(task) && task.dueDate < today) {
      due.classList.add("overdue");
      due.textContent += " • Overdue";
    } else if (!isCompleted(task) && task.dueDate === today) {
      due.classList.add("due-today");
      due.textContent += " • Today";
    }

    meta.appendChild(due);
  }

  content.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "todo-item-actions";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "todo-action-btn delete";
  deleteButton.title = "Delete task";
  deleteButton.setAttribute("aria-label", "Delete task");
  deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i>';

  deleteButton.addEventListener("click", () => {
    deleteTask(task);
  });

  actions.appendChild(deleteButton);

  item.append(checkButton, content, actions);

  return item;
}

/* =========================================
   RENDER TASKS
========================================= */

function renderTasks() {
  todoList.innerHTML = "";

  const tasks = getVisibleTasks();

  visibleTaskCount.textContent =
    `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "todo-empty";

    const icon = document.createElement("i");
    icon.className = "fa-solid fa-clipboard-check";

    const heading = document.createElement("h3");
    const paragraph = document.createElement("p");

    if (currentFilter === "completed") {
      heading.textContent = "Nothing completed yet";
      paragraph.textContent = "Completed tasks will appear here.";
    } else if (currentFilter === "pending") {
      heading.textContent = "All caught up!";
      paragraph.textContent = "There are no pending tasks.";
    } else {
      heading.textContent = "Your list is waiting!";
      paragraph.textContent = "Add your first task and let's get started.";
    }

    empty.append(icon, heading, paragraph);
    todoList.appendChild(empty);

    return;
  }

  tasks.forEach(task => {
    todoList.appendChild(createTaskCard(task));
  });
}

/* =========================================
   TOGGLE TASK
========================================= */

async function toggleTask(task) {
  try {
    await updateDoc(doc(db, "todos", task.id), {
      completed: !isCompleted(task),
      completedAt: !isCompleted(task)
        ? serverTimestamp()
        : null,
      completedBy: !isCompleted(task)
        ? currentUser.email
        : null,
      updatedAt: serverTimestamp()
    });

  } catch (error) {
    console.error("Task update failed:", error);
    alert("Could not update this task. Please try again.");
  }
}

/* =========================================
   DELETE TASK
========================================= */

async function deleteTask(task) {
  const confirmed = confirm(
    `Are you sure you want to delete "${task.title}"?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "todos", task.id));

  } catch (error) {
    console.error("Task deletion failed:", error);
    alert("Could not delete this task. Please try again.");
  }
}

/* =========================================
   ADD NEW TASK
========================================= */

todoForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  const title = taskTitle.value.trim();
  const description = taskDescription.value.trim();
  const assignee = taskAssignee.value;
  const priority = taskPriority.value;
  const dueDate = taskDate.value;

  if (!title) {
    alert("Please enter a task.");
    taskTitle.focus();
    return;
  }

  addTaskBtn.disabled = true;
  addTaskBtn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Adding task...';

  try {
    await addDoc(todosRef, {
      title,
      description,
      assignee,
      priority,
      dueDate,
      completed: false,
      createdBy: currentUser.email,
      createdAt: serverTimestamp(),
      createdAtMillis: Date.now(),
      updatedAt: serverTimestamp(),
      completedAt: null,
      completedBy: null
    });

    todoForm.reset();

    taskAssignee.value = "both";
    taskPriority.value = "normal";

  } catch (error) {
    console.error("Task creation failed:", error);
    alert("Could not add your task. Please check your connection.");

  } finally {
    addTaskBtn.disabled = false;
    addTaskBtn.innerHTML =
      '<i class="fa-solid fa-plus"></i> Add to Our List';
  }
});

/* =========================================
   FILTER BUTTONS
========================================= */

todoFilters.addEventListener("click", event => {
  const button = event.target.closest(".todo-filter");

  if (!button) return;

  currentFilter = button.dataset.filter;

  document.querySelectorAll(".todo-filter").forEach(filter => {
    filter.classList.toggle("active", filter === button);
  });

  renderTasks();
});

/* =========================================
   SORT
========================================= */

todoSort.addEventListener("change", renderTasks);

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
   FIRESTORE LIVE SYNC
========================================= */

function startTodoSync() {
  if (unsubscribeTasks) {
    unsubscribeTasks();
  }

  unsubscribeTasks = onSnapshot(
    todosRef,

    snapshot => {
      allTasks = snapshot.docs.map(document => {
        const data = document.data();

        let createdAtMillis = data.createdAtMillis || 0;

        if (!createdAtMillis && data.createdAt?.toMillis) {
          createdAtMillis = data.createdAt.toMillis();
        }

        return {
          id: document.id,
          ...data,
          createdAtMillis
        };
      });

      updateStatistics();
      renderTasks();
    },

    error => {
      console.error("To-do sync failed:", error);
      alert("Could not load shared tasks. Check your Firestore rules later.");
    }
  );
}

/* =========================================
   AUTHENTICATION
========================================= */

onAuthStateChanged(auth, user => {
  if (!user) {
    if (unsubscribeTasks) {
      unsubscribeTasks();
      unsubscribeTasks = null;
    }

    currentUser = null;
    allTasks = [];

    updateStatistics();
    renderTasks();

    return;
  }

  currentUser = user;
  startTodoSync();
});

/* =========================================
   INITIAL DISPLAY
========================================= */

updateStatistics();
renderTasks();

console.log("Classen Purple To-Do List ready 💜");
