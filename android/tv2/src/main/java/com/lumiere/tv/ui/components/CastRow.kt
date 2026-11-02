package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.zIndex
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.lumiere.core.model.CastMember
import com.lumiere.tv.theme.*

/**
 * 4x2 Grid of 8 Cast cards on the right side of the upper hero (1-to-1 matching WGT)
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CastSectionWgt(
    cast: List<CastMember>,
    resolveImageUrl: (String?) -> String,
    onActorClick: (personId: Long, personName: String) -> Unit,
    onOpenAllCast: () -> Unit,
    modifier: Modifier = Modifier
) {
    if (cast.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Header row: "В главных ролях" + "Все актеры ›"
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "В главных ролях",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold
            )

            if (cast.size > 8) {
                val btnShape = RoundedCornerShape(12.dp)
                OutlinedButton(
                    onClick = onOpenAllCast,
                    scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.06f),
                    colors = OutlinedButtonDefaults.colors(
                        containerColor = Color(0x22E5A93C),
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark,
                        contentColor = LumiereGold
                    ),
                    border = OutlinedButtonDefaults.border(
                        border = Border(BorderStroke(1.dp, LumiereGold.copy(alpha = 0.4f)), shape = btnShape),
                        focusedBorder = Border(BorderStroke(2.dp, Color.White), shape = btnShape)
                    ),
                    shape = OutlinedButtonDefaults.shape(btnShape),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "Все актеры ›",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        // 4x2 Grid of 8 Actor Cards
        val top8 = remember(cast) { cast.take(8) }
        val row1 = remember(top8) { top8.take(4) }
        val row2 = remember(top8) { if (top8.size > 4) top8.drop(4).take(4) else emptyList() }

        Column(
            verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                row1.forEach { actor ->
                    WgtActorCard(
                        actor = actor,
                        imageUrl = resolveImageUrl(actor.image),
                        onClick = {
                            val aId = actor.id ?: 0L
                            if (aId > 0L) onActorClick(aId, actor.name)
                        },
                        modifier = Modifier.weight(1f)
                    )
                }
                repeat(4 - row1.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }

            if (row2.isNotEmpty()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    row2.forEach { actor ->
                        WgtActorCard(
                            actor = actor,
                            imageUrl = resolveImageUrl(actor.image),
                            onClick = {
                                val aId = actor.id ?: 0L
                                if (aId > 0L) onActorClick(aId, actor.name)
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    repeat(4 - row2.size) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

/**
 * Single Actor Card matching WGT 4:5 ratio with smooth launcher focus
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun WgtActorCard(
    actor: CastMember,
    imageUrl: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isFocused by interactionSource.collectIsFocusedAsState()

    Card(
        onClick = onClick,
        interactionSource = interactionSource,
        modifier = modifier
            .height(175.dp)
            .zIndex(if (isFocused) 10f else 0f),
        colors = CardDefaults.colors(
            containerColor = Color(0x18FFFFFF),
            focusedContainerColor = SurfaceVariantDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.5.dp, LumiereGold),
                shape = RoundedCornerShape(14.dp)
            ),
            border = Border(
                border = BorderStroke(1.dp, SurfaceBorder.copy(alpha = 0.4f)),
                shape = RoundedCornerShape(14.dp)
            )
        ),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1.06f, pressedScale = 1.02f),
        glow = CardDefaults.glow(
            focusedGlow = Glow(
                elevationColor = Color(0x66E5A93C),
                elevation = 14.dp
            )
        ),
        shape = CardDefaults.shape(RoundedCornerShape(14.dp))
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Top
        ) {
            // Photo (aspect ratio 4:5)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(4f / 5f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x22000000)),
                contentAlignment = Alignment.Center
            ) {
                if (imageUrl.isNotBlank()) {
                    val context = LocalContext.current
                    val imageRequest = remember(imageUrl) {
                        ImageRequest.Builder(context)
                            .data(imageUrl)
                            .size(200, 250)
                            .memoryCacheKey(imageUrl)
                            .diskCacheKey(imageUrl)
                            .build()
                    }
                    AsyncImage(
                        model = imageRequest,
                        contentDescription = actor.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = null,
                        tint = TextMuted,
                        modifier = Modifier.size(32.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Actor Name
            Text(
                text = actor.name,
                style = MaterialTheme.typography.bodySmall,
                color = if (isFocused) Color.White else TextPrimary,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                fontSize = 11.sp
            )

            // Character / Role (clean of slash)
            val cleanRole = remember(actor.role) {
                val r = actor.role.orEmpty().trim()
                if (r.contains("/")) r.split("/")[0].trim() else r
            }
            if (cleanRole.isNotBlank()) {
                Text(
                    text = cleanRole,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isFocused) LumiereGold else TextMuted,
                    fontSize = 10.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

/**
 * All Cast Modal Dialog (matching WGT #all-cast-modal)
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun AllCastDialog(
    cast: List<CastMember>,
    resolveImageUrl: (String?) -> String,
    onActorClick: (personId: Long, personName: String) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .fillMaxHeight(0.88f)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xF00D0F16))
                .border(BorderStroke(1.5.dp, SurfaceBorder), RoundedCornerShape(24.dp))
                .padding(24.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Top row: Title + Count badge + Back button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "В главных ролях",
                            style = MaterialTheme.typography.headlineMedium,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0x22E5A93C))
                                .padding(horizontal = 10.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = "${cast.size}",
                                style = MaterialTheme.typography.labelSmall,
                                color = LumiereGold,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    val backShape = RoundedCornerShape(12.dp)
                    OutlinedButton(
                        onClick = onDismiss,
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                        colors = OutlinedButtonDefaults.colors(
                            containerColor = Color(0x18FFFFFF),
                            focusedContainerColor = LumiereGold,
                            focusedContentColor = BackgroundDark,
                            contentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(BorderStroke(1.dp, SurfaceBorder), shape = backShape),
                            focusedBorder = Border(BorderStroke(2.dp, Color.White), shape = backShape)
                        ),
                        shape = OutlinedButtonDefaults.shape(backShape),
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                    ) {
                        Text("‹ Назад", fontWeight = FontWeight.SemiBold)
                    }
                }

                // Grid of all actors (6 columns)
                LazyVerticalGrid(
                    columns = GridCells.Fixed(6),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    items(cast, key = { it.id ?: it.name.hashCode().toLong() }) { actor ->
                        WgtActorCard(
                            actor = actor,
                            imageUrl = resolveImageUrl(actor.image),
                            onClick = {
                                onDismiss()
                                val aId = actor.id ?: 0L
                                if (aId > 0L) onActorClick(aId, actor.name)
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Horizontal Cast Row (preserved for fallback/component reuse)
 */
@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CastRow(
    cast: List<CastMember>,
    resolveImageUrl: (String?) -> String,
    onActorClick: (personId: Long, personName: String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (cast.isEmpty()) return

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "В главных ролях",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary,
                fontWeight = FontWeight.Bold
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0x22FFFFFF))
                    .padding(horizontal = 8.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "${cast.size}",
                    style = MaterialTheme.typography.labelSmall,
                    color = LumiereGold,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        LazyRow(
            contentPadding = PaddingValues(horizontal = 4.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(cast, key = { it.id ?: it.name.hashCode().toLong() }) { actor ->
                WgtActorCard(
                    actor = actor,
                    imageUrl = resolveImageUrl(actor.image),
                    onClick = {
                        val actorId = actor.id ?: 0L
                        if (actorId > 0L) {
                            onActorClick(actorId, actor.name)
                        }
                    },
                    modifier = Modifier.width(115.dp)
                )
            }
        }
    }
}
