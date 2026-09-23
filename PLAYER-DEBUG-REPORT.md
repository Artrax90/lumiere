# Lumiere TV App — Проблема перемотки и воспроизведения

## Контекст
- Samsung UE50TU8500, Tizen 5.5 (Chromium ~56)
- Приложение: Lumiere (медиацентр, аналог Lampa/Lampac)
- Backend: Fastify (Node.js 20) на `http://192.168.1.37:3000`
- TorrServer: `http://192.168.1.37:8090` (торрент-стриминг)
- Источник контента: торренты (MKV, H.264 + EAC3/AAC)

## Архитектура
```
Samsung TV (.wgt launcher)
    ↓ window.location.href
http://192.168.1.37:3000/tv/
    ↓
index.html (vanilla JS, не React)
    ↓
tv.js → player.html → player-adapter.js + player.js
```

.wgt — это launcher который обнаруживает сервер в сети и открывает URL. Весь UI загружается с backend.

## Проблема
Фильм воспроизводится ~7-10 минут, затем **замирает**. Перемотка вперёд не работает — видео не двигается дальше точки зависания.

## Что мы исследовали и пробовали

### 1. FFmpeg + HLS (основной подход)
**Архитектура:**
```
TorrServer /stream → FFmpeg (-c:v copy -c:a aac) → HLS segments (.ts) → hls.js → <video>
```

**FFmpeg команда:**
```
ffmpeg -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 \
  -i http://localhost:8090/stream?link=<magnet>&index=<id>&play \
  -ss <seekTime> \
  -map 0:v:0 -map 0:a:<audioIndex> \
  -c:v copy -c:a aac -b:a 192k -ac 2 \
  -f hls -hls_time 6 -hls_list_size 0 -hls_flags append_list \
  -hls_segment_type mpegts \
  -hls_segment_filename /tmp/hls-<sessionId>/seg-%d.ts \
  -y /tmp/hls-<sessionId>/playlist.m3u8
```

**Результат:** Воспроизведение работает. Перемотка через hls.js (сегментная) работает но **медленная** — FFmpeg читает с начала потока.

---

### 2. SourceBuffer overflow (найдено и исправлено)
**Симптом:** Видео зависает через 7-10 минут.
**Причина:** `QuotaExceededError: Failed to execute 'appendBuffer' on 'SourceBuffer': The SourceBuffer is full`
**Анализ:** hls.js буфер был без ограничений:
- `maxBufferLength: 120` (2 мин)
- `maxMaxBufferLength: 300` (5 мин)
- `backBufferLength` — не задан (старые сегменты НИКОГДА не удалялись)
- `maxBufferSize` — не задан

Сегменты по 5-7 MB × ~50 сегментов = ~300 MB → Chrome SourceBuffer переполнен.

**Исправление:**
```javascript
new Hls({
    maxBufferLength: 30,      // 30 сек вперёд
    maxMaxBufferLength: 60,   // макс 60 сек
    backBufferLength: 30,     // удалять сегменты старше 30 сек
    maxBufferSize: 60 * 1000 * 1000  // 60 MB лимит
})
```
**Статус:** Исправлено. Видео больше не зависает по этой причине.

---

### 3. FFmpeg не умеет seek по HTTP для MKV
**Эксперимент:** Запустили FFmpeg с `-ss` перед `-i` и проверили HTTP Range header:
```bash
# Custom HTTP server logged requests
ffmpeg -ss 10 -i http://localhost:19999/ -t 1 -f null -
# Result: Range: bytes=0- (НЕ отправляет Range!)
```

**Вывод:** FFmpeg НЕ отправляет HTTP Range header при seek. Всегда читает с начала. Это подтверждено тестированием.

**TorrServer поддерживает Range:**
```
HEAD http://localhost:8090/stream?...&play
→ Accept-Ranges: bytes
→ Content-Length: 4560540159

GET ... Range: bytes=1000000-1000100
→ 206 Partial Content
→ Content-Range: bytes 1000000-1000100/4560540159
```

**Вывод:** TorrServer умеет отдавать Range, но FFmpeg не умеет их запрашивать для MKV по HTTP.

---

### 4. Длительность фильма неправильная
**Симптом:** Фильм 2 часа, но показывает 1:36.
**Анализ FFprobe:**
```
stream 0: duration: NOPTS    ← нет метаданных длительности
stream 1: duration: NOPTS
format: duration: 5759.84 (estimate from stream)  ← оценка по битрейту!
```

MKV файл НЕ содержит Duration metadata. FFprobe оценивает по `fileSize / bitrate`, что даёт неточный результат.

