package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.LumiereGold
import com.lumiere.tv.theme.SurfaceBorder
import com.lumiere.tv.theme.TextMuted
import com.lumiere.tv.theme.TextPrimary
import com.lumiere.tv.theme.TextSecondary

@Composable
fun DetailSpecsBlock(
    title: Title,
    modifier: Modifier = Modifier
) {
    val isTv = title.type == "tv"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0x350A0E18))
            .border(BorderStroke(0.5.dp, Color(0x22FFFFFF)), RoundedCornerShape(14.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Header
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = if (isTv) "О сериале" else "О фильме",
                fontSize = 15.sp,
                color = LumiereGold,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.width(10.dp))
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(1.dp)
                    .background(
                        Brush.horizontalGradient(
                            listOf(LumiereGold.copy(alpha = 0.4f), Color.Transparent)
                        )
                    )
            )
        }

        // 2-column specs
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // Row 1: Director & Country
            val director = title.director
            val countries = title.countries.joinToString(", ")
            if (!director.isNullOrBlank() || countries.isNotBlank()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (!director.isNullOrBlank()) {
                        SpecItem(label = "Режиссёр", value = director, modifier = Modifier.weight(1f))
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                    if (countries.isNotBlank()) {
                        SpecItem(label = "Страна", value = countries, modifier = Modifier.weight(1f))
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }

            // Row 2: Original Title & Release Date / Seasons
            val orig = title.originalTitle
            val hasOrig = !orig.isNullOrBlank() && orig != title.name
            val releaseDate = title.releaseDate ?: title.year?.toString()
            if (hasOrig || !releaseDate.isNullOrBlank()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    if (hasOrig && orig != null) {
                        SpecItem(label = "Оригинал", value = orig, isItalic = true, modifier = Modifier.weight(1f))
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                    if (!releaseDate.isNullOrBlank()) {
                        SpecItem(label = "Премьера", value = releaseDate, modifier = Modifier.weight(1f))
                    } else {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }

            // TV Seasons count
            if (isTv && title.seasonsCount != null) {
                val sCount = title.seasonsCount ?: 1
                val sWord = if (sCount == 1) "сезон" else if (sCount < 5) "сезона" else "сезонов"
                SpecItem(label = "Сезоны", value = "$sCount $sWord")
            }

            // Genres chips
            if (title.genres.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "ЖАНРЫ",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextMuted,
                        modifier = Modifier.width(68.dp)
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.weight(1f)
                    ) {
                        title.genres.take(4).forEach { genre ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0x18FFFFFF))
                                    .border(BorderStroke(0.5.dp, Color(0x30FFFFFF)), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 7.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = genre,
                                    fontSize = 10.sp,
                                    color = TextPrimary,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }
            }

            // Tagline
            val tagline = title.tagline
            if (!tagline.isNullOrBlank()) {
                SpecItem(label = "Слоган", value = "«$tagline»", isItalic = true)
            }

            // Studio / Production Companies
            if (title.productionCompanies.isNotEmpty()) {
                SpecItem(label = "Студия", value = title.productionCompanies.take(2).joinToString(", "))
            }

            // Tech Formats
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "ФОРМАТЫ",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextMuted,
                    modifier = Modifier.width(68.dp)
                )
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TechBadge("4K UHD", Color(0xFFE5A93C), Color(0x22E5A93C))
                    TechBadge("Dolby Vision", Color(0xFF93C5FD), Color(0x2293C5FD))
                    TechBadge("HDR10+", Color.White, Color(0x18FFFFFF))
                    TechBadge("5.1 / Atmos", Color(0xFFC084FC), Color(0x22C084FC))
                }
            }
        }
    }
}

@Composable
private fun SpecItem(
    label: String,
    value: String,
    isItalic: Boolean = false,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label.uppercase(),
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = TextMuted,
            modifier = Modifier.width(68.dp)
        )
        Text(
            text = value,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.Medium,
            color = TextPrimary,
            fontStyle = if (isItalic) FontStyle.Italic else FontStyle.Normal,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun TechBadge(text: String, textColor: Color, bgColor: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(5.dp))
            .background(bgColor)
            .border(BorderStroke(0.5.dp, textColor.copy(alpha = 0.4f)), RoundedCornerShape(5.dp))
            .padding(horizontal = 5.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            fontSize = 8.5.sp,
            fontWeight = FontWeight.Bold,
            color = textColor
        )
    }
}
