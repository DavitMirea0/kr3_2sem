// --- App Shell: navigation ---
var contentDiv = document.getElementById("app-content");
var homeBtn = document.getElementById("home-btn");
var aboutBtn = document.getElementById("about-btn");
var statusEl = document.getElementById("status");
var statusTxt = document.getElementById("status-text");
var swInfoEl = document.getElementById("sw-info");

// VAPID public key (must match server)
var VAPID_PUBLIC = "BIl-FbvKoHKohZE6k_GQAPDqA_3ShM4vmPj0loZCYpmGw_Xh2foq3Z6O1L8J4n8Eopw1f0oJepdp9XCgG5QRnz8";

// Socket.IO connection
var socket = io();

function setActiveButton(id) {
  homeBtn.classList.remove("active");
  aboutBtn.classList.remove("active");
  document.getElementById(id).classList.add("active");
}

function loadContent(page) {
  fetch("/content/" + page + ".html")
    .then(function (r) { return r.text(); })
    .then(function (html) {
      contentDiv.innerHTML = html;
      if (page === "home") {
        initNotes();
        initPushButtons();
      }
    })
    .catch(function () {
      contentDiv.innerHTML = '<p style="text-align:center;color:#f87171;">Ошибка загрузки страницы.</p>';
    });
}

homeBtn.addEventListener("click", function () {
  setActiveButton("home-btn");
  loadContent("home");
});
aboutBtn.addEventListener("click", function () {
  setActiveButton("about-btn");
  loadContent("about");
});

// Load home on start
loadContent("home");

// --- Online/Offline status ---
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

// --- Notes (localStorage) ---
function initNotes() {
  var form = document.getElementById("note-form");
  var input = document.getElementById("note-input");
  var list = document.getElementById("notes-list");
  var emptyEl = document.getElementById("empty-state");
  if (!form) return;

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function loadNotes() {
    var notes = JSON.parse(localStorage.getItem("softshop-notes") || "[]");
    if (notes.length === 0) {
      list.innerHTML = "";
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";
    var html = "";
    for (var i = 0; i < notes.length; i++) {
      html += '<li><span class="text">' + escapeHtml(notes[i]) +
        '</span><button class="delete-btn" data-index="' + i + '">X</button></li>';
    }
    list.innerHTML = html;
  }

  function addNote(text) {
    var notes = JSON.parse(localStorage.getItem("softshop-notes") || "[]");
    notes.push(text);
    localStorage.setItem("softshop-notes", JSON.stringify(notes));
    loadNotes();
    // Send via WebSocket
    socket.emit("newTask", { text: text, timestamp: Date.now() });
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
      var notes = JSON.parse(localStorage.getItem("softshop-notes") || "[]");
      notes.splice(parseInt(btn.dataset.index, 10), 1);
      localStorage.setItem("softshop-notes", JSON.stringify(notes));
      loadNotes();
    }
  });

  loadNotes();
}

// --- WebSocket: receive tasks from other clients ---
socket.on("taskAdded", function (task) {
  console.log("Task from another client:", task);
  var toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = "\u041D\u043E\u0432\u0430\u044F \u0437\u0430\u0434\u0430\u0447\u0430: " + task.text;
  document.body.appendChild(toast);
  setTimeout(function () { toast.remove(); }, 3000);
});

// --- Push subscribe/unsubscribe ---
function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var rawData = window.atob(base64);
  var arr = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) {
    arr[i] = rawData.charCodeAt(i);
  }
  return arr;
}

function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return Promise.resolve();
  return navigator.serviceWorker.ready.then(function (reg) {
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
    });
  }).then(function (sub) {
    return fetch("http://localhost:3001/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub)
    });
  }).then(function () {
    console.log("Push subscribed");
  }).catch(function (err) {
    console.error("Push subscribe error:", err);
  });
}

function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return Promise.resolve();
  return navigator.serviceWorker.ready.then(function (reg) {
    return reg.pushManager.getSubscription();
  }).then(function (sub) {
    if (sub) {
      return fetch("http://localhost:3001/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint })
      }).then(function () {
        return sub.unsubscribe();
      });
    }
  }).then(function () {
    console.log("Push unsubscribed");
  }).catch(function (err) {
    console.error("Push unsubscribe error:", err);
  });
}

function initPushButtons() {
  var enableBtn = document.getElementById("enable-push");
  var disableBtn = document.getElementById("disable-push");
  if (!enableBtn || !disableBtn) return;

  // Check existing subscription
  if ("serviceWorker" in navigator && "PushManager" in window) {
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (sub) {
        enableBtn.style.display = "none";
        disableBtn.style.display = "inline-block";
      }
    });
  }

  enableBtn.addEventListener("click", function () {
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      alert("\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F \u0437\u0430\u043F\u0440\u0435\u0449\u0435\u043D\u044B. \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0438\u0445 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445.");
      return;
    }
    var p = (typeof Notification !== "undefined" && Notification.permission === "default")
      ? Notification.requestPermission()
      : Promise.resolve("granted");
    p.then(function (perm) {
      if (perm === "granted" || perm === undefined) {
        return subscribeToPush();
      }
    }).then(function () {
      enableBtn.style.display = "none";
      disableBtn.style.display = "inline-block";
    });
  });

  disableBtn.addEventListener("click", function () {
    unsubscribeFromPush().then(function () {
      disableBtn.style.display = "none";
      enableBtn.style.display = "inline-block";
    });
  });
}

// --- Service Worker registration ---
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(function (reg) {
      console.log("SW registered, scope: " + reg.scope);
      swInfoEl.innerHTML = 'Service Worker: <span style="color:#34d399">\u0430\u043A\u0442\u0438\u0432\u0435\u043D</span>';
    })
    .catch(function (err) {
      console.error("SW error:", err);
      swInfoEl.innerHTML = 'Service Worker: <span style="color:#f87171">\u043E\u0448\u0438\u0431\u043A\u0430</span>';
    });
}
