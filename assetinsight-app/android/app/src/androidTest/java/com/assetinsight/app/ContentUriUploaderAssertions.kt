package com.assetinsight.app

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import expo.modules.auctioncamera.ContentUriUploader
import expo.modules.kotlin.Promise
import java.io.BufferedInputStream
import java.io.ByteArrayInputStream
import java.net.InetAddress
import java.net.Socket
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Collections
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLServerSocket
import javax.net.ssl.TrustManagerFactory

/** Real Android MediaStore -> fixed-length HTTPS stream, using loopback fixtures only. */
object ContentUriUploaderAssertions {
    // Deliberately public TEST-ONLY localhost certificate/key. Never used by the application.
    private const val FIXTURE_P12 = "MIIENAIBAzCCA94GCSqGSIb3DQEHAaCCA88EggPLMIIDxzCCAT4GCSqGSIb3DQEHAaCCAS8EggErMIIBJzCCASMGCyqGSIb3DQEMCgECoIG9MIG6MGYGCSqGSIb3DQEFDTBZMDgGCSqGSIb3DQEFDDArBBQ+AtNYtoi1hV7aKju370oVsYfwggICJxACASAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEEE75u9wJvx1N0Hf/JHKfwBwEUIVbR6CQqdiN7pnv521bLEiDdtTAryqbdDhSWtFJFCbNavw0MNQtfyE1Js6SkMQt8SkaJlStw3OhTMAAzKkB4qI9sbyxciuDKhER9bMpAKYXMVQwLwYJKoZIhvcNAQkUMSIeIABsAG8AbwBwAGIAYQBjAGsALQBmAGkAeAB0AHUAcgBlMCEGCSqGSIb3DQEJFTEUBBJUaW1lIDE3ODk2NzQyNjQ2MTAwggKBBgkqhkiG9w0BBwagggJyMIICbgIBADCCAmcGCSqGSIb3DQEHATBmBgkqhkiG9w0BBQ0wWTA4BgkqhkiG9w0BBQwwKwQULQ72y57mbNmN3YmG+KJ3ynFaD0wCAicQAgEgMAwGCCqGSIb3DQIJBQAwHQYJYIZIAWUDBAEqBBCh10SiG9MvNIRLEbpxJ3M3gIIB8BR6fO9Sj33JuXHTN7KQusfUax1lVMpjv9J40PDBsTazUssyDnvSffzWHWh6ZoKj9NzWgE72ypsABfXFNr7w5tqqy1iuZBuc0pQ+yNT9y4twEcz2mJ3lC6X7mV2EjgkoxcMuyrlBotQwqc7SMvlccqoOYOc40QNVO0V4BwjKgD/TU+Ghneg1v3uLhPpifPMNzlS9geOHmB8iPlXivdK0/9c5TB9Je974yIjtqOFvjftGkcVzxsfiecr8AVrSiCjJL/VZ55xSKArpd4tuvG4JJAKahxPN6SnmMrToKVKtl04LZQDNBx8bIlRofEm/dmamYrwzlxZpW0p7y6xFKjrZoOwOigyUjIh3T1uskGL3y3tJ2f77gTzlUDFA1opWy+LfhgGV+VF7ruxqIP+cpR0UUgAnH2t6KZenEvDjuFBO9xTZcXRAzGZWCDdLj5qTelDYTXyGVswjnFFiUwX+63catCrB8nHZsdnQO1Q+YOWlxiFXnW/bHwKI6XHEXXUGRWZoWY7hJS3TLltVK3Vg1AIGHbrhN4UNueo2JUYoxxdct9xtDf9xke5L4yQlSjQHMfLZfawJ3gXkAxEurfOw9gXGwIxuy/G4cpn+HQvXibqXxOewB6nQg+xdiFjzZLZjVtghs+WfkLoaAJqNcTgoDO2j5z0wTTAxMA0GCWCGSAFlAwQCAQUABCDjUHjws9zZhjNmxO+TBLSoDBxFYiGhRgPkmveH+IgqxwQUV19QvGMCB4pZm5tNzpgrWsar+hECAicQ"
    private val password = "fixture-test".toCharArray()

    private class Outcome : Promise {
        val settled = CountDownLatch(1)
        @Volatile var value: Any? = null
        @Volatile var code: String? = null
        @Volatile var message: String? = null
        override fun resolve(value: Any?) { this.value = value; settled.countDown() }
        override fun reject(code: String, message: String?, cause: Throwable?) {
            this.code = code; this.message = message; settled.countDown()
        }
        fun waitFor() { check(settled.await(15, TimeUnit.SECONDS)) { "Native upload did not settle" } }
        fun success() { waitFor(); check(code == null) { "Unexpected native error: " + code + ": " + message }; check((value as Map<*, *>)["status"] == 200) }
        fun cancelled() { waitFor(); check(code == "E_UPLOAD_CANCELLED") { "Expected native cancellation, got " + code + ": " + message } }
    }

