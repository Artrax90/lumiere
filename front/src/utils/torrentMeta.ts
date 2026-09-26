export interface TorrentMetaBadge {
  text: string;
  type:
    | 'fmt'
    | 'res-4k'
    | 'res-1080'
    | 'res-720'
    | 'res-sd'
    | 'hdr-dv'
    | 'hdr'
    | 'codec'
    | 'color'
    | 'qual'
    | 'qual-cam'
    | 'audio-atmos'
    | 'audio'
    | 'dub'
    | 'lang'
    | 'year'
    | 'pack';
}

/**
 * Parses torrent title string into structured metadata badges (container, resolution, HDR, codec, etc.)
 */
export function parseTorrentMeta(str: string): TorrentMetaBadge[] {
  if (!str) return [];
  const tags: TorrentMetaBadge[] = [];
  const s = str.toUpperCase();

  // 1. Container / File Format (.mkv, .avi, .mp4, etc.)
  if (/\.MKV\b|\[MKV\]|\bMKV\b/.test(s)) {
    tags.push({ text: '.MKV', type: 'fmt' });
  } else if (/\.AVI\b|\[AVI\]|\bAVI\b|\b(XVID|DIVX)\b/.test(s)) {
    tags.push({ text: '.AVI', type: 'fmt' });
  } else if (/\.MP4\b|\[MP4\]|\bMP4\b/.test(s)) {
    tags.push({ text: '.MP4', type: 'fmt' });
  } else if (/\.TS\b|\[TS\]|\bM2TS\b|\bBDMV\b/.test(s)) {
    tags.push({ text: '.TS', type: 'fmt' });
  } else if (/\.MOV\b|\bMOV\b/.test(s)) {
    tags.push({ text: '.MOV', type: 'fmt' });
  } else if (/\b(SATRIP|TVRIP|IPTVRIP)\b/.test(s) && !/\b(AVC|H\.?264|1080P|720P)\b/.test(s)) {
    tags.push({ text: '.AVI', type: 'fmt' });
  }

  // 2. Resolution
  if (/\b(4K|UHD|2160P)\b/.test(s)) {
    tags.push({ text: '4K UHD', type: 'res-4k' });
  } else if (/\b(1080P|1080I|FHD|FULL[\s._-]?HD)\b/.test(s)) {
    tags.push({ text: '1080p', type: 'res-1080' });
  } else if (/\b(720P|HD)\b/.test(s)) {
    tags.push({ text: '720p', type: 'res-720' });
  } else if (/\b(480P|576P|SD|SATRIP|TVRIP|DVDRIP|IPTVRIP)\b/.test(s)) {
    tags.push({ text: 'SD', type: 'res-sd' });
  }

  // 3. Video HDR / Dynamic Range
  if (/\b(DV|DOLBY[\s._-]?VISION)\b/.test(s)) tags.push({ text: 'Dolby Vision', type: 'hdr-dv' });
  else if (/\bHDR10\+\b/.test(s)) tags.push({ text: 'HDR10+', type: 'hdr' });
  else if (/\b(HDR10|HDR)\b/.test(s)) tags.push({ text: 'HDR', type: 'hdr' });

  // 4. Codec
  if (/\b(HEVC|H\.?265|X265)\b/.test(s)) tags.push({ text: 'HEVC', type: 'codec' });
  else if (/\b(AVC|H\.?264|X264)\b/.test(s)) tags.push({ text: 'H.264', type: 'codec' });
  else if (/\bAV1\b/.test(s)) tags.push({ text: 'AV1', type: 'codec' });
  else if (/\b(XVID|DIVX)\b/.test(s)) tags.push({ text: 'XviD', type: 'codec' });

  // 5. Color bit depth
  if (/\b(10-?BIT|10BIT|HI10P)\b/.test(s)) tags.push({ text: '10-bit', type: 'color' });

  // 6. Rip / Release Quality
  if (/\b(REMUX|BD-REMUX|BDREMUX)\b/.test(s)) tags.push({ text: 'Remux', type: 'qual' });
  else if (/\b(BDRIP|BRRIP|BLURAY|BLU-RAY)\b/.test(s)) tags.push({ text: 'BDRip', type: 'qual' });
  else if (/\b(WEB-DL|WEBDL|WEB-DLRIP)\b/.test(s)) tags.push({ text: 'WEB-DL', type: 'qual' });
  else if (/\bWEBRIP\b/.test(s)) tags.push({ text: 'WEBRip', type: 'qual' });
  else if (/\b(HDTV|HDTVRIP)\b/.test(s)) tags.push({ text: 'HDTV', type: 'qual' });
  else if (/\b(SATRIP|SAT-RIP)\b/.test(s)) tags.push({ text: 'SATRip', type: 'qual' });
  else if (/\b(TVRIP|TV-RIP|IPTVRIP)\b/.test(s)) tags.push({ text: 'TVRip', type: 'qual' });
  else if (/\b(DVDRIP|DVD9|DVD5|DVD)\b/.test(s)) tags.push({ text: 'DVDRip', type: 'qual' });
  else if (/\b(CAM|CAMRIP|TELESYNC|TELE-SYNC|TS-RIP)\b/.test(s)) tags.push({ text: 'CAM', type: 'qual-cam' });

  // 7. Audio
  if (/\b(ATMOS|DOLBY[\s._-]?ATMOS)\b/.test(s)) tags.push({ text: 'Dolby Atmos', type: 'audio-atmos' });
  if (/\b(DTS-HD[\s._-]?MA|DTS-HD)\b/.test(s)) tags.push({ text: 'DTS-HD', type: 'audio' });
  else if (/\b(DTS-HR|DTS)\b/.test(s)) tags.push({ text: 'DTS', type: 'audio' });
  else if (/\b(AC3|DD5\.?1|DD\+|E-AC3|DOLBY[\s._-]?DIGITAL|5\.1)\b/.test(s)) tags.push({ text: '5.1 Audio', type: 'audio' });
  else if (/\bAAC\b/.test(s)) tags.push({ text: 'AAC', type: 'audio' });

  // 8. Dubbing / Studio tag
  const studioMatch = str.match(/\b(LostFilm|HDRezka|NewStudio|Кубик в кубе|Red Head Sound|AlexFilm|Jaskier|Дубляж|LineFilm|Пифагор|Кравец|Невафильм)\b/i);
  if (studioMatch) {
    tags.push({ text: studioMatch[1], type: 'dub' });
  }

  // 9. Multi-episode packs tag (e.g. 1-10 выпуски, 1-27 выпуски)
  const packMatch = str.match(/\b(\d{1,3}\s*[-–—]\s*\d{1,3}\s*(?:выпуск\w*|сери\w*))/i);
  if (packMatch) {
    tags.push({ text: packMatch[1], type: 'pack' });
  }

  // 10. Language
  if (/\b(РУ|RUS|РУС)\b/.test(s)) {
    tags.push({ text: 'RUS', type: 'lang' });
  } else if (/\b(ENG|АНГЛ)\b/.test(s)) {
    tags.push({ text: 'ENG', type: 'lang' });
  }

  // 11. Release Year (2000-2029)
  const yearMatch = str.match(/\b(20[0-2]\d)\b/);
  if (yearMatch) {
    tags.push({ text: yearMatch[1], type: 'year' });
  }

  return tags;
}

