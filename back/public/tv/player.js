// Lumiere TV Player (Chrome 56 compatible)
(function() {
  'use strict';

  var API = '';
  var TOKEN_KEY = 'lumiere_access';
  var SERVER_KEY = 'lumiere_server';

  var $video, $osd, $title, $timeDisplay, $fill, $bufferFill;
  var $centerPlay, $settingsPanel, $settingsList, $settingsTitle, $subtitleOverlay;

  var isPlaying = false;
  var currentTime = 0;
  var duration = 0;
  var osdTimer = null;
  var osdVisible = true;
  var movieTitle = '';
  var movieId = 0;

  // Button navigation
  // Rows: 0 = back button, 1 = skip-back, play, skip-fwd, volume, subs, audio
  var focusRow = 1; // start on controls row
  var focusCol = 1; // start on play button (index 1 in controls row)
  var rows = [];

  var audioTracks = [];
  var subtitleTracks = [];
  var currentAudio = 0;
  var currentSubtitle = -1;
  var settingsMode = 'none';
  var settingsFocus = 0;
  var subtitleCues = [];

  // ========== Init ==========
  window.addEventListener('DOMContentLoaded', function() {
    $video = document.getElementById('video');
    $osd = document.getElementById('osd');
    $title = document.getElementById('osd-title');
    $timeDisplay = document.getElementById('time-display');
    $fill = document.getElementById('timeline-fill');
    $bufferFill = document.getElementById('timeline-buffer');
    $centerPlay = document.getElementById('center-play');
    $settingsPanel = document.getElementById('settings-panel');
    $settingsList = document.getElementById('settings-list');
    $settingsTitle = document.getElementById('settings-title');
    $subtitleOverlay = document.getElementById('subtitle-overlay');

    var server = localStorage.getItem(SERVER_KEY);
    if (server) API = server;

    var params = parseParams();
    movieTitle = params.title || '';
    movieId = parseInt(params.id) || 0;
    var url = params.url || '';

    $title.textContent = movieTitle;

    // Build button rows for navigation
    rows = [
      [document.getElementById('btn-back')],  // row 0: back button
      [                                        // row 1: controls
        document.getElementById('btn-skip-back'),
        document.getElementById('btn-play'),
        document.getElementById('btn-skip-fwd'),
        document.getElementById('btn-volume'),
        document.getElementById('btn-subs'),
        document.getElementById('btn-audio')
      ]
    ];

    if (url) {
      startPlayback(url);
      loadTrackInfo(url);
    }

    setupControls();
    showOsd();
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

  // ========== Focus management ==========
  function clearFocus() {
    for (var r = 0; r < rows.length; r++) {
      for (var c = 0; c < rows[r].length; c++) {
        if (rows[r][c]) rows[r][c].classList.remove('focused');
      }
    }
  }

  function highlightFocused() {
    clearFocus();
    var btn = rows[focusRow] && rows[focusRow][focusCol];
    if (btn) btn.classList.add('focused');
  }

  // ========== Playback ==========
  function startPlayback(url) {
    $video.style.display = 'block';
    $video.src = url;
    $video.play().then(function() { isPlaying = true; updatePlayIcon(); }).catch(function() {});

    $video.ontimeupdate = function() {
      currentTime = $video.currentTime;
      if ($video.duration && isFinite($video.duration)) duration = $video.duration;
      updateTimeline();
      updateSubtitles();
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
    $video.onended = function() { isPlaying = false; updatePlayIcon(); saveProgress(); };
  }

  function updatePlayIcon() {
    var btn = document.getElementById('btn-play');
    if (btn) btn.innerHTML = isPlaying ? '&#9646;&#9646;' : '&#9654;';
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
    apiFetch(url, function(err, text) {
      if (err || !text) { subtitleCues = []; return; }
      subtitleCues = parseVtt(text);
    });
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
    if ($timeDisplay) $timeDisplay.textContent = fmt(currentTime) + ' / ' + fmt(duration);
  }

  function updateBuffer() {
    if (!$bufferFill || !$video || !$video.buffered || $video.buffered.length === 0) return;
    var end = $video.buffered.end($video.buffered.length - 1);
    $bufferFill.style.width = (duration > 0 ? (end / duration * 100) : 0) + '%';
  }

  // ========== OSD ==========
  function showOsd() {
    osdVisible = true;
    $osd.classList.remove('hide');
    highlightFocused();
    resetOsdTimer();
  }

  function hideOsd() {
    osdVisible = false;
    clearFocus();
    if (isPlaying && settingsMode === 'none') $osd.classList.add('hide');
  }

  function resetOsdTimer() {
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function() {
      if (isPlaying && settingsMode === 'none') hideOsd();
    }, 6000);
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
    bindClick('btn-skip-back', function() { seek(-10); });
    bindClick('btn-skip-fwd', function() { seek(10); });
    bindClick('btn-play', function() { togglePlay(); });
    bindClick('btn-back', function() { goBack(); });
    bindClick('btn-volume', function() { toggleMute(); });
    bindClick('btn-subs', function() { openSettings('subs'); });
    bindClick('btn-audio', function() { openSettings('audio'); });

    // Timeline click
    var tw = document.getElementById('timeline-wrap');
    if (tw) {
      tw.addEventListener('click', function(e) {
        var rect = tw.getBoundingClientRect();
        $video.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
        showOsd();
      });
    }

    document.addEventListener('keydown', function(e) {
      if (settingsMode !== 'none') { handleSettingsKeys(e); return; }
      handlePlayerKeys(e);
    });
  }

  function bindClick(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  function handlePlayerKeys(e) {
    var code = e.keyCode;

    // When OSD hidden
    if (!osdVisible) {
      switch (code) {
        case 37: seek(-10); e.preventDefault(); break;     // Left
        case 39: seek(10); e.preventDefault(); break;       // Right
        case 38: showOsd(); e.preventDefault(); break;      // Up
        case 40: e.preventDefault(); break;                  // Down (nothing)
        case 13: togglePlay(); e.preventDefault(); break;    // Enter
        case 10009: goBack(); e.preventDefault(); break;     // Back
      }
      return;
    }

    // When OSD visible — navigate between buttons
    switch (code) {
      case 37: // Left — move left in row
        if (focusCol > 0) {
          focusCol--;
          highlightFocused();
          resetOsdTimer();
        }
        e.preventDefault();
        break;

      case 39: // Right — move right in row
        if (focusCol < rows[focusRow].length - 1) {
          focusCol++;
          highlightFocused();
          resetOsdTimer();
        }
        e.preventDefault();
        break;

      case 38: // Up — move to row above
        if (focusRow > 0) {
          focusRow--;
          // Adjust column if target row is shorter
          if (focusCol >= rows[focusRow].length) focusCol = rows[focusRow].length - 1;
          highlightFocused();
          resetOsdTimer();
        }
        e.preventDefault();
        break;

      case 40: // Down — move to row below, or hide OSD if on last row
        if (focusRow < rows.length - 1) {
          focusRow++;
          if (focusCol >= rows[focusRow].length) focusCol = rows[focusRow].length - 1;
          highlightFocused();
          resetOsdTimer();
        } else {
          hideOsd();
        }
        e.preventDefault();
        break;

      case 13: // Enter — click focused button
        var btn = rows[focusRow] && rows[focusRow][focusCol];
        if (btn) btn.click();
        e.preventDefault();
        break;

      case 10009: // Back — hide OSD
        hideOsd();
        e.preventDefault();
        break;
    }
  }

  function togglePlay() {
    if ($video.paused) { $video.play(); isPlaying = true; }
    else { $video.pause(); isPlaying = false; }
    updatePlayIcon();
    showOsd();
  }

  function toggleMute() {
    $video.muted = !$video.muted;
  }

  function seek(sec) {
    $video.currentTime = Math.max(0, Math.min($video.currentTime + sec, duration));
  }

  function goBack() {
    saveProgress();
    $video.pause();
    $video.src = '';
    window.location.href = (localStorage.getItem(SERVER_KEY) || '') + '/tv/';
  }

  // ========== Settings ==========
  function openSettings(mode) {
    settingsMode = mode;
    settingsFocus = 0;
    $settingsPanel.classList.remove('hidden');
    renderSettings();
  }

  function closeSettings() {
    settingsMode = 'none';
    $settingsPanel.classList.add('hidden');
    showOsd();
  }

  function renderSettings() {
    var html = '';
    var items = [];

    if (settingsMode === 'audio') {
      $settingsTitle.textContent = 'Audio Tracks';
      if (audioTracks.length === 0) html = '<div class="settings-item" style="color:rgba(255,255,255,0.3)">No tracks available</div>';
      else audioTracks.forEach(function(t, i) { items.push({ i: i, name: t.name || 'Track ' + (i+1), active: i === currentAudio }); });
    } else if (settingsMode === 'subs') {
      $settingsTitle.textContent = 'Subtitles';
      items.push({ i: -1, name: 'Off', active: currentSubtitle === -1 });
      subtitleTracks.forEach(function(t, i) { items.push({ i: i, name: t.name || t.lang || 'Track ' + (i+1), active: i === currentSubtitle }); });
    }

    items.forEach(function(item, idx) {
      var cls = 'settings-item';
      if (idx === settingsFocus) cls += ' focused';
      if (item.active) cls += ' active';
      html += '<div class="' + cls + '" data-idx="' + item.i + '"><span>' + esc(item.name) + '</span>';
      if (item.active) html += '<span class="check">&#10003;</span>';
      html += '</div>';
    });

    $settingsList.innerHTML = html;
    $settingsList.querySelectorAll('.settings-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.getAttribute('data-idx'));
        if (!isNaN(idx)) selectSetting(idx);
      });
    });
  }

  function selectSetting(idx) {
    if (settingsMode === 'audio') currentAudio = idx;
    else if (settingsMode === 'subs') {
      currentSubtitle = idx;
      if (idx >= 0 && subtitleTracks[idx] && subtitleTracks[idx].url) loadSubtitleVtt(subtitleTracks[idx].url);
      else { subtitleCues = []; $subtitleOverlay.innerHTML = ''; }
    }
    closeSettings();
  }

  function handleSettingsKeys(e) {
    var items = $settingsList.querySelectorAll('.settings-item');
    var count = items.length;
    switch (e.keyCode) {
      case 38: if (settingsFocus > 0) settingsFocus--; renderSettings(); e.preventDefault(); break;
      case 40: if (settingsFocus < count - 1) settingsFocus++; renderSettings(); e.preventDefault(); break;
      case 13:
        var f = items[settingsFocus];
        if (f) { var idx = parseInt(f.getAttribute('data-idx')); if (!isNaN(idx)) selectSetting(idx); }
        e.preventDefault(); break;
      case 10009: closeSettings(); e.preventDefault(); break;
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
