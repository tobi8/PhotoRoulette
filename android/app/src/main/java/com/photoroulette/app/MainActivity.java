package com.photoroulette.app;

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    public class AndroidBridgeInterface {
        private final NativeGalleryPlugin plugin;

        public AndroidBridgeInterface(NativeGalleryPlugin plugin) {
            this.plugin = plugin;
        }

        @JavascriptInterface
        public void pickRandom20(String roomId, String userId, String uploadUrl) {
            runOnUiThread(() -> {
                WebView webView = getBridge().getWebView();
                webView.evaluateJavascript("window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeGallery ? window.Capacitor.Plugins.NativeGallery.pickRandom20({ room: '" + roomId + "', userId: '" + userId + "', uploadUrl: '" + uploadUrl + "' }).then(function(res){ window.onNativeMediaSuccess && window.onNativeMediaSuccess(res); }).catch(function(err){ window.onNativeMediaError && window.onNativeMediaError(err); }) : null;", null);
            });
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(NativeGalleryPlugin.class);
    }

    @Override
    public void onStart() {
        super.onStart();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new AndroidBridgeInterface(null), "AndroidBridge");
        }
    }
}
