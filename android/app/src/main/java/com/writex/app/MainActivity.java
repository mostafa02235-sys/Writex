package com.writex.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import com.writex.app.ai.WritexAIPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WritexAIPlugin.class); // on-device Writex AI (llama.cpp)
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebSettings s = getBridge().getWebView().getSettings();
            // Writex has its own text-size controls; the system font scale would break page layout.
            s.setTextZoom(100);
            // Documents live in the WebView's IndexedDB storage.
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
        }
    }
}
