// Lumiere TV Player v2 — Netflix-style UX (Chrome 56 compatible)
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
  var movieType = 'movie';
  var playbackSpeed = 1;

  // Tracks
  var audioTracks = [];
  var subtitleTracks = [];
  var currentAudio = 0;
  var currentSubtitle = -1;
  var subtitleCues = [];

  // Navigation
  var navRow = 0; // 0=transport, 1=actions
  var navCol = 2; // index in current row (play=2 in transport)
  var popupOpen = false;
  var popupFocus = 0;
  var popupItems = [];

  // Netflix seek
  var seekTarget = 0;
  var seekAccum = 0;
  var seekTimer = null;
  var isSeeking = false;

  // Next episode
  var nextEpShown = false;
  var nextEpTimer = null;
  var nextEpCountdown = 30;

  // DOM
  var $video, $osdTop, $osdBottom, $osdTitle, $osdBadges;
  var $centerPlay, $timeCurrent, $timeTotal;
  var $fill, $bufferFill, $thumb, $popup, $popupHeader, $popupList;
  var $nextEpPopup, $nextEpCountdown, $subtitleOverlay;

  // Transport buttons (row 0)
  var transportBtns = [];
  // Action buttons (row 1)
  var actionBtns = [];
  // All buttons flat
  var allBtns = [];

  // ========== Init ==========
  window.addEventListener('DOMContentLoaded', function() {
    $video = document.getElementById('video');
    $osdTop = document.getElementById('osd-top');
    $osdBottom = document.getElementById('osd-bottom');
    $osdTitle = document.getElementById('osd-title');
    $osdBadges = document.getElementById('osd-badges');
    $centerPlay = document.getElementById('center-play');
    $timeCurrent = document.getElementById('time-current');
    $timeTotal = document.getElementById('time-total');
    $fill = document.getElementById('timeline-fill');
    $bufferFill = document.getElementById('timeline-buffer');
    $thumb = document.getElementById('timeline-thumb');
    $popup = document.getElementById('popup');
    $popupHeader = document.getElementById('popup-header');
    $popupList = document.getElementById('popup-list');
    $nextEpPopup = document.getElementById('next-ep-popup');
    $nextEpCountdownEl = document.getElementById('next-ep-countdown');
    $subtitleOverlay = document.getElementById('subtitle-overlay');

    var server = localStorage.getItem(SERVER_KEY);
    if (server) API = server;

    // Parse params
    var params = parseParams();
    movieTitle = params.title || '';
    movieId = parseInt(params.id) || 0;
    movieType = params.type || 'movie';
    var url = params.url || '';

    $osdTitle.textContent = movieTitle;

    // Build button arrays
    transportBtns = [
      document.getElementById('btn-prev'),
      document.getElementById('btn-rew'),
      document.getElementById('btn-play'),
      document.getElementById('btn-fwd'),
      document.getElementById('btn-next')
    ];
    actionBtns = [
      document.getElementById('btn-cc'),
      document.getElementById('btn-audio'),
      document.getElementById('btn-quality'),
      document.getElementById('btn-speed'),
      document.getElementById('btn-episodes'),
      document.getElementById('btn-settings')
    ];
    allBtns = transportBtns.concat(actionBtns);

    // Hide prev/next for movies
    if (movieType !== 'tv') {
      document.getElementById('btn-prev').style.display = 'none';
      document.getElementById('btn-next').style.display = 'none';
    }

    // Badges
    renderBadges(params);

    if (url) {
      startPlayback(url);
      loadTrackInfo(url);
    }

    setupControls();
    showOsd();
  });

  var $nextEpCountdownEl;

  function parseParams() {
    var search = window.location.search.substring(1);
    var p = {};
    search.split('&').forEach(function(pair) {
      var parts = pair.split('=');
      if (parts.length === 2) p[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
    return p;
  }

  function renderBadges(params) {
    var badges = [];
    var url = params.url || '';
    if (url.indexOf('4k') >= 0 || url.indexOf('2160') >= 0) badges.push({ text: '4K', cls: 'badge-4k' });
    if (url.indexOf('hdr') >= 0) badges.push({ text: 'HDR10', cls: 'badge-hdr' });
    if (url.indexOf('hevc') >= 0 || url.indexOf('h265') >= 0) badges.push({ text: 'HEVC', cls: '' });
    // Default badges
    if (badges.length === 0) {
      badges.push({ text: 'HD', cls: '' });
    }
    var html = '';
    badges.forEach(function(b) {
      html += '<span class="badge ' + b.cls + '">' + b.text + '</span>';
    });
    $osdBadges.innerHTML = html;
  }

  // ========== Playback ==========
  function startPlayback(url) {
    $video.style.display = 'block';
    $video.src = url;
    $video.play().then(function() { isPlaying = true; updatePlayBtn(); }).catch(function() {});

    $video.ontimeupdate = function() {
      currentTime = $video.currentTime;
      if ($video.duration && isFinite($video.duration)) duration = $video.duration;
      updateTimeline();
      updateSubtitles();
      checkNextEpisode();
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

  // ========== Track info ==========
  function loadTrackInfo(url) {
    var linkMatch = url.match(/link=([^&]+)/);
    var indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    var link = decodeURIComponent(linkMatch[1]);
    var index = indexMatch ? indexMatch[1] : '0';

    apiFetch('/api/torrents/tracks?link=' + encodeURIComponent(link) + '&index=' + index, function(err, resp) {
      if (err || !resp) return;
      var data = null;
      try { data = JSON.parse(resp); } catch(e) { return; }
      if (!data) return;
      if (data.audioTracks && data.audioTracks.length > 0) audioTracks = data.audioTracks;
      if (data.subtitleTracks && data.subtitleTracks.length > 0) {
        subtitleTracks = data.subtitleTracks;
        subtitleTracks.forEach(function(st) {
          st.url = '/api/torrents/subtitle-file?link=' + encodeURIComponent(link) + '&index=' + st.id;
        });
      }
    });
  }

  // ========== Subtitles ==========
  function loadSubtitleVtt(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + url, true);
    xhr.timeout = 10000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        subtitleCues = parseVtt(xhr.responseText);
      }
    };
    xhr.send();
  }

  function parseVtt(text) {
    var cues = [];
    var blocks = text.replace(/\r\n/g, '\n').split('\n\n');
    for (var b = 0; b < blocks.length; b++) {
      var lines = blocks[b].split('\n');
      for (var l = 0; l < lines.length; l++) {
        if (lines[l].indexOf('-->') > 0) {
          var parts = lines[l].split('-->');
          var start = parseVttTime(parts[0].trim());
          var end = parseVttTime(parts[1].trim());
          var txt = [];
          for (var t = l + 1; t < lines.length; t++) {
            if (lines[t].trim()) txt.push(lines[t].trim());
          }
          if (txt.length > 0) cues.push({ start: start, end: end, text: txt.join('\n') });
          break;
        }
      }
    }
    return cues;
  }

  function parseVttTime(s) {
    var p = s.split(':');
    if (p.length === 3) {
      var sp = p[2].split('.');
      return parseInt(p[0]) * 3600 + parseInt(p[1]) * 60 + parseInt(sp[0]) + (sp[1] ? parseInt(sp[1]) / 1000 : 0);
    } else if (p.length === 2) {
      var sp2 = p[1].split('.');
      return parseInt(p[0]) * 60 + parseInt(sp2[0]) + (sp2[1] ? parseInt(sp2[1]) / 1000 : 0);
    }
    return 0;
  }

  function updateSubtitles() {
    if (subtitleCues.length === 0 || currentSubtitle < 0) {
      $subtitleOverlay.innerHTML = '';
      return;
    }
    for (var i = 0; i < subtitleCues.length; i++) {
      if (currentTime >= subtitleCues[i].start && currentTime < subtitleCues[i].end) {
        $subtitleOverlay.innerHTML = '<span class="sub-text">' + esc(subtitleCues[i].text) + '</span>';
        return;
      }
    }
    $subtitleOverlay.innerHTML = '';
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

  // ========== OSD ==========
  function showOsd() {
    osdVisible = true;
    document.body.classList.remove('osd-hide');
    resetOsdTimer();
  }

  function hideOsd() {
    if (popupOpen) return;
    osdVisible = false;
    document.body.classList.add('osd-hide');
  }

  function resetOsdTimer() {
    if (osdTimer) clearTimeout(osdTimer);
    if (!isPlaying || popupOpen) return;
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

  // ========== Controls ==========
  function setupControls() {
    // Transport buttons
    bindClick('btn-prev', function() { /* prev episode */ });
    bindClick('btn-rew', function() { seekStep(-10); });
    bindClick('btn-play', function() { togglePlay(); });
    bindClick('btn-fwd', function() { seekStep(10); });
    bindClick('btn-next', function() { /* next episode */ });

    // Action buttons
    bindClick('btn-back', function() { goBack(); });
    bindClick('btn-cc', function() { openPopup('cc'); });
    bindClick('btn-audio', function() { openPopup('audio'); });
    bindClick('btn-quality', function() { openPopup('quality'); });
    bindClick('btn-speed', function() { openPopup('speed'); });
    bindClick('btn-episodes', function() { openPopup('episodes'); });
    bindClick('btn-settings', function() { openPopup('settings'); });

    // Timeline click
    var tw = document.getElementById('timeline-wrap');
    if (tw) {
      tw.addEventListener('click', function(e) {
        var rect = tw.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        $video.currentTime = pct * duration;
        showOsd();
      });
    }

    // Next episode buttons
    bindClick('btn-next-ep-watch', function() { /* play next */ });
    bindClick('btn-next-ep-cancel', function() { closeNextEp(); });

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

    // Back must be handled BEFORE showOsd, otherwise it always just hides OSD
    if (code === 10009) {
      if (popupOpen) { closePopup(); }
      else if (osdVisible) { hideOsd(); }
      else { goBack(); }
      e.preventDefault();
      return;
    }

    showOsd();

    switch (code) {
      case 37: // Left
        if (!osdVisible) { seekStep(-10); }
        else { moveFocus(-1, 0); }
        e.preventDefault();
        break;
      case 39: // Right
        if (!osdVisible) { seekStep(10); }
        else { moveFocus(1, 0); }
        e.preventDefault();
        break;
      case 38: // Up
        if (!osdVisible) { showOsd(); }
        else { moveFocus(0, -1); }
        e.preventDefault();
        break;
      case 40: // Down
        if (!osdVisible) { showOsd(); }
        else { moveFocus(0, 1); }
        e.preventDefault();
        break;
      case 13: // Enter
        if (!osdVisible) { showOsd(); }
        else { clickFocused(); }
        e.preventDefault();
        break;
    }
  }

  function moveFocus(dx, dy) {
    clearFocus();

    if (dy !== 0) {
      // Switch between transport (0) and actions (1) rows
      navRow = navRow === 0 ? 1 : 0;
      // Adjust column to fit new row
      var row = navRow === 0 ? transportBtns : actionBtns;
      if (navCol >= row.length) navCol = row.length - 1;
    }

    if (dx !== 0) {
      var row = navRow === 0 ? transportBtns : actionBtns;
      navCol = navCol + dx;
      if (navCol < 0) navCol = 0;
      if (navCol >= row.length) navCol = row.length - 1;
    }

    var btn = (navRow === 0 ? transportBtns : actionBtns)[navCol];
    if (btn) btn.classList.add('focused');
    resetOsdTimer();
  }

  function clearFocus() {
    allBtns.forEach(function(b) { if (b) b.classList.remove('focused'); });
  }

  function clickFocused() {
    var btn = (navRow === 0 ? transportBtns : actionBtns)[navCol];
    if (btn) btn.click();
  }

  // ========== Netflix-style seek ==========
  function seekStep(seconds) {
    var pos = $video.currentTime || currentTime;
    if (!duration || duration <= 0 || !isFinite(duration)) {
      // Duration unknown, do simple seek
      $video.currentTime = Math.max(0, pos + seconds);
      return;
    }
    seekAccum += seconds;
    seekTarget = Math.max(0, Math.min(pos + seekAccum, duration));

    // Show preview on timeline
    var pct = duration > 0 ? (seekTarget / duration * 100) : 0;
    if ($fill) $fill.style.width = pct + '%';
    if ($thumb) $thumb.style.left = pct + '%';
    if ($timeCurrent) $timeCurrent.textContent = fmt(seekTarget);

    isSeeking = true;

    // Reset timer
    if (seekTimer) clearTimeout(seekTimer);
    seekTimer = setTimeout(function() {
      // Commit seek
      $video.currentTime = seekTarget;
      isSeeking = false;
      seekAccum = 0;
    }, 1000);
  }

  // ========== Play/Pause ==========
  function togglePlay() {
    if (isSeeking) {
      // Commit pending seek first
      if (seekTimer) clearTimeout(seekTimer);
      $video.currentTime = seekTarget;
      isSeeking = false;
      seekAccum = 0;
    }

    if ($video.paused) { $video.play(); isPlaying = true; }
    else { $video.pause(); isPlaying = false; }
    updatePlayBtn();
    showOsd();
  }

  function goBack() {
    saveProgress();
    $video.pause();
    $video.src = '';
    // Return to previous page (movie detail or home)
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = (localStorage.getItem(SERVER_KEY) || '') + '/tv/';
    }
  }

  // ========== Popup Menu ==========
  function openPopup(type) {
    popupOpen = true;
    popupFocus = 0;
    popupItems = [];
    if (osdTimer) clearTimeout(osdTimer);

    $popup.classList.remove('hidden');

    if (type === 'cc') renderCcPopup();
    else if (type === 'audio') renderAudioPopup();
    else if (type === 'quality') renderQualityPopup();
    else if (type === 'speed') renderSpeedPopup();
    else if (type === 'episodes') renderEpisodesPopup();
    else if (type === 'settings') renderSettingsPopup();
  }

  function closePopup() {
    popupOpen = false;
    $popup.classList.add('hidden');
    popupItems = [];
    resetOsdTimer();
  }

  function renderPopupItem(text, isActive, isHeader) {
    var cls = 'popup-item';
    if (isActive) cls += ' active';
    if (isHeader) cls += ' section-header';
    return '<div class="' + cls + '"><span>' + esc(text) + '</span>' +
      (isActive ? '<span class="check">✓</span>' : '') + '</div>';
  }

  function renderCcPopup() {
    $popupHeader.textContent = 'Субтитры';
    var html = '';
    html += renderPopupItem('Выключены', currentSubtitle === -1);
    subtitleTracks.forEach(function(t, i) {
      html += renderPopupItem(t.name || t.lang || 'Дорожка ' + (i+1), currentSubtitle === i);
    });
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      if (idx === 0) { currentSubtitle = -1; subtitleCues = []; $subtitleOverlay.innerHTML = ''; }
      else { currentSubtitle = idx - 1; if (subtitleTracks[currentSubtitle]) loadSubtitleVtt(subtitleTracks[currentSubtitle].url); }
      closePopup();
    });
  }

  function renderAudioPopup() {
    $popupHeader.textContent = 'Аудио';
    var html = '';
    if (audioTracks.length === 0) {
      html = '<div class="popup-item" style="color:rgba(255,255,255,0.3)">Нет дорожек</div>';
    } else {
      audioTracks.forEach(function(t, i) {
        html += renderPopupItem(t.name || 'Дорожка ' + (i+1), currentAudio === i);
      });
    }
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      currentAudio = idx;
      // Note: Audio track switching for HLS streams requires HLS.js
      // For now, just store the selection
      closePopup();
    });
  }

  function renderQualityPopup() {
    $popupHeader.textContent = 'Качество';
    var html = '';
    html += renderPopupItem('Auto (HLS)', true);
    $popupList.innerHTML = html;
    bindPopupClick(function() { closePopup(); });
  }

  function renderSpeedPopup() {
    $popupHeader.textContent = 'Скорость';
    var speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    var html = '';
    speeds.forEach(function(s) {
      html += renderPopupItem(s + 'x', playbackSpeed === s);
    });
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      playbackSpeed = speeds[idx];
      $video.playbackRate = playbackSpeed;
      closePopup();
    });
  }

  function renderEpisodesPopup() {
    $popupHeader.textContent = 'Эпизоды';
    $popupList.innerHTML = '<div class="popup-item" style="color:rgba(255,255,255,0.3)">Загрузка...</div>';
    // Fetch episode list from API
    apiFetch('/api/tv/' + movieId, function(err, data) {
      if (err || !data) {
        $popupList.innerHTML = '<div class="popup-item" style="color:rgba(255,255,255,0.3)">Нет данных</div>';
        return;
      }
      // For now, show basic info
      $popupList.innerHTML = '<div class="popup-item" style="color:rgba(255,255,255,0.5)">Список эпизодов будет доступен в следующем обновлении</div>';
    });
    bindPopupClick(function() { closePopup(); });
  }

  function renderSettingsPopup() {
    $popupHeader.textContent = 'Настройки';
    var html = '';
    html += renderPopupItem('Видео', false, true);
    html += renderPopupItem('Звук', false);
    html += renderPopupItem('Субтитры', false);
    html += renderPopupItem('Информация', false);
    html += renderPopupItem('Таймер сна', false);
    html += renderPopupItem('Соотношение сторон', false);
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      if (idx === 3) { // Info
        showInfoPopup();
      } else {
        closePopup();
      }
    });
  }

  function showInfoPopup() {
    $popupHeader.textContent = 'Информация';
    var html = '';
    html += '<div class="popup-item"><span>Название</span><span style="color:rgba(255,255,255,0.5)">' + esc(movieTitle) + '</span></div>';
    html += '<div class="popup-item"><span>Тип</span><span style="color:rgba(255,255,255,0.5)">' + (movieType === 'tv' ? 'Сериал' : 'Фильм') + '</span></div>';
    html += '<div class="popup-item"><span>Позиция</span><span style="color:rgba(255,255,255,0.5)">' + fmt(currentTime) + ' / ' + fmt(duration) + '</span></div>';
    html += '<div class="popup-item"><span>Скорость</span><span style="color:rgba(255,255,255,0.5)">' + playbackSpeed + 'x</span></div>';
    $popupList.innerHTML = html;
    bindPopupClick(function() { closePopup(); });
  }

  function bindPopupClick(handler) {
    var items = $popupList.querySelectorAll('.popup-item:not(.section-header)');
    popupItems = [];
    for (var i = 0; i < items.length; i++) popupItems.push(items[i]);

    popupItems.forEach(function(el, idx) {
      el.addEventListener('click', function() { handler(idx); });
    });

    // Focus first item
    if (popupItems.length > 0) {
      popupItems[0].classList.add('focused');
    }
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

  // ========== Next Episode ==========
  function checkNextEpisode() {
    if (movieType !== 'tv' || !duration || duration < 60) return;
    var remaining = duration - currentTime;
    if (remaining <= 30 && remaining > 0 && !nextEpShown) {
      showNextEp();
    }
  }

  function showNextEp() {
    nextEpShown = true;
    nextEpCountdown = 30;
    $nextEpPopup.classList.remove('hidden');
    $nextEpCountdownEl.textContent = nextEpCountdown;

    nextEpTimer = setInterval(function() {
      nextEpCountdown--;
      if ($nextEpCountdownEl) $nextEpCountdownEl.textContent = nextEpCountdown;
      if (nextEpCountdown <= 0) {
        clearInterval(nextEpTimer);
        // Auto-play next (placeholder)
        closeNextEp();
      }
    }, 1000);
  }

  function closeNextEp() {
    nextEpShown = true; // prevent re-showing
    $nextEpPopup.classList.add('hidden');
    if (nextEpTimer) clearInterval(nextEpTimer);
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
