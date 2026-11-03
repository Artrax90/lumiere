package com.lumiere.tv.ui.components

object TorrentMetaParser {

    data class ParsedTorrentMeta(
        val resolution: String?,
        val hdr: String?,
        val ripType: String?,
        val codec: String?,
        val voices: List<String>,
        val audioFormat: String?,
        val subtitles: String?
    )

    private val STUDIOS = listOf(
        "LostFilm", "HDRezka", "Rezka", "Кубик в кубе", "Red Head Sound", "RHS",
        "AlexFilm", "NewStudio", "Jaskier", "LineFilm", "Пифагор", "Кравец", "Kravec",
        "Невафильм", "Flarrow Films", "TVShows", "RuDub", "ColdFilm", "Кураж-Бамбей",
        "AniLibria", "AniDUB", "SHIZA Project", "Гоблин", "Сербин", "Пучков",
        "Колобок", "Синема УС", "Cinema US", "Кириллица", "СВ-Дубль", "Мосфильм",
        "BaibaKo", "Good People", "Octopus", "SoftBox", "Steponee", "AniStar",
        "AniMedia", "IdeaFilm", "ViruseProject", "Kerob", "MovieDalen", "ELEKTRI4KA"
    )

    fun parse(title: String, rawAudio: String? = null, rawQuality: String? = null): ParsedTorrentMeta {
        val combined = "$title ${rawAudio.orEmpty()} ${rawQuality.orEmpty()}".lowercase()
        val original = "$title ${rawAudio.orEmpty()} ${rawQuality.orEmpty()}"

        // 1. Resolution
        val res = when {
            combined.contains("2160p") || combined.contains("4k") || combined.contains("uhd") -> "4K UHD"
            combined.contains("1080p") || combined.contains("1080i") || combined.contains("fhd") -> "1080p"
            combined.contains("720p") || combined.contains("hd") -> "720p"
            combined.contains("576p") || combined.contains("480p") || combined.contains("sd") -> "SD"
            else -> rawQuality ?: "1080p"
        }

        // 2. HDR / Dolby Vision
        val hdr = when {
            combined.contains("dolby vision") || combined.contains("dovi") || combined.contains(" dv ") || combined.contains(".dv.") || combined.contains("dv-hevc") -> "Dolby Vision"
            combined.contains("hdr10+") || combined.contains("hdr10plus") -> "HDR10+"
            combined.contains("hdr10") || combined.contains("hdr") -> "HDR"
            else -> null
        }

        // 3. Rip Type / Quality
        val rip = when {
            combined.contains("remux") -> "Remux"
            combined.contains("web-dl") || combined.contains("webdl") -> "WEB-DL"
            combined.contains("web-rip") || combined.contains("webrip") -> "WEBRip"
            combined.contains("bdrip") || combined.contains("brrip") -> "BDRip"
            combined.contains("bluray") || combined.contains("blu-ray") -> "BluRay"
            combined.contains("hdtv") -> "HDTV"
            combined.contains("dvdrip") -> "DVDRip"
            else -> null
        }

        // 4. Video Codec & Color
        val codec = when {
            combined.contains("hevc") || combined.contains("x265") || combined.contains("h.265") || combined.contains("h265") -> {
                if (combined.contains("10bit") || combined.contains("10-bit")) "HEVC 10-bit" else "HEVC"
            }
            combined.contains("avc") || combined.contains("x264") || combined.contains("h.264") || combined.contains("h264") -> "AVC / x264"
            combined.contains("av1") -> "AV1"
            combined.contains("10bit") || combined.contains("10-bit") -> "10-bit"
            else -> null
        }

        // 5. Voiceover & Dubbing Studios
        val voices = mutableListOf<String>()

        if (Regex("""\b(дубляж|дублированный|dub|пд)\b""", RegexOption.IGNORE_CASE).containsMatchIn(combined)) {
            voices.add("Дубляж")
        }
        if (Regex("""\b(mvo|мво|многоголосый|пм)\b""", RegexOption.IGNORE_CASE).containsMatchIn(combined)) {
            voices.add("MVO")
        }
        if (Regex("""\b(dvo|дво|двуголосый)\b""", RegexOption.IGNORE_CASE).containsMatchIn(combined)) {
            voices.add("DVO")
        }
        if (Regex("""\b(avo|аво|одноголосый|авторский|lvo)\b""", RegexOption.IGNORE_CASE).containsMatchIn(combined)) {
            voices.add("AVO")
        }

        // Detect known studios
        for (st in STUDIOS) {
            val reg = Regex("""(?i)(^|[^a-zA-Zа-яА-Я0-9_])${Regex.escape(st)}([^a-zA-Zа-яА-Я0-9_]|$)""")
            if (reg.containsMatchIn(original)) {
                if (!voices.contains(st)) {
                    voices.add(st)
                }
            }
        }

        // 6. Audio format & channels
        val audioFormat = when {
            combined.contains("atmos") -> "Dolby Atmos"
            combined.contains("7.1") -> "7.1 Audio"
            combined.contains("5.1") -> "5.1 Audio"
            combined.contains("dts-hd") -> "DTS-HD"
            combined.contains("dts") -> "DTS"
            combined.contains("eac3") || combined.contains("ddp") || combined.contains("dd+") -> "E-AC3"
            combined.contains("ac3") || combined.contains("dd") -> "AC3"
            else -> null
        }

        // 7. Subtitles
        val subs = if (Regex("""\b(субтитры|subs|sub)\b""", RegexOption.IGNORE_CASE).containsMatchIn(combined)) {
            "СУБ"
        } else null

        return ParsedTorrentMeta(
            resolution = res,
            hdr = hdr,
            ripType = rip,
            codec = codec,
            voices = voices.distinct(),
            audioFormat = audioFormat,
            subtitles = subs
        )
    }