/**
 * Proper Russian pluralization for seeds ("1 сид", "3 сида", "10 сидов")
 */
export function pluralSeeds(n: number): string {
  const abs = Math.abs(Number(n)) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return 'сидов';
  if (d > 1 && d < 5) return 'сида';
  if (d === 1) return 'сид';
  return 'сидов';
}

/**
 * Computes a smart ranking score for a torrent, prioritizing reliable trackers,
 * modern direct-play containers (MKV/MP4), high quality, and penalizing dead releases.
 */
export function scoreTorrent(t: { title?: string; tracker?: string; seeders?: number; magnet?: string }): number {
  if (!t) return 0;
  let score = Number(t.seeders) || 0;
  const title = String(t.title || '').toUpperCase();
  const tracker = String(t.tracker || '').toLowerCase();
  const magnet = String(t.magnet || '');
  const hasTrackers = magnet.includes('&tr=');

  // Real working trackers bonus
  if (tracker.includes('rutracker')) score += 600;
  if (tracker.includes('rutor')) score += 450;
  if (tracker.includes('nnm')) score += 350;
  if (hasTrackers) score += 200;

  // Severe private tracker penalty if without trackers (Kinozal without &tr= has DHT disabled and fails in TorrServer)
  if (tracker.includes('kinozal') && !hasTrackers) {
    score -= 4000;
  }

  // Quality bonus
  if (title.includes('1080P') || title.includes('WEB-DL') || title.includes('BDRIP') || title.includes('REMUX')) score += 300;
  if (title.includes('720P') || title.includes('HDTV')) score += 150;

  // Multi-episode packs bonus (e.g. 1-10 выпуски, 1-27 выпуски)
  if (/\b\d+\s*[-–—]\s*\d+\s*(выпуск|сери)/i.test(title)) score += 350;

  // Native MKV / MP4 container bonus (direct HW playback on TV/browser, 0% CPU on server)
  if (
    title.includes('.MKV') ||
    title.includes('[MKV]') ||
    title.includes('.MP4') ||
    title.includes('[MP4]') ||
    title.includes('HEVC') ||
    title.includes('H.264') ||
    title.includes('AVC')
  ) {
    score += 400;
  }

  // SD / SATRip / AVI penalty (requires server transcoding)
  if (
    title.includes('SATRIP') ||
    title.includes('TVRIP') ||
    title.includes('XVID') ||
    title.includes('DIVX') ||
    title.includes('.AVI') ||
    title.includes('[AVI]')
  ) {
    score -= 600;
  }

  return score;
}

