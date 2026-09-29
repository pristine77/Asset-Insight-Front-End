package expo.modules.auctioncamera.viewextensions

import android.content.Context
import android.net.Uri
import android.util.Log
import expo.modules.auctioncamera.ui.camera.AppGson
import com.google.gson.reflect.TypeToken
import java.io.File
import expo.modules.auctioncamera.CaptureJournal

class LotRepository private constructor(private val context: Context) {

    private val completedLots = mutableListOf<LotPayload>()
    private var activeBuilder: LotBuilder? = null
    private var activeLotNumberForSession: Int = 1
    private var captureIdentity: org.json.JSONObject? = null
    private var journalFailure: Exception? = null

    fun configureCapture(payload: String?) {
        val requested = try { org.json.JSONObject(payload ?: "{}").optJSONObject("captureContext") } catch (_: Exception) { null }
        // Never inherit the singleton's photos from a different owner/form.
        completedLots.clear()
        activeBuilder = null
        journalFailure = null
        captureIdentity = requested?.let {
            require(it.optString("ownerId").isNotBlank() && it.optString("draftId").isNotBlank() && it.optString("sessionId").isNotBlank())
            val pending = CaptureJournal.read(context, it.getString("ownerId"), it.getString("draftId"))
            pending ?: it
        }
    }

    fun hasPendingJournal(): Boolean = captureIdentity?.let {
        CaptureJournal.read(context, it.getString("ownerId"), it.getString("draftId")) != null
    } ?: false

    fun exportCapture(): String {
        val identity = captureIdentity ?: return LotJsonSerializer.serialize(getAllLots())
        saveSessionWithActiveSync(activeLotNumberForSession)
        journalFailure?.let { throw it }
        return CaptureJournal.read(context, identity.getString("ownerId"), identity.getString("draftId"))!!.toString()
    }

    private val ioExecutor = java.util.concurrent.Executors.newSingleThreadExecutor()

    private val cacheFile: File
        get() = File(context.cacheDir, SESSION_FILE)

