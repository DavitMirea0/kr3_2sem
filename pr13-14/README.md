# Практические работы 13–17 — SoftShop: Заметки (PWA)

Хачатрян Давид ЭФБО-18-24

Офлайн-приложение для управления заметками с полным набором PWA-функций.

## Структура проекта

```
pr13-14/
├── content/
│   ├── home.html         # Динамический контент — заметки + форма напоминаний
│   └── about.html        # Страница «О приложении»
├── icons/                # Иконки PWA (16–512px)
├── index.html            # App Shell (каркас)
├── style.css             # Стили
├── app.js                # Клиентская логика
├── sw.js                 # Service Worker
├── manifest.json         # Web App Manifest
├── server.js             # Express + Socket.IO + Web Push
└── package.json
```

## Запуск

```bash
cd pr13-14
npm install
node server.js
```

Приложение: http://localhost:3001

Для HTTPS:
```bash
mkcert -install
mkcert localhost
node server.js
```

Приложение: https://localhost:3001

## Что реализовано

### Пр13 — Service Worker
- Регистрация Service Worker, кэширование статических ресурсов (стратегия Cache First)
- Офлайн-доступ: страница загружается из кэша при отсутствии сети
- Данные заметок хранятся в localStorage

### Пр14 — Web App Manifest
- Файл manifest.json (name, short_name, start_url, display, theme_color, icons)
- Набор иконок PNG (16, 32, 48, 64, 128, 256, 512px)
- Мета-теги для Android и iOS
- Возможность установки приложения на устройство

### Пр15 — HTTPS + App Shell
- Локальный HTTPS через mkcert (сервер автоматически определяет наличие сертификатов)
- Архитектура App Shell: каркас (index.html) кэшируется при установке, динамический контент загружается через fetch
- Навигация: вкладки «Главная» и «О приложении»
- Два кэша: shell (Cache First) и dynamic (Network First с fallback)

### Пр16 — WebSocket + Push
- Socket.IO: событие newTask при добавлении заметки → taskAdded всем клиентам
- Toast-уведомления в интерфейсе при получении задач от других клиентов
- Push-уведомления через web-push + VAPID
- Кнопки включения/отключения уведомлений
- Системные push-уведомления через showNotification в Service Worker

### Пр17 — Детализация Push (напоминания)
- Форма с полем datetime-local для установки времени напоминания
- Структура заметок: { id, text, reminder }
- Сервер планирует push через setTimeout, хранит таймеры в Map
- Кнопка «Отложить на 5 минут» в push-уведомлении
- Обработка notificationclick + POST /snooze в Service Worker

## Технологии

Node.js, Express, Socket.IO, web-push, VAPID, Service Worker, Cache API, Push API, Web App Manifest, localStorage
