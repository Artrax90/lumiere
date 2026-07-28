// Lumiere TV Player — UI phase (Chrome 56 compatible)
// Only UI and navigation. No AVPlay, no audio switching, no subtitle rendering, no HLS changes.
(function() {
  'use strict';

  var API = '';
  var TOKEN_KEY = 'lumiere_access';
  var SERVER_KEY = 'lumiere_server';

  // State
  var isPlaying = false;
  var currentTime = 0;
  var duration = 0;
  var osdVisible = false;
  var osdTimer = null;
  var movieTitle = '';
  var movieId = 0;

  // Navigation: rows of focusable elements
  // Row 0: back button (single)
  // Row 1: transport buttons [start, rew, play, fwd, end]
  // Row 2: timeline scrubber
  // Row 3: action buttons [cc, audio, speed, settings]
  var navRows = [];
  var navRow = 1; // start on transport (play button)
  var navCol = 2; // play button index

  // Popup
  var popupOpen = false;
  var popupFocus = 0;
  var popupItems = [];
  var popupReturnRow = 0;
  var popupReturnCol = 0;

  // Seek via scrubber
  var scrubberFocused = false;
  var scrubberPos = 0; // 0-100

  // DOM
  var $video, $osd, $osdTitle, $timeCurrent, $timeTotal;
  var $fill, $bufferFill, $thumb, $centerPlay;
  var $popup, $popupHeader, $popupList, $subtitleOverlay;

  // ========== Init ==========
  window.addEventListener('DOMContentLoaded', function() {
    $video = document.getElementById('video');
    $osd = document.getElementById('osd');
    $osdTitle = document.getElementById('osd-title');
    $timeCurrent = document.getElementById('time-current');
    $timeTotal = document.getElementById('time-total');
    $fill = document.getElementById('timeline-fill');
    $bufferFill = document.getElementById('timeline-buffer');
    $thumb = document.getElementById('timeline-thumb');
    $centerPlay = document.getElementById('center-play');
    $popup = document.getElementById('popup');
    $popupHeader = document.getElementById('popup-header');
    $popupList = document.getElementById('popup-list');
    $subtitleOverlay = document.getElementById('subtitle-overlay');

    var server = localStorage.getItem(SERVER_KEY);
    if (server) API = server;

    var params = parseParams();
    movieTitle = params.title || '';
    movieId = parseInt(params.id) || 0;
    var url = params.url || '';

    $osdTitle.textContent = movieTitle;

    // Build nav rows
    navRows = [
      [document.getElementById('btn-back')], // row 0
      [ // row 1: transport
        document.getElementById('btn-start'),
        document.getElementById('btn-rew'),
        document.getElementById('btn-play'),
        document.getElementById('btn-fwd'),
        document.getElementById('btn-end')
      ],
      [document.getElementById('timeline-wrap')], // row 2: scrubber
      [ // row 3: actions
        document.getElementById('btn-cc'),
        document.getElementById('btn-audio'),
        document.getElementById('btn-speed'),
        document.getElementById('btn-settings')
      ]
    ];

    if (url) startPlayback(url);
    setupControls();
    showOsd();
    // Focus play button on first show
    navRow = 1; navCol = 2;
    highlightFocused();
  });

  function parseParams() {
    var search = window.location.search.substring(1);
    var p = {};
    search.split('&').forEach(function(pair) {
      var parts = pair.split('=');
      if (parts.length === 2) p[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
    return p;
  }

  // ========== Playback ==========
  function startPlayback(url) {
    $video.style.display = 'block';
    $video.src = url;
    $video.play().then(function() { isPlaying = true; updatePlayBtn(); }).catch(function() {});

    $video.ontimeupdate = function() {
      currentTime = $video.currentTime;
      if ($video.duration && isFinite($video.duration)) duration = $video.duration;
      if (!scrubberFocused) updateTimeline();
    };
    $video.onloadedmetadata = function() {
      if ($video.duration && isFinite($video.duration)) duration = $video.duration;
      updateTimeline();
    };
    $video.ondurationchange = function() {
      if ($video.duration && isFinite($video.duration)) duration = $video.duration;
      updateTimeline();
    };
    $video.onprogress = function() { updateBuffer(); };
    $video.oncanplay = function() {
      if ($video.duration && isFinite($video.duration)) duration = $video.duration;
      updateTimeline();
    };
    $video.onended = function() { isPlaying = false; updatePlayBtn(); saveProgress(); };
  }

  function updatePlayBtn() {
    var btn = document.getElementById('btn-play');
    if (btn) btn.innerHTML = isPlaying ? '❚❚' : '▶';
    if ($centerPlay) {
      if (isPlaying) $centerPlay.classList.add('hidden');
      else $centerPlay.classList.remove('hidden');
    }
  }

  // ========== Timeline ==========
  function updateTimeline() {
    var pct = duration > 0 ? (currentTime / duration * 100) : 0;
    if ($fill) $fill.style.width = pct + '%';
    if ($thumb) $thumb.style.left = pct + '%';
    if ($timeCurrent) $timeCurrent.textContent = fmt(currentTime);
    if ($timeTotal) $timeTotal.textContent = fmt(duration);
  }

  function updateBuffer() {
    if (!$bufferFill || !$video || !$video.buffered || $video.buffered.length === 0) return;
    var end = $video.buffered.end($video.buffered.length - 1);
    $bufferFill.style.width = (duration > 0 ? (end / duration * 100) : 0) + '%';
  }

  function updateScrubberPreview() {
    var pct = scrubberPos;
    if ($fill) $fill.style.width = pct + '%';
    if ($thumb) $thumb.style.left = pct + '%';
    if ($timeCurrent) $timeCurrent.textContent = fmt((pct / 100) * duration);
  }

  // ========== OSD ==========
  function showOsd() {
    osdVisible = true;
    if ($osd) $osd.classList.remove('hide');
    resetOsdTimer();
  }

  function hideOsd() {
    if (popupOpen || scrubberFocused) return;
    osdVisible = false;
    if ($osd) $osd.classList.add('hide');
    clearFocus();
  }

  function resetOsdTimer() {
    if (osdTimer) clearTimeout(osdTimer);
    if (!isPlaying || popupOpen || scrubberFocused) return;
    osdTimer = setTimeout(hideOsd, 5000);
  }

  // ========== Save progress ==========
  function saveProgress() {
    if (!movieId || currentTime < 10) return;
    try {
      var pos = JSON.parse(localStorage.getItem('playback_positions') || '{}');
      pos[movieId] = { time: Math.round(currentTime), timestamp: Date.now(), title: { name: movieTitle, poster: '', id: movieId } };
      localStorage.setItem('playback_positions', JSON.stringify(pos));
    } catch(e) {}
  }

  // ========== Focus ==========
  function clearFocus() {
    for (var r = 0; r < navRows.length; r++) {
      for (var c = 0; c < navRows[r].length; c++) {
        if (navRows[r][c]) navRows[r][c].classList.remove('focused');
      }
    }
    scrubberFocused = false;
    var tw = document.getElementById('timeline-wrap');
    if (tw) tw.classList.remove('focused');
  }

  function highlightFocused() {
    clearFocus();
    var el = navRows[navRow] && navRows[navRow][navCol];
    if (el) {
      el.classList.add('focused');
      if (navRow === 2) scrubberFocused = true;
    }
  }

  // ========== Controls ==========
  function setupControls() {
    bindClick('btn-back', function() { goBack(); });
    bindClick('btn-start', function() { $video.currentTime = 0; showOsd(); });
    bindClick('btn-rew', function() { seek(-10); });
    bindClick('btn-play', function() { togglePlay(); });
    bindClick('btn-fwd', function() { seek(10); });
    bindClick('btn-end', function() { if (duration > 0) $video.currentTime = Math.max(0, duration - 10); showOsd(); });
    bindClick('btn-cc', function() { openPopup('cc'); });
    bindClick('btn-audio', function() { openPopup('audio'); });
    bindClick('btn-speed', function() { openPopup('speed'); });
    bindClick('btn-settings', function() { openPopup('settings'); });

    // Timeline click
    var tw = document.getElementById('timeline-wrap');
    if (tw) {
      tw.addEventListener('click', function(e) {
        if (!duration) return;
        var rect = tw.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        $video.currentTime = pct * duration;
        showOsd();
      });
    }

    // Keyboard
    document.addEventListener('keydown', function(e) {
      if (popupOpen) { handlePopupKeys(e); return; }
      handlePlayerKeys(e);
    });
  }

  function bindClick(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ========== Player keys ==========
  function handlePlayerKeys(e) {
    var code = e.keyCode;

    // Back — always handle first
    if (code === 10009) {
      if (popupOpen) { closePopup(); }
      else if (scrubberFocused) { scrubberFocused = false; highlightFocused(); showOsd(); }
      else if (osdVisible) { hideOsd(); }
      else { goBack(); }
      e.preventDefault();
      return;
    }

    // Show OSD on any other key
    showOsd();

    // If scrubber is focused, LEFT/RIGHT move the preview position
    if (scrubberFocused && (code === 37 || code === 39 || code === 13)) {
      if (code === 37) { // Left — move scrubber back
        scrubberPos = Math.max(0, scrubberPos - 2);
        updateScrubberPreview();
      } else if (code === 39) { // Right — move scrubber forward
        scrubberPos = Math.min(100, scrubberPos + 2);
        updateScrubberPreview();
      } else if (code === 13) { // Enter — commit scrubber position
        if (duration > 0) $video.currentTime = (scrubberPos / 100) * duration;
        scrubberFocused = false;
        highlightFocused();
      }
      e.preventDefault();
      return;
    }

    switch (code) {
      case 37: // Left
        if (navCol > 0) {
          navCol--;
          highlightFocused();
        }
        e.preventDefault();
        break;
      case 39: // Right
        if (navCol < navRows[navRow].length - 1) {
          navCol++;
          highlightFocused();
        }
        e.preventDefault();
        break;
      case 38: // Up
        if (navRow > 0) {
          navRow--;
          if (navCol >= navRows[navRow].length) navCol = navRows[navRow].length - 1;
          highlightFocused();
        }
        e.preventDefault();
        break;
      case 40: // Down
        if (navRow < navRows.length - 1) {
          navRow++;
          if (navCol >= navRows[navRow].length) navCol = navRows[navRow].length - 1;
          highlightFocused();
        }
        e.preventDefault();
        break;
      case 13: // Enter
        var el = navRows[navRow] && navRows[navRow][navCol];
        if (el) el.click();
        e.preventDefault();
        break;
    }
  }

  // ========== Actions ==========
  function togglePlay() {
    if ($video.paused) { $video.play(); isPlaying = true; }
    else { $video.pause(); isPlaying = false; }
    updatePlayBtn();
    showOsd();
  }

  function seek(sec) {
    if (!$video || !duration) return;
    $video.currentTime = Math.max(0, Math.min($video.currentTime + sec, duration));
    showOsd();
  }

  function goBack() {
    saveProgress();
    if ($video) { $video.pause(); $video.src = ''; }
    if (window.history.length > 1) window.history.back();
    else window.location.href = (localStorage.getItem(SERVER_KEY) || '') + '/tv/';
  }

  // ========== Popup ==========
  function openPopup(type) {
    popupOpen = true;
    popupFocus = 0;
    popupItems = [];
    popupReturnRow = navRow;
    popupReturnCol = navCol;
    if (osdTimer) clearTimeout(osdTimer);

    $popup.classList.remove('hidden');

    if (type === 'cc') renderCcPopup();
    else if (type === 'audio') renderAudioPopup();
    else if (type === 'speed') renderSpeedPopup();
    else if (type === 'settings') renderSettingsPopup();
  }

  function closePopup() {
    popupOpen = false;
    $popup.classList.add('hidden');
    popupItems = [];
    navRow = popupReturnRow;
    navCol = popupReturnCol;
    highlightFocused();
    resetOsdTimer();
  }

  function renderPopupItem(text, isActive) {
    var cls = 'popup-item';
    if (isActive) cls += ' active';
    return '<div class="' + cls + '"><span>' + esc(text) + '</span>' +
      (isActive ? '<span class="check">✓</span>' : '') + '</div>';
  }

  function renderCcPopup() {
    $popupHeader.textContent = 'Субтитры';
    var html = '';
    html += renderPopupItem('Выключены', true);
    $popupList.innerHTML = html;
    bindPopupClick(function() { closePopup(); });
  }

  function renderAudioPopup() {
    $popupHeader.textContent = 'Аудио';
    var html = '';
    html += renderPopupItem('Основная дорожка', true);
    $popupList.innerHTML = html;
    bindPopupClick(function() { closePopup(); });
  }

  function renderSpeedPopup() {
    $popupHeader.textContent = 'Скорость';
    var speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    var html = '';
    var currentSpeed = $video ? $video.playbackRate : 1;
    speeds.forEach(function(s) {
      html += renderPopupItem(s + 'x', Math.abs(currentSpeed - s) < 0.01);
    });
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      if ($video) $video.playbackRate = speeds[idx];
      closePopup();
    });
  }

  function renderSettingsPopup() {
    $popupHeader.textContent = 'Настройки';
    var html = '';
    html += renderPopupItem('Информация', false);
    html += renderPopupItem('Скорость воспроизведения', false);
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      if (idx === 0) showInfoPopup();
      else if (idx === 1) { closePopup(); openPopup('speed'); }
      else closePopup();
    });
  }

  function showInfoPopup() {
    $popupHeader.textContent = 'Информация';
    var html = '';
    html += '<div class="popup-item"><span>Название</span><span style="color:rgba(255,255,255,0.5)">' + esc(movieTitle) + '</span></div>';
    html += '<div class="popup-item"><span>Позиция</span><span style="color:rgba(255,255,255,0.5)">' + fmt(currentTime) + ' / ' + fmt(duration) + '</span></div>';
    html += '<div class="popup-item"><span>Скорость</span><span style="color:rgba(255,255,255,0.5)">' + ($video ? $video.playbackRate : 1) + 'x</span></div>';
    $popupList.innerHTML = html;
    bindPopupClick(function() { closePopup(); });
  }

  function bindPopupClick(handler) {
    var items = $popupList.querySelectorAll('.popup-item');
    popupItems = [];
    for (var i = 0; i < items.length; i++) popupItems.push(items[i]);
    popupItems.forEach(function(el, idx) {
      el.addEventListener('click', function() { handler(idx); });
    });
    if (popupItems.length > 0) popupItems[0].classList.add('focused');
  }

  function handlePopupKeys(e) {
    var code = e.keyCode;
    switch (code) {
      case 38: // Up
        if (popupFocus > 0) {
          popupItems[popupFocus].classList.remove('focused');
          popupFocus--;
          popupItems[popupFocus].classList.add('focused');
          popupItems[popupFocus].scrollIntoView(false);
        }
        e.preventDefault();
        break;
      case 40: // Down
        if (popupFocus < popupItems.length - 1) {
          popupItems[popupFocus].classList.remove('focused');
          popupFocus++;
          popupItems[popupFocus].classList.add('focused');
          popupItems[popupFocus].scrollIntoView(false);
        }
        e.preventDefault();
        break;
      case 13: // Enter
        if (popupItems[popupFocus]) popupItems[popupFocus].click();
        e.preventDefault();
        break;
      case 10009: // Back
        closePopup();
        e.preventDefault();
        break;
    }
  }

  // ========== API ==========
  function apiFetch(path, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + path, true);
    xhr.timeout = 10000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() { if (xhr.status === 200) cb(null, xhr.responseText); else cb(new Error('HTTP ' + xhr.status), null); };
    xhr.onerror = function() { cb(new Error('Network'), null); };
    xhr.ontimeout = function() { cb(new Error('Timeout'), null); };
    xhr.send();
  }

  // ========== Utils ==========
  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
  function fmt(s) {
    if (!s || !isFinite(s)) return '0:00';
    var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60);
    function p(n) { return n < 10 ? '0'+n : ''+n; }
    return h > 0 ? h+':'+p(m)+':'+p(sec) : m+':'+p(sec);
  }
})();
