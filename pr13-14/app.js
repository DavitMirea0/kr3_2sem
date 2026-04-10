// ===== DOM Elements =====
const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const connectionStatus = document.getElementById('connection-status');
const enablePushBtn = document.getElementById('enable-push');
const disablePushBtn = document.getElementById('disable-push');
const swInfoEl = document.getElementById('sw-info');

// ===== Socket.IO =====
const socket = io();

let publicKey = '';
let pushSubscription = null;

// ===== Navigation =====
function setActiveButton(activeId) {
    [homeBtn, aboutBtn].forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

async function loadContent(page) {
    try {
        const response = await fetch(`/content/${page}.html`);
        const html = await response.text();
        contentDiv.innerHTML = html;
        if (page === 'home') {
            initNotes();
        }
    } catch (err) {
        contentDiv.innerHTML = '<p style="text-align:center;color:#f87171">Ошибка загрузки</p>';
        console.error(err);
    }
}

homeBtn.addEventListener('click', () => {
    setActiveButton('home-btn');
    loadContent('home');
});

aboutBtn.addEventListener('click', () => {
    setActiveButton('about-btn');
    loadContent('about');
});

// ===== Init on load =====
document.addEventListener('DOMContentLoaded', () => {
    loadContent('home');
    registerServiceWorker();
    updateConnectionStatus();
    getVapidPublicKey();
});

// ===== Online/Offline =====
function updateConnectionStatus() {
    if (!connectionStatus) return;
    if (navigator.onLine) {
        connectionStatus.className = 'status status--online';
        connectionStatus.innerHTML = '<span class="status__dot"></span><span>Онлайн</span>';
    } else {
        connectionStatus.className = 'status status--offline';
        connectionStatus.innerHTML = '<span class="status__dot"></span><span>Офлайн</span>';
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// ===== Get VAPID key from server =====
async function getVapidPublicKey() {
    try {
        const response = await fetch('/vapid-public-key');
        const data = await response.json();
        publicKey = data.publicKey;
        console.log('VAPID Public Key received');
    } catch (err) {
        console.error('Error getting VAPID key:', err);
    }
}

// ===== Service Worker Registration =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            console.log('SW registered:', registration.scope);
            if (swInfoEl) {
                swInfoEl.innerHTML = 'Service Worker: <span style="color:#34d399">активен</span>';
            }
            await setupPushButtons(registration);
        } catch (error) {
            console.error('SW registration error:', error);
            if (swInfoEl) {
                swInfoEl.innerHTML = 'Service Worker: <span style="color:#f87171">ошибка</span>';
            }
        }
    }
}

// ===== Push Buttons Setup =====
async function setupPushButtons(registration) {
    if (!enablePushBtn || !disablePushBtn) return;

    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
        pushSubscription = subscription;
        enablePushBtn.style.display = 'none';
        disablePushBtn.style.display = 'inline-block';
    } else {
        pushSubscription = null;
        enablePushBtn.style.display = 'inline-block';
        disablePushBtn.style.display = 'none';
    }

    enablePushBtn.addEventListener('click', async () => {
        if (Notification.permission === 'denied') {
            alert('Уведомления запрещены. Разрешите их в настройках браузера.');
            return;
        }

        if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('Необходимо разрешить уведомления.');
                return;
            }
        }

        await subscribeToPush(registration);
    });

    disablePushBtn.addEventListener('click', async () => {
        await unsubscribeFromPush(registration);
    });
}

// ===== Subscribe to Push =====
async function subscribeToPush(registration) {
    if (!('PushManager' in window)) {
        alert('Push не поддерживается');
        return;
    }

    try {
        console.log('[Push] Subscribing with key:', publicKey.substring(0, 20) + '...');

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });

        console.log('[Push] Got subscription, sending to server...');

        await fetch('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });

        pushSubscription = subscription;
        console.log('[Push] Subscribed OK');
        showNotification('Уведомления включены!', 'success');

        enablePushBtn.style.display = 'none';
        disablePushBtn.style.display = 'inline-block';

    } catch (err) {
        console.error('[Push] Subscribe error:', err);
        showNotification('Ошибка включения уведомлений', 'error');
    }
}

// ===== Unsubscribe from Push =====
async function unsubscribeFromPush(registration) {
    try {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await subscription.unsubscribe();

            await fetch('/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });

            pushSubscription = null;
            console.log('[Push] Unsubscribed');
            showNotification('Уведомления отключены', 'success');

            enablePushBtn.style.display = 'inline-block';
            disablePushBtn.style.display = 'none';
        }
    } catch (err) {
        console.error('[Push] Unsubscribe error:', err);
    }
}

// ===== VAPID key converter =====
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
}

// ===== Toast notification =====
function showNotification(message, type) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (type === 'success') el.style.background = '#059669';
    if (type === 'error') el.style.background = '#dc2626';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ===== Notes =====
function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const list = document.getElementById('notes-list');
    const emptyEl = document.getElementById('empty-state');
    if (!form) return;

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function render() {
        const notes = JSON.parse(localStorage.getItem('softshop-notes') || '[]');
        if (notes.length === 0) {
            list.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';
        list.innerHTML = notes.map((note, i) =>
            `<li><span class="text">${esc(typeof note === 'object' ? note.text : note)}</span><button class="delete-btn" data-index="${i}">X</button></li>`
        ).join('');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        const notes = JSON.parse(localStorage.getItem('softshop-notes') || '[]');
        notes.push(text);
        localStorage.setItem('softshop-notes', JSON.stringify(notes));
        render();
        input.value = '';
        input.focus();
        socket.emit('newTask', { text: text, timestamp: Date.now() });
    });

    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.delete-btn');
        if (!btn) return;
        const notes = JSON.parse(localStorage.getItem('softshop-notes') || '[]');
        notes.splice(parseInt(btn.dataset.index, 10), 1);
        localStorage.setItem('softshop-notes', JSON.stringify(notes));
        render();
    });

    render();
}

// ===== WebSocket: task from another client =====
socket.on('taskAdded', (task) => {
    console.log('Task from another client:', task);
    showNotification('Новая задача: ' + (task.text || task), 'info');
});
