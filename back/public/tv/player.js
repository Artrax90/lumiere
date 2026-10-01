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
  var timelineFocused = false;
  var bottomControlsFocused = false;
  var bottomBtnIndex = 2; // 0 = restart, 1 = rewind, 2 = play/pause, 3 = forward, 4 = next
  var $timelineRow = null;
  var lastVerticalNavTime = 0;

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
  var seekBaseTime = 0;
  var seekDebounceTimer = null;
  var iptvStatsTimer = null;
  var resumeTimer = null;

  // Binge-Watching & Autoplay state
  var torrentLink = '';
  var torrentFileIndex = -1;
  var torrentFiles = [];
  var nextFile = null;
  var curSeason = 1;
  var curEpisode = 1;
  var precacheSent = false;
  var nextEpOverlayVisible = false;
  var nextEpDismissed = false;
  var nextEpInterval = null;
  var nextEpBtnIndex = 0; // 0 = now, 1 = cancel

  function extractEpNumber(fileName, fallbackIndex, seasonNum) {
    if (!fileName) return (fallbackIndex != null ? fallbackIndex + 1 : 1);
    var s = fileName.toLowerCase();
    var m = s.match(/[sS]\d{1,2}[._\-\s]*[eE](\d{1,3})\b/);
    if (m) return parseInt(m[1], 10);
    m = s.match(/\b\d{1,2}[xх](\d{1,3})\b/);
    if (m) return parseInt(m[1], 10);
    m = s.match(/(?:сери[яий]|эпизод|серия:|эпизод:|выпуск|выпуск:|ep\.?|episode\.?)\s*[:]?\s*(\d{1,3})\b/i);
    if (m) return parseInt(m[1], 10);
    m = s.match(/\b(\d{1,3})\s*(?:сери[яий]|эпизод|выпуск|ep|episode)\b/i);
    if (m) return parseInt(m[1], 10);
    if (seasonNum != null) {
      var sPadded = (seasonNum < 10 ? '0' + seasonNum : '' + seasonNum);
      var seReg = new RegExp('(?:^|[^\\d])(?:0?' + seasonNum + '|' + sPadded + ')[-._](\\d{1,3})(?:[^\\d]|$)');
      m = s.match(seReg);
      if (m) return parseInt(m[1], 10);
    }
    m = s.match(/^(?:\[[^\]]*\]\s*)?(\d{1,3})[\s._\-]/);
    if (m) return parseInt(m[1], 10);
    m = s.match(/[\s._\-](\d{1,2})\.(?:mkv|avi|mp4|ts|m4v)$/);
    if (m) return parseInt(m[1], 10);
    return (fallbackIndex != null ? fallbackIndex + 1 : 1);
  }

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

  // Bottom transport action buttons
  var bottomBtns = [];
  var bottomControlsFocused = false;
  var bottomBtnIndex = 2; // Default to 2 (btn-play-pause)

  // Adaptive seeking state
  var lastSeekKeyTime = 0;
  var lastSeekDirection = 0;
  var seekHoldCount = 0;

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
        try { tizen.tvinputdevice.unregisterKey('VolumeUp'); } catch(e1) {}
        try { tizen.tvinputdevice.unregisterKey('VolumeDown'); } catch(e2) {}
        try { tizen.tvinputdevice.unregisterKey('VolumeMute'); } catch(e3) {}

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
    $timelineRow = document.getElementById('timeline-row');
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

    // Cache bottom transport buttons
    bottomBtns = [];
    var btnRestart = document.getElementById('btn-restart');
    var btnRewind = document.getElementById('btn-rewind');
    var btnPlayPause = document.getElementById('btn-play-pause');
    var btnForward = document.getElementById('btn-forward');
    var btnNext = document.getElementById('btn-next');
    if (btnRestart) bottomBtns.push(btnRestart);
    if (btnRewind) bottomBtns.push(btnRewind);
    if (btnPlayPause) bottomBtns.push(btnPlayPause);
    if (btnForward) bottomBtns.push(btnForward);
    if (btnNext) bottomBtns.push(btnNext);
    bottomControlsFocused = false;
    bottomBtnIndex = 2;
    lastSeekKeyTime = 0;
    lastSeekDirection = 0;
    seekHoldCount = 0;

    // Server & API
    var server = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || localStorage.getItem('lumiere_tv_server');
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
    if (typeof movieTitle === 'object') {
      movieTitle = movieTitle.name || movieTitle.title || '';
    }
    if (movieTitle === '[object Object]' || !movieTitle) {
      movieTitle = 'Видео';
    }
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
    timelineFocused = false;
    bottomControlsFocused = false;
    bottomBtnIndex = 2;
    blurTimeline();
    popupOpen = false;
    isSeeking = false;
    pendingSeekTarget = 0;
    accumulatedDelta = 0;
    seekBaseTime = 0;
    if (seekDebounceTimer) { clearTimeout(seekDebounceTimer); seekDebounceTimer = null; }
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
    if (nextEpInterval) { clearInterval(nextEpInterval); nextEpInterval = null; }
    nextEpOverlayVisible = false;
    nextEpDismissed = false;
    var $nextOvInit = document.getElementById('next-ep-overlay');
    if ($nextOvInit) {
      $nextOvInit.classList.add('hidden');
      $nextOvInit.style.display = 'none';
    }

    if (movieId) {
      try { localStorage.setItem('last_watched_id', String(movieId)); } catch(e) {}
    }

    torrentLink = params.link || '';
    torrentFileIndex = (params.fileIndex !== undefined) ? parseInt(params.fileIndex) : -1;
    torrentFiles = params.files || [];
    precacheSent = false;
    nextEpOverlayVisible = false;
    nextEpDismissed = false;
    nextFile = null;

    curSeason = 1;
    curEpisode = 1;
    var pTitle = params.title || '';
    var sMatch = pTitle.match(/·\s*S([0-9]+)\s*E([0-9]+)/i) || 
                 pTitle.match(/\bS([0-9]+)E([0-9]+)\b/i) || 
                 pTitle.match(/\[([0-9]+)x([0-9]+)\]/i);
    if (sMatch) {
      curSeason = parseInt(sMatch[1], 10);
      curEpisode = parseInt(sMatch[2], 10);
    } else {
      var epNumMatch = pTitle.match(/(?:сери[яий]|эпизод|выпуск|ep\.?)\s*[:]?\s*(\d{1,3})/i) ||
                       pTitle.match(/\b(\d{1,3})\s*(?:сери[яий]|эпизод|выпуск)\b/i);
      if (epNumMatch) {
        curEpisode = parseInt(epNumMatch[1], 10);
      }
    }
    if (params.season) curSeason = parseInt(params.season, 10) || curSeason;
    if (params.episode) curEpisode = parseInt(params.episode, 10) || curEpisode;

    var targetNextE = curEpisode + 1;
    var targetNextS = curSeason;
    var baseTitle = pTitle.replace(/\s*·\s*S\d+.*$/i, '').trim();

    // 1. Check torrentFiles by episode number (most accurate!)
    if (torrentFiles && torrentFiles.length > 0) {
      for (var tfi = 0; tfi < torrentFiles.length; tfi++) {
        var tf = torrentFiles[tfi];
        if (!tf || !tf.name) continue;
        if (tf.name && /\.(srt|nfo|txt|jpg|png|torrent)$/i.test(tf.name)) continue;
        if (/\bsample\b/i.test(tf.name) && !/episode/i.test(tf.name)) continue;

        var epParsed = extractEpNumber(tf.name, tfi, curSeason);
        if (epParsed === targetNextE) {
          nextFile = tf;
          nextFile.season = targetNextS;
          nextFile.episode = targetNextE;
          console.log('[Player] Next episode matched by episode number (' + targetNextE + '):', nextFile.name);
          break;
        }
      }
    }

    // 2. Check torrentFiles by index relative to current file
    if (!nextFile && torrentFiles && torrentFiles.length > 1 && torrentFileIndex >= 0) {
      var currArrIdx = -1;
      for (var fi = 0; fi < torrentFiles.length; fi++) {
        if (torrentFiles[fi].id === torrentFileIndex) {
          currArrIdx = fi;
          break;
        }
      }
      if (currArrIdx < 0) {
        for (var fi2 = 0; fi2 < torrentFiles.length; fi2++) {
          if (fi2 === torrentFileIndex) {
            currArrIdx = fi2;
            break;
          }
        }
      }
      if (currArrIdx >= 0 && currArrIdx + 1 < torrentFiles.length) {
        var cand = torrentFiles[currArrIdx + 1];
        if (cand && cand.name && !/\.(srt|nfo|txt|jpg|png|torrent)$/i.test(cand.name) && !/\bsample\b/i.test(cand.name)) {
          nextFile = cand;
          nextFile.season = targetNextS;
          nextFile.episode = extractEpNumber(cand.name, currArrIdx + 1, curSeason) || targetNextE;
          console.log('[Player] Next episode matched by file index from torrent files:', nextFile.name);
        }
      }
    }

    // 3. Dynamic resolution if nextFile not found in current torrent
    if (!nextFile && (params.type === 'tv' || sMatch || (movieId && curEpisode > 0))) {
      var nextSStr = (targetNextS < 10 ? '0' + targetNextS : String(targetNextS));
      var nextEStr = (targetNextE < 10 ? '0' + targetNextE : String(targetNextE));
      nextFile = {
        id: (torrentFileIndex >= 0 ? (torrentFileIndex + 1) : 1),
        name: (baseTitle || 'Сериал') + ' · S' + nextSStr + 'E' + nextEStr,
        season: targetNextS,
        episode: targetNextE,
        isDynamic: true
      };
      console.log('[Player] Next episode dynamically identified:', nextFile.name);
    }

    var btnNextNow = document.getElementById('btn-next-now');
    var btnNextCancel = document.getElementById('btn-next-cancel');

    if (btnNextNow) {
      btnNextNow.onclick = function() { playNextEpisode(); };
    }
    if (btnNextCancel) {
      btnNextCancel.onclick = function() { hideNextEpOverlay(true); };
    }

    currentSessionId = 'tv-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    if (sessionHeartbeatTimer) { clearInterval(sessionHeartbeatTimer); }
    sendSessionHeartbeat();
    sessionHeartbeatTimer = setInterval(function() {
      sendSessionHeartbeat();
      if (isPlaying) saveProgress();
    }, 3000);

    if ($osdTitle) $osdTitle.textContent = movieTitle;

    // Initialize Player Adapter
    if (typeof PlayerAdapter === 'function') {
      player = new PlayerAdapter('player');

      player.on('loaded', function() {
        console.log('[Player] Stream loaded');
        isPlaying = true;
        showFlash('▶', 'Воспроизведение');
        saveProgress();
      });

      player.on('playing', function() {
        isPlaying = true;
      });

      player.on('paused', function() {
        isPlaying = false;
        saveProgress();
      });

      player.on('ended', function() {
        isPlaying = false;
        saveProgress();
        if (nextFile) {
          playNextEpisode();
        }
      });

      player.on('timeUpdate', function(data) {
        if (isSeeking) return; // Ignore while user is actively seeking
        if (data && data.currentTime !== undefined) {
          currentTime = data.currentTime;
          updateTimelineUI();
          updateSubtitleDisplay();

          // Pre-caching next episode at duration - 90s
          if (duration > 180 && (duration - currentTime <= 90)) {
            triggerPrecacheNext();
          }

          // 30-second countdown for binge watching next episode (strictly guarded: video must be >3 min, played for >2 min, and remaining <= 30s)
          if (duration > 180 && currentTime > 120 && (duration - currentTime <= 30) && (duration - currentTime > 0)) {
            showNextEpOverlay();
          }
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

    // Bind click handlers for bottom transport buttons
    bindClick('btn-restart', function() {
      seekTo(0);
      showFlash('⏮', 'В начало');
    });
    bindClick('btn-rewind', function() {
      seekBy(-30);
    });
    bindClick('btn-play-pause', function() {
      togglePlay();
    });
    bindClick('btn-forward', function() {
      seekBy(30);
    });
    bindClick('btn-next', function() {
      if (nextFile) {
        playNextEpisode();
      } else if (duration > 0) {
        seekTo(duration - 2);
        showFlash('⏭', 'Конец');
      }
    });

    // Timeline click for mouse/pointer
    if ($timelineWrap) {
      $timelineWrap.addEventListener('click', function(e) {
        if (!duration) return;
        var rect = $timelineWrap.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        seekTo(pct * duration);
      });
    }

    // Resume from saved position (either params.start or playback_positions)
    var resumeTarget = 0;
    var isNextAutoplay = Boolean(params.isNextEpisodeAutoplay || (params.start === 0 && params.start !== undefined));
    if (isNextAutoplay) {
      resumeTarget = 0;
      console.log('[Player] Next episode autoplay: strictly starting from 0s');
    } else if (startParamSec > 10) {
      resumeTarget = startParamSec;
    } else if (movieId) {
      try {
        var positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
        var epMatch = (movieTitle || '').match(/·\s*S([0-9]+)\s*E([0-9]+)/i) || (movieTitle || '').match(/\bS([0-9]+)E([0-9]+)\b/i);
        var sNum = epMatch ? parseInt(epMatch[1], 10) : undefined;
        var eNum = epMatch ? parseInt(epMatch[2], 10) : undefined;
        var saved = null;
        if (sNum && eNum) {
          var epKey = movieId + '_s' + sNum + '_e' + eNum;
          saved = positions[epKey];
          if (!saved && positions[movieId]) {
            var posTitle = (positions[movieId].title && positions[movieId].title.name) || '';
            var posEpMatch = posTitle.match(/·\s*S([0-9]+)\s*E([0-9]+)/i) || posTitle.match(/\bS([0-9]+)E([0-9]+)\b/i);
            if (posEpMatch && parseInt(posEpMatch[1], 10) === sNum && parseInt(posEpMatch[2], 10) === eNum) {
              saved = positions[movieId];
            } else if (positions[movieId].title && positions[movieId].title.season === sNum && positions[movieId].title.episode === eNum) {
              saved = positions[movieId];
            }
          }
        } else if (mediaType !== 'tv') {
          saved = positions[movieId];
        }
        if (saved) {
          var sTime = Math.floor((typeof saved === 'object') ? (saved.time || saved.progress || 0) : saved);
          var sDur = Math.floor((typeof saved === 'object') ? (saved.duration || 0) : 0);
          // If video was completed (>90% watched or within 60s of end), start from 0!
          if (sDur > 120 && (sDur - sTime <= 60 || (sTime / sDur) > 0.90)) {
            console.log('[Player] Saved position is near the end, resetting to beginning');
            saved = null;
            resumeTarget = 0;
          } else if (sTime > 5) {
            resumeTarget = sTime;
          }
        }
      } catch(ex) {}
    }

    var hasResumed = false;
    // For HLS streams (e.g. AVI transcoding), pass start offset directly in initial URL to avoid double transcode start
    if (streamUrl && resumeTarget > 10 && streamUrl.indexOf('/api/torrents/hls') !== -1 && streamUrl.indexOf('start=') === -1) {
      var joinChar = streamUrl.indexOf('?') >= 0 ? '&' : '?';
      streamUrl = streamUrl + joinChar + 'start=' + resumeTarget;
      currentTime = resumeTarget;
      pendingSeekTarget = resumeTarget;
      hasResumed = true;
      console.log('[Player] Initial HLS stream URL configured with start offset:', resumeTarget, 's');
    }

    // Start playback
    if (streamUrl && player) {
      player.play(streamUrl);
      fetchDurationFromApi(streamUrl);
      loadTrackInfo(streamUrl);
      startBufferPolling();
    }

    if (resumeTarget > 10 && !hasResumed) {
      console.log('[Player] Target resume position:', resumeTarget, 'seconds');
      var executeResume = function() {
        if (hasResumed) return;
        var canSeek = false;
        if (player) {
          if (player.engineType === 'avplay') {
            try {
              var avSt = (typeof webapis !== 'undefined' && webapis.avplay) ? webapis.avplay.getState() : '';
              if (avSt === 'PLAYING') canSeek = true;
            } catch(e) {}
          } else {
            canSeek = !!player._isPlaying;
          }
        }
        if (canSeek) {
          hasResumed = true;
          if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
          console.log('[Player] Safe resume playback at target:', resumeTarget);
          showFlash('⏳', 'Переход к ' + fmtTime(resumeTarget) + '...');
          setTimeout(function() {
            seekTo(resumeTarget);
          }, 300);
        }
      };

      if (player) {
        player.on('playing', function() {
          if (!hasResumed) {
            setTimeout(executeResume, 800);
          }
        });
        player.on('timeUpdate', function(data) {
          if (!hasResumed && data && data.currentTime > 0.5) {
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
      }, 500);
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
  function updatePlayPauseButton() {
    var btn = document.getElementById('btn-play-pause');
    if (btn) {
      var activePlaying = (player && typeof player.isPlaying === 'function') ? player.isPlaying() : isPlaying;
      btn.innerHTML = activePlaying ? '❚❚ Пауза' : '▶ Пуск';
    }
  }

  function togglePlay() {
    if (!player) return;
    var activePlaying = (typeof player.isPlaying === 'function') ? player.isPlaying() : isPlaying;
    if (activePlaying) {
      try { player.pause(); } catch(e) { console.error('[Player] pause error:', e); }
      isPlaying = false;
      showFlash('❚❚', 'Пауза');
      showOsd(false); // keep OSD visible while paused
      updatePlayPauseButton();
      try { sendSessionHeartbeat(); } catch(he) {}
    } else {
      try { player.resume(); } catch(e) { console.error('[Player] resume error:', e); }
      isPlaying = true;
      showFlash('▶', 'Воспроизведение');
      showOsd(true); // auto-hide OSD
      updatePlayPauseButton();
      try { sendSessionHeartbeat(); } catch(he) {}
    }
  }

  function seekBy(delta, speedSuffix) {
    if (!player) return;

    if (!isSeeking) {
      isSeeking = true;
      seekBaseTime = currentTime;
      accumulatedDelta = 0;
    }

    accumulatedDelta += delta;
    var target = seekBaseTime + accumulatedDelta;
    if (target < 1.5) {
      target = 1.5;
      accumulatedDelta = Math.round(1.5 - seekBaseTime);
    }
    if (duration > 0 && target > duration - 2) {
      target = Math.max(1.5, duration - 2);
      accumulatedDelta = Math.round(target - seekBaseTime);
    }
    pendingSeekTarget = target;
    currentTime = target;

    updateTimelineUI(pendingSeekTarget);

    var sign = accumulatedDelta > 0 ? '+' : '';
    var arrow = delta < 0 ? '◄◄' : '►►';
    var speedText = speedSuffix ? (' (' + speedSuffix + ')') : '';
    showFlash(arrow, sign + accumulatedDelta + ' сек' + speedText + ' (' + fmtTime(pendingSeekTarget) + ')');
    showOsd(true);

    if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
    seekDebounceTimer = setTimeout(function() {
      var executeTarget = pendingSeekTarget;
      var curDelta = accumulatedDelta;
      console.log('[Player] Executing debounced seek to', executeTarget, 's, accumulated delta:', curDelta);

      var seekDoneTimer = setTimeout(function() {
        console.warn('[Player] Debounced seek safety timeout triggered, clearing isSeeking');
        isSeeking = false;
        accumulatedDelta = 0;
        seekBaseTime = 0;
      }, 4000);

      var onSeekFinished = function() {
        clearTimeout(seekDoneTimer);
        setTimeout(function() {
          isSeeking = false;
          accumulatedDelta = 0;
          seekBaseTime = 0;
        }, 300);
      };

      if (typeof player.seek === 'function' && curDelta !== 0 && (typeof player._currentUrl !== 'string' || player._currentUrl.indexOf('/api/torrents/hls') === -1)) {
        player.seek(curDelta, onSeekFinished, function(err) {
          console.warn('[Player] player.seek error, falling back to seekTo:', err);
          player.seekTo(executeTarget, onSeekFinished, onSeekFinished);
        });
      } else {
        player.seekTo(executeTarget, onSeekFinished, onSeekFinished);
      }
    }, 500);
  }

  function seekTo(target) {
    if (!player) return;
    if (target < 1.5) target = 1.5;
    if (duration > 0 && target > duration - 2) target = Math.max(1.5, duration - 2);
    currentTime = target;
    pendingSeekTarget = target;
    isSeeking = true;
    updateTimelineUI(target);
    var seekDoneTimer = setTimeout(function() {
      isSeeking = false;
      accumulatedDelta = 0;
      seekBaseTime = 0;
    }, 4000);
    player.seekTo(target, function() {
      clearTimeout(seekDoneTimer);
      setTimeout(function() {
        isSeeking = false;
        accumulatedDelta = 0;
        seekBaseTime = 0;
      }, 300);
    }, function() {
      clearTimeout(seekDoneTimer);
      setTimeout(function() {
        isSeeking = false;
        accumulatedDelta = 0;
        seekBaseTime = 0;
      }, 300);
    });
    showOsd(true);
  }

  // ========== Binge-Watching ==========

  function triggerPrecacheNext() {
    if (precacheSent || !nextFile || !torrentLink) return;
    precacheSent = true;
    console.log('[Player] Triggering server pre-cache for next episode index:', nextFile.id);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + '/api/downloads/server/precache-next', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    var token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('lumiere_access');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.send(JSON.stringify({
      link: torrentLink,
      fileIndex: nextFile.id
    }));
  }

  function showNextEpOverlay() {
    if (nextEpOverlayVisible || nextEpDismissed) return;
    if (!duration || duration <= 180 || currentTime < 120) return;
    if (duration - currentTime > 30 || duration - currentTime <= 0) return;
    if (!nextFile) {
      // If nextFile was not set yet, attempt dynamic resolution right now from title / state
      var pTitle = (typeof movieTitle === 'string') ? movieTitle : '';
      var sMatch = pTitle.match(/·\s*S([0-9]+)\s*E([0-9]+)/i) || pTitle.match(/\bS([0-9]+)E([0-9]+)\b/i) || pTitle.match(/\b([0-9]+)x([0-9]+)\b/i);
      var curS = sMatch ? parseInt(sMatch[1], 10) : 1;
      var curE = sMatch ? parseInt(sMatch[2], 10) : 1;
      if (!sMatch && movieId) {
        try {
          var ltObj = JSON.parse(localStorage.getItem('last_torrents') || '{}')[movieId];
          if (ltObj && ltObj.episode) {
            curS = parseInt(ltObj.season || 1, 10);
            curE = parseInt(ltObj.episode, 10);
            sMatch = true;
          }
        } catch(ex) {}
      }
      if (sMatch || mediaType === 'tv') {
        var nextE = curE + 1;
        var nextSStr = (curS < 10 ? '0' + curS : String(curS));
        var nextEStr = (nextE < 10 ? '0' + nextE : String(nextE));
        var baseTitle = pTitle.replace(/\s*·\s*S\d+.*$/i, '').trim() || 'Сериал';
        nextFile = {
          id: (torrentFileIndex >= 0 ? (torrentFileIndex + 1) : 1),
          name: baseTitle + ' · S' + nextSStr + 'E' + nextEStr,
          season: curS,
          episode: nextE,
          isDynamic: true
        };
        console.log('[Player] Next episode dynamically resolved on-the-fly for overlay:', nextFile.name);
      }
    }
    if (!nextFile) return;

    nextEpOverlayVisible = true;
    nextEpBtnIndex = 0;
    var $overlay = document.getElementById('next-ep-overlay');
    if (!$overlay) {
      var ovHtml = document.createElement('div');
      ovHtml.id = 'next-ep-overlay';
      ovHtml.className = 'next-ep-overlay';
      ovHtml.innerHTML = 
        '<div class="next-ep-card">' +
          '<div class="next-ep-badge">СЛЕДУЮЩАЯ СЕРИЯ ЧЕРЕЗ</div>' +
          '<div id="next-ep-countdown" class="next-ep-timer">30</div>' +
          '<div id="next-ep-title" class="next-ep-name">' + (nextFile.name || 'Следующая серия') + '</div>' +
          '<div class="next-ep-actions">' +
            '<button id="btn-next-now" class="next-ep-btn primary" tabindex="0">\u25b6 Включить сейчас (OK)</button>' +
            '<button id="btn-next-cancel" class="next-ep-btn secondary" tabindex="0">\u2715 Отмена</button>' +
          '</div>' +
        '</div>';
      var pl = document.getElementById('player') || document.body;
      pl.appendChild(ovHtml);
      $overlay = ovHtml;
    }

    var $name = document.getElementById('next-ep-title');
    var $timer = document.getElementById('next-ep-countdown');
    if ($name) $name.textContent = nextFile.name || 'Следующая серия';
    if ($overlay) {
      $overlay.classList.remove('hidden');
      $overlay.style.display = 'flex';
      $overlay.style.zIndex = '9999';
    }

    var remaining = Math.max(1, Math.min(30, Math.round(duration - currentTime)));
    if ($timer) $timer.textContent = String(remaining);

    if (nextEpInterval) clearInterval(nextEpInterval);
    nextEpInterval = setInterval(function() {
      remaining--;
      if ($timer) $timer.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(nextEpInterval);
        nextEpInterval = null;
        playNextEpisode();
      }
    }, 1000);

    updateNextEpButtons();
  }

  function hideNextEpOverlay(permanent) {
    nextEpOverlayVisible = false;
    if (permanent) nextEpDismissed = true;
    if (nextEpInterval) {
      clearInterval(nextEpInterval);
      nextEpInterval = null;
    }
    var $overlay = document.getElementById('next-ep-overlay');
    if ($overlay) {
      $overlay.classList.add('hidden');
      $overlay.style.display = 'none';
    }
  }

  function updateNextEpButtons() {
    var btnNextNow = document.getElementById('btn-next-now');
    var btnNextCancel = document.getElementById('btn-next-cancel');
    if (btnNextNow) btnNextNow.classList.remove('focused');
    if (btnNextCancel) btnNextCancel.classList.remove('focused');
    if (nextEpBtnIndex === 0 && btnNextNow) btnNextNow.classList.add('focused');
    if (nextEpBtnIndex === 1 && btnNextCancel) btnNextCancel.classList.add('focused');
  }

  function playNextEpisode() {
    if (!nextFile) return;
    console.log('[Player] Playing next episode:', nextFile);
    hideNextEpOverlay(true);
    showFlash('▶', 'Следующая серия...');

    var nextSeason = nextFile.season || curSeason || 1;
    var nextEpisode = nextFile.episode || (curEpisode ? curEpisode + 1 : 2);
    var cleanBase = (movieTitle || '').replace(/\s*·\s*S\d+.*$/i, '').trim();
    var nextSStr = (nextSeason < 10 ? '0' + nextSeason : String(nextSeason));
    var nextEStr = (nextEpisode < 10 ? '0' + nextEpisode : String(nextEpisode));
    var epName = (cleanBase ? (cleanBase + ' · S' + nextSStr + 'E' + nextEStr) : '') || nextFile.name || ('Серия ' + nextEpisode);

    // 1. If current torrent already has the next file, play it!
    if (!nextFile.isDynamic && torrentLink && nextFile.id !== undefined) {
      destroyPlayer();

      if (typeof window.playFile === 'function') {
        window.playFile(nextFile, epName, movieId, posterUrl, torrentFiles, 0);
        return;
      }

      var isAvplay = (typeof webapis !== 'undefined' && webapis.avplay !== null && webapis.avplay !== undefined) || (typeof tizen !== 'undefined');
      var torrPort = '8590';
      var torrHost = API ? API.replace(/:\d+$/, ':' + torrPort) : ('http://' + (window.location.hostname || '192.168.1.196') + ':' + torrPort);
      var streamUrl = '';
      if (isAvplay) {
        var torrFileName = nextFile.name || 'video.mkv';
        streamUrl = torrHost + '/stream/' + encodeURIComponent(torrFileName) + '?link=' + encodeURIComponent(torrentLink) + '&index=' + nextFile.id + '&play';
      } else {
        streamUrl = API + '/api/torrents/proxy/video.mkv?link=' + encodeURIComponent(torrentLink) + '&index=' + nextFile.id + '&play';
      }

      var openOpts = {
        url: streamUrl,
        title: epName,
        id: movieId,
        type: 'tv',
        poster: posterUrl,
        link: torrentLink,
        fileIndex: nextFile.id,
        files: torrentFiles,
        start: 0,
        isNextEpisodeAutoplay: true
      };
      if (typeof window.openPlayer === 'function') {
        window.openPlayer(openOpts);
      } else if (typeof window.initPlayer === 'function') {
        window.initPlayer(openOpts);
      }
      return;
    }

    // 2. Dynamic next episode resolution across seasons or torrent releases
    if (typeof window.playSeasonEpisode === 'function' && movieId && nextSeason && nextEpisode) {
      destroyPlayer();
      window.playSeasonEpisode(
        { id: movieId, name: cleanBase, title: cleanBase, poster: posterUrl },
        nextSeason,
        { episode: nextEpisode, episode_number: nextEpisode, title: 'Серия ' + nextEpisode },
        posterUrl,
        true
      );
      return;
    }
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

    if (autoHide && isPlaying && !popupOpen) {
      var timeoutMs = (timelineFocused || bottomControlsFocused || topMenuFocused) ? 7000 : 4000;
      osdTimer = setTimeout(function() {
        if (!popupOpen) {
          clearAllFocus();
          hideOsd();
        }
      }, timeoutMs);
    }
  }

  function hideOsd() {
    if (popupOpen || topMenuFocused || timelineFocused || bottomControlsFocused || !isPlaying) return;
    osdVisible = false;
    clearAllFocus();
    if ($osd) $osd.classList.add('hide');
  }

  function forceHideOsd() {
    clearAllFocus();
    osdVisible = false;
    if (osdTimer) {
      clearTimeout(osdTimer);
      osdTimer = null;
    }
    if ($osd) $osd.classList.add('hide');
  }

  function clearAllFocus() {
    topMenuFocused = false;
    timelineFocused = false;
    bottomControlsFocused = false;
    clearTopMenuFocus();
    clearBottomControlsFocus();
    blurTimeline();
  }

  // ========== Top Action Buttons Focus ==========
  function focusTopMenu(idx) {
    topMenuFocused = true;
    timelineFocused = false;
    bottomControlsFocused = false;
    blurTimeline();
    clearBottomControlsFocus();
    if (typeof idx === 'number') topBtnIndex = idx;
    showOsd(true);
    updateTopMenuFocus();
  }

  function blurTopMenu() {
    topMenuFocused = false;
    clearTopMenuFocus();
  }

  function clearTopMenuFocus() {
    for (var i = 0; i < topBtns.length; i++) {
      if (topBtns[i]) {
        topBtns[i].classList.remove('focused');
        try { topBtns[i].blur(); } catch(e) {}
      }
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

  // ========== Timeline Track Focus (Ползунок дорожки) ==========
  function focusTimeline() {
    timelineFocused = true;
    topMenuFocused = false;
    bottomControlsFocused = false;
    clearTopMenuFocus();
    clearBottomControlsFocus();
    showOsd(true);
    updateTimelineFocus();
  }

  function blurTimeline() {
    timelineFocused = false;
    if ($timelineWrap) {
      $timelineWrap.classList.remove('focused');
      try { $timelineWrap.blur(); } catch(e) {}
    }
    if ($timelineRow) $timelineRow.classList.remove('focused');
  }

  function updateTimelineFocus() {
    if ($timelineWrap) {
      $timelineWrap.classList.add('focused');
      try { $timelineWrap.focus(); } catch(e) {}
    }
    if ($timelineRow) {
      $timelineRow.classList.add('focused');
    }
  }

  function handleTimelineSeek(dir) {
    var now = Date.now();
    if (lastSeekDirection === dir && (now - lastSeekKeyTime) < 420) {
      seekHoldCount++;
    } else {
      seekHoldCount = 1;
      lastSeekDirection = dir;
    }
    lastSeekKeyTime = now;

    var step = 10;
    var speedStr = '';
    if (seekHoldCount >= 28) {
      step = 120;
      speedStr = 'x12';
    } else if (seekHoldCount >= 18) {
      step = 60;
      speedStr = 'x6';
    } else if (seekHoldCount >= 10) {
      step = 30;
      speedStr = 'x3';
    } else if (seekHoldCount >= 5) {
      step = 15;
      speedStr = 'x1.5';
    } else {
      step = 10;
      speedStr = '';
    }

    seekBy(dir * step, speedStr);
  }

  // ========== Bottom Transport Controls Focus ==========
  function focusBottomControls(idx) {
    bottomControlsFocused = true;
    timelineFocused = false;
    topMenuFocused = false;
    blurTimeline();
    clearTopMenuFocus();
    if (typeof idx === 'number') bottomBtnIndex = idx;
    showOsd(true);
    updateBottomControlsFocus();
  }

  function blurBottomControls() {
    bottomControlsFocused = false;
    clearBottomControlsFocus();
  }

  function clearBottomControlsFocus() {
    for (var i = 0; i < bottomBtns.length; i++) {
      if (bottomBtns[i]) {
        bottomBtns[i].classList.remove('focused');
        try { bottomBtns[i].blur(); } catch(e) {}
      }
    }
  }

  function updateBottomControlsFocus() {
    clearBottomControlsFocus();
    if (bottomBtnIndex < 0) bottomBtnIndex = 0;
    if (bottomBtnIndex >= bottomBtns.length) bottomBtnIndex = bottomBtns.length - 1;

    var btn = bottomBtns[bottomBtnIndex];
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
    if (!url) return;

    // Check if this is a server download stream
    var dlMatch = url.match(/\/api\/downloads\/server\/stream\/([^\/\?]+)/);
    if (dlMatch) {
      var dlId = dlMatch[1];
      var xhrDl = new XMLHttpRequest();
      xhrDl.open('GET', API + '/api/downloads/server/info/' + encodeURIComponent(dlId), true);
      xhrDl.timeout = 10000;
      var tok = localStorage.getItem(TOKEN_KEY);
      if (tok) xhrDl.setRequestHeader('Authorization', 'Bearer ' + tok);
      xhrDl.onload = function() {
        if (xhrDl.status === 200) {
          try {
            var dInfo = JSON.parse(xhrDl.responseText);
            if (dInfo && dInfo.duration && dInfo.duration > 0) {
              duration = dInfo.duration;
              if (player && typeof player.setDuration === 'function') {
                player.setDuration(duration);
              }
              if ($timeTotal) $timeTotal.textContent = fmtTime(duration);
            }
            if (dInfo && dInfo.audioTracks && dInfo.audioTracks.length > 0 && player) {
              player.audioTracks = dInfo.audioTracks;
            }
            if (dInfo && dInfo.subtitleTracks && dInfo.subtitleTracks.length > 0 && player) {
              player.subtitleTracks = dInfo.subtitleTracks;
            }
          } catch(e) {}
        }
      };
      xhrDl.send();
      return;
    }

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
    if (mediaType === 'iptv' || !movieId || isNaN(Number(movieId)) || Number(movieId) <= 0) return;
    var saveId = Number(movieId);
    if (!saveId) return;
    var now = Date.now();
    try {
      localStorage.setItem('last_watched_id', String(saveId));
      var pos = JSON.parse(localStorage.getItem('playback_positions') || '{}');
      var existingPoster = (pos[saveId] && pos[saveId].title && pos[saveId].title.poster) || '';
      var savePoster = posterUrl || existingPoster || '';
      var epMatch = (movieTitle || '').match(/·\s*S([0-9]+)\s*E([0-9]+)/i) || (movieTitle || '').match(/\bS([0-9]+)E([0-9]+)\b/i);
      var sNum = epMatch ? parseInt(epMatch[1], 10) : undefined;
      var eNum = epMatch ? parseInt(epMatch[2], 10) : undefined;
      var saveTime = Math.round(currentTime || 0);
      if (saveTime < 3) return; // Do not save or overwrite progress before playback actually starts
      var effectiveTime = saveTime;

      if (epMatch) {
        var epKey = saveId + '_s' + sNum + '_e' + eNum;
        pos[epKey] = {
          time: effectiveTime,
          duration: Math.round(duration || (pos[epKey] && pos[epKey].duration) || 0),
          timestamp: now,
          title: { name: movieTitle, poster: savePoster, id: saveId, type: mediaType, season: sNum, episode: eNum }
        };
      }
      pos[saveId] = {
        time: effectiveTime,
        duration: Math.round(duration || (pos[saveId] && pos[saveId].duration) || 0),
        timestamp: now,
        title: { name: movieTitle, poster: savePoster, id: saveId, type: mediaType, season: sNum, episode: eNum }
      };
      localStorage.setItem('playback_positions', JSON.stringify(pos));

      // Also persist season and episode and timestamp to last_torrents
      try {
        var lastT = JSON.parse(localStorage.getItem('last_torrents') || '{}');
        if (!lastT[saveId]) lastT[saveId] = {};
        lastT[saveId].timestamp = now;
        if (sNum) lastT[saveId].season = sNum;
        if (eNum) lastT[saveId].episode = eNum;
        if (sNum) {
          localStorage.setItem('last_season_' + saveId, String(sNum));
        }
        if (eNum) {
          localStorage.setItem('last_episode_' + saveId, String(eNum));
        }
      } catch(ltErr) {}

      // Check if episode watched (>= 85% or within 60s of end)
      if (sNum && eNum && duration > 60) {
        var pctWatched = (effectiveTime / duration);
        if (pctWatched >= 0.85 || (duration - effectiveTime <= 60)) {
          try {
            var wKey = 'watched_episodes_' + saveId;
            var wList = JSON.parse(localStorage.getItem(wKey) || '[]');
            var epTag = sNum + '_' + eNum;
            if (wList.indexOf(epTag) === -1) {
              wList.push(epTag);
              localStorage.setItem(wKey, JSON.stringify(wList));
            }
          } catch(we) {}
        }
      }

      // Also persist to server history via /api/sync/progress if progress > 2
      if (effectiveTime > 2) {
        var token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token') || localStorage.getItem('lumiere_access') || '';
        var hXhr = new XMLHttpRequest();
        hXhr.open('POST', (API || '') + '/api/sync/progress', true);
        hXhr.setRequestHeader('Content-Type', 'application/json');
        if (token) hXhr.setRequestHeader('Authorization', 'Bearer ' + token);
        hXhr.send(JSON.stringify({
          tmdbId: saveId,
          mediaType: mediaType || 'movie',
          titleName: movieTitle || ('Медиа #' + saveId),
          poster: savePoster,
          progress: effectiveTime,
          timestamp: now
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
          if (res && res.commands && res.commands.length > 0) {
            for (var ci = 0; ci < res.commands.length; ci++) {
              var rawCmd = res.commands[ci];
              var cmd = (typeof rawCmd === 'object' && rawCmd.action) ? rawCmd.action : rawCmd;
              console.log('[Player] Executing remote command from backend/telegram:', cmd);
              if (cmd === 'pause') {
                if (player && typeof player.pause === 'function') player.pause();
                else if (isPlaying) togglePlay();
                showFlash('⏸', 'Пауза (Telegram)');
              } else if (cmd === 'play') {
                if (player && typeof player.play === 'function') player.play();
                else if (!isPlaying) togglePlay();
                showFlash('▶', 'Пуск (Telegram)');
              } else if (cmd === 'toggle' || cmd === 'toggle_play') {
                togglePlay();
                showFlash(isPlaying ? '⏸' : '▶', (isPlaying ? 'Пауза' : 'Пуск') + ' (Telegram)');
              } else if (cmd === 'forward') {
                seekBy(30);
                showFlash('⏩', '+30 сек (Telegram)');
              } else if (cmd === 'rewind') {
                seekBy(-30);
                showFlash('⏪', '-30 сек (Telegram)');
              } else if (cmd === 'seek') {
                var sVal = (typeof rawCmd === 'object' && rawCmd.value !== undefined) ? Number(rawCmd.value) : 30;
                seekBy(sVal);
                showFlash(sVal > 0 ? '⏩' : '⏪', (sVal > 0 ? ('+' + sVal) : sVal) + ' сек (Telegram)');
              } else if (cmd === 'stop') {
                goBack();
              }
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
    try { saveProgress(); } catch(e1) {}
    try { destroyPlayer(); } catch(e2) { console.error('[Player] destroyPlayer error:', e2); }
    if (typeof window.closePlayer === 'function') {
      try {
        window.closePlayer();
      } catch(e3) {
        console.error('[Player] window.closePlayer error:', e3);
      }
    }
  }

  // ========== Destroy Player Lifecycle ==========
  function destroyPlayer() {
    try {
      stopSession();
      if (bufferTimer) { clearInterval(bufferTimer); bufferTimer = null; }
      if (iptvStatsTimer) { clearInterval(iptvStatsTimer); iptvStatsTimer = null; }
      if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
      if (osdTimer) { clearTimeout(osdTimer); osdTimer = null; }
      if (centerFlashTimer) { clearTimeout(centerFlashTimer); centerFlashTimer = null; }
      if (seekDebounceTimer) { clearTimeout(seekDebounceTimer); seekDebounceTimer = null; }
      if (nextEpInterval) { clearInterval(nextEpInterval); nextEpInterval = null; }
      nextEpOverlayVisible = false;
      nextEpDismissed = false;
      var $nextOv = document.getElementById('next-ep-overlay');
      if ($nextOv) {
        $nextOv.classList.add('hidden');
        $nextOv.style.display = 'none';
      }
      isSeeking = false;
      pendingSeekTarget = 0;
      accumulatedDelta = 0;
      seekBaseTime = 0;

      if (player) {
        try { player.stop(); } catch(e) {}
        player = null;
      }

      if (typeof webapis !== 'undefined' && webapis.avplay) {
        try { webapis.avplay.stop(); } catch(e) {}
        try { webapis.avplay.close(); } catch(e) {}
      }

      isPlaying = false;
      clearAllFocus();
      popupOpen = false;
      movieTitle = '';
      movieId = 0;
      streamUrl = '';
      currentTime = 0;
      duration = 0;
    } catch(err) {
      console.error('[Player] destroyPlayer caught error:', err);
    }
  }
  window.destroyPlayer = destroyPlayer;
  window.startIptvPolling = startIptvPolling;
  window.updateIptvStatsUI = updateIptvStatsUI;

  // ========== Single Master Key Handler (Delegated from tv.js) ==========
  window.handlePlayerKey = function(code, key, e) {
    try {
      // 0. Next Episode Autoplay Overlay navigation
      if (nextEpOverlayVisible) {
        if (code === 37 || key === 'ArrowLeft' || code === 38 || key === 'ArrowUp') {
          nextEpBtnIndex = 0;
          updateNextEpButtons();
          return;
        }
        if (code === 39 || key === 'ArrowRight' || code === 40 || key === 'ArrowDown') {
          nextEpBtnIndex = 1;
          updateNextEpButtons();
          return;
        }
        if (code === 13 || code === 29443 || code === 65385 || code === 65376 ||
            key === 'Enter' || key === 'Select' || key === 'Ok' || key === 'OK') {
          if (nextEpBtnIndex === 0) {
            playNextEpisode();
          } else {
            hideNextEpOverlay(true);
          }
          return;
        }
        if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
          hideNextEpOverlay(true);
          return;
        }
      }

      // 1. Back / Return / Escape Key
      if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
        if (popupOpen) {
          closePopup();
        } else if (timelineFocused || bottomControlsFocused || topMenuFocused) {
          forceHideOsd();
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

      // --- When Track Popup Is Open (Audio / Subtitles) ---
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

      // --- When Player / OSD Is Hidden During Playback ---
      // User request: "если во время просмотра плеер спрятан и я нажимаю любую кнопку кроме ок, то он появляется"
      if (!osdVisible) {
        if (isEnter) {
          togglePlay();
          return;
        }
        // Any other key wakes up and reveals the player OSD in clean neutral state!
        showOsd(true);
        clearAllFocus();
        lastVerticalNavTime = Date.now();
        return;
      }

      // Vertical navigation debounce to prevent remote hardware bounce skipping the timeline track!
      if (isUp || isDown) {
        var nowNav = Date.now();
        if (nowNav - lastVerticalNavTime < 240) {
          return;
        }
        lastVerticalNavTime = nowNav;
      }

      // --- State A: When Top Menu Buttons Are Focused (Back / Audio / CC) ---
      if (topMenuFocused) {
        showOsd(true);
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
          // Down from top menu moves focus to Timeline Track!
          lastVerticalNavTime = Date.now();
          focusTimeline();
          return;
        }
        if (isUp) {
          forceHideOsd();
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

      // --- State B: When Timeline Track Is Focused (Ползунок дорожки) ---
      if (timelineFocused) {
        showOsd(true);
        if (isLeft || isRight) {
          // Scrub timeline
          handleTimelineSeek(isLeft ? -1 : 1);
          return;
        }
        if (isDown) {
          // User request: "нажимаю еще раз вниз и попадаю на кнопки управления плеера"
          lastVerticalNavTime = Date.now();
          focusBottomControls(bottomBtnIndex !== undefined ? bottomBtnIndex : 2);
          return;
        }
        if (isUp) {
          // Up from timeline moves focus to Top Menu
          lastVerticalNavTime = Date.now();
          focusTopMenu(topBtnIndex !== undefined ? topBtnIndex : 0);
          return;
        }
        if (isEnter) {
          togglePlay();
          return;
        }
        return;
      }

      // --- State C: When Bottom Transport Controls Are Focused (Кнопки управления) ---
      if (bottomControlsFocused) {
        showOsd(true);
        if (isLeft) {
          if (bottomBtnIndex > 0) {
            bottomBtnIndex--;
            updateBottomControlsFocus();
          }
          return;
        }
        if (isRight) {
          if (bottomBtnIndex < bottomBtns.length - 1) {
            bottomBtnIndex++;
            updateBottomControlsFocus();
          }
          return;
        }
        if (isUp) {
          // User request: "когда из кнопок управления плеера нажимаю вверх... надо чтобы на дорожку"
          lastVerticalNavTime = Date.now();
          focusTimeline();
          return;
        }
        if (isDown) {
          // Down from bottom controls hides the OSD
          forceHideOsd();
          return;
        }
        if (isEnter) {
          if (bottomBtns[bottomBtnIndex]) {
            bottomBtns[bottomBtnIndex].click();
          }
          return;
        }
        return;
      }

      // --- State D: Neutral Visible OSD (OSD is shown, nothing focused yet) ---
      showOsd(true);

      if (isEnter) {
        togglePlay();
        return;
      }

      if (isDown) {
        // User request: "я нажимаю вниз попадаю на дорожку"
        lastVerticalNavTime = Date.now();
        focusTimeline();
        return;
      }

      if (isUp) {
        // Up in neutral also focuses timeline track
        lastVerticalNavTime = Date.now();
        focusTimeline();
        return;
      }

      if (isLeft || isRight) {
        // Left/Right scrubbing also focuses the timeline track so user sees the thumb moving!
        focusTimeline();
        handleTimelineSeek(isLeft ? -1 : 1);
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
