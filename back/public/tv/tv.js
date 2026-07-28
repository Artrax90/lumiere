// Lumiere TV — Vanilla JS for Samsung Tizen 5.5 (Chrome 56)
(function() {
  'use strict';
  console.log('[Lumiere] JS loaded');

  var API = '';
  var TOKEN_KEY = 'lumiere_access';
  var SERVER_KEY = 'lumiere_server';

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

  // ========== Init ==========
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[Lumiere] DOMContentLoaded');
    try {
      $loading = document.getElementById('loading');
      $app = document.getElementById('app');
      $topbar = document.getElementById('topbar');
      $content = document.getElementById('content');
      $detail = document.getElementById('detail');

      var server = localStorage.getItem(SERVER_KEY);
      if (server) API = server;

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
  });

  // ========== Auth ==========
  function initAuth() {
    console.log('[Lumiere] initAuth called');
    apiFetch('/api/setup/status', function(err, data) {
      console.log('[Lumiere] setup/status response:', err ? err.message : 'ok', data);
      if (err || !data) { showError('Не удалось подключиться к серверу'); return; }
      if (data.needsSetup) { showError('Требуется настройка через веб-интерфейс'); return; }

      var token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        apiFetch('/api/user/profile', function(err2, profile) {
          if (profile && profile.id) { state.user = profile; startApp(); }
          else { tryLanLogin(); }
        });
      } else { tryLanLogin(); }
    });
  }

  function tryLanLogin() {
    console.log('[Lumiere] tryLanLogin called');
    apiFetch('/api/auth/lan-status', function(err, lanData) {
      if (lanData && lanData.isLan) {
        apiPost('/api/auth/lan-login', {}, function(err2, loginData) {
          if (loginData && loginData.accessToken) {
            localStorage.setItem(TOKEN_KEY, loginData.accessToken);
            state.user = loginData.user;
            startApp();
          } else { showError('Не удалось войти. Откройте приложение через браузер.'); }
        });
      } else { showError('Не удалось войти. Откройте приложение через браузер для авторизации.'); }
    });
  }

  function showError(msg) {
    $loading.innerHTML = '<div class="logo"><div class="dot"></div><span class="logo-text">Lumiere</span></div>' +
      '<p style="margin-top:20px;color:rgba(255,255,255,0.5);font-size:14px;max-width:400px;text-align:center;">' + msg + '</p>';
  }

  // ========== App Start ==========
  function startApp() {
    try {
      console.log('[Lumiere] startApp begin');
      $loading.classList.add('hidden');
      $app.classList.remove('hidden');

      var serverUrlEl = document.getElementById('server-url');
      if (serverUrlEl) serverUrlEl.textContent = API;

      console.log('[Lumiere] loadData');
      loadData();
      console.log('[Lumiere] setupNavigation');
      setupNavigation();
      console.log('[Lumiere] setupKeyboard');
      setupKeyboard();
      console.log('[Lumiere] setupSearch');
      setupSearch();
      console.log('[Lumiere] setupIptvSearch');
      setupIptvSearch();
      setupIptvEvents();
      // Sync first, then load IPTV from synced data
      syncWithServer(function() {
        console.log('[App] Sync complete, loading IPTV');
        loadIptv();
      });
      setTimeout(function() { focusNav(0); }, 100);
    } catch(e) {
      console.error('[Lumiere] startApp error:', e);
      showError('Ошибка запуска: ' + (e.message || 'unknown'));
    }
  }

  // ========== Data Loading ==========
  function loadData() {
    apiFetch('/api/movies/trending', function(err, data) {
      if (data && data.results) {
        renderRow('trending-items', data.results.slice(0, 12));
      }
    });

    apiFetch('/api/movies/popular', function(err, data) {
      if (data && data.results) {
        state.movies = data.results;
        renderRow('popular-items', data.results.slice(0, 12));
        renderGrid('movies-grid', data.results);
      }
    });

    apiFetch('/api/tv/trending', function(err, data) {
      if (data && data.results) {
        state.tvShows = data.results;
        renderRow('tv-items', data.results.slice(0, 12));
        renderGrid('tv-grid', data.results);
      }
    });

    // Continue watching from localStorage
    renderContinueWatching();

    loadIptv();
  }

  function renderContinueWatching() {
    var container = document.getElementById('continue-items');
    if (!container) return;

    var positions = {};
    try { positions = JSON.parse(localStorage.getItem('playback_positions') || '{}'); } catch(e) {}

    var lastTorrents = {};
    try { lastTorrents = JSON.parse(localStorage.getItem('last_torrents') || '{}'); } catch(e) {}

    var items = [];
    for (var id in positions) {
      var pos = positions[id];
      if (typeof pos === 'object' && pos.time > 30 && pos.title) {
        items.push({ id: Number(id), time: pos.time, timestamp: pos.timestamp || 0, title: pos.title });
      } else if (typeof pos === 'number' && pos > 30 && lastTorrents[id]) {
        items.push({ id: Number(id), time: pos, timestamp: 0, title: lastTorrents[id].title || 'Продолжить просмотр' });
      }
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
      var card = document.createElement('div');
      card.className = 'card';
      var name = (item.title && typeof item.title === 'object') ? (item.title.name || item.title.logoText || '') : (item.title || '');
      var poster = (item.title && typeof item.title === 'object') ? (item.title.poster || '') : '';
      var imgSrc = imgUrl(poster);

      card.innerHTML = '<div class="card-progress-wrap"><img class="card-img" src="' + esc(imgSrc) + '" alt="' + esc(name) + '" loading="lazy">' +
        '<div class="card-progress-bar"><div class="card-progress-fill" style="width:' + Math.min(100, (item.time / 7200) * 100) + '%"></div></div></div>' +
        '<div class="card-title">' + esc(name) + '</div>';

      card.addEventListener('click', function() {
        // Try to resume playback
        var torrent = lastTorrents[item.id];
        if (torrent && torrent.magnet) {
          // Set detail temporarily so openTorrent can use the ID
          state.detail = { id: item.id, name: name, type: 'movie' };
          openTorrent(torrent.magnet, torrent.title || name);
        } else {
          // No saved torrent — open detail view to pick one
          var titleObj = { id: item.id, name: name, type: 'movie', poster: poster, backdrop: '', year: 0, runtime: '', rating: '', score: 0, genres: [], description: '' };
          showDetail(titleObj);
        }
      });

      container.appendChild(card);
    });
  }


  // ==================== IPTV ====================
  // ==================== IPTV ====================
  var iptvState = {
    channels: [],
    groups: [],
    selectedGroup: 'All',
    favorites: {},
    epgData: {},
    epgChannelMap: {},
    epgIconMap: {},
    epgNameLookup: {},
    searchQuery: '',
    focusedCol: 1, // 0=categories, 1=channels, 2=preview
    focusedCat: 0,
    focusedCh: 0,
    currentChannel: null,
    previewVideo: null
  };

  var iptvLocked = false;

  function loadIptv() {
    try {
      var playlists = [];
      try { playlists = JSON.parse(localStorage.getItem('lumiere_iptv') || '[]'); } catch(e) {}
      console.log('[IPTV] loadIptv: found', playlists.length, 'playlists in localStorage');

      if (playlists.length > 0 && playlists[0].url) {
        console.log('[IPTV] Loading playlist:', playlists[0].url);
        loadPlaylist(playlists[0].url, playlists[0].epgUrl);
      } else {
        console.log('[IPTV] No playlists in localStorage, trying sync API');
        apiFetch('/api/sync', function(err, data) {
          if (data && data.iptvPlaylists && data.iptvPlaylists.length > 0) {
            console.log('[IPTV] Got', data.iptvPlaylists.length, 'playlists from sync');
            localStorage.setItem('lumiere_iptv', JSON.stringify(data.iptvPlaylists));
            loadPlaylist(data.iptvPlaylists[0].url, data.iptvPlaylists[0].epgUrl);
          } else {
            console.log('[IPTV] Sync failed or no playlists, trying default playlist');
            // Fallback: load default playlist directly
            var defaultUrl = 'https://loganettv.github.io/playlists/all.m3u';
            loadPlaylist(defaultUrl, '');
          }
        });
      }
    } catch(e) { console.error('[IPTV] loadIptv error:', e); }
  }

  function loadPlaylist(url, epgUrl) {
    apiPost('/api/iptv/parse', { url: url }, function(err, data) {
      var channels = data && data.channels ? data.channels : (Array.isArray(data) ? data : null);
      var groups = data && data.groups ? data.groups : [];
      if (channels && channels.length > 0) {
        iptvState.channels = channels;
        iptvState.groups = groups;
        try { iptvState.favorites = JSON.parse(localStorage.getItem('lumiere_iptv_fav') || '{}'); } catch(e) {}
        renderIptv();
        if (epgUrl) loadEpg(epgUrl);
      }
    });
  }

  function loadEpg(epgUrl) {
    apiPost('/api/iptv/epg', { url: epgUrl }, function(err, data) {
      if (err || !data) return;
      var parsed = null;
      try { parsed = typeof data === 'string' ? JSON.parse(data) : data; } catch(e) { return; }
      if (!parsed) return;
      if (parsed.epg) iptvState.epgData = parsed.epg;
      if (parsed.channelMap) iptvState.epgChannelMap = parsed.channelMap;
      if (parsed.iconMap) iptvState.epgIconMap = parsed.iconMap;
      for (var name in iptvState.epgChannelMap) {
        iptvState.epgNameLookup[name] = iptvState.epgChannelMap[name];
      }
      renderIptv();
    });
  }

  function findEpgId(ch) {
    if (ch.tvgId && iptvState.epgData[ch.tvgId]) return ch.tvgId;
    var nl = ch.name.toLowerCase();
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
    var now = new Date();
    var cm = now.getHours() * 60 + now.getMinutes();
    for (var i = 0; i < programs.length; i++) {
      var p = programs[i];
      var sp = (p.startTime || '').split(':');
      var ep = (p.stopTime || '').split(':');
      if (sp.length < 2 || ep.length < 2) continue;
      var sm = parseInt(sp[0]) * 60 + parseInt(sp[1]);
      var em = parseInt(ep[0]) * 60 + parseInt(ep[1]);
      if (em <= sm) em += 1440;
      if (cm >= sm && cm < em) return p;
    }
    return programs[0];
  }

  function getNextProgram(programs) {
    var current = getCurrentProgram(programs);
    if (!current || !programs) return null;
    var idx = programs.indexOf(current);
    if (idx >= 0 && idx < programs.length - 1) return programs[idx + 1];
    return null;
  }

  function getProgramProgress(program) {
    if (!program || !program.startTime || !program.stopTime) return 0;
    var now = new Date();
    var cm = now.getHours() * 60 + now.getMinutes();
    var sp = program.startTime.split(':');
    var ep = program.stopTime.split(':');
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
    var channels = iptvState.channels;
    if (iptvState.selectedGroup === 'Избранное') {
      channels = channels.filter(function(ch) { return iptvState.favorites[ch.id]; });
    } else if (iptvState.selectedGroup !== 'Все') {
      channels = channels.filter(function(ch) { return ch.group === iptvState.selectedGroup; });
    }
    return channels;
  }

  // ========== Render ==========
  function renderIptv() {
    if (iptvLocked) return;
    renderCategories();
    renderChannels();
    renderPreview();
  }

  function renderCategories() {
    var container = document.getElementById('iptv-cat-list');
    if (!container) return;
    var cats = buildCategories();
    var html = '';
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var isActive = cat === iptvState.selectedGroup;
      var isFocused = iptvState.focusedCol === 0 && i === iptvState.focusedCat;
      var cls = 'iptv-cat-item';
      if (isActive) cls += ' active';
      if (isFocused) cls += ' focused';
      var icon = cat === 'Все' ? '📺' : cat === 'Избранное' ? '★' : '▸';
      html += '<div class="' + cls + '" data-cat="' + esc(cat) + '" data-idx="' + i + '">';
      html += '<span class="iptv-cat-icon">' + icon + '</span>';
      html += '<span>' + esc(cat) + '</span>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function renderChannels() {
    var container = document.getElementById('iptv-channels');
    var countEl = document.getElementById('iptv-channel-count');
    if (!container) return;

    var channels = getFilteredChannels();
    if (countEl) countEl.textContent = channels.length + ' каналов';

    if (channels.length === 0) {
      container.innerHTML = '<div style="padding:20px;color:var(--text-mute);text-align:center;">Нет каналов</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < channels.length; i++) {
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

      var cls = 'iptv-ch-item';
      if (isFocused) cls += ' focused';

      html += '<div class="' + cls + '" data-chid="' + esc(ch.id) + '" data-idx="' + i + '">';
      html += logoHtml;
      html += '<div class="iptv-ch-info">';
      html += '<div class="iptv-ch-name">' + esc(ch.name) + '</div>';
      if (current) {
        html += '<div class="iptv-ch-program">' + esc(current.title) + '</div>';
        html += '<div class="iptv-ch-progress"><div class="iptv-ch-progress-fill" style="width:' + Math.round(progress * 100) + '%"></div></div>';
        html += '<div class="iptv-ch-time">' + esc(current.startTime) + ' - ' + esc(current.stopTime) + '</div>';
      }
      html += '</div>';
      html += '<button class="iptv-ch-fav' + (isFav ? ' active' : '') + '" data-favid="' + esc(ch.id) + '">' + (isFav ? '★' : '☆') + '</button>';
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function renderPreview() {
    var ch = iptvState.currentChannel;
    var nameEl = document.getElementById('iptv-preview-name');
    var progEl = document.getElementById('iptv-preview-program');
    var nextEl = document.getElementById('iptv-preview-next');
    var metaEl = document.getElementById('iptv-preview-meta');
    var noVideo = document.getElementById('iptv-preview-no-video');

    if (!ch) {
      if (nameEl) nameEl.textContent = '';
      if (progEl) progEl.textContent = '';
      if (nextEl) nextEl.textContent = '';
      if (metaEl) metaEl.textContent = '';
      if (noVideo) noVideo.style.display = 'flex';
      return;
    }

    if (nameEl) nameEl.textContent = ch.name;

    var epgId = findEpgId(ch);
    var programs = epgId && iptvState.epgData[epgId] ? iptvState.epgData[epgId] : null;
    var current = getCurrentProgram(programs);
    var next = getNextProgram(programs);

    if (progEl) {
      progEl.textContent = current ? 'Сейчас: ' + current.title + ' (' + current.startTime + ' - ' + current.stopTime + ')' : '';
    }
    if (nextEl) {
      nextEl.textContent = next ? 'Далее: ' + next.title + ' (' + next.startTime + ')' : '';
    }
    if (metaEl) {
      var meta = [];
      if (ch.group) meta.push(ch.group);
      metaEl.textContent = meta.join(' · ');
    }
  }

  function startPreview(ch) {
    if (!ch || !ch.url) return;
    var video = document.getElementById('iptv-preview-video');
    var noVideo = document.getElementById('iptv-preview-no-video');
    if (!video) return;

    // Stop current preview
    stopPreview();

    iptvState.previewChannel = ch;
    video.src = ch.url;
    video.style.display = 'block';
    if (noVideo) noVideo.style.display = 'none';
    video.play().catch(function() {});
  }

  function stopPreview() {
    var video = document.getElementById('iptv-preview-video');
    if (video) {
      video.pause();
      video.src = '';
      video.style.display = 'none';
    }
    iptvState.previewChannel = null;
    var noVideo = document.getElementById('iptv-preview-no-video');
    if (noVideo) noVideo.style.display = 'flex';
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
          iptvState.focusedCh = 0;
          renderIptv();
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
    window.location.href = '/tv/player.html?url=' + encodeURIComponent(ch.url) + '&title=' + encodeURIComponent(ch.name);
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

  function createCard(title, index) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-index', index);
    card.setAttribute('data-id', title.id);

    var imgSrc = imgUrl(title.poster);
    var scoreHtml = title.score ? '<div class="card-score">' + title.score + '</div>' : '';

    card.innerHTML = '<div class="card-img-wrap"><img class="card-img" src="' + esc(imgSrc) + '" alt="' + esc(title.name) + '" loading="lazy">' + scoreHtml + '</div>' +
      '<div class="card-title">' + esc(title.name) + '</div>';

    card.addEventListener('click', function() { showDetail(title); });
    return card;
  }

  // ========== Detail View ==========
  function showDetail(title) {
    $detail.classList.remove('hidden');
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
    var poster = imgUrl(title.poster);
    var backdrop = imgUrl(title.backdrop || title.poster);
    var html = '';
    html += '<div class="detail-hero"><img src="' + esc(backdrop) + '" class="detail-hero-img" onerror="this.style.display=\'none\'">';
    html += '<div class="detail-hero-gradient"></div></div>';
    html += '<div class="detail-overlay">';
    html += '<div class="detail-top-row"><button id="detail-back-btn" class="detail-back-btn" tabindex="0">Назад</button></div>';
    html += '<div class="detail-main-row"><img src="' + esc(poster) + '" class="detail-poster" onerror="this.style.display=\'none\'">';
    html += '<div class="detail-info"><h1 class="detail-title">' + esc(title.name) + '</h1>';
    if (title.year) html += '<div class="detail-meta-row"><span class="detail-meta-item">' + title.year + '</span></div>';
    html += '<p class="detail-loading-text">Загрузка...</p>';
    html += '</div></div></div>';
    $detail.querySelector('#detail-content').innerHTML = html;
    bindDetailBack();
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
    html += '<div class="detail-top-row"><button id="detail-back-btn" class="detail-back-btn" tabindex="0">Назад</button></div>';

    // Poster + Info
    html += '<div class="detail-main-row">';
    html += '<img src="' + esc(poster) + '" class="detail-poster" onerror="this.style.display=\'none\'">';
    html += '<div class="detail-info">';

    // Type + genre
    html += '<div class="detail-label-row"><span class="detail-type-label">' + esc(typeLabel) + '</span>';
    if (d.genres && d.genres.length > 0) {
      html += '<span class="detail-sep"> · </span><span class="detail-genre-label">' + esc(d.genres[0]) + '</span>';
    }
    html += '</div>';

    // Title
    html += '<h1 class="detail-title">' + esc(d.logoText || d.name) + '</h1>';

    // Meta: score, year, runtime, rating
    html += '<div class="detail-meta-row">';
    if (d.score) html += '<span class="detail-score">★ ' + d.score + '</span>';
    if (d.year) { html += '<span class="detail-meta-dot"> · </span><span class="detail-meta-item">' + d.year + '</span>'; }
    if (d.runtime) { html += '<span class="detail-meta-dot"> · </span><span class="detail-meta-item">' + esc(d.runtime) + '</span>'; }
    if (d.rating) { html += '<span class="detail-meta-dot"> · </span><span class="detail-rating-badge">' + esc(d.rating) + '</span>'; }
    html += '</div>';

    html += '</div></div>';

    // Action buttons
    html += '<div class="detail-actions">';
    var savedTorrent = null;
    var savedPosition = 0;
    try { savedTorrent = (JSON.parse(localStorage.getItem('last_torrents') || '{}'))[d.id] || null; } catch(e) {}
    try { savedPosition = (JSON.parse(localStorage.getItem('playback_positions') || '{}'))[d.id] || 0; } catch(e) {}
    if (typeof savedPosition === 'object') savedPosition = savedPosition.time || 0;
    var hasResume = savedTorrent && savedPosition > 30;

    if (hasResume) {
      html += '<button class="detail-btn detail-btn-primary" id="detail-play" tabindex="0">Продолжить</button>';
    } else {
      html += '<button class="detail-btn detail-btn-primary" id="detail-play" tabindex="0">Смотреть</button>';
    }
    html += '<button class="detail-btn detail-btn-icon-btn" id="detail-fav-btn" tabindex="0" title="В избранное">♥</button>';
    html += '</div>';

    // Description
    if (d.description) {
      html += '<div class="detail-desc-wrap"><p class="detail-desc" id="detail-desc-text">' + esc(d.description) + '</p>';
      if (d.description.length > 200) {
        html += '<button class="detail-desc-toggle" id="detail-desc-toggle" tabindex="0">Ещё</button>';
      }
      html += '</div>';
    }

    // Tabs: Torrents / Sources
    html += '<div class="detail-tabs">';
    html += '<button class="detail-tab active" data-tab="torrents" tabindex="0">Торренты</button>';
    html += '<button class="detail-tab" data-tab="sources" tabindex="0">Источники</button>';
    html += '</div>';

    // Season selector for TV shows
    if (d.type === 'tv') {
      html += '<div class="detail-season-wrap">';
      html += '<select id="season-select" class="detail-season-select" tabindex="0">';
      html += '<option value="">Все сезоны</option>';
      for (var s = 1; s <= 30; s++) html += '<option value="' + s + '">Сезон ' + s + '</option>';
      html += '</select></div>';
    }

    // Tab content
    html += '<div class="detail-tab-content">';
    html += '<div id="torrent-results" class="detail-tab-pane active" data-pane="torrents"><p class="detail-loading-text">Поиск торрентов...</p></div>';
    html += '<div id="sources-results" class="detail-tab-pane" data-pane="sources"><p class="detail-loading-text">Поиск источников...</p></div>';
    html += '</div>';

    // Meta grid
    html += '<div class="detail-meta-grid">';
    if (d.director) html += '<div class="detail-meta-cell"><div class="detail-meta-label">Режиссёр</div><div class="detail-meta-value">' + esc(d.director) + '</div></div>';
    if (d.genres && d.genres.length > 0) html += '<div class="detail-meta-cell"><div class="detail-meta-label">Жанры</div><div class="detail-meta-value">' + esc(d.genres.join(', ')) + '</div></div>';
    if (d.runtime) html += '<div class="detail-meta-cell"><div class="detail-meta-label">Длительность</div><div class="detail-meta-value">' + esc(d.runtime) + '</div></div>';
    if (d.year) html += '<div class="detail-meta-cell"><div class="detail-meta-label">Год</div><div class="detail-meta-value">' + d.year + '</div></div>';
    html += '</div>';

    // Cast
    if (d.cast && d.cast.length > 0) {
      html += '<div class="detail-cast-section">';
      html += '<div class="detail-section-header"><h3 class="detail-section-title">Актёры</h3><span class="detail-section-count">' + d.cast.length + '</span></div>';
      html += '<div class="detail-cast-grid">';
      d.cast.forEach(function(c) {
        var avatar = imgUrl(c.image);
        html += '<div class="detail-cast-item">';
        html += '<div class="detail-cast-avatar"><img src="' + esc(avatar) + '" class="detail-cast-img" onerror="this.style.display=\'none\'" loading="lazy"></div>';
        html += '<div class="detail-cast-info"><div class="detail-cast-name">' + esc(c.name) + '</div>';
        if (c.role) html += '<div class="detail-cast-role">' + esc(c.role) + '</div>';
        html += '</div></div>';
      });
      html += '</div></div>';
    }

    html += '</div>'; // end overlay

    $detail.querySelector('#detail-content').innerHTML = html;

    // Bind events
    bindDetailBack();
    bindDetailActions(d);
    bindDetailTabs();
    bindDescriptionToggle();
    bindSeasonSelector(d);

    // Load content
    searchTorrents(d, null);
    searchSources(d);

    // Focus back button
    setTimeout(function() {
      var backBtn = document.getElementById('detail-back-btn');
      if (backBtn) backBtn.focus();
    }, 200);
  }

  function imgUrl(path) {
    if (!path) return '';
    if (path.indexOf('/') === 0) return API + path;
    return path;
  }

  function bindDetailBack() {
    var btn = document.getElementById('detail-back-btn');
    if (btn) {
      btn.addEventListener('click', function() { $detail.classList.add('hidden'); });
    }
  }

  function bindDetailActions(d) {
    var playBtn = document.getElementById('detail-play');
    if (playBtn) {
      playBtn.addEventListener('click', function() {
        // Switch to torrents tab and focus first item
        state.detailTab = 'torrents';
        switchDetailTab('torrents');
        var first = document.querySelector('#torrent-results .torrent-item');
        if (first) { first.classList.add('focused'); first.focus(); }
      });
    }

    var favBtn = document.getElementById('detail-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', function() {
        apiPost('/api/user/favorites', {
          tmdbId: d.id, mediaType: d.type, titleName: d.name, poster: d.poster
        }, function(err) {
          if (!err) {
            favBtn.textContent = '♥';
            favBtn.style.color = '#6ee7b7';
          }
        });
      });
    }
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
    var select = document.getElementById('season-select');
    if (!select) return;
    select.addEventListener('change', function() {
      var val = select.value;
      state.detailSeason = val;
      searchTorrents(title, val ? parseInt(val) : null);
    });
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
          window.location.href = '/tv/player.html?url=' + encodeURIComponent(hlsUrl) + '&title=' + encodeURIComponent(title.name);
        });
      });
    });
  }

  // ========== Torrents ==========
  function searchTorrents(title, season) {
    var container = document.getElementById('torrent-results');
    if (!container) return;

    var query = title.name;
    if (season) query += ' S' + (season < 10 ? '0' + season : season);

    apiFetch('/api/torrents/search?q=' + encodeURIComponent(query), function(err, data) {
      if (err || !data || !data.results || data.results.length === 0) {
        container.innerHTML = '<p class="detail-empty-text">Торренты не найдены</p>';
        return;
      }

      // Sort by seeders desc
      var sorted = data.results.slice().sort(function(a, b) { return (b.seeders || 0) - (a.seeders || 0); });

      var html = '<div class="detail-torrents-list">';
      sorted.slice(0, 20).forEach(function(torrent, i) {
        html += '<div class="torrent-item" data-index="' + i + '" data-magnet="' + esc(torrent.magnet || '') + '" data-title="' + esc(torrent.title || '') + '" tabindex="0">';
        html += '<div class="detail-torrent-title">' + esc(torrent.title || '') + '</div>';
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
    });
  }

  function openTorrent(magnet, title) {
    var movieId = (state.detail && state.detail.id) || 0;

    // Save torrent info for resume
    if (movieId) {
      try {
        var last = JSON.parse(localStorage.getItem('last_torrents') || '{}');
        last[movieId] = { magnet: magnet, title: title };
        localStorage.setItem('last_torrents', JSON.stringify(last));
      } catch(e) {}
    }

    apiPost('/api/torrents/stream', { magnet: magnet, title: title }, function(err, data) {
      if (err || !data) {
        var hlsUrl = '/api/torrents/hls?link=' + encodeURIComponent(magnet) + '&index=0';
        window.location.href = '/tv/player.html?url=' + encodeURIComponent(hlsUrl) + '&title=' + encodeURIComponent(title) + '&id=' + movieId;
        return;
      }

      if (data.files && data.files.length > 0) {
        if (data.files.length === 1) {
          playFile(data.files[0], title, movieId);
        } else {
          showFileSelector(data.files, title, movieId);
        }
      } else {
        var hlsUrl = '/api/torrents/hls?link=' + encodeURIComponent(magnet) + '&index=0';
        window.location.href = '/tv/player.html?url=' + encodeURIComponent(hlsUrl) + '&title=' + encodeURIComponent(title) + '&id=' + movieId;
      }
    });
  }

  function playFile(file, title, movieId) {
    var url = file.streamUrl || '';
    if (url.indexOf('/') === 0) url = API + url;
    var name = file.name || title;
    movieId = movieId || (state.detail && state.detail.id) || 0;
    window.location.href = '/tv/player.html?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(name) + '&id=' + movieId;
  }

  function showFileSelector(files, title, movieId) {
    var html = '<div class="file-selector-wrap">';
    html += '<h2 class="file-selector-title">Выберите файл</h2>';
    html += '<div class="file-selector-list">';
    files.forEach(function(file, i) {
      html += '<div class="file-item" data-index="' + i + '" tabindex="0">';
      html += '<div class="file-item-name">' + esc(file.name || 'Файл ' + (i + 1)) + '</div>';
      if (file.sizeFormatted) html += '<div class="file-item-size">' + esc(file.sizeFormatted) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';

    $detail.querySelector('#detail-content').innerHTML = html;

    var items = $detail.querySelectorAll('.file-item');
    if (items.length > 0) { items[0].classList.add('focused'); items[0].focus(); }

    items.forEach(function(item) {
      item.addEventListener('click', function() {
        var idx = parseInt(item.getAttribute('data-index'));
        if (files[idx]) playFile(files[idx], title, movieId);
      });
    });

    var fileKeyHandler = function(e) {
      var focused = $detail.querySelector('.file-item.focused');
      var arr = [];
      for (var i = 0; i < items.length; i++) arr.push(items[i]);
      var idx = focused ? arr.indexOf(focused) : -1;

      switch (e.keyCode) {
        case 38:
          if (idx > 0) { arr[idx].classList.remove('focused'); arr[idx-1].classList.add('focused'); arr[idx-1].focus(); }
          e.preventDefault();
          break;
        case 40:
          if (idx < arr.length - 1) { arr[idx].classList.remove('focused'); arr[idx+1].classList.add('focused'); arr[idx+1].focus(); }
          e.preventDefault();
          break;
        case 13:
          if (focused) focused.click();
          e.preventDefault();
          break;
        case 10009:
          document.removeEventListener('keydown', fileKeyHandler);
          if (state.detail) renderDetail(state.detail);
          else $detail.classList.add('hidden');
          e.preventDefault();
          break;
      }
    };
    document.addEventListener('keydown', fileKeyHandler);
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
        console.log('[Sync] Saving', data.iptvPlaylists.length, 'IPTV playlists');
        localStorage.setItem('lumiere_iptv', JSON.stringify(data.iptvPlaylists));
      } else {
        console.log('[Sync] No IPTV playlists');
      }

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
            local[id] = {
              time: item.progress || 0,
              timestamp: serverTime,
              title: { name: item.titleName || '', poster: item.poster || '', id: id }
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

  // ========== Search ==========
  var searchTimer = null;

  function setupSearch() {
    var input = document.getElementById('search-input');
    if (!input) return;

    // Live search on input with debounce
    input.addEventListener('input', function() {
      var query = input.value.trim();
      if (searchTimer) clearTimeout(searchTimer);

      if (!query) {
        var container = document.getElementById('search-results');
        if (container) container.innerHTML = '';
        return;
      }

      searchTimer = setTimeout(function() {
        performSearch(query);
      }, 300);
    });

    // Enter = focus first result
    input.addEventListener('keydown', function(e) {
      if (e.keyCode === 13) {
        var firstResult = document.querySelector('#search-results .card');
        if (firstResult) {
          input.blur();
          firstResult.classList.add('focused');
          firstResult.focus();
          state.focusedCard = 0;
        }
        e.preventDefault();
      }
    });
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

    var logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        localStorage.removeItem(TOKEN_KEY);
        window.location.reload();
      });
    }
  }

  function switchSection(section) {
    state.section = section;
    state.focusedCard = null;

    document.querySelectorAll('.nav-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-section') === section);
    });

    document.querySelectorAll('.section').forEach(function(sec) {
      sec.classList.toggle('active', sec.id === 'sec-' + section);
    });

    $content.scrollTop = 0;
  }

  // ========== D-pad Navigation ==========
  var lpTimer = null;
  var lpTriggered = false;
  var lpChannelId = null;

  function setupKeyboard() {
    document.addEventListener('keydown', function(e) {
      var code = e.keyCode;

      // Long-press detection for IPTV channels
      if (code === 13 && !iptvLocked) {
        var focused = document.querySelector('.iptv-channel.focused');
        if (focused && focused.hasAttribute('data-chid')) {
          if (!lpTimer) {
            lpTriggered = false;
            lpChannelId = focused.getAttribute('data-chid');
            lpTimer = setTimeout(function() {
              lpTriggered = true;
              lpTimer = null;
              toggleFavorite(lpChannelId);
              lpChannelId = null;
            }, 3000);
          }
          return;
        }
      }

      if (!$detail.classList.contains('hidden')) {
        handleDetailKeys(code, e);
        return;
      }

      handleMainKeys(code, e);
    });

    document.addEventListener('keyup', function(e) {
      if (e.keyCode !== 13) return;
      if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
      if (!lpTriggered && lpChannelId && !iptvLocked) {
        for (var ci = 0; ci < iptvState.channels.length; ci++) {
          if (iptvState.channels[ci].id === lpChannelId) {
            var ch = iptvState.channels[ci];
            window.location.href = '/tv/player.html?url=' + encodeURIComponent(ch.url) + '&title=' + encodeURIComponent(ch.name);
            break;
          }
        }
      }
      lpTriggered = false;
      lpChannelId = null;
    });
  }

  function handleMainKeys(code, e) {
    var isOnNav = document.querySelector('.nav-btn.focused') !== null;
    var activeEl = document.activeElement;
    var isOnInput = activeEl && activeEl.tagName === 'INPUT';

    // If focused on search input
    if (isOnInput) {
      switch (code) {
        case 40: // Down → results
          activeEl.blur();
          var firstResult = document.querySelector('#search-results .card');
          if (firstResult) { firstResult.classList.add('focused'); firstResult.focus(); state.focusedCard = 0; }
          e.preventDefault();
          break;
        case 38: // Up → nav
          activeEl.blur();
          focusNav(state.focusedNav);
          e.preventDefault();
          break;
        case 10009: // Back → nav
          activeEl.blur();
          focusNav(state.focusedNav);
          e.preventDefault();
          break;
      }
      return;
    }

    // IPTV three-column navigation
    if (state.section === 'iptv' && !isOnNav) {
      handleIptvKeys(code, e);
      return;
    }

    switch (code) {
      case 37: // Left
        if (isOnNav) focusNavDelta(-1);
        else if (isOnCard) focusCardDelta(-1);
        e.preventDefault();
        break;
      case 39: // Right
        if (isOnNav) focusNavDelta(1);
        else if (isOnCard) focusCardDelta(1);
        e.preventDefault();
        break;
      case 38: // Up
        if (isOnCard) {
          var moved = focusCardUp();
          if (!moved) {
            clearCardFocus();
            state.focusedCard = null;
            focusNav(state.focusedNav);
          }
        }
        e.preventDefault();
        break;
      case 40: // Down
        if (isOnNav) {
          clearNavFocus();
          if (state.section === 'iptv') {
            iptvState.focusedCol = 1;
            iptvState.focusedCh = 0;
            renderIptv();
            focusIptvChannel(0);
          } else if (state.section === 'search') {
            // Don't auto-focus search input
          } else {
            state.focusedCard = 0;
            focusCard(0);
          }
        } else if (isOnCard) {
          focusCardDown();
        }
        e.preventDefault();
        break;
      case 13: // Enter
        if (isOnNav && state.section === 'search') {
          var searchIn = document.getElementById('search-input');
          if (searchIn) searchIn.focus();
          e.preventDefault();
          break;
        }
        selectFocused();
        e.preventDefault();
        break;
      case 10009: // Back
        try { tizen.application.getCurrentApplication().exit(); } catch(ex) {}
        e.preventDefault();
        break;
    }
  }

  // IPTV three-column D-pad navigation
  function handleIptvKeys(code, e) {
    var channels = getFilteredChannels();
    var cats = buildCategories();

    switch (code) {
      case 37: // Left — move to categories column
        if (iptvState.focusedCol === 1) {
          iptvState.focusedCol = 0;
          if (iptvState.focusedCat >= cats.length) iptvState.focusedCat = cats.length - 1;
          renderIptv();
        } else if (iptvState.focusedCol === 2) {
          iptvState.focusedCol = 1;
          renderIptv();
          focusIptvChannel(iptvState.focusedCh);
        }
        e.preventDefault();
        break;

      case 39: // Right — move to channels or preview
        if (iptvState.focusedCol === 0) {
          iptvState.focusedCol = 1;
          iptvState.focusedCh = 0;
          renderIptv();
          focusIptvChannel(0);
        } else if (iptvState.focusedCol === 1) {
          iptvState.focusedCol = 2;
          renderIptv();
        }
        e.preventDefault();
        break;

      case 38: // Up
        if (iptvState.focusedCol === 0) {
          // Categories
          if (iptvState.focusedCat > 0) {
            iptvState.focusedCat--;
            iptvState.selectedGroup = cats[iptvState.focusedCat];
            iptvState.focusedCh = 0;
            renderIptv();
          }
        } else if (iptvState.focusedCol === 1) {
          // Channels
          if (iptvState.focusedCh > 0) {
            iptvState.focusedCh--;
            renderIptv();
            focusIptvChannel(iptvState.focusedCh);
            updatePreview(channels[iptvState.focusedCh]);
          } else {
            // Go to nav
            iptvState.focusedCol = -1;
            clearIptvFocus();
            focusNav(state.focusedNav);
          }
        }
        e.preventDefault();
        break;

      case 40: // Down
        if (iptvState.focusedCol === 0) {
          // Categories
          if (iptvState.focusedCat < cats.length - 1) {
            iptvState.focusedCat++;
            iptvState.selectedGroup = cats[iptvState.focusedCat];
            iptvState.focusedCh = 0;
            renderIptv();
          }
        } else if (iptvState.focusedCol === 1) {
          // Channels
          if (iptvState.focusedCh < channels.length - 1) {
            iptvState.focusedCh++;
            renderIptv();
            focusIptvChannel(iptvState.focusedCh);
            updatePreview(channels[iptvState.focusedCh]);
          }
        }
        e.preventDefault();
        break;

      case 13: // Enter — play channel
        if (iptvState.focusedCol === 0) {
          // Select category
          iptvState.selectedGroup = cats[iptvState.focusedCat];
          iptvState.focusedCh = 0;
          renderIptv();
          focusIptvChannel(0);
        } else if (iptvState.focusedCol === 1 && channels[iptvState.focusedCh]) {
          playChannel(channels[iptvState.focusedCh]);
        } else if (iptvState.focusedCol === 2 && iptvState.currentChannel) {
          playChannel(iptvState.currentChannel);
        }
        e.preventDefault();
        break;

      case 10009: // Back
        if (iptvState.focusedCol === 2) {
          iptvState.focusedCol = 1;
          renderIptv();
          focusIptvChannel(iptvState.focusedCh);
        } else if (iptvState.focusedCol === 1) {
          iptvState.focusedCol = 0;
          renderIptv();
        } else {
          iptvState.focusedCol = -1;
          clearIptvFocus();
          focusNav(state.focusedNav);
        }
        e.preventDefault();
        break;
    }
  }

  function focusIptvChannel(index) {
    var items = document.querySelectorAll('#iptv-channels .iptv-ch-item');
    if (index >= 0 && index < items.length) {
      items[index].scrollIntoView(false);
    }
  }

  function clearIptvFocus() {
    document.querySelectorAll('.iptv-cat-item.focused, .iptv-ch-item.focused').forEach(function(el) {
      el.classList.remove('focused');
    });
  }

  function updatePreview(ch) {
    if (!ch) return;
    iptvState.currentChannel = ch;
    renderPreview();
    // Start live preview (debounced)
    if (iptvState._previewTimer) clearTimeout(iptvState._previewTimer);
    iptvState._previewTimer = setTimeout(function() {
      startPreview(ch);
    }, 500);
  }

  function handleDetailKeys(code, e) {
    var focusable = [];

    var backBtn = document.getElementById('detail-back-btn');
    if (backBtn) focusable.push(backBtn);

    var playBtn = document.getElementById('detail-play');
    if (playBtn) focusable.push(playBtn);
    var favBtn = document.getElementById('detail-fav-btn');
    if (favBtn) focusable.push(favBtn);

    $detail.querySelectorAll('.detail-tab').forEach(function(t) { focusable.push(t); });

    var seasonSelect = document.getElementById('season-select');
    if (seasonSelect) focusable.push(seasonSelect);

    var activePane = state.detailTab === 'sources' ? '#sources-results' : '#torrent-results';
    var itemClass = state.detailTab === 'sources' ? '.source-item' : '.torrent-item';
    var items = $detail.querySelectorAll(activePane + ' ' + itemClass);
    for (var i = 0; i < items.length; i++) focusable.push(items[i]);

    var focused = document.querySelector('#detail .focused');
    var currentIndex = -1;
    if (focused) {
      for (var j = 0; j < focusable.length; j++) {
        if (focusable[j] === focused) { currentIndex = j; break; }
      }
    }

    var isSelect = focused && focused.tagName === 'SELECT';

    switch (code) {
      case 10009: // Back
        $detail.classList.add('hidden');
        setTimeout(function() { var c = document.querySelector('.card.focused'); if (c) c.focus(); }, 100);
        e.preventDefault();
        break;
      case 38: // Up
        if (!isSelect && currentIndex > 0) focusDetailItem(focusable, currentIndex, currentIndex - 1);
        if (!isSelect) e.preventDefault();
        break;
      case 40: // Down
        if (!isSelect && currentIndex < focusable.length - 1) focusDetailItem(focusable, currentIndex, currentIndex + 1);
        if (!isSelect) e.preventDefault();
        break;
      case 37: // Left
        if (focused && focused.classList.contains('detail-tab')) {
          var prev = focused.previousElementSibling;
          if (prev && prev.classList.contains('detail-tab')) { prev.click(); prev.focus(); }
        }
        e.preventDefault();
        break;
      case 39: // Right
        if (focused && focused.classList.contains('detail-tab')) {
          var next = focused.nextElementSibling;
          if (next && next.classList.contains('detail-tab')) { next.click(); next.focus(); }
        }
        e.preventDefault();
        break;
      case 13: // Enter
        if (focused) focused.click();
        e.preventDefault();
        break;
    }
  }

  // Scroll helper — center element in viewport
  function scrollToCenter(el) {
    if (!el) return;
    var content = document.getElementById('content');
    if (!content) return;
    var elTop = el.offsetTop;
    var elH = el.offsetHeight;
    var contentH = content.clientHeight;
    content.scrollTop = elTop - (contentH / 2) + (elH / 2);
  }

  function focusDetailItem(list, fromIndex, toIndex) {
    if (fromIndex >= 0 && fromIndex < list.length) list[fromIndex].classList.remove('focused');
    list[toIndex].classList.add('focused');
    list[toIndex].focus();
    scrollToCenter(list[toIndex]);
  }

  // Nav focus
  function focusNav(index) {
    var btns = document.querySelectorAll('.nav-btn');
    if (index < 0 || index >= btns.length) return;
    clearNavFocus();
    state.focusedNav = index;
    btns[index].classList.add('focused');
    btns[index].focus();
  }

  function focusNavDelta(delta) {
    var btns = document.querySelectorAll('.nav-btn');
    var newIndex = state.focusedNav + delta;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= btns.length) newIndex = btns.length - 1;
    focusNav(newIndex);
  }

  function clearNavFocus() {
    document.querySelectorAll('.nav-btn').forEach(function(b) { b.classList.remove('focused'); });
  }

  // Card focus
  function focusCard(index) {
    var cards = getVisibleCards();
    if (cards.length === 0) return;
    clearCardFocus();
    index = Math.max(0, Math.min(index, cards.length - 1));
    state.focusedCard = index;
    cards[index].classList.add('focused');
    scrollToCenter(cards[index]);
    cards[index].focus();
  }

  function focusCardDelta(delta) {
    var cards = getVisibleCards();
    if (cards.length === 0) return;
    var newIndex = (state.focusedCard === null) ? 0 : state.focusedCard + delta;
    newIndex = Math.max(0, Math.min(newIndex, cards.length - 1));
    focusCard(newIndex);
  }

  function focusCardUp() {
    var cards = getVisibleCards();
    if (cards.length === 0 || state.focusedCard === null) return false;
    var current = cards[state.focusedCard];
    var currentRect = current.getBoundingClientRect();
    var bestIndex = -1;
    var bestDist = Infinity;

    for (var i = 0; i < cards.length; i++) {
      if (i === state.focusedCard) continue;
      var rect = cards[i].getBoundingClientRect();
      if (rect.bottom > currentRect.top) continue;
      var hDist = Math.abs(rect.left - currentRect.left);
      if (hDist > 50) continue;
      var vDist = currentRect.top - rect.bottom;
      if (vDist < bestDist) { bestDist = vDist; bestIndex = i; }
    }

    if (bestIndex >= 0) {
      clearCardFocus();
      state.focusedCard = bestIndex;
      cards[bestIndex].classList.add('focused');
      scrollToCenter(cards[bestIndex]);
      cards[bestIndex].focus();
      return true;
    }
    return false;
  }

  function focusCardDown() {
    var cards = getVisibleCards();
    if (cards.length === 0 || state.focusedCard === null) return;
    var current = cards[state.focusedCard];
    var currentRect = current.getBoundingClientRect();
    var bestIndex = -1;
    var bestDist = Infinity;

    for (var i = 0; i < cards.length; i++) {
      if (i === state.focusedCard) continue;
      var rect = cards[i].getBoundingClientRect();
      if (rect.top < currentRect.bottom) continue;
      var hDist = Math.abs(rect.left - currentRect.left);
      if (hDist > 50) continue;
      var vDist = rect.top - currentRect.bottom;
      if (vDist < bestDist) { bestDist = vDist; bestIndex = i; }
    }

    if (bestIndex >= 0) {
      clearCardFocus();
      state.focusedCard = bestIndex;
      cards[bestIndex].classList.add('focused');
      scrollToCenter(cards[bestIndex]);
      cards[bestIndex].focus();
    }
  }

  function clearCardFocus() {
    document.querySelectorAll('.card, .iptv-channel').forEach(function(c) { c.classList.remove('focused'); });
  }

  function getVisibleCards() {
    var nodes = document.querySelectorAll('#sec-' + state.section + ' .card, #sec-' + state.section + ' .iptv-channel');
    var arr = [];
    for (var i = 0; i < nodes.length; i++) arr.push(nodes[i]);
    return arr;
  }

  function selectFocused() {
    var focused = document.querySelector('.focused');
    if (focused) focused.click();
  }

  // ========== API Helpers ==========
  function apiFetch(path, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', API + path, true);
    xhr.timeout = 10000;
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
    xhr.timeout = 10000;
    xhr.setRequestHeader('Content-Type', 'application/json');
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

  // ========== Utilities ==========
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
