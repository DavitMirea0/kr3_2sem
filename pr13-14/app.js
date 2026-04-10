const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const connectionStatus = document.getElementById('connection-status');
const enablePushBtn = document.getElementById('enable-push');
const disablePushBtn = document.getElementById('disable-push');
const swInfoEl = document.getElementById('sw-info');

const socket = io();
let publicKey = '';

// ===== Navigation =====
function setActiveButton(id) {
    [homeBtn, aboutBtn].forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

async function loadContent(page) {
    try {
        const r = await fetch('/content/' + page + '.html');
        contentDiv.innerHTML = await r.text();
        if (page === 'home') initNotes();
    } catch (e) {
        contentDiv.innerHTML = '<p style="text-align:center;color:#f87171">Ошибка загрузки</p>';
    }
}

homeBtn.addEventListener('click', () => { setActiveButton('home-btn'); loadContent('home'); });
aboutBtn.addEventListener('click', () => { setActiveButton('about-btn'); loadContent('about'); });

document.addEventListener('DOMContentLoaded', () => {
    loadContent('home');
    registerSW();
    updateStatus();
    getVapidKey();
});

// ===== Online/Offline =====
function updateStatus() {
    if (!connectionStatus) return;
    if (navigator.onLine) {
        connectionStatus.className = 'status status--online';
        connectionStatus.innerHTML = '<span class="status__dot"></span><span>Онлайн</span>';
    } else {
        connectionStatus.className = 'status status--offline';
        connectionStatus.innerHTML = '<span class="status__dot"></span><span>Офлайн</span>';
    }
}
window.addEventListener('online', updateStatus);
window.addEventListener('offline', updateStatus);

// ===== VAPID =====
async function getVapidKey() {
    try {
        const r = await fetch('/vapid-public-key');
        const d = await r.json();
        publicKey = d.publicKey;
        console.log('VAPID key received');
    } catch (e) { console.error('VAPID error:', e); }
}

// ===== Service Worker =====
async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('SW registered:', reg.scope);
        if (swInfoEl) swInfoEl.innerHTML = 'Service Worker: <span style="color:#34d399">активен</span>';
        setupPush(reg);
    } catch (e) {
        console.error('SW error:', e);
        if (swInfoEl) swInfoEl.innerHTML = 'Service Worker: <span style="color:#f87171">ошибка</span>';
    }
}

// ===== Push =====
function urlB64(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
    return arr;
}

async function setupPush(reg) {
    if (!enablePushBtn || !disablePushBtn) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        enablePushBtn.style.display = 'none';
        disablePushBtn.style.display = 'inline-block';
    }

    enablePushBtn.addEventListener('click', async () => {
        if (Notification.permission === 'denied') { alert('Уведомления запрещены в настройках.'); return; }
        if (Notification.permission === 'default') {
            const p = await Notification.requestPermission();
            if (p !== 'granted') { alert('Нужно разрешить уведомления.'); return; }
        }
        try {
            const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(publicKey) });
            await fetch('/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription) });
            console.log('[Push] Subscribed OK');
            toast('Уведомления включены!', 'success');
            enablePushBtn.style.display = 'none';
            disablePushBtn.style.display = 'inline-block';
        } catch (e) { console.error('[Push] Error:', e); toast('Ошибка подписки', 'error'); }
    });

    disablePushBtn.addEventListener('click', async () => {
        const s = await reg.pushManager.getSubscription();
        if (s) {
            await s.unsubscribe();
            await fetch('/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: s.endpoint }) });
            console.log('[Push] Unsubscribed');
            toast('Уведомления отключены', 'success');
            disablePushBtn.style.display = 'none';
            enablePushBtn.style.display = 'inline-block';
        }
    });
}

// ===== Fallback: SW sends push data via postMessage =====
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'PUSH_RECEIVED') {
            console.log('[Push fallback]', event.data);
            if (Notification.permission === 'granted') {
                new Notification(event.data.title, { body: event.data.body, icon: '/icons/favicon-128x128.png' });
            }
            toast(event.data.body || event.data.title, 'info', event.data.reminderId);
        }
    });
}

