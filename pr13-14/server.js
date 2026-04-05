var express = require("express");
var http = require("http");
var socketIo = require("socket.io");
var webpush = require("web-push");
var bodyParser = require("body-parser");
var cors = require("cors");
var path = require("path");
var fs = require("fs");

var VAPID_PUBLIC = "BPansTIIyeCJPbZzRFy5Y1cGHXoqcZM5cHBbGRjsUJRIn3d81v-0PJ1tD7yOxFlvKqT4BcoDxD5nsOKPP57rrbw";
var VAPID_PRIVATE = "MSUEg4PJl_c9RmcXcRILjDyH14xNXFXXBROLRoEr33I";

webpush.setVapidDetails("mailto:softshop@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

var app = express();
app.use(cors());
app.use(bodyParser.json());

// Serve sw.js with correct MIME
app.get("/sw.js", function (req, res) {
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "sw.js"));
});

// VAPID public key endpoint (client fetches this)
app.get("/vapid-public-key", function (req, res) {
  res.json({ publicKey: VAPID_PUBLIC });
});

app.use(express.static(__dirname));

// Push subscriptions
var subscriptions = [];

app.post("/subscribe", function (req, res) {
  console.log("POST /subscribe - new push subscription");
  subscriptions.push(req.body);
  res.status(201).json({ message: "Subscribed" });
});

app.post("/unsubscribe", function (req, res) {
  console.log("POST /unsubscribe");
  var endpoint = req.body.endpoint;
  subscriptions = subscriptions.filter(function (s) { return s.endpoint !== endpoint; });
  res.status(200).json({ message: "Unsubscribed" });
});

// Create server (HTTPS if certs exist, else HTTP)
var server;
var PORT = 3001;
var certPath = path.join(__dirname, "localhost.pem");
var keyPath = path.join(__dirname, "localhost-key.pem");

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  var https = require("https");
  server = https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app);
  console.log("HTTPS mode");
} else {
  server = http.createServer(app);
  console.log("HTTP mode (for HTTPS: mkcert localhost)");
}

// Socket.IO
var io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

io.on("connection", function (socket) {
  console.log("Client connected:", socket.id);

  socket.on("newTask", function (task) {
    console.log("newTask:", task.text, "| subscribers:", subscriptions.length);
    io.emit("taskAdded", task);

    var payload = JSON.stringify({ title: "SoftShop", body: task.text });
    subscriptions.forEach(function (sub) {
      webpush.sendNotification(sub, payload).then(function () {
        console.log("Push sent OK");
      }).catch(function (err) {
        console.error("Push error:", err.statusCode || err.message || err);
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(function (s) { return s.endpoint !== sub.endpoint; });
        }
      });
    });
  });

  socket.on("disconnect", function () {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, function () {
  var proto = fs.existsSync(certPath) ? "https" : "http";
  console.log(proto + "://localhost:" + PORT);
});