    private data class Receipt(val length: Long, val headers: Map<String, String>) {
        @Volatile var received = 0L
        @Volatile var digest: ByteArray? = null
    }

    private class Loopback(serverContext: SSLContext, private val hold: Boolean = false, private val slow: Boolean = false) : AutoCloseable {
        private val server = serverContext.serverSocketFactory.createServerSocket(0, 8, InetAddress.getByName("127.0.0.1")) as SSLServerSocket
        private val workers = Executors.newCachedThreadPool()
        private val sockets = Collections.newSetFromMap(ConcurrentHashMap<Socket, Boolean>())
        private val active = AtomicInteger()
        val maximum = AtomicInteger()
        val receipts = ConcurrentHashMap<String, Receipt>()
        val release = CountDownLatch(if (hold) 1 else 0)
        val firstFour = CountDownLatch(4)
        val url: String get() = "https://127.0.0.1:" + server.localPort
        init {
            workers.execute {
                while (!server.isClosed) {
                    try {
                        val socket = server.accept()
                        sockets.add(socket)
                        workers.execute { receive(socket) }
                    } catch (_: Exception) { if (!server.isClosed) throw IllegalStateException("Loopback accept failed") }
                }
            }
        }
        private fun receive(socket: Socket) {
            var counted = false
            try {
                socket.soTimeout = 15_000
                val input = BufferedInputStream(socket.getInputStream())
                fun line(): String {
                    val text = StringBuilder()
                    while (text.length < 32768) {
                        val next = input.read()
                        check(next >= 0) { "Truncated request headers" }
                        if (next == 10) return text.toString().trimEnd('\r')
                        text.append(next.toChar())
                    }
                    error("Fixture request headers too large")
                }
                val request = line().split(" ")
                check(request[0] == "PUT") { "Expected PUT" }
                val headers = mutableMapOf<String, String>()
                while (true) {
                    val value = line()
                    if (value.isEmpty()) break
                    val colon = value.indexOf(':')
                    check(colon > 0)
                    headers[value.substring(0, colon).lowercase()] = value.substring(colon + 1).trim()
                }
                val receipt = Receipt(headers["content-length"]!!.toLong(), headers)
                receipts[request[1]] = receipt
                val count = active.incrementAndGet(); counted = true
                maximum.updateAndGet { previous -> maxOf(previous, count) }
                firstFour.countDown()
                check(release.await(10, TimeUnit.SECONDS)) { "Fixture release timed out" }
                val digest = MessageDigest.getInstance("SHA-256")
                val buffer = ByteArray(if (slow) 1024 else 64 * 1024)
                while (receipt.received < receipt.length) {
                    val read = input.read(buffer, 0, minOf(buffer.size.toLong(), receipt.length - receipt.received).toInt())
                    if (read < 0) break
                    digest.update(buffer, 0, read); receipt.received += read
                    if (slow) Thread.sleep(4)
                }
                receipt.digest = digest.digest()
                if (receipt.received == receipt.length) {
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\nX-Fixture: native-loopback\r\n\r\nOK".toByteArray())
                    socket.getOutputStream().flush()
                }
            } catch (_: Exception) {
                // Disconnects are expected in the explicit cancellation cases.
            } finally {
                if (counted) active.decrementAndGet()
                sockets.remove(socket)
                try { socket.close() } catch (_: Exception) {}
            }
        }
        override fun close() {
            release.countDown(); server.close()
            sockets.toList().forEach { try { it.close() } catch (_: Exception) {} }
            workers.shutdownNow()
            workers.awaitTermination(5, TimeUnit.SECONDS)
        }
    }

