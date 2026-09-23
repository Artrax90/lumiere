/**
 * Lumiere Production Integration Test Suite
 * Validates backend APIs, TorrServer, JacRed, Auth, and Static Delivery.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runSuite() {
  console.log('====================================================');
  console.log(`  Lumiere Test Suite — Testing target: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;
  let token = null;

  async function it(title, fn) {
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      console.log(`  ✓ PASS: ${title} (${duration}ms)`);
      passed++;
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`  ✗ FAIL: ${title} (${duration}ms)`);
      console.error(`    -> Error: ${err.message}\n`);
      failed++;
    }
  }

  // Group 1: Core System
  console.log('[1/5] Core System & Healthchecks:');
  await it('Healthcheck returns status ok', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(`Expected status 'ok', got ${data.status}`);
  });

  await it('TorrServer status is online', async () => {
    const res = await fetch(`${BASE_URL}/api/torrents/torrserver/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.online) throw new Error(`TorrServer is offline at ${data.url}`);
    if (!data.version) throw new Error('Missing TorrServer version');
  });

  await it('JacRed indexer status is online', async () => {
    const res = await fetch(`${BASE_URL}/api/torrents/jacred/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.online) throw new Error(`JacRed is offline at ${data.url}`);
  });

  // Group 2: Authentication
  console.log('\n[2/5] Authentication & Security:');
  await it('Login with credentials or LAN quick-login returns JWT', async () => {
    let res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'local@lumiere', password: 'local' }),
    });
    if (res.ok) {
      const data = await res.json();
      token = data.accessToken;
      return;
    }
    // Fallback: LAN profiles quick-login
    const pRes = await fetch(`${BASE_URL}/api/auth/profiles`);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData.profiles && pData.profiles.length > 0) {
        const qRes = await fetch(`${BASE_URL}/api/auth/quick-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: pData.profiles[0].id }),
        });
        if (qRes.ok) {
          const qData = await qRes.json();
          token = qData.accessToken;
          return;
        }
      }
    }
    throw new Error('Unable to authenticate via login or quick-login');
  });

  await it('Protected profile endpoint validates JWT', async () => {
    const res = await fetch(`${BASE_URL}/api/user/profile`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Profile request failed with HTTP ${res.status}`);
    const data = await res.json();
    if (!data.email || !data.name) throw new Error('User profile data missing');
  });

  await it('Unauthenticated request to protected endpoint is rejected with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/user/profile`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  // Group 3: Media Catalog
  console.log('\n[3/5] TMDB Catalog & Search:');
  await it('Fetch trending movies', async () => {
    const res = await fetch(`${BASE_URL}/api/movies/trending?lang=ru`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length === 0) {
      throw new Error('No movies returned in trending results');
    }
  });

  await it('Search catalog query returns results', async () => {
    const res = await fetch(`${BASE_URL}/api/search?q=Inception&lang=ru`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length === 0) {
      throw new Error('Search query returned empty results');
    }
  });

  // Group 4: Torrent Engine & Streaming
  console.log('\n[4/5] Torrent Search & Streaming Pipeline:');
  let selectedTorrent = null;

  await it('Search torrents via JacRed indexers', async () => {
    const res = await fetch(`${BASE_URL}/api/torrents/search?q=Inception`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.results) || data.results.length === 0) {
      throw new Error('JacRed search returned 0 torrents');
    }
    selectedTorrent = data.results[0];
    if (!selectedTorrent.magnet && !selectedTorrent.link) {
      throw new Error('First torrent missing magnet or download link');
    }
  });

  let streamData = null;
  await it('Open torrent in TorrServer and parse files (POST /api/torrents/stream)', async () => {
    if (!selectedTorrent) throw new Error('No torrent available from previous step');
    const res = await fetch(`${BASE_URL}/api/torrents/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        magnet: selectedTorrent.magnet || selectedTorrent.link,
        title: selectedTorrent.title,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    streamData = await res.json();
    if (!streamData.files || streamData.files.length === 0) {
      throw new Error(`Torrent file list is empty: ${streamData.error || 'unknown'}`);
    }
    const file = streamData.files[0];
    if (!file.streamUrl || !file.directUrl) {
      throw new Error('File item missing streamUrl or directUrl');
    }
  });

  await it('Stream video chunk via direct proxy with Range headers', async () => {
    if (!streamData || !streamData.files || streamData.files.length === 0) {
      throw new Error('No stream data available');
    }
    const directUrl = streamData.files[0].directUrl;
    const fetchUrl = directUrl.startsWith('http') ? directUrl : `${BASE_URL}${directUrl}`;
    const res = await fetch(fetchUrl, {
      headers: { 'Range': 'bytes=0-2048' },
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`Stream proxy returned unexpected status HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type');
    if (!contentType || (!contentType.includes('video') && !contentType.includes('application/octet-stream'))) {
      throw new Error(`Unexpected Content-Type: ${contentType}`);
    }
  });

  // Group 5: Static Client Delivery
  console.log('\n[5/5] Static Client Delivery:');
  await it('Web SPA index.html is served properly', async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('<div id="root"></div>')) {
      throw new Error('Root div not found in served index.html');
    }
  });

  await it('Smart TV SPA (/tv/) is served properly', async () => {
    const res = await fetch(`${BASE_URL}/tv/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('tv.js') && !html.includes('tv.css')) {
      throw new Error('Smart TV assets not referenced in /tv/index.html');
    }
  });

  console.log('\n====================================================');
  console.log(`  Test Results: ${passed} passed, ${failed} failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((e) => {
  console.error('Fatal error running suite:', e);
  process.exit(1);
});
