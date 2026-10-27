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

    fun detectMaxSeason(torrents: List<com.lumiere.core.model.TorrentItem>): Int {
        var maxSeason = 1
        val seasonRegexes = listOf(
            Regex("""(?:сезон[ыа]?|seasons?)\s*[:.]?\s*(\d{1,2})""", RegexOption.IGNORE_CASE),
            Regex("""(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:сезон|season)""", RegexOption.IGNORE_CASE),
            Regex("""(\d{1,2})\s*(?:-?й|-ый)?\s*сезон""", RegexOption.IGNORE_CASE),
            Regex("""\b[sS]0?(\d{1,2})\b"""),
            Regex("""\b(\d{1,2})[xх]\d{1,3}\b""", RegexOption.IGNORE_CASE)
        )
        for (t in torrents) {
            val title = t.title
            for (regex in seasonRegexes) {
                regex.findAll(title).forEach { match ->
                    val s1 = match.groups[1]?.value?.toIntOrNull()
                    val s2 = match.groups.get(2)?.value?.toIntOrNull()
                    if (s1 != null && s1 in 1..40) maxSeason = maxOf(maxSeason, s1)
                    if (s2 != null && s2 in 1..40) maxSeason = maxOf(maxSeason, s2)
                }
            }
        }
        return maxSeason
    }

    fun matchesTorrentSeason(title: String, seasonNum: Int): Boolean {
        if (title.isBlank() || seasonNum <= 0) return true
        val lower = title.lowercase()

        // Season range e.g. "сезоны 1-4", "1-4 сезон"
        val rangeRegex = Regex("""(?:сезон[ыа]?|seasons?)\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})|(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(?:сезон[ыа]?|seasons?)""", RegexOption.IGNORE_CASE)
        val mRange = rangeRegex.find(lower)
        if (mRange != null) {
            val s1 = (mRange.groups[1]?.value ?: mRange.groups[3]?.value)?.toIntOrNull() ?: 1
            val s2 = (mRange.groups[2]?.value ?: mRange.groups[4]?.value)?.toIntOrNull() ?: 1
            return seasonNum in s1..s2
        }

        // Single season e.g. "19 сезон", "сезон 19", "s02", "2x05"
        val sRegex = Regex("""(?:^|[^\d])s0?(\d{1,2})(?:e\d+|\b)|(\d{1,2})[-–—\s]*(?:й|-й)?\s*сезон|(?:^|[^\d])сезон\s*[:.]?\s*(\d{1,2})|(?:^|[^\d])season\s*[:.]?\s*(\d{1,2})|\b(\d{1,2})[xх]\d+\b""", RegexOption.IGNORE_CASE)
        val mS = sRegex.find(lower)
        if (mS != null) {
            val single = (mS.groups[1] ?: mS.groups[2] ?: mS.groups[3] ?: mS.groups[4] ?: mS.groups[5])?.value?.toIntOrNull()
            if (single != null) {
                return single == seasonNum
            }
        }

        if (lower.contains("все сезоны") || lower.contains("полный архив") || lower.contains("коллекция")) {
            return true
        }
        return true
    }

    fun checkTorrentEpisode(torrentTitle: String, seasonNum: Int, epNum: Int): Boolean {
        if (torrentTitle.isBlank() || epNum <= 0) return true
        val lower = torrentTitle.lowercase()

        // Exact match e.g. "s02e05", "2x05", "s02.e05"
        val exactRegex = Regex("""(?:\b0?$seasonNum[xх]|s0?$seasonNum[._\-\s]*e)0?(\d{1,3})\b""", RegexOption.IGNORE_CASE)
        val mExact = exactRegex.find(lower)
        if (mExact != null) {
            return mExact.groups[1]?.value?.toIntOrNull() == epNum
        }

        // Range e.g. "s02e01-10", "2x01-08"
        val rangeRegex = Regex("""(?:\b0?$seasonNum[xх]|s0?$seasonNum[._\-\s]*e)\s*0?(\d{1,3})\s*[-–—]\s*0?(\d{1,3})\b""", RegexOption.IGNORE_CASE)
        val mRange = rangeRegex.find(lower)
        if (mRange != null) {
            val rStart = mRange.groups[1]?.value?.toIntOrNull() ?: 0
            val rEnd = mRange.groups[2]?.value?.toIntOrNull() ?: 0
            return epNum in rStart..rEnd
        }

        // Russian range: "1-10 серии", "1-10 выпуск"
        val ruRange = Regex("""\b0?(\d{1,3})\s*[-–—]\s*0?(\d{1,3})\s*(?:выпуск|сери)""", RegexOption.IGNORE_CASE).find(lower)
        if (ruRange != null) {
            val rStart = ruRange.groups[1]?.value?.toIntOrNull() ?: 0
            val rEnd = ruRange.groups[2]?.value?.toIntOrNull() ?: 0
            return epNum in rStart..rEnd
        }

        return true
    }

    fun extractEpisodeNumber(fileName: String, fallbackIndex: Int = 0): Int {
        if (fileName.isBlank()) return fallbackIndex + 1
        // Strip folder paths so "Season 1/05.mkv" becomes "05.mkv"
        val cleanName = fileName.substringAfterLast('/').substringAfterLast('\\')
        val lower = cleanName.lowercase()

        // S01E05
        Regex("""[sS]\d{1,2}[._\-\s]*[eE](\d{1,3})\b""").find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let { return it }

        // 01x05
        Regex("""\b\d{1,2}[xх](\d{1,3})\b""").find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let { return it }

        // "серия 5", "эпизод 5", "выпуск 5", "ep. 5"
        Regex("""(?:сери[яий]|эпизод|выпуск|ep\.?|episode\.?)\s*[:]?\s*(\d{1,3})\b""", RegexOption.IGNORE_CASE).find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let { return it }

        // "5 серия", "13 выпуск"
        Regex("""\b(\d{1,3})\s*(?:сери[яий]|эпизод|выпуск|ep|episode)\b""", RegexOption.IGNORE_CASE).find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let { return it }

        // Bracketed number e.g. "[05]" or "[05v2]"
        Regex("""\[0*(\d{1,3})[a-zA-Z0-9_\-]*\]""").find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let {
            if (it < 700) return it
        }

        // Leading number e.g. "05 - Title.mkv" or "05.mkv"
        Regex("""^(?:\[[^\]]*\]\s*)?0*(\d{1,3})[\s._\-]""").find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let {
            if (it < 700) return it
        }

        // Just number before extension e.g. "05.mkv" or "Show.05.mkv"
        Regex("""(?:^|[\s._\-])0*(\d{1,3})\.(?:mkv|avi|mp4|ts|m4v)$""").find(lower)?.groups?.get(1)?.value?.toIntOrNull()?.let {
            if (it < 700) return it
        }

        return fallbackIndex + 1
    }
}