    private fun createPhoto(context: Context, bytes: ByteArray): Uri {
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "native-upload-qa-" + UUID.randomUUID() + ".jpg")
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AssetInsightUploadQA")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: error("Cannot create fixture photo")
        try {
            context.contentResolver.openOutputStream(uri, "w")!!.use { it.write(bytes) }
            context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            return uri
        } catch (error: Throwable) { context.contentResolver.delete(uri, null, null); throw error }
    }

    @JvmStatic fun run(context: Context) {
        val fixtureKeys = KeyStore.getInstance("PKCS12").apply {
            load(ByteArrayInputStream(Base64.decode(FIXTURE_P12, Base64.DEFAULT)), password)
        }
        val keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(fixtureKeys, password) }
        val trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply { init(fixtureKeys) }
        val serverTls = SSLContext.getInstance("TLS").apply { init(keys.keyManagers, trust.trustManagers, null) }
        val clientTls = SSLContext.getInstance("TLS").apply { init(null, trust.trustManagers, null) }
        val originalFactory = HttpsURLConnection.getDefaultSSLSocketFactory()
        val originals = mutableListOf<Uri>()
        // Process-local fixture trust is restored even on assertion failure; no hostname bypass.
        HttpsURLConnection.setDefaultSSLSocketFactory(clientTls.socketFactory)
        try {
            val bytes = ByteArray(512 * 1024) { index -> (index % 251).toByte() }
            val uri = createPhoto(context, bytes).also { originals.add(it) }
            Loopback(serverTls).use { server ->
                val progress = Collections.synchronizedList(mutableListOf<Pair<Long, Long>>())
                val uploader = ContentUriUploader(context) { _, sent, total -> progress.add(Pair(sent, total)) }
                try {
                    val done = Outcome()
                    uploader.upload("exact", uri.toString(), server.url + "/exact", mapOf("Content-Type" to "image/jpeg"), bytes.size.toLong(), done)
                    done.success()
                    val receipt = server.receipts["/exact"] ?: error("No real HTTPS request received")
                    check(receipt.length == bytes.size.toLong() && receipt.received == bytes.size.toLong())
                    check(receipt.headers["transfer-encoding"] == null) { "Expected fixed-length streaming" }
                    check(receipt.digest!!.contentEquals(MessageDigest.getInstance("SHA-256").digest(bytes))) { "Stream changed photo bytes" }
                    check(progress.isNotEmpty() && progress.last() == Pair(bytes.size.toLong(), bytes.size.toLong()))
                    check(progress.zipWithNext().all { (a, b) -> a.first <= b.first } && progress.all { it.second == bytes.size.toLong() })
                    val changed = Outcome()
                    uploader.upload("changed", uri.toString(), server.url + "/changed", emptyMap(), bytes.size + 1L, changed)
                    changed.waitFor(); check(changed.code == "E_UPLOAD_FAILED")
                    check(!server.receipts.containsKey("/changed")) { "Wrong-sized original reached server" }
                } finally { uploader.close() }
            }
            val bigBytes = ByteArray(8 * 1024 * 1024) { index -> (index % 239).toByte() }
            val bigUri = createPhoto(context, bigBytes).also { originals.add(it) }
            Loopback(serverTls, slow = true).use { server ->
                val firstProgress = CountDownLatch(1)
                val uploader = ContentUriUploader(context) { _, _, _ -> firstProgress.countDown() }
                try {
                    val cancelled = Outcome()
                    uploader.upload("active-cancel", bigUri.toString(), server.url + "/cancel", emptyMap(), bigBytes.size.toLong(), cancelled)
                    check(firstProgress.await(10, TimeUnit.SECONDS)) { "No native stream progress before cancellation" }
                    uploader.cancel("active-cancel")
                    cancelled.cancelled()
                    check((server.receipts["/cancel"]?.received ?: 0L) < bigBytes.size) { "Cancellation did not interrupt streaming" }
                } finally { uploader.close() }
            }
            Loopback(serverTls, hold = true).use { server ->
                val uploader = ContentUriUploader(context) { _, _, _ -> }
                try {
                    val results = List(6) { Outcome() }
                    results.forEachIndexed { index, outcome -> uploader.upload("bounded-" + index, uri.toString(), server.url + "/bounded-" + index, emptyMap(), bytes.size.toLong(), outcome) }
                    check(server.firstFour.await(10, TimeUnit.SECONDS)) { "Four native workers did not start" }
                    Thread.sleep(300)
                    check(server.receipts.size == 4 && server.maximum.get() == 4) { "Native executor exceeded its four-transfer bound" }
                    val duplicate = Outcome()
                    uploader.upload("bounded-0", uri.toString(), server.url + "/duplicate", emptyMap(), bytes.size.toLong(), duplicate)
                    duplicate.waitFor(); check(duplicate.code == "E_UPLOAD_ACTIVE")
                    uploader.cancel("bounded-5")
                    server.release.countDown()
                    results.take(5).forEach { it.success() }; results.last().cancelled()
                    check(server.receipts.size == 5 && !server.receipts.containsKey("/bounded-5"))
                    check(server.maximum.get() <= 4)
                } finally { uploader.close() }
            }
        } finally {
            HttpsURLConnection.setDefaultSSLSocketFactory(originalFactory)
            // Remove exactly the two MediaStore rows created here; no user photos are touched.
            originals.forEach { context.contentResolver.delete(it, null, null) }
        }
    }
}
