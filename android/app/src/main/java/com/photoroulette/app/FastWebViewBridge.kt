package com.photoroulette.app

import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray

class FastWebViewBridge(
    private val webView: WebView,
    private val pipeline: FastMediaPipeline,
    private val scope: CoroutineScope
) {

    @JavascriptInterface
    fun requestFast20Photos() {
        scope.launch(Dispatchers.IO) {
            val items = pipeline.fetchStratifiedMedia(20)
            val jsonArray = pipeline.toJSONArray(items)
            dispatchJsonToWebView(jsonArray)
        }
    }

    fun dispatchDirectToWebView(items: List<FastMediaItem>) {
        val jsonArray = pipeline.toJSONArray(items)
        dispatchJsonToWebView(jsonArray)
    }

    private fun dispatchJsonToWebView(jsonArray: JSONArray) {
        val js = "window.onNativeMediaReady && window.onNativeMediaReady(${jsonArray});"
        webView.post {
            webView.evaluateJavascript(js, null)
        }
    }
}

@CapacitorPlugin(name = "NativeGallery")
class FastNativeGalleryPlugin : Plugin() {

    private val pipeline by lazy { FastMediaPipeline(context) }
    private val scope = CoroutineScope(Dispatchers.Main)

    @PluginMethod
    fun pickRandom20(call: PluginCall) {
        scope.launch {
            try {
                val mediaList = pipeline.fetchStratifiedMedia(20)
                val response = JSObject()
                response.put("medias", pipeline.toJSArray(mediaList))
                call.resolve(response)
            } catch (e: Exception) {
                call.reject(e.localizedMessage ?: "Failed to pick media")
            }
        }
    }

    @PluginMethod
    fun reroll(call: PluginCall) {
        pickRandom20(call)
    }
}