    fun formatSize(bytes: Long): String {
        if (bytes <= 0) return ""
        val gb = bytes.toDouble() / (1024 * 1024 * 1024)
        return if (gb >= 1.0) {
            String.format(java.util.Locale.US, "%.1f ГБ", gb)
        } else {
            val mb = bytes.toDouble() / (1024 * 1024)
            String.format(java.util.Locale.US, "%.0f МБ", mb)
        }
    }

    fun formatSizeSmart(sizeFormatted: String?, sizeBytes: Long?, rawSize: String?): String {
        // 1. If backend already supplied sizeFormatted (e.g. "2.4 GB" or "850 MB" or "1.5 ГБ")
        if (!sizeFormatted.isNullOrBlank()) {
            return sizeFormatted
                .replace("GB", "ГБ", ignoreCase = true)
                .replace("MB", "МБ", ignoreCase = true)
                .replace("KB", "КБ", ignoreCase = true)
                .replace("TB", "ТБ", ignoreCase = true)
        }

        // 2. If sizeBytes numeric long is supplied
        if (sizeBytes != null && sizeBytes > 0) {
            return formatSize(sizeBytes)
        }

        // 3. If rawSize string is supplied (could be "2456789012", "1450234 KB", "2.4 GB", etc.)
        if (!rawSize.isNullOrBlank()) {
            val trimmed = rawSize.trim()

            // If already formatted with unit
            if (trimmed.contains("гб", ignoreCase = true) || trimmed.contains("gb", ignoreCase = true) ||
                trimmed.contains("мб", ignoreCase = true) || trimmed.contains("mb", ignoreCase = true) ||
                trimmed.contains("тб", ignoreCase = true) || trimmed.contains("tb", ignoreCase = true)) {
                return trimmed
                    .replace("GB", "ГБ", ignoreCase = true)
                    .replace("MB", "МБ", ignoreCase = true)
                    .replace("TB", "ТБ", ignoreCase = true)
            }

            // Check if formatted like "123456 KB" or "123456 КБ"
            val kbMatch = Regex("""^([\d.,]+)\s*(?:кб|kb)$""", RegexOption.IGNORE_CASE).find(trimmed)
            if (kbMatch != null) {
                val num = kbMatch.groups[1]?.value?.replace(',', '.')?.toDoubleOrNull() ?: 0.0
                val bytes = (num * 1024).toLong()
                return formatSize(bytes)
            }

            // Numeric only string (e.g. "2456789012" bytes, or small number like "2500000" KB)
            val num = trimmed.toLongOrNull()
            if (num != null && num > 0) {
                // If larger than 50MB, it's definitely bytes
                return if (num > 50_000_000L) {
                    formatSize(num)
                } else {
                    // Small number, treat as KB
                    formatSize(num * 1024L)
                }
            }
            return trimmed
        }

        return ""
    }

