package com.photoroulette.app

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Base64
import android.util.Size
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.random.Random

data class FastMediaItem(
    val id: String,
    val type: String,
    val dataUrl: String
)

class FastMediaPipeline(private val context: Context) {

    private val targetBoundingBox = 600
    private val jpegQuality = 35

    suspend fun fetchStratifiedMedia(count: Int = 20): List<FastMediaItem> = withContext(Dispatchers.IO) {
        val resolver = context.contentResolver
        val projection = arrayOf(
            MediaStore.Images.Media._ID,
            MediaStore.Images.Media.DATE_TAKEN
        )
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val sortOrder = "${MediaStore.Images.Media.DATE_TAKEN} DESC"

        val selectedUris = mutableListOf<Pair<Long, Uri>>()

        resolver.query(collection, projection, null, null, sortOrder)?.use { cursor ->
            val totalRows = cursor.count
            if (totalRows > 0) {
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
                val targetCount = minOf(count, totalRows)

                if (totalRows <= targetCount) {
                    while (cursor.moveToNext()) {
                        val id = cursor.getLong(idColumn)
                        val uri = ContentUris.withAppendedId(collection, id)
                        selectedUris.add(Pair(id, uri))
                    }
                } else {
                    val step = totalRows.toDouble() / targetCount.toDouble()
                    val chosenPositions = mutableSetOf<Int>()

                    for (i in 0 until targetCount) {
                        val minPos = (i * step).toInt()
                        val maxPos = (((i + 1) * step) - 1).toInt().coerceAtMost(totalRows - 1)
                        var picked = if (maxPos > minPos) {
                            Random.nextInt(minPos, maxPos + 1)
                        } else {
                            minPos
                        }
                        while (chosenPositions.contains(picked) && picked < totalRows - 1) {
                            picked++
                        }
                        chosenPositions.add(picked)
                        if (cursor.moveToPosition(picked)) {
                            val id = cursor.getLong(idColumn)
                            val uri = ContentUris.withAppendedId(collection, id)
                            selectedUris.add(Pair(id, uri))
                        }
                    }
                }
            }
        }

        selectedUris.shuffle()

        coroutineScope {
            selectedUris.map { (id, uri) ->
                async(Dispatchers.IO) {
                    processSinglePhoto(resolver, id, uri)
                }
            }.awaitAll().filterNotNull()
        }
    }

    private fun processSinglePhoto(resolver: ContentResolver, id: Long, uri: Uri): FastMediaItem? {
        val bitmap = loadDownsampledBitmap(resolver, uri) ?: return null
        val scaled = scaleToBoundingBox(bitmap, targetBoundingBox)
        val stream = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, jpegQuality, stream)
        if (scaled != bitmap) {
            scaled.recycle()
        }
        bitmap.recycle()

        val base64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
        return FastMediaItem(
            id = id.toString(),
            type = "image",
            dataUrl = "data:image/jpeg;base64,$base64"
        )
    }

    private fun loadDownsampledBitmap(resolver: ContentResolver, uri: Uri): Bitmap? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                return resolver.loadThumbnail(uri, Size(targetBoundingBox, targetBoundingBox), null)
            } catch (_: Exception) {}
        }

        var isStream: InputStream? = null
        try {
            isStream = resolver.openInputStream(uri) ?: return null
            val bounds = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeStream(isStream, null, bounds)
            isStream.close()

            var sampleSize = 1
            var w = bounds.outWidth
            var h = bounds.outHeight
            while (w / 2 >= targetBoundingBox && h / 2 >= targetBoundingBox) {
                w /= 2
                h /= 2
                sampleSize *= 2
            }

            val decodeOpts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }

            isStream = resolver.openInputStream(uri) ?: return null
            val rawBitmap = BitmapFactory.decodeStream(isStream, null, decodeOpts) ?: return null
            isStream.close()

            return rotateBitmapIfRequired(resolver, uri, rawBitmap)
        } catch (_: Exception) {
            return null
        } finally {
            try {
                isStream?.close()
            } catch (_: Exception) {}
        }
    }

    private fun scaleToBoundingBox(bitmap: Bitmap, maxDim: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        val longestSide = max(width, height)
        if (longestSide <= maxDim) return bitmap

        val scale = maxDim.toFloat() / longestSide.toFloat()
        val targetWidth = (width * scale).roundToInt().coerceAtLeast(1)
        val targetHeight = (height * scale).roundToInt().coerceAtLeast(1)

        return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
    }

    private fun rotateBitmapIfRequired(resolver: ContentResolver, uri: Uri, bitmap: Bitmap): Bitmap {
        var isStream: InputStream? = null
        try {
            isStream = resolver.openInputStream(uri) ?: return bitmap
            val exif = ExifInterface(isStream)
            val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                else -> return bitmap
            }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated != bitmap) {
                bitmap.recycle()
            }
            return rotated
        } catch (_: Exception) {
            return bitmap
        } finally {
            try {
                isStream?.close()
            } catch (_: Exception) {}
        }
    }

    fun toJSArray(items: List<FastMediaItem>): JSArray {
        val array = JSArray()
        for (item in items) {
            val obj = JSObject()
            obj.put("identifier", item.id)
            obj.put("type", item.type)
            obj.put("data", item.dataUrl)
            array.put(obj)
        }
        return array
    }

    fun toJSONArray(items: List<FastMediaItem>): JSONArray {
        val array = JSONArray()
        for (item in items) {
            val obj = JSONObject()
            obj.put("identifier", item.id)
            obj.put("type", item.type)
            obj.put("data", item.dataUrl)
            array.put(obj)
        }
        return array
    }
}
