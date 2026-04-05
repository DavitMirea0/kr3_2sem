// =====================================================================
// App Shell navigation
// =====================================================================
var contentDiv = document.getElementById("app-content");
var homeBtn = document.getElementById("home-btn");
var aboutBtn = document.getElementById("about-btn");
var statusEl = document.getElementById("status");
var statusTxt = document.getElementById("status-text");
var swInfoEl = document.getElementById("sw-info");

var VAPID_PUBLIC = "BPansTIIyeCJPbZzRFy5Y1cGHXoqcZM5cHBbGRjsUJRIn3d81v-0PJ1tD7yOxFlvKqT4BcoDxD5nsOKPP57rrbw";

// Socket.IO - auto-detect protocol and host
var socket = io();

function setActive(id) {
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
      contentDiv.innerHTML = "<p style='text-align:center;color:#f87171'>Ошибка загрузки</p>";
    });
}

homeBtn.addEventListener("click", function () { setActive("home-btn"); loadContent("home"); });
aboutBtn.addEventListener("click", function () { setActive("about-btn"); loadContent("about"); });
loadContent("home");

// =====================================================================
// Online / Offline
// =====================================================================
function updateStatus() {
  if (navigator.onLine) {
    statusEl.className = "status status--online";
    statusTxt.textContent = "Онлайн";
  } else {
    statusEl.className = "status status--offline";
    statusTxt.textContent = "Офлайн";
  }
}
window.addEventListener("online", updateStatus);
window.addEventListener("offline", updateStatus);
updateStatus();

// =====================================================================
// Notes (localStorage)
// =====================================================================
function initNotes() {
  var form = document.getElementById("note-form");
  var input = document.getElementById("note-input");
  var list = document.getElementById("notes-list");
  var emptyEl = document.getElementById("empty-state");
  if (!form) return;

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  function render() {
    var notes = JSON.parse(localStorage.getItem("softshop-notes") || "[]");
    if (notes.length === 0) { list.innerHTML = ""; emptyEl.style.display = "block"; return; }
    emptyEl.style.display = "none";
    var h = "";
    for (var i = 0; i < notes.length; i++) {
      h += "<li><span class='text'>" + esc(notes[i]) + "</span><button class='delete-btn' data-index='" + i + "'>X</button></li>";
    }
    list.innerHTML = h;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    var notes = JSON.parse(localStorage.getItem("softshop-notes") || "[]");
    notes.push(text);
    localStorage.setItem("softshop-notes", JSON.stringify(notes));
    render();
    input.value = "";
    input.focus();
    // WebSocket: send new task
    socket.emit("newTask", { text: text, timestamp: Date.now() });
  });

  list.addEventListener("click", function (e) {
    var btn = e.target.closest(".delete-btn");
    if (!btn) return;
    var notes = JSON.parse(localStorage.getItem("softshop-notes") || "[]");
    notes.splice(parseInt(btn.dataset.index, 10), 1);
    localStorage.setItem("softshop-notes", JSON.stringify(notes));
    render();
  });

  render();
}

// =====================================================================
// WebSocket: receive from other clients
// =====================================================================
socket.on("taskAdded", function (task) {
  var t = document.createElement("div");
  t.className = "toast";
  t.textContent = "Новая задача: " + task.text;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 3000);
});

// =====================================================================
// Push notifications
// =====================================================================
function urlB64ToUint8(base64String) {
  var padding = "=".repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding);
  // Replace URL-safe chars
  var result = "";
  for (var i = 0; i < base64.length; i++) {
    var c = base64[i];
    if (c === "-") result += "+";
    else if (c === "_") result += "/";
    else result += c;
  }
  var rawData = window.atob(result);
  var arr = new Uint8Array(rawData.length);
  for (var j = 0; j < rawData.length; j++) {
    arr[j] = rawData.charCodeAt(j);
  }
  return arr;
}

function doSubscribe() {
  console.log("[Push] subscribing...");
  return navigator.serviceWorker.ready
    .then(function (reg) {
      console.log("[Push] SW ready, calling pushManager.subscribe");
      return reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(VAPID_PUBLIC)
      });
    })
    .then(function (subscription) {
      console.log("[Push] Got subscription:", subscription.endpoint.substring(0, 60) + "...");
      return fetch("/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      });
    })
    .then(function (resp) {
      console.log("[Push] Server responded:", resp.status);
    })
    .catch(function (err) {
      console.error("[Push] Subscribe error:", err);
    });
}

function doUnsubscribe() {
  return navigator.serviceWorker.ready
    .then(function (reg) { return reg.pushManager.getSubscription(); })
    .then(function (sub) {
      if (!sub) return;
      return fetch("/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint })
      }).then(function () { return sub.unsubscribe(); });
    })
    .then(function () { console.log("[Push] Unsubscribed"); })
    .catch(function (err) { console.error("[Push] Unsubscribe error:", err); });
}

function initPushButtons() {
  var onBtn = document.getElementById("enable-push");
  var offBtn = document.getElementById("disable-push");
  if (!onBtn || !offBtn) return;

  // Check if already subscribed
  if ("serviceWorker" in navigator && "PushManager" in window) {
    navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription();
    }).then(function (sub) {
      if (sub) {
        console.log("[Push] Already subscribed");
        onBtn.style.display = "none";
        offBtn.style.display = "inline-block";
      }
    });
  }

  onBtn.addEventListener("click", function () {
    console.log("[Push] Enable button clicked");

    // Step 1: request notification permission
    if (typeof Notification === "undefined") {
      console.error("[Push] Notification API not available");
      return;
    }

    if (Notification.permission === "denied") {
      alert("Уведомления запрещены в настройках браузера.");
      return;
    }

    Notification.requestPermission().then(function (perm) {
      console.log("[Push] Permission result:", perm);
      if (perm !== "granted") {
        alert("Необходимо разрешить уведомления.");
        return;
      }
      // Step 2: subscribe
      doSubscribe().then(function () {
        onBtn.style.display = "none";
        offBtn.style.display = "inline-block";
      });
    });
  });

  offBtn.addEventListener("click", function () {
    doUnsubscribe().then(function () {
      offBtn.style.display = "none";
      onBtn.style.display = "inline-block";
    });
  });
}

// =====================================================================
// Service Worker registration
// =====================================================================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(function (reg) {
      console.log("SW registered, scope:", reg.scope);
      swInfoEl.innerHTML = "Service Worker: <span style='color:#34d399'>активен</span>";
    })
    .catch(function (err) {
      console.error("SW error:", err);
      swInfoEl.innerHTML = "Service Worker: <span style='color:#f87171'>ошибка</span>";
    });
}