    fun parseSizeBytes(item: com.lumiere.core.model.TorrentItem): Long {
        val sb = item.sizeBytes
        if (sb != null && sb > 0L) return sb
        item.size?.toLongOrNull()?.let { if (it > 0L) return it }
        val formatted = item.sizeFormatted
        if (!formatted.isNullOrBlank()) {
            val clean = formatted.replace(',', '.').trim()
            val match = Regex("""([\d.]+)""").find(clean)
            val num = match?.value?.toDoubleOrNull() ?: 0.0
            val lower = clean.lowercase()
            return when {
                lower.contains("тб") || lower.contains("tb") -> (num * 1024L * 1024L * 1024L * 1024L).toLong()
                lower.contains("гб") || lower.contains("gb") -> (num * 1024L * 1024L * 1024L).toLong()
                lower.contains("мб") || lower.contains("mb") -> (num * 1024L * 1024L).toLong()
                lower.contains("кб") || lower.contains("kb") -> (num * 1024L).toLong()
                else -> num.toLong()
            }
        }
        return 0L
    }

    fun parseTorrentDate(dateStr: String?): Long {
        if (dateStr.isNullOrBlank()) return 0L
        dateStr.toLongOrNull()?.let { return if (it < 10000000000L) it * 1000L else it }
        try {
            return java.time.Instant.parse(dateStr).toEpochMilli()
        } catch (_: Exception) {}
        try {
            return java.time.LocalDateTime.parse(dateStr).atZone(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
        } catch (_: Exception) {}
        val formats = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd",
            "EEE, dd MMM yyyy HH:mm:ss z",
            "EEE, dd MMM yyyy HH:mm:ss Z"
        )
        for (fmt in formats) {
            try {
                val sdf = java.text.SimpleDateFormat(fmt, java.util.Locale.US)
                sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                val parsed = sdf.parse(dateStr)
                if (parsed != null) return parsed.time
            } catch (_: Exception) {}
        }
        return 0L
    }

    fun formatTorrentDate(dateStr: String?): String? {
        val ms = parseTorrentDate(dateStr)
        if (ms <= 0L) return null
        val sdf = java.text.SimpleDateFormat("dd.MM.yyyy", java.util.Locale.getDefault())
        return sdf.format(java.util.Date(ms))
    }

    fun detectMaxSeason(torrents: List<com.lumiere.core.model.TorrentItem>, showYear: Int? = null): Int {
        if (torrents.isEmpty()) return 1
        val seasonCounts = mutableMapOf<Int, Int>()
        val seasonRegexes = listOf(
            Regex("""(\d{1,2})\s*(?:-?й|-ый)?\s*сезон""", RegexOption.IGNORE_CASE),
            Regex("""(?:^|[^\d])сезон\s*[:.]?\s*(\d{1,2})\b(?!\s*выпуск|\s*сери)""", RegexOption.IGNORE_CASE),
            Regex("""(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:сезон|season)""", RegexOption.IGNORE_CASE),
            Regex("""\b[sS]0?(\d{1,2})\b"""),
            Regex("""\[\s*0?(\d{1,2})[xх]\d{1,3}""", RegexOption.IGNORE_CASE),
            Regex("""\b0?(\d{1,2})[xх]\d{1,3}\b""", RegexOption.IGNORE_CASE)
        )

        for (t in torrents) {
            val title = t.title
            for (regex in seasonRegexes) {
                regex.findAll(title).forEach { match ->
                    val s1 = if (match.groupValues.size > 1) match.groupValues[1].toIntOrNull() else null
                    val s2 = if (match.groupValues.size > 2) match.groupValues[2].toIntOrNull() else null
                    if (s1 != null && s1 in 1..40) {
                        seasonCounts[s1] = (seasonCounts[s1] ?: 0) + 1
                    }
                    if (s2 != null && s2 in 1..40) {
                        seasonCounts[s2] = (seasonCounts[s2] ?: 0) + 1
                    }
                }
            }
        }

        var yearMax = 1
        if (showYear != null && showYear >= 1990) {
            val yearRegex = Regex("""[\(\[\/\s\.\-](\d{4})[\)\]\/\s\.\-]""")
            for (t in torrents) {
                yearRegex.find(t.title)?.let { m ->
                    val y = if (m.groupValues.size > 1) m.groupValues[1].toIntOrNull() ?: 0 else 0
                    if (y in showYear..2035 && y != 1080 && y != 2160) {
                        yearMax = maxOf(yearMax, y - showYear + 1)
                    }
                }
            }
        }

        var maxConsecutive = 1
        while ((seasonCounts[maxConsecutive + 1] ?: 0) >= 2 || (maxConsecutive + 1 <= yearMax && (seasonCounts[maxConsecutive + 1] ?: 0) >= 1)) {
            maxConsecutive++
        }
        return maxOf(maxConsecutive, minOf(yearMax, 35))
    }

