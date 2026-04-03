var express = require("express");
var http = require("http");
var socketIo = require("socket.io");
var webpush = require("web-push");
var bodyParser = require("body-parser");
var cors = require("cors");
var path = require("path");
var fs = require("fs");

// --- VAPID keys (generated via: npx web-push generate-vapid-keys) ---
var vapidKeys = {
  publicKey: "BIl-FbvKoHKohZE6k_GQAPDqA_3ShM4vmPj0loZCYpmGw_Xh2foq3Z6O1L8J4n8Eopw1f0oJepdp9XCgG5QRnz8",
  privateKey: "ASoyctW1n6MS7RO21FZrYbbyN5mmGwiKG2pUQ91ga0Q"
};

webpush.setVapidDetails(
  "mailto:softshop@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

var app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve sw.js with correct MIME type
app.get("/sw.js", function (req, res) {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "sw.js"));
});

app.use(express.static(__dirname));

// Push subscriptions storage
var subscriptions = [];

// Subscribe endpoint
app.post("/subscribe", function (req, res) {
  subscriptions.push(req.body);
  res.status(201).json({ message: "Subscribed" });
});

// Unsubscribe endpoint
app.post("/unsubscribe", function (req, res) {
  var endpoint = req.body.endpoint;
  subscriptions = subscriptions.filter(function (sub) {
    return sub.endpoint !== endpoint;
  });
  res.status(200).json({ message: "Unsubscribed" });
});

// --- Create server (HTTP or HTTPS) ---
var server;
var PORT = 3001;

// Try HTTPS if certs exist
var certPath = path.join(__dirname, "localhost.pem");
var keyPath = path.join(__dirname, "localhost-key.pem");

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  var https = require("https");
  var options = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
  server = https.createServer(options, app);
  console.log("HTTPS mode enabled");
} else {
  server = http.createServer(app);
  console.log("HTTP mode (no certs found, for HTTPS run: mkcert localhost)");
}

// --- Socket.IO ---
var io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on("connection", function (socket) {
  console.log("Client connected:", socket.id);

  socket.on("newTask", function (task) {
    // Broadcast to all clients
    io.emit("taskAdded", task);

    // Send push to all subscribers
    var payload = JSON.stringify({
      title: "Новая задача",
      body: task.text
    });

    subscriptions.forEach(function (sub) {
      webpush.sendNotification(sub, payload).catch(function (err) {
        console.error("Push error:", err.statusCode || err);
      });
    });
  });

  socket.on("disconnect", function () {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, function () {
  var protocol = fs.existsSync(certPath) ? "https" : "http";
  console.log(protocol + "://localhost:" + PORT);
});
