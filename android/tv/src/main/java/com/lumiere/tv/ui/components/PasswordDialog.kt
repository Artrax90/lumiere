package com.lumiere.tv.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
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
    var email by remember { mutableStateOf(profileEmail.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var activeField by remember { mutableStateOf(if (profileEmail.isNullOrBlank()) "email" else "password") }
    val passwordFocusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        passwordFocusRequester.requestFocus()
    }

    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .width(680.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(SurfaceDark)
                .border(1.dp, SurfaceBorder, RoundedCornerShape(20.dp))
                .padding(28.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Авторизация профиля",
                    style = MaterialTheme.typography.headlineMedium,
                    color = TextPrimary
                )

                Text(
                    text = buildString {
                        append("Профиль: $profileName")
                        if (!email.isBlank()) append(" ($email)")
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )

                // If email is missing from profile, show Email input
                if (profileEmail.isNullOrBlank()) {
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        placeholder = { Text("Email", color = TextMuted) },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = SurfaceVariantDark,
                            unfocusedContainerColor = SurfaceVariantDark,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary,
                            focusedIndicatorColor = LumiereGold,
                            unfocusedIndicatorColor = SurfaceBorder
                        ),
                        modifier = Modifier
                            .fillMaxWidth(0.9f)
                    )
                }

                // Password input
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = { Text("Введите пароль", color = TextMuted) },
                    singleLine = true,
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            if (password.isNotBlank() && !isLoading) {
                                onSubmit(email, password)
                            }
                        }
                    ),
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "Скрыть пароль" else "Показать пароль",
                                tint = TextSecondary
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
                    modifier = Modifier
                        .fillMaxWidth(0.9f)
                        .focusRequester(passwordFocusRequester)
                )

                AnimatedVisibility(visible = errorMessage != null) {
                    Text(
                        text = errorMessage.orEmpty(),
                        color = ErrorRed,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }

                // Remote D-pad Virtual Keyboard for password/email entry
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
                    modifier = Modifier.fillMaxWidth(0.95f)
                )

                // Action Buttons
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = {
                            if (password.isNotBlank() && !isLoading) {
                                onSubmit(email, password)
                            }
                        },
                        enabled = password.isNotBlank() && !isLoading,
                        colors = ButtonDefaults.colors(
                            containerColor = LumiereGold,
                            contentColor = BackgroundDark,
                            focusedContainerColor = Color.White,
                            focusedContentColor = BackgroundDark
                        ),
                        shape = ButtonDefaults.shape(RoundedCornerShape(10.dp)),
                        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 10.dp)
                    ) {
                        Text(
                            text = if (isLoading) "Проверка..." else "Войти",
                            style = MaterialTheme.typography.labelLarge
                        )
                    }

                    OutlinedButton(
                        onClick = onDismiss,
                        colors = OutlinedButtonDefaults.colors(
                            focusedContainerColor = Color(0x22FFFFFF),
                            focusedContentColor = TextPrimary
                        ),
                        shape = OutlinedButtonDefaults.shape(RoundedCornerShape(10.dp)),
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 10.dp)
                    ) {
                        Text("Отмена", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}
