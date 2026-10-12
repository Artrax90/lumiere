package com.lumiere.tv.ui.connect

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.tv.material3.*
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ConnectScreen(
    onConnected: () -> Unit,
    viewModel: ConnectViewModel = viewModel()
) {
    val state by viewModel.uiState.collectAsState()
    var isManualMode by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(BackgroundDark)
            .padding(48.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp),
            modifier = Modifier.widthIn(max = 640.dp)
        ) {
            // App Branding
            Text(
                text = "LUMIÈRE",
                style = MaterialTheme.typography.displayMedium,
                color = LumiereGold,
                letterSpacing = 4.sp
            )

            Text(
                text = "Подключение к домашнему серверу",
                style = MaterialTheme.typography.headlineSmall,
                color = TextSecondary
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Discovery State
            if (state.isScanning) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(SurfaceDark)
                        .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                        .padding(32.dp)
                ) {
                    Text(
                        text = "Сканирование локальной сети...",
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary
                    )
                    Text(
                        text = "Проверено ${state.scannedCount} из ${state.totalCount} адресов (порт 3500)",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextMuted
                    )
                }
            } else if (state.discoveredServer != null && !isManualMode) {
                // Server Found Card
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(SurfaceDark)
                        .border(1.dp, LumiereGold, RoundedCornerShape(16.dp))
                        .padding(28.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Tv,
                        contentDescription = null,
                        tint = LumiereGold,
                        modifier = Modifier.size(48.dp)
                    )

                    Text(
                        text = "Найден сервер Lumiere",
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary
                    )

                    Text(
                        text = state.discoveredServer!!.url,
                        style = MaterialTheme.typography.bodyLarge,
                        color = LumiereGold
                    )

                    Button(
                        onClick = {
                            viewModel.connect(state.discoveredServer!!.url, onConnected)
                        },
                        colors = ButtonDefaults.colors(
                            containerColor = LumiereGold,
                            contentColor = BackgroundDark,
                            focusedContainerColor = Color.White,
                            focusedContentColor = BackgroundDark
                        ),
                        modifier = Modifier.fillMaxWidth(0.8f)
                    ) {
                        Text("Подключиться", style = MaterialTheme.typography.labelLarge)
                    }
                }
            } else {
                // Manual IP / Port Input
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(SurfaceDark)
                        .border(1.dp, SurfaceBorder, RoundedCornerShape(16.dp))
                        .padding(24.dp)
                ) {
                    Text(
                        text = "Адрес сервера",
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary
                    )

                    OutlinedTextField(
                        value = state.manualAddress,
                        onValueChange = { viewModel.updateManualAddress(it) },
                        placeholder = { Text("192.168.1.100:3500", color = TextMuted) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = { viewModel.connect(state.manualAddress, onConnected) }
                        ),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = SurfaceVariantDark,
                            unfocusedContainerColor = SurfaceVariantDark,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            focusedIndicatorColor = LumiereGold,
                            unfocusedIndicatorColor = SurfaceBorder
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Button(
                        onClick = {
                            viewModel.connect(state.manualAddress, onConnected)
                        },
                        colors = ButtonDefaults.colors(
                            containerColor = LumiereGold,
                            contentColor = BackgroundDark,
                            focusedContainerColor = Color.White,
                            focusedContentColor = BackgroundDark
                        ),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = if (state.isConnecting) "Подключение..." else "Подключиться",
                            style = MaterialTheme.typography.labelLarge
                        )
                    }
                }
            }

            AnimatedVisibility(visible = state.errorMessage != null) {
                Text(
                    text = state.errorMessage.orEmpty(),
                    color = ErrorRed,
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            // Bottom Buttons
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedButton(
                    onClick = { viewModel.startDiscovery() },
                    colors = OutlinedButtonDefaults.colors(
                        focusedContainerColor = Color(0x22FFFFFF),
                        focusedContentColor = TextPrimary
                    )
                ) {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Повторить поиск")
                }

                OutlinedButton(
                    onClick = { isManualMode = !isManualMode },
                    colors = OutlinedButtonDefaults.colors(
                        focusedContainerColor = Color(0x22FFFFFF),
                        focusedContentColor = TextPrimary
                    )
                ) {
                    Text(if (isManualMode) "Автопоиск" else "Ввести вручную")
                }
            }
        }
    }
}
