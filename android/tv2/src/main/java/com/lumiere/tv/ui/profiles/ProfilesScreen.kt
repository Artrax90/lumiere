package com.lumiere.tv.ui.profiles

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import coil3.compose.AsyncImage
import com.lumiere.core.model.Profile
import com.lumiere.tv.theme.*
import com.lumiere.tv.ui.components.PinDialog

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ProfilesScreen(
    onProfileChosen: () -> Unit,
    onChangeServer: () -> Unit,
    viewModel: ProfilesViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(48.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(36.dp)
        ) {
            Text(
                text = "Кто сейчас смотрит?",
                style = MaterialTheme.typography.displayMedium,
                color = TextPrimary
            )

            if (state.isLoading) {
                Text(
                    text = "Загрузка профилей...",
                    style = MaterialTheme.typography.bodyLarge,
                    color = TextSecondary
                )
            } else if (state.profiles.isNotEmpty()) {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(28.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    items(state.profiles, key = { it.id }) { profile ->
                        ProfileCard(
                            profile = profile,
                            onClick = { viewModel.onProfileSelected(profile, onProfileChosen) }
                        )
                    }
                }
            } else {
                Text(
                    text = state.errorMessage ?: "Профили не найдены",
                    style = MaterialTheme.typography.bodyLarge,
                    color = ErrorRed
                )
            }

            AnimatedVisibility(visible = state.errorMessage != null) {
                Text(
                    text = state.errorMessage.orEmpty(),
                    color = ErrorRed,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { viewModel.changeServer(onChangeServer) },
                colors = OutlinedButtonDefaults.colors(
                    focusedContainerColor = Color(0x22FFFFFF),
                    focusedContentColor = TextPrimary
                )
            ) {
                Icon(
                    imageVector = Icons.Default.SwapHoriz,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Сменить сервер")
            }
        }

        // PIN Dialog Modal
        if (state.selectedProfileForPin != null) {
            PinDialog(
                profileName = state.selectedProfileForPin!!.name,
                errorMessage = state.pinError,
                onPinEntered = { pin -> viewModel.submitPin(pin, onProfileChosen) },
                onDismiss = { viewModel.dismissPinDialog() }
            )
        }

        // Password Dialog Modal
        if (state.selectedProfileForPassword != null) {
            val prof = state.selectedProfileForPassword!!
            com.lumiere.tv.ui.components.PasswordDialog(
                profileName = prof.name,
                profileEmail = prof.email,
                errorMessage = state.passwordError,
                isLoading = state.isAuthenticating,
                onSubmit = { email, password -> viewModel.submitPassword(email, password, onProfileChosen) },
                onDismiss = { viewModel.dismissPasswordDialog() }
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun ProfileCard(
    profile: Profile,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .width(160.dp)
            .height(210.dp),
        colors = CardDefaults.colors(
            containerColor = SurfaceDark,
            focusedContainerColor = SurfaceVariantDark
        ),
        border = CardDefaults.border(
            focusedBorder = Border(
                border = androidx.compose.foundation.BorderStroke(2.dp, LumiereGold),
                shape = RoundedCornerShape(16.dp)
            ),
            border = Border(
                border = androidx.compose.foundation.BorderStroke(1.dp, SurfaceBorder),
                shape = RoundedCornerShape(16.dp)
            )
        ),
        scale = CardDefaults.scale(scale = 1f, focusedScale = 1.05f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .clip(CircleShape)
                    .background(SurfaceVariantDark)
                    .border(2.dp, if (profile.hasPin) LumiereGoldVariant else Color(0x33FFFFFF), CircleShape),
                contentAlignment = Alignment.Center
            ) {
                if (!profile.avatar.isNullOrBlank()) {
                    AsyncImage(
                        model = profile.avatar,
                        contentDescription = profile.name,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Text(
                        text = profile.name.take(1).uppercase(),
                        style = MaterialTheme.typography.headlineLarge,
                        color = LumiereGold
                    )
                }

                if (profile.hasPin) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(BackgroundDark)
                            .padding(2.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Lock,
                            contentDescription = "PIN",
                            tint = LumiereGold,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            Text(
                text = profile.name,
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary,
                maxLines = 1
            )

            if (profile.isKids) {
                Text(
                    text = "Детский",
                    fontSize = 11.sp,
                    color = AccentBlue,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
        }
    }
}