**Решение:** Добавили hls.js в TV player. hls.js вычисляет длительность из суммы `#EXTINF` в HLS манифесте — точная длительность.

**Статус:** Исправлено.

---

### 5. JWT token истекал за 15 минут
**Симптом:** Через ~15 минут — спам 401 ошибок, sync не работает, сессия теряется.
**Причина:** `accessExpiry: '15m'` — слишком короткий для просмотра фильмов.
**Исправление:** `accessExpiry: '7d'` + автоматический refresh через `/api/auth/refresh` + LAN auto-login fallback.
**Статус:** Исправлено.

---

### 6. Samsung Tizen ignores ?v=N cache busting
**Симптом:** Обновлённый JS/CSS не загружается на ТВ.
**Исправление:** Backend добавляет no-cache headers:
```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```
**Статус:** Исправлено.

---

### 7. Попытка: прямой поток TorrServer (без FFmpeg)
**Идея:** Как Lampa — передать URL TorrServer напрямую в `<video>`, минуя FFmpeg.
**Эксперимент:** Samsung TV `<video>` может играть MKV, но **не умеет seek** — браузер не отправляет HTTP Range requests для MKV.
**Вывод:** Прямой поток работает для воспроизведения, но перемотка невозможна.

---

### 8. Попытка: AVPlay через .wgt контекст
**Гипотеза:** AVPlay доступен только внутри .wgt приложения. Если загрузить UI через `<script>` тег (не навигацию), контекст сохранится.

**Эксперимент 1: Remote script test**
```html
<!-- Inside .wgt -->
<script>
var s = document.createElement('script');
s.src = 'http://192.168.1.37:3000/tv/test-webapis.js';
document.head.appendChild(s);
</script>
```
Результат удалённого скрипта:
```
typeof webapis: object
typeof webapis.avplay: object
AVPlay AVAILABLE from remote script!
```
**Вывод:** Удалённый скрипт ВИДИТ webapis.avplay! Контекст .wgt сохраняется при загрузке через `<script>`.

**Эксперимент 2: Fetch HTML + document.write()**
Идея: загрузить весь HTML с сервера через fetch, вставить через document.write().
**Результат:** Tizen Studio линтер блокирует: `"document.write can be a form of eval"`

**Эксперимент 3: Fetch HTML + innerHTML + script loading**
Идея: загрузить HTML, вставить через body.innerHTML, скрипты загрузить вручную.
**Результат:** Главная страница отображается, НО:
- Inline скрипты не выполняются (innerHTML не запускает script теги)
- player.html загружается с сервера → теряет контекст .wgt
- Ошибки молча проглатываются (window.onerror не выполняется)
- Перемотка не работает

**Вывод:** Этот подход не работает для полноценного приложения.

---

### 9. Анализ Lampa
Lampa загружает `app.min.js` с сервера через `<script>` тег **внутри .wgt**:
```javascript
// Lampa: loader.js
createScript('https://yumata.github.io/lampa/app.min.js', ...)
```
Ключевое отличие: Lampa — **один JS файл** (собранный Gulp/Babel). Наше приложение — множество файлов (tv.js, player.js, player-adapter.js, player.html) с динамической навигацией.

Lampa использует AVPlay через `tizen.js` wrapper — создает `<object type="application/avplayer">` и оборачивает AVPlay API в HTML5 video-подобный интерфейс.

---

## Текущее состояние
- Воспроизведение: работает (FFmpeg HLS)
- Перемотка: работает но **медленная** (FFmpeg читает с начала для каждого seek)
- Длительность: правильная (hls.js)
- Дизайн: золотой акцент, glow фокус, dynamic backdrop
- AVPlay: **не используется** (не удалось сохранить контекст .wgt)

## Что не решено
1. **Быстрая перемотка** — FFmpeg не умеет seek по HTTP, нужно либо:
   - Передавать `Range` header вручную (не поддерживается FFmpeg для MKV)
   - Использовать AVPlay (не удалось сохранить контекст .wgt)
   - Использовать другой плеер (mpv, VLC)
   - Проксировать с вычислением byte offset

2. **AVPlay интеграция** — нужно:
   - Упаковать весь frontend в .wgt (как Lampa) — требует переписывания CSS/JS для Tizen Studio линтера
   - Или найти способ передать AVPlay контекст в загружаемый с сервера код

## Файлы
- Launcher: `/home/mimo/samsung/app.js`, `index.html`, `config.xml`
- Backend TV: `/home/mimo/lumiere/back/public/tv/` (tv.js, tv.css, player.js, player-adapter.js, player.css, player.html, index.html)
- Backend API: `/home/mimo/lumiere/back/src/routes/torrents.ts` (FFmpeg HLS, proxy, duration)
