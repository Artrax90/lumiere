// Lumiere Player Adapter — unified playback interface
// Samsung TV: webapis.avplay | Browser: HTML5 video
(function() {
  'use strict';

  // ========== Platform Detection ==========
  function isTizen() {
    return typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined';
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
    console.log('[AVPlay] Starting playback:', url.substring(0, 100));
    try {
      // Create AVPlay object element
      var obj = document.createElement('object');
      obj.type = 'application/avplayer';
      obj.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      this.container.appendChild(obj);
      this._avplayObj = obj;
      console.log('[AVPlay] Object element created');

      webapis.avplay.open(url);
      console.log('[AVPlay] Stream opened');
      webapis.avplay.setDisplayRect(0, 0, window.innerWidth, window.innerHeight);
      console.log('[AVPlay] Display rect set');

      // Set listener for events
      webapis.avplay.setListener({
        onstreamcompleted: function() {
          self._isPlaying = false;
          self._emit('ended');
        },
        oncurrentplaytime: function(time) {
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
          self._emit('error', { message: error });
        }
      });

      // Prepare and play
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

        // Get duration
        try {
          var durInfo = webapis.avplay.getStreamingProperty('DURATION_INFO');
          if (durInfo) {
            self._duration = parseInt(durInfo) / 1000;
            self._emit('durationChange', { duration: self._duration });
          }
        } catch(e) {}

        webapis.avplay.play();
        self._emit('playing');
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

    $video.src = url;
    $video.play().then(function() {
      self.engineType = 'video';
      self._isPlaying = true;
      self._emit('loaded');
      self._emit('playing');
    }).catch(function(e) {
      self._emit('error', { message: e.message });
    });

    $video.ontimeupdate = function() {
      self._currentTime = $video.currentTime;
      if ($video.duration && isFinite($video.duration)) self._duration = $video.duration;
      self._emit('timeUpdate', { currentTime: self._currentTime });
    };
    $video.onloadedmetadata = function() {
      if ($video.duration && isFinite($video.duration)) {
        self._duration = $video.duration;
        self._emit('durationChange', { duration: self._duration });
      }
    };
    $video.ondurationchange = function() {
      if ($video.duration && isFinite($video.duration)) {
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
    $video.onplaying = function() { self._emit('playing'); };
    $video.onpause = function() { self._emit('paused'); };
    $video.onended = function() { self._isPlaying = false; self._emit('ended'); };
    $video.onerror = function() { self._emit('error', { message: 'Video error' }); };
  };

  // ========== Unified API ==========
  PlayerAdapter.prototype.pause = function() {
    if (this.engineType === 'avplay') {
      webapis.avplay.pause();
      this._isPlaying = false;
      this._emit('paused');
    } else if (this._videoEl) {
      this._videoEl.pause();
      this._isPlaying = false;
    }
  };

  PlayerAdapter.prototype.resume = function() {
    if (this.engineType === 'avplay') {
      webapis.avplay.play();
      this._isPlaying = true;
      this._emit('playing');
    } else if (this._videoEl) {
      this._videoEl.play();
      this._isPlaying = true;
    }
  };

  PlayerAdapter.prototype.stop = function() {
    if (this.engineType === 'avplay') {
      try { webapis.avplay.stop(); webapis.avplay.close(); } catch(e) {}
    } else if (this._videoEl) {
      this._videoEl.pause();
      this._videoEl.src = '';
    }
    this._isPlaying = false;
    this._emit('paused');
  };

  PlayerAdapter.prototype.seek = function(seconds) {
    if (this.engineType === 'avplay') {
      var newTime = Math.max(0, (this._currentTime * 1000) + (seconds * 1000));
      webapis.avplay.seekTo(newTime);
    } else if (this._videoEl) {
      this._videoEl.currentTime = Math.max(0, this._videoEl.currentTime + seconds);
    }
  };

  PlayerAdapter.prototype.seekTo = function(timeSeconds) {
    if (this.engineType === 'avplay') {
      webapis.avplay.seekTo(timeSeconds * 1000);
    } else if (this._videoEl) {
      this._videoEl.currentTime = timeSeconds;
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
