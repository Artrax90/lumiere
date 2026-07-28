// Lumiere TV — Vanilla JS for Samsung Tizen 5.5
(function() {
  'use strict';

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
  };

  // DOM refs
  var $loading, $app, $topbar, $content, $detail;

  // ========== Init ==========
  document.addEventListener('DOMContentLoaded', function() {
    $loading = document.getElementById('loading');
    $app = document.getElementById('app');
    $topbar = document.getElementById('topbar');
    $content = document.getElementById('content');
    $detail = document.getElementById('detail');

    var server = localStorage.getItem(SERVER_KEY);
    if (server) API = server;

    initAuth();
  });

  // ========== Auth ==========
  function initAuth() {
    apiFetch('/api/setup/status', function(err, data) {
      if (err || !data) {
        showError('Не удалось подключиться к серверу');
        return;
      }
      if (data.needsSetup) {
        showError('Требуется настройка через веб-интерфейс');
        return;
      }

      // Try existing token first
      var token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        apiFetch('/api/user/profile', function(err2, profile) {
          if (profile && profile.id) {
            state.user = profile;
            startApp();
          } else {
            tryLanLogin();
          }
        });
      } else {
        tryLanLogin();
      }
    });
  }

  function tryLanLogin() {
    apiFetch('/api/auth/lan-status', function(err, lanData) {
      if (lanData && lanData.isLan) {
        apiPost('/api/auth/lan-login', {}, function(err2, loginData) {
          if (loginData && loginData.accessToken) {
            localStorage.setItem(TOKEN_KEY, loginData.accessToken);
            state.user = loginData.user;
            startApp();
          } else {
            showError('Не удалось войти. Откройте приложение через браузер.');
          }
        });
      } else {
        showError('Не удалось войти. Откройте приложение через браузер для авторизации.');
      }
    });
  }

  function showError(msg) {
    $loading.innerHTML = '<div class="logo"><div class="dot"></div><span class="logo-text">Lumière</span></div>' +
      '<p style="margin-top:20px;color:rgba(255,255,255,0.5);font-size:14px;max-width:400px;text-align:center;">' + msg + '</p>';
  }

  // ========== App Start ==========
  function startApp() {
    $loading.classList.add('hidden');
    $app.classList.remove('hidden');

    var serverUrlEl = document.getElementById('server-url');
    if (serverUrlEl) serverUrlEl.textContent = API;

    loadData();
    setupNavigation();
    setupKeyboard();

    // Focus first nav button
    setTimeout(function() { focusNav(0); }, 100);
  }

  // ========== Data Loading ==========
  function loadData() {
    apiFetch('/api/movies/trending', function(err, data) {
      if (data && data.results) {
        renderHero(data.results.slice(0, 5));
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

    loadIptv();
  }

  function loadIptv() {
    // First try localStorage
    var playlists = [];
    try { playlists = JSON.parse(localStorage.getItem('lumiere_iptv') || '[]'); } catch(e) {}
    console.log('[IPTV] local playlists:', playlists.length);

    if (playlists.length > 0) {
      loadPlaylist(playlists[0].url);
    }

    // Then try sync API for updated data
    apiFetch('/api/sync', function(err, data) {
      if (err) {
        console.log('[IPTV] sync error:', err);
        return;
      }

      console.log('[IPTV] sync data:', data ? Object.keys(data) : 'null');
      if (data && data.iptvPlaylists && data.iptvPlaylists.length > 0) {
        console.log('[IPTV] server playlists:', data.iptvPlaylists.length);
        localStorage.setItem('lumiere_iptv', JSON.stringify(data.iptvPlaylists));
        // Reload with server data
        loadPlaylist(data.iptvPlaylists[0].url);
      }
    });
  }

  function loadPlaylist(url) {
    console.log('[IPTV] loading playlist:', url);
    apiPost('/api/iptv/parse', { url: url }, function(err, channels) {
      if (err) {
        console.log('[IPTV] parse error:', err);
        return;
      }
      console.log('[IPTV] channels loaded:', channels ? channels.length : 0);
      if (channels && channels.length > 0) {
        state.iptvChannels = channels;
        renderIptv(channels);
      }
    });
  }

  // ========== Rendering ==========
  var heroTitles = [];
  var heroIndex = 0;
  var heroTimer = null;

  function renderHero(titles) {
    if (!titles || titles.length === 0) return;
    heroTitles = titles;
    heroIndex = 0;
    showHero(titles[0]);

    // Rotate every 8 seconds
    if (heroTimer) clearInterval(heroTimer);
    heroTimer = setInterval(function() {
      heroIndex = (heroIndex + 1) % heroTitles.length;
      showHero(heroTitles[heroIndex]);
    }, 8000);
  }

  function showHero(title) {
    var hero = document.getElementById('hero');
    if (!title || !hero) return;
    var bg = title.backdrop || title.poster || '';
    if (bg.indexOf('/') === 0) bg = API + bg;

    hero.style.backgroundImage = 'url(' + bg + ')';
    hero.innerHTML = '<h2 class="hero-title">' + esc(title.name) + '</h2>' +
      '<p class="hero-desc">' + esc(title.description || '') + '</p>';
    hero.setAttribute('data-id', title.id);

    // Make clickable
    hero.onclick = function() { showDetail(title); };
    hero.style.cursor = 'pointer';
  }

  function renderRow(containerId, titles) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    titles.forEach(function(t, i) {
      container.appendChild(createCard(t, i));
    });
  }

  function renderGrid(gridId, titles) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '';
    titles.forEach(function(t, i) {
      grid.appendChild(createCard(t, i));
    });
  }

  function createCard(title, index) {
    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-index', index);
    card.setAttribute('data-id', title.id);

    var imgSrc = title.poster || '';
    if (imgSrc.indexOf('/') === 0) imgSrc = API + imgSrc;

    card.innerHTML = '<img class="card-img" src="' + esc(imgSrc) + '" alt="' + esc(title.name) + '" loading="lazy">' +
      '<div class="card-title">' + esc(title.name) + '</div>';

    card.addEventListener('click', function() {
      showDetail(title);
    });

    return card;
  }

  function renderIptv(channels) {
    var container = document.getElementById('iptv-channels');
    if (!container) return;
    container.innerHTML = '';
    channels.forEach(function(ch, i) {
      var div = document.createElement('div');
      div.className = 'iptv-channel';
      div.setAttribute('data-index', i);
      div.innerHTML = '<div><div class="iptv-name">' + esc(ch.name) + '</div>' +
        '<div class="iptv-group">' + esc(ch.group || '') + '</div></div>';
      div.addEventListener('click', function() {
        // Open player page for IPTV
        var playerUrl = '/tv/player.html?url=' + encodeURIComponent(ch.url) + '&title=' + encodeURIComponent(ch.name);
        window.location.href = playerUrl;
      });
      container.appendChild(div);
    });
  }

  // ========== Detail View ==========
  function showDetail(title) {
    $detail.classList.remove('hidden');
    var poster = title.poster || '';
    if (poster.indexOf('/') === 0) poster = API + poster;
    var backdrop = title.backdrop || title.poster || '';
    if (backdrop.indexOf('/') === 0) backdrop = API + backdrop;

    var html = '';

    // Back button
    html += '<button id="detail-back-btn" style="position:absolute;top:16px;left:16px;z-index:10;padding:8px 16px;border:none;border-radius:8px;background:rgba(0,0,0,0.5);color:white;font-size:14px;cursor:pointer;">← Назад</button>';

    // Full-screen hero banner
    html += '<div style="position:relative;width:100%;height:450px;overflow:hidden;background:var(--surface);">';
    html += '<img src="' + esc(backdrop) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">';
    html += '<div style="position:absolute;inset:0;background:linear-gradient(0deg,var(--bg) 0%,transparent 50%)"></div>';
    html += '</div>';

    // Info section overlay
    html += '<div style="position:relative;margin-top:-120px;z-index:2;padding:0 32px;">';

    // Poster + info row
    html += '<div style="display:flex;gap:24px;margin-bottom:24px;">';

    // Poster
    html += '<div style="flex-shrink:0;">';
    html += '<img src="' + esc(poster) + '" style="width:150px;height:225px;object-fit:cover;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);" onerror="this.style.display=\'none\'">';
    html += '</div>';

    // Info
    html += '<div style="flex:1;min-width:0;padding-top:40px;">';
    html += '<h1 style="font-size:28px;font-weight:700;color:white;margin-bottom:10px;">' + esc(title.name) + '</h1>';

    // Meta tags
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">';
    if (title.year) html += '<span style="padding:4px 12px;border-radius:6px;background:var(--surface-2);font-size:13px;color:var(--text-dim);">' + title.year + '</span>';
    if (title.rating) html += '<span style="padding:4px 12px;border-radius:6px;background:rgba(110,231,183,0.15);font-size:13px;color:var(--accent);">★ ' + title.rating + '</span>';
    if (title.genres) {
      title.genres.slice(0, 3).forEach(function(g) {
        html += '<span style="padding:4px 12px;border-radius:6px;background:var(--surface);font-size:13px;color:var(--text-dim);">' + esc(g) + '</span>';
      });
    }
    html += '</div>';

    // Description
    if (title.description) {
      html += '<p style="color:var(--text-dim);font-size:14px;line-height:1.6;max-width:600px;">' + esc(title.description) + '</p>';
    }

    // Cast
    if (title.cast && title.cast.length > 0) {
      html += '<div style="margin-top:14px;">';
      html += '<p style="font-size:12px;color:var(--text-mute);margin-bottom:6px;">Актёры</p>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      title.cast.slice(0, 8).forEach(function(c) {
        html += '<span style="padding:4px 12px;border-radius:6px;background:var(--surface);font-size:12px;color:var(--text-dim);">' + esc(c.name) + '</span>';
      });
      html += '</div></div>';
    }

    html += '</div>';
    html += '</div>';

    // Torrent section
    html += '<div style="margin-top:24px;">';
    html += '<h2 style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:14px;">Торренты</h2>';
    html += '<div id="torrent-results" style="color:var(--text-mute);font-size:14px;">Загрузка...</div>';
    html += '</div>';

    html += '</div>';

    $detail.querySelector('#detail-content').innerHTML = html;

    // Back button handler
    document.getElementById('detail-back-btn').addEventListener('click', function() {
      $detail.classList.add('hidden');
    });

    // Search torrents
    searchTorrents(title);

    // Auto-focus first torrent item after load
    setTimeout(function() {
      var first = document.querySelector('#detail .torrent-item');
      if (first) {
        first.classList.add('focused');
        first.focus();
      }
    }, 1000);
  }

  function searchTorrents(title) {
    var container = document.getElementById('torrent-results');
    if (!container) return;

    apiFetch('/api/torrents/search?q=' + encodeURIComponent(title.name), function(err, data) {
      if (err || !data || !data.results || data.results.length === 0) {
        container.innerHTML = '<p style="color:var(--text-mute);">Торренты не найдены</p>';
        return;
      }

      var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
      data.results.slice(0, 15).forEach(function(torrent, i) {
        html += '<div class="torrent-item" data-index="' + i + '" data-magnet="' + esc(torrent.magnet || '') + '" data-title="' + esc(torrent.title || '') + '" ';
        html += 'style="padding:14px 18px;border-radius:12px;background:var(--surface);border:1px solid var(--border);cursor:pointer;" tabindex="0">';
        html += '<div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:6px;">' + esc(torrent.title || '') + '</div>';
        html += '<div style="display:flex;gap:16px;font-size:12px;color:var(--text-mute);">';
        if (torrent.size) html += '<span>' + esc(torrent.size) + '</span>';
        if (torrent.seeds != null) html += '<span style="color:var(--accent);">Seeds: ' + torrent.seeds + '</span>';
        if (torrent.peers != null) html += '<span>Peers: ' + torrent.peers + '</span>';
        html += '</div></div>';
      });
      html += '</div>';
      container.innerHTML = html;

      // Click handlers for torrents
      container.querySelectorAll('.torrent-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var magnet = item.getAttribute('data-magnet');
          var torrentTitle = item.getAttribute('data-title');
          if (magnet) {
            openTorrent(magnet, torrentTitle);
          }
        });
      });
    });
  }

  function openTorrent(magnet, title) {
    // Step 1: Add torrent to TorrServer and get stream URL
    apiPost('/api/torrents/stream', { magnet: magnet, title: title }, function(err, data) {
      if (err || !data) {
        console.log('[Torrent] stream error:', err);
        // Try direct magnet link as fallback
        var playerUrl = '/tv/player.html?url=' + encodeURIComponent(magnet) + '&title=' + encodeURIComponent(title);
        window.location.href = playerUrl;
        return;
      }

      var streamUrl = data.streamUrl;
      if (streamUrl) {
        // Make URL absolute if relative
        if (streamUrl.indexOf('/') === 0) streamUrl = API + streamUrl;

        // Open player page
        var playerUrl = '/tv/player.html?url=' + encodeURIComponent(streamUrl) + '&title=' + encodeURIComponent(title);
        window.location.href = playerUrl;
      } else if (data.files && data.files.length > 0) {
        // Multiple files — show file selector
        showFileSelector(data.files, title);
      } else {
        console.log('[Torrent] No stream URL or files returned');
      }
    });
  }

  function showFileSelector(files, title) {
    var html = '<div style="padding:20px;">';
    html += '<h2 style="font-size:18px;font-weight:600;color:var(--text);margin-bottom:16px;">Выберите файл</h2>';
    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    files.forEach(function(file, i) {
      html += '<div class="file-item" data-url="' + esc(file.streamUrl || '') + '" data-name="' + esc(file.name || '') + '" ';
      html += 'style="padding:14px 18px;border-radius:12px;background:var(--surface);border:1px solid var(--border);cursor:pointer;" tabindex="0">';
      html += '<div style="font-size:14px;color:var(--text);">' + esc(file.name || 'Файл ' + (i + 1)) + '</div>';
      if (file.size) html += '<div style="font-size:12px;color:var(--text-mute);margin-top:4px;">' + esc(file.size) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';

    $detail.querySelector('#detail-content').innerHTML = html;

    // Click handlers
    $detail.querySelectorAll('.file-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var url = item.getAttribute('data-url');
        var name = item.getAttribute('data-name');
        if (url) {
          if (url.indexOf('/') === 0) url = API + url;
          window.location.href = '/tv/player.html?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(name || title);
        }
      });
    });
  }

  // ========== Player (handled by separate player.html) ==========

  // ========== Navigation ==========
  function setupNavigation() {
    var navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var section = btn.getAttribute('data-section');
        switchSection(section);
      });
    });

    var backBtn = document.getElementById('detail-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        $detail.classList.add('hidden');
      });
    }

    var changeServerBtn = document.getElementById('btn-change-server');
    if (changeServerBtn) {
      changeServerBtn.addEventListener('click', function() {
        localStorage.removeItem(SERVER_KEY);
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
  function setupKeyboard() {
    document.addEventListener('keydown', function(e) {
      var code = e.keyCode;

      // Detail view
      if (!$detail.classList.contains('hidden')) {
        handleDetailKeys(code, e);
        return;
      }

      // Main app
      handleMainKeys(code, e);
    });
  }

  function handleMainKeys(code, e) {
    var isOnNav = document.querySelector('.nav-btn.focused') !== null;
    var isOnCard = document.querySelector('.card.focused, .iptv-channel.focused') !== null;

    switch (code) {
      case 37: // Left
        if (isOnNav) {
          focusNavDelta(-1);
        } else if (isOnCard) {
          focusCardDelta(-1);
        }
        e.preventDefault();
        break;
      case 39: // Right
        if (isOnNav) {
          focusNavDelta(1);
        } else if (isOnCard) {
          focusCardDelta(1);
        }
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
          state.focusedCard = 0;
          focusCard(0);
        } else if (isOnCard) {
          focusCardDown();
        }
        e.preventDefault();
        break;
      case 13: // Enter
        selectFocused();
        e.preventDefault();
        break;
      case 10009: // Back
        try { tizen.application.getCurrentApplication().exit(); } catch(ex) {}
        e.preventDefault();
        break;
    }
  }

  function handleDetailKeys(code, e) {
    var focused = document.querySelector('#detail .focused');
    var items = document.querySelectorAll('#detail .torrent-item');
    var itemsArr = [];
    for (var i = 0; i < items.length; i++) itemsArr.push(items[i]);
    var currentIndex = focused ? itemsArr.indexOf(focused) : -1;

    switch (code) {
      case 10009: // Back
        $detail.classList.add('hidden');
        e.preventDefault();
        break;
      case 38: // Up
        if (currentIndex > 0) {
          itemsArr[currentIndex].classList.remove('focused');
          itemsArr[currentIndex - 1].classList.add('focused');
          itemsArr[currentIndex - 1].focus();
          itemsArr[currentIndex - 1].scrollIntoView({ block: 'nearest' });
        }
        e.preventDefault();
        break;
      case 40: // Down
        if (currentIndex === -1 && itemsArr.length > 0) {
          // No focus yet — focus first item
          itemsArr[0].classList.add('focused');
          itemsArr[0].focus();
        } else if (currentIndex < itemsArr.length - 1) {
          itemsArr[currentIndex].classList.remove('focused');
          itemsArr[currentIndex + 1].classList.add('focused');
          itemsArr[currentIndex + 1].focus();
          itemsArr[currentIndex + 1].scrollIntoView({ block: 'nearest' });
        }
        e.preventDefault();
        break;
      case 13: // Enter
        if (focused && focused.classList.contains('torrent-item')) {
          focused.click();
        } else {
          var playBtn = document.getElementById('detail-play');
          if (playBtn) playBtn.click();
        }
        e.preventDefault();
        break;
    }
  }

  // Player keys handled by separate player.html

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
    document.querySelectorAll('.nav-btn').forEach(function(b) {
      b.classList.remove('focused');
    });
  }

  function focusCard(index) {
    var cards = getVisibleCards();
    if (cards.length === 0) return;

    clearCardFocus();
    index = Math.max(0, Math.min(index, cards.length - 1));
    state.focusedCard = index;

    cards[index].classList.add('focused');
    cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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

    // Try to move up by finding a card in the same column but previous row
    var current = cards[state.focusedCard];
    var currentRect = current.getBoundingClientRect();
    var bestIndex = -1;
    var bestDist = Infinity;

    for (var i = 0; i < cards.length; i++) {
      if (i === state.focusedCard) continue;
      var rect = cards[i].getBoundingClientRect();
      // Must be above current
      if (rect.bottom > currentRect.top) continue;
      // Must be roughly in same column (within 50px horizontal)
      var hDist = Math.abs(rect.left - currentRect.left);
      if (hDist > 50) continue;
      // Pick closest vertically
      var vDist = currentRect.top - rect.bottom;
      if (vDist < bestDist) {
        bestDist = vDist;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      clearCardFocus();
      state.focusedCard = bestIndex;
      cards[bestIndex].classList.add('focused');
      cards[bestIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      // Must be below current
      if (rect.top < currentRect.bottom) continue;
      // Must be roughly in same column
      var hDist = Math.abs(rect.left - currentRect.left);
      if (hDist > 50) continue;
      var vDist = rect.top - currentRect.bottom;
      if (vDist < bestDist) {
        bestDist = vDist;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      clearCardFocus();
      state.focusedCard = bestIndex;
      cards[bestIndex].classList.add('focused');
      cards[bestIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      cards[bestIndex].focus();
    }
  }

  function clearCardFocus() {
    document.querySelectorAll('.card, .iptv-channel').forEach(function(c) {
      c.classList.remove('focused');
    });
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
      } else {
        callback(new Error('HTTP ' + xhr.status), null);
      }
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
      } else {
        callback(new Error('HTTP ' + xhr.status), null);
      }
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

  function padZero(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = Math.floor(s % 60);
    if (h > 0) return h + ':' + padZero(m) + ':' + padZero(sec);
    return m + ':' + padZero(sec);
  }
})();
