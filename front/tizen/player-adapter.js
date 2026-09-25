// Lumiere Player Adapter — unified playback interface
// Samsung TV: webapis.avplay | Browser: HTML5 video
(function() {
  'use strict';

  // ========== Platform Detection ==========
  function isTizen() {
    var hasWebapis = typeof webapis !== 'undefined';
    var hasAvplay = hasWebapis && webapis.avplay !== null && webapis.avplay !== undefined;
    var hasTizen = typeof tizen !== 'undefined';
    var hasWebOS = typeof webOS !== 'undefined';
    console.log('[PlayerAdapter] Platform check:');
    console.log('  typeof webapis:', typeof webapis);
    console.log('  typeof tizen:', typeof tizen);
    console.log('  typeof webOS:', typeof webOS);
    console.log('  hasWebapis:', hasWebapis);
    console.log('  hasAvplay:', hasAvplay);
    if (hasWebapis) {
      console.log('  webapis keys:', Object.keys(webapis).join(', '));
      console.log('  webapis.avplay type:', typeof webapis.avplay);
    }
    console.log('  userAgent:', navigator.userAgent.substring(0, 100));
    return hasAvplay;
  }

  // ========== Player Adapter ==========
  function PlayerAdapter(containerId) {
    this.container = document.getElementById(containerId);
    this.engine = null;
    this.engineType = 'none'; // 'avplay' | 'video' | 'none'
    this.listeners = {};
    this.audioTracks = [];
    this.subtitleTracks = [];
    this.currentAudio = 0;
    this.currentSubtitle = -1;
    this._duration = 0;
    this._currentTime = 0;
    this._isPlaying = false;
    this._isSeeking = false;
    this._avplayObj = null;
  }

  PlayerAdapter.prototype.on = function(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  };

  PlayerAdapter.prototype._emit = function(event, data) {
    var cbs = this.listeners[event];
    if (cbs) {
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](data); } catch(e) { console.error('[Player] Listener error:', e); }
      }
    }
  };

  // ========== Play ==========
  PlayerAdapter.prototype.play = function(url) {
    console.log('[PlayerAdapter] play called, isTizen:', isTizen(), 'webapis:', typeof webapis);
    if (isTizen()) {
      console.log('[PlayerAdapter] Using AVPlay engine');
      this._playAvplay(url);
    } else {
      console.log('[PlayerAdapter] Using HTML5 video engine');
      this._playVideo(url);
    }
  };

  // ========== AVPlay Engine ==========
  PlayerAdapter.prototype._playAvplay = function(url) {
    var self = this;
    self._currentUrl = url;
    console.log('[AVPlay] Starting playback:', url.substring(0, 100));
    try {
      if (this.container) {
        this.container.style.background = 'transparent';
        this.container.style.backgroundColor = 'transparent';
      }
      try {
        webapis.avplay.stop();
        webapis.avplay.close();
      } catch(ex) {}

      webapis.avplay.open(url);
      console.log('[AVPlay] Stream opened');

      try {
        webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
      } catch(dme) {}

      try {
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
        console.log('[AVPlay] Display rect set to 1920x1080');
      } catch(dre) {
        console.warn('[AVPlay] setDisplayRect error:', dre);
      }

      // Set listener for events with all required callback stubs
      webapis.avplay.setListener({
        onstreamcompleted: function() {
          self._isPlaying = false;
          self._emit('ended');
        },
        oncurrentplaytime: function(time) {
          if (self._isSeeking) return;
          self._currentTime = time / 1000;
          self._emit('timeUpdate', { currentTime: self._currentTime });
        },
        onbufferingstart: function() {
          self._emit('bufferingStart');
        },
        onbufferingprogress: function(percent) {
          self._emit('bufferingProgress', { percent: percent });
        },
        onbufferingcomplete: function() {
          self._emit('bufferingEnd');
          // Get duration
          try {
            var info = webapis.avplay.getStreamingProperty('DURATION_INFO');
            if (info) {
              self._duration = parseInt(info) / 1000;
              self._emit('durationChange', { duration: self._duration });
            }
          } catch(e) {}
        },
        onerror: function(error) {
          console.error('[AVPlay] Error:', error);
          if (typeof window.sendTvLog === 'function') {
            window.sendTvLog('error', 'avplay', 'AVPlay hardware error: ' + error, { url: self.currentUrl });
          }
          self._emit('error', { message: error });
        },
        onevent: function(eventType, eventData) {
          console.log('[AVPlay] onEvent:', eventType, eventData);
          if (eventType === 'PLAYER_MSG_BUFFERING_START' || eventType === 'PLAYER_MSG_NONE_SKIP') {
            if (typeof window.sendTvLog === 'function') {
              window.sendTvLog('warn', 'avplay', 'Buffering event: ' + eventType, { data: eventData });
            }
          }
        },
        onsubtitlechange: function(duration, text) {
          console.log('[AVPlay] onSubtitleChange:', text);
        },
        ondrmevent: function(drmEvent, drmData) {}
      });

      // Prepare and play with both success and error callbacks
      webapis.avplay.prepareAsync(function() {
        self.engineType = 'avplay';
        self._isPlaying = true;
        self._emit('loaded');

        // Get audio tracks
        try {
          var info = webapis.avplay.getTotalTrackInfo();
          if (info) {
            self.audioTracks = [];
            self.subtitleTracks = [];
            for (var i = 0; i < info.length; i++) {
              var track = info[i];
              if (track.type === 'AUDIO') {
                self.audioTracks.push({
                  index: track.index,
                  name: track.extra_info ? track.extra_info.language || 'Track ' + (self.audioTracks.length + 1) : 'Track ' + (self.audioTracks.length + 1),
                  lang: track.extra_info ? track.extra_info.language || '' : ''
                });
              } else if (track.type === 'TEXT') {
                self.subtitleTracks.push({
                  index: track.index,
                  name: track.extra_info ? track.extra_info.language || 'Track ' + (self.subtitleTracks.length + 1) : 'Track ' + (self.subtitleTracks.length + 1),
                  lang: track.extra_info ? track.extra_info.language || '' : ''
                });
              }
            }
            self._emit('audioTracksChanged', { tracks: self.audioTracks });
            self._emit('subtitleTracksChanged', { tracks: self.subtitleTracks });
          }
        } catch(e) { console.log('[AVPlay] Track info error:', e); }

        // Get duration — try multiple methods for accuracy
        try {
          var durInfo = webapis.avplay.getStreamingProperty('DURATION_INFO');
          if (durInfo) {
            self._duration = parseInt(durInfo) / 1000;
            self._emit('durationChange', { duration: self._duration });
          }
        } catch(e) {}
        // Also try getDuration() which may be more accurate for MKV
        try {
          var totalDur = webapis.avplay.getDuration();
          if (totalDur && totalDur > 0) {
            var durSec = totalDur / 1000;
            if (durSec > self._duration) {
              self._duration = durSec;
              self._emit('durationChange', { duration: self._duration });
            }
          }
        } catch(e) {}

        try {
          webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
          webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
          console.log('[AVPlay] setDisplayRect 1920x1080 applied before play()');
        } catch(re) {
          console.warn('[AVPlay] setDisplayRect before play() error:', re);
        }

        webapis.avplay.play();
        self._emit('playing');

        // DEBUG: Log AVPlay duration properties over time
        var avplayDebugCount = 0;
        self._avplayDebugTimer = setInterval(function() {
          avplayDebugCount++;
          var elapsed = avplayDebugCount * 5;
          try {
            var dur = webapis.avplay.getDuration();
            var ct = webapis.avplay.getCurrentTime();
            var streamInfo = '';
            try { streamInfo = JSON.stringify(webapis.avplay.getCurrentStreamInfo()); } catch(e2) {}
            var totalTrack = '';
            try { totalTrack = webapis.avplay.getTotalTrackInfo(); } catch(e2) {}
            console.log('[AVPlay-DEBUG] t=' + elapsed + 's | getDuration=' + dur + 'ms (' + (dur/1000).toFixed(1) + 's) | getCurrentTime=' + ct + 'ms | streamInfo=' + streamInfo);
          } catch(e) {
            console.log('[AVPlay-DEBUG] t=' + elapsed + 's | error: ' + e.message);
          }
        }, 5000);

        // Polling for AVPlay — updates currentTime and duration continuously
        self._avplayPollTimer = setInterval(function() {
          if (self._isSeeking) return;
          try {
            var ct = webapis.avplay.getCurrentTime();
            if (ct !== undefined && ct >= 0 && !self._isSeeking) {
              self._currentTime = ct / 1000;
              self._emit('timeUpdate', { currentTime: self._currentTime });
            }
          } catch(e) {}
          try {
            var dur = webapis.avplay.getDuration();
            if (dur && dur > 0) {
              var durSec = dur / 1000;
              // Always update duration — MKV metadata can be wrong
              if (Math.abs(durSec - self._duration) > 5) {
                self._duration = durSec;
                self._emit('durationChange', { duration: self._duration });
              }
            }
          } catch(e) {}
        }, 500);
      }, function(prepareErr) {
        console.error('[AVPlay] prepareAsync error:', prepareErr);
        self._emit('error', { message: 'AVPlay prepare error' });
        self._playVideo(url);
      });

    } catch(e) {
      console.error('[AVPlay] Init error:', e);
      this._emit('error', { message: e.message });
      // Fallback to video
      this._playVideo(url);
    }
  };

  // ========== Video Engine ==========
  PlayerAdapter.prototype._playVideo = function(url) {
    var self = this;
    var $video = document.createElement('video');
    $video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    $video.playsInline = true;
    this.container.appendChild($video);
    this._videoEl = $video;

    self._currentUrl = url;
    var startMatch = url.match(/[?&]start=(\d+)/);
    self._seekOffset = startMatch ? parseInt(startMatch[1], 10) : 0;
    self._currentTime = self._seekOffset;

    // Use hls.js for HLS streams (better duration/seeking than native)
    var isHls = url.indexOf('.m3u8') >= 0 || url.indexOf('/hls') >= 0;
    if (isHls && typeof Hls !== 'undefined' && Hls.isSupported()) {
      console.log('[PlayerAdapter] Using hls.js for HLS stream, initial offset:', self._seekOffset);
      var hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        backBufferLength: 30,
        maxBufferSize: 60 * 1000 * 1000,
        startLevel: -1,
        debug: false,
      });
      self._hls = hls;
      hls.loadSource(url);
      hls.attachMedia($video);

      hls.on(Hls.Events.MANIFEST_PARSED, function(_e, data) {
        self.engineType = 'video';
        self._isPlaying = true;
        self._emit('loaded');
        self._emit('playing');
        // Only use HLS duration if we don't already have an accurate duration from FFprobe API
        if (data && data.totalduration && isFinite(data.totalduration) && data.totalduration > 0) {
          if (!self._duration || data.totalduration > self._duration) {
            self._duration = (self._seekOffset || 0) + data.totalduration;
            self._emit('durationChange', { duration: self._duration });
          }
        }
        $video.play().catch(function() {});
      });

      hls.on(Hls.Events.ERROR, function(_e, data) {
        if (data.fatal) {
          console.error('[HLS] Fatal error:', data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.log('[HLS] Recovering network error...');
            hls.startLoad();
          } else {
            self._emit('error', { message: 'HLS error: ' + data.details });
          }
        }
      });
    } else {
      // Native video playback
      $video.src = url;
      self.engineType = 'video';
      try {
        var playPromise = $video.play();
        if (playPromise !== undefined && typeof playPromise.then === 'function') {
          playPromise.then(function() {
            self._isPlaying = true;
            self._emit('loaded');
            self._emit('playing');
          }).catch(function(e) {
            console.warn('[Video] Play error:', e.message);
            self._emit('error', { message: e.message });
          });
        } else {
          self._isPlaying = true;
          self._emit('loaded');
          self._emit('playing');
        }
      } catch(pe) {
        console.warn('[Video] play() call exception:', pe);
        self._isPlaying = true;
        self._emit('loaded');
        self._emit('playing');
      }
    }

    $video.onplay = function() {
      self._isPlaying = true;
      self._emit('playing');
    };
    $video.ontimeupdate = function() {
      self._currentTime = (self._seekOffset || 0) + $video.currentTime;
      if (self._duration && self._currentTime > self._duration) {
        self._currentTime = self._duration;
      }
      // Update duration from video element if not already known
      if (!self._duration && $video.duration && isFinite($video.duration) && $video.duration > 0) {
        self._duration = (self._seekOffset || 0) + $video.duration;
        self._emit('durationChange', { duration: self._duration });
      }
      self._emit('timeUpdate', { currentTime: self._currentTime });
    };
    $video.onloadedmetadata = function() {
      if ($video.duration && isFinite($video.duration) && $video.duration > 0) {
        self._duration = $video.duration;
        self._emit('durationChange', { duration: self._duration });
      }
    };
    $video.ondurationchange = function() {
      if ($video.duration && isFinite($video.duration) && $video.duration > 0) {
        self._duration = $video.duration;
        self._emit('durationChange', { duration: self._duration });
      }
    };
    $video.onprogress = function() {
      if ($video.buffered && $video.buffered.length > 0) {
        var end = $video.buffered.end($video.buffered.length - 1);
        var pct = self._duration > 0 ? (end / self._duration * 100) : 0;
        self._emit('bufferingProgress', { percent: pct });
      }
    };
    $video.onplaying = function() {
      self._isPlaying = true;
      self._emit('playing');
      // Force buffer update on play
      if ($video.buffered && $video.buffered.length > 0) {
        var end = $video.buffered.end($video.buffered.length - 1);
        var pct = self._duration > 0 ? (end / self._duration * 100) : 0;
        self._emit('bufferingProgress', { percent: pct });
      }
    };
    $video.onpause = function() {
      self._isPlaying = false;
      self._emit('paused');
    };
    $video.onended = function() { self._isPlaying = false; self._emit('ended'); };
    $video.onerror = function() {
      self._emit('error', { message: 'Video error' });
      // Attempt reconnect for HLS streams
      if ($video.src && ($video.src.indexOf('.m3u8') >= 0 || $video.src.indexOf('/hls') >= 0)) {
        console.log('[PlayerAdapter] Video error, attempting reconnect in 3s...');
        setTimeout(function() {
          if (self._videoEl) {
            var savedTime = self._currentTime;
            var currentSrc = $video.src;
            $video.src = '';
            $video.src = currentSrc;
            $video.load();
            $video.currentTime = savedTime;
            $video.play().catch(function() {});
            console.log('[PlayerAdapter] Reconnected at', savedTime);
          }
        }, 3000);
      }
    };
  };

  // ========== Unified API ==========
  PlayerAdapter.prototype.isPlaying = function() {
    if (this.engineType === 'avplay') {
      try {
        if (typeof webapis !== 'undefined' && webapis.avplay) {
          return webapis.avplay.getState() === 'PLAYING';
        }
      } catch(e) {}
      return this._isPlaying;
    } else if (this._videoEl) {
      return !this._videoEl.paused && !this._videoEl.ended;
    }
    return this._isPlaying;
  };

  PlayerAdapter.prototype.pause = function() {
    console.log('[PlayerAdapter] pause called, engineType:', this.engineType);
    this._isPlaying = false;
    if (this.engineType === 'avplay') {
      try {
        var state = 'UNKNOWN';
        try { state = webapis.avplay.getState(); } catch(se) {}
        console.log('[AVPlay] Current state before pause():', state);
        if (state === 'PLAYING') {
          webapis.avplay.pause();
        }
      } catch(e) {
        console.error('[AVPlay] pause error:', e);
      }
    } else if (this._videoEl) {
      try {
        this._videoEl.pause();
      } catch(ve) {
        console.error('[Video] pause error:', ve);
      }
    }
    this._emit('paused');
  };

  PlayerAdapter.prototype.resume = function() {
    console.log('[PlayerAdapter] resume called, engineType:', this.engineType);
    this._isPlaying = true;
    if (this.engineType === 'avplay') {
      try {
        var state = 'UNKNOWN';
        try { state = webapis.avplay.getState(); } catch(se) {}
        console.log('[AVPlay] Current state before resume():', state);
        if (state !== 'PLAYING') {
          webapis.avplay.play();
        }
      } catch(e) {
        console.error('[AVPlay] resume error:', e);
      }
    } else if (this._videoEl) {
      try {
        var p = this._videoEl.play();
        if (p !== undefined && typeof p.then === 'function') {
          p.catch(function(e) {});
        }
      } catch(ve) {
        console.error('[Video] play error:', ve);
      }
    }
    this._emit('playing');
  };

  PlayerAdapter.prototype.stop = function() {
    if (this._avplayPollTimer) {
      clearInterval(this._avplayPollTimer);
      this._avplayPollTimer = null;
    }
    if (this._avplayDebugTimer) {
      clearInterval(this._avplayDebugTimer);
      this._avplayDebugTimer = null;
    }
    if (this._hls) {
      try { this._hls.destroy(); } catch(e) {}
      this._hls = null;
    }
    try {
      if (typeof webapis !== 'undefined' && webapis.avplay) {
        webapis.avplay.stop();
        webapis.avplay.close();
      }
    } catch(e) {}
    if (this._avplayObj && this._avplayObj.parentNode) {
      this._avplayObj.parentNode.removeChild(this._avplayObj);
      this._avplayObj = null;
    } else if (this._videoEl) {
      this._videoEl.pause();
      this._videoEl.src = '';
      if (this._videoEl.parentNode) {
        this._videoEl.parentNode.removeChild(this._videoEl);
      }
      this._videoEl = null;
    }
    this._isPlaying = false;
    this._duration = 0;
    this._currentTime = 0;
    this._seekOffset = 0;
    this._currentUrl = '';
    this.engineType = 'none';
    this._emit('paused');
  };

  PlayerAdapter.prototype.setDuration = function(d) {
    if (d && isFinite(d) && d > 0) {
      this._duration = d;
      this._emit('durationChange', { duration: this._duration });
    }
  };

  PlayerAdapter.prototype.seek = function(seconds) {
    var target = Math.max(0, this._currentTime + seconds);
    this.seekTo(target);
  };

  PlayerAdapter.prototype._reloadAtTime = function(targetSec, wasPlaying, successCb, errorCb) {
    var self = this;
    console.log('[AVPlay] _reloadAtTime starting at targetSec:', targetSec);
    try {
      self._isSeeking = true;
      if (self._avplayPollTimer) {
        clearInterval(self._avplayPollTimer);
        self._avplayPollTimer = null;
      }
      try { webapis.avplay.stop(); } catch(e) {}
      try { webapis.avplay.close(); } catch(e) {}

      if (!self._currentUrl) {
        self._isSeeking = false;
        if (errorCb) errorCb(new Error('No currentUrl for reload'));
        return;
      }

      webapis.avplay.open(self._currentUrl);
      try {
        webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
      } catch(de) {}

      webapis.avplay.prepareAsync(function() {
        self._isPlaying = true;
        var targetMs = Math.round(Math.max(0.5, targetSec) * 1000);

        var startPlayback = function() {
          if (wasPlaying !== false) {
            try { webapis.avplay.play(); } catch(pe) {}
            self._emit('playing');
          }
          self._currentTime = targetSec;
          self._isSeeking = false;

          self._avplayPollTimer = setInterval(function() {
            if (self._isSeeking) return;
            try {
              var ct = webapis.avplay.getCurrentTime();
              if (ct !== undefined && ct >= 0 && !self._isSeeking) {
                self._currentTime = ct / 1000;
                self._emit('timeUpdate', { currentTime: self._currentTime });
              }
            } catch(e) {}
          }, 500);

          if (successCb) successCb();
        };

        // In READY state (after prepareAsync), seekTo sets the start position reliably
        if (targetMs > 1000) {
          try {
            webapis.avplay.seekTo(targetMs, function() {
              console.log('[AVPlay] _reloadAtTime seekTo in READY state success at', targetMs, 'ms');
              startPlayback();
            }, function(sErr) {
              console.warn('[AVPlay] _reloadAtTime seekTo in READY state error:', sErr);
              startPlayback();
            });
          } catch(se) {
            console.warn('[AVPlay] _reloadAtTime seekTo exception:', se);
            startPlayback();
          }
        } else {
          startPlayback();
        }
      }, function(pErr) {
        console.error('[AVPlay] _reloadAtTime prepareAsync failed:', pErr);
        self._isSeeking = false;
        if (errorCb) errorCb(pErr);
      });
    } catch(err) {
      console.error('[AVPlay] _reloadAtTime error:', err);
      self._isSeeking = false;
      if (errorCb) errorCb(err);
    }
  };

  PlayerAdapter.prototype.seekTo = function(timeSeconds, successCb, errorCb) {
    var self = this;
    var targetSec = Math.max(0, Number(timeSeconds) || 0);
    self._currentTime = targetSec;

    if (self.engineType === 'avplay') {
      var avState = '';
      try { avState = webapis.avplay.getState(); } catch(se) {}

      var safeTargetSec = Math.max(0.5, targetSec);
      if (self._duration > 2 && safeTargetSec > self._duration - 2) {
        safeTargetSec = Math.max(0.5, self._duration - 2);
      }
      var ms = Math.round(safeTargetSec * 1000);
      console.log('[AVPlay] Seeking to', ms, 'ms (' + safeTargetSec.toFixed(1) + 's), state:', avState);

      if (avState === 'NONE' || avState === 'IDLE') {
        console.warn('[AVPlay] Cannot seek in state:', avState);
        self._isSeeking = false;
        if (errorCb) errorCb(new Error('Cannot seek in state ' + avState));
        return;
      }

      if (self._isSeeking) {
        console.log('[AVPlay] Already seeking, queuing target:', safeTargetSec, 's');
        self._pendingSeek = { time: safeTargetSec, successCb: successCb, errorCb: errorCb };
        return;
      }

      self._isSeeking = true;
      var wasPlaying = (avState === 'PLAYING');

      // Safety timeout: release lock after 5 seconds if callbacks don't fire
      var seekTimeout = setTimeout(function() {
        console.warn('[AVPlay] Seek safety timeout triggered');
        if (wasPlaying) {
          try { webapis.avplay.play(); } catch(pe) {}
        }
        onSeekDone();
        if (errorCb) errorCb(new Error('Seek timeout'));
      }, 5000);

      var onSeekDone = function() {
        clearTimeout(seekTimeout);
        self._isSeeking = false;
        if (self._pendingSeek) {
          var next = self._pendingSeek;
          self._pendingSeek = null;
          self.seekTo(next.time, next.successCb, next.errorCb);
        }
      };

      try {
        // Samsung Tizen Best Practice: pause before seekTo to avoid decoder buffer conflicts
        if (wasPlaying) {
          try { webapis.avplay.pause(); } catch(pErr) {}
        }

        webapis.avplay.seekTo(ms, function() {
          console.log('[AVPlay] seekTo success at', ms, 'ms');
          self._currentTime = safeTargetSec;
          if (wasPlaying) {
            try { webapis.avplay.play(); } catch(plErr) {}
          }
          setTimeout(onSeekDone, 150);
          if (successCb) successCb();
        }, function(err) {
          console.warn('[AVPlay] seekTo error callback:', err);
          if (typeof window.sendTvLog === 'function') {
            window.sendTvLog('warn', 'seek', 'AVPlay seekTo failed, attempting jump fallback', { targetSec: safeTargetSec, err: err });
          }
          var curMs = 0;
          try { curMs = webapis.avplay.getCurrentTime() || 0; } catch(ce) {}
          var deltaMs = ms - curMs;
          var absDeltaMs = Math.abs(deltaMs);
          var absDeltaSec = Math.max(1, Math.round(absDeltaMs / 1000));

          // Fallback 1: jumpForward / jumpBackward if seekTo returned error
          if (absDeltaSec >= 1 && (typeof webapis.avplay.jumpForward === 'function' || typeof webapis.avplay.jumpBackward === 'function')) {
            var jumpFn = deltaMs > 0 ? webapis.avplay.jumpForward : webapis.avplay.jumpBackward;
            try {
              jumpFn.call(webapis.avplay, absDeltaSec, function() {
                console.log('[AVPlay] jump succeeded with', absDeltaSec, 's');
                self._currentTime = safeTargetSec;
                if (wasPlaying) {
                  try { webapis.avplay.play(); } catch(plErr) {}
                }
                setTimeout(onSeekDone, 150);
                if (successCb) successCb();
              }, function(jerr) {
                console.warn('[AVPlay] jump failed:', jerr);
                if (typeof window.sendTvLog === 'function') {
                  window.sendTvLog('warn', 'seek', 'AVPlay jump failed, reloading at time', { targetSec: safeTargetSec, jerr: jerr });
                }
                // Fallback 2: reload at time
                self._reloadAtTime(safeTargetSec, wasPlaying, function() {
                  setTimeout(onSeekDone, 150);
                  if (successCb) successCb();
                }, function(rErr) {
                  if (wasPlaying) {
                    try { webapis.avplay.play(); } catch(plErr) {}
                  }
                  setTimeout(onSeekDone, 150);
                  if (errorCb) errorCb(rErr);
                });
              });
              return;
            } catch(je) {
              console.warn('[AVPlay] jump exception:', je);
            }
          }

          // Fallback 2: reload at time
          self._reloadAtTime(safeTargetSec, wasPlaying, function() {
            setTimeout(onSeekDone, 150);
            if (successCb) successCb();
          }, function(rErr) {
            if (wasPlaying) {
              try { webapis.avplay.play(); } catch(plErr) {}
            }
            setTimeout(onSeekDone, 150);
            if (errorCb) errorCb(rErr);
          });
        });
      } catch(e) {
        console.warn('[AVPlay] seekTo exception:', e);
        if (wasPlaying) {
          try { webapis.avplay.play(); } catch(plErr) {}
        }
        setTimeout(onSeekDone, 150);
        if (errorCb) errorCb(e);
      }
    } else if (self._videoEl) {
      self._isSeeking = true;
      try {
        var localTarget = targetSec - (self._seekOffset || 0);
        var isBuffered = false;
        if (self._videoEl.buffered && self._videoEl.buffered.length > 0) {
          for (var b = 0; b < self._videoEl.buffered.length; b++) {
            if (localTarget >= self._videoEl.buffered.start(b) && localTarget <= self._videoEl.buffered.end(b)) {
              isBuffered = true;
              break;
            }
          }
        }

        if (isBuffered && localTarget >= 0) {
          console.log('[Video] Seeking in buffer to local time:', localTarget.toFixed(1), 's (global:', targetSec.toFixed(1), 's)');
          self._videoEl.currentTime = localTarget;
          setTimeout(function() { self._isSeeking = false; }, 300);
          if (successCb) successCb();
        } else if (self._hls && self._currentUrl && self._currentUrl.indexOf('/api/torrents/hls') >= 0) {
          console.log('[PlayerAdapter] HLS stream seek outside buffer: reloading from', Math.floor(targetSec), 's');
          self._seekOffset = Math.floor(targetSec);
          var cleanUrl = self._currentUrl.replace(/([?&])start=\d+(&|$)/g, '$1').replace(/[?&]$/, '');
          var joinChar = cleanUrl.indexOf('?') >= 0 ? '&' : '?';
          var newSeekUrl = cleanUrl + joinChar + 'start=' + self._seekOffset;
          self._currentUrl = newSeekUrl;
          self._emit('bufferingStart');
          self._hls.loadSource(newSeekUrl);
          self._hls.attachMedia(self._videoEl);
          self._videoEl.play().catch(function() {});
          setTimeout(function() {
            self._isSeeking = false;
            self._emit('bufferingEnd');
          }, 800);
          if (successCb) successCb();
        } else {
          console.log('[Video] Direct seekTo', targetSec, 's');
          self._videoEl.currentTime = targetSec;
          setTimeout(function() { self._isSeeking = false; }, 300);
          if (successCb) successCb();
        }
      } catch(ve) {
        console.warn('[Video] seekTo error:', ve);
        self._isSeeking = false;
        if (errorCb) errorCb(ve);
      }
    } else {
      self._isSeeking = false;
    }
  };

  PlayerAdapter.prototype.getCurrentTime = function() {
    return this._currentTime;
  };

  PlayerAdapter.prototype.getDuration = function() {
    return this._duration;
  };

  PlayerAdapter.prototype.isPlaying = function() {
    return this._isPlaying;
  };

  PlayerAdapter.prototype.setAudioTrack = function(index) {
    if (this.engineType === 'avplay') {
      try {
        if (index >= 0 && index < this.audioTracks.length) {
          webapis.avplay.setSelectTrack('AUDIO', this.audioTracks[index].index);
          this.currentAudio = index;
          console.log('[AVPlay] Audio track set to:', this.audioTracks[index].name);
        }
      } catch(e) { console.error('[AVPlay] setAudioTrack error:', e); }
    }
    // HTML5 video doesn't support audio track switching natively
  };

  PlayerAdapter.prototype.setSubtitleTrack = function(index) {
    if (this.engineType === 'avplay') {
      try {
        if (index >= 0 && this.subtitleTracks[index]) {
          webapis.avplay.setSelectTrack('TEXT', this.subtitleTracks[index].index);
          this.currentSubtitle = index;
          console.log('[AVPlay] Subtitle track set to:', this.subtitleTracks[index].name);
        } else {
          // Disable subtitles
          this.currentSubtitle = -1;
          console.log('[AVPlay] Subtitles disabled');
        }
      } catch(e) { console.error('[AVPlay] setSubtitleTrack error:', e); }
    }
  };

  PlayerAdapter.prototype.getAudioTracks = function() {
    return this.audioTracks;
  };

  PlayerAdapter.prototype.getSubtitleTracks = function() {
    return this.subtitleTracks;
  };

  PlayerAdapter.prototype.setPlaybackRate = function(rate) {
    if (this.engineType === 'avplay') {
      try { webapis.avplay.setSpeed(rate); } catch(e) {}
    } else if (this._videoEl) {
      this._videoEl.playbackRate = rate;
    }
  };

  PlayerAdapter.prototype.destroy = function() {
    this.stop();
    if (this._avplayObj && this._avplayObj.parentNode) {
      this._avplayObj.parentNode.removeChild(this._avplayObj);
    }
    if (this._videoEl && this._videoEl.parentNode) {
      this._videoEl.parentNode.removeChild(this._videoEl);
    }
    this.listeners = {};
  };

  // ========== Export ==========
  window.PlayerAdapter = PlayerAdapter;
})();
