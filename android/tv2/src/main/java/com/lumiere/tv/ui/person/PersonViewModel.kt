package com.lumiere.tv.ui.person

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lumiere.core.model.PersonDetails
import com.lumiere.core.model.Title
import com.lumiere.core.network.NetworkClient
import com.lumiere.core.storage.AppPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PersonUiState(
    val isLoading: Boolean = true,
    val person: PersonDetails? = null,
    val credits: List<Title> = emptyList(),
    val errorMessage: String? = null
)

class PersonViewModel(
    application: Application,
    private val personId: Long,
    val initialName: String = ""
) : AndroidViewModel(application) {

    private val preferences = AppPreferences(application.applicationContext)
    private var networkClient: NetworkClient? = null

    private val _uiState = MutableStateFlow(PersonUiState())
    val uiState: StateFlow<PersonUiState> = _uiState.asStateFlow()

    init {
        loadPersonDetails()
    }

    fun loadPersonDetails() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            val serverUrl = preferences.serverUrl.first().orEmpty()
            val token = preferences.accessToken.first()
            if (serverUrl.isBlank()) {
                _uiState.update { it.copy(isLoading = false, errorMessage = "Сервер не настроен") }
                return@launch
            }

            networkClient = NetworkClient(
                baseUrlProvider = { serverUrl },
                tokenProvider = { token },
                preferences = preferences
            )
            val api = networkClient!!.createApiService(serverUrl)

            try {
                val details = api.getPersonDetails(personId, "ru")
                val titles = details.credits
                    .map { it.toTitle() }
                    .filter { !it.poster.isNullOrBlank() }
                    .distinctBy { it.id }
                    .sortedWith(
                        compareByDescending<Title> { it.year ?: 0 }
                            .thenByDescending { it.score ?: 0.0 }
                    )

                _uiState.update {
                    it.copy(
                        isLoading = false,
                        person = details,
                        credits = titles
                    )
                }
            } catch (e: Exception) {
                android.util.Log.e("LumiereTV", "Failed to load person $personId: ${e.message}", e)
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "Не удалось загрузить данные: ${e.message}"
                    )
                }
            }
        }
    }

    fun resolveImageUrl(path: String?): String {
        return networkClient?.resolveImageUrl(path) ?: path.orEmpty()
    }
}
