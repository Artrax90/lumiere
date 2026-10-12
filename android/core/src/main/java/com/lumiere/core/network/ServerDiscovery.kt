package com.lumiere.core.network

import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.concurrent.TimeUnit

class ServerDiscovery(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(400, TimeUnit.MILLISECONDS)
        .readTimeout(500, TimeUnit.MILLISECONDS)
        .build()
) {

    data class DiscoveredServer(
        val url: String,
        val host: String,
        val port: Int,
        val name: String = "Lumiere"
    )

    /**
     * Find active Lumiere server on the local subnet by scanning port 3500 (and 3000).
     */
    suspend fun discoverLocalServer(
        onProgress: ((current: Int, total: Int) -> Unit)? = null
    ): DiscoveredServer? = withContext(Dispatchers.IO) {
        val localSubnets = getLocalSubnets()
        if (localSubnets.isEmpty()) return@withContext null

        val ports = listOf(3500, 3000)

        for (subnetPrefix in localSubnets) {
            val totalHosts = 254 * ports.size
            var scanned = 0

            val candidateList = mutableListOf<String>()
            for (port in ports) {
                for (hostNum in 1..254) {
                    candidateList.add("http://$subnetPrefix.$hostNum:$port")
                }
            }

            // Probe in batches of 32 parallel requests
            val chunkSize = 32
            val chunks = candidateList.chunked(chunkSize)

            for (chunk in chunks) {
                val found = chunk.map { url ->
                    async {
                        val isOk = checkHealth(url)
                        if (isOk) url else null
                    }
                }.awaitAll().firstOrNull { it != null }

                scanned += chunk.size
                onProgress?.invoke(scanned.coerceAtMost(totalHosts), totalHosts)

                if (found != null) {
                    val uri = java.net.URI(found)
                    return@withContext DiscoveredServer(
                        url = found,
                        host = uri.host,
                        port = uri.port
                    )
                }
            }
        }

        null
    }

    suspend fun checkHealth(baseUrl: String): Boolean = withContext(Dispatchers.IO) {
        val cleanUrl = baseUrl.trimEnd('/')
        val request = Request.Builder()
            .url("$cleanUrl/api/health")
            .get()
            .build()

        try {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string().orEmpty()
                    body.contains("\"status\":\"ok\"") || body.contains("\"status\": \"ok\"")
                } else {
                    false
                }
            }
        } catch (_: Exception) {
            false
        }
    }

    private fun getLocalSubnets(): List<String> {
        val prefixes = mutableSetOf<String>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return emptyList()
            for (iface in interfaces) {
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.inetAddresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        val hostAddress = addr.hostAddress ?: continue
                        val parts = hostAddress.split(".")
                        if (parts.size == 4) {
                            prefixes.add("${parts[0]}.${parts[1]}.${parts[2]}")
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        // Fallbacks for standard home LAN subnets if network interface inspection failed
        if (prefixes.isEmpty()) {
            prefixes.add("192.168.1")
            prefixes.add("192.168.0")
        }

        return prefixes.toList()
    }
}
