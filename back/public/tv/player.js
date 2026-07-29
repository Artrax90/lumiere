// Lumiere TV Player — with PlayerAdapter (Chrome 56 compatible)
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
  var referrerUrl = '';
  var isBuffering = false;
  var subtitleCues = [];
  var currentSubtitleIdx = -1;
  var streamUrl = '';

  // Navigation
  var navRows = [];
  var navRow = 1;
  var navCol = 2;

  // Popup
  var popupOpen = false;
  var popupFocus = 0;
  var popupItems = [];
  var popupReturnRow = 0;
  var popupReturnCol = 0;

  // Scrubber
  var scrubberFocused = false;
  var scrubberPos = 0;

  // DOM
  var $osd, $osdTitle, $timeCurrent, $timeTotal;
  var $fill, $bufferFill, $thumb, $centerPlay;
  var $popup, $popupHeader, $popupList, $subtitleOverlay;

  // Player Adapter
  var player = null;

  // ========== Init ==========
  window.addEventListener('DOMContentLoaded', function() {
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
    referrerUrl = params.ref || '';

    $osdTitle.textContent = movieTitle;

    // Build nav rows
    navRows = [
      [document.getElementById('btn-back')],
      [document.getElementById('timeline-wrap')],
      [
        document.getElementById('btn-start'),
        document.getElementById('btn-rew'),
        document.getElementById('btn-play'),
        document.getElementById('btn-fwd'),
        document.getElementById('btn-end')
      ],
      [
        document.getElementById('btn-cc'),
        document.getElementById('btn-audio'),
        document.getElementById('btn-speed'),
        document.getElementById('btn-settings')
      ]
    ];

    // Initialize player adapter
    player = new PlayerAdapter('player');

    // Listen for player events
    player.on('loaded', function() {
      isPlaying = true;
      updatePlayBtn();
      // Update debug info after engine is determined
      updateDebugInfo();
    });
    player.on('playing', function() {
      isPlaying = true;
      updatePlayBtn();
    });
    player.on('paused', function() {
      isPlaying = false;
      updatePlayBtn();
    });
    player.on('ended', function() {
      isPlaying = false;
      updatePlayBtn();
      saveProgress();
    });
    player.on('timeUpdate', function(data) {
      currentTime = data.currentTime;
      if (!scrubberFocused) updateTimeline();
      updateSubtitleDisplay();
      // Update buffer from video element (primary source)
      updateBufferFromVideo();
      // Update debug
      updateDebugInfo();
    });
    player.on('durationChange', function(data) {
      if (data.duration > 0) duration = data.duration;
      updateTimeline();
    });
    player.on('bufferingStart', function() {
      isBuffering = true;
      // Show buffering indicator
      var $centerPlay = document.getElementById('center-play');
      if ($centerPlay) $centerPlay.classList.remove('hidden');
      var $centerIcon = document.getElementById('center-play-icon');
      if ($centerIcon) $centerIcon.innerHTML = '<div style="font-size:24px;color:white;">Буферизация...</div>';
    });
    player.on('bufferingProgress', function(data) {
      if ($bufferFill && data.percent > 0) {
        $bufferFill.style.width = data.percent + '%';
      }
    });
    player.on('bufferingEnd', function() {
      isBuffering = false;
      var $centerPlay = document.getElementById('center-play');
      if ($centerPlay) {
        if (isPlaying) $centerPlay.classList.add('hidden');
        else {
          var $centerIcon = document.getElementById('center-play-icon');
          if ($centerIcon) $centerIcon.innerHTML = '▶';
        }
      }
    });
    player.on('audioTracksChanged', function(data) {
      // Audio tracks are now available in player.getAudioTracks()
    });
    player.on('subtitleTracksChanged', function(data) {
      // Subtitle tracks are now available in player.getSubtitleTracks()
    });
    player.on('error', function(data) {
      console.error('[Player] Error:', data.message);
    });

    // Start playback
    if (url) {
      streamUrl = url;
      player.play(url);
      fetchDurationFromApi(url);
      loadTrackInfo(url);
      startBufferPolling();
    }

    setupControls();
    showOsd();
    navRow = 1; navCol = 2;
    highlightFocused();

    // Resume from saved position
    if (movieId) {
      try {
        var positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
        var saved = positions[movieId];
        if (saved && typeof saved === 'object' && saved.time > 30) {
          var resumeTime = saved.time;
          var resumeAttempts = 0;
          var resumeInterval = setInterval(function() {
            resumeAttempts++;
            if (duration > 0) {
              player.seekTo(Math.min(resumeTime, duration - 5));
              clearInterval(resumeInterval);
            } else if (resumeAttempts > 50) {
              clearInterval(resumeInterval);
            }
          }, 200);
        }
      } catch(e) {}
    }
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

  // ========== Debug ==========
  function updateDebugInfo() {
    var el = document.getElementById('debug-info');
    if (!el) return;
    var avplayType = typeof webapis !== 'undefined' ? (webapis.avplay === null ? 'null' : typeof webapis.avplay) : 'n/a';
    var videoBuffer = 'n/a';
    if (player && player._videoEl && player._videoEl.buffered && player._videoEl.buffered.length > 0) {
      var end = player._videoEl.buffered.end(player._videoEl.buffered.length - 1);
      var d = duration > 0 ? duration : 1;
      videoBuffer = Math.round((end / d) * 100) + '%';
    }
    el.textContent = 'Engine: ' + (player ? player.engineType : '?') + ' | hash: ' + (torrHash ? torrHash.substring(0,8) : 'none') + ' | dur: ' + Math.round(duration) + ' | vBuf: ' + videoBuffer;
  }

  // ========== Track info from backend ==========
  function loadTrackInfo(url) {
    var linkMatch = url.match(/link=([^&]+)/);
    var indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    var link = decodeURIComponent(linkMatch[1]);
    var index = indexMatch ? indexMatch[1] : '0';

    // Get audio/subtitle tracks from backend
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/torrents/tracks?link=' + encodeURIComponent(link) + '&index=' + index, true);
    xhr.timeout = 10000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data.audioTracks && data.audioTracks.length > 0) {
            player.audioTracks = data.audioTracks;
            player._emit('audioTracksChanged', { tracks: data.audioTracks });
          }
          if (data.subtitleTracks && data.subtitleTracks.length > 0) {
            player.subtitleTracks = data.subtitleTracks;
            player.subtitleTracks.forEach(function(st) {
              st.url = '/api/torrents/subtitle-file?link=' + encodeURIComponent(link) + '&index=' + st.id;
            });
            player._emit('subtitleTracksChanged', { tracks: data.subtitleTracks });
          }
        } catch(e) {}
      }
    };
    xhr.send('{}');
  }

  // ========== Duration from API ==========
  function fetchDurationFromApi(url) {
    var linkMatch = url.match(/link=([^&]+)/);
    var indexMatch = url.match(/index=(\d+)/);
    if (!linkMatch) return;
    var link = decodeURIComponent(linkMatch[1]);
    var index = indexMatch ? indexMatch[1] : '0';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + '/api/torrents/duration?link=' + encodeURIComponent(link) + '&index=' + index, true);
    xhr.timeout = 15000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.duration && data.duration > 0) {
            duration = data.duration;
            updateTimeline();
          }
        } catch(e) {}
      }
    };
    xhr.send('{}');
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
    xhr.send('{}');
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

  function updateSubtitleDisplay() {
    if (subtitleCues.length === 0 || currentSubtitleIdx < 0) {
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

  // ========== Buffer from video element ==========
  function updateBufferFromVideo() {
    if (!player || !player._videoEl) return;
    var v = player._videoEl;
    try {
      if (v.buffered && v.buffered.length > 0) {
        var end = v.buffered.end(v.buffered.length - 1);
        var d = duration > 0 ? duration : (isFinite(v.duration) ? v.duration : 0);
        if (d > 0) {
          var pct = Math.min(100, Math.round((end / d) * 100));
          if ($bufferFill) $bufferFill.style.width = pct + '%';
        }
      }
    } catch(e) {}
  }

  // ========== Buffer from TorrServer ==========
  var torrHash = '';
  var bufferTimer = null;
  var torrServerUrl = 'http://192.168.1.37:8090'; // TODO: make configurable

  function extractHashFromUrl(url) {
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
    var debugEl = document.getElementById('debug-info');
    if (!torrHash) {
      if (debugEl) debugEl.textContent += ' | NO HASH';
      return;
    }
    if (debugEl) debugEl.textContent += ' | polling...';
    pollBuffer();
    bufferTimer = setInterval(pollBuffer, 3000);
  }

  function pollBuffer() {
    var debugEl = document.getElementById('debug-info');
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/torrents/torrserver/list', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 5000;
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var list = JSON.parse(xhr.responseText);
          var hashLower = torrHash.toLowerCase();
          var found = false;
          for (var i = 0; i < list.length; i++) {
            if (list[i].hash && list[i].hash.toLowerCase() === hashLower) {
              var loaded = list[i].loaded_size || 0;
              var total = list[i].torrent_size || 0;
              if (total > 0) {
                var pct = Math.min(100, Math.round((loaded / total) * 100));
                if ($bufferFill) $bufferFill.style.width = pct + '%';
                if (debugEl) debugEl.textContent = 'Buffer: ' + pct + '% (' + Math.round(loaded/1048576) + 'MB/' + Math.round(total/1048576) + 'MB)';
              }
              found = true;
              break;
            }
          }
          if (!found && debugEl) debugEl.textContent += ' | hash not found';
        } catch(e) {
          if (debugEl) debugEl.textContent += ' | parse err';
        }
      } else {
        if (debugEl) debugEl.textContent += ' | HTTP ' + xhr.status;
      }
    };
    xhr.onerror = function() {
      if (debugEl) debugEl.textContent += ' | net err';
    };
    xhr.send('{}');
  }

  function stopBufferPolling() {
    if (bufferTimer) { clearInterval(bufferTimer); bufferTimer = null; }
  }

  // ========== Timeline ==========
  function updateTimeline() {
    var pct = duration > 0 ? (currentTime / duration * 100) : 0;
    if ($fill) $fill.style.width = pct + '%';
    if ($thumb) $thumb.style.left = pct + '%';
    if ($timeCurrent) $timeCurrent.textContent = fmt(currentTime);
    if ($timeTotal) $timeTotal.textContent = duration > 0 ? fmt(duration) : '--:--';
  }

  function updateScrubberPreview() {
    var pct = scrubberPos;
    if ($fill) $fill.style.width = pct + '%';
    if ($thumb) $thumb.style.left = pct + '%';
    if ($timeCurrent) $timeCurrent.textContent = fmt((pct / 100) * duration);
  }

  // ========== Play/Pause ==========
  function updatePlayBtn() {
    var btn = document.getElementById('btn-play');
    if (btn) btn.innerHTML = isPlaying ? '❚❚' : '▶';
    if ($centerPlay) {
      if (isPlaying) $centerPlay.classList.add('hidden');
      else $centerPlay.classList.remove('hidden');
    }
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
      if (navRow === 1 && el.id === 'timeline-wrap') scrubberFocused = true;
    }
  }

  // ========== Controls ==========
  function setupControls() {
    bindClick('btn-back', function() { goBack(); });
    bindClick('btn-start', function() { player.seekTo(0); showOsd(); });
    bindClick('btn-rew', function() { player.seek(-10); showOsd(); });
    bindClick('btn-play', function() { togglePlay(); });
    bindClick('btn-fwd', function() { player.seek(10); showOsd(); });
    bindClick('btn-end', function() { if (duration > 0) player.seekTo(Math.max(0, duration - 10)); showOsd(); });
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
        player.seekTo(pct * duration);
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

    if (code === 10009) {
      if (popupOpen) { closePopup(); }
      else if (scrubberFocused) { scrubberFocused = false; highlightFocused(); showOsd(); }
      else if (osdVisible) { hideOsd(); }
      else { goBack(); }
      e.preventDefault();
      return;
    }

    showOsd();

    if (scrubberFocused && (code === 37 || code === 39 || code === 13)) {
      if (code === 37) { scrubberPos = Math.max(0, scrubberPos - 2); updateScrubberPreview(); }
      else if (code === 39) { scrubberPos = Math.min(100, scrubberPos + 2); updateScrubberPreview(); }
      else if (code === 13) { if (duration > 0) player.seekTo((scrubberPos / 100) * duration); scrubberFocused = false; highlightFocused(); }
      e.preventDefault();
      return;
    }

    switch (code) {
      case 37:
        if (navCol > 0) { navCol--; highlightFocused(); }
        e.preventDefault();
        break;
      case 39:
        if (navCol < navRows[navRow].length - 1) { navCol++; highlightFocused(); }
        e.preventDefault();
        break;
      case 38:
        if (navRow > 0) { navRow--; if (navCol >= navRows[navRow].length) navCol = navRows[navRow].length - 1; highlightFocused(); }
        e.preventDefault();
        break;
      case 40:
        if (navRow < navRows.length - 1) { navRow++; if (navCol >= navRows[navRow].length) navCol = navRows[navRow].length - 1; highlightFocused(); }
        e.preventDefault();
        break;
      case 13:
        var el = navRows[navRow] && navRows[navRow][navCol];
        if (el) el.click();
        e.preventDefault();
        break;
    }
  }

  // ========== Actions ==========
  function togglePlay() {
    if (isPlaying) player.pause();
    else player.resume();
    showOsd();
  }

  function goBack() {
    saveProgress();
    stopBufferPolling();
    player.stop();
    var server = localStorage.getItem(SERVER_KEY) || '';
    if (movieId) window.location.href = server + '/tv/?detail=' + movieId;
    else window.location.href = server + '/tv/';
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
    var tracks = player.getSubtitleTracks();
    var html = '';
    html += renderPopupItem('Выключены', currentSubtitleIdx === -1);
    tracks.forEach(function(t, i) {
      html += renderPopupItem(t.name || t.lang || 'Дорожка ' + (i+1), currentSubtitleIdx === i);
    });
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      if (idx === 0) {
        currentSubtitleIdx = -1;
        subtitleCues = [];
        $subtitleOverlay.innerHTML = '';
      } else {
        currentSubtitleIdx = idx - 1;
        var track = tracks[currentSubtitleIdx];
        if (track && track.url) loadSubtitleVtt(track.url);
      }
      closePopup();
    });
  }

  function renderAudioPopup() {
    $popupHeader.textContent = 'Аудио дорожки';
    var tracks = player.getAudioTracks();
    var html = '';
    if (tracks.length === 0) {
      html = '<div class="popup-item" style="color:rgba(255,255,255,0.3)">Нет доступных дорожек</div>';
    } else {
      tracks.forEach(function(t, i) {
        html += renderPopupItem(t.name || 'Дорожка ' + (i+1), player.currentAudio === i);
      });
    }
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      switchAudioTrack(idx);
      closePopup();
    });
  }

  function switchAudioTrack(trackIndex) {
    // Save current state
    var saveTime = currentTime;
    var wasPlaying = isPlaying;

    // Build new URL with audio parameter
    var url = streamUrl || '';
    if (!url) return;

    // Add or replace audio parameter
    if (url.indexOf('audio=') >= 0) {
      url = url.replace(/audio=\d+/, 'audio=' + trackIndex);
    } else {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'audio=' + trackIndex;
    }

    // Stop current playback (removes old video element)
    player.stop();
    streamUrl = url;
    player.currentAudio = trackIndex;

    // Small delay to ensure cleanup, then start new stream
    setTimeout(function() {
      player.play(url);

      // Seek to saved position after stream loads
      var attempts = 0;
      var seekInterval = setInterval(function() {
        attempts++;
        if (duration > 0 || attempts > 50) {
          if (saveTime > 0) player.seekTo(saveTime);
          if (wasPlaying) player.resume();
          clearInterval(seekInterval);
        }
      }, 200);
    }, 100);
  }

  function renderSpeedPopup() {
    $popupHeader.textContent = 'Скорость';
    var speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    var html = '';
    speeds.forEach(function(s) {
      html += renderPopupItem(s + 'x', false);
    });
    $popupList.innerHTML = html;
    bindPopupClick(function(idx) {
      player.setPlaybackRate(speeds[idx]);
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
    html += '<div class="popup-item"><span>Движок</span><span style="color:rgba(255,255,255,0.5)">' + (typeof webapis !== 'undefined' && webapis.avplay ? 'AVPlay' : 'HTML5 Video') + '</span></div>';
    html += '<div class="popup-item"><span>Позиция</span><span style="color:rgba(255,255,255,0.5)">' + fmt(currentTime) + ' / ' + fmt(duration) + '</span></div>';
    html += '<div class="popup-item"><span>Аудио дорожек</span><span style="color:rgba(255,255,255,0.5)">' + player.getAudioTracks().length + '</span></div>';
    html += '<div class="popup-item"><span>Субтитры</span><span style="color:rgba(255,255,255,0.5)">' + player.getSubtitleTracks().length + '</span></div>';
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
      case 38:
        if (popupFocus > 0) {
          popupItems[popupFocus].classList.remove('focused');
          popupFocus--;
          popupItems[popupFocus].classList.add('focused');
          popupItems[popupFocus].scrollIntoView(false);
        }
        e.preventDefault();
        break;
      case 40:
        if (popupFocus < popupItems.length - 1) {
          popupItems[popupFocus].classList.remove('focused');
          popupFocus++;
          popupItems[popupFocus].classList.add('focused');
          popupItems[popupFocus].scrollIntoView(false);
        }
        e.preventDefault();
        break;
      case 13:
        if (popupItems[popupFocus]) popupItems[popupFocus].click();
        e.preventDefault();
        break;
      case 10009:
        closePopup();
        e.preventDefault();
        break;
    }
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
