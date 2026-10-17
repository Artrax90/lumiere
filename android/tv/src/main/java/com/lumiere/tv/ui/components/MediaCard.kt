package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun MediaCard(
    title: Title,
    posterUrl: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        onClick = onClick,
        modifier = modifier
            .width(150.dp)
            .height(225.dp),
        colors = CardDefaults.colors(
            containerColor = SurfaceDark,
            focusedContainerColor = SurfaceVariantDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.5.dp, LumiereGold),
                shape = RoundedCornerShape(14.dp)
            ),
            border = Border(
                border = BorderStroke(1.dp, SurfaceBorder),
                shape = RoundedCornerShape(14.dp)
            )
        ),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1f),
        shape = CardDefaults.shape(RoundedCornerShape(14.dp))
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Poster Image with downscaled decoding (150x225 RGB_565 like Jellyfin/Plex)
            val context = androidx.compose.ui.platform.LocalContext.current
            val imageRequest = androidx.compose.runtime.remember(posterUrl) {
                coil3.request.ImageRequest.Builder(context)
                    .data(posterUrl)
                    .memoryCacheKey(posterUrl)
                    .diskCacheKey(posterUrl)
                    .build()
            }
            AsyncImage(
                model = imageRequest,
                contentDescription = title.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )

            // Bottom Gradient for readable title
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(80.dp)
                    .align(Alignment.BottomCenter)
                    .background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, Color(0xE607090E))
                        )
                    )
            )

            // Rating Pill on Top Right
            val scoreVal = title.score ?: title.rating?.toDoubleOrNull()
            if (scoreVal != null && scoreVal > 0.0) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .background(Color(0xD907090E))
                        .border(1.dp, LumiereGoldGlow, RoundedCornerShape(6.dp))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = String.format("%.1f", scoreVal),
                        color = LumiereGold,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            // Title and Year at Bottom
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(10.dp)
            ) {
                Text(
                    text = title.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                val year = title.year
                if (year != null && year > 0) {
                    Text(
                        text = year.toString(),
                        fontSize = 11.sp,
                        color = TextSecondary
                    )
                }
            }

            // Progress Bar if in Continue Watching
            val progress = title.progress
            if (progress != null && progress > 0.0) {
                val fraction = (progress / 100.0).coerceIn(0.0, 1.0).toFloat()
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(3.dp)
                        .align(Alignment.BottomCenter)
                        .background(Color(0x66FFFFFF))
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(fraction)
                            .fillMaxHeight()
                            .background(LumiereGold)
                    )
                }
            }
        }
    }
}