// ===== Toast =====
function toast(msg, type, reminderId) {
    var el = document.createElement('div');
    el.className = 'toast';
    if (type === 'success') el.style.background = '#059669';
    if (type === 'error') el.style.background = '#dc2626';

    if (reminderId) {
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.gap = '8px';
        el.style.maxWidth = '300px';
        el.style.padding = '12px 16px';

        var txt = document.createElement('div');
        txt.textContent = msg;
        el.appendChild(txt);

        var btn = document.createElement('button');
        btn.textContent = 'Отложить на 5 минут';
        btn.style.cssText = 'background:#fff;color:#6366f1;border:none;padding:6px 12px;border-radius:6px;font-weight:600;font-size:13px;cursor:pointer;';
        btn.onclick = function() {
            fetch('/snooze?reminderId=' + reminderId, { method: 'POST' })
                .then(function() { toast('Отложено на 5 минут', 'success'); })
                .catch(function() { toast('Ошибка', 'error'); });
            el.remove();
        };
        el.appendChild(btn);

        var close = document.createElement('span');
        close.textContent = '\u2715';
        close.style.cssText = 'position:absolute;top:6px;right:10px;cursor:pointer;font-size:14px;';
        close.onclick = function() { el.remove(); };
        el.appendChild(close);
    } else {
        el.textContent = msg;
        setTimeout(function() { el.remove(); }, 3000);
    }

    document.body.appendChild(el);
}

// ===== Notes =====
function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const rForm = document.getElementById('reminder-form');
    const rText = document.getElementById('reminder-text');
    const rTime = document.getElementById('reminder-time');
    const qForm = document.getElementById('quick-reminder-form');
    const qText = document.getElementById('quick-text');
    const qMin = document.getElementById('quick-minutes');
    const list = document.getElementById('notes-list');
    const emptyEl = document.getElementById('empty-state');
    if (!form) return;

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    function render() {
        const notes = JSON.parse(localStorage.getItem('softshop-notes') || '[]');
        if (!notes.length) { list.innerHTML = ''; if (emptyEl) emptyEl.style.display = 'block'; return; }
        if (emptyEl) emptyEl.style.display = 'none';
        list.innerHTML = notes.map((n, i) => {
            const text = typeof n === 'object' ? n.text : n;
            let info = '';
            if (n.reminder) info = '<br><small style="color:#a78bfa;">Напоминание: ' + new Date(n.reminder).toLocaleString('ru-RU') + '</small>';
            return '<li><span class="text">' + esc(text) + info + '</span><button class="delete-btn" data-index="' + i + '">X</button></li>';
        }).join('');
    }

    function addNote(text, reminder) {
        const notes = JSON.parse(localStorage.getItem('softshop-notes') || '[]');
        const note = { id: Date.now(), text, reminder: reminder || null };
        notes.push(note);
        localStorage.setItem('softshop-notes', JSON.stringify(notes));
        render();
        if (reminder) {
            socket.emit('newReminder', { id: note.id, text, reminderTime: reminder });
        } else {
            socket.emit('newTask', { text, timestamp: Date.now() });
        }
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const t = input.value.trim();
        if (t) { addNote(t, null); input.value = ''; input.focus(); }
    });

    if (rForm) {
        rForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const t = rText.value.trim();
            const dt = rTime.value;
            if (t && dt) {
                const ts = new Date(dt).getTime();
                if (ts > Date.now()) {
                    addNote(t, ts);
                    rText.value = ''; rTime.value = '';
                    toast('Напоминание установлено!', 'success');
                } else { alert('Дата должна быть в будущем'); }
            }
        });
    }

    // Quick reminder form (N minutes from now)
    if (qForm) {
        qForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const t = qText.value.trim();
            const mins = parseInt(qMin.value, 10);
            if (t && mins > 0) {
                const ts = Date.now() + mins * 60 * 1000;
                addNote(t, ts);
                qText.value = ''; qMin.value = '5';
                toast('Напоминание через ' + mins + ' мин!', 'success');
            }
        });
    }

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

// ===== WebSocket =====
socket.on('taskAdded', (task) => {
    console.log('Task from other client:', task);
    toast('Новая задача: ' + (task.text || task), 'info');
});
