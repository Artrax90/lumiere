// Lumiere TV Player — Samsung AVPlay API
(function() {
  'use strict';

  var API = '';
  var TOKEN_KEY = 'lumiere_access';
  var SERVER_KEY = 'lumiere_server';

  var avplay = null;
  var isPlaying = false;
  var currentTime = 0;
  var duration = 0;
  var osdTimer = null;

  // DOM refs
  var $container, $video, $osd, $title, $bar, $fill, $time;

  // ========== Init ==========
  window.addEventListener('DOMContentLoaded', function() {
    $container = document.getElementById('player');
    $video = document.getElementById('video');
    $osd = document.getElementById('player-osd');
    $title = document.getElementById('player-title');
    $bar = document.getElementById('player-bar');
    $fill = document.getElementById('player-fill');
    $time = document.getElementById('player-time');

    var server = localStorage.getItem(SERVER_KEY);
    if (server) API = server;

    // Get params from URL (manual parsing for Chrome 56 compatibility)
    var search = window.location.search.substring(1);
    var params = {};
    search.split('&').forEach(function(pair) {
      var parts = pair.split('=');
      if (parts.length === 2) params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
    var url = params.url;
    var title = params.title || '';

    if (url) {
      playVideo(url, title);
    } else {
      $title.textContent = 'Нет URL для воспроизведения';
    }

    setupControls();
  });

  // ========== Playback ==========
  function playVideo(url, title) {
    $title.textContent = title;

    // Try AVPlay first (Samsung TV)
    if (typeof webapis !== 'undefined' && webapis.avplay) {
      playWithAvplay(url);
    } else {
      playWithVideo(url);
    }
  }

  function playWithAvplay(url) {
    try {
      avplay = webapis.avplay;

      // Create AVPlay object
      var obj = document.createElement('object');
      obj.type = 'application/avplayer';
      obj.style.position = 'absolute';
      obj.style.top = '0';
      obj.style.left = '0';
      obj.style.width = '100%';
      obj.style.height = '100%';
      $container.appendChild(obj);

      avplay.open(url);
      avplay.setDisplayRect(0, 0, window.innerWidth, window.innerHeight);

      avplay.setListener({
        onstreamcompleted: function() {
          isPlaying = false;
          updateOsd();
        },
        oncurrentplaytime: function(time) {
          currentTime = time / 1000;
          updateOsd();
        },
        onbufferingcomplete: function() {
          // Get duration
          try {
            var info = avplay.getStreamingProperty('DURATION_INFO');
            if (info) duration = parseInt(info) / 1000;
          } catch(e) {}
        }
      });

      avplay.prepareAsync(function() {
        avplay.play();
        isPlaying = true;
        showOsd();
      });

    } catch(e) {
      console.error('[Player] AVPlay error:', e);
      // Fallback to video element
      playWithVideo(url);
    }
  }

  function playWithVideo(url) {
    $video.style.display = 'block';
    $video.src = url;
    $video.play().then(function() {
      isPlaying = true;
    }).catch(function(e) {
      console.error('[Player] Video error:', e);
    });

    $video.ontimeupdate = function() {
      currentTime = $video.currentTime;
      duration = $video.duration || 0;
      updateOsd();
    };

    $video.onended = function() {
      isPlaying = false;
      updateOsd();
    };
  }

  // ========== OSD ==========
  function updateOsd() {
    if ($fill) {
      var pct = duration > 0 ? (currentTime / duration * 100) : 0;
      $fill.style.width = pct + '%';
    }
    if ($time) {
      $time.textContent = formatTime(currentTime) + ' / ' + formatTime(duration);
    }
  }

  function showOsd() {
    if ($osd) $osd.style.opacity = '1';
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(function() {
      if ($osd) $osd.style.opacity = '0';
    }, 3000);
  }

  // ========== Controls ==========
  function setupControls() {
    document.addEventListener('keydown', function(e) {
      showOsd();

      switch (e.keyCode) {
        case 13: // Enter — play/pause
          togglePlay();
          e.preventDefault();
          break;
        case 37: // Left — seek back 10s
          seek(-10);
          e.preventDefault();
          break;
        case 39: // Right — seek forward 10s
          seek(10);
          e.preventDefault();
          break;
        case 38: // Up — seek forward 60s
          seek(60);
          e.preventDefault();
          break;
        case 40: // Down — seek back 60s
          seek(-60);
          e.preventDefault();
          break;
        case 10009: // Back — exit player
          stopPlayback();
          e.preventDefault();
          break;
      }
    });
  }

  function togglePlay() {
    if (avplay) {
      if (isPlaying) {
        avplay.pause();
        isPlaying = false;
      } else {
        avplay.play();
        isPlaying = true;
      }
    } else if ($video) {
      if ($video.paused) {
        $video.play();
        isPlaying = true;
      } else {
        $video.pause();
        isPlaying = false;
      }
    }
    updateOsd();
  }

  function seek(seconds) {
    if (avplay) {
      var newTime = Math.max(0, (currentTime * 1000) + (seconds * 1000));
      avplay.seekTo(newTime);
    } else if ($video) {
      $video.currentTime = Math.max(0, $video.currentTime + seconds);
    }
    showOsd();
  }

  function stopPlayback() {
    if (avplay) {
      try { avplay.stop(); avplay.close(); } catch(e) {}
    } else if ($video) {
      $video.pause();
      $video.src = '';
    }
    // Close player window
    try { window.close(); } catch(e) {}
    // Fallback: go back
    window.history.back();
  }

  // ========== Utilities ==========
  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = Math.floor(s % 60);
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    if (h > 0) return h + ':' + pad(m) + ':' + pad(sec);
    return m + ':' + pad(sec);
  }
})();