    fun matchesTorrentSeason(title: String, seasonNum: Int, showYear: Int? = null): Boolean {
        if (title.isBlank() || seasonNum <= 0) return true
        val lower = title.lowercase()

        // 1. Season range e.g. "сезоны 1-4", "1-4 сезон", "seasons 1-3" (excluding episode ranges like "1-8 выпуски")
        val rangeRegex = Regex("""(?:сезон[ыа]?|seasons?)\s*[:.]?\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})(?!\s*выпуск|\s*сери)|(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:сезон[ыа]?|seasons?)|\bs0?(\d{1,2})\s*[-–—]\s*s0?(\d{1,2})\b""", RegexOption.IGNORE_CASE)
        val mRange = rangeRegex.find(lower)
        if (mRange != null) {
            val s1 = (mRange.groupValues.getOrNull(1)?.takeIf { it.isNotBlank() }
                ?: mRange.groupValues.getOrNull(3)?.takeIf { it.isNotBlank() }
                ?: mRange.groupValues.getOrNull(5))?.toIntOrNull() ?: 1
            val s2 = (mRange.groupValues.getOrNull(2)?.takeIf { it.isNotBlank() }
                ?: mRange.groupValues.getOrNull(4)?.takeIf { it.isNotBlank() }
                ?: mRange.groupValues.getOrNull(6))?.toIntOrNull() ?: 1
            return seasonNum in minOf(s1, s2)..maxOf(s1, s2)
        }

        // 2. Explicit single season patterns (Checked BEFORE year correlation):
        val sRegex = Regex(
            """(\d{1,2})\s*(?:-?й|-ый)?\s*сезон|""" +
            """(?:^|[^\d])сезон\s*[:.]?\s*(\d{1,2})\b(?!\s*выпуск|\s*сери)|""" +
            """(?:^|[^\d])season\s*[:.]?\s*(\d{1,2})\b|""" +
            """\[\s*0?(\d{1,2})[xх]\d+|""" +
            """\b0?(\d{1,2})[xх]\d+\b|""" +
            """\b[sS]0?(\d{1,2})(?:[eE]\d+|\b)""",
            RegexOption.IGNORE_CASE
        )
        val mS = sRegex.find(lower)
        if (mS != null) {
            val single = mS.groupValues.drop(1).firstOrNull { it.isNotBlank() }?.toIntOrNull()
            if (single != null) {
                return single == seasonNum
            }
        }

        // 3. Complete series / all seasons
        if (lower.contains("все сезоны") || lower.contains("полный архив") || lower.contains("коллекция") || lower.contains("complete")) {
            return true
        }

        // 4. Year correlation ONLY if no explicit season was specified in the title
        if (showYear != null && showYear >= 1990) {
            val yrRange = Regex("""[\(\[\/\s\.\-](\d{4})\s*[-–—]\s*(\d{4})[\)\]\/\s\.\-]""").find(lower)
            if (yrRange != null) {
                val yStart = yrRange.groupValues.getOrNull(1)?.toIntOrNull() ?: 0
                val yEnd = yrRange.groupValues.getOrNull(2)?.toIntOrNull() ?: 0
                if (yStart in 1990..2035 && yEnd > yStart) {
                    val sStart = maxOf(1, yStart - showYear + 1)
                    val sEnd = maxOf(sStart, yEnd - showYear + 1)
                    if (seasonNum in sStart..sEnd) return true
                }
            }

            val singleYr = Regex("""[\(\[\/\s\.\-](\d{4})[\)\]\/\s\.\-]""").find(lower)
            if (singleYr != null) {
                val y = singleYr.groupValues.getOrNull(1)?.toIntOrNull() ?: 0
                if (y in showYear..2035 && y != 1080 && y != 2160) {
                    val mappedSeason = y - showYear + 1
                    if (mappedSeason == seasonNum) return true
                }
            }
        }

        return seasonNum == 1
    }

