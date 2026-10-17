package com.lumiere.tv.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.*
import com.lumiere.tv.theme.BackgroundDark
import com.lumiere.tv.theme.LumiereGold
import com.lumiere.tv.theme.SurfaceBorder
import com.lumiere.tv.theme.SurfaceDark
import com.lumiere.tv.theme.TextSecondary

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun NetflixPeriodSwitcher(
    selectedPeriod: String, // "week" or "all_time"
    onSelectPeriod: (String) -> Unit,
    modifier: Modifier = Modifier,
    firstButtonFocusRequester: FocusRequester? = null,
    rowFocusRequester: FocusRequester? = null,
    upFocusRequester: FocusRequester? = null
) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .background(SurfaceDark)
            .border(1.dp, SurfaceBorder, RoundedCornerShape(20.dp))
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val isWeek = selectedPeriod == "week"
        val isAllTime = selectedPeriod == "all_time"

        Button(
            onClick = { onSelectPeriod("week") },
            scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
            colors = ButtonDefaults.colors(
                containerColor = if (isWeek) Color(0x33E50914) else Color.Transparent,
                contentColor = if (isWeek) Color(0xFFFF7070) else TextSecondary,
                focusedContainerColor = Color(0xFFE50914),
                focusedContentColor = Color.White
            ),
            border = ButtonDefaults.border(
                focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = RoundedCornerShape(16.dp)),
                border = Border.None
            ),
            shape = ButtonDefaults.shape(RoundedCornerShape(16.dp)),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 5.dp),
            modifier = Modifier
                .then(
                    if (firstButtonFocusRequester != null) {
                        Modifier.focusRequester(firstButtonFocusRequester)
                    } else Modifier
                )
                .then(
                    if (rowFocusRequester != null || upFocusRequester != null) {
                        Modifier.focusProperties {
                            if (rowFocusRequester != null) {
                                down = rowFocusRequester
                            }
                            if (upFocusRequester != null) {
                                up = upFocusRequester
                            }
                        }
                    } else Modifier
                )
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.LocalFireDepartment,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = "На этой неделе",
                    fontSize = 11.sp,
                    fontWeight = if (isWeek) FontWeight.Bold else FontWeight.Normal
                )
            }
        }

        Button(
            onClick = { onSelectPeriod("all_time") },
            scale = ButtonDefaults.scale(scale = 1f, focusedScale = 1.05f),
            colors = ButtonDefaults.colors(
                containerColor = if (isAllTime) Color(0x33E50914) else Color.Transparent,
                contentColor = if (isAllTime) Color(0xFFFF7070) else TextSecondary,
                focusedContainerColor = Color(0xFFE50914),
                focusedContentColor = Color.White
            ),
            border = ButtonDefaults.border(
                focusedBorder = Border(border = BorderStroke(2.dp, Color.White), shape = RoundedCornerShape(16.dp)),
                border = Border.None
            ),
            shape = ButtonDefaults.shape(RoundedCornerShape(16.dp)),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 5.dp),
            modifier = Modifier
                .then(
                    if (rowFocusRequester != null || upFocusRequester != null) {
                        Modifier.focusProperties {
                            if (rowFocusRequester != null) {
                                down = rowFocusRequester
                            }
                            if (upFocusRequester != null) {
                                up = upFocusRequester
                            }
                        }
                    } else Modifier
                )
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.EmojiEvents,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = "За всё время",
                    fontSize = 11.sp,
                    fontWeight = if (isAllTime) FontWeight.Bold else FontWeight.Normal
                )
            }
        }
    }
}
