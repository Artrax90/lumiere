package com.lumiere.tv.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.*
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PinDialog(
    profileName: String,
    errorMessage: String? = null,
    onPinEntered: (String) -> Unit,
    onDismiss: () -> Unit
) {
    androidx.activity.compose.BackHandler(onBack = onDismiss)

    var pin by remember { mutableStateOf("") }
    val firstButtonFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        firstButtonFocusRequester.requestFocus()
    }

    LaunchedEffect(pin) {
        if (pin.length == 4) {
            onPinEntered(pin)
            pin = ""
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            usePlatformDefaultWidth = false
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.85f)),
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .width(440.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(SurfaceDark)
                    .border(1.dp, SurfaceBorder, RoundedCornerShape(22.dp))
                    .padding(28.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(
                        text = "Введите PIN-код",
                        style = MaterialTheme.typography.headlineMedium,
                        color = TextPrimary
                    )

                    Text(
                        text = "Профиль: $profileName",
                        style = MaterialTheme.typography.bodyMedium,
                        color = LumiereGold
                    )

                    // 4 PIN Dots
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.padding(vertical = 10.dp)
                    ) {
                        repeat(4) { index ->
                            val filled = index < pin.length
                            Box(
                                modifier = Modifier
                                    .size(16.dp)
                                    .clip(CircleShape)
                                    .background(if (filled) LumiereGold else Color(0x33FFFFFF))
                                    .border(
                                        width = 1.dp,
                                        color = if (filled) LumiereGold else Color(0x55FFFFFF),
                                        shape = CircleShape
                                    )
                            )
                        }
                    }

                    AnimatedVisibility(visible = errorMessage != null) {
                        Text(
                            text = errorMessage.orEmpty(),
                            color = ErrorRed,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }

                    // Numeric Keypad 3x4
                    val keys = listOf(
                        listOf("1", "2", "3"),
                        listOf("4", "5", "6"),
                        listOf("7", "8", "9"),
                        listOf("C", "0", "⌫")
                    )

                    val keyShape = RoundedCornerShape(14.dp)
                    Column(
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        keys.forEachIndexed { rowIndex, row ->
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                row.forEachIndexed { colIndex, key ->
                                    val modifier = if (rowIndex == 0 && colIndex == 0) {
                                        Modifier.focusRequester(firstButtonFocusRequester)
                                    } else {
                                        Modifier
                                    }

                                    Button(
                                        onClick = {
                                            when (key) {
                                                "C" -> pin = ""
                                                "⌫" -> if (pin.isNotEmpty()) pin = pin.dropLast(1)
                                                else -> if (pin.length < 4) pin += key
                                            }
                                        },
                                        scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.08f),
                                        colors = ButtonDefaults.colors(
                                            containerColor = SurfaceVariantDark,
                                            contentColor = TextPrimary,
                                            focusedContainerColor = LumiereGold,
                                            focusedContentColor = BackgroundDark
                                        ),
                                        border = ButtonDefaults.border(
                                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = keyShape),
                                            border = Border(border = BorderStroke(0.5.dp, Color(0x22FFFFFF)), shape = keyShape)
                                        ),
                                        shape = ButtonDefaults.shape(keyShape),
                                        modifier = modifier.size(64.dp)
                                    ) {
                                        Box(
                                            modifier = Modifier.fillMaxSize(),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Text(
                                                text = key,
                                                fontSize = 20.sp,
                                                style = MaterialTheme.typography.titleLarge
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // Cancel Button
                    OutlinedButton(
                        onClick = onDismiss,
                        scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.04f),
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        border = OutlinedButtonDefaults.border(
                            border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = RoundedCornerShape(10.dp)),
                            focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = RoundedCornerShape(10.dp))
                        ),
                        shape = OutlinedButtonDefaults.shape(RoundedCornerShape(10.dp)),
                        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 10.dp),
                        modifier = Modifier.padding(top = 8.dp)
                    ) {
                        Text("Отмена", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}
