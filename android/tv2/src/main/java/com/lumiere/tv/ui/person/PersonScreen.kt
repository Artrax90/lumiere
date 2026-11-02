package com.lumiere.tv.ui.person

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.lumiere.core.model.PersonDetails
import com.lumiere.core.model.Title
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.MediaCard

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PersonScreen(
    personId: Long,
    personName: String,
    onBackClick: () -> Unit,
    onTitleClick: (Title) -> Unit,
    viewModel: PersonViewModel
) {
    val uiState by viewModel.uiState.collectAsState()
    val gridState = rememberLazyGridState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
    ) {
        if (uiState.isLoading && uiState.credits.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "Загрузка информации об актёре...",
                    style = MaterialTheme.typography.titleMedium,
                    color = LumiereGold
                )
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 150.dp),
                state = gridState,
                contentPadding = PaddingValues(start = 36.dp, end = 36.dp, top = 24.dp, bottom = 36.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                // 1. Back button row
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                    ) {
                        val backShape = RoundedCornerShape(12.dp)
                        OutlinedButton(
                            onClick = onBackClick,
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
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ArrowBack,
                                contentDescription = "Назад",
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Назад", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }

                // 2. Profile Details Header
                item(span = { GridItemSpan(maxLineSpan) }) {
                    PersonProfileHeader(
                        person = uiState.person,
                        initialName = personName,
                        creditsCount = uiState.credits.size,
                        resolveImageUrl = { viewModel.resolveImageUrl(it) }
                    )
                }

                // 3. Filmography Header
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Фильмография",
                            style = MaterialTheme.typography.titleLarge,
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0x22FFFFFF))
                                .padding(horizontal = 10.dp, vertical = 3.dp)
                        ) {
                            Text(
                                text = "${uiState.credits.size} работ",
                                style = MaterialTheme.typography.labelSmall,
                                color = LumiereGold,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // 4. Filmography Cards
                items(
                    items = uiState.credits,
                    key = { it.id }
                ) { title ->
                    MediaCard(
                        title = title,
                        posterUrl = viewModel.resolveImageUrl(title.poster),
                        onClick = { onTitleClick(title) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun PersonProfileHeader(
    person: PersonDetails?,
    initialName: String,
    creditsCount: Int,
    resolveImageUrl: (String?) -> String
) {
    val name = person?.name?.ifBlank { initialName } ?: initialName
    val photoUrl = resolveImageUrl(person?.profile)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(SurfaceDark.copy(alpha = 0.6f))
            .border(BorderStroke(1.dp, SurfaceBorder.copy(alpha = 0.5f)), RoundedCornerShape(20.dp))
            .padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
        verticalAlignment = Alignment.Top
    ) {
        // Photo
        Box(
            modifier = Modifier
                .width(120.dp)
                .height(170.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0x18FFFFFF))
                .border(BorderStroke(1.dp, SurfaceBorder.copy(alpha = 0.7f)), RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (photoUrl.isNotBlank()) {
                val context = LocalContext.current
                val imageRequest = remember(photoUrl) {
                    ImageRequest.Builder(context)
                        .data(photoUrl)
                        .size(240, 340)
                        .build()
                }
                AsyncImage(
                    model = imageRequest,
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    tint = TextMuted,
                    modifier = Modifier.size(48.dp)
                )
            }
        }

        // Details Column
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = name,
                style = MaterialTheme.typography.headlineMedium,
                color = TextPrimary,
                fontWeight = FontWeight.ExtraBold
            )

            // Badges row
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val dept = person?.knownForDepartment
                if (!dept.isNullOrBlank()) {
                    val deptLabel = when (dept) {
                        "Acting" -> "Актёр"
                        "Directing" -> "Режиссёр"
                        "Writing" -> "Сценарист"
                        "Production" -> "Продюсер"
                        else -> dept
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0x22E5A93C))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = deptLabel,
                            style = MaterialTheme.typography.labelSmall,
                            color = LumiereGold,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }

                val birthPlace = person?.placeOfBirth
                if (!birthPlace.isNullOrBlank()) {
                    Text(
                        text = "• $birthPlace",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                val bday = person?.birthday
                if (!bday.isNullOrBlank()) {
                    Text(
                        text = "• $bday",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted
                    )
                }
            }

            // Biography
            val bio = person?.biography
            if (!bio.isNullOrBlank()) {
                var isBioExpanded by remember { mutableStateOf(false) }
                val isLongBio = bio.length > 220

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = bio,
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        maxLines = if (isBioExpanded) Int.MAX_VALUE else 4,
                        overflow = if (isBioExpanded) TextOverflow.Clip else TextOverflow.Ellipsis,
                        lineHeight = 22.sp
                    )

                    if (isLongBio) {
                        val expandShape = RoundedCornerShape(8.dp)
                        OutlinedButton(
                            onClick = { isBioExpanded = !isBioExpanded },
                            scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                            colors = OutlinedButtonDefaults.colors(
                                containerColor = if (isBioExpanded) Color(0x22E5A93C) else Color(0x14FFFFFF),
                                focusedContainerColor = LumiereGold,
                                focusedContentColor = BackgroundDark,
                                contentColor = if (isBioExpanded) LumiereGold else TextSecondary
                            ),
                            border = OutlinedButtonDefaults.border(
                                border = Border(BorderStroke(1.dp, if (isBioExpanded) LumiereGold.copy(alpha = 0.5f) else SurfaceBorder), shape = expandShape),
                                focusedBorder = Border(BorderStroke(2.dp, Color.White), shape = expandShape)
                            ),
                            shape = OutlinedButtonDefaults.shape(expandShape),
                            contentPadding = PaddingValues(horizontal = 14.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = if (isBioExpanded) "Свернуть описание ▴" else "Читать полностью ▾",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }
        }
    }
}