    fun checkTorrentEpisode(torrentTitle: String, seasonNum: Int, epNum: Int): Boolean {
        if (torrentTitle.isBlank() || epNum <= 0) return true
        val lower = torrentTitle.lowercase()

        // 1. Range e.g. "s02e01-10", "2x01-08", "[05x01-08]", "05х01-08", "s05e01-e08"
        val rangeRegex = Regex("""(?:\b|\[)(?:0?$seasonNum[xх]|s0?$seasonNum[._\-\s]*e)0?(\d{1,3})\s*[-–—]\s*(?:e|0*)(\d{1,3})\b""", RegexOption.IGNORE_CASE)
        val mRange = rangeRegex.find(lower)
        if (mRange != null) {
            val rStart = mRange.groupValues.getOrNull(1)?.toIntOrNull() ?: 0
            val rEnd = mRange.groupValues.getOrNull(2)?.toIntOrNull() ?: 0
            val minEp = minOf(rStart, rEnd)
            val maxEp = maxOf(rStart, rEnd)
            return epNum in minEp..maxEp
        }

        // 2. Russian range: "1-10 серии", "1-10 выпуск"
        val ruRange = Regex("""\b0?(\d{1,3})\s*[-–—]\s*0?(\d{1,3})\s*(?:выпуск|сери)""", RegexOption.IGNORE_CASE).find(lower)
        if (ruRange != null) {
            val rStart = ruRange.groupValues.getOrNull(1)?.toIntOrNull() ?: 0
            val rEnd = ruRange.groupValues.getOrNull(2)?.toIntOrNull() ?: 0
            return epNum in rStart..rEnd
        }

        // 3. Exact single episode match e.g. "s02e05", "2x05", "s02.e05" (excluding ranges)
        val exactRegex = Regex("""(?:\b0?$seasonNum[xх]|s0?$seasonNum[._\-\s]*e)0?(\d{1,3})(?!\s*[-–—]\s*\d+)\b""", RegexOption.IGNORE_CASE)
        val mExact = exactRegex.find(lower)
        if (mExact != null) {
            return mExact.groupValues.getOrNull(1)?.toIntOrNull() == epNum
        }

        return true
    }

    data class FileMeta(val season: Int?, val episode: Int?)

