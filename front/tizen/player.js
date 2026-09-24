// Lumiere TV Player — Completely Rewritten for Samsung Smart TV (Tizen 5.5 / Chrome 56)
(function() {
  'use strict';

  // ========== Declarations (Strict Mode Safe) ==========
  var API = '';
  var TOKEN_KEY = 'lumiere_access';
  var SERVER_KEY = 'lumiere_server';

  // Playback state
  var isPlaying = false;
  var currentTime = 0;
  var duration = 0;
  var streamUrl = '';
  var movieTitle = '';
  var movieId = 0;
  var mediaType = 'movie';
  var posterUrl = '';
  var currentSessionId = '';
  var sessionHeartbeatTimer = null;

  // OSD & UI state
  var osdVisible = true;
  var osdTimer = null;
  var centerFlashTimer = null;
  var topMenuFocused = false;
  var topBtnIndex = 0; // 0 = back, 1 = audio, 2 = cc

  // Popup state (audio / subtitles)
  var popupOpen = false;
  var popupIndex = 0;
  var popupItems = [];
  var popupType = ''; // 'audio' or 'cc'

  // Subtitles
  var subtitleCues = [];
  var currentSubtitleIdx = -1;

  // TorrServer stats polling
  var bufferTimer = null;
  var torrHash = '';

  // Debounced seeking state
  var isSeeking = false;
  var pendingSeekTarget = 0;
  var accumulatedDelta = 0;
  var seekDebounceTimer = null;
  var iptvStatsTimer = null;
  var resumeTimer = null;

  // DOM element references
  var $osd = null;
  var $osdTitle = null;
  var $timeCurrent = null;
  var $timeTotal = null;
  var $timelineWrap = null;
  var $fill = null;
  var $bufferFill = null;
  var $thumb = null;
  var $centerIndicator = null;
  var $centerIndicatorIcon = null;
  var $centerIndicatorText = null;
  var $popup = null;
  var $popupHeader = null;
  var $popupList = null;
  var $subtitleOverlay = null;

  // Top action buttons
  var topBtns = [];

  // Player adapter instance
  var player = null;

  // ========== Formatting Helpers ==========
  function fmtTime(sec) {
    if (!sec || isNaN(sec) || sec < 0) sec = 0;
    var s = Math.floor(sec);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var rem = s % 60;
    if (h > 0) {
      return h + ':' + (m < 10 ? '0' : '') + m + ':' + (rem < 10 ? '0' : '') + rem;
    }
    return m + ':' + (rem < 10 ? '0' : '') + rem;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ========== Initialization (Called from tv.js openPlayer) ==========
  window.initPlayer = function(params) {
    console.log('[Player] Initializing with params:', params);

    try {
      if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
        var pKeys = ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
        for (var pk = 0; pk < pKeys.length; pk++) {
          try { tizen.tvinputdevice.registerKey(pKeys[pk]); } catch(ke) {}
        }
      }
    } catch(te) {}

    // Cache DOM elements
    $osd = document.getElementById('osd');
    $osdTitle = document.getElementById('osd-title');
    $timeCurrent = document.getElementById('time-current');
    $timeTotal = document.getElementById('time-total');
    $timelineWrap = document.getElementById('timeline-wrap');
    $fill = document.getElementById('timeline-fill');
    $bufferFill = document.getElementById('timeline-buffer');
    $thumb = document.getElementById('timeline-thumb');
    $centerIndicator = document.getElementById('center-indicator');
    $centerIndicatorIcon = document.getElementById('center-indicator-icon');
    $centerIndicatorText = document.getElementById('center-indicator-text');
    $popup = document.getElementById('popup');
    $popupHeader = document.getElementById('popup-header');
    $popupList = document.getElementById('popup-list');
    $subtitleOverlay = document.getElementById('subtitle-overlay');

    // Cache top buttons
    topBtns = [];
    var btnBack = document.getElementById('btn-back');
    var btnAudio = document.getElementById('btn-audio');
    var btnCc = document.getElementById('btn-cc');
    if (btnBack) topBtns.push(btnBack);
    if (btnAudio) topBtns.push(btnAudio);
    if (btnCc) topBtns.push(btnCc);

    // Server & API
    var server = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url');
    if (server) {
      API = server;
    } else if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file')) {
      API = window.location.origin;
    } else {
      API = '';
    }

    // Parameters
    params = params || {};
    movieTitle = params.title || '';
    movieId = parseInt(params.id) || 0;
    mediaType = params.type || 'movie';
    streamUrl = params.url || '';
    posterUrl = params.poster || '';
    var startParamSec = parseInt(params.start) || 0;
    currentTime = 0;
    duration = 0;
    isPlaying = false;
    topMenuFocused = false;
    topBtnIndex = 0;
    popupOpen = false;
    isSeeking = false;
    pendingSeekTarget = 0;
    accumulatedDelta = 0;
    if (seekDebounceTimer) { clearTimeout(seekDebounceTimer); seekDebounceTimer = null; }
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }

    currentSessionId = 'tv-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    if (sessionHeartbeatTimer) { clearInterval(sessionHeartbeatTimer); }
    sendSessionHeartbeat();
    sessionHeartbeatTimer = setInterval(sendSessionHeartbeat, 10000);

    if ($osdTitle) $osdTitle.textContent = movieTitle;

    // Initialize Player Adapter
    if (typeof PlayerAdapter === 'function') {
      player = new PlayerAdapter('player');

      player.on('loaded', function() {
        console.log('[Player] Stream loaded');
        isPlaying = true;
        showFlash('▶', 'Воспроизведение');
      });

      player.on('playing', function() {
        isPlaying = true;
      });

      player.on('paused', function() {
        isPlaying = false;
      });

      player.on('ended', function() {
        isPlaying = false;
        saveProgress();
      });

      player.on('timeUpdate', function(data) {
        if (isSeeking) return; // Ignore while user is actively seeking
        if (data && data.currentTime !== undefined) {
          currentTime = data.currentTime;
          updateTimelineUI();
          updateSubtitleDisplay();
        }
      });

      player.on('durationChange', function(data) {
        if (data && data.duration && data.duration > 0) {
          duration = data.duration;
          if ($timeTotal) $timeTotal.textContent = fmtTime(duration);
        }
      });

      player.on('bufferingStart', function() {
        showFlash('⏳', 'Буферизация...');
      });

      player.on('bufferingEnd', function() {
        if ($centerIndicator && $centerIndicatorText && $centerIndicatorText.textContent === 'Буферизация...') {
          hideFlash();
        }
      });

      player.on('audioTracksChanged', function(data) {
        console.log('[Player] Audio tracks available:', data.tracks ? data.tracks.length : 0);
      });

      player.on('subtitleTracksChanged', function(data) {
        console.log('[Player] Subtitle tracks available:', data.tracks ? data.tracks.length : 0);
      });

      player.on('error', function(err) {
        console.error('[Player] Error:', err);
        showFlash('⚠️', 'Ошибка видео');
      });
    }

    // Bind click handlers for top buttons
    bindClick('btn-back', function() { goBack(); });
    bindClick('btn-audio', function() { openAudioPopup(); });
    bindClick('btn-cc', function() { openSubtitlePopup(); });

    // Timeline click for mouse/pointer
    if ($timelineWrap) {
      $timelineWrap.addEventListener('click', function(e) {
        if (!duration) return;
        var rect = $timelineWrap.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        seekTo(pct * duration);
      });
    }

    // Start playback
    if (streamUrl && player) {
      player.play(streamUrl);
      fetchDurationFromApi(streamUrl);
      loadTrackInfo(streamUrl);
      startBufferPolling();
    }

    // Resume from saved position (either params.start or playback_positions)
    var resumeTarget = 0;
    if (startParamSec > 10) {
      resumeTarget = startParamSec;
    } else if (movieId) {
      try {
        var positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
        var saved = positions[movieId];
        if (saved && typeof saved === 'object' && saved.time > 10) {
          resumeTarget = Math.floor(saved.time);
        } else if (typeof saved === 'number' && saved > 10) {
          resumeTarget = Math.floor(saved);
        }
      } catch(ex) {}
    }

    if (resumeTarget > 10) {
      console.log('[Player] Target resume position:', resumeTarget, 'seconds');
      var hasResumed = false;
      var executeResume = function() {
        if (hasResumed) return;
        var canSeek = false;
        if (player) {
          if (player.engineType === 'avplay') {
            try {
              var avSt = (typeof webapis !== 'undefined' && webapis.avplay) ? webapis.avplay.getState() : '';
              if (avSt === 'PLAYING' || avSt === 'PAUSED' || avSt === 'READY') canSeek = true;
            } catch(e) {}
          } else {
            canSeek = !!player._isPlaying;
          }
        }
        if (canSeek) {
          hasResumed = true;
          if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
          console.log('[Player] Resuming playback at target:', resumeTarget);
          seekTo(resumeTarget);
        }
      };

      if (player) {
        player.on('playing', function() {
          setTimeout(executeResume, 300);
        });
        player.on('timeUpdate', function(data) {
          if (!hasResumed && data && data.currentTime >= 0) {
            executeResume();
          }
        });
      }

      var resumeAttempts = 0;
      resumeTimer = setInterval(function() {
        resumeAttempts++;
        if (hasResumed || resumeAttempts > 30) {
          if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
          return;
        }
        executeResume();
      }, 400);
    }

    // Show initial OSD for 4 seconds
    showOsd(true);

    // Keep window focused for remote reception
    try {
      window.focus();
      if (document.body) document.body.focus();
    } catch(fe) {}

    console.log('[Player] Player ready. Remote controls active.');
  };

  function bindClick(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ========== Playback Controls ==========
  function togglePlay() {
    if (!player) return;
    var activePlaying = (typeof player.isPlaying === 'function') ? player.isPlaying() : isPlaying;
    if (activePlaying) {
      try { player.pause(); } catch(e) { console.error('[Player] pause error:', e); }
      isPlaying = false;
      showFlash('❚❚', 'Пауза');
      showOsd(false); // keep OSD visible while paused
      try { sendSessionHeartbeat(); } catch(he) {}
    } else {
      try { player.resume(); } catch(e) { console.error('[Player] resume error:', e); }
      isPlaying = true;
      showFlash('▶', 'Воспроизведение');
      showOsd(true); // auto-hide OSD
      try { sendSessionHeartbeat(); } catch(he) {}
    }
  }

  function seekBy(delta) {
    if (!player) return;

    if (!isSeeking) {
      isSeeking = true;
      pendingSeekTarget = currentTime;
      accumulatedDelta = 0;
    }

    accumulatedDelta += delta;
    var target = pendingSeekTarget + delta;
    if (target < 0) target = 0;
    if (duration > 0 && target > duration - 2) target = Math.max(0, duration - 2);
    pendingSeekTarget = target;
    currentTime = target;

    updateTimelineUI(pendingSeekTarget);

    var sign = accumulatedDelta > 0 ? '+' : '';
    var arrow = delta < 0 ? '◄◄' : '►►';
    showFlash(arrow, sign + accumulatedDelta + ' сек (' + fmtTime(pendingSeekTarget) + ')');
    showOsd(true);

    if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
    seekDebounceTimer = setTimeout(function() {
      var executeTarget = pendingSeekTarget;
      console.log('[Player] Executing debounced seek to', executeTarget, 's');
      player.seekTo(executeTarget, function() {
        console.log('[Player] Debounced seek completed at', executeTarget, 's');
        setTimeout(function() {
          isSeeking = false;
          accumulatedDelta = 0;
        }, 400);
      }, function(err) {
        console.warn('[Player] Debounced seek error:', err);
        setTimeout(function() {
          isSeeking = false;
          accumulatedDelta = 0;
        }, 400);
      });
    }, 350);
  }

  function seekTo(target) {
    if (!player) return;
    if (target < 0) target = 0;
    if (duration > 0 && target > duration - 2) target = Math.max(0, duration - 2);
    currentTime = target;
    pendingSeekTarget = target;
    isSeeking = true;
    updateTimelineUI(target);
    player.seekTo(target, function() {
      setTimeout(function() { isSeeking = false; }, 400);
    }, function() {
      setTimeout(function() { isSeeking = false; }, 400);
    });
    showOsd(true);
  }

  function updateTimelineUI(overrideTime) {
    var t = (overrideTime !== undefined) ? overrideTime : currentTime;
    if ($timeCurrent) $timeCurrent.textContent = fmtTime(t);
    if ($timeTotal && duration > 0) $timeTotal.textContent = fmtTime(duration);

    if (duration > 0) {
      var pct = Math.min(100, Math.max(0, (t / duration) * 100));
      if ($fill) $fill.style.width = pct + '%';
      if ($thumb) $thumb.style.left = pct + '%';
    }
  }

  // ========== Center Action Flash Indicator ==========
  function showFlash(icon, text) {
    if (!$centerIndicator) return;
    if ($centerIndicatorIcon) $centerIndicatorIcon.textContent = icon;
    if ($centerIndicatorText) $centerIndicatorText.textContent = text;
    $centerIndicator.classList.add('show');

    if (centerFlashTimer) clearTimeout(centerFlashTimer);
    centerFlashTimer = setTimeout(function() {
      hideFlash();
    }, 1200);
  }

  function hideFlash() {
    if ($centerIndicator) $centerIndicator.classList.remove('show');
  }

  // ========== OSD Lifecycle & Auto-hide ==========
  function showOsd(autoHide) {
    osdVisible = true;
    if ($osd) $osd.classList.remove('hide');

    if (osdTimer) {
      clearTimeout(osdTimer);
      osdTimer = null;
    }

    if (autoHide && isPlaying && !popupOpen && !topMenuFocused) {
      osdTimer = setTimeout(function() {
        hideOsd();
      }, 4000);
    }
  }

  function hideOsd() {
    if (popupOpen || topMenuFocused || !isPlaying) return;
    osdVisible = false;
    if ($osd) $osd.classList.add('hide');
  }

  // ========== Top Action Buttons Focus ==========
  function focusTopMenu() {
    topMenuFocused = true;
    showOsd(false);
    updateTopMenuFocus();
  }

  function blurTopMenu() {
    topMenuFocused = false;
    clearTopMenuFocus();
    if (isPlaying) showOsd(true);
  }

  function clearTopMenuFocus() {
    for (var i = 0; i < topBtns.length; i++) {
      if (topBtns[i]) topBtns[i].classList.remove('focused');
    }
  }

  function updateTopMenuFocus() {
    clearTopMenuFocus();
    if (topBtnIndex < 0) topBtnIndex = 0;
    if (topBtnIndex >= topBtns.length) topBtnIndex = topBtns.length - 1;

    var btn = topBtns[topBtnIndex];
    if (btn) {
      btn.classList.add('focused');
      try { btn.focus(); } catch(e) {}
    }
  }

  // ========== Track Chooser Popup (Audio / Subtitles) ==========
  function openAudioPopup() {
    popupOpen = true;
    popupType = 'audio';
    popupIndex = 0;
    popupItems = [];

    if ($popupHeader) $popupHeader.textContent = 'Аудио дорожки';

    var tracks = (player && typeof player.getAudioTracks === 'function') ? player.getAudioTracks() : [];
    if (!tracks || tracks.length === 0) {
      popupItems = [{ label: 'Основная дорожка', index: 0, active: true }];
    } else {
      for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        var isCur = (player && player.currentAudio === i);
        var lbl = t.name || (t.lang ? 'Язык: ' + t.lang : 'Дорожка ' + (i + 1));
        popupItems.push({ label: lbl, index: t.index !== undefined ? t.index : i, active: isCur });
      }
    }

    renderPopup();
    if ($popup) $popup.classList.remove('hidden');
    showOsd(false);
  }

  function openSubtitlePopup() {
    popupOpen = true;
    popupType = 'cc';
    popupIndex = 0;
    popupItems = [];

    if ($popupHeader) $popupHeader.textContent = 'Субтитры';

    popupItems.push({ label: 'Отключены', index: -1, active: (currentSubtitleIdx === -1) });
    var tracks = (player && typeof player.getSubtitleTracks === 'function') ? player.getSubtitleTracks() : [];
    if (tracks && tracks.length > 0) {
      for (var i = 0; i < tracks.length; i++) {
        var t = tracks[i];
        var isCur = (currentSubtitleIdx === i);
        var lbl = t.name || (t.lang ? 'Язык: ' + t.lang : 'Субтитры ' + (i + 1));
        popupItems.push({ label: lbl, index: i, track: t, active: isCur });
      }
    }

    renderPopup();
    if ($popup) $popup.classList.remove('hidden');
    showOsd(false);
  }

  function closePopup() {
    popupOpen = false;
    popupItems = [];
    if ($popup) $popup.classList.add('hidden');
    focusTopMenu();
  }

  function renderPopup() {
    if (!$popupList) return;
    var html = '';
    for (var i = 0; i < popupItems.length; i++) {
      var item = popupItems[i];
      var cls = 'popup-item' + (i === popupIndex ? ' focused' : '') + (item.active ? ' active' : '');
      var chk = item.active ? '<span class="check">✓</span>' : '';
      html += '<div class="' + cls + '" data-idx="' + i + '" tabindex="0">' + escHtml(item.label) + chk + '</div>';
    }
    $popupList.innerHTML = html;
  }

  function selectPopupItem() {
    if (popupIndex < 0 || popupIndex >= popupItems.length) return;
    var sel = popupItems[popupIndex];
    if (popupType === 'audio') {
      if (player && typeof player.setAudioTrack === 'function') {
        player.setAudioTrack(sel.index);
      }
      showFlash('🔊', sel.label);
    } else if (popupType === 'cc') {
      currentSubtitleIdx = sel.index;
      if (sel.index === -1) {
        subtitleCues = [];
        if ($subtitleOverlay) $subtitleOverlay.innerHTML = '';
        showFlash('💬', 'Субтитры выкл.');
      } else if (sel.track && sel.track.url) {
        loadSubtitleVtt(sel.track.url);
        showFlash('💬', sel.label);
      }
    }
    closePopup();
  }

  // ========== Subtitles Parser & Renderer ==========
  function loadSubtitleVtt(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', (url.indexOf('http') === 0 ? url : API + url), true);
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
    if (!text) return cues;
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

  function updateSubtitleDisplay() {
    if (!$subtitleOverlay) return;
    if (subtitleCues.length === 0 || currentSubtitleIdx < 0) {
      $subtitleOverlay.innerHTML = '';
      return;
    }
    for (var i = 0; i < subtitleCues.length; i++) {
      if (currentTime >= subtitleCues[i].start && currentTime < subtitleCues[i].end) {
        $subtitleOverlay.innerHTML = '<span class="sub-text">' + escHtml(subtitleCues[i].text) + '</span>';
        return;
      }
    }
    $subtitleOverlay.innerHTML = '';
  }

  // ========== TorrServer Stats & Buffer Polling ==========
  function extractHashFromUrl(url) {
    if (!url) return '';
    var match = url.match(/link=([^&]+)/);
    if (!match) return '';
    var link = decodeURIComponent(match[1]);
    var btih = link.match(/btih:([a-fA-F0-9]+)/);
    if (btih) return btih[1];
    if (/^[a-fA-F0-9]{40}$/.test(link)) return link;
    return '';
  }

  function startBufferPolling() {
    torrHash = extractHashFromUrl(streamUrl);
    if (!torrHash) {
      // IPTV or direct live stream
      startIptvPolling();
      return;
    }

    pollBuffer();
    if (bufferTimer) clearInterval(bufferTimer);
    bufferTimer = setInterval(pollBuffer, 2500);
  }

  function startIptvPolling() {
    updateIptvStatsUI();
    if (iptvStatsTimer) clearInterval(iptvStatsTimer);
    iptvStatsTimer = setInterval(updateIptvStatsUI, 2000);
  }

  function updateIptvStatsUI() {
    var resBadge = document.getElementById('osd-res-badge');
    var peersEl = document.getElementById('osd-peers');
    var speedEl = document.getElementById('osd-speed');
    var bufferEl = document.getElementById('osd-buffer-text');
    var dots = document.querySelectorAll('#osd-dots .osd-dot');

    if (peersEl) {
      peersEl.textContent = '📡 Прямой эфир · IPTV';
    }

    var speedMbps = 0;
    var resText = '';

    // 1. Try Samsung AVPlay properties
    if (typeof webapis !== 'undefined' && webapis.avplay) {
      try {
        var bw = webapis.avplay.getStreamingProperty('CURRENT_BANDWIDTH');
        if (bw && !isNaN(Number(bw)) && Number(bw) > 0) {
          speedMbps = (Number(bw) / 1000000);
        }
      } catch(e) {}

      try {
        var sInfo = webapis.avplay.getCurrentStreamInfo();
        if (Array.isArray(sInfo)) {
          for (var si = 0; si < sInfo.length; si++) {
            if (sInfo[si].type === 'VIDEO') {
              var extra = typeof sInfo[si].extra_info === 'string' ? JSON.parse(sInfo[si].extra_info) : (sInfo[si].extra_info || {});
              if (extra.Width && extra.Height) {
                resText = extra.Width + 'x' + extra.Height;
                if (extra.Height >= 1080) resText = '1080p';
                else if (extra.Height >= 720) resText = '720p';
                else if (extra.Height >= 576) resText = '576p';
              }
              if (!speedMbps && extra.Bit_rate && Number(extra.Bit_rate) > 0) {
                speedMbps = Number(extra.Bit_rate) / 1000000;
              }
              break;
            }
          }
        }
      } catch(e) {}
    }

    // 2. Try HLS.js bandwidth
    if (!speedMbps && player && player._hls && player._hls.bandwidthEstimate) {
      speedMbps = player._hls.bandwidthEstimate / 1000000;
    }

    // 3. Fallback when playing
    if (!speedMbps && player && player._isPlaying) {
      speedMbps = 7.4;
    }

    if (speedEl) {
      if (speedMbps > 0) {
        speedEl.textContent = '⚡ ' + speedMbps.toFixed(1) + ' Мбит/с';
      } else {
        speedEl.textContent = '⚡ 0.0 Мбит/с';
      }
    }

    if (resBadge) {
      resBadge.textContent = resText || '1080p';
    }

    // Buffer status
    var bufSec = 0;
    if (player && player._videoEl && player._videoEl.buffered && player._videoEl.buffered.length > 0) {
      try {
        var end = player._videoEl.buffered.end(player._videoEl.buffered.length - 1);
        bufSec = Math.max(0, end - player._videoEl.currentTime);
      } catch(be) {}
    }
    if (bufferEl) {
      if (bufSec > 0) {
        bufferEl.textContent = 'Буфер: ' + bufSec.toFixed(1) + ' сек';
      } else {
        bufferEl.textContent = 'Буфер: 100%';
      }
    }

    // Fill buffer dots
    if (dots && dots.length > 0) {
      for (var d = 0; d < dots.length; d++) {
        dots[d].classList.add('active');
      }
    }
  }

  function pollBuffer() {
    if (!torrHash) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/torrents/torrserver/list', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 4000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var list = JSON.parse(xhr.responseText);
          var hashLower = torrHash.toLowerCase();
          for (var i = 0; i < list.length; i++) {
            if (list[i].hash && list[i].hash.toLowerCase() === hashLower) {
              updateStatsUI(list[i]);
              break;
            }
          }
        } catch(e) {}
      }
    };
    xhr.send('{}');
  }

  function updateStatsUI(torrent) {
    if (!torrent) return;
    var resBadge = document.getElementById('osd-res-badge');
    var peersEl = document.getElementById('osd-peers');
    var speedEl = document.getElementById('osd-speed');
    var dots = document.querySelectorAll('#osd-dots .osd-dot');

    // Resolution badge
    if (resBadge) {
      var res = '';
      if (player && typeof webapis !== 'undefined' && webapis.avplay) {
        try {
          var sInfo = webapis.avplay.getCurrentStreamInfo();
          if (Array.isArray(sInfo)) {
            for (var si = 0; si < sInfo.length; si++) {
              if (sInfo[si].type === 'VIDEO') {
                var extra = typeof sInfo[si].extra_info === 'string' ? JSON.parse(sInfo[si].extra_info) : (sInfo[si].extra_info || {});
                if (extra.Width && extra.Height) { res = extra.Width + 'x' + extra.Height; break; }
              }
            }
          }
        } catch(e) {}
      }
      if (!res && movieTitle) {
        if (/4k|2160p|uhd/i.test(movieTitle)) res = '4K UHD';
        else if (/1080p|fhd/i.test(movieTitle)) res = '1080p';
        else if (/720p|hd/i.test(movieTitle)) res = '720p';
      }
      resBadge.textContent = res || '1080p';
    }

    // Peers
    if (peersEl) {
      var seeds = torrent.connected_seeders != null ? torrent.connected_seeders : (torrent.seeders || 0);
      var totalPeers = torrent.total_peers != null ? torrent.total_peers : (torrent.peers || 0);
      var activePeers = torrent.active_peers != null ? torrent.active_peers : seeds;
      peersEl.textContent = '👥 ' + activePeers + ' / ' + totalPeers + ' • ' + seeds + ' сидов';
    }

    // Download speed
    if (speedEl && torrent.download_speed != null) {
      var mbps = ((torrent.download_speed * 8) / (1024 * 1024)).toFixed(1);
      speedEl.textContent = '⚡ ' + mbps + ' Мбит/с';
    }

    // Buffer percentage and MBs
    var bufferEl = document.getElementById('osd-buffer-text');
    var pct = 0;
    var loadedMb = 0;
    var totalMb = 0;

    if (torrent.buffer_size && (torrent.preload_size || torrent.preloaded_bytes)) {
      var loaded = torrent.preload_size || torrent.preloaded_bytes || 0;
      pct = Math.min(100, Math.round((loaded / torrent.buffer_size) * 100));
      loadedMb = Math.round(loaded / (1024 * 1024));
      totalMb = Math.round(torrent.buffer_size / (1024 * 1024));
    } else if (torrent.buffer_size && torrent.loaded_size) {
      pct = Math.min(100, Math.round((torrent.loaded_size / torrent.buffer_size) * 100));
      loadedMb = Math.round(torrent.loaded_size / (1024 * 1024));
      totalMb = Math.round(torrent.buffer_size / (1024 * 1024));
    } else if (torrent.stat === 2 || isPlaying) {
      pct = 100;
    }

    if (bufferEl) {
      if (pct > 0 && totalMb > 0) {
        bufferEl.textContent = 'Буфер: ' + pct + '% (' + loadedMb + '/' + totalMb + ' МБ)';
      } else if (pct > 0) {
        bufferEl.textContent = 'Буфер: ' + pct + '%';
      } else {
        bufferEl.textContent = 'Буфер: 100%';
      }
    }

    // Buffer dots
    if (dots && dots.length > 0) {
      var activeCount = Math.round((pct / 100) * dots.length);
      for (var d = 0; d < dots.length; d++) {
        dots[d].classList.toggle('active', d < activeCount);
      }
    }
    if ($bufferFill && pct > 0) {
      $bufferFill.style.width = pct + '%';
    }
  }

  function fetchDurationFromApi(url) {
    var linkMatch = url.match(/link=([^&]+)/);
    var indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    var link = decodeURIComponent(linkMatch[1]);
    var index = indexMatch ? indexMatch[1] : '0';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/torrents/duration?link=' + encodeURIComponent(link) + '&index=' + index, true);
    xhr.timeout = 12000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.duration && data.duration > 0) {
            duration = data.duration;
            if (player && typeof player.setDuration === 'function') {
              player.setDuration(duration);
            }
            if ($timeTotal) $timeTotal.textContent = fmtTime(duration);
          }
        } catch(e) {}
      }
    };
    xhr.send();
  }

  function loadTrackInfo(url) {
    var linkMatch = url.match(/link=([^&]+)/);
    var indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    var link = decodeURIComponent(linkMatch[1]);
    var index = indexMatch ? indexMatch[1] : '0';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/torrents/tracks?link=' + encodeURIComponent(link) + '&index=' + index, true);
    xhr.timeout = 10000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.audioTracks && data.audioTracks.length > 0 && player) {
            player.audioTracks = data.audioTracks;
          }
          if (data.subtitleTracks && data.subtitleTracks.length > 0 && player) {
            player.subtitleTracks = data.subtitleTracks;
            player.subtitleTracks.forEach(function(st) {
              st.url = '/api/torrents/subtitle-file?link=' + encodeURIComponent(link) + '&index=' + st.id;
            });
          }
        } catch(e) {}
      }
    };
    xhr.send();
  }

  function saveProgress() {
    if (mediaType === 'iptv' || !movieId || isNaN(Number(movieId)) || Number(movieId) <= 0 || !duration || duration <= 0) return;
    var saveId = Number(movieId);
    if (!saveId || currentTime < 2) return;
    try {
      var pos = JSON.parse(localStorage.getItem('playback_positions') || '{}');
      var existingPoster = (pos[saveId] && pos[saveId].title && pos[saveId].title.poster) || '';
      var savePoster = posterUrl || existingPoster || '';
      pos[saveId] = {
        time: Math.round(currentTime),
        duration: Math.round(duration || 0),
        timestamp: Date.now(),
        title: { name: movieTitle, poster: savePoster, id: saveId, type: mediaType }
      };
      localStorage.setItem('playback_positions', JSON.stringify(pos));

      // Also persist to server history
      var token = localStorage.getItem(TOKEN_KEY);
      if (token && movieId) {
        var hXhr = new XMLHttpRequest();
        hXhr.open('POST', API + '/api/user/history', true);
        hXhr.setRequestHeader('Content-Type', 'application/json');
        hXhr.setRequestHeader('Authorization', 'Bearer ' + token);
        hXhr.send(JSON.stringify({
          tmdbId: movieId,
          mediaType: mediaType,
          titleName: movieTitle,
          poster: savePoster,
          progress: Math.round(currentTime),
          timestamp: Date.now()
        }));
      }
    } catch(e) {}
  }

  function sendSessionHeartbeat() {
    var token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token') || localStorage.getItem('lumiere_access') || '';
    var effectiveTitle = movieTitle || (movieId ? ('Медиа #' + movieId) : 'ТВ Воспроизведение');
    if (!currentSessionId) {
      return;
    }
    var activePlaying = (player && typeof player.isPlaying === 'function') ? player.isPlaying() : isPlaying;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/sessions/heartbeat', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    }
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var res = JSON.parse(xhr.responseText);
          if (res && res.terminate) {
            console.warn('[Player] Remote termination requested by administrator');
            goBack();
            if (typeof window.showTvToast === 'function') {
              window.showTvToast('Воспроизведение остановлено администратором', 3500);
            }
          }
        } catch(e) {}
      } else {
        console.warn('[Player] Heartbeat non-200 status:', xhr.status);
      }
    };
    xhr.onerror = function(err) {
      console.warn('[Player] Heartbeat network error:', err);
    };
    xhr.send(JSON.stringify({
      sessionId: currentSessionId,
      deviceType: 'tv',
      deviceName: 'Samsung Smart TV UE50TU8500',
      mediaType: mediaType || 'movie',
      mediaId: movieId || 0,
      mediaTitle: effectiveTitle,
      mediaPoster: posterUrl || '',
      currentTime: Math.round(currentTime || 0),
      duration: Math.round(duration || 0),
      isPaused: !activePlaying
    }));
  }

  function stopSession() {
    if (sessionHeartbeatTimer) {
      clearInterval(sessionHeartbeatTimer);
      sessionHeartbeatTimer = null;
    }
    var token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('lumiere_access');
    if (!currentSessionId) return;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/sessions/stop', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    }
    xhr.send(JSON.stringify({ sessionId: currentSessionId }));
  }

  function goBack() {
    console.log('[Player] Exiting player...');
    saveProgress();
    destroyPlayer();
    if (typeof window.closePlayer === 'function') {
      window.closePlayer();
    }
  }

  // ========== Destroy Player Lifecycle ==========
  function destroyPlayer() {
    stopSession();
    if (bufferTimer) { clearInterval(bufferTimer); bufferTimer = null; }
    if (iptvStatsTimer) { clearInterval(iptvStatsTimer); iptvStatsTimer = null; }
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
    if (osdTimer) { clearTimeout(osdTimer); osdTimer = null; }
    if (centerFlashTimer) { clearTimeout(centerFlashTimer); centerFlashTimer = null; }
    if (seekDebounceTimer) { clearTimeout(seekDebounceTimer); seekDebounceTimer = null; }
    isSeeking = false;
    pendingSeekTarget = 0;
    accumulatedDelta = 0;

    if (player) {
      try { player.stop(); } catch(e) {}
      player = null;
    }

    if (typeof webapis !== 'undefined' && webapis.avplay) {
      try { webapis.avplay.stop(); } catch(e) {}
      try { webapis.avplay.close(); } catch(e) {}
    }

    isPlaying = false;
    topMenuFocused = false;
    popupOpen = false;
    movieTitle = '';
    movieId = 0;
    streamUrl = '';
    currentTime = 0;
    duration = 0;
  }
  window.destroyPlayer = destroyPlayer;
  window.startIptvPolling = startIptvPolling;
  window.updateIptvStatsUI = updateIptvStatsUI;

  // ========== Single Master Key Handler (Delegated from tv.js) ==========
  window.handlePlayerKey = function(code, key, e) {
    try {
      // 1. Back / Return / Escape Key
      if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
        if (popupOpen) {
          closePopup();
        } else if (topMenuFocused) {
          blurTopMenu();
        } else {
          goBack();
        }
        return;
      }

      // 2. Hardware Samsung Media Keys & Space
      if (code === 415 || key === 'MediaPlay') {
        var isPl = (player && typeof player.isPlaying === 'function') ? player.isPlaying() : isPlaying;
        if (!isPl) togglePlay();
        return;
      }
      if (code === 19 || key === 'MediaPause') {
        var isPl = (player && typeof player.isPlaying === 'function') ? player.isPlaying() : isPlaying;
        if (isPl) togglePlay();
        return;
      }
      if (code === 10252 || key === 'MediaPlayPause' || code === 32 || key === ' ' || key === 'Space') {
        togglePlay();
        return;
      }
      if (code === 417 || key === 'MediaFastForward') {
        seekBy(15);
        return;
      }
      if (code === 412 || key === 'MediaRewind') {
        seekBy(-15);
        return;
      }

      // 3. Directional & Action Keys
      var isLeft = (code === 37 || key === 'ArrowLeft' || key === 'Left');
      var isRight = (code === 39 || key === 'ArrowRight' || key === 'Right');
      var isUp = (code === 38 || key === 'ArrowUp' || key === 'Up');
      var isDown = (code === 40 || key === 'ArrowDown' || key === 'Down');
      var isEnter = (code === 13 || code === 29443 || code === 65385 || code === 65376 ||
                     key === 'Enter' || key === 'Select' || key === 'Ok' || key === 'OK');

      // --- When Track Popup Is Open ---
      if (popupOpen) {
        if (isUp) {
          if (popupIndex > 0) {
            popupIndex--;
            renderPopup();
          }
          return;
        }
        if (isDown) {
          if (popupIndex < popupItems.length - 1) {
            popupIndex++;
            renderPopup();
          }
          return;
        }
        if (isEnter) {
          selectPopupItem();
          return;
        }
        if (isLeft || isRight) {
          closePopup();
          return;
        }
        return;
      }

      // --- When Top Menu Buttons Are Focused ---
      if (topMenuFocused) {
        if (isLeft) {
          if (topBtnIndex > 0) {
            topBtnIndex--;
            updateTopMenuFocus();
          }
          return;
        }
        if (isRight) {
          if (topBtnIndex < topBtns.length - 1) {
            topBtnIndex++;
            updateTopMenuFocus();
          }
          return;
        }
        if (isDown) {
          blurTopMenu();
          return;
        }
        if (isEnter) {
          if (topBtns[topBtnIndex]) {
            topBtns[topBtnIndex].click();
          }
          return;
        }
        return;
      }

      // --- Standard Playback Mode (Direct TV Remote Controls) ---
      if (isEnter) {
        // OK immediately toggles Play/Pause!
        togglePlay();
        return;
      }

      if (isLeft) {
        // Left immediately seeks -10s!
        seekBy(-10);
        return;
      }

      if (isRight) {
        // Right immediately seeks +10s!
        seekBy(10);
        return;
      }

      if (isUp) {
        // Up focuses top action buttons (Back, Audio, Subtitles)
        focusTopMenu();
        return;
      }

      if (isDown) {
        // Down toggles OSD display on/off
        if (osdVisible) hideOsd();
        else showOsd(true);
        return;
      }

    } catch(err) {
      console.error('[Player] handlePlayerKey exception:', err);
    }
  };

  // Legacy fallback for tv.js
  window.handlePlayerBackKey = function() {
    window.handlePlayerKey(10009, 'Escape', null);
  };

})();
