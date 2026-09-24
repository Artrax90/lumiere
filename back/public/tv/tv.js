// Lumiere TV — Vanilla JS for Samsung Tizen 5.5 (Chrome 56)
(function() {
  'use strict';
  console.log('[Lumiere] JS loaded');

  var API = '';
  var TOKEN_KEY = 'lumiere_access';
  var SERVER_KEY = 'lumiere_server';

  // Hardware back debounce timestamp guard (prevent Samsung Tizen double-fire)
  var lastBackTimestamp = 0;

  // IPTV OK button long-press state for Samsung OneRemote
  var iptvLpTimer = null;
  var iptvLpTriggered = false;
  var iptvLpChannel = null;

  // Helper: get base URL for player navigation
  // In .wgt context, __LUMIERE_BASE__ is set by launcher
  // In browser context, use current origin
  function getBaseUrl() {
    var server = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || localStorage.getItem('lumiere_tv_server');
    if (server) return server;
    if (window.__LUMIERE_BASE__) return window.__LUMIERE_BASE__;
    if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file')) {
      return window.location.origin;
    }
    return '';
  }

  // Player base URL — same as getBaseUrl() when running in .wgt SPA mode
  function getPlayerBaseUrl() {
    return getBaseUrl();
  }

  // Formatting Helpers
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

  // SPA: open player by injecting HTML into DOM
  // SPA: open player by injecting HTML into DOM
  function openPlayer(params) {
    if (typeof stopPreview === 'function') stopPreview();
    var p = {};
    params.substring(1).split('&').forEach(function(pair) {
      var parts = pair.split('=');
      if (parts.length === 2) p[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });

    var playerHtml = '<div id="player">' +
      '<video id="video" playsinline></video>' +
      '<div id="osd">' +
        '<div id="osd-top">' +
          '<div class="osd-top-left">' +
            '<button id="btn-back" class="osd-btn osd-top-btn" data-btn="back" tabindex="0">\u2190 Назад</button>' +
            '<div id="osd-title-wrap">' +
              '<div id="osd-title"></div>' +
              '<div id="osd-stats" class="osd-stats">' +
                '<span id="osd-res-badge" class="osd-badge">1080p</span>' +
                '<span id="osd-peers" class="osd-stat-text">-- / -- \u2022 -- подкл.</span>' +
                '<span id="osd-speed" class="osd-stat-speed">-- Мбит/с</span>' +
                '<div class="osd-buffer-wrap">' +
                  '<span id="osd-buffer-text" class="osd-buffer-text">Буфер: --%</span>' +
                  '<div id="osd-dots" class="osd-dots">' +
                    '<span class="osd-dot"></span><span class="osd-dot"></span><span class="osd-dot"></span><span class="osd-dot"></span><span class="osd-dot"></span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="osd-top-right">' +
            '<button id="btn-audio" class="osd-btn osd-top-btn" data-btn="audio" tabindex="0">\ud83d\udd0a Звук</button>' +
            '<button id="btn-cc" class="osd-btn osd-top-btn" data-btn="cc" tabindex="0">\ud83d\udcac Субтитры</button>' +
          '</div>' +
        '</div>' +
        '<div id="center-indicator">' +
          '<span id="center-indicator-icon">\u25b6</span>' +
          '<span id="center-indicator-text">Воспроизведение</span>' +
        '</div>' +
        '<div id="osd-bottom">' +
          '<div id="timeline-row">' +
            '<span id="time-current">0:00</span>' +
            '<div id="timeline-wrap" tabindex="0">' +
              '<div id="timeline-bar">' +
                '<div id="timeline-buffer"></div>' +
                '<div id="timeline-fill"></div>' +
                '<div id="timeline-thumb"></div>' +
              '</div>' +
            '</div>' +
            '<span id="time-total">0:00</span>' +
          '</div>' +
          '<div class="osd-hint-row">' +
            '<div class="osd-hint-item"><span class="osd-hint-key">OK</span> Пауза / Пуск</div>' +
            '<div class="osd-hint-item"><span class="osd-hint-key">\u25c4 / \u25ba</span> Перемотка 10с</div>' +
            '<div class="osd-hint-item"><span class="osd-hint-key">\u25b2</span> Меню плеера</div>' +
            '<div class="osd-hint-item"><span class="osd-hint-key">\u25bc</span> Скрыть меню</div>' +
            '<div class="osd-hint-item"><span class="osd-hint-key">Назад</span> Выход</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="popup" class="hidden">' +
        '<div id="popup-header"></div>' +
        '<div id="popup-list"></div>' +
      '</div>' +
      '<div id="subtitle-overlay"></div>' +
    '</div>';

    var app = document.getElementById('app');
    var detail = document.getElementById('detail');
    var playerContainer = document.getElementById('player-container');
    if (!playerContainer) {
      playerContainer = document.createElement('div');
      playerContainer.id = 'player-container';
      document.body.appendChild(playerContainer);
    }
    state.playerOpenedFrom = (detail && !detail.classList.contains('hidden')) ? 'detail' : 'app';
    if (app) app.classList.add('hidden');
    if (detail) detail.classList.add('hidden');
    playerContainer.innerHTML = playerHtml;
    playerContainer.classList.remove('hidden');
    playerContainer.style.display = 'block';
    playerContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9000;background:transparent;';
    
    // Tizen HW video plane transparency
    document.documentElement.classList.add('player-active');
    document.body.classList.add('player-active');
    document.documentElement.style.background = 'transparent';
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.backgroundColor = 'transparent';

    // Initialize player
    var playerParams = {
      url: p.url || '',
      title: p.title || '',
      id: parseInt(p.id) || 0,
      type: p.type || 'movie',
      poster: p.poster || '',
      start: parseInt(p.start) || 0
    };
    if (typeof window.initPlayer === 'function') {
      window.initPlayer(playerParams);
    } else if (typeof initPlayer === 'function') {
      initPlayer(playerParams);
    }
  }

  // SPA: close player and return to main app
  function closePlayer() {
    var playerContainer = document.getElementById('player-container');
    var app = document.getElementById('app');
    var detail = document.getElementById('detail');

    if (typeof window.destroyPlayer === 'function') {
      try { window.destroyPlayer(); } catch(e) { console.error('destroyPlayer error:', e); }
    }

    if (typeof webapis !== 'undefined' && webapis.avplay) {
      try { webapis.avplay.stop(); } catch(e) {}
      try { webapis.avplay.close(); } catch(e) {}
    }

    // Stop and clear all audio/video elements across document
    var videos = document.querySelectorAll('video, audio');
    for (var vi = 0; vi < videos.length; vi++) {
      try {
        videos[vi].pause();
        videos[vi].removeAttribute('src');
        videos[vi].src = '';
        videos[vi].load();
      } catch(ve) {}
    }

    if (playerContainer) {
      playerContainer.classList.add('hidden');
      playerContainer.innerHTML = '';
      playerContainer.style.display = 'none';
    }

    document.documentElement.classList.remove('player-active');
    document.body.classList.remove('player-active');
    document.body.style.background = '#0a0b0f';
    document.body.style.backgroundColor = '#0a0b0f';
    if (document.documentElement) {
      document.documentElement.style.background = '#0a0b0f';
      document.documentElement.style.backgroundColor = '#0a0b0f';
    }

    var debugInfo = document.getElementById('debug-info');
    if (debugInfo && debugInfo.parentNode) {
      debugInfo.parentNode.removeChild(debugInfo);
    }

    if (app) {
      app.classList.remove('hidden');
      app.style.display = 'block';
    }

    // Timestamp guard: prevent immediate double-processing of Back key on Samsung Tizen
    lastBackTimestamp = Date.now();

    // If closing player from IPTV, remain in IPTV and keep current channel and group focused!
    if (state.section === 'iptv') {
      if (detail) {
        detail.classList.add('hidden');
        detail.style.display = 'none';
      }
      iptvState.focusedCol = 1;
      renderIptv();
      focusIptvChannel(iptvState.focusedCh || 0);
      if (typeof renderContinueWatching === 'function') renderContinueWatching();
      return;
    }

    // If movie/series detail was open or state.detail is available, ALWAYS return to detail card!
    if (detail && (state.playerOpenedFrom === 'detail' || state.detail)) {
      detail.classList.remove('hidden');
      detail.style.display = 'block';
      detail.style.zIndex = '900';
      var focusTarget = detail.querySelector('#detail-play') ||
                        detail.querySelector('.episode-card.focused') ||
                        detail.querySelector('.episode-card') ||
                        detail.querySelector('.torrent-item.focused') ||
                        detail.querySelector('.torrent-item') ||
                        detail.querySelector('.detail-actions button') ||
                        detail.querySelector('#detail-back-btn');
      if (focusTarget) {
        if (typeof setDetailFocus === 'function') setDetailFocus(focusTarget);
        else try { focusTarget.focus(); } catch(e) {}
      }
    } else {
      if (detail) {
        detail.classList.add('hidden');
        detail.style.display = 'none';
      }
      var c = document.querySelector('.card.focused');
      if (c) {
        try { c.focus(); } catch(e) {}
      } else {
        focusNav(state.focusedNav || 0);
      }
    }

    if (typeof renderContinueWatching === 'function') {
      renderContinueWatching();
    }
    if (typeof renderHistoryRecommendations === 'function') {
      renderHistoryRecommendations();
    }
  }
  window.closePlayer = closePlayer;
  window.openPlayer = openPlayer;

  // State
  var state = {
    section: 'home',
    focusedNav: 0,
    focusedCard: null,
    movies: [],
    tvShows: [],
    iptvChannels: [],
    user: null,
    detail: null,    // current detail view data
    detailTab: 'torrents',
    detailSeason: ''
  };

  // DOM refs
  var $loading, $app, $topbar, $content, $detail;

  // ========== Init & DOM Synchronization ==========
  function syncDomWithServer(serverUrl) {
    var hasCompleteDom = document.getElementById('row-top10-movies') &&
                         document.getElementById('iptv-cat-list');
    if (hasCompleteDom) return;

    try {
      var sUrl = (serverUrl || API || '').replace(/\/+$/, '');
      if (!sUrl) return;
      var xhr = new XMLHttpRequest();
      xhr.open('GET', sUrl + '/tv/index.html?ts=' + Date.now(), false);
      try { xhr.overrideMimeType('text/html; charset=utf-8'); } catch(me) {}
      try {
        xhr.setRequestHeader('X-Lumiere-TV', '1');
        xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
      } catch(he) {}
      xhr.send();
      if (xhr.status === 200 && xhr.responseText) {
        var bodyMatch = xhr.responseText.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch && bodyMatch[1]) {
          var cleanHtml = bodyMatch[1].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          document.body.innerHTML = cleanHtml;
          console.log('[Lumiere] Successfully synced complete DOM from /tv/index.html');
          if (window._appStarted) {
            var ld = document.getElementById('loading');
            var ap = document.getElementById('app');
            if (ld) { ld.classList.add('hidden'); ld.style.display = 'none'; }
            if (ap) { ap.classList.remove('hidden'); ap.style.display = 'block'; }
          }
          return;
        }
      }
    } catch(e) {
      console.warn('[Lumiere] DOM sync from server failed:', e);
    }
  }

  function init() {
    console.log('[Lumiere] Init starting');
    try {
      var savedServer = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || localStorage.getItem('lumiere_tv_server');
      var server = savedServer;
      if (!server) {
        if (window.__DEFAULT_SERVER_URL__) {
          server = window.__DEFAULT_SERVER_URL__;
        } else if (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file')) {
          server = window.location.origin;
        }
      }
      if (server) {
        localStorage.setItem(SERVER_KEY, server);
        localStorage.setItem('lumiere_server_url', server);
        localStorage.setItem('lumiere_tv_server', server);
      }
      API = server || '';
      console.log('[Lumiere] API set to:', API);

      // Synchronize DOM structure with server if loaded from launcher with stub DOM
      if (server) {
        syncDomWithServer(server);
      }

      $loading = document.getElementById('loading');
      $app = document.getElementById('app');
      $topbar = document.getElementById('topbar');
      $content = document.getElementById('content');
      $detail = document.getElementById('detail');

      // Clear history if ?clear=1 in URL (Chrome 56 compatible)
      var searchStr = (window.location && window.location.search) ? window.location.search.substring(1) : '';
      var params = {};
      searchStr.split('&').forEach(function(pair) {
        var parts = pair.split('=');
        if (parts.length === 2) params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
      });
      if (params.clear === '1') {
        localStorage.removeItem('playback_positions');
        localStorage.removeItem('last_torrents');
        console.log('[Lumiere] History cleared');
        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }

      initAuth();
    } catch(e) {
      console.error('[Lumiere] Init error:', e);
      var loading = document.getElementById('loading');
      if (loading) {
        loading.innerHTML = '<div class="logo"><div class="dot"></div><span class="logo-text">Lumiere</span></div>' +
          '<p style="margin-top:20px;color:rgba(255,255,255,0.5);font-size:14px;">Ошибка загрузки: ' + (e.message || 'unknown') + '</p>' +
          '<button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;border-radius:8px;background:#6ee7b7;color:#0a0b0f;border:none;font-size:14px;cursor:pointer;">Перезагрузить</button>';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Also listen for launcher dispatching DOMContentLoaded after script loads
  document.addEventListener('DOMContentLoaded', function() {
    var hasFullDom = document.getElementById('row-top10-movies') &&
                     document.getElementById('iptv-cat-list');
    if (!hasFullDom) {
      console.log('[Lumiere] Launcher stub detected on DOMContentLoaded, synchronizing full DOM...');
      syncDomWithServer(API);
      if (window._appStarted) {
        startApp();
      }
    }
  });

  // ========== Auth ==========
  var profileState = {
    profiles: [],
    focusedIndex: 0,
    selectedProfile: null,
    padIndex: 0,
    pinDigits: ''
  };
  window.profileState = profileState;
  window.loadProfilesAndShowPicker = function() { loadProfilesAndShowPicker(); };

  function handleConnectionFailure(fallbackMsg) {
    if (API && !/:3500$/.test(API)) {
      var probeUrl = API.replace(/:\d+$/, '') + ':3500';
      checkLumiereServer(probeUrl, 1500, function(found) {
        if (found) {
          console.log('[Lumiere] Auto-corrected server port to 3500:', probeUrl);
          applyNewServer(probeUrl);
          return;
        }
        showError(fallbackMsg || ('Не удалось подключиться к серверу Lumiere (' + (API || 'не задан') + '). Проверьте, что сервер запущен на порту 3500.'));
      });
      return;
    }
    showError(fallbackMsg || ('Не удалось подключиться к серверу Lumiere (' + (API || 'не задан') + '). Проверьте, что сервер запущен на порту 3500.'));
  }

  function initAuth() {
    try {
      if (typeof setupKeyboard === 'function') setupKeyboard();
    } catch(kErr) {
      console.error('[Lumiere] setupKeyboard in initAuth error:', kErr);
    }

    if (!API) {
      showError('Адрес сервера Lumière не задан. Нажмите «Найти в сети» для автоматического поиска.');
      setTimeout(function() {
        startLanScanFromErrorScreen();
      }, 300);
      return;
    }

    var token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      apiFetch('/api/setup/status', function(err, setupData) {
        if (err) {
          handleConnectionFailure();
          return;
        }
        if (setupData && setupData.needsSetup) {
          showError('Требуется первоначальная настройка через веб-интерфейс (http://' + (window.location.host || (window.location.hostname + ':3500')) + ')');
          return;
        }
        apiFetch('/api/user/profile', function(err2, profile) {
          if (profile && profile.id) {
            state.user = profile;
            startApp();
          } else {
            localStorage.removeItem(TOKEN_KEY);
            loadProfilesAndShowPicker();
          }
        });
      });
    } else {
      apiFetch('/api/setup/status', function(err, setupData) {
        if (err) {
          handleConnectionFailure();
          return;
        }
        if (setupData && setupData.needsSetup) {
          showError('Требуется первоначальная настройка через веб-интерфейс (http://' + (window.location.host || (window.location.hostname + ':3500')) + ')');
          return;
        }
        loadProfilesAndShowPicker();
      });
    }
  }

  function loadProfilesAndShowPicker() {
    console.log('[Lumiere] loadProfilesAndShowPicker called');
    apiFetch('/api/auth/lan-status', function(err, lanData) {
      if (err) {
        handleConnectionFailure();
        return;
      }
      apiFetch('/api/auth/profiles', function(err2, data) {
        var list = (data && data.profiles) || [];
        if (list.length > 0) {
          renderProfilePicker(list);
        } else if (lanData && !lanData.isLan && !lanData.isTv) {
          showError('Для входа вне локальной сети авторизуйтесь через веб-браузер или задайте PIN-код профиля.');
        } else {
          showError('На сервере нет аккаунтов. Создайте аккаунт через веб-интерфейс.');
        }
      });
    });
  }

  function renderProfilePicker(profiles) {
    profileState.profiles = profiles;
    profileState.focusedIndex = 0;
    profileState.selectedProfile = null;
    profileState.pinDigits = '';

    var $picker = document.getElementById('profile-screen');
    var $cards = document.getElementById('profile-cards');
    if (!$picker || !$cards) return;

    var html = '';
    for (var i = 0; i < profiles.length; i++) {
      var p = profiles[i];
      var initial = p.name ? p.name.charAt(0).toUpperCase() : '?';
      var isFocused = (i === 0);
      html += '<div class="profile-card' + (isFocused ? ' focused' : '') + '" data-idx="' + i + '" data-id="' + p.id + '">' +
        '<div class="profile-avatar-box">' +
          (p.avatar ? '<img class="profile-avatar-img" src="' + p.avatar + '" />' : '<div class="profile-avatar-initial">' + initial + '</div>') +
          '<div class="profile-badges">' +
            (p.hasPin ? '<div class="profile-badge-icon" title="PIN-код">🔒</div>' : '') +
            (p.isKids ? '<div class="profile-badge-icon" title="Детский">👶</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="profile-name">' + (p.name || 'Пользователь') + '</div>' +
        (p.role === 'admin' ? '<div class="profile-role-tag profile-role-admin">Админ</div>' : '') +
        (p.isKids ? '<div class="profile-role-tag profile-role-kids">Детский</div>' : '') +
      '</div>';
    }
    $cards.innerHTML = html;

    var cardEls = $cards.querySelectorAll('.profile-card');
    for (var c = 0; c < cardEls.length; c++) {
      (function(el, idx) {
        el.addEventListener('click', function() {
          profileState.focusedIndex = idx;
          updateProfileCardsFocus();
          selectFocusedProfile();
        });
      })(cardEls[c], c);
    }

    if ($loading) { $loading.classList.add('hidden'); $loading.style.display = 'none'; }
    $picker.classList.remove('hidden');
    $picker.style.display = 'flex';
    state.screen = 'profile-picker';
  }

  function updateProfileCardsFocus() {
    var $cards = document.getElementById('profile-cards');
    if (!$cards) return;
    var cardEls = $cards.querySelectorAll('.profile-card');
    for (var i = 0; i < cardEls.length; i++) {
      if (i === profileState.focusedIndex) {
        cardEls[i].classList.add('focused');
        try { cardEls[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); } catch(e) {}
      } else {
        cardEls[i].classList.remove('focused');
      }
    }
  }

  function selectFocusedProfile() {
    var p = profileState.profiles[profileState.focusedIndex];
    if (!p) return;

    if (p.hasPin) {
      openPinDialog(p);
    } else {
      loginWithProfile(p.id, '');
    }
  }

  function openPinDialog(profile) {
    profileState.selectedProfile = profile;
    profileState.pinDigits = '';
    profileState.padIndex = 0;

    var $modal = document.getElementById('tv-pin-modal');
    var $avatar = document.getElementById('tv-pin-avatar');
    var $title = document.getElementById('tv-pin-title');
    var $error = document.getElementById('tv-pin-error');
    if (!$modal) return;

    if ($avatar) $avatar.textContent = profile.name ? profile.name.charAt(0).toUpperCase() : '?';
    if ($title) $title.textContent = profile.name;
    if ($error) $error.textContent = '';
    updatePinDots();
    updatePinPadFocus();

    var padBtns = $modal.querySelectorAll('.tv-pad-btn');
    for (var b = 0; b < padBtns.length; b++) {
      (function(btn, idx) {
        btn.onclick = function() {
          profileState.padIndex = idx;
          updatePinPadFocus();
          handlePadButtonAction(btn.getAttribute('data-key'));
        };
      })(padBtns[b], b);
    }

    $modal.classList.remove('hidden');
    $modal.style.display = 'flex';
    state.screen = 'pin-dialog';
  }

  function closePinDialog() {
    var $modal = document.getElementById('tv-pin-modal');
    if ($modal) {
      $modal.classList.add('hidden');
      $modal.style.display = 'none';
    }
    profileState.selectedProfile = null;
    profileState.pinDigits = '';
    state.screen = 'profile-picker';
    updateProfileCardsFocus();
  }

  function updatePinDots() {
    var $dots = document.getElementById('tv-pin-dots');
    if (!$dots) return;
    var dotEls = $dots.querySelectorAll('.tv-pin-dot');
    for (var i = 0; i < dotEls.length; i++) {
      if (i < profileState.pinDigits.length) {
        dotEls[i].classList.add('filled');
      } else {
        dotEls[i].classList.remove('filled');
      }
    }
  }

  function updatePinPadFocus() {
    var $pad = document.getElementById('tv-pin-pad');
    if (!$pad) return;
    var btns = $pad.querySelectorAll('.tv-pad-btn');
    for (var i = 0; i < btns.length; i++) {
      if (i === profileState.padIndex) {
        btns[i].classList.add('focused');
      } else {
        btns[i].classList.remove('focused');
      }
    }
  }

  function handlePadButtonAction(key) {
    if (key === 'cancel') {
      closePinDialog();
    } else if (key === 'back') {
      if (profileState.pinDigits.length > 0) {
        profileState.pinDigits = profileState.pinDigits.slice(0, -1);
        updatePinDots();
      }
    } else if (key && key.length === 1 && key >= '0' && key <= '9') {
      appendPinDigit(key);
    }
  }

  function appendPinDigit(digit) {
    if (!profileState.selectedProfile) return;
    if (profileState.pinDigits.length >= 4) return;

    profileState.pinDigits += digit;
    updatePinDots();

    if (profileState.pinDigits.length === 4) {
      loginWithProfile(profileState.selectedProfile.id, profileState.pinDigits);
    }
  }

  function loginWithProfile(userId, pin) {
    var $error = document.getElementById('tv-pin-error');
    if ($error) $error.textContent = 'Вход...';

    apiPost('/api/auth/quick-login', { userId: userId, pin: pin }, function(err, data) {
      if (err || !data || !data.accessToken) {
        if ($error) $error.textContent = (err && err.message) ? err.message : 'Неверный PIN-код';
        profileState.pinDigits = '';
        updatePinDots();
        return;
      }

      localStorage.setItem(TOKEN_KEY, data.accessToken);
      state.user = data.user;
      try { localStorage.setItem('lumiere_user', JSON.stringify(data.user)); } catch(se) {}
      updateTvUserBadge();
      loadAndApplyHomeShelves();

      var $picker = document.getElementById('profile-screen');
      if ($picker) { $picker.classList.add('hidden'); $picker.style.display = 'none'; }
      var $modal = document.getElementById('tv-pin-modal');
      if ($modal) { $modal.classList.add('hidden'); $modal.style.display = 'none'; }

      state.screen = 'app';
      var $app = document.getElementById('app');
      if ($app) { $app.classList.remove('hidden'); $app.style.display = 'block'; }
      startApp();
    });
  }

  function updateTvUserBadge() {
    var user = state.user;
    if (!user) {
      try {
        user = JSON.parse(localStorage.getItem('lumiere_user') || localStorage.getItem('lumiere_active_profile') || 'null');
      } catch(e) {}
    }
    var $pill = document.getElementById('nav-user-pill');
    var $avatar = document.getElementById('tv-user-avatar');
    var $name = document.getElementById('tv-user-name');
    if (!$pill || !$name) return;

    var displayName = user ? (user.name || user.username || user.login || '') : '';
    if (displayName) {
      $name.textContent = displayName;
      if ($avatar) {
        if (user.avatar) {
          if (user.avatar.indexOf('http') === 0 || user.avatar.indexOf('/') === 0) {
            $avatar.innerHTML = '<img src="' + user.avatar + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />';
          } else {
            $avatar.textContent = user.avatar;
          }
        } else {
          $avatar.textContent = displayName.charAt(0).toUpperCase();
        }
      }
      $pill.style.display = 'inline-flex';
    } else {
      $name.textContent = 'Войти';
      if ($avatar) $avatar.textContent = '👤';
    }
  }
  window.updateTvUserBadge = updateTvUserBadge;

  function showProfilePicker() {
    var $app = document.getElementById('app');
    if ($app) { $app.classList.add('hidden'); $app.style.display = 'none'; }
    var $picker = document.getElementById('profile-screen');
    if ($picker) { $picker.classList.remove('hidden'); $picker.style.display = 'flex'; }
    state.screen = 'profile-picker';
    loadProfilesAndShowPicker();
  }
  window.showProfilePicker = showProfilePicker;

  function handleProfilePickerKey(code, key, e) {
    if (code === 37 || key === 'ArrowLeft') {
      if (profileState.focusedIndex > 0) {
        profileState.focusedIndex--;
        updateProfileCardsFocus();
      }
    } else if (code === 39 || key === 'ArrowRight') {
      if (profileState.focusedIndex < profileState.profiles.length - 1) {
        profileState.focusedIndex++;
        updateProfileCardsFocus();
      }
    } else if (code === 13 || key === 'Enter') {
      selectFocusedProfile();
    }
  }

  function handlePinModalKey(code, key, e) {
    if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
      closePinDialog();
      return;
    }

    if (code >= 48 && code <= 57) {
      appendPinDigit(String(code - 48));
      return;
    }
    if (code >= 96 && code <= 105) {
      appendPinDigit(String(code - 96));
      return;
    }

    var idx = profileState.padIndex;
    if (code === 37 || key === 'ArrowLeft') {
      if (idx % 3 > 0) { profileState.padIndex--; updatePinPadFocus(); }
    } else if (code === 39 || key === 'ArrowRight') {
      if (idx % 3 < 2) { profileState.padIndex++; updatePinPadFocus(); }
    } else if (code === 38 || key === 'ArrowUp') {
      if (idx >= 3) { profileState.padIndex -= 3; updatePinPadFocus(); }
    } else if (code === 40 || key === 'ArrowDown') {
      if (idx <= 8) { profileState.padIndex += 3; updatePinPadFocus(); }
    } else if (code === 13 || key === 'Enter') {
      var $pad = document.getElementById('tv-pin-pad');
      if ($pad) {
        var btns = $pad.querySelectorAll('.tv-pad-btn');
        if (btns[profileState.padIndex]) {
          var k = btns[profileState.padIndex].getAttribute('data-key');
          handlePadButtonAction(k);
        }
      }
    }
  }

  // ========== Error Screen, Server Configuration & LAN Auto-Discovery ==========
  var errorScreenState = {
    active: false,
    focusedIndex: 1 // 0: retry, 1: scan (default!), 2: enter manually
  };

  function updateErrorButtonsFocus() {
    var retryBtn = document.getElementById('tv-err-btn-retry');
    var scanBtn = document.getElementById('tv-err-btn-scan');
    var serverBtn = document.getElementById('tv-err-btn-server');
    if (retryBtn) retryBtn.classList.toggle('focused', errorScreenState.focusedIndex === 0);
    if (scanBtn) scanBtn.classList.toggle('focused', errorScreenState.focusedIndex === 1);
    if (serverBtn) serverBtn.classList.toggle('focused', errorScreenState.focusedIndex === 2);
    if (errorScreenState.focusedIndex === 0 && retryBtn) {
      try { retryBtn.focus(); } catch(e) {}
    } else if (errorScreenState.focusedIndex === 1 && scanBtn) {
      try { scanBtn.focus(); } catch(e) {}
    } else if (errorScreenState.focusedIndex === 2 && serverBtn) {
      try { serverBtn.focus(); } catch(e) {}
    }
  }

  function showError(msg) {
    errorScreenState.active = true;
    errorScreenState.focusedIndex = 1;
    var el = document.getElementById('loading');
    if (el) {
      el.classList.remove('hidden');
      el.style.display = 'flex';
      var currentServerDisplay = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || localStorage.getItem('lumiere_tv_server') || API || (window.location.origin && !window.location.origin.startsWith('file') ? window.location.origin : 'не задан');
      el.innerHTML = '<div class="logo"><div class="dot"></div><span class="logo-text">Lumière</span></div>' +
        '<div style="margin-top:24px;display:flex;align-items:center;gap:10px;background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);padding:10px 22px;border-radius:14px;color:#f87171;font-size:17px;font-weight:600;">' +
          '<span>⚠️</span><span>Ошибка подключения к серверу</span>' +
        '</div>' +
        '<p id="tv-err-msg" style="margin-top:16px;color:rgba(255,255,255,0.85);font-size:18px;max-width:760px;text-align:center;line-height:1.5;">' + msg + '</p>' +
        '<div style="margin-top:8px;font-size:15px;color:rgba(255,255,255,0.45);">Текущий адрес: <span style="color:#e8c170;font-family:monospace;font-weight:600;">' + currentServerDisplay + '</span></div>' +
        '<div class="tv-err-actions" style="margin-top:28px;display:flex;gap:16px;">' +
          '<button id="tv-err-btn-retry" class="tv-err-btn" tabindex="0">⟳ Повторить</button>' +
          '<button id="tv-err-btn-scan" class="tv-err-btn focused" tabindex="0" style="background:#e8c170;color:#0a0b0f;border-color:#e8c170;font-weight:700;">🔍 Найти в сети</button>' +
          '<button id="tv-err-btn-server" class="tv-err-btn" tabindex="0">⚙ Ввести вручную</button>' +
        '</div>' +
        '<div style="margin-top:24px;font-size:14px;color:rgba(255,255,255,0.4);display:flex;gap:18px;">' +
          '<span>◄ ► Выбор</span><span>•</span><span>[OK] Подтвердить</span>' +
        '</div>';

      var retryBtn = document.getElementById('tv-err-btn-retry');
      var scanBtn = document.getElementById('tv-err-btn-scan');
      var serverBtn = document.getElementById('tv-err-btn-server');
      if (retryBtn) {
        retryBtn.addEventListener('click', function() {
          window.location.reload();
        });
      }
      if (scanBtn) {
        scanBtn.addEventListener('click', function() {
          startLanScanFromErrorScreen();
        });
      }
      if (serverBtn) {
        serverBtn.addEventListener('click', function() {
          openServerModal();
        });
      }
      updateErrorButtonsFocus();
    }
  }

  function handleErrorScreenKey(code, key, e) {
    if (code === 37 || key === 'ArrowLeft') {
      if (errorScreenState.focusedIndex > 0) errorScreenState.focusedIndex--;
      else errorScreenState.focusedIndex = 2;
      updateErrorButtonsFocus();
    } else if (code === 39 || key === 'ArrowRight') {
      if (errorScreenState.focusedIndex < 2) errorScreenState.focusedIndex++;
      else errorScreenState.focusedIndex = 0;
      updateErrorButtonsFocus();
    } else if (code === 13 || key === 'Enter') {
      if (errorScreenState.focusedIndex === 0) {
        window.location.reload();
      } else if (errorScreenState.focusedIndex === 1) {
        startLanScanFromErrorScreen();
      } else {
        openServerModal();
      }
    } else if (code === 405 || (code >= 48 && code <= 57)) {
      openServerModal();
    }
  }

  // ========== LAN Auto-Discovery Engine ==========
  function getTizenLocalIp() {
    try {
      if (typeof webapis !== 'undefined' && webapis.network && typeof webapis.network.getIP === 'function') {
        var ip = webapis.network.getIP();
        if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
      }
    } catch(e) {}
    return '';
  }

  function getCandidateSubnets() {
    var list = [];
    var tizenIp = getTizenLocalIp();
    if (tizenIp) {
      var m = tizenIp.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)/);
      if (m && list.indexOf(m[1]) === -1) list.push(m[1]);
    }
    var curH = (window.location && window.location.hostname) ? window.location.hostname : '';
    if (curH && /^(\d{1,3}\.){3}\d{1,3}$/.test(curH)) {
      var m2 = curH.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)/);
      if (m2 && list.indexOf(m2[1]) === -1) list.push(m2[1]);
    }
    var saved = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || localStorage.getItem('lumiere_tv_server') || '';
    if (saved) {
      var m3 = saved.match(/https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.)/);
      if (m3 && list.indexOf(m3[1]) === -1) list.push(m3[1]);
    }
    var defaults = ['192.168.1.', '192.168.0.', '192.168.31.', '192.168.88.', '10.0.0.'];
    for (var i = 0; i < defaults.length; i++) {
      if (list.indexOf(defaults[i]) === -1) list.push(defaults[i]);
    }
    return list;
  }

  function checkLumiereServer(url, timeoutMs, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + '/api/health', true);
    xhr.timeout = timeoutMs || 1500;
    try {
      xhr.setRequestHeader('X-Lumiere-TV', '1');
      xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
    } catch(e) {}
    xhr.onload = function() {
      if (xhr.status === 200) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && (data.status === 'ok' || data.name === 'lumiere')) {
            cb(true);
            return;
          }
        } catch(e) {}
      }
      cb(false);
    };
    xhr.onerror = function() { cb(false); };
    xhr.ontimeout = function() { cb(false); };
    try { xhr.send(); } catch(err) { cb(false); }
  }

  function scanSubnetForLumiere(subnet, onFound, onProgress, onDone) {
    var ips = [];
    var priority = [77, 1, 2, 3, 4, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 88, 90, 100, 101, 105, 110, 120, 150, 200, 250, 254];
    var saved = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || '';
    var savedOctet = saved.match(new RegExp('^https?:\\/\\/' + subnet.replace(/\./g, '\\.') + '(\\d+)'));
    if (savedOctet && savedOctet[1]) {
      var n = parseInt(savedOctet[1]);
      if (n > 0 && n < 255) ips.push(n);
    }
    for (var p = 0; p < priority.length; p++) {
      if (ips.indexOf(priority[p]) === -1) ips.push(priority[p]);
    }
    for (var i = 1; i <= 254; i++) {
      if (ips.indexOf(i) === -1) ips.push(i);
    }

    var stopped = false;
    var completed = 0;
    var activeCount = 0;
    var concurrency = 16;
    var index = 0;

    function launchNext() {
      if (stopped) return;
      if (completed >= ips.length) {
        if (!stopped) {
          stopped = true;
          onDone();
        }
        return;
      }

      while (activeCount < concurrency && index < ips.length && !stopped) {
        (function(ipNum) {
          activeCount++;
          var targetUrl = 'http://' + subnet + ipNum + ':3500';
          checkLumiereServer(targetUrl, 1500, function(found) {
            if (stopped) return;
            activeCount--;
            completed++;
            if (onProgress) onProgress(completed, ips.length, subnet);
            if (found) {
              stopped = true;
              onFound(targetUrl);
              return;
            }
            launchNext();
          });
        })(ips[index++]);
      }
    }

    launchNext();
    return function stop() { stopped = true; };
  }

  var currentScanAborter = null;
  function startLanScanFromErrorScreen() {
    var msgEl = document.getElementById('tv-err-msg');
    var scanBtn = document.getElementById('tv-err-btn-scan');
    if (scanBtn) {
      scanBtn.textContent = '⏳ Поиск...';
    }

    var subnets = getCandidateSubnets();
    var sIdx = 0;

    function scanNextSubnet() {
      if (sIdx >= subnets.length) {
        if (msgEl) {
          msgEl.innerHTML = '<span style="color:#f87171;">Сервер Lumière не найден в локальной сети. Убедитесь, что сервер запущен (порт 3500), или введите адрес вручную.</span>';
        }
        if (scanBtn) scanBtn.textContent = '🔍 Найти в сети';
        errorScreenState.focusedIndex = 2;
        updateErrorButtonsFocus();
        return;
      }

      var subnet = subnets[sIdx++];
      if (msgEl) {
        msgEl.innerHTML = '🔍 Поиск сервера Lumière в сети <b style="color:#e8c170;">' + subnet + 'x:3500</b>...';
      }

      currentScanAborter = scanSubnetForLumiere(
        subnet,
        function(foundUrl) {
          if (msgEl) {
            msgEl.innerHTML = '✓ Найден сервер Lumière: <b style="color:#6ee7b7;">' + foundUrl + '</b>! Подключение...';
          }
          applyNewServer(foundUrl);
        },
        function(completed, total) {
          if (msgEl) {
            msgEl.innerHTML = '🔍 Поиск сервера Lumière в сети <b style="color:#e8c170;">' + subnet + 'x:3500</b> (' + completed + '/' + total + ')...';
          }
        },
        function() {
          scanNextSubnet();
        }
      );
    }

    scanNextSubnet();
  }

  function startLanScanFromModal() {
    showServerModalStatus('🔍 Поиск сервера Lumière в локальной сети (порт 3500)...', 'loading');
    var subnets = getCandidateSubnets();
    var sIdx = 0;

    function scanNext() {
      if (sIdx >= subnets.length) {
        showServerModalStatus('Сервер не найден в локальной сети. Введите адрес вручную.', 'error');
        return;
      }
      var subnet = subnets[sIdx++];
      showServerModalStatus('Поиск в сети ' + subnet + 'x:3500...', 'loading');

      currentScanAborter = scanSubnetForLumiere(
        subnet,
        function(foundUrl) {
          var input = document.getElementById('tv-server-input');
          if (input) input.value = foundUrl;
          showServerModalStatus('✓ Найден сервер: ' + foundUrl + '! Подключение...', 'success');
          applyNewServer(foundUrl);
        },
        function(completed, total) {
          showServerModalStatus('Поиск в сети ' + subnet + 'x (' + completed + '/' + total + ')...', 'loading');
        },
        function() {
          scanNext();
        }
      );
    }

    scanNext();
  }

  // ========== Server Configuration Modal ==========
  var serverModalState = {
    active: false,
    curRow: 5,
    curCol: 0,
    rows: [],
    failedUrl: null
  };

  function openServerModal() {
    var modal = document.getElementById('tv-server-modal');
    if (!modal) return;
    serverModalState.active = true;
    serverModalState.failedUrl = null;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    var currentServer = localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || localStorage.getItem('lumiere_tv_server') || API || (window.location.origin && !window.location.origin.startsWith('file') ? window.location.origin : 'http://');
    var input = document.getElementById('tv-server-input');
    if (input) {
      input.value = currentServer;
      if (!input._eventsBound) {
        input._eventsBound = true;
        input.addEventListener('input', function() {
          serverModalState.failedUrl = null;
          showServerModalStatus('', '');
        });
      }
    }
    showServerModalStatus('', '');

    buildServerModalRows();
    // Default focus to connect button (last row)
    serverModalState.curRow = Math.max(0, serverModalState.rows.length - 1);
    serverModalState.curCol = 0;
    updateServerModalFocus();

    if (!modal._clicksBound) {
      modal._clicksBound = true;
      var btns = modal.querySelectorAll('button');
      for (var b = 0; b < btns.length; b++) {
        (function(btn) {
          btn.addEventListener('click', function() {
            handleServerKeyAction(btn);
          });
        })(btns[b]);
      }
    }
  }

  function closeServerModal() {
    var modal = document.getElementById('tv-server-modal');
    if (!modal) return;
    serverModalState.active = false;
    serverModalState.failedUrl = null;
    modal.classList.add('hidden');
    modal.style.display = 'none';

    if (errorScreenState.active) {
      errorScreenState.focusedIndex = 1;
      updateErrorButtonsFocus();
    }
  }

  function showServerModalStatus(msg, type) {
    var el = document.getElementById('tv-server-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'tv-server-status ' + (type || '');
  }

  function buildServerModalRows() {
    var modal = document.getElementById('tv-server-modal');
    if (!modal) return;
    serverModalState.rows = [];

    // Row 0: Input field and backspace button
    var inputEl = document.getElementById('tv-server-input');
    var backKey = document.getElementById('tv-server-key-back');
    if (inputEl && backKey) {
      serverModalState.rows.push([inputEl, backKey]);
    } else if (inputEl) {
      serverModalState.rows.push([inputEl]);
    }

    var rowEls = modal.querySelectorAll('.tv-server-keypad-row');
    for (var r = 0; r < rowEls.length; r++) {
      var btns = rowEls[r].querySelectorAll('button');
      var rowBtns = [];
      for (var b = 0; b < btns.length; b++) rowBtns.push(btns[b]);
      if (rowBtns.length > 0) {
        serverModalState.rows.push(rowBtns);
      }
    }
  }

  function updateServerModalFocus() {
    if (!serverModalState.rows || serverModalState.rows.length === 0) {
      buildServerModalRows();
    }
    var prev = document.querySelectorAll('#tv-server-modal .focused');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('focused');

    var r = serverModalState.curRow;
    var c = serverModalState.curCol;
    if (r < 0) r = 0;
    if (r >= serverModalState.rows.length) r = serverModalState.rows.length - 1;
    serverModalState.curRow = r;

    var curRowBtns = serverModalState.rows[r] || [];
    if (c < 0) c = 0;
    if (c >= curRowBtns.length) c = curRowBtns.length - 1;
    serverModalState.curCol = c;

    var targetBtn = curRowBtns[c];
    if (targetBtn) {
      targetBtn.classList.add('focused');
      if (targetBtn.id !== 'tv-server-input') {
        try { targetBtn.focus(); } catch(e) {}
      }
    }
  }

  function appendServerInputText(txt) {
    var input = document.getElementById('tv-server-input');
    if (!input) return;
    input.value = (input.value || '') + txt;
    serverModalState.failedUrl = null;
    showServerModalStatus('', '');
  }

  function backspaceServerInput() {
    var input = document.getElementById('tv-server-input');
    if (!input || !input.value) return;
    input.value = input.value.slice(0, -1);
    serverModalState.failedUrl = null;
    showServerModalStatus('', '');
  }

  function handleServerKeyAction(btn) {
    if (!btn) return;
    var text = btn.getAttribute('data-text');
    var action = btn.getAttribute('data-action');

    if (text) {
      appendServerInputText(text);
      return;
    }

    if (action === 'backspace') {
      backspaceServerInput();
    } else if (action === 'clear') {
      var input = document.getElementById('tv-server-input');
      if (input) {
        input.value = '';
        serverModalState.failedUrl = null;
        showServerModalStatus('', '');
      }
    } else if (action === 'scan') {
      startLanScanFromModal();
    } else if (action === 'curhost') {
      var cur = (window.location && window.location.hostname && window.location.hostname !== 'localhost') ?
        ((window.location.protocol || 'http:') + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '')) :
        'http://';
      var input = document.getElementById('tv-server-input');
      if (input) {
        input.value = cur;
        serverModalState.failedUrl = null;
        showServerModalStatus('', '');
      }
    } else if (action === 'default') {
      var def = window.__DEFAULT_SERVER_URL__ || (window.location.origin && !window.location.origin.startsWith('file') ? window.location.origin : 'http://');
      var input = document.getElementById('tv-server-input');
      if (input) {
        input.value = def;
        serverModalState.failedUrl = null;
        showServerModalStatus('', '');
      }
    } else if (action === 'connect') {
      var input = document.getElementById('tv-server-input');
      testAndSaveServer(input ? input.value : '');
    } else if (action === 'cancel') {
      closeServerModal();
    }
  }

  function testAndSaveServer(serverUrl) {
    var rawUrl = (serverUrl || '').trim();
    if (!rawUrl) {
      showServerModalStatus('Введите адрес сервера', 'error');
      return;
    }

    // Strip trailing slashes
    rawUrl = rawUrl.replace(/\/+$/, '');

    // If user is confirming force-save for the same URL after warning
    if (serverModalState.failedUrl && serverModalState.failedUrl === rawUrl) {
      console.log('[Lumiere] User confirmed force-save for:', rawUrl);
      var forced = rawUrl;
      if (!/^https?:\/\//i.test(forced)) {
        var isDomain = !/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(forced);
        var curProto = (window.location && window.location.protocol === 'https:') ? 'https://' : 'http://';
        forced = (isDomain ? curProto : 'http://') + forced;
      }
      applyNewServer(forced);
      return;
    }

    // Prepare candidate URLs
    var candidates = [];
    var isIpWithoutPort = /^(?:https?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}$/.test(rawUrl);
    var hasPort = /:\d+$/.test(rawUrl);

    if (isIpWithoutPort) {
      // User entered raw IP (e.g. 192.168.1.77) -> default to port 3500!
      var cleanIp = rawUrl.replace(/^https?:\/\//i, '');
      candidates.push('http://' + cleanIp + ':3500');
      candidates.push('http://' + cleanIp);
      candidates.push('https://' + cleanIp);
    } else if (hasPort) {
      // User entered an address with a port, e.g. "192.168.1.77:3000"
      var clean = rawUrl;
      if (!/^https?:\/\//i.test(clean)) clean = 'http://' + clean;
      candidates.push(clean);
      if (clean.indexOf('http://') === 0) candidates.push(clean.replace('http://', 'https://'));
      else candidates.push(clean.replace('https://', 'http://'));

      // If user typed a non-standard port like :3000, ALSO probe standard port :3500!
      if (!/:3500$/.test(clean)) {
        var with3500 = clean.replace(/:\d+$/, ':3500');
        candidates.push(with3500);
      }
    } else {
      // Domain name without port (e.g. lumiere.artrax.net)
      var cleanDomain = rawUrl.replace(/^https?:\/\//i, '');
      var isPageHttps = (window.location && window.location.protocol === 'https:');
      if (isPageHttps || !/^(?:\d{1,3}\.){3}\d{1,3}/.test(cleanDomain)) {
        candidates.push('https://' + cleanDomain);
        candidates.push('http://' + cleanDomain);
        candidates.push('http://' + cleanDomain + ':3500');
      } else {
        candidates.push('http://' + cleanDomain + ':3500');
        candidates.push('http://' + cleanDomain);
        candidates.push('https://' + cleanDomain);
      }
    }

    showServerModalStatus('Проверка подключения...', 'loading');

    var cIndex = 0;
    function tryNextCandidate() {
      if (cIndex >= candidates.length) {
        serverModalState.failedUrl = rawUrl;
        showServerModalStatus('Не удалось подключиться к ' + rawUrl + '. Нажмите «Подключиться» ещё раз для принудительного сохранения.', 'warning');
        return;
      }

      var candidate = candidates[cIndex++];
      showServerModalStatus('Проверка подключения к ' + candidate + '...', 'loading');

      testServerUrl(candidate, function(success) {
        if (success) {
          serverModalState.failedUrl = null;
          applyNewServer(candidate);
        } else {
          tryNextCandidate();
        }
      });
    }

    tryNextCandidate();
  }

  function testServerUrl(candidateUrl, cb) {
    var endpoints = ['/api/health', '/api/setup/status', '/api/auth/lan-status'];
    var epIndex = 0;

    function tryEndpoint() {
      if (epIndex >= endpoints.length) {
        cb(false);
        return;
      }
      var ep = endpoints[epIndex++];
      var xhr = new XMLHttpRequest();
      xhr.open('GET', candidateUrl + ep, true);
      xhr.timeout = 3500;
      try {
        xhr.setRequestHeader('X-Lumiere-TV', '1');
        xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
      } catch(e) {}

      xhr.onload = function() {
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            // Verify Lumiere response
            if (data && (data.status === 'ok' || data.name === 'lumiere' || typeof data.needsSetup !== 'undefined' || typeof data.isLan !== 'undefined')) {
              cb(true);
              return;
            }
          } catch(e) {}
        }
        tryEndpoint();
      };
      xhr.onerror = function() {
        tryEndpoint();
      };
      xhr.ontimeout = function() {
        tryEndpoint();
      };
      try {
        xhr.send();
      } catch(err) {
        tryEndpoint();
      }
    }

    tryEndpoint();
  }

  function applyNewServer(url) {
    showServerModalStatus('✓ Сервер сохранён! Перезагрузка...', 'success');
    try {
      localStorage.setItem(SERVER_KEY, url);
      localStorage.setItem('lumiere_server_url', url);
      localStorage.setItem('lumiere_tv_server', url);
      localStorage.removeItem(TOKEN_KEY);
    } catch(e) {}
    API = url;
    setTimeout(function() {
      window.location.reload();
    }, 600);
  }

  function handleServerModalKey(code, key, e) {
    if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
      closeServerModal();
      return;
    }

    if (code === 8 || key === 'Backspace') {
      backspaceServerInput();
      return;
    }

    if (code >= 96 && code <= 105) {
      appendServerInputText(String(code - 96));
      return;
    }

    if (code === 37 || key === 'ArrowLeft') {
      if (serverModalState.curCol > 0) {
        serverModalState.curCol--;
      } else {
        var r = serverModalState.curRow;
        var rBtns = serverModalState.rows[r] || [];
        serverModalState.curCol = Math.max(0, rBtns.length - 1);
      }
      updateServerModalFocus();
      return;
    }
    if (code === 39 || key === 'ArrowRight') {
      var r = serverModalState.curRow;
      var rBtns = serverModalState.rows[r] || [];
      if (serverModalState.curCol < rBtns.length - 1) {
        serverModalState.curCol++;
      } else {
        serverModalState.curCol = 0;
      }
      updateServerModalFocus();
      return;
    }
    if (code === 38 || key === 'ArrowUp') {
      if (serverModalState.curRow > 0) {
        serverModalState.curRow--;
        updateServerModalFocus();
      }
      return;
    }
    if (code === 40 || key === 'ArrowDown') {
      if (serverModalState.curRow < serverModalState.rows.length - 1) {
        serverModalState.curRow++;
        updateServerModalFocus();
      }
      return;
    }

    if (code === 13 || key === 'Enter') {
      var curRowBtns = serverModalState.rows[serverModalState.curRow] || [];
      var target = curRowBtns[serverModalState.curCol];
      if (target) {
        if (target.id === 'tv-server-input') {
          try { target.focus(); } catch(e) {}
        } else {
          handleServerKeyAction(target);
        }
      }
      return;
    }

    // Handle typing from physical keyboard / remote alphanumeric keys
    if (e && e.key && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      appendServerInputText(e.key);
      return;
    }
  }

  // ========== App Start ==========
  function startApp() {
    try {
      console.log('[Lumiere] startApp begin');
      window._appStarted = true;

      // Ensure full DOM structure is synchronized from /tv/index.html
      syncDomWithServer(API);

      $loading = document.getElementById('loading');
      $app = document.getElementById('app');
      $topbar = document.getElementById('topbar');
      $content = document.getElementById('content');
      $detail = document.getElementById('detail');

      if ($loading) {
        $loading.classList.add('hidden');
        $loading.style.display = 'none';
      }
      if ($app) {
        $app.classList.remove('hidden');
        $app.style.display = 'block';
      }

      updateTvUserBadge();

      var serverUrlEl = document.getElementById('server-url');
      if (serverUrlEl) serverUrlEl.textContent = API;

      // 1. Keyboard & Navigation MUST be set up first and protected from data loading errors
      console.log('[Lumiere] setupKeyboard');
      try {
        if (typeof setupKeyboard === 'function') setupKeyboard();
      } catch(kErr) {
        console.error('[Lumiere] setupKeyboard error:', kErr);
      }

      console.log('[Lumiere] setupNavigation');
      try {
        if (typeof setupNavigation === 'function') setupNavigation();
      } catch(nErr) {
        console.error('[Lumiere] setupNavigation error:', nErr);
      }

      // 2. Load data & other features individually protected
      console.log('[Lumiere] loadData');
      try {
        if (typeof loadData === 'function') loadData();
      } catch(dErr) {
        console.error('[Lumiere] loadData error:', dErr);
      }

      console.log('[Lumiere] setupSearch');
      try {
        if (typeof setupSearch === 'function') setupSearch();
      } catch(sErr) {
        console.error('[Lumiere] setupSearch error:', sErr);
      }

      console.log('[Lumiere] setupIptvSearch');
      try {
        if (typeof setupIptvSearch === 'function') setupIptvSearch();
      } catch(isErr) {
        console.error('[Lumiere] setupIptvSearch error:', isErr);
      }

      if (typeof setupIptvEvents === 'function') {
        try {
          setupIptvEvents();
        } catch(ieErr) {
          console.error('[Lumiere] setupIptvEvents error:', ieErr);
        }
      }

      if (typeof syncWithServer === 'function') {
        try {
          syncWithServer(function() {
            console.log('[App] Sync complete, loading IPTV');
            if (typeof loadIptv === 'function') loadIptv();
          });
        } catch(swsErr) {
          console.error('[Lumiere] syncWithServer error:', swsErr);
        }
      }

      try {
        checkDetailParam();
      } catch(cdErr) {
        console.error('[Lumiere] checkDetailParam error:', cdErr);
      }

      setTimeout(function() {
        try {
          if (typeof focusNav === 'function') focusNav(0);
        } catch(fe) {}
      }, 100);

      // 3. Initialize notifications & EPG reminders
      try {
        if (typeof loadNotifications === 'function') loadNotifications();
        if (typeof loadEpgReminders === 'function') loadEpgReminders();
        setInterval(function() {
          if (typeof loadNotifications === 'function') loadNotifications();
        }, 60000);
        setInterval(function() {
          if (typeof checkEpgReminders === 'function') checkEpgReminders();
        }, 2500);
      } catch(ne) {
        console.warn('[Lumiere] Notification/EPG reminder init error:', ne);
      }

      console.log('[Lumiere] startApp completed successfully!');
    } catch(e) {
      console.error('[Lumiere] startApp error: ' + (e.message || e) + '\n' + (e.stack || ''));
      showError('Ошибка запуска: ' + (e.message || 'unknown'));
    }
  }

  // Check URL for ?detail=ID parameter (returning from player)
  function checkDetailParam() {
    var search = window.location.search.substring(1);
    var params = {};
    search.split('&').forEach(function(pair) {
      var parts = pair.split('=');
      if (parts.length === 2) params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
    var detailId = params.detail;
    if (detailId) {
      // Fetch movie details and open detail view
      apiFetch('/api/movies/' + detailId, function(err, data) {
        if (data && data.id) {
          showDetail(data);
        }
      });
      // Clean URL
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }

  // ========== Cinematic Hero Banner (Removed from Home) ==========
  var currentHeroTitle = null;
  var heroFocusedBtnIndex = -1;

  function updateHeroBanner(titleData) {
    // Hero banner removed. Background is handled via debounced updateHomeBg.
  }

  function setupHeroButtons() {}
  function focusHeroBtn(idx) {}
  function clearHeroFocus() {}
  function handleHeroBtnKeys(code, e) {}

  // ========== Data Loading ==========
  function loadData() {
    renderContinueWatching();
    renderHistoryRecommendations();

    // 1. Trending movies + Top 10 Movies
    apiFetch('/api/movies/trending', function(err, data) {
      if (data && data.results && data.results.length > 0) {
        state.trendingMovies = data.results;
        renderTop10Row('top10-movies-items', data.results.slice(0, 10));
        var trendingSlice = data.results.length > 10 ? data.results.slice(10, 30) : data.results;
        renderRow('trending-items', trendingSlice);
      }
    });

    // 2. Recommendations: Unique movies without duplicates from Trending/Top 10
    apiFetch('/api/movies/now_playing', function(err, data) {
      if (data && data.results && data.results.length > 0) {
        var seenIds = {};
        if (state.trendingMovies) {
          state.trendingMovies.forEach(function(m) { seenIds[m.id] = true; });
        }
        var uniqueRecommendations = data.results.filter(function(m) {
          return !seenIds[m.id];
        });
        var recs = uniqueRecommendations.length >= 5 ? uniqueRecommendations : data.results;
        renderRow('now-playing-items', recs.slice(0, 25));
      }
    });

    // 3. Popular movies
    apiFetch('/api/movies/popular', function(err, data) {
      if (data && data.results && data.results.length > 0) {
        state.movies = data.results;
        renderRow('popular-items', data.results.slice(0, 25));
        renderGrid('movies-grid', data.results);
      }
    });

    // 4. Top Rated movies (Masterpieces)
    apiFetch('/api/movies/top_rated', function(err, data) {
      if (data && data.results && data.results.length > 0) {
        renderRow('top-rated-items', data.results.slice(0, 25));
      }
    });

    // 5. Top 10 TV Shows of the week
    apiFetch('/api/tv/trending', function(err, data) {
      if (data && data.results && data.results.length > 0) {
        renderTop10Row('top10-tv-items', data.results.slice(0, 10));
      }
    });

    // 6. Popular TV Shows
    apiFetch('/api/tv/popular', function(err, data) {
      if (data && data.results && data.results.length > 0) {
        state.tvShows = data.results;
        renderRow('tv-items', data.results.slice(0, 25));
        renderGrid('tv-grid', data.results);
      }
    });

    // Continue watching from localStorage & server
    renderContinueWatching();

    loadIptv();
    loadAndApplyHomeShelves();
  }

  function cleanMovieTitle(raw) {
    if (!raw) return '';
    if (raw.indexOf(' / ') !== -1) {
      var parts = raw.split(' / ');
      if (/[\u0400-\u04FF]/.test(parts[0])) return parts[0].trim();
    }
    return raw.replace(/\.(mkv|mp4|avi|mov|m4v|ts)$/i, '').replace(/_/g, ' ').trim();
  }

  function renderContinueWatching() {
    var container = document.getElementById('continue-items');
    if (!container) return;

    var positions = {};
    try { positions = JSON.parse(localStorage.getItem('playback_positions') || '{}'); } catch(e) {}

    var lastTorrents = {};
    try { lastTorrents = JSON.parse(localStorage.getItem('last_torrents') || '{}'); } catch(e) {}

    var changed = false;
    var items = [];
    for (var id in positions) {
      var pos = positions[id];
      var isIptv = isNaN(Number(id)) || Number(id) <= 0 ||
                   (pos && pos.title && pos.title.type === 'iptv') ||
                   (pos && pos.duration === 0);
      if (isIptv) {
        delete positions[id];
        changed = true;
        continue;
      }
      if (typeof pos === 'object' && (pos.time >= 1 || pos.progress >= 1)) {
        var pTitle = pos.title || (lastTorrents[id] ? lastTorrents[id].title : null) || 'Видео';
        items.push({ id: Number(id), time: pos.time || pos.progress || 0, duration: pos.duration || 0, timestamp: pos.timestamp || 0, title: pTitle });
      } else if (typeof pos === 'number' && pos >= 1) {
        items.push({ id: Number(id), time: pos, duration: 0, timestamp: 0, title: (lastTorrents[id] && lastTorrents[id].title) || 'Продолжить просмотр' });
      }
    }

    if (changed) {
      try { localStorage.setItem('playback_positions', JSON.stringify(positions)); } catch(e) {}
    }

    items.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

    if (items.length === 0) {
      var row = document.getElementById('row-continue');
      if (row) row.style.display = 'none';
      return;
    }

    var row = document.getElementById('row-continue');
    if (row) row.style.display = 'block';

    container.innerHTML = '';
    items.slice(0, 12).forEach(function(item) {
      try {
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('tabindex', '0');
        card._continueItem = item;
        var rawName = (item.title && typeof item.title === 'object') ? (item.title.name || item.title.logoText || '') : (item.title || '');
        var poster = (item.title && typeof item.title === 'object') ? (item.title.poster || '') : '';
        var torrent = lastTorrents[item.id];

        // Immediate cleanup if name is a raw filename but torrent has Russian title
        var name = rawName;
        if ((!/[\u0400-\u04FF]/.test(name) || /\.(mkv|mp4|avi)$/i.test(name)) && torrent && torrent.title && /[\u0400-\u04FF]/.test(torrent.title)) {
          name = cleanMovieTitle(torrent.title);
        } else if (/\.(mkv|mp4|avi)$/i.test(name)) {
          name = cleanMovieTitle(name);
        }

        var imgSrc = imgUrl(poster);

        // Fetch official Russian metadata & poster from API
        if (item.id && !isNaN(Number(item.id))) {
          var itemMediaType = (item.title && item.title.type) || (torrent && torrent.type) || (/ · S[0-9]+/i.test(rawName) ? 'tv' : 'movie');
          var apiEndpoint = (itemMediaType === 'tv') ? '/api/tv/' : '/api/movies/';

          var applyApiData = function(data, type) {
            if (!data) return;
            var ruName = data.name || data.title;
            if (ruName) {
              var displayName = ruName;
              if (type === 'tv') {
                var sMatch = rawName.match(/ · S\d+.*$/i) || rawName.match(/S\d+E\d+/i);
                if (sMatch) displayName = ruName + (sMatch[0].indexOf(' · ') === 0 ? sMatch[0] : ' · ' + sMatch[0]);
              }
              var titleEl = card.querySelector('.card-title');
              if (titleEl) {
                var tText = titleEl.querySelector('.card-title-text');
                if (tText) {
                  tText.textContent = displayName;
                } else {
                  titleEl.innerHTML = '<span class="card-title-text">' + esc(displayName) + '</span>';
                }
              }
              card._titleData.name = displayName;
              name = displayName;
              if (card.classList.contains('focused') || document.activeElement === card) {
                if (typeof startCardTitleMarquee === 'function') startCardTitleMarquee(card);
              }

              // Persist clean Russian title in playback_positions
              if (positions[item.id]) {
                if (typeof positions[item.id].title !== 'object') {
                  positions[item.id].title = { name: displayName, poster: data.poster || '', id: item.id, type: type };
                } else {
                  positions[item.id].title.name = displayName;
                  positions[item.id].title.type = type;
                  if (data.poster && !positions[item.id].title.poster) {
                    positions[item.id].title.poster = data.poster;
                  }
                }
                try { localStorage.setItem('playback_positions', JSON.stringify(positions)); } catch(e) {}
              }

              // Also persist in last_torrents
              if (lastTorrents[item.id]) {
                lastTorrents[item.id].title = ruName;
                lastTorrents[item.id].type = type;
                try { localStorage.setItem('last_torrents', JSON.stringify(lastTorrents)); } catch(e) {}
              }
            }

            if (data.poster) {
              var imgEl = card.querySelector('img');
              if (imgEl && (!imgEl.src || imgEl.src.indexOf('/api/image') === -1)) {
                imgEl.src = imgUrl(data.poster);
              }
            }
          };

          apiFetch(apiEndpoint + item.id + '?lang=ru', function(err, data) {
            if ((err || !data) && itemMediaType !== 'tv') {
              apiFetch('/api/tv/' + item.id + '?lang=ru', function(err2, data2) {
                if (data2) applyApiData(data2, 'tv');
              });
              return;
            }
            if (data) applyApiData(data, itemMediaType);
          });
        }

        var maxDur = item.duration > 0 ? item.duration : 7200;
        var fillPct = Math.min(100, Math.max(2, (item.time / maxDur) * 100));

        var timeStr = typeof fmtTime === 'function' ? fmtTime(item.time) : (item.time + 'с');
        var durStr = item.duration ? (' из ' + (typeof fmtTime === 'function' ? fmtTime(item.duration) : (item.duration + 'с'))) : '';

        card._titleData = {
          id: item.id,
          name: name,
          poster: poster,
          score: null,
          year: null,
          genre: 'Продолжить просмотр',
          overview: 'Вы остановились на ' + timeStr + durStr
        };

        card.innerHTML = '<div class="card-progress-wrap"><img class="card-img" src="' + esc(imgSrc || '') + '" alt="' + esc(name) + '" loading="lazy">' +
          '<div class="card-progress-bar"><div class="card-progress-fill" style="width:' + fillPct + '%"></div></div></div>' +
          '<div class="card-title"><span class="card-title-text">' + esc(name) + '</span></div>';

        card.addEventListener('focus', function() {
          if (state.section === 'home' && typeof updateHeroBanner === 'function') {
            updateHeroBanner(card._titleData);
          }
          if (typeof startCardTitleMarquee === 'function') {
            startCardTitleMarquee(card);
          }
        });

        card.addEventListener('blur', function() {
          if (typeof stopCardTitleMarquee === 'function') {
            stopCardTitleMarquee(card);
          }
        });

        card.addEventListener('mouseenter', function() {
          if (typeof startCardTitleMarquee === 'function') {
            startCardTitleMarquee(card);
          }
        });

        card.addEventListener('mouseleave', function() {
          if (!card.classList.contains('focused') && document.activeElement !== card) {
            if (typeof stopCardTitleMarquee === 'function') {
              stopCardTitleMarquee(card);
            }
          }
        });

        card.addEventListener('click', function() {
          var tObj = lastTorrents[item.id];
          var curType = (tObj && tObj.type) || (item.title && item.title.type) || 'movie';
          if (tObj && tObj.magnet) {
            state.detail = { id: item.id, name: name, type: curType, poster: poster };
            openTorrent(tObj.magnet, tObj.title || name);
          } else {
            var titleObj = { id: item.id, name: name, type: curType, poster: poster, backdrop: '', year: 0, runtime: '', rating: '', score: 0, genres: [], description: '' };
            showDetail(titleObj);
          }
        });

        container.appendChild(card);
      } catch(itemErr) {
        console.error('[Lumiere] Error rendering continue watching item:', itemErr);
      }
    });
  }

  // ========== Personalized History-based Recommendations ==========
  function renderHistoryRecommendations() {
    var container = document.getElementById('recommended-history-items');
    var row = document.getElementById('row-recommended-history');
    if (!container || !row) return;

    var positions = {};
    try { positions = JSON.parse(localStorage.getItem('playback_positions') || '{}'); } catch(e) {}

    var watchedIds = [];
    var watchedItems = [];
    for (var id in positions) {
      var numId = parseInt(id);
      if (numId > 0) {
        watchedIds.push(numId);
        var pos = positions[id];
        var ts = (typeof pos === 'object') ? (pos.timestamp || 0) : 0;
        watchedItems.push({ id: numId, timestamp: ts });
      }
    }
    watchedItems.sort(function(a, b) { return (b.timestamp || 0) - (a.timestamp || 0); });

    // If no history yet, populate with top popular movies
    if (watchedItems.length === 0) {
      apiFetch('/api/movies/popular', function(err, data) {
        if (data && data.results && data.results.length > 0) {
          row.style.display = 'block';
          container.innerHTML = '';
          data.results.slice(0, 15).forEach(function(item) {
            container.appendChild(createCard(item));
          });
        } else {
          row.style.display = 'none';
        }
      });
      return;
    }

    // Pick top 3 most recently watched movie IDs
    var sampleIds = watchedItems.slice(0, 3).map(function(item) { return item.id; });
    var collected = [];
    var seenMap = {};
    watchedIds.forEach(function(wid) { seenMap[wid] = true; });

    var pending = sampleIds.length;
    sampleIds.forEach(function(wid) {
      apiFetch('/api/movies/' + wid + '/similar', function(err, data) {
        pending--;
        if (data && data.results && Array.isArray(data.results)) {
          data.results.forEach(function(m) {
            if (m && m.id && !seenMap[m.id]) {
              seenMap[m.id] = true;
              collected.push(m);
            }
          });
        }
        if (pending === 0) {
          if (collected.length > 0) {
            collected.sort(function(a, b) {
              var sa = a.score || a.vote_average || 0;
              var sb = b.score || b.vote_average || 0;
              return sb - sa;
            });
            row.style.display = 'block';
            container.innerHTML = '';
            collected.slice(0, 18).forEach(function(rec) {
              container.appendChild(createCard(rec));
            });
          } else {
            apiFetch('/api/movies/top_rated', function(err2, topData) {
              if (topData && topData.results && topData.results.length > 0) {
                row.style.display = 'block';
                container.innerHTML = '';
                topData.results.filter(function(m) { return !seenMap[m.id]; }).slice(0, 15).forEach(function(rec) {
                  container.appendChild(createCard(rec));
                });
              } else {
                row.style.display = 'none';
              }
            });
          }
        }
      });
    });
  }


  // ==================== IPTV ====================
  // ==================== IPTV ====================
  var iptvState = {
    channels: [],
    groups: [],
    selectedGroup: 'Все',
    favorites: {},
    epgData: {},
    epgChannelMap: {},
    epgIconMap: {},
    epgNameLookup: {},
    searchQuery: '',
    focusedCol: -1, // -1=nav/none, 0=categories, 1=channels, 2=preview
    focusedCat: 0,
    focusedCh: 0,
    focusedCol2Index: 0,
    currentChannel: null,
    previewVideo: null,
    playlists: [],
    selectedPlaylistIndex: -1,
    navItems: []
  };

  var iptvLocked = false;

  // ==================== Notifications & EPG Reminders ====================
  var notifState = {
    items: [],
    unreadCount: 0,
    focusedIndex: -1, // -1: top buttons, 0+: notification cards
    focusedTopBtn: 0  // 0: #btn-tv-check-episodes, 1: #btn-tv-read-all
  };

  var epgReminderState = {
    reminders: [],
    activeToastReminder: null,
    dismissedIds: {}
  };

  function loadIptv(callback) {
    try {
      apiFetch('/api/sync/pull', function(err, data) {
        var playlists = (data && data.iptvPlaylists && data.iptvPlaylists.length > 0) ? data.iptvPlaylists : [];
        if (playlists.length === 0) {
          try { playlists = JSON.parse(localStorage.getItem('lumiere_iptv') || localStorage.getItem('iptv_playlists') || '[]'); } catch(e) {}
        }
        playlists = (playlists || []).filter(function(pl) {
          return pl && pl.url && pl.url.indexOf('test/') === -1 && pl.url.indexOf('https://test') === -1;
        });
        if (playlists.length === 0) {
          playlists = [{ name: 'Основной', url: 'https://loganettv.github.io/playlists/all.m3u', epgUrl: '' }];
        }
        iptvState.playlists = playlists;
        try { localStorage.setItem('lumiere_iptv', JSON.stringify(playlists)); } catch(e) {}

        var activeIdx = -1;
        try {
          var savedPl = localStorage.getItem('lumiere_active_iptv_playlist');
          if (savedPl !== null && savedPl !== undefined && savedPl !== '') activeIdx = parseInt(savedPl, 10);
        } catch(e) {}
        if (isNaN(activeIdx) || activeIdx >= playlists.length) activeIdx = -1;
        iptvState.selectedPlaylistIndex = activeIdx;

        loadAllPlaylists(playlists, activeIdx, callback);
      });
    } catch(e) { console.error('[IPTV] loadIptv error:', e); if (typeof callback === 'function') callback(e); }
  }

  function loadAllPlaylists(playlists, activeIdx, callback) {
    if (!playlists || playlists.length === 0) {
      if (typeof callback === 'function') callback(null);
      return;
    }
    iptvState.playlists = playlists;
    var countEl = document.getElementById('iptv-channel-count');
    var chListEl = document.getElementById('iptv-channels');
    var catListEl = document.getElementById('iptv-cat-list');
    if (countEl) countEl.textContent = 'Загрузка...';
    if (chListEl && (!iptvState.channels || iptvState.channels.length === 0)) {
      chListEl.innerHTML = '<div style="padding:48px 20px;color:#e8c170;font-size:20px;text-align:center;"><div class="spinner" style="margin:0 auto 20px;"></div>Загрузка списка телеканалов...</div>';
    }
    if (catListEl && (!iptvState.channels || iptvState.channels.length === 0)) {
      catListEl.innerHTML = '<div style="padding:24px 16px;color:rgba(255,255,255,0.5);font-size:16px;">Загрузка...</div>';
    }

    var loaded = 0;
    for (var i = 0; i < playlists.length; i++) {
      (function(idx, pl) {
        if (pl.channels && pl.channels.length > 0) {
          var plName = pl.name || ('Плейлист ' + (idx + 1));
          for (var c = 0; c < pl.channels.length; c++) {
            pl.channels[c].playlistIndex = idx;
            pl.channels[c].playlistName = plName;
            if (!pl.channels[c].id || String(pl.channels[c].id).indexOf('pl' + idx) !== 0) {
              pl.channels[c].id = 'pl' + idx + '_' + (pl.channels[c].id || c);
            }
          }
          loaded++;
          if (loaded === playlists.length) {
            applyActivePlaylist(activeIdx);
            if (typeof callback === 'function') callback(null);
          }
          return;
        }
        apiPost('/api/iptv/parse', { url: pl.url }, function(err, data) {
          loaded++;
          var chs = (data && data.channels) ? data.channels : [];
          var grps = (data && data.groups) ? data.groups : [];
          var plName = pl.name || ('Плейлист ' + (idx + 1));
          for (var c = 0; c < chs.length; c++) {
            chs[c].playlistIndex = idx;
            chs[c].playlistName = plName;
            chs[c].id = 'pl' + idx + '_' + chs[c].id;
          }
          pl.channels = chs;
          pl.groups = grps;
          if (data && data.epgUrl) pl.epgUrl = data.epgUrl;

          if (loaded === playlists.length) {
            applyActivePlaylist(activeIdx);
            for (var p = 0; p < playlists.length; p++) {
              if (playlists[p].epgUrl) loadEpg(playlists[p].epgUrl);
            }
            if (typeof callback === 'function') callback(null);
          }
        });
      })(i, playlists[i]);
    }
  }

  function applyActivePlaylist(plIdx) {
    iptvState.selectedPlaylistIndex = plIdx;
    try { localStorage.setItem('lumiere_active_iptv_playlist', String(plIdx)); } catch(e) {}

    var allChs = [];
    var allGrps = [];
    var grpSeen = {};

    var pls = iptvState.playlists || [];
    if (plIdx === -1) {
      for (var i = 0; i < pls.length; i++) {
        var pch = pls[i].channels || [];
        for (var j = 0; j < pch.length; j++) allChs.push(pch[j]);
        var pgr = pls[i].groups || [];
        for (var k = 0; k < pgr.length; k++) {
          if (!grpSeen[pgr[k]]) { grpSeen[pgr[k]] = true; allGrps.push(pgr[k]); }
        }
      }
    } else if (pls[plIdx]) {
      allChs = pls[plIdx].channels || [];
      allGrps = pls[plIdx].groups || [];
    }

    iptvState.channels = allChs;
    iptvState.groups = allGrps;
    if (!iptvState.selectedGroup || iptvState.selectedGroup === 'All') {
      iptvState.selectedGroup = 'Все';
    }
    try { iptvState.favorites = JSON.parse(localStorage.getItem('lumiere_iptv_fav') || '{}'); } catch(e) {}
    renderIptv();
  }

  function loadEpg(epgUrl) {
    if (!epgUrl) epgUrl = 'https://iptvx.one/EPG';
    console.log('[IPTV] Loading EPG from:', epgUrl);
    apiPost('/api/iptv/epg', { url: epgUrl }, function(err, data) {
      if (err || !data) {
        console.warn('[IPTV] EPG load error:', err);
        return;
      }
      var parsed = null;
      try { parsed = typeof data === 'string' ? JSON.parse(data) : data; } catch(e) { return; }
      if (!parsed) return;
      if (parsed.epg) iptvState.epgData = parsed.epg;
      if (parsed.channelMap) iptvState.epgChannelMap = parsed.channelMap;
      if (parsed.iconMap) iptvState.epgIconMap = parsed.iconMap;
      for (var name in iptvState.epgChannelMap) {
        iptvState.epgNameLookup[name.toLowerCase()] = iptvState.epgChannelMap[name];
      }
      console.log('[IPTV] EPG loaded successfully, channel count:', Object.keys(iptvState.epgData).length);
      renderIptv();
    });
  }

  function findEpgId(ch) {
    if (!ch) return null;
    if (ch.tvgId && iptvState.epgData[ch.tvgId]) return ch.tvgId;
    if (ch.tvgName) {
      var tvgNl = ch.tvgName.toLowerCase();
      if (iptvState.epgNameLookup[tvgNl]) return iptvState.epgNameLookup[tvgNl];
    }
    var nl = (ch.name || '').toLowerCase();
    if (iptvState.epgNameLookup[nl]) return iptvState.epgNameLookup[nl];
    var clean = nl.replace(/\s*(hd|sd|fhd|4k|uhd)\s*$/i, '').trim();
    if (clean !== nl && iptvState.epgNameLookup[clean]) return iptvState.epgNameLookup[clean];
    return null;
  }

  function getChannelLogo(ch) {
    if (ch.logo) return ch.logo;
    var id = findEpgId(ch);
    if (id && iptvState.epgIconMap && iptvState.epgIconMap[id]) return iptvState.epgIconMap[id];
    return '';
  }

  function getCurrentProgram(programs) {
    if (!programs || programs.length === 0) return null;
    var nowMs = Date.now();
    // 1. Exact match by millisecond timestamp
    for (var i = 0; i < programs.length; i++) {
      var p = programs[i];
      if (p.startMs && p.stopMs && nowMs >= p.startMs && nowMs < p.stopMs) {
        return p;
      }
    }
    // 2. First program that hasn't ended yet
    for (var j = 0; j < programs.length; j++) {
      var pj = programs[j];
      if (pj.stopMs && pj.stopMs > nowMs) {
        return pj;
      }
    }
    // 3. Fallback to clock match
    var now = new Date();
    var cm = now.getHours() * 60 + now.getMinutes();
    for (var k = 0; k < programs.length; k++) {
      var pk = programs[k];
      var sp = (pk.startTime || '').split(':');
      var ep = (pk.stopTime || '').split(':');
      if (sp.length < 2 || ep.length < 2) continue;
      var sm = parseInt(sp[0]) * 60 + parseInt(sp[1]);
      var em = parseInt(ep[0]) * 60 + parseInt(ep[1]);
      if (em <= sm) em += 1440;
      if (cm >= sm && cm < em) return pk;
    }
    return programs[0];
  }

  function getNextProgram(programs) {
    if (!programs || programs.length === 0) return null;
    var current = getCurrentProgram(programs);
    if (!current) return programs.length > 1 ? programs[1] : null;
    var idx = programs.indexOf(current);
    if (idx >= 0 && idx < programs.length - 1) return programs[idx + 1];
    return null;
  }

  function getProgramProgress(program) {
    if (!program) return 0;
    var nowMs = Date.now();
    if (program.startMs && program.stopMs && program.stopMs > program.startMs) {
      if (nowMs <= program.startMs) return 0;
      if (nowMs >= program.stopMs) return 1;
      return (nowMs - program.startMs) / (program.stopMs - program.startMs);
    }
    var now = new Date();
    var cm = now.getHours() * 60 + now.getMinutes();
    var sp = (program.startTime || '').split(':');
    var ep = (program.stopTime || '').split(':');
    if (sp.length < 2 || ep.length < 2) return 0;
    var sm = parseInt(sp[0]) * 60 + parseInt(sp[1]);
    var em = parseInt(ep[0]) * 60 + parseInt(ep[1]);
    if (em <= sm) em += 1440;
    if (cm < sm || cm >= em) return 0;
    return (cm - sm) / (em - sm);
  }

  // Build category list from channels
  function buildCategories() {
    var cats = ['Все', 'Избранное'];
    var seen = {};
    for (var i = 0; i < iptvState.channels.length; i++) {
      var g = iptvState.channels[i].group;
      if (g && g !== 'Uncategorized' && !seen[g]) {
        seen[g] = true;
        cats.push(g);
      }
    }
    return cats;
  }

  // Get filtered channels
  function getFilteredChannels() {
    var channels = iptvState.channels || [];
    if (iptvState.selectedGroup === 'Избранное') {
      channels = channels.filter(function(ch) { return !!iptvState.favorites[ch.id]; });
    } else if (iptvState.selectedGroup !== 'Все') {
      channels = channels.filter(function(ch) { return ch.group === iptvState.selectedGroup; });
    }
    if (iptvState.searchQuery && iptvState.searchQuery.length > 0) {
      var q = iptvState.searchQuery.toLowerCase();
      channels = channels.filter(function(ch) {
        return (ch.name && ch.name.toLowerCase().indexOf(q) >= 0) ||
               (ch.group && ch.group.toLowerCase().indexOf(q) >= 0);
      });
    }
    return channels;
  }

  // ========== IPTV Virtual Keyboard (No Native Samsung IME) ==========
  var iptvOskState = {
    isOpen: false,
    lang: 'ru',
    row: 0,
    col: 0
  };

  function openIptvOsk() {
    iptvOskState.isOpen = true;
    var overlay = document.getElementById('iptv-osk-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
    }
    renderIptvOsk();
    updateIptvOskQueryDisplay();
    focusIptvOskKey(0, 0);
  }

  function closeIptvOsk() {
    iptvOskState.isOpen = false;
    var overlay = document.getElementById('iptv-osk-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    }
    clearIptvOskFocus();
    // Return focus to channels list
    iptvState.focusedCol = 1;
    iptvState.focusedCh = 0;
    renderIptv();
    focusIptvChannel(0);
  }

  function updateIptvOskQueryDisplay() {
    var qText = document.getElementById('iptv-osk-query-text');
    var sBoxText = document.getElementById('iptv-search-text');
    var queryVal = iptvState.searchQuery || '';
    if (qText) qText.textContent = queryVal || '(пусто)';
    if (sBoxText) {
      if (queryVal) {
        sBoxText.textContent = queryVal;
        sBoxText.classList.remove('placeholder');
      } else {
        sBoxText.textContent = 'Поиск канала (OK для ввода)...';
        sBoxText.classList.add('placeholder');
      }
    }
  }

  function renderIptvOsk() {
    var container = document.getElementById('iptv-osk-keyboard');
    if (!container) return;

    var rows = OSK_LAYOUTS[iptvOskState.lang] || OSK_LAYOUTS.ru;
    var html = '';
    for (var r = 0; r < rows.length; r++) {
      html += '<div class="osk-row">';
      for (var c = 0; c < rows[r].length; c++) {
        var key = rows[r][c];
        var isObj = typeof key === 'object';
        var label = isObj ? key.label : key;
        var action = isObj ? key.action : 'char';
        var charVal = isObj ? (key.char || '') : key;
        var cls = 'osk-key iptv-osk-key';
        if (isObj && key.wide === 2) cls += ' osk-key-wide-2';
        if (isObj && key.wide === 4) cls += ' osk-key-wide-4';
        if (isObj) cls += ' osk-key-action';

        html += '<button type="button" class="' + cls + '" data-r="' + r + '" data-c="' + c + '" data-action="' + action + '" data-char="' + esc(charVal) + '" tabindex="-1">' + esc(label) + '</button>';
      }
      html += '</div>';
    }
    container.innerHTML = html;

    var closeBtn = document.getElementById('iptv-osk-close-btn');
    if (closeBtn && !closeBtn._bound) {
      closeBtn._bound = true;
      closeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        closeIptvOsk();
      });
    }

    var keyBtns = container.querySelectorAll('.iptv-osk-key');
    for (var i = 0; i < keyBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var r = parseInt(btn.getAttribute('data-r'));
          var c = parseInt(btn.getAttribute('data-c'));
          focusIptvOskKey(r, c);
          triggerIptvOskKey(btn);
        });
      })(keyBtns[i]);
    }
  }

  function focusIptvOskKey(r, c) {
    clearIptvOskFocus();
    var rows = OSK_LAYOUTS[iptvOskState.lang] || OSK_LAYOUTS.ru;
    if (r < 0) r = 0;
    if (r >= rows.length) r = rows.length - 1;
    if (c < 0) c = 0;
    if (c >= rows[r].length) c = rows[r].length - 1;

    iptvOskState.row = r;
    iptvOskState.col = c;

    var target = document.querySelector('.iptv-osk-key[data-r="' + r + '"][data-c="' + c + '"]');
    if (target) {
      target.classList.add('focused');
      try { target.focus(); } catch(e) {}
    }
  }

  function clearIptvOskFocus() {
    var list = document.querySelectorAll('.iptv-osk-key.focused, #iptv-osk-close-btn.focused');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('focused');
  }

  function triggerIptvOskKey(btn) {
    if (!btn) {
      btn = document.querySelector('.iptv-osk-key[data-r="' + iptvOskState.row + '"][data-c="' + iptvOskState.col + '"]');
    }
    if (!btn) return;

    var action = btn.getAttribute('data-action');
    var charVal = btn.getAttribute('data-char');

    if (action === 'char') {
      iptvState.searchQuery = (iptvState.searchQuery || '') + charVal.toLowerCase();
    } else if (action === 'space') {
      iptvState.searchQuery = (iptvState.searchQuery || '') + ' ';
    } else if (action === 'backspace') {
      if (iptvState.searchQuery && iptvState.searchQuery.length > 0) {
        iptvState.searchQuery = iptvState.searchQuery.substring(0, iptvState.searchQuery.length - 1);
      }
    } else if (action === 'clear') {
      iptvState.searchQuery = '';
    } else if (action === 'lang') {
      iptvOskState.lang = (iptvOskState.lang === 'ru') ? 'en' : 'ru';
      renderIptvOsk();
      focusIptvOskKey(iptvOskState.row, iptvOskState.col);
      return;
    }

    updateIptvOskQueryDisplay();
    // Live filter channels in background
    iptvState.focusedCh = 0;
    renderChannels();
  }

  function handleIptvOskKeys(code, e) {
    var key = e.key;
    var isLeft = code === 37 || key === 'ArrowLeft' || key === 'Left';
    var isRight = code === 39 || key === 'ArrowRight' || key === 'Right';
    var isUp = code === 38 || key === 'ArrowUp' || key === 'Up';
    var isDown = code === 40 || key === 'ArrowDown' || key === 'Down';
    var isEnter = isEnterKey(code, key);
    var isBack = (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack');

    if (isBack) {
      closeIptvOsk();
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    var rows = OSK_LAYOUTS[iptvOskState.lang] || OSK_LAYOUTS.ru;
    var curRowLen = rows[iptvOskState.row].length;

    var closeBtn = document.getElementById('iptv-osk-close-btn');
    var isOnCloseBtn = closeBtn && closeBtn.classList.contains('focused');

    if (isOnCloseBtn) {
      if (isDown) {
        closeBtn.classList.remove('focused');
        focusIptvOskKey(0, 0);
      } else if (isEnter) {
        closeIptvOsk();
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isLeft) {
      if (iptvOskState.col > 0) {
        focusIptvOskKey(iptvOskState.row, iptvOskState.col - 1);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isRight) {
      if (iptvOskState.col < curRowLen - 1) {
        focusIptvOskKey(iptvOskState.row, iptvOskState.col + 1);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isUp) {
      if (iptvOskState.row > 0) {
        var prevLen = rows[iptvOskState.row - 1].length;
        var targetCol = Math.min(prevLen - 1, Math.round(iptvOskState.col * (prevLen / curRowLen)));
        focusIptvOskKey(iptvOskState.row - 1, targetCol);
      } else {
        clearIptvOskFocus();
        if (closeBtn) {
          closeBtn.classList.add('focused');
          closeBtn.focus();
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isDown) {
      if (iptvOskState.row < rows.length - 1) {
        var nextLen = rows[iptvOskState.row + 1].length;
        var targetCol2 = Math.min(nextLen - 1, Math.round(iptvOskState.col * (nextLen / curRowLen)));
        focusIptvOskKey(iptvOskState.row + 1, targetCol2);
      } else {
        closeIptvOsk();
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isEnter) {
      triggerIptvOskKey();
      if (e && e.preventDefault) e.preventDefault();
      return;
    }
  }

  function setupIptvSearchBox() {
    var box = document.getElementById('iptv-search-box');
    if (!box || box._setupDone) return;
    box._setupDone = true;
    box.addEventListener('click', function(e) {
      e.preventDefault();
      openIptvOsk();
    });
    updateIptvOskQueryDisplay();
  }

  // Ensure IPTV 3-column DOM structure exists even in launcher context
  function ensureIptvDomStructure() {
    var sec = document.getElementById('sec-iptv');
    if (!sec) return;
    sec.classList.add('iptv-section');
    var prev = document.getElementById('iptv-preview');
    if (prev && !document.getElementById('iptv-preview-video-wrap')) {
      var wrap = document.createElement('div');
      wrap.id = 'iptv-preview-video-wrap';
      wrap.className = 'iptv-preview-video-wrap';
      wrap.innerHTML = '<video id="iptv-preview-video" class="iptv-preview-video" muted autoplay playsinline style="display:none;"></video>' +
        '<div id="iptv-preview-no-video" class="iptv-preview-no-video"><span style="font-size:36px;">📺</span><span>Предпросмотр канала</span></div>';
      var banner = document.getElementById('iptv-preview-banner');
      if (banner) {
        prev.insertBefore(wrap, banner);
      } else {
        prev.insertBefore(wrap, prev.firstChild);
      }
    }
    if (!document.getElementById('iptv-cat-list') || !document.getElementById('iptv-channels') || !document.getElementById('iptv-preview-title')) {
      sec.innerHTML =
        '<div id="iptv-categories" class="iptv-col iptv-col-left">' +
          '<div class="iptv-col-header">Категории</div>' +
          '<div id="iptv-cat-list" class="iptv-cat-list"></div>' +
        '</div>' +
        '<div id="iptv-channels-wrap" class="iptv-col iptv-col-mid">' +
          '<div class="iptv-col-header" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<span id="iptv-channel-count">0 каналов</span>' +
            '<span style="font-size:14px;color:#facc15;font-weight:600;">[Зажатие OK: В избранное]</span>' +
          '</div>' +
          '<div class="iptv-search-box" id="iptv-search-box" tabindex="0">' +
            '<span style="font-size:16px;">🔍</span>' +
            '<span class="iptv-search-box-text placeholder" id="iptv-search-text">Поиск канала (OK для ввода)...</span>' +
          '</div>' +
          '<div id="iptv-channels" class="iptv-channel-list"></div>' +
        '</div>' +
        '<div id="iptv-preview" class="iptv-col iptv-col-right">' +
          '<div id="iptv-preview-video-wrap" class="iptv-preview-video-wrap">' +
            '<video id="iptv-preview-video" class="iptv-preview-video" muted autoplay playsinline style="display:none;"></video>' +
            '<div id="iptv-preview-no-video" class="iptv-preview-no-video">' +
              '<span style="font-size:36px;">📺</span>' +
              '<span>Предпросмотр канала</span>' +
            '</div>' +
          '</div>' +
          '<div id="iptv-preview-banner" class="iptv-preview-banner">' +
            '<div id="iptv-preview-logo-box" class="iptv-preview-logo-box">TV</div>' +
            '<div class="iptv-preview-header-meta">' +
              '<div class="iptv-preview-live-badge"><span class="live-pulse">●</span> В ЭФИРЕ</div>' +
              '<div id="iptv-preview-title" class="iptv-preview-title"></div>' +
              '<div id="iptv-preview-group" class="iptv-preview-group"></div>' +
            '</div>' +
          '</div>' +
          '<div id="iptv-preview-info" class="iptv-preview-info">' +
            '<div id="iptv-preview-program-box" class="iptv-preview-program-box">' +
              '<div id="iptv-preview-program" class="iptv-preview-program"></div>' +
              '<div id="iptv-preview-progress-wrap" class="iptv-preview-progress-wrap">' +
                '<div id="iptv-preview-progress-fill" class="iptv-preview-progress-fill"></div>' +
              '</div>' +
              '<div id="iptv-preview-time" class="iptv-preview-time"></div>' +
            '</div>' +
            '<div id="iptv-preview-desc" class="iptv-preview-desc"></div>' +
            '<div id="iptv-preview-actions" class="iptv-preview-actions">' +
              '<button id="iptv-btn-play" class="iptv-action-btn primary" tabindex="0">▶ Смотреть во весь экран</button>' +
              '<button id="iptv-btn-fav" class="iptv-action-btn" tabindex="0">★ В избранное</button>' +
            '</div>' +
            '<div id="iptv-epg-schedule" class="iptv-epg-schedule"></div>' +
          '</div>' +
        '</div>' +
        '<div id="iptv-osk-overlay" class="iptv-osk-overlay hidden">' +
          '<div class="iptv-osk-bar">' +
            '<span class="iptv-osk-query">Поиск: <span id="iptv-osk-query-text" style="color:#e8c170;"></span></span>' +
            '<button type="button" id="iptv-osk-close-btn" class="iptv-osk-close-btn" tabindex="0">Готово (↵ к каналам)</button>' +
          '</div>' +
          '<div id="iptv-osk-keyboard" class="tv-keyboard"></div>' +
        '</div>';
      if (typeof setupIptvEvents === 'function') setupIptvEvents();
    }
  }

  // ========== Render ==========
  function renderIptv() {
    if (iptvLocked) return;
    ensureIptvDomStructure();
    setupIptvSearchBox();
    renderCategories();
    renderChannels();
    renderPreview();
  }

  function renderCategories() {
    var container = document.getElementById('iptv-cat-list');
    if (!container) return;

    var navItems = [];
    var html = '';

    // 1. If multiple playlists exist, render playlist selector items
    var pls = iptvState.playlists || [];
    if (pls.length > 1) {
      html += '<div class="iptv-section-divider">Плейлисты</div>';

      var isAllActive = (iptvState.selectedPlaylistIndex === -1);
      var isAllFocused = (iptvState.focusedCol === 0 && iptvState.focusedCat === navItems.length);
      var allCls = 'iptv-pl-item' + (isAllActive ? ' active' : '') + (isAllFocused ? ' focused' : '');
      html += '<div class="' + allCls + '" data-nav-idx="' + navItems.length + '" data-type="playlist" data-pl-idx="-1" tabindex="0">' +
        '<span class="iptv-cat-icon">🌐</span>' +
        '<span>Все плейлисты</span>' +
        '<span class="iptv-pl-badge">' + pls.length + '</span>' +
      '</div>';
      navItems.push({ type: 'playlist', plIdx: -1 });

      for (var p = 0; p < pls.length; p++) {
        var isPlActive = (iptvState.selectedPlaylistIndex === p);
        var isPlFocused = (iptvState.focusedCol === 0 && iptvState.focusedCat === navItems.length);
        var plCls = 'iptv-pl-item' + (isPlActive ? ' active' : '') + (isPlFocused ? ' focused' : '');
        var plName = pls[p].name || ('Плейлист ' + (p + 1));
        html += '<div class="' + plCls + '" data-nav-idx="' + navItems.length + '" data-type="playlist" data-pl-idx="' + p + '" tabindex="0">' +
          '<span class="iptv-cat-icon">📡</span>' +
          '<span>' + esc(plName) + '</span>' +
        '</div>';
        navItems.push({ type: 'playlist', plIdx: p, name: plName });
      }

      html += '<div class="iptv-section-divider">Категории</div>';
    }

    // 2. Render categories
    var cats = buildCategories();
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var isActive = (cat === iptvState.selectedGroup);
      var isFocused = (iptvState.focusedCol === 0 && iptvState.focusedCat === navItems.length);
      var cls = 'iptv-cat-item' + (isActive ? ' active' : '') + (isFocused ? ' focused' : '');
      var icon = cat === 'Все' ? '📺' : cat === 'Избранное' ? '★' : '▸';
      html += '<div class="' + cls + '" data-nav-idx="' + navItems.length + '" data-type="category" data-cat="' + esc(cat) + '" tabindex="0">' +
        '<span class="iptv-cat-icon">' + icon + '</span>' +
        '<span>' + esc(cat) + '</span>' +
      '</div>';
      navItems.push({ type: 'category', cat: cat });
    }

    iptvState.navItems = navItems;
    container.innerHTML = html;

    var itemEls = container.querySelectorAll('.iptv-pl-item, .iptv-cat-item');
    for (var ci = 0; ci < itemEls.length; ci++) {
      (function(idx) {
        itemEls[idx].addEventListener('click', function() {
          onCategoryColumnItemSelect(idx);
        });
      })(ci);
    }
  }

  function onCategoryColumnItemSelect(idx) {
    var navItems = iptvState.navItems || [];
    var item = navItems[idx];
    if (!item) return;

    iptvState.focusedCat = idx;
    if (item.type === 'playlist') {
      applyActivePlaylist(item.plIdx);
      renderCategories();
      focusIptvCategory(idx);
    } else if (item.type === 'category') {
      iptvState.selectedGroup = item.cat;
      iptvState.focusedCol = 1;
      iptvState.focusedCh = 0;
      renderCategories();
      renderChannels();
      focusIptvChannel(0);
    }
  }

  var iptvRenderLimit = 80;
  function renderChannels(appendOnly) {
    var container = document.getElementById('iptv-channels');
    var countEl = document.getElementById('iptv-channel-count');
    if (!container) return;

    var channels = getFilteredChannels();
    if (countEl) countEl.textContent = channels.length + ' каналов';

    if (channels.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-mute);text-align:center;">Нет каналов</div>';
      return;
    }

    if (!appendOnly) {
      iptvRenderLimit = Math.max(80, (iptvState.focusedCh || 0) + 40);
      container.innerHTML = '';
    }

    var startIdx = appendOnly ? container.querySelectorAll('.iptv-ch-item').length : 0;
    var endIdx = Math.min(channels.length, iptvRenderLimit);
    if (startIdx >= endIdx) return;

    var frag = document.createDocumentFragment();
    for (var i = startIdx; i < endIdx; i++) {
      var ch = channels[i];
      var isFocused = iptvState.focusedCol === 1 && i === iptvState.focusedCh;
      var isFav = !!iptvState.favorites[ch.id];

      var logo = getChannelLogo(ch);
      var logoHtml = logo
        ? '<div class="iptv-ch-logo"><img src="' + esc(logo) + '" onerror="this.style.display=\'none\'" loading="lazy"></div>'
        : '<div class="iptv-ch-logo-placeholder">TV</div>';

      // Current program
      var epgId = findEpgId(ch);
      var programs = epgId && iptvState.epgData[epgId] ? iptvState.epgData[epgId] : null;
      var current = getCurrentProgram(programs);
      var progress = getProgramProgress(current);

      var itemEl = document.createElement('div');
      itemEl.className = 'iptv-ch-item' + (isFocused ? ' focused' : '');
      itemEl.setAttribute('data-chid', ch.id);
      itemEl.setAttribute('data-idx', i);
      var sourceTag = '';
      if (iptvState.playlists && iptvState.playlists.length > 1 && iptvState.selectedPlaylistIndex === -1 && ch.playlistName) {
        sourceTag = ' <span class="iptv-ch-source-tag">' + esc(ch.playlistName) + '</span>';
      }
      var infoHtml = '<div class="iptv-ch-name">' + esc(ch.name) + sourceTag + '</div>';
      if (current) {
        infoHtml += '<div class="iptv-ch-program">' + esc(current.title) + '</div>';
        infoHtml += '<div class="iptv-ch-progress"><div class="iptv-ch-progress-fill" style="width:' + Math.round(progress * 100) + '%"></div></div>';
        infoHtml += '<div class="iptv-ch-time">' + esc(current.startTime) + ' - ' + esc(current.stopTime) + '</div>';
      }

      itemEl.innerHTML = logoHtml +
        '<div class="iptv-ch-info">' + infoHtml + '</div>' +
        '<button type="button" class="iptv-ch-fav' + (isFav ? ' active' : '') + '" data-favid="' + esc(ch.id) + '" title="Добавить в избранное">' + (isFav ? '★' : '☆') + '</button>';

      (function(idx, channelObj) {
        itemEl.addEventListener('click', function(e) {
          if (e.target && e.target.classList.contains('iptv-ch-fav')) return;
          iptvState.focusedCol = 1;
          iptvState.focusedCh = idx;
          if (channelObj) playChannel(channelObj);
        });
        var favBtn = itemEl.querySelector('.iptv-ch-fav');
        if (favBtn) {
          favBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleFavorite(channelObj.id);
          });
        }
      })(i, ch);

      frag.appendChild(itemEl);
    }
    container.appendChild(frag);
  }

  function renderPreview() {
    var ch = iptvState.currentChannel;
    var logoBox = document.getElementById('iptv-preview-logo-box');
    var nameEl = document.getElementById('iptv-preview-name') || document.getElementById('iptv-preview-title');
    var groupEl = document.getElementById('iptv-preview-group');
    var progEl = document.getElementById('iptv-preview-program');
    var timeEl = document.getElementById('iptv-preview-time');
    var progressFill = document.getElementById('iptv-preview-progress-fill');
    var metaEl = document.getElementById('iptv-preview-meta') || document.getElementById('iptv-preview-desc');
    var playBtn = document.getElementById('iptv-btn-play');
    var favBtn = document.getElementById('iptv-btn-fav');
    var schedEl = document.getElementById('iptv-epg-schedule');

    if (!ch) {
      if (logoBox) logoBox.textContent = 'TV';
      if (nameEl) nameEl.textContent = '';
      if (groupEl) groupEl.textContent = '';
      if (progEl) progEl.textContent = 'Выберите канал';
      if (timeEl) timeEl.textContent = '';
      if (progressFill) progressFill.style.width = '0%';
      if (metaEl) metaEl.textContent = '';
      if (schedEl) schedEl.innerHTML = '';
      return;
    }

    if (logoBox) {
      var logo = getChannelLogo(ch);
      if (logo) {
        logoBox.innerHTML = '<img src="' + esc(logo) + '" onerror="this.parentNode.innerHTML=\'TV\'">';
      } else {
        logoBox.textContent = 'TV';
      }
    }

    if (nameEl) nameEl.textContent = ch.name;
    if (groupEl) groupEl.textContent = ch.group || '';

    var epgId = findEpgId(ch);
    var programs = epgId && iptvState.epgData[epgId] ? iptvState.epgData[epgId] : null;
    var current = getCurrentProgram(programs);
    var progress = getProgramProgress(current);

    if (progEl) {
      progEl.textContent = current ? current.title : 'Прямой эфир';
    }
    if (timeEl) {
      timeEl.textContent = current ? (current.startTime + ' – ' + current.stopTime) : '';
    }
    if (progressFill) {
      progressFill.style.width = Math.round(progress * 100) + '%';
    }
    if (metaEl) {
      var meta = [];
      if (current && current.desc) meta.push(current.desc);
      else if (ch.group) meta.push('Канал из группы «' + ch.group + '»');
      metaEl.textContent = meta.join(' · ');
    }
    if (favBtn) {
      var isFav = !!(ch && iptvState.favorites[ch.id]);
      favBtn.textContent = isFav ? '★ В избранном' : '☆ В избранное';
      favBtn.onclick = function() { if (ch) toggleFavorite(ch.id); };
    }
    if (playBtn) {
      playBtn.onclick = function() { if (ch) playChannel(ch); };
    }

    // Render full day program schedule
    if (schedEl) {
      if (programs && programs.length > 0) {
        var baseDate = (current && current.startDate) ? current.startDate : (programs[0] ? programs[0].startDate : '');
        var schedHtml = '<div class="iptv-epg-heading"><span>Программа передач</span><span>' + esc(baseDate) + '</span></div>';
        schedHtml += '<div class="iptv-epg-list">';
        for (var pi = 0; pi < programs.length; pi++) {
          var pItem = programs[pi];
          var isCur = (pItem === current);
          var isNextDay = pItem.startDate && baseDate && pItem.startDate !== baseDate;
          var timePrefix = isNextDay ? '<span style="color:#a78bfa;font-size:15px;margin-right:6px;font-weight:700;">Завтра</span>' : '';
          var timeStr = esc(pItem.startTime || '') + ' – ' + esc(pItem.stopTime || '');
          var hasRem = typeof hasEpgReminder === 'function' ? hasEpgReminder(ch.id, pItem.title) : false;
          schedHtml += '<div class="iptv-epg-item' + (isCur ? ' is-current' : '') + '" data-epg-idx="' + pi + '" tabindex="0">';
          schedHtml += '<span class="iptv-epg-time">' + timePrefix + timeStr + '</span>';
          schedHtml += '<span class="iptv-epg-name">' + esc(pItem.title || 'Без названия') + (isCur ? ' <span class="iptv-epg-badge">Сейчас</span>' : '') + (hasRem ? ' <span class="epg-reminder-tag">⏰ Напоминание</span>' : '') + '</span>';
          schedHtml += '</div>';
        }
        schedHtml += '</div>';
        schedEl.innerHTML = schedHtml;
        schedEl.style.display = 'block';

        // Add click listeners to EPG items
        var epgEls = schedEl.querySelectorAll('.iptv-epg-item');
        for (var ei = 0; ei < epgEls.length; ei++) {
          (function(itemIdx) {
            epgEls[itemIdx].addEventListener('click', function() {
              focusIptvPreview(itemIdx + 2);
              var pItem = programs[itemIdx];
              var isCur = (pItem === current);
              if (isCur) {
                if (ch) playChannel(ch);
              } else {
                if (typeof toggleEpgReminder === 'function') {
                  toggleEpgReminder(ch, pItem);
                }
              }
            });
          })(ei);
        }

        // Auto-scroll so current show is at top of viewport
        var curEl = schedEl.querySelector('.iptv-epg-item.is-current');
        if (curEl) {
          try {
            if (curEl.scrollIntoViewIfNeeded) {
              curEl.scrollIntoViewIfNeeded(true);
            } else {
              curEl.scrollIntoView({ block: 'start' });
            }
          } catch(e) {}
        }
      } else {
        schedEl.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:14px;padding:8px 0;">Программа передач отсутствует</div>';
        schedEl.style.display = 'block';
      }
    }
  }

  var previewPlayTimer = null;

  function startPreview(ch) {
    if (!ch || !ch.url) return;
    if (state.section !== 'iptv') return;
    var video = document.getElementById('iptv-preview-video');
    var noVideo = document.getElementById('iptv-preview-no-video');
    if (!video) return;

    var streamUrl = ch.url;
    if (streamUrl.indexOf('/') === 0) {
      streamUrl = (typeof getBaseUrl === 'function' ? getBaseUrl() : '') + streamUrl;
    }

    if (video.getAttribute('data-stream-src') === streamUrl && !video.paused) {
      return;
    }

    try { video.pause(); } catch(e) {}
    video.muted = true;
    video.setAttribute('data-stream-src', streamUrl);
    video.setAttribute('src', streamUrl);
    video.src = streamUrl;
    video.style.display = 'block';
    if (noVideo) noVideo.style.display = 'none';

    var p = video.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function(err) {
        console.log('[IPTV Preview] play error:', err);
      });
    }
    if (iptvState) iptvState.previewChannel = ch;
  }

  function stopPreview() {
    if (previewPlayTimer) {
      clearTimeout(previewPlayTimer);
      previewPlayTimer = null;
    }
    if (previewDebounceTimer) {
      clearTimeout(previewDebounceTimer);
      previewDebounceTimer = null;
    }
    if (iptvState && iptvState._previewTimer) {
      clearTimeout(iptvState._previewTimer);
      iptvState._previewTimer = null;
    }
    var video = document.getElementById('iptv-preview-video');
    var noVideo = document.getElementById('iptv-preview-no-video');
    if (video) {
      try { video.pause(); } catch(e) {}
      video.removeAttribute('src');
      video.removeAttribute('data-stream-src');
      video.src = '';
      try { video.load(); } catch(e) {}
      video.style.display = 'none';
    }
    if (noVideo) {
      noVideo.style.display = 'flex';
    }
    if (iptvState) iptvState.previewChannel = null;
  }

  // ========== Events ==========
  function setupIptvEvents() {
    // Category click
    var catList = document.getElementById('iptv-cat-list');
    if (catList) {
      catList.onclick = function(e) {
        if (iptvLocked) return;
        var el = e.target;
        while (el && el !== catList) {
          if (el.classList && el.classList.contains('iptv-cat-item')) break;
          el = el.parentNode;
        }
        if (el && el.hasAttribute('data-cat')) {
          var cat = el.getAttribute('data-cat');
          var idx = parseInt(el.getAttribute('data-idx'));
          iptvState.selectedGroup = cat;
          iptvState.focusedCat = idx;
          iptvState.focusedCol = 1;
          iptvState.focusedCh = 0;
          renderIptv();
          focusIptvChannel(0);
        }
      };
    }

    // Channel click
    var chList = document.getElementById('iptv-channels');
    if (chList) {
      chList.onclick = function(e) {
        if (iptvLocked) return;
        // Check fav button
        var el = e.target;
        while (el && el !== chList) {
          if (el.classList && el.classList.contains('iptv-ch-fav')) {
            var favId = el.getAttribute('data-favid');
            if (favId) toggleFavorite(favId);
            return;
          }
          el = el.parentNode;
        }
        // Play channel
        var chEl = findChannelEl(e.target);
        if (chEl) {
          var chId = chEl.getAttribute('data-chid');
          var ch = findChannelById(chId);
          if (ch) playChannel(ch);
        }
      };
    }
  }

  function toggleFavorite(chId) {
    iptvLocked = true;
    if (iptvState.favorites[chId]) delete iptvState.favorites[chId];
    else iptvState.favorites[chId] = true;
    try { localStorage.setItem('lumiere_iptv_fav', JSON.stringify(iptvState.favorites)); } catch(e) {}
    renderIptv();
    showToast(iptvState.favorites[chId] ? '★ Канал добавлен в избранное' : '☆ Канал удалён из избранного');
    setTimeout(function() { iptvLocked = false; }, 300);
  }

  function findChannelEl(el) {
    var container = document.getElementById('iptv-channels');
    while (el && el !== container) {
      if (el.classList && el.classList.contains('iptv-ch-item') && el.hasAttribute('data-chid')) return el;
      el = el.parentNode;
    }
    return null;
  }

  function findChannelById(chId) {
    for (var i = 0; i < iptvState.channels.length; i++) {
      if (iptvState.channels[i].id === chId) return iptvState.channels[i];
    }
    return null;
  }

  function playChannel(ch) {
    if (!ch) return;
    openPlayer('?url=' + encodeURIComponent(ch.url) + '&title=' + encodeURIComponent(ch.name));
  }

  function showToast(msg) {
    var existing = document.querySelector('.iptv-toast');
    if (existing) existing.parentNode.removeChild(existing);

    var toast = document.createElement('div');
    toast.className = 'iptv-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 2000);
  }

  function setupIptvSearch() { /* search handled via nav */ }

  // ========== Rendering ==========


  function renderTop10Row(containerId, titles) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    titles.slice(0, 10).forEach(function(t, i) {
      t._isTop10 = true;
      var card = createCard(t, i);
      card.classList.add('top10-card');
      var numEl = document.createElement('div');
      numEl.className = 'top10-num';
      numEl.textContent = (i + 1);
      card.insertBefore(numEl, card.firstChild);
      container.appendChild(card);
    });
  }

  function renderRow(containerId, titles) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    titles.forEach(function(t, i) { container.appendChild(createCard(t, i)); });
  }

  function renderGrid(gridId, titles) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    titles.forEach(function(t, i) { grid.appendChild(createCard(t, i)); });
  }

  // ========== Card Title Marquee Animation ==========
  var marqueeStyleEl = null;

  function startCardTitleMarquee(card) {
    if (!card) return;
    var titleEl = card.querySelector('.card-title');
    if (!titleEl) return;
    var textEl = titleEl.querySelector('.card-title-text');
    if (!textEl) {
      var raw = titleEl.textContent || '';
      titleEl.innerHTML = '<span class="card-title-text">' + esc(raw) + '</span>';
      textEl = titleEl.querySelector('.card-title-text');
    }
    if (!textEl) return;

    // Reset previous animation state to measure clean un-shifted width
    textEl.classList.remove('is-marquee');
    textEl.style.animation = 'none';
    textEl.style.webkitAnimation = 'none';
    textEl.style.transform = 'translate3d(0, 0, 0)';
    textEl.style.webkitTransform = 'translate3d(0, 0, 0)';

    var compStyle = window.getComputedStyle ? window.getComputedStyle(titleEl) : null;
    var padLeft = compStyle ? parseFloat(compStyle.paddingLeft) || 14 : 14;
    var padRight = compStyle ? parseFloat(compStyle.paddingRight) || 14 : 14;
    var containerWidth = titleEl.clientWidth - (padLeft + padRight);
    var textWidth = textEl.scrollWidth;
    var overflow = textWidth - containerWidth;

    if (containerWidth > 0 && overflow > 4) {
      var shiftPx = -(Math.ceil(overflow) + 12);
      var duration = Math.max(3.5, Math.min(12, (overflow / 32) + 2.5));

      if (!marqueeStyleEl) {
        marqueeStyleEl = document.getElementById('tv-card-marquee-style');
        if (!marqueeStyleEl) {
          marqueeStyleEl = document.createElement('style');
          marqueeStyleEl.id = 'tv-card-marquee-style';
          document.head.appendChild(marqueeStyleEl);
        }
      }

      var animName = 'marquee_' + Math.floor(Math.random() * 1000000);
      marqueeStyleEl.textContent =
        '@keyframes ' + animName + ' {' +
        '  0%, 18% { -webkit-transform: translate3d(0, 0, 0); transform: translate3d(0, 0, 0); }' +
        '  65%, 82% { -webkit-transform: translate3d(' + shiftPx + 'px, 0, 0); transform: translate3d(' + shiftPx + 'px, 0, 0); }' +
        '  100% { -webkit-transform: translate3d(0, 0, 0); transform: translate3d(0, 0, 0); }' +
        '} ' +
        '@-webkit-keyframes ' + animName + ' {' +
        '  0%, 18% { -webkit-transform: translate3d(0, 0, 0); transform: translate3d(0, 0, 0); }' +
        '  65%, 82% { -webkit-transform: translate3d(' + shiftPx + 'px, 0, 0); transform: translate3d(' + shiftPx + 'px, 0, 0); }' +
        '  100% { -webkit-transform: translate3d(0, 0, 0); transform: translate3d(0, 0, 0); }' +
        '}';

      void textEl.offsetWidth; // Force reflow
      textEl.style.webkitAnimation = animName + ' ' + duration + 's cubic-bezier(0.42, 0, 0.58, 1) infinite';
      textEl.style.animation = animName + ' ' + duration + 's cubic-bezier(0.42, 0, 0.58, 1) infinite';
      textEl.classList.add('is-marquee');
      titleEl.classList.add('has-marquee');
    }
  }

  function stopCardTitleMarquee(card) {
    if (!card) return;
    var titleEl = card.querySelector('.card-title');
    if (titleEl) titleEl.classList.remove('has-marquee');
    var textEl = card.querySelector('.card-title-text');
    if (textEl) {
      textEl.classList.remove('is-marquee');
      textEl.style.animation = 'none';
      textEl.style.webkitAnimation = 'none';
      textEl.style.transform = 'translate3d(0, 0, 0)';
      textEl.style.webkitTransform = 'translate3d(0, 0, 0)';
    }
  }

  function createCard(title, index) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-index', index);
    card.setAttribute('data-id', title.id);
    card.setAttribute('tabindex', '0');
    card._titleData = title;

    var imgSrc = imgUrl(title.poster);
    var scoreHtml = title.score ? '<div class="card-score">' + title.score + '</div>' : '';

    card.innerHTML = '<div class="card-img-wrap"><img class="card-img" src="' + esc(imgSrc) + '" alt="' + esc(title.name) + '" loading="lazy">' + scoreHtml + '</div>' +
      '<div class="card-title"><span class="card-title-text">' + esc(title.name) + '</span></div>';

    card.addEventListener('focus', function() {
      if (state.section === 'home' && typeof updateHeroBanner === 'function') {
        updateHeroBanner(title);
      }
      startCardTitleMarquee(card);
    });

    card.addEventListener('blur', function() {
      stopCardTitleMarquee(card);
    });

    card.addEventListener('mouseenter', function() {
      startCardTitleMarquee(card);
    });

    card.addEventListener('mouseleave', function() {
      if (!card.classList.contains('focused') && document.activeElement !== card) {
        stopCardTitleMarquee(card);
      }
    });

    card.addEventListener('click', function() {
      if (state.section === 'search' && oskState && oskState.query && oskState.query.trim().length >= 2) {
        saveRecentSearch(oskState.query.trim());
      }
      showDetail(title);
    });
    return card;
  }

  // ========== Detail View ==========
  function showDetail(title) {
    if (!title) return;
    if (!$detail) $detail = document.getElementById('detail');
    if (!$detail) return;
    $detail.classList.remove('hidden');
    $detail.classList.remove('screen');
    $detail.style.display = 'block';
    $detail.style.zIndex = '900';
    state.detailTab = 'torrents';
    state.detailSeason = '';
    state.detail = null;

    // Loading state
    renderDetailLoading(title);

    // Fetch full details
    var type = title.type === 'tv' ? 'tv' : 'movies';
    apiFetch('/api/' + type + '/' + title.id, function(err, data) {
      if (data && data.id) {
        state.detail = data;
        renderDetail(data);
      } else {
        state.detail = title;
        renderDetail(title);
      }
    });
  }

  function renderDetailLoading(title) {
    if (!$detail) $detail = document.getElementById('detail');
    if (!$detail) return;
    $detail.classList.remove('hidden');
    $detail.classList.remove('screen');
    $detail.style.display = 'block';
    $detail.style.zIndex = '900';
    var poster = imgUrl(title.poster);
    var backdrop = imgUrl(title.backdrop || title.poster);
    var html = '';
    html += '<div class="detail-hero"><img src="' + esc(backdrop) + '" class="detail-hero-img" onerror="this.style.display=\'none\'">';
    html += '<div class="detail-hero-gradient"></div></div>';
    html += '<div class="detail-overlay">';
    html += '<div class="detail-top-row" style="display:block;"><button id="detail-back-btn" class="detail-back-btn" tabindex="0">Назад</button></div>';
    html += '<div class="detail-main-row"><img src="' + esc(poster) + '" class="detail-poster" onerror="this.style.display=\'none\'">';
    html += '<div class="detail-info"><h1 class="detail-title">' + esc(title.name) + '</h1>';
    if (title.year) html += '<div class="detail-meta-row"><span class="detail-meta-item">' + title.year + '</span></div>';
    html += '<p class="detail-loading-text">Загрузка информации...</p>';
    html += '</div></div></div>';
    var contentEl = $detail.querySelector('#detail-content');
    if (contentEl) contentEl.innerHTML = html;
    bindDetailBack();
    var bBtn = document.getElementById('detail-back-btn');
    if (bBtn) {
      try { bBtn.focus(); } catch(e) {}
    }
  }

  function detectBackdropLuminance(url, cb) {
    if (!url) return cb(false);
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = 40;
        canvas.height = 40;
        var ctx = canvas.getContext('2d');
        if (!ctx) return cb(false);
        var sx = img.naturalWidth * 0.5;
        var sy = 0;
        var sw = img.naturalWidth * 0.5;
        var sh = img.naturalHeight * 0.6;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 40, 40);
        var idata = ctx.getImageData(0, 0, 40, 40).data;
        var sum = 0, count = 0;
        for (var i = 0; i < idata.length; i += 4) {
          sum += (0.299 * idata[i] + 0.587 * idata[i + 1] + 0.114 * idata[i + 2]);
          count++;
        }
        var avg = count > 0 ? (sum / count) / 255 : 0;
        cb(avg > 0.45);
      } catch(e) {
        cb(false);
      }
    };
    img.onerror = function() { cb(false); };
    img.src = url;
  }

  function renderDetail(d) {
    var poster = imgUrl(d.poster);
    var backdrop = imgUrl(d.backdrop || d.poster);
    var typeLabel = d.type === 'tv' ? 'Сериал' : d.type === 'anime' ? 'Аниме' : 'Фильм';
    var html = '';

    // Hero
    html += '<div class="detail-hero"><img src="' + esc(backdrop) + '" class="detail-hero-img" onerror="this.style.display=\'none\'">';
    html += '<div class="detail-hero-gradient"></div></div>';

    // Overlay
    html += '<div class="detail-overlay">';

    // Back button
    html += '<div class="detail-top-row"><button id="detail-back-btn" class="detail-back-btn" tabindex="0">‹ Назад</button></div>';

    // UPPER SECTION: TWO SIDES (Left side info & actions, Right side 4x2 Cast grid)
    html += '<div class="detail-upper-hero">';

    // LEFT SIDE: Badges, Title, Meta, Actions & Synopsis (~52%)
    html += '<div class="detail-hero-left">';

    // Type + genre
    html += '<div class="detail-label-row"><span class="detail-type-label">' + esc(typeLabel) + '</span>';
    if (d.genres && d.genres.length > 0) {
      html += '<span class="detail-sep"> — </span><span class="detail-genre-label">' + esc(d.genres[0]) + '</span>';
    }
    html += '</div>';

    // Title
    html += '<h1 class="detail-title">' + esc(d.logoText || d.name) + '</h1>';

    // Meta: score, year, runtime, rating
    html += '<div class="detail-meta-row">';
    if (d.score) html += '<span class="detail-score">★ ' + d.score + '</span>';
    if (d.year) { html += '<span class="detail-meta-dot"> · </span><span class="detail-meta-item">📅 ' + d.year + '</span>'; }
    if (d.runtime) { html += '<span class="detail-meta-dot"> · </span><span class="detail-meta-item">⏱ ' + esc(d.runtime) + '</span>'; }
    if (d.rating) { html += '<span class="detail-meta-dot"> · </span><span class="detail-rating-badge">' + esc(d.rating) + '</span>'; }
    html += '</div>';

    // Action buttons (Compact & Matching User Mockup)
    html += '<div class="detail-actions">';
    var savedTorrent = null;
    var savedPosition = 0;
    try { savedTorrent = (JSON.parse(localStorage.getItem('last_torrents') || '{}'))[d.id] || null; } catch(e) {}
    try { savedPosition = (JSON.parse(localStorage.getItem('playback_positions') || '{}'))[d.id] || 0; } catch(e) {}
    if (typeof savedPosition === 'object') savedPosition = savedPosition.time || 0;
    var hasResume = savedTorrent && savedPosition > 30;

    if (hasResume) {
      html += '<button class="detail-btn detail-btn-primary" id="detail-play" tabindex="0">▶ Продолжить</button>';
    } else {
      html += '<button class="detail-btn detail-btn-primary" id="detail-play" tabindex="0">▶ Смотреть</button>';
    }
    html += '<button class="detail-btn detail-btn-icon" id="detail-watchlist-btn" tabindex="0" title="Буду смотреть">+</button>';
    html += '<button class="detail-btn detail-btn-icon" id="detail-fav-btn" tabindex="0" title="В закладки">♡</button>';
    html += '<button class="detail-btn detail-btn-icon" id="detail-watched-btn" tabindex="0" title="Просмотрено">✓</button>';
    if (d.type === 'tv') {
      html += '<button class="detail-btn detail-btn-icon" id="detail-track-btn" tabindex="0" title="Следить за новыми сериями">🔔</button>';
    }
    html += '<button class="detail-btn detail-btn-trailer" id="detail-trailer-btn" tabindex="0">🎞 Трейлер</button>';
    html += '</div>'; // end detail-actions

    // Description
    if (d.description) {
      html += '<div class="detail-desc-wrap"><p class="detail-desc" id="detail-desc-text">' + esc(d.description) + '</p>';
      if (d.description.length > 200) {
        html += '<button class="detail-desc-toggle" id="detail-desc-toggle" tabindex="0">Ещё</button>';
      }
      html += '</div>';
    }

    // Left side specs & details: "О фильме" block to perfectly fill the left column
    html += '<div class="detail-specs-block">';
    html += '<div class="detail-specs-header">О ' + (d.type === 'tv' ? 'сериале' : 'фильме') + '</div>';
    html += '<div class="detail-specs-grid">';

    if (d.director) {
      html += '<div class="detail-spec-row"><span class="detail-spec-label">Режиссёр</span><span class="detail-spec-val">' + esc(d.director) + '</span></div>';
    }

    var countriesStr = '';
    if (d.countries && d.countries.length > 0) {
      countriesStr = d.countries.join(', ');
    } else if (d.country) {
      countriesStr = d.country;
    }
    if (countriesStr) {
      html += '<div class="detail-spec-row"><span class="detail-spec-label">Страна</span><span class="detail-spec-val">' + esc(countriesStr) + '</span></div>';
    }

    if (d.originalTitle && d.originalTitle !== d.name) {
      html += '<div class="detail-spec-row"><span class="detail-spec-label">Оригинал</span><span class="detail-spec-val detail-spec-italic">' + esc(d.originalTitle) + '</span></div>';
    }

    if (d.releaseDate || d.year) {
      var dateStr = d.releaseDate ? d.releaseDate : String(d.year);
      html += '<div class="detail-spec-row"><span class="detail-spec-label">Премьера</span><span class="detail-spec-val">' + esc(dateStr) + '</span></div>';
    }

    if (d.type === 'tv' && d.seasonsCount) {
      html += '<div class="detail-spec-row"><span class="detail-spec-label">Сезоны</span><span class="detail-spec-val">' + d.seasonsCount + ' ' + (d.seasonsCount === 1 ? 'сезон' : (d.seasonsCount < 5 ? 'сезона' : 'сезонов')) + '</span></div>';
    }

    if (d.genres && d.genres.length > 0) {
      html += '<div class="detail-spec-row detail-spec-row-genres"><span class="detail-spec-label">Жанры</span><div class="detail-spec-chips">';
      d.genres.slice(0, 4).forEach(function(g) {
        html += '<span class="detail-genre-chip">' + esc(g) + '</span>';
      });
      html += '</div></div>';
    }

    if (d.tagline) {
      html += '<div class="detail-spec-row detail-spec-row-tagline"><span class="detail-spec-label">Слоган</span><span class="detail-spec-val detail-spec-italic">' + esc(d.tagline) + '</span></div>';
    }

    if (d.productionCompanies && d.productionCompanies.length > 0) {
      var prodStr = d.productionCompanies.slice(0, 2).join(', ');
      html += '<div class="detail-spec-row"><span class="detail-spec-label">Студия</span><span class="detail-spec-val">' + esc(prodStr) + '</span></div>';
    }

    html += '<div class="detail-spec-row detail-spec-row-tech"><span class="detail-spec-label">Форматы</span><div class="detail-tech-badges">';
    html += '<span class="detail-tech-badge badge-4k">4K UHD</span>';
    html += '<span class="detail-tech-badge badge-dv">Dolby Vision</span>';
    html += '<span class="detail-tech-badge badge-hdr">HDR10+</span>';
    html += '<span class="detail-tech-badge badge-audio">5.1 / Atmos</span>';
    html += '</div></div>';

    html += '</div>'; // end detail-specs-grid
    html += '</div>'; // end detail-specs-block

    html += '</div>'; // end detail-hero-left

    // RIGHT SIDE: Cast Section with 4x2 Grid of 8 Actor Cards
    html += '<div class="detail-hero-right">';
    if (d.cast && d.cast.length > 0) {
      html += '<div class="detail-cast-section">';
      html += '<div class="detail-cast-header-row"><span class="detail-cast-title">В главных ролях</span>';
      if (d.cast.length > 8) {
        html += '<button class="detail-all-cast-btn" id="detail-all-cast-btn" tabindex="0">Все актеры ›</button>';
      }
      html += '</div>';

      html += '<div class="detail-cast-grid-4x2">';
      d.cast.slice(0, 8).forEach(function(c, idx) {
        var avatar = imgUrl(c.image);
        var pId = c.id || '';
        var rawRole = c.role || '';
        var cleanRole = rawRole.indexOf('/') !== -1 ? rawRole.split('/')[0].trim() : rawRole;
        html += '<div class="detail-actor-card" data-person-id="' + pId + '" data-person-name="' + esc(c.name) + '" data-cast-idx="' + idx + '" tabindex="0">';
        html += '<div class="detail-actor-photo"><img src="' + esc(avatar) + '" class="detail-actor-img" onerror="this.style.display=\'none\'" loading="lazy"></div>';
        html += '<div class="detail-actor-name">' + esc(c.name) + '</div>';
        if (cleanRole) html += '<div class="detail-actor-role">' + esc(cleanRole) + '</div>';
        html += '</div>';
      });
      html += '</div>'; // end detail-cast-grid-4x2
      html += '</div>'; // end detail-cast-section
    }
    html += '</div>'; // end detail-hero-right

    html += '</div>'; // end detail-upper-hero

    // FULL WIDTH STREAMING SECTION: Tabs & Streams / Torrents
    html += '<div class="detail-stream-section">';

    // Tabs: Episodes (for TV) / Torrents / Sources
    if (d.type === 'tv') {
      html += '<div class="detail-tabs">';
      html += '<button class="detail-tab active" data-tab="episodes" tabindex="0">Серии</button>';
      html += '<button class="detail-tab" data-tab="torrents" tabindex="0">Торренты</button>';
      html += '<button class="detail-tab" data-tab="sources" tabindex="0">Источники</button>';
      html += '</div>';
    } else {
      html += '<div class="detail-tabs">';
      html += '<button class="detail-tab active" data-tab="torrents" tabindex="0">Торренты</button>';
      html += '<button class="detail-tab" data-tab="sources" tabindex="0">Источники</button>';
      html += '</div>';
    }

    // Season selector for TV shows
    if (d.type === 'tv') {
      var sCount = d.seasonsCount || (d.seasons && d.seasons.length) || 1;
      html += '<div class="detail-season-wrap">';
      html += '<div class="detail-season-title">Сезон:</div>';
      html += '<div class="detail-season-row" id="season-row">';
      for (var s = 1; s <= sCount; s++) {
        var sVal = String(s);
        var isAct = (state.detailSeason === sVal || (!state.detailSeason && s === 1));
        html += '<button class="season-btn' + (isAct ? ' active' : '') + '" data-season="' + sVal + '" tabindex="0">' + s + ' сезон</button>';
      }
      html += '</div></div>';
    }

    // Tab content
    html += '<div class="detail-tab-content">';
    if (d.type === 'tv') {
      html += '<div id="episodes-results" class="detail-tab-pane active" data-pane="episodes"><p class="detail-loading-text">Загрузка серий 1 сезона...</p></div>';
      html += '<div id="torrent-results" class="detail-tab-pane" data-pane="torrents"><p class="detail-loading-text">Поиск торрентов...</p></div>';
      html += '<div id="sources-results" class="detail-tab-pane" data-pane="sources"><p class="detail-loading-text">Поиск источников...</p></div>';
    } else {
      html += '<div id="torrent-results" class="detail-tab-pane active" data-pane="torrents"><p class="detail-loading-text">Поиск торрентов...</p></div>';
      html += '<div id="sources-results" class="detail-tab-pane" data-pane="sources"><p class="detail-loading-text">Поиск источников...</p></div>';
    }
    html += '</div>'; // end tab-content
    html += '</div>'; // end detail-stream-section

    html += '</div>'; // end overlay

    if (!$detail) $detail = document.getElementById('detail');
    if ($detail) {
      var contentEl = $detail.querySelector('#detail-content');
      if (contentEl) contentEl.innerHTML = html;
    }

    // Detect backdrop luminance and apply theme to the about card
    detectBackdropLuminance(backdrop, function(isLight) {
      var card = document.getElementById('detail-about-card');
      if (card) {
        if (isLight) {
          card.classList.add('theme-light');
          card.classList.remove('theme-dark');
        } else {
          card.classList.add('theme-dark');
          card.classList.remove('theme-light');
        }
      }
    });

    // Bind events
    bindDetailBack();
    bindDetailActions(d);
    bindCastItems();
    bindDetailTabs();
    bindDescriptionToggle();
    bindSeasonSelector(d);

    // Load content
    if (d.type === 'tv') {
      state.detailTab = 'episodes';
      state.detailSeason = '1';
      loadSeasonEpisodes(d, 1);
      searchTorrents(d, 1);
    } else {
      state.detailTab = 'torrents';
      searchTorrents(d, null);
    }
    searchSources(d);

    // Focus primary play button
    setTimeout(function() {
      var playBtn = document.getElementById('detail-play');
      if (playBtn) {
        setDetailFocus(playBtn);
      }
    }, 100);
  }

  function imgUrl(path) {
    if (!path) return '';
    if (path.indexOf('/') === 0) return API + path;
    return path;
  }

  function hideDetail() {
    if (!$detail) $detail = document.getElementById('detail');
    if ($detail) {
      $detail.classList.add('hidden');
      $detail.style.display = 'none';
    }
    var app = document.getElementById('app');
    if (app) {
      app.classList.remove('hidden');
      app.style.display = 'block';
    }
    var c = document.querySelector('.card.focused');
    if (c) {
      try { c.focus(); } catch(e) {}
    } else {
      focusNav(state.focusedNav || 0);
    }
  }

  function bindDetailBack() {
    var btn = document.getElementById('detail-back-btn');
    if (btn) {
      btn.addEventListener('click', function() { hideDetail(); });
    }
  }

  function bindDetailActions(d) {
    var playBtn = document.getElementById('detail-play');
    if (playBtn) {
      playBtn.addEventListener('click', function() {
        var det = state.detail || d;
        if (det && det.type === 'tv') {
          state.detailTab = 'episodes';
          switchDetailTab('episodes');
          var firstEp = document.querySelector('#episodes-results .episode-card');
          if (firstEp) {
            setDetailFocus(firstEp);
          }
          return;
        }

        var savedTorrent = null;
        var savedPosition = 0;
        if (det && det.id) {
          try { savedTorrent = (JSON.parse(localStorage.getItem('last_torrents') || '{}'))[det.id] || null; } catch(ex) {}
          try { savedPosition = (JSON.parse(localStorage.getItem('playback_positions') || '{}'))[det.id] || 0; } catch(ex) {}
          if (typeof savedPosition === 'object') savedPosition = savedPosition.time || 0;
        }
        if (savedTorrent && savedTorrent.magnet && savedPosition > 30) {
          openTorrent(savedTorrent.magnet, savedTorrent.title || (det ? det.name : ''));
          return;
        }
        // Switch to torrents tab and focus first item
        state.detailTab = 'torrents';
        switchDetailTab('torrents');
        var first = document.querySelector('#torrent-results .torrent-item');
        if (first) {
          setDetailFocus(first);
        } else {
          state._pendingFocusTorrent = true;
        }
      });
    }

    var favBtn = document.getElementById('detail-fav-btn');
    var watchlistBtn = document.getElementById('detail-watchlist-btn');
    var watchedBtn = document.getElementById('detail-watched-btn');

    // 1. Favorites ("Закладки") toggle
    var backBtn = document.getElementById('detail-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        hideDetail();
      });
    }

    var trailerBtn = document.getElementById('detail-trailer-btn');
    if (trailerBtn) {
      trailerBtn.addEventListener('click', function() {
        showTvToast('Трейлер: ' + (d.logoText || d.name), 2000);
      });
    }

    // 1. Favorites ("Закладки") toggle
    if (favBtn) {
      apiFetch('/api/user/favorites', function(err, res) {
        if (!err && res && res.favorites) {
          var isFav = res.favorites.some(function(f) { return Number(f.tmdbId) === Number(d.id); });
          if (isFav) {
            favBtn.classList.add('active-action');
            favBtn.textContent = '♥';
            favBtn.style.color = '#f87171';
          } else {
            favBtn.classList.remove('active-action');
            favBtn.textContent = '♡';
            favBtn.style.color = '';
          }
        }
      });
      favBtn.addEventListener('click', function() {
        var isFav = favBtn.classList.contains('active-action');
        if (isFav) {
          apiDelete('/api/user/favorites/' + d.id, function(err) {
            if (!err) {
              favBtn.classList.remove('active-action');
              favBtn.textContent = '♡';
              favBtn.style.color = '';
              showTvToast('Удалено из закладок', 2000);
              if (state.section === 'my' && typeof loadMyData === 'function') loadMyData();
            }
          });
        } else {
          apiPost('/api/user/favorites', {
            tmdbId: d.id, mediaType: d.type || 'movie', titleName: d.logoText || d.name, poster: d.poster
          }, function(err) {
            if (!err) {
              favBtn.classList.add('active-action');
              favBtn.textContent = '♥';
              favBtn.style.color = '#f87171';
              showTvToast('Добавлено в закладки ♥', 2000);
              if (state.section === 'my' && typeof loadMyData === 'function') loadMyData();
            }
          });
        }
      });
    }

    // 2. Watchlist ("Буду смотреть") toggle
    if (watchlistBtn) {
      apiFetch('/api/user/watchlist', function(err, res) {
        if (!err && res && res.watchlist) {
          var inWl = res.watchlist.some(function(w) { return Number(w.tmdbId) === Number(d.id); });
          if (inWl) {
            watchlistBtn.classList.add('active-action');
            watchlistBtn.textContent = '✓';
            watchlistBtn.style.color = '#e8c170';
          } else {
            watchlistBtn.classList.remove('active-action');
            watchlistBtn.textContent = '+';
            watchlistBtn.style.color = '';
          }
        }
      });
      watchlistBtn.addEventListener('click', function() {
        var inWl = watchlistBtn.classList.contains('active-action');
        if (inWl) {
          apiDelete('/api/user/watchlist/' + d.id, function(err) {
            if (!err) {
              watchlistBtn.classList.remove('active-action');
              watchlistBtn.textContent = '+';
              watchlistBtn.style.color = '';
              showTvToast('Удалено из списка «Буду смотреть»', 2000);
              if (state.section === 'my' && typeof loadMyData === 'function') loadMyData();
            }
          });
        } else {
          apiPost('/api/user/watchlist', {
            tmdbId: d.id, mediaType: d.type || 'movie', titleName: d.logoText || d.name, poster: d.poster
          }, function(err) {
            if (!err) {
              watchlistBtn.classList.add('active-action');
              watchlistBtn.textContent = '✓';
              watchlistBtn.style.color = '#e8c170';
              showTvToast('Добавлено в «Буду смотреть» +', 2000);
              if (state.section === 'my' && typeof loadMyData === 'function') loadMyData();
            }
          });
        }
      });
    }

    // 3. Watched ("Просмотрено") toggle
    if (watchedBtn) {
      apiFetch('/api/user/history', function(err, res) {
        if (!err && res && res.history) {
          var isWatched = res.history.some(function(h) { return Number(h.tmdbId) === Number(d.id); });
          if (isWatched) {
            watchedBtn.classList.add('active-action');
            watchedBtn.style.color = '#6ee7b7';
          } else {
            watchedBtn.classList.remove('active-action');
            watchedBtn.style.color = '';
          }
        }
      });
      watchedBtn.addEventListener('click', function() {
        var isWatched = watchedBtn.classList.contains('active-action');
        if (isWatched) {
          apiDelete('/api/user/history/' + d.id, function(err) {
            if (!err) {
              watchedBtn.classList.remove('active-action');
              watchedBtn.style.color = '';
              showTvToast('Удалено из просмотренного', 2000);
              if (state.section === 'my' && typeof loadMyData === 'function') loadMyData();
            }
          });
        } else {
          apiPost('/api/user/history', {
            tmdbId: d.id, mediaType: d.type || 'movie', titleName: d.logoText || d.name, poster: d.poster, progress: 100, timestamp: Date.now()
          }, function(err) {
            if (!err) {
              watchedBtn.classList.add('active-action');
              watchedBtn.style.color = '#6ee7b7';
              showTvToast('Отмечено как просмотренное ✓', 2000);
              if (state.section === 'my' && typeof loadMyData === 'function') loadMyData();
            }
          });
        }
      });
    }

    var trackBtn = document.getElementById('detail-track-btn');
    if (trackBtn && d.type === 'tv') {
      apiFetch('/api/notifications/is-subscribed/' + d.id, function(err, res) {
        if (!err && res && res.isSubscribed) {
          trackBtn.textContent = '🔕 Не следить';
          trackBtn.classList.add('active-action');
        } else {
          trackBtn.textContent = '🔔 Следить';
          trackBtn.classList.remove('active-action');
        }
      });
      trackBtn.addEventListener('click', function() {
        var isSubbed = trackBtn.classList.contains('active-action');
        if (isSubbed) {
          apiDelete('/api/notifications/subscribe/' + d.id, function(err) {
            if (!err) {
              trackBtn.textContent = '🔔 Следить';
              trackBtn.classList.remove('active-action');
              showTvToast('Вы отписались от обновлений серий', 2000);
            }
          });
        } else {
          apiPost('/api/notifications/subscribe', {
            tmdbId: d.id,
            title: d.logoText || d.name,
            poster: d.poster
          }, function(err) {
            if (!err) {
              trackBtn.textContent = '🔕 Не следить';
              trackBtn.classList.add('active-action');
              showTvToast('Вы подписались на новые серии!', 2000);
            }
          });
        }
      });
    }
  }

  function bindCastItems() {
    var items = document.querySelectorAll('.detail-actor-card, .detail-cast-item');
    for (var i = 0; i < items.length; i++) {
      (function(item) {
        item.addEventListener('click', function() {
          var pId = item.getAttribute('data-person-id');
          var pName = item.getAttribute('data-person-name');
          if (pId) openPersonModal(pId, pName);
        });
      })(items[i]);
    }
    var allBtn = document.getElementById('detail-all-cast-btn');
    if (allBtn) {
      allBtn.addEventListener('click', function() {
        if (state.detail && state.detail.cast && state.detail.cast.length > 0) {
          openPersonModal(state.detail.cast[0].id, state.detail.cast[0].name);
        }
      });
    }
  }

  function openPersonModal(personId, personName) {
    var modal = document.getElementById('person-modal');
    if (!modal) return;

    // Remember previously focused element to return focus on modal close
    var activeEl = document.activeElement;
    state.personModalReturnEl = (activeEl && activeEl !== document.body) ? activeEl : document.querySelector('.detail-actor-card.focused');

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    var nameEl = document.getElementById('person-name');
    if (nameEl) nameEl.textContent = personName || 'Загрузка...';

    var metaEl = document.getElementById('person-meta');
    if (metaEl) metaEl.textContent = 'Загрузка данных...';

    var bioEl = document.getElementById('person-bio');
    if (bioEl) bioEl.textContent = '';

    var imgEl = document.getElementById('person-profile-img');
    if (imgEl) {
      imgEl.src = '';
      imgEl.style.display = 'none';
    }

    var grid = document.getElementById('person-filmography-grid');
    if (grid) {
      grid.innerHTML = '<p style="color:rgba(255,255,255,0.6);font-size:18px;padding:20px;">Загрузка фильмов...</p>';
      grid.scrollTop = 0;
    }

    var countEl = document.getElementById('person-filmography-count');
    if (countEl) countEl.textContent = '';

    // Set state
    state.inPersonModal = true;
    var backBtn = document.getElementById('person-modal-back');
    if (backBtn) {
      backBtn.classList.add('focused');
      try { backBtn.focus(); } catch(e) {}
      backBtn.onclick = function() {
        closePersonModal();
      };
    }

    apiFetch('/api/catalog/person/' + personId, function(err, data) {
      if (err || !data) {
        if (metaEl) metaEl.textContent = 'Не удалось загрузить данные персоны';
        if (grid) grid.innerHTML = '<p style="color:#ef4444;font-size:18px;padding:20px;">Ошибка загрузки</p>';
        return;
      }

      if (nameEl) nameEl.textContent = data.name || personName;

      var metaParts = [];
      if (data.birthday) metaParts.push('Родился: ' + data.birthday);
      if (data.placeOfBirth) metaParts.push(data.placeOfBirth);
      if (metaEl) metaEl.textContent = metaParts.join(' · ');

      if (bioEl) bioEl.textContent = data.biography || 'Биография пока отсутствует.';

      if (imgEl && data.profile) {
        imgEl.src = imgUrl(data.profile);
        imgEl.style.display = 'block';
      }

      var credits = data.credits || [];
      if (countEl) countEl.textContent = credits.length + ' работ';

      if (grid) {
        if (credits.length === 0) {
          grid.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:18px;padding:20px;">Фильмография пуста</p>';
        } else {
          var h = '';
          credits.forEach(function(c, idx) {
            h += '<div class="person-movie-card" data-idx="' + idx + '" data-movie-id="' + c.id + '" data-movie-type="' + c.type + '" tabindex="0">';
            h += '<div class="person-movie-poster-wrap">';
            h += '<img class="person-movie-poster" src="' + esc(imgUrl(c.poster)) + '" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22170%22 height=%22255%22><rect width=%22100%%22 height=%22100%%22 fill=%22%23161822%22/></svg>\'" loading="lazy">';
            if (c.score) {
              h += '<div class="person-movie-score">★ ' + Number(c.score).toFixed(1) + '</div>';
            }
            h += '</div>';
            h += '<div class="person-movie-info">';
            h += '<div class="person-movie-title">' + esc(c.title) + '</div>';
            var subParts = [];
            if (c.year) subParts.push(c.year);
            if (c.character) subParts.push(c.character);
            h += '<div class="person-movie-sub">' + esc(subParts.join(' · ')) + '</div>';
            h += '</div></div>';
          });
          grid.innerHTML = h;

          // Bind clicks
          var movieCards = grid.querySelectorAll('.person-movie-card');
          movieCards.forEach(function(card) {
            card.addEventListener('click', function() {
              var mId = card.getAttribute('data-movie-id');
              var mType = card.getAttribute('data-movie-type');
              if (mId) {
                closePersonModal();
                showDetail({ id: parseInt(mId, 10), type: mType || 'movie' });
              }
            });
          });
        }
      }
    });
  }

  function closePersonModal() {
    var modal = document.getElementById('person-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    state.inPersonModal = false;

    // Set cooldown timestamp so duplicate back events from TV remote do not close the detail view!
    var now = Date.now();
    lastBackTimestamp = now;
    state.modalCloseTimestamp = now;

    // Clear focused classes inside modal
    var modalFocused = document.querySelectorAll('#person-modal .focused');
    modalFocused.forEach(function(el) { el.classList.remove('focused'); });

    // Explicitly guarantee that $detail is visible and not hidden
    if (!$detail) $detail = document.getElementById('detail');
    if ($detail) {
      $detail.classList.remove('hidden');
      $detail.style.display = 'block';
    }

    // Restore focus to what opened the modal
    var target = state.personModalReturnEl;
    if (target && document.body.contains(target) && target.id !== 'detail-back-btn') {
      setDetailFocus(target);
    } else {
      var firstActor = document.querySelector('.detail-actor-card');
      if (firstActor) {
        setDetailFocus(firstActor);
      } else {
        var playBtn = document.getElementById('detail-play');
        if (playBtn) setDetailFocus(playBtn);
      }
    }
  }

  function handlePersonModalKey(code, key, e) {
    if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
      var now = Date.now();
      lastBackTimestamp = now;
      state.modalCloseTimestamp = now;
      closePersonModal();
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      return true;
    }

    var cards = Array.from(document.querySelectorAll('.person-movie-card'));
    var backBtn = document.getElementById('person-modal-back');
    var focusedCard = document.querySelector('.person-movie-card.focused');
    var isBackFocused = backBtn && backBtn.classList.contains('focused');
    var grid = document.getElementById('person-filmography-grid');
    var COLS = 7;

    function focusCardItem(card) {
      if (!card) return;
      if (focusedCard) focusedCard.classList.remove('focused');
      if (backBtn) backBtn.classList.remove('focused');
      card.classList.add('focused');
      try { card.focus(); } catch(ex) {}

      // Scroll inside grid container smoothly WITHOUT scrollIntoView
      if (grid) {
        var cardTop = card.offsetTop;
        var cardHeight = card.offsetHeight;
        var gridScroll = grid.scrollTop;
        var gridHeight = grid.clientHeight;
        if (cardTop < gridScroll) {
          grid.scrollTop = Math.max(0, cardTop - 12);
        } else if (cardTop + cardHeight > gridScroll + gridHeight) {
          grid.scrollTop = cardTop + cardHeight - gridHeight + 12;
        }
      }
    }

    if (code === 13 || code === 29443 || code === 65385 || code === 65376 || key === 'Enter') {
      if (isBackFocused) {
        closePersonModal();
      } else if (focusedCard) {
        focusedCard.click();
      }
      if (e && e.preventDefault) e.preventDefault();
      return true;
    }

    if (code === 38 || key === 'ArrowUp') {
      if (focusedCard) {
        var idxU = cards.indexOf(focusedCard);
        if (idxU >= COLS) {
          focusCardItem(cards[idxU - COLS]);
        } else {
          // In top row, go to Back button
          focusedCard.classList.remove('focused');
          if (backBtn) {
            backBtn.classList.add('focused');
            try { backBtn.focus(); } catch(ex) {}
          }
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return true;
    }

    if (code === 40 || key === 'ArrowDown') {
      if (isBackFocused && cards.length > 0) {
        backBtn.classList.remove('focused');
        focusCardItem(cards[0]);
      } else if (focusedCard) {
        var idxD = cards.indexOf(focusedCard);
        var targetD = idxD + COLS;
        if (targetD < cards.length) {
          focusCardItem(cards[targetD]);
        } else {
          var lastRowStart = Math.floor(cards.length / COLS) * COLS;
          if (idxD < lastRowStart && cards.length - 1 >= lastRowStart) {
            focusCardItem(cards[cards.length - 1]);
          }
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return true;
    }

    if (code === 37 || key === 'ArrowLeft') {
      if (focusedCard) {
        var idxL = cards.indexOf(focusedCard);
        if (idxL % COLS > 0) {
          focusCardItem(cards[idxL - 1]);
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return true;
    }

    if (code === 39 || key === 'ArrowRight') {
      if (focusedCard) {
        var idxR = cards.indexOf(focusedCard);
        if ((idxR % COLS < COLS - 1) && (idxR + 1 < cards.length)) {
          focusCardItem(cards[idxR + 1]);
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return true;
    }

    return false;
  }

  function bindDetailTabs() {
    $detail.querySelectorAll('.detail-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var tabName = tab.getAttribute('data-tab');
        state.detailTab = tabName;
        switchDetailTab(tabName);
      });
    });
  }

  function switchDetailTab(tabName) {
    $detail.querySelectorAll('.detail-tab').forEach(function(t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    $detail.querySelectorAll('.detail-tab-pane').forEach(function(p) {
      p.classList.toggle('active', p.getAttribute('data-pane') === tabName);
    });
  }

  function bindDescriptionToggle() {
    var toggle = document.getElementById('detail-desc-toggle');
    var descText = document.getElementById('detail-desc-text');
    if (toggle && descText) {
      toggle.addEventListener('click', function() {
        var expanded = descText.classList.toggle('expanded');
        toggle.textContent = expanded ? 'Свернуть' : 'Ещё';
      });
    }
  }

  function bindSeasonSelector(title) {
    var btns = document.querySelectorAll('.season-btn');
    for (var i = 0; i < btns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var val = btn.getAttribute('data-season') || '1';
          state.detailSeason = val;
          var all = document.querySelectorAll('.season-btn');
          for (var j = 0; j < all.length; j++) {
            all[j].classList.toggle('active', all[j] === btn);
          }
          var sNum = parseInt(val, 10) || 1;
          loadSeasonEpisodes(state.detail || title, sNum);
          searchTorrents(state.detail || title, sNum);
        });
      })(btns[i]);
    }
  }

  // Toast message on TV
  function showTvToast(msg, duration) {
    var existing = document.getElementById('tv-toast');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var toast = document.createElement('div');
    toast.id = 'tv-toast';
    toast.style.cssText = 'position:fixed;bottom:48px;left:50%;transform:translateX(-50%);background:rgba(18,22,32,0.96);border:1.5px solid #e8c170;color:#fff;padding:16px 32px;border-radius:14px;font-size:18px;font-weight:700;z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.85);backdrop-filter:blur(10px);pointer-events:none;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, duration || 3500);
  }

  // Extract episode number from filename
  function extractEpisodeNumber(fileName, fallbackIndex, seasonNum) {
    if (!fileName) return (fallbackIndex != null ? fallbackIndex + 1 : 1);
    var s = fileName.toLowerCase();

    // S01E05 or S1E5 or s01.e05
    var m = s.match(/[sS]\d{1,2}[._\-\s]*[eE](\d{1,3})\b/);
    if (m) return parseInt(m[1], 10);

    // 01x05 or 1x5
    m = s.match(/\b\d{1,2}[xх](\d{1,3})\b/);
    if (m) return parseInt(m[1], 10);

    // Explicit "серия 5", "эпизод 5", "ep. 5", "ep5"
    m = s.match(/(?:сери[яий]|эпизод|серия:|эпизод:|ep\.?|episode\.?)\s*(\d{1,3})\b/i);
    if (m) return parseInt(m[1], 10);

    // "5 серия" or "05 серия"
    m = s.match(/\b(\d{1,3})\s*(?:сери[яий]|эпизод|ep|episode)\b/i);
    if (m) return parseInt(m[1], 10);

    // Leading number in file name: e.g. "05 - Winter is coming.mkv"
    m = s.match(/^(?:\[[^\]]*\]\s*)?(\d{1,3})[\s._\-]/);
    if (m) return parseInt(m[1], 10);

    // Number before extension e.g. "Show.05.mkv"
    m = s.match(/[\s._\-](\d{1,2})\.(?:mkv|avi|mp4|ts|m4v)$/);
    if (m) return parseInt(m[1], 10);

    return (fallbackIndex != null ? fallbackIndex + 1 : 1);
  }

  function loadSeasonEpisodes(title, seasonNum) {
    var container = document.getElementById('episodes-results');
    if (!container) return;

    var showId = (title && title.id) || (state.detail && state.detail.id);
    if (!showId) {
      container.innerHTML = '<p class="detail-empty-text">Серии не найдены</p>';
      return;
    }

    container.innerHTML = '<p class="detail-loading-text">Загрузка серий ' + seasonNum + ' сезона...</p>';

    apiFetch('/api/tv/' + showId + '/season/' + seasonNum, function(err, data) {
      if (err || !data || !data.episodes || data.episodes.length === 0) {
        container.innerHTML = '<p class="detail-empty-text">Серии ' + seasonNum + ' сезона не найдены</p>';
        return;
      }

      var episodes = data.episodes;
      var html = '<div class="episodes-grid">';
      for (var i = 0; i < episodes.length; i++) {
        var ep = episodes[i];
        var epStill = ep.thumbnail ? imgUrl(ep.thumbnail) : imgUrl((title && (title.backdrop || title.poster)) || '');
        var epTitle = ep.title || ('Серия ' + ep.episode);
        var epNumText = 'S' + seasonNum + ' E' + ep.episode;
        var duration = ep.runtime || '';

        html += '<div class="episode-card" data-index="' + i + '" data-episode="' + ep.episode + '" data-season="' + seasonNum + '" tabindex="0">';
        html += '  <div class="ep-still-box">';
        if (epStill) {
          html += '    <img src="' + esc(epStill) + '" class="ep-still-img" onerror="this.src=\'/tv/placeholder.png\'" loading="lazy">';
        }
        html += '    <div class="ep-badge-num">' + epNumText + '</div>';
        if (duration && duration !== '—') {
          html += '    <div class="ep-badge-dur">' + esc(duration) + '</div>';
        }
        html += '  </div>';
        html += '  <div class="ep-content">';
        html += '    <div class="ep-header">';
        html += '      <span class="ep-num-label">' + ep.episode + '.</span>';
        html += '      <div class="ep-title">' + esc(epTitle) + '</div>';
        html += '    </div>';
        if (ep.synopsis) {
          html += '    <div class="ep-synopsis">' + esc(ep.synopsis) + '</div>';
        }
        html += '  </div>';
        html += '  <div class="ep-actions">';
        html += '    <button class="ep-play-btn" tabindex="-1">';
        html += '      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        html += '      <span>Смотреть</span>';
        html += '    </button>';
        html += '  </div>';
        html += '</div>';
      }
      html += '</div>';
      container.innerHTML = html;

      var cards = container.querySelectorAll('.episode-card');
      for (var j = 0; j < cards.length; j++) {
        (function(card, epItem) {
          card.addEventListener('click', function() {
            playSeasonEpisode(title, seasonNum, epItem);
          });
        })(cards[j], episodes[j]);
      }
    });
  }

  function playSeasonEpisode(title, seasonNum, ep) {
    var showId = (title && title.id) || (state.detail && state.detail.id) || 0;
    var showName = (title && (title.name || title.title)) || (state.detail && (state.detail.name || state.detail.title)) || '';
    var epTitleStr = showName + ' · S' + seasonNum + ' E' + ep.episode + (ep.title ? ' · ' + ep.title : '');
    var epPoster = ep.thumbnail ? imgUrl(ep.thumbnail) : ((title && title.poster) || '');

    showTvToast('Поиск серии ' + ep.episode + ' (' + seasonNum + ' сезон)...', 4000);

    var cacheKey = (showId ? String(showId) : '') + '_' + showName;
    var allTorrents = (state._torrentCache && state._torrentCache[cacheKey]) || null;

    function proceedWithTorrents(torrentsList) {
      if (!torrentsList || torrentsList.length === 0) {
        showTvToast('Торренты не найдены. Открываем онлайн-источники...', 3500);
        state.detailTab = 'sources';
        switchDetailTab('sources');
        return;
      }

      var filtered = torrentsList.filter(function(item) {
        return matchesTorrentSeason(item.title || '', seasonNum);
      });
      if (filtered.length === 0) filtered = torrentsList;

      var savedKey = 'season_torrent_' + showId + '_' + seasonNum;
      var savedTorrent = null;
      try { savedTorrent = JSON.parse(localStorage.getItem(savedKey) || 'null'); } catch(e) {}

      var chosenTorrent = null;
      if (savedTorrent && savedTorrent.magnet) {
        chosenTorrent = savedTorrent;
      } else {
        var sorted = filtered.slice().sort(function(a, b) { return (b.seeders || 0) - (a.seeders || 0); });
        chosenTorrent = sorted[0];
      }

      if (!chosenTorrent || !chosenTorrent.magnet) {
        showTvToast('Торрент не найден', 3000);
        return;
      }

      showTvToast('Подключение к раздаче...', 3000);

      apiPost('/api/torrents/stream', { magnet: chosenTorrent.magnet, title: chosenTorrent.title }, function(err, data) {
        if (err || !data || !data.files || data.files.length === 0) {
          showTvToast('Выбор файла раздачи...', 2000);
          openTorrent(chosenTorrent.magnet, chosenTorrent.title);
          return;
        }

        var files = data.files;
        var matchedFile = null;
        for (var f = 0; f < files.length; f++) {
          var epNum = extractEpisodeNumber(files[f].name, f, seasonNum);
          if (epNum === ep.episode) {
            matchedFile = files[f];
            break;
          }
        }

        if (matchedFile) {
          try {
            localStorage.setItem(savedKey, JSON.stringify({ magnet: chosenTorrent.magnet, title: chosenTorrent.title }));
          } catch(se) {}

          playFile(matchedFile, epTitleStr, showId, epPoster);
        } else {
          showTorrentPrePlayModal(files, chosenTorrent.title, showId, chosenTorrent.magnet);
        }
      });
    }

    if (allTorrents) {
      proceedWithTorrents(allTorrents);
    } else {
      apiFetch('/api/torrents/search?q=' + encodeURIComponent(showName), function(err, data) {
        if (err || !data || !data.results) {
          proceedWithTorrents([]);
          return;
        }
        if (!state._torrentCache) state._torrentCache = {};
        state._torrentCache[cacheKey] = data.results;
        proceedWithTorrents(data.results);
      });
    }
  }

  // ========== Sources ==========
  function searchSources(title) {
    var container = document.getElementById('sources-results');
    if (!container) return;

    var searchType = title.type === 'tv' ? 'series' : 'movie';
    apiFetch('/api/online/search?q=' + encodeURIComponent(title.name) + '&type=' + searchType, function(err, data) {
      if (err || !data || !data.results || data.results.length === 0) {
        container.innerHTML = '<p class="detail-empty-text">Источники не найдены</p>';
        return;
      }

      var providerLabels = { collaps: 'Collaps', hdvb: 'HDVB', phantom: 'Phantom' };
      var html = '<div class="detail-sources-list">';
      data.results.slice(0, 10).forEach(function(item, i) {
        html += '<div class="detail-source-item source-item" data-index="' + i + '" data-provider="' + esc(item.provider) + '" data-id="' + esc(item.id) + '" tabindex="0">';
        html += '<div class="detail-source-info"><div class="detail-source-title">' + esc(item.title) + '</div>';
        html += '<div class="detail-source-meta">' + (providerLabels[item.provider] || item.provider);
        if (item.year) html += ' · ' + item.year;
        html += '</div></div>';
        html += '<span class="detail-source-play">Смотреть</span>';
        html += '</div>';
      });
      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('.source-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var provider = item.getAttribute('data-provider');
          var id = item.getAttribute('data-id');
          var hlsUrl = '/api/online/hls/' + provider + '/' + encodeURIComponent(id);
          var sIdNum = (title && title.id) || 0;
          var sPoster = (title && title.poster) || '';
          openPlayer('?url=' + encodeURIComponent(hlsUrl) + '&title=' + encodeURIComponent(title.name) + '&id=' + sIdNum + '&poster=' + encodeURIComponent(sPoster));
        });
      });
    });
  }

  // ========== Torrent Meta Badges (.mkv, .avi, 1080p, etc.) ==========
  function parseTorrentMeta(str) {
    if (!str) return [];
    var tags = [];
    var s = str.toUpperCase();

    // 1. Container / File Format
    if (/\.MKV\b|\[MKV\]|\bMKV\b/.test(s)) tags.push({ text: 'MKV', type: 'fmt' });
    else if (/\.AVI\b|\[AVI\]|\bAVI\b/.test(s)) tags.push({ text: 'AVI', type: 'fmt' });
    else if (/\.MP4\b|\[MP4\]|\bMP4\b/.test(s)) tags.push({ text: 'MP4', type: 'fmt' });
    else if (/\.TS\b|\[TS\]|\bM2TS\b|\bBDMV\b/.test(s)) tags.push({ text: 'TS', type: 'fmt' });
    else if (/\.MOV\b|\bMOV\b/.test(s)) tags.push({ text: 'MOV', type: 'fmt' });

    // 2. Resolution
    if (/\b(4K|UHD|2160P)\b/.test(s)) tags.push({ text: '4K', type: 'res' });
    else if (/\b(1080P|1080I|FHD|FULL[\s._-]?HD)\b/.test(s)) tags.push({ text: '1080p', type: 'res' });
    else if (/\b(720P|HD)\b/.test(s)) tags.push({ text: '720p', type: 'res' });
    else if (/\b(480P|576P|SD)\b/.test(s)) tags.push({ text: 'SD', type: 'res' });

    // 3. Rip / Release Quality
    if (/\b(REMUX|BD-REMUX|BDREMUX)\b/.test(s)) tags.push({ text: 'Remux', type: 'qual' });
    else if (/\b(BDRIP|BRRIP|BLURAY|BLU-RAY)\b/.test(s)) tags.push({ text: 'BDRip', type: 'qual' });
    else if (/\b(WEB-DL|WEBDL|WEB-DLRIP|WEBRIP)\b/.test(s)) tags.push({ text: 'WEB-DL', type: 'qual' });
    else if (/\b(HDTV|HDTVRIP)\b/.test(s)) tags.push({ text: 'HDTV', type: 'qual' });
    else if (/\b(DVDRIP|DVD9|DVD5|DVD)\b/.test(s)) tags.push({ text: 'DVDRip', type: 'qual' });
    else if (/\b(CAM|CAMRIP|TELESYNC|TELE-SYNC|TS-RIP)\b/.test(s)) tags.push({ text: 'CAM / TS', type: 'qual' });

    // 4. Codec
    if (/\b(HEVC|H\.?265|X265)\b/.test(s)) tags.push({ text: 'HEVC', type: 'codec' });
    else if (/\b(AVC|H\.?264|X264)\b/.test(s)) tags.push({ text: 'H.264', type: 'codec' });
    else if (/\bAV1\b/.test(s)) tags.push({ text: 'AV1', type: 'codec' });
    else if (/\b(XVID|DIVX)\b/.test(s)) tags.push({ text: 'XviD', type: 'codec' });

    // 5. Video HDR / Color
    if (/\b(DV|DOLBY[\s._-]?VISION)\b/.test(s)) tags.push({ text: 'Dolby Vision', type: 'qual' });
    else if (/\b(HDR10\+|HDR10|HDR)\b/.test(s)) tags.push({ text: 'HDR', type: 'qual' });

    // 6. Audio
    if (/\b(ATMOS|DOLBY[\s._-]?ATMOS)\b/.test(s)) tags.push({ text: 'Atmos', type: 'audio' });
    if (/\b(DTS-HD[\s._-]?MA|DTS-HD|DTS-HR|DTS)\b/.test(s)) tags.push({ text: 'DTS', type: 'audio' });
    else if (/\b(AC3|DD5\.?1|DD\+|E-AC3|DOLBY[\s._-]?DIGITAL)\b/.test(s)) tags.push({ text: 'AC3 5.1', type: 'audio' });
    else if (/\bAAC\b/.test(s)) tags.push({ text: 'AAC', type: 'audio' });

    return tags;
  }

  function renderMetaBadges(str) {
    var tags = parseTorrentMeta(str);
    if (!tags.length) return '';
    var res = '<div class="t-badges">';
    for (var i = 0; i < tags.length; i++) {
      var cls = 't-badge' + (tags[i].type ? ' t-badge-' + tags[i].type : '');
      res += '<span class="' + cls + '">' + esc(tags[i].text) + '</span>';
    }
    res += '</div>';
    return res;
  }
  window.parseTorrentMeta = parseTorrentMeta;
  window.renderMetaBadges = renderMetaBadges;

  // ========== Season Matching & Torrent Search ==========
  function matchesTorrentSeason(title, s) {
    if (!title || !s) return true;
    var t = title.toLowerCase();
    var sPadded = (s < 10 ? '0' + s : '' + s);

    // Check explicit season ranges first: "сезоны 1-4", "1-5 сезон", "seasons 1-3"
    var rangeMatch = t.match(/(?:сезон[ыа]?|seasons?)\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})/i);
    if (!rangeMatch) {
      rangeMatch = t.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:сезон[ыа]?|seasons?)/i);
    }
    if (rangeMatch) {
      var startS = parseInt(rangeMatch[1], 10);
      var endS = parseInt(rangeMatch[2], 10);
      if (s >= startS && s <= endS) return true;
      return false;
    }

    // Standard season patterns
    if (t.indexOf('сезон: ' + s) >= 0 ||
        t.indexOf('сезон:' + s) >= 0 ||
        t.indexOf('сезон ' + s) >= 0 ||
        t.indexOf(s + ' сезон') >= 0 ||
        t.indexOf(s + '-й сезон') >= 0 ||
        t.indexOf(s + 's') >= 0 ||
        t.indexOf('s' + sPadded) >= 0 ||
        t.indexOf('s' + s) >= 0 ||
        t.indexOf('season ' + s) >= 0 ||
        t.indexOf('season' + s) >= 0 ||
        t.indexOf(s + ' season') >= 0 ||
        t.indexOf('сезоны 1-') >= 0 ||
        t.indexOf('сезон 1-') >= 0 ||
        t.indexOf('seasons 1-') >= 0) {
      return true;
    }

    // Specific episode / season patterns e.g. "01х", "1x", "s01e"
    var xReg = new RegExp('\\b0?' + s + '[xх]\\d+', 'i');
    if (xReg.test(t)) return true;

    return false;
  }
  window.matchesTorrentSeason = matchesTorrentSeason;

  function searchTorrents(title, season) {
    var container = document.getElementById('torrent-results');
    if (!container) return;

    if (!state._torrentCache) state._torrentCache = {};
    var cacheKey = (title.id ? String(title.id) : '') + '_' + title.name;

    function renderTorrentResults(allResults) {
      if (!allResults || allResults.length === 0) {
        container.innerHTML = '<p class="detail-empty-text">Торренты не найдены</p>';
        return;
      }

      var filtered = allResults;
      var isFallback = false;
      if (season) {
        filtered = allResults.filter(function(item) {
          return matchesTorrentSeason(item.title || '', season);
        });
        if (filtered.length === 0) {
          filtered = allResults;
          isFallback = true;
        }
      }

      // Sort by seeders desc
      var sorted = filtered.slice().sort(function(a, b) { return (b.seeders || 0) - (a.seeders || 0); });

      var html = '';
      if (isFallback) {
        html += '<p class="detail-torrent-notice" style="color:#e8c170;padding:6px 12px;font-size:16px;">Показаны все раздачи сериала (точных совпадений для ' + season + ' сезона не найдено):</p>';
      }
      html += '<div class="detail-torrents-list">';
      sorted.slice(0, 25).forEach(function(torrent, i) {
        html += '<div class="torrent-item" data-index="' + i + '" data-magnet="' + esc(torrent.magnet || '') + '" data-title="' + esc(torrent.title || '') + '" tabindex="0">';
        html += '<div class="detail-torrent-title">' + esc(torrent.title || '') + '</div>';
        html += renderMetaBadges(torrent.title);
        html += '<div class="detail-torrent-meta">';
        if (torrent.sizeFormatted) html += '<span>' + esc(torrent.sizeFormatted) + '</span>';
        if (torrent.seeders != null) html += '<span class="detail-torrent-seeds">Seeds: ' + torrent.seeders + '</span>';
        if (torrent.peers != null) html += '<span>Peers: ' + torrent.peers + '</span>';
        html += '</div></div>';
      });
      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('.torrent-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var magnet = item.getAttribute('data-magnet');
          var torrentTitle = item.getAttribute('data-title');
          if (magnet) openTorrent(magnet, torrentTitle);
        });
      });

      if (state._pendingFocusTorrent) {
        state._pendingFocusTorrent = false;
        var firstTorrent = container.querySelector('.torrent-item');
        if (firstTorrent) setDetailFocus(firstTorrent);
      }
    }

    if (state._torrentCache[cacheKey]) {
      renderTorrentResults(state._torrentCache[cacheKey]);
      return;
    }

    container.innerHTML = '<p class="detail-loading-text">Поиск торрентов' + (season ? ' (' + season + ' сезон)...' : '...') + '</p>';

    // Always query by base show name (never append ' S01' which causes Russian trackers to return 0 results)
    var query = title.name;
    apiFetch('/api/torrents/search?q=' + encodeURIComponent(query), function(err, data) {
      if (err || !data || !data.results || data.results.length === 0) {
        container.innerHTML = '<p class="detail-empty-text">Торренты не найдены</p>';
        return;
      }
      state._torrentCache[cacheKey] = data.results;
      renderTorrentResults(data.results);
    });
  }

  function openTorrent(magnet, title) {
    var movieId = (state.detail && state.detail.id) || 0;
    var movieName = (state.detail && (state.detail.name || state.detail.title)) || title;
    var mediaType = (state.detail && state.detail.type) || 'movie';

    // Save torrent info for resume
    if (movieId) {
      try {
        var last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
        last[movieId] = { magnet: magnet, title: movieName, type: mediaType };
        localStorage.setItem('last_torrents', JSON.stringify(last));
      } catch(e) {}

      if (state.detail && state.detail.type === 'tv' && state.detailSeason) {
        try {
          localStorage.setItem('season_torrent_' + movieId + '_' + state.detailSeason, JSON.stringify({ magnet: magnet, title: movieName, type: mediaType }));
        } catch(se) {}
      }
    }

    var poster = (state.detail && state.detail.poster) || '';

    // Check for saved resume position
    var startParam = '';
    if (movieId) {
      try {
        var positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
        var saved = positions[movieId];
        if (saved && typeof saved === 'object' && saved.time > 30) {
          startParam = '&start=' + Math.floor(saved.time);
        }
      } catch(e) {}
    }

    var isAvplay = typeof webapis !== 'undefined' && webapis.avplay !== null && webapis.avplay !== undefined;

    apiPost('/api/torrents/stream', { magnet: magnet, title: title }, function(err, data) {
      if (err || !data || !data.files || data.files.length === 0) {
        var fallbackUrl = isAvplay
          ? API + '/api/torrents/proxy?link=' + encodeURIComponent(magnet) + '&index=0'
          : API + '/api/torrents/hls?link=' + encodeURIComponent(magnet) + '&index=0' + startParam;
        var fallbackFiles = [{ name: title, directUrl: fallbackUrl, streamUrl: fallbackUrl, sizeFormatted: '' }];
        showTorrentPrePlayModal(fallbackFiles, title, movieId, magnet);
        return;
      }

      showTorrentPrePlayModal(data.files, title, movieId, magnet);
    });
  }

  // ========== Torrent Pre-Play Confirmation Modal ==========
  function showTorrentPrePlayModal(files, title, movieId, magnet) {
    if (!files || files.length === 0) {
      files = [{ name: title, directUrl: '', streamUrl: '', sizeFormatted: '' }];
    }

    var modalExisting = document.getElementById('torrent-confirm-modal');
    if (modalExisting && modalExisting.parentNode) {
      modalExisting.parentNode.removeChild(modalExisting);
    }

    var selectedIdx = 0;
    var isMulti = files.length > 1;
    var movieName = (state.detail && (state.detail.title || state.detail.name)) || title;

    var wrap = document.createElement('div');
    wrap.id = 'torrent-confirm-modal';
    wrap.className = 'torrent-confirm-wrap';

    function buildModalHtml() {
      var activeFile = files[selectedIdx] || files[0];
      var comboMeta = title + ' ' + (activeFile.name || '');
      var badgesHtml = renderMetaBadges(comboMeta);
      var sizeText = activeFile.sizeFormatted || '';

      var h = '<div class="torrent-confirm-modal">';
      h += '<div class="torrent-confirm-title">' + esc(movieName) + '</div>';
      if (isMulti) {
        h += '<div class="torrent-confirm-sub">Выберите файл или серию для запуска (' + files.length + ' файлов в торренте)</div>';
      } else {
        h += '<div class="torrent-confirm-sub">' + esc(activeFile.name || title) + '</div>';
      }

      h += '<div class="torrent-confirm-meta" id="t-modal-badges">';
      h += badgesHtml;
      if (sizeText) h += '<span class="t-badge">' + esc(sizeText) + '</span>';
      h += '</div>';

      if (isMulti) {
        h += '<div class="torrent-confirm-files" id="t-modal-files">';
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          var fBadges = renderMetaBadges(f.name || '');
          var fCls = 'torrent-confirm-file-item' + (i === selectedIdx ? ' focused' : '');
          h += '<div class="' + fCls + '" data-index="' + i + '" tabindex="0">';
          h += '<span class="file-name">' + esc(f.name || 'Файл ' + (i + 1)) + '</span>';
          h += '<div style="display:flex;gap:6px;align-items:center;">';
          h += fBadges;
          if (f.sizeFormatted) h += '<span class="file-size" style="color:rgba(255,255,255,0.6);font-size:14px;">' + esc(f.sizeFormatted) + '</span>';
          h += '</div>';
          h += '</div>';
        }
        h += '</div>';
      }

      h += '<div class="torrent-confirm-actions">';
      h += '<button id="t-confirm-play" class="torrent-confirm-btn torrent-confirm-btn-play focused" tabindex="0">' + (isMulti ? '▶ Запустить выбранный' : '▶ Запустить фильм') + '</button>';
      h += '<button id="t-confirm-back" class="torrent-confirm-btn torrent-confirm-btn-back" tabindex="0">← Назад к торрентам</button>';
      h += '</div>';

      h += '</div>';
      return h;
    }

    wrap.innerHTML = buildModalHtml();
    document.body.appendChild(wrap);

    var focusZone = 'buttons'; // 'buttons' or 'files'
    var btnCol = 0; // 0 = play, 1 = back
    var fileIdx = selectedIdx;

    function updateModalFocus() {
      var btnPlay = document.getElementById('t-confirm-play');
      var btnBack = document.getElementById('t-confirm-back');
      var fileItems = wrap.querySelectorAll('.torrent-confirm-file-item');

      if (btnPlay) btnPlay.classList.remove('focused');
      if (btnBack) btnBack.classList.remove('focused');
      for (var fi = 0; fi < fileItems.length; fi++) {
        fileItems[fi].classList.remove('focused');
      }

      if (focusZone === 'buttons') {
        if (btnCol === 0 && btnPlay) {
          btnPlay.classList.add('focused');
          try { btnPlay.focus(); } catch(e) {}
        } else if (btnCol === 1 && btnBack) {
          btnBack.classList.add('focused');
          try { btnBack.focus(); } catch(e) {}
        }
      } else if (focusZone === 'files' && fileItems.length > 0) {
        if (fileIdx < 0) fileIdx = 0;
        if (fileIdx >= fileItems.length) fileIdx = fileItems.length - 1;
        fileItems[fileIdx].classList.add('focused');
        try { fileItems[fileIdx].focus(); fileItems[fileIdx].scrollIntoView(false); } catch(e) {}
      }
    }

    function closeModal() {
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.removeEventListener('keydown', confirmKeyHandler, true);
      window.closeTorrentConfirmModal = null;
      var firstTorrent = document.querySelector('.torrent-item.focused') || document.querySelector('.torrent-item');
      if (firstTorrent) {
        try { firstTorrent.classList.add('focused'); firstTorrent.focus(); } catch(e) {}
      }
    }
    window.closeTorrentConfirmModal = closeModal;

    function startPlayback() {
      var targetFile = files[selectedIdx] || files[0];
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      document.removeEventListener('keydown', confirmKeyHandler, true);
      window.closeTorrentConfirmModal = null;
      playFile(targetFile, title, movieId);
    }

    var bindEvents = function() {
      var btnPlay = document.getElementById('t-confirm-play');
      var btnBack = document.getElementById('t-confirm-back');
      if (btnPlay) btnPlay.addEventListener('click', startPlayback);
      if (btnBack) btnBack.addEventListener('click', closeModal);

      var fileItems = wrap.querySelectorAll('.torrent-confirm-file-item');
      for (var i = 0; i < fileItems.length; i++) {
        (function(idx) {
          fileItems[idx].addEventListener('click', function() {
            selectedIdx = idx;
            startPlayback();
          });
        })(i);
      }
    };
    bindEvents();
    updateModalFocus();

    var confirmKeyHandler = function(e) {
      var code = e.keyCode || e.which;
      var key = e.key;

      if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
        closeModal();
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        return;
      }

      var isLeft = code === 37 || key === 'ArrowLeft' || key === 'Left';
      var isRight = code === 39 || key === 'ArrowRight' || key === 'Right';
      var isUp = code === 38 || key === 'ArrowUp' || key === 'Up';
      var isDown = code === 40 || key === 'ArrowDown' || key === 'Down';
      var isEnter = code === 13 || code === 29443 || code === 65385 || code === 65376 || key === 'Enter' || key === 'Select' || key === 'Ok' || key === 'OK';

      if (focusZone === 'buttons') {
        if (isLeft) {
          btnCol = 0;
          updateModalFocus();
          if (e.preventDefault) e.preventDefault();
          return;
        }
        if (isRight) {
          btnCol = 1;
          updateModalFocus();
          if (e.preventDefault) e.preventDefault();
          return;
        }
        if (isUp && isMulti) {
          focusZone = 'files';
          updateModalFocus();
          if (e.preventDefault) e.preventDefault();
          return;
        }
        if (isEnter) {
          if (btnCol === 0) startPlayback();
          else closeModal();
          if (e.preventDefault) e.preventDefault();
          return;
        }
      } else if (focusZone === 'files') {
        var fileItems = wrap.querySelectorAll('.torrent-confirm-file-item');
        if (isUp) {
          if (fileIdx > 0) {
            fileIdx--;
            selectedIdx = fileIdx;
            updateModalFocus();
            var badgesContainer = document.getElementById('t-modal-badges');
            if (badgesContainer && files[selectedIdx]) {
              var combo = title + ' ' + (files[selectedIdx].name || '');
              var bHtml = renderMetaBadges(combo);
              if (files[selectedIdx].sizeFormatted) bHtml += '<span class="t-badge">' + esc(files[selectedIdx].sizeFormatted) + '</span>';
              badgesContainer.innerHTML = bHtml;
            }
          }
          if (e.preventDefault) e.preventDefault();
          return;
        }
        if (isDown) {
          if (fileIdx < fileItems.length - 1) {
            fileIdx++;
            selectedIdx = fileIdx;
            updateModalFocus();
            var badgesContainer = document.getElementById('t-modal-badges');
            if (badgesContainer && files[selectedIdx]) {
              var combo = title + ' ' + (files[selectedIdx].name || '');
              var bHtml = renderMetaBadges(combo);
              if (files[selectedIdx].sizeFormatted) bHtml += '<span class="t-badge">' + esc(files[selectedIdx].sizeFormatted) + '</span>';
              badgesContainer.innerHTML = bHtml;
            }
          } else {
            focusZone = 'buttons';
            btnCol = 0;
            updateModalFocus();
          }
          if (e.preventDefault) e.preventDefault();
          return;
        }
        if (isEnter) {
          selectedIdx = fileIdx;
          startPlayback();
          if (e.preventDefault) e.preventDefault();
          return;
        }
      }
    };

    document.addEventListener('keydown', confirmKeyHandler, true);
  }

  function playFile(file, title, movieId, customPoster) {
    var isAvplay = typeof webapis !== 'undefined' && webapis.avplay !== null && webapis.avplay !== undefined;
    var url = '';
    if (isAvplay && file.directUrl) {
      url = file.directUrl;
    } else {
      url = file.streamUrl || '';
    }
    if (url.indexOf('/') === 0) url = API + url;
    var detailName = (state.detail && (state.detail.name || state.detail.title)) || '';
    var isTv = state.detail && state.detail.type === 'tv';
    var mediaType = (state.detail && state.detail.type) || 'movie';
    var name = '';

    if (title && (title.indexOf(' · S') !== -1 || !detailName)) {
      name = title;
    } else if (detailName) {
      if (isTv && file && file.name && file.name !== detailName) {
        name = detailName + ' · ' + file.name;
      } else {
        name = detailName;
      }
    } else {
      name = (file && file.name) || title || '';
    }

    movieId = movieId || (state.detail && state.detail.id) || 0;
    var poster = customPoster || (state.detail && state.detail.poster) || '';

    // Check for saved resume position
    var startParam = '';
    if (movieId) {
      try {
        var positions = JSON.parse(localStorage.getItem('playback_positions') || '{}');
        var saved = positions[movieId];
        if (saved && typeof saved === 'object' && saved.time > 30) {
          startParam = '&start=' + Math.floor(saved.time);
        }
      } catch(e) {}
    }

    openPlayer('?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(name) + '&id=' + movieId + '&type=' + encodeURIComponent(mediaType) + '&poster=' + encodeURIComponent(poster) + startParam);
  }

  // ========== Sync ==========
  function syncWithServer(callback) {
    // Pull data from server
    apiFetch('/api/sync', function(err, data) {
      console.log('[Sync] callback err:', err ? err.message : null, 'data:', data ? Object.keys(data) : null);
      if (err || !data) { if (callback) callback(); return; }

      try {
      console.log('[Sync] data keys:', Object.keys(data));
      // Merge IPTV playlists
      if (data.iptvPlaylists && Array.isArray(data.iptvPlaylists) && data.iptvPlaylists.length > 0) {
        var validPls = data.iptvPlaylists.filter(function(pl) {
          return pl && pl.url && pl.url.indexOf('test/') === -1 && pl.url.indexOf('https://test') === -1;
        });
        if (validPls.length > 0) {
          console.log('[Sync] Saving', validPls.length, 'IPTV playlists');
          localStorage.setItem('lumiere_iptv', JSON.stringify(validPls));
        }
      } else {
        console.log('[Sync] No IPTV playlists');
      }

      // Periodically refresh home shelves order from server
      loadAndApplyHomeShelves();

      // Merge playback positions from server
      if (data.watchHistory && Array.isArray(data.watchHistory) && data.watchHistory.length > 0) {
        var local = {};
        try { local = JSON.parse(localStorage.getItem('playback_positions') || '{}'); } catch(e2) {}
        try { data.watchHistory.forEach(function(item) {
          var id = item.tmdbId;
          if (!id) return;
          var serverTime = new Date(item.updatedAt).getTime() || 0;
          var localItem = local[id];
          if (!localItem || serverTime > (localItem.timestamp || 0)) {
            var existingName = (localItem && localItem.title && localItem.title.name) || '';
            var serverTitle = item.titleName || '';
            var chosenName = serverTitle;
            if (existingName && /[\u0400-\u04FF]/.test(existingName) && !/[\u0400-\u04FF]/.test(serverTitle)) {
              chosenName = existingName;
            }
            local[id] = {
              time: item.progress || 0,
              timestamp: serverTime,
              title: { name: chosenName, poster: item.poster || (localItem && localItem.title && localItem.title.poster) || '', id: id, type: item.mediaType || 'movie' }
            };
          }
        });
        localStorage.setItem('playback_positions', JSON.stringify(local));
        } catch(e3) { console.error('[Lumiere] watchHistory merge error:', e3); }
      }

      // Merge favorites
      if (data.favorites && Array.isArray(data.favorites) && data.favorites.length > 0) {
        var favs = {};
        data.favorites.forEach(function(f) { favs[f.tmdbId] = f; });
        localStorage.setItem('lumiere_favorites', JSON.stringify(favs));
      }

      // Refresh continue watching
      renderContinueWatching();
      } catch(e) { console.error('[Lumiere] Sync error:', e); }

      if (callback) callback();
    });

    // Push local data to server
    pushLocalData();
  }

  function pushLocalData() {
    var positions = {};
    try { positions = JSON.parse(localStorage.getItem('playback_positions') || '{}'); } catch(e) {}

    var history = [];
    for (var id in positions) {
      var pos = positions[id];
      if (typeof pos === 'object' && pos.time > 10) {
        var titleName = '';
        var poster = '';
        if (pos.title && typeof pos.title === 'object') {
          titleName = pos.title.name || '';
          poster = pos.title.poster || '';
        } else {
          titleName = pos.title || '';
        }
        history.push({
          tmdbId: Number(id),
          mediaType: 'movie',
          titleName: titleName,
          poster: poster,
          progress: Math.round(pos.time),
          timestamp: pos.timestamp || Date.now()
        });
      }
    }

    if (history.length > 0) {
      apiPost('/api/sync/push', { watchHistory: history }, function() {});
    }
  }
  window.syncWithServer = syncWithServer;

  // ========== Search & On-Screen Keyboard ==========
  var searchTimer = null;
  var OSK_LAYOUTS = {
    ru: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
      ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
      ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю', 'Ё'],
      [
        { id: 'lang', label: 'ENG', action: 'lang', wide: 2 },
        { id: 'space', label: 'ПРОБЕЛ', action: 'space', wide: 4 },
        { id: 'backspace', label: '⌫', action: 'backspace', wide: 2 },
        { id: 'clear', label: 'ОЧИСТИТЬ', action: 'clear', wide: 2 }
      ]
    ],
    en: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-', '.'],
      ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '!', '?', '/'],
      [
        { id: 'lang', label: 'РУС', action: 'lang', wide: 2 },
        { id: 'space', label: 'SPACE', action: 'space', wide: 4 },
        { id: 'backspace', label: '⌫', action: 'backspace', wide: 2 },
        { id: 'clear', label: 'CLEAR', action: 'clear', wide: 2 }
      ]
    ]
  };

  var oskState = {
    lang: 'ru',
    row: 0,
    col: 0,
    query: ''
  };

  function renderOsk() {
    var container = document.getElementById('tv-keyboard');
    if (!container) return;

    var rows = OSK_LAYOUTS[oskState.lang] || OSK_LAYOUTS.ru;
    var html = '';
    for (var r = 0; r < rows.length; r++) {
      html += '<div class="osk-row">';
      for (var c = 0; c < rows[r].length; c++) {
        var key = rows[r][c];
        var isObj = typeof key === 'object';
        var label = isObj ? key.label : key;
        var action = isObj ? key.action : 'char';
        var charVal = isObj ? (key.char || '') : key;
        var cls = 'osk-key';
        if (isObj && key.wide === 2) cls += ' osk-key-wide-2';
        if (isObj && key.wide === 4) cls += ' osk-key-wide-4';
        if (isObj) cls += ' osk-key-action';

        html += '<button type="button" class="' + cls + '" data-r="' + r + '" data-c="' + c + '" data-action="' + action + '" data-char="' + esc(charVal) + '" tabindex="-1">' + esc(label) + '</button>';
      }
      html += '</div>';
    }
    container.innerHTML = html;

    // Attach click handlers for pointer / mouse
    var keyBtns = container.querySelectorAll('.osk-key');
    for (var i = 0; i < keyBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          var r = parseInt(btn.getAttribute('data-r'));
          var c = parseInt(btn.getAttribute('data-c'));
          focusOskKey(r, c);
          triggerOskKey(btn);
        });
      })(keyBtns[i]);
    }
  }

  function focusOskKey(r, c) {
    clearNavFocus();
    clearCardFocus();
    state.focusedCard = null;

    var rows = OSK_LAYOUTS[oskState.lang] || OSK_LAYOUTS.ru;
    if (r < 0) r = 0;
    if (r >= rows.length) r = rows.length - 1;
    if (c < 0) c = 0;
    if (c >= rows[r].length) c = rows[r].length - 1;

    oskState.row = r;
    oskState.col = c;

    var prev = document.querySelectorAll('.osk-key.focused');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('focused');

    var target = document.querySelector('.osk-key[data-r="' + r + '"][data-c="' + c + '"]');
    if (target) {
      target.classList.add('focused');
      try { target.focus(); } catch(fe) {}
    }
  }

  function clearOskFocus() {
    var list = document.querySelectorAll('.osk-key.focused');
    for (var i = 0; i < list.length; i++) list[i].classList.remove('focused');
  }

  function focusOskFromBottom() {
    var rows = OSK_LAYOUTS[oskState.lang] || OSK_LAYOUTS.ru;
    var bottomRow = rows.length - 1;
    focusOskKey(bottomRow, 1);
  }

  function updateOskQueryDisplay() {
    var queryText = document.getElementById('search-query-text');
    if (!queryText) return;
    if (oskState.query && oskState.query.length > 0) {
      queryText.textContent = oskState.query;
      queryText.classList.remove('placeholder');
    } else {
      queryText.textContent = 'Введите название фильма или сериала...';
      queryText.classList.add('placeholder');
    }
  }

  function triggerOskKey(btn) {
    if (!btn) {
      btn = document.querySelector('.osk-key[data-r="' + oskState.row + '"][data-c="' + oskState.col + '"]');
    }
    if (!btn) return;

    var action = btn.getAttribute('data-action');
    var charVal = btn.getAttribute('data-char');

    if (action === 'char') {
      oskState.query += charVal.toLowerCase();
    } else if (action === 'space') {
      oskState.query += ' ';
    } else if (action === 'backspace') {
      if (oskState.query.length > 0) {
        oskState.query = oskState.query.substring(0, oskState.query.length - 1);
      }
    } else if (action === 'clear') {
      oskState.query = '';
    } else if (action === 'lang') {
      oskState.lang = (oskState.lang === 'ru') ? 'en' : 'ru';
      renderOsk();
      focusOskKey(oskState.row, oskState.col);
      return;
    }

    updateOskQueryDisplay();

    if (searchTimer) clearTimeout(searchTimer);
    var q = oskState.query.trim();
    if (!q) {
      var container = document.getElementById('search-results');
      if (container) container.innerHTML = '';
      return;
    }

    searchTimer = setTimeout(function() {
      performSearch(q);
    }, 300);
  }

  function handleOskKeys(code, e) {
    var key = e.key;
    var isLeft = code === 37 || key === 'ArrowLeft' || key === 'Left';
    var isRight = code === 39 || key === 'ArrowRight' || key === 'Right';
    var isUp = code === 38 || key === 'ArrowUp' || key === 'Up';
    var isDown = code === 40 || key === 'ArrowDown' || key === 'Down';
    var isEnter = isEnterKey(code, key);

    var rows = OSK_LAYOUTS[oskState.lang] || OSK_LAYOUTS.ru;
    var curRowLen = rows[oskState.row].length;

    if (isLeft) {
      if (oskState.col > 0) {
        focusOskKey(oskState.row, oskState.col - 1);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isRight) {
      if (oskState.col < curRowLen - 1) {
        focusOskKey(oskState.row, oskState.col + 1);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isUp) {
      if (oskState.row > 0) {
        var prevLen = rows[oskState.row - 1].length;
        var targetCol = Math.min(prevLen - 1, Math.round(oskState.col * (prevLen / curRowLen)));
        focusOskKey(oskState.row - 1, targetCol);
      } else {
        clearOskFocus();
        focusNav(state.focusedNav || 0);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isDown) {
      if (oskState.row < rows.length - 1) {
        var nextLen = rows[oskState.row + 1].length;
        var targetCol2 = Math.min(nextLen - 1, Math.round(oskState.col * (nextLen / curRowLen)));
        focusOskKey(oskState.row + 1, targetCol2);
      } else {
        var chipEls = getSearchChipElements();
        if (chipEls.length > 0) {
          clearOskFocus();
          focusSearchChip(0);
        } else {
          var firstResult = document.querySelector('#search-results .card');
          if (firstResult) {
            clearOskFocus();
            firstResult.classList.add('focused');
            firstResult.focus();
            state.focusedCard = 0;
          }
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isEnter) {
      triggerOskKey();
      if (e && e.preventDefault) e.preventDefault();
      return;
    }
  }

  var searchChipIndex = -1;
  function getSearchChipElements() {
    var wrap = document.getElementById('search-history-wrap');
    if (!wrap || wrap.style.display === 'none') return [];
    var chips = Array.prototype.slice.call(wrap.querySelectorAll('.search-chip'));
    var clearBtn = wrap.querySelector('#btn-clear-search-history');
    if (clearBtn) chips.push(clearBtn);
    return chips;
  }

  function clearSearchChipFocus() {
    searchChipIndex = -1;
    var els = getSearchChipElements();
    for (var i = 0; i < els.length; i++) {
      els[i].classList.remove('focused');
    }
  }

  function focusSearchChip(idx) {
    var els = getSearchChipElements();
    if (els.length === 0) return false;
    clearOskFocus();
    clearNavFocus();
    clearCardFocus();
    clearSearchChipFocus();
    idx = Math.max(0, Math.min(idx, els.length - 1));
    searchChipIndex = idx;
    els[idx].classList.add('focused');
    try { els[idx].focus(); } catch(e) {}
    try { els[idx].scrollIntoView({ block: 'nearest' }); } catch(e) {}
    return true;
  }

  function activateSearchChip(chip) {
    if (!chip) return;
    var queryVal = chip.getAttribute('data-query');
    if (queryVal) {
      oskState.query = queryVal;
      updateOskQueryDisplay();
      clearSearchChipFocus();
      performSearch(queryVal);
      // Wait for search results to render and automatically focus first result card
      setTimeout(function() {
        var firstResult = document.querySelector('#search-results .card');
        if (firstResult) {
          clearNavFocus();
          clearOskFocus();
          clearSearchChipFocus();
          firstResult.classList.add('focused');
          try { firstResult.focus(); } catch(fe) {}
          state.focusedCard = 0;
        }
      }, 350);
    }
  }

  function handleSearchChipKeys(code, e) {
    var key = e.key;
    var isLeft = code === 37 || key === 'ArrowLeft' || key === 'Left';
    var isRight = code === 39 || key === 'ArrowRight' || key === 'Right';
    var isUp = code === 38 || key === 'ArrowUp' || key === 'Up';
    var isDown = code === 40 || key === 'ArrowDown' || key === 'Down';
    var isEnter = isEnterKey(code, key);
    var els = getSearchChipElements();

    if (isLeft) {
      if (searchChipIndex > 0) {
        focusSearchChip(searchChipIndex - 1);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isRight) {
      if (searchChipIndex < els.length - 1) {
        focusSearchChip(searchChipIndex + 1);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isUp) {
      clearSearchChipFocus();
      focusOskFromBottom();
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isDown) {
      var firstCard = document.querySelector('#search-results .card');
      if (firstCard) {
        clearSearchChipFocus();
        focusCard(0);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isEnter) {
      if (els[searchChipIndex]) {
        var targetEl = els[searchChipIndex];
        if (targetEl.id === 'btn-clear-search-history') {
          clearRecentSearches();
          focusOskFromBottom();
        } else {
          activateSearchChip(targetEl);
        }
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }
  }

  function getRecentSearches() {
    try {
      var list = JSON.parse(localStorage.getItem('recent_searches') || '[]');
      return list.filter(function(item) {
        return typeof item === 'string' && item.trim().length >= 2;
      });
    } catch(e) { return []; }
  }

  function saveRecentSearch(q) {
    if (!q) return;
    var trimmed = q.trim();
    if (trimmed.length < 2) return;
    try {
      var list = getRecentSearches();
      list = list.filter(function(item) { return item.toLowerCase() !== trimmed.toLowerCase(); });
      list.unshift(trimmed);
      if (list.length > 12) list = list.slice(0, 12);
      localStorage.setItem('recent_searches', JSON.stringify(list));
      renderRecentSearches();
    } catch(e) {}
  }

  function clearRecentSearches() {
    try {
      localStorage.removeItem('recent_searches');
      renderRecentSearches();
    } catch(e) {}
  }

  function renderRecentSearches() {
    var wrap = document.getElementById('search-history-wrap');
    if (!wrap) return;
    var list = getRecentSearches();
    if (!list || list.length === 0) {
      wrap.innerHTML = '';
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    var html = '<div class="search-history-header">' +
      '<span class="search-history-title">История поиска</span>' +
      '<button type="button" class="search-history-clear" id="btn-clear-search-history" tabindex="0">Очистить</button>' +
      '</div>' +
      '<div class="search-history-chips">';
    for (var i = 0; i < list.length; i++) {
      html += '<button type="button" class="search-chip" data-query="' + esc(list[i]) + '" tabindex="0">' +
        '<span>' + esc(list[i]) + '</span>' +
        '</button>';
    }
    html += '</div>';
    wrap.innerHTML = html;

    var clearBtn = wrap.querySelector('#btn-clear-search-history');
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        clearRecentSearches();
      });
    }

    var chips = wrap.querySelectorAll('.search-chip');
    for (var j = 0; j < chips.length; j++) {
      (function(chip) {
        chip.addEventListener('click', function(e) {
          e.preventDefault();
          activateSearchChip(chip);
        });
      })(chips[j]);
    }
  }

  function setupSearch() {
    var secSearch = document.getElementById('sec-search');
    if (secSearch && !document.getElementById('tv-keyboard')) {
      secSearch.innerHTML = '<h1 class="page-title">Поиск</h1>' +
        '<div class="search-tv-container" id="search-tv-container">' +
          '<div class="search-query-bar" id="search-query-bar">' +
            '<span class="search-query-icon">🔍</span>' +
            '<span class="search-query-text placeholder" id="search-query-text">Введите название фильма или сериала...</span>' +
            '<span class="search-query-cursor">|</span>' +
          '</div>' +
          '<div class="tv-keyboard" id="tv-keyboard"></div>' +
          '<div class="search-history-wrap" id="search-history-wrap"></div>' +
        '</div>' +
        '<div id="search-results" class="grid"></div>';
    }
    renderOsk();
    updateOskQueryDisplay();
    renderRecentSearches();
  }

  function performSearch(query) {
    var container = document.getElementById('search-results');
    if (!container) return;

    apiFetch('/api/search?q=' + encodeURIComponent(query), function(err, data) {
      if (err || !data) {
        container.innerHTML = '<p class="detail-empty-text">Ничего не найдено</p>';
        return;
      }

      var results = data.results || [];
      if (results.length === 0) {
        container.innerHTML = '<p class="detail-empty-text">Ничего не найдено</p>';
        return;
      }

      container.innerHTML = '';
      results.slice(0, 24).forEach(function(t, i) {
        container.appendChild(createCard(t, i));
      });
    });
  }

  // ========== Navigation ==========
  function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        switchSection(btn.getAttribute('data-section'));
      });
    });

    var changeServerBtn = document.getElementById('btn-change-server');
    if (changeServerBtn) {
      changeServerBtn.addEventListener('click', function() {
        localStorage.removeItem(SERVER_KEY);
        window.location.reload();
      });
    }

    var forceReloadBtn = document.getElementById('btn-force-reload');
    if (forceReloadBtn) {
      forceReloadBtn.addEventListener('click', function() {
        showTvToast('Перезагрузка и очистка кэша...', 2000);
        setTimeout(function() {
          try { window.location.reload(true); } catch(e) { window.location.reload(); }
        }, 300);
      });
    }

    var switchProfileBtn = document.getElementById('btn-switch-profile');
    if (switchProfileBtn) {
      switchProfileBtn.addEventListener('click', function() {
        localStorage.removeItem(TOKEN_KEY);
        state.user = null;
        if ($app) { $app.classList.add('hidden'); $app.style.display = 'none'; }
        if ($loading) { $loading.classList.remove('hidden'); $loading.style.display = 'flex'; }
        loadProfilesAndShowPicker();
      });
    }

    var changeServerBtn = document.getElementById('btn-change-server');
    if (changeServerBtn) {
      changeServerBtn.addEventListener('click', function() {
        openServerModal();
      });
    }

    var logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        localStorage.removeItem(TOKEN_KEY);
        window.location.reload();
      });
    }

    var clearHistoryBtn = document.getElementById('btn-clear-history');
    if (clearHistoryBtn) {
      clearHistoryBtn.addEventListener('click', function() {
        localStorage.removeItem('playback_positions');
        localStorage.removeItem('last_torrents');
        renderContinueWatching();
        alert('История просмотров очищена');
      });
    }

    var checkEpBtn = document.getElementById('btn-tv-check-episodes');
    if (checkEpBtn) {
      checkEpBtn.addEventListener('click', function() {
        showTvToast('Проверка новых серий...', 2000);
        apiPost('/api/notifications/check', {}, function(err, res) {
          if (!err && res) {
            var count = res.newEpisodesFound || 0;
            showTvToast(count > 0 ? ('Найдено новых серий: ' + count) : 'Новых серий не найдено', 2500);
            loadNotifications();
          } else {
            showTvToast('Ошибка проверки серий', 2000);
          }
        });
      });
    }

    var readAllBtn = document.getElementById('btn-tv-read-all');
    if (readAllBtn) {
      readAllBtn.addEventListener('click', function() {
        apiPut('/api/notifications/read-all', {}, function(err) {
          if (!err) {
            for (var i = 0; i < notifState.items.length; i++) {
              notifState.items[i].isRead = true;
            }
            notifState.unreadCount = 0;
            updateNotifBadge();
            renderNotifications();
            showTvToast('Все уведомления прочитаны', 2000);
          }
        });
      });
    }
  }

  // ========== Notifications System ==========
  function loadNotifications(callback) {
    apiFetch('/api/notifications', function(err, data) {
      if (!err && data) {
        notifState.items = data.notifications || [];
        notifState.unreadCount = data.unreadCount || 0;
        updateNotifBadge();
        if (state.section === 'notifications') {
          renderNotifications();
        }
      }
      if (typeof callback === 'function') callback(err, data);
    });
  }

  function updateNotifBadge() {
    var badge = document.getElementById('tv-notif-badge');
    if (!badge) return;
    if (notifState.unreadCount > 0) {
      badge.textContent = notifState.unreadCount > 99 ? '99+' : notifState.unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  function renderNotifications() {
    var container = document.getElementById('tv-notif-container');
    if (!container) return;
    if (!notifState.items || notifState.items.length === 0) {
      container.innerHTML = '<div class="tv-notif-empty">Нет новых уведомлений</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < notifState.items.length; i++) {
      var item = notifState.items[i];
      var isUnread = !item.isRead;
      var posterSrc = item.poster ? imgUrl(item.poster) : '';
      var timeFormatted = '';
      if (item.createdAt) {
        try {
          var d = new Date(item.createdAt);
          timeFormatted = d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        } catch(de) {}
      }
      html += '<div class="tv-notif-card' + (isUnread ? ' unread' : '') + '" data-notif-idx="' + i + '" tabindex="0">';
      if (item.poster) {
        html += '<img src="' + esc(posterSrc) + '" class="tv-notif-poster" onerror="this.style.display=\'none\'">';
      }
      html += '<div class="tv-notif-info">';
      html += '<div class="tv-notif-title">' + esc(item.title || 'Уведомление') + '</div>';
      html += '<div class="tv-notif-msg">' + esc(item.message || '') + '</div>';
      if (timeFormatted) {
        html += '<div class="tv-notif-meta">' + esc(timeFormatted) + '</div>';
      }
      html += '</div>';
      html += '<div class="tv-notif-action-tag">▶ Смотреть</div>';
      html += '</div>';
    }
    container.innerHTML = html;

    // Attach click listeners to cards
    var cardEls = container.querySelectorAll('.tv-notif-card');
    for (var ci = 0; ci < cardEls.length; ci++) {
      (function(idx) {
        cardEls[idx].addEventListener('click', function() {
          openNotification(notifState.items[idx]);
        });
      })(ci);
    }
  }

  function openNotification(item) {
    if (!item) return;
    if (!item.isRead) {
      item.isRead = true;
      if (notifState.unreadCount > 0) notifState.unreadCount--;
      updateNotifBadge();
      apiPut('/api/notifications/' + item.id + '/read', {}, function() {});
      renderNotifications();
    }
    var mediaId = item.mediaId || (item.actionData && item.actionData.seriesId);
    var mediaType = item.mediaType || 'tv';
    if (mediaId) {
      showDetail(mediaId, mediaType);
    }
  }

  function focusNotificationElement(targetType, index) {
    clearAllFocus();
    var checkBtn = document.getElementById('btn-tv-check-episodes');
    var readAllBtn = document.getElementById('btn-tv-read-all');
    var cards = document.querySelectorAll('#tv-notif-container .tv-notif-card');

    if (targetType === 'topBtn') {
      notifState.focusedIndex = -1;
      notifState.focusedTopBtn = index;
      var btn = (index === 0) ? checkBtn : readAllBtn;
      if (btn) {
        btn.classList.add('focused');
        try { btn.focus(); } catch(e) {}
      }
    } else if (targetType === 'card') {
      if (cards.length === 0) {
        focusNotificationElement('topBtn', 0);
        return;
      }
      index = Math.max(0, Math.min(index, cards.length - 1));
      notifState.focusedIndex = index;
      cards[index].classList.add('focused');
      try { cards[index].focus(); } catch(e) {}
      try { cards[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(se) {}
    }
  }

  function handleNotificationsKeys(code, e) {
    var isLeft = code === 37 || e.key === 'ArrowLeft';
    var isRight = code === 39 || e.key === 'ArrowRight';
    var isUp = code === 38 || e.key === 'ArrowUp';
    var isDown = code === 40 || e.key === 'ArrowDown';
    var isEnter = isEnterKey(code, e.key);
    var isBack = code === 10009 || code === 27 || e.key === 'Escape' || e.key === 'GoBack';

    var cards = document.querySelectorAll('#tv-notif-container .tv-notif-card');

    if (isBack) {
      if (notifState.focusedIndex >= 0) {
        focusNotificationElement('topBtn', 0);
      } else {
        clearAllFocus();
        focusNav(5);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (notifState.focusedIndex === -1) {
      // In top action buttons
      if (isLeft) {
        focusNotificationElement('topBtn', 0);
      } else if (isRight) {
        focusNotificationElement('topBtn', 1);
      } else if (isUp) {
        clearAllFocus();
        focusNav(5);
      } else if (isDown) {
        if (cards.length > 0) {
          focusNotificationElement('card', 0);
        }
      } else if (isEnter) {
        if (notifState.focusedTopBtn === 0) {
          var btnCheck = document.getElementById('btn-tv-check-episodes');
          if (btnCheck) btnCheck.click();
        } else {
          var btnReadAll = document.getElementById('btn-tv-read-all');
          if (btnReadAll) btnReadAll.click();
        }
      }
    } else {
      // On notification card
      if (isUp) {
        if (notifState.focusedIndex > 0) {
          focusNotificationElement('card', notifState.focusedIndex - 1);
        } else {
          focusNotificationElement('topBtn', 0);
        }
      } else if (isDown) {
        if (notifState.focusedIndex < cards.length - 1) {
          focusNotificationElement('card', notifState.focusedIndex + 1);
        }
      } else if (isLeft || isRight) {
        // stay focused
      } else if (isEnter) {
        if (cards[notifState.focusedIndex]) {
          cards[notifState.focusedIndex].click();
        }
      }
    }
    if (e && e.preventDefault) e.preventDefault();
  }

  // ========== My Library Section ("Моё") ==========
  var myState = {
    activeTab: 'watched', // 'watched' | 'watchlist' | 'favorites'
    watched: [],
    watchlist: [],
    favorites: [],
    focusedTabIdx: 0,
  };

  function setupMySection() {
    var tabs = document.querySelectorAll('.my-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function(idx) {
        var btn = tabs[idx];
        btn.onclick = function() {
          var sub = btn.getAttribute('data-tab');
          switchMyTab(sub);
        };
        btn.onfocus = function() {
          myState.focusedTabIdx = idx;
        };
      })(i);
    }
  }

  function switchMyTab(sub) {
    myState.activeTab = sub || 'watched';
    var tabs = document.querySelectorAll('.my-tab');
    for (var i = 0; i < tabs.length; i++) {
      var isAct = tabs[i].getAttribute('data-tab') === myState.activeTab;
      tabs[i].classList.toggle('active', isAct);
      if (isAct) myState.focusedTabIdx = i;
    }
    loadMyData();
  }

  function loadMyData() {
    var grid = document.getElementById('my-grid');
    var emptyEl = document.getElementById('my-empty');
    if (!grid) return;
    grid.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:40px;font-size:18px;">Загрузка...</div>';
    if (emptyEl) emptyEl.classList.add('hidden');

    if (myState.activeTab === 'watched') {
      apiFetch('/api/user/history', function(err, data) {
        var items = (data && data.history) || [];
        var titles = items.map(function(h) {
          return {
            id: h.tmdbId,
            name: h.titleName,
            type: h.mediaType || 'movie',
            poster: h.poster || '',
            backdrop: h.poster || '',
            score: 0,
            progress: h.progress || 0
          };
        });

        try {
          var raw = localStorage.getItem('playback_positions');
          var pos = raw ? JSON.parse(raw) : {};
          var existingIds = {};
          titles.forEach(function(t) { existingIds[t.id] = true; });
          Object.keys(pos).forEach(function(k) {
            var val = pos[k];
            var tObj = val && val.title;
            if (tObj && tObj.id && !existingIds[tObj.id] && ((val.time || 0) > 30)) {
              titles.push({
                id: tObj.id,
                name: tObj.name,
                type: tObj.type || 'movie',
                poster: tObj.poster || '',
                backdrop: tObj.backdrop || '',
                score: 0,
                progress: 0
              });
            }
          });
        } catch(e) {}

        myState.watched = titles;
        renderMyGrid(titles, '🕒', 'История просмотров пуста', 'Здесь появятся фильмы и сериалы, которые вы начнете смотреть');
      });
    } else if (myState.activeTab === 'watchlist') {
      apiFetch('/api/user/watchlist', function(err, data) {
        var items = (data && data.watchlist) || [];
        var titles = items.map(function(w) {
          return {
            id: w.tmdbId,
            name: w.titleName,
            type: w.mediaType || 'movie',
            poster: w.poster || '',
            backdrop: w.poster || '',
            score: 0
          };
        });
        myState.watchlist = titles;
        renderMyGrid(titles, '🔖', 'Список «Буду смотреть» пуст', 'Добавляйте фильмы и сериалы кнопкой «Буду смотреть» в карточке тайтла');
      });
    } else if (myState.activeTab === 'favorites') {
      apiFetch('/api/user/favorites', function(err, data) {
        var items = (data && data.favorites) || [];
        var titles = items.map(function(f) {
          return {
            id: f.tmdbId,
            name: f.titleName,
            type: f.mediaType || 'movie',
            poster: f.poster || '',
            backdrop: f.poster || '',
            score: 0
          };
        });
        myState.favorites = titles;
        renderMyGrid(titles, '❤️', 'В закладках пока ничего нет', 'Добавляйте тайтлы в закладки кнопкой «В закладки» (сердечко)');
      });
    }
  }

  function renderMyGrid(titles, icon, emptyTitle, emptyDesc) {
    var grid = document.getElementById('my-grid');
    var emptyEl = document.getElementById('my-empty');
    if (!grid) return;
    grid.innerHTML = '';
    if (!titles || titles.length === 0) {
      if (emptyEl) {
        var iconEl = document.getElementById('my-empty-icon');
        var tEl = document.getElementById('my-empty-title');
        var dEl = document.getElementById('my-empty-desc');
        if (iconEl) iconEl.textContent = icon;
        if (tEl) tEl.textContent = emptyTitle;
        if (dEl) dEl.textContent = emptyDesc;
        emptyEl.classList.remove('hidden');
      }
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    titles.forEach(function(t, i) {
      grid.appendChild(createCard(t, i));
    });
  }

  function focusMyTab(index) {
    var tabs = document.querySelectorAll('.my-tab');
    if (tabs.length === 0) return;
    if (index < 0) index = 0;
    if (index >= tabs.length) index = tabs.length - 1;
    clearAllFocus();
    myState.focusedTabIdx = index;
    tabs[index].classList.add('focused');
    try { tabs[index].focus(); } catch(e) {}
  }

  function handleMyTabKeys(code, e) {
    var isLeft = code === 37 || e.key === 'ArrowLeft';
    var isRight = code === 39 || e.key === 'ArrowRight';
    var isUp = code === 38 || e.key === 'ArrowUp';
    var isDown = code === 40 || e.key === 'ArrowDown';
    var isEnter = isEnterKey(code, e.key);
    var isBack = code === 10009 || code === 27 || e.key === 'Escape' || e.key === 'GoBack';

    var tabs = document.querySelectorAll('.my-tab');
    if (isBack) {
      clearAllFocus();
      focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 5);
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    if (isLeft) {
      if (myState.focusedTabIdx > 0) {
        focusMyTab(myState.focusedTabIdx - 1);
        switchMyTab(tabs[myState.focusedTabIdx].getAttribute('data-tab'));
      }
    } else if (isRight) {
      if (myState.focusedTabIdx < tabs.length - 1) {
        focusMyTab(myState.focusedTabIdx + 1);
        switchMyTab(tabs[myState.focusedTabIdx].getAttribute('data-tab'));
      }
    } else if (isUp) {
      clearAllFocus();
      focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 5);
    } else if (isDown) {
      var cards = getVisibleCards();
      if (cards.length > 0) {
        clearAllFocus();
        focusCard(0);
      }
    } else if (isEnter) {
      if (tabs[myState.focusedTabIdx]) {
        switchMyTab(tabs[myState.focusedTabIdx].getAttribute('data-tab'));
      }
    }
    if (e && e.preventDefault) e.preventDefault();
  }

  // ========== EPG Reminders & Auto-Switch ==========
  function loadEpgReminders(callback) {
    apiFetch('/api/epg/reminders', function(err, data) {
      if (!err && data) {
        epgReminderState.reminders = data.reminders || [];
      }
      if (typeof callback === 'function') callback(err, data);
    });
  }

  function hasEpgReminder(channelId, programTitle) {
    if (!epgReminderState.reminders || !programTitle) return false;
    for (var i = 0; i < epgReminderState.reminders.length; i++) {
      var r = epgReminderState.reminders[i];
      if (String(r.channelId) === String(channelId) && r.programTitle === programTitle) {
        return r;
      }
    }
    return null;
  }

  function toggleEpgReminder(ch, prog) {
    if (!ch || !prog) return;
    var existing = hasEpgReminder(ch.id, prog.title);
    if (existing) {
      apiDelete('/api/epg/reminders/' + existing.id, function(err) {
        if (!err) {
          epgReminderState.reminders = epgReminderState.reminders.filter(function(r) { return r.id !== existing.id; });
          showTvToast('Напоминание отменено', 2000);
          renderPreview();
        }
      });
    } else {
      var startMs = 0;
      var stopMs = 0;
      if (prog.startMs) {
        startMs = prog.startMs;
        stopMs = prog.stopMs || (startMs + 3600000);
      } else if (prog.startDate && prog.startTime) {
        try {
          var dateParts = prog.startDate.split('-');
          var timeParts = prog.startTime.split(':');
          var d = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10), parseInt(timeParts[0], 10), parseInt(timeParts[1], 10));
          startMs = d.getTime();
          stopMs = startMs + 3600000;
        } catch(de) {
          startMs = Date.now() + 600000;
          stopMs = startMs + 3600000;
        }
      } else {
        startMs = Date.now() + 600000;
        stopMs = startMs + 3600000;
      }

      var body = {
        channelId: String(ch.id),
        channelName: ch.name || '',
        programTitle: prog.title || 'Телепередача',
        startMs: startMs,
        stopMs: stopMs,
        autoSwitch: true
      };

      apiPost('/api/epg/reminders', body, function(err, res) {
        if (!err && res) {
          body.id = res.id;
          epgReminderState.reminders.push(body);
          showTvToast('⏰ Напоминание установлено: ' + prog.title, 3000);
          renderPreview();
        }
      });
    }
  }

  function checkEpgReminders() {
    if (!epgReminderState.reminders || epgReminderState.reminders.length === 0) return;
    var now = Date.now();
    var toast = document.getElementById('tv-epg-switch-toast');
    if (!toast) return;

    var activeFound = null;
    for (var i = 0; i < epgReminderState.reminders.length; i++) {
      var r = epgReminderState.reminders[i];
      if (epgReminderState.dismissedIds[r.id]) continue;
      var diffMs = r.startMs - now;

      // Within 60 seconds of start and up to 10 seconds past start
      if (diffMs <= 60000 && diffMs >= -10000) {
        activeFound = r;
        break;
      }
    }

    if (!activeFound) {
      if (epgReminderState.activeToastReminder) {
        dismissEpgToast();
      }
      return;
    }

    epgReminderState.activeToastReminder = activeFound;
    var remainingSec = Math.max(0, Math.ceil((activeFound.startMs - now) / 1000));

    var progEl = document.getElementById('switch-toast-prog');
    var chEl = document.getElementById('switch-toast-ch');
    var countdownEl = document.getElementById('switch-toast-countdown');

    if (progEl) progEl.textContent = activeFound.programTitle;
    if (chEl) chEl.textContent = 'Канал: ' + activeFound.channelName;
    if (countdownEl) countdownEl.textContent = remainingSec > 0 ? ('Переключение через ' + remainingSec + ' сек') : 'Переключение сейчас...';

    toast.classList.remove('hidden');

    if (remainingSec <= 0) {
      executeEpgToastSwitch();
    }
  }

  function executeEpgToastSwitch() {
    var reminder = epgReminderState.activeToastReminder;
    dismissEpgToast();
    if (!reminder) return;

    // Remove reminder from list and server
    apiDelete('/api/epg/reminders/' + reminder.id, function() {});
    epgReminderState.reminders = epgReminderState.reminders.filter(function(r) { return r.id !== reminder.id; });

    // Close any open movie player
    var playerContainer = document.getElementById('player-container');
    if (playerContainer && !playerContainer.classList.contains('hidden')) {
      try { closePlayer(); } catch(e) {}
    }

    // Switch section to iptv
    switchSection('iptv');

    // Find channel in iptvState.channels
    var chToPlay = null;
    if (iptvState.channels && iptvState.channels.length > 0) {
      for (var ci = 0; ci < iptvState.channels.length; ci++) {
        var ch = iptvState.channels[ci];
        if (String(ch.id) === String(reminder.channelId) || (ch.name && ch.name.toLowerCase() === (reminder.channelName || '').toLowerCase())) {
          chToPlay = ch;
          break;
        }
      }
    }

    if (!chToPlay) {
      chToPlay = {
        id: reminder.channelId,
        name: reminder.channelName,
        url: reminder.channelUrl || ''
      };
    }

    showTvToast('⏰ Автопереключение: ' + reminder.programTitle, 3500);
    playChannel(chToPlay);
  }

  function dismissEpgToast() {
    var toast = document.getElementById('tv-epg-switch-toast');
    if (toast) toast.classList.add('hidden');
    if (epgReminderState.activeToastReminder) {
      epgReminderState.dismissedIds[epgReminderState.activeToastReminder.id] = true;
      epgReminderState.activeToastReminder = null;
    }
  }

  function switchSection(section) {
    if (section === 'switch-profile') {
      showProfilePicker();
      return;
    }
    if (section === 'home') {
      loadAndApplyHomeShelves();
    }
    if (section !== 'iptv' && typeof stopPreview === 'function') {
      stopPreview();
    }
    state.section = section;
    state.focusedCard = null;

    // Clean up any lingering modals when switching sections
    var exitModal = document.getElementById('exit-confirm-modal');
    if (exitModal && exitModal.parentNode) {
      exitModal.parentNode.removeChild(exitModal);
    }
    if (typeof window.closeTorrentConfirmModal === 'function') {
      try { window.closeTorrentConfirmModal(); } catch(e) {}
    } else {
      var tcModal = document.getElementById('torrent-confirm-modal');
      if (tcModal && tcModal.parentNode) tcModal.parentNode.removeChild(tcModal);
    }

    if (section !== 'search') {
      clearOskFocus();
    }

    document.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-section') === section);
    });

    document.querySelectorAll('.section').forEach(function(sec) {
      sec.classList.toggle('active', sec.id === 'sec-' + section);
    });

    $content.scrollTop = 0;

    if (section === 'search') {
      if (typeof setupSearch === 'function') setupSearch();
      if (typeof renderRecentSearches === 'function') renderRecentSearches();
    }

    if (section === 'settings') {
      var srvEl = document.getElementById('tv-server-url');
      if (srvEl) srvEl.textContent = API || localStorage.getItem(SERVER_KEY) || localStorage.getItem('lumiere_server_url') || '--';
      var usrEl = document.getElementById('tv-user-email');
      if (usrEl && state.user) usrEl.textContent = state.user.name || state.user.email || 'Пользователь';
    }

    if (section === 'iptv') {
      iptvLocked = false;
      ensureIptvDomStructure();
      if (!iptvState.channels || iptvState.channels.length === 0) {
        loadIptv();
      } else {
        var curFiltered = getFilteredChannels();
        if (curFiltered.length === 0) {
          iptvState.selectedGroup = 'Все';
          iptvState.focusedCat = 0;
        }
        renderIptv();
        if (!iptvState.epgData || Object.keys(iptvState.epgData).length === 0) {
          loadEpg();
        }
      }
      var curCh = iptvState.focusedCh || 0;
      var chs = getFilteredChannels();
      if (curCh < 0 || curCh >= chs.length) {
        curCh = 0;
        iptvState.focusedCh = 0;
      }
      if (chs && chs[curCh]) {
        updatePreview(chs[curCh]);
      }
      var isNavActive = !!document.querySelector('.nav-btn.focused');
      if (!isNavActive) {
        iptvState.focusedCol = 1;
        if (typeof focusIptvChannel === 'function') {
          focusIptvChannel(curCh);
        }
      } else {
        iptvState.focusedCol = -1;
      }
    }

    if (section === 'notifications') {
      loadNotifications(function() {
        var isNavActive = !!document.querySelector('.nav-btn.focused');
        if (!isNavActive) {
          focusNotificationElement('topBtn', 0);
        }
      });
    }

    if (section === 'my') {
      setupMySection();
      loadMyData();
    }
  }

  // ========== D-pad Navigation ==========
  var lpTimer = null;
  var lpTriggered = false;
  var lpChannelId = null;

  function registerTizenKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        var keys = [
          'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
          'MediaFastForward', 'MediaRewind',
          'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
          'ChannelUp', 'ChannelDown', 'VolumeUp', 'VolumeDown'
        ];
        for (var i = 0; i < keys.length; i++) {
          try { tizen.tvinputdevice.registerKey(keys[i]); } catch(ke) {}
        }
        console.log('[Lumiere] Registered Tizen remote keys');
      }
    } catch(te) {
      console.warn('[Lumiere] tvinputdevice not available:', te);
    }
  }

  // ========== Exit Confirmation Modal ==========
  var exitModalFocusIndex = 1; // 0 = "Выйти", 1 = "Отмена" (safe default)

  function showExitConfirmModal() {
    var existing = document.getElementById('exit-confirm-modal');
    if (existing) {
      updateExitModalFocus();
      return;
    }

    var wrap = document.createElement('div');
    wrap.id = 'exit-confirm-modal';
    wrap.className = 'exit-modal-backdrop';

    var html = '<div class="exit-modal-box">' +
      '<div class="exit-modal-icon">✕</div>' +
      '<div class="exit-modal-title">Закрыть приложение?</div>' +
      '<div class="exit-modal-sub">Вы действительно хотите выйти из Lumiere?</div>' +
      '<div class="exit-modal-actions">' +
        '<button id="btn-exit-cancel" class="exit-btn exit-btn-cancel focused" data-idx="1" tabindex="0">Отмена</button>' +
        '<button id="btn-exit-confirm" class="exit-btn exit-btn-exit" data-idx="0" tabindex="0">Выйти</button>' +
      '</div>' +
    '</div>';

    wrap.innerHTML = html;
    document.body.appendChild(wrap);

    exitModalFocusIndex = 1; // Default to "Отмена"
    updateExitModalFocus();

    var btnCancel = document.getElementById('btn-exit-cancel');
    var btnExit = document.getElementById('btn-exit-confirm');
    if (btnCancel) {
      btnCancel.addEventListener('click', function() {
        closeExitConfirmModal();
      });
    }
    if (btnExit) {
      btnExit.addEventListener('click', function() {
        executeAppExit();
      });
    }
  }
  window.showExitConfirmModal = showExitConfirmModal;

  function closeExitConfirmModal(noNavFocus) {
    var modal = document.getElementById('exit-confirm-modal');
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    if (!noNavFocus) {
      focusNav(0);
    }
  }
  window.closeExitConfirmModal = closeExitConfirmModal;

  function executeAppExit() {
    console.log('[Lumiere] User confirmed app exit');
    try {
      if (window.tizen && tizen.application) {
        tizen.application.getCurrentApplication().exit();
      } else {
        window.close();
      }
    } catch(e) {
      console.error('[Lumiere] Exit error:', e);
    }
  }

  function updateExitModalFocus() {
    var btnCancel = document.getElementById('btn-exit-cancel');
    var btnExit = document.getElementById('btn-exit-confirm');
    if (!btnCancel || !btnExit) return;

    if (exitModalFocusIndex === 1) {
      btnCancel.classList.add('focused');
      btnCancel.focus();
      btnExit.classList.remove('focused');
    } else {
      btnExit.classList.add('focused');
      btnExit.focus();
      btnCancel.classList.remove('focused');
    }
  }

  function handleExitModalKey(code, key, e) {
    var isLeft = (code === 37 || key === 'ArrowLeft' || key === 'Left');
    var isRight = (code === 39 || key === 'ArrowRight' || key === 'Right');
    var isEnter = isEnterKey(code, key);
    var isBack = (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack');

    if (isBack) {
      closeExitConfirmModal();
      return true;
    }

    if (isLeft || isRight) {
      exitModalFocusIndex = (exitModalFocusIndex === 1) ? 0 : 1;
      updateExitModalFocus();
      return true;
    }

    if (isEnter) {
      if (exitModalFocusIndex === 0) {
        executeAppExit();
      } else {
        closeExitConfirmModal();
      }
      return true;
    }

    return true;
  }

  function handleBackKey(e) {
    if (e && e.preventDefault) e.preventDefault();
    var now = Date.now();
    if (now - lastBackTimestamp < 700 || (state.modalCloseTimestamp && now - state.modalCloseTimestamp < 700)) {
      console.log('[Lumiere] Ignoring rapid duplicate back key (within cooldown)');
      return;
    }
    lastBackTimestamp = now;
    console.log('[Lumiere] Back key pressed');

    // -2. If server configuration modal is open, close it
    var serverModal = document.getElementById('tv-server-modal');
    if (serverModal && !serverModal.classList.contains('hidden') && serverModal.style.display !== 'none') {
      closeServerModal();
      return;
    }

    // -1. If exit confirmation modal open, close it
    var exitModal = document.getElementById('exit-confirm-modal');
    if (exitModal) {
      closeExitConfirmModal();
      return;
    }

    // -0.5. If person / actor modal open, close it and return
    var personModal = document.getElementById('person-modal');
    if (state.inPersonModal || (personModal && !personModal.classList.contains('hidden') && personModal.style.display !== 'none')) {
      closePersonModal();
      return;
    }

    // 0. If torrent confirmation modal open, close it
    var confirmModal = document.getElementById('torrent-confirm-modal');
    if (confirmModal) {
      if (typeof window.closeTorrentConfirmModal === 'function') {
        window.closeTorrentConfirmModal();
      } else if (confirmModal.parentNode) {
        confirmModal.parentNode.removeChild(confirmModal);
      }
      return;
    }

    // 1. If player open, close it
    var playerContainer = document.getElementById('player-container');
    if (playerContainer && !playerContainer.classList.contains('hidden') && playerContainer.innerHTML !== '') {
      if (typeof window.handlePlayerBackKey === 'function') {
        window.handlePlayerBackKey();
      } else {
        closePlayer();
      }
      return;
    }

    // 2. If detail modal open, close it
    if ($detail && !$detail.classList.contains('hidden')) {
      hideDetail();
      return;
    }

    // 3. If in search section and on results cards, return focus to OSK
    if (state.section === 'search') {
      var searchCardFocused = document.querySelector('#search-results .card.focused');
      if (searchCardFocused) {
        clearCardFocus();
        state.focusedCard = null;
        focusOskFromBottom();
        return;
      }
      var oskFocused = document.querySelector('.osk-key.focused');
      if (oskFocused) {
        if (oskState.query && oskState.query.length > 0) {
          oskState.query = '';
          updateOskQueryDisplay();
          var sRes = document.getElementById('search-results');
          if (sRes) sRes.innerHTML = '';
          return;
        }
        clearOskFocus();
        focusNav(1); // "Поиск" nav button
        return;
      }
      // If already on "Поиск" nav button or in Search -> return to Home!
      switchSection('home');
      focusNav(0);
      return;
    }

    // 4. If in IPTV:
    if (state.section === 'iptv') {
      if (iptvOskState && iptvOskState.isOpen) {
        closeIptvOsk();
        return;
      }
      if (iptvState.searchQuery && iptvState.searchQuery.length > 0) {
        iptvState.searchQuery = '';
        updateIptvOskQueryDisplay();
        iptvState.focusedCh = 0;
        renderIptv();
        focusIptvChannel(0);
        return;
      }
      if (iptvState.focusedCol === 2) {
        iptvState.focusedCol = 1;
        if (iptvState.focusedCh < 0) iptvState.focusedCh = 0;
        focusIptvChannel(iptvState.focusedCh || 0);
        return;
      }
      if (iptvState.focusedCol === 1) {
        iptvState.focusedCol = 0;
        focusIptvCategory(iptvState.focusedCat || 0);
        return;
      }
      if (iptvState.focusedCol === 0) {
        iptvState.focusedCol = -1;
        clearIptvFocus();
        focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
        return;
      }
      // Return to Home from IPTV top nav!
      if (typeof stopPreview === 'function') stopPreview();
      iptvState.focusedCol = -1;
      clearIptvFocus();
      switchSection('home');
      focusNav(0);
      return;
    }

    // 4b. If in Notifications:
    if (state.section === 'notifications') {
      if (notifState.focusedIndex >= 0) {
        focusNotificationElement('topBtn', 0);
        return;
      }
      var isNavActive = !!document.querySelector('.nav-btn.focused');
      if (!isNavActive) {
        clearAllFocus();
        focusNav(5);
        return;
      }
      switchSection('home');
      focusNav(0);
      return;
    }

    // 5. If on card, go back to top nav
    var cardFocused = document.querySelector('.card.focused');
    if (cardFocused) {
      clearCardFocus();
      state.focusedCard = null;
      focusNav(state.focusedNav || 0);
      return;
    }

    // 6. If on top nav of any non-home section, return to Home!
    if (state.section !== 'home') {
      switchSection('home');
      focusNav(0);
      return;
    }

    // 7. If already on Home top nav, show exit confirmation modal!
    showExitConfirmModal();
  }

  function isEnterKey(code, key) {
    return code === 13 || code === 29443 || code === 65385 || code === 65376 ||
      key === 'Enter' || key === 'Select' || key === 'Ok' || key === 'OK' || key === 'Accept' || key === 'Return';
  }

  var _keyboardSetup = false;
  function setupKeyboard() {
    if (_keyboardSetup) return;
    _keyboardSetup = true;

    registerTizenKeys();

    try {
      window.focus();
      if (document.body) document.body.focus();
    } catch(fe) {}

    // Hardware back key on Samsung Tizen
    window.addEventListener('tizenhwkey', function(e) {
      if (e.keyName === 'back') {
        handleBackKey(e);
      }
    });

    var onKeyDown = function(e) {
      try {
      var code = e.keyCode || e.which;
      var key = e.key;
      console.log('[KEY] code=' + code + ' key=' + key);

      // -5. If Server change modal is open:
      var serverModal = document.getElementById('tv-server-modal');
      if (serverModal && !serverModal.classList.contains('hidden') && serverModal.style.display !== 'none') {
        handleServerModalKey(code, key, e);
        if (e && e.preventDefault) e.preventDefault();
        return;
      }

      // -4.5. If Error screen on loading is active:
      var loadingScreen = document.getElementById('loading');
      var errRetryBtn = document.getElementById('tv-err-btn-retry');
      if (loadingScreen && !loadingScreen.classList.contains('hidden') && errRetryBtn) {
        handleErrorScreenKey(code, key, e);
        if (e && e.preventDefault) e.preventDefault();
        return;
      }

      // -4. If EPG auto-switch toast is active:
      var switchToast = document.getElementById('tv-epg-switch-toast');
      if (switchToast && !switchToast.classList.contains('hidden')) {
        if (isEnterKey(code, key)) {
          if (typeof executeEpgToastSwitch === 'function') {
            executeEpgToastSwitch();
          }
          if (e && e.preventDefault) e.preventDefault();
          return;
        } else if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
          if (typeof dismissEpgToast === 'function') {
            dismissEpgToast();
          }
          if (e && e.preventDefault) e.preventDefault();
          return;
        }
      }

      // -3. If PIN dialog is open:
      var pinModal = document.getElementById('tv-pin-modal');
      if (pinModal && !pinModal.classList.contains('hidden') && pinModal.style.display !== 'none') {
        handlePinModalKey(code, key, e);
        if (e && e.preventDefault) e.preventDefault();
        return;
      }

      // -2. If Profile picker screen is active:
      var profileScreen = document.getElementById('profile-screen');
      if (profileScreen && !profileScreen.classList.contains('hidden') && profileScreen.style.display !== 'none') {
        handleProfilePickerKey(code, key, e);
        if (e && e.preventDefault) e.preventDefault();
        return;
      }

      // -1. If exit confirmation modal is open:
      var exitModal = document.getElementById('exit-confirm-modal');
      if (exitModal) {
        if (state.section !== 'home') {
          closeExitConfirmModal(true);
        } else {
          handleExitModalKey(code, key, e);
          if (e && e.preventDefault) e.preventDefault();
          return;
        }
      }

      // 0. If torrent confirmation modal is open:
      var confirmModal = document.getElementById('torrent-confirm-modal');
      if (confirmModal) {
        if (state.section === 'iptv') {
          if (typeof window.closeTorrentConfirmModal === 'function') {
            try { window.closeTorrentConfirmModal(); } catch(cme) {}
          } else if (confirmModal.parentNode) {
            confirmModal.parentNode.removeChild(confirmModal);
          }
        } else {
          if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
            if (typeof window.closeTorrentConfirmModal === 'function') {
              window.closeTorrentConfirmModal();
            } else if (confirmModal.parentNode) {
              confirmModal.parentNode.removeChild(confirmModal);
            }
            if (e.preventDefault) e.preventDefault();
          }
          return;
        }
      }

      // 1. If player is open, forward ALL keys directly to handlePlayerKey
      var playerContainer = document.getElementById('player-container');
      if (playerContainer && !playerContainer.classList.contains('hidden') && playerContainer.innerHTML !== '') {
        if (typeof window.handlePlayerKey === 'function') {
          window.handlePlayerKey(code, key, e);
        } else if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
          closePlayer();
        }
        if (e && e.preventDefault) e.preventDefault();
        return;
      }

      if (e._handledByLumiere) return;
      try { e._handledByLumiere = true; } catch(he) {}

      // IPTV virtual keyboard active: route all keys directly
      if (iptvOskState && iptvOskState.isOpen) {
        handleIptvOskKeys(code, e);
        return;
      }

      // Person / Actor modal active: route all keys directly (including Back key!)
      var personModalEl = document.getElementById('person-modal');
      var isPersonModalOpen = state.inPersonModal || (personModalEl && !personModalEl.classList.contains('hidden') && personModalEl.style.display !== 'none');
      if (isPersonModalOpen) {
        handlePersonModalKey(code, key, e);
        return;
      }

      // Cooldown after closing person modal: absorb any trailing Back key duplicates from TV remote!
      if (state.modalCloseTimestamp && (Date.now() - state.modalCloseTimestamp < 700)) {
        if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
          if (e && e.preventDefault) e.preventDefault();
          return;
        }
      }

      // Back / Return / Escape key
      if (code === 10009 || code === 27 || key === 'Escape' || key === 'GoBack') {
        handleBackKey(e);
        return;
      }

      // Long-press detection on Enter for IPTV channels (650ms to toggle favorite)
      if (state.section === 'iptv' && iptvState.focusedCol === 1 && iptvState.focusedCh >= 0) {
        if (isEnterKey(code, key) && !iptvLocked) {
          if (!e.repeat && !iptvLpTimer) {
            iptvLpTriggered = false;
            var channelsList = getFilteredChannels();
            var curChannel = channelsList[iptvState.focusedCh];
            if (curChannel) {
              iptvLpChannel = curChannel;
              iptvLpTimer = setTimeout(function() {
                iptvLpTriggered = true;
                iptvLpTimer = null;
                if (iptvLpChannel) {
                  toggleFavorite(iptvLpChannel.id);
                }
              }, 650);
            }
          }
          if (e && e.preventDefault) e.preventDefault();
          return;
        }
      }

      // Detail view handler
      if ($detail && !$detail.classList.contains('hidden')) {
        handleDetailKeys(code, e);
        return;
      }

      handleMainKeys(code, e);
      } catch(keyErr) {
        console.error('[KEY-ERROR]', keyErr.message, keyErr.stack);
        try {
          var dbg = document.getElementById('_key_debug');
          if (!dbg) { dbg = document.createElement('div'); dbg.id = '_key_debug'; dbg.style.cssText = 'position:fixed;bottom:10px;left:10px;color:#f87171;font-size:18px;z-index:999999;background:rgba(0,0,0,0.9);padding:10px 16px;border-radius:8px;max-width:800px;'; document.body.appendChild(dbg); }
          dbg.textContent = 'KEY ERR: ' + (keyErr.message || keyErr);
        } catch(de) {}
      }
    };

    var onKeyUp = function(e) {
      var playerContainer = document.getElementById('player-container');
      if (playerContainer && !playerContainer.classList.contains('hidden') && playerContainer.innerHTML !== '') {
        return;
      }

      var code = e.keyCode || e.which;
      var key = e.key;
      if (!isEnterKey(code, key)) return;

      // Handle IPTV short press vs long press release
      if (state.section === 'iptv' && iptvState.focusedCol === 1) {
        if (iptvLpTimer) {
          clearTimeout(iptvLpTimer);
          iptvLpTimer = null;
        }
        if (!iptvLpTriggered && iptvLpChannel && !iptvLocked) {
          playChannel(iptvLpChannel);
        }
        iptvLpTriggered = false;
        iptvLpChannel = null;
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
    };

    // Single capture listener on window
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    console.log('[Lumiere] setupKeyboard: key listeners registered OK');
  }

  function handleMainKeys(code, e) {
    var key = e.key;
    var isLeft = code === 37 || key === 'ArrowLeft' || key === 'Left';
    var isRight = code === 39 || key === 'ArrowRight' || key === 'Right';
    var isUp = code === 38 || key === 'ArrowUp' || key === 'Up';
    var isDown = code === 40 || key === 'ArrowDown' || key === 'Down';
    var isEnter = isEnterKey(code, key);

    var focusedEl = document.querySelector('.focused');
    var activeEl = document.activeElement;
    var targetFocus = focusedEl || ((activeEl && activeEl !== document.body) ? activeEl : null);

    var isOnNav = !!(targetFocus && targetFocus.classList.contains('nav-btn') && targetFocus.classList.contains('focused'));
    var isOnChip = (state.section === 'search' && !!(targetFocus && (targetFocus.classList.contains('search-chip') || targetFocus.id === 'btn-clear-search-history')));
    var isOnIptv = (state.section === 'iptv' && !!(targetFocus && (targetFocus.classList.contains('iptv-ch-item') || targetFocus.classList.contains('iptv-cat-item') || targetFocus.classList.contains('iptv-action-btn') || targetFocus.classList.contains('iptv-epg-item') || targetFocus.classList.contains('iptv-channel'))));
    var isOnCard = !!(targetFocus && targetFocus.classList.contains('card'));
    var isOnOsk = (state.section === 'search' && !!(targetFocus && targetFocus.classList.contains('osk-key')));
    var settingBtns = document.querySelectorAll('#sec-settings .setting-btn');
    var focusedSetting = targetFocus && targetFocus.classList.contains('setting-btn') ? targetFocus : null;
    var isOnSetting = (state.section === 'settings' && focusedSetting !== null);
    var isOnNotif = (state.section === 'notifications' && !!(targetFocus && (targetFocus.classList.contains('notif-btn') || targetFocus.classList.contains('tv-notif-card'))));
    var isOnMyTab = (state.section === 'my' && !!(targetFocus && targetFocus.classList.contains('my-tab')));

    // If focused on OSK, route keys directly to handleOskKeys
    if (isOnOsk) {
      handleOskKeys(code, e);
      return;
    }

    if (isOnChip) {
      handleSearchChipKeys(code, e);
      return;
    }

    if (isOnNotif) {
      handleNotificationsKeys(code, e);
      return;
    }

    if (isOnMyTab) {
      handleMyTabKeys(code, e);
      return;
    }

    // IPTV navigation: route to handleIptvKeys unless user is navigating top navbar
    if (state.section === 'iptv') {
      if (isOnNav) {
        if (isLeft) { focusNavDelta(-1); if (e && e.preventDefault) e.preventDefault(); return; }
        if (isRight) { focusNavDelta(1); if (e && e.preventDefault) e.preventDefault(); return; }
        if (isDown || isEnter) {
          clearNavFocus();
          iptvState.focusedCol = 1;
          focusIptvChannel(iptvState.focusedCh || 0);
          if (e && e.preventDefault) e.preventDefault();
          return;
        }
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      handleIptvKeys(code, e);
      return;
    }

    // FOCUS RECOVERY: If nothing is focused, recover focus!
    if (!isOnNav && !isOnCard && !isOnSetting && !isOnOsk && !isOnChip && !isOnIptv && !isOnNotif) {
      if (state.section === 'iptv') {
        if (iptvState.focusedCol === -1) {
          focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
          return;
        }
        focusIptvChannel(iptvState.focusedCh || 0);
        return;
      }
      if (state.section === 'notifications') {
        focusNotificationElement('topBtn', 0);
        return;
      }
      console.log('[Lumiere] Recovering focus to nav button');
      focusNav(state.focusedNav || 0);
      isOnNav = true;
    }

    // Settings buttons handling
    if (isOnSetting) {
      var sIdx = -1;
      for (var si = 0; si < settingBtns.length; si++) {
        if (settingBtns[si] === focusedSetting) { sIdx = si; break; }
      }
      if (isDown) {
        if (sIdx >= 0 && sIdx < settingBtns.length - 1) {
          focusedSetting.classList.remove('focused');
          settingBtns[sIdx + 1].classList.add('focused');
          settingBtns[sIdx + 1].focus();
        }
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      if (isUp) {
        if (sIdx > 0) {
          focusedSetting.classList.remove('focused');
          settingBtns[sIdx - 1].classList.add('focused');
          settingBtns[sIdx - 1].focus();
        } else {
          focusedSetting.classList.remove('focused');
          focusNav(state.focusedNav);
        }
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      if (isEnter) {
        focusedSetting.click();
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      if (isLeft || isRight) {
        focusedSetting.classList.remove('focused');
        focusNav(state.focusedNav);
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      return;
    }

    if (isLeft) {
      if (isOnNav) focusNavDelta(-1);
      else if (isOnCard) focusCardDelta(-1);
      if (e && e.preventDefault) e.preventDefault();
    } else if (isRight) {
      if (isOnNav) focusNavDelta(1);
      else if (isOnCard) focusCardDelta(1);
      if (e && e.preventDefault) e.preventDefault();
    } else if (isUp) {
      if (isOnCard) {
        var moved = focusCardUp();
        if (!moved) {
          clearCardFocus();
          state.focusedCard = null;
          if (state.section === 'my') {
            focusMyTab(myState.focusedTabIdx || 0);
          } else if (state.section === 'search') {
            var chipEls = getSearchChipElements();
            if (chipEls.length > 0) {
              focusSearchChip(0);
            } else {
              focusOskFromBottom();
            }
          } else {
            focusNav(state.focusedNav || 0);
          }
        }
      }
      if (e && e.preventDefault) e.preventDefault();
    } else if (isDown) {
      if (isOnNav) {
        if (state.section === 'iptv') {
          clearNavFocus();
          iptvState.focusedCol = 1;
          focusIptvChannel(iptvState.focusedCh || 0);
        } else if (state.section === 'search') {
          clearNavFocus();
          focusOskKey(0, 0);
        } else if (state.section === 'my') {
          clearNavFocus();
          focusMyTab(myState.focusedTabIdx || 0);
        } else if (state.section === 'settings') {
          var sBtns = document.querySelectorAll('#sec-settings .setting-btn');
          if (sBtns.length > 0) {
            clearNavFocus();
            sBtns[0].classList.add('focused');
            sBtns[0].focus();
          }
        } else if (state.section === 'notifications') {
          clearNavFocus();
          focusNotificationElement('topBtn', 0);
        } else {
          var cards = getVisibleCards();
          if (cards.length > 0) {
            clearNavFocus();
            state.focusedCard = 0;
            focusCard(0);
          }
        }
      } else if (isOnCard) {
        focusCardDown();
      }
      if (e && e.preventDefault) e.preventDefault();
    } else if (isEnter) {
      if (isOnNav) {
        if (state.section === 'search') {
          clearNavFocus();
          focusOskKey(0, 0);
        } else if (state.section === 'iptv') {
          clearNavFocus();
          iptvState.focusedCol = 1;
          focusIptvChannel(iptvState.focusedCh || 0);
        } else if (state.section === 'my') {
          clearNavFocus();
          focusMyTab(myState.focusedTabIdx || 0);
        } else if (state.section === 'settings') {
          var sBtns = document.querySelectorAll('#sec-settings .setting-btn');
          if (sBtns.length > 0) {
            clearNavFocus();
            sBtns[0].classList.add('focused');
            sBtns[0].focus();
          }
        } else if (state.section === 'notifications') {
          clearNavFocus();
          focusNotificationElement('topBtn', 0);
        } else {
          var cards = getVisibleCards();
          if (cards.length > 0) {
            clearNavFocus();
            state.focusedCard = 0;
            focusCard(0);
          }
        }
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
      selectFocused();
      if (e && e.preventDefault) e.preventDefault();
    }
  }

  // IPTV three-column D-pad navigation
  function handleIptvKeys(code, e) {
    if (iptvState.focusedCol < 0 || iptvState.focusedCol > 2) {
      iptvState.focusedCol = 1;
      if (iptvState.focusedCh < 0) iptvState.focusedCh = 0;
    }
    var channels = getFilteredChannels();
    var cats = buildCategories();
    var key = e ? e.key : '';

    // Recover focus if nothing inside IPTV currently has .focused
    var curFocused = document.querySelector('#sec-iptv .focused');
    if (!curFocused) {
      if (iptvState.focusedCol === 0) {
        focusIptvCategory(iptvState.focusedCat || 0);
      } else if (iptvState.focusedCol === 2) {
        focusIptvPreview(iptvState.focusedCol2Index || 0);
      } else {
        focusIptvChannel(iptvState.focusedCh || 0);
      }
      if (e && e.preventDefault) e.preventDefault();
      return;
    }

    // Yellow button (405 / ColorF2Yellow), Green button (404 / ColorF1Green) or key 'f' / 'F' to toggle favorite!
    var isFavKey = (code === 405 || code === 404 || key === 'ColorF2Yellow' || key === 'ColorF1Green' || key === 'f' || key === 'F');
    if (isFavKey) {
      if (iptvState.focusedCol === 1 && channels[iptvState.focusedCh]) {
        toggleFavorite(channels[iptvState.focusedCh].id);
        if (e && e.preventDefault) e.preventDefault();
        return;
      } else if (iptvState.focusedCol === 2 && iptvState.currentChannel) {
        toggleFavorite(iptvState.currentChannel.id);
        if (e && e.preventDefault) e.preventDefault();
        return;
      }
    }

    switch (code) {
      case 37: // Left — move to categories column or within preview
        if (iptvState.focusedCol === 1) {
          if (iptvState.focusedCh === -1) {
            var sInp = document.getElementById('iptv-search-box');
            if (sInp) sInp.classList.remove('focused');
          }
          iptvState.focusedCol = 0;
          if (iptvState.focusedCat >= cats.length) iptvState.focusedCat = cats.length - 1;
          focusIptvCategory(iptvState.focusedCat);
        } else if (iptvState.focusedCol === 2) {
          if (iptvState.focusedCol2Index === 1) {
            // From Fav button to Play button
            focusIptvPreview(0);
          } else {
            // From Play button or EPG items back to channels column
            iptvState.focusedCol = 1;
            if (iptvState.focusedCh < 0) iptvState.focusedCh = 0;
            focusIptvChannel(iptvState.focusedCh);
          }
        }
        e.preventDefault();
        break;

      case 39: // Right — move to channels or preview
        if (iptvState.focusedCol === 0) {
          iptvState.focusedCol = 1;
          iptvState.focusedCh = 0;
          var curItem = (iptvState.navItems && iptvState.navItems[iptvState.focusedCat]) || null;
          if (curItem && curItem.type === 'category') {
            iptvState.selectedGroup = curItem.cat;
            renderChannels();
          }
          focusIptvChannel(0);
        } else if (iptvState.focusedCol === 1) {
          if (iptvState.focusedCh === -1) {
            var sBox = document.getElementById('iptv-search-box');
            if (sBox) sBox.classList.remove('focused');
          }
          focusIptvPreview(0);
        } else if (iptvState.focusedCol === 2) {
          if (iptvState.focusedCol2Index === 0) {
            // From Play button to Fav button
            focusIptvPreview(1);
          }
        }
        e.preventDefault();
        break;

      case 38: // Up
        if (iptvState.focusedCol === 0) {
          // Categories & Playlists
          if (iptvState.focusedCat > 0) {
            iptvState.focusedCat--;
            focusIptvCategory(iptvState.focusedCat);
          } else {
            iptvState.focusedCol = -1;
            clearIptvFocus();
            focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
          }
        } else if (iptvState.focusedCol === 1) {
          // Channels
          if (iptvState.focusedCh > 0) {
            iptvState.focusedCh--;
            focusIptvChannel(iptvState.focusedCh);
          } else if (iptvState.focusedCh === 0) {
            // Move up to channel search box
            iptvState.focusedCh = -1;
            var sBoxUp = document.getElementById('iptv-search-box');
            if (sBoxUp) {
              clearIptvFocus();
              sBoxUp.classList.add('focused');
              try { sBoxUp.focus(); } catch(se) {}
            } else {
              iptvState.focusedCol = -1;
              clearIptvFocus();
              focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
            }
          } else {
            // Already on search box -> go to nav
            iptvState.focusedCol = -1;
            clearIptvFocus();
            focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
          }
        } else if (iptvState.focusedCol === 2) {
          // Column 2 Preview & EPG
          if (iptvState.focusedCol2Index > 2) {
            focusIptvPreview(iptvState.focusedCol2Index - 1);
          } else if (iptvState.focusedCol2Index === 2) {
            focusIptvPreview(0); // From first EPG item to Play button
          } else {
            // From Play/Fav button go to top nav
            iptvState.focusedCol = -1;
            clearIptvFocus();
            focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
          }
        }
        e.preventDefault();
        break;

      case 40: // Down
        if (iptvState.focusedCol === 0) {
          // Categories & Playlists
          var navItems = iptvState.navItems || [];
          var maxIdx = navItems.length > 0 ? (navItems.length - 1) : (cats.length - 1);
          if (iptvState.focusedCat < maxIdx) {
            iptvState.focusedCat++;
            focusIptvCategory(iptvState.focusedCat);
          }
        } else if (iptvState.focusedCol === 1) {
          // Channels
          if (iptvState.focusedCh < 0) {
            // Move down from search box to channel 0
            var sBoxDown = document.getElementById('iptv-search-box');
            if (sBoxDown) sBoxDown.classList.remove('focused');
            iptvState.focusedCh = 0;
            focusIptvChannel(0);
          } else if (iptvState.focusedCh < channels.length - 1) {
            iptvState.focusedCh++;
            focusIptvChannel(iptvState.focusedCh);
          }
        } else if (iptvState.focusedCol === 2) {
          // Column 2 Preview & EPG
          var epgListCount = document.querySelectorAll('#iptv-epg-schedule .iptv-epg-item').length;
          if (iptvState.focusedCol2Index < 2) {
            // From Play/Fav down to first EPG item (index 2) if exists
            if (epgListCount > 0) {
              focusIptvPreview(2);
            }
          } else {
            var currentEpgSubIdx = iptvState.focusedCol2Index - 2;
            if (currentEpgSubIdx < epgListCount - 1) {
              focusIptvPreview(iptvState.focusedCol2Index + 1);
            }
          }
        }
        e.preventDefault();
        break;

      case 13: // Enter — play channel or select playlist/category
      case 29443:
      case 65385:
        if (iptvState.focusedCol === 0) {
          onCategoryColumnItemSelect(iptvState.focusedCat);
        } else if (iptvState.focusedCol === 1) {
          if (iptvState.focusedCh === -1) {
            openIptvOsk();
          } else if (channels[iptvState.focusedCh]) {
            // Short press playback is handled by onKeyUp; if invoked via click, play channel
            playChannel(channels[iptvState.focusedCh]);
          }
        } else if (iptvState.focusedCol === 2) {
          if (iptvState.focusedCol2Index === 1 && iptvState.currentChannel) {
            toggleFavorite(iptvState.currentChannel.id);
          } else if (iptvState.focusedCol2Index === 0 && iptvState.currentChannel) {
            playChannel(iptvState.currentChannel);
          } else if (iptvState.focusedCol2Index >= 2 && iptvState.currentChannel) {
            var epgIdx = iptvState.focusedCol2Index - 2;
            var epgId = findEpgId(iptvState.currentChannel);
            var progs = epgId && iptvState.epgData[epgId] ? iptvState.epgData[epgId] : null;
            if (progs && progs[epgIdx]) {
              var curProg = getCurrentProgram(progs);
              if (progs[epgIdx] === curProg) {
                playChannel(iptvState.currentChannel);
              } else {
                if (typeof toggleEpgReminder === 'function') {
                  toggleEpgReminder(iptvState.currentChannel, progs[epgIdx]);
                }
              }
            }
          }
        }
        e.preventDefault();
        break;

      case 10009: // Back
        if (iptvState.focusedCol === 2) {
          iptvState.focusedCol = 1;
          if (iptvState.focusedCh < 0) iptvState.focusedCh = 0;
          focusIptvChannel(iptvState.focusedCh);
        } else if (iptvState.focusedCol === 1) {
          if (iptvState.focusedCh === -1) {
            var sBoxBack = document.getElementById('iptv-search-box');
            if (sBoxBack) sBoxBack.classList.remove('focused');
          }
          iptvState.focusedCol = 0;
          focusIptvCategory(iptvState.focusedCat || 0);
        } else {
          if (typeof stopPreview === 'function') stopPreview();
          iptvState.focusedCol = -1;
          clearIptvFocus();
          focusNav(state.focusedNav !== undefined && state.focusedNav !== null ? state.focusedNav : 4);
        }
        e.preventDefault();
        break;
    }
  }

  function focusIptvChannel(index) {
    iptvState.focusedCol = 1;
    var channels = getFilteredChannels();
    if (!channels || channels.length === 0) {
      focusIptvCategory(iptvState.focusedCat || 0);
      return;
    }
    if (index < 0) index = 0;
    if (index >= channels.length) index = channels.length - 1;
    iptvState.focusedCh = index;

    if (index >= iptvRenderLimit - 15 && iptvRenderLimit < channels.length) {
      iptvRenderLimit = Math.min(channels.length, iptvRenderLimit + 60);
      renderChannels(true);
    }
    var items = document.querySelectorAll('#iptv-channels .iptv-ch-item');
    if (items.length === 0) {
      renderChannels();
      items = document.querySelectorAll('#iptv-channels .iptv-ch-item');
    }
    if (items.length > 0) {
      if (index >= items.length) index = items.length - 1;
      clearIptvFocus();
      clearNavFocus();
      items[index].classList.add('focused');
      try { items[index].focus(); } catch(e) {}
      items[index].scrollIntoView(false);
      if (channels[index]) updatePreview(channels[index]);
    }
  }

  function focusIptvCategory(index) {
    iptvState.focusedCol = 0;
    var items = document.querySelectorAll('#iptv-cat-list .iptv-pl-item, #iptv-cat-list .iptv-cat-item');
    if (items.length === 0) {
      renderCategories();
      items = document.querySelectorAll('#iptv-cat-list .iptv-pl-item, #iptv-cat-list .iptv-cat-item');
    }
    if (items.length > 0) {
      index = Math.max(0, Math.min(index, items.length - 1));
      iptvState.focusedCat = index;
      clearIptvFocus();
      clearNavFocus();
      items[index].classList.add('focused');
      try { items[index].focus(); } catch(e) {}
      items[index].scrollIntoView(false);
    }
  }

  function focusIptvPreview(idx) {
    clearIptvFocus();
    clearNavFocus();
    iptvState.focusedCol = 2;
    iptvState.focusedCol2Index = idx;
    var pBtn = document.getElementById('iptv-btn-play');
    var fBtn = document.getElementById('iptv-btn-fav');
    var epgItems = document.querySelectorAll('#iptv-epg-schedule .iptv-epg-item');

    if (idx === 0) {
      if (pBtn) {
        pBtn.classList.add('focused');
        try { pBtn.focus(); } catch(e) {}
      }
    } else if (idx === 1) {
      if (fBtn) {
        fBtn.classList.add('focused');
        try { fBtn.focus(); } catch(e) {}
      }
    } else {
      var epgIdx = idx - 2;
      if (epgItems && epgItems[epgIdx]) {
        var el = epgItems[epgIdx];
        el.classList.add('focused');
        try { el.focus(); } catch(e) {}
        try {
          if (el.scrollIntoViewIfNeeded) {
            el.scrollIntoViewIfNeeded(false);
          } else {
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        } catch(se) {}
      }
    }
  }

  function clearIptvFocus() {
    var sBox = document.getElementById('iptv-search-box');
    if (sBox) sBox.classList.remove('focused');
    document.querySelectorAll('.iptv-cat-item.focused, .iptv-ch-item.focused, .iptv-channel.focused, .iptv-action-btn.focused, .iptv-epg-item.focused').forEach(function(el) {
      el.classList.remove('focused');
    });
  }

  var previewDebounceTimer = null;
  function updatePreview(ch) {
    if (!ch) return;
    if (state.section !== 'iptv') return;
    iptvState.currentChannel = ch;
    if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(function() {
      if (state.section !== 'iptv') return;
      renderPreview();
    }, 50);

    if (previewPlayTimer) clearTimeout(previewPlayTimer);
    previewPlayTimer = setTimeout(function() {
      if (state.section !== 'iptv') return;
      startPreview(ch);
    }, 400);
  }

  function setDetailFocus(el) {
    if (!$detail) $detail = document.getElementById('detail');
    if ($detail) {
      var all = $detail.querySelectorAll('.focused');
      for (var i = 0; i < all.length; i++) {
        all[i].classList.remove('focused');
      }
    }
    if (el) {
      el.classList.add('focused');
      try { el.focus(); } catch(e) {}
      scrollToCenter(el);
    }
  }

  function handleDetailKeys(code, e) {
    if (!$detail) $detail = document.getElementById('detail');
    if (!$detail) return;

    var playBtn = document.getElementById('detail-play');
    var trackBtn = document.getElementById('detail-track-btn');
    var favBtn = document.getElementById('detail-fav-btn');
    var activePane = state.detailTab === 'sources' ? '#sources-results' : (state.detailTab === 'episodes' ? '#episodes-results' : '#torrent-results');
    var itemClass = state.detailTab === 'sources' ? '.source-item' : (state.detailTab === 'episodes' ? '.episode-card' : '.torrent-item');
    var items = $detail ? $detail.querySelectorAll(activePane + ' ' + itemClass) : [];
    var seasonBtns = $detail ? $detail.querySelectorAll('.season-btn') : [];
    var tabs = $detail ? $detail.querySelectorAll('.detail-tab') : [];

    var activeEl = document.activeElement;
    var focused = (activeEl && $detail.contains(activeEl) && activeEl !== $detail) ? activeEl : $detail.querySelector('.focused');

    // Auto-focus play button if nothing in detail has focus
    if (!focused) {
      if (playBtn) {
        setDetailFocus(playBtn);
        focused = playBtn;
      }
    }

    var actionBtns = Array.prototype.slice.call(document.querySelectorAll('.detail-actions button'));
    var actionIdx = actionBtns.indexOf(focused);
    var isActionBtn = (actionIdx !== -1);
    var isTab = focused && focused.classList.contains('detail-tab');
    var isSeason = focused && focused.classList.contains('season-btn');
    var isItem = focused && (focused.classList.contains('torrent-item') || focused.classList.contains('source-item') || focused.classList.contains('episode-card'));
    var castItems = Array.prototype.slice.call($detail.querySelectorAll('.detail-actor-card, .detail-cast-item'));
    var allCastBtn = document.getElementById('detail-all-cast-btn');
    var isAllCast = (focused === allCastBtn);
    var castIdx = castItems.indexOf(focused);
    var isCast = (castIdx !== -1);
    var detailBackBtn = document.getElementById('detail-back-btn');
    var isDetailBack = (focused === detailBackBtn);

    switch (code) {
      case 10009: // Back
      case 27:
        if (state.modalCloseTimestamp && (Date.now() - state.modalCloseTimestamp < 700)) {
          if (e && e.preventDefault) e.preventDefault();
          return;
        }
        if ($detail) $detail.classList.add('hidden');
        setTimeout(function() { var c = document.querySelector('.card.focused'); if (c) c.focus(); }, 100);
        if (e && e.preventDefault) e.preventDefault();
        break;

      case 37: // Left
        if (isAllCast) {
          if (detailBackBtn) {
            setDetailFocus(detailBackBtn);
          } else {
            var targetL = actionBtns[actionBtns.length - 1] || actionBtns[0] || playBtn;
            if (targetL) setDetailFocus(targetL);
          }
        } else if (isCast) {
          if (castIdx % 4 === 0) {
            var targetLeft = actionBtns[actionBtns.length - 1] || actionBtns[0] || playBtn || (tabs.length > 0 ? tabs[0] : null);
            if (targetLeft) setDetailFocus(targetLeft);
          } else if (castIdx > 0) {
            setDetailFocus(castItems[castIdx - 1]);
          }
        } else if (isActionBtn) {
          if (actionIdx > 0) setDetailFocus(actionBtns[actionIdx - 1]);
        } else if (isTab) {
          var prevTab = focused.previousElementSibling;
          if (prevTab && prevTab.classList.contains('detail-tab')) {
            prevTab.click();
            setDetailFocus(prevTab);
          }
        } else if (isSeason) {
          var prevSeason = focused.previousElementSibling;
          if (prevSeason && prevSeason.classList.contains('season-btn')) {
            setDetailFocus(prevSeason);
            try { prevSeason.scrollIntoView({ inline: 'center', behavior: 'smooth' }); } catch(se) {}
          }
        }
        if (e && e.preventDefault) e.preventDefault();
        break;

      case 39: // Right
        if (isDetailBack) {
          if (allCastBtn) setDetailFocus(allCastBtn);
          else if (castItems.length > 0) setDetailFocus(castItems[0]);
        } else if (isActionBtn) {
          if (actionIdx < actionBtns.length - 1) {
            setDetailFocus(actionBtns[actionIdx + 1]);
          } else if (castItems.length > 0) {
            setDetailFocus(castItems[0]);
          }
        } else if (isCast) {
          if ((castIdx % 4 < 3) && (castIdx + 1 < castItems.length)) {
            setDetailFocus(castItems[castIdx + 1]);
          }
        } else if (isTab) {
          var nextTab = focused.nextElementSibling;
          if (nextTab && nextTab.classList.contains('detail-tab')) {
            nextTab.click();
            setDetailFocus(nextTab);
          }
        } else if (isSeason) {
          var nextSeason = focused.nextElementSibling;
          if (nextSeason && nextSeason.classList.contains('season-btn')) {
            setDetailFocus(nextSeason);
            try { nextSeason.scrollIntoView({ inline: 'center', behavior: 'smooth' }); } catch(se) {}
          }
        }
        if (e && e.preventDefault) e.preventDefault();
        break;

      case 38: // Up
        if (isActionBtn) {
          if (detailBackBtn) setDetailFocus(detailBackBtn);
        } else if (isCast) {
          if (castIdx >= 4) {
            setDetailFocus(castItems[castIdx - 4]);
          } else if (allCastBtn) {
            setDetailFocus(allCastBtn);
          } else {
            var backBtn = document.getElementById('detail-back-btn');
            if (backBtn) setDetailFocus(backBtn);
          }
        } else if (isAllCast) {
          var bBtn = document.getElementById('detail-back-btn');
          if (bBtn) setDetailFocus(bBtn);
        } else if (isItem) {
          var itemIdx = -1;
          for (var ii = 0; ii < items.length; ii++) {
            if (items[ii] === focused) { itemIdx = ii; break; }
          }
          if (itemIdx > 0) {
            setDetailFocus(items[itemIdx - 1]);
          } else {
            var activeSeason = $detail.querySelector('.season-btn.active') || (seasonBtns.length > 0 ? seasonBtns[0] : null);
            if (activeSeason) {
              setDetailFocus(activeSeason);
            } else {
              var curTab = $detail.querySelector('.detail-tab.active') || (tabs.length > 0 ? tabs[0] : null);
              if (curTab) setDetailFocus(curTab);
            }
          }
        } else if (isSeason) {
          var cTab = $detail.querySelector('.detail-tab.active') || (tabs.length > 0 ? tabs[0] : null);
          if (cTab) setDetailFocus(cTab);
        } else if (isTab) {
          var actBtn = document.getElementById('detail-play') || (actionBtns.length > 0 ? actionBtns[0] : null);
          if (actBtn) setDetailFocus(actBtn);
        }
        if (e && e.preventDefault) e.preventDefault();
        break;

      case 40: // Down
        if (isDetailBack) {
          if (playBtn) setDetailFocus(playBtn);
          else if (actionBtns.length > 0) setDetailFocus(actionBtns[0]);
        } else if (isAllCast) {
          if (castItems.length > 0) setDetailFocus(castItems[0]);
        } else if (isCast) {
          if (castIdx + 4 < castItems.length) {
            setDetailFocus(castItems[castIdx + 4]);
          } else {
            var firstT = $detail.querySelector('.detail-tab.active') || (tabs.length > 0 ? tabs[0] : null);
            if (firstT) setDetailFocus(firstT);
          }
        } else if (isActionBtn) {
          var firstTab = $detail.querySelector('.detail-tab.active') || (tabs.length > 0 ? tabs[0] : null);
          if (firstTab) setDetailFocus(firstTab);
        } else if (isTab) {
          var actSeason = $detail.querySelector('.season-btn.active') || (seasonBtns.length > 0 ? seasonBtns[0] : null);
          if (actSeason) {
            setDetailFocus(actSeason);
          } else if (items.length > 0) {
            setDetailFocus(items[0]);
          }
        } else if (isSeason) {
          if (items.length > 0) {
            setDetailFocus(items[0]);
          }
        } else if (isItem) {
          var itIdx = -1;
          for (var ij = 0; ij < items.length; ij++) {
            if (items[ij] === focused) { itIdx = ij; break; }
          }
          if (itIdx >= 0 && itIdx < items.length - 1) {
            setDetailFocus(items[itIdx + 1]);
          }
        }
        if (e && e.preventDefault) e.preventDefault();
        break;

      case 13: // Enter
      case 29443:
      case 65385:
      case 65376:
        if (focused) {
          if (isDetailBack) {
            hideDetail();
            if (e && e.preventDefault) e.preventDefault();
            return;
          }
          if (isCast) {
            focused.click();
            if (e && e.preventDefault) e.preventDefault();
            return;
          }
          if (focused.id === 'detail-play') {
            var d = state.detail;
            if (d && d.type === 'tv') {
              state.detailTab = 'episodes';
              switchDetailTab('episodes');
              var firstEp = document.querySelector('#episodes-results .episode-card');
              if (firstEp) {
                setDetailFocus(firstEp);
              }
              if (e && e.preventDefault) e.preventDefault();
              return;
            }
            var savedTorrent = null;
            var savedPosition = 0;
            if (d && d.id) {
              try { savedTorrent = (JSON.parse(localStorage.getItem('last_torrents') || '{}'))[d.id] || null; } catch(ex) {}
              try { savedPosition = (JSON.parse(localStorage.getItem('playback_positions') || '{}'))[d.id] || 0; } catch(ex) {}
              if (typeof savedPosition === 'object') savedPosition = savedPosition.time || 0;
            }
            if (savedTorrent && savedTorrent.magnet && savedPosition > 30) {
              openTorrent(savedTorrent.magnet, savedTorrent.title || (d ? d.name : ''));
            } else {
              state.detailTab = 'torrents';
              switchDetailTab('torrents');
              var firstT = document.querySelector('#torrent-results .torrent-item');
              if (firstT) {
                setDetailFocus(firstT);
              } else {
                state._pendingFocusTorrent = true;
              }
            }
          } else if (focused.classList.contains('season-btn')) {
            focused.click();
          } else if (focused.classList.contains('episode-card')) {
            focused.click();
          } else if (focused.classList.contains('torrent-item')) {
            var magnet = focused.getAttribute('data-magnet');
            var torrentTitle = focused.getAttribute('data-title');
            if (magnet) openTorrent(magnet, torrentTitle);
          } else if (focused.classList.contains('source-item')) {
            var sProvider = focused.getAttribute('data-provider');
            var sId = focused.getAttribute('data-id');
            var sName = state.detail ? state.detail.name : '';
            var hlsUrl = '/api/online/hls/' + sProvider + '/' + encodeURIComponent(sId);
            var sIdNum2 = (state.detail && state.detail.id) || 0;
            var sPoster2 = (state.detail && state.detail.poster) || '';
            openPlayer('?url=' + encodeURIComponent(hlsUrl) + '&title=' + encodeURIComponent(sName) + '&id=' + sIdNum2 + '&poster=' + encodeURIComponent(sPoster2));
          } else if (focused.classList.contains('detail-tab')) {
            var tName = focused.getAttribute('data-tab');
            state.detailTab = tName;
            switchDetailTab(tName);
          } else {
            try { focused.click(); } catch(ex) {}
          }
        }
        if (e && e.preventDefault) e.preventDefault();
        break;
    }
  }

  // Scroll helper — center element in viewport
  function scrollToCenter(el) {
    if (!el) return;
    var content = document.getElementById('content');
    if ($detail && !$detail.classList.contains('hidden') && $detail.contains(el)) {
      content = $detail;
    }
    if (!content) return;
    var elTop = el.offsetTop;
    var elH = el.offsetHeight;
    var contentH = content.clientHeight;
    content.scrollTop = elTop - (contentH / 2) + (elH / 2);
  }

  function focusDetailItem(list, fromIndex, toIndex) {
    setDetailFocus(list[toIndex]);
  }

  function clearAllFocus() {
    var focused = document.querySelectorAll('.focused');
    for (var fi = 0; fi < focused.length; fi++) {
      focused[fi].classList.remove('focused');
      if (typeof stopCardTitleMarquee === 'function' && focused[fi].classList.contains('card')) {
        stopCardTitleMarquee(focused[fi]);
      }
      try { focused[fi].blur(); } catch(e) {}
    }
    var activeMarquees = document.querySelectorAll('.card-title.has-marquee');
    for (var mi = 0; mi < activeMarquees.length; mi++) {
      var c = activeMarquees[mi].closest ? activeMarquees[mi].closest('.card') : activeMarquees[mi].parentElement;
      if (c && typeof stopCardTitleMarquee === 'function') {
        stopCardTitleMarquee(c);
      }
    }
  }

  // Nav focus
  function focusNav(index) {
    var btns = document.querySelectorAll('.nav-btn');
    if (index < 0 || index >= btns.length) return;
    clearAllFocus();
    state.focusedNav = index;
    state.focusedCard = null;
    btns[index].classList.add('focused');
    btns[index].focus();
    switchSection(btns[index].getAttribute('data-section'));
  }

  function focusNavDelta(delta) {
    var btns = document.querySelectorAll('.nav-btn');
    var newIndex = state.focusedNav + delta;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= btns.length) newIndex = btns.length - 1;
    focusNav(newIndex);
  }

  function clearNavFocus() {
    document.querySelectorAll('.nav-btn').forEach(function(b) {
      b.classList.remove('focused');
      try { b.blur(); } catch(e) {}
    });
  }

  // Card focus
  function focusCard(index) {
    var cards = getVisibleCards();
    if (cards.length === 0) return;
    clearAllFocus();
    index = Math.max(0, Math.min(index, cards.length - 1));
    state.focusedCard = index;
    cards[index].classList.add('focused');
    scrollToCard(cards[index]);
    cards[index].focus();
    if (typeof startCardTitleMarquee === 'function') {
      startCardTitleMarquee(cards[index]);
    }
    // Set home background to movie backdrop (debounced)
    updateHomeBg(cards[index]);
  }

  var homeBgTimer = null;
  function updateHomeBg(cardEl) {
    if (homeBgTimer) clearTimeout(homeBgTimer);
    homeBgTimer = setTimeout(function() {
      var bg = document.getElementById('home-bg');
      if (!bg || !cardEl) return;
      var img = cardEl.querySelector('img');
      if (img && img.src) {
        bg.style.backgroundImage = 'url(' + img.src + ')';
        bg.classList.add('visible');
      }
    }, 250);
  }

  function clearHomeBg() {
    var bg = document.getElementById('home-bg');
    if (bg) bg.classList.remove('visible');
  }

  function scrollToCard(el) {
    if (!el) return;
    // Always scroll #content vertically to keep card in view
    var content = document.getElementById('content');
    if (content) {
      var elRect = el.getBoundingClientRect();
      var contentRect = content.getBoundingClientRect();
      // If card is above visible area, scroll up
      if (elRect.top < contentRect.top + 60) {
        content.scrollTop -= (contentRect.top + 60 - elRect.top);
      }
      // If card is below visible area, scroll down
      if (elRect.bottom > contentRect.bottom - 20) {
        content.scrollTop += (elRect.bottom - contentRect.bottom + 20);
      }
    }
    // Also handle horizontal scroll within row-items
    var parent = el.parentElement;
    while (parent && parent.id !== 'content') {
      var style = window.getComputedStyle(parent);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        var elLeft = el.offsetLeft;
        var elW = el.offsetWidth;
        var parentW = parent.clientWidth;
        parent.scrollLeft = elLeft - (parentW / 2) + (elW / 2);
        return;
      }
      parent = parent.parentElement;
    }
  }

  var SHELF_ROW_MAP = {
    'continueWatching': 'row-continue',
    'recommendedHistory': 'row-recommended-history',
    'top10Movies': 'row-top10-movies',
    'trending': 'row-trending',
    'nowPlaying': 'row-now-playing',
    'popular': 'row-popular',
    'popularMovies': 'row-popular',
    'topRated': 'row-top-rated',
    'top10Tv': 'row-top10-tv',
    'tv': 'row-tv',
    'popularTv': 'row-tv'
  };

  function applyHomeShelvesLayout(shelves) {
    var sec = document.getElementById('sec-home');
    if (!sec || !Array.isArray(shelves)) return;

    var rowElements = [];
    var processedIds = {};

    for (var i = 0; i < shelves.length; i++) {
      var item = shelves[i];
      var rowId = SHELF_ROW_MAP[item.id] || item.id;
      var rowEl = document.getElementById(rowId);
      if (rowEl && rowEl.parentNode === sec && !processedIds[rowId]) {
        processedIds[rowId] = true;
        if (item.enabled === false) {
          rowEl.style.display = 'none';
        } else {
          rowEl.style.display = '';
        }
        rowElements.push(rowEl);
      }
    }

    var allRows = Array.prototype.slice.call(sec.querySelectorAll('.row'));
    for (var j = 0; j < allRows.length; j++) {
      if (!processedIds[allRows[j].id]) {
        rowElements.push(allRows[j]);
      }
    }

    for (var k = 0; k < rowElements.length; k++) {
      sec.appendChild(rowElements[k]);
    }
  }
  window.applyHomeShelvesLayout = applyHomeShelvesLayout;

  function loadAndApplyHomeShelves(callback) {
    var local = null;
    try { local = JSON.parse(localStorage.getItem('lumiere_home_shelves') || 'null'); } catch(e) {}
    if (local && Array.isArray(local) && local.length > 0) {
      applyHomeShelvesLayout(local);
    }
    apiFetch('/api/user/preferences', function(err, data) {
      if (data && data.preferences && Array.isArray(data.preferences.homeShelves) && data.preferences.homeShelves.length > 0) {
        try {
          localStorage.setItem('lumiere_home_shelves', JSON.stringify(data.preferences.homeShelves));
        } catch(se) {}
        applyHomeShelvesLayout(data.preferences.homeShelves);
      }
      if (typeof callback === 'function') callback(null, data);
    });
  }
  window.loadAndApplyHomeShelves = loadAndApplyHomeShelves;

  function getVisibleRows() {
    var sec = document.getElementById('sec-' + state.section);
    if (!sec) return [];
    var rows = Array.prototype.slice.call(sec.querySelectorAll('.row'));
    return rows.filter(function(r) {
      if (r.style.display === 'none' || r.classList.contains('hidden')) return false;
      var cards = r.querySelectorAll('.card');
      return cards.length > 0;
    });
  }

  function focusCardDelta(delta) {
    var cards = getVisibleCards();
    if (cards.length === 0) return;
    if (state.focusedCard === null) {
      focusCard(0);
      return;
    }
    var currentCard = cards[state.focusedCard];
    if (currentCard) {
      var currentRow = currentCard.closest('.row');
      if (currentRow) {
        var rowCards = Array.prototype.slice.call(currentRow.querySelectorAll('.card'));
        var idxInRow = rowCards.indexOf(currentCard);
        if (idxInRow >= 0) {
          var targetIdxInRow = idxInRow + delta;
          if (targetIdxInRow < 0 || targetIdxInRow >= rowCards.length) {
            return;
          }
          var nextGlobalIdx = cards.indexOf(rowCards[targetIdxInRow]);
          if (nextGlobalIdx >= 0) {
            focusCard(nextGlobalIdx);
            return;
          }
        }
      }
    }
    var newIndex = state.focusedCard + delta;
    newIndex = Math.max(0, Math.min(newIndex, cards.length - 1));
    focusCard(newIndex);
  }

  function focusCardUp() {
    var cards = getVisibleCards();
    if (cards.length === 0 || state.focusedCard === null) return false;
    var current = cards[state.focusedCard];
    if (!current) return false;

    var currentRow = current.closest('.row');
    if (currentRow) {
      var rows = getVisibleRows();
      var curRowIdx = rows.indexOf(currentRow);
      if (curRowIdx > 0) {
        var prevRow = rows[curRowIdx - 1];
        var prevCards = Array.prototype.slice.call(prevRow.querySelectorAll('.card'));
        if (prevCards.length > 0) {
          var curRect = current.getBoundingClientRect();
          var curCenterX = curRect.left + curRect.width / 2;
          var bestCard = prevCards[0];
          var bestDist = Infinity;
          for (var i = 0; i < prevCards.length; i++) {
            var cRect = prevCards[i].getBoundingClientRect();
            var cCenterX = cRect.left + cRect.width / 2;
            var dist = Math.abs(cCenterX - curCenterX);
            if (dist < bestDist) {
              bestDist = dist;
              bestCard = prevCards[i];
            }
          }
          var prevGlobalIdx = cards.indexOf(bestCard);
          if (prevGlobalIdx >= 0) {
            clearCardFocus();
            state.focusedCard = prevGlobalIdx;
            cards[prevGlobalIdx].classList.add('focused');
            scrollToCard(cards[prevGlobalIdx]);
            cards[prevGlobalIdx].focus();
            if (typeof startCardTitleMarquee === 'function') startCardTitleMarquee(cards[prevGlobalIdx]);
            return true;
          }
        }
      }
      return false;
    }

    // Grid fallback (e.g. search / collections)
    var currentRect = current.getBoundingClientRect();
    var curCenterX2 = currentRect.left + currentRect.width / 2;
    var candidates = [];
    for (var j = 0; j < cards.length; j++) {
      if (j === state.focusedCard) continue;
      var r = cards[j].getBoundingClientRect();
      if (r.bottom <= currentRect.top + 15) {
        candidates.push({ card: cards[j], index: j, rect: r });
      }
    }
    if (candidates.length === 0) return false;

    var maxBottom = -Infinity;
    for (var k = 0; k < candidates.length; k++) {
      if (candidates[k].rect.bottom > maxBottom) maxBottom = candidates[k].rect.bottom;
    }
    var rowCandidates = candidates.filter(function(item) {
      return Math.abs(item.rect.bottom - maxBottom) < 40;
    });
    var bestItem = rowCandidates[0];
    var bestH = Infinity;
    for (var m = 0; m < rowCandidates.length; m++) {
      var cX = rowCandidates[m].rect.left + rowCandidates[m].rect.width / 2;
      var dX = Math.abs(cX - curCenterX2);
      if (dX < bestH) {
        bestH = dX;
        bestItem = rowCandidates[m];
      }
    }
    if (bestItem) {
      clearCardFocus();
      state.focusedCard = bestItem.index;
      cards[bestItem.index].classList.add('focused');
      scrollToCard(cards[bestItem.index]);
      cards[bestItem.index].focus();
      if (typeof startCardTitleMarquee === 'function') startCardTitleMarquee(cards[bestItem.index]);
      return true;
    }
    return false;
  }

  function focusCardDown() {
    var cards = getVisibleCards();
    if (cards.length === 0 || state.focusedCard === null) return;
    var current = cards[state.focusedCard];
    if (!current) return;

    var currentRow = current.closest('.row');
    if (currentRow) {
      var rows = getVisibleRows();
      var curRowIdx = rows.indexOf(currentRow);
      if (curRowIdx >= 0 && curRowIdx < rows.length - 1) {
        var nextRow = rows[curRowIdx + 1];
        var nextCards = Array.prototype.slice.call(nextRow.querySelectorAll('.card'));
        if (nextCards.length > 0) {
          var curRect = current.getBoundingClientRect();
          var curCenterX = curRect.left + curRect.width / 2;
          var bestCard = nextCards[0];
          var bestDist = Infinity;
          for (var i = 0; i < nextCards.length; i++) {
            var cRect = nextCards[i].getBoundingClientRect();
            var cCenterX = cRect.left + cRect.width / 2;
            var dist = Math.abs(cCenterX - curCenterX);
            if (dist < bestDist) {
              bestDist = dist;
              bestCard = nextCards[i];
            }
          }
          var nextGlobalIdx = cards.indexOf(bestCard);
          if (nextGlobalIdx >= 0) {
            clearCardFocus();
            state.focusedCard = nextGlobalIdx;
            cards[nextGlobalIdx].classList.add('focused');
            scrollToCard(cards[nextGlobalIdx]);
            cards[nextGlobalIdx].focus();
            if (typeof startCardTitleMarquee === 'function') startCardTitleMarquee(cards[nextGlobalIdx]);
            return;
          }
        }
      }
      return;
    }

    // Grid fallback
    var currentRect = current.getBoundingClientRect();
    var curCenterX2 = currentRect.left + currentRect.width / 2;
    var candidates = [];
    for (var j = 0; j < cards.length; j++) {
      if (j === state.focusedCard) continue;
      var r = cards[j].getBoundingClientRect();
      if (r.top >= currentRect.bottom - 15) {
        candidates.push({ card: cards[j], index: j, rect: r });
      }
    }
    if (candidates.length === 0) return;

    var minTop = Infinity;
    for (var k = 0; k < candidates.length; k++) {
      if (candidates[k].rect.top < minTop) minTop = candidates[k].rect.top;
    }
    var rowCandidates = candidates.filter(function(item) {
      return Math.abs(item.rect.top - minTop) < 40;
    });
    var bestItem = rowCandidates[0];
    var bestH = Infinity;
    for (var m = 0; m < rowCandidates.length; m++) {
      var cX = rowCandidates[m].rect.left + rowCandidates[m].rect.width / 2;
      var dX = Math.abs(cX - curCenterX2);
      if (dX < bestH) {
        bestH = dX;
        bestItem = rowCandidates[m];
      }
    }
    if (bestItem) {
      clearCardFocus();
      state.focusedCard = bestItem.index;
      cards[bestItem.index].classList.add('focused');
      scrollToCard(cards[bestItem.index]);
      cards[bestItem.index].focus();
      if (typeof startCardTitleMarquee === 'function') startCardTitleMarquee(cards[bestItem.index]);
    }
  }

  function clearCardFocus() {
    document.querySelectorAll('.card, .iptv-channel').forEach(function(c) {
      c.classList.remove('focused');
      if (typeof stopCardTitleMarquee === 'function' && c.classList.contains('card')) {
        stopCardTitleMarquee(c);
      }
    });
    var activeMarquees = document.querySelectorAll('.card-title.has-marquee');
    for (var mi = 0; mi < activeMarquees.length; mi++) {
      var c = activeMarquees[mi].closest ? activeMarquees[mi].closest('.card') : activeMarquees[mi].parentElement;
      if (c && typeof stopCardTitleMarquee === 'function') {
        stopCardTitleMarquee(c);
      }
    }
    clearHomeBg();
  }

  function getVisibleCards() {
    var nodes = document.querySelectorAll('#sec-' + state.section + ' .card, #sec-' + state.section + ' .iptv-channel');
    var arr = [];
    for (var i = 0; i < nodes.length; i++) arr.push(nodes[i]);
    return arr;
  }

  function selectFocused() {
    var activeEl = document.activeElement;
    var focused = document.querySelector('.focused');
    var target = (activeEl && (activeEl.classList.contains('focused') || activeEl.classList.contains('card') || activeEl.classList.contains('iptv-channel') || activeEl.classList.contains('setting-btn'))) ? activeEl : focused;

    if (!target) return;

    // 1. If it's a card
    if (target.classList.contains('card')) {
      if (state.section === 'search' && oskState && oskState.query && oskState.query.trim().length >= 2) {
        saveRecentSearch(oskState.query.trim());
      }
      if (target._continueItem) {
        var cItem = target._continueItem;
        var lastTorrents = {};
        try { lastTorrents = JSON.parse(localStorage.getItem('last_torrents') || '{}'); } catch(e) {}
        var torrent = lastTorrents[cItem.id];
        if (torrent && torrent.magnet) {
          state.detail = { id: cItem.id, name: cItem.title, type: 'movie' };
          openTorrent(torrent.magnet, torrent.title || cItem.title);
          return;
        } else {
          var titleObj = { id: cItem.id, name: cItem.title, type: 'movie', poster: '', backdrop: '', year: 0, runtime: '', rating: '', score: 0, genres: [], description: '' };
          showDetail(titleObj);
          return;
        }
      }
      if (target._titleData) {
        showDetail(target._titleData);
        return;
      }
      var cardId = target.getAttribute('data-id');
      if (cardId) {
        var cardTitle = (target.querySelector('.card-title') ? target.querySelector('.card-title').textContent : '').trim();
        var cardImg = target.querySelector('.card-img');
        var cardPoster = cardImg ? cardImg.src : '';
        showDetail({ id: parseInt(cardId), name: cardTitle, poster: cardPoster, type: state.section === 'tv' ? 'tv' : 'movie' });
        return;
      }
    }

    // 2. If it's an IPTV channel
    if (target.classList.contains('iptv-channel') || target.classList.contains('iptv-ch-item')) {
      var chId = target.getAttribute('data-chid');
      var ch = findChannelById(chId);
      if (ch) {
        playChannel(ch);
        return;
      }
    }

    // 3. Fallback click
    try { target.click(); } catch(ex) {}
    try {
      var evt = document.createEvent('MouseEvents');
      evt.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
      target.dispatchEvent(evt);
    } catch(ex) {}
  }

  // ========== API Helpers ==========
  function apiFetch(path, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + path, true);
    xhr.timeout = 10000;
    try {
      xhr.setRequestHeader('X-Lumiere-TV', '1');
      xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
    } catch(e) {}
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status === 200) {
        try { callback(null, JSON.parse(xhr.responseText)); }
        catch(e) { callback(e, null); }
      } else { callback(new Error('HTTP ' + xhr.status), null); }
    };
    xhr.onerror = function() { callback(new Error('Network error'), null); };
    xhr.ontimeout = function() { callback(new Error('Timeout'), null); };
    xhr.send();
  }

  function apiPost(path, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API + path, true);
    xhr.timeout = (path.indexOf('/api/iptv') === 0) ? 35000 : 12000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.setRequestHeader('X-Lumiere-TV', '1');
      xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
    } catch(e) {}
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { callback(null, JSON.parse(xhr.responseText)); }
        catch(e) { callback(e, null); }
      } else { callback(new Error('HTTP ' + xhr.status), null); }
    };
    xhr.onerror = function() { callback(new Error('Network error'), null); };
    xhr.ontimeout = function() { callback(new Error('Timeout'), null); };
    xhr.send(JSON.stringify(body));
  }

  function apiPut(path, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('PUT', API + path, true);
    xhr.timeout = 12000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.setRequestHeader('X-Lumiere-TV', '1');
      xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
    } catch(e) {}
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { callback(null, JSON.parse(xhr.responseText)); }
        catch(e) { callback(null, { success: true }); }
      } else { callback(new Error('HTTP ' + xhr.status), null); }
    };
    xhr.onerror = function() { callback(new Error('Network error'), null); };
    xhr.ontimeout = function() { callback(new Error('Timeout'), null); };
    xhr.send(JSON.stringify(body || {}));
  }

  function apiDelete(path, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', API + path, true);
    xhr.timeout = 12000;
    try {
      xhr.setRequestHeader('X-Lumiere-TV', '1');
      xhr.setRequestHeader('X-Lumiere-Client', 'tizen-tv');
    } catch(e) {}
    var token = localStorage.getItem(TOKEN_KEY);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { callback(null, JSON.parse(xhr.responseText)); }
        catch(e) { callback(null, { success: true }); }
      } else { callback(new Error('HTTP ' + xhr.status), null); }
    };
    xhr.onerror = function() { callback(new Error('Network error'), null); };
    xhr.ontimeout = function() { callback(new Error('Timeout'), null); };
    xhr.send();
  }

  // ========== Utilities ==========
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Expose methods and states to window for test automation and diagnostics
  window.switchSection = switchSection;
  window.iptvState = iptvState;
  window.loadIptv = loadIptv;
  window.loadEpg = loadEpg;
  window.renderIptv = renderIptv;
  window.getFilteredChannels = getFilteredChannels;
  window.toggleFavorite = toggleFavorite;
  window.toggleIptvFavorite = toggleFavorite;
  window.focusIptvChannel = focusIptvChannel;
  window.state = state;
  window.oskState = oskState;
  window.activateSearchChip = activateSearchChip;
  window.saveRecentSearch = saveRecentSearch;
  window.renderRecentSearches = renderRecentSearches;
  window.getSearchChipElements = getSearchChipElements;
  window.getVisibleRows = getVisibleRows;
  window.focusCard = focusCard;
  window.focusCardUp = focusCardUp;
  window.focusCardDown = focusCardDown;
  window.getRecentSearches = getRecentSearches;
  window.openIptvOsk = openIptvOsk;
  window.closeIptvOsk = closeIptvOsk;
  window.showDetail = showDetail;
  window.hideDetail = hideDetail;
  window.findEpgId = findEpgId;
  window.updatePreview = updatePreview;
  window.iptvOskState = iptvOskState;
  window.focusNav = focusNav;
  window.renderHistoryRecommendations = renderHistoryRecommendations;
  window.startCardTitleMarquee = startCardTitleMarquee;
  window.stopCardTitleMarquee = stopCardTitleMarquee;
  window.applyActivePlaylist = applyActivePlaylist;
  window.loadAllPlaylists = loadAllPlaylists;
  window.notifState = notifState;
  window.epgReminderState = epgReminderState;
  window.loadNotifications = loadNotifications;
  window.renderNotifications = renderNotifications;
  window.openNotification = openNotification;
  window.focusNotificationElement = focusNotificationElement;
  window.loadEpgReminders = loadEpgReminders;
  window.toggleEpgReminder = toggleEpgReminder;
  window.hasEpgReminder = hasEpgReminder;
  window.checkEpgReminders = checkEpgReminders;
  window.executeEpgToastSwitch = executeEpgToastSwitch;
  window.dismissEpgToast = dismissEpgToast;
})();

