package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.SpaceBar
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import com.lumiere.tv.theme.*

enum class KeyboardLayout {
    RUSSIAN,
    ENGLISH,
    SYMBOLS
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvVirtualKeyboard(
    onChar: (Char) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onSpace: () -> Unit,
    modifier: Modifier = Modifier,
    firstKeyFocusRequester: FocusRequester? = null
) {
    var layout by remember { mutableStateOf(KeyboardLayout.ENGLISH) }
    var isUpperCase by remember { mutableStateOf(false) }

    val digits = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0")

    val russianRows = listOf(
        listOf("й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х"),
        listOf("ф", "ы", "в", "а", "п", "р", "о", "л", "д", "ж", "э"),
        listOf("я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "ъ", "ё")
    )

    val englishRows = listOf(
        listOf("q", "w", "e", "r", "t", "y", "u", "i", "o", "p"),
        listOf("a", "s", "d", "f", "g", "h", "j", "k", "l"),
        listOf("z", "x", "c", "v", "b", "n", "m")
    )

    val symbolsRows = listOf(
        listOf("@", ".", "_", "-", "/", ":", "+", "=", "?", "!"),
        listOf("#", "$", "%", "&", "*", "(", ")", "[", "]", "^"),
        listOf("~", "<", ">", ",", ";", "\"", "'", "\\", "|", "{", "}")
    )

    val actionShape = RoundedCornerShape(8.dp)

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceDark)
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Digits Row
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            digits.forEachIndexed { index, digit ->
                KeyButton(
                    text = digit,
                    onClick = { onChar(digit[0]) },
                    modifier = Modifier
                        .size(width = 38.dp, height = 36.dp)
                        .then(
                            if (index == 0 && firstKeyFocusRequester != null) {
                                Modifier.focusRequester(firstKeyFocusRequester)
                            } else Modifier
                        )
                )
            }
        }

        // Letter / Symbol Rows
        val currentRows = when (layout) {
            KeyboardLayout.RUSSIAN -> russianRows
            KeyboardLayout.ENGLISH -> englishRows
            KeyboardLayout.SYMBOLS -> symbolsRows
        }

        currentRows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                row.forEach { rawChar ->
                    val displayChar = if (layout != KeyboardLayout.SYMBOLS && isUpperCase) {
                        rawChar.uppercase()
                    } else {
                        rawChar
                    }
                    KeyButton(
                        text = displayChar,
                        onClick = { onChar(displayChar[0]) },
                        modifier = Modifier.size(width = if (currentRows == russianRows) 35.dp else 38.dp, height = 36.dp)
                    )
                }
            }
        }

        // Action Keys Row
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Shift / Caps Key
            if (layout != KeyboardLayout.SYMBOLS) {
                Button(
                    onClick = { isUpperCase = !isUpperCase },
                    scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                    colors = ButtonDefaults.colors(
                        containerColor = if (isUpperCase) LumiereGold else SurfaceVariantDark,
                        contentColor = if (isUpperCase) BackgroundDark else TextPrimary,
                        focusedContainerColor = LumiereGold,
                        focusedContentColor = BackgroundDark
                    ),
                    border = ButtonDefaults.border(
                        focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape),
                        border = Border.None
                    ),
                    shape = ButtonDefaults.shape(actionShape),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Icon(Icons.Default.ArrowUpward, contentDescription = "Shift", modifier = Modifier.size(15.dp))
                }
            }

            // Language Switch
            Button(
                onClick = {
                    layout = when (layout) {
                        KeyboardLayout.RUSSIAN -> KeyboardLayout.ENGLISH
                        KeyboardLayout.ENGLISH -> KeyboardLayout.RUSSIAN
                        KeyboardLayout.SYMBOLS -> KeyboardLayout.ENGLISH
                    }
                },
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(actionShape),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.Language, contentDescription = null, modifier = Modifier.size(15.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(if (layout == KeyboardLayout.RUSSIAN) "RU" else "EN", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            // 123 / ?!= Symbols Toggle
            Button(
                onClick = {
                    layout = if (layout == KeyboardLayout.SYMBOLS) KeyboardLayout.ENGLISH else KeyboardLayout.SYMBOLS
                },
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                colors = ButtonDefaults.colors(
                    containerColor = if (layout == KeyboardLayout.SYMBOLS) LumiereGold else SurfaceVariantDark,
                    contentColor = if (layout == KeyboardLayout.SYMBOLS) BackgroundDark else TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(actionShape),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text(if (layout == KeyboardLayout.SYMBOLS) "ABC" else "?!#", fontSize = 11.sp, fontWeight = FontWeight.Bold)
            }

            // Space
            Button(
                onClick = onSpace,
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(actionShape),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.SpaceBar, contentDescription = null, modifier = Modifier.size(15.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Пробел", fontSize = 11.sp)
            }

            // Backspace
            Button(
                onClick = onBackspace,
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(actionShape),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.Backspace, contentDescription = "Удалить", modifier = Modifier.size(15.dp))
            }

            // Clear
            Button(
                onClick = onClear,
                scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextSecondary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                border = ButtonDefaults.border(
                    focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = actionShape),
                    border = Border.None
                ),
                shape = ButtonDefaults.shape(actionShape),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text("Сброс", fontSize = 11.sp)
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun KeyButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val keyShape = RoundedCornerShape(8.dp)
    Button(
        onClick = onClick,
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
        contentPadding = PaddingValues(0.dp),
        modifier = modifier
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = text, fontSize = 13.sp, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
        }
    }
}