/**
 * Expands titles into smart search queries, handling franchise naming variations (e.g. Comedy Club),
 * transliteration loanwords, and English original titles.
 */
export function getTorrentSmartQueries(title: string | { name?: string; title?: string; originalTitle?: string; logoText?: string }): string[] {
  const rawName = typeof title === 'string' ? title : title?.name || title?.title || '';
  if (!rawName || rawName === '[object Object]') return [];
  const primary = rawName.trim();
  const queries: string[] = [primary];
  const lower = primary.toLowerCase();

  // Franchise expansions
  if (lower.includes('камеди') || lower.includes('comedy')) {
    if (lower.includes('клаб') || lower.includes('club')) {
      ['новый comedy club', 'comedy club', 'новый камеди клаб', 'камеди клаб'].forEach((a) => {
        if (!queries.includes(a)) queries.push(a);
      });
    } else if (lower.includes('вумен') || lower.includes('вуман') || lower.includes('woman')) {
      ['comedy woman', 'камеди вумен', 'камеди вуман'].forEach((a) => {
        if (!queries.includes(a)) queries.push(a);
      });
    } else if (lower.includes('батл') || lower.includes('баттл') || lower.includes('battle')) {
      ['comedy battle', 'камеди баттл', 'comedy батл'].forEach((a) => {
        if (!queries.includes(a)) queries.push(a);
      });
    }
  }

  if (lower.includes('стендап') || lower.includes('стэндап') || lower.includes('stand up') || lower.includes('standup')) {
    ['stand up', 'стендап', 'stand up brand new', 'standup'].forEach((a) => {
      if (!queries.includes(a)) queries.push(a);
    });
  }

  if (lower.includes('импровизаци') || lower.includes('импровизатор')) {
    ['импровизация', 'импровизаторы'].forEach((a) => {
      if (!queries.includes(a)) queries.push(a);
    });
  }

  // Include original title if different
  if (title && typeof title === 'object') {
    if (title.originalTitle && typeof title.originalTitle === 'string') {
      const orig = title.originalTitle.trim();
      if (orig && orig.toLowerCase() !== primary.toLowerCase() && !queries.includes(orig)) {
        queries.push(orig);
      }
    }
    if (title.logoText && typeof title.logoText === 'string') {
      const logo = title.logoText.trim();
      if (logo && logo.toLowerCase() !== primary.toLowerCase() && !queries.includes(logo)) {
        queries.push(logo);
      }
    }
  }

  // Phonetic loanwords mapping
  const loanwords: Record<string, string> = {
    'камеди': 'comedy',
    'клаб': 'club',
    'шоу': 'show',
    'лайв': 'live',
    'батл': 'battle',
    'батлл': 'battle',
    'баттл': 'battle',
    'стэндап': 'standup',
    'стендап': 'standup',
    'бойз': 'boys',
    'герлз': 'girls',
    'пацаны': 'the boys',
  };

  const words = lower.split(/\s+/);
  let hasLoan = false;
  const translated = words.map((w) => {
    const clean = w.replace(/[^\w\u0400-\u04FF]/g, '');
    if (loanwords[clean]) {
      hasLoan = true;
      return loanwords[clean];
    }
    return w;
  });

  if (hasLoan) {
    const tStr = translated.join(' ').trim();
    if (tStr && !queries.includes(tStr)) {
      queries.push(tStr);
    }
  }

  return queries;
}