    fun parseFileMeta(name: String, path: String? = null): FileMeta {
        val cleanName = name.substringAfterLast('/').substringAfterLast('\\')
        val lower = cleanName.lowercase()
        var season: Int? = null
        var episode: Int? = null

        // 1. SxxExx or Sxx.Exx or Sxx_Exx in filename (handles trailing underscores e.g. S01E10_[Kyrazh-Bambej])
        val sxxExx = Regex("""[sS]0?(\d{1,2})[._\-\s]*[eE]0?(\d{1,3})(?=[^0-9]|$)""").find(lower)
        if (sxxExx != null) {
            season = sxxExx.groupValues.getOrNull(1)?.toIntOrNull()
            episode = sxxExx.groupValues.getOrNull(2)?.toIntOrNull()
        }

        // 2. 01x05 or 1x05
        if (episode == null) {
            val nxn = Regex("""(?:^|[^0-9])0?(\d{1,2})[xх]0?(\d{1,3})(?=[^0-9]|$)""").find(lower)
            if (nxn != null) {
                season = nxn.groupValues.getOrNull(1)?.toIntOrNull()
                episode = nxn.groupValues.getOrNull(2)?.toIntOrNull()
            }
        }

        // 3. Check directory structure if season not yet found
        val fullPath = path ?: name
        if (season == null && fullPath.isNotBlank()) {
            val parts = fullPath.split('/', '\\').dropLast(1)
            for (part in parts.reversed()) {
                val folder = part.lowercase()
                if (Regex("""(?:season|сезон)s?\s*0?\d+\s*[-–—]\s*0?\d+""", RegexOption.IGNORE_CASE).containsMatchIn(folder)) {
                    continue
                }
                val sMatch = Regex("""(?:^|[\s._\-])(?:season|сезон|s)[\s._\-]*0?(\d{1,2})(?:[\s._\-]|$|$)""", RegexOption.IGNORE_CASE).find(folder)
                    ?: Regex("""^0?(\d{1,2})\s*(?:-?й|-ый)?\s*(?:сезон|season)$""", RegexOption.IGNORE_CASE).find(folder)
                if (sMatch != null) {
                    season = sMatch.groupValues.getOrNull(1)?.toIntOrNull()
                    if (season != null) break
                }
            }
        }

        // 4. Episode regexes if not yet found
        if (episode == null) {
            Regex("""(?:сери[яий]|эпизод|выпуск|ep\.?|episode\.?)\s*[:]?\s*0?(\d{1,3})(?=[^0-9]|$)""", RegexOption.IGNORE_CASE).find(lower)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let {
                episode = it
            }
        }
        if (episode == null) {
            Regex("""(?:^|[^0-9])0?(\d{1,3})\s*(?:сери[яий]|эпизод|выпуск|ep|episode)(?=[^0-9]|$)""", RegexOption.IGNORE_CASE).find(lower)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let {
                episode = it
            }
        }
        if (episode == null) {
            Regex("""^(?:\[[^\]]*\]\s*)?0?(\d{1,3})[\s._\-]""").find(lower)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let {
                if (it < 700) episode = it
            }
        }
        if (episode == null) {
            Regex("""(?:^|[\s._\-])0?(\d{1,3})\.(?:mkv|avi|mp4|ts|m4v)$""").find(lower)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let {
                if (it < 700) episode = it
            }
        }

        return FileMeta(season, episode)
    }

    fun parseFileMeta(file: com.lumiere.core.model.TorrentFile): FileMeta {
        val pathStr = file.path ?: file.name
        val nameStr = file.name.substringAfterLast('/').substringAfterLast('\\')
        return parseFileMeta(nameStr, pathStr)
    }

    fun findMatchingFile(files: List<com.lumiere.core.model.TorrentFile>, season: Int, episode: Int): com.lumiere.core.model.TorrentFile? {
        if (files.isEmpty()) return null

        val videoExtensions = listOf(".mkv", ".mp4", ".avi", ".ts", ".m4v", ".webm", ".mov")
        val validFiles = files.filter { f ->
            val l = f.name.lowercase()
            videoExtensions.any { l.endsWith(it) } && !l.contains("sample")
        }.ifEmpty { files }

        // Pass 1: exact season and episode match
        for (f in validFiles) {
            val meta = parseFileMeta(f)
            if (meta.season == season && meta.episode == episode) {
                return f
            }
        }

        // Pass 2: If single-season release, match by episode
        val detectedSeasons = validFiles.take(50).mapNotNull { parseFileMeta(it).season }.distinct()
        if (detectedSeasons.size <= 1) {
            for (f in validFiles) {
                val meta = parseFileMeta(f)
                if (meta.episode == episode) {
                    return f
                }
            }
        }

        return null
    }

    fun extractEpisodeNumber(fileName: String, fallbackIndex: Int = 0): Int {
        if (fileName.isBlank()) return fallbackIndex + 1
        val meta = parseFileMeta(fileName)
        return meta.episode ?: (fallbackIndex + 1)
    }
}
