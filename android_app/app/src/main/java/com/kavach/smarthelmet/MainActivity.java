package com.kavach.smarthelmet;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Kavach Smart Helmet — Android Native Application
 * Provides real-time NEO-M8N GNSS tracking, Bluetooth Helmet Telemetry Link,
 * speedometer HUD, and rider safety services.
 */
public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQUEST_CODE = 1001;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String TARGET_DEVICE_NAME = "KAVACH_HELMET_01";

    private WebView webView;
    private LocationManager neoM8nGpsLocationManager;
    private LocationListener neoM8nGpsListener;

    // Bluetooth Hardware Link
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothSocket bluetoothSocket;
    private OutputStream bluetoothOutputStream;
    private Thread bluetoothWorkerThread;
    private volatile boolean isBtConnected = false;
    private volatile boolean isBtRunning = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Keep screen awake while on motorcycle helmet mount
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = findViewById(R.id.webView);
        configureWebView();

        checkPermissionsAndStart();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Expose native Bluetooth and System controls to web dashboard
        webView.addJavascriptInterface(new WebAppInterface(), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                // Automatically grant NEO-M8N GNSS location access inside app
                callback.invoke(origin, true, false);
            }
        });

        // Load bundled standalone offline app from assets
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void checkPermissionsAndStart() {
        List<String> neededPermissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            neededPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
            neededPermissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.BLUETOOTH_SCAN);
            }
        }

        if (!neededPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, neededPermissions.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        } else {
            startNeoM8nGpsService();
            autoConnectBluetooth();
        }
    }

    @SuppressLint("MissingPermission")
    private void startNeoM8nGpsService() {
        try {
            neoM8nGpsLocationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (neoM8nGpsLocationManager != null) {
                neoM8nGpsListener = new LocationListener() {
                    @Override
                    public void onLocationChanged(@NonNull Location location) {
                        double lat = location.getLatitude();
                        double lng = location.getLongitude();
                        float speedKmh = location.hasSpeed() ? (location.getSpeed() * 3.6f) : 0f;
                        float bearing = location.hasBearing() ? location.getBearing() : 0f;
                        double alt = location.hasAltitude() ? location.getAltitude() : 0.0;
                        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 2.5f;

                        // Send location fix to frontend
                        String jsCall = String.format(
                                "javascript:if(window.handleNativeNeoM8nFix){window.handleNativeNeoM8nFix(%f, %f, %f, %f, %f, %f);}",
                                lat, lng, speedKmh, bearing, alt, accuracy
                        );
                        webView.post(() -> webView.evaluateJavascript(jsCall, null));
                    }

                    @Override
                    public void onProviderEnabled(@NonNull String provider) {}

                    @Override
                    public void onProviderDisabled(@NonNull String provider) {}
                };

                // Request high-precision location updates from GPS provider
                if (neoM8nGpsLocationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    neoM8nGpsLocationManager.requestLocationUpdates(
                            LocationManager.GPS_PROVIDER,
                            1000L,
                            1.0f,
                            neoM8nGpsListener
                    );
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // ==============================================================================
    // 📶 BLUETOOTH SERIAL TELEMETRY CLIENT (ESP32 <-> Android Native Link)
    // ==============================================================================
    @SuppressLint("MissingPermission")
    public synchronized void autoConnectBluetooth() {
        if (isBtConnected) return;

        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            dispatchBtStatusToWeb(false, "Bluetooth Disabled on Phone");
            return;
        }

        Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
        BluetoothDevice targetDevice = null;

        if (pairedDevices != null) {
            for (BluetoothDevice device : pairedDevices) {
                String name = device.getName();
                if (name != null && (name.contains("KAVACH") || name.contains("HELMET") || name.equalsIgnoreCase(TARGET_DEVICE_NAME))) {
                    targetDevice = device;
                    break;
                }
            }
        }

        if (targetDevice != null) {
            connectToBluetoothDevice(targetDevice);
        } else {
            dispatchBtStatusToWeb(false, "KAVACH_HELMET_01 not paired yet");
        }
    }

    @SuppressLint("MissingPermission")
    private void connectToBluetoothDevice(BluetoothDevice device) {
        disconnectBluetooth();

        dispatchBtStatusToWeb(false, "Connecting to " + device.getName() + "...");

        new Thread(() -> {
            try {
                BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                bluetoothAdapter.cancelDiscovery();
                socket.connect();

                bluetoothSocket = socket;
                bluetoothOutputStream = socket.getOutputStream();
                isBtConnected = true;
                isBtRunning = true;

                dispatchBtStatusToWeb(true, "Connected to " + device.getName());

                // Start reader thread
                InputStream inputStream = socket.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream));

                String line;
                while (isBtRunning && (line = reader.readLine()) != null) {
                    final String telemetryJson = line.trim();
                    if (!telemetryJson.isEmpty() && telemetryJson.startsWith("{")) {
                        dispatchTelemetryToWeb(telemetryJson);
                    }
                }
            } catch (Exception e) {
                isBtConnected = false;
                dispatchBtStatusToWeb(false, "Disconnected: " + e.getMessage());
            } finally {
                disconnectBluetooth();
            }
        }).start();
    }

    public synchronized void disconnectBluetooth() {
        isBtRunning = false;
        isBtConnected = false;
        try {
            if (bluetoothOutputStream != null) {
                bluetoothOutputStream.close();
                bluetoothOutputStream = null;
            }
            if (bluetoothSocket != null) {
                bluetoothSocket.close();
                bluetoothSocket = null;
            }
        } catch (Exception ignored) {}
    }

    public synchronized void sendBluetoothCommand(String commandJson) {
        if (!isBtConnected || bluetoothOutputStream == null) return;
        try {
            bluetoothOutputStream.write((commandJson + "\n").getBytes());
            bluetoothOutputStream.flush();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void dispatchBtStatusToWeb(boolean connected, String message) {
        runOnUiThread(() -> {
            String safeMsg = message.replace("'", "\\'");
            String js = String.format("javascript:if(window.handleNativeHelmetBluetoothStatus){window.handleNativeHelmetBluetoothStatus(%b, '%s');}", connected, safeMsg);
            webView.evaluateJavascript(js, null);
        });
    }

    private void dispatchTelemetryToWeb(String jsonPayload) {
        runOnUiThread(() -> {
            String safeJson = jsonPayload.replace("\\", "\\\\").replace("'", "\\'");
            String js = String.format("javascript:if(window.handleNativeHelmetBluetoothData){window.handleNativeHelmetBluetoothData('%s');}", safeJson);
            webView.evaluateJavascript(js, null);
        });
    }

    /**
     * JavaScript Interface Bridge exposed to WebView
     */
    public class WebAppInterface {
        @JavascriptInterface
        public void connectBluetooth() {
            runOnUiThread(MainActivity.this::autoConnectBluetooth);
        }

        @JavascriptInterface
        public void disconnectBluetooth() {
            runOnUiThread(MainActivity.this::disconnectBluetooth);
        }

        @JavascriptInterface
        public boolean isBluetoothConnected() {
            return isBtConnected;
        }

        @JavascriptInterface
        public void sendCommandToHelmet(String commandJson) {
            sendBluetoothCommand(commandJson);
        }

        @JavascriptInterface
        public void sendEmergencySms(String phone, String mapsUrl, double lat, double lng, float gForce, float tilt) {
            runOnUiThread(() -> {
                String targetPhone = (phone != null && !phone.trim().isEmpty()) ? phone.trim() : "112";
                String msg = String.format(java.util.Locale.US,
                        "EMERGENCY CRASH ALERT: Kavach Smart Helmet impact detected (%.1fg, %.0f° tilt). Location: %s",
                        gForce, tilt, mapsUrl);
                try {
                    android.telephony.SmsManager smsManager;
                    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                        smsManager = getSystemService(android.telephony.SmsManager.class);
                    } else {
                        smsManager = android.telephony.SmsManager.getDefault();
                    }
                    if (smsManager != null) {
                        smsManager.sendTextMessage(targetPhone, null, msg, null, null);
                        Toast.makeText(MainActivity.this, "Crash SOS SMS sent to emergency contact!", Toast.LENGTH_LONG).show();
                    }
                } catch (Exception e) {
                    try {
                        android.content.Intent smsIntent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
                        smsIntent.setData(android.net.Uri.parse("sms:" + targetPhone));
                        smsIntent.putExtra("sms_body", msg);
                        smsIntent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(smsIntent);
                    } catch (Exception ignored) {}
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                startNeoM8nGpsService();
                autoConnectBluetooth();
                webView.reload();
            } else {
                Toast.makeText(this, "Permissions are required for GPS & Helmet Bluetooth connectivity.", Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        disconnectBluetooth();
        if (neoM8nGpsLocationManager != null && neoM8nGpsListener != null) {
            neoM8nGpsLocationManager.removeUpdates(neoM8nGpsListener);
        }
    }
}
