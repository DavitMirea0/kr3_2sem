const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// VAPID keys (generated via: npx web-push generate-vapid-keys)
const vapidKeys = {
  publicKey: 'BPansTIIyeCJPbZzRFy5Y1cGHXoqcZM5cHBbGRjsUJRIn3d81v-0PJ1tD7yOxFlvKqT4BcoDxD5nsOKPP57rrbw',
  privateKey: 'MSUEg4PJl_c9RmcXcRILjDyH14xNXFXXBROLRoEr33I'
};

webpush.setVapidDetails(
  'mailto:softshop@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// VAPID public key endpoint
app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Serve sw.js with correct MIME
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

app.use(express.static(path.join(__dirname, './')));

// Push subscriptions storage
let subscriptions = [];

app.post('/subscribe', (req, res) => {
  console.log('POST /subscribe - new push subscription');
  subscriptions.push(req.body);
  res.status(201).json({ message: 'Subscribed' });
});

app.post('/unsubscribe', (req, res) => {
  console.log('POST /unsubscribe');
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  res.status(200).json({ message: 'Unsubscribed' });
});

// Create server (HTTPS if certs exist)
let server;
const PORT = 3001;
const certPath = path.join(__dirname, 'localhost.pem');
const keyPath = path.join(__dirname, 'localhost-key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  server = https.createServer({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  }, app);
  console.log('HTTPS mode');
} else {
  server = http.createServer(app);
  console.log('HTTP mode (for HTTPS: mkcert localhost)');
}

// Socket.IO
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('newTask', (task) => {
    console.log('newTask:', task.text, '| subscribers:', subscriptions.length);
    io.emit('taskAdded', task);

    const payload = JSON.stringify({
      title: 'Новая задача',
      body: task.text || task
    });

    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload)
        .then(() => console.log('Push sent OK'))
        .catch(err => {
          console.error('Push error:', err.statusCode || err.message);
          if (err.statusCode === 410) {
            subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
          }
        });
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  const proto = fs.existsSync(certPath) ? 'https' : 'http';
  console.log(`${proto}://localhost:${PORT}`);
});
