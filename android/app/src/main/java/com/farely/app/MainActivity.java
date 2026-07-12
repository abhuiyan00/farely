package com.farely.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the native ⇄ JS bridge so captured offers reach the WebView.
        registerPlugin(FarelyBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
