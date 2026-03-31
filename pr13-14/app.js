var form = document.getElementById("note-form");
var input = document.getElementById("note-input");
var list = document.getElementById("notes-list");
var emptyEl = document.getElementById("empty-state");
var statusEl = document.getElementById("status");
var statusTxt = document.getElementById("status-text");
var swInfoEl = document.getElementById("sw-info");

function getNotes() {
  return JSON.parse(localStorage.getItem("softshop-notes") || "[]");
}

function saveNotes(notes) {
  localStorage.setItem("softshop-notes", JSON.stringify(notes));
}

function escapeHtml(str) {
  var d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function renderNotes() {
  var notes = getNotes();
  if (notes.length === 0) {
    list.innerHTML = "";
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";
  var html = "";
  for (var i = 0; i < notes.length; i++) {
    html +=
      '<li><span class="text">' +
      escapeHtml(notes[i]) +
      '</span><button class="delete-btn" data-index="' +
      i +
      '">X</button></li>';
  }
  list.innerHTML = html;
}

function addNote(text) {
  var notes = getNotes();
  notes.push(text);
  saveNotes(notes);
  renderNotes();
}

function deleteNote(index) {
  var notes = getNotes();
  notes.splice(index, 1);
  saveNotes(notes);
  renderNotes();
}

form.addEventListener("submit", function (e) {
  e.preventDefault();
  var text = input.value.trim();
  if (text) {
    addNote(text);
    input.value = "";
    input.focus();
  }
});

list.addEventListener("click", function (e) {
  var btn = e.target.closest(".delete-btn");
  if (btn) {
    deleteNote(parseInt(btn.dataset.index, 10));
  }
});

renderNotes();

function updateStatus() {
  if (navigator.onLine) {
    statusEl.className = "status status--online";
    statusTxt.textContent = "\u041E\u043D\u043B\u0430\u0439\u043D";
  } else {
    statusEl.className = "status status--offline";
    statusTxt.textContent = "\u041E\u0444\u043B\u0430\u0439\u043D";
  }
}
window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);
updateStatus();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then(function (reg) {
      console.log("SW registered, scope: " + reg.scope);
      swInfoEl.innerHTML = "Service Worker: <span style=\"color:#34d399\">\u0430\u043A\u0442\u0438\u0432\u0435\u043D</span>";
    })
    .catch(function (err) {
      console.error("SW registration failed:", err);
      swInfoEl.innerHTML = "Service Worker: <span style=\"color:#f87171\">\u043E\u0448\u0438\u0431\u043A\u0430</span>";
    });
} else {
  swInfoEl.textContent = "Service Worker \u043D\u0435 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442\u0441\u044F";
}
