package com.lumiere.tv.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.tv.material3.*
import com.lumiere.tv.theme.*

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PasswordDialog(
    profileName: String,
    profileEmail: String? = null,
    errorMessage: String? = null,
    isLoading: Boolean = false,
    onSubmit: (email: String, password: String) -> Unit,
    onDismiss: () -> Unit
) {
    androidx.activity.compose.BackHandler(onBack = onDismiss)

    var email by remember { mutableStateOf(profileEmail.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var activeField by remember { mutableStateOf(if (profileEmail.isNullOrBlank()) "email" else "password") }
    val keyboardFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(120)
        try {
            keyboardFocusRequester.requestFocus()
        } catch (_: Exception) {}
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            usePlatformDefaultWidth = false
        )
    ) {
        // Deep full-screen cinematic scrim that dims out background cards
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.85f))
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown) {
                        when {
                            event.key == Key.Backspace -> {
                                if (activeField == "email") {
                                    if (email.isNotEmpty()) email = email.dropLast(1)
                                } else {
                                    if (password.isNotEmpty()) password = password.dropLast(1)
                                }
                                true
                            }
                            event.key == Key.Enter || event.key == Key.NumPadEnter -> {
                                if (password.isNotBlank() && !isLoading) {
                                    onSubmit(email, password)
                                }
                                true
                            }
                            event.utf16CodePoint > 31 -> {
                                val char = event.utf16CodePoint.toChar()
                                if (activeField == "email") email += char else password += char
                                true
                            }
                            else -> false
                        }
                    } else false
                },
            contentAlignment = Alignment.Center
        ) {
            Box(
                modifier = Modifier
                    .width(900.dp)
                    .height(490.dp)
                    .clip(RoundedCornerShape(22.dp))
                    .background(SurfaceDark)
                    .border(1.dp, SurfaceBorder, RoundedCornerShape(22.dp))
                    .padding(28.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    horizontalArrangement = Arrangement.spacedBy(28.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // LEFT COLUMN (320 dp): Profile info, credentials fields, action buttons
                    Column(
                        modifier = Modifier
                            .width(320.dp)
                            .fillMaxHeight(),
                        verticalArrangement = Arrangement.SpaceBetween,
                        horizontalAlignment = Alignment.Start
                    ) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(14.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            // Profile Avatar + Name Header
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(14.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(52.dp)
                                        .clip(CircleShape)
                                        .background(SurfaceVariantDark)
                                        .border(2.dp, LumiereGold, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = profileName.take(1).uppercase(),
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = LumiereGold
                                    )
                                }

                                Column {
                                    Text(
                                        text = "Вход в профиль",
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = TextPrimary
                                    )
                                    Text(
                                        text = profileName,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                        color = LumiereGold
                                    )
                                }
                            }

                            if (!profileEmail.isNullOrBlank()) {
                                Text(
                                    text = profileEmail,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextMuted
                                )
                            }

                            // Email input if profile has no email
                            if (profileEmail.isNullOrBlank()) {
                                OutlinedTextField(
                                    value = email,
                                    onValueChange = { email = it },
                                    readOnly = true,
                                    placeholder = { Text("Email", color = TextMuted) },
                                    singleLine = true,
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
                            }

                            // Password input
                            OutlinedTextField(
                                value = password,
                                onValueChange = { password = it },
                                readOnly = true,
                                placeholder = { Text("Введите пароль", color = TextMuted) },
                                singleLine = true,
                                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                                trailingIcon = {
                                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                        Icon(
                                            imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = if (passwordVisible) "Скрыть пароль" else "Показать пароль",
                                            tint = if (passwordVisible) LumiereGold else TextSecondary
                                        )
                                    }
                                },
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

                            AnimatedVisibility(visible = errorMessage != null) {
                                Text(
                                    text = errorMessage.orEmpty(),
                                    color = ErrorRed,
                                    style = MaterialTheme.typography.bodySmall,
                                    maxLines = 2
                                )
                            }
                        }

                        // Action Buttons: Войти and Отмена
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Button(
                                onClick = {
                                    if (password.isNotBlank() && !isLoading) {
                                        onSubmit(email, password)
                                    }
                                },
                                enabled = password.isNotBlank() && !isLoading,
                                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.04f),
                                colors = ButtonDefaults.colors(
                                    containerColor = LumiereGold,
                                    contentColor = BackgroundDark,
                                    focusedContainerColor = Color.White,
                                    focusedContentColor = BackgroundDark
                                ),
                                border = ButtonDefaults.border(
                                    focusedBorder = Border(border = BorderStroke(2.dp, LumiereGold), shape = RoundedCornerShape(10.dp)),
                                    border = Border.None
                                ),
                                shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 11.dp),
                                modifier = Modifier.weight(1.2f)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Check,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = if (isLoading) "Вход..." else "Войти",
                                        style = MaterialTheme.typography.labelLarge,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            OutlinedButton(
                                onClick = onDismiss,
                                scale = OutlinedButtonDefaults.scale(scale = 1f, focusedScale = 1.04f),
                                colors = OutlinedButtonDefaults.colors(
                                    focusedContainerColor = Color(0x33FFFFFF),
                                    focusedContentColor = TextPrimary
                                ),
                                border = OutlinedButtonDefaults.border(
                                    border = Border(border = BorderStroke(1.dp, SurfaceBorder), shape = RoundedCornerShape(10.dp)),
                                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = RoundedCornerShape(10.dp))
                                ),
                                shape = OutlinedButtonDefaults.shape(RoundedCornerShape(10.dp)),
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 11.dp),
                                modifier = Modifier.weight(0.9f)
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Close,
                                        contentDescription = null,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Отмена", style = MaterialTheme.typography.labelLarge)
                                }
                            }
                        }
                    }

                    // Vertical Divider
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .width(1.dp)
                            .background(Color(0x1AFFFFFF))
                    )

                    // RIGHT COLUMN: Full-featured Virtual Keyboard
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        contentAlignment = Alignment.Center
                    ) {
                        TvVirtualKeyboard(
                            onChar = { char ->
                                if (activeField == "email") email += char else password += char
                            },
                            onBackspace = {
                                if (activeField == "email") {
                                    if (email.isNotEmpty()) email = email.dropLast(1)
                                } else {
                                    if (password.isNotEmpty()) password = password.dropLast(1)
                                }
                            },
                            onClear = {
                                if (activeField == "email") email = "" else password = ""
                            },
                            onSpace = {
                                if (activeField == "email") email += " " else password += " "
                            },
                            firstKeyFocusRequester = keyboardFocusRequester,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}
