package expo.modules.auctioncamera

import android.content.Context
import android.net.Uri
import expo.modules.kotlin.Promise
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Bounded, exact-length native upload. No JS Blob/base64 and no credential-bearing redirects. */
class ContentUriUploader(private val context: Context, private val progress: (String, Long, Long) -> Unit) {
    private data class Transfer(val cancelled: AtomicBoolean = AtomicBoolean(false), @Volatile var connection: HttpURLConnection? = null)
    private val transfers = ConcurrentHashMap<String, Transfer>()
    private val executor = Executors.newFixedThreadPool(4)

    fun cancel(id: String) { transfers[id]?.let { it.cancelled.set(true); it.connection?.disconnect() } }
    fun close() { transfers.keys.forEach(::cancel); executor.shutdown() }

    fun upload(id: String, uriString: String, urlString: String, headers: Map<String, String>, expectedSize: Long, promise: Promise) {
        val transfer = Transfer()
        if (transfers.putIfAbsent(id, transfer) != null) {
            promise.reject("E_UPLOAD_ACTIVE", "This upload is already active", null); return
        }
        executor.execute {
            try {
                require(expectedSize > 0) { "An exact positive upload length is required" }
                val uri = Uri.parse(uriString)
                require(uri.scheme == "content" && uri.authority == "media") { "Only device media content URIs are supported" }
                val url = URL(urlString)
                require(url.protocol == "https" && url.userInfo == null) { "A secure upload URL is required" }
                if (transfer.cancelled.get()) throw InterruptedException("Upload cancelled")
                context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
                    val actualSize = descriptor.length
                    require(actualSize < 0 || actualSize == expectedSize) { "The photo changed after upload preparation" }
                    val connection = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "PUT"; doOutput = true; instanceFollowRedirects = false
                        connectTimeout = 30_000; readTimeout = 120_000
                        setFixedLengthStreamingMode(expectedSize)
                        headers.forEach { (name, value) ->
                            require(!name.equals("Authorization", true) && !name.equals("Cookie", true) && !name.equals("Host", true)) { "Unsafe upload header" }
                            setRequestProperty(name, value)
                        }
                    }
                    transfer.connection = connection
                    var sent = 0L
                    var lastProgress = 0L
                    descriptor.createInputStream().use { input ->
                        connection.outputStream.use { output ->
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                if (transfer.cancelled.get() || Thread.currentThread().isInterrupted) throw InterruptedException("Upload cancelled")
                                val read = input.read(buffer)
                                if (read < 0) break
                                require(sent + read <= expectedSize) { "The photo exceeds its prepared upload length" }
                                output.write(buffer, 0, read); sent += read
                                val now = android.os.SystemClock.elapsedRealtime()
                                if (now - lastProgress >= 250 || sent == expectedSize) { progress(id, sent, expectedSize); lastProgress = now }
                            }
                        }
                    }
                    require(sent == expectedSize) { "The photo is incomplete" }
                    if (transfer.cancelled.get()) throw InterruptedException("Upload cancelled")
                    val status = connection.responseCode
                    val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                    val body = stream?.use { input ->
                        val bytes = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(1024)
                        while (bytes.size() < 8192) {
                            val read = input.read(buffer, 0, minOf(buffer.size, 8192 - bytes.size()))
                            if (read < 0) break
                            bytes.write(buffer, 0, read)
                        }
                        String(bytes.toByteArray(), Charsets.UTF_8)
                    } ?: ""
                    promise.resolve(mapOf("status" to status, "body" to body, "headers" to connection.headerFields.filterKeys { it != null }.mapValues { it.value.joinToString(",") }))
                } ?: throw IllegalStateException("The original photo is no longer available")
            } catch (error: Exception) {
                promise.reject(if (transfer.cancelled.get() || error is InterruptedException) "E_UPLOAD_CANCELLED" else "E_UPLOAD_FAILED", error.message ?: "Photo upload failed", error)
            } finally { transfer.connection?.disconnect(); transfers.remove(id, transfer) }
        }
    }
}