/**
 * Extracts season information from a torrent title string.
 */
export function getTorrentSeason(title: string): { start?: number; end?: number; single?: number } | null {
  if (!title) return null;
  const t = title.toLowerCase();

  // Range: 'сезоны 1-4' or '1-4 сезон' or 'seasons 1-3'
  const rangeMatch =
    t.match(/(?:сезон[ыа]?|seasons?)\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})/i) ||
    t.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:сезон[ыа]?|seasons?)/i);
  if (rangeMatch) {
    return { start: parseInt(rangeMatch[1], 10), end: parseInt(rangeMatch[2], 10) };
  }

  // 1. '19 сезон' or '19-й сезон' (e.g. '19 сезон: 22 выпуск')
  const m1 = t.match(/(\d{1,2})[-–—\s]*(?:й|-й)?\s*сезон/i);
  if (m1) return { single: parseInt(m1[1], 10) };

  // 2. 'сезон 19' or 'сезон: 19' (make sure there is no preceding number)
  const m2 = t.match(/(?:^|[^\d])сезон\s*[:.]?\s*(\d{1,2})/i);
  if (m2) return { single: parseInt(m2[1], 10) };

  // 3. 'season 4' or 'season: 4'
  const mSeason = t.match(/(?:^|[^\d])season\s*[:.]?\s*(\d{1,2})/i);
  if (mSeason) return { single: parseInt(mSeason[1], 10) };

  // 4. 's01', 's1', 's05e02'
  const mS = t.match(/\bs(\d{1,2})(?:e\d+|\b)/i);
  if (mS) return { single: parseInt(mS[1], 10) };

  // 5. '01x02', '1x2'
  const mX = t.match(/\b(\d{1,2})[xх]\d+\b/i);
  if (mX) return { single: parseInt(mX[1], 10) };

  return null;
}

/**
 * Checks if a torrent title matches a specific season number, supporting season ranges (e.g. "Сезоны 1-4").
 */
export function matchesTorrentSeason(title: string, s: number): boolean {
  if (!title || !s) return true;
  const parsed = getTorrentSeason(title);
  if (!parsed) {
    const t = title.toLowerCase();
    if (t.includes('сезоны 1-') || t.includes('сезон 1-') || t.includes('seasons 1-')) return true;
    return false;
  }
  if (parsed.start !== undefined && parsed.end !== undefined) {
    return s >= parsed.start && s <= parsed.end;
  }
  return parsed.single === s;
}

export interface EpisodeCheckResult {
  matches: boolean;
  score: number;
  exact?: boolean;
  range?: boolean;
  mismatch?: boolean;
  general?: boolean;
}

/**
 * Evaluates whether a torrent release matches a specific episode of a given season.
 * Gives massive bonuses for exact single-episode releases (e.g. 22x13 for ep 13).
 */