    companion object {
        private const val TAG          = "LotRepository"
        private const val SESSION_FILE = "lot_session.json"

        @Volatile
        private var INSTANCE: LotRepository? = null

        fun getInstance(context: Context): LotRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: LotRepository(context.applicationContext).also { INSTANCE = it }
            }
        }
    }

    fun startNewLot(mode: LotMode): LotBuilder {
        activeBuilder = LotBuilder(context, mode)
        Log.d(TAG, "New lot started — mode=${mode.apiKey} id=${activeBuilder!!.lotId}")
        saveAsync()
        return activeBuilder!!
    }

    fun addPrimaryPhoto(
        uri:      Uri,
        mode:     LotMode   = LotMode.SINGLE_LOT,
        focusBox: FocusBox? = null
    ) {
        val builder = activeBuilder ?: startNewLot(mode)
        builder.addPrimaryPhoto(uri, focusBox)
        saveAsync()
    }

    fun addExtraPhoto(
        uri:      Uri,
        mode:     LotMode   = LotMode.SINGLE_LOT
    ) {
        val builder = activeBuilder ?: startNewLot(mode)
        builder.addExtraPhoto(uri)
        saveAsync()
    }

    fun setVideo(uri: Uri) {
        activeBuilder?.setVideo(uri)
        saveAsync()
    }

    fun isCapturePersisted(): Boolean = captureIdentity != null && journalFailure == null

    fun removeFileFromActiveLot(uri: Uri): Boolean {
        return activeBuilder?.removeFile(uri) ?: false
    }

    fun replaceUriInCompletedLots(oldUri: Uri, newUri: Uri, w: Int = 0, h: Int = 0): Boolean {
        val uriStr = oldUri.toString()
        var updated = false

        for (i in completedLots.indices) {
            val lot = completedLots[i]
            var newFiles = lot.files
            var newExtras = lot.extraFiles

            val primaryIndex = lot.files.indexOfFirst { it.uri == uriStr }
            if (primaryIndex != -1) {
                val mutableFiles = lot.files.toMutableList()
                val (finalW, finalH) = if (w > 0 && h > 0) Pair(w, h) else LotBuilder.resolveDimensions(context, newUri)
                val mp = if (finalW > 0 && finalH > 0) "%.1f".format((finalW * finalH).toFloat() / 1_000_000f).toDouble() else 0.0
                mutableFiles[primaryIndex] = mutableFiles[primaryIndex].copy(
                    uri = newUri.toString(),
                    width = finalW,
                    height = finalH,
                    megapixels = mp,
                    sourceUri = mutableFiles[primaryIndex].sourceUri ?: uriStr,
                    cacheUri = mutableFiles[primaryIndex].cacheUri ?: uriStr,
                    originalUri = mutableFiles[primaryIndex].originalUri ?: uriStr,
                    displayUri = newUri.toString()
                )
                newFiles = mutableFiles
                updated = true
            }

            val extraIndex = lot.extraFiles.indexOfFirst { it.uri == uriStr }
            if (extraIndex != -1) {
                val mutableExtras = lot.extraFiles.toMutableList()
                val (finalW, finalH) = if (w > 0 && h > 0) Pair(w, h) else LotBuilder.resolveDimensions(context, newUri)
                val mp = if (finalW > 0 && finalH > 0) "%.1f".format((finalW * finalH).toFloat() / 1_000_000f).toDouble() else 0.0
                mutableExtras[extraIndex] = mutableExtras[extraIndex].copy(
                    uri = newUri.toString(),
                    width = finalW,
                    height = finalH,
                    megapixels = mp,
                    sourceUri = mutableExtras[extraIndex].sourceUri ?: uriStr,
                    cacheUri = mutableExtras[extraIndex].cacheUri ?: uriStr,
                    originalUri = mutableExtras[extraIndex].originalUri ?: uriStr,
                    displayUri = newUri.toString()
                )
                newExtras = mutableExtras
                updated = true
            }

            if (updated) {
                completedLots[i] = lot.copy(files = newFiles, extraFiles = newExtras)
            }
        }

        if (updated) saveAsync()
        return updated
    }

    fun removeFileFromCompletedLots(uri: Uri): Boolean {
        val uriStr = uri.toString()
        var anyRemoved = false

        val iterator = completedLots.listIterator()
        while (iterator.hasNext()) {
            val lot = iterator.next()
            val hasVideo   = lot.videoFile?.uri == uriStr
            val hasPrimary = lot.files.any      { it.uri == uriStr }
            val hasExtra   = lot.extraFiles.any { it.uri == uriStr }

            if (hasVideo || hasPrimary || hasExtra) {
                val newFiles = lot.files.filterNot      { it.uri == uriStr }
                val newExtra = lot.extraFiles.filterNot { it.uri == uriStr }
                val newVideo = if (hasVideo) null else lot.videoFile

                if (newFiles.isEmpty() && newExtra.isEmpty() && newVideo == null) {
                    iterator.remove()
                } else {
                    iterator.set(
                        lot.copy(
                            files      = newFiles,
                            extraFiles = newExtra,
                            videoFile  = newVideo
                        )
                    )
                }
                anyRemoved = true
            }
        }
        if (anyRemoved) saveAsync()
        return anyRemoved
    }

    fun finaliseCurrentLot(lotNumber: Int = 1): LotPayload? {
        activeLotNumberForSession = lotNumber.coerceAtLeast(1)
        val payload = activeBuilder?.build()?.copy(lotNumber = lotNumber) ?: return null
        
        // Replace existing lot with same unique ID if present (supports appending/editing)
        val existingIndex = completedLots.indexOfFirst { it.id == payload.id }
        if (existingIndex != -1) {
            completedLots[existingIndex] = payload
        } else {
            completedLots.add(payload)
        }

        activeBuilder = null
        saveAsync()
        Log.d(
            TAG,
            "Lot finalised: ${payload.id} lotNumber=$lotNumber " +
                    "— ${payload.files.size} files, mode=${payload.mode?.apiKey}"
        )
        return payload
    }

    fun cancelCurrentLot() {
        activeBuilder = null
        Log.d(TAG, "Active lot cancelled")
    }

    fun prepareLotForEditing(lotNumber: Int, fallbackMode: LotMode = LotMode.SINGLE_LOT) {
        activeLotNumberForSession = lotNumber.coerceAtLeast(1)
        val existing = completedLots.find { it.lotNumber == lotNumber }
        if (existing != null) {
            activeBuilder = LotBuilder(context, existing)
            Log.d(TAG, "prepareLotForEditing: loaded lot $lotNumber (${existing.id}) into activeBuilder")
        } else {
            activeBuilder = LotBuilder(context, fallbackMode)
            Log.d(TAG, "prepareLotForEditing: lot $lotNumber not found, starting fresh builder")
        }
    }

    fun getAllLots(): List<LotPayload>   = completedLots.toList()
    fun getActiveBuilder(): LotBuilder? = activeBuilder
    val completedLotCount: Int          get() = completedLots.size

    fun toJson(): String = AppGson.instance.toJson(completedLots)

    private fun saveAsync() {
        if (captureIdentity != null) {
            // The UI may leave or the process may die immediately after a capture callback.
            // Commit metadata atomically before reporting that capture as safely saved.
            saveSessionWithActiveSync(activeLotNumberForSession)
            return
        }
        val json = buildSessionJson(activeLotNumberForSession)
        ioExecutor.execute {
            try {
                cacheFile.writeText(json)
                Log.d(TAG, "Session saved — ${completedLots.size} lots, ${cacheFile.length() / 1024}KB")
            } catch (e: Exception) {
                Log.e(TAG, "Session save failed: ${e.message}")
            }
        }
    }

    fun saveSessionWithActiveSync(lotNumber: Int) {
        activeLotNumberForSession = lotNumber.coerceAtLeast(1)
        captureIdentity?.let { identity ->
            val current = completedLots.toMutableList()
            activeBuilder?.build()?.copy(lotNumber = activeLotNumberForSession)?.let { active ->
                val index = current.indexOfFirst { it.id == active.id }
                if (index >= 0) current[index] = active else current.add(active)
            }
            try {
                CaptureJournal.save(context, identity, org.json.JSONObject(buildSessionJson(activeLotNumberForSession)),
                    org.json.JSONArray(LotJsonSerializer.serialize(current)))
                journalFailure = null
            } catch (error: Exception) {
                journalFailure = error
                Log.e(TAG, "Camera draft metadata could not be saved", error)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    android.widget.Toast.makeText(context, "Draft could not be saved. Keep the camera open, free storage, then tap Done again.", android.widget.Toast.LENGTH_LONG).show()
                }
            }
            return
        }
        try {
            cacheFile.writeText(buildSessionJson(activeLotNumberForSession))
            Log.d(TAG, "Session saved sync: lots=${completedLots.size}, active=${activeBuilder != null}, kb=${cacheFile.length() / 1024}")
        } catch (e: Exception) {
            Log.e(TAG, "Session sync save failed: ${e.message}")
        }
    }

    private fun buildSessionJson(activeLotNumber: Int): String {
        val root = org.json.JSONObject()
        root.put("version", 2)
        root.put("activeLotNumber", activeLotNumber.coerceAtLeast(1))
        root.put("completedLots", org.json.JSONArray(AppGson.instance.toJson(completedLots)))
        activeBuilder?.build()?.copy(lotNumber = activeLotNumber.coerceAtLeast(1))?.let { activeLot ->
            root.put("activeLot", org.json.JSONObject(AppGson.instance.toJson(activeLot)))
        }
        return root.toString()
    }

    fun restoreSessionFromCache(): Int? {
        if (captureIdentity == null && !cacheFile.exists()) return null

        return try {
            val identity = captureIdentity
            val raw = if (identity != null) CaptureJournal.read(context, identity.getString("ownerId"), identity.getString("draftId"))
                ?.getJSONObject("session")?.toString() ?: return null else cacheFile.readText()
            if (raw.isBlank()) return null

            val typeList = object : TypeToken<List<LotPayload>>() {}.type
            val trimmed = raw.trim()

            if (trimmed.startsWith("[")) {
                val lots: List<LotPayload> = AppGson.instance.fromJson(trimmed, typeList)
                completedLots.clear()
                completedLots.addAll(lots)
                activeBuilder = null
                activeLotNumberForSession = lots.lastOrNull()?.lotNumber?.takeIf { it > 0 } ?: 1
                Log.d(TAG, "Legacy session restored: lots=${completedLots.size}")
                activeLotNumberForSession
            } else {
                val root = org.json.JSONObject(trimmed)
                val activeLotNumber = root.optInt("activeLotNumber", 1).coerceAtLeast(1)
                val lotsJson = root.optJSONArray("completedLots")?.toString() ?: "[]"
                val lots: List<LotPayload> = AppGson.instance.fromJson(lotsJson, typeList)
                completedLots.clear()
                completedLots.addAll(lots)
                activeBuilder = root.optJSONObject("activeLot")?.let { activeJson ->
                    val activeLot: LotPayload = AppGson.instance.fromJson(activeJson.toString(), LotPayload::class.java)
                    LotBuilder(context, activeLot.copy(lotNumber = activeLotNumber))
                }
                activeLotNumberForSession = activeLotNumber
                Log.d(TAG, "Session restored: lots=${completedLots.size}, active=${activeBuilder != null}")
                activeLotNumberForSession
            }
        } catch (e: Exception) {
            Log.e(TAG, "Session restore failed: ${e.message}")
            null
        }
    }

    fun clearAllSync() {
        val lotPhotosDir = File(context.cacheDir, "lot_photos")
        val lotVideosDir = File(context.cacheDir, "lot_videos")
        lotPhotosDir.listFiles()?.forEach { it.delete() }
        lotVideosDir.listFiles()?.forEach { it.delete() }

        clearLotsOnly()
        Log.d(TAG, "clearAllSync — all lots, files and cache cleared")
    }

    fun clearLotsOnly() {
        completedLots.clear()
        activeBuilder = null
        if (captureIdentity != null) {
            // JS acknowledges only after its SQLite draft transaction has committed.
            captureIdentity = null
            return
        }
        try {
            if (cacheFile.exists()) cacheFile.delete()
        } catch (e: Exception) {
            Log.e("LotRepository", "Failed to delete cache: ${e.message}")
        }
        Log.d(TAG, "clearLotsOnly — lot data cleared (files preserved)")
    }

    fun replaceData(json: String): Int {
        return try {
            val typeList = object : TypeToken<List<LotPayload>>() {}.type
            val lots: List<LotPayload> = try {
                // Case 1: Direct JSON array
                AppGson.instance.fromJson(json, typeList)
            } catch (e: Exception) {
                // Case 2: JSON object with "lots" field (common from React Native)
                val obj = org.json.JSONObject(json)
                val lotsArrayString = obj.optString("lots", "[]")
                AppGson.instance.fromJson(lotsArrayString, typeList)
            }

            completedLots.clear()
            completedLots.addAll(lots)
            activeBuilder = null
            activeLotNumberForSession = lots.lastOrNull()?.lotNumber?.takeIf { it > 0 } ?: 1
            saveAsync()
            Log.d(TAG, "Data replaced from JSON: ${lots.size} lots")
            lots.size - 1
        } catch (e: Exception) {
            Log.e(TAG, "Failed to replace data: ${e.message}")
            -1
        }
    }

    fun updateExistingLotMode(lotNum: Int, newMode: LotMode) {
        var updated = false
        for (i in completedLots.indices) {
            if (completedLots[i].lotNumber == lotNum) {
                completedLots[i] = completedLots[i].copy(mode = newMode)
                updated = true
            }
        }
        // If there's an active builder, update its mode too (assuming it's for the current/latest lot)
        activeBuilder?.updateMode(newMode)

        if (updated) saveAsync()
    }
}
