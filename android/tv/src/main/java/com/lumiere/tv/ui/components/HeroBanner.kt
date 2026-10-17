package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
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
fun HeroBanner(
    title: Title,
    backdropUrl: String,
    onPlayClick: () -> Unit,
    onDetailsClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(380.dp)
            .clip(RoundedCornerShape(20.dp))
    ) {
        // Backdrop Image
        val context = androidx.compose.ui.platform.LocalContext.current
        val imageRequest = androidx.compose.runtime.remember(backdropUrl) {
            coil3.request.ImageRequest.Builder(context)
                .data(backdropUrl)
                .size(1280, 720)
                .build()
        }
        AsyncImage(
            model = imageRequest,
            contentDescription = title.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        // Gradient Overlay (Dark from left & bottom)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        colors = listOf(
                            BackgroundDark.copy(alpha = 0.95f),
                            BackgroundDark.copy(alpha = 0.75f),
                            Color.Transparent
                        ),
                        endX = 1100f
                    )
                )
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.Transparent,
                            BackgroundDark.copy(alpha = 0.85f),
                            BackgroundDark
                        ),
                        startY = 200f
                    )
                )
        )

        // Hero Content
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(32.dp)
                .fillMaxWidth(0.6f),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = title.name,
                style = MaterialTheme.typography.displayMedium,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            // Metadata: Year, Rating, Genres
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val year = title.year
                if (year != null && year > 0) {
                    Text(
                        text = year.toString(),
                        style = MaterialTheme.typography.titleMedium,
                        color = TextSecondary
                    )
                }

                val score = title.score ?: title.rating?.toDoubleOrNull()
                if (score != null && score > 0.0) {
                    Text(
                        text = "★ ${String.format("%.1f", score)}",
                        style = MaterialTheme.typography.titleMedium,
                        color = LumiereGold,
                        fontWeight = FontWeight.Bold
                    )
                }

                if (title.genres.isNotEmpty()) {
                    Text(
                        text = title.genres.take(3).joinToString(" • "),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            }

            // Description
            val desc = title.overview ?: title.description
            if (!desc.isNullOrBlank()) {
                Text(
                    text = desc,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    lineHeight = 20.sp
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Action Buttons
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val bannerBtnShape = RoundedCornerShape(12.dp)
                Button(
                    onClick = onPlayClick,
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                    colors = ButtonDefaults.colors(
                        containerColor = LumiereGold,
                        contentColor = BackgroundDark,
                        focusedContainerColor = Color.White,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        focusedBorder = Border(border = BorderStroke(2.5.dp, Color.White), shape = bannerBtnShape),
                        border = Border.None
                    ),
                    shape = ButtonDefaults.shape(bannerBtnShape)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Смотреть",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold
                    )
                }

                OutlinedButton(
                    onClick = onDetailsClick,
                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                    colors = OutlinedButtonDefaults.colors(
                        focusedContainerColor = Color(0x22FFFFFF),
                        focusedContentColor = TextPrimary
                    ),
                    border = OutlinedButtonDefaults.border(
                        border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = bannerBtnShape),
                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = bannerBtnShape)
                    ),
                    shape = OutlinedButtonDefaults.shape(bannerBtnShape)
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Подробнее",
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    }
}