export function checkTorrentEpisode(torrentTitle: string, seasonNum: number, epNum: number): EpisodeCheckResult {
  if (!torrentTitle || !epNum) return { matches: true, score: 0 };
  const s = torrentTitle.toLowerCase();

  // 1. Single episode exact patterns: e.g. 22x13, 22х13, s22e13, s22.e13
  const singleEpReg = new RegExp('(?:\\b0?' + seasonNum + '[xх]|s0?' + seasonNum + '[._\\-\\s]*e)0?(\\d{1,3})\\b', 'i');
  const mSingle = s.match(singleEpReg);
  if (mSingle) {
    const foundEp = parseInt(mSingle[1], 10);
    if (foundEp === epNum) return { matches: true, score: 1000, exact: true };
    return { matches: false, score: -1000, mismatch: true };
  }

  // 2. Single episode in Russian: '22 сезон: 8 выпуск', '22 сезон 13 выпуск', '13 выпуск'
  const singleRuReg = new RegExp('(?:сезон[а-я]*\\s*[:]?\\s*0?' + seasonNum + '[\\s,;:]*)?(?:сери[яий]|выпуск|эпизод|ep\\.?)\\s*[:]?\\s*0?(\\d{1,3})\\b', 'i');
  const mRu = s.match(singleRuReg);
  if (mRu && !s.match(new RegExp('\\b' + mRu[1] + '\\s*[-–—]\\s*\\d+', 'i'))) {
    const foundRuEp = parseInt(mRu[1], 10);
    if (foundRuEp === epNum) return { matches: true, score: 1000, exact: true };
    if (s.includes('сезон') || s.includes('season')) {
      return { matches: false, score: -1000, mismatch: true };
    }
  }

  // 3. Episode range: 22x01-11, 22х01-15, s22e01-10
  const rangeReg = new RegExp('(?:\\b0?' + seasonNum + '[xх]|s0?' + seasonNum + '[._\\-\\s]*e)\\s*0?(\\d{1,3})\\s*[-–—]\\s*0?(\\d{1,3})\\b', 'i');
  const mRange = s.match(rangeReg);
  if (mRange) {
    const startEp = parseInt(mRange[1], 10);
    const endEp = parseInt(mRange[2], 10);
    if (epNum >= startEp && epNum <= endEp) return { matches: true, score: 500, range: true };
    return { matches: false, score: -1000, range: true };
  }

  // 4. Episode range in Russian: '1-10 выпуски', '1-10 серии'
  const ruRange = s.match(/\b0?(\d{1,3})\s*[-–—]\s*0?(\d{1,3})\s*(?:выпуск|сери)/i);
  if (ruRange) {
    const rStart = parseInt(ruRange[1], 10);
    const rEnd = parseInt(ruRange[2], 10);
    if (epNum >= rStart && epNum <= rEnd) return { matches: true, score: 500, range: true };
    return { matches: false, score: -1000, range: true };
  }

  // 5. General season pack without explicit episode numbers (e.g. "Сезон 22")
  return { matches: true, score: 100, general: true };
}

/**
 * Extracts episode number from a video filename, supporting S01E05, 01x05, "Серия 5", "5 выпуск".
 */
export function extractEpisodeNumber(fileName: string, fallbackIndex = 0, seasonNum?: number): number {
  if (!fileName) return fallbackIndex + 1;
  const s = fileName.toLowerCase();

  // S01E05 or S1E5 or s01.e05
  let m = s.match(/[sS]\d{1,2}[._\-\s]*[eE](\d{1,3})\b/);
  if (m) return parseInt(m[1], 10);

  // 01x05 or 1x5 or 01х05
  m = s.match(/\b\d{1,2}[xх](\d{1,3})\b/);
  if (m) return parseInt(m[1], 10);

  // Explicit "серия 5", "эпизод 5", "выпуск 5", "ep. 5", "ep5"
  m = s.match(/(?:сери[яий]|эпизод|серия:|эпизод:|выпуск|выпуск:|ep\.?|episode\.?)\s*[:]?\s*(\d{1,3})\b/i);
  if (m) return parseInt(m[1], 10);

  // "5 серия", "05 серия", "13 выпуск"
  m = s.match(/\b(\d{1,3})\s*(?:сери[яий]|эпизод|выпуск|ep|episode)\b/i);
  if (m) return parseInt(m[1], 10);

  // Match season-episode pattern like "22-13", "22.13", "22_13"
  if (seasonNum != null) {
    const sPadded = seasonNum < 10 ? '0' + seasonNum : '' + seasonNum;
    const seReg = new RegExp('(?:^|[^\\d])(?:0?' + seasonNum + '|' + sPadded + ')[-._](\\d{1,3})(?:[^\\d]|$)');
    m = s.match(seReg);
    if (m) return parseInt(m[1], 10);
  }

  // Leading number in file name: e.g. "05 - Winter is coming.mkv" or "01. Comedy Club..."
  // Avoid 4-digit years like 2026!
  m = s.match(/^(?:\[[^\]]*\]\s*)?(\d{1,3})[\s._\-]/);
  if (m) {
    const val = parseInt(m[1], 10);
    if (val < 200) return val;
  }

  // Number before extension e.g. "Show.05.mkv"
  m = s.match(/[\s._\-](\d{1,2})\.(?:mkv|avi|mp4|ts|m4v)$/);
  if (m) return parseInt(m[1], 10);

  return fallbackIndex + 1;
}
