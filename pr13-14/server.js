const express = require('express');
const http = require('http');
const https = require('https');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const vapidKeys = {
  publicKey: 'BBkkMy7g6QFPpRUWicwBiV3bvAflL0oojIzdP3T1MBS3FkZ8kXD3w0MayZzQnermPKbX8HbcYtkZ2NGG9bfrz8M',
  privateKey: '5g6rAacdz5U8vZ3fwqgtTGEYWoT7GvaiaNKOz6L6LGw'
};

webpush.setVapidDetails('mailto:softshop@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

app.use(express.static(path.join(__dirname, './')));

let subscriptions = [];
const reminders = new Map();

app.post('/subscribe', (req, res) => {
  console.log('POST /subscribe');
  subscriptions.push(req.body);
  res.status(201).json({ message: 'Subscribed' });
});

app.post('/unsubscribe', (req, res) => {
  console.log('POST /unsubscribe');
  subscriptions = subscriptions.filter(s => s.endpoint !== req.body.endpoint);
  res.status(200).json({ message: 'Unsubscribed' });
});

app.post('/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);
  if (!reminderId || !reminders.has(reminderId)) {
    return res.status(404).json({ error: 'Reminder not found' });
  }
  const reminder = reminders.get(reminderId);
  clearTimeout(reminder.timeoutId);
  const delay = 5 * 60 * 1000;
  const tid = setTimeout(() => {
    const payload = JSON.stringify({ title: 'Напоминание (отложено)', body: reminder.text, reminderId });
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).then(() => console.log('Snoozed push OK')).catch(e => console.error('Push err:', e.statusCode || e.message));
    });
    reminders.delete(reminderId);
  }, delay);
  reminders.set(reminderId, { timeoutId: tid, text: reminder.text, reminderTime: Date.now() + delay });
  console.log('Snoozed reminder', reminderId, 'for 5 min');
  res.status(200).json({ message: 'Snoozed' });
});

let server;
const PORT = 3001;
const certPath = path.join(__dirname, 'localhost.pem');
const keyPath = path.join(__dirname, 'localhost-key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  server = https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app);
  console.log('HTTPS mode');
} else {
  server = http.createServer(app);
  console.log('HTTP mode');
}

const io = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.on('connection', (socket) => {
  console.log('Client:', socket.id);

  socket.on('newTask', (task) => {
    console.log('newTask:', task.text, '| subs:', subscriptions.length);
    io.emit('taskAdded', task);
    const payload = JSON.stringify({ title: 'Новая задача', body: task.text });
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).then(() => console.log('Push OK')).catch(e => {
        console.error('Push err:', e.statusCode || e.message);
        if (e.statusCode === 410) subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
      });
    });
  });

  socket.on('newReminder', (r) => {
    const delay = r.reminderTime - Date.now();
    console.log('newReminder:', r.text, 'in', Math.round(delay/1000), 's | subs:', subscriptions.length);
    if (delay <= 0) return;
    const tid = setTimeout(() => {
      const payload = JSON.stringify({ title: 'Напоминание', body: r.text, reminderId: r.id });
      subscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).then(() => console.log('Reminder push OK')).catch(e => console.error('Push err:', e.statusCode || e.message));
      });
      reminders.delete(r.id);
    }, delay);
    reminders.set(r.id, { timeoutId: tid, text: r.text, reminderTime: r.reminderTime });
  });

  socket.on('disconnect', () => console.log('Disconnected:', socket.id));
});

server.listen(PORT, () => {
  console.log((fs.existsSync(certPath) ? 'https' : 'http') + '://localhost:' + PORT);
});
