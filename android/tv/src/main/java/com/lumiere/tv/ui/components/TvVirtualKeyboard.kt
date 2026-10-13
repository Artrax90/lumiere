package com.lumiere.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.SpaceBar
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import com.lumiere.tv.theme.*

enum class KeyboardLayout {
    RUSSIAN,
    ENGLISH
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun TvVirtualKeyboard(
    onChar: (Char) -> Unit,
    onBackspace: () -> Unit,
    onClear: () -> Unit,
    onSpace: () -> Unit,
    modifier: Modifier = Modifier
) {
    var layout by remember { mutableStateOf(KeyboardLayout.RUSSIAN) }

    val digits = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "0")

    val russianRows = listOf(
        listOf("Й", "Ц", "У", "К", "Е", "Н", "Г", "Ш", "Щ", "З", "Х"),
        listOf("Ф", "Ы", "В", "А", "П", "Р", "О", "Л", "Д", "Ж", "Э"),
        listOf("Я", "Ч", "С", "М", "И", "Т", "Ь", "Б", "Ю", "Ъ", "Ё")
    )

    val englishRows = listOf(
        listOf("Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"),
        listOf("A", "S", "D", "F", "G", "H", "J", "K", "L"),
        listOf("Z", "X", "C", "V", "B", "N", "M")
    )

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceDark)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Digits Row
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            digits.forEach { digit ->
                KeyButton(text = digit, onClick = { onChar(digit[0]) }, modifier = Modifier.size(36.dp))
            }
        }

        // Letter Rows
        val letterRows = if (layout == KeyboardLayout.RUSSIAN) russianRows else englishRows
        letterRows.forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { letter ->
                    KeyButton(text = letter, onClick = { onChar(letter[0]) }, modifier = Modifier.size(36.dp))
                }
            }
        }

        // Action Keys Row
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Language Switch
            Button(
                onClick = {
                    layout = if (layout == KeyboardLayout.RUSSIAN) KeyboardLayout.ENGLISH else KeyboardLayout.RUSSIAN
                },
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.Language, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(if (layout == KeyboardLayout.RUSSIAN) "RU" else "EN", fontSize = 12.sp)
            }

            // Space
            Button(
                onClick = onSpace,
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.SpaceBar, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Пробел", fontSize = 12.sp)
            }

            // Backspace
            Button(
                onClick = onBackspace,
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextPrimary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Default.Backspace, contentDescription = "Удалить", modifier = Modifier.size(16.dp))
            }

            // Clear
            Button(
                onClick = onClear,
                colors = ButtonDefaults.colors(
                    containerColor = SurfaceVariantDark,
                    contentColor = TextSecondary,
                    focusedContainerColor = LumiereGold,
                    focusedContentColor = BackgroundDark
                ),
                shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text("Сброс", fontSize = 12.sp)
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
    Button(
        onClick = onClick,
        colors = ButtonDefaults.colors(
            containerColor = SurfaceVariantDark,
            contentColor = TextPrimary,
            focusedContainerColor = LumiereGold,
            focusedContentColor = BackgroundDark
        ),
        shape = ButtonDefaults.shape(RoundedCornerShape(8.dp)),
        contentPadding = PaddingValues(0.dp),
        modifier = modifier
    ) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(text = text, fontSize = 13.sp, style = MaterialTheme.typography.titleMedium)
        }
    }
}
